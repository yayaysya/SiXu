/**
 * 插件设置接口
 */
export interface NotebookLLMSettings {
	apiKey: string;
	apiBaseUrl: string;
	textModel: string;
	visionModel: string;
	concurrency: number;
	outputFileNameTemplate: string;
	selectedPromptTemplate: string;
	customPromptTemplates: PromptTemplate[];
}

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: NotebookLLMSettings = {
	apiKey: '',
	apiBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
	textModel: 'glm-4.6',
	visionModel: 'glm-4.5v',
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
		title?: string;
		tags?: string[];
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
