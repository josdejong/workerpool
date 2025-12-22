/**
 * Messages Protocol Tests
 */

import { describe, it, expect } from 'vitest';
import {
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  MessagePriority,
  TERMINATE_METHOD_ID,
  CLEANUP_METHOD_ID,
  HEARTBEAT_METHOD_ID,
  isTaskRequest,
  isCleanupRequest,
  isTaskSuccessResponse,
  isTaskErrorResponse,
  isWorkerEvent,
  isCleanupResponse,
  isHeartbeatRequest,
  isHeartbeatResponse,
  createMessage,
  isValidProtocolVersion,
  getMessagePriority,
  compareByPriority,
  type TaskRequest,
  type HeartbeatRequest,
  type HeartbeatResponse,
  type TaskSuccessResponse,
  type MessageHeader,
} from '../../src/ts/types/messages';

describe('Protocol Constants', () => {
  it('should have correct protocol version', () => {
    expect(PROTOCOL_VERSION).toBe(2);
    expect(MIN_PROTOCOL_VERSION).toBe(1);
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(MIN_PROTOCOL_VERSION);
  });

  it('should have correct method IDs', () => {
    expect(TERMINATE_METHOD_ID).toBe('__workerpool-terminate__');
    expect(CLEANUP_METHOD_ID).toBe('__workerpool-cleanup__');
    expect(HEARTBEAT_METHOD_ID).toBe('__workerpool-heartbeat__');
  });
});

describe('MessagePriority', () => {
  it('should have correct priority values', () => {
    expect(MessagePriority.LOW).toBe(0);
    expect(MessagePriority.NORMAL).toBe(1);
    expect(MessagePriority.HIGH).toBe(2);
    expect(MessagePriority.CRITICAL).toBe(3);
  });

  it('should be ordered correctly', () => {
    expect(MessagePriority.LOW).toBeLessThan(MessagePriority.NORMAL);
    expect(MessagePriority.NORMAL).toBeLessThan(MessagePriority.HIGH);
    expect(MessagePriority.HIGH).toBeLessThan(MessagePriority.CRITICAL);
  });
});

describe('Type Guards', () => {
  describe('isTaskRequest', () => {
    it('should identify valid task requests', () => {
      const request: TaskRequest = {
        id: 1,
        method: 'test',
        params: [1, 2, 3],
      };
      expect(isTaskRequest(request)).toBe(true);
    });

    it('should reject invalid objects', () => {
      expect(isTaskRequest(null)).toBe(false);
      expect(isTaskRequest(undefined)).toBe(false);
      expect(isTaskRequest({})).toBe(false);
      expect(isTaskRequest({ id: 1 })).toBe(false);
      expect(isTaskRequest({ method: 'test' })).toBe(false);
    });
  });

  describe('isCleanupRequest', () => {
    it('should identify cleanup requests', () => {
      const request = {
        id: 1,
        method: CLEANUP_METHOD_ID,
      };
      expect(isCleanupRequest(request)).toBe(true);
    });

    it('should reject non-cleanup requests', () => {
      expect(isCleanupRequest({ id: 1, method: 'other' })).toBe(false);
    });
  });

  describe('isHeartbeatRequest', () => {
    it('should identify heartbeat requests', () => {
      const request: HeartbeatRequest = {
        id: 1,
        method: HEARTBEAT_METHOD_ID,
        workerId: 'worker-1',
      };
      expect(isHeartbeatRequest(request)).toBe(true);
    });

    it('should reject non-heartbeat requests', () => {
      expect(isHeartbeatRequest({ id: 1, method: 'other' })).toBe(false);
    });
  });

  describe('isHeartbeatResponse', () => {
    it('should identify heartbeat responses', () => {
      const response: HeartbeatResponse = {
        id: 1,
        method: HEARTBEAT_METHOD_ID,
        status: 'alive',
        taskCount: 5,
      };
      expect(isHeartbeatResponse(response)).toBe(true);
    });

    it('should reject responses without status', () => {
      expect(isHeartbeatResponse({ id: 1, method: HEARTBEAT_METHOD_ID })).toBe(false);
    });
  });

  describe('isTaskSuccessResponse', () => {
    it('should identify success responses', () => {
      const response: TaskSuccessResponse = {
        id: 1,
        result: 'test',
        error: null,
      };
      expect(isTaskSuccessResponse(response)).toBe(true);
    });
  });

  describe('isTaskErrorResponse', () => {
    it('should identify error responses', () => {
      const response = {
        id: 1,
        result: null,
        error: { name: 'Error', message: 'test' },
      };
      expect(isTaskErrorResponse(response)).toBe(true);
    });

    it('should reject responses without error', () => {
      expect(isTaskErrorResponse({ id: 1, result: null, error: null })).toBe(false);
    });
  });

  describe('isWorkerEvent', () => {
    it('should identify worker events', () => {
      const event = {
        id: 1,
        isEvent: true,
        payload: { data: 'test' },
      };
      expect(isWorkerEvent(event)).toBe(true);
    });

    it('should reject non-events', () => {
      expect(isWorkerEvent({ id: 1, isEvent: false })).toBe(false);
    });
  });

  describe('isCleanupResponse', () => {
    it('should identify cleanup responses', () => {
      const response = {
        id: 1,
        method: CLEANUP_METHOD_ID,
        error: null,
      };
      expect(isCleanupResponse(response)).toBe(true);
    });
  });
});

