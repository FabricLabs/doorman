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

    doorman.use({
      'test': 'Successfully handled!'
    });

    doorman.on('response', function (message) {
      console.log('test received:', message);
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
