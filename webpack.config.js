'use strict';

/**
 * Browser bundle for the Doorman console (`components/DoormanInterface.js`).
 * Output: `assets/bundles/browser.min.js`, loaded by `assets/index.html`
 * (compiled by `scripts/build.js`). Mirrors hub.fabric.pub's config so the
 * `@fabric/hub` Bridge (and `@fabric/core` under it) bundle the same way.
 */

const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');

const browserCrypto = require.resolve('@fabric/http/functions/browserCrypto');

/** When @fabric/* is npm-linked, transitive deps live under the clone; webpack must see them too. */
function linkedFabricResolvePaths () {
  const hubs = path.join(__dirname, 'node_modules');
  const out = [];
  for (const pkg of ['@fabric/core', '@fabric/http', '@fabric/hub']) {
    let p = path.join(hubs, pkg);
    try {
      p = fs.realpathSync(p);
    } catch (_) {
      continue;
    }
    const nested = path.join(p, 'node_modules');
    if (fs.existsSync(nested)) out.push(nested);
  }
  return out;
}

function optionalResolve (name) {
  try {
    return require.resolve(name);
  } catch (_) {
    return false;
  }
}

module.exports = (env, argv) => {
  const mode = (argv && argv.mode) || 'production';
  const nodeModules = path.resolve(__dirname, 'node_modules');

  return {
    mode,
    devtool: mode === 'production' ? false : 'eval-source-map',
    entry: './scripts/browser.js',
    parallelism: 1,
    output: {
      path: path.resolve(__dirname, 'assets/bundles'),
      filename: 'browser.min.js',
      publicPath: '/bundles/',
      clean: mode === 'production'
    },
    cache: false,
    experiments: {
      asyncWebAssembly: true
    },
    optimization: {
      concatenateModules: false,
      minimize: mode === 'production',
      minimizer: [new TerserPlugin({ parallel: false })]
    },
    performance: { hints: false },
    module: {
      rules: [
        { test: /\.wasm$/, type: 'webassembly/async' },
        {
          test: /\.(js|jsx)$/,
          // `@fabric/hub` components ship as JSX source; transpile them too.
          exclude: /node_modules\/(?!@fabric\/hub\/)/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          }
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.jsx'],
      conditionNames: ['require', 'browser', 'default'],
      fullySpecified: false,
      modules: [nodeModules, ...linkedFabricResolvePaths(), 'node_modules'],
      alias: {
        '@noble/hashes/sha256': optionalResolve('@noble/hashes/sha2.js') || path.join(nodeModules, '@noble/hashes/sha2.js'),
        '@noble/hashes/sha512': optionalResolve('@noble/hashes/sha2.js') || path.join(nodeModules, '@noble/hashes/sha2.js'),
        '@noble/hashes/hmac': optionalResolve('@noble/hashes/hmac.js') || path.join(nodeModules, '@noble/hashes/hmac.js'),
        '@noble/hashes/ripemd160': optionalResolve('@noble/hashes/legacy.js') || path.join(nodeModules, '@noble/hashes/legacy.js'),
        '@noble/hashes/sha1': optionalResolve('@noble/hashes/legacy.js') || path.join(nodeModules, '@noble/hashes/legacy.js'),
        'node:crypto': browserCrypto,
        'react-dom/server': path.join(nodeModules, 'react-dom/server.browser.js')
      },
      fallback: {
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        crypto: browserCrypto,
        'node:crypto': browserCrypto,
        path: require.resolve('path-browserify'),
        buffer: require.resolve('buffer'),
        stream: require.resolve('stream-browserify'),
        process: require.resolve('process/browser')
      }
    },
    plugins: [
      new webpack.ProvidePlugin({
        Buffer: ['buffer', 'Buffer'],
        process: 'process/browser'
      })
    ]
  };
};
