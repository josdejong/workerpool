import workerpool from 'workerpool';
import workerDataUrl from 'inline-worker:./fib.js';

async function main() {
  const pool = workerpool.pool(workerDataUrl);
  const result = await pool.exec('fibonacci', [10]);
  console.log('Result: ' + result);
  pool.terminate();
}

main();
