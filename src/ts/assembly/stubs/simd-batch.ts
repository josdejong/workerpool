/**
 * SIMD Batch Processor Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of the AssemblyScript SIMD
 * functions for unit testing with vitest.
 *
 * NOTE: These are scalar implementations - no actual SIMD acceleration.
 * They provide the same API as the WASM module for testing correctness.
 */

// Simulated memory for testing (maps pointer to Float32Array/Float64Array/Int32Array)
let _memoryF32: Map<number, Float32Array> = new Map();
let _memoryF64: Map<number, Float64Array> = new Map();
let _memoryI32: Map<number, Int32Array> = new Map();
let _nextPtr = 1024; // Start after "null" region

/**
 * Reset all SIMD stub state for testing
 */
export function _resetSimd(): void {
  _memoryF32.clear();
  _memoryF64.clear();
  _memoryI32.clear();
  _nextPtr = 1024;
}

/**
 * Allocate aligned memory for SIMD operations
 * Returns a "pointer" (actually just an ID for our Map)
 */
export function allocateAligned(size: number): number {
  const ptr = _nextPtr;
  // Align to 16 bytes
  const alignedSize = (size + 15) & ~15;
  _nextPtr += alignedSize;
  return ptr;
}

/**
 * Free allocated memory
 */
export function freeAligned(ptr: number): void {
  _memoryF32.delete(ptr);
  _memoryF64.delete(ptr);
  _memoryI32.delete(ptr);
}

/**
 * Copy data to WASM memory (stub: no-op, data managed via typed arrays)
 */
export function copyToWasm(_dest: number, _src: number, _length: number): void {
  // In the stub, we manage data directly via typed arrays
}

/**
 * Copy data from WASM memory (stub: no-op)
 */
export function copyFromWasm(_dest: number, _src: number, _length: number): void {
  // In the stub, we manage data directly via typed arrays
}

// ============================================================================
// Helper functions for test setup
// ============================================================================

/**
 * Set Float32 array at pointer (for test setup)
 */
export function _setFloat32Array(ptr: number, data: Float32Array): void {
  _memoryF32.set(ptr, data);
}

/**
 * Get Float32 array at pointer (for test verification)
 */
export function _getFloat32Array(ptr: number): Float32Array | undefined {
  return _memoryF32.get(ptr);
}

/**
 * Set Float64 array at pointer (for test setup)
 */
export function _setFloat64Array(ptr: number, data: Float64Array): void {
  _memoryF64.set(ptr, data);
}

/**
 * Get Float64 array at pointer (for test verification)
 */
export function _getFloat64Array(ptr: number): Float64Array | undefined {
  return _memoryF64.get(ptr);
}

/**
 * Set Int32 array at pointer (for test setup)
 */
export function _setInt32Array(ptr: number, data: Int32Array): void {
  _memoryI32.set(ptr, data);
}

/**
 * Get Int32 array at pointer (for test verification)
 */
export function _getInt32Array(ptr: number): Int32Array | undefined {
  return _memoryI32.get(ptr);
}

// ============================================================================
// Float32 SIMD operations (scalar implementations)
// ============================================================================

/**
 * Map: multiply float32 array by scalar
 */
export function simdMapMultiplyF32(
  input: number,
  output: number,
  length: number,
  scalar: number
): void {
  const inputArr = _memoryF32.get(input);
  if (!inputArr) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = inputArr[i] * scalar;
  }
  _memoryF32.set(output, outputArr);
}

/**
 * Map: add scalar to float32 array
 */
export function simdMapAddF32(
  input: number,
  output: number,
  length: number,
  scalar: number
): void {
  const inputArr = _memoryF32.get(input);
  if (!inputArr) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = inputArr[i] + scalar;
  }
  _memoryF32.set(output, outputArr);
}

/**
 * Map: square float32 array elements
 */
export function simdMapSquareF32(input: number, output: number, length: number): void {
  const inputArr = _memoryF32.get(input);
  if (!inputArr) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = inputArr[i] * inputArr[i];
  }
  _memoryF32.set(output, outputArr);
}

/**
 * Map: square root of float32 array elements
 */
export function simdMapSqrtF32(input: number, output: number, length: number): void {
  const inputArr = _memoryF32.get(input);
  if (!inputArr) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = Math.sqrt(inputArr[i]);
  }
  _memoryF32.set(output, outputArr);
}

/**
 * Reduce: sum float32 array
 */
export function simdReduceSumF32(input: number, length: number): number {
  const inputArr = _memoryF32.get(input);
  if (!inputArr) return 0;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += inputArr[i];
  }
  return sum;
}

