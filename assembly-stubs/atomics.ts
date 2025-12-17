/**
 * Atomics Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of atomic operations
 * for unit testing with vitest.
 *
 * Note: These are NOT thread-safe - they're for single-threaded testing only.
 */

export const MAX_CAS_RETRIES = 1000;

// Lock state constants
const LOCK_FREE = 0;
const LOCK_HELD = 1;

// Internal storage for locks
const _locks = new Map<number, number>();
const _memory32 = new Map<number, number>();
const _memory64 = new Map<number, bigint>();
const _seqlocks = new Map<number, number>();

/**
 * Try to acquire a spinlock
 */
export function tryLock(lockAddr: number): boolean {
  const current = _locks.get(lockAddr) ?? LOCK_FREE;
  if (current === LOCK_FREE) {
    _locks.set(lockAddr, LOCK_HELD);
    return true;
  }
  return false;
}

/**
 * Acquire a spinlock with spinning
 */
export function acquireLock(lockAddr: number, maxRetries = MAX_CAS_RETRIES): boolean {
  for (let i = 0; i < maxRetries; i++) {
    if (tryLock(lockAddr)) {
      return true;
    }
  }
  return false;
}

/**
 * Release a spinlock
 */
export function releaseLock(lockAddr: number): void {
  _locks.set(lockAddr, LOCK_FREE);
}

/**
 * Atomically increment a u32 counter
 */
export function atomicIncrement(addr: number): number {
  const current = _memory32.get(addr) ?? 0;
  _memory32.set(addr, current + 1);
  return current + 1;
}

/**
 * Atomically decrement a u32 counter
 */
export function atomicDecrement(addr: number): number {
  const current = _memory32.get(addr) ?? 0;
  _memory32.set(addr, current - 1);
  return current - 1;
}

/**
 * Atomically increment a u64 counter
 */
export function atomicIncrement64(addr: number): bigint {
  const current = _memory64.get(addr) ?? BigInt(0);
  _memory64.set(addr, current + BigInt(1));
  return current + BigInt(1);
}

/**
 * Atomically decrement a u64 counter
 */
export function atomicDecrement64(addr: number): bigint {
  const current = _memory64.get(addr) ?? BigInt(0);
  _memory64.set(addr, current - BigInt(1));
  return current - BigInt(1);
}

/**
 * Atomically compare and exchange u32
 */
export function atomicCompareExchange32(addr: number, expected: number, desired: number): boolean {
  const current = _memory32.get(addr) ?? 0;
  if (current === expected) {
    _memory32.set(addr, desired);
    return true;
  }
  return false;
}

/**
 * Atomically compare and exchange u64
 */
export function atomicCompareExchange64(addr: number, expected: bigint, desired: bigint): boolean {
  const current = _memory64.get(addr) ?? BigInt(0);
  if (current === expected) {
    _memory64.set(addr, desired);
    return true;
  }
  return false;
}

/**
 * Atomically load a u32 value
 */
export function atomicLoad32(addr: number): number {
  return _memory32.get(addr) ?? 0;
}

/**
 * Atomically load a u64 value
 */
export function atomicLoad64(addr: number): bigint {
  return _memory64.get(addr) ?? BigInt(0);
}

/**
 * Atomically store a u32 value
 */
export function atomicStore32(addr: number, value: number): void {
  _memory32.set(addr, value);
}

/**
 * Atomically store a u64 value
 */
export function atomicStore64(addr: number, value: bigint): void {
  _memory64.set(addr, value);
}

/**
 * Atomically get the maximum
 */
export function atomicMax32(addr: number, value: number): number {
  const current = _memory32.get(addr) ?? 0;
  if (value > current) {
    _memory32.set(addr, value);
  }
  return current;
}

/**
 * Atomically get the minimum
 */
export function atomicMin32(addr: number, value: number): number {
  const current = _memory32.get(addr) ?? 0;
  if (value < current) {
    _memory32.set(addr, value);
  }
  return current;
}

/**
 * Memory fence (no-op in single-threaded testing)
 */
export function memoryFence(): void {
  // No-op for testing
}

/**
 * Begin a write operation on a seqlock
 */
export function seqlockWriteBegin(seqAddr: number): number {
  const seq = (_seqlocks.get(seqAddr) ?? 0) + 1;
  _seqlocks.set(seqAddr, seq);
  return seq;
}

/**
 * End a write operation on a seqlock
 */
export function seqlockWriteEnd(seqAddr: number): void {
  const seq = (_seqlocks.get(seqAddr) ?? 0) + 1;
  _seqlocks.set(seqAddr, seq);
}

/**
 * Begin a read operation on a seqlock
 */
export function seqlockReadBegin(seqAddr: number): number {
  const seq = _seqlocks.get(seqAddr) ?? 0;
  // In single-threaded testing, always return even sequence
  return seq & ~1;
}

/**
 * Validate a read operation on a seqlock
 */
export function seqlockReadValidate(seqAddr: number, startSeq: number): boolean {
  const endSeq = _seqlocks.get(seqAddr) ?? 0;
  return endSeq === startSeq;
}

/**
 * Reset all atomics state for testing
 */
export function _resetAtomics(): void {
  _locks.clear();
  _memory32.clear();
  _memory64.clear();
  _seqlocks.clear();
}
