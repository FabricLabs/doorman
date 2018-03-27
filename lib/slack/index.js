'use strict';

const chalk = require('chalk');
const Slack = require('@slack/client');
const RTMClient = Slack.RTMClient;

module.exports = doorman => {
  console.log(chalk.magenta(`Slack enabled.  Starting...`));
  if (doorman.auth.slack && doorman.auth.slack.bot_token) {
    console.log('Logging in to Slack...');

    // initialize Slack client
    doorman.slack = new RTMClient(doorman.auth.slack.bot_token);
    doorman.slack.c_events = Slack.CLIENT_EVENTS;
    doorman.slack.rtm_events = Slack.RTM_EVENTS;

    // TODO: ask naterchrdsn why this is before plugins in the control flow?
    doorman.slack.start();

    // load event handlers?
    require('./onEvent/auth-and-connect')(doorman);
    require('./onEvent/message')(doorman);
    require('./onEvent/team-join')(doorman);
  }
};
