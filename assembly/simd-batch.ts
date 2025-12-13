/**
 * SIMD Batch Processor (AssemblyScript)
 *
 * Provides SIMD-accelerated batch operations for numeric arrays.
 * Uses v128 SIMD intrinsics for parallel processing.
 */

// SIMD lane count for different types
const F32_LANES: i32 = 4; // 4 x float32 in 128-bit vector
const F64_LANES: i32 = 2; // 2 x float64 in 128-bit vector
const I32_LANES: i32 = 4; // 4 x int32 in 128-bit vector

/**
 * SIMD-accelerated map: multiply float32 array by scalar
 *
 * @param input - Input array pointer
 * @param output - Output array pointer
 * @param length - Array length
 * @param scalar - Scalar multiplier
 */
export function simdMapMultiplyF32(
  input: usize,
  output: usize,
  length: i32,
  scalar: f32
): void {
  const scalarVec = f32x4.splat(scalar);
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  // Process 4 elements at a time with SIMD
  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16; // 4 floats * 4 bytes
    const vec = v128.load(input + offset);
    const result = f32x4.mul(vec, scalarVec);
    v128.store(output + offset, result);
  }

  // Handle remainder scalar
  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const val = load<f32>(input + idx * 4);
    store<f32>(output + idx * 4, val * scalar);
  }
}

/**
 * SIMD-accelerated map: add scalar to float32 array
 */
export function simdMapAddF32(
  input: usize,
  output: usize,
  length: i32,
  scalar: f32
): void {
  const scalarVec = f32x4.splat(scalar);
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    const result = f32x4.add(vec, scalarVec);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const val = load<f32>(input + idx * 4);
    store<f32>(output + idx * 4, val + scalar);
  }
}

/**
 * SIMD-accelerated map: square float32 array elements
 */
export function simdMapSquareF32(input: usize, output: usize, length: i32): void {
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    const result = f32x4.mul(vec, vec);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const val = load<f32>(input + idx * 4);
    store<f32>(output + idx * 4, val * val);
  }
}

/**
 * SIMD-accelerated map: square root of float32 array elements
 */
export function simdMapSqrtF32(input: usize, output: usize, length: i32): void {
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    const result = f32x4.sqrt(vec);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const val = load<f32>(input + idx * 4);
    store<f32>(output + idx * 4, Mathf.sqrt(val));
  }
}

/**
 * SIMD-accelerated reduce: sum float32 array
 *
 * @param input - Input array pointer
 * @param length - Array length
 * @returns Sum of all elements
 */
export function simdReduceSumF32(input: usize, length: i32): f32 {
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  // Accumulate SIMD vectors
  let sumVec = f32x4.splat(0.0);
  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    sumVec = f32x4.add(sumVec, vec);
  }

  // Horizontal sum of vector
  let sum: f32 =
    f32x4.extract_lane(sumVec, 0) +
    f32x4.extract_lane(sumVec, 1) +
    f32x4.extract_lane(sumVec, 2) +
    f32x4.extract_lane(sumVec, 3);

  // Add remainder
  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    sum += load<f32>(input + (remainderOffset + i) * 4);
  }

  return sum;
}

/**
 * SIMD-accelerated reduce: find minimum in float32 array
 */
export function simdReduceMinF32(input: usize, length: i32): f32 {
  if (length === 0) return f32.MAX_VALUE;

  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  let minVec = f32x4.splat(f32.MAX_VALUE);
  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    minVec = f32x4.min(minVec, vec);
  }

  let minVal: f32 = Mathf.min(
    Mathf.min(f32x4.extract_lane(minVec, 0), f32x4.extract_lane(minVec, 1)),
    Mathf.min(f32x4.extract_lane(minVec, 2), f32x4.extract_lane(minVec, 3))
  );

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const val = load<f32>(input + (remainderOffset + i) * 4);
    if (val < minVal) minVal = val;
  }

  return minVal;
}

/**
 * SIMD-accelerated reduce: find maximum in float32 array
 */
export function simdReduceMaxF32(input: usize, length: i32): f32 {
  if (length === 0) return f32.MIN_VALUE;

  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  let maxVec = f32x4.splat(f32.MIN_VALUE);
  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    maxVec = f32x4.max(maxVec, vec);
  }

  let maxVal: f32 = Mathf.max(
    Mathf.max(f32x4.extract_lane(maxVec, 0), f32x4.extract_lane(maxVec, 1)),
    Mathf.max(f32x4.extract_lane(maxVec, 2), f32x4.extract_lane(maxVec, 3))
  );

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const val = load<f32>(input + (remainderOffset + i) * 4);
    if (val > maxVal) maxVal = val;
  }

  return maxVal;
}

/**
 * SIMD-accelerated dot product of two float32 arrays
 */
export function simdDotProductF32(a: usize, b: usize, length: i32): f32 {
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  let sumVec = f32x4.splat(0.0);
  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vecA = v128.load(a + offset);
    const vecB = v128.load(b + offset);
    const product = f32x4.mul(vecA, vecB);
    sumVec = f32x4.add(sumVec, product);
  }

  let sum: f32 =
    f32x4.extract_lane(sumVec, 0) +
    f32x4.extract_lane(sumVec, 1) +
    f32x4.extract_lane(sumVec, 2) +
    f32x4.extract_lane(sumVec, 3);

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    sum += load<f32>(a + idx * 4) * load<f32>(b + idx * 4);
  }

  return sum;
}

/**
 * SIMD-accelerated element-wise add of two float32 arrays
 */
