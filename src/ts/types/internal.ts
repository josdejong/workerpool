/**
 * workerpool Internal Type Definitions
 * Types used internally by workerpool implementation
 */

/**
 * Worker lifecycle states
 */
export enum WorkerState {
  /** Worker not yet initialized */
  COLD = 'cold',
  /** Worker is initializing */
  WARMING = 'warming',
  /** Worker is ready and idle */
  READY = 'ready',
  /** Worker is executing a task */
  BUSY = 'busy',
  /** Worker is running cleanup before termination */
  CLEANING = 'cleaning',
  /** Worker is being terminated */
  TERMINATING = 'terminating',
  /** Worker has been terminated */
  TERMINATED = 'terminated',
}

/**
 * Internal task representation with additional tracking fields
 * @template T - Task metadata type
 */
export interface InternalTask<T = unknown> {
  /** Unique task ID */
  id: number;
  /** Method name or stringified function */
  method: string | Function;
  /** Parameters for the method */
  params?: unknown[];
  /** Task timeout in milliseconds */
  timeout: number | null;
  /** Custom metadata */
  metadata?: T;
  /** Timestamp when task was created */
  createdAt: number;
  /** Timestamp when task started executing */
  startedAt?: number;
  /** Promise resolve function */
  resolve: (value: unknown) => void;
  /** Promise reject function */
  reject: (error: Error) => void;
  /** Event handler for worker events */
  onEvent?: (payload: unknown) => void;
}

/**
 * Worker instance tracking information
 */
export interface WorkerInfo {
  /** Unique worker ID */
  id: number;
  /** Current worker state */
  state: WorkerState;
  /** Currently executing task ID, if any */
  currentTaskId?: number;
  /** Number of tasks completed by this worker */
  tasksCompleted: number;
  /** Number of tasks that failed on this worker */
  tasksFailed: number;
  /** Timestamp when worker was created */
  createdAt: number;
  /** Timestamp of last task completion */
  lastActiveAt?: number;
  /** Accumulated busy time in milliseconds */
  busyTime: number;
}

// SerializedError is exported from messages.ts
import type { SerializedError } from './messages';
export type { SerializedError };

/**
 * Result of function stringification for dynamic execution
 */
export interface StringifiedFunction {
  /** The stringified function body */
  code: string;
  /** Whether the function is async */
  isAsync: boolean;
  /** Original function name, if any */
  name?: string;
}

/**
 * Debug port allocation tracking
 */
export interface DebugPortInfo {
  /** Base debug port */
  basePort: number;
  /** Currently allocated ports */
  allocatedPorts: Set<number>;
  /** Next port to try */
  nextPort: number;
}

/**
 * Worker type support matrix
 */
export interface WorkerTypeSupport {
  /** Worker threads (Node.js) */
  thread: boolean;
  /** Child process (Node.js) - limited in Bun */
  process: boolean;
  /** Web workers (Browser) */
  web: boolean;
  /** Auto detection */
  auto: boolean;
}

/**
 * Platform detection results
 */
export interface PlatformInfo {
  /** Current platform: 'node' or 'browser' */
  platform: 'node' | 'browser';
  /** Whether running in main thread */
  isMainThread: boolean;
  /** Number of available CPU cores */
  cpus: number;
  /** Whether worker_threads is available */
  hasWorkerThreads: boolean;
  /** Whether SharedArrayBuffer is available */
  hasSharedArrayBuffer: boolean;
  /** Whether Atomics is available */
  hasAtomics: boolean;
  /** Whether running in Bun runtime */
  isBun: boolean;
  /** Bun version if running in Bun, null otherwise */
  bunVersion: string | null;
  /** Recommended worker type for this runtime */
  recommendedWorkerType: 'auto' | 'thread' | 'process' | 'web';
  /** Support matrix for different worker types */
  workerTypeSupport: WorkerTypeSupport;
}

/**
 * Timeout handle that works across platforms
 */
export type TimeoutHandle = ReturnType<typeof setTimeout>;

/**
 * Generic callback function type
 */
export type Callback<T = void> = (error: Error | null, result?: T) => void;

/**
 * Method registry for worker scripts
 */
export type MethodRegistry = Record<string, (...args: unknown[]) => unknown>;
