const assert = require('assert')
const requireUncached = id => {
    delete require.cache[require.resolve(id)]
    return require(id)
}

const test = (process, test) => {
    const backup = { process: global.process, self: global.self }
    global.process = process
    global.self = { navigator: { hardwareConcurrency: 8 } }
    const environment = requireUncached('../src/environment')
    Object.assign(global, backup)
    test(environment, process)
}

const shouldBeBrowser = env => {
    it('is platform assigned to be browser', function () {
        assert.strictEqual(env.platform, 'browser')
    })
}

const shouldBeNode = env => {
    it('is platform assigned to be node', function () {
        assert.strictEqual(env.platform, 'node')
    })
}

describe('should distinguish environment', function () {
    test(undefined, shouldBeBrowser)
    test({}, shouldBeBrowser)
    test({ versions: {} }, shouldBeBrowser)
    test({ versions: { node: '10.0.0' } }, shouldBeNode)
})
