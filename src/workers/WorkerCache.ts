/**
 * WorkerCache - Pre-warmed worker pool for instant task dispatch
 *
 * Maintains a cache of ready workers to minimize spawn latency.
 * Handles worker lifecycle, recycling, and health monitoring.
 */

import type { WorkerHandlerOptions } from '../core/WorkerHandler';
import { WorkerState, WorkerInfo } from '../types/internal';

/**
 * Cached worker entry
 */
export interface CachedWorker {
  /** Unique worker ID */
  id: number;
  /** Current state */
  state: WorkerState;
  /** Worker information for stats */
  info: WorkerInfo;
  /** Timestamp of last activity */
  lastUsed: number;
  /** Number of tasks executed */
  taskCount: number;
  /** Whether worker is in the warm pool */
  isWarm: boolean;
  /** Optional error from last crash */
  lastError?: Error;
}

/**
 * Options for WorkerCache
 */
export interface WorkerCacheOptions {
  /** Minimum workers to keep warm */
  minWorkers: number;
  /** Maximum workers allowed */
  maxWorkers: number;
  /** Path to worker script */
  script: string;
  /** Handler options */
  workerOptions: WorkerHandlerOptions;
  /** Pre-warm workers on creation */
  preWarm: boolean;
  /** Idle timeout before recycling (ms) */
  idleTimeout: number;
  /** Max tasks before recycling */
  maxTasksPerWorker: number;
  /** Terminate timeout (ms) */
  terminateTimeout: number;
  /** Enable adaptive scaling based on load */
  adaptiveScaling: boolean;
  /** Target queue size per worker for scaling decisions */
  targetQueueSizePerWorker: number;
  /** Scale up threshold (utilization %) */
  scaleUpThreshold: number;
  /** Scale down threshold (utilization %) */
  scaleDownThreshold: number;
  /** Health check interval (ms) */
  healthCheckInterval: number;
  /** Max consecutive failures before recycling */
  maxConsecutiveFailures: number;
  /** Callback when worker is created */
  onCreateWorker?: (info: WorkerInfo) => void;
  /** Callback when worker is terminated */
  onTerminateWorker?: (info: WorkerInfo) => void;
}

/**
 * Worker cache statistics
 */
export interface WorkerCacheStats {
  /** Total workers in cache */
  total: number;
  /** Workers ready and waiting */
  warm: number;
  /** Workers currently busy */
  busy: number;
  /** Workers being recycled */
  recycling: number;
  /** Total tasks processed */
  totalTasksProcessed: number;
  /** Average tasks per worker */
  avgTasksPerWorker: number;
}

/**
 * Pre-warmed worker cache for instant task dispatch
 *
 * @example
 * ```typescript
 * const cache = new WorkerCache({
 *   minWorkers: 2,
 *   maxWorkers: 8,
 *   script: './worker.js',
 *   preWarm: true
 * });
 *
 * // Wait for warm-up
 * await cache.warmUp();
 *
 * // Acquire a worker (instant if pre-warmed)
 * const worker = await cache.acquire();
 *
 * // Release worker back to pool
 * cache.release(worker.id);
 *
 * // Shutdown all workers
 * await cache.shutdown();
 * ```
 */
export class WorkerCache {
  private readonly options: Required<WorkerCacheOptions>;
  private readonly cache: Map<number, CachedWorker> = new Map();
  private readonly warmPool: number[] = [];  // IDs of ready workers
  private readonly busySet: Set<number> = new Set();
  private nextId = 1;
  private warmingPromise: Promise<void> | null = null;
  private isShuttingDown = false;
  private recycleTimer: ReturnType<typeof setInterval> | null = null;
  private totalTasksProcessed = 0;

  constructor(options: Partial<WorkerCacheOptions> & Pick<WorkerCacheOptions, 'script'>) {
    const { script, ...restOptions } = options;
    this.options = {
      minWorkers: 0,
      maxWorkers: 4,
      workerOptions: {},
      preWarm: false,
      idleTimeout: 60000,  // 1 minute
      maxTasksPerWorker: 10000,
      terminateTimeout: 1000,
      ...restOptions,
      script,  // Ensure script is always set from required parameter
    } as Required<WorkerCacheOptions>;

    if (this.options.preWarm && this.options.minWorkers > 0) {
      this.warmingPromise = this.warmUp();
    }

    // Start recycling timer
    this.startRecycleTimer();
  }

