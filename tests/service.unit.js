'use strict';

const settings = require('../settings/default');
const assert = require('assert');

const Service = require('../types/service');
const EventEmitter = require('events').EventEmitter;

describe('Service', function () {
  it('should expose a constructor', function () {
    assert(Service instanceof Function);
  });

  it('can handle a message', function (done) {
    async function test () {
      let service = new Service();
      let sample = { 'test': 'Successfully handled!' };

      service.on('ready', function (info) {
        done();
      });

      await service.start();
    }

    test();
  });
});
