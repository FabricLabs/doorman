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
    this.connection.on('ready', this.ready);
    this.connection.on('message', this.handler.bind(this));
    this.connection.start();
  }
};

Slack.prototype.ready = function (data) {
  console.log('le data:', data);
};

Slack.prototype.handler = function route (message) {
  this.emit('message', message.text);
};

Slack.prototype.send = function send (channel, message) {
  console.log('[SLACK]', 'send:', channel, message);
  this.connection.sendMessage(message, this.map[channel]);
};

module.exports = Slack;
