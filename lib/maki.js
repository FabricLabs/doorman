'use strict';

const Maki = require('maki');
const config = require('../config/maki');

module.exports = Doorman => {
  // delicious maki...
  Doorman.maki = new Maki(config);
  Doorman.maki.use(require('maki-client-level'));
  Doorman.maki.start();
};