export function simdAddArraysF32(
  a: usize,
  b: usize,
  output: usize,
  length: i32
): void {
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vecA = v128.load(a + offset);
    const vecB = v128.load(b + offset);
    const result = f32x4.add(vecA, vecB);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const valA = load<f32>(a + idx * 4);
    const valB = load<f32>(b + idx * 4);
    store<f32>(output + idx * 4, valA + valB);
  }
}

/**
 * SIMD-accelerated element-wise multiply of two float32 arrays
 */
export function simdMultiplyArraysF32(
  a: usize,
  b: usize,
  output: usize,
  length: i32
): void {
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vecA = v128.load(a + offset);
    const vecB = v128.load(b + offset);
    const result = f32x4.mul(vecA, vecB);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const valA = load<f32>(a + idx * 4);
    const valB = load<f32>(b + idx * 4);
    store<f32>(output + idx * 4, valA * valB);
  }
}

/**
 * SIMD-accelerated absolute value of float32 array
 */
export function simdMapAbsF32(input: usize, output: usize, length: i32): void {
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    const result = f32x4.abs(vec);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const val = load<f32>(input + idx * 4);
    store<f32>(output + idx * 4, Mathf.abs(val));
  }
}

/**
 * SIMD-accelerated negate float32 array
 */
export function simdMapNegateF32(input: usize, output: usize, length: i32): void {
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    const result = f32x4.neg(vec);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const val = load<f32>(input + idx * 4);
    store<f32>(output + idx * 4, -val);
  }
}

/**
 * SIMD-accelerated clamp float32 array between min and max
 */
export function simdMapClampF32(
  input: usize,
  output: usize,
  length: i32,
  minVal: f32,
  maxVal: f32
): void {
  const minVec = f32x4.splat(minVal);
  const maxVec = f32x4.splat(maxVal);
  const vecCount = length / F32_LANES;
  const remainder = length % F32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    const clamped = f32x4.min(f32x4.max(vec, minVec), maxVec);
    v128.store(output + offset, clamped);
  }

  const remainderOffset = vecCount * F32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    let val = load<f32>(input + idx * 4);
    if (val < minVal) val = minVal;
    if (val > maxVal) val = maxVal;
    store<f32>(output + idx * 4, val);
  }
}

// ============================================================================
// Float64 SIMD operations (2 lanes)
// ============================================================================

/**
 * SIMD-accelerated map: multiply float64 array by scalar
 */
export function simdMapMultiplyF64(
  input: usize,
  output: usize,
  length: i32,
  scalar: f64
): void {
  const scalarVec = f64x2.splat(scalar);
  const vecCount = length / F64_LANES;
  const remainder = length % F64_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    const result = f64x2.mul(vec, scalarVec);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * F64_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const val = load<f64>(input + idx * 8);
    store<f64>(output + idx * 8, val * scalar);
  }
}

/**
 * SIMD-accelerated reduce: sum float64 array
 */
export function simdReduceSumF64(input: usize, length: i32): f64 {
  const vecCount = length / F64_LANES;
  const remainder = length % F64_LANES;

  let sumVec = f64x2.splat(0.0);
  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    sumVec = f64x2.add(sumVec, vec);
  }

  let sum: f64 = f64x2.extract_lane(sumVec, 0) + f64x2.extract_lane(sumVec, 1);

  const remainderOffset = vecCount * F64_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    sum += load<f64>(input + (remainderOffset + i) * 8);
  }

  return sum;
}

// ============================================================================
// Integer SIMD operations
// ============================================================================

/**
 * SIMD-accelerated map: multiply int32 array by scalar
 */
export function simdMapMultiplyI32(
  input: usize,
  output: usize,
  length: i32,
  scalar: i32
): void {
  const scalarVec = i32x4.splat(scalar);
  const vecCount = length / I32_LANES;
  const remainder = length % I32_LANES;

  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    const result = i32x4.mul(vec, scalarVec);
    v128.store(output + offset, result);
  }

  const remainderOffset = vecCount * I32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    const idx = remainderOffset + i;
    const val = load<i32>(input + idx * 4);
    store<i32>(output + idx * 4, val * scalar);
  }
}

/**
 * SIMD-accelerated reduce: sum int32 array
 */
export function simdReduceSumI32(input: usize, length: i32): i32 {
  const vecCount = length / I32_LANES;
  const remainder = length % I32_LANES;

  let sumVec = i32x4.splat(0);
  for (let i: i32 = 0; i < vecCount; i++) {
    const offset = i * 16;
    const vec = v128.load(input + offset);
    sumVec = i32x4.add(sumVec, vec);
  }

  let sum: i32 =
    i32x4.extract_lane(sumVec, 0) +
    i32x4.extract_lane(sumVec, 1) +
    i32x4.extract_lane(sumVec, 2) +
    i32x4.extract_lane(sumVec, 3);

  const remainderOffset = vecCount * I32_LANES;
  for (let i: i32 = 0; i < remainder; i++) {
    sum += load<i32>(input + (remainderOffset + i) * 4);
  }

  return sum;
}

// ============================================================================
// Memory allocation helpers
// ============================================================================

/**
 * Allocate aligned memory for SIMD operations
 */
export function allocateAligned(size: i32): usize {
  // Align to 16 bytes for SIMD
  const aligned = (size + 15) & ~15;
  return heap.alloc(aligned);
}

/**
 * Free allocated memory
 */
export function freeAligned(ptr: usize): void {
  heap.free(ptr);
}

/**
 * Copy data to WASM memory
 */
export function copyToWasm(dest: usize, src: usize, length: i32): void {
  memory.copy(dest, src, length);
}

/**
 * Copy data from WASM memory
 */
export function copyFromWasm(dest: usize, src: usize, length: i32): void {
  memory.copy(dest, src, length);
}
