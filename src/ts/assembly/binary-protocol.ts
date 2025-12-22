/**
 * Binary Protocol for AssemblyScript/WASM
 *
 * Efficient binary serialization of workerpool messages.
 * Provides compact representation for high-throughput scenarios.
 *
 * Binary Format:
 * ┌───────────────────────────────────────────────────────────────┐
 * │ Header (16 bytes)                                             │
 * ├─────────┬─────────┬─────────┬─────────┬─────────┬─────────────┤
 * │ Magic   │ Version │ Type    │ Flags   │ ID      │ Length      │
 * │ 2 bytes │ 1 byte  │ 1 byte  │ 2 bytes │ 4 bytes │ 4 bytes     │
 * ├─────────┴─────────┴─────────┴─────────┴─────────┴─────────────┤
 * │ Sequence (4 bytes) │ Priority (1 byte) │ Reserved (1 byte)    │
 * ├───────────────────────────────────────────────────────────────┤
 * │ Payload (variable length)                                     │
 * └───────────────────────────────────────────────────────────────┘
 */

// Magic number for protocol identification
export const MAGIC: u16 = 0x5750; // 'WP' in ASCII

// Protocol version
export const VERSION: u8 = 2;

// Message types
export const MSG_TASK_REQUEST: u8 = 1;
export const MSG_TASK_RESPONSE: u8 = 2;
export const MSG_TASK_ERROR: u8 = 3;
export const MSG_EVENT: u8 = 4;
export const MSG_HEARTBEAT_REQ: u8 = 5;
export const MSG_HEARTBEAT_RES: u8 = 6;
export const MSG_CLEANUP_REQ: u8 = 7;
export const MSG_CLEANUP_RES: u8 = 8;
export const MSG_TERMINATE: u8 = 9;
export const MSG_BATCH: u8 = 10;
export const MSG_STREAM_CHUNK: u8 = 11;

// Flags
export const FLAG_HAS_TRANSFER: u16 = 0x0001;
export const FLAG_COMPRESSED: u16 = 0x0002;
export const FLAG_ENCRYPTED: u16 = 0x0004;
export const FLAG_FINAL: u16 = 0x0008;
export const FLAG_ACK_REQUIRED: u16 = 0x0010;

// Priority levels
export const PRIORITY_LOW: u8 = 0;
export const PRIORITY_NORMAL: u8 = 1;
export const PRIORITY_HIGH: u8 = 2;
export const PRIORITY_CRITICAL: u8 = 3;

// Error codes (matching TypeScript enum values)
export const ERR_WORKER_CRASHED: u16 = 1001;
export const ERR_WORKER_UNRESPONSIVE: u16 = 1003;
export const ERR_METHOD_NOT_FOUND: u16 = 3001;
export const ERR_INVALID_PARAMS: u16 = 3002;
export const ERR_EXECUTION_FAILED: u16 = 3003;
export const ERR_CANCELLED: u16 = 3004;
export const ERR_TIMEOUT: u16 = 3005;

// Header offsets
const OFFSET_MAGIC: i32 = 0;
const OFFSET_VERSION: i32 = 2;
const OFFSET_TYPE: i32 = 3;
const OFFSET_FLAGS: i32 = 4;
const OFFSET_ID: i32 = 6;
const OFFSET_LENGTH: i32 = 10;
const OFFSET_SEQUENCE: i32 = 14;
const OFFSET_PRIORITY: i32 = 18;
const OFFSET_RESERVED: i32 = 19;
const HEADER_SIZE: i32 = 20;

// Buffer for message encoding/decoding
let messageBuffer: StaticArray<u8> = new StaticArray<u8>(65536); // 64KB default
let sequenceCounter: u32 = 0;

/**
 * Resize message buffer if needed
 */
function ensureBufferSize(size: i32): void {
  if (size > messageBuffer.length) {
    const newSize = Math.max(size, messageBuffer.length * 2) as i32;
    const newBuffer = new StaticArray<u8>(newSize);
    // Copy existing data
    for (let i = 0; i < messageBuffer.length; i++) {
      newBuffer[i] = messageBuffer[i];
    }
    messageBuffer = newBuffer;
  }
}

/**
 * Get next sequence number
 */
