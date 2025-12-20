/**
 * K-Way Merge Implementation in AssemblyScript
 *
 * Efficient WASM implementation of k-way merge algorithm.
 * Uses a min-heap for O(n log k) merge time.
 *
 * Specialized for merging indexed results from parallel operations.
 */

// Maximum number of arrays to merge
const MAX_K: u32 = 64;

// Heap entry size: 4 bytes index + 4 bytes array id + 4 bytes element index = 12 bytes
const HEAP_ENTRY_SIZE: u32 = 12;

// Memory layout for k-way merge (after hash map at 8192)
const KWAY_BASE: u32 = 8192;
const KWAY_K_OFFSET: u32 = KWAY_BASE + 0; // Number of arrays
const KWAY_HEAP_SIZE_OFFSET: u32 = KWAY_BASE + 4; // Current heap size
const KWAY_OUTPUT_PTR_OFFSET: u32 = KWAY_BASE + 8; // Output array pointer
const KWAY_OUTPUT_SIZE_OFFSET: u32 = KWAY_BASE + 12; // Output array size

// Array metadata: for each array, store base pointer and length
const KWAY_ARRAYS_BASE: u32 = KWAY_BASE + 64;
// Each array entry: 4 bytes base pointer + 4 bytes length + 4 bytes current index = 12 bytes
const ARRAY_META_SIZE: u32 = 12;

// Heap storage
const KWAY_HEAP_BASE: u32 = KWAY_ARRAYS_BASE + (MAX_K * ARRAY_META_SIZE);

/**
 * Initialize k-way merge
 *
 * @param k - Number of arrays to merge
 */
export function initKWayMerge(k: u32): void {
  if (k > MAX_K) {
    k = MAX_K;
  }
  store<u32>(KWAY_K_OFFSET, k);
  store<u32>(KWAY_HEAP_SIZE_OFFSET, 0);
  store<u32>(KWAY_OUTPUT_SIZE_OFFSET, 0);
}

/**
 * Set array metadata
 *
 * @param arrayIndex - Index of the array (0 to k-1)
 * @param basePtr - Base pointer to the array data
 * @param length - Number of elements in the array
 */
export function setArrayInfo(arrayIndex: u32, basePtr: u32, length: u32): void {
  const metaAddr = KWAY_ARRAYS_BASE + arrayIndex * ARRAY_META_SIZE;
  store<u32>(metaAddr, basePtr); // base pointer
  store<u32>(metaAddr + 4, length); // length
  store<u32>(metaAddr + 8, 0); // current index
}

/**
 * Get array base pointer
 */
function getArrayBase(arrayIndex: u32): u32 {
  return load<u32>(KWAY_ARRAYS_BASE + arrayIndex * ARRAY_META_SIZE);
}

/**
 * Get array length
 */
function getArrayLength(arrayIndex: u32): u32 {
  return load<u32>(KWAY_ARRAYS_BASE + arrayIndex * ARRAY_META_SIZE + 4);
}

/**
 * Get current element index for an array
 */
function getArrayCurrentIndex(arrayIndex: u32): u32 {
  return load<u32>(KWAY_ARRAYS_BASE + arrayIndex * ARRAY_META_SIZE + 8);
}

/**
 * Increment current index for an array
 */
function incrementArrayIndex(arrayIndex: u32): void {
  const addr = KWAY_ARRAYS_BASE + arrayIndex * ARRAY_META_SIZE + 8;
  store<u32>(addr, load<u32>(addr) + 1);
}

/**
 * Get value from array at current index
 * For indexed items, returns the index value (first 4 bytes)
 */
function getArrayCurrentValue(arrayIndex: u32): i32 {
  const base = getArrayBase(arrayIndex);
  const currentIdx = getArrayCurrentIndex(arrayIndex);
  // Assume each element is 8 bytes: 4 bytes index + 4 bytes data pointer
  return load<i32>(base + currentIdx * 8);
}

/**
 * Get element pointer from array at current index
 */
function getArrayCurrentElement(arrayIndex: u32): u32 {
  const base = getArrayBase(arrayIndex);
  const currentIdx = getArrayCurrentIndex(arrayIndex);
  return base + currentIdx * 8;
}

// =============================================================================
// Min Heap Operations
// =============================================================================

/**
 * Get heap entry address
 */
function getHeapEntryAddr(index: u32): u32 {
  return KWAY_HEAP_BASE + index * HEAP_ENTRY_SIZE;
}

/**
 * Store heap entry
 */
function setHeapEntry(heapIndex: u32, value: i32, arrayIndex: u32): void {
  const addr = getHeapEntryAddr(heapIndex);
  store<i32>(addr, value); // comparison value
  store<u32>(addr + 4, arrayIndex); // which array
}

/**
 * Get heap entry value
 */
function getHeapEntryValue(heapIndex: u32): i32 {
  return load<i32>(getHeapEntryAddr(heapIndex));
}

/**
 * Get heap entry array index
 */
function getHeapEntryArrayIndex(heapIndex: u32): u32 {
  return load<u32>(getHeapEntryAddr(heapIndex) + 4);
}

