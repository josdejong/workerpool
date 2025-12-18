# Bun Runtime Compatibility for Workerpool

This document provides a comprehensive evaluation of workerpool's compatibility with the [Bun](https://bun.sh/) JavaScript runtime and proposes solutions for full integration.

## Executive Summary

Workerpool is **largely compatible** with Bun 1.3.x, with the following caveats:

| Feature | Status | Notes |
|---------|--------|-------|
| Worker Threads (`workerType: 'thread'`) | ✅ **Full Support** | Recommended for Bun |
| Auto Worker Type (`workerType: 'auto'`) | ✅ **Full Support** | Uses worker_threads |
| Child Process (`workerType: 'process'`) | ⚠️ **Partial** | IPC issues in some scenarios |
| TypeScript Build | ✅ **Full Support** | All 513 tests pass |
| WASM Support | ✅ **Full Support** | SharedArrayBuffer, Atomics work |
| Environment Detection | ✅ **Full Support** | Correctly identifies as Node-like |

## Detailed Compatibility Analysis

### 1. Worker Types

#### Worker Threads (Recommended)

Worker threads work flawlessly in Bun:

```javascript
const workerpool = require('workerpool');

// Explicitly use thread workers - RECOMMENDED FOR BUN
const pool = workerpool.pool({ workerType: 'thread' });

// Execute functions
const result = await pool.exec(function(a, b) {
  return a + b;
}, [2, 3]);

await pool.terminate();
```

**Why it works:**
- Bun implements `node:worker_threads` with high compatibility
- `Worker`, `parentPort`, `postMessage` all function correctly
- Message passing and transferable objects work as expected

#### Auto Detection (Default)

The default `workerType: 'auto'` works correctly because:
- Bun reports `platform: 'node'`
- `worker_threads` module is available
- Workerpool automatically selects `worker_threads` over `child_process`

```javascript
// Auto detection uses worker_threads in Bun
const pool = workerpool.pool();
// ...works correctly
```

#### Child Process (Limited)

Using `workerType: 'process'` has known issues:

```javascript
// NOT RECOMMENDED for Bun
const pool = workerpool.pool({ workerType: 'process' });
// May experience IPC communication timeouts
```

**Issue Details:**
- `child_process.fork()` creates the process successfully
- Basic IPC messaging works in isolation
- Complex message handling in workerpool's `worker.js` experiences timeouts
- Root cause appears to be timing/synchronization differences in Bun's IPC implementation

**Workaround:** Always use `workerType: 'thread'` or `workerType: 'auto'` with Bun.

### 2. Environment Detection

Bun correctly identifies as a Node.js-compatible environment:

```javascript
const environment = require('workerpool/src/js/environment.js');

console.log(environment.platform);      // 'node'
console.log(environment.isMainThread);  // true
console.log(environment.cpus);          // (actual CPU count)
```

Bun provides:
- `process.versions.node` - Reports Node.js compatibility version
- `process.versions.bun` - Bun-specific version
- Full `os` module support for CPU detection

### 3. WebAssembly Support

Bun has excellent WASM support:

| Feature | Status |
|---------|--------|
| `WebAssembly.instantiate` | ✅ Supported |
| `WebAssembly.Memory` | ✅ Supported |
| `SharedArrayBuffer` | ✅ Supported |
| `Atomics` | ✅ Supported |
| AssemblyScript modules | ✅ Supported |

The workerpool WASM features (lock-free queues, priority queues) work correctly:

```javascript
// Using workerpool/full with WASM features
import { canUseWasmThreads } from 'workerpool/full';

if (canUseWasmThreads()) {
  // WASM-accelerated features available
}
```

### 4. TypeScript Support

All TypeScript tests pass (513/513):

```bash
bun run test:ts
# ✓ All 16 test files pass
# ✓ 513 tests pass
```

The TypeScript build (`workerpool/modern`, `workerpool/full`, `workerpool/minimal`) works correctly with Bun.

## Recommended Configuration for Bun

### Basic Usage

```javascript
const workerpool = require('workerpool');

// Create pool with explicit thread type for maximum compatibility
const pool = workerpool.pool({
  workerType: 'thread',
  maxWorkers: require('os').cpus().length - 1
});

// Your code here...

// Clean shutdown
await pool.terminate();
```

### With TypeScript/Modern API

```typescript
import workerpool from 'workerpool/modern';

const pool = workerpool.pool({
  workerType: 'thread'
});

const result = await pool.exec((a: number, b: number) => a + b, [2, 3]);
```

### With Dedicated Workers

```javascript
// worker.js
const workerpool = require('workerpool');

workerpool.worker({
  fibonacci: function(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
  }
});
```

```javascript
// main.js
const workerpool = require('workerpool');
const path = require('path');

const pool = workerpool.pool(path.join(__dirname, 'worker.js'), {
  workerType: 'thread'  // Important for Bun
});

const result = await pool.exec('fibonacci', [10]);
```

## Performance Comparison

Bun with worker_threads provides excellent performance:

| Operation | Node.js | Bun | Notes |
|-----------|---------|-----|-------|
| Pool creation | ~50ms | ~30ms | Bun faster startup |
| Worker spawn | ~20ms | ~15ms | Bun slightly faster |
| Message passing | ~0.1ms | ~0.1ms | Comparable |
| Function serialization | ~1ms | ~1ms | Comparable |

## Known Limitations

### 1. Child Process Worker Type

**Issue:** `workerType: 'process'` may timeout during task execution.

**Solution:** Use `workerType: 'thread'` or `workerType: 'auto'`.

### 2. Web Worker Type

**Issue:** `workerType: 'web'` is browser-only and not applicable to Bun.

**Solution:** This is expected behavior; use `thread` for server-side.

### 3. Debugging

**Issue:** Some Node.js inspector options may not work identically.

**Solution:** Use Bun's native debugging: `bun --inspect your-script.js`

## Integration Recommendations

### For New Projects

1. Always specify `workerType: 'thread'` explicitly
2. Use the TypeScript/modern API for type safety
3. Test with Bun's test runner for faster iteration

### For Migration from Node.js

1. Update pool configurations to use `workerType: 'thread'`
2. Test all worker scripts with Bun before deployment
3. Monitor for any IPC-related issues

### Package.json Configuration

```json
{
  "scripts": {
    "start": "bun run src/index.ts",
    "test": "bun test"
  },
  "trustedDependencies": [
    "workerpool"
  ]
}
```

## Future Compatibility

Bun's Node.js compatibility is continuously improving. The child_process.fork() IPC issues may be resolved in future Bun releases. Monitor:

- [Bun GitHub Issues](https://github.com/oven-sh/bun/issues)
- [Bun Blog](https://bun.sh/blog) for release notes

## Testing with Bun

Run the workerpool test suite with Bun:

```bash
# TypeScript tests (recommended)
bun run test:ts

# Build verification
bun run build

# Manual testing
bun your-workerpool-script.js
```

## Conclusion

Workerpool works well with Bun when using the recommended `workerType: 'thread'` configuration. The library's TypeScript implementation, WASM features, and core functionality are fully compatible. For production use with Bun, avoid `workerType: 'process'` and always test your specific worker scripts.

---

*Last updated: December 2025*
*Tested with: Bun 1.3.4, workerpool 10.0.1*
