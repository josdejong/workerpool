# Comparative Analysis: Workerpool vs Poolifier

## Executive Summary

This report compares **workerpool** and **poolifier** for Node.js and Bun runtime environments. While both implement the thread pool pattern for JavaScript, they differ significantly in architecture, runtime support, and feature sets.

| Aspect | Workerpool | Poolifier |
|--------|------------|-----------|
| **Primary Focus** | Cross-platform (Node.js + Browser) | Node.js-first, separate package for Bun |
| **Bun Support** | Not officially supported | Yes, via `poolifier-web-worker` |
| **Architecture** | Single worker type abstraction | Fixed + Dynamic pool variants |
| **Dependencies** | Zero runtime dependencies | Zero runtime dependencies |
| **Maintenance** | Active | Very active |

---

## 1. Overview

### Workerpool

- **Repository**: https://github.com/josdejong/workerpool
- **Focus**: Simple, cross-platform worker pool for Node.js and browsers
- **Philosophy**: Single API that works everywhere with automatic backend selection

### Poolifier

- **Repository**: https://github.com/poolifier/poolifier
- **Web Worker Package**: https://github.com/poolifier/poolifier-web-worker
- **Focus**: High-performance Node.js worker pools with advanced scheduling
- **Philosophy**: Specialized implementations for different runtimes

---

## 2. Node.js Compatibility

### 2.1 Supported Versions

| Library | Minimum Node.js Version |
|---------|------------------------|
| Workerpool | Node.js 6+ (worker_threads requires 11.7+) |
| Poolifier | Node.js 20.11.0+ |

**Analysis**: Workerpool supports older Node.js versions with fallback to `child_process`. Poolifier requires modern Node.js but leverages newer APIs.

### 2.2 Worker Backend Options

| Backend | Workerpool | Poolifier |
|---------|------------|-----------|
| `worker_threads` | Yes (default in Node 11.7+) | Yes (ThreadPool) |
| `child_process` | Yes (fallback) | No |
| `cluster` | No | Yes (ClusterPool) |
| Web Workers | Yes (browser) | Separate package |

### 2.3 Node.js Feature Comparison

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           NODE.JS FEATURES                               │
├─────────────────────────────────┬───────────────┬───────────────────────┤
│ Feature                         │  Workerpool   │      Poolifier        │
├─────────────────────────────────┼───────────────┼───────────────────────┤
│ Fixed worker count              │      ✓        │          ✓            │
│ Dynamic worker scaling          │      ✗        │          ✓            │
│ Min/Max worker configuration    │      ✓        │          ✓            │
│ Worker choice strategies        │      ✗        │          ✓            │
│ Task prioritization             │      ✓        │          ✓            │
│ Task cancellation               │      ✓        │          ✓            │
│ Task timeout                    │      ✓        │          ✓            │
│ Transferable objects            │      ✓        │          ✓            │
│ Worker events/streaming         │      ✓        │          ✓            │
│ Cluster mode                    │      ✗        │          ✓            │
│ Task stealing                   │      ✗        │          ✓            │
│ Multiple task functions         │      ✓        │          ✓            │
│ Dynamic function execution      │      ✓        │          ✗            │
│ Proxy API                       │      ✓        │          ✗            │
│ Browser support (same package)  │      ✓        │          ✗            │
└─────────────────────────────────┴───────────────┴───────────────────────┘
```

---

## 3. Bun Compatibility

### 3.1 Official Support

| Library | Bun Support | Package |
|---------|-------------|---------|
| Workerpool | **Not officially supported** | N/A |
| Poolifier | **Officially supported** | `@poolifier/poolifier-web-worker` |

### 3.2 Workerpool on Bun

**Current Status**: Not compatible out of the box.

**Issues**:
1. Environment detection fails (checks `process.versions.node`, Bun has `process.versions.bun`)
2. Would be detected as browser environment
3. Web Worker path would be attempted

**Workaround Potential**: Possible with patches to environment detection.

```javascript
// Current detection (fails on Bun)
var isNode = function (nodeProcess) {
  return (
    nodeProcess.versions.node != null  // ← Bun doesn't have this
  );
}

// Would need to add:
// nodeProcess.versions.bun != null
```

### 3.3 Poolifier on Bun

**Current Status**: Fully supported via `poolifier-web-worker`.

**Installation**:
```bash
# Bun
bun add @poolifier/poolifier-web-worker

# Or via JSR
bunx jsr add @poolifier/poolifier-web-worker
```

**Minimum Version**: Bun 1.x+

**Usage Example**:
```typescript
import {
  availableParallelism,
  DynamicThreadPool,
  FixedThreadPool
} from '@poolifier/poolifier-web-worker';

