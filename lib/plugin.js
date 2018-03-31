'use strict';

const util = require('util');
const Disk = require('./disk');

function Plugin (doorman) {
  this.doorman = doorman;
}

util.inherits(Plugin, require('events').EventEmitter);

Plugin.fromName = function (name) {
  let disk = new Disk();
  let path = `plugins/${name}`;
  let plugin = null;

  if (disk.exists(path + '.js') || disk.exists(path)) {
    plugin = disk.get(path);
  } else {
    try {
      plugin = require(`doorman-${name}`);
    } catch (E) {
      console.error('could not load:', E);
    }
  }

  return plugin;
};

Plugin.prototype.trust = function connect (fabric) {
  this.fabric = fabric;
  return this;
};

Plugin.prototype.router = function handler (request) {
  console.log('router handling:', request);

  return this;
};

Plugin.prototype.start = function initialize () {
  return this;
};

Plugin.prototype.subscribe = function (channel) {
  if (!this.fabric) return new Error('No Fabric instance supplied.  Failing.');
  this.fabric.on(channel, this.router.bind(this));
  return this;
};

module.exports = Plugin;
