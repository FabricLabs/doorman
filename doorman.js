'use strict';

const config = require('./config');
const Doorman = require('./lib/doorman');

function main () {
  let doorman = new Doorman(config);
  doorman.start();
}

main();
