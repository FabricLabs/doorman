const Doorman = require('../../../doorman');

Doorman.Discord.on('guildCreate', guild => {
    Doorman.Discord.user.setGame(`${Doorman.Config.commandPrefix}help | ${Doorman.Discord.guilds.array().length} Servers`);
});