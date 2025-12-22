/**
 * Standardized Error Codes
 *
 * Provides consistent error identification across the messaging protocol.
 * These codes enable better debugging, monitoring, and error handling.
 */

/**
 * Error code categories:
 * - 1xxx: Worker/Pool errors
 * - 2xxx: Message/Protocol errors
 * - 3xxx: Task execution errors
 * - 4xxx: Resource errors
 * - 5xxx: Network/Communication errors
 */

/**
 * Worker and Pool error codes
 */
export enum WorkerErrorCode {
  /** Worker process crashed unexpectedly */
  WORKER_CRASHED = 1001,
  /** Worker failed to initialize */
  WORKER_INIT_FAILED = 1002,
  /** Worker is unresponsive (heartbeat timeout) */
  WORKER_UNRESPONSIVE = 1003,
  /** Worker terminated unexpectedly */
  WORKER_TERMINATED = 1004,
  /** No workers available in pool */
  NO_WORKERS_AVAILABLE = 1005,
  /** Pool is terminated */
  POOL_TERMINATED = 1006,
  /** Pool is full (max queue reached) */
  POOL_QUEUE_FULL = 1007,
  /** Worker spawn failed */
  WORKER_SPAWN_FAILED = 1008,
  /** Worker type not supported */
  WORKER_TYPE_UNSUPPORTED = 1009,
}

/**
 * Message and Protocol error codes
 */
export enum ProtocolErrorCode {
  /** Invalid message format */
  INVALID_MESSAGE = 2001,
  /** Unknown message type */
  UNKNOWN_MESSAGE_TYPE = 2002,
  /** Protocol version mismatch */
  VERSION_MISMATCH = 2003,
  /** Message too large */
  MESSAGE_TOO_LARGE = 2004,
  /** Serialization failed */
  SERIALIZATION_FAILED = 2005,
  /** Deserialization failed */
  DESERIALIZATION_FAILED = 2006,
  /** Missing required field */
  MISSING_FIELD = 2007,
  /** Invalid message ID */
  INVALID_MESSAGE_ID = 2008,
  /** Duplicate message ID */
  DUPLICATE_MESSAGE_ID = 2009,
  /** Message sequence error */
  SEQUENCE_ERROR = 2010,
}

/**
 * Task execution error codes
 */
export enum TaskErrorCode {
  /** Method not found in worker */
  METHOD_NOT_FOUND = 3001,
  /** Invalid parameters */
  INVALID_PARAMS = 3002,
  /** Task execution failed */
  EXECUTION_FAILED = 3003,
  /** Task was cancelled */
  CANCELLED = 3004,
  /** Task timed out */
  TIMEOUT = 3005,
  /** Task rejected (e.g., validation) */
  REJECTED = 3006,
  /** Function serialization failed */
  FUNCTION_SERIALIZE_FAILED = 3007,
  /** Function deserialization failed */
  FUNCTION_DESERIALIZE_FAILED = 3008,
  /** Task aborted by cleanup */
  ABORTED = 3009,
  /** Internal task error */
  INTERNAL_ERROR = 3010,
}

/**
 * Resource error codes
 */
export enum ResourceErrorCode {
  /** Out of memory */
  OUT_OF_MEMORY = 4001,
  /** SharedArrayBuffer not available */
  SAB_UNAVAILABLE = 4002,
  /** Atomics not available */
  ATOMICS_UNAVAILABLE = 4003,
  /** WASM not supported */
  WASM_UNSUPPORTED = 4004,
  /** Transferable object error */
  TRANSFER_FAILED = 4005,
  /** Buffer overflow */
  BUFFER_OVERFLOW = 4006,
  /** Resource limit exceeded */
  LIMIT_EXCEEDED = 4007,
  /** Secure context required */
  SECURE_CONTEXT_REQUIRED = 4008,
}

/**
 * Communication error codes
 */
export enum CommunicationErrorCode {
  /** Connection failed */
  CONNECTION_FAILED = 5001,
  /** Connection lost */
  CONNECTION_LOST = 5002,
  /** Send failed */
  SEND_FAILED = 5003,
  /** Receive failed */
  RECEIVE_FAILED = 5004,
  /** Channel closed */
  CHANNEL_CLOSED = 5005,
  /** IPC error */
  IPC_ERROR = 5006,
  /** Backpressure limit exceeded */
  BACKPRESSURE_EXCEEDED = 5007,
}

/**
 * All error codes union type
 */
export type ErrorCode =
  | WorkerErrorCode
  | ProtocolErrorCode
  | TaskErrorCode
  | ResourceErrorCode
  | CommunicationErrorCode;

/**
 * Error code to human-readable message mapping
 */
