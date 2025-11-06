import { Notice, TFile } from 'obsidian';
import { App } from 'obsidian';
import { TaskStatus } from '../types';
import NotebookLLMPlugin from '../main';
import { LearningPathConfig, LearningPathOutline, PathGenerationTask } from './types';
import { LearningPathGenerator } from './LearningPathGenerator';
import { DebugMarkdownLogger } from '../utils/DebugMarkdown';

/**
 * 学习路径任务队列管理器
 */
export class PathTaskQueue {
	private app: App;
	private plugin: NotebookLLMPlugin;
	private generator: LearningPathGenerator;
	private tasks: Map<string, PathGenerationTask> = new Map();
	private isProcessing = false;

	constructor(app: App, plugin: NotebookLLMPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.generator = new LearningPathGenerator(app, plugin);
	}

	/**
	 * 创建学习路径生成任务
	 */
	async createPathGenerationTask(
		config: LearningPathConfig,
		outline: LearningPathOutline
	): Promise<string> {
		const taskId = this.generateTaskId();

		const task: PathGenerationTask = {
			id: taskId,
			config,
			outline,
			status: 'pending',
			progress: 0,
			startTime: Date.now(),
			createdFiles: []
		};

		this.tasks.set(taskId, task);

		// 异步处理任务
		this.processTaskAsync(taskId);

		return taskId;
	}

	/**
	 * 获取任务
	 */
	getTask(taskId: string): PathGenerationTask | undefined {
		return this.tasks.get(taskId);
	}

	/**
	 * 获取所有任务
	 */
	getAllTasks(): PathGenerationTask[] {
		return Array.from(this.tasks.values());
	}

	/**
	 * 获取活跃任务
	 */
	getActiveTasks(): PathGenerationTask[] {
		return this.getAllTasks().filter(task =>
			task.status !== 'completed' &&
			task.status !== 'failed'
		);
	}

	/**
	 * 取消任务
	 */
	async cancelTask(taskId: string): Promise<void> {
		const task = this.tasks.get(taskId);
		if (!task) return;

		if (task.status === 'completed' || task.status === 'failed') {
			return; // 无法取消已完成的任务
		}

		// 更新任务状态
		task.status = 'failed';
		task.endTime = Date.now();
		task.error = '用户取消任务';

		// 清理已创建的文件
		if (task.createdFiles && task.createdFiles.length > 0) {
			await this.cleanupCreatedFiles(task.createdFiles);
		}

		new Notice('任务已取消');
	}

	/**
	 * 异步处理任务
	 */
	private async processTaskAsync(taskId: string): Promise<void> {
		// 防止并发处理
		if (this.isProcessing) {
			// 等待当前任务完成
			setTimeout(() => this.processTaskAsync(taskId), 100);
			return;
		}

		this.isProcessing = true;

		try {
			await this.processTask(taskId);
		} catch (error) {
			console.error('处理学习路径任务失败:', error);
			const task = this.tasks.get(taskId);
			if (task) {
				task.status = 'failed';
				task.endTime = Date.now();
				task.error = error.message;
				new Notice(`学习路径创建失败: ${error.message}`, 8000);

				// 如果有部分创建的文件，提供清理选项
				if (task.createdFiles && task.createdFiles.length > 0) {
					new Notice(`已创建 ${task.createdFiles.length} 个文件，但任务未完成。请检查文件是否完整。`, 5000);
				}
			}
		} finally {
			this.isProcessing = false;
		}
	}

