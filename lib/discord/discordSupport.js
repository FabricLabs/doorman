const path = require('path');
const chalk = require('chalk');
const commandDirectory = './plugins';

module.exports = Doorman => {
  const commandFiles = Doorman.getFileArray(commandDirectory);
  const Discord = require('discord.js');
  Doorman.Discord = new Discord.Client();

  console.log(chalk.magenta(`Discord Enabled... Starting.\nDiscord.js version: ${Discord.version}`));
  if (Doorman.Auth.discord.bot_token) {
    console.log('Logging in to Discord...');
    Doorman.Discord.login(Doorman.Auth.discord.bot_token);
    require('./onEvent/disconnected')(Doorman);
    require('./onEvent/guild-member-add')(Doorman);
    require('./onEvent/guild-member-leave')(Doorman);
    require('./onEvent/message')(Doorman);
    require('./onEvent/ready')(Doorman);
  } else {
    console.log(chalk.red('ERROR: Doorman must have a Discord bot token...'));
    return;
  }

  Doorman.setupDiscordCommands = function () {
    if (commandFiles) {
      Doorman.discordCommands = {};
      commandFiles.forEach(commandFile => {
        try {
          commandFile = Doorman.require(`${path.join(commandDirectory, commandFile)}`);
        } catch (err) {
          console.log(chalk.red(`Improper setup of the '${commandFile}' command file. : ${err}`));
        }

        if (commandFile) {
          if (commandFile.commands) {
            commandFile.commands.forEach(command => {
              if (command in commandFile) {
                Doorman.discordCommands[command] = module[command];
              }
            });
          }
        }
      });
    }
  };
  Doorman.setupDiscordCommands();

  console.log(`Loaded ${Doorman.commandCount()} base commands`);
  console.log(`Loaded ${Object.keys(Doorman.discordCommands).length} Discord commands`);
};
