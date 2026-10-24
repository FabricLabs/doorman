'use strict';

const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const Discord = require('../services/discord');

class FakeFabricDiscord extends EventEmitter {
  constructor () {
    super();
    this.botReady = false;
    this.voice = { active: {} };
    this.posted = [];
  }

  postToChannel (channel, message) {
    this.posted.push({ channel, message });
  }
}

describe('Discord', function () {
  it('should expose a constructor', function () {
    assert(Discord instanceof Function);
  });

  it('attaches to an existing @fabric/discord client and maps events', async function () {
    const client = new FakeFabricDiscord();
    const adapter = new Discord({ client });
    const events = { join: [], part: [], presence: [], message: [], user: [], ready: [] };
    for (const name of Object.keys(events)) adapter.on(name, (e) => events[name].push(e));

    await adapter.connect();
    assert.strictEqual(adapter.owned, false);
    assert.strictEqual(adapter.canSend, false);

    client.voice.active = { c1: { guildId: 'g', name: 'PERMAFLEET', members: { u1: {} } } };
    client.emit('ready');
    assert.deepStrictEqual(events.presence[0], { user: 'u1', status: 'online', channel: 'c1' });
    assert.strictEqual(events.ready.length, 1);

    client.emit('voice', { guildId: 'g', userId: 'u2', oldChannelId: null, newChannelId: 'c1', kind: 'join' });
    assert.deepStrictEqual(events.join[0], { user: 'u2', channel: 'c1' });
    assert.deepStrictEqual(events.presence[1], { user: 'u2', status: 'online', channel: 'c1' });

    client.emit('voice', { guildId: 'g', userId: 'u2', oldChannelId: 'c1', newChannelId: null, kind: 'leave' });
    assert.deepStrictEqual(events.part[0], { user: 'u2', channel: 'c1' });
    assert.deepStrictEqual(events.presence[2], { user: 'u2', status: 'offline', channel: 'c1' });

    client.emit('activity', {
      type: 'DiscordMessage',
      actor: { id: 'x', username: 'alice', ref: 'u1' },
      object: { id: 'm1', content: 'hello' },
      target: { id: 'y', ref: 'c1' }
    });
    assert.deepStrictEqual(events.user[0], { id: 'u1', name: 'alice', online: true });
    assert.deepStrictEqual(events.message[0], { id: 'm1', actor: 'u1', target: 'c1', object: 'hello' });

    await adapter.send('c1', 'nope');
    assert.deepStrictEqual(client.posted, []);

    await adapter.disconnect();
    client.emit('voice', { guildId: 'g', userId: 'u3', oldChannelId: null, newChannelId: 'c1' });
    assert.strictEqual(events.join.length, 1);
  });

  it('flags direct messages as private', async function () {
    const client = new FakeFabricDiscord();
    const adapter = new Discord({ client });
    const messages = [];
    adapter.on('message', (message) => messages.push(message));
    await adapter.connect();
    client.emit('activity', {
      type: 'DiscordMessage',
      actor: { username: 'alice', ref: 'u1' },
      object: { id: 'm1', content: 'yes' },
      target: { ref: 'dm1', type: 'dm' }
    });
    client.emit('activity', {
      type: 'DiscordMessage',
      actor: { username: 'alice', ref: 'u1' },
      object: { id: 'm2', content: 'hi' },
      target: { ref: 'c1', type: 'text' }
    });
    assert.strictEqual(messages[0].private, true);
    assert.strictEqual(messages[1].private, undefined);
  });

  describe('script steps', function () {
    const SESSION = 'abcdef012345';
    const step = (input, extra = {}) => Object.assign({ type: 'ScriptStep', session: SESSION, step: 'pick', title: 'Setup', text: 'Choose.', input }, extra);
    const rows = (payload) => payload.components.map((row) => row.components);

    /** discord.js client the adapter listens on for interactions; DMs go through `users.fetch().send()`. */
    function rawClient () {
      const raw = new EventEmitter();
      raw.dms = [];
      raw.users = { fetch: async (id) => ({ send: async (payload) => { raw.dms.push({ id, payload }); return { id: 'sent' }; } }) };
      return raw;
    }

    function press (customId, extra = {}) {
      const calls = [];
      return Object.assign({
        customId,
        user: { id: 'u1' },
        message: { content: 'Choose.' },
        calls,
        deferUpdate: async () => calls.push(['deferUpdate']),
        update: async (payload) => calls.push(['update', payload]),
        editReply: async (payload) => calls.push(['editReply', payload]),
        followUp: async (payload) => calls.push(['followUp', payload]),
        showModal: async (payload) => calls.push(['showModal', payload])
      }, extra);
    }

    it('renders buttons, menus, confirmations, forms, skip, and cancel', function () {
      const few = Discord.renderStep(step({ type: 'choice', optional: true, options: [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Bravo' }] }));
      assert.deepStrictEqual(rows(few)[0].map((button) => [button.label, button.custom_id]), [
        ['Alpha', `doorman:${SESSION}:pick:v:a`],
        ['Bravo', `doorman:${SESSION}:pick:v:b`]
      ]);
      assert.deepStrictEqual(rows(few)[1].map((button) => button.label), ['Skip', 'Cancel']);
      assert.ok(few.content.includes('You can also reply here'));

      const options = Array.from({ length: 30 }, (_, i) => ({ id: String(100 + i), label: `#channel-${i}`, description: 'text' }));
      const many = Discord.renderStep(step({ type: 'choice', options }));
      const select = rows(many)[0][0];
      assert.strictEqual(select.type, 3);
      assert.strictEqual(select.custom_id, `doorman:${SESSION}:pick:select`);
      assert.strictEqual(select.options.length, 25);
      assert.strictEqual(select.max_values, 1);
      assert.deepStrictEqual(rows(many)[1].map((button) => [button.label, button.disabled]), [['Previous', true], ['More', false]]);
      const second = Discord.renderStep(step({ type: 'choice', options }), { page: 1 });
      assert.strictEqual(rows(second)[0][0].options.length, 5);
      assert.ok(second.content.includes('Showing 26–30 of 30'));

      const multiple = Discord.renderStep(step({ type: 'choice', multiple: true, options: options.slice(0, 3) }));
      assert.strictEqual(rows(multiple)[0][0].max_values, 3);

      const confirm = Discord.renderStep(step({ type: 'confirm' }));
      assert.deepStrictEqual(rows(confirm)[0].map((button) => button.custom_id), [`doorman:${SESSION}:pick:v:yes`, `doorman:${SESSION}:pick:cancel`]);
      const text = Discord.renderStep(step({ type: 'text', label: 'Org symbol', maxLength: 10 }));
      assert.strictEqual(rows(text)[0][0].custom_id, `doorman:${SESSION}:pick:modal`);
      const info = Discord.renderStep(step({ type: 'none' }));
      assert.deepStrictEqual(info.components, []);
      assert.strictEqual(info.content, 'Choose.');

      const modal = Discord.renderModal(step({ type: 'text', label: 'Org symbol', maxLength: 10, placeholder: 'GOON', optional: true }));
      assert.strictEqual(modal.custom_id, `doorman:${SESSION}:pick:submit`);
      assert.deepStrictEqual(modal.components[0].components[0], { type: 4, custom_id: 'value', label: 'Org symbol', style: 1, required: false, max_length: 10, placeholder: 'GOON' });
      assert.strictEqual(Discord.parseCustomId('1v1:confirm:abc'), null);
      assert.deepStrictEqual(Discord.parseCustomId(`doorman:${SESSION}:pick:v:a`), { session: SESSION, step: 'pick', kind: 'v', value: 'a' });
    });

    it('whispers only when allowed, and passes refusals through', async function () {
      const client = new FakeFabricDiscord();
      client.client = rawClient();
      const silent = new Discord({ client, replies: false });
      await assert.rejects(silent.whisper('u1', 'hi'), /private messages are off/);

      const adapter = new Discord({ client, replies: false, whispers: true });
      assert.strictEqual(adapter.canSend, false);
      assert.strictEqual(adapter.canWhisper, true);
      await adapter.whisper('u1', 'plain <@123>');
      await adapter.whisper('u1', step({ type: 'confirm' }));
      assert.deepStrictEqual(client.client.dms[0], { id: 'u1', payload: { content: 'plain <@123>', components: [], allowedMentions: { parse: [] } } });
      assert.strictEqual(client.client.dms[1].payload.components.length, 1);

      client.sendDirect = async () => { throw Object.assign(new Error('Cannot send messages to this user'), { code: 50007 }); };
      await assert.rejects(adapter.whisper('u1', 'hi'), (error) => error.code === 50007);
    });

    it('routes presses on its controls as answers and rewrites the card', async function () {
      const client = new FakeFabricDiscord();
      client.client = rawClient();
      const adapter = new Discord({ client, whispers: true });
      const answers = [];
      adapter.on('answer', (answer) => answers.push(answer));
      await adapter.connect();
      assert.strictEqual(client.client.listenerCount('interactionCreate'), 1);
      const options = Array.from({ length: 30 }, (_, i) => ({ id: String(100 + i), label: `#c${i}` }));
      await adapter.whisper('u1', step({ type: 'choice', options }));

      const settle = () => new Promise((resolve) => setImmediate(resolve));
      const button = press(`doorman:${SESSION}:pick:v:a`);
      client.client.emit('interactionCreate', button);
      await settle();
      assert.deepStrictEqual(button.calls[0], ['deferUpdate']);
      assert.deepStrictEqual(answers[0].value, 'a');
      assert.strictEqual(answers[0].user, 'u1');
      await answers[0].respond({ ok: true, label: 'Alpha' });
      assert.deepStrictEqual(button.calls[1], ['editReply', { content: 'Choose.\n\n**→ Alpha**', components: [], allowedMentions: { parse: [] } }]);

      const select = press(`doorman:${SESSION}:pick:select`, { values: ['101'] });
      client.client.emit('interactionCreate', select);
      await settle();
      assert.deepStrictEqual(answers[1].value, ['101']);
      await answers[1].respond({ ok: false, error: 'This step has passed.' });
      assert.deepStrictEqual(select.calls[1], ['followUp', { content: 'This step has passed.', flags: 64, allowedMentions: { parse: [] } }]);

      const page = press(`doorman:${SESSION}:pick:page:1`);
      client.client.emit('interactionCreate', page);
      await settle();
      assert.strictEqual(page.calls[0][0], 'update');
      assert.strictEqual(page.calls[0][1].components[0].components[0].options.length, 5);
      assert.strictEqual(answers.length, 2, 'paging is not an answer');

      const modal = press(`doorman:${SESSION}:other:modal`);
      client.client.emit('interactionCreate', modal);
      await settle();
      assert.strictEqual(modal.calls[0][0], 'showModal');
      assert.strictEqual(modal.calls[0][1].custom_id, `doorman:${SESSION}:other:submit`);

      const submit = press(`doorman:${SESSION}:other:submit`, { fields: { getTextInputValue: (key) => (key === 'value' ? 'GOON' : null) } });
      client.client.emit('interactionCreate', submit);
      await settle();
      assert.strictEqual(answers[2].value, 'GOON');

      client.client.emit('interactionCreate', press(`doorman:${SESSION}:pick:skip`));
      client.client.emit('interactionCreate', press(`doorman:${SESSION}:pick:cancel`));
      client.client.emit('interactionCreate', press(`doorman:${SESSION}:forgotten:page:2`));
      await settle();
      assert.deepStrictEqual(answers.slice(3).map((answer) => answer.action), ['skip', 'cancel', 'resend']);

      const foreign = press('1v1:confirm:abcdef012345');
      client.client.emit('interactionCreate', foreign);
      await settle();
      assert.deepStrictEqual(foreign.calls, [], 'other custom ids are left for the host');
      assert.strictEqual(answers.length, 6);

      await adapter.disconnect();
      assert.strictEqual(client.client.listenerCount('interactionCreate'), 0);
    });

    it('does not listen for interactions when private messages are off', async function () {
      const client = new FakeFabricDiscord();
      client.client = rawClient();
      const adapter = new Discord({ client });
      await adapter.connect();
      assert.strictEqual(client.client.listenerCount('interactionCreate'), 0);
    });

    describe('campaign messages', function () {
      const CAMPAIGN = '0123456789ab';
      const message = (extra = {}) => Object.assign({ type: 'CampaignMessage', campaign: CAMPAIGN, text: 'Fleet night <@123>!', source: 'g1', sourceName: 'G00N SQUAD', via: 'goon.vc', start: false }, extra);

      it('renders the text, who sent it, and Start / Stop buttons', function () {
        const plain = Discord.renderCampaign(message());
        assert.strictEqual(plain.content, 'Fleet night <@123>!\n\n-# Sent by **G00N SQUAD** via goon.vc');
        assert.deepStrictEqual(rows(plain)[0].map((button) => [button.label, button.custom_id]), [
          ['Stop messages from G00N SQUAD', `doorman-c:${CAMPAIGN}:stop`],
          ['Stop all', `doorman-c:${CAMPAIGN}:stopall`]
        ]);
        const script = Discord.renderCampaign(message({ start: true }));
        assert.deepStrictEqual(rows(script)[0].map((button) => button.label), ['Start', 'Stop messages from G00N SQUAD', 'Stop all']);
        assert.deepStrictEqual(Discord.parseCampaignId(`doorman-c:${CAMPAIGN}:stopall`), { campaign: CAMPAIGN, action: 'stopall' });
        assert.strictEqual(Discord.parseCampaignId(`doorman-c:${CAMPAIGN}:delete`), null);
        assert.strictEqual(Discord.parseCustomId(`doorman-c:${CAMPAIGN}:stop`), null);
      });

      it('whispers the card and routes presses as campaign answers', async function () {
        const client = new FakeFabricDiscord();
        client.client = rawClient();
        const adapter = new Discord({ client, whispers: true });
        assert.strictEqual(adapter.rendersCampaigns, true);
        const answers = [];
        adapter.on('answer', (answer) => answers.push(answer));
        await adapter.connect();

        await adapter.whisper('u1', message());
        const dm = client.client.dms[0].payload;
        assert.deepStrictEqual(dm.allowedMentions, { parse: [] });
        assert.strictEqual(dm.components[0].components.length, 2);

        const stop = press(`doorman-c:${CAMPAIGN}:stop`, { message: { content: 'Fleet night!' } });
        client.client.emit('interactionCreate', stop);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepStrictEqual(stop.calls[0], ['deferUpdate']);
        assert.strictEqual(answers[0].campaign, CAMPAIGN);
        assert.strictEqual(answers[0].action, 'stop');
        assert.strictEqual(answers[0].user, 'u1');
        await answers[0].respond({ ok: true, label: 'You won\'t get messages from G00N SQUAD again.' });
        assert.deepStrictEqual(stop.calls[1], ['editReply', { content: 'Fleet night!\n\n**→ You won\'t get messages from G00N SQUAD again.**', components: [], allowedMentions: { parse: [] } }]);
        await adapter.disconnect();
      });
    });
  });

  it('stays idle without a token or client', async function () {
    const adapter = new Discord({});
    await adapter.connect();
    assert.strictEqual(adapter.client, null);
  });
});
