var requireFoolWebpack = require('./requireFoolWebpack');

// source: https://github.com/flexdinesh/browser-or-node
var isNode = (
    typeof process !== 'undefined' &&
    typeof process.versions != null &&
    process.versions.node != null);

// determines the JavaScript platform: browser or node
module.exports.platform = isNode
    ? 'node'
    : 'browser';

// determines whether the code is running in main thread or not
module.exports.isMainThread = isNode
    ? !process.connected
    : typeof Window !== 'undefined';

// determines the number of cpus available
module.exports.cpus = module.exports.platform === 'browser'
    ? self.navigator.hardwareConcurrency
    : requireFoolWebpack('os').cpus().length;
