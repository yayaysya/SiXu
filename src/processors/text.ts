import { ImageInfo, LinkInfo, PromptTemplate } from '../types';
import { ZhipuAI } from '../api/zhipu';
import { fillTemplate } from '../prompts/templates';

/**
 * 文本整合处理器
 */
export class TextProcessor {
	private zhipu: ZhipuAI;
	private textModel?: string;

	constructor(zhipu: ZhipuAI, textModel?: string) {
		this.zhipu = zhipu;
		this.textModel = textModel;
	}

	/**
	 * 整合内容并生成最终文章
	 */
	async generateArticle(
		originalContent: string,
		processedImages: ImageInfo[],
		processedLinks: LinkInfo[],
		template: PromptTemplate
	): Promise<string> {
		// 分离成功和失败的链接
		const successfulLinks = processedLinks.filter(link => link.fetchSuccess === true);
		const failedLinks = processedLinks.filter(link => link.fetchSuccess === false);

		// 准备图片信息（包含完整内容描述和原始 Markdown）
		const imageInfoList = processedImages.map((img, i) => {
			const desc = img.description || img.alt || '无描述';
			return {
				index: i + 1,
				description: desc,
				markdown: img.originalMarkdown,
				alt: img.alt || ''
			};
		});

		// 准备成功抓取的链接信息
		const linkInfoList = successfulLinks.map((link, i) => {
			return {
				index: i + 1,
				summary: link.summary || '',
				text: link.text || '',
				url: link.url,
				markdown: link.originalMarkdown
			};
		});

		// 填充模板
		const prompts = this.fillSmartTemplate(
			template,
			originalContent,
			imageInfoList,
			linkInfoList
		);

		// 调用 AI 生成文章
		const article = await this.zhipu.generateText(
			prompts.system,
			prompts.user,
			{
				temperature: 0.7,
				maxTokens: 8000,
				model: this.textModel
			}
		);

		// 添加失败的链接到参考引用部分
		let finalArticle = article;
		if (failedLinks.length > 0) {
			const referencesSection = this.buildReferencesSection(failedLinks);
			finalArticle = this.appendReferencesSection(article, referencesSection);
		}

		return finalArticle;
	}

	/**
	 * 智能填充模板（改进版 - 对齐 Web 版本）
	 */
	private fillSmartTemplate(
		template: PromptTemplate,
		content: string,
		images: Array<{ index: number; description: string; markdown: string; alt: string }>,
		links: Array<{ index: number; summary: string; text: string; url: string; markdown: string }>
	): { system: string; user: string } {
		// 构建提示词部分
		const promptParts: string[] = [];

		promptParts.push("请将以下笔记内容整理成一篇完整的文章:\n");

		// 原始笔记内容
		promptParts.push("\n## 原始笔记内容\n");
		promptParts.push(content);

		// 可用图片素材 - 修改提示语,强调这是素材不是内容
		if (images.length > 0) {
			promptParts.push("\n\n【以下是可用的图片,请在文章中合适位置自然插入,不要单独列出图片列表】\n\n");
			images.forEach((img, i) => {
				promptParts.push(
					`图片${i + 1}: ${img.markdown}\n` +
					`描述: ${img.description}\n\n`
				);
			});
		}

		// 成功获取的链接 - 修改提示语
		if (links.length > 0) {
			promptParts.push("\n\n【以下是已成功爬取的链接内容,请融入文章正文或在文末引用】\n\n");
			links.forEach((link, i) => {
				promptParts.push(
					`链接${i + 1}: [${link.text || '参考'}](${link.url})\n` +
					`内容摘要: ${link.summary}\n\n`
				);
			});
		}

		// 添加整理要求
		promptParts.push(`
\n请你:
1. 将这些内容整合成一篇连贯的文章
2. 在合适的位置插入图片,格式: ![图片描述](图片URL)
3. **成功爬取的链接**: 可以融入正文叙述,或在文末引用,格式: [链接标题](链接URL)
4. **保留所有代码块、引用块、分隔线等特殊格式,不要修改**
5. 优化语言表达,但不改变核心意思
6. 输出完整的 Markdown 格式文章
`);

		const userPrompt = promptParts.join('');

		// 使用模板的 system prompt (已经包含所有要求)
		return {
			system: template.systemPrompt,
			user: userPrompt
		};
	}

	/**
	 * 将参考引用部分追加到文章末尾
	 */
	private appendReferencesSection(article: string, referencesSection: string): string {
		// 检查文章是否已经有"参考引用"或"参考链接"标题
		if (article.includes('# 参考引用') || article.includes('## 参考引用') ||
		    article.includes('# 参考链接') || article.includes('## 参考链接')) {
			// 如果已有，只追加链接列表
			return article + '\n\n' + referencesSection.replace(/^#+ 参考.*?\n*/m, '');
		} else {
			// 如果没有，创建新的参考链接章节(使用一级标题)
			return article.trim() + '\n\n' + '# 参考链接\n\n' + referencesSection.replace(/^#+ 参考.*?\n*/m, '');
		}
	}

	/**
	 * 构建引用部分(用于放置抓取失败的链接)
	 */
	private buildReferencesSection(failedLinks: LinkInfo[]): string {
		// 改为简单的"参考链接",不显示"无法抓取"
		const lines = ['## 参考链接', ''];

		failedLinks.forEach((link, index) => {
			lines.push(`${index + 1}. [${link.text || link.url}](${link.url})`);
		});

		return lines.join('\n');
	}

	/**
	 * 清理生成的文章
	 */
	cleanArticle(article: string): string {
		// 移除可能的多余空行
		let cleaned = article.replace(/\n{3,}/g, '\n\n');

		// 确保代码块格式正确
		cleaned = cleaned.replace(/```(\w+)?\n/g, '```$1\n');

		return cleaned.trim();
	}
}
