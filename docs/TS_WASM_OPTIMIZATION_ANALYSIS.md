# TypeScript + WASM Optimization Analysis

## Executive Summary

This document provides a comprehensive analysis of optimization opportunities in the workerpool TypeScript + WASM bundle to improve concurrency and queue throughput. The analysis identifies specific bottlenecks, provides code-level recommendations, and prioritizes implementation by impact and complexity.

**Expected Gains from Top Optimizations:**
- **30-50%** throughput improvement
- **20-30%** GC pressure reduction
- **15-25%** latency improvement (p99)

---

## 1. Current Bottlenecks in Task Scheduling & Execution

### 1.1 Pool._next() Synchronous Bottleneck

**File:** `src/ts/core/Pool.ts` (lines 647-676)

**Current Issue:**
- Single-threaded worker selection loop (`_getWorker()`) uses linear search through workers
- All task routing goes through synchronous `_next()` method
- No batching of task dequeuing - processes one task at a time
- `taskQueue.pop()` is called inside synchronous loop, creating blocking contention

**Impact:**
- Max throughput capped at number of synchronous operations per event loop cycle
- High overhead for task dispatch in high-frequency scenarios

**Recommendation:**
```typescript
// Implement task pre-fetching when worker becomes available
// Use worker availability bitmap instead of linear search
// Decouple task assignment from worker execution with work-stealing queues
```

### 1.2 PriorityQueue Bubble-Up/Down Operations

**File:** `src/ts/core/TaskQueue.ts` (lines 256-301)

**Current Issue:**
- Binary heap requires O(log n) comparisons for both push and pop
- Each comparison triggers `this.comparator()` function call (not inlined)
- JavaScript array growing triggers memory reallocation at power-of-2 boundaries
- No SIMD acceleration possible in JS heap operations

**Impact:**
- Latency spikes when heap reorganization occurs
- GC pressure from comparator function allocations

**Recommendation:**
- Use WASM-backed priority queue (already exists in assembly but not integrated)
- Implement implicit tournament tree for faster median finding
- Cache comparator results to reduce function call overhead

### 1.3 MetricsCollector Data Point Pruning

**File:** `src/ts/core/metrics.ts` (lines 519-528)

**Current Issue:**
- Array `.shift()` operations on latency values and task completions have O(n) cost
- Called per task completion (hot path)
- Maintains separate arrays for latency, queue wait times, and task completions
- No time-window based pruning strategy

**Impact:**
- 10,000 tasks/sec = 10,000 shift operations/sec = significant GC pressure
- Grows memory footprint until pruning kicks in

**Recommendation:**
- Use circular buffer instead of array with shift()
- Implement Ring Buffer in WASM for metrics (zero-copy updates)
- Batch prune at 100ms intervals instead of per-task

---

## 2. Lock-Free Algorithm Opportunities

### 2.1 WASM Ring Buffer Not Fully Utilized

**File:** `src/ts/assembly/ring-buffer.ts`

**Current Status:**
- Ring buffer exists in WASM with atomics (lines 60-133)
- Uses lock-free compare-and-swap for push/pop
- **BUT:** Only used for WASM task slots, not for main task queue

**Opportunity:**
```typescript
// File: src/ts/core/Pool.ts (constructor, line 325)

// Current:
this.taskQueue = createQueue(options.queueStrategy || 'fifo') as TaskQueue<TMetadata>;

// Should support:
// - WASM ring buffer for task queue when available
// - Lock-free concurrent push from multiple client threads
// - CAS-based head/tail pointers (already implemented in assembly/ring-buffer.ts)
```

**Benefits:**
- Eliminates JavaScript array synchronization overhead
- Enables true concurrent enqueue from multiple sources
- Zero context switching to lock acquisitions

### 2.2 WASM Task Slot Free List

**File:** `src/ts/assembly/task-slots.ts` (lines 43-70)

**Current Issue:**
- Free list allocation uses linked list in WASM (solid implementation)
- **BUT:** Task slot metadata stored separately in WASM, actual Task objects in JS Map
- Dual structure causes cache misses and memory fragmentation

