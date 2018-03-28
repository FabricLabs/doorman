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
    this.connection = new SlackSDK.RTMClient(this.config.token);
    // TODO: this event is bound twice, please fix
    this.connection.on('ready', this.ready.bind(this));
    this.connection.on('message', this.handler.bind(this));
    this.connection.start();
  }
};

Slack.prototype.ready = async function (data) {
  let self = this;
  let slack = new SlackSDK.WebClient(this.config.token);
  let result = await slack.channels.list();

  result.channels.forEach(channel => {
    self.map[`/topics/${channel.name}`] = channel.id;
  });

  self.emit('ready');
};

Slack.prototype.handler = function route (message) {
  this.emit('message', {
    actor: message.user,
    target: message.channel,
    object: message.text
  });
};

Slack.prototype.send = function send (channel, message) {
  this.connection.sendMessage(message, channel);
};

module.exports = Slack;
