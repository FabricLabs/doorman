const Doorman = require('../../../doorman');

Doorman.Slack.on(Doorman.Slack.c_events.RTM.AUTHENTICATED, function (rtmStartData) {
  console.log(`Logged into Slack! Name:${rtmStartData.self.name}, Team:${rtmStartData.team.name}`);
  Doorman.Slack._self = {
    id: rtmStartData.self.id,
    name: rtmStartData.self.name
  };
});
Doorman.Slack.on(Doorman.Slack.c_events.RTM.RTM_CONNECTION_OPENED, function(data) {
  console.log(`Connection to Slack Successful!`);
});