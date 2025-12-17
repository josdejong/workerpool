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
});
