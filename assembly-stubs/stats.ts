/**
 * Statistics Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of the AssemblyScript statistics
 * functions for unit testing with vitest.
 */

import { validateMemory } from './memory';

// Internal stats storage
let _stats = {
  pushCount: BigInt(0),
  popCount: BigInt(0),
  pushFailures: BigInt(0),
  popFailures: BigInt(0),
  casRetries: BigInt(0),
  allocCount: BigInt(0),
  freeCount: BigInt(0),
  peakSize: 0,
  peakAllocated: 0,
};

/**
 * Initialize statistics counters
 */
export function initStats(): void {
  if (!validateMemory()) return;
  _stats = {
    pushCount: BigInt(0),
    popCount: BigInt(0),
    pushFailures: BigInt(0),
    popFailures: BigInt(0),
    casRetries: BigInt(0),
    allocCount: BigInt(0),
    freeCount: BigInt(0),
    peakSize: 0,
    peakAllocated: 0,
  };
}

/**
 * Increment push count
 */
export function recordPush(): void {
  _stats.pushCount++;
}

/**
 * Increment pop count
 */
export function recordPop(): void {
  _stats.popCount++;
}

/**
 * Increment push failure count
 */
export function recordPushFailure(): void {
  _stats.pushFailures++;
}

/**
 * Increment pop failure count
 */
export function recordPopFailure(): void {
  _stats.popFailures++;
}

/**
 * Record CAS retry
 */
export function recordCASRetry(): void {
  _stats.casRetries++;
}

/**
 * Record slot allocation
 */
export function recordAllocation(): void {
  _stats.allocCount++;
}

/**
 * Record slot free
 */
export function recordFree(): void {
  _stats.freeCount++;
}

/**
 * Update peak queue size
 */
export function updatePeakSize(currentSize: number): void {
  if (currentSize > _stats.peakSize) {
    _stats.peakSize = currentSize;
  }
}

/**
 * Update peak allocated slots
 */
export function updatePeakAllocated(currentAllocated: number): void {
  if (currentAllocated > _stats.peakAllocated) {
    _stats.peakAllocated = currentAllocated;
  }
}

/**
 * Get total push count
 */
export function getPushCount(): bigint {
  return _stats.pushCount;
}

/**
 * Get total pop count
 */
export function getPopCount(): bigint {
  return _stats.popCount;
}

/**
 * Get push failure count
 */
export function getPushFailures(): bigint {
  return _stats.pushFailures;
}

/**
 * Get pop failure count
 */
export function getPopFailures(): bigint {
  return _stats.popFailures;
}

/**
 * Get CAS retry count
 */
export function getCASRetries(): bigint {
  return _stats.casRetries;
}

/**
 * Get total allocation count
 */
export function getAllocationCount(): bigint {
  return _stats.allocCount;
}

/**
 * Get total free count
 */
export function getFreeCount(): bigint {
  return _stats.freeCount;
}

/**
 * Get peak queue size
 */
export function getPeakSize(): number {
  return _stats.peakSize;
}

/**
 * Get peak allocated slots
 */
export function getPeakAllocated(): number {
  return _stats.peakAllocated;
}

/**
 * Reset all statistics
 */
export function resetStats(): void {
  initStats();
}

/**
 * Reset stats for testing
 */
export function _resetStats(): void {
  _stats = {
    pushCount: BigInt(0),
    popCount: BigInt(0),
    pushFailures: BigInt(0),
    popFailures: BigInt(0),
    casRetries: BigInt(0),
    allocCount: BigInt(0),
    freeCount: BigInt(0),
    peakSize: 0,
    peakAllocated: 0,
  };
}
