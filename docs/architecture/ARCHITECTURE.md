# Workerpool Architecture

This document describes the architectural design, patterns, and key design decisions in workerpool.

## Design Principles

### 1. Cross-Platform Abstraction
Workerpool provides a unified API across different JavaScript environments:
- **Node.js**: Uses `worker_threads` (preferred) or `child_process` (fallback)
- **Browsers**: Uses Web Workers

The platform abstraction is handled in `src/environment.js` and `src/platform/environment.ts`.

### 2. Lazy Worker Creation
Workers are created on-demand when tasks need to be executed, up to `maxWorkers`. This reduces memory usage when the pool is idle.

### 3. Promise-Based Task Management
Every task returns an enhanced Promise with:
- **Cancellation**: Abort running tasks
- **Timeout**: Auto-cancel after a deadline
- **Status tracking**: Check if pending/resolved/rejected

### 4. Message-Based Communication
All worker communication uses a JSON-RPC style protocol, enabling serialization-safe data transfer across process/thread boundaries.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER CODE                                  │
│                                                                      │
│   pool.exec('method', [args])  │  pool.proxy().then(p => p.method()) │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              POOL                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Configuration                                                  │  │
│  │  - maxWorkers, minWorkers, workerType, queueStrategy           │  │
│  │  - workerTerminateTimeout, onCreateWorker, onTerminateWorker   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────┐    ┌────────────────────────────────────┐  │
│  │     TASK QUEUE       │    │       WORKER HANDLERS              │  │
│  │                      │    │                                    │  │
│  │  ┌─────────────────┐ │    │  ┌───────────────┐ ┌───────────┐  │  │
│  │  │ FIFO / LIFO /   │ │    │  │ WorkerHandler │ │ WorkerHan.│  │  │
│  │  │ Priority / WASM │ │    │  │               │ │           │  │  │
│  │  └─────────────────┘ │    │  │ - worker ref  │ │ - worker  │  │  │
│  │                      │    │  │ - processing  │ │ - process.│  │  │
│  │  Strategy Pattern    │    │  │ - tracking    │ │ - tracking│  │  │
│  │  for pluggable queues│    │  └───────────────┘ └───────────┘  │  │
│  └──────────────────────┘    └────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
         │                                     │
         │ _next() dispatches                  │ Message Passing
         │ tasks to workers                    │ (JSON-RPC style)
         ▼                                     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          WORKER HANDLER                               │
│                                                                      │
│  - Creates/manages single worker instance                            │
│  - Handles message serialization                                     │
│  - Tracks in-progress tasks                                          │
│  - Manages timeouts and cancellations                                │
│  - Handles worker termination and cleanup                            │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ IPC Channel
                                    │ (postMessage / process.send)
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              WORKER                                   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Message Handler                                                  │ │
│  │  - Receives task requests                                        │ │
│  │  - Routes to registered methods                                  │ │
│  │  - Handles cleanup signals                                       │ │
│  │  - Manages abort listeners                                       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Registered Methods                                               │ │
│  │  - run(fn, args)     // Built-in: execute stringified function  │ │
│  │  - methods()         // Built-in: list available methods        │ │
│  │  - [user methods]    // Custom methods from worker script       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

## Worker Type Abstraction

The `workerType` option controls which backend is used. The abstraction happens in `WorkerHandler.setupWorker()`:

```
workerType        Node.js              Browser
─────────────────────────────────────────────────
'auto'            worker_threads*      Web Workers
'thread'          worker_threads       Error
'process'         child_process        Error
'web'             Error                Web Workers

* Falls back to child_process if worker_threads unavailable
```

### Platform-Specific Adapters

Each worker type adapter normalizes the API:

```javascript
// All workers expose:
worker.on(event, callback)  // Listen for messages
worker.send(message)        // Send message to worker
worker.kill()               // Terminate worker (Node.js)
worker.terminate()          // Terminate worker (Browser)
```

## Task Queue Architecture

The task queue is pluggable using the Strategy pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│                      TaskQueue Interface                         │
│  - push(task): void                                              │
│  - pop(): Task | undefined                                       │
│  - size(): number                                                │
│  - contains(task): boolean                                       │
│  - clear(): void                                                 │
└─────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   FIFOQueue     │  │   LIFOQueue     │  │ PriorityQueue   │
│                 │  │                 │  │                 │
│ Circular Buffer │  │ Stack (Array)   │  │ Binary Heap     │
│ O(1) push/pop   │  │ O(1) push/pop   │  │ O(log n) ops    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
                              ▼
              ┌─────────────────────────────┐
              │      WASMTaskQueue          │
              │                             │
              │  WASM Ring Buffer + Slots   │
              │  O(1) ops, SharedArrayBuffer│
              │  Cross-thread safe          │
              └─────────────────────────────┘
