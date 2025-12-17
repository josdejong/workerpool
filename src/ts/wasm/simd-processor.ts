/**
 * SIMD Processor JavaScript Bridge
 *
 * Provides JavaScript API for SIMD-accelerated batch operations.
 * Falls back to scalar operations when SIMD is unavailable.
 */

import { canUseWasm } from './feature-detection';

/**
 * SIMD operation types
 */
export type SIMDOperation =
  | 'multiply'
  | 'add'
  | 'square'
  | 'sqrt'
  | 'abs'
  | 'negate'
  | 'clamp';

/**
 * Reduce operation types
 */
export type ReduceOperation = 'sum' | 'min' | 'max';

/**
 * SIMD processor instance
 */
export interface SIMDProcessor {
  /** Check if SIMD is available */
  isAvailable(): boolean;

  /** Map operation on Float32Array */
  mapF32(
    input: Float32Array,
    operation: SIMDOperation,
    arg1?: number,
    arg2?: number
  ): Float32Array;

  /** Map operation on Float64Array */
  mapF64(
    input: Float64Array,
    operation: SIMDOperation,
    arg1?: number,
    arg2?: number
  ): Float64Array;

  /** Map operation on Int32Array */
  mapI32(
    input: Int32Array,
    operation: SIMDOperation,
    arg1?: number,
    arg2?: number
  ): Int32Array;

  /** Reduce operation on Float32Array */
  reduceF32(input: Float32Array, operation: ReduceOperation): number;

  /** Reduce operation on Float64Array */
  reduceF64(input: Float64Array, operation: ReduceOperation): number;

  /** Reduce operation on Int32Array */
  reduceI32(input: Int32Array, operation: ReduceOperation): number;

  /** Dot product of two Float32Arrays */
  dotProductF32(a: Float32Array, b: Float32Array): number;

  /** Element-wise add of two Float32Arrays */
  addArraysF32(a: Float32Array, b: Float32Array): Float32Array;

  /** Element-wise multiply of two Float32Arrays */
  multiplyArraysF32(a: Float32Array, b: Float32Array): Float32Array;

  /** Free WASM resources */
  dispose(): void;
}

/**
 * Map operation function signature
 */
type MapOpFn = (arr: Float32Array, arg1?: number, arg2?: number) => Float32Array;

/**
 * Scalar fallback implementations
 */
const scalarMapOps: Record<SIMDOperation, MapOpFn> = {
  multiply: (arr, scalar = 1) => {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      result[i] = arr[i] * scalar;
    }
    return result;
  },
  add: (arr, scalar = 0) => {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      result[i] = arr[i] + scalar;
    }
    return result;
  },
  square: (arr) => {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      result[i] = arr[i] * arr[i];
    }
    return result;
  },
  sqrt: (arr) => {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      result[i] = Math.sqrt(arr[i]);
    }
    return result;
  },
  abs: (arr) => {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      result[i] = Math.abs(arr[i]);
    }
    return result;
  },
  negate: (arr) => {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      result[i] = -arr[i];
    }
    return result;
  },
  clamp: (arr, min = 0, max = 1) => {
    const result = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      result[i] = Math.max(min, Math.min(max, arr[i]));
    }
    return result;
  },
};

/**
 * Reduce operation function signature
 */
type ReduceOpFn = (arr: Float32Array) => number;

/**
 * Scalar reduce implementations
 */
const scalarReduceOps: Record<ReduceOperation, ReduceOpFn> = {
  sum: (arr) => {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i];
    }
    return sum;
  },
  min: (arr) => {
    let min = Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] < min) min = arr[i];
    }
    return min;
  },
  max: (arr) => {
    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > max) max = arr[i];
    }
    return max;
  },
};

/**
 * Create scalar fallback processor
 */
