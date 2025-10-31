import { setIcon } from 'obsidian';

interface Achievement {
    id: string;
    name: string;
    icon: string;
    description: string;
    earnedDate?: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

export class AchievementCard {
    private container: HTMLElement;
    private achievements: Achievement[];

    constructor(container: HTMLElement, achievements: Achievement[] = []) {
        this.container = container;
        this.achievements = achievements.length > 0 ? achievements : this.getDefaultAchievements();
        this.render();
    }

    private getDefaultAchievements(): Achievement[] {
        return [
            {
                id: 'first_flashcard',
                name: '初学者',
                icon: '🎯',
                description: '创建了第一张闪卡',
                rarity: 'common'
            },
            {
                id: 'flashcard_master',
                name: '闪卡大师',
                icon: '🧠',
                description: '掌握了100张闪卡',
                rarity: 'epic'
            },
            {
                id: 'quiz_champion',
                name: 'Quiz冠军',
                icon: '🏆',
                description: 'Quiz平均正确率达到90%',
                rarity: 'rare'
            },
            {
                id: 'learning_pioneer',
                name: '学习先锋',
                icon: '🚀',
                description: '连续学习30天',
                rarity: 'rare'
            },
            {
                id: 'content_creator',
                name: '内容创作者',
                icon: '✍️',
                description: '整理了50篇笔记',
                rarity: 'common'
            },
            {
                id: 'knowledge_builder',
                name: '知识构建者',
                icon: '🏗️',
                description: '创建了10个学习路径',
                rarity: 'epic'
            },
            {
                id: 'ai_collaborator',
                name: 'AI协作者',
                icon: '🤖',
                description: '使用AI功能100次',
                rarity: 'common'
            },
            {
                id: 'perfectionist',
                name: '完美主义者',
                icon: '💎',
                description: '所有Quiz都获得满分',
                rarity: 'legendary'
            },
            {
                id: 'explorer',
                name: '探索者',
                icon: '🔍',
                description: '尝试了所有功能模块',
                rarity: 'rare'
            }
        ];
    }

    private render(): void {
        const card = this.container.createDiv({ cls: 'achievement-card profile-card' });

        const header = card.createDiv({ cls: 'card-header' });
        header.createDiv({ cls: 'card-title' }).setText('我的勋章');
        header.createDiv({ cls: 'achievement-count' }).setText(`${this.achievements.length}枚`);

        const scrollContainer = card.createDiv({ cls: 'achievements-scroll-container' });

        const achievementsList = scrollContainer.createDiv({ cls: 'achievements-list' });

        this.achievements.forEach(achievement => {
            const achievementEl = achievementsList.createDiv({
                cls: `achievement-badge rarity-${achievement.rarity}`
            });

            const iconEl = achievementEl.createDiv({ cls: 'achievement-icon' });
            iconEl.setText(achievement.icon);

            const nameEl = achievementEl.createDiv({ cls: 'achievement-name' });
            nameEl.setText(achievement.name);

            // 添加悬浮提示
            achievementEl.setAttr('title', `${achievement.name}: ${achievement.description}`);

            // 点击事件
            achievementEl.onClickEvent(() => {
                this.showAchievementDetail(achievement);
            });
        });

        console.log('用户勋章卡片已渲染', {
            totalAchievements: this.achievements.length,
            rarityDistribution: this.getRarityDistribution()
        });
    }

    private getRarityDistribution(): Record<string, number> {
        return this.achievements.reduce((acc, achievement) => {
            acc[achievement.rarity] = (acc[achievement.rarity] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }

    private showAchievementDetail(achievement: Achievement): void {
        // 创建临时的详情展示
        const detailEl = document.createElement('div');
        detailEl.className = 'achievement-detail-popup';
        detailEl.innerHTML = `
            <div class="achievement-detail-content">
                <div class="achievement-detail-icon">${achievement.icon}</div>
                <div class="achievement-detail-name">${achievement.name}</div>
                <div class="achievement-detail-description">${achievement.description}</div>
                <div class="achievement-detail-rarity rarity-${achievement.rarity}">
                    ${this.getRarityText(achievement.rarity)}
                </div>
                ${achievement.earnedDate ?
                    `<div class="achievement-detail-date">获得时间: ${achievement.earnedDate}</div>` :
                    ''}
            </div>
        `;

        document.body.appendChild(detailEl);

        // 点击外部关闭
        setTimeout(() => {
            detailEl.addEventListener('click', () => {
                detailEl.remove();
            });
        }, 100);

        // 自动关闭
        setTimeout(() => {
            if (detailEl.parentNode) {
                detailEl.remove();
            }
        }, 3000);
    }

    private getRarityText(rarity: string): string {
        const rarityMap = {
            common: '普通',
            rare: '稀有',
            epic: '史诗',
            legendary: '传说'
        };
        return rarityMap[rarity as keyof typeof rarityMap] || '未知';
    }

    public addAchievement(achievement: Achievement): void {
        this.achievements.push(achievement);
        this.render();
    }

    public updateAchievements(newAchievements: Achievement[]): void {
        this.achievements = newAchievements;
        this.render();
    }
}