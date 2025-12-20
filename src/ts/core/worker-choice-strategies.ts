/**
 * Worker Choice Strategies
 *
 * High-performance worker selection algorithms inspired by industry-standard
 * thread pool implementations (Java ForkJoinPool, Rayon, Poolifier).
 *
 * These strategies optimize for different workload characteristics:
 * - ROUND_ROBIN: Even distribution, predictable behavior
 * - LEAST_BUSY: Best for variable task durations
 * - LEAST_USED: Best for long-running pools with historical balance
 * - FAIR_SHARE: Best for mixed workloads (CPU-bound + I/O-bound)
 * - WEIGHTED_ROUND_ROBIN: Best when workers have different capabilities
 * - INTERLEAVED_WEIGHTED_ROUND_ROBIN: Smoother distribution than weighted
 */

import type { WorkerHandler } from './WorkerHandler';

/**
 * Available worker selection strategies
 */
export type WorkerChoiceStrategy =
  | 'round-robin'
  | 'least-busy'
  | 'least-used'
  | 'fair-share'
  | 'weighted-round-robin'
  | 'interleaved-weighted-round-robin';

/**
 * Worker statistics used for selection decisions
 */
export interface WorkerStats {
  /** Unique worker identifier */
  workerId: number;
  /** Number of currently running tasks */
  activeTasks: number;
  /** Total tasks completed by this worker */
  totalTasksCompleted: number;
  /** Total execution time in milliseconds */
  totalExecutionTime: number;
  /** Average task duration in milliseconds */
  avgTaskDuration: number;
  /** Task success rate (0-1) */
  successRate: number;
  /** Whether worker is currently available */
  isAvailable: boolean;
  /** Worker weight for weighted strategies (default: 1) */
  weight: number;
  /** Running execution time of current tasks */
  runningExecutionTime: number;
  /** Virtual execution time for fair-share */
  virtualTaskCount: number;
}

/**
 * Options for worker selection
 */
export interface WorkerSelectionOptions {
  /** Preferred worker index for task affinity */
  affinityWorkerIndex?: number;
  /** Task type hint for routing */
  taskType?: string;
  /** Estimated task duration in ms */
  estimatedDuration?: number;
}

/**
 * Result of worker selection
 */
export interface WorkerSelectionResult {
  /** Index of selected worker */
  workerIndex: number;
  /** Strategy used for selection */
  strategy: WorkerChoiceStrategy;
  /** Selection metadata */
  metadata?: {
    reason: string;
    alternativeCount: number;
  };
}

/**
 * Abstract base class for worker choice strategies
 */
export abstract class WorkerChoiceStrategyBase {
  protected workerStats: Map<number, WorkerStats> = new Map();
  protected readonly defaultWeight = 1;

  /**
   * Select a worker for task execution
   */
  abstract choose(
    workers: WorkerHandler[],
    options?: WorkerSelectionOptions
  ): WorkerSelectionResult | null;

  /**
   * Get the strategy name
   */
  abstract get name(): WorkerChoiceStrategy;

  /**
   * Update worker statistics after task completion
   */
  updateStats(
    workerIndex: number,
    executionTime: number,
    success: boolean
  ): void {
    const stats = this.workerStats.get(workerIndex);
    if (stats) {
      stats.totalTasksCompleted++;
      stats.totalExecutionTime += executionTime;
      stats.avgTaskDuration = stats.totalExecutionTime / stats.totalTasksCompleted;
      stats.successRate = stats.successRate * 0.9 + (success ? 0.1 : 0);
    }
  }

  /**
   * Initialize or update worker stats
   */
  initializeWorker(workerIndex: number, weight = 1): void {
    if (!this.workerStats.has(workerIndex)) {
      this.workerStats.set(workerIndex, {
        workerId: workerIndex,
        activeTasks: 0,
        totalTasksCompleted: 0,
        totalExecutionTime: 0,
        avgTaskDuration: 0,
        successRate: 1,
        isAvailable: true,
        weight,
        runningExecutionTime: 0,
        virtualTaskCount: 0,
      });
    }
  }

