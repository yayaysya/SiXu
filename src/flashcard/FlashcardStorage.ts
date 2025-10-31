import { App, TFile, Notice } from 'obsidian';
import { Flashcard, FlashcardDeck } from './types';
import { SM2Algorithm } from './SM2Algorithm';

/**
 * 闪卡存储管理器
 */
export class FlashcardStorage {
	private app: App;
	private flashcardDir: string;

	constructor(app: App, flashcardDir: string = 'flashcards') {
		this.app = app;
		this.flashcardDir = flashcardDir;
	}

	/**
	 * 确保闪卡目录存在
	 */
	async ensureDirectory(): Promise<void> {
		const dir = this.app.vault.getAbstractFileByPath(this.flashcardDir);
		if (!dir) {
			await this.app.vault.createFolder(this.flashcardDir);
		}
	}

	/**
	 * 加载所有卡组
	 */
	async loadAllDecks(): Promise<FlashcardDeck[]> {
		await this.ensureDirectory();

		const files = this.app.vault.getFiles();
		// 只查找 deck_id_data.md 文件（数据文件）
		const dataFiles = files.filter(f =>
			f.path.startsWith(this.flashcardDir + '/') &&
			f.extension === 'md' &&
			f.basename.startsWith('deck_') &&
			f.basename.endsWith('_data')
		);

		const decks: FlashcardDeck[] = [];
		for (const file of dataFiles) {
			try {
				const content = await this.app.vault.read(file);
				const { deck } = this.parseDataMarkdown(content);
				decks.push(deck);
			} catch (error) {
				console.error(`加载卡组失败: ${file.path}`, error);
			}
		}

		return decks;
	}

	/**
	 * 加载单个卡组及其卡片
	 */
	async loadDeck(deckId: string): Promise<{ deck: FlashcardDeck; cards: Flashcard[] } | null> {
		const contentPath = `${this.flashcardDir}/deck_${deckId}.md`;
		const dataPath = `${this.flashcardDir}/deck_${deckId}_data.md`;
		
		const contentFile = this.app.vault.getAbstractFileByPath(contentPath);
		const dataFile = this.app.vault.getAbstractFileByPath(dataPath);

		if (!(contentFile instanceof TFile) || !(dataFile instanceof TFile)) {
			return null;
		}

		try {
			// 读取并解析内容文件
			const contentText = await this.app.vault.read(contentFile);
			const cardsContent = this.parseDeckMarkdown(contentText);
			
			// 读取并解析数据文件
			const dataText = await this.app.vault.read(dataFile);
			const { deck, cardsData } = this.parseDataMarkdown(dataText);
			
			// 合并卡片内容和数据，添加容错逻辑
			const cards: Flashcard[] = [];
			for (const cardContent of cardsContent) {
				// 容错：如果缺少ID，自动生成
				const cardId = cardContent.id || this.generateId();
				const cardData = cardsData.get(cardId);
				
				// 创建完整的卡片对象，使用默认值填充缺失字段
				const now = Date.now();
				const card: Flashcard = {
					id: cardId,
					question: cardContent.question || '',
					answer: cardContent.answer || '',
					sourceNote: cardContent.sourceNote || '',
					sourceSection: cardContent.sourceSection || '',
					sourceLineStart: cardContent.sourceLineStart,
					sourceLineEnd: cardContent.sourceLineEnd,
					tags: cardContent.tags || [],
					createdAt: cardData?.createdAt || now,
					updatedAt: cardData?.updatedAt || now,
					learning: cardData?.learning || {
						easeFactor: 2.5,
						interval: 0,
						repetitions: 0,
						nextReview: now,
						status: 'new'
					},
					reviewHistory: cardData?.reviewHistory || []
				};
				
				// 验证必需字段
				if (!card.question || !card.answer) {
					console.warn(`卡片 ${cardId} 缺少必需字段，已跳过`);
					continue;
				}
				
				cards.push(card);
			}
			
			// 验证卡组数据完整性
			if (!deck.id || !deck.name) {
				throw new Error('卡组数据不完整：缺少ID或名称');
			}
			
			// 更新卡组的 cardIds，确保与实际加载的卡片一致
			deck.cardIds = cards.map(c => c.id);
			
			return { deck, cards };
		} catch (error) {
			console.error('加载卡组失败:', error);
			return null;
		}
	}

