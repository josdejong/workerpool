/**
 * Worker Bitmap
 *
 * Provides O(1) idle worker lookup using a bitmap data structure.
 * Uses bit manipulation for efficient tracking of worker states.
 *
 * Supports up to 256 workers with 4x 64-bit integers.
 */

/**
 * Maximum workers supported by bitmap
 */
export const MAX_BITMAP_WORKERS = 256;

/**
 * Bits per segment
 */
const BITS_PER_SEGMENT = 32;

/**
 * Number of segments
 */
const SEGMENT_COUNT = 8; // 8 * 32 = 256 bits

/**
 * Worker state in bitmap
 */
export enum WorkerState {
  /** Worker is idle and available */
  IDLE = 0,
  /** Worker is busy processing a task */
  BUSY = 1,
  /** Worker is terminating */
  TERMINATING = 2,
  /** Worker is not initialized */
  UNINITIALIZED = 3,
}

/**
 * Bitmap-based worker state tracker
 *
 * Provides O(1) operations for:
 * - Finding any idle worker
 * - Setting worker state
 * - Counting idle/busy workers
 */
export class WorkerBitmap {
  /** Bitmap segments for idle state (1 = idle, 0 = busy) */
  private idleBitmap: Uint32Array;

  /** Bitmap segments for initialization state (1 = initialized) */
  private initBitmap: Uint32Array;

  /** Total number of workers */
  private workerCount: number = 0;

  /** Lookup table for counting bits */
  private static readonly POPCOUNT_TABLE = WorkerBitmap.createPopcountTable();

  /** Lookup table for finding first set bit */
  private static readonly FFS_TABLE = WorkerBitmap.createFfsTable();

  constructor(maxWorkers: number = MAX_BITMAP_WORKERS) {
    if (maxWorkers > MAX_BITMAP_WORKERS) {
      throw new Error(`Maximum ${MAX_BITMAP_WORKERS} workers supported`);
    }
    this.idleBitmap = new Uint32Array(SEGMENT_COUNT);
    this.initBitmap = new Uint32Array(SEGMENT_COUNT);
  }

