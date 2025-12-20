# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is a fork of [josdejong/workerpool](https://github.com/josdejong/workerpool).

## [Unreleased]

### Added
- **Extended Parallel Processing Functions** (TypeScript API):
  - `pool.count()` - Count elements matching a predicate
  - `pool.partition()` - Split array into [matches, non-matches] tuple
  - `pool.includes()` - Check if value exists (with early exit)
  - `pool.indexOf()` - Find first index of value (with early exit)
  - `pool.groupBy()` - Group items by key function
  - `pool.flatMap()` - Map then flatten results
  - `pool.unique()` - Remove duplicate items (supports custom key selector)
  - `pool.reduceRight()` - Reduce array from right to left
  - All new functions support cancellation, pause/resume, and chunked parallel execution

- **SIMD-Accelerated WASM Operations** for numeric arrays:
  - `simdCountI32()` / `simdCountF32()` - SIMD count matching values
  - `simdIndexOfI32()` / `simdIndexOfF32()` - SIMD search for index
  - `simdIncludesI32()` / `simdIncludesF32()` - SIMD existence check
  - `simdCountGreaterThanF32()` / `simdCountLessThanF32()` - SIMD threshold counting
  - `simdPartitionF32()` - SIMD array partitioning
  - Pure TypeScript stubs for testing without WASM compilation

- **34 new tests** for extended parallel processing:
  - count: 4 tests
  - partition: 4 tests
  - includes: 5 tests
  - indexOf: 4 tests
  - groupBy: 4 tests
  - flatMap: 4 tests
  - unique: 5 tests
  - reduceRight: 4 tests
  - Total TypeScript test count: 832 tests (up from 798)

- **Parallel Processing Functions** (TypeScript API):
  - `pool.reduce()` - Parallel reduce with chunked execution and proper initialValue handling
  - `pool.forEach()` - Parallel iteration with progress tracking
  - `pool.filter()` - Parallel filtering with order preservation
  - `pool.some()` - Early-exit predicate check (any match)
  - `pool.every()` - Early-exit all-match check
  - `pool.find()` - Parallel search for first matching item
  - `pool.findIndex()` - Parallel search for index of first match
  - All functions support cancellation, pause/resume, and chunked execution

- **Graceful Degradation** (MainThreadExecutor):
  - `MainThreadExecutor` class - Same API as Pool, runs on main thread
  - `hasWorkerSupport()` - Detect Web Worker availability
  - `createPoolWithFallback()` - Auto-select Pool or MainThreadExecutor based on environment
  - `mainThreadExecutor()` - Factory function for creating executor instances
  - Supports old browsers without Web Worker support
  - Useful for testing environments and SSR scenarios

- **Session Support** (SessionManager):
  - `pool.createSession()` - Create a stateful session bound to a worker
  - `session.exec()` - Execute tasks on the session's dedicated worker
  - `session.getState()` / `session.setState()` - Manage session state
  - `session.close()` - Clean up session resources
  - Session timeout and max task limits
  - Automatic load balancing across workers
  - Worker affinity for related task sequences

- **74 new TypeScript tests** for new features:
  - test/ts/parallel-processing.vitest.ts: 24 tests for parallel array operations
  - test/ts/main-thread-executor.vitest.ts: 13 tests for graceful degradation
  - test/ts/session-manager.vitest.ts: 37 tests for session management
  - Total TypeScript test count: 798 tests (up from 724)

- **Complete TypeScript API Exports** for extended parallel processing:
  - Functions: `createParallelCount`, `createParallelPartition`, `createParallelIncludes`, `createParallelIndexOf`, `createParallelGroupBy`, `createParallelFlatMap`, `createParallelUnique`, `createParallelReduceRight`
  - Types: `KeySelectorFn`, `FlatMapFn`, `EqualityFn`, `UniqueOptions`, `GroupByOptions`, `FlatMapOptions`, `CountResult`, `PartitionResult`, `GroupByResult`, `UniqueResult`
  - All exports available from `workerpool/modern`, `workerpool/minimal`, and `workerpool/full`

