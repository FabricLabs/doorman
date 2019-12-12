'use strict';

const Fabric = require('@fabric/core');
const SlackSDK = require('@slack/client');
const Service = require('../types/service');

class Slack extends Fabric.Service {
  constructor (config) {
    super(config);

    this.config = Object.assign({
      store: './data/slack'
    }, config);

    return this;
  }

  async connect () {
    this.log('Connecting...');

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
    // TODO: include bot messages in state
    if (message.subtype === 'bot_message') return;
    if (!message.user) return this.error('[SERVICE:SLACK]', `received message, but no user:`, message);
    if (!message.channel) return this.error('[SERVICE:SLACK]', `received message, but no channel:`, message);

    try {
      await this._getUser(message.user);
    } catch (E) {
      this.error('Could not get user info:', E);
    }

    try {
      await this._getChannel(message.channel);
    } catch (E) {
      this.error('Could not get channel info:', E);
    }

    this.emit('message', {
      actor: message.user,
      target: message.channel,
      object: message.text
    });
  }

  async send (channel, message) {
    this.connection.sendMessage(message, channel);
  }

  async join (channel) {
    try {
      // TODO: complain about Slack still not supporting this for bot users
      this.slack.channels.join({ channel: channel });
    } catch (E) {
      this.error(`Could not join "${channel}":`, E);
    }
  }

  async _registerUser (user) {
    await super._registerActor(user);
    this.connection.subscribePresence([user.id]);
    return this;
  }

  async _getUser (id) {
    let result = null;
    let user = null;

    try {
      result = await this.slack.users.info({ user: id });
    } catch (E) {
      this.error('Could not retrieve user;', E);
    }

    if (result && result.user) {
      await this._registerUser(result.user);
      user = this._GET(`/actors/${id}`);
    }

    return user;
  }

  async _getChannel (id) {
    let result = null;
    let channel = null;

    try {
      result = await this.slack.conversations.info({ channel: id });
    } catch (E) {
      this.error(`Could not get channel "${id}":`, E);
    }

    if (result && result.channel) {
      await this._registerChannel(result.channel);
      channel = this._GET(`/channels/${id}`);
    }

    return channel;
  }

  async _getUsers () {
    let result = await this.slack.users.list();

    if (this.config.mirror) {
      for (let i in result.members) {
        await this._registerUser(result.members[i]);
      }
    }

    return result.members;
  }

  async _getChannels () {
    let result = await this.slack.channels.list();

    if (this.config.mirror) {
      for (let i in result.channels) {
        await this._registerChannel(result.channels[i]);
      }
    }

    return result.channels;
  }

  async _getChannelMembers (id) {
    return this._getMembers(id);
  }

  async _getMembers (id) {
    let channel = null;
    let members = null;

    try {
      channel = await this._getChannel(id);
    } catch (E) {
      console.log('Could not retrieve channel:', E);
    }

    if (channel) {
      members = channel.members || [];
    }

    return members;
  }

  async _getPresence (id) {
    this.log(`getting presence:`, id);
    let presence = (await this.slack.users.getPresence({
      user: id
    })).presence;
    await this._handlePresenceChange({ user: id, presence: presence });
    return presence;
  }

  async _handleUserCreation (event) {
    return this._registerUser(event.user);
  }

  async _handleChannelCreation (event) {
    return this._registerChannel(event.channel);
  }

  async _handleChannelJoin (event) {
    this.emit('join', {
      user: event.user,
      channel: event.channel
    });
  }

  async _handleChannelPart (event) {
    this.emit('part', {
      user: event.user,
      channel: event.channel
    });
  }

  async _handlePresenceChange (event) {
    let online = (event.presence === 'active');

    await this._registerUser({ id: event.user });
    await this._updatePresence(event.user, online);

    return this;
  }

  async ready () {
    let service = this;
    let identity = await this.slack.auth.test().catch(service.error);

    service.agent = Object.assign({
      id: identity.user_id
    }, identity);

    if (service.config.mirror) {
      let users = await service._getUsers();
      let channels = await service._getChannels();

      for (let id in users) {
        await service._registerUser(users[id]);
        await service._getPresence(users[id].id);
      }

      for (let id in channels) {
        await service._registerChannel(channels[id]);
      }
    }

    return super.ready();
  }
}

module.exports = Slack;
