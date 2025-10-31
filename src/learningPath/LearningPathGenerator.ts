import { App, Notice } from 'obsidian';
import NotebookLLMPlugin from '../main';
import {
	LearningPathConfig,
	LearningPathOutline,
	LearningPathFile,
	PathGenerationTask,
	DEFAULT_GENERATION_PARAMS,
	DEFAULT_FILE_OPTIONS,
	FILE_TYPE_LABELS
} from './types';

/**
 * AI 学习路径生成器
 */
export class LearningPathGenerator {
	private app: App;
	private plugin: NotebookLLMPlugin;

	constructor(app: App, plugin: NotebookLLMPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 生成学习路径大纲
	 */
	async generateOutline(config: LearningPathConfig): Promise<LearningPathOutline> {
		const prompt = this.buildOutlinePrompt(config);

		// 创建文本模型provider
		const { createTextProvider } = await import('../api/factory');
		const provider = createTextProvider(this.plugin.settings);

		try {
			const response = await provider.generateText(
				'你是一位经验丰富的教育专家，擅长设计结构化的学习路径和课程大纲。',
				prompt,
				{
					temperature: DEFAULT_GENERATION_PARAMS.temperature,
					maxTokens: DEFAULT_GENERATION_PARAMS.maxTokens,
					model: this.plugin.settings.textModel
				}
			);

			return this.parseOutlineResponse(response, config);
		} catch (error) {
			console.error('生成学习路径大纲失败:', error);
			throw new Error(`生成大纲失败: ${error.message}`);
		}
	}

	/**
	 * 生成单个文件内容
	 */
	async generateFileContent(
		file: LearningPathFile,
		outline: LearningPathOutline,
		config: LearningPathConfig
	): Promise<string> {
		const prompt = this.buildFileContentPrompt(file, outline, config);

		// 创建文本模型provider
		const { createTextProvider } = await import('../api/factory');
		const provider = createTextProvider(this.plugin.settings);

		try {
			const response = await provider.generateText(
				'你是一位专业的教育内容创作者，擅长编写高质量的学习材料。',
				prompt,
				{
					temperature: DEFAULT_GENERATION_PARAMS.temperature,
					maxTokens: DEFAULT_GENERATION_PARAMS.maxTokens,
					model: this.plugin.settings.textModel
				}
			);

			return this.parseFileContentResponse(response, file.type);
		} catch (error) {
			console.error(`生成文件内容失败 (${file.filename}):`, error);
			throw new Error(`生成 ${file.filename} 失败: ${error.message}`);
		}
	}

	/**
	 * 创建完整的学习路径
	 */
	async createLearningPath(
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
				// 生成文件内容
				file.content = await this.generateFileContent(file, outline, config);

				// 创建文件
				const filePath = `${targetDir}/${file.filename}`;
				await this.createMarkdownFile(filePath, file, outline, config);
				createdFiles.push(filePath);

			} catch (error) {
				console.error(`创建文件失败 (${file.filename}):`, error);
				throw new Error(`创建 ${file.filename} 失败: ${error.message}`);
			}
		}

