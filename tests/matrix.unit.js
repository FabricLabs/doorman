const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('../lib/doorman');
const Matrix = require('../services/matrix');

const EventEmitter = require('events').EventEmitter;

describe('Matrix', function () {
  it('should expose a constructor', function () {
    assert(Matrix instanceof Function);
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
