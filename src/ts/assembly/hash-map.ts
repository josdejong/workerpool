/**
 * Hash Map Implementation in AssemblyScript
 *
 * Lock-free hash map for caching compiled functions in WASM.
 * Uses linear probing for collision resolution.
 */

// Hash map constants
/** Default capacity (must be power of 2) */
const DEFAULT_HASHMAP_CAPACITY: u32 = 256;

/** Entry size: 8 bytes hash + 8 bytes value pointer */
const ENTRY_SIZE: u32 = 16;

/** Empty slot marker */
const EMPTY_HASH: u64 = 0;

/** Deleted slot marker */
const DELETED_HASH: u64 = 1;

/** Maximum load factor (70%) */
const MAX_LOAD_FACTOR: f32 = 0.7;

// Hash map header offsets (after main header at offset 4096)
const HASHMAP_BASE: u32 = 4096;
const HASHMAP_CAPACITY_OFFSET: u32 = HASHMAP_BASE + 0;
const HASHMAP_SIZE_OFFSET: u32 = HASHMAP_BASE + 4;
const HASHMAP_MASK_OFFSET: u32 = HASHMAP_BASE + 8;
const HASHMAP_ENTRIES_BASE_OFFSET: u32 = HASHMAP_BASE + 12;
const HASHMAP_ENTRIES_START: u32 = HASHMAP_BASE + 64;

/**
 * FNV-1a hash function for 64-bit output
 *
 * @param key - Pointer to key data
 * @param length - Length of key in bytes
 * @returns 64-bit hash value
 */
export function fnv1a64(key: usize, length: i32): u64 {
  const FNV_OFFSET_BASIS: u64 = 14695981039346656037;
  const FNV_PRIME: u64 = 1099511628211;

  let hash: u64 = FNV_OFFSET_BASIS;

  for (let i: i32 = 0; i < length; i++) {
    hash ^= <u64>load<u8>(key + i);
    hash = hash * FNV_PRIME;
  }

  // Ensure hash is never 0 or 1 (reserved for empty/deleted)
  if (hash < 2) {
    hash = 2;
  }

  return hash;
}

/**
 * Hash a string key
 *
 * @param keyPtr - Pointer to UTF-8 string
 * @param length - String length in bytes
 * @returns 64-bit hash
 */
export function hashStringKey(keyPtr: usize, length: i32): u64 {
  return fnv1a64(keyPtr, length);
}

/**
 * Initialize hash map
 *
 * @param capacity - Initial capacity (will be rounded to power of 2)
 */
export function initHashMap(capacity: u32 = DEFAULT_HASHMAP_CAPACITY): void {
  // Round up to power of 2
  let cap = capacity;
  if ((cap & (cap - 1)) !== 0) {
    cap = 1;
    while (cap < capacity) {
      cap <<= 1;
    }
  }

  const mask = cap - 1;

  atomic.store<u32>(HASHMAP_CAPACITY_OFFSET, cap);
  atomic.store<u32>(HASHMAP_SIZE_OFFSET, 0);
  atomic.store<u32>(HASHMAP_MASK_OFFSET, mask);
  atomic.store<u32>(HASHMAP_ENTRIES_BASE_OFFSET, HASHMAP_ENTRIES_START);

  // Clear all entries
  for (let i: u32 = 0; i < cap; i++) {
    const entryAddr = HASHMAP_ENTRIES_START + i * ENTRY_SIZE;
    atomic.store<u64>(entryAddr, EMPTY_HASH); // hash
    atomic.store<u64>(entryAddr + 8, 0); // value
  }
}

/**
 * Get hash map capacity
 */
export function getHashMapCapacity(): u32 {
  return atomic.load<u32>(HASHMAP_CAPACITY_OFFSET);
}

/**
 * Get hash map size
 */
export function getHashMapSize(): u32 {
  return atomic.load<u32>(HASHMAP_SIZE_OFFSET);
}

/**
 * Get hash map mask
 */
function getHashMapMask(): u32 {
  return atomic.load<u32>(HASHMAP_MASK_OFFSET);
}

/**
 * Get entry address for an index
 */
function getEntryAddr(index: u32): u32 {
  return HASHMAP_ENTRIES_START + index * ENTRY_SIZE;
}

/**
 * Put a key-value pair into the hash map
 *
 * @param hash - Pre-computed hash of the key
 * @param value - Value pointer to store
 * @returns Previous value if key existed, 0 otherwise
 */
