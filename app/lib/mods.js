'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const U = require('./util'), { Zip } = require('./zip');
const P = () => require('./proc');
const API = 'https://api.modrinth.com/v2';
const LOADERS = { fabric: ['fabric'], forge: ['forge'], neoforge: ['neoforge'], paper: ['paper', 'spigot', 'bukkit'], purpur: ['purpur', 'paper', 'spigot', 'bukkit'] };
const folder = (c) => { if (P().MODDED(c.type)) return 'mods'; if (P().PLUGIN(c.type)) return 'plugins'; throw new Error('Vanilla servers cannot use mods or plugins. Switch to Paper, Fabric, etc.'); };
const dirOf = (c) => { const d = path.join(P().dirOf(c), folder(c)); fs.mkdirSync(d, { recursive: true }); return d; };
// Renamed from .mcsm-mods.json; moved over on first use so installed-from-Modrinth records are kept.
const recFile = (c) => { const d = dirOf(c), f = path.join(d, '.blockhost-mods.json'), old = path.join(d, '.mcsm-mods.json'); if (!fs.existsSync(f) && fs.existsSync(old)) { try { fs.renameSync(old, f); } catch {} } return f; };
const records = (c) => U.readJson(recFile(c), {});

async function search(c, q, offset = 0, source = 'modrinth') {
  folder(c);
  if (source === 'curseforge') return cfSearch(c, q, offset);
  const plugin = P().PLUGIN(c.type);
  const facets = [[`project_type:${plugin ? 'plugin' : 'mod'}`], LOADERS[c.type].map((l) => `categories:${l}`), [`versions:${c.mc}`]];
  const j = await U.fetchJson(`${API}/search?query=${encodeURIComponent(q || '')}&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=20&offset=${+offset || 0}`);
  return { total: j.total_hits, hits: j.hits.filter((h) => h.server_side !== 'unsupported').map((h) => ({ id: h.project_id, slug: h.slug, title: h.title, description: h.description, icon: h.icon_url, downloads: h.downloads, author: h.author, client: h.client_side, server: h.server_side })) };
}
async function install(c, projectId, done = [], source = 'modrinth') {
  if (source === 'curseforge') return cfInstall(c, projectId, done);
  const dir = dirOf(c), rec = records(c);
  if (Object.values(rec).some((r) => r.project_id === projectId) || done.includes(projectId)) return [];
  done.push(projectId);
  const qs = `loaders=${encodeURIComponent(JSON.stringify(LOADERS[c.type]))}&game_versions=${encodeURIComponent(JSON.stringify([c.mc]))}`;
  const vs = await U.fetchJson(`${API}/project/${encodeURIComponent(projectId)}/version?${qs}`);
  const v = vs.find((x) => x.version_type === 'release') || vs[0];
  if (!v) throw new Error(`No version compatible with ${c.type} ${c.mc}`);
  const f = v.files.find((x) => x.primary) || v.files[0], name = U.safeName(f.filename);
  await U.download(f.url, path.join(dir, name), { sha512: f.hashes && f.hashes.sha512 });
  rec[name] = { project_id: projectId, version_id: v.id, version: v.version_number };
  U.writeJson(recFile(c), rec);
  const got = [name];
  for (const dep of v.dependencies || []) if (dep.dependency_type === 'required' && dep.project_id) {
    try { got.push(...await install(c, dep.project_id, done)); } catch (e) { got.push(`(dependency failed: ${e.message})`); }
  }
  return got;
}

// ---- CurseForge (needs the user's free API key from console.curseforge.com) ----------
const CF = 'https://api.curseforge.com/v1', CF_LOADER = { fabric: 4, forge: 1, neoforge: 6 };
const cfGet = (p) => { const k = U.settings.curseforgeKey; if (!k) throw Object.assign(new Error('Add your CurseForge API key first (free at console.curseforge.com).'), { status: 400 }); return U.fetchJson(CF + p, { headers: { 'x-api-key': k } }); };
async function cfSearch(c, q, offset) {
  const plugin = P().PLUGIN(c.type), ld = CF_LOADER[c.type];
  const j = await cfGet(`/mods/search?gameId=432&classId=${plugin ? 5 : 6}&gameVersion=${encodeURIComponent(c.mc)}${ld ? '&modLoaderType=' + ld : ''}&searchFilter=${encodeURIComponent(q || '')}&sortField=2&sortOrder=desc&pageSize=20&index=${+offset || 0}`);
  return { total: j.pagination.totalCount, hits: j.data.map((h) => ({ id: String(h.id), title: h.name, description: h.summary, icon: h.logo && h.logo.thumbnailUrl, downloads: h.downloadCount, author: (h.authors[0] || {}).name || '' })) };
}
async function cfInstall(c, modId, done) {
  const dir = dirOf(c), rec = records(c), ld = CF_LOADER[c.type];
  if (Object.values(rec).some((r) => r.source === 'curseforge' && r.project_id === modId) || done.includes('cf' + modId)) return [];
  done.push('cf' + modId);
  const fs_ = (await cfGet(`/mods/${encodeURIComponent(modId)}/files?gameVersion=${encodeURIComponent(c.mc)}${ld ? '&modLoaderType=' + ld : ''}&pageSize=20`)).data;
  const f = fs_.filter((x) => x.releaseType === 1).sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate))[0] || fs_.sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate))[0];
  if (!f) throw new Error(`No version compatible with ${c.type} ${c.mc} on CurseForge`);
  const name = U.safeName(f.fileName), url = f.downloadUrl || `https://edge.forgecdn.net/files/${Math.floor(f.id / 1000)}/${f.id % 1000}/${encodeURIComponent(f.fileName)}`;
  const sh = (f.hashes || []).find((x) => x.algo === 1);
  await U.download(url, path.join(dir, name), { sha1: sh && sh.value });
  rec[name] = { source: 'curseforge', project_id: String(modId), version_id: String(f.id) };
  U.writeJson(recFile(c), rec);
  const got = [name];
  for (const d of f.dependencies || []) if (d.relationType === 3) { try { got.push(...await cfInstall(c, String(d.modId), done)); } catch (e) { got.push(`(dependency failed: ${e.message})`); } }
  return got;
}