	/**
	 * 处理单个任务
	 */
	private async processTask(taskId: string): Promise<void> {
		console.log('开始处理学习路径任务:', taskId);
		const task = this.tasks.get(taskId);
		if (!task) throw new Error('任务不存在');

		const { config, outline } = task;
		console.log('任务配置:', { topic: config.topic, depth: config.depth });

		let logger: DebugMarkdownLogger | undefined;
		if (this.plugin.settings.debugEnabled) {
			logger = new DebugMarkdownLogger(this.app, '学习路径调试日志');
			logger.appendSection('任务上下文', {
				taskId,
				topic: config.topic,
				depth: config.depth,
				targetDirectory: config.targetDirectory,
				textProvider: this.plugin.settings.textProvider,
				textModel: this.plugin.settings.textModel
			});
		}

		try {
			// 阶段1: 生成大纲
			if (!outline) {
				task.status = 'generating-outline';
				task.progress = 10;
				logger?.appendMarkdown('\n开始生成学习路径大纲…');

				try {
					task.outline = await this.generator.generateOutline(config, logger);
					task.progress = 30;
					logger?.appendSection('大纲生成完成', {
						files: task.outline.files.map(f => ({ filename: f.filename, title: f.title, enabled: f.enabled }))
					});
				} catch (error) {
					logger?.appendSection('大纲生成失败', {
						message: (error as any)?.message || String(error)
					});
					throw new Error(`生成大纲失败: ${error.message}`);
				}
			} else {
				task.progress = 30; // 如果已有大纲，跳过此阶段
				logger?.appendSection('使用已有大纲', {
					files: outline.files.map(f => ({ filename: f.filename, title: f.title, enabled: f.enabled }))
				});
			}

			// 阶段2: 生成内容并创建文件
			task.status = 'creating-files';
			const enabledFiles = task.outline!.files.filter(f => f.enabled);
			const totalFiles = enabledFiles.length;

			if (totalFiles === 0) {
				throw new Error('没有启用的文件需要创建');
			}

        // 确保目标目录存在
        const targetDir = `${config.targetDirectory}/${task.outline!.title}`;
        await this.ensureDirectoryExists(targetDir);

        // 逐个生成文件
        const activeTaskId = `lp-create-${taskId}`;
        for (let i = 0; i < totalFiles; i++) {
            const file = enabledFiles[i];
            const fileProgress = 30 + (i / totalFiles) * 60; // 30% - 90%

            task.currentFile = file.title;
            task.progress = Math.round(fileProgress);
            // 状态栏显示进行中的具体文件
            try {
                this.plugin.statusBarManager?.showTaskStatus(
                    activeTaskId,
                    TaskStatus.GENERATING,
                    task.progress,
                    `学习路径：正在创建 "${file.title}" (${i + 1}/${totalFiles})`
                );
            } catch {}
            logger?.appendSection('开始生成文件', {
                filename: file.filename,
                title: file.title,
                index: i + 1,
                total: totalFiles
            });

				try {
					// 生成文件内容
					file.content = await this.generator.generateFileContent(file, task.outline!, config, logger);

					// 创建文件
					const filePath = `${targetDir}/${file.filename}`;
					await this.createMarkdownFile(filePath, file, task.outline!, config);

					// 记录已创建的文件
					if (!task.createdFiles) task.createdFiles = [];
					task.createdFiles.push(filePath);
					logger?.appendSection('文件创建完成', {
						filePath,
						length: file.content?.length || 0
					});

				} catch (error) {
					logger?.appendSection('文件创建失败', {
						filename: file.filename,
						title: file.title,
						message: (error as any)?.message || String(error)
					});
					throw new Error(`创建文件 ${file.filename} 失败: ${error.message}`);
				}
			}

        // 任务完成
        console.log('学习路径任务完成:', taskId, '创建文件数:', task.createdFiles?.length || 0);
        task.status = 'completed';
        task.progress = 100;
        task.endTime = Date.now();
        task.currentFile = '完成';
        try { this.plugin.statusBarManager?.hideTask(activeTaskId); } catch {}
        logger?.appendSection('任务完成', {
            createdFiles: task.createdFiles,
            totalFiles
        });

			// 显示完成通知
			this.showCompletionNotice(task);

        } catch (error) {
            logger?.appendSection('任务失败', {
                message: (error as any)?.message || String(error)
            });
            try { this.plugin.statusBarManager?.hide(); } catch {}
            throw error;
        } finally {
            await logger?.flush();
        }
    }

	/**
	 * 显示完成通知
	 */
	private showCompletionNotice(task: PathGenerationTask): void {
		const { config, outline } = task;
		const duration = (task.endTime! - task.startTime) / 1000;

		// 先显示简单的Notice
		new Notice(
			`🎉 学习路径 "${outline!.title}" 创建完成！\n` +
			`📁 位置: ${config.targetDirectory}/${outline!.title}\n` +
			`⏱️ 用时: ${duration.toFixed(1)}秒\n` +
			`📄 文件数: ${task.createdFiles?.length || 0}`,
			5000
		);

		// 延迟显示完成通知模态框，让用户看到简单的通知后再显示详细通知
		setTimeout(() => {
			this.showCompletionModal(task);
		}, 1000);

		// 触发完成事件
		this.onTaskCompleted(task);
	}

	/**
	 * 显示完成通知模态框
	 */
private async showCompletionModal(task: PathGenerationTask): Promise<void> {
    try {
        console.log('准备显示完成通知模态框:', task.outline?.title);
        // 动态导入PathCompletionNotice以避免循环依赖
        const { PathCompletionNotice } = await import('../components/PathCompletionNotice');

        const modal = new PathCompletionNotice(
            this.app,
            task.config,
            task.outline!,
            task.createdFiles || [],
            this.plugin,
            () => {
                console.log('完成通知模态框已关闭');
                // 通知关闭后的回调
            }
        );
        console.log('打开完成通知模态框');
        // 在状态栏托盘中注册可恢复的“生成结果”任务
        const tray = this.plugin.pendingTaskManager;
        const resumeId = `resume-path-complete-${task.id}`;
        const resumeOpen = () => {
            const m = new PathCompletionNotice(
                this.app,
                task.config,
                task.outline!,
                task.createdFiles || [],
                this.plugin,
                () => {
                    console.log('完成通知模态框已关闭');
                }
            );
            m.open();
        };
        tray?.addTask({
            id: resumeId,
            title: `学习路径完成：${task.outline!.title}`,
            subtitle: `${task.createdFiles?.length || 0} 个文件已生成`,
            kind: 'learning-path-result',
            createdAt: Date.now(),
            resume: resumeOpen,
            cancel: () => {}
        });
        modal.open();
    } catch (error) {
        console.error('显示完成通知模态框失败:', error);
        // 如果模态框显示失败，至少显示一个简单的通知
        new Notice('学习路径创建完成！可在文件浏览器中查看生成的文件。');
    }
}

