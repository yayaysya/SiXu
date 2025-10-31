/**
 * 学习路径配置
 */
export interface LearningPathConfig {
	topic: string;                    // 学习主题
	depth: 'quick' | 'deep' | 'project';  // 学习深度
	background?: string;              // 背景知识
	targetDirectory: string;          // 目标目录
}

/**
 * 学习路径大纲
 */
export interface LearningPathOutline {
	title: string;                    // 路径标题
	description: string;              // 描述
	files: LearningPathFile[];        // 文件列表
	estimatedHours: number;           // 预计学习时长
}

/**
 * 学习路径文件
 */
export interface LearningPathFile {
	filename: string;                 // 文件名（如 "01_核心概念.md"）
	title: string;                    // 标题
	type: 'guide' | 'lesson' | 'practice' | 'quiz';  // 文件类型
	order: number;                    // 顺序
	enabled: boolean;                 // 是否创建
	content?: string;                 // 文件内容（生成后填充）
}

/**
 * 路径生成任务状态
 */
export interface PathGenerationTask {
	id: string;
	config: LearningPathConfig;
	outline?: LearningPathOutline;
	status: 'pending' | 'generating-outline' | 'generating-content' | 'creating-files' | 'completed' | 'failed';
	progress: number;                 // 0-100
	currentFile?: string;             // 当前处理的文件名
	startTime: number;
	endTime?: number;
	error?: string;
	createdFiles?: string[];          // 已创建的文件列表
}

/**
 * 学习路径元数据
 */
export interface LearningPathMetadata {
	title: string;                    // 路径标题
	topic: string;                    // 学习主题
	depth: string;                    // 学习深度
	created: string;                  // 创建时间
	modified: string;                 // 修改时间
	totalFiles: number;               // 文件总数
	estimatedHours: number;           // 预计学习时长
	directory: string;                // 存储目录
}

/**
 * 文件生成选项
 */
export interface FileGenerationOptions {
	includeGuide: boolean;            // 包含学习指南
	includePractice: boolean;         // 包含练习题
	includeQuiz: boolean;             // 包含测验
	customFileCount?: number;         // 自定义文件数量
}

/**
 * AI生成参数
 */
export interface PathGenerationParams {
	maxTokens: number;                // 最大token数
	temperature: number;              // 创造性参数
	includeExamples: boolean;         // 包含示例
	teachingStyle: 'direct' | 'socratic' | 'project-based';  // 教学风格
}

/**
 * 学习路径统计信息
 */
export interface LearningPathStats {
	totalPaths: number;               // 总路径数
	completedPaths: number;           // 已完成路径
	totalFiles: number;               // 总文件数
	totalStudyHours: number;          // 总学习时长
	recentlyCreated: LearningPathMetadata[];  // 最近创建的路径
}

/**
 * 文件类型映射
 */
export const FILE_TYPE_LABELS: Record<string, string> = {
	'guide': '📖 学习指南',
	'lesson': '📚 课程内容',
	'practice': '✏️ 练习题',
	'quiz': '📝 测验'
};

/**
 * 深度级别映射
 */
export const DEPTH_LABELS: Record<string, string> = {
	'quick': '⚡ 快速入门',
	'deep': '🔬 深入探究',
	'project': '🛠️ 项目实战'
};

/**
 * 默认生成参数
 */
export const DEFAULT_GENERATION_PARAMS: PathGenerationParams = {
	maxTokens: 2000,
	temperature: 0.7,
	includeExamples: true,
	teachingStyle: 'direct'
};

/**
 * 默认文件生成选项
 */
export const DEFAULT_FILE_OPTIONS: FileGenerationOptions = {
	includeGuide: true,
	includePractice: true,
	includeQuiz: true,
	customFileCount: 5
};