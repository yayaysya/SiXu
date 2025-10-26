import { ItemView, WorkspaceLeaf, TFile, Notice, EventRef } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { CombineNoteItem, QuizQuestion, QuizQuestionResult, QuizData } from '../types';

export const COMBINE_VIEW_TYPE = 'notebook-llm-combine-view';

/**
 * 组合笔记侧边栏视图
 */
type TabType = 'combine' | 'sources' | 'quiz';
type QuizViewState = 'list' | 'exam' | 'result';

export class CombineNotesView extends ItemView {
	plugin: NotebookLLMPlugin;
	private draggedIndex: number | null = null;
	private isRendered: boolean = false;
	private activeTab: TabType = 'combine';
	private fileChangeEventRef: EventRef | null = null;
	private metadataChangeEventRef: EventRef | null = null;

	// Quiz相关状态
	private quizViewState: QuizViewState = 'list';
	private currentQuizFile: TFile | null = null;
	private currentQuizData: QuizData | null = null;
	private currentQuestions: QuizQuestion[] = [];
	private currentQuestionIndex: number = 0;
	private userAnswers: Map<string, string | string[]> = new Map();
	private currentQuizResults: QuizQuestionResult[] = [];
	private currentResultFile: TFile | null = null;

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

		// 监听文件切换事件
		this.fileChangeEventRef = this.plugin.app.workspace.on('active-leaf-change', () => {
			if (this.activeTab === 'sources') {
				this.render();
			}
		});

		// 监听元数据变化事件（检测 YAML 修改）
		this.metadataChangeEventRef = this.plugin.app.metadataCache.on('changed', (file) => {
			// 只在源文件引用标签页且修改的是当前打开的文件时刷新
			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (this.activeTab === 'sources' && activeFile && file.path === activeFile.path) {
				this.render();
			}
		});