export function hashMapPut(hash: u64, value: u64): u64 {
  const capacity = getHashMapCapacity();
  const mask = getHashMapMask();

  // Linear probing
  let index = <u32>(hash & <u64>mask);
  let probeCount: u32 = 0;

  while (probeCount < capacity) {
    const entryAddr = getEntryAddr(index);
    const existingHash = atomic.load<u64>(entryAddr);

    if (existingHash === EMPTY_HASH || existingHash === DELETED_HASH) {
      // Found empty slot, try to claim it
      const swapped = atomic.cmpxchg<u64>(entryAddr, existingHash, hash);
      if (swapped === existingHash) {
        // Successfully claimed slot
        atomic.store<u64>(entryAddr + 8, value);
        atomic.add<u32>(HASHMAP_SIZE_OFFSET, 1);
        return 0;
      }
      // Another thread got it, continue probing
    } else if (existingHash === hash) {
      // Key exists, update value
      const oldValue = atomic.load<u64>(entryAddr + 8);
      atomic.store<u64>(entryAddr + 8, value);
      return oldValue;
    }

    index = (index + 1) & mask;
    probeCount++;
  }

  // Table is full (shouldn't happen if load factor is maintained)
  return 0;
}

/**
 * Get a value from the hash map
 *
 * @param hash - Pre-computed hash of the key
 * @returns Value pointer if found, 0 otherwise
 */
export function hashMapGet(hash: u64): u64 {
  const capacity = getHashMapCapacity();
  const mask = getHashMapMask();

  let index = <u32>(hash & <u64>mask);
  let probeCount: u32 = 0;

  while (probeCount < capacity) {
    const entryAddr = getEntryAddr(index);
    const existingHash = atomic.load<u64>(entryAddr);

    if (existingHash === hash) {
      return atomic.load<u64>(entryAddr + 8);
    }

    if (existingHash === EMPTY_HASH) {
      // Not found
      return 0;
    }

    // Continue probing (including deleted slots)
    index = (index + 1) & mask;
    probeCount++;
  }

  return 0;
}

/**
 * Check if a key exists in the hash map
 *
 * @param hash - Pre-computed hash of the key
 * @returns 1 if exists, 0 otherwise
 */
export function hashMapContains(hash: u64): i32 {
  return hashMapGet(hash) !== 0 ? 1 : 0;
}

/**
 * Remove a key from the hash map
 *
 * @param hash - Pre-computed hash of the key
 * @returns Removed value pointer if existed, 0 otherwise
 */
export function hashMapRemove(hash: u64): u64 {
  const capacity = getHashMapCapacity();
  const mask = getHashMapMask();

  let index = <u32>(hash & <u64>mask);
  let probeCount: u32 = 0;

  while (probeCount < capacity) {
    const entryAddr = getEntryAddr(index);
    const existingHash = atomic.load<u64>(entryAddr);

    if (existingHash === hash) {
      // Found, mark as deleted
      const value = atomic.load<u64>(entryAddr + 8);
      atomic.store<u64>(entryAddr, DELETED_HASH);
      atomic.store<u64>(entryAddr + 8, 0);
      atomic.sub<u32>(HASHMAP_SIZE_OFFSET, 1);
      return value;
    }

    if (existingHash === EMPTY_HASH) {
      // Not found
      return 0;
    }

    index = (index + 1) & mask;
    probeCount++;
  }

  return 0;
}

/**
 * Clear the hash map
 */
export function hashMapClear(): void {
  const capacity = getHashMapCapacity();

  for (let i: u32 = 0; i < capacity; i++) {
    const entryAddr = getEntryAddr(i);
    atomic.store<u64>(entryAddr, EMPTY_HASH);
    atomic.store<u64>(entryAddr + 8, 0);
  }

  atomic.store<u32>(HASHMAP_SIZE_OFFSET, 0);
}

/**
 * Get load factor
 */
export function getLoadFactor(): f32 {
  const size = <f32>getHashMapSize();
  const capacity = <f32>getHashMapCapacity();
  return size / capacity;
}

/**
 * Check if hash map needs resizing
 */
export function needsResize(): bool {
  return getLoadFactor() > MAX_LOAD_FACTOR;
}

/**
 * Get statistics
 */
export function getHashMapStats(statsPtr: usize): void {
  store<u32>(statsPtr, getHashMapSize()); // size
  store<u32>(statsPtr + 4, getHashMapCapacity()); // capacity
  store<f32>(statsPtr + 8, getLoadFactor()); // load factor
}

// =============================================================================
// LRU Cache Extension
// =============================================================================

// LRU-specific offsets
const LRU_HEAD_OFFSET: u32 = HASHMAP_BASE + 48;
const LRU_TAIL_OFFSET: u32 = HASHMAP_BASE + 52;
const LRU_MAX_SIZE_OFFSET: u32 = HASHMAP_BASE + 56;

// LRU entry has additional prev/next pointers
// Entry layout: hash(8) + value(8) + prev(4) + next(4) + timestamp(8) = 32 bytes
const LRU_ENTRY_SIZE: u32 = 32;

/**
 * Initialize LRU cache
 *
 * @param capacity - Maximum number of entries
 */