  /**
   * Pre-warm workers up to minWorkers
   */
  async warmUp(): Promise<void> {
    if (this.isShuttingDown) return;

    const promises: Promise<CachedWorker | null>[] = [];
    const needed = this.options.minWorkers - this.cache.size;

    for (let i = 0; i < needed; i++) {
      promises.push(this.createWorker());
    }

    const workers = await Promise.all(promises);
    for (const worker of workers) {
      if (worker) {
        this.warmPool.push(worker.id);
      }
    }

    this.warmingPromise = null;
  }

  /**
   * Acquire an available worker
   * Returns null if no workers available and at max capacity
   */
  async acquire(): Promise<CachedWorker | null> {
    if (this.isShuttingDown) return null;

    // Wait for initial warm-up
    if (this.warmingPromise) {
      await this.warmingPromise;
    }

    // Try warm pool first (O(1) - pop from end)
    if (this.warmPool.length > 0) {
      const id = this.warmPool.pop()!;
      const worker = this.cache.get(id);
      if (worker) {
        worker.state = WorkerState.BUSY;
        worker.lastUsed = Date.now();
        worker.isWarm = false;
        this.busySet.add(id);
        return worker;
      }
    }

    // Create new worker if under max
    if (this.cache.size < this.options.maxWorkers) {
      const worker = await this.createWorker();
      if (worker) {
        worker.state = WorkerState.BUSY;
        this.busySet.add(worker.id);
        return worker;
      }
    }

    // No workers available
    return null;
  }

  /**
   * Release worker back to pool
   */
  release(workerId: number): void {
    const worker = this.cache.get(workerId);
    if (!worker) return;

    this.busySet.delete(workerId);
    worker.taskCount++;
    this.totalTasksProcessed++;

    if (this.isShuttingDown) {
      this.terminateWorker(workerId);
      return;
    }

    // Check if should be recycled
    if (this.shouldRecycle(worker)) {
      this.recycleWorker(workerId);
      return;
    }

    // Return to warm pool
    worker.state = WorkerState.READY;
    worker.lastUsed = Date.now();
    worker.isWarm = true;
    this.warmPool.push(workerId);

    // Maintain minimum workers
    this.maintainMinWorkers();
  }

  /**
   * Mark worker task as completed
   */
  onTaskComplete(workerId: number): void {
    const worker = this.cache.get(workerId);
    if (worker) {
      worker.info.tasksCompleted++;
      worker.info.lastActiveAt = Date.now();
    }
  }

  /**
   * Mark worker task as failed
   */
  onTaskFailed(workerId: number, error: Error): void {
    const worker = this.cache.get(workerId);
    if (worker) {
      worker.info.tasksFailed++;
      worker.info.lastActiveAt = Date.now();
      worker.lastError = error;
    }
  }

  /**
   * Get cache statistics
   */
  stats(): WorkerCacheStats {
    return {
      total: this.cache.size,
      warm: this.warmPool.length,
      busy: this.busySet.size,
      recycling: this.cache.size - this.warmPool.length - this.busySet.size,
      totalTasksProcessed: this.totalTasksProcessed,
      avgTasksPerWorker: this.cache.size > 0
        ? this.totalTasksProcessed / this.cache.size
        : 0,
    };
  }

  /**
   * Get worker by ID
   */
  get(workerId: number): CachedWorker | undefined {
    return this.cache.get(workerId);
  }

  /**
   * Check if cache has available workers
   */
  hasAvailable(): boolean {
    return this.warmPool.length > 0 || this.cache.size < this.options.maxWorkers;
  }

  /**
   * Get number of available worker slots
   */
  availableSlots(): number {
    return this.warmPool.length + (this.options.maxWorkers - this.cache.size);
  }

  /**
   * Gracefully shutdown all workers
   */
  async shutdown(force = false): Promise<void> {
    this.isShuttingDown = true;
    this.stopRecycleTimer();

    const terminatePromises: Promise<void>[] = [];

    for (const id of this.cache.keys()) {
      terminatePromises.push(this.terminateWorker(id, force));
    }

    await Promise.all(terminatePromises);
    this.warmPool.length = 0;
    this.busySet.clear();
  }

