import { ItemView, WorkspaceLeaf, TFile, Notice, EventRef, Modal, App, setIcon } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { CombineNoteItem, QuizQuestion, QuizQuestionResult, QuizData } from '../types';
import { StatisticsManager } from '../utils/statistics';
import { Activity, getActivityTypeLabel, getActivityTypeIcon } from '../types/activity';
import { ProgressCard } from '../components/ProgressCard';

export const COMBINE_VIEW_TYPE = 'notebook-llm-combine-view';

/**
 * 主导航页面类型
 */
type ViewPage = 'home' | 'organize' | 'learning' | 'profile';

/**
 * 学习中心子页面状态
 */
type LearningViewState = 'hub' | 'quiz-list' | 'quiz-exam' | 'quiz-result';

/**
 * @deprecated 旧的Tab类型，保留用于兼容
 */
type TabType = 'combine' | 'sources' | 'quiz';

/**
 * Quiz视图状态
 */
type QuizViewState = 'list' | 'exam' | 'result';

export class CombineNotesView extends ItemView {
	plugin: NotebookLLMPlugin;
	private draggedIndex: number | null = null;
	private isRendered: boolean = false;

	// 新的页面导航状态
	private currentPage: ViewPage = 'home';
	private learningState: LearningViewState = 'hub';

	// 统计管理器
	private statisticsManager: StatisticsManager | null = null;

	// 旧的Tab状态（保留用于兼容）
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

