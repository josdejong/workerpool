/**
 * WorkerPool WASM Module Entry Point
 *
 * Exports lock-free data structures for high-performance task scheduling.
 *
 * This module provides:
 * - Lock-free ring buffer for FIFO task queuing
 * - Priority queue with O(log n) operations
 * - Task slot allocator with reference counting
 * - Memory management utilities
 * - Atomic operations and synchronization primitives
 * - Statistics and diagnostics
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
