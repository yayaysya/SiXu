import { App, TFile } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { Activity, ActivityType, CalendarData, CalendarDataPoint } from '../types/activity';

/**
 * Quiz统计数据
 */
export interface QuizStatistics {
	/** 总Quiz数量 */
	total: number;
	/** 已完成数量 */
	completed: number;
	/** 平均分数（百分比） */
	avgScore: number;
}

/**
 * 统计数据管理器
 * 负责计算主页显示的各种统计数据
 */
export class StatisticsManager {
	private app: App;
	private plugin: NotebookLLMPlugin;
	private cache: Map<string, { data: any; timestamp: number }> = new Map();
	private readonly CACHE_DURATION = 60000; // 缓存1分钟

	constructor(app: App, plugin: NotebookLLMPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 获取已合并笔记的数量
	 */
	async getCombinedNotesCount(): Promise<number> {
		const cacheKey = 'combined-notes-count';
		const cached = this.getFromCache(cacheKey);
		if (cached !== null) return cached;

		// 组合笔记目录固定为"组合笔记"
		const combineDir = '组合笔记';
		const files = this.app.vault.getFiles();

		// 统计在组合笔记目录中的文件
		const count = files.filter(file =>
			file.path.startsWith(combineDir + '/') && file.extension === 'md'
		).length;

		this.setCache(cacheKey, count);
		return count;
	}

	/**
	 * 获取Quiz统计数据
	 */
	async getQuizStatistics(): Promise<QuizStatistics> {
		const cacheKey = 'quiz-statistics';
		const cached = this.getFromCache(cacheKey);
		if (cached !== null) return cached;

		const quizDir = this.plugin.settings.quizDir || 'quiz';
		const files = this.app.vault.getFiles();

		// 获取所有Quiz文件
		const quizFiles = files.filter(file =>
			file.path.startsWith(quizDir + '/') &&
			file.extension === 'md' &&
			!file.basename.includes('结果')
		);

		let completedCount = 0;
		let totalScore = 0;
		let scoreCount = 0;

		// 统计每个Quiz的完成情况
		for (const file of quizFiles) {
			const metadata = this.app.metadataCache.getFileCache(file);
			const frontmatter = metadata?.frontmatter;

			if (frontmatter && frontmatter.quiz_results) {
				const results = Array.isArray(frontmatter.quiz_results)
					? frontmatter.quiz_results
					: [];

				if (results.length > 0) {
					completedCount++;

					// 尝试获取最近一次的分数
					// 这里简化处理，实际可能需要读取结果文件
				}
			}
		}

		const stats: QuizStatistics = {
			total: quizFiles.length,
			completed: completedCount,
			avgScore: scoreCount > 0 ? totalScore / scoreCount : 0
		};

		this.setCache(cacheKey, stats);
		return stats;
	}

	/**
	 * 获取最近的活动列表
	 */
	async getRecentActivities(limit: number = 10): Promise<Activity[]> {
		const cacheKey = `recent-activities-${limit}`;
		const cached = this.getFromCache(cacheKey);
		if (cached !== null) return cached;

		const activities: Activity[] = [];

		// 获取所有相关文件
		const files = this.app.vault.getFiles();
		const combineDir = '组合笔记';
		const quizDir = this.plugin.settings.quizDir || 'quiz';

		// 收集活动
		for (const file of files) {
			// 组合笔记
			if (file.path.startsWith(combineDir + '/') && file.extension === 'md') {
				activities.push({
					type: 'combine-created',
					title: file.basename,
					time: new Date(file.stat.ctime),
					fileLink: file.path
				});
			}
			// Quiz文件
			else if (file.path.startsWith(quizDir + '/') && file.extension === 'md') {
				if (file.basename.includes('结果')) {
					// Quiz结果文件
					const metadata = this.app.metadataCache.getFileCache(file);
					const score = metadata?.frontmatter?.score;
					const maxScore = metadata?.frontmatter?.max_score;

					activities.push({
						type: 'quiz-completed',
						title: file.basename.replace(/_结果_.*/, ''),
						time: new Date(file.stat.ctime),
						score: score && maxScore ? (score / maxScore) * 100 : undefined,
						fileLink: file.path
					});
				} else {
					// Quiz试题文件
					activities.push({
						type: 'quiz-generated',
						title: file.basename,
						time: new Date(file.stat.ctime),
						fileLink: file.path
					});
				}
			}
		}

		// 按时间倒序排序
		activities.sort((a, b) => b.time.getTime() - a.time.getTime());

		// 限制数量
		const result = activities.slice(0, limit);

		this.setCache(cacheKey, result);
		return result;
	}

	/**
	 * 生成日历热力图数据
	 */
	async getCalendarHeatmap(days: number = 90): Promise<CalendarData> {
		const cacheKey = `calendar-heatmap-${days}`;
		const cached = this.getFromCache(cacheKey);
		if (cached !== null) return cached;

		const dataPoints: CalendarDataPoint[] = [];
		const activityMap = new Map<string, Activity[]>();

		// 获取所有活动
		const activities = await this.getRecentActivities(1000);

		// 按日期分组
		for (const activity of activities) {
			const dateKey = this.getDateKey(activity.time);
			if (!activityMap.has(dateKey)) {
				activityMap.set(dateKey, []);
			}
			activityMap.get(dateKey)!.push(activity);
		}

		// 生成最近N天的数据点
		const today = new Date();
		let maxCount = 0;

		for (let i = days - 1; i >= 0; i--) {
			const date = new Date(today);
			date.setDate(date.getDate() - i);
			const dateKey = this.getDateKey(date);

			const dayActivities = activityMap.get(dateKey) || [];
			const count = dayActivities.length;

			if (count > maxCount) {
				maxCount = count;
			}

			dataPoints.push({
				date,
				count,
				activities: dayActivities
			});
		}

		const result: CalendarData = {
			dataPoints,
			maxCount
		};

		this.setCache(cacheKey, result);
		return result;
	}

	/**
	 * 获取日期的字符串键（用于分组）
	 */
	private getDateKey(date: Date): string {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	/**
	 * 从缓存获取数据
	 */
	private getFromCache(key: string): any | null {
		const cached = this.cache.get(key);
		if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
			return cached.data;
		}
		return null;
	}

	/**
	 * 设置缓存
	 */
	private setCache(key: string, data: any): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now()
		});
	}

	/**
	 * 清除所有缓存
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * 清除特定缓存
	 */
	clearCacheByKey(key: string): void {
		this.cache.delete(key);
	}
}
