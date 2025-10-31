/**
 * BatchProcessor - 批量并发处理工具
 * 支持任务队列、并发控制、错误恢复、任务取消
 */

export interface BatchTask<T, R> {
  id: string;
  input: T;
  execute: (input: T) => Promise<R>;
  retryCount?: number;
  maxRetries?: number;
}

export interface BatchResult<T, R> {
  taskId: string;
  success: boolean;
  data?: R;
  error?: Error;
  retries: number;
}

export interface BatchOptions {
  maxConcurrent?: number;
  batchSize?: number;
  retryDelay?: number;
  onProgress?: (completed: number, total: number) => void;
  abortSignal?: AbortSignal;
}

export interface ProgressInfo {
  total: number;
  completed: number;
  failed: number;
  retries: number;
  currentBatch: number;
  totalBatches: number;
}

/**
 * 批量并发处理器
 */
export class BatchProcessor<T, R> {
  private readonly maxConcurrent: number;
  private readonly batchSize: number;
  private readonly retryDelay: number;
  private readonly onProgress?: (completed: number, total: number) => void;
  private readonly abortSignal?: AbortSignal;

  private isCancelled = false;

  constructor(options: BatchOptions = {}) {
    this.maxConcurrent = options.maxConcurrent || 5;
    this.batchSize = options.batchSize || 10;
    this.retryDelay = options.retryDelay || 1000;
    this.onProgress = options.onProgress;
    this.abortSignal = options.abortSignal;

    if (this.abortSignal) {
      this.abortSignal.addEventListener('abort', () => {
        this.isCancelled = true;
      });
    }
  }

  /**
   * 批量处理任务
   * @param tasks 任务数组
   * @returns 处理结果
   */
  async processBatch(tasks: BatchTask<T, R>[]): Promise<BatchResult<T, R>[]> {
    if (this.isCancelled || (this.abortSignal && this.abortSignal.aborted)) {
      throw new Error('Batch processing was cancelled');
    }

    if (tasks.length === 0) {
      return [];
    }

    console.log(`[BatchProcessor] 开始处理${tasks.length}个任务，并发数: ${this.maxConcurrent}, 批大小: ${this.batchSize}`);

    const results: BatchResult<T, R>[] = [];
    const taskQueue = [...tasks];

    // 计算批次数量
    const totalBatches = Math.ceil(taskQueue.length / this.batchSize);

    // 按批次处理
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      if (this.isCancelled || (this.abortSignal && this.abortSignal.aborted)) {
        break;
      }

      // 获取当前批次
      const currentBatch = taskQueue.splice(0, this.batchSize);

      // 处理当前批次
      const batchResults = await this.processConcurrent(
        currentBatch,
        batchIndex,
        totalBatches
      );

      results.push(...batchResults);

      // 报告进度
      if (this.onProgress) {
        this.onProgress(results.length, tasks.length);
      }
    }

    const { successful, failed } = BatchProcessor.mergeResults(results);
    console.log(`[BatchProcessor] 完成: ${successful.length}/${tasks.length}成功，${failed.length}失败`);
    console.log(`[BatchProcessor] 详细结果: 共${results.length}个任务, successful=${successful.length}, failed=${failed.length}`);

    // 详细日志：输出每个任务的结果（如果没有失败记录但数量不匹配）
    if (failed.length === 0 && results.length > successful.length) {
      console.log(`[BatchProcessor] 警告: 检测到${results.length - successful.length}个未分类的任务，正在分析...`);
      results.forEach((result, idx) => {
        console.log(`[BatchProcessor] 任务${idx}: id=${result.taskId}, success=${result.success}, hasData=${!!result.data}, retries=${result.retries}`);
        if (result.error) {
          console.log(`[BatchProcessor]   错误: ${result.error.message}`);
        }
      });
    } else if (failed.length > 0) {
      console.log(`[BatchProcessor] 失败任务详情:`);
      failed.forEach((result, idx) => {
        console.log(`[BatchProcessor] 失败${idx+1}: id=${result.taskId}, success=${result.success}, retries=${result.retries}`);
        if (result.error) {
          console.log(`[BatchProcessor]   错误: ${result.error.message}`);
        }
      });
    }

