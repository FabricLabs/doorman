'use strict';

const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const Doorman = require('../services/doorman');
const Plugin = require('../types/plugin');

const settle = () => new Promise((resolve) => setImmediate(resolve));

class CommandAdapter extends EventEmitter {
  constructor () {
    super();
    this.supportsCommands = true;
    this.registered = [];
  }

  connect () {
    this.emit('ready');
  }

  registerCommands (definitions) {
    this.registered.push(definitions.map((definition) => definition.name));
  }

  invoke (name, extra = {}) {
    const replies = [];
    this.emit('command', Object.assign({
      name,
      user: 'u1',
      channel: 'c1',
      guild: 'g1',
      options: {},
      autocomplete: false,
      reply: async (result) => { replies.push(result); }
    }, extra));
    return replies;
  }
}

class Jukebox extends Plugin {
  constructor (settings = {}) {
    super(settings);
    this.calls = [];
    this.chatCommands = {
      play: {
        description: 'Queue a track',
        options: [{ name: 'track', type: 'string', required: true, autocomplete: true }],
        handler: function (invocation) {
          this.calls.push(invocation);
          return `Queued ${invocation.options.track}`;
        },
        autocomplete: function (invocation) {
          return [{ name: `${invocation.focused.value} (live)`, value: 'live' }];
        }
      }
    };
  }
}

describe('Doorman commands', function () {
  it('validates names and options', function () {
    const doorman = new Doorman({ http: false, local: false });
    assert.throws(() => doorman.command({ name: 'Bad Name' }, () => {}), /Invalid command name/);
    assert.throws(() => doorman.command({ name: 'ok', options: [{ name: 'x', type: 'float' }] }, () => {}), /Invalid option type/);
    assert.throws(() => doorman.command({ name: 'ok' }), /handler/);
    doorman.command({ name: 'ok', description: 'Fine', options: [{ name: 'n', type: 'integer', choices: [1, { name: 'Two', value: 2 }] }] }, () => 'ok');
    assert.deepStrictEqual(doorman.commandDefinitions(), [{
      name: 'ok',
      description: 'Fine',
      options: [{ name: 'n', type: 'integer', description: 'n', required: false, choices: [{ name: '1', value: 1 }, { name: 'Two', value: 2 }] }]
    }]);
  });

  it('registers plugin commands with ready adapters and routes invocations to the owner', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const adapter = new CommandAdapter();
    const events = [];
    doorman.on('command', (invocation) => events.push(invocation));
    await doorman.start();
    doorman.enable('fake', adapter);
    doorman.use(Jukebox, {});
    await settle();

    assert.deepStrictEqual(adapter.registered[adapter.registered.length - 1], ['play']);
    assert.deepStrictEqual(doorman.status().commands, ['play']);
    assert.deepStrictEqual(doorman.status().plugins[0].commands, ['play']);

    const replies = adapter.invoke('play', { options: { track: 'Strobe' }, voice: 'v1' });
    await settle();
    const plugin = doorman.plugins.jukebox;
    assert.strictEqual(plugin.calls.length, 1, 'handler runs with the plugin as this');
    assert.strictEqual(plugin.calls[0].user, 'fake/users/u1');
    assert.strictEqual(plugin.calls[0].channel, 'fake/channels/c1');
    assert.strictEqual(plugin.calls[0].voice, 'fake/channels/v1');
    assert.strictEqual(plugin.calls[0].guild, 'g1');
    assert.deepStrictEqual(replies, ['Queued Strobe']);
    assert.strictEqual(events.length, 1);

    const choices = [];
    adapter.emit('command', { name: 'play', autocomplete: true, focused: { name: 'track', value: 'str' }, respond: async (list) => choices.push(list) });
    await settle();
    assert.deepStrictEqual(choices, [[{ name: 'str (live)', value: 'live' }]]);
    assert.strictEqual(events.length, 1, 'autocomplete is not counted as a command');

    const ignored = adapter.invoke('unknown');
    await settle();
    assert.deepStrictEqual(ignored, []);
    await doorman.stop();
  });

  it('sends a handler reply only once and reports failures privately', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const adapter = new CommandAdapter();
    const errors = [];
    doorman.on('error', (error) => errors.push(error));
    await doorman.start();
    doorman.enable('fake', adapter);
    doorman.command({ name: 'self' }, async (invocation) => {
      await invocation.reply('first');
      return 'second';
    });
    doorman.command({ name: 'boom' }, () => { throw new Error('nope'); });

    const once = adapter.invoke('self');
    await settle();
    assert.deepStrictEqual(once, ['first']);

    const failed = adapter.invoke('boom');
    await settle();
    assert.deepStrictEqual(failed, [{ content: 'That did not work.', ephemeral: true }]);
    assert.ok(errors.some((error) => /\/boom: nope/.test(String(error))));
    await doorman.stop();
  });

  it('refuses a command name another owner holds', function () {
    const doorman = new Doorman({ http: false, local: false });
    doorman.command({ name: 'np' }, () => 'host');
    assert.throws(() => doorman.command({ name: 'np' }, () => 'plugin', { plugin: 'jukebox' }), /already belongs to the host/);
    doorman.command({ name: 'np' }, () => 'host again');
  });

  it('hands out voice handles only from adapters that can speak', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const mute = new CommandAdapter();
    const loud = new CommandAdapter();
    loud.canSpeak = true;
    loud.voice = (id) => ({ id });
    await doorman.start();
    doorman.enable('mute', mute);
    doorman.enable('loud', loud);
    assert.throws(() => doorman.voice('loud/users/u1'), /Not a channel/);
    assert.throws(() => doorman.voice('none/channels/v1'), /No service/);
    assert.throws(() => doorman.voice('mute/channels/v1'), /cannot play audio/);
    assert.deepStrictEqual(doorman.voice('loud/channels/v1'), { id: 'v1' });
    await doorman.stop();
  });
});
