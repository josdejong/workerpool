var workerpool = require('../../index');

function doNothing () {
}

// let worker alive after disconnect no matter whether disconnect event is handled(otherwise worker will exit due to no loop remaining)
setInterval(function () {
}, 1000);

workerpool.worker({
  doNothing: doNothing
});
