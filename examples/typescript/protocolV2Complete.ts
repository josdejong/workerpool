/**
 * Protocol V2 Complete Example (TypeScript)
 *
 * A comprehensive example demonstrating all Protocol V2 features
 * working together in a realistic worker pool scenario.
 *
 * Features demonstrated:
 * - Protocol versioning and validation
 * - Message priority levels
 * - Standardized error codes
 * - Heartbeat monitoring
 * - Binary protocol encoding
 * - Type guards and message handling
 *
 * Run with: npx tsx examples/typescript/protocolV2Complete.ts
 */

import {
  // Protocol constants
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  TERMINATE_METHOD_ID,
  CLEANUP_METHOD_ID,
  HEARTBEAT_METHOD_ID,

  // Priority
  MessagePriority,
  getMessagePriority,
  compareByPriority,

  // Message creation and validation
  createMessage,
  isValidProtocolVersion,

  // Type guards
  isTaskRequest,
  isTaskSuccessResponse,
  isTaskErrorResponse,
  isHeartbeatRequest,
  isHeartbeatResponse,
  isCleanupRequest,
  isWorkerEvent,

  // Error codes
  WorkerErrorCode,
  TaskErrorCode,
  CommunicationErrorCode,
  getErrorMessage,
  isRetryableError,
  isFatalError,
  getErrorCategory,

  // Heartbeat
  HeartbeatMonitor,
  createHeartbeatRequest,
  createHeartbeatResponse,

  // Binary protocol
  encodeTaskRequest,
  decodeTaskRequest,
  encodeErrorResponse,
  decodeErrorResponse,
  getMessageType,
  getBinaryMessagePriority as getBinaryPriority,
  validateHeader,
  PRIORITY_HIGH,
  PRIORITY_NORMAL,
  MSG_TASK_REQUEST,

  // Types
  type MessageHeader,
  type TaskRequest,
  type TaskSuccessResponse,
  type TaskErrorResponse,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type SerializedError,
} from '../../dist/ts/full.js';

// ============================================================
// Simulated Worker Pool with Protocol V2
// ============================================================

interface Worker {
  id: string;
  status: 'idle' | 'busy' | 'unresponsive';
  taskCount: number;
  lastSeen: number;
}

interface Task {
  id: number;
  method: string;
  params: unknown[];
  priority: MessagePriority;
  createdAt: number;
}

class SimulatedWorkerPool {
  private workers: Map<string, Worker> = new Map();
  private taskQueue: Task[] = [];
  private messageId = 0;
  private heartbeatMonitor: HeartbeatMonitor;
  private eventLog: string[] = [];

  constructor(workerCount: number) {
    // Initialize workers
    for (let i = 0; i < workerCount; i++) {
      const id = `worker-${i + 1}`;
      this.workers.set(id, {
        id,
        status: 'idle',
        taskCount: 0,
        lastSeen: Date.now(),
      });
    }

    // Initialize heartbeat monitor
    this.heartbeatMonitor = new HeartbeatMonitor(
      (workerId, request) => this.sendHeartbeat(workerId, request),
      {
        interval: 5000,
        timeout: 3000,
        maxMissed: 3,
        onUnresponsive: (workerId) => {
          this.log(`[ALERT] Worker ${workerId} marked as unresponsive`);
          const worker = this.workers.get(workerId);
          if (worker) {
            worker.status = 'unresponsive';
          }
        },
        onRecovered: (workerId) => {
          this.log(`[RECOVERED] Worker ${workerId} is responding again`);
        },
      }
    );

    // Register workers with heartbeat monitor
    this.workers.forEach((_, workerId) => {
      this.heartbeatMonitor.registerWorker(workerId);
    });
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().substring(11, 23);
    const entry = `[${timestamp}] ${message}`;
    this.eventLog.push(entry);
    console.log(`  ${entry}`);
  }

  private sendHeartbeat(workerId: string, request: HeartbeatRequest): void {
    this.log(`Heartbeat sent to ${workerId}`);
    // Simulate response
    const worker = this.workers.get(workerId);
    if (worker && worker.status !== 'unresponsive') {
      const response = createHeartbeatResponse(request.id, worker.status, {
        taskCount: worker.taskCount,
      });
      this.heartbeatMonitor.handleResponse(workerId, response);
      worker.lastSeen = Date.now();
    }
  }

