const Doorman = require('../doorman');
const Maki = require('maki');

//delicious maki...
var makiConfig = require('../config/makiConfig');
Doorman.maki = new Maki(makiConfig);
Doorman.maki.use(require('maki-client-level'));
Doorman.maki.start();