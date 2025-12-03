# Workerpool Overview

## What is Workerpool?

**workerpool** is a lightweight, cross-platform thread pool implementation for JavaScript that enables efficient offloading of CPU-intensive tasks to background workers. It implements the classic [thread pool pattern](http://en.wikipedia.org/wiki/Thread_pool_pattern), managing a pool of workers that execute tasks from a queue.

## Problem Statement

JavaScript is inherently single-threaded, operating on a single event loop:

> "In Node.js everything runs in parallel, except your code. What this means is that all I/O code that you write in Node.js is non-blocking, while (conversely) all non-I/O code that you write in Node.js is blocking."

This creates issues for CPU-intensive operations:
- **Browsers**: UI freezes during heavy computation ("the browser hangs")
- **Node.js servers**: Cannot respond to requests while processing heavy tasks

Workerpool solves this by offloading CPU-intensive work to dedicated background workers.

## Key Features

| Feature | Description |
|---------|-------------|
| **Cross-platform** | Works in Node.js and modern browsers |
| **Dynamic offloading** | Execute arbitrary functions in workers |
| **Dedicated workers** | Support for pre-defined worker scripts |
| **Proxy pattern** | Access worker methods as if local functions |
| **Task management** | Cancel running tasks, set timeouts |
| **Fault tolerance** | Automatic handling of crashed workers |
| **Zero-copy transfer** | Efficient ArrayBuffer transfer between threads |
| **Configurable queuing** | FIFO, LIFO, Priority, or custom queues |
| **WASM acceleration** | Optional high-performance WASM-backed queues |

## Platform Support

### Node.js
- **worker_threads** (Node.js 11.7+, recommended)
- **child_process** (fallback for older versions)

### Browsers
- **Web Workers** (all modern browsers)

## Quick Usage Examples

### Dynamic Function Offloading

```javascript
const workerpool = require('workerpool');
const pool = workerpool.pool();

function heavyComputation(n) {
  // CPU-intensive work here
  return result;
}

// Offload function to a worker
pool.exec(heavyComputation, [1000])
  .then(result => console.log(result))
  .catch(err => console.error(err))
  .then(() => pool.terminate());
```

### Dedicated Worker Script

**worker.js:**
```javascript
const workerpool = require('workerpool');

function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 2) + fibonacci(n - 1);
}

workerpool.worker({
  fibonacci: fibonacci
});
```

**main.js:**
```javascript
const workerpool = require('workerpool');
const pool = workerpool.pool(__dirname + '/worker.js');

// Call via exec
pool.exec('fibonacci', [40])
  .then(result => console.log(result));

// Or via proxy
pool.proxy().then(worker => {
  return worker.fibonacci(40);
});
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Thread                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                      Pool                               │ │
│  │  ┌──────────────┐  ┌─────────────────────────────────┐ │ │
│  │  │  Task Queue  │  │      Worker Handlers (1..n)     │ │ │
│  │  │              │  │  ┌─────────┐ ┌─────────┐ ┌───┐  │ │ │
│  │  │ [Task1]      │──│  │Handler1 │ │Handler2 │ │...│  │ │ │
│  │  │ [Task2]      │  │  └────┬────┘ └────┬────┘ └───┘  │ │ │
│  │  │ [...]        │  │       │           │              │ │ │
│  │  └──────────────┘  └───────│───────────│──────────────┘ │ │
│  └────────────────────────────│───────────│────────────────┘ │
└───────────────────────────────│───────────│──────────────────┘
                                │           │
                    ┌───────────┘           └───────────┐
                    │ IPC Messages                      │ IPC Messages
                    ▼                                   ▼
┌──────────────────────────────┐    ┌──────────────────────────────┐
│        Worker Thread 1       │    │        Worker Thread 2       │
│  ┌────────────────────────┐  │    │  ┌────────────────────────┐  │
│  │   Registered Methods   │  │    │   │   Registered Methods   │  │
│  │  - fibonacci           │  │    │  │  - fibonacci           │  │
│  │  - run (dynamic)       │  │    │  │  - run (dynamic)       │  │
│  └────────────────────────┘  │    │  └────────────────────────┘  │
└──────────────────────────────┘    └──────────────────────────────┘
```

## Project Structure

```
workerpool/
├── src/
│   ├── index.js          # Public API entry point
│   ├── Pool.js           # Worker pool management
│   ├── WorkerHandler.js  # Single worker controller
│   ├── worker.js         # Worker runtime code
│   ├── Promise.js        # Enhanced Promise with cancel/timeout
│   ├── environment.js    # Platform detection
│   ├── queues.js         # Task queue implementations (JS)
│   ├── transfer.js       # Transferable object wrapper
│   │
│   ├── core/             # TypeScript implementations
│   │   ├── Pool.ts
│   │   ├── WorkerHandler.ts
│   │   ├── Promise.ts
│   │   ├── TaskQueue.ts
│   │   └── QueueFactory.ts
│   │
│   ├── types/            # TypeScript type definitions
│   │   ├── index.ts
│   │   ├── messages.ts
│   │   └── internal.ts
│   │
│   ├── platform/         # Platform abstractions
│   │   ├── environment.ts
│   │   └── transfer.ts
│   │
│   ├── wasm/             # WASM acceleration
│   │   ├── WasmBridge.ts
│   │   ├── WasmLoader.ts
│   │   ├── WasmTaskQueue.ts
│   │   └── feature-detection.ts
│   │
│   └── workers/          # Worker implementations
│       └── worker.ts
│
├── assembly/             # AssemblyScript WASM source
│   ├── index.ts
│   ├── priority-queue.ts
│   ├── ring-buffer.ts
│   └── task-slots.ts
│
├── types/                # Generated TypeScript declarations
│   └── index.d.ts
│
└── dist/                 # Built distribution files
    ├── workerpool.js
    └── workerpool.min.js
```

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - Detailed architectural design and patterns
- [COMPONENTS.md](./COMPONENTS.md) - Component-level documentation
- [DATAFLOW.md](./DATAFLOW.md) - Message protocol and data flow

## Further Reading

- [README.md](../../README.md) - Full API documentation
- [HISTORY.md](../../HISTORY.md) - Version changelog
- [Examples](../../examples/) - Usage examples
