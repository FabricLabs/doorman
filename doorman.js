'use strict';

require('debug-trace')({ always: true });

const config = require('./config');
const Doorman = require('./lib/doorman');

function main () {
  let doorman = new Doorman(config);
  doorman.start();
}

main();
