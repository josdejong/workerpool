/**
 * WorkerPool WASM Module Stubs Entry Point
 *
 * TypeScript stubs for unit testing with vitest.
 * These provide the same API as the AssemblyScript WASM module
 * but implemented in pure TypeScript for testing.
 */

// Core memory management
export * from './memory';

// Data structures
export * from './ring-buffer';
export * from './task-slots';
export * from './priority-queue';

// Utilities
export * from './errors';
export * from './stats';
export * from './atomics';

// SIMD batch operations
export * from './simd-batch';

// Testing utilities
import { _resetMemory } from './memory';
import { _resetSlots } from './task-slots';
import { _resetPriorityQueue } from './priority-queue';
import { _resetStats } from './stats';
import { _resetAtomics } from './atomics';
import { _resetSimd } from './simd-batch';

/**
 * Reset all internal state for testing
 * Call this in beforeEach() to ensure clean test isolation
 */
export function _resetAll(): void {
  _resetMemory();
  _resetSlots();
  _resetPriorityQueue();
  _resetStats();
  _resetAtomics();
  _resetSimd();
}
