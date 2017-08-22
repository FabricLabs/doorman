const Doorman = require('../../../doorman');

Doorman.Discord.on('disconnected', function() {
  console.log('Disconnected from Discord!');
});