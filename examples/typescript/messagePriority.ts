/**
 * Message Priority Example (TypeScript)
 *
 * Demonstrates the message priority system for controlling
 * task execution order and importance levels.
 *
 * Priority levels (highest to lowest):
 * - CRITICAL (3): System-critical operations
 * - HIGH (2): Important user-facing operations
 * - NORMAL (1): Standard operations (default)
 * - LOW (0): Background/deferred operations
 *
 * Run with: npx tsx examples/typescript/messagePriority.ts
 */

import {
  // Priority enum and helpers
  MessagePriority,
  getMessagePriority,
  compareByPriority,

  // Message creation
  createMessage,

  // Types
  type MessageHeader,
  type TaskRequest,
} from '../../dist/ts/full.js';

async function main(): Promise<void> {
  console.log('Message Priority Example (TypeScript)\n');
  console.log('='.repeat(60));

  // ============================================================
  // Example 1: Priority Level Values
  // ============================================================
  console.log('\n1. Priority Level Values\n');

  console.log('  Priority Levels:');
  console.log(`    LOW:      ${MessagePriority.LOW}`);
  console.log(`    NORMAL:   ${MessagePriority.NORMAL}`);
  console.log(`    HIGH:     ${MessagePriority.HIGH}`);
  console.log(`    CRITICAL: ${MessagePriority.CRITICAL}`);

  console.log('\n  Priority Ordering:');
  console.log(`    LOW < NORMAL: ${MessagePriority.LOW < MessagePriority.NORMAL}`);
  console.log(`    NORMAL < HIGH: ${MessagePriority.NORMAL < MessagePriority.HIGH}`);
  console.log(`    HIGH < CRITICAL: ${MessagePriority.HIGH < MessagePriority.CRITICAL}`);

  // ============================================================
  // Example 2: Creating Messages with Priority
  // ============================================================
  console.log('\n2. Creating Messages with Priority\n');

  // Create messages with different priorities
  const lowPriorityTask = createMessage<TaskRequest>(
    {
      id: 1,
      method: 'backgroundSync',
      params: [],
    } as Omit<TaskRequest, keyof MessageHeader>,
    { priority: MessagePriority.LOW }
  );

  const normalTask = createMessage<TaskRequest>(
    {
      id: 2,
      method: 'processData',
      params: [{ data: 'test' }],
    } as Omit<TaskRequest, keyof MessageHeader>,
    { priority: MessagePriority.NORMAL }
  );

  const highPriorityTask = createMessage<TaskRequest>(
    {
      id: 3,
      method: 'handleUserRequest',
      params: ['click'],
    } as Omit<TaskRequest, keyof MessageHeader>,
    { priority: MessagePriority.HIGH }
  );

  const criticalTask = createMessage<TaskRequest>(
    {
      id: 4,
      method: 'emergencyShutdown',
      params: [],
    } as Omit<TaskRequest, keyof MessageHeader>,
    { priority: MessagePriority.CRITICAL }
  );

  console.log('  Created tasks with different priorities:');
  console.log(`    Task 1 (${lowPriorityTask.method}): Priority ${lowPriorityTask.priority} (LOW)`);
  console.log(`    Task 2 (${normalTask.method}): Priority ${normalTask.priority} (NORMAL)`);
  console.log(`    Task 3 (${highPriorityTask.method}): Priority ${highPriorityTask.priority} (HIGH)`);
  console.log(`    Task 4 (${criticalTask.method}): Priority ${criticalTask.priority} (CRITICAL)`);

  // ============================================================
  // Example 3: Getting Priority from Messages
  // ============================================================
  console.log('\n3. Getting Priority from Messages\n');

  const messages = [
    { id: 1, priority: MessagePriority.HIGH },
    { id: 2 }, // No priority specified
    { id: 3, priority: MessagePriority.LOW },
    { id: 4, priority: MessagePriority.CRITICAL },
    { id: 5, priority: undefined },
  ];

  console.log('  Getting priority from various messages:');
  for (const msg of messages) {
    const priority = getMessagePriority(msg);
    const priorityName = MessagePriority[priority];
    console.log(`    Message ${msg.id}: priority=${msg.priority ?? 'undefined'} -> ${priority} (${priorityName})`);
  }

  // ============================================================
  // Example 4: Sorting Messages by Priority
  // ============================================================
  console.log('\n4. Sorting Messages by Priority\n');

  // Simulate a message queue (extends MessageHeader to include priority)
  interface QueuedMessage {
    id: number;
    task: string;
    priority: MessagePriority;
  }

  const messageQueue: QueuedMessage[] = [
    { id: 1, task: 'Log analytics', priority: MessagePriority.LOW },
    { id: 2, task: 'User login', priority: MessagePriority.HIGH },
    { id: 3, task: 'Cache cleanup', priority: MessagePriority.LOW },
    { id: 4, task: 'Payment processing', priority: MessagePriority.CRITICAL },
    { id: 5, task: 'Data fetch', priority: MessagePriority.NORMAL },
    { id: 6, task: 'System alert', priority: MessagePriority.CRITICAL },
    { id: 7, task: 'File upload', priority: MessagePriority.NORMAL },
    { id: 8, task: 'User action', priority: MessagePriority.HIGH },
  ];

  console.log('  Message queue before sorting:');
  messageQueue.forEach((m, i) =>
    console.log(`    [${i}] ID ${m.id}: "${m.task}" (${MessagePriority[m.priority!]})`)
  );

  // Sort by priority (highest first)
  const sortedQueue = [...messageQueue].sort(compareByPriority);

  console.log('\n  Message queue after sorting (highest priority first):');
  sortedQueue.forEach((m, i) =>
    console.log(`    [${i}] ID ${m.id}: "${m.task}" (${MessagePriority[m.priority!]})`)
  );

  // ============================================================
  // Example 5: Priority Queue Implementation
  // ============================================================
  console.log('\n5. Priority Queue Implementation\n');

  interface PriorityMessage {
    priority: MessagePriority;
  }

  class PriorityMessageQueue<T extends PriorityMessage> {
    private criticalQueue: T[] = [];
    private highQueue: T[] = [];
    private normalQueue: T[] = [];
    private lowQueue: T[] = [];

    private getQueue(priority: MessagePriority): T[] {
      switch (priority) {
        case MessagePriority.CRITICAL:
          return this.criticalQueue;
        case MessagePriority.HIGH:
          return this.highQueue;
        case MessagePriority.NORMAL:
          return this.normalQueue;
        case MessagePriority.LOW:
          return this.lowQueue;
      }
    }

    enqueue(message: T): void {
      this.getQueue(message.priority).push(message);
    }

    dequeue(): T | undefined {
      // Check from highest to lowest priority
      for (const queue of [
        this.criticalQueue,
        this.highQueue,
        this.normalQueue,
        this.lowQueue,
      ]) {
        if (queue.length > 0) {
          return queue.shift();
        }
      }
      return undefined;
    }

    size(): number {
      return (
        this.criticalQueue.length +
        this.highQueue.length +
        this.normalQueue.length +
        this.lowQueue.length
      );
    }

    sizeByPriority(): Record<string, number> {
      return {
        CRITICAL: this.criticalQueue.length,
        HIGH: this.highQueue.length,
        NORMAL: this.normalQueue.length,
        LOW: this.lowQueue.length,
      };
    }
  }

  const pq = new PriorityMessageQueue<QueuedMessage>();

  // Add messages in mixed order
  console.log('  Adding messages in mixed order:');
  const messagesToAdd: QueuedMessage[] = [
    { id: 1, task: 'Background task', priority: MessagePriority.LOW },
    { id: 2, task: 'User request', priority: MessagePriority.HIGH },
    { id: 3, task: 'Standard task', priority: MessagePriority.NORMAL },
    { id: 4, task: 'Critical alert', priority: MessagePriority.CRITICAL },
    { id: 5, task: 'Another low', priority: MessagePriority.LOW },
  ];

  for (const msg of messagesToAdd) {
    pq.enqueue(msg);
    console.log(`    Enqueued: "${msg.task}" (${MessagePriority[msg.priority!]})`);
  }

  console.log(`\n  Queue sizes: ${JSON.stringify(pq.sizeByPriority())}`);

  console.log('\n  Dequeuing in priority order:');
  let msg: QueuedMessage | undefined;
  while ((msg = pq.dequeue()) !== undefined) {
    console.log(`    Dequeued: "${msg.task}" (${MessagePriority[msg.priority!]})`);
  }

  // ============================================================
  // Example 6: Priority-Based Rate Limiting
  // ============================================================
  console.log('\n6. Priority-Based Rate Limiting\n');

  interface RateLimitConfig {
    maxPerSecond: number;
  }

  const rateLimits: Record<MessagePriority, RateLimitConfig> = {
    [MessagePriority.CRITICAL]: { maxPerSecond: 1000 }, // Unlimited
    [MessagePriority.HIGH]: { maxPerSecond: 100 },
    [MessagePriority.NORMAL]: { maxPerSecond: 50 },
    [MessagePriority.LOW]: { maxPerSecond: 10 },
  };

  console.log('  Rate limits by priority:');
  for (const [priority, config] of Object.entries(rateLimits)) {
    const priorityNum = parseInt(priority) as MessagePriority;
    console.log(`    ${MessagePriority[priorityNum]}: ${config.maxPerSecond}/sec`);
  }

  // Simulate checking rate limits
  function shouldThrottle(message: MessageHeader, currentRate: number): boolean {
    const priority = getMessagePriority(message);
    const limit = rateLimits[priority];
    return currentRate >= limit.maxPerSecond;
  }

  const testCases = [
    { msg: { priority: MessagePriority.LOW }, rate: 5 },
    { msg: { priority: MessagePriority.LOW }, rate: 15 },
    { msg: { priority: MessagePriority.HIGH }, rate: 50 },
    { msg: { priority: MessagePriority.HIGH }, rate: 150 },
    { msg: { priority: MessagePriority.CRITICAL }, rate: 500 },
  ];

  console.log('\n  Throttle check results:');
  for (const { msg, rate } of testCases) {
    const throttled = shouldThrottle(msg, rate);
    const priorityName = MessagePriority[msg.priority!];
    console.log(`    ${priorityName} @ ${rate}/sec: ${throttled ? 'THROTTLED' : 'ALLOWED'}`);
  }

  // ============================================================
  // Example 7: Priority Escalation
  // ============================================================
  console.log('\n7. Priority Escalation\n');

  interface TrackedMessage {
    id: number;
    task: string;
    priority: MessagePriority;
    createdAt: number;
    originalPriority: MessagePriority;
  }

  function escalatePriority(message: TrackedMessage, maxWaitMs: number): TrackedMessage {
    const waitTime = Date.now() - message.createdAt;
    const currentPriority = getMessagePriority(message);

    // Don't escalate CRITICAL messages
    if (currentPriority === MessagePriority.CRITICAL) {
      return message;
    }

    // Escalate if waiting too long
    if (waitTime > maxWaitMs) {
      const newPriority = Math.min(currentPriority + 1, MessagePriority.CRITICAL) as MessagePriority;
      console.log(
        `    Escalating "${message.task}": ${MessagePriority[currentPriority]} -> ${MessagePriority[newPriority]} (waited ${waitTime}ms)`
      );
      return {
        ...message,
        priority: newPriority,
      };
    }

    return message;
  }

  console.log('  Simulating priority escalation (max wait: 100ms):');

  const trackedMessages: TrackedMessage[] = [
    {
      id: 1,
      task: 'Old low priority',
      priority: MessagePriority.LOW,
      originalPriority: MessagePriority.LOW,
      createdAt: Date.now() - 200, // 200ms ago
    },
    {
      id: 2,
      task: 'Recent normal',
      priority: MessagePriority.NORMAL,
      originalPriority: MessagePriority.NORMAL,
      createdAt: Date.now() - 50, // 50ms ago
    },
    {
      id: 3,
      task: 'Old normal',
      priority: MessagePriority.NORMAL,
      originalPriority: MessagePriority.NORMAL,
      createdAt: Date.now() - 150, // 150ms ago
    },
  ];

  for (const msg of trackedMessages) {
    escalatePriority(msg, 100);
  }

  // ============================================================
  // Example 8: Priority Statistics
  // ============================================================
  console.log('\n8. Priority Statistics\n');

  interface PriorityStats {
    count: number;
    avgProcessingTime: number;
    maxWaitTime: number;
  }

  class PriorityTracker {
    private lowStats: PriorityStats = { count: 0, avgProcessingTime: 0, maxWaitTime: 0 };
    private normalStats: PriorityStats = { count: 0, avgProcessingTime: 0, maxWaitTime: 0 };
    private highStats: PriorityStats = { count: 0, avgProcessingTime: 0, maxWaitTime: 0 };
    private criticalStats: PriorityStats = { count: 0, avgProcessingTime: 0, maxWaitTime: 0 };

    private getStatsFor(priority: MessagePriority): PriorityStats {
      switch (priority) {
        case MessagePriority.LOW:
          return this.lowStats;
        case MessagePriority.NORMAL:
          return this.normalStats;
        case MessagePriority.HIGH:
          return this.highStats;
        case MessagePriority.CRITICAL:
          return this.criticalStats;
      }
    }

    recordCompletion(priority: MessagePriority, processingTime: number, waitTime: number): void {
      const stats = this.getStatsFor(priority);
      const newCount = stats.count + 1;
      stats.avgProcessingTime = (stats.avgProcessingTime * stats.count + processingTime) / newCount;
      stats.maxWaitTime = Math.max(stats.maxWaitTime, waitTime);
      stats.count = newCount;
    }

    getStats(): Record<string, PriorityStats> {
      return {
        LOW: this.lowStats,
        NORMAL: this.normalStats,
        HIGH: this.highStats,
        CRITICAL: this.criticalStats,
      };
    }
  }

  const tracker = new PriorityTracker();

  // Simulate some completions
  const completions = [
    { priority: MessagePriority.LOW, processingTime: 100, waitTime: 500 },
    { priority: MessagePriority.LOW, processingTime: 150, waitTime: 600 },
    { priority: MessagePriority.NORMAL, processingTime: 50, waitTime: 200 },
    { priority: MessagePriority.HIGH, processingTime: 30, waitTime: 50 },
    { priority: MessagePriority.HIGH, processingTime: 40, waitTime: 60 },
    { priority: MessagePriority.CRITICAL, processingTime: 20, waitTime: 10 },
  ];

  for (const c of completions) {
    tracker.recordCompletion(c.priority, c.processingTime, c.waitTime);
  }

  console.log('  Priority Statistics:');
  const stats = tracker.getStats();
  for (const [name, s] of Object.entries(stats)) {
    if (s.count > 0) {
      console.log(`    ${name}:`);
      console.log(`      Count: ${s.count}`);
      console.log(`      Avg Processing: ${s.avgProcessingTime.toFixed(1)}ms`);
      console.log(`      Max Wait: ${s.maxWaitTime}ms`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Message Priority example completed!');
}

main().catch(console.error);
