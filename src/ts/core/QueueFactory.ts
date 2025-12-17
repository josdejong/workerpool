/**
 * Queue Strategy Factory
 *
 * Creates task queues based on strategy configuration.
 * Supports JavaScript queues (FIFO, LIFO, Priority) and WASM-backed queues
 * with automatic fallback when WASM is unavailable.
 */

import type { TaskQueue, QueueStrategy, Task } from '../types/index';
import { FIFOQueue, LIFOQueue, PriorityQueue } from './TaskQueue';
import {
  detectWASMFeatures,
  getRecommendedQueueType,
  warnIfWASMUnavailable,
} from '../wasm/feature-detection';

/**
 * Extended queue strategy types including WASM options
 */
export type ExtendedQueueStrategy =
  | QueueStrategy
  | 'priority'
  | 'wasm'
  | 'wasm-fallback'
  | 'auto';

/**
 * Priority comparator type (same as used by PriorityQueue)
 */
export type PriorityComparator<T> = (a: Task<T>, b: Task<T>) => number;

/**
 * Options for queue creation
 */
export interface QueueFactoryOptions<T = unknown> {
  /** Queue strategy to use */
  strategy?: ExtendedQueueStrategy;
  /** Initial capacity for the queue */
  capacity?: number;
  /** Priority comparator for priority queue */
  comparator?: PriorityComparator<T>;
  /** Pre-loaded WASM bytes (optional) */
  wasmBytes?: ArrayBuffer | Uint8Array;
  /** URL to WASM module (optional) */
  wasmUrl?: string;
  /** Log warning when falling back from WASM */
  warnOnFallback?: boolean;
}

/**
 * Queue factory result
 */
export interface QueueFactoryResult<T = unknown> {
  /** The created queue */
  queue: TaskQueue<T>;
  /** The actual strategy used (may differ from requested if fallback occurred) */
  actualStrategy: ExtendedQueueStrategy;
  /** Whether a fallback occurred */
  isFallback: boolean;
  /** Reason for fallback (if any) */
  fallbackReason?: string;
}

/**
 * Create a task queue based on strategy
 *
 * @param options - Queue creation options
 * @returns Created queue and metadata
 */
export function createQueueSync<T = unknown>(
  options: QueueFactoryOptions<T> = {}
): QueueFactoryResult<T> {
  const {
    strategy = 'fifo',
    capacity = 1024,
    comparator,
    warnOnFallback = true,
  } = options;

  // Handle 'auto' strategy
  if (strategy === 'auto') {
    const recommended = getRecommendedQueueType();
    if (recommended === 'wasm') {
      // WASM requires async initialization, fall back to FIFO for sync
      return {
        queue: new FIFOQueue<T>(capacity),
        actualStrategy: 'fifo',
        isFallback: true,
        fallbackReason: 'WASM queue requires async initialization',
      };
    }
    return createQueueSync({ ...options, strategy: recommended });
  }

  // Handle WASM strategies (require async initialization)
  if (strategy === 'wasm' || strategy === 'wasm-fallback') {
    const features = detectWASMFeatures();

    if (!features.allFeaturesAvailable) {
      if (strategy === 'wasm') {
        throw new Error(
          `WASM queue unavailable: ${features.unavailableReason}`
        );
      }

      // wasm-fallback: fall back to FIFO
      if (warnOnFallback) {
        warnIfWASMUnavailable();
      }

      return {
        queue: new FIFOQueue<T>(capacity),
        actualStrategy: 'fifo',
        isFallback: true,
        fallbackReason: features.unavailableReason,
      };
    }

    // WASM requires async initialization
    throw new Error(
      'WASM queue requires async initialization. Use createQueue() instead of createQueueSync().'
    );
  }

  // JavaScript queue strategies
  switch (strategy) {
    case 'fifo':
      return {
        queue: new FIFOQueue<T>(capacity),
        actualStrategy: 'fifo',
        isFallback: false,
      };

    case 'lifo':
      return {
        queue: new LIFOQueue<T>(),
        actualStrategy: 'lifo',
        isFallback: false,
      };

    case 'priority':
      return {
        queue: new PriorityQueue<T>(comparator),
        actualStrategy: 'priority',
        isFallback: false,
      };

    default:
      throw new Error(`Unknown queue strategy: ${strategy}`);
  }
}

/**
 * Create a task queue asynchronously (required for WASM queues)
 *
 * @param options - Queue creation options
 * @returns Promise resolving to created queue and metadata
 */
export async function createQueue<T = unknown>(
  options: QueueFactoryOptions<T> = {}
): Promise<QueueFactoryResult<T>> {
  const {
    strategy = 'fifo',
    capacity = 1024,
    comparator,
    wasmBytes,
    wasmUrl,
    warnOnFallback = true,
  } = options;

  // Handle 'auto' strategy
  if (strategy === 'auto') {
    const recommended = getRecommendedQueueType();
    return createQueue({ ...options, strategy: recommended });
  }

  // Handle WASM strategies
  if (strategy === 'wasm' || strategy === 'wasm-fallback') {
    const features = detectWASMFeatures();

    if (!features.allFeaturesAvailable) {
      if (strategy === 'wasm') {
        throw new Error(
          `WASM queue unavailable: ${features.unavailableReason}`
        );
      }

      // wasm-fallback: fall back to FIFO
      if (warnOnFallback) {
        warnIfWASMUnavailable();
      }

      return {
        queue: new FIFOQueue<T>(capacity),
        actualStrategy: 'fifo',
        isFallback: true,
        fallbackReason: features.unavailableReason,
      };
    }

    // Import WASM module dynamically to avoid loading when not needed
    const { WASMTaskQueue } = await import('../wasm/WasmTaskQueue');

    try {
      const queue = await WASMTaskQueue.create<T>({
        capacity,
        wasmBytes,
        wasmUrl,
      });

      return {
        queue,
        actualStrategy: 'wasm',
        isFallback: false,
      };
    } catch (error) {
      if (strategy === 'wasm') {
        throw error;
      }

      // wasm-fallback: fall back to FIFO on error
      if (warnOnFallback) {
        console.warn(
          `[workerpool] WASM queue initialization failed: ${error}. Falling back to FIFO.`
        );
      }

      return {
        queue: new FIFOQueue<T>(capacity),
        actualStrategy: 'fifo',
        isFallback: true,
        fallbackReason: String(error),
      };
    }
  }

  // JavaScript queue strategies (same as sync version)
  return createQueueSync(options);
}

/**
 * Create a queue from strategy specification (for Pool options compatibility)
 *
 * @param strategyOrQueue - Strategy string or custom queue instance
 * @param capacity - Queue capacity (for built-in strategies)
 */
export function resolveQueueStrategy<T = unknown>(
  strategyOrQueue: QueueStrategy | ExtendedQueueStrategy | TaskQueue<T>,
  capacity = 1024
): TaskQueue<T> {
  // If already a queue instance, return it
  if (typeof strategyOrQueue === 'object' && strategyOrQueue !== null) {
    return strategyOrQueue;
  }

  // Create queue from strategy string
  const result = createQueueSync<T>({
    strategy: strategyOrQueue as ExtendedQueueStrategy,
    capacity,
    warnOnFallback: true,
  });

  return result.queue;
}

/**
 * Export queue classes for direct use
 */
export { FIFOQueue, LIFOQueue, PriorityQueue };
