var Doorman = require('../../doorman');
var util = require('util');
var xml2js = require('xml2js');
var parser = new xml2js.Parser();

exports.commands = [
	'define'
];

exports.define = {
	usage: '<word>',
	description: 'Looks up a word in the Merriam-Webster Collegiate Dictionary',
	process: (msg, suffix, isEdit, cb) => {
		var word = suffix;

		if (!word) {
			cb({
				embed: {
					color: Doorman.Config.discord.defaultEmbedColor,
					description: 'I won\'t define an empty string.'
				}
			}, msg);

			return;
		}

		require('request')(`http://www.dictionaryapi.com/api/v1/references/collegiate/xml/${word}?key=${Doorman.Auth.dictionary_api_key}`,
			function (err, res, body) {
				let definitionResult = "";
				parser.parseString(body, function (err, result) {
					let wordList = result.entry_list.entry;
					let phonetic = '';
					phonetic += wordList[0].pr.map(entry => {
						if (typeof entry === 'object') {
							return entry['_'];
						}
						return entry;
					}).join('\n');
					definitionResult += `*[${phonetic}]*\n`;
					definitionResult += `Hear it: http://media.merriam-webster.com/soundc11/${wordList[0].sound[0].wav[0].slice(0, 1)}/${wordList[0].sound[0].wav[0]}\n\n`;
					wordList.forEach(wordResult => {
						let defList = '';
						let defArray = wordResult.def[0].dt;
						if (wordResult.ew[0] !== word) { return; };
						definitionResult += '__' + wordResult.fl[0] + '__\n';
						defArray = defArray.filter(item => {
							if (typeof item === 'object') {
								item['_'] = item['_'].trim();
								return item['_'] !== ':';
							}
							item = item.trim();
							return item !== ':';
						});
						defList += defArray.map(entry => {
							if (typeof entry === 'object') {
								return entry['_'];
							}
							return entry;
						}).join('\n');
						definitionResult += `${defList}\n\n`;
					});

					cb({
						embed: {
							color: Doorman.Config.discord.defaultEmbedColor,
							title: word,
							description: definitionResult
						}
					}, msg);
				});
			});
	}
}