const pool = new FixedThreadPool(
  availableParallelism(),
  new URL('./worker.js', import.meta.url)
);

const result = await pool.execute({ data: 'task' });
await pool.destroy();
```

### 3.4 Bun Executable Compilation

| Scenario | Workerpool | Poolifier |
|----------|------------|-----------|
| `bun build --compile` with worker scripts | **Not supported** | **Challenging** |
| Dynamic function execution | Maybe (with patches) | Not applicable |
| Embedded workers | Possible (browser pattern) | Not documented |

**Challenge**: Both libraries expect worker scripts as separate files, which complicates single-executable compilation.

---

## 4. Architecture Comparison

### 4.1 Pool Architecture

**Workerpool**:
```
┌─────────────────────────────────────────────────────────┐
│                         Pool                             │
│  ┌─────────────────┐    ┌───────────────────────────┐   │
│  │   Task Queue    │───▶│  WorkerHandler[] (0..max) │   │
│  │  (FIFO/LIFO/    │    │                           │   │
│  │   Priority)     │    │  Workers created on-demand │   │
│  └─────────────────┘    └───────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Poolifier**:
```
┌─────────────────────────────────────────────────────────┐
│              FixedPool / DynamicPool                     │
│  ┌─────────────────┐    ┌───────────────────────────┐   │
│  │   Task Queue    │───▶│  Worker[] (fixed or min)  │   │
│  │  (lockless,     │    │                           │   │
│  │   with stealing)│    │  + Dynamic workers (0..Δ) │   │
│  └─────────────────┘    │  (auto-terminate on idle) │   │
│                         └───────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Worker Choice Strategy (Round Robin, Least      │   │
│  │  Used, Least Busy, Fair Share, Weighted, etc.)   │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Worker Definition

**Workerpool** - Function registration:
```javascript
// worker.js
const workerpool = require('workerpool');

workerpool.worker({
  fibonacci: function(n) {
    if (n < 2) return n;
    return fibonacci(n - 2) + fibonacci(n - 1);
  }
});
```

**Poolifier** - Class extension:
```javascript
// worker.js
import { ThreadWorker } from 'poolifier';

class MyWorker extends ThreadWorker {
  constructor() {
    super({
      fibonacci: (data) => {
        const n = data.n;
        if (n < 2) return n;
        return this.fibonacci({ n: n - 2 }) + this.fibonacci({ n: n - 1 });
      }
    });
  }
}

export default new MyWorker();
```

### 4.3 Task Execution

**Workerpool**:
```javascript
// Method 1: Named method
pool.exec('fibonacci', [40]);

// Method 2: Dynamic function (unique to workerpool)
pool.exec(function(n) {
  return n * 2;
}, [5]);

// Method 3: Proxy pattern
const worker = await pool.proxy();
worker.fibonacci(40);
```

**Poolifier**:
```javascript
// Single method
pool.execute({ n: 40 }, 'fibonacci');

// Batch execution
pool.mapExecute([{ n: 40 }, { n: 35 }], 'fibonacci');
```

---

## 5. Feature Deep-Dive

### 5.1 Worker Choice Strategies

| Strategy | Workerpool | Poolifier |
|----------|------------|-----------|
| First available | ✓ (default) | ✗ |
| Round Robin | ✗ | ✓ (default) |
| Least Used | ✗ | ✓ |
| Least Busy | ✗ | ✓ |
| Least ELU | ✗ | ✓ |
| Weighted Round Robin | ✗ | ✓ |
| Fair Share | ✗ | ✓ |
| Custom | ✗ | ✓ |

**Poolifier advantage**: Sophisticated load balancing for heterogeneous workloads.

### 5.2 Queue Strategies

**Workerpool**:
- FIFO (default)
- LIFO
- Priority Queue
- Custom queue implementation
- WASM-accelerated queue (experimental)

**Poolifier**:
- Lockless queue implementation
- Task stealing on idle workers
- Per-task-function queue priority
- Back-pressure handling

### 5.3 Dynamic Execution

**Workerpool** (unique feature):
```javascript
// Send arbitrary function to worker - no pre-registration needed
pool.exec(function(data) {
  // This function is serialized and executed in worker
  return data.map(x => x * 2);
}, [[1, 2, 3, 4, 5]]);
```

**Poolifier**: Not supported - all task functions must be pre-registered in worker.

### 5.4 Abort/Cancellation

**Workerpool**:
```javascript
const promise = pool.exec('longTask', []);

// Cancel via promise
promise.cancel();

// Or timeout
promise.timeout(5000);

