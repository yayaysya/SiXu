import { ImageInfo, LinkInfo, PromptTemplate, ParsedMarkdown } from '../types';
import { UnifiedAIProvider } from '../api/unified';
import { buildSystemPrompt } from '../prompts/templates';
import { DebugMarkdownLogger } from '../utils/DebugMarkdown';

/**
 * 文本整合处理器
 */
export class TextProcessor {
	private provider: UnifiedAIProvider;
	private textModel?: string;
    private logger?: DebugMarkdownLogger;

    constructor(provider: UnifiedAIProvider, textModel?: string, logger?: DebugMarkdownLogger) {
		this.provider = provider;
		this.textModel = textModel;
        this.logger = logger;
	}

	/**
	 * 整合内容并生成最终文章
	 */
	async generateArticle(
		originalContent: string,
		processedImages: ImageInfo[],
		processedLinks: LinkInfo[],
		template: PromptTemplate,
		metadata?: ParsedMarkdown['metadata']
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
			linkInfoList,
			metadata
		);

        // 调试：记录提示词
        try {
            this.logger?.appendSection('文本整合-提示词', {
                model: this.textModel,
                system: prompts.system,
                user: prompts.user
            });
        } catch {}

        // 调用 AI 生成文章
		const article = await this.provider.generateText(
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

		// 确保元数据正确添加到文章中
		if (metadata) {
			finalArticle = this.ensureMetadata(finalArticle, metadata);
		}

        // 调试：记录原始输出
        try {
            this.logger?.appendSection('文本整合-原始输出(raw)', article);
        } catch {}

        // 清理文章中的多余内容（包括多余的"链接"文字）
		finalArticle = this.cleanArticle(finalArticle);

        // 调试：记录清理后
        try {
            this.logger?.appendSection('文本整合-清理后(cleaned)', finalArticle);
        } catch {}

		return finalArticle;
	}

