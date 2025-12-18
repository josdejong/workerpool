/**
 * SIMD Batch Processor Tests
 *
 * Tests for the SIMD batch processing stubs.
 * These validate the correctness of vector operations using scalar implementations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  _resetSimd,
  allocateAligned,
  freeAligned,
  _setFloat32Array,
  _getFloat32Array,
  _setFloat64Array,
  _getFloat64Array,
  _setInt32Array,
  _getInt32Array,
  simdMapMultiplyF32,
  simdMapAddF32,
  simdMapSquareF32,
  simdMapSqrtF32,
  simdReduceSumF32,
  simdReduceMinF32,
  simdReduceMaxF32,
  simdDotProductF32,
  simdAddArraysF32,
  simdMultiplyArraysF32,
  simdMapAbsF32,
  simdMapNegateF32,
  simdMapClampF32,
  simdMapMultiplyF64,
  simdReduceSumF64,
  simdMapMultiplyI32,
  simdReduceSumI32,
} from '../../../src/ts/assembly/stubs/simd-batch';

describe('SIMD Batch Processor', () => {
  beforeEach(() => {
    _resetSimd();
  });

  describe('Memory allocation', () => {
    it('should allocate aligned memory', () => {
      const ptr1 = allocateAligned(100);
      const ptr2 = allocateAligned(50);

      expect(ptr1).toBeGreaterThan(0);
      expect(ptr2).toBeGreaterThan(ptr1);
      // Should be 16-byte aligned
      expect(ptr2 - ptr1).toBeGreaterThanOrEqual(112); // 100 rounded up to 112
    });

    it('should free memory without error', () => {
      const ptr = allocateAligned(64);
      _setFloat32Array(ptr, new Float32Array([1, 2, 3]));

      freeAligned(ptr);

      expect(_getFloat32Array(ptr)).toBeUndefined();
    });
  });

  describe('Float32 map operations', () => {
    it('should multiply array by scalar', () => {
      const inputPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const input = new Float32Array([1, 2, 3, 4]);
      _setFloat32Array(inputPtr, input);

      simdMapMultiplyF32(inputPtr, outputPtr, 4, 2.5);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([2.5, 5, 7.5, 10]);
    });

    it('should add scalar to array', () => {
      const inputPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const input = new Float32Array([1, 2, 3, 4]);
      _setFloat32Array(inputPtr, input);

      simdMapAddF32(inputPtr, outputPtr, 4, 10);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([11, 12, 13, 14]);
    });

    it('should square array elements', () => {
      const inputPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const input = new Float32Array([2, 3, 4, 5]);
      _setFloat32Array(inputPtr, input);

      simdMapSquareF32(inputPtr, outputPtr, 4);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([4, 9, 16, 25]);
    });

    it('should compute square root of array elements', () => {
      const inputPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const input = new Float32Array([4, 9, 16, 25]);
      _setFloat32Array(inputPtr, input);

      simdMapSqrtF32(inputPtr, outputPtr, 4);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([2, 3, 4, 5]);
    });

    it('should compute absolute value', () => {
      const inputPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const input = new Float32Array([-1, 2, -3, 4]);
      _setFloat32Array(inputPtr, input);

      simdMapAbsF32(inputPtr, outputPtr, 4);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([1, 2, 3, 4]);
    });

    it('should negate array elements', () => {
      const inputPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const input = new Float32Array([1, -2, 3, -4]);
      _setFloat32Array(inputPtr, input);

      simdMapNegateF32(inputPtr, outputPtr, 4);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([-1, 2, -3, 4]);
    });

    it('should clamp array elements between min and max', () => {
      const inputPtr = allocateAligned(20);
      const outputPtr = allocateAligned(20);
      const input = new Float32Array([0, 5, 10, 15, 20]);
      _setFloat32Array(inputPtr, input);

      simdMapClampF32(inputPtr, outputPtr, 5, 3, 12);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([3, 5, 10, 12, 12]);
    });
  });

  describe('Float32 reduce operations', () => {
    it('should sum array elements', () => {
      const inputPtr = allocateAligned(16);
      const input = new Float32Array([1, 2, 3, 4]);
      _setFloat32Array(inputPtr, input);

      const sum = simdReduceSumF32(inputPtr, 4);

      expect(sum).toBe(10);
    });

    it('should find minimum value', () => {
      const inputPtr = allocateAligned(20);
      const input = new Float32Array([5, 2, 8, 1, 9]);
      _setFloat32Array(inputPtr, input);

      const min = simdReduceMinF32(inputPtr, 5);

      expect(min).toBe(1);
    });

    it('should return MAX_VALUE for empty array min', () => {
      const min = simdReduceMinF32(0, 0);
      expect(min).toBe(Number.MAX_VALUE);
    });

    it('should find maximum value', () => {
      const inputPtr = allocateAligned(20);
      const input = new Float32Array([5, 2, 8, 1, 9]);
      _setFloat32Array(inputPtr, input);

      const max = simdReduceMaxF32(inputPtr, 5);

      expect(max).toBe(9);
    });

    it('should return -MAX_VALUE for empty array max', () => {
      const max = simdReduceMaxF32(0, 0);
      expect(max).toBe(-Number.MAX_VALUE);
    });
  });

  describe('Float32 two-array operations', () => {
    it('should compute dot product', () => {
      const aPtr = allocateAligned(16);
      const bPtr = allocateAligned(16);
      const a = new Float32Array([1, 2, 3, 4]);
      const b = new Float32Array([2, 3, 4, 5]);
      _setFloat32Array(aPtr, a);
      _setFloat32Array(bPtr, b);

      const dot = simdDotProductF32(aPtr, bPtr, 4);

      // 1*2 + 2*3 + 3*4 + 4*5 = 2 + 6 + 12 + 20 = 40
      expect(dot).toBe(40);
    });

    it('should add two arrays element-wise', () => {
      const aPtr = allocateAligned(16);
      const bPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const a = new Float32Array([1, 2, 3, 4]);
      const b = new Float32Array([10, 20, 30, 40]);
      _setFloat32Array(aPtr, a);
      _setFloat32Array(bPtr, b);

      simdAddArraysF32(aPtr, bPtr, outputPtr, 4);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([11, 22, 33, 44]);
    });

    it('should multiply two arrays element-wise', () => {
      const aPtr = allocateAligned(16);
      const bPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const a = new Float32Array([1, 2, 3, 4]);
      const b = new Float32Array([2, 3, 4, 5]);
      _setFloat32Array(aPtr, a);
      _setFloat32Array(bPtr, b);

      simdMultiplyArraysF32(aPtr, bPtr, outputPtr, 4);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([2, 6, 12, 20]);
    });
  });

  describe('Non-aligned array lengths', () => {
    it('should handle arrays not divisible by 4 (SIMD lane count)', () => {
      const inputPtr = allocateAligned(28);
      const outputPtr = allocateAligned(28);
      const input = new Float32Array([1, 2, 3, 4, 5, 6, 7]); // 7 elements
      _setFloat32Array(inputPtr, input);

      simdMapMultiplyF32(inputPtr, outputPtr, 7, 2);

      const output = _getFloat32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([2, 4, 6, 8, 10, 12, 14]);
    });

    it('should handle single element array', () => {
      const inputPtr = allocateAligned(4);
      const input = new Float32Array([42]);
      _setFloat32Array(inputPtr, input);

      const sum = simdReduceSumF32(inputPtr, 1);

      expect(sum).toBe(42);
    });
  });

  describe('Float64 operations', () => {
    it('should multiply float64 array by scalar', () => {
      const inputPtr = allocateAligned(32);
      const outputPtr = allocateAligned(32);
      const input = new Float64Array([1.5, 2.5, 3.5, 4.5]);
      _setFloat64Array(inputPtr, input);

      simdMapMultiplyF64(inputPtr, outputPtr, 4, 2);

      const output = _getFloat64Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([3, 5, 7, 9]);
    });

    it('should sum float64 array', () => {
      const inputPtr = allocateAligned(32);
      const input = new Float64Array([1.1, 2.2, 3.3, 4.4]);
      _setFloat64Array(inputPtr, input);

      const sum = simdReduceSumF64(inputPtr, 4);

      expect(sum).toBeCloseTo(11, 5);
    });
  });

  describe('Int32 operations', () => {
    it('should multiply int32 array by scalar', () => {
      const inputPtr = allocateAligned(16);
      const outputPtr = allocateAligned(16);
      const input = new Int32Array([1, 2, 3, 4]);
      _setInt32Array(inputPtr, input);

      simdMapMultiplyI32(inputPtr, outputPtr, 4, 3);

      const output = _getInt32Array(outputPtr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([3, 6, 9, 12]);
    });

    it('should sum int32 array', () => {
      const inputPtr = allocateAligned(16);
      const input = new Int32Array([10, 20, 30, 40]);
      _setInt32Array(inputPtr, input);

      const sum = simdReduceSumI32(inputPtr, 4);

      expect(sum).toBe(100);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero-length arrays', () => {
      const sum = simdReduceSumF32(0, 0);
      expect(sum).toBe(0);
    });

    it('should handle negative values', () => {
      const inputPtr = allocateAligned(16);
      const input = new Float32Array([-1, -2, -3, -4]);
      _setFloat32Array(inputPtr, input);

      const sum = simdReduceSumF32(inputPtr, 4);

      expect(sum).toBe(-10);
    });

    it('should handle very large arrays', () => {
      const length = 1000;
      const inputPtr = allocateAligned(length * 4);
      const input = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        input[i] = i + 1;
      }
      _setFloat32Array(inputPtr, input);

      const sum = simdReduceSumF32(inputPtr, length);

      // Sum of 1 to 1000 = n(n+1)/2 = 500500
      expect(sum).toBe(500500);
    });

    it('should handle in-place operations (input === output)', () => {
      const ptr = allocateAligned(16);
      const data = new Float32Array([1, 2, 3, 4]);
      _setFloat32Array(ptr, data);

      simdMapMultiplyF32(ptr, ptr, 4, 2);

      const output = _getFloat32Array(ptr);
      expect(output).toBeDefined();
      expect(Array.from(output!)).toEqual([2, 4, 6, 8]);
    });
  });
});
