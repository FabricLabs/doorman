'use strict';

const chalk = require('chalk');
const path = require('path');
const commandDirectory = '/plugins';

module.exports = doorman => {
  const commandFiles = doorman.getFileArray(commandDirectory);

  // Helpers
  doorman.addCommand = (commandName, commandObject) => {
    try {
      doorman.Commands[commandName] = commandObject;
    } catch (err) {
      console.log(err);
    }
  };

  doorman.commandCount = () => {
    return Object.keys(doorman.Commands).length;
  };

  doorman.setupCommands = () => {
    doorman.Commands = {};

    // Load command files
    commandFiles.forEach(commandFile => {
      try {
        commandFile = require(`${path.join(commandDirectory, commandFile)}`)(doorman);
      } catch (err) {
        console.log(chalk.red(`Improper setup of the '${commandFile}' command file. : ${err}`));
      }

      if (commandFile) {
        if (commandFile.commands) {
          commandFile.commands.forEach(command => {
            if (command in commandFile) {
              doorman.addCommand(command, commandFile[command]);
            }
          });
        }
      }
    });

    // Load simple commands from json file
    let jsonCommands = [];
    try {
      // TODO: refactor how external data is loaded
      // I/O should not take place inside of the module
      jsonCommands = doorman.getJsonObject('/config/commands.json');
    } catch (err) { }

    jsonCommands.forEach(jsonCommand => {
      const command = jsonCommand.command;
      const description = jsonCommand.description;
      const response = jsonCommand.response;

      doorman.addCommand(command, {
        description,
        process: (msg, suffix, isEdit, cb) => {
          cb({
            embed: {
              color: doorman.config.discord.defaultEmbedColor,
              description: response
            }
          }, msg);
        }
      });
    });

    // Load external commands
    if (doorman.config.plugins && Array.isArray(doorman.config.plugins)) {
      doorman.config.plugins.forEach(module => {
        if (doorman.Commands[module]) {
          return;
        }
        try {
          module = require(`doorman-${module}`)(doorman);
        } catch (err) {
          console.log(chalk.red(`Improper setup of the '${module}' command file. : ${err}`));
          return;
        }
        if (module && module.commands) {
          module.commands.forEach(command => {
            if (command in module) {
              doorman.addCommand(command, module[command]);
            }
          });
        }
      });
    }
  };

  doorman.setupCommands();

  // TODO: implement service modules (#8)
  // https://github.com/FabricLabs/doorman/issues/8

  // Discord
  require('./discord')(doorman);

  // Slack
  require('./slack')(doorman);
};
