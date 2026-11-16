'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const { DATA, fetchJson, fetchBuf, download, run, TAR, ensureSpace } = require('./util');

const LTS = [8, 11, 17, 21, 25];
const cmpVer = (a, b) => { const x = a.split(/[.-]/), y = b.split(/[.-]/); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (parseInt(y[i]) || 0) - (parseInt(x[i]) || 0); if (d) return d; } return 0; }; // descending

// ---- Java ------------------------------------------------------------------
async function ensureJava(major, log = () => {}) {
  const want = LTS.find((v) => v >= major) || 25;
  const dir = path.join(DATA, 'java', String(want));
  const find = () => { try { const d = fs.readdirSync(dir).map((n) => path.join(dir, n)).find((p) => fs.existsSync(path.join(p, 'bin', 'java.exe'))); return d && path.join(d, 'bin', 'java.exe'); } catch { return null; } };
  let j = find();
  if (j) return j;
  log(`Downloading Java ${want} (one-time, ~50 MB)...`);
  ensureSpace(path.join(DATA, 'java'), 6e8, 'Java');
  const zip = path.join(DATA, 'cache', `jre${want}.zip`);
  let pkg = null;
  try { const meta = await fetchJson(`https://api.adoptium.net/v3/assets/latest/${want}/hotspot?architecture=x64&image_type=jre&os=windows&vendor=eclipse`); pkg = meta[0] && meta[0].binary && meta[0].binary.package; } catch {}
  if (pkg && pkg.link && pkg.checksum) await download(pkg.link, zip, { sha256: pkg.checksum });
  else { log('Could not fetch the Java checksum; downloading without verifying it.'); await download(`https://api.adoptium.net/v3/binary/latest/${want}/ga/windows/x64/jre/hotspot/normal/eclipse`, zip); }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await run(TAR, ['-xf', zip, '-C', dir]);
  fs.rmSync(zip, { force: true });
  j = find();
  if (!j) throw new Error('Java extraction failed');
  log(`Java ${want} ready.`);
  return j;
}

