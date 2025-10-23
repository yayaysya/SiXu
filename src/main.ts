import { App, Plugin, TFile, Notice, MarkdownView } from 'obsidian';
import { NotebookLLMSettings, DEFAULT_SETTINGS, TaskStatus } from './types';
import { NotebookLLMSettingTab } from './settings';
import { ZhipuAI } from './api/zhipu';
import { MarkdownParser } from './parsers/markdown';
import { ImageProcessor } from './processors/image';
import { LinkProcessor } from './processors/link';
import { TextProcessor } from './processors/text';
import { TaskQueue, StatusBarManager } from './taskQueue';
import { getTemplate } from './prompts/templates';

export default class NotebookLLMPlugin extends Plugin {
	settings: NotebookLLMSettings;
	taskQueue: TaskQueue;
	statusBarManager: StatusBarManager;

	async onload() {
		await this.loadSettings();

		// 初始化任务队列
		this.taskQueue = new TaskQueue();

		// 添加状态栏
		const statusBarItem = this.addStatusBarItem();
		statusBarItem.style.display = 'none';
		this.statusBarManager = new StatusBarManager(statusBarItem);

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
							.setTitle('AI 整理笔记')
							.setIcon('sparkles')
							.onClick(() => {
								this.organizeNote(file);
							});
					});
				}
			})
		);

		// 添加设置面板
		this.addSettingTab(new NotebookLLMSettingTab(this.app, this));

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
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 整理笔记
	 */
	async organizeNote(file: TFile) {
		// 验证 API Key
		if (!this.settings.apiKey) {
			new Notice('❌ 请先在设置中配置智谱 AI API Key');
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
		const dir = file.parent?.path || '';
		const baseName = file.basename;
		const outputName = this.settings.outputFileNameTemplate.replace('{name}', baseName);

		return dir ? `${dir}/${outputName}.md` : `${outputName}.md`;
	}

	/**
	 * 后台处理笔记
	 */
	private async processNoteInBackground(file: TFile, taskId: string, outputPath: string) {
		try {
			// 初始化 AI 和处理器
			const zhipu = new ZhipuAI(this.settings.apiKey, this.settings.apiBaseUrl);
			const parser = new MarkdownParser(this.app);
			const imageProcessor = new ImageProcessor(zhipu, this.settings.visionModel);
			const linkProcessor = new LinkProcessor(zhipu, this.settings.textModel);
			const textProcessor = new TextProcessor(zhipu, this.settings.textModel);

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
		} catch (error) {
			console.error('处理笔记失败:', error);
			this.taskQueue.failTask(taskId, error.message);
			this.statusBarManager.hide();
			new Notice(`❌ 处理失败: ${error.message}`, 5000);
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
