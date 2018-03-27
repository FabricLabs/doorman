module.exports = function (Doorman) {
  Doorman.Slack.on('team_join', event => {
    Doorman.Slack.sendMessage(`@here, please Welcome ${event.user.name} to ${Doorman.config.slack.teamName}!`, Doorman.Slack.dataStore.getChannelByName(Doorman.config.slack.welcomeChannel).id);
  });
};
