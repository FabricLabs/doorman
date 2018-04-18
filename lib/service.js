'use strict';

const util = require('util');
const stream = require('stream');

/**
 * The "Service" is a simple model for messaging systems in general.  In most
 * cases, you'll use this model as a prototype for implementing a new protocol
 * for Doorman, the general-purpose bot framework.
 *
 * To implement a Service, you will typically need to implement the methods on
 * this prototype.  In general, `connect` and `send` are the highest-order
 * methods, and by default the `fabric` property will serve as a readable stream
 * that broadcasts all inserted data.  You should follow this pattern when
 * developing Services.
 *
 * @param       {Object} config Configuration for this service.
 * @property map The "map" is a hashtable of "key" => "value" pairs.
 * @constructor
 * @description Basic API for connecting Doorman to a new service provider.
 */
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

  this.fabric = new stream.Transform({
    transform (chunk, encoding, callback) {
      callback(null, chunk);
    }
  });
};

Service.prototype.ready = function ready () {
  this.emit('ready');
};

/**
 * Default route handler for an incoming message.  Follows the Activity Streams
 * 2.0 spec: https://www.w3.org/TR/activitystreams-core/
 * @param  {Object}  message Message object.
 * @return {Service}         Chainable method.
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
 * @return {Service}        Chainable method.
 */
Service.prototype.send = function send (channel, message, extra) {
  console.log('[SERVICE]', 'send:', channel, message, extra);
  return this;
};

module.exports = Service;
