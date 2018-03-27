# Doorman
![Project Status](https://img.shields.io/badge/status-experimental-rainbow.svg?style=flat-square)
[![Build Status](https://img.shields.io/travis/fabriclabs/doorman.svg?branch=master&style=flat-square)](https://travis-ci.org/fabriclabs/doorman)
[![Coverage Status](https://img.shields.io/coveralls/fabriclabs/doorman.svg?style=flat-square)](https://coveralls.io/r/fabriclabs/doorman)
[![Total Contributors](https://img.shields.io/github/contributors/fabriclabs/doorman.svg?style=flat-square)](https://github.com/fabriclabs/doorman/contributors)

Doorman is a friendly, automated helper for managers of large online
communities.  Simple to install and easy to configure, Doorman can welcome new
users, guide them through onboarding flows, and help keep track of important
projects and events.

## Quick Start
1. Fork (optional) and clone:
  `git clone https://github.com/FabricLabs/doorman.git`
2. Run `cp config/index.json.example config/index.json` & edit to your liking
2. Run `cp config/auth.json.example config/auth.json` & add your [auth tokens](#auth)
3. Run `npm install`
4. Run `npm start`

## Configuration
Configuring Doorman will typically require the creation of a "bot" user on the
platform of choice, and the use of a security token to authenticate requests.

### Auth
#### Slack
In your team's workspace, browse to "Apps", "Custom Integrations", "Bots", and
finally "New configuration".  Place the "API Token" into `config/auth.json`:

```json
{
  "slack": {
    "bot_token": "xoxb-0000000000000-somelongstring..."
  }
}
```

#### Discord
@naterchrdsn will need to fill this out. :)

## Plugins
Doorman is modular, and extending him is easy! We've included a few base
features to help with your plugins, which we will describe below.

Plugins for Doorman can add commands or other functionality. For example, the
[doorman-beer-lookup](https://github.com/FabricLabs/doorman-beer-lookup) module
adds the `!brew` command which returns information on breweries and specific
brews!

### Using Plugins
Plugins can be "autoloaded" from either a single file in
`./modules/module-name.js` or an NPM module/GitHub repo named
`doorman-module-name`.

To autoload a plugin, add the plugin name to the `plugins` (or the
`modules` array under the appropriate API name for an API-specific module) array
in `config/index.json` (without the `doorman-` prefix):

```js
{
  // slice of larger JSON file
  "plugins": ["catfacts", "misc", "wikipedia", "urbandictionary"]
}
```

Make sure to include any external plugins as dependencies in the `package.json`
file:

```js
{
  // slice of larger JSON file
  "dependencies": {
    "doorman-urbandictionary": "FabricLabs/doorman-urbandictionary",
    "doorman-wikipedia": "FabricLabs/doorman-wikipedia",
    "doorman-misc": "FabricLabs/doorman-misc",
    "doorman-catfact": "FabricLabs/doorman-catfact"
  },
}
```

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
- [remaeusfact](https://github.com/FabricLabs/doorman-remaeusfact) => spits out a random fact about [Remaeus](https://github.com/martindale)

### Writing Plugins
To write a Doorman plugin, create a new NPM module that exports an array named `commands` of triggers your bot will respond to. You can use a simple callback to display your message in both Slack and Discord, depending on the features you added:

```js
module.exports = (Doorman) => {
  return {
    commands: [
      'hello'
    ],
    hello: {
      description: 'responds with hello!',
      process: (msg, suffix, isEdit, cb) => { cb('hello!', msg); }
    }
  };
};
```

If you think your plugin is amazing, please let us know! We'd love to add it to our list. Currently, the bot is configured to work with external repositories with the `doorman-` prefix.

## Running
Before first run you will need to create an `auth.json` file. A bot token is required for the bot to connect to the different services. The other credentials are not required for the bot to run, but highly recommended as commands that depend on them will malfunction. See `auth.json.example`.

To start the bot, just run `npm start`.

## Updates
If you update the bot, please run `npm update` before starting it again. If you have
issues with this, you can try deleting your node_modules folder and then running
`npm install` again.