/**
 * Reduce: find minimum in float32 array
 */
export function simdReduceMinF32(input: number, length: number): number {
  if (length === 0) return Number.MAX_VALUE;

  const inputArr = _memoryF32.get(input);
  if (!inputArr) return Number.MAX_VALUE;

  let min = Number.MAX_VALUE;
  for (let i = 0; i < length; i++) {
    if (inputArr[i] < min) min = inputArr[i];
  }
  return min;
}

/**
 * Reduce: find maximum in float32 array
 */
export function simdReduceMaxF32(input: number, length: number): number {
  if (length === 0) return -Number.MAX_VALUE;

  const inputArr = _memoryF32.get(input);
  if (!inputArr) return -Number.MAX_VALUE;

  let max = -Number.MAX_VALUE;
  for (let i = 0; i < length; i++) {
    if (inputArr[i] > max) max = inputArr[i];
  }
  return max;
}

/**
 * Dot product of two float32 arrays
 */
export function simdDotProductF32(a: number, b: number, length: number): number {
  const arrA = _memoryF32.get(a);
  const arrB = _memoryF32.get(b);
  if (!arrA || !arrB) return 0;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += arrA[i] * arrB[i];
  }
  return sum;
}

/**
 * Element-wise add of two float32 arrays
 */
export function simdAddArraysF32(
  a: number,
  b: number,
  output: number,
  length: number
): void {
  const arrA = _memoryF32.get(a);
  const arrB = _memoryF32.get(b);
  if (!arrA || !arrB) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = arrA[i] + arrB[i];
  }
  _memoryF32.set(output, outputArr);
}

/**
 * Element-wise multiply of two float32 arrays
 */
export function simdMultiplyArraysF32(
  a: number,
  b: number,
  output: number,
  length: number
): void {
  const arrA = _memoryF32.get(a);
  const arrB = _memoryF32.get(b);
  if (!arrA || !arrB) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = arrA[i] * arrB[i];
  }
  _memoryF32.set(output, outputArr);
}

/**
 * Map: absolute value of float32 array
 */
export function simdMapAbsF32(input: number, output: number, length: number): void {
  const inputArr = _memoryF32.get(input);
  if (!inputArr) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = Math.abs(inputArr[i]);
  }
  _memoryF32.set(output, outputArr);
}

/**
 * Map: negate float32 array
 */
export function simdMapNegateF32(input: number, output: number, length: number): void {
  const inputArr = _memoryF32.get(input);
  if (!inputArr) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = -inputArr[i];
  }
  _memoryF32.set(output, outputArr);
}

/**
 * Map: clamp float32 array between min and max
 */
export function simdMapClampF32(
  input: number,
  output: number,
  length: number,
  minVal: number,
  maxVal: number
): void {
  const inputArr = _memoryF32.get(input);
  if (!inputArr) return;

  const outputArr = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let val = inputArr[i];
    if (val < minVal) val = minVal;
    if (val > maxVal) val = maxVal;
    outputArr[i] = val;
  }
  _memoryF32.set(output, outputArr);
}

// ============================================================================
// Float64 SIMD operations (scalar implementations)
// ============================================================================

/**
 * Map: multiply float64 array by scalar
 */
export function simdMapMultiplyF64(
  input: number,
  output: number,
  length: number,
  scalar: number
): void {
  const inputArr = _memoryF64.get(input);
  if (!inputArr) return;

  const outputArr = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = inputArr[i] * scalar;
  }
  _memoryF64.set(output, outputArr);
}

/**
 * Reduce: sum float64 array
 */
export function simdReduceSumF64(input: number, length: number): number {
  const inputArr = _memoryF64.get(input);
  if (!inputArr) return 0;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += inputArr[i];
  }
  return sum;
}

// ============================================================================
// Integer SIMD operations (scalar implementations)
// ============================================================================

/**
 * Map: multiply int32 array by scalar
 */
export function simdMapMultiplyI32(
  input: number,
  output: number,
  length: number,
  scalar: number
): void {
  const inputArr = _memoryI32.get(input);
  if (!inputArr) return;

  const outputArr = new Int32Array(length);
  for (let i = 0; i < length; i++) {
    outputArr[i] = inputArr[i] * scalar;
  }
  _memoryI32.set(output, outputArr);
}

/**
 * Reduce: sum int32 array
 */
export function simdReduceSumI32(input: number, length: number): number {
  const inputArr = _memoryI32.get(input);
  if (!inputArr) return 0;

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += inputArr[i];
  }
  return sum;
}
