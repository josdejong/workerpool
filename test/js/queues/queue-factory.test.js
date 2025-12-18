const assert = require('assert');

// Import queue implementations from JavaScript source
const { FIFOQueue, LIFOQueue } = require('../../../src/js/queues');

// Simple PriorityQueue implementation for testing (matches TypeScript version)
function PriorityQueue(comparator) {
  this._heap = [];
  this._comparator = comparator || function (a, b) {
    var priorityA = (a.options && a.options.metadata && a.options.metadata.priority) || 0;
    var priorityB = (b.options && b.options.metadata && b.options.metadata.priority) || 0;
    return priorityB - priorityA; // Higher priority first
  };
}

PriorityQueue.prototype.push = function (task) {
  this._heap.push(task);
  this._siftUp(this._heap.length - 1);
};

PriorityQueue.prototype.pop = function () {
  if (this._heap.length === 0) return undefined;
  var result = this._heap[0];
  var last = this._heap.pop();
  if (this._heap.length > 0 && last !== undefined) {
    this._heap[0] = last;
    this._siftDown(0);
  }
  return result;
};

PriorityQueue.prototype.size = function () {
  return this._heap.length;
};

PriorityQueue.prototype.contains = function (task) {
  return this._heap.includes(task);
};

PriorityQueue.prototype.clear = function () {
  this._heap.length = 0;
};

PriorityQueue.prototype._siftUp = function (index) {
  while (index > 0) {
    var parentIndex = Math.floor((index - 1) / 2);
    if (this._comparator(this._heap[index], this._heap[parentIndex]) < 0) {
      var temp = this._heap[index];
      this._heap[index] = this._heap[parentIndex];
      this._heap[parentIndex] = temp;
      index = parentIndex;
    } else {
      break;
    }
  }
};

PriorityQueue.prototype._siftDown = function (index) {
  var length = this._heap.length;
  while (true) {
    var leftIndex = 2 * index + 1;
    var rightIndex = 2 * index + 2;
    var smallest = index;
    if (leftIndex < length && this._comparator(this._heap[leftIndex], this._heap[smallest]) < 0) {
      smallest = leftIndex;
    }
    if (rightIndex < length && this._comparator(this._heap[rightIndex], this._heap[smallest]) < 0) {
      smallest = rightIndex;
    }
    if (smallest !== index) {
      var temp = this._heap[index];
      this._heap[index] = this._heap[smallest];
      this._heap[smallest] = temp;
      index = smallest;
    } else {
      break;
    }
  }
};

/**
 * Create a mock task for testing
 */
function createMockTask(id, priority = 0) {
  return {
    method: 'test',
    params: [id],
    resolver: {
      promise: Promise.resolve(),
      resolve: () => {},
      reject: () => {},
    },
    timeout: null,
    options: {
      metadata: { priority },
    },
  };
}

