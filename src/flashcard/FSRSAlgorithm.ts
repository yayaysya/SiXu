/**
 * FSRS（简化实现）
 * 目标：提供稳定的、可维护的替代方案，接口面向 FlashcardStorage 使用。
 * 说明：这里实现的是默认权重的近似版，足以满足一般记忆曲线需求；
 * 如需更严格的 FSRS 权重拟合，可在此文件进一步替换为完整实现。
 */

export type Rating = 0 | 1 | 2 | 3; // 0=忘记 Again, 1=困难 Hard, 2=熟悉 Good, 3=简单 Easy

export interface FSRSState {
    stability: number;   // S，单位：天
    difficulty: number;  // D，范围建议 1~10（越大越难）
}

export interface FSRSResult {
    stability: number;
    difficulty: number;
    intervalDays: number;   // 下一次间隔（天）
}

export class FSRSAlgorithm {
    // 目标保持率（下一次复习时希望的保留率）
    static TARGET_RETENTION = 0.9;
    // 稳定度增长基准系数（简化权重）
    static GROWTH = 0.6;

    /** 初始化新卡片学习参数 */
    static initializeCard() {
        return {
            stability: 0.6, // 初始稳定度（约半天~一天级别，促使尽快复习）
            difficulty: 5.0,
            nextReview: Date.now(),
            status: 'new' as const
        };
    }

    /** 计算“天数”间隔对应的时间戳 */
    static calculateNextReviewTime(intervalDays: number): number {
        const msPerDay = 24 * 60 * 60 * 1000;
        return Date.now() + Math.max(1, intervalDays) * msPerDay;
    }

    /**
     * 主更新函数：根据评分、上次间隔天数，更新稳定度/难度，并返回下一次间隔
     * @param state  当前 S/D
     * @param rating 0..3（Again/Hard/Good/Easy）
     * @param elapsedDays 距离上次复习的天数（首次为0）
     */
    static update(state: FSRSState, rating: Rating, elapsedDays: number): FSRSResult {
        const R = Math.max(0.01, Math.exp(-elapsedDays / Math.max(0.01, state.stability))); // 当前保持率估计
        let difficulty = state.difficulty;
        let stability = state.stability;

        // 难度更新：差评提高难度，好评降低难度
        const dDelta = [ +1.0, +0.4, -0.2, -0.35 ][rating];
        difficulty = clamp(difficulty + dDelta, 1, 10);

        if (rating === 0) {
            // Again：重置稳定度，促使尽快复习
            stability = 0.6;
        } else {
            // Hard/Good/Easy：随(1 - R)增长，Easy 增长更快
            const multiplier = [0.0, 0.6, 1.0, 1.4][rating];
            const growth = FSRSAlgorithm.GROWTH * (1 - R) * multiplier;
            stability = Math.max(0.3, stability * (1 + growth));
        }

        // 由目标保持率计算下一间隔：t = -S * ln(Rt)
        const intervalDays = Math.max(1, -stability * Math.log(FSRSAlgorithm.TARGET_RETENTION));

        return { stability, difficulty, intervalDays };
    }

    /** 根据稳定度与下一次间隔推断状态 */
    static determineCardStatus(stability: number, intervalDays: number): 'new' | 'learning' | 'review' | 'mastered' {
        if (stability <= 0.6 && intervalDays <= 1.01) return 'new';
        if (stability < 3) return 'learning';
        if (intervalDays < 21) return 'review';
        return 'mastered';
    }
}

function clamp(x: number, min: number, max: number) {
    return Math.max(min, Math.min(max, x));
}