	/**
	 * 任务完成回调
	 */
	private onTaskCompleted(task: PathGenerationTask): void {
		// 可以在这里添加：
		// 1. 自动打开文件夹
		// 2. 生成闪卡建议
		// 3. 更新统计信息
		// 4. 记录到历史

		const { config, outline } = task;

		// 可选：自动在Obsidian中打开目标文件夹
		const targetDir = `${config.targetDirectory}/${outline!.title}`;
		// this.app.workspace.openLinkText(targetDir, '', false);
	}

	/**
	 * 确保目录存在
	 */
	private async ensureDirectoryExists(dirPath: string): Promise<void> {
		const normalizedPath = dirPath.replace(/\\/g, '/');
		const parts = normalizedPath.split('/').filter(part => part);

		let currentPath = '';
		for (const part of parts) {
			currentPath += (currentPath ? '/' : '') + part;

			if (!await this.app.vault.adapter.exists(currentPath)) {
				await this.app.vault.adapter.mkdir(currentPath);
			}
		}
	}

	/**
	 * 创建Markdown文件
	 */
	private async createMarkdownFile(
		filePath: string,
		file: any,
		outline: LearningPathOutline,
		config: LearningPathConfig
	): Promise<void> {
		const frontmatter = this.buildFrontmatter(file, outline, config);
		const content = `${frontmatter}\n\n${file.content}`;

		await this.app.vault.create(filePath, content);
	}

	/**
	 * 构建frontmatter
	 */
	private buildFrontmatter(file: any, outline: LearningPathOutline, config: LearningPathConfig): string {
		const metadata = {
			title: file.title,
			path_topic: outline.title,
			order: file.order,
			type: file.type,
			created: new Date().toISOString().split('T')[0],
			depth: config.depth,
			topic: config.topic,
			tags: ['learning-path', config.topic, file.type]
		};

		// 将 metadata 序列化为 YAML：数组使用多行列表，其余字符串加引号
		const escape = (s: string) => s.replace(/\"/g, '\\"');
		const yamlLines: string[] = [];
		for (const [key, value] of Object.entries(metadata)) {
			if (Array.isArray(value)) {
				yamlLines.push(`${key}:`);
				for (const item of value) {
					yamlLines.push(`  - \"${escape(String(item))}\"`);
				}
			} else if (typeof value === 'string') {
				yamlLines.push(`${key}: \"${escape(value)}\"`);
			} else {
				yamlLines.push(`${key}: ${value}`);
			}
		}

		return `---\n${yamlLines.join('\n')}\n---`;

		const yamlString = Object.entries(metadata)
			.map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
			.join('\n');

		return `---\n${yamlString}\n---`;
	}

	/**
	 * 清理已创建的文件
	 */
	private async cleanupCreatedFiles(filePaths: string[]): Promise<void> {
		for (const filePath of filePaths) {
			try {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file) {
					await this.app.vault.delete(file);
				}
			} catch (error) {
				console.warn(`清理文件失败: ${filePath}`, error);
			}
		}
	}

	/**
	 * 生成任务ID
	 */
	private generateTaskId(): string {
		return `path_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * 清理旧任务
	 */
	cleanupOldTasks(olderThan: number = 24 * 60 * 60 * 1000): void { // 默认24小时
		const now = Date.now();
		const toDelete: string[] = [];

		this.tasks.forEach((task, id) => {
			if (
				task.endTime &&
				(task.status === 'completed' || task.status === 'failed') &&
				now - task.endTime > olderThan
			) {
				toDelete.push(id);
			}
		});

		toDelete.forEach(id => {
			this.tasks.delete(id);
		});
	}

	/**
	 * 获取任务统计信息
	 */
	getTaskStats(): {
		total: number;
		pending: number;
		processing: number;
		completed: number;
		failed: number;
	} {
		const tasks = this.getAllTasks();

		return {
			total: tasks.length,
			pending: tasks.filter(t => t.status === 'pending').length,
			processing: tasks.filter(t => t.status === 'generating-outline' || t.status === 'creating-files').length,
			completed: tasks.filter(t => t.status === 'completed').length,
			failed: tasks.filter(t => t.status === 'failed').length
		};
	}
}
