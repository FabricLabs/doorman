'use strict';

const util = require('util');
const SlackSDK = require('@slack/client');
const Service = require('../lib/service');

function Slack (config) {
  this.config = config || {};
  this.connection = null;
  this.map = {};
}

util.inherits(Slack, Service);

Slack.prototype.connect = function initialize () {
  if (this.config.token) {
    this.slack = new SlackSDK.WebClient(this.config.token);
    this.connection = new SlackSDK.RTMClient(this.config.token);
    this.connection.on('ready', this.ready.bind(this));
    this.connection.on('message', this.handler.bind(this));
    this.connection.on('team_join', this._team_join.bind(this));
    this.connection.on('channel_created', this._channel_created.bind(this));
    this.connection.on('presence_change', this._presence_change.bind(this));
    this.connection.on('member_joined_channel', this._member_joined_channel.bind(this));
    this.connection.on('member_left_channel', this._member_left_channel.bind(this));
    this.connection.start({
      batch_presence_aware: true
    });
  }
};

Slack.prototype.ready = async function (data) {
  let self = this;

  let users = await self._getUsers();
  let channels = await self._getChannels();

  for (let id in users) {
    self._registerUser(users[id]);
    self._getPresence(users[id].id);
  }

  for (let id in channels) {
    self._registerChannel(channels[id]);
  }

  self.emit('ready');
};

Slack.prototype.handler = function route (message) {
  let user = this.map[`/users/${message.user}`];

  if (!user) return console.error('[SERVICE:SLACK]', `received message, but user did not exist in map: ${JSON.stringify(message)}`);
  if (!message.user) return console.error('[SERVICE:SLACK]', `received message, but no user: ${JSON.stringify(message)}`);
  if (user.is_bot) return;
  if (message.subtype === 'bot_message') return;
  this.emit('message', {
    actor: message.user,
    target: message.channel,
    object: message.text
  });
};

Slack.prototype.join = function join (channel) {
  // TODO: complain about Slack still not supporting this for bot users
  this.connection.joinRoom(channel);
};

Slack.prototype.send = function send (channel, message) {
  this.connection.sendMessage(message, channel);
};

Slack.prototype._getChannels = async function getChannels () {
  let result = await this.slack.channels.list();
  return result.channels;
};

Slack.prototype._getUsers = async function getUsers () {
  let result = await this.slack.users.list();
  return result.members;
};

Slack.prototype._getSubscriptions = async function getSubscriptions (id) {
  return this._getChannelMembers(id);
};

Slack.prototype._getPresence = async function getPresence (id) {
  let path = `/users/${id}`;
  this.map[path].presence = (await this.slack.users.getPresence({
    user: id
  })).presence;
  this._presence_change({ user: id, presence: this.map[path].presence });
  return this.map[path].presence;
};

Slack.prototype._getChannelMembers = async function getChannelMembers (id) {
  let result = await this.slack.channels.info({
    channel: id
  });
  return result.channel.members;
};

Slack.prototype._registerUser = function registerUser (user) {
  if (!user.id) return console.error('User must have an id.');
  let id = `/users/${user.id}`;
  this.map[id] = Object.assign({
    subscriptions: []
  }, this.map[id], user);
  this.emit('user', this.map[id]);
  this.connection.subscribePresence([id]);
};

Slack.prototype._registerChannel = function registerChannel (channel) {
  if (!channel.id) return console.error('Channel must have an id.');
  let id = `/channels/${channel.id}`;
  this.map[id] = Object.assign({}, this.map[id], channel);
  this.emit('channel', this.map[id]);
};

Slack.prototype._team_join = function handleJoin (event) {
  this._registerUser(event.user);
};

Slack.prototype._channel_created = function handleChannel (event) {
  this._registerChannel(event.channel);
};

Slack.prototype._presence_change = function handlePresence (event) {
  let id = `/users/${event.user}`;

  if (!this.map[id]) this._registerUser({ id: event.user });

  this.map[id].online = (event.presence === 'active');
  this.map[id].presence = event.presence;

  // TODO: generate this from Fabric
  this.emit('patch', {
    op: 'replace',
    path: [id, 'online'].join('/'),
    value: this.map[id].online
  });
};

Slack.prototype._member_joined_channel = function handleJoin (event) {
  let id = `/users/${event.user}`;
  let channelID = `/channels/${event.channel}`;

  this.emit('patch', {
    op: 'add',
    path: [id, 'subscriptions', 0].join('/'),
    value: event.channel
  });

  this.emit('patch', {
    op: 'add',
    path: [channelID, 'members', 0].join('/'),
    value: event.channel
  });

  this.emit('join', {
    user: event.user,
    channel: event.channel
  });
};

Slack.prototype._member_left_channel = function handlePart (event) {
  let id = `/users/${event.user}`;
  for (let index in this.map[id].channels) {
    if (this.map[id].channels[index] === event.channel) {
      this.emit('patch', {
        op: 'remove',
        path: [id, 'channels', index].join('/')
      });
    }
  }

  this.emit('part', {
    user: event.user,
    channel: event.channel
  });
};

module.exports = Slack;
