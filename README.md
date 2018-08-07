# Doorman
[![Build Status](https://img.shields.io/travis/FabricLabs/doorman.svg?branch=master&style=flat-square)](https://travis-ci.org/FabricLabs/doorman)
[![Coverage Status](https://img.shields.io/coveralls/FabricLabs/doorman.svg?style=flat-square)](https://coveralls.io/r/FabricLabs/doorman)
[![Total Contributors](https://img.shields.io/github/contributors/FabricLabs/doorman.svg?style=flat-square)](https://github.com/FabricLabs/doorman/contributors)

Doorman is a friendly, automated helper for managers of large online
communities.  Simple to install and easy to configure, Doorman can welcome new
users, guide them through onboarding flows, and help keep track of important
projects and events using [a robust-plugin API](#plugins).

## Quick Start
1. Fork (optional) and clone:
  `git clone https://github.com/FabricLabs/doorman.git`
2. Run `cp config/index.json.example config/index.json` & add your [auth tokens](#auth)
3. Run `npm install`
4. Run `npm start`

## Services
Doorman comes pre-configured with support for multiple chat platforms, including
[Slack][slack], [Discord][discord], and [Matrix][matrix].  Adding support for
additional services is easy — inspect the `lib/service.js` prototype for a list
of required methods.  Feel free to submit a Pull Request to add support for your
favorite services!

## Plugins
Doorman behaviors range from simple triggers (commands prefixed with `!` _located
anywhere within a message_) to complex applications which communicate
through [a simple message-passing API](#message-passing).  The trigger prefix
is configurable using the `trigger` keyword in the configuration file.

Plugins are **automatically** loaded when included in `config/index.json`, under
the `"plugins"` section, or **manually** by calling `doorman.use()`.  Doorman
will look first in the `./plugins` folder for the named plugin (most useful for
simple prototyping), then will attempt to load from NPM using the `doorman-*`
naming pattern.  Plugins may be published to the NPM registry and installed via
`npm install` as usual.

### Official Plugins
List of external plugins for you to include with your installation (if you wish):

- [xkcd](https://github.com/FabricLabs/doorman-xkcd) => adds the !xkcd command
- [wikipedia](https://github.com/FabricLabs/doorman-wikipedia) => adds the !wiki command
- [urbandictionary](https://github.com/FabricLabs/doorman-urbandictionary) => adds the !urban command
- [dictionary](https://github.com/FabricLabs/doorman-dictionary) => adds the !define command
- [dice](https://github.com/FabricLabs/doorman-dice) => adds the !roll command
- [cocktail-lookup](https://github.com/FabricLabs/doorman-cocktail-lookup) => adds the !cocktail command
- [beer-lookup](https://github.com/FabricLabs/doorman-beer-lookup) => adds the !brew command
- [translator](https://github.com/FabricLabs/doorman-translator) => adds translation commands
- [misc](https://github.com/FabricLabs/doorman-misc) => adds misc commands that don't fall into other categories
- [admin](https://github.com/FabricLabs/doorman-admin) => adds administrative commands
- [catfact](https://github.com/FabricLabs/doorman-catfact) => spits out a random cat fact
- [insult](https://github.com/FabricLabs/doorman-insult) => spits out a random PG insult
- [interstellafact](https://github.com/FabricLabs/doorman-interstellafact) => spits out a random fact about Interstella 5555
- [topologyfact](https://github.com/FabricLabs/doorman-topologyfact) => spits out a random topology fact
- [choicemaker](https://github.com/FabricLabs/doorman-choicemaker) => makes a choice for you, based on given inputs
- [8ball](https://github.com/FabricLabs/doorman-8ball) => ask the magic 8ball something!
- [smifffact](https://github.com/FabricLabs/doorman-smifffact) => spits out a random fact about Will Smith
- [dogfact](https://github.com/FabricLabs/doorman-dogfact) => spits out a random dog fact
- [chucknorrisfact](https://github.com/FabricLabs/doorman-chucknorrisfact) => spits out a random fact about Chuck Norris
- [mathfact](https://github.com/FabricLabs/doorman-mathfact) => spits out a random math fact
- [yearfact](https://github.com/FabricLabs/doorman-yearfact) => spits out a random year fact
- [datefact](https://github.com/FabricLabs/doorman-datefact) => spits out a random date fact
- [remaeusfact](https://github.com/FabricLabs/doorman-remaeusfact) => spits out a random fact about [Remaeus](https://www.roleplaygateway.com/member/Rem%C3%A6us/)

### Simple Plugins
#### Ping-Pong Example Plugin, `./plugins/ping.json`
```json
{
  "ping": "Pong!"
}
```

To use this plugin, add `ping` to your configuration file and Doorman will
respond to any messages that include `!ping` with a simple `Pong!` response.

### Complex Plugins
In addition to simple `!triggers`, Doorman can call functions to compute
responses, or even instantiate external applications for managing long-running
processes.

#### Function Call Example Plugin, `./plugins/erm.js`
```js
const erm = require('erm');
const plugin = {
  erm: function (msg) {
    return erm(msg);
  }
};

module.exports = plugin;
```

#### Instantiated Example Plugin
```js
function MyPlugin (config) {
  // config will be passed from `./config/index.json` based on the plugin name
  this.start();
}

MyPlugin.prototype.start = function () {
  console.log('Hello, world!');
};

module.exports = MyPlugin;
```

### Manually Loading Plugins
To load the plugin, simply call `doorman.use()` on the plugin you wish to add.
Multiple `!triggers` can be added, each as `key => value` mappings provided by
the plugin.

```js
const config = require('./config');
const plugin = { fancy: 'Mmm, fancy!' };

const Doorman = require('doorman');
const doorman = new Doorman(config);

doorman.use(plugin);
doorman.start();
```

## Message Passing API
Doorman emits events like any other `EventEmitter`, using a simple router for
distinguishing between messages, users, and channels on various services.  This
allows Doorman to stay connected to multiple networks simultaneously — a feature
we rely on in [our flagship project, Fabric](https://fabric.pub)!

### General Message Format
#### Identifiers
Doorman uses [the Fabric Messaging Format](https://docs.fabric.pub/messages) to
uniquely identify objects within the system.  Each object has an `id` field,
which usually takes the following format:

`:service/:collection/:identifier`

For example, a `user` event might emit the following object:

```json
{
  "id": "slack/users/U09HF4JLV",
  "@data": {
    "id": "U09HF4JLV"
  }
}
```

### Users (the `user` event)
### Channels (the `channel` event)
### Messages (the `message` event)
### State Management (the `patch` event)


## Configuration
Configuring Doorman will typically require the creation of a "bot" user on the
platform of choice, and the use of a security token to authenticate requests.

### Matrix
Register a user for your bot, then collect the "Access Token" from the user's
settings — you will need to use the "click to reveal" feature to display the
token.

Place the token into `config/index.json` under the `matrix` index, and specify
`user` and `authority`:
```json
{
  "matrix": {
    "token": "place-the-token-here",
    "user": "@doorman:ericmartindale.com",
    "authority": "https://matrix.verse.pub"
  }
}
```

### Slack
In your team's workspace, browse to "Apps", "Custom Integrations", "Bots", and
finally "New configuration".  Place the "API Token" into `config/index.json`:

```json
{
  "slack": {
    "token": "xoxb-0000000000000-somelongstring..."
  }
}
```

### Discord
@naterchrdsn will need to fill this out. :)

## Documentation
Documentation can be generated by running `npm run make:docs` — this will output
an HTML-formatted copy of the API to `docs/`, which can be served with (if
installed!) `http-server docs` or simply opened in your browser.

[slack]: https://slack.com
[discord]: https://discordapp.com
[matrix]: https://matrix.org
