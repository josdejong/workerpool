/**
 * Heartbeat Mechanism
 *
 * Provides worker health monitoring through periodic heartbeat messages.
 * Detects unresponsive workers and enables automatic recovery.
 */

import {
  HEARTBEAT_METHOD_ID,
  type HeartbeatRequest,
  type HeartbeatResponse,
  PROTOCOL_VERSION,
  MessagePriority,
} from '../types/messages';
import { WorkerErrorCode } from '../types/error-codes';

/**
 * Heartbeat configuration
 */
export interface HeartbeatConfig {
  /** Interval between heartbeats in ms (default: 5000) */
  interval?: number;
  /** Timeout for heartbeat response in ms (default: 3000) */
  timeout?: number;
  /** Number of missed heartbeats before marking unresponsive (default: 3) */
  maxMissed?: number;
  /** Whether to auto-recover unresponsive workers (default: true) */
  autoRecover?: boolean;
  /** Callback when worker becomes unresponsive */
  onUnresponsive?: (workerId: string, missedCount: number) => void;
  /** Callback when worker recovers */
  onRecovered?: (workerId: string) => void;
  /** Callback for heartbeat statistics */
  onHeartbeat?: (workerId: string, latency: number, status: HeartbeatResponse['status']) => void;
}

/**
 * Worker heartbeat state
 */
interface WorkerHeartbeatState {
  /** Worker ID */
  workerId: string;
  /** Last heartbeat request ID */
  lastRequestId: number;
  /** Last heartbeat request timestamp */
  lastRequestTime: number;
  /** Last successful heartbeat response timestamp */
  lastResponseTime: number;
  /** Number of consecutive missed heartbeats */
  missedCount: number;
  /** Whether worker is currently marked as unresponsive */
  isUnresponsive: boolean;
  /** Latency history for averaging */
  latencyHistory: number[];
  /** Pending heartbeat timeout */
  pendingTimeout: ReturnType<typeof setTimeout> | null;
}

/**
 * Heartbeat statistics
 */
export interface HeartbeatStats {
  /** Worker ID */
  workerId: string;
  /** Whether worker is responsive */
  isResponsive: boolean;
  /** Average latency in ms */
  avgLatency: number;
  /** Min latency in ms */
  minLatency: number;
  /** Max latency in ms */
  maxLatency: number;
  /** Number of successful heartbeats */
  successCount: number;
  /** Number of missed heartbeats */
  missedCount: number;
  /** Last response status */
  lastStatus?: HeartbeatResponse['status'];
  /** Time since last successful heartbeat */
  timeSinceLastResponse: number;
}

const DEFAULT_INTERVAL = 5000;
const DEFAULT_TIMEOUT = 3000;
const DEFAULT_MAX_MISSED = 3;
const LATENCY_HISTORY_SIZE = 10;

/**
 * Heartbeat monitor for worker health checking
 */
export class HeartbeatMonitor {
  private config: Required<Omit<HeartbeatConfig, 'onUnresponsive' | 'onRecovered' | 'onHeartbeat'>> &
    Pick<HeartbeatConfig, 'onUnresponsive' | 'onRecovered' | 'onHeartbeat'>;
  private workers: Map<string, WorkerHeartbeatState> = new Map();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private nextRequestId: number = 0;
  private isRunning: boolean = false;
  private sendHeartbeat: (workerId: string, request: HeartbeatRequest) => void;
  private successCounts: Map<string, number> = new Map();

  constructor(
    sendHeartbeat: (workerId: string, request: HeartbeatRequest) => void,
    config: HeartbeatConfig = {}
  ) {
    this.sendHeartbeat = sendHeartbeat;
    this.config = {
      interval: config.interval ?? DEFAULT_INTERVAL,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxMissed: config.maxMissed ?? DEFAULT_MAX_MISSED,
      autoRecover: config.autoRecover ?? true,
      onUnresponsive: config.onUnresponsive,
      onRecovered: config.onRecovered,
      onHeartbeat: config.onHeartbeat,
    };
  }

  /**
   * Register a worker for heartbeat monitoring
   */
  registerWorker(workerId: string): void {
    if (this.workers.has(workerId)) {
      return;
    }

    const state: WorkerHeartbeatState = {
      workerId,
      lastRequestId: 0,
      lastRequestTime: 0,
      lastResponseTime: Date.now(),
      missedCount: 0,
      isUnresponsive: false,
      latencyHistory: [],
      pendingTimeout: null,
    };

    this.workers.set(workerId, state);
    this.successCounts.set(workerId, 0);
  }

  /**
   * Unregister a worker from heartbeat monitoring
   */
  unregisterWorker(workerId: string): void {
    const state = this.workers.get(workerId);
    if (state?.pendingTimeout) {
      clearTimeout(state.pendingTimeout);
    }
    this.workers.delete(workerId);
    this.successCounts.delete(workerId);
  }

  /**
   * Start heartbeat monitoring
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalHandle = setInterval(() => {
      this.sendHeartbeats();
    }, this.config.interval);

    // Send initial heartbeats immediately
    this.sendHeartbeats();
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    // Clear all pending timeouts
    for (const state of this.workers.values()) {
      if (state.pendingTimeout) {
        clearTimeout(state.pendingTimeout);
        state.pendingTimeout = null;
      }
    }
  }

  /**
   * Handle heartbeat response from worker
   */
  handleResponse(workerId: string, response: HeartbeatResponse): void {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    // Clear pending timeout
    if (state.pendingTimeout) {
      clearTimeout(state.pendingTimeout);
      state.pendingTimeout = null;
    }

    // Calculate latency
    const now = Date.now();
    const latency = now - state.lastRequestTime;

    // Update state
    state.lastResponseTime = now;
    state.missedCount = 0;

    // Update latency history
    state.latencyHistory.push(latency);
    if (state.latencyHistory.length > LATENCY_HISTORY_SIZE) {
      state.latencyHistory.shift();
    }

    // Update success count
    const currentCount = this.successCounts.get(workerId) ?? 0;
    this.successCounts.set(workerId, currentCount + 1);

    // Check for recovery
    if (state.isUnresponsive) {
      state.isUnresponsive = false;
      this.config.onRecovered?.(workerId);
    }

    // Callback with stats
    this.config.onHeartbeat?.(workerId, latency, response.status);
  }

