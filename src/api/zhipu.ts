import { ZhipuRequestConfig, ZhipuResponse } from '../types';
import { Notice } from 'obsidian';

/**
 * 智谱 AI API 客户端
 */
export class ZhipuAI {
	private apiKey: string;
	private baseUrl: string;

	constructor(apiKey: string, baseUrl: string = 'https://open.bigmodel.cn/api/paas/v4') {
		this.apiKey = apiKey;
		this.baseUrl = baseUrl;
	}

	/**
	 * 发送聊天请求
	 */
	async chat(config: ZhipuRequestConfig): Promise<ZhipuResponse> {
		const url = `${this.baseUrl}/chat/completions`;

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.apiKey}`
				},
				body: JSON.stringify(config)
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(`API请求失败 (${response.status}): ${errorData.error?.message || response.statusText}`);
			}

			const data = await response.json();
			return data as ZhipuResponse;
		} catch (error) {
			console.error('智谱AI API调用失败:', error);
			throw error;
		}
	}

	/**
	 * 使用 GLM-4.6 生成文本
	 */
	async generateText(
		systemPrompt: string,
		userPrompt: string,
		options: {
			temperature?: number;
			maxTokens?: number;
			model?: string;
		} = {}
	): Promise<string> {
		const config: ZhipuRequestConfig = {
			model: options.model || 'glm-4-flash',
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			temperature: options.temperature ?? 0.7,
			max_tokens: options.maxTokens ?? 8000
		};

		const response = await this.chat(config);

		if (!response.choices || response.choices.length === 0) {
			throw new Error('API返回结果为空');
		}

		return response.choices[0].message.content;
	}

	/**
	 * 使用 GLM-4.5V 识别图片
	 */
	async recognizeImage(
		imageUrl: string,
		prompt: string = `请详细描述这张图片的内容,包括:
1. 主要对象或主题
2. 视觉元素(颜色、布局、风格等)
3. 图片传达的信息或情感

请用简洁专业的语言,适合插入到文章中作为图片说明。`,
		model?: string
	): Promise<string> {
		const config: ZhipuRequestConfig = {
			model: model || 'glm-4.5v',
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: prompt },
						{ type: 'image_url', image_url: { url: imageUrl } }
					]
				}
			],
			temperature: 0.7,
			max_tokens: 1000
		};

		const response = await this.chat(config);

		if (!response.choices || response.choices.length === 0) {
			throw new Error('图片识别失败');
		}

		return response.choices[0].message.content;
	}

	/**
	 * 总结文本内容
	 */
	async summarizeText(text: string, maxLength: number = 200, model?: string): Promise<string> {
		const systemPrompt = `你是一个专业的内容总结助手,擅长提炼核心信息。`;
		const userPrompt = `请对以下网页内容进行总结,提取核心信息:

${text}

要求:
1. 保留关键观点和重要信息
2. 语言简洁流畅
3. 适合融入文章叙述
4. 控制在 ${maxLength} 字以内`;

		return await this.generateText(systemPrompt, userPrompt, {
			temperature: 0.5,
			maxTokens: Math.min(maxLength * 2, 1000),
			model
		});
	}
}

/**
 * 批量处理助手类
 */
export class BatchProcessor {
	private concurrency: number;

	constructor(concurrency: number = 5) {
		this.concurrency = concurrency;
	}

	/**
	 * 并发执行任务,控制并发数
	 */
	async processInBatches<T, R>(
		items: T[],
		processor: (item: T, index: number) => Promise<R>,
		onProgress?: (completed: number, total: number) => void
	): Promise<R[]> {
		const results: R[] = new Array(items.length);
		let completed = 0;
		let currentIndex = 0;

		const executeNext = async (): Promise<void> => {
			const index = currentIndex++;
			if (index >= items.length) return;

			try {
				results[index] = await processor(items[index], index);
				completed++;
				onProgress?.(completed, items.length);
			} catch (error) {
				console.error(`处理第 ${index + 1} 项时出错:`, error);
				// 继续处理其他项,但记录错误
				results[index] = null as R;
				completed++;
				onProgress?.(completed, items.length);
			}

			// 处理下一项
			await executeNext();
		};

		// 启动并发任务
		const workers = Array(Math.min(this.concurrency, items.length))
			.fill(null)
			.map(() => executeNext());

		await Promise.all(workers);
		return results;
	}

	/**
	 * 处理图片列表
	 */
	async processImages(
		zhipu: ZhipuAI,
		imageUrls: string[],
		onProgress?: (completed: number, total: number) => void
	): Promise<Array<string | null>> {
		return this.processInBatches(
			imageUrls,
			async (url) => {
				try {
					return await zhipu.recognizeImage(url);
				} catch (error) {
					console.error(`图片识别失败 (${url}):`, error);
					return null;
				}
			},
			onProgress
		);
	}

	/**
	 * 处理链接列表
	 */
	async processLinks(
		zhipu: ZhipuAI,
		links: Array<{ url: string; content: string }>,
		onProgress?: (completed: number, total: number) => void
	): Promise<Array<string | null>> {
		return this.processInBatches(
			links,
			async (link) => {
				try {
					if (!link.content) return null;
					return await zhipu.summarizeText(link.content, 200);
				} catch (error) {
					console.error(`链接总结失败 (${link.url}):`, error);
					return null;
				}
			},
			onProgress
		);
	}
}

/**
 * 验证 API Key 是否有效
 */
export async function validateApiKey(apiKey: string, baseUrl: string): Promise<boolean> {
	try {
		const zhipu = new ZhipuAI(apiKey, baseUrl);
		await zhipu.generateText('你是一个助手', '你好', { maxTokens: 10 });
		return true;
	} catch (error) {
		console.error('API Key 验证失败:', error);
		return false;
	}
}
