import * as esbuild from 'esbuild'
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import { resolve } from 'path';

const watch = process.argv.includes('--watch') || process.argv.includes('-w')

/**
 * @type {import('esbuild-plugin-polyfill-node').PolyfillNodeOptions}
 */
const polyfillConfig = {
  globals: {
    global: false,
    buffer: false,
    __dirname: false,
    __filename: false,
    process: false,
    navigator: false,
  },
  polyfills: {
    child_process: false,
    worker_threads: false,
    process: false,
    os: false
  }
}

/**
 * @type {import('esbuild').BuildOptions}
 */
const config = {
  entryPoints: ['./src/main.js'],
  external: ['child_process', 'process', 'worker_threads', 'os'],
  bundle: true,
  minify: false,
  outfile: './dist/main.js',
  platform: 'browser',
  plugins: [
    polyfillNode(polyfillConfig),
    PluginInlineWorker()
  ],
  logLevel: 'info',
}

if (watch) {
  const context = await esbuild.context(config)
  await context.watch()
} else {
  await esbuild.build(config)
}

/**
 * Based on https://gist.github.com/manzt/689e4937f5ae998c56af72efc9217ef0
 *
 * @param {Pick<import('esbuild').BuildOptions, 'minify' | 'format' | 'plugins'>} opt
 * @return {import('esbuild').Plugin}
 */
function PluginInlineWorker(opt) {
  const namespace = 'inline-worker';
  const prefix = `${namespace}:`;
  return {
    name: namespace,
    setup(build) {
      build.onResolve({ filter: new RegExp(`^${prefix}`) }, (args) => {
        return {
          path: resolve(args.resolveDir, args.path.slice(prefix.length)),
          namespace,
        };
      });
      build.onLoad({ filter: /.*/, namespace }, async (args) => {
        const { outputFiles } = await esbuild.build({
          entryPoints: [args.path],
          bundle: true,
          write: false,
          external: ['child_process', 'process', 'os', 'worker_threads'],
          platform: 'browser',
          plugins: [
            polyfillNode(polyfillConfig)
          ]
        });
        if (outputFiles.length !== 1) {
          throw new Error('Too many files built for worker bundle.');
        }
        const { contents } = outputFiles[0];
        const base64 = Buffer.from(contents).toString('base64');
        return {
          loader: 'js',
          contents: `export default 'data:application/javascript;base64,${base64}';`,
        };
      });
    },
  };
};
