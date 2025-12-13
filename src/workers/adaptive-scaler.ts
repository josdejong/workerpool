/**
 * AdaptiveScaler - Dynamic worker scaling based on load
 *
 * Implements adaptive min/max scaling based on queue depth and task latency.
 * Includes hysteresis to prevent thrashing.
 */

import type { PoolMetrics } from '../core/metrics';

/**
 * Scaling decision
 */
export enum ScaleAction {
  /** No scaling needed */
  NONE = 'none',
  /** Scale up (add workers) */
  SCALE_UP = 'scale_up',
  /** Scale down (remove workers) */
  SCALE_DOWN = 'scale_down',
}

/**
 * Scaling decision with details
 */
export interface ScaleDecision {
  /** Recommended action */
  action: ScaleAction;
  /** Number of workers to add or remove */
  count: number;
  /** Reason for the decision */
  reason: string;
  /** Confidence in the decision (0-1) */
  confidence: number;
}

/**
 * Scaling thresholds
 */
export interface ScalingThresholds {
  /** Queue depth per worker that triggers scale up */
  queueDepthPerWorker: number;
  /** Latency (p95) in ms that triggers scale up */
  latencyThreshold: number;
  /** Utilization percentage that triggers scale up */
  utilizationHigh: number;
  /** Utilization percentage that triggers scale down */
  utilizationLow: number;
  /** Minimum idle time before scale down (ms) */
  idleTimeThreshold: number;
}

/**
 * Adaptive scaler options
 */
export interface AdaptiveScalerOptions {
  /** Minimum number of workers */
  minWorkers: number;
  /** Maximum number of workers */
  maxWorkers: number;
  /** Scaling thresholds */
  thresholds: Partial<ScalingThresholds>;
  /** Cooldown period between scale actions (ms) */
  cooldownPeriod?: number;
  /** Number of samples before making decision */
  sampleWindow?: number;
  /** Hysteresis factor (0-1) - higher means more resistance to change */
  hysteresis?: number;
  /** Callback when scaling is recommended */
  onScaleRecommendation?: (decision: ScaleDecision) => void;
}

/**
 * Default scaling thresholds
 */
const DEFAULT_THRESHOLDS: ScalingThresholds = {
  queueDepthPerWorker: 5,
  latencyThreshold: 1000,  // 1 second p95
  utilizationHigh: 80,
  utilizationLow: 20,
  idleTimeThreshold: 30000,  // 30 seconds
};

/**
 * Metrics sample for smoothing
 */
interface MetricsSample {
  timestamp: number;
  queueDepth: number;
  busyWorkers: number;
  totalWorkers: number;
  p95Latency: number;
  avgUtilization: number;
}

/**
 * AdaptiveScaler - Dynamic worker pool scaling
 *
 * @example
 * ```typescript
 * const scaler = new AdaptiveScaler({
 *   minWorkers: 2,
 *   maxWorkers: 16,
 *   thresholds: {
 *     utilizationHigh: 75,
 *     queueDepthPerWorker: 3
 *   },
 *   onScaleRecommendation: (decision) => {
 *     if (decision.action === ScaleAction.SCALE_UP) {
 *       pool.addWorkers(decision.count);
 *     }
 *   }
 * });
 *
 * // Periodically evaluate metrics
 * setInterval(() => {
 *   const metrics = pool.getMetrics();
 *   scaler.evaluate(metrics, pool.workerCount);
 * }, 1000);
 * ```
 */
export class AdaptiveScaler {
  private readonly options: Required<Omit<AdaptiveScalerOptions, 'onScaleRecommendation'>> & {
    thresholds: ScalingThresholds;
    onScaleRecommendation?: (decision: ScaleDecision) => void;
  };

  private samples: MetricsSample[] = [];
  private lastScaleAction: number = 0;
  private consecutiveScaleUpSignals = 0;
  private consecutiveScaleDownSignals = 0;

  constructor(options: AdaptiveScalerOptions) {
    this.options = {
      minWorkers: options.minWorkers,
      maxWorkers: options.maxWorkers,
      thresholds: { ...DEFAULT_THRESHOLDS, ...options.thresholds },
      cooldownPeriod: options.cooldownPeriod ?? 10000,
      sampleWindow: options.sampleWindow ?? 5,
      hysteresis: options.hysteresis ?? 0.3,
      onScaleRecommendation: options.onScaleRecommendation,
    };
  }

