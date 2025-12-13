# Migration Guide: v10 to v11

This guide helps you migrate from workerpool v10.x to v11.0.0.

## Quick Start

For most users, upgrading is straightforward:

```bash
npm install @danielsimonjr/workerpool@11
```

If you're using TypeScript, remove any separate type definitions:

```bash
npm uninstall @types/workerpool
```

## Step-by-Step Migration

### Step 1: Update Package

```bash
npm install @danielsimonjr/workerpool@11
```

### Step 2: Check for Breaking Changes

Run your existing tests. If they pass, you're likely good to go. If not, check the sections below.

### Step 3: Update Deprecated APIs

**Replace `nodeWorker` with `workerType`:**

```javascript
// Before (v10)
const pool = workerpool.pool({ nodeWorker: 'thread' });

// After (v11)
const pool = workerpool.pool({ workerType: 'thread' });
```

**Replace `always()` with `finally()`:**

```javascript
// Before (v10)
pool.exec('task').always(() => console.log('done'));

// After (v11)
pool.exec('task').finally(() => console.log('done'));
```

**Replace `pool.tasks` access:**

```javascript
// Before (v10)
const pending = pool.tasks.length;

// After (v11)
const pending = pool.stats().pendingTasks;
// Or use the task queue directly:
const pending = pool.taskQueue.size();
```

### Step 4: TypeScript Users

Remove `@types/workerpool` if installed:

```bash
npm uninstall @types/workerpool
```

Types are now bundled with the package.

Update your imports if needed:

```typescript
// Types are exported from main package
import type {
  Pool,
  PoolOptions,
  ExecOptions,
  PoolStats,
  WorkerpoolPromise,
} from '@danielsimonjr/workerpool';

// Or use typed pool creation
import workerpool from '@danielsimonjr/workerpool';

const pool = workerpool.pool<MyMetadata>('./worker.js', {
  maxWorkers: 4,
});
```

### Step 5: Choose Entry Point (Optional)

For smaller bundle sizes, use a specific entry point:

```javascript
// Full legacy API (default)
import workerpool from '@danielsimonjr/workerpool';

// Minimal TypeScript build (~5KB)
import workerpool from '@danielsimonjr/workerpool/minimal';

// Full TypeScript build with WASM (~15KB)
import workerpool from '@danielsimonjr/workerpool/full';
```

### Step 6: Leverage New Features (Optional)

**Batch Operations:**

```javascript
// Instead of multiple exec calls
const results = await Promise.all([
  pool.exec('process', [1]),
  pool.exec('process', [2]),
  pool.exec('process', [3]),
]);

// Use execBatch for better performance
const result = await pool.execBatch([
  { method: 'process', params: [1] },
  { method: 'process', params: [2] },
  { method: 'process', params: [3] },
]);
console.log(result.successes); // [result1, result2, result3]
```

**Parallel Map:**

```javascript
// Instead of manual distribution
const items = [1, 2, 3, 4, 5, 6, 7, 8];
const results = await Promise.all(
  items.map(n => pool.exec((x) => x * x, [n]))
);

// Use pool.map for cleaner code
const result = await pool.map(items, (n) => n * n);
console.log(result.successes); // [1, 4, 9, 16, 25, 36, 49, 64]
```

**Queue Strategy:**

```javascript
// LIFO queue for stack-like behavior
const pool = workerpool.pool({
  queueStrategy: 'lifo'
});

// Custom priority queue
const priorityQueue = {
  tasks: [],
  push(task) {
    this.tasks.push(task);
    this.tasks.sort((a, b) =>
      (b.options?.metadata?.priority || 0) -
      (a.options?.metadata?.priority || 0)
    );
  },
  pop() { return this.tasks.shift(); },
  size() { return this.tasks.length; },
  contains(task) { return this.tasks.includes(task); },
  clear() { this.tasks = []; }
};

const pool = workerpool.pool({
  queueStrategy: priorityQueue
});
```

## Common Issues

### Issue: "Cannot find type definitions"

**Solution:** Types are bundled. Remove `@types/workerpool`:
```bash
npm uninstall @types/workerpool
```

### Issue: "pool.tasks is undefined"

**Solution:** Use `pool.taskQueue` or `pool.stats()`:
```javascript
// Before
const count = pool.tasks.length;

// After
const count = pool.stats().pendingTasks;
```

### Issue: "nodeWorker is not a valid option"

**Solution:** Use `workerType` instead:
```javascript
// Before
{ nodeWorker: 'thread' }

// After
{ workerType: 'thread' }
```

### Issue: TypeScript error with exec callback

**Solution:** Use generic type parameter:
```typescript
const result = await pool.exec<number>('add', [1, 2]);
// result is typed as number
```

### Issue: SharedArrayBuffer not available

This is expected in browsers without COOP/COEP headers. The library automatically falls back to postMessage. To enable SharedArrayBuffer, add these HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Performance Comparison

v11 includes performance improvements:

| Operation | v10 | v11 | Improvement |
|-----------|-----|-----|-------------|
| Task execution | baseline | ~same | - |
| Queue operations | O(n) | O(1) with WASM | 10x faster |
| Batch operations | N/A | new feature | - |
| Large message transfer | copy | zero-copy* | 5-10x faster |

*With SharedArrayBuffer enabled

## Need Help?

- [Breaking Changes](./BREAKING_CHANGES.md)
- [GitHub Issues](https://github.com/danielsimonjr/workerpool/issues)
- [API Documentation](./api/)
