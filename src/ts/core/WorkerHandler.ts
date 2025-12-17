/**
 * WorkerHandler - Controls a single worker process/thread
 *
 * Handles message passing, task execution, timeouts, cancellation,
 * and graceful termination for child processes, worker threads, and web workers.
 */

import { WorkerpoolPromise, CancellationError, TimeoutError } from './Promise';
import type { Resolver, ExecOptions } from '../types/index';
import type {
  TaskRequest,
  TaskSuccessResponse,
  TaskErrorResponse,
  CleanupResponse,
  WorkerEvent,
  SerializedError,
} from '../types/messages';
import {
  validateOptions,
  forkOptsNames,
  workerThreadOptsNames,
  workerOptsNames,
} from './validateOptions';
import { platform } from '../platform/environment';

/** Special message to terminate worker */
export const TERMINATE_METHOD_ID = '__workerpool-terminate__';

/** Special message to trigger cleanup before potential termination */
export const CLEANUP_METHOD_ID = '__workerpool-cleanup__';

/**
 * Extended Worker interface for browser workers with Node.js-like API
 */
interface BrowserWorkerExtended extends Worker {
  isBrowserWorker: true;
  isWorkerThread?: false;
  isChildProcess?: false;
  ready: boolean;
  killed?: boolean;
  on: (event: string, callback: (data: unknown) => void) => void;
  send: (message: unknown, transfer?: Transferable[]) => void;
}

/**
 * Extended Worker interface for Node.js worker threads
 */
interface WorkerThreadExtended {
  isWorkerThread: true;
  isBrowserWorker?: false;
  isChildProcess?: false;
  ready: boolean;
  killed?: boolean;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  once: (event: string, callback: (...args: unknown[]) => void) => void;
  send: (message: unknown, transfer?: Transferable[]) => void;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  terminate: () => Promise<number>;
  kill: () => boolean;
  disconnect: () => void;
  emit: (event: string, data: unknown) => boolean;
  stdout?: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  removeAllListeners?: (event?: string) => void;
}

/**
 * Extended Worker interface for Node.js child processes
 */
interface ChildProcessExtended {
  isChildProcess: true;
  isBrowserWorker?: false;
  isWorkerThread?: false;
  ready: boolean;
  killed: boolean;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  once: (event: string, callback: (...args: unknown[]) => void) => void;
  send: (message: unknown) => boolean;
  kill: (signal?: string) => boolean;
  disconnect: () => void;
  removeAllListeners: (event?: string) => this;
  stdout?: NodeJS.ReadableStream;
  stderr?: NodeJS.ReadableStream;
  spawnargs?: string[];
  spawnfile?: string;
}

/** Union type for all worker types */
type WorkerInstance = BrowserWorkerExtended | WorkerThreadExtended | ChildProcessExtended;

/**
 * Worker type configuration
 */
export type WorkerType = 'auto' | 'web' | 'thread' | 'process';

/**
 * Options for WorkerHandler
 */
export interface WorkerHandlerOptions {
  workerType?: WorkerType;
  forkArgs?: string[];
  forkOpts?: Record<string, unknown>;
  workerOpts?: Record<string, unknown>;
  workerThreadOpts?: Record<string, unknown>;
  debugPort?: number;
  workerTerminateTimeout?: number;
  emitStdStreams?: boolean;
}

/**
 * Task being processed
 */
interface ProcessingTask<T = unknown> {
  id: number;
  resolver: Resolver<T>;
  options?: ExecOptions;
}

/**
 * Task being tracked for cleanup
 */
interface TrackingTask<T = unknown> extends ProcessingTask<T> {
  error: Error;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Queued request waiting for worker to be ready
 */
interface QueuedRequest {
  message: TaskRequest | string;
  transfer?: Transferable[];
}

/**
 * Error thrown when worker terminates unexpectedly
 */
export class TerminateError extends Error {
  cause?: Error;

