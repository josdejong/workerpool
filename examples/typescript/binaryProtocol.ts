/**
 * Binary Protocol Example (TypeScript)
 *
 * Demonstrates the binary message protocol for efficient
 * wire transfer between main thread and workers.
 *
 * Binary Protocol Features:
 * - 20-byte header with magic number, version, type, flags
 * - Efficient encoding/decoding of task requests and responses
 * - Support for error responses with full stack traces
 * - Heartbeat messages for worker health monitoring
 * - Batch operations for high-throughput scenarios
 *
 * Run with: npx tsx examples/typescript/binaryProtocol.ts
 */

import {
  // Protocol constants
  MAGIC,
  BINARY_VERSION as VERSION,
  MSG_TASK_REQUEST,
  MSG_TASK_RESPONSE,
  MSG_TASK_ERROR,
  MSG_HEARTBEAT_REQ,
  MSG_HEARTBEAT_RES,
  MSG_BATCH,
  FLAG_HAS_TRANSFER,
  FLAG_COMPRESSED,
  PRIORITY_LOW,
  PRIORITY_NORMAL,
  PRIORITY_HIGH,
  PRIORITY_CRITICAL,
  ERR_METHOD_NOT_FOUND,
  ERR_TIMEOUT,
  ERR_CANCELLED,

  // Header operations
  getHeaderSize,
  writeHeader,
  readHeader,
  validateHeader,
  getPayload,

  // Sequence management
  resetSequence,
  nextSequence,

  // Message encoding
  encodeTaskRequest,
  decodeTaskRequest,
  encodeTaskResponse,
  encodeErrorResponse,
  decodeErrorResponse,
  encodeHeartbeatRequest,
  encodeHeartbeatResponse,
  decodeHeartbeatResponse,
  encodeBatchHeader,

  // Message helpers
  getMessageType,
  getMessageId,
  getBinaryMessagePriority,
  getMessageSequence,
  hasTransferFlag,
  isCompressed,
  calculateChecksum,
} from '../../dist/ts/full.js';

