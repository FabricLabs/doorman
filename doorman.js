var config = require('./config');

var Maki = require('maki');
var doorman = new Maki(config);

doorman.use(require('maki-client-level'));

doorman.start();
