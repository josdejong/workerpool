/**
 * Tests for SIMD Processor
 */

import { describe, it, expect } from 'vitest';
import {
  isNumericArray,
  isFloat32Array,
  isFloat64Array,
  isInt32Array,
  hasSIMDSupport,
  simdSumF32,
  simdMinF32,
  simdMaxF32,
  simdMultiplyF32,
  simdAddF32,
  simdSquareF32,
  simdSqrtF32,
  simdDotProductF32,
  simdCountF32,
  simdIndexOfF32,
  simdIncludesF32,
  simdCountGreaterThanF32,
  simdCountLessThanF32,
  simdSumI32,
  simdCountI32,
  simdIndexOfI32,
  SIMDProcessor,
  createNumericReducer,
} from '../../src/ts/core/simd-processor';

describe('type detection', () => {
  describe('isNumericArray', () => {
    it('should detect Float32Array', () => {
      expect(isNumericArray(new Float32Array(10))).toBe(true);
    });

    it('should detect Float64Array', () => {
      expect(isNumericArray(new Float64Array(10))).toBe(true);
    });

    it('should detect Int32Array', () => {
      expect(isNumericArray(new Int32Array(10))).toBe(true);
    });

    it('should detect Int16Array', () => {
      expect(isNumericArray(new Int16Array(10))).toBe(true);
    });

    it('should detect Int8Array', () => {
      expect(isNumericArray(new Int8Array(10))).toBe(true);
    });

    it('should detect Uint32Array', () => {
      expect(isNumericArray(new Uint32Array(10))).toBe(true);
    });

    it('should reject regular arrays', () => {
      expect(isNumericArray([1, 2, 3])).toBe(false);
    });

    it('should reject objects', () => {
      expect(isNumericArray({ length: 10 })).toBe(false);
    });
  });

  describe('specific type checks', () => {
    it('should detect Float32Array specifically', () => {
      expect(isFloat32Array(new Float32Array(10))).toBe(true);
      expect(isFloat32Array(new Float64Array(10))).toBe(false);
    });

    it('should detect Float64Array specifically', () => {
      expect(isFloat64Array(new Float64Array(10))).toBe(true);
      expect(isFloat64Array(new Float32Array(10))).toBe(false);
    });

    it('should detect Int32Array specifically', () => {
      expect(isInt32Array(new Int32Array(10))).toBe(true);
      expect(isInt32Array(new Float32Array(10))).toBe(false);
    });
  });
});

