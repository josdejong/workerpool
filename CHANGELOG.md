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

- Sprint planning documentation in `docs/planning/`
- Claude Code configuration (`CLAUDE.md`, `.claude/settings.local.json`)

### Changed
- Updated `package.json` with TypeScript build dependencies and scripts
- Updated `rollup.config.mjs` with TypeScript plugin configuration

### Infrastructure
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
