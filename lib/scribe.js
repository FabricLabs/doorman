'use strict';

function Scribe (config) {
  this.type = 'Scribe';
  this.config = config || { namespace: 'scribe' };
}

Scribe.prototype.log = function append (...inputs) {
  inputs.unshift(['[', this.config.namespace.toUpperCase(), ']'].join(''));
  console.log.apply(null, inputs);
};

Scribe.prototype.throw = function exit (...inputs) {
  inputs.unshift(['[', this.config.namespace.toUpperCase(), ']'].join(''));
  console.error.apply(null, inputs);
};

Scribe.prototype.warn = function exit (...inputs) {
  inputs.unshift(['[', this.config.namespace.toUpperCase(), ']'].join(''));
  console.warn.apply(null, inputs);
};

module.exports = Scribe;
