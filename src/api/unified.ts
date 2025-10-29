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

		const MAX_RETRIES = 1; // 限流时简单重试1次
		let attempt = 0;
		while (true) {
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
                // 优先 text，再尝试 JSON，便于保留更多错误信息
				const raw = await response.text().catch(() => '');
                let errMsg = response.statusText;
				let retryMs: number | null = null;
				if (raw) {
                    try {
                        const obj = JSON.parse(raw);
                        errMsg = obj?.error?.message || raw;
						// 解析 Gemini 的 RetryInfo（"retryDelay": "26s"）
						const m = raw.match(/"retryDelay"\s*:\s*"(\d+)s"/);
						if (m && m[1]) retryMs = parseInt(m[1], 10) * 1000;
                    } catch {
                        errMsg = raw;
                    }
                }
				// 头部 Retry-After（秒）
				const ra = response.headers.get('retry-after');
				if (!retryMs && ra && /^\d+$/.test(ra)) retryMs = parseInt(ra, 10) * 1000;

				// 针对 429 做一次等待重试
				if (response.status === 429 && attempt < MAX_RETRIES) {
					const wait = retryMs ?? 26000; // 默认 26s
					try {
						this.debugAppend?.('429 限流重试', {
							provider: this.provider,
							model: config.model,
							waitMs: wait,
							message: errMsg
						});
					} catch {}
					await this.sleep(wait);
					attempt++;
					continue; // 重试
				}
                throw new Error(`API请求失败 (${response.status}): ${errMsg}`);
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
		// 如果是 Gemini，按原生 generateContent 接口发送（更稳定的图片理解）
		if (this.provider === AIProvider.GEMINI) {
			// 确保 data:URL
			let dataUrl = imageUrl;
			const isData = imageUrl.startsWith('data:');
			const isHttps = imageUrl.startsWith('https:');
			if (!isData) {
				try {
					// http 或 https 链接统一转 data:
					dataUrl = await this.fetchImageAsDataUrl(imageUrl);
					this.debugAppend?.('Gemini 原生图片-使用 data:URL', {
						sourcePreview: imageUrl.slice(0, 120)
					});
				} catch (e) {
					// 兜底失败：如果是 https 仍可尝试 file_data，但本端实现仅支持 inline_data
					this.debugAppend?.('Gemini 原生图片-转 data:URL 失败', {
						message: (e as any)?.message || String(e),
						sourcePreview: imageUrl.slice(0, 120)
					});
				}
			}

			// 解析 data:URL
			const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
			if (!m) {
				throw new Error('Gemini 原生接口需要 data:URL（inline_data）');
			}
			const mime = m[1];
			const base64data = m[2];

			// 计算原生 endpoint
			const nativeBase = this.baseUrl.replace(/\/?openai\/?$/, '');
			const useModel = model || 'gemini-2.5-pro';
			const endpoint = `${nativeBase}/models/${useModel}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

			const body = {
				contents: [
					{
						role: 'user',
						parts: [
							{ text: prompt },
							{ inline_data: { mime_type: mime, data: base64data } }
						]
					}
				]
			};

			// 限流重试（一次）
			const MAX_RETRIES = 1;
			let attempt = 0;
			while (true) {
				const res = await fetch(endpoint, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				if (!res.ok) {
					const raw = await res.text().catch(() => '');
					let errMsg = res.statusText;
					let retryMs: number | null = null;
					if (raw) {
						try {
							const obj = JSON.parse(raw);
							errMsg = obj?.error?.message || raw;
							const rm = raw.match(/"retryDelay"\s*:\s*"(\d+)s"/);
							if (rm && rm[1]) retryMs = parseInt(rm[1], 10) * 1000;
						} catch { errMsg = raw; }
					}
					const ra = res.headers.get('retry-after');
					if (!retryMs && ra && /^\d+$/.test(ra)) retryMs = parseInt(ra, 10) * 1000;
					if (res.status === 429 && attempt < MAX_RETRIES) {
						const wait = retryMs ?? 26000;
						this.debugAppend?.('Gemini 429 限流重试', { waitMs: wait, message: errMsg });
						await this.sleep(wait);
						attempt++;
						continue;
					}
					throw new Error(`Gemini 原生接口失败 (${res.status}): ${errMsg}`);
				}
				const data = await res.json();
				try { this.debugAppend?.('Gemini 原生图片-返回', { model: useModel, hasCandidates: !!data?.candidates?.length }); } catch {}
				const text = (data?.candidates?.[0]?.content?.parts || [])
					.map((p: any) => p?.text)
					.filter((t: any) => typeof t === 'string' && t.length > 0)
					.join('');
				if (!text) throw new Error('Gemini 原生接口返回为空');
				return text;
			}
		}

		// 其他厂商：走 OpenAI 兼容格式
		let finalUrl = imageUrl;
		const response = await this.chat({
			model: model || 'default',
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'text', text: prompt },
						{ type: 'image_url', image_url: { url: finalUrl } }
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
     * 将远程图片下载为 data:URL（用于 Gemini 兜底）
     */
    private async fetchImageAsDataUrl(url: string): Promise<string> {
        const res = await fetch(url);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`获取图片失败(${res.status}): ${text || res.statusText}`);
        }
        const buf = await res.arrayBuffer();
        let mime = res.headers.get('content-type') || '';
        if (!mime) {
            // 简单根据扩展名判断
            const lower = url.toLowerCase();
            if (lower.endsWith('.png')) mime = 'image/png';
            else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
            else if (lower.endsWith('.gif')) mime = 'image/gif';
            else if (lower.endsWith('.webp')) mime = 'image/webp';
            else mime = 'image/png';
        }
        const base64 = this.arrayBufferToBase64(buf);
        return `data:${mime};base64,${base64}`;
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private async sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
