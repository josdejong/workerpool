#!/usr/bin/env node
/**
 * WASM Validation Script
 *
 * Validates the compiled WASM module and checks for required exports.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

// Required exports that should be present in the WASM module
const REQUIRED_EXPORTS = [
  // Memory management
  'initMemory',
  'validateMemory',
  'getCapacity',
  'getMask',
  'getSlotsBase',
  'calculateMemorySize',

  // Ring buffer operations
  'push',
  'pop',
  'size',
  'isEmpty',
  'isFull',
  'clear',
  'packEntry',
  'unpackSlotIndex',
  'unpackPriority',

  // Task slot operations
  'initTaskSlots',
  'allocateSlot',
  'freeSlot',
  'setTaskId',
  'getTaskId',
  'setPriority',
  'getPriority',
  'setTimestamp',
  'getTimestamp',
  'setMethodId',
  'getMethodId',
  'addRef',
  'release',
  'getRefCount',
  'getAllocatedCount',
  'isAllocated',
];

// Optional exports (nice to have)
const OPTIONAL_EXPORTS = [
  // Priority queue
  'initPriorityQueue',
  'priorityQueuePush',
  'priorityQueuePop',
  'priorityQueuePeek',
  'getPriorityQueueSize',
  'isPriorityQueueEmpty',
  'isPriorityQueueFull',
  'priorityQueueClear',

  // Statistics
  'initStats',
  'recordPush',
  'recordPop',
  'getPushCount',
  'getPopCount',
  'getPeakSize',
  'resetStats',

  // Atomics
  'tryLock',
  'acquireLock',
  'releaseLock',
  'memoryFence',
];

/**
 * Check if WASM file exists
 */
function checkWasmFile(filename) {
  const filepath = path.join(DIST_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return { exists: false, filepath, size: 0 };
  }
  const stats = fs.statSync(filepath);
  return { exists: true, filepath, size: stats.size };
}

/**
 * Load and validate WASM module
 */
async function validateWasmModule(wasmPath) {
  const wasmBuffer = fs.readFileSync(wasmPath);

  // Check if SharedArrayBuffer is available
  const hasSharedMemory = typeof SharedArrayBuffer !== 'undefined';

  // Create a minimal memory for instantiation
  // WASM was compiled with shared memory support, so we need to use shared memory
  const memory = new WebAssembly.Memory({
    initial: 16,
    maximum: 256,
    shared: hasSharedMemory, // Use shared memory if available
  });

  // Prepare imports
  const imports = {
    env: {
      memory,
      abort: () => {
        throw new Error('WASM abort called');
      },
    },
  };

  try {
    const module = await WebAssembly.compile(wasmBuffer);
    const instance = await WebAssembly.instantiate(module, imports);
    return {
      valid: true,
      exports: Object.keys(instance.exports),
      module,
      instance,
    };
  } catch (err) {
    return {
      valid: false,
      error: err.message,
      exports: [],
    };
  }
}

/**
 * Main validation function
 */
