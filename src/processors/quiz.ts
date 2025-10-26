import { TFile, App } from 'obsidian';
import { QuizQuestion, QuizData, QuizMetadata } from '../types';

/**
 * Quiz文件解析器
 */
export class QuizParser {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 解析Quiz文件
	 */
	async parseQuizFile(file: TFile): Promise<QuizData | null> {
		try {
			const content = await this.app.vault.read(file);

			// 解析YAML Front Matter
			const cache = this.app.metadataCache.getFileCache(file);
			const frontmatter = cache?.frontmatter;

			if (!frontmatter) {
				console.error('Quiz文件缺少YAML Front Matter');
				return null;
			}

			// 构建元信息
			const metadata: QuizMetadata = {
				title: frontmatter.title || file.basename,
				sourceFile: frontmatter.source_file || '',
				difficulty: frontmatter.difficulty || '中等',
				totalQuestions: frontmatter.total_questions || 0,
				questionTypes: frontmatter.question_types || [],
				quizResults: frontmatter.quiz_results || [],
				created: frontmatter.created || ''
			};

			// 提取简介（YAML后、第一个quiz-question代码块前的内容）
			const yamlEndMatch = content.match(/^---\n[\s\S]*?\n---\n/);
			const yamlEnd = yamlEndMatch ? yamlEndMatch[0].length : 0;
			const firstQuestionMatch = content.indexOf('```quiz-question', yamlEnd);

			let description = '';
			if (firstQuestionMatch > yamlEnd) {
				description = content
					.substring(yamlEnd, firstQuestionMatch)
					.replace(/^#+\s+.+$/gm, '')  // 移除标题
					.trim();
			}

			// 解析题目
			const questions = this.parseQuestions(content);

			return {
				metadata,
				description,
				questions
			};
		} catch (error) {
			console.error('解析Quiz文件失败:', error);
			return null;
		}
	}

	/**
	 * 解析题目代码块
	 */
	private parseQuestions(content: string): QuizQuestion[] {
		const questions: QuizQuestion[] = [];

		// 匹配所有 ```quiz-question ... ``` 代码块
		const questionBlockRegex = /```quiz-question\n([\s\S]*?)\n```/g;
		let match;

		while ((match = questionBlockRegex.exec(content)) !== null) {
			const blockContent = match[1];
			const question = this.parseQuestionBlock(blockContent);
			if (question) {
				questions.push(question);
			}
		}

		return questions;
	}

	/**
	 * 解析单个题目块
	 */
	private parseQuestionBlock(blockContent: string): QuizQuestion | null {
		try {
			// 解析YAML格式的题目内容
			const lines = blockContent.split('\n');
			const data: any = {};
			let currentKey = '';
			let currentValue: any = '';
			let inArray = false;
			let arrayItems: string[] = [];

			for (const line of lines) {
				const trimmed = line.trim();

				if (!trimmed) continue;

				// 数组项
				if (trimmed.startsWith('- ')) {
					if (inArray) {
						arrayItems.push(trimmed.substring(2).trim());
					}
					continue;
				}

				// 键值对
				const colonIndex = trimmed.indexOf(':');
				if (colonIndex > 0) {
					// 保存之前的值
					if (currentKey) {
						data[currentKey] = inArray ? arrayItems : currentValue;
					}

					// 开始新键
					currentKey = trimmed.substring(0, colonIndex).trim();
					currentValue = trimmed.substring(colonIndex + 1).trim();

					// 检查是否是数组开始
					if (currentKey === 'options' || currentKey === 'answer') {
						if (!currentValue) {
							inArray = true;
							arrayItems = [];
						} else {
							inArray = false;
						}
					} else {
						inArray = false;
					}
				}
			}

			// 保存最后一个键
			if (currentKey) {
				data[currentKey] = inArray ? arrayItems : currentValue;
			}

			// 构建QuizQuestion对象
			const question: QuizQuestion = {
				id: data.id || '',
				type: data.type || 'single-choice',
				difficulty: data.difficulty || '中等',
				question: data.question || '',
				options: data.options,
				answer: data.answer,
				explanation: data.explanation || ''
			};

			return question;
		} catch (error) {
			console.error('解析题目块失败:', error);
			return null;
		}
	}
}
