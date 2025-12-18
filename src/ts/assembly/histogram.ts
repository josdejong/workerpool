/**
 * Histogram Module (AssemblyScript)
 *
 * Provides atomic histogram operations for latency tracking and metrics.
 * All operations are thread-safe using atomics.
 *
 * Memory layout:
 * - HISTOGRAM_BASE_OFFSET: Start of histogram memory region
 * - First section: Metadata (bucket count, boundaries, stats)
 * - Second section: Bucket counts (u64 each)
 * - Third section: Bucket boundaries (f64 each)
 */

// Histogram memory offsets (after stats region at 192 bytes)
const HISTOGRAM_BASE_OFFSET: u32 = 256;

// Metadata offsets
/** Number of buckets */
const HIST_BUCKET_COUNT_OFFSET: u32 = HISTOGRAM_BASE_OFFSET;
/** Total count of recorded values */
const HIST_TOTAL_COUNT_OFFSET: u32 = HISTOGRAM_BASE_OFFSET + 4;
/** Sum of all recorded values (f64) */
const HIST_SUM_OFFSET: u32 = HISTOGRAM_BASE_OFFSET + 16;
/** Minimum value recorded (f64) */
const HIST_MIN_OFFSET: u32 = HISTOGRAM_BASE_OFFSET + 24;
/** Maximum value recorded (f64) */
const HIST_MAX_OFFSET: u32 = HISTOGRAM_BASE_OFFSET + 32;
/** Initialized flag */
const HIST_INITIALIZED_OFFSET: u32 = HISTOGRAM_BASE_OFFSET + 40;

// Bucket data starts after metadata (64 bytes for alignment)
const HIST_METADATA_SIZE: u32 = 64;
const HIST_BUCKETS_OFFSET: u32 = HISTOGRAM_BASE_OFFSET + HIST_METADATA_SIZE;

/** Maximum number of histogram buckets supported */
export const MAX_HISTOGRAM_BUCKETS: u32 = 32;

/** Size of bucket counts array (u64 per bucket + overflow) */
const BUCKET_COUNTS_SIZE: u32 = (MAX_HISTOGRAM_BUCKETS + 1) * 8;

/** Bucket boundaries start after counts */
const HIST_BOUNDARIES_OFFSET: u32 = HIST_BUCKETS_OFFSET + BUCKET_COUNTS_SIZE;

// Default bucket boundaries (in milliseconds) matching metrics.ts
const DEFAULT_BOUNDARIES: StaticArray<f64> = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Initialize histogram with default bucket boundaries
 * @returns true if initialization successful
 */
export function initHistogram(): bool {
  return initHistogramWithBuckets(DEFAULT_BOUNDARIES.length);
}

/**
 * Initialize histogram with specified number of buckets
 * Uses default boundaries up to the specified count
 * @param bucketCount - Number of buckets (max MAX_HISTOGRAM_BUCKETS)
 * @returns true if initialization successful
 */
export function initHistogramWithBuckets(bucketCount: i32): bool {
  if (bucketCount <= 0 || bucketCount > <i32>MAX_HISTOGRAM_BUCKETS) {
    return false;
  }

  // Check if already initialized
  if (atomic.load<u32>(HIST_INITIALIZED_OFFSET) == 1) {
    return false;
  }

  // Set bucket count
  atomic.store<u32>(HIST_BUCKET_COUNT_OFFSET, <u32>bucketCount);

  // Initialize stats
  atomic.store<u64>(HIST_TOTAL_COUNT_OFFSET, 0);
  store<f64>(HIST_SUM_OFFSET, 0.0);
  store<f64>(HIST_MIN_OFFSET, f64.MAX_VALUE);
  store<f64>(HIST_MAX_OFFSET, f64.MIN_VALUE);

  // Initialize bucket counts to zero
  for (let i: u32 = 0; i <= <u32>bucketCount; i++) {
    atomic.store<u64>(HIST_BUCKETS_OFFSET + i * 8, 0);
  }

  // Store default boundaries
  const boundaryCount = min(bucketCount, DEFAULT_BOUNDARIES.length);
  for (let i = 0; i < boundaryCount; i++) {
    store<f64>(HIST_BOUNDARIES_OFFSET + <u32>i * 8, unchecked(DEFAULT_BOUNDARIES[i]));
  }

  // Fill remaining boundaries with MAX_VALUE
  for (let i = boundaryCount; i < bucketCount; i++) {
    store<f64>(HIST_BOUNDARIES_OFFSET + <u32>i * 8, f64.MAX_VALUE);
  }

  // Mark as initialized
  atomic.store<u32>(HIST_INITIALIZED_OFFSET, 1);

  return true;
}

