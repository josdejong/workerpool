/**
 * Channel Factory
 *
 * Creates communication channels with automatic fallback from
 * SharedArrayBuffer to postMessage/IPC when SAB is unavailable.
 */

import { hasSharedArrayBuffer, hasAtomics, platform } from './environment';
import { SharedMemoryChannel, SharedMemoryChannelOptions } from './shared-memory';

/**
 * Channel type
 */
export enum ChannelType {
  /** SharedArrayBuffer-based channel */
  SHARED_MEMORY = 'shared_memory',
  /** postMessage/IPC based channel */
  MESSAGE_PASSING = 'message_passing',
}

/**
 * Abstract channel interface
 */
export interface IChannel {
  /** Send a message */
  send(message: unknown): SendResult;
  /** Receive a message (non-blocking) */
  receive(): unknown | null;
  /** Close the channel */
  close(): void;
  /** Check if channel is closed */
  isClosed(): boolean;
  /** Get channel type */
  getType(): ChannelType;
}

/**
 * Send result
 */
export interface SendResult {
  success: boolean;
  reason?: string;
}

/**
 * Channel factory options
 */
export interface ChannelFactoryOptions {
  /** Prefer shared memory if available */
  preferSharedMemory?: boolean;
  /** SharedMemoryChannel options */
  sharedMemoryOptions?: SharedMemoryChannelOptions;
  /** Callback for degraded mode warning */
  onDegradedMode?: (reason: string) => void;
  /** Force a specific channel type */
  forceType?: ChannelType;
}

/**
 * Check if SharedArrayBuffer is available and usable
 */
export function canUseSharedMemory(): boolean {
  if (!hasSharedArrayBuffer || !hasAtomics) {
    return false;
  }

  // In browsers, SAB requires COOP/COEP headers
  if (platform === 'browser') {
    try {
      // Try to create a small SAB to verify it's actually usable
      const testBuffer = new SharedArrayBuffer(4);
      const testView = new Int32Array(testBuffer);
      Atomics.store(testView, 0, 1);
      return Atomics.load(testView, 0) === 1;
    } catch {
      return false;
    }
  }

  // In Node.js, SAB is generally available
  return true;
}

/**
 * Get reason why shared memory is unavailable
 */
export function getSharedMemoryUnavailableReason(): string {
  if (!hasSharedArrayBuffer) {
    return 'SharedArrayBuffer is not available in this environment';
  }

  if (!hasAtomics) {
    return 'Atomics is not available in this environment';
  }

  if (platform === 'browser') {
    return 'SharedArrayBuffer requires Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp headers';
  }

  return 'Unknown reason';
}

/**
 * Message passing channel (fallback)
 *
 * Uses postMessage in browsers and IPC in Node.js
 */
export class MessagePassingChannel implements IChannel {
  private closed: boolean = false;
  private messageQueue: unknown[];
  private sendHandler: (message: unknown) => void;
  private maxQueueSize: number;

  constructor(sendHandler: (message: unknown) => void, maxQueueSize: number = 1000, sharedQueue?: unknown[]) {
    this.sendHandler = sendHandler;
    this.maxQueueSize = maxQueueSize;
    this.messageQueue = sharedQueue ?? [];
  }

  /**
   * Handle incoming message (call from message event handler)
   */
  handleMessage(message: unknown): void {
    if (this.closed) return;

    this.messageQueue.push(message);

    // Prevent unbounded queue growth
    if (this.messageQueue.length > this.maxQueueSize) {
      this.messageQueue.shift();
      console.warn('MessagePassingChannel: message queue overflow, oldest message dropped');
    }
  }

  send(message: unknown): SendResult {
    if (this.closed) {
      return { success: false, reason: 'Channel closed' };
    }

    try {
      this.sendHandler(message);
      return { success: true };
    } catch (err) {
      return { success: false, reason: String(err) };
    }
  }

  receive(): unknown | null {
    if (this.closed || this.messageQueue.length === 0) {
      return null;
    }

    return this.messageQueue.shift();
  }

