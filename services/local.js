'use strict';

const Service = require('@fabric/core/types/service');

class Local extends Service {
  constructor (config = {}) {
    super(config);
    this.config = config || {};
    this.connection = null;
    this.map = {};
  }

  handler (message) {
    this.emit('message', {
      actor: message.user,
      target: message.channel,
      object: message.text
    });
  }
}

module.exports = Local;
