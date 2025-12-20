/**
 * Pure TypeScript stub for k-way-merge.ts
 *
 * Provides a pure TypeScript implementation of the k-way merge functions
 * for testing without WASM compilation.
 */

// Maximum number of arrays to merge
const MAX_K = 64;

// Array metadata
interface ArrayInfo {
  data: Int32Array | Float32Array;
  currentIndex: number;
}

// State
let arrays: ArrayInfo[] = [];
let outputBuffer: Int32Array | Float32Array | null = null;
let mergedCount = 0;

/**
 * Min-heap for k-way merge
 */
class MinHeap {
  private heap: Array<{ value: number; arrayIndex: number }> = [];

  push(value: number, arrayIndex: number): void {
    this.heap.push({ value, arrayIndex });
    this.siftUp(this.heap.length - 1);
  }

  pop(): { value: number; arrayIndex: number } | undefined {
    if (this.heap.length === 0) return undefined;

    const result = this.heap[0];
    const last = this.heap.pop();

    if (this.heap.length > 0 && last) {
      this.heap[0] = last;
      this.siftDown(0);
    }

    return result;
  }

  size(): number {
    return this.heap.length;
  }

  private siftUp(index: number): void {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      if (this.heap[index].value < this.heap[parentIndex].value) {
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

      if (leftChild < this.heap.length && this.heap[leftChild].value < this.heap[smallest].value) {
        smallest = leftChild;
      }

      if (rightChild < this.heap.length && this.heap[rightChild].value < this.heap[smallest].value) {
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
 * Initialize k-way merge
 */
export function initKWayMerge(k: number): void {
  const limitedK = Math.min(k, MAX_K);
  arrays = new Array(limitedK).fill(null).map(() => ({
    data: new Int32Array(0),
    currentIndex: 0,
  }));
  mergedCount = 0;
}

/**
 * Set array info
 */
export function setArrayInfo(arrayIndex: number, data: Int32Array | Float32Array): void {
  if (arrayIndex < arrays.length) {
    arrays[arrayIndex] = {
      data,
      currentIndex: 0,
    };
  }
}

/**
 * Build initial heap
 */
function buildInitialHeap(): MinHeap {
  const heap = new MinHeap();

  for (let i = 0; i < arrays.length; i++) {
    if (arrays[i].data.length > 0) {
      heap.push(arrays[i].data[0], i);
    }
  }

  return heap;
}

/**
 * Get total size of all arrays
 */
export function getTotalSize(): number {
  return arrays.reduce((sum, arr) => sum + arr.data.length, 0);
}

/**
 * Perform k-way merge on Int32Arrays
 */
export function kWayMergeI32(inputArrays: Int32Array[]): Int32Array {
  initKWayMerge(inputArrays.length);

  for (let i = 0; i < inputArrays.length; i++) {
    setArrayInfo(i, inputArrays[i]);
  }

  const totalSize = getTotalSize();
  const result = new Int32Array(totalSize);
  const heap = buildInitialHeap();

  let outputIndex = 0;

  while (heap.size() > 0) {
    const min = heap.pop()!;
    result[outputIndex++] = min.value;

    const arr = arrays[min.arrayIndex];
    arr.currentIndex++;

    if (arr.currentIndex < arr.data.length) {
      heap.push(arr.data[arr.currentIndex], min.arrayIndex);
    }
  }

  mergedCount = outputIndex;
  return result;
}

/**
 * Perform k-way merge on Float32Arrays
 */
export function kWayMergeF32(inputArrays: Float32Array[]): Float32Array {
  initKWayMerge(inputArrays.length);

  for (let i = 0; i < inputArrays.length; i++) {
    setArrayInfo(i, inputArrays[i]);
  }

  const totalSize = getTotalSize();
  const result = new Float32Array(totalSize);
  const heap = buildInitialHeap();

  let outputIndex = 0;

  while (heap.size() > 0) {
    const min = heap.pop()!;
    result[outputIndex++] = min.value;

    const arr = arrays[min.arrayIndex];
    arr.currentIndex++;

    if (arr.currentIndex < arr.data.length) {
      heap.push(arr.data[arr.currentIndex], min.arrayIndex);
    }
  }

  mergedCount = outputIndex;
  return result;
}

/**
 * Get number of elements merged
 */
export function getMergedCount(): number {
  return mergedCount;
}

/**
 * Two-way merge for Int32Arrays (optimized for k=2)
 */
export function twoWayMergeI32(arr1: Int32Array, arr2: Int32Array): Int32Array {
  const result = new Int32Array(arr1.length + arr2.length);
  let i = 0;
  let j = 0;
  let k = 0;

  while (i < arr1.length && j < arr2.length) {
    if (arr1[i] <= arr2[j]) {
      result[k++] = arr1[i++];
    } else {
      result[k++] = arr2[j++];
    }
  }

  while (i < arr1.length) {
    result[k++] = arr1[i++];
  }

  while (j < arr2.length) {
    result[k++] = arr2[j++];
  }

  return result;
}

/**
 * Two-way merge for Float32Arrays
 */
export function twoWayMergeF32(arr1: Float32Array, arr2: Float32Array): Float32Array {
  const result = new Float32Array(arr1.length + arr2.length);
  let i = 0;
  let j = 0;
  let k = 0;

  while (i < arr1.length && j < arr2.length) {
    if (arr1[i] <= arr2[j]) {
      result[k++] = arr1[i++];
    } else {
      result[k++] = arr2[j++];
    }
  }

  while (i < arr1.length) {
    result[k++] = arr1[i++];
  }

  while (j < arr2.length) {
    result[k++] = arr2[j++];
  }

  return result;
}

/**
 * Indexed item interface
 */
export interface IndexedItem<T> {
  item: T;
  index: number;
}

/**
 * K-way merge for indexed items
 */
export function kWayMergeIndexed<T>(
  arrays: Array<IndexedItem<T>[]>
): IndexedItem<T>[] {
  const nonEmpty = arrays.filter(arr => arr.length > 0);

  if (nonEmpty.length === 0) {
    return [];
  }

  if (nonEmpty.length === 1) {
    return nonEmpty[0];
  }

  // Min-heap for indexed merge
  interface HeapEntry {
    item: IndexedItem<T>;
    arrayIndex: number;
    elementIndex: number;
  }

  const heap: HeapEntry[] = [];

  const parent = (i: number) => Math.floor((i - 1) / 2);
  const leftChild = (i: number) => 2 * i + 1;
  const rightChild = (i: number) => 2 * i + 2;

  const swap = (i: number, j: number) => {
    const temp = heap[i];
    heap[i] = heap[j];
    heap[j] = temp;
  };

  const siftUp = (index: number) => {
    while (index > 0) {
      const p = parent(index);
      if (heap[index].item.index < heap[p].item.index) {
        swap(index, p);
        index = p;
      } else {
        break;
      }
    }
  };

  const siftDown = (index: number) => {
    while (true) {
      const left = leftChild(index);
      const right = rightChild(index);
      let smallest = index;

      if (left < heap.length && heap[left].item.index < heap[smallest].item.index) {
        smallest = left;
      }

      if (right < heap.length && heap[right].item.index < heap[smallest].item.index) {
        smallest = right;
      }

      if (smallest !== index) {
        swap(index, smallest);
        index = smallest;
      } else {
        break;
      }
    }
  };

  // Initialize heap with first element from each array
  for (let i = 0; i < nonEmpty.length; i++) {
    heap.push({
      item: nonEmpty[i][0],
      arrayIndex: i,
      elementIndex: 0,
    });
    siftUp(heap.length - 1);
  }

  // Merge
  const totalSize = nonEmpty.reduce((sum, arr) => sum + arr.length, 0);
  const result: IndexedItem<T>[] = new Array(totalSize);
  let resultIndex = 0;

  while (heap.length > 0) {
    const min = heap[0];
    result[resultIndex++] = min.item;

    const nextElementIndex = min.elementIndex + 1;

    if (nextElementIndex < nonEmpty[min.arrayIndex].length) {
      heap[0] = {
        item: nonEmpty[min.arrayIndex][nextElementIndex],
        arrayIndex: min.arrayIndex,
        elementIndex: nextElementIndex,
      };
      siftDown(0);
    } else {
      heap[0] = heap[heap.length - 1];
      heap.pop();
      if (heap.length > 0) {
        siftDown(0);
      }
    }
  }

  return result;
}

export default {
  initKWayMerge,
  setArrayInfo,
  getTotalSize,
  kWayMergeI32,
  kWayMergeF32,
  getMergedCount,
  twoWayMergeI32,
  twoWayMergeF32,
  kWayMergeIndexed,
};
