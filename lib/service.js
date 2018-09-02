'use strict';

const util = require('util');
const stream = require('stream');
const pointer = require('json-pointer');

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
class Service {
  constructor (config) {
    this.config = config || {};
    this.connection = null;
    this.state = {};
  }
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

Service.prototype.disconnect = function disconnection () {
  if (this.connection.status !== 'active') return this;
  this.connection.status = 'disconnected';
  return this;
};

Service.prototype.ready = function ready () {
  this.emit('ready');
};

Service.prototype._GET = function get (path) {
  let result = this;

  try {
    result = pointer.get(this.state, path);
  } catch (E) {
    this.error(`Could not _GET() ${path}:`, E);
  }

  return result;
};

Service.prototype._PUT = function set (path, value) {
  let result = this;

  try {
    result = pointer.set(this.state, path, value);
  } catch (E) {
    this.error(`Could not _PUT() ${path}:`, E);
  }

  return result;
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
Service.prototype.send = async function send (channel, message, extra) {
  if (this.debug) console.log('[SERVICE]', 'send:', channel, message, extra);
  return this;
};

Service.prototype._getUser = function registerUser (id) {
  let path = pointer.escape(id);
  return this._GET(`/users/${path}`);
};

Service.prototype._registerUser = function registerUser (user) {
  if (!user.id) return console.error('User must have an id.');

  let id = pointer.escape(user.id);
  let path = `/users/${id}`;

  try {
    this._PUT(path, Object.assign({
      subscriptions: []
    }, user, { id }));
    this.emit('user', this._GET(path));
  } catch (E) {
    this.error('Something went wrong saving:', E);
  }

  return this;
};

Service.prototype._registerChannel = function registerChannel (channel) {
  if (!channel.id) return console.error('Channel must have an id.');

  let id = pointer.escape(channel.id);
  let path = `/channels/${id}`;

  try {
    this._PUT(path, Object.assign({
      members: []
    }, channel));
    this.emit('channel', this._GET(path));
  } catch (E) {
    console.log(`Failed to register channel "${channel.id}":`, E);
  }

  return this;
};

Service.prototype._getSubscriptions = async function getSubscriptions (id) {
  let member = this._GET(`/users/${id}`) || {};
  return member.subscriptions || null;
};

Service.prototype._getMembers = async function getMembers (id) {
  let channel = this._GET(`/channels/${id}`) || {};
  return channel.members || null;
};

Service.prototype._getPresence = async function getPresence (id) {
  let member = this._GET(`/users/${id}`) || {};
  return member.presence || null;
};

Service.prototype.error = function errorHandler (error) {
  console.error('[SERVICE:ERROR]', error);
};

Service.prototype.warn = function warningHandler (msg) {
  console.warn('[SERVICE:WARNING]', msg);
};

Service.prototype.info = function infoHandler (msg) {
  console.log('[SERVICE:INFO]', msg);
};

module.exports = Service;
