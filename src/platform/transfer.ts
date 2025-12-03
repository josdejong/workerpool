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
