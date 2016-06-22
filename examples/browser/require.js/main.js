define(['../../../dist/workerpool'], function(workerpool) {
  'use strict';

  var pool = workerpool.pool();

  return pool.exec(function(value) {
    return value + 1;
  }, [1]).then(function(results) {
    document.write('results: ' + results);

    pool.clear();
  });

});