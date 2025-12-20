/**
 * Tests for Auto-Transfer Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractTransferables,
  autoDetectTransfer,
  wrapForTransfer,
  isWorthTransferring,
  getTransferableSize,
  createTransferableChunks,
  copyChunkForTransfer,
  prepareNumericArrayForParallel,
  optimizeForTransfer,
  AutoTransfer,
} from '../../src/ts/core/auto-transfer';

describe('extractTransferables', () => {
  it('should extract ArrayBuffer', () => {
    const buffer = new ArrayBuffer(1024);
    const result = extractTransferables(buffer);

    expect(result).toContain(buffer);
  });

  it('should extract TypedArray buffer', () => {
    const arr = new Float32Array(256);
    const result = extractTransferables(arr);

    expect(result).toContain(arr.buffer);
  });

  it('should extract nested ArrayBuffers', () => {
    const data = {
      items: [
        { buffer: new ArrayBuffer(512) },
        { buffer: new ArrayBuffer(256) },
      ],
    };

    const result = extractTransferables(data);

    expect(result).toHaveLength(2);
  });

  it('should handle arrays of TypedArrays', () => {
    const arrays = [
      new Float32Array(100),
      new Float64Array(100),
      new Int32Array(100),
    ];

    const result = extractTransferables(arrays);

    expect(result).toHaveLength(3);
  });

  it('should avoid duplicates for same buffer', () => {
    const buffer = new ArrayBuffer(1024);
    const view1 = new Float32Array(buffer, 0, 128);
    const view2 = new Float32Array(buffer, 512, 128);

    const result = extractTransferables([view1, view2]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(buffer);
  });

  it('should respect max depth', () => {
    const nested: Record<string, unknown> = {};
    let current = nested;

    for (let i = 0; i < 20; i++) {
      current.inner = {};
      current = current.inner as Record<string, unknown>;
    }
    current.buffer = new ArrayBuffer(100);

    const result = extractTransferables(nested, { maxDepth: 5 });

    expect(result).toHaveLength(0);
  });

  it('should handle null and undefined', () => {
    expect(extractTransferables(null)).toEqual([]);
    expect(extractTransferables(undefined)).toEqual([]);
  });

  it('should not transfer SharedArrayBuffer by default', () => {
    const buffer = new SharedArrayBuffer(1024);
    const result = extractTransferables(buffer);

    expect(result).toHaveLength(0);
  });

  it('should transfer SharedArrayBuffer when enabled', () => {
    const buffer = new SharedArrayBuffer(1024);
    const result = extractTransferables(buffer, { transferShared: true });

    expect(result).toHaveLength(1);
  });
});

describe('autoDetectTransfer', () => {
  it('should detect when transfer is worthwhile', () => {
    const largeBuffer = new ArrayBuffer(2048);
    const result = autoDetectTransfer(largeBuffer, { minTransferSize: 1024 });

    expect(result.shouldTransfer).toBe(true);
    expect(result.transferableBytes).toBe(2048);
    expect(result.transferables).toHaveLength(1);
  });

  it('should detect when transfer is not worthwhile', () => {
    const smallBuffer = new ArrayBuffer(100);
    const result = autoDetectTransfer(smallBuffer, { minTransferSize: 1024 });

    expect(result.shouldTransfer).toBe(false);
    expect(result.transferableBytes).toBe(100);
    expect(result.transferables).toHaveLength(0);
  });

  it('should handle non-transferable data', () => {
    const data = { name: 'test', value: 42 };
    const result = autoDetectTransfer(data);

    expect(result.shouldTransfer).toBe(false);
    expect(result.transferableBytes).toBe(0);
  });
});

describe('wrapForTransfer', () => {
  it('should wrap parameters for transfer', () => {
    const params = [
      new Float32Array(1000),
      'hello',
      new ArrayBuffer(2000),
    ];

    const result = wrapForTransfer(params, { minTransferSize: 500 });

    expect(result.params).toBe(params);
    expect(result.transfer).toHaveLength(2);
  });
});

describe('isWorthTransferring', () => {
  it('should return true for large data', () => {
    const large = new Float32Array(1000);
    expect(isWorthTransferring(large, 1024)).toBe(true);
  });

  it('should return false for small data', () => {
    const small = new Float32Array(10);
    expect(isWorthTransferring(small, 1024)).toBe(false);
  });
});

describe('getTransferableSize', () => {
  it('should calculate total transferable size', () => {
    const data = [
      new ArrayBuffer(1000),
      new Float32Array(250), // 1000 bytes
    ];

    const size = getTransferableSize(data);

    expect(size).toBe(2000);
  });
});

describe('createTransferableChunks', () => {
  it('should create chunk views into same buffer', () => {
    const arr = new Float32Array(100);
    for (let i = 0; i < 100; i++) arr[i] = i;

    const chunks = createTransferableChunks(arr, 4);

    expect(chunks).toHaveLength(4);

    // All chunks share same buffer
    expect(chunks[0].chunk.buffer).toBe(arr.buffer);
    expect(chunks[1].chunk.buffer).toBe(arr.buffer);

    // Chunks have correct start/end
    expect(chunks[0].start).toBe(0);
    expect(chunks[0].end).toBe(25);
    expect(chunks[1].start).toBe(25);
    expect(chunks[1].end).toBe(50);
  });

  it('should handle uneven division', () => {
    const arr = new Int32Array(10);
    const chunks = createTransferableChunks(arr, 3);

    const totalLength = chunks.reduce((sum, c) => sum + c.chunk.length, 0);
    expect(totalLength).toBe(10);
  });
});

describe('copyChunkForTransfer', () => {
  it('should create independent copy', () => {
    const arr = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const { chunk, buffer } = copyChunkForTransfer(arr, 2, 7);

    expect(chunk.length).toBe(5);
    expect(chunk[0]).toBe(3);
    expect(chunk[4]).toBe(7);
    expect(buffer).not.toBe(arr.buffer);
    expect(buffer.byteLength).toBe(5 * 4); // 5 floats * 4 bytes
  });
});

describe('prepareNumericArrayForParallel', () => {
  it('should prepare array with views', () => {
    const arr = new Float32Array(100);
    const chunks = prepareNumericArrayForParallel(arr, 4, false);

    expect(chunks).toHaveLength(4);
    expect(chunks[0].transfer).toHaveLength(0); // No transfer for views
  });

  it('should prepare array with copies for transfer', () => {
    const arr = new Float32Array(100);
    const chunks = prepareNumericArrayForParallel(arr, 4, true);

    expect(chunks).toHaveLength(4);
    expect(chunks[0].transfer).toHaveLength(1); // One buffer per chunk
    expect(chunks[0].chunk.buffer).not.toBe(arr.buffer);
  });
});

describe('optimizeForTransfer', () => {
  it('should optimize TypedArray', () => {
    const arr = new Float32Array(1000);
    const result = optimizeForTransfer(arr as unknown as unknown[], { minTransferSize: 1024 });

    expect(result.optimized).toBe(true);
    expect(result.transferables).toHaveLength(1);
  });

  it('should not optimize small TypedArray', () => {
    const arr = new Float32Array(10);
    const result = optimizeForTransfer(arr as unknown as unknown[], { minTransferSize: 1024 });

    expect(result.optimized).toBe(false);
  });

  it('should optimize array with transferable elements', () => {
    const items = [
      { data: new ArrayBuffer(2000) },
      { data: new ArrayBuffer(2000) },
    ];

    const result = optimizeForTransfer(items, { minTransferSize: 1024 });

    expect(result.optimized).toBe(true);
    expect(result.transferables).toHaveLength(2);
  });
});

describe('AutoTransfer class', () => {
  it('should prepare data for transfer', () => {
    const autoTransfer = new AutoTransfer({ minTransferSize: 100 });
    const data = new ArrayBuffer(500);

    const result = autoTransfer.prepare(data);

    expect(result.shouldTransfer).toBe(true);
    expect(result.transferables).toHaveLength(1);
  });

  it('should prepare multiple params', () => {
    const autoTransfer = new AutoTransfer({ minTransferSize: 100 });
    const params = [
      new Float32Array(100),
      new Int32Array(100),
    ];

    const result = autoTransfer.prepareParams(params);

    expect(result.transfer).toHaveLength(2);
  });

  it('should check if data should be transferred', () => {
    const autoTransfer = new AutoTransfer({ minTransferSize: 1024 });

    expect(autoTransfer.shouldTransfer(new ArrayBuffer(2000))).toBe(true);
    expect(autoTransfer.shouldTransfer(new ArrayBuffer(100))).toBe(false);
  });

  it('should get transferable size', () => {
    const autoTransfer = new AutoTransfer();
    const size = autoTransfer.getSize(new Float32Array(100));

    expect(size).toBe(400); // 100 * 4 bytes
  });

  it('should extract all transferables', () => {
    const autoTransfer = new AutoTransfer();
    const data = {
      a: new ArrayBuffer(100),
      b: new Float32Array(50),
    };

    const result = autoTransfer.extract(data);

    expect(result).toHaveLength(2);
  });
});

describe('edge cases', () => {
  it('should handle circular references', () => {
    const obj: Record<string, unknown> = { buffer: new ArrayBuffer(100) };
    obj.self = obj;

    // Should not throw and should find buffer
    const result = extractTransferables(obj);
    expect(result).toHaveLength(1);
  });

  it('should handle frozen objects', () => {
    const frozen = Object.freeze({
      buffer: new ArrayBuffer(100),
    });

    const result = extractTransferables(frozen);
    expect(result).toHaveLength(1);
  });
});