async function main() {
  console.log('WASM Module Validation');
  console.log('======================\n');

  let hasErrors = false;
  let hasWarnings = false;

  // Check for WASM files
  console.log('Checking WASM files...\n');

  const releaseWasm = checkWasmFile('workerpool.wasm');
  const debugWasm = checkWasmFile('workerpool.debug.wasm');
  const esmWasm = checkWasmFile('workerpool.esm.wasm');

  const wasmFiles = [
    { name: 'Release WASM', ...releaseWasm },
    { name: 'Debug WASM', ...debugWasm },
    { name: 'ESM WASM', ...esmWasm },
  ];

  for (const file of wasmFiles) {
    if (file.exists) {
      console.log(`✓ ${file.name}: ${file.filepath} (${(file.size / 1024).toFixed(2)} KB)`);
    } else {
      console.log(`✗ ${file.name}: NOT FOUND at ${file.filepath}`);
      if (file.name === 'Release WASM') {
        hasErrors = true;
      }
    }
  }

  // Validate the release WASM if it exists
  if (releaseWasm.exists) {
    console.log('\nValidating Release WASM...\n');

    const validation = await validateWasmModule(releaseWasm.filepath);

    if (!validation.valid) {
      console.log(`✗ WASM module failed to load: ${validation.error}`);
      hasErrors = true;
    } else {
      console.log(`✓ WASM module loaded successfully`);
      console.log(`  Found ${validation.exports.length} exports\n`);

      // Check required exports
      console.log('Checking required exports...\n');
      const missingRequired = [];
      const foundRequired = [];

      for (const exp of REQUIRED_EXPORTS) {
        if (validation.exports.includes(exp)) {
          foundRequired.push(exp);
        } else {
          missingRequired.push(exp);
        }
      }

      console.log(`  Found ${foundRequired.length}/${REQUIRED_EXPORTS.length} required exports`);

      if (missingRequired.length > 0) {
        console.log(`\n✗ Missing required exports:`);
        for (const exp of missingRequired) {
          console.log(`    - ${exp}`);
        }
        hasErrors = true;
      }

      // Check optional exports
      console.log('\nChecking optional exports...\n');
      const foundOptional = [];

      for (const exp of OPTIONAL_EXPORTS) {
        if (validation.exports.includes(exp)) {
          foundOptional.push(exp);
        }
      }

      console.log(`  Found ${foundOptional.length}/${OPTIONAL_EXPORTS.length} optional exports`);

      // List any extra exports not in our lists
      const allKnown = [...REQUIRED_EXPORTS, ...OPTIONAL_EXPORTS, 'memory', '_initialize'];
      const extraExports = validation.exports.filter(e => !allKnown.includes(e));

      if (extraExports.length > 0) {
        console.log(`\nℹ Additional exports found:`);
        for (const exp of extraExports.slice(0, 20)) {
          console.log(`    + ${exp}`);
        }
        if (extraExports.length > 20) {
          console.log(`    ... and ${extraExports.length - 20} more`);
        }
      }

      // Quick functional test
      console.log('\nRunning quick functional test...\n');

      try {
        const { exports } = validation.instance;

        // Initialize memory
        if (typeof exports.initMemory === 'function') {
          exports.initMemory(64);
          console.log('✓ initMemory(64) succeeded');
        }

        // Initialize task slots
        if (typeof exports.initTaskSlots === 'function') {
          exports.initTaskSlots();
          console.log('✓ initTaskSlots() succeeded');
        }

        // Test allocation
        if (typeof exports.allocateSlot === 'function') {
          const slot = exports.allocateSlot();
          if (slot !== 0xFFFFFFFF) {
            console.log(`✓ allocateSlot() returned slot ${slot}`);

            // Test setting task ID
            if (typeof exports.setTaskId === 'function') {
              exports.setTaskId(slot, 12345);
              const taskId = exports.getTaskId(slot);
              if (taskId === 12345) {
                console.log('✓ setTaskId/getTaskId works correctly');
              } else {
                console.log(`✗ getTaskId returned ${taskId}, expected 12345`);
                hasWarnings = true;
              }
            }

            // Free the slot
            if (typeof exports.freeSlot === 'function') {
              exports.freeSlot(slot);
              console.log('✓ freeSlot() succeeded');
            }
          } else {
            console.log('✗ allocateSlot() returned invalid slot');
            hasWarnings = true;
          }
        }

        // Test push/pop
        if (typeof exports.push === 'function' && typeof exports.pop === 'function') {
          const slot2 = exports.allocateSlot();
          if (slot2 !== 0xFFFFFFFF) {
            const pushed = exports.push(slot2, 5);
            if (pushed) {
              console.log(`✓ push(${slot2}, 5) succeeded`);

              const entry = exports.pop();
              if (entry !== 0n) {
                console.log('✓ pop() returned an entry');
              } else {
                console.log('✗ pop() returned empty');
                hasWarnings = true;
              }
            } else {
              console.log('✗ push() failed');
              hasWarnings = true;
            }
            exports.freeSlot(slot2);
          }
        }

      } catch (err) {
        console.log(`✗ Functional test error: ${err.message}`);
        hasWarnings = true;
      }
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(50));

  if (hasErrors) {
    console.log('\n❌ VALIDATION FAILED - See errors above');
    process.exit(1);
  } else if (hasWarnings) {
    console.log('\n⚠️  VALIDATION PASSED WITH WARNINGS');
    process.exit(0);
  } else {
    console.log('\n✅ VALIDATION PASSED');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Validation error:', err);
  process.exit(1);
});