- **Expanded TypeScript API Exports** for better developer integration:
  - **Platform Detection** (all builds): `isNode()`, `getPlatformInfo()`, `hasWorkerThreads`, `hasSharedArrayBuffer`, `hasAtomics`
  - **Bun Compatibility** (all builds): `isBun`, `bunVersion`, `recommendedWorkerType`, `getWorkerTypeSupport()`, `isWorkerTypeSupported()`
  - **Data Structures** (all builds): `CircularBuffer`, `GrowableCircularBuffer`, `TimeWindowBuffer`
  - **Queue Implementations** (all builds): `FIFOQueue`, `LIFOQueue`
  - **Transfer Detection** (modern/full): `isTransferable()`, `detectTransferables()`, `getTransferableType()`, `validateTransferables()`
  - **Metrics** (modern/full): `MetricsCollector`
  - **Runtime Utilities** (modern/full): `optimalPool()`, `getRuntimeInfo()`
  - **Type exports** for `TransferableType`, batch types, and platform types
- **99 new TypeScript tests** for export verification:
  - test/ts/exports.vitest.ts: 73 tests verifying all exports across minimal/modern/full builds
  - test/ts/transfer.vitest.ts: 26 new tests for transfer detection utilities
  - Total TypeScript test count: 724 tests (up from 625)

### Performance
- **O(1) Circular Buffer Optimizations**:
  - CircularBuffer: Fixed-size buffer with automatic eviction for metrics (O(1) push vs O(n) shift)
  - GrowableCircularBuffer: Power-of-2 sizing with bitwise AND for fast modulo operations
  - TimeWindowBuffer: Time-based metric collection with automatic pruning
  - FIFOQueue now uses GrowableCircularBuffer internally (O(1) push/shift)
  - WorkerHandler uses Map<> instead of Object.create(null) for better iteration performance
  - MetricsCollector uses CircularBuffer for O(1) operations instead of array.shift()
  - AssemblyScript circular buffer for WASM (initBuffer, pushGrowable, pushWithEviction, shift, peek, drain)
  - **Benchmark Results (Node.js)**: TS+WASM is 2.32x faster for pool creation, 1.30x faster for concurrent tasks, 1.32x faster for queue throughput
  - **Benchmark Results (Bun)**: TS+WASM is 1.57x faster for queue throughput, 1.36x faster for pool creation, 1.11x faster for concurrent tasks

### Added
- **Bun Runtime Compatibility** (TypeScript build only):
  - Automatic Bun detection via `isBun` and `bunVersion` exports
  - `recommendedWorkerType` returns optimal worker type per runtime ('thread' for Bun, 'auto' for Node.js, 'web' for browser)
  - `getWorkerTypeSupport()` returns support matrix for all worker types
  - `isWorkerTypeSupported(type)` checks if a specific worker type is fully supported
  - `optimalPool()` creates pool with best settings for current runtime
  - `getRuntimeInfo()` returns complete runtime diagnostics
  - WorkerHandler auto-selects 'thread' in Bun to avoid child_process.fork IPC issues
  - Warning when explicitly using 'process' worker type in Bun
  - Extended `Capabilities` interface with Bun fields
  - Extended `PlatformInfo` with Bun-specific information
  - 20 new unit tests for Bun detection and worker type support
- **Dual Build System**: Separate JavaScript (`build:js`) and TypeScript+WASM (`build:wasm`) builds
- **Benchmark Suite**: `benchmark.mjs` comparing JS vs TS+WASM performance (TS+WASM up to 34% faster for concurrent workloads)
- TypeScript Build Infrastructure (tsconfig.json, tsconfig.build.json, rollup plugin)
- Core Type Definitions in src/ts/types/
- Platform Module in src/ts/platform/ (environment.ts, transfer.ts)
- Core Module in src/ts/core/ (Promise.ts, TaskQueue.ts, Pool.ts, WorkerHandler.ts, etc.)
- AssemblyScript WASM Module in src/ts/assembly/
- AssemblyScript stubs for testing in src/ts/assembly/stubs/
- WASM JavaScript Bridge in src/ts/wasm/
- Queue Factory with fifo, lifo, priority, wasm, auto strategies
- **Full Bundle Integration** (`workerpool/full`): All orphaned modules now exported:
  - Worker Management: AdaptiveScaler, HealthMonitor, IdleRecycler, WorkerAffinity, WorkerCache
  - Platform: MessageBatcher, ChannelFactory, StructuredClone, ResultStream, TransferDetection
  - Core: BatchSerializer, SIMDProcessor
