/**
 * Worker must be started as a child process. It listens for RPC messages from
 * the parent process.
 */

// TODO: implement WebWorker support (browser)

/**
 * Test whether a value is a Promise via ducktyping.
 * @param {*} value
 * @returns {boolean} Returns true when given value is an object
 *                    having functions `then` and `catch`.
 */
function isPromise(value) {
  return value && (typeof value.then === 'function') && (typeof value.catch === 'function');
}

process.on('message', function (request) {
  try {
    switch(request.method) {
      case 'run':
          // {method: 'run', params: {fn: String, args: [...]}}
          // TODO: test existence of fn and params
          var fn = eval('(' + request.params.fn + ')');
          var args = request.params.args;
          var result = fn.apply(fn, args);

          if (isPromise(result)) {
            // promise returned, resolve this and then return
            result
                .then(function (result) {
                  process.send({
                    id: request.id,
                    result: result,
                    error: null
                  });
                })
                .catch(function (err) {
                  process.send({
                    id: request.id,
                    result: null,
                    error: err.toString()
                  });
                });
          }
          else {
            // immediate result
            process.send({
              id: request.id,
              result: result,
              error: null
            });
          }
        break;

      default:
          //noinspection ExceptionCaughtLocallyJS
          throw new Error('Unknown method "' + request.method + '"');
    }
  }
  catch (err) {
    process.send({
      id: request.id,
      result: null,
      error: err.toString() // TODO: now to create a serializable error?
    });
  }
});
