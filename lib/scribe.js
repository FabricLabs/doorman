'use strict';

function Scribe (config) {
  this.type = 'Scribe';
  this.config = config || { namespace: 'scribe' };
  this.stack = [];
}

Scribe.prototype.inherits = function inherit (scribe) {
  this.stack.push(scribe.config.namespace);
};

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
