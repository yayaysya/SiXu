import { App, Modal, Notice, setIcon } from 'obsidian';

interface FeatureInfo {
    icon: string;
    title: string;
    description: string;
    color: 'blue' | 'green' | 'orange' | 'purple';
}

interface UserReview {
    username: string;
    avatar: string;
    rating: number;
    comment: string;
    date: string;
}

export class AboutModal extends Modal {
    constructor(app: App) {
        super(app);
        this.modalEl.addClass('about-modal');
        this.modalEl.addClass('profile-modal');
    }

    onOpen() {
        this.modalEl.empty();
        this.render();
    }

    private render(): void {
        const container = this.modalEl.createDiv({ cls: 'about-modal-container' });

        // 头部 - 产品介绍
        this.renderProductHeader(container);

        // 产品愿景
        this.renderProductVision(container);

        // 使用场景
        this.renderUsageScenarios(container);

        // 核心功能
        this.renderCoreFeatures(container);

        // 版本更新日志
        this.renderChangelog(container);

        // 底部信息
        this.renderFooter(container);

        console.log('关于我们弹窗已渲染');
    }

    private renderProductHeader(container: HTMLElement): void {
        const header = container.createDiv({ cls: 'about-header' });

        const closeBtn = header.createDiv({ cls: 'modal-close-btn' });
        setIcon(closeBtn, 'x');
        closeBtn.onClickEvent(() => this.close());

        const logoSection = header.createDiv({ cls: 'logo-section' });
        const logo = logoSection.createDiv({ cls: 'product-logo' });
        logo.setText('🎓');

        const titleSection = logoSection.createDiv({ cls: 'title-section' });
        const productName = titleSection.createDiv({ cls: 'product-name' });
        productName.setText('思序');

        const productTagline = titleSection.createDiv({ cls: 'product-tagline' });
        productTagline.setText('AI 驱动的智能学习生态系统');
        const version = titleSection.createDiv({ cls: 'product-version' });
        version.setText('v1.0.0');
    }

    private renderProductVision(container: HTMLElement): void {
        const visionSection = container.createDiv({ cls: 'vision-section' });

        const sectionTitle = visionSection.createEl('h2', { text: '产品愿景' });

        const visionContent = visionSection.createDiv({ cls: 'vision-content' });

        const visionIcon = visionContent.createDiv({ cls: 'vision-icon' });
        visionIcon.setText('🌟');

        const visionText = visionContent.createDiv({ cls: 'vision-text' });
        visionText.innerHTML = `
            <p>我们致力于将最先进的人工智能技术与教育学习相结合，为每一位学习者提供个性化、高效、科学的智能学习体验。</p>
            <p>通过AI辅助的知识整理、科学的记忆算法、智能的学习路径规划，帮助用户构建完整的知识体系，实现高效的学习成长。</p>
        `;
    }

    private renderUsageScenarios(container: HTMLElement): void {
        const scenariosSection = container.createDiv({ cls: 'scenarios-section' });

        const sectionTitle = scenariosSection.createEl('h2', { text: '使用场景' });

        const scenariosGrid = scenariosSection.createDiv({ cls: 'scenarios-grid' });

        const scenarios = [
            {
                icon: '🎓',
                title: '学生群体',
                description: '课堂笔记整理、知识点复习、考试准备',
                users: '10万+'
            },
            {
                icon: '💼',
                title: '职场人士',
                description: '会议纪要整理、技能学习、知识管理',
                users: '5万+'
            },
            {
                icon: '🗣️',
                title: '语言学习者',
                description: '词汇记忆、语法练习、口语素材整理',
                users: '3万+'
            },
            {
                icon: '🎨',
                title: '内容创作者',
                description: '灵感收集、素材整理、知识沉淀',
                users: '2万+'
            }
        ];

        scenarios.forEach(scenario => {
            this.createScenarioCard(scenariosGrid, scenario);
        });
    }

    private createScenarioCard(container: HTMLElement, scenario: any): void {
        const card = container.createDiv({ cls: 'scenario-card' });

        const iconEl = card.createDiv({ cls: 'scenario-icon' });
        iconEl.setText(scenario.icon);

        const contentEl = card.createDiv({ cls: 'scenario-content' });

        const titleEl = contentEl.createDiv({ cls: 'scenario-title' });
        titleEl.setText(scenario.title);

        const descEl = contentEl.createDiv({ cls: 'scenario-description' });
        descEl.setText(scenario.description);
    }

