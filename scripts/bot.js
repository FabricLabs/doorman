'use strict';

const Doorman = require('../types/doorman');

async function main () {
  const doorman = new Doorman();
  await doorman.start();
}

main().catch((exception) => {
  console.error('[DOORMAN:BOT]', 'Main Process Exception:', exception);
});