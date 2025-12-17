/**
 * Errors Module Tests
 *
 * Tests for the TypeScript stubs of the AssemblyScript errors module.
 */

import { describe, it, expect } from 'vitest';
import {
  SUCCESS,
  ERR_MEMORY_NOT_INITIALIZED,
  ERR_MEMORY_VALIDATION_FAILED,
  ERR_OUT_OF_MEMORY,
  ERR_INVALID_ADDRESS,
  ERR_MEMORY_ALREADY_INITIALIZED,
  ERR_QUEUE_FULL,
  ERR_QUEUE_EMPTY,
  ERR_QUEUE_OP_FAILED,
  ERR_INVALID_CAPACITY,
  ERR_NO_FREE_SLOTS,
  ERR_INVALID_SLOT_INDEX,
  ERR_SLOT_ALREADY_FREE,
  ERR_SLOT_NOT_ALLOCATED,
  ERR_CAS_FAILED,
  ERR_DEADLOCK,
  ERR_MAX_RETRIES,
  INVALID_SLOT,
  INVALID_ENTRY,
  packResult,
  unpackErrorCode,
  unpackValue,
  isSuccess,
  successResult,
  errorResult,
} from '../../../assembly-stubs/errors';

describe('Errors Module', () => {
  describe('Error Code Constants', () => {
    it('should have SUCCESS as 0', () => {
      expect(SUCCESS).toBe(0);
    });

    it('should have memory errors in 1-99 range', () => {
      expect(ERR_MEMORY_NOT_INITIALIZED).toBe(1);
      expect(ERR_MEMORY_VALIDATION_FAILED).toBe(2);
      expect(ERR_OUT_OF_MEMORY).toBe(3);
      expect(ERR_INVALID_ADDRESS).toBe(4);
      expect(ERR_MEMORY_ALREADY_INITIALIZED).toBe(5);
    });

    it('should have queue errors in 100-199 range', () => {
      expect(ERR_QUEUE_FULL).toBe(100);
      expect(ERR_QUEUE_EMPTY).toBe(101);
      expect(ERR_QUEUE_OP_FAILED).toBe(102);
      expect(ERR_INVALID_CAPACITY).toBe(103);
    });

    it('should have slot errors in 200-299 range', () => {
      expect(ERR_NO_FREE_SLOTS).toBe(200);
      expect(ERR_INVALID_SLOT_INDEX).toBe(201);
      expect(ERR_SLOT_ALREADY_FREE).toBe(202);
      expect(ERR_SLOT_NOT_ALLOCATED).toBe(203);
    });

    it('should have concurrency errors in 300-399 range', () => {
      expect(ERR_CAS_FAILED).toBe(300);
      expect(ERR_DEADLOCK).toBe(301);
      expect(ERR_MAX_RETRIES).toBe(302);
    });
  });

  describe('Special Values', () => {
    it('should have correct INVALID_SLOT', () => {
      expect(INVALID_SLOT).toBe(0xffffffff);
    });

    it('should have correct INVALID_ENTRY', () => {
      expect(INVALID_ENTRY).toBe(BigInt(0));
    });
  });

  describe('packResult / unpackErrorCode / unpackValue', () => {
    it('should pack and unpack error code correctly', () => {
      const result = packResult(ERR_QUEUE_FULL, 0);
      expect(unpackErrorCode(result)).toBe(ERR_QUEUE_FULL);
    });

    it('should pack and unpack value correctly', () => {
      const result = packResult(SUCCESS, 12345);
      expect(unpackValue(result)).toBe(12345);
    });

    it('should pack and unpack both correctly', () => {
      const result = packResult(ERR_INVALID_SLOT_INDEX, 42);
      expect(unpackErrorCode(result)).toBe(ERR_INVALID_SLOT_INDEX);
      expect(unpackValue(result)).toBe(42);
    });

    it('should handle max values', () => {
      const result = packResult(0xffffffff, 0xffffffff);
      expect(unpackErrorCode(result)).toBe(0xffffffff);
      expect(unpackValue(result)).toBe(0xffffffff);
    });
  });

  describe('isSuccess', () => {
    it('should return true for success result', () => {
      const result = packResult(SUCCESS, 100);
      expect(isSuccess(result)).toBe(true);
    });

    it('should return false for error result', () => {
      const result = packResult(ERR_QUEUE_FULL, 0);
      expect(isSuccess(result)).toBe(false);
    });
  });

  describe('successResult', () => {
    it('should create success result with value', () => {
      const result = successResult(42);
      expect(isSuccess(result)).toBe(true);
      expect(unpackValue(result)).toBe(42);
      expect(unpackErrorCode(result)).toBe(SUCCESS);
    });
  });

  describe('errorResult', () => {
    it('should create error result with code', () => {
      const result = errorResult(ERR_QUEUE_EMPTY);
      expect(isSuccess(result)).toBe(false);
      expect(unpackErrorCode(result)).toBe(ERR_QUEUE_EMPTY);
      expect(unpackValue(result)).toBe(0);
    });

    it('should work with all error codes', () => {
      const errorCodes = [
        ERR_MEMORY_NOT_INITIALIZED,
        ERR_QUEUE_FULL,
        ERR_NO_FREE_SLOTS,
        ERR_CAS_FAILED,
      ];

      for (const code of errorCodes) {
        const result = errorResult(code);
        expect(unpackErrorCode(result)).toBe(code);
      }
    });
  });
});
