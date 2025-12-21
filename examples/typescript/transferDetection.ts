/**
 * Transfer Detection Example (TypeScript)
 *
 * Demonstrates automatic transferable object detection:
 * - isTransferable: Check if a value can be transferred
 * - detectTransferables: Find all transferables in an object
 * - getTransferableType: Get the type of transferable
 * - validateTransferables: Validate a transfer list
 *
 * Run with: npx tsx examples/typescript/transferDetection.ts
 */

import {
  pool,
  isTransferable,
  detectTransferables,
  getTransferableType,
  validateTransferables,
  transferFloat32,
  transferInt32,
  transferUint8,
  transferArrayBuffer,
  type TransferableType,
} from '../../dist/ts/full.js';

interface DetectionResult {
  transferables: ArrayBuffer[];
  totalBytes: number;
}

interface ValidationResult {
  isValid: boolean;
  totalBytes?: number;
  errors?: string[];
}

interface ProcessResult {
  processed: boolean;
  pixelCount: number;
}

async function main(): Promise<void> {
  console.log('Transfer Detection Example (TypeScript)\n');
  console.log('='.repeat(50));

  // ============================================================
  // Example 1: Check if values are transferable
  // ============================================================
  console.log('\n1. isTransferable checks\n');

  const arrayBuffer = new ArrayBuffer(1024);
  console.log('  ArrayBuffer:', isTransferable(arrayBuffer));

  const float32 = new Float32Array(100);
  console.log('  Float32Array:', isTransferable(float32));

  const regularArray = [1, 2, 3];
  console.log('  Regular array:', isTransferable(regularArray));

  const str = 'hello';
  console.log('  String:', isTransferable(str));

  const obj = { a: 1, b: 2 };
  console.log('  Plain object:', isTransferable(obj));

  console.log('  MessagePort: (only in worker context)');

  // ============================================================
  // Example 2: Detect transferables in nested objects
  // ============================================================
  console.log('\n2. detectTransferables (nested objects)\n');

  interface ComplexData {
    name: string;
    buffers: {
      positions: ArrayBuffer;
      colors: ArrayBuffer;
    };
    metadata: {
      count: number;
      type: string;
    };
    rawBuffer: ArrayBuffer;
  }

  const complexData: ComplexData = {
    name: 'data-package',
    buffers: {
      positions: new Float32Array([1, 2, 3, 4, 5]).buffer,
      colors: new Uint8Array([255, 0, 0, 255]).buffer,
    },
    metadata: {
      count: 5,
      type: 'mesh',
    },
    rawBuffer: new ArrayBuffer(512),
  };

  const detected: DetectionResult = detectTransferables(complexData);
  console.log('  Input: complex object with nested buffers');
  console.log('  Detected transferables:', detected.transferables.length);
  console.log('  Total bytes:', detected.totalBytes);

  detected.transferables.forEach((t, i) => {
    console.log(`    ${i + 1}. ${t.constructor.name} (${t.byteLength} bytes)`);
  });

  // ============================================================
  // Example 3: Get transferable type
  // ============================================================
  console.log('\n3. getTransferableType\n');

  const testValues: unknown[] = [
    new ArrayBuffer(100),
    new Float64Array(10),
    new Uint8Array(50),
    new Int32Array(25),
    new DataView(new ArrayBuffer(16)),
    { notTransferable: true },
    'string',
    42,
  ];

  for (const value of testValues) {
    const type: TransferableType | null = getTransferableType(value);
    const name = (value as object)?.constructor?.name || typeof value;
    console.log(`  ${name}: ${type || 'null (not transferable)'}`);
  }

  // ============================================================
  // Example 4: Validate transfer list
  // ============================================================
  console.log('\n4. validateTransferables\n');

  const validList: ArrayBuffer[] = [
    new ArrayBuffer(100),
    new ArrayBuffer(200),
  ];

  const validation1: ValidationResult = validateTransferables(validList);
  console.log('  Valid list:');
  console.log('    isValid:', validation1.isValid);
  console.log('    totalBytes:', validation1.totalBytes);

  const invalidList: unknown[] = [
    new ArrayBuffer(100),
    { notTransferable: true },
  ];

  const validation2: ValidationResult = validateTransferables(invalidList as ArrayBuffer[]);
  console.log('  Invalid list (contains object):');
  console.log('    isValid:', validation2.isValid);
  console.log('    errors:', validation2.errors);

  // ============================================================
  // Example 5: Using with workerpool.exec()
  // ============================================================
  console.log('\n5. Using transfer detection with exec()\n');

  const p = pool({ maxWorkers: 2 });

  interface ImageData {
    width: number;
    height: number;
    pixels: Uint8Array;
  }

  const imageData: ImageData = {
    width: 100,
    height: 100,
    pixels: new Uint8Array(100 * 100 * 4),
  };

  for (let i = 0; i < imageData.pixels.length; i += 4) {
    imageData.pixels[i] = 255;
    imageData.pixels[i + 1] = 128;
    imageData.pixels[i + 2] = 64;
    imageData.pixels[i + 3] = 255;
  }

  const { transferables } = detectTransferables(imageData);
  console.log('  Detected', transferables.length, 'transferable(s)');

  const result: ProcessResult = await p.exec(
    (data: ImageData): ProcessResult => {
      return {
        processed: true,
        pixelCount: data.pixels.length / 4,
      };
    },
    [imageData],
    { transfer: transferables }
  );

  console.log('  Result:', JSON.stringify(result));
  console.log('  Original buffer detached:', imageData.pixels.buffer.byteLength === 0);

  await p.terminate();

  // ============================================================
  // Example 6: Transfer helpers
  // ============================================================
  console.log('\n6. Transfer helper functions\n');

  const floatData = transferFloat32([1.5, 2.5, 3.5, 4.5]);
  console.log('  transferFloat32 created:', floatData.data.constructor.name);

  const intData = transferInt32([1, 2, 3, 4]);
  console.log('  transferInt32 created:', intData.data.constructor.name);

  const uint8Data = transferUint8([0, 128, 255]);
  console.log('  transferUint8 created:', uint8Data.data.constructor.name);

  const rawBuffer = new ArrayBuffer(1024);
  const bufferTransfer = transferArrayBuffer(rawBuffer);
  console.log('  transferArrayBuffer:', bufferTransfer.transfer.length, 'transferable(s)');

  // ============================================================
  // Example 7: Best practices
  // ============================================================
  console.log('\n7. Best practices\n');

  console.log('  DO:');
  console.log('    - Use typed arrays for numeric data');
  console.log('    - Transfer large buffers instead of copying');
  console.log('    - Use detectTransferables() for complex objects');
  console.log('');
  console.log('  DON\'T:');
  console.log('    - Transfer buffers you need to use again');
  console.log('    - Mix transferred and non-transferred refs to same buffer');
  console.log('    - Transfer small data (overhead not worth it)');

  console.log('\n' + '='.repeat(50));
  console.log('Transfer Detection examples completed!');
}

main().catch(console.error);
