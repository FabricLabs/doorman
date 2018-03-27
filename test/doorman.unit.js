const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('../lib/doorman');

describe('Doorman', function () {
  it('should expose a constructor', function () {
    assert(typeof Doorman, 'function');
  });

  it('can handle a message', function (done) {
    let doorman = new Doorman({
      triggers: {
        'debug': 'This is a debug response.'
      }
    });

    doorman.on('input', function (data) {
      assert.ok(data);
      done();
    });

    doorman.start();
    doorman.parse('Hello, world.  This is a !debug trigger!');
  });

  it('can initialize a connection', function (done) {
    let doorman = new Doorman();
    doorman.on('ready', done);
    doorman.start();
  });
});
