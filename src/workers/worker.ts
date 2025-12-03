/**
 * Worker Script - Runs inside worker process/thread
 *
 * Listens for RPC messages from the parent process and executes
 * registered methods or dynamic functions.
 */

import Transfer from '../platform/transfer';
import { WorkerpoolPromise } from '../core/Promise';
import type { SerializedError } from '../types/messages';

/** Special message to terminate worker */
const TERMINATE_METHOD_ID = '__workerpool-terminate__';

/** Special message to trigger cleanup */
const CLEANUP_METHOD_ID = '__workerpool-cleanup__';

/** Default timeout for abort listeners */
const TIMEOUT_DEFAULT = 1000;

/**
 * Worker registration options
 */
export interface WorkerRegisterOptions {
  /** Handler called before worker terminates */
  onTerminate?: (code: number) => void | Promise<void>;
  /** Timeout for abort listeners in milliseconds */
  abortListenerTimeout?: number;
}

/**
 * Public worker API available to registered methods
 */
export interface PublicWorkerAPI {
  /** Register an abort listener for cleanup on cancellation/timeout */
  addAbortListener: (listener: () => Promise<void>) => void;
  /** Emit an event to the main thread */
  emit: (payload: unknown) => void;
}

/**
 * Request message from parent
 */
interface WorkerRequest {
  id: number;
  method: string;
  params?: unknown[];
}

/**
 * Response message to parent
 */
interface WorkerResponse {
  id: number;
  result?: unknown;
  error?: SerializedError | null;
  method?: string;
}

/**
 * Event message to parent
 */
interface WorkerEventMessage {
  id: number;
  isEvent: true;
  payload: unknown;
}

/**
 * Worker method with attached public API
 */
type WorkerMethod = ((...args: unknown[]) => unknown) & {
  worker?: PublicWorkerAPI;
};

/**
 * Internal worker state and communication
 */
interface WorkerInternal {
  on: (event: string, callback: (data: unknown) => void) => void;
  send: (message: unknown, transfer?: Transferable[]) => void;
  exit: (code?: number) => void;
  methods: Record<string, WorkerMethod>;
  terminationHandler?: (code: number) => void | Promise<void>;
  abortListenerTimeout: number;
  abortListeners: Array<() => Promise<void>>;
  emit: (payload: unknown) => void;
  register: (methods?: Record<string, WorkerMethod>, options?: WorkerRegisterOptions) => void;
  terminateAndExit: (code: number) => void | Promise<void>;
  cleanup: (requestId: number) => Promise<void>;
}

// Internal worker state
const worker: WorkerInternal = {
  on: () => {},
  send: () => {},
  exit: () => {},
  methods: {},
  abortListenerTimeout: TIMEOUT_DEFAULT,
  abortListeners: [],
  emit: () => {},
  register: () => {},
  terminateAndExit: () => {},
  cleanup: async () => {},
};

// Current request ID for emit
let currentRequestId: number | null = null;

/**
 * Public worker API for registered methods
 */
const publicWorker: PublicWorkerAPI = {
  addAbortListener: (listener: () => Promise<void>): void => {
    worker.abortListeners.push(listener);
  },
  emit: (payload: unknown): void => {
    worker.emit(payload);
  },
};

// Setup communication based on environment
if (
  typeof self !== 'undefined' &&
  typeof postMessage === 'function' &&
  typeof addEventListener === 'function'
) {
  // Browser Web Worker
  worker.on = (event: string, callback: (data: unknown) => void): void => {
    addEventListener(event, (message: Event) => {
      callback((message as MessageEvent).data);
    });
  };

  worker.send = (message: unknown, transfer?: Transferable[]): void => {
    if (transfer) {
      postMessage(message, transfer);
    } else {
      postMessage(message);
    }
  };
} else if (typeof process !== 'undefined') {
  // Node.js environment
  let WorkerThreads: typeof import('worker_threads') | null = null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    WorkerThreads = require('worker_threads');
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
    ) {
      // No worker_threads, will use child_process
    } else {
      throw error;
    }
  }

  if (WorkerThreads && WorkerThreads.parentPort !== null) {
    // Worker thread
    const parentPort = WorkerThreads.parentPort;
    worker.send = (message: unknown, transfer?: Transferable[]): void => {
      if (transfer) {
        parentPort.postMessage(message, transfer as unknown as import('worker_threads').TransferListItem[]);
      } else {
        parentPort.postMessage(message);
      }
    };
    worker.on = parentPort.on.bind(parentPort) as WorkerInternal['on'];
    worker.exit = process.exit.bind(process);
  } else {
    // Child process
    worker.on = process.on.bind(process) as WorkerInternal['on'];
    worker.send = (message: unknown): void => {
      process.send!(message);
    };
    // Exit on disconnect from parent
    process.on('disconnect', () => {
      process.exit(1);
    });
    worker.exit = process.exit.bind(process);
  }
} else {
  throw new Error('Script must be executed as a worker');
}

/**
 * Convert error to serializable format
 */
function convertError(error: unknown): SerializedError {
  if (error && typeof error === 'object' && 'toJSON' in error) {
    return JSON.parse(JSON.stringify(error));
  }

  const err = error as Error;
  return JSON.parse(
    JSON.stringify(err, Object.getOwnPropertyNames(err))
  ) as SerializedError;
}

/**
 * Check if value is a promise
 */
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    'then' in value &&
    typeof value.then === 'function' &&
    'catch' in value &&
    typeof value.catch === 'function'
  );
}

