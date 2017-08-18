const Doorman = require('../../../doorman');

function slackMessageCb (output, msg, expires, delCalling) {
	//we need to format the message output for the Slack API first...
	let reformatted = {};



	//then send it and interact with it based on the supplied flags...
	if (expires) {
		return msg.channel.send(output).then(message => message.delete(5000));
	}
	if (delCalling) {
		return msg.channel.send(output).then(() => msg.delete());
	}
	Doorman.Slack.sendMessage(output, msg.channel);
};

function checkMessageForCommand (msg, isEdit) {
	function isMention (args) {
		return args[0] === `<@${Doorman.Slack._self.id}>`;
	};

	//drop our own messages to prevent feedback loops
	if (msg.user === Doorman.Slack._self.id) {
		return;
	}
	if (Doorman.Config.debug) {
		console.log('message received:', msg.type, msg.subtype, 'interpreting...');
	}
	//check for mention
	if (isMention(msg.text.split(' '))) {
		if (Doorman.Config.elizaEnabled) {
			//If Eliza AI is enabled, respond to @mention
			var message = msg.text.replace(`<@${Doorman.Slack._self.id}> `, '');
			Doorman.Slack.sendMessage(Doorman.Eliza.transform(message), msg.channel);
		} else {
			Doorman.Slack.sendMessage('Yes?', msg.channel);
			return;
		};
	};
	//check if message is a command
	if (msg.text.startsWith(Doorman.Config.commandPrefix)) {
		let allCommands = Object.assign(Doorman.Commands, Doorman.slackCommands);
		var cmdTxt = msg.text.split(' ')[0].substring(Doorman.Config.commandPrefix.length).toLowerCase();
		var suffix = msg.text.substring(cmdTxt.length + Doorman.Config.commandPrefix.length + 1); //add one for the ! and one for the space
		var cmd = allCommands[cmdTxt];
		if (msg.type === "dm") {
			Doorman.Slack.sendMessage(`I don't respond to direct messages.`, msg.channel);
		} else if (cmdTxt === 'help') {
			//help is special since it iterates over the other commands
			if (suffix) {
				var cmds = suffix.split(' ').filter(function (cmd) { return allCommands[cmd] });
				var info = "";
				cmds.forEach(cmd => {
					//TODO: add permissions check back here
					info += `**${Doorman.Config.commandPrefix + cmd}**`;
					var usage = allCommands[cmd].usage;
					if (usage) {
						info += ` ${usage}`;
					}
					var description = allCommands[cmd].description;
					if (description instanceof Function) {
						description = description();
					}
					if (description) {
						info += `\n\t${description}`;
					}
					info += '\n'
				});
				Doorman.Slack.sendMessage(info, msg.channel);
			} else {
				Doorman.Slack.sendMessage('**Available Commands:**', msg.user);
				var batch = '';
				var sortedCommands = Object.keys(allCommands).sort();
				for (var i in sortedCommands) {
					var cmd = sortedCommands[i];
					var info = `**${Doorman.Config.commandPrefix + cmd}**`;
					var usage = allCommands[cmd].usage;
					if (usage) {
						info += ` ${usage}`;
					}
					var description = allCommands[cmd].description;
					if (description instanceof Function) {
						description = description();
					}
					if (description) {
						info += `\n\t${description}`;
					}
					var newBatch = `${batch}\n${info}`;
					if (newBatch.length > (1024 - 8)) { //limit message length
						Doorman.Slack.sendMessage(batch, msg.user);
						batch = info;
					} else {
						batch = newBatch
					}
				};
				if (batch.length > 0) {
					Doorman.Slack.sendMessage(batch, msg.user);
				};
			}
		} else if (cmd) {
			try {
				//add permissions check back here, too
				console.log(`Treating ${msg.text} from ${msg.team}:${msg.user} as command`);
				cmd.process(msg, suffix, isEdit, slackMessageCb);
			} catch (err) {
				var msgTxt = `Command ${cmdTxt} failed :disappointed_relieved:`;
				if (Doorman.Config.debug) {
					msgTxt += `\n${err.stack}`;
				}
				Doorman.Slack.sendMessage(msgTxt, msg.channel);
			}
		} else {
			Doorman.Slack.sendMessage(`${cmdTxt} not recognized as a command!`);
		}
	};
};

Doorman.Slack.on(Doorman.Slack.rtm_events.MESSAGE, (msg) => checkMessageForCommand(msg, false));