import { ParsedMarkdown, ImageInfo, LinkInfo } from '../types';
import { App, TFile } from 'obsidian';

/**
 * Markdown 解析器
 */
export class MarkdownParser {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 解析 Markdown 文件
	 */
	async parse(content: string, sourceFile: TFile): Promise<ParsedMarkdown> {
		const images = await this.extractImages(content, sourceFile);
		const links = this.extractLinks(content);
		const metadata = this.extractMetadata(content);

		return {
			content,
			images,
			links,
			metadata
		};
	}

	/**
	 * 提取图片信息
	 */
	private async extractImages(content: string, sourceFile: TFile): Promise<ImageInfo[]> {
		const images: ImageInfo[] = [];

		// 匹配 Markdown 图片语法: ![alt](path)
		const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		let match;

		while ((match = imageRegex.exec(content)) !== null) {
			const alt = match[1];
			const path = match[2];
			const originalMarkdown = match[0];

			// 判断是本地图片还是网络图片
			if (path.startsWith('http://') || path.startsWith('https://')) {
				// 网络图片
				images.push({
					type: 'remote',
					path: path,
					alt: alt || undefined,
					originalMarkdown
				});
			} else {
				// 本地图片,需要转换为可访问的路径
				const imageUrl = await this.resolveLocalImage(path, sourceFile);
				if (imageUrl) {
					images.push({
						type: 'local',
						path: imageUrl,
						alt: alt || undefined,
						originalMarkdown
					});
				}
			}
		}

		// 也匹配 Wiki 链接格式: ![[image.png]]
		const wikiImageRegex = /!\[\[([^\]]+)\]\]/g;
		while ((match = wikiImageRegex.exec(content)) !== null) {
			const path = match[1];
			const originalMarkdown = match[0];

			const imageUrl = await this.resolveLocalImage(path, sourceFile);
			if (imageUrl) {
				images.push({
					type: 'local',
					path: imageUrl,
					alt: undefined,
					originalMarkdown
				});
			}
		}

