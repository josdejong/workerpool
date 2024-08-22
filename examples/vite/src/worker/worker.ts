import workerpool from 'workerpool'

// a deliberately inefficient implementation of the fibonacci sequence
function fibonacci(n: number): number {
  if (n < 2) return n;
  return fibonacci(n - 2) + fibonacci(n - 1);
}

// create a worker and register public functions
workerpool.worker({
  fibonacci: fibonacci
});
