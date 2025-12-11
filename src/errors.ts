/**
 * Workerpool Error Classes
 *
 * Provides specific error types for different failure scenarios.
 * All errors extend the base Error class for compatibility.
 */

// ============================================================================
// Base Errors
// ============================================================================

/**
 * Base class for all workerpool errors
 *
 * Provides a common interface and type discrimination.
 */
export abstract class WorkerpoolError extends Error {
  /** Error type identifier for type guards */
  abstract readonly type: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;

    // Maintain proper prototype chain in ES5
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /** Check if an error is a WorkerpoolError */
  static isWorkerpoolError(error: unknown): error is WorkerpoolError {
    return error instanceof WorkerpoolError;
  }
}

// ============================================================================
// Task Errors
// ============================================================================

/**
 * Error thrown when a task is cancelled
 */
export class CancellationError extends WorkerpoolError {
  readonly type = 'CancellationError' as const;

  constructor(message: string = 'Task was cancelled') {
    super(message);
  }

  static isCancellationError(error: unknown): error is CancellationError {
    return error instanceof CancellationError ||
      (error instanceof Error && error.name === 'CancellationError');
  }
}

/**
 * Error thrown when a task times out
 */
export class TimeoutError extends WorkerpoolError {
  readonly type = 'TimeoutError' as const;
  readonly timeout: number;

  constructor(message: string = 'Task timed out', timeout: number = 0) {
    super(message);
    this.timeout = timeout;
  }

  static isTimeoutError(error: unknown): error is TimeoutError {
    return error instanceof TimeoutError ||
      (error instanceof Error && error.name === 'TimeoutError');
  }
}

/**
 * Error thrown when worker terminates unexpectedly
 */
export class TerminationError extends WorkerpoolError {
  readonly type = 'TerminationError' as const;
  readonly exitCode?: number;

  constructor(message: string = 'Worker terminated unexpectedly', exitCode?: number) {
    super(message);
    this.exitCode = exitCode;
  }

  static isTerminationError(error: unknown): error is TerminationError {
    return error instanceof TerminationError ||
      (error instanceof Error && error.name === 'TerminationError');
  }
}

// ============================================================================
// Queue Errors
// ============================================================================

/**
 * Error thrown when queue capacity is exceeded
 */
export class QueueFullError extends WorkerpoolError {
  readonly type = 'QueueFullError' as const;
  readonly capacity: number;
  readonly size: number;

  constructor(capacity: number, size: number) {
    super(`Queue is full (capacity: ${capacity}, size: ${size})`);
    this.capacity = capacity;
    this.size = size;
  }

  static isQueueFullError(error: unknown): error is QueueFullError {
    return error instanceof QueueFullError;
  }
}

/**
 * Error thrown when trying to pop from empty queue
 */
export class QueueEmptyError extends WorkerpoolError {
  readonly type = 'QueueEmptyError' as const;

  constructor(message: string = 'Queue is empty') {
    super(message);
  }
}

// ============================================================================
// WASM Errors
// ============================================================================

/**
 * Error thrown when WASM is not available or not supported
 */
export class WasmNotAvailableError extends WorkerpoolError {
  readonly type = 'WasmNotAvailableError' as const;
  readonly reason: string;

  constructor(reason: string = 'WebAssembly is not available') {
    super(`WASM not available: ${reason}`);
    this.reason = reason;
  }

  static isWasmNotAvailableError(error: unknown): error is WasmNotAvailableError {
    return error instanceof WasmNotAvailableError;
  }
}

/**
 * Error thrown when shared memory is required but not available
 */
export class SharedMemoryNotAvailableError extends WorkerpoolError {
  readonly type = 'SharedMemoryNotAvailableError' as const;

  constructor(message: string = 'SharedArrayBuffer is not available. This may be due to missing COOP/COEP headers.') {
    super(message);
  }

  static isSharedMemoryNotAvailableError(error: unknown): error is SharedMemoryNotAvailableError {
    return error instanceof SharedMemoryNotAvailableError;
  }
}

/**
 * Error thrown when WASM module fails to initialize
 */
export class WasmInitializationError extends WorkerpoolError {
  readonly type = 'WasmInitializationError' as const;
  readonly cause?: Error;

  constructor(message: string = 'Failed to initialize WASM module', cause?: Error) {
    super(message);
    this.cause = cause;
  }

  static isWasmInitializationError(error: unknown): error is WasmInitializationError {
    return error instanceof WasmInitializationError;
  }
}

/**
 * Error thrown when WASM is used before initialization
 */
export class WasmNotInitializedError extends WorkerpoolError {
  readonly type = 'WasmNotInitializedError' as const;