    return results;
  }

  /**
   * 并发处理一批任务
   */
  private async processConcurrent(
    tasks: BatchTask<T, R>[],
    batchIndex: number,
    totalBatches: number
  ): Promise<BatchResult<T, R>[]> {
    const executing: Map<number, Promise<BatchResult<T, R>>> = new Map();
    let nextTaskIndex = 0;
    const results: BatchResult<T, R>[] = [];

    // 启动初始任务（填充并发池）
    const startTask = (index: number): Promise<BatchResult<T, R>> => {
      const task = tasks[index];
      console.log(`[BatchProcessor] 启动任务${task.id} (${index + 1}/${tasks.length})`);
      return this.executeTask(task);
    };

    // 填充初始并发池
    for (let i = 0; i < this.maxConcurrent && nextTaskIndex < tasks.length; i++) {
      executing.set(i, startTask(nextTaskIndex++));
    }

    // 处理所有任务
    while (executing.size > 0) {
      // 等待最快完成的任务
      const settled = await Promise.allSettled(Array.from(executing.values()));
      const completedIndexes: number[] = [];

      settled.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          completedIndexes.push(idx);
        } else {
          // Promise rejected，也算完成
          results.push({
            taskId: `error_${Date.now()}`,
            success: false,
            error: new Error(result.reason),
            retries: 0
          });
          completedIndexes.push(idx);
        }
      });

      // 移除已完成的任务
      completedIndexes.sort((a, b) => b - a).forEach(idx => {
        executing.delete(idx);
      });

      // 添加新任务（保持并发数）
      while (executing.size < this.maxConcurrent && nextTaskIndex < tasks.length) {
        const newIndex = nextTaskIndex++;
        executing.set(newIndex, startTask(newIndex));
      }

      // 如果没有新任务了，等待剩余任务
      if (nextTaskIndex >= tasks.length && executing.size > 0) {
        const remaining = await Promise.allSettled(Array.from(executing.values()));
        remaining.forEach(result => {
          if (result.status === 'fulfilled') {
            results.push(result.value);
          } else {
            results.push({
              taskId: `error_${Date.now()}`,
              success: false,
              error: new Error(result.reason),
              retries: 0
            });
          }
        });
        executing.clear();
      }
    }

    console.log(`[BatchProcessor] 批次${batchIndex + 1}/${totalBatches}完成，处理${results.length}个任务`);
    return results;
  }

  /**
   * 执行单个任务，支持重试
   */
  private async executeTask(task: BatchTask<T, R>): Promise<BatchResult<T, R>> {
    const maxRetries = task.maxRetries || 3;
    let attempt = 0;

    while (attempt <= maxRetries) {
      if (this.isCancelled || (this.abortSignal && this.abortSignal.aborted)) {
        console.log(`[BatchProcessor] 任务${task.id}被取消 (尝试${attempt}次)`);
        return {
          taskId: task.id,
          success: false,
          error: new Error('Task was cancelled'),
          retries: attempt
        };
      }

      try {
        const data = await task.execute(task.input);
        if (attempt > 0) {
          console.log(`[BatchProcessor] 任务${task.id}重试${attempt}次后成功`);
        }
        return {
          taskId: task.id,
          success: true,
          data,
          retries: attempt
        };
      } catch (error) {
        attempt++;

        // 如果达到最大重试次数，返回失败
        if (attempt > maxRetries) {
          console.error(`[BatchProcessor] 任务${task.id}失败，已重试${attempt - 1}次:`, error);
          return {
            taskId: task.id,
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            retries: attempt - 1
          };
        }

        // 指数退避
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }
    }

    // 不应该到达这里
    return {
      taskId: task.id,
      success: false,
      error: new Error('Max retries exceeded'),
      retries: maxRetries
    };
  }

  /**
   * 合并结果，过滤成功的结果
   */
  static mergeResults<T, R>(results: BatchResult<T, R>[]): {
    successful: R[];
    failed: BatchResult<T, R>[];
    totalProcessed: number;
    successRate: number;
  } {
    const successful: R[] = [];
    const failed: BatchResult<T, R>[] = [];

    for (const result of results) {
      if (result.success && result.data !== undefined) {
        successful.push(result.data);
      } else {
        failed.push(result);
      }
    }

    const totalProcessed = results.length;
    const successRate = totalProcessed > 0 ? successful.length / totalProcessed : 0;

    return {
      successful,
      failed,
      totalProcessed,
      successRate
    };
  }

  /**
   * 创建批量任务
   */
  static createTasks<T, R>(
    inputs: T[],
    executeFn: (input: T, index?: number) => Promise<R>,
    options?: { maxRetries?: number }
  ): BatchTask<T, R>[] {
    return inputs.map((input, index) => ({
      id: `task_${index}_${Date.now()}`,
      input,
      execute: (input) => executeFn(input, index),
      maxRetries: options?.maxRetries
    }));
  }

  /**
   * 取消处理
   */
  cancel(): void {
    this.isCancelled = true;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取处理进度
   */
  getProgress(results: BatchResult<T, R>[]): ProgressInfo {
    const total = results.length;
    const completed = results.filter(r => r.success || (r.retries > 0 && !r.success)).length;
    const failed = results.filter(r => !r.success).length;
    const retries = results.reduce((sum, r) => sum + r.retries, 0);

    return {
      total,
      completed,
      failed,
      retries,
      currentBatch: 0,
      totalBatches: 0
    };
  }
}

/**
 * 简化的并发处理函数
 */
export async function processInBatches<T, R>(
  inputs: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: BatchOptions = {}
): Promise<R[]> {
  const tasks = BatchProcessor.createTasks(inputs, (item, index) => processor(item, index || 0));
  const results = await new BatchProcessor<T, R>(options).processBatch(tasks);
  const { successful } = BatchProcessor.mergeResults(results);
  return successful;
}

/**
 * 并发处理（Promise.allSettled的封装）
 */
export async function processConcurrently<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  maxConcurrent: number = 5,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  // 创建处理器池
  const pool = Array.from({ length: maxConcurrent }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex];

      try {
        const result = await processor(item, currentIndex);
        results.push(result);
      } catch (error) {
        console.error(`Failed to process item at index ${currentIndex}:`, error);
      }

      if (onProgress) {
        onProgress(results.length, items.length);
      }
    }
  });

  // 等待所有处理器完成
  await Promise.all(pool);

  return results;
}
