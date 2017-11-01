# Doorman
![Project Status](https://img.shields.io/badge/status-experimental-rainbow.svg?style=flat-square)
[![Build Status](https://img.shields.io/travis/fabriclabs/doorman.svg?branch=master&style=flat-square)](https://travis-ci.org/fabriclabs/doorman)
[![Coverage Status](https://img.shields.io/coveralls/fabriclabs/doorman.svg?style=flat-square)](https://coveralls.io/r/fabriclabs/doorman)
[![Total Contributors](https://img.shields.io/github/contributors/fabriclabs/doorman.svg?style=flat-square)](https://github.com/fabriclabs/doorman/contributors)

Doorman is a convenient community helper, automatically handling onboarding and
providing useful functionality to groups of friends and collaborators.

# Plugins

Doorman is modular, and extending him is easy! We've included a few base features to help with your plugins, which we will describe below.

Plugins for Doorman can add commands or other functionality. For example, the [doorman-beer-lookup](https://github.com/FabricLabs/doorman-beer-lookup) module adds the !brew command which returns information on breweries and specific brews!

## Using Plugins

Plugins can be autoloaded from either a single file in `./modules/module-name.js` or an NPM module/Github repo named `doorman-module-name`.

To autoload a plugin, add the plugin name to the `externalModules` (or the `modules` array under the appropriate api name for an api-specific module) array in `config/botConfig.json` (without the `doorman-`):

```json
{
	...
	"externalModules": ["catfact", "misc", "wikipedia", "urbandictionary"]
}
```

and make sure to include any external plugins as dependencies in the `package.json` file:

```json
{
  ...
	"dependencies": {
        "doorman-urbandictionary": "FabricLabs/doorman-urbandictionary",
        "doorman-wikipedia": "FabricLabs/doorman-wikipedia",
		"doorman-misc": "FabricLabs/doorman-misc",
		"doorman-catfact": "FabricLabs/doorman-catfact"
		...
 	},
  ...
}
```

## Official Plugins
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


## Writing Plugin
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

# Installation

Written in Node.JS.

0. Install prereqs, see below for your OS.
1. Clone the repo.
2. Run `npm install` in the repo directory.

For music playback (on Discord), you will need [ffmpeg](https://www.ffmpeg.org/download.html) installed and in your path variables.

## Prereqs:

### On Unix

   * `python` (`v2.7` recommended, `v3.x.x` is __*not*__ supported)
   * `make`
   * A proper C/C++ compiler toolchain, like [GCC](https://gcc.gnu.org)
   * `npm install -g node-gyp`

### On Mac OS X

   * `python` (`v2.7` recommended, `v3.x.x` is __*not*__ supported) (already installed on Mac OS X)
   * [Xcode](https://developer.apple.com/xcode/download/)
     * You also need to install the `Command Line Tools` via Xcode. You can find this under the menu `Xcode -> Preferences -> Downloads`
     * This step will install `gcc` and the related toolchain containing `make`
   * `npm install -g node-gyp`

### On Windows

#### Option 1

Install all the required tools and configurations using Microsoft's [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools) using `npm install --global --production windows-build-tools` from an elevated PowerShell or CMD.exe (run as Administrator).

#### Option 2

Install tools and configuration manually:
   * Visual C++ Build Environment:
     * Option 1: Install [Visual C++ Build Tools](http://landinghub.visualstudio.com/visual-cpp-build-tools) using the **Default Install** option.

     * Option 2: Install [Visual Studio 2015](https://www.visualstudio.com/products/visual-studio-community-vs) (or modify an existing installation) and select *Common Tools for Visual C++* during setup. This also works with the free Community and Express for Desktop editions.

     > :bulb: [Windows Vista / 7 only] requires [.NET Framework 4.5.1](http://www.microsoft.com/en-us/download/details.aspx?id=40773)

   * Install [Python 2.7](https://www.python.org/downloads/) (`v3.x.x` is not supported), and run `npm config set python python2.7` (or see below for further instructions on specifying the proper Python version and path.)
   * Launch cmd, `npm config set msvs_version 2015`

   If the above steps didn't work for you, please visit [Microsoft's Node.js Guidelines for Windows](https://github.com/Microsoft/nodejs-guidelines/blob/master/windows-environment.md#compiling-native-addon-modules) for additional tips.

### Then, install node-gyp using `npm install -g node-gyp`

## Customization
The `/examples/` directory contains example files for the configs.! These files need to be renamed, without the .example extension, and placed in the `/config/` folder.

# Running
Before first run you will need to create an `auth.json` file. A bot token is required for the bot to connect to the different services. The other credentials are not required for the bot to run, but highly recommended as commands that depend on them will malfunction. See `auth.json.example`.

To start the bot just run
`node start`.

# Updates
If you update the bot, please run `npm update` before starting it again. If you have
issues with this, you can try deleting your node_modules folder and then running
`npm install` again. Please see [Installation](#Installation).
