/**
 * WorkerHandler Tests
 *
 * Tests for the TypeScript WorkerHandler implementation.
 * Mirrors the functionality of test/js/WorkerHandler.test.js
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import {
  WorkerHandler,
  TerminateError,
  TERMINATE_METHOD_ID,
  CLEANUP_METHOD_ID,
  _tryRequireWorkerThreads,
} from '../../src/ts/core/WorkerHandler';

// Use the JavaScript worker script for testing
const DEFAULT_WORKER_SCRIPT = path.resolve(__dirname, '../../src/js/worker.js');

describe('WorkerHandler', () => {
  describe('TerminateError', () => {
    it('should create error with default message', () => {
      const error = new TerminateError();
      expect(error.message).toBe('worker terminated');
      expect(error.name).toBe('TerminateError');
    });

    it('should create error with custom message', () => {
      const error = new TerminateError('Custom termination message');
      expect(error.message).toBe('Custom termination message');
    });

    it('should include cause when provided', () => {
      const cause = new Error('Original error');
      const error = new TerminateError('Wrapped error', cause);
      expect(error.cause).toBe(cause);
    });

    it('should be instance of Error', () => {
      const error = new TerminateError();
      expect(error instanceof Error).toBe(true);
      expect(error instanceof TerminateError).toBe(true);
    });

    it('should have stack trace', () => {
      const error = new TerminateError();
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });
  });

  describe('constants', () => {
    it('should export TERMINATE_METHOD_ID', () => {
      expect(TERMINATE_METHOD_ID).toBe('__workerpool-terminate__');
    });

    it('should export CLEANUP_METHOD_ID', () => {
      expect(CLEANUP_METHOD_ID).toBe('__workerpool-cleanup__');
    });
  });

  describe('_tryRequireWorkerThreads', () => {
    it('should return worker_threads module or null', () => {
      const result = _tryRequireWorkerThreads();
      // In Node.js >= 11.7, this should return the module
      // In earlier versions or browsers, it should return null
      expect(result === null || typeof result === 'object').toBe(true);

      if (result !== null) {
        expect(typeof result.Worker).toBe('function');
        expect(typeof result.isMainThread).toBe('boolean');
      }
    });

    it('should not throw on repeated calls', () => {
      expect(() => {
        _tryRequireWorkerThreads();
        _tryRequireWorkerThreads();
        _tryRequireWorkerThreads();
      }).not.toThrow();
    });
  });

  describe('WorkerHandler class', () => {
    describe('construction', () => {
      let handler: WorkerHandler | null = null;

      afterEach(async () => {
        if (handler) {
          handler.terminate(true);
          handler = null;
        }
      });

      it('should create handler with worker script', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(handler).toBeDefined();
        expect(handler.script).toBeDefined();
        expect(typeof handler.script).toBe('string');
      });

      it('should create handler with script path', () => {
        handler = new WorkerHandler(__dirname + '/../js/workers/simple.js');
        expect(handler.script).toContain('simple.js');
      });

      it('should accept options object', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, {
          workerType: 'process',
          workerTerminateTimeout: 5000,
        });
        expect(handler).toBeDefined();
        expect(handler.workerTerminateTimeout).toBe(5000);
      });

      it('should default workerTerminateTimeout to 1000', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(handler.workerTerminateTimeout).toBe(1000);
      });

      it('should store forkArgs', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, {
          forkArgs: ['--arg1', '--arg2'],
        });
        expect(handler.forkArgs).toEqual(['--arg1', '--arg2']);
      });

      it('should store forkOpts', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, {
          forkOpts: { env: { TEST: 'value' } },
        });
        expect(handler.forkOpts).toBeDefined();
      });

      it('should store workerOpts', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, {
          workerOpts: { type: 'module' },
        });
        expect(handler.workerOpts).toEqual({ type: 'module' });
      });

      it('should store workerThreadOpts', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, {
          workerThreadOpts: { resourceLimits: { maxOldGenerationSizeMb: 100 } },
        });
        expect(handler.workerThreadOpts).toEqual({
          resourceLimits: { maxOldGenerationSizeMb: 100 },
        });
      });

      it('should store debugPort', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, {
          debugPort: 9229,
        });
        expect(handler.debugPort).toBe(9229);
      });
    });

    describe('busy()', () => {
      let handler: WorkerHandler | null = null;

      afterEach(() => {
        if (handler) {
          handler.terminate(true);
          handler = null;
        }
      });

      it('should return false when no tasks are processing', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(handler.busy()).toBe(false);
      });

      it('should have busy method that returns boolean', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(typeof handler.busy).toBe('function');
        expect(typeof handler.busy()).toBe('boolean');
      });
    });

    describe('terminated state', () => {
      it('should start with terminated as false', () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(handler.terminated).toBe(false);
        handler.terminate(true);
      });

      it('should be terminated after force terminate', async () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        await handler.terminateAndNotify(true);
        expect(handler.terminated).toBe(true);
      });
    });

    describe('exec()', () => {
      let handler: WorkerHandler | null = null;

      afterEach(() => {
        if (handler) {
          handler.terminate(true);
          handler = null;
        }
      });

      it('should have exec method', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(typeof handler.exec).toBe('function');
      });

      it('should return promise from exec', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        const result = handler.exec('methods');
        expect(result).toBeDefined();
        expect(typeof result.then).toBe('function');
        expect(typeof result.catch).toBe('function');
        // Cancel to avoid hanging
        if (typeof (result as unknown as { cancel?: () => void }).cancel === 'function') {
          (result as unknown as { cancel: () => void }).cancel();
        }
      });
    });

    describe('methods()', () => {
      let handler: WorkerHandler | null = null;

      afterEach(() => {
        if (handler) {
          handler.terminate(true);
          handler = null;
        }
      });

      it('should have methods method', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(typeof handler.methods).toBe('function');
      });

      it('should return promise from methods', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        const result = handler.methods();
        expect(result).toBeDefined();
        expect(typeof result.then).toBe('function');
        // Cancel to avoid hanging
        if (typeof (result as unknown as { cancel?: () => void }).cancel === 'function') {
          (result as unknown as { cancel: () => void }).cancel();
        }
      });
    });

    describe('terminate()', () => {
      it('should have terminate method', () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(typeof handler.terminate).toBe('function');
        handler.terminate(true);
      });

      it('should accept force parameter', async () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        await handler.terminateAndNotify(true);
        expect(handler.terminated).toBe(true);
      });

      it('should accept callback parameter', async () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        await new Promise<void>((resolve) => {
          handler.terminate(true, (err, h) => {
            expect(err).toBeNull();
            expect(h).toBe(handler);
            expect(handler.terminated).toBe(true);
            resolve();
          });
        });
      });

      it('should clear worker on terminate', async () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        await handler.terminateAndNotify(true);
        expect(handler.worker).toBeNull();
      });
    });

    describe('terminateAndNotify()', () => {
      it('should have terminateAndNotify method', () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(typeof handler.terminateAndNotify).toBe('function');
        handler.terminate(true);
      });

      it('should return promise from terminateAndNotify', () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        const result = handler.terminateAndNotify(true);
        expect(result).toBeDefined();
        expect(typeof result.then).toBe('function');
      });

      it('should resolve on successful termination', async () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        const result = await handler.terminateAndNotify(true);
        expect(result).toBe(handler);
        expect(handler.terminated).toBe(true);
      });
    });

    describe('processing and tracking', () => {
      let handler: WorkerHandler | null = null;

      afterEach(() => {
        if (handler) {
          handler.terminate(true);
          handler = null;
        }
      });

      it('should have processing object', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(handler.processing).toBeDefined();
        expect(typeof handler.processing).toBe('object');
      });

      it('should have tracking object', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(handler.tracking).toBeDefined();
        expect(typeof handler.tracking).toBe('object');
      });

      it('should start with empty processing', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(Object.keys(handler.processing).length).toBe(0);
      });

      it('should start with empty tracking', () => {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(Object.keys(handler.tracking).length).toBe(0);
      });
    });

    describe('worker property', () => {
      it('should have worker property after construction', () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        expect(handler.worker).toBeDefined();
        expect(handler.worker).not.toBeNull();
        handler.terminate(true);
      });

      it('should have null worker after termination', async () => {
        const handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT);
        await handler.terminateAndNotify(true);
        expect(handler.worker).toBeNull();
      });
    });
  });

  describe('WorkerType options', () => {
    let handler: WorkerHandler | null = null;

    afterEach(() => {
      if (handler) {
        handler.terminate(true);
        handler = null;
      }
    });

    it('should accept workerType: process', () => {
      handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, { workerType: 'process' });
      expect(handler).toBeDefined();
    });

    it('should accept workerType: thread', () => {
      // May throw if worker_threads not available
      try {
        handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, { workerType: 'thread' });
        expect(handler).toBeDefined();
      } catch (err) {
        // Expected on Node < 11.7
        expect((err as Error).message).toContain('workerType');
      }
    });

    it('should accept workerType: auto', () => {
      handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, { workerType: 'auto' });
      expect(handler).toBeDefined();
    });
  });

  describe('emitStdStreams option', () => {
    let handler: WorkerHandler | null = null;

    afterEach(() => {
      if (handler) {
        handler.terminate(true);
        handler = null;
      }
    });

    it('should accept emitStdStreams: true', () => {
      handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, { emitStdStreams: true });
      expect(handler).toBeDefined();
    });

    it('should accept emitStdStreams: false', () => {
      handler = new WorkerHandler(DEFAULT_WORKER_SCRIPT, { emitStdStreams: false });
      expect(handler).toBeDefined();
    });
  });
});
