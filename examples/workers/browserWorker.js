// a simple worker for use in the browser (as Web Worker)

// load workerpool
importScripts('../../dist/workerpool.js');

// a deliberately inefficient implementation of the fibonacci sequence
function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 2) + fibonacci(n - 1);
}

function getName() {
  return self.name || 'DefaultNameWorker';
}

// create a worker and register public functions
workerpool.worker({
  fibonacci: fibonacci,
  getName: getName
});