  constructor(message = 'worker terminated', cause?: Error) {
    super(message);
    this.name = 'TerminateError';
    this.cause = cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TerminateError);
    }
  }
}

/**
 * Wrapper to denote a TimeoutError has been processed
 */
class WrappedTimeoutError extends Error {
  originalError: TimeoutError;

  constructor(timeoutError: TimeoutError) {
    super(timeoutError.message);
    this.name = 'WrappedTimeoutError';
    this.originalError = timeoutError;
    this.stack = new Error().stack || '';
  }
}

/**
 * Try to require worker_threads module
 */
function tryRequireWorkerThreads(): typeof import('worker_threads') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('worker_threads');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
    ) {
      return null;
    }
    throw error;
  }
}

/**
 * Ensure worker_threads is available
 */
export function ensureWorkerThreads(): typeof import('worker_threads') {
  const WorkerThreads = tryRequireWorkerThreads();
  if (!WorkerThreads) {
    throw new Error(
      "WorkerPool: workerType = 'thread' is not supported, Node >= 11.7.0 required"
    );
  }
  return WorkerThreads;
}

/**
 * Ensure Web Workers are supported
 */
function ensureWebWorker(): void {
  if (
    typeof Worker !== 'function' &&
    (typeof Worker !== 'object' ||
      typeof (Worker as unknown as { prototype: { constructor: unknown } }).prototype
        .constructor !== 'function')
  ) {
    throw new Error('WorkerPool: Web Workers not supported');
  }
}

/**
 * Get the default worker script
 */
