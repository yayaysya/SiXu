import { App, TFile } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { Flashcard, FlashcardDeck, AIFlashcardResponse, FlashcardGenerationOptions } from './types';
import { SM2Algorithm } from './SM2Algorithm';
import { TextProcessor } from '../processors/text';

/**
 * AI 闪卡生成器
 */
export class FlashcardGenerator {
	private app: App;
	private plugin: NotebookLLMPlugin;

	constructor(app: App, plugin: NotebookLLMPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 从笔记生成闪卡
	 */
	async generateFromNote(
		options: FlashcardGenerationOptions,
		progressCallback?: (percent: number, status: string) => void
	): Promise<{ deck: FlashcardDeck; cards: Flashcard[] }> {
		progressCallback?.(10, '读取笔记内容...');

		// 读取笔记内容
		const file = this.app.vault.getAbstractFileByPath(options.sourceNote);
		if (!(file instanceof TFile)) {
			throw new Error('笔记文件不存在');
		}

		const content = await this.app.vault.read(file);

		progressCallback?.(30, 'AI 生成闪卡中...');

		// 调用 AI 生成闪卡
		const generatedCards = await this.callAI(content, options.count);

		progressCallback?.(80, '创建卡组...');

		// 创建卡组和卡片对象
		const deckId = this.generateId();
		const cards: Flashcard[] = generatedCards.cards.map(gc => {
			return {
				id: this.generateId(),
				question: gc.question,
				answer: gc.answer,
				sourceNote: options.sourceNote,
				sourceSection: gc.sourceSection,
				tags: gc.tags || [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				learning: SM2Algorithm.initializeCard(),
				reviewHistory: []
			};
		});

		const deck: FlashcardDeck = {
			id: deckId,
			name: options.deckName,
			sourceNotes: [options.sourceNote],
			cardIds: cards.map(c => c.id),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			settings: {
				newCardsPerDay: this.plugin.settings.flashcard?.newCardsPerDay || 20,
				reviewCardsPerDay: this.plugin.settings.flashcard?.reviewCardsPerDay || 200
			},
			stats: {
				total: cards.length,
				new: cards.length,
				learning: 0,
				review: 0,
				mastered: 0,
				masteryRate: 0,
				totalStudyTime: 0,
				totalReviews: 0
			}
		};

		progressCallback?.(100, '完成');

		return { deck, cards };
	}

	/**
	 * 调用 AI 生成闪卡
	 */
	private async callAI(noteContent: string, count: number): Promise<AIFlashcardResponse> {
		const prompt = this.buildPrompt(noteContent, count);

		// 创建文本模型provider
		const { createTextProvider } = await import('../api/factory');
		const provider = createTextProvider(this.plugin.settings);

		try {
			const response = await provider.generateText(
				'你是一个专业的学习卡片生成助手，擅长从笔记中提取核心知识点并生成高质量的学习闪卡。',
				prompt,
				{
					temperature: 0.7,
					maxTokens: 8000,
					model: this.plugin.settings.textModel
				}
			);

			// 解析 AI 响应
			return this.parseAIResponse(response);
		} catch (error) {
			console.error('AI 生成闪卡失败:', error);
			throw new Error(`AI 生成失败: ${error.message}`);
		}
	}

	/**
	 * 构建提示词
	 */
	private buildPrompt(noteContent: string, count: number): string {
		return `请基于以下笔记内容，生成 ${count} 个高质量的学习闪卡。

要求：
1. 每个闪卡包含一个问题和答案
2. 问题要具体、清晰、可测试
3. 答案要简洁、准确、完整
4. 覆盖笔记的核心知识点
5. 问题类型多样化：概念定义、对比分析、应用场景、记忆口诀等
6. 标注每个闪卡对应的原文段落标题或主题

输出格式（必须是有效的 JSON）：
\`\`\`json
{
  "cards": [
    {
      "question": "问题内容",
      "answer": "答案内容",
      "sourceSection": "对应的章节或主题",
      "tags": ["标签1", "标签2"]
    }
  ]
}
\`\`\`

笔记内容：
---
${noteContent}
---

请生成闪卡（JSON格式）：`;
	}

	/**
	 * 解析 AI 响应
	 */
	private parseAIResponse(response: string): AIFlashcardResponse {
		try {
			// 尝试提取 JSON 代码块
			const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
			let jsonStr = jsonMatch ? jsonMatch[1] : response;

			// 清理可能的 markdown 格式
			jsonStr = jsonStr.trim();

			// 解析 JSON
			const parsed = JSON.parse(jsonStr);

			// 验证格式
			if (!parsed.cards || !Array.isArray(parsed.cards)) {
				throw new Error('响应格式无效：缺少 cards 数组');
			}

			// 验证每个卡片
			parsed.cards.forEach((card: any, index: number) => {
				if (!card.question || !card.answer) {
					throw new Error(`卡片 ${index + 1} 缺少问题或答案`);
				}
				// 确保有 sourceSection
				if (!card.sourceSection) {
					card.sourceSection = '未分类';
				}
				// 确保有 tags
				if (!card.tags || !Array.isArray(card.tags)) {
					card.tags = [];
				}
			});

			return parsed;
		} catch (error) {
			console.error('解析 AI 响应失败:', error);
			console.log('原始响应:', response);
			throw new Error(`解析 AI 响应失败: ${error.message}`);
		}
	}

	/**
	 * 从学习路径批量生成闪卡
	 */
	async generateFromLearningPath(
		learningPathFiles: Array<{ path: string; title: string; content?: string }>,
		pathName: string,
		progressCallback?: (percent: number, status: string, currentFile?: string) => void
	): Promise<Array<{ deck: FlashcardDeck; cards: Flashcard[]; fileName: string }>> {
		const results: Array<{ deck: FlashcardDeck; cards: Flashcard[]; fileName: string }> = [];
		const totalFiles = learningPathFiles.length;

		for (let i = 0; i < totalFiles; i++) {
			const file = learningPathFiles[i];
			const progressPercent = Math.round((i / totalFiles) * 100);

			progressCallback?.(progressPercent, `处理文件: ${file.title}`, file.title);

			try {
				// 智能推荐闪卡数量
				const recommendedCount = this.recommendFlashcardCount(file.content?.length || 0);

				// 为每个文件生成独立的卡组
				const deckName = `${pathName} - ${file.title}`;
				const result = await this.generateFromNote({
					count: recommendedCount,
					sourceNote: file.path,
					deckName: deckName
				}, (percent, status) => {
					const fileProgress = Math.round((i / totalFiles) * 100) + Math.round((percent / 100) * (100 / totalFiles));
					progressCallback?.(fileProgress, `${file.title}: ${status}`, file.title);
				});

				results.push({
					...result,
					fileName: file.title
				});

			} catch (error) {
				console.error(`为文件 ${file.title} 生成闪卡失败:`, error);
				// 继续处理其他文件，不中断整个流程
				progressCallback?.(progressPercent, `⚠️ ${file.title}: 生成失败`, file.title);
			}
		}

		progressCallback?.(100, '闪卡生成完成');
		return results;
	}

	/**
	 * 智能推荐闪卡数量
	 */
	private recommendFlashcardCount(contentLength: number): number {
		// 基于内容长度的推荐算法
		if (contentLength < 500) return 3;      // 短内容：3张
		if (contentLength < 1500) return 5;     // 中等内容：5张
		if (contentLength < 3000) return 8;     // 长内容：8张
		if (contentLength < 5000) return 12;    // 很长内容：12张
		return 15;                              // 超长内容：15张（上限）
	}

	/**
	 * 生成唯一ID
	 */
	private generateId(): string {
		return Date.now().toString(36) + Math.random().toString(36).substring(2);
	}
}
