'use strict';

const EventEmitter = require('events').EventEmitter;

const JOIN_TIMEOUT_MS = 20 * 1000;
const RECONNECT_TIMEOUT_MS = 5 * 1000;

function errorMessage (error) {
  return error && error.message ? error.message : String(error);
}

/**
 * ffmpeg arguments that decode `input` (a URL, a file, or `pipe:0`) to the
 * raw 48 kHz stereo PCM `@discordjs/voice` plays.
 * @param {Object} source `{ url, stream, seek, headers }`
 * @returns {string[]}
 */
function ffmpegArgs (source = {}) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
  const url = source.stream ? null : String(source.url || '');
  if (url && /^https?:\/\//i.test(url)) {
    args.push('-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
    if (source.headers && typeof source.headers === 'object') {
      const headers = Object.entries(source.headers).map(([key, value]) => `${key}: ${value}\r\n`).join('');
      if (headers) args.push('-headers', headers);
    }
  }
  const seek = Number(source.seek) || 0;
  if (seek > 0) args.push('-ss', seek.toFixed(3));
  args.push('-i', url || 'pipe:0', '-analyzeduration', '0', '-vn', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1');
  return args;
}

/**
 * One Discord voice channel: join it, play audio sources through ffmpeg,
 * stop, and leave. Emits `ready` once connected, `playing` and `idle` (with
 * the source's `meta`), `leave`, and `error`. Leaves on its own after
 * `idleMs` without playing.
 */
class DiscordVoice extends EventEmitter {
  /**
   * @param {Object} settings
   * @param {string} settings.channelId Voice channel id.
   * @param {Function} settings.client Returns the discord.js Client.
   * @param {Object} [settings.voice] `@discordjs/voice` module.
   * @param {string} [settings.ffmpeg='ffmpeg'] ffmpeg binary.
   * @param {Function} [settings.spawn] `child_process.spawn`.
   * @param {number} [settings.idleMs] Leave after this long idle (0 = never).
   */
  constructor (settings = {}) {
    super();
    this.channelId = String(settings.channelId);
    this.guildId = null;
    this.settings = Object.assign({ ffmpeg: 'ffmpeg', idleMs: 5 * 60 * 1000 }, settings);
    this.connection = null;
    this.player = null;
    this.current = null;
    this._process = null;
    this._joining = null;
    this._idleTimer = null;
  }

  get lib () {
    if (!this._lib) this._lib = this.settings.voice || require('@discordjs/voice');
    return this._lib;
  }

  get playing () {
    return !!(this.player && this.player.state && this.player.state.status === this.lib.AudioPlayerStatus.Playing);
  }

  /**
   * The bot's own Discord user id (it shows up in the channel's voice events).
   * @type {string|null}
   */
  get userId () {
    const client = typeof this.settings.client === 'function' ? this.settings.client() : this.settings.client;
    return (client && client.user && client.user.id) ? String(client.user.id) : null;
  }

  /**
   * Connect to the channel (once; later calls wait for the same join).
   * @returns {Promise<DiscordVoice>}
   */
  async join () {
    if (this.connection) return this;
    if (!this._joining) {
      this._joining = this._join().finally(() => { this._joining = null; });
    }
    return this._joining;
  }

  async _join () {
    const lib = this.lib;
    const client = typeof this.settings.client === 'function' ? this.settings.client() : this.settings.client;
    if (!client || !client.channels || typeof client.channels.fetch !== 'function') throw new Error('Discord client is not ready');
    const channel = await client.channels.fetch(this.channelId);
    if (!channel || !channel.guild || (typeof channel.isVoiceBased === 'function' && !channel.isVoiceBased())) {
      throw new Error(`Not a voice channel: ${this.channelId}`);
    }
    this.guildId = String(channel.guild.id);
    const connection = lib.joinVoiceChannel({
      channelId: this.channelId,
      guildId: this.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    connection.on('error', (error) => this.emit('error', error));
    connection.on(lib.VoiceConnectionStatus.Disconnected, () => this._handleDisconnect(connection));
    connection.on(lib.VoiceConnectionStatus.Destroyed, () => {
      if (this.connection === connection) this._teardown();
    });
    try {
      await lib.entersState(connection, lib.VoiceConnectionStatus.Ready, JOIN_TIMEOUT_MS);
    } catch (error) {
      try { connection.destroy(); } catch (_) { /* already destroyed */ }
      throw new Error(`Could not join voice channel ${this.channelId}: ${errorMessage(error)}`);
    }

    const player = lib.createAudioPlayer({ behaviors: { noSubscriber: lib.NoSubscriberBehavior.Play } });
    player.on('error', (error) => this.emit('error', error));
    player.on('stateChange', (before, after) => this._handlePlayerState(before, after));
    connection.subscribe(player);

    this.connection = connection;
    this.player = player;
    this._armIdle();
    this.emit('ready', { channel: this.channelId, guild: this.guildId });
    return this;
  }

  /** Moved between channels or a network blip: wait for it to come back, else leave. */
  async _handleDisconnect (connection) {
    const lib = this.lib;
    try {
      await Promise.race([
        lib.entersState(connection, lib.VoiceConnectionStatus.Signalling, RECONNECT_TIMEOUT_MS),
        lib.entersState(connection, lib.VoiceConnectionStatus.Connecting, RECONNECT_TIMEOUT_MS)
      ]);
    } catch (_) {
      if (this.connection === connection) await this.leave();
    }
  }

  _handlePlayerState (before, after) {
    const status = this.lib.AudioPlayerStatus;
    if (after.status === status.Playing && before.status !== status.Playing) {
      this._disarmIdle();
      this.emit('playing', this.current);
    } else if (after.status === status.Idle && before.status !== status.Idle) {
      const finished = this.current;
      this.current = null;
      this._killProcess();
      this._armIdle();
      this.emit('idle', finished);
    }
  }

  /**
   * Play one source, replacing whatever is playing.
   * @param {Object} source `{ url }` (URL or file ffmpeg can open) or `{ stream }` (a Readable), plus optional `seek` seconds, `headers`, and `meta` (passed back with `playing` / `idle`).
   * @returns {Promise<DiscordVoice>}
   */
  async play (source = {}) {
    if (!source.url && !source.stream) throw new Error('Nothing to play: give a url or a stream');
    await this.join();
    const lib = this.lib;
    this._killProcess();
    const spawn = this.settings.spawn || require('child_process').spawn;
    const child = spawn(this.settings.ffmpeg, ffmpegArgs(source), { stdio: [source.stream ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    child.on('error', (error) => {
      const message = error && error.code === 'ENOENT'
        ? `ffmpeg not found ("${this.settings.ffmpeg}"); install it to play audio`
        : `ffmpeg: ${errorMessage(error)}`;
      this.emit('error', new Error(message));
    });
    if (child.stderr) child.stderr.on('data', () => {}); // drain; -loglevel error keeps it short
    if (source.stream && child.stdin) {
      child.stdin.on('error', () => {}); // ffmpeg exits early on a seek past the end
      source.stream.pipe(child.stdin);
    }
    this._process = child;
    this.current = source.meta == null ? null : source.meta;
    const resource = lib.createAudioResource(child.stdout, { inputType: lib.StreamType.Raw });
    this.player.play(resource);
    return this;
  }

  /** Stop playing (stays connected). */
  async stop () {
    if (this.player) this.player.stop(true);
    this._killProcess();
    return this;
  }

  /** Stop and disconnect; emits `leave`. */
  async leave () {
    const connection = this.connection;
    this._teardown();
    if (connection) {
      try { connection.destroy(); } catch (_) { /* already destroyed */ }
    }
    this.emit('leave', { channel: this.channelId, guild: this.guildId });
    return this;
  }

  _teardown () {
    this._disarmIdle();
    if (this.player) {
      try { this.player.stop(true); } catch (_) { /* already stopped */ }
    }
    this._killProcess();
    this.player = null;
    this.connection = null;
    this.current = null;
  }

  _killProcess () {
    const child = this._process;
    this._process = null;
    if (child && child.exitCode == null && typeof child.kill === 'function') {
      try { child.kill('SIGKILL'); } catch (_) { /* already exited */ }
    }
  }

  _armIdle () {
    this._disarmIdle();
    const idleMs = Number(this.settings.idleMs) || 0;
    if (idleMs <= 0) return;
    this._idleTimer = setTimeout(() => {
      this._idleTimer = null;
      if (!this.playing) this.leave().catch((error) => this.emit('error', error));
    }, idleMs);
    if (typeof this._idleTimer.unref === 'function') this._idleTimer.unref();
  }

  _disarmIdle () {
    if (this._idleTimer) clearTimeout(this._idleTimer);
    this._idleTimer = null;
  }
}

module.exports = DiscordVoice;
module.exports.ffmpegArgs = ffmpegArgs;
