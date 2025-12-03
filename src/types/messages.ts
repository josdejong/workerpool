/**
 * workerpool IPC Message Protocol Types
 * Discriminated unions for type-safe message handling
 */

import type { SerializedError } from './internal';

/**
 * Special method IDs for internal protocol messages
 */
export const TERMINATE_METHOD_ID = '__workerpool-terminate__';
export const CLEANUP_METHOD_ID = '__workerpool-cleanup__';

/**
 * Base message interface with common fields
 */
interface BaseMessage {
  /** Unique message ID for request/response correlation */
  id: number;
}

// ============================================================================
// Request Messages (Main Thread -> Worker)
// ============================================================================

/**
 * Request to execute a method in the worker
 */
export interface TaskRequest extends BaseMessage {
  type: 'task';
  /** Method name to execute */
  method: string;
  /** Parameters to pass to the method */
  params?: unknown[];
}

/**
 * Request to execute a dynamic function (stringified)
 */
export interface DynamicTaskRequest extends BaseMessage {
  type: 'dynamic';
  /** Stringified function code */
  code: string;
  /** Parameters to pass to the function */
  params?: unknown[];
}

/**
 * Request worker to run cleanup handlers before potential termination
 */
export interface CleanupRequest extends BaseMessage {
  type: 'cleanup';
}

/**
 * Request worker to terminate
 */
export interface TerminateRequest extends BaseMessage {
  type: 'terminate';
  /** Exit code */
  code?: number;
}

/**
 * Union of all request message types
 */
export type WorkerRequest =
  | TaskRequest
  | DynamicTaskRequest
  | CleanupRequest
  | TerminateRequest;

// ============================================================================
// Response Messages (Worker -> Main Thread)
// ============================================================================

/**
 * Successful task completion response
 */
export interface TaskSuccessResponse extends BaseMessage {
  type: 'success';
  /** Task result */
  result: unknown;
  /** Transferable objects for zero-copy transfer */
  transfer?: Transferable[];
}

/**
 * Task error response
 */
export interface TaskErrorResponse extends BaseMessage {
  type: 'error';
  /** Serialized error object */
  error: SerializedError;
}

/**
 * Cleanup completed response
 */
export interface CleanupResponse extends BaseMessage {
  type: 'cleanup-complete';
}

/**
 * Union of all response message types
 */
export type WorkerResponse =
  | TaskSuccessResponse
  | TaskErrorResponse
  | CleanupResponse;

// ============================================================================
// Event Messages (Worker -> Main Thread, unsolicited)
// ============================================================================

/**
 * Worker is ready to receive tasks
 */
export interface ReadyEvent {
  type: 'ready';
}

/**
 * Custom event emitted by worker during task execution
 */
export interface WorkerEvent {
  type: 'event';
  /** Task ID this event is associated with */
  taskId: number;
  /** Event payload */
  payload: unknown;
}

/**
 * Worker stdout data (when emitStdStreams is enabled)
 */
export interface StdoutEvent {
  type: 'stdout';
  /** Output data */
  data: string;
}

/**
 * Worker stderr data (when emitStdStreams is enabled)
 */
export interface StderrEvent {
  type: 'stderr';
  /** Output data */
  data: string;
}

/**
 * Union of all event message types
 */
export type WorkerEventMessage =
  | ReadyEvent
  | WorkerEvent
  | StdoutEvent
  | StderrEvent;

// ============================================================================
// Combined Message Types
// ============================================================================

/**
 * All messages that can be sent to a worker
 */
export type MessageToWorker = WorkerRequest;

/**
 * All messages that can be received from a worker
 */
export type MessageFromWorker = WorkerResponse | WorkerEventMessage;

/**
 * Type guard for TaskRequest
 */
export function isTaskRequest(msg: WorkerRequest): msg is TaskRequest {
  return msg.type === 'task';
}

/**
 * Type guard for DynamicTaskRequest
 */
export function isDynamicTaskRequest(msg: WorkerRequest): msg is DynamicTaskRequest {
  return msg.type === 'dynamic';
}

/**
 * Type guard for CleanupRequest
 */
export function isCleanupRequest(msg: WorkerRequest): msg is CleanupRequest {
  return msg.type === 'cleanup';
}

/**
 * Type guard for TerminateRequest
 */
export function isTerminateRequest(msg: WorkerRequest): msg is TerminateRequest {
  return msg.type === 'terminate';
}

/**
 * Type guard for TaskSuccessResponse
 */
export function isTaskSuccessResponse(msg: WorkerResponse): msg is TaskSuccessResponse {
  return msg.type === 'success';
}

/**
 * Type guard for TaskErrorResponse
 */
export function isTaskErrorResponse(msg: WorkerResponse): msg is TaskErrorResponse {
  return msg.type === 'error';
}

/**
 * Type guard for ReadyEvent
 */
export function isReadyEvent(msg: WorkerEventMessage): msg is ReadyEvent {
  return msg.type === 'ready';
}

/**
 * Type guard for WorkerEvent
 */
export function isWorkerEvent(msg: WorkerEventMessage): msg is WorkerEvent {
  return msg.type === 'event';
}

// ============================================================================
// Legacy Message Format (for backward compatibility)
// ============================================================================

/**
 * Legacy message format used by existing JS implementation
 * @deprecated Use typed messages for new code
 */
export interface LegacyMessage {
  id?: number;
  method?: string;
  params?: unknown[];
  result?: unknown;
  error?: SerializedError | string;
}

/**
 * Convert legacy message to typed message
 */
export function parseLegacyMessage(msg: LegacyMessage): MessageFromWorker | null {
  if (msg.result !== undefined && msg.id !== undefined) {
    return {
      type: 'success',
      id: msg.id,
      result: msg.result,
    };
  }

  if (msg.error !== undefined && msg.id !== undefined) {
    const error: SerializedError = typeof msg.error === 'string'
      ? { name: 'Error', message: msg.error }
      : msg.error;
    return {
      type: 'error',
      id: msg.id,
      error,
    };
  }

  return null;
}
