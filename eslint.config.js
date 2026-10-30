'use strict';

const neostandard = require('neostandard');

module.exports = [
  {
    // neostandard ≥0.14 scopes its `ignores` option to its own rules; a bare
    // `ignores` entry keeps ESLint from reading these paths at all.
    ignores: [
      'docs/**',
      'tests/**',
      'node_modules/**',
      'assets/**',
      'reports/**',
      'coverage/**'
    ]
  },
  ...neostandard({
    semi: true // Enforce semicolons (same as semistandard)
  })
];
