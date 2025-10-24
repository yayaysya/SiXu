import { ItemView, WorkspaceLeaf } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { CombineNoteItem } from '../types';

export const COMBINE_VIEW_TYPE = 'notebook-llm-combine-view';

/**
 * 组合笔记侧边栏视图
 */
export class CombineNotesView extends ItemView {
	plugin: NotebookLLMPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: NotebookLLMPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return COMBINE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '组合笔记';
	}

	getIcon(): string {
		return 'layers';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl;
		container.empty();
		container.addClass('notebook-llm-combine-view');

		this.render();
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}

	/**
	 * 渲染视图
	 */
	private render(): void {
		const container = this.containerEl;
		container.empty();

		// 标题区域
		const headerEl = container.createDiv({ cls: 'combine-view-header' });
		headerEl.createEl('h4', { text: '组合笔记' });

		// 笔记列表区域
		const listEl = container.createDiv({ cls: 'combine-view-list' });
		this.renderNotesList(listEl);

		// 提示区域（当列表为空时显示）
		if (this.plugin.settings.combineNotes.length === 0) {
			const emptyEl = listEl.createDiv({ cls: 'combine-view-empty' });
			emptyEl.createEl('p', { text: '拖拽文件到此处添加' });
		}

		// 按钮区域
		const actionsEl = container.createDiv({ cls: 'combine-view-actions' });

		const clearBtn = actionsEl.createEl('button', { text: '清空' });
		clearBtn.addEventListener('click', () => this.clearAll());

		const combineBtn = actionsEl.createEl('button', { text: '组合整理', cls: 'mod-cta' });
		combineBtn.addEventListener('click', () => this.combineNotes());
		combineBtn.disabled = this.plugin.settings.combineNotes.length === 0;
	}

	/**
	 * 渲染笔记列表
	 */
	private renderNotesList(container: HTMLElement): void {
		const notes = this.plugin.settings.combineNotes;

		notes.forEach((note, index) => {
			const noteEl = container.createDiv({ cls: 'combine-note-item' });

			// 拖拽手柄
			const handleEl = noteEl.createDiv({ cls: 'combine-note-handle' });
			handleEl.innerHTML = '≡';

			// 文件名
			const nameEl = noteEl.createDiv({ cls: 'combine-note-name' });
			nameEl.setText(note.name);

			// 删除按钮
			const deleteBtn = noteEl.createDiv({ cls: 'combine-note-delete' });
			deleteBtn.innerHTML = '×';
			deleteBtn.addEventListener('click', () => {
				this.removeNote(index);
			});
		});
	}

	/**
	 * 移除笔记
	 */
	private async removeNote(index: number): Promise<void> {
		this.plugin.settings.combineNotes.splice(index, 1);
		await this.plugin.saveSettings();
		this.render();
	}

	/**
	 * 清空所有笔记
	 */
	private async clearAll(): Promise<void> {
		this.plugin.settings.combineNotes = [];
		await this.plugin.saveSettings();
		this.render();
	}

	/**
	 * 组合笔记（占位方法，后续实现）
	 */
	private async combineNotes(): Promise<void> {
		// TODO: 在后续步骤中实现
		console.log('组合笔记功能待实现');
	}

	/**
	 * 刷新视图
	 */
	public refresh(): void {
		this.render();
	}
}
