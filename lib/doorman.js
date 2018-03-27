'use strict';

const Plugin = require('./plugin');
const Router = require('./router');
const Scribe = require('./scribe');

/**
 * General-purpose bot framework.
 * @param       {Object} config Overall configuration object.
 * @constructor
 */
function Doorman (config) {
  let self = this;

  self.config = config || {};
  self.services = {};
  self.triggers = {};

  self.router = new Router();
  self.scribe = new Scribe({
    namespace: 'doorman'
  });
}

require('util').inherits(Doorman, require('events').EventEmitter);

Doorman.prototype.start = function configure () {
  let self = this;

  if (self.config.triggers) {
    Object.keys(self.config.triggers).forEach(name => {
      let route = {
        name: name,
        value: self.config.triggers[name]
      };

      self.router.use(route);
    });
  }

  if (self.config.plugins && Array.isArray(self.config.plugins)) {
    self.config.plugins.forEach(module => self.use(module));
  }

  if (self.config.services && Array.isArray(self.config.services)) {
    self.config.services.forEach(module => self.enable(module));
  }

  if (self.config.debug) {
    this.scribe.log('[DEBUG]', 'triggers:', Object.keys(self.triggers));
  }

  Object.keys(self.services).forEach(function launcher (name) {
    self.services[name].connect();
  });

  this.scribe.log('started!');

  return this;
};

Doorman.prototype.enable = function enable (name) {
  let Service = require(`../services/${name}`);
  let service = new Service(this.config[name]);
  
  console.log('dat service:', service);

  service.on('message', function (msg) {
    console.log('magic handler, incoming magic message:', msg);
  });

  this.services[name] = service;
  this.services[name].connect();

  return this;
};

Doorman.prototype.use = function assemble (plugin) {
  this.scribe.log(`importing ${plugin}...`);

  let handler = Plugin.fromName(plugin);
  this.scribe.log('handler:', handler);

  if (handler) {
    let trigger = this.register(handler);

    if (!trigger) {
      this.scribe.warn(`Could not successfully configure ${plugin}.  Plugin disabled.`);
    }
  }

  return this;
};

Doorman.prototype.register = function configure (handler) {
  if (!handler.name) return false;
  if (!handler.value) return false;

  this.triggers[handler.name] = handler.value;

  return this;
};

Doorman.prototype.parse = function interpret (msg) {
  let answers = this.router.route(msg);
  let message = null;

  if (answers.length) {
    switch (answers.length) {
      case 1:
        message = answers[0];
        break;
      default:
        message = answers.join('\n\n');
        break;
    }
  }

  if (message) {
    this.emit('message', message);
  }

  return message || null;
};

module.exports = Doorman;
