/**
 * Batch Executor
 *
 * Executes batch operations with concurrency control, cancellation,
 * pause/resume, and progress reporting.
 */

import type {
  BatchOptions,
  BatchProgress,
  BatchResult,
  BatchTaskResult,
  BatchTask,
  BatchPromise,
  ExecOptions,
} from '../types';
import WorkerpoolPromise from './Promise';

/**
 * Internal task state
 */
interface TaskState<T> {
  index: number;
  task: BatchTask;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: T;
  error?: Error;
  duration: number;
  startTime?: number;
}

/**
 * Executor function type
 * This is the function that actually executes a task (e.g., pool.exec)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TaskExecutor<T> = (
  method: string | ((...args: any[]) => any),
  params: unknown[],
  options?: ExecOptions
) => PromiseLike<T> & { cancel?: () => void };

/**
 * Create a batch executor
 *
 * @param tasks - Tasks to execute
 * @param executor - Function to execute individual tasks
 * @param options - Batch options
 * @returns BatchPromise with results
 */
export function createBatchExecutor<T>(
  tasks: BatchTask[],
  executor: TaskExecutor<T>,
  options: BatchOptions = {}
): BatchPromise<T> {
  const {
    concurrency = Infinity,
    failFast = false,
    onProgress,
    progressThrottle = 0,
    taskTimeout,
    batchTimeout,
  } = options;

  // State
  const taskStates: TaskState<T>[] = tasks.map((task, index) => ({
    index,
    task,
    status: 'pending',
    duration: 0,
  }));

  let nextTaskIndex = 0;
  let runningCount = 0;
  let completedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let cancelled = false;
  let paused = false;
  let pausePromise: { resolve: () => void } | null = null;
  let batchStartTime = 0;
  let lastProgressTime = 0;

  // Active task promises for cancellation
  const activeTasks: Map<number, { cancel?: () => void }> = new Map();

  // Create the result promise
  const { promise, resolve, reject } = WorkerpoolPromise.defer<BatchResult<T>>();

  /**
   * Build progress object
   */
  function buildProgress(): BatchProgress {
    const elapsed = Date.now() - batchStartTime;
    const tasksPerMs = completedCount / Math.max(elapsed, 1);
    const remaining = tasks.length - completedCount;

    return {
      completed: completedCount,
      total: tasks.length,
      successes: successCount,
      failures: failureCount,
      percentage: Math.round((completedCount / tasks.length) * 100),
      estimatedRemaining: remaining > 0 ? Math.round(remaining / tasksPerMs) : 0,
      throughput: tasksPerMs * 1000,
    };
  }

  /**
   * Maybe emit progress
   */
  function maybeEmitProgress(): void {
    if (!onProgress) return;

    const now = Date.now();
    if (now - lastProgressTime >= progressThrottle) {
      lastProgressTime = now;
      try {
        onProgress(buildProgress());
      } catch {
        // Ignore progress callback errors
      }
    }
  }

  /**
   * Build final result
   */
  function buildResult(): BatchResult<T> {
    const results: BatchTaskResult<T>[] = taskStates.map((state) => ({
      index: state.index,
      success: state.status === 'completed',
      result: state.result,
      error: state.error,
      duration: state.duration,
    }));

    const successes: T[] = [];
    const failures: Error[] = [];

    for (const state of taskStates) {
      if (state.status === 'completed' && state.result !== undefined) {
        successes.push(state.result);
      } else if (state.error) {
        failures.push(state.error);
      }
    }

    return {
      results,
      successes,
      failures,
      duration: Date.now() - batchStartTime,
      successCount,
      failureCount,
      allSucceeded: failureCount === 0 && !cancelled,
      cancelled,
    };
  }

  /**
   * Complete the batch
   */
  function completeBatch(): void {
    // Cancel any still-running tasks
    for (const [, task] of activeTasks) {
      task.cancel?.();
    }
    activeTasks.clear();

    // Final progress
    if (onProgress && completedCount > 0) {
      try {
        onProgress(buildProgress());
      } catch {
        // Ignore
      }
    }

    resolve(buildResult());
  }

  /**
   * Execute a single task
   */
  async function executeTask(state: TaskState<T>): Promise<void> {
    if (cancelled || state.status !== 'pending') {
      return;
    }

    // Wait if paused
    while (paused && !cancelled) {
      await new Promise<void>((r) => {
        pausePromise = { resolve: r };
      });
      pausePromise = null;
    }

    if (cancelled) return;

    state.status = 'running';
    state.startTime = Date.now();
    runningCount++;

    try {
      // Create task promise
      const taskPromise = executor(
        state.task.method,
        state.task.params,
        state.task.options
      );

      // Store for potential cancellation
      if ('cancel' in taskPromise && typeof taskPromise.cancel === 'function') {
        activeTasks.set(state.index, taskPromise as { cancel: () => void });
      }

      // Apply task timeout if specified
      let result: T;
      if (taskTimeout) {
        result = await Promise.race([
          taskPromise,
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error(`Task timeout after ${taskTimeout}ms`)), taskTimeout)
          ),
        ]);
      } else {
        result = await taskPromise;
      }

      if (!cancelled) {
        state.status = 'completed';
        state.result = result;
        successCount++;
      }
    } catch (err) {
      if (!cancelled) {
        state.status = 'failed';
        state.error = err instanceof Error ? err : new Error(String(err));
        failureCount++;

        if (failFast) {
          cancelled = true;
          // Mark remaining as cancelled
          for (const s of taskStates) {
            if (s.status === 'pending') {
              s.status = 'cancelled';
            }
          }
        }
      }
    } finally {
      state.duration = Date.now() - (state.startTime || Date.now());
      activeTasks.delete(state.index);
      runningCount--;
      completedCount++;
      maybeEmitProgress();
    }
  }

  /**
   * Main execution loop
   */
  async function runBatch(): Promise<void> {
    batchStartTime = Date.now();

    // Set up batch timeout
    let batchTimeoutId: ReturnType<typeof setTimeout> | null = null;
    if (batchTimeout) {
      batchTimeoutId = setTimeout(() => {
        cancelled = true;
        for (const state of taskStates) {
          if (state.status === 'pending') {
            state.status = 'cancelled';
            state.error = new Error(`Batch timeout after ${batchTimeout}ms`);
            failureCount++;
          }
        }
      }, batchTimeout);
    }

    try {
      // Execute tasks with concurrency control
      const executing: Promise<void>[] = [];

      while (nextTaskIndex < tasks.length || executing.length > 0) {
        // Start new tasks up to concurrency limit
        while (
          !cancelled &&
          !paused &&
          nextTaskIndex < tasks.length &&
          runningCount < concurrency
        ) {
          const state = taskStates[nextTaskIndex];
          nextTaskIndex++;

          const taskPromise = executeTask(state);
          executing.push(taskPromise);

          // Remove from executing array when done
          taskPromise.finally(() => {
            const idx = executing.indexOf(taskPromise);
            if (idx !== -1) {
              executing.splice(idx, 1);
            }
          });
        }

        // Wait for at least one task to complete
        if (executing.length > 0) {
          await Promise.race(executing);
        }

        // Check termination conditions
        if (cancelled && runningCount === 0) {
          break;
        }
      }
    } finally {
      if (batchTimeoutId) {
        clearTimeout(batchTimeoutId);
      }
    }

    completeBatch();
  }

  // Start execution
  runBatch().catch((err) => {
    reject(err instanceof Error ? err : new Error(String(err)));
  });

  // Extend promise with batch control methods
  const batchPromise = promise as BatchPromise<T>;

  // Cancel method
  const originalCancel = batchPromise.cancel?.bind(batchPromise);
  batchPromise.cancel = function () {
    cancelled = true;

    // Cancel all active tasks
    for (const [, task] of activeTasks) {
      task.cancel?.();
    }

    // Mark pending as cancelled
    for (const state of taskStates) {
      if (state.status === 'pending') {
        state.status = 'cancelled';
      }
    }

    // Resume if paused
    if (pausePromise) {
      pausePromise.resolve();
    }

    originalCancel?.();
    return this;
  };

  // Pause method
  batchPromise.pause = function () {
    paused = true;
    return this;
  };

  // Resume method
  batchPromise.resume = function () {
    paused = false;
    if (pausePromise) {
      pausePromise.resolve();
    }
    return this;
  };

  // isPaused method
  batchPromise.isPaused = function () {
    return paused;
  };

  return batchPromise;
}

