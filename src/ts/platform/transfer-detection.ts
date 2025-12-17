/**
 * Transfer Detection
 *
 * Utilities for detecting and optimizing transferable objects.
 * Automatically builds transfer lists and warns about missed optimization opportunities.
 */

/**
 * Transferable object types
 */
export type TransferableType =
  | 'ArrayBuffer'
  | 'MessagePort'
  | 'ImageBitmap'
  | 'OffscreenCanvas'
  | 'ReadableStream'
  | 'WritableStream'
  | 'TransformStream'
  | 'VideoFrame'
  | 'AudioData'
  | 'RTCDataChannel';

/**
 * Detection result for a single transferable
 */
export interface DetectedTransferable {
  /** The transferable object */
  object: Transferable;
  /** Type of transferable */
  type: TransferableType;
  /** Size in bytes (if applicable) */
  size: number;
  /** Path in the object tree (e.g., "data.buffer") */
  path: string;
}

/**
 * Result of transferable detection
 */
export interface DetectionResult {
  /** Array of detected transferables */
  transferables: DetectedTransferable[];
  /** Total size of all transferables */
  totalSize: number;
  /** Whether any large buffers were found */
  hasLargeBuffers: boolean;
  /** Warnings about potential optimization issues */
  warnings: string[];
}

/**
 * Configuration for transfer detection
 */
export interface DetectionConfig {
  /** Size threshold for "large" buffers (default: 1MB) */
  largeBufferThreshold?: number;
  /** Maximum depth to traverse (default: 50) */
  maxDepth?: number;
  /** Whether to include warnings (default: true) */
  includeWarnings?: boolean;
  /** Custom transferable type checker */
  customTypeChecker?: (value: unknown) => TransferableType | null;
}

const DEFAULT_LARGE_BUFFER_THRESHOLD = 1024 * 1024; // 1MB
const DEFAULT_MAX_DEPTH = 50;

/**
 * Check if a value is transferable
 *
 * @param value - Value to check
 * @returns True if value is transferable
 */
export function isTransferable(value: unknown): value is Transferable {
  if (value === null || value === undefined) return false;

  return (
    value instanceof ArrayBuffer ||
    (typeof MessagePort !== 'undefined' && value instanceof MessagePort) ||
    (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) ||
    (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) ||
    (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) ||
    (typeof WritableStream !== 'undefined' && value instanceof WritableStream) ||
    (typeof TransformStream !== 'undefined' && value instanceof TransformStream) ||
    (typeof VideoFrame !== 'undefined' && value instanceof (VideoFrame as unknown as new () => object)) ||
    (typeof AudioData !== 'undefined' && value instanceof (AudioData as unknown as new () => object)) ||
    (typeof RTCDataChannel !== 'undefined' && value instanceof RTCDataChannel)
  );
}

/**
 * Get the type of a transferable
 *
 * @param value - Transferable to check
 * @returns Type name or null if not transferable
 */
export function getTransferableType(value: unknown): TransferableType | null {
  if (value === null || value === undefined) return null;

  if (value instanceof ArrayBuffer) return 'ArrayBuffer';
  if (typeof MessagePort !== 'undefined' && value instanceof MessagePort) return 'MessagePort';
  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) return 'ImageBitmap';
  if (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) return 'OffscreenCanvas';
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return 'ReadableStream';
  if (typeof WritableStream !== 'undefined' && value instanceof WritableStream) return 'WritableStream';
  if (typeof TransformStream !== 'undefined' && value instanceof TransformStream) return 'TransformStream';
  if (typeof VideoFrame !== 'undefined' && value instanceof (VideoFrame as unknown as new () => object)) return 'VideoFrame';
  if (typeof AudioData !== 'undefined' && value instanceof (AudioData as unknown as new () => object)) return 'AudioData';
  if (typeof RTCDataChannel !== 'undefined' && value instanceof RTCDataChannel) return 'RTCDataChannel';

  return null;
}

/**
 * Get size of a transferable in bytes
 *
 * @param value - Transferable to measure
 * @returns Size in bytes, or 0 if unknown
 */
export function getTransferableSize(value: Transferable): number {
  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }

  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) {
    // Estimate based on dimensions (4 bytes per pixel for RGBA)
    return value.width * value.height * 4;
  }

  if (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) {
    return value.width * value.height * 4;
  }

  // Unknown size for other types
  return 0;
}

/**
 * Detect all transferable objects in a value
 *
 * @param value - Value to scan
 * @param config - Detection configuration
 * @returns Detection result with all found transferables
 */
