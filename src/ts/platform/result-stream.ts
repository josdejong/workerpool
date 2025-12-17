/**
 * Result Streaming
 *
 * Supports streaming large results back from workers via SharedArrayBuffer
 * or chunked transfer for results exceeding normal message limits.
 */

import { hasSharedArrayBuffer, hasAtomics } from './environment';

/**
 * Stream state
 */
export enum StreamState {
  IDLE = 'idle',
  STREAMING = 'streaming',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

/**
 * Stream chunk
 */
export interface StreamChunk {
  /** Chunk sequence number */
  index: number;
  /** Total number of chunks (if known) */
  total?: number;
  /** Chunk data */
  data: Uint8Array;
  /** Whether this is the last chunk */
  final: boolean;
  /** Original total size (if known) */
  totalSize?: number;
}

/**
 * Stream progress info
 */
export interface StreamProgress {
  /** Bytes received so far */
  bytesReceived: number;
  /** Total bytes expected (if known) */
  totalBytes?: number;
  /** Number of chunks received */
  chunksReceived: number;
  /** Total chunks expected (if known) */
  totalChunks?: number;
  /** Progress percentage (0-100, if known) */
  percentage?: number;
}

/**
 * Stream event callbacks
 */
export interface StreamCallbacks {
  /** Called when data chunk is received */
  onData?: (chunk: StreamChunk) => void;
  /** Called with progress updates */
  onProgress?: (progress: StreamProgress) => void;
  /** Called when stream completes */
  onComplete?: (result: Uint8Array) => void;
  /** Called on error */
  onError?: (error: Error) => void;
}

/**
 * Configuration for result streaming
 */
export interface StreamConfig {
  /** Chunk size in bytes (default: 64KB) */
  chunkSize?: number;
  /** High water mark for backpressure (default: 1MB) */
  highWaterMark?: number;
  /** Low water mark for resuming (default: 256KB) */
  lowWaterMark?: number;
  /** Use SharedArrayBuffer if available */
  useSharedMemory?: boolean;
}

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB
const DEFAULT_HIGH_WATER_MARK = 1024 * 1024; // 1MB
const DEFAULT_LOW_WATER_MARK = 256 * 1024; // 256KB

/**
 * Result stream sender (worker side)
 */
export class ResultStreamSender {
  private config: Required<StreamConfig>;
  private state: StreamState = StreamState.IDLE;
  private sendCallback: (chunk: StreamChunk) => void;
  private pauseCallback?: () => void;
  private resumeCallback?: () => void;

  constructor(
    sendCallback: (chunk: StreamChunk) => void,
    config: StreamConfig = {}
  ) {
    this.sendCallback = sendCallback;
    this.config = {
      chunkSize: config.chunkSize ?? DEFAULT_CHUNK_SIZE,
      highWaterMark: config.highWaterMark ?? DEFAULT_HIGH_WATER_MARK,
      lowWaterMark: config.lowWaterMark ?? DEFAULT_LOW_WATER_MARK,
      useSharedMemory: config.useSharedMemory ?? true,
    };
  }

