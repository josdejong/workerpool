const assert = require('assert')
const isNode = require('../src/environment').isNode
const Pool = require('../src/Pool')
const tryRequire = require('./utils').tryRequire

describe('Environment Detection', function () {
  it('is platform assigned to be browser', function () {
    assert.strictEqual(isNode(undefined), false)
    assert.strictEqual(isNode({}), false)
    assert.strictEqual(isNode({ versions: {} }), false)
    assert.strictEqual(isNode({ versions: { node: '10.0.0' } }), false)
  })

  it('is platform assigned to be node', function () {
    assert.strictEqual(isNode(process), true)
  })
})

describe('Main Thread Detection', function () {
  it('should detect isMainThread in main process', function () {
    assert.strictEqual(require('../src/environment').isMainThread, true);
  })

  it('should detect isMainThread in child_process', function () {
    var pool = new Pool(__dirname + '/workers/testIsMainThread.js', { workerType: 'process' });

    return pool.exec('isMainThread').then(function (result) {
      pool.terminate();
      assert.strictEqual(result, false);
    })
  })

  it('should detect isMainThread in worker_thread', function () {
    if (tryRequire('worker_threads')) {
      var pool = new Pool(__dirname + '/workers/testIsMainThread.js', { workerType: 'thread' });

      return pool.exec('isMainThread').then(function (result) {
        pool.terminate();
        assert.strictEqual(result, false);
      })
    } else {
      // do nothing, this version of node.js doesn't support worker_threads
      console.log('Skipping test for isMainThread using worker_threads: ' +
        'this version of node.js doesn\'t have support for worker_threads.')
    }
  })
})
