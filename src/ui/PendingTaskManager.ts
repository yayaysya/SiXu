import { App, setIcon } from 'obsidian';
import { ResumeTaskItem } from '../types';

/**
 * 状态栏任务托盘：展示可恢复任务并提供继续/移除入口
 * KISS：不做持久化；仅内存保存任务。
 */
export class PendingTaskManager {
  private app: App;
  private statusBarItem: HTMLElement;
  private tasks: Map<string, ResumeTaskItem> = new Map();
  private popoverEl: HTMLDivElement | null = null;
  private iconEl: HTMLElement | null = null;
  private outsideHandler: (e: MouseEvent) => void;

  constructor(app: App, statusBarItem: HTMLElement) {
    this.app = app;
    this.statusBarItem = statusBarItem;
    this.statusBarItem.addClass('nb-task-tray');

    // 构建图标与角标
    this.renderIcon();

    // 切换弹出层
    this.statusBarItem.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.togglePopover();
    });

    // 外部点击关闭
    this.outsideHandler = (e: MouseEvent) => {
      if (!this.popoverEl) return;
      const target = e.target as Node;
      if (!this.popoverEl.contains(target) && !this.statusBarItem.contains(target)) {
        this.hidePopover();
      }
    };
  }

  /** 新增或更新任务 */
  addTask(item: ResumeTaskItem): void {
    this.tasks.set(item.id, item);
    this.updateIconState();
    this.refreshPopoverIfVisible();
  }

  /** 移除任务 */
  removeTask(id: string): void {
    if (this.tasks.delete(id)) {
      this.updateIconState();
      this.refreshPopoverIfVisible();
    }
  }

  hasTasks(): boolean {
    return this.tasks.size > 0;
  }

  /** 渲染状态栏图标与角标 */
  private renderIcon(): void {
    this.statusBarItem.empty();
    const iconWrap = this.statusBarItem.createSpan({ cls: 'nb-task-tray-icon' });
    setIcon(iconWrap, 'square-check');
    this.iconEl = iconWrap;

    const badge = this.statusBarItem.createSpan({ cls: 'nb-task-counter' });
    badge.setText('0');
    this.updateIconState();
  }

  private updateIconState(): void {
    const badge = this.statusBarItem.querySelector('.nb-task-counter') as HTMLElement | null;
    const count = this.tasks.size;
    if (badge) {
      badge.setText(String(count));
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
    if (count > 0) {
      this.statusBarItem.addClass('has-tasks');
      this.statusBarItem.style.display = 'inline-block';
    } else {
      this.statusBarItem.removeClass('has-tasks');
      // 仍常驻显示淡色图标
      this.statusBarItem.style.display = 'inline-block';
    }
  }

  private togglePopover(): void {
    if (this.popoverEl) {
      this.hidePopover();
    } else {
      this.showPopover();
    }
  }

  private showPopover(): void {
    if (this.popoverEl) return;
    const rect = this.statusBarItem.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'nb-task-popover';
    // 固定在右下角，避免 statusbar 内部布局影响
    el.style.position = 'fixed';
    el.style.right = `${Math.max(8, window.innerWidth - rect.right + 8)}px`;
    el.style.bottom = `${Math.max(32, window.innerHeight - rect.bottom + 32)}px`;

    // 标题
    const header = document.createElement('div');
    header.className = 'nb-task-popover-header';
    header.textContent = '未完成的任务';
    el.appendChild(header);

    // 列表
    const list = document.createElement('div');
    list.className = 'nb-task-list';
    if (this.tasks.size === 0) {
      const empty = document.createElement('div');
      empty.className = 'nb-task-empty';
      empty.textContent = '暂无任务';
      list.appendChild(empty);
    } else {
      Array.from(this.tasks.values())
        .sort((a, b) => b.createdAt - a.createdAt)
        .forEach(task => {
          const row = document.createElement('div');
          row.className = 'nb-task-item';

          const info = document.createElement('div');
          info.className = 'nb-task-info';
          const title = document.createElement('div');
          title.className = 'nb-task-title';
          title.textContent = task.title;
          info.appendChild(title);
          if (task.subtitle) {
            const sub = document.createElement('div');
            sub.className = 'nb-task-subtitle';
            sub.textContent = task.subtitle;
            info.appendChild(sub);
          }
          row.appendChild(info);

          const actions = document.createElement('div');
          actions.className = 'nb-task-actions';
          const resumeBtn = document.createElement('button');
          resumeBtn.className = 'mod-cta';
          resumeBtn.textContent = '继续';
          resumeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hidePopover();
            try { task.resume(); } catch (err) { console.error(err); }
          });
          actions.appendChild(resumeBtn);

          const removeBtn = document.createElement('button');
          removeBtn.textContent = '移除';
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = task.id;
            try { task.cancel?.(); } finally { this.removeTask(id); }
          });
          actions.appendChild(removeBtn);

          row.appendChild(actions);
          list.appendChild(row);
        });
    }

    el.appendChild(list);
    document.body.appendChild(el);
    this.popoverEl = el;
    window.addEventListener('click', this.outsideHandler, true);
  }

  private hidePopover(): void {
    if (!this.popoverEl) return;
    this.popoverEl.remove();
    this.popoverEl = null;
    window.removeEventListener('click', this.outsideHandler, true);
  }

  private refreshPopoverIfVisible(): void {
    if (!this.popoverEl) return;
    this.hidePopover();
    this.showPopover();
  }
}

export default PendingTaskManager;
