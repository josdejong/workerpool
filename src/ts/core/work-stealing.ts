/**
 * Work-Stealing Task Distribution
 *
 * Implements a distributed task queue system where each worker has a local queue,
 * and idle workers can "steal" tasks from busy workers' queues.
 *
 * This pattern is used in high-performance parallel runtimes like:
 * - Java's ForkJoinPool
 * - Rust's Rayon
 * - Go's goroutine scheduler
 * - Intel TBB
 *
 * Benefits:
 * - Reduces contention on central queue (O(1) local operations)
 * - Automatic load balancing without central coordination
 * - Better cache locality (LIFO for local, FIFO for stealing)
 * - Scales well with worker count
 */

import { GrowableCircularBuffer } from './circular-buffer';

/**
 * Task wrapper for the work-stealing system
 */
export interface StealableTask<T = unknown> {
  /** Unique task identifier */
  id: number;
  /** Task payload/data */
  data: T;
  /** Timestamp when task was added */
  timestamp: number;
  /** Optional priority (higher = more urgent) */
  priority?: number;
  /** Worker affinity hint */
  preferredWorker?: number;
  /** Task type for routing */
  taskType?: string;
  /** Estimated duration in ms */
  estimatedDuration?: number;
}

/**
 * Per-worker local queue with stealing support
 *
 * Uses a double-ended queue (deque) implementation:
 * - Push/pop from bottom (LIFO) for local operations - better cache locality
 * - Steal from top (FIFO) for remote operations - fairness
 */
export class WorkStealingDeque<T> {
  private readonly buffer: GrowableCircularBuffer<StealableTask<T>>;
  private readonly workerId: number;
  private stealCount = 0;
  private localPushCount = 0;
  private localPopCount = 0;

  constructor(workerId: number, initialCapacity = 64) {
    this.workerId = workerId;
    this.buffer = new GrowableCircularBuffer<StealableTask<T>>(initialCapacity);
  }

  /**
   * Push a task to the bottom (local end) of the deque
   * Called by the owner worker
   * O(1) amortized
   */
  pushBottom(task: StealableTask<T>): void {
    this.buffer.push(task);
    this.localPushCount++;
  }

  /**
   * Pop a task from the bottom (local end) of the deque
   * Called by the owner worker - LIFO for cache locality
   * O(1)
   */
  popBottom(): StealableTask<T> | undefined {
    if (this.buffer.isEmpty) {
      return undefined;
    }

    // Pop from tail (most recent) for LIFO behavior
    const task = this.buffer.pop();
    if (task) {
      this.localPopCount++;
    }
    return task;
  }

  /**
   * Steal a task from the top (remote end) of the deque
   * Called by other workers - FIFO for fairness
   * O(1)
   */
  steal(): StealableTask<T> | undefined {
    if (this.buffer.isEmpty) {
      return undefined;
    }

    // Shift from head (oldest) for FIFO behavior when stealing
    const task = this.buffer.shift();
    if (task) {
      this.stealCount++;
    }
    return task;
  }

  /**
   * Steal multiple tasks at once (batch stealing)
   * More efficient when there's significant imbalance
   */
  stealBatch(maxCount: number): StealableTask<T>[] {
    const stolen: StealableTask<T>[] = [];
    const halfSize = Math.floor(this.buffer.size / 2);
    const toSteal = Math.min(maxCount, halfSize); // Never steal more than half

    for (let i = 0; i < toSteal; i++) {
      const task = this.steal();
      if (!task) break;
      stolen.push(task);
    }

    return stolen;
  }

  /**
   * Peek at bottom task without removing
   */
  peekBottom(): StealableTask<T> | undefined {
    if (this.buffer.isEmpty) {
      return undefined;
    }
    return this.buffer.peekLast();
  }

  /**
   * Peek at top task without removing
   */
  peekTop(): StealableTask<T> | undefined {
    if (this.buffer.isEmpty) {
      return undefined;
    }
    return this.buffer.peek();
  }

  /**
   * Check if deque is empty
   */
  isEmpty(): boolean {
    return this.buffer.isEmpty;
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.buffer.size;
  }

  /**
   * Get worker ID
   */
  get owner(): number {
    return this.workerId;
  }

  /**
   * Get statistics
   */
  getStats(): WorkStealingDequeStats {
    return {
      workerId: this.workerId,
      size: this.buffer.size,
      capacity: this.buffer.capacity,
      stealCount: this.stealCount,
      localPushCount: this.localPushCount,
      localPopCount: this.localPopCount,
      stealRatio: this.localPopCount > 0
        ? this.stealCount / (this.localPopCount + this.stealCount)
        : 0,
    };
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.buffer.clear();
  }
}

/**
 * Statistics for a work-stealing deque
 */
export interface WorkStealingDequeStats {
  workerId: number;
  size: number;
  capacity: number;
  stealCount: number;
  localPushCount: number;
  localPopCount: number;
  stealRatio: number;
}

/**
 * Stealing policy determines how victims are selected
 */
