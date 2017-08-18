const Doorman = require('../../doorman');

exports.commands = [
	'brew'
]

exports.brew = {
	usage: '[brew | brewery]',
	type: 'normal',
	description: 'Used to retrieve specific information about a brewery or brew.',
	process: (msg, suffix, isEdit, cb) => {
		if (!suffix) {
			cb({embed: {
				color: Doorman.Config.discord.defaultEmbedColor,
				author: {
					name: 'BreweryDB',
					url: 'http://www.brewerydb.com/',
					icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/120/twitter/103/beer-mug_1f37a.png'
				},
				description: 'How about asking for something specific?'
			}}, msg);
			return;
		}

		require('request')(`http://api.brewerydb.com/v2/search?q=${encodeURIComponent(suffix)}&key=${Doorman.Auth.brewerydb_api_key}`, function (err, res, body) {
			var response = JSON.parse(body);
			if (typeof response.data !== 'undefined' && response.data.length > 0) {
				let result = response.data[0];
				if (typeof result.description !== 'undefined') {
					let fields = [];
					let thumbnail = '';
					if (typeof result.labels !== 'undefined') {
						thumbnail = result.labels.medium;
					}

					if (typeof result.images !== 'undefined') {
						thumbnail = result.images.squareMedium;
					}

					if (typeof result.style !== 'undefined') {
						fields.push({
							name: `Style: ${result.style.name}`,
							value: result.style.description
						});
					}
					if (typeof result.abv !== 'undefined') {
						fields.push({
							name: 'ABV (Alcohol By Volume)',
							value: `${result.abv}%`,
							inline: true
						});
					}
					if (typeof result.ibu !== 'undefined') {
						fields.push({
							name: 'IBU (International Bitterness Units)',
							value: `${result.ibu}/100`,
							inline: true
						});
					}

					if (typeof result.website !== 'undefined') {
						fields.push({
							name: 'Website',
							value: result.website,
							inline: true
						});
					}

					if (typeof result.established !== 'undefined') {
						fields.push({
							name: 'Year Established',
							value: result.established,
							inline: true
						});
					};

					cb({embed: {
						color: Doorman.Config.discord.defaultEmbedColor,
						title: result.name,
						author: {
							name: 'BreweryDB',
							url: 'http://www.brewerydb.com/',
							icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/120/twitter/103/beer-mug_1f37a.png'
						},
						thumbnail: {
							url: thumbnail
						},
						description: `\n${result.description}\n\n`,
						fields: fields
					}}, msg);
				} else {
					cb({embed: {
						color: Doorman.Config.discord.defaultEmbedColor,
						author: {
							name: 'BreweryDB',
							url: 'http://www.brewerydb.com/',
							icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/120/twitter/103/beer-mug_1f37a.png'
						},
						description: `${response.data[0].name} is a good beer, but I don't have a good way to describe it.`
					}}, msg);
				}
			} else {
				cb({embed: {
					color: Doorman.Config.discord.defaultEmbedColor,
					author: {
						name: 'BreweryDB',
						url: 'http://www.brewerydb.com/',
						icon_url: 'https://emojipedia-us.s3.amazonaws.com/thumbs/120/twitter/103/beer-mug_1f37a.png'
					},
					description: `Damn, I've never heard of that. Where do I need to go to find it?`
				}}, msg);
			}
		});
	}
}
