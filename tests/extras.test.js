'use strict';
const test = require('node:test'), assert = require('node:assert');
const { RULES, cleanEvents } = require('../app/lib/extras');

const title = (line) => { const r = RULES.find(([re]) => re.test(line)); return r ? r[2](r[0].exec(line)) : null; };

test('log problems read as plain titles, and library noise is ignored', () => {
  assert.strictEqual(title('[20:41:58 ERROR]: [DiscordSRV] No bot token has been set in the config'), 'DiscordSRV has no bot token');
  assert.strictEqual(title('[20:41:55 ERROR]: [PvPManager] You have kill on logout enabled in PvPManager'), 'PvPManager reported a problem');
  assert.strictEqual(title('[20:29:01 WARN]: However, you are 2 releases behind the latest stable release (26.3)!'), 'The server software is 2 versions behind');
  assert.strictEqual(title("[12:00:00 ERROR]: Could not load 'plugins\\Old.jar' in folder 'plugins'"), 'Old.jar could not load');
  assert.strictEqual(title('[20:41:45 ERROR]: [oshi.driver.windows.registry.HkeyPerformanceDataUtil] Unable to locate English counter names'), null);
});

test('events are cleaned: ids given, bad days dropped, slashes removed, bad times refused', () => {
  const [e] = cleanEvents([{ name: 'Snowball fight', time: '20:00', days: [5, 6, 9], cmds: '/give @a snowball 16\n\nsay go!' }]);
  assert.match(e.id, /^[0-9a-f]{8}$/);
  assert.deepStrictEqual(e.days, [5, 6]);
  assert.strictEqual(e.cmds, 'give @a snowball 16\nsay go!');
  assert.throws(() => cleanEvents([{ time: '25:00' }]), /time like 20:00/);
});
