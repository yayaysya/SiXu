/**
 * AI 厂商枚举
 */
export enum AIProvider {
	ZHIPU = 'zhipu',
	OPENAI = 'openai',
	DEEPSEEK = 'deepseek',
	GEMINI = 'gemini'
}

/**
 * 厂商配置
 */
export interface ProviderSettings {
	apiKey: string;
	baseUrl: string;
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

	// 各厂商 API 配置
	providers: {
		[AIProvider.ZHIPU]: ProviderSettings;
		[AIProvider.OPENAI]: ProviderSettings;
		[AIProvider.DEEPSEEK]: ProviderSettings;
		[AIProvider.GEMINI]: ProviderSettings;
	};

	// 其他配置
	concurrency: number;
	outputFileNameTemplate: string;
	selectedPromptTemplate: string;
	customPromptTemplates: PromptTemplate[];
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
		}
	},

	concurrency: 5,
	outputFileNameTemplate: '{name}_AI整理',
	selectedPromptTemplate: 'default',
	customPromptTemplates: []
};

/**
 * 提示词模板
 */
export interface PromptTemplate {
	id: string;
	name: string;
	description: string;
	systemPrompt: string;
	userPromptTemplate: string;
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
