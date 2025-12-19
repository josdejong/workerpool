/**
 * Core Type Definitions
 *
 * This file contains the fundamental types that are shared across
 * multiple type definition files to avoid circular dependencies.
 */

/**
 * Options for task execution
 * @template T - Task metadata type
 */
export interface ExecOptions<T = unknown> {
  /**
   * Event listener for worker-emitted events during execution
   */
  on?: (payload: unknown) => void;

  /**
   * Transferable objects to send to worker (zero-copy transfer).
   * Not supported by 'process' worker type.
   */
  transfer?: Transferable[];

  /**
   * Custom metadata attached to the task.
   * Useful for custom queue implementations (e.g., priority).
   */
  metadata?: T;
}

/**
 * Workerpool Promise interface with cancel and timeout support
 * @template T - Resolved value type
 * @template E - Error type
 */
export interface WorkerpoolPromise<T, E = unknown> extends Promise<T> {
  /** Whether the promise has been resolved */
  readonly resolved: boolean;
  /** Whether the promise has been rejected */
  readonly rejected: boolean;
  /** Whether the promise is still pending */
  readonly pending: boolean;

  /**
   * Cancel the promise, rejecting with CancellationError
   */
  cancel(): this;

  /**
   * Set a timeout for the promise.
   * Rejects with TimeoutError if not resolved within delay.
   * @param delay - Timeout in milliseconds
   */
  timeout(delay: number): this;

  /**
   * Execute callback when promise resolves or rejects
   * @deprecated Use finally() instead
   */
  always<TResult>(fn: () => TResult | PromiseLike<TResult>): WorkerpoolPromise<TResult, unknown>;
}