export function nextSequence(): u32 {
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
  msgType: u8,
  id: u32,
  payloadLength: u32,
  flags: u16 = 0,
  priority: u8 = PRIORITY_NORMAL
): void {
  ensureBufferSize(HEADER_SIZE);

  // Magic number
  store<u16>(changetype<usize>(messageBuffer) + OFFSET_MAGIC, MAGIC);

  // Version
  store<u8>(changetype<usize>(messageBuffer) + OFFSET_VERSION, VERSION);

  // Message type
  store<u8>(changetype<usize>(messageBuffer) + OFFSET_TYPE, msgType);

  // Flags
  store<u16>(changetype<usize>(messageBuffer) + OFFSET_FLAGS, flags);

  // Message ID
  store<u32>(changetype<usize>(messageBuffer) + OFFSET_ID, id);

  // Payload length
  store<u32>(changetype<usize>(messageBuffer) + OFFSET_LENGTH, payloadLength);

  // Sequence number
  store<u32>(changetype<usize>(messageBuffer) + OFFSET_SEQUENCE, nextSequence());

  // Priority
  store<u8>(changetype<usize>(messageBuffer) + OFFSET_PRIORITY, priority);

  // Reserved byte
  store<u8>(changetype<usize>(messageBuffer) + OFFSET_RESERVED, 0);
}

/**
 * Read header from buffer
 * Returns: [magic, version, type, flags, id, length, sequence, priority]
 */
export function readHeader(buffer: StaticArray<u8>): StaticArray<u32> {
  const result = new StaticArray<u32>(8);

  const bufferPtr = changetype<usize>(buffer);

  result[0] = load<u16>(bufferPtr + OFFSET_MAGIC) as u32;
  result[1] = load<u8>(bufferPtr + OFFSET_VERSION) as u32;
  result[2] = load<u8>(bufferPtr + OFFSET_TYPE) as u32;
  result[3] = load<u16>(bufferPtr + OFFSET_FLAGS) as u32;
  result[4] = load<u32>(bufferPtr + OFFSET_ID);
  result[5] = load<u32>(bufferPtr + OFFSET_LENGTH);
  result[6] = load<u32>(bufferPtr + OFFSET_SEQUENCE);
  result[7] = load<u8>(bufferPtr + OFFSET_PRIORITY) as u32;

  return result;
}

/**
 * Validate message header
 */
export function validateHeader(buffer: StaticArray<u8>): bool {
  if (buffer.length < HEADER_SIZE) {
    return false;
  }

  const bufferPtr = changetype<usize>(buffer);

  // Check magic number
  const magic = load<u16>(bufferPtr + OFFSET_MAGIC);
  if (magic !== MAGIC) {
    return false;
  }

  // Check version
  const version = load<u8>(bufferPtr + OFFSET_VERSION);
  if (version > VERSION) {
    return false;
  }

  // Check message type
  const msgType = load<u8>(bufferPtr + OFFSET_TYPE);
  if (msgType < MSG_TASK_REQUEST || msgType > MSG_STREAM_CHUNK) {
    return false;
  }

  return true;
}

/**
 * Get payload from buffer (after header)
 */
export function getPayload(buffer: StaticArray<u8>): StaticArray<u8> {
  const bufferPtr = changetype<usize>(buffer);
  const payloadLength = load<u32>(bufferPtr + OFFSET_LENGTH) as i32;

  const payload = new StaticArray<u8>(payloadLength);
  for (let i = 0; i < payloadLength; i++) {
    payload[i] = buffer[HEADER_SIZE + i];
  }

  return payload;
}

/**
 * Encode a task request
 * Payload format: [methodLength:u16][method:N][paramsLength:u32][params:N]
 */
