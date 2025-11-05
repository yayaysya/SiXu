import { setIcon } from 'obsidian';

/**
 * 进度卡片选项
 */
export interface ProgressCardOptions {
	/** 任务标题 */
	title: string;
	/** 取消回调 */
	onCancel: () => void;
	/** 后台运行回调 */
	onBackground: () => void;
}

/**
 * 进度卡片组件
 * 显示任务进度，支持取消和后台运行
 */
export class ProgressCard {
	private overlay: HTMLElement;
	private card: HTMLElement;
	private progressBar: HTMLElement;
	private statusText: HTMLElement;
	private percentText: HTMLElement;
	private isVisible: boolean = false;

	constructor(parent: HTMLElement, private options: ProgressCardOptions) {
		// 创建遮罩层
		this.overlay = parent.createDiv({ cls: 'progress-card-overlay' });
		this.overlay.style.display = 'none';
		this.overlay.style.pointerEvents = 'none'; // 隐藏时不阻止点击事件

		// 创建卡片
		this.card = this.overlay.createDiv({ cls: 'progress-card' });

		// 标题
		this.card.createDiv({
			cls: 'progress-card-title',
			text: options.title
		});

		// 旋转的加载图标
		const spinner = this.card.createDiv({ cls: 'progress-card-spinner' });
		setIcon(spinner, 'loader-2');

		// 进度百分比
		this.percentText = this.card.createDiv({
			cls: 'progress-percent',
			text: '0%'
		});

		// 进度条容器
		const progressContainer = this.card.createDiv({ cls: 'progress-bar-container' });
		this.progressBar = progressContainer.createDiv({ cls: 'progress-bar-fill' });
		this.progressBar.style.width = '0%';

		// 状态文本
		this.statusText = this.card.createDiv({
			cls: 'progress-status',
			text: '准备中...'
		});

		// 按钮区域
		const actions = this.card.createDiv({ cls: 'progress-card-actions' });

		// 后台运行按钮
		const bgBtn = actions.createEl('button', {
			cls: 'progress-btn progress-btn-background',
			text: '后台运行'
		});
		bgBtn.addEventListener('click', () => {
			this.options.onBackground();
		});

		// 取消按钮
		const cancelBtn = actions.createEl('button', {
			cls: 'progress-btn progress-btn-cancel',
			text: '取消'
		});
		cancelBtn.addEventListener('click', () => {
			this.options.onCancel();
		});
	}

	/**
	 * 更新进度
	 * @param percent 进度百分比 (0-100)
	 * @param status 状态描述
	 */
	updateProgress(percent: number, status: string): void {
		// 确保百分比在0-100之间
		percent = Math.max(0, Math.min(100, percent));

		this.percentText.setText(`${Math.round(percent)}%`);
		this.progressBar.style.width = `${percent}%`;
		this.statusText.setText(status);
	}

	/**
	 * 显示进度卡片
	 */
	show(): void {
		this.overlay.style.display = 'flex';
		this.overlay.style.pointerEvents = 'auto'; // 显示时允许点击事件
		this.isVisible = true;
	}

	/**
	 * 隐藏进度卡片（但不销毁，用于后台运行）
	 */
	hide(): void {
		this.overlay.style.display = 'none';
		this.overlay.style.pointerEvents = 'none'; // 隐藏时不阻止点击事件
		this.isVisible = false;
	}

	/**
	 * 销毁进度卡片
	 */
	destroy(): void {
		this.overlay.remove();
		this.isVisible = false;
	}

	/**
	 * 检查是否可见
	 */
	isShown(): boolean {
		return this.isVisible;
	}
}
