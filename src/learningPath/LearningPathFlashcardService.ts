import { App, TFile, Notice } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { FlashcardGenerator } from '../flashcard/FlashcardGenerator';
import { FlashcardStorage } from '../flashcard/FlashcardStorage';
import { FlashcardDeck, Flashcard } from '../flashcard/types';
import { LearningPathConfig, LearningPathOutline } from './types';

/**
 * 学习路径闪卡服务
 * 负责从学习路径文件批量生成闪卡
 */
export class LearningPathFlashcardService {
	private app: App;
	private plugin: NotebookLLMPlugin;
	private generator: FlashcardGenerator;
	private storage: FlashcardStorage;

	constructor(app: App, plugin: NotebookLLMPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.generator = new FlashcardGenerator(app, plugin);
		this.storage = new FlashcardStorage(app);
	}

	/**
	 * 从学习路径生成闪卡
	 */
	async generateFlashcardsFromPath(
		config: LearningPathConfig,
		outline: LearningPathOutline,
		createdFiles: string[],
		progressCallback?: (percent: number, status: string, currentFile?: string) => void
	): Promise<{
		success: boolean;
		decks: Array<{ deck: FlashcardDeck; cards: Flashcard[]; fileName: string }>;
		totalCards: number;
		totalDecks: number;
		errors: string[];
	}> {
		try {
			console.log('=== 开始生成学习路径闪卡 ===');
			console.log('学习路径信息:', {
				title: outline.title,
				totalFiles: outline.files.length,
				enabledFiles: outline.files.filter(f => f.enabled).length,
				createdFiles: createdFiles.length,
				config: { topic: config.topic, targetDirectory: config.targetDirectory, depth: config.depth }
			});

			progressCallback?.(5, '准备生成闪卡...');

			// 收集学习路径文件信息
			const learningFiles = await this.collectLearningFiles(outline, createdFiles);

			console.log('收集到的学习文件数量:', learningFiles.length);
			if (learningFiles.length === 0) {
				console.error('❌ 没有找到任何可用的学习文件');
				return {
					success: false,
					decks: [],
					totalCards: 0,
					totalDecks: 0,
					errors: ['没有找到可用的学习文件']
				};
			}

			progressCallback?.(10, `开始为 ${learningFiles.length} 个文件生成闪卡...`);

			// 批量生成闪卡
			console.log('🚀 开始批量生成闪卡...');
			const results = await this.generator.generateFromLearningPath(
				learningFiles,
				outline.title,
				(percent, status, currentFile) => {
					console.log(`📈 生成进度: ${percent}% - ${status}${currentFile ? ` (当前文件: ${currentFile})` : ''}`);
					progressCallback?.(percent, status, currentFile);
				}
			);

			console.log(`✅ 闪卡生成完成，结果数量: ${results.length}`);
			results.forEach((result, index) => {
				console.log(`  ${index + 1}. ${result.fileName}: ${result.cards.length} 张卡片`);
			});

			progressCallback?.(90, '保存闪卡数据...');

			// 保存所有生成的卡组
			console.log('💾 开始保存闪卡数据...');
			const savedResults: Array<{ deck: FlashcardDeck; cards: Flashcard[]; fileName: string }> = [];
			const errors: string[] = [];

			for (let i = 0; i < results.length; i++) {
				const result = results[i];
				console.log(`保存卡组 ${i + 1}/${results.length}: ${result.deck.name}`);
				try {
					await this.storage.saveDeck(result.deck, result.cards);
					savedResults.push(result);
					console.log(`✅ 成功保存卡组: ${result.deck.name}`);
				} catch (error) {
					console.error(`❌ 保存卡组 ${result.deck.name} 失败:`, error);
					errors.push(`保存卡组 "${result.fileName}" 失败: ${error.message}`);
				}
			}

			const totalCards = savedResults.reduce((sum, result) => sum + result.cards.length, 0);
			const totalDecks = savedResults.length;

			console.log('📊 生成统计:');
			console.log(`  ✅ 成功保存: ${totalDecks} 个卡组, ${totalCards} 张卡片`);
			console.log(`  ❌ 错误数量: ${errors.length}`);
			if (errors.length > 0) {
				console.log('  错误详情:', errors);
			}

			progressCallback?.(100, `完成！生成了 ${totalDecks} 个卡组，共 ${totalCards} 张闪卡`);

			// 显示完成通知
			this.showCompletionNotice(totalDecks, totalCards, outline.title, errors);

			console.log('=== 学习路径闪卡生成流程完成 ===');

			return {
				success: savedResults.length > 0,
				decks: savedResults,
				totalCards,
				totalDecks,
				errors
			};

		} catch (error) {
			console.error('❌ 学习路径闪卡生成失败:', error);
			console.error('错误堆栈:', error.stack);
			progressCallback?.(0, `生成失败: ${error.message}`);

			new Notice(`闪卡生成失败: ${error.message}`, 8000);

			return {
				success: false,
				decks: [],
				totalCards: 0,
				totalDecks: 0,
				errors: [error.message]
			};
		}
	}

