module.exports = function (Doorman) {
  Doorman.Slack.on('team_join', event => {
    Doorman.Slack.sendMessage(`@here, please Welcome ${event.user.name} to ${Doorman.Config.slack.teamName}!`, Doorman.Slack.dataStore.getChannelByName(Doorman.Config.slack.welcomeChannel).id);
  });
};
