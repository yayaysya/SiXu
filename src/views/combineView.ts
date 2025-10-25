import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { CombineNoteItem } from '../types';

export const COMBINE_VIEW_TYPE = 'notebook-llm-combine-view';

/**
 * 组合笔记侧边栏视图
 */
type TabType = 'combine' | 'sources';

export class CombineNotesView extends ItemView {
	plugin: NotebookLLMPlugin;
	private draggedIndex: number | null = null;
	private isRendered: boolean = false;
	private activeTab: TabType = 'combine';

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

		// 标签页切换区域
		const tabsEl = container.createDiv({ cls: 'combine-view-tabs' });

		const combineTabBtn = tabsEl.createEl('button', {
			cls: 'combine-tab-button' + (this.activeTab === 'combine' ? ' active' : ''),
			attr: { 'aria-label': '组合笔记' }
		});
		combineTabBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>';
		combineTabBtn.addEventListener('click', () => {
			this.activeTab = 'combine';
			this.render();
		});

		const sourcesTabBtn = tabsEl.createEl('button', {
			cls: 'combine-tab-button' + (this.activeTab === 'sources' ? ' active' : ''),
			attr: { 'aria-label': '源文件引用' }
		});
		sourcesTabBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
		sourcesTabBtn.addEventListener('click', () => {
			this.activeTab = 'sources';
			this.render();
		});

		// 根据当前标签页渲染不同内容
		if (this.activeTab === 'combine') {
			this.renderCombineTab(container);
		} else {
			this.renderSourcesTab(container);
		}
	}

	/**
	 * 渲染组合笔记标签页
	 */
	private renderCombineTab(container: HTMLElement): void {
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
	 * 渲染源文件引用标签页
	 */
	private renderSourcesTab(container: HTMLElement): void {
		const sourcesEl = container.createDiv({ cls: 'source-files-list' });

		// 获取当前活动文件
		const activeFile = this.plugin.app.workspace.getActiveFile();

		if (!activeFile) {
			const emptyEl = sourcesEl.createDiv({ cls: 'combine-view-empty' });
			emptyEl.createEl('p', { text: '请先打开一个笔记文件' });
			return;
		}

		// 读取文件的 YAML Front Matter
		const cache = this.plugin.app.metadataCache.getFileCache(activeFile);
		const sourceFiles = cache?.frontmatter?.source_files;

		if (!sourceFiles || !Array.isArray(sourceFiles) || sourceFiles.length === 0) {
			const emptyEl = sourcesEl.createDiv({ cls: 'combine-view-empty' });
			emptyEl.createEl('p', { text: '当前文件没有源文件引用' });
			return;
		}

		// 渲染源文件卡片
		sourceFiles.forEach((sourceFileLink: string) => {
			this.renderSourceFileCard(sourcesEl, sourceFileLink);
		});
	}

	/**
	 * 渲染笔记列表
	 */
	private async renderNotesList(container: HTMLElement): Promise<void> {
		const notes = this.plugin.settings.combineNotes;

		for (let index = 0; index < notes.length; index++) {
			const note = notes[index];
			const noteEl = container.createDiv({ cls: 'note-card' });
			noteEl.draggable = true;

			// 拖拽手柄
			const handleEl = noteEl.createDiv({ cls: 'note-card-handle' });
			handleEl.innerHTML = '≡';

			// 内容区域
			const contentEl = noteEl.createDiv({ cls: 'note-card-content' });

			// 文件名
			const nameEl = contentEl.createDiv({ cls: 'note-card-name' });
			nameEl.setText(note.name);

			// 预览区域
			const preview = await this.getFilePreview(note.path);
			const previewEl = contentEl.createDiv({ cls: 'note-card-preview' });
			previewEl.setText(preview);

			// 按钮区域
			const actionsEl = noteEl.createDiv({ cls: 'note-card-actions' });

			// 打开按钮
			const openBtn = actionsEl.createEl('button', {
				cls: 'note-card-button',
				attr: { 'aria-label': '打开文件' }
			});
			openBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
			openBtn.addEventListener('click', () => {
				this.openFile(note.path);
			});

			// 删除按钮
			const deleteBtn = actionsEl.createEl('button', {
				cls: 'note-card-button delete',
				attr: { 'aria-label': '删除' }
			});
			deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
			deleteBtn.addEventListener('click', () => {
				this.removeNote(index);
			});

			// 拖拽事件（用于列表内部排序）
			this.setupNoteDragEvents(noteEl, index);
		}
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
			const allItems = this.containerEl.querySelectorAll('.note-card');
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

	/**
	 * 获取文件预览（去除YAML后的前50字）
	 */
	private async getFilePreview(filePath: string): Promise<string> {
		try {
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				return '无法读取文件';
			}

			const content = await this.plugin.app.vault.read(file);

			// 移除 YAML Front Matter
			let textContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

			// 移除 Markdown 标记（标题、粗体、斜体等）
			textContent = textContent
				.replace(/^#+\s+/gm, '')  // 标题
				.replace(/\*\*(.+?)\*\*/g, '$1')  // 粗体
				.replace(/\*(.+?)\*/g, '$1')  // 斜体
				.replace(/`(.+?)`/g, '$1')  // 行内代码
				.trim();

			// 取前50个字符
			if (textContent.length > 50) {
				return textContent.substring(0, 50) + '...';
			}

			return textContent || '(空文件)';
		} catch (error) {
			console.error('读取文件预览失败:', error);
			return '读取失败';
		}
	}

	/**
	 * 打开文件
	 */
	private async openFile(filePath: string): Promise<void> {
		try {
			const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
			if (!(file instanceof TFile)) {
				new Notice('文件不存在');
				return;
			}

			// 在当前窗口打开文件
			const leaf = this.plugin.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		} catch (error) {
			console.error('打开文件失败:', error);
			new Notice('打开文件失败');
		}
	}

	/**
	 * 渲染源文件卡片
	 */
	private async renderSourceFileCard(container: HTMLElement, sourceFileLink: string): Promise<void> {
		// 解析 [[文件名]] 格式
		const match = sourceFileLink.match(/\[\[(.+?)\]\]/);
		if (!match) {
			return;
		}

		const fileName = match[1];

		// 查找文件
		const file = this.plugin.app.metadataCache.getFirstLinkpathDest(fileName, '');
		if (!file) {
			return;
		}

		// 创建卡片
		const cardEl = container.createDiv({ cls: 'note-card source-file-card' });

		// 内容区域
		const contentEl = cardEl.createDiv({ cls: 'note-card-content' });

		// 文件名
		const nameEl = contentEl.createDiv({ cls: 'note-card-name' });
		nameEl.setText(file.basename);

		// 预览区域
		const preview = await this.getFilePreview(file.path);
		const previewEl = contentEl.createDiv({ cls: 'note-card-preview' });
		previewEl.setText(preview);

		// 按钮区域
		const actionsEl = cardEl.createDiv({ cls: 'note-card-actions' });

		// 打开按钮
		const openBtn = actionsEl.createEl('button', {
			cls: 'note-card-button',
			attr: { 'aria-label': '打开文件' }
		});
		openBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>';
		openBtn.addEventListener('click', () => {
			this.openFile(file.path);
		});
	}
}
