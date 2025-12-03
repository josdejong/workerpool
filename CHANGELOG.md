# Changelog

All notable changes to the v11.0.0 TypeScript + WASM refactoring will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For historical changes prior to v11.0.0, see [HISTORY.md](./HISTORY.md).

## [Unreleased]

### Added
- **TypeScript Build Infrastructure**
  - `tsconfig.json` with ES2020 target, strict mode, CommonJS module
  - `tsconfig.build.json` for production declaration file generation
  - `@rollup/plugin-typescript` integration in rollup.config.mjs
  - New `npm run typecheck` script for type checking without emit

- **Core Type Definitions** (`src/types/`)
  - `index.ts` - Public API types: WorkerType, QueueStrategy, PoolOptions, ExecOptions, PoolStats, Task, Resolver, WorkerpoolPromise, WorkerProxy, TransferDescriptor
  - `internal.ts` - Internal types: WorkerState enum, InternalTask, WorkerInfo, SerializedError, PlatformInfo
  - `messages.ts` - IPC message protocol with discriminated unions and type guards

- **Platform Module** (`src/platform/`)
  - `environment.ts` - Platform detection (Node.js vs browser), feature detection (worker_threads, SharedArrayBuffer, Atomics), CPU count detection
  - `transfer.ts` - Transfer<T> class for zero-copy data transfer with static helper methods (isTransfer, isTransferable, findTransferables)

- **Core Module** (`src/core/`)
  - `Promise.ts` - WorkerpoolPromise<T, E> with full generic support, cancel/timeout propagation, CancellationError/TimeoutError classes
  - `TaskQueue.ts` - FIFOQueue (circular buffer O(1)), LIFOQueue (stack), PriorityQueue (binary heap), createQueue factory
  - `validateOptions.ts` - Option validation with type guards for pool, worker, fork, and exec options
  - `Pool.ts` - Worker pool manager with generic exec<T>(), proxy<T>(), task queue orchestration
  - `WorkerHandler.ts` - Worker lifecycle management for browser/thread/process backends
  - `debug-port-allocator.ts` - Debug port allocation for worker processes

- **Worker Module** (`src/workers/`)
  - `worker.ts` - Worker-side message handler with typed method registry

- **Entry Point**
  - `src/index.ts` - Unified entry point exporting all public APIs (ready but not yet activated in build)

- Sprint planning documentation in `docs/planning/`
- Claude Code configuration (`CLAUDE.md`, `.claude/settings.local.json`)

- **AssemblyScript WASM Module** (`assembly/`)
  - `memory.ts` - Memory layout with header, ring buffer, task slots; atomic load/store operations
  - `ring-buffer.ts` - Lock-free SPMC queue using CAS for thread-safe push/pop
  - `task-slots.ts` - Task slot allocator with atomic free list, reference counting
  - `index.ts` - Module entry point exporting all WASM APIs

- **WASM JavaScript Bridge** (`src/wasm/`)
  - `WasmLoader.ts` - WASM module loading with streaming compilation, SharedArrayBuffer support
  - `WasmBridge.ts` - High-level TypeScript API for queue operations, slot management
  - `WasmTaskQueue.ts` - TaskQueue implementation backed by WASM ring buffer
  - `feature-detection.ts` - WASM feature detection and fallback recommendations
  - `index.ts` - Public WASM API exports

- **Queue Factory** (`src/core/QueueFactory.ts`)
  - Unified queue creation with 'fifo', 'lifo', 'priority', 'wasm', 'auto' strategies
  - Automatic fallback from WASM to JS when features unavailable
  - Sync and async creation methods

### Changed
- Updated `package.json` with TypeScript build dependencies and scripts
- Updated `rollup.config.mjs` with TypeScript plugin configuration

### Infrastructure
- **Phase 1, Sprint 4: High-Performance Task Queue - IN PROGRESS**
  - Task 25: Lock-free queue protocol specification (LOCK_FREE_QUEUE_PROTOCOL.md)
  - Task 26: WASMTaskQueue class implementing TaskQueue interface
  - Task 29: Queue strategy factory with 'fifo', 'lifo', 'priority', 'wasm', 'auto' strategies
  - Task 31: Feature detection and graceful fallback to JS queues
  - Remaining: WASM priority queue, work-stealing, benchmarks, integration tests

- **Phase 1, Sprint 3: AssemblyScript Infrastructure - COMPLETED**
  - Task 17: Setup AssemblyScript toolchain (`asconfig.json`, npm scripts)
  - Task 18: Create WASM memory management utilities (`assembly/memory.ts`)
  - Task 19: Implement ring buffer in AssemblyScript (`assembly/ring-buffer.ts`)
  - Task 20: Create WASM module loader abstraction (`src/wasm/WasmLoader.ts`)
  - Task 21: Implement task slot allocator in WASM (`assembly/task-slots.ts`)
  - Task 22: Create JS/WASM bridge utilities (`src/wasm/WasmBridge.ts`)
  - Task 23: WASM module unit tests (`test/wasm.test.js`)
  - WASM module compiles (5.7KB optimized, uses SharedArrayBuffer + Atomics)
  - Lock-free ring buffer with O(1) push/pop operations
  - Task slot allocator with free list for O(1) allocation/deallocation

- **Phase 1, Sprint 2: Core Module Conversion - COMPLETED**
  - Task 9: Define IPC message protocol types (messages.ts)
  - Task 10: Convert WorkerHandler.ts with browser/thread/process backends
  - Task 11: Convert worker.ts with typed message handling
  - Task 12: Convert Pool.ts with generic exec<T>() and proxy<T>()
  - Task 13: Convert debug-port-allocator.ts
  - Task 14: Create unified index.ts entry point
  - Task 15: Update Rollup config with TypeScript entry points (commented for future switch)
  - All type checks pass (`tsc --noEmit`)
  - Build uses original JS files until abort handler test flakiness is resolved

- **Phase 1, Sprint 1: TypeScript Foundation - COMPLETED**
  - Task 1: Setup TypeScript build infrastructure
  - Task 2: Define core type definitions
  - Task 3: Convert environment.ts to TypeScript
  - Task 4: Convert Promise.ts with generics
  - Task 5: Convert queues.ts with generics (TaskQueue.ts)
  - Task 6: Convert transfer.ts to TypeScript
  - Task 7: Convert validateOptions.ts to TypeScript
  - All type checks pass (`tsc --noEmit`)
  - 131 existing tests pass (4 pre-existing timeout failures unrelated to TypeScript changes)

## [11.0.0] - TBD

### Planned Features (Phase 1)
- Full TypeScript rewrite with strict typing
- AssemblyScript/WASM acceleration for task queues
- Lock-free ring buffers using SharedArrayBuffer
- Worker pre-warming and adaptive scaling
- Zero-copy data transfer
- Batch operations with SIMD support
- Comprehensive API documentation

See [PHASE_1_REFACTORING_PLAN.md](./docs/planning/PHASE_1_REFACTORING_PLAN.md) for details.
