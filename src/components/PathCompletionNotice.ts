import { App, Modal, Notice, setIcon } from 'obsidian';
import { LearningPathConfig, LearningPathOutline } from '../learningPath/types';

/**
 * 学习路径完成通知组件
 */
export class PathCompletionNotice extends Modal {
	private config: LearningPathConfig;
	private outline: LearningPathOutline;
	private createdFiles: string[];

	constructor(
		app: App,
		config: LearningPathConfig,
		outline: LearningPathOutline,
		createdFiles: string[],
		private handleClose: () => void
	) {
		super(app);
		this.config = config;
		this.outline = outline;
		this.createdFiles = createdFiles;

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
			{ icon: '📂', text: '查看文件夹，开始学习' },
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

		// 查看文件夹按钮
		const viewFolderBtn = buttonContainer.createEl('button', {
			text: '',
			cls: 'notice-button primary'
		});

		// 设置图标和文本
		const folderIcon = viewFolderBtn.createSpan({ cls: 'button-icon' });
		setIcon(folderIcon, 'folder');
		viewFolderBtn.createSpan({ text: '查看文件夹', cls: 'button-text' });

		viewFolderBtn.addEventListener('click', () => {
			this.openFolder();
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
	 * 打开文件夹
	 */
	private openFolder(): void {
		const targetPath = `${this.config.targetDirectory}/${this.outline.title}`;

		// 尝试在Obsidian中打开文件夹
		try {
			// 检查文件夹是否存在
			const folder = this.app.vault.getAbstractFileByPath(targetPath);
			if (folder) {
				// 尝试在文件浏览器中显示该文件夹
				// 注意：这个API可能不稳定，在某些版本中可能不可用
				try {
					(this.app as any).fileExplorer?.reveal?.(folder);
				} catch (e) {
					// 如果fileExplorer不可用，我们只能显示成功消息
					console.log('文件夹已创建:', targetPath);
				}
			} else {
				new Notice('文件夹不存在或已被移动');
			}
		} catch (error) {
			console.error('打开文件夹失败:', error);
			new Notice('打开文件夹失败');
		}

		this.close();
	}

	/**
	 * 生成闪卡
	 */
	private generateFlashcards(): void {
		// 这里需要调用闪卡生成功能
		// 由于这涉及到与现有闪卡系统的集成，我们先显示一个提示
		new Notice('闪卡生成功能正在开发中...');

		// TODO: 实现闪卡生成逻辑
		// 1. 收集学习路径文件内容
		// 2. 调用 FlashcardGenerator
		// 3. 显示闪卡确认对话框

		this.close();
	}
}