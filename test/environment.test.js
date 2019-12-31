const assert = require('assert')
const isNode = require('../src/environment').isNode

describe('Environment Detection', function () {
  it('is platform assigned to be browser', function () {
    assert.strictEqual(isNode(undefined), false)
    assert.strictEqual(isNode({}), false)
    assert.strictEqual(isNode({ versions: {} }), false)
  })

  it('is platform assigned to be node', function () {
    assert.strictEqual(isNode({ versions: { node: '10.0.0' } }), true)
  })
})
