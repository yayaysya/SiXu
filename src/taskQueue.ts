import { ProcessTask, TaskStatus, ProgressCallback } from './types';
import { Notice } from 'obsidian';

/**
 * 任务队列管理器
 */
export class TaskQueue {
	private tasks: Map<string, ProcessTask>;
	private progressCallbacks: Map<string, ProgressCallback>;

	constructor() {
		this.tasks = new Map();
		this.progressCallbacks = new Map();
	}

	/**
	 * 创建新任务
	 */
	createTask(sourceFilePath: string, outputFilePath: string): ProcessTask {
		const task: ProcessTask = {
			id: this.generateTaskId(),
			sourceFilePath,
			outputFilePath,
			status: TaskStatus.PENDING,
			progress: 0,
			startTime: Date.now()
		};

		this.tasks.set(task.id, task);
		return task;
	}

	/**
	 * 生成任务 ID
	 */
	private generateTaskId(): string {
		return `task_${Date.now()}_${Math.random().toString(36).substring(7)}`;
	}

	/**
	 * 更新任务状态
	 */
	updateTask(taskId: string, updates: Partial<ProcessTask>): void {
		const task = this.tasks.get(taskId);
		if (!task) return;

		Object.assign(task, updates);
		this.tasks.set(taskId, task);

		// 触发进度回调
		const callback = this.progressCallbacks.get(taskId);
		if (callback && updates.status) {
			callback(task.progress, updates.status, this.getStatusMessage(updates.status));
		}
	}

	/**
	 * 更新任务进度
	 */
	updateProgress(taskId: string, progress: number, status?: TaskStatus, customMessage?: string): void {
		this.updateTask(taskId, { progress, ...(status && { status }) });

		// 如果提供了自定义消息,触发回调
		if (customMessage) {
			const callback = this.progressCallbacks.get(taskId);
			const task = this.tasks.get(taskId);
			if (callback && task) {
				callback(progress, task.status, customMessage);
			}
		}
	}

	/**
	 * 标记任务完成
	 */
	completeTask(taskId: string): void {
		this.updateTask(taskId, {
			status: TaskStatus.COMPLETED,
			progress: 100,
			endTime: Date.now()
		});
	}

	/**
	 * 标记任务失败
	 */
	failTask(taskId: string, error: string): void {
		this.updateTask(taskId, {
			status: TaskStatus.FAILED,
			endTime: Date.now(),
			error
		});
	}

	/**
	 * 取消任务
	 */
	cancelTask(taskId: string): void {
		this.updateTask(taskId, {
			status: TaskStatus.CANCELLED,
			endTime: Date.now()
		});
	}

	/**
	 * 获取任务
	 */
	getTask(taskId: string): ProcessTask | undefined {
		return this.tasks.get(taskId);
	}

	/**
	 * 获取所有任务
	 */
	getAllTasks(): ProcessTask[] {
		return Array.from(this.tasks.values());
	}

	/**
	 * 获取正在进行的任务
	 */
	getActiveTasks(): ProcessTask[] {
		return this.getAllTasks().filter(task =>
			task.status !== TaskStatus.COMPLETED &&
			task.status !== TaskStatus.FAILED &&
			task.status !== TaskStatus.CANCELLED
		);
	}

	/**
	 * 注册进度回调
	 */
	onProgress(taskId: string, callback: ProgressCallback): void {
		this.progressCallbacks.set(taskId, callback);
	}

	/**
	 * 移除进度回调
	 */
	offProgress(taskId: string): void {
		this.progressCallbacks.delete(taskId);
	}

	/**
	 * 清理已完成的任务
	 */
	cleanupCompletedTasks(olderThan: number = 3600000): void {
		const now = Date.now();
		const toDelete: string[] = [];

		this.tasks.forEach((task, id) => {
			if (
				task.endTime &&
				(task.status === TaskStatus.COMPLETED ||
					task.status === TaskStatus.FAILED ||
					task.status === TaskStatus.CANCELLED) &&
				now - task.endTime > olderThan
			) {
				toDelete.push(id);
			}
		});

		toDelete.forEach(id => {
			this.tasks.delete(id);
			this.progressCallbacks.delete(id);
		});
	}

	/**
	 * 获取状态消息
	 */
	private getStatusMessage(status: TaskStatus): string {
		const messages: Record<TaskStatus, string> = {
			[TaskStatus.PENDING]: '等待处理...',
			[TaskStatus.PARSING]: '解析 Markdown...',
			[TaskStatus.PROCESSING_IMAGES]: '处理图片...',
			[TaskStatus.PROCESSING_LINKS]: '处理链接...',
			[TaskStatus.GENERATING]: '生成文章...',
			[TaskStatus.COMPLETED]: '处理完成!',
			[TaskStatus.FAILED]: '处理失败',
			[TaskStatus.CANCELLED]: '已取消'
		};

		return messages[status] || '处理中...';
	}

	/**
	 * 获取状态显示图标
	 */
	getStatusIcon(status: TaskStatus): string {
		const icons: Record<TaskStatus, string> = {
			[TaskStatus.PENDING]: '⏳',
			[TaskStatus.PARSING]: '📝',
			[TaskStatus.PROCESSING_IMAGES]: '🖼️',
			[TaskStatus.PROCESSING_LINKS]: '🔗',
			[TaskStatus.GENERATING]: '✨',
			[TaskStatus.COMPLETED]: '✅',
			[TaskStatus.FAILED]: '❌',
			[TaskStatus.CANCELLED]: '🚫'
		};

		return icons[status] || '⏳';
	}
}

/**
 * 状态栏项管理器
 */
export class StatusBarManager {
	private statusBarItem: HTMLElement | null;
	private currentTaskId: string | null;

	constructor(statusBarItem: HTMLElement) {
		this.statusBarItem = statusBarItem;
		this.currentTaskId = null;
	}

	/**
	 * 显示任务状态
	 */
	showTaskStatus(taskId: string, status: TaskStatus, progress: number, message?: string): void {
		if (!this.statusBarItem) return;

		this.currentTaskId = taskId;

		const queue = new TaskQueue();
		const icon = queue.getStatusIcon(status);

		// 如果有自定义消息,显示消息 + 百分比
		// 否则只显示图标 + 百分比
		const displayMessage = message
			? `${icon} ${Math.round(progress)}% - ${message}`
			: (status === TaskStatus.COMPLETED
				? '✅'
				: `${icon} ${Math.round(progress)}%`);

		this.statusBarItem.setText(displayMessage);
		this.statusBarItem.style.display = 'inline-block';
	}

	/**
	 * 隐藏状态栏
	 */
	hide(): void {
		if (!this.statusBarItem) return;
		this.statusBarItem.style.display = 'none';
		this.currentTaskId = null;
	}

	/**
	 * 清除状态
	 */
	clear(): void {
		this.hide();
	}
}
