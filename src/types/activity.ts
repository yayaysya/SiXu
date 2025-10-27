/**
 * 活动类型定义
 * 用于主页的最近活动展示
 */

/**
 * 活动类型枚举
 */
export type ActivityType =
	| 'combine-created'      // 创建组合笔记
	| 'quiz-generated'       // 生成Quiz
	| 'quiz-completed'       // 完成测验
	| 'flashcard-practiced'; // 闪卡练习（预留，二阶段实现）

/**
 * 活动记录接口
 */
export interface Activity {
	/** 活动类型 */
	type: ActivityType;
	/** 活动标题（显示文本） */
	title: string;
	/** 活动时间 */
	time: Date;
	/** 详细信息（可选） */
	details?: string;
	/** 分数（Quiz完成时使用） */
	score?: number;
	/** 文件链接（可选，用于跳转） */
	fileLink?: string;
}

/**
 * 日历热力图数据点
 */
export interface CalendarDataPoint {
	/** 日期 */
	date: Date;
	/** 活动数量 */
	count: number;
	/** 该日期的活动列表（可选，用于工具提示） */
	activities?: Activity[];
}

/**
 * 日历热力图数据
 */
export interface CalendarData {
	/** 数据点数组 */
	dataPoints: CalendarDataPoint[];
	/** 最大活动数量（用于归一化颜色深度） */
	maxCount: number;
}

/**
 * 获取活动类型的显示文本
 */
export function getActivityTypeLabel(type: ActivityType): string {
	const labels: Record<ActivityType, string> = {
		'combine-created': '创建了组合笔记',
		'quiz-generated': '生成了Quiz试题',
		'quiz-completed': '完成了Quiz测验',
		'flashcard-practiced': '练习了闪卡'
	};
	return labels[type] || '进行了活动';
}

/**
 * 获取活动类型的图标
 */
export function getActivityTypeIcon(type: ActivityType): string {
	const icons: Record<ActivityType, string> = {
		'combine-created': '📝',
		'quiz-generated': '✨',
		'quiz-completed': '✅',
		'flashcard-practiced': '📇'
	};
	return icons[type] || '📋';
}