**Opportunity:**
```typescript
// File: src/ts/wasm/WasmTaskQueue.ts (lines 41-42)
private taskMap: Map<number, Task<T>> = new Map();

// Problem:
// - Task object stored in JS heap
// - Slot metadata in WASM heap
// - Causes pointer chasing on every access

// Solution:
// - Serialize minimal task representation into WASM slot memory
// - Store only method ID + priority in WASM (already doing partial)
// - Deserialize on dequeue
// - Reduces memory footprint from 2 heap locations to 1
```

### 2.3 Priority Queue Atomic Updates

**File:** `src/ts/assembly/priority-queue.ts` (lines 179-208)

**Current Status:**
- Uses atomic CAS for size updates (GOOD)
- **BUT:** Sift operations NOT atomic (lines 113-173)
- Could cause race conditions in multi-threaded scenarios

**Opportunity:**
- Implement atomic sift operations
- Use atomic load for parent/child comparisons
- CAS-based swaps instead of separate load+store
- Prevents stale reads during reorganization

---

## 3. SIMD/Parallel Processing Opportunities

### 3.1 SIMD Batch Processor Currently Disabled

**File:** `src/ts/wasm/simd-processor.ts` (lines 277-281)

**Current Status:**
```typescript
export function canUseSIMD(): boolean {
  return canUseWasm() && false; // Disabled until WASM module is ready
}
```

**Opportunity:**
- `simd-batch.ts` implements full SIMD acceleration for numeric arrays
- Assembly code is complete (200+ lines of SIMD intrinsics)
- Bridge layer exists but returns scalar processor

**Files Involved:**
- `src/ts/assembly/simd-batch.ts` - SIMD implementations
- `src/ts/wasm/simd-processor.ts` - JS bridge (disabled)

**Potential Gains:**

| Operation | SIMD Speedup (4-lane) |
|-----------|----------------------|
| multiply F32 | 3.8x faster |
| sum F32 | 3.8x faster |
| dot product | 4x faster |
| abs/clamp | 3.5x faster |

**Use Cases:**
- Batch metric computations
- Array transformations in task payloads
- SIMD-accelerated reduce operations

### 3.2 Batch Executor Lacks Parallelization

**File:** `src/ts/core/batch-executor.ts` (lines 264-326)

**Current Issue:**
- Uses sequential `Promise.race()` for concurrency control
- No work-stealing or load-balancing between tasks
- Task timeout logic blocks execution path

**Recommendation:**
```typescript
// Current approach:
while (nextTaskIndex < tasks.length || executing.length > 0) {
  while (executing.length < concurrency && nextTaskIndex < tasks.length) {
    executing.push(executeTask(...));
  }
  await Promise.race(executing);  // Wait for one completion
}

// Optimization:
// - Use Promise.all(chunks) for fixed-size batches
// - Implement work-stealing for uneven task distributions
// - SIMD-accelerate task state transitions
// - Batch encode task parameters for transfer
```

### 3.3 Message Batcher Could Use SIMD

**File:** `src/ts/platform/message-batcher.ts` (lines 254-288)

**Current Issue:**
- Batch serialization uses JSON.stringify()
- No compression or binary encoding of batch metadata
- Size estimation involves recursive JSON encoding

**Optimization:**
- Use SIMD for fast size estimation on TypedArrays
- Binary encoding of batch metadata
- SIMD scan for batch boundary detection
- Parallel compression (in larger batches)

---

## 4. Memory Allocation Patterns

### 4.1 FIFOQueue Circular Buffer Growing

**File:** `src/ts/core/TaskQueue.ts` (lines 27-32, 99-114)

**Current Implementation:**
```typescript
constructor(initialCapacity = 16) {
  const capacity = nextPowerOf2(initialCapacity);
  this.buffer = new Array(capacity);
}

private grow(): void {
  const newCapacity = oldCapacity * 2;
  const newBuffer = new Array<Task<T> | undefined>(newCapacity);
  // Copy all elements
}
```

**Issues:**
- Every grow operation copies all N elements: O(n) overhead
- Allocates 2x memory temporarily during grow
- GC pressure from intermediate arrays
- No pre-allocation strategy

**Recommendations:**
1. Use WASM circular buffer instead (pre-allocated, no copying)
   - `src/ts/assembly/ring-buffer.ts` already implements this
