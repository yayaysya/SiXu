import { setIcon } from 'obsidian';

interface StatItem {
    id: string;
    label: string;
    value: string | number;
    icon: string;
    unit?: string;
    progress?: number; // 0-100
    color?: 'green' | 'blue' | 'orange' | 'purple';
}

export class StatsOverviewCard {
    private container: HTMLElement;
    private stats: StatItem[];

    constructor(container: HTMLElement, statsData?: Partial<StatItem>[]) {
        this.container = container;
        this.stats = statsData ? this.processStatsData(statsData) : this.getDefaultStats();
        this.render();
    }

    private processStatsData(data: Partial<StatItem>[]): StatItem[] {
        const defaultStats: StatItem[] = [
            {
                id: 'mastered_flashcards',
                label: '掌握闪卡',
                value: 0,
                icon: '🎯',
                unit: '张',
                color: 'blue'
            },
            {
                id: 'quiz_accuracy',
                label: 'Quiz正确率',
                value: 0,
                icon: '📝',
                unit: '%',
                color: 'green'
            },
            {
                id: 'combined_notes',
                label: '组合笔记',
                value: 0,
                icon: '📚',
                unit: '篇',
                color: 'orange'
            },
            {
                id: 'total_study_time',
                label: '总学习时长',
                value: 0,
                icon: '⏰',
                unit: '小时',
                color: 'purple'
            }
        ];

        return defaultStats.map(stat => {
            const override = data.find(d => d.id === stat.id);
            return { ...stat, ...override };
        });
    }

    private getDefaultStats(): StatItem[] {
        return [
            {
                id: 'mastered_flashcards',
                label: '掌握闪卡',
                value: 156,
                icon: '🎯',
                unit: '张',
                progress: 78,
                color: 'blue'
            },
            {
                id: 'quiz_accuracy',
                label: 'Quiz正确率',
                value: 85.5,
                icon: '📝',
                unit: '%',
                progress: 85.5,
                color: 'green'
            },
            {
                id: 'combined_notes',
                label: '组合笔记',
                value: 42,
                icon: '📚',
                unit: '篇',
                progress: 70,
                color: 'orange'
            },
            {
                id: 'total_study_time',
                value: 168.5,
                label: '总学习时长',
                icon: '⏰',
                unit: '小时',
                progress: 60,
                color: 'purple'
            }
        ];
    }

    private render(): void {
        const card = this.container.createDiv({ cls: 'stats-overview-card profile-card' });

        const header = card.createDiv({ cls: 'card-header' });
        header.createDiv({ cls: 'card-title' }).setText('生涯总览');

        const grid = card.createDiv({ cls: 'stats-grid' });

        this.stats.forEach(stat => {
            const statCard = this.createStatCard(stat);
            grid.appendChild(statCard);
        });

        console.log('生涯总览卡片已渲染', {
            stats: this.stats.map(s => ({
                id: s.id,
                label: s.label,
                value: s.value
            }))
        });
    }

    private createStatCard(stat: StatItem): HTMLElement {
        const card = document.createElement('div');
        card.className = `stat-card stat-${stat.color}`;

        // 图标区域
        const iconSection = card.createDiv({ cls: 'stat-icon-section' });
        const iconEl = iconSection.createDiv({ cls: 'stat-icon' });
        iconEl.setText(stat.icon);

        // 数值区域
        const valueSection = card.createDiv({ cls: 'stat-value-section' });

        const valueEl = valueSection.createDiv({ cls: 'stat-value' });
        valueEl.setText(`${this.formatValue(stat.value)}${stat.unit || ''}`);

        const labelEl = valueSection.createDiv({ cls: 'stat-label' });
        labelEl.setText(stat.label);

        // 进度条
        if (stat.progress !== undefined) {
            const progressContainer = card.createDiv({ cls: 'progress-container' });
            const progressBar = progressContainer.createDiv({ cls: 'progress-bar' });
            const progressFill = progressBar.createDiv({ cls: 'progress-fill' });

            progressFill.style.width = `${Math.min(Math.max(stat.progress, 0), 100)}%`;
            progressFill.addClass(`progress-${stat.color}`);

            // 进度百分比标签
            const progressText = progressContainer.createDiv({ cls: 'progress-text' });
            progressText.setText(`${Math.round(stat.progress)}%`);
        }

        // 添加点击事件
        card.onClickEvent(() => {
            this.showStatDetail(stat);
        });

        return card;
    }

    private formatValue(value: string | number): string {
        if (typeof value === 'number') {
            if (value >= 1000000) {
                return `${(value / 1000000).toFixed(1)}M`;
            } else if (value >= 1000) {
                return `${(value / 1000).toFixed(1)}K`;
            } else if (Number.isInteger(value)) {
                return value.toString();
            } else {
                return value.toFixed(1);
            }
        }
        return value.toString();
    }

    private showStatDetail(stat: StatItem): void {
        // 创建详情弹窗
        const detailEl = document.createElement('div');
        detailEl.className = 'stat-detail-popup';

        const detailContent = detailEl.createDiv({ cls: 'stat-detail-content' });

        const iconDetail = detailContent.createDiv({ cls: 'stat-detail-icon' });
        iconDetail.setText(stat.icon);

        const titleDetail = detailContent.createDiv({ cls: 'stat-detail-title' });
        titleDetail.setText(stat.label);

        const valueDetail = detailContent.createDiv({ cls: 'stat-detail-value' });
        valueDetail.setText(`${this.formatValue(stat.value)}${stat.unit || ''}`);

        if (stat.progress !== undefined) {
            const progressDetail = detailContent.createDiv({ cls: 'stat-detail-progress' });
            const progressCircle = progressDetail.createDiv({ cls: 'progress-circle' });

            const circumference = 2 * Math.PI * 45;
            const offset = circumference - (stat.progress / 100) * circumference;

            progressCircle.innerHTML = `
                <svg width="100" height="100">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="var(--background-modifier-border)" stroke-width="8"/>
                    <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-${stat.color})" stroke-width="8"
                            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                            stroke-linecap="round" transform="rotate(-90 50 50)"/>
                    <text x="50" y="50" text-anchor="middle" dy="0.3em" fill="var(--text-normal)" font-size="20" font-weight="bold">
                        ${Math.round(stat.progress)}%
                    </text>
                </svg>
            `;
        }

        // 关闭按钮
        const closeBtn = detailContent.createDiv({ cls: 'stat-detail-close' });
        setIcon(closeBtn, 'x');
        closeBtn.onClickEvent(() => detailEl.remove());

        document.body.appendChild(detailEl);

        // 点击外部关闭
        setTimeout(() => {
            detailEl.addEventListener('click', (e) => {
                if (e.target === detailEl) {
                    detailEl.remove();
                }
            });
        }, 100);
    }

    public updateStats(newStatsData: Partial<StatItem>[]): void {
        this.stats = this.processStatsData(newStatsData);
        this.render();
    }

    public updateSingleStat(id: string, updates: Partial<StatItem>): void {
        const statIndex = this.stats.findIndex(s => s.id === id);
        if (statIndex !== -1) {
            this.stats[statIndex] = { ...this.stats[statIndex], ...updates };
            this.render();
        }
    }
}