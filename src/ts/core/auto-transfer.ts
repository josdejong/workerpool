/**
 * Auto-Transfer Utilities
 *
 * Automatically detects and extracts transferable objects from data.
 * Enables zero-copy data transfer between main thread and workers.
 *
 * Transferables avoid the structured clone algorithm's copy overhead,
 * providing significant performance improvements for large binary data.
 */

import {
  isTransferable,
  detectTransferables,
  getTransferableType,
} from '../platform/transfer-detection';

/**
 * Transfer detection result
 */
export interface TransferResult {
  /** Data (possibly modified to use neutered placeholders) */
  data: unknown;
  /** List of transferable objects found */
  transferables: Transferable[];
  /** Total bytes that can be transferred without copying */
  transferableBytes: number;
  /** Whether to use transfer (based on size threshold) */
  shouldTransfer: boolean;
}

/**
 * Auto-transfer options
 */
export interface AutoTransferOptions {
  /** Minimum size in bytes to enable transfer (default: 1024) */
  minTransferSize?: number;
  /** Maximum depth to search for transferables (default: 10) */
  maxDepth?: number;
  /** Whether to transfer nested ArrayBuffers in objects (default: true) */
  transferNested?: boolean;
  /** Whether to also transfer SharedArrayBuffers (default: false) */
  transferShared?: boolean;
}

const DEFAULT_OPTIONS: Required<AutoTransferOptions> = {
  minTransferSize: 1024, // 1KB minimum
  maxDepth: 10,
  transferNested: true,
  transferShared: false,
};

/**
 * Check if value is an ArrayBuffer or TypedArray
 */
function isArrayBufferLike(value: unknown): value is ArrayBuffer | ArrayBufferView {
  return (
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}

/**
 * Get underlying ArrayBuffer from value
 */
function getArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }
  return value.buffer as ArrayBuffer;
}

/**
 * Get byte length of transferable value
 */
function getByteLength(value: unknown): number {
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }
  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  if (value instanceof ImageBitmap) {
    return value.width * value.height * 4; // Estimate RGBA
  }
  if (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) {
    return value.width * value.height * 4; // Estimate RGBA
  }
  if (typeof MessagePort !== 'undefined' && value instanceof MessagePort) {
    return 0; // No byte cost
  }
  return 0;
}

/**
 * Extract transferables from value
 *
 * Recursively searches for transferable objects up to maxDepth.
 */
export function extractTransferables(
  value: unknown,
  options: AutoTransferOptions = {}
): Transferable[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const transferables: Transferable[] = [];
  const seen = new WeakSet<object>();

  function extract(val: unknown, depth: number): void {
    if (depth > opts.maxDepth) return;
    if (val === null || val === undefined) return;

    // Check if already processed
    if (typeof val === 'object') {
      if (seen.has(val as object)) return;
      seen.add(val as object);
    }

    // Check direct transferables
    if (val instanceof ArrayBuffer) {
      transferables.push(val);
      return;
    }

    // SharedArrayBuffer (separate check since it's not instanceof ArrayBuffer)
    if (typeof SharedArrayBuffer !== 'undefined' && val instanceof SharedArrayBuffer) {
      if (opts.transferShared) {
        // Note: SharedArrayBuffer can't actually be transferred, but we track it for reference
        transferables.push(val as unknown as Transferable);
      }
      return;
    }

    // TypedArrays - get underlying buffer
    if (ArrayBuffer.isView(val)) {
      const buffer = val.buffer;
      if (!seen.has(buffer)) {
        seen.add(buffer);
        if (opts.transferShared || !(buffer instanceof SharedArrayBuffer)) {
          transferables.push(buffer);
        }
      }
      return;
    }

    // ImageBitmap
    if (typeof ImageBitmap !== 'undefined' && val instanceof ImageBitmap) {
      transferables.push(val);
      return;
    }

    // OffscreenCanvas
    if (typeof OffscreenCanvas !== 'undefined' && val instanceof OffscreenCanvas) {
      transferables.push(val);
      return;
    }

    // MessagePort
    if (typeof MessagePort !== 'undefined' && val instanceof MessagePort) {
      transferables.push(val);
      return;
    }

    // Arrays
    if (Array.isArray(val) && opts.transferNested) {
      for (const item of val) {
        extract(item, depth + 1);
      }
      return;
    }

    // Objects
    if (typeof val === 'object' && opts.transferNested) {
      for (const key in val) {
        if (Object.prototype.hasOwnProperty.call(val, key)) {
          extract((val as Record<string, unknown>)[key], depth + 1);
        }
      }
    }
  }

  extract(value, 0);
  return transferables;
}

/**
 * Detect transferables and determine if transfer is worthwhile
 */
export function autoDetectTransfer(
  data: unknown,
  options: AutoTransferOptions = {}
): TransferResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const transferables = extractTransferables(data, opts);

  // Calculate total transferable bytes
  let transferableBytes = 0;
  for (const t of transferables) {
    transferableBytes += getByteLength(t);
  }

  // Determine if transfer is worthwhile
  const shouldTransfer =
    transferables.length > 0 && transferableBytes >= opts.minTransferSize;

  return {
    data,
    transferables: shouldTransfer ? transferables : [],
    transferableBytes,
    shouldTransfer,
  };
}

/**
 * Create transfer wrapper for parallel operations
 *
 * Wraps parameters to automatically detect and use transferables.
 */
export function wrapForTransfer<T>(
  params: T[],
  options: AutoTransferOptions = {}
): { params: T[]; transfer: Transferable[] } {
  const allTransferables: Transferable[] = [];

  for (const param of params) {
    const result = autoDetectTransfer(param, options);
    if (result.shouldTransfer) {
      allTransferables.push(...result.transferables);
    }
  }

  return {
    params,
    transfer: allTransferables,
  };
}

