/**
 * FIFO Queue implementation
 * @constructor
 * @implements {import('./types').TaskQueue}
 */
function FIFOQueue() {
  this.tasks = [];
}

FIFOQueue.prototype.push = function (task) {
  this.tasks.push(task);
}

FIFOQueue.prototype.pop = function() {
  return this.tasks.shift();
};

FIFOQueue.prototype.size = function() {
  return this.tasks.length;
};

FIFOQueue.prototype.contains = function(task) {
  return this.tasks.includes(task);
}

FIFOQueue.prototype[Symbol.iterator] = function () {
  return this.tasks[Symbol.iterator]();
}


FIFOQueue.prototype.clear = function() {
  this.tasks.length = 0;
}

/**
 * LIFO Queue implementation
 * @constructor
 * @implements {import('./types').TaskQueue}
 */
function LIFOQueue() {
  this.tasks = [];
}

LIFOQueue.prototype.push = function(task) {
  this.tasks.push(task);
};

LIFOQueue.prototype.pop = function() {
  return this.tasks.pop();
};

LIFOQueue.prototype.size = function() {
  return this.tasks.length;
};

LIFOQueue.prototype.contains = function(task) {
  return this.tasks.includes(task);
}

LIFOQueue.prototype[Symbol.iterator] = function () {
  return this.tasks[Symbol.iterator]();
}

LIFOQueue.prototype.clear = function() {
  this.tasks.length = 0;
}

module.exports = { FIFOQueue, LIFOQueue };