import { arrayBuffer } from 'stream/consumers';
import workerpool, { worker } from 'workerpool'

// a deliberately inefficient implementation of the fibonacci sequence
function fibonacci(n: number): number {
  if (n < 2) return n;
  return fibonacci(n - 2) + fibonacci(n - 1);
}

// As ArrayBuffer.prototype.detached is a rather recent feature it is not used here.
function isDetached (buffer: ArrayBuffer) : boolean {
  try {
    const array = new Uint8Array (buffer);
    return false;
  } 
  catch (error) {
    return true;
  }
}

function createArray(size: number) : boolean {
  const array = size > 0 ? new Uint8Array(size) : new Uint8Array();
  workerpool.workerEmit(new workerpool.Transfer(array, [array.buffer]));
  return isDetached(array.buffer);
}

// create a worker and register public functions
workerpool.worker({
  fibonacci: fibonacci,
  createArray: createArray
});
