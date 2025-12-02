# WORKERPOOL REFACTORING PLAN
## TypeScript Simplification + AssemblyScript-to-WASM Translation
### Optimized for Speed and Maximum Worker Spawning

**Version:** 1.0.0
**Author:** Architecture Team
**Target:** workerpool v11.0.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Target Architecture](#target-architecture)
4. [Sprint Breakdown](#sprint-breakdown)
5. [Detailed Task Specifications](#detailed-task-specifications)
6. [Performance Benchmarks](#performance-benchmarks)
7. [Migration Strategy](#migration-strategy)

---

## Executive Summary

This document outlines a comprehensive refactoring plan to transform the workerpool library from JSDoc-annotated JavaScript to strict TypeScript, while introducing AssemblyScript-compiled WebAssembly modules for performance-critical paths. The refactoring prioritizes:

1. **Type Safety**: Full TypeScript with strict mode, eliminating runtime type errors
2. **Raw Speed**: WASM-accelerated task scheduling, memory management, and batch operations
3. **Maximum Parallelism**: Lock-free data structures, worker pre-warming, and adaptive scaling
4. **Zero-Copy Transfers**: SharedArrayBuffer-based message passing where supported

**Expected Outcomes:**
- 40-60% reduction in task dispatch latency
- 3-5x improvement in batch task throughput
- Sub-millisecond worker spawn times (pre-warmed)
- Type-safe API with full IntelliSense support

---

## Current Architecture Analysis

### File Structure (Current)
```
src/
├── index.js          # Entry point, exports public API
├── Pool.js           # Pool management, task queue orchestration
├── WorkerHandler.js  # Individual worker lifecycle management
├── worker.js         # Worker-side message handling
├── Promise.js        # Custom Promise with cancel/timeout
├── queues.js         # FIFO/LIFO task queue implementations
├── environment.js    # Platform detection (node/browser)
├── transfer.js       # Transferable object wrapper
├── types.js          # JSDoc type definitions
├── validateOptions.js # Runtime option validation
└── debug-port-allocator.js # Debug port management
```

### Critical Path Analysis

```
Task Submission → Queue Insert → Worker Selection → Message Serialize →
IPC Transfer → Worker Deserialize → Execute → Result Serialize →
IPC Return → Promise Resolution
```

**Bottlenecks Identified:**
1. `Pool._getWorker()` - O(n) linear scan for idle workers
2. `FIFOQueue.pop()` - Array.shift() is O(n) for large queues
3. Message serialization - JSON stringify/parse on every call
4. Worker creation - Cold start penalty (~50-100ms)
5. No batch operation support - Each task is individual IPC round-trip

### Memory Layout (Current)
```
Main Thread                    Worker Thread
┌─────────────────┐           ┌─────────────────┐
│ Pool            │           │ worker object   │
│ ├─ workers[]    │  ──IPC──► │ ├─ methods{}    │
│ ├─ taskQueue    │           │ ├─ abortListeners│
│ └─ options      │           │ └─ state        │
└─────────────────┘           └─────────────────┘
     (Heap)                        (Heap)
```

---

## Target Architecture

### File Structure (Target)
```
src/
├── core/
│   ├── Pool.ts              # Rewritten pool with generics
│   ├── WorkerHandler.ts     # Type-safe worker management
│   ├── TaskQueue.ts         # Interface + implementations
│   └── Promise.ts           # Generic Promise<T, E>
├── wasm/
│   ├── scheduler.ts         # AssemblyScript scheduler module
│   ├── ring-buffer.ts       # Lock-free ring buffer
│   ├── batch-processor.ts   # SIMD batch operations
│   └── memory-pool.ts       # Pre-allocated memory arenas
├── workers/
│   ├── worker.ts            # Worker entry point
│   ├── worker-pool.ts       # Pre-warmed worker cache
│   └── protocols.ts         # Message type definitions
├── platform/
│   ├── environment.ts       # Platform detection
│   ├── transfer.ts          # Zero-copy transfer utilities
│   └── shared-memory.ts     # SharedArrayBuffer abstractions
├── types/
│   ├── index.ts             # Public type exports
│   ├── internal.ts          # Internal type definitions
│   └── messages.ts          # IPC message types
└── index.ts                 # Public API entry point

assembly/                     # AssemblyScript source
├── scheduler.ts             # Task scheduler WASM
├── ring-buffer.ts           # Ring buffer WASM
└── tsconfig.json            # AssemblyScript config

dist/
├── workerpool.js            # Browser bundle
├── workerpool.min.js        # Minified browser
├── workerpool.wasm          # Compiled WASM module
└── worker.js                # Worker bundle
```

### Memory Layout (Target)
```
Main Thread                         Worker Thread
┌──────────────────────────┐       ┌──────────────────────────┐
│ Pool<T>                  │       │ WorkerRuntime            │
│ ├─ handlers: Map<id,W>   │       │ ├─ methods: Map<str,fn>  │
│ ├─ scheduler: WASMModule │       │ ├─ wasmInstance          │
│ └─ sharedState ──────────┼───────┼─► SharedArrayBuffer      │
└──────────────────────────┘       └──────────────────────────┘
         │                                    │
         ▼                                    ▼
┌──────────────────────────────────────────────────────────────┐
│                    SharedArrayBuffer                          │
│  ┌─────────────┬─────────────┬─────────────┬───────────────┐ │
│  │ Ring Buffer │ Task Slots  │ Result Slots│ Worker States │ │
│  │ (WASM)      │ (Structured)│ (Structured)│ (Atomics)     │ │
│  └─────────────┴─────────────┴─────────────┴───────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

---

## Sprint Breakdown

### SPRINT 1: TypeScript Foundation (Tasks 1-8)
**Goal:** Convert core modules to TypeScript with strict types

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 1 | Setup TypeScript build infrastructure | Medium | None |
| 2 | Define core type definitions | Medium | 1 |
| 3 | Convert environment.ts | Low | 1, 2 |
| 4 | Convert Promise.ts with generics | High | 1, 2 |
| 5 | Convert queues.ts with generics | Medium | 1, 2, 4 |
| 6 | Convert transfer.ts | Low | 1, 2 |
| 7 | Convert validateOptions.ts | Low | 1, 2 |
| 8 | Sprint 1 integration tests | Medium | 3-7 |

---

### SPRINT 2: Core Module Conversion (Tasks 9-16)
**Goal:** Convert Pool and WorkerHandler to TypeScript

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 9 | Define IPC message protocol types | Medium | Sprint 1 |
| 10 | Convert WorkerHandler.ts | High | 9 |
| 11 | Convert worker.ts | High | 9, 10 |
| 12 | Convert Pool.ts | High | 9, 10 |
| 13 | Convert debug-port-allocator.ts | Low | Sprint 1 |
| 14 | Create unified index.ts entry point | Medium | 10-13 |
| 15 | Update Rollup config for TypeScript | Medium | 14 |
| 16 | Sprint 2 integration tests | High | 9-15 |

---

### SPRINT 3: AssemblyScript Infrastructure (Tasks 17-24)
**Goal:** Setup WASM compilation pipeline and basic modules

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 17 | Setup AssemblyScript toolchain | Medium | Sprint 2 |
| 18 | Create WASM memory management utilities | High | 17 |
| 19 | Implement ring buffer in AssemblyScript | High | 17, 18 |
| 20 | Create WASM module loader abstraction | Medium | 17 |
| 21 | Implement task slot allocator in WASM | High | 18, 19 |
| 22 | Create JS/WASM bridge utilities | Medium | 20, 21 |
| 23 | WASM module unit tests | High | 19-22 |
| 24 | Sprint 3 integration tests | High | 17-23 |

---

### SPRINT 4: High-Performance Task Queue (Tasks 25-32)
**Goal:** Replace array-based queues with WASM ring buffers

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 25 | Design lock-free queue protocol | High | Sprint 3 |
| 26 | Implement WASMTaskQueue class | High | 25 |
| 27 | Implement priority queue in WASM | High | 25, 26 |
| 28 | Add work-stealing support | Very High | 26, 27 |
| 29 | Create queue strategy factory | Medium | 26, 27 |
| 30 | Benchmark queue implementations | Medium | 26-29 |
| 31 | Fallback to JS queues when WASM unavailable | Medium | 26, 29 |
| 32 | Sprint 4 integration tests | High | 25-31 |

---

### SPRINT 5: Worker Pre-Warming & Adaptive Scaling (Tasks 33-40)
**Goal:** Minimize worker spawn latency, optimize pool size

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 33 | Implement WorkerCache for pre-warming | High | Sprint 2 |
| 34 | Create worker lifecycle state machine | Medium | 33 |
| 35 | Implement adaptive min/max scaling | High | 33, 34 |
| 36 | Add worker health monitoring | Medium | 34 |
| 37 | Implement idle worker recycling | Medium | 34, 35 |
| 38 | Create worker affinity system | High | 33-37 |
| 39 | Add metrics collection | Medium | 33-38 |
| 40 | Sprint 5 integration tests | High | 33-39 |

---

### SPRINT 6: Zero-Copy & SharedArrayBuffer (Tasks 41-48)
**Goal:** Eliminate serialization overhead where possible

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 41 | Design shared memory protocol | Very High | Sprint 3 |
| 42 | Implement SharedMemoryChannel | Very High | 41 |
| 43 | Create structured clone optimization | High | 42 |
| 44 | Implement message batching | High | 42, 43 |
| 45 | Add Transferable detection/optimization | Medium | 43 |
| 46 | Implement result streaming | High | 42, 44 |
| 47 | Fallback to IPC when SAB unavailable | Medium | 42-46 |
| 48 | Sprint 6 integration tests | High | 41-47 |

---

### SPRINT 7: Batch Operations & SIMD (Tasks 49-55)
**Goal:** Add batch task submission with SIMD acceleration

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 49 | Design batch API (Pool.execBatch) | Medium | Sprint 4 |
| 50 | Implement batch task serialization | High | 49 |
| 51 | Create SIMD batch processor in WASM | Very High | Sprint 3, 50 |
| 52 | Implement parallel map operation | High | 49, 51 |
| 53 | Add batch cancellation support | Medium | 49, 52 |
| 54 | Implement batch progress events | Medium | 49, 52 |
| 55 | Sprint 7 integration tests | High | 49-54 |

---

### SPRINT 8: API Finalization & Documentation (Tasks 56-62)
**Goal:** Polish public API, complete documentation

| # | Task | Complexity | Dependencies |
|---|------|------------|--------------|
| 56 | API review and breaking change audit | Medium | All |
| 57 | Create migration guide from v10 | Medium | 56 |
| 58 | Generate API documentation | Medium | 56 |
| 59 | Performance benchmark suite | High | All |
| 60 | Browser compatibility testing | High | All |
| 61 | Node.js version compatibility testing | High | All |
| 62 | Release candidate preparation | Medium | 56-61 |

---

## Detailed Task Specifications

### TASK 1: Setup TypeScript Build Infrastructure

**Objective:** Configure TypeScript compilation with strict mode, path aliases, and dual CJS/ESM output.

**Files to Create/Modify:**
- `tsconfig.json` (modify)
- `tsconfig.build.json` (create)
- `rollup.config.mjs` (modify)
- `package.json` (modify)

**Pseudocode:**
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noImplicitAny": true,
    "noImplicitReturns": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@core/*": ["src/core/*"],
      "@wasm/*": ["src/wasm/*"],
      "@platform/*": ["src/platform/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "assembly"]
}
```

**Acceptance Criteria:**
- [ ] `tsc --noEmit` passes with zero errors
- [ ] Rollup produces valid CJS and ESM bundles
- [ ] Source maps work correctly in debugger
- [ ] Declaration files generated in `types/`

---

### TASK 2: Define Core Type Definitions

**Objective:** Create comprehensive type definitions for all internal and external interfaces.

**Files to Create:**
- `src/types/index.ts`
- `src/types/internal.ts`
- `src/types/messages.ts`

**Pseudocode:**
```typescript
// src/types/index.ts - Public API types

/** Configuration options for creating a worker pool */
export interface PoolOptions<TWorkerMethods extends WorkerMethods = WorkerMethods> {
  /** Minimum number of workers to keep alive */
  readonly minWorkers?: number;
  /** Maximum number of concurrent workers */
  readonly maxWorkers?: number;
  /** Maximum tasks in queue before rejecting */
  readonly maxQueueSize?: number;
  /** Worker type selection strategy */
  readonly workerType?: WorkerType;
  /** Queue scheduling strategy */
  readonly queueStrategy?: QueueStrategy | TaskQueue<Task>;
  /** Timeout for worker termination cleanup (ms) */
  readonly workerTerminateTimeout?: number;
  /** Enable WASM acceleration (if available) */
  readonly useWasm?: boolean;
  /** Pre-warm workers on pool creation */
  readonly preWarm?: boolean;
  /** Emit stdout/stderr from workers */
  readonly emitStdStreams?: boolean;
  /** Callback when worker is created */
  readonly onCreateWorker?: WorkerLifecycleCallback;
  /** Callback when worker is terminated */
  readonly onTerminateWorker?: WorkerLifecycleCallback;
}

/** Worker type selection */
export type WorkerType = 'auto' | 'web' | 'thread' | 'process';

/** Queue strategy identifiers */
export type QueueStrategy = 'fifo' | 'lifo' | 'priority' | 'wasm-ring';

/** Generic worker method signature */
export type WorkerMethod<TArgs extends unknown[] = unknown[], TResult = unknown> =
  (...args: TArgs) => TResult | Promise<TResult>;

/** Map of worker method names to their implementations */
export type WorkerMethods = Record<string, WorkerMethod>;

/** Task execution options */
export interface ExecOptions<TEvent = unknown> {
  /** Event handler for worker emissions */
  readonly on?: (event: TEvent) => void;
  /** Transferable objects for zero-copy */
  readonly transfer?: Transferable[];
  /** Task priority (higher = sooner) */
  readonly priority?: number;
  /** Custom metadata for task tracking */
  readonly metadata?: Record<string, unknown>;
}

/** Pool statistics snapshot */
export interface PoolStats {
  readonly totalWorkers: number;
  readonly busyWorkers: number;
  readonly idleWorkers: number;
  readonly pendingTasks: number;
  readonly activeTasks: number;
  readonly wasmEnabled: boolean;
  readonly sharedMemoryEnabled: boolean;
}

// src/types/internal.ts - Internal types

/** Internal task representation */
export interface Task<TResult = unknown> {
  readonly id: number;
  readonly method: string;
  readonly params: unknown[];
  readonly resolver: Resolver<TResult>;
  readonly options?: ExecOptions;
  timeout: number | null;
  readonly createdAt: number;
  startedAt?: number;
}

/** Promise resolver pair */
export interface Resolver<T> {
  readonly promise: WorkerpoolPromise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/** Worker state machine states */
export const enum WorkerState {
  COLD = 0,        // Not yet initialized
  WARMING = 1,     // Initializing
  READY = 2,       // Available for tasks
  BUSY = 3,        // Executing task
  CLEANING = 4,    // Running cleanup
  TERMINATING = 5, // Shutting down
  TERMINATED = 6   // Fully stopped
}

// src/types/messages.ts - IPC Protocol

/** Discriminated union for all IPC messages */
export type IPCMessage =
  | TaskRequest
  | TaskResponse
  | TaskEvent
  | CleanupRequest
  | CleanupResponse
  | TerminateRequest
  | ReadySignal;

export interface TaskRequest {
  readonly type: 'task';
  readonly id: number;
  readonly method: string;
  readonly params: unknown[];
}

export interface TaskResponse {
  readonly type: 'response';
  readonly id: number;
  readonly result?: unknown;
  readonly error?: SerializedError;
}

export interface TaskEvent {
  readonly type: 'event';
  readonly id: number;
  readonly payload: unknown;
}

export interface CleanupRequest {
  readonly type: 'cleanup';
  readonly id: number;
}

export interface CleanupResponse {
  readonly type: 'cleanup-done';
  readonly id: number;
  readonly error?: SerializedError;
}

export interface TerminateRequest {
  readonly type: 'terminate';
}

export interface ReadySignal {
  readonly type: 'ready';
}

export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly [key: string]: unknown;
}
```

**Acceptance Criteria:**
- [ ] All types are exported from `src/types/index.ts`
- [ ] Types support generic worker method inference
- [ ] IPC messages use discriminated unions for type narrowing
- [ ] JSDoc comments on all public types

---

### TASK 4: Convert Promise.ts with Generics

**Objective:** Convert custom Promise implementation to TypeScript with full generic support.

**File:** `src/core/Promise.ts`

**Pseudocode:**
```typescript
// src/core/Promise.ts

/**
 * Custom Promise implementation with cancellation and timeout support.
 * @template T - Resolved value type
 * @template E - Error type (default: Error)
 */
export class WorkerpoolPromise<T, E extends Error = Error> implements PromiseLike<T> {
  private _onSuccess: Array<(value: T) => void> = [];
  private _onFail: Array<(error: E) => void> = [];
  private _state: PromiseState = PromiseState.PENDING;
  private _value?: T;
  private _error?: E;
  private readonly _parent?: WorkerpoolPromise<unknown>;

  public readonly [Symbol.toStringTag] = 'WorkerpoolPromise';

  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason: E) => void
    ) => void,
    parent?: WorkerpoolPromise<unknown>
  ) {
    if (typeof executor !== 'function') {
      throw new TypeError('Executor must be a function');
    }

    this._parent = parent;

    try {
      executor(
        (value) => this._resolve(value),
        (error) => this._reject(error)
      );
    } catch (error) {
      this._reject(error as E);
    }
  }

  /** Check if promise is still pending */
  public get pending(): boolean {
    return this._state === PromiseState.PENDING;
  }

  /** Check if promise was resolved */
  public get resolved(): boolean {
    return this._state === PromiseState.RESOLVED;
  }

  /** Check if promise was rejected */
  public get rejected(): boolean {
    return this._state === PromiseState.REJECTED;
  }

  /**
   * Attach success/failure handlers
   */
  public then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: E) => TResult2 | PromiseLike<TResult2>) | null
  ): WorkerpoolPromise<TResult1 | TResult2> {
    return new WorkerpoolPromise<TResult1 | TResult2>((resolve, reject) => {
      const handleSuccess = (value: T): void => {
        if (onFulfilled) {
          try {
            const result = onFulfilled(value);
            if (isPromiseLike(result)) {
              result.then(resolve, reject);
            } else {
              resolve(result);
            }
          } catch (error) {
            reject(error as E);
          }
        } else {
          resolve(value as unknown as TResult1);
        }
      };

      const handleFailure = (error: E): void => {
        if (onRejected) {
          try {
            const result = onRejected(error);
            if (isPromiseLike(result)) {
              result.then(resolve, reject);
            } else {
              resolve(result);
            }
          } catch (err) {
            reject(err as E);
          }
        } else {
          reject(error);
        }
      };

      this._subscribe(handleSuccess, handleFailure);
    }, this);
  }

  /**
   * Cancel the promise chain
   */
  public cancel(): this {
    if (this._parent) {
      this._parent.cancel();
    } else {
      this._reject(new CancellationError() as E);
    }
    return this;
  }

  /**
   * Set timeout for promise resolution
   */
  public timeout(ms: number): this {
    if (this._parent) {
      this._parent.timeout(ms);
    } else {
      const timer = setTimeout(() => {
        this._reject(new TimeoutError(`Promise timed out after ${ms}ms`) as E);
      }, ms);

      this.finally(() => clearTimeout(timer));
    }
    return this;
  }

  /**
   * Create a deferred promise with external resolve/reject
   */
  public static defer<T>(): Resolver<T> {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;

    const promise = new WorkerpoolPromise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  }

  /**
   * Wait for all promises to resolve
   */
  public static all<T>(promises: Array<WorkerpoolPromise<T>>): WorkerpoolPromise<T[]> {
    return new WorkerpoolPromise<T[]>((resolve, reject) => {
      if (promises.length === 0) {
        resolve([]);
        return;
      }

      const results: T[] = new Array(promises.length);
      let remaining = promises.length;

      promises.forEach((promise, index) => {
        promise.then(
          (value) => {
            results[index] = value;
            if (--remaining === 0) {
              resolve(results);
            }
          },
          (error) => {
            remaining = -1; // Prevent further processing
            reject(error);
          }
        );
      });
    });
  }

  private _resolve(value: T | PromiseLike<T>): void {
    if (this._state !== PromiseState.PENDING) return;

    if (isPromiseLike(value)) {
      value.then(
        (v) => this._resolve(v),
        (e) => this._reject(e)
      );
      return;
    }

    this._state = PromiseState.RESOLVED;
    this._value = value;
    this._onSuccess.forEach((fn) => fn(value));
    this._cleanup();
  }

  private _reject(error: E): void {
    if (this._state !== PromiseState.PENDING) return;

    this._state = PromiseState.REJECTED;
    this._error = error;
    this._onFail.forEach((fn) => fn(error));
    this._cleanup();
  }

  private _subscribe(
    onSuccess: (value: T) => void,
    onFail: (error: E) => void
  ): void {
    switch (this._state) {
      case PromiseState.PENDING:
        this._onSuccess.push(onSuccess);
        this._onFail.push(onFail);
        break;
      case PromiseState.RESOLVED:
        onSuccess(this._value!);
        break;
      case PromiseState.REJECTED:
        onFail(this._error!);
        break;
    }
  }

  private _cleanup(): void {
    this._onSuccess.length = 0;
    this._onFail.length = 0;
  }
}

const enum PromiseState {
  PENDING = 0,
  RESOLVED = 1,
  REJECTED = 2
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
}

/** Cancellation error */
export class CancellationError extends Error {
  public readonly name = 'CancellationError';
  constructor(message = 'Promise cancelled') {
    super(message);
  }
}

/** Timeout error */
export class TimeoutError extends Error {
  public readonly name = 'TimeoutError';
  constructor(message = 'Promise timed out') {
    super(message);
  }
}
```

**Acceptance Criteria:**
- [ ] Generic type inference works for `.then()` chaining
- [ ] `cancel()` propagates through parent chain
- [ ] `timeout()` properly clears timer on resolution
- [ ] `Promise.all()` rejects fast on first error
- [ ] All existing tests pass

---

### TASK 5: Convert queues.ts with Generics

**Objective:** Type-safe queue implementations with improved O(1) operations.

**File:** `src/core/TaskQueue.ts`

**Pseudocode:**
```typescript
// src/core/TaskQueue.ts

import type { Task } from '../types/internal';

/**
 * Interface for task queue implementations
 */
export interface TaskQueue<T extends Task = Task> {
  push(task: T): void;
  pop(): T | undefined;
  peek(): T | undefined;
  size(): number;
  contains(task: T): boolean;
  clear(): void;
  [Symbol.iterator](): Iterator<T>;
}

/**
 * High-performance FIFO queue using circular buffer
 * O(1) push and pop operations
 */
export class FIFOQueue<T extends Task = Task> implements TaskQueue<T> {
  private _buffer: Array<T | undefined>;
  private _head: number = 0;
  private _tail: number = 0;
  private _size: number = 0;
  private _capacity: number;

  constructor(initialCapacity: number = 64) {
    // Ensure power of 2 for fast modulo via bitwise AND
    this._capacity = nextPowerOf2(initialCapacity);
    this._buffer = new Array(this._capacity);
  }

  push(task: T): void {
    if (this._size === this._capacity) {
      this._grow();
    }
    this._buffer[this._tail] = task;
    this._tail = (this._tail + 1) & (this._capacity - 1); // Fast modulo
    this._size++;
  }

  pop(): T | undefined {
    if (this._size === 0) return undefined;

    const task = this._buffer[this._head];
    this._buffer[this._head] = undefined; // Allow GC
    this._head = (this._head + 1) & (this._capacity - 1);
    this._size--;
    return task;
  }

  peek(): T | undefined {
    return this._size > 0 ? this._buffer[this._head] : undefined;
  }

  size(): number {
    return this._size;
  }

  contains(task: T): boolean {
    for (let i = 0; i < this._size; i++) {
      const index = (this._head + i) & (this._capacity - 1);
      if (this._buffer[index] === task) return true;
    }
    return false;
  }

  clear(): void {
    this._buffer.fill(undefined);
    this._head = 0;
    this._tail = 0;
    this._size = 0;
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this._size; i++) {
      yield this._buffer[(this._head + i) & (this._capacity - 1)]!;
    }
  }

  private _grow(): void {
    const newCapacity = this._capacity * 2;
    const newBuffer = new Array<T | undefined>(newCapacity);

    // Copy elements in order
    for (let i = 0; i < this._size; i++) {
      newBuffer[i] = this._buffer[(this._head + i) & (this._capacity - 1)];
    }

    this._buffer = newBuffer;
    this._head = 0;
    this._tail = this._size;
    this._capacity = newCapacity;
  }
}

/**
 * LIFO stack implementation
 */
export class LIFOQueue<T extends Task = Task> implements TaskQueue<T> {
  private _tasks: T[] = [];

  push(task: T): void {
    this._tasks.push(task);
  }

  pop(): T | undefined {
    return this._tasks.pop();
  }

  peek(): T | undefined {
    return this._tasks[this._tasks.length - 1];
  }

  size(): number {
    return this._tasks.length;
  }

  contains(task: T): boolean {
    return this._tasks.includes(task);
  }

  clear(): void {
    this._tasks.length = 0;
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let i = this._tasks.length - 1; i >= 0; i--) {
      yield this._tasks[i];
    }
  }
}

/**
 * Priority queue using binary heap
 * Higher priority values are dequeued first
 */
export class PriorityQueue<T extends Task = Task> implements TaskQueue<T> {
  private _heap: T[] = [];
  private _getPriority: (task: T) => number;

  constructor(getPriority: (task: T) => number = (t) => t.options?.priority ?? 0) {
    this._getPriority = getPriority;
  }

  push(task: T): void {
    this._heap.push(task);
    this._siftUp(this._heap.length - 1);
  }

  pop(): T | undefined {
    if (this._heap.length === 0) return undefined;

    const top = this._heap[0];
    const last = this._heap.pop()!;

    if (this._heap.length > 0) {
      this._heap[0] = last;
      this._siftDown(0);
    }

    return top;
  }

  peek(): T | undefined {
    return this._heap[0];
  }

  size(): number {
    return this._heap.length;
  }

  contains(task: T): boolean {
    return this._heap.includes(task);
  }

  clear(): void {
    this._heap.length = 0;
  }

  *[Symbol.iterator](): Iterator<T> {
    // Return copy sorted by priority
    const sorted = [...this._heap].sort(
      (a, b) => this._getPriority(b) - this._getPriority(a)
    );
    yield* sorted;
  }

  private _siftUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this._getPriority(this._heap[index]) <= this._getPriority(this._heap[parentIndex])) {
        break;
      }
      this._swap(index, parentIndex);
      index = parentIndex;
    }
  }

  private _siftDown(index: number): void {
    const length = this._heap.length;
    while (true) {
      const leftChild = (index << 1) + 1;
      const rightChild = (index << 1) + 2;
      let largest = index;

      if (leftChild < length &&
          this._getPriority(this._heap[leftChild]) > this._getPriority(this._heap[largest])) {
        largest = leftChild;
      }
      if (rightChild < length &&
          this._getPriority(this._heap[rightChild]) > this._getPriority(this._heap[largest])) {
        largest = rightChild;
      }

      if (largest === index) break;
      this._swap(index, largest);
      index = largest;
    }
  }

  private _swap(i: number, j: number): void {
    [this._heap[i], this._heap[j]] = [this._heap[j], this._heap[i]];
  }
}

/**
 * Factory function to create queue by strategy name
 */
export function createQueue<T extends Task = Task>(
  strategy: 'fifo' | 'lifo' | 'priority'
): TaskQueue<T> {
  switch (strategy) {
    case 'fifo':
      return new FIFOQueue<T>();
    case 'lifo':
      return new LIFOQueue<T>();
    case 'priority':
      return new PriorityQueue<T>();
    default:
      throw new Error(`Unknown queue strategy: ${strategy}`);
  }
}

function nextPowerOf2(n: number): number {
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}
```

**Acceptance Criteria:**
- [ ] FIFO queue maintains O(1) push/pop
- [ ] Priority queue correctly orders by priority
- [ ] All queues implement `Iterable` interface
- [ ] Memory is properly released on `clear()`
- [ ] Generic type inference works correctly

---

### TASK 19: Implement Ring Buffer in AssemblyScript

**Objective:** Create a lock-free ring buffer in AssemblyScript for zero-allocation task queuing.

**Files:**
- `assembly/ring-buffer.ts`
- `src/wasm/ring-buffer.ts` (JS wrapper)

**Pseudocode:**
```typescript
// assembly/ring-buffer.ts - AssemblyScript

// Memory layout:
// [0-3]:   head (u32)
// [4-7]:   tail (u32)
// [8-11]:  capacity (u32)
// [12-15]: mask (u32, capacity - 1 for fast modulo)
// [16+]:   data slots (u64 each - 32-bit id + 32-bit priority)

const HEADER_SIZE: u32 = 16;
const SLOT_SIZE: u32 = 8;

/** Initialize ring buffer at memory offset */
export function init(offset: u32, capacity: u32): void {
  // Ensure power of 2
  const actualCapacity = nextPowerOf2(capacity);
  const mask = actualCapacity - 1;

  store<u32>(offset, 0);           // head = 0
  store<u32>(offset + 4, 0);       // tail = 0
  store<u32>(offset + 8, actualCapacity);
  store<u32>(offset + 12, mask);

  // Zero out data slots
  memory.fill(offset + HEADER_SIZE, 0, actualCapacity * SLOT_SIZE);
}

/** Push task to buffer. Returns false if full. */
export function push(offset: u32, taskId: u32, priority: u32): bool {
  const head = Atomics.load<u32>(offset);
  const tail = Atomics.load<u32>(offset + 4);
  const capacity = load<u32>(offset + 8);
  const mask = load<u32>(offset + 12);

  const size = (tail - head) & 0xFFFFFFFF;
  if (size >= capacity) {
    return false; // Buffer full
  }

  // Pack taskId and priority into u64
  const slot = offset + HEADER_SIZE + ((tail & mask) * SLOT_SIZE);
  const packed: u64 = (<u64>priority << 32) | <u64>taskId;

  Atomics.store<u64>(slot, packed);
  Atomics.store<u32>(offset + 4, tail + 1);

  return true;
}

/** Pop task from buffer. Returns 0 if empty. */
export function pop(offset: u32): u64 {
  const head = Atomics.load<u32>(offset);
  const tail = Atomics.load<u32>(offset + 4);

  if (head === tail) {
    return 0; // Buffer empty
  }

  const mask = load<u32>(offset + 12);
  const slot = offset + HEADER_SIZE + ((head & mask) * SLOT_SIZE);
  const packed = Atomics.load<u64>(slot);

  Atomics.store<u32>(offset, head + 1);

  return packed;
}

/** Get current size */
export function size(offset: u32): u32 {
  const head = Atomics.load<u32>(offset);
  const tail = Atomics.load<u32>(offset + 4);
  return (tail - head) & 0xFFFFFFFF;
}

/** Check if buffer contains task with given id */
export function contains(offset: u32, taskId: u32): bool {
  const head = Atomics.load<u32>(offset);
  const tail = Atomics.load<u32>(offset + 4);
  const mask = load<u32>(offset + 12);

  for (let i = head; i !== tail; i++) {
    const slot = offset + HEADER_SIZE + ((i & mask) * SLOT_SIZE);
    const packed = Atomics.load<u64>(slot);
    const id = <u32>(packed & 0xFFFFFFFF);
    if (id === taskId) {
      return true;
    }
  }
  return false;
}

/** Clear buffer */
export function clear(offset: u32): void {
  Atomics.store<u32>(offset, 0);
  Atomics.store<u32>(offset + 4, 0);
}

/** Calculate memory needed for given capacity */
export function memoryNeeded(capacity: u32): u32 {
  return HEADER_SIZE + (nextPowerOf2(capacity) * SLOT_SIZE);
}

function nextPowerOf2(n: u32): u32 {
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}


// src/wasm/ring-buffer.ts - JavaScript wrapper

import type { Task } from '../types/internal';

interface RingBufferExports {
  memory: WebAssembly.Memory;
  init(offset: number, capacity: number): void;
  push(offset: number, taskId: number, priority: number): boolean;
  pop(offset: number): bigint;
  size(offset: number): number;
  contains(offset: number, taskId: number): boolean;
  clear(offset: number): void;
  memoryNeeded(capacity: number): number;
}

/**
 * JavaScript wrapper for WASM ring buffer
 */
export class WASMRingBuffer {
  private readonly _exports: RingBufferExports;
  private readonly _offset: number;
  private readonly _taskMap: Map<number, Task>;
  private _nextId: number = 1;

  private constructor(exports: RingBufferExports, offset: number) {
    this._exports = exports;
    this._offset = offset;
    this._taskMap = new Map();
  }

  static async create(capacity: number): Promise<WASMRingBuffer> {
    const wasmModule = await loadWASMModule('ring-buffer.wasm');
    const memoryNeeded = wasmModule.exports.memoryNeeded(capacity);

    // Allocate at offset 0 for simplicity
    wasmModule.exports.init(0, capacity);

    return new WASMRingBuffer(wasmModule.exports as RingBufferExports, 0);
  }

  push(task: Task): boolean {
    const id = this._nextId++;
    const priority = task.options?.priority ?? 0;

    if (this._exports.push(this._offset, id, priority)) {
      this._taskMap.set(id, task);
      return true;
    }
    return false;
  }

  pop(): Task | undefined {
    const packed = this._exports.pop(this._offset);
    if (packed === 0n) return undefined;

    const id = Number(packed & 0xFFFFFFFFn);
    const task = this._taskMap.get(id);
    this._taskMap.delete(id);

    return task;
  }

  size(): number {
    return this._exports.size(this._offset);
  }

  contains(task: Task): boolean {
    for (const [id, t] of this._taskMap) {
      if (t === task) {
        return this._exports.contains(this._offset, id);
      }
    }
    return false;
  }

  clear(): void {
    this._exports.clear(this._offset);
    this._taskMap.clear();
  }
}

async function loadWASMModule(path: string): Promise<WebAssembly.Instance> {
  const response = await fetch(path);
  const bytes = await response.arrayBuffer();
  const module = await WebAssembly.instantiate(bytes, {
    env: {
      memory: new WebAssembly.Memory({ initial: 16, maximum: 256, shared: true })
    }
  });
  return module.instance;
}
```

**Acceptance Criteria:**
- [ ] Lock-free operations using Atomics
- [ ] Zero-allocation push/pop operations
- [ ] Correct handling of wrap-around
- [ ] Works with SharedArrayBuffer
- [ ] Benchmark shows >2x improvement over JS

---

### TASK 33: Implement WorkerCache for Pre-Warming

**Objective:** Create a worker cache that maintains pre-warmed workers for instant task dispatch.

**File:** `src/workers/worker-pool.ts`

**Pseudocode:**
```typescript
// src/workers/worker-pool.ts

import { WorkerHandler } from '../core/WorkerHandler';
import type { PoolOptions, WorkerState } from '../types';

interface CachedWorker {
  handler: WorkerHandler;
  state: WorkerState;
  lastUsed: number;
  taskCount: number;
}

/**
 * Pre-warmed worker cache for instant task dispatch
 */
export class WorkerCache {
  private readonly _options: Required<PoolOptions>;
  private readonly _cache: Map<number, CachedWorker> = new Map();
  private readonly _warmPool: CachedWorker[] = [];
  private readonly _coldPool: CachedWorker[] = [];

  private _nextId: number = 0;
  private _warmingPromise: Promise<void> | null = null;
  private _isShuttingDown: boolean = false;

  constructor(options: Required<PoolOptions>) {
    this._options = options;

    if (options.preWarm) {
      this._warmingPromise = this._warmUp();
    }
  }

  /**
   * Get an available worker, preferring pre-warmed ones
   */
  async acquire(): Promise<WorkerHandler | null> {
    // Wait for initial warm-up if in progress
    if (this._warmingPromise) {
      await this._warmingPromise;
    }

    // 1. Try to get from warm pool (O(1) - pop from end)
    if (this._warmPool.length > 0) {
      const cached = this._warmPool.pop()!;
      cached.state = WorkerState.BUSY;
      cached.lastUsed = Date.now();
      cached.taskCount++;
      return cached.handler;
    }

    // 2. Try to create new worker if under max
    if (this._cache.size < this._options.maxWorkers) {
      const cached = await this._createWorker();
      if (cached) {
        cached.state = WorkerState.BUSY;
        return cached.handler;
      }
    }

    // 3. No workers available
    return null;
  }

  /**
   * Release worker back to pool
   */
  release(handler: WorkerHandler): void {
    const cached = this._findByHandler(handler);
    if (!cached) return;

    if (this._isShuttingDown) {
      this._terminateWorker(cached);
      return;
    }

    // Check if worker should be recycled
    if (this._shouldRecycle(cached)) {
      this._recycleWorker(cached);
      return;
    }

    cached.state = WorkerState.READY;
    cached.lastUsed = Date.now();
    this._warmPool.push(cached);

    // Trigger background warm-up if below min
    this._maintainMinWorkers();
  }

  /**
   * Get pool statistics
   */
  stats(): { total: number; warm: number; busy: number; cold: number } {
    return {
      total: this._cache.size,
      warm: this._warmPool.length,
      busy: this._cache.size - this._warmPool.length - this._coldPool.length,
      cold: this._coldPool.length
    };
  }

  /**
   * Gracefully shutdown all workers
   */
  async shutdown(force: boolean = false): Promise<void> {
    this._isShuttingDown = true;

    const terminatePromises: Promise<void>[] = [];

    for (const cached of this._cache.values()) {
      terminatePromises.push(
        cached.handler
          .terminateAndNotify(force, this._options.workerTerminateTimeout)
          .then(() => {
            this._cache.delete(cached.handler.id);
          })
      );
    }

    await Promise.all(terminatePromises);
    this._warmPool.length = 0;
    this._coldPool.length = 0;
  }

  /**
   * Pre-warm workers up to minWorkers
   */
  private async _warmUp(): Promise<void> {
    const warmUpPromises: Promise<void>[] = [];

    for (let i = 0; i < this._options.minWorkers; i++) {
      warmUpPromises.push(
        this._createWorker().then((cached) => {
          if (cached) {
            this._warmPool.push(cached);
          }
        })
      );
    }

    await Promise.all(warmUpPromises);
    this._warmingPromise = null;
  }

  /**
   * Create and initialize a new worker
   */
  private async _createWorker(): Promise<CachedWorker | null> {
    try {
      const id = this._nextId++;
      const handler = new WorkerHandler(this._options.script, {
        ...this._options,
        debugPort: this._allocateDebugPort()
      });

      // Wait for worker to be ready
      await handler.whenReady();

      const cached: CachedWorker = {
        handler,
        state: WorkerState.READY,
        lastUsed: Date.now(),
        taskCount: 0
      };

      this._cache.set(id, cached);

      // Setup crash handler
      handler.onCrash(() => {
        this._handleWorkerCrash(cached);
      });

      return cached;
    } catch (error) {
      console.error('Failed to create worker:', error);
      return null;
    }
  }

  /**
   * Check if worker should be recycled based on age/usage
   */
  private _shouldRecycle(cached: CachedWorker): boolean {
    const age = Date.now() - cached.lastUsed;
    const maxAge = 60_000; // 1 minute idle timeout
    const maxTasks = 10_000; // Recycle after N tasks

    return age > maxAge || cached.taskCount > maxTasks;
  }

  /**
   * Recycle worker - terminate and create replacement
   */
  private async _recycleWorker(cached: CachedWorker): Promise<void> {
    await this._terminateWorker(cached);

    // Create replacement if below min
    if (this._cache.size < this._options.minWorkers) {
      const replacement = await this._createWorker();
      if (replacement) {
        this._warmPool.push(replacement);
      }
    }
  }

  /**
   * Terminate a specific worker
   */
  private async _terminateWorker(cached: CachedWorker): Promise<void> {
    cached.state = WorkerState.TERMINATING;

    try {
      await cached.handler.terminateAndNotify(false, this._options.workerTerminateTimeout);
    } finally {
      this._cache.delete(cached.handler.id);
    }
  }

  /**
   * Handle worker crash - remove and potentially replace
   */
  private _handleWorkerCrash(cached: CachedWorker): void {
    cached.state = WorkerState.TERMINATED;
    this._cache.delete(cached.handler.id);

    // Remove from pools
    const warmIndex = this._warmPool.indexOf(cached);
    if (warmIndex !== -1) this._warmPool.splice(warmIndex, 1);

    const coldIndex = this._coldPool.indexOf(cached);
    if (coldIndex !== -1) this._coldPool.splice(coldIndex, 1);

    // Replace if below min
    this._maintainMinWorkers();
  }

  /**
   * Ensure minimum workers are maintained
   */
  private _maintainMinWorkers(): void {
    const deficit = this._options.minWorkers - this._cache.size;

    if (deficit > 0 && !this._isShuttingDown) {
      // Background creation
      for (let i = 0; i < deficit; i++) {
        this._createWorker().then((cached) => {
          if (cached && !this._isShuttingDown) {
            this._warmPool.push(cached);
          }
        });
      }
    }
  }

  private _findByHandler(handler: WorkerHandler): CachedWorker | undefined {
    for (const cached of this._cache.values()) {
      if (cached.handler === handler) return cached;
    }
    return undefined;
  }

  private _allocateDebugPort(): number {
    // Implementation depends on debug-port-allocator
    return 0;
  }
}
```

**Acceptance Criteria:**
- [ ] Pre-warming creates minWorkers on pool init
- [ ] acquire() returns pre-warmed worker in <1ms
- [ ] Workers are recycled after threshold
- [ ] Crash detection and replacement works
- [ ] Clean shutdown terminates all workers

---

### TASK 42: Implement SharedMemoryChannel

**Objective:** Create zero-copy message passing using SharedArrayBuffer.

**File:** `src/platform/shared-memory.ts`

**Pseudocode:**
```typescript
// src/platform/shared-memory.ts

const HEADER_SIZE = 64; // Bytes for metadata
const MESSAGE_SLOT_SIZE = 4096; // 4KB per message slot
const MAX_MESSAGE_SIZE = MESSAGE_SLOT_SIZE - 16; // Reserve for length + flags

interface ChannelHeader {
  // Offsets in SharedArrayBuffer
  writeIndex: number;  // 0-3: Next slot to write
  readIndex: number;   // 4-7: Next slot to read
  slotCount: number;   // 8-11: Total slots
  flags: number;       // 12-15: Channel state flags
}

/**
 * Lock-free bi-directional channel using SharedArrayBuffer
 */
export class SharedMemoryChannel {
  private readonly _sab: SharedArrayBuffer;
  private readonly _view: DataView;
  private readonly _u8: Uint8Array;
  private readonly _i32: Int32Array;
  private readonly _slotCount: number;
  private readonly _encoder: TextEncoder;
  private readonly _decoder: TextDecoder;

  private constructor(sab: SharedArrayBuffer, slotCount: number) {
    this._sab = sab;
    this._view = new DataView(sab);
    this._u8 = new Uint8Array(sab);
    this._i32 = new Int32Array(sab);
    this._slotCount = slotCount;
    this._encoder = new TextEncoder();
    this._decoder = new TextDecoder();
  }

  /**
   * Create a new channel with given capacity
   */
  static create(slotCount: number = 16): SharedMemoryChannel {
    const size = HEADER_SIZE + (slotCount * MESSAGE_SLOT_SIZE);
    const sab = new SharedArrayBuffer(size);

    // Initialize header
    const view = new DataView(sab);
    view.setUint32(0, 0, true);  // writeIndex
    view.setUint32(4, 0, true);  // readIndex
    view.setUint32(8, slotCount, true);
    view.setUint32(12, 0, true); // flags

    return new SharedMemoryChannel(sab, slotCount);
  }

  /**
   * Attach to existing SharedArrayBuffer
   */
  static attach(sab: SharedArrayBuffer): SharedMemoryChannel {
    const view = new DataView(sab);
    const slotCount = view.getUint32(8, true);
    return new SharedMemoryChannel(sab, slotCount);
  }

  /**
   * Get underlying buffer for transfer to worker
   */
  get buffer(): SharedArrayBuffer {
    return this._sab;
  }

  /**
   * Send message (non-blocking)
   * Returns false if channel is full
   */
  send(message: unknown): boolean {
    const json = JSON.stringify(message);
    const bytes = this._encoder.encode(json);

    if (bytes.length > MAX_MESSAGE_SIZE) {
      throw new Error(`Message too large: ${bytes.length} > ${MAX_MESSAGE_SIZE}`);
    }

    // Atomic read of indices
    const writeIndex = Atomics.load(this._i32, 0);
    const readIndex = Atomics.load(this._i32, 1);

    // Check if full (writeIndex - readIndex == slotCount)
    const used = (writeIndex - readIndex) >>> 0;
    if (used >= this._slotCount) {
      return false; // Channel full
    }

    // Calculate slot offset
    const slotIndex = writeIndex % this._slotCount;
    const slotOffset = HEADER_SIZE + (slotIndex * MESSAGE_SLOT_SIZE);

    // Write message length
    this._view.setUint32(slotOffset, bytes.length, true);

    // Write message bytes
    this._u8.set(bytes, slotOffset + 4);

    // Memory barrier then increment write index
    Atomics.store(this._i32, 0, writeIndex + 1);

    // Wake waiting receivers
    Atomics.notify(this._i32, 0, 1);

    return true;
  }

  /**
   * Receive message (non-blocking)
   * Returns undefined if channel is empty
   */
  receive(): unknown | undefined {
    const writeIndex = Atomics.load(this._i32, 0);
    const readIndex = Atomics.load(this._i32, 1);

    // Check if empty
    if (readIndex === writeIndex) {
      return undefined;
    }

    // Calculate slot offset
    const slotIndex = readIndex % this._slotCount;
    const slotOffset = HEADER_SIZE + (slotIndex * MESSAGE_SLOT_SIZE);

    // Read message length
    const length = this._view.getUint32(slotOffset, true);

    // Read message bytes
    const bytes = this._u8.slice(slotOffset + 4, slotOffset + 4 + length);
    const json = this._decoder.decode(bytes);

    // Increment read index
    Atomics.store(this._i32, 1, readIndex + 1);

    return JSON.parse(json);
  }

  /**
   * Receive with blocking wait
   * @param timeout - Max wait time in ms (0 = infinite)
   */
  receiveBlocking(timeout: number = 0): unknown | undefined {
    const deadline = timeout > 0 ? Date.now() + timeout : Infinity;

    while (Date.now() < deadline) {
      const message = this.receive();
      if (message !== undefined) {
        return message;
      }

      // Wait for notification
      const remaining = timeout > 0 ? Math.max(0, deadline - Date.now()) : Infinity;
      const readIndex = Atomics.load(this._i32, 1);
      const writeIndex = Atomics.load(this._i32, 0);

      if (readIndex === writeIndex) {
        Atomics.wait(this._i32, 0, writeIndex, remaining);
      }
    }

    return undefined;
  }

  /**
   * Check if channel has pending messages
   */
  hasMessages(): boolean {
    const writeIndex = Atomics.load(this._i32, 0);
    const readIndex = Atomics.load(this._i32, 1);
    return writeIndex !== readIndex;
  }

  /**
   * Get number of pending messages
   */
  pendingCount(): number {
    const writeIndex = Atomics.load(this._i32, 0);
    const readIndex = Atomics.load(this._i32, 1);
    return (writeIndex - readIndex) >>> 0;
  }

  /**
   * Clear all pending messages
   */
  clear(): void {
    const writeIndex = Atomics.load(this._i32, 0);
    Atomics.store(this._i32, 1, writeIndex);
  }
}

/**
 * Check if SharedArrayBuffer is available
 */
export function isSharedMemorySupported(): boolean {
  try {
    return (
      typeof SharedArrayBuffer !== 'undefined' &&
      typeof Atomics !== 'undefined' &&
      crossOriginIsolated === true
    );
  } catch {
    return false;
  }
}
```

**Acceptance Criteria:**
- [ ] Zero-copy transfer of structured data
- [ ] Lock-free operations using Atomics
- [ ] Blocking receive with timeout
- [ ] Graceful fallback detection
- [ ] Benchmark shows >5x improvement for large messages

---

### TASK 49: Design Batch API (Pool.execBatch)

**Objective:** Add batch task submission for improved throughput.

**File:** `src/core/Pool.ts` (additions)

**Pseudocode:**
```typescript
// Addition to Pool class

interface BatchOptions<T> extends ExecOptions {
  /** Maximum concurrent tasks from this batch */
  concurrency?: number;
  /** Continue on error or fail-fast */
  failFast?: boolean;
  /** Progress callback */
  onProgress?: (completed: number, total: number, results: T[]) => void;
}

interface BatchResult<T> {
  /** All results in order */
  results: Array<T | Error>;
  /** Successful results only */
  successes: T[];
  /** Failed results with indices */
  failures: Array<{ index: number; error: Error }>;
  /** Total execution time in ms */
  duration: number;
}

/**
 * Execute multiple tasks as a batch with optimized dispatch
 *
 * @example
 * // Process array in parallel
 * const results = await pool.execBatch('processItem', items.map(item => [item]));
 *
 * @example
 * // With progress tracking
 * const results = await pool.execBatch('compute', params, {
 *   onProgress: (done, total) => console.log(`${done}/${total}`)
 * });
 */
Pool.prototype.execBatch = function<T>(
  method: string,
  paramsList: unknown[][],
  options?: BatchOptions<T>
): WorkerpoolPromise<BatchResult<T>> {
  const startTime = performance.now();
  const total = paramsList.length;
  const results: Array<T | Error> = new Array(total);
  const successes: T[] = [];
  const failures: Array<{ index: number; error: Error }> = [];

  const concurrency = options?.concurrency ?? this.maxWorkers;
  const failFast = options?.failFast ?? false;

  let completed = 0;
  let nextIndex = 0;
  let cancelled = false;

  const resolver = WorkerpoolPromise.defer<BatchResult<T>>();

  const executeNext = (): void => {
    if (cancelled || nextIndex >= total) return;

    const index = nextIndex++;
    const params = paramsList[index];

    this.exec(method, params, options)
      .then((result: T) => {
        if (cancelled) return;

        results[index] = result;
        successes.push(result);
        completed++;

        options?.onProgress?.(completed, total, successes);

        if (completed === total) {
          resolver.resolve({
            results,
            successes,
            failures,
            duration: performance.now() - startTime
          });
        } else {
          executeNext();
        }
      })
      .catch((error: Error) => {
        if (cancelled) return;

        results[index] = error;
        failures.push({ index, error });
        completed++;

        if (failFast) {
          cancelled = true;
          resolver.reject(error);
          return;
        }

        options?.onProgress?.(completed, total, successes);

        if (completed === total) {
          resolver.resolve({
            results,
            successes,
            failures,
            duration: performance.now() - startTime
          });
        } else {
          executeNext();
        }
      });
  };

  // Start initial batch
  const initialBatch = Math.min(concurrency, total);
  for (let i = 0; i < initialBatch; i++) {
    executeNext();
  }

  // Handle batch cancellation
  resolver.promise.cancel = () => {
    cancelled = true;
    resolver.reject(new CancellationError('Batch cancelled'));
    return resolver.promise;
  };

  return resolver.promise;
};

/**
 * Parallel map operation
 *
 * @example
 * const doubled = await pool.map(numbers, (n) => n * 2);
 */
Pool.prototype.map = function<T, R>(
  items: T[],
  fn: (item: T, index: number) => R | Promise<R>,
  options?: BatchOptions<R>
): WorkerpoolPromise<R[]> {
  // Convert function to string for worker execution
  const fnString = fn.toString();

  // Create parameter list with item and index
  const paramsList = items.map((item, index) => [fnString, [item, index]]);

  return this.execBatch<R>('run', paramsList, options)
    .then((result) => result.successes);
};

/**
 * Parallel reduce operation
 */
Pool.prototype.reduce = async function<T, R>(
  items: T[],
  fn: (accumulator: R, item: T, index: number) => R | Promise<R>,
  initialValue: R,
  options?: { chunkSize?: number }
): Promise<R> {
  const chunkSize = options?.chunkSize ?? Math.ceil(items.length / this.maxWorkers);

  // Split into chunks
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }

  // Reduce each chunk in parallel
  const fnString = fn.toString();
  const chunkResults = await this.execBatch<R>(
    'run',
    chunks.map((chunk, chunkIndex) => [
      `(chunk, startIndex, reducer, initial) => {
        const fn = ${fnString};
        return chunk.reduce((acc, item, i) => fn(acc, item, startIndex + i), initial);
      }`,
      [chunk, chunkIndex * chunkSize, fnString, initialValue]
    ])
  );

  // Final reduce on main thread
  return chunkResults.successes.reduce(
    (acc, result) => fn(acc, result as unknown as T, 0),
    initialValue
  );
};
```

**Acceptance Criteria:**
- [ ] Batch maintains order of results
- [ ] Fail-fast mode cancels pending tasks
- [ ] Progress callback fires after each completion
- [ ] Batch cancellation works correctly
- [ ] Map/reduce operations work with async functions

---

## Performance Benchmarks

### Target Metrics

| Metric | Current | Target | Method |
|--------|---------|--------|--------|
| Task dispatch latency | ~2ms | <0.5ms | Pre-warmed workers |
| Queue push/pop | O(n) | O(1) | Ring buffer |
| Message serialization | ~0.3ms/KB | ~0.05ms/KB | SharedArrayBuffer |
| Worker spawn time | ~80ms | <5ms | Pre-warming |
| Batch throughput | 500 tasks/s | 5000 tasks/s | Batching + WASM |
| Memory per worker | ~10MB | ~5MB | Pooled allocations |

### Benchmark Suite

```typescript
// benchmark/suite.ts

import { Pool } from '../src';

async function runBenchmarks() {
  const pool = await Pool.create({
    maxWorkers: 8,
    preWarm: true,
    useWasm: true
  });

  // 1. Single task latency
  const latencies: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const start = performance.now();
    await pool.exec('noop', []);
    latencies.push(performance.now() - start);
  }
  console.log('Avg latency:', mean(latencies), 'ms');
  console.log('P99 latency:', percentile(latencies, 99), 'ms');

  // 2. Throughput (tasks/second)
  const throughputStart = performance.now();
  await pool.execBatch('noop', Array(10000).fill([]));
  const throughputTime = performance.now() - throughputStart;
  console.log('Throughput:', 10000 / (throughputTime / 1000), 'tasks/s');

  // 3. Large message transfer
  const largeData = new ArrayBuffer(1024 * 1024); // 1MB
  const transferStart = performance.now();
  await pool.exec('echo', [largeData], { transfer: [largeData] });
  console.log('1MB transfer:', performance.now() - transferStart, 'ms');

  // 4. CPU-bound work scaling
  const cpuWork = (n: number) => {
    let sum = 0;
    for (let i = 0; i < n * 1000000; i++) sum += i;
    return sum;
  };

  const scalingResults: Record<number, number> = {};
  for (const workers of [1, 2, 4, 8]) {
    const testPool = await Pool.create({ maxWorkers: workers, preWarm: true });
    const start = performance.now();
    await testPool.execBatch('run', Array(workers).fill([cpuWork.toString(), [10]]));
    scalingResults[workers] = performance.now() - start;
    await testPool.terminate();
  }
  console.log('Scaling:', scalingResults);

  await pool.terminate();
}
```

---

## Migration Strategy

### Phase 1: Non-Breaking (v10.x patch releases)
1. Add TypeScript source alongside JS
2. Generate types from TS instead of JSDoc
3. Internal refactoring with same API

### Phase 2: Minor Breaking (v11.0)
1. Remove deprecated `nodeWorker` option
2. Change Promise import to named export
3. Add new batch/WASM APIs as opt-in

### Phase 3: Major (v12.0)
1. WASM-first architecture
2. SharedArrayBuffer required for best performance
3. Drop Node.js < 18 support

### Compatibility Matrix

| Feature | Node 16 | Node 18 | Node 20+ | Browser |
|---------|---------|---------|----------|---------|
| TypeScript types | Yes | Yes | Yes | Yes |
| Basic pool | Yes | Yes | Yes | Yes |
| WASM scheduler | No | Yes | Yes | Yes* |
| SharedArrayBuffer | No | Yes | Yes | COOP** |
| SIMD batch | No | No | Yes | Yes*** |

\* Requires WASM support
\** Requires Cross-Origin-Opener-Policy headers
\*** Requires SIMD support in browser

---

## Appendix: File Checklist

### New Files to Create
- [ ] `src/types/index.ts`
- [ ] `src/types/internal.ts`
- [ ] `src/types/messages.ts`
- [ ] `src/core/Promise.ts`
- [ ] `src/core/Pool.ts`
- [ ] `src/core/WorkerHandler.ts`
- [ ] `src/core/TaskQueue.ts`
- [ ] `src/workers/worker.ts`
- [ ] `src/workers/worker-pool.ts`
- [ ] `src/platform/environment.ts`
- [ ] `src/platform/transfer.ts`
- [ ] `src/platform/shared-memory.ts`
- [ ] `src/wasm/ring-buffer.ts`
- [ ] `src/wasm/scheduler.ts`
- [ ] `assembly/ring-buffer.ts`
- [ ] `assembly/scheduler.ts`
- [ ] `assembly/tsconfig.json`
- [ ] `benchmark/suite.ts`
- [ ] `tsconfig.build.json`

### Files to Delete (after migration)
- [ ] `src/index.js`
- [ ] `src/Pool.js`
- [ ] `src/WorkerHandler.js`
- [ ] `src/worker.js`
- [ ] `src/Promise.js`
- [ ] `src/queues.js`
- [ ] `src/environment.js`
- [ ] `src/transfer.js`
- [ ] `src/types.js`
- [ ] `src/validateOptions.js`
- [ ] `src/debug-port-allocator.js`

---

*This document is a living specification. Update as implementation progresses.*
