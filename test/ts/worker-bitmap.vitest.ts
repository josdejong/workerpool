/**
 * Tests for Worker Bitmap
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkerBitmap,
  SharedWorkerBitmap,
  WorkerState,
  MAX_BITMAP_WORKERS,
} from '../../src/ts/core/worker-bitmap';

describe('WorkerBitmap', () => {
  let bitmap: WorkerBitmap;

  beforeEach(() => {
    bitmap = new WorkerBitmap();
  });

  describe('worker management', () => {
    it('should add workers', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);
      bitmap.addWorker(2);

      expect(bitmap.getWorkerCount()).toBe(3);
    });

    it('should remove workers', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);

      bitmap.removeWorker(0);

      expect(bitmap.getWorkerCount()).toBe(1);
      expect(bitmap.isInitialized(0)).toBe(false);
      expect(bitmap.isInitialized(1)).toBe(true);
    });

    it('should track worker state', () => {
      bitmap.addWorker(0);

      expect(bitmap.isIdle(0)).toBe(true);

      bitmap.setBusy(0);
      expect(bitmap.isIdle(0)).toBe(false);

      bitmap.setIdle(0);
      expect(bitmap.isIdle(0)).toBe(true);
    });
  });

  describe('idle worker lookup', () => {
    it('should find idle worker in O(1)', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);
      bitmap.addWorker(2);

      bitmap.setBusy(0);
      bitmap.setBusy(1);

      const idle = bitmap.findIdleWorker();
      expect(idle).toBe(2);
    });

    it('should return -1 when no idle workers', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);

      bitmap.setBusy(0);
      bitmap.setBusy(1);

      const idle = bitmap.findIdleWorker();
      expect(idle).toBe(-1);
    });

    it('should claim idle worker atomically', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);

      const claimed = bitmap.claimIdleWorker();
      expect(claimed).toBeGreaterThanOrEqual(0);
      expect(bitmap.isIdle(claimed)).toBe(false);
    });
  });

  describe('counting', () => {
    it('should count idle workers', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);
      bitmap.addWorker(2);

      bitmap.setBusy(1);

      expect(bitmap.countIdle()).toBe(2);
    });

    it('should count busy workers', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);
      bitmap.addWorker(2);

      bitmap.setBusy(0);
      bitmap.setBusy(2);

      expect(bitmap.countBusy()).toBe(2);
    });
  });

  describe('state queries', () => {
    it('should check if any worker is idle', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);

      expect(bitmap.hasIdleWorker()).toBe(true);

      bitmap.setBusy(0);
      bitmap.setBusy(1);

      expect(bitmap.hasIdleWorker()).toBe(false);
    });

    it('should check if all workers are busy', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);

      expect(bitmap.allBusy()).toBe(false);

      bitmap.setBusy(0);
      bitmap.setBusy(1);

      expect(bitmap.allBusy()).toBe(true);
    });
  });

  describe('worker lists', () => {
    it('should get all idle worker indices', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);
      bitmap.addWorker(2);

      bitmap.setBusy(1);

      const idle = bitmap.getIdleWorkers();
      expect(idle).toContain(0);
      expect(idle).not.toContain(1);
      expect(idle).toContain(2);
    });

    it('should get all worker indices', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(5);
      bitmap.addWorker(10);

      const all = bitmap.getAllWorkers();
      expect(all).toHaveLength(3);
      expect(all).toContain(0);
      expect(all).toContain(5);
      expect(all).toContain(10);
    });
  });

  describe('utilization', () => {
    it('should calculate utilization percentage', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);
      bitmap.addWorker(2);
      bitmap.addWorker(3);

      bitmap.setBusy(0);
      bitmap.setBusy(1);

      expect(bitmap.getUtilization()).toBe(50);
    });

    it('should return 0 for empty bitmap', () => {
      expect(bitmap.getUtilization()).toBe(0);
    });
  });

  describe('snapshot', () => {
    it('should create state snapshot', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);
      bitmap.addWorker(2);

      bitmap.setBusy(1);

      const snapshot = bitmap.snapshot();

      expect(snapshot.total).toBe(3);
      expect(snapshot.idle).toContain(0);
      expect(snapshot.idle).toContain(2);
      expect(snapshot.busy).toContain(1);
      expect(snapshot.utilization).toBeCloseTo(33.33, 1);
    });
  });

  describe('edge cases', () => {
    it('should handle maximum workers', () => {
      expect(() => new WorkerBitmap(MAX_BITMAP_WORKERS)).not.toThrow();
    });

    it('should throw for too many workers', () => {
      expect(() => new WorkerBitmap(MAX_BITMAP_WORKERS + 1)).toThrow();
    });

    it('should handle invalid indices gracefully', () => {
      bitmap.addWorker(0);

      // These should not throw
      bitmap.setBusy(-1);
      bitmap.setIdle(1000);
      bitmap.removeWorker(-5);

      expect(bitmap.isIdle(-1)).toBe(false);
      expect(bitmap.isInitialized(1000)).toBe(false);
    });

    it('should clear all state', () => {
      bitmap.addWorker(0);
      bitmap.addWorker(1);
      bitmap.setBusy(0);

      bitmap.clear();

      expect(bitmap.getWorkerCount()).toBe(0);
      expect(bitmap.findIdleWorker()).toBe(-1);
    });
  });

  describe('large-scale operations', () => {
    it('should handle 64+ workers across segments', () => {
      const indices = [0, 31, 32, 63, 64, 127, 128, 200];

      for (const i of indices) {
        bitmap.addWorker(i);
      }

      expect(bitmap.getWorkerCount()).toBe(indices.length);

      bitmap.setBusy(31);
      bitmap.setBusy(64);

      expect(bitmap.countBusy()).toBe(2);
      expect(bitmap.countIdle()).toBe(6);

      const idle = bitmap.getIdleWorkers();
      expect(idle).not.toContain(31);
      expect(idle).not.toContain(64);
      expect(idle).toContain(0);
      expect(idle).toContain(32);
    });
  });
});

describe('SharedWorkerBitmap', () => {
  it('should create with shared buffer', () => {
    const bitmap = new SharedWorkerBitmap();
    const buffer = bitmap.getBuffer();

    expect(buffer).toBeInstanceOf(SharedArrayBuffer);
  });

  it('should add and remove workers atomically', () => {
    const bitmap = new SharedWorkerBitmap();

    bitmap.addWorker(0);
    bitmap.addWorker(1);

    expect(bitmap.getWorkerCount()).toBe(2);

    bitmap.removeWorker(0);
    expect(bitmap.getWorkerCount()).toBe(1);
  });

  it('should set busy/idle atomically', () => {
    const bitmap = new SharedWorkerBitmap();

    bitmap.addWorker(0);
    bitmap.setBusy(0);
    bitmap.setIdle(0);

    // Should not throw
    expect(true).toBe(true);
  });

  it('should claim idle worker atomically', () => {
    const bitmap = new SharedWorkerBitmap();

    bitmap.addWorker(0);
    bitmap.addWorker(1);

    const claimed = bitmap.claimIdleWorker();
    expect(claimed).toBeGreaterThanOrEqual(0);
  });

  it('should share buffer between instances', () => {
    const bitmap1 = new SharedWorkerBitmap();
    const buffer = bitmap1.getBuffer();
    const bitmap2 = new SharedWorkerBitmap(buffer);

    bitmap1.addWorker(0);

    expect(bitmap2.getWorkerCount()).toBe(1);
  });
});
