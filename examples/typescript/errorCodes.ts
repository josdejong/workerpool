/**
 * Error Codes Example (TypeScript)
 *
 * Demonstrates the standardized error code system for consistent
 * error identification and handling across the messaging protocol.
 *
 * Error Code Categories:
 * - 1xxx: Worker/Pool errors
 * - 2xxx: Protocol errors
 * - 3xxx: Task execution errors
 * - 4xxx: Resource errors
 * - 5xxx: Communication errors
 *
 * Run with: npx tsx examples/typescript/errorCodes.ts
 */

import {
  // Error code enums
  WorkerErrorCode,
  ProtocolErrorCode,
  TaskErrorCode,
  ResourceErrorCode,
  CommunicationErrorCode,

  // Helper functions
  getErrorMessage,
  getErrorCategory,
  isRetryableError,
  isFatalError,
  isWorkerError,
  isProtocolError,
  isTaskError,
  isResourceError,
  isCommunicationError,
  ErrorMessages,

  // Types
  type ErrorCode,
} from '../../dist/ts/full.js';

async function main(): Promise<void> {
  console.log('Error Codes Example (TypeScript)\n');
  console.log('='.repeat(60));

  // ============================================================
  // Example 1: Worker Error Codes (1xxx)
  // ============================================================
  console.log('\n1. Worker Error Codes (1xxx)\n');

  const workerErrors = [
    WorkerErrorCode.WORKER_CRASHED,
    WorkerErrorCode.WORKER_INIT_FAILED,
    WorkerErrorCode.WORKER_UNRESPONSIVE,
    WorkerErrorCode.WORKER_TERMINATED,
    WorkerErrorCode.NO_WORKERS_AVAILABLE,
    WorkerErrorCode.POOL_TERMINATED,
    WorkerErrorCode.POOL_QUEUE_FULL,
    WorkerErrorCode.WORKER_SPAWN_FAILED,
  ];

  for (const code of workerErrors) {
    console.log(`  ${code}: ${getErrorMessage(code)}`);
  }

  // ============================================================
  // Example 2: Protocol Error Codes (2xxx)
  // ============================================================
  console.log('\n2. Protocol Error Codes (2xxx)\n');

  const protocolErrors = [
    ProtocolErrorCode.INVALID_MESSAGE,
    ProtocolErrorCode.VERSION_MISMATCH,
    ProtocolErrorCode.SERIALIZATION_FAILED,
    ProtocolErrorCode.DESERIALIZATION_FAILED,
    ProtocolErrorCode.SEQUENCE_ERROR,
  ];

  for (const code of protocolErrors) {
    console.log(`  ${code}: ${getErrorMessage(code)}`);
  }

  // ============================================================
  // Example 3: Task Error Codes (3xxx)
  // ============================================================
  console.log('\n3. Task Error Codes (3xxx)\n');

  const taskErrors = [
    TaskErrorCode.METHOD_NOT_FOUND,
    TaskErrorCode.INVALID_PARAMS,
    TaskErrorCode.EXECUTION_FAILED,
    TaskErrorCode.CANCELLED,
    TaskErrorCode.TIMEOUT,
    TaskErrorCode.ABORTED,
  ];

  for (const code of taskErrors) {
    console.log(`  ${code}: ${getErrorMessage(code)}`);
  }

  // ============================================================
  // Example 4: Resource Error Codes (4xxx)
  // ============================================================
  console.log('\n4. Resource Error Codes (4xxx)\n');

  const resourceErrors = [
    ResourceErrorCode.OUT_OF_MEMORY,
    ResourceErrorCode.SAB_UNAVAILABLE,
    ResourceErrorCode.ATOMICS_UNAVAILABLE,
    ResourceErrorCode.WASM_UNSUPPORTED,
    ResourceErrorCode.BUFFER_OVERFLOW,
  ];

  for (const code of resourceErrors) {
    console.log(`  ${code}: ${getErrorMessage(code)}`);
  }

  // ============================================================
  // Example 5: Communication Error Codes (5xxx)
  // ============================================================
  console.log('\n5. Communication Error Codes (5xxx)\n');

  const commErrors = [
    CommunicationErrorCode.CONNECTION_FAILED,
    CommunicationErrorCode.CONNECTION_LOST,
    CommunicationErrorCode.SEND_FAILED,
    CommunicationErrorCode.CHANNEL_CLOSED,
    CommunicationErrorCode.BACKPRESSURE_EXCEEDED,
  ];

  for (const code of commErrors) {
    console.log(`  ${code}: ${getErrorMessage(code)}`);
  }

  // ============================================================
  // Example 6: Error Category Detection
  // ============================================================
  console.log('\n6. Error Category Detection\n');

  const testCodes: ErrorCode[] = [
    WorkerErrorCode.WORKER_CRASHED,
    ProtocolErrorCode.INVALID_MESSAGE,
    TaskErrorCode.TIMEOUT,
    ResourceErrorCode.OUT_OF_MEMORY,
    CommunicationErrorCode.CONNECTION_LOST,
  ];

  for (const code of testCodes) {
    const category = getErrorCategory(code);
    console.log(`  Code ${code} -> Category: ${category}`);
  }

  // ============================================================
  // Example 7: Type Guard Functions
  // ============================================================
  console.log('\n7. Type Guard Functions\n');

  const unknownCode = 1001; // WorkerErrorCode.WORKER_CRASHED

  console.log(`  isWorkerError(${unknownCode}): ${isWorkerError(unknownCode)}`);
  console.log(`  isProtocolError(${unknownCode}): ${isProtocolError(unknownCode)}`);
  console.log(`  isTaskError(${unknownCode}): ${isTaskError(unknownCode)}`);
  console.log(`  isResourceError(${unknownCode}): ${isResourceError(unknownCode)}`);
  console.log(`  isCommunicationError(${unknownCode}): ${isCommunicationError(unknownCode)}`);

  // ============================================================
  // Example 8: Retryable vs Fatal Errors
  // ============================================================
  console.log('\n8. Retryable vs Fatal Errors\n');

  console.log('  Retryable Errors:');
  const retryableExamples: ErrorCode[] = [
    WorkerErrorCode.WORKER_CRASHED,
    WorkerErrorCode.WORKER_UNRESPONSIVE,
    TaskErrorCode.TIMEOUT,
    CommunicationErrorCode.CONNECTION_LOST,
  ];

  for (const code of retryableExamples) {
    console.log(`    ${code} (${getErrorCategory(code)}): retryable=${isRetryableError(code)}`);
  }

  console.log('\n  Fatal Errors:');
  const fatalExamples: ErrorCode[] = [
    WorkerErrorCode.POOL_TERMINATED,
    ResourceErrorCode.OUT_OF_MEMORY,
    ResourceErrorCode.SAB_UNAVAILABLE,
  ];

  for (const code of fatalExamples) {
    console.log(`    ${code} (${getErrorCategory(code)}): fatal=${isFatalError(code)}`);
  }

  // ============================================================
  // Example 9: Custom Error Handling Pattern
  // ============================================================
  console.log('\n9. Custom Error Handling Pattern\n');

  interface TaskError {
    code: ErrorCode;
    message: string;
    retryCount?: number;
  }

  function handleTaskError(error: TaskError): 'retry' | 'abort' | 'fallback' {
    const { code, retryCount = 0 } = error;

    // Fatal errors - abort immediately
    if (isFatalError(code)) {
      console.log(`  ABORT: Fatal error ${code} - ${getErrorMessage(code)}`);
      return 'abort';
    }

    // Retryable errors with retry limit
    if (isRetryableError(code) && retryCount < 3) {
      console.log(`  RETRY: Retryable error ${code} (attempt ${retryCount + 1}/3)`);
      return 'retry';
    }

    // Non-retryable or max retries exceeded - fallback
    console.log(`  FALLBACK: ${getErrorMessage(code)}`);
    return 'fallback';
  }

  // Simulate error handling
  handleTaskError({ code: TaskErrorCode.TIMEOUT, message: 'Task timed out', retryCount: 0 });
  handleTaskError({ code: TaskErrorCode.TIMEOUT, message: 'Task timed out', retryCount: 3 });
  handleTaskError({ code: ResourceErrorCode.OUT_OF_MEMORY, message: 'OOM' });

  // ============================================================
  // Example 10: Error Code Lookup Table
  // ============================================================
  console.log('\n10. All Error Messages\n');

  console.log('  Total error codes defined:', Object.keys(ErrorMessages).length);

  // Count by category
  const allCodes = Object.keys(ErrorMessages).map(Number);
  const workerCount = allCodes.filter(isWorkerError).length;
  const protocolCount = allCodes.filter(isProtocolError).length;
  const taskCount = allCodes.filter(isTaskError).length;
  const resourceCount = allCodes.filter(isResourceError).length;
  const commCount = allCodes.filter(isCommunicationError).length;

  console.log(`  Worker errors (1xxx): ${workerCount}`);
  console.log(`  Protocol errors (2xxx): ${protocolCount}`);
  console.log(`  Task errors (3xxx): ${taskCount}`);
  console.log(`  Resource errors (4xxx): ${resourceCount}`);
  console.log(`  Communication errors (5xxx): ${commCount}`);

  console.log('\n' + '='.repeat(60));
  console.log('Error Codes example completed!');
}

main().catch(console.error);
