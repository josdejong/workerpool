exports.tryRequire = function (moduleName) {
  try {
    return require(moduleName);
  } catch(error) {
    if (typeof error === 'object' && error !== null && error.code === 'MODULE_NOT_FOUND') {
      return null;
    } else {
      throw error;
    }
  }
}
