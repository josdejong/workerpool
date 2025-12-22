/**
 * Binary Protocol Stubs for TypeScript Testing
 *
 * Pure TypeScript implementation of the binary protocol for testing
 * without requiring WASM compilation.
 */

// Magic number for protocol identification
export const MAGIC: number = 0x5750; // 'WP' in ASCII

// Protocol version
export const VERSION: number = 2;

// Message types
export const MSG_TASK_REQUEST: number = 1;
export const MSG_TASK_RESPONSE: number = 2;
export const MSG_TASK_ERROR: number = 3;
export const MSG_EVENT: number = 4;
export const MSG_HEARTBEAT_REQ: number = 5;
export const MSG_HEARTBEAT_RES: number = 6;
export const MSG_CLEANUP_REQ: number = 7;
export const MSG_CLEANUP_RES: number = 8;
export const MSG_TERMINATE: number = 9;
export const MSG_BATCH: number = 10;
export const MSG_STREAM_CHUNK: number = 11;

// Flags
export const FLAG_HAS_TRANSFER: number = 0x0001;
export const FLAG_COMPRESSED: number = 0x0002;
export const FLAG_ENCRYPTED: number = 0x0004;
export const FLAG_FINAL: number = 0x0008;
export const FLAG_ACK_REQUIRED: number = 0x0010;

// Priority levels
export const PRIORITY_LOW: number = 0;
export const PRIORITY_NORMAL: number = 1;
export const PRIORITY_HIGH: number = 2;
export const PRIORITY_CRITICAL: number = 3;

// Error codes
export const ERR_WORKER_CRASHED: number = 1001;
export const ERR_WORKER_UNRESPONSIVE: number = 1003;
export const ERR_METHOD_NOT_FOUND: number = 3001;
export const ERR_INVALID_PARAMS: number = 3002;
export const ERR_EXECUTION_FAILED: number = 3003;
export const ERR_CANCELLED: number = 3004;
export const ERR_TIMEOUT: number = 3005;

// Header layout
const HEADER_SIZE = 20;
const OFFSET_MAGIC = 0;
const OFFSET_VERSION = 2;
const OFFSET_TYPE = 3;
const OFFSET_FLAGS = 4;
const OFFSET_ID = 6;
const OFFSET_LENGTH = 10;
const OFFSET_SEQUENCE = 14;
const OFFSET_PRIORITY = 18;

let sequenceCounter = 0;

/**
 * Get next sequence number
 */
export function nextSequence(): number {
  return ++sequenceCounter;
}

/**
 * Reset sequence counter (for testing)
 */
export function resetSequence(): void {
  sequenceCounter = 0;
}

/**
 * Write header to buffer
 */
export function writeHeader(
  buffer: Uint8Array,
  msgType: number,
  id: number,
  payloadLength: number,
  flags: number = 0,
  priority: number = PRIORITY_NORMAL
): void {
  const view = new DataView(buffer.buffer, buffer.byteOffset);

  // Magic number
  view.setUint16(OFFSET_MAGIC, MAGIC, true);

  // Version
  view.setUint8(OFFSET_VERSION, VERSION);

  // Message type
  view.setUint8(OFFSET_TYPE, msgType);

  // Flags
  view.setUint16(OFFSET_FLAGS, flags, true);

  // Message ID
  view.setUint32(OFFSET_ID, id, true);

  // Payload length
  view.setUint32(OFFSET_LENGTH, payloadLength, true);

  // Sequence number
  view.setUint32(OFFSET_SEQUENCE, nextSequence(), true);

  // Priority
  view.setUint8(OFFSET_PRIORITY, priority);

  // Reserved byte
  view.setUint8(OFFSET_PRIORITY + 1, 0);
}

/**
 * Read header from buffer
 */
export function readHeader(buffer: Uint8Array): number[] {
  const view = new DataView(buffer.buffer, buffer.byteOffset);

  return [
    view.getUint16(OFFSET_MAGIC, true),
    view.getUint8(OFFSET_VERSION),
    view.getUint8(OFFSET_TYPE),
    view.getUint16(OFFSET_FLAGS, true),
    view.getUint32(OFFSET_ID, true),
    view.getUint32(OFFSET_LENGTH, true),
    view.getUint32(OFFSET_SEQUENCE, true),
    view.getUint8(OFFSET_PRIORITY),
  ];
}

