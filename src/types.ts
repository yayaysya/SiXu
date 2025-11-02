/**
 * AI 厂商枚举
 */
export enum AIProvider {
	ZHIPU = 'zhipu',
	OPENAI = 'openai',
	DEEPSEEK = 'deepseek',
	GEMINI = 'gemini',
	CUSTOM = 'custom'
}

/**
 * 厂商配置
 */
export interface ProviderSettings {
	apiKey: string;
	baseUrl: string;
	cachedModels?: string[];
}

/**
 * 插件设置接口
 */
export interface NotebookLLMSettings {
	// 文本模型配置
	textProvider: AIProvider;
	textModel: string;

	// 视觉模型配置
	visionProvider: AIProvider;
	visionModel: string;

	// 各厂商 API 配置（分离文本和视觉，避免共享配置）
	providers: {
		text: {
			[AIProvider.ZHIPU]: ProviderSettings;
			[AIProvider.OPENAI]: ProviderSettings;
			[AIProvider.DEEPSEEK]: ProviderSettings;
			[AIProvider.GEMINI]: ProviderSettings;
			[AIProvider.CUSTOM]: ProviderSettings;
		};
		vision: {
			[AIProvider.ZHIPU]: ProviderSettings;
			[AIProvider.OPENAI]: ProviderSettings;
			[AIProvider.DEEPSEEK]?: ProviderSettings; // DeepSeek 不支持视觉，但允许存储以兼容旧配置
			[AIProvider.GEMINI]: ProviderSettings;
			[AIProvider.CUSTOM]: ProviderSettings;
		};
	};

	// 其他配置
	concurrency: number;
	outputFileNameTemplate: string;
	selectedPromptTemplate: string;
	customPromptTemplates: PromptTemplate[];

	// 文件输出位置配置
	noteOutputMode: 'source' | 'custom';  // source=源目录, custom=自定义目录
	noteOutputPath?: string;               // 自定义输出目录路径
	combineNotesDir: string;               // 组合笔记输出目录（空表示根目录）

	// 组合笔记配置
	combineNotes: CombineNoteItem[];

	// Quiz配置
	quizDir: string;      // Quiz文件目录
	resultDir: string;    // 结果文件目录

	// 闪卡配置
	flashcard?: {
		deckDir: string;           // 闪卡组存储目录
		newCardsPerDay: number;    // 每天新卡片数
		reviewCardsPerDay: number; // 每天复习卡片数
	};

  // 调试
  debugEnabled?: boolean; // 开启后记录一次性调试日志
}

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: NotebookLLMSettings = {
	textProvider: AIProvider.ZHIPU,
	textModel: 'glm-4.6',

	visionProvider: AIProvider.ZHIPU,
	visionModel: 'glm-4.5v',

	providers: {
		text: {
			[AIProvider.ZHIPU]: {
				apiKey: '',
				baseUrl: 'https://open.bigmodel.cn/api/paas/v4'
			},
			[AIProvider.OPENAI]: {
				apiKey: '',
				baseUrl: 'https://api.openai.com/v1'
			},
			[AIProvider.DEEPSEEK]: {
				apiKey: '',
				baseUrl: 'https://api.deepseek.com/v1'
			},
			[AIProvider.GEMINI]: {
				apiKey: '',
				baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai'
			},
			[AIProvider.CUSTOM]: {
				apiKey: '',
				baseUrl: '',
				cachedModels: []
			}
		},
		vision: {
			[AIProvider.ZHIPU]: {
				apiKey: '',
				baseUrl: 'https://open.bigmodel.cn/api/paas/v4'
			},
			[AIProvider.OPENAI]: {
				apiKey: '',
				baseUrl: 'https://api.openai.com/v1'
			},
			[AIProvider.GEMINI]: {
				apiKey: '',
				baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai'
			},
			[AIProvider.CUSTOM]: {
				apiKey: '',
				baseUrl: ''
			}
		}
	},

	concurrency: 5,
	outputFileNameTemplate: '{name}_AI整理',
	selectedPromptTemplate: 'default',
	customPromptTemplates: [],

	// 文件输出位置配置
	noteOutputMode: 'source',
	noteOutputPath: '',
	combineNotesDir: '',

	// 组合笔记默认为空
	combineNotes: [],

	// Quiz目录配置
	quizDir: 'quiz',
	resultDir: 'quiz/results',

	// 闪卡默认配置
	flashcard: {
		deckDir: 'flashcards',
		newCardsPerDay: 20,
		reviewCardsPerDay: 200
	},

  // 调试默认关闭
  debugEnabled: false
};