  /**
   * Stream a large result in chunks
   *
   * @param data - Data to stream
   * @returns Promise that resolves when streaming completes
   */
  async stream(data: Uint8Array | ArrayBuffer): Promise<void> {
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    const totalSize = bytes.byteLength;
    const totalChunks = Math.ceil(totalSize / this.config.chunkSize);

    this.state = StreamState.STREAMING;

    for (let i = 0; i < totalChunks; i++) {
      // Check for pause (state may change asynchronously)
      const currentState = this.state as StreamState;
      if (currentState === StreamState.PAUSED) {
        await this.waitForResume();
      }

      // Check for cancellation
      if (currentState === StreamState.CANCELLED) {
        throw new Error('Stream cancelled');
      }

      const start = i * this.config.chunkSize;
      const end = Math.min(start + this.config.chunkSize, totalSize);
      const chunkData = bytes.slice(start, end);

      const chunk: StreamChunk = {
        index: i,
        total: totalChunks,
        data: chunkData,
        final: i === totalChunks - 1,
        totalSize,
      };

      this.sendCallback(chunk);

      // Yield to event loop periodically
      if (i % 10 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    this.state = StreamState.COMPLETED;
  }

  /**
   * Stream an async iterable
   */
  async streamIterable(iterable: AsyncIterable<Uint8Array>): Promise<void> {
    this.state = StreamState.STREAMING;
    let index = 0;

    for await (const data of iterable) {
      // Check state (may change asynchronously)
      const currentState = this.state as StreamState;
      if (currentState === StreamState.PAUSED) {
        await this.waitForResume();
      }

      if (currentState === StreamState.CANCELLED) {
        throw new Error('Stream cancelled');
      }

      const chunk: StreamChunk = {
        index: index++,
        data,
        final: false,
      };

      this.sendCallback(chunk);
    }

    // Send final empty chunk to signal completion
    const finalChunk: StreamChunk = {
      index: index,
      data: new Uint8Array(0),
      final: true,
    };

    this.sendCallback(finalChunk);
    this.state = StreamState.COMPLETED;
  }

  /**
   * Pause streaming
   */
  pause(): void {
    if (this.state === StreamState.STREAMING) {
      this.state = StreamState.PAUSED;
      this.pauseCallback?.();
    }
  }

  /**
   * Resume streaming
   */
  resume(): void {
    if (this.state === StreamState.PAUSED) {
      this.state = StreamState.STREAMING;
      this.resumeCallback?.();
    }
  }

  /**
   * Cancel streaming
   */
  cancel(): void {
    this.state = StreamState.CANCELLED;
  }

  /**
   * Get current state
   */
  getState(): StreamState {
    return this.state;
  }

  /**
   * Wait for resume signal
   */
  private waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      this.resumeCallback = resolve;
    });
  }

  /**
   * Set pause callback
   */
  onPause(callback: () => void): void {
    this.pauseCallback = callback;
  }
}

/**
 * Result stream receiver (main thread side)
 */
export class ResultStreamReceiver {
  private config: Required<StreamConfig>;
  private state: StreamState = StreamState.IDLE;
  private chunks: Uint8Array[] = [];
  private bytesReceived: number = 0;
  private totalBytes?: number;
  private totalChunks?: number;
  private callbacks: StreamCallbacks;
  private resolveComplete?: (result: Uint8Array) => void;
  private rejectComplete?: (error: Error) => void;

  constructor(callbacks: StreamCallbacks = {}, config: StreamConfig = {}) {
    this.callbacks = callbacks;
    this.config = {
      chunkSize: config.chunkSize ?? DEFAULT_CHUNK_SIZE,
      highWaterMark: config.highWaterMark ?? DEFAULT_HIGH_WATER_MARK,
      lowWaterMark: config.lowWaterMark ?? DEFAULT_LOW_WATER_MARK,
      useSharedMemory: config.useSharedMemory ?? true,
    };
  }

  /**
   * Start receiving stream
   *
   * @returns Promise that resolves with complete data
   */
  receive(): Promise<Uint8Array> {
    this.state = StreamState.STREAMING;
    this.chunks = [];
    this.bytesReceived = 0;

    return new Promise((resolve, reject) => {
      this.resolveComplete = resolve;
      this.rejectComplete = reject;
    });
  }

  /**
   * Handle incoming chunk
   *
   * @param chunk - Received chunk
   * @returns Backpressure signal (true = pause sending)
   */
  handleChunk(chunk: StreamChunk): boolean {
    if (this.state !== StreamState.STREAMING && this.state !== StreamState.PAUSED) {
      return false;
    }

    // Store chunk
    this.chunks[chunk.index] = chunk.data;
    this.bytesReceived += chunk.data.byteLength;

    // Update totals if provided
    if (chunk.total !== undefined) {
      this.totalChunks = chunk.total;
    }
    if (chunk.totalSize !== undefined) {
      this.totalBytes = chunk.totalSize;
    }

    // Notify callbacks
    this.callbacks.onData?.(chunk);
    this.callbacks.onProgress?.(this.getProgress());

    // Check for completion
    if (chunk.final) {
      this.complete();
      return false;
    }

    // Backpressure check
    if (this.bytesReceived > this.config.highWaterMark) {
      this.state = StreamState.PAUSED;
      return true;
    }

    return false;
  }

  /**
   * Signal that backpressure has cleared
   */
  resume(): void {
    if (this.state === StreamState.PAUSED) {
      this.state = StreamState.STREAMING;
    }
  }

