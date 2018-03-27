'use strict';

const chalk = require('chalk');
const Slack = require('@slack/client');
const RTMClient = Slack.RTMClient;

module.exports = doorman => {
  console.log(chalk.magenta(`Slack enabled.  Starting...`));
  if (doorman.auth.slack && doorman.auth.slack.bot_token) {
    console.log('Logging in to Slack...');

    // initialize Slack client
    doorman.Slack = new RTMClient(doorman.auth.slack.bot_token);
    doorman.Slack.c_events = Slack.CLIENT_EVENTS;
    doorman.Slack.rtm_events = Slack.RTM_EVENTS;

    // TODO: ask naterchrdsn why this is before plugins in the control flow?
    doorman.Slack.start();

    // load event handlers?
    require('./onEvent/auth-and-connect')(doorman);
    require('./onEvent/message')(doorman);
    require('./onEvent/team-join')(doorman);
  }
};
