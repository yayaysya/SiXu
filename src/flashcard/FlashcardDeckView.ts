import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, App, setIcon } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { FlashcardDeck, Flashcard, FlashcardGenerationOptions } from './types';
import { FlashcardStorage } from './FlashcardStorage';
import { FlashcardGenerator } from './FlashcardGenerator';
import { ProgressCard } from '../components/ProgressCard';

export const FLASHCARD_VIEW_TYPE = 'flashcard-deck-management';

type SortMode = 'time' | 'mastery';

/**
 * 闪卡组管理界面
 */
export class FlashcardDeckView extends ItemView {
	plugin: NotebookLLMPlugin;
	private storage: FlashcardStorage;
	private generator: FlashcardGenerator;
	private decks: FlashcardDeck[] = [];
	private sortMode: SortMode = 'time';
	private selectedDeckIds: Set<string> = new Set();
	private progressCard: ProgressCard | null = null;
	private isCancelled: boolean = false;

	constructor(leaf: WorkspaceLeaf, plugin: NotebookLLMPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.storage = new FlashcardStorage(
			this.app,
			this.plugin.settings.flashcard?.deckDir || 'flashcards'
		);
		this.generator = new FlashcardGenerator(this.app, this.plugin);
	}

	getViewType(): string {
		return FLASHCARD_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '闪卡背诵';
	}

	getIcon(): string {
		return 'cards';
	}

	async onOpen(): Promise<void> {
		await this.loadDecks();
		this.render();
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}

	/**
	 * 加载所有卡组
	 */
	private async loadDecks(): Promise<void> {
		try {
			this.decks = await this.storage.loadAllDecks();
			this.sortDecks();
		} catch (error) {
			console.error('加载卡组失败:', error);
			new Notice('加载卡组失败');
		}
	}

	/**
	 * 排序卡组
	 */
	private sortDecks(): void {
		if (this.sortMode === 'time') {
			this.decks.sort((a, b) => {
				const timeA = a.stats.lastStudyTime || a.createdAt;
				const timeB = b.stats.lastStudyTime || b.createdAt;
				return timeB - timeA;
			});
		} else {
			this.decks.sort((a, b) => a.stats.masteryRate - b.stats.masteryRate);
		}
	}

	/**
	 * 渲染界面
	 */
	private render(): void {
		const container = this.containerEl;
		container.empty();
		container.addClass('flashcard-deck-view');

		// 头部
		this.renderHeader(container);

		// 卡组列表
		this.renderDeckList(container);

		// 多选操作栏
		if (this.selectedDeckIds.size > 0) {
			this.renderMultiSelectActions(container);
		}
	}

	/**
	 * 渲染头部
	 */
	private renderHeader(container: HTMLElement): void {
		const header = container.createDiv({ cls: 'flashcard-header' });

		header.createEl('h2', { text: '闪卡背诵', cls: 'flashcard-title' });

		// 排序按钮
		const sortContainer = header.createDiv({ cls: 'flashcard-sort' });
		sortContainer.createSpan({ text: '排序：' });

		const timeBtn = sortContainer.createEl('button', {
			text: '时间',
			cls: this.sortMode === 'time' ? 'sort-btn active' : 'sort-btn'
		});
		timeBtn.addEventListener('click', () => {
			this.sortMode = 'time';
			this.sortDecks();
			this.render();
		});

		const masteryBtn = sortContainer.createEl('button', {
			text: '掌握率',
			cls: this.sortMode === 'mastery' ? 'sort-btn active' : 'sort-btn'
		});
		masteryBtn.addEventListener('click', () => {
			this.sortMode = 'mastery';
			this.sortDecks();
			this.render();
		});
	}

	/**
	 * 渲染卡组列表
	 */
	private renderDeckList(container: HTMLElement): void {
		const list = container.createDiv({ cls: 'flashcard-deck-list' });

		// 创建新卡组卡片（始终第一个）
		this.renderCreateNewDeckCard(list);

		// 渲染已有卡组
		this.decks.forEach(deck => {
			this.renderDeckCard(list, deck);
		});

		if (this.decks.length === 0) {
			list.createDiv({
				cls: 'empty-state',
				text: '暂无闪卡组，点击上方创建新卡组开始学习'
			});
		}
	}

