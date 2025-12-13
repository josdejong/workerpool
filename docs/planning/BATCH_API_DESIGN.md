# Batch Operations API Design

## Overview

Sprint 7 introduces batch operations for high-throughput task execution. These APIs enable efficient processing of large numbers of tasks with minimal overhead.

## Core APIs

### `Pool.execBatch<T>(tasks, options?): BatchPromise<T>`

Execute multiple tasks as a batch with shared configuration.

```typescript
const tasks: BatchTask[] = [
  { method: 'processImage', params: [imageData1] },
  { method: 'processImage', params: [imageData2] },
  { method: 'processImage', params: [imageData3] },
];

const result = await pool.execBatch<ProcessedImage>(tasks, {
  concurrency: 4,           // Max parallel tasks (default: numWorkers)
  failFast: false,          // Continue on failures (default: false)
  taskTimeout: 5000,        // Per-task timeout in ms
  batchTimeout: 60000,      // Total batch timeout in ms
  onProgress: (p) => {
    console.log(`${p.percentage}% complete`);
  },
  progressThrottle: 100,    // Min ms between progress callbacks
});

console.log(`${result.successCount}/${result.results.length} succeeded`);
console.log(`Total duration: ${result.duration}ms`);
```

### `Pool.map<T, R>(items, mapFn, options?): BatchPromise<R>`

Parallel map operation distributing items across workers.

```typescript
const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const results = await pool.map<number, number>(
  items,
  (n) => n * n,  // Executed in worker
  {
    chunkSize: 3,           // Items per worker invocation
    concurrency: 4,         // Max parallel workers
    failFast: true,         // Stop on first failure
    onProgress: (p) => {
      console.log(`Processed ${p.completed}/${p.total}`);
    }
  }
);

console.log(results.successes); // [1, 4, 9, 16, 25, 36, 49, 64, 81, 100]
```

## Type Definitions

### BatchTask

```typescript
interface BatchTask<P extends unknown[] = unknown[]> {
  method: string | ((...args: P) => unknown);
  params: P;
  options?: ExecOptions;
}
```

### BatchOptions

```typescript
interface BatchOptions {
  concurrency?: number;       // Max concurrent tasks (default: numWorkers)
  failFast?: boolean;         // Stop on first failure (default: false)
  onProgress?: (progress: BatchProgress) => void;
  progressThrottle?: number;  // Min ms between callbacks (default: 0)
  taskTimeout?: number;       // Per-task timeout in ms
  batchTimeout?: number;      // Total batch timeout in ms
  transfer?: Transferable[];  // Shared transferables for all tasks
}
```

### BatchProgress

```typescript
interface BatchProgress {
  completed: number;          // Tasks finished (success + failure)
  total: number;              // Total tasks in batch
  successes: number;          // Successful tasks
  failures: number;           // Failed tasks
  percentage: number;         // Progress 0-100
  estimatedRemaining?: number; // Estimated ms remaining
  throughput?: number;        // Tasks per second
}
```

### BatchResult

```typescript
interface BatchResult<T> {
  results: BatchTaskResult<T>[]; // All results in order
  successes: T[];                // Successful values only
  failures: Error[];             // Errors only
  duration: number;              // Total duration in ms
  successCount: number;          // Number of successes
  failureCount: number;          // Number of failures
  allSucceeded: boolean;         // True if no failures
  cancelled: boolean;            // True if batch was cancelled
}
```

### BatchTaskResult

```typescript
interface BatchTaskResult<T> {
  index: number;              // Original task index
  success: boolean;           // Whether task succeeded
  result?: T;                 // Result value (if success)
  error?: Error;              // Error (if failed)
  duration: number;           // Task execution duration in ms
}
```

### BatchPromise

```typescript
interface BatchPromise<T> extends WorkerpoolPromise<BatchResult<T>> {
  cancel(): this;             // Cancel pending tasks
  pause(): this;              // Pause queued tasks
  resume(): this;             // Resume paused batch
  isPaused(): boolean;        // Check if paused
}
```

## Implementation Architecture

### Batch Executor Flow

```
1. User calls pool.execBatch(tasks, options)
2. BatchExecutor created with task list
3. Tasks serialized via BatchSerializer
4. Concurrent execution loop:
   a. Dequeue tasks up to concurrency limit
   b. Submit to pool workers
   c. Collect results, update progress
   d. Handle failures based on failFast
5. Return BatchResult with all outcomes
```

