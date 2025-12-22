/**
 * Binary Protocol Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAGIC,
  VERSION,
  MSG_TASK_REQUEST,
  MSG_TASK_RESPONSE,
  MSG_TASK_ERROR,
  MSG_HEARTBEAT_REQ,
  MSG_HEARTBEAT_RES,
  MSG_BATCH,
  FLAG_HAS_TRANSFER,
  FLAG_COMPRESSED,
  PRIORITY_LOW,
  PRIORITY_NORMAL,
  PRIORITY_HIGH,
  PRIORITY_CRITICAL,
  ERR_METHOD_NOT_FOUND,
  ERR_TIMEOUT,
  resetSequence,
  nextSequence,
  writeHeader,
  readHeader,
  validateHeader,
  getPayload,
  encodeTaskRequest,
  decodeTaskRequest,
  encodeTaskResponse,
  encodeErrorResponse,
  decodeErrorResponse,
  encodeHeartbeatRequest,
  encodeHeartbeatResponse,
  decodeHeartbeatResponse,
  encodeBatchHeader,
  getMessageType,
  getMessageId,
  getMessagePriority,
  getMessageSequence,
  hasTransferFlag,
  isCompressed,
  getHeaderSize,
  calculateChecksum,
} from '../../../src/ts/assembly/stubs/binary-protocol';

describe('Binary Protocol Constants', () => {
  it('should have correct magic number', () => {
    // 'WP' in ASCII
    expect(MAGIC).toBe(0x5750);
  });

  it('should have correct version', () => {
    expect(VERSION).toBe(2);
  });

  it('should have ordered message types', () => {
    expect(MSG_TASK_REQUEST).toBe(1);
    expect(MSG_TASK_RESPONSE).toBe(2);
    expect(MSG_TASK_ERROR).toBe(3);
    expect(MSG_HEARTBEAT_REQ).toBe(5);
    expect(MSG_HEARTBEAT_RES).toBe(6);
    expect(MSG_BATCH).toBe(10);
  });

  it('should have correct priority values', () => {
    expect(PRIORITY_LOW).toBe(0);
    expect(PRIORITY_NORMAL).toBe(1);
    expect(PRIORITY_HIGH).toBe(2);
    expect(PRIORITY_CRITICAL).toBe(3);
  });
});

describe('Sequence Counter', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should start at 1', () => {
    expect(nextSequence()).toBe(1);
  });

  it('should increment', () => {
    expect(nextSequence()).toBe(1);
    expect(nextSequence()).toBe(2);
    expect(nextSequence()).toBe(3);
  });

  it('should reset', () => {
    nextSequence();
    nextSequence();
    resetSequence();
    expect(nextSequence()).toBe(1);
  });
});

describe('Header', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should have correct size', () => {
    expect(getHeaderSize()).toBe(20);
  });

  it('should write and read header correctly', () => {
    const buffer = new Uint8Array(20);
    writeHeader(buffer, MSG_TASK_REQUEST, 42, 100, FLAG_HAS_TRANSFER, PRIORITY_HIGH);

    const [magic, version, type, flags, id, length, seq, priority] = readHeader(buffer);

    expect(magic).toBe(MAGIC);
    expect(version).toBe(VERSION);
    expect(type).toBe(MSG_TASK_REQUEST);
    expect(flags).toBe(FLAG_HAS_TRANSFER);
    expect(id).toBe(42);
    expect(length).toBe(100);
    expect(seq).toBe(1);
    expect(priority).toBe(PRIORITY_HIGH);
  });

  it('should validate correct header', () => {
    const buffer = new Uint8Array(20);
    writeHeader(buffer, MSG_TASK_REQUEST, 1, 0);

    expect(validateHeader(buffer)).toBe(true);
  });

  it('should reject invalid magic', () => {
    const buffer = new Uint8Array(20);
    writeHeader(buffer, MSG_TASK_REQUEST, 1, 0);
    buffer[0] = 0x00;

    expect(validateHeader(buffer)).toBe(false);
  });

  it('should reject future version', () => {
    const buffer = new Uint8Array(20);
    writeHeader(buffer, MSG_TASK_REQUEST, 1, 0);
    buffer[2] = 99; // Set version to 99

    expect(validateHeader(buffer)).toBe(false);
  });

  it('should reject invalid message type', () => {
    const buffer = new Uint8Array(20);
    writeHeader(buffer, MSG_TASK_REQUEST, 1, 0);
    buffer[3] = 0; // Invalid type

    expect(validateHeader(buffer)).toBe(false);
  });

  it('should reject too small buffer', () => {
    const buffer = new Uint8Array(10);
    expect(validateHeader(buffer)).toBe(false);
  });
});

describe('Task Request Encoding', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should encode task request', () => {
    const params = new Uint8Array([1, 2, 3, 4]);
    const buffer = encodeTaskRequest(42, 'testMethod', params, PRIORITY_NORMAL, false);

    expect(validateHeader(buffer)).toBe(true);
    expect(getMessageType(buffer)).toBe(MSG_TASK_REQUEST);
    expect(getMessageId(buffer)).toBe(42);
    expect(getMessagePriority(buffer)).toBe(PRIORITY_NORMAL);
  });

  it('should decode task request', () => {
    const params = new Uint8Array([1, 2, 3, 4]);
    const buffer = encodeTaskRequest(42, 'testMethod', params, PRIORITY_HIGH, true);

    const decoded = decodeTaskRequest(buffer);

    expect(decoded.id).toBe(42);
    expect(decoded.method).toBe('testMethod');
    expect(decoded.params).toEqual(params);
  });

  it('should handle empty params', () => {
    const params = new Uint8Array(0);
    const buffer = encodeTaskRequest(1, 'noParams', params);

    const decoded = decodeTaskRequest(buffer);

    expect(decoded.params.length).toBe(0);
  });

  it('should set transfer flag', () => {
    const params = new Uint8Array([1]);
    const buffer = encodeTaskRequest(1, 'test', params, PRIORITY_NORMAL, true);

    expect(hasTransferFlag(buffer)).toBe(true);
  });
});

describe('Task Response Encoding', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should encode success response', () => {
    const result = new Uint8Array([42, 43, 44]);
    const buffer = encodeTaskResponse(1, true, result);

    expect(validateHeader(buffer)).toBe(true);
    expect(getMessageType(buffer)).toBe(MSG_TASK_RESPONSE);
    expect(getMessageId(buffer)).toBe(1);
  });

  it('should encode error response type', () => {
    const result = new Uint8Array([0]);
    const buffer = encodeTaskResponse(1, false, result);

    expect(getMessageType(buffer)).toBe(MSG_TASK_ERROR);
  });
});

describe('Error Response Encoding', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should encode error with code and message', () => {
    const buffer = encodeErrorResponse(42, ERR_METHOD_NOT_FOUND, 'Method not found');

    expect(validateHeader(buffer)).toBe(true);
    expect(getMessageType(buffer)).toBe(MSG_TASK_ERROR);
  });

  it('should decode error response', () => {
    const buffer = encodeErrorResponse(42, ERR_TIMEOUT, 'Task timed out', 'Error stack trace');

    const decoded = decodeErrorResponse(buffer);

    expect(decoded.id).toBe(42);
    expect(decoded.errorCode).toBe(ERR_TIMEOUT);
    expect(decoded.message).toBe('Task timed out');
    expect(decoded.stack).toBe('Error stack trace');
  });

  it('should handle empty stack', () => {
    const buffer = encodeErrorResponse(1, ERR_METHOD_NOT_FOUND, 'Error message');

    const decoded = decodeErrorResponse(buffer);

    expect(decoded.stack).toBe('');
  });
});

describe('Heartbeat Encoding', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should encode heartbeat request', () => {
    const buffer = encodeHeartbeatRequest(42, 'worker-1');

    expect(validateHeader(buffer)).toBe(true);
    expect(getMessageType(buffer)).toBe(MSG_HEARTBEAT_REQ);
    expect(getMessageId(buffer)).toBe(42);
    expect(getMessagePriority(buffer)).toBe(PRIORITY_HIGH);
  });

  it('should encode heartbeat response', () => {
    const buffer = encodeHeartbeatResponse(42, 1, 5, BigInt(1024 * 1024), BigInt(60000));

    expect(validateHeader(buffer)).toBe(true);
    expect(getMessageType(buffer)).toBe(MSG_HEARTBEAT_RES);
    expect(getMessagePriority(buffer)).toBe(PRIORITY_HIGH);
  });

  it('should decode heartbeat response', () => {
    const memoryUsage = BigInt(2 * 1024 * 1024);
    const uptime = BigInt(120000);
    const buffer = encodeHeartbeatResponse(42, 2, 10, memoryUsage, uptime);

    const decoded = decodeHeartbeatResponse(buffer);

    expect(decoded.id).toBe(42);
    expect(decoded.status).toBe(2); // busy
    expect(decoded.taskCount).toBe(10);
    expect(decoded.memoryUsage).toBe(memoryUsage);
    expect(decoded.uptime).toBe(uptime);
  });
});

describe('Batch Header Encoding', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should encode batch header', () => {
    const buffer = encodeBatchHeader(42, 'batch-123', 100, 0, 5);

    expect(validateHeader(buffer)).toBe(true);
    expect(getMessageType(buffer)).toBe(MSG_BATCH);
    expect(getMessageId(buffer)).toBe(42);
  });

  it('should handle single chunk batch', () => {
    const buffer = encodeBatchHeader(1, 'single-batch', 10);

    expect(validateHeader(buffer)).toBe(true);
  });
});

describe('Message Helpers', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should get message type', () => {
    const params = new Uint8Array([1]);
    const buffer = encodeTaskRequest(1, 'test', params);

    expect(getMessageType(buffer)).toBe(MSG_TASK_REQUEST);
  });

  it('should get message ID', () => {
    const params = new Uint8Array([1]);
    const buffer = encodeTaskRequest(12345, 'test', params);

    expect(getMessageId(buffer)).toBe(12345);
  });

  it('should get message priority', () => {
    const params = new Uint8Array([1]);
    const buffer = encodeTaskRequest(1, 'test', params, PRIORITY_CRITICAL);

    expect(getMessagePriority(buffer)).toBe(PRIORITY_CRITICAL);
  });

  it('should get message sequence', () => {
    resetSequence();
    const params = new Uint8Array([1]);
    const buffer = encodeTaskRequest(1, 'test', params);

    expect(getMessageSequence(buffer)).toBe(1);
  });

  it('should check compressed flag', () => {
    const buffer = new Uint8Array(20);
    writeHeader(buffer, MSG_TASK_REQUEST, 1, 0, FLAG_COMPRESSED);

    expect(isCompressed(buffer)).toBe(true);
  });

  it('should return defaults for small buffers', () => {
    const buffer = new Uint8Array(5);

    expect(getMessageType(buffer)).toBe(0);
    expect(getMessageId(buffer)).toBe(0);
    expect(getMessagePriority(buffer)).toBe(PRIORITY_NORMAL);
    expect(getMessageSequence(buffer)).toBe(0);
    expect(hasTransferFlag(buffer)).toBe(false);
    expect(isCompressed(buffer)).toBe(false);
  });
});

describe('Payload Extraction', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should extract payload', () => {
    const params = new Uint8Array([10, 20, 30, 40, 50]);
    const buffer = encodeTaskRequest(1, 'test', params);

    const payload = getPayload(buffer);

    // Payload should contain method and params
    expect(payload.length).toBeGreaterThan(0);
  });
});

describe('Checksum', () => {
  it('should calculate consistent checksum', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const checksum1 = calculateChecksum(data, 0, data.length);
    const checksum2 = calculateChecksum(data, 0, data.length);

    expect(checksum1).toBe(checksum2);
  });

  it('should detect changes', () => {
    const data1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const data2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 9]);

    const checksum1 = calculateChecksum(data1, 0, data1.length);
    const checksum2 = calculateChecksum(data2, 0, data2.length);

    expect(checksum1).not.toBe(checksum2);
  });

  it('should handle partial buffer', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const fullChecksum = calculateChecksum(data, 0, data.length);
    const partialChecksum = calculateChecksum(data, 2, 4);

    expect(partialChecksum).not.toBe(fullChecksum);
  });
});

describe('Roundtrip Tests', () => {
  beforeEach(() => {
    resetSequence();
  });

  it('should roundtrip task request', () => {
    const originalParams = new TextEncoder().encode('{"key":"value"}');
    const buffer = encodeTaskRequest(123, 'processData', originalParams, PRIORITY_HIGH, true);

    const decoded = decodeTaskRequest(buffer);

    expect(decoded.id).toBe(123);
    expect(decoded.method).toBe('processData');
    expect(new TextDecoder().decode(decoded.params)).toBe('{"key":"value"}');
    expect(hasTransferFlag(buffer)).toBe(true);
    expect(getMessagePriority(buffer)).toBe(PRIORITY_HIGH);
  });

  it('should roundtrip error response', () => {
    const buffer = encodeErrorResponse(
      456,
      ERR_METHOD_NOT_FOUND,
      'Method "unknown" not found in worker',
      'at Worker.handleMessage (worker.js:42)\n    at process.emit (node:events:517:28)'
    );

    const decoded = decodeErrorResponse(buffer);

    expect(decoded.id).toBe(456);
    expect(decoded.errorCode).toBe(ERR_METHOD_NOT_FOUND);
    expect(decoded.message).toBe('Method "unknown" not found in worker');
    expect(decoded.stack).toContain('worker.js:42');
  });

  it('should roundtrip heartbeat', () => {
    const memoryUsage = BigInt(256 * 1024 * 1024);
    const uptime = BigInt(3600000);
    const buffer = encodeHeartbeatResponse(789, 1, 15, memoryUsage, uptime);

    const decoded = decodeHeartbeatResponse(buffer);

    expect(decoded.id).toBe(789);
    expect(decoded.status).toBe(1);
    expect(decoded.taskCount).toBe(15);
    expect(decoded.memoryUsage).toBe(memoryUsage);
    expect(decoded.uptime).toBe(uptime);
  });
});
