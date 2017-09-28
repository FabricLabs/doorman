const chalk = require('chalk');
const RtmClient = require('@slack/client').RtmClient;

module.exports = Doorman => {
  console.log(chalk.magenta(`Slack Enabled... Starting.`));
  if (Doorman.Auth.slack.bot_token) {
    console.log('Logging in to Slack...');
    Doorman.Slack = new RtmClient(Doorman.Auth.slack.bot_token);
    Doorman.Slack.c_events = require('@slack/client').CLIENT_EVENTS;
    Doorman.Slack.rtm_events = require('@slack/client').RTM_EVENTS;
    Doorman.Slack.start();
    require('./onEvent/auth-and-connect')(Doorman);
    require('./onEvent/message')(Doorman);
    require('./onEvent/team-join')(Doorman);
  } else {
    console.log(chalk.red('ERROR: Doorman must have a Slack bot token...'));
    return;
  }
};