```

### Queue Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `'fifo'` | First-in, first-out (default) | Fair ordering |
| `'lifo'` | Last-in, first-out | Most recent tasks first |
| `'priority'` | Highest priority first | Task prioritization |
| `'wasm'` | WASM-backed queue | High-performance requirements |
| Custom | User-provided implementation | Special ordering needs |

## Promise Architecture

Workerpool uses a custom Promise implementation (`src/Promise.js`) that extends standard Promise semantics:

```
┌─────────────────────────────────────────────────────────────────┐
│                    WorkerpoolPromise                             │
│                                                                  │
│  Standard Promise Methods:                                       │
│  - then(onSuccess, onFail)                                       │
│  - catch(onFail)                                                 │
│  - finally(callback)                                             │
│                                                                  │
│  Extended Methods:                                               │
│  - cancel()      → Rejects with CancellationError               │
│  - timeout(ms)   → Rejects with TimeoutError after delay        │
│  - always(fn)    → Execute callback on resolve or reject        │
│                                                                  │
│  State Properties:                                               │
│  - pending       → true while unresolved                        │
│  - resolved      → true after resolve                           │
│  - rejected      → true after reject                            │
└─────────────────────────────────────────────────────────────────┘
```

### Cancel/Timeout Flow

```
User calls promise.cancel() or promise.timeout(ms) fires
                            │
                            ▼
                ┌───────────────────────┐
                │  Send CLEANUP_METHOD  │
                │  to worker            │
                └───────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  Worker runs abort    │
                │  listeners (if any)   │
                └───────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌───────────────────┐               ┌───────────────────┐
│ Listeners succeed │               │ Listeners fail    │
│ → Worker reused   │               │ → Worker killed   │
└───────────────────┘               └───────────────────┘
        │                                       │
        └───────────────────┬───────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  Promise rejected     │
                │  CancellationError or │
                │  TimeoutError         │
                └───────────────────────┘
```

## Worker Lifecycle

```
┌────────────┐    ┌─────────────┐    ┌───────────────┐    ┌──────────────┐
│  Created   │───▶│  Waiting    │───▶│  Executing    │───▶│  Completed   │
│            │    │  (ready)    │    │  (busy)       │    │              │
└────────────┘    └─────────────┘    └───────────────┘    └──────────────┘
     │                  │                   │                    │
     │                  │                   │                    │
     │                  ▼                   ▼                    │
     │            ┌─────────────┐    ┌───────────────┐           │
     │            │  Executing  │───▶│  Cleaning     │           │
     │            │  (next task)│    │  (abort)      │           │
     │            └─────────────┘    └───────────────┘           │
     │                                      │                    │
     │                                      ▼                    │
     │                              ┌───────────────┐            │
     └─────────────────────────────▶│  Terminated   │◀───────────┘
                                    └───────────────┘
```

### Worker States

| State | Description | `busy()` returns |
|-------|-------------|------------------|
| Created | Worker process starting | false |
| Waiting | Ready for tasks | false |
| Executing | Processing a task | true |
| Cleaning | Running abort listeners | true |
| Terminated | Worker stopped | N/A |

## Error Handling

### Error Propagation

```
Worker throws error
        │
        ▼
┌───────────────────┐
│ Error serialized  │  convertError()
│ to JSON           │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Sent as response  │  { id, error: {...}, result: null }
│ message           │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Deserialized back │  objectToError()
│ to Error object   │
└───────────────────┘
        │
        ▼
┌───────────────────┐
│ Promise rejected  │  resolver.reject(error)
│ with error        │
└───────────────────┘
```

### Error Types

| Error Type | Source | Description |
|------------|--------|-------------|
| `CancellationError` | Promise.cancel() | Task was cancelled |
| `TimeoutError` | Promise.timeout() | Task exceeded timeout |
| `TerminateError` | Worker crash/exit | Worker terminated unexpectedly |
| `Error` | Worker code | Application errors from worker |

## WASM Acceleration Layer

For high-performance scenarios, workerpool supports WASM-backed task queues:

```
┌─────────────────────────────────────────────────────────────────┐
│                         WASMTaskQueue                            │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                     JavaScript Layer                         │ │
│  │  - Task object storage (Map<slotIndex, Task>)               │ │
│  │  - Priority extraction from metadata                         │ │
│  │  - Method ID hashing                                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                       WasmBridge                             │ │
│  │  - High-level TypeScript API                                 │ │
│  │  - Memory management                                         │ │
│  │  - Slot allocation/deallocation                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   AssemblyScript WASM                        │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │ │
│  │  │ Ring Buffer │  │ Task Slots  │  │ Priority Q  │          │ │
│  │  │ (lock-free) │  │ (ref count) │  │ (heap)      │          │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                  SharedArrayBuffer                           │ │
│  │  - Can be shared across threads                              │ │
│  │  - Enables lock-free concurrent access                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Security Considerations

### Function Serialization
When using `pool.exec(fn, args)` with a function, the function is stringified and executed in the worker. This has implications:
- Function must be self-contained (no closures over external variables)
- Code is evaluated in worker context (potential security concern if user-provided)

### Transferable Objects
Using `workerpool.Transfer` for ArrayBuffers provides zero-copy transfer but:
- Original buffer becomes unusable after transfer
- Applies only to `'web'` and `'thread'` worker types

### Worker Isolation
Each worker runs in its own isolated context:
- **process**: Full process isolation
- **thread**: V8 isolate isolation (shared memory possible)
- **web**: Separate global scope

## Performance Considerations

### Worker Creation Overhead
Creating workers has overhead. Mitigation strategies:
- Use `minWorkers` to pre-create workers
- Workers are reused between tasks

### Message Serialization
All data crossing the IPC boundary must be serializable:
- Use `Transfer` for large binary data
- Avoid sending unnecessary data

### Queue Selection
Choose queue strategy based on workload:
- `'fifo'`: General purpose, fair scheduling
- `'lifo'`: When recent tasks have priority
- `'priority'`: When tasks have different urgency levels
- `'wasm'`: For very high throughput requirements

## See Also

- [COMPONENTS.md](./COMPONENTS.md) - Detailed component documentation
- [DATAFLOW.md](./DATAFLOW.md) - Message protocol and data flow
