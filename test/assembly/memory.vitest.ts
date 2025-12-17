/**
 * Memory Module Tests
 *
 * Tests for the TypeScript stubs of the AssemblyScript memory module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HEADER_SIZE,
  SLOT_SIZE,
  DEFAULT_CAPACITY,
  MAGIC_NUMBER,
  VERSION,
  isPowerOf2,
  nextPowerOf2,
  calculateMemorySize,
  initMemory,
  validateMemory,
  getCapacity,
  getMask,
  getSlotsBase,
  getHead,
  getTail,
  getSlotAddress,
  _resetMemory,
} from '../../assembly-stubs/memory';

describe('Memory Module', () => {
  beforeEach(() => {
    _resetMemory();
  });

  describe('Constants', () => {
    it('should have correct header size', () => {
      expect(HEADER_SIZE).toBe(64);
    });

    it('should have correct slot size', () => {
      expect(SLOT_SIZE).toBe(64);
    });

    it('should have correct default capacity', () => {
      expect(DEFAULT_CAPACITY).toBe(1024);
    });

    it('should have correct magic number', () => {
      expect(MAGIC_NUMBER).toBe(0x57504f4c);
    });

    it('should have correct version', () => {
      expect(VERSION).toBe(1);
    });
  });

  describe('isPowerOf2', () => {
    it('should return true for powers of 2', () => {
      expect(isPowerOf2(1)).toBe(true);
      expect(isPowerOf2(2)).toBe(true);
      expect(isPowerOf2(4)).toBe(true);
      expect(isPowerOf2(8)).toBe(true);
      expect(isPowerOf2(16)).toBe(true);
      expect(isPowerOf2(32)).toBe(true);
      expect(isPowerOf2(64)).toBe(true);
      expect(isPowerOf2(128)).toBe(true);
      expect(isPowerOf2(256)).toBe(true);
      expect(isPowerOf2(512)).toBe(true);
      expect(isPowerOf2(1024)).toBe(true);
    });

    it('should return false for non-powers of 2', () => {
      expect(isPowerOf2(0)).toBe(false);
      expect(isPowerOf2(3)).toBe(false);
      expect(isPowerOf2(5)).toBe(false);
      expect(isPowerOf2(6)).toBe(false);
      expect(isPowerOf2(7)).toBe(false);
      expect(isPowerOf2(9)).toBe(false);
      expect(isPowerOf2(10)).toBe(false);
      expect(isPowerOf2(100)).toBe(false);
      expect(isPowerOf2(1000)).toBe(false);
    });
  });

  describe('nextPowerOf2', () => {
    it('should return 1 for 0', () => {
      expect(nextPowerOf2(0)).toBe(1);
    });

    it('should return same value for powers of 2', () => {
      expect(nextPowerOf2(1)).toBe(1);
      expect(nextPowerOf2(2)).toBe(2);
      expect(nextPowerOf2(4)).toBe(4);
      expect(nextPowerOf2(8)).toBe(8);
      expect(nextPowerOf2(16)).toBe(16);
    });

    it('should round up non-powers of 2', () => {
      expect(nextPowerOf2(3)).toBe(4);
      expect(nextPowerOf2(5)).toBe(8);
      expect(nextPowerOf2(6)).toBe(8);
      expect(nextPowerOf2(7)).toBe(8);
      expect(nextPowerOf2(9)).toBe(16);
      expect(nextPowerOf2(17)).toBe(32);
      expect(nextPowerOf2(100)).toBe(128);
      expect(nextPowerOf2(1000)).toBe(1024);
    });
  });

  describe('calculateMemorySize', () => {
    it('should calculate correct size for power of 2 capacity', () => {
      // HEADER_SIZE + (capacity * 8) + (capacity * SLOT_SIZE)
      const size = calculateMemorySize(16);
      expect(size).toBe(64 + 16 * 8 + 16 * 64);
    });

    it('should round up capacity to next power of 2', () => {
      const size = calculateMemorySize(10); // rounds to 16
      expect(size).toBe(64 + 16 * 8 + 16 * 64);
    });
  });

  describe('initMemory', () => {
    it('should initialize memory successfully', () => {
      const result = initMemory(16);
      expect(result).toBe(true);
    });

    it('should return false if already initialized', () => {
      initMemory(16);
      const result = initMemory(16);
      expect(result).toBe(false);
    });

    it('should validate after initialization', () => {
      expect(validateMemory()).toBe(false);
      initMemory(16);
      expect(validateMemory()).toBe(true);
    });
  });

  describe('validateMemory', () => {
    it('should return false before initialization', () => {
      expect(validateMemory()).toBe(false);
    });

    it('should return true after initialization', () => {
      initMemory(16);
      expect(validateMemory()).toBe(true);
    });
  });

  describe('getCapacity', () => {
    it('should return 0 before initialization', () => {
      expect(getCapacity()).toBe(0);
    });

    it('should return correct capacity after initialization', () => {
      initMemory(16);
      expect(getCapacity()).toBe(16);
    });

    it('should round capacity to next power of 2', () => {
      initMemory(10);
      expect(getCapacity()).toBe(16);
    });
  });

  describe('getMask', () => {
    it('should return 0 before initialization', () => {
      expect(getMask()).toBe(0);
    });

    it('should return capacity - 1 after initialization', () => {
      initMemory(16);
      expect(getMask()).toBe(15);
    });
  });

  describe('getSlotsBase', () => {
    it('should return 0 before initialization', () => {
      expect(getSlotsBase()).toBe(0);
    });

    it('should return correct slots base after initialization', () => {
      initMemory(16);
      // HEADER_SIZE + (capacity * 8)
      expect(getSlotsBase()).toBe(64 + 16 * 8);
    });
  });

  describe('getHead and getTail', () => {
    it('should return 0 before initialization', () => {
      expect(getHead()).toBe(BigInt(0));
      expect(getTail()).toBe(BigInt(0));
    });

    it('should return 0 after initialization', () => {
      initMemory(16);
      expect(getHead()).toBe(BigInt(0));
      expect(getTail()).toBe(BigInt(0));
    });
  });

  describe('getSlotAddress', () => {
    it('should calculate correct slot address', () => {
      initMemory(16);
      const slotsBase = getSlotsBase();

      expect(getSlotAddress(0)).toBe(slotsBase);
      expect(getSlotAddress(1)).toBe(slotsBase + SLOT_SIZE);
      expect(getSlotAddress(2)).toBe(slotsBase + 2 * SLOT_SIZE);
    });
  });
});
