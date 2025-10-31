import { App, TFile, Notice } from 'obsidian';
import { LearningPathConfig, LearningPathOutline, LearningPathFile, LearningPathMetadata } from './types';

/**
 * 学习路径存储管理器
 */
export class LearningPathStorage {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 确保目标目录存在
	 */
	async ensureDirectoryExists(dirPath: string): Promise<void> {
		const normalizedPath = dirPath.replace(/\\/g, '/');
		const parts = normalizedPath.split('/').filter(part => part);

		let currentPath = '';
		for (const part of parts) {
			currentPath += (currentPath ? '/' : '') + part;

			if (!await this.app.vault.adapter.exists(currentPath)) {
				await this.app.vault.adapter.mkdir(currentPath);
			}
		}
	}

	/**
	 * 创建Markdown文件
	 */
	async createMarkdownFile(
		filePath: string,
		file: LearningPathFile,
		outline: LearningPathOutline,
		config: LearningPathConfig
	): Promise<TFile> {
		// 构建frontmatter
		const frontmatter = this.buildFrontmatter(file, outline, config);
		const content = `${frontmatter}\n\n${file.content || ''}`;

		// 检查文件是否已存在
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			// 生成唯一文件名
			const uniquePath = await this.generateUniqueFilePath(filePath);
			return await this.app.vault.create(uniquePath, content);
		}

