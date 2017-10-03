const Maki = require('maki');
const makiConfig = require('../config/makiConfig');

module.exports = Doorman => {
  //delicious maki...
  Doorman.maki = new Maki(makiConfig);
  Doorman.maki.use(require('maki-client-level'));
  Doorman.maki.start();
};
