import { App, TFile } from 'obsidian';
import { QuizQuestion, QuizQuestionResult, QuizResult, QuizData } from '../types';
import NotebookLLMPlugin from '../main';
import { formatNumber } from '../utils/format';

/**
 * Quiz结果文件生成器
 */
export class ResultGenerator {
	private app: App;
	private plugin: NotebookLLMPlugin;

	constructor(app: App, plugin: NotebookLLMPlugin) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 生成结果文件
	 */
	async generateResultFile(
		quizFile: TFile,
		quizData: QuizData,
		questionResults: QuizQuestionResult[]
	): Promise<TFile> {
		// 计算总分和统计
		const quizResult = this.calculateResult(quizData, questionResults);
		quizResult.quizFile = `[[${quizFile.basename}]]`;

		// 生成文件名
		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' +
			new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
		const fileName = `${quizFile.basename}_结果_${timestamp}.md`;

		// 确保结果目录存在
		const resultDir = this.plugin.settings.resultDir;
		await this.ensureDirectory(resultDir);

		const filePath = `${resultDir}/${fileName}`;

		// 生成Markdown内容
		const content = this.buildResultMarkdown(quizResult, quizData, questionResults);

		// 创建文件
		const resultFile = await this.app.vault.create(filePath, content);

		return resultFile;
	}

	/**
	 * 计算结果统计
	 */
	private calculateResult(
		quizData: QuizData,
		questionResults: QuizQuestionResult[]
	): QuizResult {
		let totalScore = 0;
		let maxScore = 0;

		// 按题型统计
		const typeStats = new Map<string, { score: number; max: number }>();

		for (const result of questionResults) {
			totalScore += result.score;
			maxScore += result.maxScore;

			// 找到对应题目的类型
			const question = quizData.questions.find(q => q.id === result.questionId);
			if (question) {
				const typeName = this.getQuestionTypeName(question.type);
				const stat = typeStats.get(typeName) || { score: 0, max: 0 };
				stat.score += result.score;
				stat.max += result.maxScore;
				typeStats.set(typeName, stat);
			}
		}

		// 构建题型得分对象
		const breakdown: Record<string, string> = {};
        typeStats.forEach((stat, typeName) => {
            breakdown[typeName] = `${formatNumber(stat.score)}/${formatNumber(stat.max, 0)}`;
        });

		// 分析薄弱和优势领域（简化版）
		const weakAreas: string[] = [];
		const strongAreas: string[] = [];

		questionResults.forEach(result => {
			const question = quizData.questions.find(q => q.id === result.questionId);
			if (question) {
				if (result.score === 0) {
					weakAreas.push(`${question.question.substring(0, 30)}...`);
				} else if (result.score === result.maxScore) {
					strongAreas.push(`${question.question.substring(0, 30)}...`);
				}
			}
		});

		return {
			quizFile: '',
			examDate: new Date().toISOString(),
			totalScore,
			maxScore,
			breakdown,
			weakAreas: weakAreas.slice(0, 5), // 最多5个
			strongAreas: strongAreas.slice(0, 5), // 最多5个
			details: questionResults
		};
	}

	/**
	 * 构建结果Markdown文件内容
	 */
	private buildResultMarkdown(
		result: QuizResult,
		quizData: QuizData,
		questionResults: QuizQuestionResult[]
	): string {
		const percentage = ((result.totalScore / result.maxScore) * 100).toFixed(1);
		const date = new Date(result.examDate);
		const dateStr = date.toLocaleString('zh-CN');

        let markdown = `---
quiz_file: "${result.quizFile}"
exam_date: ${result.examDate}
total_score: ${formatNumber(result.totalScore)}
max_score: ${formatNumber(result.maxScore, 0)}
percentage: ${percentage}
---

# 测验结果

## 基本信息

- **测验名称**: ${quizData.metadata.title}
- **考试时间**: ${dateStr}
- **总分**: ${formatNumber(result.totalScore)} / ${formatNumber(result.maxScore, 0)} (${percentage}%)

## 分数统计

`;

		// 各题型得分
		for (const [typeName, score] of Object.entries(result.breakdown)) {
			markdown += `- **${typeName}**: ${score}\n`;
		}

		// 薄弱环节
		if (result.weakAreas.length > 0) {
			markdown += `\n## 需要加强的知识点\n\n`;
			result.weakAreas.forEach((area, index) => {
				markdown += `${index + 1}. ${area}\n`;
			});
		}

		// 优势领域
		if (result.strongAreas.length > 0) {
			markdown += `\n## 掌握较好的知识点\n\n`;
			result.strongAreas.forEach((area, index) => {
				markdown += `${index + 1}. ${area}\n`;
			});
		}

		// 详细答题情况
		markdown += `\n## 详细答题情况\n\n`;

		questionResults.forEach((result, index) => {
			const question = quizData.questions.find(q => q.id === result.questionId);
			if (!question) return;

			const isCorrect = result.score === result.maxScore;
			const statusEmoji = isCorrect ? '✅' : '❌';

			markdown += `### 题目 ${index + 1} ${statusEmoji}\n\n`;
			markdown += `**题型**: ${this.getQuestionTypeName(question.type)} | `;
			markdown += `**难度**: ${question.difficulty} | `;
            markdown += `**得分**: ${formatNumber(result.score)}/${formatNumber(result.maxScore, 0)}\n\n`;
			markdown += `**题目**: ${question.question}\n\n`;

			// 选择题显示选项
			if (question.options && question.options.length > 0) {
				markdown += `**选项**:\n`;
				question.options.forEach(option => {
					markdown += `- ${option}\n`;
				});
				markdown += `\n`;
			}

			// 用户答案
			const userAnswerText = this.formatAnswer(result.userAnswer);
			markdown += `**你的答案**: ${userAnswerText}\n\n`;

			// 正确答案
			const correctAnswerText = this.formatAnswer(result.correctAnswer);
			markdown += `**正确答案**: ${correctAnswerText}\n\n`;

			// AI反馈
			if (result.feedback) {
				markdown += `**评语**: ${result.feedback}\n\n`;
			}

			// 题目解析
			if (question.explanation) {
				markdown += `**解析**: ${question.explanation}\n\n`;
			}

			markdown += `---\n\n`;
		});

		return markdown;
	}

	/**
	 * 格式化答案显示
	 */
	private formatAnswer(answer: string | string[]): string {
		if (Array.isArray(answer)) {
			return answer.join(', ');
		}
		return answer || '(未作答)';
	}

	/**
	 * 获取题目类型名称
	 */
	private getQuestionTypeName(type: string): string {
		const names: Record<string, string> = {
			'single-choice': '单选题',
			'multiple-choice': '多选题',
			'fill-blank': '填空题',
			'short-answer': '简答题'
		};
		return names[type] || '未知';
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