		progressCallback?.(100, '完成');
		return createdFiles;
	}

	/**
	 * 构建大纲生成提示词
	 */
	private buildOutlinePrompt(config: LearningPathConfig): string {
		const depthDescriptions = {
			quick: '1-2小时快速入门，包含核心概念和基础应用',
			deep: '系统性深入学习，理论与实践并重，预计3-5天完成',
			project: '通过实际项目学习，包含完整的开发流程和实战练习'
		};

		return `请为以下学习目标生成一个结构化的学习路径大纲：

学习主题：${config.topic}
学习深度：${depthDescriptions[config.depth]}
背景知识：${config.background || '无特别背景'}

要求：
1. 设计一个合理的学习顺序，从基础到进阶
2. 包含学习指南（00_学习指南.md）
3. 根据学习深度调整内容数量和深度
4. 每个文件都有明确的学习目标
5. 包含练习和测验来巩固学习效果

输出格式（必须是有效的 JSON）：
\`\`\`json
{
  "title": "学习路径标题",
  "description": "路径描述，说明学习目标和收获",
  "files": [
    {
      "filename": "00_学习指南.md",
      "title": "学习指南",
      "type": "guide",
      "order": 0,
      "enabled": true
    },
    {
      "filename": "01_核心概念.md",
      "title": "核心概念",
      "type": "lesson",
      "order": 1,
      "enabled": true
    }
  ],
  "estimatedHours": 2
}
\`\`\`

文件类型说明：
- guide: 学习指南，说明如何使用这个学习路径
- lesson: 课程内容，讲解具体知识点
- practice: 练习题，帮助巩固理解
- quiz: 测验，检验学习效果

请生成学习路径大纲（JSON格式）：`;
	}

	/**
	 * 构建文件内容生成提示词
	 */
	private buildFileContentPrompt(
		file: LearningPathFile,
		outline: LearningPathOutline,
		config: LearningPathConfig
	): string {
		const typeInstructions = {
			guide: '编写一个详细的学习指南，包括：学习目标、前置要求、学习建议、时间安排、学习资源推荐',
			lesson: '编写课程内容，包括：概念解释、重要知识点、实例演示、常见问题、最佳实践',
			practice: '设计练习题，包括：基础练习、进阶挑战、实际应用场景，并提供详细答案和解析',
			quiz: '创建测验题目，包括：选择题、填空题、简答题，涵盖重要知识点，并附答案和评分标准'
		};

		return `请为学习路径生成具体的学习材料内容：

学习路径：${outline.title}
学习主题：${config.topic}
当前文件：${file.title} (${file.filename})
文件类型：${FILE_TYPE_LABELS[file.type]}

要求：
${typeInstructions[file.type]}

内容要求：
1. 使用清晰的层级结构（H1, H2, H3）
2. 语言简洁易懂，适合自学者
3. 包含具体的例子和代码（如果适用）
4. 适当使用图表和列表提高可读性
5. 内容长度控制在合理范围内

请直接输出 Markdown 格式的内容，不需要代码块包围：`;
	}

	/**
	 * 解析大纲响应
	 */
	private parseOutlineResponse(response: string, config: LearningPathConfig): LearningPathOutline {
		try {
			// 尝试提取 JSON 代码块
			const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
			let jsonStr = jsonMatch ? jsonMatch[1] : response;

			// 清理可能的 markdown 格式
			jsonStr = jsonStr.trim();

			// 解析 JSON
			const parsed = JSON.parse(jsonStr);

			// 验证格式
			if (!parsed.title || !parsed.files || !Array.isArray(parsed.files)) {
				throw new Error('响应格式无效：缺少 title 或 files 数组');
			}

			// 验证并处理每个文件
			parsed.files = parsed.files.map((file: any, index: number) => {
				if (!file.filename || !file.title || !file.type) {
					throw new Error(`文件 ${index + 1} 缺少必要字段`);
				}

				return {
					filename: file.filename,
					title: file.title,
					type: file.type,
					order: file.order || index,
					enabled: file.enabled !== false // 默认启用
				};
			});

			// 按order排序
			parsed.files.sort((a: LearningPathFile, b: LearningPathFile) => a.order - b.order);

			return {
				title: parsed.title,
				description: parsed.description || `学习${config.topic}的完整路径`,
				files: parsed.files,
				estimatedHours: parsed.estimatedHours || 2
			};

		} catch (error) {
			console.error('解析大纲响应失败:', error);
			throw new Error(`解析大纲失败: ${error.message}`);
		}
	}

	/**
	 * 解析文件内容响应
	 */
	private parseFileContentResponse(response: string, fileType: string): string {
		try {
			// 清理响应
			let content = response.trim();

			// 移除可能的代码块标记
			if (content.startsWith('```markdown')) {
				content = content.replace(/^```markdown\s*/, '').replace(/\s*```$/, '');
			} else if (content.startsWith('```')) {
				content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
			}

			// 确保内容不为空
			if (!content || content.length < 50) {
				throw new Error('生成的内容过短，可能生成失败');
			}

			return content;

		} catch (error) {
			console.error('解析文件内容响应失败:', error);
			throw new Error(`解析内容失败: ${error.message}`);
		}
	}

	/**
	 * 确保目录存在
	 */
	private async ensureDirectoryExists(dirPath: string): Promise<void> {
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
	private async createMarkdownFile(
		filePath: string,
		file: LearningPathFile,
		outline: LearningPathOutline,
		config: LearningPathConfig
	): Promise<void> {
		const frontmatter = this.buildFrontmatter(file, outline, config);
		const content = `${frontmatter}\n\n${file.content}`;

		await this.app.vault.create(filePath, content);
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
			tags: ['learning-path', config.topic, file.type]
		};

		const yamlString = Object.entries(metadata)
			.map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
			.join('\n');

		return `---\n${yamlString}\n---`;
	}

	/**
	 * 生成唯一ID
	 */
	private generateId(): string {
		return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}
}