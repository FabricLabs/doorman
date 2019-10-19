const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('../lib/doorman');
const Discord = require('../services/discord');

const EventEmitter = require('events').EventEmitter;

describe('Discord', function () {
  it('should expose a constructor', function () {
    assert(Discord instanceof Function);
  });
});
