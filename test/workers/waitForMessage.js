// a simple worker that just sits there and receives messages

// load workerpool
var workerpool = require('../../');

function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 2) + fibonacci(n - 1);
}

// create a worker and register public functions
workerpool.worker({
  fibonacci: fibonacci,
}, {
  killme: function (payload) {
    process.exit(payload);
  }
});
