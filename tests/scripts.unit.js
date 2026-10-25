'use strict';

const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events').EventEmitter;

const Doorman = require('../services/doorman');
const Scripts = require('../services/scripts');
const Script = require('../types/script');

const SETUP = {
  id: 'setup',
  title: 'Server setup',
  start: 'welcome',
  steps: {
    welcome: { say: 'Hi {{user.name}}, let\'s set up {{context.guildName}}.', input: { type: 'confirm' }, next: 'features' },
    features: {
      say: 'What do you want?',
      input: { type: 'choice', multiple: true, options: [{ id: 'clips', label: 'Clips' }, { id: 'calendar', label: 'Calendar' }] },
      next: [{ when: { 'answers.features': 'clips' }, goto: 'clips' }, { goto: 'contact' }]
    },
    clips: { say: 'Which channel?', input: { type: 'choice', optionsFrom: 'channels', optional: true }, saveAs: 'clipsChannel', next: 'contact' },
    contact: { say: 'Who should we talk to?', input: { type: 'text', maxLength: 20, pattern: '^[A-Za-z ]+$' }, next: 'summary' },
    summary: { say: 'Clips: {{labels.clipsChannel|none}}. Contact: {{answers.contact}}.' }
  },
  complete: { say: 'Saved for {{context.guildName}}.' },
  onComplete: [{ action: 'record' }]
};

/** Adapter with private messages; records what it whispered. */
class FakeAdapter extends EventEmitter {
  constructor ({ structured = true } = {}) {
    super();
    this.sent = [];
    this.whispers = [];
    this.rendersScripts = structured;
    this.refuse = null;
  }

  connect () { this.emit('ready'); }
  send (channel, message) { this.sent.push({ channel, message }); }

  async whisper (user, object) {
    if (this.refuse) throw this.refuse;
    this.whispers.push({ user, object });
    return { id: String(this.whispers.length) };
  }

  last () { return this.whispers[this.whispers.length - 1].object; }
}