  /**
   * Create a new worker
   */
  private async createWorker(): Promise<CachedWorker | null> {
    if (this.isShuttingDown) return null;

    try {
      const id = this.nextId++;
      const now = Date.now();

      const info: WorkerInfo = {
        id,
        state: WorkerState.WARMING,
        tasksCompleted: 0,
        tasksFailed: 0,
        createdAt: now,
        busyTime: 0,
      };

      const worker: CachedWorker = {
        id,
        state: WorkerState.WARMING,
        info,
        lastUsed: now,
        taskCount: 0,
        isWarm: false,
      };

      this.cache.set(id, worker);

      // Simulate worker ready (actual implementation would await worker ready signal)
      worker.state = WorkerState.READY;
      worker.info.state = WorkerState.READY;
      worker.isWarm = true;

      // Notify callback
      this.options.onCreateWorker?.(info);

      return worker;
    } catch (error) {
      console.error('Failed to create worker:', error);
      return null;
    }
  }

  /**
   * Terminate a worker
   */
  private async terminateWorker(workerId: number, force = false): Promise<void> {
    const worker = this.cache.get(workerId);
    if (!worker) return;

    worker.state = WorkerState.TERMINATING;
    worker.info.state = WorkerState.TERMINATING;

    // Remove from pools
    const warmIndex = this.warmPool.indexOf(workerId);
    if (warmIndex !== -1) {
      this.warmPool.splice(warmIndex, 1);
    }
    this.busySet.delete(workerId);

    try {
      // Actual worker termination would happen here
      // await actualWorkerHandler.terminateAndNotify(force, this.options.terminateTimeout);

      worker.state = WorkerState.TERMINATED;
      worker.info.state = WorkerState.TERMINATED;
    } finally {
      this.cache.delete(workerId);
      this.options.onTerminateWorker?.(worker.info);
    }
  }

  /**
   * Check if worker should be recycled
   */
  private shouldRecycle(worker: CachedWorker): boolean {
    const idleTime = Date.now() - worker.lastUsed;
    return (
      idleTime > this.options.idleTimeout ||
      worker.taskCount >= this.options.maxTasksPerWorker
    );
  }

  /**
   * Recycle a worker (terminate and create replacement if needed)
   */
  private async recycleWorker(workerId: number): Promise<void> {
    await this.terminateWorker(workerId);

    // Create replacement if below min
    if (!this.isShuttingDown && this.cache.size < this.options.minWorkers) {
      const replacement = await this.createWorker();
      if (replacement) {
        this.warmPool.push(replacement.id);
      }
    }
  }

  /**
   * Ensure minimum workers are maintained
   */
  private maintainMinWorkers(): void {
    if (this.isShuttingDown) return;

    const deficit = this.options.minWorkers - this.cache.size;
    if (deficit > 0) {
      // Background creation
      for (let i = 0; i < deficit; i++) {
        this.createWorker().then((worker) => {
          if (worker && !this.isShuttingDown) {
            this.warmPool.push(worker.id);
          }
        });
      }
    }
  }

  /**
   * Start the recycle timer
   */
  private startRecycleTimer(): void {
    if (this.options.idleTimeout <= 0) return;

    // Check for idle workers every 10 seconds
    this.recycleTimer = setInterval(() => {
      if (this.isShuttingDown) return;

      const now = Date.now();
      const toRecycle: number[] = [];

      for (const [id, worker] of this.cache) {
        if (
          worker.isWarm &&
          now - worker.lastUsed > this.options.idleTimeout &&
          this.cache.size > this.options.minWorkers
        ) {
          toRecycle.push(id);
        }
      }

      for (const id of toRecycle) {
        // Remove from warm pool first
        const warmIndex = this.warmPool.indexOf(id);
        if (warmIndex !== -1) {
          this.warmPool.splice(warmIndex, 1);
        }
        this.recycleWorker(id);
      }
    }, 10000);
  }

  /**
   * Stop the recycle timer
   */
  private stopRecycleTimer(): void {
    if (this.recycleTimer) {
      clearInterval(this.recycleTimer);
      this.recycleTimer = null;
    }
  }
}