// Worker can register cleanup handlers
this.worker.addAbortListener(async () => {
  // Cleanup logic
});
```

**Poolifier**:
```javascript
const controller = new AbortController();

pool.execute(data, 'task', controller.signal);

// Cancel
controller.abort();
```

---

## 6. Performance Characteristics

### 6.1 Benchmark Context

The [Poolifier Benchmark Repository](https://github.com/poolifier/benchmark) compares multiple worker pool implementations using:
- **Tool**: Hyperfine (isolated Node.js processes)
- **Workload**: 100k `factorial(1000)` operations
- **Live Results**: https://bencher.dev/perf/poolifier-benchmark

### 6.2 Theoretical Performance Factors

| Factor | Workerpool | Poolifier |
|--------|------------|-----------|
| Queue implementation | Array-based (O(1) pop/push) | Lockless (optimized for concurrency) |
| Worker selection | Linear search | Strategy-based (O(1) for some) |
| Task stealing | No | Yes |
| Memory overhead | Lower (simpler) | Higher (more features) |
| Startup time | Faster | Slower (class instantiation) |

### 6.3 Use Case Recommendations

| Scenario | Recommended |
|----------|-------------|
| Simple CPU tasks, cross-platform | **Workerpool** |
| High-throughput Node.js server | **Poolifier** |
| Need dynamic function execution | **Workerpool** |
| Complex load balancing requirements | **Poolifier** |
| Browser + Node.js same codebase | **Workerpool** |
| Bun runtime | **Poolifier** |
| Cluster-based scaling | **Poolifier** |

---

## 7. API Comparison

### 7.1 Pool Creation

**Workerpool**:
```javascript
const pool = workerpool.pool('./worker.js', {
  minWorkers: 2,
  maxWorkers: 8,
  workerType: 'thread',
  maxQueueSize: 1000,
  workerTerminateTimeout: 5000
});
```

**Poolifier**:
```javascript
const pool = new DynamicThreadPool(2, 8, './worker.js', {
  workerChoiceStrategy: WorkerChoiceStrategies.LEAST_BUSY,
  enableTasksQueue: true,
  tasksQueueOptions: {
    concurrency: 2,
    size: 1000,
    taskStealing: true
  }
});
```

### 7.2 Statistics

**Workerpool**:
```javascript
pool.stats();
// { totalWorkers, busyWorkers, idleWorkers, pendingTasks, activeTasks }
```

**Poolifier**:
```javascript
pool.info;
// { version, type, minSize, maxSize, workerNodes, idleWorkerNodes,
//   busyWorkerNodes, executedTasks, executingTasks, ... }
```

### 7.3 Termination

**Workerpool**:
```javascript
await pool.terminate();        // Graceful
await pool.terminate(true);    // Force
await pool.terminate(false, 5000); // With timeout
```

**Poolifier**:
```javascript
await pool.destroy();
```

---

## 8. Summary Recommendations

### For Node.js Projects

| If you need... | Choose |
|----------------|--------|
| Simplicity and ease of use | **Workerpool** |
| Maximum performance | **Poolifier** |
| Dynamic function execution | **Workerpool** |
| Advanced load balancing | **Poolifier** |
| Cluster mode | **Poolifier** |
| Browser compatibility | **Workerpool** |
| Proxy pattern | **Workerpool** |

### For Bun Projects

| Scenario | Recommendation |
|----------|----------------|
| New Bun project | **Poolifier** (`@poolifier/poolifier-web-worker`) |
| Existing workerpool code | Patch environment detection or migrate |
| Bun executable compilation | Neither works well - consider alternatives |

### Migration Considerations

**Workerpool → Poolifier**:
- Rewrite worker scripts as classes
- Remove dynamic function execution usage
- Update task execution calls
- Gain: Better performance, more strategies

**Poolifier → Workerpool**:
- Simplify worker scripts to function registration
- Lose: Worker choice strategies, task stealing, cluster mode
- Gain: Dynamic execution, proxy pattern, browser support

---

## 9. Sources

- [Workerpool GitHub](https://github.com/josdejong/workerpool)
- [Poolifier GitHub](https://github.com/poolifier/poolifier)
- [Poolifier Web Worker GitHub](https://github.com/poolifier/poolifier-web-worker)
- [Poolifier Benchmark Repository](https://github.com/poolifier/benchmark)
- [Poolifier npm](https://www.npmjs.com/package/poolifier)
- [Poolifier Web Worker on JSR](https://jsr.io/@poolifier/poolifier-web-worker)
- [Live Benchmark Results](https://bencher.dev/perf/poolifier-benchmark)
