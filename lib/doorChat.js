const Doorman = require('../doorman');
const chalk = require('chalk');
const Discord = require("discord.js");
const RtmClient = require('@slack/client').RtmClient;
const fs = require('fs');
const path = require('path');

var commandDirectory = '/plugins';
var commandFiles = Doorman.getFileArray(commandDirectory);

//setup commands
Doorman.Commands = {};
Doorman.addCommand = function (commandName, commandObject) {
    try {
        Doorman.Commands[commandName] = commandObject;
    } catch (err) {
        console.log(err);
    }
};
Doorman.commandCount = function () {
    return Object.keys(Doorman.Commands).length;
};
commandFiles.forEach(commandFile => {
    try {
        commandFile = Doorman.require(`${path.join(commandDirectory, commandFile)}`);
    } catch (err) {
        Doorman.logError(`Improper setup of the '${commandFile}' command file. : ${err}`);
    }
    
    if (commandFile) {
        if (commandFile['commands']) {
            commandFile.commands.forEach(command => {
                if (command in commandFile) {
                    Doorman.addCommand(command, commandFile[command]);
                }
            });
        }
    }
});

//Discord
console.log(chalk.magenta(`Discord Enabled... Starting.\nDiscord.js version: ${Discord.version}`));
if (Doorman.Auth.discord.bot_token) {
    Doorman.Discord = new Discord.Client();
    console.log('Logging in...');
    Doorman.Discord.login(Doorman.Auth.discord.bot_token);
    require('./discord/onEvent/disconnected');
    require('./discord/onEvent/guildCreate');
    require('./discord/onEvent/guildDelete');
    require('./discord/onEvent/message');
    require('./discord/onEvent/ready');
} else {
    console.log(chalk.red('ERROR: Doorman must have a Discord bot token...'));
    return;
};

//Slack
console.log(chalk.magenta(`Slack Enabled... Starting.`));
if (Doorman.Auth.slack.bot_token) {
    console.log('Logging in to Slack...');
    Doorman.Slack = new RtmClient(Doorman.Auth.slack.bot_token);
    Doorman.Slack.c_events = require('@slack/client').CLIENT_EVENTS;
    Doorman.Slack.rtm_events = require('@slack/client').RTM_EVENTS;
    Doorman.Slack.start();
    require('./slack/onEvent/auth_and_connect');
    require('./slack/onEvent/message');
    require('./slack/onEvent/teammemberadd');
} else {
    console.log(chalk.red('ERROR: Doorman must have a Slack bot token...'));
    return;
};