/**
 * Swap two heap entries
 */
function swapHeapEntries(i: u32, j: u32): void {
  const addrI = getHeapEntryAddr(i);
  const addrJ = getHeapEntryAddr(j);

  const valueI = load<i32>(addrI);
  const arrayIdI = load<u32>(addrI + 4);

  store<i32>(addrI, load<i32>(addrJ));
  store<u32>(addrI + 4, load<u32>(addrJ + 4));

  store<i32>(addrJ, valueI);
  store<u32>(addrJ + 4, arrayIdI);
}

/**
 * Sift up after insertion
 */
function siftUp(index: u32): void {
  while (index > 0) {
    const parentIdx = (index - 1) >> 1;
    if (getHeapEntryValue(index) < getHeapEntryValue(parentIdx)) {
      swapHeapEntries(index, parentIdx);
      index = parentIdx;
    } else {
      break;
    }
  }
}

/**
 * Sift down after extraction
 */
function siftDown(index: u32): void {
  const heapSize = load<u32>(KWAY_HEAP_SIZE_OFFSET);

  while (true) {
    const leftChild = (index << 1) + 1;
    const rightChild = (index << 1) + 2;
    let smallest = index;

    if (leftChild < heapSize && getHeapEntryValue(leftChild) < getHeapEntryValue(smallest)) {
      smallest = leftChild;
    }

    if (rightChild < heapSize && getHeapEntryValue(rightChild) < getHeapEntryValue(smallest)) {
      smallest = rightChild;
    }

    if (smallest !== index) {
      swapHeapEntries(index, smallest);
      index = smallest;
    } else {
      break;
    }
  }
}

/**
 * Push onto heap
 */
function heapPush(value: i32, arrayIndex: u32): void {
  const heapSize = load<u32>(KWAY_HEAP_SIZE_OFFSET);
  setHeapEntry(heapSize, value, arrayIndex);
  store<u32>(KWAY_HEAP_SIZE_OFFSET, heapSize + 1);
  siftUp(heapSize);
}

/**
 * Pop from heap
 * Returns array index of minimum element
 */
function heapPop(): u32 {
  const heapSize = load<u32>(KWAY_HEAP_SIZE_OFFSET);
  if (heapSize === 0) return 0xFFFFFFFF;

  const minArrayIndex = getHeapEntryArrayIndex(0);

  // Move last to root
  const newSize = heapSize - 1;
  if (newSize > 0) {
    const lastAddr = getHeapEntryAddr(newSize);
    const rootAddr = getHeapEntryAddr(0);
    store<i32>(rootAddr, load<i32>(lastAddr));
    store<u32>(rootAddr + 4, load<u32>(lastAddr + 4));
  }

  store<u32>(KWAY_HEAP_SIZE_OFFSET, newSize);

  if (newSize > 0) {
    siftDown(0);
  }

  return minArrayIndex;
}

/**
 * Get heap size
 */
function getHeapSize(): u32 {
  return load<u32>(KWAY_HEAP_SIZE_OFFSET);
}

// =============================================================================
// K-Way Merge Algorithm
// =============================================================================

/**
 * Initialize the heap with first element from each non-empty array
 */
export function buildInitialHeap(): void {
  const k = load<u32>(KWAY_K_OFFSET);
  store<u32>(KWAY_HEAP_SIZE_OFFSET, 0);

  for (let i: u32 = 0; i < k; i++) {
    const length = getArrayLength(i);
    if (length > 0) {
      const value = getArrayCurrentValue(i);
      heapPush(value, i);
    }
  }
}

/**
 * Extract minimum and add next element from same array
 *
 * @returns Pointer to the minimum element, or 0 if done
 */
export function extractMin(): u32 {
  if (getHeapSize() === 0) {
    return 0;
  }

  // Get minimum element's array index
  const minArrayIndex = heapPop();
  if (minArrayIndex === 0xFFFFFFFF) {
    return 0;
  }

  // Get pointer to the minimum element
  const elementPtr = getArrayCurrentElement(minArrayIndex);

  // Move to next element in that array
  incrementArrayIndex(minArrayIndex);

  // If there are more elements in this array, add to heap
  const currentIdx = getArrayCurrentIndex(minArrayIndex);
  const length = getArrayLength(minArrayIndex);

  if (currentIdx < length) {
    const nextValue = getArrayCurrentValue(minArrayIndex);
    heapPush(nextValue, minArrayIndex);
  }

  return elementPtr;
}

/**
 * Perform complete k-way merge
 *
 * Writes merged result to output buffer.
 *
 * @param outputPtr - Pointer to output buffer
 * @param maxOutput - Maximum number of elements to output
 * @returns Number of elements written
 */
export function kWayMergeToBuffer(outputPtr: u32, maxOutput: u32): u32 {
  buildInitialHeap();

  let outputCount: u32 = 0;

  while (outputCount < maxOutput) {
    const elementPtr = extractMin();
    if (elementPtr === 0) {
      break;
    }

    // Copy 8 bytes (index + data) to output
    store<u64>(outputPtr + outputCount * 8, load<u64>(elementPtr));
    outputCount++;
  }

  store<u32>(KWAY_OUTPUT_SIZE_OFFSET, outputCount);
  return outputCount;
}

