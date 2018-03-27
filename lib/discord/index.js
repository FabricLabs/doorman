'use strict';

const path = require('path');
const util = require('util');
const chalk = require('chalk');

const DiscordJS = require('discord.js');
const Plugin = require('../plugin');

const helpers = require('../helpers');
const commandFiles = helpers.getFileArray('./plugins');

function Discord (config) {
  doorman.discord = new DiscordJS.Client();

  console.log(chalk.magenta(`Discord Enabled... Starting.\nDiscord.js version: ${Discord.version}`));
  if (doorman.auth.discord && doorman.auth.discord.bot_token) {
    console.log('Logging in to Discord...');
    doorman.discord.login(doorman.auth.discord.bot_token);

    // TODO: make these configurable...
    require('./onEvent/disconnected')(doorman);
    require('./onEvent/guild-member-add')(doorman);
    require('./onEvent/guild-member-leave')(doorman);
    require('./onEvent/message')(doorman);
    require('./onEvent/ready')(doorman);
  } else {
    console.log(chalk.red('ERROR: doorman must have a Discord bot token...'));
    return;
  }

  doorman.setupDiscordCommands = function () {
    if (commandFiles) {
      doorman.discordCommands = {};
      commandFiles.forEach(commandFile => {
        try {
          commandFile = doorman.require(`${path.join(commandDirectory, commandFile)}`);
        } catch (err) {
          console.log(chalk.red(`Improper setup of the '${commandFile}' command file. : ${err}`));
        }

        if (commandFile) {
          if (commandFile.commands) {
            commandFile.commands.forEach(command => {
              if (command in commandFile) {
                doorman.discordCommands[command] = module[command];
              }
            });
          }
        }
      });
    }
  };
  doorman.setupDiscordCommands();

  console.log(`Loaded ${doorman.commandCount()} base commands`);
  console.log(`Loaded ${Object.keys(doorman.discordCommands).length} Discord commands`);
};

util.inherits(Discord, Plugin);

module.exports = Discord;