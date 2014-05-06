/**
 * worker must be started as a child process or a web worker.
 * It listens for RPC messages from the parent process.
 */

// create a worker API for sending and receiving messages which works both on
// node.js and in the browser
var worker = {};
if (typeof process !== 'undefined') {
  // node.js
  worker.on = process.on.bind(process);
  worker.send = process.send.bind(process);
}
else if (typeof postMessage === 'function' && typeof addEventListener === 'function'){
  // browser
  worker.on = function (event, callback) {
    addEventListener(event, function (message) {
      callback(message.data);
    })
  };
  worker.send = function (message) {
    postMessage(message);
  };
}
else {
  throw new Error('Script must be executed as a worker');
}

/**
 * Test whether a value is a Promise via duck typing.
 * @param {*} value
 * @returns {boolean} Returns true when given value is an object
 *                    having functions `then` and `catch`.
 */
function isPromise(value) {
  return value && (typeof value.then === 'function') && (typeof value.catch === 'function');
}

worker.on('message', function (request) {
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
                worker.send({
                  id: request.id,
                  result: result,
                  error: null
                });
              })
              .catch(function (err) {
                worker.send({
                  id: request.id,
                  result: null,
                  error: err.toString() // TODO: now to create a serializable error?
                });
              });
        }
        else {
          // immediate result
          worker.send({
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
    worker.send({
      id: request.id,
      result: null,
      error: err.toString() // TODO: now to create a serializable error?
    });
  }
});
