'use strict';

const Disk = require('./disk');

const Fabric = require('./fabric');
const Service = require('./service');

/**
 * Plugins are the developer-facing component of Doorman.  Used to configure
 * behavior by consumers, developers can rely on the Plugin prototype to provide
 * basic functionality needed by an instanced plugin.
 * @constructor
 */
class Plugin extends Service {
  constructor (config) {
    super(config);

    this.config = Object.assign({
      store: './data/unconfigured-plugin'
    }, config);
  }
}

/**
 * Static method for loading a plugin from disk.
 * @param  {String} name Name of the plugin to load.
 * @return {Mixed}      Loaded plugin, or `null`.
 */
Plugin.fromName = function (name) {
  let disk = new Disk();
  let path = `plugins/${name}`;
  let real = `doorman-${name}`;
  let fallback = `./node_modules/doorman/${path}.js`;
  let plugin = null;

  if (disk.exists(path + '.js') || disk.exists(path)) {
    plugin = disk.get(path);
  } else if (disk.exists(fallback)) {
    try {
      plugin = disk.get(fallback);
    } catch (E) {
      if (this.config && this.config.debug) {
        console.warn('Error loading module (fallback):', E);
      }
    }
  } else if (disk.exists(`node_modules/${real}`)) {
    try {
      plugin = require(real);
    } catch (E) {
      if (this.config && this.config.debug) {
        console.warn('Error loading module (real):', E);
      }
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
 * Stop the plugin.  This method is generally overridden by the child.
 * @return {Plugin} Chainable method.
 */
Plugin.prototype.stop = function initialize () {
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
