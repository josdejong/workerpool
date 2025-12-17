/**
 * MetricsCollector - Comprehensive metrics collection for workerpool
 *
 * Tracks task latency histograms, worker utilization, queue depths,
 * error rates, and provides metrics export via callback.
 */

import type { WorkerInfo, WorkerState } from '../types/internal';

/**
 * Histogram bucket for latency distribution
 */
export interface HistogramBucket {
  /** Upper bound of bucket in milliseconds */
  le: number;
  /** Count of values in this bucket */
  count: number;
}

/**
 * Latency histogram with percentile calculations
 */
export interface LatencyHistogram {
  /** Total count of recorded values */
  count: number;
  /** Sum of all values in milliseconds */
  sum: number;
  /** Minimum value seen */
  min: number;
  /** Maximum value seen */
  max: number;
  /** Histogram buckets */
  buckets: HistogramBucket[];
}

/**
 * Worker utilization metrics
 */
export interface WorkerUtilization {
  /** Worker ID */
  workerId: number;
  /** Current state */
  state: WorkerState;
  /** Total tasks completed */
  tasksCompleted: number;
  /** Total tasks failed */
  tasksFailed: number;
  /** Utilization percentage (0-100) */
  utilization: number;
  /** Average task duration in ms */
  avgTaskDuration: number;
  /** Current idle time in ms (0 if busy) */
  idleTime: number;
}

/**
 * Queue metrics
 */
export interface QueueMetrics {
  /** Current queue depth */
  depth: number;
  /** Peak queue depth seen */
  peakDepth: number;
  /** Total tasks enqueued */
  totalEnqueued: number;
  /** Total tasks dequeued */
  totalDequeued: number;
  /** Average wait time in queue (ms) */
  avgWaitTime: number;
}

/**
 * Error metrics
 */
export interface ErrorMetrics {
  /** Total error count */
  total: number;
  /** Errors by type */
  byType: Map<string, number>;
  /** Recent errors (last N) */
  recent: Array<{ timestamp: number; type: string; message: string }>;
}

/**
 * Complete pool metrics snapshot
 */
export interface PoolMetrics {
  /** Timestamp of metrics collection */
  timestamp: number;
  /** Task latency histogram */
  taskLatency: LatencyHistogram;
  /** Worker utilization */
  workers: WorkerUtilization[];
  /** Queue metrics */
  queue: QueueMetrics;
  /** Error metrics */
  errors: ErrorMetrics;
  /** Summary statistics */
  summary: {
    totalWorkers: number;
    busyWorkers: number;
    idleWorkers: number;
    tasksPerSecond: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
  };
}

/**
 * Metrics collector options
 */
export interface MetricsCollectorOptions {
  /** Histogram bucket boundaries in milliseconds */
  buckets?: number[];
  /** Maximum recent errors to keep */
  maxRecentErrors?: number;
  /** Window size for rate calculations (ms) */
  rateWindow?: number;
  /** Callback for metrics export */
  onExport?: (metrics: PoolMetrics) => void;
  /** Export interval in milliseconds (0 to disable) */
  exportInterval?: number;
}

/**
 * Default histogram bucket boundaries (in milliseconds)
 */
const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Rolling window data point
 */
interface DataPoint {
  timestamp: number;
  value: number;
}

/**
 * MetricsCollector - Comprehensive metrics collection
 *
 * @example
 * ```typescript
 * const metrics = new MetricsCollector({
 *   exportInterval: 5000,
 *   onExport: (m) => console.log('Metrics:', m.summary)
 * });
 *
 * // Record task completion
 * metrics.recordTaskComplete(workerId, durationMs);
 *
 * // Get current metrics
 * const snapshot = metrics.getMetrics();
 * console.log(`p95 latency: ${snapshot.summary.p95Latency}ms`);
 *
 * // Cleanup
 * metrics.stop();
 * ```
 */
export class MetricsCollector {
  private readonly buckets: number[];
  private readonly maxRecentErrors: number;
  private readonly rateWindow: number;
  private readonly onExport?: (metrics: PoolMetrics) => void;
  private exportTimer: ReturnType<typeof setInterval> | null = null;

  // Latency tracking
  private latencyBuckets: number[];
  private latencyCount = 0;
  private latencySum = 0;
  private latencyMin = Infinity;
  private latencyMax = 0;
  private latencyValues: DataPoint[] = [];  // For percentile calculations

  // Queue tracking
  private queueDepth = 0;
  private peakQueueDepth = 0;
  private totalEnqueued = 0;
  private totalDequeued = 0;
  private queueWaitTimes: DataPoint[] = [];

  // Error tracking
  private totalErrors = 0;
  private errorsByType: Map<string, number> = new Map();
  private recentErrors: Array<{ timestamp: number; type: string; message: string }> = [];

