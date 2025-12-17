/**
 * SharedMemoryChannel - Lock-free bi-directional communication using SharedArrayBuffer
 *
 * Provides high-performance zero-copy message passing between main thread and workers
 * using SharedArrayBuffer and Atomics operations.
 *
 * See docs/planning/SHARED_MEMORY_PROTOCOL.md for protocol specification.
 */

import { hasSharedArrayBuffer, hasAtomics } from './environment';

// Protocol constants
const PROTOCOL_VERSION = 1;
const HEADER_SIZE = 64;
const DEFAULT_SLOT_SIZE = 1024 * 64; // 64KB per slot
const DEFAULT_SLOT_COUNT = 16;

// Header offsets (in 4-byte units for Int32Array indexing)
const HEADER_VERSION = 0;
const HEADER_FLAGS = 1;
const HEADER_SEND_INDEX = 2;
const HEADER_RECV_INDEX = 3;
const HEADER_SLOT_SIZE = 4;
const HEADER_SLOT_COUNT = 5;

// Flag bits
const FLAG_INITIALIZED = 1 << 0;
const FLAG_CLOSED = 1 << 1;
const FLAG_ERROR = 1 << 2;
const FLAG_OVERFLOW = 1 << 3;

// Slot status values
const SLOT_EMPTY = 0;
const SLOT_WRITING = 1;
const SLOT_READY = 2;
const SLOT_READING = 3;

// Message types
const MSG_TYPE_JSON = 0x00;
const MSG_TYPE_BINARY = 0x01;
const MSG_TYPE_TYPED = 0x02;
const MSG_TYPE_MIXED = 0x03;
const MSG_TYPE_CHUNK_START = 0x10;
const MSG_TYPE_CHUNK_DATA = 0x11;
const MSG_TYPE_CHUNK_END = 0x12;

/**
 * Configuration options for SharedMemoryChannel
 */
export interface SharedMemoryChannelOptions {
  /** Size of each message slot in bytes (default: 64KB) */
  slotSize?: number;
  /** Number of message slots (default: 16) */
  slotCount?: number;
  /** Existing SharedArrayBuffer to use (for worker side) */
  buffer?: SharedArrayBuffer;
}

/**
 * Result of a send operation
 */
export interface SendResult {
  success: boolean;
  reason?: 'MESSAGE_TOO_LARGE' | 'BUFFER_FULL' | 'SLOT_CONTENTION' | 'CHANNEL_CLOSED' | 'SERIALIZATION_ERROR';
}

/**
 * Internal chunk header for large messages
 */
interface ChunkHeader {
  messageId: number;
  chunkIndex: number;
  totalChunks: number;
  totalSize: number;
}

/**
 * Reassembly buffer for chunked messages
 */
interface ChunkBuffer {
  chunks: Uint8Array[];
  received: number;
  totalChunks: number;
  totalSize: number;
}

/**
 * Lock-free bi-directional channel using SharedArrayBuffer
 */
export class SharedMemoryChannel {
  private buffer: SharedArrayBuffer;
  private header: Int32Array;
  private slots: Int32Array;
  private rawView: Uint8Array;
  private dataView: DataView;
  private readonly slotSize: number;
  private readonly slotCount: number;
  private readonly maxPayloadSize: number;
  private nextMessageId: number = 0;
  private chunkBuffers: Map<number, ChunkBuffer> = new Map();

  /**
   * Check if SharedMemoryChannel is supported in the current environment
   */
  static isSupported(): boolean {
    return hasSharedArrayBuffer && hasAtomics;
  }

