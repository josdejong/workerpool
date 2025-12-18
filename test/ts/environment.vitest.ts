/**
 * Environment Detection Tests
 *
 * Tests for the TypeScript platform detection utilities.
 * Mirrors the functionality of test/environment.test.js
 */

import { describe, it, expect } from 'vitest';
import {
  isNode,
  platform,
  isMainThread,
  cpus,
  hasWorkerThreads,
  hasSharedArrayBuffer,
  hasAtomics,
  getPlatformInfo,
  isBun,
  bunVersion,
  recommendedWorkerType,
  getWorkerTypeSupport,
  isWorkerTypeSupported,
} from '../../src/ts/platform/environment';

describe('Environment Detection', () => {
  describe('isNode', () => {
    it('should return true for Node.js process object', () => {
      expect(isNode(process)).toBe(true);
    });

    it('should return false for undefined', () => {
      expect(isNode(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isNode(null)).toBe(false);
    });

    it('should return false for plain objects', () => {
      expect(isNode({})).toBe(false);
      expect(isNode({ versions: {} })).toBe(false);
      expect(isNode({ versions: { node: '1.0.0' } })).toBe(false);
    });

    it('should return false for objects missing versions.node', () => {
      const fakeProcess = {
        versions: { v8: '1.0.0' },
        toString: () => '[object process]',
      };
      expect(isNode(fakeProcess)).toBe(false);
    });
  });

  describe('platform', () => {
    it('should be "node" in Node.js environment', () => {
      expect(platform).toBe('node');
    });

    it('should be a valid platform value', () => {
      expect(['node', 'browser']).toContain(platform);
    });
  });

  describe('isMainThread', () => {
    it('should detect main thread correctly', () => {
      expect(typeof isMainThread).toBe('boolean');
    });

    it('should reflect actual thread/process state', () => {
      // vitest may run in a forked process (process.connected = true)
      // which makes isMainThread false even though we're not in a worker_thread
      const workerThreads = require('worker_threads');
      const expectedValue =
        (!workerThreads || workerThreads.isMainThread) && !process.connected;
      expect(isMainThread).toBe(expectedValue);
    });
  });

  describe('cpus', () => {
    it('should return a positive number', () => {
      expect(cpus).toBeGreaterThan(0);
    });

    it('should be an integer', () => {
      expect(Number.isInteger(cpus)).toBe(true);
    });

    it('should match os.cpus().length in Node.js', () => {
      const os = require('os');
      expect(cpus).toBe(os.cpus().length);
    });
  });

  describe('hasWorkerThreads', () => {
    it('should return a boolean', () => {
      expect(typeof hasWorkerThreads).toBe('boolean');
    });

    it('should be true in modern Node.js', () => {
      // Node.js 11.7.0+ has worker_threads
      const nodeVersion = process.versions.node.split('.').map(Number);
      const hasWorkerThreadsExpected =
        nodeVersion[0] > 11 || (nodeVersion[0] === 11 && nodeVersion[1] >= 7);
      expect(hasWorkerThreads).toBe(hasWorkerThreadsExpected);
    });
  });

  describe('hasSharedArrayBuffer', () => {
    it('should return a boolean', () => {
      expect(typeof hasSharedArrayBuffer).toBe('boolean');
    });

    it('should match typeof SharedArrayBuffer check', () => {
      expect(hasSharedArrayBuffer).toBe(typeof SharedArrayBuffer !== 'undefined');
    });
  });

  describe('hasAtomics', () => {
    it('should return a boolean', () => {
      expect(typeof hasAtomics).toBe('boolean');
    });

    it('should match typeof Atomics check', () => {
      expect(hasAtomics).toBe(typeof Atomics !== 'undefined');
    });
  });

  describe('getPlatformInfo', () => {
    it('should return complete platform information', () => {
      const info = getPlatformInfo();

      expect(info).toHaveProperty('platform');
      expect(info).toHaveProperty('isMainThread');
      expect(info).toHaveProperty('cpus');
      expect(info).toHaveProperty('hasWorkerThreads');
      expect(info).toHaveProperty('hasSharedArrayBuffer');
      expect(info).toHaveProperty('hasAtomics');
    });

    it('should return consistent values', () => {
      const info = getPlatformInfo();

      expect(info.platform).toBe(platform);
      expect(info.isMainThread).toBe(isMainThread);
      expect(info.cpus).toBe(cpus);
      expect(info.hasWorkerThreads).toBe(hasWorkerThreads);
      expect(info.hasSharedArrayBuffer).toBe(hasSharedArrayBuffer);
      expect(info.hasAtomics).toBe(hasAtomics);
    });

    it('should return correct types for all properties', () => {
      const info = getPlatformInfo();

      expect(['node', 'browser']).toContain(info.platform);
      expect(typeof info.isMainThread).toBe('boolean');
      expect(typeof info.cpus).toBe('number');
      expect(typeof info.hasWorkerThreads).toBe('boolean');
      expect(typeof info.hasSharedArrayBuffer).toBe('boolean');
      expect(typeof info.hasAtomics).toBe('boolean');
    });
  });

  describe('Platform consistency', () => {
    it('should have consistent feature detection', () => {
      // If we have SharedArrayBuffer, we should also have Atomics
      if (hasSharedArrayBuffer) {
        expect(hasAtomics).toBe(true);
      }
    });

    it('should detect Node.js platform correctly', () => {
      if (platform === 'node') {
        expect(isNode(process)).toBe(true);
      }
    });
  });

  describe('Bun Runtime Detection', () => {
    describe('isBun', () => {
      it('should return a boolean', () => {
        expect(typeof isBun).toBe('boolean');
      });

      it('should match process.versions.bun check', () => {
        const expectedIsBun =
          typeof process !== 'undefined' &&
          process.versions !== undefined &&
          typeof (process.versions as Record<string, string>).bun === 'string';
        expect(isBun).toBe(expectedIsBun);
      });
    });

    describe('bunVersion', () => {
      it('should be a string or null', () => {
        expect(bunVersion === null || typeof bunVersion === 'string').toBe(true);
      });

      it('should be null when not running in Bun', () => {
        if (!isBun) {
          expect(bunVersion).toBeNull();
        }
      });

      it('should be a version string when running in Bun', () => {
        if (isBun) {
          expect(bunVersion).toMatch(/^\d+\.\d+\.\d+/);
        }
      });
    });

    describe('recommendedWorkerType', () => {
      it('should return a valid worker type', () => {
        expect(['auto', 'thread', 'process', 'web']).toContain(recommendedWorkerType);
      });

      it('should recommend "thread" for Bun', () => {
        if (isBun) {
          expect(recommendedWorkerType).toBe('thread');
        }
      });

      it('should recommend "auto" for Node.js', () => {
        if (!isBun && platform === 'node') {
          expect(recommendedWorkerType).toBe('auto');
        }
      });

      it('should recommend "web" for browser', () => {
        if (platform === 'browser') {
          expect(recommendedWorkerType).toBe('web');
        }
      });
    });

    describe('getWorkerTypeSupport', () => {
      it('should return an object with all worker types', () => {
        const support = getWorkerTypeSupport();
        expect(support).toHaveProperty('thread');
        expect(support).toHaveProperty('process');
        expect(support).toHaveProperty('web');
        expect(support).toHaveProperty('auto');
      });

      it('should have boolean values', () => {
        const support = getWorkerTypeSupport();
        expect(typeof support.thread).toBe('boolean');
        expect(typeof support.process).toBe('boolean');
        expect(typeof support.web).toBe('boolean');
        expect(typeof support.auto).toBe('boolean');
      });

      it('should always support auto', () => {
        const support = getWorkerTypeSupport();
        expect(support.auto).toBe(true);
      });

      it('should support thread in Node.js with worker_threads', () => {
        const support = getWorkerTypeSupport();
        if (platform === 'node' && hasWorkerThreads) {
          expect(support.thread).toBe(true);
        }
      });

      it('should mark process as unsupported in Bun', () => {
        const support = getWorkerTypeSupport();
        if (isBun) {
          expect(support.process).toBe(false);
        }
      });
    });

    describe('isWorkerTypeSupported', () => {
      it('should return boolean', () => {
        expect(typeof isWorkerTypeSupported('auto')).toBe('boolean');
        expect(typeof isWorkerTypeSupported('thread')).toBe('boolean');
        expect(typeof isWorkerTypeSupported('process')).toBe('boolean');
        expect(typeof isWorkerTypeSupported('web')).toBe('boolean');
      });

      it('should always return true for auto', () => {
        expect(isWorkerTypeSupported('auto')).toBe(true);
      });

      it('should match getWorkerTypeSupport values', () => {
        const support = getWorkerTypeSupport();
        expect(isWorkerTypeSupported('thread')).toBe(support.thread);
        expect(isWorkerTypeSupported('process')).toBe(support.process);
        expect(isWorkerTypeSupported('web')).toBe(support.web);
        expect(isWorkerTypeSupported('auto')).toBe(support.auto);
      });
    });

    describe('getPlatformInfo with Bun fields', () => {
      it('should include Bun-related fields', () => {
        const info = getPlatformInfo();
        expect(info).toHaveProperty('isBun');
        expect(info).toHaveProperty('bunVersion');
        expect(info).toHaveProperty('recommendedWorkerType');
        expect(info).toHaveProperty('workerTypeSupport');
      });

      it('should return consistent values', () => {
        const info = getPlatformInfo();
        expect(info.isBun).toBe(isBun);
        expect(info.bunVersion).toBe(bunVersion);
        expect(info.recommendedWorkerType).toBe(recommendedWorkerType);
      });

      it('should have valid workerTypeSupport object', () => {
        const info = getPlatformInfo();
        expect(info.workerTypeSupport).toHaveProperty('thread');
        expect(info.workerTypeSupport).toHaveProperty('process');
        expect(info.workerTypeSupport).toHaveProperty('web');
        expect(info.workerTypeSupport).toHaveProperty('auto');
      });
    });
  });
});