  private nextMessageId(): number {
    return ++this.messageId;
  }

  // Submit a task with priority
  submitTask(method: string, params: unknown[], priority = MessagePriority.NORMAL): number {
    const id = this.nextMessageId();
    const task: Task = {
      id,
      method,
      params,
      priority,
      createdAt: Date.now(),
    };

    this.taskQueue.push(task);

    // Sort by priority (highest first)
    this.taskQueue.sort((a, b) => b.priority - a.priority);

    const priorityName = MessagePriority[priority];
    this.log(`Task ${id} submitted: ${method} (priority: ${priorityName})`);

    return id;
  }

  // Process the next task from queue
  processNextTask(): TaskSuccessResponse | TaskErrorResponse | null {
    if (this.taskQueue.length === 0) {
      return null;
    }

    // Find an idle worker using Array.from to avoid Map iterator issues
    let idleWorker: Worker | null = null;
    const workerList = Array.from(this.workers.values());
    for (let i = 0; i < workerList.length; i++) {
      if (workerList[i].status === 'idle') {
        idleWorker = workerList[i];
        break;
      }
    }

    if (!idleWorker) {
      this.log('No idle workers available');
      return null;
    }

    const task = this.taskQueue.shift()!;
    idleWorker.status = 'busy';
    idleWorker.taskCount++;

    this.log(`Task ${task.id} assigned to ${idleWorker.id}`);

    // Simulate task execution
    const success = Math.random() > 0.2; // 80% success rate

    if (success) {
      const result = `Result for ${task.method}`;
      idleWorker.status = 'idle';

      const response: TaskSuccessResponse = {
        v: PROTOCOL_VERSION,
        id: task.id,
        result,
        error: null,
      };

      this.log(`Task ${task.id} completed successfully`);
      return response;
    } else {
      idleWorker.status = 'idle';

      // Create error with standardized code
      const errorCode = TaskErrorCode.EXECUTION_FAILED;
      const errorResponse: TaskErrorResponse = {
        v: PROTOCOL_VERSION,
        id: task.id,
        result: null,
        error: {
          name: 'ExecutionError',
          message: `Task ${task.method} failed`,
          stack: 'at SimulatedWorkerPool.processNextTask',
          code: errorCode,
        },
      };

      this.log(`Task ${task.id} failed: ${getErrorMessage(errorCode)}`);
      return errorResponse;
    }
  }

  // Handle incoming message with type guards
  handleMessage(message: unknown): void {
    // Validate protocol version
    if (!isValidProtocolVersion(message as MessageHeader)) {
      this.log('Rejected message: invalid protocol version');
      return;
    }

    if (isTaskRequest(message)) {
      const req = message as TaskRequest;
      this.log(`Received task request: ${req.method}`);
      const priority = getMessagePriority(req);
      this.submitTask(req.method, req.params || [], priority);
    } else if (isTaskSuccessResponse(message)) {
      const res = message as TaskSuccessResponse;
      this.log(`Received success response for task ${res.id}`);
    } else if (isTaskErrorResponse(message)) {
      const res = message as TaskErrorResponse;
      const error = res.error as SerializedError;
      this.log(`Received error response for task ${res.id}: ${error.message}`);
      if (error.code && isRetryableError(error.code)) {
        this.log(`Error is retryable: ${getErrorCategory(error.code)}`);
      }
    } else if (isHeartbeatRequest(message)) {
      const req = message as HeartbeatRequest;
      this.log(`Received heartbeat request for worker ${req.workerId}`);
    } else if (isHeartbeatResponse(message)) {
      const res = message as HeartbeatResponse;
      this.log(`Received heartbeat response: status=${res.status}`);
    } else if (isCleanupRequest(message)) {
      this.log('Received cleanup request');
    } else if (isWorkerEvent(message)) {
      this.log('Received worker event');
    } else {
      this.log('Received unknown message type');
    }
  }

