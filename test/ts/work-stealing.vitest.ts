/**
 * Tests for Work-Stealing Task Distribution
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  WorkStealingDeque,
  WorkStealingScheduler,
  rebalanceTasks,
} from '../../src/ts/core/work-stealing';

describe('Work-Stealing Task Distribution', () => {
  describe('WorkStealingDeque', () => {
    let deque: WorkStealingDeque<string>;

    beforeEach(() => {
      deque = new WorkStealingDeque<string>(0);
    });

    it('should push and pop from bottom (LIFO)', () => {
      deque.pushBottom({ id: 1, data: 'task1', timestamp: Date.now() });
      deque.pushBottom({ id: 2, data: 'task2', timestamp: Date.now() });
      deque.pushBottom({ id: 3, data: 'task3', timestamp: Date.now() });

      // Pop should return most recent (LIFO)
      expect(deque.popBottom()?.data).toBe('task3');
      expect(deque.popBottom()?.data).toBe('task2');
      expect(deque.popBottom()?.data).toBe('task1');
    });

    it('should steal from top (FIFO)', () => {
      deque.pushBottom({ id: 1, data: 'task1', timestamp: Date.now() });
      deque.pushBottom({ id: 2, data: 'task2', timestamp: Date.now() });
      deque.pushBottom({ id: 3, data: 'task3', timestamp: Date.now() });

      // Steal should return oldest (FIFO)
      expect(deque.steal()?.data).toBe('task1');
      expect(deque.steal()?.data).toBe('task2');
      expect(deque.steal()?.data).toBe('task3');
    });

    it('should handle mixed push/pop/steal operations', () => {
      deque.pushBottom({ id: 1, data: 'task1', timestamp: Date.now() });
      deque.pushBottom({ id: 2, data: 'task2', timestamp: Date.now() });

      // Pop most recent
      expect(deque.popBottom()?.data).toBe('task2');

      // Push more
      deque.pushBottom({ id: 3, data: 'task3', timestamp: Date.now() });
      deque.pushBottom({ id: 4, data: 'task4', timestamp: Date.now() });

      // Steal oldest
      expect(deque.steal()?.data).toBe('task1');

      // Pop most recent
      expect(deque.popBottom()?.data).toBe('task4');
    });

    it('should batch steal up to half the queue', () => {
      for (let i = 1; i <= 10; i++) {
        deque.pushBottom({ id: i, data: `task${i}`, timestamp: Date.now() });
      }

      const stolen = deque.stealBatch(10); // Request 10, should get max 5 (half)
      expect(stolen.length).toBe(5);
      expect(deque.size).toBe(5);

      // Should have stolen oldest tasks
      expect(stolen[0].data).toBe('task1');
      expect(stolen[4].data).toBe('task5');
    });

    it('should track statistics', () => {
      deque.pushBottom({ id: 1, data: 'task1', timestamp: Date.now() });
      deque.pushBottom({ id: 2, data: 'task2', timestamp: Date.now() });
      deque.popBottom();
      deque.steal();

      const stats = deque.getStats();
      expect(stats.workerId).toBe(0);
      expect(stats.localPushCount).toBe(2);
      expect(stats.localPopCount).toBe(1);
      expect(stats.stealCount).toBe(1);
    });

    it('should return undefined for empty deque', () => {
      expect(deque.popBottom()).toBeUndefined();
      expect(deque.steal()).toBeUndefined();
      expect(deque.peekBottom()).toBeUndefined();
      expect(deque.peekTop()).toBeUndefined();
    });

    it('should report correct size', () => {
      expect(deque.size).toBe(0);
      expect(deque.isEmpty()).toBe(true);

      deque.pushBottom({ id: 1, data: 'task1', timestamp: Date.now() });
      expect(deque.size).toBe(1);
      expect(deque.isEmpty()).toBe(false);

      deque.pushBottom({ id: 2, data: 'task2', timestamp: Date.now() });
      expect(deque.size).toBe(2);

      deque.popBottom();
      expect(deque.size).toBe(1);
    });
  });

  describe('WorkStealingScheduler', () => {
    let scheduler: WorkStealingScheduler<string>;

    beforeEach(() => {
      scheduler = new WorkStealingScheduler({ stealingPolicy: 'busiest-first' });
    });

    it('should register and unregister workers', () => {
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);

      let stats = scheduler.getStats();
      expect(stats.workerCount).toBe(2);

      scheduler.unregisterWorker(0);
      stats = scheduler.getStats();
      expect(stats.workerCount).toBe(1);
    });

    it('should submit tasks to specific workers', () => {
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);

      scheduler.submit(0, 'task1');
      scheduler.submit(0, 'task2');
      scheduler.submit(1, 'task3');

      expect(scheduler.getTotalPendingTasks()).toBe(3);
    });

    it('should get tasks from local queue first', () => {
      scheduler.registerWorker(0);

      scheduler.submit(0, 'task1');
      scheduler.submit(0, 'task2');

      // Worker 0 should get its own tasks (LIFO)
      expect(scheduler.getTask(0)?.data).toBe('task2');
      expect(scheduler.getTask(0)?.data).toBe('task1');
    });

    it('should steal from other workers when local queue empty', () => {
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);

      // Submit all tasks to worker 0
      scheduler.submit(0, 'task1');
      scheduler.submit(0, 'task2');
      scheduler.submit(0, 'task3');

      // Worker 1 should steal from worker 0 (FIFO steal)
      const stolen = scheduler.getTask(1);
      expect(stolen?.data).toBe('task1');

      const stats = scheduler.getStats();
      expect(stats.totalSteals).toBe(1);
    });

    it('should batch steal from busiest worker', () => {
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);

      // Submit many tasks to worker 0
      for (let i = 1; i <= 10; i++) {
        scheduler.submit(0, `task${i}`);
      }

      // Worker 1 batch steals
      const stolen = scheduler.stealBatch(1, 5);
      expect(stolen.length).toBe(5);
      expect(stolen[0].data).toBe('task1'); // Oldest first
    });

    it('should calculate load imbalance', () => {
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);

      // Equal load
      scheduler.submit(0, 'task1');
      scheduler.submit(1, 'task2');
      expect(scheduler.getLoadImbalance()).toBe(1);

      // Imbalanced load
      scheduler.submit(0, 'task3');
      scheduler.submit(0, 'task4');
      scheduler.submit(0, 'task5');
      expect(scheduler.getLoadImbalance()).toBe(4); // 4/1
    });

    it('should identify busiest and least busy workers', () => {
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);
      scheduler.registerWorker(2);

      scheduler.submit(0, 'task1');
      scheduler.submit(0, 'task2');
      scheduler.submit(0, 'task3');
      scheduler.submit(1, 'task4');

      expect(scheduler.getBusiestWorker()).toBe(0);
      expect(scheduler.getLeastBusyWorker()).toBe(2);
    });

    it('should redistribute tasks when worker unregistered', () => {
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);

      scheduler.submit(0, 'task1');
      scheduler.submit(0, 'task2');

      const remaining = scheduler.unregisterWorker(0);
      expect(remaining.length).toBe(2);
    });

    describe('stealing policies', () => {
      it('should use busiest-first policy', () => {
        const busiestScheduler = new WorkStealingScheduler({ stealingPolicy: 'busiest-first' });
        busiestScheduler.registerWorker(0);
        busiestScheduler.registerWorker(1);
        busiestScheduler.registerWorker(2);

        // Make worker 1 the busiest
        busiestScheduler.submit(0, 'task1');
        busiestScheduler.submit(1, 'task2');
        busiestScheduler.submit(1, 'task3');
        busiestScheduler.submit(1, 'task4');

        // Worker 2 steals - should target worker 1 (busiest)
        const stolen = busiestScheduler.getTask(2);
        expect(stolen).not.toBeUndefined();
      });

      it('should use round-robin policy', () => {
        const rrScheduler = new WorkStealingScheduler({ stealingPolicy: 'round-robin' });
        rrScheduler.registerWorker(0);
        rrScheduler.registerWorker(1);
        rrScheduler.registerWorker(2);

        rrScheduler.submit(0, 'task1');
        rrScheduler.submit(1, 'task2');

        // Worker 2 steals using round-robin
        const stolen = rrScheduler.getTask(2);
        expect(stolen).not.toBeUndefined();
      });
    });
  });

  describe('rebalanceTasks', () => {
    it('should rebalance when imbalance exceeds threshold', () => {
      const scheduler = new WorkStealingScheduler();
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);

      // Create imbalance
      for (let i = 0; i < 10; i++) {
        scheduler.submit(0, `task${i}`);
      }

      const rebalanced = rebalanceTasks(scheduler, 2);
      expect(rebalanced).toBeGreaterThan(0);

      // Load should be more balanced
      const imbalance = scheduler.getLoadImbalance();
      expect(imbalance).toBeLessThan(10);
    });

    it('should not rebalance when below threshold', () => {
      const scheduler = new WorkStealingScheduler();
      scheduler.registerWorker(0);
      scheduler.registerWorker(1);

      scheduler.submit(0, 'task1');
      scheduler.submit(1, 'task2');

      const rebalanced = rebalanceTasks(scheduler, 3);
      expect(rebalanced).toBe(0);
    });
  });
});
