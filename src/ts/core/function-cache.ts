/**
 * Function Compilation Cache
 *
 * Caches compiled functions to avoid repeated eval() in parallel operations.
 * Uses LRU (Least Recently Used) eviction policy for memory management.
 *
 * Performance optimization that eliminates ~100+ μs per eval on V8.
 */

/**
 * Cache entry with timestamp for LRU tracking
 */
interface CacheEntry<T> {
  value: T;
  lastUsed: number;
  size: number;
}

/**
 * Options for function cache
 */
export interface FunctionCacheOptions {
  /** Maximum number of entries in cache */
  maxEntries?: number;
  /** Maximum total size in bytes (estimated) */
  maxSize?: number;
  /** Time-to-live in milliseconds (0 = forever) */
  ttl?: number;
}

/**
 * Cache statistics
 */
export interface FunctionCacheStats {
  /** Number of cache hits */
  hits: number;
  /** Number of cache misses */
  misses: number;
  /** Hit rate percentage */
  hitRate: number;
  /** Number of entries */
  entries: number;
  /** Estimated size in bytes */
  size: number;
  /** Number of evictions */
  evictions: number;
}

/**
 * Simple hash function for strings (djb2)
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return hash.toString(36);
}

/**
 * Create a cache key from function string
 */
export function createFunctionKey(fnStr: string): string {
  // Use hash for faster key comparison
  return `fn_${hashString(fnStr)}_${fnStr.length}`;
}

/**
 * Serialize a function to string with caching key
 */
export function serializeFunction(fn: Function | string): { str: string; key: string } {
  const str = typeof fn === 'function' ? fn.toString() : fn;
  return { str, key: createFunctionKey(str) };
}

/**
 * LRU Function Compilation Cache
 */
export class FunctionCache<T = Function> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxEntries: number;
  private maxSize: number;
  private ttl: number;
  private currentSize: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;

  constructor(options: FunctionCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
    this.maxSize = options.maxSize ?? 10 * 1024 * 1024; // 10MB default
    this.ttl = options.ttl ?? 0;
  }

  /**
   * Get a cached value
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (entry === undefined) {
      this.misses++;
      return undefined;
    }

    // Check TTL expiration
    if (this.ttl > 0 && Date.now() - entry.lastUsed > this.ttl) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Update last used timestamp
    entry.lastUsed = Date.now();
    this.hits++;
    return entry.value;
  }

  /**
   * Set a cached value
   */
  set(key: string, value: T, sizeEstimate?: number): void {
    // Delete existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    const size = sizeEstimate ?? this.estimateSize(value);

    // Evict entries if needed
    while (
      this.cache.size >= this.maxEntries ||
      this.currentSize + size > this.maxSize
    ) {
      if (!this.evictOne()) {
        break; // No more entries to evict
      }
    }

    this.cache.set(key, {
      value,
      lastUsed: Date.now(),
      size,
    });
    this.currentSize += size;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry === undefined) return false;

    // Check TTL expiration
    if (this.ttl > 0 && Date.now() - entry.lastUsed > this.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete an entry
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry === undefined) return false;

    this.currentSize -= entry.size;
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): FunctionCacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      entries: this.cache.size,
      size: this.currentSize,
      evictions: this.evictions,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get number of entries
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Evict least recently used entry
   */
  private evictOne(): boolean {
    if (this.cache.size === 0) return false;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.delete(oldestKey);
      this.evictions++;
      return true;
    }

    return false;
  }

  /**
   * Estimate size of a value
   */
  private estimateSize(value: T): number {
    if (typeof value === 'function') {
      return value.toString().length * 2;
    }
    if (typeof value === 'string') {
      return value.length * 2;
    }
    return 100; // Default estimate for other types
  }
}

/**
 * Global function cache for worker-side compiled functions
 */
let globalFunctionCache: FunctionCache<Function> | null = null;

/**
 * Get or create the global function cache
 */
