/**
 * SM-2 (SuperMemo 2) 间隔重复算法
 * 用于计算闪卡的复习间隔
 */

export interface SM2Result {
	newEaseFactor: number;    // 新的难度因子
	newInterval: number;      // 新的复习间隔（天）
	newRepetitions: number;   // 新的连续正确次数
}

export class SM2Algorithm {
	/**
	 * 计算下次复习时间
	 * @param easeFactor 当前难度因子
	 * @param repetitions 当前连续正确次数
	 * @param interval 当前复习间隔（天）
	 * @param rating 用户评估等级 (0=忘记, 1=困难, 2=熟悉, 3=简单)
	 * @returns 新的学习参数
	 */
	static calculateNextReview(
		easeFactor: number,
		repetitions: number,
		interval: number,
		rating: 0 | 1 | 2 | 3
	): SM2Result {
		let newEaseFactor = easeFactor;
		let newInterval = 0;
		let newRepetitions = repetitions;

		// 根据评估调整难度因子和复习间隔
		if (rating >= 2) {
			// 评估为"熟悉"或"简单" - 增加间隔
			newRepetitions++;

			if (newRepetitions === 1) {
				// 第一次正确：1天后复习
				newInterval = 1;
			} else if (newRepetitions === 2) {
				// 第二次正确：6天后复习
				newInterval = 6;
			} else {
				// 第三次及以后：按难度因子计算
				newInterval = Math.round(interval * easeFactor);
			}

			// 调整难度因子（根据评估等级）
			// rating=2(熟悉): 微调
			// rating=3(简单): 增加更多
			const adjustment = 0.1 - (3 - rating) * (0.08 + (3 - rating) * 0.02);
			newEaseFactor = easeFactor + adjustment;
		} else {
			// 评估为"困难"或"忘记" - 重新开始
			newRepetitions = 0;
			newInterval = 1; // 1天后再复习

			// 降低难度因子
			if (rating === 1) {
				// 困难：稍微降低
				newEaseFactor = Math.max(1.3, easeFactor - 0.15);
			} else {
				// 忘记：降低更多
				newEaseFactor = Math.max(1.3, easeFactor - 0.2);
			}
		}

		// 限制难度因子范围 [1.3, 2.5]
		newEaseFactor = Math.max(1.3, Math.min(2.5, newEaseFactor));

		return {
			newEaseFactor,
			newInterval,
			newRepetitions
		};
	}

	/**
	 * 计算下次复习的具体时间戳
	 * @param intervalDays 复习间隔（天）
	 * @returns 下次复习的时间戳
	 */
	static calculateNextReviewTime(intervalDays: number): number {
		const now = Date.now();
		const millisecondsPerDay = 24 * 60 * 60 * 1000;
		return now + (intervalDays * millisecondsPerDay);
	}

	/**
	 * 判断卡片是否到期需要复习
	 * @param nextReviewTime 下次复习时间戳
	 * @returns 是否需要复习
	 */
	static isDue(nextReviewTime: number): boolean {
		return Date.now() >= nextReviewTime;
	}

	/**
	 * 根据学习状态判断卡片状态
	 * @param repetitions 连续正确次数
	 * @param interval 复习间隔（天）
	 * @returns 卡片状态
	 */
	static determineCardStatus(
		repetitions: number,
		interval: number
	): 'new' | 'learning' | 'review' | 'mastered' {
		if (repetitions === 0 && interval === 0) {
			return 'new';
		} else if (repetitions < 3) {
			return 'learning';
		} else if (interval < 21) {
			return 'review';
		} else {
			return 'mastered';
		}
	}

	/**
	 * 初始化新卡片的学习参数
	 */
	static initializeCard() {
		return {
			easeFactor: 2.5,
			interval: 0,
			repetitions: 0,
			nextReview: Date.now(), // 立即可复习
			status: 'new' as const
		};
	}
}
