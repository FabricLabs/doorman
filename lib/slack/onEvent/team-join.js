module.exports = function (Doorman) {
  Doorman.Slack.on(Doorman.Slack.rtm_events.TEAM_JOIN, event => {
    Doorman.Slack.sendMessage(`@here, please Welcome ${event.user.name} to ${Doorman.Config.slack.teamName}!`, Doorman.Slack.dataStore.getChannelByName(Doorman.Config.slack.welcomeChannel).id);
  });
};
