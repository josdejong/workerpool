# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
npm install          # Install dependencies
npm run build        # Build library (rollup + TypeScript types)
npm test             # Build, run mocha tests, and test types
npm run test:js      # Run JavaScript tests only (Mocha)
npm run test:ts      # Run TypeScript tests only (Vitest)
npm run test:types   # Test TypeScript type definitions only
npm run coverage     # Generate test coverage report (output: ./coverage/index.html)
npm run typecheck    # TypeScript validation without emit
```

WASM build commands:
```bash
npm run build:wasm        # Build AssemblyScript to WASM (release)
npm run build:wasm:debug  # Build WASM with debug info and source maps
npm run build:wasm:embed  # Build WASM and generate embedded bindings
npm run build:wasm:all    # Build all WASM variants (release, ESM, raw)
```

Dependency analysis:
```bash
npm run deps              # Generate dependency graph documentation
npm run deps:compress     # Compress docs for LLM context windows
```

To run a single test file:
```bash
npm run build && mocha test/js/Pool.test.js
```

## Architecture

**workerpool** is a high-performance thread pool implementation that runs on both Node.js and browsers. It offloads CPU-intensive tasks to worker processes/threads with support for task prioritization, work-stealing, and WASM-accelerated lock-free queues.

### Directory Structure

```
workerpool/
├── src/
│   ├── js/              # Legacy JavaScript codebase (17 files)
│   └── ts/              # Modern TypeScript codebase (92 files)
│       ├── core/        # Pool, WorkerHandler, queues, strategies
│       ├── platform/    # Environment detection, channels, transfer
│       ├── wasm/        # WASM bridge, loaders, feature detection
│       ├── assembly/    # AssemblyScript source → WASM
│       ├── workers/     # Worker utilities and runtime
│       └── types/       # TypeScript type definitions
├── dist/                # Built outputs (UMD, ESM, WASM)
├── test/
│   ├── js/              # Mocha tests
│   └── ts/              # Vitest tests
├── types/               # Generated .d.ts files
└── tools/               # Development utilities
```

### Entry Points

The library provides multiple entry points for different use cases:

| Entry Point | Source | Size | Features |
|-------------|--------|------|----------|
| `workerpool` (default) | `src/js/index.js` | ~33KB min | Legacy JS API |
| `workerpool/modern` | `src/ts/index.ts` | ~50KB | Full TypeScript |
| `workerpool/minimal` | `src/ts/minimal.ts` | ~5KB | No WASM |
| `workerpool/full` | `src/ts/full.ts` | ~15KB | With WASM |
| `workerpool/wasm` | `src/ts/wasm/index.ts` | - | WASM utilities only |
| `workerpool/errors` | `src/ts/errors.ts` | - | Error classes only |
| `workerpool/debug` | `src/ts/debug.ts` | - | Debug utilities only |

### Core Components

#### Legacy JavaScript (`src/js/`)

- **`index.js`** - Public API: `pool()`, `worker()`, `workerEmit()`, `Transfer`
- **`Pool.js`** - Worker lifecycle, task queue (FIFO/LIFO), dispatch to `maxWorkers`
- **`WorkerHandler.js`** - Single worker control, message passing, timeouts, cancellation
- **`worker.js`** - Worker-side RPC handler, method registration, abort listeners
- **`Promise.js`** - Custom Promise with `cancel()`, `timeout()`, `always()`

#### TypeScript Core (`src/ts/core/`)

**Pool.ts** - Main pool implementation with:
- Event emitter (taskStart, taskComplete, taskError, workerSpawn, workerExit)
- Circuit breaker for error recovery (closed → open → half-open)
- Retry mechanism with exponential backoff
- Memory pressure management
- Health check integration
- Session manager for stateful execution
- Parallel array operations: `map()`, `reduce()`, `filter()`, `forEach()`, `some()`, `every()`

**AdvancedPool.ts** - Extended pool with intelligent scheduling:
- Worker choice strategies (6 algorithms)
- Work-stealing scheduler with distributed queues
- Task affinity router for cache locality
- Factory functions: `advancedPool()`, `cpuIntensivePool()`, `ioIntensivePool()`, `mixedWorkloadPool()`

**TaskQueue.ts** - Queue implementations:
- `FIFOQueue` - O(1) push/pop using GrowableCircularBuffer
- `LIFOQueue` - Stack-based, O(1) operations
- `PriorityQueue` - Binary heap, O(log n) operations

**Worker Choice Strategies** (`worker-choice-strategies.ts`):
- `round-robin` - Cycle through workers
- `least-busy` - Fewest active tasks (default for AdvancedPool)
- `least-used` - Lowest total task count
- `fair-share` - Balanced execution time
- `weighted-round-robin` - Proportional by worker weight
- `interleaved-weighted-round-robin` - Smoother distribution

**Work-Stealing** (`work-stealing.ts`):
- Per-worker deques with local LIFO, remote FIFO stealing
- Policies: random, round-robin, busiest-first, neighbor
- Automatic rebalancing when load imbalance > 2x

**WorkerHandler.ts** - Worker lifecycle management:
- Supports web workers, worker_threads, child_process
- O(1) request queuing with GrowableCircularBuffer
- Cleanup phase with abort listener timeout
- Graceful termination with force-kill fallback

### Worker Utilities (`src/ts/workers/`)

- **`adaptive-scaler.ts`** - Dynamic scaling based on queue depth, latency, utilization
  - Hysteresis to prevent thrashing
  - 10-second cooldown between scale actions
  - Thresholds: 5 tasks/worker, 80% high utilization, 20% low

- **`health-monitor.ts`** - Worker health tracking
  - Heartbeat monitoring (5s interval, 30s timeout)
  - Consecutive failure tracking (threshold: 3)
  - Error rate monitoring (threshold: 50%)
  - Status: HEALTHY, DEGRADED, UNHEALTHY, UNKNOWN

- **`recycler.ts`** - Worker lifecycle management
  - Idle timeout recycling (default: 60s)
  - Task count limits (default: 10,000)
  - Grace period for new workers (30s)
  - Respects minimum worker count

- **`affinity.ts`** - Task-to-worker affinity
  - Strategies: NONE, PREFERRED, STRICT, SPREAD
  - LRU cache with 10,000 max mappings, 5-minute TTL
  - Cache hit tracking and statistics

- **`WorkerCache.ts`** - Pre-warmed worker pool
  - O(1) acquire/release from warm pool
  - Automatic idle worker recycling
  - Maintains minimum worker count

### WASM Layer

#### TypeScript Bridge (`src/ts/wasm/`)

- **`WasmBridge.ts`** - High-level API for WASM operations
  - Factory methods: `create()`, `createFromBytes()`, `createSync()`, `attachToBuffer()`
  - Ring buffer operations: `push()`, `pop()`, `size()`, `isEmpty()`, `isFull()`
  - Slot operations with reference counting

- **`WasmTaskQueue.ts`** - TaskQueue interface over WASM
  - Dual storage: WASM (scheduling) + JavaScript Map (task objects)
  - Supports priority from task metadata
  - Cross-thread buffer sharing

- **`feature-detection.ts`** - Runtime capability checks
  - `canUseWasm()`, `canUseSharedMemory()`, `canUseWasmThreads()`
  - COOP/COEP header detection for browsers
  - `getRecommendedQueueType()` - 'wasm' or 'fifo' fallback

- **`EmbeddedWasmLoader.ts`** - Base64 embedded WASM for bundled distributions

#### AssemblyScript Source (`src/ts/assembly/`)

Lock-free data structures compiled to WebAssembly:

- **`ring-buffer.ts`** - SPMC lock-free ring buffer, O(1) push/pop
- **`task-slots.ts`** - Slot allocator with free list, reference counting
- **`priority-queue.ts`** - Binary heap with CAS operations, O(log n)
- **`atomics.ts`** - Spinlock, CAS, atomic counters, seqlock
- **`simd-batch.ts`** - SIMD batch operations (map, reduce, dot product)
- **`circular-buffer.ts`** - Growable circular buffer

**Memory Layout:**
- Header: 64 bytes (magic, version, head/tail pointers, capacity)
- Ring buffer entries: 8 bytes each (priority + slot index)
- Task slots: 64 bytes each (state, task ID, priority, timestamp, method ID, refcount)
- Default capacity: 1024 entries

### Platform Abstraction (`src/ts/platform/`)

- **`environment.ts`** - Platform detection
  - `platform`: 'node' | 'browser'
  - `isBun`: Bun runtime detection (uses worker_threads, avoids child_process)
  - `cpus`: Available CPU cores
  - `hasWorkerThreads`, `hasSharedArrayBuffer`, `hasAtomics`

- **`channel-factory.ts`** - Communication channels
  - `MessagePassingChannel` - Non-blocking message queue (IPC/postMessage)
  - `SharedMemoryChannelWrapper` - Lock-free via SharedArrayBuffer + Atomics
  - `InstrumentedChannel` - Statistics wrapper

- **`shared-memory.ts`** - SharedArrayBuffer protocol
  - Slot-based message passing with state machine (EMPTY → WRITING → READY → READING)
  - Large message chunking (CHUNK_START, CHUNK_DATA, CHUNK_END)
  - Blocking receive with `Atomics.wait()`

- **`transfer.ts`** - Zero-copy data transfer
  - `Transfer` class for explicit transfer lists
  - Convenience functions: `transferFloat32()`, `transferArrayBuffer()`, etc.
  - Auto-detection: `Transfer.findTransferables()`

- **`message-batcher.ts`** - High-throughput optimization
  - Configurable: flush timeout (10ms), max messages (100), max size (64KB)
  - `AdaptiveBatcher` - Adjusts based on message patterns

- **`result-stream.ts`** - Streaming large results
  - Backpressure handling (high/low water marks)
  - Chunk-based transfer with progress tracking

- **`capabilities.ts`** - Feature detection
  - `getCapabilities()` - Full capability object
  - `recommendedTransfer`: 'shared' | 'transferable' | 'binary' | 'json'

### Worker Types

The `workerType` option controls which backend is used:

| Type | Environment | Notes |
|------|-------------|-------|
| `'auto'` | Node.js | worker_threads (11.7+), child_process fallback |
| `'auto'` | Browser | Web Workers |
| `'auto'` | Bun | worker_threads (avoids child_process IPC issues) |
| `'web'` | Browser only | Web Workers |
| `'thread'` | Node.js only | worker_threads |
| `'process'` | Node.js only | child_process.fork |

### Message Protocol

Workers communicate via JSON-RPC style messages:

```typescript
// Request: main → worker
{ id: number, method: string, params?: unknown[] }

