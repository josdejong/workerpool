/**
 * Histogram Stubs for TypeScript Testing
 *
 * Provides pure TypeScript implementations of the AssemblyScript histogram
 * functions for unit testing with vitest.
 *
 * Note: These are NOT thread-safe - they're for single-threaded testing only.
 */

/** Maximum number of histogram buckets supported */
export const MAX_HISTOGRAM_BUCKETS: number = 32;

// Default bucket boundaries (in milliseconds) matching metrics.ts
const DEFAULT_BOUNDARIES: number[] = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

// Internal state
let _initialized = false;
let _bucketCount = 0;
let _bucketCounts: bigint[] = [];
let _bucketBoundaries: number[] = [];
let _totalCount: bigint = BigInt(0);
let _sum = 0;
let _min = Number.MAX_VALUE;
let _max = -Number.MAX_VALUE;

/**
 * Initialize histogram with default bucket boundaries
 * @returns true if initialization successful
 */
export function initHistogram(): boolean {
  return initHistogramWithBuckets(DEFAULT_BOUNDARIES.length);
}

/**
 * Initialize histogram with specified number of buckets
 * Uses default boundaries up to the specified count
 * @param bucketCount - Number of buckets (max MAX_HISTOGRAM_BUCKETS)
 * @returns true if initialization successful
 */
export function initHistogramWithBuckets(bucketCount: number): boolean {
  if (bucketCount <= 0 || bucketCount > MAX_HISTOGRAM_BUCKETS) {
    return false;
  }

  // Check if already initialized
  if (_initialized) {
    return false;
  }

  _bucketCount = bucketCount;
  _totalCount = BigInt(0);
  _sum = 0;
  _min = Number.MAX_VALUE;
  _max = -Number.MAX_VALUE;

  // Initialize bucket counts (bucketCount + 1 for overflow)
  _bucketCounts = new Array(bucketCount + 1).fill(BigInt(0));

  // Store default boundaries
  _bucketBoundaries = [];
  const boundaryCount = Math.min(bucketCount, DEFAULT_BOUNDARIES.length);
  for (let i = 0; i < boundaryCount; i++) {
    _bucketBoundaries.push(DEFAULT_BOUNDARIES[i]);
  }

  // Fill remaining boundaries with MAX_VALUE
  for (let i = boundaryCount; i < bucketCount; i++) {
    _bucketBoundaries.push(Number.MAX_VALUE);
  }

  _initialized = true;
  return true;
}

/**
 * Set a custom bucket boundary
 * @param index - Bucket index (0 to bucketCount-1)
 * @param boundary - Upper bound for this bucket in milliseconds
 */
export function setBucketBoundary(index: number, boundary: number): void {
  if (index >= 0 && index < _bucketCount) {
    _bucketBoundaries[index] = boundary;
  }
}

/**
 * Get a bucket boundary
 * @param index - Bucket index
 * @returns Bucket boundary or -1 if invalid index
 */
export function getBucketBoundary(index: number): number {
  if (index >= 0 && index < _bucketCount) {
    return _bucketBoundaries[index];
  }
  return -1;
}

/**
 * Record a value in the histogram
 * Finds the appropriate bucket and increments its count.
 * Also updates sum, min, max, and total count.
 * @param value - Value to record (e.g., latency in milliseconds)
 */
export function recordValue(value: number): void {
  if (!_initialized) {
    return;
  }

  // Find the bucket for this value
  const bucketIndex = findBucket(value);

  // Increment bucket count
  _bucketCounts[bucketIndex]++;

  // Update total count
  _totalCount++;

  // Update sum
  _sum += value;

  // Update min
  if (value < _min) {
    _min = value;
  }

  // Update max
  if (value > _max) {
    _max = value;
  }
}

/**
 * Find the bucket index for a value
 * @param value - Value to find bucket for
 * @returns Bucket index (0 to bucketCount for overflow)
 */
function findBucket(value: number): number {
  for (let i = 0; i < _bucketCount; i++) {
    if (value <= _bucketBoundaries[i]) {
      return i;
    }
  }
  // Value exceeds all boundaries, goes in overflow bucket
  return _bucketCount;
}

/**
 * Get the count for a specific bucket
 * @param bucketIndex - Bucket index (0 to bucketCount for overflow)
 * @returns Count of values in the bucket
 */
