var config = require('./config');

var Maki = require('maki');
var doorman = new Maki(config);
var electron = require('electron');
var BrowserWindow = electron.BrowserWindow;

var path = require('path');
var url = require('url');

doorman.define('Invitation', {
  email: { type: String }
});

doorman.use(require('maki-client-level'));

doorman.start(function() {
  // TODO: allow build to be called without server
  doorman.build();
});
