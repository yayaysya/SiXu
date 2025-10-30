import { ItemView, WorkspaceLeaf, TFile, Notice, EventRef, Modal, App, setIcon } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { CombineNoteItem, QuizQuestion, QuizQuestionResult, QuizData } from '../types';
import { StatisticsManager } from '../utils/statistics';
import { Activity, getActivityTypeLabel, getActivityTypeIcon } from '../types/activity';
import { ProgressCard } from '../components/ProgressCard';
import { formatNumber } from '../utils/format';
import { FlashcardDeck, Flashcard } from '../flashcard/types';
import { FlashcardStorage } from '../flashcard/FlashcardStorage';
import { CreateDeckModal, ConfirmFlashcardsModal, MergeDecksModal } from '../flashcard/FlashcardDeckView';

export const COMBINE_VIEW_TYPE = 'notebook-llm-combine-view';

/**
 * 主导航页面类型
 */
type ViewPage = 'home' | 'organize' | 'learning' | 'profile';

/**
 * 学习中心子页面状态
 */
type LearningViewState = 'hub' | 'quiz-hub' | 'quiz-list' | 'quiz-exam' | 'quiz-result' | 'flashcard-deck-list' | 'flashcard-study' | 'flashcard-create';

/**
 * @deprecated 旧的Tab类型，保留用于兼容
 */
type TabType = 'combine' | 'sources' | 'quiz';

/**
 * Quiz视图状态
 */
type QuizViewState = 'list' | 'exam' | 'result';

/**
 * 整理页面视图状态
 */
type OrganizeViewState = 'list' | 'search';

/**
 * 筛选条件
 */
interface FilterConditions {
	folders: string[];
	dateRange: { start: Date | null; end: Date | null } | null;
	tags: string[];
	keyword: string;
}

/**
 * 搜索结果笔记项
 */
