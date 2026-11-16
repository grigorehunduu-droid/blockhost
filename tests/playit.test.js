'use strict';
// node --test tests/
const test = require('node:test'), assert = require('node:assert');
process.env.BLOCKHOST_DATA = require('path').join(require('os').tmpdir(), 'blockhost-test-data');
const { addressFor } = require('../app/lib/playit');

test('playit address: Minecraft Java uses the bare domain, others add the port', () => {
  const t = [
    { local_port: 25565, tunnel_type: 'minecraft-java', assigned_domain: 'abc.joinmc.link', custom_domain: null, port: { from: 12345 }, disabled: null },
    { local_port: 25566, tunnel_type: null, assigned_domain: 'x.ply.gg', custom_domain: null, port: { from: 4000 }, disabled: { reason: 'x' } },
  ];
  assert.deepStrictEqual(addressFor(t, 25565), { address: 'abc.joinmc.link', withPort: 'abc.joinmc.link:12345', disabled: false });
  assert.deepStrictEqual(addressFor(t, 25566), { address: 'x.ply.gg:4000', withPort: 'x.ply.gg:4000', disabled: true });
  assert.strictEqual(addressFor(t, 1), null);
});
