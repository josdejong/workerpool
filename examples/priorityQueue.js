var workerpool = require("..");

/**
 * The worker pool supports the `queueStrategy` option, which controls
 * how queued tasks are scheduled for execution.
 *
 * Supported values:
 * - `'fifo'` (default): Built-in First-In-First-Out queue.
 * - `'lifo'`: Built-in Last-In-First-Out queue.
 * - `Custom`: A user-defined queue strategy object that must implement:
 *   - `push`: Add a task to the queue.
 *   - `pop`: Remove and return the next task according to the strategy.
 *   - `size`: Return the number of tasks currently in the queue.
 *   - `contains`: Check whether a task exists in the queue.
 *   - `clear`: Remove all tasks from the queue.
 *
 * Note: when the pool has available workers, a newly submitted task may start executing immediately
 * and thus will not be subject to the queue strategy. The `queueStrategy` only affects
 * the order of tasks waiting in the queue.
 *
 * The following is a simple example of a custom **priority queue** implementation:
 */
function PriorityQueue() {
  this.tasks = [];
}
PriorityQueue.prototype.push = function (task) {
  this.tasks.push(task);
  // sort tasks by priority (lower number = higher priority)
  this.tasks.sort(function (a, b) {
    var priorityA =
      (a.options && a.options.metadata && a.options.metadata.priority) || 5;
    var priorityB =
      (b.options && b.options.metadata && b.options.metadata.priority) || 5;
    return priorityA - priorityB;
  });
};
PriorityQueue.prototype.pop = function () {
  // task queue is sorted by priority, so just return the first task
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

// Create a worker pool with custom priority queue
var priorityPool = workerpool.pool({
  maxWorkers: 1,
  queueStrategy: new PriorityQueue(),
});

// Simple task function
function log(something) {
  console.log(something);
}

Promise.all([
  priorityPool.exec(log, ["A"], {
    metadata: { priority: 3 },
  }),
  priorityPool.exec(log, ["B"], {
    metadata: { priority: 1 },
  }),
  priorityPool.exec(log, ["C"], {
    metadata: { priority: 4 },
  }),
  priorityPool.exec(log, ["D"], {
    metadata: { priority: 2 },
  }),
]).then(function () {
  console.log("All tasks completed");
  // When pool is initially idle, "A" runs immediately; queued tasks follow priority order.
  console.log("Expected order: A, B(p:1), D(p:2), C(p:4)");
  return priorityPool.terminate();
});
