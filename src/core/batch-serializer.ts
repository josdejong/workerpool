/**
 * Batch Serializer
 *
 * Efficient serialization of batch tasks for worker communication.
 * Packs multiple task requests into compact transfer format.
 */

import type { BatchTask, ExecOptions } from '../types';

/**
 * Serialized task in compact format
 */
export interface SerializedTask {
  /** Task index in batch */
  i: number;
  /** Method name or serialized function */
  m: string;
  /** Parameters */
  p: unknown[];
  /** Has transfer list */
  t?: boolean;
}

/**
 * Serialized batch message
 */
export interface SerializedBatch {
  /** Batch identifier */
  batchId: string;
  /** Serialized tasks */
  tasks: SerializedTask[];
  /** Total task count (may differ from tasks.length if chunked) */
  total: number;
  /** Chunk index (for large batches) */
  chunk?: number;
  /** Total chunks */
  chunks?: number;
}

/**
 * Batch task result from worker
 */
export interface SerializedTaskResult {
  /** Task index */
  i: number;
  /** Success flag */
  s: boolean;
  /** Result value (if success) */
  r?: unknown;
  /** Error message (if failed) */
  e?: string;
  /** Error stack (if failed) */
  st?: string;
  /** Execution duration in ms */
  d: number;
}

/**
 * Serialized batch result from worker
 */
export interface SerializedBatchResult {
  /** Batch identifier */
  batchId: string;
  /** Task results */
  results: SerializedTaskResult[];
  /** Chunk index (for large batches) */
  chunk?: number;
}

/**
 * Configuration for batch serialization
 */
export interface SerializerConfig {
  /** Maximum tasks per chunk (default: 1000) */
  maxChunkSize?: number;
  /** Whether to serialize functions (default: true) */
  serializeFunctions?: boolean;
  /** Custom serializer for complex objects */
  customSerializer?: (value: unknown) => unknown;
}

const DEFAULT_CHUNK_SIZE = 1000;

/**
 * Generate unique batch ID
 */
export function generateBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Serialize a function to string for transfer
 */
export function serializeFunction(fn: Function): string {
  const fnStr = fn.toString();

  // Check if it's an arrow function, regular function, or method shorthand
  if (fnStr.startsWith('function') || fnStr.startsWith('(') || fnStr.startsWith('async')) {
    return fnStr;
  }

  // Method shorthand: name() {} -> function name() {}
  const match = fnStr.match(/^(\w+)\s*\(/);
  if (match) {
    return `function ${fnStr}`;
  }

  return fnStr;
}

/**
 * Serialize batch tasks into compact format
 *
 * @param tasks - Tasks to serialize
 * @param config - Serialization configuration
 * @returns Serialized batch(es)
 */
export function serializeBatch(
  tasks: BatchTask[],
  config: SerializerConfig = {}
): SerializedBatch[] {
  const {
    maxChunkSize = DEFAULT_CHUNK_SIZE,
    serializeFunctions = true,
    customSerializer,
  } = config;

  const batchId = generateBatchId();
  const totalTasks = tasks.length;
  const chunks: SerializedBatch[] = [];

  // Split into chunks if needed
  const numChunks = Math.ceil(totalTasks / maxChunkSize);

  for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
    const start = chunkIndex * maxChunkSize;
    const end = Math.min(start + maxChunkSize, totalTasks);
    const chunkTasks = tasks.slice(start, end);

    const serializedTasks: SerializedTask[] = chunkTasks.map((task, localIndex) => {
      const globalIndex = start + localIndex;

      // Serialize method
      let method: string;
      if (typeof task.method === 'function') {
        method = serializeFunctions ? serializeFunction(task.method) : '__function__';
      } else {
        method = task.method;
      }

      // Serialize parameters
      let params = task.params;
      if (customSerializer) {
        params = params.map((p) => customSerializer(p));
      }

      const serialized: SerializedTask = {
        i: globalIndex,
        m: method,
        p: params,
      };

      // Mark if has transfer list
      if (task.options?.transfer && task.options.transfer.length > 0) {
        serialized.t = true;
      }

      return serialized;
    });

    const batch: SerializedBatch = {
      batchId,
      tasks: serializedTasks,
      total: totalTasks,
    };

    if (numChunks > 1) {
      batch.chunk = chunkIndex;
      batch.chunks = numChunks;
    }

    chunks.push(batch);
  }

  return chunks;
}

/**
 * Deserialize batch tasks (in worker)
 *
 * @param batch - Serialized batch
 * @returns Deserialized tasks with indices
 */