interface SearchNoteItem {
	file: TFile;
	matchScore: number;
}

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

	// Flashcard相关状态
	private selectedDeckIds: Set<string> = new Set();
	private currentDeck: FlashcardDeck | null = null;
	private currentCards: Flashcard[] = [];
	private currentCardIndex: number = 0;
	private studyStartTime: number = 0;
	private deckSortMode: 'time' | 'name' | 'cards' = 'time';

	// 手势监听器管理（用于清理，防止累积）
	private gestureListeners: {
		mousemove?: (e: Event) => void;
		touchmove?: (e: Event) => void;
		mouseup?: (e: Event) => void;
		touchend?: (e: Event) => void;
	} = {};

	// 卡片翻转防抖时间戳（防止快速连续翻转）
	private lastFlipTime: number = 0;
	private flipDebounceMs: number = 300; // 300ms内只能翻转一次

	// 进度卡片相关状态
	private progressCard: ProgressCard | null = null;
	private isCancelled: boolean = false;

	// 整理页面搜索相关状态
	private organizeViewState: OrganizeViewState = 'list';
	private selectedNotePaths: Set<string> = new Set();
	private searchKeyword: string = '';
	private searchResults: SearchNoteItem[] = [];
	private filterConditions: FilterConditions = {
		folders: [],
		dateRange: null,
		tags: [],
		keyword: ''
	};
	private showFilterDrawer: boolean = false;
	private searchDebounceTimer: number | null = null;

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
		// 清理手势监听器
		this.cleanupGestureListeners();

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
			// 根据配置生成输出路径
			const combineNotesDir = this.plugin.settings.combineNotesDir;
			const outputPath = combineNotesDir ? `${combineNotesDir}/${outputFileName}` : outputFileName;

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

			// 完成：记录是否为前台等待（未选择“后台运行”）
			const wasForeground = this.progressCard?.isShown?.() === true;
			// 销毁进度卡片
			this.progressCard?.destroy();
			this.progressCard = null;

			new Notice(`Quiz生成成功：${quizFile.basename}`);

			// 生成完成后：若用户在前台等待，则自动跳转到“学习 → 试题列表”
			if (wasForeground) {
				this.quizViewState = 'list';
				this.learningState = 'quiz-list';
				this.currentPage = 'learning';
			}

			// 刷新视图（确保列表立即显示新试题）
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
					// 获取当前所有选中的checkbox
					const allCheckboxes = container.querySelectorAll(`input[type="checkbox"]`) as NodeListOf<HTMLInputElement>;
					const selected: string[] = [];
					allCheckboxes.forEach(cb => {
						if (cb.checked) {
							selected.push(cb.value);
						}
					});
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
				// 保存当前题目的答案状态（确保最新状态被保存）
				this.saveCurrentQuestionAnswer();
				this.currentQuestionIndex--;
				// 只重新渲染考试界面，避免完整的页面重渲染
				this.renderExamViewOnly();
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
				// 保存当前题目的答案状态
				this.saveCurrentQuestionAnswer();
				// 下一题
				this.currentQuestionIndex++;
				// 只重新渲染考试界面
				this.renderExamViewOnly();
			}
		});
	}

	/**
	 * 保存当前题目的答案状态
	 */
	private saveCurrentQuestionAnswer(): void {
		if (this.currentQuestionIndex >= 0 && this.currentQuestionIndex < this.currentQuestions.length) {
			const question = this.currentQuestions[this.currentQuestionIndex];
			const questionContainer = document.querySelector('.exam-question-container');

			if (!questionContainer) return;

			// 根据题目类型收集答案
			if (question.type === 'single-choice') {
				const selectedRadio = questionContainer.querySelector(`input[name="question-${question.id}"]:checked`) as HTMLInputElement;
				if (selectedRadio) {
					this.userAnswers.set(question.id, selectedRadio.value);
				}
			} else if (question.type === 'multiple-choice') {
				const selectedCheckboxes = questionContainer.querySelectorAll(`input[type="checkbox"]:checked`) as NodeListOf<HTMLInputElement>;
				const selected: string[] = [];
				selectedCheckboxes.forEach(checkbox => {
					selected.push(checkbox.value);
				});
				this.userAnswers.set(question.id, selected);
			} else if (question.type === 'fill-blank') {
				const input = questionContainer.querySelector('.exam-input') as HTMLInputElement;
				if (input) {
					this.userAnswers.set(question.id, input.value);
				}
			} else if (question.type === 'short-answer') {
				const textarea = questionContainer.querySelector('.exam-textarea') as HTMLTextAreaElement;
				if (textarea) {
					this.userAnswers.set(question.id, textarea.value);
				}
			}
		}
	}

	/**
	 * 只重新渲染考试界面，避免完整的页面重渲染
	 */
	private renderExamViewOnly(): void {
		const container = this.containerEl.querySelector('.view-content-area') as HTMLElement;
		if (!container) return;

		// 清空容器并重新渲染考试界面
		container.empty();
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
        scoreNum.setText(formatNumber(totalScore));

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
        scoreEl.setText(`${formatNumber(stat.score)} / ${formatNumber(stat.max, 0)}`);

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
        headerEl.createSpan({ text: `${formatNumber(result.score)}/${formatNumber(result.maxScore, 0)}分`, cls: 'result-detail-score' });

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
		const [combineCount, quizStats, flashcardStats] = await Promise.all([
			this.statisticsManager.getCombinedNotesCount(),
			this.statisticsManager.getQuizStatistics(),
			this.getFlashcardStatistics()
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

		// 卡片4：闪卡练习
		const card4 = grid.createDiv({ cls: 'dashboard-card' });
		card4.createDiv({ cls: 'card-icon', text: '📇' });
		card4.createDiv({ cls: 'card-value', text: flashcardStats.totalCards.toString() });
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

		// 根据状态渲染不同内容
		if (this.organizeViewState === 'search') {
			this.renderOrganizeSearchPage(container);
		} else {
			this.renderOrganizeListPage(container);
		}
	}

	/**
	 * 渲染整理列表页面（主界面）
	 */
	private renderOrganizeListPage(container: HTMLElement): void {
		// 页面标题
		const header = container.createDiv({ cls: 'page-header-section' });
		header.createEl('h2', { text: '思维整理', cls: 'page-title' });
		header.createEl('p', { text: '把多个笔记重新整合', cls: 'page-subtitle' });

		// 搜索框入口
		const searchBoxContainer = container.createDiv({ cls: 'organize-search-entry' });
		const searchBox = searchBoxContainer.createDiv({ cls: 'organize-search-box' });

		// 搜索框内容
		const searchText = searchBox.createSpan({ cls: 'search-placeholder', text: '搜索笔记' });

		// 图标容器
		const iconsContainer = searchBox.createDiv({ cls: 'search-icons' });
		const searchIcon = iconsContainer.createDiv({ cls: 'search-icon' });
		setIcon(searchIcon, 'search');
		const filterIcon = iconsContainer.createDiv({ cls: 'filter-icon' });
		setIcon(filterIcon, 'filter');

		// 点击搜索框进入搜索页面
		searchBox.addEventListener('click', () => {
			this.enterSearchMode();
		});

		// 复用原来的合并笔记Tab的内容
		this.renderCombineTab(container);
	}

	/**
	 * 进入搜索模式
	 */
	private enterSearchMode(): void {
		this.organizeViewState = 'search';
		this.searchKeyword = '';
		this.selectedNotePaths.clear();
		this.searchResults = [];
		this.render();
	}

	/**
	 * 退出搜索模式，返回列表
	 */
	private exitSearchMode(): void {
		this.organizeViewState = 'list';
		this.render();
	}

	/**
	 * 渲染搜索/选择页面
	 */
	private renderOrganizeSearchPage(container: HTMLElement): void {
		container.addClass('organize-search-page');

		// 顶栏
		const topBar = container.createDiv({ cls: 'search-top-bar' });

		// 返回按钮
		const backBtn = topBar.createEl('button', { cls: 'search-back-btn' });
		setIcon(backBtn, 'arrow-left');
		backBtn.addEventListener('click', () => {
			this.exitSearchMode();
		});

		// 搜索输入框
		const searchInputWrapper = topBar.createDiv({ cls: 'search-input-wrapper' });
		const searchInput = searchInputWrapper.createEl('input', {
			cls: 'search-input',
			type: 'text',
			placeholder: '搜索笔记...'
		});
		searchInput.value = this.searchKeyword;

		// 筛选按钮
		const filterBtn = topBar.createEl('button', {
			cls: this.showFilterDrawer ? 'search-filter-btn active' : 'search-filter-btn'
		});
		setIcon(filterBtn, 'filter');
		filterBtn.addEventListener('click', (e) => {
			e.stopPropagation(); // 防止事件冒泡
			this.showFilterDrawer = !this.showFilterDrawer;
			this.render();
		});

		// 搜索输入事件（实时搜索with debounce）
		searchInput.addEventListener('input', () => {
			this.searchKeyword = searchInput.value;
			this.debouncedSearch();
		});

		// 筛选标签区域
		if (this.hasActiveFilters()) {
			this.renderFilterTags(container);
		}

		// 筛选抽屉
		if (this.showFilterDrawer) {
			this.renderFilterDrawer(container);
		}

		// 搜索结果列表
		const resultsContainer = container.createDiv({ cls: 'search-results-container' });
		this.renderSearchResults(resultsContainer);

		// 底部确认按钮
		const bottomBar = container.createDiv({ cls: 'search-bottom-bar' });
		const confirmBtn = bottomBar.createEl('button', {
			cls: 'search-confirm-btn mod-cta',
			text: `确认添加 (${this.selectedNotePaths.size})`
		});
		confirmBtn.disabled = this.selectedNotePaths.size === 0;
		confirmBtn.addEventListener('click', () => {
			this.confirmAddNotes();
		});

		// 自动聚焦搜索框
		setTimeout(() => searchInput.focus(), 100);
	}

	/**
	 * 检查是否有活动的筛选条件
	 */
	private hasActiveFilters(): boolean {
		return this.filterConditions.folders.length > 0 ||
			this.filterConditions.dateRange !== null ||
			this.filterConditions.tags.length > 0 ||
			this.filterConditions.keyword.length > 0;
	}

	/**
	 * 渲染筛选标签
	 */
	private renderFilterTags(container: HTMLElement): void {
		const tagsContainer = container.createDiv({ cls: 'filter-tags-container' });

		// 文件夹标签
		this.filterConditions.folders.forEach(folder => {
			const tag = tagsContainer.createDiv({ cls: 'filter-tag' });
			tag.createSpan({ cls: 'filter-tag-icon', text: '📁' });
			tag.createSpan({ cls: 'filter-tag-text', text: folder });
			const removeBtn = tag.createSpan({ cls: 'filter-tag-remove', text: '×' });
			removeBtn.addEventListener('click', (e) => {
				console.log('删除文件夹筛选标签被点击:', folder);
				e.stopPropagation();
				this.removeFilterFolder(folder);
			});
		});

		// 日期范围标签
		if (this.filterConditions.dateRange) {
			const tag = tagsContainer.createDiv({ cls: 'filter-tag' });
			tag.createSpan({ cls: 'filter-tag-icon', text: '📅' });
			const dateText = this.formatDateRange(this.filterConditions.dateRange);
			tag.createSpan({ cls: 'filter-tag-text', text: dateText });
			const removeBtn = tag.createSpan({ cls: 'filter-tag-remove', text: '×' });
			removeBtn.addEventListener('click', (e) => {
				console.log('删除日期筛选标签被点击');
				e.stopPropagation();
				this.filterConditions.dateRange = null;
				this.applyFilters();
			});
		}

		// 标签标签
		this.filterConditions.tags.forEach(tagName => {
			const tag = tagsContainer.createDiv({ cls: 'filter-tag' });
			tag.createSpan({ cls: 'filter-tag-icon', text: '#' });
			tag.createSpan({ cls: 'filter-tag-text', text: tagName });
			const removeBtn = tag.createSpan({ cls: 'filter-tag-remove', text: '×' });
			removeBtn.addEventListener('click', (e) => {
				console.log('删除标签筛选标签被点击:', tagName);
				e.stopPropagation();
				this.removeFilterTag(tagName);
			});
		});
	}

	/**
	 * 格式化日期范围显示
	 */
	private formatDateRange(range: { start: Date | null; end: Date | null }): string {
		const format = (date: Date | null) => date ? date.toISOString().split('T')[0] : '';
		if (range.start && range.end) {
			return `${format(range.start)} - ${format(range.end)}`;
		} else if (range.start) {
			return `从 ${format(range.start)}`;
		} else if (range.end) {
			return `到 ${format(range.end)}`;
		}
		return '';
	}

	/**
	 * 移除筛选文件夹
	 */
	private removeFilterFolder(folder: string): void {
		this.filterConditions.folders = this.filterConditions.folders.filter(f => f !== folder);
		this.applyFilters();
	}

	/**
	 * 移除筛选标签
	 */
	private removeFilterTag(tag: string): void {
		this.filterConditions.tags = this.filterConditions.tags.filter(t => t !== tag);
		this.applyFilters();
	}

	/**
	 * 防抖搜索
	 */
	private debouncedSearch(): void {
		if (this.searchDebounceTimer !== null) {
			window.clearTimeout(this.searchDebounceTimer);
		}
		this.searchDebounceTimer = window.setTimeout(() => {
			this.performSearch();
		}, 300);
	}

	/**
	 * 执行搜索
	 */
	private async performSearch(): Promise<void> {
		const keyword = this.searchKeyword.trim().toLowerCase();
		const results: SearchNoteItem[] = [];

		// 获取所有markdown文件
		const allFiles = this.app.vault.getMarkdownFiles();

		for (const file of allFiles) {
			// 应用筛选条件
			if (!this.fileMatchesFilters(file)) {
				continue;
			}

			// 如果有关键词，计算匹配分数
			let matchScore = 0;
			if (keyword) {
				// 文件名匹配
				if (file.basename.toLowerCase().includes(keyword)) {
					matchScore += 10;
				}

				// 路径匹配
				if (file.path.toLowerCase().includes(keyword)) {
					matchScore += 5;
				}

				// 内容匹配（读取文件前100行）
				try {
					const content = await this.app.vault.read(file);
					const lines = content.split('\n').slice(0, 100).join('\n').toLowerCase();
					if (lines.includes(keyword)) {
						matchScore += 3;
					}
				} catch (error) {
					// 忽略读取错误
				}

				// 标签匹配
				const cache = this.app.metadataCache.getFileCache(file);
				const tags = cache?.frontmatter?.tags || [];
				if (Array.isArray(tags)) {
					for (const tag of tags) {
						if (tag.toLowerCase().includes(keyword)) {
							matchScore += 7;
							break;
						}
					}
				}
			} else {
				// 无关键词时，按修改时间排序
				matchScore = file.stat.mtime;
			}

			if (matchScore > 0 || !keyword) {
				results.push({ file, matchScore });
			}
		}

		// 排序：按匹配分数降序，分数相同则按修改时间降序
		results.sort((a, b) => {
			if (b.matchScore !== a.matchScore) {
				return b.matchScore - a.matchScore;
			}
			return b.file.stat.mtime - a.file.stat.mtime;
		});

		this.searchResults = results;
		this.render();
	}

	/**
	 * 检查文件是否匹配筛选条件
	 */
	private fileMatchesFilters(file: TFile): boolean {
		const filters = this.filterConditions;

		// 文件夹筛选
		if (filters.folders.length > 0) {
			const fileFolder = file.parent?.path || '';
			const matchesFolder = filters.folders.some(folder => 
				fileFolder === folder || fileFolder.startsWith(folder + '/')
			);
			if (!matchesFolder) {
				return false;
			}
		}

		// 日期范围筛选
		if (filters.dateRange) {
			const fileTime = file.stat.mtime;
			if (filters.dateRange.start && fileTime < filters.dateRange.start.getTime()) {
				return false;
			}
			if (filters.dateRange.end && fileTime > filters.dateRange.end.getTime()) {
				return false;
			}
		}

		// 标签筛选
		if (filters.tags.length > 0) {
			const cache = this.app.metadataCache.getFileCache(file);
			const fileTags = cache?.frontmatter?.tags || [];
			const hasMatchingTag = filters.tags.some(tag => 
				Array.isArray(fileTags) && fileTags.includes(tag)
			);
			if (!hasMatchingTag) {
				return false;
			}
		}

		return true;
	}

	/**
	 * 应用筛选条件
	 */
	private applyFilters(): void {
		this.performSearch();
	}

	/**
	 * 渲染筛选抽屉
	 */
	private renderFilterDrawer(container: HTMLElement): void {
		console.log('=== renderFilterDrawer 被调用 ===');
		const drawer = container.createDiv({ cls: 'filter-drawer' });
		console.log('筛选抽屉已创建，元素:', drawer);

		// 阻止drawer内的点击事件冒泡到搜索结果
		drawer.addEventListener('click', (e) => {
			console.log('筛选抽屉内被点击了，event:', e.target);
			e.stopPropagation();
		});

		// 文件夹选择
		const folderSection = drawer.createDiv({ cls: 'filter-section' });
		folderSection.createEl('h4', { text: '文件夹', cls: 'filter-section-title' });
		
		// 文件夹搜索输入框
		const folderSearchInput = folderSection.createEl('input', {
			type: 'text',
			cls: 'filter-search-input',
			placeholder: '搜索文件夹...'
		});

		// 获取所有文件夹
		const folders = new Set<string>();
		this.app.vault.getAllLoadedFiles().forEach(file => {
			if (file instanceof TFile && file.parent) {
				let current: typeof file.parent | null = file.parent;
				while (current && current.path !== '/') {
					folders.add(current.path);
					current = current.parent;
				}
			}
		});

		const folderList = folderSection.createDiv({ cls: 'filter-options' });
		const allFolders = Array.from(folders).sort();

		// 渲染文件夹列表的函数
		const renderFolderOptions = (filterText: string) => {
			folderList.empty();

			// 只有当有搜索文本时才显示列表
			if (!filterText) {
				return;
			}

			const filteredFolders = allFolders.filter(f => f.toLowerCase().includes(filterText.toLowerCase()));

			if (filteredFolders.length === 0) {
				folderList.createDiv({ cls: 'filter-empty', text: '无匹配的文件夹' });
				return;
			}

			filteredFolders.forEach(folder => {
				const option = folderList.createEl('label', { cls: 'filter-option' });
				const checkbox = option.createEl('input', { type: 'checkbox' });
				checkbox.checked = this.filterConditions.folders.includes(folder);
				checkbox.addEventListener('change', (e) => {
					console.log('文件夹 checkbox 被点击:', folder, 'checked:', checkbox.checked);
					e.stopPropagation();
					if (checkbox.checked) {
						this.filterConditions.folders.push(folder);
					} else {
						this.filterConditions.folders = this.filterConditions.folders.filter(f => f !== folder);
					}
					this.applyFilters();
				});
				option.createSpan({ text: folder || '根目录' });
			});
		};

		// 搜索事件
		folderSearchInput.addEventListener('input', (e) => {
			console.log('文件夹搜索输入:', folderSearchInput.value);
			e.stopPropagation();
			renderFolderOptions(folderSearchInput.value);
		});

		// 日期范围选择
		const dateSection = drawer.createDiv({ cls: 'filter-section' });
		dateSection.createEl('h4', { text: '日期范围', cls: 'filter-section-title' });

		// 快捷选项
		const quickOptions = dateSection.createDiv({ cls: 'filter-quick-options' });
		const quickDates = [
			{ label: '最近5天', days: 5 },
			{ label: '最近30天', days: 30 },
			{ label: '最近3个月', days: 90 }
		];

		quickDates.forEach(({ label, days }) => {
			const btn = quickOptions.createEl('button', { text: label, cls: 'filter-quick-btn' });
			btn.addEventListener('click', (e) => {
				e.stopPropagation();
				const now = new Date();
				const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
				this.filterConditions.dateRange = { start, end: now };
				this.applyFilters();
			});
		});

		// 自定义日期
		const customDate = dateSection.createDiv({ cls: 'filter-custom-date' });
		customDate.createSpan({ text: '开始日期:' });
		const startInput = customDate.createEl('input', { type: 'date', cls: 'date-input' });
		if (this.filterConditions.dateRange?.start) {
			startInput.value = this.filterConditions.dateRange.start.toISOString().split('T')[0];
		}
		startInput.addEventListener('change', (e) => {
			e.stopPropagation();
			const start = startInput.value ? new Date(startInput.value) : null;
			this.filterConditions.dateRange = {
				start,
				end: this.filterConditions.dateRange?.end || null
			};
			this.applyFilters();
		});

		customDate.createSpan({ text: '结束日期:' });
		const endInput = customDate.createEl('input', { type: 'date', cls: 'date-input' });
		if (this.filterConditions.dateRange?.end) {
			endInput.value = this.filterConditions.dateRange.end.toISOString().split('T')[0];
		}
		endInput.addEventListener('change', (e) => {
			e.stopPropagation();
			const end = endInput.value ? new Date(endInput.value) : null;
			this.filterConditions.dateRange = {
				start: this.filterConditions.dateRange?.start || null,
				end
			};
			this.applyFilters();
		});

		// 标签选择
		const tagSection = drawer.createDiv({ cls: 'filter-section' });
		tagSection.createEl('h4', { text: '标签', cls: 'filter-section-title' });

		// 标签搜索输入框
		const tagSearchInput = tagSection.createEl('input', {
			type: 'text',
			cls: 'filter-search-input',
			placeholder: '搜索标签...'
		});

		// 收集所有标签
		const allTags = new Set<string>();
		this.app.vault.getMarkdownFiles().forEach(file => {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache?.frontmatter?.tags || [];
			if (Array.isArray(tags)) {
				tags.forEach(tag => allTags.add(tag));
			}
		});

		const tagList = tagSection.createDiv({ cls: 'filter-options' });
		const allTagsArray = Array.from(allTags).sort();

		// 渲染标签列表的函数
		const renderTagOptions = (filterText: string) => {
			tagList.empty();

			// 只有当有搜索文本时才显示列表
			if (!filterText) {
				return;
			}

			const filteredTags = allTagsArray.filter(t => t.toLowerCase().includes(filterText.toLowerCase()));

			if (filteredTags.length === 0) {
				tagList.createDiv({ cls: 'filter-empty', text: '无匹配的标签' });
				return;
			}

			filteredTags.forEach(tag => {
				const option = tagList.createEl('label', { cls: 'filter-option' });
				const checkbox = option.createEl('input', { type: 'checkbox' });
				checkbox.checked = this.filterConditions.tags.includes(tag);
				checkbox.addEventListener('change', (e) => {
					console.log('标签 checkbox 被点击:', tag, 'checked:', checkbox.checked);
					e.stopPropagation();
					if (checkbox.checked) {
						this.filterConditions.tags.push(tag);
					} else {
						this.filterConditions.tags = this.filterConditions.tags.filter(t => t !== tag);
					}
					this.applyFilters();
				});
				option.createSpan({ text: `#${tag}` });
			});
		};

		// 搜索事件
		tagSearchInput.addEventListener('input', (e) => {
			console.log('标签搜索输入:', tagSearchInput.value);
			e.stopPropagation();
			renderTagOptions(tagSearchInput.value);
		});

		// 关键词筛选
		const keywordSection = drawer.createDiv({ cls: 'filter-section' });
		keywordSection.createEl('h4', { text: '额外关键词', cls: 'filter-section-title' });
		const keywordInput = keywordSection.createEl('input', {
			type: 'text',
			cls: 'filter-keyword-input',
			placeholder: '输入关键词...'
		});
		keywordInput.value = this.filterConditions.keyword;
		keywordInput.addEventListener('input', (e) => {
			e.stopPropagation();
			this.filterConditions.keyword = keywordInput.value;
		});
		keywordInput.addEventListener('click', (e) => {
			e.stopPropagation();
		});

		// 底部确认按钮
		const confirmSection = drawer.createDiv({ cls: 'filter-confirm-section' });
		const confirmBtn = confirmSection.createEl('button', {
			text: '确认筛选',
			cls: 'filter-confirm-btn'
		});
		confirmBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.showFilterDrawer = false;
			this.render();
		});
	}

	/**
	 * 渲染搜索结果列表
	 */
	private async renderSearchResults(container: HTMLElement): Promise<void> {
		if (this.searchResults.length === 0 && this.searchKeyword.trim()) {
			container.createDiv({ cls: 'empty-state', text: '没有找到匹配的笔记' });
			return;
		}

		if (this.searchResults.length === 0 && !this.searchKeyword.trim()) {
			container.createDiv({ cls: 'empty-state', text: '输入关键词开始搜索' });
			return;
		}

		const list = container.createDiv({ cls: 'search-results-list' });

		for (const result of this.searchResults) {
			const file = result.file;
			const isSelected = this.selectedNotePaths.has(file.path);

			const item = list.createDiv({ cls: isSelected ? 'search-result-item selected' : 'search-result-item' });

			// 左侧内容区
			const content = item.createDiv({ cls: 'result-content' });

			// 文件夹路径
			const folder = content.createDiv({ cls: 'result-folder' });
			folder.setText(file.parent?.path || '根目录');

			// 文件名
			const name = content.createDiv({ cls: 'result-name' });
			name.setText(file.basename);

			// 元信息行
			const meta = content.createDiv({ cls: 'result-meta' });

			// 日期
			const date = new Date(file.stat.mtime);
			const dateStr = date.toLocaleDateString();
			meta.createSpan({ cls: 'result-date', text: dateStr });

			// 标签
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache?.frontmatter?.tags || [];
			if (Array.isArray(tags) && tags.length > 0) {
				const tagContainer = meta.createSpan({ cls: 'result-tags' });
				tags.slice(0, 3).forEach(tag => {
					tagContainer.createSpan({ cls: 'result-tag', text: `#${tag}` });
				});
				if (tags.length > 3) {
					tagContainer.createSpan({ cls: 'result-tag-more', text: `+${tags.length - 3}` });
				}
			}

			// 预览
			try {
				const fileContent = await this.app.vault.read(file);
				const preview = this.getContentPreview(fileContent);
				if (preview) {
					const previewEl = content.createDiv({ cls: 'result-preview' });
					previewEl.setText(preview);
				}
			} catch (error) {
				// 忽略读取错误
			}

			// 右侧按钮
			const actionBtn = item.createDiv({ cls: isSelected ? 'result-action selected' : 'result-action' });
			actionBtn.setText(isSelected ? '✓' : '➕');

			// 点击整个项目切换选择状态
			item.addEventListener('click', () => {
				this.toggleNoteSelection(file.path);
			});
		}
	}

	/**
	 * 获取文件预览文本（从文件内容生成）
	 */
	private getContentPreview(content: string): string {
		// 移除YAML
		let text = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

		// 移除Markdown标记
		text = text
			.replace(/^#+\s+/gm, '')
			.replace(/\*\*(.+?)\*\*/g, '$1')
			.replace(/\*(.+?)\*/g, '$1')
			.replace(/`(.+?)`/g, '$1')
			.trim();

		// 取前100个字符
		if (text.length > 100) {
			return text.substring(0, 100) + '...';
		}
		return text;
	}

	/**
	 * 切换笔记选择状态
	 */
	private toggleNoteSelection(filePath: string): void {
		if (this.selectedNotePaths.has(filePath)) {
			this.selectedNotePaths.delete(filePath);
		} else {
			this.selectedNotePaths.add(filePath);
		}
		this.render();
	}

	/**
	 * 确认添加笔记
	 */
	private async confirmAddNotes(): Promise<void> {
		if (this.selectedNotePaths.size === 0) {
			return;
		}

		// 获取当前已有的笔记路径
		const existingPaths = new Set(this.plugin.settings.combineNotes.map(n => n.path));

		// 获取最大order值
		let maxOrder = this.plugin.settings.combineNotes.reduce(
			(max, note) => Math.max(max, note.order),
			0
		);

		// 添加新笔记
		let addedCount = 0;
		for (const path of this.selectedNotePaths) {
			if (existingPaths.has(path)) {
				continue; // 跳过已存在的
			}

			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				maxOrder++;
				this.plugin.settings.combineNotes.push({
					path: file.path,
					name: file.basename,
					order: maxOrder
				});
				addedCount++;
			}
		}

		// 保存设置
		await this.plugin.saveSettings();

		// 退出搜索模式
		this.exitSearchMode();

		// 显示通知
		new Notice(`已添加 ${addedCount} 个笔记`);
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
			case 'quiz-hub':
				this.renderQuizHubPage(container);
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
			case 'flashcard-deck-list':
				this.renderFlashcardDeckList(container);
				break;
			case 'flashcard-study':
				this.renderFlashcardStudy(container);
				break;
			case 'flashcard-create':
				this.renderFlashcardCreate(container);
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

		// Flash Card
		const flashcardCard = options.createDiv({ cls: 'learning-card' });
		const fcIcon = flashcardCard.createDiv({ cls: 'card-icon-large' });
		fcIcon.setText('📇');
		flashcardCard.createEl('h3', { text: '闪卡背诵' });
		flashcardCard.createEl('p', { text: 'Flash Card 内容背诵' });

		flashcardCard.addEventListener('click', () => {
			this.learningState = 'flashcard-deck-list';
			this.render();
		});

		// Quiz小试牛刀
		const quizCard = options.createDiv({ cls: 'learning-card' });
		const qzIcon = quizCard.createDiv({ cls: 'card-icon-large' });
		qzIcon.setText('📝');
		quizCard.createEl('h3', { text: '小试牛刀' });
		quizCard.createEl('p', { text: 'Quiz 知识测验' });

		quizCard.addEventListener('click', () => {
			this.learningState = 'quiz-hub';
			this.render();
		});
	}

	/**
	 * 渲染 Quiz Hub（选择“已有试题”或“创建新试题”）
	 */
	private renderQuizHubPage(container: HTMLElement): void {
		const page = container.createDiv({ cls: 'quiz-hub-page' });

		// 头部
		const header = page.createDiv({ cls: 'learning-page-header' });

		// 第一行：返回按钮 + 标题
		const titleRow = header.createDiv({ cls: 'header-title-row' });
		const backBtn = titleRow.createEl('button', { cls: 'back-btn-inline' });
		setIcon(backBtn, 'arrow-left');
		backBtn.addEventListener('click', () => {
			this.learningState = 'hub';
			this.render();
		});
		titleRow.createEl('h2', { text: 'Quiz 学习', cls: 'page-title' });

		// 第二行：副标题
		header.createEl('p', { text: '通过试题检验学习成果', cls: 'page-subtitle' });

		const options = page.createDiv({ cls: 'learning-options' });

		// 选择已有试题
		const existingCard = options.createDiv({ cls: 'learning-card' });
		existingCard.createDiv({ cls: 'card-icon-large', text: '📚' });
		existingCard.createEl('h3', { text: '选择已有试题' });
		existingCard.createEl('p', { text: '浏览并开始一套已有试题' });
		existingCard.addEventListener('click', () => {
			this.learningState = 'quiz-list';
			this.render();
		});

		// 创建新试题
		const createCard = options.createDiv({ cls: 'learning-card' });
		createCard.createDiv({ cls: 'card-icon-large', text: '✨' });
		createCard.createEl('h3', { text: '创建新试题' });
		createCard.createEl('p', { text: '从当前笔记或选择笔记生成试题' });
		createCard.addEventListener('click', async () => {
			let sourceFile = this.plugin.app.workspace.getActiveFile();
			if (!(sourceFile instanceof TFile)) {
				// 无激活笔记，弹出文件选择器
				sourceFile = await this.showFilePickerModal();
			}
			if (sourceFile) {
				await this.generateQuiz(sourceFile);
			}
		});
	}

	/**
	 * 选择一个 Markdown 文件作为 Quiz 源
	 */
	private showFilePickerModal(): Promise<TFile | null> {
		return new Promise((resolve) => {
			const allFiles = this.app.vault.getFiles().filter(f => f.extension === 'md');
			const modal = new FilePickerModal(this.app, allFiles, (file) => resolve(file));
			modal.open();
		});
	}

	/**
	 * 渲染Quiz列表页
	 */
	private async renderQuizListPage(container: HTMLElement): Promise<void> {
		const listPage = container.createDiv({ cls: 'quiz-list-page' });

		// 页面头部
		const header = listPage.createDiv({ cls: 'learning-page-header' });

		// 第一行：返回按钮 + 标题
		const titleRow = header.createDiv({ cls: 'header-title-row' });
		const backBtn = titleRow.createEl('button', { cls: 'back-btn-inline' });
		setIcon(backBtn, 'arrow-left');
		backBtn.addEventListener('click', () => {
			this.learningState = 'quiz-hub';
			this.render();
		});
		titleRow.createEl('h2', { text: '试题列表', cls: 'page-title' });

		// 第二行：副标题
		header.createEl('p', { text: '选择一套试题开始练习', cls: 'page-subtitle' });

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
	// ==================== 闪卡功能 ====================

	/**
	 * 渲染闪卡列表页
	 */
	private async renderFlashcardDeckList(container: HTMLElement): Promise<void> {
		container.empty();

		// 添加返回按钮的头部
		const header = container.createDiv({ cls: 'learning-page-header' });

		// 第一行：返回按钮 + 标题
		const titleRow = header.createDiv({ cls: 'header-title-row' });
		const backBtn = titleRow.createEl('button', { cls: 'back-btn-inline' });
		setIcon(backBtn, 'arrow-left');
		backBtn.addEventListener('click', () => {
			this.learningState = 'hub';
			this.render();
		});
		titleRow.createEl('h2', { text: '闪卡背诵', cls: 'page-title' });

		// 第二行：副标题
		header.createEl('p', { text: '选择一个卡组开始学习', cls: 'page-subtitle' });

		// 排序按钮
		const sortContainer = container.createDiv({ cls: 'flashcard-sort' });
		sortContainer.createSpan({ text: '排序：' });

		const timeBtn = sortContainer.createEl('button', {
			text: '时间',
			cls: this.deckSortMode === 'time' ? 'sort-btn active' : 'sort-btn'
		});
		timeBtn.addEventListener('click', () => {
			this.deckSortMode = 'time';
			this.render();
		});

		const nameBtn = sortContainer.createEl('button', {
			text: '名称',
			cls: this.deckSortMode === 'name' ? 'sort-btn active' : 'sort-btn'
		});
		nameBtn.addEventListener('click', () => {
			this.deckSortMode = 'name';
			this.render();
		});

		const cardsBtn = sortContainer.createEl('button', {
			text: '卡片数',
			cls: this.deckSortMode === 'cards' ? 'sort-btn active' : 'sort-btn'
		});
		cardsBtn.addEventListener('click', () => {
			this.deckSortMode = 'cards';
			this.render();
		});

		// 卡组列表容器
		const deckContainer = container.createDiv({ cls: 'flashcard-deck-list' });

		try {
			const storage = new FlashcardStorage(this.app, this.plugin.settings.flashcard?.deckDir || 'flashcards');
			let decks = await storage.loadAllDecks();

			// 应用排序
			decks = this.sortDecks(decks);

			if (decks.length === 0) {
				const empty = deckContainer.createDiv({ cls: 'empty-state' });
				empty.createEl('p', { text: '暂无闪卡组，请先创建一个卡组' });
			} else {
				// 渲染每个卡组
				for (const deck of decks) {
					this.renderDeckCard(deckContainer, deck, storage);
				}
			}

			// 添加"创建新卡组"卡片
			const createCard = deckContainer.createDiv({ cls: 'deck-card create-new' });
			const icon = createCard.createDiv({ cls: 'deck-icon' });
			icon.setText('➕');
			createCard.createEl('h3', { text: '创建新卡组' });
			createCard.createEl('p', { text: '从笔记生成学习卡片' });

			createCard.addEventListener('click', () => {
				this.openCreateDeckModal();
			});

			// 多选操作栏
			if (this.selectedDeckIds.size > 0) {
				this.renderMultiSelectActions(container, storage);
			}

		} catch (error) {
			console.error('加载闪卡组失败:', error);
			new Notice(`加载失败: ${error.message}`);
		}
	}

	/**
	 * 排序卡组
	 */
	private sortDecks(decks: FlashcardDeck[]): FlashcardDeck[] {
		const sorted = [...decks];

		if (this.deckSortMode === 'time') {
			sorted.sort((a, b) => {
				const timeA = a.stats.lastStudyTime || a.createdAt;
				const timeB = b.stats.lastStudyTime || b.createdAt;
				return timeB - timeA;
			});
		} else if (this.deckSortMode === 'name') {
			sorted.sort((a, b) => a.name.localeCompare(b.name));
		} else if (this.deckSortMode === 'cards') {
			sorted.sort((a, b) => b.stats.total - a.stats.total);
		}

		return sorted;
	}

	/**
	 * 渲染单个卡组卡片
	 */
	private renderDeckCard(container: HTMLElement, deck: FlashcardDeck, storage: FlashcardStorage): void {
		const isSelected = this.selectedDeckIds.has(deck.id);
		const card = container.createDiv({
			cls: isSelected ? 'deck-card selected' : 'deck-card'
		});

		// 标题
		const titleRow = card.createDiv({ cls: 'deck-title-row' });
		titleRow.createEl('h3', { text: deck.name });

		// 统计信息
		const stats = card.createDiv({ cls: 'deck-stats' });
		stats.createEl('span', { text: `📊 ${deck.stats.total} 张卡片` });
		stats.createEl('span', { text: `✅ ${deck.stats.mastered} 张已掌握` });

		// 进度条
		const progressBar = card.createDiv({ cls: 'deck-progress-bar' });
		const progressFill = progressBar.createDiv({ cls: 'deck-progress-fill' });
		progressFill.style.width = `${deck.stats.masteryRate}%`;

		// 详细分布
		const distribution = card.createDiv({ cls: 'deck-distribution' });
		distribution.createEl('span', { text: `新卡: ${deck.stats.new}` });
		distribution.createEl('span', { text: `学习中: ${deck.stats.learning}` });
		distribution.createEl('span', { text: `复习: ${deck.stats.review}` });

		// 按钮区域
		const actions = card.createDiv({ cls: 'deck-actions' });

		const studyBtn = actions.createEl('button', { text: '开始学习', cls: 'deck-btn primary' });
		studyBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.startStudying(deck.id);
		});

		const selectBtn = actions.createEl('button', {
			text: isSelected ? '✓ 已选' : '☐ 选择',
			cls: 'deck-btn'
		});
		selectBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleDeckSelection(deck.id);
		});

		const deleteBtn = actions.createEl('button', { text: '删除', cls: 'deck-btn' });
		deleteBtn.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.deleteDeck(deck.id, storage);
		});
	}

	/**
	 * 开始学习卡组
	 */
	private async startStudying(deckId: string): Promise<void> {
		try {
			const storage = new FlashcardStorage(this.app, this.plugin.settings.flashcard?.deckDir || 'flashcards');
			const result = await storage.loadDeck(deckId);

			if (!result) {
				new Notice('卡组不存在');
				return;
			}

			const { deck, cards } = result;

			// 获取今天需要学习的卡片
			const studyCards = await storage.getCardsToStudy(
				deckId,
				deck.settings.newCardsPerDay,
				deck.settings.reviewCardsPerDay
			);

			if (studyCards.length === 0) {
				new Notice('🎉 今天没有需要复习的卡片了！');
				return;
			}

			// 设置学习状态
			this.currentDeck = deck;
			this.currentCards = studyCards;
			this.currentCardIndex = 0;
			this.studyStartTime = Date.now();

			// 切换到学习视图
			this.learningState = 'flashcard-study';
			this.render();

		} catch (error) {
			console.error('开始学习失败:', error);
			new Notice(`开始学习失败: ${error.message}`);
		}
	}

	/**
	 * 删除卡组
	 */
	private async deleteDeck(deckId: string, storage: FlashcardStorage): Promise<void> {
		// TODO: Add confirmation modal
		try {
			await storage.deleteDeck(deckId);
			new Notice('卡组已删除');
			this.render(); // 刷新列表
		} catch (error) {
			console.error('删除卡组失败:', error);
			new Notice(`删除失败: ${error.message}`);
		}
	}

	/**
	 * 切换卡组选择状态
	 */
	private toggleDeckSelection(deckId: string): void {
		if (this.selectedDeckIds.has(deckId)) {
			this.selectedDeckIds.delete(deckId);
		} else {
			this.selectedDeckIds.add(deckId);
		}
		this.render();
	}

	/**
	 * 渲染多选操作栏
	 */
	private renderMultiSelectActions(container: HTMLElement, storage: FlashcardStorage): void {
		const actionsBar = container.createDiv({ cls: 'multi-select-actions' });

		actionsBar.createSpan({ text: `已选中 ${this.selectedDeckIds.size} 个卡组` });

		const mergeBtn = actionsBar.createEl('button', {
			text: '🔗 合并选中的卡组',
			cls: 'action-btn primary'
		});
		mergeBtn.addEventListener('click', () => {
			this.showMergeDecksModal(storage);
		});

		const cancelBtn = actionsBar.createEl('button', {
			text: '✖ 取消选择',
			cls: 'action-btn'
		});
		cancelBtn.addEventListener('click', () => {
			this.selectedDeckIds.clear();
			this.render();
		});
	}

	/**
	 * 显示合并卡组对话框
	 */
	private async showMergeDecksModal(storage: FlashcardStorage): Promise<void> {
		if (this.selectedDeckIds.size < 2) {
			new Notice('请至少选择2个卡组进行合并');
			return;
		}

		try {
			const decks = await storage.loadAllDecks();
			const selectedDecks = decks.filter(d => this.selectedDeckIds.has(d.id));

			new MergeDecksModal(
				this.app,
				selectedDecks,
				async (newName) => {
					await this.mergeDecks(Array.from(this.selectedDeckIds), newName, storage);
				}
			).open();
		} catch (error) {
			console.error('加载卡组失败:', error);
			new Notice('加载卡组失败');
		}
	}

	/**
	 * 合并卡组
	 */
	private async mergeDecks(deckIds: string[], newName: string, storage: FlashcardStorage): Promise<void> {
		try {
			await storage.mergeDecks(deckIds, newName);
			this.selectedDeckIds.clear();
			new Notice('合并成功');
			this.render();
		} catch (error) {
			console.error('合并卡组失败:', error);
			new Notice(`合并失败: ${error.message}`);
		}
	}

	/**
	 * 打开创建卡组对话框
	 */
	private openCreateDeckModal(): void {
		const modal = new CreateDeckModal(
			this.app,
			async (deckName: string, sourceNote: string, cardCount: number) => {
				try {
					// 重置取消标志
					this.isCancelled = false;

					// 创建进度卡片
					const contentArea = this.containerEl.querySelector('.view-content-area');
					if (!contentArea) return;

					this.progressCard = new ProgressCard(contentArea as HTMLElement, {
						title: '闪卡生成中',
						onCancel: () => {
							this.isCancelled = true;
							this.progressCard?.destroy();
							this.progressCard = null;
							new Notice('已取消生成');
						},
						onBackground: () => {
							this.progressCard?.hide();
							new Notice('闪卡正在后台生成，完成后会通知您');
						}
					});
					this.progressCard.show();
					this.progressCard.updateProgress(0, '准备中...');

					const { FlashcardGenerator } = await import('../flashcard/FlashcardGenerator');
					const generator = new FlashcardGenerator(this.app, this.plugin);

					const result = await generator.generateFromNote(
						{
							sourceNote: sourceNote,
							deckName: deckName,
							count: cardCount
						},
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

					const storage = new FlashcardStorage(this.app, this.plugin.settings.flashcard?.deckDir || 'flashcards');

					// 显示确认对话框
					const confirmModal = new ConfirmFlashcardsModal(
						this.app,
						result.cards,
						async (selectedCards: Flashcard[]) => {
							if (selectedCards.length > 0) {
								await storage.saveDeck(result.deck, selectedCards);
								new Notice(`✅ 成功创建卡组，包含 ${selectedCards.length} 张卡片`);
								this.render(); // 刷新列表
							}
						}
					);
					confirmModal.open();

				} catch (error) {
					// 清理进度卡片
					this.progressCard?.destroy();
					this.progressCard = null;

					if (error.message !== 'User cancelled') {
						console.error('生成闪卡失败:', error);
						new Notice(`生成失败: ${error.message}`);
					}
				}
			}
		);
		modal.open();
	}

	/**
	 * 渲染闪卡学习页 - 新版3D卡片交互
	 */
	private renderFlashcardStudy(container: HTMLElement): void {
		container.empty();

		if (!this.currentDeck || this.currentCards.length === 0) {
			container.createEl('p', { text: '没有可学习的卡片', cls: 'empty-state' });
			return;
		}

		const currentCard = this.currentCards[this.currentCardIndex];

		// 添加返回按钮的头部
		const header = container.createDiv({ cls: 'learning-page-header' });

		// 第一行：返回按钮 + 标题
		const titleRow = header.createDiv({ cls: 'header-title-row' });
		const backBtn = titleRow.createEl('button', { cls: 'back-btn-inline' });
		setIcon(backBtn, 'arrow-left');
		backBtn.addEventListener('click', () => {
			this.learningState = 'flashcard-deck-list';
			this.render();
		});
		titleRow.createEl('h2', { text: this.currentDeck.name, cls: 'page-title' });

		// 第二行：副标题
		//header.createEl('p', { text: '通过间隔重复加深记忆', cls: 'page-subtitle' });

		// 创建3D卡片容器
		const studyContainer = container.createDiv({ cls: 'flashcard-study-container' });
		const card3d = this.createCardElement(currentCard, this.currentCardIndex, this.currentCards.length);
		studyContainer.appendChild(card3d);

		// 设置手势操作
		this.setupCardGestures(card3d, currentCard.id);

		// 评分按钮（固定在底部）
		this.renderRatingButtons(container, currentCard.id);
	}

	/**
	 * 创建3D卡片元素
	 */
	private createCardElement(card: Flashcard, currentIndex: number, totalCards: number): HTMLElement {
		const card3d = document.createElement('div');
		card3d.addClass('flashcard-3d');
		card3d.addClass('enter'); // 添加进入动画

		// 卡片正面 - 问题
		const cardFront = card3d.createDiv({ cls: 'card-face card-front' });

		// 添加序号标记（正面）
		const progressBadgeFront = cardFront.createDiv({ cls: 'card-progress-badge' });
		progressBadgeFront.setText(`${currentIndex + 1}/${totalCards}`);

		const questionContent = cardFront.createDiv({ cls: 'card-question-content' });
		questionContent.createEl('h3', { text: '💭 回忆答案' });
		questionContent.createEl('p', { text: card.question });

		// 卡片背面 - 答案
		const cardBack = card3d.createDiv({ cls: 'card-face card-back' });

		// 添加序号标记（背面）
		const progressBadgeBack = cardBack.createDiv({ cls: 'card-progress-badge' });
		progressBadgeBack.setText(`${currentIndex + 1}/${totalCards}`);

		const answerContent = cardBack.createDiv({ cls: 'card-answer-content' });
		answerContent.createEl('h3', { text: '✓ 答案' });
		answerContent.createEl('p', { text: card.answer });

		// 原文链接按钮（如果有原文信息）
		if (card.sourceNote && card.sourceSection) {
			const sourceBtn = answerContent.createEl('button', {
				cls: 'source-link-btn',
				text: '🔗 查看原文'
			});
			sourceBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showSourcePopover(card.sourceNote, card.sourceSection);
			});
		}

		// 注意：点击翻转功能已集成到手势系统中（setupCardGestures）
		// 不需要单独的click事件监听器

		return card3d;
	}

	/**
	 * 翻转卡片
	 */
	private toggleCardFlip(cardEl: HTMLElement): void {
		const wasFlipped = cardEl.hasClass('flipped');

		// 移除进入动画类，避免与翻转动画冲突
		cardEl.removeClass('enter');

		// 诊断：检查翻转前的CSS状态
		console.log('[FlashCard] 翻转前诊断', {
			wasFlipped,
			classList: cardEl.className,
			hasFlippedClass: cardEl.classList.contains('flipped'),
			// 检查CSS规则
			cssRules: {
				transform: window.getComputedStyle(cardEl).transform,
				transformStyle: window.getComputedStyle(cardEl).transformStyle,
				transition: window.getComputedStyle(cardEl).transition,
				backfaceVisibility: window.getComputedStyle(cardEl).backfaceVisibility,
				perspective: window.getComputedStyle(cardEl).perspective
			},
			// 检查父容器
			parentPerspective: cardEl.parentElement ? window.getComputedStyle(cardEl.parentElement).perspective : 'no parent'
		});

		if (wasFlipped) {
			cardEl.removeClass('flipped');
			console.log('[FlashCard] 翻转：背面 → 正面');
		} else {
			cardEl.addClass('flipped');
			console.log('[FlashCard] 翻转：正面 → 背面');
		}

		// 强制浏览器重新计算样式
		void cardEl.offsetHeight;

		// 诊断：检查翻转后CSS状态（延迟一帧确保CSS已应用）
		setTimeout(() => {
			console.log('[FlashCard] 翻转后诊断（50ms延迟）', {
				nowFlipped: cardEl.hasClass('flipped'),
				classList: cardEl.className,
				hasFlippedClass: cardEl.classList.contains('flipped'),
				cssRules: {
					transform: window.getComputedStyle(cardEl).transform,
					transformStyle: window.getComputedStyle(cardEl).transformStyle,
					transition: window.getComputedStyle(cardEl).transition,
					backfaceVisibility: window.getComputedStyle(cardEl).backfaceVisibility
				},
				// 检查子元素（正面和背面）
				frontFace: {
					transform: cardEl.querySelector('.card-front') ? 
						window.getComputedStyle(cardEl.querySelector('.card-front')!).transform : 'not found',
					backfaceVisibility: cardEl.querySelector('.card-front') ?
						window.getComputedStyle(cardEl.querySelector('.card-front')!).backfaceVisibility : 'not found'
				},
				backFace: {
					transform: cardEl.querySelector('.card-back') ?
						window.getComputedStyle(cardEl.querySelector('.card-back')!).transform : 'not found',
					backfaceVisibility: cardEl.querySelector('.card-back') ?
						window.getComputedStyle(cardEl.querySelector('.card-back')!).backfaceVisibility : 'not found'
				}
			});
		}, 50);
	}

	/**
	 * 渲染评分按钮
	 */
	private renderRatingButtons(container: HTMLElement, cardId: string): void {
		const ratingButtons = container.createDiv({ cls: 'rating-buttons' });

		const ratings = [
			{ label: '忘记', value: 0, desc: '完全不记得' },
			{ label: '困难', value: 1, desc: '勉强想起来' },
			{ label: '熟悉', value: 2, desc: '回忆正确' },
			{ label: '简单', value: 3, desc: '轻松回答' }
		];

		ratings.forEach(rating => {
			const btn = ratingButtons.createEl('button', {
				cls: 'rating-btn'
			});

			// 设置完整文字（PC端显示）
			btn.textContent = `${rating.label}\n${rating.desc}`;

			// 添加短文本属性（移动端使用）
			btn.setAttribute('data-short-label', rating.label);

			btn.addEventListener('click', async () => {
				// 禁用所有按钮
				ratingButtons.addClass('disabled');
				const allBtns = ratingButtons.querySelectorAll('.rating-btn');
				allBtns.forEach(b => (b as HTMLButtonElement).disabled = true);

				// 触发退出动画
				await this.animateCardExit(rating.value as 0 | 1 | 2 | 3, cardId);
			});
		});
	}

	/**
	 * 清理手势监听器
	 */
	private cleanupGestureListeners(): void {
		if (this.gestureListeners.mousemove) {
			document.removeEventListener('mousemove', this.gestureListeners.mousemove);
		}
		if (this.gestureListeners.touchmove) {
			document.removeEventListener('touchmove', this.gestureListeners.touchmove as any);
		}
		if (this.gestureListeners.mouseup) {
			document.removeEventListener('mouseup', this.gestureListeners.mouseup);
		}
		if (this.gestureListeners.touchend) {
			document.removeEventListener('touchend', this.gestureListeners.touchend);
		}
		this.gestureListeners = {};
	}

	/**
	 * 设置卡片手势操作
	 */
	private setupCardGestures(cardEl: HTMLElement, cardId: string): void {
		// 先清理旧监听器，防止累积
		this.cleanupGestureListeners();

		let startX = 0;
		let currentX = 0;
		let isDragging = false;
		let dragStartTime = 0;
		let hasFlipped = false; // 防止重复翻转

		const handleDragStart = (e: MouseEvent | TouchEvent) => {
			// 只阻止按钮点击，允许翻转后的卡片继续响应
			if ((e.target as HTMLElement).tagName === 'BUTTON') {
				console.log('[FlashCard] 点击了按钮，忽略');
				return;
			}

			console.log('[FlashCard] 开始拖动/点击', {
				isFlipped: cardEl.hasClass('flipped'),
				eventType: 'touches' in e ? 'touch' : 'mouse'
			});

			isDragging = true;
			hasFlipped = false; // 重置翻转标志
			dragStartTime = Date.now();
			startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
			currentX = startX;

			cardEl.addClass('dragging');
		};

		const handleDragMove = (e: MouseEvent | TouchEvent) => {
			if (!isDragging) return;

			e.preventDefault();
			const prevX = currentX;
			currentX = 'touches' in e ? e.touches[0].clientX : e.clientX;
			const deltaX = currentX - startX;

			// 只在移动超过5px时打印，避免日志过多
			if (Math.abs(deltaX) > 5 && Math.abs(deltaX - (prevX - startX)) > 2) {
				console.log('[FlashCard] 拖动中', {
					deltaX,
					prevX,
					currentX,
					startX
				});
			}

			// 应用位移
			cardEl.style.transform = `translateX(${deltaX}px) rotate(${deltaX * 0.1}deg)`;

			// 根据拖动方向显示颜色提示
			if (deltaX < -20) {
				cardEl.removeClass('drag-right');
				cardEl.addClass('drag-left');
				cardEl.style.setProperty('--drag-opacity', String(Math.min(Math.abs(deltaX) / 100, 1)));
			} else if (deltaX > 20) {
				cardEl.removeClass('drag-left');
				cardEl.addClass('drag-right');
				cardEl.style.setProperty('--drag-opacity', String(Math.min(Math.abs(deltaX) / 100, 1)));
			} else {
				cardEl.removeClass('drag-left');
				cardEl.removeClass('drag-right');
			}
		};

		const handleDragEnd = async (e?: Event) => {
			console.log('[FlashCard] 拖动/点击结束', {
				isDragging,
				hasFlipped,
				eventType: e ? e.type : 'unknown',
				startX,
				currentX,
				deltaX: currentX - startX,
				duration: Date.now() - dragStartTime,
				timeSinceLastFlip: Date.now() - this.lastFlipTime
			});

			if (!isDragging) {
				console.log('[FlashCard] isDragging为false，直接返回');
				return;
			}

			// 防止重复翻转（局部标志）
			if (hasFlipped) {
				console.log('[FlashCard] 已经翻转过了（局部标志），忽略重复触发');
				return;
			}

			// 防止快速连续翻转（全局时间戳检查）
			const now = Date.now();
			if (now - this.lastFlipTime < this.flipDebounceMs) {
				console.log('[FlashCard] 翻转防抖期内，忽略', {
					timeSinceLastFlip: now - this.lastFlipTime,
					debounceMs: this.flipDebounceMs
				});
				isDragging = false;
				return;
			}

			isDragging = false;

			const deltaX = currentX - startX;
			const dragDuration = Date.now() - dragStartTime;
			const threshold = 100; // 滑动阈值

			cardEl.removeClass('dragging');
			cardEl.removeClass('drag-left');
			cardEl.removeClass('drag-right');

			// 判断是点击还是拖拽
			if (Math.abs(deltaX) < 5 && dragDuration < 200) {
				// 这是点击操作，翻转卡片
				hasFlipped = true; // 标记已翻转，防止重复

				// 阻止触摸事件的默认行为（防止移动端生成合成点击事件）
				if (e && e.type === 'touchend') {
					e.preventDefault();
					console.log('[FlashCard] 已阻止touchend的默认行为');
				}

				console.log('[FlashCard] 判定为点击操作，执行翻转', {
					deltaX,
					duration: dragDuration,
					wasFlipped: cardEl.hasClass('flipped'),
					eventType: e ? e.type : 'unknown'
				});

				// 完全移除内联transform，让CSS类生效
				cardEl.style.removeProperty('transform');
				cardEl.style.setProperty('--drag-opacity', '0');

				console.log('[FlashCard] 移除内联transform后，准备翻转', {
					inlineTransform: cardEl.style.transform,
					computedTransform: window.getComputedStyle(cardEl).transform
				});

				this.toggleCardFlip(cardEl);

				// 更新全局防抖时间戳
				this.lastFlipTime = Date.now();

				console.log('[FlashCard] 翻转完成', {
					nowFlipped: cardEl.hasClass('flipped'),
					inlineTransform: cardEl.style.transform,
					computedTransform: window.getComputedStyle(cardEl).transform,
					newLastFlipTime: this.lastFlipTime
				});
				return;
			}

			if (Math.abs(deltaX) >= threshold) {
				// 超过阈值，触发评分
				const rating = deltaX < 0 ? 0 : 3; // 左滑=忘记(0)，右滑=简单(3)
				console.log('[FlashCard] 判定为滑动评分', {
					deltaX,
					rating
				});

				// 禁用按钮
				const ratingButtons = this.containerEl.querySelector('.rating-buttons');
				if (ratingButtons) {
					ratingButtons.addClass('disabled');
					const allBtns = ratingButtons.querySelectorAll('.rating-btn');
					allBtns.forEach(b => (b as HTMLButtonElement).disabled = true);
				}

				// 继续滑出动画
				await this.animateCardExit(rating as 0 | 3, cardId);
			} else {
				// 未超过阈值，回弹
				console.log('[FlashCard] 拖动距离不足，回弹', { deltaX });
				// 完全移除内联transform，让CSS类生效
				cardEl.style.removeProperty('transform');
				cardEl.style.setProperty('--drag-opacity', '0');
			}
		};

		// 绑定事件
		cardEl.addEventListener('mousedown', handleDragStart as any);
		cardEl.addEventListener('touchstart', handleDragStart as any);

		// 保存监听器引用以便后续清理
		this.gestureListeners.mousemove = handleDragMove as any;
		this.gestureListeners.touchmove = handleDragMove as any;
		this.gestureListeners.mouseup = handleDragEnd as any;
		this.gestureListeners.touchend = handleDragEnd as any;

		// 使用保存的引用绑定到document
		document.addEventListener('mousemove', this.gestureListeners.mousemove!);
		document.addEventListener('touchmove', this.gestureListeners.touchmove!, { passive: false });
		document.addEventListener('mouseup', this.gestureListeners.mouseup!);
		document.addEventListener('touchend', this.gestureListeners.touchend!);
	}

	/**
	 * 卡片退出动画
	 */
	private async animateCardExit(rating: 0 | 1 | 2 | 3, cardId: string): Promise<void> {
		const studyContainer = this.containerEl.querySelector('.flashcard-study-container');
		if (!studyContainer) return;

		const card3d = studyContainer.querySelector('.flashcard-3d') as HTMLElement;
		if (!card3d) return;

		// 清除进入动画
		card3d.removeClass('enter');
		card3d.removeClass('dragging');

		// 根据评分选择退出方向
		const direction = (rating === 0 || rating === 1) ? 'left' : 'right';
		card3d.addClass(`exit-${direction}`);

		// 等待动画完成（400ms）
		await new Promise(resolve => setTimeout(resolve, 400));

		// 更新学习数据
		await this.rateCard(cardId, rating);

		// 检查是否最后一张
		const isLastCard = this.currentCardIndex === this.currentCards.length - 1;

		if (isLastCard) {
			new Notice('🎉 今天的学习任务完成了！');
			this.learningState = 'flashcard-deck-list';
			this.render();
		} else {
			// 移动到下一张
			this.currentCardIndex++;
			this.updateCardDisplay();
		}
	}

	/**
	 * 更新卡片显示（不重新渲染整个页面）
	 */
	private updateCardDisplay(): void {
		const studyContainer = this.containerEl.querySelector('.flashcard-study-container');
		const ratingButtons = this.containerEl.querySelector('.rating-buttons');

		if (!studyContainer || !this.currentDeck) return;

		// 移除旧卡片
		studyContainer.empty();

		// 创建新卡片
		const currentCard = this.currentCards[this.currentCardIndex];
		const newCard = this.createCardElement(currentCard, this.currentCardIndex, this.currentCards.length);
		studyContainer.appendChild(newCard);

		// 设置手势
		this.setupCardGestures(newCard, currentCard.id);

		// 重新启用按钮
		if (ratingButtons) {
			ratingButtons.removeClass('disabled');
			const allBtns = ratingButtons.querySelectorAll('.rating-btn');
			allBtns.forEach(b => (b as HTMLButtonElement).disabled = false);
		}
	}

	/**
	 * 显示原文悬浮窗
	 */
	private async showSourcePopover(sourceNote: string, sourceSection: string): Promise<void> {
		try {
			// 查找原文件
			const file = this.app.vault.getAbstractFileByPath(sourceNote);
			if (!(file instanceof TFile)) {
				new Notice('无法找到原文件');
				return;
			}

			// 读取文件内容
			const content = await this.app.vault.read(file);

			// 提取相关段落（简单实现：搜索包含sourceSection的段落）
			const lines = content.split('\n');
			let sectionContent = '';
			let inSection = false;
			let sectionStart = -1;

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];

				// 检查是否是目标章节标题
				if (line.includes(sourceSection) || line.trim() === sourceSection.trim()) {
					inSection = true;
					sectionStart = i;
					sectionContent += line + '\n';
					continue;
				}

				if (inSection) {
					// 遇到新的标题，停止
					if (line.startsWith('#') && i > sectionStart) {
						break;
					}
					sectionContent += line + '\n';

					// 最多读取20行
					if (i - sectionStart > 20) {
						sectionContent += '\n...(内容过长，已截断)';
						break;
					}
				}
			}

			if (!sectionContent.trim()) {
				sectionContent = '未找到匹配的章节内容';
			}

			// 显示悬浮窗
			new SourcePopoverModal(this.app, file.basename, sourceSection, sectionContent, () => {
				// 跳转到原文
				this.app.workspace.getLeaf().openFile(file);
			}).open();

		} catch (error) {
			console.error('加载原文失败:', error);
			new Notice('加载原文失败');
		}
	}

	/**
	 * 给卡片评分并更新学习状态
	 */
	private async rateCard(cardId: string, rating: 0 | 1 | 2 | 3): Promise<void> {
		if (!this.currentDeck) return;

		try {
			const storage = new FlashcardStorage(this.app, this.plugin.settings.flashcard?.deckDir || 'flashcards');
			const timeTaken = Date.now() - this.studyStartTime;

			await storage.updateCardLearningState(this.currentDeck.id, cardId, rating, timeTaken);

			// 重置计时
			this.studyStartTime = Date.now();

		} catch (error) {
			console.error('更新卡片状态失败:', error);
			new Notice(`更新失败: ${error.message}`);
		}
	}

	/**
	 * 渲染创建闪卡页（占位）
	 */
	private renderFlashcardCreate(container: HTMLElement): void {
		container.empty();
		container.createEl('p', { text: '创建闪卡功能（通过对话框实现）', cls: 'empty-state' });
	}

	/**
	 * 获取闪卡统计信息
	 */
	private async getFlashcardStatistics(): Promise<{ totalCards: number; totalDecks: number; masteredCards: number }> {
		try {
			const storage = new FlashcardStorage(this.app, this.plugin.settings.flashcard?.deckDir || 'flashcards');
			const decks = await storage.loadAllDecks();

			let totalCards = 0;
			let masteredCards = 0;

			for (const deck of decks) {
				totalCards += deck.stats.total;
				masteredCards += deck.stats.mastered;
			}

			return {
				totalCards,
				totalDecks: decks.length,
				masteredCards
			};
		} catch (error) {
			console.error('获取闪卡统计失败:', error);
			return { totalCards: 0, totalDecks: 0, masteredCards: 0 };
		}
	}

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

		// 添加自定义类名，避免样式污染其他模态框
		this.modalEl.addClass('quiz-generation-modal');

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

