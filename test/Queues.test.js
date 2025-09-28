var assert = require('assert');
var { FIFOQueue, LIFOQueue } = require('../src/queues');

describe('Queues', function () {

  describe('FIFOQueue', function() {
    var queue;

    beforeEach(function() {
      queue = new FIFOQueue();
    });

    it('should create an empty queue', function() {
      assert.strictEqual(queue.size(), 0);
    });

    it('should push tasks to the queue', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };

      queue.push(task1);
      assert.strictEqual(queue.size(), 1);

      queue.push(task2);
      assert.strictEqual(queue.size(), 2);
    });

    it('should pop tasks in FIFO order', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      queue.push(task1);
      queue.push(task2);
      queue.push(task3);

      assert.strictEqual(queue.pop(), task1);
      assert.strictEqual(queue.pop(), task2);
      assert.strictEqual(queue.pop(), task3);
      assert.strictEqual(queue.size(), 0);
    });

    it('should return undefined when popping from empty queue', function() {
      assert.strictEqual(queue.pop(), undefined);
    });

    it('should correctly report size', function() {
      assert.strictEqual(queue.size(), 0);

      queue.push({ id: 1 });
      assert.strictEqual(queue.size(), 1);

      queue.push({ id: 2 });
      assert.strictEqual(queue.size(), 2);

      queue.pop();
      assert.strictEqual(queue.size(), 1);

      queue.pop();
      assert.strictEqual(queue.size(), 0);
    });

    it('should check if queue contains a task', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      assert.strictEqual(queue.contains(task1), false);

      queue.push(task1);
      queue.push(task2);

      assert.strictEqual(queue.contains(task1), true);
      assert.strictEqual(queue.contains(task2), true);
      assert.strictEqual(queue.contains(task3), false);
    });

    it('should be iterable', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      queue.push(task1);
      queue.push(task2);
      queue.push(task3);

      var tasks = [];
      for (var task of queue) {
        tasks.push(task);
      }

      assert.deepStrictEqual(tasks, [task1, task2, task3]);
    });

    it('should clear all tasks', function() {
      queue.push({ id: 1 });
      queue.push({ id: 2 });
      queue.push({ id: 3 });

      assert.strictEqual(queue.size(), 3);

      queue.clear();

      assert.strictEqual(queue.size(), 0);
      assert.strictEqual(queue.pop(), undefined);
    });

    it('should handle mixed operations correctly', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      queue.push(task1);
      queue.push(task2);
      assert.strictEqual(queue.pop(), task1);

      queue.push(task3);
      assert.strictEqual(queue.pop(), task2);
      assert.strictEqual(queue.pop(), task3);
      assert.strictEqual(queue.size(), 0);
    });
  });

  describe('LIFOQueue', function() {
    var queue;

    beforeEach(function() {
      queue = new LIFOQueue();
    });

    it('should create an empty queue', function() {
      assert.strictEqual(queue.size(), 0);
    });

    it('should push tasks to the queue', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };

      queue.push(task1);
      assert.strictEqual(queue.size(), 1);

      queue.push(task2);
      assert.strictEqual(queue.size(), 2);
    });

    it('should pop tasks in LIFO order', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      queue.push(task1);
      queue.push(task2);
      queue.push(task3);

      assert.strictEqual(queue.pop(), task3);
      assert.strictEqual(queue.pop(), task2);
      assert.strictEqual(queue.pop(), task1);
      assert.strictEqual(queue.size(), 0);
    });

    it('should return undefined when popping from empty queue', function() {
      assert.strictEqual(queue.pop(), undefined);
    });

    it('should correctly report size', function() {
      assert.strictEqual(queue.size(), 0);

      queue.push({ id: 1 });
      assert.strictEqual(queue.size(), 1);

      queue.push({ id: 2 });
      assert.strictEqual(queue.size(), 2);

      queue.pop();
      assert.strictEqual(queue.size(), 1);

      queue.pop();
      assert.strictEqual(queue.size(), 0);
    });

    it('should check if queue contains a task', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      assert.strictEqual(queue.contains(task1), false);

      queue.push(task1);
      queue.push(task2);

      assert.strictEqual(queue.contains(task1), true);
      assert.strictEqual(queue.contains(task2), true);
      assert.strictEqual(queue.contains(task3), false);
    });

    it('should be iterable', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      queue.push(task1);
      queue.push(task2);
      queue.push(task3);

      var tasks = [];
      for (var task of queue) {
        tasks.push(task);
      }

      assert.deepStrictEqual(tasks, [task1, task2, task3]);
    });

    it('should clear all tasks', function() {
      queue.push({ id: 1 });
      queue.push({ id: 2 });
      queue.push({ id: 3 });

      assert.strictEqual(queue.size(), 3);

      queue.clear();

      assert.strictEqual(queue.size(), 0);
      assert.strictEqual(queue.pop(), undefined);
    });

    it('should handle mixed operations correctly', function() {
      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      queue.push(task1);
      queue.push(task2);
      assert.strictEqual(queue.pop(), task2);

      queue.push(task3);
      assert.strictEqual(queue.pop(), task3);
      assert.strictEqual(queue.pop(), task1);
      assert.strictEqual(queue.size(), 0);
    });
  });

  describe('Queue comparison', function() {
    it('should demonstrate FIFO vs LIFO behavior', function() {
      var fifoQueue = new FIFOQueue();
      var lifoQueue = new LIFOQueue();

      var task1 = { id: 1 };
      var task2 = { id: 2 };
      var task3 = { id: 3 };

      // Add same tasks to both queues
      fifoQueue.push(task1);
      fifoQueue.push(task2);
      fifoQueue.push(task3);

      lifoQueue.push(task1);
      lifoQueue.push(task2);
      lifoQueue.push(task3);

      // FIFO should return tasks in order: task1, task2, task3
      assert.strictEqual(fifoQueue.pop(), task1);
      assert.strictEqual(fifoQueue.pop(), task2);
      assert.strictEqual(fifoQueue.pop(), task3);

      // LIFO should return tasks in reverse order: task3, task2, task1
      assert.strictEqual(lifoQueue.pop(), task3);
      assert.strictEqual(lifoQueue.pop(), task2);
      assert.strictEqual(lifoQueue.pop(), task1);
    });
  });
});
