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

  it('stays idle without a token or client', async function () {
    const adapter = new Discord({});
    await adapter.connect();
    assert.strictEqual(adapter.client, null);
  });
});
