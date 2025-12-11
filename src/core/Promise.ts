/**
 * WorkerpoolPromise - Custom Promise implementation with cancel and timeout support
 *
 * Inspired by https://gist.github.com/RubaXa/8501359 from RubaXa <trash@rubaxa.org>
 *
 * @template T - The type of the resolved value
 * @template E - The type of the rejection error (defaults to Error)
 */

import type { Resolver, WorkerpoolPromise as IWorkerpoolPromise } from '../types/index';

/**
 * Cancellation error thrown when a promise is cancelled
 */
export class CancellationError extends Error {
  constructor(message = 'promise cancelled') {
    super(message);
    this.name = 'CancellationError';

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CancellationError);
    }
  }
}

/**
 * Timeout error thrown when a promise times out
 */
export class TimeoutError extends Error {
  constructor(message = 'timeout exceeded') {
    super(message);
    this.name = 'TimeoutError';

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TimeoutError);
    }
  }
}

/**
 * Handler callback types
 */
type ResolveHandler<T> = (value: T) => void;
type RejectHandler<E> = (error: E) => void;
type Executor<T, E> = (
  resolve: ResolveHandler<T>,
  reject: RejectHandler<E>
) => void;

/**
 * Execute callback, then resolve or reject based on result
 */
function createThenHandler<TIn, TOut>(
  callback: (value: TIn) => TOut | PromiseLike<TOut>,
  resolve: (value: TOut) => void,
  reject: (error: unknown) => void
): (value: TIn) => void {
  return (result: TIn): void => {
    try {
      const res = callback(result);
      // Check if result is a promise-like object
      if (
        res !== null &&
        typeof res === 'object' &&
        'then' in res &&
        typeof res.then === 'function'
      ) {
        // Result is a promise - chain it
        (res as PromiseLike<TOut>).then(resolve, reject);
      } else {
        resolve(res as TOut);
      }
    } catch (error) {
      reject(error);
    }
  };
}

/**
 * WorkerpoolPromise - Custom Promise with cancel and timeout support
 */
export class WorkerpoolPromise<T, E = Error> implements IWorkerpoolPromise<T, E> {
  /** Static reference to CancellationError for backward compatibility */
  static CancellationError: typeof CancellationError = CancellationError;

  /** Static reference to TimeoutError for backward compatibility */
  static TimeoutError: typeof TimeoutError = TimeoutError;

  private _onSuccess: Array<ResolveHandler<T>> = [];
  private _onFail: Array<RejectHandler<E>> = [];
  private _resolved = false;
  private _rejected = false;
  private _pending = true;
  private _result?: T;
  private _error?: E;
  private _parent?: WorkerpoolPromise<unknown, unknown>;

  /** Whether the promise has been resolved */
  get resolved(): boolean {
    return this._resolved;
  }

  /** Whether the promise has been rejected */
  get rejected(): boolean {
    return this._rejected;
  }

  /** Whether the promise is still pending */
  get pending(): boolean {
    return this._pending;
  }

  /** Symbol.toStringTag for proper Promise identification */
  readonly [Symbol.toStringTag] = 'Promise';

  /**
   * Create a new WorkerpoolPromise
   * @param handler - Executor function called with (resolve, reject)
   * @param parent - Parent promise for cancel/timeout propagation
   */
  constructor(
    handler: Executor<T, E>,
    parent?: WorkerpoolPromise<unknown, unknown>
  ) {
    if (typeof handler !== 'function') {
      throw new SyntaxError('Function parameter handler(resolve, reject) missing');
    }

    this._parent = parent;

    // Create resolve and reject functions
    const resolve: ResolveHandler<T> = (result: T) => {
      if (!this._pending) return;

      this._resolved = true;
      this._rejected = false;
      this._pending = false;
      this._result = result;

      // Execute all success handlers
      for (const fn of this._onSuccess) {
        fn(result);
      }
    };

    const reject: RejectHandler<E> = (error: E) => {
      if (!this._pending) return;

      this._resolved = false;
      this._rejected = true;
      this._pending = false;
      this._error = error;

      // Execute all fail handlers
      for (const fn of this._onFail) {
        fn(error);
      }
    };

    // Execute the handler
    handler(resolve, reject);
  }

