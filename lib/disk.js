'use strict';

const fs = require('fs');

function Disk (root) {
  this.type = 'Disk';
  this.root = root || process.env.PWD;
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
