/**
 * Statistics and Diagnostics Module
 *
 * Provides atomic counters and metrics for monitoring queue performance.
 * All operations are thread-safe using atomics.
 */

import { validateMemory, HEADER_SIZE } from './memory';

// Stats header offsets (stored in extended header area)
// These offsets start after the standard header (64 bytes) and extended fields
const STATS_BASE_OFFSET: u32 = 128;

/** Total push operations */
const STATS_PUSH_COUNT_OFFSET: u32 = STATS_BASE_OFFSET;
/** Total pop operations */
const STATS_POP_COUNT_OFFSET: u32 = STATS_BASE_OFFSET + 8;
/** Push failures (queue full) */
const STATS_PUSH_FAILURES_OFFSET: u32 = STATS_BASE_OFFSET + 16;
/** Pop failures (queue empty) */
const STATS_POP_FAILURES_OFFSET: u32 = STATS_BASE_OFFSET + 24;
/** CAS retries */
const STATS_CAS_RETRIES_OFFSET: u32 = STATS_BASE_OFFSET + 32;
/** Total allocations */
const STATS_ALLOC_COUNT_OFFSET: u32 = STATS_BASE_OFFSET + 40;
/** Total frees */
const STATS_FREE_COUNT_OFFSET: u32 = STATS_BASE_OFFSET + 48;
/** Peak queue size */
const STATS_PEAK_SIZE_OFFSET: u32 = STATS_BASE_OFFSET + 56;
/** Peak allocated slots */
const STATS_PEAK_ALLOCATED_OFFSET: u32 = STATS_BASE_OFFSET + 60;

/**
 * Initialize statistics counters
 */
export function initStats(): void {
  if (!validateMemory()) return;

  atomic.store<u64>(STATS_PUSH_COUNT_OFFSET, 0);
  atomic.store<u64>(STATS_POP_COUNT_OFFSET, 0);
  atomic.store<u64>(STATS_PUSH_FAILURES_OFFSET, 0);
  atomic.store<u64>(STATS_POP_FAILURES_OFFSET, 0);
  atomic.store<u64>(STATS_CAS_RETRIES_OFFSET, 0);
  atomic.store<u64>(STATS_ALLOC_COUNT_OFFSET, 0);
  atomic.store<u64>(STATS_FREE_COUNT_OFFSET, 0);
  atomic.store<u32>(STATS_PEAK_SIZE_OFFSET, 0);
  atomic.store<u32>(STATS_PEAK_ALLOCATED_OFFSET, 0);
}

/**
 * Increment push count
 */
export function recordPush(): void {
  atomic.add<u64>(STATS_PUSH_COUNT_OFFSET, 1);
}

/**
 * Increment pop count
 */
export function recordPop(): void {
  atomic.add<u64>(STATS_POP_COUNT_OFFSET, 1);
}

/**
 * Increment push failure count
 */
export function recordPushFailure(): void {
  atomic.add<u64>(STATS_PUSH_FAILURES_OFFSET, 1);
}

/**
 * Increment pop failure count
 */
export function recordPopFailure(): void {
  atomic.add<u64>(STATS_POP_FAILURES_OFFSET, 1);
}

/**
 * Record CAS retry
 */
export function recordCASRetry(): void {
  atomic.add<u64>(STATS_CAS_RETRIES_OFFSET, 1);
}

/**
 * Record slot allocation
 */
export function recordAllocation(): void {
  atomic.add<u64>(STATS_ALLOC_COUNT_OFFSET, 1);
}

/**
 * Record slot free
 */
export function recordFree(): void {
  atomic.add<u64>(STATS_FREE_COUNT_OFFSET, 1);
}

/**
 * Update peak queue size if current size is higher
 */
export function updatePeakSize(currentSize: u32): void {
  while (true) {
    const peak = atomic.load<u32>(STATS_PEAK_SIZE_OFFSET);
    if (currentSize <= peak) {
      break;
    }
    const swapped = atomic.cmpxchg<u32>(STATS_PEAK_SIZE_OFFSET, peak, currentSize);
    if (swapped == peak) {
      break;
    }
  }
}

/**
 * Update peak allocated slots if current count is higher
 */
export function updatePeakAllocated(currentAllocated: u32): void {
  while (true) {
    const peak = atomic.load<u32>(STATS_PEAK_ALLOCATED_OFFSET);
    if (currentAllocated <= peak) {
      break;
    }
    const swapped = atomic.cmpxchg<u32>(STATS_PEAK_ALLOCATED_OFFSET, peak, currentAllocated);
    if (swapped == peak) {
      break;
    }
  }
}

// ============ Getters ============

/**
 * Get total push count
 */
export function getPushCount(): u64 {
  return atomic.load<u64>(STATS_PUSH_COUNT_OFFSET);
}

/**
 * Get total pop count
 */
export function getPopCount(): u64 {
  return atomic.load<u64>(STATS_POP_COUNT_OFFSET);
}

/**
 * Get push failure count
 */
export function getPushFailures(): u64 {
  return atomic.load<u64>(STATS_PUSH_FAILURES_OFFSET);
}

/**
 * Get pop failure count
 */
export function getPopFailures(): u64 {
  return atomic.load<u64>(STATS_POP_FAILURES_OFFSET);
}

/**
 * Get CAS retry count
 */
export function getCASRetries(): u64 {
  return atomic.load<u64>(STATS_CAS_RETRIES_OFFSET);
}

/**
 * Get total allocation count
 */
export function getAllocationCount(): u64 {
  return atomic.load<u64>(STATS_ALLOC_COUNT_OFFSET);
}

/**
 * Get total free count
 */
export function getFreeCount(): u64 {
  return atomic.load<u64>(STATS_FREE_COUNT_OFFSET);
}

/**
 * Get peak queue size
 */
export function getPeakSize(): u32 {
  return atomic.load<u32>(STATS_PEAK_SIZE_OFFSET);
}

/**
 * Get peak allocated slots
 */
export function getPeakAllocated(): u32 {
  return atomic.load<u32>(STATS_PEAK_ALLOCATED_OFFSET);
}

/**
 * Reset all statistics
 */
export function resetStats(): void {
  initStats();
}