/**
 * 组合笔记项
 */
export interface CombineNoteItem {
	path: string;      // 文件路径
	name: string;      // 文件名
	order: number;     // 排序序号
}

/**
 * 公共提示词配置
 */
export interface CommonPrompts {
	baseRole: string;      // 基础角色定义
	formatRules: string;   // 公共格式要求
}

/**
 * 提示词模板
 */
export interface PromptTemplate {
	id: string;
	name: string;
	description: string;
	stylePrompt: string;   // 写作风格提示词（用户可自定义）
}

/**
 * Markdown 解析结果
 */
export interface ParsedMarkdown {
	content: string;
	images: ImageInfo[];
	links: LinkInfo[];
	metadata: {
		rawYaml?: string;
		title?: string;
		tags?: string[];
		created?: string;
		modified?: string;
		publish?: boolean;
		完成度?: number;
		[key: string]: any; // 允许其他自定义字段
	};
}

/**
 * 图片信息
 */
export interface ImageInfo {
	type: 'local' | 'remote';
	path: string;
	alt?: string;
	originalMarkdown: string;
	description?: string;
}

/**
 * 链接信息
 */
export interface LinkInfo {
	url: string;
	text?: string;
	originalMarkdown: string;
	summary?: string;
	fetchSuccess?: boolean;
}

/**
 * 处理任务
 */
export interface ProcessTask {
	id: string;
	sourceFilePath: string;
	outputFilePath: string;
	status: TaskStatus;
	progress: number;
	startTime: number;
	endTime?: number;
	error?: string;
}

/**
 * 任务状态
 */
export enum TaskStatus {
	PENDING = 'pending',
	PARSING = 'parsing',
	PROCESSING_IMAGES = 'processing_images',
	PROCESSING_LINKS = 'processing_links',
	GENERATING = 'generating',
	COMPLETED = 'completed',
	FAILED = 'failed',
	CANCELLED = 'cancelled'
}

/**
 * 智谱 AI 请求配置
 */
export interface ZhipuRequestConfig {
	model: string;
	messages: Array<{
		role: 'system' | 'user' | 'assistant';
		content: string | Array<{
			type: 'text' | 'image_url';
			text?: string;
			image_url?: {
				url: string;
			};
		}>;
	}>;
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	stream?: boolean;
}

/**
 * 智谱 AI 响应
 */
export interface ZhipuResponse {
	id: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

/**
 * 处理进度回调
 */
export type ProgressCallback = (progress: number, status: TaskStatus, message?: string) => void;

/**
 * Quiz题目类型
 */
export type QuestionType = 'single-choice' | 'multiple-choice' | 'fill-blank' | 'short-answer';

/**
 * 题目难度
 */
export type QuestionDifficulty = '简单' | '中等' | '困难';

/**
 * Quiz题目
 */
export interface QuizQuestion {
	id: string;
	type: QuestionType;
	difficulty: QuestionDifficulty;
	question: string;
	options?: string[];           // 选择题选项
	answer: string | string[];    // 答案
	explanation: string;          // 解析
}

/**
 * 用户答案
 */
export interface UserAnswer {
	questionId: string;
	answer: string | string[];
	timestamp: number;
}

/**
 * Quiz元信息
 */
export interface QuizMetadata {
	title: string;
	sourceFile: string;           // 关联的源文档
	difficulty: QuestionDifficulty;
	totalQuestions: number;
	questionTypes: {
		type: string;
		count: number;
	}[];
	quizResults: string[];        // 关联的结果文件列表
	created: string;
}

/**
 * Quiz文件数据
 */
export interface QuizData {
	metadata: QuizMetadata;
	description: string;          // 简介
	questions: QuizQuestion[];
}

/**
 * 单题评分结果
 */
export interface QuizQuestionResult {
	questionId: string;
	userAnswer: string | string[];
	correctAnswer: string | string[];
	score: number;
	maxScore: number;
	feedback?: string;            // AI评分反馈
}

/**
 * Quiz考试结果
 */
export interface QuizResult {
	quizFile: string;
	examDate: string;
	totalScore: number;
	maxScore: number;
	breakdown: Record<string, string>;  // 各题型得分
	weakAreas: string[];
	strongAreas: string[];
	details: QuizQuestionResult[];
}