function getDefaultWorker(): string {
  if (platform === 'browser') {
    if (typeof Blob === 'undefined') {
      throw new Error('Blob not supported by the browser');
    }
    if (
      typeof window === 'undefined' ||
      !window.URL ||
      typeof window.URL.createObjectURL !== 'function'
    ) {
      throw new Error('URL.createObjectURL not supported by the browser');
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const embeddedWorker = require('./generated/embeddedWorker');
    const blob = new Blob([embeddedWorker], { type: 'text/javascript' });
    return window.URL.createObjectURL(blob);
  } else {
    return __dirname + '/worker.js';
  }
}

/**
 * Setup a browser Web Worker
 */
function setupBrowserWorker(
  script: string,
  workerOpts: WorkerOptions | undefined,
  WorkerConstructor: typeof Worker
): BrowserWorkerExtended {
  validateOptions(workerOpts as Record<string, unknown>, workerOptsNames, 'workerOpts');

  const worker = new WorkerConstructor(script, workerOpts) as BrowserWorkerExtended;

  worker.isBrowserWorker = true;
  worker.ready = false;

  worker.on = function (event: string, callback: (data: unknown) => void): void {
    this.addEventListener(event, ((message: MessageEvent) => {
      callback(message.data);
    }) as EventListener);
  };

  worker.send = function (message: unknown, transfer?: Transferable[]): void {
    this.postMessage(message, transfer || []);
  };

  return worker;
}

/**
 * Setup a Node.js worker thread
 */
function setupWorkerThreadWorker(
  script: string,
  WorkerThreads: typeof import('worker_threads'),
  options: WorkerHandlerOptions
): WorkerThreadExtended {
  validateOptions(
    options?.workerThreadOpts as Record<string, unknown>,
    workerThreadOptsNames,
    'workerThreadOpts'
  );

  const worker = new WorkerThreads.Worker(script, {
    stdout: options?.emitStdStreams ?? false,
    stderr: options?.emitStdStreams ?? false,
    ...options?.workerThreadOpts,
  }) as unknown as WorkerThreadExtended;

  worker.isWorkerThread = true;
  worker.ready = false;

  worker.send = function (message: unknown, transfer?: Transferable[]): void {
    this.postMessage(message, transfer);
  };

  worker.kill = function (): boolean {
    this.terminate();
    return true;
  };

  worker.disconnect = function (): void {
    this.terminate();
  };

  if (options?.emitStdStreams && worker.stdout && worker.stderr) {
    worker.stdout.on('data', (data: Buffer) => worker.emit('stdout', data));
    worker.stderr.on('data', (data: Buffer) => worker.emit('stderr', data));
  }

  return worker;
}

/**
 * Resolve fork options with debug flags
 */
function resolveForkOptions(opts: WorkerHandlerOptions): WorkerHandlerOptions & {
  forkOpts: Record<string, unknown>;
} {
  const processExecArgv = process.execArgv.join(' ');
  const inspectorActive = processExecArgv.indexOf('--inspect') !== -1;
  const debugBrk = processExecArgv.indexOf('--debug-brk') !== -1;

  const execArgv: string[] = [];
  if (inspectorActive) {
    execArgv.push('--inspect=' + opts.debugPort);
    if (debugBrk) {
      execArgv.push('--debug-brk');
    }
  }

  process.execArgv.forEach((arg) => {
    if (arg.indexOf('--max-old-space-size') > -1) {
      execArgv.push(arg);
    }
  });

  const forkOpts = opts.forkOpts || {};

  return {
    ...opts,
    forkArgs: opts.forkArgs,
    forkOpts: {
      ...forkOpts,
      execArgv: [...((forkOpts.execArgv as string[]) || []), ...execArgv],
      stdio: opts.emitStdStreams ? 'pipe' : undefined,
    },
  };
}

/**
 * Setup a Node.js child process worker
 */
function setupProcessWorker(
  script: string,
  options: WorkerHandlerOptions & { forkOpts: Record<string, unknown> },
  childProcess: typeof import('child_process')
): ChildProcessExtended {
  validateOptions(options.forkOpts, forkOptsNames, 'forkOpts');

  const worker = childProcess.fork(
    script,
    options.forkArgs || [],
    options.forkOpts
  ) as unknown as ChildProcessExtended;

  const originalSend = worker.send.bind(worker);
  worker.send = function (message: unknown): boolean {
    return originalSend(message);
  };

  if (options.emitStdStreams && worker.stdout && worker.stderr) {
    worker.stdout.on('data', (data: Buffer) => {
      (worker as unknown as NodeJS.EventEmitter).emit('stdout', data);
    });
    worker.stderr.on('data', (data: Buffer) => {
      (worker as unknown as NodeJS.EventEmitter).emit('stderr', data);
    });
  }

  worker.isChildProcess = true;
  worker.ready = false;

  return worker;
}

/**
 * Setup a worker based on configuration
 */
function setupWorker(script: string, options: WorkerHandlerOptions): WorkerInstance {
  if (options.workerType === 'web') {
    ensureWebWorker();
    return setupBrowserWorker(script, options.workerOpts, Worker);
  } else if (options.workerType === 'thread') {
    const WorkerThreads = ensureWorkerThreads();
    return setupWorkerThreadWorker(script, WorkerThreads, options);
  } else if (options.workerType === 'process' || !options.workerType) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return setupProcessWorker(script, resolveForkOptions(options), require('child_process'));
  } else {
    // auto detection
    if (platform === 'browser') {
      ensureWebWorker();
      return setupBrowserWorker(script, options.workerOpts, Worker);
    } else {
      const WorkerThreads = tryRequireWorkerThreads();
      if (WorkerThreads) {
        return setupWorkerThreadWorker(script, WorkerThreads, options);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return setupProcessWorker(script, resolveForkOptions(options), require('child_process'));
      }
    }
  }
}

/**
 * Convert serialized error back to Error object
 */
function objectToError(obj: SerializedError): Error {
  const error = new Error(obj.message || '');
  Object.assign(error, obj);
  return error;
}

/**
 * Handle emitted stdout/stderr from worker
 */