export type StealingPolicy =
  | 'random'           // Random victim selection
  | 'round-robin'      // Cycle through workers
  | 'busiest-first'    // Steal from busiest worker
  | 'neighbor';        // Steal from adjacent workers (cache-friendly)

/**
 * Work-Stealing Scheduler
 *
 * Coordinates multiple work-stealing deques and implements
 * the stealing protocol.
 */
export class WorkStealingScheduler<T = unknown> {
  private readonly deques: Map<number, WorkStealingDeque<T>> = new Map();
  private readonly stealingPolicy: StealingPolicy;
  private taskIdCounter = 0;
  private roundRobinIndex = 0;
  private globalTaskCount = 0;
  private totalSteals = 0;
  private stealAttempts = 0;

  constructor(options: WorkStealingSchedulerOptions = {}) {
    this.stealingPolicy = options.stealingPolicy ?? 'busiest-first';
  }

  /**
   * Register a new worker
   */
  registerWorker(workerId: number): WorkStealingDeque<T> {
    if (this.deques.has(workerId)) {
      return this.deques.get(workerId)!;
    }

    const deque = new WorkStealingDeque<T>(workerId);
    this.deques.set(workerId, deque);
    return deque;
  }

  /**
   * Unregister a worker and redistribute its tasks
   */
  unregisterWorker(workerId: number): StealableTask<T>[] {
    const deque = this.deques.get(workerId);
    if (!deque) {
      return [];
    }

    // Collect remaining tasks
    const remainingTasks: StealableTask<T>[] = [];
    while (!deque.isEmpty()) {
      const task = deque.popBottom();
      if (task) {
        remainingTasks.push(task);
      }
    }

    this.deques.delete(workerId);
    return remainingTasks;
  }

  /**
   * Submit a new task to a specific worker's queue
   */
  submit(workerId: number, data: T, options: TaskSubmitOptions = {}): StealableTask<T> {
    const deque = this.deques.get(workerId);
    if (!deque) {
      throw new Error(`Worker ${workerId} not registered`);
    }

    const task: StealableTask<T> = {
      id: ++this.taskIdCounter,
      data,
      timestamp: Date.now(),
      priority: options.priority,
      preferredWorker: options.preferredWorker,
      taskType: options.taskType,
      estimatedDuration: options.estimatedDuration,
    };

    deque.pushBottom(task);
    this.globalTaskCount++;

    return task;
  }

  /**
   * Get a task for a worker - tries local queue first, then steals
   */
  getTask(workerId: number): StealableTask<T> | undefined {
    const localDeque = this.deques.get(workerId);
    if (!localDeque) {
      return undefined;
    }

    // Try local queue first (LIFO - cache locality)
    let task = localDeque.popBottom();
    if (task) {
      return task;
    }

    // Local queue empty - try to steal
    task = this.trySteal(workerId);
    if (task) {
      this.totalSteals++;
    }

    return task;
  }

  /**
   * Try to steal a task from another worker
   */
  private trySteal(thiefId: number): StealableTask<T> | undefined {
    this.stealAttempts++;

    const victims = this.selectVictims(thiefId);

    for (const victimId of victims) {
      const victimDeque = this.deques.get(victimId);
      if (!victimDeque || victimDeque.isEmpty()) {
        continue;
      }

      // Check if victim has tasks with affinity to thief
      const peeked = victimDeque.peekTop();
      if (peeked?.preferredWorker === thiefId) {
        const task = victimDeque.steal();
        if (task) {
          return task;
        }
      }

      // Steal oldest task (FIFO from victim's perspective)
      const task = victimDeque.steal();
      if (task) {
        return task;
      }
    }

    return undefined;
  }

  /**
   * Select victims based on stealing policy
   */
  private selectVictims(thiefId: number): number[] {
    const workerIds = Array.from(this.deques.keys()).filter(id => id !== thiefId);

    switch (this.stealingPolicy) {
      case 'random':
        return this.shuffleArray(workerIds);

      case 'round-robin':
        return this.roundRobinOrder(workerIds);

      case 'busiest-first':
        return this.busiestFirstOrder(workerIds);

      case 'neighbor':
        return this.neighborOrder(thiefId, workerIds);

      default:
        return workerIds;
    }
  }

