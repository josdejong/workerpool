# workerpool

Offload tasks to a pool of workers on node.js and in the browser.


http://greenash.net.au/thoughts/2012/11/nodejs-itself-is-blocking-only-its-io-is-non-blocking/

A quote from [Jeremy Epstein](http://greenash.net.au/thoughts/2012/11/nodejs-itself-is-blocking-only-its-io-is-non-blocking/):

> In Node.js everything runs in parallel, except your code.
> What this means is that all I/O code that you write in Node.js is non-blocking,
> while (conversely) all non-I/O code that you write in Node.js is blocking.

JavaScript is based upon a single event loop which executes one event at a time.
All I/O operations are evented, asynchronous, and non-blocking,
while the execution of non-I/O code itself is executed sequentially.

This means that CPU heavy tasks will block other tasks from being executed.
In case of a browser environment, the browser will not react to user events
like a mouse click while executing a CPU intensive task (the browser "hangs").
In case of a node.js server, the server will not respond to any requests while
executing a single, heavy request.

For front-end processes, this is not a desired situation.
In this case, CPU heavy tasks should be offloaded to dedicated *workers*. We can use
[Web Workers](http://www.html5rocks.com/en/tutorials/workers/basics/) when in a browser environment,
and [child processes](http://nodejs.org/api/child_process.html) when using node.js.

TODO: more text here


## Features

workerpool offers:

- Extremely simple to use
- Support for both server and node.js
- Dynamically offload functions to a worker
- Invoke functions on a worker via an RPC interface
- Running tasks can be killed
- Automatically restores crashed workers
- Promise based API


## Usage

Install via npm:

npm install workerpool


### Offload calculations

A simple example offloading a calculation to a worker:

```js
var workerpool = require('workerpool');

var pool = workerpool.pool();

function add(a, b) {
  return a + b;
}

pool.run(add, [3, 4])
    .then(function (result) {
      console.log('result', result); // outputs 7

      pool.clear(); // clear all workers when done
    });
```

The offloaded function is stringified and send to the worker, together with
any function arguments. The function is then executed on worker with provided
arguments. Note that in case of large functions or function arguments, the
overhead of sending the data to the worker can be significant.


### Workers

TODO

## API

TODO: describe the API
