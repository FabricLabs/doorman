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

  self.router = new Router({ trigger: config.trigger });
  self.scribe = new Scribe({ namespace: 'doorman' });

  return self;
}

require('util').inherits(Doorman, require('events').EventEmitter);

Doorman.prototype.start = function configure () {
  let self = this;

  if (self.config.triggers) {
    Object.keys(self.config.triggers).forEach(name => {
      let route = {
        name: self.config.trigger + name,
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

  this.scribe.log('started!');

  return this;
};

Doorman.prototype.enable = function enable (name) {
  let self = this;

  let Service = require(`../services/${name}`);
  let service = new Service(this.config[name]);

  service.on('message', async function (msg) {
    let response = await self.parse(msg.object);
    if (response) {
      service.send(msg.target, response);
    }
  });

  this.services[name] = service;
  this.services[name].connect();

  return this;
};

Doorman.prototype.use = function assemble (plugin) {
  let self = this;
  let handler = Plugin.fromName(plugin);

  if (handler) {
    Object.keys(handler).forEach(name => {
      let value = handler[name];
      self.register({ name, value });
    });
  }

  return this;
};

Doorman.prototype.register = function configure (handler) {
  if (!handler.name) return false;
  if (!handler.value) return false;

  this.triggers[handler.name] = handler.value;
  this.router.use(handler);

  this.emit('trigger', handler);

  return this;
};

Doorman.prototype.parse = async function interpret (msg) {
  let answers = await this.router.route(msg);
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
