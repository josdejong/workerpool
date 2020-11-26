var requireFoolWebpack = require('./requireFoolWebpack');

function EventEmitter() {
    this.callbacks = {};
}

EventEmitter.prototype.removeListener = function(event, listener) {
    if(!this.callbacks[event]) return;
    if(typeof listener !== 'function') {
        throw TypeError('listener must be a function');
    }

    var list = this.callbacks[event];
    var length = list.length;
    var i;
    var position = -1;

    // https://github.com/nodejs/node-v0.x-archive/blob/ed0d1c384cd4578f7168633c838f1252bddb260e/lib/events.js#L226-L227
    for (i = length; i-- > 0;) {
        if (list[i] === listener ||
            (list[i].listener && list[i].listener === listener)) {
          position = i;
          break;
        }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this.callbacks[event];
    } else {
      list.splice(position, 1);
    }
}

EventEmitter.prototype.on = function(event, cb) {
    if(!this.callbacks[event]) this.callbacks[event] = [];
    this.callbacks[event].push(cb)
};

EventEmitter.prototype.emit = function(event, data){
    let cbs = this.callbacks[event]
    if(cbs){
        cbs.forEach(function(cb) { cb(data) })
    }
}

EventEmitter.prototype.once  = function(event, cb) {
    (function listener(data) {
        cb(data);
        this.removeListener(event, listener)
    }).bind(this);

    this.on(event, listener);
}

try {
    module.exports = requireFoolWebpack('events');
} catch(erro) {   
    module.exports = EventEmitter;
}

