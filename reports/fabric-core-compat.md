# Fabric core compatibility audit

Install-only pass against published GitHub SHAs. No service, type, or test edits.

Date: 2026-10-03. Node `v24.15.0`, npm `12.0.2`.

`npm run report:install` ran one repository at a time: doorman, then idlerpg, then idlerpg-bot. The agent environment has no GitHub SSH key, so each install set a process-local `url.https://github.com/.insteadOf` for `git@github.com:` and `ssh://git@github.com/`. Git config was not changed. Lockfile `resolved` fields still record `git+ssh://` URLs.

## Pins

Published tips used as pins (`git ls-remote https://github.com/FabricLabs/...`):

| Package | Published ref | SHA |
|---|---|---|
| `@fabric/core` | `FabricLabs/fabric` `feature/rsi` | `8092ba8c009f2dec05c71ac9ec91ab0f9b1e5bdd` |
| `@fabric/http` | `FabricLabs/fabric-http` `feature/rsi` | `b982c29f3ae34edb62ca6121626f74796b563391` |
| `@fabric/rpg` | `FabricLabs/rpg` `rpg-0.2.0-develop` | `114b690cd024d2517032e21590993be5475747fa` |
| doorman (bot pin) | `FabricLabs/doorman` `develop` | `4c979652321d758a5add33cf5a3b6a14ebb7ef66` |
| idlerpg (bot pin) | `FabricLabs/idlerpg` `master` | `e6db65b8f09a169c71a00104d12094d6e7e06601` |

Local checkout delta for core: `~/fabric-clean` `feature/rsi` is `7a02a466b8a1d9bb719693c1cb56055cbd42125b`, one commit ahead of FabricLabs `feature/rsi` (`Document security findings, begin release work`). That commit is on `github.com/martindale/fabric` `feature/rsi` and is not the FabricLabs branch tip. `fabric-http` `b982c29f` matches local `~/fabric-http` `feature/rsi`.

Previous pins this pass replaced:

- doorman: `@fabric/core` `FabricLabs/fabric#feature/v0.1.0-RC1` (`612180ec…`), `@fabric/http` `FabricLabs/fabric-http#feature/graphql` (`fd0ff763…`)
- idlerpg working tree: `@fabric/core` `Fabriclabs/fabric#feature/v0.1.0-RC1`, `@fabric/http` `FabricLabs/http#feature/v0.1.0-RC1` (wrong repository name; http lives in `fabric-http`)
- idlerpg-bot: doorman `508e2f48…` (2018-09-06), idlerpg `be062fc3…` (2018-09-12)

Each repo now has `.npmrc` `allow-git=all`. idlerpg-bot gained `report:install` and a direct `@fabric/core` pin.

## Install results

### doorman — success

`reports/install.log`: added 1048 packages in about 5 minutes. Exit 0.

Resolved:

- `node_modules/@fabric/core` → `FabricLabs/fabric#8092ba8c009f2dec05c71ac9ec91ab0f9b1e5bdd` (`0.1.0-RC1`, engines `node` `24.15.0`, `npm` `>=12`)
- `node_modules/@fabric/http` → `FabricLabs/fabric-http#b982c29f3ae34edb62ca6121626f74796b563391` (`0.1.0`)
- nested `node_modules/@fabric/http/node_modules/@fabric/core` → `martindale/fabric#7a02a466b8a1d9bb719693c1cb56055cbd42125b`

`@fabric/http` declares `@fabric/core` as `martindale/fabric#feature/rsi`, so http loads the fork tip while doorman’s own `require('@fabric/core')` loads FabricLabs `8092ba8c`. Those two trees differ by one commit.

npm 12 blocked install scripts (not on the `allowScripts` list), including `@fabric/core` `scripts/install-native.js`, `classic-level`, `zeromq`, and `puppeteer`. The JavaScript packages are on disk. Native addons were not built.

### idlerpg — success

`reports/install.log`: added 824 packages in about 4 minutes. Exit 0.

Resolved:

- `@fabric/core` `8092ba8c…` (same FabricLabs pin)
- `@fabric/http` `b982c29f…`, with the same nested `martindale/fabric#7a02a466…`
- `@fabric/rpg` `114b690c…`

`@fabric/rpg`’s own `package.json` still requests `FabricLabs/fabric#feature/v0.1.0-RC1` and `FabricLabs/fabric-http#feature/v0.1.0-RC1`. npm did not nest those. `require('@fabric/core')` from `node_modules/@fabric/rpg` resolves to the hoisted FabricLabs `8092ba8c` tree. Same install-script block as doorman (`install-native.js`, `classic-level`, `zeromq`, plus `peerjs` and `core-js` postinstall).

`indefinite-article` and `node-schedule` are required by `types/idlerpg.js` and are not installed. `fast-json-patch` and `json-pointer` resolved only because something else in the tree depends on them.

### idlerpg-bot — failed

`npm i` exited 1. `reports/install.log` contains only `$ npm i` because the script appends stdout and the failure was on stderr. `package-lock.json` was wiped to a blank line at the start of the script and was not rewritten. `node_modules` is absent.

npm error:

```text
npm error code EALLOWREMOTE
npm error Fetching packages of type "remote" have been disabled
npm error Refusing to fetch "buffer-map@https://registry.npmjs.org/buffer-map/-/buffer-map-0.0.5.tgz"
```

The bot’s package.json pins are current published doorman and idlerpg, plus direct `@fabric/core` `8092ba8c`. Those published trees are not this working copy:

