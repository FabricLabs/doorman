const assert = require('assert');
const expect = require('chai').expect;

const Scribe = require('../lib/scribe');

describe('Scribe', function () {
  it('should expose a constructor', function () {
    assert(Scribe instanceof Function);
  });
  
  it('should inherit to a stack', function () {
    let parent = new Scribe({ namespace: 'parent' });
    let scribe = new Scribe();

    scribe.inherits(parent);
    assert.equal(scribe.stack[0], 'parent');
  });
  
  xit('should log some series of tags', function () {
    let scribe = new Scribe();
    let result = scribe.log('debug', 'messaging', 'some data');

    assert.ok(result);
  });
});
