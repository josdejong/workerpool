/**
 * Worker must be started as a child process. It listens for RPC messages from
 * the parent process.
 */

// TODO: implement support for Promises
// TODO: implement WebWorker support (browser)

process.on('message', function (request) {
  try {
    switch(request.method) {
      case 'run':
          // {method: 'run', params: {fn: String, args: [...]}}
          // TODO: test existence of fn and params
          var fn = eval('(' + request.params.fn + ')');
          var args = request.params.args;
          var result = fn.apply(fn, args);

          process.send({
            id: request.id,
            result: result,
            error: null
          });
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
