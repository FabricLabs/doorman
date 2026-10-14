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

  /**
   * Peer emits P2P chat as `chat` (`{ actor, object, target }` or a raw
   * string body). Normalize into the Doorman adapter `message` shape.
   * @param {Object|String} msg
   */
  _handlePeerMessage (msg) {
    const actor = (msg && msg.actor && (msg.actor.id || msg.actor)) || 'unknown';
    const object = (msg && msg.object && (msg.object.content || msg.object)) || msg;
    this.emit('message', {
      actor: String(actor),
      target: (msg && msg.target && (msg.target.id || msg.target)) || 'global',
      object: typeof object === 'string' ? object : JSON.stringify(object)
    });
  }

  _handlePeerConnection (peer) {
    const id = peer && (peer.id || peer.pubkey || peer.address);
    if (!id) return;
    this.emit('presence', { user: String(id), status: 'online', channel: 'global' });
  }

  _handlePeerDisconnection (peer) {
    const id = peer && (peer.id || peer.pubkey || peer.address);
    if (!id) return;
    this.emit('presence', { user: String(id), status: 'offline', channel: 'global' });
  }

  _handlePeerWarning (warning) {
    console.warn('[SERVICE:FABRIC]', 'Warning from Peer:', warning);
  }

  async connect () {
    return this.start();
  }

  async disconnect () {
    return this.stop();
  }

  async start () {
    const self = this;

    if (!self._peerListeners) {
      self._peerListeners = [
        ['error', this._handlePeerError.bind(self)],
        ['chat', this._handlePeerMessage.bind(self)],
        ['peer', this._handlePeerConnection.bind(self)],
        ['connections:close', this._handlePeerDisconnection.bind(self)],
        ['warning', this._handlePeerWarning.bind(self)]
      ];
      for (const [event, handler] of self._peerListeners) self.node.on(event, handler);
    }

    const promise = new Promise((resolve, reject) => {
      self.node.start().catch(reject).then(resolve);
    });

    return promise;
  }

  async stop () {
    const self = this;
    if (self._peerListeners) {
      for (const [event, handler] of self._peerListeners) self.node.removeListener(event, handler);
      self._peerListeners = null;
    }
    const promise = new Promise((resolve, reject) => {
      self.node.stop().catch(reject).then(resolve);
    });

    return promise;
  }
}

module.exports = FabricService;