export function initLRUCache(capacity: u32): void {
  initHashMap(capacity);
  atomic.store<u32>(LRU_HEAD_OFFSET, 0xFFFFFFFF); // Invalid index
  atomic.store<u32>(LRU_TAIL_OFFSET, 0xFFFFFFFF);
  atomic.store<u32>(LRU_MAX_SIZE_OFFSET, capacity);
}

/**
 * Get LRU entry address (uses larger entry size)
 */
function getLRUEntryAddr(index: u32): u32 {
  return HASHMAP_ENTRIES_START + index * LRU_ENTRY_SIZE;
}

/**
 * Put an entry in the LRU cache
 * Automatically evicts least recently used entry if full
 *
 * @param hash - Key hash
 * @param value - Value pointer
 * @param timestamp - Current timestamp for LRU tracking
 * @returns Evicted value if any, 0 otherwise
 */
export function lruCachePut(hash: u64, value: u64, timestamp: u64): u64 {
  const size = getHashMapSize();
  const maxSize = atomic.load<u32>(LRU_MAX_SIZE_OFFSET);

  // Check if we need to evict
  let evictedValue: u64 = 0;
  if (size >= maxSize) {
    // Evict tail (least recently used)
    const tailIndex = atomic.load<u32>(LRU_TAIL_OFFSET);
    if (tailIndex !== 0xFFFFFFFF) {
      const tailAddr = getLRUEntryAddr(tailIndex);
      const tailHash = atomic.load<u64>(tailAddr);
      evictedValue = hashMapRemove(tailHash);
    }
  }

  // Put new entry
  hashMapPut(hash, value);

  // Update LRU list
  const capacity = getHashMapCapacity();
  const mask = getHashMapMask();
  let index = <u32>(hash & <u64>mask);

  // Find the entry we just added
  while (atomic.load<u64>(getLRUEntryAddr(index)) !== hash) {
    index = (index + 1) & mask;
  }

  const entryAddr = getLRUEntryAddr(index);

  // Store timestamp
  atomic.store<u64>(entryAddr + 24, timestamp);

  // Update to head of list
  const oldHead = atomic.load<u32>(LRU_HEAD_OFFSET);

  if (oldHead === 0xFFFFFFFF) {
    // First entry
    atomic.store<u32>(LRU_HEAD_OFFSET, index);
    atomic.store<u32>(LRU_TAIL_OFFSET, index);
    store<u32>(entryAddr + 16, 0xFFFFFFFF); // prev
    store<u32>(entryAddr + 20, 0xFFFFFFFF); // next
  } else {
    // Add to head
    store<u32>(entryAddr + 16, 0xFFFFFFFF); // prev = none
    store<u32>(entryAddr + 20, oldHead); // next = old head

    // Update old head's prev
    const oldHeadAddr = getLRUEntryAddr(oldHead);
    store<u32>(oldHeadAddr + 16, index);

    atomic.store<u32>(LRU_HEAD_OFFSET, index);
  }

  return evictedValue;
}

/**
 * Get from LRU cache and update access time
 *
 * @param hash - Key hash
 * @param timestamp - Current timestamp
 * @returns Value if found, 0 otherwise
 */
export function lruCacheGet(hash: u64, timestamp: u64): u64 {
  const value = hashMapGet(hash);

  if (value !== 0) {
    // Update timestamp and move to head
    const capacity = getHashMapCapacity();
    const mask = getHashMapMask();
    let index = <u32>(hash & <u64>mask);

    while (atomic.load<u64>(getLRUEntryAddr(index)) !== hash) {
      index = (index + 1) & mask;
    }

    const entryAddr = getLRUEntryAddr(index);
    atomic.store<u64>(entryAddr + 24, timestamp);

    // Move to head if not already there
    const head = atomic.load<u32>(LRU_HEAD_OFFSET);
    if (index !== head) {
      // Remove from current position
      const prev = load<u32>(entryAddr + 16);
      const next = load<u32>(entryAddr + 20);

      if (prev !== 0xFFFFFFFF) {
        store<u32>(getLRUEntryAddr(prev) + 20, next);
      }
      if (next !== 0xFFFFFFFF) {
        store<u32>(getLRUEntryAddr(next) + 16, prev);
      } else {
        // Was tail
        atomic.store<u32>(LRU_TAIL_OFFSET, prev);
      }

      // Add to head
      store<u32>(entryAddr + 16, 0xFFFFFFFF);
      store<u32>(entryAddr + 20, head);
      store<u32>(getLRUEntryAddr(head) + 16, index);
      atomic.store<u32>(LRU_HEAD_OFFSET, index);
    }
  }

  return value;
}

/**
 * Get LRU cache size
 */
export function getLRUCacheSize(): u32 {
  return getHashMapSize();
}

/**
 * Clear LRU cache
 */
export function lruCacheClear(): void {
  hashMapClear();
  atomic.store<u32>(LRU_HEAD_OFFSET, 0xFFFFFFFF);
  atomic.store<u32>(LRU_TAIL_OFFSET, 0xFFFFFFFF);
}