// ---- Version lists -----------------------------------------------------------
let manifest = null, manifestAt = 0;
async function mojang() {
  if (!manifest || Date.now() - manifestAt > 600000) { manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'); manifestAt = Date.now(); }
  return manifest;
}
async function mojangVersion(id) {
  const m = await mojang(); const v = m.versions.find((x) => x.id === id);
  if (!v) throw new Error('Unknown Minecraft version ' + id);
  return fetchJson(v.url);
}
const nfMc = (v) => { const p = v.split(/[.-]/); return +p[0] >= 26 ? p[0] + '.' + p[1] + (p[2] && p[2] !== '0' ? '.' + p[2] : '') : '1.' + p[0] + (p[1] !== '0' ? '.' + p[1] : ''); };
async function neoList() {
  const j = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
  const best = new Map();
  for (const v of j.versions) { if (/alpha|snapshot/i.test(v)) continue; const mc = nfMc(v); const cur = best.get(mc); if (!cur || /beta/.test(cur) || !/beta/.test(v)) best.set(mc, v); }
  return best;
}
async function forgeList() {
  const j = (await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json')).promos;
  const best = new Map();
  for (const [k, v] of Object.entries(j)) { const [mc, kind] = k.split(/-(?=recommended$|latest$)/); if (!best.has(mc) || kind === 'recommended') best.set(mc, v); }
  return best;
}
async function versions(type) {
  if (type === 'vanilla') { const m = await mojang(); return m.versions.filter((v) => v.type === 'release').map((v) => ({ id: v.id })); }
  if (type === 'paper') { const j = await fetchJson('https://fill.papermc.io/v3/projects/paper'); return Object.values(j.versions).flat().filter((v) => !/rc|pre/i.test(v)).map((id) => ({ id })); }
  if (type === 'purpur') return (await fetchJson('https://api.purpurmc.org/v2/purpur')).versions.reverse().map((id) => ({ id }));
  if (type === 'fabric') return (await fetchJson('https://meta.fabricmc.net/v2/versions/game')).filter((v) => v.stable).map((v) => ({ id: v.version }));
  if (type === 'neoforge') return [...(await neoList())].sort((a, b) => cmpVer(a[0], b[0])).map(([id, v]) => ({ id, build: v, beta: /beta/.test(v) }));
  if (type === 'forge') return [...(await forgeList())].sort((a, b) => cmpVer(a[0], b[0])).map(([id, v]) => ({ id, build: v }));
  throw new Error('unknown server type ' + type);
}

// ---- Install -------------------------------------------------------------------
// Installs `type`/`mc` into `dir`. Returns config patch: {javaMajor, launch:{jar}|{args}, paperFlags}
async function install({ dir, type, mc }, log) {
  fs.mkdirSync(dir, { recursive: true });
  ensureSpace(dir, ['forge', 'neoforge', 'fabric'].includes(type) ? 2.5e9 : 1.5e9, 'this server');
  const vj = await mojangVersion(mc);
  const javaMajor = vj.javaVersion?.majorVersion || 8;
  const javaExe = await ensureJava(javaMajor, log);
  const out = { javaMajor, paperFlags: null, launch: null };
  const jar = path.join(dir, 'server.jar');
  const prog = (n, t) => log(`  downloaded ${(n / 1048576).toFixed(1)} MB${t ? ' / ' + (t / 1048576).toFixed(1) + ' MB' : ''}`);
  log(`Installing ${type} ${mc}...`);
  if (type === 'vanilla') await download(vj.downloads.server.url, jar, { sha1: vj.downloads.server.sha1, onProgress: prog });
  else if (type === 'paper') {
    const base = 'https://fill.papermc.io/v3/projects/paper/versions/' + encodeURIComponent(mc);
    const builds = await fetchJson(base + '/builds');
    const b = builds.find((x) => x.channel === 'STABLE') || builds[0];
    if (!b) throw new Error('No Paper build for ' + mc);
    const d = b.downloads['server:default'];
    await download(d.url, jar, { sha256: d.checksums?.sha256, onProgress: prog });
    try { const f = (await fetchJson(base)).java?.flags?.recommended; out.paperFlags = Array.isArray(f) ? f : typeof f === 'string' ? f.split(/\s+/) : null; } catch {}
  } else if (type === 'purpur') {
    const info = await fetchJson(`https://api.purpurmc.org/v2/purpur/${encodeURIComponent(mc)}/latest`);
    await download(`https://api.purpurmc.org/v2/purpur/${encodeURIComponent(mc)}/${info.build}/download`, jar, { md5: info.md5, onProgress: prog });
  }
  else if (type === 'fabric') {
    const loader = (await fetchJson('https://meta.fabricmc.net/v2/versions/loader')).find((v) => v.stable).version;
    const inst = (await fetchJson('https://meta.fabricmc.net/v2/versions/installer')).find((v) => v.stable).version;
    await download(`https://meta.fabricmc.net/v2/versions/loader/${mc}/${loader}/${inst}/server/jar`, jar, { onProgress: prog });
  } else if (type === 'neoforge' || type === 'forge') {
    let url, name;
    if (type === 'neoforge') { const v = (await neoList()).get(mc); if (!v) throw new Error('No NeoForge for ' + mc); url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${v}/neoforge-${v}-installer.jar`; name = `neoforge-${v}-installer.jar`; }
    else { const v = (await forgeList()).get(mc); if (!v) throw new Error('No Forge for ' + mc); url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mc}-${v}/forge-${mc}-${v}-installer.jar`; name = `forge-${mc}-${v}-installer.jar`; }
    const inst = path.join(DATA, 'cache', name);
    if (!fs.existsSync(inst)) {
      let sha1; try { const r = await fetchBuf(url + '.sha1'); if (r.status === 200) sha1 = r.body.toString().trim().split(/\s+/)[0]; } catch {}
      if (!sha1) log('No published checksum found for the installer; continuing.');
      await download(url, inst, { sha1, onProgress: prog });
    }
    log('Running the installer (this downloads libraries and can take several minutes)...');
    await new Promise((resolve, reject) => {
      const p = cp.spawn(javaExe, ['-jar', inst, '--installServer', dir], { cwd: dir, windowsHide: true });
      const pipe = (d) => d.toString().split(/\r?\n/).filter(Boolean).forEach((l) => log('  ' + l));
      p.stdout.on('data', pipe); p.stderr.on('data', pipe);
      p.on('error', reject); p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('Installer exited with code ' + c))));
    });
    out.launch = parseRunBat(dir);
  } else throw new Error('unknown server type ' + type);
  out.launch = out.launch || { jar: 'server.jar' };
  return out;
}

// Forge/NeoForge: take the run.bat `java` line that uses the generated win_args.txt, minus user_jvm_args and %*.
function parseRunBat(dir) {
  const bat = path.join(dir, 'run.bat');
  if (fs.existsSync(bat)) {
    for (const line of fs.readFileSync(bat, 'utf8').split(/\r?\n/)) {
      const m = line.match(/\bjava(?:\.exe)?"?\s+(.*win_args\.txt.*)$/i);
      if (m) { const args = m[1].split(/\s+/).filter((a) => a && a !== '@user_jvm_args.txt' && a !== '%*'); return { args }; }
    }
  }
  const jar = fs.readdirSync(dir).find((f) => /^forge-.*\.jar$/.test(f) && !/installer/.test(f));
  if (jar) return { jar };
  throw new Error('Could not find how to launch this Forge/NeoForge install');
}

module.exports = { ensureJava, versions, install, mojang, mojangVersion };
