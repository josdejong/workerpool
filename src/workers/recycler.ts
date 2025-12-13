/**
 * IdleRecycler - Worker recycling based on idle time and task count
 *
 * Tracks worker idle time and task counts, implements recycling thresholds,
 * handles graceful termination and replacement while maintaining minimum worker count.
 */

import type { WorkerInfo } from '../types/internal';

/**
 * Recycle reason
 */
export enum RecycleReason {
  /** Worker has been idle too long */
  IDLE_TIMEOUT = 'idle_timeout',
  /** Worker has processed too many tasks */
  MAX_TASKS = 'max_tasks',
  /** Worker is unhealthy */
  UNHEALTHY = 'unhealthy',
  /** Manual recycle request */
  MANUAL = 'manual',
  /** Memory pressure */
  MEMORY_PRESSURE = 'memory_pressure',
}

/**
 * Worker recycling candidate
 */
export interface RecycleCandidate {
  /** Worker ID */
  workerId: number;
  /** Reason for recycling */
  reason: RecycleReason;
  /** Priority (higher = recycle sooner) */
  priority: number;
  /** Worker info snapshot */
  workerInfo: Partial<WorkerInfo>;
}

/**
 * Recycler options
 */
export interface IdleRecyclerOptions {
  /** Maximum idle time before recycling (ms) */
  maxIdleTime?: number;
  /** Maximum tasks per worker before recycling */
  maxTasksPerWorker?: number;
  /** Minimum workers to maintain */
  minWorkers?: number;
  /** Check interval for recycling (ms) */
  checkInterval?: number;
  /** Grace period before recycling newly created workers (ms) */
  gracePeriod?: number;
  /** Callback before recycling a worker */
  onBeforeRecycle?: (workerId: number, reason: RecycleReason) => boolean | Promise<boolean>;
  /** Callback after recycling a worker */
  onAfterRecycle?: (workerId: number, reason: RecycleReason) => void;
}

/**
 * Worker tracking data for recycling
 */
interface RecycleTracking {
  workerId: number;
  createdAt: number;
  lastActiveAt: number;
  taskCount: number;
  isIdle: boolean;
  markedForRecycle: boolean;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<IdleRecyclerOptions, 'onBeforeRecycle' | 'onAfterRecycle'>> = {
  maxIdleTime: 60000,        // 1 minute
  maxTasksPerWorker: 10000,  // 10k tasks
  minWorkers: 0,
  checkInterval: 10000,      // 10 seconds
  gracePeriod: 30000,        // 30 seconds
};

/**
 * IdleRecycler - Worker lifecycle management
 *
 * @example
 * ```typescript
 * const recycler = new IdleRecycler({
 *   maxIdleTime: 60000,
 *   maxTasksPerWorker: 5000,
 *   minWorkers: 2,
 *   onBeforeRecycle: async (workerId, reason) => {
 *     console.log(`Recycling worker ${workerId}: ${reason}`);
 *     return true; // Allow recycle
 *   }
 * });
 *
 * // Register workers
 * recycler.registerWorker(1);
 * recycler.registerWorker(2);
 *
 * // Update worker activity
 * recycler.recordTaskComplete(1);
 * recycler.markIdle(2);
 *
 * // Get candidates for recycling
 * const candidates = recycler.getCandidates(3); // current worker count
 * for (const candidate of candidates) {
 *   await pool.replaceWorker(candidate.workerId);
 *   recycler.unregisterWorker(candidate.workerId);
 * }
 * ```
 */
export class IdleRecycler {
  private readonly options: Required<Omit<IdleRecyclerOptions, 'onBeforeRecycle' | 'onAfterRecycle'>> & {
    onBeforeRecycle?: (workerId: number, reason: RecycleReason) => boolean | Promise<boolean>;
    onAfterRecycle?: (workerId: number, reason: RecycleReason) => void;
  };

  private workers: Map<number, RecycleTracking> = new Map();
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private recycleQueue: RecycleCandidate[] = [];

  constructor(options: IdleRecyclerOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  /**
   * Start periodic recycling checks
   */
  start(): void {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      this.checkForRecycling();
    }, this.options.checkInterval);
  }

  /**
   * Stop periodic recycling checks
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Register a worker for tracking
   */
  registerWorker(workerId: number): void {
    const now = Date.now();
    this.workers.set(workerId, {
      workerId,
      createdAt: now,
      lastActiveAt: now,
      taskCount: 0,
      isIdle: false,
      markedForRecycle: false,
    });
  }

  /**
   * Unregister a worker
   */
  unregisterWorker(workerId: number): void {
    this.workers.delete(workerId);
    // Remove from recycle queue
    this.recycleQueue = this.recycleQueue.filter(c => c.workerId !== workerId);
  }

