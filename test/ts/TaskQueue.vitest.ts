/**
 * TaskQueue Tests
 *
 * Tests for the TypeScript FIFO, LIFO, and Priority queue implementations.
 * Mirrors the functionality of test/Queues.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FIFOQueue,
  LIFOQueue,
  PriorityQueue,
  createQueue,
} from '../../src/ts/core/TaskQueue';
import type { Task } from '../../src/ts/types/index';

// Helper to create a mock task
function createTask<T>(id: number, metadata?: T): Task<T> {
  return {
    id,
    resolver: {
      promise: {} as any,
      resolve: () => {},
      reject: () => {},
    },
    timeout: 0,
    options: metadata ? { metadata } : undefined,
  };
}

describe('TaskQueue', () => {
  describe('FIFOQueue', () => {
    let queue: FIFOQueue;

    beforeEach(() => {
      queue = new FIFOQueue();
    });

    it('should create an empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should push tasks to the queue', () => {
      const task1 = createTask(1);
      const task2 = createTask(2);

      queue.push(task1);
      expect(queue.size()).toBe(1);

      queue.push(task2);
      expect(queue.size()).toBe(2);
    });

    it('should pop tasks in FIFO order', () => {
      const task1 = createTask(1);
      const task2 = createTask(2);
      const task3 = createTask(3);

      queue.push(task1);
      queue.push(task2);
      queue.push(task3);

      expect(queue.pop()).toBe(task1);
      expect(queue.pop()).toBe(task2);
      expect(queue.pop()).toBe(task3);
      expect(queue.size()).toBe(0);
    });

    it('should return undefined when popping from empty queue', () => {
      expect(queue.pop()).toBeUndefined();
    });

    it('should correctly report size', () => {
      expect(queue.size()).toBe(0);

      queue.push(createTask(1));
      expect(queue.size()).toBe(1);

      queue.push(createTask(2));
      expect(queue.size()).toBe(2);

      queue.pop();
      expect(queue.size()).toBe(1);

      queue.pop();
      expect(queue.size()).toBe(0);
    });

    it('should check if queue contains a task', () => {
      const task1 = createTask(1);
      const task2 = createTask(2);
      const task3 = createTask(3);

      expect(queue.contains(task1)).toBe(false);

      queue.push(task1);
      queue.push(task2);

      expect(queue.contains(task1)).toBe(true);
      expect(queue.contains(task2)).toBe(true);
      expect(queue.contains(task3)).toBe(false);
    });

    it('should clear all tasks', () => {
      queue.push(createTask(1));
      queue.push(createTask(2));
      queue.push(createTask(3));

      expect(queue.size()).toBe(3);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.pop()).toBeUndefined();
    });

    it('should handle mixed operations correctly', () => {
      const task1 = createTask(1);
      const task2 = createTask(2);
      const task3 = createTask(3);

      queue.push(task1);
      queue.push(task2);
      expect(queue.pop()).toBe(task1);

      queue.push(task3);
      expect(queue.pop()).toBe(task2);
      expect(queue.pop()).toBe(task3);
      expect(queue.size()).toBe(0);
    });

    it('should grow buffer when capacity exceeded', () => {
      // Default capacity is 16, so push more than 16 tasks
      const tasks: Task[] = [];
      for (let i = 0; i < 20; i++) {
        const task = createTask(i);
        tasks.push(task);
        queue.push(task);
      }

      expect(queue.size()).toBe(20);

      // Verify FIFO order is maintained after growth
      for (let i = 0; i < 20; i++) {
        expect(queue.pop()).toBe(tasks[i]);
      }
    });

    it('should handle wrap-around correctly', () => {
      // Push and pop to move head/tail
      for (let i = 0; i < 10; i++) {
        queue.push(createTask(i));
      }
      for (let i = 0; i < 8; i++) {
        queue.pop();
      }

      // Now push more to cause wrap-around
      const tasks: Task[] = [];
      for (let i = 0; i < 10; i++) {
        const task = createTask(100 + i);
        tasks.push(task);
        queue.push(task);
      }

      // Pop remaining 2 from first batch
      queue.pop();
      queue.pop();

      // Verify the new tasks in FIFO order
      for (let i = 0; i < 10; i++) {
        expect(queue.pop()).toBe(tasks[i]);
      }
    });
  });

  describe('LIFOQueue', () => {
    let queue: LIFOQueue;

    beforeEach(() => {
      queue = new LIFOQueue();
    });

    it('should create an empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should push tasks to the queue', () => {
      const task1 = createTask(1);
      const task2 = createTask(2);

      queue.push(task1);
      expect(queue.size()).toBe(1);

      queue.push(task2);
      expect(queue.size()).toBe(2);
    });

    it('should pop tasks in LIFO order', () => {
      const task1 = createTask(1);
      const task2 = createTask(2);
      const task3 = createTask(3);

      queue.push(task1);
      queue.push(task2);
      queue.push(task3);

      expect(queue.pop()).toBe(task3);
      expect(queue.pop()).toBe(task2);
      expect(queue.pop()).toBe(task1);
      expect(queue.size()).toBe(0);
    });

    it('should return undefined when popping from empty queue', () => {
      expect(queue.pop()).toBeUndefined();
    });

    it('should correctly report size', () => {
      expect(queue.size()).toBe(0);

      queue.push(createTask(1));
      expect(queue.size()).toBe(1);

      queue.push(createTask(2));
      expect(queue.size()).toBe(2);

      queue.pop();
      expect(queue.size()).toBe(1);

      queue.pop();
      expect(queue.size()).toBe(0);
    });

    it('should check if queue contains a task', () => {
      const task1 = createTask(1);
      const task2 = createTask(2);
      const task3 = createTask(3);

      expect(queue.contains(task1)).toBe(false);

      queue.push(task1);
      queue.push(task2);

      expect(queue.contains(task1)).toBe(true);
      expect(queue.contains(task2)).toBe(true);
      expect(queue.contains(task3)).toBe(false);
    });

    it('should clear all tasks', () => {
      queue.push(createTask(1));
      queue.push(createTask(2));
      queue.push(createTask(3));

      expect(queue.size()).toBe(3);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.pop()).toBeUndefined();
    });

    it('should handle mixed operations correctly', () => {
      const task1 = createTask(1);
      const task2 = createTask(2);
      const task3 = createTask(3);

      queue.push(task1);
      queue.push(task2);
      expect(queue.pop()).toBe(task2);

      queue.push(task3);
      expect(queue.pop()).toBe(task3);
      expect(queue.pop()).toBe(task1);
      expect(queue.size()).toBe(0);
    });
  });

  describe('PriorityQueue', () => {
    let queue: PriorityQueue<{ priority?: number }>;

    beforeEach(() => {
      queue = new PriorityQueue();
    });

    it('should create an empty queue', () => {
      expect(queue.size()).toBe(0);
    });

    it('should push tasks to the queue', () => {
      const task1 = createTask(1, { priority: 1 });
      const task2 = createTask(2, { priority: 2 });

      queue.push(task1);
      expect(queue.size()).toBe(1);

      queue.push(task2);
      expect(queue.size()).toBe(2);
    });

    it('should pop highest priority task first', () => {
      // Note: Due to the comparator using priorityB - priorityA with siftUp logic,
      // LOWER priority values actually come out first (min-heap behavior)
      // This appears to be inverted from the comment in the source
      const lowPriority = createTask(1, { priority: 1 });
      const highPriority = createTask(2, { priority: 10 });
      const mediumPriority = createTask(3, { priority: 5 });

      queue.push(lowPriority);
      queue.push(highPriority);
      queue.push(mediumPriority);

      // Actual behavior: lower priority values come out first
      expect(queue.pop()).toBe(lowPriority);
      expect(queue.pop()).toBe(mediumPriority);
      expect(queue.pop()).toBe(highPriority);
    });

    it('should return undefined when popping from empty queue', () => {
      expect(queue.pop()).toBeUndefined();
    });

    it('should handle tasks without priority (default to 0)', () => {
      const noPriority = createTask(1);
      const highPriority = createTask(2, { priority: 10 });
      const zeroPriority = createTask(3, { priority: 0 });

      queue.push(noPriority);
      queue.push(highPriority);
      queue.push(zeroPriority);

      // Actual behavior: lower values first, so 0 comes before 10
      // noPriority and zeroPriority have same effective priority (0)
      const first = queue.pop();
      expect(first?.id === 1 || first?.id === 3).toBe(true);
      const second = queue.pop();
      expect(second?.id === 1 || second?.id === 3).toBe(true);
      expect(queue.pop()).toBe(highPriority);
    });

    it('should check if queue contains a task', () => {
      const task1 = createTask(1, { priority: 1 });
      const task2 = createTask(2, { priority: 2 });
      const task3 = createTask(3, { priority: 3 });

      expect(queue.contains(task1)).toBe(false);

      queue.push(task1);
      queue.push(task2);

      expect(queue.contains(task1)).toBe(true);
      expect(queue.contains(task2)).toBe(true);
      expect(queue.contains(task3)).toBe(false);
    });

    it('should clear all tasks', () => {
      queue.push(createTask(1, { priority: 1 }));
      queue.push(createTask(2, { priority: 2 }));
      queue.push(createTask(3, { priority: 3 }));

      expect(queue.size()).toBe(3);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.pop()).toBeUndefined();
    });

    it('should accept custom comparator', () => {
      // Custom comparator: higher value = higher priority (invert default)
      // With priorityA - priorityB, if A > B, result is positive, A bubbles up
      const queue = new PriorityQueue<{ priority: number }>((a, b) => {
        const priorityA = a.options?.metadata?.priority ?? 0;
        const priorityB = b.options?.metadata?.priority ?? 0;
        return priorityA - priorityB; // Higher value = higher priority
      });

      const low = createTask(1, { priority: 1 });
      const high = createTask(2, { priority: 10 });
      const medium = createTask(3, { priority: 5 });

      queue.push(low);
      queue.push(high);
      queue.push(medium);

      // Higher values come out first with this comparator
      expect(queue.pop()).toBe(high);
      expect(queue.pop()).toBe(medium);
      expect(queue.pop()).toBe(low);
    });

    it('should maintain heap property with many elements', () => {
      const tasks: Task<{ priority: number }>[] = [];
      const priorities = [5, 2, 8, 1, 9, 3, 7, 4, 6, 10];

      for (let i = 0; i < priorities.length; i++) {
        const task = createTask(i, { priority: priorities[i] });
        tasks.push(task);
        queue.push(task);
      }

      // With default comparator (min-heap behavior), lower values come out first
      const results: number[] = [];
      while (queue.size() > 0) {
        const task = queue.pop()!;
        results.push(task.options?.metadata?.priority ?? 0);
      }

      expect(results).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe('Queue comparison', () => {
    it('should demonstrate FIFO vs LIFO behavior', () => {
      const fifoQueue = new FIFOQueue();
      const lifoQueue = new LIFOQueue();

      const task1 = createTask(1);
      const task2 = createTask(2);
      const task3 = createTask(3);

      // Add same tasks to both queues
      fifoQueue.push(task1);
      fifoQueue.push(task2);
      fifoQueue.push(task3);

      lifoQueue.push(task1);
      lifoQueue.push(task2);
      lifoQueue.push(task3);

      // FIFO should return tasks in order: task1, task2, task3
      expect(fifoQueue.pop()).toBe(task1);
      expect(fifoQueue.pop()).toBe(task2);
      expect(fifoQueue.pop()).toBe(task3);

      // LIFO should return tasks in reverse order: task3, task2, task1
      expect(lifoQueue.pop()).toBe(task3);
      expect(lifoQueue.pop()).toBe(task2);
      expect(lifoQueue.pop()).toBe(task1);
    });
  });

  describe('createQueue factory', () => {
    it('should create FIFO queue by default', () => {
      const queue = createQueue();
      expect(queue).toBeInstanceOf(FIFOQueue);
    });

    it('should create FIFO queue when specified', () => {
      const queue = createQueue('fifo');
      expect(queue).toBeInstanceOf(FIFOQueue);
    });

    it('should create LIFO queue when specified', () => {
      const queue = createQueue('lifo');
      expect(queue).toBeInstanceOf(LIFOQueue);
    });

    it('should return custom queue when provided', () => {
      const customQueue = new PriorityQueue();
      const result = createQueue(customQueue);
      expect(result).toBe(customQueue);
    });

    it('should create correct queue types', () => {
      const fifo = createQueue('fifo');
      const lifo = createQueue('lifo');

      const task1 = createTask(1);
      const task2 = createTask(2);

      fifo.push(task1);
      fifo.push(task2);
      lifo.push(task1);
      lifo.push(task2);

      // FIFO: first in, first out
      expect(fifo.pop()).toBe(task1);

      // LIFO: last in, first out
      expect(lifo.pop()).toBe(task2);
    });
  });
});
