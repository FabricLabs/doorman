'use strict';

const util = require('util');

/**
 * The "Scribe" is a simple tag-based recordkeeper.
 * @param       {Object} config General configuration object.
 * @param       {String} config.namespace Specify the Scribe's "class".  Always used as the first tag.
 * @constructor
 */
function Scribe (config) {
  this.type = 'Scribe';
  this.config = config || { namespace: 'scribe' };
  this.stack = [];
}

util.inherits(Scribe, require('events').EventEmitter);

/**
 * Use an existing Scribe instance as a parent.
 * @param  {Scribe} scribe Instance of Scribe to use as parent.
 * @return {Scribe}        The configured instance of the Scribe.
 */
Scribe.prototype.inherits = function inherit (scribe) {
  this.stack.push(scribe.config.namespace);
  return this;
};

/**
 * Use Scribe to emit a log event to the console, using `console.log`
 * @param  {Mixed} inputs Sequential list of messages to log.
 * @return {null}        No-op event.
 */
Scribe.prototype.log = function append (...inputs) {
  inputs.unshift(['[', this.config.namespace.toUpperCase(), ']'].join(''));
  console.log.apply(null, this.stack.concat(inputs));
};

Scribe.prototype.throw = function exit (...inputs) {
  inputs.unshift(['[', this.config.namespace.toUpperCase(), ']'].join(''));
  console.error.apply(null, this.stack.concat(inputs));
};

Scribe.prototype.warn = function exit (...inputs) {
  inputs.unshift(['[', this.config.namespace.toUpperCase(), ']'].join(''));
  console.warn.apply(null, this.stack.concat(inputs));
};

module.exports = Scribe;
