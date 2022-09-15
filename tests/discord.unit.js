'use strict';

const assert = require('assert');

const Doorman = require('..');
const Discord = require('../services/discord');

const EventEmitter = require('events').EventEmitter;

describe('Discord', function () {
  it('should expose a constructor', function () {
    assert(Discord instanceof Function);
  });
});
