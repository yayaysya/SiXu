import { App, TFile } from 'obsidian';
import NotebookLLMPlugin from '../main';
import { Activity, ActivityType, CalendarData, CalendarDataPoint } from '../types/activity';
import { FlashcardStorage } from '../flashcard/FlashcardStorage';

export interface FlashcardAggregate {
    totalDecks: number;
    totalCards: number;
    masteredCards: number;
    masteryRate: number; // 0-1
    totalStudySeconds: number;
}

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
	 * 判断是否为“组合笔记”文件
	 * 规则：
	 * 1) frontmatter 中包含 source_files 且为非空数组（首选）
	 * 2) 或者文件名匹配 组合笔记_YYYY-MM-DD(_N) 模式（兜底）
	 */
	private isCombinedNote(file: TFile): boolean {
		if (file.extension !== 'md') return false;
		const metadata = this.app.metadataCache.getFileCache(file);
		const fm: any = metadata?.frontmatter;
		const hasSourceFiles = Array.isArray(fm?.source_files) && fm.source_files.length > 0;
		if (hasSourceFiles) return true;
		const namePattern = /^组合笔记_\d{4}-\d{2}-\d{2}(?:_\d+)?$/;
		return namePattern.test(file.basename);
	}

    /**
     * 汇总闪卡聚合数据（跨卡组）
     */
    async getFlashcardAggregate(): Promise<FlashcardAggregate> {
        const cacheKey = 'flashcard-aggregate';
        const cached = this.getFromCache(cacheKey);
        if (cached !== null) return cached as FlashcardAggregate;

        const deckDir = this.plugin.settings.flashcard?.deckDir || 'flashcards';
        const storage = new FlashcardStorage(this.app, deckDir);
        const decks = await storage.loadAllDecks();

        let totalCards = 0;
        let masteredCards = 0;
        let reviewPlusMastered = 0;
        let totalStudySeconds = 0;

        for (const d of decks) {
            totalCards += d.stats.total;
            masteredCards += d.stats.mastered;
            reviewPlusMastered += d.stats.review + d.stats.mastered;
            totalStudySeconds += d.stats.totalStudyTime || 0;
        }

        const masteryRate = totalCards > 0 ? reviewPlusMastered / totalCards : 0;

        const agg: FlashcardAggregate = {
            totalDecks: decks.length,
            totalCards,
            masteredCards,
            masteryRate,
            totalStudySeconds
        };

        this.setCache(cacheKey, agg);
        return agg;
    }

    /**
     * 获取已合并笔记的数量（跨目录识别）
     */
    async getCombinedNotesCount(): Promise<number> {
		const cacheKey = 'combined-notes-count';
		const cached = this.getFromCache(cacheKey);
		if (cached !== null) return cached;

		const files = this.app.vault.getFiles();
		const count = files.filter(file => this.isCombinedNote(file)).length;

		this.setCache(cacheKey, count);
		return count;
	}

    /**
     * 获取Quiz统计数据
     */
    async getQuizStatistics(): Promise<QuizStatistics> {
        const cacheKey = 'quiz-statistics';
        const cached = this.getFromCache(cacheKey);
        if (cached !== null) return cached as QuizStatistics;

        const quizDir = this.plugin.settings.quizDir || 'quiz';
        const resultDir = this.plugin.settings.resultDir || 'quiz/results';
        const files = this.app.vault.getFiles();

        // 题目文件总数
        const quizFiles = files.filter(file =>
            file.path.startsWith(quizDir + '/') &&
            file.extension === 'md' &&
            !file.basename.includes('结果')
        );

        // 结果文件统计（用于正确率）
        const resultFiles = files.filter(file =>
            file.path.startsWith(resultDir + '/') &&
            file.extension === 'md'
        );

        let completedCount = 0;
        let totalScore = 0;
        let scoreCount = 0;

        for (const rf of resultFiles) {
            const metadata = this.app.metadataCache.getFileCache(rf);
            const fm: any = metadata?.frontmatter || {};
            const score = Number(fm?.score);
            const maxScore = Number(fm?.max_score);
            if (!isNaN(score) && !isNaN(maxScore) && maxScore > 0) {
                completedCount++;
                totalScore += (score / maxScore) * 100;
                scoreCount++;
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
		// 历史版本以目录识别，现改为跨目录识别
		const quizDir = this.plugin.settings.quizDir || 'quiz';

		// 收集活动
		for (const file of files) {
			// 组合笔记（跨目录识别）
			if (this.isCombinedNote(file)) {
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