/**
 * Get number of elements merged
 */
export function getMergedCount(): u32 {
  return load<u32>(KWAY_OUTPUT_SIZE_OFFSET);
}

// =============================================================================
// Specialized Numeric Merge (for SIMD integration)
// =============================================================================

/**
 * Merge k sorted i32 arrays
 *
 * @param outputPtr - Output buffer
 * @returns Number of elements merged
 */
export function mergeI32Arrays(outputPtr: u32): u32 {
  buildInitialHeap();

  let outputCount: u32 = 0;
  const maxSize = getTotalSize();

  while (outputCount < maxSize && getHeapSize() > 0) {
    const minArrayIndex = heapPop();
    if (minArrayIndex === 0xFFFFFFFF) break;

    // Get the value
    const base = getArrayBase(minArrayIndex);
    const currentIdx = getArrayCurrentIndex(minArrayIndex);
    const value = load<i32>(base + currentIdx * 4);

    // Write to output
    store<i32>(outputPtr + outputCount * 4, value);
    outputCount++;

    // Move to next in array
    incrementArrayIndex(minArrayIndex);

    // Add next to heap if available
    const nextIdx = getArrayCurrentIndex(minArrayIndex);
    if (nextIdx < getArrayLength(minArrayIndex)) {
      const nextValue = load<i32>(base + nextIdx * 4);
      heapPush(nextValue, minArrayIndex);
    }
  }

  return outputCount;
}

/**
 * Merge k sorted f32 arrays
 */
export function mergeF32Arrays(outputPtr: u32): u32 {
  // Reset all array indices
  const k = load<u32>(KWAY_K_OFFSET);
  for (let i: u32 = 0; i < k; i++) {
    store<u32>(KWAY_ARRAYS_BASE + i * ARRAY_META_SIZE + 8, 0);
  }

  // Build heap with f32 values (reinterpreted as i32 for comparison)
  // Note: This only works correctly for positive floats!
  store<u32>(KWAY_HEAP_SIZE_OFFSET, 0);

  for (let i: u32 = 0; i < k; i++) {
    const length = getArrayLength(i);
    if (length > 0) {
      const base = getArrayBase(i);
      const value = reinterpret<i32>(load<f32>(base));
      heapPush(value, i);
    }
  }

  let outputCount: u32 = 0;
  const maxSize = getTotalSize();

  while (outputCount < maxSize && getHeapSize() > 0) {
    const minArrayIndex = heapPop();
    if (minArrayIndex === 0xFFFFFFFF) break;

    const base = getArrayBase(minArrayIndex);
    const currentIdx = getArrayCurrentIndex(minArrayIndex);
    const value = load<f32>(base + currentIdx * 4);

    store<f32>(outputPtr + outputCount * 4, value);
    outputCount++;

    incrementArrayIndex(minArrayIndex);

    const nextIdx = getArrayCurrentIndex(minArrayIndex);
    if (nextIdx < getArrayLength(minArrayIndex)) {
      const nextValue = reinterpret<i32>(load<f32>(base + nextIdx * 4));
      heapPush(nextValue, minArrayIndex);
    }
  }

  return outputCount;
}

/**
 * Get total size of all arrays
 */
export function getTotalSize(): u32 {
  const k = load<u32>(KWAY_K_OFFSET);
  let total: u32 = 0;

  for (let i: u32 = 0; i < k; i++) {
    total += getArrayLength(i);
  }

  return total;
}

/**
 * Two-way merge (optimized for k=2)
 *
 * @param arr1Ptr - First array pointer
 * @param arr1Len - First array length
 * @param arr2Ptr - Second array pointer
 * @param arr2Len - Second array length
 * @param outputPtr - Output buffer
 * @returns Number of elements merged
 */
export function twoWayMergeI32(
  arr1Ptr: u32,
  arr1Len: u32,
  arr2Ptr: u32,
  arr2Len: u32,
  outputPtr: u32
): u32 {
  let i: u32 = 0;
  let j: u32 = 0;
  let k: u32 = 0;

  while (i < arr1Len && j < arr2Len) {
    const val1 = load<i32>(arr1Ptr + i * 4);
    const val2 = load<i32>(arr2Ptr + j * 4);

    if (val1 <= val2) {
      store<i32>(outputPtr + k * 4, val1);
      i++;
    } else {
      store<i32>(outputPtr + k * 4, val2);
      j++;
    }
    k++;
  }

  // Copy remaining from arr1
  while (i < arr1Len) {
    store<i32>(outputPtr + k * 4, load<i32>(arr1Ptr + i * 4));
    i++;
    k++;
  }

  // Copy remaining from arr2
  while (j < arr2Len) {
    store<i32>(outputPtr + k * 4, load<i32>(arr2Ptr + j * 4));
    j++;
    k++;
  }

  return k;
}
