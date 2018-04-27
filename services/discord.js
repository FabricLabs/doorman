'use strict';

const util = require('util');
const DiscordJS = require('discord.js');
const Service = require('../lib/service');

function Discord (config) {
  this.config = config || {};
  this.connection = null;
  this.map = {};
}

util.inherits(Discord, Service);

Discord.prototype.connect = function initialize () {
  if (this.config.token) {
    this.connection = new DiscordJS.Client();
    this.connection.login(this.config.token);
    this.connection.on('ready', this.ready.bind(this));
    this.connection.on('message', this.handler.bind(this));
  }
};

Discord.prototype.handler = function route (message) {
  this.emit('message', {
    actor: message.author.id,
    target: message.channel.id,
    object: message.content
  });
};

Discord.prototype.send = function send (channel, message) {
  this.connection.channels.get(channel).send(message);
};

module.exports = Discord;
