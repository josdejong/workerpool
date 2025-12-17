/**
 * Worker that intentionally crashes for testing crash handling
 */
var workerpool = require('../../../');

// Register worker methods
workerpool.worker({
  // This method crashes the worker via uncaught exception
  crashWithException: function() {
    // Use setTimeout to throw outside the promise chain
    setTimeout(function() {
      throw new Error('Intentional uncaught crash');
    }, 10);
    // Return a never-resolving promise to keep the worker busy
    return new Promise(function() {});
  },

  // This method crashes via process.exit
  crashWithExit: function(exitCode) {
    setTimeout(function() {
      process.exit(exitCode || 1);
    }, 10);
    // Return a never-resolving promise
    return new Promise(function() {});
  },

  // Normal function that works
  add: function(a, b) {
    return a + b;
  }
});
