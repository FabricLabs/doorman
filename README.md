# Doorman
[![Build Status](https://img.shields.io/travis/FabricLabs/doorman.svg?branch=master&style=flat-square)](https://travis-ci.org/FabricLabs/doorman)
[![Coverage Status](https://img.shields.io/codecov/c/github/FabricLabs/doorman/develop?style=flat-square)](https://codecov.io/gh/FabricLabs/doorman)
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
additional services is easy — inspect the `types/service.js` prototype for a list
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

## Web Console
Doorman serves a **read-only status console** from its bundled `@fabric/http`
server (default `http://localhost:4444/`). It lists enabled services, loaded
plugins with their triggers and `report()` output, and aggregate event
counters (messages, presence, joins, …) that update live. It never shows
message content, user ids, or tokens.

Build the UI once (webpack bundle + HTML shell), then start as usual:

```bash
npm run build   # assets/bundles/browser.min.js + assets/index.html
npm start
```

The page is React on top of the `@fabric/hub` **Bridge** component, so it
speaks the same WebSocket / JSON-RPC surface as a Fabric Hub. Data surfaces:

| Surface | Purpose |
|---------|---------|
| `GET /services/doorman` | `status()` — services, plugins, triggers, counters, `startedAt` |
| `GET /services/doorman/report` | every plugin's `report()` |
| `GET /services/doorman/plugins/:name` | one plugin's report |
| `POST /services/rpc` (and WebSocket `JSONCall`) | `GetDoormanStatus`, `GetDoormanReport`, `ListDoormanServices`, `ListDoormanPlugins`, `GetNetworkStatus` (Hub-shaped stub) |
| WebSocket `GenericMessage` `{ type: 'DoormanEvent' }` | `{ kind, service, count, total }` per counted event |

Configure the server under `http` in your settings (`hostname`, `interface`,
`port`, or any `@fabric/http` `HTTPServer` option). JSON-RPC is open
(`requireAuth: false`) because every method is read-only, so the console binds
`127.0.0.1` by default; set `interface` (e.g. `0.0.0.0`) only when plugin
reports are safe to expose to your network. Pass `http: false`
to embed Doorman in a host process; `doorman.middleware()` then serves the same
JSON API from the host's own server (see `goon.vc`'s presence service).

## Scripts (managed DM conversations)
The `scripts` plugin (`services/scripts.js`) walks one person at a time
through a **script**: a series of steps sent by private message, such as
onboarding a new member or connecting a server admin's community to your site.
Scripts are plain JSON, so they can be stored, versioned, and edited while the
bot runs. Behavior comes from the host through named hooks, never from code in
the script.

```json
{
  "id": "server-setup",
  "title": "Connect your server",
  "start": "welcome",
  "requires": ["ManageGuild"],
  "steps": {
    "welcome": { "say": "Hi {{user.name}}! Let's connect **{{context.guildName}}**.", "input": { "type": "confirm" }, "next": "channel" },
    "channel": {
      "say": "Where should announcements go?",
      "input": { "type": "choice", "optionsFrom": "discord.guild.textChannels", "optional": true },
      "saveAs": "announceChannel",
      "next": [{ "when": { "answers.announceChannel": null }, "goto": "end" }, { "goto": "org" }]
    },
    "org": { "say": "What's your org called?", "input": { "type": "text", "maxLength": 60 } }
  },
  "complete": { "say": "Saved: {{labels.announceChannel|no channel}}." },
  "onComplete": [{ "action": "record" }]
}
```

- **Inputs:** `none` (just say it and move on), `confirm`, `choice` (static
  `options` or a host `optionsFrom` source; `multiple` for several), and `text`
  (`minLength`, `maxLength`, `pattern`). Steps marked `optional` can be skipped.
- **Templates and branches:** `say` takes `{{user.name}}`, `{{context.*}}`,
  `{{answers.*}}`, and `{{labels.*}}`, with `{{path|fallback}}`. `next` is a
  step id, `null` / `"end"`, or a list of `{ when, goto }` branches matched on
  answers and context (a list value matches any of them; `null` matches a
  skipped or missing answer).
- **Versions:** a script's version is the sha256 of its normalized JSON. A
  session stays on the version it started with when the script is edited.
  Seeding from a directory adds new scripts and updates seeded ones, but never
  overwrites a script edited at runtime.
- **Sessions:** one open session per person and script (starting again
  replaces it), answered steps can't be answered again ("This step has
  passed."), and sessions expire after `ttlMs` (default one day).
- **Hooks:** `source(name, fn)` supplies choices, `action(name, fn)` runs on
  completion (`record` is built in: the latest answers per `subject`, e.g. a
  server; an action may return `{ answers, labels }` for later actions, the
  record, and the completion message, and an error it throws with
  `expose: true` is shown to the person instead of a generic failure), and
  `authorize(fn)` checks each `requires` entry when a session
  starts and again before it completes. Scripts with `requires` refuse to run
  without an authorizer.

```js
const Scripts = require('@fabric/doorman/services/scripts');

doorman.use(Scripts, { path: './stores/scripts', seed: './scripts', token: process.env.SCRIPTS_TOKEN });
const scripts = await doorman.started('scripts');
scripts.source('discord.guild.textChannels', (scope) => listChannels(scope.context.guildId));
scripts.authorize(async (permission, session) => memberHas(session.user, session.context.guildId, permission));
await scripts.begin('server-setup', {
  user: 'discord/users/123',
  name: 'Kersa',
  context: { guildId: '456', guildName: 'G00N SQUAD' },
  subject: '456'
});
```

**Rendering.** `doorman.whisper(target, step)` hands each step to the adapter
that owns the user. The Discord adapter (with `whispers: true`, which works
even with `replies: false`) sends buttons for up to five choices, a select
menu (paged 25 at a time) for more, Continue for confirmations, and an Answer
button that opens a modal for text, plus Skip and Cancel. Presses come back
as `answer` events; the card is rewritten with the answer. People can also
just reply in the DM ("cancel" stops). Adapters without components get a
numbered plain-text step instead, answered by typed replies. A private reply to
a running script is never routed to `!` triggers. A closed DM keeps Discord's
error code (50007) so the host can tell the person.

**HTTP.** With the console (or a host's `scripts.middleware()` when Doorman is
embedded with `http: false`):

| Route | Access |
|-------|--------|
| `GET /services/doorman/scripts` | open: every script with its version and session counts |
| `GET /services/doorman/scripts/:id` | open: the current definition |
| `GET /services/doorman/scripts/:id/stats` | open: session counts by outcome |
| `PUT /services/doorman/scripts/:id` | `Authorization: Bearer <token>`: validate and store a new version |
| `GET /services/doorman/scripts/:id/results` | `Authorization: Bearer <token>`: recorded answers |

Without a `token` (or a host `authorize(req)` hook), the gated routes answer
404. Responses never carry user ids except recorded results, which only
authorized callers see.

## Campaigns (reaching groups of members by DM)
The `campaigns` plugin (`services/campaigns.js`) sends one message, or the
start of a script, by private message to a group of members picked by a
filter: platforms, servers, roles, exclusions, and recent activity. A campaign
is saved as a `draft`, previewed, then sent now or `scheduled` for later, and
goes out one DM at a time.

```js
const Campaigns = require('@fabric/doorman/services/campaigns');

doorman.use(Campaigns, { path: './stores/campaigns', via: 'goon.vc', token: process.env.CAMPAIGNS_TOKEN });
const campaigns = await doorman.started('campaigns');
campaigns.audience('discord', async (filter, campaign) => listMembers(filter, campaign));
campaigns.activity(async (target) => lastSeen(target));

const draft = await campaigns.create({
  content: { type: 'message', text: 'Fleet night is Saturday at 8pm.' },
  filter: { roles: ['789'], excludeRoles: ['790'], activeWithinDays: 30 }
}, { owner: { kind: 'guild', guildId: '456', guildName: 'G00N SQUAD' }, by: 'Kersa' });
await campaigns.preview(draft.id); // { reach, optedOut, excluded, inactive, limit, over, sources }
await campaigns.schedule(draft.id, { sendAt: '2026-11-01T18:00:00Z', by: 'Kersa' });
```

- **Content:** `{ type: 'message', text }`, or `{ type: 'script', script,
  text }` to offer a Scripts conversation behind a Start button (the script
  must exist when the campaign is scheduled). Text is at most 1800 characters.
- **Filter:** `platforms`, `guilds`, `roles`, `excludeGuilds`, `excludeRoles`,
  `excludeCampaigns` (skip whoever an earlier campaign reached), and
  `activeWithinDays` (needs an `activity` hook; members it knows nothing about
  count as inactive). Lists hold at most 50 entries.
- **Hooks:** `audience(platform, fn)` lists the members on one platform as
  `{ target, name, source, sourceName }` (`source` is the server they were
  found in, named in each DM and in the Stop button). The host applies
  servers and roles; Campaigns merges people found in several servers, then
  drops opt-outs, `excludeCampaigns`, and inactive members, in that order.
- **Owners and limits:** a campaign is owned by `staff` (the default) or by a
  `guild`. A server's campaign only ever reaches that server, at most
  `maxAudience` people (default 500; staff `staffMaxAudience`, 10000), and one
  per server per `guildCooldownMs` (default a day; `cooldown(owner)` says
  until when). Scheduling over the limit is refused with the preview.
- **Lifecycle:** `update` edits drafts only; `pause` holds a scheduled or
  sending campaign and `resume` carries on; `cancel` stops any campaign not
  yet `sent`, and what hasn't gone out never does.
  The sender ticks every `intervalMs` (default 2 s) and sends one DM per tick.
  A closed DM (Discord 50007) counts as `closed`; rate limits and other
  temporary errors are retried `retries` times (default 3) with backoff from
  `retryMs`. A campaign is `sent` once nothing is pending, and sending resumes
  where it left off after a restart. Every change is in the campaign's `log`.
- **Opting out:** every DM says who sent it ("Sent by G00N SQUAD via goon.vc")
  and carries Stop buttons: stop messages from that server, or stop all.
  Typing STOP, STOP ALL, or START within `stopWindowMs` (default a week) of a
  campaign DM does the same, unless another plugin (a running script) owns
  the reply. Opt-outs are kept forever and skipped by every later campaign.
- **Privacy:** recipients, deliveries, and opt-outs are stored but never
  returned; `campaign(id)` and `list()` carry counts (`stats`) only, and
  `report()` counts by status.

**Rendering.** `doorman.whisper(target, message)` hands a `CampaignMessage` to
the adapter that owns the user. The Discord adapter (`whispers: true`) sends
the text with a `-# Sent by …` line and Start / Stop messages from … / Stop
all buttons (`doorman-c:<campaign>:start|stop|stopall`); the card is rewritten
with the answer. Adapters without components get the text with "Reply START"
/ "Reply STOP" lines instead.

**HTTP.** Every route needs `Authorization: Bearer <token>` (or a host
`authorize(req)` hook); without either they answer 404.

| Route | Does |
|-------|------|
| `GET /services/doorman/campaigns` | every campaign, with counts |
| `POST /services/doorman/campaigns` | create a draft (`content`, `filter`, `title`, `owner`, `by`) |
| `GET /services/doorman/campaigns/:id` | one campaign |
| `PATCH /services/doorman/campaigns/:id` | edit a draft |
| `POST /services/doorman/campaigns/:id/preview` | count who it reaches now |
| `POST /services/doorman/campaigns/:id/schedule` | send now, or at `sendAt` |
| `POST /services/doorman/campaigns/:id/pause` · `resume` · `cancel` | hold, continue, or stop it |

Refusals carry `retryAt` (cooldown) or `preview` (over the limit) next to the
error.

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
    "token": "<your Slack bot token>"
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
