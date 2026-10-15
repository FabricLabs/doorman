'use strict';

// Browser entry for the Doorman console. Bundled by webpack into
// `assets/bundles/browser.min.js` and mounted into `#doorman` by
// `assets/index.html` (see `scripts/build.js`).

const React = require('react');
const { createRoot } = require('react-dom/client');

const DoormanInterface = require('../components/DoormanInterface');

function mount () {
  const target = document.getElementById('doorman') || document.body.appendChild(document.createElement('div'));
  if (!target.id) target.id = 'doorman';
  createRoot(target).render(React.createElement(DoormanInterface, {}));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