function formatHex(buffer: Uint8Array, limit = 40): string {
  const hex = Array.from(buffer.slice(0, limit))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  return buffer.length > limit ? hex + '...' : hex;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

async function main(): Promise<void> {
  console.log('Binary Protocol Example (TypeScript)\n');
  console.log('='.repeat(60));

  // Reset sequence for predictable output
  resetSequence();

  // ============================================================
  // Example 1: Protocol Constants
  // ============================================================
  console.log('\n1. Protocol Constants\n');

  console.log('  Magic Number:');
  console.log(`    Value: 0x${MAGIC.toString(16).toUpperCase()}`);
  console.log(`    ASCII: "${String.fromCharCode(MAGIC & 0xff)}${String.fromCharCode(MAGIC >> 8)}"`);

  console.log(`\n  Protocol Version: ${VERSION}`);
  console.log(`  Header Size: ${getHeaderSize()} bytes`);

  console.log('\n  Message Types:');
  console.log(`    MSG_TASK_REQUEST:   ${MSG_TASK_REQUEST}`);
  console.log(`    MSG_TASK_RESPONSE:  ${MSG_TASK_RESPONSE}`);
  console.log(`    MSG_TASK_ERROR:     ${MSG_TASK_ERROR}`);
  console.log(`    MSG_HEARTBEAT_REQ:  ${MSG_HEARTBEAT_REQ}`);
  console.log(`    MSG_HEARTBEAT_RES:  ${MSG_HEARTBEAT_RES}`);
  console.log(`    MSG_BATCH:          ${MSG_BATCH}`);

  console.log('\n  Priority Levels:');
  console.log(`    PRIORITY_LOW:      ${PRIORITY_LOW}`);
  console.log(`    PRIORITY_NORMAL:   ${PRIORITY_NORMAL}`);
  console.log(`    PRIORITY_HIGH:     ${PRIORITY_HIGH}`);
  console.log(`    PRIORITY_CRITICAL: ${PRIORITY_CRITICAL}`);

  console.log('\n  Flags:');
  console.log(`    FLAG_HAS_TRANSFER: 0x${FLAG_HAS_TRANSFER.toString(16)}`);
  console.log(`    FLAG_COMPRESSED:   0x${FLAG_COMPRESSED.toString(16)}`);

  // ============================================================
  // Example 2: Header Structure
  // ============================================================
  console.log('\n2. Header Structure (20 bytes)\n');

  console.log('  Offset | Size | Field');
  console.log('  -------|------|-------------------');
  console.log('  0      | 2    | Magic (0x5750)');
  console.log('  2      | 1    | Version');
  console.log('  3      | 1    | Message Type');
  console.log('  4      | 2    | Flags');
  console.log('  6      | 4    | Message ID');
  console.log('  10     | 4    | Payload Length');
  console.log('  14     | 4    | Sequence Number');
  console.log('  18     | 1    | Priority');
  console.log('  19     | 1    | Reserved');

  // Create a header and show its bytes
  resetSequence();
  const headerBuffer = new Uint8Array(20);
  writeHeader(headerBuffer, MSG_TASK_REQUEST, 42, 100, FLAG_HAS_TRANSFER, PRIORITY_HIGH);

  console.log('\n  Example header bytes:');
  console.log(`    ${formatHex(headerBuffer)}`);

  // ============================================================
  // Example 3: Reading and Validating Headers
  // ============================================================
  console.log('\n3. Reading and Validating Headers\n');

  // Read the header we just created
  const [magic, version, type, flags, id, length, seq, priority] = readHeader(headerBuffer);

  console.log('  Parsed header values:');
  console.log(`    Magic:    0x${magic.toString(16).toUpperCase()} (valid: ${magic === MAGIC})`);
  console.log(`    Version:  ${version}`);
  console.log(`    Type:     ${type} (MSG_TASK_REQUEST)`);
  console.log(`    Flags:    0x${flags.toString(16)} (HAS_TRANSFER: ${(flags & FLAG_HAS_TRANSFER) !== 0})`);
  console.log(`    ID:       ${id}`);
  console.log(`    Length:   ${length}`);
  console.log(`    Sequence: ${seq}`);
  console.log(`    Priority: ${priority} (HIGH)`);

  // Validate header
  console.log(`\n  Header validation: ${validateHeader(headerBuffer) ? 'VALID' : 'INVALID'}`);

  // Test with invalid header
  const invalidBuffer = new Uint8Array(20);
  invalidBuffer[0] = 0x00; // Wrong magic
  console.log(`  Invalid header test: ${validateHeader(invalidBuffer) ? 'VALID' : 'INVALID'}`);

  // ============================================================
  // Example 4: Task Request Encoding
  // ============================================================
  console.log('\n4. Task Request Encoding\n');

  resetSequence();

  const taskParams = new TextEncoder().encode(JSON.stringify({ x: 10, y: 20 }));
  const taskBuffer = encodeTaskRequest(
    123, // ID
    'calculateSum', // Method
    taskParams, // Params as bytes
    PRIORITY_HIGH, // Priority
    true // Has transfer
  );

  console.log('  Encoded task request:');
  console.log(`    ID: 123`);
  console.log(`    Method: "calculateSum"`);
  console.log(`    Params: {"x": 10, "y": 20}`);
  console.log(`    Priority: HIGH`);
  console.log(`    Has Transfer: true`);
  console.log(`\n    Total size: ${formatSize(taskBuffer.length)}`);
  console.log(`    Header: ${formatHex(taskBuffer.slice(0, 20))}`);

  // Decode it back
  const decoded = decodeTaskRequest(taskBuffer);
  console.log('\n  Decoded values:');
  console.log(`    ID: ${decoded.id}`);
  console.log(`    Method: "${decoded.method}"`);
  console.log(`    Params: ${new TextDecoder().decode(decoded.params)}`);

  // ============================================================
  // Example 5: Task Response Encoding
  // ============================================================
  console.log('\n5. Task Response Encoding\n');

  resetSequence();

  // Success response
  const resultData = new TextEncoder().encode(JSON.stringify({ result: 30 }));
  const successBuffer = encodeTaskResponse(123, true, resultData);

  console.log('  Success response:');
  console.log(`    ID: 123`);
  console.log(`    Type: ${getMessageType(successBuffer)} (MSG_TASK_RESPONSE)`);
  console.log(`    Size: ${formatSize(successBuffer.length)}`);

  // Error response
  const errorBuffer = encodeTaskResponse(124, false, new Uint8Array([1]));

  console.log('\n  Error response:');
  console.log(`    ID: 124`);
  console.log(`    Type: ${getMessageType(errorBuffer)} (MSG_TASK_ERROR)`);

  // ============================================================
  // Example 6: Detailed Error Response
  // ============================================================
  console.log('\n6. Detailed Error Response\n');

  resetSequence();

  const detailedErrorBuffer = encodeErrorResponse(
    456,
    ERR_METHOD_NOT_FOUND,
    'Method "unknownMethod" not found in worker',
    'Error: Method "unknownMethod" not found\n    at Worker.handleMessage (worker.js:42)\n    at process.emit (events.js:315)'
  );

  console.log('  Encoded error response:');
  console.log(`    ID: 456`);
  console.log(`    Error Code: ${ERR_METHOD_NOT_FOUND} (ERR_METHOD_NOT_FOUND)`);
  console.log(`    Size: ${formatSize(detailedErrorBuffer.length)}`);

  // Decode it
  const decodedError = decodeErrorResponse(detailedErrorBuffer);
  console.log('\n  Decoded error:');
  console.log(`    ID: ${decodedError.id}`);
  console.log(`    Code: ${decodedError.errorCode}`);
  console.log(`    Message: "${decodedError.message}"`);
  console.log(`    Stack (first line): "${decodedError.stack.split('\n')[0]}"`);

  // ============================================================
  // Example 7: Heartbeat Messages
  // ============================================================
  console.log('\n7. Heartbeat Messages\n');

  resetSequence();

  // Heartbeat request
  const heartbeatReq = encodeHeartbeatRequest(789, 'worker-001');
  console.log('  Heartbeat request:');
  console.log(`    ID: 789`);
  console.log(`    Worker ID: "worker-001"`);
  console.log(`    Type: ${getMessageType(heartbeatReq)} (MSG_HEARTBEAT_REQ)`);
  console.log(`    Priority: ${getBinaryMessagePriority(heartbeatReq)} (HIGH - heartbeats are high priority)`);
  console.log(`    Size: ${formatSize(heartbeatReq.length)}`);

  // Heartbeat response
  resetSequence();
  const memoryUsage = BigInt(256 * 1024 * 1024); // 256 MB
  const uptime = BigInt(3600000); // 1 hour
  const heartbeatRes = encodeHeartbeatResponse(789, 1, 15, memoryUsage, uptime);

  console.log('\n  Heartbeat response:');
  console.log(`    ID: 789`);
  console.log(`    Status: 1 (busy)`);
  console.log(`    Task Count: 15`);
  console.log(`    Memory: ${Number(memoryUsage) / (1024 * 1024)} MB`);
  console.log(`    Uptime: ${Number(uptime) / 1000}s`);
  console.log(`    Size: ${formatSize(heartbeatRes.length)}`);

  // Decode response
  const decodedHeartbeat = decodeHeartbeatResponse(heartbeatRes);
  console.log('\n  Decoded heartbeat response:');
  console.log(`    ID: ${decodedHeartbeat.id}`);
  console.log(`    Status: ${decodedHeartbeat.status}`);
  console.log(`    Tasks: ${decodedHeartbeat.taskCount}`);

  // ============================================================
  // Example 8: Batch Operations
  // ============================================================
  console.log('\n8. Batch Operations\n');

  resetSequence();

  const batchHeader = encodeBatchHeader(
    1000, // ID
    'batch-abc123', // Batch ID
    100, // Total tasks in batch
    0, // Chunk index
    10 // Tasks in this chunk
  );

  console.log('  Batch header:');
  console.log(`    Batch ID: "batch-abc123"`);
  console.log(`    Total Tasks: 100`);
  console.log(`    Chunk Index: 0`);
  console.log(`    Chunk Size: 10`);
  console.log(`    Type: ${getMessageType(batchHeader)} (MSG_BATCH)`);
  console.log(`    Size: ${formatSize(batchHeader.length)}`);

  // ============================================================
  // Example 9: Sequence Numbers
  // ============================================================
  console.log('\n9. Sequence Numbers\n');

  resetSequence();

  console.log('  Sequence number progression:');
  for (let i = 0; i < 5; i++) {
    const seq = nextSequence();
    console.log(`    Message ${i + 1}: seq=${seq}`);
  }

  console.log('\n  Sequence in encoded messages:');
  resetSequence();
  for (let i = 0; i < 3; i++) {
    const buf = encodeTaskRequest(i, `method${i}`, new Uint8Array(0));
    console.log(`    Task ${i}: seq=${getMessageSequence(buf)}`);
  }

  // ============================================================
  // Example 10: Message Helper Functions
  // ============================================================
  console.log('\n10. Message Helper Functions\n');

  resetSequence();
  const testBuffer = encodeTaskRequest(
    42,
    'testMethod',
    new TextEncoder().encode('test'),
    PRIORITY_CRITICAL,
    true
  );

  console.log('  Analyzing encoded message:');
  console.log(`    getMessageType():     ${getMessageType(testBuffer)} (MSG_TASK_REQUEST)`);
  console.log(`    getMessageId():       ${getMessageId(testBuffer)}`);
  console.log(`    getMessagePriority(): ${getBinaryMessagePriority(testBuffer)} (CRITICAL)`);
  console.log(`    getMessageSequence(): ${getMessageSequence(testBuffer)}`);
  console.log(`    hasTransferFlag():    ${hasTransferFlag(testBuffer)}`);
  console.log(`    isCompressed():       ${isCompressed(testBuffer)}`);

  // Get payload
  const payload = getPayload(testBuffer);
  console.log(`\n  Payload extraction:`);
  console.log(`    Header size: ${getHeaderSize()} bytes`);
  console.log(`    Payload size: ${payload.length} bytes`);

  // ============================================================
  // Example 11: Checksum Calculation
  // ============================================================
  console.log('\n11. Checksum Calculation\n');

  const data1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const data2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]); // Last byte different

  const checksum1 = calculateChecksum(data1, 0, data1.length);
  const checksum2 = calculateChecksum(data2, 0, data2.length);

  console.log('  Checksum comparison:');
  console.log(`    Data 1: [${data1.join(', ')}]`);
  console.log(`    Data 2: [${data2.join(', ')}]`);
  console.log(`    Checksum 1: ${checksum1}`);
  console.log(`    Checksum 2: ${checksum2}`);
  console.log(`    Match: ${checksum1 === checksum2}`);

  // Partial checksum
  const partialChecksum = calculateChecksum(data1, 2, 4);
  console.log(`\n  Partial checksum (bytes 2-5):`);
  console.log(`    Data slice: [${Array.from(data1.slice(2, 6)).join(', ')}]`);
  console.log(`    Checksum: ${partialChecksum}`);

  // ============================================================
  // Example 12: Size Comparison with JSON
  // ============================================================
  console.log('\n12. Size Comparison with JSON\n');

  const complexParams = {
    operation: 'processData',
    data: {
      values: [1, 2, 3, 4, 5],
      metadata: {
        timestamp: Date.now(),
        source: 'sensor-001',
      },
    },
    options: {
      async: true,
      timeout: 5000,
    },
  };

  resetSequence();
  const jsonMessage = JSON.stringify({
    id: 1,
    method: 'processData',
    params: [complexParams],
  });

  const binaryMessage = encodeTaskRequest(
    1,
    'processData',
    new TextEncoder().encode(JSON.stringify([complexParams]))
  );

  console.log('  Message size comparison:');
  console.log(`    JSON:   ${formatSize(jsonMessage.length)}`);
  console.log(`    Binary: ${formatSize(binaryMessage.length)}`);
  console.log(`    Overhead: ${binaryMessage.length - jsonMessage.length} bytes (header)`);

  // For small messages, show percentage
  const ratio = (binaryMessage.length / jsonMessage.length) * 100;
  console.log(`    Ratio: ${ratio.toFixed(1)}% of JSON size`);

  // ============================================================
  // Example 13: Error Code Categories
  // ============================================================
  console.log('\n13. Error Code Categories\n');

  const errorCodes = [
    { code: ERR_METHOD_NOT_FOUND, name: 'ERR_METHOD_NOT_FOUND', category: 'Task Error (3xxx)' },
    { code: ERR_TIMEOUT, name: 'ERR_TIMEOUT', category: 'Task Error (3xxx)' },
    { code: ERR_CANCELLED, name: 'ERR_CANCELLED', category: 'Task Error (3xxx)' },
  ];

  console.log('  Available error codes:');
  for (const { code, name, category } of errorCodes) {
    console.log(`    ${code}: ${name} (${category})`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Binary Protocol example completed!');
}

main().catch(console.error);