	// 进度卡片相关状态
	private progressCard: ProgressCard | null = null;
	private isCancelled: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: NotebookLLMPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.statisticsManager = new StatisticsManager(this.app, this.plugin);
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
	 * 渲染视图（新架构：使用底部导航）
	 */
	private render(): void {
		const container = this.containerEl;
		container.empty();
		container.addClass('notebook-llm-view-container');

		// 主内容区域
		const contentArea = container.createDiv({ cls: 'view-content-area' });

		// 根据当前页面渲染不同内容
		switch (this.currentPage) {
			case 'home':
				this.renderHomePage(contentArea);
				break;
			case 'organize':
				this.renderOrganizePage(contentArea);
				break;
			case 'learning':
				this.renderLearningPage(contentArea);
				break;
			case 'profile':
				this.renderProfilePage(contentArea);
				break;
		}

		// 底部导航栏
		this.renderBottomNavigation(container);
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

			// 重置取消标志
			this.isCancelled = false;

			// 创建进度卡片
			const contentArea = this.containerEl.querySelector('.view-content-area');
			if (!contentArea) return;

			this.progressCard = new ProgressCard(contentArea as HTMLElement, {
				title: '笔记整理中',
				onCancel: () => {
					this.isCancelled = true;
					this.progressCard?.destroy();
					this.progressCard = null;
					new Notice('已取消整理');
				},
				onBackground: () => {
					this.progressCard?.hide();
					new Notice('笔记正在后台整理，完成后会通知您');
				}
			});
			this.progressCard.show();
			this.progressCard.updateProgress(0, '准备中...');

			// 调用主插件的处理逻辑，传递文件数组和进度回调
			await this.plugin.processCombinedNotes(
				files,
				outputPath,
				(percent: number, status: string) => {
					if (this.isCancelled) {
						throw new Error('User cancelled');
					}
					this.progressCard?.updateProgress(percent, status);
				}
			);

			// 完成，销毁进度卡片
			this.progressCard?.destroy();
			this.progressCard = null;
		} catch (error) {
			// 清理进度卡片
			this.progressCard?.destroy();
			this.progressCard = null;

			if (error.message !== 'User cancelled') {
				console.error('组合笔记失败:', error);
				new Notice(`组合笔记失败: ${error.message}`);
			}
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

			// 重置取消标志
			this.isCancelled = false;

			// 创建进度卡片
			const contentArea = this.containerEl.querySelector('.view-content-area');
			if (!contentArea) return;

			this.progressCard = new ProgressCard(contentArea as HTMLElement, {
				title: '试题生成中',
				onCancel: () => {
					this.isCancelled = true;
					this.progressCard?.destroy();
					this.progressCard = null;
					new Notice('已取消生成');
				},
				onBackground: () => {
					this.progressCard?.hide();
					new Notice('试题正在后台生成，完成后会通知您');
				}
			});
			this.progressCard.show();
			this.progressCard.updateProgress(0, '准备中...');

			// 使用QuizGenerator生成Quiz
			const { QuizGenerator } = await import('../processors/quizGenerator');
			const generator = new QuizGenerator(this.plugin.app, this.plugin);

			const quizFile = await generator.generateQuizFromFile(
				sourceFile,
				options,
				(percent, status) => {
					if (this.isCancelled) {
						throw new Error('User cancelled');
					}
					this.progressCard?.updateProgress(percent, status);
				}
			);

			// 完成，销毁进度卡片
			this.progressCard?.destroy();
			this.progressCard = null;

			new Notice(`Quiz生成成功：${quizFile.basename}`);

			// 刷新视图
			this.render();
		} catch (error) {
			// 清理进度卡片
			this.progressCard?.destroy();
			this.progressCard = null;

			if (error.message !== 'User cancelled') {
				console.error('生成Quiz失败:', error);
				new Notice(`生成Quiz失败: ${error.message}`);
			}
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
			const modal = new QuizGenerationModal(this.plugin.app, (result) => {
				resolve(result);
			});
			modal.open();
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
	 * 从选项中提取字母标签（如 "A. 内容" -> "A"）
	 * 只匹配开头的格式，避免内容中的字母干扰
	 */
	private extractOptionLabel(option: string): string {
		const match = option.match(/^([A-Z])\.\s/);
		return match ? match[1] : option;
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
				const optionLabel = this.extractOptionLabel(option);  // 提取字母

				const radio = labelEl.createEl('input', {
					type: 'radio',
					attr: { name: `question-${question.id}`, value: optionLabel }
				});
				if (currentAnswer === optionLabel) {
					radio.checked = true;
				}
				radio.addEventListener('change', () => {
					this.userAnswers.set(question.id, optionLabel);  // 存储字母
				});
				labelEl.createSpan({ text: option });  // 显示完整选项
			});
		} else if (question.type === 'multiple-choice') {
			// 多选题
			question.options?.forEach((option) => {
				const labelEl = container.createEl('label', { cls: 'exam-option' });
				const optionLabel = this.extractOptionLabel(option);  // 提取字母

				const checkbox = labelEl.createEl('input', {
					type: 'checkbox',
					attr: { value: optionLabel }
				});
				if (Array.isArray(currentAnswer) && currentAnswer.includes(optionLabel)) {
					checkbox.checked = true;
				}
				checkbox.addEventListener('change', () => {
					let selected = this.userAnswers.get(question.id) as string[] || [];
					if (!Array.isArray(selected)) selected = [];

					if (checkbox.checked) {
						selected.push(optionLabel);  // 存储字母
					} else {
						selected = selected.filter(s => s !== optionLabel);
					}
					this.userAnswers.set(question.id, selected);
				});
				labelEl.createSpan({ text: option });  // 显示完整选项
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
			// 重置取消标志
			this.isCancelled = false;

			// 创建进度卡片
			const contentArea = this.containerEl.querySelector('.view-content-area');
			if (!contentArea) return;

			this.progressCard = new ProgressCard(contentArea as HTMLElement, {
				title: '评分中',
				onCancel: () => {
					this.isCancelled = true;
					this.progressCard?.destroy();
					this.progressCard = null;
					new Notice('已取消评分');
				},
				onBackground: () => {
					this.progressCard?.hide();
					new Notice('正在后台评分，完成后会通知您');
				}
			});
			this.progressCard.show();
			this.progressCard.updateProgress(0, '准备中...');

			// 使用QuizGrader评分
			const { QuizGrader } = await import('../processors/grading');
			const grader = new QuizGrader(this.plugin.app, this.plugin);

			this.progressCard.updateProgress(20, '正在评分...');
			const results = await grader.gradeQuiz(
				this.currentQuestions,
				this.userAnswers,
				(percent, status) => {
					if (this.isCancelled) {
						throw new Error('User cancelled');
					}
					// 评分占20%-80%
					this.progressCard?.updateProgress(20 + percent * 0.6, status);
				}
			);

			// 生成结果文件
			this.progressCard.updateProgress(80, '正在生成结果文件...');
			const { ResultGenerator } = await import('../processors/resultGenerator');
			const generator = new ResultGenerator(this.plugin.app, this.plugin);
			const resultFile = await generator.generateResultFile(
				this.currentQuizFile,
				this.currentQuizData,
				results
			);

			// 更新quiz文件的quiz_results字段
			this.progressCard.updateProgress(95, '正在更新测验记录...');
			await this.updateQuizFileResults(this.currentQuizFile, resultFile);

			// 完成，销毁进度卡片
			this.progressCard?.destroy();
			this.progressCard = null;

			// 保存结果并切换到结果视图
			this.currentQuizResults = results;
			this.currentResultFile = resultFile;
			this.quizViewState = 'result';
			this.learningState = 'quiz-result';
			this.render();

			new Notice('评分完成！');
		} catch (error) {
			// 清理进度卡片
			this.progressCard?.destroy();
			this.progressCard = null;

			if (error.message !== 'User cancelled') {
				console.error('提交答卷失败:', error);
				new Notice(`提交答卷失败: ${error.message}`);
			}
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
			this.learningState = 'quiz-list';
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
			const resultLink = `"[[${resultFile.basename}]]"`;  // 添加引号

			// 解析YAML
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) {
				return;
			}

			let yamlContent = yamlMatch[1];

			// 检查是否已有quiz_results字段
			if (yamlContent.includes('quiz_results:')) {
				// 找到quiz_results行并插入新链接
				const lines = yamlContent.split('\n');
				let resultsIndex = -1;
				let insertIndex = -1;

				for (let i = 0; i < lines.length; i++) {
					if (lines[i].trim().startsWith('quiz_results:')) {
						resultsIndex = i;

						// 检查是否是 quiz_results: [] 的格式
						if (lines[i].includes('[]')) {
							// 替换整行为数组格式的开头
							lines[i] = 'quiz_results:';
							insertIndex = i + 1;
						} else {
							// 找到下一个不是列表项的行
							for (let j = i + 1; j < lines.length; j++) {
								if (!lines[j].trim().startsWith('-')) {
									insertIndex = j;
									break;
								}
							}
							if (insertIndex === -1) {
								insertIndex = lines.length;
							}
						}
						break;
					}
				}

				if (resultsIndex !== -1) {
					lines.splice(insertIndex, 0, `  - ${resultLink}`);
					yamlContent = lines.join('\n');
				}
			} else {
				// 添加新字段
				yamlContent = yamlContent.trimEnd() + `\nquiz_results:\n  - ${resultLink}`;
			}

			const newContent = content.replace(yamlMatch[0], `---\n${yamlContent}\n---`);
			await this.plugin.app.vault.modify(quizFile, newContent);
		} catch (error) {
			console.error('更新quiz文件失败:', error);
		}
	}

	// ==================== 新UI架构：页面导航和切换 ====================

	/**
	 * 切换到指定页面
	 */
	private switchToPage(page: ViewPage): void {
		// 如果在考试中，阻止切换
		if (this.quizViewState === 'exam') {
			new Notice('考试进行中，无法切换页面');
			return;
		}

		this.currentPage = page;

		// 重置学习中心状态
		if (page === 'learning') {
			this.learningState = 'hub';
		}

		// 清除统计缓存以获取最新数据
		if (page === 'home' && this.statisticsManager) {
			this.statisticsManager.clearCache();
		}

		this.render();
	}

	/**
	 * 渲染底部导航栏
	 */
	private renderBottomNavigation(container: HTMLElement): void {
		const navBar = container.createDiv({ cls: 'bottom-navigation' });

		const pages: Array<{ page: ViewPage; icon: string; label: string }> = [
			{ page: 'home', icon: 'home', label: '思序' },
			{ page: 'organize', icon: 'file-edit', label: '整理' },
			{ page: 'learning', icon: 'graduation-cap', label: '学习' },
			{ page: 'profile', icon: 'user', label: '我的' }
		];

		pages.forEach(({ page, icon, label }) => {
			const navItem = navBar.createDiv({
				cls: this.currentPage === page ? 'nav-item active' : 'nav-item'
			});

			const iconEl = navItem.createDiv({ cls: 'nav-icon' });
			setIcon(iconEl, icon);

			navItem.createDiv({ cls: 'nav-label', text: label });

			navItem.addEventListener('click', () => {
				this.switchToPage(page);
			});
		});
	}

	/**
	 * 获取页面图标名称
	 */
	private getPageIcon(page: ViewPage): string {
		const icons: Record<ViewPage, string> = {
			'home': 'home',
			'organize': 'file-edit',
			'learning': 'graduation-cap',
			'profile': 'user'
		};
		return icons[page] || 'file';
	}

	// ==================== 主页（思序）====================

	/**
	 * 渲染主页
	 */
	private async renderHomePage(container: HTMLElement): Promise<void> {
		container.empty();
		container.addClass('home-page');

		// 页面标题
		const header = container.createDiv({ cls: 'page-header' });
		header.createEl('h2', { text: '思序', cls: 'page-title' });
		header.createEl('p', { text: '让思考更有序列', cls: 'page-subtitle' });

		// 数据看板
		await this.renderDataDashboard(container);

		// 快捷开始
		this.renderQuickStart(container);

		// 最近情况
		await this.renderRecentSection(container);
	}

	/**
	 * 渲染数据看板
	 */
	private async renderDataDashboard(container: HTMLElement): Promise<void> {
		const dashboard = container.createDiv({ cls: 'dashboard-section' });
		dashboard.createEl('h3', { text: '数据看板', cls: 'section-title' });

		const grid = dashboard.createDiv({ cls: 'dashboard-grid' });

		if (!this.statisticsManager) return;

		// 获取统计数据
		const [combineCount, quizStats] = await Promise.all([
			this.statisticsManager.getCombinedNotesCount(),
			this.statisticsManager.getQuizStatistics()
		]);

		// 卡片1：已组合笔记数量
		const card1 = grid.createDiv({ cls: 'dashboard-card' });
		card1.createDiv({ cls: 'card-icon', text: '📝' });
		card1.createDiv({ cls: 'card-value', text: combineCount.toString() });
		card1.createDiv({ cls: 'card-label', text: '组合笔记' });

		// 卡片2：Quiz总数
		const card2 = grid.createDiv({ cls: 'dashboard-card' });
		card2.createDiv({ cls: 'card-icon', text: '📋' });
		card2.createDiv({ cls: 'card-value', text: quizStats.total.toString() });
		card2.createDiv({ cls: 'card-label', text: 'Quiz试题' });

		// 卡片3：已完成Quiz
		const card3 = grid.createDiv({ cls: 'dashboard-card' });
		card3.createDiv({ cls: 'card-icon', text: '✅' });
		card3.createDiv({ cls: 'card-value', text: quizStats.completed.toString() });
		card3.createDiv({ cls: 'card-label', text: '已完成测验' });

		// 卡片4：闪卡练习（预留）
		const card4 = grid.createDiv({ cls: 'dashboard-card disabled' });
		card4.createDiv({ cls: 'card-icon', text: '📇' });
		card4.createDiv({ cls: 'card-value', text: '0' });
		card4.createDiv({ cls: 'card-label', text: '闪卡练习' });
	}

	/**
	 * 渲染快捷开始按钮
	 */
	private renderQuickStart(container: HTMLElement): void {
		const quickStart = container.createDiv({ cls: 'quick-start-section' });
		quickStart.createEl('h3', { text: '快捷开始', cls: 'section-title' });

		const buttons = quickStart.createDiv({ cls: 'quick-start-buttons' });

		// 整理你的思绪
		const btn1 = buttons.createEl('button', {
			cls: 'quick-start-btn primary',
			text: '整理你的思绪'
		});
		btn1.addEventListener('click', () => {
			this.switchToPage('organize');
		});

		// 开始一次学习之旅
		const btn2 = buttons.createEl('button', {
			cls: 'quick-start-btn secondary',
			text: '开始一次学习之旅'
		});
		btn2.addEventListener('click', () => {
			this.switchToPage('learning');
		});
	}

	/**
	 * 渲染最近情况区域
	 */
	private async renderRecentSection(container: HTMLElement): Promise<void> {
		const recentSection = container.createDiv({ cls: 'recent-section' });
		recentSection.createEl('h3', { text: '最近情况', cls: 'section-title' });

		if (!this.statisticsManager) return;

		// 获取最近活动
		const activities = await this.statisticsManager.getRecentActivities(10);

		// 日历热力图（简化版）
		const calendarContainer = recentSection.createDiv({ cls: 'activity-calendar' });
		const calendarData = await this.statisticsManager.getCalendarHeatmap(90);
		this.renderSimpleCalendar(calendarContainer, calendarData);

		// 活动列表
		this.renderActivityList(recentSection, activities);
	}

	/**
	 * 渲染简化版日历（仅显示最近30天）
	 */
	private renderSimpleCalendar(container: HTMLElement, data: any): void {
		container.createEl('h4', { text: '活动日历', cls: 'subsection-title' });

		const calendar = container.createDiv({ cls: 'calendar-heatmap' });

		// 简化实现：显示最近30天的活动点
		const recentDays = data.dataPoints.slice(-30);

		recentDays.forEach((point: any) => {
			const day = calendar.createDiv({ cls: 'calendar-day' });

			// 根据活动数量设置颜色深度
			const intensity = data.maxCount > 0 ? point.count / data.maxCount : 0;
			if (intensity > 0.75) {
				day.addClass('intensity-4');
			} else if (intensity > 0.5) {
				day.addClass('intensity-3');
			} else if (intensity > 0.25) {
				day.addClass('intensity-2');
			} else if (intensity > 0) {
				day.addClass('intensity-1');
			}

			// 工具提示
			day.setAttribute('title', `${point.date.toLocaleDateString()}: ${point.count}个活动`);
		});
	}

	/**
	 * 渲染活动列表
	 */
	private renderActivityList(container: HTMLElement, activities: Activity[]): void {
		const listContainer = container.createDiv({ cls: 'activity-list' });
		listContainer.createEl('h4', { text: '最近活动', cls: 'subsection-title' });

		if (activities.length === 0) {
			listContainer.createDiv({
				cls: 'empty-state',
				text: '暂无活动记录'
			});
			return;
		}

		const list = listContainer.createDiv({ cls: 'activity-items' });

		activities.slice(0, 5).forEach(activity => {
			const item = list.createDiv({ cls: 'activity-item' });

			// 图标
			const icon = item.createDiv({ cls: 'activity-icon' });
			icon.setText(getActivityTypeIcon(activity.type));

			// 内容
			const content = item.createDiv({ cls: 'activity-content' });
			const title = content.createDiv({ cls: 'activity-title' });
			title.setText(activity.title);

			const meta = content.createDiv({ cls: 'activity-meta' });
			meta.setText(getActivityTypeLabel(activity.type));

			// 时间
			const time = item.createDiv({ cls: 'activity-time' });
			time.setText(this.formatRelativeTime(activity.time));

			// 点击跳转
			if (activity.fileLink) {
				item.addClass('clickable');
				item.addEventListener('click', async () => {
					const file = this.app.vault.getAbstractFileByPath(activity.fileLink!);
					if (file instanceof TFile) {
						await this.app.workspace.getLeaf().openFile(file);
					}
				});
			}
		});
	}

	/**
	 * 格式化相对时间
	 */
	private formatRelativeTime(date: Date): string {
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return '刚刚';
		if (minutes < 60) return `${minutes}分钟前`;
		if (hours < 24) return `${hours}小时前`;
		if (days < 7) return `${days}天前`;

		return date.toLocaleDateString();
	}

	// ==================== 整理页（思维整理）====================

	/**
	 * 渲染整理页（原合并笔记页面）
	 */
	private renderOrganizePage(container: HTMLElement): void {
		container.empty();
		container.addClass('organize-page');

		// 页面标题
		const header = container.createDiv({ cls: 'page-header-section' });
		header.createEl('h2', { text: '思维整理', cls: 'page-title' });
		header.createEl('p', { text: '把多个笔记重新整合', cls: 'page-subtitle' });

		// 复用原来的合并笔记Tab的内容
		this.renderCombineTab(container);
	}

	// ==================== 学习中心 ====================

	/**
	 * 渲染学习中心（根据状态显示不同内容）
	 */
	private renderLearningPage(container: HTMLElement): void {
		container.empty();
		container.addClass('learning-page');

		switch (this.learningState) {
			case 'hub':
				this.renderLearningHub(container);
				break;
			case 'quiz-list':
				this.renderQuizListPage(container);
				break;
			case 'quiz-exam':
				this.renderExamView(container);
				break;
			case 'quiz-result':
				this.renderResultView(container);
				break;
		}
	}

	/**
	 * 渲染学习中心入口页
	 */
	private renderLearningHub(container: HTMLElement): void {
		const hub = container.createDiv({ cls: 'learning-hub' });

		// 标题
		hub.createEl('h2', { text: '学习课堂', cls: 'page-title' });
		hub.createEl('p', { text: '通过我们的课程赋能导学', cls: 'page-subtitle' });

		// 学习选项
		const options = hub.createDiv({ cls: 'learning-options' });

		// Flash Card（装修中）
		const flashcardCard = options.createDiv({ cls: 'learning-card disabled' });
		const fcIcon = flashcardCard.createDiv({ cls: 'card-icon-large' });
		fcIcon.setText('📇');
		flashcardCard.createEl('h3', { text: '闪卡背诵' });
		flashcardCard.createEl('p', { text: 'Flash Card 内容背诵' });
		const fcBadge = flashcardCard.createDiv({ cls: 'badge-construction' });
		fcBadge.setText('开发中');

		flashcardCard.addEventListener('click', () => {
			new Notice('闪卡功能正在开发中，敬请期待！');
		});

		// Quiz小试牛刀
		const quizCard = options.createDiv({ cls: 'learning-card' });
		const qzIcon = quizCard.createDiv({ cls: 'card-icon-large' });
		qzIcon.setText('📝');
		quizCard.createEl('h3', { text: '小试牛刀' });
		quizCard.createEl('p', { text: 'Quiz 知识测验' });

		quizCard.addEventListener('click', () => {
			this.learningState = 'quiz-list';
			this.render();
		});
	}

	/**
	 * 渲染Quiz列表页
	 */
	private async renderQuizListPage(container: HTMLElement): Promise<void> {
		const listPage = container.createDiv({ cls: 'quiz-list-page' });

		// 页面头部
		const header = listPage.createDiv({ cls: 'page-header-with-back' });

		const backBtn = header.createEl('button', { cls: 'back-btn' });
		setIcon(backBtn, 'arrow-left');
		backBtn.addEventListener('click', () => {
			this.learningState = 'hub';
			this.render();
		});

		header.createEl('h2', { text: '试题列表', cls: 'page-title' });

		// Quiz列表容器
		const quizList = listPage.createDiv({ cls: 'quiz-cards-container' });

		// 获取所有Quiz文件
		const quizDir = this.plugin.settings.quizDir || 'quiz';
		const files = this.app.vault.getFiles();
		const quizFiles = files.filter(file =>
			file.path.startsWith(quizDir + '/') &&
			file.extension === 'md' &&
			!file.basename.includes('结果')
		);

		if (quizFiles.length === 0) {
			quizList.createDiv({
				cls: 'empty-state',
				text: '暂无Quiz试题，请先在整理页面生成试题'
			});
			return;
		}

		// 渲染每个Quiz卡片
		for (const file of quizFiles) {
			await this.renderQuizCardInLearning(quizList, file);
		}
	}

	/**
	 * 渲染单个Quiz卡片（学习中心版本）
	 */
	private async renderQuizCardInLearning(container: HTMLElement, file: TFile): Promise<void> {
		const card = container.createDiv({ cls: 'quiz-card' });

		// 获取元数据
		const metadata = this.app.metadataCache.getFileCache(file);
		const frontmatter = metadata?.frontmatter;

		// 标题
		const title = card.createEl('h3', { cls: 'quiz-card-title' });
		title.setText(frontmatter?.title || file.basename);

		// 元信息
		const meta = card.createDiv({ cls: 'quiz-card-meta' });

		const difficulty = frontmatter?.difficulty || '未知';
		meta.createSpan({ cls: `difficulty-badge ${difficulty}`, text: difficulty });

		const totalQuestions = frontmatter?.total_questions || 0;
		meta.createSpan({ cls: 'question-count', text: `${totalQuestions}道题` });

		// 完成情况
		const results = frontmatter?.quiz_results || [];
		const isCompleted = Array.isArray(results) && results.length > 0;

		if (isCompleted) {
			const completedBadge = card.createDiv({ cls: 'completed-badge' });
			completedBadge.setText('✓ 已完成');
		}

		// 按钮
		const actions = card.createDiv({ cls: 'quiz-card-actions' });

		const startBtn = actions.createEl('button', {
			cls: 'quiz-action-btn primary',
			text: isCompleted ? '重新测验' : '开始测验'
		});

		startBtn.addEventListener('click', async () => {
			await this.startQuiz(file);
		});
	}

	/**
	 * 开始Quiz测验
	 */
	private async startQuiz(file: TFile): Promise<void> {
		try {
			// 解析Quiz文件
			const { QuizParser } = await import('../processors/quiz');
			const parser = new QuizParser(this.app);
			const quizData = await parser.parseQuizFile(file);

			if (!quizData || !quizData.questions || quizData.questions.length === 0) {
				new Notice('Quiz文件解析失败或没有题目');
				return;
			}

			// 设置状态
			this.currentQuizFile = file;
			this.currentQuizData = quizData;
			this.currentQuestions = quizData.questions;
			this.currentQuestionIndex = 0;
			this.userAnswers.clear();
			this.currentQuizResults = [];

			// 切换到考试状态
			this.learningState = 'quiz-exam';
			this.quizViewState = 'exam';
			this.render();
		} catch (error) {
			console.error('开始Quiz失败:', error);
			new Notice(`开始Quiz失败: ${error.message}`);
		}
	}

	// ==================== "我的"页面（装修中占位）====================

	/**
	 * 渲染"我的"页面
	 */
	private renderProfilePage(container: HTMLElement): void {
		container.empty();
		container.addClass('profile-page');

		const placeholder = container.createDiv({ cls: 'under-construction' });

		// 图标
		const icon = placeholder.createDiv({ cls: 'construction-icon' });
		icon.setText('🚧');

		// 文字
		placeholder.createEl('h2', { text: '页面正在装修中' });
		placeholder.createEl('p', {
			text: '此功能正在开发中，敬请期待！',
			cls: 'construction-message'
		});
	}
}

