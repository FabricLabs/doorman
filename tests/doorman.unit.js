'use strict';

const settings = require('../settings/default');
const assert = require('assert');

const Doorman = require('..');
const EventEmitter = require('events').EventEmitter;

describe('Doorman', function () {
  it('should expose a constructor', function () {
    assert(Doorman instanceof Function);
  });

  it('can handle a message', function (done) {
    async function test () {
      let doorman = new Doorman();
      let source = new EventEmitter();
      let sample = { 'test': 'Successfully handled!' };

      await doorman.use(sample);

      doorman.on('response', function (message) {
        assert.equal(message.parent.id, 'local/messages/test');
        assert.equal(message.response, sample.test);
        done();
      });
  
      await doorman.start();
  
      doorman.services.local.emit('message', {
        id: 'test',
        actor: 'Alice',
        target: 'test',
        object: 'Hello, world!  This is a !test of the message handling flow.'
      });
    }

    test();
  });
});