  constructor(message: string = 'WASM not initialized. Call initWasmWorker() first.') {
    super(message);
  }
}

/**
 * Error thrown when WASM memory allocation fails
 */
export class WasmMemoryError extends WorkerpoolError {
  readonly type = 'WasmMemoryError' as const;
  readonly requestedBytes?: number;

  constructor(message: string = 'WASM memory allocation failed', requestedBytes?: number) {
    super(message);
    this.requestedBytes = requestedBytes;
  }
}

// ============================================================================
// Type Errors
// ============================================================================

/**
 * Error thrown when a type mismatch occurs
 */
export class TypeMismatchError extends WorkerpoolError {
  readonly type = 'TypeMismatchError' as const;
  readonly expected: string;
  readonly actual: string;
  readonly paramName?: string;

  constructor(expected: string, actual: string, paramName?: string) {
    const paramInfo = paramName ? ` for parameter "${paramName}"` : '';
    super(`Type mismatch${paramInfo}: expected ${expected}, got ${actual}`);
    this.expected = expected;
    this.actual = actual;
    this.paramName = paramName;
  }

  static isTypeMismatchError(error: unknown): error is TypeMismatchError {
    return error instanceof TypeMismatchError;
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends WorkerpoolError {
  readonly type = 'ValidationError' as const;
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(field ? `Validation failed for "${field}": ${message}` : message);
    this.field = field;
  }

  static isValidationError(error: unknown): error is ValidationError {
    return error instanceof ValidationError;
  }
}

// ============================================================================
// Worker Errors
// ============================================================================

/**
 * Error thrown when worker creation fails
 */
export class WorkerCreationError extends WorkerpoolError {
  readonly type = 'WorkerCreationError' as const;
  readonly workerType?: string;

  constructor(message: string = 'Failed to create worker', workerType?: string) {
    super(message);
    this.workerType = workerType;
  }
}

/**
 * Error thrown when no workers are available
 */
export class NoWorkersAvailableError extends WorkerpoolError {
  readonly type = 'NoWorkersAvailableError' as const;
  readonly requestedWorkers: number;
  readonly availableWorkers: number;

  constructor(requestedWorkers: number, availableWorkers: number) {
    super(`No workers available (requested: ${requestedWorkers}, available: ${availableWorkers})`);
    this.requestedWorkers = requestedWorkers;
    this.availableWorkers = availableWorkers;
  }
}

/**
 * Error thrown when worker method is not found
 */
export class MethodNotFoundError extends WorkerpoolError {
  readonly type = 'MethodNotFoundError' as const;
  readonly methodName: string;

  constructor(methodName: string) {
    super(`Method "${methodName}" not found in worker`);
    this.methodName = methodName;
  }

  static isMethodNotFoundError(error: unknown): error is MethodNotFoundError {
    return error instanceof MethodNotFoundError;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a human-readable error type name
 */
export function getErrorTypeName(error: unknown): string {
  if (error instanceof WorkerpoolError) {
    return error.type;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return typeof error;
}

/**
 * Wrap an unknown error in a WorkerpoolError
 */
export function wrapError(error: unknown, defaultMessage: string = 'Unknown error'): WorkerpoolError {
  if (error instanceof WorkerpoolError) {
    return error;
  }

  if (error instanceof Error) {
    // Create a generic WorkerpoolError with the original message
    const wrapped = new ValidationError(error.message || defaultMessage);
    wrapped.stack = error.stack;
    return wrapped;
  }

  return new ValidationError(String(error) || defaultMessage);
}

/**
 * Assert a condition, throwing TypeMismatchError if false
 */
export function assertType(
  condition: boolean,
  expected: string,
  actual: string,
  paramName?: string
): asserts condition {
  if (!condition) {
    throw new TypeMismatchError(expected, actual, paramName);
  }
}

/**
 * Type guard helpers for common types
 */
export const TypeGuards = {
  isNumber(value: unknown): value is number {
    return typeof value === 'number' && !Number.isNaN(value);
  },

  isString(value: unknown): value is string {
    return typeof value === 'string';
  },

  isFunction(value: unknown): value is Function {
    return typeof value === 'function';
  },

  isObject(value: unknown): value is object {
    return value !== null && typeof value === 'object';
  },

  isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  },

  isTypedArray(value: unknown): value is ArrayBufferView {
    return ArrayBuffer.isView(value);
  },

  isArrayBuffer(value: unknown): value is ArrayBuffer {
    return value instanceof ArrayBuffer;
  },

  isSharedArrayBuffer(value: unknown): value is SharedArrayBuffer {
    return typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer;
  },
};
