/**
 * Transfer - Helper class for transferring data with zero-copy semantics
 *
 * When passing large ArrayBuffers or other Transferable objects to workers,
 * use Transfer to indicate they should be transferred rather than cloned.
 *
 * @example
 * const buffer = new ArrayBuffer(1024 * 1024);
 * pool.exec(processData, [new Transfer(buffer, [buffer])]);
 *
 * @template T - Type of the message being transferred
 */

import type { TransferDescriptor } from '../types';

/**
 * Transferable object types supported by structured clone with transfer
 */
export type TransferableObject =
  | ArrayBuffer
  | MessagePort
  | ImageBitmap
  | OffscreenCanvas
  | ReadableStream
  | WritableStream
  | TransformStream;

/**
 * Transfer wrapper for zero-copy data transfer to workers
 *
 * @template T - Type of the message being transferred
 */
export class Transfer<T = unknown> implements TransferDescriptor<T> {
  /** The message/data to send to the worker */
  readonly message: T;

  /** Array of transferable objects to transfer ownership of */
  readonly transfer: Transferable[];

  /**
   * Create a new Transfer wrapper
   *
   * @param message - The object to deliver to the worker
   * @param transfer - Array of Transferable objects to transfer ownership of
   *
   * @example
   * // Transfer an ArrayBuffer
   * const buffer = new ArrayBuffer(1024);
   * const transfer = new Transfer({ data: buffer }, [buffer]);
   *
   * @example
   * // Transfer multiple buffers
   * const buf1 = new ArrayBuffer(512);
   * const buf2 = new ArrayBuffer(512);
   * const transfer = new Transfer({ a: buf1, b: buf2 }, [buf1, buf2]);
   */
  constructor(message: T, transfer: Transferable[]) {
    this.message = message;
    this.transfer = transfer;
  }

  /**
   * Check if an object is a Transfer instance
   */
  static isTransfer(obj: unknown): obj is Transfer {
    return obj instanceof Transfer;
  }

  /**
   * Check if an object is transferable
   */
  static isTransferable(obj: unknown): obj is Transferable {
    return (
      obj instanceof ArrayBuffer ||
      (typeof MessagePort !== 'undefined' && obj instanceof MessagePort) ||
      (typeof ImageBitmap !== 'undefined' && obj instanceof ImageBitmap) ||
      (typeof OffscreenCanvas !== 'undefined' && obj instanceof OffscreenCanvas) ||
      (typeof ReadableStream !== 'undefined' && obj instanceof ReadableStream) ||
      (typeof WritableStream !== 'undefined' && obj instanceof WritableStream) ||
      (typeof TransformStream !== 'undefined' && obj instanceof TransformStream)
    );
  }

  /**
   * Extract transferable objects from a value recursively
   * Useful for auto-detecting transferables in complex objects
   *
   * @param value - Value to scan for transferables
   * @param found - Set to collect found transferables (used internally)
   * @returns Array of found transferable objects
   */
  static findTransferables(
    value: unknown,
    found: Set<Transferable> = new Set()
  ): Transferable[] {
    if (value === null || value === undefined) {
      return Array.from(found);
    }

    // Check for TypedArray or DataView first (before generic Transferable check)
    if (ArrayBuffer.isView(value)) {
      // TypedArray or DataView - add the underlying buffer
      found.add((value as ArrayBufferView).buffer);
      return Array.from(found);
    }

    if (Transfer.isTransferable(value)) {
      found.add(value);
      return Array.from(found);
    }

    // Check for array - use explicit type casting to avoid narrowing issues
    const maybeArray = value as unknown[];
    if (Array.isArray(value)) {
      for (let i = 0; i < maybeArray.length; i++) {
        Transfer.findTransferables(maybeArray[i], found);
      }
      return Array.from(found);
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj);
      for (let i = 0; i < keys.length; i++) {
        Transfer.findTransferables(obj[keys[i]], found);
      }
    }

    return Array.from(found);
  }
}

/**
 * Default export for backward compatibility
 */
export default Transfer;

// ============================================================================
// Typed Array Transfer Helpers
// These provide convenient zero-copy transfer for TypedArrays
// ============================================================================