/**
 * 简易文件选择器（用于选择生成 Quiz 的源笔记）
 */
class FilePickerModal extends Modal {
    private files: TFile[];
    private onChoose: (file: TFile | null) => void;
    private selected: TFile | null = null;
    private listContainer!: HTMLElement;
    private searchInput!: HTMLInputElement;

    constructor(app: App, files: TFile[], onChoose: (file: TFile | null) => void) {
        super(app);
        this.files = files;
        this.onChoose = onChoose;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.addClass('file-picker-modal');

        contentEl.createEl('h3', { text: '选择笔记生成试题' });

        // 搜索框
        const searchWrap = contentEl.createDiv({ cls: 'setting-item' });
        this.searchInput = searchWrap.createEl('input', { type: 'text', placeholder: '输入关键词过滤…' });
        this.searchInput.addEventListener('input', () => this.renderList());

        // 列表
        this.listContainer = contentEl.createDiv({ cls: 'file-list-container' });
        this.renderList();

        // 按钮
        const btns = contentEl.createDiv({ cls: 'modal-button-container' });
        const cancelBtn = btns.createEl('button', { text: '取消' });
        cancelBtn.addEventListener('click', () => { this.selected = null; this.close(); });
    }

    private renderList(): void {
        this.listContainer.empty();
        const keyword = (this.searchInput?.value || '').trim().toLowerCase();
        const filtered = keyword
            ? this.files.filter(f => f.basename.toLowerCase().includes(keyword) || f.path.toLowerCase().includes(keyword))
            : this.files;

        if (filtered.length === 0) {
            this.listContainer.createDiv({ text: '未找到匹配的笔记', cls: 'empty-state' });
            return;
        }

        // 按最近修改时间倒序
        filtered.sort((a, b) => b.stat.mtime - a.stat.mtime);

        filtered.slice(0, 200).forEach(file => {
            const item = this.listContainer.createDiv({ cls: 'file-list-item' });
            item.createDiv({ cls: 'file-name', text: file.basename });
            item.createDiv({ cls: 'file-path', text: file.path });
            item.addEventListener('click', () => { this.selected = file; this.close(); });
        });
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.onChoose(this.selected);
    }
}

