# Breaking Changes in v11.0.0

This document details all breaking changes introduced in workerpool v11.0.0 and provides migration guidance.

## Summary

v11.0.0 is a major release that introduces TypeScript support, WASM-accelerated task queues, and new APIs for batch operations and parallel processing. Most existing code will continue to work unchanged, but there are some breaking changes to be aware of.

## Breaking Changes

### 1. Task Queue Access Changed

**v10.x:**
```javascript
const tasks = pool.tasks; // Direct array access
```

**v11.x:**
```javascript
const taskQueue = pool.taskQueue; // TaskQueue interface
const size = taskQueue.size();    // Use methods instead
```

**Migration:** Replace direct `pool.tasks` access with `pool.taskQueue.size()` or use `pool.stats().pendingTasks`.

### 2. TypeScript Types Included

v11.0.0 includes TypeScript type definitions generated from source. If you were using `@types/workerpool` from DefinitelyTyped, you should remove it:

```bash
npm uninstall @types/workerpool
```

The bundled types are more accurate and maintained alongside the code.

### 3. New Entry Points

v11.0.0 provides multiple entry points for different use cases:

| Entry Point | Description | Size |
|-------------|-------------|------|
| `workerpool` | Legacy JS API (default) | ~50KB |
| `workerpool/minimal` | TypeScript build without WASM | ~5KB |
| `workerpool/full` | TypeScript build with WASM | ~15KB |
| `workerpool/wasm` | WASM utilities only | ~10KB |
| `workerpool/errors` | Error classes only | ~1KB |
| `workerpool/debug` | Debug utilities | ~2KB |

**Migration:** No changes needed if using default import. Use specific entry points for smaller bundle sizes.

### 4. Queue Strategy Options

**v10.x:**
```javascript
// No queue strategy option
const pool = workerpool.pool();
```

**v11.x:**
```javascript
const pool = workerpool.pool({
  queueStrategy: 'fifo' | 'lifo' | customQueue
});
```

**Migration:** Default is `'fifo'` which matches v10 behavior. No changes needed unless you want different queuing.

### 5. Worker Type Option

The `nodeWorker` option is deprecated in favor of `workerType`:

**v10.x:**
```javascript
const pool = workerpool.pool({
  nodeWorker: 'thread'
});
```

**v11.x:**
```javascript
const pool = workerpool.pool({
  workerType: 'thread' // 'auto' | 'web' | 'process' | 'thread'
});
```

**Migration:** Replace `nodeWorker` with `workerType`. Both work in v11, but `nodeWorker` is deprecated.

### 6. Promise.always() Deprecated

`Promise.always()` is deprecated in favor of standard `finally()`:

**v10.x:**
```javascript
pool.exec('fn').always(() => cleanup());
```

**v11.x:**
```javascript
pool.exec('fn').finally(() => cleanup());
```

**Migration:** Replace `always()` with `finally()`. `always()` still works but will be removed in v12.

## New Features (Non-Breaking)

These are new features that don't break existing code:

### Batch Operations

```javascript
// Execute multiple tasks at once
const result = await pool.execBatch([
  { method: 'process', params: [1] },
  { method: 'process', params: [2] },
], { concurrency: 4 });

// Parallel map
const squared = await pool.map([1, 2, 3], (n) => n * n);
```

### Extended Pool Options

```javascript
const pool = workerpool.pool({
  // Existing options still work
  maxWorkers: 4,

  // New options
  queueStrategy: 'fifo',
  workerType: 'thread',
  emitStdStreams: true,
  debugPortStart: 43210,
});
```

### Worker Affinity

```javascript
await pool.exec('process', [data], {
  affinity: {
    key: 'user:123',
    strategy: 'preferred'
  }
});
```

## Deprecated APIs

| API | Replacement | Removal |
|-----|-------------|---------|
| `pool.tasks` | `pool.taskQueue` | v12.0.0 |
| `nodeWorker` option | `workerType` option | v12.0.0 |
| `Promise.always()` | `Promise.finally()` | v12.0.0 |

## Browser Compatibility

v11.0.0 requires:
- ES2020+ (async/await, BigInt)
- Web Workers API
- Optional: SharedArrayBuffer (requires COOP/COEP headers)

## Node.js Compatibility

- Node.js 16.x: Full support
- Node.js 18.x: Full support
- Node.js 20.x: Full support
- Node.js 22.x: Full support

## Getting Help

If you encounter issues migrating:

1. Check the [Migration Guide](./MIGRATION_v10_to_v11.md)
2. Search [GitHub Issues](https://github.com/danielsimonjr/workerpool/issues)
3. Open a new issue with the `migration` label