  private shuffleArray(arr: number[]): number[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private roundRobinOrder(workerIds: number[]): number[] {
    const result: number[] = [];
    const len = workerIds.length;

    for (let i = 0; i < len; i++) {
      result.push(workerIds[(this.roundRobinIndex + i) % len]);
    }

    this.roundRobinIndex = (this.roundRobinIndex + 1) % len;
    return result;
  }

  private busiestFirstOrder(workerIds: number[]): number[] {
    return [...workerIds].sort((a, b) => {
      const dequeA = this.deques.get(a);
      const dequeB = this.deques.get(b);
      return (dequeB?.size ?? 0) - (dequeA?.size ?? 0);
    });
  }

  private neighborOrder(thiefId: number, workerIds: number[]): number[] {
    // Sort by distance from thief
    return [...workerIds].sort((a, b) => {
      const distA = Math.abs(a - thiefId);
      const distB = Math.abs(b - thiefId);
      return distA - distB;
    });
  }

  /**
   * Batch steal for severe imbalance
   */
  stealBatch(thiefId: number, maxTasks: number): StealableTask<T>[] {
    const stolen: StealableTask<T>[] = [];
    const victims = this.selectVictims(thiefId);

    for (const victimId of victims) {
      if (stolen.length >= maxTasks) break;

      const victimDeque = this.deques.get(victimId);
      if (!victimDeque) continue;

      const batch = victimDeque.stealBatch(maxTasks - stolen.length);
      stolen.push(...batch);
      this.totalSteals += batch.length;
    }

    return stolen;
  }

  /**
   * Get total pending tasks across all workers
   */
  getTotalPendingTasks(): number {
    let total = 0;
    for (const deque of this.deques.values()) {
      total += deque.size;
    }
    return total;
  }

  /**
   * Get load imbalance factor (max/min queue sizes)
   */
  getLoadImbalance(): number {
    if (this.deques.size === 0) return 1;

    let min = Infinity;
    let max = 0;

    for (const deque of this.deques.values()) {
      min = Math.min(min, deque.size);
      max = Math.max(max, deque.size);
    }

    return min > 0 ? max / min : max + 1;
  }

  /**
   * Check if work stealing might help (high imbalance)
   */
  shouldSteal(): boolean {
    return this.getLoadImbalance() > 2;
  }

  /**
   * Get detailed statistics
   */
  getStats(): WorkStealingStats {
    const dequeStats: WorkStealingDequeStats[] = [];
    let totalSize = 0;

    for (const deque of this.deques.values()) {
      const stats = deque.getStats();
      dequeStats.push(stats);
      totalSize += stats.size;
    }

    return {
      workerCount: this.deques.size,
      totalPendingTasks: totalSize,
      totalTasksSubmitted: this.globalTaskCount,
      totalSteals: this.totalSteals,
      stealAttempts: this.stealAttempts,
      stealSuccessRate: this.stealAttempts > 0
        ? this.totalSteals / this.stealAttempts
        : 0,
      loadImbalance: this.getLoadImbalance(),
      stealingPolicy: this.stealingPolicy,
      dequeStats,
    };
  }

  /**
   * Get the worker with the most pending tasks
   */
  getBusiestWorker(): number | undefined {
    let maxSize = -1;
    let busiestId: number | undefined;

    for (const [id, deque] of this.deques) {
      if (deque.size > maxSize) {
        maxSize = deque.size;
        busiestId = id;
      }
    }

    return busiestId;
  }

  /**
   * Get the worker with the fewest pending tasks
   */
  getLeastBusyWorker(): number | undefined {
    let minSize = Infinity;
    let leastBusyId: number | undefined;

    for (const [id, deque] of this.deques) {
      if (deque.size < minSize) {
        minSize = deque.size;
        leastBusyId = id;
      }
    }

    return leastBusyId;
  }

  /**
   * Clear all queues
   */
  clear(): void {
    for (const deque of this.deques.values()) {
      deque.clear();
    }
    this.globalTaskCount = 0;
    this.totalSteals = 0;
    this.stealAttempts = 0;
  }

  /**
   * Reset statistics only
   */
  resetStats(): void {
    this.globalTaskCount = 0;
    this.totalSteals = 0;
    this.stealAttempts = 0;
  }
}

/**
 * Options for work-stealing scheduler
 */
export interface WorkStealingSchedulerOptions {
  /** Policy for selecting steal victims */
  stealingPolicy?: StealingPolicy;
}

/**
 * Options for task submission
 */
export interface TaskSubmitOptions {
  /** Task priority (higher = more urgent) */
  priority?: number;
  /** Preferred worker for task affinity */
  preferredWorker?: number;
  /** Task type for routing */
  taskType?: string;
  /** Estimated duration in ms */
  estimatedDuration?: number;
}

/**
 * Overall statistics for work-stealing scheduler
 */
export interface WorkStealingStats {
  workerCount: number;
  totalPendingTasks: number;
  totalTasksSubmitted: number;
  totalSteals: number;
  stealAttempts: number;
  stealSuccessRate: number;
  loadImbalance: number;
  stealingPolicy: StealingPolicy;
  dequeStats: WorkStealingDequeStats[];
}

/**
 * Helper to rebalance tasks when load is severely imbalanced
 */
export function rebalanceTasks<T>(
  scheduler: WorkStealingScheduler<T>,
  threshold = 3
): number {
  const stats = scheduler.getStats();

  if (stats.loadImbalance < threshold) {
    return 0;
  }

  const leastBusy = scheduler.getLeastBusyWorker();
  if (leastBusy === undefined) {
    return 0;
  }

  // Steal half the difference
  const busiestId = scheduler.getBusiestWorker();
  if (busiestId === undefined || busiestId === leastBusy) {
    return 0;
  }

  const maxToSteal = Math.floor(stats.totalPendingTasks / stats.workerCount / 2);
  const stolen = scheduler.stealBatch(leastBusy, maxToSteal);

  return stolen.length;
}
