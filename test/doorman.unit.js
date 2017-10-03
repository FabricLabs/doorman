var assert = require('assert');
var expect = require('chai').expect;

var Doorman = require('../');

describe('Doorman', function () {
  it('should expose a constructor', function () {
    assert(typeof Doorman, 'function');
  });
});
