'use strict';

const assert = require('assert');
const { RANK, memberDisplayName, preferName } = require('../functions/displayName');

describe('Discord display names', function () {
  const user = { username: 'neorion', globalName: 'Neo' };

  it('ranks a home-server display name above every other name', function () {
    const home = memberDisplayName({ nickname: '[G00N] Neorion', displayName: '[G00N] Neorion', user }, user, { home: true });
    const elsewhere = memberDisplayName({ nickname: 'Neo @ TRDE', displayName: 'Neo @ TRDE', user }, user, { home: false });
    const global = memberDisplayName(null, user, { home: false });
    const handle = memberDisplayName(null, { username: 'neorion' }, { home: false });
    assert.strictEqual(home.rank, RANK.home);
    assert.strictEqual(elsewhere.rank, RANK.guild);
    assert.strictEqual(global.rank, RANK.global);
    assert.strictEqual(handle.rank, RANK.username);
    const best = [handle, global, elsewhere, home].reduce(preferName, null);
    assert.deepStrictEqual(best, { name: '[G00N] Neorion', rank: RANK.home });
  });

  it('uses the home server display name even when it is only the global name', function () {
    const shown = memberDisplayName({ nickname: null, displayName: 'Neo', user }, user, { home: true });
    assert.deepStrictEqual(shown, { name: 'Neo', rank: RANK.home });
    const other = memberDisplayName({ nickname: 'Side Nick', displayName: 'Side Nick', user }, user, { home: false });
    assert.strictEqual(preferName(other, shown).name, 'Neo');
  });

  it('keeps the name already held when two servers tie', function () {
    const first = { name: 'A', rank: RANK.guild };
    const second = { name: 'B', rank: RANK.guild };
    assert.strictEqual(preferName(first, second).name, 'A');
  });
});
