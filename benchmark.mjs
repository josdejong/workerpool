#!/usr/bin/env node
/**
 * Benchmark: JavaScript vs TypeScript + WASM builds
 *
 * Compares performance between:
 * - JavaScript build (src/js/)
 * - TypeScript + WASM build (dist/ts/full.js)
 * - Advanced Pool with worker choice strategies
 * - Work stealing and task affinity features
 * - Protocol V2 features (error codes, priorities, heartbeat, binary protocol)
 */

import { performance } from 'perf_hooks';
import { execSync } from 'child_process';

// Detect runtime
const isBun = typeof Bun !== 'undefined';
const runtime = isBun ? `Bun ${Bun.version}` : `Node.js ${process.version}`;

// Import both builds
const workerpoolJS = await import('./src/js/index.js');
const workerpoolTS = await import('./dist/ts/full.js');

const ITERATIONS = 1000;
const WARMUP = 100;

/**
 * Simple CPU-bound task for benchmarking
 */
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

/**
 * Variable duration task to test load balancing
 */
function variableWork(complexity) {
  let result = 0;
  for (let i = 0; i < complexity * 1000; i++) {
    result += Math.sqrt(i);
  }
  return result;
}

/**
 * Run a benchmark and return average time in ms
 */
async function benchmark(name, fn, iterations = ITERATIONS) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await fn();
  }

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const stdDev = Math.sqrt(times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length);

  return { name, avg, min, max, stdDev, iterations };
}

/**
 * Run a synchronous benchmark
 */
function benchmarkSync(name, fn, iterations = ITERATIONS) {
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    fn();
  }

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const stdDev = Math.sqrt(times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length);

  return { name, avg, min, max, stdDev, iterations };
}

/**
 * Print benchmark results
 */
function printResults(results) {
  console.log(`\n  ${results.name}`);
  console.log(`    Avg: ${results.avg.toFixed(3)} ms`);
  console.log(`    Min: ${results.min.toFixed(3)} ms`);
  console.log(`    Max: ${results.max.toFixed(3)} ms`);
  console.log(`    StdDev: ${results.stdDev.toFixed(3)} ms`);
  console.log(`    Iterations: ${results.iterations}`);
}

/**
 * Print results in microseconds for fast operations
 */