export function detectTransferables(value: unknown, config: DetectionConfig = {}): DetectionResult {
  const {
    largeBufferThreshold = DEFAULT_LARGE_BUFFER_THRESHOLD,
    maxDepth = DEFAULT_MAX_DEPTH,
    includeWarnings = true,
    customTypeChecker,
  } = config;

  const result: DetectionResult = {
    transferables: [],
    totalSize: 0,
    hasLargeBuffers: false,
    warnings: [],
  };

  const seen = new WeakSet<object>();
  const seenTransferables = new WeakSet<object>();

  function scan(value: unknown, path: string, depth: number): void {
    if (depth > maxDepth) {
      if (includeWarnings) {
        result.warnings.push(`Max depth exceeded at ${path}`);
      }
      return;
    }

    if (value === null || value === undefined) return;

    // Check custom type checker first
    if (customTypeChecker) {
      const customType = customTypeChecker(value);
      if (customType && !seenTransferables.has(value as object)) {
        seenTransferables.add(value as object);
        const size = getTransferableSize(value as Transferable);
        result.transferables.push({
          object: value as Transferable,
          type: customType,
          size,
          path,
        });
        result.totalSize += size;
        return;
      }
    }

    // Check if transferable
    if (isTransferable(value)) {
      if (!seenTransferables.has(value as object)) {
        seenTransferables.add(value as object);
        const type = getTransferableType(value)!;
        const size = getTransferableSize(value);
        result.transferables.push({
          object: value,
          type,
          size,
          path,
        });
        result.totalSize += size;

        if (size >= largeBufferThreshold) {
          result.hasLargeBuffers = true;
        }
      }
      return;
    }

    // Check ArrayBufferView (TypedArray or DataView) - extract underlying buffer
    if (ArrayBuffer.isView(value)) {
      const view = value as ArrayBufferView;
      const buffer = view.buffer;
      if (!seenTransferables.has(buffer)) {
        seenTransferables.add(buffer);
        result.transferables.push({
          object: buffer,
          type: 'ArrayBuffer',
          size: buffer.byteLength,
          path: `${path}.buffer`,
        });
        result.totalSize += buffer.byteLength;

        if (buffer.byteLength >= largeBufferThreshold) {
          result.hasLargeBuffers = true;
        }
      }
      return;
    }

    // Skip primitives - need to recheck value to avoid type narrowing issues
    if (typeof value !== 'object') return;

    // At this point we know value is an object (not null due to earlier check)
    const obj = value as object;

    // Circular reference check
    if (seen.has(obj)) return;
    seen.add(obj);

    // Arrays
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        scan(obj[i], `${path}[${i}]`, depth + 1);
      }
      return;
    }

    // Plain objects
    const record = obj as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      scan(record[key], path ? `${path}.${key}` : key, depth + 1);
    }
  }

  scan(value, '', 0);

  // Add warnings for large buffers not being transferred
  if (includeWarnings && result.hasLargeBuffers) {
    for (const t of result.transferables) {
      if (t.size >= largeBufferThreshold) {
        result.warnings.push(
          `Large buffer (${formatBytes(t.size)}) at "${t.path}" should be transferred to avoid copying`
        );
      }
    }
  }

  return result;
}

/**
 * Create a transfer list from detected transferables
 *
 * @param detected - Detection result
 * @returns Array of transferable objects
 */
export function createTransferList(detected: DetectionResult): Transferable[] {
  return detected.transferables.map((d) => d.object);
}

/**
 * Quick check for any transferable content
 *
 * @param value - Value to check
 * @returns True if value contains any transferables
 */
export function hasTransferables(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (isTransferable(value)) return true;
  if (ArrayBuffer.isView(value)) return true;

  if (typeof value !== 'object') return false;

  const seen = new WeakSet<object>();

  function check(val: unknown): boolean {
    if (val === null || val === undefined || typeof val !== 'object') return false;

    const obj = val as object;
    if (seen.has(obj)) return false;
    seen.add(obj);

    if (isTransferable(val)) return true;
    if (ArrayBuffer.isView(val)) return true;

    if (Array.isArray(obj)) {
      return obj.some(check);
    }

    return Object.values(obj as Record<string, unknown>).some(check);
  }

  return check(value);
}

/**
 * Validate that transferables can be safely transferred
 *
 * @param transferables - Array of transferables to validate
 * @returns Validation result
 */
export function validateTransferables(transferables: Transferable[]): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
  };

  const seen = new Set<Transferable>();

  for (const t of transferables) {
    // Check for duplicates
    if (seen.has(t)) {
      result.valid = false;
      result.errors.push('Duplicate transferable in list');
      continue;
    }
    seen.add(t);

    // Check for detached ArrayBuffer
    if (t instanceof ArrayBuffer) {
      try {
        // Try to access byteLength - will throw if detached
        if (t.byteLength === 0) {
          result.warnings.push('Empty ArrayBuffer in transfer list');
        }
      } catch {
        result.valid = false;
        result.errors.push('Detached ArrayBuffer in transfer list');
      }
    }

    // Warn about MessagePort without receiver
    if (typeof MessagePort !== 'undefined' && t instanceof MessagePort) {
      result.warnings.push('MessagePort transfer - ensure receiver is ready');
    }
  }

  return result;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether all transferables are valid */
  valid: boolean;
  /** Error messages */
  errors: string[];
  /** Warning messages */
  warnings: string[];
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Transfer optimization hint
 */
export interface TransferHint {
  /** Whether transfer is recommended */
  shouldTransfer: boolean;
  /** Reason for recommendation */
  reason: string;
  /** Estimated performance impact */
  impact: 'high' | 'medium' | 'low' | 'none';
}

/**
 * Get transfer optimization hint for a value
 *
 * @param value - Value to analyze
 * @returns Optimization hint
 */
export function getTransferHint(value: unknown): TransferHint {
  const detected = detectTransferables(value, { includeWarnings: false });

  if (detected.transferables.length === 0) {
    return {
      shouldTransfer: false,
      reason: 'No transferable content detected',
      impact: 'none',
    };
  }

  if (detected.hasLargeBuffers) {
    return {
      shouldTransfer: true,
      reason: `Contains ${formatBytes(detected.totalSize)} of transferable data`,
      impact: 'high',
    };
  }

  if (detected.totalSize > 10 * 1024) {
    // > 10KB
    return {
      shouldTransfer: true,
      reason: `Contains ${formatBytes(detected.totalSize)} of transferable data`,
      impact: 'medium',
    };
  }

  return {
    shouldTransfer: true,
    reason: 'Contains small transferable data',
    impact: 'low',
  };
}

export default {
  isTransferable,
  getTransferableType,
  getTransferableSize,
  detectTransferables,
  createTransferList,
  hasTransferables,
  validateTransferables,
  getTransferHint,
};