describe('Float32 operations', () => {
  describe('simdSumF32', () => {
    it('should sum array elements', () => {
      const arr = new Float32Array([1, 2, 3, 4, 5]);
      expect(simdSumF32(arr)).toBe(15);
    });

    it('should handle empty array', () => {
      const arr = new Float32Array(0);
      expect(simdSumF32(arr)).toBe(0);
    });

    it('should handle large arrays', () => {
      const arr = new Float32Array(1000);
      for (let i = 0; i < 1000; i++) arr[i] = 1;
      expect(simdSumF32(arr)).toBe(1000);
    });

    it('should handle negative numbers', () => {
      const arr = new Float32Array([-1, -2, 3, 4]);
      expect(simdSumF32(arr)).toBe(4);
    });
  });

  describe('simdMinF32', () => {
    it('should find minimum value', () => {
      const arr = new Float32Array([3, 1, 4, 1, 5, 9, 2, 6]);
      expect(simdMinF32(arr)).toBe(1);
    });

    it('should handle negative values', () => {
      const arr = new Float32Array([3, -1, 4, -5, 2]);
      expect(simdMinF32(arr)).toBe(-5);
    });

    it('should return Infinity for empty array', () => {
      const arr = new Float32Array(0);
      expect(simdMinF32(arr)).toBe(Infinity);
    });
  });

  describe('simdMaxF32', () => {
    it('should find maximum value', () => {
      const arr = new Float32Array([3, 1, 4, 1, 5, 9, 2, 6]);
      expect(simdMaxF32(arr)).toBe(9);
    });

    it('should handle negative values', () => {
      const arr = new Float32Array([-3, -1, -4, -5, -2]);
      expect(simdMaxF32(arr)).toBe(-1);
    });

    it('should return -Infinity for empty array', () => {
      const arr = new Float32Array(0);
      expect(simdMaxF32(arr)).toBe(-Infinity);
    });
  });

  describe('simdMultiplyF32', () => {
    it('should multiply by scalar', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      const result = simdMultiplyF32(arr, 2);
      expect(Array.from(result)).toEqual([2, 4, 6, 8]);
    });

    it('should handle zero scalar', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      const result = simdMultiplyF32(arr, 0);
      expect(Array.from(result)).toEqual([0, 0, 0, 0]);
    });
  });

  describe('simdAddF32', () => {
    it('should add scalar', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      const result = simdAddF32(arr, 10);
      expect(Array.from(result)).toEqual([11, 12, 13, 14]);
    });
  });

  describe('simdSquareF32', () => {
    it('should square elements', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      const result = simdSquareF32(arr);
      expect(Array.from(result)).toEqual([1, 4, 9, 16]);
    });
  });

  describe('simdSqrtF32', () => {
    it('should compute square roots', () => {
      const arr = new Float32Array([1, 4, 9, 16]);
      const result = simdSqrtF32(arr);
      expect(Array.from(result)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('simdDotProductF32', () => {
    it('should compute dot product', () => {
      const a = new Float32Array([1, 2, 3]);
      const b = new Float32Array([4, 5, 6]);
      // 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
      expect(simdDotProductF32(a, b)).toBe(32);
    });

    it('should handle different lengths', () => {
      const a = new Float32Array([1, 2, 3, 4, 5]);
      const b = new Float32Array([1, 2]);
      // Uses shorter length: 1*1 + 2*2 = 5
      expect(simdDotProductF32(a, b)).toBe(5);
    });
  });

  describe('simdCountF32', () => {
    it('should count matching values', () => {
      const arr = new Float32Array([1, 2, 2, 3, 2, 4]);
      expect(simdCountF32(arr, 2)).toBe(3);
    });

    it('should return 0 for no matches', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      expect(simdCountF32(arr, 5)).toBe(0);
    });
  });

  describe('simdIndexOfF32', () => {
    it('should find first index', () => {
      const arr = new Float32Array([1, 2, 3, 2, 4]);
      expect(simdIndexOfF32(arr, 2)).toBe(1);
    });

    it('should return -1 for not found', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      expect(simdIndexOfF32(arr, 5)).toBe(-1);
    });
  });

  describe('simdIncludesF32', () => {
    it('should return true if found', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      expect(simdIncludesF32(arr, 3)).toBe(true);
    });

    it('should return false if not found', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      expect(simdIncludesF32(arr, 5)).toBe(false);
    });
  });

  describe('simdCountGreaterThanF32', () => {
    it('should count values greater than threshold', () => {
      const arr = new Float32Array([1, 2, 3, 4, 5]);
      expect(simdCountGreaterThanF32(arr, 3)).toBe(2);
    });
  });

  describe('simdCountLessThanF32', () => {
    it('should count values less than threshold', () => {
      const arr = new Float32Array([1, 2, 3, 4, 5]);
      expect(simdCountLessThanF32(arr, 3)).toBe(2);
    });
  });
});

describe('Int32 operations', () => {
  describe('simdSumI32', () => {
    it('should sum array elements', () => {
      const arr = new Int32Array([1, 2, 3, 4, 5]);
      expect(simdSumI32(arr)).toBe(15);
    });

    it('should handle empty array', () => {
      const arr = new Int32Array(0);
      expect(simdSumI32(arr)).toBe(0);
    });
  });

  describe('simdCountI32', () => {
    it('should count matching values', () => {
      const arr = new Int32Array([1, 2, 2, 3, 2, 4]);
      expect(simdCountI32(arr, 2)).toBe(3);
    });
  });

  describe('simdIndexOfI32', () => {
    it('should find first index', () => {
      const arr = new Int32Array([1, 2, 3, 2, 4]);
      expect(simdIndexOfI32(arr, 2)).toBe(1);
    });

    it('should return -1 for not found', () => {
      const arr = new Int32Array([1, 2, 3, 4]);
      expect(simdIndexOfI32(arr, 5)).toBe(-1);
    });
  });
});