/**
 * Built-in run method for dynamic function execution
 */
worker.methods.run = (function run(fn: string, args: unknown[]): unknown {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const f = new Function('return (' + fn + ').apply(this, arguments);') as WorkerMethod;
  f.worker = publicWorker;
  return f.apply(f, args);
}) as WorkerMethod;

/**
 * Built-in methods method to list available methods
 */
worker.methods.methods = function methods(): string[] {
  return Object.keys(worker.methods);
};

/**
 * Terminate worker and exit
 */
worker.terminateAndExit = function (code: number): void | Promise<void> {
  const exit = (): void => {
    worker.exit(code);
  };

  if (!worker.terminationHandler) {
    return exit();
  }

  const result = worker.terminationHandler(code);
  if (isPromise(result)) {
    result.then(exit, exit);
    return result;
  } else {
    exit();
    return new WorkerpoolPromise<void, Error>((_, reject) => {
      reject(new Error('Worker terminating'));
    });
  }
};

/**
 * Run cleanup/abort handlers
 */
worker.cleanup = function (requestId: number): Promise<void> {
  if (!worker.abortListeners.length) {
    worker.send({
      id: requestId,
      method: CLEANUP_METHOD_ID,
      error: convertError(new Error('Worker terminating')),
    } as WorkerResponse);
    return Promise.resolve();
  }

  const abort = (): void => {
    worker.abortListeners = [];
  };

  const exit = (): void => {
    worker.exit();
  };

  const promises = worker.abortListeners.map((listener) => listener());

  let timerId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<void>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error('Timeout occurred waiting for abort handler, killing worker'));
    }, worker.abortListenerTimeout);
  });

  const settlePromise = WorkerpoolPromise.all(
    promises.map((p) => new WorkerpoolPromise<void, unknown>((resolve, reject) => {
      p.then(() => resolve(), reject);
    }))
  ).then(
    () => {
      clearTimeout(timerId);
      abort();
    },
    () => {
      clearTimeout(timerId);
      exit();
    }
  );

  return new Promise<void>((resolve, reject) => {
    (settlePromise as Promise<void>).then(resolve, reject);
    timeoutPromise.then(resolve, reject);
  })
    .then(() => {
      worker.send({
        id: requestId,
        method: CLEANUP_METHOD_ID,
        error: null,
      } as WorkerResponse);
    })
    .catch((err: Error) => {
      worker.send({
        id: requestId,
        method: CLEANUP_METHOD_ID,
        error: err ? convertError(err) : null,
      } as WorkerResponse);
    });
};

/**
 * Emit event to parent
 */
worker.emit = function (payload: unknown): void {
  if (currentRequestId !== null) {
    if (payload instanceof Transfer) {
      worker.send(
        {
          id: currentRequestId,
          isEvent: true,
          payload: payload.message,
        } as WorkerEventMessage,
        payload.transfer
      );
      return;
    }

    worker.send({
      id: currentRequestId,
      isEvent: true,
      payload,
    } as WorkerEventMessage);
  }
};

/**
 * Register methods on the worker
 */
worker.register = function (
  methods?: Record<string, WorkerMethod>,
  options?: WorkerRegisterOptions
): void {
  if (methods) {
    for (const name in methods) {
      if (Object.prototype.hasOwnProperty.call(methods, name)) {
        worker.methods[name] = methods[name];
        worker.methods[name].worker = publicWorker;
      }
    }
  }

  if (options) {
    worker.terminationHandler = options.onTerminate;
    worker.abortListenerTimeout = options.abortListenerTimeout || TIMEOUT_DEFAULT;
  }

  worker.send('ready');
};

// Handle incoming messages
worker.on('message', (request: unknown) => {
  if (request === TERMINATE_METHOD_ID) {
    worker.terminateAndExit(0);
    return;
  }

  const req = request as WorkerRequest;

  if (req.method === CLEANUP_METHOD_ID) {
    worker.cleanup(req.id);
    return;
  }

  try {
    const method = worker.methods[req.method];

    if (method) {
      currentRequestId = req.id;

      const result = method.apply(method, req.params || []);

      if (isPromise(result)) {
        result
          .then((res: unknown) => {
            if (res instanceof Transfer) {
              worker.send(
                {
                  id: req.id,
                  result: res.message,
                  error: null,
                } as WorkerResponse,
                res.transfer
              );
            } else {
              worker.send({
                id: req.id,
                result: res,
                error: null,
              } as WorkerResponse);
            }
            currentRequestId = null;
          })
          .catch((err: Error) => {
            worker.send({
              id: req.id,
              result: null,
              error: convertError(err),
            } as WorkerResponse);
            currentRequestId = null;
          });
      } else {
        if (result instanceof Transfer) {
          worker.send(
            {
              id: req.id,
              result: result.message,
              error: null,
            } as WorkerResponse,
            result.transfer
          );
        } else {
          worker.send({
            id: req.id,
            result: result,
            error: null,
          } as WorkerResponse);
        }
        currentRequestId = null;
      }
    } else {
      throw new Error('Unknown method "' + req.method + '"');
    }
  } catch (err) {
    worker.send({
      id: req.id,
      result: null,
      error: convertError(err),
    } as WorkerResponse);
  }
});

// Exports for external use
export const add = worker.register;
export const emit = worker.emit;

export default {
  add: worker.register,
  emit: worker.emit,
};
