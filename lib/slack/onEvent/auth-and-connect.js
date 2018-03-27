module.exports = function (doorman) {
  doorman.slack.on('ready', rtmStartData => {
    //console.log(`Logged into Slack! Name: ${rtmStartData.self.name}, Team:${rtmStartData.team.name}`);
    console.log(`Logged into Slack!`);
  });
  doorman.slack.on('connected', () => {
    console.log(`Connection to Slack Successful!`);
  });
};
