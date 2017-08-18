exports.commands = [
	'lmgtfy',
	'unshorten',
	'ping',
	'say'
]

var unshort = require('unshort');

exports.lmgtfy = {
	usage: '<Let Me Google that for You>',
	description: 'Plebs, plz.',
	process: (msg, suffix, isEdit, cb) => {
		if (suffix) {
			cb(`<http://lmgtfy.com/?q=${encodeURI(require("remove-markdown")(suffix))}>`, msg, false, true);
		}
	}
}

exports.unshorten = {
	usage: '<link to shorten>',
	description: 'Unshorten a link.',
	process: (msg, suffix, isEdit, cb) => {
		if (suffix) {
			unshort(suffix, function (err, url) {
				if (url) {
					cb(`Original url is: ${url}`, msg);
				} else {
					cb('This url can\'t be expanded', msg);
				}
			});
		}
	}
}

exports.ping = {
	description: 'responds pong, useful for checking if bot is alive',
	process: (msg, suffix, isEdit, cb) => { cb(`${msg.author} pong!`, msg); }
}

exports.say = {
	usage: '<message>',
	description: 'bot says message',
	process: (msg, suffix, isEdit, cb) => { cb(suffix, msg); }
}