export function encodeTaskRequest(
  id: u32,
  method: string,
  paramsData: StaticArray<u8>,
  priority: u8 = PRIORITY_NORMAL,
  hasTransfer: bool = false
): StaticArray<u8> {
  const methodBytes = String.UTF8.encode(method);
  const methodLength = methodBytes.byteLength as u16;
  const paramsLength = paramsData.length as u32;

  const payloadSize = 2 + methodLength + 4 + paramsLength;
  const totalSize = HEADER_SIZE + payloadSize;

  ensureBufferSize(totalSize);

  let flags: u16 = 0;
  if (hasTransfer) {
    flags |= FLAG_HAS_TRANSFER;
  }

  writeHeader(MSG_TASK_REQUEST, id, payloadSize as u32, flags, priority);

  let offset = HEADER_SIZE;

  // Write method length
  store<u16>(changetype<usize>(messageBuffer) + offset, methodLength);
  offset += 2;

  // Write method string
  const methodPtr = changetype<usize>(methodBytes);
  for (let i = 0; i < methodLength as i32; i++) {
    messageBuffer[offset + i] = load<u8>(methodPtr + i);
  }
  offset += methodLength as i32;

  // Write params length
  store<u32>(changetype<usize>(messageBuffer) + offset, paramsLength);
  offset += 4;

  // Write params data
  for (let i = 0; i < paramsLength as i32; i++) {
    messageBuffer[offset + i] = paramsData[i];
  }

  // Copy result
  const result = new StaticArray<u8>(totalSize);
  for (let i = 0; i < totalSize; i++) {
    result[i] = messageBuffer[i];
  }

  return result;
}

/**
 * Decode a task request
 * Returns: [id, methodOffset, methodLength, paramsOffset, paramsLength]
 */
export function decodeTaskRequest(buffer: StaticArray<u8>): StaticArray<u32> {
  const result = new StaticArray<u32>(5);
  const bufferPtr = changetype<usize>(buffer);

  // Get ID from header
  result[0] = load<u32>(bufferPtr + OFFSET_ID);

  let offset = HEADER_SIZE;

  // Read method length
  const methodLength = load<u16>(bufferPtr + offset) as u32;
  offset += 2;

  // Method offset and length
  result[1] = offset as u32;
  result[2] = methodLength;
  offset += methodLength as i32;

  // Read params length
  const paramsLength = load<u32>(bufferPtr + offset);
  offset += 4;

  // Params offset and length
  result[3] = offset as u32;
  result[4] = paramsLength;

  return result;
}

/**
 * Encode a task response
 * Payload format: [success:u8][resultLength:u32][result:N]
 */
export function encodeTaskResponse(
  id: u32,
  success: bool,
  resultData: StaticArray<u8>
): StaticArray<u8> {
  const resultLength = resultData.length as u32;
  const payloadSize = 1 + 4 + resultLength;
  const totalSize = HEADER_SIZE + payloadSize;

  ensureBufferSize(totalSize);

  const msgType = success ? MSG_TASK_RESPONSE : MSG_TASK_ERROR;
  writeHeader(msgType, id, payloadSize as u32);

  let offset = HEADER_SIZE;

  // Write success flag
  store<u8>(changetype<usize>(messageBuffer) + offset, success ? 1 : 0);
  offset += 1;

  // Write result length
  store<u32>(changetype<usize>(messageBuffer) + offset, resultLength);
  offset += 4;

  // Write result data
  for (let i = 0; i < resultLength as i32; i++) {
    messageBuffer[offset + i] = resultData[i];
  }

  // Copy result
  const result = new StaticArray<u8>(totalSize);
  for (let i = 0; i < totalSize; i++) {
    result[i] = messageBuffer[i];
  }

  return result;
}

/**
 * Encode an error response
 * Payload format: [errorCode:u16][messageLength:u16][message:N][stackLength:u16][stack:N]
 */
export function encodeErrorResponse(
  id: u32,
  errorCode: u16,
  message: string,
  stack: string = ''
): StaticArray<u8> {
  const messageBytes = String.UTF8.encode(message);
  const messageLength = messageBytes.byteLength as u16;
  const stackBytes = String.UTF8.encode(stack);
  const stackLength = stackBytes.byteLength as u16;

  const payloadSize = 2 + 2 + messageLength + 2 + stackLength;
  const totalSize = HEADER_SIZE + payloadSize;

  ensureBufferSize(totalSize);

  writeHeader(MSG_TASK_ERROR, id, payloadSize as u32);

  let offset = HEADER_SIZE;

  // Write error code
  store<u16>(changetype<usize>(messageBuffer) + offset, errorCode);
  offset += 2;

  // Write message length
  store<u16>(changetype<usize>(messageBuffer) + offset, messageLength);
  offset += 2;

  // Write message
  const messagePtr = changetype<usize>(messageBytes);
  for (let i = 0; i < messageLength as i32; i++) {
    messageBuffer[offset + i] = load<u8>(messagePtr + i);
  }
  offset += messageLength as i32;

  // Write stack length
  store<u16>(changetype<usize>(messageBuffer) + offset, stackLength);
  offset += 2;

  // Write stack
  const stackPtr = changetype<usize>(stackBytes);
  for (let i = 0; i < stackLength as i32; i++) {
    messageBuffer[offset + i] = load<u8>(stackPtr + i);
  }

  // Copy result
  const result = new StaticArray<u8>(totalSize);
  for (let i = 0; i < totalSize; i++) {
    result[i] = messageBuffer[i];
  }

  return result;
}