export function getBucketCount(bucketIndex: number): bigint {
  if (bucketIndex >= 0 && bucketIndex <= _bucketCount) {
    return _bucketCounts[bucketIndex];
  }
  return BigInt(0);
}

/**
 * Get total count of recorded values
 */
export function getTotalCount(): bigint {
  return _totalCount;
}

/**
 * Get sum of all recorded values
 */
export function getSum(): number {
  return _sum;
}

/**
 * Get minimum recorded value
 */
export function getMin(): number {
  if (_min === Number.MAX_VALUE) {
    return 0;
  }
  return _min;
}

/**
 * Get maximum recorded value
 */
export function getMax(): number {
  if (_max === -Number.MAX_VALUE) {
    return 0;
  }
  return _max;
}

/**
 * Get average of recorded values
 */
export function getAverage(): number {
  if (_totalCount === BigInt(0)) {
    return 0;
  }
  return _sum / Number(_totalCount);
}

/**
 * Get number of configured buckets
 */
export function getHistogramBucketCount(): number {
  return _bucketCount;
}

/**
 * Calculate approximate percentile from histogram
 * Uses linear interpolation within buckets.
 * @param percentile - Percentile to calculate (0-100)
 * @returns Approximate percentile value
 */
export function calculatePercentile(percentile: number): number {
  if (percentile < 0 || percentile > 100) {
    return 0;
  }

  if (_totalCount === BigInt(0)) {
    return 0;
  }

  const targetCount = BigInt(Math.ceil((Number(_totalCount) * percentile) / 100));

  let cumulativeCount = BigInt(0);
  let prevBoundary = 0;

  for (let i = 0; i <= _bucketCount; i++) {
    const bucketCount = _bucketCounts[i];
    const nextCumulative = cumulativeCount + bucketCount;

    if (nextCumulative >= targetCount && bucketCount > BigInt(0)) {
      // Target is in this bucket
      let boundary: number;
      if (i < _bucketCount) {
        boundary = _bucketBoundaries[i];
      } else {
        // Overflow bucket - use max value
        boundary = _max;
        if (_max === -Number.MAX_VALUE) {
          boundary = prevBoundary * 2; // Estimate
        }
      }

      // Linear interpolation within bucket
      if (bucketCount > BigInt(0)) {
        const positionInBucket = Number(targetCount - cumulativeCount) / Number(bucketCount);
        return prevBoundary + (boundary - prevBoundary) * positionInBucket;
      }
      return boundary;
    }

    cumulativeCount = nextCumulative;
    if (i < _bucketCount) {
      prevBoundary = _bucketBoundaries[i];
    }
  }

  // Return max if we reach here
  return getMax();
}

/**
 * Calculate P50 (median)
 */
export function getP50(): number {
  return calculatePercentile(50);
}

/**
 * Calculate P90
 */
export function getP90(): number {
  return calculatePercentile(90);
}

/**
 * Calculate P95
 */
export function getP95(): number {
  return calculatePercentile(95);
}

/**
 * Calculate P99
 */
export function getP99(): number {
  return calculatePercentile(99);
}

/**
 * Reset histogram to initial state
 */
export function resetHistogram(): void {
  if (!_initialized) {
    return;
  }

  _totalCount = BigInt(0);
  _sum = 0;
  _min = Number.MAX_VALUE;
  _max = -Number.MAX_VALUE;

  // Reset bucket counts
  for (let i = 0; i <= _bucketCount; i++) {
    _bucketCounts[i] = BigInt(0);
  }
}

/**
 * Check if histogram is initialized
 */
export function isHistogramInitialized(): boolean {
  return _initialized;
}

/**
 * Batch record multiple values (more efficient for bulk operations)
 * @param values - Array of values to record
 */
export function recordValuesBatch(values: number[]): void {
  if (!_initialized) {
    return;
  }

  for (const value of values) {
    recordValue(value);
  }
}

/**
 * Reset all histogram state for testing
 */
export function _resetHistogram(): void {
  _initialized = false;
  _bucketCount = 0;
  _bucketCounts = [];
  _bucketBoundaries = [];
  _totalCount = BigInt(0);
  _sum = 0;
  _min = Number.MAX_VALUE;
  _max = -Number.MAX_VALUE;
}