  /**
   * Evaluate current metrics and make scaling decision
   */
  evaluate(metrics: PoolMetrics, currentWorkers: number): ScaleDecision {
    const now = Date.now();
    const { thresholds, cooldownPeriod, sampleWindow, hysteresis } = this.options;

    // Add current sample
    const sample: MetricsSample = {
      timestamp: now,
      queueDepth: metrics.queue.depth,
      busyWorkers: metrics.summary.busyWorkers,
      totalWorkers: metrics.summary.totalWorkers,
      p95Latency: metrics.summary.p95Latency,
      avgUtilization: this.calculateAvgUtilization(metrics),
    };

    this.samples.push(sample);

    // Keep only recent samples
    while (this.samples.length > sampleWindow) {
      this.samples.shift();
    }

    // Need enough samples for decision
    if (this.samples.length < Math.min(3, sampleWindow)) {
      return { action: ScaleAction.NONE, count: 0, reason: 'Insufficient samples', confidence: 0 };
    }

    // Check cooldown period
    if (now - this.lastScaleAction < cooldownPeriod) {
      return { action: ScaleAction.NONE, count: 0, reason: 'In cooldown period', confidence: 0 };
    }

    // Calculate smoothed metrics
    const smoothed = this.calculateSmoothedMetrics();

    // Evaluate scale up triggers
    const scaleUpSignal = this.evaluateScaleUpTriggers(smoothed, currentWorkers, thresholds);
    if (scaleUpSignal.triggered) {
      this.consecutiveScaleUpSignals++;
      this.consecutiveScaleDownSignals = 0;
    } else {
      this.consecutiveScaleUpSignals = 0;
    }

    // Evaluate scale down triggers
    const scaleDownSignal = this.evaluateScaleDownTriggers(smoothed, currentWorkers, thresholds);
    if (scaleDownSignal.triggered) {
      this.consecutiveScaleDownSignals++;
      this.consecutiveScaleUpSignals = 0;
    } else {
      this.consecutiveScaleDownSignals = 0;
    }

    // Apply hysteresis - require consecutive signals
    const hysteresisThreshold = Math.ceil(sampleWindow * hysteresis);

    let decision: ScaleDecision;

    if (
      scaleUpSignal.triggered &&
      this.consecutiveScaleUpSignals >= hysteresisThreshold &&
      currentWorkers < this.options.maxWorkers
    ) {
      const count = Math.min(
        scaleUpSignal.recommendedCount,
        this.options.maxWorkers - currentWorkers
      );
      decision = {
        action: ScaleAction.SCALE_UP,
        count,
        reason: scaleUpSignal.reason,
        confidence: Math.min(1, this.consecutiveScaleUpSignals / sampleWindow),
      };
    } else if (
      scaleDownSignal.triggered &&
      this.consecutiveScaleDownSignals >= hysteresisThreshold &&
      currentWorkers > this.options.minWorkers
    ) {
      const count = Math.min(
        scaleDownSignal.recommendedCount,
        currentWorkers - this.options.minWorkers
      );
      decision = {
        action: ScaleAction.SCALE_DOWN,
        count,
        reason: scaleDownSignal.reason,
        confidence: Math.min(1, this.consecutiveScaleDownSignals / sampleWindow),
      };
    } else {
      decision = {
        action: ScaleAction.NONE,
        count: 0,
        reason: 'No scaling needed',
        confidence: 1,
      };
    }

    // Record scale action timing
    if (decision.action !== ScaleAction.NONE) {
      this.lastScaleAction = now;
      this.consecutiveScaleUpSignals = 0;
      this.consecutiveScaleDownSignals = 0;
    }

    // Notify callback
    if (decision.action !== ScaleAction.NONE) {
      this.options.onScaleRecommendation?.(decision);
    }

    return decision;
  }

  /**
   * Force a scaling decision (bypass cooldown)
   */
  forceEvaluate(metrics: PoolMetrics, currentWorkers: number): ScaleDecision {
    this.lastScaleAction = 0;  // Reset cooldown
    return this.evaluate(metrics, currentWorkers);
  }

  /**
   * Get current scaling state
   */
  getState(): {
    sampleCount: number;
    consecutiveScaleUpSignals: number;
    consecutiveScaleDownSignals: number;
    cooldownRemaining: number;
  } {
    return {
      sampleCount: this.samples.length,
      consecutiveScaleUpSignals: this.consecutiveScaleUpSignals,
      consecutiveScaleDownSignals: this.consecutiveScaleDownSignals,
      cooldownRemaining: Math.max(0, this.options.cooldownPeriod - (Date.now() - this.lastScaleAction)),
    };
  }

  /**
   * Reset scaler state
   */
  reset(): void {
    this.samples = [];
    this.lastScaleAction = 0;
    this.consecutiveScaleUpSignals = 0;
    this.consecutiveScaleDownSignals = 0;
  }

