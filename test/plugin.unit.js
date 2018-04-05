const assert = require('assert');
const expect = require('chai').expect;

const Plugin = require('../lib/plugin');
const EventEmitter = require('events').EventEmitter;

describe('Plugin', function () {
  it('should expose a constructor', function () {
    assert(Plugin instanceof Function);
  });

  it('should expose a fromName method', function () {
    assert(Plugin.fromName instanceof Function);
  });

  it('can load a plugin from ./plugins', function () {
    let sample = Plugin.fromName('debug');
    assert.ok(sample.test);
    assert.ok(sample.debug);
  });

  // TODO: build `doorman-welcome` and include by default (dev deps?)
  xit('can load a plugin from NPM', function () {
    let sample = Plugin.fromName('welcome');
    assert.ok(sample.welcome);
  });

  it('can inherit trust from a Fabric instance', function (done) {
    let fabric = new EventEmitter();
    let plugin = new Plugin();
    let sample = { content: 'Hello, world.' };

    plugin.trust(fabric).subscribe('/messages');
    plugin.on('request', function (request) {
      assert.equal(request.content, sample.content);
      done();
    });

    fabric.emit('/messages', sample);
  });
});
