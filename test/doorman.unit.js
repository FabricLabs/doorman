var assert = require('assert');
var expect = require('chai').expect;

var Doorman = require('../');

describe('Doorman', function () {
  it('should expose a constructor', function () {
    assert(typeof Doorman, 'function');
  });

  it('can handle a message', function (done) {
    let doorman = new Doorman();
    doorman.on('input', function (data) {
      assert.ok(data);
      done();
    });
  });

  it('can initialize a connection', function (done) {
    let doorman = new Doorman();
    doorman.on('ready', done);
    doorman.start();
  });
});
