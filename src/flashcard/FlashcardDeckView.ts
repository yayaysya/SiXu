import { ItemView, WorkspaceLeaf, TFile, Notice, Modal, App, setIcon, MarkdownRenderer, Component } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { FlashcardDeck, Flashcard, FlashcardGenerationOptions } from './types';
import { TaskStatus } from '../types';
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
	private deckSelectionMode: boolean = false;
	private progressCard: ProgressCard | null = null;
	private isCancelled: boolean = false;
	private backgroundTaskId: string | null = null;
	private backgroundModeActive: boolean = false;

	// 根据字符串生成稳定的瓷贴颜色类
	private getTileColorClass(key: string): string {
		const palette = ['tile-blue', 'tile-green', 'tile-orange', 'tile-purple', 'tile-pink', 'tile-teal'];
		let hash = 0;
		for (let i = 0; i < key.length; i++) {
			hash = ((hash << 5) - hash) + key.charCodeAt(i);
			hash |= 0;
		}
		return palette[Math.abs(hash) % palette.length];
	}

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

		// 批量管理切换按钮（对齐 Quiz 列表交互）
		const manageBtn = header.createEl('button', {
			text: this.deckSelectionMode ? '退出管理' : '批量管理',
			cls: this.deckSelectionMode ? 'quiz-manage-btn active' : 'quiz-manage-btn'
		});
		manageBtn.addEventListener('click', () => this.toggleDeckSelectionMode());

		// 管理模式顶部工具条
		if (this.deckSelectionMode) {
			const bulkBar = header.createDiv({ cls: 'quiz-bulk-toolbar' });
			const validIds = new Set(this.decks.map(d => d.id));
			// 清洗无效选择
			for (const id of Array.from(this.selectedDeckIds)) {
				if (!validIds.has(id)) this.selectedDeckIds.delete(id);
			}
			bulkBar.createSpan({ cls: 'quiz-bulk-info', text: `已选择 ${this.selectedDeckIds.size} 个卡组` });

			const mergeBtn = bulkBar.createEl('button', { text: '合并所选', cls: 'deck-btn primary' });
			mergeBtn.addEventListener('click', () => this.handleBulkDeckMerge());

			const deleteBtn = bulkBar.createEl('button', { text: '删除所选', cls: 'deck-btn' });
			deleteBtn.disabled = this.selectedDeckIds.size === 0;
			deleteBtn.addEventListener('click', () => this.handleBulkDeckDelete());
		}
	}

	/**
	 * 渲染卡组列表
	 */
	private renderDeckList(container: HTMLElement): void {
		const list = container.createDiv({ cls: 'flashcard-deck-list' });

		// 创建新卡组卡片（始终第一个）——批量管理时隐藏，避免干扰
		if (!this.deckSelectionMode) {
			this.renderCreateNewDeckCard(list);
		}

		// 渲染已有卡组
		this.decks.forEach(deck => {
			// 在管理模式下，为每个卡片外包一层 row 容器以放置选择区
			if (this.deckSelectionMode) {
				const row = list.createDiv({ cls: 'quiz-card-row selection-mode' });
				const isSelected = this.selectedDeckIds.has(deck.id);
				const selectWrap = row.createDiv({ cls: 'quiz-card-select-area' });
				selectWrap.toggleClass('selected', isSelected);
				const checkbox = selectWrap.createEl('input', { type: 'checkbox', cls: 'quiz-card-checkbox' }) as HTMLInputElement;
				checkbox.checked = isSelected;
				checkbox.addEventListener('click', (e: MouseEvent) => e.stopPropagation());
				checkbox.addEventListener('change', (e: Event) => {
					const target = e.target as HTMLInputElement;
					this.setDeckSelected(deck.id, target.checked);
					this.render();
				});
				selectWrap.addEventListener('click', (e: MouseEvent) => {
					e.preventDefault();
					if (e.target instanceof HTMLInputElement) return;
					checkbox.checked = !checkbox.checked;
					this.setDeckSelected(deck.id, checkbox.checked);
					this.render();
				});

				// 在 row 内渲染卡片
				this.renderDeckCard(row, deck);
			} else {
				this.renderDeckCard(list, deck);
			}
		});
	}

	/**
	 * 渲染"创建新卡组"卡片
	 */