  /**
   * Create popcount lookup table for 8-bit values
   */
  private static createPopcountTable(): Uint8Array {
    const table = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      let count = 0;
      let n = i;
      while (n) {
        count += n & 1;
        n >>= 1;
      }
      table[i] = count;
    }
    return table;
  }

  /**
   * Create find-first-set lookup table for 8-bit values
   */
  private static createFfsTable(): Int8Array {
    const table = new Int8Array(256);
    table[0] = -1; // No bit set
    for (let i = 1; i < 256; i++) {
      for (let bit = 0; bit < 8; bit++) {
        if ((i & (1 << bit)) !== 0) {
          table[i] = bit;
          break;
        }
      }
    }
    return table;
  }

  /**
   * Count set bits in a 32-bit integer
   */
  private popcount32(n: number): number {
    const table = WorkerBitmap.POPCOUNT_TABLE;
    return (
      table[n & 0xff] +
      table[(n >> 8) & 0xff] +
      table[(n >> 16) & 0xff] +
      table[(n >> 24) & 0xff]
    );
  }

  /**
   * Find first set bit in a 32-bit integer
   * Returns -1 if no bit is set
   */
  private ffs32(n: number): number {
    if (n === 0) return -1;

    const table = WorkerBitmap.FFS_TABLE;

    // Check each byte
    const byte0 = n & 0xff;
    if (byte0 !== 0) return table[byte0];

    const byte1 = (n >> 8) & 0xff;
    if (byte1 !== 0) return 8 + table[byte1];

    const byte2 = (n >> 16) & 0xff;
    if (byte2 !== 0) return 16 + table[byte2];

    const byte3 = (n >> 24) & 0xff;
    return 24 + table[byte3];
  }

  /**
   * Add a new worker at the given index
   * Worker starts as idle
   */
  addWorker(index: number): void {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) {
      throw new Error(`Worker index ${index} out of range`);
    }

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const bit = index % BITS_PER_SEGMENT;
    const mask = 1 << bit;

    // Mark as initialized
    this.initBitmap[segment] |= mask;
    // Mark as idle
    this.idleBitmap[segment] |= mask;

    this.workerCount++;
  }

  /**
   * Remove a worker at the given index
   */
  removeWorker(index: number): void {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const bit = index % BITS_PER_SEGMENT;
    const mask = ~(1 << bit);

    // Mark as uninitialized
    this.initBitmap[segment] &= mask;
    // Mark as not idle
    this.idleBitmap[segment] &= mask;

    this.workerCount = Math.max(0, this.workerCount - 1);
  }

  /**
   * Mark worker as busy
   */
  setBusy(index: number): void {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const bit = index % BITS_PER_SEGMENT;

    // Clear idle bit
    this.idleBitmap[segment] &= ~(1 << bit);
  }

  /**
   * Mark worker as idle
   */
  setIdle(index: number): void {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const bit = index % BITS_PER_SEGMENT;

    // Check if worker is initialized
    if ((this.initBitmap[segment] & (1 << bit)) === 0) return;

    // Set idle bit
    this.idleBitmap[segment] |= 1 << bit;
  }

  /**
   * Check if worker is idle
   */
  isIdle(index: number): boolean {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return false;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const bit = index % BITS_PER_SEGMENT;

    return (this.idleBitmap[segment] & (1 << bit)) !== 0;
  }

  /**
   * Check if worker is initialized
   */
  isInitialized(index: number): boolean {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return false;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const bit = index % BITS_PER_SEGMENT;

    return (this.initBitmap[segment] & (1 << bit)) !== 0;
  }

  /**
   * Find any idle worker - O(1) average case
   * Returns -1 if no idle worker found
   */
  findIdleWorker(): number {
    for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
      const idle = this.idleBitmap[segment];
      if (idle !== 0) {
        const bit = this.ffs32(idle);
        if (bit >= 0) {
          return segment * BITS_PER_SEGMENT + bit;
        }
      }
    }
    return -1;
  }

  /**
   * Find and claim an idle worker atomically
   * Returns -1 if no idle worker found
   */
  claimIdleWorker(): number {
    const index = this.findIdleWorker();
    if (index >= 0) {
      this.setBusy(index);
    }
    return index;
  }

  /**
   * Count number of idle workers - O(1)
   */
  countIdle(): number {
    let count = 0;
    for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
      count += this.popcount32(this.idleBitmap[segment]);
    }
    return count;
  }

  /**
   * Count number of busy workers - O(1)
   */
  countBusy(): number {
    return this.workerCount - this.countIdle();
  }

  /**
   * Get total worker count
   */
  getWorkerCount(): number {
    return this.workerCount;
  }

  /**
   * Check if any worker is idle
   */
  hasIdleWorker(): boolean {
    for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
      if (this.idleBitmap[segment] !== 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if all workers are busy
   */
  allBusy(): boolean {
    return this.workerCount > 0 && !this.hasIdleWorker();
  }

  /**
   * Get all idle worker indices
   */
  getIdleWorkers(): number[] {
    const result: number[] = [];
    for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
      let idle = this.idleBitmap[segment];
      while (idle !== 0) {
        const bit = this.ffs32(idle);
        result.push(segment * BITS_PER_SEGMENT + bit);
        idle &= ~(1 << bit);
      }
    }
    return result;
  }

  /**
   * Get all initialized worker indices
   */
  getAllWorkers(): number[] {
    const result: number[] = [];
    for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
      let init = this.initBitmap[segment];
      while (init !== 0) {
        const bit = this.ffs32(init);
        result.push(segment * BITS_PER_SEGMENT + bit);
        init &= ~(1 << bit);
      }
    }
    return result;
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.idleBitmap.fill(0);
    this.initBitmap.fill(0);
    this.workerCount = 0;
  }

  /**
   * Get utilization percentage
   */
  getUtilization(): number {
    if (this.workerCount === 0) return 0;
    return (this.countBusy() / this.workerCount) * 100;
  }

  /**
   * Create a snapshot of current state
   */
  snapshot(): {
    idle: number[];
    busy: number[];
    total: number;
    utilization: number;
  } {
    const all = this.getAllWorkers();
    const idleSet = new Set(this.getIdleWorkers());
    const idle: number[] = [];
    const busy: number[] = [];

    for (const index of all) {
      if (idleSet.has(index)) {
        idle.push(index);
      } else {
        busy.push(index);
      }
    }

    return {
      idle,
      busy,
      total: this.workerCount,
      utilization: this.getUtilization(),
    };
  }
}

