'use strict';

const Component = require('@fabric/http/types/component');
const Site = require('@fabric/http/types/site');

class Interface extends Site {
  constructor (settings = {}) {
    super(settings);

    this.settings = Object.assign({
      handle: 'doorman-interface',
      state: {}
    }, settings);

    this._state = {
      content: this.settings.state
    };

    return this;
  }

  _getHTML () {
    return `
      <${this.settings.handle}>
        <fabric-header>
          <h1><code>@fabric/doorman</code></h1>
        </fabric-header>
        <fabric-card class="ui card">
          <fabric-card-content class="content">
            <p>Waiting...</p>
          </fabric-card-content>
        </fabric-card>
      </${this.settings.handle}>
    `;
  }
}

module.exports = Interface;
