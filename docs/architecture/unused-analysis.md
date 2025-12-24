# Unused Files and Exports Analysis

**Generated**: 2025-12-24

## Summary

- **Potentially unused files**: 12
- **Potentially unused exports**: 123

## Potentially Unused Files

These files are not imported by any other file in the codebase:

- `src/ts/assembly/binary-protocol.ts`
- `src/ts/assembly/hash-map.ts`
- `src/ts/assembly/k-way-merge.ts`
- `src/ts/assembly/stubs/hash-map.ts`
- `src/ts/assembly/stubs/k-way-merge.ts`
- `src/ts/core/auto-transfer.ts`
- `src/ts/core/function-cache.ts`
- `src/ts/core/k-way-merge.ts`
- `src/ts/core/simd-processor.ts`
- `src/ts/core/worker-bitmap.ts`
- `src/ts/generated/embeddedWasm.ts`
- `src/ts/generated/wasmTypes.ts`

## Potentially Unused Exports

These exports are not imported by any other file in the codebase:

### `src/ts/assembly/stubs/binary-protocol.ts`

- `MSG_EVENT` (constant)
- `MSG_CLEANUP_REQ` (constant)
- `MSG_CLEANUP_RES` (constant)
- `MSG_TERMINATE` (constant)
- `MSG_STREAM_CHUNK` (constant)
- `FLAG_ENCRYPTED` (constant)
- `FLAG_FINAL` (constant)
- `FLAG_ACK_REQUIRED` (constant)
- `ERR_WORKER_CRASHED` (constant)
- `ERR_WORKER_UNRESPONSIVE` (constant)
- `ERR_INVALID_PARAMS` (constant)
- `ERR_EXECUTION_FAILED` (constant)

### `src/ts/core/batch-executor.ts`

- `executeBatchSimple` (function)

### `src/ts/core/batch-serializer.ts`

- `SerializedTask` (interface)
- `SerializedBatch` (interface)
- `SerializedTaskResult` (interface)
- `SerializedBatchResult` (interface)
- `SerializerConfig` (interface)

### `src/ts/core/heartbeat.ts`

- `HeartbeatConfig` (interface)
- `HeartbeatStats` (interface)

### `src/ts/core/metrics.ts`

- `HistogramBucket` (interface)

### `src/ts/core/Pool.ts`

- `DataTransferStrategy` (type)
- `MemoryPressureAction` (type)
- `CircuitState` (type)

### `src/ts/core/TaskQueue.ts`

- `PriorityQueue` (class)
- `PriorityComparator` (type)

### `src/ts/core/validateOptions.ts`

- `validatePoolOptions` (function)
- `validateForkOptions` (function)
- `validateWorkerThreadOptions` (function)
- `validateWorkerOptions` (function)
- `validateExecOptions` (function)
- `WorkerOptsName` (type)
- `ForkOptsName` (type)
- `WorkerThreadOptsName` (type)
- `PoolOptsName` (type)
- `ExecOptsName` (type)
- `poolOptsNames` (constant)
- `execOptsNames` (constant)

### `src/ts/core/work-stealing.ts`

- `WorkStealingSchedulerOptions` (interface)

### `src/ts/core/WorkerHandler.ts`

- `TERMINATE_METHOD_ID` (constant)
- `CLEANUP_METHOD_ID` (constant)
- `_tryRequireWorkerThreads` (constant)
- `_setupProcessWorker` (constant)
- `_setupBrowserWorker` (constant)
- `_setupWorkerThreadWorker` (constant)

### `src/ts/debug.ts`

- `DebugConfig` (interface)
- `PerfEntry` (interface)
- `LogHandler` (type)

### `src/ts/platform/channel-factory.ts`

- `getSharedMemoryUnavailableReason` (function)
- `createMessageChannel` (function)
- `createSharedMemoryChannel` (function)
- `createChannelPair` (function)
- `SharedMemoryChannelWrapper` (class)
- `InstrumentedChannel` (class)
- `IChannel` (interface)
- `SendResult` (interface)
- `ChannelFactoryOptions` (interface)
- `ChannelPair` (interface)
- `ChannelStats` (interface)

### `src/ts/platform/message-batcher.ts`

- `MessageUnbatcher` (class)
- `BatcherConfig` (interface)
- `BatchedMessage` (interface)
- `MessageBatch` (interface)
- `BatchStats` (interface)
- `BatchSendCallback` (type)

### `src/ts/platform/result-stream.ts`

- `StreamChunk` (interface)
- `StreamProgress` (interface)
- `StreamCallbacks` (interface)
- `StreamConfig` (interface)

### `src/ts/platform/shared-memory.ts`

- `SendResult` (interface)

### `src/ts/platform/structured-clone.ts`

- `CloneOptimization` (interface)
- `CloneOptions` (interface)

### `src/ts/platform/transfer-detection.ts`

- `getTransferableSize` (function)
- `createTransferList` (function)
- `hasTransferables` (function)
- `getTransferHint` (function)
- `DetectedTransferable` (interface)
- `DetectionResult` (interface)
- `DetectionConfig` (interface)
- `ValidationResult` (interface)
- `TransferHint` (interface)

### `src/ts/platform/transfer.ts`

- `TransferableObject` (type)
- `TypedArrayConstructor` (type)
- `TypedArray` (type)

### `src/ts/types/index.ts`

- `WebWorkerOptions` (interface)
- `WorkerRegisterOptions` (interface)
- `AffinityHint` (interface)
- `ExecOptionsWithAffinity` (interface)
- `PoolOptionsExtended` (interface)
- `PoolMetricsSnapshot` (interface)
- `BatchTaskResult` (interface)
- `MapProgress` (interface)
- `WorkerType` (type)

### `src/ts/wasm/EmbeddedWasmLoader.ts`

- `isSharedMemorySupported` (function)
- `loadWasmFromBytes` (function)
- `loadWasmFromBytesSync` (function)
- `calculateMemoryPages` (function)

### `src/ts/wasm/feature-detection.ts`

- `detectWASMFeatures` (function)
- `WASMFeatureStatus` (interface)

### `src/ts/wasm/simd-processor.ts`

- `SIMDProcessor` (interface)
- `SIMDOperation` (type)
- `ReduceOperation` (type)

### `src/ts/wasm/WasmBridge.ts`

- `TaskMetadata` (interface)
- `QueueEntry` (interface)
- `QueueStats` (interface)

### `src/ts/wasm/WasmTaskQueue.ts`

- `WASMTaskQueueOptions` (interface)

### `src/ts/wasm/WasmWorkerTemplate.ts`

- `WasmWorkerInitOptions` (interface)
- `WasmWorkerConfig` (interface)

### `src/ts/workers/adaptive-scaler.ts`

- `ScaleDecision` (interface)
- `ScalingThresholds` (interface)
- `AdaptiveScalerOptions` (interface)

### `src/ts/workers/affinity.ts`

- `AffinityHint` (interface)
- `AffinityMapping` (interface)
- `WorkerAffinityOptions` (interface)
- `AffinityStats` (interface)

### `src/ts/workers/health-monitor.ts`

- `WorkerHealthCheck` (interface)
- `HealthMonitorOptions` (interface)

### `src/ts/workers/recycler.ts`

- `RecycleCandidate` (interface)
- `IdleRecyclerOptions` (interface)

### `src/ts/workers/worker.ts`

- `PublicWorkerAPI` (interface)

### `src/ts/workers/WorkerCache.ts`

- `CachedWorker` (interface)
- `WorkerCacheOptions` (interface)
- `WorkerCacheStats` (interface)

