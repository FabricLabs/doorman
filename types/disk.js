'use strict';

const fs = require('fs');
const Service = require('@fabric/core/types/service');

class Disk extends Service {
  constructor (settings = {}) {
    super(settings);

    this.settings = Object.assign({
      type: 'Disk'
    }, settings);

    // this.type = 'Disk';
    this.root = settings || process.env.PWD;

    return this;
  }

  exists (path) {
    const full = [this.root, path].join('/');
    return fs.existsSync(full);
  }

  _get (path) {
    const full = [this.root, path].join('/');
    return require(full);
  }
}

module.exports = Disk;