export const ErrorMessages: Record<ErrorCode, string> = {
  // Worker errors
  [WorkerErrorCode.WORKER_CRASHED]: 'Worker process crashed unexpectedly',
  [WorkerErrorCode.WORKER_INIT_FAILED]: 'Worker failed to initialize',
  [WorkerErrorCode.WORKER_UNRESPONSIVE]: 'Worker is unresponsive',
  [WorkerErrorCode.WORKER_TERMINATED]: 'Worker terminated unexpectedly',
  [WorkerErrorCode.NO_WORKERS_AVAILABLE]: 'No workers available in pool',
  [WorkerErrorCode.POOL_TERMINATED]: 'Pool has been terminated',
  [WorkerErrorCode.POOL_QUEUE_FULL]: 'Pool queue is full',
  [WorkerErrorCode.WORKER_SPAWN_FAILED]: 'Failed to spawn worker',
  [WorkerErrorCode.WORKER_TYPE_UNSUPPORTED]: 'Worker type not supported',

  // Protocol errors
  [ProtocolErrorCode.INVALID_MESSAGE]: 'Invalid message format',
  [ProtocolErrorCode.UNKNOWN_MESSAGE_TYPE]: 'Unknown message type',
  [ProtocolErrorCode.VERSION_MISMATCH]: 'Protocol version mismatch',
  [ProtocolErrorCode.MESSAGE_TOO_LARGE]: 'Message exceeds size limit',
  [ProtocolErrorCode.SERIALIZATION_FAILED]: 'Failed to serialize message',
  [ProtocolErrorCode.DESERIALIZATION_FAILED]: 'Failed to deserialize message',
  [ProtocolErrorCode.MISSING_FIELD]: 'Required field missing',
  [ProtocolErrorCode.INVALID_MESSAGE_ID]: 'Invalid message ID',
  [ProtocolErrorCode.DUPLICATE_MESSAGE_ID]: 'Duplicate message ID',
  [ProtocolErrorCode.SEQUENCE_ERROR]: 'Message sequence error',

  // Task errors
  [TaskErrorCode.METHOD_NOT_FOUND]: 'Method not found in worker',
  [TaskErrorCode.INVALID_PARAMS]: 'Invalid parameters',
  [TaskErrorCode.EXECUTION_FAILED]: 'Task execution failed',
  [TaskErrorCode.CANCELLED]: 'Task was cancelled',
  [TaskErrorCode.TIMEOUT]: 'Task timed out',
  [TaskErrorCode.REJECTED]: 'Task was rejected',
  [TaskErrorCode.FUNCTION_SERIALIZE_FAILED]: 'Failed to serialize function',
  [TaskErrorCode.FUNCTION_DESERIALIZE_FAILED]: 'Failed to deserialize function',
  [TaskErrorCode.ABORTED]: 'Task aborted during cleanup',
  [TaskErrorCode.INTERNAL_ERROR]: 'Internal task error',

  // Resource errors
  [ResourceErrorCode.OUT_OF_MEMORY]: 'Out of memory',
  [ResourceErrorCode.SAB_UNAVAILABLE]: 'SharedArrayBuffer not available',
  [ResourceErrorCode.ATOMICS_UNAVAILABLE]: 'Atomics not available',
  [ResourceErrorCode.WASM_UNSUPPORTED]: 'WebAssembly not supported',
  [ResourceErrorCode.TRANSFER_FAILED]: 'Failed to transfer object',
  [ResourceErrorCode.BUFFER_OVERFLOW]: 'Buffer overflow',
  [ResourceErrorCode.LIMIT_EXCEEDED]: 'Resource limit exceeded',
  [ResourceErrorCode.SECURE_CONTEXT_REQUIRED]: 'Secure context required',

  // Communication errors
  [CommunicationErrorCode.CONNECTION_FAILED]: 'Connection failed',
  [CommunicationErrorCode.CONNECTION_LOST]: 'Connection lost',
  [CommunicationErrorCode.SEND_FAILED]: 'Failed to send message',
  [CommunicationErrorCode.RECEIVE_FAILED]: 'Failed to receive message',
  [CommunicationErrorCode.CHANNEL_CLOSED]: 'Channel is closed',
  [CommunicationErrorCode.IPC_ERROR]: 'IPC communication error',
  [CommunicationErrorCode.BACKPRESSURE_EXCEEDED]: 'Backpressure limit exceeded',
};

/**
 * Get human-readable message for error code
 */
export function getErrorMessage(code: ErrorCode): string {
  return ErrorMessages[code] || `Unknown error (code: ${code})`;
}

/**
 * Check if error code is in a specific category
 */
export function isWorkerError(code: number): code is WorkerErrorCode {
  return code >= 1001 && code <= 1999;
}

export function isProtocolError(code: number): code is ProtocolErrorCode {
  return code >= 2001 && code <= 2999;
}

export function isTaskError(code: number): code is TaskErrorCode {
  return code >= 3001 && code <= 3999;
}

export function isResourceError(code: number): code is ResourceErrorCode {
  return code >= 4001 && code <= 4999;
}

export function isCommunicationError(code: number): code is CommunicationErrorCode {
  return code >= 5001 && code <= 5999;
}

/**
 * Get error category name
 */
export function getErrorCategory(code: number): string {
  if (isWorkerError(code)) return 'Worker';
  if (isProtocolError(code)) return 'Protocol';
  if (isTaskError(code)) return 'Task';
  if (isResourceError(code)) return 'Resource';
  if (isCommunicationError(code)) return 'Communication';
  return 'Unknown';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(code: ErrorCode): boolean {
  const retryable: ErrorCode[] = [
    WorkerErrorCode.WORKER_CRASHED,
    WorkerErrorCode.WORKER_UNRESPONSIVE,
    WorkerErrorCode.NO_WORKERS_AVAILABLE,
    TaskErrorCode.TIMEOUT,
    CommunicationErrorCode.CONNECTION_LOST,
    CommunicationErrorCode.SEND_FAILED,
    CommunicationErrorCode.RECEIVE_FAILED,
  ];
  return retryable.includes(code);
}

/**
 * Check if error is fatal (pool should be terminated)
 */
export function isFatalError(code: ErrorCode): boolean {
  const fatal: ErrorCode[] = [
    WorkerErrorCode.POOL_TERMINATED,
    ResourceErrorCode.OUT_OF_MEMORY,
    ResourceErrorCode.SAB_UNAVAILABLE,
  ];
  return fatal.includes(code);
}