	/**
	 * 保存卡组和卡片
	 */
	/**
	 * 生成卡组内容 Markdown 文件
	 * 包含卡片的问答内容，便于用户直接编辑
	 */
	private generateDeckMarkdown(deck: FlashcardDeck, cards: Flashcard[]): string {
		let content = `# ${deck.name}\n\n`;
		content += `> 卡组ID: ${deck.id}\n`;
		content += `> 总卡片数: ${cards.length}\n`;
		content += `> 最后更新: ${new Date(deck.updatedAt).toLocaleString('zh-CN')}\n\n`;
		content += `---\n\n`;

		for (const card of cards) {
			content += `## Card: ${card.id}\n\n`;
			content += `**Question:**\n${card.question}\n\n`;
			content += `**Answer:**\n${card.answer}\n\n`;
			
			if (card.tags.length > 0) {
				content += `**Tags:** ${card.tags.join(', ')}\n`;
			}
			
			content += `**Source:** ${card.sourceNote}`;
			if (card.sourceSection) {
				content += ` > ${card.sourceSection}`;
			}
			if (card.sourceLineStart !== undefined && card.sourceLineEnd !== undefined) {
				content += ` (L${card.sourceLineStart}-${card.sourceLineEnd})`;
			}
			content += `\n\n`;
			content += `---\n\n`;
		}

		return content;
	}

	/**
	 * 生成卡组数据 Markdown 文件
	 * 包含学习状态、统计数据等，采用 YAML frontmatter 格式
	 */
	private generateDataMarkdown(deck: FlashcardDeck, cards: Flashcard[]): string {
		// 构建 YAML frontmatter
		let content = '---\n';
		content += `deck:\n`;
		content += `  id: "${deck.id}"\n`;
		content += `  name: "${deck.name}"\n`;
		content += `  sourceNotes:\n`;
		for (const note of deck.sourceNotes) {
			content += `    - "${note}"\n`;
		}
		content += `  cardIds:\n`;
		for (const id of deck.cardIds) {
			content += `    - "${id}"\n`;
		}
		content += `  createdAt: ${deck.createdAt}\n`;
		content += `  updatedAt: ${deck.updatedAt}\n`;
		content += `  settings:\n`;
		content += `    newCardsPerDay: ${deck.settings.newCardsPerDay}\n`;
		content += `    reviewCardsPerDay: ${deck.settings.reviewCardsPerDay}\n`;
		content += `  stats:\n`;
		content += `    total: ${deck.stats.total}\n`;
		content += `    new: ${deck.stats.new}\n`;
		content += `    learning: ${deck.stats.learning}\n`;
		content += `    review: ${deck.stats.review}\n`;
		content += `    mastered: ${deck.stats.mastered}\n`;
		content += `    masteryRate: ${deck.stats.masteryRate}\n`;
		if (deck.stats.lastStudyTime !== undefined) {
			content += `    lastStudyTime: ${deck.stats.lastStudyTime}\n`;
		}
		content += `    totalStudyTime: ${deck.stats.totalStudyTime}\n`;
		content += `    totalReviews: ${deck.stats.totalReviews}\n`;
		content += `---\n\n`;

		// 卡片详细数据
		content += `# Card Data\n\n`;
		content += `> 此文件包含每张卡片的学习状态和复习历史数据\n`;
		content += `> 请勿手动编辑此文件，以免破坏学习进度\n\n`;

		for (const card of cards) {
			content += `## ${card.id}\n\n`;
			content += `- **Created:** ${new Date(card.createdAt).toLocaleString('zh-CN')} (${card.createdAt})\n`;
			content += `- **Updated:** ${new Date(card.updatedAt).toLocaleString('zh-CN')} (${card.updatedAt})\n`;
			content += `- **Source Note:** ${card.sourceNote}\n`;
			content += `- **Source Section:** ${card.sourceSection}\n`;
			if (card.sourceLineStart !== undefined && card.sourceLineEnd !== undefined) {
				content += `- **Source Lines:** ${card.sourceLineStart}-${card.sourceLineEnd}\n`;
			}
			content += `\n`;

			content += `### Learning State\n\n`;
			content += `- **Status:** ${card.learning.status}\n`;
			content += `- **Ease Factor:** ${card.learning.easeFactor}\n`;
			content += `- **Interval:** ${card.learning.interval} days\n`;
			content += `- **Repetitions:** ${card.learning.repetitions}\n`;
			content += `- **Next Review:** ${new Date(card.learning.nextReview).toLocaleString('zh-CN')} (${card.learning.nextReview})\n`;
			if (card.learning.lastReview !== undefined) {
				content += `- **Last Review:** ${new Date(card.learning.lastReview).toLocaleString('zh-CN')} (${card.learning.lastReview})\n`;
			}
			content += `\n`;

			if (card.reviewHistory.length > 0) {
				content += `### Review History\n\n`;
				content += `| Timestamp | Date | Rating | Time Taken |\n`;
				content += `|-----------|------|--------|------------|\n`;
				for (const record of card.reviewHistory) {
					const date = new Date(record.timestamp).toLocaleString('zh-CN');
					const ratingText = ['忘记', '困难', '熟悉', '简单'][record.rating];
					content += `| ${record.timestamp} | ${date} | ${record.rating} (${ratingText}) | ${record.timeTaken}s |\n`;
				}
				content += `\n`;
			}

			content += `---\n\n`;
		}

		return content;
	}

