var fs = require('fs'),
    gulp = require('gulp'),
    gutil = require('gulp-util'),
    webpack = require('webpack'),
    uglify = require('uglify-js');

var ENTRY       = './index.js',
    HEADER      = './lib/header.js',
    FILE        = 'workerpool.js',
    FILE_MIN    = 'workerpool.min.js',
    FILE_MAP    = 'workerpool.map',
    DIST        = './dist',
    LIB_JS     = DIST + '/' + FILE,
    LIB_MIN_JS = DIST + '/' + FILE_MIN,
    LIB_MAP_JS = DIST + '/' + FILE_MAP;

// generate banner with today's date and correct version
function createBanner() {
  var today = gutil.date(new Date(), 'yyyy-mm-dd'); // today, formatted as yyyy-mm-dd
  var version = require('./package.json').version;  // module version

  return String(fs.readFileSync(HEADER))
      .replace('@@date', today)
      .replace('@@version', version);
}

var bannerPlugin = new webpack.BannerPlugin(createBanner(), {
  entryOnly: true,
  raw: true
});

var webpackConfig = {
  entry: ENTRY,
  output: {
    library: 'workerpool',
    libraryTarget: 'umd',
    path: DIST,
    filename: FILE
  },
  plugins: [ bannerPlugin ],
  cache: true
};

var uglifyConfig = {
  outSourceMap: FILE_MAP,
  output: {
    comments: /@license/
  }
};

// create a single instance of the compiler to allow caching
var compiler = webpack(webpackConfig);

gulp.task('bundle', function (cb) {
  // update the banner contents (has a date in it which should stay up to date)
  bannerPlugin.banner = createBanner();

  compiler.run(function (err, stats) {
    if (err) {
      gutil.log(err);
    }

    gutil.log('bundled ' + LIB_JS);

    cb();
  });
});

gulp.task('minify', ['bundle'], function () {
  var result = uglify.minify([LIB_JS], uglifyConfig);

  fs.writeFileSync(LIB_MIN_JS, result.code + '\n//# sourceMappingURL=' + FILE_MAP);
  fs.writeFileSync(LIB_MAP_JS, result.map);

  gutil.log('Minified ' + LIB_MIN_JS);
  gutil.log('Mapped ' + LIB_MAP_JS);
});

// The default task (called when you run `gulp`)
gulp.task('default', ['bundle', 'minify']);

// The watch task (to automatically rebuild when the source code changes)
gulp.task('watch', ['bundle', 'minify'], function () {
  gulp.watch(['index.js', 'lib/**/*.js'], ['bundle', 'minify']);
});