/**
 * Set a custom bucket boundary
 * @param index - Bucket index (0 to bucketCount-1)
 * @param boundary - Upper bound for this bucket in milliseconds
 */
export function setBucketBoundary(index: u32, boundary: f64): void {
  const bucketCount = atomic.load<u32>(HIST_BUCKET_COUNT_OFFSET);
  if (index < bucketCount) {
    store<f64>(HIST_BOUNDARIES_OFFSET + index * 8, boundary);
  }
}

/**
 * Get a bucket boundary
 * @param index - Bucket index
 * @returns Bucket boundary or -1 if invalid index
 */
export function getBucketBoundary(index: u32): f64 {
  const bucketCount = atomic.load<u32>(HIST_BUCKET_COUNT_OFFSET);
  if (index < bucketCount) {
    return load<f64>(HIST_BOUNDARIES_OFFSET + index * 8);
  }
  return -1.0;
}

/**
 * Record a value in the histogram
 * Finds the appropriate bucket and increments its count atomically.
 * Also updates sum, min, max, and total count.
 * @param value - Value to record (e.g., latency in milliseconds)
 */
export function recordValue(value: f64): void {
  if (atomic.load<u32>(HIST_INITIALIZED_OFFSET) != 1) {
    return;
  }

  const bucketCount = atomic.load<u32>(HIST_BUCKET_COUNT_OFFSET);

  // Find the bucket for this value using binary search
  let bucketIndex = findBucket(value, bucketCount);

  // Increment bucket count atomically
  atomic.add<u64>(HIST_BUCKETS_OFFSET + bucketIndex * 8, 1);

  // Update total count
  atomic.add<u64>(HIST_TOTAL_COUNT_OFFSET, 1);

  // Update sum (not atomic, but acceptable for metrics)
  const currentSum = load<f64>(HIST_SUM_OFFSET);
  store<f64>(HIST_SUM_OFFSET, currentSum + value);

  // Update min (CAS loop)
  updateMin(value);

  // Update max (CAS loop using u64 representation of f64)
  updateMax(value);
}

/**
 * Find the bucket index for a value using binary search
 * @param value - Value to find bucket for
 * @param bucketCount - Number of buckets
 * @returns Bucket index (0 to bucketCount for overflow)
 */
function findBucket(value: f64, bucketCount: u32): u32 {
  // Linear search is faster for small bucket counts (typical: 12 buckets)
  for (let i: u32 = 0; i < bucketCount; i++) {
    const boundary = load<f64>(HIST_BOUNDARIES_OFFSET + i * 8);
    if (value <= boundary) {
      return i;
    }
  }
  // Value exceeds all boundaries, goes in overflow bucket
  return bucketCount;
}

/**
 * Update minimum value atomically using CAS
 */
function updateMin(value: f64): void {
  const valueAsU64 = reinterpret<u64>(value);
  while (true) {
    const currentMin = load<f64>(HIST_MIN_OFFSET);
    if (value >= currentMin) {
      break;
    }
    const currentAsU64 = reinterpret<u64>(currentMin);
    const swapped = atomic.cmpxchg<u64>(HIST_MIN_OFFSET, currentAsU64, valueAsU64);
    if (swapped == currentAsU64) {
      break;
    }
  }
}

/**
 * Update maximum value atomically using CAS
 */
function updateMax(value: f64): void {
  const valueAsU64 = reinterpret<u64>(value);
  while (true) {
    const currentMax = load<f64>(HIST_MAX_OFFSET);
    if (value <= currentMax) {
      break;
    }
    const currentAsU64 = reinterpret<u64>(currentMax);
    const swapped = atomic.cmpxchg<u64>(HIST_MAX_OFFSET, currentAsU64, valueAsU64);
    if (swapped == currentAsU64) {
      break;
    }
  }
}

/**
 * Get the count for a specific bucket
 * @param bucketIndex - Bucket index (0 to bucketCount for overflow)
 * @returns Count of values in the bucket
 */
export function getBucketCount(bucketIndex: u32): u64 {
  const bucketCount = atomic.load<u32>(HIST_BUCKET_COUNT_OFFSET);
  if (bucketIndex <= bucketCount) {
    return atomic.load<u64>(HIST_BUCKETS_OFFSET + bucketIndex * 8);
  }
  return 0;
}

/**
 * Get total count of recorded values
 */
export function getTotalCount(): u64 {
  return atomic.load<u64>(HIST_TOTAL_COUNT_OFFSET);
}

/**
 * Get sum of all recorded values
 */
export function getSum(): f64 {
  return load<f64>(HIST_SUM_OFFSET);
}

/**
 * Get minimum recorded value
 */
export function getMin(): f64 {
  const min = load<f64>(HIST_MIN_OFFSET);
  // If no values recorded, return 0
  if (min == f64.MAX_VALUE) {
    return 0.0;
  }
  return min;
}