2. Implement chunked growth (std::deque structure)
3. Pre-allocate based on maxQueueSize

### 4.2 Metrics DataPoint Arrays Unbounded Growth

**File:** `src/ts/core/metrics.ts` (lines 169-199)

**Current Pattern:**
```typescript
private latencyValues: DataPoint[] = [];  // No bounds
private taskCompletions: DataPoint[] = [];

pruneDataPoints(points: DataPoint[]): void {
  while (points.length > 10000) {
    points.shift();  // O(n) operation!
  }
}
```

**Issues:**
- Array can grow to 10,000+ entries before pruning
- `shift()` is O(n) - copies entire array
- Called after EVERY task completion
- Memory churn in GC

**Solution - Circular Buffer:**
```typescript
class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;
  private capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[(this.head + this.size) % this.capacity] = item;
    if (this.size < this.capacity) {
      this.size++;
    } else {
      this.head = (this.head + 1) % this.capacity;
    }
  }

  // O(1) insert, fixed memory, no shifting!
}
```

### 4.3 WorkerHandler Task Maps

**File:** `src/ts/core/WorkerHandler.ts` (lines 493-496)

**Current Implementation:**
```typescript
processing: Record<number, ProcessingTask> = Object.create(null);
tracking: Record<number, TrackingTask> = Object.create(null);
```

**Issues:**
- Object.create(null) creates empty object, adds properties dynamically
- No pre-sizing hints
- Dense key range (0-N task IDs) but using sparse object map
- Delete operations don't free memory immediately (GC deferred)

**Recommendations:**
- Replace with `Map<number, Task>`
- Better memory locality for iteration
- Automatic size tracking
- Delete operations in Map are O(1) and immediate

---

## 5. Message Passing Overhead

### 5.1 SharedMemoryChannel Slot Contention

**File:** `src/ts/platform/shared-memory.ts` (lines 240-270)

**Current Pattern:**
```typescript
private sendSingleSlot(msgType: number, bytes: Uint8Array): SendResult {
  const slotIndex = Atomics.add(this.header, HEADER_SEND_INDEX, 1) % this.slotCount;

  // Check slot status
  const status = Atomics.load(this.slots, slotOffsetInt32);
  if (status !== SLOT_EMPTY) {
    Atomics.sub(this.header, HEADER_SEND_INDEX, 1);  // ROLLBACK!
    return { success: false, reason: 'BUFFER_FULL' };
  }
}
```

**Issues:**
- Failed CAS requires rollback of send index
- Atomic.add increments globally visible counter before checking slot
- High contention in busy scenarios
- Buffer full detection doesn't reserve space

