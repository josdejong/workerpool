/**
 * Parallel Processing Types
 *
 * Type definitions for parallel array operations: map, reduce, forEach,
 * filter, some, every, find, findIndex.
 */

import type { ExecOptions, WorkerpoolPromise } from './core';
import type { BatchOptions, BatchProgress } from './index';

// =============================================================================
// Parallel Processing Options
// =============================================================================

/**
 * Base options for parallel processing operations
 */
export interface ParallelOptions extends Omit<BatchOptions, 'onProgress'> {
  /**
   * Number of items to process per worker task.
   * Larger chunks reduce overhead but may cause uneven distribution.
   * @default 1 (one item per task for maximum parallelism)
   */
  chunkSize?: number;

  /**
   * Progress callback for the operation.
   */
  onProgress?: (progress: BatchProgress) => void;
}

/**
 * Options for reduce operation
 */
export interface ReduceOptions<A> extends ParallelOptions {
  /**
   * Initial accumulator value.
   * Required for reduce operations.
   */
  initialValue: A;

  /**
   * Whether to run a final reduction step on the main thread.
   * Set to false if the combine function can run in workers.
   * @default true
   */
  finalReduceOnMain?: boolean;
}

/**
 * Options for find/findIndex operations
 */
export interface FindOptions extends ParallelOptions {
  /**
   * Whether to stop searching after the first match is found.
   * When true, may return faster but won't guarantee finding the first
   * matching element in order (depends on which worker finishes first).
   * @default true
   */
  shortCircuit?: boolean;
}

/**
 * Options for some/every operations
 */
export interface PredicateOptions extends ParallelOptions {
  /**
   * Whether to stop processing after the result is determined.
   * - For some(): stop on first true
   * - For every(): stop on first false
   * @default true
   */
  shortCircuit?: boolean;
}

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of a parallel filter operation
 */
export interface FilterResult<T> {
  /** Filtered items that passed the predicate */
  items: T[];
  /** Original indices of filtered items */
  indices: number[];
  /** Total execution time in ms */
  duration: number;
  /** Whether operation was cancelled */
  cancelled: boolean;
}

/**
 * Result of a parallel find operation
 */
export interface FindResult<T> {
  /** Found item (undefined if not found) */
  item: T | undefined;
  /** Index of found item (-1 if not found) */
  index: number;
  /** Whether an item was found */
  found: boolean;
  /** Total execution time in ms */
  duration: number;
  /** Whether operation was cancelled */
  cancelled: boolean;
}

/**
 * Result of a parallel reduce operation
 */
export interface ReduceResult<A> {
  /** Final accumulated value */
  value: A;
  /** Total execution time in ms */
  duration: number;
  /** Whether operation was cancelled */
  cancelled: boolean;
}

/**
 * Result of a parallel some/every operation
 */
export interface PredicateResult {
  /** The boolean result */
  result: boolean;
  /** Index where the result was determined (-1 if checked all) */
  decidingIndex: number;
  /** Total execution time in ms */
  duration: number;
  /** Whether operation was cancelled */
  cancelled: boolean;
}

/**
 * Result of a parallel forEach operation
 */
export interface ForEachResult {
  /** Number of items processed */
  processed: number;
  /** Total execution time in ms */
  duration: number;
  /** Whether operation was cancelled */
  cancelled: boolean;
  /** Errors encountered during processing (if not fail-fast) */
  errors: Error[];
}

// =============================================================================
// Parallel Promise Types
// =============================================================================

/**
 * Cancellable promise for parallel operations
 */
export interface ParallelPromise<T> extends WorkerpoolPromise<T> {
  /**
   * Cancel the parallel operation.
   * Already completed tasks are preserved.
   */
  cancel(): this;

  /**
   * Pause the parallel operation.
   * Queued tasks are held, in-progress tasks continue.
   */
  pause(): this;

  /**
   * Resume a paused parallel operation.
   */
  resume(): this;

  /**
   * Check if operation is paused.
   */
  isPaused(): boolean;
}

// =============================================================================
// Function Types
// =============================================================================

/**
 * Mapper function type (executed in worker)
 * @template T - Input item type
 * @template R - Output item type
 */
export type MapperFn<T, R> = (item: T, index: number, array?: T[]) => R;

/**
 * Reducer function type (executed in worker)
 * @template T - Item type
 * @template A - Accumulator type
 */
export type ReducerFn<T, A> = (accumulator: A, item: T, index: number, array?: T[]) => A;

/**
 * Combiner function for parallel reduce (merges partial results)
 * @template A - Accumulator type
 */
export type CombinerFn<A> = (left: A, right: A) => A;

/**
 * Predicate function type (executed in worker)
 * @template T - Item type
 */
export type PredicateFn<T> = (item: T, index: number, array?: T[]) => boolean;