	/**
	 * 收集学习路径文件信息
	 */
	private async collectLearningFiles(
		outline: LearningPathOutline,
		createdFiles: string[]
	): Promise<Array<{ path: string; title: string; content?: string }>> {
		const learningFiles: Array<{ path: string; title: string; content?: string }> = [];

		console.log('📂 开始收集学习文件');
		console.log('学习路径大纲:', {
			title: outline.title,
			files: outline.files.map(f => ({
				title: f.title,
				filename: f.filename,
				enabled: f.enabled,
				type: f.type
			}))
		});
		console.log('已创建的文件列表:', createdFiles);

		// 首先尝试使用createdFiles中的路径
		console.log('🔍 尝试从已创建文件列表中查找...');
		for (let i = 0; i < createdFiles.length; i++) {
			const filePath = createdFiles[i];
			console.log(`检查文件 ${i + 1}/${createdFiles.length}: ${filePath}`);

			const fileObj = this.app.vault.getAbstractFileByPath(filePath);
			console.log(`文件对象:`, fileObj ? (fileObj instanceof TFile ? 'TFile' : '其他类型') : 'null');

			if (fileObj instanceof TFile) {
				try {
					const content = await this.app.vault.read(fileObj);
					console.log(`✅ 成功读取文件: ${filePath}, 内容长度: ${content.length}`);

					// 从文件路径中提取文件名来匹配outline中的文件信息
					const fileName = filePath.split('/').pop() || filePath;
					const outlineFile = outline.files.find(f => f.filename === fileName || f.filename === fileName.replace('.md', ''));

					const title = outlineFile?.title || fileName.replace('.md', '');
					console.log(`匹配到的文件信息: title="${title}", outlineFile=${outlineFile ? 'found' : 'not found'}`);

					learningFiles.push({
						path: filePath,
						title: title,
						content: content
					});
				} catch (error) {
					console.warn(`❌ 读取文件 ${filePath} 失败:`, error);
				}
			} else {
				console.warn(`⚠️ 文件不存在或不是TFile类型: ${filePath}`);
				// 列出vault中的所有文件，帮助调试
				if (i === 0) { // 只在第一次时列出
					console.log('Vault中的一些文件示例:',
						this.app.vault.getFiles().slice(0, 10).map(f => f.path)
					);
				}
			}
		}

		// 如果通过createdFiles没有找到文件，再尝试直接构建路径
		if (learningFiles.length === 0) {
			console.log('🔄 通过createdFiles未找到文件，尝试直接构建路径');

			const enabledFiles = outline.files.filter(file => file.enabled);
			console.log(`启用的文件数量: ${enabledFiles.length}`);

			for (const file of enabledFiles) {
				console.log(`处理文件: ${file.title} (${file.filename})`);

				// 尝试多种可能的路径格式
				const possiblePaths = [
					`${outline.title}/${file.filename}`,
					`${outline.title}/${file.filename}.md`,
					file.filename,
					`${file.filename}.md`,
					`learning-paths/${outline.title}/${file.filename}`,
					`learning-paths/${outline.title}/${file.filename}.md`,
					`学习路径/${outline.title}/${file.filename}`,
					`学习路径/${outline.title}/${file.filename}.md`
				];

				let found = false;
				for (const filePath of possiblePaths) {
					console.log(`  尝试路径: ${filePath}`);
					const fileObj = this.app.vault.getAbstractFileByPath(filePath);
					if (fileObj instanceof TFile) {
						try {
							const content = await this.app.vault.read(fileObj);
							learningFiles.push({
								path: filePath,
								title: file.title,
								content: content
							});
							console.log(`  ✅ 成功找到并读取文件: ${filePath}, 内容长度: ${content.length}`);
							found = true;
							break; // 找到后跳出循环
						} catch (error) {
							console.warn(`  ❌ 读取文件 ${filePath} 失败:`, error);
						}
					}
				}

				if (!found) {
					console.error(`  ❌ 文件 ${file.title} (${file.filename}) 未找到，尝试的所有路径都失败`);
				}
			}
		}

		console.log(`📊 文件收集完成: 找到 ${learningFiles.length} 个学习文件`);
		learningFiles.forEach((file, index) => {
			console.log(`  ${index + 1}. ${file.title} (${file.path}) - 内容长度: ${file.content?.length || 0}`);
		});

		return learningFiles;
	}

