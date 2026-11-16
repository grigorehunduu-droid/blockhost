'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const U = require('./lib/util'), proc = require('./lib/proc'), props = require('./lib/props'), inst = require('./lib/installers');
const planner = require('./lib/planner'), mods = require('./lib/mods'), backup = require('./lib/backup'), map = require('./lib/map'), inv = require('./lib/inv'), tex = require('./lib/textures'), ai = require('./lib/ai'), { Zip } = require('./lib/zip');

const TOKEN = crypto.randomBytes(24).toString('hex');
// The page (which carries TOKEN) is only served to whoever knows BOOT. BOOT lives in data/instance.json, which only
// this Windows user can read, so other accounts and web pages cannot fetch the page and lift the token.
const BOOT = crypto.randomBytes(24).toString('hex');
const sameSecret = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://127.0.0.1:8100; frame-src http://127.0.0.1:8100; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const sse = new Set();
let lastClient = Date.now(), port = 0;
const broadcast = (e) => { const s = `data: ${JSON.stringify(e)}\n\n`; for (const c of sse) c.write(s); };
proc.init(broadcast);

const lanAddresses = () => Object.values(require('os').networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')).map((i) => i.address);
const routes = [];
const route = (method, p, fn, opt = {}) => routes.push({ method, re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opt });
const S = (x) => proc.cfgOf(x.params.id);
const bad = (m, code = 400) => Object.assign(new Error(m), { status: code });
const name = (n) => { if (!/^[\w.]{1,16}$/.test(String(n))) throw bad('Invalid player name'); return n; };
const line = (s) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
const rd = (c, f, def) => U.readJson(path.join(proc.dirOf(c), f), def);

route('GET', '/api/ping', () => ({ ok: true, app: 'blockhost' }), { open: true });
const cmpVer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 4; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return 0; };
let upd = { at: 0, v: null };
async function checkUpdate() { // only runs when app/version.json "homepage" is a GitHub project page
  const m = /github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec(U.APP.homepage || '');
  if (!m) return null;
  if (Date.now() - upd.at < 6 * 3600e3) return upd.v;
  try { const r = await U.fetchJson('https://api.github.com/repos/' + m[1] + '/' + m[2].replace(/\.git$/, '') + '/releases/latest'); const latest = String(r.tag_name || '').replace(/^v/i, ''); upd = { at: Date.now(), v: { latest, newer: cmpVer(latest, U.APP.version) > 0, url: r.html_url } }; } catch { upd = { at: Date.now(), v: null }; }
  return upd.v;
}
route('GET', '/api/about', async () => ({ name: U.APP.name, version: U.APP.version, update: await checkUpdate() }));
route('GET', '/api/state', () => ({ servers: proc.list(), ai: aiPublic(), cfKey: !!U.settings.curseforgeKey, lan: lanAddresses(), totalMemMb: Math.round(require('os').totalmem() / 1048576) }));
route('GET', '/api/versions', (x) => inst.versions(x.q.get('type')));
route('POST', '/api/quit', async (x) => { await proc.quitAll(); broadcast({ t: 'quit' }); setTimeout(() => process.exit(0), 300); return { ok: true }; }); // every open window closes itself

