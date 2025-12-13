/**
 * HealthMonitor - Worker health monitoring and automatic recovery
 *
 * Implements heartbeat mechanism for worker liveness, detects stuck/hung workers,
 * tracks error rates per worker, and implements automatic unhealthy worker replacement.
 */

import type { WorkerInfo, WorkerState } from '../types/internal';

/**
 * Worker health status
 */
export enum HealthStatus {
  /** Worker is healthy and responsive */
  HEALTHY = 'healthy',
  /** Worker has shown some issues but still functional */
  DEGRADED = 'degraded',
  /** Worker is unresponsive or has critical issues */
  UNHEALTHY = 'unhealthy',
  /** Worker health is unknown (no data yet) */
  UNKNOWN = 'unknown',
}

/**
 * Health check result for a worker
 */
export interface WorkerHealthCheck {
  /** Worker ID */
  workerId: number;
  /** Current health status */
  status: HealthStatus;
  /** Time since last activity (ms) */
  lastActivityAge: number;
  /** Time since last heartbeat (ms) */
  lastHeartbeatAge: number;
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Error rate (0-1) */
  errorRate: number;
  /** Average response time (ms) */
  avgResponseTime: number;
  /** Whether worker should be replaced */
  shouldReplace: boolean;
  /** Reason for current status */
  reason: string;
}

/**
 * Health monitor options
 */
export interface HealthMonitorOptions {
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Heartbeat timeout - worker considered stuck if no response */
  heartbeatTimeout?: number;
  /** Maximum consecutive failures before marking unhealthy */
  maxConsecutiveFailures?: number;
  /** Error rate threshold for degraded status (0-1) */
  errorRateThreshold?: number;
  /** Response time threshold for degraded status (ms) */
  responseTimeThreshold?: number;
  /** Minimum samples before calculating error rate */
  minSamplesForErrorRate?: number;
  /** Callback when worker becomes unhealthy */
  onUnhealthy?: (workerId: number, check: WorkerHealthCheck) => void;
  /** Callback when worker recovers */
  onRecovered?: (workerId: number) => void;
}

/**
 * Worker health tracking data
 */
interface WorkerHealthData {
  workerId: number;
  lastHeartbeat: number;
  lastActivity: number;
  consecutiveFailures: number;
  totalTasks: number;
  failedTasks: number;
  responseTimes: number[];  // Rolling window
  currentStatus: HealthStatus;
  isTaskInProgress: boolean;
  taskStartTime?: number;
}

/**
 * Default options
 */
const DEFAULT_OPTIONS: Required<Omit<HealthMonitorOptions, 'onUnhealthy' | 'onRecovered'>> = {
  heartbeatInterval: 5000,
  heartbeatTimeout: 30000,
  maxConsecutiveFailures: 3,
  errorRateThreshold: 0.5,
  responseTimeThreshold: 5000,
  minSamplesForErrorRate: 10,
};

/**
 * HealthMonitor - Worker health monitoring
 *
 * @example
 * ```typescript
 * const monitor = new HealthMonitor({
 *   heartbeatInterval: 5000,
 *   maxConsecutiveFailures: 3,
 *   onUnhealthy: (workerId, check) => {
 *     console.log(`Worker ${workerId} is unhealthy: ${check.reason}`);
 *     pool.replaceWorker(workerId);
 *   }
 * });
 *
 * // Register workers
 * monitor.registerWorker(1);
 * monitor.registerWorker(2);
 *
 * // Record heartbeats from workers
 * monitor.recordHeartbeat(1);
 *
 * // Record task completions
 * monitor.recordTaskComplete(1, 150);
 * monitor.recordTaskFailed(2, new Error('Task failed'));
 *
 * // Check health periodically
 * const unhealthy = monitor.checkAll();
 * ```
 */
export class HealthMonitor {
  private readonly options: Required<Omit<HealthMonitorOptions, 'onUnhealthy' | 'onRecovered'>> & {
    onUnhealthy?: (workerId: number, check: WorkerHealthCheck) => void;
    onRecovered?: (workerId: number) => void;
  };