  // Worker tracking
  private workerMetrics: Map<number, {
    tasksCompleted: number;
    tasksFailed: number;
    totalBusyTime: number;
    lastBusyStart?: number;
    taskDurations: number[];
  }> = new Map();

  // Rate calculation
  private taskCompletions: DataPoint[] = [];
  private startTime: number;

  constructor(options: MetricsCollectorOptions = {}) {
    this.buckets = options.buckets || DEFAULT_BUCKETS;
    this.maxRecentErrors = options.maxRecentErrors || 100;
    this.rateWindow = options.rateWindow || 60000;  // 1 minute
    this.onExport = options.onExport;
    this.startTime = Date.now();

    // Initialize bucket counts
    this.latencyBuckets = new Array(this.buckets.length + 1).fill(0);

    // Start export timer if configured
    if (options.exportInterval && options.exportInterval > 0 && this.onExport) {
      this.exportTimer = setInterval(() => {
        this.onExport?.(this.getMetrics());
      }, options.exportInterval);
    }
  }

  /**
   * Record a completed task
   */
  recordTaskComplete(workerId: number, durationMs: number): void {
    const now = Date.now();

    // Update latency histogram
    this.latencyCount++;
    this.latencySum += durationMs;
    this.latencyMin = Math.min(this.latencyMin, durationMs);
    this.latencyMax = Math.max(this.latencyMax, durationMs);

    // Update bucket counts
    for (let i = 0; i < this.buckets.length; i++) {
      if (durationMs <= this.buckets[i]) {
        this.latencyBuckets[i]++;
        break;
      }
      if (i === this.buckets.length - 1) {
        this.latencyBuckets[i + 1]++;  // +Inf bucket
      }
    }

    // Store for percentile calculation (keep last N values)
    this.latencyValues.push({ timestamp: now, value: durationMs });
    this.pruneDataPoints(this.latencyValues);

    // Update task completions for rate calculation
    this.taskCompletions.push({ timestamp: now, value: 1 });
    this.pruneDataPoints(this.taskCompletions);

    // Update worker metrics
    this.updateWorkerTaskComplete(workerId, durationMs);
  }

  /**
   * Record a failed task
   */
  recordTaskFailed(workerId: number, error: Error, durationMs?: number): void {
    const now = Date.now();
    const errorType = error.name || 'Error';

    // Update error counts
    this.totalErrors++;
    this.errorsByType.set(errorType, (this.errorsByType.get(errorType) || 0) + 1);

    // Add to recent errors
    this.recentErrors.push({
      timestamp: now,
      type: errorType,
      message: error.message,
    });
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }

    // Update worker metrics
    const workerMetric = this.getOrCreateWorkerMetric(workerId);
    workerMetric.tasksFailed++;

