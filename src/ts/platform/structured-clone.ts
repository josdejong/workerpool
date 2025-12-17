/**
 * Structured Clone Optimization
 *
 * Optimizes data transfer between threads by detecting transferable objects,
 * choosing zero-copy paths when possible, and falling back to JSON for complex objects.
 */

import { Transfer } from './transfer';

/**
 * Clone strategy for different data types
 */
export enum CloneStrategy {
  /** Use zero-copy transfer (for ArrayBuffer, TypedArray) */
  TRANSFER = 'transfer',
  /** Use structured clone (default postMessage behavior) */
  STRUCTURED = 'structured',
  /** Use JSON serialization (fallback for complex objects) */
  JSON = 'json',
  /** Pass through unchanged (primitives) */
  PASSTHROUGH = 'passthrough',
}

/**
 * Clone optimization result
 */
export interface CloneOptimization {
  /** The value to send */
  value: unknown;
  /** Strategy used */
  strategy: CloneStrategy;
  /** Transferable objects to transfer */
  transferables: Transferable[];
  /** Estimated size in bytes */
  estimatedSize: number;
  /** Whether the value was modified (wrapped in Transfer, etc.) */
  modified: boolean;
}

/**
 * Options for clone optimization
 */
export interface CloneOptions {
  /** Force a specific strategy */
  forceStrategy?: CloneStrategy;
  /** Threshold in bytes above which to warn about non-transfer */
  largeBufferWarningThreshold?: number;
  /** Callback when large buffer is detected but not transferred */
  onLargeBufferWarning?: (size: number, path: string) => void;
  /** Maximum depth for object traversal */
  maxDepth?: number;
}

const DEFAULT_LARGE_BUFFER_THRESHOLD = 1024 * 1024; // 1MB
const DEFAULT_MAX_DEPTH = 100;

/**
 * Analyze and optimize a value for cross-thread transfer
 *
 * @param value - Value to analyze
 * @param options - Optimization options
 * @returns Optimization result with recommended strategy
 */
export function optimizeForTransfer(value: unknown, options: CloneOptions = {}): CloneOptimization {
  const {
    forceStrategy,
    largeBufferWarningThreshold = DEFAULT_LARGE_BUFFER_THRESHOLD,
    onLargeBufferWarning,
    maxDepth = DEFAULT_MAX_DEPTH,
  } = options;

  // Handle forced strategy
  if (forceStrategy === CloneStrategy.JSON) {
    return {
      value: JSON.stringify(value),
      strategy: CloneStrategy.JSON,
      transferables: [],
      estimatedSize: estimateJsonSize(value),
      modified: true,
    };
  }

  // Already a Transfer - use as-is
  if (Transfer.isTransfer(value)) {
    return {
      value,
      strategy: CloneStrategy.TRANSFER,
      transferables: value.transfer,
      estimatedSize: estimateTransferableSize(value.transfer),
      modified: false,
    };
  }

  // Primitives - passthrough
  if (isPrimitive(value)) {
    return {
      value,
      strategy: CloneStrategy.PASSTHROUGH,
      transferables: [],
      estimatedSize: estimatePrimitiveSize(value),
      modified: false,
    };
  }

  // ArrayBuffer - transfer
  if (value instanceof ArrayBuffer) {
    if (value.byteLength >= largeBufferWarningThreshold && !forceStrategy) {
      // Large buffer - recommend transfer
    }
    return {
      value: new Transfer(value, [value]),
      strategy: CloneStrategy.TRANSFER,
      transferables: [value],
      estimatedSize: value.byteLength,
      modified: true,
    };
  }

  // TypedArray - transfer the underlying buffer
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const buffer = (value as ArrayBufferView).buffer;
    if (buffer.byteLength >= largeBufferWarningThreshold && onLargeBufferWarning) {
      onLargeBufferWarning(buffer.byteLength, getTypedArrayName(value as TypedArrayLike));
    }
    return {
      value: new Transfer(value, [buffer]),
      strategy: CloneStrategy.TRANSFER,
      transferables: [buffer],
      estimatedSize: buffer.byteLength,
      modified: true,
    };
  }

  // DataView - transfer the underlying buffer
  if (value instanceof DataView) {
    const buffer = value.buffer;
    return {
      value: new Transfer(value, [buffer]),
      strategy: CloneStrategy.TRANSFER,
      transferables: [buffer],
      estimatedSize: buffer.byteLength,
      modified: true,
    };
  }

  // Complex objects - analyze recursively
  const analysis = analyzeObject(value, '', maxDepth, largeBufferWarningThreshold, onLargeBufferWarning);

  if (analysis.transferables.length > 0) {
    // Has transferable content
    return {
      value: new Transfer(value, analysis.transferables),
      strategy: CloneStrategy.TRANSFER,
      transferables: analysis.transferables,
      estimatedSize: analysis.estimatedSize,
      modified: true,
    };
  }

  // No transferables - use structured clone or JSON
  if (analysis.needsJson) {
    return {
      value,
      strategy: CloneStrategy.JSON,
      transferables: [],
      estimatedSize: analysis.estimatedSize,
      modified: false,
    };
  }

  return {
    value,
    strategy: CloneStrategy.STRUCTURED,
    transferables: [],
    estimatedSize: analysis.estimatedSize,
    modified: false,
  };
}

/**
 * Analysis result for objects
 */
interface ObjectAnalysis {
  transferables: Transferable[];
  estimatedSize: number;
  needsJson: boolean;
}

/**
 * Recursively analyze an object for transferables
 */
