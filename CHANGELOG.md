# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This is a fork of [josdejong/workerpool](https://github.com/josdejong/workerpool).

## [Unreleased]

### Added
- TypeScript Build Infrastructure (tsconfig.json, tsconfig.build.json, rollup plugin)
- Core Type Definitions in src/types/
- Platform Module in src/platform/ (environment.ts, transfer.ts)
- Core Module in src/core/ (Promise.ts, TaskQueue.ts, Pool.ts, WorkerHandler.ts, etc.)
- AssemblyScript WASM Module in assembly/
- WASM JavaScript Bridge in src/wasm/
- Queue Factory with fifo, lifo, priority, wasm, auto strategies
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
- Updated package.json and rollup.config.mjs for TypeScript

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