/** Wait for an event-driven change (answers persist to LevelDB before replying). */
async function until (check, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('Script', function () {
  it('validates and normalizes definitions', function () {
    const script = Script.validate(SETUP);
    assert.strictEqual(script.start, 'welcome');
    assert.strictEqual(script.steps.features.saveAs, 'features');
    assert.strictEqual(script.steps.summary.saveAs, null);
    assert.strictEqual(script.steps.summary.next, null);
    assert.deepStrictEqual(script.onComplete, [{ action: 'record' }]);

    assert.throws(() => Script.validate({ id: 'Bad Id', title: 'x', steps: { a: { say: 'a' } } }), /id must be/);
    assert.throws(() => Script.validate({ id: 'x', title: 'x', steps: { a: { say: 'a', next: 'nowhere' } } }), /missing step "nowhere"/);
    assert.throws(() => Script.validate({ id: 'x', title: 'x', steps: { a: { say: 'a', input: { type: 'choice' } } } }), /needs options/);
    assert.throws(() => Script.validate({ id: 'x', title: 'x', steps: { a: { say: 'a', input: { type: 'text', pattern: '(' } } } }), /regular expression/);
    for (const pattern of ['(a+)+$', '(a|aa)*', '^(\\w+)\\1$']) {
      assert.throws(() => Script.validate({ id: 'x', title: 'x', steps: { a: { say: 'a', input: { type: 'text', pattern } } } }), /simplify it/, pattern);
    }
    assert.ok(Script.validate({ id: 'x', title: 'x', steps: { a: { say: 'a', input: { type: 'text', pattern: '^(foo|bar)-[0-9]{2,4}$' } } } }));
    try {
      Script.validate(null);
    } catch (error) {
      assert.strictEqual(error.status, 400);
    }
  });

  it('versions definitions by content regardless of key order', function () {
    const a = Script.validate(SETUP);
    const b = Script.validate(JSON.parse(JSON.stringify(Object.assign({ steps: SETUP.steps }, SETUP))));
    assert.strictEqual(Script.version(a), Script.version(b));
    assert.notStrictEqual(Script.version(a), Script.version(Script.validate(Object.assign({}, SETUP, { title: 'Other' }))));
  });

  it('renders templates, matches branches, and parses replies', function () {
    const scope = { user: { name: 'Kersa' }, answers: { features: ['clips', 'calendar'], contact: '' }, labels: { features: ['Clips', 'Calendar'] } };
    assert.strictEqual(Script.render('Hi {{user.name}}: {{labels.features}} / {{answers.contact|nobody}}', scope), 'Hi Kersa: Clips, Calendar / nobody');
    assert.ok(Script.match({ 'answers.features': 'clips' }, scope));
    assert.ok(Script.match({ 'answers.features': ['x', 'calendar'] }, scope));
    assert.ok(Script.match({ 'answers.contact': null }, scope));
    assert.ok(!Script.match({ 'answers.features': 'voice' }, scope));

    const script = Script.validate(SETUP);
    const options = script.steps.features.input.options;
    assert.deepStrictEqual(Script.parse(script.steps.features, '1, calendar', options), { ok: true, value: ['clips', 'calendar'], label: 'Clips, Calendar' });
    assert.deepStrictEqual(Script.parse(script.steps.features, '2 1', options).value, ['calendar', 'clips']);
    assert.strictEqual(Script.parse(script.steps.features, 'voice', options).ok, false);
    assert.strictEqual(Script.parse(script.steps.welcome, 'yes').value, true);
    assert.strictEqual(Script.parse(script.steps.welcome, 'nah').ok, false);
    assert.strictEqual(Script.parse(script.steps.contact, 'Rat Grot').value, 'Rat Grot');
    assert.match(Script.parse(script.steps.contact, 'x'.repeat(21)).error, /under 20/);
    assert.strictEqual(Script.parse(script.steps.contact, 'r4t').ok, false);
    assert.strictEqual(Script.parse(script.steps.clips, 'skip', []).skipped, true);
    assert.strictEqual(Script.parse(script.steps.contact, null).ok, false, 'required steps cannot be skipped');
  });

  it('renders a numbered text step for adapters without components', function () {
    const text = Script.toText({
      text: 'Pick one',
      input: { type: 'choice', optional: true, options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo', description: 'second' }] }
    });
    assert.strictEqual(text, 'Pick one\n1. Alpha\n2. Bravo — second\nReply with a number.\n"skip" leaves this blank; "cancel" stops.');
  });
});

describe('Scripts', function () {
  let dir;
  let clock;
  let doorman;
  let adapter;
  let scripts;

  async function boot (settings = {}, adapterSettings = {}) {
    doorman = new Doorman({ http: false, local: false });
    adapter = new FakeAdapter(adapterSettings);
    doorman.use(Scripts, Object.assign({ path: path.join(dir, 'store'), sweepMs: 0, seed: [SETUP], now: () => clock }, settings));
    await doorman.start();
    doorman.enable('fake', adapter);
    scripts = doorman.plugins.scripts;
    scripts.source('channels', (scope) => [
      { id: '100', label: '#clips', description: `in ${scope.context.guildName}` },
      { id: '200', label: '#general' }
    ]);
    return scripts;
  }

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-scripts-'));
    clock = Date.parse('2026-10-24T12:00:00.000Z');
  });

  afterEach(async function () {
    if (doorman) await doorman.stop();
    doorman = null;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('walks a person through a script with answers from controls and typed replies', async function () {
    await boot();
    const session = await scripts.begin('setup', { user: 'fake/users/alice', name: 'Alice', context: { guildName: 'G00N' }, subject: 'g1' });
    assert.strictEqual(session.step, 'welcome');
    assert.strictEqual(adapter.whispers[0].user, 'alice');
    const welcome = adapter.last();
    assert.strictEqual(welcome.type, 'ScriptStep');
    assert.strictEqual(welcome.text, 'Hi Alice, let\'s set up G00N.');
    assert.strictEqual(welcome.input.type, 'confirm');

    const responses = [];
    adapter.emit('answer', { session: session.id, step: 'welcome', user: 'alice', value: 'yes', respond: (result) => responses.push(result) });
    await until(() => adapter.whispers.length === 2);
    assert.strictEqual(responses[0].ok, true);
    assert.strictEqual(adapter.last().step, 'features');

    // A typed private reply answers the open step and skips !trigger routing.
    let routed = false;
    doorman.on('response', () => { routed = true; });
    adapter.emit('message', { id: 'm1', actor: 'alice', target: 'dm1', object: 'clips', private: true });
    await until(() => adapter.whispers.length === 3);
    assert.strictEqual(routed, false);
    const clips = adapter.last();
    assert.strictEqual(clips.step, 'clips');
    assert.deepStrictEqual(clips.input.options.map((option) => option.label), ['#clips', '#general']);
    assert.strictEqual(clips.input.options[0].description, 'in G00N');

    // An invalid typed answer gets the reason, and the step stays open.
    adapter.emit('message', { id: 'm2', actor: 'alice', target: 'dm1', object: '#nope', private: true });
    await until(() => adapter.whispers.length === 4);
    assert.match(adapter.last(), /not one of the options/);

    // A stale press on an earlier step is refused.
    const stale = await scripts.answer(session.id, 'welcome', 'yes', { user: 'fake/users/alice' });
    assert.deepStrictEqual([stale.ok, stale.error], [false, 'This step has passed.']);
    // Someone else cannot answer.
    const other = await scripts.answer(session.id, 'clips', '1', { user: 'fake/users/mallory' });
    assert.strictEqual(other.ok, false);

    assert.strictEqual((await scripts.answer(session.id, 'clips', ['100'], { user: 'fake/users/alice' })).label, '#clips');
    assert.strictEqual(adapter.last().step, 'contact');
    assert.strictEqual((await scripts.answer(session.id, 'contact', 'Rat Grot', { user: 'fake/users/alice' })).ok, true);

    // The info step goes out, then the script completes and records.
    const texts = adapter.whispers.slice(-2).map((entry) => entry.object);
    assert.strictEqual(texts[0].text, 'Clips: #clips. Contact: Rat Grot.');
    assert.strictEqual(texts[1], 'Saved for G00N.');
    const [result] = scripts.results('setup');
    assert.strictEqual(result.subject, 'g1');
    assert.deepStrictEqual(result.answers, { welcome: true, features: ['clips'], clipsChannel: '100', contact: 'Rat Grot' });
    assert.strictEqual(result.completedBy, 'fake/users/alice');
    const stats = scripts.stats('setup');
    assert.strictEqual(stats.started, 1);
    assert.strictEqual(stats.completed, 1);
    assert.strictEqual(stats.active, 0);
    assert.strictEqual(JSON.stringify(scripts.report()).includes('alice'), false, 'report carries no user ids');

    // Ended sessions refuse further answers.
    assert.strictEqual((await scripts.answer(session.id, null, 'x')).ok, false);
  });

  it('branches past optional steps, honors skip, and keeps state across restarts', async function () {
    await boot();
    const session = await scripts.begin('setup', { user: 'fake/users/bob', context: { guildName: 'TRDE' } });
    await scripts.answer(session.id, 'welcome', 'yes');
    await scripts.answer(session.id, 'features', ['calendar']);
    assert.strictEqual(adapter.last().step, 'contact', 'clips step skipped by the branch');
    await doorman.stop();

    await boot({ seed: null });
    assert.strictEqual(scripts.claims({ private: true, actor: 'fake/users/bob' }), true);
    assert.strictEqual(scripts.claims({ private: false, actor: 'fake/users/bob' }), false);
    await scripts.answer(session.id, 'contact', 'Bob');
    assert.strictEqual(scripts.results('setup')[0].subject, null);
    assert.strictEqual(scripts.results('setup')[0].labels.clipsChannel, undefined);

    const again = await scripts.begin('setup', { user: 'fake/users/bob', context: { guildName: 'TRDE' } });
    await scripts.answer(again.id, 'welcome', 'yes');
    await scripts.answer(again.id, 'features', 'clips');
    const skipped = await scripts.answer(again.id, 'clips', null, { action: 'skip' });
    assert.strictEqual(skipped.label, 'Skipped');
    await scripts.answer(again.id, 'contact', 'Bob');
    assert.strictEqual(adapter.whispers.slice(-2)[0].object.text, 'Clips: none. Contact: Bob.');
  });

  it('cancels, restarts, replaces, and expires sessions', async function () {
    await boot();
    const first = await scripts.begin('setup', { user: 'fake/users/carol' });
    const second = await scripts.begin('setup', { user: 'fake/users/carol' });
    assert.strictEqual(scripts.content.sessions[first.id].status, 'cancelled', 'one open session per person and script');

    adapter.emit('message', { actor: 'carol', target: 'dm', object: 'cancel', private: true });
    await until(() => typeof adapter.last() === 'string');
    assert.strictEqual(scripts.content.sessions[second.id].status, 'cancelled');
    assert.match(adapter.last(), /^Cancelled/);

    const third = await scripts.begin('setup', { user: 'fake/users/carol' });
    const restarted = await scripts.restart(third.id);
    assert.notStrictEqual(restarted.id, third.id);
    assert.strictEqual(restarted.step, 'welcome');

    clock += 25 * 60 * 60 * 1000;
    const late = await scripts.answer(restarted.id, 'welcome', 'yes');
    assert.match(late.error, /expired/);
    const cancelPress = await scripts.answer(restarted.id, 'welcome', null, { action: 'cancel' });
    assert.strictEqual(cancelPress.ok, false);

    const fourth = await scripts.begin('setup', { user: 'fake/users/carol' });
    clock += 25 * 60 * 60 * 1000;
    assert.strictEqual(await scripts.sweep(), 1);
    assert.strictEqual(scripts.content.sessions[fourth.id].status, 'expired');
    assert.strictEqual(scripts.stats('setup').expired, 2);
  });

  it('keeps a session on the version it started with when the script changes', async function () {
    await boot();
    const session = await scripts.begin('setup', { user: 'fake/users/dave' });
    const edited = JSON.parse(JSON.stringify(SETUP));
    edited.steps.welcome.say = 'Welcome back.';
    edited.steps.welcome.next = null;
    const change = await scripts.defineScript(edited);
    assert.strictEqual(change.changed, true);
    assert.strictEqual(scripts.script('setup').versions.length, 2);

    await scripts.answer(session.id, 'welcome', 'yes');
    assert.strictEqual(adapter.last().step, 'features', 'old session follows its own version');
    const fresh = await scripts.begin('setup', { user: 'fake/users/erin' });
    assert.strictEqual(adapter.last().text, 'Welcome back.');
    await scripts.answer(fresh.id, 'welcome', 'yes');
    assert.strictEqual(scripts.content.sessions[fresh.id].status, 'completed');

    // A later seed does not overwrite a runtime edit.
    const reseeded = await scripts.seed([Object.assign({}, SETUP, { title: 'Seeded again' })]);
    assert.strictEqual(reseeded[0].changed, false);
    assert.strictEqual(scripts.definition('setup').steps.welcome.say, 'Welcome back.');
  });

  it('checks requirements at start and completion, and runs host actions', async function () {
    const guarded = Object.assign({}, SETUP, {
      id: 'guarded',
      requires: ['ManageGuild'],
      start: 'contact',
      onComplete: [{ action: 'record' }, { action: 'notify', channel: 'ops' }]
    });
    await boot({ seed: [SETUP, guarded] });
    await assert.rejects(scripts.begin('guarded', { user: 'fake/users/frank' }), (error) => error.status === 403);

    let allowed = true;
    const calls = [];
    scripts.authorize((requirement, session, phase) => {
      calls.push([requirement, phase]);
      return allowed;
    });
    const notified = [];
    scripts.action('notify', (session, entry) => { notified.push([session.answers.contact, entry.channel]); });

    const session = await scripts.begin('guarded', { user: 'fake/users/frank' });
    await scripts.answer(session.id, 'contact', 'Frank');
    assert.deepStrictEqual(calls, [['ManageGuild', 'start'], ['ManageGuild', 'complete']]);
    assert.deepStrictEqual(notified, [['Frank', 'ops']]);
    assert.strictEqual(scripts.content.sessions[session.id].status, 'completed');

    const revoked = await scripts.begin('guarded', { user: 'fake/users/frank' });
    allowed = false;
    await scripts.answer(revoked.id, 'contact', 'Frank');
    assert.strictEqual(scripts.content.sessions[revoked.id].status, 'failed');
    assert.match(adapter.last(), /ManageGuild/);

    allowed = true;
    scripts.action('notify', () => { throw new Error('boom'); });
    const errors = [];
    scripts.on('error', (error) => errors.push(error));
    const broken = await scripts.begin('guarded', { user: 'fake/users/frank' });
    await scripts.answer(broken.id, 'contact', 'Frank');
    assert.strictEqual(scripts.content.sessions[broken.id].status, 'failed');
    assert.match(adapter.last(), /Something went wrong/);
    assert.ok(errors.some((error) => String(error).includes('boom')));
  });

  it('merges action results into what is recorded and said, and passes exposed errors on', async function () {
    const acting = Object.assign({}, SETUP, {
      id: 'acting',
      start: 'contact',
      complete: { say: '{{labels.made}} Thanks, {{answers.contact}}.' },
      onComplete: [{ action: 'make' }, { action: 'record' }]
    });
    await boot({ seed: [acting] });
    let fail = null;
    scripts.action('make', (session) => {
      if (fail) throw fail;
      return { answers: { madeId: `id-${session.answers.contact}` }, labels: { made: 'Made it.' } };
    });

    const session = await scripts.begin('acting', { user: 'fake/users/hana', subject: 'guild-1' });
    await scripts.answer(session.id, 'contact', 'Hana');
    assert.strictEqual(adapter.last(), 'Made it. Thanks, Hana.');
    const result = scripts.results('acting').find((entry) => entry.subject === 'guild-1');
    assert.strictEqual(result.answers.madeId, 'id-Hana');

    fail = Object.assign(new Error('I need Manage Channels on this server.'), { expose: true });
    const errors = [];
    const warnings = [];
    scripts.on('error', (error) => errors.push(error));
    scripts.on('warning', (warning) => warnings.push(warning));
    const refused = await scripts.begin('acting', { user: 'fake/users/hana', subject: 'guild-2' });
    await scripts.answer(refused.id, 'contact', 'Hana');
    assert.strictEqual(scripts.content.sessions[refused.id].status, 'failed');
    assert.strictEqual(adapter.last(), 'I need Manage Channels on this server.');
    assert.deepStrictEqual(errors, []);
    assert.strictEqual(warnings.length, 1);
    assert.ok(!scripts.results('acting').some((entry) => entry.subject === 'guild-2'), 'a failed action records nothing');
  });

  it('reports undeliverable first steps to the caller', async function () {
    await boot();
    adapter.refuse = Object.assign(new Error('Cannot send messages to this user'), { code: 50007 });
    await assert.rejects(scripts.begin('setup', { user: 'fake/users/gina' }), (error) => error.code === 50007);
    assert.strictEqual(scripts.stats('setup').undelivered, 1);
    assert.strictEqual(scripts.claims({ private: true, actor: 'fake/users/gina' }), false);
  });

  it('sends plain numbered text to adapters that do not render steps', async function () {
    await boot({}, { structured: false });
    const session = await scripts.begin('setup', { user: 'fake/users/hank' });
    assert.strictEqual(typeof adapter.last(), 'string');
    assert.match(adapter.last(), /Reply "yes" to continue/);
    adapter.emit('message', { actor: 'hank', target: 'dm', object: 'yes', private: true });
    await until(() => adapter.whispers.length === 2);
    assert.match(adapter.last(), /1\. Clips\n2\. Calendar/);
    assert.strictEqual(scripts.content.sessions[session.id].step, 'features');
  });

  describe('HTTP', function () {
    function run (handler, method, url, { body, headers = {} } = {}) {
      return new Promise((resolve) => {
        const req = new EventEmitter();
        Object.assign(req, { method, url, originalUrl: url, path: url.split('?')[0], headers });
        const res = {
          headers: {},
          headersSent: false,
          setHeader (k, v) { this.headers[k] = v; },
          end (text) { this.headersSent = true; resolve({ status: this.statusCode, body: text ? JSON.parse(text) : null }); }
        };
        handler(req, res, () => resolve({ next: true }));
        setImmediate(() => {
          if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
          req.emit('end');
        });
      });
    }

    it('lists and serves scripts, gates writes and results, and mounts under the Doorman console', async function () {
      await boot({ token: 's3cret' });
      const session = await scripts.begin('setup', { user: 'fake/users/ivy', subject: 'g9' });
      await scripts.answer(session.id, 'welcome', 'yes');

      const handler = scripts.middleware();
      assert.deepStrictEqual(await run(handler, 'GET', '/services/other'), { next: true });
      const list = await run(handler, 'GET', '/services/doorman/scripts');
      assert.strictEqual(list.status, 200);
      assert.strictEqual(list.body.scripts[0].id, 'setup');
      assert.strictEqual(list.body.scripts[0].stats.active, 1);
      const one = await run(handler, 'GET', '/services/doorman/scripts/setup');
      assert.strictEqual(one.body.definition.start, 'welcome');
      assert.strictEqual((await run(handler, 'GET', '/services/doorman/scripts/setup/stats')).body.started, 1);
      assert.strictEqual((await run(handler, 'GET', '/services/doorman/scripts/nope')).status, 404);
      assert.ok(!JSON.stringify([list, one]).includes('ivy'), 'reads carry no user ids');

      assert.strictEqual((await run(handler, 'PUT', '/services/doorman/scripts/setup', { body: SETUP })).status, 401);
      assert.strictEqual((await run(handler, 'GET', '/services/doorman/scripts/setup/results')).status, 401);
      const auth = { authorization: 'Bearer s3cret' };
      const edited = Object.assign({}, SETUP, { title: 'Edited' });
      delete edited.id;
      const put = await run(handler, 'PUT', '/services/doorman/scripts/setup', { body: edited, headers: auth });
      assert.strictEqual(put.status, 200);
      assert.strictEqual(put.body.changed, true);
      assert.strictEqual(scripts.definition('setup').title, 'Edited');
      assert.strictEqual((await run(handler, 'PUT', '/services/doorman/scripts/setup', { body: { title: 'x', steps: {} }, headers: auth })).status, 400);
      assert.strictEqual((await run(handler, 'PUT', '/services/doorman/scripts/setup', { body: 'not json', headers: auth })).status, 400);
      assert.strictEqual((await run(handler, 'PUT', '/services/doorman/scripts/other', { body: SETUP, headers: auth })).status, 400);
      const created = await run(handler, 'PUT', '/services/doorman/scripts/new-one', { body: Object.assign({}, SETUP, { id: 'new-one' }), headers: auth });
      assert.strictEqual(created.body.id, 'new-one');
      assert.strictEqual((await run(handler, 'DELETE', '/services/doorman/scripts/setup', { headers: auth })).status, 405);
      assert.deepStrictEqual((await run(handler, 'GET', '/services/doorman/scripts/setup/results', { headers: auth })).body, { script: 'setup', results: [] });

      // Doorman's console middleware hands its `/services/doorman/scripts` paths to the plugin.
      const console = doorman.middleware();
      assert.strictEqual((await run(console, 'GET', '/services/doorman/scripts')).body.scripts.length, 2);
      assert.strictEqual((await run(console, 'GET', '/services/doorman')).status, 200);
      const report = await run(console, 'GET', '/services/doorman/plugins/scripts');
      assert.strictEqual(report.body.report.scripts, 2);
    });

    it('hides writes and results without a token, and accepts a host authorize hook', async function () {
      await boot();
      assert.strictEqual((await run(scripts.middleware(), 'PUT', '/services/doorman/scripts/setup', { body: SETUP })).status, 404);
      assert.strictEqual((await run(scripts.middleware(), 'GET', '/services/doorman/scripts/setup/results')).status, 404);
      const hooked = scripts.middleware({ authorize: (req) => req.headers['x-ok'] === '1', basePath: '/api/scripts' });
      assert.strictEqual((await run(hooked, 'GET', '/api/scripts/setup/results')).status, 401);
      assert.strictEqual((await run(hooked, 'GET', '/api/scripts/setup/results', { headers: { 'x-ok': '1' } })).status, 200);
    });
  });
});
