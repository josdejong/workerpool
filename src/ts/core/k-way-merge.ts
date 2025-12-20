/**
 * K-Way Merge Algorithm
 *
 * Efficiently merges k pre-sorted arrays into a single sorted array.
 * Time complexity: O(n log k) where n is total elements and k is number of arrays.
 *
 * This is significantly faster than the O(n log n) full sort approach
 * when merging results from parallel operations where each chunk is already sorted.
 */

/**
 * Indexed item for tracking original positions
 */
export interface IndexedItem<T> {
  item: T;
  index: number;
}

/**
 * Heap entry for k-way merge
 */
interface HeapEntry<T> {
  value: IndexedItem<T>;
  arrayIndex: number;
  elementIndex: number;
}

/**
 * Min-heap implementation for k-way merge
 */
class MinHeap<T> {
  private heap: HeapEntry<T>[] = [];
  private compare: (a: IndexedItem<T>, b: IndexedItem<T>) => number;

  constructor(compare: (a: IndexedItem<T>, b: IndexedItem<T>) => number) {
    this.compare = compare;
  }

  get size(): number {
    return this.heap.length;
  }

  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  push(entry: HeapEntry<T>): void {
    this.heap.push(entry);
    this.siftUp(this.heap.length - 1);
  }

  pop(): HeapEntry<T> | undefined {
    if (this.heap.length === 0) return undefined;

    const result = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.siftDown(0);
    }

