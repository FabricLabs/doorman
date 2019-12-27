const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('../lib/doorman');

const EventEmitter = require('events').EventEmitter;

describe('Doorman', function () {
  it('should expose a constructor', function () {
    assert(Doorman instanceof Function);
  });

  it('can handle a message', function (done) {
    let doorman = new Doorman();
    let plugin = { 'test': 'Successfully handled!' };

    async function main () {
      await doorman.start();

      // manually emit a message...
      doorman.services.local.emit('message', {
        id: 'test',
        actor: 'Alice',
        target: 'test',
        object: 'Hello, world!  This is a !test of the message handling flow.'
      });

      await doorman.stop();
    }

    doorman.use(plugin);
    doorman.on('response', function (message) {
      assert.equal(message.parent.id, 'local/messages/test');
      assert.equal(message.response, plugin.test);
      done();
    });

    main();
  });
});