function handleEmittedStdPayload(
  handler: WorkerHandler,
  payload: { stdout?: string; stderr?: string }
): void {
  const processTask = (task: ProcessingTask | undefined) => {
    if (task?.options?.on) {
      task.options.on(payload);
    }
  };

  Object.values(handler.processing).forEach(processTask);
  Object.values(handler.tracking).forEach(processTask);
}

/**
 * WorkerHandler - Controls a single worker
 */
export class WorkerHandler {
  /** Path to worker script */
  readonly script: string;

  /** The worker instance */
  worker: WorkerInstance | null;

  /** Debug port for this worker */
  readonly debugPort?: number;

  /** Fork options */
  readonly forkOpts?: Record<string, unknown>;

  /** Fork arguments */
  readonly forkArgs?: string[];

  /** Worker options (browser) */
  readonly workerOpts?: WorkerOptions;

  /** Worker thread options */
  readonly workerThreadOpts?: Record<string, unknown>;

  /** Timeout for worker termination */
  readonly workerTerminateTimeout: number;

  /** Queue of requests waiting for worker ready */
  private requestQueue: QueuedRequest[] = [];

  /** Tasks currently being processed */
  processing: Record<number, ProcessingTask> = Object.create(null);

  /** Tasks being tracked for cleanup */
  tracking: Record<number, TrackingTask> = Object.create(null);

  /** Whether termination is in progress */
  private terminating = false;

  /** Whether worker has been terminated */
  terminated = false;

  /** Whether cleanup is in progress */
  private cleaning = false;

  /** Callback for termination completion */
  private terminationHandler: ((err: Error | null, handler: WorkerHandler) => void) | null =
    null;

  /** Last task ID used */
  private lastId = 0;

  constructor(script?: string, options: WorkerHandlerOptions = {}) {
    this.script = script || getDefaultWorker();
    this.worker = setupWorker(this.script, options);
    this.debugPort = options.debugPort;
    this.forkOpts = options.forkOpts;
    this.forkArgs = options.forkArgs;
    this.workerOpts = options.workerOpts;
    this.workerThreadOpts = options.workerThreadOpts;
    this.workerTerminateTimeout = options.workerTerminateTimeout || 1000;

    // Default script doesn't send ready message
    if (!script) {
      this.worker.ready = true;
    }

    this.setupListeners();
  }

  /**
   * Setup worker event listeners
   */
  private setupListeners(): void {
    const me = this;
    const worker = this.worker!;

    // Handle stdout/stderr
    worker.on('stdout', (data: unknown) => {
      handleEmittedStdPayload(me, { stdout: String(data) });
    });

    worker.on('stderr', (data: unknown) => {
      handleEmittedStdPayload(me, { stderr: String(data) });
    });

    // Handle messages
    worker.on('message', (response: unknown) => {
      if (me.terminated) {
        return;
      }

      if (typeof response === 'string' && response === 'ready') {
        worker.ready = true;
        me.dispatchQueuedRequests();
      } else {
        me.handleMessage(response as TaskSuccessResponse | TaskErrorResponse | WorkerEvent | CleanupResponse);
      }
    });

    // Handle errors
    worker.on('error', (error: unknown) => {
      const err = error as Error;
      const message = err?.message ? err.message : String(error || 'Unknown worker error');
      me.onError(new TerminateError('Workerpool Worker error: ' + message, err));
    });

    // Handle exit
    worker.on('exit', (exitCode: unknown, signalCode: unknown) => {
      let message = 'Workerpool Worker terminated Unexpectedly\n';
      message += `    exitCode: \`${exitCode}\`\n`;
      message += `    signalCode: \`${signalCode}\`\n`;
      message += `    workerpool.script: \`${me.script}\`\n`;

      const proc = worker as ChildProcessExtended;
      if (proc.spawnargs) {
        message += `    spawnArgs: \`${proc.spawnargs}\`\n`;
      }
      if (proc.spawnfile) {
        message += `    spawnfile: \`${proc.spawnfile}\`\n`;
      }

      me.onError(new TerminateError(message));
    });
  }