private renderCreateNewDeckCard(container: HTMLElement): void {
		// 扁平“创建新卡组”卡片（虚线边框 + 加号）
		const card = container.createDiv({ cls: 'deck-card create-new' });
		const icon = card.createDiv({ cls: 'create-plus-circle' });
		setIcon(icon, 'plus');
		card.createEl('h3', { text: '创建新闪卡组' });
		card.createEl('p', { text: '从笔记生成学习卡片' });
		card.addEventListener('click', () => this.showCreateDeckModal());
}

	/**
	 * 渲染卡组卡片
	 */
	private renderDeckCard(container: HTMLElement, deck: FlashcardDeck): void {
		const isSelected = this.selectedDeckIds.has(deck.id);
		const card = container.createDiv({ cls: (isSelected ? 'deck-card selected ' : 'deck-card ') + 'folder-card' });

		// 扁平瓷贴风格：仅保留主体 overlay，并应用色板类
		const overlay = card.createDiv({ cls: `folder-overlay ${this.getTileColorClass(deck.id || deck.name)}` });


		// 主体内容与底部信息（包含标题与副标题）
		const body = overlay.createDiv({ cls: 'folder-body' });
		const header = body.createDiv({ cls: 'folder-header' });
		header.createDiv({ cls: 'folder-title', text: deck.name });
		// 顶部显示中文日期
		const time = deck.stats.lastStudyTime || deck.createdAt;
		const dt = new Date(time);
		const y = dt.getFullYear();
		const m = String(dt.getMonth() + 1).padStart(2, '0');
		const d = String(dt.getDate()).padStart(2, '0');
		header.createDiv({ cls: 'folder-date-ch', text: `${y}年${m}月${d}日` });

		const footer = body.createDiv({ cls: 'folder-footer' });
		// 左侧显示掌握率（大号百分比 + 小号“掌握率”）
		const masteryDiv = footer.createDiv({ cls: 'folder-mastery' });
		const percent = Math.round(deck.stats.masteryRate * 100);
		masteryDiv.createSpan({ cls: 'value', text: `${percent}%` });
		masteryDiv.createSpan({ cls: 'label', text: '掌握率' });
		// 右侧显示卡片数量
		footer.createDiv({ cls: 'folder-count', text: `${deck.stats.total} 张` });

		// 操作（弱化处理，仍保留功能）
		const actions = overlay.createDiv({ cls: 'folder-actions' });
		const studyBtn = actions.createEl('button', { text: '学习', cls: 'deck-btn primary' });
		studyBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.startStudy(deck);
		});

		// 在批量管理模式下隐藏单独“选择”按钮，统一使用左侧复选框
		if (!this.deckSelectionMode) {
			const selectBtn = actions.createEl('button', { text: isSelected ? '✓ 已选' : '选择', cls: 'deck-btn' });
			selectBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleDeckSelection(deck.id);
			});
		}
	}

	/**
	 * 渲染多选操作栏
	 */