    if (durationMs !== undefined) {
      this.recordTaskComplete(workerId, durationMs);
    }
  }

  /**
   * Record task enqueued
   */
  recordTaskEnqueued(): void {
    this.totalEnqueued++;
    this.queueDepth++;
    this.peakQueueDepth = Math.max(this.peakQueueDepth, this.queueDepth);
  }

  /**
   * Record task dequeued (started processing)
   */
  recordTaskDequeued(waitTimeMs: number): void {
    this.totalDequeued++;
    this.queueDepth = Math.max(0, this.queueDepth - 1);

    this.queueWaitTimes.push({ timestamp: Date.now(), value: waitTimeMs });
    this.pruneDataPoints(this.queueWaitTimes);
  }

  /**
   * Record worker becoming busy
   */
  recordWorkerBusy(workerId: number): void {
    const metric = this.getOrCreateWorkerMetric(workerId);
    metric.lastBusyStart = Date.now();
  }

  /**
   * Record worker becoming idle
   */
  recordWorkerIdle(workerId: number): void {
    const metric = this.getOrCreateWorkerMetric(workerId);
    if (metric.lastBusyStart) {
      metric.totalBusyTime += Date.now() - metric.lastBusyStart;
      metric.lastBusyStart = undefined;
    }
  }

  /**
   * Register a worker for tracking
   */
  registerWorker(workerId: number): void {
    this.getOrCreateWorkerMetric(workerId);
  }

  /**
   * Unregister a worker
   */
  unregisterWorker(workerId: number): void {
    this.workerMetrics.delete(workerId);
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): PoolMetrics {
    const now = Date.now();
    const workers = this.getWorkerUtilizations(now);

    // Calculate summary statistics
    const avgLatency = this.latencyCount > 0 ? this.latencySum / this.latencyCount : 0;
    const sortedLatencies = this.latencyValues
      .map(p => p.value)
      .sort((a, b) => a - b);

    const p50 = this.percentile(sortedLatencies, 50);
    const p95 = this.percentile(sortedLatencies, 95);
    const p99 = this.percentile(sortedLatencies, 99);

    // Calculate task rate
    const recentCompletions = this.taskCompletions.filter(
      p => now - p.timestamp < this.rateWindow
    ).length;
    const tasksPerSecond = (recentCompletions / this.rateWindow) * 1000;

    // Calculate error rate
    const totalTasks = this.latencyCount + this.totalErrors;
    const errorRate = totalTasks > 0 ? this.totalErrors / totalTasks : 0;

    // Queue metrics
    const avgWaitTime = this.queueWaitTimes.length > 0
      ? this.queueWaitTimes.reduce((sum, p) => sum + p.value, 0) / this.queueWaitTimes.length
      : 0;

    return {
      timestamp: now,
      taskLatency: {
        count: this.latencyCount,
        sum: this.latencySum,
        min: this.latencyMin === Infinity ? 0 : this.latencyMin,
        max: this.latencyMax,
        buckets: this.buckets.map((le, i) => ({
          le,
          count: this.latencyBuckets[i],
        })),
      },
      workers,
      queue: {
        depth: this.queueDepth,
        peakDepth: this.peakQueueDepth,
        totalEnqueued: this.totalEnqueued,
        totalDequeued: this.totalDequeued,
        avgWaitTime,
      },
      errors: {
        total: this.totalErrors,
        byType: new Map(this.errorsByType),
        recent: [...this.recentErrors],
      },
      summary: {
        totalWorkers: workers.length,
        busyWorkers: workers.filter(w => w.state === 'busy').length,
        idleWorkers: workers.filter(w => w.state === 'ready').length,
        tasksPerSecond,
        avgLatency,
        p50Latency: p50,
        p95Latency: p95,
        p99Latency: p99,
        errorRate,
      },
    };
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.latencyBuckets = new Array(this.buckets.length + 1).fill(0);
    this.latencyCount = 0;
    this.latencySum = 0;
    this.latencyMin = Infinity;
    this.latencyMax = 0;
    this.latencyValues = [];

    this.queueDepth = 0;
    this.peakQueueDepth = 0;
    this.totalEnqueued = 0;
    this.totalDequeued = 0;
    this.queueWaitTimes = [];

    this.totalErrors = 0;
    this.errorsByType.clear();
    this.recentErrors = [];

    this.workerMetrics.clear();
    this.taskCompletions = [];
    this.startTime = Date.now();
  }

  /**
   * Stop metrics collection
   */
  stop(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }
  }

  /**
   * Get or create worker metric entry
   */
  private getOrCreateWorkerMetric(workerId: number) {
    let metric = this.workerMetrics.get(workerId);
    if (!metric) {
      metric = {
        tasksCompleted: 0,
        tasksFailed: 0,
        totalBusyTime: 0,
        taskDurations: [],
      };
      this.workerMetrics.set(workerId, metric);
    }
    return metric;
  }

  /**
   * Update worker metrics on task completion
   */
  private updateWorkerTaskComplete(workerId: number, durationMs: number): void {
    const metric = this.getOrCreateWorkerMetric(workerId);
    metric.tasksCompleted++;
    metric.taskDurations.push(durationMs);

    // Keep only recent durations for avg calculation
    if (metric.taskDurations.length > 100) {
      metric.taskDurations.shift();
    }
  }

  /**
   * Get worker utilization metrics
   */
  private getWorkerUtilizations(now: number): WorkerUtilization[] {
    const utilizations: WorkerUtilization[] = [];
    const elapsed = now - this.startTime;

    for (const [workerId, metric] of this.workerMetrics) {
      let busyTime = metric.totalBusyTime;
      if (metric.lastBusyStart) {
        busyTime += now - metric.lastBusyStart;
      }

      const utilization = elapsed > 0 ? (busyTime / elapsed) * 100 : 0;
      const avgDuration = metric.taskDurations.length > 0
        ? metric.taskDurations.reduce((a, b) => a + b, 0) / metric.taskDurations.length
        : 0;

      utilizations.push({
        workerId,
        state: metric.lastBusyStart ? 'busy' as WorkerState : 'ready' as WorkerState,
        tasksCompleted: metric.tasksCompleted,
        tasksFailed: metric.tasksFailed,
        utilization: Math.min(100, utilization),
        avgTaskDuration: avgDuration,
        idleTime: metric.lastBusyStart ? 0 : (elapsed - busyTime),
      });
    }

    return utilizations;
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Prune old data points outside rate window
   */
  private pruneDataPoints(points: DataPoint[]): void {
    const cutoff = Date.now() - this.rateWindow;
    while (points.length > 0 && points[0].timestamp < cutoff) {
      points.shift();
    }
    // Also limit array size
    while (points.length > 10000) {
      points.shift();
    }
  }
}

export default MetricsCollector;
