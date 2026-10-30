'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const Service = require('@fabric/core/types/service');
const Script = require('../types/script');

const STORE_KEY = '/scripts';
const BASE = '/services/doorman/scripts';
const DAY = 24 * 60 * 60 * 1000;
const MAX_BODY = 256 * 1024;
const MAX_SOURCE_OPTIONS = 100;
const MAX_CHAINED_STEPS = 100;
const OPTION_ID = /^[A-Za-z0-9_.-]{1,40}$/;
const OUTCOMES = ['started', 'completed', 'cancelled', 'expired', 'failed', 'undelivered'];

const ENDED = 'This conversation has ended. Run the command again to start over.';
const EXPIRED = 'This conversation expired. Run the command again to start over.';
const PASSED = 'This step has passed.';
const NOT_YOURS = 'This conversation belongs to someone else.';
const SAVE_FAILED = 'Something went wrong saving your answers. Run the command again in a little while.';
const CANCELLED = 'Cancelled. Run the command again any time to start over.';
const DONE = 'All set — thanks!';

function errorMessage (error) {
  return error && error.message ? error.message : String(error);
}

function httpError (status, message) {
  return Object.assign(new Error(message), { status });
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
        reject(httpError(413, 'Script is too large'));
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

function parseJson (text) {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw httpError(400, 'Body must be JSON');
  }
}

/**
 * Managed conversations ("scripts") for Doorman: walks one person through a
 * stored, data-only {@link Script} over private messages, one step at a time.
 *
 * Steps go out through the host's `whisper(target, step)` as `ScriptStep`
 * payloads; adapters render them (buttons and menus where the platform has
 * them, numbered text everywhere else). Replies come back as host `answer`
 * events (buttons, menus, forms) or as private `message` events while a
 * session waits on the sender. Definitions, sessions, and results live in a
 * Fabric Store; every definition change is a new content-addressed version
 * and a session finishes on the version it started with.
 *
 * Hosts extend scripts by name, never by code in a definition:
 * {@link Scripts#source} feeds `optionsFrom` choices, {@link Scripts#action}
 * runs `onComplete` entries (`record` is built in), and
 * {@link Scripts#authorize} checks a definition's `requires`.
 */
class Scripts extends Service {
  static get pluginName () {
    return 'scripts';
  }

  /**
   * @param {Object} [settings]
   * @param {string} [settings.path='stores/scripts'] Store directory.
   * @param {boolean} [settings.persistent=true] Keep state in the Store.
   * @param {string|Array<Object>|Object} [settings.seed] Directory of `*.json` definitions, or definitions.
   * @param {number} [settings.ttlMs=86400000] How long a session waits for its next answer.
   * @param {number} [settings.keepMs=2592000000] How long finished sessions are kept.
   * @param {number} [settings.sweepMs=60000] Expiry sweep interval (0 = only on start).
   * @param {string} [settings.token] Bearer token for the write and results routes.
   * @param {string} [settings.basePath='/services/doorman/scripts']
   * @param {Function} [settings.now] Clock (tests).
   */
  constructor (settings = {}) {
    super(Object.assign({
      name: 'scripts',
      path: 'stores/scripts',
      persistent: true,
      networking: false
    }, settings));

    this.settings = Object.assign({
      seed: null,
      ttlMs: DAY,
      keepMs: 30 * DAY,
      sweepMs: 60 * 1000,
      token: null,
      basePath: BASE,
      now: () => Date.now()
    }, this.settings, settings);

    this._state.content = { scripts: {}, sessions: {}, results: {}, stats: {} };
    this._sources = {};
    this._actions = { record: (session) => this._record(session) };
    this._requirements = null;
    this._queues = {};
    this._sweeper = null;
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
    if (this.settings.seed) await this.seed(this.settings.seed);
    await this.sweep();
    if (this.settings.sweepMs > 0) {
      this._sweeper = setInterval(() => {
        this.sweep().catch((error) => this.emit('error', `[SCRIPTS] sweep: ${errorMessage(error)}`));
      }, this.settings.sweepMs);
      if (typeof this._sweeper.unref === 'function') this._sweeper.unref();
    }
    return this;
  }

