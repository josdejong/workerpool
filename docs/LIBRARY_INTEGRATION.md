# Library Integration Guide

This guide documents patterns for integrating workerpool into your own libraries,
creating domain-specific worker registries, and wrapping pool instances.

## Table of Contents

- [Build Selection](#build-selection)
- [Wrapping Pool Instances](#wrapping-pool-instances)
- [Creating Domain-Specific Registries](#creating-domain-specific-registries)
- [Type-Safe Worker Interfaces](#type-safe-worker-interfaces)
- [Error Handling Patterns](#error-handling-patterns)
- [WASM Integration](#wasm-integration)
- [Debug and Profiling](#debug-and-profiling)

---

## Build Selection

workerpool provides two builds optimized for different use cases:

### Minimal Build (~5KB)

Use when bundle size is critical and you don't need WASM features:

```typescript
// Import from minimal build
import { pool, worker, Transfer } from 'workerpool/minimal';

// Or via package.json exports
import workerpool from 'workerpool/minimal';
```

### Full Build (~15KB)

Use when you need WASM support, debugging, or advanced type safety:

```typescript
// Import from full build
import {
  pool,
  canUseWasm,
  WasmBridge,
  enableDebug,
  TypeMismatchError,
} from 'workerpool/full';
```

### Conditional Import Pattern

```typescript
// runtime-pool.ts
export async function createPool(options) {
  const { canUseWasm } = await import('workerpool/full');

  if (canUseWasm() && options.useWasm) {
    const { WasmBridge } = await import('workerpool/full');
    return createWasmPool(options);
  }

  // Fallback to minimal
  const { pool } = await import('workerpool/minimal');
  return pool(options);
}
```

---

## Wrapping Pool Instances

Create domain-specific pool wrappers for cleaner APIs:

### Basic Pool Wrapper

```typescript
import { pool, Pool, PoolOptions } from 'workerpool';

export interface ImageProcessorOptions extends PoolOptions {
  quality?: number;
  format?: 'png' | 'jpeg' | 'webp';
}

export class ImageProcessor {
  private pool: Pool;
  private options: ImageProcessorOptions;

  constructor(workerScript: string, options: ImageProcessorOptions = {}) {
    this.options = options;
    this.pool = pool(workerScript, {
      minWorkers: options.minWorkers ?? 2,
      maxWorkers: options.maxWorkers ?? 4,
      ...options,
    });
  }

  async resize(imageData: ArrayBuffer, width: number, height: number): Promise<ArrayBuffer> {
    return this.pool.exec('resize', [imageData, width, height, this.options], {
      transfer: [imageData],
    });
  }

  async convert(imageData: ArrayBuffer, format: string): Promise<ArrayBuffer> {
    return this.pool.exec('convert', [imageData, format, this.options.quality ?? 80], {
      transfer: [imageData],
    });
  }

  async terminate(): Promise<void> {
    await this.pool.terminate();
  }

  get stats() {
    return this.pool.stats();
  }
}
```

### Pool Wrapper with Caching

```typescript
export class CachedComputePool {
  private pool: Pool;
  private cache = new Map<string, { result: any; timestamp: number }>();
  private ttl: number;

  constructor(workerScript: string, ttlMs: number = 60000) {
    this.pool = pool(workerScript);
    this.ttl = ttlMs;
  }

  private getCacheKey(method: string, args: unknown[]): string {
    return `${method}:${JSON.stringify(args)}`;
  }

  async exec<T>(method: string, args: unknown[] = []): Promise<T> {
    const key = this.getCacheKey(method, args);
    const now = Date.now();

    // Check cache
    const cached = this.cache.get(key);
    if (cached && (now - cached.timestamp) < this.ttl) {
      return cached.result;
    }

    // Execute and cache
    const result = await this.pool.exec(method, args);
    this.cache.set(key, { result, timestamp: now });
    return result;
  }

  clearCache(): void {
    this.cache.clear();
  }

  async terminate(): Promise<void> {
    this.cache.clear();
    await this.pool.terminate();
  }
}
```

---

## Creating Domain-Specific Registries

Build worker registries for managing multiple specialized workers:

### Worker Registry Pattern

```typescript
import { pool, Pool } from 'workerpool';

interface WorkerDefinition {
  script: string;
  options?: PoolOptions;
  pool?: Pool;
}

export class WorkerRegistry {
  private workers = new Map<string, WorkerDefinition>();
  private defaultOptions: PoolOptions;

  constructor(defaultOptions: PoolOptions = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Register a worker type
   */
  register(name: string, script: string, options?: PoolOptions): this {
    this.workers.set(name, {
      script,
      options: { ...this.defaultOptions, ...options },
    });
    return this;
  }

  /**
   * Get or create a pool for a worker type
   */
  getPool(name: string): Pool {
    const def = this.workers.get(name);
    if (!def) {
      throw new Error(`Worker "${name}" not registered`);
    }

    if (!def.pool) {
      def.pool = pool(def.script, def.options);
    }

    return def.pool;
  }

  /**
   * Execute on a specific worker type
   */
  async exec<T>(workerName: string, method: string, args?: unknown[]): Promise<T> {
    const workerPool = this.getPool(workerName);
    return workerPool.exec(method, args);
  }

  /**
   * Terminate all pools
   */
  async terminateAll(): Promise<void> {
    const promises = Array.from(this.workers.values())
      .filter(def => def.pool)
      .map(def => def.pool!.terminate());

    await Promise.all(promises);

    for (const def of this.workers.values()) {
      def.pool = undefined;
    }
  }

  /**
   * Get stats for all active pools
   */
  getAllStats(): Record<string, PoolStats> {
    const stats: Record<string, PoolStats> = {};

    for (const [name, def] of this.workers) {
      if (def.pool) {
        stats[name] = def.pool.stats();
      }
    }

    return stats;
  }
}

// Usage
const registry = new WorkerRegistry({ maxWorkers: 4 })
  .register('image', './workers/image.js', { minWorkers: 2 })
  .register('crypto', './workers/crypto.js')
  .register('parser', './workers/parser.js');

const result = await registry.exec('image', 'resize', [data, 800, 600]);
```

### Task Router Pattern

Route tasks to different workers based on criteria:

```typescript
type TaskRouter = (task: { method: string; args: unknown[] }) => string;

export class RoutedWorkerPool {
  private registry: WorkerRegistry;
  private router: TaskRouter;

  constructor(registry: WorkerRegistry, router: TaskRouter) {
    this.registry = registry;
    this.router = router;
  }

  async exec<T>(method: string, args: unknown[] = []): Promise<T> {
    const workerName = this.router({ method, args });
    return this.registry.exec(workerName, method, args);
  }
}

// Usage
const router: TaskRouter = (task) => {
  if (task.method.startsWith('image.')) return 'image';
  if (task.method.startsWith('crypto.')) return 'crypto';
  return 'general';
};

const routedPool = new RoutedWorkerPool(registry, router);
await routedPool.exec('image.resize', [data, 800, 600]);
```

---

## Type-Safe Worker Interfaces

Create fully typed worker interfaces:

### Define Worker Methods

```typescript
// worker-types.ts
import { defineWorkerMethods } from 'workerpool/full';

// Define your worker methods with full types
export const mathWorkerMethods = defineWorkerMethods({
  add(a: number, b: number): number {
    return a + b;
  },

  multiply(a: number, b: number): number {
    return a * b;
  },

  async factorize(n: number): Promise<number[]> {
    const factors: number[] = [];
    let d = 2;
    while (n > 1) {
      while (n % d === 0) {
        factors.push(d);
        n /= d;
      }
      d++;
    }
    return factors;
  },
});

// Export the type for use in main thread
export type MathWorkerMethods = typeof mathWorkerMethods;
```

### Worker Implementation

```typescript
// math-worker.ts
import workerpool from 'workerpool';
import { mathWorkerMethods } from './worker-types';

// Register methods - fully type checked
workerpool.worker(mathWorkerMethods);
```

### Main Thread Usage

```typescript
// main.ts
import { pool } from 'workerpool';
import { createTypedProxy } from 'workerpool/full';
import type { MathWorkerMethods } from './worker-types';

const mathPool = pool('./math-worker.js');

// Create typed proxy - full IntelliSense support
const math = createTypedProxy<MathWorkerMethods>(mathPool);

// All of these are fully typed!
const sum = await math.add(1, 2);          // number
const product = await math.multiply(3, 4);  // number
const factors = await math.factorize(100);  // number[]
```

---

## Error Handling Patterns

### Error Type Discrimination

```typescript
import {
  CancellationError,
  TimeoutError,
  WasmNotAvailableError,
  TypeMismatchError,
  WorkerpoolError,
} from 'workerpool/full';

async function safeExec<T>(pool: Pool, method: string, args?: unknown[]): Promise<T | null> {
  try {
    return await pool.exec(method, args);
  } catch (error) {
    if (CancellationError.isCancellationError(error)) {
      console.log('Task was cancelled');
      return null;
    }

    if (TimeoutError.isTimeoutError(error)) {
      console.log(`Task timed out after ${error.timeout}ms`);
      return null;
    }

    if (TypeMismatchError.isTypeMismatchError(error)) {
      console.error(`Type error: expected ${error.expected}, got ${error.actual}`);
      throw error;
    }

    if (WorkerpoolError.isWorkerpoolError(error)) {
      console.error(`Workerpool error (${error.type}): ${error.message}`);
      throw error;
    }

    throw error;
  }
}
```

### Error Boundary Pattern

```typescript
export class WorkerErrorBoundary {
  private maxRetries: number;
  private retryDelay: number;

  constructor(maxRetries = 3, retryDelay = 1000) {
    this.maxRetries = maxRetries;
    this.retryDelay = retryDelay;
  }

  async exec<T>(
    pool: Pool,
    method: string,
    args?: unknown[],
    timeout?: number
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const promise = pool.exec(method, args);

        if (timeout) {
          return await promise.timeout(timeout);
        }

        return await promise;
      } catch (error) {
        lastError = error as Error;

        // Don't retry cancellation
        if (CancellationError.isCancellationError(error)) {
          throw error;
        }

        // Retry on timeout or worker errors
        if (attempt < this.maxRetries - 1) {
          await new Promise(r => setTimeout(r, this.retryDelay * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }
}
```

---

## WASM Integration

### WASM-Enabled Library

```typescript
import {
  canUseWasm,
  canUseWasmThreads,
  WasmBridge,
  createWasmWorker,
  WasmNotAvailableError,
} from 'workerpool/full';

export class HighPerfCompute {
  private bridge: WasmBridge | null = null;
  private pool: Pool;
  private wasmEnabled: boolean;

  private constructor(pool: Pool, bridge: WasmBridge | null) {
    this.pool = pool;
    this.bridge = bridge;
    this.wasmEnabled = bridge !== null;
  }

  static async create(workerScript: string): Promise<HighPerfCompute> {
    const pool = createPool(workerScript);

    let bridge: WasmBridge | null = null;

    if (canUseWasmThreads()) {
      try {
        bridge = await WasmBridge.create(1024);
      } catch (e) {
        console.warn('WASM initialization failed, using JS fallback');
      }
    }

    return new HighPerfCompute(pool, bridge);
  }

  get isWasmEnabled(): boolean {
    return this.wasmEnabled;
  }

  async compute(data: Float64Array): Promise<Float64Array> {
    if (this.wasmEnabled && this.bridge) {
      // Use WASM-accelerated path
      return this.computeWithWasm(data);
    }

    // Fallback to JS
    return this.pool.exec('compute', [data], {
      transfer: [data.buffer],
    });
  }

  private async computeWithWasm(data: Float64Array): Promise<Float64Array> {
    // WASM implementation
    // ...
    throw new Error('Not implemented');
  }

  async terminate(): Promise<void> {
    await this.pool.terminate();
  }
}
```

### Feature-Conditional Worker

```typescript
// adaptive-worker.ts
import workerpool from 'workerpool';
import {
  canUseWasm,
  initWasmWorker,
  getWasmExports,
} from 'workerpool/full';

// Initialize WASM if available
let wasmReady = false;

if (canUseWasm()) {
  initWasmWorker({ wasmUrl: './compute.wasm' })
    .then(() => { wasmReady = true; })
    .catch(console.warn);
}

const methods = {
  async heavyCompute(data: Float64Array): Promise<Float64Array> {
    if (wasmReady) {
      const exports = getWasmExports();
      // Use WASM
      return wasmCompute(exports, data);
    }

    // JS fallback
    return jsCompute(data);
  },
};

workerpool.worker(methods);
```

---

## Debug and Profiling

### Enable Debug Logging

```typescript
import {
  enableDebug,
  LogLevel,
  LogCategory,
  getPerfSummary,
} from 'workerpool/full';

// Development: full logging
if (process.env.NODE_ENV === 'development') {
  enableDebug({
    level: LogLevel.DEBUG,
    timestamps: true,
    perfTracking: true,
  });
}

// Production: errors and performance only
if (process.env.DEBUG_WORKERPOOL) {
  enableDebug({
    level: LogLevel.WARN,
    categories: [LogCategory.PERF, LogCategory.TASK],
    perfTracking: true,
  });
}
```

### Custom Log Handler

```typescript
import { enableDebug, LogLevel, LogCategory } from 'workerpool/full';

// Send to your logging service
enableDebug({
  level: LogLevel.INFO,
  handler: (level, category, message, data) => {
    myLogger.log({
      level: LogLevel[level],
      category,
      message,
      data,
      timestamp: Date.now(),
    });
  },
});
```

### Performance Monitoring

```typescript
import {
  perfStart,
  perfEnd,
  getPerfSummary,
  enableDebug,
  LogLevel,
  LogCategory,
} from 'workerpool/full';

enableDebug({ perfTracking: true, level: LogLevel.DEBUG });

// Track custom operations
async function processWithMetrics(pool: Pool, data: unknown[]) {
  const id = perfStart('batchProcess', LogCategory.TASK, {
    itemCount: data.length,
  });

  try {
    const results = await Promise.all(
      data.map(item => pool.exec('process', [item]))
    );
    return results;
  } finally {
    perfEnd(id);
  }
}

// Get summary
setInterval(() => {
  const summary = getPerfSummary();
  console.log('Performance Summary:', summary);
}, 60000);
```

---

## Best Practices

### 1. Pool Lifecycle Management

```typescript
// Singleton pattern for shared pools
let sharedPool: Pool | null = null;

export function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = pool('./worker.js', { minWorkers: 2 });
  }
  return sharedPool;
}

// Cleanup on app shutdown
process.on('SIGTERM', async () => {
  if (sharedPool) {
    await sharedPool.terminate();
  }
});
```

### 2. Graceful Degradation

```typescript
export async function createOptimalPool(script: string): Promise<Pool> {
  const { canUseWasm, canUseSharedMemory } = await import('workerpool/full');

  const options: PoolOptions = {
    maxWorkers: navigator.hardwareConcurrency || 4,
  };

  if (canUseWasm() && canUseSharedMemory()) {
    // Full WASM with shared memory
    options.queueStrategy = 'wasm';
  }

  return pool(script, options);
}
```

### 3. Resource Limits

```typescript
export function createBoundedPool(script: string, memoryLimitMB: number = 512): Pool {
  return pool(script, {
    maxWorkers: Math.min(navigator.hardwareConcurrency || 4, 8),
    maxQueueSize: 1000,
    workerThreadOpts: {
      resourceLimits: {
        maxOldGenerationSizeMb: memoryLimitMB,
        maxYoungGenerationSizeMb: memoryLimitMB / 4,
      },
    },
  });
}
```

---

## Migration Guide

### From 9.x to 10.x

```typescript
// Old (9.x)
import workerpool from 'workerpool';
const pool = workerpool.pool('./worker.js');

// New (10.x) - Minimal
import { pool } from 'workerpool/minimal';
const p = pool('./worker.js');

// New (10.x) - With WASM
import { pool, canUseWasm, WasmBridge } from 'workerpool/full';
const p = pool('./worker.js');
```

### Adding Type Safety

```typescript
// Before: Untyped
const result = await pool.exec('calculate', [1, 2, 3]);

// After: Fully typed
import { defineWorkerMethods, createTypedProxy } from 'workerpool/full';

const methods = defineWorkerMethods({
  calculate(a: number, b: number, c: number): number {
    return a + b + c;
  },
});

const typed = createTypedProxy<typeof methods>(pool);
const result = await typed.calculate(1, 2, 3); // Typed!
```
