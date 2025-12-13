# Node.js Support

workerpool v11.0.0 supports Node.js 16.x and later.

## Support Matrix

| Node.js Version | Status | worker_threads | child_process | WASM |
|-----------------|--------|----------------|---------------|------|
| 16.x | Supported | Full | Full | Full |
| 18.x | Supported | Full | Full | Full |
| 20.x | Supported | Full | Full | Full |
| 22.x | Supported | Full | Full | Full |
| 25.x | Supported | Full | Full | Full |

## Worker Types

### Auto (Default)

```javascript
const pool = workerpool.pool({
  workerType: 'auto' // Default
});
```

Behavior:
- Uses `worker_threads` if available (Node.js 11.7+)
- Falls back to `child_process` if worker_threads unavailable

### Thread

```javascript
const pool = workerpool.pool({
  workerType: 'thread'
});
```

Uses Node.js `worker_threads` module. Best for:
- CPU-intensive tasks
- Shared memory scenarios
- Lower overhead than processes

### Process

```javascript
const pool = workerpool.pool({
  workerType: 'process'
});
```

Uses Node.js `child_process.fork()`. Best for:
- Legacy compatibility
- Isolation requirements
- Debugging with --inspect

## Configuration Options

### Thread Options

```javascript
const pool = workerpool.pool('./worker.js', {
  workerType: 'thread',
  workerThreadOpts: {
    resourceLimits: {
      maxOldGenerationSizeMb: 512,
      maxYoungGenerationSizeMb: 128,
    },
    env: {
      MY_VAR: 'value'
    }
  }
});
```

### Process Options

```javascript
const pool = workerpool.pool('./worker.js', {
  workerType: 'process',
  forkArgs: ['--max-old-space-size=512'],
  forkOpts: {
    env: {
      MY_VAR: 'value'
    },
    execArgv: ['--enable-source-maps']
  }
});
```

## Debugging

### Debugging Worker Threads

```javascript
const pool = workerpool.pool('./worker.js', {
  workerType: 'thread',
  debugPortStart: 9230
});
```

Workers will use ports 9230, 9231, etc.

Attach debugger:
```bash
node --inspect-brk your-app.js
# Then attach to worker ports 9230+
```

### Debugging Child Processes

```javascript
const pool = workerpool.pool('./worker.js', {
  workerType: 'process',
  forkOpts: {
    execArgv: ['--inspect=9230']
  }
});
```

## Performance Comparison

| Metric | worker_threads | child_process |
|--------|---------------|---------------|
| Spawn time | ~10ms | ~50ms |
| Memory overhead | ~5MB | ~30MB |
| IPC latency | ~0.1ms | ~1ms |
| SharedArrayBuffer | Supported | Not supported |

## Feature Detection

```javascript
import {
  canUseWasm,
  canUseSharedMemory,
  canUseWasmThreads,
  getFeatureReport,
} from '@danielsimonjr/workerpool/wasm';

console.log('WASM:', canUseWasm());
console.log('SharedArrayBuffer:', canUseSharedMemory());
console.log('WASM Threads:', canUseWasmThreads());
console.log('\nFull Report:');
console.log(getFeatureReport());
```

## SharedArrayBuffer in Node.js

SharedArrayBuffer is available in Node.js by default (no headers needed like browsers).

```javascript
// Check availability
if (typeof SharedArrayBuffer !== 'undefined') {
  console.log('SharedArrayBuffer available');
}
```

For WASM thread support:

```javascript
import { canUseWasmThreads } from '@danielsimonjr/workerpool/wasm';

if (canUseWasmThreads()) {
  // Can use WASM-based lock-free queues
  const pool = workerpool.pool({
    queueStrategy: 'auto' // Will use WASM queue if available
  });
}
```

## ESM vs CommonJS

workerpool supports both module systems:

### ESM

```javascript
// package.json: "type": "module"
import workerpool from '@danielsimonjr/workerpool';

const pool = workerpool.pool('./worker.mjs');
```

### CommonJS

```javascript
const workerpool = require('@danielsimonjr/workerpool');

const pool = workerpool.pool('./worker.js');
```

### Worker Scripts

Workers automatically detect the module system:

```javascript
// worker.js (CommonJS)
const workerpool = require('@danielsimonjr/workerpool');

workerpool.worker({
  add: (a, b) => a + b
});
```

```javascript
// worker.mjs (ESM)
import workerpool from '@danielsimonjr/workerpool';

workerpool.worker({
  add: (a, b) => a + b
});
```

## Cluster Integration

workerpool can work alongside Node.js cluster:

```javascript
import cluster from 'cluster';
import os from 'os';
import workerpool from '@danielsimonjr/workerpool';

if (cluster.isPrimary) {
  // Fork cluster workers
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  // Each cluster worker has its own pool
  const pool = workerpool.pool('./worker.js', {
    maxWorkers: 2 // Limit per cluster worker
  });

  // Handle requests...
}
```

## Docker Considerations

When running in Docker:

```dockerfile
# Ensure sufficient shared memory for SharedArrayBuffer
docker run --shm-size=512m your-image
```

Or in docker-compose:

```yaml
services:
  app:
    shm_size: '512m'
```

## Known Issues

### Node.js 16.x

- `worker_threads` API differences may cause minor compatibility issues with very old 16.x versions. Recommend 16.14.0+.

### --enable-source-maps

When using source maps with workers:

```javascript
const pool = workerpool.pool('./worker.js', {
  workerType: 'process',
  forkOpts: {
    execArgv: ['--enable-source-maps']
  }
});
```

For threads, ensure your bundler generates inline source maps.

## Recommendations

1. **Use `workerType: 'thread'`** for best performance in modern Node.js
2. **Use `workerType: 'process'`** only when isolation is required
3. **Set appropriate resource limits** for memory-intensive workers
4. **Use `debugPortStart`** when debugging worker code
5. **Consider CPU count** when setting `maxWorkers`

```javascript
import os from 'os';

const pool = workerpool.pool('./worker.js', {
  maxWorkers: Math.max(os.cpus().length - 1, 1),
  workerType: 'thread'
});
```