const sha1Cache = new Map();
function sha1(file) {
  const s = fs.statSync(file), k = file + s.mtimeMs + s.size;
  if (!sha1Cache.has(k)) sha1Cache.set(k, crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex'));
  return sha1Cache.get(k);
}
function meta(file) {
  let z; const m = {};
  try {
    z = new Zip(file);
    const t = (n) => (z.has(n) ? z.read(n).toString('utf8') : null);
    let s;
    if ((s = t('fabric.mod.json'))) { const j = JSON.parse(s.replace(/^﻿/, '')); Object.assign(m, { id: j.id, name: j.name || j.id, version: j.version, kind: 'fabric' }); }
    else if ((s = t('META-INF/neoforge.mods.toml') || t('META-INF/mods.toml'))) Object.assign(m, { id: (s.match(/modId\s*=\s*"([^"]*)"/) || [])[1], name: (s.match(/displayName\s*=\s*"([^"]*)"/) || [])[1], version: (s.match(/^\s*version\s*=\s*"([^"]*)"/m) || [])[1], kind: 'forge' });
    else if ((s = t('paper-plugin.yml') || t('plugin.yml'))) Object.assign(m, { name: (s.match(/^name:\s*['"]?([^\r\n'"]+)/m) || [])[1], version: (s.match(/^version:\s*['"]?([^\r\n'"]+)/m) || [])[1], kind: 'plugin' });
  } catch { m.error = 'unreadable'; } finally { z && z.close(); }
  return m;
}
function list(c) {
  const dir = dirOf(c), rec = records(c);
  return fs.readdirSync(dir).filter((f) => /\.jar(\.disabled)?$/.test(f)).map((f) => {
    const p = path.join(dir, f), base = f.replace(/\.disabled$/, ''), m = meta(p);
    return { file: f, enabled: !f.endsWith('.disabled'), size: fs.statSync(p).size, name: m.name || base, version: m.version || '', id: m.id || '', error: m.error, project: (rec[base] || {}).project_id || null };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
function toggle(c, file) {
  const dir = dirOf(c), f = U.safeName(file), to = f.endsWith('.disabled') ? f.slice(0, -9) : f + '.disabled';
  if (!/\.jar(\.disabled)?$/.test(f)) throw new Error('not a jar');
  fs.renameSync(path.join(dir, f), path.join(dir, to));
  const rec = records(c), b = f.replace(/\.disabled$/, ''), nb = to.replace(/\.disabled$/, ''); if (rec[b] && b !== nb) { rec[nb] = rec[b]; delete rec[b]; U.writeJson(recFile(c), rec); }
}
function remove(c, file) { const f = U.safeName(file); if (!/\.jar(\.disabled)?$/.test(f)) throw new Error('not a jar'); fs.rmSync(path.join(dirOf(c), f), { force: true }); }

async function updates(c) {
  const dir = dirOf(c), files = fs.readdirSync(dir).filter((f) => /\.jar(\.disabled)?$/.test(f));
  if (!files.length) return [];
  const byHash = {}; for (const f of files) byHash[sha1(path.join(dir, f))] = f;
  const r = await U.fetchJson(`${API}/version_files/update`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hashes: Object.keys(byHash), algorithm: 'sha1', loaders: LOADERS[c.type], game_versions: [c.mc] }) });
  const out = [];
  for (const [h, v] of Object.entries(r)) if (!v.files.some((f) => f.hashes.sha1 === h)) { const f = v.files.find((x) => x.primary) || v.files[0]; out.push({ file: byHash[h], latest: v.version_number, filename: f.filename, url: f.url, sha512: f.hashes && f.hashes.sha512, project_id: v.project_id, version_id: v.id }); }
  return out;
}
async function applyUpdate(c, file) {
  const u = (await updates(c)).find((x) => x.file === file);
  if (!u) throw new Error('No update available');
  const dir = dirOf(c), disabled = file.endsWith('.disabled'), name = U.safeName(u.filename);
  await U.download(u.url, path.join(dir, name + (disabled ? '.disabled' : '')), { sha512: u.sha512 });
  if (name + (disabled ? '.disabled' : '') !== file) fs.rmSync(path.join(dir, U.safeName(file)), { force: true });
  const rec = records(c); delete rec[file.replace(/\.disabled$/, '')]; rec[name] = { project_id: u.project_id, version_id: u.version_id, version: u.latest }; U.writeJson(recFile(c), rec);
  return name;
}
module.exports = { search, install, list, toggle, remove, updates, applyUpdate, dirOf };
