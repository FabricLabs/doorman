const Doorman = require('../../../doorman');

function discordMessageCb (output, msg, expires, delCalling) {
  if (expires) {
    return msg.channel.send(output).then(message => message.delete(5000));
  }
  if (delCalling) {
    return msg.channel.send(output).then(() => msg.delete());
  }
  msg.channel.send(output);
};

function checkMessageForCommand (msg, isEdit) {
  //drop our own messages to prevent feedback loops
  if (msg.author === Doorman.Discord.user) {
    return;
  }
  //check if message is a command
  if (msg.content.startsWith(Doorman.Config.commandPrefix)) {
    let allCommands = Object.assign(Doorman.Commands, Doorman.discordCommands);
    let cmdTxt = msg.content.split(' ')[0].substring(Doorman.Config.commandPrefix.length).toLowerCase();
    let suffix = msg.content.substring(cmdTxt.length + Doorman.Config.commandPrefix.length + 1); //add one for the ! and one for the space
    if (msg.isMentioned(Doorman.Discord.user)) {
      msg.channel.send('Yes?');
      return;
    };
    let cmd = allCommands[cmdTxt];
    if (msg.channel.type === "dm") {
      msg.channel.send(`I don't respond to direct messages.`)
    } else if (cmdTxt === 'help') {
      //help is special since it iterates over the other commands
      if (suffix) {
        let cmds = suffix.split(' ').filter(function (cmd) { return allCommands[cmd] });
        let info = "";
        cmds.forEach(cmd => {
          if (Doorman.Permissions.checkPermission(msg.guild.id, cmd)) {
            info += `**${Doorman.Config.commandPrefix + cmd}**`;
            let usage = allCommands[cmd].usage;
            if (usage) {
              info += ` ${usage}`;
            }
            let description = allCommands[cmd].description;
            if (description instanceof Function) {
              description = description();
            }
            if (description) {
              info += `\n\t${description}`;
            }
            info += '\n'
          }
        });
        msg.channel.send(info);
      } else {
        msg.author.send('**Available Commands:**').then(function () {
          let batch = '';
          let sortedCommands = Object.keys(allCommands).sort();
          for (let i in sortedCommands) {
            let cmd = sortedCommands[i];
            let info = `**${Doorman.Config.commandPrefix + cmd}**`;
            let usage = allCommands[cmd].usage;
            if (usage) {
              info += ` ${usage}`;
            }
            let description = allCommands[cmd].description;
            if (description instanceof Function) {
              description = description();
            }
            if (description) {
              info += `\n\t${description}`;
            }
            let newBatch = `${batch}\n${info}`;
            if (newBatch.length > (1024 - 8)) { //limit message length
              msg.author.send(batch);
              batch = info;
            } else {
              batch = newBatch
            }
          }
          if (batch.length > 0) {
            msg.author.send(batch);
          }
        });
      }
    } else if (cmd) {
      try {
        if (Doorman.Permissions.checkPermission(msg.guild.id, cmdTxt)) {
          console.log(`Treating ${msg.content} from ${msg.guild.id}:${msg.author} as command`);
          cmd.process(msg, suffix, isEdit, discordMessageCb);
        }
      } catch (err) {
        let msgTxt = `Command ${cmdTxt} failed :disappointed_relieved:`;
        if (Doorman.Config.debug) {
          msgTxt += `\n${err.stack}`;
        }
        msg.channel.send(msgTxt);
      }
    } else {
      msg.channel.send(`${cmdTxt} not recognized as a command!`).then((message => message.delete(5000)))
    }
  };
};

Doorman.Discord.on('message', (msg) => checkMessageForCommand(msg, false));
Doorman.Discord.on('messageUpdate', (oldMessage, newMessage) => {
  checkMessageForCommand(newMessage, true);
});