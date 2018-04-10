'use strict';

const util = require('util');
const Disk = require('./disk');

/**
 * Plugins are the developer-facing component of Doorman.  Used to configure
 * behavior by consumers, developers can rely on the Plugin prototype to provide
 * basic functionality needed by an instanced plugin.
 * @constructor
 */
function Plugin (doorman) {

}

util.inherits(Plugin, require('events').EventEmitter);

/**
 * Static method for loading a plugin from disk.
 * @param  {String} name Name of the plugin to load.
 * @return {Mixed}      Loaded plugin, or `null`.
 */
Plugin.fromName = function (name) {
  let disk = new Disk();
  let path = `plugins/${name}`;
  let real = `doorman-${name}`;
  let plugin = null;

  if (disk.exists(path + '.js') || disk.exists(path)) {
    plugin = disk.get(path);
  } else if (disk.exists(`node_modules/${real}`)) {
    try {
      plugin = require(real);
    } catch (E) {
      // console.warn('Error loading module:', E);
    }
  } else {
    plugin = name;
  }

  return plugin;
};

Plugin.prototype.trust = function connect (fabric) {
  this.fabric = fabric;
  return this;
};

/**
 * Route a request to its appropriate handler.
 * @param  {Mixed} request Temporarily mixed type.
 * @return {Plugin}         Chainable method.
 */
Plugin.prototype.route = function handler (request) {
  this.emit('request', request);
  return this;
};

/**
 * Start the plugin.  This method is generally overridden by the child.
 * @return {Plugin} Chainable method.
 */
Plugin.prototype.start = function initialize () {
  return this;
};

/**
 * Attach the router to a particular message channel.
 * @param  {String} channel Name of channel.
 * @return {Plugin}         Chainable method.
 */
Plugin.prototype.subscribe = function (channel) {
  if (!this.fabric) return new Error('No Fabric instance supplied.  Failing.');
  this.fabric.on(channel, this.route.bind(this));
  return this;
};

module.exports = Plugin;
