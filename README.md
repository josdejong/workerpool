# workerpool

JavaScript is based upon a single event loop which executes one event at a time. All I/O operations are evented, asynchronous, and non-blocking, while the execution of non-I/O code itself is executed sequentially. Jeremy Epstein explains this clearly in the blog [Node.js itself is blocking, only its I/O is non-blocking](http://greenash.net.au/thoughts/2012/11/nodejs-itself-is-blocking-only-its-io-is-non-blocking/):

> In Node.js everything runs in parallel, except your code.
> What this means is that all I/O code that you write in Node.js is non-blocking,
> while (conversely) all non-I/O code that you write in Node.js is blocking.

This means that CPU heavy tasks will block other tasks from being executed. In case of a browser environment, the browser will not react to user events like a mouse click while executing a CPU intensive task (the browser "hangs"). In case of a node.js server, the server will not respond to any requests while executing a single, heavy request.

For front-end processes, this is not a desired situation.
CPU heavy tasks should be offloaded from the main event loop onto dedicated *workers*. We can use [Web Workers](http://www.html5rocks.com/en/tutorials/workers/basics/) when in a browser environment, and [child processes](http://nodejs.org/api/child_process.html) when using node.js. Effectively, this results in an architecture which achieves concurrency by means of isolated processes and message passing.

workerpool offers an easy way to use a pool of workers for both dynamically offloading computations, as well as managing a pool of dedicated workers. All logic to manage a pool of workers is hidden, whilst the workers can be accessed via a natural, promise based proxy, as if they are available locally.


## Features

workerpool offers:

- Extremely simple to use
- Can be used in both browser and node.js environment
- Dynamically offload functions to a worker
- Workers are accessed via a proxy
- Automatically restores crashed workers


## Usage

Install via npm:

    npm install workerpool


### Offload functions dynamically

In the following example there is a function `add`, which is offloaded dynamically to a worker to be executed for a given set of arguments.

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

Note that both function and arguments must be static and stringifiable, as they need to be send to the worker in a serialized form. In case of large functions or function arguments, the overhead of sending the data to the worker can be significant.


### Dedicated workers

TODO


## API

TODO: describe the API


## Build

First clone the project from github:

    git clone git://github.com/josdejong/workerpool.git
    cd workerpool

Install the project dependencies:

    npm install

Then, the project can be build by executing the build script via npm:

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

    ./coverage/lcov-report/index.html


## License

Copyright (C) 2014 Jos de Jong <wjosdejong@gmail.com>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