  /**
   * Mark worker as busy
   */
  incrementActiveTasks(workerIndex: number): void {
    const stats = this.workerStats.get(workerIndex);
    if (stats) {
      stats.activeTasks++;
    }
  }

  /**
   * Mark worker as less busy
   */
  decrementActiveTasks(workerIndex: number): void {
    const stats = this.workerStats.get(workerIndex);
    if (stats && stats.activeTasks > 0) {
      stats.activeTasks--;
    }
  }

  /**
   * Check if worker is available
   */
  protected isWorkerAvailable(worker: WorkerHandler): boolean {
    return !worker.busy();
  }

  /**
   * Get available workers
   */
  protected getAvailableWorkers(workers: WorkerHandler[]): number[] {
    return workers
      .map((w, i) => ({ worker: w, index: i }))
      .filter(({ worker }) => this.isWorkerAvailable(worker))
      .map(({ index }) => index);
  }

  /**
   * Reset all statistics
   */
  reset(): void {
    this.workerStats.clear();
  }

  /**
   * Get statistics snapshot
   */
  getStats(): Map<number, WorkerStats> {
    return new Map(this.workerStats);
  }
}

/**
 * Round-Robin Strategy
 *
 * Distributes tasks evenly across workers in rotation.
 * Best for: Uniform task durations, predictable load distribution
 * Time complexity: O(n) worst case to find available worker
 */
export class RoundRobinStrategy extends WorkerChoiceStrategyBase {
  private nextWorkerIndex = 0;

  get name(): WorkerChoiceStrategy {
    return 'round-robin';
  }

  choose(
    workers: WorkerHandler[],
    options?: WorkerSelectionOptions
  ): WorkerSelectionResult | null {
    if (workers.length === 0) return null;

    // Handle affinity hint
    if (options?.affinityWorkerIndex !== undefined) {
      const affinityIndex = options.affinityWorkerIndex;
      if (affinityIndex >= 0 && affinityIndex < workers.length) {
        if (this.isWorkerAvailable(workers[affinityIndex])) {
          return {
            workerIndex: affinityIndex,
            strategy: this.name,
            metadata: { reason: 'affinity', alternativeCount: 0 }
          };
        }
      }
    }

    const startIndex = this.nextWorkerIndex;
    let attempts = 0;

    while (attempts < workers.length) {
      const currentIndex = this.nextWorkerIndex;
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % workers.length;

      if (this.isWorkerAvailable(workers[currentIndex])) {
        return {
          workerIndex: currentIndex,
          strategy: this.name,
          metadata: {
            reason: 'rotation',
            alternativeCount: workers.length - attempts - 1
          }
        };
      }

      attempts++;
    }

    // All workers busy - return the next in rotation anyway (will be queued)
    this.nextWorkerIndex = (startIndex + 1) % workers.length;
    return {
      workerIndex: startIndex,
      strategy: this.name,
      metadata: { reason: 'all-busy-rotation', alternativeCount: 0 }
    };
  }
}

/**
 * Least-Busy Strategy
 *
 * Selects the worker with the fewest active tasks.
 * Best for: Variable task durations, I/O-bound workloads
 * Time complexity: O(n) to find minimum
 */
export class LeastBusyStrategy extends WorkerChoiceStrategyBase {
  get name(): WorkerChoiceStrategy {
    return 'least-busy';
  }

