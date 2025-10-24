import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { CombineNoteItem } from '../types';

export const COMBINE_VIEW_TYPE = 'notebook-llm-combine-view';

/**
 * 组合笔记侧边栏视图
 */
export class CombineNotesView extends ItemView {
	plugin: NotebookLLMPlugin;
	private draggedIndex: number | null = null;
	private isRendered: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: NotebookLLMPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return COMBINE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '思序-组合笔记';
	}

	getIcon(): string {
		return 'orbit';
	}

	async onOpen(): Promise<void> {
		const container = this.containerEl;
		container.empty();
		container.addClass('notebook-llm-combine-view');

		if (!this.isRendered) {
			this.render();
			this.isRendered = true;
		}
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
		headerEl.createEl('h4', { text: '思序-组合笔记' });

		// 笔记列表区域
		const listEl = container.createDiv({ cls: 'combine-view-list' });
		this.setupDropZone(listEl);
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
			noteEl.draggable = true;

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

			// 拖拽事件（用于列表内部排序）
			this.setupNoteDragEvents(noteEl, index);
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
	 * 组合笔记
	 */
	private async combineNotes(): Promise<void> {
		const notes = this.plugin.settings.combineNotes;

		if (notes.length === 0) {
			return;
		}

		try {
			// 按 order 排序
			const sortedNotes = [...notes].sort((a, b) => a.order - b.order);

			// 收集所有文件对象
			const files: TFile[] = [];
			let hasError = false;

			for (const note of sortedNotes) {
				const file = this.plugin.app.vault.getAbstractFileByPath(note.path);

				if (!(file instanceof TFile)) {
					console.error('文件不存在:', note.path);
					hasError = true;
					continue;
				}

				files.push(file);
			}

			if (hasError) {
				new Notice('部分文件读取失败，请检查文件是否存在');
			}

			if (files.length === 0) {
				new Notice('没有可组合的文件');
				return;
			}

			// 生成输出文件名
			const today = new Date().toISOString().split('T')[0];
			const outputFileName = `组合笔记_${today}.md`;
			const outputPath = outputFileName;

			// 调用主插件的处理逻辑，传递文件数组
			await this.plugin.processCombinedNotes(files, outputPath);

			new Notice(`组合笔记已开始处理，输出文件：${outputFileName}`);
		} catch (error) {
			console.error('组合笔记失败:', error);
			new Notice(`组合笔记失败: ${error.message}`);
		}
	}

	/**
	 * 设置放置区域（接收外部文件拖拽）
	 */
	private setupDropZone(listEl: HTMLElement): void {
		// 允许放置
		listEl.addEventListener('dragover', (e) => {
			e.preventDefault();

			// 检查是否是内部拖拽
			const isInternalDrag = e.dataTransfer?.types.includes('text/x-combine-note-index');

			if (isInternalDrag) {
				e.dataTransfer!.dropEffect = 'move';
				// 内部拖拽时不添加 drag-over 样式
			} else {
				e.dataTransfer!.dropEffect = 'copy';
				listEl.addClass('drag-over');
			}
		});

		listEl.addEventListener('dragleave', (e) => {
			if (e.target === listEl) {
				listEl.removeClass('drag-over');
			}
		});

		// 处理放置
		listEl.addEventListener('drop', async (e) => {
			e.preventDefault();
			listEl.removeClass('drag-over');

			// 检查是否是内部拖拽（列表内排序）
			const isInternalDrag = e.dataTransfer?.types.includes('text/x-combine-note-index');
			if (isInternalDrag) {
				// 处理拖到列表末尾的情况
				if (this.draggedIndex !== null) {
					const notes = this.plugin.settings.combineNotes;
					const targetIndex = notes.length - 1;

					if (this.draggedIndex !== targetIndex) {
						await this.reorderNotes(this.draggedIndex, targetIndex);
					}
				}
				return;
			}

			// 获取拖拽数据
			const textData = e.dataTransfer?.getData('text/plain');
			if (!textData) {
				return;
			}

			// 解析 Obsidian URI: obsidian://open?vault=xxx&file=xxx
			try {
				let filePath: string;

				if (textData.startsWith('obsidian://')) {
					// 解析 URI
					const url = new URL(textData);
					const fileParam = url.searchParams.get('file');

					if (!fileParam) {
						return;
					}

					// fileParam 已经是解码后的值
					filePath = fileParam;
				} else {
					// 直接使用文本作为路径
					filePath = textData;
				}

				// 尝试添加 .md 扩展名
				let file = this.plugin.app.vault.getAbstractFileByPath(filePath);

				if (!file && !filePath.endsWith('.md')) {
					const filePathWithExt = filePath + '.md';
					file = this.plugin.app.vault.getAbstractFileByPath(filePathWithExt);
				}

				if (file instanceof TFile && file.extension === 'md') {
					await this.addNote(file);
				}
			} catch (error) {
				console.error('添加文件失败:', error);
			}
		});
	}

	/**
	 * 设置笔记项的拖拽事件（用于列表内排序）
	 */
	private setupNoteDragEvents(noteEl: HTMLElement, index: number): void {
		noteEl.addEventListener('dragstart', (e) => {
			this.draggedIndex = index;
			noteEl.addClass('dragging');
			e.dataTransfer!.effectAllowed = 'move';
			// 设置一个标识，表示这是内部拖拽
			e.dataTransfer!.setData('text/x-combine-note-index', String(index));
		});

		noteEl.addEventListener('dragend', () => {
			this.draggedIndex = null;
			noteEl.removeClass('dragging');
			// 清理所有可能的边框样式
			const allItems = this.containerEl.querySelectorAll('.combine-note-item');
			allItems.forEach((item: HTMLElement) => {
				item.style.borderTop = '';
				item.style.borderBottom = '';
			});
		});

		noteEl.addEventListener('dragover', (e) => {
			// 检查是否是内部拖拽
			const isInternalDrag = e.dataTransfer?.types.includes('text/x-combine-note-index');

			if (isInternalDrag && this.draggedIndex !== null) {
				e.preventDefault();
				e.stopPropagation();
				e.dataTransfer!.dropEffect = 'move';

				if (this.draggedIndex !== index) {
					// 视觉反馈
					const rect = noteEl.getBoundingClientRect();
					const midpoint = rect.top + rect.height / 2;
					if (e.clientY < midpoint) {
						noteEl.style.borderTop = '2px solid var(--interactive-accent)';
						noteEl.style.borderBottom = '';
					} else {
						noteEl.style.borderTop = '';
						noteEl.style.borderBottom = '2px solid var(--interactive-accent)';
					}
				}
			}
		});

		noteEl.addEventListener('dragleave', () => {
			noteEl.style.borderTop = '';
			noteEl.style.borderBottom = '';
		});

		noteEl.addEventListener('drop', async (e) => {
			// 检查是否是内部拖拽
			const isInternalDrag = e.dataTransfer?.types.includes('text/x-combine-note-index');

			if (isInternalDrag) {
				e.preventDefault();
				e.stopPropagation();
				noteEl.style.borderTop = '';
				noteEl.style.borderBottom = '';

				if (this.draggedIndex !== null && this.draggedIndex !== index) {
					// 根据鼠标位置判断是插入到前面还是后面
					const rect = noteEl.getBoundingClientRect();
					const midpoint = rect.top + rect.height / 2;
					let targetIndex = index;

					// 如果鼠标在上半部分，插入到当前项之前
					// 如果在下半部分，插入到当前项之后
					if (e.clientY >= midpoint) {
						// 下半部分，插入到后面
						targetIndex = index;
					} else {
						// 上半部分，插入到前面
						targetIndex = this.draggedIndex < index ? index - 1 : index;
					}

					await this.reorderNotes(this.draggedIndex, targetIndex);
				}
			}
		});
	}

	/**
	 * 添加笔记
	 */
	private async addNote(file: TFile): Promise<void> {
		// 检查是否已存在
		const exists = this.plugin.settings.combineNotes.some(
			note => note.path === file.path
		);

		if (exists) {
			return;
		}

		// 获取最大 order 值
		const maxOrder = this.plugin.settings.combineNotes.reduce(
			(max, note) => Math.max(max, note.order),
			0
		);

		// 添加新笔记
		const newNote: CombineNoteItem = {
			path: file.path,
			name: file.basename,
			order: maxOrder + 1
		};

		this.plugin.settings.combineNotes.push(newNote);
		await this.plugin.saveSettings();
		this.render();
	}

	/**
	 * 重新排序笔记
	 */
	private async reorderNotes(fromIndex: number, toIndex: number): Promise<void> {
		const notes = this.plugin.settings.combineNotes;
		const [movedNote] = notes.splice(fromIndex, 1);
		notes.splice(toIndex, 0, movedNote);

		// 重新分配 order 值
		notes.forEach((note, index) => {
			note.order = index + 1;
		});

		await this.plugin.saveSettings();
		this.render();
	}

	/**
	 * 刷新视图
	 */
	public refresh(): void {
		this.render();
	}
}