/**
 * Validate message header
 */
export function validateHeader(buffer: Uint8Array): boolean {
  if (buffer.length < HEADER_SIZE) {
    return false;
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset);

  // Check magic number
  const magic = view.getUint16(OFFSET_MAGIC, true);
  if (magic !== MAGIC) {
    return false;
  }

  // Check version
  const version = view.getUint8(OFFSET_VERSION);
  if (version > VERSION) {
    return false;
  }

  // Check message type
  const msgType = view.getUint8(OFFSET_TYPE);
  if (msgType < MSG_TASK_REQUEST || msgType > MSG_STREAM_CHUNK) {
    return false;
  }

  return true;
}

/**
 * Get payload from buffer (after header)
 */
export function getPayload(buffer: Uint8Array): Uint8Array {
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  const payloadLength = view.getUint32(OFFSET_LENGTH, true);

  return buffer.slice(HEADER_SIZE, HEADER_SIZE + payloadLength);
}

/**
 * Encode a task request
 */
export function encodeTaskRequest(
  id: number,
  method: string,
  paramsData: Uint8Array,
  priority: number = PRIORITY_NORMAL,
  hasTransfer: boolean = false
): Uint8Array {
  const encoder = new TextEncoder();
  const methodBytes = encoder.encode(method);
  const methodLength = methodBytes.length;
  const paramsLength = paramsData.length;

  const payloadSize = 2 + methodLength + 4 + paramsLength;
  const totalSize = HEADER_SIZE + payloadSize;
  const buffer = new Uint8Array(totalSize);

  let flags = 0;
  if (hasTransfer) {
    flags |= FLAG_HAS_TRANSFER;
  }

  writeHeader(buffer, MSG_TASK_REQUEST, id, payloadSize, flags, priority);

  const view = new DataView(buffer.buffer);
  let offset = HEADER_SIZE;

  // Write method length
  view.setUint16(offset, methodLength, true);
  offset += 2;

  // Write method string
  buffer.set(methodBytes, offset);
  offset += methodLength;

  // Write params length
  view.setUint32(offset, paramsLength, true);
  offset += 4;

  // Write params data
  buffer.set(paramsData, offset);

  return buffer;
}

/**
 * Decode a task request
 */
export function decodeTaskRequest(buffer: Uint8Array): {
  id: number;
  method: string;
  params: Uint8Array;
} {
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  const decoder = new TextDecoder();

  // Get ID from header
  const id = view.getUint32(OFFSET_ID, true);

  let offset = HEADER_SIZE;

  // Read method length
  const methodLength = view.getUint16(offset, true);
  offset += 2;

  // Read method string
  const method = decoder.decode(buffer.slice(offset, offset + methodLength));
  offset += methodLength;

  // Read params length
  const paramsLength = view.getUint32(offset, true);
  offset += 4;

  // Read params data
  const params = buffer.slice(offset, offset + paramsLength);

  return { id, method, params };
}

/**
 * Encode a task response
 */
export function encodeTaskResponse(
  id: number,
  success: boolean,
  resultData: Uint8Array
): Uint8Array {
  const resultLength = resultData.length;
  const payloadSize = 1 + 4 + resultLength;
  const totalSize = HEADER_SIZE + payloadSize;
  const buffer = new Uint8Array(totalSize);

  const msgType = success ? MSG_TASK_RESPONSE : MSG_TASK_ERROR;
  writeHeader(buffer, msgType, id, payloadSize);

  const view = new DataView(buffer.buffer);
  let offset = HEADER_SIZE;

  // Write success flag
  view.setUint8(offset, success ? 1 : 0);
  offset += 1;

  // Write result length
  view.setUint32(offset, resultLength, true);
  offset += 4;

  // Write result data
  buffer.set(resultData, offset);

  return buffer;
}

/**
 * Encode an error response
 */
