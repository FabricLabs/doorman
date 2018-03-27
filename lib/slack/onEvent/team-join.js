module.exports = function (doorman) {
  doorman.slack.on('team_join', event => {
    doorman.slack.sendMessage(`@here, please Welcome ${event.user.name} to ${doorman.config.slack.teamName}!`, doorman.slack.dataStore.getChannelByName(doorman.config.slack.welcomeChannel).id);
  });
};
