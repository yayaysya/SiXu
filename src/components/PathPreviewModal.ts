import { App, Modal, Notice, Setting } from 'obsidian';
import { LearningPathOutline, LearningPathFile, LearningPathConfig, FILE_TYPE_LABELS, DEPTH_LABELS } from '../learningPath/types';

/**
 * 学习路径预览模态框
 */
export class PathPreviewModal extends Modal {
	private outline: LearningPathOutline;
	private config: LearningPathConfig;
	private onConfirm: (outline: LearningPathOutline, config: LearningPathConfig) => void;
	private onBack: () => void;

	// UI元素
	private fileCheckboxes: {
		file: LearningPathFile;
		checkbox: HTMLInputElement | null;
		selectorElement?: HTMLElement;
		selectorCircle?: HTMLElement;
		selectorDot?: HTMLElement;
	}[] = [];

	constructor(
		app: App,
		outline: LearningPathOutline,
		config: LearningPathConfig,
		onConfirm: (outline: LearningPathOutline, config: LearningPathConfig) => void,
		onBack: () => void
	) {
		super(app);
		this.outline = outline;
		this.config = config;
		this.onConfirm = onConfirm;
		this.onBack = onBack;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// 添加自定义类名
		this.modalEl.addClass('path-preview-modal');
		this.modalEl.addClass('learning-path-modal');

		// 标题区域
		this.createHeaderSection(contentEl);

		// 目标信息
		this.createTargetInfoSection(contentEl);

		// 文件列表
		this.createFileListSection(contentEl);

		// 按钮
		this.createButtonSection(contentEl);

		// 初始化复选框事件
		this.initializeCheckboxEvents();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 创建标题区域
	 */
	private createHeaderSection(container: HTMLElement): void {
		const headerEl = container.createDiv({ cls: 'preview-header' });

		// 主标题
		const titleEl = headerEl.createEl('h2', {
			text: `📚 ${this.outline.title}`,
			cls: 'preview-title'
		});

		// 描述
		const descEl = headerEl.createEl('p', {
			text: this.outline.description,
			cls: 'preview-description'
		});

		// 学习深度标签
		const depthBadge = headerEl.createSpan({
			text: DEPTH_LABELS[this.config.depth],
			cls: 'depth-badge'
		});

		// 预计时长
		const hoursBadge = headerEl.createSpan({
			text: `⏱️ 预计 ${this.outline.estimatedHours} 小时`,
			cls: 'hours-badge'
		});
	}

	/**
	 * 创建目标信息区域
	 */
	private createTargetInfoSection(container: HTMLElement): void {
		const infoContainer = container.createDiv({ cls: 'target-info-container' });

		const infoLabel = infoContainer.createDiv({
			text: '📂 保存位置',
			cls: 'info-label'
		});

		const pathDisplay = infoContainer.createDiv({
			text: `${this.config.targetDirectory}/${this.outline.title}`,
			cls: 'path-display'
		});

		// 文件统计
		const statsContainer = infoContainer.createDiv({ cls: 'stats-container' });

		const totalFiles = this.outline.files.length;
		const enabledFiles = this.outline.files.filter(f => f.enabled).length;

		const statsText = statsContainer.createDiv({
			text: `共 ${totalFiles} 个文件，已选择 ${enabledFiles} 个`,
			cls: 'stats-text'
		});
	}

	/**
	 * 创建文件列表区域
	 */
	private createFileListSection(container: HTMLElement): void {
		const listContainer = container.createDiv({ cls: 'file-list-container' });

		const listLabel = listContainer.createDiv({
			text: '📄 文件列表',
			cls: 'list-label'
		});

		const filesEl = listContainer.createDiv({ cls: 'files-list' });

		// 创建文件项
		this.outline.files.forEach((file, index) => {
			this.createFileItem(filesEl, file, index);
		});

		// 全选/取消全选控制
		this.createSelectionControls(filesEl);
	}

	/**
	 * 创建单个文件项
	 */
	private createFileItem(container: HTMLElement, file: LearningPathFile, index: number): void {
		const fileItem = container.createDiv({ cls: 'file-item' });

		// 根据选中状态设置样式
		if (file.enabled) {
			fileItem.addClass('selected');
		}

		// 选择器（类似radio样式）
		const selectorContainer = fileItem.createDiv({ cls: 'file-selector-container' });
		const selector = selectorContainer.createDiv({ cls: 'file-selector' });

		// 创建圆形选择器
		const selectorCircle = selector.createDiv({ cls: 'file-selector-circle' });
		if (file.enabled) {
			selectorCircle.addClass('selected');
		}

		// 内部圆点
		const selectorDot = selectorCircle.createDiv({ cls: 'file-selector-dot' });
		if (file.enabled) {
			selectorDot.addClass('selected');
		}

		// 文件信息
		const fileInfo = fileItem.createDiv({ cls: 'file-info' });

		// 序号和文件名
		const fileHeader = fileInfo.createDiv({ cls: 'file-header' });

		const orderSpan = fileHeader.createSpan({
			text: `${String(index + 1).padStart(2, '0')}.`,
			cls: 'file-order'
		});

		const filenameSpan = fileHeader.createSpan({
			text: file.filename,
			cls: 'file-filename'
		});

		const typeSpan = fileHeader.createSpan({
			text: FILE_TYPE_LABELS[file.type],
			cls: 'file-type-badge'
		});

		// 文件标题
		const titleSpan = fileInfo.createDiv({
			text: file.title,
			cls: 'file-title'
		});

		// 存储选择器引用
		this.fileCheckboxes.push({
			file,
			checkbox: null,
			selectorElement: fileItem,
			selectorCircle,
			selectorDot
		});

		// 点击切换选中状态
		fileItem.addEventListener('click', (e) => {
			const newSelectedState = !file.enabled;
			this.updateFileEnabled(file, newSelectedState, fileItem, selectorCircle, selectorDot);
			this.updateStats();
		});
	}

	/**
	 * 创建选择控制区域
	 */
	private createSelectionControls(container: HTMLElement): void {
		const controlsContainer = container.createDiv({ cls: 'selection-controls' });

		const selectAllBtn = controlsContainer.createEl('button', {
			text: '全选',
			cls: 'control-button'
		});

		const deselectAllBtn = controlsContainer.createEl('button', {
			text: '取消全选',
			cls: 'control-button'
		});

		selectAllBtn.addEventListener('click', () => {
			this.fileCheckboxes.forEach(({ file }) => {
				file.enabled = true;
				this.updateFileEnabled(file, true);
			});
			this.updateStats();
		});

		deselectAllBtn.addEventListener('click', () => {
			this.fileCheckboxes.forEach(({ file }) => {
				file.enabled = false;
				this.updateFileEnabled(file, false);
			});
			this.updateStats();
		});
	}

	/**
	 * 创建按钮区域
	 */
	private createButtonSection(container: HTMLElement): void {
		const buttonContainer = container.createDiv({ cls: 'modal-button-container' });

		const backBtn = buttonContainer.createEl('button', {
			text: '返回修改',
			cls: 'modal-back-button'
		});

		const confirmBtn = buttonContainer.createEl('button', {
			text: '🚀 确认并创建',
			cls: 'mod-cta modal-confirm-button'
		});

		// 检查是否有选中的文件
		const hasEnabledFiles = this.outline.files.some(f => f.enabled);
		confirmBtn.disabled = !hasEnabledFiles;

		backBtn.addEventListener('click', () => {
			this.close();
			this.onBack();
		});

		confirmBtn.addEventListener('click', () => {
			if (!hasEnabledFiles) {
				new Notice('请至少选择一个文件来创建');
				return;
			}

			// 显示加载状态
			confirmBtn.textContent = '⏳ 创建中...';
			confirmBtn.disabled = true;

			// 延迟关闭以显示加载状态
			setTimeout(() => {
				this.close();
				this.onConfirm(this.outline, this.config);
			}, 300);
		});
	}

	/**
	 * 初始化复选框事件
	 */
	private initializeCheckboxEvents(): void {
		// 初始化时更新统计
		this.updateStats();
	}

	/**
	 * 更新文件启用状态
	 */
	private updateFileEnabled(
		file: LearningPathFile,
		enabled: boolean,
		fileItem?: HTMLElement,
		selectorCircle?: HTMLElement,
		selectorDot?: HTMLElement
	): void {
		file.enabled = enabled;

		// 更新UI视觉状态
		if (fileItem && selectorCircle && selectorDot) {
			fileItem.toggleClass('selected', enabled);
			fileItem.toggleClass('disabled', !enabled);
			selectorCircle.toggleClass('selected', enabled);
			selectorDot.toggleClass('selected', enabled);
		} else {
			// 通过查找元素来更新（用于全选/取消全选操作）
			const fileData = this.fileCheckboxes.find(({ file: f }) => f === file);
			if (fileData && fileData.selectorElement && fileData.selectorCircle && fileData.selectorDot) {
				fileData.selectorElement.toggleClass('selected', enabled);
				fileData.selectorElement.toggleClass('disabled', !enabled);
				fileData.selectorCircle.toggleClass('selected', enabled);
				fileData.selectorDot.toggleClass('selected', enabled);
			}
		}
	}

	/**
	 * 更新统计信息
	 */
	private updateStats(): void {
		const totalFiles = this.outline.files.length;
		const enabledFiles = this.outline.files.filter(f => f.enabled).length;

		const statsText = this.contentEl.querySelector('.stats-text') as HTMLElement;
		if (statsText) {
			statsText.textContent = `共 ${totalFiles} 个文件，已选择 ${enabledFiles} 个`;
		}

		// 更新确认按钮状态
		const confirmBtn = this.contentEl.querySelector('.modal-confirm-button') as HTMLButtonElement;
		if (confirmBtn) {
			confirmBtn.disabled = enabledFiles === 0;
		}
	}
}