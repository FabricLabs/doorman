'use strict';

const util = require('util');
const Disk = require('./disk');

function Plugin (doorman) {
  this.doorman = doorman;
}

util.inherits(Plugin, require('events').EventEmitter);

Plugin.fromName = function (name) {
  let disk = new Disk('../');
  let path = `plugins/${name}`;
  let plugin = null;

  if (disk.exists(path)) {
    plugin = require(path);
  } else {
    try {
      plugin = require(`doorman-${name}`);
    } catch (E) {
      console.error('could not load:', E);
    }
  }

  return plugin;
};

Plugin.prototype.register = function attach (doorman) {
  this.doorman = doorman;
};

module.exports = Plugin;
