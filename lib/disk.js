'use strict';

const fs = require('fs');

function Disk () {
  this.type = 'Disk';
}

Disk.prototype.exists = function (path) {
  return fs.existsSync(path);
};

module.exports = Disk;