  choose(
    workers: WorkerHandler[],
    options?: WorkerSelectionOptions
  ): WorkerSelectionResult | null {
    if (workers.length === 0) return null;

    // Handle affinity hint - only use if worker is idle
    if (options?.affinityWorkerIndex !== undefined) {
      const affinityIndex = options.affinityWorkerIndex;
      if (affinityIndex >= 0 && affinityIndex < workers.length) {
        const stats = this.workerStats.get(affinityIndex);
        if (stats && stats.activeTasks === 0 && this.isWorkerAvailable(workers[affinityIndex])) {
          return {
            workerIndex: affinityIndex,
            strategy: this.name,
            metadata: { reason: 'affinity-idle', alternativeCount: 0 }
          };
        }
      }
    }

    let minTasks = Infinity;
    let selectedIndex = -1;
    let availableCount = 0;

    for (let i = 0; i < workers.length; i++) {
      this.initializeWorker(i);
      const stats = this.workerStats.get(i)!;

      if (this.isWorkerAvailable(workers[i])) {
        availableCount++;
        if (stats.activeTasks < minTasks) {
          minTasks = stats.activeTasks;
          selectedIndex = i;
        }
      }
    }

    if (selectedIndex === -1) {
      // All workers busy - find least busy overall
      for (let i = 0; i < workers.length; i++) {
        const stats = this.workerStats.get(i)!;
        if (stats.activeTasks < minTasks) {
          minTasks = stats.activeTasks;
          selectedIndex = i;
        }
      }
    }

    if (selectedIndex === -1) {
      selectedIndex = 0; // Fallback to first worker
    }

    return {
      workerIndex: selectedIndex,
      strategy: this.name,
      metadata: {
        reason: availableCount > 0 ? 'least-active-tasks' : 'all-busy-least-tasks',
        alternativeCount: availableCount - 1
      }
    };
  }
}

/**
 * Least-Used Strategy
 *
 * Selects the worker with the fewest total completed tasks.
 * Best for: Long-running pools, historical load balancing
 * Time complexity: O(n) to find minimum
 */
export class LeastUsedStrategy extends WorkerChoiceStrategyBase {
  get name(): WorkerChoiceStrategy {
    return 'least-used';
  }

  choose(
    workers: WorkerHandler[],
    options?: WorkerSelectionOptions
  ): WorkerSelectionResult | null {
    if (workers.length === 0) return null;

    // Handle affinity
    if (options?.affinityWorkerIndex !== undefined) {
      const affinityIndex = options.affinityWorkerIndex;
      if (affinityIndex >= 0 && affinityIndex < workers.length) {
        if (this.isWorkerAvailable(workers[affinityIndex])) {
          return {
            workerIndex: affinityIndex,
            strategy: this.name,
            metadata: { reason: 'affinity', alternativeCount: 0 }
          };
        }
      }
    }

    let minUsed = Infinity;
    let selectedIndex = -1;
    let availableCount = 0;

    for (let i = 0; i < workers.length; i++) {
      this.initializeWorker(i);
      const stats = this.workerStats.get(i)!;

      if (this.isWorkerAvailable(workers[i])) {
        availableCount++;
        if (stats.totalTasksCompleted < minUsed) {
          minUsed = stats.totalTasksCompleted;
          selectedIndex = i;
        }
      }
    }

    if (selectedIndex === -1) {
      // Fallback: find any worker with least usage
      for (let i = 0; i < workers.length; i++) {
        const stats = this.workerStats.get(i)!;
        if (stats.totalTasksCompleted < minUsed) {
          minUsed = stats.totalTasksCompleted;
          selectedIndex = i;
        }
      }
    }

    return {
      workerIndex: selectedIndex === -1 ? 0 : selectedIndex,
      strategy: this.name,
      metadata: {
        reason: 'least-total-tasks',
        alternativeCount: Math.max(0, availableCount - 1)
      }
    };
  }
}

/**
 * Fair-Share Strategy
 *
 * Balances workers by total execution time, ensuring fair CPU distribution.
 * Uses virtual task counting to handle variable task durations.
 * Best for: Mixed workloads (short + long tasks), fair resource sharing
 * Time complexity: O(n) to find minimum virtual time
 */
export class FairShareStrategy extends WorkerChoiceStrategyBase {
  private readonly smoothingFactor = 0.7;

  get name(): WorkerChoiceStrategy {
    return 'fair-share';
  }

