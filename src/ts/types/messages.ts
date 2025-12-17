/**
 * workerpool IPC Message Protocol Types
 *
 * Types for the message protocol used between main thread and workers.
 * These match the legacy format used by the existing JS implementation.
 */

/**
 * Serialized error for cross-boundary transmission
 */
export interface SerializedError {
  /** Error name/type */
  name: string;
  /** Error message */
  message: string;
  /** Stack trace if available */
  stack?: string;
  /** Additional error properties */
  [key: string]: unknown;
}

/**
 * Special method IDs for internal protocol messages
 */
export const TERMINATE_METHOD_ID = '__workerpool-terminate__';
export const CLEANUP_METHOD_ID = '__workerpool-cleanup__';

// ============================================================================
// Request Messages (Main Thread -> Worker)
// ============================================================================

/**
 * Task request message
 */
export interface TaskRequest {
  /** Unique message ID for request/response correlation */
  id: number;
  /** Method name to execute */
  method: string;
  /** Parameters to pass to the method */
  params?: unknown[];
}

/**
 * Cleanup request message
 */
export interface CleanupRequest {
  id: number;
  method: typeof CLEANUP_METHOD_ID;
}

// ============================================================================
// Response Messages (Worker -> Main Thread)
// ============================================================================

/**
 * Successful task response
 */
export interface TaskSuccessResponse {
  id: number;
  result: unknown;
  error: null;
}

/**
 * Error task response
 */
export interface TaskErrorResponse {
  id: number;
  result: null;
  error: SerializedError;
}

/**
 * Cleanup response message
 */
export interface CleanupResponse {
  id: number;
  method: typeof CLEANUP_METHOD_ID;
  error: SerializedError | null;
}

/**
 * Worker event (during task execution)
 */
export interface WorkerEvent {
  id: number;
  isEvent: true;
  payload: unknown;
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * All request message types
 */
export type WorkerRequest = TaskRequest | CleanupRequest | typeof TERMINATE_METHOD_ID;

/**
 * All response message types
 */
export type WorkerResponse = TaskSuccessResponse | TaskErrorResponse | CleanupResponse | WorkerEvent;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for TaskRequest
 */
export function isTaskRequest(msg: unknown): msg is TaskRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    'method' in msg &&
    typeof (msg as TaskRequest).method === 'string'
  );
}

/**
 * Type guard for CleanupRequest
 */
export function isCleanupRequest(msg: unknown): msg is CleanupRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'method' in msg &&
    (msg as CleanupRequest).method === CLEANUP_METHOD_ID
  );
}

/**
 * Type guard for TaskSuccessResponse
 */
export function isTaskSuccessResponse(msg: unknown): msg is TaskSuccessResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    'result' in msg &&
    !('isEvent' in msg)
  );
}

/**
 * Type guard for TaskErrorResponse
 */
export function isTaskErrorResponse(msg: unknown): msg is TaskErrorResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    'error' in msg &&
    (msg as TaskErrorResponse).error !== null
  );
}

/**
 * Type guard for WorkerEvent
 */
export function isWorkerEvent(msg: unknown): msg is WorkerEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'isEvent' in msg &&
    (msg as WorkerEvent).isEvent === true
  );
}

/**
 * Type guard for CleanupResponse
 */
export function isCleanupResponse(msg: unknown): msg is CleanupResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'method' in msg &&
    (msg as CleanupResponse).method === CLEANUP_METHOD_ID
  );
}
