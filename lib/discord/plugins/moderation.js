module.exports = Doorman => {
	let lastPruned = new Date().getTime() - (Doorman.Config.discord.pruneInterval * 1000);

	return {
		commands: [
			'ban',
			'kick',
			'prune',
			'topic',
			'servers'
		],
		ban: {
			usage: '<user> [days of messages to delete] [reason]',
			description: 'bans the user, optionally deleting messages from them in the last x days',
			process: (msg, suffix) => {
				const args = suffix.split(' ');
				if (args.length > 0 && args[0]) {
					if (!msg.guild.me.hasPermission('BAN_MEMBERS')) {
						msg.channel.send({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								description: `I don't have permission to ban people!`
							}
						}).then(message => message.delete(5000));

						return;
					}

					if (!msg.member.hasPermission('BAN_MEMBERS')) {
						msg.channel.send({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								description: `You don't have permission to ban people, ${msg.member}!`
							}
						}).then(message => message.delete(5000));

						return;
					}

					Doorman.Discord.fetchUser(Doorman.resolveMention(args[0])).then(member => {
						if (member !== undefined) {
							if (msg.mentions.members.first() === member && !member.bannable) {
								msg.channel.send({
									embed: {
										color: Doorman.Config.discord.defaultEmbedColor,
										description: `I can't ban ${member}. Do they have the same or a higher role than me?`
									}
								}).then(message => message.delete(5000));
								return;
							}
							if (args.length > 1) {
								if (!isNaN(parseInt(args[1], 10))) {
									if (args.length > 2) {
										const days = args[1];
										const reason = args.slice(2).join(' ');
										msg.guild.ban(member, { days: parseFloat(days), reason }).then(() => {
											msg.channel.send({
												embed: {
													color: Doorman.Config.discord.defaultEmbedColor,
													description: `Banning ${member} from ${msg.guild} for ${reason}!`
												}
											});
										}).catch(() => msg.channel.send({
											embed: {
												color: Doorman.Config.discord.defaultEmbedColor,
												description: `Banning ${member} from ${msg.guild} failed!`
											}
										}));
									} else {
										const days = args[1];
										msg.guild.ban(member, { days: parseFloat(days) }).then(() => {
											msg.channel.send(`Banning ${member} from ${msg.guild}!`);
										}).catch(() => msg.channel.send({
											embed: {
												color: Doorman.Config.discord.defaultEmbedColor,
												description: `Banning ${member} from ${msg.guild} failed!`
											}
										}));
									}
								} else {
									const reason = args.slice(1).join(' ');
									msg.guild.ban(member, { reason }).then(() => {
										msg.channel.send({
											embed: {
												color: Doorman.Config.discord.defaultEmbedColor,
												description: `Banning ${member} from ${msg.guild} for ${reason}!`
											}
										});
									}).catch(() => msg.channel.send({
										embed: {
											color: Doorman.Config.discord.defaultEmbedColor,
											description: `Banning ${member} from ${msg.guild} failed!`
										}
									}));
								}
							} else {
								msg.guild.ban(member).then(() => {
									msg.channel.send({
										embed: {
											color: Doorman.Config.discord.defaultEmbedColor,
											description: `Banning ${member} from ${msg.guild}!`
										}
									});
								}).catch(() => msg.channel.send({
									embed: {
										color: Doorman.Config.discord.defaultEmbedColor,
										description: `Banning ${member} from ${msg.guild} failed!`
									}
								}));
							}
						}
					}).catch(() => {
						msg.channel.send({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								description: `Cannot find a user by the nickname of ${args[0]}. Try using their snowflake.`
							}
						});
					});
				} else {
					msg.channel.send({
						embed: {
							color: Doorman.Config.discord.defaultEmbedColor,
							description: 'You must specify a user to ban.'
						}
					});
				}
			}
		},
		kick: {
			usage: '<user> [reason]',
			description: 'Kick a user with an optional reason. Requires both the command user and the bot to have kick permission',
			process: (msg, suffix) => {
				const args = suffix.split(' ');

				if (args.length > 0 && args[0]) {
					if (!msg.guild.me.hasPermission('KICK_MEMBERS')) {
						msg.channel.send({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								description: `I don't have permission to kick people!`
							}
						}).then(message => message.delete(5000));

						return;
					}

					if (!msg.member.hasPermission('KICK_MEMBERS')) {
						msg.channel.send({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								description: `I don't have permission to kick people, ${msg.member}!`
							}
						}).then(message => message.delete(5000));

						return;
					}

					const member = msg.mentions.members.first();

					if (member !== undefined) {
						if (!member.kickable) {
							msg.channel.send(`I can't kick ${member}. Do they have the same or a higher role than me?`);
							return;
						}
						if (args.length > 1) {
							const reason = args.slice(1).join(' ');
							member.kick(reason).then(() => {
								msg.channel.send({
									embed: {
										color: Doorman.Config.discord.defaultEmbedColor,
										description: `Kicking ${member} from ${msg.guild} for ${reason}!`
									}
								});
							}).catch(() => msg.channel.send(`Kicking ${member} failed!`));
						} else {
							member.kick().then(() => {
								msg.channel.send({
									embed: {
										color: Doorman.Config.discord.defaultEmbedColor,
										description: `Kicking ${member} from ${msg.guild}!`
									}
								});
							}).catch(() => msg.channel.send({
								embed: {
									color: Doorman.Config.discord.defaultEmbedColor,
									description: `Kicking ${member} failed!`
								}
							}).then(message => message.delete(5000)));
						}
					} else {
						msg.channel.send({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								description: `I couldn't find a user ${args[0]}`
							}
						});
					}
				} else {
					msg.channel.send({
						embed: {
							color: Doorman.Config.discord.defaultEmbedColor,
							description: 'You must specify a user to kick.'
						}
					});
				}
			}
		},
		prune: {
			usage: '<count|1-100>',
			process: (msg, suffix) => {
				if (!suffix) {
					msg.channel.send({
						embed: {
							color: Doorman.Config.discord.defaultEmbedColor,
							description: 'You must specify a number of messages to prune.'
						}
					}).then(message => message.delete(5000));

					return;
				}

				if (!msg.guild.me.hasPermission('MANAGE_MESSAGES')) {
					msg.channel.send({
						embed: {
							color: Doorman.Config.discord.defaultEmbedColor,
							description: `I can't prune messages, ${msg.member}...`
						}
					}).then(message => message.delete(5000));

					return;
				}

				if (!msg.member.hasPermission('MANAGE_MESSAGES')) {
					msg.channel.send({
						embed: {
							color: Doorman.Config.discord.defaultEmbedColor,
							description: `You can't prune messages, ${msg.member}...`
						}
					}).then(message => message.delete(5000));

					return;
				}

				const timeSinceLastPrune = Math.floor(new Date().getTime() - lastPruned);

				if (timeSinceLastPrune > (Doorman.Config.discord.pruneInterval * 1000)) {
					if (!isNaN(parseInt(suffix, 10))) {
						let count = parseInt(suffix, 10);

						count++;

						if (count > Doorman.Config.discord.pruneMax) {
							count = Doorman.Config.discord.pruneMax;
						}

						msg.channel.fetchMessages({ limit: count })
							.then(messages => messages.map(m => m.delete().catch(() => { })))
							.then(() => {
								msg.channel.send({
									embed: {
										color: Doorman.Config.discord.defaultEmbedColor,
										description: `Pruning ${(count === 100) ? 100 : count - 1} messages...`
									}
								}).then(message => message.delete(5000).catch(() => { }));
							});

						lastPruned = new Date().getTime();
					} else {
						msg.channel.send({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								description: `I need a numerical number...`
							}
						}).then(message => message.delete(5000));
					}
				} else {
					const wait = Math.floor(Doorman.Config.discord.pruneInterval - (timeSinceLastPrune / 1000));
					msg.channel.send({
						embed: {
							color: Doorman.Config.discord.defaultEmbedColor,
							description: `You can't do that yet, please wait ${wait} second${wait > 1 ? 's' : ''}`
						}
					}).then(message => message.delete(5000));
				}
			}
		},
		topic: {
			description: 'Shows the purpose of the chat channel',
			process: msg => {
				let response = msg.channel.topic;
				if (msg.channel.topic.trim() === '') {
					response = `There doesn't seem to be a topic for this channel. Maybe ask the mods?`;
				}

				msg.channel.send({
					embed: {
						color: Doorman.Config.discord.defaultEmbedColor,
						title: msg.channel.name,
						description: response
					}
				});
			}
		},
		servers: {
			usage: '<command>',
			description: 'Returns a list of servers the bot is connected to',
			process: (msg, suffix, isEdit, cb) => {
				cb({
					embed: {
						color: Doorman.Config.discord.defaultEmbedColor,
						title: Doorman.Discord.user.username,
						description: `Currently on the following servers:\n\n${Doorman.Discord.guilds.map(g => `${g.name} - **${g.memberCount} Members**`).join(`\n`)}`
					}
				}, msg);
			}
		}
	};
};