  /**
   * Create a new SharedMemoryChannel
   *
   * @param options - Channel configuration
   */
  constructor(options: SharedMemoryChannelOptions = {}) {
    if (!SharedMemoryChannel.isSupported()) {
      throw new Error('SharedArrayBuffer and Atomics are required for SharedMemoryChannel');
    }

    this.slotSize = options.slotSize ?? DEFAULT_SLOT_SIZE;
    this.slotCount = options.slotCount ?? DEFAULT_SLOT_COUNT;
    this.maxPayloadSize = this.slotSize - 8; // Status (4) + Length (4)

    if (options.buffer) {
      // Use existing buffer (worker side)
      this.buffer = options.buffer;
      this.validateBuffer();
    } else {
      // Create new buffer (main thread side)
      const totalSize = HEADER_SIZE + this.slotSize * this.slotCount;
      this.buffer = new SharedArrayBuffer(totalSize);
      this.initializeBuffer();
    }

    this.header = new Int32Array(this.buffer, 0, HEADER_SIZE / 4);
    this.slots = new Int32Array(this.buffer);
    this.rawView = new Uint8Array(this.buffer);
    this.dataView = new DataView(this.buffer);
  }

  /**
   * Initialize a new buffer with header
   */
  private initializeBuffer(): void {
    const header = new Int32Array(this.buffer, 0, HEADER_SIZE / 4);

    Atomics.store(header, HEADER_VERSION, PROTOCOL_VERSION);
    Atomics.store(header, HEADER_FLAGS, FLAG_INITIALIZED);
    Atomics.store(header, HEADER_SEND_INDEX, 0);
    Atomics.store(header, HEADER_RECV_INDEX, 0);
    Atomics.store(header, HEADER_SLOT_SIZE, this.slotSize);
    Atomics.store(header, HEADER_SLOT_COUNT, this.slotCount);

    // Initialize all slots to EMPTY
    for (let i = 0; i < this.slotCount; i++) {
      const slotOffset = (HEADER_SIZE + i * this.slotSize) / 4;
      Atomics.store(this.slots, slotOffset, SLOT_EMPTY);
    }
  }

  /**
   * Validate an existing buffer
   */
  private validateBuffer(): void {
    const header = new Int32Array(this.buffer, 0, HEADER_SIZE / 4);
    const version = Atomics.load(header, HEADER_VERSION);
    const flags = Atomics.load(header, HEADER_FLAGS);

    if (version !== PROTOCOL_VERSION) {
      throw new Error(`Protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${version}`);
    }

    if (!(flags & FLAG_INITIALIZED)) {
      throw new Error('Buffer not initialized');
    }

    // Read slot configuration from buffer
    const bufferSlotSize = Atomics.load(header, HEADER_SLOT_SIZE);
    const bufferSlotCount = Atomics.load(header, HEADER_SLOT_COUNT);

    if (bufferSlotSize !== this.slotSize || bufferSlotCount !== this.slotCount) {
      // Update to match buffer - use Object.assign to bypass readonly
      Object.assign(this, {
        slotSize: bufferSlotSize,
        slotCount: bufferSlotCount,
        maxPayloadSize: bufferSlotSize - 8,
      });
    }
  }

  /**
   * Get the underlying SharedArrayBuffer for sharing with workers
   */
  getBuffer(): SharedArrayBuffer {
    return this.buffer;
  }

  /**
   * Check if the channel is closed
   */
  isClosed(): boolean {
    const flags = Atomics.load(this.header, HEADER_FLAGS);
    return (flags & FLAG_CLOSED) !== 0;
  }

  /**
   * Send a message (non-blocking)
   *
   * @param message - Message to send (any serializable value)
   * @returns Result indicating success or failure reason
   */
  send(message: unknown): SendResult {
    if (this.isClosed()) {
      return { success: false, reason: 'CHANNEL_CLOSED' };
    }

    // Serialize message
    let bytes: Uint8Array;
    let msgType: number;

    try {
      const result = this.serializeMessage(message);
      bytes = result.bytes;
      msgType = result.type;
    } catch {
      return { success: false, reason: 'SERIALIZATION_ERROR' };
    }

    // Check if message fits in single slot
    if (bytes.length <= this.maxPayloadSize - 1) {
      return this.sendSingleSlot(msgType, bytes);
    }

    // Large message - use chunking
    return this.sendChunked(bytes);
  }