	/**
	 * 智能填充模板（改进版 - 对齐 Web 版本）
	 */
	private fillSmartTemplate(
		template: PromptTemplate,
		content: string,
		images: Array<{ index: number; description: string; markdown: string; alt: string }>,
		links: Array<{ index: number; summary: string; text: string; url: string; markdown: string }>,
		metadata?: ParsedMarkdown['metadata']
	): { system: string; user: string } {
		// 构建提示词部分
		const promptParts: string[] = [];

		promptParts.push("请将以下笔记内容整理成一篇完整的文章:\n");

		// 如果有元数据,告知 AI
		if (metadata && metadata.rawYaml) {
			promptParts.push("\n【重要】原文档包含以下 YAML Front Matter,输出文章时必须完整保留在文章开头(用 --- 包裹):\n\n");
			promptParts.push(metadata.rawYaml);
			promptParts.push("\n");

			// 如果有标签,提示 AI 在标题下方添加标签行
			if (metadata.tags && metadata.tags.length > 0) {
				const tagsLine = metadata.tags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ');
				promptParts.push(`\n另外,请在文章标题下方添加标签行: **标签**: ${tagsLine}\n`);
			}
		}

		// 原始笔记内容
		promptParts.push("\n## 原始笔记内容\n");
		promptParts.push(content);

		// 可用图片素材 - 修改提示语,强调这是素材不是内容
		if (images.length > 0) {
			promptParts.push("\n\n【以下是可用的图片,请在文章中合适位置自然插入,不要单独列出图片列表】\n\n");
			images.forEach((img, i) => {
				// 区分本地图片(Obsidian格式)和远程图片(标准markdown格式)
				const formatNote = img.markdown.startsWith('![[')
					? '(Obsidian本地图片格式,请保持原样)'
					: '';
				promptParts.push(
					`图片${i + 1}: ${img.markdown} ${formatNote}\n` +
					`描述: ${img.description}\n\n`
				);
			});
		}

		// 成功获取的链接 - 修改提示语
		if (links.length > 0) {
			promptParts.push("\n\n【以下是已成功爬取的链接内容,请融入文章正文或在文末引用】\n\n");
			links.forEach((link, i) => {
				promptParts.push(
					`资源${i + 1}: [${link.text || '参考'}](${link.url})\n` +
					`内容摘要: ${link.summary}\n\n`
				);
			});
		}

		// 添加整理要求
		promptParts.push(`
\n请你:
1. 将这些内容整合成一篇连贯的文章
2. 在合适的位置插入图片,格式: ![图片描述](图片URL)
3. **成功爬取的资源**: 可以融入正文叙述,或在文末引用,格式: [标题](URL)
4. **保留所有代码块、引用块、分隔线等特殊格式,不要修改**
5. 优化语言表达,但不改变核心意思
6. 输出完整的 Markdown 格式文章
7. **重要**: 不要在参考链接部分额外添加"链接"文字,只需要显示标题和URL
`);

		const userPrompt = promptParts.join('');

		// 组装完整的系统提示词（基础角色 + 写作风格 + 格式要求）
		return {
			system: buildSystemPrompt(template),
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
	 * 确保元数据正确添加到文章中
	 */
	private ensureMetadata(article: string, metadata: ParsedMarkdown['metadata']): string {
		let result = article.trim();

		// 1. 确保 YAML Front Matter 在最前面
		if (metadata.rawYaml || metadata.tags) {
			// 更新 modified 日期为当前日期
			const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD 格式
			let yamlContent = metadata.rawYaml || '';

			// 如果有 modified 字段,更新它
			if (yamlContent.includes('modified:')) {
				yamlContent = yamlContent.replace(/modified:\s*.+/, `modified: ${today}`);
			} else if (yamlContent) {
				// 如果没有 modified 字段,添加它
				yamlContent = yamlContent + `\nmodified: ${today}`;
			} else {
				// 如果没有 YAML,创建基本的 YAML
				yamlContent = `modified: ${today}`;
			}

			// 确保 YAML 中包含 source_files (列表格式)
			if (metadata.source_files && metadata.source_files.length > 0) {
				const sourceFilesListLines = metadata.source_files.map((file: string) => `  - "${file}"`).join('\n');
				const sourceFilesYaml = `source_files:\n${sourceFilesListLines}`;

				// 移除现有的 source_files
				if (yamlContent.match(/source_files:/)) {
					yamlContent = yamlContent.replace(
						/source_files:\s*(?:\[[\s\S]*?\]|(?:\n\s+-\s*.+)+)/,
						sourceFilesYaml
					);
				} else {
					// 添加 source_files
					yamlContent = yamlContent + `\n${sourceFilesYaml}`;
				}
			}

			// 确保 YAML 中包含 tags (列表格式)
			if (metadata.tags && metadata.tags.length > 0) {
				const tagsListLines = metadata.tags.map(tag => `  - ${tag}`).join('\n');
				const tagsYaml = `tags:\n${tagsListLines}`;

				// 移除现有的 tags (支持两种格式)
				if (yamlContent.match(/tags:/)) {
					// 替换现有的 tags (数组格式或列表格式)
					yamlContent = yamlContent.replace(
						/tags:\s*(?:\[[\s\S]*?\]|(?:\n\s+-\s*.+)+)/,
						tagsYaml
					);
				} else {
					// 添加 tags
					yamlContent = yamlContent + `\n${tagsYaml}`;
				}
			}

			// 移除文章中可能已有的 YAML Front Matter
			result = result.replace(/^---\n[\s\S]*?\n---\n?/, '');

			// 添加 YAML Front Matter 到开头
			result = `---\n${yamlContent}\n---\n\n${result}`;
		}

		// 2. 确保标签行在第一个标题下方
		if (metadata.tags && metadata.tags.length > 0) {
			const tagsLine = metadata.tags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join('  ');
			const tagLineMarkdown = `**标签**: ${tagsLine}`;

			// 移除所有现有的标签行（可能 AI 生成了，也可能位置不对）
			result = result.replace(/^\*\*标签\*\*:\s*#.*$/gm, '');

			// 查找第一个 # 标题
			const titleMatch = result.match(/^(#\s+.+)$/m);
			if (titleMatch) {
				const titleLine = titleMatch[1];
				const titleIndex = result.indexOf(titleLine);

				// 在标题下方插入标签行
				const beforeTitle = result.substring(0, titleIndex + titleLine.length);
				const afterTitle = result.substring(titleIndex + titleLine.length);
				result = beforeTitle + `\n${tagLineMarkdown}\n` + afterTitle;
			}
		}

		// 清理多余的空行（移除标签行后可能产生的）
		result = result.replace(/\n{3,}/g, '\n\n');

		return result;
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
		// 移除可能的多余 YAML 代码块 (AI 可能误输出)
		// 只移除包含 YAML front matter 字段的代码块
		let cleaned = article.replace(/```yaml\s*\n([\s\S]*?(?:created|modified|publish|tags|完成度)[\s\S]*?)\n```\s*\n?/g, '');

		// 移除参考链接部分多余的"链接"文字
		// 匹配 "参考链接" 标题后面单独一行的 "链接" 文字
		cleaned = cleaned.replace(/(#+\s*参考链接\s*\n\s*)链接\s*\n/gi, '$1');

		// 也处理可能的"链接:"格式
		cleaned = cleaned.replace(/(#+\s*参考链接\s*\n\s*)链接[:：]\s*\n/gi, '$1');

		// 处理参考链接部分每行前面多余的"链接"前缀
		cleaned = cleaned.replace(/(#+\s*参考链接[\s\S]*?)(\n\s*)链接\s*\d+[:：]\s*/g, '$1$2');
		// 处理可能剩余的"链接 X:"格式
		cleaned = cleaned.replace(/^(\s*)链接\s*\d+[:：]\s*/gm, '$1');

		// 移除可能的多余空行
		cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

		// 确保代码块格式正确
		cleaned = cleaned.replace(/```(\w+)?\n/g, '```$1\n');

		return cleaned.trim();
	}
}
