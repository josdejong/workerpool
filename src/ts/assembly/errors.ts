/**
 * Error Codes for WASM Module
 *
 * Provides standardized error codes that can be returned from WASM functions.
 * Using numeric error codes is more efficient than strings in WASM.
 */

// Success code
/** Operation completed successfully */
export const SUCCESS: u32 = 0;

// Memory errors (1-99)
/** Memory not initialized */
export const ERR_MEMORY_NOT_INITIALIZED: u32 = 1;
/** Memory validation failed */
export const ERR_MEMORY_VALIDATION_FAILED: u32 = 2;
/** Out of memory */
export const ERR_OUT_OF_MEMORY: u32 = 3;
/** Invalid memory address */
export const ERR_INVALID_ADDRESS: u32 = 4;
/** Memory already initialized */
export const ERR_MEMORY_ALREADY_INITIALIZED: u32 = 5;

// Queue errors (100-199)
/** Queue is full */
export const ERR_QUEUE_FULL: u32 = 100;
/** Queue is empty */
export const ERR_QUEUE_EMPTY: u32 = 101;
/** Queue operation failed */
export const ERR_QUEUE_OP_FAILED: u32 = 102;
/** Invalid queue capacity */
export const ERR_INVALID_CAPACITY: u32 = 103;

// Slot errors (200-299)
/** No free slots available */
export const ERR_NO_FREE_SLOTS: u32 = 200;
/** Invalid slot index */
export const ERR_INVALID_SLOT_INDEX: u32 = 201;
/** Slot already freed */
export const ERR_SLOT_ALREADY_FREE: u32 = 202;
/** Slot not allocated */
export const ERR_SLOT_NOT_ALLOCATED: u32 = 203;

// Concurrency errors (300-399)
/** CAS operation failed (expected retry) */
export const ERR_CAS_FAILED: u32 = 300;
/** Deadlock detected */
export const ERR_DEADLOCK: u32 = 301;
/** Max retries exceeded */
export const ERR_MAX_RETRIES: u32 = 302;

// Special values
/** Invalid/null slot index sentinel */
export const INVALID_SLOT: u32 = 0xFFFFFFFF;
/** Invalid/null entry sentinel */
export const INVALID_ENTRY: u64 = 0;

/**
 * Result type for operations that can fail
 * Upper 32 bits: error code (0 = success)
 * Lower 32 bits: value (if success)
 */
export function packResult(errorCode: u32, value: u32): u64 {
  return ((<u64>errorCode) << 32) | <u64>value;
}

/**
 * Unpack error code from result
 */
export function unpackErrorCode(result: u64): u32 {
  return <u32>(result >> 32);
}

/**
 * Unpack value from result
 */
export function unpackValue(result: u64): u32 {
  return <u32>(result & 0xFFFFFFFF);
}

/**
 * Check if result indicates success
 */
export function isSuccess(result: u64): bool {
  return unpackErrorCode(result) == SUCCESS;
}

/**
 * Create success result with value
 */
export function successResult(value: u32): u64 {
  return packResult(SUCCESS, value);
}

/**
 * Create error result
 */
export function errorResult(errorCode: u32): u64 {
  return packResult(errorCode, 0);
}
