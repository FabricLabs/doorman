'use strict';

const util = require('util');
const crypto = require('crypto');

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

  self.config = Object.assign({
    trigger: '!'
  }, config || {});

  self.plugins = {};
  self.services = {};
  self.triggers = {};

  self.router = new Router({ trigger: self.config.trigger });
  self.scribe = new Scribe({ namespace: 'doorman' });

  self.router.trust(self);

  return self;
}

util.inherits(Doorman, require('events').EventEmitter);

Doorman.prototype.start = function configure () {
  let self = this;

  self.enable('local');

  if (self.config.services && Array.isArray(self.config.services)) {
    self.config.services.forEach(service => self.enable(service));
  }

  if (self.config.plugins && Array.isArray(self.config.plugins)) {
    self.config.plugins.forEach(module => self.use(module));
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

  self.register({
    name: 'help',
    value: `Available triggers: ${Object.keys(self.triggers).map(x => '`' + self.config.trigger + x + '`').join(', ')}`
  });

  if (self.config.debug) {
    this.scribe.log('[DEBUG]', 'triggers:', Object.keys(self.triggers));
  }

  self.emit('ready');

  this.scribe.log('started!');

  return this;
};

Doorman.prototype.enable = function enable (name) {
  let self = this;

  let Service = require(`../services/${name}`);
  let service = new Service(this.config[name]);

  self.scribe.log(`enabling service "${name}"...`);

  service.on('patch', function (patch) {
    self.emit('patch', Object.assign({}, patch, {
      path: name + patch.path // TODO: check in Vector Machine that this is safe
    }));
  });

  service.on('user', function (user) {
    self.emit('user', {
      id: [name, 'users', user.id].join('/'),
      name: user.name,
      online: user.online || false,
      subscriptions: []
    });
  });

  service.on('channel', function (channel) {
    self.emit('channel', {
      id: [name, 'channels', channel.id].join('/'),
      name: channel.name,
      members: []
    });
  });

  service.on('join', async function (join) {
    self.emit('join', {
      user: [name, 'users', join.user].join('/'),
      channel: [name, 'channels', join.channel].join('/')
    });
  });

  service.on('message', async function (msg) {
    let now = Date.now();
    let id = [now, msg.actor, msg.target, msg.object].join('/');
    let hash = crypto.createHash('sha256').update(id).digest('hex');
    let message = {
      id: [name, 'messages', (msg.id || hash)].join('/'),
      actor: [name, 'users', msg.actor].join('/'),
      target: [name, 'channels', msg.target].join('/'),
      object: msg.object,
      origin: {
        type: 'Link',
        name: name
      },
      created: now
    };

    self.emit('message', message);

    let response = await self.parse(message);
    if (response) {
      self.emit('response', {
        parent: message,
        response: response
      });

      service.send(msg.target, response, {
        parent: message
      });
    }
  });

  service.on('ready', function () {
    self.emit('service', { name });
  });

  this.services[name] = service;
  this.services[name].connect();

  return this;
};

/**
 * Configure Doorman to use a Plugin.
 * @param  {Mixed} plugin Can be of type Map (trigger name => behavior) or Plugin (constructor function).
 * @return {Doorman} Chainable method.
 */
Doorman.prototype.use = function assemble (plugin) {
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

  self.scribe.log(`enabling plugin "${name}"...`, Handler);

  if (!Handler) return false;
  if (Handler instanceof Function) {
    util.inherits(Handler, Plugin);

    let handler = new Handler(self.config[name]);

    handler.on('message', function (message) {
      let parts = message.target.split('/');
      self.services[parts[0]].send(parts[2], message.object);
    });

    self.plugins[name] = handler;
    self.plugins[name].trust(self).start();

    if (self.plugins[name].triggers) {
      Object.keys(self.plugins[name].triggers).forEach(trigger => {
        self.register(Object.assign({
          plugin: name
        }, self.plugins[name].triggers[trigger]));
      });
    }
  } else {
    Object.keys(Handler).forEach(name => {
      let value = Handler[name];
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

  return message || null;
};

Doorman.prototype._joinRoom = function (channel) {
  for (let id in this.services) {
    let result = this.services[id].join(channel);
    console.log(`service ${id} join: ${result}`);
  }
};

module.exports = Doorman;
