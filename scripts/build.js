'use strict';

// Writes the console HTML shell to `assets/index.html`. The browser bundle it
// loads (`assets/bundles/browser.min.js`) is produced by `npm run build:browser`
// (webpack); `npm run build` runs both.

const fs = require('fs');
const path = require('path');

const settings = require('../settings/local');
const Interface = require('../components/interface');

async function main (input = {}) {
  const site = new Interface({ title: input.name || '@fabric/doorman' });
  const target = path.resolve(__dirname, '..', 'assets', 'index.html');
  const html = site._getHTML();

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);

  const bundle = path.resolve(__dirname, '..', 'assets', 'bundles', 'browser.min.js');
  if (!fs.existsSync(bundle)) {
    console.warn('[BUILD:SITE]', `No bundle at ${bundle} — run \`npm run build:browser\`.`);
  }

  return {
    site: site.id,
    target,
    bytes: html.length
  };
}

// Run Program
main(settings).catch((exception) => {
  console.error('[BUILD:SITE]', '[EXCEPTION]', exception);
  process.exitCode = 1;
}).then((output) => {
  if (output) console.log('[BUILD:SITE]', '[OUTPUT]', output);
});
