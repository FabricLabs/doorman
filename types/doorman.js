'use strict';

// Doorman was built for Fabric, an alternative to the World Wide Web.
const Fabric = require('@fabric/core');

// ## Submodules
// Here, we load some submodules.  You can browse their definitions by running
// `npm run docs` to compile a local copy of Doorman's documentation based on
// your current working directory.
const Disk = require('./disk');
const Router = require('./router');
const Plugin = require('./plugin');

// Used to create plugins later on.
// TODO: refactor & remove
const util = require('util');
const merge = require('lodash.merge');

/**
 * General-purpose bot framework.
 */
class Doorman extends Fabric {
  /**
   * Construct a Doorman.
   * @param {Object} config Configuration.
   * @param {Object} config.path Local path for {@link Store}.
   * @param {Array} config.services List of services to enable.
   * @param {String} config.trigger Prefix to use as a trigger.
   */
  constructor (config) {
    super(config);

    this.config = merge({
      path: './stores/doorman',
      services: [
        'local'
      ],
      trigger: '!'
    }, config);

    this.triggers = {};

    this.router = new Router({ trigger: this.config.trigger });
    this.router.trust(this);

    return this;
  }

  static Service (name) {
    let disk = new Disk();
    let path = `services/${name}`;
    let fallback = `node_modules/@fabric/doorman/${path}.js`;
    let plugin = null;

    // load from local `services` path, else fall back to Doorman
    if (disk.exists(path + '.js') || disk.exists(path)) {
      plugin = disk.get(path);
    } else if (disk.exists(fallback)) {
      plugin = disk.get(fallback);
    } else if (Fabric.registry[name]) {
      plugin = Fabric.registry[name];
    } else {
      plugin = Fabric.Service;
    }

    return plugin;
  }

  /**
   * Look for triggers in a message.
   * @param  {Message}  msg Message to evaluate.
   */
  async parse (msg) {
    let answers = await this.router.route(msg);
    let message = null;

    if (answers && answers.length) {
      switch (answers.length) {
        case 1:
          message = answers[0];
          break;
        default:
          message = answers.join('\n\n');
          break;
      }
    } else {
      console.warn('[DOORMAN:CORE]', '[PARSER]', `Input message ${msg} did not get routed to any services:`, msg);
    }

    return message || null;
  }

  async _loadServices () {
    const self = this;

    for (let i in self.config.services) {
      try {
        let name = self.config.services[i].toLowerCase();
        let service = self.constructor.Service(name);

        // Register and enable if we have service
        if (service) {
          await self.register(service);
          await self.enable(name);
        }
      } catch (exception) {
        console.error('[DOORMAN:CORE]', exception);
      }
    }

    return this;
  }

  /**
   * Activates a Doorman instance.
   * @return {Doorman} Chainable method.
   */
  async start () {
    let self = this;

    await this._loadServices();
    // identify ourselves to the network
    await this.identify();

    if (self.config.plugins && Array.isArray(self.config.plugins)) {
      for (let name in self.config.plugins) {
        self.use(self.config.plugins[name]);
      }
    }

    if (self.config.triggers) {
      Object.keys(self.config.triggers).forEach(name => {
        let route = {
          name: self.config.trigger + name,
          value: self.config.triggers[name]
        };

        self.router.use(route);
      });
    }

    self._defineTrigger({
      name: 'help',
      value: `Available triggers: ${Object.keys(self.triggers).map(x => '`' + self.config.trigger + x + '`').join(', ')}`
    });

    if (self.config.debug) {
      this.log('[DEBUG]', 'triggers:', Object.keys(self.triggers));
    }

    this.log('started!');

    return this;
  }

  /**
   * Halt a Doorman instance.
   * @return {Doorman} Chainable method.
   */
  async stop () {
    let self = this;

    self.log('Stopping...');

    if (self.plugins) {
      for (let name in self.plugins) {
        await self.plugins[name].stop();
      }
    }

    await super.stop();

    self.log('Stopped!');

    return self;
  }

  /**
   * Configure Doorman to use a Plugin.
   * @param  {Mixed} plugin Can be of type Map (trigger name => behavior) or Plugin (constructor function).
   * @return {Doorman} Chainable method.
   */
  use (plugin) {
    let self = this;
    let name = null;
    let Handler = null;

    if (typeof plugin === 'string') {
      Handler = Plugin.fromName(plugin);
      name = plugin;
    } else if (plugin instanceof Function) {
      Handler = plugin;
      name = Handler.name.toLowerCase();
    } else {
      Handler = plugin;
    }

    self.log(`enabling plugin "${name}"...`, Handler);

    if (!Handler) return false;
    if (Handler instanceof Function) {
      util.inherits(Handler, Plugin);

      let handler = new Handler(self.config[name]);

      handler.on('whisper', function (whisper) {
        let parts = whisper.target.split('/');
        self.services[parts[0]].whisper(parts[2], whisper.message);
      });

      handler.on('message', function (message) {
        self.log(`[PLUGIN:${name.toUpperCase()}]`, 'sent (unhandled) message:', message);
        let parts = message.target.split('/');
        self.services[parts[0]].send(parts[2], message.object);
      });

      self.plugins[name] = handler;
      self.plugins[name].trust(self).start();

      if (self.plugins[name].triggers) {
        console.log(`plugin "${name}" has triggers:`, self.plugins[name].triggers);
        Object.keys(self.plugins[name].triggers).forEach(trigger => {
          self._defineTrigger(Object.assign({
            plugin: name
          }, self.plugins[name].triggers[trigger]));
        });
      }
    } else {
      Object.keys(Handler).forEach(name => {
        let value = Handler[name];
        self._defineTrigger({ name, value });
      });
    }

    return this;
  }

  /**
   * Register a Trigger.
   * @param  {Trigger} handler Trigger to handle.
   * @return {Doorman}         Instance of Doorman configured to handle Trigger.
   */
  _defineTrigger (handler) {
    if (!handler.name) return false;
    if (!handler.value) return false;

    this.triggers[handler.name] = handler.value;
    this.router.use(handler);

    this.emit('trigger', handler);

    return this;
  }

  _joinRoom (channel) {
    for (let id in this.services) {
      let result = this.services[id].join(channel);
      this.log(`service ${id} join: ${result}`);
    }
  }
}

module.exports = Doorman;