  // Create a properly formatted task request
  createTaskRequest(method: string, params: unknown[], priority = MessagePriority.NORMAL): TaskRequest {
    const request = createMessage<TaskRequest>(
      {
        id: this.nextMessageId(),
        method,
        params,
      } as Omit<TaskRequest, keyof MessageHeader>,
      { priority, includeTimestamp: true }
    );

    return request;
  }

  // Get pool statistics
  getStats(): {
    totalWorkers: number;
    idleWorkers: number;
    busyWorkers: number;
    unresponsiveWorkers: number;
    queuedTasks: number;
    tasksByPriority: Record<string, number>;
  } {
    let idle = 0, busy = 0, unresponsive = 0;
    this.workers.forEach((worker) => {
      if (worker.status === 'idle') idle++;
      else if (worker.status === 'busy') busy++;
      else unresponsive++;
    });

    const tasksByPriority: Record<string, number> = {
      CRITICAL: 0,
      HIGH: 0,
      NORMAL: 0,
      LOW: 0,
    };
    this.taskQueue.forEach((task) => {
      tasksByPriority[MessagePriority[task.priority]]++;
    });

    return {
      totalWorkers: this.workers.size,
      idleWorkers: idle,
      busyWorkers: busy,
      unresponsiveWorkers: unresponsive,
      queuedTasks: this.taskQueue.length,
      tasksByPriority,
    };
  }

  getEventLog(): string[] {
    return this.eventLog;
  }

  cleanup(): void {
    this.heartbeatMonitor.stop();
    this.workers.forEach((_, workerId) => {
      this.heartbeatMonitor.unregisterWorker(workerId);
    });
  }
}

// ============================================================
// Main Example
// ============================================================

