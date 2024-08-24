import React from "react";

import workerpool from "workerpool";
import { WorkerUrl } from "worker-url";

const WorkerURL = new WorkerUrl(new URL("./worker/worker.ts", import.meta.url));
const pool = workerpool.pool(WorkerURL.toString(), {
  maxWorkers: 3,
});

const Fibonacci: React.FC = () => {
  const [inputValue, setInputValue] = React.useState("30");
  const [result, setResult] = React.useState({
    result: "",
    cancel: null,
  });

  const calculateFibonacci = React.useCallback(() => {
    if (result.cancel) {
      result.cancel();
      setResult({
        result: "stopped computing fibonacci",
        cancel: null,
      });
      return;
    }

    const n = parseInt(inputValue);

    setResult({
      result: "computing fibonacci(" + n + ")...",
      cancel: null,
    });

    const promise = pool
      .exec("fibonacci", [n])
      .then(function (f) {
        setResult({
          result: "fibonacci(" + n + "): " + f,
          cancel: null,
        });
      })
      .catch(function (error) {
        setResult({
          result: "error during fibonacci(" + n + "): " + error,
          cancel: null,
        });
      });

    setResult({
      result: "computing fibonacci(" + n + ")...",
      cancel: () => {
        promise.cancel();
      },
    });
  }, [inputValue, result]);

  return (
    <section>
      <h3>Simple webworker example</h3>
      <h4>Calculate fibonacci:</h4>
      <input
        type="text"
        id="input"
        value={inputValue}
        onInput={(e) => setInputValue(e.target.value)}
      />
      <input
        type="button"
        id="calculate"
        value={result.cancel ? "Cancel" : "Calculate"}
        onClick={calculateFibonacci}
      />
      <p>Try entering values in the range of 10 to 50.</p>
      <div>{result.result}</div>
    </section>
  );
};

const FibonacciWithFeedback: React.FC = () => {
  const [inputValue, setInputValue] = React.useState("25");
  const [feedback, setFeedback] = React.useState("");
  const [result, setResult] = React.useState({
    result: "",
    cancel: null,
  });

  const calculateVerboseFibonacci = React.useCallback(() => {
    if (result.cancel) {
      result.cancel();
      setResult({
        result: "stopped computing fibonacci",
        cancel: null,
      });
      setFeedback("");
      return;
    }

    const n = parseInt(inputValue);

    const promise = pool
      .exec("fibonacciWithFeedback", [n], {
        on: function (payload) {
          if (payload.status === "in_progress") {
            setFeedback(`In progress: ${payload.detail}...`);
          }
        },
      })
      .then(function (f) {
        setResult({
          result: "fibonacci(" + n + "): " + f,
          cancel: null,
        });
        setFeedback("");
      })
      .catch(function (error) {
        setResult({
          result: "error during fibonacci(" + n + "): " + error,
          cancel: null,
        });
        setFeedback("");
      });

    setResult({
      result: "computing fibonacci(" + n + ")...",
      cancel: () => {
        promise.cancel();
      },
    });
    setFeedback("feedback: started");
  }, [inputValue, result.cancel]);

  return (
    <section>
      <h3>Webworker example with feedback</h3>
      <h4>Calculate fibonacci:</h4>
      <input
        type="text"
        id="input"
        value={inputValue}
        onInput={(e) => setInputValue(e.target.value)}
      />
      <input
        type="button"
        id="calculate"
        value={result.cancel ? "Cancel" : "Calculate"}
        onClick={calculateVerboseFibonacci}
      />
      <p>Try entering values in the range of 15 to 30.</p>
      <div>{feedback}</div>
      <p />
      <div>{result.result}</div>
    </section>
  );
};

const TransferArray: React.FC = () => {
  const [arraySize, setArraySize] = React.useState("100");
  const [feedback, setFeedback] = React.useState("");
  const [result, setResult] = React.useState("");

  const createArray = React.useCallback(() => {
    setFeedback("");
    setResult("");

    const size = parseInt(arraySize);

    const promise = pool
      .exec("createArray", [size], {
        on: function (array) {
          setFeedback(
            `Array of size ${array.buffer.byteLength} bytes is created in the worker.`
          );
        },
      })
      .then(function (f) {
        if (f) {
          setResult("Ok. Array has been transferred.");
        } else {
          setResult("<b>Warning. Array has been cloned.<b>");
        }
      })
      .catch(function (error) {
        setResult(`${error}`);
      });
  }, [arraySize]);

  return (
    <section>
      <h3>Webworker example with data transfer:</h3>
      <h4>Transferring data array from a worker:</h4>
      Input array size:
      <input
        type="text"
        id="inputArraySize"
        value={arraySize}
        onInput={(e) => setArraySize(e.target.value)}
      />
      <input
        type="button"
        id="createArray"
        value="Create array"
        onClick={createArray}
      />
      <p />
      <div>{feedback}</div>
      <p />
      <div>{result}</div>
    </section>
  );
};

const App: React.FC = () => {
  return (
    <div>
      <Fibonacci />
      <FibonacciWithFeedback />
      <TransferArray />
      <section>
        <h3>Note</h3>
        <p>
          Verify that the browser stays responsive when working on a large
          calculation. We have created 3 workers, so the worker pool will handle
          a maximum of three tasks at a time. When exceeding this, tasks will be
          put in a queue.
        </p>
      </section>
    </div>
  );
};

export default App;
