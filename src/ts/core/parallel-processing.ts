/**
 * Parallel Processing Functions
 *
 * Implements parallel array operations: reduce, forEach, filter,
 * some, every, find, findIndex.
 *
 * These functions execute array operations across multiple workers
 * for improved performance on large datasets.
 */

import type {
  ParallelOptions,
  ReduceOptions,
  FindOptions,
  PredicateOptions,
  ForEachResult,
  ParallelPromise,
  ReducerFn,
  CombinerFn,
  PredicateFn,
  ConsumerFn,
} from '../types/parallel';
import type { BatchTask, BatchResult } from '../types/index';
import { WorkerpoolPromise } from './Promise';
import type { TaskExecutor } from './batch-executor';
import { createBatchExecutor } from './batch-executor';

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Chunk with index tracking
 */
interface IndexedChunk<T> {
  items: T[];
  startIndex: number;
}

/**
 * Filter chunk result
 */
interface FilterChunkResult<T> {
  items: T[];
  indices: number[];
}

/**
 * Find chunk result
 */
interface FindChunkResult<T> {
  found: boolean;
  item?: T;
  index: number;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Split array into chunks with index tracking
 */
function chunkArray<T>(items: T[], chunkSize: number): IndexedChunk<T>[] {
  const chunks: IndexedChunk<T>[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push({
      items: items.slice(i, i + chunkSize),
      startIndex: i,
    });
  }
  return chunks;
}

/**
 * Serialize function to string for worker execution
 */
function serializeFn(fn: Function | string): string {
  return typeof fn === 'function' ? fn.toString() : fn;
}

/**
 * Create a parallel promise from a batch promise
 */
function createParallelPromise<T>(
  promise: WorkerpoolPromise<T, unknown>,
  controls: {
    cancel?: () => void;
    pause?: () => void;
    resume?: () => void;
    isPaused?: () => boolean;
  }
): ParallelPromise<T> {
  const parallelPromise = promise as unknown as ParallelPromise<T>;

  if (controls.cancel) {
    parallelPromise.cancel = function () {
      controls.cancel!();
      return this;
    };
  }

  if (controls.pause) {
    parallelPromise.pause = function () {
      controls.pause!();
      return this;
    };
  }

  if (controls.resume) {
    parallelPromise.resume = function () {
      controls.resume!();
      return this;
    };
  }

  if (controls.isPaused) {
    parallelPromise.isPaused = controls.isPaused;
  }

  return parallelPromise;
}

// =============================================================================
// Parallel Reduce
// =============================================================================

/**
 * Execute a parallel reduce operation
 *
 * @param items - Array of items to reduce
 * @param reducerFn - Reducer function (executed in worker)
 * @param combinerFn - Function to combine partial results
 * @param executor - Task executor function
 * @param options - Reduce options
 * @returns Promise resolving to reduced value
 */
export function createParallelReduce<T, A>(
  items: T[],
  reducerFn: ReducerFn<T, A> | string,
  combinerFn: CombinerFn<A>,
  executor: TaskExecutor<A>,
  options: ReduceOptions<A>
): ParallelPromise<A> {
  const {
    chunkSize = Math.max(1, Math.ceil(items.length / 8)),
    concurrency,
    initialValue,
    ...batchOptions
  } = options;

  const startTime = Date.now();
  const chunks = chunkArray(items, chunkSize);

  // Build worker code for reducing a chunk
  // Note: Each chunk uses its first element as accumulator, then reduces the rest
  // The initialValue is applied only once when combining results
  const reducerStr = serializeFn(reducerFn);
  const chunkReducer = `
    (function(chunk, startIndex, reducerFnStr) {
      var reducerFn = eval('(' + reducerFnStr + ')');
      if (chunk.length === 0) {
        return null;
      }
      var acc = chunk[0];
      for (var i = 1; i < chunk.length; i++) {
        acc = reducerFn(acc, chunk[i], startIndex + i);
      }
      return acc;
    })
  `;

  // Create tasks for each chunk
  const tasks: BatchTask[] = chunks.map((chunk) => ({
    method: chunkReducer,
    params: [chunk.items, chunk.startIndex, reducerStr],
  }));

  // Execute batch
  const batchPromise = createBatchExecutor<A>(tasks, executor, {
    ...batchOptions,
    concurrency: concurrency ?? Infinity,
  });

  // Create result promise that combines partial results
  const { promise, resolve, reject } = WorkerpoolPromise.defer<A>();

  let cancelled = false;

  batchPromise
    .then((result: BatchResult<A>) => {
      if (cancelled) {
        return;
      }

      if (result.failures.length > 0) {
        reject(result.failures[0]);
        return;
      }

      // Combine all partial results
      // Filter out null results from empty chunks
      const validResults = result.successes.filter((r) => r !== null);

      if (validResults.length === 0) {
        resolve(initialValue);
        return;
      }

      // Start with initialValue and combine all chunk results
      let finalValue = initialValue;
      for (const partialResult of validResults) {
        finalValue = combinerFn(finalValue, partialResult);
      }

      resolve(finalValue);
    })
    .catch(reject);

  return createParallelPromise(promise as WorkerpoolPromise<A, unknown>, {
    cancel: () => {
      cancelled = true;
      batchPromise.cancel();
    },
    pause: () => batchPromise.pause(),
    resume: () => batchPromise.resume(),
    isPaused: () => batchPromise.isPaused(),
  });
}

// =============================================================================
// Parallel ForEach
// =============================================================================

/**
 * Execute a parallel forEach operation
 *
 * @param items - Array of items to process
 * @param fn - Consumer function (executed in worker)
 * @param executor - Task executor function
 * @param options - Parallel options
 * @returns Promise resolving to ForEachResult
 */
export function createParallelForEach<T>(
  items: T[],
  fn: ConsumerFn<T> | string,
  executor: TaskExecutor<void>,
  options: ParallelOptions = {}
): ParallelPromise<ForEachResult> {
  const {
    chunkSize = 1,
    concurrency,
    failFast = false,
    ...batchOptions
  } = options;

  const startTime = Date.now();
  const chunks = chunkArray(items, chunkSize);

  // Build worker code for processing a chunk
  const fnStr = serializeFn(fn);
  const chunkProcessor = `
    (function(chunk, startIndex, fnStr) {
      var fn = eval('(' + fnStr + ')');
      for (var i = 0; i < chunk.length; i++) {
        fn(chunk[i], startIndex + i);
      }
    })
  `;

  // Create tasks for each chunk
  const tasks: BatchTask[] = chunks.map((chunk) => ({
    method: chunkProcessor,
    params: [chunk.items, chunk.startIndex, fnStr],
  }));

  // Execute batch
  const batchPromise = createBatchExecutor<void>(tasks, executor, {
    ...batchOptions,
    concurrency: concurrency ?? Infinity,
    failFast,
  });

  // Create result promise
  const { promise, resolve, reject } = WorkerpoolPromise.defer<ForEachResult>();

  let cancelled = false;

  batchPromise
    .then((result: BatchResult<void>) => {
      resolve({
        processed: items.length - result.failureCount * chunkSize,
        duration: Date.now() - startTime,
        cancelled: result.cancelled || cancelled,
        errors: result.failures,
      });
    })
    .catch((err) => {
      reject(err);
    });

  return createParallelPromise(promise as WorkerpoolPromise<ForEachResult, unknown>, {
    cancel: () => {
      cancelled = true;
      batchPromise.cancel();
    },
    pause: () => batchPromise.pause(),
    resume: () => batchPromise.resume(),
    isPaused: () => batchPromise.isPaused(),
  });
}

// =============================================================================
// Parallel Filter
// =============================================================================

/**
 * Execute a parallel filter operation
 *
 * @param items - Array of items to filter
 * @param predicateFn - Predicate function (executed in worker)
 * @param executor - Task executor function
 * @param options - Parallel options
 * @returns Promise resolving to filtered items
 */
export function createParallelFilter<T>(
  items: T[],
  predicateFn: PredicateFn<T> | string,
  executor: TaskExecutor<FilterChunkResult<T>>,
  options: ParallelOptions = {}
): ParallelPromise<T[]> {
  const {
    chunkSize = 1,
    concurrency,
    ...batchOptions
  } = options;

  const startTime = Date.now();
  const chunks = chunkArray(items, chunkSize);

  // Build worker code for filtering a chunk
  const predicateStr = serializeFn(predicateFn);
  const chunkFilter = `
    (function(chunk, startIndex, predicateStr) {
      var predicate = eval('(' + predicateStr + ')');
      var result = { items: [], indices: [] };
      for (var i = 0; i < chunk.length; i++) {
        if (predicate(chunk[i], startIndex + i)) {
          result.items.push(chunk[i]);
          result.indices.push(startIndex + i);
        }
      }
      return result;
    })
  `;

  // Create tasks for each chunk
  const tasks: BatchTask[] = chunks.map((chunk) => ({
    method: chunkFilter,
    params: [chunk.items, chunk.startIndex, predicateStr],
  }));

  // Execute batch
  const batchPromise = createBatchExecutor<FilterChunkResult<T>>(tasks, executor, {
    ...batchOptions,
    concurrency: concurrency ?? Infinity,
  });

  // Create result promise
  const { promise, resolve, reject } = WorkerpoolPromise.defer<T[]>();

  let cancelled = false;

  batchPromise
    .then((result: BatchResult<FilterChunkResult<T>>) => {
      if (result.failures.length > 0 && !cancelled) {
        reject(result.failures[0]);
        return;
      }

      // Combine all filtered items, maintaining order
      const allResults: Array<{ item: T; index: number }> = [];
      for (const chunkResult of result.successes) {
        for (let i = 0; i < chunkResult.items.length; i++) {
          allResults.push({
            item: chunkResult.items[i],
            index: chunkResult.indices[i],
          });
        }
      }

      // Sort by original index to maintain order
      allResults.sort((a, b) => a.index - b.index);

      resolve(allResults.map((r) => r.item));
    })
    .catch(reject);

  return createParallelPromise(promise as WorkerpoolPromise<T[], unknown>, {
    cancel: () => {
      cancelled = true;
      batchPromise.cancel();
    },
    pause: () => batchPromise.pause(),
    resume: () => batchPromise.resume(),
    isPaused: () => batchPromise.isPaused(),
  });
}

// =============================================================================
// Parallel Some
// =============================================================================

/**
 * Execute a parallel some operation
 *
 * @param items - Array of items to test
 * @param predicateFn - Predicate function (executed in worker)
 * @param executor - Task executor function
 * @param options - Predicate options
 * @returns Promise resolving to boolean
 */
export function createParallelSome<T>(
  items: T[],
  predicateFn: PredicateFn<T> | string,
  executor: TaskExecutor<FindChunkResult<T>>,
  options: PredicateOptions = {}
): ParallelPromise<boolean> {
  const {
    chunkSize = 1,
    concurrency,
    shortCircuit = true,
    ...batchOptions
  } = options;

  const startTime = Date.now();
  const chunks = chunkArray(items, chunkSize);

  // Build worker code for testing a chunk
  const predicateStr = serializeFn(predicateFn);
  const chunkTest = `
    (function(chunk, startIndex, predicateStr) {
      var predicate = eval('(' + predicateStr + ')');
      for (var i = 0; i < chunk.length; i++) {
        if (predicate(chunk[i], startIndex + i)) {
          return { found: true, index: startIndex + i };
        }
      }
      return { found: false, index: -1 };
    })
  `;

  // Create tasks for each chunk
  const tasks: BatchTask[] = chunks.map((chunk) => ({
    method: chunkTest,
    params: [chunk.items, chunk.startIndex, predicateStr],
  }));

  // Execute batch
  const batchPromise = createBatchExecutor<FindChunkResult<T>>(tasks, executor, {
    ...batchOptions,
    concurrency: concurrency ?? Infinity,
    failFast: shortCircuit,
  });

  // Create result promise
  const { promise, resolve, reject } = WorkerpoolPromise.defer<boolean>();

  let cancelled = false;
  let foundMatch = false;

  // If short-circuit is enabled, we can cancel as soon as we find a match
  if (shortCircuit) {
    const checkForMatch = (result: BatchResult<FindChunkResult<T>>) => {
      for (const chunkResult of result.successes) {
        if (chunkResult.found) {
          foundMatch = true;
          batchPromise.cancel();
          return true;
        }
      }
      return false;
    };

    // Check results as they complete
    batchOptions.onProgress = (progress) => {
      // onProgress from user is overwritten here for internal use
      // We could chain them but for simplicity just check results
    };
  }

  batchPromise
    .then((result: BatchResult<FindChunkResult<T>>) => {
      if (cancelled && !foundMatch) {
        resolve(false);
        return;
      }

      // Check if any chunk found a match
      for (const chunkResult of result.successes) {
        if (chunkResult.found) {
          resolve(true);
          return;
        }
      }

      resolve(false);
    })
    .catch(reject);

  return createParallelPromise(promise as WorkerpoolPromise<boolean, unknown>, {
    cancel: () => {
      cancelled = true;
      batchPromise.cancel();
    },
    pause: () => batchPromise.pause(),
    resume: () => batchPromise.resume(),
    isPaused: () => batchPromise.isPaused(),
  });
}

// =============================================================================
// Parallel Every
// =============================================================================

/**
 * Execute a parallel every operation
 *
 * @param items - Array of items to test
 * @param predicateFn - Predicate function (executed in worker)
 * @param executor - Task executor function
 * @param options - Predicate options
 * @returns Promise resolving to boolean
 */
export function createParallelEvery<T>(
  items: T[],
  predicateFn: PredicateFn<T> | string,
  executor: TaskExecutor<FindChunkResult<T>>,
  options: PredicateOptions = {}
): ParallelPromise<boolean> {
  const {
    chunkSize = 1,
    concurrency,
    shortCircuit = true,
    ...batchOptions
  } = options;

  // Empty array returns true
  if (items.length === 0) {
    const { promise, resolve } = WorkerpoolPromise.defer<boolean>();
    resolve(true);
    return createParallelPromise(promise as WorkerpoolPromise<boolean, unknown>, {});
  }

  const startTime = Date.now();
  const chunks = chunkArray(items, chunkSize);

  // Build worker code for testing a chunk (find first false)
  const predicateStr = serializeFn(predicateFn);
  const chunkTest = `
    (function(chunk, startIndex, predicateStr) {
      var predicate = eval('(' + predicateStr + ')');
      for (var i = 0; i < chunk.length; i++) {
        if (!predicate(chunk[i], startIndex + i)) {
          return { found: true, index: startIndex + i };
        }
      }
      return { found: false, index: -1 };
    })
  `;

  // Create tasks for each chunk
  const tasks: BatchTask[] = chunks.map((chunk) => ({
    method: chunkTest,
    params: [chunk.items, chunk.startIndex, predicateStr],
  }));

  // Execute batch
  const batchPromise = createBatchExecutor<FindChunkResult<T>>(tasks, executor, {
    ...batchOptions,
    concurrency: concurrency ?? Infinity,
    failFast: shortCircuit,
  });

  // Create result promise
  const { promise, resolve, reject } = WorkerpoolPromise.defer<boolean>();

  let cancelled = false;
  let foundFalse = false;

  batchPromise
    .then((result: BatchResult<FindChunkResult<T>>) => {
      if (cancelled && !foundFalse) {
        resolve(true);
        return;
      }

      // Check if any chunk found a non-matching item
      for (const chunkResult of result.successes) {
        if (chunkResult.found) {
          resolve(false);
          return;
        }
      }

      resolve(true);
    })
    .catch(reject);

  return createParallelPromise(promise as WorkerpoolPromise<boolean, unknown>, {
    cancel: () => {
      cancelled = true;
      foundFalse = true;
      batchPromise.cancel();
    },
    pause: () => batchPromise.pause(),
    resume: () => batchPromise.resume(),
    isPaused: () => batchPromise.isPaused(),
  });
}

// =============================================================================
// Parallel Find
// =============================================================================

/**
 * Execute a parallel find operation
 *
 * @param items - Array of items to search
 * @param predicateFn - Predicate function (executed in worker)
 * @param executor - Task executor function
 * @param options - Find options
 * @returns Promise resolving to found item or undefined
 */
export function createParallelFind<T>(
  items: T[],
  predicateFn: PredicateFn<T> | string,
  executor: TaskExecutor<FindChunkResult<T>>,
  options: FindOptions = {}
): ParallelPromise<T | undefined> {
  const {
    chunkSize = 1,
    concurrency,
    shortCircuit = true,
    ...batchOptions
  } = options;

  const startTime = Date.now();
  const chunks = chunkArray(items, chunkSize);

  // Build worker code for finding in a chunk
  const predicateStr = serializeFn(predicateFn);
  const chunkFind = `
    (function(chunk, startIndex, predicateStr) {
      var predicate = eval('(' + predicateStr + ')');
      for (var i = 0; i < chunk.length; i++) {
        if (predicate(chunk[i], startIndex + i)) {
          return { found: true, item: chunk[i], index: startIndex + i };
        }
      }
      return { found: false, index: -1 };
    })
  `;

  // Create tasks for each chunk
  const tasks: BatchTask[] = chunks.map((chunk) => ({
    method: chunkFind,
    params: [chunk.items, chunk.startIndex, predicateStr],
  }));

  // Execute batch
  const batchPromise = createBatchExecutor<FindChunkResult<T>>(tasks, executor, {
    ...batchOptions,
    concurrency: concurrency ?? Infinity,
    failFast: shortCircuit,
  });

  // Create result promise
  const { promise, resolve, reject } = WorkerpoolPromise.defer<T | undefined>();

  let cancelled = false;

  batchPromise
    .then((result: BatchResult<FindChunkResult<T>>) => {
      if (result.failures.length > 0 && !cancelled) {
        reject(result.failures[0]);
        return;
      }

      // Find the match with the lowest index (earliest in original array)
      let bestMatch: FindChunkResult<T> | null = null;

      for (const chunkResult of result.successes) {
        if (chunkResult.found) {
          if (!bestMatch || chunkResult.index < bestMatch.index) {
            bestMatch = chunkResult;
          }
        }
      }

      resolve(bestMatch?.item);
    })
    .catch(reject);

  return createParallelPromise(promise as WorkerpoolPromise<T | undefined, unknown>, {
    cancel: () => {
      cancelled = true;
      batchPromise.cancel();
    },
    pause: () => batchPromise.pause(),
    resume: () => batchPromise.resume(),
    isPaused: () => batchPromise.isPaused(),
  });
}

// =============================================================================
// Parallel FindIndex
// =============================================================================

/**
 * Execute a parallel findIndex operation
 *
 * @param items - Array of items to search
 * @param predicateFn - Predicate function (executed in worker)
 * @param executor - Task executor function
 * @param options - Find options
 * @returns Promise resolving to index or -1
 */
export function createParallelFindIndex<T>(
  items: T[],
  predicateFn: PredicateFn<T> | string,
  executor: TaskExecutor<FindChunkResult<T>>,
  options: FindOptions = {}
): ParallelPromise<number> {
  const {
    chunkSize = 1,
    concurrency,
    shortCircuit = true,
    ...batchOptions
  } = options;

  const startTime = Date.now();
  const chunks = chunkArray(items, chunkSize);

  // Build worker code for finding in a chunk
  const predicateStr = serializeFn(predicateFn);
  const chunkFind = `
    (function(chunk, startIndex, predicateStr) {
      var predicate = eval('(' + predicateStr + ')');
      for (var i = 0; i < chunk.length; i++) {
        if (predicate(chunk[i], startIndex + i)) {
          return { found: true, index: startIndex + i };
        }
      }
      return { found: false, index: -1 };
    })
  `;

  // Create tasks for each chunk
  const tasks: BatchTask[] = chunks.map((chunk) => ({
    method: chunkFind,
    params: [chunk.items, chunk.startIndex, predicateStr],
  }));

  // Execute batch
  const batchPromise = createBatchExecutor<FindChunkResult<T>>(tasks, executor, {
    ...batchOptions,
    concurrency: concurrency ?? Infinity,
    failFast: shortCircuit,
  });

  // Create result promise
  const { promise, resolve, reject } = WorkerpoolPromise.defer<number>();

  let cancelled = false;

  batchPromise
    .then((result: BatchResult<FindChunkResult<T>>) => {
      if (result.failures.length > 0 && !cancelled) {
        reject(result.failures[0]);
        return;
      }

      // Find the match with the lowest index
      let lowestIndex = -1;

      for (const chunkResult of result.successes) {
        if (chunkResult.found) {
          if (lowestIndex === -1 || chunkResult.index < lowestIndex) {
            lowestIndex = chunkResult.index;
          }
        }
      }

      resolve(lowestIndex);
    })
    .catch(reject);

  return createParallelPromise(promise as WorkerpoolPromise<number, unknown>, {
    cancel: () => {
      cancelled = true;
      batchPromise.cancel();
    },
    pause: () => batchPromise.pause(),
    resume: () => batchPromise.resume(),
    isPaused: () => batchPromise.isPaused(),
  });
}

// =============================================================================
// Export All
// =============================================================================

export default {
  createParallelReduce,
  createParallelForEach,
  createParallelFilter,
  createParallelSome,
  createParallelEvery,
  createParallelFind,
  createParallelFindIndex,
};
