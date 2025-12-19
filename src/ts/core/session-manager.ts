/**
 * Session Manager
 *
 * Manages worker sessions - a series of related tasks executed by a single
 * worker that can maintain state between calls.
 *
 * Features:
 * - Worker affinity: routes all session tasks to the same worker
 * - Session state: maintains state between task executions
 * - Automatic timeout: closes idle sessions
 * - Task limits: closes sessions after N tasks
 */

import { WorkerpoolPromise } from './Promise';
import type { WorkerHandler } from './WorkerHandler';
import type {
  Session,
  SessionOptions,
  SessionStats,
  SessionExecOptions,
  SessionState,
  WorkerSessionAPI,
} from '../types/session';
import type { ExecOptions } from '../types/core';

// =============================================================================
// Constants
// =============================================================================

/** Default session timeout (5 minutes) */
const DEFAULT_TIMEOUT = 5 * 60 * 1000;

/** Session method prefix */
const SESSION_PREFIX = '__session__';

/** Session initialization method */
const SESSION_INIT = `${SESSION_PREFIX}init`;

/** Session destroy method */
const SESSION_DESTROY = `${SESSION_PREFIX}destroy`;

/** Session get state method */
const SESSION_GET_STATE = `${SESSION_PREFIX}getState`;

/** Session set state method */
const SESSION_SET_STATE = `${SESSION_PREFIX}setState`;

/** Session execute method */
const SESSION_EXEC = `${SESSION_PREFIX}exec`;

// =============================================================================
// Session ID Generator
// =============================================================================

let sessionIdCounter = 0;

function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  const counter = (++sessionIdCounter).toString(36);
  return `session-${timestamp}-${random}-${counter}`;
}

// =============================================================================
// Session Implementation
// =============================================================================

/**
 * Session implementation
 */
class SessionImpl<TState = unknown> implements Session<TState> {
  readonly id: string;
  private _active = true;
  private _workerIndex: number;
  private _worker: WorkerHandler;
  private _taskCount = 0;
  private _createdAt: number;
  private _lastActivityAt: number;
  private _options: Required<SessionOptions<TState>>;
  private _timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private _pool: SessionManagerPool;

  constructor(
    id: string,
    worker: WorkerHandler,
    workerIndex: number,
    pool: SessionManagerPool,
    options: Required<SessionOptions<TState>>
  ) {
    this.id = id;
    this._worker = worker;
    this._workerIndex = workerIndex;
    this._pool = pool;
    this._options = options;
    this._createdAt = Date.now();
    this._lastActivityAt = this._createdAt;

    // Start timeout timer
    this.resetTimeout();
  }

  get active(): boolean {
    return this._active;
  }

  get workerIndex(): number {
    return this._workerIndex;
  }

  /**
   * Execute a method within this session
   */
  exec<T>(
    method: string,
    params?: unknown[],
    options?: SessionExecOptions
  ): WorkerpoolPromise<T, unknown> {
    if (!this._active) {
      return WorkerpoolPromise.reject(
        new Error('Session is closed')
      ) as unknown as WorkerpoolPromise<T, unknown>;
    }

    // Check task limit
    if (this._taskCount >= this._options.maxTasks) {
      return this.close().then(() => {
        throw new Error('Session task limit exceeded');
      }) as unknown as WorkerpoolPromise<T, unknown>;
    }

    // Update activity timestamp
    this._lastActivityAt = Date.now();
    this._taskCount++;

    // Reset timeout
    this.resetTimeout();

    // Execute on the session's worker
    const execOptions: ExecOptions = {
      ...this._options.execOptions,
      ...options,
    };

    // Wrap method with session context
    const sessionExecWrapper = `
      (function(sessionId, method, params) {
        // Access session state from global
        var sessions = globalThis.__workerpool_sessions__ || {};
        var session = sessions[sessionId];
        if (!session) {
          throw new Error('Session not found: ' + sessionId);
        }

        // Get the method to execute
        var fn = null;
        if (typeof globalThis.__workerpool_methods__ !== 'undefined' &&
            globalThis.__workerpool_methods__[method]) {
          fn = globalThis.__workerpool_methods__[method];
        } else {
          throw new Error('Unknown method: ' + method);
        }

        // Create session API for the method
        var sessionAPI = {
          id: sessionId,
          getState: function() { return session.data; },
          setState: function(updater) {
            if (typeof updater === 'function') {
              session.data = updater(session.data);
            } else {
              session.data = updater;
            }
          },
          get: function(key) { return session.data[key]; },
          set: function(key, value) { session.data[key] = value; },
          taskCount: session.taskCount,
          age: Date.now() - session.createdAt
        };

        // Increment task count
        session.taskCount++;
        session.lastActivityAt = Date.now();

        // Execute with session context
        return fn.apply({ session: sessionAPI }, params || []);
      })
    `;

    return this._pool.execOnWorker<T>(
      this._workerIndex,
      sessionExecWrapper,
      [this.id, method, params],
      execOptions
    );
  }

