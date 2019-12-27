'use strict';

const Fabric = require('@fabric/core');

/**
 * Plugins are the developer-facing component of Doorman.  Used to configure
 * behavior by consumers, developers can rely on the Plugin prototype to provide
 * basic functionality needed by an instanced plugin.
 */
class Plugin extends Fabric.Scribe {
  /**
   * Create an instance of a plugin.
   * @param {Object} config Configuration to be passed to plugin.
   */
  constructor (config) {
    super(config);

    this.config = Object.assign({
      store: './data/unconfigured-plugin'
    }, config);

    return this;
  }

  /**
   * Static method for loading a plugin from disk.
   * @param  {String} name Name of the plugin to load.
   * @return {Mixed}      Loaded plugin, or `null`.
   */
  static fromName (name) {
    let disk = new Fabric.Disk();
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
  }

  trust (fabric) {
    this.fabric = fabric;
    return this;
  }

  /**
   * Route a request to its appropriate handler.
   * @param  {Mixed} request Temporarily mixed type.
   * @return {Plugin}         Chainable method.
   */
  route (request) {
    this.emit('request', request);
    return this;
  }

  /**
   * Attach the router to a particular message channel.
   * @param  {String} channel Name of channel.
   * @return {Plugin}         Chainable method.
   */
  subscribe (channel) {
    if (!this.fabric) return new Error('No Fabric instance supplied.  Failing.');
    this.fabric.on(channel, this.route.bind(this));
    return this;
  }
}

module.exports = Plugin;
