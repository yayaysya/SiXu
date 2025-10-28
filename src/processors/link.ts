import { LinkInfo } from '../types';
import { UnifiedAIProvider } from '../api/unified';

/**
 * 链接处理器
 */
export class LinkProcessor {
	private provider: UnifiedAIProvider;
	private textModel?: string;

	constructor(provider: UnifiedAIProvider, textModel?: string) {
		this.provider = provider;
		this.textModel = textModel;
	}

	/**
	 * 抓取网页内容
	 */
	async fetchWebContent(url: string): Promise<string | null> {
		try {
			const response = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
				}
			});

			if (!response.ok) {
				console.warn(`抓取失败 (${url}): HTTP ${response.status}`);
				return null;
			}

			const html = await response.text();

			// 简单提取文本内容(移除 HTML 标签)
			const text = this.extractTextFromHtml(html);

			// 限制长度,避免太长
			return text.substring(0, 10000);
		} catch (error) {
			console.error(`抓取网页失败 (${url}):`, error);
			return null;
		}
	}

	/**
	 * 从 HTML 中提取文本（优化版，专注提取正文）
	 */
	private extractTextFromHtml(html: string): string {
		// 移除 script、style、nav、footer、header、aside 等非正文标签
		let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
		text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
		text = text.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
		text = text.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
		text = text.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
		text = text.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

		// 移除注释
		text = text.replace(/<!--[\s\S]*?-->/g, '');

		// 尝试提取主要内容区域（常见的正文容器）
		const mainContentMatch = text.match(/<(?:main|article|div[^>]*(?:class|id)="[^"]*(?:content|article|post|entry|main)[^"]*")[^>]*>([\s\S]*?)<\/(?:main|article|div)>/i);
		if (mainContentMatch) {
			text = mainContentMatch[1];
		}

		// 提取段落和标题，保留换行
		text = text.replace(/<\/(?:p|div|h[1-6]|li|br)>/gi, '\n');

		// 移除所有剩余的 HTML 标签
		text = text.replace(/<[^>]+>/g, ' ');

		// 解码 HTML 实体
		text = text.replace(/&nbsp;/g, ' ');
		text = text.replace(/&lt;/g, '<');
		text = text.replace(/&gt;/g, '>');
		text = text.replace(/&amp;/g, '&');
		text = text.replace(/&quot;/g, '"');
		text = text.replace(/&#39;/g, "'");
		text = text.replace(/&mdash;/g, '—');
		text = text.replace(/&ndash;/g, '–');

		// 清理多余空白，但保留段落换行
		text = text.replace(/[ \t]+/g, ' ');  // 多个空格/制表符合并为一个空格
		text = text.replace(/\n\s+/g, '\n');   // 移除行首空白
		text = text.replace(/\s+\n/g, '\n');   // 移除行尾空白
		text = text.replace(/\n{3,}/g, '\n\n'); // 多个换行合并为两个

		return text.trim();
	}

	/**
	 * 处理单个链接
	 */
	async processLink(link: LinkInfo): Promise<LinkInfo> {
		try {
			const content = await this.fetchWebContent(link.url);

			if (!content || content.trim().length < 50) {
				// 内容太短或为空，认为抓取失败
				return {
					...link,
					fetchSuccess: false
				};
			}

			// 使用更长的摘要以获取更多上下文信息
			const summary = await this.provider.summarizeText(content, 300, this.textModel);

			return {
				...link,
				summary,
				fetchSuccess: true
			};
		} catch (error) {
			console.error(`链接处理失败 (${link.url}):`, error);
			return {
				...link,
				fetchSuccess: false
			};
		}
	}

	/**
	 * 批量处理链接
	 */
	async processLinks(
		links: LinkInfo[],
		onProgress?: (completed: number, total: number) => void
	): Promise<LinkInfo[]> {
		const results: LinkInfo[] = [];

		for (let i = 0; i < links.length; i++) {
			const result = await this.processLink(links[i]);
			results.push(result);
			onProgress?.(i + 1, links.length);
		}

		return results;
	}

	/**
	 * 获取链接摘要(用于传给文本生成模型)
	 */
	getLinkSummaries(links: LinkInfo[]): string[] {
		return links.map((link, index) => {
			if (link.fetchSuccess && link.summary) {
				return `${link.text || link.url}: ${link.summary}`;
			} else {
				return `${link.text || link.url} (来源: ${link.url})`;
			}
		});
	}

	/**
	 * 获取失败的链接列表(用于附加到文章末尾)
	 */
	getFailedLinks(links: LinkInfo[]): LinkInfo[] {
		return links.filter(link => link.fetchSuccess === false);
	}
}
