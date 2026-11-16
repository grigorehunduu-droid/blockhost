'use strict';
// RCON client against a fake server, AI build-plan validation, and the release secret gate.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), net = require('net'), cp = require('child_process');
process.env.BLOCKHOST_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-data-'));
const { Rcon } = require('../app/lib/rcon');

function packet(id, type, body) { const b = Buffer.from(body), o = Buffer.alloc(14 + b.length); o.writeInt32LE(10 + b.length, 0); o.writeInt32LE(id, 4); o.writeInt32LE(type, 8); b.copy(o, 12); return o; }
function fakeRcon(password) {
  return new Promise((resolve) => {
    const srv = net.createServer((sock) => {
      let buf = Buffer.alloc(0);
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 4 && buf.length >= 4 + buf.readInt32LE(0)) {
          const len = buf.readInt32LE(0), id = buf.readInt32LE(4), type = buf.readInt32LE(8), body = buf.toString('utf8', 12, 4 + len - 2);
          buf = buf.subarray(4 + len);
          if (type === 3) sock.write(packet(body === password ? id : -1, 2, ''));
          else if (type === 2) { sock.write(packet(id, 0, 'part one, ')); sock.write(packet(id, 0, 'part two for ' + body)); } // reply split over two packets
          else sock.write(packet(id, 0, 'Unknown request 0')); // sentinel echo
        }
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}
test('RCON: joins multi-packet replies and keeps commands in order', async () => {
  const srv = await fakeRcon('pw'); const r = await new Rcon(srv.address().port, 'pw').connect();
  try {
    const [a, b] = await Promise.all([r.cmd('list'), r.cmd('tps')]);
    assert.equal(a, 'part one, part two for list'); assert.equal(b, 'part one, part two for tps');
  } finally { r.close(); srv.close(); }
});
test('RCON: a wrong password is refused', async () => {
  const srv = await fakeRcon('pw');
  try { await assert.rejects(new Rcon(srv.address().port, 'nope').connect(), /auth failed/); } finally { srv.close(); }
});

test('AI build plans are validated before anything is created', async () => {
  const inst = require('../app/lib/installers');
  inst.versions = async () => [{ id: '1.21.11' }, { id: '1.21.10' }]; // no network in tests
  const planner = require('../app/lib/planner');
  await assert.rejects(planner.validateBuild({ eula: false, type: 'fabric', mc: '1.21.11' }, 8000), /EULA/);
  await assert.rejects(planner.validateBuild({ eula: true, type: 'bukkit', mc: '1.21.11' }, 8000), /Unknown server type/);
  await assert.rejects(planner.validateBuild({ eula: true, type: 'fabric', mc: '9.9' }, 8000), /not available/);
  const ok = await planner.validateBuild({ eula: true, type: 'fabric', mc: '1.21.11', name: 'x'.repeat(99), ramMb: 999999, mods: ['AANobbMI', '../../evil', 'gvQqBUqZ'] }, 8000);
  assert.equal(ok.name.length, 40); assert.equal(ok.ramMb, 8000); assert.deepEqual(ok.projects, ['AANobbMI', 'gvQqBUqZ']);
});
test('AI plans only use mods whose names match exactly', async () => {
  const mods = require('../app/lib/mods');
  mods.search = async (c, q) => ({ hits: q === 'Lithium' ? [{ id: 'gvQqBUqZ', slug: 'lithium', title: 'Lithium' }] : [{ id: 'zzzzzzzz', slug: 'sodium-path-blocks', title: 'Sodium Path Blocks' }] });
  const inst = require('../app/lib/installers'); inst.versions = async () => [{ id: '1.21.11' }];
  const planner = require('../app/lib/planner');
  const plan = await planner.design('idea', async () => ({ text: JSON.stringify({ type: 'fabric', mc: '1.21.11', mods: [{ query: 'Lithium' }, { query: 'Sodium' }] }) }));
  assert.deepEqual(plan.mods.map((m) => [m.query, m.found]), [['Lithium', true], ['Sodium', false]]);
});

test('release gate fails when a key is present and passes when clean', () => {
  const run = (dir) => cp.spawnSync(process.execPath, [path.join(__dirname, '..', 'tools', 'check-secrets.js'), dir], { encoding: 'utf8' });
  const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-gate-')); fs.writeFileSync(path.join(clean, 'readme.txt'), 'nothing secret here');
  assert.equal(run(clean).status, 0);
  const dirty = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-gate-')); fs.writeFileSync(path.join(dirty, 'notes.txt'), 'key AIzaSyFAKEFAKEFAKEFAKEFAKEFAKEFAKE12345');
  assert.equal(run(dirty).status, 1);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-gate-')); fs.mkdirSync(path.join(data, 'data'));
  assert.equal(run(data).status, 1, 'a data folder must never be packaged');
});
