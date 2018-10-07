'use strict';

const Fabric = require('@fabric/core');

const matrix = require('matrix-js-sdk');
const pointer = require('json-pointer');

const markdown = require('marked');

class Matrix extends Fabric.Service {
  constructor (config) {
    super(config);

    this.config = Object.assign({
      store: './data/matrix'
    }, config);

    this.agent = {
      id: this.config.user,
      type: 'Agent'
    };

    return this;
  }

  info (msg) {
    console.log('[MATRIX:INFO]', msg);
  }

  sync (state, previous, data) {
    console.log('[MATRIX:SYNC]', state);
    switch (state) {
      case 'PREPARED':
        this.ready();
        break;
    }
  }

  async connect () {
    this.log('Connecting...');

    try {
      let prior = await this.store.get('/');
      this.state = JSON.parse(prior);
    } catch (E) {
      console.error('Could not restore state:', E);
    }

    if (this.config.token) {
      this.connection = matrix.createClient({
        accessToken: this.config.token,
        baseUrl: this.config.authority,
        userId: this.config.user
      });

      // TODO: lift switch/case statements from handler to local bindings
      // this.connection.on('ready', this.ready.bind(this));
      this.connection.on('info', this.info.bind(this));
      this.connection.on('error', this.error.bind(this));
      this.connection.on('sync', this.sync.bind(this));

      this.connection.startClient();
    }

    if (this.config.debug) {
      let self = this;
      setInterval(function () {
        console.log(self.state);
        console.log('^^^^^^^^^^ is the [DOORMAN:MATRIX] state');
      }, 10000);
    }

    return this;
  }

  async disconnect () {
    if (!this.connection) return this.warn(`Attempting to disconnect Matrix, but no Matrix connection exists.`);
    this.info('matrix disconnecting...');
    this.connection.stopClient();
    return this;
  }

  async ready () {
    let self = this;

    if (self.config.mirror) {
      await self._getUsers();
      await self._getChannels();
      await self._getPresences().then(function (presences) {
        console.log('got presences:', presences);
      });
    }

    this.connection.on('event', this.handler.bind(this));
    this.connection.on('Room.timeline', function (event, room) {
      // console.log('shenanigans!', event, room);
    });
    this.connection.on('RoomMember.membership', this._handleMembershipMessage.bind(this));

    console.log('[MATRIX]', 'ready!');

    return super.ready();
  }

