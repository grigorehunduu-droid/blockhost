'use strict';
// Extra tools: problems spotted in the log, timed events, phone alerts, new world + seed test,
// pre-generating land (Chunky), LuckPerms ranks, and voice chat setup.
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const U = require('./util'), props = require('./props'), inst = require('./installers'), mods = require('./mods'), { Rcon } = require('./rcon');
const P = () => require('./proc');
const bad = (m, code = 400) => Object.assign(new Error(m), { status: code });
const stopped = (c) => ['stopped', 'error', 'crashed'].includes(P().R(c.id).status);
const plugins = (c) => c.type === 'paper' || c.type === 'purpur';

// ---- problems: known trouble in the log since the last start, in plain words --------------------------------
// [pattern, level, title(m), fix(m)]; the first rule that matches a line wins.
const RULES = [
  [/UnsupportedClassVersionError|compiled by a more recent version of the Java Runtime/, 'bad', () => 'An add-on needs a newer Java', () => 'One of your mods or plugins is made for a newer Minecraft. Update the server version, or remove that add-on.'],
  [/FAILED TO BIND TO PORT|Address already in use/i, 'bad', () => 'The server port is already taken', () => 'Another program or server is using this port. Close it, or give this server another port.'],
  [/OutOfMemoryError/, 'bad', () => 'The server ran out of memory', () => 'Give it more memory on the Home page.'],
  [/Can't keep up!/, 'warn', () => 'The server is lagging', () => 'Too much is happening at once. Pre-generate the world, lower “How far players see”, or give it more memory.'],
  [/Could not load '(?:[^']*[\\/])?([^\\/']+\.jar)'/, 'bad', (m) => `${m[1]} could not load`, () => 'It is probably made for another Minecraft version. Look for an update in Add-ons, or remove it.'],
  [/Error occurred while enabling (\S+)/, 'bad', (m) => `${m[1]} broke while starting`, () => 'Check its settings file, or look for an update in Add-ons.'],
  [/No bot token/i, 'warn', () => 'DiscordSRV has no bot token', () => 'Put a Discord bot token in plugins/DiscordSRV/config.yml, or remove DiscordSRV if you do not use it.'],
  [/you are (\d+) (?:releases?|versions?) behind/i, 'warn', (m) => `The server software is ${m[1]} version${m[1] > 1 ? 's' : ''} behind`, () => 'Updates bring fixes. Switch version on the Home page (a backup is made first).'],
  [/Incompatible mods found|requires (?:version |any version )?\S* ?of ([\w-]+)/i, 'bad', (m) => (m[1] ? `A mod needs ${m[1]}` : 'Some mods do not work together'), () => 'Add the missing mod in Add-ons, or remove the mod asking for it.'],
  [/ERROR\]:? \[([\w -]{2,40})\] (.{4,200})/, 'warn', (m) => `${m[1]} reported a problem`, (m) => m[2].trim()],
];
function problems(c) {
  const logs = P().R(c.id).logs, from = logs.map((l) => l.startsWith('[Manager] Starting:')).lastIndexOf(true);
  const found = new Map();
  for (const raw of logs.slice(Math.max(0, from))) {
    const l = U.stripCodes(raw);
    for (const [re, level, title, fix] of RULES) {
      const m = re.exec(l); if (!m) continue;
      const t = title(m), e = found.get(t) || { level, title: t, count: 0 };
      e.count++; e.fix = fix(m); e.line = l.slice(0, 300); found.set(t, e);
      break;
    }
  }
  return [...found.values()].sort((a, b) => (a.level === 'bad' ? 0 : 1) - (b.level === 'bad' ? 0 : 1));
}

