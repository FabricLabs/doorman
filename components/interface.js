'use strict';

const Actor = require('@fabric/core/types/actor');

/**
 * HTML shell for the Doorman console. `scripts/build.js` writes
 * `_getHTML()` to `assets/index.html`; the React application
 * (`components/DoormanInterface.js`, bundled by webpack into
 * `assets/bundles/browser.min.js`) mounts into `#doorman`.
 *
 * A plain Actor (not `@fabric/http` `Element`, which needs a DOM) so the
 * shell renders from Node at build time.
 */
class Interface extends Actor {
  constructor (settings = {}) {
    super(settings);

    this.settings = Object.assign({
      handle: 'doorman-interface',
      title: '@fabric/doorman',
      bundle: '/bundles/browser.min.js',
      state: {}
    }, settings);

    this._state = {
      content: this.settings.state
    };

    return this;
  }

  _getHTML () {
    const title = String(this.settings.title || '@fabric/doorman').replace(/[<>&]/g, '');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <link rel="icon" href="/favicon.ico" />
  <link rel="stylesheet" type="text/css" href="/semantic.min.css" />
  <style>
    body { background: #f4f4f6; }
    #doorman { padding: 2em 0; }
    .doorman-mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
    .doorman-report pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <${this.settings.handle} id="doorman">
    <div class="ui container">
      <div class="ui active centered inline loader"></div>
    </div>
  </${this.settings.handle}>
  <script src="${this.settings.bundle}"></script>
</body>
</html>
`;
  }
}

module.exports = Interface;
