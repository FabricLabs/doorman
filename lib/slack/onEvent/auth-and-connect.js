module.exports = function (Doorman) {
	Doorman.Slack.on(Doorman.Slack.c_events.RTM.AUTHENTICATED, rtmStartData => {
		console.log(`Logged into Slack! Name:${rtmStartData.self.name}, Team:${rtmStartData.team.name}`);
	});
	Doorman.Slack.on(Doorman.Slack.c_events.RTM.RTM_CONNECTION_OPENED, () => {
		console.log(`Connection to Slack Successful!`);
	});
};
