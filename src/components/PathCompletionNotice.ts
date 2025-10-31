import { App, Modal, Notice, setIcon, TFile } from 'obsidian';
import { LearningPathConfig, LearningPathOutline } from '../learningPath/types';
import { LearningPathFlashcardService } from '../learningPath/LearningPathFlashcardService';
import NotebookLLMPlugin from '../main';
import { TaskStatus } from '../types';

/**
 * 学习路径完成通知组件
 */
export class PathCompletionNotice extends Modal {
	private config: LearningPathConfig;
	private outline: LearningPathOutline;
	private createdFiles: string[];
	private plugin: NotebookLLMPlugin;
	private flashcardService: LearningPathFlashcardService;

	constructor(
		app: App,
		config: LearningPathConfig,
		outline: LearningPathOutline,
		createdFiles: string[],
		plugin: NotebookLLMPlugin,
		private handleClose: () => void
	) {
		super(app);
		this.config = config;
		this.outline = outline;
		this.createdFiles = createdFiles;
		this.plugin = plugin;

		this.flashcardService = new LearningPathFlashcardService(app, this.plugin);

		// 设置模态框样式
		this.modalEl.addClass('path-completion-notice');
		// 不显示默认的关闭按钮
		this.modalEl.querySelector('.modal-close-button')?.remove();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// 创建通知内容
		this.createNoticeContent(contentEl);

		// 添加背景遮罩点击关闭事件
		this.modalEl.addEventListener('click', (e) => {
			if (e.target === this.modalEl) {
				this.close();
			}
		});

		// 自动关闭定时器（可选）
		setTimeout(() => {
			// 可以选择自动关闭或保持打开
			// this.close();
		}, 30000); // 30秒后可选择自动关闭
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.handleClose();
	}

	/**
	 * 创建通知内容
	 */
	private createNoticeContent(container: HTMLElement): void {
		// 主容器
		const noticeContainer = container.createDiv({ cls: 'completion-notice-container' });

		// 头部区域
		this.createHeaderSection(noticeContainer);

		// 内容区域
		this.createContentSection(noticeContainer);

		// 按钮区域
		this.createButtonSection(noticeContainer);
	}

	/**
	 * 创建头部区域
	 */
	private createHeaderSection(container: HTMLElement): void {
		const header = container.createDiv({ cls: 'notice-header' });

		// 成功图标
		const iconContainer = header.createDiv({ cls: 'notice-icon' });
		iconContainer.innerHTML = '🚀';

		// 标题
		const title = header.createEl('h2', {
			text: `学习路径 "${this.outline.title}" 已准备就绪！`,
			cls: 'notice-title'
		});

		// 副标题
		const subtitle = header.createEl('p', {
			text: '您的个性化学习材料已经成功生成',
			cls: 'notice-subtitle'
		});
	}

	/**
	 * 创建内容区域
	 */
	private createContentSection(container: HTMLElement): void {
		const content = container.createDiv({ cls: 'notice-content' });

		// 统计信息
		this.createStatsInfo(content);

		// 文件列表预览
		this.createFilesPreview(content);

		// 下一步建议
		this.createNextSteps(content);
	}

	/**
	 * 创建统计信息
	 */
	private createStatsInfo(container: HTMLElement): void {
		const statsContainer = container.createDiv({ cls: 'stats-container' });

		// 文件数量
		const fileCountStat = statsContainer.createDiv({ cls: 'stat-item' });
		fileCountStat.createDiv({ cls: 'stat-icon', text: '📄' });
		fileCountStat.createDiv({ cls: 'stat-value', text: String(this.createdFiles.length) });
		fileCountStat.createDiv({ cls: 'stat-label', text: '个文件' });

		// 预计学习时长
		const hoursStat = statsContainer.createDiv({ cls: 'stat-item' });
		hoursStat.createDiv({ cls: 'stat-icon', text: '⏱️' });
		hoursStat.createDiv({ cls: 'stat-value', text: String(this.outline.estimatedHours) });
		hoursStat.createDiv({ cls: 'stat-label', text: '小时' });

		// 学习深度
		const depthStat = statsContainer.createDiv({ cls: 'stat-item' });
		const depthLabels = {
			quick: '⚡ 快速入门',
			deep: '🔬 深入探究',
			project: '🛠️ 项目实战'
		};
		depthStat.createDiv({ cls: 'stat-icon', text: '🎯' });
		depthStat.createDiv({ cls: 'stat-value', text: depthLabels[this.config.depth].split(' ')[0] });
		depthStat.createDiv({ cls: 'stat-label', text: depthLabels[this.config.depth].split(' ')[1] });
	}

