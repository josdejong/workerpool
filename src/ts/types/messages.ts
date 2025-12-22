/**
 * workerpool IPC Message Protocol Types
 *
 * Types for the message protocol used between main thread and workers.
 * These match the legacy format used by the existing JS implementation.
 *
 * Protocol Version History:
 * - v1: Original JSON-RPC style protocol
 * - v2: Added versioning, error codes, priority, sequence numbers
 */

import type { ErrorCode } from './error-codes';

/**
 * Current protocol version
 */
export const PROTOCOL_VERSION = 2;

/**
 * Minimum supported protocol version
 */
export const MIN_PROTOCOL_VERSION = 1;

/**
 * Message priority levels
 */
export enum MessagePriority {
  /** Low priority - can be delayed */
  LOW = 0,
  /** Normal priority - default */
  NORMAL = 1,
  /** High priority - process before normal */
  HIGH = 2,
  /** Critical priority - process immediately */
  CRITICAL = 3,
}

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
  /** Standardized error code */
  code?: ErrorCode;
  /** Additional error properties */
  [key: string]: unknown;
}

/**
 * Special method IDs for internal protocol messages
 */
export const TERMINATE_METHOD_ID = '__workerpool-terminate__';
export const CLEANUP_METHOD_ID = '__workerpool-cleanup__';
export const HEARTBEAT_METHOD_ID = '__workerpool-heartbeat__';

// ============================================================================
// Request Messages (Main Thread -> Worker)
// ============================================================================

/**
 * Message header with protocol metadata
 */
export interface MessageHeader {
  /** Protocol version */
  v?: number;
  /** Sequence number for ordering */
  seq?: number;
  /** Last acknowledged sequence */
  ack?: number;
  /** Message priority */
  priority?: MessagePriority;
  /** Timestamp when message was created */
  ts?: number;
}

/**
 * Task request message
 */
export interface TaskRequest extends MessageHeader {
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
export interface CleanupRequest extends MessageHeader {
  id: number;
  method: typeof CLEANUP_METHOD_ID;
}

/**
 * Heartbeat request message
 */
export interface HeartbeatRequest extends MessageHeader {
  id: number;
  method: typeof HEARTBEAT_METHOD_ID;
  /** Worker ID */
  workerId?: string;
}

/**
 * Heartbeat response message
 */
export interface HeartbeatResponse extends MessageHeader {
  id: number;
  method: typeof HEARTBEAT_METHOD_ID;
  /** Worker status */
  status: 'alive' | 'busy' | 'idle';
  /** Current task count */
  taskCount?: number;
  /** Memory usage in bytes */
  memoryUsage?: number;
  /** Uptime in ms */
  uptime?: number;
}

// ============================================================================
// Response Messages (Worker -> Main Thread)
// ============================================================================

/**
 * Successful task response
 */
export interface TaskSuccessResponse extends MessageHeader {
  id: number;
  result: unknown;
  error: null;
}

/**
 * Error task response
 */
export interface TaskErrorResponse extends MessageHeader {
  id: number;
  result: null;
  error: SerializedError;
}

/**
 * Cleanup response message
 */
export interface CleanupResponse extends MessageHeader {
  id: number;
  method: typeof CLEANUP_METHOD_ID;
  error: SerializedError | null;
}

/**
 * Worker event (during task execution)
 */
export interface WorkerEvent extends MessageHeader {
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
export type WorkerRequest = TaskRequest | CleanupRequest | HeartbeatRequest | typeof TERMINATE_METHOD_ID;

/**
 * All response message types
 */
export type WorkerResponse =
  | TaskSuccessResponse
  | TaskErrorResponse
  | CleanupResponse
  | HeartbeatResponse
  | WorkerEvent;

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

/**
 * Type guard for HeartbeatRequest
 */
export function isHeartbeatRequest(msg: unknown): msg is HeartbeatRequest {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'method' in msg &&
    (msg as HeartbeatRequest).method === HEARTBEAT_METHOD_ID
  );
}

/**
 * Type guard for HeartbeatResponse
 */
export function isHeartbeatResponse(msg: unknown): msg is HeartbeatResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'method' in msg &&
    (msg as HeartbeatResponse).method === HEARTBEAT_METHOD_ID &&
    'status' in msg
  );
}

// ============================================================================
// Protocol Helpers
// ============================================================================

/**
 * Create a message with protocol header
 */
export function createMessage<T extends MessageHeader>(
  message: Omit<T, keyof MessageHeader>,
  options?: {
    priority?: MessagePriority;
    includeTimestamp?: boolean;
  }
): T {
  const header: MessageHeader = {
    v: PROTOCOL_VERSION,
  };

  if (options?.priority !== undefined) {
    header.priority = options.priority;
  }

  if (options?.includeTimestamp) {
    header.ts = Date.now();
  }

  return { ...header, ...message } as T;
}

/**
 * Check if message has valid protocol version
 */
export function isValidProtocolVersion(msg: MessageHeader): boolean {
  const version = msg.v ?? 1; // Default to v1 for backward compatibility
  return version >= MIN_PROTOCOL_VERSION && version <= PROTOCOL_VERSION;
}

/**
 * Get message priority (default to NORMAL)
 */
export function getMessagePriority(msg: MessageHeader): MessagePriority {
  return msg.priority ?? MessagePriority.NORMAL;
}

/**
 * Compare messages by priority (higher priority first)
 */
export function compareByPriority(a: MessageHeader, b: MessageHeader): number {
  return getMessagePriority(b) - getMessagePriority(a);
}
