'use strict';

// Settings
const settings = require('../settings/local');

// Fabric HTTP Types
// const Site = require('@fabric/http/types/site');
const Compiler = require('@fabric/http/types/compiler');

// Types
const Interface = require('../components/interface');

// Program Body
async function main (input = {}) {
  const site = new Interface(input);
  const compiler = new Compiler({
    document: site
  });

  await compiler.compileTo('assets/index.html');

  return {
    site: site.id
  };
}

// Run Program
main(settings).catch((exception) => {
  console.error('[BUILD:SITE]', '[EXCEPTION]', exception);
}).then((output) => {
  console.log('[BUILD:SITE]', '[OUTPUT]', output);
});