/**
 * Quiz生成选项对话框
 */
class QuizGenerationModal extends Modal {
	private result: {
		difficulty: '简单' | '中等' | '困难';
		totalQuestions: number;
		questionTypes: ('single-choice' | 'multiple-choice' | 'fill-blank' | 'short-answer')[];
	} | null = null;
	private onSubmit: (result: {
		difficulty: '简单' | '中等' | '困难';
		totalQuestions: number;
		questionTypes: ('single-choice' | 'multiple-choice' | 'fill-blank' | 'short-answer')[];
	} | null) => void;

	private difficultySelect: HTMLSelectElement;
	private countInput: HTMLInputElement;
	private typeCheckboxes: { value: string; checkbox: HTMLInputElement }[] = [];

	constructor(
		app: App,
		onSubmit: (result: {
			difficulty: '简单' | '中等' | '困难';
			totalQuestions: number;
			questionTypes: ('single-choice' | 'multiple-choice' | 'fill-blank' | 'short-answer')[];
		} | null) => void
	) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// 标题
		contentEl.createEl('h3', { text: '生成Quiz设置' });

		// 难度选择
		const difficultyGroup = contentEl.createDiv({ cls: 'setting-item' });
		difficultyGroup.createDiv({ text: '难度等级', cls: 'setting-item-name' });
		this.difficultySelect = difficultyGroup.createEl('select');
		['简单', '中等', '困难'].forEach(d => {
			const option = this.difficultySelect.createEl('option', { text: d, value: d });
			if (d === '中等') option.selected = true;
		});