  choose(
    workers: WorkerHandler[],
    options?: WorkerSelectionOptions
  ): WorkerSelectionResult | null {
    if (workers.length === 0) return null;

    // Initialize all workers
    for (let i = 0; i < workers.length; i++) {
      this.initializeWorker(i);
    }

    // Handle affinity with load check
    if (options?.affinityWorkerIndex !== undefined) {
      const affinityIndex = options.affinityWorkerIndex;
      if (affinityIndex >= 0 && affinityIndex < workers.length) {
        const stats = this.workerStats.get(affinityIndex)!;
        const avgVirtualCount = this.getAverageVirtualCount();
        // Only use affinity if within 20% of average load
        if (stats.virtualTaskCount <= avgVirtualCount * 1.2 &&
            this.isWorkerAvailable(workers[affinityIndex])) {
          return {
            workerIndex: affinityIndex,
            strategy: this.name,
            metadata: { reason: 'affinity-fair', alternativeCount: 0 }
          };
        }
      }
    }

    // Calculate estimated duration
    const estimatedDuration = options?.estimatedDuration ?? this.getGlobalAverageDuration();

    let minVirtualTime = Infinity;
    let selectedIndex = -1;
    let availableCount = 0;

    for (let i = 0; i < workers.length; i++) {
      const stats = this.workerStats.get(i)!;

      if (this.isWorkerAvailable(workers[i])) {
        availableCount++;
        // Virtual time = past execution + estimated current load
        const virtualTime = stats.totalExecutionTime +
          (stats.activeTasks * (stats.avgTaskDuration || estimatedDuration));

        if (virtualTime < minVirtualTime) {
          minVirtualTime = virtualTime;
          selectedIndex = i;
        }
      }
    }

    if (selectedIndex === -1) {
      // All busy - find fairest
      for (let i = 0; i < workers.length; i++) {
        const stats = this.workerStats.get(i)!;
        const virtualTime = stats.totalExecutionTime +
          (stats.activeTasks * (stats.avgTaskDuration || estimatedDuration));

        if (virtualTime < minVirtualTime) {
          minVirtualTime = virtualTime;
          selectedIndex = i;
        }
      }
    }

    const result = selectedIndex === -1 ? 0 : selectedIndex;

    // Update virtual task count for selected worker
    const stats = this.workerStats.get(result);
    if (stats) {
      stats.virtualTaskCount += 1;
    }

    return {
      workerIndex: result,
      strategy: this.name,
      metadata: {
        reason: 'fair-virtual-time',
        alternativeCount: Math.max(0, availableCount - 1)
      }
    };
  }

  private getAverageVirtualCount(): number {
    let total = 0;
    let count = 0;
    for (const stats of this.workerStats.values()) {
      total += stats.virtualTaskCount;
      count++;
    }
    return count > 0 ? total / count : 0;
  }

  private getGlobalAverageDuration(): number {
    let totalTime = 0;
    let totalTasks = 0;
    for (const stats of this.workerStats.values()) {
      totalTime += stats.totalExecutionTime;
      totalTasks += stats.totalTasksCompleted;
    }
    return totalTasks > 0 ? totalTime / totalTasks : 100; // Default 100ms
  }
}

/**
 * Weighted Round-Robin Strategy
 *
 * Distributes tasks based on worker weights (capabilities).
 * Workers with higher weights receive more tasks proportionally.
 * Best for: Heterogeneous workers with different processing power
 * Time complexity: O(n) per selection
 */
export class WeightedRoundRobinStrategy extends WorkerChoiceStrategyBase {
  private currentWeight = 0;
  private currentIndex = -1;
  private maxWeight = 0;
  private gcdWeight = 0;

  get name(): WorkerChoiceStrategy {
    return 'weighted-round-robin';
  }

  setWeights(weights: number[]): void {
    for (let i = 0; i < weights.length; i++) {
      this.initializeWorker(i, weights[i]);
    }
    this.calculateWeightParams();
  }

  private calculateWeightParams(): void {
    const weights = Array.from(this.workerStats.values()).map(s => s.weight);
    if (weights.length === 0) return;

    this.maxWeight = Math.max(...weights);
    this.gcdWeight = weights.reduce((a, b) => this.gcd(a, b));
  }

  private gcd(a: number, b: number): number {
    while (b > 0) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  }

