/**
 * Statistics Module Tests
 *
 * Tests for the statistics tracking stubs.
 * These validate correctness of the stats recording and retrieval.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { initMemory, _resetMemory } from '../../../src/ts/assembly/stubs/memory';
import {
  _resetStats,
  initStats,
  recordPush,
  recordPop,
  recordPushFailure,
  recordPopFailure,
  recordCASRetry,
  recordAllocation,
  recordFree,
  updatePeakSize,
  updatePeakAllocated,
  getPushCount,
  getPopCount,
  getPushFailures,
  getPopFailures,
  getCASRetries,
  getAllocationCount,
  getFreeCount,
  getPeakSize,
  getPeakAllocated,
  resetStats,
} from '../../../src/ts/assembly/stubs/stats';

describe('Statistics Module', () => {
  beforeEach(() => {
    _resetMemory();
    _resetStats();
    initMemory(4096);
    initStats();
  });

  describe('Push/Pop tracking', () => {
    it('should start with zero counts', () => {
      expect(getPushCount()).toBe(BigInt(0));
      expect(getPopCount()).toBe(BigInt(0));
    });

    it('should increment push count', () => {
      recordPush();
      expect(getPushCount()).toBe(BigInt(1));

      recordPush();
      recordPush();
      expect(getPushCount()).toBe(BigInt(3));
    });

    it('should increment pop count', () => {
      recordPop();
      expect(getPopCount()).toBe(BigInt(1));

      recordPop();
      recordPop();
      expect(getPopCount()).toBe(BigInt(3));
    });

    it('should track push and pop independently', () => {
      recordPush();
      recordPush();
      recordPop();

      expect(getPushCount()).toBe(BigInt(2));
      expect(getPopCount()).toBe(BigInt(1));
    });
  });

  describe('Failure tracking', () => {
    it('should start with zero failure counts', () => {
      expect(getPushFailures()).toBe(BigInt(0));
      expect(getPopFailures()).toBe(BigInt(0));
    });

    it('should increment push failure count', () => {
      recordPushFailure();
      recordPushFailure();
      expect(getPushFailures()).toBe(BigInt(2));
    });

    it('should increment pop failure count', () => {
      recordPopFailure();
      expect(getPopFailures()).toBe(BigInt(1));
    });

    it('should track failures independently from successful operations', () => {
      recordPush();
      recordPushFailure();
      recordPush();
      recordPushFailure();

      expect(getPushCount()).toBe(BigInt(2));
      expect(getPushFailures()).toBe(BigInt(2));
    });
  });

  describe('CAS retry tracking', () => {
    it('should start with zero CAS retries', () => {
      expect(getCASRetries()).toBe(BigInt(0));
    });

    it('should increment CAS retry count', () => {
      recordCASRetry();
      recordCASRetry();
      recordCASRetry();
      expect(getCASRetries()).toBe(BigInt(3));
    });
  });

  describe('Allocation tracking', () => {
    it('should start with zero allocation counts', () => {
      expect(getAllocationCount()).toBe(BigInt(0));
      expect(getFreeCount()).toBe(BigInt(0));
    });

    it('should track allocations', () => {
      recordAllocation();
      recordAllocation();
      expect(getAllocationCount()).toBe(BigInt(2));
    });

    it('should track frees', () => {
      recordFree();
      expect(getFreeCount()).toBe(BigInt(1));
    });

    it('should track allocations and frees independently', () => {
      recordAllocation();
      recordAllocation();
      recordAllocation();
      recordFree();

      expect(getAllocationCount()).toBe(BigInt(3));
      expect(getFreeCount()).toBe(BigInt(1));
    });
  });

  describe('Peak tracking', () => {
    it('should start with zero peak values', () => {
      expect(getPeakSize()).toBe(0);
      expect(getPeakAllocated()).toBe(0);
    });

    it('should update peak size when current exceeds peak', () => {
      updatePeakSize(10);
      expect(getPeakSize()).toBe(10);

      updatePeakSize(5);
      expect(getPeakSize()).toBe(10); // Should not decrease

      updatePeakSize(15);
      expect(getPeakSize()).toBe(15);
    });

    it('should update peak allocated when current exceeds peak', () => {
      updatePeakAllocated(100);
      expect(getPeakAllocated()).toBe(100);

      updatePeakAllocated(50);
      expect(getPeakAllocated()).toBe(100); // Should not decrease

      updatePeakAllocated(200);
      expect(getPeakAllocated()).toBe(200);
    });
  });

  describe('Reset functionality', () => {
    it('should reset all stats to zero', () => {
      // Record various stats
      recordPush();
      recordPush();
      recordPop();
      recordPushFailure();
      recordPopFailure();
      recordCASRetry();
      recordAllocation();
      recordFree();
      updatePeakSize(100);
      updatePeakAllocated(50);

      // Reset
      resetStats();

      // Verify all reset
      expect(getPushCount()).toBe(BigInt(0));
      expect(getPopCount()).toBe(BigInt(0));
      expect(getPushFailures()).toBe(BigInt(0));
      expect(getPopFailures()).toBe(BigInt(0));
      expect(getCASRetries()).toBe(BigInt(0));
      expect(getAllocationCount()).toBe(BigInt(0));
      expect(getFreeCount()).toBe(BigInt(0));
      expect(getPeakSize()).toBe(0);
      expect(getPeakAllocated()).toBe(0);
    });
  });

  describe('High volume operations', () => {
    it('should handle many operations without overflow', () => {
      const count = 10000;

      for (let i = 0; i < count; i++) {
        recordPush();
        recordPop();
      }

      expect(getPushCount()).toBe(BigInt(count));
      expect(getPopCount()).toBe(BigInt(count));
    });

    it('should track accurate peak across many updates', () => {
      const values = [10, 5, 20, 15, 25, 10, 30, 5];
      let maxSeen = 0;

      for (const val of values) {
        updatePeakSize(val);
        maxSeen = Math.max(maxSeen, val);
      }

      expect(getPeakSize()).toBe(maxSeen);
      expect(getPeakSize()).toBe(30);
    });
  });
});