		// 题目数量
		const countGroup = contentEl.createDiv({ cls: 'setting-item' });
		countGroup.createDiv({ text: '题目数量', cls: 'setting-item-name' });
		this.countInput = countGroup.createEl('input', { type: 'number', value: '10' });
		this.countInput.min = '5';
		this.countInput.max = '30';
		this.countInput.style.width = '100%';

		// 题型选择
		const typesGroup = contentEl.createDiv({ cls: 'setting-item' });
		typesGroup.createDiv({ text: '题型（多选）', cls: 'setting-item-name' });
		const typesContainer = typesGroup.createDiv();

		const typeOptions = [
			{ value: 'single-choice', label: '单选题' },
			{ value: 'multiple-choice', label: '多选题' },
			{ value: 'fill-blank', label: '填空题' },
			{ value: 'short-answer', label: '简答题' }
		];

		typeOptions.forEach(type => {
			const label = typesContainer.createEl('label', { cls: 'checkbox-label' });
			label.style.cssText = 'display: block; margin: 5px 0;';
			const checkbox = label.createEl('input', { type: 'checkbox' });
			checkbox.value = type.value;
			checkbox.checked = true;
			label.appendText(' ' + type.label);
			this.typeCheckboxes.push({ value: type.value, checkbox });
		});

		// 按钮
		const buttonGroup = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonGroup.style.cssText = 'display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;';

		const cancelBtn = buttonGroup.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
			this.result = null;
			this.close();
		});

		const confirmBtn = buttonGroup.createEl('button', { text: '生成', cls: 'mod-cta' });
		confirmBtn.addEventListener('click', () => {
			this.submit();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.onSubmit(this.result);
	}

	private submit(): void {
		const selectedTypes = this.typeCheckboxes
			.filter(t => t.checkbox.checked)
			.map(t => t.value as 'single-choice' | 'multiple-choice' | 'fill-blank' | 'short-answer');

		if (selectedTypes.length === 0) {
			new Notice('请至少选择一种题型');
			return;
		}

		const difficulty = this.difficultySelect.value as '简单' | '中等' | '困难';
		const totalQuestions = parseInt(this.countInput.value);

		if (totalQuestions < 5 || totalQuestions > 30) {
			new Notice('题目数量应在5-30之间');
			return;
		}

		this.result = {
			difficulty,
			totalQuestions,
			questionTypes: selectedTypes
		};
		this.close();
	}
}