	/**
	 * 解析卡组内容 Markdown 文件
	 * 提取卡片的问答内容
	 */
	private parseDeckMarkdown(content: string): Partial<Flashcard>[] {
		const cards: Partial<Flashcard>[] = [];
		
		// 按照 "## Card:" 分割内容
		const cardBlocks = content.split(/^## Card: /m).slice(1);
		
		for (const block of cardBlocks) {
			const lines = block.trim().split('\n');
			if (lines.length === 0) continue;
			
			// 提取卡片ID（第一行）
			const id = lines[0].trim();
			
			// 解析问题和答案
			let question = '';
			let answer = '';
			let tags: string[] = [];
			let sourceNote = '';
			let sourceSection = '';
			let sourceLineStart: number | undefined;
			let sourceLineEnd: number | undefined;
			
			let currentSection = '';
			let collectingQuestion = false;
			let collectingAnswer = false;
			
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i];
				
				if (line.startsWith('**Question:**')) {
					currentSection = 'question';
					collectingQuestion = true;
					collectingAnswer = false;
					continue;
				} else if (line.startsWith('**Answer:**')) {
					currentSection = 'answer';
					collectingAnswer = true;
					collectingQuestion = false;
					continue;
				} else if (line.startsWith('**Tags:**')) {
					const tagsStr = line.replace('**Tags:**', '').trim();
					tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);
					collectingQuestion = false;
					collectingAnswer = false;
					continue;
				} else if (line.startsWith('**Source:**')) {
					const sourceStr = line.replace('**Source:**', '').trim();
					// 解析格式: "note.md > Section Name (L10-20)"
					const match = sourceStr.match(/^(.+?)(?: > (.+?))?(?: \(L(\d+)-(\d+)\))?$/);
					if (match) {
						sourceNote = match[1].trim();
						sourceSection = match[2] ? match[2].trim() : '';
						sourceLineStart = match[3] ? parseInt(match[3]) : undefined;
						sourceLineEnd = match[4] ? parseInt(match[4]) : undefined;
					}
					collectingQuestion = false;
					collectingAnswer = false;
					continue;
				} else if (line.trim() === '---') {
					collectingQuestion = false;
					collectingAnswer = false;
					break;
				}
				
				// 收集多行内容
				if (collectingQuestion) {
					if (question) question += '\n';
					question += line;
				} else if (collectingAnswer) {
					if (answer) answer += '\n';
					answer += line;
				}
			}
			
