import { App, TFile } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { Flashcard, FlashcardDeck, AIFlashcardResponse, FlashcardGenerationOptions } from './types';
import { FSRSAlgorithm } from './FSRSAlgorithm';
import { TextProcessor } from '../processors/text';
import { DocumentSplitter, SplitChunk } from '../utils/DocumentSplitter';
import { BatchProcessor } from '../utils/BatchProcessor';
import { DebugMarkdownLogger } from '../utils/DebugMarkdown';

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
	 * 从文档块生成闪卡
	 */
	private async generateFlashcardsFromChunk(
		chunk: SplitChunk,
		sourceNote: string,
		count: number,
		deckName: string,
		logger?: DebugMarkdownLogger
	): Promise<{ deck: FlashcardDeck; cards: Flashcard[] }> {
		const chunkIndex = typeof chunk.index === 'number' ? chunk.index : undefined;
		logger?.appendSection('分块生成任务', {
			chunkIndex,
			chunkTitle: chunk.title || '未命名章节',
			contentLength: chunk.content.length,
			requiredCards: count
		});

		// 调用 AI 生成闪卡
		const generatedCards = await this.callAI(chunk.content, count, chunk.title, logger);

		// 创建卡组和卡片对象
		const deckId = this.generateId();
			const cards: Flashcard[] = generatedCards.cards.map(gc => {
				return {
					id: this.generateId(),
					question: gc.question,
					answer: gc.answer,
					sourceNote: sourceNote,
					sourceSection: gc.sourceSection || chunk.title || '未分类',
					tags: gc.tags || [],
					createdAt: Date.now(),
					updatedAt: Date.now(),
					learning: FSRSAlgorithm.initializeCard(),
					reviewHistory: []
				};
			});

		const deck: FlashcardDeck = {
			id: deckId,
			name: `${deckName}${chunk.title ? ` - ${chunk.title}` : ''}`,
			sourceNotes: [sourceNote],
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


		logger?.appendSection('分块生成完成', {
			chunkIndex,
			generatedCards: cards.length
		});

		return { deck, cards };
	}

	/**
	 * 合并和去重闪卡
	 */
	private mergeAndDeduplicateFlashcards(
		allResults: Array<{ deck: FlashcardDeck; cards: Flashcard[] }>
	): { deck: FlashcardDeck; cards: Flashcard[] } {
		// 合并所有卡片
		const allCards = allResults.flatMap(result => result.cards);

		// 去重
		const seenCards = new Set<string>();
		const uniqueCards: Flashcard[] = [];

		for (const card of allCards) {
			const cardKey = `${card.question}_${card.answer}`;
			if (!seenCards.has(cardKey)) {
				seenCards.add(cardKey);
				uniqueCards.push(card);
			}
		}

		// 创建新的合并卡组
		const mergedDeckId = this.generateId();
		const mergedDeck: FlashcardDeck = {
			id: mergedDeckId,
			name: allResults[0]?.deck.name || '合并闪卡',
			sourceNotes: [...new Set(allResults.flatMap(r => r.deck.sourceNotes))],
			cardIds: uniqueCards.map(c => c.id),
			createdAt: Date.now(),
			updatedAt: Date.now(),
			settings: allResults[0]?.deck.settings || {
				newCardsPerDay: 20,
				reviewCardsPerDay: 200
			},
			stats: {
				total: uniqueCards.length,
				new: uniqueCards.length,
				learning: 0,
				review: 0,
				mastered: 0,
				masteryRate: 0,
				totalStudyTime: 0,
				totalReviews: 0
			}
		};

		// 更新卡片的ID
		uniqueCards.forEach(card => {
			card.id = this.generateId();
		});

		return { deck: mergedDeck, cards: uniqueCards };
	}

	/**
	 * 从笔记生成闪卡
	 */
	async generateFromNote(
		options: FlashcardGenerationOptions,
		progressCallback?: (percent: number, status: string) => void,
		logger?: DebugMarkdownLogger
	): Promise<{ deck: FlashcardDeck; cards: Flashcard[] }> {
		const startTime = Date.now();
		let runLogger = logger;
		let shouldFlush = false;

		if (!runLogger && this.plugin.settings.debugEnabled) {
			runLogger = this.createLogger('闪卡生成调试日志', {
				sourceNote: options.sourceNote,
				deckName: options.deckName,
				targetCount: options.count
			});
			shouldFlush = !!runLogger;
		}

		runLogger?.appendSection('任务开始', {
			sourceNote: options.sourceNote,
			deckName: options.deckName,
			targetCount: options.count
		});

		try {
			console.log(`[闪卡生成] 开始生成闪卡: ${options.deckName}, 目标${options.count}张`);

			progressCallback?.(10, '读取笔记内容...');

			// 读取笔记内容
			const file = this.app.vault.getAbstractFileByPath(options.sourceNote);
			if (!(file instanceof TFile)) {
				throw new Error('笔记文件不存在');
			}

			const content = await this.app.vault.read(file);
			runLogger?.appendSection('笔记信息', {
				length: content.length,
				preview: content.slice(0, 400)
			});

			// 智能拆分文档
			progressCallback?.(20, '正在拆分文档...');
			const startSplitTime = Date.now();
			const chunks = DocumentSplitter.smartSplit(content, 500);
			const splitTime = Date.now() - startSplitTime;

			console.log(`[闪卡生成] 文档拆分完成: ${chunks.length}个块，耗时${splitTime}ms`);
			runLogger?.appendSection('拆分结果', {
				chunkCount: chunks.length,
				splitDurationMs: splitTime
			});

			// 根据chunk数量决定处理策略
			const chunkCount = chunks.length;
			let finalResult: { deck: FlashcardDeck; cards: Flashcard[] };

			if (chunkCount <= 1) {
				runLogger?.appendSection('生成模式', {
					mode: 'single-chunk'
				});

				progressCallback?.(30, 'AI 生成闪卡中...');
				const generatedCards = await this.callAI(content, options.count, undefined, runLogger);
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
						learning: FSRSAlgorithm.initializeCard(),
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

				runLogger?.appendSection('单块生成结果', {
					cardCount: cards.length
				});

				finalResult = { deck, cards };
			} else {
				const cardsPerChunk = Math.max(1, Math.ceil(options.count / chunkCount));
				runLogger?.appendSection('生成模式', {
					mode: 'multi-chunk',
					chunkCount,
					cardsPerChunk
				});

				progressCallback?.(30, `正在并发生成${chunkCount}个片段的闪卡...`);
				const startBatchTime = Date.now();

				console.log(`[闪卡生成] 开始并发处理${chunkCount}个块，每个块生成${cardsPerChunk}张卡，并发数: 5`);

				// 创建Batch任务
				const tasks = chunks.map(chunk => ({
					id: `chunk_${chunk.index}`,
					input: chunk,
					execute: async (chunk: SplitChunk) => {
						return await this.generateFlashcardsFromChunk(
							chunk,
							options.sourceNote,
							cardsPerChunk,
							options.deckName,
							runLogger
						);
					},
					maxRetries: 2
				}));

				// 创建进度回调
				let completedChunks = 0;
				const batchProcessor = new BatchProcessor<SplitChunk, { deck: FlashcardDeck; cards: Flashcard[] }>({
					maxConcurrent: 5,
					onProgress: (completed, total) => {
						completedChunks = completed;
						const progress = 30 + (completed / total) * 50;
						progressCallback?.(progress, `正在生成闪卡... (${completed}/${total})`);
					}
				});

				// 并发处理所有chunks
				const results = await batchProcessor.processBatch(tasks);
				const batchTime = Date.now() - startBatchTime;
				const { successful, failed } = BatchProcessor.mergeResults(results);

				console.log(`[闪卡生成] 并发处理完成: ${successful.length}/${chunkCount}成功，${failed.length}失败，耗时${batchTime}ms`);
				runLogger?.appendSection('并发处理结果', {
					successfulChunks: successful.length,
					failedChunks: failed.length,
					durationMs: batchTime
				});

				// 检查是否有任务未成功完成
				const totalExpectedChunks = chunkCount;
				const actualSuccessfulChunks = successful.length;
				const totalCardsGenerated = successful.reduce((sum, r) => sum + r.cards.length, 0);

				console.log(`[闪卡生成] 状态检查: 期望${totalExpectedChunks}个chunk, 实际成功${actualSuccessfulChunks}个, 已生成${totalCardsGenerated}张卡, 目标${options.count}张`);
				runLogger?.appendSection('初次生成统计', {
					expectedChunks: totalExpectedChunks,
					actualChunks: actualSuccessfulChunks,
					generatedCards: totalCardsGenerated,
					targetCards: options.count
				});

				// 如果成功数量不足或生成卡片数不够目标，进行补偿
				if (actualSuccessfulChunks < totalExpectedChunks || totalCardsGenerated < options.count) {
					const failedResults = results.filter(result => !result.success || !result.data);
					console.log(`[闪卡生成] 检测到${failedResults.length}个未成功的任务，开始补偿处理...`);

					const remainingCards = options.count - totalCardsGenerated;
					const failedCount = failedResults.length;
					const retryCardsPerChunk = failedCount > 0 ? Math.max(1, Math.ceil(remainingCards / failedCount)) : remainingCards;

					console.log(`[闪卡生成] 剩余需求: ${remainingCards}张卡, 失败任务${failedCount}个, 每个重新生成${retryCardsPerChunk}张`);
					runLogger?.appendSection('补偿计划', {
						remainingCards,
						failedTasks: failedCount,
						retryCardsPerChunk
					});

					if (failedCount > 0) {
						const retryTasks = failedResults.map(result => {
							const chunkIndex = parseInt(result.taskId.split('_')[1]);
							const chunk = chunks[chunkIndex];
							return {
								id: `retry_${result.taskId}`,
								input: chunk,
								execute: async (chunk: SplitChunk) => {
									return await this.generateFlashcardsFromChunk(
										chunk,
										options.sourceNote,
										retryCardsPerChunk,
										options.deckName,
										runLogger
									);
								},
								maxRetries: 3
							};
						});

						const retryBatchProcessor = new BatchProcessor<SplitChunk, { deck: FlashcardDeck; cards: Flashcard[] }>({
							maxConcurrent: 5,
							onProgress: (completed, total) => {
								progressCallback?.(75, `补偿处理中... (${completed}/${total})`);
							}
						});

						const retryResults = await retryBatchProcessor.processBatch(retryTasks);
						const { successful: retrySuccessful } = BatchProcessor.mergeResults(retryResults);

						console.log(`[闪卡生成] 补偿处理完成: ${retrySuccessful.length}/${retryTasks.length}成功`);
						runLogger?.appendSection('补偿结果', {
							successfulRetries: retrySuccessful.length,
							totalRetries: retryTasks.length
						});

						successful.push(...retrySuccessful);
					}
				}

				// 合并所有闪卡
				progressCallback?.(85, '正在合并和去重闪卡...');
				const startMergeTime = Date.now();
				finalResult = this.mergeAndDeduplicateFlashcards(successful);
				const mergeTime = Date.now() - startMergeTime;

				const totalCardsGeneratedAfterMerge = successful.reduce((sum, r) => sum + r.cards.length, 0);
				console.log(`[闪卡生成] 去重完成: ${totalCardsGeneratedAfterMerge}→${finalResult.cards.length}张卡，耗时${mergeTime}ms`);
				runLogger?.appendSection('合并结果', {
					beforeDeduplicate: totalCardsGeneratedAfterMerge,
					afterDeduplicate: finalResult.cards.length,
					mergeDurationMs: mergeTime
				});

				// 确保卡片数量不超过目标数量
				if (finalResult.cards.length > options.count) {
					finalResult.cards = finalResult.cards.slice(0, options.count);
				}
			}

			progressCallback?.(100, '完成');

			const totalTime = Date.now() - startTime;
			console.log(`[闪卡生成] ✅ 完成! 总耗时: ${totalTime}ms (${Math.round(totalTime / 1000)}秒), 生成${finalResult.cards.length}张卡`);
			runLogger?.appendSection('任务完成', {
				cardCount: finalResult.cards.length,
				totalTimeMs: totalTime
			});

			return finalResult;
		} catch (error) {
			runLogger?.appendSection('错误', {
				message: (error as any)?.message || String(error)
			});
			throw error;
		} finally {
			if (shouldFlush && runLogger) {
				await runLogger.flush();
			}
		}
	}

	/**
	 * 调用 AI 生成闪卡
	 */
	private async callAI(
		noteContent: string,
		count: number,
		sectionTitle?: string,
		logger?: DebugMarkdownLogger
	): Promise<AIFlashcardResponse> {
		const prompt = this.buildPrompt(noteContent, count, sectionTitle);
		const systemPrompt = '你是一个专业的学习卡片生成助手，擅长从笔记中提取核心知识点并生成高质量的学习闪卡。';
		const scope = sectionTitle || '整篇笔记';

		logger?.appendSection('调用模型生成闪卡', {
			section: scope,
			requiredCards: count,
			noteLength: noteContent.length
		});

		// 创建文本模型provider
		const { createTextProvider } = await import('../api/factory');
		const provider = createTextProvider(this.plugin.settings, logger);

		try {
			const response = await provider.generateText(
				systemPrompt,
				prompt,
				{
					temperature: 0.7,
					maxTokens: 8000,
					model: this.plugin.settings.textModel
				}
			);

			// 解析 AI 响应
			return this.parseAIResponse(response, logger, scope);
		} catch (error) {
			console.error('AI 生成闪卡失败:', error);
			logger?.appendSection('AI 调用失败', {
				section: scope,
				message: (error as any)?.message || String(error)
			});
			throw new Error(`AI 生成失败: ${error.message}`);
		}
	}

	/**
	 * 构建提示词
	 */
	private buildPrompt(noteContent: string, count: number, sectionTitle?: string): string {
		const sectionInfo = sectionTitle ? `**章节**: ${sectionTitle}\n` : '';
		return `请基于以下笔记内容，生成 ${count} 个高质量的学习闪卡。

${sectionInfo}要求：
1. 每个闪卡包含一个问题和答案
2. 问题要具体、清晰、可测试
3. 答案要简洁、准确、完整
4. 覆盖笔记的核心知识点
5. 问题类型多样化：概念定义、对比分析、应用场景、记忆口诀等
6. 答案尽量使用 Markdown 列表/分段呈现，便于记忆；当需要对比或多点说明时，使用“\- ”开头的列表
7. 标注每个闪卡对应的原文段落标题或主题

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
	private parseAIResponse(response: string, logger?: DebugMarkdownLogger, section?: string): AIFlashcardResponse {
		const scope = section || '整篇笔记';
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

			logger?.appendSection('解析后的闪卡', {
				section: scope,
				cardCount: parsed.cards.length
			});

			return parsed;
		} catch (error) {
			console.error('解析 AI 响应失败:', error);
			console.log('原始响应:', response);
			logger?.appendSection('解析闪卡失败', {
				section: scope,
				message: (error as any)?.message || String(error),
				responsePreview: response.slice(0, 400)
			});
			throw new Error(`解析 AI 响应失败: ${error.message}`);
		}
	}

	/**
	 * 从学习路径批量生成闪卡
	 */
	async generateFromLearningPath(
		learningPathFiles: Array<{ path: string; title: string; content?: string }>,
		pathName: string,
		progressCallback?: (percent: number, status: string, currentFile?: string) => void,
		logger?: DebugMarkdownLogger
	): Promise<Array<{ deck: FlashcardDeck; cards: Flashcard[]; fileName: string }>> {
		const totalFiles = learningPathFiles.length;
		const startTime = Date.now();
		let runLogger = logger;
		let shouldFlush = false;

		if (!runLogger && this.plugin.settings.debugEnabled) {
			runLogger = this.createLogger('学习路径闪卡生成调试日志', {
				pathName,
				totalFiles
			});
			shouldFlush = !!runLogger;
		}

		runLogger?.appendSection('任务开始', {
			pathName,
			totalFiles
		});

		try {
			console.log(`[学习路径] 开始批量生成闪卡: ${pathName}, ${totalFiles}个文件`);

			let results: Array<{ deck: FlashcardDeck; cards: Flashcard[]; fileName: string }> = [];
			const fileSummaries: Array<{ title: string; cards: number }> = [];

			// 如果文件数量较少，使用串行处理（保持原有逻辑）
			if (totalFiles <= 3) {
				for (let i = 0; i < totalFiles; i++) {
					const file = learningPathFiles[i];
					const progressPercent = Math.round((i / totalFiles) * 100);

					progressCallback?.(progressPercent, `处理文件: ${file.title}`, file.title);

					try {
						const recommendedCount = this.recommendFlashcardCount(file.content?.length || 0);
						const deckName = `${pathName} - ${file.title}`;
						const result = await this.generateFromNote({
							count: recommendedCount,
							sourceNote: file.path,
							deckName: deckName
						}, (percent, status) => {
							const fileProgress = Math.round((i / totalFiles) * 100) + Math.round((percent / 100) * (100 / totalFiles));
							progressCallback?.(fileProgress, `${file.title}: ${status}`, file.title);
						}, runLogger);

						results.push({
							...result,
							fileName: file.title
						});
						fileSummaries.push({ title: file.title, cards: result.cards.length });

					} catch (error) {
						console.error(`为文件 ${file.title} 生成闪卡失败:`, error);
						runLogger?.appendSection('文件生成失败', {
							file: file.title,
							message: (error as any)?.message || String(error)
						});
						progressCallback?.(progressPercent, `⚠️ ${file.title}: 生成失败`, file.title);
					}
				}
			} else {
				progressCallback?.(0, `开始批量生成${totalFiles}个文件的闪卡...`);
				const startBatchTime = Date.now();

				console.log(`[学习路径] 开始并发处理${totalFiles}个文件，并发数: 3`);

				const tasks = learningPathFiles.map((file, index) => ({
					id: `file_${index}`,
					input: file,
					execute: async (file: { path: string; title: string; content?: string }) => {
						const recommendedCount = this.recommendFlashcardCount(file.content?.length || 0);
						const deckName = `${pathName} - ${file.title}`;
						const result = await this.generateFromNote({
							count: recommendedCount,
							sourceNote: file.path,
							deckName: deckName
						}, undefined, runLogger);

						return {
							...result,
							fileName: file.title
						};
					},
					maxRetries: 2
				}));

				const batchProcessor = new BatchProcessor<typeof tasks[0]['input'], typeof tasks[0]['execute'] extends (input: infer T) => Promise<infer R> ? R : never>({
					maxConcurrent: 3,
					onProgress: (completed, total) => {
						const progress = Math.round((completed / total) * 100);
						progressCallback?.(progress, `正在处理文件... (${completed}/${total})`);
					}
				});

				const batchResults = await batchProcessor.processBatch(tasks);
				const batchTime = Date.now() - startBatchTime;
				const { successful, failed } = BatchProcessor.mergeResults(batchResults);

				console.log(`[学习路径] 并发处理完成: ${successful.length}/${totalFiles}成功，${failed.length}失败，耗时${batchTime}ms`);
				runLogger?.appendSection('并发处理结果', {
					successful: successful.length,
					failed: failed.length,
					durationMs: batchTime
				});

				results = successful;
				fileSummaries.push(...results.map(r => ({ title: r.fileName, cards: r.cards.length })));
			}

			progressCallback?.(100, '闪卡生成完成');

			const totalTime = Date.now() - startTime;
			const totalCards = results.reduce((sum, r) => sum + r.cards.length, 0);
			console.log(`[学习路径] ✅ 完成! 总耗时: ${totalTime}ms (${Math.round(totalTime / 1000)}秒), 生成${results.length}个卡组共${totalCards}张卡`);
			runLogger?.appendSection('任务完成', {
				pathName,
				totalDecks: results.length,
				totalCards,
				durationMs: totalTime,
				files: fileSummaries
			});

			return results;
		} catch (error) {
			runLogger?.appendSection('任务失败', {
				pathName,
				message: (error as any)?.message || String(error)
			});
			throw error;
		} finally {
			if (shouldFlush && runLogger) {
				await runLogger.flush();
			}
		}
	}

	private createLogger(title: string, context: Record<string, any>): DebugMarkdownLogger | undefined {
		if (!this.plugin.settings.debugEnabled) return undefined;
		const enrichedContext = {
			...context,
			textProvider: this.plugin.settings.textProvider,
			textModel: this.plugin.settings.textModel
		};
		const logger = new DebugMarkdownLogger(this.app, title);
		logger.appendSection('运行上下文', enrichedContext);
		return logger;
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