// servers
route('POST', '/api/servers', (x) => proc.create(x.body));
route('POST', '/api/servers/:id/start', async (x) => { await proc.start(x.params.id); return { ok: true }; });
route('POST', '/api/servers/:id/stop', (x) => { proc.stop(x.params.id); return { ok: true }; });
route('POST', '/api/servers/:id/restart', (x) => { proc.restart(x.params.id); return { ok: true }; });
route('POST', '/api/servers/:id/kill', (x) => { proc.kill(x.params.id); return { ok: true }; });
route('POST', '/api/servers/:id/config', (x) => proc.update(x.params.id, x.body));
route('POST', '/api/servers/:id/switch', (x) => proc.switchType(x.params.id, x.body.type, x.body.mc));
route('POST', '/api/servers/:id/delete', async (x) => { await proc.remove(x.params.id, !!x.body.deleteFiles); return { ok: true }; });
route('GET', '/api/servers/:id/log', (x) => ({ lines: proc.R(x.params.id).logs.slice(-1500) }));
route('POST', '/api/servers/:id/console', (x) => { proc.send(x.params.id, line(x.body.cmd).replace(/^\//, '')); return { ok: true }; });
route('GET', '/api/servers/:id/chat', (x) => ({ chat: proc.R(x.params.id).chat }));
route('POST', '/api/servers/:id/chat', (x) => { proc.chat(x.params.id, x.body.msg); return { ok: true }; });
route('GET', '/api/servers/:id/stats', (x) => ({ hist: proc.R(x.params.id).hist }));

// properties
route('GET', '/api/servers/:id/properties', (x) => { const d = proc.dirOf(S(x)); let raw = ''; try { raw = fs.readFileSync(path.join(d, 'server.properties'), 'utf8'); } catch {} return { props: props.read(d), raw }; });
route('POST', '/api/servers/:id/properties', (x) => {
  const d = proc.dirOf(S(x));
  if (typeof x.body.raw === 'string') fs.writeFileSync(path.join(d, 'server.properties'), x.body.raw);
  else props.write(d, Object.fromEntries(Object.entries(x.body.props || {}).map(([k, v]) => [k, String(v).replace(/[\r\n]/g, '')])));
  return { ok: true, restartNeeded: proc.R(x.params.id).status === 'running' };
});

// players
route('GET', '/api/servers/:id/players', (x) => { const c = S(x), r = proc.R(c.id); return { online: r.players, pos: r.pos, max: r.max, known: rd(c, 'usercache.json', []), whitelist: rd(c, 'whitelist.json', []), ops: rd(c, 'ops.json', []), banned: rd(c, 'banned-players.json', []), running: r.status === 'running' }; });
route('POST', '/api/servers/:id/players', (x) => {
  const b = x.body, a = b.action, n = a === 'whitelist-on' || a === 'whitelist-off' ? '' : name(b.name), id = x.params.id;
  const cmds = { 'whitelist-add': `whitelist add ${n}`, 'whitelist-remove': `whitelist remove ${n}`, 'whitelist-on': 'whitelist on', 'whitelist-off': 'whitelist off', op: `op ${n}`, deop: `deop ${n}`, kick: `kick ${n} ${line(b.reason)}`, ban: `ban ${n} ${line(b.reason)}`, unban: `pardon ${n}`,
    gamemode: `gamemode ${['survival', 'creative', 'adventure', 'spectator'].includes(b.gamemode) ? b.gamemode : 'survival'} ${n}` };
  if (!cmds[a]) throw bad('Unknown action');
  proc.send(id, cmds[a]); return { ok: true };
});
route('GET', '/api/servers/:id/inventory', async (x) => {
  const c = S(x), uuid = x.q.get('uuid') || '', r = proc.R(c.id);
  if (r.status === 'running' && r.players.some((p) => p.uuid === uuid)) { await proc.query(c.id, 'save-all').catch(() => {}); await U.sleep(1200); }
  const d = inv.read(c, uuid); if (!d) throw bad('No saved data for this player yet', 404); return d;
});

// map
route('GET', '/api/servers/:id/map', (x) => { const c = S(x), dim = x.q.get('dim') || 'overworld', r = proc.R(c.id); return { regions: map.regions(c, dim), textures: tex.hasTextures(), markers: r.pos }; });
route('GET', '/api/servers/:id/map/tile', async (x) => { const b = await map.tile(S(x), x.q.get('dim') || 'overworld', x.q.get('x'), x.q.get('z')); if (!b) throw bad('no tile', 404); return { bin: b, type: 'image/png' }; });
route('POST', '/api/map/textures', async (x) => { await tex.downloadClient(x.body.version); return { ok: true }; });
route('GET', '/api/icon', (x) => { const b = tex.icon(x.q.get('id') || ''); if (!b) throw bad('no icon', 404); return { bin: b, type: 'image/png', cache: true }; });

// mods
route('GET', '/api/servers/:id/mods', (x) => mods.list(S(x)));
route('GET', '/api/servers/:id/mods/search', (x) => mods.search(S(x), x.q.get('q'), x.q.get('offset'), x.q.get('source') === 'curseforge' ? 'curseforge' : 'modrinth'));
route('POST', '/api/servers/:id/mods/install', async (x) => ({ installed: await mods.install(S(x), String(x.body.project), [], x.body.source === 'curseforge' ? 'curseforge' : 'modrinth') }));
route('POST', '/api/servers/:id/mods/toggle', (x) => { mods.toggle(S(x), x.body.file); return { ok: true }; });
route('POST', '/api/servers/:id/mods/remove', (x) => { mods.remove(S(x), x.body.file); return { ok: true }; });
route('GET', '/api/servers/:id/mods/updates', async (x) => mods.updates(S(x)));
route('POST', '/api/servers/:id/mods/update', async (x) => ({ file: await mods.applyUpdate(S(x), x.body.file) }));
route('POST', '/api/servers/:id/mods/upload', async (x) => {
  const c = S(x), f = U.safeName(x.q.get('name')); if (!/\.jar$/.test(f)) throw bad('Only .jar files');
  const dest = path.join(mods.dirOf(c), f), tmp = dest + '.part';
  let n = 0; const out = fs.createWriteStream(tmp);
  for await (const ch of x.req) { n += ch.length; if (n > 512 << 20) { out.destroy(); fs.rmSync(tmp, { force: true }); throw bad('File too large'); } if (!out.write(ch)) await new Promise((r) => out.once('drain', r)); }
  await new Promise((r) => out.end(r));
  try { new Zip(tmp).close(); } catch { fs.rmSync(tmp, { force: true }); throw bad('That is not a valid .jar file'); }
  fs.renameSync(tmp, dest); return { ok: true };
}, { raw: true });

// backups
route('GET', '/api/servers/:id/backups', (x) => backup.list(S(x)));
route('POST', '/api/servers/:id/backups', async (x) => ({ file: await backup.create(S(x), 'manual') }));
route('POST', '/api/servers/:id/backups/restore', async (x) => { await backup.restore(S(x), x.body.file); return { ok: true }; });
route('POST', '/api/servers/:id/backups/delete', (x) => { backup.remove(S(x), x.body.file); return { ok: true }; });

// files (confined to the server folder)
route('GET', '/api/servers/:id/files', (x) => {
  const d = proc.dirOf(S(x)), p = U.safeJoin(d, x.q.get('path') || '');
  return fs.readdirSync(p, { withFileTypes: true }).map((e) => ({ name: e.name, dir: e.isDirectory(), size: e.isFile() ? fs.statSync(path.join(p, e.name)).size : 0 })).sort((a, b) => b.dir - a.dir || a.name.localeCompare(b.name));
});
route('GET', '/api/servers/:id/file', (x) => {
  const p = U.safeJoin(proc.dirOf(S(x)), x.q.get('path')), st = fs.statSync(p);
  if (!st.isFile() || st.size > 2 << 20) throw bad('Too large or not a file');
  const b = fs.readFileSync(p); if (b.includes(0)) throw bad('Binary file');
  return { content: b.toString('utf8') };
});
route('POST', '/api/servers/:id/file', (x) => { const p = U.safeJoin(proc.dirOf(S(x)), x.body.path); if (typeof x.body.content !== 'string') throw bad('content'); fs.writeFileSync(p, x.body.content); return { ok: true }; });

// AI helper
// Usage is tracked locally (tokens/requests made through BlockHost); providers do not expose balances to normal keys.
const today = () => new Date().toISOString().slice(0, 10);
const DEFAULT_BUDGET = 200000;
function usageToday(p) { const u = ((U.settings.ai.usage || {})[today()] || {})[p] || {}; return { requests: u.req || 0, tokens: (u.in || 0) + (u.out || 0), input: u.in || 0, output: u.out || 0 }; }
function addUsage(p, inTok, outTok) {
  const a = U.settings.ai, u = a.usage = a.usage || {}, d = u[today()] = u[today()] || {}, e = d[p] = d[p] || { req: 0, in: 0, out: 0 };
  e.req++; e.in += inTok; e.out += outTok;
  for (const k of Object.keys(u).sort().slice(0, -31)) delete u[k]; // keep a month
  U.saveSettings();
}
const aiPublic = () => ({ provider: U.settings.ai.provider, models: U.settings.ai.models, hasKey: Object.fromEntries(['anthropic', 'openai', 'gemini'].map((p) => [p, !!U.settings.ai.keys[p]])), budget: U.settings.ai.budget || DEFAULT_BUDGET, usage: Object.fromEntries(['anthropic', 'openai', 'gemini'].map((p) => [p, usageToday(p)])) });
route('GET', '/api/ai', () => aiPublic());
route('POST', '/api/curseforge/key', (x) => { if (x.body.key) U.settings.curseforgeKey = String(x.body.key).trim(); else delete U.settings.curseforgeKey; U.saveSettings(); return { hasKey: !!U.settings.curseforgeKey }; });
route('POST', '/api/ai/settings', (x) => {
  const a = U.settings.ai, b = x.body;
  if (['anthropic', 'openai', 'gemini'].includes(b.provider)) a.provider = b.provider;
  if (b.keyFor && ['anthropic', 'openai', 'gemini'].includes(b.keyFor)) { if (b.key) a.keys[b.keyFor] = String(b.key).trim(); else delete a.keys[b.keyFor]; }
  if (b.modelFor && b.model) a.models[b.modelFor] = String(b.model);
  if (Number.isFinite(+b.budget) && +b.budget >= 1000) a.budget = Math.min(+b.budget, 50000000);
  U.saveSettings(); return aiPublic();
});
route('GET', '/api/ai/models', async (x) => { const p = x.q.get('provider'); return { models: await ai.models(p, U.settings.ai.keys[p]) }; });
// AI builds a server from an idea: 1) /plan proposes + verifies, 2) the user reviews, 3) /build creates it.
function aiChatFn() {
  const a = U.settings.ai, p = a.provider, model = a.models[p] || { anthropic: 'claude-sonnet-5-5' }[p];
  if (!a.keys[p]) throw bad('Connect an AI first (Ask AI tab).');
  if (!model) throw bad('Pick a model in the Ask AI tab first.');
  if (usageToday(p).tokens >= (a.budget || DEFAULT_BUDGET)) throw bad("You've reached today's AI limit. You can raise it in the Ask AI tab.", 429);
  return async (system, msgs) => { const r = await ai.chat(p, a.keys[p], model, system, msgs); addUsage(p, r.inTok, r.outTok); return r; };
}
route('POST', '/api/ai/plan', async (x) => { const idea = String(x.body.idea || '').trim(); if (idea.length < 5) throw bad('Describe the server you want in a sentence or two.'); return { plan: await planner.design(idea, aiChatFn()), ai: aiPublic() }; });
route('POST', '/api/ai/build', async (x) => {
  const b = await planner.validateBuild(x.body, Math.floor(require('os').totalmem() / 1048576 * 0.75));
  const s = await proc.create({ name: b.name, type: b.type, mc: b.mc, ramMb: b.ramMb, eula: true }, async (c) => {
    for (const id of b.projects) { try { const got = await mods.install(c, id, []); proc.log(c.id, '[Manager] Added: ' + got.join(', ')); } catch (e) { proc.log(c.id, '[Manager] Could not add one item: ' + e.message); } }
    proc.log(c.id, '[Manager] Your server is ready. Press Start.');
  });
  return s;
});
route('POST', '/api/servers/:id/ai', async (x) => {
  const c = S(x), a = U.settings.ai, p = a.provider, r = proc.R(c.id);
  const model = a.models[p] || { anthropic: 'claude-sonnet-5-5' }[p];
  if (!model) throw bad('Pick a model in the AI Helper settings first.');
  let modList = ''; try { modList = mods.list(c).map((m) => `${m.name} ${m.version}${m.enabled ? '' : ' (disabled)'}`).join(', '); } catch {}
  const system = `You are a Minecraft server admin assistant inside a server manager app.\nServer: ${c.name}; type ${c.type}; Minecraft ${c.mc}; Java ${c.javaMajor}; RAM ${c.ramMb} MB; status ${r.status}; flags ${c.flags}.\nMods/plugins: ${modList || 'none'}.\nRecent log (newest last):\n${r.logs.slice(-150).join('\n').slice(-12000)}\n\nExplain problems plainly for a non-technical user. If a console command would help, put each command alone in a fenced block tagged mc (no leading slash). The user must press Run themselves; never claim a command has been run.`;
  const msgs = (x.body.messages || []).slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 8000) }));
  if (!msgs.length) throw bad('Empty message');
  const budget = a.budget || DEFAULT_BUDGET;
  if (usageToday(p).tokens >= budget) throw bad("You've reached today's AI limit. You can raise it in the Ask AI settings.", 429);
  const out = await ai.chat(p, a.keys[p], model, system, msgs);
  addUsage(p, out.inTok, out.outTok);
  return { reply: out.text, ai: aiPublic() };
});