	/**
	 * 显示完成通知
	 */
	private showCompletionNotice(
		totalDecks: number,
		totalCards: number,
		pathName: string,
		errors: string[]
	): void {
		if (errors.length === 0) {
			// 完全成功
			new Notice(
				`🎉 闪卡生成完成！\n` +
				`📚 学习路径: ${pathName}\n` +
				`🃏 生成了 ${totalDecks} 个卡组\n` +
				`📝 共 ${totalCards} 张闪卡\n` +
				`💡 可以在闪卡视图中开始学习`,
				8000
			);
		} else {
			// 部分成功
			new Notice(
				`⚠️ 闪卡生成完成，但有 ${errors.length} 个错误\n` +
				`📚 学习路径: ${pathName}\n` +
				`✅ 成功: ${totalDecks} 个卡组，${totalCards} 张闪卡\n` +
				`❌ 失败: ${errors.length} 个文件\n` +
				`💡 可以在闪卡视图中查看已生成的卡组`,
				10000
			);
		}
	}

	/**
	 * 估算推荐的闪卡总数量
	 */
	async estimateRecommendedCards(outline: LearningPathOutline): Promise<{
		totalFiles: number;
		totalCards: number;
		estimatedTime: number; // 预估生成时间（分钟）
	}> {
		const enabledFiles = outline.files.filter(file => file.enabled);
		let totalCards = 0;

		// 简单估算：基于文件类型
		for (const file of enabledFiles) {
			let estimatedCount = 0;

			switch (file.type) {
				case 'guide':
					estimatedCount = 8;  // 指南类文件通常内容较多
					break;
				case 'lesson':
					estimatedCount = 6;  // 课程文件
					break;
				case 'practice':
					estimatedCount = 4;  // 练习文件
					break;
				case 'quiz':
					estimatedCount = 3;  // 测验文件概念较少
					break;
				default:
					estimatedCount = 5;
			}

			totalCards += estimatedCount;
		}

		// 预估生成时间：每个文件平均1-2分钟
		const estimatedTime = Math.ceil(enabledFiles.length * 1.5);

		return {
			totalFiles: enabledFiles.length,
			totalCards,
			estimatedTime
		};
	}
}