  close(): void {
    this.closed = true;
    this.messageQueue = [];
  }

  isClosed(): boolean {
    return this.closed;
  }

  getType(): ChannelType {
    return ChannelType.MESSAGE_PASSING;
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }
}

/**
 * Shared memory channel wrapper implementing IChannel
 */
export class SharedMemoryChannelWrapper implements IChannel {
  private channel: SharedMemoryChannel;

  constructor(options?: SharedMemoryChannelOptions) {
    this.channel = new SharedMemoryChannel(options);
  }

  send(message: unknown): SendResult {
    return this.channel.send(message);
  }

  receive(): unknown | null {
    return this.channel.receive();
  }

  close(): void {
    this.channel.close();
  }

  isClosed(): boolean {
    return this.channel.isClosed();
  }

  getType(): ChannelType {
    return ChannelType.SHARED_MEMORY;
  }

  /**
   * Get underlying SharedArrayBuffer for sharing with worker
   */
  getBuffer(): SharedArrayBuffer {
    return this.channel.getBuffer();
  }

  /**
   * Receive with blocking (only for shared memory)
   */
  receiveBlocking(timeout?: number): unknown | null {
    return this.channel.receiveBlocking(timeout);
  }
}

/**
 * Create a communication channel
 *
 * @param options - Channel options
 * @returns Created channel
 */
export function createChannel(options: ChannelFactoryOptions = {}): IChannel {
  const { preferSharedMemory = true, sharedMemoryOptions, onDegradedMode, forceType } = options;

  // Handle forced type
  if (forceType === ChannelType.MESSAGE_PASSING) {
    return new MessagePassingChannel(() => {
      throw new Error('Send handler not configured');
    });
  }

  if (forceType === ChannelType.SHARED_MEMORY) {
    if (!canUseSharedMemory()) {
      throw new Error(`Cannot create SharedMemory channel: ${getSharedMemoryUnavailableReason()}`);
    }
    return new SharedMemoryChannelWrapper(sharedMemoryOptions);
  }

  // Auto-detect best channel type
  if (preferSharedMemory && canUseSharedMemory()) {
    return new SharedMemoryChannelWrapper(sharedMemoryOptions);
  }

  // Fall back to message passing
  if (preferSharedMemory && !canUseSharedMemory()) {
    const reason = getSharedMemoryUnavailableReason();
    onDegradedMode?.(reason);
    console.warn(`workerpool: falling back to message passing. ${reason}`);
  }

  return new MessagePassingChannel(() => {
    throw new Error('Send handler not configured');
  });
}

/**
 * Create a message passing channel with send handler
 *
 * @param sendHandler - Function to send messages
 * @param maxQueueSize - Maximum queue size
 * @returns Message passing channel
 */
export function createMessageChannel(
  sendHandler: (message: unknown) => void,
  maxQueueSize?: number
): MessagePassingChannel {
  return new MessagePassingChannel(sendHandler, maxQueueSize);
}

/**
 * Create a shared memory channel (throws if not available)
 *
 * @param options - SharedMemoryChannel options
 * @returns Shared memory channel wrapper
 */
export function createSharedMemoryChannel(options?: SharedMemoryChannelOptions): SharedMemoryChannelWrapper {
  if (!canUseSharedMemory()) {
    throw new Error(`Cannot create SharedMemory channel: ${getSharedMemoryUnavailableReason()}`);
  }

  return new SharedMemoryChannelWrapper(options);
}

/**
 * Channel pair for bidirectional communication
 */
export interface ChannelPair {
  /** Main thread channel */
  main: IChannel;
  /** Worker channel */
  worker: IChannel;
  /** Channel type */
  type: ChannelType;
}

/**
 * Create a channel pair for bidirectional communication
 *
 * For shared memory, both channels share the same buffer.
 * For message passing, channels are connected via handlers.
 *
 * @param options - Channel options
 * @returns Channel pair
 */
