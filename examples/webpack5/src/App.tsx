import workerpool from 'workerpool'
import { createSignal } from 'solid-js';
import { WorkerUrl } from 'worker-url';
function App() {
  const WorkerURL = new WorkerUrl(new URL('./worker/worker.ts', import.meta.url))
  const pool = workerpool.pool(WorkerURL.toString(), {
    maxWorkers: 3,
  });


  const calculate = () => {
    const results = document.getElementById('results')!;
    const n = parseInt(inputValue());
    const result = document.createElement('div');
    result.innerHTML = 'fibonacci(' + n + ') = ... ';
    results.appendChild(result);

    const promise = pool.exec('fibonacci', [n])
      .then(function (f) {
        result.innerHTML = 'fibonacci(' + n + ') = ' + f;
      })
      .catch(function (error) {
        result.innerHTML = 'fibonacci(' + n + ') = ' + error;
      });

    const a = document.createElement('a')!;
    a.innerHTML = 'cancel';
    a.href = '#';
    a.onclick = function () {
      promise.cancel();
    };
    result.appendChild(a);
  };

  const createArray = () => {
    const size = parseInt(inputArraySize());
    const results = document.getElementById('arrayResults')!;
    const result = document.createElement('div');
    results.appendChild(result);
    const p = document.createElement('p')!;
    const promise = pool.exec('createArray', [size], { on: function (array) {
      const p = document.createElement('p');
      p.innerHTML = `Array of size ${array.buffer.byteLength} bytes is created in the worker.`;
      result.appendChild(p);
    }}).then(function (f) {
      const p = document.createElement('p');
      if (f) {
        p.innerHTML = 'Ok. Array has been transferred.';
      }
      else {
        p.innerHTML = '<b>Warning. Array has been cloned.<b>';
      }
      result.appendChild(p);
    }).catch(function (error) { 
        result.innerHTML = `${error}`;
    });

  };

  const [inputValue, setInputValue] = createSignal('30')
  const [inputArraySize, setArraySize] = createSignal('100')

  return <div>
    <section>
      <h4>Calculate fibonacci:</h4>
      <input type="text" id="input" value={inputValue()} oninput={(e) => setInputValue(e.target.value)} />
      <input type="button" id="calculate" value="Calculate" onclick={calculate} />

      <p>
        Try entering values in the range of 10 to 50.
        Verify that the browser stays responsive when working on a large calculation.
        We have created 3 workers, so the worker pool will handle a maximum of three
        tasks at a time. When exceeding this, tasks will be put in a queue.
      </p>
      <div id="results"></div>
    </section>
    <section>
      <h4>Test transferring array from a worker:</h4>
      Input array size:      
      <input type="text" id="inputArraySize" value={inputArraySize()} oninput={(e) => setArraySize(e.target.value)} />
      <input type="button" id="createArray" value="Create array!" onclick={createArray} />
      <div id="arrayResults"></div>
    </section>
  </div>
}

export default App
