'use strict';

const network = require('../settings/fabric');

// Dependencies
const merge = require('lodash.merge');

// Fabric Types
const Interface = require('@fabric/core/types/interface');
const Peer = require('@fabric/core/types/peer');

class FabricService extends Interface {
  constructor (settings = {}) {
    super(settings);

    this.settings = merge({
      peers: network.peers
    }, this.settings, settings);

    this.node = new Peer(this.settings);

    return this;
  }

  async start () {
    const self = this;
    const promise = new Promise((resolve, reject) => {
      self.node.start().catch(reject).then(resolve);
    });

    return promise;
  }

  async stop () {
    const self = this;
    const promise = new Promise((resolve, reject) => {
      self.node.stop().catch(reject).then(resolve);
    });

    return promise;
  }
}

module.exports = FabricService;