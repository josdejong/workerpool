const assert = require('assert')
const isNode = require('../src/environment').isNode

const test = (process, should) => should(isNode(process))

const shouldBeBrowser = isNode => {
    it('is platform assigned to be browser', function () {
        assert.strictEqual(isNode, false)
    })
}

const shouldBeNode = isNode => {
    it('is platform assigned to be node', function () {
        assert.strictEqual(isNode, true)
    })
}

describe('should distinguish environment', function () {
    test(undefined, shouldBeBrowser)
    test({}, shouldBeBrowser)
    test({ versions: {} }, shouldBeBrowser)
    test({ versions: { node: '10.0.0' } }, shouldBeNode)
})
