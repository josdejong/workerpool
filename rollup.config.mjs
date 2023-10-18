import fse from "fs-extra";
import resolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import commonjs from "@rollup/plugin-commonjs";
import format from 'date-format'
import terser from '@rollup/plugin-terser';
const packages = fse.readJSONSync("./package.json");
function createBanner() {
    var today = format.asString('yyyy-MM-dd', new Date()); // today, formatted as yyyy-MM-dd
    var version = packages.version;  // module version

    return String(fse.readFileSync('./src/header.js'))
        .replace('@@date', today)
        .replace('@@version', version);
}
// 防止打包时删除 ts 的类型注解
fse.emptyDirSync("./dist/");
fse.copyFileSync('./src/header.js', './dist/workerpool.min.js.LICENSE.txt')
const commonPlugin = [
    resolve({
        extensions: [".js", ".ts", ".html"],
        moduleDirectories: [],
        preferBuiltins: false,
        browser: true
    }),
    babel({
        extensions: [".js", ".ts"],
        babelHelpers: "bundled",
    }),
    commonjs()
];
const commonOutput = {
    banner: createBanner(),
    format: "umd",
    sourcemap: true
}
export default [
    {
        input: "./src/index.js",
        output: {
            file: "./dist/workerpool.js",
            name: "workerpool",
            ...commonOutput
        },
        plugins: commonPlugin
    },
    {
        input: "./src/worker.js",
        output: {
            file: "./dist/worker.js",
            name: "worker",
            ...commonOutput
        },
        plugins: commonPlugin

    },
    {
        input: "./src/index.js",
        output: {
            file: "./dist/workerpool.min.js",
            name: "workerpool",
            ...commonOutput,
            banner: "/*! For license information please see workerpool.min.js.LICENSE.txt */",
        },
        plugins: [
            ...commonPlugin,
            terser({
                maxWorkers: 4
            })
        ],
    },
    {
        input: "./src/worker.js",
        output: {
            file: "./dist/worker.min.js",
            name: "worker",
            ...commonOutput,
            banner: "/*! For license information please see workerpool.min.js.LICENSE.txt */"
        },
        plugins: [
            ...commonPlugin,
            terser({
                maxWorkers: 4
            })
        ],
    },
];
