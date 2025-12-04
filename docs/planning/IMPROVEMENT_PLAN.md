# HIGH-THROUGHPUT & LOAD BALANCING IMPROVEMENT PLAN
## Node.js Performance Optimization with AssemblyScript WASM

**Version:** 1.0.0
**Author:** Architecture Team
**Target:** workerpool v12.0.0
**Prerequisites:** Completion of PHASE_1_REFACTORING_PLAN (TypeScript migration)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Limitations](#current-limitations)
3. [Target Capabilities](#target-capabilities)
4. [Sprint Breakdown](#sprint-breakdown)
5. [Detailed Task Specifications](#detailed-task-specifications)
6. [Performance Targets](#performance-targets)
7. [API Design](#api-design)

---

## Executive Summary

This improvement plan adds enterprise-grade high-throughput capabilities and advanced load balancing to workerpool, inspired by poolifier's feature set while maintaining workerpool's simplicity and cross-platform compatibility.

**Key Features:**
1. **Worker Choice Strategies** - Round Robin, Least Used, Least Busy, Weighted, Fair Share
2. **Dynamic Worker Scaling** - Auto-scale based on load with configurable policies
3. **Task Stealing** - Idle workers steal tasks from busy workers' queues
4. **Lock-Free Concurrent Queue** - WASM-accelerated multi-producer/multi-consumer queue
5. **Back-Pressure Management** - Prevent queue overflow with configurable policies
6. **Enhanced Metrics** - Real-time performance metrics for load balancing decisions
7. **Worker Affinity** - Route similar tasks to the same worker for cache efficiency

**Expected Outcomes:**
- 5-10x improvement in task throughput under high concurrency
- Sub-millisecond worker selection latency
- Automatic load balancing without configuration for most workloads
- Production-ready metrics and observability

---

## Current Limitations

### Worker Selection (Pool._getWorker)
```typescript
// Current: O(n) linear scan for first available worker
Pool.prototype._getWorker = function() {
  for (var i = 0; i < workers.length; i++) {
    if (workers[i].busy() === false) {
      return workers[i];  // Always picks first idle worker
    }
  }
}
```

**Problems:**
- No load balancing - first idle worker always selected
- Creates hotspots - some workers underutilized
- No consideration for worker performance characteristics
- No affinity for related tasks

### Task Queue (src/queues.js)
```typescript
// Current: Array.shift() is O(n)
FIFOQueue.prototype.pop = function() {
  return this.tasks.shift();  // O(n) operation
}
```

**Problems:**
- O(n) dequeue operation
- Single-threaded access only
- No work stealing between workers
- No back-pressure mechanism

### Worker Scaling
```typescript
// Current: Static min/max bounds
this.minWorkers = options.minWorkers;
this.maxWorkers = options.maxWorkers;
```

**Problems:**
- No dynamic scaling based on load
- No idle worker termination policy
- No scaling cooldown/warmup periods

---

## Target Capabilities

### 1. Worker Choice Strategies

```typescript
type WorkerChoiceStrategy =
  | 'round-robin'        // Distribute tasks evenly in rotation
  | 'least-used'         // Worker with fewest completed tasks
  | 'least-busy'         // Worker with fewest active tasks
  | 'least-elu'          // Worker with lowest event loop utilization (Node.js)
  | 'weighted-round-robin' // Round robin with performance weights
  | 'fair-share'         // Balance based on task execution time
  | 'interleaved-weighted' // Interleaved weighted round robin
  | WorkerChoiceStrategyFn; // Custom function

interface WorkerChoiceStrategyFn {
  (workers: readonly WorkerInfo[], task: Task): WorkerInfo | undefined;
}
```

### 2. Dynamic Scaling

```typescript
interface DynamicScalingOptions {
  enabled: boolean;
  scaleUpThreshold: number;   // Queue size / workers ratio to trigger scale up
  scaleDownThreshold: number; // Idle time before scale down
  scaleUpStep: number;        // Workers to add per scale-up event
  scaleDownStep: number;      // Workers to remove per scale-down event
  cooldownPeriod: number;     // Minimum time between scaling events
}
```

### 3. Task Stealing

```typescript
interface TaskStealingOptions {
  enabled: boolean;
  stealSize: number;          // Max tasks to steal at once
  stealThreshold: number;     // Min queue size difference to trigger steal
  stealStrategy: 'fifo' | 'lifo' | 'half';
}
```

### 4. Memory Layout (WASM)

```
SharedArrayBuffer Layout:
┌─────────────────────────────────────────────────────────────────────────┐
│ HEADER (64 bytes)                                                        │
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┐ │
│ │ version  │ capacity │ head     │ tail     │ size     │ flags        │ │
│ │ (u32)    │ (u32)    │ (u32)    │ (u32)    │ (u32)    │ (u32)        │ │
│ └──────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│ WORKER STATS (64 bytes × maxWorkers)                                     │
│ ┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────────┐ │
│ │ workerId │ state    │ taskCnt  │ busyTime │ idleTime │ eluPercent   │ │
│ │ (u32)    │ (u8)     │ (u64)    │ (u64)    │ (u64)    │ (f32)        │ │
│ └──────────┴──────────┴──────────┴──────────┴──────────┴──────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│ MPMC RING BUFFER (variable, power of 2)                                  │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Slot 0: [sequence(u64), taskRef(u32), priority(i16), flags(u16)]     │ │
│ │ Slot 1: [sequence(u64), taskRef(u32), priority(i16), flags(u16)]     │ │
│ │ ...                                                                   │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│ PER-WORKER QUEUES (for task stealing)                                    │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Worker 0 Local Queue: [head, tail, slots...]                         │ │
│ │ Worker 1 Local Queue: [head, tail, slots...]                         │ │
│ │ ...                                                                   │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint Breakdown

### SPRINT 1: Worker Choice Strategies Foundation (Tasks 1-8)
**Goal:** Implement core worker selection strategies with TypeScript

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 1 | Design WorkerChoiceStrategy interface | Medium | None |
| 2 | Implement WorkerInfo metrics collection | High | 1 |
| 3 | Implement Round Robin strategy | Low | 1, 2 |
| 4 | Implement Least Used strategy | Medium | 1, 2 |
| 5 | Implement Least Busy strategy | Medium | 1, 2 |
| 6 | Implement Fair Share strategy | High | 1, 2 |
| 7 | Create strategy factory and registration | Medium | 3-6 |
| 8 | Sprint 1 integration tests | High | 1-7 |

---

### SPRINT 2: Advanced Strategies & Weights (Tasks 9-16)
**Goal:** Implement weighted and ELU-based strategies

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 9 | Implement Event Loop Utilization monitoring | High | Sprint 1 |
| 10 | Implement Least ELU strategy | High | 9 |
| 11 | Design weight calculation system | Medium | Sprint 1 |
| 12 | Implement Weighted Round Robin strategy | High | 11 |
| 13 | Implement Interleaved Weighted Round Robin | High | 11, 12 |
| 14 | Create custom strategy registration API | Medium | 7 |
| 15 | Add strategy hot-swap support | Medium | 7, 14 |
| 16 | Sprint 2 integration tests | High | 9-15 |

---

### SPRINT 3: WASM MPMC Queue (Tasks 17-24)
**Goal:** Implement lock-free multi-producer/multi-consumer queue in AssemblyScript

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 17 | Design MPMC ring buffer memory layout | High | None |
| 18 | Implement atomic sequence number operations | Very High | 17 |
| 19 | Implement enqueue with CAS (Compare-And-Swap) | Very High | 18 |
| 20 | Implement dequeue with CAS | Very High | 18 |
| 21 | Add back-pressure detection and signaling | High | 19, 20 |
| 22 | Create TypeScript MPMCQueue wrapper class | Medium | 19, 20 |
| 23 | Implement graceful fallback to JS queue | Medium | 22 |
| 24 | Sprint 3 integration tests + benchmarks | High | 17-23 |

---

### SPRINT 4: Task Stealing (Tasks 25-32)
**Goal:** Implement work-stealing for idle workers

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 25 | Design per-worker local queue structure | High | Sprint 3 |
| 26 | Implement local queue in WASM | High | 25 |
| 27 | Design stealing protocol (victim selection) | High | 25, 26 |
| 28 | Implement steal operation (half-steal) | Very High | 26, 27 |
| 29 | Add stealing metrics and statistics | Medium | 28 |
| 30 | Implement steal throttling and fairness | High | 28 |
| 31 | Add stealing configuration options | Medium | 28 |
| 32 | Sprint 4 integration tests + benchmarks | High | 25-31 |

---

### SPRINT 5: Dynamic Scaling (Tasks 33-40)
**Goal:** Auto-scale worker pool based on load

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 33 | Design DynamicPool class extending Pool | High | Sprint 1, 2 |
| 34 | Implement load metric calculation | High | 33 |
| 35 | Implement scale-up trigger and logic | High | 33, 34 |
| 36 | Implement scale-down with idle timeout | High | 33, 34 |
| 37 | Add scaling cooldown mechanism | Medium | 35, 36 |
| 38 | Implement predictive scaling (optional) | Very High | 34 |
| 39 | Add scaling events and hooks | Medium | 35, 36 |
| 40 | Sprint 5 integration tests | High | 33-39 |

---

### SPRINT 6: Back-Pressure Management (Tasks 41-48)
**Goal:** Prevent queue overflow with configurable policies

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 41 | Design back-pressure policy interface | Medium | Sprint 3 |
| 42 | Implement 'reject' policy (throw on full) | Low | 41 |
| 43 | Implement 'drop-oldest' policy | Medium | 41 |
| 44 | Implement 'drop-newest' policy | Medium | 41 |
| 45 | Implement 'block' policy with timeout | High | 41 |
| 46 | Implement 'caller-runs' policy | High | 41 |
| 47 | Add back-pressure metrics and events | Medium | 42-46 |
| 48 | Sprint 6 integration tests | High | 41-47 |

---

### SPRINT 7: Worker Affinity & Routing (Tasks 49-55)
**Goal:** Route related tasks to same workers for cache efficiency

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 49 | Design affinity key hashing system | High | Sprint 1 |
| 50 | Implement consistent hashing for worker selection | High | 49 |
| 51 | Add affinity option to exec/execBatch | Medium | 49, 50 |
| 52 | Implement sticky sessions with TTL | High | 50 |
| 53 | Add affinity metrics (cache hit rate) | Medium | 51, 52 |
| 54 | Handle worker failure with affinity rebalancing | High | 50, 52 |
| 55 | Sprint 7 integration tests | High | 49-54 |

---

### SPRINT 8: Enhanced Metrics & Observability (Tasks 56-62)
**Goal:** Production-ready metrics and monitoring

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 56 | Design PoolMetrics interface | Medium | All previous |
| 57 | Implement per-worker metrics collection | High | 56 |
| 58 | Implement histogram for task latencies | High | 56 |
| 59 | Add Prometheus-compatible metrics export | Medium | 56-58 |
| 60 | Add OpenTelemetry trace integration | High | 56 |
| 61 | Create metrics dashboard example | Medium | 59 |
| 62 | Sprint 8 integration tests | High | 56-61 |

---

## Detailed Task Specifications

### TASK 1: Design WorkerChoiceStrategy Interface

**Objective:** Create a pluggable interface for worker selection algorithms.

**Files to Create:**
- `src/strategies/types.ts`
- `src/strategies/WorkerChoiceStrategy.ts`

**TypeScript Implementation:**
```typescript
// src/strategies/types.ts

/** Snapshot of worker state for strategy decisions */
export interface WorkerInfo {
  readonly id: number;
  readonly state: WorkerState;
  readonly taskCount: number;       // Total tasks executed
  readonly activeTasks: number;     // Currently executing
  readonly queuedTasks: number;     // In local queue
  readonly averageTaskTime: number; // Rolling average (ms)
  readonly lastTaskTime: number;    // Last task duration (ms)
  readonly idleTime: number;        // Time since last task (ms)
  readonly weight: number;          // For weighted strategies
  readonly eluPercent?: number;     // Event Loop Utilization (0-100)
}

export const enum WorkerState {
  COLD = 0,
  WARMING = 1,
  READY = 2,
  BUSY = 3,
  TERMINATING = 4,
  TERMINATED = 5
}

/** Task metadata available during worker selection */
export interface TaskInfo {
  readonly id: number;
  readonly method: string;
  readonly priority: number;
  readonly affinityKey?: string;
  readonly estimatedDuration?: number;
}

/** Strategy selection result */
export interface SelectionResult {
  readonly worker: WorkerInfo;
  readonly reason?: string;  // For debugging/logging
}

// src/strategies/WorkerChoiceStrategy.ts

export interface WorkerChoiceStrategy {
  /** Unique identifier for this strategy */
  readonly name: string;

  /** Select a worker for the given task */
  select(
    workers: readonly WorkerInfo[],
    task: TaskInfo
  ): SelectionResult | undefined;

  /** Called when a worker completes a task (for statistics) */
  onTaskComplete?(workerId: number, duration: number): void;

  /** Called when a worker is added to the pool */
  onWorkerAdded?(worker: WorkerInfo): void;

  /** Called when a worker is removed from the pool */
  onWorkerRemoved?(workerId: number): void;

  /** Reset internal state */
  reset?(): void;
}
```

**Acceptance Criteria:**
- [ ] Interface supports all planned strategies
- [ ] Immutable WorkerInfo prevents strategy side effects
- [ ] Hooks for statistics updates
- [ ] Full JSDoc documentation

---

### TASK 3: Implement Round Robin Strategy

**Objective:** Create the simplest balanced distribution strategy.

**File:** `src/strategies/RoundRobinStrategy.ts`

**TypeScript Implementation:**
```typescript
// src/strategies/RoundRobinStrategy.ts

import type {
  WorkerChoiceStrategy,
  WorkerInfo,
  TaskInfo,
  SelectionResult,
  WorkerState
} from './types';

/**
 * Round Robin worker selection strategy.
 *
 * Distributes tasks evenly across all workers in rotation.
 * Simple and predictable, good for homogeneous workloads.
 *
 * Time Complexity: O(n) worst case, O(1) average
 * Space Complexity: O(1)
 */
export class RoundRobinStrategy implements WorkerChoiceStrategy {
  public readonly name = 'round-robin';

  private _nextIndex: number = 0;

  select(
    workers: readonly WorkerInfo[],
    _task: TaskInfo
  ): SelectionResult | undefined {
    if (workers.length === 0) return undefined;

    // Find next ready worker, starting from current index
    const startIndex = this._nextIndex;
    let attempts = 0;

    while (attempts < workers.length) {
      const index = (startIndex + attempts) % workers.length;
      const worker = workers[index];

      if (worker.state === WorkerState.READY && worker.activeTasks === 0) {
        this._nextIndex = (index + 1) % workers.length;
        return {
          worker,
          reason: `round-robin index ${index}`
        };
      }

      attempts++;
    }

    // No idle worker found, pick next in rotation anyway (will queue)
    const worker = workers[this._nextIndex];
    this._nextIndex = (this._nextIndex + 1) % workers.length;

    return worker.state !== WorkerState.TERMINATED
      ? { worker, reason: 'round-robin fallback (busy)' }
      : undefined;
  }

  onWorkerRemoved(workerId: number): void {
    // Reset index if it was pointing to removed worker
    // This is handled by the pool maintaining the workers array
  }

  reset(): void {
    this._nextIndex = 0;
  }
}
```

**Acceptance Criteria:**
- [ ] O(1) average selection time
- [ ] Handles all workers busy
- [ ] Skips terminated workers
- [ ] Index resets properly

---

### TASK 5: Implement Least Busy Strategy

**Objective:** Select worker with fewest active tasks (best for varying task durations).

**File:** `src/strategies/LeastBusyStrategy.ts`

**TypeScript Implementation:**
```typescript
// src/strategies/LeastBusyStrategy.ts

import type {
  WorkerChoiceStrategy,
  WorkerInfo,
  TaskInfo,
  SelectionResult,
  WorkerState
} from './types';

/**
 * Least Busy worker selection strategy.
 *
 * Selects the worker with the fewest active tasks.
 * Optimal for workloads with varying task durations.
 *
 * Time Complexity: O(n)
 * Space Complexity: O(1)
 */
export class LeastBusyStrategy implements WorkerChoiceStrategy {
  public readonly name = 'least-busy';

  select(
    workers: readonly WorkerInfo[],
    _task: TaskInfo
  ): SelectionResult | undefined {
    if (workers.length === 0) return undefined;

    let bestWorker: WorkerInfo | undefined;
    let lowestBusy = Infinity;

    for (const worker of workers) {
      // Skip unavailable workers
      if (worker.state === WorkerState.TERMINATED ||
          worker.state === WorkerState.TERMINATING) {
        continue;
      }

      // Calculate "busyness" = active tasks + queued tasks
      const busyness = worker.activeTasks + worker.queuedTasks;

      if (busyness < lowestBusy) {
        lowestBusy = busyness;
        bestWorker = worker;

        // Early exit if we find a completely idle worker
        if (busyness === 0) break;
      }
    }

    return bestWorker
      ? { worker: bestWorker, reason: `least-busy with ${lowestBusy} tasks` }
      : undefined;
  }
}
```

**Acceptance Criteria:**
- [ ] Correctly identifies least busy worker
- [ ] Early exit optimization for idle workers
- [ ] Considers both active and queued tasks

---

### TASK 6: Implement Fair Share Strategy

**Objective:** Balance based on actual CPU time consumed.

**File:** `src/strategies/FairShareStrategy.ts`

**TypeScript Implementation:**
```typescript
// src/strategies/FairShareStrategy.ts

import type {
  WorkerChoiceStrategy,
  WorkerInfo,
  TaskInfo,
  SelectionResult,
  WorkerState
} from './types';

/**
 * Fair Share worker selection strategy.
 *
 * Balances based on actual CPU time consumed by each worker.
 * Workers that have consumed less CPU time get priority.
 * Optimal for heterogeneous task durations.
 *
 * Time Complexity: O(n)
 * Space Complexity: O(n) for tracking execution time
 */
export class FairShareStrategy implements WorkerChoiceStrategy {
  public readonly name = 'fair-share';

  private readonly _executionTime: Map<number, number> = new Map();
  private readonly _exponentialWeight: number;

  constructor(options: { exponentialWeight?: number } = {}) {
    // Weight for exponential moving average (0-1)
    // Lower = more weight on recent tasks
    this._exponentialWeight = options.exponentialWeight ?? 0.7;
  }

  select(
    workers: readonly WorkerInfo[],
    task: TaskInfo
  ): SelectionResult | undefined {
    if (workers.length === 0) return undefined;

    let bestWorker: WorkerInfo | undefined;
    let lowestShare = Infinity;

    // Calculate total execution time for normalization
    let totalTime = 0;
    for (const worker of workers) {
      totalTime += this._getExecutionTime(worker.id);
    }

    // If no work done yet, use round-robin behavior
    if (totalTime === 0) {
      for (const worker of workers) {
        if (worker.state === WorkerState.READY && worker.activeTasks === 0) {
          return { worker, reason: 'fair-share initial (no history)' };
        }
      }
    }

    for (const worker of workers) {
      if (worker.state === WorkerState.TERMINATED ||
          worker.state === WorkerState.TERMINATING) {
        continue;
      }

      const workerTime = this._getExecutionTime(worker.id);
      const share = totalTime > 0 ? workerTime / totalTime : 0;

      // Penalize currently busy workers
      const adjustedShare = share + (worker.activeTasks * 0.1);

      if (adjustedShare < lowestShare) {
        lowestShare = adjustedShare;
        bestWorker = worker;
      }
    }

    return bestWorker
      ? { worker: bestWorker, reason: `fair-share ${(lowestShare * 100).toFixed(1)}%` }
      : undefined;
  }

  onTaskComplete(workerId: number, duration: number): void {
    const current = this._getExecutionTime(workerId);

    // Exponential moving average to prevent unbounded growth
    const updated = current * this._exponentialWeight + duration;
    this._executionTime.set(workerId, updated);
  }

  onWorkerRemoved(workerId: number): void {
    this._executionTime.delete(workerId);
  }

  reset(): void {
    this._executionTime.clear();
  }

  private _getExecutionTime(workerId: number): number {
    return this._executionTime.get(workerId) ?? 0;
  }
}
```

**Acceptance Criteria:**
- [ ] Tracks execution time per worker
- [ ] Uses exponential moving average to prevent unbounded growth
- [ ] Handles cold start (no history)
- [ ] Properly rebalances after worker removal

---

### TASK 18: Implement Atomic Sequence Number Operations

**Objective:** Create lock-free sequence number management for MPMC queue.

**File:** `assembly/mpmc/atomic-seq.ts`

**AssemblyScript Implementation:**
```typescript
// assembly/mpmc/atomic-seq.ts

/**
 * Lock-free sequence number operations for MPMC queue.
 *
 * Each slot has a sequence number that indicates its state:
 * - seq == slot_index: slot is empty and ready for enqueue
 * - seq == slot_index + 1: slot contains data, ready for dequeue
 * - seq < slot_index: slot is being written (enqueue in progress)
 * - seq > slot_index + 1: slot is being read (dequeue in progress)
 */

// Slot layout (16 bytes):
// [0-7]:   sequence (u64)
// [8-11]:  taskRef (u32)
// [12-13]: priority (i16)
// [14-15]: flags (u16)

const SLOT_SIZE: u32 = 16;
const SEQ_OFFSET: u32 = 0;
const TASK_OFFSET: u32 = 8;
const PRIORITY_OFFSET: u32 = 12;
const FLAGS_OFFSET: u32 = 14;

/** Initialize slots with correct sequence numbers */
export function initSlots(baseOffset: u32, capacity: u32): void {
  for (let i: u32 = 0; i < capacity; i++) {
    const slotOffset = baseOffset + (i * SLOT_SIZE);
    // Sequence = slot index (empty state)
    Atomics.store<u64>(slotOffset + SEQ_OFFSET, i as u64);
    // Clear data
    Atomics.store<u32>(slotOffset + TASK_OFFSET, 0);
    Atomics.store<u16>(slotOffset + PRIORITY_OFFSET, 0);
    Atomics.store<u16>(slotOffset + FLAGS_OFFSET, 0);
  }
}

/**
 * Try to acquire a slot for enqueue.
 * Returns slot offset if successful, -1 if queue is full.
 */
export function tryAcquireForEnqueue(
  headerOffset: u32,
  slotsOffset: u32,
  mask: u32
): i32 {
  // Load current tail
  let tail = Atomics.load<u64>(headerOffset + 8); // tail at offset 8

  while (true) {
    const slotIndex = (tail as u32) & mask;
    const slotOffset = slotsOffset + (slotIndex * SLOT_SIZE);
    const seq = Atomics.load<u64>(slotOffset + SEQ_OFFSET);

    const expectedSeq = tail;

    if (seq === expectedSeq) {
      // Slot is ready for enqueue, try to claim it
      const newTail = tail + 1;
      const result = Atomics.compareExchange<u64>(
        headerOffset + 8,
        tail,
        newTail
      );

      if (result === tail) {
        // Successfully claimed the slot
        return slotOffset as i32;
      }

      // CAS failed, reload tail and retry
      tail = result;
    } else if (seq < expectedSeq) {
      // Queue is full
      return -1;
    } else {
      // Slot is ahead, reload tail
      tail = Atomics.load<u64>(headerOffset + 8);
    }
  }
}

/**
 * Complete enqueue by updating sequence number.
 */
export function completeEnqueue(
  slotOffset: u32,
  taskRef: u32,
  priority: i16,
  flags: u16,
  expectedSeq: u64
): void {
  // Write data
  Atomics.store<u32>(slotOffset + TASK_OFFSET, taskRef);
  Atomics.store<i16>(slotOffset + PRIORITY_OFFSET, priority);
  Atomics.store<u16>(slotOffset + FLAGS_OFFSET, flags);

  // Memory barrier then update sequence (seq = expectedSeq + 1 = ready for dequeue)
  Atomics.store<u64>(slotOffset + SEQ_OFFSET, expectedSeq + 1);
}

/**
 * Try to acquire a slot for dequeue.
 * Returns slot offset if successful, -1 if queue is empty.
 */
export function tryAcquireForDequeue(
  headerOffset: u32,
  slotsOffset: u32,
  mask: u32
): i32 {
  // Load current head
  let head = Atomics.load<u64>(headerOffset + 4); // head at offset 4

  while (true) {
    const slotIndex = (head as u32) & mask;
    const slotOffset = slotsOffset + (slotIndex * SLOT_SIZE);
    const seq = Atomics.load<u64>(slotOffset + SEQ_OFFSET);

    const expectedSeq = head + 1;

    if (seq === expectedSeq) {
      // Slot has data, try to claim it
      const newHead = head + 1;
      const result = Atomics.compareExchange<u64>(
        headerOffset + 4,
        head,
        newHead
      );

      if (result === head) {
        // Successfully claimed
        return slotOffset as i32;
      }

      head = result;
    } else if (seq < expectedSeq) {
      // Queue is empty
      return -1;
    } else {
      head = Atomics.load<u64>(headerOffset + 4);
    }
  }
}

/**
 * Complete dequeue by updating sequence number for next cycle.
 */
export function completeDequeue(
  slotOffset: u32,
  capacity: u32,
  head: u64
): u32 {
  // Read data before releasing
  const taskRef = Atomics.load<u32>(slotOffset + TASK_OFFSET);

  // Update sequence for next enqueue cycle (seq = head + capacity)
  const newSeq = head + (capacity as u64);
  Atomics.store<u64>(slotOffset + SEQ_OFFSET, newSeq);

  return taskRef;
}

/**
 * Get current queue size (approximate, non-blocking).
 */
export function approximateSize(headerOffset: u32): u32 {
  const head = Atomics.load<u64>(headerOffset + 4);
  const tail = Atomics.load<u64>(headerOffset + 8);
  return ((tail - head) & 0xFFFFFFFF) as u32;
}
```

**Acceptance Criteria:**
- [ ] Lock-free enqueue/dequeue operations
- [ ] Correct sequence number management
- [ ] Handles ABA problem via 64-bit sequences
- [ ] Proper memory ordering with Atomics

---

### TASK 28: Implement Work Stealing (Half-Steal)

**Objective:** Allow idle workers to steal tasks from busy workers.

**File:** `src/stealing/WorkStealingScheduler.ts`

**TypeScript Implementation:**
```typescript
// src/stealing/WorkStealingScheduler.ts

import type { WorkerInfo, TaskInfo } from '../strategies/types';
import type { TaskQueue } from '../core/TaskQueue';

export interface WorkStealingOptions {
  enabled: boolean;
  /** Minimum difference in queue sizes to trigger steal */
  stealThreshold: number;
  /** Maximum tasks to steal at once */
  maxStealSize: number;
  /** Strategy: 'half' steals half of victim's queue, 'one' steals one task */
  stealSize: 'one' | 'half' | 'all';
  /** Cooldown between steal attempts (ms) */
  stealCooldown: number;
}

interface WorkerLocalQueue {
  workerId: number;
  queue: TaskQueue;
  lastStealAttempt: number;
}

interface StealResult {
  stolenCount: number;
  victimId: number;
  thiefId: number;
}

/**
 * Work-stealing scheduler for load balancing.
 *
 * When a worker becomes idle, it attempts to steal work from
 * the busiest worker's local queue.
 */
export class WorkStealingScheduler {
  private readonly _options: Required<WorkStealingOptions>;
  private readonly _localQueues: Map<number, WorkerLocalQueue> = new Map();
  private readonly _stealStats = {
    attempts: 0,
    successes: 0,
    tasksStolen: 0
  };

  constructor(options: Partial<WorkStealingOptions> = {}) {
    this._options = {
      enabled: options.enabled ?? true,
      stealThreshold: options.stealThreshold ?? 2,
      maxStealSize: options.maxStealSize ?? 4,
      stealSize: options.stealSize ?? 'half',
      stealCooldown: options.stealCooldown ?? 10
    };
  }

  /**
   * Register a worker's local queue for stealing.
   */
  registerWorker(workerId: number, queue: TaskQueue): void {
    this._localQueues.set(workerId, {
      workerId,
      queue,
      lastStealAttempt: 0
    });
  }

  /**
   * Unregister a worker's local queue.
   */
  unregisterWorker(workerId: number): void {
    this._localQueues.delete(workerId);
  }

  /**
   * Attempt to steal work for an idle worker.
   * Called when a worker finishes a task and its local queue is empty.
   */
  trySteal(thiefId: number): StealResult | null {
    if (!this._options.enabled) return null;

    const thief = this._localQueues.get(thiefId);
    if (!thief) return null;

    // Check cooldown
    const now = performance.now();
    if (now - thief.lastStealAttempt < this._options.stealCooldown) {
      return null;
    }

    thief.lastStealAttempt = now;
    this._stealStats.attempts++;

    // Find the best victim (worker with most queued tasks)
    let bestVictim: WorkerLocalQueue | undefined;
    let maxQueueSize = this._options.stealThreshold;

    for (const [id, worker] of this._localQueues) {
      if (id === thiefId) continue;

      const size = worker.queue.size();
      if (size > maxQueueSize) {
        maxQueueSize = size;
        bestVictim = worker;
      }
    }

    if (!bestVictim) return null;

    // Calculate how many to steal
    const victimSize = bestVictim.queue.size();
    let toSteal: number;

    switch (this._options.stealSize) {
      case 'one':
        toSteal = 1;
        break;
      case 'half':
        toSteal = Math.floor(victimSize / 2);
        break;
      case 'all':
        toSteal = victimSize;
        break;
    }

    toSteal = Math.min(toSteal, this._options.maxStealSize);

    if (toSteal === 0) return null;

    // Perform the steal (from the back of victim's queue)
    const stolen: TaskInfo[] = [];
    for (let i = 0; i < toSteal; i++) {
      const task = bestVictim.queue.stealFromBack?.();
      if (task) {
        stolen.push(task);
      } else {
        break;
      }
    }

    if (stolen.length === 0) return null;

    // Add to thief's queue
    for (const task of stolen) {
      thief.queue.push(task);
    }

    this._stealStats.successes++;
    this._stealStats.tasksStolen += stolen.length;

    return {
      stolenCount: stolen.length,
      victimId: bestVictim.workerId,
      thiefId
    };
  }

  /**
   * Get stealing statistics.
   */
  getStats(): Readonly<typeof this._stealStats> {
    return { ...this._stealStats };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this._stealStats.attempts = 0;
    this._stealStats.successes = 0;
    this._stealStats.tasksStolen = 0;
  }
}
```

**Acceptance Criteria:**
- [ ] Steal from busiest worker
- [ ] Configurable steal size (one/half/all)
- [ ] Cooldown to prevent thrashing
- [ ] Statistics tracking

---

### TASK 35: Implement Scale-Up Logic

**Objective:** Auto-scale workers when load increases.

**File:** `src/pool/DynamicPool.ts`

**TypeScript Implementation:**
```typescript
// src/pool/DynamicPool.ts (partial - scale-up logic)

export interface ScalingOptions {
  /** Enable dynamic scaling */
  enabled: boolean;
  /** Queue size / workers ratio to trigger scale up */
  scaleUpThreshold: number;
  /** Idle time (ms) before scale down */
  scaleDownIdleTimeout: number;
  /** Workers to add per scale-up event */
  scaleUpStep: number;
  /** Workers to remove per scale-down event */
  scaleDownStep: number;
  /** Minimum time between scaling events (ms) */
  cooldownPeriod: number;
  /** Minimum workers (won't scale below this) */
  minWorkers: number;
  /** Maximum workers (won't scale above this) */
  maxWorkers: number;
}

interface ScalingState {
  lastScaleUp: number;
  lastScaleDown: number;
  consecutiveScaleUps: number;
  consecutiveScaleDowns: number;
}

export class DynamicPool extends Pool {
  private readonly _scalingOptions: Required<ScalingOptions>;
  private readonly _scalingState: ScalingState;
  private _scalingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(script: string, options: PoolOptions & { scaling?: Partial<ScalingOptions> }) {
    super(script, options);

    this._scalingOptions = {
      enabled: options.scaling?.enabled ?? true,
      scaleUpThreshold: options.scaling?.scaleUpThreshold ?? 2.0,
      scaleDownIdleTimeout: options.scaling?.scaleDownIdleTimeout ?? 30000,
      scaleUpStep: options.scaling?.scaleUpStep ?? 1,
      scaleDownStep: options.scaling?.scaleDownStep ?? 1,
      cooldownPeriod: options.scaling?.cooldownPeriod ?? 5000,
      minWorkers: options.scaling?.minWorkers ?? options.minWorkers ?? 1,
      maxWorkers: options.scaling?.maxWorkers ?? options.maxWorkers ?? 8
    };

    this._scalingState = {
      lastScaleUp: 0,
      lastScaleDown: 0,
      consecutiveScaleUps: 0,
      consecutiveScaleDowns: 0
    };

    if (this._scalingOptions.enabled) {
      this._startScalingMonitor();
    }
  }

  /**
   * Start the scaling monitor interval.
   */
  private _startScalingMonitor(): void {
    // Check every second
    this._scalingInterval = setInterval(() => {
      this._evaluateScaling();
    }, 1000);
  }

  /**
   * Evaluate current load and scale if needed.
   */
  private _evaluateScaling(): void {
    const stats = this.stats();
    const now = performance.now();

    // Calculate load ratio
    const totalCapacity = stats.totalWorkers || 1;
    const queuedTasks = stats.pendingTasks;
    const activeTasks = stats.activeTasks;
    const loadRatio = (queuedTasks + activeTasks) / totalCapacity;

    // Check for scale-up
    if (loadRatio >= this._scalingOptions.scaleUpThreshold) {
      this._tryScaleUp(now);
    }
    // Check for scale-down
    else if (stats.idleWorkers > 0 && queuedTasks === 0) {
      this._tryScaleDown(now, stats.idleWorkers);
    }
  }

  /**
   * Attempt to scale up the pool.
   */
  private _tryScaleUp(now: number): void {
    // Check cooldown
    if (now - this._scalingState.lastScaleUp < this._scalingOptions.cooldownPeriod) {
      return;
    }

    // Check max limit
    const currentWorkers = this.workers.length;
    if (currentWorkers >= this._scalingOptions.maxWorkers) {
      return;
    }

    // Calculate how many to add
    const toAdd = Math.min(
      this._scalingOptions.scaleUpStep,
      this._scalingOptions.maxWorkers - currentWorkers
    );

    // Add workers
    for (let i = 0; i < toAdd; i++) {
      const worker = this._createWorkerHandler();
      this.workers.push(worker);
    }

    this._scalingState.lastScaleUp = now;
    this._scalingState.consecutiveScaleUps++;
    this._scalingState.consecutiveScaleDowns = 0;

    this._emitScalingEvent('scale-up', {
      added: toAdd,
      totalWorkers: this.workers.length,
      reason: 'load threshold exceeded'
    });
  }

  /**
   * Attempt to scale down the pool.
   */
  private _tryScaleDown(now: number, idleWorkers: number): void {
    // Check cooldown
    if (now - this._scalingState.lastScaleDown < this._scalingOptions.cooldownPeriod) {
      return;
    }

    // Check min limit
    const currentWorkers = this.workers.length;
    if (currentWorkers <= this._scalingOptions.minWorkers) {
      return;
    }

    // Find idle workers that have been idle long enough
    const idleThreshold = now - this._scalingOptions.scaleDownIdleTimeout;
    const workersToRemove: WorkerHandler[] = [];

    for (const worker of this.workers) {
      if (!worker.busy() && worker.lastTaskEndTime < idleThreshold) {
        workersToRemove.push(worker);
        if (workersToRemove.length >= this._scalingOptions.scaleDownStep) {
          break;
        }
      }
    }

    // Don't go below minimum
    const canRemove = Math.min(
      workersToRemove.length,
      currentWorkers - this._scalingOptions.minWorkers
    );

    if (canRemove === 0) return;

    // Remove workers
    for (let i = 0; i < canRemove; i++) {
      this._removeWorker(workersToRemove[i]);
    }

    this._scalingState.lastScaleDown = now;
    this._scalingState.consecutiveScaleDowns++;
    this._scalingState.consecutiveScaleUps = 0;

    this._emitScalingEvent('scale-down', {
      removed: canRemove,
      totalWorkers: this.workers.length,
      reason: 'workers idle timeout'
    });
  }

  /**
   * Emit a scaling event for observability.
   */
  private _emitScalingEvent(
    type: 'scale-up' | 'scale-down',
    details: Record<string, unknown>
  ): void {
    // Hook for metrics/logging
    this.onScaling?.(type, details);
  }

  /**
   * Override terminate to clean up scaling monitor.
   */
  async terminate(force?: boolean, timeout?: number): Promise<void> {
    if (this._scalingInterval) {
      clearInterval(this._scalingInterval);
      this._scalingInterval = null;
    }
    return super.terminate(force, timeout);
  }
}
```

**Acceptance Criteria:**
- [ ] Scales up when load exceeds threshold
- [ ] Respects cooldown period
- [ ] Doesn't exceed maxWorkers
- [ ] Emits scaling events

---

### TASK 50: Implement Consistent Hashing for Worker Affinity

**Objective:** Route related tasks to the same worker using consistent hashing.

**File:** `src/affinity/ConsistentHash.ts`

**TypeScript Implementation:**
```typescript
// src/affinity/ConsistentHash.ts

/**
 * Consistent hashing ring for worker affinity.
 *
 * Distributes affinity keys to workers such that:
 * 1. Same key always maps to same worker (if available)
 * 2. Adding/removing workers only remaps minimal keys
 * 3. Load is balanced across workers
 */
export class ConsistentHashRing {
  private readonly _virtualNodes: number;
  private readonly _ring: Map<number, number> = new Map();
  private readonly _sortedHashes: number[] = [];

  constructor(options: { virtualNodes?: number } = {}) {
    // More virtual nodes = better distribution but more memory
    this._virtualNodes = options.virtualNodes ?? 150;
  }

  /**
   * Add a worker to the ring.
   */
  addWorker(workerId: number): void {
    for (let i = 0; i < this._virtualNodes; i++) {
      const hash = this._hash(`worker:${workerId}:${i}`);
      this._ring.set(hash, workerId);
      this._insertSorted(hash);
    }
  }

  /**
   * Remove a worker from the ring.
   */
  removeWorker(workerId: number): void {
    for (let i = 0; i < this._virtualNodes; i++) {
      const hash = this._hash(`worker:${workerId}:${i}`);
      this._ring.delete(hash);
      const index = this._binarySearch(hash);
      if (index !== -1) {
        this._sortedHashes.splice(index, 1);
      }
    }
  }

  /**
   * Find the worker for a given affinity key.
   */
  getWorker(affinityKey: string): number | undefined {
    if (this._sortedHashes.length === 0) return undefined;

    const hash = this._hash(affinityKey);

    // Find first hash >= key hash (clockwise on ring)
    let low = 0;
    let high = this._sortedHashes.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this._sortedHashes[mid] < hash) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    // Wrap around to first if we're past the end
    const targetHash = this._sortedHashes[low % this._sortedHashes.length];
    return this._ring.get(targetHash);
  }

  /**
   * Get all workers that would handle a key if primaries fail.
   * Returns workers in preference order.
   */
  getWorkerPreferenceList(affinityKey: string, count: number): number[] {
    if (this._sortedHashes.length === 0) return [];

    const hash = this._hash(affinityKey);
    const seen = new Set<number>();
    const result: number[] = [];

    let low = 0;
    let high = this._sortedHashes.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this._sortedHashes[mid] < hash) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    // Walk clockwise around the ring
    for (let i = 0; i < this._sortedHashes.length && result.length < count; i++) {
      const index = (low + i) % this._sortedHashes.length;
      const workerId = this._ring.get(this._sortedHashes[index])!;

      if (!seen.has(workerId)) {
        seen.add(workerId);
        result.push(workerId);
      }
    }

    return result;
  }

  /**
   * FNV-1a hash (fast and good distribution).
   */
  private _hash(key: string): number {
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash;
  }

  /**
   * Binary search for hash position.
   */
  private _binarySearch(hash: number): number {
    let low = 0;
    let high = this._sortedHashes.length - 1;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (this._sortedHashes[mid] === hash) {
        return mid;
      } else if (this._sortedHashes[mid] < hash) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    return -1;
  }

  /**
   * Insert hash in sorted position.
   */
  private _insertSorted(hash: number): void {
    let low = 0;
    let high = this._sortedHashes.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this._sortedHashes[mid] < hash) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    this._sortedHashes.splice(low, 0, hash);
  }
}
```

**Acceptance Criteria:**
- [ ] Same key always maps to same worker
- [ ] Good distribution with virtual nodes
- [ ] Minimal remapping on worker add/remove
- [ ] Preference list for failover

---

## Performance Targets

### Throughput Benchmarks

| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Tasks/sec (1 worker) | ~2,000 | ~5,000 | 2.5x |
| Tasks/sec (8 workers) | ~8,000 | ~40,000 | 5x |
| Tasks/sec (16 workers) | ~12,000 | ~70,000 | 6x |

### Latency Targets

| Metric | Current | Target |
|--------|---------|--------|
| Worker selection (avg) | ~0.5ms | <0.1ms |
| Queue enqueue (avg) | ~0.1ms | <0.01ms |
| Queue dequeue (avg) | ~0.1ms | <0.01ms |
| Task dispatch (p99) | ~5ms | <1ms |

### Memory Targets

| Metric | Current | Target |
|--------|---------|--------|
| Per-worker overhead | ~10MB | ~5MB |
| Queue per 1000 tasks | ~2MB | ~500KB |
| WASM module size | N/A | <50KB |

---

## API Design

### New Pool Options

```typescript
interface HighThroughputPoolOptions extends PoolOptions {
  /** Worker selection strategy */
  workerChoiceStrategy?: WorkerChoiceStrategy | WorkerChoiceStrategyName;

  /** Dynamic scaling configuration */
  scaling?: ScalingOptions;

  /** Task stealing configuration */
  taskStealing?: TaskStealingOptions;

  /** Back-pressure policy */
  backPressure?: BackPressureOptions;

  /** Worker affinity configuration */
  affinity?: AffinityOptions;

  /** Enable WASM acceleration */
  useWasm?: boolean;

  /** Metrics collection options */
  metrics?: MetricsOptions;
}

// Usage
const pool = workerpool.pool('./worker.js', {
  minWorkers: 2,
  maxWorkers: 16,

  workerChoiceStrategy: 'least-busy',

  scaling: {
    enabled: true,
    scaleUpThreshold: 2.0,
    scaleDownIdleTimeout: 30000
  },

  taskStealing: {
    enabled: true,
    stealSize: 'half'
  },

  backPressure: {
    policy: 'reject',
    maxQueueSize: 10000
  },

  affinity: {
    enabled: true,
    virtualNodes: 150
  },

  useWasm: true,

  metrics: {
    enabled: true,
    histogramBuckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000]
  }
});
```

### Enhanced exec with Affinity

```typescript
// Route all tasks for user to same worker
pool.exec('processUser', [userId, data], {
  affinity: `user:${userId}`
});

// Priority with affinity
pool.exec('processOrder', [orderId, items], {
  priority: 10,
  affinity: `order:${orderId}`,
  timeout: 5000
});
```

### Metrics API

```typescript
// Get detailed metrics
const metrics = pool.metrics();

console.log(metrics);
// {
//   throughput: { tasksPerSecond: 5432, avgLatencyMs: 2.3 },
//   workers: [
//     { id: 0, activeTasks: 1, completedTasks: 1234, avgTaskTimeMs: 5.2, eluPercent: 45 },
//     { id: 1, activeTasks: 0, completedTasks: 1189, avgTaskTimeMs: 5.8, eluPercent: 42 },
//     ...
//   ],
//   queue: { size: 42, enqueued: 10234, dequeued: 10192, stolen: 89 },
//   scaling: { scaleUps: 3, scaleDowns: 1, currentWorkers: 8 },
//   latencyHistogram: { p50: 2, p90: 5, p95: 8, p99: 15, p999: 42 }
// }

// Prometheus format
const prometheus = pool.metricsPrometheus();
// workerpool_tasks_total{status="completed"} 10192
// workerpool_task_duration_seconds_bucket{le="0.001"} 2341
// ...
```

---

## Appendix: File Checklist

### New Files to Create

**Strategies:**
- [ ] `src/strategies/types.ts`
- [ ] `src/strategies/WorkerChoiceStrategy.ts`
- [ ] `src/strategies/RoundRobinStrategy.ts`
- [ ] `src/strategies/LeastUsedStrategy.ts`
- [ ] `src/strategies/LeastBusyStrategy.ts`
- [ ] `src/strategies/LeastELUStrategy.ts`
- [ ] `src/strategies/FairShareStrategy.ts`
- [ ] `src/strategies/WeightedRoundRobinStrategy.ts`
- [ ] `src/strategies/StrategyFactory.ts`

**WASM Queue:**
- [ ] `assembly/mpmc/types.ts`
- [ ] `assembly/mpmc/atomic-seq.ts`
- [ ] `assembly/mpmc/mpmc-queue.ts`
- [ ] `assembly/mpmc/worker-stats.ts`
- [ ] `src/wasm/MPMCQueueBridge.ts`

**Task Stealing:**
- [ ] `src/stealing/types.ts`
- [ ] `src/stealing/WorkStealingScheduler.ts`
- [ ] `src/stealing/LocalQueue.ts`

**Dynamic Scaling:**
- [ ] `src/pool/DynamicPool.ts`
- [ ] `src/pool/ScalingPolicy.ts`

**Back-Pressure:**
- [ ] `src/backpressure/types.ts`
- [ ] `src/backpressure/policies/RejectPolicy.ts`
- [ ] `src/backpressure/policies/DropOldestPolicy.ts`
- [ ] `src/backpressure/policies/BlockPolicy.ts`
- [ ] `src/backpressure/policies/CallerRunsPolicy.ts`

**Affinity:**
- [ ] `src/affinity/ConsistentHash.ts`
- [ ] `src/affinity/AffinityManager.ts`

**Metrics:**
- [ ] `src/metrics/types.ts`
- [ ] `src/metrics/PoolMetrics.ts`
- [ ] `src/metrics/Histogram.ts`
- [ ] `src/metrics/PrometheusExporter.ts`

**Tests:**
- [ ] `test/strategies/*.test.ts`
- [ ] `test/mpmc/*.test.ts`
- [ ] `test/stealing/*.test.ts`
- [ ] `test/scaling/*.test.ts`
- [ ] `test/affinity/*.test.ts`
- [ ] `test/metrics/*.test.ts`

**Benchmarks:**
- [ ] `benchmark/strategies.bench.ts`
- [ ] `benchmark/queue.bench.ts`
- [ ] `benchmark/throughput.bench.ts`
- [ ] `benchmark/scaling.bench.ts`

---

*This document is a living specification. Update as implementation progresses.*