  async stop () {
    if (this._sweeper) clearInterval(this._sweeper);
    this._sweeper = null;
    this.untrust();
    await this._persist();
    await super.stop();
    return this;
  }

  /**
   * Listen to a host (Doorman, or any emitter speaking its event vocabulary)
   * for answers and private replies.
   * @param {EventEmitter} host
   * @returns {Scripts}
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
        Promise.resolve(handler(payload)).catch((error) => this.emit('error', `[SCRIPTS] ${event}: ${errorMessage(error)}`));
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
   * Name a list of choices for `optionsFrom`.
   * @param {string} name
   * @param {Function} fn `(scope, step) => [{ id, label, description? }]` (may be async).
   * @returns {Scripts}
   */
  source (name, fn) {
    this._sources[name] = fn;
    return this;
  }

  /**
   * Name an `onComplete` action. `record` (save the answers under the
   * session subject) is built in and may be replaced. An action may return
   * `{ answers, labels }`, merged into the session before later actions run
   * and the completion message renders. One that throws an error with
   * `expose: true` fails the session with that error's message; any other
   * error sends a generic one.
   * @param {string} name
   * @param {Function} fn `(session, entry, definition) => *` (may be async).
   * @returns {Scripts}
   */
  action (name, fn) {
    this._actions[name] = fn;
    return this;
  }

  /**
   * Check a definition's `requires` when a session starts and again before it
   * completes. Without one, scripts that require anything refuse to run.
   * @param {Function} fn `(requirement, session, phase) => boolean` (may be async; throw for a custom refusal).
   * @returns {Scripts}
   */
  authorize (fn) {
    this._requirements = fn;
    return this;
  }

  // ### Definitions

  /**
   * Store a definition as the script's current version.
   * @param {Object} definition
   * @param {Object} [options]
   * @param {boolean} [options.seeded=false] Came from the seed files (edits made at runtime win over later seeds).
   * @returns {Promise<{ id: string, version: string, changed: boolean }>}
   */
  async defineScript (definition, { seeded = false } = {}) {
    const normalized = Script.validate(definition);
    const version = Script.version(normalized);
    const now = new Date(this.now).toISOString();
    const existing = this.content.scripts[normalized.id];
    if (seeded && existing && !existing.seeded) return { id: normalized.id, version: existing.current, changed: false };
    const record = existing || { id: normalized.id, current: null, versions: {}, createdAt: now };
    const changed = record.current !== version;
    record.versions[version] = normalized;
    record.current = version;
    record.seeded = seeded;
    if (changed) record.updatedAt = now;
    this.content.scripts[normalized.id] = record;
    if (changed) await this._persist();
    return { id: normalized.id, version, changed };
  }

