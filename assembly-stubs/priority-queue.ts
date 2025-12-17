/**
 * Priority Queue Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of the AssemblyScript priority queue
 * functions for unit testing with vitest.
 *
 * Uses a binary heap for O(log n) push and pop operations.
 */

import { getCapacity, validateMemory } from './memory';

// Internal heap storage
interface HeapEntry {
  priority: number;
  slotIndex: number;
}

let _heap: HeapEntry[] = [];

/**
 * Parent index in heap
 */
function parentIndex(i: number): number {
  return Math.floor((i - 1) / 2);
}

/**
 * Left child index in heap
 */
function leftChildIndex(i: number): number {
  return 2 * i + 1;
}

/**
 * Right child index in heap
 */
function rightChildIndex(i: number): number {
  return 2 * i + 2;
}

/**
 * Sift up operation for heap insertion
 */
function siftUp(index: number): void {
  while (index > 0) {
    const parent = parentIndex(index);

    // Higher priority value = higher priority (compare inverted for min-heap behavior)
    if (_heap[parent].priority < _heap[index].priority) {
      // Swap
      const temp = _heap[parent];
      _heap[parent] = _heap[index];
      _heap[index] = temp;
      index = parent;
    } else {
      break;
    }
  }
}

/**
 * Sift down operation for heap extraction
 */
function siftDown(index: number): void {
  const size = _heap.length;

  while (true) {
    const left = leftChildIndex(index);
    const right = rightChildIndex(index);
    let largest = index;

    if (left < size && _heap[left].priority > _heap[largest].priority) {
      largest = left;
    }

    if (right < size && _heap[right].priority > _heap[largest].priority) {
      largest = right;
    }

    if (largest !== index) {
      // Swap
      const temp = _heap[largest];
      _heap[largest] = _heap[index];
      _heap[index] = temp;
      index = largest;
    } else {
      break;
    }
  }
}

/**
 * Initialize priority queue
 */
export function initPriorityQueue(): void {
  if (!validateMemory()) return;
  _heap = [];
}

/**
 * Get current priority queue size
 */
export function getPriorityQueueSize(): number {
  return _heap.length;
}

/**
 * Check if priority queue is empty
 */
export function isPriorityQueueEmpty(): boolean {
  return _heap.length === 0;
}

/**
 * Push an entry onto the priority queue
 */
export function priorityQueuePush(slotIndex: number, priority: number): boolean {
  if (!validateMemory()) return false;

  const capacity = getCapacity();

  if (_heap.length >= capacity) {
    return false; // Queue is full
  }

  _heap.push({ priority, slotIndex });
  siftUp(_heap.length - 1);

  return true;
}

/**
 * Pop the highest priority entry from the queue
 */
export function priorityQueuePop(): number {
  if (!validateMemory()) return 0xffffffff;

  if (_heap.length === 0) {
    return 0xffffffff; // Queue is empty
  }

  const root = _heap[0];

  if (_heap.length === 1) {
    _heap = [];
  } else {
    // Move last element to root and sift down
    _heap[0] = _heap[_heap.length - 1];
    _heap.pop();
    siftDown(0);
  }

  return root.slotIndex;
}

/**
 * Peek at the highest priority entry without removing it
 */
export function priorityQueuePeek(): number {
  if (!validateMemory()) return 0xffffffff;

  if (_heap.length === 0) {
    return 0xffffffff;
  }

  return _heap[0].slotIndex;
}

/**
 * Get the priority of the highest priority entry
 */
export function priorityQueuePeekPriority(): number {
  if (!validateMemory()) return 0;

  if (_heap.length === 0) {
    return 0;
  }

  return _heap[0].priority;
}

/**
 * Clear the priority queue
 */
export function priorityQueueClear(): void {
  if (!validateMemory()) return;
  _heap = [];
}

/**
 * Check if the priority queue is full
 */
export function isPriorityQueueFull(): boolean {
  if (!validateMemory()) return true;
  const capacity = getCapacity();
  return _heap.length >= capacity;
}

/**
 * Reset queue for testing
 */
export function _resetPriorityQueue(): void {
  _heap = [];
}
