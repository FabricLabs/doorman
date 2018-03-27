module.exports = function (doorman) {
  function currentChannelHasHook (channelId) {
    if (doorman.Auth.slack.webhooks[doorman.slack.dataStore.getChannelById(channelId).name]) {
      return true;
    }
    return false;
  }

  function slackMessageCb (output, msg) {
    // Format the message output for the Slack API
    if (typeof output === 'object') {
      const reformatted = {
        attachments: [
          { fallback: 'There was an error' }
        ]
      };
      if (output.embed.color) {
        reformatted.attachments[0].color = `#${output.embed.color}`;
      }
      if (output.embed.title) {
        reformatted.attachments[0].title = output.embed.title;
      }
      if (output.embed.description) {
        reformatted.attachments[0].text = output.embed.description;
      }
      if (typeof output.embed.image === 'object') {
        reformatted.attachments[0].image_url = output.embed.image.url;
      }
      if (typeof output.embed.thumbnail === 'object') {
        reformatted.attachments[0].thumb_url = output.embed.thumbnail.url;
      }
      if (output.embed.footer) {
        reformatted.attachments[0].footer = output.embed.footer;
      }
      if (typeof output.embed.author === 'object') {
        if (output.embed.author.name) {
          reformatted.attachments[0].author_name = output.embed.author.name;
        }
        if (output.embed.author.url) {
          reformatted.attachments[0].author_link = output.embed.author.url;
        }
        if (output.embed.author.icon_url) {
          reformatted.attachments[0].author_icon = output.embed.author.icon_url;
        }
      }
      if (typeof output.embed.fields === 'object') {
        reformatted.attachments[0].fields = [];
        output.embed.fields.forEach(field => {
          reformatted.attachments[0].fields.push({
            title: field.name,
            value: field.value,
            short: field.inline
          });
        });
      }
      if (output.reply) {
        reformatted.attachments[0].pretext = `<@${output.reply}>`;
      }
      if (currentChannelHasHook(msg.channel)) {
        const url = doorman.Auth.slack.webhooks[doorman.slack.dataStore.getChannelById(msg.channel).name];
        require('request').post({
          uri: url,
          json: true,
          body: reformatted
        });
      }
      return;
    }

    // TODO: add expiring and maybe delCalling pieces
    // Then send it and interact with it based on the supplied flags...
    /* if (expires) {
      return msg.channel.send(output).then(message => message.delete(5000));
    }
    if (delCalling) {
      return msg.channel.send(output).then(() => msg.delete());
    } */
    doorman.slack.sendMessage(output, msg.channel);
  }

  function checkMessageForCommand (msg, isEdit) {
    // TODO: re-bind doorman.config to doorman.config
    //const bot = doorman.slack.dataStore.getBotByName(doorman.config.name);
    msg.author = `<@${msg.user}>`;

    // Drop our own messages to prevent feedback loops
    if (msg.subtype && msg.subtype === 'bot_message') {
      return;
    }

    if (doorman.config.debug) {
      console.log('message received:', msg.type, msg.subtype, 'interpreting...');
    }

    // Check for mention
    /* if (msg.text.split(' ')[0] === `<@${bot.id}>`) {
      if (doorman.config.elizaEnabled) {
        // If Eliza AI is enabled, respond to @mention
        const message = msg.text.replace(`<@${bot.id}> `, '');
        doorman.slack.sendMessage(doorman.Eliza.transform(message), msg.channel);
        return;
      }
      doorman.slack.sendMessage('Yes?', msg.channel);
      return;
    }*/

    // Check for IM
    /*if (doorman.slack.dataStore.getDMById(msg.channel)) {
      if (msg.text.startsWith(doorman.config.commandPrefix) && msg.text.split(' ')[0].substring(doorman.config.commandPrefix.length).toLowerCase() === 'reload') {
        doorman.setupCommands();
        doorman.setupSlackCommands();
        doorman.slack.sendMessage(`Reloaded ${doorman.commandCount()} Base Commands`, msg.channel);
        doorman.slack.sendMessage(`Reloaded ${Object.keys(doorman.slackCommands).length} Slack Commands`, msg.channel);
        return;
      }
      doorman.slack.sendMessage(`I don't respond to direct messages.`, msg.channel);
      return;
    }*/

    // Check if message is a command
    if (msg.text.startsWith(doorman.config.commandPrefix)) {
      const allCommands = Object.assign(doorman.Commands, doorman.slackCommands);
      const cmdTxt = msg.text.split(' ')[0].substring(doorman.config.commandPrefix.length).toLowerCase();
      const suffix = msg.text.substring(cmdTxt.length + doorman.config.commandPrefix.length + 1); // Add one for the ! and one for the space
      const cmd = allCommands[cmdTxt];
      
      console.log('MESSAGE:', msg);

      if (cmdTxt === 'help') {
        const DM = doorman.slack.dataStore.getDMByUserId(msg.user).id;
        if (suffix) {
          const cmds = suffix.split(' ').filter(cmd => {
            return allCommands[cmd];
          });
          let info = '';
          if (cmds.length > 0) {
            cmds.forEach(cmd => {
              // TODO: add permissions check back here
              info += `**${doorman.config.commandPrefix + cmd}**`;
              const usage = allCommands[cmd].usage;
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
              info += '\n';
            });
            doorman.slack.sendMessage(info, DM);
            return;
          }
          doorman.slack.sendMessage('I can\'t describe a command that doesn\'t exist', msg.channel);
        } else {
          doorman.slack.sendMessage('**Available Commands:**', DM);
          let batch = '';
          const sortedCommands = Object.keys(allCommands).sort();
          for (const i in sortedCommands) {
            const cmd = sortedCommands[i];
            let info = `**${doorman.config.commandPrefix + cmd}**`;
            const usage = allCommands[cmd].usage;
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
            const newBatch = `${batch}\n${info}`;
            if (newBatch.length > (1024 - 8)) { // Limit message length
              doorman.slack.sendMessage(batch, DM);
              batch = info;
            } else {
              batch = newBatch;
            }
          }
          if (batch.length > 0) {
            doorman.slack.sendMessage(batch, DM);
          }
        }
      } else if (cmd) {
        try {
          // Add permissions check back here, too
          console.log(`Treating ${msg.text} from ${msg.team}:${msg.user} as command`);
          cmd.process(msg, suffix, isEdit, slackMessageCb);
        } catch (err) {
          let msgTxt = `Command ${cmdTxt} failed :disappointed_relieved:`;
          if (doorman.config.debug) {
            msgTxt += `\n${err.stack}`;
          }
          doorman.slack.sendMessage(msgTxt, msg.channel);
        }
      } else {
        doorman.slack.sendMessage(`${cmdTxt} not recognized as a command!`, msg.channel);
      }
    }
  }

  doorman.slack.on('message', msg => checkMessageForCommand(msg, false));
};