/**
 * Create a parallel map executor
 *
 * @param items - Items to map over
 * @param mapFn - Mapping function (executed in worker)
 * @param executor - Function to execute individual tasks
 * @param options - Map options
 * @returns BatchPromise with mapped results
 */
export function createMapExecutor<T, R>(
  items: T[],
  mapFn: ((item: T, index: number) => R) | string,
  executor: TaskExecutor<R>,
  options: BatchOptions & { chunkSize?: number } = {}
): BatchPromise<R> {
  const { chunkSize, ...batchOptions } = options;

  // Default chunk size: distribute evenly or 1 per task
  const effectiveChunkSize = chunkSize || 1;

  // Create tasks from items
  const tasks: BatchTask[] = [];

  if (effectiveChunkSize === 1) {
    // One task per item
    for (let i = 0; i < items.length; i++) {
      tasks.push({
        // Cast mapFn to compatible type - it will be serialized if function
        method: mapFn as string | ((...args: unknown[]) => unknown),
        params: [items[i], i],
      });
    }
  } else {
    // Chunked execution
    for (let i = 0; i < items.length; i += effectiveChunkSize) {
      const chunk = items.slice(i, i + effectiveChunkSize);
      const startIndex = i;

      // Create a wrapper function that processes the chunk
      const chunkProcessor = `
        (function(chunk, startIndex, mapFn) {
          const fn = typeof mapFn === 'string' ? eval('(' + mapFn + ')') : mapFn;
          return chunk.map((item, i) => fn(item, startIndex + i));
        })
      `;

      tasks.push({
        method: chunkProcessor,
        params: [chunk, startIndex, typeof mapFn === 'function' ? mapFn.toString() : mapFn],
      });
    }
  }

  // Execute batch
  const batchPromise = createBatchExecutor<R>(tasks, executor, batchOptions);

  // If chunked, we need to flatten the results
  if (effectiveChunkSize > 1) {
    const originalThen = batchPromise.then.bind(batchPromise);

    // Override then to flatten chunk results
    (batchPromise as unknown as { then: typeof originalThen }).then = function <
      TResult1,
      TResult2,
    >(
      onFulfilled?: (value: BatchResult<R>) => TResult1 | PromiseLike<TResult1>,
      onRejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
    ) {
      return originalThen((result) => {
        // Flatten chunked results
        const flatSuccesses: R[] = [];
        for (const success of result.successes) {
          if (Array.isArray(success)) {
            flatSuccesses.push(...success);
          } else {
            flatSuccesses.push(success);
          }
        }

        const flatResult: BatchResult<R> = {
          ...result,
          successes: flatSuccesses,
        };

        return onFulfilled ? onFulfilled(flatResult) : flatResult as unknown as TResult1;
      }, onRejected);
    } as typeof originalThen;
  }

  return batchPromise;
}

/**
 * Simple batch executor for when full control isn't needed
 */
export async function executeBatchSimple<T>(
  tasks: BatchTask[],
  executor: TaskExecutor<T>,
  options: Omit<BatchOptions, 'onProgress'> = {}
): Promise<BatchResult<T>> {
  return createBatchExecutor(tasks, executor, options);
}

export default {
  createBatchExecutor,
  createMapExecutor,
  executeBatchSimple,
};
