/**
 * Tests for Function Compilation Cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FunctionCache,
  createFunctionKey,
  serializeFunction,
  compileCached,
  getGlobalFunctionCache,
  clearGlobalFunctionCache,
  CACHED_CHUNK_REDUCER,
  CACHED_CHUNK_FILTER,
  CACHED_CHUNK_MAPPER,
} from '../../src/ts/core/function-cache';

describe('FunctionCache', () => {
  let cache: FunctionCache<Function>;

  beforeEach(() => {
    cache = new FunctionCache<Function>({
      maxEntries: 100,
      maxSize: 1024 * 1024,
      ttl: 0,
    });
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      const fn = () => 42;
      const key = 'test-key';

      cache.set(key, fn);
      expect(cache.get(key)).toBe(fn);
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      const fn = () => 42;
      const key = 'test-key';

      expect(cache.has(key)).toBe(false);
      cache.set(key, fn);
      expect(cache.has(key)).toBe(true);
    });

    it('should delete entries', () => {
      const fn = () => 42;
      const key = 'test-key';

      cache.set(key, fn);
      expect(cache.delete(key)).toBe(true);
      expect(cache.has(key)).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', () => 1);
      cache.set('key2', () => 2);
      cache.set('key3', () => 3);

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict entries when max entries reached', () => {
      const smallCache = new FunctionCache<Function>({
        maxEntries: 3,
        maxSize: Infinity,
      });

      smallCache.set('key1', () => 1);
      smallCache.set('key2', () => 2);
      smallCache.set('key3', () => 3);

      // Add new entry, should trigger eviction
      smallCache.set('key4', () => 4);

      // After adding 4th entry, one should be evicted
      expect(smallCache.size).toBe(3);
      expect(smallCache.has('key4')).toBe(true);
    });

    it('should evict when max size exceeded', () => {
      const smallCache = new FunctionCache<string>({
        maxEntries: 100,
        maxSize: 100, // 100 bytes
      });

      // Each string is ~50 bytes (25 chars * 2 bytes)
      smallCache.set('key1', '1234567890123456789012345', 50);
      smallCache.set('key2', '1234567890123456789012345', 50);

      // This should trigger eviction
      smallCache.set('key3', '1234567890123456789012345', 50);

      expect(smallCache.size).toBeLessThanOrEqual(2);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', () => 1);

      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('missing'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should track evictions', () => {
      const smallCache = new FunctionCache<Function>({
        maxEntries: 2,
        maxSize: Infinity,
      });

      smallCache.set('key1', () => 1);
      smallCache.set('key2', () => 2);
      smallCache.set('key3', () => 3); // evicts key1

      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(1);
    });

    it('should reset statistics', () => {
      cache.set('key1', () => 1);
      cache.get('key1');
      cache.get('missing');

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const ttlCache = new FunctionCache<Function>({
        maxEntries: 100,
        ttl: 50, // 50ms TTL
      });

      ttlCache.set('key1', () => 1);
      expect(ttlCache.get('key1')).toBeDefined();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(ttlCache.get('key1')).toBeUndefined();
    });
  });
});

describe('createFunctionKey', () => {
  it('should create consistent keys for same function', () => {
    const fn = '(a, b) => a + b';
    const key1 = createFunctionKey(fn);
    const key2 = createFunctionKey(fn);

    expect(key1).toBe(key2);
  });

  it('should create different keys for different functions', () => {
    const fn1 = '(a, b) => a + b';
    const fn2 = '(a, b) => a * b';

    const key1 = createFunctionKey(fn1);
    const key2 = createFunctionKey(fn2);

    expect(key1).not.toBe(key2);
  });
});

describe('serializeFunction', () => {
  it('should serialize function to string and key', () => {
    const fn = (a: number, b: number) => a + b;
    const result = serializeFunction(fn);

    expect(result.str).toBe(fn.toString());
    expect(result.key).toBeDefined();
  });

  it('should handle string input', () => {
    const fnStr = '(a, b) => a + b';
    const result = serializeFunction(fnStr);

    expect(result.str).toBe(fnStr);
    expect(result.key).toBeDefined();
  });
});

describe('compileCached', () => {
  beforeEach(() => {
    clearGlobalFunctionCache();
  });

  it('should compile and cache functions', () => {
    const fnStr = '(a, b) => a + b';

    const fn1 = compileCached(fnStr);
    const fn2 = compileCached(fnStr);

    expect(fn1).toBe(fn2); // Same cached instance
    expect(fn1(2, 3)).toBe(5);
  });

  it('should track cache hits', () => {
    const cache = getGlobalFunctionCache();
    clearGlobalFunctionCache();
    cache.resetStats(); // Also reset stats

    const fnStr = '(x) => x * 2';

    compileCached(fnStr); // miss
    compileCached(fnStr); // hit
    compileCached(fnStr); // hit

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
  });
});

describe('cached chunk processors', () => {
  it('should define CACHED_CHUNK_REDUCER template', () => {
    expect(CACHED_CHUNK_REDUCER).toBeDefined();
    expect(CACHED_CHUNK_REDUCER).toContain('__workerFnCache');
  });

  it('should define CACHED_CHUNK_FILTER template', () => {
    expect(CACHED_CHUNK_FILTER).toBeDefined();
    expect(CACHED_CHUNK_FILTER).toContain('items');
    expect(CACHED_CHUNK_FILTER).toContain('indices');
  });

  it('should define CACHED_CHUNK_MAPPER template', () => {
    expect(CACHED_CHUNK_MAPPER).toBeDefined();
    expect(CACHED_CHUNK_MAPPER).toContain('result');
  });
});

describe('global function cache', () => {
  it('should provide singleton instance', () => {
    const cache1 = getGlobalFunctionCache();
    const cache2 = getGlobalFunctionCache();

    expect(cache1).toBe(cache2);
  });

  it('should be clearable', () => {
    const cache = getGlobalFunctionCache();
    cache.set('test-key', () => 42);

    clearGlobalFunctionCache();

    expect(cache.size).toBe(0);
  });
});
