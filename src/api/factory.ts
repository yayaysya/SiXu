import { UnifiedAIProvider } from './unified';
import { NotebookLLMSettings, AIProvider } from '../types';
import { DebugMarkdownLogger } from '../utils/DebugMarkdown';

/**
 * 创建文本生成 Provider
 */
export function createTextProvider(settings: NotebookLLMSettings, debug?: DebugMarkdownLogger): UnifiedAIProvider {
	const provider = settings.textProvider;
	const config = settings.providers.text[provider];
	const model = settings.textModel;

	if (!config.apiKey) {
		throw new Error(`${provider} 的 API Key 未配置`);
	}

	return new UnifiedAIProvider(provider, config.apiKey, config.baseUrl, debug ? (title, content) => debug.appendSection(title, content) : undefined);
}

/**
 * 创建视觉识别 Provider
 */
export function createVisionProvider(settings: NotebookLLMSettings, debug?: DebugMarkdownLogger): UnifiedAIProvider {
	const provider = settings.visionProvider;
	const config = settings.providers.vision[provider as keyof typeof settings.providers.vision];
	const model = settings.visionModel;

	if (!config || !config.apiKey) {
		throw new Error(`${provider} 的 API Key 未配置`);
	}

	return new UnifiedAIProvider(provider, config.apiKey, config.baseUrl, debug ? (title, content) => debug.appendSection(title, content) : undefined);
}

/**
 * 获取推荐的文本模型列表
 */
export function getTextModels(provider: AIProvider): string[] {
	switch (provider) {
		case AIProvider.ZHIPU:
			return [
				'glm-4.6',
				'glm-4.5',
				'glm-4.5-air',
				'glm-4.5-flash',
				'glm-4-plus',
				'glm-4-flash'
			];
		case AIProvider.OPENAI:
			return [
				'gpt-5',
				'gpt-5-mini',
				'gpt-5-nano',
				'gpt-4.5',
				'gpt-4.1',
				'gpt-4o',
				'gpt-4o-mini',
				'gpt-4-turbo',
				'gpt-4',
				'gpt-3.5-turbo'
			];
		case AIProvider.DEEPSEEK:
			return [
				'deepseek-chat',
				'deepseek-reasoner'
			];
		case AIProvider.GEMINI:
			return [
				'gemini-2.5-pro',
				'gemini-2.5-flash',
				'gemini-2.5-flash-lite'
			];
		default:
			return [];
	}
}

/**
 * 获取推荐的视觉模型列表
 */
export function getVisionModels(provider: AIProvider): string[] {
	switch (provider) {
		case AIProvider.ZHIPU:
			return [
				'glm-4.5v',
				'glm-4v-plus'
			];
		case AIProvider.OPENAI:
			return [
				'gpt-5',
				'gpt-4o',
				'gpt-4o-mini',
				'gpt-4-turbo',
				'gpt-4-vision-preview'
			];
		case AIProvider.DEEPSEEK:
			return []; // DeepSeek 不支持视觉图像理解
		case AIProvider.GEMINI:
			return  [
				'gemini-2.5-pro',
				'gemini-2.5-flash',
				'gemini-2.5-flash-lite'
			];
		default:
			return [];
	}
}

/**
 * 获取厂商显示名称
 */
export function getProviderDisplayName(provider: AIProvider): string {
	switch (provider) {
		case AIProvider.ZHIPU:
			return '智谱 AI (Zhipu)';
		case AIProvider.OPENAI:
			return 'OpenAI';
		case AIProvider.DEEPSEEK:
			return 'DeepSeek';
		case AIProvider.GEMINI:
			return 'Google Gemini';
		default:
			return provider;
	}
}
