# Workerpool Components

This document provides detailed documentation for each major component in workerpool.

## Table of Contents

- [Public API (index.js)](#public-api-indexjs)
- [Pool](#pool)
- [WorkerHandler](#workerhandler)
- [Worker Runtime](#worker-runtime)
- [Promise](#promise)
- [Task Queues](#task-queues)
- [Environment Detection](#environment-detection)
- [Transfer](#transfer)
- [WASM Module](#wasm-module)

---

## Public API (index.js)

**Location:** `src/index.js`, `src/index.ts`

The entry point that exports the public API.

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `pool([script], [options])` | Function | Create a worker pool |
| `worker([methods], [options])` | Function | Register worker methods |
| `workerEmit(payload)` | Function | Emit event from worker |
| `Transfer` | Class | Wrapper for transferable objects |
| `Promise` | Class | Enhanced Promise implementation |
| `platform` | String | `'node'` or `'browser'` |
| `isMainThread` | Boolean | True if running in main thread |
| `cpus` | Number | Number of available CPUs |
| `TerminateError` | Class | Error for terminated workers |

### Usage

```javascript
const workerpool = require('workerpool');

// Create pool
const pool = workerpool.pool('./worker.js', { maxWorkers: 4 });

// In worker script
workerpool.worker({
  myMethod: function(x) { return x * 2; }
});
```

---

## Pool

**Location:** `src/Pool.js`, `src/core/Pool.ts`

Manages the lifecycle of workers and the task queue.

### Constructor

```javascript
new Pool(script?: string, options?: PoolOptions)
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `script` | string \| null | Path to worker script |
| `workers` | WorkerHandler[] | Array of active workers |
| `taskQueue` | TaskQueue | Queue holding pending tasks |
| `maxWorkers` | number | Maximum workers allowed |
| `minWorkers` | number | Minimum workers to maintain |
| `maxQueueSize` | number | Maximum queue size |
| `workerType` | string | Worker backend type |
| `workerTerminateTimeout` | number | Cleanup timeout in ms |

### Key Methods

#### `exec(method, params?, options?)`

Execute a method on a worker.

```javascript
// Execute registered method
pool.exec('fibonacci', [10]);

// Execute dynamic function
pool.exec(function(x) { return x * 2; }, [5]);

// With options
pool.exec('method', [args], {
  on: (event) => console.log(event),
  transfer: [buffer]
});
```

**Parameters:**
- `method` - Method name (string) or function to execute
- `params` - Array of arguments
- `options` - Execution options (`on`, `transfer`, `metadata`)

**Returns:** `WorkerpoolPromise`

#### `proxy()`

Create a proxy object for the worker's methods.

```javascript
const worker = await pool.proxy();
const result = await worker.fibonacci(10);
```

**Returns:** `Promise<Proxy>` - Object with methods mirroring worker's registered functions

#### `stats()`

Get pool statistics.

```javascript
const stats = pool.stats();
// { totalWorkers: 4, busyWorkers: 2, idleWorkers: 2, pendingTasks: 10, activeTasks: 2 }
```

#### `terminate(force?, timeout?)`

Terminate all workers.

```javascript
// Graceful termination (waits for tasks to complete)
await pool.terminate();

// Forced termination
await pool.terminate(true);

// With timeout
await pool.terminate(false, 5000);
```

### Internal Methods

| Method | Description |
|--------|-------------|
| `_next()` | Dispatch next task to available worker |
| `_getWorker()` | Get or create an available worker |
| `_createWorkerHandler()` | Create new WorkerHandler instance |
| `_removeWorker(worker)` | Remove worker from pool |
| `_ensureMinWorkers()` | Ensure minimum worker count |
| `_createQueue(strategy)` | Create task queue from strategy |

---

## WorkerHandler

**Location:** `src/WorkerHandler.js`, `src/core/WorkerHandler.ts`

Controls a single worker (process, thread, or web worker).

### Constructor

```javascript
new WorkerHandler(script?: string, options?: WorkerHandlerOptions)
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `script` | string | Path to worker script |
| `worker` | Object | Underlying worker instance |
| `processing` | Object | Tasks currently being executed |
| `tracking` | Object | Tasks being tracked for cleanup |
| `terminated` | boolean | Whether worker has been terminated |
| `terminating` | boolean | Whether termination is in progress |
| `cleaning` | boolean | Whether cleanup is in progress |

### Worker Setup Functions

The module includes platform-specific setup functions:

```javascript
// Setup based on workerType
setupWorker(script, options)

// Platform-specific setup
setupBrowserWorker(script, workerOpts, Worker)
setupWorkerThreadWorker(script, WorkerThreads, options)
setupProcessWorker(script, options, child_process)
```

### Key Methods

#### `exec(method, params?, resolver?, options?)`

Execute a method on this worker.

```javascript
const result = await handler.exec('fibonacci', [10]);
```

#### `busy()`

Check if worker is executing tasks.

```javascript
if (!handler.busy()) {
  // Worker is available
}
```

#### `terminate(force?, callback?)`

Terminate the worker.

```javascript
handler.terminate(true, (err) => {
  console.log('Worker terminated');
});
```

#### `terminateAndNotify(force?, timeout?)`

Terminate and return a promise.

```javascript
await handler.terminateAndNotify(false, 5000);
```

### Message Handling

The handler listens for messages from the worker:

```javascript
worker.on('message', function(response) {
  if (response === 'ready') {
    // Worker initialized
  } else if (response.isEvent) {
    // Worker event
  } else if (response.method === CLEANUP_METHOD_ID) {
    // Cleanup response
  } else {
    // Task response
  }
});
```

---

## Worker Runtime

**Location:** `src/worker.js`, `src/workers/worker.ts`

Code that runs inside worker processes/threads.

### Worker Object

```javascript
var worker = {
  methods: {},           // Registered methods
  abortListeners: [],    // Cleanup handlers
  terminationHandler: undefined,
  abortListenerTimeout: 1000,

  // Communication methods
  on: function(event, callback) { ... },
  send: function(message, transfer) { ... },
  exit: function(code) { ... },

  // Task management
  emit: function(payload) { ... },
  register: function(methods, options) { ... },
  cleanup: function(requestId) { ... },
  terminateAndExit: function(code) { ... }
};
```

### Built-in Methods

#### `run(fn, args)`

Execute a stringified function.

```javascript
// Called internally when pool.exec() receives a function
worker.methods.run('function(x) { return x * 2; }', [5]);
```

#### `methods()`

Return list of available methods.

```javascript
worker.methods.methods(); // ['run', 'methods', 'myCustomMethod', ...]
```

### Public Worker API

Methods accessible via `this.worker` in registered functions:

```javascript
workerpool.worker({
  myMethod: function(x) {
    // Emit progress event
    this.worker.emit({ progress: 0.5 });

    // Register cleanup handler
    this.worker.addAbortListener(async () => {
      // Cleanup logic
    });

    return x * 2;
  }
});
```

### Message Handler

```javascript
worker.on('message', function(request) {
  if (request === TERMINATE_METHOD_ID) {
    worker.terminateAndExit(0);
  } else if (request.method === CLEANUP_METHOD_ID) {
    worker.cleanup(request.id);
  } else {
    // Execute method and send response
  }
});
```

---

## Promise

**Location:** `src/Promise.js`, `src/core/Promise.ts`

Custom Promise implementation with extended functionality.

### Constructor

```javascript
new Promise(handler: (resolve, reject) => void, parent?: Promise)
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `resolved` | boolean | True if promise resolved |
| `rejected` | boolean | True if promise rejected |
| `pending` | boolean | True if still pending |

### Methods

#### Standard Promise Methods

```javascript
promise.then(onSuccess, onFail)
promise.catch(onFail)
promise.finally(callback)
```

#### Extended Methods

```javascript
// Cancel the task
promise.cancel();

// Set timeout (starts when task executes, not when queued)
promise.timeout(5000);

// Execute on resolve or reject
promise.always(() => { ... });
```

### Static Methods

```javascript
// Create from multiple promises
Promise.all([promise1, promise2, ...]);

// Create a deferred promise
const resolver = Promise.defer();
resolver.resolve(value);
resolver.reject(error);
```

### Error Types

```javascript
// Thrown when promise.cancel() is called
Promise.CancellationError

// Thrown when timeout expires
Promise.TimeoutError
```

---

## Task Queues

### JavaScript Queues

**Location:** `src/queues.js`, `src/core/TaskQueue.ts`

#### FIFOQueue

First-in, first-out queue using a circular buffer.

```javascript
const queue = new FIFOQueue(initialCapacity);
queue.push(task);      // O(1) amortized
queue.pop();           // O(1)
queue.size();          // O(1)
queue.contains(task);  // O(n)
queue.clear();         // O(1)
```

#### LIFOQueue

Last-in, first-out queue (stack).

```javascript
const queue = new LIFOQueue();
queue.push(task);      // O(1)
queue.pop();           // O(1)
```

#### PriorityQueue

Priority queue using binary heap.

```javascript
const queue = new PriorityQueue(comparator?);
queue.push(task);      // O(log n)
queue.pop();           // O(log n)
```

Default comparator uses `task.options?.metadata?.priority`.

### TaskQueue Interface

Custom queues must implement:

```typescript
interface TaskQueue<T> {
  push(task: Task<T>): void;
  pop(): Task<T> | undefined;
  size(): number;
  contains(task: Task<T>): boolean;
  clear(): void;
}
```

### WASM Queue

**Location:** `src/wasm/WasmTaskQueue.ts`

High-performance queue backed by AssemblyScript WASM.

```javascript
// Async creation
const queue = await WASMTaskQueue.create({ capacity: 1024 });

// Sync creation from bytes
const queue = WASMTaskQueue.createSync(wasmBytes, 1024);

// Check support
WASMTaskQueue.isSupported(); // Requires SharedArrayBuffer
```

### Queue Factory

**Location:** `src/core/QueueFactory.ts`

Factory for creating queues from strategy.

```javascript
import { createQueue, createQueueSync } from './QueueFactory';

// Sync creation (JS queues only)
const result = createQueueSync({ strategy: 'fifo' });

// Async creation (supports WASM)
const result = await createQueue({ strategy: 'wasm' });

// Result contains:
// { queue, actualStrategy, isFallback, fallbackReason? }
```

---

## Environment Detection

**Location:** `src/environment.js`, `src/platform/environment.ts`

Detects the JavaScript runtime environment.

### Exports

| Export | Type | Description |
|--------|------|-------------|
| `platform` | `'node'` \| `'browser'` | Current platform |
| `isMainThread` | boolean | True if main thread |
| `cpus` | number | Available CPU cores |
| `isNode(process)` | function | Test if Node.js |

### Detection Logic

```javascript
// Platform detection
const platform = typeof process !== 'undefined' && isNode(process)
  ? 'node'
  : 'browser';

// Main thread detection (Node.js)
const isMainThread = (
  (!worker_threads || worker_threads.isMainThread) &&
  !process.connected  // Not a child process
);

// CPU count
const cpus = platform === 'browser'
  ? navigator.hardwareConcurrency
  : require('os').cpus().length;
```

---

## Transfer

**Location:** `src/transfer.js`, `src/platform/transfer.ts`

Wrapper for transferable objects (ArrayBuffers).

### Usage

```javascript
// In worker
function processArray(data) {
  const result = new Uint8Array(data.length);
  // ... process data ...
  return new workerpool.Transfer(result, [result.buffer]);
}

// In main thread
pool.exec('processArray', [array], {
  transfer: [array.buffer]
});
```

### Constructor

```javascript
new Transfer(message: any, transfer: Transferable[])
```

**Properties:**
- `message` - The data to send
- `transfer` - Array of transferable objects

---

## WASM Module

**Location:** `assembly/`, `src/wasm/`

AssemblyScript-based high-performance data structures.

### Components

#### Ring Buffer (`assembly/ring-buffer.ts`)

Lock-free circular buffer for queue entries.

```typescript
// Memory layout uses Atomics for thread-safe operations
push(slotIndex: u32, priority: i32): bool
pop(): u64  // Returns packed entry or 0
```

#### Task Slots (`assembly/task-slots.ts`)

Slot allocator for task metadata.

```typescript
// Each slot stores:
// - taskId: u32
// - priority: i32
// - timestamp: u64
// - methodId: u32
// - refCount: u32

allocateSlot(): u32
freeSlot(index: u32): void
addRef(index: u32): u32
release(index: u32): u32
```

#### Priority Queue (`assembly/priority-queue.ts`)

Binary heap for priority-based ordering.

### WasmBridge

**Location:** `src/wasm/WasmBridge.ts`

TypeScript interface to WASM module.

```javascript
// Create bridge
const bridge = await WasmBridge.create(capacity, wasmUrl?);

// Queue operations
const slotIndex = bridge.push(priority);
const entry = bridge.pop();
bridge.clear();

// Slot operations
const slot = bridge.allocateSlot();
bridge.freeSlot(slot);
bridge.setTaskId(slot, id);
bridge.setMethodId(slot, methodId);
```

### WasmLoader

**Location:** `src/wasm/WasmLoader.ts`

Utilities for loading WASM modules.

```javascript
// Async loading
const result = await loadWasm(url?, options);
const result = await loadWasmFromBytes(bytes, options);

// Sync loading
const result = loadWasmSync(bytes, options);

// Feature detection
isSharedMemorySupported();
calculateMemoryPages(capacity);
```

### Feature Detection

**Location:** `src/wasm/feature-detection.ts`

```javascript
import {
  detectWASMFeatures,
  getRecommendedQueueType,
  warnIfWASMUnavailable
} from './feature-detection';

const features = detectWASMFeatures();
// {
//   wasm: boolean,
//   sharedMemory: boolean,
//   atomics: boolean,
//   allFeaturesAvailable: boolean,
//   unavailableReason?: string
// }
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER APPLICATION                            │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            index.js                                   │
│                         (Public API)                                  │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
    │    Pool     │         │   Promise   │         │  Transfer   │
    └──────┬──────┘         └─────────────┘         └─────────────┘
           │
           │
    ┌──────┴───────────────────────────────┐
    │                                      │
    ▼                                      ▼
┌──────────────┐                   ┌───────────────────┐
│  TaskQueue   │                   │  WorkerHandler(s) │
│              │                   │                   │
│ - FIFO       │                   │  ┌─────────────┐  │
│ - LIFO       │                   │  │   worker    │  │
│ - Priority   │                   │  │  (process,  │  │
│ - WASM       │                   │  │   thread,   │  │
└──────────────┘                   │  │   or web)   │  │
       ▲                           │  └──────┬──────┘  │
       │                           └─────────┼─────────┘
       │                                     │
       │ (WASM queue only)                   │ IPC
       │                                     │
┌──────┴──────────────┐                      ▼
│    WasmBridge       │              ┌───────────────┐
│                     │              │    worker.js  │
│  ┌───────────────┐  │              │   (runtime)   │
│  │ AssemblyScript│  │              └───────────────┘
│  │    WASM       │  │
│  └───────────────┘  │
└─────────────────────┘
```

---

## See Also

- [OVERVIEW.md](./OVERVIEW.md) - Project overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architectural design
- [DATAFLOW.md](./DATAFLOW.md) - Message protocol and data flow
