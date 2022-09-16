'use strict';

const fs = require('fs');
const Service = require('@fabric/core/types/service');

class Disk extends Service {
  constructor (settings = {}) {
    super(settings);

    this.type = 'Disk';
    this.root = root || process.env.PWD;

    return this;
  }
}

Disk.prototype.exists = function (path) {
  let full = [this.root, path].join('/');
  return fs.existsSync(full);
};

Disk.prototype.get = function (path) {
  let full = [this.root, path].join('/');
  return require(full);
};

module.exports = Disk;
