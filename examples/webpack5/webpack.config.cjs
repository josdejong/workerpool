const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const WorkerUrlPlugin = require('worker-url/plugin');
module.exports = {
    mode: "development",
    entry: path.resolve(__dirname, "./src/index.tsx"),
    output: {
        filename: "[name].[hash:8].js",
        path: path.resolve(__dirname, "./dist"),
    },
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],

        // ! webpack5 no longer provides built-in polyfills for Node.js dependencies. 
        alias: {
            "os": false,
            "child_process": false,
            "worker_threads": false
        }
    },
    module: {
        rules: [
            {
                test: /\.tsx?/,
                use: [
                    'babel-loader'
                ],
                exclude: /node_moudles/
            },
        ]
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, "./public/index.html"),
        }),
        new WorkerUrlPlugin(),
    ],
    devServer: {
        allowedHosts: 'all',
        host: '0.0.0.0',
        port: 8080
    }
};
