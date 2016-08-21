# workerpool history
https://github.com/josdejong/workerpool


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