		return await this.app.vault.create(filePath, content);
	}

	/**
	 * 批量创建学习路径文件
	 */
	async createLearningPathFiles(
		outline: LearningPathOutline,
		config: LearningPathConfig,
		progressCallback?: (progress: number, currentFile: string) => void
	): Promise<string[]> {
		const enabledFiles = outline.files.filter(f => f.enabled);
		const totalFiles = enabledFiles.length;
		const createdFiles: string[] = [];

		// 确保目标目录存在
		const targetDir = `${config.targetDirectory}/${outline.title}`;
		await this.ensureDirectoryExists(targetDir);

		for (let i = 0; i < totalFiles; i++) {
			const file = enabledFiles[i];
			const progress = Math.round((i / totalFiles) * 100);

			progressCallback?.(progress, file.title);

			try {
				// 创建文件
				const filePath = `${targetDir}/${file.filename}`;
				const createdFile = await this.createMarkdownFile(filePath, file, outline, config);
				createdFiles.push(createdFile.path);

			} catch (error) {
				console.error(`创建文件失败 (${file.filename}):`, error);
				throw new Error(`创建 ${file.filename} 失败: ${error.message}`);
			}
		}

		// 创建元数据文件
		await this.createMetadataFile(targetDir, outline, config);

		progressCallback?.(100, '完成');
		return createdFiles;
	}

	/**
	 * 创建学习路径元数据文件
	 */
	private async createMetadataFile(
		targetDir: string,
		outline: LearningPathOutline,
		config: LearningPathConfig
	): Promise<void> {
		const metadata: LearningPathMetadata = {
			title: outline.title,
			topic: config.topic,
			depth: config.depth,
			created: new Date().toISOString().split('T')[0],
			modified: new Date().toISOString().split('T')[0],
			totalFiles: outline.files.filter(f => f.enabled).length,
			estimatedHours: outline.estimatedHours,
			directory: targetDir
		};

		const metadataContent = `---
title: "${metadata.title}"
topic: "${metadata.topic}"
depth: "${metadata.depth}"
created: "${metadata.created}"
modified: "${metadata.modified}"
totalFiles: ${metadata.totalFiles}
estimatedHours: ${metadata.estimatedHours}
directory: "${metadata.directory}"
type: "learning-path-metadata"
tags: ["learning-path", "metadata"]
---

# ${metadata.title}

## 概述

这是一个由AI生成的学习路径，专注于 **${metadata.topic}**。

- **学习深度**: ${metadata.depth}
- **预计时长**: ${metadata.estimatedHours} 小时
- **文件数量**: ${metadata.totalFiles} 个
- **创建日期**: ${metadata.created}

## 学习建议

1. **按顺序学习**: 建议按照文件编号顺序进行学习
2. **理论与实践结合**: 在学习理论的同时，多进行实践练习
3. **定期复习**: 使用闪卡功能定期复习重要概念
4. **记录笔记**: 在学习过程中记录自己的理解和疑问

## 文件列表

${outline.files.filter(f => f.enabled).map(file =>
	`- [${file.filename}](${file.filename}) - ${file.title}`
).join('\n')}

---

*此路径由思序(Notebook LLM)插件自动生成*
`;

		const metadataPath = `${targetDir}/_metadata.md`;
		await this.app.vault.create(metadataPath, metadataContent);
	}

	/**
	 * 生成唯一文件路径（处理文件名冲突）
	 */
	private async generateUniqueFilePath(originalPath: string): Promise<string> {
		const parsedPath = this.parseFilePath(originalPath);
		let counter = 1;
		let uniquePath = originalPath;

		while (await this.app.vault.adapter.exists(uniquePath)) {
			uniquePath = `${parsedPath.directory}/${parsedPath.basename}_${counter}.${parsedPath.extension}`;
			counter++;
		}

		return uniquePath;
	}

	/**
	 * 解析文件路径
	 */
	private parseFilePath(filePath: string): {
		directory: string;
		basename: string;
		extension: string;
	} {
		const normalizedPath = filePath.replace(/\\/g, '/');
		const lastSlashIndex = normalizedPath.lastIndexOf('/');
		const lastDotIndex = normalizedPath.lastIndexOf('.');

		const directory = lastSlashIndex >= 0 ? normalizedPath.substring(0, lastSlashIndex) : '';
		const basename = lastDotIndex > lastSlashIndex ?
			normalizedPath.substring(lastSlashIndex + 1, lastDotIndex) :
			normalizedPath.substring(lastSlashIndex + 1);
		const extension = lastDotIndex > lastSlashIndex ?
			normalizedPath.substring(lastDotIndex + 1) : '';

		return { directory, basename, extension };
	}

	/**
	 * 构建frontmatter
	 */
	private buildFrontmatter(
		file: LearningPathFile,
		outline: LearningPathOutline,
		config: LearningPathConfig
	): string {
		const metadata = {
			title: file.title,
			path_topic: outline.title,
			order: file.order,
			type: file.type,
			created: new Date().toISOString().split('T')[0],
			depth: config.depth,
			topic: config.topic,
			tags: ['learning-path', config.topic, file.type],
			estimated_hours: outline.estimatedHours,
			path_title: outline.title
		};

		const yamlString = Object.entries(metadata)
			.map(([key, value]) => {
				if (Array.isArray(value)) {
					return `${key}: [${value.map(v => `"${v}"`).join(', ')}]`;
				}
				return `${key}: ${typeof value === 'string' ? `"${value}"` : value}`;
			})
			.join('\n');

		return `---\n${yamlString}\n---`;
	}

	/**
	 * 读取学习路径元数据
	 */
	async readPathMetadata(metadataPath: string): Promise<LearningPathMetadata | null> {
		try {
			const file = this.app.vault.getAbstractFileByPath(metadataPath);
			if (!(file instanceof TFile)) {
				return null;
			}

			const content = await this.app.vault.read(file);

			// 简单解析frontmatter（实际项目中可能需要使用专门的YAML解析库）
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!frontmatterMatch) {
				return null;
			}

			const frontmatter = frontmatterMatch[1];
			const metadata: Partial<LearningPathMetadata> = {};

			// 解析YAML字段
			frontmatter.split('\n').forEach(line => {
				const match = line.match(/^(\w+):\s*(.+)$/);
				if (match) {
					const [, key, value] = match;
					// 移除引号
					const cleanValue = value.replace(/^["']|["']$/g, '');
					(metadata as any)[key] = cleanValue;
				}
			});

			return metadata as LearningPathMetadata;

		} catch (error) {
			console.error('读取学习路径元数据失败:', error);
			return null;
		}
	}

	/**
	 * 列出所有学习路径
	 */
	async listLearningPaths(baseDirectory: string = 'LearningPaths'): Promise<LearningPathMetadata[]> {
		const paths: LearningPathMetadata[] = [];

		try {
			// 检查基础目录是否存在
			if (!await this.app.vault.adapter.exists(baseDirectory)) {
				return paths;
			}

			// 遍历所有子目录
			const subdirectories = await this.getSubdirectories(baseDirectory);

			for (const subdir of subdirectories) {
				const metadataPath = `${baseDirectory}/${subdir}/_metadata.md`;
				const metadata = await this.readPathMetadata(metadataPath);
				if (metadata) {
					paths.push(metadata);
				}
			}

			// 按创建时间排序
			paths.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());

		} catch (error) {
			console.error('列出学习路径失败:', error);
		}

		return paths;
	}

	/**
	 * 获取子目录列表
	 */
	private async getSubdirectories(directory: string): Promise<string[]> {
		const subdirs: string[] = [];

		try {
			const files = await this.app.vault.adapter.list(directory);

			for (const file of files.folders) {
				const normalizedPath = file.replace(directory + '/', '');
				if (normalizedPath && !normalizedPath.startsWith('.')) {
					subdirs.push(normalizedPath);
				}
			}

		} catch (error) {
			console.error('获取子目录失败:', error);
		}

		return subdirs;
	}

	/**
	 * 删除学习路径
	 */
	async deleteLearningPath(pathDirectory: string): Promise<void> {
		try {
			if (await this.app.vault.adapter.exists(pathDirectory)) {
				await this.app.vault.adapter.rmdir(pathDirectory, true);
				new Notice('学习路径已删除');
			}
		} catch (error) {
			console.error('删除学习路径失败:', error);
			new Notice('删除失败');
		}
	}

	/**
	 * 验证文件路径的有效性
	 */
	validateFilePath(filePath: string): boolean {
		// 检查是否包含非法字符
		const invalidChars = /[<>:"|?*]/;
		if (invalidChars.test(filePath)) {
			return false;
		}

		// 检查是否为绝对路径
		if (filePath.startsWith('/') || /^[A-Za-z]:/.test(filePath)) {
			return false;
		}

		// 检查长度
		if (filePath.length > 255) {
			return false;
		}

		return true;
	}
}