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
		const deckFiles = files.filter(f =>
			f.path.startsWith(this.flashcardDir + '/') &&
			f.extension === 'json' &&
			f.basename.startsWith('deck_')
		);

		const decks: FlashcardDeck[] = [];
		for (const file of deckFiles) {
			try {
				const content = await this.app.vault.read(file);
				const data = JSON.parse(content);

				// 加载卡组数据和对应的卡片
				if (data.deck) {
					decks.push(data.deck);
				}
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
		const deckPath = `${this.flashcardDir}/deck_${deckId}.json`;
		const file = this.app.vault.getAbstractFileByPath(deckPath);

		if (!(file instanceof TFile)) {
			return null;
		}

		try {
			const content = await this.app.vault.read(file);
			const data = JSON.parse(content);
			return {
				deck: data.deck,
				cards: data.cards || []
			};
		} catch (error) {
			console.error('加载卡组失败:', error);
			return null;
		}
	}

	/**
	 * 保存卡组和卡片
	 */
	async saveDeck(deck: FlashcardDeck, cards: Flashcard[]): Promise<void> {
		await this.ensureDirectory();

		const deckPath = `${this.flashcardDir}/deck_${deck.id}.json`;
		const data = {
			deck,
			cards
		};

		try {
			const file = this.app.vault.getAbstractFileByPath(deckPath);
			if (file instanceof TFile) {
				await this.app.vault.modify(file, JSON.stringify(data, null, 2));
			} else {
				await this.app.vault.create(deckPath, JSON.stringify(data, null, 2));
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
		const deckPath = `${this.flashcardDir}/deck_${deckId}.json`;
		const file = this.app.vault.getAbstractFileByPath(deckPath);

		if (file instanceof TFile) {
			await this.app.vault.delete(file);
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