    return result;
  }

  peek(): HeapEntry<T> | undefined {
    return this.heap[0];
  }

  private siftUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index].value, this.heap[parentIndex].value) < 0) {
        this.swap(index, parentIndex);
        index = parentIndex;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (
        leftChild < this.heap.length &&
        this.compare(this.heap[leftChild].value, this.heap[smallest].value) < 0
      ) {
        smallest = leftChild;
      }

      if (
        rightChild < this.heap.length &&
        this.compare(this.heap[rightChild].value, this.heap[smallest].value) < 0
      ) {
        smallest = rightChild;
      }

      if (smallest !== index) {
        this.swap(index, smallest);
        index = smallest;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

/**
 * K-way merge for indexed items
 *
 * Merges k arrays of indexed items into a single sorted array.
 * Uses a min-heap for O(n log k) time complexity.
 *
 * @param arrays - Arrays to merge (each should be sorted by index)
 * @returns Merged array sorted by index
 */
export function kWayMergeIndexed<T>(
  arrays: Array<IndexedItem<T>[]>
): IndexedItem<T>[] {
  // Filter out empty arrays
  const nonEmptyArrays = arrays.filter(arr => arr.length > 0);

  if (nonEmptyArrays.length === 0) {
    return [];
  }

  if (nonEmptyArrays.length === 1) {
    return nonEmptyArrays[0];
  }

  // Calculate total size for pre-allocation
  const totalSize = nonEmptyArrays.reduce((sum, arr) => sum + arr.length, 0);
  const result: IndexedItem<T>[] = new Array(totalSize);
  let resultIndex = 0;

  // Compare by index
  const compare = (a: IndexedItem<T>, b: IndexedItem<T>): number => a.index - b.index;

  // Initialize min-heap with first element from each array
  const heap = new MinHeap<T>(compare);

  for (let i = 0; i < nonEmptyArrays.length; i++) {
    heap.push({
      value: nonEmptyArrays[i][0],
      arrayIndex: i,
      elementIndex: 0,
    });
  }

  // Merge
  while (!heap.isEmpty()) {
    const entry = heap.pop()!;
    result[resultIndex++] = entry.value;

    // If there are more elements in this array, add the next one
    const nextElementIndex = entry.elementIndex + 1;
    if (nextElementIndex < nonEmptyArrays[entry.arrayIndex].length) {
      heap.push({
        value: nonEmptyArrays[entry.arrayIndex][nextElementIndex],
        arrayIndex: entry.arrayIndex,
        elementIndex: nextElementIndex,
      });
    }
  }

  return result;
}

/**
 * K-way merge with custom comparator
 *
 * @param arrays - Arrays to merge
 * @param compare - Comparison function
 * @returns Merged sorted array
 */
export function kWayMerge<T>(
  arrays: T[][],
  compare: (a: T, b: T) => number
): T[] {
  const nonEmptyArrays = arrays.filter(arr => arr.length > 0);

  if (nonEmptyArrays.length === 0) {
    return [];
  }

  if (nonEmptyArrays.length === 1) {
    return [...nonEmptyArrays[0]];
  }

  const totalSize = nonEmptyArrays.reduce((sum, arr) => sum + arr.length, 0);
  const result: T[] = new Array(totalSize);
  let resultIndex = 0;

  // Wrap items for heap
  type WrappedItem = { item: T; index: number };
  const wrappedCompare = (a: WrappedItem, b: WrappedItem): number =>
    compare(a.item, b.item);

  const heap = new MinHeap<T>((a, b) => wrappedCompare(
    { item: a.item, index: 0 },
    { item: b.item, index: 0 }
  ));

  for (let i = 0; i < nonEmptyArrays.length; i++) {
    heap.push({
      value: { item: nonEmptyArrays[i][0], index: 0 },
      arrayIndex: i,
      elementIndex: 0,
    });
  }

  while (!heap.isEmpty()) {
    const entry = heap.pop()!;
    result[resultIndex++] = entry.value.item;

    const nextElementIndex = entry.elementIndex + 1;
    if (nextElementIndex < nonEmptyArrays[entry.arrayIndex].length) {
      heap.push({
        value: {
          item: nonEmptyArrays[entry.arrayIndex][nextElementIndex],
          index: 0,
        },
        arrayIndex: entry.arrayIndex,
        elementIndex: nextElementIndex,
      });
    }
  }

  return result;
}

/**
 * Extract items from indexed results in order
 *
 * Optimized path when items don't need to be sorted (just extracted).
 *
 * @param indexedItems - Array of indexed items (already sorted by index)
 * @returns Array of items in order
 */
export function extractInOrder<T>(indexedItems: IndexedItem<T>[]): T[] {
  const result = new Array<T>(indexedItems.length);
  for (let i = 0; i < indexedItems.length; i++) {
    result[i] = indexedItems[i].item;
  }
  return result;
}

/**
 * Merge filter results from parallel chunks
 *
 * Specialized function for parallel filter operations.
 * Each chunk result contains items and their original indices.
 *
 * @param chunkResults - Results from parallel filter chunks
 * @returns Merged items in original order
 */
export function mergeFilterResults<T>(
  chunkResults: Array<{ items: T[]; indices: number[] }>
): T[] {
  // Convert to indexed items
  const indexedArrays: Array<IndexedItem<T>[]> = chunkResults.map(chunk => {
    const result: IndexedItem<T>[] = new Array(chunk.items.length);
    for (let i = 0; i < chunk.items.length; i++) {
      result[i] = { item: chunk.items[i], index: chunk.indices[i] };
    }
    return result;
  });

  // K-way merge
  const merged = kWayMergeIndexed(indexedArrays);

  // Extract items
  return extractInOrder(merged);
}

/**
 * Merge partition results from parallel chunks
 *
 * @param chunkResults - Results from parallel partition chunks
 * @returns Tuple of [matches, nonMatches] in original order
 */
export function mergePartitionResults<T>(
  chunkResults: Array<{
    matches: Array<{ item: T; index: number }>;
    nonMatches: Array<{ item: T; index: number }>;
  }>
): [T[], T[]] {
  const matchArrays: Array<IndexedItem<T>[]> = [];
  const nonMatchArrays: Array<IndexedItem<T>[]> = [];

  for (const chunk of chunkResults) {
    if (chunk.matches.length > 0) {
      matchArrays.push(chunk.matches);
    }
    if (chunk.nonMatches.length > 0) {
      nonMatchArrays.push(chunk.nonMatches);
    }
  }

  const mergedMatches = kWayMergeIndexed(matchArrays);
  const mergedNonMatches = kWayMergeIndexed(nonMatchArrays);

  return [extractInOrder(mergedMatches), extractInOrder(mergedNonMatches)];
}

/**
 * Merge groupBy results from parallel chunks
 *
 * @param chunkResults - Results from parallel groupBy chunks
 * @param preserveOrder - Whether to preserve original order within groups
 * @returns Merged groups
 */
export function mergeGroupByResults<T, K extends string | number>(
  chunkResults: Array<{ groups: Record<K, Array<{ item: T; index: number }>> }>,
  preserveOrder: boolean = true
): Record<K, T[]> {
  const mergedGroups: Record<K, Array<IndexedItem<T>[]>> = {} as Record<K, Array<IndexedItem<T>[]>>;

  // Collect all arrays for each key
  for (const chunk of chunkResults) {
    for (const key of Object.keys(chunk.groups) as K[]) {
      if (!mergedGroups[key]) {
        mergedGroups[key] = [];
      }
      if (chunk.groups[key].length > 0) {
        mergedGroups[key].push(chunk.groups[key]);
      }
    }
  }

  // Merge each group
  const result: Record<K, T[]> = {} as Record<K, T[]>;

  for (const key of Object.keys(mergedGroups) as K[]) {
    if (preserveOrder) {
      const merged = kWayMergeIndexed(mergedGroups[key]);
      result[key] = extractInOrder(merged);
    } else {
      // Just concatenate without sorting
      const items: T[] = [];
      for (const arr of mergedGroups[key]) {
        for (const indexed of arr) {
          items.push(indexed.item);
        }
      }
      result[key] = items;
    }
  }

  return result;
}

/**
 * Merge unique results from parallel chunks
 *
 * @param chunkResults - Results from parallel unique chunks
 * @param keySelector - Optional key selector for deduplication
 * @returns Merged unique items in order of first occurrence
 */
export function mergeUniqueResults<T>(
  chunkResults: Array<{ items: Array<{ item: T; index: number }> }>,
  keySelector?: (item: T) => unknown
): T[] {
  // Collect all indexed items
  const allArrays: Array<IndexedItem<T>[]> = chunkResults
    .map(chunk => chunk.items)
    .filter(arr => arr.length > 0);

  if (allArrays.length === 0) {
    return [];
  }

  // K-way merge to get all items sorted by index
  const merged = kWayMergeIndexed(allArrays);

  // Deduplicate across chunks (first occurrence wins)
  const seen = new Set<string>();
  const uniqueItems: T[] = [];

  for (const { item } of merged) {
    const key = keySelector ? keySelector(item) : item;
    const keyStr = typeof key === 'object' ? JSON.stringify(key) : String(key);

    if (!seen.has(keyStr)) {
      seen.add(keyStr);
      uniqueItems.push(item);
    }
  }

  return uniqueItems;
}

/**
 * Two-way merge (special case of k-way for 2 arrays)
 *
 * Slightly more efficient than general k-way for the common case.
 *
 * @param a - First sorted array
 * @param b - Second sorted array
 * @param compare - Comparison function
 * @returns Merged sorted array
 */
export function twoWayMerge<T>(
  a: T[],
  b: T[],
  compare: (a: T, b: T) => number
): T[] {
  const result: T[] = new Array(a.length + b.length);
  let i = 0;
  let j = 0;
  let k = 0;

  while (i < a.length && j < b.length) {
    if (compare(a[i], b[j]) <= 0) {
      result[k++] = a[i++];
    } else {
      result[k++] = b[j++];
    }
  }

  while (i < a.length) {
    result[k++] = a[i++];
  }

  while (j < b.length) {
    result[k++] = b[j++];
  }

  return result;
}

/**
 * Optimized merge for 2-4 arrays
 *
 * Uses specialized algorithms for small k values.
 *
 * @param arrays - Arrays to merge (2-4)
 * @param compare - Comparison function
 * @returns Merged sorted array
 */
export function mergeSmall<T>(
  arrays: T[][],
  compare: (a: T, b: T) => number
): T[] {
  const nonEmpty = arrays.filter(arr => arr.length > 0);

  switch (nonEmpty.length) {
    case 0:
      return [];
    case 1:
      return [...nonEmpty[0]];
    case 2:
      return twoWayMerge(nonEmpty[0], nonEmpty[1], compare);
    default:
      // For 3-4 arrays, use pairwise merging
      let result = twoWayMerge(nonEmpty[0], nonEmpty[1], compare);
      for (let i = 2; i < nonEmpty.length; i++) {
        result = twoWayMerge(result, nonEmpty[i], compare);
      }
      return result;
  }
}

/**
 * Adaptive merge that chooses best algorithm based on k
 *
 * @param arrays - Arrays to merge
 * @param compare - Comparison function
 * @returns Merged sorted array
 */
export function adaptiveMerge<T>(
  arrays: T[][],
  compare: (a: T, b: T) => number
): T[] {
  const nonEmpty = arrays.filter(arr => arr.length > 0);

  if (nonEmpty.length <= 4) {
    return mergeSmall(nonEmpty, compare);
  }

  return kWayMerge(nonEmpty, compare);
}

export default {
  kWayMerge,
  kWayMergeIndexed,
  extractInOrder,
  mergeFilterResults,
  mergePartitionResults,
  mergeGroupByResults,
  mergeUniqueResults,
  twoWayMerge,
  mergeSmall,
  adaptiveMerge,
};
