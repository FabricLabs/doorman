const Doorman = require('../../doorman');
const request = require('request');


exports.commands = [
	'date_fact',
	'year_fact',
	'math_fact',
	'chucknorris',
	'cat_fact',
	'dog_fact',
	'bacon',
	'smifffact',
	'gitgud',
	'8ball',
	'choose'
]

var factsData = require('../lib/data.js');

exports.math_fact = {
	usage: '<random math>',
	description: 'Gives a Random Math Fact',
	process: (msg, suffix, isEdit, cb) => {
		request('http://numbersapi.com/random/math?json',
			function (err, res, body) {
				try {
					if (err) throw err;
					var data = JSON.parse(body);
					if (data && data.text) {
						cb({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								title: 'Math Fact',
								description: data.text
							}
						}, msg);
					}
				} catch (err) {
					var msgTxt = `command math_fact failed :disappointed_relieved:`;
					if (Doorman.Config.debug) {
						msgTxt += `\n${err.stack}`;
						
						Doorman.logError(err);
					}
					cb(msgTxt, msg);
				}
			});
	}
}

exports.year_fact = {
	description: 'Gives a Random Year Fact',
	process: (msg, suffix, isEdit, cb) => {
		request('http://numbersapi.com/random/year?json',
			function (err, res, body) {
				try {
					if (err) throw err;
					var data = JSON.parse(body);
					if (data && data.text) {
						cb({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								title: 'Year Fact',
								description: data.text
							}
						}, msg);
					}
				} catch (err) {
					var msgTxt = `command year_fact failed :disappointed_relieved:`;
					if (Doorman.Config.debug) {
						msgTxt += `\n${err.stack}`;
						
						Doorman.logError(err);
					}
					cb(msgTxt, msg);
				}
			});
	}
}

exports.date_fact = {
	description: 'Gives a Random Date Fact',
	process: (msg, suffix, isEdit, cb) => {
		request('http://numbersapi.com/random/date?json',
			function (err, res, body) {
				try {
					if (err) throw err;
					var data = JSON.parse(body);
					if (data && data.text) {
						cb({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								title: 'Date Fact',
								description: data.text
							}
						}, msg);
					}
				} catch (err) {
					var msgTxt = `command date_fact failed :disappointed_relieved:`;
					if (Doorman.Config.debug) {
						msgTxt += `\n${err.stack}`;
						
						Doorman.logError(err);
					}
					cb(msgTxt, msg);
				}
			});
	}
}

exports.chucknorris = {
	description: 'Gives a Random Chuck Norris Joke',
	process: (msg, suffix, isEdit, cb) => {
		request('http://api.icndb.com/jokes/random',
			function (err, res, body) {
				try {
					if (err) throw err;
					var data = JSON.parse(body);
					if (data && data.value && data.value.joke) {
						cb({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								title: 'Math Fact',
								description: data.value.joke
							}
						}, msg);
					}
				} catch (err) {
					var msgTxt = `command chucknorris failed :disappointed_relieved:`;
					if (Doorman.Config.debug) {
						msgTxt += `\n${err.stack}`;
						
						Doorman.logError(err);
					}
					cb(msgTxt, msg);
				}
			});
	}
}

exports.cat_fact = {
	description: 'Gives a Random Cat Fact',
	process: (msg, suffix, isEdit, cb) => {
		request('https://catfact.ninja/fact',
			function (err, res, body) {
				try {
					if (err) throw err;
					var data = JSON.parse(body);
					if (data && data.fact) {
						cb({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								title: 'Cat Fact',
								description: data.fact
							}
						}, msg);
					}
				} catch (err) {
					var msgTxt = `command cat_fact failed :disappointed_relieved:`;
					if (Doorman.Config.debug) {
						msgTxt += `\n${err.stack}`;
						
						Doorman.logError(err);
					}
					cb(msgTxt, msg);
				}
			});
	}
}

exports.dog_fact = {
	description: 'Gives a Random Dog Fact',
	process: (msg, suffix, isEdit, cb) => {
		request('https://dog-api.kinduff.com/api/facts',
			function (err, res, body) {
				try {
					if (err) throw err;
					var data = JSON.parse(body);
					if (data && data.facts && data.facts[0]) {
						cb({
							embed: {
								color: Doorman.Config.discord.defaultEmbedColor,
								title: 'Dog Fact',
								description: data.facts[0]
							}
						}, msg);
					}
				} catch (err) {
					var msgTxt = `command dog_fact failed :disappointed_relieved:`;
					if (Doorman.Config.debug) {
						msgTxt += `\n${err.stack}`;
						
						Doorman.logError(err);
					}
					cb(msgTxt, msg);	
				}
			});
	}
}

exports.bacon = {
	description: 'Gives You Bacon; Bacon Makes Everything Better...',
	process: (msg, suffix, isEdit, cb) => {
		var randomnumber = Math.floor(Math.random() * (factsData.bacon.length - 1 + 1)) + 1;
		cb({
			embed: { image: {url: factsData.bacon[randomnumber]} }
		}, msg);
	}
}

exports.smifffact = {
	description: 'Blesses you with a fact about Will Smith.',
	process: (msg, suffix, isEdit, cb) => {
		var randomnumber = Math.floor(Math.random() * (factsData.smiff.length - 1 + 1)) + 1;
		cb({
			embed: {
				color: Doorman.Config.discord.defaultEmbedColor,
				title: 'Will Smith Fact',
				description: factsData.smiff[randomnumber]
			}
		}, msg);
	}
}

function resolveMention(usertxt) {
	var userid = usertxt;
	if (usertxt.startsWith('<@!')) {
		userid = usertxt.substr(3, usertxt.length - 4);
	} else {
		if (usertxt.startsWith('<@')) {
			userid = usertxt.substr(2, usertxt.length - 3);
		}
	}
	return userid;
}

exports.gitgud = {
	usage: '<someone (optional)>',
	description: 'Tell someone (or everyone) to git gud.',
	process: (msg, suffix, isEdit, cb) => {
		cb({
			reply: resolveMention(suffix),
			embed: { image: {url: 'http://i.imgur.com/NqpPXHu.jpg'} }
		}, msg);
	}
}

exports['8ball'] = {
	usage: '<Question>',
	description: 'Ask the magic 8 ball a question.',
	process: (msg, suffix, isEdit, cb) => {
		let response = 'Not even I have an answer to a question not asked.';
		if (suffix) {
			response = 'I don\'t know what to tell you. I\'m all out of answers.';
			if (factsData.eightBall && factsData.eightBall.length) {
				response = factsData.eightBall[Math.floor(Math.random() * factsData.eightBall.length)];
			}
		}

		cb({
			embed: {
				color: Doorman.Config.discord.defaultEmbedColor,
				title: suffix,
				description: `:8ball: **${response}**`,
			}
		}, msg);
	}
}

exports.choose = {
	usage: '<Choices (comma seperated)>',
	description: 'Let the bot choose for you.',
	process: (msg, suffix, isEdit, cb) => {
		let response = 'Sounds like you\'re out of options.';
		if (suffix) {
			let options = suffix.split(',');
			response = `I choose ${options[Math.floor(Math.random() * options.length)].trim()}`;
		}

		cb({
			embed: {
				color: Doorman.Config.discord.defaultEmbedColor,
				title: `:thinking: **${response}**`,
			}
		}, msg);
	}
}