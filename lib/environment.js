// used to prevent webpack from resolving requires on node libs
var node = {require: require};

// determines the JavaScript platform: browser or node
module.exports.platform = typeof Window !== 'undefined' || typeof WorkerGlobalScope !== 'undefined' ? 'browser' : 'node';

// determines whether the code is running in main thread or not
module.exports.isMainThread = module.exports.platform === 'browser' ? typeof Window !== 'undefined' : !process.connected;

// determines the number of cpus available
module.exports.cpus = module.exports.platform === 'browser'
  ? self.navigator.hardwareConcurrency
  : node.require('os').cpus().length;  // call node.require to prevent `os` to be required when loading with AMD