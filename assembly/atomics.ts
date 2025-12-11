/**
 * Atomic Utilities Module
 *
 * Provides higher-level atomic operations and synchronization primitives
 * built on WebAssembly atomics.
 */

// Maximum number of CAS retries before giving up
export const MAX_CAS_RETRIES: u32 = 1000;

// Spin lock constants
const LOCK_FREE: u32 = 0;
const LOCK_HELD: u32 = 1;

/**
 * Try to acquire a spinlock
 * Returns true if lock acquired, false if already held
 */
export function tryLock(lockAddr: u32): bool {
  const old = atomic.cmpxchg<u32>(lockAddr, LOCK_FREE, LOCK_HELD);
  return old == LOCK_FREE;
}

/**
 * Acquire a spinlock with spinning
 * Will spin until lock is acquired or max retries exceeded
 * Returns true if acquired, false if max retries exceeded
 */
export function acquireLock(lockAddr: u32, maxRetries: u32 = MAX_CAS_RETRIES): bool {
  for (let i: u32 = 0; i < maxRetries; i++) {
    if (tryLock(lockAddr)) {
      return true;
    }
    // Exponential backoff using atomic.fence as a delay
    atomic.fence();
  }
  return false;
}

/**
 * Release a spinlock
 */
export function releaseLock(lockAddr: u32): void {
  atomic.store<u32>(lockAddr, LOCK_FREE);
}

/**
 * Atomically increment a u32 counter, returning the new value
 */
export function atomicIncrement(addr: u32): u32 {
  return atomic.add<u32>(addr, 1) + 1;
}

/**
 * Atomically decrement a u32 counter, returning the new value
 */
export function atomicDecrement(addr: u32): u32 {
  return atomic.sub<u32>(addr, 1) - 1;
}

/**
 * Atomically increment a u64 counter, returning the new value
 */
export function atomicIncrement64(addr: u32): u64 {
  return atomic.add<u64>(addr, 1) + 1;
}

/**
 * Atomically decrement a u64 counter, returning the new value
 */
export function atomicDecrement64(addr: u32): u64 {
  return atomic.sub<u64>(addr, 1) - 1;
}

/**
 * Atomically set a value if the current value equals expected
 * Returns true if the swap was successful
 */
export function atomicCompareExchange32(addr: u32, expected: u32, desired: u32): bool {
  const old = atomic.cmpxchg<u32>(addr, expected, desired);
  return old == expected;
}

/**
 * Atomically set a value if the current value equals expected
 * Returns true if the swap was successful
 */
export function atomicCompareExchange64(addr: u32, expected: u64, desired: u64): bool {
  const old = atomic.cmpxchg<u64>(addr, expected, desired);
  return old == expected;
}

/**
 * Atomically load a u32 value
 */
export function atomicLoad32(addr: u32): u32 {
  return atomic.load<u32>(addr);
}

/**
 * Atomically load a u64 value
 */
export function atomicLoad64(addr: u32): u64 {
  return atomic.load<u64>(addr);
}

/**
 * Atomically store a u32 value
 */
export function atomicStore32(addr: u32, value: u32): void {
  atomic.store<u32>(addr, value);
}

/**
 * Atomically store a u64 value
 */
export function atomicStore64(addr: u32, value: u64): void {
  atomic.store<u64>(addr, value);
}

/**
 * Atomically get the maximum of current value and new value
 * Returns the previous value
 */
export function atomicMax32(addr: u32, value: u32): u32 {
  while (true) {
    const current = atomic.load<u32>(addr);
    if (value <= current) {
      return current;
    }
    const old = atomic.cmpxchg<u32>(addr, current, value);
    if (old == current) {
      return current;
    }
  }
}

/**
 * Atomically get the minimum of current value and new value
 * Returns the previous value
 */
export function atomicMin32(addr: u32, value: u32): u32 {
  while (true) {
    const current = atomic.load<u32>(addr);
    if (value >= current) {
      return current;
    }
    const old = atomic.cmpxchg<u32>(addr, current, value);
    if (old == current) {
      return current;
    }
  }
}

/**
 * Memory fence - ensures all previous memory operations are visible
 */
export function memoryFence(): void {
  atomic.fence();
}

/**
 * Sequence counter for lock-free reads
 * Used for optimistic concurrency control
 */

/**
 * Begin a write operation on a seqlock
 * Returns the new sequence number (odd = write in progress)
 */
export function seqlockWriteBegin(seqAddr: u32): u32 {
  const seq = atomic.add<u32>(seqAddr, 1);
  atomic.fence();
  return seq + 1;
}

/**
 * End a write operation on a seqlock
 * Increments sequence number again (even = write complete)
 */
export function seqlockWriteEnd(seqAddr: u32): void {
  atomic.fence();
  atomic.add<u32>(seqAddr, 1);
}

/**
 * Begin a read operation on a seqlock
 * Returns the current sequence number
 */
export function seqlockReadBegin(seqAddr: u32): u32 {
  while (true) {
    const seq = atomic.load<u32>(seqAddr);
    if ((seq & 1) == 0) {
      atomic.fence();
      return seq;
    }
    // Odd sequence = write in progress, spin
    atomic.fence();
  }
}

/**
 * Validate a read operation on a seqlock
 * Returns true if the read was valid (no concurrent write)
 */
export function seqlockReadValidate(seqAddr: u32, startSeq: u32): bool {
  atomic.fence();
  const endSeq = atomic.load<u32>(seqAddr);
  return endSeq == startSeq;
}
