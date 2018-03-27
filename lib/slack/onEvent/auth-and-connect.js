module.exports = function (Doorman) {
  Doorman.Slack.on('ready', rtmStartData => {
    //console.log(`Logged into Slack! Name: ${rtmStartData.self.name}, Team:${rtmStartData.team.name}`);
    console.log(`Logged into Slack!`);
  });
  Doorman.Slack.on('connected', () => {
    console.log(`Connection to Slack Successful!`);
  });
};