describe('Protocol Helpers', () => {
  describe('createMessage', () => {
    it('should create message with protocol version', () => {
      const msg = createMessage<TaskRequest>({
        id: 1,
        method: 'test',
        params: [],
      } as any);

      expect(msg.v).toBe(PROTOCOL_VERSION);
      expect(msg.id).toBe(1);
      expect(msg.method).toBe('test');
    });

    it('should add priority when specified', () => {
      const msg = createMessage<TaskRequest>(
        {
          id: 1,
          method: 'test',
          params: [],
        } as any,
        { priority: MessagePriority.HIGH }
      );

      expect(msg.priority).toBe(MessagePriority.HIGH);
    });

    it('should add timestamp when specified', () => {
      const before = Date.now();
      const msg = createMessage<TaskRequest>(
        {
          id: 1,
          method: 'test',
          params: [],
        } as any,
        { includeTimestamp: true }
      );
      const after = Date.now();

      expect(msg.ts).toBeGreaterThanOrEqual(before);
      expect(msg.ts).toBeLessThanOrEqual(after);
    });
  });

  describe('isValidProtocolVersion', () => {
    it('should accept valid versions', () => {
      expect(isValidProtocolVersion({ v: 1 })).toBe(true);
      expect(isValidProtocolVersion({ v: 2 })).toBe(true);
    });

    it('should accept messages without version (v1 default)', () => {
      expect(isValidProtocolVersion({})).toBe(true);
    });

    it('should reject future versions', () => {
      expect(isValidProtocolVersion({ v: 99 })).toBe(false);
    });
  });

  describe('getMessagePriority', () => {
    it('should return message priority', () => {
      expect(getMessagePriority({ priority: MessagePriority.HIGH })).toBe(MessagePriority.HIGH);
    });

    it('should default to NORMAL', () => {
      expect(getMessagePriority({})).toBe(MessagePriority.NORMAL);
    });
  });

  describe('compareByPriority', () => {
    it('should sort by priority (higher first)', () => {
      const messages: MessageHeader[] = [
        { priority: MessagePriority.LOW },
        { priority: MessagePriority.CRITICAL },
        { priority: MessagePriority.NORMAL },
        { priority: MessagePriority.HIGH },
      ];

      const sorted = [...messages].sort(compareByPriority);

      expect(sorted[0].priority).toBe(MessagePriority.CRITICAL);
      expect(sorted[1].priority).toBe(MessagePriority.HIGH);
      expect(sorted[2].priority).toBe(MessagePriority.NORMAL);
      expect(sorted[3].priority).toBe(MessagePriority.LOW);
    });
  });
});

describe('Message Header', () => {
  it('should support optional fields', () => {
    const msg: MessageHeader = {
      v: 2,
      seq: 1,
      ack: 0,
      priority: MessagePriority.NORMAL,
      ts: Date.now(),
    };

    expect(msg.v).toBe(2);
    expect(msg.seq).toBe(1);
    expect(msg.ack).toBe(0);
    expect(msg.priority).toBe(MessagePriority.NORMAL);
    expect(typeof msg.ts).toBe('number');
  });
});
