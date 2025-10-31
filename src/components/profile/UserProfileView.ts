import { App, Notice } from 'obsidian';
import { BasicInfoCard } from './BasicInfoCard';
import { AchievementCard } from './AchievementCard';
import { StatsOverviewCard } from './StatsOverviewCard';
import { ManagementCenter } from './ManagementCenter';

interface UserProfile {
    avatar?: string;
    username: string;
    studyDays: number;
    level: number;
    achievements?: any[];
    stats?: any[];
}

export class UserProfileView {
    private container: HTMLElement;
    private app: App;
    private userProfile: UserProfile;
    private components: any[] = [];

    constructor(container: HTMLElement, app: App) {
        this.container = container;
        this.app = app;
        this.userProfile = this.getDefaultUserProfile();
        // 不再在构造函数中自动调用render，由外部控制渲染时机
    }

    private getDefaultUserProfile(): UserProfile {
        return {
            username: '学习达人',
            studyDays: 45,
            level: 5,
            avatar: undefined,
            stats: this.getDefaultStats()
        };
    }

    private getDefaultStats(): any[] {
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

    public render(): void {
        this.container.empty();
        this.container.addClass('user-profile-view');

        // 创建内容包装容器（类似学习页面的learning-hub）
        const contentWrapper = this.container.createDiv({ cls: 'profile-content-wrapper' });

        // 创建页面标题
        this.renderPageHeader(contentWrapper);

        // 创建内容区域容器（类似学习页面的learning-options）
        const contentArea = contentWrapper.createDiv({ cls: 'profile-content-area' });

        // 在内容区域中渲染各个卡片组件
        this.renderBasicInfo(contentArea);
        this.renderAchievements(contentArea);
        this.renderStatsOverview(contentArea);
        this.renderManagementCenter(contentArea);

        console.log('个人资料界面已完整渲染', {
            username: this.userProfile.username,
            componentsCount: this.components.length
        });
    }

    private renderPageHeader(container: HTMLElement): void {
        // 在传入的容器中创建标题元素
        container.createEl('h2', { text: '我的', cls: 'page-title' });
        container.createEl('p', { text: '个人信息以及学习生涯', cls: 'page-subtitle' });
    }

    private renderBasicInfo(container: HTMLElement): void {
        const cardContainer = container.createDiv({ cls: 'profile-card-container' });
        const basicInfoCard = new BasicInfoCard(cardContainer, this.app, this.userProfile);
        this.components.push(basicInfoCard);
    }

    private renderAchievements(container: HTMLElement): void {
        const cardContainer = container.createDiv({ cls: 'profile-card-container' });
        const achievementCard = new AchievementCard(cardContainer, this.userProfile.achievements);
        this.components.push(achievementCard);
    }

    private renderStatsOverview(container: HTMLElement): void {
        const cardContainer = container.createDiv({ cls: 'profile-card-container' });
        // 传递统计数据到 StatsOverviewCard 构造函数
        const statsCard = new StatsOverviewCard(cardContainer, this.userProfile.stats);
        this.components.push(statsCard);
    }

    private renderManagementCenter(container: HTMLElement): void {
        const cardContainer = container.createDiv({ cls: 'profile-card-container' });
        const managementCenter = new ManagementCenter(cardContainer, this.app);
        this.components.push(managementCenter);
    }

    // 更新用户基本信息
    public updateUserInfo(newInfo: Partial<UserProfile>): void {
        Object.assign(this.userProfile, newInfo);

        // 更新基本信息卡片
        const basicInfoComponent = this.components[0];
        if (basicInfoComponent && basicInfoComponent.updateUserInfo) {
            basicInfoComponent.updateUserInfo(this.userProfile);
        }

        console.log('用户信息已更新', newInfo);
    }

    // 更新统计数据
    public updateStats(newStats: any[]): void {
        this.userProfile.stats = newStats;

        // 更新统计卡片
        const statsComponent = this.components[2];
        if (statsComponent && statsComponent.updateStats) {
            statsComponent.updateStats(newStats);
        }

        console.log('统计数据已更新', { statsCount: newStats.length });
    }

    // 更新勋章信息
    public updateAchievements(newAchievements: any[]): void {
        this.userProfile.achievements = newAchievements;

        // 更新勋章卡片
        const achievementComponent = this.components[1];
        if (achievementComponent && achievementComponent.updateAchievements) {
            achievementComponent.updateAchievements(newAchievements);
        }

        console.log('勋章信息已更新', { achievementsCount: newAchievements.length });
    }

    // 添加新勋章
    public addAchievement(achievement: any): void {
        if (!this.userProfile.achievements) {
            this.userProfile.achievements = [];
        }

        this.userProfile.achievements.push(achievement);

        const achievementComponent = this.components[1];
        if (achievementComponent && achievementComponent.addAchievement) {
            achievementComponent.addAchievement(achievement);
        }

        new Notice(`恭喜获得新勋章：${achievement.name}！`);
        console.log('新勋章已添加', achievement);
    }

    // 更新单个统计数据
    public updateSingleStat(statId: string, updates: any): void {
        const statsComponent = this.components[2];
        if (statsComponent && statsComponent.updateSingleStat) {
            statsComponent.updateSingleStat(statId, updates);
        }

        console.log('单个统计数据已更新', { statId, updates });
    }

    // 刷新所有组件
    public refresh(): void {
        this.components.forEach(component => {
            if (component && component.refresh) {
                component.refresh();
            }
        });

        console.log('个人资料界面已刷新');
    }

    // 销毁组件
    public destroy(): void {
        this.components.forEach(component => {
            if (component && component.destroy) {
                component.destroy();
            }
        });
        this.components = [];
        this.container.empty();
        this.container.removeClass('user-profile-view');

        console.log('个人资料界面已销毁');
    }

    // 获取用户数据
    public getUserProfile(): UserProfile {
        return { ...this.userProfile };
    }

    // 设置用户头像
    public setAvatar(avatarUrl: string): void {
        this.userProfile.avatar = avatarUrl;
        this.updateUserInfo({ avatar: avatarUrl });
    }

    // 增加学习天数
    public incrementStudyDays(): void {
        this.userProfile.studyDays += 1;
        this.updateUserInfo({ studyDays: this.userProfile.studyDays });

        // 检查是否需要升级
        this.checkLevelUp();
    }

    // 增加经验值并检查升级
    public addExperience(exp: number): void {
        // 简单的升级逻辑：每100经验升一级
        const currentExp = (this.userProfile.level - 1) * 100;
        const newExp = currentExp + exp;
        const newLevel = Math.floor(newExp / 100) + 1;

        if (newLevel > this.userProfile.level) {
            this.userProfile.level = newLevel;
            this.updateUserInfo({ level: newLevel });
            new Notice(`恭喜升级到 Lv.${newLevel}！`);
        }
    }

    private checkLevelUp(): void {
        // 检查学习天数是否达到升级条件
        const levelThresholds = [1, 7, 30, 90, 180, 365]; // 对应 Lv.1-6 的天数要求
        const currentLevel = this.userProfile.level;

        if (currentLevel < levelThresholds.length &&
            this.userProfile.studyDays >= levelThresholds[currentLevel]) {
            this.userProfile.level = currentLevel + 1;
            this.updateUserInfo({ level: this.userProfile.level });
            new Notice(`恭喜升级到 Lv.${this.userProfile.level}！学习${this.userProfile.studyDays}天达成！`);
        }
    }
}