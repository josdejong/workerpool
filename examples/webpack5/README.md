# Webpack5 Workerpool Example

```bash
$ npm install 
$ npm run start 
$ npm run build
```

## Notice
The workerpool needs to be transformed to work properly in a webpack5 project. You need to perform these adaptations in the project.

1. Configure worker-url in webpack.config.cjs.

```js
const path = require("path");
const WorkerUrlPlugin = require('worker-url/plugin');
module.exports = {
    mode: "development",
    entry: path.resolve(__dirname, "./src/index.tsx"),
    output: {
        filename: "[name].[hash:8].js",
        path: path.resolve(__dirname, "./dist"),
    },
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],

        // ! webpack5 no longer provides built-in polyfills for Node.js dependencies. 
        alias: {
            "os": false,
            "child_process": false,
            "worker_threads": false
        }
    },
    plugins: [
        // add this
        new WorkerUrlPlugin(),
    ],
};

```

2. Use worker-url to get WorkerURL

```js
//  worker-url is a webpack plugin that is used to obtain the URL of a worker instead of a worker instance.
import { WorkerUrl } from 'worker-url';
const WorkerURL = new WorkerUrl(new URL('./worker/worker.ts', import.meta.url))
const pool = workerpool.pool(WorkerURL.toString(), {
    maxWorkers: 3,
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
