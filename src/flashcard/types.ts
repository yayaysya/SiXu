/**
 * 闪卡类型定义
 */

/**
 * 学习记录
 */
export interface ReviewRecord {
	timestamp: number;           // 复习时间戳
	rating: 0 | 1 | 2 | 3;       // 评估等级：0=忘记, 1=困难, 2=熟悉, 3=简单
	timeTaken: number;           // 用时（秒）
}

/**
 * 学习状态
 */
export type CardStatus = 'new' | 'learning' | 'review' | 'mastered';

/**
 * 单个闪卡
 */
export interface Flashcard {
	id: string;                  // 唯一ID
	question: string;            // 问题
	answer: string;              // 答案
	sourceNote: string;          // 来源笔记路径
	sourceSection: string;       // 来源段落/标题
	sourceLineStart?: number;    // 原文起始行（可选）
	sourceLineEnd?: number;      // 原文结束行（可选）
	tags: string[];              // 标签
	createdAt: number;           // 创建时间
	updatedAt: number;           // 更新时间

	// 学习状态（SM-2算法）
	learning: {
		easeFactor: number;      // 难度因子 (初始2.5)
		interval: number;        // 复习间隔(天)
		repetitions: number;     // 连续正确次数
		nextReview: number;      // 下次复习时间戳
		lastReview?: number;     // 上次复习时间戳
		status: CardStatus;      // 学习状态
	};

	// 学习记录
	reviewHistory: ReviewRecord[];
}

/**
 * 闪卡组
 */
export interface FlashcardDeck {
	id: string;                  // 卡组ID
	name: string;                // 卡组名称
	sourceNotes: string[];       // 来源笔记路径（可能多个）
	cardIds: string[];           // 卡片ID列表
	createdAt: number;           // 创建时间
	updatedAt: number;           // 更新时间

	settings: {
		newCardsPerDay: number;    // 每天新卡片数
		reviewCardsPerDay: number; // 每天复习卡片数
	};

	// 统计数据
	stats: {
		total: number;              // 总卡片数
		new: number;                // 新卡片数
		learning: number;           // 学习中卡片数
		review: number;             // 复习中卡片数
		mastered: number;           // 已掌握卡片数
		masteryRate: number;        // 掌握率 0-1
		lastStudyTime?: number;     // 最后学习时间
		totalStudyTime: number;     // 累计学习时间(秒)
		totalReviews: number;       // 总复习次数
	};
}

/**
 * AI 生成闪卡的原始数据格式
 */
export interface AIGeneratedCard {
	question: string;
	answer: string;
	sourceSection: string;
	tags?: string[];
}

/**
 * AI 生成响应格式
 */
export interface AIFlashcardResponse {
	cards: AIGeneratedCard[];
}

/**
 * 闪卡生成选项
 */
export interface FlashcardGenerationOptions {
	count: number;               // 生成卡片数量
	sourceNote: string;          // 来源笔记路径
	deckName: string;            // 卡组名称
}