  /**
   * Calculate average utilization across workers
   */
  private calculateAvgUtilization(metrics: PoolMetrics): number {
    if (metrics.workers.length === 0) return 0;
    const totalUtilization = metrics.workers.reduce((sum, w) => sum + w.utilization, 0);
    return totalUtilization / metrics.workers.length;
  }

  /**
   * Calculate smoothed metrics from samples
   */
  private calculateSmoothedMetrics(): MetricsSample {
    const count = this.samples.length;
    return {
      timestamp: Date.now(),
      queueDepth: this.samples.reduce((sum, s) => sum + s.queueDepth, 0) / count,
      busyWorkers: this.samples.reduce((sum, s) => sum + s.busyWorkers, 0) / count,
      totalWorkers: this.samples.reduce((sum, s) => sum + s.totalWorkers, 0) / count,
      p95Latency: this.samples.reduce((sum, s) => sum + s.p95Latency, 0) / count,
      avgUtilization: this.samples.reduce((sum, s) => sum + s.avgUtilization, 0) / count,
    };
  }

  /**
   * Evaluate scale up triggers
   */
  private evaluateScaleUpTriggers(
    metrics: MetricsSample,
    currentWorkers: number,
    thresholds: ScalingThresholds
  ): { triggered: boolean; recommendedCount: number; reason: string } {
    const reasons: string[] = [];
    let triggered = false;
    let recommendedCount = 1;

    // Queue depth trigger
    const queuePerWorker = currentWorkers > 0 ? metrics.queueDepth / currentWorkers : metrics.queueDepth;
    if (queuePerWorker > thresholds.queueDepthPerWorker) {
      triggered = true;
      recommendedCount = Math.max(
        recommendedCount,
        Math.ceil(metrics.queueDepth / thresholds.queueDepthPerWorker) - currentWorkers
      );
      reasons.push(`Queue depth ${queuePerWorker.toFixed(1)} per worker exceeds ${thresholds.queueDepthPerWorker}`);
    }

    // Latency trigger
    if (metrics.p95Latency > thresholds.latencyThreshold) {
      triggered = true;
      reasons.push(`p95 latency ${metrics.p95Latency.toFixed(0)}ms exceeds ${thresholds.latencyThreshold}ms`);
    }

    // Utilization trigger
    if (metrics.avgUtilization > thresholds.utilizationHigh) {
      triggered = true;
      reasons.push(`Utilization ${metrics.avgUtilization.toFixed(1)}% exceeds ${thresholds.utilizationHigh}%`);
    }

    // All workers busy with queue
    if (metrics.busyWorkers >= currentWorkers && metrics.queueDepth > 0) {
      triggered = true;
      recommendedCount = Math.max(recommendedCount, Math.ceil(metrics.queueDepth / 2));
      reasons.push('All workers busy with pending tasks');
    }

    return {
      triggered,
      recommendedCount: Math.min(recommendedCount, 4),  // Cap at 4 workers per decision
      reason: reasons.join('; ') || 'No scale up triggers',
    };
  }

  /**
   * Evaluate scale down triggers
   */
  private evaluateScaleDownTriggers(
    metrics: MetricsSample,
    currentWorkers: number,
    thresholds: ScalingThresholds
  ): { triggered: boolean; recommendedCount: number; reason: string } {
    // Don't scale down if there's queue
    if (metrics.queueDepth > 0) {
      return { triggered: false, recommendedCount: 0, reason: 'Queue not empty' };
    }

    // Don't scale down if utilization is reasonable
    if (metrics.avgUtilization > thresholds.utilizationLow) {
      return { triggered: false, recommendedCount: 0, reason: 'Utilization acceptable' };
    }

    // Calculate how many workers are truly idle
    const idleWorkers = currentWorkers - Math.ceil(metrics.busyWorkers);
    if (idleWorkers <= 0) {
      return { triggered: false, recommendedCount: 0, reason: 'No idle workers' };
    }

    // Can scale down
    const targetWorkers = Math.max(
      this.options.minWorkers,
      Math.ceil(currentWorkers * (metrics.avgUtilization / 50))  // Target 50% utilization
    );
    const recommendedCount = Math.min(idleWorkers, currentWorkers - targetWorkers);

    if (recommendedCount > 0) {
      return {
        triggered: true,
        recommendedCount: Math.min(recommendedCount, 2),  // Cap at 2 workers per decision
        reason: `Low utilization ${metrics.avgUtilization.toFixed(1)}%, ${idleWorkers} idle workers`,
      };
    }

    return { triggered: false, recommendedCount: 0, reason: 'Scale down not beneficial' };
  }
}

export default AdaptiveScaler;
