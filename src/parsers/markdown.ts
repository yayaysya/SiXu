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
	 * 提取元数据 (YAML front matter)
	 */
	private extractMetadata(content: string): { title?: string; tags?: string[] } {
		const metadata: { title?: string; tags?: string[] } = {};

		// 匹配 YAML front matter
		const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
		const match = content.match(frontMatterRegex);

		if (match) {
			const yamlContent = match[1];

			// 提取标题
			const titleMatch = yamlContent.match(/title:\s*(.+)/);
			if (titleMatch) {
				metadata.title = titleMatch[1].trim().replace(/^["']|["']$/g, '');
			}

			// 提取标签
			const tagsMatch = yamlContent.match(/tags:\s*\[([^\]]+)\]/);
			if (tagsMatch) {
				metadata.tags = tagsMatch[1].split(',').map(tag => tag.trim());
			}
		}

		// 如果没有 front matter 中的标题,尝试提取第一个标题
		if (!metadata.title) {
			const h1Match = content.match(/^#\s+(.+)$/m);
			if (h1Match) {
				metadata.title = h1Match[1].trim();
			}
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
