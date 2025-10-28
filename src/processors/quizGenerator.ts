import { App, TFile } from 'obsidian';
import { QuizQuestion, QuestionType, QuestionDifficulty } from '../types';
import { UnifiedAIProvider } from '../api/unified';
import NotebookLLMPlugin from '../main';

/**
 * Quiz生成器配置
 */
export interface QuizGeneratorOptions {
	difficulty?: QuestionDifficulty;
	totalQuestions?: number;
	questionTypes?: QuestionType[];
}

/**
 * Quiz生成器
 */
export class QuizGenerator {
	private app: App;
	private plugin: NotebookLLMPlugin;

	constructor(app: App, plugin: NotebookLLMPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 获取AI Provider实例
	 */
	private getAIProvider(): UnifiedAIProvider {
		const settings = this.plugin.settings;
		const provider = settings.textProvider;
		const config = settings.providers[provider];
		return new UnifiedAIProvider(provider, config.apiKey, config.baseUrl);
	}

	/**
	 * 从文档生成Quiz
	 */
	async generateQuizFromFile(
		sourceFile: TFile,
		options: QuizGeneratorOptions = {},
		onProgress?: (percent: number, status: string) => void
	): Promise<TFile> {
		const {
			difficulty = '中等',
			totalQuestions = 10,
			questionTypes = ['single-choice', 'multiple-choice', 'fill-blank', 'short-answer']
		} = options;

		// 读取源文件内容
		onProgress?.(5, '正在读取文档内容...');
		const content = await this.app.vault.read(sourceFile);

		// 移除YAML Front Matter
		const textContent = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

		// 构建生成提示词
		onProgress?.(15, '正在分析文档结构...');
		const prompt = this.buildGenerationPrompt(
			textContent,
			sourceFile.basename,
			difficulty,
			totalQuestions,
			questionTypes
		);

		// 调用AI生成题目
		onProgress?.(25, '正在通过AI生成试题...');
		const aiProvider = this.getAIProvider();
		const response = await aiProvider.generateText(
			'你是一个专业的教育工作者，擅长根据学习材料生成高质量的测验题目。',
			prompt,
			{
				temperature: 0.7,
				maxTokens: 8000,
				model: this.plugin.settings.textModel
			}
		);

		// 解析AI生成的题目
		onProgress?.(75, '正在解析生成的试题...');
		const questions = this.parseGeneratedQuestions(response);

		if (questions.length === 0) {
			throw new Error('AI未能生成有效的题目');
		}

		// 生成Quiz文件
		onProgress?.(85, '正在创建试题文件...');
		const quizFile = await this.createQuizFile(
			sourceFile,
			questions,
			difficulty,
			questionTypes
		);

		// 更新源文件的quiz_files字段
		onProgress?.(95, '正在更新源文件记录...');
		await this.updateSourceFileQuizzes(sourceFile, quizFile);

		onProgress?.(100, '试题生成完成！');
		return quizFile;
	}

	/**
	 * 构建生成提示词
	 */
	private buildGenerationPrompt(
		content: string,
		sourceName: string,
		difficulty: QuestionDifficulty,
		totalQuestions: number,
		questionTypes: QuestionType[]
	): string {
		const typeDescriptions = {
			'single-choice': '单选题（提供4个选项，只有1个正确答案）',
			'multiple-choice': '多选题（提供4-5个选项，有2-3个正确答案）',
			'fill-blank': '填空题（一个简短的答案，通常是关键词或短语）',
			'short-answer': '简答题（需要用1-3句话回答的问题）'
		};

		const typesDesc = questionTypes.map(t => typeDescriptions[t]).join('\n- ');
		const questionsPerType = Math.ceil(totalQuestions / questionTypes.length);

		return `请仔细阅读并完全理解文章的核心观点、关键信息、重要术语、论证逻辑和支撑细节。根据学习材料生成${totalQuestions}道测验题目。

**学习材料**：《${sourceName}》
${content.substring(0, 6000)}${content.length > 6000 ? '\n...(内容过长已截断)' : ''}

**要求**：
1. 难度等级：${difficulty}
2. 总题数：${totalQuestions}题
3. 题型分布（每种题型约${questionsPerType}题）：
- ${typesDesc}

4. 题目要求：
   - 覆盖材料的核心知识点
   - 题目表述清晰准确
   - 选择题的干扰项要有一定迷惑性, 应考察对基本概念和关键信息的准确记忆.
   - 填空题:应针对文章中的核心定义、关键短语或重要数据进行设问
   - 简答题: 题目应考察深层次的理解、分析、归纳或应用能力，要求用自己的话进行解释或论述，而不仅仅是复制原文。
   - 答案准确无误
   - 提供详细的解析说明

**输出格式**：
请严格按照以下JSON格式输出：

\`\`\`json
{
  "questions": [
    {
      "id": "q1",
      "type": "single-choice",
      "difficulty": "中等",
      "question": "题目内容？",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "answer": "A",
      "explanation": "解析内容"
    },
    {
      "id": "q2",
      "type": "multiple-choice",
      "difficulty": "中等",
      "question": "题目内容？",
      "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
      "answer": ["A", "C"],
      "explanation": "解析内容"
    },
    {
      "id": "q3",
      "type": "fill-blank",
      "difficulty": "简单",
      "question": "题目内容？",
      "answer": "答案",
      "explanation": "解析内容"
    },
    {
      "id": "q4",
      "type": "short-answer",
      "difficulty": "困难",
      "question": "题目内容？",
      "answer": "参考答案（1-3句话）",
      "explanation": "解析内容"
    }
  ]
}
\`\`\`

注意：
- id格式为 q1, q2, q3...
- type必须是: single-choice, multiple-choice, fill-blank, short-answer 之一
- difficulty必须是: 简单, 中等, 困难 之一
- **选项格式必须严格遵守 "字母. 内容" 格式（如 "A. 配置文件"）**
- **字母后必须是英文句点和一个空格，然后是选项内容**
- 单选题和多选题必须有options字段
- **单选题的answer是单个字母（如 "A"，不要带句点和内容）**
- **多选题的answer是字母数组（如 ["A", "C"]，不要带句点和内容）**
- 填空题和简答题不需要options字段
- **题目顺序: 请按照 “单选题 -> 多选题 -> 填空题 -> 简答题” 的顺序组织试卷结构。**
`;
	}

	/**
	 * 解析AI生成的题目
	 */
	private parseGeneratedQuestions(aiResponse: string): QuizQuestion[] {
		const questions: QuizQuestion[] = [];

		try {
			// 提取JSON代码块
			const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
			if (!jsonMatch) {
				console.error('AI响应中未找到JSON代码块');
				return [];
			}

			const parsedData = JSON.parse(jsonMatch[1]);
			const rawQuestions = parsedData.questions;

			if (!Array.isArray(rawQuestions)) {
				console.error('解析的数据中没有questions数组');
				return [];
			}

			// 验证并转换每个题目
			for (const raw of rawQuestions) {
				if (!raw.id || !raw.type || !raw.question || !raw.answer) {
					console.warn('跳过不完整的题目:', raw);
					continue;
				}

				const question: QuizQuestion = {
					id: raw.id,
					type: raw.type,
					difficulty: raw.difficulty || '中等',
					question: raw.question,
					answer: raw.answer,
					explanation: raw.explanation || ''
				};

				// 如果是选择题，添加选项
				if (raw.type === 'single-choice' || raw.type === 'multiple-choice') {
					if (Array.isArray(raw.options) && raw.options.length > 0) {
						question.options = raw.options;
					} else {
						console.warn('选择题缺少选项:', raw);
						continue;
					}
				}

				questions.push(question);
			}
		} catch (error) {
			console.error('解析AI生成的题目失败:', error);
		}

		return questions;
	}

	/**
	 * 创建Quiz文件
	 */
	private async createQuizFile(
		sourceFile: TFile,
		questions: QuizQuestion[],
		difficulty: QuestionDifficulty,
		questionTypes: QuestionType[]
	): Promise<TFile> {
		// 确保quiz目录存在
		const quizDir = this.plugin.settings.quizDir;
		await this.ensureDirectory(quizDir);

		// 生成唯一文件名（包含时间戳和序号）
		const now = new Date();
		const dateStr = now.toISOString().split('T')[0];  // 2025-10-26
		const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');  // 14-30-45

		let fileName = '';
		let filePath = '';
		let sequenceNum = 1;

		// 检查文件是否已存在，如果存在则增加序号
		while (true) {
			fileName = `${sourceFile.basename}_Quiz_${dateStr}_${timeStr}_${sequenceNum}.md`;
			filePath = `${quizDir}/${fileName}`;

			const exists = await this.app.vault.adapter.exists(filePath);
			if (!exists) {
				break;
			}
			sequenceNum++;
		}

		// 统计题型
		const typeStats = this.calculateTypeStats(questions);

		// 生成文件内容
		const content = this.buildQuizFileContent(
			sourceFile,
			questions,
			difficulty,
			typeStats
		);

		// 创建文件
		const quizFile = await this.app.vault.create(filePath, content);

		return quizFile;
	}

	/**
	 * 统计题型分布
	 */
	private calculateTypeStats(questions: QuizQuestion[]): Array<{ type: string; count: number }> {
		const typeMap = new Map<string, number>();

		for (const question of questions) {
			const count = typeMap.get(question.type) || 0;
			typeMap.set(question.type, count + 1);
		}

		const stats: Array<{ type: string; count: number }> = [];
		typeMap.forEach((count, type) => {
			stats.push({ type, count });
		});

		return stats;
	}

	/**
	 * 构建Quiz文件内容
	 */
	private buildQuizFileContent(
		sourceFile: TFile,
		questions: QuizQuestion[],
		difficulty: QuestionDifficulty,
		typeStats: Array<{ type: string; count: number }>
	): string {
		const now = new Date().toISOString();
		const typeStatsYaml = typeStats.map(s => `  - type: ${s.type}\n    count: ${s.count}`).join('\n');

		let content = `---
title: ${sourceFile.basename} - 知识测验
source_file: [[${sourceFile.basename}]]
difficulty: ${difficulty}
total_questions: ${questions.length}
question_types:
${typeStatsYaml}
quiz_results: []
created: ${now}
---

# ${sourceFile.basename} - 知识测验

本测验基于《${sourceFile.basename}》生成，共${questions.length}题，难度：${difficulty}。

`;

		// 添加每个题目
		questions.forEach((question, index) => {
			content += `## 题目 ${index + 1}\n\n`;
			content += this.formatQuestionBlock(question);
			content += '\n';
		});

		return content;
	}

	/**
	 * 格式化题目代码块
	 */
	private formatQuestionBlock(question: QuizQuestion): string {
		let block = '```quiz-question\n';
		block += `id: ${question.id}\n`;
		block += `type: ${question.type}\n`;
		block += `difficulty: ${question.difficulty}\n`;
		block += `question: ${question.question}\n`;

		// 选项
		if (question.options && question.options.length > 0) {
			block += 'options:\n';
			question.options.forEach(option => {
				block += `  - ${option}\n`;
			});
		}

		// 答案
		if (Array.isArray(question.answer)) {
			block += 'answer:\n';
			question.answer.forEach(ans => {
				block += `  - ${ans}\n`;
			});
		} else {
			block += `answer: ${question.answer}\n`;
		}

		// 解析
		if (question.explanation) {
			block += `explanation: ${question.explanation}\n`;
		}

		block += '```';

		return block;
	}

	/**
	 * 更新源文件的quiz_files字段
	 */
	private async updateSourceFileQuizzes(sourceFile: TFile, quizFile: TFile): Promise<void> {
		try {
			const content = await this.app.vault.read(sourceFile);
			const quizLink = `"[[${quizFile.basename}]]"`;  // 添加引号

			// 解析YAML
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			if (!yamlMatch) {
				// 如果没有YAML，添加一个
				const newYaml = `---\nquiz_files:\n  - ${quizLink}\n---\n\n`;
				const newContent = newYaml + content;
				await this.app.vault.modify(sourceFile, newContent);
				return;
			}

			let yamlContent = yamlMatch[1];

			// 检查是否已有quiz_files字段
			if (yamlContent.includes('quiz_files:')) {
				// 找到quiz_files行
				const lines = yamlContent.split('\n');
				let quizFilesIndex = -1;
				let insertIndex = -1;

				for (let i = 0; i < lines.length; i++) {
					if (lines[i].trim().startsWith('quiz_files:')) {
						quizFilesIndex = i;
						// 找到下一个不是列表项的行
						for (let j = i + 1; j < lines.length; j++) {
							if (!lines[j].trim().startsWith('-')) {
								insertIndex = j;
								break;
							}
						}
						if (insertIndex === -1) {
							insertIndex = lines.length;
						}
						break;
					}
				}

				if (quizFilesIndex !== -1) {
					// 插入新的quiz链接
					lines.splice(insertIndex, 0, `  - ${quizLink}`);
					yamlContent = lines.join('\n');
				}
			} else {
				// 添加新字段
				yamlContent = yamlContent.trimEnd() + `\nquiz_files:\n  - ${quizLink}`;
			}

			const newContent = content.replace(yamlMatch[0], `---\n${yamlContent}\n---`);
			await this.app.vault.modify(sourceFile, newContent);
		} catch (error) {
			console.error('更新源文件失败:', error);
		}
	}

	/**
	 * 确保目录存在
	 */
	private async ensureDirectory(dirPath: string): Promise<void> {
		const parts = dirPath.split('/');
		let currentPath = '';

		for (const part of parts) {
			if (!part) continue;
			currentPath = currentPath ? `${currentPath}/${part}` : part;

			const exists = await this.app.vault.adapter.exists(currentPath);
			if (!exists) {
				await this.app.vault.createFolder(currentPath);
			}
		}
	}
}