		if (!this.isRendered) {
			this.render();
			this.isRendered = true;
		}
	}

	async onClose(): Promise<void> {
		// 清理事件监听器
		if (this.fileChangeEventRef) {
			this.plugin.app.workspace.offref(this.fileChangeEventRef);
		}
		if (this.metadataChangeEventRef) {
			this.plugin.app.metadataCache.offref(this.metadataChangeEventRef);
		}

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

		const quizTabBtn = tabsEl.createEl('button', {
			cls: 'combine-tab-button' + (this.activeTab === 'quiz' ? ' active' : ''),
			attr: { 'aria-label': '知识测验' }
		});
		quizTabBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>';
		quizTabBtn.addEventListener('click', () => {
			this.activeTab = 'quiz';
			this.render();
		});

		// 根据当前标签页渲染不同内容
		if (this.activeTab === 'combine') {
			this.renderCombineTab(container);
		} else if (this.activeTab === 'sources') {
			this.renderSourcesTab(container);
		} else {
			this.renderQuizTab(container);
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
	 * 渲染Quiz标签页
	 */
	private renderQuizTab(container: HTMLElement): void {
		// 根据状态渲染不同内容
		if (this.quizViewState === 'list') {
			this.renderQuizListView(container);
		} else if (this.quizViewState === 'exam') {
			this.renderExamView(container);
		} else if (this.quizViewState === 'result') {
			this.renderResultView(container);
		}
	}

	/**
	 * 渲染Quiz列表视图
	 */
	private renderQuizListView(container: HTMLElement): void {
		const quizEl = container.createDiv({ cls: 'quiz-list' });

		// 获取当前活动文件
		const activeFile = this.plugin.app.workspace.getActiveFile();

		if (!activeFile) {
			const emptyEl = quizEl.createDiv({ cls: 'combine-view-empty' });
			emptyEl.createEl('p', { text: '请先打开一个笔记文件' });
			return;
		}

		// 读取文件的 YAML 中的 quiz_files
		const cache = this.plugin.app.metadataCache.getFileCache(activeFile);
		const quizFiles = cache?.frontmatter?.quiz_files;

		// 列表容器
		const listContainer = quizEl.createDiv({ cls: 'quiz-list-container' });

		if (!quizFiles || !Array.isArray(quizFiles) || quizFiles.length === 0) {
			const emptyEl = listContainer.createDiv({ cls: 'combine-view-empty' });
			emptyEl.createEl('p', { text: '当前文档还没有测验题，点击下方按钮生成' });
		} else {
			// 渲染quiz卡片列表
			quizFiles.forEach((quizFileLink: string) => {
				this.renderQuizCard(listContainer, quizFileLink);
			});
		}

		// 底部按钮
		const actionsEl = quizEl.createDiv({ cls: 'quiz-actions' });

		const generateBtn = actionsEl.createEl('button', { text: '生成新试题', cls: 'mod-cta' });
		generateBtn.addEventListener('click', () => {
			this.generateQuiz(activeFile);
		});
	}

	/**
	 * 渲染考试视图
	 */
	private renderExamView(container: HTMLElement): void {
		const examEl = container.createDiv({ cls: 'quiz-exam' });

		if (this.currentQuestions.length === 0) {
			const emptyEl = examEl.createDiv({ cls: 'combine-view-empty' });
			emptyEl.createEl('p', { text: '加载题目失败' });
			return;
		}

		// 顶部进度条
		this.renderExamProgress(examEl);

		// 题目显示区域
		this.renderCurrentQuestion(examEl);

		// 底部导航按钮
		this.renderExamNavigation(examEl);
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

	/**
	 * 渲染Quiz卡片
	 */
	private async renderQuizCard(container: HTMLElement, quizFileLink: string): Promise<void> {
		// 解析 [[文件名]] 格式
		const match = quizFileLink.match(/\[\[(.+?)\]\]/);
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
		const cardEl = container.createDiv({ cls: 'quiz-card' });

		// 内容区域
		const contentEl = cardEl.createDiv({ cls: 'quiz-card-content' });

		// 读取quiz元信息
		const cache = this.plugin.app.metadataCache.getFileCache(file);
		const frontmatter = cache?.frontmatter;

		// 标题
		const titleEl = contentEl.createDiv({ cls: 'quiz-card-title' });
		titleEl.setText(frontmatter?.title || file.basename);

		// 元信息
		const metaEl = contentEl.createDiv({ cls: 'quiz-card-meta' });
		const totalQuestions = frontmatter?.total_questions || 0;
		const difficulty = frontmatter?.difficulty || '未知';
		metaEl.setText(`${totalQuestions}题 | 难度: ${difficulty}`);

		// 历史平均分（暂时占位）
		const statsEl = contentEl.createDiv({ cls: 'quiz-card-stats' });
		const historyCount = frontmatter?.quiz_results?.length || 0;
		if (historyCount > 0) {
			statsEl.setText(`已测试 ${historyCount} 次`);
		} else {
			statsEl.setText('尚未测试');
		}

		// 按钮区域
		const actionsEl = cardEl.createDiv({ cls: 'quiz-card-actions' });

		// 查看试题按钮
		const viewBtn = actionsEl.createEl('button', {
			cls: 'quiz-card-button',
			text: '查看试题'
		});
		viewBtn.addEventListener('click', () => {
			this.openFile(file.path);
		});

		// 开始考试按钮
		const startBtn = actionsEl.createEl('button', {
			cls: 'quiz-card-button mod-cta',
			text: '开始考试'
		});
		startBtn.addEventListener('click', async () => {
			await this.startExam(file);
		});
	}

	/**
	 * 生成Quiz
	 */
	private async generateQuiz(sourceFile: TFile): Promise<void> {
		try {
			// 显示生成选项对话框
			const options = await this.showQuizGenerationDialog();
			if (!options) {
				return; // 用户取消
			}

			new Notice('正在生成Quiz，请稍候...');

			// 使用QuizGenerator生成Quiz
			const { QuizGenerator } = await import('../processors/quizGenerator');
			const generator = new QuizGenerator(this.plugin.app, this.plugin);
			const quizFile = await generator.generateQuizFromFile(sourceFile, options);

			new Notice(`Quiz生成成功：${quizFile.basename}`);

			// 刷新视图
			this.render();
		} catch (error) {
			console.error('生成Quiz失败:', error);
			new Notice(`生成Quiz失败: ${error.message}`);
		}
	}

	/**
	 * 显示Quiz生成选项对话框
	 */
	private showQuizGenerationDialog(): Promise<{
		difficulty: '简单' | '中等' | '困难';
		totalQuestions: number;
		questionTypes: ('single-choice' | 'multiple-choice' | 'fill-blank' | 'short-answer')[];
	} | null> {
		return new Promise((resolve) => {
			// 创建一个简单的对话框
			const modal = document.createElement('div');
			modal.addClass('modal');
			modal.style.cssText = 'display: flex; align-items: center; justify-content: center;';

			const container = modal.createDiv({ cls: 'modal-container' });
			container.style.cssText = 'background: var(--background-primary); padding: 20px; border-radius: 8px; max-width: 400px; width: 90%;';

			// 标题
			container.createEl('h3', { text: '生成Quiz设置' });

			// 难度选择
			const difficultyGroup = container.createDiv({ cls: 'setting-item' });
			difficultyGroup.createDiv({ text: '难度等级', cls: 'setting-item-name' });
			const difficultySelect = difficultyGroup.createEl('select');
			['简单', '中等', '困难'].forEach(d => {
				const option = difficultySelect.createEl('option', { text: d, value: d });
				if (d === '中等') option.selected = true;
			});

			// 题目数量
			const countGroup = container.createDiv({ cls: 'setting-item' });
			countGroup.createDiv({ text: '题目数量', cls: 'setting-item-name' });
			const countInput = countGroup.createEl('input', { type: 'number', value: '10' });
			countInput.min = '5';
			countInput.max = '30';
			countInput.style.width = '100%';

			// 题型选择
			const typesGroup = container.createDiv({ cls: 'setting-item' });
			typesGroup.createDiv({ text: '题型（多选）', cls: 'setting-item-name' });
			const typesContainer = typesGroup.createDiv();

			const typeOptions = [
				{ value: 'single-choice', label: '单选题' },
				{ value: 'multiple-choice', label: '多选题' },
				{ value: 'fill-blank', label: '填空题' },
				{ value: 'short-answer', label: '简答题' }
			];

			const typeCheckboxes: { value: string; checkbox: HTMLInputElement }[] = [];

			typeOptions.forEach(type => {
				const label = typesContainer.createEl('label', { cls: 'checkbox-label' });
				label.style.cssText = 'display: block; margin: 5px 0;';
				const checkbox = label.createEl('input', { type: 'checkbox' });
				checkbox.value = type.value;
				checkbox.checked = true;
				label.appendText(' ' + type.label);
				typeCheckboxes.push({ value: type.value, checkbox });
			});

			// 按钮
			const buttonGroup = container.createDiv({ cls: 'modal-button-container' });
			buttonGroup.style.cssText = 'display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;';

			const cancelBtn = buttonGroup.createEl('button', { text: '取消' });
			cancelBtn.addEventListener('click', () => {
				document.body.removeChild(modal);
				resolve(null);
			});

			const confirmBtn = buttonGroup.createEl('button', { text: '生成', cls: 'mod-cta' });
			confirmBtn.addEventListener('click', () => {
				const selectedTypes = typeCheckboxes
					.filter(t => t.checkbox.checked)
					.map(t => t.value as 'single-choice' | 'multiple-choice' | 'fill-blank' | 'short-answer');

				if (selectedTypes.length === 0) {
					new Notice('请至少选择一种题型');
					return;
				}

				const difficulty = difficultySelect.value as '简单' | '中等' | '困难';
				const totalQuestions = parseInt(countInput.value);

				if (totalQuestions < 5 || totalQuestions > 30) {
					new Notice('题目数量应在5-30之间');
					return;
				}

				document.body.removeChild(modal);
				resolve({
					difficulty,
					totalQuestions,
					questionTypes: selectedTypes
				});
			});

			document.body.appendChild(modal);
		});
	}

	/**
	 * 开始考试
	 */
	private async startExam(quizFile: TFile): Promise<void> {
		try {
			// 使用QuizParser解析quiz文件
			const { QuizParser } = await import('../processors/quiz');
			const parser = new QuizParser(this.plugin.app);
			const quizData = await parser.parseQuizFile(quizFile);

			if (!quizData || quizData.questions.length === 0) {
				new Notice('加载Quiz失败或题目为空');
				return;
			}

			// 初始化考试状态
			this.currentQuizFile = quizFile;
			this.currentQuizData = quizData;
			this.currentQuestions = quizData.questions;
			this.currentQuestionIndex = 0;
			this.userAnswers.clear();
			this.quizViewState = 'exam';

			// 重新渲染
			this.render();

			new Notice(`开始考试：${quizData.metadata.title}`);
		} catch (error) {
			console.error('开始考试失败:', error);
			new Notice('开始考试失败');
		}
	}

	/**
	 * 渲染考试进度条
	 */
	private renderExamProgress(container: HTMLElement): void {
		const progressEl = container.createDiv({ cls: 'exam-progress' });

		const totalQuestions = this.currentQuestions.length;
		const currentNum = this.currentQuestionIndex + 1;
		const answeredCount = this.userAnswers.size;
		const unansweredCount = totalQuestions - answeredCount;

		// 进度信息
		const infoEl = progressEl.createDiv({ cls: 'exam-progress-info' });
		infoEl.setText(`进度: ${currentNum}/${totalQuestions} | 已答: ${answeredCount} | 未答: ${unansweredCount}`);

		// 进度条
		const barContainer = progressEl.createDiv({ cls: 'exam-progress-bar-container' });
		const bar = barContainer.createDiv({ cls: 'exam-progress-bar' });
		const percentage = (answeredCount / totalQuestions) * 100;
		bar.style.width = `${percentage}%`;
	}

	/**
	 * 渲染当前题目
	 */
	private renderCurrentQuestion(container: HTMLElement): void {
		const questionContainer = container.createDiv({ cls: 'exam-question-container' });

		const question = this.currentQuestions[this.currentQuestionIndex];
		if (!question) return;

		// 题目标题
		const headerEl = questionContainer.createDiv({ cls: 'exam-question-header' });
		headerEl.createEl('span', {
			text: `Q${this.currentQuestionIndex + 1}`,
			cls: 'exam-question-number'
		});
		headerEl.createEl('span', {
			text: this.getQuestionTypeLabel(question.type),
			cls: 'exam-question-type'
		});
		headerEl.createEl('span', {
			text: `难度: ${question.difficulty}`,
			cls: 'exam-question-difficulty'
		});

		// 题目内容
		const questionEl = questionContainer.createDiv({ cls: 'exam-question-text' });
		questionEl.setText(question.question);

		// 答题区域
		const answerEl = questionContainer.createDiv({ cls: 'exam-answer-area' });
		this.renderQuestionInput(answerEl, question);
	}

	/**
	 * 获取题目类型标签
	 */
	private getQuestionTypeLabel(type: string): string {
		const labels: Record<string, string> = {
			'single-choice': '[单选]',
			'multiple-choice': '[多选]',
			'fill-blank': '[填空]',
			'short-answer': '[简答]'
		};
		return labels[type] || '[未知]';
	}

	/**
	 * 渲染题目输入区域
	 */
	private renderQuestionInput(container: HTMLElement, question: QuizQuestion): void {
		const currentAnswer = this.userAnswers.get(question.id);

		if (question.type === 'single-choice') {
			// 单选题
			question.options?.forEach((option) => {
				const labelEl = container.createEl('label', { cls: 'exam-option' });
				const radio = labelEl.createEl('input', {
					type: 'radio',
					attr: { name: `question-${question.id}`, value: option }
				});
				if (currentAnswer === option) {
					radio.checked = true;
				}
				radio.addEventListener('change', () => {
					this.userAnswers.set(question.id, option);
				});
				labelEl.createSpan({ text: option });
			});
		} else if (question.type === 'multiple-choice') {
			// 多选题
			question.options?.forEach((option) => {
				const labelEl = container.createEl('label', { cls: 'exam-option' });
				const checkbox = labelEl.createEl('input', {
					type: 'checkbox',
					attr: { value: option }
				});
				if (Array.isArray(currentAnswer) && currentAnswer.includes(option)) {
					checkbox.checked = true;
				}
				checkbox.addEventListener('change', () => {
					let selected = this.userAnswers.get(question.id) as string[] || [];
					if (!Array.isArray(selected)) selected = [];

					if (checkbox.checked) {
						selected.push(option);
					} else {
						selected = selected.filter(s => s !== option);
					}
					this.userAnswers.set(question.id, selected);
				});
				labelEl.createSpan({ text: option });
			});
		} else if (question.type === 'fill-blank') {
			// 填空题
			const input = container.createEl('input', {
				type: 'text',
				cls: 'exam-input',
				placeholder: '请输入答案',
				attr: { value: (currentAnswer as string) || '' }
			});
			input.addEventListener('input', () => {
				this.userAnswers.set(question.id, input.value);
			});
		} else if (question.type === 'short-answer') {
			// 简答题
			const textarea = container.createEl('textarea', {
				cls: 'exam-textarea',
				placeholder: '请输入答案',
				text: (currentAnswer as string) || ''
			});
			textarea.addEventListener('input', () => {
				this.userAnswers.set(question.id, textarea.value);
			});
		}
	}

	/**
	 * 渲染考试导航按钮
	 */
	private renderExamNavigation(container: HTMLElement): void {
		const navEl = container.createDiv({ cls: 'exam-navigation' });

		// 上一题按钮
		const prevBtn = navEl.createEl('button', {
			text: '上一题',
			cls: 'exam-nav-button'
		});
		prevBtn.disabled = this.currentQuestionIndex === 0;
		prevBtn.addEventListener('click', () => {
			if (this.currentQuestionIndex > 0) {
				this.currentQuestionIndex--;
				this.render();
			}
		});

		// 题号指示
		const indicatorEl = navEl.createEl('div', { cls: 'exam-indicator' });
		indicatorEl.setText(`${this.currentQuestionIndex + 1} / ${this.currentQuestions.length}`);

		// 下一题/提交答卷按钮
		const isLastQuestion = this.currentQuestionIndex === this.currentQuestions.length - 1;
		const nextBtn = navEl.createEl('button', {
			text: isLastQuestion ? '提交答卷' : '下一题',
			cls: isLastQuestion ? 'exam-nav-button mod-cta' : 'exam-nav-button'
		});

		nextBtn.addEventListener('click', () => {
			if (isLastQuestion) {
				// 提交答卷
				this.submitExam();
			} else {
				// 下一题
				this.currentQuestionIndex++;
				this.render();
			}
		});
	}

	/**
	 * 提交答卷
	 */
	private async submitExam(): Promise<void> {
		// 检查是否所有题目都已回答
		const unanswered = this.currentQuestions.filter(q => !this.userAnswers.has(q.id));

		if (unanswered.length > 0) {
			const confirm = await this.showConfirmDialog(
				`还有 ${unanswered.length} 题未作答，确定提交吗？`
			);
			if (!confirm) return;
		}

		if (!this.currentQuizFile || !this.currentQuizData) {
			new Notice('考试数据错误');
			return;
		}

		try {
			new Notice('正在评分，请稍候...');

			// 使用QuizGrader评分
			const { QuizGrader } = await import('../processors/grading');
			const grader = new QuizGrader(this.plugin.app, this.plugin);
			const results = await grader.gradeQuiz(this.currentQuestions, this.userAnswers);

			// 生成结果文件
			const { ResultGenerator } = await import('../processors/resultGenerator');
			const generator = new ResultGenerator(this.plugin.app, this.plugin);
			const resultFile = await generator.generateResultFile(
				this.currentQuizFile,
				this.currentQuizData,
				results
			);

			// 更新quiz文件的quiz_results字段
			await this.updateQuizFileResults(this.currentQuizFile, resultFile);

			// 保存结果并切换到结果视图
			this.currentQuizResults = results;
			this.currentResultFile = resultFile;
			this.quizViewState = 'result';
			this.render();

			new Notice('评分完成！');
		} catch (error) {
			console.error('提交答卷失败:', error);
			new Notice(`提交答卷失败: ${error.message}`);
		}
	}

	/**
	 * 显示确认对话框
	 */
	private showConfirmDialog(message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const confirmed = confirm(message);
			resolve(confirmed);
		});
	}

	/**
	 * 渲染结果视图
	 */
	private renderResultView(container: HTMLElement): void {
		const resultEl = container.createDiv({ cls: 'quiz-result' });

		if (!this.currentQuizData || this.currentQuizResults.length === 0) {
			const emptyEl = resultEl.createDiv({ cls: 'combine-view-empty' });
			emptyEl.createEl('p', { text: '无结果数据' });
			return;
		}

		// 计算总分
		const totalScore = this.currentQuizResults.reduce((sum, r) => sum + r.score, 0);
		const maxScore = this.currentQuizResults.reduce((sum, r) => sum + r.maxScore, 0);
		const percentage = ((totalScore / maxScore) * 100).toFixed(1);

		// 顶部成绩卡片
		this.renderScoreCard(resultEl, totalScore, maxScore, percentage);

		// 题型得分统计
		this.renderTypeStats(resultEl);

		// 详细答题情况
		this.renderDetailedResults(resultEl);

		// 底部按钮
		this.renderResultActions(resultEl);
	}

	/**
	 * 渲染成绩卡片
	 */
	private renderScoreCard(container: HTMLElement, totalScore: number, maxScore: number, percentage: string): void {
		const cardEl = container.createDiv({ cls: 'result-score-card' });

		// 标题
		const titleEl = cardEl.createDiv({ cls: 'result-title' });
		titleEl.setText(this.currentQuizData?.metadata.title || '测验结果');

		// 大分数显示
		const scoreEl = cardEl.createDiv({ cls: 'result-score-display' });
		const scoreNum = scoreEl.createDiv({ cls: 'result-score-number' });
		scoreNum.setText(`${totalScore}`);

		const scoreMeta = scoreEl.createDiv({ cls: 'result-score-meta' });
		scoreMeta.createSpan({ text: `/ ${maxScore}`, cls: 'result-score-max' });
		scoreMeta.createSpan({ text: `(${percentage}%)`, cls: 'result-score-percentage' });

		// 等级评价
		const gradeEl = cardEl.createDiv({ cls: 'result-grade' });
		const grade = this.getGrade(parseFloat(percentage));
		gradeEl.setText(grade);
		gradeEl.addClass(`grade-${grade.toLowerCase()}`);
	}

	/**
	 * 渲染题型统计
	 */
	private renderTypeStats(container: HTMLElement): void {
		const statsEl = container.createDiv({ cls: 'result-type-stats' });
		statsEl.createEl('h4', { text: '各题型得分' });

		// 按题型分组统计
		const typeMap = new Map<string, { score: number; max: number }>();

		this.currentQuizResults.forEach(result => {
			const question = this.currentQuestions.find(q => q.id === result.questionId);
			if (question) {
				const typeName = this.getQuestionTypeLabel(question.type).replace(/[\[\]]/g, '');
				const stat = typeMap.get(typeName) || { score: 0, max: 0 };
				stat.score += result.score;
				stat.max += result.maxScore;
				typeMap.set(typeName, stat);
			}
		});

		// 显示各题型
		const listEl = statsEl.createDiv({ cls: 'type-stats-list' });
		typeMap.forEach((stat, typeName) => {
			const itemEl = listEl.createDiv({ cls: 'type-stat-item' });

			const nameEl = itemEl.createDiv({ cls: 'type-stat-name' });
			nameEl.setText(typeName);

			const scoreEl = itemEl.createDiv({ cls: 'type-stat-score' });
			scoreEl.setText(`${stat.score} / ${stat.max}`);

			const percentage = stat.max > 0 ? ((stat.score / stat.max) * 100).toFixed(0) : '0';
			const barEl = itemEl.createDiv({ cls: 'type-stat-bar' });
			const fillEl = barEl.createDiv({ cls: 'type-stat-bar-fill' });
			fillEl.style.width = `${percentage}%`;
		});
	}

	/**
	 * 渲染详细结果
	 */
	private renderDetailedResults(container: HTMLElement): void {
		const detailsEl = container.createDiv({ cls: 'result-details' });
		detailsEl.createEl('h4', { text: '答题详情' });

		const listEl = detailsEl.createDiv({ cls: 'result-details-list' });

		this.currentQuizResults.forEach((result, index) => {
			const question = this.currentQuestions.find(q => q.id === result.questionId);
			if (!question) return;

			const itemEl = listEl.createDiv({ cls: 'result-detail-item' });

			const isCorrect = result.score === result.maxScore;
			const statusEmoji = isCorrect ? '✅' : '❌';

			// 题目头部
			const headerEl = itemEl.createDiv({ cls: 'result-detail-header' });
			headerEl.createSpan({ text: `${statusEmoji} 题目 ${index + 1}`, cls: 'result-detail-number' });
			headerEl.createSpan({ text: `${result.score}/${result.maxScore}分`, cls: 'result-detail-score' });

			// 题目内容
			const questionEl = itemEl.createDiv({ cls: 'result-detail-question' });
			questionEl.setText(question.question);

			// 你的答案
			const yourAnswerEl = itemEl.createDiv({ cls: 'result-detail-answer' });
			yourAnswerEl.createSpan({ text: '你的答案: ', cls: 'answer-label' });
			const yourAnswerText = this.formatAnswer(result.userAnswer);
			yourAnswerEl.createSpan({ text: yourAnswerText, cls: isCorrect ? 'answer-correct' : 'answer-wrong' });

			// 正确答案（如果答错了）
			if (!isCorrect) {
				const correctAnswerEl = itemEl.createDiv({ cls: 'result-detail-answer' });
				correctAnswerEl.createSpan({ text: '正确答案: ', cls: 'answer-label' });
				const correctAnswerText = this.formatAnswer(result.correctAnswer);
				correctAnswerEl.createSpan({ text: correctAnswerText, cls: 'answer-correct' });
			}

			// AI反馈（如果有）
			if (result.feedback) {
				const feedbackEl = itemEl.createDiv({ cls: 'result-detail-feedback' });
				feedbackEl.createSpan({ text: '评语: ', cls: 'feedback-label' });
				feedbackEl.createSpan({ text: result.feedback, cls: 'feedback-text' });
			}

			// 题目解析
			if (question.explanation) {
				const explanationEl = itemEl.createDiv({ cls: 'result-detail-explanation' });
				explanationEl.createSpan({ text: '解析: ', cls: 'explanation-label' });
				explanationEl.createSpan({ text: question.explanation, cls: 'explanation-text' });
			}
		});
	}

	/**
	 * 渲染结果页底部按钮
	 */
	private renderResultActions(container: HTMLElement): void {
		const actionsEl = container.createDiv({ cls: 'result-actions' });

		const backBtn = actionsEl.createEl('button', { text: '返回列表' });
		backBtn.addEventListener('click', () => {
			this.quizViewState = 'list';
			this.render();
		});

		const viewFileBtn = actionsEl.createEl('button', { text: '查看详细报告', cls: 'mod-cta' });
		viewFileBtn.addEventListener('click', () => {
			if (this.currentResultFile) {
				this.openFile(this.currentResultFile.path);
			}
		});
	}

	/**
	 * 格式化答案显示
	 */
	private formatAnswer(answer: string | string[]): string {
		if (Array.isArray(answer)) {
			return answer.join(', ');
		}
		return answer || '(未作答)';
	}

	/**
	 * 获取成绩等级
	 */
	private getGrade(percentage: number): string {
		if (percentage >= 90) return 'A';
		if (percentage >= 80) return 'B';
		if (percentage >= 70) return 'C';
		if (percentage >= 60) return 'D';
		return 'F';
	}

	/**
	 * 更新quiz文件的quiz_results字段
	 */
	private async updateQuizFileResults(quizFile: TFile, resultFile: TFile): Promise<void> {
		try {
			const content = await this.plugin.app.vault.read(quizFile);

			// 解析YAML
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) {
				return;
			}

			const yamlContent = yamlMatch[1];
			const resultLink = `[[${resultFile.basename}]]`;

			// 检查是否已有quiz_results字段
			let newYaml: string;
			if (yamlContent.includes('quiz_results:')) {
				// 添加到现有列表
				newYaml = yamlContent.replace(
					/(quiz_results:\s*\n(?:\s*-\s*\[\[.*?\]\]\n)*)/,
					`$1  - ${resultLink}\n`
				);
			} else {
				// 添加新字段
				newYaml = yamlContent + `\nquiz_results:\n  - ${resultLink}\n`;
			}

			const newContent = content.replace(yamlMatch[0], `---\n${newYaml}---`);
			await this.plugin.app.vault.modify(quizFile, newContent);
		} catch (error) {
			console.error('更新quiz文件失败:', error);
		}
	}
}
