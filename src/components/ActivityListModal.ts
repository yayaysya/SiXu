import { App, Modal } from 'obsidian';
import { StatisticsManager } from '../utils/statistics';
import { Activity, getActivityTypeLabel, getActivityTypeIcon } from '../types/activity';

/**
 * 活动列表模态框
 * 展示完整的活动历史记录
 */
export class ActivityListModal extends Modal {
	private statisticsManager: StatisticsManager;

	constructor(app: App, statisticsManager: StatisticsManager) {
		super(app);
		this.statisticsManager = statisticsManager;
	}

	async onOpen(): Promise<void> {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		contentEl.addClass('activity-list-modal');

		// 使用 Modal 标准 API 设置标题，避免重复创建
		titleEl.setText('全部活动');

		// 活动列表容器
		const listContainer = contentEl.createDiv({ cls: 'activity-list-container' });

		try {
			// 获取所有活动（最多100条）
			const activities = await this.statisticsManager.getRecentActivities(100);

			if (activities.length === 0) {
				listContainer.createDiv({
					cls: 'empty-state',
					text: '暂无活动记录'
				});
				return;
			}

			// 按日期分组
			const groupedActivities = this.groupActivitiesByDate(activities);

			// 渲染分组
			for (const [date, items] of Object.entries(groupedActivities)) {
				const group = listContainer.createDiv({ cls: 'activity-group' });

				// 日期标题
				group.createEl('h3', { text: date, cls: 'activity-date-header' });

				// 活动列表
				const itemsList = group.createDiv({ cls: 'activity-items' });
				items.forEach(activity => {
					this.renderActivityItem(itemsList, activity);
				});
			}

		} catch (error) {
			console.error('加载活动列表失败:', error);
			listContainer.createDiv({
				cls: 'error-state',
				text: '加载活动失败，请重试'
			});
		}
	}

	/**
	 * 按日期分组活动
	 */
	private groupActivitiesByDate(activities: Activity[]): Record<string, Activity[]> {
		const groups: Record<string, Activity[]> = {};

		activities.forEach(activity => {
			const date = this.formatDate(activity.time);
			if (!groups[date]) {
				groups[date] = [];
			}
			groups[date].push(activity);
		});

		return groups;
	}

	/**
	 * 格式化日期
	 */
	private formatDate(date: Date | number): string {
		const dateObj = date instanceof Date ? date : new Date(date);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		// 判断是否是今天
		if (this.isSameDay(dateObj, today)) {
			return '今天';
		}

		// 判断是否是昨天
		if (this.isSameDay(dateObj, yesterday)) {
			return '昨天';
		}

		// 其他日期
		const year = dateObj.getFullYear();
		const month = String(dateObj.getMonth() + 1).padStart(2, '0');
		const day = String(dateObj.getDate()).padStart(2, '0');

		// 如果是今年，不显示年份
		if (year === today.getFullYear()) {
			return `${month}月${day}日`;
		}

		return `${year}年${month}月${day}日`;
	}

	/**
	 * 判断是否是同一天
	 */
	private isSameDay(date1: Date, date2: Date): boolean {
		return date1.getFullYear() === date2.getFullYear() &&
			date1.getMonth() === date2.getMonth() &&
			date1.getDate() === date2.getDate();
	}

	/**
	 * 渲染单个活动项
	 */
	private renderActivityItem(container: HTMLElement, activity: Activity): void {
		const item = container.createDiv({ cls: 'activity-item' });

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
		time.setText(this.formatTime(activity.time));

		// 如果有关联文件，添加点击事件
		if (activity.fileLink) {
			item.addClass('clickable');
			item.addEventListener('click', async () => {
				const file = this.app.vault.getAbstractFileByPath(activity.fileLink!);
				if (file) {
					await this.app.workspace.getLeaf().openFile(file as any);
					this.close();
				}
			});
		}
	}

	/**
	 * 格式化时间
	 */
	private formatTime(date: Date | number): string {
		const dateObj = date instanceof Date ? date : new Date(date);
		const hours = String(dateObj.getHours()).padStart(2, '0');
		const minutes = String(dateObj.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
