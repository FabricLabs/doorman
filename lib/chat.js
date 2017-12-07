const chalk = require('chalk');
const path = require('path');
const commandDirectory = '/plugins';

module.exports = Doorman => {
  const commandFiles = Doorman.getFileArray(commandDirectory);

  // Helpers
  Doorman.addCommand = (commandName, commandObject) => {
    try {
      Doorman.Commands[commandName] = commandObject;
    } catch (err) {
      console.log(err);
    }
  };
  Doorman.commandCount = () => {
    return Object.keys(Doorman.Commands).length;
  };
  Doorman.setupCommands = () => {
    Doorman.Commands = {};

    // Load command files
    commandFiles.forEach(commandFile => {
      try {
        commandFile = require(`${path.join(commandDirectory, commandFile)}`)(Doorman);
      } catch (err) {
        console.log(chalk.red(`Improper setup of the '${commandFile}' command file. : ${err}`));
      }

      if (commandFile) {
        if (commandFile.commands) {
          commandFile.commands.forEach(command => {
            if (command in commandFile) {
              Doorman.addCommand(command, commandFile[command]);
            }
          });
        }
      }
    });

    // Load simple commands from json file
    let jsonCommands = [];
    try {
      jsonCommands = Doorman.getJsonObject('/config/commands.json');
    } catch (err) { }

    jsonCommands.forEach(jsonCommand => {
      const command = jsonCommand.command;
      const description = jsonCommand.description;
      const response = jsonCommand.response;

      Doorman.addCommand(command, {
        description,
        process: (msg, suffix, isEdit, cb) => {
          cb({
            embed: {
              color: Doorman.Config.discord.defaultEmbedColor,
              description: response
            }
          }, msg);
        }
      });
    });

    // Load external commands
    if (Doorman.Config.externalModules && Array.isArray(Doorman.Config.externalModules)) {
      Doorman.Config.externalModules.forEach(module => {
        if (Doorman.Commands[module]) {
          return;
        }
        try {
          module = require(`doorman-${module}`)(Doorman);
        } catch (err) {
          console.log(chalk.red(`Improper setup of the '${module}' command file. : ${err}`));
          return;
        }
        if (module && module.commands) {
          module.commands.forEach(command => {
            if (command in module) {
              Doorman.addCommand(command, module[command]);
            }
          });
        }
      });
    }
  };
  Doorman.setupCommands();

  // Discord
  require('./discord/discordSupport')(Doorman);

  // Slack
  require('./slack/slackSupport')(Doorman);
};
