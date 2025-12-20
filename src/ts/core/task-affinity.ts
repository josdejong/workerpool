/**
 * Task Affinity and Intelligent Routing
 *
 * Provides smart task routing based on:
 * - Cache locality (route related tasks to same worker)
 * - Worker performance history
 * - Task type specialization
 * - Load balancing constraints
 *
 * Benefits:
 * - Better CPU cache utilization
 * - Reduced memory pressure
 * - Optimized for specific task patterns
 * - Adaptive to worker capabilities
 */

/**
 * Task affinity key - used to group related tasks
 */
export type AffinityKey = string | number | symbol;

/**
 * Task routing decision
 */
export interface RoutingDecision {
  /** Selected worker index */
  workerIndex: number;
  /** Confidence score (0-1) */
  confidence: number;
  /** Reason for selection */
  reason: RoutingReason;
  /** Alternative workers if primary fails */
  alternatives: number[];
}

/**
 * Reason for routing decision
 */
export type RoutingReason =
  | 'affinity'           // Matched affinity key
  | 'task-type'          // Matched task type specialization
  | 'performance'        // Best performing worker for task type
  | 'load-balance'       // Load balancing decision
  | 'random'             // Random selection (no better option)
  | 'fallback';          // Fallback when preferred unavailable

/**
 * Worker performance profile for a specific task type
 */
export interface TaskTypeProfile {
  taskType: string;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successRate: number;
  sampleCount: number;
  lastUpdated: number;
}

/**
 * Complete worker profile
 */
export interface WorkerProfile {
  workerId: number;
  /** Performance by task type */
  taskTypeProfiles: Map<string, TaskTypeProfile>;
  /** Overall performance score (0-1) */
  overallScore: number;
  /** CPU affinity (for NUMA awareness) */
  cpuAffinity?: number[];
  /** Last activity timestamp */
  lastActiveTime: number;
  /** Current load estimate */
  currentLoad: number;
}

/**
 * Affinity entry in the routing table
 */
interface AffinityEntry {
  key: AffinityKey;
  workerIndex: number;
  hitCount: number;
  lastAccess: number;
  /** Time-to-live in ms (for cache expiry) */
  ttl: number;
}

/**
 * Task Affinity Router
 *
 * Routes tasks to workers based on affinity keys, task types,
 * and worker performance profiles.
 */
export class TaskAffinityRouter {
  private readonly affinityTable: Map<AffinityKey, AffinityEntry> = new Map();
  private readonly workerProfiles: Map<number, WorkerProfile> = new Map();
  private readonly taskTypeWorkers: Map<string, Set<number>> = new Map();

  private readonly defaultTTL: number;
  private readonly maxAffinityEntries: number;
  private readonly performanceWeight: number;
  private readonly affinityWeight: number;

  constructor(options: AffinityRouterOptions = {}) {
    this.defaultTTL = options.affinityTTL ?? 60000; // 1 minute
    this.maxAffinityEntries = options.maxAffinityEntries ?? 10000;
    this.performanceWeight = options.performanceWeight ?? 0.3;
    this.affinityWeight = options.affinityWeight ?? 0.7;
  }

  /**
   * Register a worker with the router
   */
  registerWorker(workerId: number, cpuAffinity?: number[]): void {
    if (!this.workerProfiles.has(workerId)) {
      this.workerProfiles.set(workerId, {
        workerId,
        taskTypeProfiles: new Map(),
        overallScore: 1.0,
        cpuAffinity,
        lastActiveTime: Date.now(),
        currentLoad: 0,
      });
    }
  }

  /**
   * Unregister a worker
   */
  unregisterWorker(workerId: number): void {
    this.workerProfiles.delete(workerId);

    // Remove from task type associations
    for (const workers of this.taskTypeWorkers.values()) {
      workers.delete(workerId);
    }

    // Remove affinity entries pointing to this worker
    for (const [key, entry] of this.affinityTable) {
      if (entry.workerIndex === workerId) {
        this.affinityTable.delete(key);
      }
    }
  }

  /**
   * Route a task to the best worker
   */
  route(options: RoutingOptions): RoutingDecision {
    const { affinityKey, taskType, availableWorkers } = options;

    // Check affinity first
    if (affinityKey !== undefined) {
      const affinityResult = this.checkAffinity(affinityKey, availableWorkers);
      if (affinityResult) {
        return affinityResult;
      }
    }

    // Check task type specialization
    if (taskType) {
      const typeResult = this.checkTaskTypeSpecialization(taskType, availableWorkers);
      if (typeResult) {
        return typeResult;
      }
    }

    // Fall back to performance-based selection
    return this.selectByPerformance(availableWorkers, taskType);
  }

