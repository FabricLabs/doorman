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

  _handlePeerError (error) {
    console.error('[SERVICE:FABRIC]', 'Error from Peer:', error);
  }

  _handlePeerMessage (msg) {
    console.log('[SERVICE:FABRIC]', 'Message from Peer:', msg);
  }

  _handlePeerWarning (warning) {
    console.warn('[SERVICE:FABRIC]', 'Warning from Peer:', warning);
  }

  async start () {
    const self = this;

    self.node.on('error', this._handlePeerError.bind(self));
    self.node.on('message', this._handlePeerMessage.bind(self));
    self.node.on('warning', this._handlePeerWarning.bind(self));

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