/**
 * Check if data is worth transferring
 */
export function isWorthTransferring(
  data: unknown,
  minSize: number = 1024
): boolean {
  const result = autoDetectTransfer(data, { minTransferSize: minSize });
  return result.shouldTransfer;
}

/**
 * Get total transferable size of data
 */
export function getTransferableSize(data: unknown): number {
  const result = autoDetectTransfer(data, { minTransferSize: 0 });
  return result.transferableBytes;
}

/**
 * TypedArray type (all typed arrays share this interface)
 */
type TypedArray =
  | Float32Array
  | Float64Array
  | Int32Array
  | Int16Array
  | Int8Array
  | Uint32Array
  | Uint16Array
  | Uint8Array
  | Uint8ClampedArray;

/**
 * Chunk array into transferable chunks
 *
 * For large TypedArrays, creates views that share the underlying buffer.
 */
export function createTransferableChunks<T extends TypedArray>(
  array: T,
  chunkCount: number
): Array<{ chunk: T; start: number; end: number }> {
  const chunks: Array<{ chunk: T; start: number; end: number }> = [];
  const totalLength = array.length;
  const chunkSize = Math.ceil(totalLength / chunkCount);

  const ArrayConstructor = array.constructor as new (
    buffer: ArrayBuffer,
    byteOffset: number,
    length: number
  ) => T;

  for (let i = 0; i < chunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, totalLength);
    const length = end - start;

    if (length > 0) {
      // Create a view into the same buffer
      const bytesPerElement = array.BYTES_PER_ELEMENT;
      const chunk = new ArrayConstructor(
        array.buffer as ArrayBuffer,
        array.byteOffset + start * bytesPerElement,
        length
      );
      chunks.push({ chunk, start, end });
    }
  }

  return chunks;
}

/**
 * Copy TypedArray chunk for transfer
 *
 * Creates a copy of the chunk that can be transferred without affecting original.
 */
export function copyChunkForTransfer<T extends TypedArray>(
  array: T,
  start: number,
  end: number
): { chunk: T; buffer: ArrayBuffer } {
  const length = end - start;
  const bytesPerElement = array.BYTES_PER_ELEMENT;
  const byteLength = length * bytesPerElement;

  // Create new buffer and copy
  const buffer = new ArrayBuffer(byteLength);
  const ArrayConstructor = array.constructor as new (buffer: ArrayBuffer) => T;
  const chunk = new ArrayConstructor(buffer);

  // Copy data
  const sourceView = new Uint8Array(
    array.buffer as ArrayBuffer,
    array.byteOffset + start * bytesPerElement,
    byteLength
  );
  const destView = new Uint8Array(buffer);
  destView.set(sourceView);

  return { chunk, buffer };
}

/**
 * Prepare numeric array for parallel processing with auto-transfer
 */
export function prepareNumericArrayForParallel<T extends TypedArray>(
  array: T,
  chunkCount: number,
  copyForTransfer: boolean = false
): Array<{
  chunk: T;
  start: number;
  end: number;
  transfer: Transferable[];
}> {
  const chunks = createTransferableChunks(array, chunkCount);

  if (copyForTransfer) {
    // Create copies for transfer
    return chunks.map(({ start, end }) => {
      const { chunk, buffer } = copyChunkForTransfer(array, start, end);
      return {
        chunk,
        start,
        end,
        transfer: [buffer],
      };
    });
  }

  // Use views (no transfer, but zero-copy within same thread)
  return chunks.map((c) => ({
    ...c,
    transfer: [],
  }));
}

/**
 * Detect and optimize parallel operation parameters for transfer
 */
export function optimizeForTransfer<T>(
  items: T[],
  options: AutoTransferOptions = {}
): {
  items: T[];
  transferables: Transferable[];
  optimized: boolean;
} {
  // Check if items is a TypedArray
  if (items instanceof Float32Array ||
      items instanceof Float64Array ||
      items instanceof Int32Array ||
      items instanceof Int16Array ||
      items instanceof Int8Array ||
      items instanceof Uint32Array ||
      items instanceof Uint16Array ||
      items instanceof Uint8Array) {
    const buffer = items.buffer;
    const size = buffer.byteLength;

    if (size >= (options.minTransferSize ?? 1024)) {
      return {
        items,
        transferables: [buffer],
        optimized: true,
      };
    }
  }

  // For regular arrays, extract transferables from elements
  const result = autoDetectTransfer(items, options);

  return {
    items,
    transferables: result.transferables,
    optimized: result.shouldTransfer,
  };
}

/**
 * Auto-transfer class for managing transfers in parallel operations
 */
export class AutoTransfer {
  private options: Required<AutoTransferOptions>;

  constructor(options: AutoTransferOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Prepare data for sending to worker
   */
  prepare(data: unknown): TransferResult {
    return autoDetectTransfer(data, this.options);
  }

  /**
   * Prepare multiple params for sending
   */
  prepareParams(params: unknown[]): { params: unknown[]; transfer: Transferable[] } {
    return wrapForTransfer(params, this.options);
  }

  /**
   * Check if data should be transferred
   */
  shouldTransfer(data: unknown): boolean {
    return isWorthTransferring(data, this.options.minTransferSize);
  }

  /**
   * Get transferable size
   */
  getSize(data: unknown): number {
    return getTransferableSize(data);
  }

  /**
   * Extract all transferables
   */
  extract(data: unknown): Transferable[] {
    return extractTransferables(data, this.options);
  }
}

/**
 * Default auto-transfer instance
 */
export const defaultAutoTransfer = new AutoTransfer();

export default AutoTransfer;
