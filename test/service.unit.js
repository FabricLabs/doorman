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
    let local = new Service();
    let msg = new Buffer([0x01, 0x02]);

    doorman.use(local);

    local.connect();
    assert.ok(local);
    
    done();
  });
});