/**
 * Encode a heartbeat request
 * Payload format: [workerIdLength:u16][workerId:N]
 */
export function encodeHeartbeatRequest(id: u32, workerId: string = ''): StaticArray<u8> {
  const workerIdBytes = String.UTF8.encode(workerId);
  const workerIdLength = workerIdBytes.byteLength as u16;

  const payloadSize = 2 + workerIdLength;
  const totalSize = HEADER_SIZE + payloadSize;

  ensureBufferSize(totalSize);

  writeHeader(MSG_HEARTBEAT_REQ, id, payloadSize as u32, 0, PRIORITY_HIGH);

  let offset = HEADER_SIZE;

  // Write worker ID length
  store<u16>(changetype<usize>(messageBuffer) + offset, workerIdLength);
  offset += 2;

  // Write worker ID
  const workerIdPtr = changetype<usize>(workerIdBytes);
  for (let i = 0; i < workerIdLength as i32; i++) {
    messageBuffer[offset + i] = load<u8>(workerIdPtr + i);
  }

  // Copy result
  const result = new StaticArray<u8>(totalSize);
  for (let i = 0; i < totalSize; i++) {
    result[i] = messageBuffer[i];
  }

  return result;
}

/**
 * Encode a heartbeat response
 * Payload format: [status:u8][taskCount:u32][memoryUsage:u64][uptime:u64]
 */
export function encodeHeartbeatResponse(
  id: u32,
  status: u8,
  taskCount: u32 = 0,
  memoryUsage: u64 = 0,
  uptime: u64 = 0
): StaticArray<u8> {
  const payloadSize = 1 + 4 + 8 + 8;
  const totalSize = HEADER_SIZE + payloadSize;

  ensureBufferSize(totalSize);

  writeHeader(MSG_HEARTBEAT_RES, id, payloadSize as u32, 0, PRIORITY_HIGH);

  let offset = HEADER_SIZE;

  // Write status (0=idle, 1=busy, 2=alive)
  store<u8>(changetype<usize>(messageBuffer) + offset, status);
  offset += 1;

  // Write task count
  store<u32>(changetype<usize>(messageBuffer) + offset, taskCount);
  offset += 4;

  // Write memory usage
  store<u64>(changetype<usize>(messageBuffer) + offset, memoryUsage);
  offset += 8;

  // Write uptime
  store<u64>(changetype<usize>(messageBuffer) + offset, uptime);

  // Copy result
  const result = new StaticArray<u8>(totalSize);
  for (let i = 0; i < totalSize; i++) {
    result[i] = messageBuffer[i];
  }

  return result;
}

/**
 * Decode heartbeat response
 * Returns: [status, taskCount, memoryUsageLow, memoryUsageHigh, uptimeLow, uptimeHigh]
 */
export function decodeHeartbeatResponse(buffer: StaticArray<u8>): StaticArray<u32> {
  const result = new StaticArray<u32>(6);
  const bufferPtr = changetype<usize>(buffer);

  let offset = HEADER_SIZE;

  // Status
  result[0] = load<u8>(bufferPtr + offset) as u32;
  offset += 1;

  // Task count
  result[1] = load<u32>(bufferPtr + offset);
  offset += 4;

  // Memory usage (split into low/high 32 bits)
  const memoryUsage = load<u64>(bufferPtr + offset);
  result[2] = (memoryUsage & 0xFFFFFFFF) as u32;
  result[3] = ((memoryUsage >> 32) & 0xFFFFFFFF) as u32;
  offset += 8;

  // Uptime (split into low/high 32 bits)
  const uptime = load<u64>(bufferPtr + offset);
  result[4] = (uptime & 0xFFFFFFFF) as u32;
  result[5] = ((uptime >> 32) & 0xFFFFFFFF) as u32;

  return result;
}