	/**
	 * 创建文件列表预览
	 */
	private createFilesPreview(container: HTMLElement): void {
		const previewContainer = container.createDiv({ cls: 'files-preview' });

		const previewTitle = previewContainer.createDiv({
			text: '📚 已生成的学习材料',
			cls: 'preview-title'
		});

		const filesList = previewContainer.createDiv({ cls: 'files-list' });

		// 显示前5个文件，如果更多显示省略号
		const previewFiles = this.outline.files.slice(0, 5);
		const hasMore = this.outline.files.length > 5;

		previewFiles.forEach((file, index) => {
			if (file.enabled) {
				const fileItem = filesList.createDiv({ cls: 'file-preview-item' });

				// 文件类型图标
				const typeIcons = {
					guide: '📖',
					lesson: '📚',
					practice: '✏️',
					quiz: '📝'
				};

				const iconSpan = fileItem.createSpan({
					text: typeIcons[file.type] || '📄',
					cls: 'file-icon'
				});

				const nameSpan = fileItem.createSpan({
					text: file.title,
					cls: 'file-name'
				});
			}
		});

		if (hasMore) {
			const moreItem = filesList.createDiv({
				text: `... 还有 ${this.outline.files.length - 5} 个文件`,
				cls: 'more-files'
			});
		}
	}

	/**
	 * 创建下一步建议
	 */
	private createNextSteps(container: HTMLElement): void {
		const stepsContainer = container.createDiv({ cls: 'next-steps' });

		const stepsTitle = stepsContainer.createDiv({
			text: '💡 接下来您可以：',
			cls: 'steps-title'
		});

		const stepsList = stepsContainer.createDiv({ cls: 'steps-list' });

		const steps = [
			{ icon: '🚀', text: '开始学习第一个文件' },
			{ icon: '🃏', text: '为核心概念生成闪卡' },
			{ icon: '📝', text: '创建学习笔记' },
			{ icon: '🔄', text: '分享给朋友学习' }
		];

		steps.forEach(step => {
			const stepItem = stepsList.createDiv({ cls: 'step-item' });
			stepItem.createSpan({ text: step.icon, cls: 'step-icon' });
			stepItem.createSpan({ text: step.text, cls: 'step-text' });
		});
	}

	/**
	 * 创建按钮区域
	 */
	private createButtonSection(container: HTMLElement): void {
		const buttonContainer = container.createDiv({ cls: 'notice-button-container' });

		// 开始学习按钮
		const startLearningBtn = buttonContainer.createEl('button', {
			text: '',
			cls: 'notice-button primary'
		});

		// 设置图标和文本
		const playIcon = startLearningBtn.createSpan({ cls: 'button-icon' });
		setIcon(playIcon, 'play');
		startLearningBtn.createSpan({ text: '开始学习', cls: 'button-text' });

		startLearningBtn.addEventListener('click', () => {
			this.openFirstLearningFile();
		});

		// 生成闪卡按钮
		const flashcardBtn = buttonContainer.createEl('button', {
			text: '',
			cls: 'notice-button secondary'
		});

		const flashcardIcon = flashcardBtn.createSpan({ cls: 'button-icon' });
		flashcardIcon.innerHTML = '🃏';
		flashcardBtn.createSpan({ text: '生成闪卡', cls: 'button-text' });

		flashcardBtn.addEventListener('click', () => {
			this.generateFlashcards();
		});

		// 关闭按钮
		const closeBtn = buttonContainer.createEl('button', {
			text: '',
			cls: 'notice-button close'
		});

		const closeIcon = closeBtn.createSpan({ cls: 'button-icon' });
		setIcon(closeIcon, 'x');
		closeBtn.createSpan({ text: '关闭', cls: 'button-text' });

		closeBtn.addEventListener('click', () => {
			this.close();
		});
	}