  choose(
    workers: WorkerHandler[],
    options?: WorkerSelectionOptions
  ): WorkerSelectionResult | null {
    if (workers.length === 0) return null;

    // Initialize workers with default weight
    for (let i = 0; i < workers.length; i++) {
      this.initializeWorker(i);
    }

    if (this.maxWeight === 0) {
      this.calculateWeightParams();
    }

    // Handle affinity
    if (options?.affinityWorkerIndex !== undefined) {
      const affinityIndex = options.affinityWorkerIndex;
      if (affinityIndex >= 0 && affinityIndex < workers.length) {
        if (this.isWorkerAvailable(workers[affinityIndex])) {
          return {
            workerIndex: affinityIndex,
            strategy: this.name,
            metadata: { reason: 'affinity', alternativeCount: 0 }
          };
        }
      }
    }

    const n = workers.length;
    let attempts = 0;
    const maxAttempts = n * Math.ceil(this.maxWeight / Math.max(this.gcdWeight, 1));

    while (attempts < maxAttempts) {
      this.currentIndex = (this.currentIndex + 1) % n;

      if (this.currentIndex === 0) {
        this.currentWeight -= this.gcdWeight || 1;
        if (this.currentWeight <= 0) {
          this.currentWeight = this.maxWeight || 1;
        }
      }

      const stats = this.workerStats.get(this.currentIndex);
      const weight = stats?.weight ?? this.defaultWeight;

      if (weight >= this.currentWeight && this.isWorkerAvailable(workers[this.currentIndex])) {
        return {
          workerIndex: this.currentIndex,
          strategy: this.name,
          metadata: {
            reason: `weight-${weight}`,
            alternativeCount: this.getAvailableWorkers(workers).length - 1
          }
        };
      }

      attempts++;
    }

    // Fallback to any available
    const available = this.getAvailableWorkers(workers);
    if (available.length > 0) {
      return {
        workerIndex: available[0],
        strategy: this.name,
        metadata: { reason: 'fallback', alternativeCount: available.length - 1 }
      };
    }

    return {
      workerIndex: 0,
      strategy: this.name,
      metadata: { reason: 'all-busy', alternativeCount: 0 }
    };
  }
}

/**
 * Interleaved Weighted Round-Robin Strategy
 *
 * Smoother distribution than weighted round-robin by interleaving
 * selections across weight classes.
 * Best for: Smoother load distribution with heterogeneous workers
 * Time complexity: O(n) per selection
 */
export class InterleavedWeightedRoundRobinStrategy extends WorkerChoiceStrategyBase {
  private workerRoundIndex = 0;
  private roundWeight = 0;

  get name(): WorkerChoiceStrategy {
    return 'interleaved-weighted-round-robin';
  }

  setWeights(weights: number[]): void {
    for (let i = 0; i < weights.length; i++) {
      this.initializeWorker(i, weights[i]);
    }
  }

  choose(
    workers: WorkerHandler[],
    options?: WorkerSelectionOptions
  ): WorkerSelectionResult | null {
    if (workers.length === 0) return null;

    // Initialize workers
    for (let i = 0; i < workers.length; i++) {
      this.initializeWorker(i);
    }

    // Handle affinity
    if (options?.affinityWorkerIndex !== undefined) {
      const affinityIndex = options.affinityWorkerIndex;
      if (affinityIndex >= 0 && affinityIndex < workers.length) {
        if (this.isWorkerAvailable(workers[affinityIndex])) {
          return {
            workerIndex: affinityIndex,
            strategy: this.name,
            metadata: { reason: 'affinity', alternativeCount: 0 }
          };
        }
      }
    }

    const n = workers.length;
    const maxWeight = Math.max(
      ...Array.from(this.workerStats.values()).map(s => s.weight),
      1
    );

    let attempts = 0;
    const maxAttempts = n * maxWeight;

    while (attempts < maxAttempts) {
      this.workerRoundIndex = (this.workerRoundIndex + 1) % n;

      if (this.workerRoundIndex === 0) {
        this.roundWeight++;
        if (this.roundWeight > maxWeight) {
          this.roundWeight = 1;
        }
      }

      const stats = this.workerStats.get(this.workerRoundIndex);
      const weight = stats?.weight ?? this.defaultWeight;

      // Select if current round weight is within worker's weight
      if (this.roundWeight <= weight && this.isWorkerAvailable(workers[this.workerRoundIndex])) {
        return {
          workerIndex: this.workerRoundIndex,
          strategy: this.name,
          metadata: {
            reason: `interleaved-weight-${weight}-round-${this.roundWeight}`,
            alternativeCount: this.getAvailableWorkers(workers).length - 1
          }
        };
      }

      attempts++;
    }

    // Fallback
    const available = this.getAvailableWorkers(workers);
    return {
      workerIndex: available.length > 0 ? available[0] : 0,
      strategy: this.name,
      metadata: {
        reason: available.length > 0 ? 'fallback' : 'all-busy',
        alternativeCount: Math.max(0, available.length - 1)
      }
    };
  }
}

