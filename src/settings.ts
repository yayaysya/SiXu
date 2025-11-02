import { App, PluginSettingTab, Setting, Notice, requestUrl, TextComponent } from 'obsidian';
import NotebookLLMPlugin from './main';
import { NotebookLLMSettings, PromptTemplate, AIProvider } from './types';
import { validateProviderApiKey } from './api/unified';
import { BUILTIN_TEMPLATES, getAllTemplates } from './prompts/templates';
import { getTextModels, getVisionModels, getProviderDisplayName } from './api/factory';

/**
 * 设置面板
 */
export class NotebookLLMSettingTab extends PluginSettingTab {
	plugin: NotebookLLMPlugin;

	constructor(app: App, plugin: NotebookLLMPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// 添加插件特定的类名，避免样式污染
		containerEl.addClass('notebook-llm-settings');

		containerEl.createEl('h2', { text: 'Notebook LLM 设置' });

		// 文本模型配置（包含内联的 API 配置）
		this.displayTextModelSettings(containerEl);

		// 视觉模型配置（包含内联的 API 配置）
		this.displayVisionModelSettings(containerEl);

		// 处理设置
		this.displayProcessSettings(containerEl);

		// 提示词模板设置
		this.displayPromptSettings(containerEl);

		// 输出设置
		this.displayOutputSettings(containerEl);

		// 闪卡设置
		this.displayFlashcardSettings(containerEl);
	}

	/**
	 * 重新渲染设置面板并保持滚动位置
	 */
	private redisplayWithScrollPreservation(): void {
		const scrollTop = this.containerEl.scrollTop;
		this.display();
		// 使用 requestAnimationFrame 确保 DOM 更新完成后再恢复滚动位置
		requestAnimationFrame(() => {
			this.containerEl.scrollTop = scrollTop;
		});
	}

