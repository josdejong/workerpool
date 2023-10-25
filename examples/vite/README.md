# Vite Workerpool Example

```bash
$ npm install 
$ npm run dev 
$ npm run build
```

## Notice
workerpool runs well in Vite and requires some adaptation in terms of Web Workers when used.

```js
import WorkerURL from './worker/worker?url&worker'
const pool = workerpool.pool(WorkerURL, {
    maxWorkers: 3,
    workerOpts: {
        // By default, Vite uses a module worker in dev mode, which can cause your application to fail. Therefore, we need to use a module worker in dev mode and a classic worker in prod mode.
        type: import.meta.env.PROD ? undefined : "module"
    }
});
```

```js
// worker.js
import workerpool from 'workerpool'
// a deliberately inefficient implementation of the fibonacci sequence
function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 2) + fibonacci(n - 1);
}

// create a worker and register public functions
workerpool.worker({
  fibonacci: fibonacci
});

```