    private renderCoreFeatures(container: HTMLElement): void {
        const featuresSection = container.createDiv({ cls: 'features-section' });

        const sectionTitle = featuresSection.createEl('h2', { text: '核心功能' });

        const features: FeatureInfo[] = [
            {
                icon: '🎯',
                title: '智能闪卡系统',
                description: '基于SM-2间隔重复算法，科学安排复习时间，AI自动提取知识点创建闪卡',
                color: 'blue'
            },
            {
                icon: '📝',
                title: 'Quiz智能测评',
                description: '4种题型自动生成，AI智能评分，详细的学习报告和知识点解析',
                color: 'green'
            },
            {
                icon: '🧠',
                title: '智能笔记整理',
                description: '多模态AI处理，自动重组笔记结构，维护Markdown格式和元数据',
                color: 'orange'
            },
            {
                icon: '🛤️',
                title: '学习路径规划',
                description: '结构化学习流程管理，智能推荐学习内容，进度可视化追踪',
                color: 'purple'
            }
        ];

        const featuresGrid = featuresSection.createDiv({ cls: 'features-grid' });

        features.forEach(feature => {
            this.createFeatureCard(featuresGrid, feature);
        });
    }

    private createFeatureCard(container: HTMLElement, feature: FeatureInfo): void {
        const card = container.createDiv({ cls: `feature-card feature-${feature.color}` });

        const iconSection = card.createDiv({ cls: 'feature-icon-section' });
        const iconEl = iconSection.createDiv({ cls: 'feature-icon' });
        iconEl.setText(feature.icon);

        const contentSection = card.createDiv({ cls: 'feature-content-section' });

        const titleEl = contentSection.createDiv({ cls: 'feature-title' });
        titleEl.setText(feature.title);

        const descEl = contentSection.createDiv({ cls: 'feature-description' });
        descEl.setText(feature.description);
    }

    private renderChangelog(container: HTMLElement): void {
        const changelogSection = container.createDiv({ cls: 'changelog-section' });

        const sectionTitle = changelogSection.createEl('h2', { text: '版本更新日志' });

        const changelogList = changelogSection.createDiv({ cls: 'changelog-list' });

        const updates = [
            {
                version: 'v1.0.0',
                date: '2024-10-15',
                type: 'major',
                changes: [
                    '✨ 全新闪卡学习系统 - 基于SM-2间隔重复算法',
                    '📱 移动端完美适配 - 触摸优化，手势操作',
                    '🤖 AI智能生成 - 自动从笔记提取知识点制作闪卡',
                    '📊 学习数据可视化 - 进度追踪，成就系统'
                ]
            },
            {
                version: 'v0.9.5',
                date: '2024-09-20',
                type: 'minor',
                changes: [
                    '🐛 修复Quiz评分系统的已知问题',
                    '⚡ 优化AI处理速度，提升响应性能',
                    '🎨 界面美化，新增多套配色方案'
                ]
            }
        ];

        updates.forEach(update => {
            this.createChangelogItem(changelogList, update);
        });
    }

    private createChangelogItem(container: HTMLElement, update: any): void {
        const item = container.createDiv({ cls: `changelog-item changelog-${update.type}` });

        const header = item.createDiv({ cls: 'changelog-header' });

        const version = header.createDiv({ cls: 'changelog-version' });
        version.setText(update.version);

        const date = header.createDiv({ cls: 'changelog-date' });
        date.setText(update.date);

        const typeBadge = header.createDiv({ cls: `changelog-type changelog-badge-${update.type}` });
        typeBadge.setText(update.type === 'major' ? '主要版本' : '次要版本');

        const changesList = item.createDiv({ cls: 'changelog-changes' });
        update.changes.forEach((change: string) => {
            const changeItem = changesList.createDiv({ cls: 'changelog-change' });
            changeItem.setText(change);
        });
    }

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv({ cls: 'about-footer' });

        const linksSection = footer.createDiv({ cls: 'footer-links' });

        const links = [
            { title: '官方网站', url: 'https://notebook-llm.example.com' },
            { title: '使用教程', url: 'https://docs.notebook-llm.example.com' },
            { title: 'GitHub仓库', url: 'https://github.com/example/notebook-llm' },
            { title: '用户协议', url: 'https://notebook-llm.example.com/terms' }
        ];

        links.forEach(link => {
            const linkEl = linksSection.createDiv({ cls: 'footer-link' });
            linkEl.setText(link.title);
            linkEl.onClickEvent(() => window.open(link.url, '_blank'));
        });

        const copyright = footer.createDiv({ cls: 'footer-copyright' });
        copyright.setText('© 2024 思序团队. All rights reserved.');
    }

    onClose() {
        console.log('关于我们弹窗已关闭');
    }
}