/**
 * Session Types
 *
 * Type definitions for worker sessions - a series of related tasks
 * executed by a single worker that can maintain state between calls.
 */

import type { ExecOptions, WorkerpoolPromise } from './core';

// =============================================================================
// Session Options
// =============================================================================

/**
 * Options for creating a session
 */
export interface SessionOptions<TState = unknown> {
  /**
   * Initial state to set on the session.
   * Sent to worker when session is created.
   */
  initialState?: TState;

  /**
   * Session timeout in milliseconds.
   * Session automatically closes after this period of inactivity.
   * @default 300000 (5 minutes)
   */
  timeout?: number;

  /**
   * Maximum number of tasks to execute in this session.
   * Session automatically closes after this many tasks.
   * @default Infinity
   */
  maxTasks?: number;

  /**
   * Function to call when session is initialized on worker.
   * Runs in worker context with access to initial state.
   */
  onInit?: (state: TState) => void | Promise<void>;

  /**
   * Function to call when session is being destroyed.
   * Runs in worker context, allows cleanup.
   */
  onDestroy?: (state: TState) => void | Promise<void>;

  /**
   * Whether to keep the worker alive after session ends.
   * If false, the worker may be reused for other sessions.
   * @default true
   */
  reuseWorker?: boolean;

  /**
   * Execution options to apply to all tasks in this session.
   */
  execOptions?: ExecOptions;
}

/**
 * Options for executing a task within a session
 */
export interface SessionExecOptions extends Omit<ExecOptions, 'transfer'> {
  /**
   * Transferable objects for this task.
   */
  transfer?: Transferable[];
}

// =============================================================================
// Session State
// =============================================================================

/**
 * Session state that can be accessed by worker methods
 */
export interface SessionState<T = unknown> {
  /** Session ID */
  id: string;
  /** User-defined state */
  data: T;
  /** Number of tasks executed in this session */
  taskCount: number;
  /** Session creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
}

/**
 * Session statistics
 */
export interface SessionStats {
  /** Session ID */
  id: string;
  /** Whether the session is active */
  active: boolean;
  /** Number of tasks executed */
  taskCount: number;
  /** Session age in milliseconds */
  age: number;
  /** Time since last activity in milliseconds */
  idleTime: number;
  /** Worker index handling this session */
  workerIndex: number;
}

// =============================================================================
// Session Interface
// =============================================================================

/**
 * A session represents a series of related tasks executed by a single worker
 * that can maintain state between calls.
 *
 * @template TState - Type of the session state
 *
 * @example
 * ```typescript
 * // Create a session with initial state
 * const session = await pool.createSession<{ count: number }>({
 *   initialState: { count: 0 },
 *   timeout: 60000,
 * });
 *
 * // Execute tasks within the session - state persists
 * await session.exec('increment', [5]);
 * const count = await session.exec('getCount');
 * console.log(count); // 5
 *
 * // Close the session
 * await session.close();
 * ```
 */
export interface Session<TState = unknown> {
  /**
   * Unique session identifier
   */
  readonly id: string;

  /**
   * Whether the session is currently active
   */
  readonly active: boolean;

  /**
   * Index of the worker handling this session
   */
  readonly workerIndex: number;

  /**
   * Execute a method within this session
   *
   * The method has access to session state via `this.session`.
   *
   * @param method - Method name to execute
   * @param params - Parameters to pass
   * @param options - Execution options
   * @returns Promise resolving to the result
   *
   * @example
   * ```typescript
   * const result = await session.exec('processData', [data]);
   * ```
   */
  exec<T>(
    method: string,
    params?: unknown[],
    options?: SessionExecOptions
  ): WorkerpoolPromise<T, unknown>;

  /**
   * Get current session state
   *
   * @returns Promise resolving to current state
   */
  getState(): WorkerpoolPromise<TState, unknown>;

  /**
   * Update session state
   *
   * @param updater - Function to update state or new state value
   * @returns Promise resolving when state is updated
   */
  setState(updater: TState | ((state: TState) => TState)): WorkerpoolPromise<void, unknown>;

  /**
   * Get session statistics
   */
  stats(): SessionStats;

  /**
   * Close the session and release the worker
   *
   * @param force - Force close without waiting for cleanup
   * @returns Promise resolving when session is closed
   */
  close(force?: boolean): WorkerpoolPromise<void, unknown>;

  /**
   * Reset the session timeout timer
   */
  touch(): void;
}

// =============================================================================
// Session Manager Interface
// =============================================================================

/**
 * Session manager interface for pool
 */
export interface SessionManager {
  /**
   * Create a new session
   *
   * @param options - Session configuration options
   * @returns Promise resolving to the new session
   */
  createSession<TState = unknown>(
    options?: SessionOptions<TState>
  ): WorkerpoolPromise<Session<TState>, unknown>;

  /**
   * Get a session by ID
   *
   * @param id - Session ID
   * @returns Session if found, undefined otherwise
   */
  getSession(id: string): Session | undefined;

  /**
   * Get all active sessions
   *
   * @returns Array of active sessions
   */
  getSessions(): Session[];

  /**
   * Close all sessions
   *
   * @param force - Force close without waiting for cleanup
   * @returns Promise resolving when all sessions are closed
   */
  closeSessions(force?: boolean): WorkerpoolPromise<void[], unknown>;
}

// =============================================================================
// Worker Session API
// =============================================================================

/**
 * Session API available to worker methods
 *
 * Accessible via `this.session` in worker methods when executing in a session.
 */
export interface WorkerSessionAPI<TState = unknown> {
  /**
   * Session ID
   */
  readonly id: string;

  /**
   * Get current session state
   */
  getState(): TState;

  /**
   * Update session state
   *
   * @param updater - New state or updater function
   */
  setState(updater: TState | ((state: TState) => TState)): void;

  /**
   * Get a value from session state
   *
   * @param key - State key
   */
  get<K extends keyof TState>(key: K): TState[K];

  /**
   * Set a value in session state
   *
   * @param key - State key
   * @param value - New value
   */
  set<K extends keyof TState>(key: K, value: TState[K]): void;

  /**
   * Number of tasks executed in this session
   */
  readonly taskCount: number;

  /**
   * Session age in milliseconds
   */
  readonly age: number;
}
