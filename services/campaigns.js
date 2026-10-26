'use strict';

const crypto = require('crypto');

const Service = require('@fabric/core/types/service');
const Campaign = require('../types/campaign');

const STORE_KEY = '/campaigns';
const BASE = '/services/doorman/campaigns';
const DAY = 24 * 60 * 60 * 1000;
const MAX_BODY = 64 * 1024;
const MAX_LOG = 200;
const USER = /^[^/]+\/users\/[^/]+$/;
const ACTIONS = ['preview', 'schedule', 'pause', 'resume', 'cancel'];
const STOP = /^(stop|unsubscribe)$/i;
const STOP_ALL = /^stop[\s-]*all$/i;
const START = /^start$/i;

const INACTIVE = 'This message is no longer active.';
const NO_SCRIPT = 'This conversation is not available right now.';

function errorMessage (error) {
  return error && error.message ? error.message : String(error);
}

function httpError (status, message, extra = {}) {
  return Object.assign(new Error(message), { status }, extra);
}

function sendJson (res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function safeEqual (a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseJson (text) {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw httpError(400, 'Body must be JSON');
  }
}

function readBody (req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return Promise.resolve(parseJson(String(req.body)));
  if (typeof req.on !== 'function') return Promise.resolve({});
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(httpError(413, 'Body is too large'));
        if (typeof req.destroy === 'function') req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(parseJson(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

function time (value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.getTime();
  const parsed = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function emptyStats () {
  return { targeted: 0, sent: 0, failed: 0, closed: 0, optedOut: 0, inactive: 0, active: 0, unseen: 0, excluded: 0, notPreviewed: 0, stopped: 0, started: 0, pending: 0 };
}

/**
 * Campaigns for Doorman: one message sent by private message to every member
 * a filter selects (platforms, servers, roles, recent activity, exclusions),
 * one at a time at a fixed pace.
 *
 * Hosts say who is out there with {@link Campaigns#audience} (one lookup per
 * platform) and, optionally, when each person was last active with
 * {@link Campaigns#activity}. Campaigns merges people found in several
 * places, drops anyone who opted out (from that source or from everything),
 * anyone an excluded campaign already reached, and anyone inactive too long
 * (or, with `inactiveForDays`, active too recently or never seen), then stops
 * at the audience cap. A check-in (`inactiveForDays`) goes to the most
 * inactive first, so the cap keeps them too. The audience is snapshotted when sending
 * starts; each message goes out through the host's `whisper(target, message)`
 * as a `CampaignMessage` that adapters render with Start / Stop controls
 * (plain text with "Reply STOP" everywhere else). Answers come back as host
 * `answer` events with a `campaign`, or as typed private replies.
 *
 * Campaigns, deliveries, and opt-outs live in a Fabric Store; sending resumes
 * after a restart.
 */
class Campaigns extends Service {
  static get pluginName () {
    return 'campaigns';
  }

  /**
   * @param {Object} [settings]
   * @param {string} [settings.path='stores/campaigns'] Store directory.
   * @param {boolean} [settings.persistent=true] Keep state in the Store.
   * @param {number} [settings.intervalMs=2000] One message per interval (0 = only when {@link Campaigns#tick} is called).
   * @param {number} [settings.maxAudience=500] Most people a campaign owned by a server may reach.
   * @param {number} [settings.staffMaxAudience=10000] Most people a staff campaign may reach.
   * @param {number} [settings.guildCooldownMs=86400000] Time between two campaigns of the same server.
   * @param {number} [settings.retries=3] Retries after a temporary failure (rate limit, outage).
   * @param {number} [settings.retryMs=30000] First retry delay (doubles each time).
   * @param {number} [settings.stopWindowMs=604800000] How long a typed STOP answers the last campaign message.
   * @param {string} [settings.via] Site or bot name shown under each message ("Sent by X via <via>").
   * @param {string} [settings.token] Bearer token for the HTTP API.
   * @param {string} [settings.basePath='/services/doorman/campaigns']
   * @param {boolean} [settings.requirePreview=false] Send only with a preview's id ({@link Campaigns#schedule}), so whoever sends has seen exactly who it reaches.
   * @param {Function} [settings.now] Clock (tests).
   */
  constructor (settings = {}) {
    super(Object.assign({
      name: 'campaigns',
      path: 'stores/campaigns',
      persistent: true,
      networking: false
    }, settings));

    this.settings = Object.assign({
      intervalMs: 2000,
      maxAudience: 500,
      staffMaxAudience: 10000,
      guildCooldownMs: DAY,
      retries: 3,
      retryMs: 30 * 1000,
      stopWindowMs: 7 * DAY,
      via: null,
      token: null,
      basePath: BASE,
      requirePreview: false,
      now: () => Date.now()
    }, this.settings, settings);

    this._state.content = { campaigns: {}, deliveries: {}, optouts: {}, recent: {}, approvals: {} };
    this._audiences = {};
    this._activity = null;
    this._timer = null;
    this._launchRetryAt = {};
    this._running = false;
    this._queue = Promise.resolve();
    this.host = null;
    this._hostListeners = {};
    return this;
  }

  get content () {
    return this._state.content;
  }

  get now () {
    return this.settings.now();
  }

  // ### Lifecycle

  async start () {
    await super.start();
    await this._restore();
    this._running = true;
    this._schedule();
    return this;
  }

  async stop () {
    this._running = false;
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    this.untrust();
    await this._queue;
    await this._persist();
    await super.stop();
    return this;
  }

  /**
   * Listen to a host (Doorman, or any emitter speaking its event vocabulary)
   * for answers and private replies.
   * @param {EventEmitter} host
   * @returns {Campaigns}
   */
  trust (host) {
    if (!host || typeof host.on !== 'function') throw new Error('Host must be an EventEmitter.');
    this.untrust();
    this.host = host;
    this._hostListeners = {
      answer: (answer) => this._handleAnswer(answer),
      message: (message) => this._handleMessage(message)
    };
    for (const [event, handler] of Object.entries(this._hostListeners)) {
      const listener = (payload) => {
        Promise.resolve(handler(payload)).catch((error) => this.emit('error', `[CAMPAIGNS] ${event}: ${errorMessage(error)}`));
      };
      host.on(event, listener);
      this._hostListeners[event] = listener;
    }
    return this;
  }

  untrust () {
    if (!this.host) return this;
    for (const [event, listener] of Object.entries(this._hostListeners)) this.host.removeListener(event, listener);
    this._hostListeners = {};
    this.host = null;
    return this;
  }

  // ### Extension points

  /**
   * Say who a campaign can reach on one platform.
   * @param {string} platform Service name (`discord`), the first part of each target.
   * @param {Function} fn `(filter, campaign) => [{ target, name?, source?, sourceName? }]` (may be async). `target` is `<platform>/users/<id>`; `source` is where the person was found (a server), the unit people opt out of.
   * @returns {Campaigns}
   */
  audience (platform, fn) {
    this._audiences[String(platform)] = fn;
    return this;
  }

  /**
   * Say when a person was last active, for `activeWithinDays` and `inactiveForDays`.
   * @param {Function} fn `(target) => number|string|Date|null` (may be async).
   * @returns {Campaigns}
   */
  activity (fn) {
    this._activity = fn;
    return this;
  }

  // ### Campaigns

  /**
   * Save a draft.
   * @param {Object} input `{ title?, content: { type, text, script? }, filter?, owner? }`
   * @param {Object} [options]
   * @param {string} [options.by] Who made it (a display name, for the log).
   * @param {Object} [options.owner] `{ kind: 'staff' }` (default) or `{ kind: 'guild', guildId, guildName? }`; a server's campaign only reaches that server.
   * @returns {Promise<Object>} the campaign
   */
  create (input, { by = null, owner = null } = {}) {
    return this._serial(async () => {
      const draft = Campaign.draft(input);
      const now = new Date(this.now).toISOString();
      const campaign = {
        id: crypto.randomBytes(6).toString('hex'),
        title: draft.title,
        owner: this._owner(owner || (input && input.owner)),
        createdBy: by == null ? null : String(by),
        createdAt: now,
        updatedAt: now,
        content: draft.content,
        filter: draft.filter,
        status: 'draft',
        sendAt: null,
        startedAt: null,
        finishedAt: null,
        preview: null,
        stats: emptyStats(),
        log: []
      };
      this._confine(campaign);
      this._log(campaign, 'create', by);
      this.content.campaigns[campaign.id] = campaign;
      await this._persist();
      return this.campaign(campaign.id);
    });
  }

  /**
   * Change a draft's title, content, or filter.
   * @param {string} id
   * @param {Object} patch `{ title?, content?, filter? }` (content and filter merge field by field)
   * @param {Object} [options]
   * @param {string} [options.by]
   * @returns {Promise<Object>}
   */
  update (id, patch = {}, { by = null } = {}) {
    return this._serial(async () => {
      const campaign = this._get(id);
      if (campaign.status !== 'draft') throw httpError(409, 'Only drafts can be changed.');
      if (!patch || typeof patch !== 'object') throw httpError(400, 'patch must be an object');
      const draft = Campaign.draft({
        title: patch.title === undefined ? campaign.title : patch.title,
        content: Object.assign({}, campaign.content, patch.content || {}),
        filter: Object.assign({}, campaign.filter, patch.filter || {})
      });
      Object.assign(campaign, draft, { preview: null });
      delete this.content.approvals[id];
      this._confine(campaign);
      this._log(campaign, 'update', by, { fields: ['title', 'content', 'filter'].filter((field) => patch[field] !== undefined) });
      await this._persist();
      return this.campaign(id);
    });
  }

  /**
   * Who a campaign would reach right now. The counts are saved on the
   * campaign with the preview's `id`; the people previewed are kept (never
   * served) so that sending with that `id` reaches only them.
   * @param {string} id
   * @returns {Promise<Object>} `{ id, at, reach, limit, over, optedOut, excluded, inactive, active, unseen, found, sources: [{ source, sourceName, count }], recipients: [{ name, sourceName }] }` (recipients in sending order)
   */
  preview (id) {
    return this._serial(async () => {
      const campaign = this._get(id);
      if (!['draft', 'scheduled'].includes(campaign.status)) throw httpError(409, `This campaign is ${campaign.status}.`);
      const { recipients, counts } = await this._audience(campaign, { approved: false });
      const at = new Date(this.now).toISOString();
      const token = crypto.randomBytes(4).toString('hex');
      campaign.preview = Object.assign({ id: token, at }, counts);
      this.content.approvals[campaign.id] = { preview: token, at, targets: recipients.map((recipient) => recipient.target) };
      await this._persist();
      return Object.assign({}, campaign.preview, {
        recipients: recipients.map((recipient) => ({ name: recipient.name, sourceName: recipient.sourceName }))
      });
    });
  }

  /**
   * Send a draft at `sendAt`, or now. With `preview` (a {@link Campaigns#preview}
   * id) it reaches only the people that preview listed who still qualify;
   * an older preview's id is refused (409), and with `requirePreview` so is
   * sending without one. Refused when the audience is over the cap, or when
   * the owning server sent one within the cooldown (429, with `retryAt`).
   * @param {string} id
   * @param {Object} [options]
   * @param {string|number|Date} [options.sendAt]
   * @param {string} [options.preview] The preview whose people to send to.
   * @param {string} [options.by]
   * @returns {Promise<Object>}
   */
  schedule (id, { sendAt = null, preview = null, by = null } = {}) {
    return this._serial(async () => {
      const campaign = this._get(id);
      if (!['draft', 'scheduled'].includes(campaign.status)) throw httpError(409, `This campaign is ${campaign.status}.`);
      const approval = this.content.approvals[campaign.id];
      if (preview != null && preview !== '') {
        if (!approval || approval.preview !== String(preview)) throw httpError(409, 'This preview is out of date. Preview the campaign again to see who it reaches now.');
        campaign.approved = approval.preview;
      } else if (this.settings.requirePreview) {
        throw httpError(409, 'Preview this campaign and send it with that preview, so whoever sends sees exactly who it reaches.');
      } else {
        campaign.approved = null;
      }
      let at = this.now;
      if (sendAt != null && sendAt !== '') {
        at = time(sendAt);
        if (at === null) throw httpError(400, 'sendAt must be a date');
        at = Math.max(at, this.now);
      }
      if (campaign.content.type === 'script') {
        const scripts = await this._scripts();
        if (!scripts || !scripts.definition(campaign.content.script)) throw httpError(400, `No such script: ${campaign.content.script}`);
      }
      this._checkCooldown(campaign, at);
      const { counts } = await this._audience(campaign);
      campaign.preview = Object.assign({ id: campaign.approved || null, at: new Date(this.now).toISOString() }, counts);
      if (counts.over) {
        await this._persist();
        throw httpError(400, `This campaign would reach ${counts.reach} people; the limit is ${counts.limit}. Narrow it down first.`, { preview: Object.assign({}, campaign.preview) });
      }
      campaign.sendAt = new Date(at).toISOString();
      if (at > this.now) {
        campaign.status = 'scheduled';
        this._log(campaign, 'schedule', by, { sendAt: campaign.sendAt });
      } else {
        await this._launch(campaign, by);
      }
      await this._persist();
      return this.campaign(id);
    });
  }

  /**
   * Hold a scheduled or sending campaign.
   * @param {string} id
   * @param {Object} [options]
   * @param {string} [options.by]
   * @returns {Promise<Object>}
   */
  pause (id, { by = null } = {}) {
    return this._serial(async () => {
      const campaign = this._get(id);
      if (!['scheduled', 'sending'].includes(campaign.status)) throw httpError(409, `This campaign is ${campaign.status}.`);
      campaign.status = 'paused';
      this._log(campaign, 'pause', by);
      await this._persist();
      return this.campaign(id);
    });
  }

  /**
   * Carry on with a paused campaign (sending where it left off, or waiting
   * for its time again).
   * @param {string} id
   * @param {Object} [options]
   * @param {string} [options.by]
   * @returns {Promise<Object>}
   */
  resume (id, { by = null } = {}) {
    return this._serial(async () => {
      const campaign = this._get(id);
      if (campaign.status !== 'paused') throw httpError(409, `This campaign is ${campaign.status}.`);
      this._log(campaign, 'resume', by);
      if (campaign.startedAt) campaign.status = 'sending';
      else if (time(campaign.sendAt) > this.now) campaign.status = 'scheduled';
      else await this._launch(campaign, by);
      await this._persist();
      return this.campaign(id);
    });
  }

  /**
   * Stop a campaign for good; messages not yet sent never go out.
   * @param {string} id
   * @param {Object} [options]
   * @param {string} [options.by]
   * @returns {Promise<Object>}
   */
  cancel (id, { by = null } = {}) {
    return this._serial(async () => {
      const campaign = this._get(id);
      if (['sent', 'cancelled'].includes(campaign.status)) throw httpError(409, `This campaign is ${campaign.status}.`);
      for (const delivery of Object.values(this.content.deliveries[id] || {})) {
        if (delivery.status === 'pending') delivery.status = 'cancelled';
      }
      delete this.content.approvals[id];
      campaign.status = 'cancelled';
      campaign.finishedAt = new Date(this.now).toISOString();
      this._count(campaign);
      this._log(campaign, 'cancel', by);
      await this._persist();
      return this.campaign(id);
    });
  }

  /**
   * Stop campaign messages to one person: from one source, or from all.
   * @param {string} target `<platform>/users/<id>`
   * @param {Object} [options]
   * @param {string} [options.source] Where they no longer want messages from.
   * @param {boolean} [options.all=false] No campaign messages at all.
   * @returns {Promise<{ all: boolean, sources: Array<string> }>}
   */
  optOut (target, { source = null, all = false } = {}) {
    return this._serial(async () => {
      const record = this._optOut(target, { source, all });
      await this._persist();
      return { all: record.all, sources: record.sources.slice() };
    });
  }

  /**
   * Answer a campaign message: `start` its script, `stop` messages from the
   * source it came from, or `stopall`.
   * @param {string} campaignId
   * @param {string} action
   * @param {Object} options
   * @param {string} options.user Who answered (`<platform>/users/<id>`).
   * @param {Function} [options.respond] Called with `{ ok, label?, error? }`.
   * @returns {Promise<Object>}
   */
  async answer (campaignId, action, { user = null, respond = null } = {}) {
    let result;
    try {
      result = await this._serial(() => this._answer(campaignId, action, user));
    } catch (error) {
      this.emit('error', `[CAMPAIGNS] answer: ${errorMessage(error)}`);
      result = { ok: false, error: NO_SCRIPT };
    }
    if (typeof respond === 'function') {
      try { await respond(result); } catch (error) { this.emit('error', `[CAMPAIGNS] respond: ${errorMessage(error)}`); }
    }
    return result;
  }

  /**
   * Is this private message a typed STOP / STOP ALL / START answering a
   * campaign message the sender got recently (and not a reply to a script
   * that is waiting on them)?
   * @param {Object} message Doorman message.
   * @returns {boolean}
   */
  claims (message) {
    if (!message || message.private !== true) return false;
    const action = this._typed(message.object);
    if (!action || this._claimedElsewhere(message)) return false;
    return !!this._recent(message.actor, action);
  }

  /**
   * Send the next due message (and start campaigns whose time has come).
   * Runs every `intervalMs`; call it directly when `intervalMs` is 0.
   * @returns {Promise<boolean>} whether a message was attempted
   */
  tick () {
    return this._serial(async () => {
      const now = this.now;
      let changed = false;
      for (const campaign of Object.values(this.content.campaigns)) {
        if (campaign.status === 'scheduled' && time(campaign.sendAt) <= now) {
          // One campaign whose audience can't be read must not hold up the rest.
          if ((this._launchRetryAt[campaign.id] || 0) > now) continue;
          try {
            await this._launch(campaign, null);
            delete this._launchRetryAt[campaign.id];
            changed = true;
          } catch (error) {
            this._launchRetryAt[campaign.id] = now + this.settings.retryMs;
            this.emit('error', `[CAMPAIGNS] launch ${campaign.id}: ${errorMessage(error)}`);
          }
        }
      }
      let attempted = false;
      const sending = Object.values(this.content.campaigns)
        .filter((campaign) => campaign.status === 'sending')
        .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
      for (const campaign of sending) {
        const pending = Object.entries(this.content.deliveries[campaign.id] || {}).filter(([, delivery]) => delivery.status === 'pending');
        if (!pending.length) {
          this._finish(campaign);
          changed = true;
          continue;
        }
        if (attempted) continue;
        const due = pending.find(([, delivery]) => !delivery.retryAt || delivery.retryAt <= now);
        if (!due) continue;
        await this._send(campaign, due[0], due[1]);
        attempted = true;
        changed = true;
        if (!Object.values(this.content.deliveries[campaign.id]).some((delivery) => delivery.status === 'pending')) this._finish(campaign);
      }
      if (changed) await this._persist();
      return attempted;
    });
  }

  /**
   * Time after which a server may send again (0 when it may now).
   * @param {Object} owner `{ kind: 'guild', guildId }`
   * @param {number} [at] When the next campaign would go out (default now).
   * @returns {number}
   */
  cooldown (owner, at = this.now) {
    if (!owner || owner.kind !== 'guild') return 0;
    return this._cooldownUntil({ id: null, owner }, at);
  }

  /** Every campaign, newest first: title, owner, status, timing, and counts. */
  list () {
    return Object.values(this.content.campaigns)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        owner: Object.assign({}, campaign.owner),
        status: campaign.status,
        sendAt: campaign.sendAt,
        startedAt: campaign.startedAt,
        finishedAt: campaign.finishedAt,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
        stats: this._stats(campaign)
      }));
  }

  /**
   * One campaign with its content, filter, counts, and log (never who it went to).
   * @param {string} id
   * @returns {Object|null}
   */
  campaign (id) {
    const campaign = this.content.campaigns[id];
    if (!campaign) return null;
    return Object.assign(JSON.parse(JSON.stringify(campaign)), { stats: this._stats(campaign) });
  }

  /**
   * Aggregate numbers for the Doorman console (no ids or content).
   * @returns {Object}
   */
  report () {
    const campaigns = {};
    let sent = 0;
    for (const campaign of Object.values(this.content.campaigns)) {
      campaigns[campaign.status] = (campaigns[campaign.status] || 0) + 1;
      sent += this._stats(campaign).sent;
    }
    return { campaigns, sent, optOuts: Object.keys(this.content.optouts).length };
  }

  // ### Internals

  _serial (job) {
    const run = this._queue.then(job);
    this._queue = run.catch(() => {});
    return run;
  }

  _schedule () {
    if (!this._running || !(this.settings.intervalMs > 0)) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      this.tick()
        .catch((error) => this.emit('error', `[CAMPAIGNS] tick: ${errorMessage(error)}`))
        .then(() => this._schedule());
    }, this.settings.intervalMs);
    if (typeof this._timer.unref === 'function') this._timer.unref();
  }

  _get (id) {
    const campaign = this.content.campaigns[id];
    if (!campaign) throw httpError(404, 'No such campaign');
    return campaign;
  }

  _owner (owner) {
    if (!owner || owner.kind == null || owner.kind === 'staff') return { kind: 'staff' };
    if (owner.kind !== 'guild') throw httpError(400, 'owner.kind must be "staff" or "guild"');
    const guildId = String(owner.guildId || '');
    if (!/^[^\s/]{1,100}$/.test(guildId)) throw httpError(400, 'owner.guildId is required');
    return { kind: 'guild', guildId, guildName: owner.guildName ? String(owner.guildName).slice(0, 100) : null };
  }

  _confine (campaign) {
    if (campaign.owner.kind !== 'guild') return;
    campaign.filter.guilds = [campaign.owner.guildId];
    campaign.filter.excludeGuilds = [];
  }

  _limit (campaign) {
    return campaign.owner.kind === 'guild' ? this.settings.maxAudience : this.settings.staffMaxAudience;
  }

  _log (campaign, type, by, details = {}) {
    const at = new Date(this.now).toISOString();
    campaign.log.push(Object.assign({ at, type, by: by == null ? null : String(by) }, details));
    if (campaign.log.length > MAX_LOG) campaign.log.splice(0, campaign.log.length - MAX_LOG);
    campaign.updatedAt = at;
  }

  _stats (campaign) {
    const stats = Object.assign(emptyStats(), campaign.stats);
    stats.pending = Object.values(this.content.deliveries[campaign.id] || {}).filter((delivery) => delivery.status === 'pending').length;
    return stats;
  }

  _count (campaign) {
    campaign.stats = this._stats(campaign);
  }

  _cooldownUntil (campaign, at) {
    const gap = this.settings.guildCooldownMs;
    if (!(gap > 0)) return 0;
    let until = 0;
    for (const other of Object.values(this.content.campaigns)) {
      if (other.id === campaign.id || other.owner.kind !== 'guild' || other.owner.guildId !== campaign.owner.guildId) continue;
      if (other.status === 'draft' || (other.status === 'cancelled' && !other.startedAt)) continue;
      const otherAt = time(other.startedAt || other.sendAt);
      if (otherAt === null || Math.abs(otherAt - at) >= gap) continue;
      until = Math.max(until, otherAt + gap);
    }
    return until;
  }

  _checkCooldown (campaign, at) {
    if (campaign.owner.kind !== 'guild') return;
    const until = this._cooldownUntil(campaign, at);
    if (!until) return;
    const hours = Math.round(this.settings.guildCooldownMs / (60 * 60 * 1000));
    throw httpError(429, `A server can send one campaign every ${hours} hours. The next one can go out ${new Date(until).toISOString()}.`, { retryAt: new Date(until).toISOString() });
  }

  async _lastSeen (target) {
    try {
      return time(await this._activity(target));
    } catch (error) {
      this.emit('error', `[CAMPAIGNS] activity: ${errorMessage(error)}`);
      return null;
    }
  }

  // Everyone the campaign reaches now; once sent with a preview (`approved`),
  // only those that preview listed.
  async _audience (campaign, { approved = true } = {}) {
    const filter = campaign.filter;
    const approval = approved && campaign.approved ? this.content.approvals[campaign.id] : null;
    if (approved && campaign.approved && (!approval || approval.preview !== campaign.approved)) {
      throw httpError(409, 'The preview this campaign was sent with is gone. Preview it again.');
    }
    const listed = approval ? new Set(approval.targets) : null;
    if ((filter.activeWithinDays || filter.inactiveForDays) && typeof this._activity !== 'function') {
      throw httpError(400, `Recent activity is not tracked here, so ${filter.activeWithinDays ? 'activeWithinDays' : 'inactiveForDays'} cannot be used.`);
    }
    const platforms = filter.platforms.length ? filter.platforms : Object.keys(this._audiences);
    const view = this._view(campaign);
    const people = new Map();
    for (const platform of platforms) {
      const lookup = this._audiences[platform];
      if (typeof lookup !== 'function') continue;
      const found = await lookup(JSON.parse(JSON.stringify(filter)), view);
      for (const entry of [].concat(found || [])) {
        const target = entry && String(entry.target || '');
        if (!target || !USER.test(target) || target.split('/')[0] !== platform) continue;
        const source = entry.source == null ? null : String(entry.source);
        const person = people.get(target) || { target, name: entry.name ? String(entry.name) : null, sources: [] };
        if (!person.sources.some((known) => known.source === source)) {
          person.sources.push({ source, sourceName: entry.sourceName ? String(entry.sourceName) : source });
        }
        people.set(target, person);
      }
    }

    const reached = new Set();
    for (const other of filter.excludeCampaigns) {
      for (const [target, delivery] of Object.entries(this.content.deliveries[other] || {})) {
        if (delivery.status === 'sent') reached.add(target);
      }
    }

    const now = this.now;
    const counts = { found: people.size, optedOut: 0, excluded: 0, inactive: 0, active: 0, unseen: 0, notPreviewed: 0 };
    const recipients = [];
    const seenAt = new Map();
    for (const person of people.values()) {
      if (listed && !listed.has(person.target)) {
        counts.notPreviewed += 1;
        continue;
      }
      const optout = this.content.optouts[person.target];
      const open = !optout ? person.sources : (optout.all ? [] : person.sources.filter((entry) => !optout.sources.includes(entry.source)));
      if (!open.length) {
        counts.optedOut += 1;
        continue;
      }
      if (reached.has(person.target)) {
        counts.excluded += 1;
        continue;
      }
      if (filter.activeWithinDays || filter.inactiveForDays) {
        const seen = await this._lastSeen(person.target);
        if (seen === null && filter.inactiveForDays) {
          counts.unseen += 1;
          continue;
        }
        if (filter.activeWithinDays && (seen === null || now - seen > filter.activeWithinDays * DAY)) {
          counts.inactive += 1;
          continue;
        }
        if (filter.inactiveForDays && now - seen < filter.inactiveForDays * DAY) {
          counts.active += 1;
          continue;
        }
        seenAt.set(person.target, seen);
      }
      recipients.push({ target: person.target, name: person.name, source: open[0].source, sourceName: open[0].sourceName });
    }
    if (filter.inactiveForDays) recipients.sort((a, b) => seenAt.get(a.target) - seenAt.get(b.target));

    const limit = this._limit(campaign);
    const sources = new Map();
    for (const recipient of recipients) {
      const entry = sources.get(recipient.source) || { source: recipient.source, sourceName: recipient.sourceName, count: 0 };
      entry.count += 1;
      sources.set(recipient.source, entry);
    }
    Object.assign(counts, { reach: recipients.length, limit, over: recipients.length > limit, sources: [...sources.values()] });
    return { recipients: recipients.slice(0, limit), counts };
  }

  async _launch (campaign, by) {
    const { recipients, counts } = await this._audience(campaign);
    const deliveries = {};
    for (const recipient of recipients) {
      deliveries[recipient.target] = {
        status: 'pending',
        attempts: 0,
        retryAt: 0,
        name: recipient.name,
        source: recipient.source,
        sourceName: recipient.sourceName
      };
    }
    this.content.deliveries[campaign.id] = deliveries;
    campaign.stats = Object.assign(emptyStats(), {
      targeted: recipients.length,
      optedOut: counts.optedOut,
      excluded: counts.excluded,
      inactive: counts.inactive,
      active: counts.active,
      unseen: counts.unseen,
      notPreviewed: counts.notPreviewed
    });
    delete this.content.approvals[campaign.id];
    campaign.status = 'sending';
    campaign.startedAt = new Date(this.now).toISOString();
    if (!campaign.sendAt) campaign.sendAt = campaign.startedAt;
    this._log(campaign, 'send', by, { targeted: recipients.length, capped: counts.over ? counts.reach : undefined });
    if (!recipients.length) this._finish(campaign);
  }

  _finish (campaign) {
    campaign.status = 'sent';
    campaign.finishedAt = new Date(this.now).toISOString();
    this._count(campaign);
    this._log(campaign, 'sent', null, { sent: campaign.stats.sent, failed: campaign.stats.failed, closed: campaign.stats.closed });
  }

  async _send (campaign, target, delivery) {
    delivery.attempts += 1;
    const message = {
      type: 'CampaignMessage',
      campaign: campaign.id,
      title: campaign.title,
      text: campaign.content.text,
      source: delivery.source,
      sourceName: delivery.sourceName,
      via: this.settings.via || null,
      start: campaign.content.type === 'script'
    };
    try {
      await this._deliver(target, message);
      delivery.status = 'sent';
      delivery.sentAt = new Date(this.now).toISOString();
      delivery.retryAt = 0;
      campaign.stats.sent += 1;
      this.content.recent[target] = { campaign: campaign.id, at: this.now };
      this.emit('delivered', { campaign: campaign.id, title: campaign.title, target, at: delivery.sentAt });
    } catch (error) {
      const code = Number(error && error.code);
      const status = Number(error && (error.status || error.httpStatus));
      const temporary = status === 429 || status >= 500 || !status;
      if (code === 50007) {
        delivery.status = 'closed';
        campaign.stats.closed += 1;
      } else if (temporary && delivery.attempts <= this.settings.retries) {
        delivery.retryAt = this.now + this.settings.retryMs * 2 ** (delivery.attempts - 1);
      } else {
        delivery.status = 'failed';
        campaign.stats.failed += 1;
        this.emit('warning', `[CAMPAIGNS] ${campaign.id}: could not deliver: ${errorMessage(error)}`);
      }
    }
  }

  async _deliver (target, object) {
    if (!this.host || typeof this.host.whisper !== 'function') throw new Error('No host to send private messages through');
    return this.host.whisper(target, object);
  }

  _optOut (target, { source = null, all = false } = {}) {
    if (typeof target !== 'string' || !USER.test(target)) throw httpError(400, 'target must be a namespaced user id');
    const record = this.content.optouts[target] || { all: false, sources: [] };
    if (all) record.all = true;
    else if (source != null && !record.sources.includes(String(source))) record.sources.push(String(source));
    record.updatedAt = new Date(this.now).toISOString();
    this.content.optouts[target] = record;
    return record;
  }

  async _answer (campaignId, action, user) {
    const campaign = this.content.campaigns[campaignId];
    const delivery = campaign && user ? (this.content.deliveries[campaignId] || {})[user] : null;
    if (!delivery || delivery.status !== 'sent') return { ok: false, error: INACTIVE };
    const now = new Date(this.now).toISOString();

    if (action === 'stop' || action === 'stopall') {
      this._optOut(user, { source: delivery.source, all: action === 'stopall' });
      if (!delivery.stoppedAt) campaign.stats.stopped += 1;
      delivery.stoppedAt = now;
      await this._persist();
      const from = delivery.sourceName ? ` from ${delivery.sourceName}` : '';
      return { ok: true, action, label: action === 'stopall' ? 'You won\'t get these messages again.' : `You won't get messages${from} again.` };
    }

    if (action === 'start') {
      if (campaign.content.type !== 'script') return { ok: false, error: INACTIVE };
      const scripts = await this._scripts();
      if (!scripts) return { ok: false, error: NO_SCRIPT };
      try {
        await scripts.begin(campaign.content.script, {
          user,
          name: delivery.name,
          context: { campaign: campaign.id, guildId: delivery.source, guildName: delivery.sourceName }
        });
      } catch (error) {
        return { ok: false, error: error && error.status && error.status < 500 ? errorMessage(error) : NO_SCRIPT };
      }
      if (!delivery.startedAt) campaign.stats.started += 1;
      delivery.startedAt = now;
      await this._persist();
      return { ok: true, action, label: 'Started — see the next message.' };
    }

    return { ok: false, error: INACTIVE };
  }

  async _handleAnswer (answer) {
    if (!answer || !answer.campaign) return null;
    return this.answer(answer.campaign, answer.action, { user: answer.user || null, respond: answer.respond || null });
  }

  async _handleMessage (message) {
    if (!this.claims(message)) return null;
    const action = this._typed(message.object);
    const recent = this._recent(message.actor, action);
    return this.answer(recent.campaign, action, {
      user: message.actor,
      respond: (result) => this._deliver(message.actor, result.ok ? result.label : result.error)
    });
  }

  _typed (text) {
    const value = String(text == null ? '' : text).trim();
    if (STOP_ALL.test(value)) return 'stopall';
    if (STOP.test(value)) return 'stop';
    if (START.test(value)) return 'start';
    return null;
  }

  _recent (target, action) {
    const recent = target ? this.content.recent[target] : null;
    if (!recent || this.now - recent.at > this.settings.stopWindowMs) return null;
    const campaign = this.content.campaigns[recent.campaign];
    const delivery = campaign ? (this.content.deliveries[campaign.id] || {})[target] : null;
    if (!delivery || delivery.status !== 'sent') return null;
    if (action === 'start' && (campaign.content.type !== 'script' || delivery.startedAt)) return null;
    return recent;
  }

  _claimedElsewhere (message) {
    const plugins = this.host && this.host.plugins ? Object.values(this.host.plugins) : [];
    return plugins.some((plugin) => {
      if (plugin === this || typeof plugin.claims !== 'function') return false;
      try { return !!plugin.claims(message); } catch (_) { return false; }
    });
  }

  async _scripts () {
    if (!this.host || typeof this.host.started !== 'function') return null;
    return this.host.started('scripts');
  }

  _view (campaign) {
    return JSON.parse(JSON.stringify({
      id: campaign.id,
      title: campaign.title,
      owner: campaign.owner,
      content: campaign.content,
      filter: campaign.filter
    }));
  }

  async _restore () {
    if (!this.store) return;
    let prior = null;
    try { prior = await this.store.get(STORE_KEY); } catch (_) { prior = null; }
    if (typeof prior === 'string') {
      try { prior = JSON.parse(prior); } catch (_) { prior = null; }
    }
    if (!prior || typeof prior !== 'object') return;
    this.content.campaigns = prior.campaigns || {};
    this.content.deliveries = prior.deliveries || {};
    this.content.optouts = prior.optouts || {};
    this.content.recent = prior.recent || {};
    this.content.approvals = prior.approvals || {};
  }

  async _persist () {
    if (!this.store || !this.store.db) return;
    const now = this.now;
    for (const [target, recent] of Object.entries(this.content.recent)) {
      if (now - recent.at > this.settings.stopWindowMs) delete this.content.recent[target];
    }
    try {
      await this.store.set(STORE_KEY, this.content);
    } catch (error) {
      this.emit('error', `[CAMPAIGNS] persist: ${errorMessage(error)}`);
    }
  }

  // ### HTTP

  /**
   * JSON API, every route behind `authorize(req)` or a bearer token equal to
   * `token` (404 when neither is configured): `GET|POST <base>`,
   * `GET|PATCH <base>/<id>`, and `POST <base>/<id>/preview|schedule|pause|resume|cancel`.
   * Responses carry counts and logs, never who a campaign went to; a
   * preview lists the display names it would reach (no ids), and
   * `schedule` takes its `{ preview }` id to send to just them.
   * @param {Object} [options]
   * @param {Function} [options.authorize] `(req) => boolean` (may be async).
   * @param {string} [options.token] Defaults to `settings.token`.
   * @param {string} [options.basePath] Defaults to `settings.basePath`.
   * @returns {Function} `(req, res, next)`
   */
  middleware ({ authorize = null, token = null, basePath = null } = {}) {
    const base = String(basePath || this.settings.basePath).replace(/\/+$/, '');
    const secret = token || this.settings.token || null;
    const gate = async (req) => {
      if (typeof authorize === 'function') {
        if (!(await authorize(req))) throw httpError(401, 'Unauthorized');
        return;
      }
      if (!secret) throw httpError(404, 'Not found');
      const header = String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match || !safeEqual(match[1].trim(), secret)) throw httpError(401, 'Unauthorized');
    };

    return (req, res, next) => {
      const url = new URL(req.originalUrl || req.url, 'http://localhost');
      const pathname = (req.path || url.pathname).replace(/\/+$/, '');
      if (pathname !== base && !pathname.startsWith(`${base}/`)) return next();
      let parts;
      try {
        parts = pathname.slice(base.length).split('/').filter(Boolean).map(decodeURIComponent);
      } catch (_) {
        return sendJson(res, 400, { error: 'Bad path' });
      }
      const method = String(req.method || 'GET').toUpperCase();

      const job = async () => {
        await gate(req);
        if (parts.length === 0) {
          if (method === 'GET') return { campaigns: this.list() };
          if (method !== 'POST') throw httpError(405, 'Method not allowed');
          const body = await readBody(req);
          return this.create(body, { by: body.by || null, owner: body.owner || null });
        }
        const id = parts[0];
        if (parts.length === 1) {
          if (method === 'PATCH') {
            const body = await readBody(req);
            return this.update(id, body, { by: body.by || null });
          }
          if (method !== 'GET') throw httpError(405, 'Method not allowed');
          const campaign = this.campaign(id);
          if (!campaign) throw httpError(404, 'No such campaign');
          return campaign;
        }
        if (parts.length === 2 && ACTIONS.includes(parts[1])) {
          if (method !== 'POST') throw httpError(405, 'Method not allowed');
          const body = await readBody(req);
          switch (parts[1]) {
            case 'preview': return this.preview(id);
            case 'schedule': return this.schedule(id, { sendAt: body.sendAt, preview: body.preview, by: body.by || null });
            default: return this[parts[1]](id, { by: body.by || null });
          }
        }
        throw httpError(404, 'Not found');
      };

      job().then((body) => sendJson(res, 200, body)).catch((error) => {
        if (res.headersSent) return;
        const status = error && error.status ? error.status : 500;
        const body = { error: status >= 500 ? 'Campaigns unavailable' : errorMessage(error) };
        if (error && error.retryAt) body.retryAt = error.retryAt;
        if (error && error.preview) body.preview = error.preview;
        sendJson(res, status, body);
        if (status >= 500) this.emit('error', `[CAMPAIGNS] http: ${errorMessage(error)}`);
      });
    };
  }
}

module.exports = Campaigns;
module.exports.Campaign = Campaign;
module.exports.BASE = BASE;
// Hosts check this before relying on `requirePreview` (older releases ignore it).
module.exports.PREVIEW_APPROVALS = true;
