/**
 * Pure TypeScript stub for hash-map.ts
 *
 * Provides a pure TypeScript implementation of the hash map functions
 * for testing without WASM compilation.
 */

// Simulated hash map storage
const hashMapStorage = new Map<bigint, bigint>();
let hashMapCapacity = 256;
let hashMapMaxSize = 256;

// LRU tracking
interface LRUEntry {
  value: bigint;
  timestamp: bigint;
}

const lruMap = new Map<bigint, LRUEntry>();
let lruHead: bigint | null = null;
let lruTail: bigint | null = null;
const lruOrder: bigint[] = [];

/**
 * FNV-1a hash function for 64-bit output
 */
export function fnv1a64(key: Uint8Array): bigint {
  const FNV_OFFSET_BASIS = BigInt('14695981039346656037');
  const FNV_PRIME = BigInt('1099511628211');

  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < key.length; i++) {
    hash ^= BigInt(key[i]);
    hash = (hash * FNV_PRIME) & BigInt('0xFFFFFFFFFFFFFFFF');
  }

  if (hash < 2n) {
    hash = 2n;
  }

  return hash;
}

/**
 * Hash a string key
 */
export function hashStringKey(str: string): bigint {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  return fnv1a64(bytes);
}

/**
 * Initialize hash map
 */
export function initHashMap(capacity: number = 256): void {
  hashMapCapacity = capacity;
  hashMapStorage.clear();
}

/**
 * Get hash map capacity
 */
export function getHashMapCapacity(): number {
  return hashMapCapacity;
}

/**
 * Get hash map size
 */
export function getHashMapSize(): number {
  return hashMapStorage.size;
}

/**
 * Put a key-value pair into the hash map
 */
export function hashMapPut(hash: bigint, value: bigint): bigint {
  const existing = hashMapStorage.get(hash);
  hashMapStorage.set(hash, value);
  return existing ?? 0n;
}

/**
 * Get a value from the hash map
 */
export function hashMapGet(hash: bigint): bigint {
  return hashMapStorage.get(hash) ?? 0n;
}

/**
 * Check if a key exists in the hash map
 */
export function hashMapContains(hash: bigint): boolean {
  return hashMapStorage.has(hash);
}

/**
 * Remove a key from the hash map
 */
export function hashMapRemove(hash: bigint): bigint {
  const value = hashMapStorage.get(hash) ?? 0n;
  hashMapStorage.delete(hash);
  return value;
}

/**
 * Clear the hash map
 */
export function hashMapClear(): void {
  hashMapStorage.clear();
}

/**
 * Get load factor
 */
export function getLoadFactor(): number {
  return hashMapStorage.size / hashMapCapacity;
}

/**
 * Check if hash map needs resizing
 */
export function needsResize(): boolean {
  return getLoadFactor() > 0.7;
}

/**
 * Get statistics
 */
export function getHashMapStats(): { size: number; capacity: number; loadFactor: number } {
  return {
    size: getHashMapSize(),
    capacity: getHashMapCapacity(),
    loadFactor: getLoadFactor(),
  };
}

// =============================================================================
// LRU Cache Extension
// =============================================================================

/**
 * Initialize LRU cache
 */
export function initLRUCache(capacity: number): void {
  hashMapMaxSize = capacity;
  initHashMap(capacity);
  lruMap.clear();
  lruOrder.length = 0;
}

/**
 * Put an entry in the LRU cache
 */
export function lruCachePut(hash: bigint, value: bigint, timestamp: bigint): bigint {
  let evictedValue = 0n;

  // Check if we need to evict
  if (lruMap.size >= hashMapMaxSize) {
    // Evict oldest (first in lruOrder)
    if (lruOrder.length > 0) {
      const oldestHash = lruOrder.shift()!;
      evictedValue = hashMapRemove(oldestHash);
      lruMap.delete(oldestHash);
    }
  }

  // Remove from current position if exists
  const existingIndex = lruOrder.indexOf(hash);
  if (existingIndex >= 0) {
    lruOrder.splice(existingIndex, 1);
  }

  // Add to end (most recently used)
  lruOrder.push(hash);
  lruMap.set(hash, { value, timestamp });
  hashMapPut(hash, value);

  return evictedValue;
}

/**
 * Get from LRU cache and update access time
 */
export function lruCacheGet(hash: bigint, timestamp: bigint): bigint {
  const entry = lruMap.get(hash);

  if (!entry) {
    return 0n;
  }

  // Update timestamp
  entry.timestamp = timestamp;

  // Move to end (most recently used)
  const index = lruOrder.indexOf(hash);
  if (index >= 0 && index < lruOrder.length - 1) {
    lruOrder.splice(index, 1);
    lruOrder.push(hash);
  }

  return entry.value;
}

/**
 * Get LRU cache size
 */
export function getLRUCacheSize(): number {
  return lruMap.size;
}

/**
 * Clear LRU cache
 */
export function lruCacheClear(): void {
  hashMapClear();
  lruMap.clear();
  lruOrder.length = 0;
}

export default {
  fnv1a64,
  hashStringKey,
  initHashMap,
  getHashMapCapacity,
  getHashMapSize,
  hashMapPut,
  hashMapGet,
  hashMapContains,
  hashMapRemove,
  hashMapClear,
  getLoadFactor,
  needsResize,
  getHashMapStats,
  initLRUCache,
  lruCachePut,
  lruCacheGet,
  getLRUCacheSize,
  lruCacheClear,
};