- **Sprint 5: Worker Pre-Warming & Adaptive Scaling**
  - MetricsCollector: Task latency histograms, worker utilization, queue depths, error rates
  - AdaptiveScaler: Dynamic min/max scaling with hysteresis
  - HealthMonitor: Heartbeat-based worker liveness detection
  - IdleRecycler: Idle timeout and max tasks recycling
  - WorkerAffinity: Task-to-worker affinity for cache locality
  - Extended pool types (PoolOptionsExtended, AffinityHint, PoolMetricsSnapshot)
- **Sprint 6: Zero-Copy & SharedArrayBuffer**
  - SharedMemoryChannel: Lock-free bi-directional channel using SharedArrayBuffer/Atomics
  - Structured clone optimization: Auto-detection of transferables, zero-copy paths
  - MessageBatcher: Batch small messages with flush timeout/size thresholds
  - AdaptiveBatcher: Auto-tuning batch parameters based on message patterns
  - Transfer detection: isTransferable(), detectTransferables(), validation utilities
  - Result streaming: Chunked transfer, backpressure handling, SharedMemory streams
  - Channel factory: Automatic fallback from SAB to postMessage when unavailable
  - Shared memory protocol documentation (docs/planning/SHARED_MEMORY_PROTOCOL.md)
- **Sprint 7: Batch Operations & SIMD**
  - Pool.execBatch(): Execute multiple tasks as a batch with concurrency control
  - Pool.map(): Parallel map operation across workers with chunking support
  - BatchPromise: Extended promise with cancel(), pause(), resume(), isPaused()
  - Batch serializer: Efficient batch message format with chunking
  - BatchExecutor: Concurrency control, failFast, progress events, batch timeout
  - Progress throttling: Configurable callback frequency to reduce overhead
  - SIMD batch processor (AssemblyScript): simdMapF32, simdReduceF32, simdDotProduct
  - Scalar fallback: Full functionality when WASM SIMD unavailable
  - Batch API design documentation (docs/planning/BATCH_API_DESIGN.md)

- **Sprint 8: API Finalization & Documentation**
  - Breaking changes documentation (docs/BREAKING_CHANGES.md)
  - Migration guide v10 to v11 (docs/MIGRATION_v10_to_v11.md)
  - Browser support matrix (docs/BROWSER_SUPPORT.md)
  - Node.js compatibility guide (docs/NODE_SUPPORT.md)
  - Performance benchmark suite (benchmark/suite.ts)

### Changed
- **Directory Restructure**: Moved legacy JS to `src/js/`, TypeScript to `src/ts/`
- **Assembly Location**: Moved `assembly/` to `src/ts/assembly/`, stubs to `src/ts/assembly/stubs/`
- Updated package.json and rollup.config.mjs for TypeScript
- Simplified build scripts: removed `build:all`, renamed combined TS+WASM build to `build:wasm`
- Removed duplicate QueueFactory.ts (TaskQueue.ts provides createQueue())
- Full bundle size increased from ~15KB to ~34KB due to integrated modules

### Fixed
- Worker path resolution in TypeScript WorkerHandler (was looking for wrong path)
- Circular dependency between types/index.ts and types/worker-methods.ts (extracted shared types to types/core.ts)
- Missing simd-batch.ts export in assembly/index.ts

### Infrastructure
- Phase 1 Sprints 1-4 COMPLETED
- Phase 1 Sprint 5 COMPLETED
- Phase 1 Sprint 6 COMPLETED
- Phase 1 Sprint 7 COMPLETED
- Phase 1 Sprint 8 COMPLETED