  /**
   * Check affinity table for matching key
   */
  private checkAffinity(
    key: AffinityKey,
    availableWorkers: number[]
  ): RoutingDecision | null {
    const entry = this.affinityTable.get(key);

    if (!entry) {
      return null;
    }

    // Check if entry is expired
    if (Date.now() - entry.lastAccess > entry.ttl) {
      this.affinityTable.delete(key);
      return null;
    }

    // Check if worker is available
    if (!availableWorkers.includes(entry.workerIndex)) {
      return null;
    }

    // Update entry
    entry.hitCount++;
    entry.lastAccess = Date.now();

    return {
      workerIndex: entry.workerIndex,
      confidence: Math.min(0.9, 0.5 + (entry.hitCount / 100)),
      reason: 'affinity',
      alternatives: availableWorkers.filter(w => w !== entry.workerIndex),
    };
  }

  /**
   * Check task type specialization
   */
  private checkTaskTypeSpecialization(
    taskType: string,
    availableWorkers: number[]
  ): RoutingDecision | null {
    const specializedWorkers = this.taskTypeWorkers.get(taskType);

    if (!specializedWorkers || specializedWorkers.size === 0) {
      return null;
    }

    // Find best specialized worker that's available
    let bestWorker: number | undefined;
    let bestScore = -1;

    for (const workerId of specializedWorkers) {
      if (!availableWorkers.includes(workerId)) {
        continue;
      }

      const profile = this.workerProfiles.get(workerId);
      if (!profile) continue;

      const typeProfile = profile.taskTypeProfiles.get(taskType);
      if (!typeProfile) continue;

      // Score based on success rate and inverse of average duration
      const score = typeProfile.successRate *
        (1000 / (typeProfile.avgDuration + 1)) *
        typeProfile.sampleCount;

      if (score > bestScore) {
        bestScore = score;
        bestWorker = workerId;
      }
    }

    if (bestWorker === undefined) {
      return null;
    }

    return {
      workerIndex: bestWorker,
      confidence: Math.min(0.85, 0.4 + (bestScore / 1000)),
      reason: 'task-type',
      alternatives: availableWorkers.filter(w => w !== bestWorker),
    };
  }