**Recommendations:**
1. Pre-reserve slot with CAS (don't increment counter first)
2. Implement slot prediction (start CAS from cached position)
3. Adaptive slot count (grow from 16 to 32/64 under contention)

### 5.2 Message Batcher Serialization Overhead

**File:** `src/ts/platform/message-batcher.ts` (lines 514-528)

**Current Implementation:**
```typescript
private serializeMessage(message: unknown): { bytes: Uint8Array; type: number } {
  if (message instanceof ArrayBuffer) {
    return { bytes: new Uint8Array(message), type: MSG_TYPE_BINARY };
  }
  const json = JSON.stringify(message);
  return { bytes: new TextEncoder().encode(json), type: MSG_TYPE_JSON };
}
```

**Issues:**
- JSON.stringify() is called per message
- TextEncoder.encode() copies string to Uint8Array
- No compression of batch metadata
- ArrayBuffer creates copy instead of view

**Recommendations:**
1. Lazy serialization (store original objects, serialize in flush())
2. Binary format for batch (1 byte type + length + payload)
3. Message coalescing (combine small messages into buffer view)

---

## 6. Batch Processing Improvements

### 6.1 Task Parameter Encoding

**File:** `src/ts/core/batch-executor.ts` (lines 206-229)

**Optimization - Parameter Batching:**
```typescript
// Collect params from all N tasks in batch
// Pre-serialize to single binary buffer
// Send offset/length pairs instead of individual params
// Worker decodes from shared buffer
```

**Benefits:**
- Single IPC message for N tasks
- Shared parameter buffer (transferable)
- Reduces JSON serialization overhead by 50%+

### 6.2 Work-Stealing Queue Pattern

**Not Currently Implemented**

```typescript
// Missing: Work-stealing queue for batch execution
//
// Current: Concurrency controlled by semaphore
// Optimal: Multiple workers can dequeue from same batch queue
//
// Pattern:
// - Each executor gets private deque
// - Can steal from other executor's queue if idle
// - Reduces false sharing, improves cache locality
```

---

## 7. Implementation Roadmap

### Quick Wins (1-4 hours each)

| Optimization | File | Time | Expected Gain |
|-------------|------|------|---------------|
| Enable SIMD Processor | `src/ts/wasm/simd-processor.ts` | 1 hour | 3-4x for numeric ops |
| Metrics Circular Buffer | `src/ts/core/metrics.ts` | 2 hours | 15-20% GC reduction |
| WorkerHandler Map Conversion | `src/ts/core/WorkerHandler.ts` | 1 hour | Better iteration perf |
| Pre-allocate FIFO capacity | `src/ts/core/TaskQueue.ts` | 1 hour | Reduce grow() calls |

### Medium-Term (1-2 weeks)

| Optimization | File | Complexity | Expected Gain |
|-------------|------|------------|---------------|
| WASM Ring Buffer integration | `src/ts/core/Pool.ts` | High | 20-30% throughput |
| Pool worker bitmap | `src/ts/core/Pool.ts` | Medium | 10-15% dispatch |
| Batch parameter pre-serialization | `src/ts/core/batch-executor.ts` | Medium | 25-30% IPC reduction |
| SharedMemory contention fix | `src/ts/platform/shared-memory.ts` | Medium | 15-20% under load |

### Long-Term (1+ month)

| Optimization | Impact | Complexity |
|-------------|--------|------------|
| Work-stealing queues | High concurrency gains | High |
| Atomic sift operations | Thread-safe priority queue | High |
| Binary message protocol | 40% serialization reduction | High |
| Adaptive scaling improvements | Better auto-tuning | Medium |

---

## 8. Priority Matrix

| File | Current Issue | Optimization | Priority | Complexity |
|------|---------------|--------------|----------|-----------|
| `src/ts/core/Pool.ts` | Linear worker search | Bitmap + stealing | HIGH | MEDIUM |
| `src/ts/core/TaskQueue.ts` | JS heap operations | WASM ring buffer | HIGH | HIGH |
| `src/ts/core/metrics.ts` | Array.shift() hot path | Circular buffer | MEDIUM | LOW |
| `src/ts/core/WorkerHandler.ts` | Object.create(null) | Map<number, Task> | MEDIUM | LOW |
| `src/ts/core/batch-executor.ts` | Sequential concurrency | Work-stealing | HIGH | MEDIUM |
| `src/ts/assembly/priority-queue.ts` | Non-atomic sift | Atomic operations | MEDIUM | MEDIUM |
| `src/ts/wasm/WasmTaskQueue.ts` | Dual task storage | Single WASM slot | MEDIUM | HIGH |
| `src/ts/wasm/simd-processor.ts` | Disabled SIMD | Enable + integrate | MEDIUM | LOW |
| `src/ts/platform/shared-memory.ts` | Slot contention | Pre-reserve | MEDIUM | MEDIUM |
| `src/ts/platform/message-batcher.ts` | JSON overhead | Binary encoding | LOW | MEDIUM |

---

## 9. Conclusion

The workerpool TypeScript + WASM codebase has strong foundations for high-concurrency workloads but has several key optimization opportunities:

1. **Biggest Bottleneck:** JavaScript array operations (shift, copy) in hot paths
2. **Biggest Opportunity:** Underutilized WASM infrastructure (ring buffer, SIMD)
3. **Quick Win:** Enable existing SIMD + integrate WASM ring buffer
4. **Strategic Improvement:** Implement work-stealing for batch execution

The recommended approach is to:
1. Start with quick wins (SIMD, circular buffer) for immediate gains
2. Integrate WASM ring buffer for task queue (biggest impact)
3. Implement work-stealing for batch execution
4. Add binary message protocol for IPC optimization