  /**
   * Record task completion for a worker
   */
  recordTaskComplete(workerId: number): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastActiveAt = Date.now();
      worker.taskCount++;
      worker.isIdle = false;
    }
  }

  /**
   * Record task start for a worker
   */
  recordTaskStart(workerId: number): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastActiveAt = Date.now();
      worker.isIdle = false;
    }
  }

  /**
   * Mark a worker as idle
   */
  markIdle(workerId: number): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.isIdle = true;
      worker.lastActiveAt = Date.now();
    }
  }

  /**
   * Mark a worker as busy
   */
  markBusy(workerId: number): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.isIdle = false;
      worker.lastActiveAt = Date.now();
    }
  }

  /**
   * Force mark a worker for recycling
   */
  markForRecycle(workerId: number, reason: RecycleReason = RecycleReason.MANUAL): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.markedForRecycle = true;
      this.addToRecycleQueue(worker, reason, 100);  // High priority
    }
  }

  /**
   * Get workers that should be recycled
   */
  getCandidates(currentWorkerCount: number): RecycleCandidate[] {
    this.checkForRecycling();

    // Respect minimum workers
    const canRecycle = currentWorkerCount - this.options.minWorkers;
    if (canRecycle <= 0) {
      return [];
    }

    // Sort by priority (highest first) and return up to canRecycle
    return this.recycleQueue
      .sort((a, b) => b.priority - a.priority)
      .slice(0, canRecycle);
  }

  /**
   * Process a recycle (call after successfully recycling a worker)
   */
  async processRecycle(workerId: number): Promise<void> {
    const candidate = this.recycleQueue.find(c => c.workerId === workerId);
    if (candidate) {
      // Call before callback
      if (this.options.onBeforeRecycle) {
        const allowed = await this.options.onBeforeRecycle(workerId, candidate.reason);
        if (!allowed) {
          // Remove from queue but don't unregister
          this.recycleQueue = this.recycleQueue.filter(c => c.workerId !== workerId);
          const worker = this.workers.get(workerId);
          if (worker) {
            worker.markedForRecycle = false;
          }
          return;
        }
      }

      // Unregister worker
      this.unregisterWorker(workerId);

      // Call after callback
      this.options.onAfterRecycle?.(workerId, candidate.reason);
    }
  }

  /**
   * Get recycler statistics
   */
  getStats(): {
    trackedWorkers: number;
    idleWorkers: number;
    markedForRecycle: number;
    queueSize: number;
    avgTaskCount: number;
    avgIdleTime: number;
  } {
    const now = Date.now();
    const workers = Array.from(this.workers.values());
    const idleWorkers = workers.filter(w => w.isIdle);

    return {
      trackedWorkers: workers.length,
      idleWorkers: idleWorkers.length,
      markedForRecycle: workers.filter(w => w.markedForRecycle).length,
      queueSize: this.recycleQueue.length,
      avgTaskCount: workers.length > 0
        ? workers.reduce((sum, w) => sum + w.taskCount, 0) / workers.length
        : 0,
      avgIdleTime: idleWorkers.length > 0
        ? idleWorkers.reduce((sum, w) => sum + (now - w.lastActiveAt), 0) / idleWorkers.length
        : 0,
    };
  }

  /**
   * Check all workers for recycling
   */
  private checkForRecycling(): void {
    const now = Date.now();

    for (const worker of this.workers.values()) {
      if (worker.markedForRecycle) continue;

      // Skip workers in grace period
      if (now - worker.createdAt < this.options.gracePeriod) {
        continue;
      }

      // Check idle timeout
      if (worker.isIdle && now - worker.lastActiveAt > this.options.maxIdleTime) {
        worker.markedForRecycle = true;
        this.addToRecycleQueue(worker, RecycleReason.IDLE_TIMEOUT, 50);
        continue;
      }

      // Check max tasks
      if (worker.taskCount >= this.options.maxTasksPerWorker) {
        worker.markedForRecycle = true;
        this.addToRecycleQueue(worker, RecycleReason.MAX_TASKS, 30);
        continue;
      }
    }
  }

  /**
   * Add worker to recycle queue
   */
  private addToRecycleQueue(
    worker: RecycleTracking,
    reason: RecycleReason,
    basePriority: number
  ): void {
    // Don't add duplicates
    if (this.recycleQueue.some(c => c.workerId === worker.workerId)) {
      return;
    }

    // Calculate priority based on reason and worker state
    let priority = basePriority;

    // Older workers get higher priority
    const ageMinutes = (Date.now() - worker.createdAt) / 60000;
    priority += Math.min(ageMinutes, 30);  // Cap at 30 minutes worth

    // More tasks = higher priority for max_tasks reason
    if (reason === RecycleReason.MAX_TASKS) {
      priority += (worker.taskCount / this.options.maxTasksPerWorker) * 20;
    }

    // Longer idle = higher priority for idle_timeout
    if (reason === RecycleReason.IDLE_TIMEOUT) {
      const idleMinutes = (Date.now() - worker.lastActiveAt) / 60000;
      priority += Math.min(idleMinutes * 2, 20);
    }

    this.recycleQueue.push({
      workerId: worker.workerId,
      reason,
      priority,
      workerInfo: {
        id: worker.workerId,
        tasksCompleted: worker.taskCount,
        createdAt: worker.createdAt,
        lastActiveAt: worker.lastActiveAt,
      },
    });
  }
}

export default IdleRecycler;