  /**
   * Get current session state
   */
  getState(): WorkerpoolPromise<TState, unknown> {
    if (!this._active) {
      return WorkerpoolPromise.reject(
        new Error('Session is closed')
      ) as unknown as WorkerpoolPromise<TState, unknown>;
    }

    const getStateWrapper = `
      (function(sessionId) {
        var sessions = globalThis.__workerpool_sessions__ || {};
        var session = sessions[sessionId];
        if (!session) {
          throw new Error('Session not found: ' + sessionId);
        }
        return session.data;
      })
    `;

    return this._pool.execOnWorker<TState>(
      this._workerIndex,
      getStateWrapper,
      [this.id],
      this._options.execOptions
    );
  }

  /**
   * Update session state
   */
  setState(
    updater: TState | ((state: TState) => TState)
  ): WorkerpoolPromise<void, unknown> {
    if (!this._active) {
      return WorkerpoolPromise.reject(
        new Error('Session is closed')
      ) as unknown as WorkerpoolPromise<void, unknown>;
    }

    const setStateWrapper = `
      (function(sessionId, updater, isFunction) {
        var sessions = globalThis.__workerpool_sessions__ || {};
        var session = sessions[sessionId];
        if (!session) {
          throw new Error('Session not found: ' + sessionId);
        }
        if (isFunction) {
          var fn = eval('(' + updater + ')');
          session.data = fn(session.data);
        } else {
          session.data = updater;
        }
      })
    `;

    const isFunction = typeof updater === 'function';
    const updaterParam = isFunction ? String(updater) : updater;

    return this._pool.execOnWorker<void>(
      this._workerIndex,
      setStateWrapper,
      [this.id, updaterParam, isFunction],
      this._options.execOptions
    );
  }

  /**
   * Get session statistics
   */
  stats(): SessionStats {
    const now = Date.now();
    return {
      id: this.id,
      active: this._active,
      taskCount: this._taskCount,
      age: now - this._createdAt,
      idleTime: now - this._lastActivityAt,
      workerIndex: this._workerIndex,
    };
  }

  /**
   * Close the session
   */
  close(force?: boolean): WorkerpoolPromise<void, unknown> {
    if (!this._active) {
      const { promise, resolve } = WorkerpoolPromise.defer<void>();
      resolve();
      return promise as WorkerpoolPromise<void, unknown>;
    }

    this._active = false;
    this.clearTimeout();

    // Destroy session on worker
    const destroyWrapper = `
      (function(sessionId, onDestroyFn) {
        var sessions = globalThis.__workerpool_sessions__ || {};
        var session = sessions[sessionId];
        if (session) {
          if (onDestroyFn) {
            try {
              var fn = eval('(' + onDestroyFn + ')');
              var result = fn(session.data);
              if (result && typeof result.then === 'function') {
                return result.then(function() {
                  delete sessions[sessionId];
                });
              }
            } catch (e) {
              // Ignore destroy errors
            }
          }
          delete sessions[sessionId];
        }
      })
    `;

    const onDestroyFn = this._options.onDestroy
      ? String(this._options.onDestroy)
      : null;

    return this._pool
      .execOnWorker<void>(
        this._workerIndex,
        destroyWrapper,
        [this.id, onDestroyFn],
        {}
      )
      .always(() => {
        this._pool.removeSession(this.id);
      }) as WorkerpoolPromise<void, unknown>;
  }

  /**
   * Reset the session timeout timer
   */
  touch(): void {
    this._lastActivityAt = Date.now();
    this.resetTimeout();
  }

  /**
   * Reset timeout timer
   */
  private resetTimeout(): void {
    this.clearTimeout();

    if (this._options.timeout > 0 && this._options.timeout < Infinity) {
      this._timeoutTimer = setTimeout(() => {
        this.close();
      }, this._options.timeout);
    }
  }

  /**
   * Clear timeout timer
   */
  private clearTimeout(): void {
    if (this._timeoutTimer) {
      clearTimeout(this._timeoutTimer);
      this._timeoutTimer = null;
    }
  }
}

// =============================================================================
// Session Manager Pool Interface
// =============================================================================

/**
 * Interface that Pool must implement for session management
 */
export interface SessionManagerPool {
  /**
   * Execute a method on a specific worker
   */
  execOnWorker<T>(
    workerIndex: number,
    method: string,
    params: unknown[],
    options?: ExecOptions
  ): WorkerpoolPromise<T, unknown>;

  /**
   * Get number of workers
   */
  getWorkerCount(): number;

  /**
   * Get a worker by index
   */
  getWorker(index: number): WorkerHandler | undefined;