  /**
   * Handle incoming message from worker
   */
  private handleMessage(
    response: TaskSuccessResponse | TaskErrorResponse | WorkerEvent | CleanupResponse
  ): void {
    const id = response.id;
    const task = this.processing[id];

    if (task !== undefined) {
      if ('isEvent' in response && response.isEvent) {
        // Worker event
        if (task.options?.on) {
          task.options.on(response.payload);
        }
      } else {
        // Task completed
        delete this.processing[id];

        if (this.terminating) {
          this.terminate();
        }

        if ('error' in response && response.error) {
          task.resolver.reject(objectToError(response.error));
        } else if ('result' in response) {
          task.resolver.resolve(response.result);
        }
      }
    } else {
      // Check tracked tasks
      const trackedTask = this.tracking[id];
      if (trackedTask !== undefined) {
        if ('isEvent' in response && response.isEvent) {
          if (trackedTask.options?.on) {
            trackedTask.options.on(response.payload);
          }
        }
      }
    }

    // Handle cleanup response
    if ('method' in response && response.method === CLEANUP_METHOD_ID) {
      const trackedTask = this.tracking[id];
      if (trackedTask !== undefined) {
        if (trackedTask.timeoutId) {
          clearTimeout(trackedTask.timeoutId);
        }

        if ('error' in response && response.error) {
          trackedTask.resolver.reject(objectToError(response.error as SerializedError));
        } else {
          trackedTask.resolver.reject(new WrappedTimeoutError(trackedTask.error as TimeoutError));
        }
      }
      delete this.tracking[id];
    }
  }

  /**
   * Handle worker error
   */
  private onError(error: Error): void {
    this.terminated = true;

    for (const id in this.processing) {
      if (this.processing[id] !== undefined) {
        this.processing[id].resolver.reject(error);
      }
    }

    this.processing = Object.create(null);
  }

  /**
   * Dispatch queued requests to worker
   */
  private dispatchQueuedRequests(): void {
    const requests = this.requestQueue.splice(0);
    for (const request of requests) {
      this.worker!.send(request.message, request.transfer);
    }
  }

  /**
   * Get list of methods available on the worker
   */
  methods(): WorkerpoolPromise<string[], Error> {
    return this.exec('methods') as WorkerpoolPromise<string[], Error>;
  }

  /**
   * Execute a method on the worker
   */
  exec<T = unknown>(
    method: string,
    params?: unknown[],
    resolver?: Resolver<T>,
    options?: ExecOptions
  ): WorkerpoolPromise<T, Error> {
    if (!resolver) {
      resolver = WorkerpoolPromise.defer<T>();
    }

    const id = ++this.lastId;

    this.processing[id] = {
      id,
      resolver: resolver as Resolver<unknown>,
      options,
    };

    const request: TaskRequest = {
      id,
      method,
      params: params || [],
    };

    const queuedRequest: QueuedRequest = {
      message: request,
      transfer: options?.transfer,
    };

    if (this.terminated) {
      resolver.reject(new TerminateError('Worker is terminated'));
    } else if (this.worker!.ready) {
      this.worker!.send(queuedRequest.message, queuedRequest.transfer);
    } else {
      this.requestQueue.push(queuedRequest);
    }

    // Handle cancellation and timeout
    const me = this;
    return resolver.promise.catch((error: unknown) => {
      if (error instanceof CancellationError || error instanceof TimeoutError) {
        const trackingResolver = WorkerpoolPromise.defer<T>();

        me.tracking[id] = {
          id,
          resolver: trackingResolver as Resolver<unknown>,
          options,
          error: error as Error,
        };

        delete me.processing[id];

        trackingResolver.promise = trackingResolver.promise.catch((err: unknown) => {
          delete me.tracking[id];

          if (err instanceof WrappedTimeoutError) {
            throw err.originalError;
          }

          return me.terminateAndNotify(true).then(
            () => {
              throw err;
            },
            (termErr) => {
              throw termErr;
            }
          );
        }) as WorkerpoolPromise<T, Error>;

        me.worker!.send({
          id,
          method: CLEANUP_METHOD_ID,
        });

        me.tracking[id].timeoutId = setTimeout(() => {
          if (me.tracking[id]) {
            me.tracking[id].resolver.reject(error);
          }
        }, me.workerTerminateTimeout);

        return trackingResolver.promise;
      } else {
        throw error;
      }
    }) as WorkerpoolPromise<T, Error>;
  }

