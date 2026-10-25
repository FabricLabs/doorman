'use strict';

const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events').EventEmitter;

const Doorman = require('../services/doorman');
const Scripts = require('../services/scripts');
const Campaigns = require('../services/campaigns');
const Campaign = require('../types/campaign');

const DAY = 24 * 60 * 60 * 1000;

const WELCOME = {
  id: 'welcome',
  title: 'Welcome',
  start: 'hello',
  steps: {
    hello: { say: 'Hi {{user.name}} from {{context.guildName}}!', input: { type: 'confirm' } }
  }
};

/** Adapter with private messages; records what it whispered and can refuse. */
class FakeAdapter extends EventEmitter {
  constructor ({ structured = true } = {}) {
    super();
    this.whispers = [];
    this.rendersScripts = structured;
    this.rendersCampaigns = structured;
    this.failures = [];
  }

  connect () { this.emit('ready'); }
  send () {}

  async whisper (user, object) {
    const failure = this.failures.shift();
    if (failure) throw failure;
    this.whispers.push({ user, object });
    return { id: String(this.whispers.length) };
  }

  to (user) { return this.whispers.filter((entry) => entry.user === user).map((entry) => entry.object); }
}

function discordError (code, status) {
  return Object.assign(new Error(`Discord ${code || status}`), { code, status });
}

