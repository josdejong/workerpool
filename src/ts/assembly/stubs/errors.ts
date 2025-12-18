/**
 * Error Codes Stubs for TypeScript Testing
 *
 * Provides the same error codes as the AssemblyScript module.
 */

// Success code
export const SUCCESS = 0;

// Memory errors (1-99)
export const ERR_MEMORY_NOT_INITIALIZED = 1;
export const ERR_MEMORY_VALIDATION_FAILED = 2;
export const ERR_OUT_OF_MEMORY = 3;
export const ERR_INVALID_ADDRESS = 4;
export const ERR_MEMORY_ALREADY_INITIALIZED = 5;

// Queue errors (100-199)
export const ERR_QUEUE_FULL = 100;
export const ERR_QUEUE_EMPTY = 101;
export const ERR_QUEUE_OP_FAILED = 102;
export const ERR_INVALID_CAPACITY = 103;

// Slot errors (200-299)
export const ERR_NO_FREE_SLOTS = 200;
export const ERR_INVALID_SLOT_INDEX = 201;
export const ERR_SLOT_ALREADY_FREE = 202;
export const ERR_SLOT_NOT_ALLOCATED = 203;

// Concurrency errors (300-399)
export const ERR_CAS_FAILED = 300;
export const ERR_DEADLOCK = 301;
export const ERR_MAX_RETRIES = 302;

// Special values
export const INVALID_SLOT = 0xffffffff;
export const INVALID_ENTRY = BigInt(0);

/**
 * Pack error code and value into a single bigint result
 */
export function packResult(errorCode: number, value: number): bigint {
  return (BigInt(errorCode) << BigInt(32)) | BigInt(value);
}

/**
 * Unpack error code from result
 */
export function unpackErrorCode(result: bigint): number {
  return Number(result >> BigInt(32));
}

/**
 * Unpack value from result
 */
export function unpackValue(result: bigint): number {
  return Number(result & BigInt(0xffffffff));
}

/**
 * Check if result indicates success
 */
export function isSuccess(result: bigint): boolean {
  return unpackErrorCode(result) === SUCCESS;
}

/**
 * Create success result with value
 */
export function successResult(value: number): bigint {
  return packResult(SUCCESS, value);
}

/**
 * Create error result
 */
export function errorResult(errorCode: number): bigint {
  return packResult(errorCode, 0);
}
