const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('../lib/doorman');
const Service = require('../lib/service');

const EventEmitter = require('events').EventEmitter;

describe('Service', function () {
  it('should expose a constructor', function () {
    assert(Service instanceof Function);
  });

  it('can handle a message', function (done) {
    let doorman = new Doorman();
    let plugin = { 'test': 'Successfully handled!' };
    let local = new Service();
    let msg = new Buffer([0x01, 0x02]);

    doorman.on('response', async function (message) {
      assert.equal(message.parent.id, 'local/messages/test');
      assert.equal(message.response, plugin.test);
      await doorman.stop();
      done();
    });

    doorman.use(plugin).start();

    doorman.services.local.emit('message', {
      id: 'test',
      actor: 'Alice',
      target: 'test',
      object: 'Hello, world!  This is a !test of the message handling flow.'
    });
  });

  describe('_PUT', function () {
    it('returns a truthy value when called correctly', async function () {
      let doorman = new Doorman();

      async function body () {
        let local = doorman.services.local;
        let result = local._PUT('/some-key', { foo: 'Hello, world!' });
        assert.ok(result);
        assert.equal(local.state['some-key'].foo, 'Hello, world!');
      }

      await doorman.start();
      await body();
    });
  });

  describe('_GET', function () {
    it('returns a truthy value when called correctly', async function () {
      let doorman = new Doorman();

      async function body () {
        let local = doorman.services.local;
        local._PUT('/some-key', { foo: 'Hello, world!' });
        let result = local._GET('/some-key/foo');
        assert.ok(result);
        assert.equal(result, 'Hello, world!');
        assert.equal(local.state['some-key'].foo, 'Hello, world!');
      }

      await doorman.start();
      await body();
    });
  });

  describe('_registerUser', function () {
    it('emits a "user" event with a routable "id" attribute.', function (done) {
      let doorman = new Doorman();

      doorman.on('user', async function (message) {
        assert.equal(message.id, 'local/users/alice');
        await doorman.stop();
        done();
      }).start();

      doorman.services.local._registerUser({
        id: 'alice'
      });
    });

    it('can safely register users with special ids', function (done) {
      let doorman = new Doorman();

      doorman.on('user', async function (message) {
        try {
          assert.equal(message.id, 'local/users/@~1some~1random:host.name');
          await doorman.stop();
          done();
        } catch (E) {
          done(E);
        }

      }).start();

      doorman.services.local._registerUser({
        id: '@/some/random:host.name'
      });
    });
  });

  describe('_registerChannel', function (done) {
    it ('emits a "channel" event with a routable "id" attribute.', function (done) {
      let doorman = new Doorman();

      doorman.on('channel', async function (message) {
        assert.equal(message.id, 'local/channels/test');
        await doorman.stop();
        done();
      }).start();

      doorman.services.local._registerChannel({
        id: 'test'
      });
    });
  });

  describe('_getSubscriptions', function (done) {
    xit ('returns an array', function (done) {
      let doorman = new Doorman();

      doorman.on('channel', async function (message) {
        let result = await doorman.services.local._getSubscriptions('test');
        console.log('result:', result);
        assert(result instanceof Array);
        await doorman.stop();
        done();
      }).start();

      doorman.services.local._registerChannel({
        id: 'test'
      });
    });
  });

});