// Response: worker → main
{ id: number, result?: unknown, error?: SerializedError }

// Event: worker → main
{ id: number, isEvent: true, payload: unknown }
```

Special methods:
- `__workerpool-terminate__` - Graceful worker exit
- `__workerpool-cleanup__` - Trigger abort listeners before termination

### Key Patterns

1. **Dynamic function execution**: `pool.exec(fn, args)` - stringify and send functions
2. **Dedicated workers**: `workerpool.worker({ methodName: fn })` - register methods
3. **Proxy pattern**: `pool.proxy()` - returns object mirroring worker methods
4. **Transferable objects**: `workerpool.Transfer` - zero-copy ArrayBuffer passing
5. **WASM queues**: `workerpool/full` with `canUseWasmThreads()` for lock-free scheduling
6. **Work-stealing**: Distributed queues with automatic load balancing
7. **Task affinity**: Route related tasks to same worker for cache locality

### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| FIFO/LIFO queue push/pop | O(1) | GrowableCircularBuffer |
| Priority queue push/pop | O(log n) | Binary heap |
| Work-stealing local op | O(1) | LIFO for cache locality |
| Work-stealing steal | O(1) | FIFO for fairness |
| Slot allocate/free | O(1) | Free list with CAS |
| Worker selection | O(n) | n = worker count |
| SIMD operations | O(n/4) | 4 lanes for f32 |

## Development Workflow

### Build & Publish

```bash
npm run build              # Build library
npm test                   # Run all tests
git add -A && git commit   # Commit changes
npm publish                # Publish to npm
git tag v1.2.3 && git push --tags  # Tag release
```

See HISTORY.md for version changelog format.

### Commit Convention

Use conventional commits: `feat:`, `fix:`, `docs:`, `perf:`, `test:`, `chore:`

### Cleanup Before Committing

Remove temporary artifacts before committing:
- Temporary test scripts (`test-*.js`, `debug-*.js`)
- Runtime artifacts (`.error.txt`, etc.)
- Check `git status` before committing

## Development Tools (`tools/`)

### chunking-for-files

Splits large files into editable chunks and merges them back.

```bash
npx tsx tools/chunking-for-files/chunking-for-files.ts split <file> [options]
npx tsx tools/chunking-for-files/chunking-for-files.ts merge <manifest.json>
npx tsx tools/chunking-for-files/chunking-for-files.ts status <manifest.json>
```

Supports: Markdown (headings), JSON (keys), TypeScript/JavaScript (declarations)

### compress-for-context

Compresses files for LLM context windows.

```bash
npx tsx tools/compress-for-context/compress-for-context.ts <input> [options]
# Options: -l light|medium|aggressive, -f format, -d decompress, -b batch
```

### create-dependency-graph

Generates dependency documentation for the TypeScript codebase.

```bash
npm run deps              # Quick alias
```

Outputs to `docs/architecture/`:
- `DEPENDENCY_GRAPH.md` - Human-readable documentation
- `dependency-graph.json` - Full machine-readable graph
- `dependency-summary.compact.json` - Compressed for LLM consumption
- `unused-analysis.md` - Unused files and exports report

## Type Definitions

TypeScript types are generated from source via `npm run build:types`. Output goes to `types/` directory with `.d.ts` and `.d.ts.map` files.

## Error Handling

Key error classes (`src/ts/errors.ts`):
- `CancellationError` - Task cancelled
- `TimeoutError` - Task timeout exceeded
- `TerminateError` / `TerminationError` - Worker terminated
- `QueueFullError` / `QueueEmptyError` - Queue capacity issues
- `WasmNotAvailableError` - WASM not supported
- `SharedMemoryNotAvailableError` - SharedArrayBuffer unavailable
- `WorkerCreationError` - Worker spawn failed
- `MethodNotFoundError` - Unknown method called
