const Doorman = require('../../../doorman');

Doorman.Discord.on('guildDelete', guild => {
	Doorman.Discord.user.setGame(`${Doorman.Config.commandPrefix}help | ${Doorman.Discord.guilds.array().length} Servers`);
});