function printResultsMicro(results) {
  console.log(`\n  ${results.name}`);
  console.log(`    Avg: ${(results.avg * 1000).toFixed(3)} μs`);
  console.log(`    Min: ${(results.min * 1000).toFixed(3)} μs`);
  console.log(`    Max: ${(results.max * 1000).toFixed(3)} μs`);
  console.log(`    Ops/sec: ${(1000 / results.avg).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
  console.log(`    Iterations: ${results.iterations}`);
}

/**
 * Compare two benchmark results
 */
function compareResults(jsResult, tsResult, jsLabel = 'JS', tsLabel = 'TS+WASM') {
  const speedup = jsResult.avg / tsResult.avg;
  const faster = speedup > 1 ? tsLabel : jsLabel;
  const ratio = speedup > 1 ? speedup : 1 / speedup;

  console.log(`\n  Comparison:`);
  console.log(`    ${faster} is ${ratio.toFixed(2)}x faster`);
  console.log(`    ${jsLabel} avg: ${jsResult.avg.toFixed(3)} ms`);
  console.log(`    ${tsLabel} avg: ${tsResult.avg.toFixed(3)} ms`);

  return { faster, ratio, speedup };
}

/**
 * Compare multiple strategy results
 */
function compareStrategies(results) {
  const sorted = [...results].sort((a, b) => a.avg - b.avg);
  const fastest = sorted[0];

  console.log(`\n  Strategy Comparison (fastest first):`);
  for (const r of sorted) {
    const ratio = r.avg / fastest.avg;
    const ratioStr = ratio === 1 ? '(baseline)' : `(${ratio.toFixed(2)}x slower)`;
    console.log(`    ${r.name.padEnd(30)} ${r.avg.toFixed(3)} ms ${ratioStr}`);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  Workerpool Benchmark: JS vs TS+WASM (with Protocol V2 Features)');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`\n  Runtime: ${runtime}`);
  console.log(`  Warmup: ${WARMUP} iterations`);
  console.log(`  Benchmark: ${ITERATIONS} iterations (unless noted)`);

  // Store all results for final summary
  const allResults = {
    poolOps: [],
    protocolV2: [],
    dataStructures: [],
    advanced: [],
  };

  // ============================================================
  // PART A: Core Pool Operations (JS vs TS+WASM)
  // ============================================================
  console.log('\n\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║  PART A: Core Pool Operations                                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  // ────────────────────────────────────────────────────────────
  // Benchmark 1: Pool Creation
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  1. Pool Creation');
  console.log('───────────────────────────────────────────────────────────────────────');

  const jsPoolCreate = await benchmark('JS Pool Creation', async () => {
    const pool = workerpoolJS.pool({ maxWorkers: 2 });
    await pool.terminate();
  }, 50);
  printResults(jsPoolCreate);

  const tsPoolCreate = await benchmark('TS+WASM Pool Creation', async () => {
    const pool = workerpoolTS.pool({ maxWorkers: 2 });
    await pool.terminate();
  }, 50);
  printResults(tsPoolCreate);

  const advPoolCreate = await benchmark('AdvancedPool Creation', async () => {
    const pool = workerpoolTS.advancedPool({
      maxWorkers: 2,
      workerChoiceStrategy: 'least-busy',
      enableWorkStealing: true,
    });
    await pool.terminate();
  }, 50);
  printResults(advPoolCreate);

  const poolCreateComp = compareResults(jsPoolCreate, tsPoolCreate);
  allResults.poolOps.push({ name: 'Pool Creation', js: jsPoolCreate.avg, ts: tsPoolCreate.avg, adv: advPoolCreate.avg });

  // ────────────────────────────────────────────────────────────
  // Benchmark 2: Task Execution
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  2. Task Execution (offload fibonacci(20))');
  console.log('───────────────────────────────────────────────────────────────────────');

  const jsPool = workerpoolJS.pool({ maxWorkers: 4 });
  const tsPool = workerpoolTS.pool({ maxWorkers: 4 });
  const advPool = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'least-busy',
    enableWorkStealing: true,
  });

  const jsExec = await benchmark('JS Task Execution', async () => {
    await jsPool.exec(fibonacci, [20]);
  }, 200);
  printResults(jsExec);

  const tsExec = await benchmark('TS+WASM Task Execution', async () => {
    await tsPool.exec(fibonacci, [20]);
  }, 200);
  printResults(tsExec);

  const advExec = await benchmark('AdvancedPool Task Execution', async () => {
    await advPool.exec(fibonacci, [20]);
  }, 200);
  printResults(advExec);

  compareResults(jsExec, tsExec);
  allResults.poolOps.push({ name: 'Task Execution', js: jsExec.avg, ts: tsExec.avg, adv: advExec.avg });

  // ────────────────────────────────────────────────────────────
  // Benchmark 3: Concurrent Task Throughput
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  3. Concurrent Task Throughput (50 tasks per iteration)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const jsConcurrent = await benchmark('JS Concurrent Tasks', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(jsPool.exec(fibonacci, [15]));
    }
    await Promise.all(promises);
  }, 20);
  printResults(jsConcurrent);

  const tsConcurrent = await benchmark('TS+WASM Concurrent Tasks', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(tsPool.exec(fibonacci, [15]));
    }
    await Promise.all(promises);
  }, 20);
  printResults(tsConcurrent);

  const advConcurrent = await benchmark('AdvancedPool Concurrent Tasks', async () => {
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(advPool.exec(fibonacci, [15]));
    }
    await Promise.all(promises);
  }, 20);
  printResults(advConcurrent);

  compareResults(jsConcurrent, tsConcurrent);
  allResults.poolOps.push({ name: 'Concurrent Tasks', js: jsConcurrent.avg, ts: tsConcurrent.avg, adv: advConcurrent.avg });

  // ────────────────────────────────────────────────────────────
  // Benchmark 4: High-Volume Queue Operations
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  4. High-Volume Queue (100 quick tasks per iteration)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const jsQueue = await benchmark('JS Queue Throughput', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(jsPool.exec((x) => x * 2, [i]));
    }
    await Promise.all(promises);
  }, 10);
  printResults(jsQueue);

  const tsQueue = await benchmark('TS+WASM Queue Throughput', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(tsPool.exec((x) => x * 2, [i]));
    }
    await Promise.all(promises);
  }, 10);
  printResults(tsQueue);

  const advQueue = await benchmark('AdvancedPool Queue Throughput', async () => {
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(advPool.exec((x) => x * 2, [i]));
    }
    await Promise.all(promises);
  }, 10);
  printResults(advQueue);

  compareResults(jsQueue, tsQueue);
  allResults.poolOps.push({ name: 'Queue Throughput', js: jsQueue.avg, ts: tsQueue.avg, adv: advQueue.avg });

  // Cleanup first set of pools
  await jsPool.terminate();
  await tsPool.terminate();
  await advPool.terminate();

  // ============================================================
  // PART B: Protocol V2 Features (TS+WASM Only)
  // ============================================================
  console.log('\n\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║  PART B: Protocol V2 Features (TypeScript + WASM)                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  // ────────────────────────────────────────────────────────────
  // Benchmark 5: Error Code Operations
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  5. Error Code Operations (TS+WASM Protocol V2)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const {
    WorkerErrorCode,
    TaskErrorCode,
    CommunicationErrorCode,
    getErrorMessage,
    isRetryableError,
    isFatalError,
    getErrorCategory,
  } = workerpoolTS;

  const errorCodes = [
    WorkerErrorCode.WORKER_CRASHED,
    WorkerErrorCode.WORKER_UNRESPONSIVE,
    TaskErrorCode.TIMEOUT,
    TaskErrorCode.CANCELLED,
    TaskErrorCode.METHOD_NOT_FOUND,
    CommunicationErrorCode.CONNECTION_LOST,
  ];

  const errorMessageResult = benchmarkSync('getErrorMessage (1k lookups)', () => {
    for (let i = 0; i < 1000; i++) {
      for (const code of errorCodes) {
        getErrorMessage(code);
      }
    }
  }, 500);
  printResultsMicro(errorMessageResult);
  allResults.protocolV2.push({ name: 'Error Message Lookup', avg: errorMessageResult.avg });

  const errorClassifyResult = benchmarkSync('Error Classification (1k ops)', () => {
    for (let i = 0; i < 1000; i++) {
      for (const code of errorCodes) {
        isRetryableError(code);
        isFatalError(code);
        getErrorCategory(code);
      }
    }
  }, 500);
  printResultsMicro(errorClassifyResult);
  allResults.protocolV2.push({ name: 'Error Classification', avg: errorClassifyResult.avg });

  // ────────────────────────────────────────────────────────────
  // Benchmark 6: Message Priority Operations
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  6. Message Priority Operations (TS+WASM Protocol V2)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const {
    MessagePriority,
    getMessagePriority,
    compareByPriority,
    createMessage,
  } = workerpoolTS;

  const priorityMessages = [
    { id: 1, priority: MessagePriority.LOW },
    { id: 2, priority: MessagePriority.NORMAL },
    { id: 3, priority: MessagePriority.HIGH },
    { id: 4, priority: MessagePriority.CRITICAL },
    { id: 5 }, // No priority - should default to NORMAL
  ];

  const priorityGetResult = benchmarkSync('getMessagePriority (10k ops)', () => {
    for (let i = 0; i < 10000; i++) {
      for (const msg of priorityMessages) {
        getMessagePriority(msg);
      }
    }
  }, 500);
  printResultsMicro(priorityGetResult);
  allResults.protocolV2.push({ name: 'Priority Lookup', avg: priorityGetResult.avg });

  const prioritySortResult = benchmarkSync('Priority Sort (1k sorts of 100 msgs)', () => {
    for (let i = 0; i < 1000; i++) {
      const messages = [];
      for (let j = 0; j < 100; j++) {
        messages.push({ id: j, priority: j % 4 });
      }
      messages.sort(compareByPriority);
    }
  }, 100);
  printResultsMicro(prioritySortResult);
  allResults.protocolV2.push({ name: 'Priority Sort', avg: prioritySortResult.avg });

  const messageCreateResult = benchmarkSync('createMessage (10k msgs)', () => {
    for (let i = 0; i < 10000; i++) {
      createMessage(
        { id: i, method: 'test', params: [] },
        { priority: i % 4, includeTimestamp: true }
      );
    }
  }, 200);
  printResultsMicro(messageCreateResult);
  allResults.protocolV2.push({ name: 'Message Creation', avg: messageCreateResult.avg });

  // ────────────────────────────────────────────────────────────
  // Benchmark 7: Heartbeat Operations
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  7. Heartbeat Operations (TS+WASM Protocol V2)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const {
    createHeartbeatRequest,
    createHeartbeatResponse,
  } = workerpoolTS;

  const heartbeatRequestResult = benchmarkSync('createHeartbeatRequest (10k ops)', () => {
    for (let i = 0; i < 10000; i++) {
      createHeartbeatRequest(i, `worker-${i % 4}`);
    }
  }, 500);
  printResultsMicro(heartbeatRequestResult);
  allResults.protocolV2.push({ name: 'Heartbeat Request', avg: heartbeatRequestResult.avg });

  const heartbeatResponseResult = benchmarkSync('createHeartbeatResponse (10k ops)', () => {
    for (let i = 0; i < 10000; i++) {
      createHeartbeatResponse(i, i % 2 === 0 ? 'alive' : 'busy', {
        taskCount: i % 10,
        memoryUsage: 1024 * 1024 * (i % 100),
        uptime: i * 1000,
      });
    }
  }, 500);
  printResultsMicro(heartbeatResponseResult);
  allResults.protocolV2.push({ name: 'Heartbeat Response', avg: heartbeatResponseResult.avg });

  // ────────────────────────────────────────────────────────────
  // Benchmark 8: Binary Protocol Operations (AssemblyScript Stubs)
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  8. Binary Protocol Operations (AssemblyScript Stubs)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const {
    encodeTaskRequest,
    decodeTaskRequest,
    encodeErrorResponse,
    decodeErrorResponse,
    encodeHeartbeatRequest,
    encodeHeartbeatResponse,
    decodeHeartbeatResponse,
    validateHeader,
    resetSequence,
    getMessageType,
    getMessageId,
    getBinaryMessagePriority,
    calculateChecksum,
    PRIORITY_HIGH,
    PRIORITY_CRITICAL,
  } = workerpoolTS;

  const textEncoder = new TextEncoder();
  const testParams = textEncoder.encode(JSON.stringify({ data: 'test', value: 123 }));

  const encodeTaskResult = benchmarkSync('encodeTaskRequest (10k ops)', () => {
    resetSequence();
    for (let i = 0; i < 10000; i++) {
      encodeTaskRequest(i, 'processData', testParams, PRIORITY_HIGH, false);
    }
  }, 200);
  printResultsMicro(encodeTaskResult);
  allResults.protocolV2.push({ name: 'Binary Encode Task', avg: encodeTaskResult.avg });

  // Pre-encode for decode benchmarks
  resetSequence();
  const encodedTasks = [];
  for (let i = 0; i < 100; i++) {
    encodedTasks.push(encodeTaskRequest(i, 'processData', testParams, PRIORITY_HIGH, false));
  }

  const decodeTaskResult = benchmarkSync('decodeTaskRequest (10k ops)', () => {
    for (let i = 0; i < 10000; i++) {
      decodeTaskRequest(encodedTasks[i % 100]);
    }
  }, 200);
  printResultsMicro(decodeTaskResult);
  allResults.protocolV2.push({ name: 'Binary Decode Task', avg: decodeTaskResult.avg });

  const validateHeaderResult = benchmarkSync('validateHeader (10k ops)', () => {
    for (let i = 0; i < 10000; i++) {
      validateHeader(encodedTasks[i % 100]);
    }
  }, 200);
  printResultsMicro(validateHeaderResult);
  allResults.protocolV2.push({ name: 'Binary Validate Header', avg: validateHeaderResult.avg });

  const encodeErrorResult = benchmarkSync('encodeErrorResponse (10k ops)', () => {
    resetSequence();
    for (let i = 0; i < 10000; i++) {
      encodeErrorResponse(
        i,
        TaskErrorCode.TIMEOUT,
        'Task timed out',
        'at Worker.process\n  at TaskQueue.run'
      );
    }
  }, 200);
  printResultsMicro(encodeErrorResult);
  allResults.protocolV2.push({ name: 'Binary Encode Error', avg: encodeErrorResult.avg });

  const encodeHeartbeatReqResult = benchmarkSync('encodeHeartbeatRequest (10k ops)', () => {
    resetSequence();
    for (let i = 0; i < 10000; i++) {
      encodeHeartbeatRequest(i, `worker-${i % 4}`);
    }
  }, 200);
  printResultsMicro(encodeHeartbeatReqResult);
  allResults.protocolV2.push({ name: 'Binary Encode HB Req', avg: encodeHeartbeatReqResult.avg });

  const encodeHeartbeatResResult = benchmarkSync('encodeHeartbeatResponse (10k ops)', () => {
    resetSequence();
    for (let i = 0; i < 10000; i++) {
      encodeHeartbeatResponse(
        i,
        1, // busy
        i % 10,
        BigInt(1024 * 1024 * (i % 256)),
        BigInt(i * 1000)
      );
    }
  }, 200);
  printResultsMicro(encodeHeartbeatResResult);
  allResults.protocolV2.push({ name: 'Binary Encode HB Res', avg: encodeHeartbeatResResult.avg });

  // Combined roundtrip
  const roundtripResult = benchmarkSync('Full Roundtrip (encode+validate+decode)', () => {
    resetSequence();
    for (let i = 0; i < 1000; i++) {
      const encoded = encodeTaskRequest(i, 'compute', testParams, PRIORITY_CRITICAL, true);
      if (!validateHeader(encoded)) throw new Error('Invalid header');
      const decoded = decodeTaskRequest(encoded);
      if (decoded.id !== i) throw new Error('ID mismatch');
    }
  }, 200);
  printResultsMicro(roundtripResult);
  allResults.protocolV2.push({ name: 'Binary Roundtrip', avg: roundtripResult.avg });

  // Checksum benchmark
  const checksumData = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) checksumData[i] = i % 256;

  const checksumResult = benchmarkSync('calculateChecksum (1KB data, 10k ops)', () => {
    for (let i = 0; i < 10000; i++) {
      calculateChecksum(checksumData, 0, 1024);
    }
  }, 200);
  printResultsMicro(checksumResult);
  allResults.protocolV2.push({ name: 'Checksum 1KB', avg: checksumResult.avg });

  // ────────────────────────────────────────────────────────────
  // Benchmark 9: Type Guards Performance
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  9. Type Guards Performance (TS+WASM Protocol V2)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const {
    isTaskRequest,
    isTaskSuccessResponse,
    isTaskErrorResponse,
    isHeartbeatRequest,
    isHeartbeatResponse,
    isValidProtocolVersion,
  } = workerpoolTS;

  const testMessages = [
    { id: 1, method: 'test', params: [] },
    { id: 2, result: 'ok', error: null },
    { id: 3, result: null, error: { name: 'Error', message: 'fail' } },
    { id: 4, method: '__workerpool-heartbeat__' },
    { id: 5, method: '__workerpool-heartbeat__', status: 'alive' },
    { v: 2, id: 6, method: 'test' },
    { v: 99, id: 7, method: 'test' }, // Invalid version
  ];

  const typeGuardResult = benchmarkSync('Type Guards (all guards, 10k msgs)', () => {
    for (let i = 0; i < 10000; i++) {
      for (const msg of testMessages) {
        isTaskRequest(msg);
        isTaskSuccessResponse(msg);
        isTaskErrorResponse(msg);
        isHeartbeatRequest(msg);
        isHeartbeatResponse(msg);
        isValidProtocolVersion(msg);
      }
    }
  }, 200);
  printResultsMicro(typeGuardResult);
  allResults.protocolV2.push({ name: 'Type Guards', avg: typeGuardResult.avg });

  // ============================================================
  // PART C: Data Structures Performance
  // ============================================================
  console.log('\n\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║  PART C: Data Structures Performance                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  // ────────────────────────────────────────────────────────────
  // Benchmark 10: Circular Buffer
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  10. Circular Buffer Performance');
  console.log('───────────────────────────────────────────────────────────────────────');

  const circularBufferResult = benchmarkSync('GrowableCircularBuffer (10k push/shift)', () => {
    const buffer = new workerpoolTS.GrowableCircularBuffer(16);
    for (let i = 0; i < 5000; i++) {
      buffer.push(i);
    }
    for (let i = 0; i < 5000; i++) {
      buffer.shift();
    }
    return buffer;
  }, 500);
  printResultsMicro(circularBufferResult);
  allResults.dataStructures.push({ name: 'CircularBuffer', avg: circularBufferResult.avg });

  const fixedBufferResult = benchmarkSync('CircularBuffer Fixed (10k ops)', () => {
    const buffer = new workerpoolTS.CircularBuffer(1024);
    for (let i = 0; i < 5000; i++) {
      buffer.push(i);
    }
    for (let i = 0; i < 5000; i++) {
      buffer.shift();
    }
    return buffer;
  }, 500);
  printResultsMicro(fixedBufferResult);
  allResults.dataStructures.push({ name: 'CircularBuffer Fixed', avg: fixedBufferResult.avg });

  // Compare with native JS Array
  const arrayResult = benchmarkSync('Native Array (10k push/shift)', () => {
    const arr = [];
    for (let i = 0; i < 5000; i++) {
      arr.push(i);
    }
    for (let i = 0; i < 5000; i++) {
      arr.shift();
    }
    return arr;
  }, 500);
  printResultsMicro(arrayResult);

  console.log(`\n  CircularBuffer vs Array: ${(arrayResult.avg / circularBufferResult.avg).toFixed(2)}x faster`);

  // ────────────────────────────────────────────────────────────
  // Benchmark 11: Work Stealing Deque
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  11. Work Stealing Deque Performance');
  console.log('───────────────────────────────────────────────────────────────────────');

  const dequeResult = benchmarkSync('WorkStealingDeque (10k ops)', () => {
    const deque = new workerpoolTS.WorkStealingDeque(0, 16);
    for (let i = 0; i < 5000; i++) {
      deque.pushBottom({ id: i, data: i, timestamp: Date.now() });
    }
    for (let i = 0; i < 2500; i++) {
      deque.popBottom(); // LIFO
    }
    for (let i = 0; i < 2500; i++) {
      deque.steal(); // FIFO
    }
    return deque;
  }, 500);
  printResultsMicro(dequeResult);
  allResults.dataStructures.push({ name: 'WorkStealingDeque', avg: dequeResult.avg });

  // ────────────────────────────────────────────────────────────
  // Benchmark 12: Worker Choice Strategy Manager
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  12. Worker Choice Strategy Manager');
  console.log('───────────────────────────────────────────────────────────────────────');

  const strategyManagerResult = benchmarkSync('StrategyManager (10k selections)', () => {
    const manager = new workerpoolTS.WorkerChoiceStrategyManager('least-busy');
    const mockWorkers = Array(4).fill(null).map((_, i) => ({ busy: () => i % 2 === 0 }));

    for (let i = 0; i < 4; i++) {
      manager.initializeWorker(i);
    }

    for (let i = 0; i < 10000; i++) {
      manager.choose(mockWorkers);
      if (i % 100 === 0) {
        manager.updateStats(i % 4, Math.random() * 100, true);
      }
    }
    return manager;
  }, 100);
  printResultsMicro(strategyManagerResult);
  allResults.dataStructures.push({ name: 'StrategyManager', avg: strategyManagerResult.avg });

  // ============================================================
  // PART D: Advanced Pool Features
  // ============================================================
  console.log('\n\n╔═══════════════════════════════════════════════════════════════════════╗');
  console.log('║  PART D: Advanced Pool Features                                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════╝');

  // ────────────────────────────────────────────────────────────
  // Benchmark 13: Worker Choice Strategy Comparison
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  13. Worker Choice Strategy Comparison (variable workload)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const strategies = [
    'round-robin',
    'least-busy',
    'least-used',
    'fair-share',
  ];

  const strategyResults = [];

  for (const strategy of strategies) {
    const pool = workerpoolTS.advancedPool({
      maxWorkers: 4,
      workerChoiceStrategy: strategy,
      enableWorkStealing: false,
    });

    const result = await benchmark(`Strategy: ${strategy}`, async () => {
      const promises = [];
      for (let i = 0; i < 20; i++) {
        const complexity = (i % 5) + 1;
        promises.push(pool.exec(variableWork, [complexity]));
      }
      await Promise.all(promises);
    }, 15);

    printResults(result);
    strategyResults.push(result);
    await pool.terminate();
  }

  compareStrategies(strategyResults);

  // ────────────────────────────────────────────────────────────
  // Benchmark 14: Work Stealing Impact
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  14. Work Stealing Impact (imbalanced workload)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const poolNoStealing = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableWorkStealing: false,
  });

  const poolWithStealing = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableWorkStealing: true,
    stealingPolicy: 'busiest-first',
  });

  const noStealResult = await benchmark('Without Work Stealing', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      const complexity = i < 5 ? 10 : 1;
      promises.push(poolNoStealing.exec(variableWork, [complexity]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(noStealResult);

  const stealResult = await benchmark('With Work Stealing', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      const complexity = i < 5 ? 10 : 1;
      promises.push(poolWithStealing.exec(variableWork, [complexity]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(stealResult);

  const stealSpeedup = noStealResult.avg / stealResult.avg;
  console.log(`\n  Work Stealing Impact: ${stealSpeedup.toFixed(2)}x ${stealSpeedup > 1 ? 'faster' : 'slower'}`);
  allResults.advanced.push({ name: 'Work Stealing', impact: stealSpeedup });

  await poolNoStealing.terminate();
  await poolWithStealing.terminate();

  // ────────────────────────────────────────────────────────────
  // Benchmark 15: Task Affinity Performance
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  15. Task Affinity Performance (related tasks)');
  console.log('───────────────────────────────────────────────────────────────────────');

  const poolNoAffinity = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: false,
  });

  const poolWithAffinity = workerpoolTS.advancedPool({
    maxWorkers: 4,
    workerChoiceStrategy: 'round-robin',
    enableTaskAffinity: true,
  });

  const noAffinityResult = await benchmark('Without Task Affinity', async () => {
    const promises = [];
    for (let userId = 0; userId < 5; userId++) {
      for (let req = 0; req < 4; req++) {
        promises.push(poolNoAffinity.exec(fibonacci, [15]));
      }
    }
    await Promise.all(promises);
  }, 15);
  printResults(noAffinityResult);

  const affinityResult = await benchmark('With Task Affinity', async () => {
    const promises = [];
    for (let userId = 0; userId < 5; userId++) {
      for (let req = 0; req < 4; req++) {
        promises.push(poolWithAffinity.execWithAffinity(`user-${userId}`, fibonacci, [15]));
      }
    }
    await Promise.all(promises);
  }, 15);
  printResults(affinityResult);

  const affinitySpeedup = noAffinityResult.avg / affinityResult.avg;
  console.log(`\n  Task Affinity Impact: ${affinitySpeedup.toFixed(2)}x ${affinitySpeedup > 1 ? 'faster' : 'slower'}`);
  allResults.advanced.push({ name: 'Task Affinity', impact: affinitySpeedup });

  await poolNoAffinity.terminate();
  await poolWithAffinity.terminate();

  // ────────────────────────────────────────────────────────────
  // Benchmark 16: Optimized Pool Factory Functions
  // ────────────────────────────────────────────────────────────
  console.log('\n───────────────────────────────────────────────────────────────────────');
  console.log('  16. Optimized Pool Factory Functions');
  console.log('───────────────────────────────────────────────────────────────────────');

  const cpuPool = workerpoolTS.cpuIntensivePool({ maxWorkers: 4 });
  const ioPool = workerpoolTS.ioIntensivePool({ maxWorkers: 4 });
  const mixedPool = workerpoolTS.mixedWorkloadPool({ maxWorkers: 4 });

  const cpuResult = await benchmark('cpuIntensivePool', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(cpuPool.exec(fibonacci, [18]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(cpuResult);

  const ioResult = await benchmark('ioIntensivePool', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(ioPool.exec(fibonacci, [18]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(ioResult);

  const mixedResult = await benchmark('mixedWorkloadPool', async () => {
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(mixedPool.exec(fibonacci, [18]));
    }
    await Promise.all(promises);
  }, 15);
  printResults(mixedResult);

  compareStrategies([cpuResult, ioResult, mixedResult]);

  await cpuPool.terminate();
  await ioPool.terminate();
  await mixedPool.terminate();

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n\n═══════════════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`\n  Runtime: ${runtime}`);

  // Pool Operations Summary
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │  Core Pool Operations (JS vs TS+WASM vs AdvancedPool)               │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');
  console.log('  │  Benchmark              JS (ms)    TS+WASM (ms)   AdvPool (ms)   Winner │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');

  let jsWins = 0, tsWins = 0, advWins = 0;

  for (const r of allResults.poolOps) {
    const minVal = Math.min(r.js, r.ts, r.adv);
    let winner;
    if (minVal === r.js) { winner = 'JS'; jsWins++; }
    else if (minVal === r.ts) { winner = 'TS+WASM'; tsWins++; }
    else { winner = 'AdvPool'; advWins++; }

    const jsStr = r.js.toFixed(3).padStart(10);
    const tsStr = r.ts.toFixed(3).padStart(12);
    const advStr = r.adv.toFixed(3).padStart(12);
    console.log(`  │  ${r.name.padEnd(20)} ${jsStr}   ${tsStr}   ${advStr}   ${winner.padEnd(7)} │`);
  }

  console.log('  ├─────────────────────────────────────────────────────────────────────┤');
  console.log(`  │  Wins: JS=${jsWins}, TS+WASM=${tsWins}, AdvancedPool=${advWins}${' '.repeat(33)}│`);
  console.log('  └─────────────────────────────────────────────────────────────────────┘');

  // Protocol V2 Summary
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │  Protocol V2 Features (TS+WASM Only)                                │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');
  console.log('  │  Feature                     Avg Time (μs)    Ops/sec               │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');

  for (const r of allResults.protocolV2) {
    const avgUs = (r.avg * 1000).toFixed(3).padStart(14);
    const opsPerSec = (1000 / r.avg).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',').padStart(12);
    console.log(`  │  ${r.name.padEnd(26)} ${avgUs}    ${opsPerSec}          │`);
  }

  console.log('  └─────────────────────────────────────────────────────────────────────┘');

  // Data Structures Summary
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │  Data Structures Performance                                        │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');

  for (const r of allResults.dataStructures) {
    const avgUs = (r.avg * 1000).toFixed(3).padStart(14);
    const opsPerSec = (1000 / r.avg).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',').padStart(12);
    console.log(`  │  ${r.name.padEnd(26)} ${avgUs} μs   ${opsPerSec} ops/sec   │`);
  }

  console.log('  └─────────────────────────────────────────────────────────────────────┘');

  // Advanced Features Summary
  console.log('\n  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │  Advanced Features Impact                                           │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');
  console.log(`  │    Work Stealing: ${stealSpeedup.toFixed(2)}x ${stealSpeedup > 1 ? 'faster' : 'slower'}${' '.repeat(44)}│`);
  console.log(`  │    Task Affinity: ${affinitySpeedup.toFixed(2)}x ${affinitySpeedup > 1 ? 'faster' : 'slower'}${' '.repeat(44)}│`);
  console.log(`  │    Best Strategy: ${strategyResults.sort((a, b) => a.avg - b.avg)[0].name}${' '.repeat(38)}│`);
  console.log('  └─────────────────────────────────────────────────────────────────────┘');

  // Overall speedup calculation
  const overallJsAvg = allResults.poolOps.reduce((sum, r) => sum + r.js, 0) / allResults.poolOps.length;
  const overallTsAvg = allResults.poolOps.reduce((sum, r) => sum + r.ts, 0) / allResults.poolOps.length;
  const overallSpeedup = overallJsAvg / overallTsAvg;

  console.log('\n  ┌─────────────────────────────────────────────────────────────────────┐');
  console.log('  │  OVERALL RESULT                                                     │');
  console.log('  ├─────────────────────────────────────────────────────────────────────┤');
  console.log(`  │    TS+WASM is ${overallSpeedup.toFixed(2)}x ${overallSpeedup > 1 ? 'faster' : 'slower'} than JS on average${' '.repeat(28)}│`);
  console.log(`  │    Runtime: ${runtime}${' '.repeat(55 - runtime.length)}│`);
  console.log('  └─────────────────────────────────────────────────────────────────────┘');

  console.log('\n═══════════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);
