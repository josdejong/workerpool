/**
 * Data Structures Example (TypeScript)
 *
 * Demonstrates high-performance data structures:
 * - CircularBuffer: Fixed-size O(1) buffer with eviction
 * - GrowableCircularBuffer: Grows instead of evicting
 * - TimeWindowBuffer: Time-based sliding window
 * - FIFOQueue / LIFOQueue: Task queue implementations
 *
 * Run with: npx tsx examples/typescript/dataStructures.ts
 */

import {
  CircularBuffer,
  GrowableCircularBuffer,
  TimeWindowBuffer,
  FIFOQueue,
  LIFOQueue,
  type TimestampedValue,
  type Task,
  type Resolver,
} from '../../dist/ts/full.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createMockTask(name: string): Task {
  const resolver: Resolver<unknown> = {
    promise: Promise.resolve(),
    resolve: () => {},
    reject: () => {},
  };

  return {
    method: name,
    params: [],
    resolver,
    timeout: null,
    options: {},
  };
}

async function main(): Promise<void> {
  console.log('Data Structures Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: CircularBuffer (fixed size with eviction)
  // ============================================================
  console.log('\n1. CircularBuffer (fixed size)\n');

  const buffer = new CircularBuffer<number>(5);
  console.log('  Created buffer with capacity 5');

  for (let i = 1; i <= 7; i++) {
    const evicted = buffer.push(i);
    if (evicted !== undefined) {
      console.log(`  Pushed ${i}, evicted ${evicted}`);
    } else {
      console.log(`  Pushed ${i}`);
    }
  }

  console.log('  Buffer contents:', buffer.toArray().join(', '));
  console.log('  Size:', buffer.size());
  console.log('  Capacity:', buffer.capacity());

  console.log('  Peek (front):', buffer.peek());
  console.log('  Shift:', buffer.shift());
  console.log('  After shift:', buffer.toArray().join(', '));

  console.log('  Iterate:');
  for (const item of buffer) {
    console.log(`    - ${item}`);
  }

  buffer.clear();
  console.log('  After clear, size:', buffer.size());

  // ============================================================
  // Example 2: GrowableCircularBuffer (no eviction)
  // ============================================================
  console.log('\n2. GrowableCircularBuffer (grows dynamically)\n');

  const growable = new GrowableCircularBuffer<number>(4);
  console.log('  Initial capacity:', growable.capacity());

  for (let i = 1; i <= 10; i++) {
    growable.push(i);
  }

  console.log('  After adding 10 items:');
  console.log('    Size:', growable.size());
  console.log('    Capacity:', growable.capacity(), '(grew to accommodate)');
  console.log('    Contents:', growable.toArray().join(', '));

  while (growable.size() > 3) {
    growable.shift();
  }
  console.log('  After shifting, remaining:', growable.toArray().join(', '));

  // ============================================================
  // Example 3: TimeWindowBuffer (time-based)
  // ============================================================
  console.log('\n3. TimeWindowBuffer (sliding time window)\n');

  const timeBuffer = new TimeWindowBuffer<number>(1000);
  console.log('  Created buffer with 1000ms window');

  timeBuffer.push(100);
  console.log('  Added 100');

  await sleep(300);
  timeBuffer.push(200);
  console.log('  Added 200 (after 300ms)');

  await sleep(300);
  timeBuffer.push(300);
  console.log('  Added 300 (after 600ms)');

  console.log('  Current values:', timeBuffer.getValues().join(', '));
  console.log('  Count:', timeBuffer.count());

  console.log('  Waiting 500ms...');
  await sleep(500);

  timeBuffer.prune();
  console.log('  After prune:', timeBuffer.getValues().join(', '));

  interface BufferStats {
    count: number;
    min: number | null;
    max: number | null;
    avg: number | null;
  }

  const timeStats: BufferStats = timeBuffer.getStats();
  console.log('  Stats:', JSON.stringify(timeStats));

  // ============================================================
  // Example 4: FIFOQueue (First In, First Out)
  // ============================================================
  console.log('\n4. FIFOQueue\n');

  const fifo = new FIFOQueue<Task>();
  console.log('  Created FIFO queue');

  const taskNames = ['task-A', 'task-B', 'task-C'];
  taskNames.forEach(name => fifo.push(createMockTask(name)));
  console.log('  Pushed 3 tasks');
  console.log('  Size:', fifo.size());

  console.log('  Popping:');
  while (fifo.size() > 0) {
    const task = fifo.pop();
    if (task) {
      console.log(`    - ${task.method}`);
    }
  }

  // ============================================================
  // Example 5: LIFOQueue (Last In, First Out)
  // ============================================================
  console.log('\n5. LIFOQueue\n');

  const lifo = new LIFOQueue<Task>();
  console.log('  Created LIFO queue');

  const lifoNames = ['first', 'second', 'third'];
  lifoNames.forEach(name => lifo.push(createMockTask(name)));
  console.log('  Pushed: first, second, third');

  console.log('  Popping:');
  while (lifo.size() > 0) {
    const task = lifo.pop();
    if (task) {
      console.log(`    - ${task.method}`);
    }
  }

  // ============================================================
  // Example 6: Use case - Metrics collection
  // ============================================================
  console.log('\n6. Use case: Metrics collection with TimeWindowBuffer\n');

  const responseTimeBuffer = new TimeWindowBuffer<number>(5000);

  function recordResponseTime(ms: number): void {
    responseTimeBuffer.push(ms);
  }

  recordResponseTime(45);
  recordResponseTime(52);
  recordResponseTime(38);
  recordResponseTime(120);
  recordResponseTime(41);

  const times = responseTimeBuffer.getValues();
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const max = Math.max(...times);
  const min = Math.min(...times);

  console.log('  Response time metrics (last 5s):');
  console.log(`    Count: ${times.length}`);
  console.log(`    Avg: ${avg.toFixed(1)}ms`);
  console.log(`    Min: ${min}ms`);
  console.log(`    Max: ${max}ms`);

  // ============================================================
  // Example 7: Use case - Rate limiting with CircularBuffer
  // ============================================================
  console.log('\n7. Use case: Rate limiting\n');

  const requestBuffer = new CircularBuffer<number>(10);

  function checkRateLimit(): boolean {
    const now = Date.now();
    const oldest = requestBuffer.peek();

    if (requestBuffer.size() >= 10 && oldest && (now - oldest) < 1000) {
      return false;
    }

    requestBuffer.push(now);
    return true;
  }

  console.log('  Rate limiter: max 10 requests per second');

  let allowed = 0;
  let blocked = 0;

  for (let i = 0; i < 15; i++) {
    if (checkRateLimit()) {
      allowed++;
    } else {
      blocked++;
    }
  }

  console.log(`  Allowed: ${allowed}, Blocked: ${blocked}`);

  console.log('\n' + '='.repeat(50));
  console.log('Data Structures examples completed!');
}

main().catch(console.error);