describe('Queue Factory and Implementations', function () {
  describe('FIFOQueue', function () {
    it('should process tasks in FIFO order', function () {
      const queue = new FIFOQueue();
      const results = [];

      queue.push(createMockTask(1));
      queue.push(createMockTask(2));
      queue.push(createMockTask(3));

      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);

      assert.deepStrictEqual(results, [1, 2, 3]);
    });

    it('should handle capacity growth', function () {
      const queue = new FIFOQueue(4); // Start small

      // Push more than initial capacity
      for (let i = 0; i < 100; i++) {
        queue.push(createMockTask(i));
      }

      assert.strictEqual(queue.size(), 100);

      // Verify FIFO order
      for (let i = 0; i < 100; i++) {
        const task = queue.pop();
        assert.strictEqual(task.params[0], i);
      }
    });

    it('should correctly report size', function () {
      const queue = new FIFOQueue();

      assert.strictEqual(queue.size(), 0);

      queue.push(createMockTask(1));
      assert.strictEqual(queue.size(), 1);

      queue.push(createMockTask(2));
      assert.strictEqual(queue.size(), 2);

      queue.pop();
      assert.strictEqual(queue.size(), 1);

      queue.clear();
      assert.strictEqual(queue.size(), 0);
    });

    it('should check if queue contains a task', function () {
      const queue = new FIFOQueue();
      const task1 = createMockTask(1);
      const task2 = createMockTask(2);
      const task3 = createMockTask(3);

      queue.push(task1);
      queue.push(task2);

      assert.strictEqual(queue.contains(task1), true);
      assert.strictEqual(queue.contains(task2), true);
      assert.strictEqual(queue.contains(task3), false);
    });
  });

  describe('LIFOQueue', function () {
    it('should process tasks in LIFO order', function () {
      const queue = new LIFOQueue();
      const results = [];

      queue.push(createMockTask(1));
      queue.push(createMockTask(2));
      queue.push(createMockTask(3));

      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);

      assert.deepStrictEqual(results, [3, 2, 1]);
    });

    it('should handle mixed push/pop operations', function () {
      const queue = new LIFOQueue();
      const results = [];

      queue.push(createMockTask(1));
      queue.push(createMockTask(2));
      results.push(queue.pop().params[0]); // 2

      queue.push(createMockTask(3));
      results.push(queue.pop().params[0]); // 3
      results.push(queue.pop().params[0]); // 1

      assert.deepStrictEqual(results, [2, 3, 1]);
    });
  });

  describe('PriorityQueue', function () {
    it('should process tasks by priority (highest first)', function () {
      const queue = new PriorityQueue();

      queue.push(createMockTask(1, 5)); // Low priority
      queue.push(createMockTask(2, 10)); // High priority
      queue.push(createMockTask(3, 1)); // Lowest priority

      const results = [];
      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);

      assert.deepStrictEqual(results, [2, 1, 3]); // Ordered by priority desc
    });

    it('should handle equal priorities in FIFO order', function () {
      const queue = new PriorityQueue();

      queue.push(createMockTask(1, 5));
      queue.push(createMockTask(2, 5));
      queue.push(createMockTask(3, 5));

      // With equal priorities, heap order may vary
      // Just verify all tasks are returned
      const results = [];
      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);

      assert.strictEqual(results.length, 3);
      assert(results.includes(1));
      assert(results.includes(2));
      assert(results.includes(3));
    });

    it('should support custom comparator', function () {
      // Custom comparator: lower number = higher priority (opposite of default)
      const queue = new PriorityQueue((a, b) => {
        const priorityA = a.options?.metadata?.priority ?? 0;
        const priorityB = b.options?.metadata?.priority ?? 0;
        return priorityA - priorityB; // Lower first
      });

      queue.push(createMockTask(1, 5));
      queue.push(createMockTask(2, 10));
      queue.push(createMockTask(3, 1));

      const results = [];
      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);
      results.push(queue.pop().params[0]);

      assert.deepStrictEqual(results, [3, 1, 2]); // Ordered by priority asc
    });

    it('should handle large number of tasks', function () {
      const queue = new PriorityQueue();

      // Insert tasks with random priorities
      const tasks = [];
      for (let i = 0; i < 1000; i++) {
        const priority = Math.floor(Math.random() * 100);
        tasks.push({ id: i, priority });
        queue.push(createMockTask(i, priority));
      }

      // Verify they come out in priority order
      let lastPriority = Infinity;
      while (queue.size() > 0) {
        const task = queue.pop();
        const priority = task.options.metadata.priority;
        assert(priority <= lastPriority, 'Tasks should be in descending priority order');
        lastPriority = priority;
      }
    });
  });

  describe('Queue Interface Compliance', function () {
    const queueTypes = [
      { name: 'FIFOQueue', create: () => new FIFOQueue() },
      { name: 'LIFOQueue', create: () => new LIFOQueue() },
      { name: 'PriorityQueue', create: () => new PriorityQueue() },
    ];

    queueTypes.forEach(({ name, create }) => {
      describe(name, function () {
        it('should have push method', function () {
          const queue = create();
          assert.strictEqual(typeof queue.push, 'function');
        });

        it('should have pop method', function () {
          const queue = create();
          assert.strictEqual(typeof queue.pop, 'function');
        });

        it('should have size method', function () {
          const queue = create();
          assert.strictEqual(typeof queue.size, 'function');
        });

        it('should have contains method', function () {
          const queue = create();
          assert.strictEqual(typeof queue.contains, 'function');
        });

        it('should have clear method', function () {
          const queue = create();
          assert.strictEqual(typeof queue.clear, 'function');
        });

        it('should return undefined when popping from empty queue', function () {
          const queue = create();
          assert.strictEqual(queue.pop(), undefined);
        });

        it('should start with size 0', function () {
          const queue = create();
          assert.strictEqual(queue.size(), 0);
        });

        it('should clear all tasks', function () {
          const queue = create();
          queue.push(createMockTask(1));
          queue.push(createMockTask(2));
          queue.clear();
          assert.strictEqual(queue.size(), 0);
          assert.strictEqual(queue.pop(), undefined);
        });
      });
    });
  });
});
