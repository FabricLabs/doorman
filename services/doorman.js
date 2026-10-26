'use strict';

const crypto = require('crypto');
const path = require('path');

const Plugin = require('../types/plugin');
const Router = require('../types/router');
const Scribe = require('../types/scribe');
const Script = require('../types/script');
const Campaign = require('../types/campaign');

const Service = require('@fabric/core/types/service');

/**
 * Events a platform adapter may emit. Doorman re-emits each with ids
 * namespaced under the service name (`<service>/users/<id>`, …).
 * @private
 */
const ADAPTER_EVENTS = ['patch', 'user', 'channel', 'join', 'part', 'presence', 'message', 'answer', 'ready', 'error'];

/**
 * Base path of the read-only console JSON API served by {@link Doorman#middleware}.
 * @private
 */
const CONSOLE_BASE = '/services/doorman';

/**
 * Adapter events the console counts (aggregates only — never content or ids).
 * @private
 */
const COUNTED_EVENTS = ['message', 'user', 'channel', 'join', 'part', 'presence', 'answer', 'response', 'trigger'];

/**
 * Package `assets/` when it sits inside `process.cwd()` (HTTPServer refuses
 * static roots that escape the working directory); otherwise the relative
 * `assets` folder of whatever process embeds Doorman.
 * @private
 */
function defaultAssetsPath () {
  const packaged = path.resolve(__dirname, '..', 'assets');
  const cwd = path.resolve(process.cwd());
  const relative = path.relative(cwd, packaged);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) return packaged;
  return 'assets';
}

