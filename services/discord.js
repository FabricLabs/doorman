'use strict';

const Service = require('@fabric/core/types/service');

const PREFIX = 'doorman';
const ACTION_ROW = 1;
const BUTTON = 2;
const STRING_SELECT = 3;
const TEXT_INPUT = 4;
const BUTTON_STYLE = { primary: 1, secondary: 2, success: 3, danger: 4 };
const TEXT_STYLE = { short: 1, paragraph: 2 };
const EPHEMERAL = 64;
const PAGE_SIZE = 25;
const MAX_BUTTON_CHOICES = 5;
const MAX_CONTENT = 2000;
const MAX_REMEMBERED_STEPS = 500;
const CUSTOM_ID = /^doorman:([0-9a-f]{12}):([A-Za-z0-9_-]{1,32}):(v|select|modal|submit|page|skip|cancel)(?::(.{1,40}))?$/;
const CAMPAIGN_PREFIX = 'doorman-c';
const CAMPAIGN_ID = /^doorman-c:([0-9a-f]{12}):(start|stop|stopall)$/;
const NO_MENTIONS = { parse: [] };

function truncate (value, max) {
  const text = String(value == null ? '' : value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Component custom id for a script step control.
 * @param {string} session
 * @param {string} step
 * @param {string} kind `v` (value), `select`, `modal`, `submit`, `page`, `skip`, or `cancel`.
 * @param {string} [value]
 * @returns {string}
 */
function customId (session, step, kind, value) {
  return [PREFIX, session, step, kind].concat(value == null ? [] : [value]).join(':');
}

/**
 * Parse a Doorman component custom id, or null for anyone else's.
 * @param {string} id
 * @returns {{ session: string, step: string, kind: string, value: string|null }|null}
 */
function parseCustomId (id) {
  const match = CUSTOM_ID.exec(String(id || ''));
  if (!match) return null;
  return { session: match[1], step: match[2], kind: match[3], value: match[4] == null ? null : match[4] };
}

/**
 * Discord message payload for a `ScriptStep`: up to five choices as
 * buttons, longer lists as a paged select menu, Continue for confirmations,
 * an Answer button (opening a form) for text, plus Skip / Cancel.
 * @param {Object} step `ScriptStep`
 * @param {Object} [options]
 * @param {number} [options.page=0] Select menu page.
 * @param {boolean} [options.replyHint=true] Mention that typed replies work too.
 * @returns {Object} `{ content, components }`
 */
function renderStep (step, { page = 0, replyHint = true } = {}) {
  const input = step.input || {};
  const id = (kind, value) => customId(step.session, step.step, kind, value);
  const rows = [];
  const lines = [step.text];
  const controls = [];

  if (input.type === 'choice') {
    const options = input.options || [];
    if (options.length <= MAX_BUTTON_CHOICES && !input.multiple) {
      rows.push({
        type: ACTION_ROW,
        components: options.map((option) => ({
          type: BUTTON,
          style: BUTTON_STYLE.primary,
          label: truncate(option.label, 80),
          custom_id: id('v', option.id)
        }))
      });
    } else {
      const pages = Math.max(1, Math.ceil(options.length / PAGE_SIZE));
      const current = Math.min(Math.max(Number(page) || 0, 0), pages - 1);
      const slice = options.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
      rows.push({
        type: ACTION_ROW,
        components: [{
          type: STRING_SELECT,
          custom_id: id('select'),
          placeholder: truncate(input.placeholder || (input.multiple ? 'Choose every option that applies' : 'Choose one'), 150),
          min_values: 1,
          max_values: input.multiple ? slice.length : 1,
          options: slice.map((option) => Object.assign({
            label: truncate(option.label, 100),
            value: option.id
          }, option.description ? { description: truncate(option.description, 100) } : {}))
        }]
      });
      if (pages > 1) {
        lines.push(`-# Showing ${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + slice.length} of ${options.length}.`);
        rows.push({
          type: ACTION_ROW,
          components: [
            { type: BUTTON, style: BUTTON_STYLE.secondary, label: 'Previous', custom_id: id('page', String(current - 1)), disabled: current === 0 },
            { type: BUTTON, style: BUTTON_STYLE.secondary, label: 'More', custom_id: id('page', String(current + 1)), disabled: current >= pages - 1 }
          ]
        });
      }
    }
  } else if (input.type === 'confirm') {
    controls.push({ type: BUTTON, style: BUTTON_STYLE.success, label: 'Continue', custom_id: id('v', 'yes') });
  } else if (input.type === 'text') {
    controls.push({ type: BUTTON, style: BUTTON_STYLE.primary, label: truncate(input.label || 'Answer', 80), custom_id: id('modal') });
  }

  if (input.type && input.type !== 'none') {
    if (input.optional) controls.push({ type: BUTTON, style: BUTTON_STYLE.secondary, label: 'Skip', custom_id: id('skip') });
    controls.push({ type: BUTTON, style: BUTTON_STYLE.secondary, label: 'Cancel', custom_id: id('cancel') });
    if (replyHint) lines.push('-# You can also reply here ("cancel" stops).');
  }
  if (controls.length) rows.push({ type: ACTION_ROW, components: controls });

  return { content: truncate(lines.filter(Boolean).join('\n\n'), MAX_CONTENT), components: rows };
}

/**
 * The form a text step's Answer button opens.
 * @param {Object} step `ScriptStep`
 * @returns {Object} Modal payload for `interaction.showModal`.
 */
function renderModal (step) {
  const input = step.input || {};
  const field = {
    type: TEXT_INPUT,
    custom_id: 'value',
    label: truncate(input.label || 'Your answer', 45),
    style: input.multiline ? TEXT_STYLE.paragraph : TEXT_STYLE.short,
    required: !input.optional,
    max_length: Math.min(Number(input.maxLength) || 4000, 4000)
  };
  if (input.minLength) field.min_length = Math.min(Number(input.minLength), field.max_length);
  if (input.placeholder) field.placeholder = truncate(input.placeholder, 100);
  return {
    title: truncate(step.title || 'Answer', 45),
    custom_id: customId(step.session, step.step, 'submit'),
    components: [{ type: ACTION_ROW, components: [field] }]
  };
}

/**
 * Parse a campaign control's custom id (`doorman-c:<campaign>:<action>`), or
 * null for anyone else's.
 * @param {string} id
 * @returns {{ campaign: string, action: string }|null}
 */
function parseCampaignId (id) {
  const match = CAMPAIGN_ID.exec(String(id || ''));
  return match ? { campaign: match[1], action: match[2] } : null;
}

/**
 * Discord message payload for a `CampaignMessage`: the text, who sent it,
 * then Start (when it offers a script), Stop messages from the sender, and
 * Stop all.
 * @param {Object} message `CampaignMessage`
 * @returns {Object} `{ content, components }`
 */
function renderCampaign (message) {
  const id = (action) => `${CAMPAIGN_PREFIX}:${message.campaign}:${action}`;
  const sender = message.sourceName ? `**${truncate(message.sourceName, 100)}**` : null;
  const attribution = [sender ? `Sent by ${sender}` : null, message.via ? `via ${truncate(message.via, 100)}` : null].filter(Boolean).join(' ');
  const controls = [];
  if (message.start) controls.push({ type: BUTTON, style: BUTTON_STYLE.primary, label: 'Start', custom_id: id('start') });
  controls.push({
    type: BUTTON,
    style: BUTTON_STYLE.secondary,
    label: truncate(message.sourceName ? `Stop messages from ${message.sourceName}` : 'Stop these messages', 80),
    custom_id: id('stop')
  });
  controls.push({ type: BUTTON, style: BUTTON_STYLE.danger, label: 'Stop all', custom_id: id('stopall') });
  const footer = attribution ? `\n\n-# ${attribution}` : '';
  return {
    content: truncate(message.text, MAX_CONTENT - footer.length) + footer,
    components: [{ type: ACTION_ROW, components: controls }]
  };
}

/**
 * Discord adapter built on the suite's `@fabric/discord` service.
 *
 * Two modes:
 *  - **owned**: `{ token, intents }` constructs and logs in its own client.
 *  - **attached**: `{ client }` listens on an `@fabric/discord` instance the
 *    host process already runs (one gateway connection per process). In this
 *    mode Doorman never sends unless `settings.replies` is true, and never
 *    sends private messages unless `settings.whispers` is true.
 *
 * Emits the Doorman adapter events `message`, `join`, `part`, `presence`,
 * `user`, `answer`, `ready`, and `error`. Presence is derived from
 * voice-channel occupancy (non-privileged intents only). Direct messages
 * arrive as `message` with `private: true` (the client needs the
 * DirectMessages intent and the Channel partial); presses on script step
 * controls (`doorman:` custom ids) arrive as `answer`.
 */
class Discord extends Service {
  constructor (settings = {}) {
    super(Object.assign({ networking: false }, settings));

    this.settings = Object.assign({
      token: null,
      intents: null,
      partials: null,
      client: null,
      replies: null, // default: owned client replies, attached client is read-only
      whispers: null, // default: owned client sends DMs, attached client does not
      autoCommands: false
    }, settings);

    this.client = this.settings.client || null;
    this.owned = !this.client;
    this.isReady = false;
    this._bound = false;
    this._listeners = {};
    this._interactionClient = null;
    this._steps = new Map();
    this._onInteraction = (interaction) => {
      this._handleInteraction(interaction).catch((error) => this.emit('error', error));
    };

    return this;
  }

  get canSend () {
    if (this.settings.replies != null) return !!this.settings.replies;
    return this.owned;
  }

  get canWhisper () {
    if (this.settings.whispers != null) return !!this.settings.whispers;
    return this.owned;
  }

  /** `whisper()` renders `ScriptStep` payloads itself (buttons, menus, forms). */
  get rendersScripts () {
    return true;
  }

  /** `whisper()` renders `CampaignMessage` payloads itself (Start / Stop buttons). */
  get rendersCampaigns () {
    return true;
  }

  _createClient () {
    const FabricDiscord = require('@fabric/discord');
    const options = { token: this.settings.token, autoCommands: this.settings.autoCommands };
    if (Array.isArray(this.settings.intents)) options.intents = this.settings.intents;
    if (Array.isArray(this.settings.partials)) options.partials = this.settings.partials;
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
    this._bindInteractions();
    // Attached clients may already be connected.
    if (!this.owned && this.client.botReady) this._handleReady();
  }

  _unbind () {
    this._unbindInteractions();
    if (!this._bound || !this.client) return;
    for (const [event, handler] of Object.entries(this._listeners)) this.client.removeListener(event, handler);
    this._bound = false;
  }

  /** Listen for presses on script step controls on the discord.js client (which an owned client replaces on start). */
  _bindInteractions () {
    const raw = this.client && this.client.client;
    if (!this.canWhisper || !raw || typeof raw.on !== 'function' || this._interactionClient === raw) return;
    this._unbindInteractions();
    raw.on('interactionCreate', this._onInteraction);
    this._interactionClient = raw;
  }

  _unbindInteractions () {
    if (!this._interactionClient) return;
    this._interactionClient.removeListener('interactionCreate', this._onInteraction);
    this._interactionClient = null;
  }

  _rememberStep (step) {
    const key = `${step.session}:${step.step}`;
    this._steps.delete(key);
    this._steps.set(key, step);
    while (this._steps.size > MAX_REMEMBERED_STEPS) this._steps.delete(this._steps.keys().next().value);
  }

  /**
   * Route a press on a `doorman:` control: open a text step's form, page a
   * long menu, or acknowledge and emit `answer`. The card is rewritten with
   * the answer (or an ephemeral note explains why it was refused) once the
   * host responds. Other custom ids are left alone.
   * @param {Object} interaction discord.js Interaction
   * @returns {Promise<void>}
   */
  async _handleInteraction (interaction) {
    const campaign = parseCampaignId(interaction && interaction.customId);
    if (campaign) return this._handleCampaign(interaction, campaign);
    const parsed = parseCustomId(interaction && interaction.customId);
    if (!parsed) return;
    const step = this._steps.get(`${parsed.session}:${parsed.step}`) || null;

    if (parsed.kind === 'modal') {
      await interaction.showModal(renderModal(step || { session: parsed.session, step: parsed.step, input: { type: 'text' } }));
      return;
    }
    if (parsed.kind === 'page' && step) {
      await interaction.update(Object.assign({ allowedMentions: NO_MENTIONS }, renderStep(step, { page: Number(parsed.value) || 0 })));
      return;
    }

    let value = null;
    let action = null;
    switch (parsed.kind) {
      case 'v': value = parsed.value; break;
      case 'select': value = Array.isArray(interaction.values) ? interaction.values.slice() : []; break;
      case 'submit': value = interaction.fields && typeof interaction.fields.getTextInputValue === 'function'
        ? interaction.fields.getTextInputValue('value')
        : null; break;
      case 'skip': action = 'skip'; break;
      case 'cancel': action = 'cancel'; break;
      case 'page': action = 'resend'; break; // forgotten after a restart: send the step again
    }
    if (typeof interaction.deferUpdate === 'function') await interaction.deferUpdate();
    this.emit('answer', {
      session: parsed.session,
      step: parsed.step,
      user: interaction.user ? String(interaction.user.id) : null,
      value,
      action,
      respond: (result) => this._respond(interaction, result)
    });
  }

  /**
   * Route a press on a campaign control (`doorman-c:`): acknowledge, emit
   * `answer { campaign, action, user, respond }`, and rewrite the card with
   * the outcome once the host responds.
   * @param {Object} interaction discord.js Interaction
   * @param {{ campaign: string, action: string }} parsed
   * @returns {Promise<void>}
   */
  async _handleCampaign (interaction, parsed) {
    if (typeof interaction.deferUpdate === 'function') await interaction.deferUpdate();
    this.emit('answer', {
      campaign: parsed.campaign,
      action: parsed.action,
      user: interaction.user ? String(interaction.user.id) : null,
      respond: (result) => this._respond(interaction, result)
    });
  }

  async _respond (interaction, result) {
    if (!result) return null;
    if (result.ok) {
      const content = (interaction.message && interaction.message.content) || '';
      const mark = result.label ? `\n\n**→ ${truncate(result.label, 200)}**` : '';
      return interaction.editReply({ content: truncate(content + mark, MAX_CONTENT), components: [], allowedMentions: NO_MENTIONS });
    }
    return interaction.followUp({ content: truncate(result.error || 'That did not work.', MAX_CONTENT), flags: EPHEMERAL, allowedMentions: NO_MENTIONS });
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
    const message = {
      id: activity.object && activity.object.id,
      actor,
      target,
      object: activity.object ? activity.object.content : ''
    };
    if (activity.target.type === 'dm') message.private = true;
    this.emit('message', message);
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
    this._bindInteractions();
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

  /**
   * Direct message one user: plain text, a `ScriptStep` rendered with
   * buttons, menus, and forms, or a `CampaignMessage` with its Start / Stop
   * buttons. Rejects when private messages are off or
   * Discord refuses (e.g. code 50007: the user does not accept DMs from
   * server members), so callers can tell the person.
   * @param {string} userId Discord user id.
   * @param {string|Object} object
   * @returns {Promise<Object>} The sent message.
   */
  async whisper (userId, object) {
    if (!this.canWhisper || !this.client) throw new Error('[DOORMAN:DISCORD] private messages are off');
    let payload;
    if (object && typeof object === 'object' && object.type === 'ScriptStep') {
      this._rememberStep(object);
      payload = renderStep(object);
    } else if (object && typeof object === 'object' && object.type === 'CampaignMessage') {
      payload = renderCampaign(object);
    } else {
      payload = { content: truncate(object && typeof object === 'object' ? object.text : object, MAX_CONTENT), components: [] };
    }
    payload.allowedMentions = NO_MENTIONS;
    if (typeof this.client.sendDirect === 'function') return this.client.sendDirect(String(userId), payload);
    const users = this.client.client && this.client.client.users;
    if (!users || typeof users.fetch !== 'function') throw new Error('[DOORMAN:DISCORD] client is not ready');
    const user = await users.fetch(String(userId));
    return user.send(payload);
  }
}

module.exports = Discord;
module.exports.customId = customId;
module.exports.parseCustomId = parseCustomId;
module.exports.renderStep = renderStep;
module.exports.renderModal = renderModal;
module.exports.parseCampaignId = parseCampaignId;
module.exports.renderCampaign = renderCampaign;
