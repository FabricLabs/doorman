'use strict';

const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('..');
const Matrix = require('../services/matrix');

const EventEmitter = require('events').EventEmitter;

describe('Matrix', function () {
  it('should expose a constructor', function () {
    assert(Matrix instanceof Function);
  });

  it('keeps a user\'s new display name and presence over the saved ones', async function () {
    const matrix = new Matrix({});
    const saved = {
      '/users/@alice:localhost': { id: '@alice:localhost', name: 'Old', online: false, presence: 'offline', note: 'kept' }
    };

    matrix._GET = async (path) => saved[path];
    matrix._PUT = async (path, value) => { saved[path] = value; };

    await matrix._registerUser({ id: '@alice:localhost', displayName: 'Alice', currentlyActive: true, presence: 'online' });
    assert.deepStrictEqual(saved['/users/@alice:localhost'], {
      id: '@alice:localhost', name: 'Alice', online: true, presence: 'online', note: 'kept'
    });

    await matrix._registerUser({ id: '@alice:localhost' });
    assert.strictEqual(saved['/users/@alice:localhost'].name, 'Alice');
  });

  xit('can handle a message', function (done) {
    let doorman = new Doorman({
      services: ['matrix']
    });
    let plugin = { 'test': 'Successfully handled!' };

    doorman.on('response', async function (message) {
      assert.equal(message.parent.id, 'matrix/messages/test');
      assert.equal(message.response, plugin.test);
      await doorman.stop();
      return done();
    });

    doorman.use(plugin).start();

    doorman.services.matrix.emit('message', {
      id: 'test',
      actor: '@alice:localhost.localdomain',
      target: 'test',
      object: 'Hello, world!  This is a !test of the message handling flow.'
    });
  });
});
