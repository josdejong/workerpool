/**
 * Type-Safe Worker Method Definitions
 *
 * Provides utilities for defining worker methods with full type inference,
 * enabling IDE autocompletion and type checking for worker communication.
 */

import type { WorkerpoolPromise, ExecOptions } from './core';

// ============================================================================
// Worker Method Definition Types
// ============================================================================

/**
 * Any function type that can be used as a worker method
 */
export type AnyWorkerMethod = (...args: any[]) => any;

/**
 * Map of method names to their implementations
 */
export type WorkerMethodMap = Record<string, AnyWorkerMethod>;

/**
 * Extract the return type of a worker method, handling promises
 */
export type MethodReturnType<T extends AnyWorkerMethod> =
  ReturnType<T> extends Promise<infer U> ? U : ReturnType<T>;

/**
 * Promisified version of a worker method
 */
export type PromisifiedMethod<T extends AnyWorkerMethod> = (
  ...args: Parameters<T>
) => WorkerpoolPromise<MethodReturnType<T>>;

/**
 * A map of methods converted to their promisified versions
 */
export type PromisifiedMethodMap<T extends WorkerMethodMap> = {
  [K in keyof T]: PromisifiedMethod<T[K]>;
};

// ============================================================================
// Worker Definition Helper
// ============================================================================

/**
 * Define a type-safe worker method map
 *
 * This is a no-op function that provides type inference for worker methods.
 * Use this to define your worker methods with full type safety.
 *
 * @example
 * ```typescript
 * // In worker.ts
 * const methods = defineWorkerMethods({
 *   add(a: number, b: number): number {
 *     return a + b;
 *   },
 *   async fetchData(url: string): Promise<string> {
 *     const response = await fetch(url);
 *     return response.text();
 *   },
 *   processArray(data: number[]): number[] {
 *     return data.map(x => x * 2);
 *   }
 * });
 *
 * // Export for type inference in main thread
 * export type WorkerMethods = typeof methods;
 *
 * // Register with workerpool
 * workerpool.worker(methods);
 * ```
 *
 * @param methods - Object containing worker method implementations
 * @returns The same methods object (type inference only)
 */
export function defineWorkerMethods<T extends WorkerMethodMap>(methods: T): T {
  return methods;
}

/**
 * Create a typed proxy for a worker pool
 *
 * Use this on the main thread to get type-safe access to worker methods.
 *
 * @example
 * ```typescript
 * // Import types from worker
 * import type { WorkerMethods } from './worker';
 *
 * // Create pool
 * const pool = workerpool.pool('./worker.js');
 *
 * // Create typed proxy
 * const worker = createTypedProxy<WorkerMethods>(pool);
 *
 * // Now you get full type inference!
 * const result = await worker.add(1, 2); // result is number
 * const data = await worker.fetchData('https://api.example.com'); // data is string
 * ```
 *
 * @param pool - The worker pool to proxy
 * @returns A typed proxy object
 */
export function createTypedProxy<T extends WorkerMethodMap>(
  pool: WorkerPoolLike
): PromisifiedMethodMap<T> {
  return pool.proxy() as PromisifiedMethodMap<T>;
}

/**
 * Minimal interface for pool proxy creation
 */
interface WorkerPoolLike {
  proxy(): Record<string, (...args: any[]) => WorkerpoolPromise<any>>;
}

// ============================================================================
// Method Signature Extraction Types
// ============================================================================

/**
 * Extract method names from a worker method map
 */
export type MethodNames<T extends WorkerMethodMap> = keyof T & string;

/**
 * Extract parameters for a specific method
 */
export type MethodParams<
  T extends WorkerMethodMap,
  K extends keyof T
> = Parameters<T[K]>;

/**
 * Extract return type for a specific method
 */
export type MethodResult<
  T extends WorkerMethodMap,
  K extends keyof T
> = MethodReturnType<T[K]>;

/**
 * Type guard to check if a value matches a method signature
 */
export function isMethodName<T extends WorkerMethodMap>(
  methods: T,
  name: unknown
): name is keyof T {
  return typeof name === 'string' && name in methods;
}

// ============================================================================
// Advanced Method Definition Patterns
// ============================================================================

/**
 * Define a worker method with explicit input/output types
 *
 * Useful when you need to be explicit about types or when the
 * method implementation is complex.
 *
 * @example
 * ```typescript
 * const methods = {
 *   calculate: typedMethod<[number, number], number>(
 *     (a, b) => a + b
 *   ),
 *   transform: typedMethod<[string], { length: number }>(
 *     (s) => ({ length: s.length })
 *   )
 * };
 * ```
 */
export function typedMethod<TArgs extends unknown[], TReturn>(
  implementation: (...args: TArgs) => TReturn | Promise<TReturn>
): (...args: TArgs) => TReturn | Promise<TReturn> {
  return implementation;
}

/**
 * Define an async worker method with explicit types
 */
export function asyncMethod<TArgs extends unknown[], TReturn>(
  implementation: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<TReturn> {
  return implementation;
}

/**
 * Define a sync worker method with explicit types
 */
export function syncMethod<TArgs extends unknown[], TReturn>(
  implementation: (...args: TArgs) => TReturn
): (...args: TArgs) => TReturn {
  return implementation;
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Validate that a worker method map is well-formed
 *
 * @param methods - Methods to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateWorkerMethods(methods: unknown): string[] {
  const errors: string[] = [];

  if (!methods || typeof methods !== 'object') {
    errors.push('Methods must be a non-null object');
    return errors;
  }

  for (const [name, method] of Object.entries(methods)) {
    if (typeof method !== 'function') {
      errors.push(`Method "${name}" is not a function`);
    }
    if (name.startsWith('_')) {
      errors.push(`Method "${name}" should not start with underscore (reserved)`);
    }
  }

  return errors;
}

/**
 * Create a method validator that checks argument types at runtime
 *
 * @example
 * ```typescript
 * const validateAdd = createMethodValidator<[number, number]>(
 *   (a, b) => typeof a === 'number' && typeof b === 'number',
 *   'add expects two numbers'
 * );
 *
 * // Use in worker
 * const methods = {
 *   add(a: number, b: number) {
 *     validateAdd(a, b);
 *     return a + b;
 *   }
 * };
 * ```
 */
export function createMethodValidator<TArgs extends unknown[]>(
  predicate: (...args: TArgs) => boolean,
  errorMessage: string
): (...args: TArgs) => void {
  return (...args: TArgs) => {
    if (!predicate(...args)) {
      throw new TypeError(errorMessage);
    }
  };
}