## [10.0.1] - 2025-12-13

Fork release as @danielsimonjr/workerpool.

### Changed
- Published as scoped package @danielsimonjr/workerpool
- Repository: https://github.com/danielsimonjr/workerpool

### Fixed
- Test suite hanging 30+ minutes (CPU-bound loops replaced with async delays)
- workerType threads typo fixed to thread
- Windows platform skips for timing-sensitive IPC tests

## [10.0.1] - 2025-11-19

### Fixed
- WorkerHandler resilient against errors without message property (#523)

## [10.0.0] - 2025-10-21

### Added
- queueStrategy option (FIFO/LIFO/custom) (#518). Thanks @amaneru55
- TerminateError class (#519). Thanks @Julusian

### Changed
- **BREAKING**: pool.tasks changed to pool.taskQueue

## [9.3.4] - 2025-09-10

### Fixed
- Error handling for nested classes using .toJSON (#516)

## [9.3.3] - 2025-06-27

### Fixed
- Terminate worker even if abortListener resolved (#507). Thanks @joshLong145

## [9.3.0] - 2025-05-28

### Added
- Events and std streams from abort handler (#478). Thanks @joshLong145

## [9.2.0] - 2024-10-11

### Added
- Abort handlers in workers (#448). Thanks @joshLong145
- Promise.finally() (#388). Thanks @joshLong145, @wmertens

## [9.1.0] - 2024-01-18

### Added
- stdout/stderr capture (#425). Thanks @cpendery

## [9.0.0] - 2023-12-18

### Added
- TypeScript types from JSDoc. Thanks @tamuratak

### Changed
- **BREAKING**: Includes TypeScript definitions

## [8.0.0] - 2023-10-25

### Changed
- **BREAKING**: Error on unknown worker options (prototype pollution fix)

## [7.0.0] - 2023-10-25

### Changed
- **BREAKING**: Webpack to Rollup (#403). Thanks @KonghaYao

## [6.4.0] - 2023-02-24

### Added
- Transferable objects (#374). Thanks @Michsior14
- onTerminate callback, workerTerminateTimeout (#377). Thanks @Michsior14

## [6.3.0] - 2022-10-24

### Added
- workerThreadOpts option (#357). Thanks @galElmalah

## [6.2.0] - 2022-01-15

### Added
- onCreateWorker, onTerminateWorker callbacks. Thanks @forty

## [6.1.0] - 2021-01-31

### Added
- Worker to main thread events (#227). Thanks @Akryum

## [6.0.4] - 2021-01-16

### Security
- Use new Function instead of eval. Thanks @tjenkinson

## [6.0.0] - 2020-05-13

### Changed
- **BREAKING**: Entry points changed. Thanks @boneskull

## [5.0.0] - 2019-08-25

### Changed
- **BREAKING**: Default workerType changed to thread (#85)

## [4.0.0] - 2019-08-21

### Added
- maxQueueSize option. Thanks @colomboe

### Changed
- **BREAKING**: Webpack 4 bundle changes

## [3.1.0] - 2019-02-17

### Added
- worker_threads support. Thanks @stefanpenner

## [3.0.0] - 2018-12-11

### Changed
- **BREAKING**: ES6 Webpack support, dropped AMD

## [2.3.0] - 2017-09-30

### Added
- Pool.terminate(force, timeout). Thanks @jimsugg

## [2.2.0] - 2016-11-26

### Added
- pool.stats() method (#18)

## [2.1.0] - 2016-10-11

### Added
- Async worker registration, minWorkers option

## [2.0.0] - 2016-09-18

### Changed
- **BREAKING**: Custom Error serialization (#8)

## [1.0.0] - 2014-05-29

### Changed
- Merged Pool.run into Pool.exec

## [0.1.0] - 2014-05-07

### Added
- Node.js and browser support
- Function offloading, worker proxy

## [0.0.1] - 2014-05-02

### Added
- npm module registered
