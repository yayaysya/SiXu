import { AIProvider } from '../types';

// 调试回调（由 DebugMarkdownLogger 间接提供）
type DebugAppendFn = (title: string, content: any) => void;

/**
 * 统一 AI Provider
 * 所有厂商都使用 OpenAI 兼容格式
 */
export class UnifiedAIProvider {
	private apiKey: string;
	private baseUrl: string;
	private provider: AIProvider;
    private debugAppend?: DebugAppendFn;

    constructor(provider: AIProvider, apiKey: string, baseUrl: string, debugAppend?: DebugAppendFn) {
		this.provider = provider;
		this.apiKey = apiKey;
		this.baseUrl = baseUrl;
        this.debugAppend = debugAppend;
	}

	/**
	 * 通用聊天请求
	 */
	private async chat(config: {
		model: string;
		messages: Array<{
			role: string;
			content: string | Array<any>;
		}>;
		temperature?: number;
		max_tokens?: number;
	}): Promise<any> {
		const url = `${this.baseUrl}/chat/completions`;

		try {
            // Debug: 请求
            try {
                this.debugAppend?.('AI 请求', {
                    provider: this.provider,
                    url,
                    model: config.model,
                    temperature: config.temperature,
                    max_tokens: config.max_tokens,
                    messages: config.messages
                });
            } catch {}

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
            try {
                const content = data?.choices?.[0]?.message?.content;
                if (content) {
                    this.debugAppend?.('AI 返回', {
                        provider: this.provider,
                        model: config.model,
                        content
                    });
                }
            } catch {}
			return data;
		} catch (error) {
			console.error(`${this.provider} API调用失败:`, error);
            try {
                this.debugAppend?.('AI 调用错误', {
                    provider: this.provider,
                    model: config.model,
                    message: (error as any)?.message || String(error)
                });
            } catch {}
			throw error;
		}
	}

	/**
	 * 生成文本
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
		const response = await this.chat({
			model: options.model || 'default',
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt }
			],
			temperature: options.temperature ?? 0.7,
			max_tokens: options.maxTokens ?? 8000
		});

		if (!response.choices || response.choices.length === 0) {
			throw new Error('API返回了空的响应');
		}

		return response.choices[0].message.content;
	}

	/**
	 * 识别图片
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
		const response = await this.chat({
			model: model || 'default',
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: prompt
						},
						{
							type: 'image_url',
							image_url: {
								url: imageUrl
							}
						}
					]
				}
			],
			max_tokens: 1000
		});

		if (!response.choices || response.choices.length === 0) {
			throw new Error('API返回了空的响应');
		}

		return response.choices[0].message.content;
	}

	/**
	 * 总结文本
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
 * 验证 API Key 是否有效
 */
export async function validateProviderApiKey(
	provider: AIProvider,
	apiKey: string,
	baseUrl: string,
	model: string
): Promise<boolean> {
	try {
		const client = new UnifiedAIProvider(provider, apiKey, baseUrl);
		await client.generateText('你是一个助手', '你好', {
			maxTokens: 10,
			model: model
		});
		return true;
	} catch (error) {
		console.error(`${provider} API Key 验证失败:`, error);
		return false;
	}
}
