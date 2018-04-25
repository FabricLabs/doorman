const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('../lib/doorman');
const Service = require('../lib/service');

const EventEmitter = require('events').EventEmitter;

describe('Doorman', function () {
  it('should expose a constructor', function () {
    assert(Doorman instanceof Function);
  });

  it('can handle a message', function (done) {
    let doorman = new Doorman();
    let source = new EventEmitter();
    let sample = { 'test': 'Successfully handled!' };

    doorman.use(sample);

    doorman.on('response', function (message) {
      assert.equal(message.parent.id, 'local/messages/test');
      assert.equal(message.response, sample.test);
      done();
    });

    doorman.start();

    doorman.services.local.emit('message', {
      id: 'test',
      actor: 'Alice',
      target: 'test',
      object: 'Hello, world!  This is a !test of the message handling flow.'
    });
  });
});
