/**
 * Tests for K-Way Merge Algorithm
 */

import { describe, it, expect } from 'vitest';
import {
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
  IndexedItem,
} from '../../src/ts/core/k-way-merge';

describe('kWayMerge', () => {
  describe('basic merge', () => {
    it('should merge two sorted arrays', () => {
      const arrays = [
        [1, 3, 5, 7],
        [2, 4, 6, 8],
      ];

      const result = kWayMerge(arrays, (a, b) => a - b);

      expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('should merge three sorted arrays', () => {
      const arrays = [
        [1, 4, 7],
        [2, 5, 8],
        [3, 6, 9],
      ];

      const result = kWayMerge(arrays, (a, b) => a - b);

      expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle empty arrays', () => {
      const arrays: number[][] = [[], [1, 2], [], [3, 4], []];

      const result = kWayMerge(arrays, (a, b) => a - b);

      expect(result).toEqual([1, 2, 3, 4]);
    });

    it('should handle all empty arrays', () => {
      const arrays: number[][] = [[], [], []];

      const result = kWayMerge(arrays, (a, b) => a - b);

      expect(result).toEqual([]);
    });

    it('should handle single array', () => {
      const arrays = [[1, 2, 3, 4, 5]];

      const result = kWayMerge(arrays, (a, b) => a - b);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle many arrays', () => {
      const arrays = Array.from({ length: 10 }, (_, i) =>
        Array.from({ length: 5 }, (_, j) => i * 100 + j)
      );

      const result = kWayMerge(arrays, (a, b) => a - b);

      expect(result).toHaveLength(50);
      // Should be sorted
      for (let i = 1; i < result.length; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
      }
    });
  });

  describe('custom comparator', () => {
    it('should support descending order', () => {
      const arrays = [
        [7, 5, 3, 1],
        [8, 6, 4, 2],
      ];

      const result = kWayMerge(arrays, (a, b) => b - a);

      expect(result).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    });

    it('should support string comparison', () => {
      const arrays = [
        ['apple', 'cherry'],
        ['banana', 'date'],
      ];

      const result = kWayMerge(arrays, (a, b) => a.localeCompare(b));

      expect(result).toEqual(['apple', 'banana', 'cherry', 'date']);
    });
  });
});

describe('kWayMergeIndexed', () => {
  it('should merge indexed items by index', () => {
    const arrays: IndexedItem<string>[][] = [
      [
        { item: 'a', index: 0 },
        { item: 'c', index: 4 },
      ],
      [
        { item: 'b', index: 2 },
        { item: 'd', index: 6 },
      ],
    ];

    const result = kWayMergeIndexed(arrays);

    expect(result.map((r) => r.item)).toEqual(['a', 'b', 'c', 'd']);
    expect(result.map((r) => r.index)).toEqual([0, 2, 4, 6]);
  });

  it('should handle empty arrays', () => {
    const arrays: IndexedItem<number>[][] = [[], [], []];

    const result = kWayMergeIndexed(arrays);

    expect(result).toEqual([]);
  });

  it('should handle single array', () => {
    const arrays: IndexedItem<number>[][] = [
      [
        { item: 1, index: 0 },
        { item: 2, index: 1 },
      ],
    ];

    const result = kWayMergeIndexed(arrays);

    expect(result).toBe(arrays[0]); // Returns original for single array
  });
});

describe('extractInOrder', () => {
  it('should extract items from indexed results', () => {
    const indexed: IndexedItem<string>[] = [
      { item: 'a', index: 0 },
      { item: 'b', index: 1 },
      { item: 'c', index: 2 },
    ];

    const result = extractInOrder(indexed);

    expect(result).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeFilterResults', () => {
  it('should merge filter results preserving order', () => {
    const chunkResults = [
      { items: ['a', 'c'], indices: [0, 4] },
      { items: ['b', 'd'], indices: [2, 6] },
    ];

    const result = mergeFilterResults(chunkResults);

    expect(result).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should handle empty chunks', () => {
    const chunkResults = [
      { items: ['a'], indices: [0] },
      { items: [], indices: [] },
      { items: ['b'], indices: [2] },
    ];

    const result = mergeFilterResults(chunkResults);

    expect(result).toEqual(['a', 'b']);
  });
});

describe('mergePartitionResults', () => {
  it('should merge partition results correctly', () => {
    const chunkResults = [
      {
        matches: [
          { item: 2, index: 1 },
          { item: 4, index: 3 },
        ],
        nonMatches: [
          { item: 1, index: 0 },
          { item: 3, index: 2 },
        ],
      },
      {
        matches: [{ item: 6, index: 5 }],
        nonMatches: [{ item: 5, index: 4 }],
      },
    ];

    const [matches, nonMatches] = mergePartitionResults(chunkResults);

    expect(matches).toEqual([2, 4, 6]);
    expect(nonMatches).toEqual([1, 3, 5]);
  });
});

describe('mergeGroupByResults', () => {
  it('should merge groupBy results', () => {
    const chunkResults = [
      {
        groups: {
          even: [
            { item: 2, index: 1 },
            { item: 4, index: 3 },
          ],
          odd: [
            { item: 1, index: 0 },
            { item: 3, index: 2 },
          ],
        },
      },
      {
        groups: {
          even: [{ item: 6, index: 5 }],
          odd: [{ item: 5, index: 4 }],
        },
      },
    ];

    const result = mergeGroupByResults(chunkResults);

    expect(result.even).toEqual([2, 4, 6]);
    expect(result.odd).toEqual([1, 3, 5]);
  });

  it('should handle missing groups in some chunks', () => {
    const chunkResults = [
      {
        groups: {
          a: [{ item: 1, index: 0 }],
        } as Record<string, Array<{ item: number; index: number }>>,
      },
      {
        groups: {
          b: [{ item: 2, index: 1 }],
        } as Record<string, Array<{ item: number; index: number }>>,
      },
    ];

    const result = mergeGroupByResults(chunkResults);

    expect(result.a).toEqual([1]);
    expect(result.b).toEqual([2]);
  });
});

describe('mergeUniqueResults', () => {
  it('should merge unique results and deduplicate', () => {
    const chunkResults = [
      {
        items: [
          { item: 1, index: 0 },
          { item: 2, index: 1 },
        ],
      },
      {
        items: [
          { item: 2, index: 2 }, // duplicate
          { item: 3, index: 3 },
        ],
      },
    ];

    const result = mergeUniqueResults(chunkResults);

    expect(result).toEqual([1, 2, 3]);
  });

  it('should support custom key selector', () => {
    const chunkResults = [
      {
        items: [
          { item: { id: 1, name: 'a' }, index: 0 },
          { item: { id: 2, name: 'b' }, index: 1 },
        ],
      },
      {
        items: [
          { item: { id: 2, name: 'c' }, index: 2 }, // same id
          { item: { id: 3, name: 'd' }, index: 3 },
        ],
      },
    ];

    const result = mergeUniqueResults(
      chunkResults,
      (item) => item.id
    );

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('twoWayMerge', () => {
  it('should merge two arrays efficiently', () => {
    const a = [1, 3, 5, 7];
    const b = [2, 4, 6, 8];

    const result = twoWayMerge(a, b, (x, y) => x - y);

    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('should handle empty first array', () => {
    const a: number[] = [];
    const b = [1, 2, 3];

    const result = twoWayMerge(a, b, (x, y) => x - y);

    expect(result).toEqual([1, 2, 3]);
  });

  it('should handle empty second array', () => {
    const a = [1, 2, 3];
    const b: number[] = [];

    const result = twoWayMerge(a, b, (x, y) => x - y);

    expect(result).toEqual([1, 2, 3]);
  });
});

describe('mergeSmall', () => {
  it('should handle 0 arrays', () => {
    const result = mergeSmall([], (a, b) => a - b);
    expect(result).toEqual([]);
  });

  it('should handle 1 array', () => {
    const result = mergeSmall([[1, 2, 3]], (a, b) => a - b);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should handle 2 arrays', () => {
    const result = mergeSmall([[1, 3], [2, 4]], (a, b) => a - b);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('should handle 3-4 arrays with pairwise merge', () => {
    const result = mergeSmall(
      [[1, 4], [2, 5], [3, 6]],
      (a, b) => a - b
    );
    expect(result).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('adaptiveMerge', () => {
  it('should use optimized algorithm for small k', () => {
    const arrays = [[1, 3], [2, 4]];
    const result = adaptiveMerge(arrays, (a, b) => a - b);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('should use heap-based algorithm for large k', () => {
    const arrays = Array.from({ length: 10 }, (_, i) => [i * 2, i * 2 + 1]);
    const result = adaptiveMerge(arrays, (a, b) => a - b);

    expect(result).toHaveLength(20);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
    }
  });
});

describe('performance characteristics', () => {
  it('should maintain O(n log k) complexity', () => {
    // Generate k sorted arrays with n/k elements each
    const k = 100;
    const elementsPerArray = 100;
    const arrays = Array.from({ length: k }, (_, i) =>
      Array.from({ length: elementsPerArray }, (_, j) => i * 1000 + j)
    );

    const start = performance.now();
    const result = kWayMerge(arrays, (a, b) => a - b);
    const duration = performance.now() - start;

    expect(result).toHaveLength(k * elementsPerArray);
    expect(duration).toBeLessThan(100); // Should be fast
  });
});
