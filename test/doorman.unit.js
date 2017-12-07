var assert = require('assert');
var expect = require('chai').expect;

var Doorman = require('../');

describe('Doorman', function () {
  it('should expose a constructor', function () {
    assert(typeof Doorman, 'function');
  });
  
  it('can initialize a connection', function (done) {
    var doorman = new Doorman();
    
    doorman.on('ready', done);
    
    doorman.start();
  });
});
