import { App, TFile, Notice, setIcon } from 'obsidian';
import { getTemplate } from '../../prompts/templates';

export class BasicInfoCard {
    private container: HTMLElement;
    private app: App;
    private userInfo: {
        avatar?: string;
        username: string;
        studyDays: number;
        level: number;
    };

    constructor(container: HTMLElement, app: App, userInfo: any) {
        this.container = container;
        this.app = app;
        this.userInfo = userInfo;
        this.render();
    }

    private render(): void {
        const card = this.container.createDiv({ cls: 'basic-info-card profile-card' });

        // 头像区域
        const avatarSection = card.createDiv({ cls: 'avatar-section' });

        const avatarContainer = avatarSection.createDiv({ cls: 'avatar-container' });
        const avatar = avatarContainer.createDiv({ cls: 'user-avatar' });

        if (this.userInfo.avatar) {
            avatar.style.backgroundImage = `url(${this.userInfo.avatar})`;
            avatar.addClass('has-image');
        } else {
            avatar.setText('👤');
            avatar.addClass('default-avatar');
        }

        // 头像上传按钮
        const uploadBtn = avatarContainer.createDiv({ cls: 'avatar-upload-btn' });
        setIcon(uploadBtn, 'camera');
        uploadBtn.onClickEvent(() => this.handleAvatarUpload());

        // 用户信息区域
        const infoSection = card.createDiv({ cls: 'info-section' });

        const username = infoSection.createEl('h3', { cls: 'username', text: this.userInfo.username });

        const metaInfo = infoSection.createDiv({ cls: 'meta-info' });

        const studyDays = metaInfo.createDiv({ cls: 'meta-item' });
        studyDays.createDiv({ cls: 'meta-icon' }).setText('📅');
        studyDays.createDiv({ cls: 'meta-text' }).setText(`学习 ${this.userInfo.studyDays} 天`);

        const level = metaInfo.createDiv({ cls: 'meta-item level-item' });
        level.createDiv({ cls: 'meta-icon' }).setText('⭐');
        level.createDiv({ cls: 'meta-text level-text' }).setText(`Lv.${this.userInfo.level}`);

        console.log('用户基本信息卡片已渲染', {
            username: this.userInfo.username,
            studyDays: this.userInfo.studyDays,
            level: this.userInfo.level
        });
    }

    private async handleAvatarUpload(): Promise<void> {
        try {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';

            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                    if (file.size > 5 * 1024 * 1024) {
                        new Notice('头像文件大小不能超过5MB');
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const dataUrl = e.target?.result as string;
                        this.updateAvatar(dataUrl);
                    };
                    reader.readAsDataURL(file);
                }
            };

            input.click();
        } catch (error) {
            console.error('头像上传失败', error);
            new Notice('头像上传失败，请重试');
        }
    }

    private updateAvatar(dataUrl: string): void {
        this.userInfo.avatar = dataUrl;
        const avatar = this.container.querySelector('.user-avatar') as HTMLElement;
        if (avatar) {
            avatar.style.backgroundImage = `url(${dataUrl})`;
            avatar.addClass('has-image');
            avatar.removeClass('default-avatar');
            avatar.setText('');
        }

        // 保存到插件设置
        this.saveUserInfo();
        new Notice('头像更新成功');
    }

    private saveUserInfo(): void {
        // 这里需要调用插件的设置保存方法
        // TODO: 实现用户信息的持久化存储
    }

    public updateUserInfo(newInfo: Partial<typeof this.userInfo>): void {
        Object.assign(this.userInfo, newInfo);
        this.render();
    }
}