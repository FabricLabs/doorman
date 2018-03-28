'use strict';

const util = require('util');
const matrix = require('matrix-js-sdk');
const Service = require('../lib/service');

function Matrix (config) {
  this.config = config || {};
  this.connection = null;
  this.map = {};
}

util.inherits(Matrix, Service);

Matrix.prototype.connect = function initialize () {
  let self = this;

  if (this.config.token) {
    this.connection = matrix.createClient({
      accessToken: this.config.token,
      baseUrl: this.config.authority,
      userId: this.config.user
    });

    this.connection.on('event', this.handler.bind(this));
    this.connection.on('RoomMember.membership', function (event, member) {
      if (member.membership === 'invite' && member.userId === self.config.user) {
        self.connection.joinRoom(member.roomId);
      }
    });

    this.connection.startClient();
  }
};

Matrix.prototype.handler = function route (message) {
  if (this.config.debug) {
    console.log('received message:', message);
    console.log('message type:', message.getType());
  }

  if (message.getType() === 'm.room.message') {
    this.emit('message', {
      actor: message.event.sender,
      target: message.event.room_id,
      object: message.event.content.body
    });
  }
};

Matrix.prototype.send = function send (channel, message) {
  this.connection.sendMessage(channel, {
    msgtype: 'text',
    body: message
  });
};

module.exports = Matrix;
