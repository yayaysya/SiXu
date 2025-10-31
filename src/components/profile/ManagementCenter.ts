import { App, Notice, setIcon } from 'obsidian';
import { HelpModal } from './modals/HelpModal';
import { AboutModal } from './modals/AboutModal';

interface ManagementItem {
    id: string;
    title: string;
    description: string;
    icon: string;
    action: () => void;
    color?: 'blue' | 'green' | 'orange' | 'purple' | 'red';
}

export class ManagementCenter {
    private container: HTMLElement;
    private app: App;

    constructor(container: HTMLElement, app: App) {
        this.container = container;
        this.app = app;
        this.render();
    }

    private getManagementItems(): ManagementItem[] {
        return [
            {
                id: 'settings',
                title: '设置',
                description: '配置插件参数和个性化选项',
                icon: 'settings',
                color: 'blue',
                action: () => this.openSettings()
            },
            {
                id: 'help',
                title: '帮助与反馈',
                description: '获取帮助信息或提交反馈',
                icon: 'help-circle',
                color: 'green',
                action: () => this.openHelpModal()
            },
            {
                id: 'about',
                title: '关于我们',
                description: '了解产品功能和团队信息',
                icon: 'info',
                color: 'purple',
                action: () => this.openAboutModal()
            }
        ];
    }

    private render(): void {
        const card = this.container.createDiv({ cls: 'management-center profile-card' });

        const header = card.createDiv({ cls: 'card-header' });
        header.createDiv({ cls: 'card-title' }).setText('管理中心');

        const itemsContainer = card.createDiv({ cls: 'management-items' });

        this.getManagementItems().forEach(item => {
            const itemEl = this.createManagementItem(item);
            itemsContainer.appendChild(itemEl);
        });

        console.log('管理中心已渲染', {
            itemsCount: this.getManagementItems().length,
            items: this.getManagementItems().map(i => ({ id: i.id, title: i.title }))
        });
    }

    private createManagementItem(item: ManagementItem): HTMLElement {
        const itemEl = document.createElement('div');
        itemEl.className = `management-item management-${item.color}`;

        const iconContainer = itemEl.createDiv({ cls: 'management-icon-container' });
        const iconEl = iconContainer.createDiv({ cls: 'management-icon' });
        setIcon(iconEl, item.icon);

        const contentContainer = itemEl.createDiv({ cls: 'management-content' });

        const titleEl = contentContainer.createDiv({ cls: 'management-title' });
        titleEl.setText(item.title);

        const descriptionEl = contentContainer.createDiv({ cls: 'management-description' });
        descriptionEl.setText(item.description);

        const arrowEl = itemEl.createDiv({ cls: 'management-arrow' });
        setIcon(arrowEl, 'chevron-right');

        // 添加点击事件
        itemEl.onClickEvent(() => {
            this.handleItemClick(item);
        });

        // 添加悬停效果
        itemEl.addEventListener('mouseenter', () => {
            itemEl.addClass('management-item-hover');
        });

        itemEl.addEventListener('mouseleave', () => {
            itemEl.removeClass('management-item-hover');
        });

        return itemEl;
    }

    private handleItemClick(item: ManagementItem): void {
        console.log('管理中心项目被点击', { itemId: item.id, title: item.title });

        try {
            item.action();
        } catch (error) {
            console.error('执行管理功能失败', error);
            new Notice(`操作失败：${item.title}`);
        }
    }

    private openSettings(): void {
        try {
            // 打开Obsidian的插件设置页面
            (this.app as any).setting.open();
            (this.app as any).setting.openTabById('notebook-llm');

            new Notice('已打开设置页面');
            console.log('设置页面已打开');
        } catch (error) {
            console.error('打开设置页面失败', error);
            new Notice('无法打开设置页面，请尝试手动打开');
        }
    }

    private openHelpModal(): void {
        try {
            const modal = new HelpModal(this.app);
            modal.open();

            console.log('帮助反馈弹窗已打开');
        } catch (error) {
            console.error('打开帮助反馈弹窗失败', error);
            new Notice('无法打开帮助页面');
        }
    }

    private openAboutModal(): void {
        try {
            const modal = new AboutModal(this.app);
            modal.open();

            console.log('关于我们弹窗已打开');
        } catch (error) {
            console.error('打开关于我们弹窗失败', error);
            new Notice('无法打开关于页面');
        }
    }

    public refresh(): void {
        this.container.empty();
        this.render();
    }
}