async function until (check, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Three members across two servers; Carol is in both. */
const PEOPLE = [
  { target: 'fake/users/alice', name: 'Alice', source: 'g1', sourceName: 'G00N SQUAD', roles: ['pilot'] },
  { target: 'fake/users/bob', name: 'Bob', source: 'g1', sourceName: 'G00N SQUAD', roles: [] },
  { target: 'fake/users/carol', name: 'Carol', source: 'g1', sourceName: 'G00N SQUAD', roles: ['pilot'] },
  { target: 'fake/users/carol', name: 'Carol', source: 'g2', sourceName: 'TRDE', roles: ['pilot'] },
  { target: 'fake/users/dave', name: 'Dave', source: 'g2', sourceName: 'TRDE', roles: ['pilot'] }
];

describe('Campaign', function () {
  it('validates drafts and filters', function () {
    const draft = Campaign.draft({ content: { text: '  Fleet night on Saturday!\nBring a ship.  ' }, filter: { roles: ['pilot', 'pilot'], activeWithinDays: '30' } });
    assert.strictEqual(draft.title, 'Fleet night on Saturday!');
    assert.deepStrictEqual(draft.content, { type: 'message', text: 'Fleet night on Saturday!\nBring a ship.', script: null });
    assert.deepStrictEqual(draft.filter.roles, ['pilot']);
    assert.strictEqual(draft.filter.activeWithinDays, 30);
    assert.deepStrictEqual(draft.filter.guilds, []);

    assert.throws(() => Campaign.draft({ content: { text: '' } }), /content.text is required/);
    assert.throws(() => Campaign.draft({ content: { text: 'x'.repeat(1801) } }), /at most 1800/);
    assert.throws(() => Campaign.draft({ content: { type: 'script', text: 'x' } }), /must name a script/);
    assert.throws(() => Campaign.draft({ content: { text: 'x' }, filter: { activeWithinDays: 0 } }), /activeWithinDays/);
    assert.throws(() => Campaign.draft({ content: { text: 'x' }, filter: { excludeCampaigns: ['nope'] } }), /invalid entry/);
    assert.throws(() => Campaign.draft({ content: { text: 'x' }, filter: { roles: 'pilot' } }), /must be a list/);
  });

  it('renders plain text with the typed replies that work', function () {
    const text = Campaign.toText({ type: 'CampaignMessage', text: 'Hello', sourceName: 'G00N SQUAD', via: 'goon.vc', start: true });
    assert.strictEqual(text, 'Hello\n\n— Sent by G00N SQUAD via goon.vc\nReply START to begin.\nReply STOP to stop these messages.');
  });
});

describe('Campaigns', function () {
  let dir;
  let clock;
  let doorman;
  let adapter;
  let campaigns;
  let lastSeen;
  let lookups;

  async function boot (settings = {}, adapterSettings = {}) {
    doorman = new Doorman({ http: false, local: false });
    adapter = new FakeAdapter(adapterSettings);
    doorman.use(Scripts, { path: path.join(dir, 'scripts'), sweepMs: 0, seed: [WELCOME], now: () => clock });
    doorman.use(Campaigns, Object.assign({ path: path.join(dir, 'campaigns'), intervalMs: 0, retryMs: 1000, via: 'goon.vc', now: () => clock }, settings));
    await doorman.start();
    doorman.enable('fake', adapter);
    campaigns = doorman.plugins.campaigns;
    campaigns.audience('fake', (filter, campaign) => {
      lookups.push({ filter, campaign });
      return PEOPLE.filter((person) => {
        if (filter.guilds.length && !filter.guilds.includes(person.source)) return false;
        if (filter.excludeGuilds.includes(person.source)) return false;
        if (filter.roles.length && !filter.roles.some((role) => person.roles.includes(role))) return false;
        return true;
      });
    });
    campaigns.activity((target) => lastSeen[target] || null);
    return campaigns;
  }

  async function drain () {
    for (let i = 0; i < 20 && await campaigns.tick(); i++);
  }

  beforeEach(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doorman-campaigns-'));
    clock = Date.parse('2026-10-24T12:00:00.000Z');
    lastSeen = {};
    lookups = [];
  });

  afterEach(async function () {
    if (doorman) await doorman.stop();
    doorman = null;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('previews a filtered audience, merging people found in several servers', async function () {
    await boot();
    const draft = await campaigns.create({ content: { text: 'Fleet night!' }, filter: { roles: ['pilot'] } }, { by: 'Staff' });
    assert.match(draft.id, /^[0-9a-f]{12}$/);
    assert.strictEqual(draft.status, 'draft');
    assert.deepStrictEqual(draft.owner, { kind: 'staff' });
    assert.strictEqual(draft.log[0].type, 'create');

    const preview = await campaigns.preview(draft.id);
    assert.strictEqual(preview.found, 3);
    assert.strictEqual(preview.reach, 3);
    assert.strictEqual(preview.over, false);
    assert.deepStrictEqual(preview.sources.map((entry) => [entry.sourceName, entry.count]), [['G00N SQUAD', 2], ['TRDE', 1]]);
    assert.strictEqual(lookups[0].campaign.id, draft.id);

    lastSeen['fake/users/alice'] = clock - 2 * DAY;
    lastSeen['fake/users/carol'] = clock - 40 * DAY;
    await campaigns.update(draft.id, { filter: { activeWithinDays: 30 } });
    const active = await campaigns.preview(draft.id);
    assert.strictEqual(active.reach, 1);
    assert.strictEqual(active.inactive, 2);
  });

  it('sends one message per tick, renders Start / Stop, and records each outcome', async function () {
    await boot();
    const draft = await campaigns.create({ content: { text: 'Fleet night!' } });
    adapter.failures.push(discordError(50007, 403));
    const sending = await campaigns.schedule(draft.id, { by: 'Staff' });
    assert.strictEqual(sending.status, 'sending');
    assert.strictEqual(sending.stats.targeted, 4);
    assert.strictEqual(sending.stats.pending, 4);

    assert.strictEqual(await campaigns.tick(), true);
    assert.strictEqual(adapter.whispers.length, 0, 'the first member has DMs closed');
    await campaigns.tick();
    assert.strictEqual(adapter.whispers.length, 1);
    const message = adapter.whispers[0].object;
    assert.strictEqual(message.type, 'CampaignMessage');
    assert.strictEqual(message.campaign, draft.id);
    assert.strictEqual(message.text, 'Fleet night!');
    assert.strictEqual(message.sourceName, 'G00N SQUAD');
    assert.strictEqual(message.via, 'goon.vc');
    assert.strictEqual(message.start, false);

    await drain();
    const sent = campaigns.campaign(draft.id);
    assert.strictEqual(sent.status, 'sent');
    assert.strictEqual(sent.stats.sent, 3);
    assert.strictEqual(sent.stats.closed, 1);
    assert.strictEqual(adapter.whispers.filter((entry) => entry.user === 'carol').length, 1, 'Carol gets one message though she is in two servers');
    assert.ok(sent.log.some((entry) => entry.type === 'sent'));
    assert.ok(!JSON.stringify(sent).includes('fake/users/'), 'no recipients in the campaign view');
    assert.deepStrictEqual(campaigns.report(), { campaigns: { sent: 1 }, sent: 3, optOuts: 0 });
  });

  it('backs off after rate limits and gives up after three retries', async function () {
    await boot();
    const draft = await campaigns.create({ content: { text: 'Hi' }, filter: { guilds: ['g2'] } });
    adapter.failures.push(discordError(undefined, 429), discordError(undefined, 429));
    await campaigns.schedule(draft.id);
    await campaigns.tick();
    await campaigns.tick();
    assert.strictEqual(adapter.whispers.length, 0);
    assert.strictEqual(await campaigns.tick(), false, 'both are waiting out a backoff');
    clock += 1000;
    await drain();
    assert.strictEqual(adapter.whispers.length, 2);
    assert.strictEqual(campaigns.campaign(draft.id).stats.sent, 2);

    const again = await campaigns.create({ content: { text: 'Again' }, filter: { guilds: ['g2'], platforms: ['fake'] } });
    adapter.failures.push(discordError(undefined, 503), discordError(undefined, 503), discordError(undefined, 503), discordError(undefined, 503), discordError(10013, 404));
    await campaigns.schedule(again.id);
    for (let i = 0; i < 4; i++) {
      await campaigns.tick();
      clock += 10 * 1000;
    }
    await drain();
    const result = campaigns.campaign(again.id);
    assert.strictEqual(result.status, 'sent');
    assert.strictEqual(result.stats.failed, 2, 'four 503s, then a permanent error');
  });

  it('stops messages from a source or from everything, and starts a campaign script', async function () {
    await boot();
    const first = await campaigns.create({ content: { type: 'script', script: 'welcome', text: 'Say hello?' }, filter: { roles: ['pilot'] } });
    await campaigns.schedule(first.id);
    await drain();
    const toAlice = adapter.to('alice')[0];
    assert.strictEqual(toAlice.start, true);

    const responses = [];
    adapter.emit('answer', { campaign: first.id, action: 'start', user: 'alice', respond: (result) => responses.push(result) });
    await until(() => responses.length === 1);
    assert.strictEqual(responses[0].ok, true);
    const step = adapter.to('alice')[1];
    assert.strictEqual(step.type, 'ScriptStep');
    assert.strictEqual(step.text, 'Hi Alice from G00N SQUAD!');

    adapter.emit('answer', { campaign: first.id, action: 'stop', user: 'carol', respond: (result) => responses.push(result) });
    await until(() => responses.length === 2);
    assert.deepStrictEqual(responses[1], { ok: true, action: 'stop', label: 'You won\'t get messages from G00N SQUAD again.' });
    adapter.emit('answer', { campaign: first.id, action: 'stopall', user: 'dave', respond: (result) => responses.push(result) });
    await until(() => responses.length === 3);
    adapter.emit('answer', { campaign: first.id, action: 'stop', user: 'bob', respond: (result) => responses.push(result) });
    await until(() => responses.length === 4);
    assert.strictEqual(responses[3].ok, false, 'Bob never got this campaign');

    const stats = campaigns.campaign(first.id).stats;
    assert.strictEqual(stats.started, 1);
    assert.strictEqual(stats.stopped, 2);

    // Carol stopped G00N SQUAD but is still reachable through TRDE; Dave stopped everything.
    const second = await campaigns.create({ content: { text: 'Again' }, filter: { roles: ['pilot'], excludeCampaigns: [] } });
    const preview = await campaigns.preview(second.id);
    assert.strictEqual(preview.reach, 2);
    assert.strictEqual(preview.optedOut, 1);
    await campaigns.schedule(second.id);
    await drain();
    assert.strictEqual(adapter.to('carol')[1].sourceName, 'TRDE');
    assert.strictEqual(adapter.to('dave').length, 1);

    const third = await campaigns.create({ content: { text: 'Third' }, filter: { excludeCampaigns: [first.id] } });
    const excluded = await campaigns.preview(third.id);
    assert.strictEqual(excluded.excluded, 2, 'Alice and Carol already got the first one');
    assert.strictEqual(excluded.optedOut, 1);
    assert.strictEqual(excluded.reach, 1, 'only Bob is left');
  });

  it('claims a typed STOP after a campaign message and falls back to plain text', async function () {
    await boot({}, { structured: false });
    const draft = await campaigns.create({ content: { text: 'Hi' }, filter: { guilds: ['g2'] } });
    await campaigns.schedule(draft.id);
    await drain();
    assert.strictEqual(adapter.to('dave')[0], 'Hi\n\n— Sent by TRDE via goon.vc\nReply STOP to stop these messages.');

    let routed = false;
    doorman.on('response', () => { routed = true; });
    adapter.emit('message', { id: 'm1', actor: 'dave', target: 'dm', object: 'STOP', private: true });
    await until(() => adapter.to('dave').length === 2);
    assert.strictEqual(adapter.to('dave')[1], 'You won\'t get messages from TRDE again.');
    assert.strictEqual(routed, false);
    assert.deepStrictEqual(await campaigns.optOut('fake/users/dave'), { all: false, sources: ['g2'] });

    // Outside the window nothing is claimed.
    clock += 8 * DAY;
    assert.strictEqual(doorman.claimed({ private: true, actor: 'fake/users/carol', object: 'stop' }), false);
  });

  it('one scheduled campaign that fails to launch does not block the others', async function () {
    await boot();
    const broken = await campaigns.create({ content: { text: 'Broken' }, filter: { guilds: ['g1'] } });
    const fine = await campaigns.create({ content: { text: 'Fine' }, filter: { guilds: ['g1'] } });
    await campaigns.schedule(broken.id, { sendAt: new Date(clock + 1000).toISOString() });
    await campaigns.schedule(fine.id, { sendAt: new Date(clock + 1000).toISOString() });
    const audience = campaigns._audience.bind(campaigns);
    let calls = 0;
    campaigns._audience = (campaign) => {
      if (campaign.id !== broken.id) return audience(campaign);
      calls++;
      throw new Error('audience unavailable');
    };
    const errors = [];
    campaigns.on('error', (message) => errors.push(message));
    clock += 1000;
    await campaigns.tick();
    assert.strictEqual(campaigns.campaign(fine.id).status, 'sending');
    assert.strictEqual(campaigns.campaign(broken.id).status, 'scheduled');
    assert.ok(errors.some((message) => message.includes('audience unavailable')));
    await campaigns.tick();
    assert.strictEqual(calls, 1, 'waits retryMs before trying again');
    clock += campaigns.settings.retryMs;
    campaigns._audience = audience;
    await campaigns.tick();
    assert.strictEqual(campaigns.campaign(broken.id).status, 'sending');
  });

  it('waits for sendAt, pauses, resumes, cancels, and only edits drafts', async function () {
    await boot();
    const draft = await campaigns.create({ content: { text: 'Later' }, filter: { guilds: ['g1'] } });
    const scheduled = await campaigns.schedule(draft.id, { sendAt: new Date(clock + 60 * 60 * 1000).toISOString() });
    assert.strictEqual(scheduled.status, 'scheduled');
    await assert.rejects(campaigns.update(draft.id, { title: 'x' }), /Only drafts/);
    assert.strictEqual(await campaigns.tick(), false);

    clock += 60 * 60 * 1000;
    await campaigns.tick();
    assert.strictEqual(campaigns.campaign(draft.id).status, 'sending');
    assert.strictEqual(adapter.whispers.length, 1);
    await campaigns.pause(draft.id, { by: 'Staff' });
    assert.strictEqual(await campaigns.tick(), false);
    await campaigns.resume(draft.id);
    await campaigns.tick();
    assert.strictEqual(adapter.whispers.length, 2);
    const cancelled = await campaigns.cancel(draft.id);
    assert.strictEqual(cancelled.status, 'cancelled');
    assert.strictEqual(cancelled.stats.sent, 2);
    await drain();
    assert.strictEqual(adapter.whispers.length, 2);
    assert.deepStrictEqual(cancelled.log.map((entry) => entry.type), ['create', 'schedule', 'send', 'pause', 'resume', 'cancel']);
  });

  it('keeps server campaigns to their server, under the cap, and one a day', async function () {
    await boot({ maxAudience: 2 });
    const owner = { kind: 'guild', guildId: 'g2', guildName: 'TRDE' };
    const draft = await campaigns.create({ content: { text: 'TRDE news' }, filter: { guilds: ['g1'], excludeGuilds: ['g2'] } }, { owner, by: 'Admin' });
    assert.deepStrictEqual(draft.filter.guilds, ['g2']);
    assert.deepStrictEqual(draft.filter.excludeGuilds, []);
    await campaigns.schedule(draft.id);
    await drain();
    assert.deepStrictEqual(adapter.whispers.map((entry) => entry.user).sort(), ['carol', 'dave']);

    const next = await campaigns.create({ content: { text: 'More' } }, { owner });
    await assert.rejects(campaigns.schedule(next.id), (error) => error.status === 429 && error.retryAt === new Date(clock + DAY).toISOString());
    assert.strictEqual(campaigns.cooldown(owner), clock + DAY);
    clock += DAY;
    assert.strictEqual(campaigns.cooldown(owner), 0);

    const big = await campaigns.create({ content: { text: 'Everyone' } }, { owner: { kind: 'guild', guildId: 'g1' } });
    await assert.rejects(campaigns.schedule(big.id), /would reach 3 people; the limit is 2/);
  });

  it('resumes sending after a restart', async function () {
    await boot();
    const draft = await campaigns.create({ content: { text: 'Hi' } });
    await campaigns.schedule(draft.id);
    await campaigns.tick();
    await doorman.stop();

    await boot();
    assert.strictEqual(campaigns.campaign(draft.id).status, 'sending');
    await drain();
    assert.strictEqual(adapter.whispers.length, 3);
    assert.strictEqual(campaigns.campaign(draft.id).stats.sent, 4);
  });

  it('serves the API only with the token, without recipients', async function () {
    await boot({ token: 'sekret' });
    const handler = campaigns.middleware();
    const call = (method, url, body, token = 'sekret') => new Promise((resolve) => {
      const req = { method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, body };
      const res = {
        statusCode: 200,
        headers: {},
        setHeader (name, value) { this.headers[name] = value; },
        end (text) { resolve({ status: this.statusCode, body: JSON.parse(text) }); }
      };
      handler(req, res, () => resolve({ status: 'next' }));
    });

    assert.strictEqual((await call('GET', '/services/doorman/campaigns', null, null)).status, 401);
    assert.strictEqual((await call('GET', '/services/doorman/campaigns', null, 'wrong')).status, 401);
    assert.strictEqual((await call('GET', '/elsewhere')).status, 'next');

    const created = await call('POST', '/services/doorman/campaigns', { title: 'Fleet', content: { text: 'Fleet night' }, filter: { roles: ['pilot'] }, by: 'Staff' });
    assert.strictEqual(created.status, 200);
    const id = created.body.id;
    assert.strictEqual((await call('PATCH', `/services/doorman/campaigns/${id}`, { content: { text: 'Fleet night!' } })).body.content.text, 'Fleet night!');
    assert.strictEqual((await call('POST', `/services/doorman/campaigns/${id}/preview`, {})).body.reach, 3);
    assert.strictEqual((await call('POST', `/services/doorman/campaigns/${id}/schedule`, {})).body.status, 'sending');
    assert.strictEqual((await call('POST', `/services/doorman/campaigns/${id}/schedule`, {})).status, 409);
    await drain();
    const list = await call('GET', '/services/doorman/campaigns');
    assert.strictEqual(list.body.campaigns[0].stats.sent, 3);
    const one = await call('GET', `/services/doorman/campaigns/${id}`);
    assert.ok(!JSON.stringify(one.body).includes('users/'));
    assert.strictEqual((await call('GET', '/services/doorman/campaigns/000000000000')).status, 404);

    const closed = new Campaigns({ path: path.join(dir, 'closed'), persistent: false, intervalMs: 0 });
    const res = await new Promise((resolve) => closed.middleware()({ method: 'GET', url: '/services/doorman/campaigns', headers: {} }, {
      setHeader () {},
      end (text) { resolve({ status: this.statusCode, body: JSON.parse(text) }); }
    }, () => resolve(null)));
    assert.strictEqual(res.status, 404);
  });
});
