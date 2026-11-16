'use strict';
const fs = require('fs'), path = require('path');
const U = require('./util'), props = require('./props');
const P = () => require('./proc');
const bdir = (c) => path.join(U.DATA, 'backups', c.id);
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };

function worlds(c) {
  const d = P().dirOf(c), lvl = props.read(d)['level-name'] || 'world';
  return [lvl, lvl + '_nether', lvl + '_the_end'].filter((n) => fs.existsSync(path.join(d, n)));
}
function list(c) {
  try { return fs.readdirSync(bdir(c)).filter((f) => f.endsWith('.zip')).map((f) => { const s = fs.statSync(path.join(bdir(c), f)); return { file: f, size: s.size, time: s.mtimeMs, label: (f.match(/^[\d-]+_(.*)\.zip$/) || [])[1] || '' }; }).sort((a, b) => b.time - a.time); } catch { return []; }
}
async function create(c, label = 'manual') {
  const d = P().dirOf(c), ws = worlds(c);
  if (!ws.length) throw new Error('No world folder yet - start the server once first.');
  fs.mkdirSync(bdir(c), { recursive: true });
  U.ensureSpace(bdir(c), ws.reduce((n, w) => n + U.dirSize(path.join(d, w)), 0) * 1.1, 'this backup');
  const out = path.join(bdir(c), `${stamp()}_${label.replace(/[^\w-]/g, '')}.zip`);
  const live = P().R(c.id).status === 'running';
  try {
    if (live) { await P().query(c.id, 'save-off').catch(() => {}); await P().query(c.id, 'save-all flush').catch(() => {}); }
    await U.run(U.TAR, ['-a', '-c', '-f', out, '--exclude', 'session.lock', '-C', d, ...ws]);
    // Self-check: the archive must open and list files, otherwise it is discarded rather than trusted.
    const listing = (await U.run(U.TAR, ['-t', '-f', out])).stdout.trim();
    if (!listing || fs.statSync(out).size < 100) { fs.rmSync(out, { force: true }); throw new Error('The backup did not pass its self-check and was discarded. Please try again.'); }
  } finally { if (live) await P().query(c.id, 'save-on').catch(() => {}); }
  P().log(c.id, `[Manager] Backup created: ${path.basename(out)}`);
  if (label === 'auto') for (const b of list(c).filter((x) => x.label === 'auto').slice(Math.max(1, c.backupKeep || 5))) fs.rmSync(path.join(bdir(c), b.file), { force: true });
  return path.basename(out);
}
async function restore(c, file) {
  if (P().R(c.id).status !== 'stopped') throw new Error('Stop the server before restoring.');
  const zip = path.join(bdir(c), U.safeName(file));
  if (!fs.existsSync(zip)) throw new Error('Backup not found');
  U.ensureSpace(P().dirOf(c), fs.statSync(zip).size * 4, 'restoring this backup');
  const d = P().dirOf(c), t = stamp();
  for (const w of worlds(c)) fs.renameSync(path.join(d, w), path.join(d, `${w}_before_restore_${t}`));
  await U.run(U.TAR, ['-x', '-f', zip, '-C', d]);
  P().log(c.id, `[Manager] Restored ${file}. The previous world was kept as *_before_restore_${t}.`);
}
const remove = (c, file) => fs.rmSync(path.join(bdir(c), U.safeName(file)), { force: true });
module.exports = { create, restore, remove, list, bdir };
