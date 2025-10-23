import { ImageInfo } from '../types';
import { UnifiedAIProvider } from '../api/unified';

/**
 * 图片处理器
 */
export class ImageProcessor {
	private provider: UnifiedAIProvider;
	private visionModel?: string;

	constructor(provider: UnifiedAIProvider, visionModel?: string) {
		this.provider = provider;
		this.visionModel = visionModel;
	}

	/**
	 * 处理单张图片
	 */
	async processImage(image: ImageInfo): Promise<ImageInfo> {
		try {
			const description = await this.provider.recognizeImage(
				image.path,
				'请简洁描述这张图片的内容,用一两句话概括关键信息。',
				this.visionModel
			);

			return {
				...image,
				description
			};
		} catch (error) {
			console.error(`图片识别失败 (${image.path}):`, error);
			return {
				...image,
				description: image.alt || '图片加载失败'
			};
		}
	}

	/**
	 * 批量处理图片
	 */
	async processImages(
		images: ImageInfo[],
		onProgress?: (completed: number, total: number) => void
	): Promise<ImageInfo[]> {
		const results: ImageInfo[] = [];

		for (let i = 0; i < images.length; i++) {
			const result = await this.processImage(images[i]);
			results.push(result);
			onProgress?.(i + 1, images.length);
		}

		return results;
	}

	/**
	 * 获取图片描述摘要(用于传给文本生成模型)
	 */
	getImageSummaries(images: ImageInfo[]): string[] {
		return images.map((img, index) => {
			const desc = img.description || img.alt || '无描述';
			return `${desc} (原始路径: ${img.originalMarkdown})`;
		});
	}
}
