const Maki = require('maki');
const electron = require('electron');
const makiConfig = require('../config/makiConfig');
const BrowserWindow = electron.BrowserWindow;

module.exports = Doorman => {
  // delicious maki...
  Doorman.maki = new Maki(makiConfig);
  Doorman.maki.use(require('maki-client-level'));
  
  Doorman.maki.define('Invitation', {
    email: { type: String }
  });
  
  Doorman.maki.start(function() {
    // TODO: allow build to be called without server
    Doorman.maki.build();
  });
};
