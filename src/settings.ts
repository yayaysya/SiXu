import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import NotebookLLMPlugin from './main';
import { NotebookLLMSettings, PromptTemplate } from './types';
import { validateApiKey } from './api/zhipu';
import { BUILTIN_TEMPLATES, getAllTemplates } from './prompts/templates';

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

		containerEl.createEl('h2', { text: 'Notebook LLM 设置' });

		// API 设置
		this.displayApiSettings(containerEl);

		// 模型设置
		this.displayModelSettings(containerEl);

		// 处理设置
		this.displayProcessSettings(containerEl);

		// 提示词模板设置
		this.displayPromptSettings(containerEl);

		// 输出设置
		this.displayOutputSettings(containerEl);
	}

	/**
	 * API 设置
	 */
	private displayApiSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: 'API 设置' });

		// API Key
		new Setting(containerEl)
			.setName('智谱 AI API Key')
			.setDesc('在智谱AI开放平台获取: https://open.bigmodel.cn/')
			.addText(text => text
				.setPlaceholder('输入你的 API Key')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('验证')
				.onClick(async () => {
					const notice = new Notice('正在验证 API Key...', 0);
					try {
						const isValid = await validateApiKey(
							this.plugin.settings.apiKey,
							this.plugin.settings.apiBaseUrl
						);

						notice.hide();
						if (isValid) {
							new Notice('✅ API Key 验证成功!');
						} else {
							new Notice('❌ API Key 验证失败,请检查是否正确');
						}
					} catch (error) {
						notice.hide();
						new Notice('❌ 验证失败: ' + error.message);
					}
				}));

		// API Base URL (高级选项)
		new Setting(containerEl)
			.setName('API Base URL')
			.setDesc('默认即可,除非使用代理')
			.addText(text => text
				.setPlaceholder('https://open.bigmodel.cn/api/paas/v4')
				.setValue(this.plugin.settings.apiBaseUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiBaseUrl = value || 'https://open.bigmodel.cn/api/paas/v4';
					await this.plugin.saveSettings();
				}));
	}

	/**
	 * 模型设置
	 */
	private displayModelSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h3', { text: '模型设置' });

		// 文本生成模型
		new Setting(containerEl)
			.setName('文本生成模型')
			.setDesc('用于生成文章和总结网页内容')
			.addDropdown(dropdown => dropdown
				.addOption('glm-4.6', 'GLM-4.6 - 最新高质量模型 (默认推荐)')
				.addOption('glm-4.5', 'GLM-4.5 - 高质量平衡模型')
				.addOption('glm-4.5-air', 'GLM-4.5-Air - 轻量快速版')
				.addOption('glm-4.5-flash', 'GLM-4.5-Flash - 超快速版')
				.addOption('glm-4-plus', 'GLM-4-Plus - 增强版')
				.addOption('glm-4-flash', 'GLM-4-Flash - 快速版')
				.setValue(this.plugin.settings.textModel)
				.onChange(async (value) => {
					this.plugin.settings.textModel = value;
					await this.plugin.saveSettings();
				}));

		// 视觉识别模型
		new Setting(containerEl)
			.setName('视觉识别模型')
			.setDesc('用于识别图片内容')
			.addDropdown(dropdown => dropdown
				.addOption('glm-4.5v', 'GLM-4.5V - 最新视觉模型 (推荐)')
				.addOption('glm-4v-plus', 'GLM-4V-Plus - 增强版')
				.setValue(this.plugin.settings.visionModel)
				.onChange(async (value) => {
					this.plugin.settings.visionModel = value;
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
							this.display();
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
				this.display();
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
				this.display();
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
	private systemPromptInput: HTMLTextAreaElement;
	private userPromptInput: HTMLTextAreaElement;

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

		// 系统提示词
		const systemDiv = contentEl.createDiv({ cls: 'setting-item' });
		systemDiv.createEl('div', { text: '系统提示词', cls: 'setting-item-name' });
		this.systemPromptInput = systemDiv.createEl('textarea');
		this.systemPromptInput.value = this.template?.systemPrompt || '';
		this.systemPromptInput.rows = 8;
		this.systemPromptInput.style.width = '100%';

		// 用户提示词模板
		const userDiv = contentEl.createDiv({ cls: 'setting-item' });
		userDiv.createEl('div', {
			text: '用户提示词模板 (使用 {content}, {images_section}, {links_section})',
			cls: 'setting-item-name'
		});
		this.userPromptInput = userDiv.createEl('textarea');
		this.userPromptInput.value = this.template?.userPromptTemplate || '';
		this.userPromptInput.rows = 8;
		this.userPromptInput.style.width = '100%';

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
		const systemPrompt = this.systemPromptInput.value.trim();
		const userPromptTemplate = this.userPromptInput.value.trim();

		if (!name || !systemPrompt || !userPromptTemplate) {
			new Notice('请填写所有必填字段');
			return;
		}

		const template: PromptTemplate = {
			id: this.template?.id || `custom_${Date.now()}`,
			name,
			description,
			systemPrompt,
			userPromptTemplate
		};

		this.onSubmit(template);
		this.close();
	}
}