  /**
   * Install definitions from a directory of `*.json` files (or a list). New
   * ids are added; a seeded script takes a newer seed; a script edited at
   * runtime keeps the edit.
   * @param {string|Array<Object>|Object} source
   * @returns {Promise<Array<Object>>} `defineScript` results
   */
  async seed (source) {
    let definitions = [];
    if (typeof source === 'string') {
      const dir = path.resolve(source);
      if (!fs.existsSync(dir)) return [];
      definitions = fs.readdirSync(dir).filter((file) => file.endsWith('.json')).sort().map((file) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        } catch (error) {
          this.emit('error', `[SCRIPTS] seed ${file}: ${errorMessage(error)}`);
          return null;
        }
      }).filter(Boolean);
    } else {
      definitions = [].concat(source || []);
    }
    const results = [];
    for (const definition of definitions) {
      try {
        results.push(await this.defineScript(definition, { seeded: true }));
      } catch (error) {
        this.emit('error', `[SCRIPTS] seed ${definition && definition.id}: ${errorMessage(error)}`);
      }
    }
    return results;
  }

  /** Current definition of a script, or null. */
  definition (id, version = null) {
    const record = this.content.scripts[id];
    if (!record) return null;
    return record.versions[version || record.current] || null;
  }

  /**
   * Every script: id, title, version, step count, and outcome counts.
   * @returns {Array<Object>}
   */
  list () {
    return Object.values(this.content.scripts).map((record) => {
      const definition = record.versions[record.current];
      return {
        id: record.id,
        title: definition.title,
        description: definition.description,
        version: record.current,
        seeded: record.seeded === true,
        updatedAt: record.updatedAt || record.createdAt || null,
        steps: Object.keys(definition.steps).length,
        stats: this.stats(record.id)
      };
    });
  }

  /**
   * One script with its current definition and version history.
   * @param {string} id
   * @returns {Object|null}
   */
  script (id) {
    const record = this.content.scripts[id];
    if (!record) return null;
    return {
      id,
      version: record.current,
      seeded: record.seeded === true,
      updatedAt: record.updatedAt || record.createdAt || null,
      versions: Object.keys(record.versions),
      definition: record.versions[record.current],
      stats: this.stats(id)
    };
  }

  /**
   * Outcome counts and active sessions for a script (no user ids).
   * @param {string} id
   * @returns {Object}
   */
  stats (id) {
    const counts = Object.assign(Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])), this.content.stats[id] || {});
    counts.active = Object.values(this.content.sessions).filter((session) => session.script === id && session.status === 'active').length;
    return counts;
  }

  /**
   * Completed answers per subject. Private: includes who completed them.
   * @param {string} id
   * @returns {Array<Object>}
   */
  results (id) {
    return Object.values(this.content.results[id] || {});
  }

  /**
   * Aggregate numbers for the Doorman console (no user ids or answers).
   * @returns {Object}
   */
  report () {
    const sessions = {};
    for (const session of Object.values(this.content.sessions)) {
      sessions[session.status] = (sessions[session.status] || 0) + 1;
    }
    return {
      scripts: Object.keys(this.content.scripts).length,
      sessions,
      perScript: Object.fromEntries(this.list().map((entry) => [entry.id, Object.assign({ title: entry.title }, entry.stats)]))
    };
  }

  // ### Sessions

  /**
   * Start a script for one person and send its first step. Replaces any
   * session they already have open on the same script.
   * @param {string} scriptId
   * @param {Object} options
   * @param {string} options.user Namespaced user id (`<service>/users/<id>`).
   * @param {string} [options.name] Display name for templates.
   * @param {Object} [options.context] Host facts for templates and branches (e.g. the server).
   * @param {string} [options.subject] What the answers are about (results key; default the user).
   * @returns {Promise<{ id: string, script: string, status: string, step: string|null }>}
   */
  async begin (scriptId, { user, name = null, context = {}, subject = null } = {}) {
    const record = this.content.scripts[scriptId];
    if (!record) throw httpError(404, `No such script: ${scriptId}`);
    if (typeof user !== 'string' || !/^[^/]+\/users\/[^/]+$/.test(user)) throw httpError(400, 'user must be a namespaced user id');
    const definition = record.versions[record.current];
    const now = this.now;
    const session = {
      id: crypto.randomBytes(6).toString('hex'),
      script: scriptId,
      version: record.current,
      user,
      name: name ? String(name) : null,
      context: Object.assign({}, context),
      subject: subject == null ? null : String(subject),
      step: null,
      answers: {},
      labels: {},
      options: {},
      status: 'active',
      startedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
      expiresAt: now + (definition.ttlMs || this.settings.ttlMs)
    };
    await this._check(definition, session, 'start');

    for (const other of Object.values(this.content.sessions)) {
      if (other.status === 'active' && other.user === user && other.script === scriptId) this._finish(other, 'cancelled');
    }
    this.content.sessions[session.id] = session;
    this._count(scriptId, 'started');

    try {
      await this._enter(session, definition, definition.start);
    } catch (error) {
      if (session.status === 'active') this._finish(session, 'undelivered');
      await this._persist();
      throw error;
    }
    await this._persist();
    return this._public(session);
  }

  /**
   * Answer the step a session is waiting on.
   * @param {string} sessionId
   * @param {string|null} stepId Step being answered (null = whatever is current).
   * @param {*} value Button value, menu values, form text, or a typed reply.
   * @param {Object} [options]
   * @param {string} [options.user] Who answered (refused unless it is the session's user).
   * @param {string} [options.action] `skip`, `cancel`, or `resend` instead of a value.
   * @param {Function} [options.respond] Called with the result before the next step goes out.
   * @returns {Promise<Object>} `{ ok, error?, label?, status, step }`
   */
  answer (sessionId, stepId, value, options = {}) {
    // One answer at a time per session, so a double press cannot skip a step.
    const previous = this._queues[sessionId] || Promise.resolve();
    const run = previous.then(() => this._answer(sessionId, stepId, value, options));
    const settled = run.catch(() => {});
    this._queues[sessionId] = settled;
    settled.then(() => {
      if (this._queues[sessionId] === settled) delete this._queues[sessionId];
    });
    return run;
  }

  async _answer (sessionId, stepId, value, { user = null, action = null, respond = null } = {}) {
    const session = this.content.sessions[sessionId];
    const reply = async (result) => {
      if (typeof respond === 'function') {
        try { await respond(result); } catch (error) { this.emit('error', `[SCRIPTS] respond: ${errorMessage(error)}`); }
      }
      return result;
    };
    if (!session) return reply({ ok: false, error: ENDED, status: null, step: null });
    if (user && user !== session.user) return reply({ ok: false, error: NOT_YOURS, status: session.status, step: session.step });
    if (session.status === 'active' && session.expiresAt <= this.now) {
      this._finish(session, 'expired');
      await this._persist();
    }
    if (session.status !== 'active') {
      return reply({ ok: false, error: session.status === 'expired' ? EXPIRED : ENDED, status: session.status, step: session.step });
    }

    const definition = this.definition(session.script, session.version);
    if (action === 'cancel') {
      const result = await reply({ ok: true, label: 'Cancelled', status: 'cancelled', step: session.step });
      await this.cancel(session.id);
      return result;
    }
    if (action === 'resend') {
      const step = definition.steps[session.step];
      await reply({ ok: true, label: null, status: session.status, step: session.step });
      await this._deliver(session, this._payload(session, definition, session.step, step, session.options[session.step] || []));
      return { ok: true, status: session.status, step: session.step };
    }
    if (stepId && stepId !== session.step) return reply({ ok: false, error: PASSED, status: session.status, step: session.step });

    const step = definition.steps[session.step];
    const parsed = Script.parse(step, action === 'skip' ? null : value, session.options[session.step] || []);
    if (!parsed.ok) return reply({ ok: false, error: parsed.error, status: session.status, step: session.step });

    if (step.saveAs) {
      session.answers[step.saveAs] = parsed.value;
      session.labels[step.saveAs] = parsed.skipped ? null : (step.input.type === 'confirm' ? 'Yes' : parsed.label);
    }
    session.updatedAt = new Date(this.now).toISOString();
    session.expiresAt = this.now + (definition.ttlMs || this.settings.ttlMs);
    const answered = session.step;
    const next = Script.next(step, this._scope(session, definition));
    await this._persist();
    await reply({ ok: true, label: parsed.label, status: session.status, step: answered });

    try {
      if (next === null) await this._complete(session, definition);
      else await this._enter(session, definition, next);
    } catch (error) {
      if (session.status === 'active') this._finish(session, 'undelivered');
      this.emit('error', `[SCRIPTS] ${session.script}: ${errorMessage(error)}`);
    }
    await this._persist();
    return { ok: true, label: parsed.label, status: session.status, step: answered };
  }

  /**
   * Stop a session and tell its user.
   * @param {string} sessionId
   * @param {Object} [options]
   * @param {boolean} [options.notify=true]
   * @returns {Promise<Object|null>}
   */
  async cancel (sessionId, { notify = true } = {}) {
    const session = this.content.sessions[sessionId];
    if (!session || session.status !== 'active') return null;
    this._finish(session, 'cancelled');
    await this._persist();
    if (notify) {
      const definition = this.definition(session.script, session.version);
      await this._deliver(session, Script.render(definition.cancelled.say || CANCELLED, this._scope(session, definition)))
        .catch((error) => this.emit('error', `[SCRIPTS] cancel: ${errorMessage(error)}`));
    }
    return this._public(session);
  }

  /**
   * Start a session's script over for the same person and subject (on the
   * script's current version).
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  async restart (sessionId) {
    const session = this.content.sessions[sessionId];
    if (!session) throw httpError(404, 'No such session');
    return this.begin(session.script, { user: session.user, name: session.name, context: session.context, subject: session.subject });
  }

  /**
   * Is this private message a reply to an open session? Doorman skips its
   * `!trigger` routing for claimed messages.
   * @param {Object} message Doorman message.
   * @returns {boolean}
   */
  claims (message) {
    return !!(message && message.private === true && this._activeFor(message.actor));
  }

  /**
   * Mark sessions past their deadline expired and drop finished sessions
   * older than `keepMs`.
   * @returns {Promise<number>} sessions changed
   */
  async sweep () {
    const now = this.now;
    let changed = 0;
    for (const [id, session] of Object.entries(this.content.sessions)) {
      if (session.status === 'active' && session.expiresAt <= now) {
        this._finish(session, 'expired');
        changed += 1;
      } else if (session.status !== 'active' && now - Date.parse(session.updatedAt) > this.settings.keepMs) {
        delete this.content.sessions[id];
        changed += 1;
      }
    }
    if (changed) await this._persist();
    return changed;
  }

  // ### Internals

  _activeFor (user) {
    if (!user) return null;
    const now = this.now;
    return Object.values(this.content.sessions)
      .filter((session) => session.user === user && session.status === 'active' && session.expiresAt > now)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0] || null;
  }

  async _handleAnswer (answer) {
    if (!answer || !answer.session) return null;
    return this.answer(answer.session, answer.step || null, answer.value, {
      user: answer.user || null,
      action: answer.action || null,
      respond: answer.respond || null
    });
  }

  async _handleMessage (message) {
    if (!this.claims(message)) return null;
    const session = this._activeFor(message.actor);
    const text = String(message.object || '').trim();
    if (/^(cancel|stop|quit)$/i.test(text)) return this.cancel(session.id);
    if (/^(restart|start over)$/i.test(text)) return this.restart(session.id);
    const result = await this.answer(session.id, session.step, text, { user: message.actor });
    if (!result.ok) {
      await this._deliver(session, result.error).catch((error) => this.emit('error', `[SCRIPTS] reply: ${errorMessage(error)}`));
    }
    return result;
  }

  async _enter (session, definition, stepId) {
    let current = stepId;
    for (let hops = 0; current !== null && hops < MAX_CHAINED_STEPS; hops++) {
      const step = definition.steps[current];
      session.step = current;
      let options = [];
      if (step.input.type === 'choice') {
        options = await this._options(session, definition, step);
        session.options[current] = options;
        if (!options.length) {
          if (!step.input.optional) {
            this._finish(session, 'failed');
            await this._deliver(session, 'There is nothing to choose from for this step right now. Run the command again in a little while.');
            return;
          }
          session.answers[step.saveAs] = null;
          session.labels[step.saveAs] = null;
          current = Script.next(step, this._scope(session, definition));
          continue;
        }
      }
      await this._deliver(session, this._payload(session, definition, current, step, options));
      if (step.input.type !== 'none') return;
      current = Script.next(step, this._scope(session, definition));
    }
    if (current === null) await this._complete(session, definition);
  }

  async _complete (session, definition) {
    try {
      await this._check(definition, session, 'complete');
    } catch (error) {
      this._finish(session, 'failed');
      await this._deliver(session, errorMessage(error));
      return;
    }
    try {
      for (const entry of definition.onComplete) {
        const action = this._actions[entry.action];
        if (typeof action !== 'function') throw new Error(`unknown action "${entry.action}"`);
        const result = await action(this._view(session), entry, definition);
        if (result && typeof result === 'object') {
          if (result.answers && typeof result.answers === 'object') Object.assign(session.answers, result.answers);
          if (result.labels && typeof result.labels === 'object') Object.assign(session.labels, result.labels);
        }
      }
    } catch (error) {
      this._finish(session, 'failed');
      await this._persist();
      if (error && error.expose === true) {
        this.emit('warning', `[SCRIPTS] ${session.script} onComplete: ${errorMessage(error)}`);
        await this._deliver(session, errorMessage(error));
      } else {
        this.emit('error', `[SCRIPTS] ${session.script} onComplete: ${errorMessage(error)}`);
        await this._deliver(session, SAVE_FAILED);
      }
      return;
    }
    this._finish(session, 'completed');
    await this._persist();
    await this._deliver(session, Script.render(definition.complete.say || DONE, this._scope(session, definition)));
  }

  async _check (definition, session, phase) {
    if (!definition.requires.length) return;
    if (typeof this._requirements !== 'function') throw httpError(403, 'This script cannot run here.');
    for (const requirement of definition.requires) {
      const allowed = await this._requirements(requirement, this._view(session), phase);
      if (!allowed) throw httpError(403, `You need the ${requirement} permission for this.`);
    }
  }

  async _options (session, definition, step) {
    if (step.input.options) return step.input.options;
    const source = this._sources[step.input.optionsFrom];
    if (typeof source !== 'function') {
      this.emit('error', `[SCRIPTS] ${session.script}: no source named "${step.input.optionsFrom}"`);
      return [];
    }
    const list = await source(this._scope(session, definition), step);
    return [].concat(list || []).map((option) => {
      if (!option || option.id == null) return null;
      const id = String(option.id);
      if (!OPTION_ID.test(id)) return null;
      return {
        id,
        label: String(option.label == null ? id : option.label).slice(0, 100) || id,
        description: option.description ? String(option.description).slice(0, 100) : null
      };
    }).filter(Boolean).slice(0, MAX_SOURCE_OPTIONS);
  }

  _payload (session, definition, stepId, step, options) {
    const input = step.input;
    return {
      type: 'ScriptStep',
      session: session.id,
      step: stepId,
      script: definition.id,
      title: definition.title,
      text: Script.render(step.say, this._scope(session, definition)),
      input: {
        type: input.type,
        optional: input.optional,
        multiple: input.multiple === true,
        options: input.type === 'choice' ? options : [],
        label: input.label || null,
        placeholder: input.placeholder || null,
        minLength: input.minLength || 0,
        maxLength: input.maxLength || null,
        multiline: input.multiline === true
      }
    };
  }

  _scope (session, definition) {
    return {
      user: { name: session.name },
      context: session.context,
      answers: session.answers,
      labels: session.labels,
      script: { id: definition.id, title: definition.title }
    };
  }

  _view (session) {
    return {
      id: session.id,
      script: session.script,
      version: session.version,
      user: session.user,
      name: session.name,
      context: Object.assign({}, session.context),
      subject: session.subject,
      answers: Object.assign({}, session.answers),
      labels: Object.assign({}, session.labels)
    };
  }

  _public (session) {
    return { id: session.id, script: session.script, status: session.status, step: session.step };
  }

  async _deliver (session, object) {
    if (this.host && typeof this.host.whisper === 'function') return this.host.whisper(session.user, object);
    this.emit('whisper', { target: session.user, object });
    return null;
  }

  _finish (session, status) {
    session.status = status;
    session.updatedAt = new Date(this.now).toISOString();
    if (status === 'completed') session.completedAt = session.updatedAt;
    this._count(session.script, status);
  }

  _count (scriptId, outcome) {
    const stats = this.content.stats[scriptId] = this.content.stats[scriptId] || {};
    stats[outcome] = (stats[outcome] || 0) + 1;
  }

  async _record (session) {
    const results = this.content.results[session.script] = this.content.results[session.script] || {};
    const key = session.subject || session.user;
    results[key] = {
      script: session.script,
      version: session.version,
      subject: session.subject,
      context: session.context,
      answers: session.answers,
      labels: session.labels,
      completedBy: session.user,
      completedByName: session.name,
      completedAt: new Date(this.now).toISOString()
    };
    await this._persist();
    return results[key];
  }

  async _restore () {
    if (!this.store) return;
    let prior = null;
    try { prior = await this.store.get(STORE_KEY); } catch (_) { prior = null; }
    if (typeof prior === 'string') {
      try { prior = JSON.parse(prior); } catch (_) { prior = null; }
    }
    if (!prior || typeof prior !== 'object') return;
    this.content.scripts = prior.scripts || {};
    this.content.sessions = prior.sessions || {};
    this.content.results = prior.results || {};
    this.content.stats = prior.stats || {};
  }

  async _persist () {
    if (!this.store || !this.store.db) return;
    try {
      await this.store.set(STORE_KEY, this.content);
    } catch (error) {
      this.emit('error', `[SCRIPTS] persist: ${errorMessage(error)}`);
    }
  }

  // ### HTTP

  /**
   * JSON API for script definitions:
   * `GET <base>` (list), `GET|PUT <base>/<id>`, `GET <base>/<id>/stats`, and
   * `GET <base>/<id>/results`. Reads carry no user ids. Writes and results
   * need `authorize(req)` to pass, or a bearer token equal to `token`; with
   * neither configured those routes answer 404.
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
        if (parts.length === 0) {
          if (method !== 'GET') throw httpError(405, 'Method not allowed');
          return { scripts: this.list() };
        }
        const id = parts[0];
        if (parts.length === 1) {
          if (method === 'PUT') {
            await gate(req);
            const body = await readBody(req);
            if (body.id != null && body.id !== id) throw httpError(400, 'id in the body does not match the path');
            return this.defineScript(Object.assign({}, body, { id }));
          }
          if (method !== 'GET') throw httpError(405, 'Method not allowed');
          const script = this.script(id);
          if (!script) throw httpError(404, 'No such script');
          return script;
        }
        if (parts.length === 2 && ['stats', 'results'].includes(parts[1])) {
          if (method !== 'GET') throw httpError(405, 'Method not allowed');
          if (!this.content.scripts[id]) throw httpError(404, 'No such script');
          if (parts[1] === 'stats') return this.stats(id);
          await gate(req);
          return { script: id, results: this.results(id) };
        }
        throw httpError(404, 'Not found');
      };

      job().then((body) => sendJson(res, 200, body)).catch((error) => {
        if (res.headersSent) return;
        const status = error && error.status ? error.status : 500;
        sendJson(res, status, { error: status >= 500 ? 'Scripts unavailable' : errorMessage(error) });
        if (status >= 500) this.emit('error', `[SCRIPTS] http: ${errorMessage(error)}`);
      });
    };
  }
}

module.exports = Scripts;
module.exports.Script = Script;
module.exports.BASE = BASE;