/**
 * TypedArray constructor types
 */
export type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor;

/**
 * TypedArray instance types
 */
export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array;

/**
 * Create a Transfer for a Float64Array (common for numeric data)
 *
 * @example
 * ```typescript
 * const data = new Float64Array([1.5, 2.5, 3.5]);
 * const result = await pool.exec(processData, [transferFloat64(data)]);
 * // Note: 'data' is now detached and cannot be used
 * ```
 *
 * @param array - Float64Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferFloat64(array: Float64Array): Transfer<Float64Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for a Float32Array
 *
 * @param array - Float32Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferFloat32(array: Float32Array): Transfer<Float32Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for an Int32Array
 *
 * @param array - Int32Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferInt32(array: Int32Array): Transfer<Int32Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for a Uint32Array
 *
 * @param array - Uint32Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferUint32(array: Uint32Array): Transfer<Uint32Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for an Int16Array
 *
 * @param array - Int16Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferInt16(array: Int16Array): Transfer<Int16Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for a Uint16Array
 *
 * @param array - Uint16Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferUint16(array: Uint16Array): Transfer<Uint16Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for an Int8Array
 *
 * @param array - Int8Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferInt8(array: Int8Array): Transfer<Int8Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for a Uint8Array
 *
 * @param array - Uint8Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferUint8(array: Uint8Array): Transfer<Uint8Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for a Uint8ClampedArray (used for image data)
 *
 * @param array - Uint8ClampedArray to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferUint8Clamped(array: Uint8ClampedArray): Transfer<Uint8ClampedArray> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for a BigInt64Array
 *
 * @param array - BigInt64Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferBigInt64(array: BigInt64Array): Transfer<BigInt64Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for a BigUint64Array
 *
 * @param array - BigUint64Array to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferBigUint64(array: BigUint64Array): Transfer<BigUint64Array> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for any TypedArray
 *
 * Generic version that works with any TypedArray type.
 *
 * @example
 * ```typescript
 * const int16Data = new Int16Array(1000);
 * const transfer = transferTypedArray(int16Data);
 * ```
 *
 * @param array - Any TypedArray to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferTypedArray<T extends TypedArray>(array: T): Transfer<T> {
  return new Transfer(array, [array.buffer]);
}

/**
 * Create a Transfer for an ArrayBuffer
 *
 * @param buffer - ArrayBuffer to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferArrayBuffer(buffer: ArrayBuffer): Transfer<ArrayBuffer> {
  return new Transfer(buffer, [buffer]);
}

/**
 * Create a Transfer for multiple ArrayBuffers
 *
 * @example
 * ```typescript
 * const buf1 = new ArrayBuffer(1024);
 * const buf2 = new ArrayBuffer(2048);
 * const transfer = transferArrayBuffers([buf1, buf2]);
 * ```
 *
 * @param buffers - Array of ArrayBuffers to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferArrayBuffers(buffers: ArrayBuffer[]): Transfer<ArrayBuffer[]> {
  return new Transfer(buffers, buffers);
}

/**
 * Create a Transfer for an object containing TypedArrays
 *
 * Automatically finds all ArrayBuffers in the object and marks them for transfer.
 *
 * @example
 * ```typescript
 * const data = {
 *   positions: new Float32Array([0, 0, 0, 1, 1, 1]),
 *   indices: new Uint16Array([0, 1, 2]),
 *   metadata: { name: 'mesh' }
 * };
 * const transfer = transferObject(data);
 * ```
 *
 * @param obj - Object containing transferable data
 * @returns Transfer object with auto-detected transferables
 */
export function transferObject<T>(obj: T): Transfer<T> {
  const transferables = Transfer.findTransferables(obj);
  return new Transfer(obj, transferables);
}

/**
 * Create a Transfer for an ImageData object (canvas pixel data)
 *
 * @param imageData - ImageData to transfer
 * @returns Transfer object ready for worker communication
 */
export function transferImageData(imageData: ImageData): Transfer<ImageData> {
  return new Transfer(imageData, [imageData.data.buffer]);
}
