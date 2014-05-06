// determines the JavaScript environment: browser or node
module.exports = (typeof window !== 'undefined') ? 'browser' : 'node';