  /**
   * Add success and optional failure handlers
   */
  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: E) => TResult2 | PromiseLike<TResult2>) | null
  ): WorkerpoolPromise<TResult1 | TResult2, unknown> {
    return new WorkerpoolPromise<TResult1 | TResult2, unknown>(
      (resolve, reject) => {
        const successHandler = onFulfilled
          ? createThenHandler(onFulfilled, resolve, reject)
          : (resolve as unknown as ResolveHandler<T>);

        const failHandler = onRejected
          ? createThenHandler(onRejected, resolve, reject)
          : (reject as unknown as RejectHandler<E>);

        // If already settled, execute immediately
        if (this._resolved) {
          successHandler(this._result as T);
        } else if (this._rejected) {
          failHandler(this._error as E);
        } else {
          // Still pending, queue handlers
          this._onSuccess.push(successHandler as ResolveHandler<T>);
          this._onFail.push(failHandler as RejectHandler<E>);
        }
      },
      this as unknown as WorkerpoolPromise<unknown, unknown>
    );
  }

  /**
   * Add a rejection handler
   */
  catch<TResult = never>(
    onRejected?: ((reason: E) => TResult | PromiseLike<TResult>) | null
  ): WorkerpoolPromise<T | TResult, unknown> {
    return this.then(null, onRejected);
  }

  /**
   * Add a handler that runs regardless of resolution or rejection
   */
  finally(onFinally?: (() => void) | null): WorkerpoolPromise<T, E> {
    const handler = (): WorkerpoolPromise<T, E> => {
      return new WorkerpoolPromise<void, never>((resolve) => resolve())
        .then(onFinally)
        .then(() => this) as unknown as WorkerpoolPromise<T, E>;
    };

    return this.then(handler, handler) as unknown as WorkerpoolPromise<T, E>;
  }

  /**
   * Execute callback when promise resolves or rejects
   * @deprecated Use finally() instead
   */
  always<TResult>(
    fn: () => TResult | PromiseLike<TResult>
  ): WorkerpoolPromise<TResult, unknown> {
    return this.then(fn, fn as unknown as (reason: E) => TResult) as unknown as WorkerpoolPromise<TResult, unknown>;
  }

  /**
   * Cancel the promise, rejecting with CancellationError
   * Propagates to parent promise if exists
   */
  cancel(): this {
    if (this._parent) {
      this._parent.cancel();
    } else if (this._pending) {
      // Reject with cancellation error
      this._resolved = false;
      this._rejected = true;
      this._pending = false;
      this._error = new CancellationError() as unknown as E;

      for (const fn of this._onFail) {
        fn(this._error);
      }
    }
    return this;
  }

  /**
   * Set a timeout for the promise
   * Rejects with TimeoutError if not resolved within delay
   * @param delay - Timeout in milliseconds
   */
  timeout(delay: number): this {
    if (this._parent) {
      this._parent.timeout(delay);
    } else {
      const timer = setTimeout(() => {
        if (this._pending) {
          this._resolved = false;
          this._rejected = true;
          this._pending = false;
          this._error = new TimeoutError(
            `Promise timed out after ${delay} ms`
          ) as unknown as E;

          for (const fn of this._onFail) {
            fn(this._error);
          }
        }
      }, delay);

      // Clear timeout when promise settles
      this.always(() => {
        clearTimeout(timer);
      });
    }
    return this;
  }

  /**
   * Create a promise that resolves when all provided promises resolve
   */
  static all<T>(promises: Array<WorkerpoolPromise<T, unknown>>): WorkerpoolPromise<T[], Error> {
    return new WorkerpoolPromise<T[], Error>((resolve, reject) => {
      if (promises.length === 0) {
        resolve([]);
        return;
      }

      let remaining = promises.length;
      const results: T[] = new Array(promises.length);
      let rejected = false;

      promises.forEach((promise, index) => {
        promise.then(
          (result) => {
            if (rejected) return;
            results[index] = result;
            remaining--;
            if (remaining === 0) {
              resolve(results);
            }
          },
          (error) => {
            if (rejected) return;
            rejected = true;
            remaining = 0;
            reject(error as Error);
          }
        );
      });
    });
  }

  /**
   * Create a deferred promise with external resolve/reject functions
   */
  static defer<T>(): Resolver<T> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (error: Error) => void;

    const promise = new WorkerpoolPromise<T, Error>((res, rej) => {
      resolve = res as (value: T | PromiseLike<T>) => void;
      reject = rej;
    });

    return { promise, resolve, reject };
  }

  /**
   * Create a promise that resolves with the given value
   */
  static resolve<T>(value: T | PromiseLike<T>): WorkerpoolPromise<T, never> {
    return new WorkerpoolPromise<T, never>((resolve) => {
      resolve(value as T);
    });
  }

  /**
   * Create a promise that rejects with the given error
   */
  static reject<E = Error>(error: E): WorkerpoolPromise<never, E> {
    return new WorkerpoolPromise<never, E>((_, reject) => {
      reject(error);
    });
  }
}

/**
 * Default export for backward compatibility
 */
export default WorkerpoolPromise;
