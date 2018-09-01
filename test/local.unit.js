const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('../lib/doorman');
const LocalService = require('../services/local');

const EventEmitter = require('events').EventEmitter;

describe('LocalService', function () {
  it('should expose a constructor', function () {
    assert(LocalService instanceof Function);
  });
});