  /**
   * Remove session from tracking
   */
  removeSession(id: string): void;
}

// =============================================================================
// Session Manager
// =============================================================================

/**
 * Session manager for worker pools
 */
export class SessionManager {
  /** Reference to pool */
  private pool: SessionManagerPool;

  /** Active sessions by ID */
  private sessions: Map<string, Session> = new Map();

  /** Sessions by worker index */
  private workerSessions: Map<number, Set<string>> = new Map();

  constructor(pool: SessionManagerPool) {
    this.pool = pool;
  }

  /**
   * Create a new session
   */
  createSession<TState = unknown>(
    options?: SessionOptions<TState>
  ): WorkerpoolPromise<Session<TState>, unknown> {
    const sessionId = generateSessionId();

    // Find worker with least sessions
    const workerIndex = this.selectWorker();
    const worker = this.pool.getWorker(workerIndex);

    if (!worker) {
      return WorkerpoolPromise.reject(
        new Error('No workers available')
      ) as unknown as WorkerpoolPromise<Session<TState>, unknown>;
    }

    // Build options with defaults
    const fullOptions: Required<SessionOptions<TState>> = {
      initialState: (options?.initialState ?? {}) as TState,
      timeout: options?.timeout ?? DEFAULT_TIMEOUT,
      maxTasks: options?.maxTasks ?? Infinity,
      onInit: options?.onInit ?? (() => {}),
      onDestroy: options?.onDestroy ?? (() => {}),
      reuseWorker: options?.reuseWorker ?? true,
      execOptions: options?.execOptions ?? {},
    };

    // Initialize session on worker
    const initWrapper = `
      (function(sessionId, initialState, onInitFn) {
        globalThis.__workerpool_sessions__ = globalThis.__workerpool_sessions__ || {};
        var session = {
          id: sessionId,
          data: initialState,
          taskCount: 0,
          createdAt: Date.now(),
          lastActivityAt: Date.now()
        };
        globalThis.__workerpool_sessions__[sessionId] = session;

        if (onInitFn) {
          try {
            var fn = eval('(' + onInitFn + ')');
            var result = fn(session.data);
            if (result && typeof result.then === 'function') {
              return result.then(function() { return sessionId; });
            }
          } catch (e) {
            // Ignore init errors
          }
        }
        return sessionId;
      })
    `;

    const onInitFn = fullOptions.onInit ? String(fullOptions.onInit) : null;

    return this.pool
      .execOnWorker<string>(
        workerIndex,
        initWrapper,
        [sessionId, fullOptions.initialState, onInitFn],
        fullOptions.execOptions
      )
      .then((createdId) => {
        // Create session wrapper
        const session = new SessionImpl<TState>(
          createdId,
          worker,
          workerIndex,
          this.pool,
          fullOptions
        );

        // Track session
        this.sessions.set(createdId, session);

        let workerSessionSet = this.workerSessions.get(workerIndex);
        if (!workerSessionSet) {
          workerSessionSet = new Set();
          this.workerSessions.set(workerIndex, workerSessionSet);
        }
        workerSessionSet.add(createdId);

        return session as Session<TState>;
      }) as WorkerpoolPromise<Session<TState>, unknown>;
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  /**
   * Get all active sessions
   */
  getSessions(): Session[] {
    return Array.from(this.sessions.values()).filter((s) => s.active);
  }

  /**
   * Close all sessions
   */
  closeSessions(force?: boolean): WorkerpoolPromise<void[], unknown> {
    const promises = Array.from(this.sessions.values()).map((session) =>
      session.close(force) as unknown as WorkerpoolPromise<void, unknown>
    );

    return WorkerpoolPromise.all(promises) as WorkerpoolPromise<void[], unknown>;
  }

  /**
   * Remove a session from tracking
   */
  removeSession(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      const workerSessions = this.workerSessions.get(session.workerIndex);
      if (workerSessions) {
        workerSessions.delete(id);
      }
      this.sessions.delete(id);
    }
  }

  /**
   * Select worker with least sessions for load balancing
   */
  private selectWorker(): number {
    const workerCount = this.pool.getWorkerCount();
    if (workerCount === 0) {
      return 0;
    }

    let minSessions = Infinity;
    let selectedWorker = 0;

    for (let i = 0; i < workerCount; i++) {
      const sessionCount = this.workerSessions.get(i)?.size ?? 0;
      if (sessionCount < minSessions) {
        minSessions = sessionCount;
        selectedWorker = i;
      }
    }

    return selectedWorker;
  }

  /**
   * Get session count
   */
  get sessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get session count for a specific worker
   */
  getWorkerSessionCount(workerIndex: number): number {
    return this.workerSessions.get(workerIndex)?.size ?? 0;
  }
}

export default SessionManager;
