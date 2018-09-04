'use strict';

const fs = require('fs');
const util = require('util');
const level = require('level');
const mkdir = require('mkdirpsync');
const pointer = require('json-pointer');
const manager = require('fast-json-patch');

// artificial Fabric representation
// TODO: migrate to the real Fabric
function Fabric () {
  let self = this;
  this.state = { local: { users: {} } };
  this.services = {
    local: {
      _getUser: function (id) {
        return Object.assign({ id }, self.state.local.users[id]);
      },
      _getMembers: function () {
        return Object.keys(self.state.local.users).map(id => id);
      },
      _getPresence: function (id) {
        return self.state.local.users[id].presence;
      }
    }
  };
}

util.inherits(Fabric, require('events').EventEmitter);

Fabric.prototype.trust = function trust (source) {
  source.on('patches', this.applyPatches.bind(this));
};

Fabric.prototype.replay = function replay (filename) {
  let path = `./data/${filename}`;
  if (!fs.existsSync(path)) throw new Error(`Could not find file: ${filename}`);

  try {
    let file = fs.readFileSync(path);
    let events = JSON.parse(file);
    for (let i = 0; i < events.length; i++) {
      this.emit(events[i].type, events[i]);
    }
  } catch (E) {
    console.error('[FABRIC]', 'could not read file.  possibly corrupt?');
  }
};

Fabric.prototype._joinRoom = function (channel) {
  this.subscriptions.push(channel);
};

Fabric.prototype.patch = function applyPatch (patch) {
  manager.applyOperation(this.state, patch);
};

Fabric.prototype.applyPatches = function applyPatch (patches) {
  manager.applyPatch(this.state, patches);
};

Fabric.prototype._GET = function get (path) {
  return pointer.get(this.state, path);
};

Fabric.prototype._PUT = function set (path, value) {
  return pointer.set(this.state, path, value);
};

Fabric.Store = function (config) {
  this.config = Object.assign({
    path: './data/fabric'
  }, config);

  if (!fs.existsSync(this.config.path)) mkdir(this.config.path);

  try {
    this.db = level(this.config.path);
  } catch (E) {
    console.error('Could not open datastore:', E);
  }

  this.map = {};

  return this;
};

Fabric.Store.prototype.get = async function (key) {
  this.map[key] = await this.db.get(key);
  return this.map[key];
};

Fabric.Store.prototype.set = async function (key, value) {
  await this.db.put(key, value);
  this.map[key] = value;
  return this.map[key];
};

Fabric.Store.prototype.batch = async function (ops, done) {
  return this.db.batch(ops).then(done);
};

Fabric.Store.prototype.close = async function () {
  await this.db.close();
  return this;
};

Fabric.Store.prototype.flush = function () {
  if (fs.existsSync(this.config.path)) {
    fs.renameSync(this.config.path, this.config.path + '.' + Date.now());
  }
};

module.exports = Fabric;
