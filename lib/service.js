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

  this.ready();
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

Service.prototype._registerUser = function registerUser (user) {
  if (!user.id) return console.error('User must have an id.');
  let id = `/users/${user.id}`;
  this.map[id] = Object.assign({
    subscriptions: []
  }, this.map[id], user);
  this.emit('user', this.map[id]);
};

Service.prototype._registerChannel = function registerChannel (channel) {
  if (!channel.id) return console.error('Channel must have an id.');
  let id = `/channels/${channel.id}`;
  this.map[id] = Object.assign({
    members: []
  }, this.map[id], channel);
  this.emit('channel', this.map[id]);
};

Service.prototype._getSubscriptions = async function getSubscriptions (id) {
  let member = this.map[`/users/${id}`] || {};
  return member.subscriptions || null;
};

Service.prototype._getMembers = async function getMembers (id) {
  let channel = this.map[`/channels/${id}`] || {};
  return channel.members || null;
};

Service.prototype._getPresence = async function getPresence (id) {
  let member = this.map[`/users/${id}`] || {};
  return member.presence || null;
};

module.exports = Service;