  private workers: Map<number, WorkerHealthData> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: HealthMonitorOptions = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
  }

  /**
   * Start periodic health checks
   */
  start(): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkAll();
    }, this.options.heartbeatInterval);
  }

  /**
   * Stop periodic health checks
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Register a worker for monitoring
   */
  registerWorker(workerId: number): void {
    const now = Date.now();
    this.workers.set(workerId, {
      workerId,
      lastHeartbeat: now,
      lastActivity: now,
      consecutiveFailures: 0,
      totalTasks: 0,
      failedTasks: 0,
      responseTimes: [],
      currentStatus: HealthStatus.UNKNOWN,
      isTaskInProgress: false,
    });
  }

  /**
   * Unregister a worker
   */
  unregisterWorker(workerId: number): void {
    this.workers.delete(workerId);
  }

  /**
   * Record heartbeat from worker
   */
  recordHeartbeat(workerId: number): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastHeartbeat = Date.now();
    }
  }

  /**
   * Record task start
   */
  recordTaskStart(workerId: number): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.isTaskInProgress = true;
      worker.taskStartTime = Date.now();
      worker.lastActivity = Date.now();
    }
  }

  /**
   * Record successful task completion
   */
  recordTaskComplete(workerId: number, durationMs: number): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    const now = Date.now();
    worker.lastActivity = now;
    worker.lastHeartbeat = now;  // Task completion counts as heartbeat
    worker.totalTasks++;
    worker.consecutiveFailures = 0;
    worker.isTaskInProgress = false;
    worker.taskStartTime = undefined;

    // Update response times (rolling window of 100)
    worker.responseTimes.push(durationMs);
    if (worker.responseTimes.length > 100) {
      worker.responseTimes.shift();
    }

    // Check if recovered
    if (worker.currentStatus === HealthStatus.UNHEALTHY || worker.currentStatus === HealthStatus.DEGRADED) {
      const check = this.checkWorker(workerId);
      if (check && check.status === HealthStatus.HEALTHY) {
        worker.currentStatus = HealthStatus.HEALTHY;
        this.options.onRecovered?.(workerId);
      }
    }
  }

  /**
   * Record task failure
   */
  recordTaskFailed(workerId: number, error: Error): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    const now = Date.now();
    worker.lastActivity = now;
    worker.totalTasks++;
    worker.failedTasks++;
    worker.consecutiveFailures++;
    worker.isTaskInProgress = false;
    worker.taskStartTime = undefined;

    // Check health immediately on failure
    this.checkWorker(workerId);
  }

  /**
   * Check health of a specific worker
   */
  checkWorker(workerId: number): WorkerHealthCheck | null {
    const worker = this.workers.get(workerId);
    if (!worker) return null;

    const now = Date.now();
    const check = this.evaluateHealth(worker, now);

    // Track status changes
    const previousStatus = worker.currentStatus;
    worker.currentStatus = check.status;

    // Notify on becoming unhealthy
    if (
      check.status === HealthStatus.UNHEALTHY &&
      previousStatus !== HealthStatus.UNHEALTHY
    ) {
      this.options.onUnhealthy?.(workerId, check);
    }

    return check;
  }

  /**
   * Check health of all workers
   */
  checkAll(): WorkerHealthCheck[] {
    const results: WorkerHealthCheck[] = [];

    for (const workerId of this.workers.keys()) {
      const check = this.checkWorker(workerId);
      if (check) {
        results.push(check);
      }
    }

    return results;
  }

  /**
   * Get workers that should be replaced
   */
  getUnhealthyWorkers(): number[] {
    return this.checkAll()
      .filter(check => check.shouldReplace)
      .map(check => check.workerId);
  }

  /**
   * Get current health status of a worker
   */
  getStatus(workerId: number): HealthStatus {
    return this.workers.get(workerId)?.currentStatus || HealthStatus.UNKNOWN;
  }

  /**
   * Get health summary
   */
  getSummary(): {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    unknown: number;
  } {
    const checks = this.checkAll();
    return {
      total: checks.length,
      healthy: checks.filter(c => c.status === HealthStatus.HEALTHY).length,
      degraded: checks.filter(c => c.status === HealthStatus.DEGRADED).length,
      unhealthy: checks.filter(c => c.status === HealthStatus.UNHEALTHY).length,
      unknown: checks.filter(c => c.status === HealthStatus.UNKNOWN).length,
    };
  }

  /**
   * Evaluate health of a worker
   */
  private evaluateHealth(worker: WorkerHealthData, now: number): WorkerHealthCheck {
    const { options } = this;
    const reasons: string[] = [];
    let status = HealthStatus.HEALTHY;
    let shouldReplace = false;

    const lastHeartbeatAge = now - worker.lastHeartbeat;
    const lastActivityAge = now - worker.lastActivity;

    // Calculate error rate
    const errorRate = worker.totalTasks >= options.minSamplesForErrorRate
      ? worker.failedTasks / worker.totalTasks
      : 0;

    // Calculate average response time
    const avgResponseTime = worker.responseTimes.length > 0
      ? worker.responseTimes.reduce((a, b) => a + b, 0) / worker.responseTimes.length
      : 0;

    // Check heartbeat timeout
    if (lastHeartbeatAge > options.heartbeatTimeout) {
      status = HealthStatus.UNHEALTHY;
      shouldReplace = true;
      reasons.push(`No heartbeat for ${Math.round(lastHeartbeatAge / 1000)}s`);
    }

    // Check stuck task
    if (worker.isTaskInProgress && worker.taskStartTime) {
      const taskDuration = now - worker.taskStartTime;
      if (taskDuration > options.heartbeatTimeout) {
        status = HealthStatus.UNHEALTHY;
        shouldReplace = true;
        reasons.push(`Task stuck for ${Math.round(taskDuration / 1000)}s`);
      }
    }

    // Check consecutive failures
    if (worker.consecutiveFailures >= options.maxConsecutiveFailures) {
      status = HealthStatus.UNHEALTHY;
      shouldReplace = true;
      reasons.push(`${worker.consecutiveFailures} consecutive failures`);
    } else if (worker.consecutiveFailures > 0 && status === HealthStatus.HEALTHY) {
      status = HealthStatus.DEGRADED;
      reasons.push(`${worker.consecutiveFailures} recent failures`);
    }

    // Check error rate
    if (worker.totalTasks >= options.minSamplesForErrorRate) {
      if (errorRate > options.errorRateThreshold) {
        if (status === HealthStatus.HEALTHY) {
          status = HealthStatus.DEGRADED;
        }
        reasons.push(`High error rate: ${(errorRate * 100).toFixed(1)}%`);
      }
    }

    // Check response time
    if (avgResponseTime > options.responseTimeThreshold && status === HealthStatus.HEALTHY) {
      status = HealthStatus.DEGRADED;
      reasons.push(`Slow response time: ${Math.round(avgResponseTime)}ms`);
    }

    // Unknown if no data
    if (worker.totalTasks === 0 && lastActivityAge < options.heartbeatInterval * 2) {
      status = HealthStatus.UNKNOWN;
      reasons.length = 0;
      reasons.push('Insufficient data');
    }

    return {
      workerId: worker.workerId,
      status,
      lastActivityAge,
      lastHeartbeatAge,
      consecutiveFailures: worker.consecutiveFailures,
      errorRate,
      avgResponseTime,
      shouldReplace,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Worker is healthy',
    };
  }
}

export default HealthMonitor;
