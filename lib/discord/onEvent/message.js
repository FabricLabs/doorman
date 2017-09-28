module.exports = Doorman => {
	function discordMessageCb(output, msg, expires, delCalling) {
		if (expires) {
			return msg.channel.send(output).then(message => message.delete(5000));
		}
		if (delCalling) {
			return msg.channel.send(output).then(() => msg.delete());
		}
		msg.channel.send(output);
	}

	function checkMessageForCommand(msg, isEdit) {
		// Drop our own messages to prevent feedback loops
		if (msg.author === Doorman.Discord.user) {
			return;
		}
		if (msg.channel.type === 'dm') {
			msg.channel.send(`I don't respond to direct messages.`);
			return;
		}
		if (msg.isMentioned(Doorman.Discord.user)) {
			msg.channel.send('Yes?');
			return;
		}

		// Check if message is a command
		if (msg.content.startsWith(Doorman.Config.commandPrefix)) {
			const allCommands = Object.assign(Doorman.Commands, Doorman.discordCommands);
			const cmdTxt = msg.content.split(' ')[0].substring(Doorman.Config.commandPrefix.length).toLowerCase();
			const suffix = msg.content.substring(cmdTxt.length + Doorman.Config.commandPrefix.length + 1); // Add one for the ! and one for the space
			const cmd = allCommands[cmdTxt];

			if (cmdTxt === 'help') {
				// Help is special since it iterates over the other commands
				if (suffix) {
					const cmds = suffix.split(' ').filter(cmd => {
						return allCommands[cmd];
					});

					let info = '';
					if (cmds.length > 0) {
						cmds.forEach(cmd => {
							if (Doorman.Permissions.checkPermission(msg.guild.id, cmd)) {
								info += `**${Doorman.Config.commandPrefix + cmd}**`;
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
							}
						});
						msg.channel.send(info);
						return;
					}
					msg.channel.send('I can\'t describe a command that doesn\'t exist');
				} else {
					msg.author.send('**Available Commands:**').then(() => {
						let batch = '';
						const sortedCommands = Object.keys(allCommands).sort();
						for (const i in sortedCommands) {
							const cmd = sortedCommands[i];
							let info = `**${Doorman.Config.commandPrefix + cmd}**`;
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
								msg.author.send(batch);
								batch = info;
							} else {
								batch = newBatch;
							}
						}

						if (batch.length > 0) {
							msg.author.send(batch);
						}
					});
				}
			} else if (cmdTxt === 'reload') {
				if (msg.member.hasPermission('ADMINISTRATOR')) {
					msg.channel.send({ embed: {
						color: Doorman.Config.discord.defaultEmbedColor,
						description: 'Reloading commands...'
					} }).then(response => {
						Doorman.setupCommands();
						Doorman.setupDiscordCommands();
						response.delete();
						msg.channel.send({ embed: {
							color: Doorman.Config.discord.defaultEmbedColor,
							description: `Reloaded:\n* ${Doorman.commandCount()} Base Commands\n* ${Object.keys(Doorman.discordCommands).length} Discord Commands`
						} });
					});
				} else {
					msg.channel.send({ embed: {
						color: Doorman.Config.discord.defaultEmbedColor,
						description: `You can't do that Dave...`
					} });
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
				msg.channel.send(`${cmdTxt} not recognized as a command!`).then((message => message.delete(5000)));
			}
		}
	}

	Doorman.Discord.on('message', msg => checkMessageForCommand(msg, false));
	Doorman.Discord.on('messageUpdate', (oldMessage, newMessage) => {
		checkMessageForCommand(newMessage, true);
	});
};
