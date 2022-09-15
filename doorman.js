'use strict';

const settings = require('./settings/local');
const Doorman = require('./services/doorman');

async function main () {
  const doorman = new Doorman(settings);
  await doorman.start();
  return {
    id: doorman.id
  };
}

main().catch((exception) => {
  console.error('[FABRIC:DOORMAN]', 'Main Process Exception:', exception);
}).then((output) => {
  console.log('[FABRIC:DOORMAN]', 'Main Process Output:', output);
});