export function encodeErrorResponse(
  id: number,
  errorCode: number,
  message: string,
  stack: string = ''
): Uint8Array {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(message);
  const stackBytes = encoder.encode(stack);

  const payloadSize = 2 + 2 + messageBytes.length + 2 + stackBytes.length;
  const totalSize = HEADER_SIZE + payloadSize;
  const buffer = new Uint8Array(totalSize);

  writeHeader(buffer, MSG_TASK_ERROR, id, payloadSize);

  const view = new DataView(buffer.buffer);
  let offset = HEADER_SIZE;

  // Write error code
  view.setUint16(offset, errorCode, true);
  offset += 2;

  // Write message length
  view.setUint16(offset, messageBytes.length, true);
  offset += 2;

  // Write message
  buffer.set(messageBytes, offset);
  offset += messageBytes.length;

  // Write stack length
  view.setUint16(offset, stackBytes.length, true);
  offset += 2;

  // Write stack
  buffer.set(stackBytes, offset);

  return buffer;
}

/**
 * Decode an error response
 */
export function decodeErrorResponse(buffer: Uint8Array): {
  id: number;
  errorCode: number;
  message: string;
  stack: string;
} {
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  const decoder = new TextDecoder();

  const id = view.getUint32(OFFSET_ID, true);

  let offset = HEADER_SIZE;

  // Read error code
  const errorCode = view.getUint16(offset, true);
  offset += 2;

  // Read message length
  const messageLength = view.getUint16(offset, true);
  offset += 2;

  // Read message
  const message = decoder.decode(buffer.slice(offset, offset + messageLength));
  offset += messageLength;

  // Read stack length
  const stackLength = view.getUint16(offset, true);
  offset += 2;

  // Read stack
  const stack = decoder.decode(buffer.slice(offset, offset + stackLength));

  return { id, errorCode, message, stack };
}

/**
 * Encode a heartbeat request
 */
export function encodeHeartbeatRequest(id: number, workerId: string = ''): Uint8Array {
  const encoder = new TextEncoder();
  const workerIdBytes = encoder.encode(workerId);

  const payloadSize = 2 + workerIdBytes.length;
  const totalSize = HEADER_SIZE + payloadSize;
  const buffer = new Uint8Array(totalSize);

  writeHeader(buffer, MSG_HEARTBEAT_REQ, id, payloadSize, 0, PRIORITY_HIGH);

  const view = new DataView(buffer.buffer);
  let offset = HEADER_SIZE;

  // Write worker ID length
  view.setUint16(offset, workerIdBytes.length, true);
  offset += 2;

  // Write worker ID
  buffer.set(workerIdBytes, offset);

  return buffer;
}

/**
 * Encode a heartbeat response
 */
export function encodeHeartbeatResponse(
  id: number,
  status: number,
  taskCount: number = 0,
  memoryUsage: bigint = BigInt(0),
  uptime: bigint = BigInt(0)
): Uint8Array {
  const payloadSize = 1 + 4 + 8 + 8;
  const totalSize = HEADER_SIZE + payloadSize;
  const buffer = new Uint8Array(totalSize);

  writeHeader(buffer, MSG_HEARTBEAT_RES, id, payloadSize, 0, PRIORITY_HIGH);

  const view = new DataView(buffer.buffer);
  let offset = HEADER_SIZE;

  // Write status
  view.setUint8(offset, status);
  offset += 1;

  // Write task count
  view.setUint32(offset, taskCount, true);
  offset += 4;

  // Write memory usage
  view.setBigUint64(offset, memoryUsage, true);
  offset += 8;

  // Write uptime
  view.setBigUint64(offset, uptime, true);

  return buffer;
}

/**
 * Decode heartbeat response
 */
export function decodeHeartbeatResponse(buffer: Uint8Array): {
  id: number;
  status: number;
  taskCount: number;
  memoryUsage: bigint;
  uptime: bigint;
} {
  const view = new DataView(buffer.buffer, buffer.byteOffset);

  const id = view.getUint32(OFFSET_ID, true);

  let offset = HEADER_SIZE;

  const status = view.getUint8(offset);
  offset += 1;

  const taskCount = view.getUint32(offset, true);
  offset += 4;

  const memoryUsage = view.getBigUint64(offset, true);
  offset += 8;

  const uptime = view.getBigUint64(offset, true);

  return { id, status, taskCount, memoryUsage, uptime };
}

/**
 * Encode batch header
 */