  /**
   * Send a message that fits in a single slot
   */
  private sendSingleSlot(msgType: number, bytes: Uint8Array): SendResult {
    // Reserve slot atomically
    const slotIndex = Atomics.add(this.header, HEADER_SEND_INDEX, 1) % this.slotCount;
    const slotOffset = HEADER_SIZE + slotIndex * this.slotSize;
    const slotOffsetInt32 = slotOffset / 4;

    // Check slot status
    const status = Atomics.load(this.slots, slotOffsetInt32);
    if (status !== SLOT_EMPTY) {
      Atomics.sub(this.header, HEADER_SEND_INDEX, 1);
      return { success: false, reason: 'BUFFER_FULL' };
    }

    // CAS to WRITING status
    if (Atomics.compareExchange(this.slots, slotOffsetInt32, SLOT_EMPTY, SLOT_WRITING) !== SLOT_EMPTY) {
      return { success: false, reason: 'SLOT_CONTENTION' };
    }

    // Write type, length, and payload
    this.rawView[slotOffset + 4] = msgType;
    this.dataView.setUint32(slotOffset + 5, bytes.length, true);
    this.rawView.set(bytes, slotOffset + 9);

    // Mark as READY
    Atomics.store(this.slots, slotOffsetInt32, SLOT_READY);

    // Wake waiting receiver
    Atomics.notify(this.slots, slotOffsetInt32);

    return { success: true };
  }

  /**
   * Send a large message in chunks
   */
  private sendChunked(bytes: Uint8Array): SendResult {
    const messageId = this.nextMessageId++;
    const chunkPayloadSize = this.maxPayloadSize - 20; // Header: type(1) + msgId(4) + idx(4) + total(4) + totalSize(4) + len(3)
    const totalChunks = Math.ceil(bytes.length / chunkPayloadSize);

    // Send chunk start marker
    const startHeader: ChunkHeader = {
      messageId,
      chunkIndex: 0,
      totalChunks,
      totalSize: bytes.length,
    };

    let result = this.sendChunkHeader(MSG_TYPE_CHUNK_START, startHeader);
    if (!result.success) return result;

    // Send data chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkPayloadSize;
      const end = Math.min(start + chunkPayloadSize, bytes.length);
      const chunk = bytes.slice(start, end);

      result = this.sendChunkData(messageId, i, chunk);
      if (!result.success) return result;
    }

    // Send chunk end marker
    const endHeader: ChunkHeader = {
      messageId,
      chunkIndex: totalChunks,
      totalChunks,
      totalSize: bytes.length,
    };

