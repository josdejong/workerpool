/**
 * Task Queue Implementations for workerpool
 *
 * Provides FIFO, LIFO, and Priority queue implementations
 * with a factory function for creating queues based on strategy.
 *
 * Uses GrowableCircularBuffer for efficient O(1) operations.
 */

import type { Task, TaskQueue, QueueStrategy } from '../types/index';
import { GrowableCircularBuffer } from './circular-buffer';

/**
 * FIFO Queue using GrowableCircularBuffer for O(1) push/pop operations
 * Uses power-of-2 sizing for fast modulo via bitwise AND
 *
 * @template T - Task metadata type
 */
export class FIFOQueue<T = unknown> implements TaskQueue<T> {
  private buffer: GrowableCircularBuffer<Task<T>>;

  /**
   * Create a new FIFO queue
   * @param initialCapacity - Initial capacity (will be rounded up to power of 2)
   */
  constructor(initialCapacity = 16) {
    this.buffer = new GrowableCircularBuffer<Task<T>>(initialCapacity);
  }

  /**
   * Add a task to the end of the queue
   * Amortized O(1) time complexity
   */
  push(task: Task<T>): void {
    this.buffer.push(task);
  }

  /**
   * Remove and return the task at the front of the queue
   * O(1) time complexity
   */
  pop(): Task<T> | undefined {
    return this.buffer.shift();
  }

  /**
   * Get the number of tasks in the queue
   * O(1) time complexity
   */
  size(): number {
    return this.buffer.size;
  }

  /**
   * Check if a task is in the queue
   * O(n) time complexity
   */
  contains(task: Task<T>): boolean {
    return this.buffer.contains(task);
  }

  /**
   * Remove all tasks from the queue
   * O(n) time complexity (clears references for GC)
   */
  clear(): void {
    this.buffer.clear();
  }
}

/**
 * LIFO Queue (Stack) implementation
 * O(1) push and pop operations
 *
 * @template T - Task metadata type
 */
export class LIFOQueue<T = unknown> implements TaskQueue<T> {
  private tasks: Array<Task<T>> = [];

  /**
   * Add a task to the top of the stack
   * O(1) time complexity
   */
  push(task: Task<T>): void {
    this.tasks.push(task);
  }

  /**
   * Remove and return the task at the top of the stack
   * O(1) time complexity
   */
  pop(): Task<T> | undefined {
    return this.tasks.pop();
  }

  /**
   * Get the number of tasks in the queue
   * O(1) time complexity
   */
  size(): number {
    return this.tasks.length;
  }

  /**
   * Check if a task is in the queue
   * O(n) time complexity
   */
  contains(task: Task<T>): boolean {
    return this.tasks.includes(task);
  }

  /**
   * Remove all tasks from the queue
   * O(1) time complexity
   */
  clear(): void {
    this.tasks.length = 0;
  }
}

/**
 * Priority comparator function type
 */
export type PriorityComparator<T> = (a: Task<T>, b: Task<T>) => number;

/**
 * Default priority comparator - higher priority value = higher priority
 * Assumes task.options?.metadata?.priority is a number
 */
function defaultPriorityComparator<T>(a: Task<T>, b: Task<T>): number {
  const priorityA = (a.options?.metadata as { priority?: number } | undefined)?.priority ?? 0;
  const priorityB = (b.options?.metadata as { priority?: number } | undefined)?.priority ?? 0;
  return priorityB - priorityA; // Higher priority first
}

/**
 * Priority Queue using binary heap
 * O(log n) push, O(log n) pop operations
 *
 * @template T - Task metadata type
 */
export class PriorityQueue<T = unknown> implements TaskQueue<T> {
  private heap: Array<Task<T>> = [];
  private comparator: PriorityComparator<T>;

  /**
   * Create a new priority queue
   * @param comparator - Function to compare task priorities (default: by metadata.priority)
   */
  constructor(comparator?: PriorityComparator<T>) {
    this.comparator = comparator ?? defaultPriorityComparator;
  }

  /**
   * Add a task to the queue
   * O(log n) time complexity
   */
  push(task: Task<T>): void {
    this.heap.push(task);
    this.siftUp(this.heap.length - 1);
  }

  /**
   * Remove and return the highest priority task
   * O(log n) time complexity
   */
  pop(): Task<T> | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const result = this.heap[0];

    if (this.heap.length === 1) {
      this.heap.pop();
    } else {
      // Move last element to root and sift down
      this.heap[0] = this.heap.pop()!;
      this.siftDown(0);
    }

    return result;
  }

  /**
   * Get the number of tasks in the queue
   * O(1) time complexity
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Check if a task is in the queue
   * O(n) time complexity
   */
  contains(task: Task<T>): boolean {
    return this.heap.includes(task);
  }

  /**
   * Remove all tasks from the queue
   * O(1) time complexity
   */
  clear(): void {
    this.heap.length = 0;
  }

  /**
   * Restore heap property by moving element up
   */
  private siftUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.comparator(this.heap[index], this.heap[parentIndex]) <= 0) {
        break;
      }
      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  /**
   * Restore heap property by moving element down
   */
  private siftDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      const leftChild = (index << 1) + 1;
      const rightChild = leftChild + 1;
      let largest = index;

      if (
        leftChild < length &&
        this.comparator(this.heap[leftChild], this.heap[largest]) > 0
      ) {
        largest = leftChild;
      }

      if (
        rightChild < length &&
        this.comparator(this.heap[rightChild], this.heap[largest]) > 0
      ) {
        largest = rightChild;
      }

      if (largest === index) {
        break;
      }

      this.swap(index, largest);
      index = largest;
    }
  }

  /**
   * Swap two elements in the heap
   */
  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

/**
 * Create a task queue based on strategy
 * @param strategy - Queue strategy: 'fifo', 'lifo', or custom TaskQueue
 * @returns TaskQueue instance
 */
export function createQueue<T = unknown>(
  strategy: QueueStrategy | TaskQueue<T> = 'fifo'
): TaskQueue<T> {
  if (typeof strategy === 'object' && strategy !== null) {
    // Custom queue provided
    return strategy;
  }

  switch (strategy) {
    case 'lifo':
      return new LIFOQueue<T>();
    case 'fifo':
    default:
      return new FIFOQueue<T>();
  }
}

/**
 * Default export for backward compatibility
 */
export default {
  FIFOQueue,
  LIFOQueue,
  PriorityQueue,
  createQueue,
};
