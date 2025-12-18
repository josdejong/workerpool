/**
 * Histogram Module Tests
 *
 * Tests for the histogram tracking stubs.
 * These validate correctness of histogram recording and percentile calculations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  _resetHistogram,
  MAX_HISTOGRAM_BUCKETS,
  initHistogram,
  initHistogramWithBuckets,
  setBucketBoundary,
  getBucketBoundary,
  recordValue,
  getBucketCount,
  getTotalCount,
  getSum,
  getMin,
  getMax,
  getAverage,
  getHistogramBucketCount,
  calculatePercentile,
  getP50,
  getP90,
  getP95,
  getP99,
  resetHistogram,
  isHistogramInitialized,
  recordValuesBatch,
} from '../../../src/ts/assembly/stubs/histogram';

describe('Histogram Module', () => {
  beforeEach(() => {
    _resetHistogram();
  });

  describe('Initialization', () => {
    it('should initialize with default buckets', () => {
      const result = initHistogram();

      expect(result).toBe(true);
      expect(isHistogramInitialized()).toBe(true);
      expect(getHistogramBucketCount()).toBe(12); // Default boundaries length
    });

    it('should initialize with custom bucket count', () => {
      const result = initHistogramWithBuckets(5);

      expect(result).toBe(true);
      expect(getHistogramBucketCount()).toBe(5);
    });

    it('should reject invalid bucket counts', () => {
      expect(initHistogramWithBuckets(0)).toBe(false);
      expect(initHistogramWithBuckets(-1)).toBe(false);
      expect(initHistogramWithBuckets(MAX_HISTOGRAM_BUCKETS + 1)).toBe(false);
    });

    it('should allow maximum bucket count', () => {
      const result = initHistogramWithBuckets(MAX_HISTOGRAM_BUCKETS);

      expect(result).toBe(true);
      expect(getHistogramBucketCount()).toBe(MAX_HISTOGRAM_BUCKETS);
    });

    it('should not allow double initialization', () => {
      initHistogram();
      const result = initHistogram();

      expect(result).toBe(false);
    });

    it('should have correct default boundaries', () => {
      initHistogram();

      expect(getBucketBoundary(0)).toBe(1);
      expect(getBucketBoundary(1)).toBe(5);
      expect(getBucketBoundary(2)).toBe(10);
      expect(getBucketBoundary(3)).toBe(25);
      expect(getBucketBoundary(11)).toBe(10000);
    });
  });

  describe('Bucket boundaries', () => {
    beforeEach(() => {
      initHistogramWithBuckets(5);
    });

    it('should set custom bucket boundary', () => {
      setBucketBoundary(0, 2);
      setBucketBoundary(1, 10);

      expect(getBucketBoundary(0)).toBe(2);
      expect(getBucketBoundary(1)).toBe(10);
    });

    it('should return -1 for invalid bucket index', () => {
      expect(getBucketBoundary(-1)).toBe(-1);
      expect(getBucketBoundary(100)).toBe(-1);
    });

    it('should ignore set on invalid bucket index', () => {
      setBucketBoundary(100, 999);
      expect(getBucketBoundary(100)).toBe(-1);
    });
  });

  describe('Recording values', () => {
    beforeEach(() => {
      initHistogram();
    });

    it('should record a single value', () => {
      recordValue(5);

      expect(getTotalCount()).toBe(BigInt(1));
      expect(getSum()).toBe(5);
      expect(getMin()).toBe(5);
      expect(getMax()).toBe(5);
    });

    it('should place value in correct bucket', () => {
      // Default buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
      recordValue(0.5);  // Should go in bucket 0 (<=1)
      recordValue(3);    // Should go in bucket 1 (<=5)
      recordValue(7);    // Should go in bucket 2 (<=10)
      recordValue(15000); // Should go in overflow bucket (12)

      expect(getBucketCount(0)).toBe(BigInt(1));
      expect(getBucketCount(1)).toBe(BigInt(1));
      expect(getBucketCount(2)).toBe(BigInt(1));
      expect(getBucketCount(12)).toBe(BigInt(1)); // Overflow
    });

    it('should track multiple values in same bucket', () => {
      recordValue(2);
      recordValue(3);
      recordValue(4);

      expect(getBucketCount(1)).toBe(BigInt(3)); // All <= 5
    });

    it('should track min and max', () => {
      recordValue(50);
      recordValue(10);
      recordValue(100);
      recordValue(5);

      expect(getMin()).toBe(5);
      expect(getMax()).toBe(100);
    });

    it('should track sum correctly', () => {
      recordValue(10);
      recordValue(20);
      recordValue(30);

      expect(getSum()).toBe(60);
      expect(getAverage()).toBe(20);
    });

    it('should not record if not initialized', () => {
      _resetHistogram();
      recordValue(100);

      expect(getTotalCount()).toBe(BigInt(0));
    });
  });

  describe('Batch recording', () => {
    beforeEach(() => {
      initHistogram();
    });

    it('should record batch of values', () => {
      recordValuesBatch([1, 2, 3, 4, 5]);

      expect(getTotalCount()).toBe(BigInt(5));
      expect(getSum()).toBe(15);
      expect(getMin()).toBe(1);
      expect(getMax()).toBe(5);
    });

    it('should handle empty batch', () => {
      recordValuesBatch([]);

      expect(getTotalCount()).toBe(BigInt(0));
    });

    it('should handle large batch', () => {
      const values = Array.from({ length: 1000 }, (_, i) => i + 1);
      recordValuesBatch(values);

      expect(getTotalCount()).toBe(BigInt(1000));
      expect(getMin()).toBe(1);
      expect(getMax()).toBe(1000);
      expect(getSum()).toBe(500500); // Sum of 1 to 1000
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      initHistogram();
    });

    it('should return 0 for empty histogram', () => {
      expect(getMin()).toBe(0);
      expect(getMax()).toBe(0);
      expect(getAverage()).toBe(0);
    });

    it('should calculate correct average', () => {
      recordValue(10);
      recordValue(20);
      recordValue(30);
      recordValue(40);

      expect(getAverage()).toBe(25);
    });
  });

  describe('Percentile calculations', () => {
    beforeEach(() => {
      initHistogramWithBuckets(10);
      // Set buckets: 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
      for (let i = 0; i < 10; i++) {
        setBucketBoundary(i, (i + 1) * 10);
      }
    });

    it('should return 0 for empty histogram', () => {
      expect(calculatePercentile(50)).toBe(0);
      expect(getP50()).toBe(0);
    });

    it('should return 0 for invalid percentiles', () => {
      recordValue(50);

      expect(calculatePercentile(-10)).toBe(0);
      expect(calculatePercentile(110)).toBe(0);
    });

    it('should calculate P50 for uniform distribution', () => {
      // Record 100 values: 10 in each bucket
      for (let bucket = 0; bucket < 10; bucket++) {
        for (let i = 0; i < 10; i++) {
          recordValue((bucket + 1) * 10 - 5); // Mid-point of each bucket
        }
      }

      const p50 = getP50();
      // P50 should be around 50 (middle value)
      expect(p50).toBeGreaterThanOrEqual(40);
      expect(p50).toBeLessThanOrEqual(60);
    });

    it('should calculate P95 correctly', () => {
      // Record 100 values with known distribution
      for (let i = 1; i <= 100; i++) {
        recordValue(i);
      }

      const p95 = getP95();
      // P95 should be around 95
      expect(p95).toBeGreaterThanOrEqual(85);
      expect(p95).toBeLessThanOrEqual(100);
    });

    it('should calculate P99 correctly', () => {
      for (let i = 1; i <= 100; i++) {
        recordValue(i);
      }

      const p99 = getP99();
      // P99 should be around 99
      expect(p99).toBeGreaterThanOrEqual(90);
      expect(p99).toBeLessThanOrEqual(100);
    });

    it('should handle skewed distributions', () => {
      // 90% of values are small, 10% are large
      for (let i = 0; i < 90; i++) {
        recordValue(5);
      }
      for (let i = 0; i < 10; i++) {
        recordValue(95);
      }

      const p50 = getP50();
      const p95 = getP95();

      expect(p50).toBeLessThanOrEqual(20); // Most values are small
      expect(p95).toBeGreaterThanOrEqual(80); // Top 5% are large
    });
  });

  describe('Reset functionality', () => {
    beforeEach(() => {
      initHistogram();
    });

    it('should reset histogram state', () => {
      recordValue(10);
      recordValue(20);
      recordValue(30);

      expect(getTotalCount()).toBe(BigInt(3));

      resetHistogram();

      expect(getTotalCount()).toBe(BigInt(0));
      expect(getSum()).toBe(0);
      expect(getMin()).toBe(0);
      expect(getMax()).toBe(0);
      expect(getBucketCount(0)).toBe(BigInt(0));
    });

    it('should preserve bucket configuration after reset', () => {
      setBucketBoundary(0, 100);
      resetHistogram();

      expect(getBucketBoundary(0)).toBe(100);
      expect(getHistogramBucketCount()).toBe(12);
    });

    it('should not reset if not initialized', () => {
      _resetHistogram();
      resetHistogram(); // Should not throw
      expect(isHistogramInitialized()).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero values', () => {
      initHistogram();
      recordValue(0);

      expect(getTotalCount()).toBe(BigInt(1));
      expect(getMin()).toBe(0);
      expect(getMax()).toBe(0);
      expect(getBucketCount(0)).toBe(BigInt(1)); // 0 <= 1
    });

    it('should handle negative values', () => {
      initHistogram();
      recordValue(-10);

      expect(getTotalCount()).toBe(BigInt(1));
      expect(getMin()).toBe(-10);
      expect(getBucketCount(0)).toBe(BigInt(1)); // -10 <= 1
    });

    it('should handle very large values', () => {
      initHistogram();
      recordValue(1000000);

      expect(getTotalCount()).toBe(BigInt(1));
      expect(getMax()).toBe(1000000);
      expect(getBucketCount(12)).toBe(BigInt(1)); // Overflow bucket
    });

    it('should handle single value percentiles', () => {
      initHistogram();
      recordValue(50);

      // All percentiles should be around 50 for single value
      expect(getP50()).toBeCloseTo(50, 0);
    });

    it('should handle boundary values exactly', () => {
      initHistogram();
      // Default buckets: [1, 5, 10, 25, ...]
      recordValue(1);  // Exactly at boundary
      recordValue(5);  // Exactly at boundary

      expect(getBucketCount(0)).toBe(BigInt(1)); // 1 <= 1
      expect(getBucketCount(1)).toBe(BigInt(1)); // 5 <= 5
    });
  });

  describe('MAX_HISTOGRAM_BUCKETS constant', () => {
    it('should be exported and reasonable', () => {
      expect(MAX_HISTOGRAM_BUCKETS).toBeDefined();
      expect(MAX_HISTOGRAM_BUCKETS).toBe(32);
    });
  });

  describe('High volume operations', () => {
    beforeEach(() => {
      initHistogram();
    });

    it('should handle many values without overflow', () => {
      const count = 100000;
      for (let i = 0; i < count; i++) {
        recordValue(Math.random() * 1000);
      }

      expect(getTotalCount()).toBe(BigInt(count));
    });

    it('should maintain accuracy with many values', () => {
      // Record predictable values
      for (let i = 0; i < 1000; i++) {
        recordValue(50);
      }

      expect(getMin()).toBe(50);
      expect(getMax()).toBe(50);
      expect(getAverage()).toBe(50);
      expect(getSum()).toBe(50000);
    });
  });
});
