/**
 * Atomics Module Tests
 *
 * Tests for the atomic operations stubs.
 * Note: These test single-threaded behavior only - the stubs are NOT thread-safe.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  _resetAtomics,
  MAX_CAS_RETRIES,
  tryLock,
  acquireLock,
  releaseLock,
  atomicIncrement,
  atomicDecrement,
  atomicIncrement64,
  atomicDecrement64,
  atomicCompareExchange32,
  atomicCompareExchange64,
  atomicLoad32,
  atomicLoad64,
  atomicStore32,
  atomicStore64,
  atomicMax32,
  atomicMin32,
  memoryFence,
  seqlockWriteBegin,
  seqlockWriteEnd,
  seqlockReadBegin,
  seqlockReadValidate,
} from '../../../src/ts/assembly/stubs/atomics';

describe('Atomics Module', () => {
  beforeEach(() => {
    _resetAtomics();
  });

  describe('Spinlock operations', () => {
    it('should acquire free lock with tryLock', () => {
      const lockAddr = 100;

      const acquired = tryLock(lockAddr);

      expect(acquired).toBe(true);
    });

    it('should fail tryLock on held lock', () => {
      const lockAddr = 100;
      tryLock(lockAddr); // First acquire

      const acquired = tryLock(lockAddr);

      expect(acquired).toBe(false);
    });

    it('should release lock', () => {
      const lockAddr = 100;
      tryLock(lockAddr);

      releaseLock(lockAddr);
      const acquired = tryLock(lockAddr);

      expect(acquired).toBe(true);
    });

    it('should acquire lock with acquireLock', () => {
      const lockAddr = 200;

      const acquired = acquireLock(lockAddr);

      expect(acquired).toBe(true);
    });

    it('should fail acquireLock after max retries on held lock', () => {
      const lockAddr = 200;
      tryLock(lockAddr);

      // With lock held, acquireLock should fail after retries
      const acquired = acquireLock(lockAddr, 10);

      expect(acquired).toBe(false);
    });

    it('should use different locks independently', () => {
      const lock1 = 100;
      const lock2 = 200;

      expect(tryLock(lock1)).toBe(true);
      expect(tryLock(lock2)).toBe(true);
      expect(tryLock(lock1)).toBe(false);
      expect(tryLock(lock2)).toBe(false);
    });
  });

  describe('32-bit atomic operations', () => {
    it('should increment from zero', () => {
      const addr = 1000;

      const result = atomicIncrement(addr);

      expect(result).toBe(1);
      expect(atomicLoad32(addr)).toBe(1);
    });

    it('should increment multiple times', () => {
      const addr = 1000;

      atomicIncrement(addr);
      atomicIncrement(addr);
      const result = atomicIncrement(addr);

      expect(result).toBe(3);
    });

    it('should decrement', () => {
      const addr = 1000;
      atomicStore32(addr, 10);

      const result = atomicDecrement(addr);

      expect(result).toBe(9);
    });

    it('should decrement below zero', () => {
      const addr = 1000;

      const result = atomicDecrement(addr);

      expect(result).toBe(-1);
    });

    it('should load stored value', () => {
      const addr = 1000;
      atomicStore32(addr, 42);

      const value = atomicLoad32(addr);

      expect(value).toBe(42);
    });

    it('should return 0 for uninitialized address', () => {
      const addr = 9999;

      const value = atomicLoad32(addr);

      expect(value).toBe(0);
    });
  });

  describe('64-bit atomic operations', () => {
    it('should increment from zero', () => {
      const addr = 2000;

      const result = atomicIncrement64(addr);

      expect(result).toBe(BigInt(1));
    });

    it('should handle large 64-bit values', () => {
      const addr = 2000;
      const largeValue = BigInt('9007199254740993'); // > Number.MAX_SAFE_INTEGER
      atomicStore64(addr, largeValue);

      const loaded = atomicLoad64(addr);

      expect(loaded).toBe(largeValue);
    });

    it('should decrement 64-bit', () => {
      const addr = 2000;
      atomicStore64(addr, BigInt(100));

      const result = atomicDecrement64(addr);

      expect(result).toBe(BigInt(99));
    });
  });

  describe('Compare and exchange', () => {
    it('should exchange when expected matches', () => {
      const addr = 3000;
      atomicStore32(addr, 10);

      const success = atomicCompareExchange32(addr, 10, 20);

      expect(success).toBe(true);
      expect(atomicLoad32(addr)).toBe(20);
    });

    it('should not exchange when expected does not match', () => {
      const addr = 3000;
      atomicStore32(addr, 10);

      const success = atomicCompareExchange32(addr, 5, 20);

      expect(success).toBe(false);
      expect(atomicLoad32(addr)).toBe(10);
    });

    it('should CAS 64-bit when expected matches', () => {
      const addr = 3000;
      atomicStore64(addr, BigInt(100));

      const success = atomicCompareExchange64(addr, BigInt(100), BigInt(200));

      expect(success).toBe(true);
      expect(atomicLoad64(addr)).toBe(BigInt(200));
    });

    it('should not CAS 64-bit when expected does not match', () => {
      const addr = 3000;
      atomicStore64(addr, BigInt(100));

      const success = atomicCompareExchange64(addr, BigInt(50), BigInt(200));

      expect(success).toBe(false);
      expect(atomicLoad64(addr)).toBe(BigInt(100));
    });
  });

  describe('Atomic min/max', () => {
    it('should update max when value is greater', () => {
      const addr = 4000;
      atomicStore32(addr, 10);

      const oldValue = atomicMax32(addr, 20);

      expect(oldValue).toBe(10);
      expect(atomicLoad32(addr)).toBe(20);
    });

    it('should not update max when value is smaller', () => {
      const addr = 4000;
      atomicStore32(addr, 20);

      const oldValue = atomicMax32(addr, 10);

      expect(oldValue).toBe(20);
      expect(atomicLoad32(addr)).toBe(20);
    });

    it('should update min when value is smaller', () => {
      const addr = 4000;
      atomicStore32(addr, 20);

      const oldValue = atomicMin32(addr, 10);

      expect(oldValue).toBe(20);
      expect(atomicLoad32(addr)).toBe(10);
    });

    it('should not update min when value is greater', () => {
      const addr = 4000;
      atomicStore32(addr, 10);

      const oldValue = atomicMin32(addr, 20);

      expect(oldValue).toBe(10);
      expect(atomicLoad32(addr)).toBe(10);
    });
  });

  describe('Memory fence', () => {
    it('should not throw (no-op in stubs)', () => {
      expect(() => memoryFence()).not.toThrow();
    });
  });

  describe('Seqlock operations', () => {
    it('should begin write and increment sequence', () => {
      const seqAddr = 5000;

      const seq = seqlockWriteBegin(seqAddr);

      expect(seq).toBe(1);
    });

    it('should end write and increment sequence again', () => {
      const seqAddr = 5000;

      seqlockWriteBegin(seqAddr);
      seqlockWriteEnd(seqAddr);
      const readSeq = seqlockReadBegin(seqAddr);

      expect(readSeq).toBe(2); // Even number after write complete
    });

    it('should read begin with even sequence', () => {
      const seqAddr = 5000;

      // Complete write cycle
      seqlockWriteBegin(seqAddr);
      seqlockWriteEnd(seqAddr);

      const seq = seqlockReadBegin(seqAddr);

      expect(seq % 2).toBe(0); // Even sequence means no write in progress
    });

    it('should validate read when no concurrent write', () => {
      const seqAddr = 5000;
      seqlockWriteBegin(seqAddr);
      seqlockWriteEnd(seqAddr);

      const startSeq = seqlockReadBegin(seqAddr);
      // Simulate reading data (no concurrent writes in single-threaded test)
      const isValid = seqlockReadValidate(seqAddr, startSeq);

      expect(isValid).toBe(true);
    });

    it('should invalidate read when write occurred', () => {
      const seqAddr = 5000;
      seqlockWriteBegin(seqAddr);
      seqlockWriteEnd(seqAddr);

      const startSeq = seqlockReadBegin(seqAddr);
      // Simulate concurrent write
      seqlockWriteBegin(seqAddr);
      seqlockWriteEnd(seqAddr);
      const isValid = seqlockReadValidate(seqAddr, startSeq);

      expect(isValid).toBe(false);
    });
  });

  describe('Reset functionality', () => {
    it('should reset all state', () => {
      const lockAddr = 100;
      const mem32Addr = 1000;
      const mem64Addr = 2000;
      const seqAddr = 5000;

      tryLock(lockAddr);
      atomicStore32(mem32Addr, 42);
      atomicStore64(mem64Addr, BigInt(100));
      seqlockWriteBegin(seqAddr);
      seqlockWriteEnd(seqAddr);

      _resetAtomics();

      expect(tryLock(lockAddr)).toBe(true); // Lock should be free
      expect(atomicLoad32(mem32Addr)).toBe(0);
      expect(atomicLoad64(mem64Addr)).toBe(BigInt(0));
      expect(seqlockReadBegin(seqAddr)).toBe(0);
    });
  });

  describe('MAX_CAS_RETRIES constant', () => {
    it('should be exported and be a reasonable value', () => {
      expect(MAX_CAS_RETRIES).toBeDefined();
      expect(MAX_CAS_RETRIES).toBeGreaterThan(0);
      expect(MAX_CAS_RETRIES).toBe(1000);
    });
  });
});
