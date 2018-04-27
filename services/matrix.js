'use strict';

const util = require('util');
const matrix = require('matrix-js-sdk');
const markdown = require('marked');
const Service = require('../lib/service');

function Matrix (config) {
  this.config = config || {};
  this.connection = null;
  this.map = {};
  this.self = { id: config.user };
}

util.inherits(Matrix, Service);

Matrix.prototype.connect = function initialize () {
  console.log('[MATRIX]', 'connecting... config:', this.config);

  if (this.config.token) {
    this.connection = matrix.createClient({
      accessToken: this.config.token,
      baseUrl: this.config.authority,
      userId: this.config.user
    });

    // TODO: lift switch/case statements from handler to local bindings
    this.connection.on('error', this.error.bind(this));
    this.connection.on('sync', this.sync.bind(this));

    this.connection.startClient();
  }
};

Matrix.prototype.ready = async function () {
  let self = this;
  let users = await self._getUsers();
  let channels = await self._getChannels();
  let presences = await self._getPresences();

  for (let id in users) {
    self._registerUser(users[id]);
  }

  for (let id in channels) {
    self._registerChannel(channels[id]);
  }

  console.log('[MATRIX]', 'ready!');

  this.connection.on('event', this.handler.bind(this));
  this.connection.on('RoomMember.membership', function (event, member, old) {
    if (member.membership === 'invite' && member.userId === self.config.user) {
      self.connection.joinRoom(member.roomId);
    }
  });

  self.emit('ready');
};

Matrix.prototype.sync = function handleSync (state, previous, data) {
  switch (state) {
    case 'PREPARED':
      this.ready();
      break;
  }
};

Matrix.prototype.handler = function route (message) {
  if (this.config.debug) {
    console.log('received message:', message);
    console.log('message type:', message.getType());
  }

  if (message.event.sender === this.self.id) return;
  switch (message.getType()) {
    case 'm.fully_read':
      this.ready();
      break;
    case 'm.room.message':
      this.emit('message', {
        actor: message.event.sender,
        target: message.event.room_id,
        object: message.event.content.body
      });
      break;
    case 'm.room.member':
      this._member_joined_channel(message);
      break;
    case 'm.presence':
      this._presence_change(message);
      break;
  }
};

Matrix.prototype.send = function send (channel, message) {
  let html = markdown(message);
  // TODO: complain to `matrix-js-sdk` about duplicate params
  this.connection.sendHtmlMessage(channel, message, html);
};

Matrix.prototype._getChannels = async function getChannels () {
  let result = await this.connection.getRooms().map(function (room) {
    room.id = room.roomId;
    return room;
  });

  for (let i in result) {
    await this._registerChannel(result[i]);
  }

  return result;
};

Matrix.prototype._getUsers = async function getUsers () {
  let result = await this.connection.getUsers().map(user => {
    user.id = user.userId;
    return user;
  });

  for (let i in result) {
    await this._registerUser(result[i]);
  }

  return result;
};

Matrix.prototype._getUser = async function getUser (id) {
  let result = await this.connection.getUser(id);
  let user = Object.assign({
    id: result.userId,
    name: result.displayName,
    presence: result.presence
  }, result);
  return user;
};

Matrix.prototype._getPresences = async function getPresences () {
  let result = await this.connection.getPresenceList();
  console.log('getPresences() got:', result);
  return result;
};

Matrix.prototype._getMembers = async function getMembers (id) {
  let room = await this.connection.getRoom(id);
  if (!room) return null;
  for (let i in room.currentState.members) {
    let member = Object.assign({
      id: i
    }, room.currentState.members[i]);
    await this._registerUser(member);
  }
  return Object.keys(room.currentState.members);
};

Matrix.prototype._registerChannel = function registerChannel (channel) {
  if (!channel.id) return console.error('Channel must have an id.');
  let id = `/channels/${channel.id}`;
  this.map[id] = Object.assign({}, this.map[id], channel);
  this.emit('channel', this.map[id]);
};

Matrix.prototype._registerUser = function registerUser (user) {
  if (!user.id) return console.error('User must have an id.');
  let id = `/users/${user.id}`;
  this.map[id] = Object.assign({
    online: user.currentlyActive || false,
    name: user.displayName || user.id
  }, this.map[id], user);
  this.emit('user', this.map[id]);
};

Matrix.prototype._presence_change = function handlePresence (message) {
  let id = `/users/${message.event.sender}`;
  if (!this.map[id]) this._registerUser({ id: message.event.sender });
  this.map[id].online = (message.event.content.presence === 'online');
  this.map[id].presence = message.event.content.presence;
};

Matrix.prototype._member_joined_channel = function handleJoin (message) {
  if (message.event.content.membership !== 'join') return;
  this.emit('join', {
    user: message.event.sender,
    channel: message.event.room_id
  });
};

Matrix.prototype.error = function errorHandler (error) {
  console.error('[MATRIX]', error);
};

module.exports = Matrix;
