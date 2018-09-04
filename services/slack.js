'use strict';

const pointer = require('json-pointer');
const SlackSDK = require('@slack/client');
const Service = require('../lib/service');

class Slack extends Service {
  constructor (config) {
    super(config);
    this.config = Object.assign({
      store: './data/slack'
    }, config);
  }

  connect () {
    super.connect();

    this.log('[SLACK]', 'connecting... config:', this.config);

    if (this.config.token) {
      this.slack = new SlackSDK.WebClient(this.config.token);
      this.connection = new SlackSDK.RTMClient(this.config.token);
      this.connection.on('ready', this.ready.bind(this));
      this.connection.on('message', this.handler.bind(this));
      this.connection.on('team_join', this._handleUserCreation.bind(this));
      this.connection.on('channel_created', this._handleChannelCreation.bind(this));
      this.connection.on('presence_change', this._handlePresenceChange.bind(this));
      this.connection.on('member_joined_channel', this._handleChannelJoin.bind(this));
      this.connection.on('member_left_channel', this._handleChannelPart.bind(this));
      this.connection.start({
        batch_presence_aware: true
      });
    }
  }

  async handler (message) {
    this.log('[SERVICE:SLACK]', 'message handler handling:', message);

    // TODO: include bot messages in state
    if (message.subtype === 'bot_message') return;

    let target = pointer.escape(message.user);
    let user = await this._getUser(`/users/${target}`);

    if (!user) return this.error('[SERVICE:SLACK]', `received message, but user did not exist in map: ${JSON.stringify(message)}`);
    if (!message.user) return this.error('[SERVICE:SLACK]', `received message, but no user: ${JSON.stringify(message)}`);

    this.emit('message', {
      actor: message.user,
      target: message.channel,
      object: message.text
    });
  }

  async ready () {
    let self = this;

    if (self.config.mirror) {
      let users = await self._getUsers();
      let channels = await self._getChannels();

      for (let id in users) {
        await self._registerUser(users[id]);
        await self._getPresence(users[id].id);
      }

      for (let id in channels) {
        await self._registerChannel(channels[id]);
      }
    }

    self.emit('ready');
  }

  async _registerUser (user) {
    await super._registerUser(user);
    this.connection.subscribePresence([user.id]);
    return this;
  }
}

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
  let presence = (await this.slack.users.getPresence({
    user: id
  })).presence;
  this._handlePresenceChange({ user: id, presence: presence });
  return presence;
};

Slack.prototype._getChannelMembers = async function getChannelMembers (id) {
  let result = await this.slack.channels.info({
    channel: id
  });
  return result.channel.members;
};

Slack.prototype._handleUserCreation = function handleJoin (event) {
  this._registerUser(event.user);
};

Slack.prototype._handleChannelCreation = function handleChannel (event) {
  this._registerChannel(event.channel);
};

Slack.prototype._handlePresenceChange = async function handlePresence (event) {
  let online = (event.presence === 'active');
  let target = pointer.escape(event.user);
  let path = `/users/${target}`;

  this.log('presence change:', event);

  try {
    await this._GET(path);
  } catch (E) {
    await this._registerUser({ id: event.user });
  }

  // TODO: generate this from Fabric
  this.emit('patch', {
    op: 'replace',
    path: [path, 'online'].join('/'),
    value: online
  });
};

Slack.prototype._handleChannelJoin = function handleJoin (event) {
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

Slack.prototype._handleChannelPart = async function handlePart (event) {
  this.emit('part', {
    user: event.user,
    channel: event.channel
  });
};

module.exports = Slack;
