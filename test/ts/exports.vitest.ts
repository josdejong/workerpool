/**
 * Export Verification Tests
 *
 * Tests to verify that all expected exports are available from each entry point.
 * This ensures the API is consistent and accessible to developers.
 */

import { describe, it, expect } from 'vitest';

// Import from minimal build
import * as minimal from '../../src/ts/minimal';

// Import from modern build (index)
import * as modern from '../../src/ts/index';

// Import from full build
import * as full from '../../src/ts/full';

describe('Export Verification', () => {
  describe('workerpool/minimal exports', () => {
    describe('Core APIs', () => {
      it('should export pool function', () => {
        expect(typeof minimal.pool).toBe('function');
      });

      it('should export worker function', () => {
        expect(typeof minimal.worker).toBe('function');
      });

      it('should export workerEmit function', () => {
        expect(typeof minimal.workerEmit).toBe('function');
      });

      it('should export Promise class', () => {
        expect(typeof minimal.Promise).toBe('function');
      });

      it('should export Transfer class', () => {
        expect(typeof minimal.Transfer).toBe('function');
      });

      it('should export Pool class', () => {
        expect(typeof minimal.Pool).toBe('function');
      });
    });

    describe('Platform Detection', () => {
      it('should export platform constant', () => {
        expect(['node', 'browser']).toContain(minimal.platform);
      });

      it('should export isMainThread', () => {
        expect(typeof minimal.isMainThread).toBe('boolean');
      });

      it('should export cpus', () => {
        expect(typeof minimal.cpus).toBe('number');
      });

      it('should export isNode function', () => {
        expect(typeof minimal.isNode).toBe('function');
      });

      it('should export getPlatformInfo function', () => {
        expect(typeof minimal.getPlatformInfo).toBe('function');
      });

      it('should export hasWorkerThreads', () => {
        expect(typeof minimal.hasWorkerThreads).toBe('boolean');
      });

      it('should export hasSharedArrayBuffer', () => {
        expect(typeof minimal.hasSharedArrayBuffer).toBe('boolean');
      });

      it('should export hasAtomics', () => {
        expect(typeof minimal.hasAtomics).toBe('boolean');
      });
    });

    describe('Bun Compatibility', () => {
      it('should export isBun', () => {
        expect(typeof minimal.isBun).toBe('boolean');
      });

      it('should export bunVersion', () => {
        expect(minimal.bunVersion === null || typeof minimal.bunVersion === 'string').toBe(true);
      });

      it('should export recommendedWorkerType', () => {
        expect(['auto', 'thread', 'process', 'web']).toContain(minimal.recommendedWorkerType);
      });

      it('should export getWorkerTypeSupport function', () => {
        expect(typeof minimal.getWorkerTypeSupport).toBe('function');
      });

      it('should export isWorkerTypeSupported function', () => {
        expect(typeof minimal.isWorkerTypeSupported).toBe('function');
      });
    });

    describe('Data Structures', () => {
      it('should export CircularBuffer class', () => {
        expect(typeof minimal.CircularBuffer).toBe('function');
      });

      it('should export GrowableCircularBuffer class', () => {
        expect(typeof minimal.GrowableCircularBuffer).toBe('function');
      });

      it('should export TimeWindowBuffer class', () => {
        expect(typeof minimal.TimeWindowBuffer).toBe('function');
      });
    });

    describe('Queue Implementations', () => {
      it('should export FIFOQueue class', () => {
        expect(typeof minimal.FIFOQueue).toBe('function');
      });

      it('should export LIFOQueue class', () => {
        expect(typeof minimal.LIFOQueue).toBe('function');
      });
    });

    describe('Error Classes', () => {
      it('should export CancellationError', () => {
        expect(typeof minimal.CancellationError).toBe('function');
      });

      it('should export TimeoutError', () => {
        expect(typeof minimal.TimeoutError).toBe('function');
      });

      it('should export TerminationError', () => {
        expect(typeof minimal.TerminationError).toBe('function');
      });
    });

    describe('Metadata', () => {
      it('should export VERSION', () => {
        expect(typeof minimal.VERSION).toBe('string');
      });

      it('should export BUILD_TYPE as minimal', () => {
        expect(minimal.BUILD_TYPE).toBe('minimal');
      });
    });
  });

  describe('workerpool/modern exports', () => {
    describe('All minimal exports should be present', () => {
      it('should export all platform detection', () => {
        expect(typeof modern.isNode).toBe('function');
        expect(typeof modern.getPlatformInfo).toBe('function');
        expect(typeof modern.hasWorkerThreads).toBe('boolean');
      });

      it('should export all data structures', () => {
        expect(typeof modern.CircularBuffer).toBe('function');
        expect(typeof modern.GrowableCircularBuffer).toBe('function');
        expect(typeof modern.TimeWindowBuffer).toBe('function');
      });

      it('should export all queues', () => {
        expect(typeof modern.FIFOQueue).toBe('function');
        expect(typeof modern.LIFOQueue).toBe('function');
      });
    });

    describe('Transfer Detection (modern-specific)', () => {
      it('should export isTransferable function', () => {
        expect(typeof modern.isTransferable).toBe('function');
      });

      it('should export detectTransferables function', () => {
        expect(typeof modern.detectTransferables).toBe('function');
      });

      it('should export getTransferableType function', () => {
        expect(typeof modern.getTransferableType).toBe('function');
      });

      it('should export validateTransferables function', () => {
        expect(typeof modern.validateTransferables).toBe('function');
      });
    });

    describe('Metrics (modern-specific)', () => {
      it('should export MetricsCollector class', () => {
        expect(typeof modern.MetricsCollector).toBe('function');
      });
    });

    describe('Enhanced Pool Functions', () => {
      it('should export enhancedPool function', () => {
        expect(typeof modern.enhancedPool).toBe('function');
      });

      it('should export optimalPool function', () => {
        expect(typeof modern.optimalPool).toBe('function');
      });

      it('should export getRuntimeInfo function', () => {
        expect(typeof modern.getRuntimeInfo).toBe('function');
      });
    });

    describe('Capabilities API', () => {
      it('should export capabilities object', () => {
        expect(modern.capabilities).toBeDefined();
      });

      it('should export getCapabilities function', () => {
        expect(typeof modern.getCapabilities).toBe('function');
      });

      it('should export canUseOptimalTransfer function', () => {
        expect(typeof modern.canUseOptimalTransfer).toBe('function');
      });

      it('should export canUseZeroCopy function', () => {
        expect(typeof modern.canUseZeroCopy).toBe('function');
      });
    });

    describe('Metadata', () => {
      it('should export BUILD_TYPE as modern', () => {
        expect(modern.BUILD_TYPE).toBe('modern');
      });
    });
  });

  describe('workerpool/full exports', () => {
    describe('All modern exports should be present', () => {
      it('should export platform detection', () => {
        expect(typeof full.isNode).toBe('function');
        expect(typeof full.getPlatformInfo).toBe('function');
      });

      it('should export data structures', () => {
        expect(typeof full.CircularBuffer).toBe('function');
        expect(typeof full.GrowableCircularBuffer).toBe('function');
        expect(typeof full.TimeWindowBuffer).toBe('function');
      });

      it('should export transfer detection', () => {
        expect(typeof full.isTransferable).toBe('function');
        expect(typeof full.detectTransferables).toBe('function');
      });
    });

    describe('Full-specific exports', () => {
      it('should export optimalPool function', () => {
        expect(typeof full.optimalPool).toBe('function');
      });

      it('should export getRuntimeInfo function', () => {
        expect(typeof full.getRuntimeInfo).toBe('function');
      });

      it('should export hasSharedArrayBufferEnv', () => {
        expect(typeof full.hasSharedArrayBufferEnv).toBe('boolean');
      });

      it('should export hasAtomicsEnv', () => {
        expect(typeof full.hasAtomicsEnv).toBe('boolean');
      });
    });

    describe('WASM Support', () => {
      it('should export canUseWasm function', () => {
        expect(typeof full.canUseWasm).toBe('function');
      });

      it('should export WasmBridge class', () => {
        expect(typeof full.WasmBridge).toBe('function');
      });

      it('should export hasWasmSupport function', () => {
        expect(typeof full.hasWasmSupport).toBe('function');
      });

      it('should export hasFullWasmSupport function', () => {
        expect(typeof full.hasFullWasmSupport).toBe('function');
      });
    });

    describe('Debug Utilities', () => {
      it('should export LogLevel', () => {
        expect(full.LogLevel).toBeDefined();
      });

      it('should export enableDebug function', () => {
        expect(typeof full.enableDebug).toBe('function');
      });

      it('should export disableDebug function', () => {
        expect(typeof full.disableDebug).toBe('function');
      });
    });

    describe('Worker Management', () => {
      it('should export AdaptiveScaler class', () => {
        expect(typeof full.AdaptiveScaler).toBe('function');
      });

      it('should export HealthMonitor class', () => {
        expect(typeof full.HealthMonitor).toBe('function');
      });

      it('should export WorkerCache class', () => {
        expect(typeof full.WorkerCache).toBe('function');
      });
    });

    describe('Metadata', () => {
      it('should export BUILD_TYPE as full', () => {
        expect(full.BUILD_TYPE).toBe('full');
      });
    });
  });

  describe('Functional Tests for New Exports', () => {
    describe('getPlatformInfo', () => {
      it('should return complete platform info from minimal', () => {
        const info = minimal.getPlatformInfo();
        expect(info.platform).toBeDefined();
        expect(typeof info.isMainThread).toBe('boolean');
        expect(typeof info.cpus).toBe('number');
        expect(typeof info.hasWorkerThreads).toBe('boolean');
        expect(typeof info.isBun).toBe('boolean');
      });
    });

    describe('CircularBuffer', () => {
      it('should work correctly from minimal', () => {
        const buffer = new minimal.CircularBuffer<number>(3);
        buffer.push(1);
        buffer.push(2);
        buffer.push(3);
        buffer.push(4); // Should evict 1

        expect(buffer.size).toBe(3);
        expect(buffer.peek()).toBe(2);
      });

      it('should work correctly from modern', () => {
        const buffer = new modern.CircularBuffer<string>(2);
        buffer.push('a');
        buffer.push('b');
        buffer.push('c'); // Should evict 'a'

        expect(buffer.toArray()).toEqual(['b', 'c']);
      });
    });

    describe('GrowableCircularBuffer', () => {
      it('should grow instead of evicting', () => {
        const buffer = new minimal.GrowableCircularBuffer<number>(2);
        buffer.push(1);
        buffer.push(2);
        buffer.push(3); // Should grow, not evict

        expect(buffer.size).toBe(3);
        expect(buffer.shift()).toBe(1);
      });
    });

    describe('FIFOQueue and LIFOQueue', () => {
      it('should maintain FIFO order', () => {
        const queue = new minimal.FIFOQueue();
        const task1 = { method: 'a', resolver: {}, timeout: null };
        const task2 = { method: 'b', resolver: {}, timeout: null };
        queue.push(task1);
        queue.push(task2);

        expect(queue.pop()).toBe(task1);
        expect(queue.pop()).toBe(task2);
      });

      it('should maintain LIFO order', () => {
        const queue = new minimal.LIFOQueue();
        const task1 = { method: 'a', resolver: {}, timeout: null };
        const task2 = { method: 'b', resolver: {}, timeout: null };
        queue.push(task1);
        queue.push(task2);

        expect(queue.pop()).toBe(task2);
        expect(queue.pop()).toBe(task1);
      });
    });

    describe('getRuntimeInfo', () => {
      it('should return runtime info from modern', () => {
        const info = modern.getRuntimeInfo();
        expect(['bun', 'node', 'browser']).toContain(info.runtime);
        expect(info.recommendedWorkerType).toBeDefined();
        expect(info.workerTypeSupport).toBeDefined();
      });

      it('should return runtime info from full', () => {
        const info = full.getRuntimeInfo();
        expect(['bun', 'node', 'browser']).toContain(info.runtime);
      });
    });

    describe('Transfer Detection from modern', () => {
      it('should detect transferables', () => {
        const buffer = new ArrayBuffer(1024);
        expect(modern.isTransferable(buffer)).toBe(true);

        const result = modern.detectTransferables({ data: buffer });
        expect(result.transferables.length).toBe(1);
      });

      it('should validate transferables', () => {
        const buffer = new ArrayBuffer(16);
        const result = modern.validateTransferables([buffer]);
        expect(result.valid).toBe(true);
      });
    });
  });
});
