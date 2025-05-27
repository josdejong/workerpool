/**

The MIT License (MIT)

Copyrights    Alorel, Seulgi Kim, Emily M Klassen

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/workerpool/workerpool-tests.ts

 */
import * as wp from "../../types/";

wp.pool("foo");
wp.pool({ minWorkers: 1 });
wp.pool({ minWorkers: "max" });
wp.pool({ minWorkers: "max", maxWorkers: 1 });
wp.pool({ minWorkers: 1, maxWorkers: 1 });
wp.pool({ maxWorkers: 1 });
wp.pool({ maxQueueSize: 5 });
wp.pool({ workerType: "process" });
wp.pool({ workerType: "thread" });
wp.pool({ workerType: "web" });
wp.pool({ workerType: "auto" });
wp.pool({ workerTerminateTimeout: 50 });
wp.pool({ forkArgs: ["foo", "bar"] });
wp.pool({ forkOpts: { cwd: "/tmp" } });
wp.pool({ workerThreadOpts: { workerData: { foo: "bar" } } });
wp.pool({
    onCreateWorker: ({ forkArgs, forkOpts, script, workerThreadOpts }) => ({
        forkArgs,
        forkOpts,
        script,
        workerThreadOpts,
    }),
});
wp.pool({
    onTerminateWorker: ({ forkArgs, forkOpts, script, workerThreadOpts }) => ({
        forkArgs,
        forkOpts,
        script,
        workerThreadOpts,
    }),
});
const pool: wp.Pool = wp.pool();
pool.terminate()
    .then(() => pool.terminate())
    .then(() => pool.terminate())
    .then(() => pool.terminate(true))
    .then(() => pool.terminate(false))
    .then(() => pool.terminate(true))
    .then(() => pool.terminate(false))
    .then(() => pool.terminate(false, 1000));

let x: number = pool.stats().activeTasks;
x = pool.stats().busyWorkers;
x = pool.stats().idleWorkers;
x = pool.stats().pendingTasks;
x = pool.stats().totalWorkers;

pool.terminate().then(() => {});
pool.proxy().then(() => {});
pool.exec("foo", null)
    .then(() => pool.exec("foo", []))
    .then(() => pool.exec(() => {}, null));

function add(a: number, b: number): number {
    wp.workerEmit({ status: "in_progress" });
    return a + b;
}

function hello(): string {
    return "hello";
}

pool.exec(add, [1, 2]).then((c: number) => c);
pool.exec<typeof add>("add", [1, 2], { on: payload => console.log(payload) }).then((c: number) => c);
pool.exec(hello, []).then((s: string) => s);

const workers = { add, hello };
type IWorkers = typeof workers;
pool.proxy<IWorkers>().then((proxy: wp.Proxy<IWorkers>) => {
    proxy.add(1, 2);
    proxy.hello();
});

function sayHello(message: string) {
    console.log(message);
}
pool.proxy<IWorkers>().then(proxy => proxy.hello()).then(sayHello);

pool.proxy().then(proxy => {
    proxy.add(1, 2);
    proxy.hello();
});

new wp.Promise.CancellationError();
new wp.Promise.TimeoutError();

let promises: wp.Promise<any[]> = wp.Promise.all([
    pool.exec("foo", null),
    pool.exec("foo", null),
    pool.exec("foo", null),
]);
promises = wp.Promise.all([]);

const promiseLike: PromiseLike<any[]> = promises;

wp.worker({ a: () => 1, b: () => 2 });
wp.worker(undefined, { onTerminate: () => {} });
wp.worker(undefined, { onTerminate: () => Promise.resolve() });
wp.worker({ a: () => 1, b: () => 2 }, { onTerminate: () => {} });
wp.worker(undefined, undefined);

new wp.Transfer("foo", []);

const p: Promise<string> = pool.exec<() => string>('hello').then((a) => a);