/**
 * Strategy factory
 */
export function createStrategy(type: WorkerChoiceStrategy): WorkerChoiceStrategyBase {
  switch (type) {
    case 'round-robin':
      return new RoundRobinStrategy();
    case 'least-busy':
      return new LeastBusyStrategy();
    case 'least-used':
      return new LeastUsedStrategy();
    case 'fair-share':
      return new FairShareStrategy();
    case 'weighted-round-robin':
      return new WeightedRoundRobinStrategy();
    case 'interleaved-weighted-round-robin':
      return new InterleavedWeightedRoundRobinStrategy();
    default:
      throw new Error(`Unknown worker choice strategy: ${type}`);
  }
}

/**
 * Strategy manager for dynamic strategy switching
 */
export class WorkerChoiceStrategyManager {
  private strategies: Map<WorkerChoiceStrategy, WorkerChoiceStrategyBase> = new Map();
  private currentStrategy: WorkerChoiceStrategyBase;
  private readonly defaultStrategy: WorkerChoiceStrategy = 'least-busy';

  constructor(initialStrategy: WorkerChoiceStrategy = 'least-busy') {
    this.currentStrategy = this.getOrCreateStrategy(initialStrategy);
  }

  private getOrCreateStrategy(type: WorkerChoiceStrategy): WorkerChoiceStrategyBase {
    if (!this.strategies.has(type)) {
      this.strategies.set(type, createStrategy(type));
    }
    return this.strategies.get(type)!;
  }

  /**
   * Set the active strategy
   */
  setStrategy(type: WorkerChoiceStrategy): void {
    this.currentStrategy = this.getOrCreateStrategy(type);
  }

  /**
   * Get current strategy name
   */
  getStrategyName(): WorkerChoiceStrategy {
    return this.currentStrategy.name;
  }

  /**
   * Choose a worker using current strategy
   */
  choose(
    workers: WorkerHandler[],
    options?: WorkerSelectionOptions
  ): WorkerSelectionResult | null {
    return this.currentStrategy.choose(workers, options);
  }

  /**
   * Update statistics for a worker
   */
  updateStats(workerIndex: number, executionTime: number, success: boolean): void {
    // Update across all strategies for consistency
    for (const strategy of this.strategies.values()) {
      strategy.updateStats(workerIndex, executionTime, success);
    }
  }

  /**
   * Initialize a worker across all strategies
   */
  initializeWorker(workerIndex: number, weight = 1): void {
    for (const strategy of this.strategies.values()) {
      strategy.initializeWorker(workerIndex, weight);
    }
  }

  /**
   * Mark task start
   */
  incrementActiveTasks(workerIndex: number): void {
    for (const strategy of this.strategies.values()) {
      strategy.incrementActiveTasks(workerIndex);
    }
  }

  /**
   * Mark task end
   */
  decrementActiveTasks(workerIndex: number): void {
    for (const strategy of this.strategies.values()) {
      strategy.decrementActiveTasks(workerIndex);
    }
  }

  /**
   * Set weights for weighted strategies
   */
  setWeights(weights: number[]): void {
    const wrr = this.strategies.get('weighted-round-robin');
    if (wrr instanceof WeightedRoundRobinStrategy) {
      wrr.setWeights(weights);
    }

    const iwrr = this.strategies.get('interleaved-weighted-round-robin');
    if (iwrr instanceof InterleavedWeightedRoundRobinStrategy) {
      iwrr.setWeights(weights);
    }
  }

  /**
   * Reset all strategies
   */
  reset(): void {
    for (const strategy of this.strategies.values()) {
      strategy.reset();
    }
  }

  /**
   * Get statistics from current strategy
   */
  getStats(): Map<number, WorkerStats> {
    return this.currentStrategy.getStats();
  }
}
