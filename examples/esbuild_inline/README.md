# Workerpool embedded worker example

In a browser environment, the `script` argument in `workerpool.pool(script)` can also be a data URL like `'data:application/javascript;base64,...'`. This allows embedding the bundled code of a worker in your main application, which is demonstrated in this example.

> !!! Note that this example only works in the browser, not in node.js !!!

## Run

The build script is based on @manzt's [gist](https://gist.github.com/manzt/689e4937f5ae998c56af72efc9217ef0).

Install the dependencies:

```
npm install
```

Build the bundled version of `main.js` (`dist/main.js`):

```
npm run build
```

Then open index.html in your browser.

## How does it work?

1.  When bundling `src/fib.js`, esbuild converts `src/fib.js` to
     ```js
     export default 'data:application/javascript;base64,...';
     ```

2.  When bundling `src/main.js`, esbuild converts the following line

    ```js
    import workerDataUrl from 'inline-worker:./fib.js';
    ```
    
    to 

    ```js
    const workerDataUrl = 'data:application/javascript;base64,...';
    ```
3. esbuild bundles the both files to `dist/main.js`.