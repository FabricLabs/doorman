'use strict';

/**
 * How authoritative a Discord name is. A later sighting replaces a stored
 * name only at the same or a higher rank, so a handle or another server's
 * nickname cannot cover the name someone wears on the home server.
 */
const RANK = Object.freeze({
  username: 0,
  global: 10,
  guild: 20,
  home: 40
});

function text (value) {
  const name = value == null ? '' : String(value).trim();
  return name || null;
}

/**
 * The name a guild member is shown under, and how authoritative it is.
 * On the home server that is the server display name (nickname, else the
 * global display name, else the username). Elsewhere a nickname outranks a
 * global display name, which outranks a username.
 * @param {Object|null} member Guild member.
 * @param {Object|null} [user] Discord user, when the member isn't cached.
 * @param {{ home?: boolean }} [opts]
 * @returns {{ name: string, rank: number }|null}
 */
function memberDisplayName (member, user, opts = {}) {
  const account = (member && member.user) || user || null;
  const nick = text(member && (member.nickname || member.nick));
  const shown = text(member && member.displayName);
  const global = text(account && (account.globalName || account.global_name));
  const username = text(account && account.username);
  if (opts.home) {
    const name = nick || shown || global || username;
    return name ? { name, rank: RANK.home } : null;
  }
  if (nick) return { name: nick, rank: RANK.guild };
  if (global) return { name: global, rank: RANK.global };
  if (shown && shown !== username) return { name: shown, rank: RANK.guild };
  if (username) return { name: username, rank: RANK.username };
  if (shown) return { name: shown, rank: RANK.username };
  return null;
}

/**
 * The higher-ranked of two names. An equal rank keeps the one already held,
 * so walking several servers does not flap between nicknames.
 * @param {{ name: string, rank: number }|null} current
 * @param {{ name: string, rank: number }|null} next
 * @returns {{ name: string, rank: number }|null}
 */
function preferName (current, next) {
  if (!next || !next.name) return current || null;
  if (!current || next.rank > current.rank) return next;
  return current;
}

module.exports = {
  RANK,
  memberDisplayName,
  preferName
};
