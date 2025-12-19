/**
 * CircularBuffer - O(1) fixed-size buffer with automatic eviction
 *
 * Replaces array.shift() patterns which have O(n) complexity.
 * Provides constant-time push and automatic oldest-element eviction.
 */

/**
 * CircularBuffer provides O(1) push operations with fixed memory footprint.
 *
 * When the buffer is full, new elements automatically evict the oldest.
 * This eliminates the O(n) cost of array.shift() operations.
 *
 * @example
 * ```typescript
 * const buffer = new CircularBuffer<number>(1000);
 *
 * // O(1) push, even when full
 * buffer.push(42);
 *
 * // Iterate over all elements (oldest to newest)
 * for (const value of buffer) {
 *   console.log(value);
 * }
 *
 * // Get as array for sorting/percentile calculations
 * const sorted = buffer.toArray().sort((a, b) => a - b);
 * ```
 */
export class CircularBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private readonly capacity: number;
  private head: number = 0;
  private _size: number = 0;

  /**
   * Create a new CircularBuffer
   * @param capacity - Maximum number of elements to store
   */
  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('Capacity must be positive');
    }
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Current number of elements in the buffer
   */
  get size(): number {
    return this._size;
  }

  /**
   * Maximum capacity of the buffer
   */
  get maxCapacity(): number {
    return this.capacity;
  }

  /**
   * Check if buffer is empty
   */
  get isEmpty(): boolean {
    return this._size === 0;
  }

  /**
   * Check if buffer is full
   */
  get isFull(): boolean {
    return this._size === this.capacity;
  }

  /**
   * Add an element to the buffer (O(1))
   *
   * If buffer is full, the oldest element is automatically evicted.
   *
   * @param item - Element to add
   */
  push(item: T): void {
    const index = (this.head + this._size) % this.capacity;
    this.buffer[index] = item;

    if (this._size < this.capacity) {
      this._size++;
    } else {
      // Buffer is full, advance head (evict oldest)
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Get the oldest element without removing it (O(1))
   * @returns Oldest element or undefined if empty
   */
  peek(): T | undefined {
    if (this._size === 0) return undefined;
    return this.buffer[this.head];
  }

  /**
   * Get the newest element without removing it (O(1))
   * @returns Newest element or undefined if empty
   */
  peekLast(): T | undefined {
    if (this._size === 0) return undefined;
    const index = (this.head + this._size - 1) % this.capacity;
    return this.buffer[index];
  }

  /**
   * Remove and return the oldest element (O(1))
   * @returns Oldest element or undefined if empty
   */
  shift(): T | undefined {
    if (this._size === 0) return undefined;

    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // Allow GC
    this.head = (this.head + 1) % this.capacity;
    this._size--;

    return item;
  }

  /**
   * Get element at index (0 = oldest, size-1 = newest) (O(1))
   * @param index - Index from oldest element
   * @returns Element at index or undefined if out of bounds
   */
  at(index: number): T | undefined {
    if (index < 0 || index >= this._size) return undefined;
    return this.buffer[(this.head + index) % this.capacity];
  }

  /**
   * Clear all elements (O(1) if no GC needed, O(n) to allow GC)
   */
  clear(): void {
    // Clear references for GC
    for (let i = 0; i < this._size; i++) {
      this.buffer[(this.head + i) % this.capacity] = undefined;
    }
    this.head = 0;
    this._size = 0;
  }

  /**
   * Convert to array (oldest to newest order) (O(n))
   * @returns Array copy of all elements
   */
  toArray(): T[] {
    const result: T[] = new Array(this._size);
    for (let i = 0; i < this._size; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity] as T;
    }
    return result;
  }

  /**
   * Filter elements matching predicate (O(n))
   * @param predicate - Filter function
   * @returns Array of matching elements
   */
  filter(predicate: (item: T, index: number) => boolean): T[] {
    const result: T[] = [];
    for (let i = 0; i < this._size; i++) {
      const item = this.buffer[(this.head + i) % this.capacity] as T;
      if (predicate(item, i)) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Reduce over all elements (O(n))
   * @param fn - Reducer function
   * @param initial - Initial value
   * @returns Reduced value
   */
  reduce<R>(fn: (acc: R, item: T, index: number) => R, initial: R): R {
    let acc = initial;
    for (let i = 0; i < this._size; i++) {
      const item = this.buffer[(this.head + i) % this.capacity] as T;
      acc = fn(acc, item, i);
    }
    return acc;
  }

  /**
   * Iterator support
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this._size; i++) {
      yield this.buffer[(this.head + i) % this.capacity] as T;
    }
  }
}

/**
 * TimeWindowBuffer - Circular buffer with automatic time-based eviction
 *
 * Maintains elements within a rolling time window.
 * Combines O(1) push with time-based pruning.
 */
export interface TimestampedValue<T> {
  timestamp: number;
  value: T;
}

export class TimeWindowBuffer<T> {
  private readonly buffer: CircularBuffer<TimestampedValue<T>>;
  private readonly windowMs: number;

  /**
   * Create a TimeWindowBuffer
   * @param windowMs - Time window in milliseconds
   * @param maxSize - Maximum elements to store
   */
  constructor(windowMs: number, maxSize: number = 10000) {
    this.windowMs = windowMs;
    this.buffer = new CircularBuffer<TimestampedValue<T>>(maxSize);
  }

  /**
   * Current number of elements
   */
  get size(): number {
    return this.buffer.size;
  }

  /**
   * Add a value with current timestamp
   */
  push(value: T): void {
    this.buffer.push({ timestamp: Date.now(), value });
  }

  /**
   * Add a value with specific timestamp
   */
  pushAt(timestamp: number, value: T): void {
    this.buffer.push({ timestamp, value });
  }

  /**
   * Get values within the time window
   */
  getValues(): T[] {
    const cutoff = Date.now() - this.windowMs;
    return this.buffer
      .filter(item => item.timestamp >= cutoff)
      .map(item => item.value);
  }

  /**
   * Get timestamped values within the time window
   */
  getTimestampedValues(): TimestampedValue<T>[] {
    const cutoff = Date.now() - this.windowMs;
    return this.buffer.filter(item => item.timestamp >= cutoff);
  }

  /**
   * Count values within the time window
   */
  countInWindow(): number {
    const cutoff = Date.now() - this.windowMs;
    return this.buffer.filter(item => item.timestamp >= cutoff).length;
  }

  /**
   * Sum numeric values within the time window
   */
  sumInWindow(): number {
    const cutoff = Date.now() - this.windowMs;
    return this.buffer
      .filter(item => item.timestamp >= cutoff)
      .reduce((sum, item) => sum + (item.value as unknown as number), 0);
  }

  /**
   * Clear all values
   */
  clear(): void {
    this.buffer.clear();
  }

  /**
   * Get all values as array (for percentile calculations)
   */
  toArray(): T[] {
    return this.buffer.toArray().map(item => item.value);
  }
}

export default CircularBuffer;