export function deserializeBatch(
  batch: SerializedBatch
): Array<{ index: number; method: string | Function; params: unknown[] }> {
  return batch.tasks.map((task) => {
    let method: string | Function = task.m;

    // Try to reconstruct function if it looks like one
    if (
      task.m.startsWith('function') ||
      task.m.startsWith('(') ||
      task.m.startsWith('async')
    ) {
      try {
        // Use Function constructor to recreate function
        // eslint-disable-next-line no-new-func
        method = new Function(`return (${task.m})`)();
      } catch {
        // Keep as string if reconstruction fails
        method = task.m;
      }
    }

    return {
      index: task.i,
      method,
      params: task.p,
    };
  });
}

/**
 * Serialize task result (in worker)
 *
 * @param index - Task index
 * @param success - Whether task succeeded
 * @param result - Result value or error
 * @param duration - Execution duration in ms
 * @returns Serialized result
 */
export function serializeTaskResult(
  index: number,
  success: boolean,
  result: unknown,
  duration: number
): SerializedTaskResult {
  const serialized: SerializedTaskResult = {
    i: index,
    s: success,
    d: duration,
  };

  if (success) {
    serialized.r = result;
  } else {
    const error = result as Error;
    serialized.e = error.message || String(error);
    if (error.stack) {
      serialized.st = error.stack;
    }
  }

  return serialized;
}

/**
 * Deserialize task results (in main thread)
 *
 * @param results - Serialized results
 * @returns Deserialized results
 */
export function deserializeTaskResults(
  results: SerializedTaskResult[]
): Array<{
  index: number;
  success: boolean;
  result?: unknown;
  error?: Error;
  duration: number;
}> {
  return results.map((r) => {
    const deserialized: {
      index: number;
      success: boolean;
      result?: unknown;
      error?: Error;
      duration: number;
    } = {
      index: r.i,
      success: r.s,
      duration: r.d,
    };

    if (r.s) {
      deserialized.result = r.r;
    } else {
      const error = new Error(r.e || 'Unknown error');
      if (r.st) {
        error.stack = r.st;
      }
      deserialized.error = error;
    }

    return deserialized;
  });
}

/**
 * Estimate serialized size of batch
 *
 * @param tasks - Tasks to estimate
 * @returns Estimated size in bytes
 */
export function estimateBatchSize(tasks: BatchTask[]): number {
  let size = 0;

  for (const task of tasks) {
    // Method name or function
    if (typeof task.method === 'function') {
      size += task.method.toString().length * 2; // UTF-16
    } else {
      size += task.method.length * 2;
    }

    // Parameters (rough estimate via JSON)
    try {
      size += JSON.stringify(task.params).length * 2;
    } catch {
      // Circular reference or non-serializable - estimate
      size += 1024;
    }
  }

  // Overhead for structure
  size += tasks.length * 50;

  return size;
}

/**
 * Collect transfer lists from batch tasks
 *
 * @param tasks - Batch tasks
 * @returns Combined transfer list
 */
export function collectTransferables(tasks: BatchTask[]): Transferable[] {
  const transferables: Transferable[] = [];
  const seen = new Set<Transferable>();

  for (const task of tasks) {
    if (task.options?.transfer) {
      for (const t of task.options.transfer) {
        if (!seen.has(t)) {
          seen.add(t);
          transferables.push(t);
        }
      }
    }
  }

  return transferables;
}

/**
 * Create a batch result aggregator
 */
export function createBatchAggregator(totalTasks: number) {
  const results: Map<number, SerializedTaskResult> = new Map();
  let completed = 0;

  return {
    /**
     * Add results from a chunk
     */
    addResults(chunkResults: SerializedTaskResult[]): void {
      for (const result of chunkResults) {
        if (!results.has(result.i)) {
          results.set(result.i, result);
          completed++;
        }
      }
    },

    /**
     * Check if all results received
     */
    isComplete(): boolean {
      return completed >= totalTasks;
    },

    /**
     * Get completion count
     */
    getCompleted(): number {
      return completed;
    },

    /**
     * Get all results in order
     */
    getResults(): SerializedTaskResult[] {
      const ordered: SerializedTaskResult[] = [];
      for (let i = 0; i < totalTasks; i++) {
        const result = results.get(i);
        if (result) {
          ordered.push(result);
        }
      }
      return ordered;
    },

    /**
     * Get results received so far (for partial results)
     */
    getPartialResults(): SerializedTaskResult[] {
      return Array.from(results.values()).sort((a, b) => a.i - b.i);
    },
  };
}

export default {
  generateBatchId,
  serializeFunction,
  serializeBatch,
  deserializeBatch,
  serializeTaskResult,
  deserializeTaskResults,
  estimateBatchSize,
  collectTransferables,
  createBatchAggregator,
};