export function createChannelPair(options: ChannelFactoryOptions = {}): ChannelPair {
  const { preferSharedMemory = true, sharedMemoryOptions, onDegradedMode } = options;

  if (preferSharedMemory && canUseSharedMemory()) {
    const mainChannel = new SharedMemoryChannelWrapper(sharedMemoryOptions);
    const workerChannel = new SharedMemoryChannelWrapper({
      ...sharedMemoryOptions,
      buffer: mainChannel.getBuffer(),
    });

    return {
      main: mainChannel,
      worker: workerChannel,
      type: ChannelType.SHARED_MEMORY,
    };
  }

  // Fallback to message passing
  if (preferSharedMemory && !canUseSharedMemory()) {
    const reason = getSharedMemoryUnavailableReason();
    onDegradedMode?.(reason);
    console.warn(`workerpool: falling back to message passing. ${reason}`);
  }

  // Create connected message passing channels
  // mainQueue holds messages sent from worker to main
  // workerQueue holds messages sent from main to worker
  const mainQueue: unknown[] = [];
  const workerQueue: unknown[] = [];

  // Main channel sends to workerQueue, receives from mainQueue
  const mainChannel = new MessagePassingChannel(
    (msg) => workerQueue.push(msg),
    1000,
    mainQueue
  );

  // Worker channel sends to mainQueue, receives from workerQueue
  const workerChannel = new MessagePassingChannel(
    (msg) => mainQueue.push(msg),
    1000,
    workerQueue
  );

  return {
    main: mainChannel,
    worker: workerChannel,
    type: ChannelType.MESSAGE_PASSING,
  };
}

/**
 * Channel statistics
 */
export interface ChannelStats {
  /** Channel type */
  type: ChannelType;
  /** Messages sent */
  messagesSent: number;
  /** Messages received */
  messagesReceived: number;
  /** Bytes transferred (estimated) */
  bytesTransferred: number;
  /** Send failures */
  sendFailures: number;
}

/**
 * Instrumented channel wrapper for collecting statistics
 */
export class InstrumentedChannel implements IChannel {
  private inner: IChannel;
  private stats: ChannelStats;

  constructor(channel: IChannel) {
    this.inner = channel;
    this.stats = {
      type: channel.getType(),
      messagesSent: 0,
      messagesReceived: 0,
      bytesTransferred: 0,
      sendFailures: 0,
    };
  }

  send(message: unknown): SendResult {
    const result = this.inner.send(message);

    if (result.success) {
      this.stats.messagesSent++;
      this.stats.bytesTransferred += this.estimateSize(message);
    } else {
      this.stats.sendFailures++;
    }

    return result;
  }

  receive(): unknown | null {
    const message = this.inner.receive();

    if (message !== null) {
      this.stats.messagesReceived++;
      this.stats.bytesTransferred += this.estimateSize(message);
    }

    return message;
  }

  close(): void {
    this.inner.close();
  }

  isClosed(): boolean {
    return this.inner.isClosed();
  }

  getType(): ChannelType {
    return this.inner.getType();
  }

  /**
   * Get statistics
   */
  getStats(): ChannelStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.messagesSent = 0;
    this.stats.messagesReceived = 0;
    this.stats.bytesTransferred = 0;
    this.stats.sendFailures = 0;
  }

  /**
   * Estimate message size
   */
  private estimateSize(message: unknown): number {
    if (message === null || message === undefined) return 4;
    if (typeof message === 'string') return message.length * 2;
    if (typeof message === 'number') return 8;
    if (message instanceof ArrayBuffer) return message.byteLength;
    if (ArrayBuffer.isView(message)) return (message as ArrayBufferView).byteLength;

    try {
      return JSON.stringify(message).length * 2;
    } catch {
      return 100;
    }
  }
}

export default {
  createChannel,
  createMessageChannel,
  createSharedMemoryChannel,
  createChannelPair,
  canUseSharedMemory,
  getSharedMemoryUnavailableReason,
  ChannelType,
  MessagePassingChannel,
  SharedMemoryChannelWrapper,
  InstrumentedChannel,
};
