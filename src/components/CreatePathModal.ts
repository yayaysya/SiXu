import { App, Modal, Notice, Setting } from 'obsidian';
import { LearningPathConfig, DEPTH_LABELS } from '../learningPath/types';

/**
 * 学习路径创建模态框
 */
export class CreatePathModal extends Modal {
	private config: LearningPathConfig | null = null;
	private onSubmit: (config: LearningPathConfig | null) => void;

	// 表单元素
	private topicInput: HTMLInputElement;
	private depthRadios: { value: string; radio: HTMLInputElement }[] = [];
	private backgroundTextarea: HTMLTextAreaElement;
	private directoryInput: HTMLInputElement;

	constructor(
		app: App,
		onSubmit: (config: LearningPathConfig | null) => void
	) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();

		// 添加自定义类名
		this.modalEl.addClass('create-path-modal');
		this.modalEl.addClass('learning-path-modal');

		// 标题
		contentEl.createEl('h2', { text: '🗺️ 创建学习路径', cls: 'modal-title' });
		contentEl.createEl('p', { text: '告诉我您想学习什么，AI将为您生成完整的学习计划', cls: 'modal-subtitle' });

		// 主题输入（避免多余的 setting-item 容器，直接挂载到 contentEl）
		new Setting(contentEl)
			.setName('学习主题 *')
			.setDesc('您想要学习的主题或技能（例如：CSS语法、Python编程、机器学习入门）')
			.addText(text => {
				this.topicInput = text.inputEl;
				text.inputEl.placeholder = '请输入学习主题...';
				text.inputEl.value = '';
				// 自动聚焦
				setTimeout(() => text.inputEl.focus(), 100);
			});

		// 学习深度选择
		
		// 为了更好的视觉效果，我们使用自定义的单选按钮组
		const depthRadioContainer = contentEl.createDiv({ cls: 'depth-selection-container' });
		depthRadioContainer.createEl('label', { text: '学习深度', cls: 'setting-label' });

		const depthOptions = [
			{ value: 'quick', label: '⚡ 快速入门', desc: '1-2小时掌握基础概念' },
			{ value: 'deep', label: '🔬 深入探究', desc: '系统性学习，理论与实践并重' },
			{ value: 'project', label: '🛠️ 项目实战', desc: '通过实际项目学习应用' }
		];

		const depthOptionsContainer = depthRadioContainer.createDiv({ cls: 'depth-options' });
		depthOptions.forEach((option, index) => {
			const optionContainer = depthOptionsContainer.createDiv({ cls: 'depth-option' });
			if (index === 0) optionContainer.addClass('selected');

			const radio = optionContainer.createEl('input', { type: 'radio' });
			radio.setAttribute('name', 'depth');
			radio.value = option.value;
			if (index === 0) radio.checked = true;

			const label = optionContainer.createEl('label');
			const titleDiv = label.createDiv({ cls: 'depth-title', text: option.label });
			const descDiv = label.createDiv({ cls: 'depth-desc', text: option.desc });

			this.depthRadios.push({ value: option.value, radio });

			// 点击事件 - 绑定到整个选项容器
			const selectOption = () => {
				this.depthRadios.forEach(({ radio, value }) => {
					radio.checked = value === option.value;
					radio.parentElement?.toggleClass('selected', value === option.value);
				});
			};

			// 整个容器可点击
			optionContainer.addEventListener('click', (e) => {
				// 防止点击radio时重复触发
				if (e.target !== radio) {
					selectOption();
				}
			});

			// label也可点击（保持原有行为）
			label.addEventListener('click', (e) => {
				e.preventDefault(); // 防止label的默认行为影响radio状态
				selectOption();
			});

			// radio本身的点击事件
			radio.addEventListener('click', (e) => {
				e.stopPropagation(); // 防止事件冒泡到容器
				selectOption();
			});
		});

		// 背景知识输入（直接挂载到 contentEl，避免嵌套 setting-item）
		new Setting(contentEl)
			.setName('背景知识（选填）')
			.setDesc('描述您的相关背景或基础知识，AI将据此调整内容难度')
			.addTextArea(text => {
				this.backgroundTextarea = text.inputEl;
				text.inputEl.placeholder = '例如：我有一些HTML基础，但对CSS完全不了解...';
				text.inputEl.rows = 3;
				text.inputEl.style.width = '100%';
				text.inputEl.style.resize = 'vertical';
			});

		// 目标目录设置（直接挂载到 contentEl，避免嵌套 setting-item）
		new Setting(contentEl)
			.setName('保存位置')
			.setDesc('学习路径将保存在此目录下')
			.addText(text => {
				this.directoryInput = text.inputEl;
				text.inputEl.value = 'LearningPaths';
				text.inputEl.placeholder = 'LearningPaths';
			});

		// 按钮
		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });

		const cancelBtn = buttonContainer.createEl('button', {
			text: '取消',
			cls: 'modal-cancel-button'
		});
		cancelBtn.addEventListener('click', () => {
			this.config = null;
			this.close();
		});

		const generateBtn = buttonContainer.createEl('button', {
			text: '🚀 生成我的学习地图',
			cls: 'mod-cta modal-confirm-button'
		});
		generateBtn.addEventListener('click', () => {
			this.submit();
		});

		// 回车提交
		this.topicInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				this.submit();
			}
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.onSubmit(this.config);
	}

	private submit(): void {
		// 验证必填字段
		const topic = this.topicInput.value.trim();
		if (!topic) {
			new Notice('请输入学习主题');
			this.topicInput.focus();
			return;
		}

		// 获取选中的深度
		const selectedDepth = this.depthRadios.find(({ radio }) => radio.checked)?.value || 'quick';

		// 获取背景知识
		const background = this.backgroundTextarea.value.trim() || undefined;

		// 获取目标目录
		const targetDirectory = this.directoryInput.value.trim() || 'LearningPaths';

		// 构建配置
		this.config = {
			topic,
			depth: selectedDepth as 'quick' | 'deep' | 'project',
			background,
			targetDirectory
		};

		// 显示加载提示
		const generateBtn = this.contentEl.querySelector('.modal-confirm-button') as HTMLButtonElement;
		if (generateBtn) {
			generateBtn.textContent = '⏳ 生成中...';
			generateBtn.disabled = true;
		}

		// 延迟关闭以显示加载状态
		setTimeout(() => {
			this.close();
		}, 300);
	}

	/**
	 * 验证表单
	 */
	private validateForm(): string | null {
		const topic = this.topicInput.value.trim();
		if (!topic) {
			return '请输入学习主题';
		}

		if (topic.length < 2) {
			return '学习主题至少需要2个字符';
		}

		if (topic.length > 100) {
			return '学习主题不能超过100个字符';
		}

		const directory = this.directoryInput.value.trim();
		if (!directory) {
			return '请输入保存位置';
		}

		return null; // 验证通过
	}
}
