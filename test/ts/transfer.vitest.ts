/**
 * Transfer Tests
 *
 * Tests for the TypeScript Transfer utility for zero-copy data transfer.
 */

import { describe, it, expect } from 'vitest';
import {
  Transfer,
  transferFloat64,
  transferFloat32,
  transferInt32,
  transferUint32,
  transferInt16,
  transferUint16,
  transferInt8,
  transferUint8,
  transferUint8Clamped,
  transferBigInt64,
  transferBigUint64,
  transferTypedArray,
  transferArrayBuffer,
  transferArrayBuffers,
  transferObject,
} from '../../src/ts/platform/transfer';

// Import transfer detection utilities (new exports)
import {
  isTransferable,
  detectTransferables,
  getTransferableType,
  validateTransferables,
  getTransferableSize,
  hasTransferables,
  getTransferHint,
} from '../../src/ts/platform/transfer-detection';

describe('Transfer', () => {
  describe('constructor', () => {
    it('should create a Transfer instance', () => {
      const buffer = new ArrayBuffer(1024);
      const transfer = new Transfer({ data: buffer }, [buffer]);

      expect(transfer.message).toEqual({ data: buffer });
      expect(transfer.transfer).toEqual([buffer]);
    });

    it('should handle multiple transferables', () => {
      const buf1 = new ArrayBuffer(512);
      const buf2 = new ArrayBuffer(512);
      const transfer = new Transfer({ a: buf1, b: buf2 }, [buf1, buf2]);

      expect(transfer.transfer).toHaveLength(2);
      expect(transfer.transfer).toContain(buf1);
      expect(transfer.transfer).toContain(buf2);
    });

    it('should handle empty transfer list', () => {
      const transfer = new Transfer({ value: 42 }, []);

      expect(transfer.message).toEqual({ value: 42 });
      expect(transfer.transfer).toEqual([]);
    });
  });

  describe('isTransfer', () => {
    it('should return true for Transfer instances', () => {
      const buffer = new ArrayBuffer(1024);
      const transfer = new Transfer(buffer, [buffer]);

      expect(Transfer.isTransfer(transfer)).toBe(true);
    });

    it('should return false for non-Transfer objects', () => {
      expect(Transfer.isTransfer({})).toBe(false);
      expect(Transfer.isTransfer(null)).toBe(false);
      expect(Transfer.isTransfer(undefined)).toBe(false);
      expect(Transfer.isTransfer(new ArrayBuffer(10))).toBe(false);
      expect(Transfer.isTransfer({ message: {}, transfer: [] })).toBe(false);
    });
  });

  describe('isTransferable', () => {
    it('should return true for ArrayBuffer', () => {
      expect(Transfer.isTransferable(new ArrayBuffer(10))).toBe(true);
    });

    it('should return false for non-transferable objects', () => {
      expect(Transfer.isTransferable({})).toBe(false);
      expect(Transfer.isTransferable(null)).toBe(false);
      expect(Transfer.isTransferable(undefined)).toBe(false);
      expect(Transfer.isTransferable('string')).toBe(false);
      expect(Transfer.isTransferable(42)).toBe(false);
      expect(Transfer.isTransferable([1, 2, 3])).toBe(false);
    });

    it('should return false for TypedArrays (not directly transferable)', () => {
      // TypedArrays themselves are not transferable, their buffers are
      expect(Transfer.isTransferable(new Uint8Array(10))).toBe(false);
      expect(Transfer.isTransferable(new Float64Array(10))).toBe(false);
    });
  });

  describe('findTransferables', () => {
    it('should find ArrayBuffer', () => {
      const buffer = new ArrayBuffer(1024);
      const transferables = Transfer.findTransferables(buffer);

      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBe(buffer);
    });

    it('should find TypedArray buffer', () => {
      const array = new Float64Array(10);
      const transferables = Transfer.findTransferables(array);

      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBe(array.buffer);
    });

    it('should find buffers in arrays', () => {
      const buf1 = new ArrayBuffer(512);
      const buf2 = new ArrayBuffer(512);
      const transferables = Transfer.findTransferables([buf1, buf2]);

      expect(transferables).toHaveLength(2);
      expect(transferables).toContain(buf1);
      expect(transferables).toContain(buf2);
    });

    it('should find buffers in objects', () => {
      const buffer = new ArrayBuffer(1024);
      const obj = {
        data: buffer,
        name: 'test',
      };
      const transferables = Transfer.findTransferables(obj);

      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBe(buffer);
    });

    it('should find buffers in nested objects', () => {
      const buffer = new ArrayBuffer(1024);
      const obj = {
        nested: {
          deep: {
            data: buffer,
          },
        },
      };
      const transferables = Transfer.findTransferables(obj);

      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBe(buffer);
    });

    it('should find TypedArray buffers in complex objects', () => {
      const float64 = new Float64Array([1.5, 2.5, 3.5]);
      const int32 = new Int32Array([1, 2, 3]);
      const obj = {
        positions: float64,
        indices: int32,
        metadata: { name: 'mesh' },
      };
      const transferables = Transfer.findTransferables(obj);

      expect(transferables).toHaveLength(2);
      expect(transferables).toContain(float64.buffer);
      expect(transferables).toContain(int32.buffer);
    });

    it('should not duplicate buffers', () => {
      const buffer = new ArrayBuffer(1024);
      const array1 = new Uint8Array(buffer);
      const array2 = new Float32Array(buffer);
      const obj = {
        a: array1,
        b: array2,
        c: buffer,
      };
      const transferables = Transfer.findTransferables(obj);

      expect(transferables).toHaveLength(1);
      expect(transferables[0]).toBe(buffer);
    });

    it('should handle null and undefined', () => {
      expect(Transfer.findTransferables(null)).toEqual([]);
      expect(Transfer.findTransferables(undefined)).toEqual([]);
    });

    it('should handle primitives', () => {
      expect(Transfer.findTransferables(42)).toEqual([]);
      expect(Transfer.findTransferables('string')).toEqual([]);
      expect(Transfer.findTransferables(true)).toEqual([]);
    });
  });

  describe('typed array transfer helpers', () => {
    describe('transferFloat64', () => {
      it('should create Transfer for Float64Array', () => {
        const array = new Float64Array([1.5, 2.5, 3.5]);
        const transfer = transferFloat64(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferFloat32', () => {
      it('should create Transfer for Float32Array', () => {
        const array = new Float32Array([1.5, 2.5, 3.5]);
        const transfer = transferFloat32(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferInt32', () => {
      it('should create Transfer for Int32Array', () => {
        const array = new Int32Array([1, 2, 3]);
        const transfer = transferInt32(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferUint32', () => {
      it('should create Transfer for Uint32Array', () => {
        const array = new Uint32Array([1, 2, 3]);
        const transfer = transferUint32(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferInt16', () => {
      it('should create Transfer for Int16Array', () => {
        const array = new Int16Array([1, 2, 3]);
        const transfer = transferInt16(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferUint16', () => {
      it('should create Transfer for Uint16Array', () => {
        const array = new Uint16Array([1, 2, 3]);
        const transfer = transferUint16(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferInt8', () => {
      it('should create Transfer for Int8Array', () => {
        const array = new Int8Array([1, 2, 3]);
        const transfer = transferInt8(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferUint8', () => {
      it('should create Transfer for Uint8Array', () => {
        const array = new Uint8Array([1, 2, 3]);
        const transfer = transferUint8(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferUint8Clamped', () => {
      it('should create Transfer for Uint8ClampedArray', () => {
        const array = new Uint8ClampedArray([1, 2, 3]);
        const transfer = transferUint8Clamped(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferBigInt64', () => {
      it('should create Transfer for BigInt64Array', () => {
        const array = new BigInt64Array([1n, 2n, 3n]);
        const transfer = transferBigInt64(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferBigUint64', () => {
      it('should create Transfer for BigUint64Array', () => {
        const array = new BigUint64Array([1n, 2n, 3n]);
        const transfer = transferBigUint64(array);

        expect(transfer.message).toBe(array);
        expect(transfer.transfer).toEqual([array.buffer]);
      });
    });

    describe('transferTypedArray', () => {
      it('should work with any TypedArray type', () => {
        const int16 = new Int16Array([1, 2, 3]);
        const transfer = transferTypedArray(int16);

        expect(transfer.message).toBe(int16);
        expect(transfer.transfer).toEqual([int16.buffer]);
      });
    });
  });

  describe('ArrayBuffer transfer helpers', () => {
    describe('transferArrayBuffer', () => {
      it('should create Transfer for ArrayBuffer', () => {
        const buffer = new ArrayBuffer(1024);
        const transfer = transferArrayBuffer(buffer);

        expect(transfer.message).toBe(buffer);
        expect(transfer.transfer).toEqual([buffer]);
      });
    });

    describe('transferArrayBuffers', () => {
      it('should create Transfer for multiple ArrayBuffers', () => {
        const buf1 = new ArrayBuffer(1024);
        const buf2 = new ArrayBuffer(2048);
        const transfer = transferArrayBuffers([buf1, buf2]);

        expect(transfer.message).toEqual([buf1, buf2]);
        expect(transfer.transfer).toEqual([buf1, buf2]);
      });

      it('should handle empty array', () => {
        const transfer = transferArrayBuffers([]);

        expect(transfer.message).toEqual([]);
        expect(transfer.transfer).toEqual([]);
      });
    });
  });

  describe('transferObject', () => {
    it('should auto-detect transferables in object', () => {
      const float32 = new Float32Array([0, 0, 0, 1, 1, 1]);
      const uint16 = new Uint16Array([0, 1, 2]);
      const data = {
        positions: float32,
        indices: uint16,
        metadata: { name: 'mesh' },
      };
      const transfer = transferObject(data);

      expect(transfer.message).toBe(data);
      expect(transfer.transfer).toHaveLength(2);
      expect(transfer.transfer).toContain(float32.buffer);
      expect(transfer.transfer).toContain(uint16.buffer);
    });

    it('should handle object with no transferables', () => {
      const data = {
        name: 'test',
        value: 42,
        nested: { a: 1, b: 2 },
      };
      const transfer = transferObject(data);

      expect(transfer.message).toBe(data);
      expect(transfer.transfer).toEqual([]);
    });

    it('should handle deeply nested transferables', () => {
      const buffer = new ArrayBuffer(100);
      const data = {
        level1: {
          level2: {
            level3: {
              buffer,
            },
          },
        },
      };
      const transfer = transferObject(data);

      expect(transfer.message).toBe(data);
      expect(transfer.transfer).toEqual([buffer]);
    });
  });
});

// =============================================================================
// Transfer Detection Utilities (new exports from platform/transfer-detection)
// =============================================================================

describe('Transfer Detection Utilities', () => {
  describe('isTransferable', () => {
    it('should return true for ArrayBuffer', () => {
      expect(isTransferable(new ArrayBuffer(16))).toBe(true);
    });

    it('should return false for TypedArrays (only their buffers are transferable)', () => {
      expect(isTransferable(new Uint8Array(16))).toBe(false);
      expect(isTransferable(new Float64Array(16))).toBe(false);
    });

    it('should return false for plain objects', () => {
      expect(isTransferable({})).toBe(false);
      expect(isTransferable({ data: 'test' })).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isTransferable(null)).toBe(false);
      expect(isTransferable(undefined)).toBe(false);
      expect(isTransferable(42)).toBe(false);
      expect(isTransferable('string')).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isTransferable([1, 2, 3])).toBe(false);
    });
  });

  describe('getTransferableType', () => {
    it('should return "ArrayBuffer" for ArrayBuffer', () => {
      expect(getTransferableType(new ArrayBuffer(16))).toBe('ArrayBuffer');
    });

    it('should return null for non-transferable values', () => {
      expect(getTransferableType({})).toBeNull();
      expect(getTransferableType(null)).toBeNull();
      expect(getTransferableType(42)).toBeNull();
      expect(getTransferableType(new Uint8Array(16))).toBeNull();
    });
  });

  describe('getTransferableSize', () => {
    it('should return correct size for ArrayBuffer', () => {
      expect(getTransferableSize(new ArrayBuffer(1024))).toBe(1024);
      expect(getTransferableSize(new ArrayBuffer(0))).toBe(0);
    });
  });

  describe('detectTransferables', () => {
    it('should find ArrayBuffer in object', () => {
      const buffer = new ArrayBuffer(1024);
      const result = detectTransferables({ buffer, name: 'test' });

      expect(result.transferables).toHaveLength(1);
      expect(result.transferables[0].object).toBe(buffer);
      expect(result.transferables[0].type).toBe('ArrayBuffer');
      expect(result.totalSize).toBe(1024);
    });

    it('should find TypedArray buffer', () => {
      const array = new Float64Array([1.5, 2.5, 3.5]);
      const result = detectTransferables({ data: array });

      expect(result.transferables).toHaveLength(1);
      expect(result.transferables[0].object).toBe(array.buffer);
      expect(result.transferables[0].type).toBe('ArrayBuffer');
    });

    it('should find nested transferables', () => {
      const buffer = new ArrayBuffer(512);
      const data = {
        level1: {
          level2: {
            buffer,
          },
        },
      };
      const result = detectTransferables(data);

      expect(result.transferables).toHaveLength(1);
      expect(result.transferables[0].path).toBe('level1.level2.buffer');
    });

    it('should find multiple transferables', () => {
      const buf1 = new ArrayBuffer(256);
      const buf2 = new ArrayBuffer(512);
      const result = detectTransferables({ a: buf1, b: buf2 });

      expect(result.transferables).toHaveLength(2);
      expect(result.totalSize).toBe(768);
    });

    it('should not duplicate shared buffers', () => {
      const buffer = new ArrayBuffer(1024);
      const view1 = new Uint8Array(buffer);
      const view2 = new Float32Array(buffer);
      const result = detectTransferables({ view1, view2 });

      expect(result.transferables).toHaveLength(1);
    });

    it('should return empty result for primitives', () => {
      expect(detectTransferables(null).transferables).toHaveLength(0);
      expect(detectTransferables(undefined).transferables).toHaveLength(0);
      expect(detectTransferables(42).transferables).toHaveLength(0);
      expect(detectTransferables('test').transferables).toHaveLength(0);
    });

    it('should detect large buffers', () => {
      const largeBuffer = new ArrayBuffer(2 * 1024 * 1024); // 2MB
      const result = detectTransferables({ data: largeBuffer });

      expect(result.hasLargeBuffers).toBe(true);
    });

    it('should handle arrays of transferables', () => {
      const buffers = [new ArrayBuffer(100), new ArrayBuffer(200)];
      const result = detectTransferables(buffers);

      expect(result.transferables).toHaveLength(2);
      expect(result.totalSize).toBe(300);
    });
  });

  describe('hasTransferables', () => {
    it('should return true when object contains transferables', () => {
      expect(hasTransferables({ buffer: new ArrayBuffer(16) })).toBe(true);
      expect(hasTransferables(new ArrayBuffer(16))).toBe(true);
      expect(hasTransferables({ data: new Uint8Array(16) })).toBe(true);
    });

    it('should return false when object has no transferables', () => {
      expect(hasTransferables({})).toBe(false);
      expect(hasTransferables({ name: 'test', value: 42 })).toBe(false);
      expect(hasTransferables(null)).toBe(false);
      expect(hasTransferables([1, 2, 3])).toBe(false);
    });
  });

  describe('validateTransferables', () => {
    it('should validate valid transferables', () => {
      const buffer = new ArrayBuffer(16);
      const result = validateTransferables([buffer]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate transferables', () => {
      const buffer = new ArrayBuffer(16);
      const result = validateTransferables([buffer, buffer]);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });

    it('should warn about empty ArrayBuffers', () => {
      const buffer = new ArrayBuffer(0);
      const result = validateTransferables([buffer]);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('Empty'))).toBe(true);
    });

    it('should validate empty list', () => {
      const result = validateTransferables([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getTransferHint', () => {
    it('should recommend transfer for large buffers', () => {
      const largeBuffer = new ArrayBuffer(2 * 1024 * 1024);
      const hint = getTransferHint({ data: largeBuffer });

      expect(hint.shouldTransfer).toBe(true);
      expect(hint.impact).toBe('high');
    });

    it('should recommend transfer for medium buffers', () => {
      const buffer = new ArrayBuffer(50 * 1024); // 50KB
      const hint = getTransferHint({ data: buffer });

      expect(hint.shouldTransfer).toBe(true);
      expect(hint.impact).toBe('medium');
    });

    it('should not recommend transfer for no transferables', () => {
      const hint = getTransferHint({ name: 'test', value: 42 });

      expect(hint.shouldTransfer).toBe(false);
      expect(hint.impact).toBe('none');
    });

    it('should recommend transfer for small buffers with low impact', () => {
      const buffer = new ArrayBuffer(1024); // 1KB
      const hint = getTransferHint({ data: buffer });

      expect(hint.shouldTransfer).toBe(true);
      expect(hint.impact).toBe('low');
    });
  });
});
