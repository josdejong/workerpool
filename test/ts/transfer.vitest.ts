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
