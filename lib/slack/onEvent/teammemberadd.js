const Doorman = require('../../../doorman');

Doorman.Discord.on('guildMemberAdd', member => {
	member.send(`Welcome, ${member.user.username}, to the Community!\nBe sure to read our <#${Doorman.Config.welcomeChannel}> channel for an overview of our rules and features.`);
	//channel.send(`@here, please Welcome ${member.user.username} to ${member.guild.name}!`);
});
