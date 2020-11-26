/**
 * embeddedWorker.js contains an embedded version of worker.js.
 * This file is automatically generated,
 * changes made in this file will be overwritten.
 */
module.exports = "!function(t){var o={};function n(e){if(o[e])return o[e].exports;var r=o[e]={i:e,l:!1,exports:{}};return t[e].call(r.exports,r,r.exports,n),r.l=!0,r.exports}n.m=t,n.c=o,n.d=function(e,r,t){n.o(e,r)||Object.defineProperty(e,r,{enumerable:!0,get:t})},n.r=function(e){\"undefined\"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:\"Module\"}),Object.defineProperty(e,\"__esModule\",{value:!0})},n.t=function(r,e){if(1&e&&(r=n(r)),8&e)return r;if(4&e&&\"object\"==typeof r&&r&&r.__esModule)return r;var t=Object.create(null);if(n.r(t),Object.defineProperty(t,\"default\",{enumerable:!0,value:r}),2&e&&\"string\"!=typeof r)for(var o in r)n.d(t,o,function(e){return r[e]}.bind(null,o));return t},n.n=function(e){var r=e&&e.__esModule?function(){return e.default}:function(){return e};return n.d(r,\"a\",r),r},n.o=function(e,r){return Object.prototype.hasOwnProperty.call(e,r)},n.p=\"\",n(n.s=0)}([function(module,exports,__webpack_require__){var requireFoolWebpack=eval(\"typeof require !== 'undefined' ? require : function (module) { throw new Error('Module \\\" + module + \\\" not found.') }\"),EventEmitter=__webpack_require__(1),TERMINATE_METHOD_ID=\"__workerpool-terminate__\",worker={exit:function(){},eventEmitter:new EventEmitter},WorkerThreads,parentPort;if(\"undefined\"!=typeof self&&\"function\"==typeof postMessage&&\"function\"==typeof addEventListener)worker.on=function(e,r){addEventListener(e,function(e){r(e.data)})},worker.send=function(e){postMessage(e)};else{if(\"undefined\"==typeof process)throw new Error(\"Script must be executed as a worker\");try{WorkerThreads=requireFoolWebpack(\"worker_threads\")}catch(error){if(\"object\"!=typeof error||null===error||\"MODULE_NOT_FOUND\"!==error.code)throw error}WorkerThreads&&null!==WorkerThreads.parentPort?(parentPort=WorkerThreads.parentPort,worker.send=parentPort.postMessage.bind(parentPort),worker.on=parentPort.on.bind(parentPort)):(worker.on=process.on.bind(process),worker.send=process.send.bind(process),worker.on(\"disconnect\",function(){process.exit(1)}),worker.exit=process.exit.bind(process))}function convertError(t){return Object.getOwnPropertyNames(t).reduce(function(e,r){return Object.defineProperty(e,r,{value:t[r],enumerable:!0})},{})}function isPromise(e){return e&&\"function\"==typeof e.then&&\"function\"==typeof e.catch}worker.methods={},worker.methods.run=function run(fn,args){var f=eval(\"(\"+fn+\")\");return f.apply(Object.assign(f,this),args)},worker.methods.methods=function(){return Object.keys(worker.methods)},worker.on(\"message\",function(t){if(t===TERMINATE_METHOD_ID)return worker.exit(0);if(t.eventName)return worker.eventEmitter.emit(t.eventName,t.eventData);try{var e=worker.methods[t.method];if(!e)throw new Error('Unknown method \"'+t.method+'\"');e=e.apply(Object.assign(e,{emit:function(e,r){worker.send({eventName:e,eventData:r,id:t.id})},on:function(e,r){worker.eventEmitter.on(e,r)},once:function(e,r){worker.eventEmitter.once(e,r)}}),t.params);isPromise(e)?e.then(function(e){worker.send({id:t.id,result:e,error:null})}).catch(function(e){worker.send({id:t.id,result:null,error:convertError(e)})}):worker.send({id:t.id,result:e,error:null})}catch(e){worker.send({id:t.id,result:null,error:convertError(e)})}}),worker.register=function(e){if(e)for(var r in e)e.hasOwnProperty(r)&&(worker.methods[r]=e[r]);worker.send(\"ready\")},exports.add=worker.register},function(r,e,t){var o=t(2);function n(){this.callbacks={}}n.prototype.removeListener=function(e,r){if(this.callbacks[e]){if(\"function\"!=typeof r)throw TypeError(\"listener must be a function\");for(var t=this.callbacks[e],o=-1,n=t.length;0<n--;)if(t[n]===r||t[n].listener&&t[n].listener===r){o=n;break}if(o<0)return this;1===t.length?(t.length=0,delete this.callbacks[e]):t.splice(o,1)}},n.prototype.on=function(e,r){this.callbacks[e]||(this.callbacks[e]=[]),this.callbacks[e].push(r)},n.prototype.emit=function(e,r){let t=this.callbacks[e];t&&t.forEach(function(e){e(r)})},n.prototype.once=function(t,o){(function e(r){o(r),this.removeListener(t,e)}).bind(this),this.on(t,listener)};try{r.exports=o(\"events\")}catch(e){r.exports=n}},function(module,exports){var requireFoolWebpack=eval(\"typeof require !== 'undefined' ? require : function (module) { throw new Error('Module \\\" + module + \\\" not found.') }\");module.exports=requireFoolWebpack}]);";