export function getGlobalFunctionCache(): FunctionCache<Function> {
  if (globalFunctionCache === null) {
    globalFunctionCache = new FunctionCache<Function>({
      maxEntries: 500,
      maxSize: 5 * 1024 * 1024, // 5MB
      ttl: 5 * 60 * 1000, // 5 minutes
    });
  }
  return globalFunctionCache;
}

/**
 * Clear the global function cache
 */
export function clearGlobalFunctionCache(): void {
  if (globalFunctionCache !== null) {
    globalFunctionCache.clear();
  }
}

/**
 * Compile and cache a function from string
 *
 * @param fnStr - Function string to compile
 * @param cache - Cache to use (defaults to global)
 * @returns Compiled function
 */
export function compileCached(
  fnStr: string,
  cache?: FunctionCache<Function>
): Function {
  const targetCache = cache ?? getGlobalFunctionCache();
  const key = createFunctionKey(fnStr);

  // Check cache first
  const cached = targetCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  // Compile function
  // eslint-disable-next-line no-eval
  const compiled = eval('(' + fnStr + ')');

  // Cache the compiled function
  targetCache.set(key, compiled, fnStr.length * 2);

  return compiled;
}

/**
 * Create worker-side code that uses cached compilation
 */
export function createCachedChunkProcessor(
  fnName: string,
  bodyTemplate: string
): string {
  return `
    (function(chunk, startIndex, fnStr, cacheKey) {
      // Use cached compilation if available
      var cache = (typeof __workerFnCache !== 'undefined') ? __workerFnCache : null;
      var fn;

      if (cache && cache[cacheKey]) {
        fn = cache[cacheKey];
      } else {
        fn = eval('(' + fnStr + ')');
        if (cache) {
          cache[cacheKey] = fn;
        } else if (typeof __workerFnCache === 'undefined') {
          __workerFnCache = {};
          __workerFnCache[cacheKey] = fn;
        }
      }

      ${bodyTemplate}
    })
  `;
}

/**
 * Optimized chunk reducer with caching
 */
export const CACHED_CHUNK_REDUCER = createCachedChunkProcessor(
  'reducerFn',
  `
    if (chunk.length === 0) {
      return null;
    }
    var acc = chunk[0];
    for (var i = 1; i < chunk.length; i++) {
      acc = fn(acc, chunk[i], startIndex + i);
    }
    return acc;
  `
);

/**
 * Optimized chunk filter with caching
 */
export const CACHED_CHUNK_FILTER = createCachedChunkProcessor(
  'predicateFn',
  `
    var result = { items: [], indices: [] };
    for (var i = 0; i < chunk.length; i++) {
      if (fn(chunk[i], startIndex + i)) {
        result.items.push(chunk[i]);
        result.indices.push(startIndex + i);
      }
    }
    return result;
  `
);

/**
 * Optimized chunk mapper with caching
 */
export const CACHED_CHUNK_MAPPER = createCachedChunkProcessor(
  'mapperFn',
  `
    var result = new Array(chunk.length);
    for (var i = 0; i < chunk.length; i++) {
      result[i] = fn(chunk[i], startIndex + i);
    }
    return result;
  `
);

/**
 * Optimized chunk forEach with caching
 */
export const CACHED_CHUNK_FOREACH = createCachedChunkProcessor(
  'consumerFn',
  `
    for (var i = 0; i < chunk.length; i++) {
      fn(chunk[i], startIndex + i);
    }
  `
);

/**
 * Optimized chunk find with caching
 */
export const CACHED_CHUNK_FIND = createCachedChunkProcessor(
  'predicateFn',
  `
    for (var i = 0; i < chunk.length; i++) {
      if (fn(chunk[i], startIndex + i)) {
        return { found: true, item: chunk[i], index: startIndex + i };
      }
    }
    return { found: false, index: -1 };
  `
);

/**
 * Optimized chunk counter with caching
 */
export const CACHED_CHUNK_COUNTER = createCachedChunkProcessor(
  'predicateFn',
  `
    var count = 0;
    for (var i = 0; i < chunk.length; i++) {
      if (fn(chunk[i], startIndex + i)) {
        count++;
      }
    }
    return count;
  `
);

export default FunctionCache;
