'use strict';

const Service = require('@fabric/core/types/service');

/**
 * Discord adapter built on the suite's `@fabric/discord` service.
 *
 * Two modes:
 *  - **owned**: `{ token, intents }` constructs and logs in its own client.
 *  - **attached**: `{ client }` listens on an `@fabric/discord` instance the
 *    host process already runs (one gateway connection per process). In this
 *    mode Doorman never sends unless `settings.replies` is true.
 *
 * Emits the Doorman adapter events `message`, `join`, `part`, `presence`,
 * `user`, `ready`, and `error`. Presence is derived from voice-channel
 * occupancy (non-privileged intents only).
 */
class Discord extends Service {
  constructor (settings = {}) {
    super(Object.assign({ networking: false }, settings));

    this.settings = Object.assign({
      token: null,
      intents: null,
      client: null,
      replies: null, // default: owned client replies, attached client is read-only
      autoCommands: false
    }, settings);

    this.client = this.settings.client || null;
    this.owned = !this.client;
    this.isReady = false;
    this._bound = false;
    this._listeners = {};

    return this;
  }

  get canSend () {
    if (this.settings.replies != null) return !!this.settings.replies;
    return this.owned;
  }

  _createClient () {
    const FabricDiscord = require('@fabric/discord');
    const options = { token: this.settings.token, autoCommands: this.settings.autoCommands };
    if (Array.isArray(this.settings.intents)) options.intents = this.settings.intents;
    return new FabricDiscord(options);
  }

  _bind () {
    if (this._bound || !this.client) return;
    this._listeners = {
      ready: () => this._handleReady(),
      activity: (activity) => this._handleActivity(activity),
      voice: (event) => this._handleVoice(event),
      error: (error) => this.emit('error', error)
    };
    for (const [event, handler] of Object.entries(this._listeners)) this.client.on(event, handler);
    this._bound = true;
    // Attached clients may already be connected.
    if (!this.owned && this.client.botReady) this._handleReady();
  }

  _unbind () {
    if (!this._bound || !this.client) return;
    for (const [event, handler] of Object.entries(this._listeners)) this.client.removeListener(event, handler);
    this._bound = false;
  }

  /**
   * Best display name for a Discord user from what the client already caches
   * (guild member nickname, global name, username, then the stored catalog).
   * @param {string} userId
   * @param {string} [guildId]
   * @returns {string|null}
   */
  displayName (userId, guildId) {
    const discord = this.client && this.client.client;
    const guilds = discord && discord.guilds && discord.guilds.cache;
    const guild = guilds && guildId ? guilds.get(guildId) : null;
    const member = guild && guild.members && guild.members.cache ? guild.members.cache.get(userId) : null;
    const user = (member && member.user) || (discord && discord.users && discord.users.cache ? discord.users.cache.get(userId) : null);
    const stored = this.client && this.client._state && this.client._state.content && this.client._state.content.users
      ? this.client._state.content.users[userId]
      : null;
    const name = (member && (member.nickname || member.displayName)) ||
      (user && (user.globalName || user.username)) ||
      (stored && (stored.displayName || stored.username));
    return name ? String(name) : null;
  }

  _announceUser (userId, guildId) {
    const name = this.displayName(userId, guildId);
    if (name) this.emit('user', { id: userId, name });
  }

  _handleReady () {
    this.isReady = true;
    const active = (this.client && this.client.voice && this.client.voice.active) || {};
    for (const [channelId, record] of Object.entries(active)) {
      for (const user of Object.keys((record && record.members) || {})) {
        this._announceUser(user, record && record.guildId);
        this.emit('presence', { user, status: 'online', channel: channelId });
      }
    }
    this.emit('ready', { name: 'discord' });
  }

  _handleActivity (activity) {
    if (!activity || activity.type !== 'DiscordMessage') return;
    const actor = activity.actor && activity.actor.ref;
    const target = activity.target && activity.target.ref;
    if (!actor || !target) return;
    if (activity.actor.username) {
      this.emit('user', { id: actor, name: activity.actor.username, online: true });
    }
    this.emit('message', {
      id: activity.object && activity.object.id,
      actor,
      target,
      object: activity.object ? activity.object.content : ''
    });
  }

  _handleVoice (event) {
    if (!event || !event.userId) return;
    const user = String(event.userId);
    const from = event.oldChannelId ? String(event.oldChannelId) : null;
    const to = event.newChannelId ? String(event.newChannelId) : null;
    if (from === to) return;
    if (from) this.emit('part', { user, channel: from });
    if (to) {
      this._announceUser(user, event.guildId ? String(event.guildId) : null);
      this.emit('join', { user, channel: to });
      this.emit('presence', { user, status: 'online', channel: to });
    } else {
      this.emit('presence', { user, status: 'offline', channel: from });
    }
  }

  async connect () {
    if (!this.client) {
      if (!this.settings.token) {
        this.emit('warning', '[DOORMAN:DISCORD] no token and no client; adapter idle');
        return this;
      }
      this.client = this._createClient();
      this.owned = true;
    }
    this._bind();
    if (this.owned) await this.client.start();
    return this;
  }

  async disconnect () {
    this._unbind();
    if (this.owned && this.client) {
      try { await this.client.stop(); } catch (_) { /* already down */ }
    }
    this.isReady = false;
    return this;
  }

  async start () {
    return this.connect();
  }

  async stop () {
    return this.disconnect();
  }

  async send (channel, message) {
    if (!this.canSend || !this.client) return null;
    if (typeof this.client.postToChannel === 'function') return this.client.postToChannel(channel, message);
    return null;
  }
}

module.exports = Discord;