/* 底部多选栏已弃用，改为顶部批量管理工具条 */

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

	// 进入/退出批量管理模式
	private toggleDeckSelectionMode(): void {
		this.deckSelectionMode = !this.deckSelectionMode;
		if (!this.deckSelectionMode) {
			this.selectedDeckIds.clear();
		}
		this.render();
	}

	private exitDeckSelectionMode(): void {
		this.deckSelectionMode = false;
		this.selectedDeckIds.clear();
		this.render();
	}

	private setDeckSelected(deckId: string, selected: boolean): void {
		if (selected) this.selectedDeckIds.add(deckId);
		else this.selectedDeckIds.delete(deckId);
	}

	private async handleBulkDeckMerge(): Promise<void> {
		if (this.selectedDeckIds.size < 2) {
			new Notice('请至少选择2个卡组进行合并');
			return;
		}
		await this.showMergeDecksModal();
		// 合并完成后 showMergeDecksModal 内部会调用 mergeDecks → 清空并刷新
	}

	private async handleBulkDeckDelete(): Promise<void> {
		if (this.selectedDeckIds.size === 0) {
			new Notice('请先选择要删除的卡组');
			return;
		}
		const count = this.selectedDeckIds.size;
		new ConfirmExitModal(
			this.app,
			`确定删除选中的 ${count} 个卡组吗？此操作不可恢复（含数据文件）`,
			'取消',
			'删除',
			async () => {
				const failed: string[] = [];
				for (const id of Array.from(this.selectedDeckIds)) {
					try {
						await this.storage.deleteDeck(id);
					} catch (e) {
						console.error('删除卡组失败:', id, e);
						failed.push(id);
					}
				}

				if (failed.length === 0) {
					new Notice(`已删除 ${count} 个卡组`);
					this.exitDeckSelectionMode();
					await this.loadDecks();
					this.render();
				} else {
					new Notice(`部分删除失败：${failed.length}/${count}，请查看控制台详情`);
					this.deckSelectionMode = true;
					this.selectedDeckIds = new Set(failed);
					await this.loadDecks();
					this.render();
				}
			}
		).open();
	}

	/**
	 * 显示创建卡组对话框
	 */
	private showCreateDeckModal(): void {
		new CreateDeckModal(this.app, this.plugin, async (deckName, sourceNote, cardCount) => {
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
			this.backgroundModeActive = false;
			this.backgroundTaskId = null;

			// 创建进度卡片
			this.progressCard = new ProgressCard(this.containerEl, {
				title: '生成闪卡中',
				onCancel: () => {
					this.isCancelled = true;
					this.progressCard?.destroy();
					this.progressCard = null;
					if (this.backgroundModeActive && this.backgroundTaskId) {
						const taskId = this.backgroundTaskId;
						this.plugin.statusBarManager?.hideTask(taskId);
					}
					this.backgroundModeActive = false;
					this.backgroundTaskId = null;
					new Notice('已取消生成');
				},
				onBackground: () => {
					this.progressCard?.hide();
					this.backgroundModeActive = true;
					this.backgroundTaskId = `flashcard-bg-${Date.now()}`;
					const taskId = this.backgroundTaskId;
					this.plugin.statusBarManager?.showTaskStatus(taskId, TaskStatus.GENERATING, 0, '闪卡生成中...');
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
					if (this.backgroundModeActive && this.backgroundTaskId) {
						const message = status || '闪卡生成中...';
						const taskId = this.backgroundTaskId;
						const taskStatus = percent >= 100 ? TaskStatus.COMPLETED : TaskStatus.GENERATING;
						this.plugin.statusBarManager?.showTaskStatus(taskId, taskStatus, percent, message);
					}
				}
			);

			// 显示确认界面
			this.progressCard?.destroy();
			this.progressCard = null;
			if (this.backgroundModeActive && this.backgroundTaskId) {
				const taskId = this.backgroundTaskId;
				this.plugin.statusBarManager?.showTaskStatus(taskId, TaskStatus.COMPLETED, 100, '闪卡生成完成');
				window.setTimeout(() => {
					this.plugin.statusBarManager?.hideTask(taskId);
				}, 3000);
			}

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

			if (this.backgroundModeActive && this.backgroundTaskId) {
				const taskId = this.backgroundTaskId;
				this.plugin.statusBarManager?.showTaskStatus(taskId, TaskStatus.FAILED, 100, '闪卡生成失败');
				window.setTimeout(() => {
					this.plugin.statusBarManager?.hideTask(taskId);
				}, 4000);
			}

			if (error.message !== 'User cancelled') {
				console.error('创建卡组失败:', error);
				new Notice(`创建失败: ${error.message}`);
			}
		} finally {
			this.backgroundModeActive = false;
			this.backgroundTaskId = null;
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
    private plugin: NotebookLLMPlugin;

    constructor(
        app: App,
        plugin: NotebookLLMPlugin,
        onSubmit: (deckName: string, sourceNote: string, cardCount: number) => void
    ) {
        super(app);
        this.plugin = plugin;
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

		// 名称自动生成与用户编辑状态
		let lastAutoName: string | null = null;
		let nameManuallyEdited = false;

		const simplifyDeckName = (raw: string): string => {
			const base = (raw || '').toString();
			let cleaned = base
				.replace(/[\[\]{}（）()<>【】]/g, ' ') // 去掉括号符号
				.replace(/[\t\r\n]+/g, ' ') // 换行制表
				.replace(/[\|·•—–\-_/\\]+/g, ' ') // 分隔符归一
				.replace(/\s+/g, ' ') // 空白压缩
				.trim();
			if (!cleaned) return '新建卡组';
			const limit = 20; // 最长展示长度
			if (cleaned.length > limit) {
				cleaned = cleaned.slice(0, limit - 1) + '…';
			}
			return cleaned;
		};

		// 监听名称输入，识别用户是否手动编辑
		nameInput.addEventListener('input', () => {
			const val = nameInput.value;
			nameManuallyEdited = !!val.trim() && val !== lastAutoName;
		});

		// 选择笔记
		const noteGroup = contentEl.createDiv({ cls: 'setting-item' });
		noteGroup.createDiv({ text: '来源笔记', cls: 'setting-item-name' });
		const noteInput = noteGroup.createEl('input', {
			type: 'text',
			placeholder: '输入笔记路径或点击选择'
		});
		noteInput.style.width = '100%';

		let initialPath: string | null = null;
		const currentFile = this.app.workspace.getActiveFile();
		if (currentFile) {
			noteInput.value = currentFile.path;
			// 默认名称：基于当前笔记名的简化
			lastAutoName = simplifyDeckName(currentFile.basename);
			nameInput.value = lastAutoName; // 默认名称填入简化后的笔记名
			initialPath = currentFile.path;
		} else {
			// 无当前笔记时提供通用默认名
			lastAutoName = '新建卡组';
			nameInput.value = lastAutoName;
		}

		const selectBtn = noteGroup.createEl('button', { text: '选择笔记' });
		selectBtn.addEventListener('click', async () => {
			const file = await this.selectNoteFile();
			if (file) {
				noteInput.value = file.path;
				// 若用户未手动编辑或当前名称仍为上一次自动值，则根据新笔记名生成默认
				const autoName = simplifyDeckName(file.basename);
				if (!nameManuallyEdited || nameInput.value === (lastAutoName || '')) {
					nameInput.value = autoName;
					lastAutoName = autoName;
				}
				// 立即根据选择的笔记推荐卡片数量
				void suggestCountFromPath(file.path);
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

			// 基于文本字符数自动推荐卡片数量（范围5-30）
			const estimateRecommendedCount = (content: string): number => {
				const cleaned = content
					.replace(/```[\s\S]*?```/g, '') // 代码块
					.replace(/`[^`]*`/g, '') // 行内代码
					.replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 图片
					.replace(/\[[^\]]*\]\([^)]*\)/g, '') // 链接
					.replace(/[#>*_\-]/g, ' ') // 简化标记
					.replace(/\s+/g, ' ')
					.trim();
				const len = cleaned.length;
				let rec = Math.round(len / 200); // 约每200字符1张
				if (!rec || rec < 5) rec = 5;
				if (rec > 30) rec = 30;
				return rec;
			};

		const suggestCountFromPath = async (path: string) => {
			const f = this.app.vault.getAbstractFileByPath(path);
			if (f instanceof TFile) {
				try {
					const txt = await this.app.vault.read(f);
					countInput.value = String(estimateRecommendedCount(txt));
				} catch {}
			}
		};

		// 当来源笔记变更时：自动推荐数量，并在未手动编辑名称时自动更新默认名称
		noteInput.addEventListener('change', () => {
			const p = noteInput.value.trim();
			if (p) void suggestCountFromPath(p);
			const f = this.app.vault.getAbstractFileByPath(p);
			if (f instanceof TFile) {
				const autoName = simplifyDeckName(f.basename);
				if (!nameManuallyEdited || nameInput.value === (lastAutoName || '')) {
					nameInput.value = autoName;
					lastAutoName = autoName;
				}
			}
		});
		noteInput.addEventListener('blur', () => {
			const p = noteInput.value.trim();
			if (p) void suggestCountFromPath(p);
			const f = this.app.vault.getAbstractFileByPath(p);
			if (f instanceof TFile) {
				const autoName = simplifyDeckName(f.basename);
				if (!nameManuallyEdited || nameInput.value === (lastAutoName || '')) {
					nameInput.value = autoName;
					lastAutoName = autoName;
				}
			}
		});

		// 打开时如有默认笔记则自动推荐
		if (initialPath) {
			void suggestCountFromPath(initialPath);
		}

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
            const norm = (s: string) => (s || '').replace(/^\/+|\/+$/g, '');
            const inDir = (p: string, dir: string) => {
                if (!dir) return false;
                const nd = norm(dir);
                if (!nd) return false;
                return p === nd || p.startsWith(nd + '/');
            };

            const quizDir = norm(this.plugin.settings.quizDir || 'quiz');
            const resultDir = norm(this.plugin.settings.resultDir || 'quiz/results');
            const flashDir = norm(this.plugin.settings.flashcard?.deckDir || 'flashcards');
            const debugDir = 'sixu_debugger';

            const allFiles = this.app.vault.getMarkdownFiles().filter(f => {
                const p = f.path.replace(/^\/+/, '');
                const lp = p.toLowerCase();
                if (lp.endsWith('.excalidraw.md')) return false; // 过滤 Excalidraw 笔记
                if (inDir(p, quizDir)) return false;
                if (inDir(p, resultDir)) return false;
                if (inDir(p, flashDir)) return false;
                if (inDir(p, debugDir)) return false;
                return true;
            });

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
			this.listContainer.createDiv({ text: '未找到匹配的笔记', cls: 'nb-empty-state' });
			return;
		}

		// 按最近修改时间倒序
		filtered.sort((a, b) => b.stat.mtime - a.stat.mtime);

			filtered.slice(0, 200).forEach(file => {
				const item = this.listContainer.createDiv({ cls: 'file-list-item' });
				item.createDiv({ cls: 'file-name', text: file.basename });
				// 仅展示文件名，不展示路径
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
	private markdownComponents: Component[] = [];

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
		this.cleanupMarkdownComponents();
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

		// 拦截右上角关闭（X）与 Esc 关闭，弹出确认
		this.interceptCloseWithConfirm();

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

	// 拦截 Modal 的关闭操作，确认后才真正关闭
	private interceptCloseWithConfirm(): void {
		const closeBtn = this.modalEl.querySelector('.modal-close-button');
		if (closeBtn) {
			closeBtn.addEventListener('click', (e: Event) => {
				(e as any).stopImmediatePropagation?.();
				e.stopPropagation();
				e.preventDefault();
				new ConfirmExitModal(this.app, '放弃保存这些闪卡吗？', '取消', '确认放弃', () => {
					this.close();
				}).open();
			}, { capture: true });
		}

		const onKeydown = (ev: KeyboardEvent) => {
			if (ev.key === 'Escape') {
				ev.preventDefault();
				ev.stopPropagation();
				new ConfirmExitModal(this.app, '放弃保存这些闪卡吗？', '取消', '确认放弃', () => {
					window.removeEventListener('keydown', onKeydown, true);
					this.close();
				}).open();
			}
		};
		// 捕获阶段优先处理 Esc
		window.addEventListener('keydown', onKeydown, true);
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

		// 编辑按钮（紧挨复选框）
		const editBtn = item.createEl('button', { text: '编辑', cls: 'flashcard-edit-btn' });
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			new EditFlashcardModal(this.app, card.question, card.answer, (newQ, newA) => {
				card.question = newQ;
				card.answer = newA;
				this.onOpen();
			}).open();
		});

		const content = item.createDiv({ cls: 'flashcard-content' });

		// 问题
		const questionEl = content.createDiv({ cls: 'flashcard-question' });
		questionEl.createEl('strong', { text: `Q${index + 1}:` });
		const questionBody = questionEl.createDiv({ cls: 'flashcard-md markdown-rendered' });
		const questionComponent = new Component();
		this.markdownComponents.push(questionComponent);
		MarkdownRenderer.renderMarkdown(card.question || '', questionBody, card.sourceNote || '', questionComponent);

		// 答案
		const answerEl = content.createDiv({ cls: 'flashcard-answer' });
		answerEl.createEl('strong', { text: 'A:' });
		const answerBody = answerEl.createDiv({ cls: 'flashcard-md markdown-rendered' });
		const answerComponent = new Component();
		this.markdownComponents.push(answerComponent);
		MarkdownRenderer.renderMarkdown(card.answer || '', answerBody, card.sourceNote || '', answerComponent);

		// 来源
		if (card.sourceSection) {
			const sourceEl = content.createDiv({ cls: 'flashcard-source' });
			sourceEl.createEl('small', { text: `来源：${card.sourceSection}` });
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.cleanupMarkdownComponents();
	}

	private cleanupMarkdownComponents(): void {
		this.markdownComponents.forEach(component => component.unload());
		this.markdownComponents = [];
	}
}

/** 简单确认弹框（用于确认关闭/放弃） */
class ConfirmExitModal extends Modal {
	private message: string;
	private cancelText: string;
	private okText: string;
	private onOk: () => void;

	constructor(app: App, message: string, cancelText: string, okText: string, onOk: () => void) {
		super(app);
		this.message = message;
		this.cancelText = cancelText;
		this.okText = okText;
		this.onOk = onOk;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('side-modal-card');
		// 标题
		contentEl.createEl('h3', { text: '确认操作' });
		// 信息
		const msg = contentEl.createDiv({ cls: 'side-modal-message' });
		msg.setText(this.message);
		// 按钮
		const actions = contentEl.createDiv({ cls: 'side-modal-actions' });
		const cancelBtn = actions.createEl('button', { text: this.cancelText });
		const okBtn = actions.createEl('button', { text: this.okText, cls: 'mod-cta' });
		cancelBtn.addEventListener('click', () => this.close());
		okBtn.addEventListener('click', () => { this.onOk(); this.close(); });
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * 编辑单张闪卡内容（Q/A）
 */
class EditFlashcardModal extends Modal {
	private initQ: string;
	private initA: string;
	private onSubmit: (question: string, answer: string) => void;

	constructor(app: App, question: string, answer: string, onSubmit: (question: string, answer: string) => void) {
		super(app);
		this.initQ = question;
		this.initA = answer;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.modalEl.addClass('edit-flashcard-modal');
		this.modalEl.style.maxWidth = '720px';

		contentEl.createEl('h3', { text: '编辑闪卡' });

		// 问题
		const qGroup = contentEl.createDiv({ cls: 'setting-item' });
		qGroup.createDiv({ text: '问题 (Q)', cls: 'setting-item-name' });
		const qInput = qGroup.createEl('textarea');
		qInput.value = this.initQ;
		qInput.rows = 3; // 降低高度
		qInput.style.width = '100%';

		// 答案
		const aGroup = contentEl.createDiv({ cls: 'setting-item' });
		aGroup.createDiv({ text: '答案 (A)', cls: 'setting-item-name' });
		const aInput = aGroup.createEl('textarea');
		aInput.value = this.initA;
		aInput.rows = 4; // 降低高度
		aInput.style.width = '100%';

		// 按钮
		const btns = contentEl.createDiv({ cls: 'modal-button-container' });
		const cancelBtn = btns.createEl('button', { text: '取消' });
		const okBtn = btns.createEl('button', { text: '确认', cls: 'mod-cta' });

		cancelBtn.addEventListener('click', () => this.close());
		okBtn.addEventListener('click', () => {
			const newQ = qInput.value.trim();
			const newA = aInput.value.trim();
			this.onSubmit(newQ, newA);
			this.close();
		});
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
