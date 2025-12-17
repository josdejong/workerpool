/**
 * WorkerAffinity - Task-to-worker affinity for cache locality
 *
 * Implements task-to-worker affinity hints for improved cache locality,
 * tracks affinity mappings, and provides affinity-aware task dispatch.
 */

/**
 * Affinity strategy for task assignment
 */
export enum AffinityStrategy {
  /** No affinity - use default worker selection */
  NONE = 'none',
  /** Prefer same worker based on affinity key */
  PREFERRED = 'preferred',
  /** Strictly require same worker (queue if not available) */
  STRICT = 'strict',
  /** Spread tasks with same key across workers */
  SPREAD = 'spread',
}

/**
 * Affinity hint for task execution
 */
export interface AffinityHint {
  /** Affinity key (e.g., 'user:123', 'file:/path/to/file') */
  key: string;
  /** Affinity strategy */
  strategy?: AffinityStrategy;
  /** Maximum wait time for preferred/strict affinity (ms) */
  maxWaitTime?: number;
}

/**
 * Worker affinity mapping
 */
export interface AffinityMapping {
  /** Affinity key */
  key: string;
  /** Preferred worker ID */
  workerId: number;
  /** Number of tasks executed with this affinity */
  taskCount: number;
  /** Last used timestamp */
  lastUsed: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
}

/**
 * Affinity manager options
 */
export interface WorkerAffinityOptions {
  /** Maximum affinity mappings to track */
  maxMappings?: number;
  /** TTL for affinity mappings (ms) */
  mappingTTL?: number;
  /** Default affinity strategy */
  defaultStrategy?: AffinityStrategy;
  /** Cleanup interval (ms) */
  cleanupInterval?: number;
  /** Weight for cache hit consideration (0-1) */
  cacheHitWeight?: number;
}

/**
 * Affinity statistics
 */
export interface AffinityStats {
  /** Total affinity lookups */
  totalLookups: number;
  /** Cache hits (found existing mapping) */
  cacheHits: number;
  /** Cache misses (no existing mapping) */
  cacheMisses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Number of active mappings */
  activeMappings: number;
  /** Mappings by worker */
  mappingsPerWorker: Map<number, number>;
}

/**
 * Worker affinity entry
 */
