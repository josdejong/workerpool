# workerpool

[![NPM Version](https://img.shields.io/npm/v/workerpool)](https://www.npmjs.com/package/workerpool)
[![NPM Downloads](https://img.shields.io/npm/dm/workerpool)](https://npm-compare.com/workerpool/#timeRange=FIVE_YEARS)
[![NPM License](https://img.shields.io/npm/l/workerpool)](https://github.com/josdejong/workerpool/blob/master/LICENSE)

**workerpool** offers an easy way to create a pool of workers for both dynamically offloading computations as well as managing a pool of dedicated workers. **workerpool** basically implements a [thread pool pattern](http://en.wikipedia.org/wiki/Thread_pool_pattern). There is a pool of workers to execute tasks. New tasks are put in a queue. A worker executes one task at a time, and once finished, picks a new task from the queue. Workers can be accessed via a natural, promise based proxy, as if they are available straight in the main application.

**workerpool** runs on Node.js and in the browser.

## Features

- Easy to use
- Runs in the browser, Node.js, and **Bun**
- Dynamically offload functions to a worker
- Access workers via a proxy
- Cancel running tasks
- Set a timeout on tasks
- Handles crashed workers
- Small: 9 kB minified and gzipped (JS build)
- Supports transferable objects (only for web workers and worker_threads)
- **TypeScript + WASM build** with up to 4.5x faster pool creation and 1.6x faster queue throughput
- **AdvancedPool** with intelligent worker scheduling (worker choice strategies, work stealing, task affinity)
- **Bun compatible** with automatic runtime detection and optimal configuration

## Why

JavaScript is based upon a single event loop which handles one event at a time. Jeremy Epstein [explains this clearly](http://greenash.net.au/thoughts/2012/11/nodejs-itself-is-blocking-only-its-io-is-non-blocking/):

> In Node.js everything runs in parallel, except your code.
> What this means is that all I/O code that you write in Node.js is non-blocking,
> while (conversely) all non-I/O code that you write in Node.js is blocking.

This means that CPU heavy tasks will block other tasks from being executed. In case of a browser environment, the browser will not react to user events like a mouse click while executing a CPU intensive task (the browser "hangs"). In case of a node.js server, the server will not respond to any new request while executing a single, heavy request.

For front-end processes, this is not a desired situation.
Therefore, CPU intensive tasks should be offloaded from the main event loop onto dedicated _workers_. In a browser environment, [Web Workers](http://www.html5rocks.com/en/tutorials/workers/basics/) can be used. In node.js, [child processes](https://nodejs.org/api/child_process.html) and [worker_threads](https://nodejs.org/api/worker_threads.html) are available. An application should be split in separate, decoupled parts, which can run independent of each other in a parallelized way. Effectively, this results in an architecture which achieves concurrency by means of isolated processes and message passing.

## Install

Install via npm:

    npm install workerpool

## Load

To load workerpool in a node.js application (both main application as well as workers):

```js
const workerpool = require('workerpool');
```

To load workerpool in the browser:

```html
<script src="workerpool.js"></script>
```

To load workerpool in a web worker in the browser:

```js
importScripts('workerpool.js');
```

Setting up the workerpool with React or webpack5 requires additional configuration steps, as outlined in the [webpack5 section](examples%2Fwebpack5%2FREADME.md).

## Bun Support

The TypeScript build (`workerpool/modern`) provides first-class support for the [Bun](https://bun.sh/) runtime:

```js
// Using the TypeScript build with Bun
const workerpool = require('workerpool/modern');

// Option 1: Use optimalPool() for automatic best configuration
const pool = workerpool.optimalPool();

// Option 2: Explicitly use thread workers (recommended for Bun)
const pool = workerpool.pool({ workerType: 'thread' });

// Check runtime information
console.log(workerpool.getRuntimeInfo());
// { runtime: 'bun', version: '1.3.4', recommendedWorkerType: 'thread', ... }

// Check worker type support
console.log(workerpool.getWorkerTypeSupport());
// { thread: true, process: false, web: false, auto: true }
```

**Important notes for Bun:**
- Use `workerType: 'thread'` or `workerType: 'auto'` (both work correctly)
- Avoid `workerType: 'process'` as it has known IPC issues with Bun's `child_process.fork()`
- The library automatically selects `'thread'` when running in Bun with `'auto'` or default settings
- All 533 TypeScript tests pass on Bun

See [docs/BUN_COMPATIBILITY.md](docs/BUN_COMPATIBILITY.md) for detailed compatibility information.

## Use

### Offload functions dynamically

In the following example there is a function `add`, which is offloaded dynamically to a worker to be executed for a given set of arguments.

**myApp.js**

```js
const workerpool = require('workerpool');
const pool = workerpool.pool();

function add(a, b) {
  return a + b;
}

pool
  .exec(add, [3, 4])
  .then(function (result) {
    console.log('result', result); // outputs 7
  })
  .catch(function (err) {
    console.error(err);
  })
  .then(function () {
    pool.terminate(); // terminate all workers when done
  });
```

Note that both function and arguments must be static and stringifiable, as they need to be sent to the worker in a serialized form. In case of large functions or function arguments, the overhead of sending the data to the worker can be significant.

### Dedicated workers

A dedicated worker can be created in a separate script, and then used via a worker pool.

**myWorker.js**

```js
const workerpool = require('workerpool');

// a deliberately inefficient implementation of the fibonacci sequence
function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 2) + fibonacci(n - 1);
}

// create a worker and register public functions
workerpool.worker({
  fibonacci: fibonacci,
});
```

This worker can be used by a worker pool:

**myApp.js**

```js
const workerpool = require('workerpool');

// create a worker pool using an external worker script
const pool = workerpool.pool(__dirname + '/myWorker.js');

// run registered functions on the worker via exec
pool
  .exec('fibonacci', [10])
  .then(function (result) {
    console.log('Result: ' + result); // outputs 55
  })
  .catch(function (err) {
    console.error(err);
  })
  .then(function () {
    pool.terminate(); // terminate all workers when done
  });

// or run registered functions on the worker via a proxy:
pool
  .proxy()
  .then(function (worker) {
    return worker.fibonacci(10);
  })
  .then(function (result) {
    console.log('Result: ' + result); // outputs 55
  })
  .catch(function (err) {
    console.error(err);
  })
  .then(function () {
    pool.terminate(); // terminate all workers when done
  });
```

Worker can also initialize asynchronously:

**myAsyncWorker.js**

```js
define(['workerpool/dist/workerpool'], function (workerpool) {
  // a deliberately inefficient implementation of the fibonacci sequence
  function fibonacci(n) {
    if (n < 2) return n;
    return fibonacci(n - 2) + fibonacci(n - 1);
  }

  // create a worker and register public functions
  workerpool.worker({
    fibonacci: fibonacci,
  });
});
```

## Examples

Examples are available in the examples directory:

[https://github.com/josdejong/workerpool/tree/master/examples](https://github.com/josdejong/workerpool/tree/master/examples)

## API

The API of workerpool consists of two parts: a function `workerpool.pool` to create a worker pool, and a function `workerpool.worker` to create a worker.

### pool

A workerpool can be created using the function `workerpool.pool`:

`workerpool.pool([script: string] [, options: Object]) : Pool`

When a `script` argument is provided, the provided script will be started as a dedicated worker. When no `script` argument is provided, a default worker is started which can be used to offload functions dynamically via `Pool.exec`. Note that on node.js, `script` must be an absolute file path like `__dirname + '/myWorker.js'`. In a browser environment, `script` can also be a data URL like `'data:application/javascript;base64,...'`. This allows embedding the bundled code of a worker in your main application. See `examples/embeddedWorker` for a demo.

The following options are available:

- `minWorkers: number | 'max'`. The minimum number of workers that must be initialized and kept available. Setting this to `'max'` will create `maxWorkers` default workers (see below).
- `maxWorkers: number`. The default number of maxWorkers is the number of CPU's minus one. When the number of CPU's could not be determined (for example in older browsers), `maxWorkers` is set to 3.
- `maxQueueSize: number`. The maximum number of tasks allowed to be queued. Can be used to prevent running out of memory. If the maximum is exceeded, adding a new task will throw an error. The default value is `Infinity`.
- `workerType: 'auto' | 'web' | 'process' | 'thread'`.
  - In case of `'auto'` (default), workerpool will automatically pick a suitable type of worker: when in a browser environment, `'web'` will be used. When in a node.js environment, `worker_threads` will be used if available (Node.js >= 11.7.0), else `child_process` will be used.
  - In case of `'web'`, a Web Worker will be used. Only available in a browser environment.
  - In case of `'process'`, `child_process` will be used. Only available in a node.js environment.
  - In case of `'thread'`, `worker_threads` will be used. If `worker_threads` are not available, an error is thrown. Only available in a node.js environment.
- `workerTerminateTimeout: number`. The timeout in milliseconds to wait for a worker to cleanup it's resources on termination before stopping it forcefully. Default value is `1000`.
- `abortListenerTimeout: number`. The timeout in milliseconds to wait for abort listener's before stopping it forcefully, triggering cleanup. Default value is `1000`.
- `forkArgs: String[]`. For `process` worker type. An array passed as `args` to [child_process.fork](https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options)
- `forkOpts: Object`. For `process` worker type. An object passed as `options` to [child_process.fork](https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options). See nodejs documentation for available options.
- `workerOpts: Object`. For `web` worker type. An object passed to the [constructor of the web worker](https://html.spec.whatwg.org/multipage/workers.html#dom-worker). See [WorkerOptions specification](https://html.spec.whatwg.org/multipage/workers.html#workeroptions) for available options.
- `workerThreadOpts: Object`. For `worker` worker type. An object passed to [worker_threads.options](https://nodejs.org/api/worker_threads.html#new-workerfilename-options). See nodejs documentation for available options.
- `onCreateWorker: Function`. A callback that is called whenever a worker is being created. It can be used to allocate resources for each worker for example. The callback is passed as argument an object with the following properties:
  - `forkArgs: String[]`: the `forkArgs` option of this pool
  - `forkOpts: Object`: the `forkOpts` option of this pool
  - `workerOpts: Object`: the `workerOpts` option of this pool
  - `script: string`: the `script` option of this pool
    Optionally, this callback can return an object containing one or more of the above properties. The provided properties will be used to override the Pool properties for the worker being created.
- `onTerminateWorker: Function`. A callback that is called whenever a worker is being terminated. It can be used to release resources that might have been allocated for this specific worker. The callback is passed as argument an object as described for `onCreateWorker`, with each property sets with the value for the worker being terminated.
- `emitStdStreams: boolean`. For `process` or `thread` worker type. If `true`, the worker will emit `stdout` and `stderr` events instead of passing it through to the parent streams. Default value is `false`.

> Important note on `'workerType'`: when sending and receiving primitive data types (plain JSON) from and to a worker, the different worker types (`'web'`, `'process'`, `'thread'`) can be used interchangeably. However, when using more advanced data types like buffers, the API and returned results can vary. In these cases, it is best not to use the `'auto'` setting but have a fixed `'workerType'` and good unit testing in place.

A worker pool contains the following functions:

- `Pool.exec(method: Function | string, params: Array | null [, options: Object]) : Promise<any, Error>`<br>
  Execute a function on a worker with given arguments.

  - When `method` is a string, a method with this name must exist at the worker and must be registered to make it accessible via the pool. The function will be executed on the worker with given parameters.
  - When `method` is a function, the provided function `fn` will be stringified, send to the worker, and executed there with the provided parameters. The provided function must be static, it must not depend on variables in a surrounding scope.
  - The following options are available:
    - `on: (payload: any) => void`. An event listener, to handle events sent by the worker for this execution. See [Events](#events) for more details.
    - `transfer: Object[]`. A list of transferable objects to send to the worker. Not supported by `process` worker type. See [example](./examples/transferableObjects.js) for usage.

- `Pool.proxy() : Promise<Object, Error>`<br>
  Create a proxy for the worker pool. The proxy contains a proxy for all methods available on the worker. All methods return promises resolving the methods result.

- `Pool.stats() : Object`<br>
  Retrieve statistics on workers, and active and pending tasks.

  Returns an object containing the following properties:

  ```
  {
    totalWorkers: 0,
    busyWorkers: 0,
    idleWorkers: 0,
    pendingTasks: 0,
    activeTasks: 0
  }
  ```

- `Pool.terminate([force: boolean [, timeout: number]]) : Promise<void, Error>`

  If parameter `force` is false (default), workers will finish the tasks they are working on before terminating themselves. Any pending tasks will be rejected with an error 'Pool terminated'. When `force` is true, all workers are terminated immediately without finishing running tasks. If `timeout` is provided, worker will be forced to terminate when the timeout expires and the worker has not finished.

The function `Pool.exec` and the proxy functions all return a `Promise`. The promise has the following functions available:

- `Promise.then(fn: Function<result: any>) : Promise<any, Error>`<br>
  Get the result of the promise once resolve.
- `Promise.catch(fn: Function<error: Error>) : Promise<any, Error>`<br>
  Get the error of the promise when rejected.
- `Promise.finally(fn: Function<void>)`<br>
  Logic to run when the Promise either `resolves` or `rejects`
- `Promise.cancel() : Promise<any, Error>`<br>
  A running task can be cancelled. The worker executing the task is enforced to terminate immediately.
  The promise will be rejected with a `Promise.CancellationError`.
- `Promise.timeout(delay: number) : Promise<any, Error>`<br>
  Cancel a running task when it is not resolved or rejected within given delay in milliseconds. The timer will start when the task is actually started, not when the task is created and queued.
  The worker executing the task is enforced to terminate immediately.
  The promise will be rejected with a `Promise.TimeoutError`.

Example usage:

```js
const workerpool = require('workerpool');

function add(a, b) {
  return a + b;
}

const pool1 = workerpool.pool();

// offload a function to a worker
pool1
  .exec(add, [2, 4])
  .then(function (result) {
    console.log(result); // will output 6
  })
  .catch(function (err) {
    console.error(err);
  });

// create a dedicated worker
const pool2 = workerpool.pool(__dirname + '/myWorker.js');

// supposed myWorker.js contains a function 'fibonacci'
pool2
  .exec('fibonacci', [10])
  .then(function (result) {
    console.log(result); // will output 55
  })
  .catch(function (err) {
    console.error(err);
  });

// send a transferable object to the worker
// supposed myWorker.js contains a function 'sum'
const toTransfer = new Uint8Array(2).map((_v, i) => i)
pool2
  .exec('sum', [toTransfer], { transfer: [toTransfer.buffer] })
  .then(function (result) {
    console.log(result); // will output 3
  })
  .catch(function (err) {
    console.error(err);
  });

// create a proxy to myWorker.js
pool2
  .proxy()
  .then(function (myWorker) {
    return myWorker.fibonacci(10);
  })
  .then(function (result) {
    console.log(result); // will output 55
  })
  .catch(function (err) {
    console.error(err);
  });

// create a pool with a specified maximum number of workers
const pool3 = workerpool.pool({ maxWorkers: 7 });
```

### worker

A worker is constructed as:

`workerpool.worker([methods: Object<String, Function>] [, options: Object]) : void`

Argument `methods` is optional and can be an object with functions available in the worker. Registered functions will be available via the worker pool.

The following options are available:

- `onTerminate: ([code: number]) => Promise<void> | void`. A callback that is called whenever a worker is being terminated. It can be used to release resources that might have been allocated for this specific worker. The difference with pool's `onTerminateWorker` is that this callback runs in the worker context, while `onTerminateWorker` is executed on the main thread.


Example usage:

```js
// file myWorker.js
const workerpool = require('workerpool');

function add(a, b) {
  return a + b;
}

function multiply(a, b) {
  return a * b;
}

// create a worker and register functions
workerpool.worker({
  add: add,
  multiply: multiply,
});
```

Asynchronous results can be handled by returning a Promise from a function in the worker:

```js
// file myWorker.js
const workerpool = require('workerpool');

function timeout(delay) {
  return new Promise(function (resolve, reject) {
    setTimeout(resolve, delay);
  });
}

// create a worker and register functions
workerpool.worker({
  timeout: timeout,
});
```

Transferable objects can be sent back to the pool using `Transfer` helper class:

```js
// file myWorker.js
const workerpool = require('workerpool');

function array(size) {
  var array = new Uint8Array(size).map((_v, i) => i);
  return new workerpool.Transfer(array, [array.buffer]);
}

// create a worker and register functions
workerpool.worker({
  array: array,
});
```

### Events

You can send data back from workers to the pool while the task is being executed using the `workerEmit` function:

`workerEmit(payload: any) : unknown`

This function only works inside a worker **and** during a task.

Example:

```js
// file myWorker.js
const workerpool = require('workerpool');

function eventExample(delay) {
  workerpool.workerEmit({
    status: 'in_progress',
  });

  workerpool.workerEmit({
    status: 'complete',
  });

  return true;
}

// create a worker and register functions
workerpool.worker({
  eventExample: eventExample,
});
```

To receive those events, you can use the `on` option of the pool `exec` method:

```js
pool.exec('eventExample', [], {
  on: function (payload) {
    if (payload.status === 'in_progress') {
      console.log('In progress...');
    } else if (payload.status === 'complete') {
      console.log('Done!');
    }
  },
});
```

### Worker API
Workers have access to a `worker` api which contains the following methods

- `emit: (payload: unknown | Transfer): void`
- `addAbortListener: (listener: () => Promise<void>): void`

#### addAbortListener
Worker termination may be recoverable through `abort listeners` which are registered through `worker.addAbortListener`. If all registered listeners resolve then the worker will not be terminated, allowing for worker reuse in some cases.

NOTE: For operations to successfully clean up, a worker implementation should be *async*. If the worker thread is blocked, then the worker will be killed.

```js
function asyncTimeout() {
  var me = this;
  return new Promise(function (resolve) {
    let timeout = setTimeout(() => {
        resolve();
    }, 5000);

    // Register a listener which will resolve before the time out
    // above triggers.
    me.worker.addAbortListener(async function () {
        clearTimeout(timeout);
        resolve();
    });
  });
}

// create a worker and register public functions
workerpool.worker(
  {
    asyncTimeout: asyncTimeout,
  },
  {
    abortListenerTimeout: 1000
  }
);
```

#### emit
Events may also be emitted from the `worker` api through `worker.emit`

```js
// file myWorker.js
const workerpool = require('workerpool');

function eventExample(delay) {
  this.worker.emit({
    status: "in_progress",
  });
  workerpool.workerEmit({
    status: 'complete',
  });

  return true;
}

// create a worker and register functions
workerpool.worker({
  eventExample: eventExample,
});
```

### Utilities

Following properties are available for convenience:

- **platform**: The Javascript platform. Either _node_ or _browser_
- **isMainThread**: Whether the code is running in main thread or not (Workers)
- **cpus**: The number of CPUs/cores available

### TypeScript API (workerpool/modern)

The TypeScript build provides a comprehensive API for modern applications. Import from different entry points based on your needs:

```js
// Modern build (~20KB) - recommended for most use cases
import * as workerpool from 'workerpool/modern';

// Minimal build (~5KB) - core features only
import * as workerpool from 'workerpool/minimal';

// Full build (~34KB) - all features including WASM
import * as workerpool from 'workerpool/full';
```

#### Platform Detection

All TypeScript builds export platform detection utilities:

```js
import {
  platform,           // 'node' or 'browser'
  isMainThread,       // boolean - true if running in main thread
  cpus,               // number - CPU count
  isNode,             // function - check if running in Node.js
  getPlatformInfo,    // function - get complete platform info
  hasWorkerThreads,   // boolean - worker_threads available
  hasSharedArrayBuffer, // boolean - SharedArrayBuffer available
  hasAtomics,         // boolean - Atomics available
} from 'workerpool/minimal';

// Get complete platform info
const info = getPlatformInfo();
// { platform, isMainThread, cpus, hasWorkerThreads, hasSharedArrayBuffer, hasAtomics, isBun, bunVersion, ... }
```

#### Bun Compatibility

The TypeScript builds include Bun runtime detection:

- **isBun**: Boolean indicating if running in Bun runtime
- **bunVersion**: Bun version string if running in Bun, null otherwise
- **recommendedWorkerType**: Best worker type for current runtime ('thread' for Bun, 'auto' for Node.js, 'web' for browser)
- **getWorkerTypeSupport()**: Returns support matrix `{ thread, process, web, auto }` for all worker types
- **isWorkerTypeSupported(type)**: Check if a specific worker type is fully supported
- **optimalPool([script], [options])**: Create a pool with optimal settings for the current runtime
- **getRuntimeInfo()**: Returns `{ runtime, version, recommendedWorkerType, workerTypeSupport }`

#### AdvancedPool (workerpool/modern and /full)

AdvancedPool provides intelligent worker scheduling with multiple worker choice strategies, work stealing, and task affinity:

```js
import {
  advancedPool,           // Create pool with advanced scheduling
  cpuIntensivePool,       // Optimized for CPU-bound tasks
  ioIntensivePool,        // Optimized for I/O-bound tasks
  mixedWorkloadPool,      // Balanced for mixed workloads
} from 'workerpool/full';

// Create an advanced pool with intelligent scheduling
const pool = advancedPool('./worker.js', {
  workerChoiceStrategy: 'least-busy',  // or 'round-robin', 'least-used', 'fair-share'
  enableWorkStealing: true,
  enableTaskAffinity: true,
});

// Execute with task affinity (tasks with same key go to same worker)
await pool.execWithAffinity('user-123', 'processData', [data]);

// Execute with task type hint (routes to best performer)
await pool.execWithType('image-processing', 'resize', [image]);

// Change strategy at runtime
pool.setWorkerChoiceStrategy('fair-share');

// Get advanced statistics
const stats = pool.stats();
console.log(stats.workStealingStats?.totalSteals);
```

**Worker Choice Strategies:**
- `round-robin` - Even distribution in rotation
- `least-busy` - Worker with fewest active tasks (best for I/O-bound)
- `least-used` - Worker with fewest completed tasks
- `fair-share` - Balances by total execution time (best for mixed workloads)
- `weighted-round-robin` - Configurable worker weights
- `interleaved-weighted-round-robin` - Smoother weighted distribution

**Work Stealing:** Automatically rebalances tasks from busy workers to idle ones.

**Task Affinity:** Routes related tasks to the same worker for cache locality.

#### Transfer Detection (workerpool/modern and /full)

Utilities for detecting and optimizing transferable objects:

```js
import {
  isTransferable,        // Check if value is transferable
  detectTransferables,   // Find all transferables in an object tree
  getTransferableType,   // Get the type of a transferable
  validateTransferables, // Validate transfer list before sending
} from 'workerpool/modern';

const buffer = new ArrayBuffer(1024);
console.log(isTransferable(buffer)); // true
console.log(getTransferableType(buffer)); // 'ArrayBuffer'

const data = { buffer, nested: { another: new Uint8Array(256) } };
const detected = detectTransferables(data);
// { transferables: [...], totalSize: 1280, hasLargeBuffers: false, warnings: [] }
```

#### Data Structures (all builds)

High-performance data structures exported from all TypeScript builds:

```js
import {
  CircularBuffer,        // Fixed-size circular buffer with O(1) operations
  GrowableCircularBuffer, // Circular buffer that grows when full
  TimeWindowBuffer,      // Time-based buffer with automatic pruning
  FIFOQueue,             // First-in-first-out queue
  LIFOQueue,             // Last-in-first-out queue (stack)
} from 'workerpool/minimal';

// CircularBuffer - evicts oldest when full
const buffer = new CircularBuffer(3);
buffer.push(1); buffer.push(2); buffer.push(3);
buffer.push(4); // Evicts 1
console.log(buffer.toArray()); // [2, 3, 4]

// GrowableCircularBuffer - grows instead of evicting
const growable = new GrowableCircularBuffer(2);
growable.push(1); growable.push(2); growable.push(3);
console.log(growable.size); // 3

// FIFOQueue and LIFOQueue for task management
const fifo = new FIFOQueue();
fifo.push(task1); fifo.push(task2);
fifo.pop(); // Returns task1 (first in)

const lifo = new LIFOQueue();
lifo.push(task1); lifo.push(task2);
lifo.pop(); // Returns task2 (last in)
```

#### Parallel Array Operations (workerpool/modern and /full)

High-performance parallel array operations that distribute work across workers:

```js
import { pool } from 'workerpool/modern';

// Basic operations (reduce, filter, find, etc.)
const sum = await pool.reduce(
  [1, 2, 3, 4, 5],
  (acc, x) => acc + x,
  (left, right) => left + right,
  { initialValue: 0 }
);

const evens = await pool.filter([1, 2, 3, 4, 5], x => x % 2 === 0);
// [2, 4]

const found = await pool.find(items, x => x.matches);

// Extended operations (count, partition, groupBy, etc.)
const evenCount = await pool.count([1, 2, 3, 4, 5], x => x % 2 === 0);
// 2

const [evens, odds] = await pool.partition([1, 2, 3, 4, 5], x => x % 2 === 0);
// evens = [2, 4], odds = [1, 3, 5]

const groups = await pool.groupBy(items, item => item.type);
// { typeA: [...], typeB: [...] }

const flattened = await pool.flatMap([1, 2, 3], x => [x, x * 2]);
// [1, 2, 2, 4, 3, 6]

const unique = await pool.unique([1, 2, 2, 3, 3, 3]);
// [1, 2, 3]

const hasThree = await pool.includes([1, 2, 3, 4, 5], 3);
// true

const index = await pool.indexOf([1, 2, 3, 4, 5], 3);
// 2
```

**Available parallel operations:**
| Method | Description |
|--------|-------------|
| `reduce()` | Reduce array with parallel chunk processing |
| `filter()` | Filter array with parallel predicate evaluation |
| `find()` | Find first matching item (early exit) |
| `findIndex()` | Find index of first matching item |
| `some()` | Check if any item matches (early exit) |
| `every()` | Check if all items match (early exit) |
| `forEach()` | Execute function for each item |
| `count()` | Count items matching predicate |
| `partition()` | Split into [matches, non-matches] |
| `groupBy()` | Group items by key function |
| `flatMap()` | Map and flatten results |
| `unique()` | Remove duplicates |
| `includes()` | Check if value exists |
| `indexOf()` | Find index of value |
| `reduceRight()` | Reduce from right to left |

All operations support cancellation, pause/resume, and chunked execution for optimal parallelization.

#### Metrics Collection (workerpool/modern and /full)

```js
import { MetricsCollector } from 'workerpool/modern';

const metrics = new MetricsCollector();
metrics.recordTaskLatency(150);
metrics.recordWorkerUtilization(0.75);
console.log(metrics.getSnapshot());
// { avgLatency, p95Latency, utilizationHistory, ... }
```

#### Error Classes (all builds)

```js
import {
  CancellationError,  // Thrown when task is cancelled
  TimeoutError,       // Thrown when task times out
  TerminationError,   // Thrown when pool is terminated
} from 'workerpool/minimal';
```

#### Performance Optimization Utilities (workerpool/modern and /full)

High-performance utilities for optimal parallel processing:

```js
import {
  // Function Compilation Cache - avoid repeated eval() overhead
  FunctionCache,        // LRU cache for compiled functions
  compileCached,        // Cache function compilation
  getGlobalFunctionCache,  // Access global cache
  clearGlobalFunctionCache, // Clear the cache

  // Worker Selection Bitmap - O(1) idle worker lookup
  WorkerBitmap,         // Fast worker state tracking
  SharedWorkerBitmap,   // Thread-safe version with Atomics

  // K-Way Merge - O(n log k) merge for parallel results
  kWayMerge,            // Generic k-way merge
  kWayMergeIndexed,     // Merge indexed items
  mergeFilterResults,   // Merge parallel filter results
  mergePartitionResults, // Merge parallel partition results
  twoWayMerge,          // Optimized 2-way merge
  adaptiveMerge,        // Auto-selects best algorithm

  // SIMD Operations - accelerated numeric processing
  SIMDProcessor,        // Unified SIMD interface
  hasSIMDSupport,       // Check SIMD availability
  simdSumF32,           // SIMD sum for Float32Array
  simdDotProductF32,    // SIMD dot product
  createNumericReducer, // Factory for sum/product/min/max

  // Auto-Transfer - zero-copy optimization
  AutoTransfer,         // Reusable transfer optimizer
  extractTransferables, // Find all transferable objects
  autoDetectTransfer,   // Intelligent transfer decisions
  wrapForTransfer,      // Prepare params with transfer list
  createTransferableChunks, // Split arrays for parallel transfer
} from 'workerpool/modern';

// Example: SIMD-accelerated numeric operations
const arr = new Float32Array(10000);
const sum = simdSumF32(arr);        // SIMD-accelerated sum
const dot = simdDotProductF32(a, b); // SIMD dot product

// Example: Function compilation caching
const cache = new FunctionCache({ maxEntries: 100, ttl: 60000 });
const fn = compileCached('(x) => x * 2');  // Cached after first compile
const fn2 = compileCached('(x) => x * 2'); // Returns cached version

// Example: K-way merge for parallel results
const merged = kWayMerge([sorted1, sorted2, sorted3], (a, b) => a - b);

// Example: Auto-transfer optimization
const autoTransfer = new AutoTransfer({ minTransferSize: 1024 });
const result = autoTransfer.prepare(largeBuffer);
if (result.shouldTransfer) {
  pool.exec('process', [data], { transfer: result.transferables });
}
```

#### Full Build Extras (workerpool/full)

The full build includes additional utilities for advanced use cases:

```js
import {
  // WASM support
  canUseWasm,
  WasmBridge,
  hasWasmSupport,
  hasFullWasmSupport,

  // Debug utilities
  LogLevel,
  enableDebug,
  disableDebug,

  // Worker management
  AdaptiveScaler,
  HealthMonitor,
  WorkerCache,
} from 'workerpool/full';
```

## Roadmap

- ~~Implement functions for parallel processing: `map`, `reduce`, `forEach`,
  `filter`, `some`, `every`, `count`, `partition`, `groupBy`, `flatMap`,
  `unique`, `includes`, `indexOf`, `reduceRight`~~ ✅ **Completed** - Available in TypeScript API (`workerpool/modern`)
- ~~Implement graceful degradation on old browsers not supporting webworkers:
  fallback to processing tasks in the main application.~~ ✅ **Completed** - `MainThreadExecutor` and `createPoolWithFallback()`
- ~~Implement session support: be able to handle a series of related tasks by a
  single worker, which can keep a state for the session.~~ ✅ **Completed** - `SessionManager` with `pool.createSession()`

## Related libraries

- https://github.com/andywer/threads.js
- https://github.com/piscinajs/piscina
- https://github.com/learnboost/cluster
- https://github.com/adambom/parallel.js
- https://github.com/padolsey/operative
- https://github.com/calvinmetcalf/catiline
- https://github.com/Unitech/pm2
- https://github.com/godaddy/node-cluster-service
- https://github.com/ramesaliyev/EasyWebWorker
- https://github.com/rvagg/node-worker-farm

## Build

First clone the project from github:

    git clone git://github.com/josdejong/workerpool.git
    cd workerpool

Install the project dependencies:

    npm install

### Dual Build System

The library supports two separate builds:

**JavaScript Build** (Legacy):
```bash
npm run build:js     # Build JavaScript bundles (src/js/ → dist/)
```
Outputs: `dist/workerpool.js`, `dist/workerpool.min.js`, `dist/worker.js`

**TypeScript + WASM Build** (Modern):
```bash
npm run build:wasm   # Build TypeScript + WASM (src/ts/ → dist/ts/)
```
Outputs: `dist/ts/index.js`, `dist/ts/full.js`, `dist/ts/minimal.js`, `dist/workerpool.wasm`

The TypeScript+WASM build provides up to 34% better performance for concurrent workloads thanks to WASM-accelerated task queues.

### Benchmarking

Compare performance between the two builds:

```bash
node benchmark.mjs
```

### Legacy Build

The default build command builds the JavaScript version:

    npm run build

This will build the library workerpool.js and workerpool.min.js from the source
files and put them in the folder dist.

## Test

To execute tests for the library, install the project dependencies once:

    npm install

Then, the tests can be executed:

    npm test

To test code coverage of the tests:

    npm run coverage

To see the coverage results, open the generated report in your browser:

    ./coverage/index.html

## Publish

- Describe changes in HISTORY.md.
- Update version in package.json, run `npm install` to update it in `package-lock.json` too.
- Push to GitHub.
- Deploy to npm via `npm publish`.
- Add a git tag with the version number like:
  ```
  git tag v1.2.3
  git push --tags
  ```

## License

Copyright (C) 2014-2025 Jos de Jong <wjosdejong@gmail.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