	/**
	 * 文本模型配置
	 */
	private displayTextModelSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '文本模型配置' });

		const currentProvider = this.plugin.settings.textProvider;
		const providerConfig = this.plugin.settings.providers.text[currentProvider];

		// 1. 文本 AI 服务（添加自定义选项）
		new Setting(containerEl)
			.setName('文本 AI 服务')
			.setDesc('选择用于文本生成和总结的 AI 服务提供商')
			.addDropdown(dropdown => {
				dropdown
					.addOption(AIProvider.ZHIPU, getProviderDisplayName(AIProvider.ZHIPU))
					.addOption(AIProvider.OPENAI, getProviderDisplayName(AIProvider.OPENAI))
					.addOption(AIProvider.DEEPSEEK, getProviderDisplayName(AIProvider.DEEPSEEK))
					.addOption(AIProvider.GEMINI, getProviderDisplayName(AIProvider.GEMINI))
					.addOption(AIProvider.CUSTOM, '自定义...')
					.setValue(currentProvider)
					.onChange(async (value: AIProvider) => {
						this.plugin.settings.textProvider = value;

						if (value === AIProvider.CUSTOM) {
							// 自定义模式：仅清空模型，保留用户配置的服务地址
							this.plugin.settings.textModel = '';
							// 确保自定义服务商配置存在
							if (!this.plugin.settings.providers.text[AIProvider.CUSTOM]) {
								this.plugin.settings.providers.text[AIProvider.CUSTOM] = { apiKey: '', baseUrl: '', cachedModels: [] };
							} else if (!this.plugin.settings.providers.text[AIProvider.CUSTOM].cachedModels) {
								this.plugin.settings.providers.text[AIProvider.CUSTOM].cachedModels = [];
							}
						} else {
							// 标准模式：自动选择该厂商的第一个模型
							const models = getTextModels(value);
							if (models.length > 0) {
								this.plugin.settings.textModel = models[0];
							}
						}

						await this.plugin.saveSettings();
						this.redisplayWithScrollPreservation(); // 重新渲染以显示新厂商的配置
					});
			});

		// 2. 服务地址（直接显示 + 恢复默认按钮）
		this.createDirectServiceUrlSetting(containerEl, currentProvider, 'text');

		// 3. 文本模型（增强：添加获取按钮）
		this.createEnhancedTextModelSetting(containerEl, currentProvider);

		// 4. API 密钥（保持现有实现）
		const docUrls: Record<AIProvider, string> = {
			[AIProvider.ZHIPU]: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
			[AIProvider.OPENAI]: 'https://openai.com/zh-Hans-CN/api/',
			[AIProvider.DEEPSEEK]: 'https://platform.deepseek.com/usage',
			[AIProvider.GEMINI]: 'https://aistudio.google.com/api-keys',
			[AIProvider.CUSTOM]: '#'
		};

		new Setting(containerEl)
			.setName('API 密钥')
			.setDesc(`请输入您的 ${getProviderDisplayName(currentProvider)} API Key`)
			.addText(text => text
				.setPlaceholder('输入 API Key')
				.setValue(providerConfig.apiKey)
				.onChange(async (value) => {
					providerConfig.apiKey = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('验证')
				.onClick(async () => {
					if (!providerConfig.apiKey) {
						new Notice('请先输入 API Key');
						return;
					}

					const notice = new Notice('正在验证 API Key...', 0);
					try {
						const isValid = await validateProviderApiKey(
							currentProvider,
							providerConfig.apiKey,
							providerConfig.baseUrl,
							this.plugin.settings.textModel
						);

						notice.hide();
						if (isValid) {
							new Notice(`✅ ${getProviderDisplayName(currentProvider)} API Key 验证成功!`);
						} else {
							new Notice(`❌ API Key 验证失败，请检查是否正确`);
						}
					} catch (error) {
						notice.hide();
						new Notice(`❌ 验证失败: ${error.message}`);
					}
				}));

		// 文档链接（自定义服务商没有官方文档链接）
		const docLinkDesc = containerEl.createDiv({ cls: 'setting-item-description' });
		docLinkDesc.style.marginTop = '-10px';
		docLinkDesc.style.marginBottom = '10px';

		if (currentProvider === AIProvider.CUSTOM) {
			docLinkDesc.textContent = '自定义服务商：请查阅所选服务商的官方文档获取 API Key';
		} else {
			docLinkDesc.innerHTML = `获取 API Key: <a href="${docUrls[currentProvider]}" target="_blank">${docUrls[currentProvider]}</a>`;
		}
	}

	/**
	 * 创建直接显示的服务地址配置项
	 */
	private createDirectServiceUrlSetting(
		containerEl: HTMLElement,
		provider: AIProvider,
		type: 'text' | 'vision'
	): void {
		const config = type === 'text'
			? this.plugin.settings.providers.text[provider]
			: this.plugin.settings.providers.vision[provider as keyof typeof this.plugin.settings.providers.vision];

		// 确保配置存在
		if (!config) {
			return;
		}

		const defaultUrl = this.getDefaultServiceUrl(provider);
		const isCustomProvider = provider === AIProvider.CUSTOM;
		const isUsingDefault = !config.baseUrl || config.baseUrl === defaultUrl;

		// 对于自定义服务商，使用不同的描述
		const description = isCustomProvider
			? '输入自定义 AI 服务商的服务端点地址'
			: `自定义 ${getProviderDisplayName(provider)} 的服务端点地址`;

		new Setting(containerEl)
			.setName('服务地址')
			.setDesc(description)
			.addText(text => {
				let displayValue: string;
				let placeholderText: string;

				if (isCustomProvider) {
					// 自定义服务商：没有默认地址，显示用户输入的值或空
					displayValue = config.baseUrl || '';
					placeholderText = 'https://api.example.com/v1';
				} else {
					// 标准服务商：如果有自定义地址则显示，否则显示默认地址
					displayValue = config.baseUrl && config.baseUrl !== defaultUrl ? config.baseUrl : defaultUrl;
					placeholderText = defaultUrl;
				}

				text
					.setPlaceholder(placeholderText)
					.setValue(displayValue)
					.onChange(async (value) => {
						let actualValue: string;

						if (isCustomProvider) {
							// 自定义服务商：直接保存用户输入的值
							actualValue = value;
						} else {
							// 标准服务商：如果用户输入的值与默认地址相同，则保存为空
							actualValue = value === defaultUrl ? '' : value;
						}

						if (type === 'text') {
							this.plugin.settings.providers.text[provider].baseUrl = actualValue;
						} else {
							if (this.plugin.settings.providers.vision[provider]) {
								this.plugin.settings.providers.vision[provider].baseUrl = actualValue;
							}
						}
						await this.plugin.saveSettings();
					});
			})
			.addButton(button => {
				if (isCustomProvider) {
					// 自定义服务商：显示"清空"按钮而不是"恢复默认"
					button
						.setButtonText('清空')
						.setTooltip('清空服务地址')
						.onClick(async () => {
							if (type === 'text') {
								this.plugin.settings.providers.text[provider].baseUrl = '';
							} else {
								if (this.plugin.settings.providers.vision[provider]) {
									this.plugin.settings.providers.vision[provider].baseUrl = '';
								}
							}
							await this.plugin.saveSettings();
							this.redisplayWithScrollPreservation();
							new Notice('已清空自定义服务地址');
						});
				} else {
					// 标准服务商：显示"恢复默认"按钮
					const tooltipText = defaultUrl ? `恢复为默认地址: ${defaultUrl}` : '恢复默认地址';
					button
						.setButtonText('恢复默认')
						.setTooltip(tooltipText)
						.onClick(async () => {
							await this.handleResetDefaultUrl(provider, type, config.baseUrl || '');
						});
				}
			});
	}

	/**
	 * 处理恢复默认服务地址
	 */
	private async handleResetDefaultUrl(provider: AIProvider, type: 'text' | 'vision', currentUrl: string): Promise<void> {
		try {
			const defaultUrl = this.getDefaultServiceUrl(provider);
			const hasCustomUrl = currentUrl && currentUrl !== defaultUrl && currentUrl !== '';

			// 如果有自定义地址，显示确认对话框
			if (hasCustomUrl) {
				const confirmed = await this.showConfirmDialog(
					'确认恢复默认',
					`确定要恢复 ${getProviderDisplayName(provider)} 的默认服务地址吗？\n当前自定义地址将丢失。`
				);

				if (!confirmed) {
					return;
				}
			}

			// 重置为默认值
			if (type === 'text') {
				this.plugin.settings.providers.text[provider].baseUrl = '';
			} else {
				if (this.plugin.settings.providers.vision[provider]) {
					this.plugin.settings.providers.vision[provider].baseUrl = '';
				}
			}

			await this.plugin.saveSettings();
			this.redisplayWithScrollPreservation();

			new Notice(`✅ 已恢复 ${getProviderDisplayName(provider)} 的默认服务地址`);

		} catch (error) {
			console.error('恢复默认地址失败:', error);
			new Notice(`❌ 恢复默认地址失败: ${error.message}`);
		}
	}

	/**
	 * 显示确认对话框
	 */
	private async showConfirmDialog(title: string, message: string): Promise<boolean> {
		return new Promise((resolve) => {
			const { Modal } = require('obsidian');

			class ConfirmModal extends Modal {
				constructor(app: any, title: string, message: string) {
					super(app);
					this.setTitle(title);
				}

				onOpen() {
					const { contentEl } = this;
					contentEl.empty();

					// 消息内容
					const messageEl = contentEl.createDiv({ cls: 'setting-item-description' });
					messageEl.textContent = message;
					messageEl.style.marginBottom = '20px';

					// 按钮容器
					const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
					buttonContainer.style.display = 'flex';
					buttonContainer.style.justifyContent = 'flex-end';
					buttonContainer.style.gap = '10px';

					// 取消按钮
					const cancelButton = buttonContainer.createEl('button', { text: '取消' });
					cancelButton.style.padding = '6px 12px';
					cancelButton.style.marginRight = '8px';
					cancelButton.addEventListener('click', () => {
						this.close();
						resolve(false);
					});

					// 确认按钮
					const confirmButton = buttonContainer.createEl('button', {
						text: '确认',
						cls: 'mod-cta'
					});
					confirmButton.style.padding = '6px 12px';
					confirmButton.addEventListener('click', () => {
						this.close();
						resolve(true);
					});
				}

				onClose() {
					const { contentEl } = this;
					contentEl.empty();
				}
			}

			new ConfirmModal(this.app, title, message).open();
		});
	}

	/**
	 * 获取厂商的默认服务地址
	 */
	private getDefaultServiceUrl(provider: AIProvider): string {
		switch (provider) {
			case AIProvider.ZHIPU:
				return 'https://open.bigmodel.cn/api/paas/v4';
			case AIProvider.OPENAI:
				return 'https://api.openai.com/v1';
			case AIProvider.DEEPSEEK:
				return 'https://api.deepseek.com/v1';
			case AIProvider.GEMINI:
				return 'https://generativelanguage.googleapis.com/v1beta';
			case AIProvider.CUSTOM:
				return ''; // 自定义服务商没有默认地址
			default:
				return '';
		}
	}

	/**
	 * 创建增强的文本模型配置项（带获取按钮）
	 */
	private createEnhancedTextModelSetting(containerEl: HTMLElement, provider: AIProvider): void {
		const isCustomProvider = provider === AIProvider.CUSTOM;
		const textModels = isCustomProvider ? [] : getTextModels(provider);
		const currentModel = this.plugin.settings.textModel;
		const isCustomModel = !textModels.includes(currentModel);
		const customConfig = this.plugin.settings.providers.text[AIProvider.CUSTOM];
		const cachedCustomModels = customConfig?.cachedModels ?? [];
		let customModelInput: TextComponent | null = null;

		if (isCustomProvider || isCustomModel) {
			// 自定义模式：文本输入框 + 获取按钮
			new Setting(containerEl)
				.setName('文本模型')
				.setDesc(isCustomProvider ? '输入自定义模型名称或点击获取按钮' : '选择模型或输入自定义模型名称')
				.addText(text => {
					customModelInput = text;
					text
						.setPlaceholder('例如: gpt-4, claude-3-opus, qwen-max')
						.setValue(currentModel)
						.onChange(async (value) => {
							this.plugin.settings.textModel = value;
							await this.plugin.saveSettings();
						});
				})
				.addButton(button => {
					const tooltipText = isCustomProvider
						? '从自定义服务地址获取支持的模型列表'
						: `获取 ${getProviderDisplayName(provider)} 的推荐模型列表`;

					button
						.setButtonText('获取')
						.setTooltip(tooltipText)
						.onClick(async () => {
							if (isCustomProvider) {
								await this.fetchCustomProviderModels(button.buttonEl);
							} else {
								await this.fetchAndDisplayModels(provider, 'text', button.buttonEl);
							}
						});
				});

			if (isCustomProvider && cachedCustomModels.length > 0) {
				new Setting(containerEl)
					.setName('已获取模型')
					.setDesc('直接选择之前成功获取的模型')
					.addDropdown(dropdown => {
						dropdown.addOption('', '选择模型...');
						cachedCustomModels.forEach(model => {
							dropdown.addOption(model, model);
						});

						if (currentModel && cachedCustomModels.includes(currentModel)) {
							dropdown.setValue(currentModel);
						} else {
							dropdown.setValue('');
						}

						dropdown.onChange(async (value) => {
							if (!value) {
								return;
							}
							this.plugin.settings.textModel = value;
							if (customModelInput) {
								customModelInput.setValue(value);
							}
							await this.plugin.saveSettings();
						});
					});
			}
		} else {
			// 标准模式：下拉框 + 获取按钮
			new Setting(containerEl)
				.setName('文本模型')
				.setDesc('选择模型或输入自定义模型名称')
				.addDropdown(dropdown => {
					textModels.forEach(model => {
						dropdown.addOption(model, model);
					});
					dropdown.addOption('custom', '自定义...');
					dropdown.setValue(currentModel);

					dropdown.onChange(async (value) => {
						if (value === 'custom') {
							this.plugin.settings.textModel = '';
							this.redisplayWithScrollPreservation();
						} else {
							this.plugin.settings.textModel = value;
							await this.plugin.saveSettings();
						}
					});
				})
				.addButton(button => {
					button
						.setButtonText('获取')
						.setTooltip(`获取 ${getProviderDisplayName(provider)} 的推荐模型列表`)
						.onClick(async () => {
							await this.fetchAndDisplayModels(provider, 'text', button.buttonEl);
						});
				});
		}
	}

	/**
	 * 获取并显示模型列表（基于本地预定义列表）
	 */
	private async fetchAndDisplayModels(provider: AIProvider, type: 'text' | 'vision', buttonElement?: HTMLButtonElement): Promise<void> {
		// 如果有按钮引用，设置加载状态
		if (buttonElement) {
			buttonElement.textContent = '获取中...';
			buttonElement.disabled = true;
		}

		const notice = new Notice('正在获取模型列表...', 0);

		try {
			// 模拟加载延迟，提升用户体验
			await new Promise(resolve => setTimeout(resolve, 800));

			// 获取本地预定义模型列表
			const models = type === 'text' ? getTextModels(provider) : getVisionModels(provider);

			notice.hide();

			if (models.length === 0) {
				new Notice(`未找到 ${getProviderDisplayName(provider)} 的可用模型`);
				return;
			}

			// 显示模型列表弹窗
			this.showModelSelectionDialog(models, provider, type);

		} catch (error) {
			notice.hide();
			new Notice(`获取模型列表失败: ${error.message}`);
		} finally {
			// 恢复按钮状态
			if (buttonElement) {
				buttonElement.textContent = '获取';
				buttonElement.disabled = false;
			}
		}
	}

	/**
	 * 获取自定义服务商的模型列表
	 */
	private async fetchCustomProviderModels(buttonElement?: HTMLButtonElement): Promise<void> {
		// 检查是否已配置自定义服务商信息
		const customConfig = this.plugin.settings.providers.text[AIProvider.CUSTOM];
		if (!customConfig) {
			new Notice('请先选择自定义服务商');
			return;
		}

		// 检查服务地址是否已配置
		if (!customConfig.baseUrl) {
			new Notice('请先配置自定义服务商的服务地址');
			return;
		}

		// 检查API密钥是否已配置
		if (!customConfig.apiKey) {
			new Notice('请先配置自定义服务商的API密钥');
			return;
		}

		// 设置按钮加载状态
		if (buttonElement) {
			buttonElement.textContent = '获取中...';
			buttonElement.disabled = true;
		}

		const notice = new Notice('正在获取自定义服务商的模型列表...', 0);
		let shouldRefreshCustomModels = false;

		try {
			// 尝试从自定义服务获取模型列表
			const models = await this.getModelsFromCustomProvider(customConfig.baseUrl, customConfig.apiKey);

			notice.hide();

			if (models.length === 0) {
				new Notice('未从自定义服务商获取到可用模型，请检查配置是否正确');
				return;
			}

			const uniqueModels = Array.from(new Set([...(customConfig.cachedModels ?? []), ...models])).sort();
			customConfig.cachedModels = uniqueModels;
			await this.plugin.saveSettings();
			shouldRefreshCustomModels = true;

			// 显示获取到的模型列表
			this.showModelSelectionDialog(models, AIProvider.CUSTOM, 'text');

		} catch (error) {
			notice.hide();
			console.error('获取自定义服务商模型失败:', error);

			// 提供友好的错误提示和降级方案
			new Notice('❌ 无法自动获取模型列表，请手动输入模型名称');
			this.showCommonModelSuggestions();
		} finally {
			// 恢复按钮状态
			if (buttonElement && buttonElement.isConnected) {
				buttonElement.textContent = '获取';
				buttonElement.disabled = false;
			}
		}

		if (shouldRefreshCustomModels) {
			setTimeout(() => {
				this.redisplayWithScrollPreservation();
			}, 0);
		}
	}

	/**
	 * 从自定义服务商获取模型列表
	 */
	private async getModelsFromCustomProvider(baseUrl: string, apiKey: string): Promise<string[]> {
		// 尝试多种常见的模型列表API端点
		const endpoints = [
			'/models',
			'/v1/models',
			'/api/models',
			'/chat/models',
			'/completions/models'
		];

		const normalizedBase = this.normalizeCustomBaseUrl(baseUrl);
		if (!normalizedBase) {
			console.warn('自定义服务商基础地址为空或无效', baseUrl);
			return [];
		}

		const errors: Array<{ url: string; error: unknown }> = [];

		for (const endpoint of endpoints) {
			const url = `${normalizedBase}${endpoint}`;

			try {
				const response = await requestUrl({
					url,
					method: 'GET',
					headers: {
						'Authorization': `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					}
				});

				if (response.status < 200 || response.status >= 300) {
					errors.push({ url, error: `Unexpected status ${response.status}` });
					continue;
				}

				const data = response.json ?? (response.text ? JSON.parse(response.text) : null);
				if (!data) {
					errors.push({ url, error: 'Empty response body' });
					continue;
				}

				const models = this.extractModelsFromResponse(data);
				if (models.length > 0) {
					return models;
				}
			} catch (error) {
				errors.push({ url, error });
			}
		}

		if (errors.length > 0) {
			console.warn('自定义服务商模型列表请求均失败', errors);
		}

		// 如果所有标准端点都失败，返回空数组
		return [];
	}

	/**
	 * 归一化自定义服务商的基础地址，剥离特定接口路径
	 */
	private normalizeCustomBaseUrl(baseUrl: string): string {
		if (!baseUrl) return '';

		let url = baseUrl.trim();
		if (!url) return '';

		// 移除查询参数和哈希（若误填）
		url = url.split('?')[0].split('#')[0];

		// 统一去掉尾部斜杠
		url = url.replace(/\/+$/, '');

		const patterns = [
			/\/chat\/completions$/i,
			/\/completions$/i,
			/\/v1\/chat\/completions$/i,
			/\/v1\/completions$/i,
			/\/chat$/i
		];

		for (const pattern of patterns) {
			if (pattern.test(url)) {
				url = url.replace(pattern, '');
			}
		}

		return url.replace(/\/+$/, '');
	}

	/**
	 * 从API响应中提取模型列表
	 */
	private extractModelsFromResponse(data: any): string[] {
		const models: string[] = [];

		// 尝试多种常见的响应格式
		if (data.data && Array.isArray(data.data)) {
			// OpenAI格式: { data: [{ id: "gpt-4" }] }
			data.data.forEach((model: any) => {
				if (model.id && typeof model.id === 'string') {
					models.push(model.id);
				}
			});
		} else if (data.models && Array.isArray(data.models)) {
			// 其他格式: { models: [{ id: "model-name" }] }
			data.models.forEach((model: any) => {
				if (model.id && typeof model.id === 'string') {
					models.push(model.id);
				} else if (model.model && typeof model.model === 'string') {
					models.push(model.model);
				}
			});
		} else if (Array.isArray(data)) {
			// 直接数组格式: [{ id: "model-name" }]
			data.forEach((model: any) => {
				if (model.id && typeof model.id === 'string') {
					models.push(model.id);
				} else if (typeof model === 'string') {
					models.push(model);
				}
			});
		}

		// 过滤掉测试模型和无效模型
		return models.filter(model =>
			typeof model === 'string' &&
			model.length > 0 &&
			!model.includes('test') &&
			!model.includes('beta') &&
			!model.includes('experimental')
		).sort();
	}

	
	/**
	 * 显示CORS错误对话框
	 */
	private showCORSErrorDialog(): void {
		const { Modal } = require('obsidian');

		class CORSErrorModal extends Modal {
			constructor(app: any) {
				super(app);
				this.setTitle('无法获取模型列表');
			}

			onOpen() {
				const { contentEl } = this;
				contentEl.empty();

				// 主要错误说明
				const errorDesc = contentEl.createDiv({ cls: 'setting-item-description' });
				errorDesc.innerHTML = `
					<p><strong>检测到跨域访问限制 (CORS)</strong></p>
					<p>您选择的自定义服务商 (${this.getCurrentCustomProvider()}) 不允许从 Obsidian 访问其模型列表API。</p>
					<p>这通常是由于服务器安全策略导致的，不是插件的问题。</p>
				`;
				errorDesc.style.marginBottom = '16px';

				// 解决方案
				const solutionsEl = contentEl.createDiv({ cls: 'setting-item-description' });
				solutionsEl.innerHTML = `
					<p><strong>解决方案：</strong></p>
					<ol style="margin-left: 20px; margin-top: 8px;">
						<li><strong>手动输入模型名称</strong>：在文本模型框中直接输入您要使用的模型名称</li>
						<li><strong>查看服务商文档</strong>：查阅您的AI服务商文档，了解支持哪些模型</li>
						<li><strong>使用常见模型</strong>：参考下面的常见模型名称建议</li>
					</ol>
				`;
				solutionsEl.style.marginBottom = '16px';

				// 技术说明
				const techEl = contentEl.createDiv({ cls: 'setting-item-description' });
				techEl.innerHTML = `
					<p><strong>技术说明：</strong></p>
					<p>如果您的服务商需要支持跨域访问，服务器管理员需要在响应头中添加：</p>
					<code style="background: var(--background-secondary); padding: 2px 6px; border-radius: 3px; font-size: 12px;">
						Access-Control-Allow-Origin: *
					</code>
				`;
				techEl.style.marginBottom = '20px';

				// 按钮容器
				const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
				buttonContainer.style.display = 'flex';
				buttonContainer.style.justifyContent = 'space-between';
				buttonContainer.style.gap = '10px';

				// 查看常见模型按钮
				const suggestionsButton = buttonContainer.createEl('button', {
					text: '查看常见模型',
					cls: 'mod-cta'
				});
				suggestionsButton.style.flex = '1';
				suggestionsButton.addEventListener('click', () => {
					this.close();
					// 延迟执行，确保当前对话框关闭后再打开新对话框
					setTimeout(() => {
						const settingTab = this.app.setting.pluginTabs.find((tab: any) => tab.constructor.name === 'NotebookLLMSettingTab');
						if (settingTab) {
							(settingTab as any).showCommonModelSuggestions();
						}
					}, 100);
				});

				// 关闭按钮
				const closeButton = buttonContainer.createEl('button', { text: '关闭' });
				closeButton.style.flex = '1';
				closeButton.addEventListener('click', () => this.close());
			}

			getCurrentCustomProvider(): string {
				// 获取当前设置的自定义服务商URL用于显示
				return 'https://b4u.qzz.io/v1/chat/completions';
			}

			showCommonModelSuggestions() {
				// 这里需要调用父类的显示常见模型建议方法
				// 由于Modal类的限制，我们直接在设置页面中调用
				const settingsTab = this.app.setting.pluginTabs.find((tab: any) => tab.constructor.name === 'NotebookLLMSettingTab');
				if (settingsTab) {
					(settingsTab as any).showCommonModelSuggestions();
				}
			}

			onClose() {
				const { contentEl } = this;
				contentEl.empty();
			}
		}

		new CORSErrorModal(this.app).open();
	}

	
	/**
	 * 显示模型选择对话框
	 */
	private showModelSelectionDialog(models: string[], provider: AIProvider, type: 'text' | 'vision'): void {
		try {
			const { Modal } = require('obsidian');

			class ModelSelectionModal extends Modal {
				plugin: NotebookLLMPlugin;
				models: string[];
				provider: AIProvider;
				type: 'text' | 'vision';
				selectedModel: string | null = null;

				constructor(app: any, plugin: NotebookLLMPlugin, models: string[], provider: AIProvider, type: 'text' | 'vision') {
					super(app);
					this.plugin = plugin;
					this.models = models;
					this.provider = provider;
					this.type = type;
				}

				onOpen() {
					try {
						const { contentEl } = this;
						contentEl.empty();

						// 标题
						const titleEl = contentEl.createEl('h3', { text: `${getProviderDisplayName(this.provider)} 可用模型` });
						titleEl.style.marginBottom = '16px';

						// 模型数量提示
						const countEl = contentEl.createDiv({ cls: 'setting-item-description' });
						countEl.textContent = `共找到 ${this.models.length} 个可用模型`;
						countEl.style.marginBottom = '12px';

						// 模型列表容器
						const modelList = contentEl.createDiv({ cls: 'model-list' });
						modelList.style.maxHeight = '300px';
						modelList.style.overflowY = 'auto';
						modelList.style.border = '1px solid var(--background-modifier-border)';
						modelList.style.borderRadius = '4px';

						this.models.forEach(model => {
							const modelItem = modelList.createDiv({ cls: 'model-item' });
							modelItem.style.padding = '10px 12px';
							modelItem.style.cursor = 'pointer';
							modelItem.style.borderBottom = '1px solid var(--background-secondary)';
							modelItem.style.display = 'flex';
							modelItem.style.alignItems = 'center';
							modelItem.style.justifyContent = 'space-between';

							// 模型名称
							const nameEl = modelItem.createDiv({ text: model });

							// 推荐标识
							if (this.models.indexOf(model) < 3) {
								const recommendEl = modelItem.createSpan({ text: '推荐' });
								recommendEl.style.backgroundColor = 'var(--interactive-accent)';
								recommendEl.style.color = 'var(--text-on-accent)';
								recommendEl.style.padding = '2px 6px';
								recommendEl.style.borderRadius = '3px';
								recommendEl.style.fontSize = '11px';
							}

							// 交互事件
							modelItem.addEventListener('click', () => {
								this.selectModel(model);
							});

							modelItem.addEventListener('mouseenter', () => {
								modelItem.style.backgroundColor = 'var(--background-secondary)';
							});

							modelItem.addEventListener('mouseleave', () => {
								if (this.selectedModel !== model) {
									modelItem.style.backgroundColor = 'transparent';
								}
							});

							// 选中状态
							if (this.selectedModel === model) {
								modelItem.style.backgroundColor = 'var(--background-modifier-form-field-highlighted)';
							}
						});

						// 按钮容器
						const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
						buttonContainer.style.display = 'flex';
						buttonContainer.style.justifyContent = 'flex-end';
						buttonContainer.style.gap = '10px';
						buttonContainer.style.marginTop = '16px';

						// 取消按钮
						const cancelButton = buttonContainer.createEl('button', { text: '取消' });
						cancelButton.style.padding = '6px 12px';
						cancelButton.style.border = '1px solid var(--background-modifier-border)';
						cancelButton.style.borderRadius = '4px';
						cancelButton.style.backgroundColor = 'var(--background-secondary)';
						cancelButton.style.cursor = 'pointer';
						cancelButton.addEventListener('click', () => this.close());

						// 确认按钮（如果有选中项）
						if (this.selectedModel) {
							const confirmButton = buttonContainer.createEl('button', {
								text: '确认选择',
								cls: 'mod-cta'
							});
							confirmButton.style.padding = '6px 12px';
							confirmButton.style.borderRadius = '4px';
							confirmButton.style.cursor = 'pointer';
							confirmButton.addEventListener('click', () => {
								if (this.selectedModel) {
									this.applyModelSelection(this.selectedModel);
								}
							});
						}

					} catch (error) {
						console.error('模型选择对话框打开失败:', error);
						new Notice('模型选择对话框打开失败，请重试');
						this.close();
					}
				}

				selectModel(model: string) {
					this.selectedModel = model;

					// 更新UI选中状态
					const modelItems = this.contentEl.querySelectorAll('.model-item');
					modelItems.forEach((item: HTMLElement) => {
						const modelName = item.textContent?.replace('推荐', '').trim();
						if (modelName === model) {
							item.style.backgroundColor = 'var(--background-modifier-form-field-highlighted)';
						} else {
							item.style.backgroundColor = 'transparent';
						}
					});

					// 重新渲染按钮区域
					this.onOpen();
				}

				async applyModelSelection(model: string) {
					try {
						const oldModel = this.type === 'text'
							? this.plugin.settings.textModel
							: this.plugin.settings.visionModel;

						// 更新设置
						if (this.type === 'text') {
							this.plugin.settings.textModel = model;
						} else {
							this.plugin.settings.visionModel = model;
						}

						await this.plugin.saveSettings();
						this.close();

						// 触发界面刷新
						const settingsTab = this.app.setting.pluginTabs.find((tab: any) => tab instanceof NotebookLLMSettingTab);
						if (settingsTab) {
							(settingsTab as NotebookLLMSettingTab).redisplayWithScrollPreservation();
						}

						// 显示成功提示
						const providerName = getProviderDisplayName(this.provider);
						const modelType = this.type === 'text' ? '文本' : '视觉';
						new Notice(`✅ 已选择${providerName} ${modelType}模型: ${model}`);

					} catch (error) {
						console.error('模型选择应用失败:', error);
						new Notice(`❌ 模型选择失败: ${error.message}`);
					}
				}

				onClose() {
					try {
						const { contentEl } = this;
						contentEl.empty();
					} catch (error) {
						console.error('模型选择对话框关闭失败:', error);
					}
				}
			}

			new ModelSelectionModal(this.app, this.plugin, models, provider, type).open();

		} catch (error) {
			console.error('模型选择对话框创建失败:', error);
			new Notice(`❌ 创建模型选择对话框失败: ${error.message}`);
		}
	}

	/**
	 * 视觉模型配置
	 */
	private displayVisionModelSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '视觉模型配置' });

		const currentProvider = this.plugin.settings.visionProvider;
		let providerConfig = this.plugin.settings.providers.vision[currentProvider as keyof typeof this.plugin.settings.providers.vision];
		
		// 如果配置不存在（例如从旧配置升级），使用默认值
		if (!providerConfig) {
			providerConfig = { apiKey: '', baseUrl: '' };
		}

		// 1. 视觉 AI 服务
		new Setting(containerEl)
			.setName('视觉理解 AI 服务')
			.setDesc('选择用于图片识别的 AI 服务提供商')
			.addDropdown(dropdown => {
				dropdown
					.addOption(AIProvider.ZHIPU, getProviderDisplayName(AIProvider.ZHIPU))
					.addOption(AIProvider.OPENAI, getProviderDisplayName(AIProvider.OPENAI))
					.addOption(AIProvider.GEMINI, getProviderDisplayName(AIProvider.GEMINI))
					.setValue(currentProvider)
					.onChange(async (value: AIProvider) => {
						this.plugin.settings.visionProvider = value;
						// 自动选择该厂商的第一个模型
						const models = getVisionModels(value);
						if (models.length > 0) {
							this.plugin.settings.visionModel = models[0];
						}
						await this.plugin.saveSettings();
						this.redisplayWithScrollPreservation(); // 重新渲染以显示新厂商的配置
					});
			});

		// 2. 视觉模型
		const visionModels = getVisionModels(currentProvider);
		const isCustomVisionModel = !visionModels.includes(this.plugin.settings.visionModel);

		if (isCustomVisionModel) {
			// 自定义模式：显示下拉框 + 文本输入框
			new Setting(containerEl)
				.setName('视觉模型')
				.setDesc('选择模型或输入自定义模型名称')
				.addDropdown(dropdown => {
					visionModels.forEach(model => {
						dropdown.addOption(model, model);
					});
					dropdown.addOption('custom', '自定义...');
					dropdown.setValue('custom');

					dropdown.onChange(async (value) => {
						if (value !== 'custom') {
							this.plugin.settings.visionModel = value;
							await this.plugin.saveSettings();
							this.redisplayWithScrollPreservation(); // 切换到标准模式
						}
					});
				})
				.addText(text => text
					.setPlaceholder('输入模型名称')
					.setValue(this.plugin.settings.visionModel)
					.onChange(async (value) => {
						this.plugin.settings.visionModel = value;
						await this.plugin.saveSettings();
					}));
		} else {
			// 标准模式：只显示下拉框（向右对齐）
			new Setting(containerEl)
				.setName('视觉模型')
				.setDesc('选择模型或输入自定义模型名称')
				.addDropdown(dropdown => {
					visionModels.forEach(model => {
						dropdown.addOption(model, model);
					});
					dropdown.addOption('custom', '自定义...');
					dropdown.setValue(this.plugin.settings.visionModel);

					dropdown.onChange(async (value) => {
						if (value === 'custom') {
							this.plugin.settings.visionModel = ''; // 清空以进入自定义模式
							this.redisplayWithScrollPreservation(); // 切换到自定义模式
						} else {
							this.plugin.settings.visionModel = value;
							await this.plugin.saveSettings();
						}
					});
				});
		}

		// 3. API 密钥（带文档链接）
		const docUrls: Record<AIProvider, string> = {
			[AIProvider.ZHIPU]: 'https://open.bigmodel.cn/',
			[AIProvider.OPENAI]: 'https://platform.openai.com/',
			[AIProvider.DEEPSEEK]: 'https://platform.deepseek.com/',
			[AIProvider.GEMINI]: 'https://ai.google.dev/',
			[AIProvider.CUSTOM]: '#'
		};

		new Setting(containerEl)
			.setName('API 密钥')
			.setDesc(`请输入您的 ${getProviderDisplayName(currentProvider)} API Key`)
			.addText(text => text
				.setPlaceholder('输入 API Key')
				.setValue(providerConfig.apiKey)
				.onChange(async (value) => {
					providerConfig.apiKey = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('验证')
				.onClick(async () => {
					if (!providerConfig.apiKey) {
						new Notice('请先输入 API Key');
						return;
					}

					const notice = new Notice('正在验证 API Key...', 0);
					try {
						const isValid = await validateProviderApiKey(
							currentProvider,
							providerConfig.apiKey,
							providerConfig.baseUrl,
							this.plugin.settings.visionModel
						);

						notice.hide();
						if (isValid) {
							new Notice(`✅ ${getProviderDisplayName(currentProvider)} API Key 验证成功!`);
						} else {
							new Notice(`❌ API Key 验证失败，请检查是否正确`);
						}
					} catch (error) {
						notice.hide();
						new Notice(`❌ 验证失败: ${error.message}`);
					}
				}));

		// 添加文档链接提示
		const docLinkDesc = containerEl.createDiv({ cls: 'setting-item-description' });
		docLinkDesc.style.marginTop = '-10px';
		docLinkDesc.style.marginBottom = '10px';
		docLinkDesc.innerHTML = `获取 API Key: <a href="${docUrls[currentProvider]}" target="_blank">${docUrls[currentProvider]}</a>`;

		// 4. 服务地址（直接显示 + 恢复默认按钮）
		this.createDirectServiceUrlSetting(containerEl, currentProvider, 'vision');
	}

	
	/**
	 * 处理设置
	 */
	private displayProcessSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '处理设置' });

		// 并发数
		new Setting(containerEl)
			.setName('并发处理数')
			.setDesc('同时处理图片和链接的数量 (建议 5-10)')
			.addSlider(slider => slider
				.setLimits(1, 20, 1)
				.setValue(this.plugin.settings.concurrency)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.concurrency = value;
					await this.plugin.saveSettings();
				}));

		// 调试模式
		new Setting(containerEl)
			.setName('调试模式')
			.setDesc('开启后，每次 AI 整理会在笔记库根目录 sixu_debugger/ 生成单个 Markdown 调试日志，记录提示词与返回（适度截断，自动脱敏）。')
			.addToggle(toggle => toggle
				.setValue(!!this.plugin.settings.debugEnabled)
				.onChange(async (value) => {
					this.plugin.settings.debugEnabled = value;
					await this.plugin.saveSettings();
				}));
	}

	/**
	 * 提示词模板设置
	 */
	private displayPromptSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '提示词模板' });

		// 选择当前模板
		const templates = getAllTemplates(this.plugin.settings.customPromptTemplates);
		const templateOptions: Record<string, string> = {};
		templates.forEach(t => {
			templateOptions[t.id] = t.name;
		});

		new Setting(containerEl)
			.setName('默认模板')
			.setDesc('选择整理笔记时使用的提示词模板')
			.addDropdown(dropdown => dropdown
				.addOptions(templateOptions)
				.setValue(this.plugin.settings.selectedPromptTemplate)
				.onChange(async (value) => {
					this.plugin.settings.selectedPromptTemplate = value;
					await this.plugin.saveSettings();
				}));

		// 显示内置模板
		containerEl.createEl('h4', { text: '内置模板' });
		const builtinDesc = containerEl.createEl('div', { cls: 'setting-item-description' });
		builtinDesc.innerHTML = BUILTIN_TEMPLATES.map(t =>
			`<strong>${t.name}</strong>: ${t.description}`
		).join('<br>');

		// 自定义模板管理
		containerEl.createEl('h4', { text: '自定义模板' });

		if (this.plugin.settings.customPromptTemplates.length === 0) {
			containerEl.createEl('p', {
				text: '暂无自定义模板',
				cls: 'setting-item-description'
			});
		} else {
			this.plugin.settings.customPromptTemplates.forEach((template, index) => {
				new Setting(containerEl)
					.setName(template.name)
					.setDesc(template.description)
					.addButton(button => button
						.setButtonText('编辑')
						.onClick(() => {
							this.editCustomTemplate(index);
						}))
					.addButton(button => button
						.setButtonText('删除')
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.customPromptTemplates.splice(index, 1);
							await this.plugin.saveSettings();
							this.redisplayWithScrollPreservation();
						}));
			});
		}

		// 添加自定义模板按钮
		new Setting(containerEl)
			.addButton(button => button
				.setButtonText('+ 添加自定义模板')
				.setCta()
				.onClick(() => {
					this.addCustomTemplate();
				}));
	}

	/**
	 * 输出设置
	 */
	private displayOutputSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '输出设置' });

		// 1. 常规笔记输出位置
		containerEl.createEl('h4', { text: '常规笔记输出位置' });
		
		new Setting(containerEl)
			.setName('输出位置')
			.setDesc('选择常规笔记处理后的保存位置')
			.addDropdown(dropdown => {
				dropdown
					.addOption('source', '保存到源笔记所在目录（推荐）')
					.addOption('custom', '保存到指定目录')
					.setValue(this.plugin.settings.noteOutputMode)
					.onChange(async (value: 'source' | 'custom') => {
						this.plugin.settings.noteOutputMode = value;
						await this.plugin.saveSettings();
						this.redisplayWithScrollPreservation();
					});
			});

		// 自定义输出目录输入框（条件显示）
		if (this.plugin.settings.noteOutputMode === 'custom') {
			new Setting(containerEl)
				.setName('输出目录')
				.setDesc('笔记处理结果保存到的目录路径，例如: AI整理结果')
				.addText(text => text
					.setPlaceholder('输入目录路径，例如: AI整理结果')
					.setValue(this.plugin.settings.noteOutputPath || '')
					.onChange(async (value) => {
						this.plugin.settings.noteOutputPath = value.trim();
						await this.plugin.saveSettings();
					}));
		}

		// 2. 输出文件名模板
		new Setting(containerEl)
			.setName('输出文件名模板')
			.setDesc('使用 {name} 代表原文件名，例如: {name}_AI整理')
			.addText(text => text
				.setPlaceholder('{name}_AI整理')
				.setValue(this.plugin.settings.outputFileNameTemplate)
				.onChange(async (value) => {
					this.plugin.settings.outputFileNameTemplate = value || '{name}_AI整理';
					await this.plugin.saveSettings();
				}));

		// 3. 组合笔记输出目录
		containerEl.createEl('h4', { text: '组合笔记输出位置' });

		new Setting(containerEl)
			.setName('组合笔记输出目录')
			.setDesc('组合笔记保存的目录，空值表示保存到库根目录')
			.addText(text => text
				.setPlaceholder('空值表示库根目录')
				.setValue(this.plugin.settings.combineNotesDir)
				.onChange(async (value) => {
					this.plugin.settings.combineNotesDir = value.trim();
					await this.plugin.saveSettings();
				}));

		// 4. Quiz 相关输出目录
		containerEl.createEl('h4', { text: 'Quiz 输出位置' });

		new Setting(containerEl)
			.setName('Quiz 文件目录')
			.setDesc('生成的 Quiz 文件保存目录')
			.addText(text => text
				.setPlaceholder('quiz')
				.setValue(this.plugin.settings.quizDir)
				.onChange(async (value) => {
					this.plugin.settings.quizDir = value.trim() || 'quiz';
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Quiz 结果目录')
			.setDesc('Quiz 考试结果保存目录')
			.addText(text => text
				.setPlaceholder('quiz/results')
				.setValue(this.plugin.settings.resultDir)
				.onChange(async (value) => {
					this.plugin.settings.resultDir = value.trim() || 'quiz/results';
					await this.plugin.saveSettings();
				}));
	}

	/**
	 * 添加自定义模板
	 */
	private addCustomTemplate(): void {
		const modal = new CustomTemplateModal(
			this.app,
			null,
			async (template) => {
				this.plugin.settings.customPromptTemplates.push(template);
				await this.plugin.saveSettings();
				this.redisplayWithScrollPreservation();
			}
		);
		modal.open();
	}

	/**
	 * 编辑自定义模板
	 */
	private editCustomTemplate(index: number): void {
		const template = this.plugin.settings.customPromptTemplates[index];
		const modal = new CustomTemplateModal(
			this.app,
			template,
			async (updatedTemplate) => {
				this.plugin.settings.customPromptTemplates[index] = updatedTemplate;
				await this.plugin.saveSettings();
				this.redisplayWithScrollPreservation();
			}
		);
		modal.open();
	}

	/**
	 * 闪卡配置
	 */
	private displayFlashcardSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '闪卡配置' });

		// 确保 flashcard 配置存在
		if (!this.plugin.settings.flashcard) {
			this.plugin.settings.flashcard = {
				deckDir: 'flashcards',
				newCardsPerDay: 20,
				reviewCardsPerDay: 200
			};
		}

		// 闪卡存储目录
		new Setting(containerEl)
			.setName('闪卡存储目录')
			.setDesc('存储闪卡组数据的目录')
			.addText(text => text
				.setPlaceholder('flashcards')
				.setValue(this.plugin.settings.flashcard?.deckDir || 'flashcards')
				.onChange(async (value) => {
					if (this.plugin.settings.flashcard) {
						this.plugin.settings.flashcard.deckDir = value.trim() || 'flashcards';
						await this.plugin.saveSettings();
					}
				}));

		// 每天新卡片数
		new Setting(containerEl)
			.setName('每天新卡片数')
			.setDesc('每天学习的新卡片数量上限')
			.addText(text => text
				.setPlaceholder('20')
				.setValue(String(this.plugin.settings.flashcard?.newCardsPerDay || 20))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0 && this.plugin.settings.flashcard) {
						this.plugin.settings.flashcard.newCardsPerDay = num;
						await this.plugin.saveSettings();
					}
				}));

		// 每天复习卡片数
		new Setting(containerEl)
			.setName('每天复习卡片数')
			.setDesc('每天复习的卡片数量上限')
			.addText(text => text
				.setPlaceholder('200')
				.setValue(String(this.plugin.settings.flashcard?.reviewCardsPerDay || 200))
				.onChange(async (value) => {
					const num = parseInt(value);
					if (!isNaN(num) && num > 0 && this.plugin.settings.flashcard) {
						this.plugin.settings.flashcard.reviewCardsPerDay = num;
						await this.plugin.saveSettings();
					}
				}));
	}

	/**
	 * 显示常见模型建议
	 */
	private showCommonModelSuggestions(): void {
		const { Modal } = require('obsidian');

		class CommonModelsModal extends Modal {
			constructor(app: any) {
				super(app);
				this.setTitle('常见模型名称建议');
			}

			onOpen() {
				const { contentEl } = this;
				contentEl.empty();

				// 说明文字
				const descEl = contentEl.createDiv({ cls: 'setting-item-description' });
				descEl.textContent = '由于无法自动获取模型列表，您可以参考以下常见的模型名称：';
				descEl.style.marginBottom = '16px';

				// 模型分类
				const categories = [
					{
						title: 'OpenAI 兼容',
						models: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']
					},
					{
						title: 'Anthropic Claude',
						models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']
					},
					{
						title: 'Google Gemini',
						models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']
					},
					{
						title: '其他常见',
						models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'yi-large', 'yi-medium', 'yi-spark']
					}
				];

				categories.forEach(category => {
					// 分类标题
					const titleEl = contentEl.createEl('h4', { text: category.title });
					titleEl.style.marginBottom = '8px';

					// 模型列表
					const modelList = contentEl.createDiv({ cls: 'model-suggestion-list' });
					modelList.style.marginBottom = '16px';
					modelList.style.paddingLeft = '16px';

					category.models.forEach(model => {
						const modelItem = modelList.createDiv({ text: `• ${model}` });
						modelItem.style.padding = '4px 0';
						modelItem.style.cursor = 'pointer';
						modelItem.style.color = 'var(--interactive-accent)';

						modelItem.addEventListener('click', () => {
							navigator.clipboard.writeText(model);
							new Notice(`已复制模型名称: ${model}`);
						});

						modelItem.addEventListener('mouseenter', () => {
							modelItem.style.textDecoration = 'underline';
						});

						modelItem.addEventListener('mouseleave', () => {
							modelItem.style.textDecoration = 'none';
						});
					});
				});

				// 关闭按钮
				const closeButton = contentEl.createEl('button', { text: '关闭' });
				closeButton.style.marginTop = '16px';
				closeButton.style.width = '100%';
				closeButton.addEventListener('click', () => this.close());
			}

			onClose() {
				const { contentEl } = this;
				contentEl.empty();
			}
		}

		new CommonModelsModal(this.app).open();
	}
}

/**
 * 自定义模板编辑对话框
 */
import { Modal } from 'obsidian';

class CustomTemplateModal extends Modal {
	template: PromptTemplate | null;
	onSubmit: (template: PromptTemplate) => void;

	private nameInput: HTMLInputElement;
	private descInput: HTMLInputElement;
	private stylePromptInput: HTMLTextAreaElement;

	constructor(
		app: App,
		template: PromptTemplate | null,
		onSubmit: (template: PromptTemplate) => void
	) {
		super(app);
		this.template = template;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.template ? '编辑模板' : '新建模板' });

		// 模板名称
		const nameDiv = contentEl.createDiv({ cls: 'setting-item' });
		nameDiv.createEl('div', { text: '模板名称', cls: 'setting-item-name' });
		this.nameInput = nameDiv.createEl('input', { type: 'text' });
		this.nameInput.value = this.template?.name || '';
		this.nameInput.style.width = '100%';

		// 模板描述
		const descDiv = contentEl.createDiv({ cls: 'setting-item' });
		descDiv.createEl('div', { text: '模板描述', cls: 'setting-item-name' });
		this.descInput = descDiv.createEl('input', { type: 'text' });
		this.descInput.value = this.template?.description || '';
		this.descInput.style.width = '100%';

		// 写作风格提示词
		const styleDiv = contentEl.createDiv({ cls: 'setting-item' });
		styleDiv.createEl('div', { text: '写作风格提示词', cls: 'setting-item-name' });

		this.stylePromptInput = styleDiv.createEl('textarea');
		this.stylePromptInput.value = this.template?.stylePrompt || '';
		this.stylePromptInput.rows = 12;
		this.stylePromptInput.style.width = '100%';
		this.stylePromptInput.placeholder = '定义写作角色、风格和表达方式（格式要求由系统自动添加）\n\n例如：\n你是一位经验丰富的技术博主...\n\n写作风格：\n- 第一人称视角\n- 口语化表达\n- 注重实践经验分享';

		// 按钮
		const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
		buttonDiv.style.display = 'flex';
		buttonDiv.style.justifyContent = 'flex-end';
		buttonDiv.style.gap = '10px';
		buttonDiv.style.marginTop = '20px';

		const cancelButton = buttonDiv.createEl('button', { text: '取消' });
		cancelButton.onclick = () => this.close();

		const submitButton = buttonDiv.createEl('button', { text: '保存', cls: 'mod-cta' });
		submitButton.onclick = () => this.submit();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private submit(): void {
		const name = this.nameInput.value.trim();
		const description = this.descInput.value.trim();
		const stylePrompt = this.stylePromptInput.value.trim();

		if (!name || !stylePrompt) {
			new Notice('请填写所有必填字段');
			return;
		}

		const template: PromptTemplate = {
			id: this.template?.id || `custom_${Date.now()}`,
			name,
			description,
			stylePrompt
		};

		this.onSubmit(template);
		this.close();
	}
}
