'use strict';

const util = require('util');
const stream = require('stream');

function Service (config) {
  this.config = config || {};
  this.connection = null;
  this.map = {};
}

util.inherits(Service, require('events').EventEmitter);

Service.prototype.connect = function initialize () {
  // TODO: implement a basic Stream
  this.connection = {
    status: 'active'
  };
};

Service.prototype.handler = function route (message) {
  this.emit('message', message.text);
};

Service.prototype.send = function send (channel, message) {
  console.log('[SERVICE]', 'send:', channel, message);
};

module.exports = Service;