function createScalarProcessor(): SIMDProcessor {
  const processor: SIMDProcessor = {
    isAvailable: () => false,

    mapF32(input: Float32Array, operation: SIMDOperation, arg1?: number, arg2?: number): Float32Array {
      const op = scalarMapOps[operation];
      if (!op) throw new Error(`Unknown operation: ${operation}`);
      return op(input, arg1, arg2);
    },

    mapF64(input: Float64Array, operation: SIMDOperation, arg1?: number, arg2?: number): Float64Array {
      const f32 = new Float32Array(input);
      const result = processor.mapF32(f32, operation, arg1, arg2);
      return new Float64Array(result);
    },

    mapI32(input: Int32Array, operation: SIMDOperation, arg1?: number, arg2?: number): Int32Array {
      const f32 = new Float32Array(input);
      const result = processor.mapF32(f32, operation, arg1, arg2);
      return new Int32Array(result);
    },

    reduceF32(input: Float32Array, operation: ReduceOperation): number {
      const op = scalarReduceOps[operation];
      if (!op) throw new Error(`Unknown operation: ${operation}`);
      return op(input);
    },

    reduceF64(input: Float64Array, operation: ReduceOperation): number {
      return processor.reduceF32(new Float32Array(input), operation);
    },

    reduceI32(input: Int32Array, operation: ReduceOperation): number {
      return processor.reduceF32(new Float32Array(input), operation);
    },

    dotProductF32(a: Float32Array, b: Float32Array): number {
      if (a.length !== b.length) {
        throw new Error('Arrays must have same length');
      }
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        sum += a[i] * b[i];
      }
      return sum;
    },

    addArraysF32(a: Float32Array, b: Float32Array): Float32Array {
      if (a.length !== b.length) {
        throw new Error('Arrays must have same length');
      }
      const result = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) {
        result[i] = a[i] + b[i];
      }
      return result;
    },

    multiplyArraysF32(a: Float32Array, b: Float32Array): Float32Array {
      if (a.length !== b.length) {
        throw new Error('Arrays must have same length');
      }
      const result = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) {
        result[i] = a[i] * b[i];
      }
      return result;
    },

    dispose(): void {
      // No resources to free
    },
  };

  return processor;
}

// Singleton processor instance
let processorInstance: SIMDProcessor | null = null;

/**
 * Get SIMD processor instance
 *
 * Returns scalar processor for now.
 * WASM SIMD support will be added when simd-batch.wasm is built.
 *
 * @returns SIMD processor
 */
export function getSIMDProcessor(): SIMDProcessor {
  if (!processorInstance) {
    // For now, always use scalar processor
    // WASM SIMD requires building assembly/simd-batch.ts
    processorInstance = createScalarProcessor();
  }
  return processorInstance;
}

/**
 * Check if SIMD acceleration is available
 *
 * Returns false until WASM SIMD module is built and loaded.
 */
export function canUseSIMD(): boolean {
  // WASM SIMD detection - currently always returns false
  // Will be enabled when simd-batch.wasm is built
  return canUseWasm() && false; // Disabled until WASM module is ready
}

/**
 * Convenience function: SIMD map on Float32Array
 */
export function simdMapF32(
  input: Float32Array,
  operation: SIMDOperation,
  arg1?: number,
  arg2?: number
): Float32Array {
  const processor = getSIMDProcessor();
  return processor.mapF32(input, operation, arg1, arg2);
}

/**
 * Convenience function: SIMD reduce on Float32Array
 */
export function simdReduceF32(
  input: Float32Array,
  operation: ReduceOperation
): number {
  const processor = getSIMDProcessor();
  return processor.reduceF32(input, operation);
}

/**
 * Convenience function: SIMD dot product
 */
export function simdDotProduct(
  a: Float32Array,
  b: Float32Array
): number {
  const processor = getSIMDProcessor();
  return processor.dotProductF32(a, b);
}

/**
 * Reset processor instance (for testing)
 */
export function resetSIMDProcessor(): void {
  if (processorInstance) {
    processorInstance.dispose();
    processorInstance = null;
  }
}

export default {
  getSIMDProcessor,
  canUseSIMD,
  simdMapF32,
  simdReduceF32,
  simdDotProduct,
  resetSIMDProcessor,
};