/**
 * Shared worker bitmap using SharedArrayBuffer for cross-thread access
 */
export class SharedWorkerBitmap {
  private idleBitmap: Int32Array;
  private initBitmap: Int32Array;
  private countView: Int32Array;
  private buffer: SharedArrayBuffer;

  constructor(buffer?: SharedArrayBuffer) {
    // Layout: 8 idle segments + 8 init segments + 1 count = 17 int32s = 68 bytes
    const size = (SEGMENT_COUNT * 2 + 1) * 4;
    this.buffer = buffer ?? new SharedArrayBuffer(size);
    this.idleBitmap = new Int32Array(this.buffer, 0, SEGMENT_COUNT);
    this.initBitmap = new Int32Array(this.buffer, SEGMENT_COUNT * 4, SEGMENT_COUNT);
    this.countView = new Int32Array(this.buffer, SEGMENT_COUNT * 2 * 4, 1);
  }

  /**
   * Get the shared buffer
   */
  getBuffer(): SharedArrayBuffer {
    return this.buffer;
  }

  /**
   * Atomically add a worker
   */
  addWorker(index: number): void {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const mask = 1 << (index % BITS_PER_SEGMENT);

    Atomics.or(this.initBitmap, segment, mask);
    Atomics.or(this.idleBitmap, segment, mask);
    Atomics.add(this.countView, 0, 1);
  }

  /**
   * Atomically remove a worker
   */
  removeWorker(index: number): void {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const mask = ~(1 << (index % BITS_PER_SEGMENT));

    Atomics.and(this.initBitmap, segment, mask);
    Atomics.and(this.idleBitmap, segment, mask);
    Atomics.sub(this.countView, 0, 1);
  }

  /**
   * Atomically set worker busy
   */
  setBusy(index: number): void {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const mask = ~(1 << (index % BITS_PER_SEGMENT));

    Atomics.and(this.idleBitmap, segment, mask);
  }

  /**
   * Atomically set worker idle
   */
  setIdle(index: number): void {
    if (index < 0 || index >= MAX_BITMAP_WORKERS) return;

    const segment = Math.floor(index / BITS_PER_SEGMENT);
    const mask = 1 << (index % BITS_PER_SEGMENT);

    Atomics.or(this.idleBitmap, segment, mask);
  }

  /**
   * Atomically claim an idle worker
   * Returns -1 if none available
   */
  claimIdleWorker(): number {
    for (let segment = 0; segment < SEGMENT_COUNT; segment++) {
      while (true) {
        const idle = Atomics.load(this.idleBitmap, segment);
        if (idle === 0) break;

        // Find first set bit
        let bit = 0;
        for (let i = 0; i < 32; i++) {
          if ((idle & (1 << i)) !== 0) {
            bit = i;
            break;
          }
        }

        const newValue = idle & ~(1 << bit);
        const old = Atomics.compareExchange(this.idleBitmap, segment, idle, newValue);
        if (old === idle) {
          return segment * BITS_PER_SEGMENT + bit;
        }
        // CAS failed, retry
      }
    }
    return -1;
  }

  /**
   * Get worker count
   */
  getWorkerCount(): number {
    return Atomics.load(this.countView, 0);
  }
}

export default WorkerBitmap;