  /**
   * Get current progress
   */
  getProgress(): StreamProgress {
    const progress: StreamProgress = {
      bytesReceived: this.bytesReceived,
      totalBytes: this.totalBytes,
      chunksReceived: this.chunks.filter(Boolean).length,
      totalChunks: this.totalChunks,
    };

    if (this.totalBytes !== undefined) {
      progress.percentage = Math.round((this.bytesReceived / this.totalBytes) * 100);
    }

    return progress;
  }

  /**
   * Get current state
   */
  getState(): StreamState {
    return this.state;
  }

  /**
   * Cancel receiving
   */
  cancel(): void {
    this.state = StreamState.CANCELLED;
    this.rejectComplete?.(new Error('Stream cancelled'));
  }

  /**
   * Handle error
   */
  error(err: Error): void {
    this.state = StreamState.ERROR;
    this.callbacks.onError?.(err);
    this.rejectComplete?.(err);
  }

  /**
   * Complete the stream and assemble result
   */
  private complete(): void {
    this.state = StreamState.COMPLETED;

    // Assemble chunks into final result
    const result = this.assembleChunks();

    this.callbacks.onComplete?.(result);
    this.resolveComplete?.(result);
  }

  /**
   * Assemble chunks into final buffer
   */
  private assembleChunks(): Uint8Array {
    // Calculate total size
    const totalSize = this.totalBytes ?? this.chunks.reduce((sum, chunk) => sum + (chunk?.byteLength ?? 0), 0);

    // Create result buffer
    const result = new Uint8Array(totalSize);
    let offset = 0;

    for (const chunk of this.chunks) {
      if (chunk) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }

    return result;
  }
}

/**
 * Shared memory based result stream (uses SharedArrayBuffer)
 */
export class SharedMemoryResultStream {
  private buffer: SharedArrayBuffer | null = null;
  private view: Uint8Array | null = null;
  private header: Int32Array | null = null;

  // Header layout: [status, writeOffset, totalSize, reserved...]
  private static readonly HEADER_SIZE = 16;
  private static readonly STATUS_OFFSET = 0;
  private static readonly WRITE_OFFSET = 1;
  private static readonly TOTAL_SIZE_OFFSET = 2;

  // Status values
  private static readonly STATUS_IDLE = 0;
  private static readonly STATUS_STREAMING = 1;
  private static readonly STATUS_COMPLETE = 2;
  private static readonly STATUS_ERROR = 3;

  /**
   * Check if shared memory streaming is supported
   */
  static isSupported(): boolean {
    return hasSharedArrayBuffer && hasAtomics;
  }

  /**
   * Create a shared buffer for streaming
   *
   * @param maxSize - Maximum result size
   * @returns SharedArrayBuffer for streaming
   */
  createBuffer(maxSize: number): SharedArrayBuffer {
    if (!SharedMemoryResultStream.isSupported()) {
      throw new Error('SharedArrayBuffer not supported');
    }

    const totalSize = SharedMemoryResultStream.HEADER_SIZE + maxSize;
    this.buffer = new SharedArrayBuffer(totalSize);
    this.header = new Int32Array(this.buffer, 0, 4);
    this.view = new Uint8Array(this.buffer, SharedMemoryResultStream.HEADER_SIZE);

    // Initialize header
    Atomics.store(this.header, SharedMemoryResultStream.STATUS_OFFSET, SharedMemoryResultStream.STATUS_IDLE);
    Atomics.store(this.header, SharedMemoryResultStream.WRITE_OFFSET, 0);
    Atomics.store(this.header, SharedMemoryResultStream.TOTAL_SIZE_OFFSET, 0);

    return this.buffer;
  }

  /**
   * Attach to existing buffer (worker side)
   */
  attachBuffer(buffer: SharedArrayBuffer): void {
    this.buffer = buffer;
    this.header = new Int32Array(buffer, 0, 4);
    this.view = new Uint8Array(buffer, SharedMemoryResultStream.HEADER_SIZE);
  }