  /**
   * Check if worker is busy
   */
  busy(): boolean {
    return this.cleaning || Object.keys(this.processing).length > 0;
  }

  /**
   * Terminate the worker
   */
  terminate(force?: boolean, callback?: (err: Error | null, handler: WorkerHandler) => void): void {
    const me = this;

    if (force) {
      for (const id in this.processing) {
        if (this.processing[id] !== undefined) {
          this.processing[id].resolver.reject(new Error('Worker terminated'));
        }
      }
      this.processing = Object.create(null);
    }

    // Cancel tracked tasks
    for (const task of Object.values(me.tracking)) {
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
      task.resolver.reject(new Error('Worker Terminating'));
    }
    me.tracking = Object.create(null);

    if (typeof callback === 'function') {
      this.terminationHandler = callback;
    }

    if (!this.busy()) {
      const cleanup = (err?: Error | null): void => {
        me.terminated = true;
        me.cleaning = false;

        if (me.worker && 'removeAllListeners' in me.worker && me.worker.removeAllListeners) {
          me.worker.removeAllListeners('message');
        }
        me.worker = null;
        me.terminating = false;

        if (me.terminationHandler) {
          me.terminationHandler(err || null, me);
        } else if (err) {
          throw err;
        }
      };

      if (this.worker) {
        if ('kill' in this.worker && typeof this.worker.kill === 'function') {
          if (this.worker.killed) {
            cleanup(new Error('worker already killed!'));
            return;
          }

          const cleanExitTimeout = setTimeout(() => {
            if (me.worker && 'kill' in me.worker) {
              me.worker.kill();
            }
          }, this.workerTerminateTimeout);

          this.worker.once('exit', () => {
            clearTimeout(cleanExitTimeout);
            if (me.worker) {
              me.worker.killed = true;
            }
            cleanup();
          });

          if (this.worker.ready) {
            this.worker.send(TERMINATE_METHOD_ID);
          } else {
            this.requestQueue.push({ message: TERMINATE_METHOD_ID });
          }

          this.cleaning = true;
          return;
        } else if ('terminate' in this.worker && typeof this.worker.terminate === 'function') {
          this.worker.terminate();
          this.worker.killed = true;
        } else {
          throw new Error('Failed to terminate worker');
        }
      }
      cleanup();
    } else {
      this.terminating = true;
    }
  }

  /**
   * Terminate the worker and return a promise
   */
  terminateAndNotify(force?: boolean, timeout?: number): WorkerpoolPromise<WorkerHandler, unknown> {
    const resolver = WorkerpoolPromise.defer<WorkerHandler>();

    if (timeout) {
      resolver.promise.timeout(timeout);
    }

    this.terminate(force, (err, worker) => {
      if (err) {
        resolver.reject(err);
      } else {
        resolver.resolve(worker);
      }
    });

    return resolver.promise as WorkerpoolPromise<WorkerHandler, unknown>;
  }
}

// Export for testing
export const _tryRequireWorkerThreads = tryRequireWorkerThreads;
export const _setupProcessWorker = setupProcessWorker;
export const _setupBrowserWorker = setupBrowserWorker;
export const _setupWorkerThreadWorker = setupWorkerThreadWorker;

export default WorkerHandler;