### Batch Serialization

For efficiency, batch tasks are serialized into a compact format:

```typescript
// Internal batch message format
interface BatchMessage {
  type: 'batch';
  batchId: string;
  tasks: SerializedTask[];
}

interface SerializedTask {
  id: number;                 // Task index
  m: string;                  // Method name
  p: unknown[];               // Parameters
}
```

### Progress Throttling

Progress callbacks are rate-limited to reduce overhead:

```typescript
let lastProgressTime = 0;

function maybeEmitProgress() {
  const now = Date.now();
  if (now - lastProgressTime >= options.progressThrottle) {
    lastProgressTime = now;
    options.onProgress?.(buildProgress());
  }
}
```

## SIMD Acceleration (Optional)

For numeric workloads, SIMD-accelerated batch processing is available:

```typescript
import { canUseSIMD, simdMap } from 'workerpool/wasm';

if (canUseSIMD()) {
  // Process Float32Array with SIMD vectorization
  const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const output = simdMap(input, (v) => v * 2);
  // Uses v128 SIMD operations internally
}
```

SIMD is beneficial for:
- Numeric array transformations
- Image pixel processing
- Signal processing
- Matrix operations

## Error Handling

### failFast: false (default)

All tasks execute regardless of failures. Final result contains both successes and failures.

```typescript
const result = await pool.execBatch(tasks, { failFast: false });
// result.failures contains all errors
// result.successes contains all successful results
```

### failFast: true

Execution stops on first failure. Pending tasks are cancelled.

```typescript
try {
  const result = await pool.execBatch(tasks, { failFast: true });
} catch (error) {
  // First task error thrown
  // Partial results available via error.partialResult
}
```

## Cancellation

Batches can be cancelled mid-execution:

```typescript
const promise = pool.execBatch(tasks);

// Later...
promise.cancel();

const result = await promise;
console.log(result.cancelled); // true
// result contains partial results for completed tasks
```

## Memory Considerations

### Large Batches

For very large batches (10K+ tasks), consider:

1. **Chunked submission**: Break into smaller batches
2. **Streaming results**: Process results as they complete
3. **Memory limits**: Monitor heap usage

### Transferables

Use transfer lists for ArrayBuffer data:

```typescript
const tasks = buffers.map((buf, i) => ({
  method: 'process',
  params: [buf],
  options: { transfer: [buf] }
}));

await pool.execBatch(tasks);
// Note: buffers are neutered after transfer
```

## Performance Benchmarks

Target metrics for 10K tasks:

| Operation | Target | Measured |
|-----------|--------|----------|
| Batch overhead | <100ms | TBD |
| Progress callback | <1ms | TBD |
| Cancellation | <10ms | TBD |
| Memory per task | <1KB | TBD |

## Usage Patterns

### Pattern 1: Data Pipeline

```typescript
async function processDataset(items: DataItem[]) {
  // Stage 1: Validate
  const validated = await pool.map(items, validateItem, { failFast: true });

  // Stage 2: Transform
  const transformed = await pool.map(validated.successes, transformItem);

  // Stage 3: Store
  await pool.execBatch(
    transformed.successes.map(item => ({
      method: 'storeItem',
      params: [item]
    }))
  );
}
```

### Pattern 2: Parallel File Processing

```typescript
async function processFiles(paths: string[]) {
  return pool.execBatch(
    paths.map(path => ({
      method: 'processFile',
      params: [path]
    })),
    {
      concurrency: 8,  // Limit I/O parallelism
      onProgress: (p) => updateProgressBar(p.percentage)
    }
  );
}
```

### Pattern 3: Retry Failed Tasks

```typescript
async function processWithRetry(tasks: BatchTask[], maxRetries = 3) {
  let remaining = tasks;
  let allResults: BatchTaskResult<unknown>[] = [];

  for (let attempt = 0; attempt < maxRetries && remaining.length > 0; attempt++) {
    const result = await pool.execBatch(remaining);
    allResults.push(...result.results.filter(r => r.success));

    remaining = result.results
      .filter(r => !r.success)
      .map((r, i) => tasks[r.index]);
  }

  return allResults;
}
```
