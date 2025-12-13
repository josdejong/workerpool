/**
 * Message Batcher
 *
 * Batches multiple small messages into single transfers to reduce
 * overhead and improve throughput for high-frequency messaging.
 */

/**
 * Configuration for message batching
 */
export interface BatcherConfig {
  /** Maximum time to wait before flushing (ms) */
  flushTimeout?: number;
  /** Maximum number of messages before flush */
  maxMessages?: number;
  /** Maximum batch size in bytes before flush */
  maxBatchSize?: number;
  /** Whether to enable batching */
  enabled?: boolean;
}

/**
 * Batched message envelope
 */
export interface BatchedMessage {
  /** Original message payload */
  payload: unknown;
  /** Message ID for correlation */
  id: number;
  /** Timestamp when message was queued */
  timestamp: number;
}

/**
 * Batch envelope sent over the wire
 */
export interface MessageBatch {
  /** Batch type identifier */
  type: 'batch';
  /** Array of batched messages */
  messages: BatchedMessage[];
  /** Total batch size in bytes (estimated) */
  size: number;
  /** Batch creation timestamp */
  batchTimestamp: number;
}

/**
 * Callback for sending batched messages
 */
export type BatchSendCallback = (batch: MessageBatch, transferables: Transferable[]) => void;

const DEFAULT_FLUSH_TIMEOUT = 10; // 10ms
const DEFAULT_MAX_MESSAGES = 100;
const DEFAULT_MAX_BATCH_SIZE = 64 * 1024; // 64KB

/**
 * Message batcher for reducing transfer overhead
 */
export class MessageBatcher {
  private config: Required<BatcherConfig>;
  private messageQueue: BatchedMessage[] = [];
  private pendingTransferables: Transferable[] = [];
  private currentSize: number = 0;
  private nextId: number = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private sendCallback: BatchSendCallback;

