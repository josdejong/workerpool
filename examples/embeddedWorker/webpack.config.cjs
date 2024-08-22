const path = require("path");
module.exports = {
    mode: "production",
    entry: path.resolve(__dirname, './app.js'),
    resolve: {
        fallback: {
            "os": false,
            "child_process": false,
            "worker_threads": false
        }
    },
    optimization: {
        minimize: false
    }
};