describe('SIMDProcessor', () => {
  const processor = new SIMDProcessor();

  describe('shouldUseSIMD', () => {
    it('should return true for large arrays', () => {
      expect(processor.shouldUseSIMD(100)).toBe(true);
    });

    it('should return false for small arrays', () => {
      expect(processor.shouldUseSIMD(4)).toBe(false);
    });
  });

  describe('sum', () => {
    it('should sum Float32Array', () => {
      const arr = new Float32Array([1, 2, 3, 4, 5]);
      expect(processor.sum(arr)).toBe(15);
    });

    it('should sum Int32Array', () => {
      const arr = new Int32Array([1, 2, 3, 4, 5]);
      expect(processor.sum(arr)).toBe(15);
    });

    it('should sum other typed arrays', () => {
      const arr = new Uint8Array([1, 2, 3, 4, 5]);
      expect(processor.sum(arr)).toBe(15);
    });
  });

  describe('min', () => {
    it('should find minimum', () => {
      const arr = new Float32Array([3, 1, 4, 1, 5]);
      expect(processor.min(arr)).toBe(1);
    });
  });

  describe('max', () => {
    it('should find maximum', () => {
      const arr = new Float32Array([3, 1, 4, 1, 5]);
      expect(processor.max(arr)).toBe(5);
    });
  });

  describe('reduce', () => {
    it('should reduce with callback', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      const result = processor.reduce(arr, (acc, val) => acc + val, 0);
      expect(result).toBe(10);
    });
  });

  describe('count', () => {
    it('should count with predicate', () => {
      const arr = new Float32Array([1, 2, 3, 4, 5]);
      const result = processor.count(arr, (v) => v > 2);
      expect(result).toBe(3);
    });
  });

  describe('includes', () => {
    it('should check if value exists', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      expect(processor.includes(arr, 3)).toBe(true);
      expect(processor.includes(arr, 5)).toBe(false);
    });
  });

  describe('indexOf', () => {
    it('should find index of value', () => {
      const arr = new Float32Array([1, 2, 3, 4]);
      expect(processor.indexOf(arr, 3)).toBe(2);
      expect(processor.indexOf(arr, 5)).toBe(-1);
    });
  });
});

describe('createNumericReducer', () => {
  describe('sum', () => {
    it('should create sum reducer', () => {
      const reducer = createNumericReducer('sum');
      const arr = new Float32Array([1, 2, 3, 4, 5]);
      expect(reducer(arr)).toBe(15);
    });
  });

  describe('product', () => {
    it('should create product reducer', () => {
      const reducer = createNumericReducer('product');
      const arr = new Float32Array([1, 2, 3, 4]);
      expect(reducer(arr)).toBe(24);
    });

    it('should return 0 for empty array', () => {
      const reducer = createNumericReducer('product');
      const arr = new Float32Array(0);
      expect(reducer(arr)).toBe(0);
    });
  });

  describe('min', () => {
    it('should create min reducer', () => {
      const reducer = createNumericReducer('min');
      const arr = new Float32Array([3, 1, 4, 1, 5]);
      expect(reducer(arr)).toBe(1);
    });
  });

  describe('max', () => {
    it('should create max reducer', () => {
      const reducer = createNumericReducer('max');
      const arr = new Float32Array([3, 1, 4, 1, 5]);
      expect(reducer(arr)).toBe(5);
    });
  });
});

describe('hasSIMDSupport', () => {
  it('should return a boolean', () => {
    const result = hasSIMDSupport();
    expect(typeof result).toBe('boolean');
  });

  it('should return consistent results', () => {
    const result1 = hasSIMDSupport();
    const result2 = hasSIMDSupport();
    expect(result1).toBe(result2);
  });
});
