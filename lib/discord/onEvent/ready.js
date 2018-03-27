module.exports = Doorman => {
  Doorman.Discord.once('ready', () => {
    console.log(`Logged into Discord! Serving in ${Doorman.Discord.guilds.array().length} Discord servers`);
  });

  Doorman.Discord.on('ready', () => {
    Doorman.Discord.user.setPresence({ game: { name: `${Doorman.config.commandPrefix}help | ${Doorman.Discord.guilds.array().length} Servers`, type: 0 } });
  });
};