interface AffinityEntry {
  key: string;
  workerId: number;
  taskCount: number;
  hits: number;
  misses: number;
  createdAt: number;
  lastUsed: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<WorkerAffinityOptions> = {
  maxMappings: 10000,
  mappingTTL: 300000,  // 5 minutes
  defaultStrategy: AffinityStrategy.PREFERRED,
  cleanupInterval: 60000,  // 1 minute
  cacheHitWeight: 0.7,
};

/**
 * WorkerAffinity - Task-to-worker affinity management
 *
 * @example
 * ```typescript
 * const affinity = new WorkerAffinity({
 *   maxMappings: 5000,
 *   mappingTTL: 300000
 * });
 *
 * // Get worker for task with affinity hint
 * const hint: AffinityHint = {
 *   key: 'user:12345',
 *   strategy: AffinityStrategy.PREFERRED
 * };
 *
 * const workerId = affinity.getWorker(hint, availableWorkers);
 * if (workerId !== null) {
 *   // Execute task on preferred worker
 * }
 *
 * // Record task execution
 * affinity.recordExecution('user:12345', selectedWorkerId, wasHit);
 *
 * // Get affinity statistics
 * const stats = affinity.getStats();
 * ```
 */
export class WorkerAffinity {
  private readonly options: Required<WorkerAffinityOptions>;
  private mappings: Map<string, AffinityEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Statistics
  private totalLookups = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(options: WorkerAffinityOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Start periodic cleanup
   */
  start(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  /**
   * Stop periodic cleanup
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Get preferred worker for an affinity hint
   *
   * @param hint - Affinity hint
   * @param availableWorkers - Set of available worker IDs
   * @returns Preferred worker ID or null if no preference
   */
  getWorker(hint: AffinityHint, availableWorkers: Set<number> | number[]): number | null {
    if (!hint.key) return null;

    this.totalLookups++;
    const strategy = hint.strategy || this.options.defaultStrategy;

    if (strategy === AffinityStrategy.NONE) {
      return null;
    }

    const available = availableWorkers instanceof Set
      ? availableWorkers
      : new Set(availableWorkers);

    const entry = this.mappings.get(hint.key);

    if (entry) {
      // Check if preferred worker is available
      if (available.has(entry.workerId)) {
        this.cacheHits++;
        entry.hits++;
        entry.lastUsed = Date.now();
        return entry.workerId;
      }

      this.cacheMisses++;
      entry.misses++;

      // Handle based on strategy
      if (strategy === AffinityStrategy.STRICT) {
        // Return null to indicate task should wait
        return null;
      }

      // PREFERRED or SPREAD - pick best available
      return this.selectBestWorker(hint.key, available);
    }

    this.cacheMisses++;

    // No existing mapping - create one with best available worker
    return this.selectBestWorker(hint.key, available);
  }

  /**
   * Record task execution for affinity tracking
   */
  recordExecution(key: string, workerId: number, wasHit: boolean): void {
    if (!key) return;

    const now = Date.now();
    let entry = this.mappings.get(key);

    if (entry) {
      entry.workerId = workerId;
      entry.taskCount++;
      entry.lastUsed = now;
      if (wasHit) {
        entry.hits++;
      } else {
        entry.misses++;
      }
    } else {
      // Create new mapping
      entry = {
        key,
        workerId,
        taskCount: 1,
        hits: wasHit ? 1 : 0,
        misses: wasHit ? 0 : 1,
        createdAt: now,
        lastUsed: now,
      };
      this.mappings.set(key, entry);

      // Enforce max mappings
      this.enforceLimits();
    }
  }

  /**
   * Get current affinity mapping for a key
   */
  getMapping(key: string): AffinityMapping | null {
    const entry = this.mappings.get(key);
    if (!entry) return null;

    const total = entry.hits + entry.misses;
    return {
      key: entry.key,
      workerId: entry.workerId,
      taskCount: entry.taskCount,
      lastUsed: entry.lastUsed,
      hitRate: total > 0 ? entry.hits / total : 0,
    };
  }

  /**
   * Get all mappings for a worker
   */
  getMappingsForWorker(workerId: number): AffinityMapping[] {
    const mappings: AffinityMapping[] = [];

    for (const entry of this.mappings.values()) {
      if (entry.workerId === workerId) {
        const total = entry.hits + entry.misses;
        mappings.push({
          key: entry.key,
          workerId: entry.workerId,
          taskCount: entry.taskCount,
          lastUsed: entry.lastUsed,
          hitRate: total > 0 ? entry.hits / total : 0,
        });
      }
    }

    return mappings;
  }

  /**
   * Remove all mappings for a worker (call when worker is terminated)
   */
  removeWorkerMappings(workerId: number): number {
    let removed = 0;
    for (const [key, entry] of this.mappings) {
      if (entry.workerId === workerId) {
        this.mappings.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Clear a specific mapping
   */
  clearMapping(key: string): boolean {
    return this.mappings.delete(key);
  }

  /**
   * Clear all mappings
   */
  clearAll(): void {
    this.mappings.clear();
    this.totalLookups = 0;
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Get affinity statistics
   */
  getStats(): AffinityStats {
    const mappingsPerWorker = new Map<number, number>();

    for (const entry of this.mappings.values()) {
      const count = mappingsPerWorker.get(entry.workerId) || 0;
      mappingsPerWorker.set(entry.workerId, count + 1);
    }

    return {
      totalLookups: this.totalLookups,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      hitRate: this.totalLookups > 0 ? this.cacheHits / this.totalLookups : 0,
      activeMappings: this.mappings.size,
      mappingsPerWorker,
    };
  }

  /**
   * Select best worker from available workers
   */
  private selectBestWorker(key: string, available: Set<number>): number | null {
    if (available.size === 0) return null;

    // Count existing mappings per worker
    const workerLoads = new Map<number, number>();
    for (const workerId of available) {
      workerLoads.set(workerId, 0);
    }

    for (const entry of this.mappings.values()) {
      if (available.has(entry.workerId)) {
        const current = workerLoads.get(entry.workerId) || 0;
        workerLoads.set(entry.workerId, current + 1);
      }
    }

    // Find worker with least affinity load
    let bestWorker: number | null = null;
    let minLoad = Infinity;

    for (const [workerId, load] of workerLoads) {
      if (load < minLoad) {
        minLoad = load;
        bestWorker = workerId;
      }
    }

    return bestWorker;
  }

  /**
   * Enforce mapping limits
   */
  private enforceLimits(): void {
    if (this.mappings.size <= this.options.maxMappings) return;

    // Remove oldest entries until under limit
    const entries = Array.from(this.mappings.entries())
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    const toRemove = this.mappings.size - this.options.maxMappings;
    for (let i = 0; i < toRemove; i++) {
      this.mappings.delete(entries[i][0]);
    }
  }

  /**
   * Cleanup expired mappings
   */
  private cleanup(): void {
    const now = Date.now();
    const expiry = now - this.options.mappingTTL;

    for (const [key, entry] of this.mappings) {
      if (entry.lastUsed < expiry) {
        this.mappings.delete(key);
      }
    }
  }
}

export default WorkerAffinity;
