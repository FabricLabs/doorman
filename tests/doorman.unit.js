'use strict';

const assert = require('assert');
const EventEmitter = require('events').EventEmitter;

const Doorman = require('../services/doorman');
const Plugin = require('../types/plugin');

class FakeAdapter extends EventEmitter {
  constructor () {
    super();
    this.sent = [];
  }

  connect () {
    this.emit('ready');
  }

  send (channel, message) {
    this.sent.push({ channel, message });
  }
}

class PresenceCounter extends Plugin {
  constructor (settings = {}) {
    super(settings);
    this.online = new Set();
    this.seen = [];
    this.triggers = {
      online: { name: 'online', value: () => `${this.online.size} online` }
    };
  }

  trust (host) {
    host.on('presence', (presence) => {
      this.seen.push(presence);
      if (presence.status === 'online') this.online.add(presence.user);
      else this.online.delete(presence.user);
    });
    return super.trust(host);
  }

  report () {
    return { online: this.online.size };
  }
}

describe('Doorman', function () {
  it('should expose a constructor', function () {
    assert(Doorman instanceof Function);
  });

  it('starts without an HTTP server when http is false', async function () {
    const doorman = new Doorman({ http: false, local: false });
    assert.strictEqual(doorman.http, null);
    await doorman.start();
    assert.deepStrictEqual(Object.keys(doorman.services), []);
    await doorman.stop();
  });

  it('accepts an injected service instance and namespaces its events', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const adapter = new FakeAdapter();
    const events = { join: [], part: [], presence: [], message: [], service: [] };
    for (const name of Object.keys(events)) doorman.on(name, (e) => events[name].push(e));

    await doorman.start();
    doorman.enable('fake', adapter);

    adapter.emit('join', { user: 'alice', channel: 'lobby' });
    adapter.emit('presence', { user: 'alice', status: 'online', channel: 'lobby' });
    adapter.emit('part', { user: 'alice', channel: 'lobby' });
    adapter.emit('presence', { user: 'alice', status: 'offline' });
    adapter.emit('message', { id: 'm1', actor: 'alice', target: 'lobby', object: 'hi' });
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepStrictEqual(events.service, [{ name: 'fake' }]);
    assert.deepStrictEqual(events.join[0], { user: 'fake/users/alice', channel: 'fake/channels/lobby' });
    assert.deepStrictEqual(events.part[0], { user: 'fake/users/alice', channel: 'fake/channels/lobby' });
    assert.strictEqual(events.presence[0].user, 'fake/users/alice');
    assert.strictEqual(events.presence[0].status, 'online');
    assert.strictEqual(events.presence[0].channel, 'fake/channels/lobby');
    assert.strictEqual(events.presence[1].status, 'offline');
    assert.strictEqual(events.presence[1].channel, null);
    assert.strictEqual(events.message[0].id, 'fake/messages/m1');
    assert.strictEqual(events.message[0].actor, 'fake/users/alice');
    await doorman.stop();
  });

  it('keeps a Service-based plugin prototype chain and aggregates report()', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const adapter = new FakeAdapter();
    await doorman.start();
    doorman.enable('fake', adapter);
    doorman.use(PresenceCounter, { name: 'presencecounter' });

    const plugin = doorman.plugins.presencecounter;
    assert(plugin instanceof PresenceCounter);
    assert(plugin instanceof Plugin);
    assert.strictEqual(Object.getPrototypeOf(PresenceCounter.prototype), Plugin.prototype);

    adapter.emit('presence', { user: 'alice', status: 'online' });
    adapter.emit('presence', { user: 'bob', status: 'online' });
    adapter.emit('presence', { user: 'alice', status: 'offline' });

    const report = await doorman.report();
    assert.deepStrictEqual(report.plugins.presencecounter, { online: 1 });
    assert.deepStrictEqual(report.services, ['fake']);
    assert.ok(doorman.triggers.online);
    await doorman.stop();
  });

  it('routes a trigger response back to the originating service', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const adapter = new FakeAdapter();
    doorman.use({ test: 'Successfully handled!' });
    await doorman.start();
    doorman.enable('fake', adapter);

    const response = await new Promise((resolve) => {
      doorman.on('response', resolve);
      adapter.emit('message', { id: 'test', actor: 'alice', target: 'lobby', object: 'a !test of routing' });
    });

    assert.strictEqual(response.parent.id, 'fake/messages/test');
    assert.strictEqual(response.response, 'Successfully handled!');
    assert.deepStrictEqual(adapter.sent[0], { channel: 'lobby', message: 'Successfully handled!' });
    await doorman.stop();
  });

  it('reports a failed reply or parse as an error instead of an unhandled rejection', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const adapter = new FakeAdapter();
    const errors = [];
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    doorman.on('error', (error) => errors.push(error));
    doorman.use({ test: 'Successfully handled!' });
    await doorman.start();
    doorman.enable('fake', adapter);

    try {
      adapter.send = async () => { throw new Error('Missing Permissions'); };
      adapter.emit('message', { id: 'm1', actor: 'alice', target: 'lobby', object: '!test' });
      doorman.parse = async () => { throw new Error('parser broke'); };
      adapter.emit('message', { id: 'm2', actor: 'alice', target: 'lobby', object: '!test' });
      await new Promise((resolve) => setTimeout(resolve, 20));

      assert.strictEqual(errors.length, 2);
      assert.ok(errors.some((error) => error.includes('[DOORMAN:FAKE] message: Missing Permissions')));
      assert.ok(errors.some((error) => error.includes('[DOORMAN:FAKE] message: parser broke')));
      assert.deepStrictEqual(unhandled, []);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
      await doorman.stop();
    }
  });

  it('delivers plugin messages to a fixed target and reports failed sends as errors', async function () {
    class Announcer extends Plugin {}
    const doorman = new Doorman({ http: false, local: false });
    const adapter = new FakeAdapter();
    const errors = [];
    doorman.on('error', (error) => errors.push(error));
    await doorman.start();
    doorman.enable('fake', adapter);
    doorman.use(Announcer, { name: 'announcer' });
    const plugin = doorman.plugins.announcer;

    plugin.emit('message', { actor: 'announcer', object: 'hello', target: 'fake/channels/news' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(adapter.sent[0], { channel: 'news', message: 'hello' });

    adapter.send = async () => { throw new Error('Missing Permissions'); };
    plugin.emit('message', { actor: 'announcer', object: 'again', target: 'fake/channels/news' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes('fake/channels/news'));
    assert.ok(errors[0].includes('Missing Permissions'));
    await doorman.stop();
  });

  it('detaches adapter listeners on stop() so a restart does not double events', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const adapter = new FakeAdapter();
    await doorman.start();
    doorman.enable('fake', adapter);
    assert.ok(adapter.listenerCount('message') > 0);

    await doorman.stop();
    assert.strictEqual(adapter.listenerCount('message'), 0);
    assert.strictEqual(adapter.listenerCount('presence'), 0);
    assert.deepStrictEqual(Object.keys(doorman.services), []);

    await doorman.start();
    doorman.enable('fake', adapter);
    assert.strictEqual(adapter.listenerCount('message'), 1);
    await doorman.stop();
  });

  it('replacing a service name detaches and disconnects the previous adapter', async function () {
    const doorman = new Doorman({ http: false, local: false });
    await doorman.start();
    const first = new FakeAdapter();
    let disconnected = 0;
    first.disconnect = () => { disconnected++; };
    doorman.enable('fake', first);
    const second = new FakeAdapter();
    doorman.enable('fake', second);
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(first.listenerCount('message'), 0);
    assert.strictEqual(disconnected, 1);
    assert.strictEqual(doorman.services.fake, second);
    // Re-enabling the same instance re-wires it without disconnecting.
    second.disconnect = () => { disconnected++; };
    doorman.enable('fake', second);
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(second.listenerCount('message'), 1);
    assert.strictEqual(disconnected, 1);
    await doorman.stop();
  });

  it('does not report a replacement adapter ready before it says so', async function () {
    const doorman = new Doorman({ http: false, local: false });
    await doorman.start();
    doorman.enable('fake', new FakeAdapter());
    assert.strictEqual(doorman._state.content.services.fake.ready, true);
    await doorman.stop();
    assert.strictEqual(doorman._state.content.services.fake.ready, false);
    const silent = new FakeAdapter();
    silent.connect = () => {};
    await doorman.start();
    doorman.enable('fake', silent);
    assert.strictEqual(doorman._state.content.services.fake.ready, false);
    await doorman.stop();
  });

  it('logs adapter failures instead of throwing when nobody listens for errors', async function () {
    const doorman = new Doorman({ http: false, local: false });
    const original = console.error;
    const logged = [];
    console.error = (...parts) => logged.push(parts.join(' '));
    try {
      assert.doesNotThrow(() => doorman.emit('error', 'boom'));
    } finally {
      console.error = original;
    }
    assert.ok(logged.some((line) => line.includes('boom')));
    const seen = [];
    doorman.on('error', (message) => seen.push(message));
    console.error = () => { throw new Error('should stay quiet with a host listener'); };
    try {
      doorman.emit('error', 'again');
    } finally {
      console.error = original;
    }
    assert.deepStrictEqual(seen, ['again']);
  });

  describe('console', function () {
    const port = 40000 + Math.floor(Math.random() * 20000);
    const base = `http://127.0.0.1:${port}`;

    async function getJson (path, init) {
      const response = await fetch(base + path, init);
      return { status: response.status, body: await response.json() };
    }

    it('counts events and exposes status() without the HTTP server', async function () {
      const doorman = new Doorman({ http: false, local: false });
      const adapter = new FakeAdapter();
      doorman.use(PresenceCounter, { name: 'presencecounter' });
      doorman.use({ ping: 'pong' });
      await doorman.start();
      doorman.enable('fake', adapter);

      adapter.emit('presence', { user: 'alice', status: 'online' });
      adapter.emit('user', { id: 'u1', name: 'alice' });
      await new Promise((resolve) => {
        doorman.once('response', resolve);
        adapter.emit('message', { id: 'm1', actor: 'alice', target: 'lobby', object: '!ping' });
      });

      const status = doorman.status();
      assert.ok(status.startedAt);
      assert.strictEqual(status.trigger, '!');
      assert.strictEqual(status.counts.presence, 1);
      assert.strictEqual(status.counts.user, 1);
      assert.strictEqual(status.counts.message, 1);
      assert.strictEqual(status.counts.response, 1);
      assert.ok(status.counts.trigger >= 2);
      assert.deepStrictEqual(status.triggers.sort(), ['help', 'online', 'ping']);

      const fake = status.services.find((service) => service.name === 'fake');
      assert.strictEqual(fake.type, 'FakeAdapter');
      assert.strictEqual(fake.ready, true);
      assert.strictEqual(fake.counts.message, 1);
      assert.strictEqual(fake.counts.presence, 1);

      const plugin = status.plugins.find((entry) => entry.name === 'presencecounter');
      assert.deepStrictEqual(plugin, { name: 'presencecounter', hasReport: true, triggers: ['online'] });

      // Broadcast is a no-op when there is no HTTP server.
      assert.strictEqual(doorman.http, null);
      assert.doesNotThrow(() => doorman.register({ name: 'late', value: 'ok' }));
      assert.ok(JSON.stringify(status).indexOf('alice') === -1, 'status must not leak user ids');
      await doorman.stop();
    });

    it('serves the console JSON API through a host-mounted middleware', async function () {
      const doorman = new Doorman({ http: false, local: false });
      doorman.use({ ping: 'pong' });
      await doorman.start();
      const handler = doorman.middleware();

      function run (method, url) {
        return new Promise((resolve) => {
          const res = {
            headers: {},
            headersSent: false,
            setHeader (k, v) { this.headers[k] = v; },
            end (body) { this.headersSent = true; resolve({ status: this.statusCode, body: body ? JSON.parse(body) : null, next: false }); }
          };
          handler({ method, url, originalUrl: url, path: url.split('?')[0] }, res, () => resolve({ next: true }));
        });
      }

      assert.deepStrictEqual(await run('GET', '/services/other'), { next: true });
      const status = await run('GET', '/services/doorman');
      assert.strictEqual(status.status, 200);
      assert.deepStrictEqual(status.body.triggers.sort(), ['help', 'ping']);
      const report = await run('GET', '/services/doorman/report');
      assert.strictEqual(report.status, 200);
      assert.ok(report.body.generatedAt);
      assert.strictEqual((await run('GET', '/services/doorman/plugins/nope')).status, 404);
      assert.strictEqual((await run('GET', '/services/doorman/nope')).status, 404);
      assert.strictEqual((await run('POST', '/services/doorman')).status, 405);
      await doorman.stop();
    });

    it('serves status, reports, JSON-RPC, and the HTML shell over HTTP', async function () {
      this.timeout(20000);
      const doorman = new Doorman({ local: false, http: { port, hostname: 'localhost' } });
      const adapter = new FakeAdapter();
      doorman.use(PresenceCounter, { name: 'presencecounter' });
      await doorman.start();
      doorman.enable('fake', adapter);
      adapter.emit('presence', { user: 'alice', status: 'online' });

      try {
        assert.ok(doorman.http);
        assert.strictEqual(doorman.http.settings.jsonRpc.enabled, true);

        const status = await getJson('/services/doorman');
        assert.strictEqual(status.status, 200);
        assert.strictEqual(status.body.services[0].name, 'fake');
        assert.strictEqual(status.body.counts.presence, 1);

        const report = await getJson('/services/doorman/report');
        assert.strictEqual(report.status, 200);
        assert.deepStrictEqual(report.body.plugins.presencecounter, { online: 1 });

        const one = await getJson('/services/doorman/plugins/presencecounter');
        assert.strictEqual(one.status, 200);
        assert.deepStrictEqual(one.body.report, { online: 1 });
        assert.strictEqual((await getJson('/services/doorman/plugins/missing')).status, 404);

        for (const method of ['GetDoormanStatus', 'GetDoormanReport', 'ListDoormanServices', 'ListDoormanPlugins', 'GetNetworkStatus']) {
          const rpc = await getJson('/services/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [{}] })
          });
          assert.strictEqual(rpc.status, 200, method);
          assert.ok(rpc.body.result, method);
          assert.strictEqual(rpc.body.error, undefined, method);
        }
        const net = await getJson('/services/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'GetNetworkStatus', params: [{}] })
        });
        assert.deepStrictEqual(net.body.result.peers, []);
        assert.strictEqual(net.body.result.doorman.services[0].name, 'fake');

        const html = await fetch(base + '/');
        assert.strictEqual(html.status, 200);
        const text = await html.text();
        assert.ok(text.includes('id="doorman"'));
        assert.ok(text.includes('/bundles/browser.min.js'));
      } finally {
        await doorman.stop();
      }
    });

    it('broadcasts aggregate DoormanEvent frames to WebSocket clients', async function () {
      this.timeout(20000);
      const Message = require('@fabric/core/types/message');
      const doorman = new Doorman({ local: false, http: { port, hostname: 'localhost' } });
      const adapter = new FakeAdapter();
      doorman.enable('fake', adapter);
      await doorman.start();

      const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
      ws.binaryType = 'arraybuffer';
      try {
        const events = await new Promise((resolve, reject) => {
          const seen = [];
          const timer = setTimeout(() => reject(new Error('no DoormanEvent received')), 8000);
          ws.onerror = (error) => { clearTimeout(timer); reject(error); };
          ws.onopen = () => {
            adapter.emit('message', { id: 'm1', actor: 'alice', target: 'lobby', object: 'secret text' });
            adapter.emit('presence', { user: 'alice', status: 'online' });
          };
          ws.onmessage = (event) => {
            let parsed = null;
            try {
              parsed = JSON.parse(Message.fromBuffer(Buffer.from(event.data)).body.toString());
            } catch (_) { return; }
            if (!parsed || parsed.type !== 'DoormanEvent') return;
            seen.push(parsed.object);
            if (seen.some((e) => e.kind === 'message') && seen.some((e) => e.kind === 'presence')) {
              clearTimeout(timer);
              resolve(seen);
            }
          };
        });
        const message = events.find((e) => e.kind === 'message');
        assert.deepStrictEqual(message, { kind: 'message', service: 'fake', count: 1, total: 1 });
        assert.ok(JSON.stringify(events).indexOf('secret text') === -1, 'broadcast must not carry content');
        assert.ok(JSON.stringify(events).indexOf('alice') === -1, 'broadcast must not carry user ids');
      } finally {
        ws.close();
        await doorman.stop();
      }
    });
  });
});