  /**
   * Write data to the stream (worker side)
   */
  write(data: Uint8Array): void {
    if (!this.header || !this.view) {
      throw new Error('Buffer not initialized');
    }

    const currentOffset = Atomics.load(this.header, SharedMemoryResultStream.WRITE_OFFSET);

    if (currentOffset + data.byteLength > this.view.byteLength) {
      throw new Error('Stream buffer overflow');
    }

    // Set status to streaming
    Atomics.store(this.header, SharedMemoryResultStream.STATUS_OFFSET, SharedMemoryResultStream.STATUS_STREAMING);

    // Write data
    this.view.set(data, currentOffset);

    // Update write offset
    Atomics.store(this.header, SharedMemoryResultStream.WRITE_OFFSET, currentOffset + data.byteLength);

    // Notify waiting readers
    Atomics.notify(this.header, SharedMemoryResultStream.WRITE_OFFSET);
  }

  /**
   * Mark stream as complete (worker side)
   */
  complete(totalSize: number): void {
    if (!this.header) {
      throw new Error('Buffer not initialized');
    }

    Atomics.store(this.header, SharedMemoryResultStream.TOTAL_SIZE_OFFSET, totalSize);
    Atomics.store(this.header, SharedMemoryResultStream.STATUS_OFFSET, SharedMemoryResultStream.STATUS_COMPLETE);
    Atomics.notify(this.header, SharedMemoryResultStream.STATUS_OFFSET, Infinity);
  }

  /**
   * Mark stream as errored (worker side)
   */
  error(): void {
    if (!this.header) {
      throw new Error('Buffer not initialized');
    }

    Atomics.store(this.header, SharedMemoryResultStream.STATUS_OFFSET, SharedMemoryResultStream.STATUS_ERROR);
    Atomics.notify(this.header, SharedMemoryResultStream.STATUS_OFFSET, Infinity);
  }

  /**
   * Read available data (main thread side)
   *
   * @param timeout - Wait timeout in ms
   * @returns Available data or null if nothing new
   */
  read(timeout: number = 0): { data: Uint8Array; complete: boolean } | null {
    if (!this.header || !this.view) {
      throw new Error('Buffer not initialized');
    }

    const status = Atomics.load(this.header, SharedMemoryResultStream.STATUS_OFFSET);

    if (status === SharedMemoryResultStream.STATUS_ERROR) {
      throw new Error('Stream error');
    }

    const writeOffset = Atomics.load(this.header, SharedMemoryResultStream.WRITE_OFFSET);

    if (writeOffset === 0 && status !== SharedMemoryResultStream.STATUS_COMPLETE) {
      if (timeout > 0) {
        // Wait for data
        Atomics.wait(this.header, SharedMemoryResultStream.WRITE_OFFSET, 0, timeout);
        return this.read(0);
      }
      return null;
    }

    const isComplete = status === SharedMemoryResultStream.STATUS_COMPLETE;
    const totalSize = isComplete
      ? Atomics.load(this.header, SharedMemoryResultStream.TOTAL_SIZE_OFFSET)
      : writeOffset;

    // Copy data
    const data = new Uint8Array(totalSize);
    data.set(this.view.subarray(0, totalSize));

    return { data, complete: isComplete };
  }

  /**
   * Wait for completion (main thread side)
   *
   * @param timeout - Maximum wait time in ms
   * @returns Complete result
   */
  waitForCompletion(timeout: number = Infinity): Uint8Array {
    if (!this.header || !this.view) {
      throw new Error('Buffer not initialized');
    }

    // Wait for complete status
    let status = Atomics.load(this.header, SharedMemoryResultStream.STATUS_OFFSET);
    while (status !== SharedMemoryResultStream.STATUS_COMPLETE && status !== SharedMemoryResultStream.STATUS_ERROR) {
      const result = Atomics.wait(this.header, SharedMemoryResultStream.STATUS_OFFSET, status, timeout);
      if (result === 'timed-out') {
        throw new Error('Stream timeout');
      }
      status = Atomics.load(this.header, SharedMemoryResultStream.STATUS_OFFSET);
    }

    if (status === SharedMemoryResultStream.STATUS_ERROR) {
      throw new Error('Stream error');
    }

    const totalSize = Atomics.load(this.header, SharedMemoryResultStream.TOTAL_SIZE_OFFSET);
    const result = new Uint8Array(totalSize);
    result.set(this.view.subarray(0, totalSize));

    return result;
  }
}

export default {
  ResultStreamSender,
  ResultStreamReceiver,
  SharedMemoryResultStream,
  StreamState,
};
