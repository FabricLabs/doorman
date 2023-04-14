'use strict';

const util = require('util');
const crypto = require('crypto');

const Plugin = require('../types/plugin');
const Router = require('../types/router');
const Scribe = require('../types/scribe');

const Service = require('@fabric/core/types/service');
const HTTPServer = require('@fabric/http/types/server');

/**
 * General-purpose bot framework.
 * @param       {Object} config Overall configuration object.
 * @constructor
 */
class Doorman extends Service {
  constructor (config = {}) {
    super(config);

    this.config = Object.assign({
      trigger: '!'
    }, config || {});

    this.settings = Object.assign({
      http: {
        hostname: 'localhost',
        interface: '0.0.0.0',
        port: 4444,
        resources: {
          'Provider': {}
        }
      }
    }, this.config, config);

    this.plugins = {};
    this.services = {};
    this.triggers = {};

    this.router = new Router({ trigger: this.config.trigger });
    this.scribe = new Scribe({ namespace: 'doorman' });

    this.http = new HTTPServer(this.settings.http)

    this.router.trust(this);

    return this;
  }

  register (handler) {
    if (!handler.name) return false;
    if (!handler.value) return false;

    this.triggers[handler.name] = handler.value;
    this.router.use(handler);

    this.emit('trigger', handler);

    return this;
  }

  async start () {
    this.enable('local');

    if (this.config.services && Array.isArray(this.config.services)) {
      this.config.services.forEach(service => this.enable(service));
    }

    if (this.config.plugins && Array.isArray(this.config.plugins)) {
      this.config.plugins.forEach(module => this.use(module));
    }

    if (this.config.triggers) {
      Object.keys(this.config.triggers).forEach(name => {
        let route = {
          name: this.config.trigger + name,
          value: this.config.triggers[name]
        };

        this.router.use(route);
      });
    }

    await this.http.start();

    this.register({
      name: 'help',
      value: `Available triggers: ${Object.keys(this.triggers).map(x => '`' + this.config.trigger + x + '`').join(', ')}`
    });

    if (this.config.debug) {
      this.scribe.log('[DEBUG]', 'triggers:', Object.keys(this.triggers));
    }

    this.emit('ready');

    this.scribe.log('started!');

    return this;
  }

  enable (name) {
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
  }

  parse (msg) {
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

    return message || null;
  }

  _joinRoom (channel) {
    for (let id in this.services) {
      let result = this.services[id].join(channel);
      console.log(`service ${id} join: ${result}`);
    }
  }
}

module.exports = Doorman;
