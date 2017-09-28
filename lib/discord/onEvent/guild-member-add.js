module.exports = Doorman => {
  Doorman.Discord.on('guildMemberAdd', member => {
    const guildId = member.guild.id;
    const guild = Doorman.Discord.guilds.find('id', guildId);
    const defaultChannel = guild.defaultChannel;
      
    member.send(`Welcome, ${member.user.username}, to the Community!\nBe sure to read our <#${Doorman.Config.discord.welcomeChannel}> channel for an overview of our rules and features.`);
    defaultChannel.send(`@here, please Welcome ${member.user.username} to ${member.guild.name}!`);
  });
};