	/**
	 * 渲染"创建新卡组"卡片
	 */
	private renderCreateNewDeckCard(container: HTMLElement): void {
		const card = container.createDiv({ cls: 'deck-card create-new' });

		const icon = card.createDiv({ cls: 'deck-icon' });
		icon.setText('➕');

		card.createEl('h3', { text: '创建新闪卡组' });
		card.createEl('p', { text: '从笔记生成学习卡片' });

		card.addEventListener('click', () => {
			this.showCreateDeckModal();
		});
	}

	/**
	 * 渲染卡组卡片
	 */
	private renderDeckCard(container: HTMLElement, deck: FlashcardDeck): void {
		const isSelected = this.selectedDeckIds.has(deck.id);
		const card = container.createDiv({
			cls: isSelected ? 'deck-card selected' : 'deck-card'
		});

		// 卡组名称
		const titleRow = card.createDiv({ cls: 'deck-title-row' });
		titleRow.createEl('h3', { text: deck.name });

		// 统计信息
		const statsRow = card.createDiv({ cls: 'deck-stats' });
		statsRow.createSpan({ text: `📚 ${deck.stats.total} 张卡片` });
		statsRow.createSpan({
			text: `🎯 掌握率：${(deck.stats.masteryRate * 100).toFixed(0)}%`
		});

		// 进度环形图（简化版：进度条）
		const progressBar = card.createDiv({ cls: 'deck-progress-bar' });
		const progressFill = progressBar.createDiv({ cls: 'deck-progress-fill' });
		progressFill.style.width = `${deck.stats.masteryRate * 100}%`;

		// 详细分布
		const distribution = card.createDiv({ cls: 'deck-distribution' });
		distribution.createSpan({ text: `⚪ 新：${deck.stats.new}` });
		distribution.createSpan({ text: `🟡 学习中：${deck.stats.learning}` });
		distribution.createSpan({ text: `🔵 复习：${deck.stats.review}` });
		distribution.createSpan({ text: `🟢 已掌握：${deck.stats.mastered}` });

		// 按钮区域
		const actions = card.createDiv({ cls: 'deck-actions' });

		const studyBtn = actions.createEl('button', {
			text: '开始学习',
			cls: 'deck-btn primary'
		});
		studyBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.startStudy(deck);
		});

		const selectBtn = actions.createEl('button', {
			text: isSelected ? '✓ 已选' : '☐ 选择',
			cls: 'deck-btn'
		});
		selectBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleDeckSelection(deck.id);
		});
	}

	/**
	 * 渲染多选操作栏
	 */
	private renderMultiSelectActions(container: HTMLElement): void {
		const actionsBar = container.createDiv({ cls: 'multi-select-actions' });

		actionsBar.createSpan({ text: `已选中 ${this.selectedDeckIds.size} 个卡组` });

		const mergeBtn = actionsBar.createEl('button', {
			text: '🔗 合并选中的卡组',
			cls: 'action-btn primary'
		});
		mergeBtn.addEventListener('click', () => {
			this.showMergeDecksModal();
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
	 * 显示创建卡组对话框
	 */
	private showCreateDeckModal(): void {
		new CreateDeckModal(this.app, async (deckName, sourceNote, cardCount) => {
			await this.createDeck(deckName, sourceNote, cardCount);
		}).open();
	}

	/**
	 * 创建卡组
	 */
	private async createDeck(
		deckName: string,
		sourceNote: string,
		cardCount: number
	): Promise<void> {
		try {
			this.isCancelled = false;

			// 创建进度卡片
			this.progressCard = new ProgressCard(this.containerEl, {
				title: '生成闪卡中',
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

			const options: FlashcardGenerationOptions = {
				deckName,
				sourceNote,
				count: cardCount
			};

			const { deck, cards } = await this.generator.generateFromNote(
				options,
				(percent, status) => {
					if (this.isCancelled) {
						throw new Error('User cancelled');
					}
					this.progressCard?.updateProgress(percent, status);
				}
			);

			// 显示确认界面
			this.progressCard?.destroy();
			this.progressCard = null;

			new ConfirmFlashcardsModal(
				this.app,
				cards,
				async (confirmedCards) => {
					if (confirmedCards.length > 0) {
						// 更新卡组统计
						deck.cardIds = confirmedCards.map(c => c.id);
						deck.stats.total = confirmedCards.length;
						deck.stats.new = confirmedCards.length;

						// 保存
						await this.storage.saveDeck(deck, confirmedCards);
						new Notice(`创建成功！共 ${confirmedCards.length} 张卡片`);

						// 刷新列表
						await this.loadDecks();
						this.render();
					}
				}
			).open();
		} catch (error) {
			this.progressCard?.destroy();
			this.progressCard = null;

			if (error.message !== 'User cancelled') {
				console.error('创建卡组失败:', error);
				new Notice(`创建失败: ${error.message}`);
			}
		}
	}

	/**
	 * 开始学习
	 */
	private async startStudy(deck: FlashcardDeck): Promise<void> {
		try {
			const cards = await this.storage.getCardsToStudy(
				deck.id,
				deck.settings.newCardsPerDay,
				deck.settings.reviewCardsPerDay
			);

			if (cards.length === 0) {
				new Notice('今天没有需要复习的卡片');
				return;
			}

			new Notice(`开始学习：${deck.name}（${cards.length} 张卡片）`);

			// TODO: 打开学习界面（下一步实现）
			// 目前先用简单提示
			new Notice('学习界面正在开发中...');
		} catch (error) {
			console.error('开始学习失败:', error);
			new Notice('开始学习失败');
		}
	}

	/**
	 * 显示合并卡组对话框
	 */
	private showMergeDecksModal(): void {
		if (this.selectedDeckIds.size < 2) {
			new Notice('请至少选择2个卡组进行合并');
			return;
		}

		const selectedDecks = this.decks.filter(d => this.selectedDeckIds.has(d.id));

		new MergeDecksModal(
			this.app,
			selectedDecks,
			async (newName) => {
				await this.mergeDecks(Array.from(this.selectedDeckIds), newName);
			}
		).open();
	}

	/**
	 * 合并卡组
	 */
	private async mergeDecks(deckIds: string[], newName: string): Promise<void> {
		try {
			await this.storage.mergeDecks(deckIds, newName);
			this.selectedDeckIds.clear();
			await this.loadDecks();
			this.render();
			new Notice('合并成功');
		} catch (error) {
			console.error('合并卡组失败:', error);
			new Notice(`合并失败: ${error.message}`);
		}
	}

	/**
	 * 刷新视图
	 */
	public async refresh(): Promise<void> {
		await this.loadDecks();
		this.render();
	}
}

/**
 * 创建卡组对话框
 */
class CreateDeckModal extends Modal {
	private onSubmit: (deckName: string, sourceNote: string, cardCount: number) => void;

	constructor(
		app: App,
		onSubmit: (deckName: string, sourceNote: string, cardCount: number) => void
	) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('create-deck-modal');

		contentEl.createEl('h2', { text: '创建新闪卡组' });

		// 卡组名称
		const nameGroup = contentEl.createDiv({ cls: 'setting-item' });
		nameGroup.createDiv({ text: '卡组名称', cls: 'setting-item-name' });
		const nameInput = nameGroup.createEl('input', {
			type: 'text',
			placeholder: '例如：驾考科目一'
		});
		nameInput.style.width = '100%';

		// 选择笔记
		const noteGroup = contentEl.createDiv({ cls: 'setting-item' });
		noteGroup.createDiv({ text: '来源笔记', cls: 'setting-item-name' });
		const noteInput = noteGroup.createEl('input', {
			type: 'text',
			placeholder: '输入笔记路径或点击选择'
		});
		noteInput.style.width = '100%';

		const currentFile = this.app.workspace.getActiveFile();
		if (currentFile) {
			noteInput.value = currentFile.path;
		}

		const selectBtn = noteGroup.createEl('button', { text: '选择笔记' });
		selectBtn.addEventListener('click', async () => {
			const file = await this.selectNoteFile();
			if (file) {
				noteInput.value = file.path;
			}
		});

		// 卡片数量
		const countGroup = contentEl.createDiv({ cls: 'setting-item' });
		countGroup.createDiv({ text: '卡片数量', cls: 'setting-item-name' });
		const countInput = countGroup.createEl('input', {
			type: 'number',
			value: '15'
		});
		countInput.min = '5';
		countInput.max = '30';
		countInput.style.width = '100%';

		// 按钮
		const buttonGroup = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonGroup.style.cssText = 'display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;';

		const cancelBtn = buttonGroup.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const confirmBtn = buttonGroup.createEl('button', { text: '开始生成', cls: 'mod-cta' });
		confirmBtn.addEventListener('click', () => {
			const deckName = nameInput.value.trim();
			const sourceNote = noteInput.value.trim();
			const cardCount = parseInt(countInput.value);

			if (!deckName) {
				new Notice('请输入卡组名称');
				return;
			}

			if (!sourceNote) {
				new Notice('请选择来源笔记');
				return;
			}

			if (cardCount < 5 || cardCount > 30) {
				new Notice('卡片数量应在5-30之间');
				return;
			}

			this.onSubmit(deckName, sourceNote, cardCount);
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async selectNoteFile(): Promise<TFile | null> {
		return new Promise((resolve) => {
			const allFiles = this.app.vault.getMarkdownFiles();
			const modal = new FilePickerModal(this.app, allFiles, (file) => resolve(file));
			modal.open();
		});
	}
}

/**
 * 文件选择器对话框
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

		contentEl.createEl('h3', { text: '选择笔记生成闪卡' });

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
 * 确认闪卡对话框
 */
class ConfirmFlashcardsModal extends Modal {
	private cards: Flashcard[];
	private onConfirm: (cards: Flashcard[]) => void;
	private selectedCards: Set<string>;

	constructor(
		app: App,
		cards: Flashcard[],
		onConfirm: (cards: Flashcard[]) => void
	) {
		super(app);
		this.cards = cards;
		this.onConfirm = onConfirm;
		this.selectedCards = new Set(cards.map(c => c.id));
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('confirm-flashcards-modal');
		this.modalEl.style.width = '80%';
		this.modalEl.style.maxWidth = '800px';

		contentEl.createEl('h2', { text: `确认生成的闪卡 (${this.cards.length}张)` });

		// 卡片列表
		const listContainer = contentEl.createDiv({ cls: 'flashcard-list' });
		listContainer.style.maxHeight = '500px';
		listContainer.style.overflowY = 'auto';

		this.cards.forEach((card, index) => {
			this.renderCardItem(listContainer, card, index);
		});

		// 按钮
		const buttonGroup = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonGroup.style.cssText = 'display: flex; gap: 10px; margin-top: 20px; justify-content: space-between;';

		const leftBtns = buttonGroup.createDiv();
		const selectAllBtn = leftBtns.createEl('button', { text: '全选' });
		selectAllBtn.addEventListener('click', () => {
			this.cards.forEach(c => this.selectedCards.add(c.id));
			this.onOpen();
		});

		const deselectAllBtn = leftBtns.createEl('button', { text: '全不选' });
		deselectAllBtn.addEventListener('click', () => {
			this.selectedCards.clear();
			this.onOpen();
		});

		const rightBtns = buttonGroup.createDiv();
		rightBtns.style.display = 'flex';
		rightBtns.style.gap = '10px';

		const cancelBtn = rightBtns.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const confirmBtn = rightBtns.createEl('button', {
			text: `保存 (${this.selectedCards.size}张)`,
			cls: 'mod-cta'
		});
		confirmBtn.addEventListener('click', () => {
			const selected = this.cards.filter(c => this.selectedCards.has(c.id));
			this.onConfirm(selected);
			this.close();
		});
	}

	private renderCardItem(container: HTMLElement, card: Flashcard, index: number): void {
		const item = container.createDiv({
			cls: this.selectedCards.has(card.id) ? 'flashcard-item selected' : 'flashcard-item'
		});

		// 复选框
		const checkbox = item.createEl('input', { type: 'checkbox' });
		checkbox.checked = this.selectedCards.has(card.id);
		checkbox.addEventListener('change', () => {
			if (checkbox.checked) {
				this.selectedCards.add(card.id);
			} else {
				this.selectedCards.delete(card.id);
			}
			this.onOpen();
		});

		const content = item.createDiv({ cls: 'flashcard-content' });

		// 问题
		const questionEl = content.createDiv({ cls: 'flashcard-question' });
		questionEl.createEl('strong', { text: `Q${index + 1}: ` });
		questionEl.appendText(card.question);

		// 答案
		const answerEl = content.createDiv({ cls: 'flashcard-answer' });
		answerEl.createEl('strong', { text: 'A: ' });
		answerEl.appendText(card.answer);

		// 来源
		if (card.sourceSection) {
			const sourceEl = content.createDiv({ cls: 'flashcard-source' });
			sourceEl.createEl('small', { text: `来源：${card.sourceSection}` });
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * 合并卡组对话框
 */
class MergeDecksModal extends Modal {
	private decks: FlashcardDeck[];
	private onConfirm: (newName: string) => void;

	constructor(
		app: App,
		decks: FlashcardDeck[],
		onConfirm: (newName: string) => void
	) {
		super(app);
		this.decks = decks;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('merge-decks-modal');

		contentEl.createEl('h2', { text: '合并闪卡组' });

		// 显示要合并的卡组
		const listDiv = contentEl.createDiv({ cls: 'merge-list' });
		listDiv.createEl('p', { text: '将要合并：' });
		const ul = listDiv.createEl('ul');
		this.decks.forEach(deck => {
			ul.createEl('li', {
				text: `${deck.name} (${deck.stats.total}张, ${(deck.stats.masteryRate * 100).toFixed(0)}%)`
			});
		});

		// 新卡组名称
		const nameGroup = contentEl.createDiv({ cls: 'setting-item' });
		nameGroup.createDiv({ text: '新卡组名称', cls: 'setting-item-name' });
		const nameInput = nameGroup.createEl('input', {
			type: 'text',
			placeholder: '输入合并后的卡组名称'
		});
		nameInput.style.width = '100%';
		nameInput.value = this.decks.map(d => d.name).join('+');

		// 统计预览
		const totalCards = this.decks.reduce((sum, d) => sum + d.stats.total, 0);
		const totalMastery = this.decks.reduce(
			(sum, d) => sum + d.stats.total * d.stats.masteryRate,
			0
		) / totalCards;

		const statsDiv = contentEl.createDiv({ cls: 'merge-stats' });
		statsDiv.createEl('p', { text: `合并后统计：` });
		statsDiv.createEl('p', { text: `📚 总卡片：${totalCards}张` });
		statsDiv.createEl('p', {
			text: `🎯 预计掌握率：${(totalMastery * 100).toFixed(1)}%`
		});

		contentEl.createEl('p', {
			text: '⚠️ 原卡组将被删除',
			cls: 'warning-text'
		});

		// 按钮
		const buttonGroup = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonGroup.style.cssText = 'display: flex; gap: 10px; margin-top: 20px; justify-content: flex-end;';

		const cancelBtn = buttonGroup.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const confirmBtn = buttonGroup.createEl('button', { text: '确认合并', cls: 'mod-cta' });
		confirmBtn.addEventListener('click', () => {
			const newName = nameInput.value.trim();
			if (!newName) {
				new Notice('请输入新卡组名称');
				return;
			}
			this.onConfirm(newName);
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Export Modal classes for use in CombineView
export { CreateDeckModal, ConfirmFlashcardsModal, MergeDecksModal };
