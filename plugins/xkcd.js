const Kirbi = require('../../kirbi');

exports.commands = [
	'xkcd',
	'highnoon'
]

exports.xkcd = {
	usage: '[comic number]',
	description: 'Displays a given XKCD comic number (or the latest if nothing specified',
	process: (msg, suffix, isEdit, cb) => {
		var url = "http://xkcd.com/";
		if (suffix != "") url += `${suffix}/`;
		url += 'info.0.json';
		require('request')(url, function (err, res, body) {
			try {
				var comic = JSON.parse(body);
				cb({embed: {
					color: Kirbi.Config.discord.defaultEmbedColor,
					title: `XKCD ${comic.num} ${comic.title}`,
					image: {
						url: comic.img
					},
					footer: {
						text: comic.alt
					}
				}});
			} catch (err) {
				cb(`Couldn't fetch an XKCD for ${suffix}`);
			}
		});
	}
}

exports.highnoon = {
	process: (msg, suffix, isEdit, cb) => {
		require('request')({
			uri: "http://imgs.xkcd.com/comics/now.png",
			followAllRedirects: true
		}, (err, resp, body) => cb({embed: { image: {url: resp.request.uri.href}}}));
	}
}