- Published doorman `4c979652` still depends on `@fabric/core` `feature/v0.1.0-RC1` and `@fabric/http` `feature/graphql`.
- Published idlerpg `e6db65b8` still depends on `fabriclabs/fabric#pruning`, `FabricLabs/web#fabric-0.1.0`, and `FabricLabs/rpg#modernize`.

`buffer-map` is pulled as an explicit tarball URL (npm 12 type `remote`) from that older graph, most likely the bcoin-era fabric pin inside published idlerpg. The direct core pin never finished installing.

## API breaks

Checked against the installed `8092ba8c` core and `b982c29f` http, not against uncommitted local edits.

### doorman

`services/doorman.js` (`npm start`) extends `@fabric/core/types/service` and starts `@fabric/http` `HTTPServer`. `types/doorman.js` (`npm run bot`) extends the `Fabric` facade. Fixes on one entry do not cover the other.

- `components/interface.js` extends `@fabric/http` `Element`, which extends `HTMLElement`. Node construction throws before render. `Compiler` (`types/compiler.js`) accepts `{ document }` and calls `document._getHTML`. `Interface` defines `_getHTML`, but the `Element` base class runs first. `@fabric/http` `Component` is the compiler document type; it exposes `_getInnerHTML` / `toHTML`, not `_getHTML`.
- `services/fabric.js` listens for Peer `'message'`. Installed `Peer` emits P2P chat as `'chat'`. `'message'` is re-emitted only from the inner agent inside `trust()`, so chat frames never hit `_handlePeerMessage`.
- Slack and Matrix call `this._GET` / `this._PUT` and use the return value. Both methods on `Service` are `async`. Several call sites do not `await` (`services/slack.js` around the actor/channel reads; `services/matrix.js` whisper, presence, and the non-awaited user path). Results are Promises.
- Slack and Matrix call `this.error(...)`. `Service` extends `Actor` extends `EventEmitter`. `error()` is defined on `State`, and `Service` does not inherit `State`. Those calls throw `TypeError`. `Fabric.enable` has the same `this.error` call.
- `types/doorman.js` and `types/plugin.js` call `disk.get()`. `types/disk.js` only implements `_get`. `Disk` also sets `this.root` from the settings object, so a path join becomes `[object Object]/...` unless `root` is a string.
- `Fabric.registry` is only `{ local: services/local }`. Unknown names fall through to `Fabric.Service`. `Fabric.enable` calls `service.start()`, while Discord, Slack, and Matrix wire their connections in `connect()`.
- `services/doorman.js` re-emits service `'patch'` (singular). It does not emit `'patches'`.

Discord.js `14.9.0` and `@slack/client` `5.0.2` are installed. Slack client is deprecated. That is separate from the Fabric API drift.

### idlerpg

`types/idlerpg.js` extends `RPG` and constructs `new Fabric({ services })`.

- `Fabric`’s constructor sets `this.services = {}` and does not enable the `services` option. The join/channel loop over `rpg.fabric.services` does nothing until something calls `register` and `enable`.
- Installed `RPG.start` does call `await super.start()` (the older “commented out” note does not match `114b690`). `Service` still defaults `persistent: false` and only constructs `this.store` when that flag is true. `RPG.save` then uses `this.store.db.put` and `this['@entity']['@data']`. IdleRPG sets `this['@entity'] = this.state` with no `@data` property, so save throws even after a store exists.
- `RPG.Entity` is `@fabric/core` `Entity`. That class has `id`, `state`, `version`, and `buffer`. It has no `.level` or `.effects`. Level-up checks (`sample.level > prior.level`) stay false. `_handleProfileRequest` calls `new Entity(profile)` without importing `Entity` (`ReferenceError`), then reads `entity.effects` and `entity.level`.
- `Fabric.State` still has `id` and is what the player snapshot uses (`new Fabric.State({ name })`). That part still matches.
- `scripts/rpg.js` constructs `Fabric.Remote`. The class still exists on the facade.

### idlerpg-bot

Source was not executed; the install did not produce `node_modules`.

- `types/bot.js` `require('@fabric/core')` and `new Fabric()` with no further use. The direct pin matches doorman/idlerpg. A finished install would still also pull published doorman’s `feature/v0.1.0-RC1` / `feature/graphql` pins and published idlerpg’s `pruning` / `FabricLabs/web` / `rpg#modernize` pins.
- `doorman.on('patches')` does not match `services/doorman.js`, which emits `patch`. IdleRPG emits `patches` on the plugin instance, not on Doorman.
- Package `main` is `lib/bot.js`. The class lives in `types/bot.js`. `npm start` loads `../config`, which is gitignored.
- The only active test loads `types/bot.js` and therefore `@fabric/core`. The start/ready cases are `xit`.

## What still lines up

Deep imports used by doorman still exist on the installed trees: `@fabric/core/types/service`, `peer`, `interface`, and `@fabric/http/types/server`, `compiler`, `component`, `element`, `site`. `HTTPServer.start` / `stop`, `Peer.start` / `stop`, `Compiler.compileTo`, and `Fabric.State` / `Fabric.Service` / `Fabric.Remote` are still exported. `RPG.Entity` and `RPG.Encounter` are still static getters.

## Not changed

No edits under `services/`, `types/`, or `tests/`. Native install scripts were not approved. The bot install was not retried after `EALLOWREMOTE`.
