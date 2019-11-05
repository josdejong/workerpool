var requireFoolWebpack = require('./requireFoolWebpack');

// source: https://github.com/flexdinesh/browser-or-node
var isNode = function (nodeProcess) {
    return (
        typeof nodeProcess !== 'undefined' &&
        nodeProcess.versions != null &&
        nodeProcess.versions.node != null
    );
}
module.exports.isNode = isNode

// determines the JavaScript platform: browser or node
module.exports.platform = isNode(process)
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
