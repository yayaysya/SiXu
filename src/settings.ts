import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
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

		// 1. 文本 AI 服务
		new Setting(containerEl)
			.setName('文本 AI 服务')
			.setDesc('选择用于文本生成和总结的 AI 服务提供商')
			.addDropdown(dropdown => {
				dropdown
					.addOption(AIProvider.ZHIPU, getProviderDisplayName(AIProvider.ZHIPU))
					.addOption(AIProvider.OPENAI, getProviderDisplayName(AIProvider.OPENAI))
					.addOption(AIProvider.DEEPSEEK, getProviderDisplayName(AIProvider.DEEPSEEK))
					.addOption(AIProvider.GEMINI, getProviderDisplayName(AIProvider.GEMINI))
					.setValue(currentProvider)
					.onChange(async (value: AIProvider) => {
						this.plugin.settings.textProvider = value;
						// 自动选择该厂商的第一个模型
						const models = getTextModels(value);
						if (models.length > 0) {
							this.plugin.settings.textModel = models[0];
						}
						await this.plugin.saveSettings();
						this.redisplayWithScrollPreservation(); // 重新渲染以显示新厂商的配置
					});
			});

		// 2. 文本模型
		const textModels = getTextModels(currentProvider);
		const isCustomModel = !textModels.includes(this.plugin.settings.textModel);

		if (isCustomModel) {
			// 自定义模式：显示下拉框 + 文本输入框
			new Setting(containerEl)
				.setName('文本模型')
				.setDesc('选择模型或输入自定义模型名称')
				.addDropdown(dropdown => {
					textModels.forEach(model => {
						dropdown.addOption(model, model);
					});
					dropdown.addOption('custom', '自定义...');
					dropdown.setValue('custom');

					dropdown.onChange(async (value) => {
						if (value !== 'custom') {
							this.plugin.settings.textModel = value;
							await this.plugin.saveSettings();
							this.redisplayWithScrollPreservation(); // 切换到标准模式
						}
					});
				})
				.addText(text => text
					.setPlaceholder('输入模型名称')
					.setValue(this.plugin.settings.textModel)
					.onChange(async (value) => {
						this.plugin.settings.textModel = value;
						await this.plugin.saveSettings();
					}));
		} else {
			// 标准模式：只显示下拉框（向右对齐）
			new Setting(containerEl)
				.setName('文本模型')
				.setDesc('选择模型或输入自定义模型名称')
				.addDropdown(dropdown => {
					textModels.forEach(model => {
						dropdown.addOption(model, model);
					});
					dropdown.addOption('custom', '自定义...');
					dropdown.setValue(this.plugin.settings.textModel);

					dropdown.onChange(async (value) => {
						if (value === 'custom') {
							this.plugin.settings.textModel = ''; // 清空以进入自定义模式
							this.redisplayWithScrollPreservation(); // 切换到自定义模式
						} else {
							this.plugin.settings.textModel = value;
							await this.plugin.saveSettings();
						}
					});
				});
		}

		// 3. API 密钥（带文档链接）
		const docUrls = {
			[AIProvider.ZHIPU]: 'https://bigmodel.cn/usercenter/proj-mgmt/apikeys',
			[AIProvider.OPENAI]: 'https://openai.com/zh-Hans-CN/api/',
			[AIProvider.DEEPSEEK]: 'https://platform.deepseek.com/usage',
			[AIProvider.GEMINI]: 'https://aistudio.google.com/api-keys'
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

		// 添加文档链接提示
		const docLinkDesc = containerEl.createDiv({ cls: 'setting-item-description' });
		docLinkDesc.style.marginTop = '-10px';
		docLinkDesc.style.marginBottom = '10px';
		docLinkDesc.innerHTML = `获取 API Key: <a href="${docUrls[currentProvider]}" target="_blank">${docUrls[currentProvider]}</a>`;

		// 4. 高级选项 - 服务地址（可折叠）
		this.createAdvancedUrlSetting(containerEl, currentProvider, 'text');
	}

	/**
	 * 视觉模型配置
	 */
	private displayVisionModelSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '视觉模型配置' });

		const currentProvider = this.plugin.settings.visionProvider;
		const providerConfig = this.plugin.settings.providers.vision[currentProvider];

		// 1. 视觉 AI 服务
		new Setting(containerEl)
			.setName('视觉理解 AI 服务')
			.setDesc('选择用于图片识别的 AI 服务提供商')
			.addDropdown(dropdown => {
				dropdown
					.addOption(AIProvider.ZHIPU, getProviderDisplayName(AIProvider.ZHIPU))
					.addOption(AIProvider.OPENAI, getProviderDisplayName(AIProvider.OPENAI))
					.addOption(AIProvider.DEEPSEEK, getProviderDisplayName(AIProvider.DEEPSEEK))
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
		const docUrls = {
			[AIProvider.ZHIPU]: 'https://open.bigmodel.cn/',
			[AIProvider.OPENAI]: 'https://platform.openai.com/',
			[AIProvider.DEEPSEEK]: 'https://platform.deepseek.com/',
			[AIProvider.GEMINI]: 'https://ai.google.dev/'
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

		// 4. 高级选项 - 服务地址（可折叠）
		this.createAdvancedUrlSetting(containerEl, currentProvider, 'vision');
	}

	/**
	 * 创建高级选项 - 服务地址（可折叠）
	 */
	private createAdvancedUrlSetting(
		containerEl: HTMLElement,
		provider: AIProvider,
		type: 'text' | 'vision'
	): void {
		const providerConfig = type === 'text'
			? this.plugin.settings.providers.text[provider]
			: this.plugin.settings.providers.vision[provider];

		// 默认 URL 映射
		const defaultUrls = {
			[AIProvider.ZHIPU]: 'https://open.bigmodel.cn/api/paas/v4',
			[AIProvider.OPENAI]: 'https://api.openai.com/v1',
			[AIProvider.DEEPSEEK]: 'https://api.deepseek.com/v1',
			[AIProvider.GEMINI]: 'https://generativelanguage.googleapis.com/v1beta/openai'
		};

		// 创建高级选项容器（默认折叠）
		const advancedContainer = containerEl.createDiv({ cls: 'setting-item-advanced' });
		advancedContainer.style.display = 'none';

		// 高级选项切换按钮
		const toggleSetting = new Setting(containerEl)
			.setName('高级选项')
			.setDesc('配置自定义服务地址（代理或私有部署）')
			.addButton(button => {
				button
					.setButtonText('展开 ▼')
					.onClick(() => {
						const isHidden = advancedContainer.style.display === 'none';
						advancedContainer.style.display = isHidden ? 'block' : 'none';
						button.setButtonText(isHidden ? '收起 ▲' : '展开 ▼');
					});
			});

		// 服务地址配置（在折叠容器内）
		new Setting(advancedContainer)
			.setName('服务地址')
			.setDesc(`默认: ${defaultUrls[provider]}`)
			.addText(text => text
				.setPlaceholder(defaultUrls[provider])
				.setValue(providerConfig.baseUrl)
				.onChange(async (value) => {
					providerConfig.baseUrl = value || defaultUrls[provider];
					await this.plugin.saveSettings();
				}));
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

		new Setting(containerEl)
			.setName('输出文件名模板')
			.setDesc('使用 {name} 代表原文件名,例如: {name}_AI整理')
			.addText(text => text
				.setPlaceholder('{name}_AI整理')
				.setValue(this.plugin.settings.outputFileNameTemplate)
				.onChange(async (value) => {
					this.plugin.settings.outputFileNameTemplate = value || '{name}_AI整理';
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