function sendJson (res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function errorMessage (error) {
  return error && error.message ? error.message : String(error);
}

function hasLifecycle (Handler) {
  return !!(Handler && Handler.prototype &&
    typeof Handler.prototype.start === 'function' &&
    typeof Handler.prototype.trust === 'function');
}

/**
 * General-purpose bot framework. Hosts platform adapters ("services") and
 * behavior modules ("plugins"), normalizing every adapter event into one
 * namespaced stream that plugins consume.
 *
 * Embedding: pass `http: false` to skip the bundled HTTP server, and hand
 * `enable()` a Service class or instance (not only a bundled name) to feed
 * Doorman from a connection the host process already owns.
 * @param {Object} config Overall configuration object.
 * @constructor
 */
class Doorman extends Service {
  constructor (config = {}) {
    super(Object.assign({ networking: false }, config));

    this.config = Object.assign({
      trigger: '!'
    }, config || {});

    this.settings = Object.assign({}, this.config, config);

    this.plugins = {};
    this.services = {};
    this._serviceListeners = {};
    this.triggers = {};
    this._triggerOwners = {};
    this._pluginMiddlewares = {};
    this._pluginStarts = {};

    this._state.content = Object.assign({}, this._state.content, {
      startedAt: null,
      counts: {},
      services: {}
    });

    this.router = new Router({ trigger: this.config.trigger });
    this.scribe = new Scribe({ namespace: 'doorman' });

    // Adapter and plugin failures are emitted from detached promise chains;
    // with no listener, `emit('error')` would throw there as an unhandled rejection.
    this.on('error', (...parts) => {
      if (this.listenerCount('error') === 1) this.scribe.throw(...parts);
    });

    this.http = null;
    if (this.settings.http !== false) {
      const HTTPServer = require('@fabric/http/types/server');
      const provided = Object.assign({}, this.settings.http || {});
      // Read-only console: static SPA from `assets/`, JSON under
      // `/services/doorman`, and the same JSONCall surface over WebSocket and
      // `POST /services/rpc` so the browser Bridge can poll without a token.
      this.settings.http = Object.assign({
        name: this.settings.name || '@fabric/doorman',
        hostname: 'localhost',
        // Unauthenticated read-only console: loopback unless the operator opts in.
        interface: '127.0.0.1',
        port: 4444,
        assets: defaultAssetsPath(),
        spaFallback: true,
        spaFallbackExclude: /^\/services(\/|$)/,
        cors: true,
        jsonRpc: { enabled: true, requireAuth: false, paths: ['/services/rpc'] },
        resources: {
          'Provider': {}
        }
      }, provided, {
        middlewares: Object.assign({ doorman: this.middleware() }, provided.middlewares || {})
      });
      this.http = new HTTPServer(this.settings.http);
      this.http.on('error', (...parts) => this.emit('error', ...parts));
      this._registerConsoleMethods();
    }

    for (const event of COUNTED_EVENTS) {
      this.on(event, (payload) => this._countEvent(event, payload));
    }

    this.router.trust(this);

    return this;
  }

  register (handler) {
    if (!handler.name) return false;
    if (!handler.value) return false;

    this.triggers[handler.name] = handler.value;
    if (handler.plugin) this._triggerOwners[handler.name] = handler.plugin;
    this.router.use(handler);

    this.emit('trigger', handler);

    return this;
  }

  /**
   * Read-only console snapshot: adapters, plugins, triggers, and aggregate
   * event counters. Never includes message content, user ids, or tokens.
   * @returns {Object}
   */
  status () {
    const content = this._state.content || {};
    return {
      name: this.settings.name || '@fabric/doorman',
      trigger: this.config.trigger,
      startedAt: content.startedAt || null,
      services: Object.keys(this.services).map((name) => {
        const service = this.services[name];
        const meta = (content.services && content.services[name]) || {};
        return {
          name,
          type: service && service.constructor ? service.constructor.name : 'Service',
          ready: meta.ready === true,
          readyAt: meta.readyAt || null,
          counts: Object.assign({}, meta.counts || {})
        };
      }),
      plugins: Object.keys(this.plugins).map((name) => ({
        name,
        hasReport: typeof this.plugins[name].report === 'function',
        triggers: Object.keys(this.triggers).filter((trigger) => this._triggerOwners[trigger] === name)
      })),
      triggers: Object.keys(this.triggers),
      counts: Object.assign({}, content.counts || {})
    };
  }

  /**
   * Express-style handler for the console JSON API (`GET /services/doorman`,
   * `GET /services/doorman/report`, `GET /services/doorman/plugins/:name`).
   * Mounted on the bundled HTTPServer automatically; hosts embedding Doorman
   * with `http: false` may mount it on their own server.
   * @returns {Function} `(req, res, next)`
   */
  middleware () {
    return (req, res, next) => {
      const url = new URL(req.originalUrl || req.url, 'http://localhost');
      const pathname = (req.path || url.pathname).replace(/\/+$/, '');
      if (pathname !== CONSOLE_BASE && !pathname.startsWith(CONSOLE_BASE + '/')) return next();
      // Plugins with their own routes (e.g. `scripts`) own `/services/doorman/<plugin>`.
      const owner = pathname.slice(CONSOLE_BASE.length + 1).split('/')[0];
      const plugin = owner ? this.plugins[owner] : null;
      if (plugin && typeof plugin.middleware === 'function') {
        let cached = this._pluginMiddlewares[owner];
        if (!cached || cached.plugin !== plugin) cached = this._pluginMiddlewares[owner] = { plugin, handler: plugin.middleware() };
        return cached.handler(req, res, () => sendJson(res, 404, { error: 'Not found' }));
      }
      if (String(req.method || 'GET').toUpperCase() !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });

      let job = null;
      if (pathname === CONSOLE_BASE) job = () => this.status();
      else if (pathname === `${CONSOLE_BASE}/report`) job = () => this.report();
      else if (pathname.startsWith(`${CONSOLE_BASE}/plugins/`)) {
        const name = decodeURIComponent(pathname.slice(`${CONSOLE_BASE}/plugins/`.length));
        job = () => this._pluginReport(name);
      }
      if (!job) return sendJson(res, 404, { error: 'Not found' });

      Promise.resolve().then(job).then((body) => {
        if (body === null) return sendJson(res, 404, { error: 'Unknown plugin' });
        sendJson(res, 200, body);
      }).catch((error) => {
        if (!res.headersSent) sendJson(res, 500, { error: errorMessage(error) });
      });
    };
  }

  async _pluginReport (name) {
    const plugin = this.plugins[name];
    if (!plugin) return null;
    const body = { name, hasReport: typeof plugin.report === 'function', report: null };
    if (body.hasReport) {
      try {
        body.report = await plugin.report();
      } catch (error) {
        body.error = errorMessage(error);
      }
    }
    return body;
  }

  _registerConsoleMethods () {
    if (!this.http || typeof this.http._registerMethod !== 'function') return;
    this.http._registerMethod('GetDoormanStatus', () => this.status());
    this.http._registerMethod('GetDoormanReport', () => this.report());
    this.http._registerMethod('ListDoormanServices', () => this.status().services);
    this.http._registerMethod('ListDoormanPlugins', () => this.status().plugins);
    // The Hub Bridge asks for this on connect; answer in Hub shape (no peers,
    // no documents) so the client settles instead of logging a missing method.
    if (!this.http.methods.GetNetworkStatus) {
      this.http._registerMethod('GetNetworkStatus', () => {
        const status = this.status();
        return {
          name: status.name,
          clock: 0,
          peers: [],
          documents: [],
          state: { status: 'READY', services: status.services.map((service) => service.name) },
          doorman: status
        };
      });
    }
  }

  /**
   * Bump aggregate counters and tell console clients. The broadcast carries
   * only `{ kind, service, count, total }` — never the event payload.
   * @private
   */
  _countEvent (kind, payload) {
    const content = this._state.content;
    content.counts[kind] = (content.counts[kind] || 0) + 1;

    let service = null;
    if (payload && typeof payload === 'object') {
      if (typeof payload.service === 'string') service = payload.service;
      else if (payload.origin && typeof payload.origin.name === 'string') service = payload.origin.name;
      else if (payload.parent && payload.parent.origin) service = payload.parent.origin.name || null;
      else if (typeof payload.id === 'string' && payload.id.includes('/')) service = payload.id.split('/')[0];
      else if (typeof payload.user === 'string' && payload.user.includes('/')) service = payload.user.split('/')[0];
    }
    if (kind === 'trigger') service = null;

    let count = content.counts[kind];
    if (service) {
      const meta = content.services[service] = content.services[service] || { counts: {} };
      meta.counts[kind] = (meta.counts[kind] || 0) + 1;
      count = meta.counts[kind];
    }

    this._broadcastConsole({ kind, service, count, total: content.counts[kind] });
  }

  _broadcastConsole (object) {
    if (!this.http || typeof this.http.broadcast !== 'function') return;
    try {
      const Message = require('@fabric/core/types/message');
      const message = Message.fromVector(['GenericMessage', JSON.stringify({ type: 'DoormanEvent', object })]);
      this.http.broadcast(message);
    } catch (error) {
      this.scribe.log('[CONSOLE]', 'broadcast failed:', errorMessage(error));
    }
  }

  /**
   * Enable a platform adapter.
   * @param {String} name Service name (bundled `services/<name>.js` when no `service` is given).
   * @param {Function|Object} [service] Service class or constructed instance.
   * @returns {Doorman} Chainable method.
   */
  enable (name, service = null) {
    const self = this;

    if (!service) {
      const Bundled = require(`../services/${name}`);
      service = new Bundled(this.config[name]);
    } else if (typeof service === 'function') {
      service = new service(this.config[name]);
    }

    self.scribe.log(`enabling service "${name}"...`);

    // Replacing a name: drop the old adapter's listeners (and disconnect it
    // when it is another instance) so it cannot keep answering.
    const previous = this.services[name];
    if (previous) {
      this._detachService(name, { disconnect: previous !== service }).catch((error) => {
        self.emit('error', `[DOORMAN:${name.toUpperCase()}] disconnect: ${error && error.message ? error.message : error}`);
      });
    }

    const userId = (id) => [name, 'users', id].join('/');
    const channelId = (id) => [name, 'channels', id].join('/');
    const listeners = [];
    const listen = (event, handler) => {
      service.on(event, handler);
      listeners.push([event, handler]);
    };

    listen('patch', function (patch) {
      self.emit('patch', Object.assign({}, patch, {
        path: name + patch.path // TODO: check in Vector Machine that this is safe
      }));
    });

    listen('user', function (user) {
      self.emit('user', {
        id: userId(user.id),
        name: user.name,
        online: user.online || false,
        subscriptions: []
      });
    });

    listen('channel', function (channel) {
      self.emit('channel', {
        id: channelId(channel.id),
        name: channel.name,
        members: []
      });
    });

    listen('join', function (join) {
      self.emit('join', {
        user: userId(join.user),
        channel: channelId(join.channel)
      });
    });

    listen('part', function (part) {
      self.emit('part', {
        user: userId(part.user),
        channel: channelId(part.channel)
      });
    });

    listen('presence', function (presence) {
      self.emit('presence', {
        user: userId(presence.user),
        status: presence.status === 'online' ? 'online' : 'offline',
        channel: presence.channel ? channelId(presence.channel) : null,
        service: name
      });
    });

    listen('message', async function (msg) {
      const now = Date.now();
      const id = [now, msg.actor, msg.target, msg.object].join('/');
      const hash = crypto.createHash('sha256').update(id).digest('hex');
      const message = {
        id: [name, 'messages', (msg.id || hash)].join('/'),
        actor: userId(msg.actor),
        target: channelId(msg.target),
        object: msg.object,
        origin: {
          type: 'Link',
          name: name
        },
        created: now
      };
      if (msg.private === true) message.private = true;

      self.emit('message', message);

      try {
        // A private reply to an open conversation belongs to the plugin running it.
        if (self.claimed(message)) return;

        const response = await self.parse(message);
        if (response) {
          self.emit('response', {
            parent: message,
            response: response
          });

          if (typeof service.send === 'function') {
            await service.send(msg.target, response, {
              parent: message
            });
          }
        }
      } catch (error) {
        self.emit('error', `[DOORMAN:${name.toUpperCase()}] message: ${error && error.message ? error.message : error}`);
      }
    });

    listen('answer', function (answer) {
      if (!answer || (!answer.session && !answer.campaign)) return;
      self.emit('answer', Object.assign({}, answer, {
        user: answer.user ? userId(answer.user) : null,
        service: name
      }));
    });

    listen('ready', function () {
      const meta = self._state.content.services[name] = self._state.content.services[name] || { counts: {} };
      meta.ready = true;
      meta.readyAt = new Date().toISOString();
      self.emit('service', { name });
      self._broadcastConsole({ kind: 'service', service: name, ready: true });
    });

    listen('error', function (error) {
      self.emit('error', `[DOORMAN:${name.toUpperCase()}] ${error && error.message ? error.message : error}`);
    });

    this.services[name] = service;
    this._serviceListeners[name] = listeners;
    const meta = this._state.content.services[name] = this._state.content.services[name] || { counts: {} };
    // Readiness belongs to this adapter instance; it reports `ready` itself.
    meta.ready = false;
    meta.readyAt = null;

    if (typeof service.connect === 'function') {
      Promise.resolve(service.connect()).catch((error) => {
        self.emit('error', `[DOORMAN:${name.toUpperCase()}] connect: ${error && error.message ? error.message : error}`);
      });
    } else if (typeof service.start === 'function') {
      Promise.resolve(service.start()).catch((error) => {
        self.emit('error', `[DOORMAN:${name.toUpperCase()}] start: ${error && error.message ? error.message : error}`);
      });
    }

    return this;
  }

  /**
   * Configure Doorman to use a Plugin.
   * @param {Mixed} plugin Map (trigger name => behavior), Plugin constructor, or plugin name.
   * @param {Object} [settings] Settings for the plugin (defaults to `config[name]`).
   * @return {Doorman} Chainable method.
   */
  use (plugin, settings = null) {
    const self = this;
    let name = null;
    let Handler = null;

    if (typeof plugin === 'string') {
      Handler = Plugin.fromName(plugin);
      name = plugin;
    } else if (plugin instanceof Function) {
      Handler = plugin;
      name = (plugin.pluginName || Handler.name).toLowerCase();
    } else {
      Handler = plugin;
    }

    self.scribe.log(`enabling plugin "${name}"...`);

    if (!Handler) return false;
    if (Handler instanceof Function) {
      // Legacy plugins are bare constructors; anything that already carries a
      // Service-style lifecycle keeps its own prototype chain.
      if (!hasLifecycle(Handler)) Object.setPrototypeOf(Handler.prototype, Plugin.prototype);

      const handler = new Handler(settings || self.config[name]);

      handler.on('message', function (message) {
        const parts = message.target.split('/');
        const service = self.services[parts[0]];
        if (service && typeof service.send === 'function') {
          Promise.resolve().then(() => service.send(parts[2], message.object)).catch((error) => {
            self.emit('error', `[DOORMAN:PLUGIN:${name}] send to ${message.target}: ${error && error.message ? error.message : error}`);
          });
        }
      });

      handler.on('whisper', function (whisper) {
        const parts = String(whisper.target || '').split('/');
        const service = self.services[parts[0]];
        if (!service || typeof service.whisper !== 'function') return;
        self.whisper(whisper.target, whisper.object).catch((error) => {
          self.emit('error', `[DOORMAN:PLUGIN:${name}] whisper to ${whisper.target}: ${error && error.message ? error.message : error}`);
        });
      });

      self.plugins[name] = handler;
      handler.trust(self);

      // Plugins start immediately; Doorman#start() awaits these so hosts know
      // every plugin (and its Store) is ready once `start()` resolves.
      self._pluginStarts[name] = Promise.resolve(handler.start()).catch((error) => {
        self.emit('error', `[DOORMAN:PLUGIN:${name}] start: ${error && error.message ? error.message : error}`);
      });

      if (handler.triggers) {
        Object.keys(handler.triggers).forEach(trigger => {
          self.register(Object.assign({
            plugin: name
          }, handler.triggers[trigger]));
        });
      }
    } else {
      Object.keys(Handler).forEach(name => {
        const value = Handler[name];
        self.register({ name, value });
      });
    }

    return this;
  }

  /**
   * Send a private message to one user through the adapter that owns them.
   * @param {String} target Namespaced user id (`<service>/users/<id>`).
   * @param {String|Object} object Text, or a structured payload the adapter renders (`ScriptStep`, `CampaignMessage`).
   * @returns {Promise<*>} The adapter's result; rejects when it cannot deliver.
   */
  async whisper (target, object) {
    const parts = String(target || '').split('/');
    if (parts.length !== 3 || parts[1] !== 'users') throw new Error(`Not a user: ${target}`);
    const service = this.services[parts[0]];
    if (!service) throw new Error(`No service "${parts[0]}" for ${target}`);
    if (typeof service.whisper !== 'function') throw new Error(`Service "${parts[0]}" cannot send private messages`);
    // Adapters without buttons or menus get plain text with typed replies.
    const type = object && typeof object === 'object' ? object.type : null;
    if (type === 'ScriptStep' && service.rendersScripts !== true) return service.whisper(parts[2], Script.toText(object));
    if (type === 'CampaignMessage' && service.rendersCampaigns !== true) return service.whisper(parts[2], Campaign.toText(object));
    return service.whisper(parts[2], object);
  }

  /**
   * Does a plugin claim this message (a private reply to a conversation it is
   * running)? Claimed messages skip `!trigger` routing.
   * @param {Object} message Doorman message.
   * @returns {Boolean}
   */
  claimed (message) {
    if (!message || message.private !== true) return false;
    return Object.values(this.plugins).some((plugin) => {
      if (typeof plugin.claims !== 'function') return false;
      try { return !!plugin.claims(message); } catch (_) { return false; }
    });
  }

  /**
   * Resolves once a plugin added with {@link Doorman#use} has started.
   * @param {String} name Plugin name.
   * @returns {Promise<Object|null>} The plugin, or null when there is none.
   */
  async started (name) {
    if (!this.plugins[name]) return null;
    await this._pluginStarts[name];
    return this.plugins[name];
  }

  async parse (msg) {
    const answers = await this.router.route(msg);
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
    }

    return message || null;
  }

  /**
   * Aggregate every plugin's `report()` (plugins without one are omitted).
   * @returns {Promise<Object>} `{ generatedAt, services, plugins: { <name>: report } }`
   */
  async report () {
    const plugins = {};
    for (const [name, plugin] of Object.entries(this.plugins)) {
      if (typeof plugin.report !== 'function') continue;
      try {
        plugins[name] = await plugin.report();
      } catch (error) {
        plugins[name] = { error: error && error.message ? error.message : String(error) };
      }
    }
    return {
      generatedAt: new Date().toISOString(),
      services: Object.keys(this.services),
      plugins
    };
  }

  _joinRoom (channel) {
    for (const id in this.services) {
      if (typeof this.services[id].join !== 'function') continue;
      const result = this.services[id].join(channel);
      this.scribe.log(`service ${id} join: ${result}`);
    }
  }

  async start () {
    this._state.content.startedAt = new Date().toISOString();
    if (this.config.local !== false) this.enable('local');

    if (this.config.services && Array.isArray(this.config.services)) {
      this.config.services.forEach(service => this.enable(service));
    }

    if (this.config.plugins && Array.isArray(this.config.plugins)) {
      this.config.plugins.forEach(module => this.use(module));
    }

    if (this.config.triggers) {
      Object.keys(this.config.triggers).forEach(name => {
        const route = {
          name: this.config.trigger + name,
          value: this.config.triggers[name]
        };

        this.router.use(route);
      });
    }

    if (this.http) await this.http.start();
    if (this._pluginStarts) await Promise.all(Object.values(this._pluginStarts));

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

  /**
   * Remove an enabled adapter's listeners and disconnect it.
   * @private
   * @param {String} name
   * @param {Object} [opts] `{ disconnect }` (default true)
   * @returns {Promise}
   */
  _detachService (name, opts = {}) {
    const service = this.services[name];
    for (const [event, handler] of (this._serviceListeners[name] || [])) {
      if (service) service.removeListener(event, handler);
    }
    delete this.services[name];
    delete this._serviceListeners[name];
    if (!service || opts.disconnect === false) return Promise.resolve();
    const method = typeof service.disconnect === 'function' ? 'disconnect' : (typeof service.stop === 'function' ? 'stop' : null);
    return method ? Promise.resolve().then(() => service[method]()) : Promise.resolve();
  }

  async stop () {
    for (const plugin of Object.values(this.plugins)) {
      if (typeof plugin.stop !== 'function') continue;
      try { await plugin.stop(); } catch (_) { /* best effort */ }
    }

    for (const name of Object.keys(this.services)) {
      try { await this._detachService(name); } catch (_) { /* best effort */ }
    }
    // `start()` re-enables `config.services`; keeping these would double every listener.
    this.services = {};
    this._serviceListeners = {};
    for (const meta of Object.values(this._state.content.services)) {
      meta.ready = false;
      meta.readyAt = null;
    }

    if (this.http) await this.http.stop();

    return this;
  }
}

module.exports = Doorman;
module.exports.ADAPTER_EVENTS = ADAPTER_EVENTS;
