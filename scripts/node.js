'use strict';

const settings = require('../settings/local');
const Doorman = require('../services/doorman');

async function main (input = {}) {
  const doorman = new Doorman(input);
  await doorman.start();

  return {
    id: doorman.id
  };
}

main(settings).catch((exception) => {
  console.error('[FABRIC:DOORMAN]', 'Main Process Exception:', exception);
}).then((output) => {
  console.log('[FABRIC:DOORMAN]', 'Main Process Output:', output);
});
