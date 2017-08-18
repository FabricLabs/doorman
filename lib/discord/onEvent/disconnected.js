const Doorman = require('../../../doorman');

Doorman.Discord.on('disconnected', function() {
    console.log('Disconnected!');
    process.exit(1); //exit node.js with an error
});