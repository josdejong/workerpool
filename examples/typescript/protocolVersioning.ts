/**
 * Protocol Versioning Example (TypeScript)
 *
 * Demonstrates the protocol versioning system that enables
 * backward compatibility and feature negotiation between
 * main thread and workers.
 *
 * Protocol Version 2 adds:
 * - v: Protocol version number
 * - seq: Sequence number for ordering
 * - ack: Last acknowledged sequence
 * - priority: Message priority level
 * - ts: Timestamp when message was created
 *
 * Run with: npx tsx examples/typescript/protocolVersioning.ts
 */

import {
  // Protocol constants
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,

  // Message creation
  createMessage,
  isValidProtocolVersion,

  // Type guards
  isTaskRequest,
  isTaskSuccessResponse,
  isTaskErrorResponse,
  isHeartbeatRequest,

  // Types
  type MessageHeader,
  type TaskRequest,
  type TaskSuccessResponse,
  type SerializedError,

  // Priority
  MessagePriority,
  getMessagePriority,
  compareByPriority,
} from '../../dist/ts/full.js';

async function main(): Promise<void> {
  console.log('Protocol Versioning Example (TypeScript)\n');
  console.log('='.repeat(60));

  // ============================================================
  // Example 1: Protocol Version Constants
  // ============================================================
  console.log('\n1. Protocol Version Constants\n');

  console.log(`  Current Protocol Version: ${PROTOCOL_VERSION}`);
  console.log(`  Minimum Supported Version: ${MIN_PROTOCOL_VERSION}`);
  console.log(`  Version Range: v${MIN_PROTOCOL_VERSION} - v${PROTOCOL_VERSION}`);

  // ============================================================
  // Example 2: Creating Versioned Messages
  // ============================================================
  console.log('\n2. Creating Versioned Messages\n');

  // Create a basic task request with version header
  const taskRequest = createMessage<TaskRequest>(
    {
      id: 1,
      method: 'processData',
      params: [{ input: 'test' }],
    } as Omit<TaskRequest, keyof MessageHeader>,
    { priority: MessagePriority.NORMAL }
  );

  console.log('  Task Request with version header:');
  console.log(`    Version (v): ${taskRequest.v}`);
  console.log(`    ID: ${taskRequest.id}`);
  console.log(`    Method: ${taskRequest.method}`);
  console.log(`    Priority: ${taskRequest.priority}`);

  // Create a message with timestamp
  const timedRequest = createMessage<TaskRequest>(
    {
      id: 2,
      method: 'timedTask',
      params: [],
    } as Omit<TaskRequest, keyof MessageHeader>,
    { priority: MessagePriority.HIGH, includeTimestamp: true }
  );

  console.log('\n  Task Request with timestamp:');
  console.log(`    Version (v): ${timedRequest.v}`);
  console.log(`    ID: ${timedRequest.id}`);
  console.log(`    Priority: ${timedRequest.priority}`);
  console.log(`    Timestamp (ts): ${timedRequest.ts}`);
  console.log(`    Time: ${new Date(timedRequest.ts!).toISOString()}`);

  // ============================================================
  // Example 3: Version Validation
  // ============================================================
  console.log('\n3. Version Validation\n');

  const testMessages: MessageHeader[] = [
    { v: 1 },                    // Old v1 message
    { v: 2 },                    // Current v2 message
    {},                          // No version (defaults to v1)
    { v: 99 },                   // Future unsupported version
    { v: 0 },                    // Invalid version
  ];

  for (const msg of testMessages) {
    const valid = isValidProtocolVersion(msg);
    console.log(`  Version ${msg.v ?? 'undefined'}: ${valid ? 'VALID' : 'INVALID'}`);
  }

  // ============================================================
  // Example 4: Message Header Fields
  // ============================================================
  console.log('\n4. Message Header Fields (Protocol v2)\n');

  const fullMessage: MessageHeader = {
    v: PROTOCOL_VERSION,         // Protocol version
    seq: 42,                     // Sequence number
    ack: 41,                     // Last acknowledged sequence
    priority: MessagePriority.HIGH,
    ts: Date.now(),              // Timestamp
  };

  console.log('  Full message header:');
  console.log(`    v (version): ${fullMessage.v}`);
  console.log(`    seq (sequence): ${fullMessage.seq}`);
  console.log(`    ack (last ack): ${fullMessage.ack}`);
  console.log(`    priority: ${fullMessage.priority} (${MessagePriority[fullMessage.priority!]})`);
  console.log(`    ts (timestamp): ${fullMessage.ts}`);

  // ============================================================
  // Example 5: Type Guards for Messages
  // ============================================================
  console.log('\n5. Type Guards for Messages\n');

  const messages: unknown[] = [
    { id: 1, method: 'test', params: [] },
    { id: 2, result: 'success', error: null },
    { id: 3, result: null, error: { name: 'Error', message: 'Failed' } },
    { id: 4, method: '__workerpool-heartbeat__', workerId: 'w1' },
    { invalid: true },
  ];

  for (const msg of messages) {
    const types: string[] = [];
    if (isTaskRequest(msg)) types.push('TaskRequest');
    if (isTaskSuccessResponse(msg)) types.push('TaskSuccessResponse');
    if (isTaskErrorResponse(msg)) types.push('TaskErrorResponse');
    if (isHeartbeatRequest(msg)) types.push('HeartbeatRequest');
    if (types.length === 0) types.push('Unknown');

    console.log(`  ${JSON.stringify(msg).substring(0, 50)}...`);
    console.log(`    Type: ${types.join(', ')}`);
  }

  // ============================================================
  // Example 6: Backward Compatibility
  // ============================================================
  console.log('\n6. Backward Compatibility\n');

  // Simulate receiving a v1 message (no version field)
  const v1Message = {
    id: 100,
    method: 'legacyMethod',
    params: [1, 2, 3],
  };

  console.log('  Received v1 message (no version field):');
  console.log(`    ${JSON.stringify(v1Message)}`);

  // Check if valid (should be valid - defaults to v1)
  const isValid = isValidProtocolVersion(v1Message);
  console.log(`    Valid: ${isValid}`);

  // Get priority (should default to NORMAL)
  const priority = getMessagePriority(v1Message);
  console.log(`    Priority: ${priority} (${MessagePriority[priority]})`);

  // ============================================================
  // Example 7: Sequence Number Usage
  // ============================================================
  console.log('\n7. Sequence Number Usage\n');

  // Simulate a message exchange with sequence numbers
  interface SequencedMessage extends MessageHeader {
    id: number;
    payload: string;
  }

  let clientSeq = 0;
  let serverAck = 0;

  function createClientMessage(payload: string): SequencedMessage {
    return {
      v: PROTOCOL_VERSION,
      seq: ++clientSeq,
      ack: serverAck,
      id: clientSeq,
      payload,
    };
  }

  function processServerAck(ack: number): void {
    serverAck = ack;
  }

  const msg1 = createClientMessage('Hello');
  console.log(`  Client -> Server: seq=${msg1.seq}, ack=${msg1.ack}, payload="${msg1.payload}"`);

  processServerAck(1);
  const msg2 = createClientMessage('World');
  console.log(`  Client -> Server: seq=${msg2.seq}, ack=${msg2.ack}, payload="${msg2.payload}"`);

  processServerAck(2);
  const msg3 = createClientMessage('!');
  console.log(`  Client -> Server: seq=${msg3.seq}, ack=${msg3.ack}, payload="${msg3.payload}"`);

  // ============================================================
  // Example 8: Priority-Based Message Sorting
  // ============================================================
  console.log('\n8. Priority-Based Message Sorting\n');

  const unsortedMessages: MessageHeader[] = [
    { priority: MessagePriority.LOW },
    { priority: MessagePriority.CRITICAL },
    { priority: MessagePriority.NORMAL },
    { priority: MessagePriority.HIGH },
    {},  // No priority (defaults to NORMAL)
  ];

  console.log('  Before sorting:');
  unsortedMessages.forEach((m, i) =>
    console.log(`    [${i}] Priority: ${m.priority ?? 'undefined'} (${MessagePriority[getMessagePriority(m)]})`)
  );

  const sortedMessages = [...unsortedMessages].sort(compareByPriority);

  console.log('\n  After sorting (highest first):');
  sortedMessages.forEach((m, i) =>
    console.log(`    [${i}] Priority: ${m.priority ?? 'undefined'} (${MessagePriority[getMessagePriority(m)]})`)
  );

  // ============================================================
  // Example 9: Complete Message Lifecycle
  // ============================================================
  console.log('\n9. Complete Message Lifecycle\n');

  // 1. Create request
  const request = createMessage<TaskRequest>(
    {
      id: 1,
      method: 'compute',
      params: [10, 20],
    } as Omit<TaskRequest, keyof MessageHeader>,
    { priority: MessagePriority.HIGH, includeTimestamp: true }
  );

  console.log('  1. Request created:');
  console.log(`     v=${request.v}, id=${request.id}, priority=${request.priority}`);

  // 2. Simulate processing
  const processingStart = Date.now();
  await new Promise((r) => setTimeout(r, 10));
  const processingEnd = Date.now();

  // 3. Create response
  const response: TaskSuccessResponse = {
    v: PROTOCOL_VERSION,
    seq: 1,
    ack: request.seq || 0,
    ts: Date.now(),
    id: request.id,
    result: 30,
    error: null,
  };

  console.log('  2. Response created:');
  console.log(`     v=${response.v}, id=${response.id}, result=${response.result}`);
  console.log(`     Processing time: ${processingEnd - processingStart}ms`);

  // 4. Validate response
  if (isTaskSuccessResponse(response)) {
    console.log('  3. Response validated as TaskSuccessResponse');
  }

  console.log('\n' + '='.repeat(60));
  console.log('Protocol Versioning example completed!');
}

main().catch(console.error);