	/**
	 * 打开第一个学习文件
	 */
	private async openFirstLearningFile(): Promise<void> {
		try {
			console.log('🚀 开始查找第一个学习文件');

			let firstFilePath: string | null = null;
			let fileName: string | null = null;

			// 优先从已创建的文件列表中查找第一个文件
			if (this.createdFiles && this.createdFiles.length > 0) {
				firstFilePath = this.createdFiles[0];
				fileName = firstFilePath.split('/').pop() || firstFilePath;
				console.log(`从createdFiles找到第一个文件: ${firstFilePath}`);
			}

			// 如果createdFiles为空，则从outline中查找第一个启用的文件
			if (!firstFilePath) {
				const enabledFiles = this.outline.files.filter(f => f.enabled);
				if (enabledFiles.length > 0) {
					const firstFile = enabledFiles[0];
					// 尝试多种可能的路径格式
					const possiblePaths = [
						`${this.outline.title}/${firstFile.filename}`,
						`${this.outline.title}/${firstFile.filename}.md`,
						firstFile.filename,
						`${firstFile.filename}.md`
					];

					for (const path of possiblePaths) {
						const fileObj = this.app.vault.getAbstractFileByPath(path);
						if (fileObj instanceof TFile) {
							firstFilePath = path;
							fileName = firstFile.title;
							console.log(`从outline找到第一个文件: ${firstFilePath}`);
							break;
						}
					}
				}
			}

			if (!firstFilePath) {
				new Notice('未找到可用的学习文件');
				return;
			}

			// 获取文件对象
			const file = this.app.vault.getAbstractFileByPath(firstFilePath);
			if (!(file instanceof TFile)) {
				new Notice(`文件不存在或格式错误: ${fileName}`);
				return;
			}

			// 在新标签页中打开文件
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);

			console.log(`✅ 成功打开学习文件: ${fileName}`);
			new Notice(`已打开学习文件: ${fileName}`, 3000);

			// 关闭完成通知模态框
			this.close();

		} catch (error) {
			console.error('打开学习文件失败:', error);
			new Notice(`打开文件失败: ${error.message}`, 5000);
		}
	}

	/**
	 * 生成闪卡
	 */
	private async generateFlashcards(): Promise<void> {
		try {
			// 显示开始提示
			new Notice('🚀 开始生成闪卡...');

			// 禁用按钮，防止重复点击
			const flashcardBtn = this.modalEl.querySelector('.notice-button.secondary') as HTMLButtonElement;
			if (flashcardBtn) {
				flashcardBtn.disabled = true;
				flashcardBtn.textContent = '生成中...';
			}

			// 创建任务ID
			const taskId = `flashcard_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

			// 注册进度回调到状态栏
			this.plugin.taskQueue.onProgress(taskId, (progress, status, message) => {
				if (this.plugin.statusBarManager) {
					this.plugin.statusBarManager.showTaskStatus(
						taskId,
						status as TaskStatus,
						progress,
						message
					);
				}
			});

			// 估算推荐数量并显示确认
			const estimation = await this.flashcardService.estimateRecommendedCards(this.outline);

			const confirmed = await this.showFlashcardConfirmation(estimation);
			if (!confirmed) {
				// 清理状态栏
				if (this.plugin.statusBarManager) {
					this.plugin.statusBarManager.hide();
				}
				this.plugin.taskQueue.offProgress(taskId);

				// 恢复按钮
				if (flashcardBtn) {
					flashcardBtn.disabled = false;
					flashcardBtn.innerHTML = '<span class="button-icon">🃏</span><span class="button-text">生成闪卡</span>';
				}
				return;
			}

			// 开始生成闪卡
			const result = await this.flashcardService.generateFlashcardsFromPath(
				this.config,
				this.outline,
				this.createdFiles,
				(percent, status, currentFile) => {
					// 更新状态栏进度
					if (this.plugin.statusBarManager) {
						this.plugin.statusBarManager.showTaskStatus(
							taskId,
							TaskStatus.GENERATING,
							percent,
							status
						);
					}
				}
			);

			// 清理状态栏
			setTimeout(() => {
				if (this.plugin.statusBarManager) {
					this.plugin.statusBarManager.hide();
				}
				this.plugin.taskQueue.offProgress(taskId);
			}, 3000);

			// 显示结果
			if (result.success) {
				new Notice(`✅ 成功生成 ${result.totalDecks} 个卡组，共 ${result.totalCards} 张闪卡！`, 5000);
				this.close();
			} else {
				new Notice(`❌ 生成过程中遇到错误: ${result.errors.join(', ')}`, 8000);
				// 恢复按钮
				if (flashcardBtn) {
					flashcardBtn.disabled = false;
					flashcardBtn.innerHTML = '<span class="button-icon">🃏</span><span class="button-text">生成闪卡</span>';
				}
			}

		} catch (error) {
			console.error('生成闪卡失败:', error);
			new Notice(`生成闪卡失败: ${error.message}`, 8000);

			// 恢复按钮
			const flashcardBtn = this.modalEl.querySelector('.notice-button.secondary') as HTMLButtonElement;
			if (flashcardBtn) {
				flashcardBtn.disabled = false;
				flashcardBtn.innerHTML = '<span class="button-icon">🃏</span><span class="button-text">生成闪卡</span>';
			}
		}
	}

	/**
	 * 显示闪卡生成确认对话框
	 */
	private async showFlashcardConfirmation(estimation: {
		totalFiles: number;
		totalCards: number;
		estimatedTime: number;
	}): Promise<boolean> {
		return new Promise((resolve) => {
			const confirmModal = new Modal(this.app);
			confirmModal.modalEl.addClass('flashcard-confirmation-modal');

			confirmModal.onOpen = () => {
				const { contentEl } = confirmModal;
				contentEl.empty();

				const container = contentEl.createDiv({ cls: 'confirmation-container' });

				// 标题
				container.createEl('h3', {
					text: '🃏 生成学习闪卡',
					cls: 'confirmation-title'
				});

				// 预估信息
				const infoDiv = container.createDiv({ cls: 'confirmation-info' });
				infoDiv.createDiv({ text: `📁 将处理 ${estimation.totalFiles} 个学习文件` });
				infoDiv.createDiv({ text: `📝 预计生成 ${estimation.totalCards} 张闪卡` });
				infoDiv.createDiv({ text: `⏱️ 预计用时: ${estimation.estimatedTime} 分钟` });

				// 说明
				const descDiv = container.createDiv({ cls: 'confirmation-description' });
				descDiv.createDiv({ text: '系统将为每个学习文件创建独立的闪卡组，' });
				descDiv.createDiv({ text: '基于内容智能推荐合适数量的闪卡。' });

				// 按钮组
				const buttonDiv = container.createDiv({ cls: 'confirmation-buttons' });

				const confirmBtn = buttonDiv.createEl('button', {
					text: `✅ 生成 ${estimation.totalCards} 张闪卡`,
					cls: 'confirm-button'
				});

				const cancelBtn = buttonDiv.createEl('button', {
					text: '取消',
					cls: 'cancel-button'
				});

				confirmBtn.addEventListener('click', () => {
					confirmModal.close();
					resolve(true);
				});

				cancelBtn.addEventListener('click', () => {
					confirmModal.close();
					resolve(false);
				});
			};

			confirmModal.onClose = () => {
				const { contentEl } = confirmModal;
				contentEl.empty();
			};

			confirmModal.open();
		});
	}
}