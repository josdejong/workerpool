/**
 * Data Structures Example
 *
 * Demonstrates high-performance data structures:
 * - CircularBuffer: Fixed-size O(1) buffer with eviction
 * - GrowableCircularBuffer: Grows instead of evicting
 * - TimeWindowBuffer: Time-based sliding window
 * - FIFOQueue / LIFOQueue: Task queue implementations
 *
 * Run with: node examples/dataStructures.js
 */

const workerpool = require('../dist/ts/index.js');

async function main() {
  console.log('Data Structures Example\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: CircularBuffer (fixed size with eviction)
  // ============================================================
  console.log('\n1. CircularBuffer (fixed size)\n');

  // Create a buffer that holds max 5 items
  const buffer = new workerpool.CircularBuffer(5);

  console.log('  Created buffer with capacity 5');

  // Add items
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

  // Peek and shift
  console.log('  Peek (front):', buffer.peek());
  console.log('  Shift:', buffer.shift());
  console.log('  After shift:', buffer.toArray().join(', '));

  // Iterator
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

  // Starts with capacity 4, doubles when needed
  const growable = new workerpool.GrowableCircularBuffer(4);

  console.log('  Initial capacity:', growable.capacity());

  // Add more items than initial capacity
  for (let i = 1; i <= 10; i++) {
    growable.push(i);
  }

  console.log('  After adding 10 items:');
  console.log('    Size:', growable.size());
  console.log('    Capacity:', growable.capacity(), '(grew to accommodate)');
  console.log('    Contents:', growable.toArray().join(', '));

  // Remove items
  while (growable.size() > 3) {
    growable.shift();
  }
  console.log('  After shifting, remaining:', growable.toArray().join(', '));

  // ============================================================
  // Example 3: TimeWindowBuffer (time-based)
  // ============================================================
  console.log('\n3. TimeWindowBuffer (sliding time window)\n');

  // Buffer that keeps values from the last 1000ms (1 second)
  const timeBuffer = new workerpool.TimeWindowBuffer(1000);

  console.log('  Created buffer with 1000ms window');

  // Add values at different times
  timeBuffer.push(100);
  console.log('  Added 100');

  await new Promise(r => setTimeout(r, 300));
  timeBuffer.push(200);
  console.log('  Added 200 (after 300ms)');

  await new Promise(r => setTimeout(r, 300));
  timeBuffer.push(300);
  console.log('  Added 300 (after 600ms)');

  // All values still in window
  console.log('  Current values:', timeBuffer.getValues().join(', '));
  console.log('  Count:', timeBuffer.count());

  // Wait for first value to expire
  console.log('  Waiting 500ms...');
  await new Promise(r => setTimeout(r, 500));

  // Prune expired values
  timeBuffer.prune();
  console.log('  After prune:', timeBuffer.getValues().join(', '));

  // Stats
  const timeStats = timeBuffer.getStats();
  console.log('  Stats:', JSON.stringify(timeStats));

  // ============================================================
  // Example 4: FIFOQueue (First In, First Out)
  // ============================================================
  console.log('\n4. FIFOQueue\n');

  const fifo = new workerpool.FIFOQueue();

  console.log('  Created FIFO queue');

  // Add tasks
  const tasks = ['task-A', 'task-B', 'task-C'].map(name => ({
    method: name,
    params: [],
    resolver: { promise: Promise.resolve(), resolve: () => {}, reject: () => {} },
    options: {},
  }));

  tasks.forEach(task => fifo.push(task));
  console.log('  Pushed 3 tasks');
  console.log('  Size:', fifo.size());

  // Pop in FIFO order
  console.log('  Popping:');
  while (fifo.size() > 0) {
    const task = fifo.pop();
    console.log(`    - ${task.method}`);
  }

  // ============================================================
  // Example 5: LIFOQueue (Last In, First Out)
  // ============================================================
  console.log('\n5. LIFOQueue\n');

  const lifo = new workerpool.LIFOQueue();

  console.log('  Created LIFO queue');

  // Add tasks
  const lifoTasks = ['first', 'second', 'third'].map(name => ({
    method: name,
    params: [],
    resolver: { promise: Promise.resolve(), resolve: () => {}, reject: () => {} },
    options: {},
  }));

  lifoTasks.forEach(task => lifo.push(task));
  console.log('  Pushed: first, second, third');

  // Pop in LIFO order
  console.log('  Popping:');
  while (lifo.size() > 0) {
    const task = lifo.pop();
    console.log(`    - ${task.method}`);
  }

  // ============================================================
  // Example 6: Use case - Metrics collection
  // ============================================================
  console.log('\n6. Use case: Metrics collection with TimeWindowBuffer\n');

  // Collect response times for the last 5 seconds
  const responseTimeBuffer = new workerpool.TimeWindowBuffer(5000);

  // Simulate recording response times
  function recordResponseTime(ms) {
    responseTimeBuffer.push(ms);
  }

  // Simulate some requests
  recordResponseTime(45);
  recordResponseTime(52);
  recordResponseTime(38);
  recordResponseTime(120); // slow request
  recordResponseTime(41);

  // Calculate metrics
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

  // Track last 10 request timestamps
  const requestBuffer = new workerpool.CircularBuffer(10);

  function checkRateLimit() {
    const now = Date.now();
    const oldest = requestBuffer.peek();

    // If buffer is full and oldest is within 1 second, rate limit
    if (requestBuffer.size() >= 10 && oldest && (now - oldest) < 1000) {
      return false; // Rate limited
    }

    requestBuffer.push(now);
    return true; // Allowed
  }

  console.log('  Rate limiter: max 10 requests per second');

  // Simulate requests
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
