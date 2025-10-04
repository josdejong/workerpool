var workerpool = require("..");

// Simple delayed task function
function delayedTask(taskName, duration) {
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve(taskName + " completed (took " + duration + "ms)");
    }, duration);
  });
}

// FIFO Queue Example (default)
console.log("FIFO Queue Example:");
var fifoPool = workerpool.pool({
  maxWorkers: 1,
  queueStrategy: "fifo",
});

Promise.all([
  fifoPool.exec(delayedTask, ["A", 100]),
  fifoPool.exec(delayedTask, ["B", 50]),
  fifoPool.exec(delayedTask, ["C", 30]),
  fifoPool.exec(delayedTask, ["D", 20]),
])
  .then(function (results) {
    console.log("FIFO Results:", results);
    console.log("Expected order: A, B, C, D\n");
    return fifoPool.terminate();
  })
  .then(function () {
    // LIFO Queue Example
    console.log("LIFO Queue Example:");
    var lifoPool = workerpool.pool({
      maxWorkers: 1,
      queueStrategy: "lifo",
    });

    return Promise.all([
      lifoPool.exec(delayedTask, ["A", 100]),
      lifoPool.exec(delayedTask, ["B", 50]),
      lifoPool.exec(delayedTask, ["C", 30]),
      lifoPool.exec(delayedTask, ["D", 20]),
    ]).then(function (results) {
      console.log("LIFO Results:", results);
      console.log("Expected order: A, D, C, B\n");
      return lifoPool.terminate();
    });
  })
  .then(function () {
    // Priority Queue Example
    console.log("Priority Queue Example:");

    // Simple priority queue implementation
    function PriorityQueue() {
      this.tasks = [];
    }
    PriorityQueue.prototype.push = function (task) {
      this.tasks.push(task);
      this.tasks.sort(function (a, b) {
        var priorityA =
          (a.options && a.options.metadata && a.options.metadata.priority) || 5;
        var priorityB =
          (b.options && b.options.metadata && b.options.metadata.priority) || 5;
        return priorityA - priorityB;
      });
    };
    PriorityQueue.prototype.pop = function () {
      return this.tasks.shift();
    };
    PriorityQueue.prototype.size = function () {
      return this.tasks.length;
    };
    PriorityQueue.prototype.contains = function (task) {
      return this.tasks.includes(task);
    };
    PriorityQueue.prototype.clear = function () {
      this.tasks.length = 0;
    };

    var priorityPool = workerpool.pool({
      maxWorkers: 1,
      queueStrategy: new PriorityQueue(),
    });

    return Promise.all([
      priorityPool.exec(delayedTask, ["A", 100], {
        metadata: { priority: 3 },
      }),
      priorityPool.exec(delayedTask, ["B", 50], {
        metadata: { priority: 1 },
      }),
      priorityPool.exec(delayedTask, ["C", 30], {
        metadata: { priority: 4 },
      }),
      priorityPool.exec(delayedTask, ["D", 20], {
        metadata: { priority: 2 },
      }),
    ]).then(function (results) {
      console.log("Priority Results:", results);
      console.log("Expected order: A, B(p:1), D(p:2), C(p:4)");
      return priorityPool.terminate();
    });
  })
  .catch(function (err) {
    console.error(err);
  });
