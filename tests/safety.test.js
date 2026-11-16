'use strict';
// Path confinement, file names, verified downloads, friendly network errors, server.properties editing.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), crypto = require('crypto');
process.env.BLOCKHOST_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-data-')); // never touch the real data folder
const U = require('../app/lib/util'), props = require('../app/lib/props');

test('safeJoin keeps paths inside the server folder', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-base-'));
  assert.equal(U.safeJoin(base, 'config/a.yml'), path.join(base, 'config', 'a.yml'));
  assert.equal(U.safeJoin(base, '/logs/latest.log'), path.join(base, 'logs', 'latest.log'));
  assert.throws(() => U.safeJoin(base, '../outside.txt'));
  assert.throws(() => U.safeJoin(base, 'a/../../outside.txt'));
});
test('safeName refuses paths and odd names', () => {
  assert.equal(U.safeName('mod-1.2.jar'), 'mod-1.2.jar');
  for (const bad of ['', '../x.jar', 'a/b.jar', 'C:\\x.jar', '.hidden', 'x?.jar']) assert.throws(() => U.safeName(bad), bad);
});

function serve(body) {
  return new Promise((resolve) => { const s = http.createServer((q, r) => { r.writeHead(200); r.end(body); }); s.listen(0, '127.0.0.1', () => resolve(s)); });
}
test('download keeps the file only when its checksum matches', async () => {
  const body = Buffer.from('server jar bytes'), s = await serve(body), url = `http://127.0.0.1:${s.address().port}/f`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-dl-'));
  try {
    const sha1 = crypto.createHash('sha1').update(body).digest('hex');
    await U.download(url, path.join(dir, 'ok.jar'), { sha1 });
    assert.ok(fs.existsSync(path.join(dir, 'ok.jar')));
    await assert.rejects(U.download(url, path.join(dir, 'bad.jar'), { sha512: '00'.repeat(64) }), /safety check/);
    assert.ok(!fs.existsSync(path.join(dir, 'bad.jar')) && !fs.existsSync(path.join(dir, 'bad.jar.part')), 'rejected file must not be left behind');
  } finally { s.close(); }
});
test('network failures read as plain language', async () => {
  const s = await serve('x'); const port = s.address().port; await new Promise((r) => s.close(r)); // a port nothing listens on
  await assert.rejects(U.fetchJson(`http://127.0.0.1:${port}/`), /Couldn't reach 127\.0\.0\.1:\d+\. Check your internet connection/);
});
test('a slow server reads as "took too long", not as "no internet"', async () => {
  const s = http.createServer(() => {}); await new Promise((r) => s.listen(0, '127.0.0.1', r)); // accepts, never answers
  try { await assert.rejects(U.fetchJson(`http://127.0.0.1:${s.address().port}/`, { timeout: 300 }), /took too long to answer/); }
  finally { s.closeAllConnections(); s.close(); }
});
test('ensureSpace refuses when the disk is too full', () => {
  assert.throws(() => U.ensureSpace(os.tmpdir(), Number.MAX_SAFE_INTEGER, 'a test'), /Not enough free disk space for a test/);
  U.ensureSpace(os.tmpdir(), 1, 'a test');
});

test('server.properties edits keep comments and order', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-props-'));
  fs.writeFileSync(path.join(dir, 'server.properties'), '#Minecraft server properties\nmotd=Hello\nmax-players=20\n');
  props.write(dir, { 'max-players': 8, 'white-list': 'true' });
  const text = fs.readFileSync(path.join(dir, 'server.properties'), 'utf8');
  assert.ok(text.startsWith('#Minecraft server properties\nmotd=Hello\nmax-players=8\n'));
  assert.deepEqual(props.read(dir), { motd: 'Hello', 'max-players': '8', 'white-list': 'true' });
});