export function encodeBatchHeader(
  id: number,
  batchId: string,
  taskCount: number,
  chunkIndex: number = 0,
  totalChunks: number = 1
): Uint8Array {
  const encoder = new TextEncoder();
  const batchIdBytes = encoder.encode(batchId);

  const payloadSize = 2 + batchIdBytes.length + 4 + 2 + 2;
  const totalSize = HEADER_SIZE + payloadSize;
  const buffer = new Uint8Array(totalSize);

  writeHeader(buffer, MSG_BATCH, id, payloadSize);

  const view = new DataView(buffer.buffer);
  let offset = HEADER_SIZE;

  // Write batch ID length
  view.setUint16(offset, batchIdBytes.length, true);
  offset += 2;

  // Write batch ID
  buffer.set(batchIdBytes, offset);
  offset += batchIdBytes.length;

  // Write task count
  view.setUint32(offset, taskCount, true);
  offset += 4;

  // Write chunk index
  view.setUint16(offset, chunkIndex, true);
  offset += 2;

  // Write total chunks
  view.setUint16(offset, totalChunks, true);

  return buffer;
}

/**
 * Get message type from buffer
 */
export function getMessageType(buffer: Uint8Array): number {
  if (buffer.length < HEADER_SIZE) {
    return 0;
  }
  return buffer[OFFSET_TYPE];
}

/**
 * Get message ID from buffer
 */
export function getMessageId(buffer: Uint8Array): number {
  if (buffer.length < HEADER_SIZE) {
    return 0;
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  return view.getUint32(OFFSET_ID, true);
}

/**
 * Get message priority from buffer
 */
export function getMessagePriority(buffer: Uint8Array): number {
  if (buffer.length < HEADER_SIZE) {
    return PRIORITY_NORMAL;
  }
  return buffer[OFFSET_PRIORITY];
}

/**
 * Get message sequence from buffer
 */
export function getMessageSequence(buffer: Uint8Array): number {
  if (buffer.length < HEADER_SIZE) {
    return 0;
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  return view.getUint32(OFFSET_SEQUENCE, true);
}

/**
 * Check if message has transfer flag
 */
export function hasTransferFlag(buffer: Uint8Array): boolean {
  if (buffer.length < HEADER_SIZE) {
    return false;
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  const flags = view.getUint16(OFFSET_FLAGS, true);
  return (flags & FLAG_HAS_TRANSFER) !== 0;
}

/**
 * Check if message is compressed
 */
export function isCompressed(buffer: Uint8Array): boolean {
  if (buffer.length < HEADER_SIZE) {
    return false;
  }
  const view = new DataView(buffer.buffer, buffer.byteOffset);
  const flags = view.getUint16(OFFSET_FLAGS, true);
  return (flags & FLAG_COMPRESSED) !== 0;
}

/**
 * Get header size constant
 */
export function getHeaderSize(): number {
  return HEADER_SIZE;
}

/**
 * Calculate checksum for payload (simple XOR-based)
 */
export function calculateChecksum(buffer: Uint8Array, offset: number, length: number): number {
  let checksum = 0;

  for (let i = 0; i < length; i++) {
    checksum ^= buffer[offset + i] << ((i % 4) * 8);
  }

  return checksum >>> 0; // Convert to unsigned
}

export default {
  MAGIC,
  VERSION,
  MSG_TASK_REQUEST,
  MSG_TASK_RESPONSE,
  MSG_TASK_ERROR,
  MSG_EVENT,
  MSG_HEARTBEAT_REQ,
  MSG_HEARTBEAT_RES,
  MSG_CLEANUP_REQ,
  MSG_CLEANUP_RES,
  MSG_TERMINATE,
  MSG_BATCH,
  MSG_STREAM_CHUNK,
  FLAG_HAS_TRANSFER,
  FLAG_COMPRESSED,
  FLAG_ENCRYPTED,
  FLAG_FINAL,
  FLAG_ACK_REQUIRED,
  PRIORITY_LOW,
  PRIORITY_NORMAL,
  PRIORITY_HIGH,
  PRIORITY_CRITICAL,
  nextSequence,
  resetSequence,
  writeHeader,
  readHeader,
  validateHeader,
  getPayload,
  encodeTaskRequest,
  decodeTaskRequest,
  encodeTaskResponse,
  encodeErrorResponse,
  decodeErrorResponse,
  encodeHeartbeatRequest,
  encodeHeartbeatResponse,
  decodeHeartbeatResponse,
  encodeBatchHeader,
  getMessageType,
  getMessageId,
  getMessagePriority,
  getMessageSequence,
  hasTransferFlag,
  isCompressed,
  getHeaderSize,
  calculateChecksum,
};