			cards.push({
				id,
				question: question.trim(),
				answer: answer.trim(),
				tags,
				sourceNote,
				sourceSection,
				sourceLineStart,
				sourceLineEnd
			});
		}
		
		return cards;
	}

	/**
	 * 解析卡组数据 Markdown 文件
	 * 提取卡组元信息和学习数据
	 */
	private parseDataMarkdown(content: string): { deck: FlashcardDeck; cardsData: Map<string, Partial<Flashcard>> } {
		const cardsData = new Map<string, Partial<Flashcard>>();
		
		// 提取 YAML frontmatter
		const yamlMatch = content.match(/^---\n([\s\S]+?)\n---/);
		if (!yamlMatch) {
			throw new Error('无效的数据文件格式：缺少 YAML frontmatter');
		}
		
		const yamlContent = yamlMatch[1];
		const deck = this.parseYamlDeck(yamlContent);
		
		// 解析卡片数据部分
		const cardDataSection = content.substring(yamlMatch[0].length);
		const cardBlocks = cardDataSection.split(/^## /m).slice(1);
		
		for (const block of cardBlocks) {
			const lines = block.trim().split('\n');
			if (lines.length === 0) continue;
			
			// 第一行是卡片ID
			const cardId = lines[0].trim();
			const cardData: Partial<Flashcard> = {
				id: cardId,
				learning: {
					easeFactor: 2.5,
					interval: 0,
					repetitions: 0,
					nextReview: Date.now(),
					status: 'new'
				},
				reviewHistory: []
			};
			
			let inLearningState = false;
			let inReviewHistory = false;
			
			for (let i = 1; i < lines.length; i++) {
				const line = lines[i].trim();
				
				if (line.startsWith('### Learning State')) {
					inLearningState = true;
					inReviewHistory = false;
					continue;
				} else if (line.startsWith('### Review History')) {
					inLearningState = false;
					inReviewHistory = true;
					continue;
				} else if (line.startsWith('---')) {
					break;
				}
				
				if (inLearningState && line.startsWith('- **')) {
					const match = line.match(/- \*\*(.+?):\*\* (.+)/);
					if (match) {
						const key = match[1];
						const value = match[2];
						
						switch (key) {
							case 'Status':
								cardData.learning!.status = value as any;
								break;
							case 'Ease Factor':
								cardData.learning!.easeFactor = parseFloat(value);
								break;
							case 'Interval':
								cardData.learning!.interval = parseInt(value);
								break;
							case 'Repetitions':
								cardData.learning!.repetitions = parseInt(value);
								break;
							case 'Next Review':
								const nextMatch = value.match(/\((\d+)\)/);
								if (nextMatch) {
									cardData.learning!.nextReview = parseInt(nextMatch[1]);
								}
								break;
							case 'Last Review':
								const lastMatch = value.match(/\((\d+)\)/);
								if (lastMatch) {
									cardData.learning!.lastReview = parseInt(lastMatch[1]);
								}
								break;
						}
					}
				} else if (inReviewHistory && line.startsWith('|') && !line.includes('Timestamp')) {
					// 解析表格行
					const parts = line.split('|').map(p => p.trim()).filter(p => p);
					if (parts.length >= 4) {
						const timestamp = parseInt(parts[0]);
						const ratingMatch = parts[2].match(/^(\d+)/);
						const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
						const timeTaken = parseInt(parts[3].replace('s', ''));
						
						if (!isNaN(timestamp) && !isNaN(rating) && !isNaN(timeTaken)) {
							cardData.reviewHistory!.push({
								timestamp,
								rating: rating as any,
								timeTaken
							});
						}
					}
				} else if (line.startsWith('- **Created:**')) {
					const match = line.match(/\((\d+)\)/);
					if (match) {
						cardData.createdAt = parseInt(match[1]);
					}
				} else if (line.startsWith('- **Updated:**')) {
					const match = line.match(/\((\d+)\)/);
					if (match) {
						cardData.updatedAt = parseInt(match[1]);
					}
				}
			}
			
			cardsData.set(cardId, cardData);
		}
		
		return { deck, cardsData };
	}

	/**
	 * 解析 YAML 格式的卡组信息
	 */
	private parseYamlDeck(yamlContent: string): FlashcardDeck {
		const now = Date.now();
		const deck: any = {
			id: '',
			name: '',
			sourceNotes: [],
			cardIds: [],
			createdAt: now,
			updatedAt: now,
			settings: {
				newCardsPerDay: 20,
				reviewCardsPerDay: 100
			},
			stats: {
				total: 0,
				new: 0,
				learning: 0,
				review: 0,
				mastered: 0,
				masteryRate: 0,
				totalStudyTime: 0,
				totalReviews: 0
			}
		};
		
		const lines = yamlContent.split('\n');
		let currentPath: string[] = [];
		let currentObject: any = deck;
		
		for (const line of lines) {
			if (!line.trim()) continue;
			
			const indent = line.match(/^(\s*)/)?.[0].length || 0;
			const content = line.trim();
			
			if (content.startsWith('- ')) {
				// 数组项
				const value = content.substring(2).replace(/^"|"$/g, '');
				if (currentPath[currentPath.length - 1] === 'sourceNotes') {
					deck.sourceNotes.push(value);
				} else if (currentPath[currentPath.length - 1] === 'cardIds') {
					deck.cardIds.push(value);
				}
			} else if (content.includes(':')) {
				const [key, ...valueParts] = content.split(':');
				const value = valueParts.join(':').trim().replace(/^"|"$/g, '');
				
				// 更新路径
				const level = Math.floor(indent / 2);
				currentPath = currentPath.slice(0, level);
				currentPath.push(key);
				
				// 设置值
				if (value) {
					this.setNestedValue(deck, currentPath, value);
				}
			}
		}
		
		// 容错：确保必需字段存在
		if (!deck.id) {
			deck.id = this.generateId();
			console.warn('卡组缺少ID，已自动生成:', deck.id);
		}
		if (!deck.name) {
			deck.name = '未命名卡组';
			console.warn('卡组缺少名称，已使用默认值');
		}
		
		return deck as FlashcardDeck;
	}

	/**
	 * 设置嵌套对象的值
	 */
	private setNestedValue(obj: any, path: string[], value: string): void {
		let current = obj;
		for (let i = 0; i < path.length - 1; i++) {
			const key = path[i];
			if (key === 'deck') continue;
			if (!current[key]) {
				current[key] = {};
			}
			current = current[key];
		}
		
		const finalKey = path[path.length - 1];
		// 尝试转换数值
		if (!isNaN(Number(value))) {
			current[finalKey] = Number(value);
		} else if (value === 'true') {
			current[finalKey] = true;
		} else if (value === 'false') {
			current[finalKey] = false;
		} else {
			current[finalKey] = value;
		}
	}

	async saveDeck(deck: FlashcardDeck, cards: Flashcard[]): Promise<void> {
		await this.ensureDirectory();

		// 生成文件路径
		const contentPath = `${this.flashcardDir}/deck_${deck.id}.md`;
		const dataPath = `${this.flashcardDir}/deck_${deck.id}_data.md`;

		// 生成 Markdown 内容
		const contentMarkdown = this.generateDeckMarkdown(deck, cards);
		const dataMarkdown = this.generateDataMarkdown(deck, cards);

		try {
			// 保存内容文件
			const contentFile = this.app.vault.getAbstractFileByPath(contentPath);
			if (contentFile instanceof TFile) {
				await this.app.vault.modify(contentFile, contentMarkdown);
			} else {
				await this.app.vault.create(contentPath, contentMarkdown);
			}

			// 保存数据文件
			const dataFile = this.app.vault.getAbstractFileByPath(dataPath);
			if (dataFile instanceof TFile) {
				await this.app.vault.modify(dataFile, dataMarkdown);
			} else {
				await this.app.vault.create(dataPath, dataMarkdown);
			}
		} catch (error) {
			console.error('保存卡组失败:', error);
			throw error;
		}
	}

	/**
	 * 删除卡组
	 */
	async deleteDeck(deckId: string): Promise<void> {
		const contentPath = `${this.flashcardDir}/deck_${deckId}.md`;
		const dataPath = `${this.flashcardDir}/deck_${deckId}_data.md`;
		
		try {
			const contentFile = this.app.vault.getAbstractFileByPath(contentPath);
			if (contentFile instanceof TFile) {
				await this.app.vault.delete(contentFile);
			}
			
			const dataFile = this.app.vault.getAbstractFileByPath(dataPath);
			if (dataFile instanceof TFile) {
				await this.app.vault.delete(dataFile);
			}
		} catch (error) {
			console.error('删除卡组失败:', error);
			throw error;
		}
	}

	/**
	 * 更新卡片学习状态
	 */
	async updateCardLearningState(
		deckId: string,
		cardId: string,
		rating: 0 | 1 | 2 | 3,
		timeTaken: number
	): Promise<void> {
		const data = await this.loadDeck(deckId);
		if (!data) {
			throw new Error('卡组不存在');
		}

		const { deck, cards } = data;
		const card = cards.find(c => c.id === cardId);

		if (!card) {
			throw new Error('卡片不存在');
		}

		// 使用 SM-2 算法计算新参数
		const result = SM2Algorithm.calculateNextReview(
			card.learning.easeFactor,
			card.learning.repetitions,
			card.learning.interval,
			rating
		);

		// 更新卡片学习状态
		card.learning.easeFactor = result.newEaseFactor;
		card.learning.interval = result.newInterval;
		card.learning.repetitions = result.newRepetitions;
		card.learning.lastReview = Date.now();
		card.learning.nextReview = SM2Algorithm.calculateNextReviewTime(result.newInterval);
		card.learning.status = SM2Algorithm.determineCardStatus(
			result.newRepetitions,
			result.newInterval
		);
		card.updatedAt = Date.now();

		// 添加学习记录
		card.reviewHistory.push({
			timestamp: Date.now(),
			rating,
			timeTaken
		});

		// 更新卡组统计
		deck.stats = this.calculateDeckStats(cards);
		deck.stats.lastStudyTime = Date.now();
		deck.stats.totalStudyTime += timeTaken;
		deck.stats.totalReviews++;
		deck.updatedAt = Date.now();

		// 保存
		await this.saveDeck(deck, cards);
	}

	/**
	 * 计算卡组统计数据
	 */
	calculateDeckStats(cards: Flashcard[]): FlashcardDeck['stats'] {
		const stats = {
			total: cards.length,
			new: 0,
			learning: 0,
			review: 0,
			mastered: 0,
			masteryRate: 0,
			totalStudyTime: 0,
			totalReviews: 0
		};

		cards.forEach(card => {
			switch (card.learning.status) {
				case 'new':
					stats.new++;
					break;
				case 'learning':
					stats.learning++;
					break;
				case 'review':
					stats.review++;
					break;
				case 'mastered':
					stats.mastered++;
					break;
			}
			stats.totalReviews += card.reviewHistory.length;
			stats.totalStudyTime += card.reviewHistory.reduce((sum, r) => sum + r.timeTaken, 0);
		});

		// 计算掌握率：(review + mastered) / total
		if (stats.total > 0) {
			stats.masteryRate = (stats.review + stats.mastered) / stats.total;
		}

		return stats;
	}

	/**
	 * 获取需要学习的卡片
	 * @param deckId 卡组ID
	 * @param newLimit 新卡片数量限制
	 * @param reviewLimit 复习卡片数量限制
	 */
	async getCardsToStudy(
		deckId: string,
		newLimit: number = 20,
		reviewLimit: number = 200
	): Promise<Flashcard[]> {
		const data = await this.loadDeck(deckId);
		if (!data) {
			return [];
		}

		const { cards } = data;
		const now = Date.now();

		// 筛选到期的复习卡片
		const dueReviewCards = cards
			.filter(c => c.learning.status !== 'new' && c.learning.nextReview <= now)
			.sort((a, b) => a.learning.nextReview - b.learning.nextReview)
			.slice(0, reviewLimit);

		// 筛选新卡片
		const newCards = cards
			.filter(c => c.learning.status === 'new')
			.slice(0, newLimit);

		// 合并并打乱顺序
		const studyCards = [...dueReviewCards, ...newCards];
		return this.shuffleArray(studyCards);
	}

	/**
	 * 合并多个卡组
	 */
	async mergeDecks(deckIds: string[], newDeckName: string): Promise<FlashcardDeck> {
		const decksData = await Promise.all(
			deckIds.map(id => this.loadDeck(id))
		);

		const validDecks = decksData.filter(d => d !== null) as { deck: FlashcardDeck; cards: Flashcard[] }[];

		if (validDecks.length === 0) {
			throw new Error('没有有效的卡组可以合并');
		}

		// 创建新卡组
		const newDeckId = this.generateId();
		const allCards: Flashcard[] = [];
		const allSourceNotes: string[] = [];
		let totalStats = {
			total: 0,
			new: 0,
			learning: 0,
			review: 0,
			mastered: 0,
			masteryRate: 0,
			totalStudyTime: 0,
			totalReviews: 0
		};

		// 合并所有卡片和统计
		validDecks.forEach(({ deck, cards }) => {
			allCards.push(...cards);
			allSourceNotes.push(...deck.sourceNotes);

			// 累加统计（用于加权平均）
			totalStats.total += deck.stats.total;
			totalStats.new += deck.stats.new;
			totalStats.learning += deck.stats.learning;
			totalStats.review += deck.stats.review;
			totalStats.mastered += deck.stats.mastered;
			totalStats.totalStudyTime += deck.stats.totalStudyTime;
			totalStats.totalReviews += deck.stats.totalReviews;
		});

		// 计算新的掌握率（加权平均）
		if (totalStats.total > 0) {
			totalStats.masteryRate = (totalStats.review + totalStats.mastered) / totalStats.total;
		}

		const newDeck: FlashcardDeck = {
			id: newDeckId,
			name: newDeckName,
			sourceNotes: Array.from(new Set(allSourceNotes)),
			cardIds: allCards.map(c => c.id),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			settings: {
				newCardsPerDay: 20,
				reviewCardsPerDay: 200
			},
			stats: totalStats
		};

		// 保存新卡组
		await this.saveDeck(newDeck, allCards);

		// 删除原卡组
		await Promise.all(deckIds.map(id => this.deleteDeck(id)));

		new Notice(`已合并 ${validDecks.length} 个卡组`);
		return newDeck;
	}

	/**
	 * 生成唯一ID
	 */
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substr(2);
	}

	/**
	 * 打乱数组顺序
	 */
	private shuffleArray<T>(array: T[]): T[] {
		const result = [...array];
		for (let i = result.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[result[i], result[j]] = [result[j], result[i]];
		}
		return result;
	}
}