  /**
   * Create a new MessageBatcher
   *
   * @param sendCallback - Callback to invoke when batch is ready
   * @param config - Batcher configuration
   */
  constructor(sendCallback: BatchSendCallback, config: BatcherConfig = {}) {
    this.sendCallback = sendCallback;
    this.config = {
      flushTimeout: config.flushTimeout ?? DEFAULT_FLUSH_TIMEOUT,
      maxMessages: config.maxMessages ?? DEFAULT_MAX_MESSAGES,
      maxBatchSize: config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE,
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Check if batching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable or disable batching
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    if (!enabled) {
      this.flush();
    }
  }

  /**
   * Update configuration
   */
  configure(config: Partial<BatcherConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Queue a message for batching
   *
   * @param payload - Message payload
   * @param transferables - Optional transferables for this message
   * @returns Message ID for correlation
   */
  queue(payload: unknown, transferables: Transferable[] = []): number {
    const id = this.nextId++;
    const timestamp = Date.now();
    const messageSize = this.estimateSize(payload);

    // If batching disabled, send immediately
    if (!this.config.enabled) {
      const batch: MessageBatch = {
        type: 'batch',
        messages: [{ payload, id, timestamp }],
        size: messageSize,
        batchTimestamp: timestamp,
      };
      this.sendCallback(batch, transferables);
      return id;
    }

    // Check if this message alone exceeds batch size - send immediately
    if (messageSize > this.config.maxBatchSize) {
      this.flush(); // Flush any pending messages first
      const batch: MessageBatch = {
        type: 'batch',
        messages: [{ payload, id, timestamp }],
        size: messageSize,
        batchTimestamp: timestamp,
      };
      this.sendCallback(batch, transferables);
      return id;
    }

    // Check if adding this message would exceed batch size
    if (this.currentSize + messageSize > this.config.maxBatchSize) {
      this.flush();
    }

    // Add message to queue
    this.messageQueue.push({ payload, id, timestamp });
    this.pendingTransferables.push(...transferables);
    this.currentSize += messageSize;

    // Check if queue is full
    if (this.messageQueue.length >= this.config.maxMessages) {
      this.flush();
    } else {
      // Start flush timer if not running
      this.startFlushTimer();
    }

    return id;
  }

  /**
   * Flush all queued messages
   */
  flush(): void {
    this.cancelFlushTimer();

    if (this.messageQueue.length === 0) {
      return;
    }

    const batch: MessageBatch = {
      type: 'batch',
      messages: [...this.messageQueue],
      size: this.currentSize,
      batchTimestamp: Date.now(),
    };

    const transferables = [...this.pendingTransferables];

    // Clear queue
    this.messageQueue = [];
    this.pendingTransferables = [];
    this.currentSize = 0;

    // Send batch
    this.sendCallback(batch, transferables);
  }

  /**
   * Get number of pending messages
   */
  pendingCount(): number {
    return this.messageQueue.length;
  }

  /**
   * Get current batch size in bytes
   */
  pendingSize(): number {
    return this.currentSize;
  }

  /**
   * Clear all pending messages without sending
   */
  clear(): void {
    this.cancelFlushTimer();
    this.messageQueue = [];
    this.pendingTransferables = [];
    this.currentSize = 0;
  }

  /**
   * Destroy the batcher
   */
  destroy(): void {
    this.flush();
    this.clear();
  }

  /**
   * Start the flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer !== null) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.config.flushTimeout);
  }

  /**
   * Cancel the flush timer
   */
  private cancelFlushTimer(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Estimate size of a payload in bytes
   */
  private estimateSize(payload: unknown): number {
    if (payload === null || payload === undefined) {
      return 4;
    }

    if (typeof payload === 'string') {
      return payload.length * 2;
    }

    if (typeof payload === 'number' || typeof payload === 'boolean') {
      return 8;
    }

    if (payload instanceof ArrayBuffer) {
      return payload.byteLength;
    }

    if (ArrayBuffer.isView(payload)) {
      return (payload as ArrayBufferView).byteLength;
    }

    if (Array.isArray(payload)) {
      return payload.reduce((sum, item) => sum + this.estimateSize(item), 0);
    }

    if (typeof payload === 'object') {
      try {
        return JSON.stringify(payload).length * 2;
      } catch {
        return 1000; // Estimate for non-serializable objects
      }
    }

    return 8;
  }
}

/**
 * Unbatcher for receiving and processing batched messages
 */
export class MessageUnbatcher {
  /**
   * Check if a message is a batch
   */
  static isBatch(message: unknown): message is MessageBatch {
    return (
      message !== null &&
      typeof message === 'object' &&
      (message as MessageBatch).type === 'batch' &&
      Array.isArray((message as MessageBatch).messages)
    );
  }

  /**
   * Extract individual messages from a batch
   *
   * @param batch - Batch to unbatch
   * @returns Iterator of individual messages
   */
  static *unbatch(batch: MessageBatch): Generator<BatchedMessage> {
    for (const message of batch.messages) {
      yield message;
    }
  }

  /**
   * Process a batch with a callback
   *
   * @param batch - Batch to process
   * @param callback - Callback for each message
   */
  static processBatch(batch: MessageBatch, callback: (message: BatchedMessage) => void): void {
    for (const message of batch.messages) {
      callback(message);
    }
  }

  /**
   * Get batch statistics
   */
  static getBatchStats(batch: MessageBatch): BatchStats {
    const timestamps = batch.messages.map((m) => m.timestamp);
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);

    return {
      messageCount: batch.messages.length,
      batchSize: batch.size,
      latency: batch.batchTimestamp - minTime,
      spread: maxTime - minTime,
      avgMessageSize: batch.size / batch.messages.length,
    };
  }
}

/**
 * Batch statistics
 */
export interface BatchStats {
  /** Number of messages in batch */
  messageCount: number;
  /** Total batch size in bytes */
  batchSize: number;
  /** Time from first message to batch send */
  latency: number;
  /** Time spread between first and last message */
  spread: number;
  /** Average message size */
  avgMessageSize: number;
}

/**
 * Create a message batcher with adaptive configuration
 *
 * Automatically adjusts batch parameters based on message patterns.
 */
export class AdaptiveBatcher extends MessageBatcher {
  private messageHistory: number[] = [];
  private sizeHistory: number[] = [];
  private readonly historySize = 100;

  constructor(sendCallback: BatchSendCallback, config: BatcherConfig = {}) {
    super(sendCallback, config);
  }

  /**
   * Queue a message and track patterns
   */
  override queue(payload: unknown, transferables: Transferable[] = []): number {
    const now = Date.now();
    this.messageHistory.push(now);
    if (this.messageHistory.length > this.historySize) {
      this.messageHistory.shift();
    }

    const size = this.estimateSizePublic(payload);
    this.sizeHistory.push(size);
    if (this.sizeHistory.length > this.historySize) {
      this.sizeHistory.shift();
    }

    // Adapt configuration based on patterns
    this.adaptConfiguration();

    return super.queue(payload, transferables);
  }

  /**
   * Adapt configuration based on message patterns
   */
  private adaptConfiguration(): void {
    if (this.messageHistory.length < 10) {
      return; // Not enough data
    }

    // Calculate message rate
    const timeSpan = this.messageHistory[this.messageHistory.length - 1] - this.messageHistory[0];
    const rate = this.messageHistory.length / (timeSpan / 1000); // messages per second

    // Calculate average size
    const avgSize = this.sizeHistory.reduce((a, b) => a + b, 0) / this.sizeHistory.length;

    // High rate + small messages = more aggressive batching
    if (rate > 100 && avgSize < 1024) {
      this.configure({
        flushTimeout: 5,
        maxMessages: 200,
      });
    }
    // Low rate = less aggressive batching
    else if (rate < 10) {
      this.configure({
        flushTimeout: 2,
        maxMessages: 50,
      });
    }
    // Default configuration
    else {
      this.configure({
        flushTimeout: DEFAULT_FLUSH_TIMEOUT,
        maxMessages: DEFAULT_MAX_MESSAGES,
      });
    }
  }

  /**
   * Public method to estimate size
   */
  private estimateSizePublic(payload: unknown): number {
    if (payload === null || payload === undefined) return 4;
    if (typeof payload === 'string') return payload.length * 2;
    if (typeof payload === 'number' || typeof payload === 'boolean') return 8;
    if (payload instanceof ArrayBuffer) return payload.byteLength;
    if (ArrayBuffer.isView(payload)) return (payload as ArrayBufferView).byteLength;
    try {
      return JSON.stringify(payload).length * 2;
    } catch {
      return 1000;
    }
  }
}

export default MessageBatcher;