require('./lib/playit').routes(route); // internet sharing via playit.gg

// ---- HTTP plumbing -------------------------------------------------------------
function hostOk(h) { return /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(h || ''); }
const server = http.createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (!hostOk(req.headers.host)) { res.writeHead(403); return res.end('bad host'); }
    const u = new URL(req.url, 'http://127.0.0.1'), p = decodeURIComponent(u.pathname);
    if (!p.startsWith('/api/')) {
      const f = p === '/' ? 'index.html' : p.slice(1);
      const full = path.resolve(PUB, f);
      if (!full.startsWith(PUB + path.sep) || !fs.existsSync(full)) { res.writeHead(404); return res.end('not found'); }
      if (f === 'index.html' && !sameSecret(u.searchParams.get('boot'), BOOT)) { res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<!doctype html><meta charset=utf-8><title>BlockHost</title><body style="font:16px system-ui;padding:40px"><h2>Open BlockHost from its shortcut</h2><p>This address only works when opened by the BlockHost app.</p>'); }
      let data = fs.readFileSync(full);
      if (f === 'index.html') { res.setHeader('Content-Security-Policy', CSP); data = Buffer.from(data.toString('utf8').replace('__TOKEN__', TOKEN)); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      return res.end(data);
    }
    const origin = req.headers.origin;
    if (origin && !hostOk(new URL(origin).host)) { res.writeHead(403); return res.end('bad origin'); }
    const r = routes.find((r) => r.method === req.method && r.re.test(p));
    if (p === '/api/events') {
      if (u.searchParams.get('token') !== TOKEN) { res.writeHead(401); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`data: ${JSON.stringify({ t: 'hello' })}\n\n`); sse.add(res);
      const hb = setInterval(() => res.write(':\n\n'), 15000);
      return req.on('close', () => { sse.delete(res); clearInterval(hb); lastClient = Date.now(); });
    }
    if (!r) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end('{"error":"not found"}'); }
    if (!r.open && (req.headers['x-blockhost-token'] || (req.method === 'GET' && u.searchParams.get('token'))) !== TOKEN) { res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"error":"unauthorized"}'); }
    const x = { req, q: u.searchParams, params: r.re.exec(p).groups || {}, body: {} };
    if (req.method === 'POST' && !r.raw) { const ch = []; let n = 0; for await (const c of req) { n += c.length; if (n > 4 << 20) throw bad('body too large'); ch.push(c); } if (n) x.body = JSON.parse(Buffer.concat(ch).toString('utf8')); }
    const out = await r.fn(x);
    if (out && out.bin) { res.writeHead(200, { 'Content-Type': out.type, 'Cache-Control': out.cache ? 'max-age=3600' : 'no-store' }); return res.end(out.bin); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out === undefined ? { ok: true } : out));
  } catch (e) {
    if (!res.headersSent) res.writeHead(e.status || 500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e.message }));
  }
});

(async () => {
  const instFile = path.join(U.DATA, 'instance.json');
  for (port = 8765; port < 8800; port++) { const ok = await new Promise((r) => { server.once('error', () => r(false)); server.listen(port, '127.0.0.1', () => r(true)); }); if (ok) break; }
  U.writeJson(instFile, { port, pid: process.pid, boot: BOOT });
  console.log('BlockHost on http://127.0.0.1:' + port);
  // Exit when no servers run and no window has been connected for ~60 s.
  setInterval(() => { if (sse.size) lastClient = Date.now(); else if (!proc.anyRunning() && Date.now() - lastClient > 60000) { try { fs.rmSync(instFile); } catch {} process.exit(0); } }, 5000);
  process.on('exit', () => { try { const j = U.readJson(instFile, {}); if (j.pid === process.pid) fs.rmSync(instFile); } catch {} });
})();
process.on('uncaughtException', (e) => fs.appendFileSync(path.join(U.DATA, 'logs', 'app.log'), new Date().toISOString() + ' ' + (e.stack || e) + '\n'));
process.on('unhandledRejection', (e) => fs.appendFileSync(path.join(U.DATA, 'logs', 'app.log'), new Date().toISOString() + ' ' + (e && e.stack || e) + '\n'));