  /**
   * Get heartbeat statistics for a worker
   */
  getStats(workerId: string): HeartbeatStats | null {
    const state = this.workers.get(workerId);
    if (!state) {
      return null;
    }

    const latencies = state.latencyHistory;
    const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    return {
      workerId,
      isResponsive: !state.isUnresponsive,
      avgLatency,
      minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
      successCount: this.successCounts.get(workerId) ?? 0,
      missedCount: state.missedCount,
      timeSinceLastResponse: Date.now() - state.lastResponseTime,
    };
  }

  /**
   * Get all worker statistics
   */
  getAllStats(): HeartbeatStats[] {
    const stats: HeartbeatStats[] = [];
    for (const workerId of this.workers.keys()) {
      const stat = this.getStats(workerId);
      if (stat) {
        stats.push(stat);
      }
    }
    return stats;
  }

  /**
   * Check if a worker is responsive
   */
  isResponsive(workerId: string): boolean {
    const state = this.workers.get(workerId);
    return state ? !state.isUnresponsive : false;
  }

  /**
   * Get list of unresponsive workers
   */
  getUnresponsiveWorkers(): string[] {
    const unresponsive: string[] = [];
    for (const [workerId, state] of this.workers.entries()) {
      if (state.isUnresponsive) {
        unresponsive.push(workerId);
      }
    }
    return unresponsive;
  }

  /**
   * Check if monitoring is running
   */
  isMonitoring(): boolean {
    return this.isRunning;
  }

  /**
   * Get current configuration
   */
  getConfig(): HeartbeatConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<HeartbeatConfig>): void {
    Object.assign(this.config, config);

    // Restart if interval changed and currently running
    if (config.interval !== undefined && this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Send heartbeats to all registered workers
   */
  private sendHeartbeats(): void {
    const now = Date.now();

    for (const state of this.workers.values()) {
      // Skip if there's still a pending heartbeat
      if (state.pendingTimeout) {
        continue;
      }

      const requestId = this.nextRequestId++;
      state.lastRequestId = requestId;
      state.lastRequestTime = now;

      const request: HeartbeatRequest = {
        v: PROTOCOL_VERSION,
        id: requestId,
        method: HEARTBEAT_METHOD_ID,
        workerId: state.workerId,
        priority: MessagePriority.HIGH,
        ts: now,
      };

      // Set timeout for response
      state.pendingTimeout = setTimeout(() => {
        this.handleTimeout(state.workerId);
      }, this.config.timeout);

      // Send heartbeat
      try {
        this.sendHeartbeat(state.workerId, request);
      } catch {
        // If send fails, handle as timeout
        this.handleTimeout(state.workerId);
      }
    }
  }

  /**
   * Handle heartbeat timeout
   */
  private handleTimeout(workerId: string): void {
    const state = this.workers.get(workerId);
    if (!state) {
      return;
    }

    state.pendingTimeout = null;
    state.missedCount++;

    // Check if worker should be marked unresponsive
    if (state.missedCount >= this.config.maxMissed && !state.isUnresponsive) {
      state.isUnresponsive = true;
      this.config.onUnresponsive?.(workerId, state.missedCount);
    }
  }
}

/**
 * Create a heartbeat request message
 */
export function createHeartbeatRequest(id: number, workerId?: string): HeartbeatRequest {
  return {
    v: PROTOCOL_VERSION,
    id,
    method: HEARTBEAT_METHOD_ID,
    workerId,
    priority: MessagePriority.HIGH,
    ts: Date.now(),
  };
}

/**
 * Create a heartbeat response message
 */
export function createHeartbeatResponse(
  id: number,
  status: HeartbeatResponse['status'],
  details?: {
    taskCount?: number;
    memoryUsage?: number;
    uptime?: number;
  }
): HeartbeatResponse {
  return {
    v: PROTOCOL_VERSION,
    id,
    method: HEARTBEAT_METHOD_ID,
    status,
    taskCount: details?.taskCount,
    memoryUsage: details?.memoryUsage,
    uptime: details?.uptime,
    ts: Date.now(),
  };
}

/**
 * Worker-side heartbeat handler
 *
 * Call this in worker message handler to respond to heartbeat requests.
 */
export function handleHeartbeatInWorker(
  request: HeartbeatRequest,
  getStatus: () => {
    status: HeartbeatResponse['status'];
    taskCount?: number;
    memoryUsage?: number;
    uptime?: number;
  }
): HeartbeatResponse {
  const workerStatus = getStatus();
  return createHeartbeatResponse(request.id, workerStatus.status, {
    taskCount: workerStatus.taskCount,
    memoryUsage: workerStatus.memoryUsage,
    uptime: workerStatus.uptime,
  });
}

/**
 * Error codes related to heartbeat
 */
export const HeartbeatErrorCodes = {
  WORKER_UNRESPONSIVE: WorkerErrorCode.WORKER_UNRESPONSIVE,
  CONNECTION_LOST: 5002, // CommunicationErrorCode.CONNECTION_LOST
} as const;

export default HeartbeatMonitor;
