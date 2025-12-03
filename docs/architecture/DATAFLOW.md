# Workerpool Data Flow

This document describes the message protocol, data flow patterns, and communication mechanisms in workerpool.

## Table of Contents

- [Message Protocol](#message-protocol)
- [Task Execution Flow](#task-execution-flow)
- [Cancellation and Timeout Flow](#cancellation-and-timeout-flow)
- [Worker Events](#worker-events)
- [Error Handling](#error-handling)
- [Transferable Objects](#transferable-objects)
- [Pool Lifecycle](#pool-lifecycle)

---

## Message Protocol

Workerpool uses a JSON-RPC style message protocol for all worker communication.

### Special Method IDs

```javascript
const TERMINATE_METHOD_ID = '__workerpool-terminate__';
const CLEANUP_METHOD_ID = '__workerpool-cleanup__';
```

### Request Messages (Main → Worker)

#### Task Request

```typescript
interface TaskRequest {
  id: number;       // Unique request ID for correlation
  method: string;   // Method name to execute
  params?: any[];   // Method parameters
}

// Example
{
  id: 1,
  method: 'fibonacci',
  params: [10]
}
```

#### Cleanup Request

Sent when a task is cancelled or times out.

```typescript
interface CleanupRequest {
  id: number;
  method: '__workerpool-cleanup__';
}
```

#### Terminate Signal

Simple string message (not an object).

```typescript
'__workerpool-terminate__'
```

### Response Messages (Worker → Main)

#### Success Response

```typescript
interface TaskSuccessResponse {
  id: number;
  result: any;
  error: null;
}

// Example
{
  id: 1,
  result: 55,
  error: null
}
```

#### Error Response

```typescript
interface TaskErrorResponse {
  id: number;
  result: null;
  error: SerializedError;
}

interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  [key: string]: any;  // Additional error properties
}

// Example
{
  id: 1,
  result: null,
  error: {
    name: 'TypeError',
    message: 'Invalid argument',
    stack: 'TypeError: Invalid argument\n    at fibonacci...'
  }
}
```

#### Worker Event

Events emitted during task execution.

```typescript
interface WorkerEvent {
  id: number;       // Task ID this event belongs to
  isEvent: true;
  payload: any;
}

// Example
{
  id: 1,
  isEvent: true,
  payload: { progress: 0.5, status: 'processing' }
}
```

#### Cleanup Response

```typescript
interface CleanupResponse {
  id: number;
  method: '__workerpool-cleanup__';
  error: SerializedError | null;
}
```

#### Ready Signal

Simple string message sent when worker finishes initialization.

```typescript
'ready'
```

---

## Task Execution Flow

### Standard Execution

```
┌───────────────┐                                    ┌───────────────┐
│  Main Thread  │                                    │    Worker     │
└───────┬───────┘                                    └───────┬───────┘
        │                                                    │
        │  1. pool.exec('method', [args])                    │
        │                                                    │
        ├─────────────────────────────────────────────────→  │
        │  Create task, add to queue                         │
        │                                                    │
        │  2. _next() - dispatch to worker                   │
        │                                                    │
        │  ┌──────────────────────────────────────────────┐  │
        │  │ { id: 1, method: 'method', params: [args] }  │  │
        │  └──────────────────────────────────────────────┘  │
        │─────────────────────────────────────────────────→  │
        │                                                    │
        │                                   3. Execute method│
        │                                      worker.methods│
        │                                                    │
        │  ┌──────────────────────────────────────────────┐  │
        │  │ { id: 1, result: value, error: null }        │  │
        │  └──────────────────────────────────────────────┘  │
        │←─────────────────────────────────────────────────  │
        │                                                    │
        │  4. Resolve promise with result                    │
        │     _next() - trigger next task                    │
        ▼                                                    ▼
```

### Sequence Diagram: Multiple Tasks

```
Main Thread              Pool                    Worker1            Worker2
     │                    │                        │                   │
     │ exec('a', [1])     │                        │                   │
     │───────────────────▶│                        │                   │
     │                    │ Task A to queue        │                   │
     │ exec('b', [2])     │                        │                   │
     │───────────────────▶│                        │                   │
     │                    │ Task B to queue        │                   │
     │                    │                        │                   │
     │                    │ _next() → Worker1 free │                   │
     │                    │────────────────────────▶ Execute A        │
     │                    │                        │                   │
     │                    │ _next() → Worker2 free │                   │
     │                    │─────────────────────────────────────────────▶
     │                    │                        │        Execute B │
     │                    │                        │                   │
     │                    │◀───────────────────────│ Result A         │
     │◀───────────────────│ Resolve Promise A      │                   │
     │                    │                        │                   │
     │                    │◀──────────────────────────────────────────│
     │◀───────────────────│ Resolve Promise B                Result B │
     ▼                    ▼                        ▼                   ▼
```

---

## Cancellation and Timeout Flow

### Task Cancellation

```
┌───────────────┐                                    ┌───────────────┐
│  Main Thread  │                                    │    Worker     │
└───────┬───────┘                                    └───────┬───────┘
        │                                                    │
        │  1. promise.cancel()                               │
        │                                                    │
        │  2. Move task from processing to tracking          │
        │                                                    │
        │  ┌──────────────────────────────────────────────┐  │
        │  │ { id: 1, method: '__workerpool-cleanup__' }  │  │
        │  └──────────────────────────────────────────────┘  │
        │─────────────────────────────────────────────────→  │
        │                                                    │
        │                           3. Run abort listeners   │
        │                                                    │
        │       ┌────────────────────────────────────────┐   │
        │       │ If listeners succeed:                  │   │
        │       │ { id: 1, method: '__workerpool-       │   │
        │       │   cleanup__', error: null }           │   │
        │       │                                        │   │
        │       │ If listeners fail/timeout:            │   │
        │       │ { id: 1, method: '__workerpool-       │   │
        │       │   cleanup__', error: {...} }          │   │
        │       └────────────────────────────────────────┘   │
        │←─────────────────────────────────────────────────  │
        │                                                    │
        │  4a. If error: null                                │
        │      → Worker kept, reject with CancellationError  │
        │                                                    │
        │  4b. If error: {...}                               │
        │      → Terminate worker, reject with error         │
        ▼                                                    ▼
```

### Timeout Flow Detail

```
        │  promise.timeout(5000)
        │
        │  [Task starts executing]
        │      │
        │      │ Timer starts
        │      │
        │      ├───── Task completes before timeout ─────────────────────┐
        │      │      Timer cancelled, promise resolves                   │
        │      │                                                          │
        │      └───── Timeout fires ──────────────────────────────────┐  │
        │             │                                                │  │
        │             ▼                                                │  │
        │      Send CLEANUP_METHOD_ID                                  │  │
        │             │                                                │  │
        │             ├── Abort listeners succeed ──┐                  │  │
        │             │   Worker kept alive         │                  │  │
        │             │   Reject: TimeoutError      │                  │  │
        │             │                             │                  │  │
        │             └── Abort listeners fail ─────┤                  │  │
        │                 or timeout                │                  │  │
        │                 Worker terminated         │                  │  │
        │                 Reject: TimeoutError      │                  │  │
        │                                           ▼                  ▼  │
        └───────────────────────────────────────── Promise settled ─────┘
```

### Abort Listener Flow (Worker Side)

```javascript
// In worker
worker.cleanup = function(requestId) {
  if (!worker.abortListeners.length) {
    // No listeners - send error, worker will terminate
    worker.send({
      id: requestId,
      method: CLEANUP_METHOD_ID,
      error: convertError(new Error('Worker terminating'))
    });
    return;
  }

  // Run all abort listeners with timeout
  const promises = worker.abortListeners.map(listener => listener());
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Abort timeout')), worker.abortListenerTimeout);
  });

  Promise.race([Promise.all(promises), timeoutPromise])
    .then(() => {
      // Success - worker can be reused
      worker.send({ id: requestId, method: CLEANUP_METHOD_ID, error: null });
    })
    .catch((err) => {
      // Failure - worker should terminate
      worker.send({ id: requestId, method: CLEANUP_METHOD_ID, error: convertError(err) });
    });
};
```

---

## Worker Events

### Event Emission Flow

```
┌───────────────┐                                    ┌───────────────┐
│  Main Thread  │                                    │    Worker     │
└───────┬───────┘                                    └───────┬───────┘
        │                                                    │
        │  pool.exec('task', [], {                           │
        │    on: (event) => handleEvent(event)               │
        │  })                                                │
        │─────────────────────────────────────────────────→  │
        │                                                    │
        │                           // During execution:     │
        │                           workerpool.workerEmit({  │
        │                             status: 'step1'        │
        │                           });                      │
        │  ┌──────────────────────────────────────────────┐  │
        │  │ { id: 1, isEvent: true,                      │  │
        │  │   payload: { status: 'step1' } }             │  │
        │  └──────────────────────────────────────────────┘  │
        │←─────────────────────────────────────────────────  │
        │                                                    │
        │  handleEvent({ status: 'step1' })                  │
        │                                                    │
        │                           workerpool.workerEmit({  │
        │                             status: 'step2'        │
        │                           });                      │
        │←─────────────────────────────────────────────────  │
        │  handleEvent({ status: 'step2' })                  │
        │                                                    │
        │                           return result;           │
        │←─────────────────────────────────────────────────  │
        │  Promise resolves                                  │
        ▼                                                    ▼
```

### stdout/stderr Stream Events

When `emitStdStreams: true`:

```
        │                           console.log('debug');    │
        │←─────────────────────────────────────────────────  │
        │  { stdout: 'debug\n' }                             │
        │  (sent to all active task handlers)                │
        │                                                    │
        │                           console.error('err');    │
        │←─────────────────────────────────────────────────  │
        │  { stderr: 'err\n' }                               │
        ▼                                                    ▼
```

---

## Error Handling

### Error Serialization

Errors must be serialized to cross the IPC boundary:

```javascript
function convertError(error) {
  // Handle errors with custom toJSON
  if (error && error.toJSON) {
    return JSON.parse(JSON.stringify(error));
  }

  // Convert Error to plain object (includes non-enumerable properties)
  return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)));
}

// Example transformation:
// Error: Something failed
//   at myFunction (worker.js:10)
//
// Becomes:
// {
//   name: 'Error',
//   message: 'Something failed',
//   stack: 'Error: Something failed\n    at myFunction (worker.js:10)'
// }
```

### Error Deserialization

```javascript
function objectToError(obj) {
  var temp = new Error('');
  var props = Object.keys(obj);
  for (var i = 0; i < props.length; i++) {
    temp[props[i]] = obj[props[i]];
  }
  return temp;
}
```

### Error Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                              WORKER                                   │
│                                                                      │
│  try {                                                               │
│    const result = method(...params);                                 │
│    send({ id, result, error: null });                               │
│  } catch (err) {                                                     │
│    send({ id, result: null, error: convertError(err) });            │
│  }                                                                   │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ IPC Message
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          WORKER HANDLER                               │
│                                                                      │
│  worker.on('message', function(response) {                           │
│    if (response.error) {                                            │
│      task.resolver.reject(objectToError(response.error));           │
│    } else {                                                         │
│      task.resolver.resolve(response.result);                        │
│    }                                                                 │
│  });                                                                 │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Promise rejected/resolved
                                    ▼
┌──────────────────────────────────────────────────────────────────────┐
│                            USER CODE                                  │
│                                                                      │
│  pool.exec('method', [args])                                         │
│    .then(result => { ... })                                          │
│    .catch(error => {                                                 │
│      // Error has name, message, stack properties                    │
│    });                                                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Transferable Objects

### Transfer Flow

Transferable objects (ArrayBuffer, MessagePort, etc.) can be sent with zero-copy semantics.

```
┌───────────────┐                                    ┌───────────────┐
│  Main Thread  │                                    │    Worker     │
└───────┬───────┘                                    └───────┬───────┘
        │                                                    │
        │  const buffer = new ArrayBuffer(1000000);          │
        │  pool.exec('process', [buffer], {                  │
        │    transfer: [buffer]                              │
        │  });                                               │
        │                                                    │
        │  // buffer is now detached (unusable)              │
        │                                                    │
        │  ┌──────────────────────────────────────────────┐  │
        │  │ Message + Transfer List                      │  │
        │  │ (zero-copy memory transfer)                  │  │
        │  └──────────────────────────────────────────────┘  │
        │─────────────────────────────────────────────────→  │
        │                                                    │
        │                    // buffer is now owned by worker│
        │                    const result = process(buffer); │
        │                    return new Transfer(result,     │
        │                      [result.buffer]);             │
        │                                                    │
        │  ┌──────────────────────────────────────────────┐  │
        │  │ Result + Transfer List                       │  │
        │  │ (zero-copy memory transfer)                  │  │
        │  └──────────────────────────────────────────────┘  │
        │←─────────────────────────────────────────────────  │
        │                                                    │
        │  // result buffer is now owned by main thread     │
        ▼                                                    ▼
```

### Transfer Wrapper Usage

**Worker returning transferred data:**
```javascript
workerpool.worker({
  processLargeData: function(data) {
    const result = new Uint8Array(data.length);
    // ... process ...
    return new workerpool.Transfer(result, [result.buffer]);
  }
});
```

**Main thread sending transferred data:**
```javascript
const largeBuffer = new ArrayBuffer(10000000);
pool.exec('processLargeData', [largeBuffer], {
  transfer: [largeBuffer]
});
// largeBuffer is now unusable
```

---

## Pool Lifecycle

### Initialization Flow

```
┌─────────────┐
│ pool()      │
│ called      │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│ Create Pool instance        │
│ - Parse options             │
│ - Create task queue         │
│ - Initialize worker array   │
└──────────────┬──────────────┘
       │
       ▼
┌─────────────────────────────┐
│ If minWorkers > 0:          │
│ _ensureMinWorkers()         │
│ - Create workers up front   │
└──────────────┬──────────────┘
       │
       ▼
┌─────────────┐
│ Pool ready  │
│ (accepting  │
│  tasks)     │
└─────────────┘
```

### Worker Creation Flow

```
┌─────────────────────────────┐
│ _getWorker() called         │
│ (no free workers,           │
│  workers.length < maxWorkers)│
└──────────────┬──────────────┘
       │
       ▼
┌─────────────────────────────┐
│ _createWorkerHandler()      │
│ - Call onCreateWorker hook  │
│ - Create WorkerHandler      │
└──────────────┬──────────────┘
       │
       ▼
┌─────────────────────────────┐
│ WorkerHandler constructor   │
│ - setupWorker()             │
│ - Listen for messages       │
│ - Listen for errors         │
└──────────────┬──────────────┘
       │
       ▼
┌─────────────────────────────┐     ┌─────────────────────────────┐
│ If script provided:         │     │ Worker process starts       │
│ worker.ready = false        │────▶│ - Loads worker script       │
│ Wait for 'ready' message    │     │ - Calls workerpool.worker() │
└─────────────────────────────┘     │ - Sends 'ready' message     │
                                    └──────────────┬──────────────┘
                                           │
┌─────────────────────────────┐            │
│ If no script:               │            │
│ worker.ready = true         │◀───────────┘
│ Use default worker          │
└─────────────────────────────┘
```

### Termination Flow

```
┌─────────────────────────────┐
│ pool.terminate(force)       │
└──────────────┬──────────────┘
       │
       ▼
┌─────────────────────────────┐
│ Cancel all pending tasks    │
│ in queue (reject promises)  │
└──────────────┬──────────────┘
       │
       ▼
┌─────────────────────────────┐
│ For each worker:            │
│ terminateAndNotify(force)   │
└──────────────┬──────────────┘
       │
       ├── force = false ───────────────────────────────┐
       │   Wait for current tasks to complete           │
       │                                                │
       ├── force = true ────────────────────────────────┤
       │   Reject all in-progress tasks                 │
       │                                                │
       ▼                                                ▼
┌─────────────────────────────┐          ┌─────────────────────────────┐
│ Send TERMINATE_METHOD_ID    │          │ Worker receives terminate   │
│ to worker                   │─────────▶│ - Calls terminationHandler  │
└──────────────┬──────────────┘          │ - Exits with code 0         │
               │                         └──────────────┬──────────────┘
               │                                        │
               │  ◀── Worker exit event ───────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Call onTerminateWorker hook │
│ Remove from workers array   │
│ Release debug port          │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ All workers terminated      │
│ Promise resolves            │
└─────────────────────────────┘
```

---

## Summary: Message Types Table

| Direction | Message | Purpose |
|-----------|---------|---------|
| Main → Worker | `{ id, method, params }` | Task execution request |
| Main → Worker | `{ id, method: '__workerpool-cleanup__' }` | Request graceful abort |
| Main → Worker | `'__workerpool-terminate__'` | Terminate worker |
| Worker → Main | `'ready'` | Worker initialization complete |
| Worker → Main | `{ id, result, error: null }` | Task success |
| Worker → Main | `{ id, result: null, error }` | Task failure |
| Worker → Main | `{ id, isEvent: true, payload }` | Progress event |
| Worker → Main | `{ id, method: '__workerpool-cleanup__', error }` | Cleanup result |

---

## See Also

- [OVERVIEW.md](./OVERVIEW.md) - Project overview
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Architectural design
- [COMPONENTS.md](./COMPONENTS.md) - Component documentation
