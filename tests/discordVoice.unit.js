'use strict';

const assert = require('assert');
const EventEmitter = require('events').EventEmitter;
const { PassThrough } = require('stream');

const Discord = require('../services/discord');
const DiscordVoice = require('../services/discordVoice');

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** Just enough of `@discordjs/voice` to drive a handle. */
function fakeVoice () {
  const lib = {
    joined: [],
    VoiceConnectionStatus: { Signalling: 'signalling', Connecting: 'connecting', Ready: 'ready', Disconnected: 'disconnected', Destroyed: 'destroyed' },
    AudioPlayerStatus: { Idle: 'idle', Buffering: 'buffering', Playing: 'playing' },
    NoSubscriberBehavior: { Play: 'play' },
    StreamType: { Raw: 'raw' },
    joinVoiceChannel (options) {
      const connection = new EventEmitter();
      connection.options = options;
      connection.destroyed = false;
      connection.subscribe = (player) => { connection.player = player; };
      connection.destroy = () => { connection.destroyed = true; };
      lib.joined.push(connection);
      return connection;
    },
    entersState: async (target) => target,
    createAudioPlayer () {
      const player = new EventEmitter();
      player.state = { status: 'idle' };
      player.played = [];
      player.set = (status) => {
        const before = player.state;
        player.state = { status };
        player.emit('stateChange', before, player.state);
      };
      player.play = (resource) => { player.played.push(resource); player.set('playing'); };
      player.stop = () => { if (player.state.status !== 'idle') player.set('idle'); };
      return player;
    },
    createAudioResource: (stream, options) => ({ stream, options })
  };
  return lib;
}

function fakeSpawn () {
  const calls = [];
  const spawn = (command, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.exitCode = null;
    child.killed = false;
    child.kill = () => { child.killed = true; };
    calls.push({ command, args, child });
    return child;
  };
  spawn.calls = calls;
  return spawn;
}

function fakeClient () {
  return {
    user: { id: 'bot1' },
    channels: {
      fetch: async (id) => (id === 'text'
        ? { guild: { id: 'g1' }, isVoiceBased: () => false }
        : { id, guild: { id: 'g1', voiceAdapterCreator: 'creator' }, isVoiceBased: () => true })
    }
  };
}

describe('DiscordVoice', function () {
  it('builds ffmpeg arguments for URLs, seeks, headers, and streams', function () {
    const url = DiscordVoice.ffmpegArgs({ url: 'https://cdn.example/a.webm', seek: 12.5, headers: { Referer: 'x' } });
    assert.ok(url.includes('-reconnect'));
    assert.deepStrictEqual(url.slice(url.indexOf('-headers'), url.indexOf('-headers') + 2), ['-headers', 'Referer: x\r\n']);
    assert.deepStrictEqual(url.slice(url.indexOf('-ss'), url.indexOf('-ss') + 4), ['-ss', '12.500', '-i', 'https://cdn.example/a.webm']);
    assert.deepStrictEqual(url.slice(-7), ['-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1']);
    const stream = DiscordVoice.ffmpegArgs({ stream: {} });
    assert.ok(!stream.includes('-reconnect'));
    assert.ok(!stream.includes('-ss'));
    assert.strictEqual(stream[stream.indexOf('-i') + 1], 'pipe:0');
  });

  it('joins, plays through ffmpeg, reports playing and idle, and leaves', async function () {
    const voice = fakeVoice();
    const spawn = fakeSpawn();
    const handle = new DiscordVoice({ channelId: 'v1', client: fakeClient, voice, spawn, idleMs: 0 });
    const events = [];
    for (const name of ['ready', 'playing', 'idle', 'leave']) handle.on(name, (payload) => events.push([name, payload]));

    assert.strictEqual(handle.userId, 'bot1');
    await handle.play({ url: 'https://cdn.example/a.webm', seek: 3, meta: { entry: 'e1' } });
    assert.strictEqual(voice.joined.length, 1);
    assert.deepStrictEqual(voice.joined[0].options, { channelId: 'v1', guildId: 'g1', adapterCreator: 'creator', selfDeaf: true });
    assert.strictEqual(spawn.calls[0].command, 'ffmpeg');
    assert.ok(spawn.calls[0].args.includes('https://cdn.example/a.webm'));
    assert.strictEqual(voice.joined[0].player.played[0].options.inputType, 'raw');
    assert.strictEqual(handle.playing, true);

    await handle.play({ url: 'https://cdn.example/b.webm', meta: { entry: 'e2' } });
    assert.strictEqual(spawn.calls[0].child.killed, true, 'the previous ffmpeg is stopped');
    assert.strictEqual(voice.joined.length, 1, 'one connection per handle');

    await handle.stop();
    await handle.leave();
    assert.strictEqual(voice.joined[0].destroyed, true);
    assert.deepStrictEqual(events.map(([name]) => name), ['ready', 'playing', 'idle', 'leave']);
    assert.deepStrictEqual(events[1][1], { entry: 'e1' });
  });

  it('pipes a stream into ffmpeg', async function () {
    const voice = fakeVoice();
    const spawn = fakeSpawn();
    const handle = new DiscordVoice({ channelId: 'v1', client: fakeClient, voice, spawn, idleMs: 0 });
    const stream = new PassThrough();
    await handle.play({ stream });
    const chunks = [];
    spawn.calls[0].child.stdin.on('data', (chunk) => chunks.push(chunk));
    stream.write('pcm');
    await settle();
    assert.strictEqual(Buffer.concat(chunks).toString(), 'pcm');
    await handle.leave();
  });

  it('refuses text channels and explains a missing ffmpeg', async function () {
    const voice = fakeVoice();
    const spawn = fakeSpawn();
    const text = new DiscordVoice({ channelId: 'text', client: fakeClient, voice, spawn, idleMs: 0 });
    await assert.rejects(text.join(), /Not a voice channel/);

    const handle = new DiscordVoice({ channelId: 'v1', client: fakeClient, voice, spawn, idleMs: 0 });
    const errors = [];
    handle.on('error', (error) => errors.push(error.message));
    await handle.play({ url: '/tmp/a.mp3' });
    spawn.calls[0].child.emit('error', Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' }));
    assert.match(errors[0], /ffmpeg not found/);
    await assert.rejects(handle.play({}), /Nothing to play/);
    await handle.leave();
  });

  it('leaves after the idle timeout', async function () {
    const voice = fakeVoice();
    const handle = new DiscordVoice({ channelId: 'v1', client: fakeClient, voice, spawn: fakeSpawn(), idleMs: 10 });
    let left = false;
    handle.on('leave', () => { left = true; });
    await handle.join();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.strictEqual(left, true);
  });

  it('is handed out per channel by an adapter that speaks, and left on disconnect', async function () {
    const client = new EventEmitter();
    client.voice = { active: {} };
    client.client = fakeClient();
    const voice = fakeVoice();
    const adapter = new Discord({ client, speaks: true, voice, spawn: fakeSpawn(), voiceIdleMs: 0 });
    await adapter.connect();
    const handle = adapter.voice('v1');
    assert.strictEqual(adapter.voice('v1'), handle);
    assert.notStrictEqual(adapter.voice('v2'), handle);
    await handle.join();
    await adapter.disconnect();
    assert.strictEqual(voice.joined[0].destroyed, true);
    assert.notStrictEqual(adapter.voice('v1'), handle, 'a left handle is replaced');
  });
});