/**
 * Encode batch header
 * Payload format: [batchIdLength:u16][batchId:N][taskCount:u32][chunkIndex:u16][totalChunks:u16]
 */
export function encodeBatchHeader(
  id: u32,
  batchId: string,
  taskCount: u32,
  chunkIndex: u16 = 0,
  totalChunks: u16 = 1
): StaticArray<u8> {
  const batchIdBytes = String.UTF8.encode(batchId);
  const batchIdLength = batchIdBytes.byteLength as u16;

  const payloadSize = 2 + batchIdLength + 4 + 2 + 2;
  const totalSize = HEADER_SIZE + payloadSize;

  ensureBufferSize(totalSize);

  writeHeader(MSG_BATCH, id, payloadSize as u32);

  let offset = HEADER_SIZE;

  // Write batch ID length
  store<u16>(changetype<usize>(messageBuffer) + offset, batchIdLength);
  offset += 2;

  // Write batch ID
  const batchIdPtr = changetype<usize>(batchIdBytes);
  for (let i = 0; i < batchIdLength as i32; i++) {
    messageBuffer[offset + i] = load<u8>(batchIdPtr + i);
  }
  offset += batchIdLength as i32;

  // Write task count
  store<u32>(changetype<usize>(messageBuffer) + offset, taskCount);
  offset += 4;

  // Write chunk index
  store<u16>(changetype<usize>(messageBuffer) + offset, chunkIndex);
  offset += 2;

  // Write total chunks
  store<u16>(changetype<usize>(messageBuffer) + offset, totalChunks);

  // Copy result
  const result = new StaticArray<u8>(totalSize);
  for (let i = 0; i < totalSize; i++) {
    result[i] = messageBuffer[i];
  }

  return result;
}

/**
 * Get message type from buffer
 */
export function getMessageType(buffer: StaticArray<u8>): u8 {
  if (buffer.length < HEADER_SIZE) {
    return 0;
  }
  return load<u8>(changetype<usize>(buffer) + OFFSET_TYPE);
}

/**
 * Get message ID from buffer
 */
export function getMessageId(buffer: StaticArray<u8>): u32 {
  if (buffer.length < HEADER_SIZE) {
    return 0;
  }
  return load<u32>(changetype<usize>(buffer) + OFFSET_ID);
}

/**
 * Get message priority from buffer
 */
export function getMessagePriority(buffer: StaticArray<u8>): u8 {
  if (buffer.length < HEADER_SIZE) {
    return PRIORITY_NORMAL;
  }
  return load<u8>(changetype<usize>(buffer) + OFFSET_PRIORITY);
}

/**
 * Get message sequence from buffer
 */
export function getMessageSequence(buffer: StaticArray<u8>): u32 {
  if (buffer.length < HEADER_SIZE) {
    return 0;
  }
  return load<u32>(changetype<usize>(buffer) + OFFSET_SEQUENCE);
}

/**
 * Check if message has transfer flag
 */
export function hasTransferFlag(buffer: StaticArray<u8>): bool {
  if (buffer.length < HEADER_SIZE) {
    return false;
  }
  const flags = load<u16>(changetype<usize>(buffer) + OFFSET_FLAGS);
  return (flags & FLAG_HAS_TRANSFER) !== 0;
}

/**
 * Check if message is compressed
 */
export function isCompressed(buffer: StaticArray<u8>): bool {
  if (buffer.length < HEADER_SIZE) {
    return false;
  }
  const flags = load<u16>(changetype<usize>(buffer) + OFFSET_FLAGS);
  return (flags & FLAG_COMPRESSED) !== 0;
}

/**
 * Get header size constant
 */
export function getHeaderSize(): i32 {
  return HEADER_SIZE;
}

/**
 * Calculate checksum for payload (simple XOR-based)
 */
export function calculateChecksum(buffer: StaticArray<u8>, offset: i32, length: i32): u32 {
  let checksum: u32 = 0;

  for (let i = 0; i < length; i++) {
    checksum ^= (buffer[offset + i] as u32) << ((i % 4) * 8);
  }

  return checksum;
}
