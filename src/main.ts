import { App, Plugin, TFile, Notice, MarkdownView, WorkspaceLeaf } from 'obsidian';
import { NotebookLLMSettings, DEFAULT_SETTINGS, TaskStatus, ImageInfo, LinkInfo, AIProvider } from './types';
import { NotebookLLMSettingTab } from './settings';
import { createTextProvider, createVisionProvider } from './api/factory';
import { DebugMarkdownLogger } from './utils/DebugMarkdown';
import { ensureDirectory } from './utils/fileUtils';
import { MarkdownParser } from './parsers/markdown';
import { ImageProcessor } from './processors/image';
import { LinkProcessor } from './processors/link';
import { TextProcessor } from './processors/text';
import { TaskQueue, StatusBarManager } from './taskQueue';
import { getTemplate } from './prompts/templates';
import { CombineNotesView, COMBINE_VIEW_TYPE } from './views/combineView';

export default class NotebookLLMPlugin extends Plugin {
	settings: NotebookLLMSettings;
	taskQueue: TaskQueue;
	statusBarManager: StatusBarManager;

	async onload() {
		await this.loadSettings();

		// 注册组合笔记视图
		this.registerView(
			COMBINE_VIEW_TYPE,
			(leaf) => new CombineNotesView(leaf, this)
		);

		// 初始化任务队列
		this.taskQueue = new TaskQueue();

		// 添加状态栏
		const statusBarItem = this.addStatusBarItem();
		statusBarItem.style.display = 'none';
		this.statusBarManager = new StatusBarManager(statusBarItem);

		// 添加命令 - 打开组合笔记侧边栏
		this.addCommand({
			id: 'open-combine-notes-view',
			name: '打开组合笔记侧边栏',
			callback: () => {
				this.activateCombineView();
			}
		});

		// 添加命令
		this.addCommand({
			id: 'organize-current-note',
			name: '整理当前笔记',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === 'md') {
					if (!checking) {
						this.organizeNote(activeFile);
					}
					return true;
				}
				return false;
			}
		});

		// 添加右键菜单
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'md') {
					menu.addItem((item) => {
						item
							.setTitle('添加到待整理列表')
							.setIcon('plus')
							.onClick(() => {
								this.addNoteToCombineList(file);
							});
					});

					menu.addItem((item) => {
						item
							.setTitle('AI 整理笔记')
							.setIcon('sparkles')
							.onClick(() => {
								this.organizeNote(file);
							});
					});
				}
			})
		);

		// 添加编辑器右键菜单
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu, editor, view) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile && activeFile.extension === 'md' && editor.somethingSelected()) {
					menu.addItem((item) => {
						item
							.setTitle('添加笔记到待整理列表')
							.setIcon('plus')
							.onClick(() => {
								this.addNoteToCombineList(activeFile);
							});
					});
				}
			})
		);

		// 添加设置面板
		this.addSettingTab(new NotebookLLMSettingTab(this.app, this));

		// 添加左侧功能区图标 - 组合笔记
		this.addRibbonIcon(
			'orbit',
			'打开思绪-组合笔记',
			() => {
				this.activateCombineView();
			}
		);

		// 定期清理已完成的任务
		this.registerInterval(
			window.setInterval(() => {
				this.taskQueue.cleanupCompletedTasks(3600000); // 1小时
			}, 600000) // 每10分钟清理一次
		);
	}

	onunload() {
		// 清理
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

		// 配置迁移：从旧格式（共享providers）转换为新格式（分离text和vision）
		if (loadedData && loadedData.providers) {
			const oldProviders = loadedData.providers;
			// 检查是否是旧格式（没有text/vision分组）
			if (!oldProviders.text && !oldProviders.vision) {
				console.log('检测到旧版本配置，正在迁移...');
				// 将旧配置复制到text和vision两个分支
				this.settings.providers = {
					text: {
						...DEFAULT_SETTINGS.providers.text,
						...oldProviders
					},
					vision: {
						...DEFAULT_SETTINGS.providers.vision,
						...oldProviders
					}
				};
				// 保存迁移后的配置
				await this.saveSettings();
				console.log('配置迁移完成');
			}
		}

		// 确保自定义服务商持久化属性存在
		const customTextProvider = this.settings.providers.text[AIProvider.CUSTOM];
		if (customTextProvider && !customTextProvider.cachedModels) {
			customTextProvider.cachedModels = [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 激活组合笔记视图
	 */
	async activateCombineView() {
		const { workspace } = this.app;

		// 检查是否已经打开
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(COMBINE_VIEW_TYPE);

		if (leaves.length > 0) {
			// 已存在，直接激活
			leaf = leaves[0];
		} else {
			// 不存在，在右侧边栏创建
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: COMBINE_VIEW_TYPE,
					active: true
				});
			}
		}

		// 激活视图
		if (leaf) {
			workspace.revealLeaf(leaf);
		}
	}

	/**
	 * 整理笔记
	 */
	async organizeNote(file: TFile) {
		// 验证 API Key
		const textProviderConfig = this.settings.providers.text[this.settings.textProvider];
		const visionProviderConfig = this.settings.providers.vision[this.settings.visionProvider as keyof typeof this.settings.providers.vision];

		if (!textProviderConfig.apiKey) {
			new Notice(`❌ 请先在设置中配置 ${this.settings.textProvider} 的 API Key`);
			return;
		}

		if (!visionProviderConfig?.apiKey) {
			new Notice(`❌ 请先在设置中配置 ${this.settings.visionProvider} 的 API Key`);
			return;
		}

		// 生成输出文件路径
		const outputPath = this.generateOutputPath(file);

		// 创建任务
		const task = this.taskQueue.createTask(file.path, outputPath);

		// 显示开始通知
		new Notice(`开始处理笔记: ${file.basename}`);

		// 注册进度回调
		this.taskQueue.onProgress(task.id, (progress, status, message) => {
			this.statusBarManager.showTaskStatus(task.id, status, progress, message);
		});

		// 后台处理
		this.processNoteInBackground(file, task.id, outputPath);
	}

	/**
	 * 生成输出文件路径
	 */
	private generateOutputPath(file: TFile): string {
		const baseName = file.basename;
		const outputName = this.settings.outputFileNameTemplate.replace('{name}', baseName);

		// 根据配置选择输出位置
		if (this.settings.noteOutputMode === 'custom' && this.settings.noteOutputPath) {
			// 自定义输出目录
			return `${this.settings.noteOutputPath}/${outputName}.md`;
		} else {
			// 默认：保存到源笔记所在目录
			const dir = file.parent?.path || '';
			return dir ? `${dir}/${outputName}.md` : `${outputName}.md`;
		}
	}

	/**
	 * 后台处理笔记
	 */
    private async processNoteInBackground(file: TFile, taskId: string, outputPath: string) {
        let logger: DebugMarkdownLogger | undefined;
        try {
            // 初始化调试
            logger = this.settings.debugEnabled ? new DebugMarkdownLogger(this.app, 'AI 整理调试日志') : undefined;
            if (logger) {
                logger.appendSection('运行上下文', {
                    mode: 'single-note',
                    sourceFile: file.path,
                    textProvider: this.settings.textProvider,
                    textModel: this.settings.textModel,
                    visionProvider: this.settings.visionProvider,
                    visionModel: this.settings.visionModel,
                    template: this.settings.selectedPromptTemplate
                });
            }

            // 初始化 AI 和处理器
            const textProvider = createTextProvider(this.settings, logger);
            const visionProvider = createVisionProvider(this.settings, logger);
			const parser = new MarkdownParser(this.app);
            const imageProcessor = new ImageProcessor(visionProvider, this.settings.visionModel, logger);
            const linkProcessor = new LinkProcessor(textProvider, this.settings.textModel, logger);
            const textProcessor = new TextProcessor(textProvider, this.settings.textModel, logger);

			// 1. 解析 Markdown
			this.taskQueue.updateProgress(taskId, 10, TaskStatus.PARSING, '解析笔记内容中...');
			const content = await this.app.vault.read(file);
			const parsed = await parser.parse(content, file);

			// 2. 处理图片
			this.taskQueue.updateProgress(taskId, 20, TaskStatus.PROCESSING_IMAGES, '开始识别图片...');
			const processedImages = await imageProcessor.processImages(
				parsed.images,
				(completed, total) => {
					const progress = 20 + Math.floor((completed / total) * 30);
					const message = `图片${completed}/${total} 理解中...`;
					this.taskQueue.updateProgress(taskId, progress, undefined, message);
				}
			);

			// 3. 处理链接
			this.taskQueue.updateProgress(taskId, 50, TaskStatus.PROCESSING_LINKS, '开始抓取链接内容...');
			const processedLinks = await linkProcessor.processLinks(
				parsed.links,
				(completed, total) => {
					const progress = 50 + Math.floor((completed / total) * 20);
					const message = `链接${completed}/${total} 内容抓取中...`;
					this.taskQueue.updateProgress(taskId, progress, undefined, message);
				}
			);

			// 4. 生成文章
			this.taskQueue.updateProgress(taskId, 70, TaskStatus.GENERATING, '文章组合中...');

			// 获取选中的模板
			const template = getTemplate(
				this.settings.selectedPromptTemplate,
				this.settings.customPromptTemplates
			);

			if (!template) {
				throw new Error('找不到选中的提示词模板');
			}

			const article = await textProcessor.generateArticle(
				content,
				processedImages,
				processedLinks,
				template,
				parsed.metadata
			);

			// 5. 保存文件
			this.taskQueue.updateProgress(taskId, 90, undefined, '保存文件中...');
			const cleanedArticle = textProcessor.cleanArticle(article);

			// 检查文件是否已存在
			const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
			if (existingFile instanceof TFile) {
				// 文件已存在,询问是否覆盖
				const shouldOverwrite = await this.confirmOverwrite(file.basename);
				if (!shouldOverwrite) {
					// 生成新的文件名
					outputPath = this.generateUniqueOutputPath(file, outputPath);
				}
			}

			// 创建或覆盖文件
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, cleanedArticle);
			} else {
				// 确保输出目录存在
				const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/')); 
				if (outputDir) {
					await ensureDirectory(this.app, outputDir);
				}
				await this.app.vault.create(outputPath, cleanedArticle);
			}

            // 6. 完成
			this.taskQueue.completeTask(taskId);
			this.statusBarManager.hide();

			// 显示完成通知
			new Notice(`✅ 笔记整理完成!\n已保存至: ${outputPath}`, 5000);

			// 可选:打开新文件
			const newFile = this.app.vault.getAbstractFileByPath(outputPath);
			if (newFile instanceof TFile) {
				await this.app.workspace.getLeaf().openFile(newFile);
			}
            // 刷新日志
            if (logger) {
                await logger.flush();
            }
        } catch (error) {
			console.error('处理笔记失败:', error);
			this.taskQueue.failTask(taskId, error.message);
			this.statusBarManager.hide();
			new Notice(`❌ 处理失败: ${error.message}`, 5000);
            // 刷新日志（失败场景）
            // best-effort
            try {
                if (logger) {
                    logger.appendSection('错误', { message: (error as any)?.message || String(error) });
                    await logger.flush();
                }
            } catch {}
		}
	}

	/**
	 * 确认是否覆盖文件
	 */
	private async confirmOverwrite(fileName: string): Promise<boolean> {
		return new Promise((resolve) => {
			const modal = new ConfirmModal(
				this.app,
				'文件已存在',
				`文件 "${fileName}_AI整理.md" 已存在,是否覆盖?`,
				(result) => resolve(result)
			);
			modal.open();
		});
	}

	/**
	 * 生成唯一的输出路径
	 */
	private generateUniqueOutputPath(file: TFile, basePath: string): string {
		const dir = file.parent?.path || '';
		const baseName = file.basename;
		let counter = 2;
		let newPath = basePath;

		while (this.app.vault.getAbstractFileByPath(newPath)) {
			const outputName = this.settings.outputFileNameTemplate
				.replace('{name}', `${baseName}_${counter}`);
			newPath = dir ? `${dir}/${outputName}.md` : `${outputName}.md`;
			counter++;
		}

		return newPath;
	}

	/**
	 * 处理组合笔记
	 */
	async processCombinedNotes(
		files: TFile[],
		outputPath: string,
		onProgress?: (percent: number, status: string) => void
	): Promise<void> {
		// 验证 API Key
		const textProviderConfig = this.settings.providers.text[this.settings.textProvider];
		const visionProviderConfig = this.settings.providers.vision[this.settings.visionProvider as keyof typeof this.settings.providers.vision];

		if (!textProviderConfig.apiKey) {
			new Notice(`❌ 请先在设置中配置 ${this.settings.textProvider} 的 API Key`);
			return;
		}

		if (!visionProviderConfig?.apiKey) {
			new Notice(`❌ 请先在设置中配置 ${this.settings.visionProvider} 的 API Key`);
			return;
		}

		// 如果没有提供进度回调，使用旧的任务队列系统
		if (!onProgress) {
			// 创建任务
			const task = this.taskQueue.createTask('组合笔记', outputPath);

			// 注册进度回调
			this.taskQueue.onProgress(task.id, (progress, status, message) => {
				this.statusBarManager.showTaskStatus(task.id, status, progress, message);
			});

			// 后台处理
			this.processCombinedNotesInBackground(files, null, outputPath, onProgress);
		} else {
			// 使用新的进度回调系统
			await this.processCombinedNotesInBackground(files, null, outputPath, onProgress);
		}
	}

	/**
	 * 后台处理组合笔记
	 */
    private async processCombinedNotesInBackground(
		files: TFile[],
		taskId: string | null,
		outputPath: string,
		onProgress?: (percent: number, status: string) => void
	): Promise<void> {
        let logger: DebugMarkdownLogger | undefined;
        try {
            // 初始化调试
            logger = this.settings.debugEnabled ? new DebugMarkdownLogger(this.app, '组合笔记调试日志') : undefined;
            if (logger) {
                logger.appendSection('运行上下文', {
                    mode: 'combined-notes',
                    files: files.map(f => f.path),
                    textProvider: this.settings.textProvider,
                    textModel: this.settings.textModel,
                    visionProvider: this.settings.visionProvider,
                    visionModel: this.settings.visionModel,
                    template: this.settings.selectedPromptTemplate
                });
            }

            // 初始化 AI 和处理器
            const textProvider = createTextProvider(this.settings, logger);
            const visionProvider = createVisionProvider(this.settings, logger);
			const parser = new MarkdownParser(this.app);
            const imageProcessor = new ImageProcessor(visionProvider, this.settings.visionModel, logger);
            const linkProcessor = new LinkProcessor(textProvider, this.settings.textModel, logger);
            const textProcessor = new TextProcessor(textProvider, this.settings.textModel, logger);

			// 1. 分别解析每个文件
			if (taskId) {
				this.taskQueue.updateProgress(taskId, 10, TaskStatus.PARSING, '解析笔记文件中...');
			}
			onProgress?.(10, '解析笔记文件中...');

			const allContents: string[] = [];
			const allImages: ImageInfo[] = [];
			const allLinks: LinkInfo[] = [];
			const allTags: Set<string> = new Set();

			for (let i = 0; i < files.length; i++) {
				const file = files[i];
				const content = await this.app.vault.read(file);

				// 解析文件（保留正确的 sourceFile 上下文）
				const parsed = await parser.parse(content, file);

				// 提取标签
				if (parsed.metadata?.tags) {
					parsed.metadata.tags.forEach(tag => allTags.add(tag));
				}

				// 移除 YAML Front Matter，只保留正文
				const contentWithoutYaml = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
				allContents.push(`# ${file.basename}\n\n${contentWithoutYaml.trim()}`);

				// 收集所有图片和链接
				allImages.push(...parsed.images);
				allLinks.push(...parsed.links);
			}

			// 合并所有内容
			const combinedContent = allContents.join('\n\n---\n\n');

			// 2. 处理图片
			if (taskId) {
				this.taskQueue.updateProgress(taskId, 20, TaskStatus.PROCESSING_IMAGES, '开始识别图片...');
			}
			onProgress?.(20, '开始识别图片...');
			const processedImages = await imageProcessor.processImages(
				allImages,
				(completed, total) => {
					const progress = 20 + Math.floor((completed / total) * 30);
					const message = `图片${completed}/${total} 理解中...`;
					if (taskId) {
						this.taskQueue.updateProgress(taskId, progress, undefined, message);
					}
					onProgress?.(progress, message);
				}
			);

			// 3. 处理链接
			if (taskId) {
				this.taskQueue.updateProgress(taskId, 50, TaskStatus.PROCESSING_LINKS, '开始抓取链接内容...');
			}
			onProgress?.(50, '开始抓取链接内容...');
			const processedLinks = await linkProcessor.processLinks(
				allLinks,
				(completed, total) => {
					const progress = 50 + Math.floor((completed / total) * 20);
					const message = `链接${completed}/${total} 内容抓取中...`;
					if (taskId) {
						this.taskQueue.updateProgress(taskId, progress, undefined, message);
					}
					onProgress?.(progress, message);
				}
			);

			// 4. 生成文章
			if (taskId) {
				this.taskQueue.updateProgress(taskId, 70, TaskStatus.GENERATING, '文章组合中...');
			}
			onProgress?.(70, '文章组合中...');

			// 获取选中的模板
			const template = getTemplate(
				this.settings.selectedPromptTemplate,
				this.settings.customPromptTemplates
			);

			if (!template) {
				throw new Error('找不到选中的提示词模板');
			}

			// 构建元数据（包含合并的标签和源文件列表）
			const sourceFiles = files.map(file => `[[${file.basename}]]`);
			const metadata = {
				tags: Array.from(allTags),
				created: new Date().toISOString().split('T')[0],
				modified: new Date().toISOString().split('T')[0],
				source_files: sourceFiles
			};

			const article = await textProcessor.generateArticle(
				combinedContent,
				processedImages,
				processedLinks,
				template,
				metadata
			);

			// 5. 保存文件
			if (taskId) {
				this.taskQueue.updateProgress(taskId, 90, undefined, '保存文件中...');
			}
			onProgress?.(90, '保存文件中...');
			const cleanedArticle = textProcessor.cleanArticle(article);

			// 检查文件是否已存在
			const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
			if (existingFile instanceof TFile) {
				// 文件已存在，询问是否覆盖
				const shouldOverwrite = await this.confirmOverwrite(outputPath.replace('.md', ''));
				if (!shouldOverwrite) {
					// 生成新的文件名
					const today = new Date().toISOString().split('T')[0];
					let counter = 2;
					outputPath = `组合笔记_${today}_${counter}.md`;
					while (this.app.vault.getAbstractFileByPath(outputPath)) {
						counter++;
						outputPath = `组合笔记_${today}_${counter}.md`;
					}
				}
			}

			// 创建或覆盖文件
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, cleanedArticle);
			} else {
				// 确保输出目录存在
				const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/')); 
				if (outputDir) {
					await ensureDirectory(this.app, outputDir);
				}
				await this.app.vault.create(outputPath, cleanedArticle);
			}

            // 6. 完成
			if (taskId) {
				this.taskQueue.completeTask(taskId);
				this.statusBarManager.hide();
			}
			onProgress?.(100, '组合完成！');

			// 显示完成通知
			new Notice(`✅ 组合笔记整理完成!\n已保存至: ${outputPath}`, 5000);

            // 打开新文件
			const newFile = this.app.vault.getAbstractFileByPath(outputPath);
			if (newFile instanceof TFile) {
				await this.app.workspace.getLeaf().openFile(newFile);
			}

            if (logger) {
                await logger.flush();
            }
		} catch (error) {
			console.error('处理组合笔记失败:', error);
			if (taskId) {
				this.taskQueue.failTask(taskId, error.message);
				this.statusBarManager.hide();
			}
			new Notice(`❌ 处理失败: ${error.message}`, 5000);
            try {
                if (logger) {
                    logger.appendSection('错误', { message: (error as any)?.message || String(error) });
                    await logger.flush();
                }
            } catch {}
            throw error; // 重新抛出错误，让调用者可以处理
		}
	}

	/**
	 * 添加笔记到待整理列表
	 */
	async addNoteToCombineList(file: TFile): Promise<void> {
		try {
			// 检查是否已存在
			if (this.isNoteInCombineList(file)) {
				new Notice('该笔记已在待整理列表中', 3000);
				return;
			}

			// 获取最大order值
			const maxOrder = this.settings.combineNotes.reduce(
				(max, note) => Math.max(max, note.order),
				0
			);

			// 添加新笔记
			const newNote = {
				path: file.path,
				name: file.basename,
				order: maxOrder + 1
			};

			this.settings.combineNotes.push(newNote);
			await this.saveSettings();

			// 显示成功通知
			new Notice(`✅ 已添加 "${file.basename}" 到待整理列表`, 3000);

			// 通知UI更新
			await this.notifyCombineViewUpdate();

		} catch (error) {
			console.error('添加笔记到待整理列表失败:', error);
			new Notice(`❌ 添加失败: ${error.message}`, 5000);
		}
	}

	/**
	 * 检查文件是否已在待整理列表中
	 */
	private isNoteInCombineList(file: TFile): boolean {
		return this.settings.combineNotes.some(note => note.path === file.path);
	}

	/**
	 * 通知所有CombineNotesView实例更新UI
	 */
	private async notifyCombineViewUpdate(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(COMBINE_VIEW_TYPE);

		for (const leaf of leaves) {
			if (leaf.view instanceof CombineNotesView) {
				leaf.view.refresh();
			}
		}
	}
}

/**
 * 确认对话框
 */
import { Modal } from 'obsidian';

class ConfirmModal extends Modal {
	title: string;
	message: string;
	onSubmit: (result: boolean) => void;

	constructor(app: App, title: string, message: string, onSubmit: (result: boolean) => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.title });
		contentEl.createEl('p', { text: this.message });

		const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonDiv.style.display = 'flex';
		buttonDiv.style.justifyContent = 'flex-end';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.marginTop = '20px';

		const cancelButton = buttonDiv.createEl('button', { text: '取消' });
		cancelButton.onclick = () => {
			this.onSubmit(false);
			this.close();
		};

		const confirmButton = buttonDiv.createEl('button', { text: '覆盖', cls: 'mod-warning' });
		confirmButton.onclick = () => {
			this.onSubmit(true);
			this.close();
		};
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
