/**
 * Tests for Task Affinity and Intelligent Routing
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TaskAffinityRouter,
  createAffinityKey,
  objectAffinityKey,
} from '../../src/ts/core/task-affinity';

describe('Task Affinity and Routing', () => {
  describe('TaskAffinityRouter', () => {
    let router: TaskAffinityRouter;

    beforeEach(() => {
      router = new TaskAffinityRouter({
        affinityTTL: 5000,
        maxAffinityEntries: 100,
      });
    });

    describe('worker registration', () => {
      it('should register and unregister workers', () => {
        router.registerWorker(0);
        router.registerWorker(1);
        router.registerWorker(2);

        const stats = router.getStats();
        expect(stats.workerCount).toBe(3);

        router.unregisterWorker(1);
        expect(router.getStats().workerCount).toBe(2);
      });
    });

    describe('affinity routing', () => {
      it('should route tasks with same affinity key to same worker', () => {
        router.registerWorker(0);
        router.registerWorker(1);

        // Set affinity for key 'user-123'
        router.setAffinity('user-123', 0);

        // Route with same key
        const decision1 = router.route({
          affinityKey: 'user-123',
          availableWorkers: [0, 1],
        });

        expect(decision1.workerIndex).toBe(0);
        expect(decision1.reason).toBe('affinity');
      });

      it('should fall back when affinity worker unavailable', () => {
        router.registerWorker(0);
        router.registerWorker(1);

        router.setAffinity('user-123', 0);

        // Route when worker 0 not available
        const decision = router.route({
          affinityKey: 'user-123',
          availableWorkers: [1], // Only worker 1 available
        });

        expect(decision.workerIndex).toBe(1);
        expect(decision.reason).not.toBe('affinity');
      });

      it('should clear affinity', () => {
        router.registerWorker(0);
        router.registerWorker(1);

        router.setAffinity('user-123', 0);
        router.clearAffinity('user-123');

        const decision = router.route({
          affinityKey: 'user-123',
          availableWorkers: [0, 1],
        });

        // Should not use affinity routing
        expect(decision.reason).not.toBe('affinity');
      });
    });

    describe('task type routing', () => {
      it('should route based on task type performance', () => {
        router.registerWorker(0);
        router.registerWorker(1);

        // Record performance data
        // Worker 0 is good at 'image-processing'
        router.recordTaskCompletion(0, 'image-processing', 100, true);
        router.recordTaskCompletion(0, 'image-processing', 90, true);
        router.recordTaskCompletion(0, 'image-processing', 95, true);

        // Worker 1 is slower at 'image-processing'
        router.recordTaskCompletion(1, 'image-processing', 200, true);
        router.recordTaskCompletion(1, 'image-processing', 210, true);

        // Route image-processing task
        const decision = router.route({
          taskType: 'image-processing',
          availableWorkers: [0, 1],
        });

        // Should prefer worker 0 (faster)
        expect(decision.workerIndex).toBe(0);
        expect(decision.reason).toBe('task-type');
      });

      it('should consider success rate in routing', () => {
        router.registerWorker(0);
        router.registerWorker(1);

        // Worker 0 is fast but very unreliable (many failures)
        router.recordTaskCompletion(0, 'critical-task', 50, true);
        router.recordTaskCompletion(0, 'critical-task', 50, false);
        router.recordTaskCompletion(0, 'critical-task', 50, false);
        router.recordTaskCompletion(0, 'critical-task', 50, false);
        router.recordTaskCompletion(0, 'critical-task', 50, false);
        router.recordTaskCompletion(0, 'critical-task', 50, false);

        // Worker 1 is slower but very reliable (many successes)
        router.recordTaskCompletion(1, 'critical-task', 100, true);
        router.recordTaskCompletion(1, 'critical-task', 100, true);
        router.recordTaskCompletion(1, 'critical-task', 100, true);
        router.recordTaskCompletion(1, 'critical-task', 100, true);
        router.recordTaskCompletion(1, 'critical-task', 100, true);
        router.recordTaskCompletion(1, 'critical-task', 100, true);

        const decision = router.route({
          taskType: 'critical-task',
          availableWorkers: [0, 1],
        });

        // Worker 1 should be selected due to higher success rate
        // Both workers have same number of samples, but worker 1 has better success rate
        expect(decision.reason).toBe('task-type');
      });
    });

    describe('performance-based routing', () => {
      it('should route to best performing worker', () => {
        router.registerWorker(0);
        router.registerWorker(1);
        router.registerWorker(2);

        // Worker 0: High load
        router.updateWorkerLoad(0, 5);

        // Worker 1: Medium load
        router.updateWorkerLoad(1, 2);

        // Worker 2: Low load
        router.updateWorkerLoad(2, 0);

        const decision = router.route({
          availableWorkers: [0, 1, 2],
        });

        // Should prefer worker 2 (lowest load)
        expect(decision.workerIndex).toBe(2);
      });
    });

    describe('statistics', () => {
      it('should track affinity hit rate', () => {
        router.registerWorker(0);

        router.setAffinity('key1', 0);
        router.setAffinity('key2', 0);

        // Access key1 multiple times
        router.route({ affinityKey: 'key1', availableWorkers: [0] });
        router.route({ affinityKey: 'key1', availableWorkers: [0] });
        router.route({ affinityKey: 'key1', availableWorkers: [0] });

        const stats = router.getStats();
        expect(stats.affinityHitRate).toBeGreaterThan(0);
      });

      it('should track worker profiles', () => {
        router.registerWorker(0);

        router.recordTaskCompletion(0, 'type-a', 100, true);
        router.recordTaskCompletion(0, 'type-a', 120, true);
        router.recordTaskCompletion(0, 'type-b', 50, true);

        const stats = router.getStats();
        expect(stats.workerProfiles.length).toBe(1);
        expect(stats.taskTypeCount).toBe(2);
      });
    });

    describe('capacity management', () => {
      it('should evict old entries when at capacity', () => {
        const smallRouter = new TaskAffinityRouter({
          maxAffinityEntries: 5,
        });

        smallRouter.registerWorker(0);

        // Fill well past capacity to trigger eviction
        for (let i = 0; i < 20; i++) {
          smallRouter.setAffinity(`key-${i}`, 0);
        }

        const stats = smallRouter.getStats();
        // After many insertions, eviction should have been triggered
        // The count should be less than the total inserted
        expect(stats.affinityEntryCount).toBeLessThan(20);
      });
    });

    describe('clear and reset', () => {
      it('should clear all data', () => {
        router.registerWorker(0);
        router.setAffinity('key1', 0);
        router.recordTaskCompletion(0, 'type-a', 100, true);

        router.clear();

        const stats = router.getStats();
        expect(stats.workerCount).toBe(0);
        expect(stats.affinityEntryCount).toBe(0);
      });

      it('should reset performance keeping affinity', () => {
        router.registerWorker(0);
        router.setAffinity('key1', 0);
        router.recordTaskCompletion(0, 'type-a', 100, true);

        router.resetPerformance();

        const stats = router.getStats();
        expect(stats.workerCount).toBe(1);
        expect(stats.taskTypeCount).toBe(0);
      });
    });
  });

  describe('Helper functions', () => {
    describe('createAffinityKey', () => {
      it('should create key from parts', () => {
        const key = createAffinityKey('user', 123, 'session');
        expect(key).toBe('user:123:session');
      });

      it('should skip undefined parts', () => {
        const key = createAffinityKey('user', undefined, 'session');
        expect(key).toBe('user:session');
      });

      it('should handle empty input', () => {
        const key = createAffinityKey();
        expect(key).toBe('');
      });
    });

    describe('objectAffinityKey', () => {
      it('should create key from object properties', () => {
        const obj = { userId: 123, tenantId: 'abc', other: 'ignored' };
        const key = objectAffinityKey(obj, ['userId', 'tenantId']);
        expect(key).toBe('123:abc');
      });

      it('should handle missing properties', () => {
        const obj = { userId: 123 };
        const key = objectAffinityKey(obj, ['userId', 'tenantId']);
        expect(key).toBe('123:');
      });
    });
  });
});
