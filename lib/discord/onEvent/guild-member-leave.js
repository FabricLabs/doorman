module.exports = Doorman => {
	Doorman.Discord.on('guildMemberLeave', member => {
		const guild = member.guild.id;
		if (guild.defaultChannel) {
			guild.defaultChannel.send(`${member.user.username} has left the server.`);
		}
	});
};