/**
 * Get maximum recorded value
 */
export function getMax(): f64 {
  const max = load<f64>(HIST_MAX_OFFSET);
  // If no values recorded, return 0
  if (max == f64.MIN_VALUE) {
    return 0.0;
  }
  return max;
}

/**
 * Get average of recorded values
 */
export function getAverage(): f64 {
  const count = atomic.load<u64>(HIST_TOTAL_COUNT_OFFSET);
  if (count == 0) {
    return 0.0;
  }
  return load<f64>(HIST_SUM_OFFSET) / <f64>count;
}

/**
 * Get number of configured buckets
 */
export function getHistogramBucketCount(): u32 {
  return atomic.load<u32>(HIST_BUCKET_COUNT_OFFSET);
}

/**
 * Calculate approximate percentile from histogram
 * Uses linear interpolation within buckets.
 * @param percentile - Percentile to calculate (0-100)
 * @returns Approximate percentile value
 */
export function calculatePercentile(percentile: f64): f64 {
  if (percentile < 0 || percentile > 100) {
    return 0.0;
  }

  const totalCount = atomic.load<u64>(HIST_TOTAL_COUNT_OFFSET);
  if (totalCount == 0) {
    return 0.0;
  }

  const bucketCount = atomic.load<u32>(HIST_BUCKET_COUNT_OFFSET);
  const targetCount = <u64>((<f64>totalCount * percentile) / 100.0);

  let cumulativeCount: u64 = 0;
  let prevBoundary: f64 = 0.0;

  for (let i: u32 = 0; i <= bucketCount; i++) {
    const bucketCount64 = atomic.load<u64>(HIST_BUCKETS_OFFSET + i * 8);
    const nextCumulative = cumulativeCount + bucketCount64;

    if (nextCumulative >= targetCount && bucketCount64 > 0) {
      // Target is in this bucket
      let boundary: f64;
      if (i < bucketCount) {
        boundary = load<f64>(HIST_BOUNDARIES_OFFSET + i * 8);
      } else {
        // Overflow bucket - use max value
        boundary = load<f64>(HIST_MAX_OFFSET);
        if (boundary == f64.MIN_VALUE) {
          boundary = prevBoundary * 2.0; // Estimate
        }
      }

      // Linear interpolation within bucket
      if (bucketCount64 > 0) {
        const positionInBucket = <f64>(targetCount - cumulativeCount) / <f64>bucketCount64;
        return prevBoundary + (boundary - prevBoundary) * positionInBucket;
      }
      return boundary;
    }

    cumulativeCount = nextCumulative;
    if (i < bucketCount) {
      prevBoundary = load<f64>(HIST_BOUNDARIES_OFFSET + i * 8);
    }
  }

  // Return max if we reach here
  return getMax();
}

/**
 * Calculate P50 (median)
 */
export function getP50(): f64 {
  return calculatePercentile(50.0);
}

/**
 * Calculate P90
 */
export function getP90(): f64 {
  return calculatePercentile(90.0);
}

/**
 * Calculate P95
 */
export function getP95(): f64 {
  return calculatePercentile(95.0);
}

/**
 * Calculate P99
 */
export function getP99(): f64 {
  return calculatePercentile(99.0);
}

/**
 * Reset histogram to initial state
 */
export function resetHistogram(): void {
  if (atomic.load<u32>(HIST_INITIALIZED_OFFSET) != 1) {
    return;
  }

  const bucketCount = atomic.load<u32>(HIST_BUCKET_COUNT_OFFSET);

  // Reset counts
  atomic.store<u64>(HIST_TOTAL_COUNT_OFFSET, 0);
  store<f64>(HIST_SUM_OFFSET, 0.0);
  store<f64>(HIST_MIN_OFFSET, f64.MAX_VALUE);
  store<f64>(HIST_MAX_OFFSET, f64.MIN_VALUE);

  // Reset bucket counts
  for (let i: u32 = 0; i <= bucketCount; i++) {
    atomic.store<u64>(HIST_BUCKETS_OFFSET + i * 8, 0);
  }
}

/**
 * Check if histogram is initialized
 */
export function isHistogramInitialized(): bool {
  return atomic.load<u32>(HIST_INITIALIZED_OFFSET) == 1;
}

/**
 * Batch record multiple values (more efficient for bulk operations)
 * @param valuesPtr - Pointer to f64 array
 * @param count - Number of values
 */
export function recordValuesBatch(valuesPtr: usize, count: i32): void {
  if (atomic.load<u32>(HIST_INITIALIZED_OFFSET) != 1) {
    return;
  }

  for (let i = 0; i < count; i++) {
    const value = load<f64>(valuesPtr + <usize>i * 8);
    recordValue(value);
  }
}
