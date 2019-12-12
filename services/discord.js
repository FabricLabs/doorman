'use strict';

const Fabric = require('@fabric/core');

const DiscordJS = require('discord.js');
const Service = require('../type/service');

class Discord extends Fabric.Service {
  constructor (config) {
    super(config);
    this.config = Object.assign({
      store: './data/discord'
    }, config);
  }

  connect () {
    if (this.config.token) {
      this.connection = new DiscordJS.Client();
      this.connection.login(this.config.token);
      this.connection.on('ready', this.ready.bind(this));
      this.connection.on('message', this.handler.bind(this));
    }
  }

  handler (message) {
    this.emit('message', {
      actor: message.author.id,
      target: message.channel.id,
      object: message.content
    });
  }

  send (channel, message) {
    this.connection.channels.get(channel).send(message);
  }
}

module.exports = Discord;