  /**
   * Select worker based on overall performance
   */
  private selectByPerformance(
    availableWorkers: number[],
    taskType?: string
  ): RoutingDecision {
    if (availableWorkers.length === 0) {
      throw new Error('No available workers for routing');
    }

    if (availableWorkers.length === 1) {
      return {
        workerIndex: availableWorkers[0],
        confidence: 0.5,
        reason: 'fallback',
        alternatives: [],
      };
    }

    // Score each worker
    const scores: Array<{ workerId: number; score: number }> = [];

    for (const workerId of availableWorkers) {
      const profile = this.workerProfiles.get(workerId);
      let score = 1.0; // Default score

      if (profile) {
        // Base score from overall performance
        score = profile.overallScore;

        // Adjust for task type if known
        if (taskType) {
          const typeProfile = profile.taskTypeProfiles.get(taskType);
          if (typeProfile) {
            score = score * (1 - this.performanceWeight) +
              typeProfile.successRate * this.performanceWeight;
          }
        }

        // Penalize for high current load
        score *= Math.max(0.1, 1 - (profile.currentLoad * 0.1));
      }

      scores.push({ workerId, score });
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    const best = scores[0];
    const alternatives = scores.slice(1).map(s => s.workerId);

    return {
      workerIndex: best.workerId,
      confidence: Math.min(0.8, best.score),
      reason: scores.length > 1 && best.score > 0.5 ? 'performance' : 'load-balance',
      alternatives,
    };
  }

  /**
   * Set affinity for a key to a specific worker
   */
  setAffinity(key: AffinityKey, workerIndex: number, ttl?: number): void {
    // Evict old entries if at capacity
    if (this.affinityTable.size >= this.maxAffinityEntries) {
      // Evict at least 1 entry, or 10% of capacity
      this.evictOldestEntries(Math.max(1, Math.floor(this.maxAffinityEntries * 0.1)));
    }

    this.affinityTable.set(key, {
      key,
      workerIndex,
      hitCount: 1,
      lastAccess: Date.now(),
      ttl: ttl ?? this.defaultTTL,
    });
  }

  /**
   * Clear affinity for a key
   */
  clearAffinity(key: AffinityKey): void {
    this.affinityTable.delete(key);
  }

  /**
   * Record task completion for performance tracking
   */
  recordTaskCompletion(
    workerId: number,
    taskType: string,
    duration: number,
    success: boolean
  ): void {
    const profile = this.workerProfiles.get(workerId);
    if (!profile) return;

    profile.lastActiveTime = Date.now();

    // Update task type profile
    let typeProfile = profile.taskTypeProfiles.get(taskType);
    if (!typeProfile) {
      typeProfile = {
        taskType,
        avgDuration: duration,
        minDuration: duration,
        maxDuration: duration,
        successRate: success ? 1 : 0,
        sampleCount: 0,
        lastUpdated: Date.now(),
      };
      profile.taskTypeProfiles.set(taskType, typeProfile);

      // Register worker for this task type
      if (!this.taskTypeWorkers.has(taskType)) {
        this.taskTypeWorkers.set(taskType, new Set());
      }
      this.taskTypeWorkers.get(taskType)!.add(workerId);
    }

    // Update with exponential moving average
    const alpha = 0.2; // Smoothing factor
    typeProfile.avgDuration = typeProfile.avgDuration * (1 - alpha) + duration * alpha;
    typeProfile.minDuration = Math.min(typeProfile.minDuration, duration);
    typeProfile.maxDuration = Math.max(typeProfile.maxDuration, duration);
    typeProfile.successRate = typeProfile.successRate * (1 - alpha) + (success ? alpha : 0);
    typeProfile.sampleCount++;
    typeProfile.lastUpdated = Date.now();

    // Update overall score
    this.updateOverallScore(profile);
  }

  /**
   * Update worker's current load
   */
  updateWorkerLoad(workerId: number, load: number): void {
    const profile = this.workerProfiles.get(workerId);
    if (profile) {
      profile.currentLoad = load;
    }
  }

  /**
   * Update overall performance score for a worker
   */
  private updateOverallScore(profile: WorkerProfile): void {
    if (profile.taskTypeProfiles.size === 0) {
      profile.overallScore = 1.0;
      return;
    }

    let totalScore = 0;
    let totalWeight = 0;

    for (const typeProfile of profile.taskTypeProfiles.values()) {
      // Weight by sample count (more samples = more reliable)
      const weight = Math.min(100, typeProfile.sampleCount);
      totalScore += typeProfile.successRate * weight;
      totalWeight += weight;
    }

    profile.overallScore = totalWeight > 0 ? totalScore / totalWeight : 1.0;
  }

  /**
   * Evict oldest affinity entries
   */
  private evictOldestEntries(count: number): void {
    const entries = Array.from(this.affinityTable.entries())
      .sort((a, b) => a[1].lastAccess - b[1].lastAccess);

    for (let i = 0; i < Math.min(count, entries.length); i++) {
      this.affinityTable.delete(entries[i][0]);
    }
  }

  /**
   * Get routing statistics
   */
  getStats(): AffinityRouterStats {
    const workerStats: WorkerProfile[] = Array.from(this.workerProfiles.values());

    return {
      affinityEntryCount: this.affinityTable.size,
      workerCount: this.workerProfiles.size,
      taskTypeCount: this.taskTypeWorkers.size,
      workerProfiles: workerStats,
      affinityHitRate: this.calculateAffinityHitRate(),
    };
  }

  /**
   * Calculate affinity hit rate
   */
  private calculateAffinityHitRate(): number {
    if (this.affinityTable.size === 0) return 0;

    let totalHits = 0;
    for (const entry of this.affinityTable.values()) {
      totalHits += entry.hitCount;
    }

    return totalHits / this.affinityTable.size;
  }

  /**
   * Clear all affinity data
   */
  clear(): void {
    this.affinityTable.clear();
    this.workerProfiles.clear();
    this.taskTypeWorkers.clear();
  }

  /**
   * Clear performance history but keep affinity
   */
  resetPerformance(): void {
    for (const profile of this.workerProfiles.values()) {
      profile.taskTypeProfiles.clear();
      profile.overallScore = 1.0;
      profile.currentLoad = 0;
    }
    this.taskTypeWorkers.clear();
  }
}

/**
 * Options for affinity router
 */
export interface AffinityRouterOptions {
  /** Time-to-live for affinity entries in ms */
  affinityTTL?: number;
  /** Maximum number of affinity entries */
  maxAffinityEntries?: number;
  /** Weight for performance-based routing (0-1) */
  performanceWeight?: number;
  /** Weight for affinity-based routing (0-1) */
  affinityWeight?: number;
}

/**
 * Options for routing a task
 */
export interface RoutingOptions {
  /** Affinity key for the task */
  affinityKey?: AffinityKey;
  /** Task type for specialization */
  taskType?: string;
  /** List of available worker indices */
  availableWorkers: number[];
  /** Estimated task duration */
  estimatedDuration?: number;
}

/**
 * Statistics for affinity router
 */
export interface AffinityRouterStats {
  affinityEntryCount: number;
  workerCount: number;
  taskTypeCount: number;
  workerProfiles: WorkerProfile[];
  affinityHitRate: number;
}

/**
 * Create a consistent hash for affinity key generation
 * Useful for request-based affinity (e.g., user ID -> worker)
 */
export function createAffinityKey(
  ...parts: Array<string | number | undefined>
): AffinityKey {
  return parts.filter(p => p !== undefined).join(':');
}

/**
 * Generate affinity key from object properties
 */
export function objectAffinityKey(
  obj: Record<string, unknown>,
  properties: string[]
): AffinityKey {
  return properties
    .map(p => String(obj[p] ?? ''))
    .join(':');
}
