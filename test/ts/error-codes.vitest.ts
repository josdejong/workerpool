/**
 * Error Codes Tests
 */

import { describe, it, expect } from 'vitest';
import {
  WorkerErrorCode,
  ProtocolErrorCode,
  TaskErrorCode,
  ResourceErrorCode,
  CommunicationErrorCode,
  getErrorMessage,
  isWorkerError,
  isProtocolError,
  isTaskError,
  isResourceError,
  isCommunicationError,
  getErrorCategory,
  isRetryableError,
  isFatalError,
  ErrorMessages,
} from '../../src/ts/types/error-codes';

describe('Error Codes', () => {
  describe('WorkerErrorCode', () => {
    it('should have correct values in 1xxx range', () => {
      expect(WorkerErrorCode.WORKER_CRASHED).toBe(1001);
      expect(WorkerErrorCode.WORKER_INIT_FAILED).toBe(1002);
      expect(WorkerErrorCode.WORKER_UNRESPONSIVE).toBe(1003);
      expect(WorkerErrorCode.WORKER_TERMINATED).toBe(1004);
      expect(WorkerErrorCode.NO_WORKERS_AVAILABLE).toBe(1005);
      expect(WorkerErrorCode.POOL_TERMINATED).toBe(1006);
      expect(WorkerErrorCode.POOL_QUEUE_FULL).toBe(1007);
      expect(WorkerErrorCode.WORKER_SPAWN_FAILED).toBe(1008);
      expect(WorkerErrorCode.WORKER_TYPE_UNSUPPORTED).toBe(1009);
    });
  });

  describe('ProtocolErrorCode', () => {
    it('should have correct values in 2xxx range', () => {
      expect(ProtocolErrorCode.INVALID_MESSAGE).toBe(2001);
      expect(ProtocolErrorCode.UNKNOWN_MESSAGE_TYPE).toBe(2002);
      expect(ProtocolErrorCode.VERSION_MISMATCH).toBe(2003);
      expect(ProtocolErrorCode.MESSAGE_TOO_LARGE).toBe(2004);
      expect(ProtocolErrorCode.SERIALIZATION_FAILED).toBe(2005);
      expect(ProtocolErrorCode.DESERIALIZATION_FAILED).toBe(2006);
      expect(ProtocolErrorCode.MISSING_FIELD).toBe(2007);
      expect(ProtocolErrorCode.INVALID_MESSAGE_ID).toBe(2008);
      expect(ProtocolErrorCode.DUPLICATE_MESSAGE_ID).toBe(2009);
      expect(ProtocolErrorCode.SEQUENCE_ERROR).toBe(2010);
    });
  });

  describe('TaskErrorCode', () => {
    it('should have correct values in 3xxx range', () => {
      expect(TaskErrorCode.METHOD_NOT_FOUND).toBe(3001);
      expect(TaskErrorCode.INVALID_PARAMS).toBe(3002);
      expect(TaskErrorCode.EXECUTION_FAILED).toBe(3003);
      expect(TaskErrorCode.CANCELLED).toBe(3004);
      expect(TaskErrorCode.TIMEOUT).toBe(3005);
      expect(TaskErrorCode.REJECTED).toBe(3006);
      expect(TaskErrorCode.FUNCTION_SERIALIZE_FAILED).toBe(3007);
      expect(TaskErrorCode.FUNCTION_DESERIALIZE_FAILED).toBe(3008);
      expect(TaskErrorCode.ABORTED).toBe(3009);
      expect(TaskErrorCode.INTERNAL_ERROR).toBe(3010);
    });
  });

  describe('ResourceErrorCode', () => {
    it('should have correct values in 4xxx range', () => {
      expect(ResourceErrorCode.OUT_OF_MEMORY).toBe(4001);
      expect(ResourceErrorCode.SAB_UNAVAILABLE).toBe(4002);
      expect(ResourceErrorCode.ATOMICS_UNAVAILABLE).toBe(4003);
      expect(ResourceErrorCode.WASM_UNSUPPORTED).toBe(4004);
      expect(ResourceErrorCode.TRANSFER_FAILED).toBe(4005);
      expect(ResourceErrorCode.BUFFER_OVERFLOW).toBe(4006);
      expect(ResourceErrorCode.LIMIT_EXCEEDED).toBe(4007);
      expect(ResourceErrorCode.SECURE_CONTEXT_REQUIRED).toBe(4008);
    });
  });

  describe('CommunicationErrorCode', () => {
    it('should have correct values in 5xxx range', () => {
      expect(CommunicationErrorCode.CONNECTION_FAILED).toBe(5001);
      expect(CommunicationErrorCode.CONNECTION_LOST).toBe(5002);
      expect(CommunicationErrorCode.SEND_FAILED).toBe(5003);
      expect(CommunicationErrorCode.RECEIVE_FAILED).toBe(5004);
      expect(CommunicationErrorCode.CHANNEL_CLOSED).toBe(5005);
      expect(CommunicationErrorCode.IPC_ERROR).toBe(5006);
      expect(CommunicationErrorCode.BACKPRESSURE_EXCEEDED).toBe(5007);
    });
  });

  describe('getErrorMessage', () => {
    it('should return correct messages for error codes', () => {
      expect(getErrorMessage(WorkerErrorCode.WORKER_CRASHED)).toBe('Worker process crashed unexpectedly');
      expect(getErrorMessage(TaskErrorCode.TIMEOUT)).toBe('Task timed out');
      expect(getErrorMessage(CommunicationErrorCode.CHANNEL_CLOSED)).toBe('Channel is closed');
    });

    it('should return unknown message for invalid codes', () => {
      expect(getErrorMessage(9999 as any)).toContain('Unknown error');
    });
  });

  describe('error category detection', () => {
    it('should correctly identify worker errors', () => {
      expect(isWorkerError(1001)).toBe(true);
      expect(isWorkerError(1999)).toBe(true);
      expect(isWorkerError(2001)).toBe(false);
    });

    it('should correctly identify protocol errors', () => {
      expect(isProtocolError(2001)).toBe(true);
      expect(isProtocolError(2999)).toBe(true);
      expect(isProtocolError(3001)).toBe(false);
    });

    it('should correctly identify task errors', () => {
      expect(isTaskError(3001)).toBe(true);
      expect(isTaskError(3999)).toBe(true);
      expect(isTaskError(4001)).toBe(false);
    });

    it('should correctly identify resource errors', () => {
      expect(isResourceError(4001)).toBe(true);
      expect(isResourceError(4999)).toBe(true);
      expect(isResourceError(5001)).toBe(false);
    });

    it('should correctly identify communication errors', () => {
      expect(isCommunicationError(5001)).toBe(true);
      expect(isCommunicationError(5999)).toBe(true);
      expect(isCommunicationError(1001)).toBe(false);
    });
  });

  describe('getErrorCategory', () => {
    it('should return correct category names', () => {
      expect(getErrorCategory(1001)).toBe('Worker');
      expect(getErrorCategory(2001)).toBe('Protocol');
      expect(getErrorCategory(3001)).toBe('Task');
      expect(getErrorCategory(4001)).toBe('Resource');
      expect(getErrorCategory(5001)).toBe('Communication');
      expect(getErrorCategory(9999)).toBe('Unknown');
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      expect(isRetryableError(WorkerErrorCode.WORKER_CRASHED)).toBe(true);
      expect(isRetryableError(WorkerErrorCode.WORKER_UNRESPONSIVE)).toBe(true);
      expect(isRetryableError(TaskErrorCode.TIMEOUT)).toBe(true);
      expect(isRetryableError(CommunicationErrorCode.CONNECTION_LOST)).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      expect(isRetryableError(TaskErrorCode.METHOD_NOT_FOUND)).toBe(false);
      expect(isRetryableError(TaskErrorCode.INVALID_PARAMS)).toBe(false);
      expect(isRetryableError(WorkerErrorCode.POOL_TERMINATED)).toBe(false);
    });
  });

  describe('isFatalError', () => {
    it('should identify fatal errors', () => {
      expect(isFatalError(WorkerErrorCode.POOL_TERMINATED)).toBe(true);
      expect(isFatalError(ResourceErrorCode.OUT_OF_MEMORY)).toBe(true);
      expect(isFatalError(ResourceErrorCode.SAB_UNAVAILABLE)).toBe(true);
    });

    it('should identify non-fatal errors', () => {
      expect(isFatalError(WorkerErrorCode.WORKER_CRASHED)).toBe(false);
      expect(isFatalError(TaskErrorCode.TIMEOUT)).toBe(false);
    });
  });

  describe('ErrorMessages', () => {
    it('should have messages for all error codes', () => {
      const allCodes = [
        ...Object.values(WorkerErrorCode),
        ...Object.values(ProtocolErrorCode),
        ...Object.values(TaskErrorCode),
        ...Object.values(ResourceErrorCode),
        ...Object.values(CommunicationErrorCode),
      ].filter((v) => typeof v === 'number');

      for (const code of allCodes) {
        expect(ErrorMessages[code as keyof typeof ErrorMessages]).toBeDefined();
        expect(typeof ErrorMessages[code as keyof typeof ErrorMessages]).toBe('string');
      }
    });
  });
});