/**
 * Consumer function type for forEach (executed in worker)
 * @template T - Item type
 */
export type ConsumerFn<T> = (item: T, index: number, array?: T[]) => void;

// =============================================================================
// Parallel Interface
// =============================================================================

/**
 * Interface for parallel array operations
 * Matches Array prototype methods but executes in parallel
 */
export interface ParallelArrayOperations {
  /**
   * Parallel map: transform each item in parallel
   *
   * @param items - Array of items to process
   * @param mapFn - Transformation function (string for worker method, or function)
   * @param options - Parallel processing options
   * @returns Promise resolving to array of transformed items
   *
   * @example
   * ```typescript
   * const squares = await pool.map([1,2,3,4], x => x * x);
   * ```
   */
  map<T, R>(
    items: T[],
    mapFn: MapperFn<T, R> | string,
    options?: ParallelOptions
  ): ParallelPromise<R[]>;

  /**
   * Parallel reduce: reduce array to single value in parallel
   *
   * Note: For parallel reduce to work correctly, the reducer must be
   * associative (order of operations doesn't affect result).
   *
   * @param items - Array of items to reduce
   * @param reducerFn - Reducer function (executed in worker)
   * @param combinerFn - Function to combine partial results
   * @param options - Reduce options with initial value
   * @returns Promise resolving to the reduced value
   *
   * @example
   * ```typescript
   * const sum = await pool.reduce(
   *   [1, 2, 3, 4, 5],
   *   (acc, x) => acc + x,
   *   (left, right) => left + right,
   *   { initialValue: 0 }
   * );
   * ```
   */
  reduce<T, A>(
    items: T[],
    reducerFn: ReducerFn<T, A> | string,
    combinerFn: CombinerFn<A>,
    options: ReduceOptions<A>
  ): ParallelPromise<A>;

  /**
   * Parallel forEach: execute function for each item
   *
   * @param items - Array of items to process
   * @param fn - Consumer function (executed in worker)
   * @param options - Parallel processing options
   * @returns Promise resolving when all items are processed
   *
   * @example
   * ```typescript
   * await pool.forEach(urls, async (url) => {
   *   await fetch(url);
   * });
   * ```
   */
  forEach<T>(
    items: T[],
    fn: ConsumerFn<T> | string,
    options?: ParallelOptions
  ): ParallelPromise<ForEachResult>;

  /**
   * Parallel filter: filter items in parallel
   *
   * @param items - Array of items to filter
   * @param predicateFn - Predicate function (executed in worker)
   * @param options - Parallel processing options
   * @returns Promise resolving to filtered items
   *
   * @example
   * ```typescript
   * const evens = await pool.filter([1,2,3,4], x => x % 2 === 0);
   * ```
   */
  filter<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: ParallelOptions
  ): ParallelPromise<T[]>;

  /**
   * Parallel some: test if any item matches predicate
   *
   * @param items - Array of items to test
   * @param predicateFn - Predicate function (executed in worker)
   * @param options - Predicate options
   * @returns Promise resolving to true if any item matches
   *
   * @example
   * ```typescript
   * const hasEven = await pool.some([1,3,4,5], x => x % 2 === 0);
   * ```
   */
  some<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: PredicateOptions
  ): ParallelPromise<boolean>;

  /**
   * Parallel every: test if all items match predicate
   *
   * @param items - Array of items to test
   * @param predicateFn - Predicate function (executed in worker)
   * @param options - Predicate options
   * @returns Promise resolving to true if all items match
   *
   * @example
   * ```typescript
   * const allPositive = await pool.every([1,2,3,4], x => x > 0);
   * ```
   */
  every<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: PredicateOptions
  ): ParallelPromise<boolean>;

  /**
   * Parallel find: find first matching item
   *
   * Note: With parallel execution, the "first" match found may not be
   * the first in array order unless shortCircuit is false.
   *
   * @param items - Array of items to search
   * @param predicateFn - Predicate function (executed in worker)
   * @param options - Find options
   * @returns Promise resolving to found item or undefined
   *
   * @example
   * ```typescript
   * const user = await pool.find(users, u => u.id === targetId);
   * ```
   */
  find<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: FindOptions
  ): ParallelPromise<T | undefined>;

  /**
   * Parallel findIndex: find index of first matching item
   *
   * @param items - Array of items to search
   * @param predicateFn - Predicate function (executed in worker)
   * @param options - Find options
   * @returns Promise resolving to index or -1
   *
   * @example
   * ```typescript
   * const index = await pool.findIndex(items, x => x.matches);
   * ```
   */
  findIndex<T>(
    items: T[],
    predicateFn: PredicateFn<T> | string,
    options?: FindOptions
  ): ParallelPromise<number>;
}