		return images;
	}

	/**
	 * 解析本地图片路径
	 */
	private async resolveLocalImage(path: string, sourceFile: TFile): Promise<string | null> {
		try {
			// 移除可能的尺寸参数 (如 image.png|300)
			const cleanPath = path.split('|')[0];

			// 使用 Obsidian API 解析文件
			const imageFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, sourceFile.path);

			if (!imageFile) {
				console.warn(`无法找到图片文件: ${path}`);
				return null;
			}

			// 读取图片文件并转换为 base64
			const arrayBuffer = await this.app.vault.readBinary(imageFile);
			const base64 = this.arrayBufferToBase64(arrayBuffer);
			const extension = imageFile.extension.toLowerCase();

			// 根据扩展名确定 MIME 类型
			const mimeTypes: Record<string, string> = {
				'png': 'image/png',
				'jpg': 'image/jpeg',
				'jpeg': 'image/jpeg',
				'gif': 'image/gif',
				'webp': 'image/webp',
				'bmp': 'image/bmp'
			};
			const mimeType = mimeTypes[extension] || 'image/png';

			return `data:${mimeType};base64,${base64}`;
		} catch (error) {
			console.error(`处理本地图片失败 (${path}):`, error);
			return null;
		}
	}

	/**
	 * 将 ArrayBuffer 转换为 base64
	 */
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		const bytes = new Uint8Array(buffer);
		let binary = '';
		for (let i = 0; i < bytes.byteLength; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}

	/**
	 * 判断URL是否为图片
	 */
	private isImageUrl(url: string): boolean {
		const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
		return imageExtensions.some(ext => url.toLowerCase().endsWith(ext));
	}

	/**
	 * 提取链接信息
	 */
	private extractLinks(content: string): LinkInfo[] {
		const links: LinkInfo[] = [];

		// 匹配 Markdown 链接: [text](url)
		const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
		let match;

		while ((match = linkRegex.exec(content)) !== null) {
			const text = match[1];
			const url = match[2];
			const originalMarkdown = match[0];

			// 过滤图片URL
			if (!this.isImageUrl(url)) {
				links.push({
					url,
					text,
					originalMarkdown
				});
			}
		}

		// 也匹配纯 URL
		const urlRegex = /(?:^|\s)(https?:\/\/[^\s]+)/g;
		while ((match = urlRegex.exec(content)) !== null) {
			const url = match[1];

			// 避免重复(已经在链接语法中的URL) 并过滤图片URL
			if (!this.isImageUrl(url) && !links.some(link => link.url === url)) {
				links.push({
					url,
					originalMarkdown: url
				});
			}
		}

		return links;
	}

	/**
	 * 提取正文中的标签
	 */
	private extractContentTags(content: string): string[] {
		const tags: string[] = [];

		// 1. 提取标签行: **标签**: #tag1 #tag2
		const tagLineMatch = content.match(/\*\*标签\*\*:\s*(.+)/);
		if (tagLineMatch) {
			const tagMatches = tagLineMatch[1].matchAll(/#([\w\u4e00-\u9fa5_-]+)/g);
			for (const match of tagMatches) {
				tags.push(match[1]);
			}
		}

		// 2. 提取正文中的 Obsidian 标签: #tag
		// 移除 YAML Front Matter、代码块、标题行
		const cleanContent = content
			.replace(/^---\n[\s\S]*?\n---/m, '')  // 移除 YAML
			.replace(/```[\s\S]*?```/g, '')       // 移除代码块
			.replace(/^#{1,6}\s+.+$/gm, '');      // 移除标题行

		// 匹配 #tag 格式 (前面是空白或行首,后面是空白、标点或行尾)
		const obsidianTagMatches = cleanContent.matchAll(/(?:^|\s)#([\w\u4e00-\u9fa5_-]+)(?=\s|$|[,.:;!?，。：；！？])/gm);
		for (const match of obsidianTagMatches) {
			tags.push(match[1]);
		}

		// 去重并返回
		return Array.from(new Set(tags));
	}

	/**
	 * 提取元数据 (YAML front matter)
	 */
	private extractMetadata(content: string): ParsedMarkdown['metadata'] {
		const metadata: ParsedMarkdown['metadata'] = {};

		// 匹配 YAML front matter
		const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
		const match = content.match(frontMatterRegex);

		if (match) {
			const yamlContent = match[1];

			// 保存原始 YAML 内容
			metadata.rawYaml = yamlContent;

			// 提取标题
			const titleMatch = yamlContent.match(/title:\s*(.+)/);
			if (titleMatch) {
				metadata.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
			}

			// 提取标签 - 支持多种格式
			// 格式1: tags: [tag1, tag2]
			let tagsMatch = yamlContent.match(/tags:\s*\[([^\]]+)\]/);
			if (tagsMatch) {
				metadata.tags = tagsMatch[1].split(',').map(tag => tag.trim().replace(/^["']|["']$/g, ''));
			} else {
				// 格式2: tags:
				//   - tag1
				//   - tag2
				const tagsListMatch = yamlContent.match(/tags:\s*\n((?:\s*-\s*.+\n?)+)/);
				if (tagsListMatch) {
					metadata.tags = tagsListMatch[1]
						.split('\n')
						.filter(line => line.trim().startsWith('-'))
						.map(line => line.trim().substring(1).trim().replace(/^["']|["']$/g, ''));
				}
			}

			// 提取 created
			const createdMatch = yamlContent.match(/created:\s*(.+)/);
			if (createdMatch) {
				metadata.created = createdMatch[1].trim();
			}

			// 提取 modified
			const modifiedMatch = yamlContent.match(/modified:\s*(.+)/);
			if (modifiedMatch) {
				metadata.modified = modifiedMatch[1].trim();
			}

			// 提取 publish
			const publishMatch = yamlContent.match(/publish:\s*(.+)/);
			if (publishMatch) {
				metadata.publish = publishMatch[1].trim() === 'true';
			}

			// 提取 完成度
			const completionMatch = yamlContent.match(/完成度:\s*(\d+)/);
			if (completionMatch) {
				metadata.完成度 = parseInt(completionMatch[1]);
			}
		}

		// 如果没有 front matter 中的标题,尝试提取第一个标题
		if (!metadata.title) {
			const h1Match = content.match(/^#\s+(.+)$/m);
			if (h1Match) {
				metadata.title = h1Match[1].trim();
			}
		}

		// 提取正文中的标签并合并
		const contentTags = this.extractContentTags(content);
		if (metadata.tags && metadata.tags.length > 0) {
			// 合并 YAML 标签和正文标签,去重
			const allTags = [...metadata.tags, ...contentTags];
			metadata.tags = Array.from(new Set(allTags));
		} else if (contentTags.length > 0) {
			// 如果 YAML 没有标签,只使用正文标签
			metadata.tags = contentTags;
		}

		return metadata;
	}

	/**
	 * 移除图片和链接,只保留纯文本
	 */
	removeImagesAndLinks(content: string): string {
		// 移除图片
		let cleaned = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
		cleaned = cleaned.replace(/!\[\[([^\]]+)\]\]/g, '');

		// 保留链接文本,移除URL
		cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

		return cleaned;
	}
}
