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

  this.bus = new stream.Transform();
};

/**
 * Default route handler for an incoming message.  Follows the Activity Streams
 * 2.0 spec: https://www.w3.org/TR/activitystreams-core/
 * @param  {Object}  message Message object.
 * @return {Boolean}         Message handled!
 */
Service.prototype.handler = function route (message) {
  this.emit('message', {
    actor: message.actor,
    target: message.target,
    object: message.object
  });
  return this;
};

/**
 * Send a message to a channel.
 * @param  {String} channel Channel name to which the message will be sent.
 * @param  {String} message Content of the message to send.
 * @return {Service}         Chainable event.
 */
Service.prototype.send = function send (channel, message, extra) {
  console.log('[SERVICE]', 'send:', channel, message, extra);
  return this;
};

module.exports = Service;