function analyzeObject(
  value: unknown,
  path: string,
  maxDepth: number,
  warnThreshold: number,
  onWarn?: (size: number, path: string) => void,
  depth: number = 0,
  seen: WeakSet<object> = new WeakSet()
): ObjectAnalysis {
  if (depth > maxDepth) {
    return { transferables: [], estimatedSize: 0, needsJson: true };
  }

  if (value === null || value === undefined) {
    return { transferables: [], estimatedSize: 4, needsJson: false };
  }

  if (isPrimitive(value)) {
    return { transferables: [], estimatedSize: estimatePrimitiveSize(value), needsJson: false };
  }

  const obj = value as object;

  // Circular reference check
  if (seen.has(obj)) {
    return { transferables: [], estimatedSize: 0, needsJson: true };
  }
  seen.add(obj);

  // ArrayBuffer
  if (obj instanceof ArrayBuffer) {
    if (obj.byteLength >= warnThreshold && onWarn) {
      onWarn(obj.byteLength, path || 'ArrayBuffer');
    }
    return { transferables: [obj], estimatedSize: obj.byteLength, needsJson: false };
  }

  // TypedArray
  if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
    const buffer = (obj as ArrayBufferView).buffer;
    if (buffer.byteLength >= warnThreshold && onWarn) {
      onWarn(buffer.byteLength, path || getTypedArrayName(obj as TypedArrayLike));
    }
    return { transferables: [buffer], estimatedSize: buffer.byteLength, needsJson: false };
  }

  // Arrays
  if (Array.isArray(obj)) {
    const result: ObjectAnalysis = { transferables: [], estimatedSize: 0, needsJson: false };
    for (let i = 0; i < obj.length; i++) {
      const childResult = analyzeObject(obj[i], `${path}[${i}]`, maxDepth, warnThreshold, onWarn, depth + 1, seen);
      result.transferables.push(...childResult.transferables);
      result.estimatedSize += childResult.estimatedSize;
      result.needsJson = result.needsJson || childResult.needsJson;
    }
    return result;
  }

  // Plain objects
  if (isPlainObject(obj)) {
    const result: ObjectAnalysis = { transferables: [], estimatedSize: 0, needsJson: false };
    const keys = Object.keys(obj);
    for (const key of keys) {
      const childResult = analyzeObject(
        (obj as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        maxDepth,
        warnThreshold,
        onWarn,
        depth + 1,
        seen
      );
      result.transferables.push(...childResult.transferables);
      result.estimatedSize += childResult.estimatedSize + key.length * 2;
      result.needsJson = result.needsJson || childResult.needsJson;
    }
    return result;
  }

  // Non-plain objects (classes, etc.) - may need JSON
  return { transferables: [], estimatedSize: 100, needsJson: true };
}

/**
 * Check if value is a primitive
 */
function isPrimitive(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const type = typeof value;
  return type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint';
}

/**
 * Check if value is a plain object
 */
function isPlainObject(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Estimate JSON serialization size
 */
function estimateJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length * 2; // UTF-16
  } catch {
    return 0;
  }
}

/**
 * Estimate primitive size in bytes
 */
function estimatePrimitiveSize(value: unknown): number {
  if (value === null || value === undefined) return 4;
  if (typeof value === 'boolean') return 4;
  if (typeof value === 'number') return 8;
  if (typeof value === 'bigint') return 8;
  if (typeof value === 'string') return (value as string).length * 2;
  return 8;
}

/**
 * Estimate total size of transferables
 */
function estimateTransferableSize(transferables: Transferable[]): number {
  let size = 0;
  for (const t of transferables) {
    if (t instanceof ArrayBuffer) {
      size += t.byteLength;
    } else if (ArrayBuffer.isView(t)) {
      size += (t as ArrayBufferView).byteLength;
    } else {
      size += 100; // Estimate for other transferable types
    }
  }
  return size;
}

/**
 * Get name of typed array type
 */
function getTypedArrayName(array: TypedArrayLike): string {
  return array.constructor.name;
}

/**
 * TypedArray-like interface
 */
interface TypedArrayLike extends ArrayBufferView {
  constructor: { name: string };
}

/**
 * Detect whether a value can benefit from transfer optimization
 *
 * @param value - Value to check
 * @returns True if value contains transferables
 */
export function hasTransferableContent(value: unknown): boolean {
  if (value === null || value === undefined || isPrimitive(value)) {
    return false;
  }

  if (value instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(value)) return true;
  if (Transfer.isTransfer(value)) return value.transfer.length > 0;

  if (typeof value === 'object') {
    const seen = new WeakSet<object>();
    return containsTransferables(value, seen);
  }

  return false;
}

/**
 * Recursively check for transferables
 */
function containsTransferables(obj: unknown, seen: WeakSet<object>): boolean {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return false;
  }

  if (seen.has(obj as object)) return false;
  seen.add(obj as object);

  if (obj instanceof ArrayBuffer) return true;
  if (ArrayBuffer.isView(obj)) return true;

  if (Array.isArray(obj)) {
    return obj.some((item) => containsTransferables(item, seen));
  }

  if (isPlainObject(obj)) {
    return Object.values(obj as Record<string, unknown>).some((v) => containsTransferables(v, seen));
  }

  return false;
}

/**
 * Create an optimized Transfer for a value
 * Automatically detects and extracts transferables
 *
 * @param value - Value to optimize
 * @returns Transfer wrapper with auto-detected transferables
 */
export function createOptimizedTransfer<T>(value: T): Transfer<T> {
  const transferables = Transfer.findTransferables(value);
  return new Transfer(value, transferables);
}

export default {
  optimizeForTransfer,
  hasTransferableContent,
  createOptimizedTransfer,
  CloneStrategy,
};
