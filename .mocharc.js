'use strict';

module.exports = {
  timeout: 10000,
  'forbid-only': Boolean(process.env.CI)
};
