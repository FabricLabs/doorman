'use strict';

const util = require('util');
const Service = require('../lib/service');

function Local (config) {
  this.config = config || {};
  this.connection = null;
  this.map = {};
}

util.inherits(Local, Service);

Local.prototype.handler = function route (message) {
  this.emit('message', {
    actor: message.user,
    target: message.channel,
    object: message.text
  });
};

module.exports = Local;
