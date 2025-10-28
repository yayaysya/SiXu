import { App } from 'obsidian';
import { QuizQuestion, QuizQuestionResult } from '../types';
import { UnifiedAIProvider } from '../api/unified';
import NotebookLLMPlugin from '../main';

/**
 * Quiz评分处理器
 */
export class QuizGrader {
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
		const config = settings.providers.text[provider];
		return new UnifiedAIProvider(provider, config.apiKey, config.baseUrl);
	}

	/**
	 * 评分所有题目
	 */
	async gradeQuiz(
		questions: QuizQuestion[],
		userAnswers: Map<string, string | string[]>,
		onProgress?: (percent: number, status: string) => void
	): Promise<QuizQuestionResult[]> {
		const results: QuizQuestionResult[] = [];

		// 分离客观题和主观题
		onProgress?.(5, '正在分析题目类型...');
		const objectiveQuestions: QuizQuestion[] = [];
		const subjectiveQuestions: QuizQuestion[] = [];

		for (const question of questions) {
			if (question.type === 'single-choice' || question.type === 'multiple-choice') {
				objectiveQuestions.push(question);
			} else {
				subjectiveQuestions.push(question);
			}
		}

		// 评分客观题（本地评分）
		onProgress?.(15, `正在评分${objectiveQuestions.length}道客观题...`);
		for (const question of objectiveQuestions) {
			const result = this.gradeObjectiveQuestion(question, userAnswers.get(question.id));
			results.push(result);
		}

		// 评分主观题（AI评分）
		if (subjectiveQuestions.length > 0) {
			onProgress?.(40, `正在通过AI评分${subjectiveQuestions.length}道主观题...`);
			const aiResults = await this.gradeSubjectiveQuestions(
				subjectiveQuestions,
				userAnswers
			);
			results.push(...aiResults);
		}

		onProgress?.(100, '评分完成！');
		return results;
	}

	/**
	 * 评分客观题（单选、多选）
	 */
	private gradeObjectiveQuestion(
		question: QuizQuestion,
		userAnswer: string | string[] | undefined
	): QuizQuestionResult {
		const correctAnswer = question.answer;
		let score = 0;
		const maxScore = 1;

		// 未作答
		if (!userAnswer) {
			return {
				questionId: question.id,
				userAnswer: userAnswer || '',
				correctAnswer,
				score: 0,
				maxScore
			};
		}

		// 单选题
		if (question.type === 'single-choice') {
			if (userAnswer === correctAnswer) {
				score = maxScore;
			}
		}

		// 多选题
		if (question.type === 'multiple-choice') {
			const userSet = new Set(Array.isArray(userAnswer) ? userAnswer : [userAnswer]);
			const correctSet = new Set(Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer]);

			// 完全正确才得分
			if (this.setsEqual(userSet, correctSet)) {
				score = maxScore;
			}
		}

		return {
			questionId: question.id,
			userAnswer,
			correctAnswer,
			score,
			maxScore
		};
	}

	/**
	 * AI评分主观题（填空、简答）
	 */
	private async gradeSubjectiveQuestions(
		questions: QuizQuestion[],
		userAnswers: Map<string, string | string[]>
	): Promise<QuizQuestionResult[]> {
		const results: QuizQuestionResult[] = [];

		// 批量构建评分请求
		const gradingPrompts: string[] = [];

		for (const question of questions) {
			const userAnswer = userAnswers.get(question.id);
			if (!userAnswer) {
				// 未作答
				results.push({
					questionId: question.id,
					userAnswer: '',
					correctAnswer: question.answer,
					score: 0,
					maxScore: 1,
					feedback: '未作答'
				});
				continue;
			}

			// 构建单题评分提示词
			const prompt = this.buildGradingPrompt(question, userAnswer);
			gradingPrompts.push(prompt);
		}

		// 批量请求AI评分
		if (gradingPrompts.length > 0) {
			const batchPrompt = this.buildBatchGradingPrompt(questions, userAnswers);

			try {
				const aiProvider = this.getAIProvider();
				const response = await aiProvider.generateText(
					'你是一个专业的考试评分助手，需要客观公正地评分学生的答案。',
					batchPrompt,
					{
						temperature: 0.3,
						maxTokens: 4000,
						model: this.plugin.settings.textModel
					}
				);

				// 解析AI返回的评分结果
				const aiResults = this.parseAIGradingResponse(response, questions, userAnswers);
				results.push(...aiResults);
			} catch (error) {
				console.error('AI评分失败:', error);
				// 降级处理：给所有主观题0分
				for (const question of questions) {
					const userAnswer = userAnswers.get(question.id);
					if (userAnswer) {
						results.push({
							questionId: question.id,
							userAnswer,
							correctAnswer: question.answer,
							score: 0,
							maxScore: 1,
							feedback: 'AI评分失败，请手动评分'
						});
					}
				}
			}
		}

		return results;
	}

	/**
	 * 构建单题评分提示词
	 */
	private buildGradingPrompt(question: QuizQuestion, userAnswer: string | string[]): string {
		const answerText = Array.isArray(userAnswer) ? userAnswer.join(', ') : userAnswer;
		const correctAnswerText = Array.isArray(question.answer)
			? question.answer.join(', ')
			: question.answer;

		return `
题目：${question.question}
标准答案：${correctAnswerText}
学生答案：${answerText}
题目解析：${question.explanation}
`;
	}

	/**
	 * 构建批量评分提示词
	 */
	private buildBatchGradingPrompt(
		questions: QuizQuestion[],
		userAnswers: Map<string, string | string[]>
	): string {
		let prompt = `请评分以下题目，每题1分。对于填空题，答案基本正确即可得分；对于简答题，根据答案的完整性和准确性评分。

请严格按照以下JSON格式返回评分结果：
\`\`\`json
{
  "results": [
    {
      "questionId": "题目ID",
      "score": 分数(0-1),
      "feedback": "简短评语"
    }
  ]
}
\`\`\`

题目列表：

`;

		questions.forEach((question, index) => {
			const userAnswer = userAnswers.get(question.id) || '';
			const answerText = Array.isArray(userAnswer) ? userAnswer.join(', ') : userAnswer;
			const correctAnswerText = Array.isArray(question.answer)
				? question.answer.join(', ')
				: question.answer;

			prompt += `
## 题目 ${index + 1} (ID: ${question.id})
类型：${question.type === 'fill-blank' ? '填空题' : '简答题'}
题目：${question.question}
标准答案：${correctAnswerText}
学生答案：${answerText}
题目解析：${question.explanation}

`;
		});

		return prompt;
	}

	/**
	 * 解析AI评分响应
	 */
	private parseAIGradingResponse(
		aiResponse: string,
		questions: QuizQuestion[],
		userAnswers: Map<string, string | string[]>
	): QuizQuestionResult[] {
		const results: QuizQuestionResult[] = [];

		try {
			// 提取JSON代码块
			const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/);
			if (!jsonMatch) {
				throw new Error('AI响应格式错误');
			}

			const parsedData = JSON.parse(jsonMatch[1]);
			const aiResults = parsedData.results;

			// 构建结果映射
			const resultMap = new Map<string, { score: number; feedback: string }>();
			for (const aiResult of aiResults) {
				resultMap.set(aiResult.questionId, {
					score: aiResult.score,
					feedback: aiResult.feedback
				});
			}

			// 生成完整结果
			for (const question of questions) {
				const userAnswer = userAnswers.get(question.id) || '';
				const aiResult = resultMap.get(question.id);

				results.push({
					questionId: question.id,
					userAnswer,
					correctAnswer: question.answer,
					score: aiResult?.score || 0,
					maxScore: 1,
					feedback: aiResult?.feedback || '评分失败'
				});
			}
		} catch (error) {
			console.error('解析AI评分结果失败:', error);
			// 降级处理
			for (const question of questions) {
				const userAnswer = userAnswers.get(question.id) || '';
				results.push({
					questionId: question.id,
					userAnswer,
					correctAnswer: question.answer,
					score: 0,
					maxScore: 1,
					feedback: '解析评分结果失败'
				});
			}
		}

		return results;
	}

	/**
	 * 比较两个Set是否相等
	 */
	private setsEqual(a: Set<any>, b: Set<any>): boolean {
		if (a.size !== b.size) return false;
		for (const item of a) {
			if (!b.has(item)) return false;
		}
		return true;
	}
}
