'use strict';

const assert = require('assert');
const expect = require('chai').expect;

const Doorman = require('..');
const Slack = require('../services/slack');

const EventEmitter = require('events').EventEmitter;

describe('Slack', function () {
  it('should expose a constructor', function () {
    assert(Slack instanceof Function);
  });
});
