const Doorman = require('../../../doorman');

Doorman.Discord.on('ready', function() {
    console.log(`Logged into Discord! Serving in ${Doorman.Discord.guilds.array().length} Discord servers`);
    Doorman.Discord.user.setGame(`${Doorman.Config.commandPrefix}help | ${Doorman.Discord.guilds.array().length} Servers`);
});