  async handler (message) {
    if (this.config.debug) {
      console.log('received message:', message);
      console.log('message type:', message.getType());
    }

    if (message.event.sender === this.agent.id) return;
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
        this._handleMembershipChange(message);
        break;
      case 'm.presence':
        this._handlePresenceChange(message);
        break;
    }
  }

  async send (channel, message) {
    if (!this.connection) return this.error(`Attempted to send message, but no connection.  Target: ${channel} Message: ${message}`);
    if (!channel) return this.error(`Parameter "channel" is required.`);
    if (!message) return this.error(`Parameter "message" is required.`);

    let html = markdown(message);

    // TODO: complain to `matrix-js-sdk` about duplicate params
    this.connection.sendHtmlMessage(channel, message, html);

    return this;
  }

  async whisper (target, message) {
    if (!this.connection) return this.error(`Attempted to whisper, but no connection.  Target: ${target} Message: ${message}`);
    if (!target) return this.error(`Parameter "target" is required.`);
    if (!message) return this.error(`Parameter "message" is required.`);

    let user = await this._getUser(target);

    if (!user) return this.error(`Whisper failed: could not retrieve user "${target}" from Matrix.`);

    let id = pointer.escape(user.id);
    let path = `/users/${id}`;

    if (!user.whispers) {
      // TODO: implement _createChannel
      let room = await this.connection.createRoom({
        preset: 'trusted_private_chat',
        invite: [target],
        is_direct: true
      });

      try {
        user.whispers = room.room_id;
        this._PUT(`${path}/whispers`, user.whispers);
      } catch (E) {
        console.log(`Error setting whisper channel for user "${user.id}":`, E);
      }
    }

    let whisper = await this._getChannel(user.whispers);

    if (!whisper.members[target]) {
      this.invite(target, user.whispers);
    }

    return this.send(user.whispers, message);
  }

  async invite (user, channel) {
    return this.connection.invite(channel, user);
  }

  async _getChannels () {
    if (!this.connection) return this.warn(`Attempting to _getChannels(), but no Matrix connection exists.`);

    let result = await this.connection.getRooms().map(function (room) {
      room.id = room.roomId;
      return room;
    });

    for (let i in result) {
      let channel = Object.assign({
        id: result[i].roomId,
        name: result[i].name,
        members: result[i].members || []
      });
      await this._registerChannel(channel);
    }

    return result;
  }

  async _getChannel (id) {
    if (!this.connection) return this.warn(`Attempting to _getChannel(), but no Matrix connection exists.`);

    let room = await this.connection.getRoom(id);

    if (!room) return null;

    let channel = Object.assign({
      id: room.roomId,
      name: room.name,
      members: room.currentState.members || []
    }/*, room */);

    await this._registerChannel(channel);

    return channel;
  }

  async _getUsers () {
    if (!this.connection) return this.warn(`Attempting to _getUsers(), but no Matrix connection exists.`);

    let result = await this.connection.getUsers().map(user => {
      user.id = user.userId;
      return user;
    });

    for (let i in result) {
      await this._registerUser(result[i]);
    }

    return result;
  }

  async _getUser (id) {
    if (!this.connection) return this.warn(`Attempting to _getUser(), but no Matrix connection exists.`);

    let target = pointer.escape(id);
    let path = `/users/${target}`;
    let result = await this.connection.getUser(id);
    let local = await this._GET(path);

    if (!result) return false;

    let user = Object.assign({
      id: result.userId,
      name: result.displayName,
      presence: result.presence
    }, local, result);

    await this._registerUser(user);

    return user;
  }

  async _getPresences () {
    if (!this.connection) return this.warn(`Attempting to _getPresences(), but no Matrix connection exists.`);
    let result = await this.connection.getPresenceList().catch(this.error);
    return result;
  }

  async _getPresence (id) {
    if (!this.connection) return this.warn(`Attempting to _getPresence(), but no Matrix connection exists.`);
    let member = await this._getUser(id).catch(this.error);
    return member.presence || null;
  }

  async _getMembers (id) {
    let room = await this._getChannel(id);

    if (!room) return null;

    for (let i in room.members) {
      let member = Object.assign({
        id: i
      }, room.members[i]);
      await this._registerUser(member);
    }

    return Object.keys(room.members);
  }

  async _registerUser (user) {
    if (!user.id) return console.error('User must have an id.');

    let target = pointer.escape(user.id);
    let path = `/users/${target}`;
    let known = this._GET(path);
    let data = Object.assign({
      id: user.id,
      name: user.displayName || user.id,
      online: user.currentlyActive || false,
      presence: user.presence
    }, known);

    try {
      this._PUT(path, data);
      this.emit('user', this._GET(path));
    } catch (E) {
      this.error('Something went wrong saving:', E);
    }

    return this;
  }

  async _handlePresenceChange (message) {
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
  }

  async _handleMembershipMessage (event, member, old) {
    // if the message is an invitation, and it is addressed to us, join the room
    if (member.membership === 'invite' && member.userId === this.config.user) {
      this.connection.joinRoom(member.roomId);
    }
  }

  async _handleMembershipChange (message) {
    switch (message.event.content.membership) {
      case 'join':
        this.emit('join', {
          user: message.event.sender,
          channel: message.event.room_id
        });
        break;
      case 'leave':
        this.emit('part', {
          user: message.event.sender,
          channel: message.event.room_id
        });
        break;
    }
  }
}

module.exports = Matrix;