    return this.sendChunkHeader(MSG_TYPE_CHUNK_END, endHeader);
  }

  /**
   * Send a chunk header message
   */
  private sendChunkHeader(type: number, header: ChunkHeader): SendResult {
    const bytes = new Uint8Array(16);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, header.messageId, true);
    view.setUint32(4, header.chunkIndex, true);
    view.setUint32(8, header.totalChunks, true);
    view.setUint32(12, header.totalSize, true);

    return this.sendSingleSlot(type, bytes);
  }

  /**
   * Send a chunk data message
   */
  private sendChunkData(messageId: number, chunkIndex: number, data: Uint8Array): SendResult {
    const bytes = new Uint8Array(8 + data.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, messageId, true);
    view.setUint32(4, chunkIndex, true);
    bytes.set(data, 8);

    return this.sendSingleSlot(MSG_TYPE_CHUNK_DATA, bytes);
  }

  /**
   * Receive a message (non-blocking)
   *
   * @returns The received message, or null if no message available
   */
  receive(): unknown | null {
    const slotIndex = Atomics.load(this.header, HEADER_RECV_INDEX) % this.slotCount;
    const slotOffset = HEADER_SIZE + slotIndex * this.slotSize;
    const slotOffsetInt32 = slotOffset / 4;

    // Check slot status
    const status = Atomics.load(this.slots, slotOffsetInt32);
    if (status !== SLOT_READY) {
      return null;
    }

    // CAS to READING status
    if (Atomics.compareExchange(this.slots, slotOffsetInt32, SLOT_READY, SLOT_READING) !== SLOT_READY) {
      return null; // Lost race
    }

    // Read type and length
    const msgType = this.rawView[slotOffset + 4];
    const length = this.dataView.getUint32(slotOffset + 5, true);

    // Read payload
    const payload = this.rawView.slice(slotOffset + 9, slotOffset + 9 + length);

    // Mark as EMPTY and increment recv index
    Atomics.store(this.slots, slotOffsetInt32, SLOT_EMPTY);
    Atomics.add(this.header, HEADER_RECV_INDEX, 1);

    // Handle message type
    return this.handleReceivedMessage(msgType, payload);
  }

  /**
   * Handle a received message based on type
   */
  private handleReceivedMessage(msgType: number, payload: Uint8Array): unknown | null {
    switch (msgType) {
      case MSG_TYPE_JSON:
        return JSON.parse(new TextDecoder().decode(payload));

      case MSG_TYPE_BINARY:
        return payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength);

      case MSG_TYPE_TYPED:
        return this.deserializeTypedArray(payload);

      case MSG_TYPE_MIXED:
        return this.deserializeMixed(payload);

      case MSG_TYPE_CHUNK_START:
        return this.handleChunkStart(payload);

      case MSG_TYPE_CHUNK_DATA:
        return this.handleChunkData(payload);

      case MSG_TYPE_CHUNK_END:
        return this.handleChunkEnd(payload);

      default:
        console.warn(`Unknown message type: ${msgType}`);
        return null;
    }
  }

  /**
   * Handle chunk start message
   */
  private handleChunkStart(payload: Uint8Array): null {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const messageId = view.getUint32(0, true);
    const totalChunks = view.getUint32(8, true);
    const totalSize = view.getUint32(12, true);

    this.chunkBuffers.set(messageId, {
      chunks: new Array(totalChunks),
      received: 0,
      totalChunks,
      totalSize,
    });

    return null; // Not a complete message yet
  }

  /**
   * Handle chunk data message
   */
  private handleChunkData(payload: Uint8Array): null {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const messageId = view.getUint32(0, true);
    const chunkIndex = view.getUint32(4, true);
    const data = payload.slice(8);

    const buffer = this.chunkBuffers.get(messageId);
    if (buffer) {
      buffer.chunks[chunkIndex] = data;
      buffer.received++;
    }

    return null; // Not a complete message yet
  }

  /**
   * Handle chunk end message - reassemble and return complete message
   */
  private handleChunkEnd(payload: Uint8Array): unknown | null {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    const messageId = view.getUint32(0, true);

    const buffer = this.chunkBuffers.get(messageId);
    if (!buffer || buffer.received !== buffer.totalChunks) {
      console.warn(`Incomplete chunked message ${messageId}`);
      this.chunkBuffers.delete(messageId);
      return null;
    }

    // Reassemble chunks
    const assembled = new Uint8Array(buffer.totalSize);
    let offset = 0;
    for (const chunk of buffer.chunks) {
      assembled.set(chunk, offset);
      offset += chunk.length;
    }

    this.chunkBuffers.delete(messageId);

    // Deserialize as JSON (chunked messages are always JSON)
    return JSON.parse(new TextDecoder().decode(assembled));
  }

  /**
   * Receive a message (blocking with timeout)
   *
   * @param timeout - Maximum time to wait in milliseconds (default: Infinity)
   * @returns The received message, or null if timeout
   */
  receiveBlocking(timeout: number = Infinity): unknown | null {
    const slotIndex = Atomics.load(this.header, HEADER_RECV_INDEX) % this.slotCount;
    const slotOffset = HEADER_SIZE + slotIndex * this.slotSize;
    const slotOffsetInt32 = slotOffset / 4;

    // Check current status
    let status = Atomics.load(this.slots, slotOffsetInt32);
    if (status !== SLOT_READY) {
      // Wait for READY status
      const result = Atomics.wait(this.slots, slotOffsetInt32, status, timeout);
      if (result === 'timed-out') {
        return null;
      }
    }

    // Proceed with normal receive
    return this.receive();
  }

  /**
   * Close the channel
   */
  close(): void {
    const flags = Atomics.load(this.header, HEADER_FLAGS);
    Atomics.store(this.header, HEADER_FLAGS, flags | FLAG_CLOSED);

    // Wake all waiting receivers
    for (let i = 0; i < this.slotCount; i++) {
      const slotOffset = (HEADER_SIZE + i * this.slotSize) / 4;
      Atomics.notify(this.slots, slotOffset, Infinity);
    }
  }

  /**
   * Serialize a message to bytes
   */
  private serializeMessage(message: unknown): { bytes: Uint8Array; type: number } {
    // ArrayBuffer - send as binary
    if (message instanceof ArrayBuffer) {
      return { bytes: new Uint8Array(message), type: MSG_TYPE_BINARY };
    }

    // TypedArray - send with type info
    if (ArrayBuffer.isView(message) && !(message instanceof DataView)) {
      return { bytes: this.serializeTypedArray(message as TypedArrayTypes), type: MSG_TYPE_TYPED };
    }

    // Everything else - JSON
    const json = JSON.stringify(message);
    return { bytes: new TextEncoder().encode(json), type: MSG_TYPE_JSON };
  }

  /**
   * Serialize a TypedArray with type information
   */
  private serializeTypedArray(array: TypedArrayTypes): Uint8Array {
    const typeId = this.getTypedArrayTypeId(array);
    const bytes = new Uint8Array(1 + array.byteLength);
    bytes[0] = typeId;
    bytes.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), 1);
    return bytes;
  }

  /**
   * Deserialize a TypedArray from bytes
   */
  private deserializeTypedArray(payload: Uint8Array): TypedArrayTypes {
    const typeId = payload[0];
    const data = payload.slice(1);
    return this.createTypedArray(typeId, data.buffer, data.byteOffset, data.byteLength);
  }

  /**
   * Deserialize a mixed message (JSON with binary references)
   */
  private deserializeMixed(payload: Uint8Array): unknown {
    // For now, treat as JSON - mixed format can be expanded later
    return JSON.parse(new TextDecoder().decode(payload));
  }

  /**
   * Get type ID for a TypedArray
   */
  private getTypedArrayTypeId(array: TypedArrayTypes): number {
    if (array instanceof Int8Array) return 1;
    if (array instanceof Uint8Array) return 2;
    if (array instanceof Uint8ClampedArray) return 3;
    if (array instanceof Int16Array) return 4;
    if (array instanceof Uint16Array) return 5;
    if (array instanceof Int32Array) return 6;
    if (array instanceof Uint32Array) return 7;
    if (array instanceof Float32Array) return 8;
    if (array instanceof Float64Array) return 9;
    if (array instanceof BigInt64Array) return 10;
    if (array instanceof BigUint64Array) return 11;
    return 0; // Unknown
  }

  /**
   * Create a TypedArray from type ID and data
   */
  private createTypedArray(typeId: number, buffer: ArrayBuffer, byteOffset: number, byteLength: number): TypedArrayTypes {
    // Create a copy of the buffer to avoid issues with detached buffers
    const copy = buffer.slice(byteOffset, byteOffset + byteLength);

    switch (typeId) {
      case 1: return new Int8Array(copy);
      case 2: return new Uint8Array(copy);
      case 3: return new Uint8ClampedArray(copy);
      case 4: return new Int16Array(copy);
      case 5: return new Uint16Array(copy);
      case 6: return new Int32Array(copy);
      case 7: return new Uint32Array(copy);
      case 8: return new Float32Array(copy);
      case 9: return new Float64Array(copy);
      case 10: return new BigInt64Array(copy);
      case 11: return new BigUint64Array(copy);
      default: return new Uint8Array(copy);
    }
  }
}

/**
 * Union type of all TypedArray types
 */
type TypedArrayTypes =
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

export default SharedMemoryChannel;
