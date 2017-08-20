# workerpool history
https://github.com/josdejong/workerpool


## 2017-08-20, version 2.2.4

- Fixed a debug issue: look for `--inspect` within argument strings,
  instead of exact match. Thanks @jimsugg.


## 2017-08-19, version 2.2.3

- Updated all examples to neatly include `.catch(...)` callbacks.


## 2017-07-08, version 2.2.2

- Fixed #25: timer of a timeout starting when the task is created
  instead of when the task is started. Thanks @eclipsesk for input.


## 2017-05-07, version 2.2.1

- Fixed #2 and #19: support for debugging child processes. Thanks @tptee.


## 2016-11-26, version 2.2.0

- Implemented #18: method `pool.stats()`.


## 2016-10-11, version 2.1.0

- Implemented support for registering the workers methods asynchronously.
  This enables asynchronous initialization of workers, for example when
  using AMD modules. Thanks @natlibfi-arlehiko.
- Implemented environment variables `platform`, `isMainThread`, and `cpus`.
  Thanks @natlibfi-arlehiko.
- Implemented option `minWorkers`. Thanks @sergei202.


## 2016-09-18, version 2.0.0

- Replaced conversion of Error-objecting using serializerr to custom
  implementation to prevent issues with serializing/deserializing functions.
  This conversion implementation loses the prototype object which means that
  e.g. 'TypeError' will become just 'Error' in the main code. See #8.
  Thanks @natlibfi-arlehiko.


## 2016-09-12, version 1.3.1

- Fix for a bug in PhantomJS (see #7). Thanks @natlibfi-arlehiko.


## 2016-08-21, version 1.3.0

- Determine `maxWorkers` as the number of CPU's minus one in browsers too. See #6.


## 2016-06-25, version 1.2.1

- Fixed #5 error when loading via AMD or bundling using Webpack.


## 2016-05-22, version 1.2.0

- Implemented serializing errors with stacktrace. Thanks @mujx.


## 2016-01-25, version 1.1.0

- Added an error message when wrongly calling `pool.proxy`.
- Fixed function `worker.pool` not accepting both a script and options. See #1.
  Thanks @freund17.


## 2014-05-29, version 1.0.0

- Merged function `Pool.run` into `Pool.exec`, simplifying the API.


## 2014-05-14, version 0.2.0

- Implemented support for cancelling running tasks.
- Implemented support for cancelling running tasks after a timeout.


## 2014-05-07, version 0.1.0

- Implemented support for both node.js and the browser.
- Implemented offloading functions.
- Implemented worker proxy.
- Added docs and examples.


## 2014-05-02, version 0.0.1

- Module name registered at npm.
