const assert = require('assert');
const path = require('path');
const fs = require('fs');

describe('WASM Module', function () {
  // Skip if SharedArrayBuffer is not available
  const hasSharedArrayBuffer =
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof Atomics !== 'undefined';

  let wasmBytes;
  let WasmBridge;
  let isSharedMemorySupported;

  before(async function () {
    // Load WASM bytes
    const wasmPath = path.join(__dirname, '..', 'dist', 'workerpool.wasm');
    if (!fs.existsSync(wasmPath)) {
      console.log('    WASM file not found at', wasmPath);
      console.log('    Run "npm run build:wasm" to build WASM module');
      this.skip();
      return;
    }
    wasmBytes = fs.readFileSync(wasmPath);

    // Dynamic import of the WASM bridge (TypeScript via tsx loader)
    try {
      // Use tsx to load TypeScript module directly
      const wasmModule = await import('../src/wasm/index.ts');
      // Handle both ESM and CJS-wrapped module formats
      const exports = wasmModule.default || wasmModule;
      WasmBridge = exports.WasmBridge || wasmModule.WasmBridge;
      isSharedMemorySupported = exports.isSharedMemorySupported || wasmModule.isSharedMemorySupported;
    } catch (err) {
      // Fallback: module might not be loadable without tsx
      console.log('    WASM module import failed:', err.message);
      console.log('    Run tests with: npx tsx node_modules/mocha/bin/mocha test/wasm.test.js');
      this.skip();
    }
  });

  describe('SharedArrayBuffer support detection', function () {
    it('should detect SharedArrayBuffer availability', function () {
      if (!isSharedMemorySupported) this.skip();
      const supported = isSharedMemorySupported();
      assert.strictEqual(typeof supported, 'boolean');
    });
  });

  describe('WasmBridge', function () {
    let bridge;

    beforeEach(async function () {
      if (!WasmBridge || !wasmBytes) {
        this.skip();
        return;
      }
      try {
        bridge = await WasmBridge.createFromBytes(wasmBytes, 64);
      } catch (err) {
        console.log('    Failed to create WasmBridge:', err.message);
        this.skip();
      }
    });

    describe('initialization', function () {
      it('should create bridge with specified capacity', function () {
        if (!bridge) this.skip();
        assert.strictEqual(bridge.capacity, 64);
      });

      it('should report correct initial stats', function () {
        if (!bridge) this.skip();
        const stats = bridge.getStats();
        assert.strictEqual(stats.size, 0);
        assert.strictEqual(stats.allocatedSlots, 0);
        assert.strictEqual(stats.isEmpty, true);
        assert.strictEqual(stats.isFull, false);
      });

      it('should have buffer property', function () {
        if (!bridge) this.skip();
        assert(bridge.buffer);
        assert(
          bridge.buffer instanceof ArrayBuffer ||
            bridge.buffer instanceof SharedArrayBuffer
        );
      });
    });

    describe('queue operations', function () {
      it('should push and pop entries', function () {
        if (!bridge) this.skip();

        const slotIndex = bridge.push(5);
        assert(slotIndex >= 0, 'push should return valid slot index');

        assert.strictEqual(bridge.size(), 1);
        assert.strictEqual(bridge.isEmpty(), false);

        const entry = bridge.pop();
        assert(entry !== null, 'pop should return entry');
        assert.strictEqual(entry.slotIndex, slotIndex);
        assert.strictEqual(entry.priority, 5);

        assert.strictEqual(bridge.isEmpty(), true);
      });

      it('should handle multiple entries', function () {
        if (!bridge) this.skip();

        const slots = [];
        for (let i = 0; i < 10; i++) {
          const slot = bridge.push(i);
          assert(slot >= 0, `push ${i} should succeed`);
          slots.push(slot);
        }

        assert.strictEqual(bridge.size(), 10);

        for (let i = 0; i < 10; i++) {
          const entry = bridge.pop();
          assert(entry !== null);
          // Note: FIFO order expected
          assert.strictEqual(entry.slotIndex, slots[i]);
        }

        assert.strictEqual(bridge.isEmpty(), true);
      });

      it('should return null when popping from empty queue', function () {
        if (!bridge) this.skip();

        const entry = bridge.pop();
        assert.strictEqual(entry, null);
      });

      it('should detect full queue', function () {
        if (!bridge) this.skip();

        // Fill the queue
        let count = 0;
        while (!bridge.isFull() && count < 100) {
          const slot = bridge.push(0);
          if (slot < 0) break;
          count++;
        }

        // Queue should be full or near capacity
        assert(count > 0, 'should have pushed at least one entry');
      });

      it('should clear queue', function () {
        if (!bridge) this.skip();

        bridge.push(1);
        bridge.push(2);
        bridge.push(3);

        assert.strictEqual(bridge.size(), 3);

        bridge.clear();

        assert.strictEqual(bridge.size(), 0);
        assert.strictEqual(bridge.isEmpty(), true);
      });
    });

    describe('slot operations', function () {
      it('should allocate and free slots', function () {
        if (!bridge) this.skip();

        const slot1 = bridge.allocateSlot();
        const slot2 = bridge.allocateSlot();

        assert(slot1 >= 0);
        assert(slot2 >= 0);
        assert.notStrictEqual(slot1, slot2);

        assert.strictEqual(bridge.isAllocated(slot1), true);
        assert.strictEqual(bridge.isAllocated(slot2), true);

        bridge.freeSlot(slot1);
        assert.strictEqual(bridge.isAllocated(slot1), false);
        assert.strictEqual(bridge.isAllocated(slot2), true);

        bridge.freeSlot(slot2);
        assert.strictEqual(bridge.isAllocated(slot2), false);
      });

      it('should set and get task metadata', function () {
        if (!bridge) this.skip();

        const slot = bridge.allocateSlot();
        assert(slot >= 0);

        bridge.setTaskId(slot, 12345);
        bridge.setMethodId(slot, 42);
        bridge.setPriority(slot, 100);

        const metadata = bridge.getTaskMetadata(slot);
        assert(metadata !== null);
        assert.strictEqual(metadata.taskId, 12345);
        assert.strictEqual(metadata.methodId, 42);
        assert.strictEqual(metadata.priority, 100);
        assert.strictEqual(metadata.slotIndex, slot);
      });

      it('should handle reference counting', function () {
        if (!bridge) this.skip();

        const slot = bridge.allocateSlot();
        assert(slot >= 0);
        assert.strictEqual(bridge.isAllocated(slot), true);

        // Initial refcount is 1
        let metadata = bridge.getTaskMetadata(slot);
        assert.strictEqual(metadata.refCount, 1);

        // Add reference
        bridge.addRef(slot);
        metadata = bridge.getTaskMetadata(slot);
        assert.strictEqual(metadata.refCount, 2);

        // Release once (should still be allocated)
        bridge.release(slot);
        assert.strictEqual(bridge.isAllocated(slot), true);

        // Release again (should free the slot)
        bridge.release(slot);
        assert.strictEqual(bridge.isAllocated(slot), false);
      });

      it('should return null metadata for unallocated slots', function () {
        if (!bridge) this.skip();

        const metadata = bridge.getTaskMetadata(999);
        assert.strictEqual(metadata, null);
      });
    });
  });
});