async function main(): Promise<void> {
  console.log('Protocol V2 Complete Example (TypeScript)\n');
  console.log('='.repeat(60));

  // ============================================================
  // Part 1: Protocol Version Information
  // ============================================================
  console.log('\n1. Protocol Version Information\n');

  console.log(`  Current Version: ${PROTOCOL_VERSION}`);
  console.log(`  Minimum Supported: ${MIN_PROTOCOL_VERSION}`);
  console.log(`  Special Method IDs:`);
  console.log(`    Terminate: ${TERMINATE_METHOD_ID}`);
  console.log(`    Cleanup: ${CLEANUP_METHOD_ID}`);
  console.log(`    Heartbeat: ${HEARTBEAT_METHOD_ID}`);

  // ============================================================
  // Part 2: Initialize Worker Pool
  // ============================================================
  console.log('\n2. Initialize Worker Pool\n');

  const pool = new SimulatedWorkerPool(3);
  console.log('  Created pool with 3 workers');

  const initialStats = pool.getStats();
  console.log(`  Initial state: ${initialStats.idleWorkers} idle, ${initialStats.busyWorkers} busy`);

  // ============================================================
  // Part 3: Submit Tasks with Different Priorities
  // ============================================================
  console.log('\n3. Submit Tasks with Different Priorities\n');

  // Submit tasks in random priority order
  pool.submitTask('backgroundSync', [], MessagePriority.LOW);
  pool.submitTask('userRequest', ['click'], MessagePriority.HIGH);
  pool.submitTask('processData', [{ data: 'test' }], MessagePriority.NORMAL);
  pool.submitTask('criticalAlert', ['system'], MessagePriority.CRITICAL);
  pool.submitTask('logEvent', ['info'], MessagePriority.LOW);

  const afterSubmit = pool.getStats();
  console.log(`\n  Queue status after submissions:`);
  console.log(`    Total queued: ${afterSubmit.queuedTasks}`);
  console.log(`    By priority: ${JSON.stringify(afterSubmit.tasksByPriority)}`);

  // ============================================================
  // Part 4: Process Tasks (Priority Order)
  // ============================================================
  console.log('\n4. Process Tasks (Priority Order)\n');

  // Process all tasks
  let result;
  while ((result = pool.processNextTask()) !== null) {
    // Results are already logged by the pool
    await new Promise((r) => setTimeout(r, 50)); // Small delay for realism
  }

  // ============================================================
  // Part 5: Handle Various Message Types
  // ============================================================
  console.log('\n5. Handle Various Message Types\n');

  // Create and handle different message types
  const taskReq = pool.createTaskRequest('compute', [1, 2, 3], MessagePriority.HIGH);
  console.log(`\n  Created task request:`);
  console.log(`    v=${taskReq.v}, id=${taskReq.id}, method=${taskReq.method}, priority=${taskReq.priority}`);

  pool.handleMessage(taskReq);

  // Handle success response
  const successResponse: TaskSuccessResponse = {
    v: PROTOCOL_VERSION,
    id: 100,
    result: 'completed',
    error: null,
  };
  pool.handleMessage(successResponse);

  // Handle error response with error code
  const errorResponse: TaskErrorResponse = {
    v: PROTOCOL_VERSION,
    id: 101,
    result: null,
    error: {
      name: 'TimeoutError',
      message: 'Task timed out',
      code: TaskErrorCode.TIMEOUT,
    },
  };
  pool.handleMessage(errorResponse);

  // ============================================================
  // Part 6: Error Code Analysis
  // ============================================================
  console.log('\n6. Error Code Analysis\n');

  const errorCodes = [
    WorkerErrorCode.WORKER_CRASHED,
    WorkerErrorCode.WORKER_UNRESPONSIVE,
    TaskErrorCode.TIMEOUT,
    TaskErrorCode.CANCELLED,
    CommunicationErrorCode.CONNECTION_LOST,
  ];

  console.log('  Error code properties:');
  for (const code of errorCodes) {
    console.log(`    ${code}: ${getErrorMessage(code)}`);
    console.log(`      Category: ${getErrorCategory(code)}, Retryable: ${isRetryableError(code)}, Fatal: ${isFatalError(code)}`);
  }

  // ============================================================
  // Part 7: Binary Protocol Integration
  // ============================================================
  console.log('\n7. Binary Protocol Integration\n');

  // Encode a task request in binary format
  const params = new TextEncoder().encode(JSON.stringify([1, 2, 3]));
  const binaryRequest = encodeTaskRequest(42, 'compute', params, PRIORITY_HIGH, false);

  console.log('  Encoded binary request:');
  console.log(`    Size: ${binaryRequest.length} bytes`);
  console.log(`    Valid header: ${validateHeader(binaryRequest)}`);
  console.log(`    Message type: ${getMessageType(binaryRequest)} (MSG_TASK_REQUEST=${MSG_TASK_REQUEST})`);
  console.log(`    Priority: ${getBinaryPriority(binaryRequest)} (PRIORITY_HIGH=${PRIORITY_HIGH})`);

  // Decode it back
  const decoded = decodeTaskRequest(binaryRequest);
  console.log('\n  Decoded request:');
  console.log(`    ID: ${decoded.id}`);
  console.log(`    Method: "${decoded.method}"`);
  console.log(`    Params: ${new TextDecoder().decode(decoded.params)}`);

  // Encode an error response
  const binaryError = encodeErrorResponse(42, TaskErrorCode.METHOD_NOT_FOUND, 'Method not found', 'at Worker.handle');
  const decodedError = decodeErrorResponse(binaryError);
  console.log('\n  Binary error response:');
  console.log(`    Error code: ${decodedError.errorCode}`);
  console.log(`    Message: "${decodedError.message}"`);

  // ============================================================
  // Part 8: Final Statistics
  // ============================================================
  console.log('\n8. Final Statistics\n');

  const finalStats = pool.getStats();
  console.log('  Pool state:');
  console.log(`    Total workers: ${finalStats.totalWorkers}`);
  console.log(`    Idle: ${finalStats.idleWorkers}`);
  console.log(`    Busy: ${finalStats.busyWorkers}`);
  console.log(`    Unresponsive: ${finalStats.unresponsiveWorkers}`);
  console.log(`    Queued tasks: ${finalStats.queuedTasks}`);

  // Cleanup
  pool.cleanup();
  console.log('\n  Pool cleaned up');

  console.log('\n' + '='.repeat(60));
  console.log('Protocol V2 Complete example finished!');
}

main().catch(console.error);
