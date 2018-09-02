'use strict';

const matrix = require('matrix-js-sdk');
const markdown = require('marked');
const pointer = require('json-pointer');

const Service = require('../lib/service');

class Matrix extends Service {
  constructor (config) {
    super(config);
    this.config = Object.assign({}, config);
    this.connection = null;
    this.state = { users: [] };
    this.self = { id: this.config.user };
  }
}

Matrix.prototype.connect = function initialize () {
  console.log('[MATRIX]', 'connecting...');

  if (this.config.token) {
    this.connection = matrix.createClient({
      accessToken: this.config.token,
      baseUrl: this.config.authority,
      userId: this.config.user
    });

    // TODO: lift switch/case statements from handler to local bindings
    this.connection.on('info', this.info.bind(this));
    this.connection.on('error', this.error.bind(this));
    this.connection.on('sync', this.sync.bind(this));

    this.connection.startClient();
  }

  return this;
};

Matrix.prototype.disconnect = function disconnect () {
  if (!this.connection) return this.warn(`Attempting to disconnect Matrix, but no Matrix connection exists.`);
  this.info('matrix disconnecting...');
  this.connection.stopClient();
  return this;
};

Matrix.prototype.ready = async function () {
  let self = this;

  if (self.config.mirror) {
    self._getUsers().then(function (users) {
      for (let id in users) {
        self._registerUser(users[id]);
      }
    });

    self._getChannels().then(function (channels) {
      for (let id in channels) {
        self._registerChannel(channels[id]);
      }
    });

    await self._getPresences().then(function (presences) {
      console.log('got presences:', presences);
    });
  }

  this.connection.on('event', this.handler.bind(this));
  this.connection.on('RoomMember.membership', this._handleMembershipMessage);

  console.log('[MATRIX]', 'ready!');
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

Matrix.prototype.send = async function send (channel, message) {
  if (!this.connection) {
    this.error(`Attempted to send message, but no connection.  Target: ${channel} Message: ${message}`);
    return this;
  }
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
    this._registerChannel(result[i]);
  }

  return result;
};

Matrix.prototype._getUsers = async function getUsers () {
  let result = await this.connection.getUsers().map(user => {
    user.id = user.userId;
    return user;
  });

  for (let i in result) {
    this._registerUser(result[i]);
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
    this._registerUser(member);
  }
  return Object.keys(room.currentState.members);
};

Matrix.prototype._registerUser = function registerUser (user) {
  if (!user.id) return console.error('User must have an id.');

  let id = pointer.escape(user.id);
  let path = `/users/${id}`;

  try {
    this._PUT(path, Object.assign({
      online: user.currentlyActive || false,
      name: user.displayName || user.id
    }, user, { id }));
    this.emit('user', this._GET(path));
  } catch (E) {
    this.error('Something went wrong saving:', E);
  }

  return this;
};

Matrix.prototype._presence_change = async function handlePresence (message) {
  let id = pointer.escape(message.event.sender);
  let path = `/users/${id}`;

  try {
    this._GET(path);
  } catch (E) {
    await this._registerUser({ id });
  }

  try {
    this._PUT(`${path}/online`, (message.event.content.presence === 'online'));
    this._PUT(`${path}/presence`, message.event.content.presence);
  } catch (E) {
    console.log(`Error updating presence for user "${id}":`, E);
  }
};

Matrix.prototype._handleMembershipMessage = function (event, member, old) {
  // if the message is an invitation, and it is addressed to us, join the room
  if (member.membership === 'invite' && member.userId === this.config.user) {
    this.connection.joinRoom(member.roomId);
  }
};

Matrix.prototype._member_joined_channel = function handleJoin (message) {
  if (message.event.content.membership !== 'join') return;
  this.emit('join', {
    user: message.event.sender,
    channel: message.event.room_id
  });
};

module.exports = Matrix;