/**
 * 原文悬浮窗对话框
 */
class SourcePopoverModal extends Modal {
	private fileName: string;
	private sectionTitle: string;
	private sectionContent: string;
	private onJumpToSource: () => void;

	constructor(
		app: App,
		fileName: string,
		sectionTitle: string,
		sectionContent: string,
		onJumpToSource: () => void
	) {
		super(app);
		this.fileName = fileName;
		this.sectionTitle = sectionTitle;
		this.sectionContent = sectionContent;
		this.onJumpToSource = onJumpToSource;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('source-popover-modal');

		// 头部
		const header = contentEl.createDiv({ cls: 'source-popover-header' });
		header.createDiv({ cls: 'source-icon', text: '📄' });
		header.createEl('h3', { text: this.fileName });

		// 内容区域
		const content = contentEl.createDiv({ cls: 'source-popover-content' });

		// 章节标题
		const section = content.createDiv({ cls: 'source-popover-section' });
		section.createEl('h4', { text: '相关段落' });

		const sectionText = section.createEl('p');
		sectionText.setText(this.sectionContent);

		// 按钮区域
		const actions = contentEl.createDiv({ cls: 'source-popover-actions' });

		const closeBtn = actions.createEl('button', { text: '关闭' });
		closeBtn.addEventListener('click', () => this.close());

		const jumpBtn = actions.createEl('button', {
			text: '跳转到原文',
			cls: 'mod-cta'
		});
		jumpBtn.addEventListener('click', () => {
			this.onJumpToSource();
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