// ---- timed events: run commands at a time of day -------------------------------------------------------------
function cleanEvents(list) {
  if (!Array.isArray(list) || list.length > 50) throw bad('Too many events.');
  return list.map((e) => {
    const time = String(e.time || ''); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw bad('Every event needs a time like 20:00.');
    const cmds = String(e.cmds || '').split(/\r?\n/).map((s) => s.trim().replace(/^\//, '')).filter(Boolean).slice(0, 30);
    return { id: typeof e.id === 'string' && /^[\w-]{1,20}$/.test(e.id) ? e.id : crypto.randomBytes(4).toString('hex'), name: String(e.name || 'Event').slice(0, 40), time,
      days: [...new Set((Array.isArray(e.days) ? e.days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))],
      announce: String(e.announce || '').replace(/[\r\n]+/g, ' ').slice(0, 200), cmds: cmds.join('\n'), on: e.on !== false };
  });
}
async function runEvent(c, e) {
  P().log(c.id, `[Manager] Event: ${e.name}`);
  if (e.announce) P().send(c.id, 'say ' + e.announce);
  for (const cmd of e.cmds.split('\n').filter(Boolean)) { await U.sleep(300); try { P().send(c.id, cmd); } catch {} }
}
const ran = new Set();
function eventTick() {
  const now = new Date(), hm = now.toTimeString().slice(0, 5), day = now.toDateString();
  for (const k of ran) if (!k.startsWith(day)) ran.delete(k);
  for (const c of P().servers()) {
    if (P().R(c.id).status !== 'running') continue;
    for (const e of c.events || []) {
      const key = `${day}|${c.id}|${e.id}`;
      if (!e.on || e.time !== hm || ran.has(key) || (e.days.length && !e.days.includes(now.getDay()))) continue;
      ran.add(key); runEvent(c, e).catch(() => {});
    }
  }
}

// ---- phone alerts through ntfy.sh (free, no account: the phone app subscribes to the same topic name) -----------
const alertCfg = () => (U.settings.alerts = U.settings.alerts || { topic: '', on: { crash: true, backup: true, join: false, start: false, stop: false } });
async function notify(msg) {
  const a = alertCfg(); if (!a.topic) return;
  try { await fetch('https://ntfy.sh/' + a.topic, { method: 'POST', body: msg, headers: { Title: 'BlockHost', Tags: 'video_game' }, signal: AbortSignal.timeout(10000) }); } catch {}
}
const lastStatus = {};
function onEvent(e) {
  if (e.t === 'log' && listening.has(e.id)) listening.get(e.id).push(e.line); // LuckPerms replies, see lp()
  const a = alertCfg(); if (!a.topic || !e.id) return;
  let c; try { c = P().cfgOf(e.id); } catch { return; }
  if (e.t === 'status') {
    const was = lastStatus[e.id]; lastStatus[e.id] = e.status;
    if (e.status === 'crashed' && a.on.crash) notify(`${c.name} crashed. ${c.autoRestart ? 'BlockHost is restarting it.' : ''}`);
    if (e.status === 'running' && was === 'starting' && a.on.start) notify(`${c.name} is up.`);
    if (e.status === 'stopped' && was === 'stopping' && a.on.stop) notify(`${c.name} stopped.`);
  }
  if (e.t === 'chat' && e.kind === 'join' && a.on.join) notify(`${e.name} joined ${c.name}.`);
  if (e.t === 'log' && a.on.backup && /\[Manager\] Scheduled backup failed/.test(e.line)) notify(`A backup of ${c.name} failed.`);
}

// ---- new world and seed test -----------------------------------------------------------------------------------
const cleanSeed = (s) => { s = String(s ?? '').trim(); if (s.length > 64 || /[\r\n]/.test(s)) throw bad('That seed is too long.'); return s; };
function newWorld(c, seed) {
  if (!stopped(c)) throw bad('Stop the server first.');
  seed = cleanSeed(seed);
  const d = P().dirOf(c), lvl = props.read(d)['level-name'] || 'world', stamp = new Date().toISOString().slice(0, 16).replace(/\D/g, '');
  const moved = [];
  for (const suf of ['', '_nether', '_the_end']) {
    const src = U.safeJoin(d, lvl + suf);
    if (fs.existsSync(src)) { const dst = U.safeJoin(d, `${lvl}${suf}_old_${stamp}`); fs.renameSync(src, dst); moved.push(path.basename(dst)); }
  }
  props.write(d, { 'level-seed': seed });
  P().log(c.id, `[Manager] New world: the old one is kept as ${moved.join(', ') || '(there was none)'}. Seed: ${seed || 'random'}. It is made on the next start.`);
  return { moved, seed };
}
const LOOK = [
  ['Village', 'structure', '#minecraft:village'], ['Snowy village', 'structure', 'minecraft:village_snowy'], ['Ice spikes', 'biome', 'minecraft:ice_spikes'],
  ['Cherry grove', 'biome', 'minecraft:cherry_grove'], ['Desert', 'biome', 'minecraft:desert'], ['Jungle', 'biome', 'minecraft:jungle'],
  ['Mushroom island', 'biome', 'minecraft:mushroom_fields'], ['Trial chambers', 'structure', 'minecraft:trial_chambers'],
];
let seedBusy = false;
async function seedTest(c, seed) {
  seed = cleanSeed(seed); if (!seed) throw bad('Type a seed to test.');
  if (!c.launch || !c.launch.jar || !['vanilla', 'paper', 'purpur'].includes(c.type)) throw bad('Seed testing works for Classic and Plugins servers.');
  if (seedBusy) throw bad('A seed test is already running. Wait for it to finish.');
  seedBusy = true;
  const tmp = path.join(U.DATA, 'cache', 'seedtest'), src = P().dirOf(c), stamp = c.id + ' ' + c.mc;
  let child = null;
  try {
    // A throwaway copy of the server software (no world, no plugins); kept between tests of the same server.
    if ((() => { try { return fs.readFileSync(path.join(tmp, '.from'), 'utf8'); } catch { return ''; } })() !== stamp) {
      fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
      fs.copyFileSync(path.join(src, c.launch.jar), path.join(tmp, 'server.jar'));
      for (const d of ['libraries', 'versions', 'cache']) if (fs.existsSync(path.join(src, d))) fs.cpSync(path.join(src, d), path.join(tmp, d), { recursive: true });
      fs.writeFileSync(path.join(tmp, '.from'), stamp);
    }
    for (const d of ['world', 'world_nether', 'world_the_end', 'logs']) fs.rmSync(path.join(tmp, d), { recursive: true, force: true });
    const real = props.read(src), port = await U.freePort(30100), rport = await U.freePort(port + 1), pw = crypto.randomBytes(12).toString('hex');
    fs.writeFileSync(path.join(tmp, 'eula.txt'), 'eula=true\n');
    fs.writeFileSync(path.join(tmp, 'server.properties'), [`level-seed=${seed}`, `level-type=${real['level-type'] || 'minecraft\\:normal'}`, `generator-settings=${real['generator-settings'] || '{}'}`,
      'online-mode=false', `server-port=${port}`, 'enable-rcon=true', `rcon.port=${rport}`, `rcon.password=${pw}`, 'view-distance=3', 'simulation-distance=3', 'spawn-protection=0', 'max-players=1', 'level-name=world'].join('\n') + '\n');
    const java = await inst.ensureJava(c.javaMajor, () => {});
    child = cp.spawn(java, ['-Xmx2G', '-jar', 'server.jar', 'nogui'], { cwd: tmp, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; child.stdout.on('data', (d) => { out = (out + d).slice(-4000); }); child.stderr.on('data', () => {});
    const exited = new Promise((r) => child.on('exit', r));
    for (let i = 0; !/Done \(/.test(out); i++) { if (i > 360 || child.exitCode !== null) throw bad('The test server did not start.', 500); await U.sleep(500); }
    const pre = plugins(c) ? 'minecraft:' : '', results = [];
    for (const [name, kind, id] of LOOK) {
      let reply = '';
      // a fresh connection for every question (the server drops idle RCON clients), and a retry if one is dropped early
      for (let tries = 0; tries < 3 && !reply; tries++) {
        try { const r = await new Rcon(rport, pw).connect(); try { reply = U.stripCodes(await r.cmd(`${pre}locate ${kind} ${id}`, 90000)); } finally { r.close(); } } catch { await U.sleep(400); }
      }
      const m = /is at \[(-?\d+), [~\-\d]+, (-?\d+)\] \((\d+) blocks? away\)/.exec(reply);
      results.push({ name, found: !!m, x: m ? +m[1] : null, z: m ? +m[2] : null, dist: m ? +m[3] : null });
    }
    try { const r = await new Rcon(rport, pw).connect(); await r.cmd('stop').catch(() => {}); r.close(); } catch {}
    await Promise.race([exited, U.sleep(20000)]);
    return { seed, results };
  } finally {
    if (child && child.exitCode === null) try { child.kill(); } catch {}
    seedBusy = false;
  }
}

// ---- pre-generate land with Chunky ------------------------------------------------------------------------------
const chunky = (c) => { try { return mods.list(c).some((m) => m.enabled && /chunky/i.test(m.name + m.file)); } catch { return false; } };
function pregen(c, action, radius) {
  if (P().R(c.id).status !== 'running') throw bad('Start the server first.');
  if (!chunky(c)) throw bad('Chunky is not installed.');
  const world = plugins(c) ? props.read(P().dirOf(c))['level-name'] || 'world' : 'minecraft:overworld';
  const cmds = {
    start: () => { const r = Math.round(+radius); if (!(r >= 100 && r <= 20000)) throw bad('Pick a size between 100 and 20000 blocks.'); return [`chunky world ${world}`, 'chunky spawn', `chunky radius ${r}`, 'chunky start']; },
    pause: () => ['chunky pause'], continue: () => ['chunky continue'], cancel: () => ['chunky cancel', 'chunky confirm'],
  }[action];
  if (!cmds) throw bad('Unknown action');
  cmds().forEach((x, i) => setTimeout(() => { try { P().send(c.id, x); } catch {} }, i * 400));
}

// ---- LuckPerms ranks ----------------------------------------------------------------------------------------------
const okGroup = (g) => { if (!/^[a-z0-9_-]{1,36}$/i.test(String(g))) throw bad('Rank names can use letters, numbers, - and _.'); return String(g).toLowerCase(); };
const okPerm = (p) => { if (!/^[a-z0-9_.*-]{1,120}$/i.test(String(p))) throw bad('That does not look like a permission (for example: essentials.home).'); return String(p); };
// LuckPerms answers on its own thread, after the command returns, so RCON gets nothing back. Its answer only
// reaches the console log, so commands go in through the console and the [LP] lines that follow are collected.
const listening = new Map(); // server id -> array collecting raw log lines
async function lp(c, cmd) {
  const r = P().R(c.id);
  if (r.status !== 'running') throw bad('Start the server to see and change ranks.');
  if (!r.child) throw bad('Restart the server from BlockHost to manage ranks here.'); // shortcut: a server re-attached after the app restarted has no console to read
  while (listening.has(c.id)) await U.sleep(100);
  const got = []; listening.set(c.id, got);
  try {
    P().send(c.id, 'lp ' + cmd);
    const until = Date.now() + 5000; let seen = 0, quietSince = 0; // stop 0.5 s after LuckPerms' last line, 5 s at most
    while (Date.now() < until) { await U.sleep(100); const n = lpLines(got).length; if (n !== seen) { seen = n; quietSince = Date.now(); } else if (seen && Date.now() - quietSince > 500) break; }
    return got;
  } finally { listening.delete(c.id); }
}
const plain = (raw) => U.stripCodes(raw).replace(/\x1b\[[0-9;]*m/g, '').replace(/^\[[^\]]*\]:?\s*/, '');
const lpLines = (raw) => raw.filter((l) => /^(\[LP\]|>)/.test(plain(l)));
async function ranks(c) {
  if (!plugins(c)) throw bad('Ranks need a Plugins server with LuckPerms.');
  if (!mods.list(c).some((m) => m.enabled && /luckperms/i.test(m.name + m.file))) throw bad('LuckPerms is not installed. Add it from Add-ons.');
  const groups = lpLines(await lp(c, 'listgroups')).map((l) => /^\[LP\] -\s+([a-z0-9_-]+)/i.exec(plain(l))).filter(Boolean).map((m) => m[1].toLowerCase());
  const out = [];
  for (const g of groups) {
    const perms = [];
    for (let page = 1, pages = 1; page <= pages && page <= 10; page++) {
      for (const l of lpLines(await lp(c, `group ${g} permission info ${page}`))) {
        const head = /\(page \d+ of (\d+)/.exec(plain(l)); if (head) pages = +head[1];
        const m = /^>\s+([a-z0-9_.*-]+)/i.exec(plain(l)); if (!m) continue;
        perms.push({ perm: m[1], value: !/\x1b\[38;5;9m|§c/.test(l) }); // LuckPerms prints false in red, true in green
      }
    }
    out.push({ name: g, perms });
  }
  return out;
}
async function rankAction(c, b) {
  const s = async (cmd) => lpLines(await lp(c, cmd)).map(plain).join(' ').replace(/^\[LP\]\s*/, '');
  switch (b.action) {
    case 'create': return s(`creategroup ${okGroup(b.group)}`);
    case 'delete': if (okGroup(b.group) === 'default') throw bad('The default rank cannot be deleted.'); return s(`deletegroup ${okGroup(b.group)}`);
    case 'set': return s(`group ${okGroup(b.group)} permission set ${okPerm(b.perm)} ${b.value === false ? 'false' : 'true'}`);
    case 'unset': return s(`group ${okGroup(b.group)} permission unset ${okPerm(b.perm)}`);
    case 'player': if (!/^[\w.]{1,16}$/.test(String(b.player))) throw bad('That is not a player name.'); return s(`user ${b.player} parent set ${okGroup(b.group)}`);
    default: throw bad('Unknown action');
  }
}

// ---- voice chat (Simple Voice Chat) -------------------------------------------------------------------------------
const voiceFile = (c) => ['plugins/voicechat/voicechat-server.properties', 'config/voicechat/voicechat-server.properties'].map((f) => path.join(P().dirOf(c), f)).find((f) => fs.existsSync(f));
function voiceStatus(c) {
  const f = voiceFile(c), playit = require('./playit');
  if (!f) return { installed: false };
  const txt = fs.readFileSync(f, 'utf8'), get = (k) => ((new RegExp('^' + k + '=(.*)$', 'm').exec(txt) || [])[1] || '').trim();
  return { installed: true, port: +get('port') || 24454, host: get('voice_host'), linked: playit.linked(), sharing: playit.running() };
}
async function voiceSetup(c) {
  const st = voiceStatus(c); if (!st.installed) throw bad('Simple Voice Chat is not installed, or has not run once yet.');
  const a = await require('./playit').udpTunnel(st.port === -1 ? c.port : st.port, 'BlockHost voice ' + c.name);
  const f = voiceFile(c), txt = fs.readFileSync(f, 'utf8');
  if (!fs.existsSync(f + '.bak-before-blockhost')) fs.writeFileSync(f + '.bak-before-blockhost', txt);
  fs.writeFileSync(f, /^voice_host=.*$/m.test(txt) ? txt.replace(/^voice_host=.*$/m, 'voice_host=' + a.withPort) : txt.replace(/\s*$/, '\nvoice_host=' + a.withPort + '\n'));
  P().log(c.id, `[Manager] Voice chat now uses ${a.withPort}. Restart the server to apply.`);
  return { host: a.withPort };
}

// ---- routes ------------------------------------------------------------------------------------------------------
function routes(route) {
  const S = (x) => P().cfgOf(x.params.id);
  route('GET', '/api/servers/:id/problems', (x) => problems(S(x)));
  route('GET', '/api/servers/:id/events', (x) => S(x).events || []);
  route('POST', '/api/servers/:id/events', (x) => { const c = S(x); c.events = cleanEvents(x.body.events); P().save(); return c.events; });
  route('POST', '/api/servers/:id/events/run', async (x) => { const c = S(x), e = (c.events || []).find((v) => v.id === x.body.id); if (!e) throw bad('No such event'); if (P().R(c.id).status !== 'running') throw bad('Start the server first.'); await runEvent(c, e); return { ok: true }; });
  route('GET', '/api/alerts', () => alertCfg());
  route('POST', '/api/alerts', (x) => {
    const a = alertCfg(), b = x.body;
    if (b.newTopic) a.topic = 'blockhost-' + crypto.randomBytes(9).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
    if (b.off) a.topic = '';
    if (b.on && typeof b.on === 'object') for (const k of Object.keys(a.on)) if (typeof b.on[k] === 'boolean') a.on[k] = b.on[k];
    U.saveSettings(); return a;
  });
  route('POST', '/api/alerts/test', async () => { if (!alertCfg().topic) throw bad('Turn on phone alerts first.'); await notify('Test from BlockHost. Alerts work!'); return { ok: true }; });
  route('POST', '/api/servers/:id/newworld', (x) => newWorld(S(x), x.body.seed));
  route('POST', '/api/servers/:id/seedtest', (x) => seedTest(S(x), x.body.seed));
  route('GET', '/api/servers/:id/world', (x) => { const c = S(x), p = props.read(P().dirOf(c)); return { level: p['level-name'] || 'world', seed: p['level-seed'] || '', chunky: chunky(c), plugins: plugins(c) }; });
  route('POST', '/api/servers/:id/pregen', (x) => { pregen(S(x), x.body.action, x.body.radius); return { ok: true }; });
  route('GET', '/api/servers/:id/ranks', async (x) => ranks(S(x)));
  route('POST', '/api/servers/:id/ranks', async (x) => { const c = S(x); if (P().R(c.id).status !== 'running') throw bad('Start the server first.'); return { reply: await rankAction(c, x.body) }; });
  route('GET', '/api/servers/:id/voice', (x) => voiceStatus(S(x)));
  route('POST', '/api/servers/:id/voice', async (x) => voiceSetup(S(x)));
  setInterval(eventTick, 20000);
}
module.exports = { routes, onEvent, problems, cleanEvents, RULES };
