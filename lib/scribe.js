'use strict';

const EventEmitter = require('events').EventEmitter;

class Scribe extends EventEmitter {
  /**
   * The "Scribe" is a simple tag-based recordkeeper.
   * @param       {Object} config General configuration object.
   * @param       {String} config.namespace Specify the Scribe's "class".  Always used as the first tag.
   * @constructor
   */
  constructor (config) {
    super(config);
    this.config = config;
    this.stack = [];
  }

  /**
   * Use an existing Scribe instance as a parent.
   * @param  {Scribe} scribe Instance of Scribe to use as parent.
   * @return {Scribe}        The configured instance of the Scribe.
   */
  inherits (scribe) {
    this.stack.push(scribe.config.namespace);
    return this;
  }

  /**
   * Use Scribe to emit a log event to the console, using `console.log`
   * @param  {Mixed} inputs Sequential list of messages to log.
   * @return {null}        No-op event.
   */
  log (...inputs) {
    inputs.unshift(`[${this.constructor.name.toUpperCase()}]`);
    this.emit('info', this.stack.concat(inputs));
    console.log.apply(null, this.stack.concat(inputs));
  }

  error (...inputs) {
    inputs.unshift(`[${this.constructor.name.toUpperCase()}]`);
    console.error.apply(null, this.stack.concat(inputs));
  }

  warn (...inputs) {
    inputs.unshift(`[${this.constructor.name.toUpperCase()}]`);
    console.warn.apply(null, this.stack.concat(inputs));
  }
}

module.exports = Scribe;
