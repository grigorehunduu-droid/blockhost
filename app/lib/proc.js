'use strict';
// Server registry + Java process lifecycle, RCON polling, chat parsing, stats.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const U = require('./util'), props = require('./props'), inst = require('./installers'), { Rcon } = require('./rcon');

const serversFile = path.join(U.DATA, 'servers.json');
let servers = U.readJson(serversFile, []);
const rt = new Map(); // id -> runtime state
let emit = () => {};
const save = () => U.writeJson(serversFile, servers);
const dirOf = (c) => path.join(U.DATA, 'servers', c.id);
const cfgOf = (id) => { const c = servers.find((s) => s.id === id); if (!c) throw new Error('No such server'); return c; };
function R(id) {
  if (!rt.has(id)) rt.set(id, { status: 'stopped', logs: [], chat: [], players: [], max: 0, pos: {}, tps: null, mspt: null, cpu: 0, ram: 0, hist: [], rcon: null, child: null, crashes: [], warned: {} });
  return rt.get(id);
}
const AIKAR = '-XX:+AlwaysPreTouch -XX:+DisableExplicitGC -XX:+ParallelRefProcEnabled -XX:+PerfDisableSharedMem -XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1HeapRegionSize=8M -XX:G1HeapWastePercent=5 -XX:G1MaxNewSizePercent=40 -XX:G1MixedGCCountTarget=4 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1NewSizePercent=30 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:G1ReservePercent=20 -XX:InitiatingHeapOccupancyPercent=15 -XX:MaxGCPauseMillis=200 -XX:MaxTenuringThreshold=1 -XX:SurvivorRatio=32 -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true'.split(' ');

function setStatus(id, status, message) { const r = R(id); r.status = status; r.message = message || ''; emit({ t: 'status', id, status, message: r.message }); }
function log(id, line, src) {
  const r = R(id);
  r.logs.push(line); if (r.logs.length > 3000) r.logs.splice(0, 500);
  emit({ t: 'log', id, line });
  parseLine(id, U.stripCodes(line));
}
const mlog = (id) => (m) => log(id, `[Manager] ${m}`);

function parseLine(id, l) {
  const r = R(id);
  let m;
  if ((m = l.match(/\]:\s(?:\[Not Secure\]\s)?<([^>\s]+)>\s(.*)$/))) pushChat(id, 'chat', m[1], m[2]);
  else if ((m = l.match(/\]:\s(\w{1,16}) joined the game$/))) pushChat(id, 'join', m[1], 'joined the game');
  else if ((m = l.match(/\]:\s(\w{1,16}) left the game$/))) pushChat(id, 'leave', m[1], 'left the game');
  else if (/\]: Done \(/.test(l) && (r.status === 'starting')) { setStatus(id, 'running'); connectRcon(id); }
}
function pushChat(id, kind, name, msg) {
  const r = R(id), e = { t: 'chat', id, time: Date.now(), kind, name, msg };
  r.chat.push(e); if (r.chat.length > 300) r.chat.shift();
  emit(e);
}

// ---- RCON ---------------------------------------------------------------------
// The server drops idle RCON sockets after ~15 s, so connect on demand.
async function rcon(id) {
  const r = R(id);
  if (r.rcon && !r.rcon.closed) return r.rcon;
  if (!r.rconP) {
    const p = props.read(dirOf(cfgOf(id)));
    r.rconP = new Rcon(+p['rcon.port'], p['rcon.password']).connect().then((x) => (r.rcon = x)).finally(() => { r.rconP = null; });
  }
  return r.rconP;
}
async function connectRcon(id) {
  const r = R(id);
  for (let i = 0; i < 8 && r.status === 'running'; i++) { try { await rcon(id); r.rconFailed = false; poll(id); return true; } catch { await U.sleep(1000); } }
  r.rconFailed = true;
  log(id, '[Manager] Could not connect RCON; player lists, TPS and the map markers will be unavailable.');
  return false;
}
async function poll(id) {
  const c = cfgOf(id), r = R(id);
  if (r.status !== 'running') return;
  try {
    const rc = await rcon(id);
    const pre = (c.type === 'paper' || c.type === 'purpur') ? 'minecraft:' : '';
    const out = U.stripCodes(await rc.cmd(pre + 'list uuids'));
    r.max = +(out.match(/max of (\d+)/) || [])[1] || r.max;
    r.players = [...out.matchAll(/([A-Za-z0-9_]{1,16}) \(([0-9a-f-]{36})\)/g)].map((m) => ({ name: m[1], uuid: m[2] }));
    if (!r.players.length && /There are (\d+)/.test(out)) { /* names without uuids on very old servers */ r.players = (out.split(':')[1] || '').split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ name, uuid: '' })); }
    const pos = {};
    for (const pl of r.players) {
      try {
        const a = U.stripCodes(await rc.cmd(`data get entity ${pl.name} Pos`)).match(/\[\s*(-?[\d.eE+-]+)d?,\s*(-?[\d.eE+-]+)d?,\s*(-?[\d.eE+-]+)d?\s*\]/);
        const d = U.stripCodes(await rc.cmd(`data get entity ${pl.name} Dimension`)).match(/"?([a-z0-9_.-]+:[a-z0-9_/.-]+)"?\s*$/);
        if (a) pos[pl.name] = { x: +a[1], y: +a[2], z: +a[3], dim: d ? d[1] : 'minecraft:overworld' };
      } catch {}
    }
    r.pos = pos;
    emit({ t: 'players', id, players: r.players, max: r.max, pos });
    try {
      if (pre) { const m = U.stripCodes(await rc.cmd('tps')).match(/TPS from last[^:]*:\s*\*?([\d.]+)/); if (m) r.tps = Math.min(20, +m[1]); }
      else { const m = U.stripCodes(await rc.cmd('tick query')).match(/Average time per tick:\s*([\d.]+)\s*ms/); if (m) { r.mspt = +m[1]; r.tps = Math.min(20, 1000 / Math.max(+m[1], 50)); } }
    } catch {}
  } catch {}
  setTimeout(() => poll(id), 5000);
}

// ---- Stats (one long-lived PowerShell loop; no wmic) ----------------------------
let psProc = null, lastCpu = {};
const pidsFile = path.join(U.DATA, 'cache', 'pids.txt');
function pidSet() { return [...rt.entries()].filter(([, r]) => r.pid && r.status !== 'stopped').map(([id, r]) => [id, r.pid]); }
function syncStats() {
  const set = pidSet();
  fs.writeFileSync(pidsFile, set.map((x) => x[1]).join('\n'));
  if (set.length && !psProc) {
    const ps1 = path.join(U.DATA, 'cache', 'stats.ps1');
    fs.writeFileSync(ps1, `while($true){$r=@();foreach($i in (Get-Content '${pidsFile}' -ErrorAction SilentlyContinue)){if($i){$p=Get-Process -Id ([int]$i) -ErrorAction SilentlyContinue;if($p){$r+=[pscustomobject]@{id=[int]$i;cpu=$p.CPU;ws=$p.WorkingSet64}}}};[Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject @($r)));[Console]::Out.Flush();Start-Sleep -Seconds 3}`);
    psProc = cp.spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { windowsHide: true });
    let buf = '';
    psProc.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); try { onSample([].concat(JSON.parse(l || '[]'))); } catch {} } });
    psProc.on('exit', () => { psProc = null; lastCpu = {}; });
  } else if (!set.length && psProc) { psProc.kill(); psProc = null; }
}
function onSample(arr) {
  const now = Date.now();
  for (const [id, r] of rt) {
    const s = arr.find((x) => x.id === r.pid);
    if (!s) continue;
    const prev = lastCpu[s.id];
    if (prev) r.cpu = Math.max(0, Math.min(100, ((s.cpu - prev.cpu) / ((now - prev.t) / 1000) / os.cpus().length) * 100));
    lastCpu[s.id] = { cpu: s.cpu, t: now };
    r.ram = Math.round(s.ws / 1048576);
    const pt = { t: now, cpu: +r.cpu.toFixed(1), ram: r.ram, tps: r.tps, mspt: r.mspt };
    r.hist.push(pt); if (r.hist.length > 180) r.hist.shift();
    emit({ t: 'stats', id, pt });
  }
}

// ---- Public view ---------------------------------------------------------------
function view(c) {
  const r = R(c.id), p = props.read(dirOf(c));
  const { launch, paperFlags, ...rest } = c;
  return { ...rest, status: r.status, message: r.message, players: r.players, maxPlayers: r.max || +p['max-players'] || 20, tps: r.tps, mspt: r.mspt, cpu: +r.cpu.toFixed(1), ramUsed: r.ram, startedAt: r.startedAt, detached: !!r.detached, rconPort: +p['rcon.port'] || null, rconFailed: !!r.rconFailed };
}
const list = () => servers.map(view);

// ---- Create / install ------------------------------------------------------------
async function create({ name, type, mc, ramMb, eula }, after) {
  if (!eula) throw new Error('You must accept the Minecraft EULA to create a server.');
  const id = crypto.randomBytes(4).toString('hex');
  const used = servers.map((s) => s.port);
  const port = await U.freePort(Math.max(25564, ...used) + 1);
  const c = { id, name: String(name || 'My server').slice(0, 40), type, mc, port, ramMb: Math.max(512, +ramMb || 2048), flags: type === 'paper' || type === 'purpur' ? 'aikar' : 'none', autoRestart: true, dailyRestart: '', backupEveryHours: 0, backupKeep: 5, eula: true, installed: false, javaMajor: 21, launch: null, lastBackup: 0 };
  servers.push(c); save();
  fs.mkdirSync(dirOf(c), { recursive: true });
  runInstall(c, after);
  return view(c);
}
async function runInstall(c, after) {
  setStatus(c.id, 'installing');
  try {
    Object.assign(c, await inst.install({ dir: dirOf(c), type: c.type, mc: c.mc }, mlog(c.id)));
    props.write(dirOf(c), { 'server-port': c.port });
    c.installed = true; save();
    if (!after) log(c.id, '[Manager] Install finished. Press Start.');
    else { setStatus(c.id, 'installing', 'Adding mods'); try { await after(c); } catch (e) { log(c.id, '[Manager] Post-install step failed: ' + e.message); } }
    setStatus(c.id, 'stopped');
  } catch (e) { log(c.id, '[Manager] INSTALL FAILED: ' + e.message); setStatus(c.id, 'error', e.message); }
}
const PLUGIN = (t) => t === 'paper' || t === 'purpur', MODDED = (t) => ['fabric', 'forge', 'neoforge'].includes(t);
async function switchType(id, type, mc) {
  const c = cfgOf(id), r = R(id);
  if (r.status !== 'stopped' && r.status !== 'error') throw new Error('Stop the server first.');
  const backup = require('./backup');
  await backup.create(c, 'pre-switch').catch((e) => log(id, '[Manager] Backup before switch failed: ' + e.message));
  const d = dirOf(c), mv = (a, b) => { if (fs.existsSync(path.join(d, a)) && !fs.existsSync(path.join(d, b))) fs.renameSync(path.join(d, a), path.join(d, b)); };
  if (MODDED(c.type) && c.type !== type) mv('mods', 'mods_' + c.type);
  if (PLUGIN(c.type) && !PLUGIN(type)) mv('plugins', 'plugins_' + c.type);
  if (MODDED(type)) mv('mods_' + type, 'mods');
  if (PLUGIN(type)) mv('plugins_' + type, 'plugins');
  for (const f of ['server.jar', 'run.bat', 'run.sh', 'user_jvm_args.txt']) fs.rmSync(path.join(d, f), { force: true });
  Object.assign(c, { type, mc, installed: false, flags: PLUGIN(type) ? 'aikar' : 'none' }); save();
  runInstall(c);
  return view(c);
}

// ---- Start / stop ---------------------------------------------------------------
async function start(id) {
  const c = cfgOf(id), r = R(id), d = dirOf(c);
  if (!['stopped', 'error', 'crashed'].includes(r.status)) throw new Error('Server is ' + r.status);
  if (!c.installed) throw new Error('Server is not installed yet.');
  if (!c.eula) throw new Error('EULA not accepted.');
  setStatus(id, 'starting');
  try {
    fs.writeFileSync(path.join(d, 'eula.txt'), 'eula=true\n');
    const rconPort = await U.freePort(25575 + servers.indexOf(c) * 3);
    const pw = crypto.randomBytes(16).toString('hex');
    props.write(d, { 'server-port': c.port, 'enable-rcon': 'true', 'rcon.port': rconPort, 'rcon.password': pw, 'broadcast-rcon-to-ops': 'false' });
    const java = await inst.ensureJava(c.javaMajor, mlog(id));
    const mem = [`-Xms${Math.min(c.ramMb, c.flags === 'none' ? 1024 : c.ramMb)}M`, `-Xmx${c.ramMb}M`];
    const flags = c.flags === 'aikar' ? AIKAR : c.flags === 'paper' && c.paperFlags ? c.paperFlags.filter((f) => !/^-Xm[sx]/.test(f)) : [];
    const launch = c.launch.args ? c.launch.args : ['-jar', c.launch.jar];
    const args = [...mem, '-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Dstderr.encoding=UTF-8', ...flags, ...launch, 'nogui'];
    log(id, `[Manager] Starting: java ${args.slice(0, 4).join(' ')} ...`);
    const child = cp.spawn(java, args, { cwd: d, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: true });
    Object.assign(r, { child, pid: child.pid, rcon: null, players: [], pos: {}, tps: null, mspt: null, stopping: false, detached: false, rconFailed: false, startedAt: Date.now() });
    c.pid = child.pid; save();
    r.exited = new Promise((res) => { r.onExit = res; });
    for (const s of [child.stdout, child.stderr]) { let buf = ''; s.setEncoding('utf8'); s.on('data', (x) => { buf += x; const ls = buf.split(/\r?\n/); buf = ls.pop(); ls.forEach((l) => log(id, l)); }); }
    child.stdin.on('error', () => {});
    child.on('error', (e) => log(id, '[Manager] spawn error: ' + e.message));
    child.on('exit', (code) => onExit(id, code));
    syncStats();
  } catch (e) { log(id, '[Manager] START FAILED: ' + e.message); setStatus(id, 'error', e.message); throw e; }
}
function onExit(id, code) {
  const c = cfgOf(id), r = R(id), wasStopping = r.stopping, wantRestart = r.restartAfter;
  if (r.rcon) { r.rcon.close(); r.rcon = null; }
  Object.assign(r, { child: null, pid: null, players: [], pos: {}, cpu: 0, ram: 0, tps: null, restartAfter: false });
  c.pid = null; save(); syncStats();
  log(id, `[Manager] Server exited (code ${code}).`);
  if (r.onExit) r.onExit();
  if (wasStopping || code === 0) { setStatus(id, 'stopped'); if (wantRestart) setTimeout(() => start(id).catch(() => {}), 1500); return; }
  setStatus(id, 'crashed', `Exited with code ${code}`);
  const now = Date.now(); r.crashes = r.crashes.filter((t) => now - t < 600000); r.crashes.push(now);
  if (c.autoRestart && r.crashes.length <= 3) { log(id, '[Manager] Crash detected - restarting in 5 seconds.'); setTimeout(() => { if (R(id).status === 'crashed') start(id).catch(() => {}); }, 5000); }
  else if (c.autoRestart) log(id, '[Manager] Crashed 3 times in 10 minutes - not restarting again.');
}
function stop(id) {
  const r = R(id);
  if (!['running', 'starting'].includes(r.status)) return Promise.resolve();
  r.stopping = true; setStatus(id, 'stopping');
  send(id, 'stop');
  const t = setTimeout(() => { log(id, '[Manager] Did not stop in 60s - killing.'); kill(id); }, 60000);
  return (r.exited || Promise.resolve()).then(() => clearTimeout(t));
}
function kill(id) { const r = R(id); if (r.pid) cp.execFile('taskkill', ['/PID', String(r.pid), '/T', '/F'], { windowsHide: true }, () => {}); }
async function restart(id) { const r = R(id); if (r.status === 'stopped') return start(id); r.restartAfter = true; await stop(id); }
function send(id, text) {
  const r = R(id);
  if (r.child) r.child.stdin.write(String(text).replace(/[\r\n]+/g, ' ') + '\n');
  else if (r.pid) query(id, text).then((o) => o && o.split('\n').forEach((l) => log(id, l))).catch(() => {});
  else throw new Error('Server is not running.');
}
async function query(id, text) { return U.stripCodes(await (await rcon(id)).cmd(text)); }
const chat = (id, msg) => send(id, 'tellraw @a ' + JSON.stringify({ text: `<Server> ${String(msg).replace(/[\r\n]+/g, ' ').slice(0, 256)}` }));

async function remove(id, deleteFiles) {
  const c = cfgOf(id);
  if (!['stopped', 'error'].includes(R(id).status)) throw new Error('Stop the server first.');
  servers = servers.filter((s) => s !== c); save(); rt.delete(id);
  if (deleteFiles) fs.rmSync(dirOf(c), { recursive: true, force: true });
}
function update(id, patch) {
  const c = cfgOf(id), ok = { name: 'string', ramMb: 'number', flags: 'string', autoRestart: 'boolean', dailyRestart: 'string', backupEveryHours: 'number', backupKeep: 'number', port: 'number' };
  for (const [k, t] of Object.entries(ok)) if (k in patch && typeof patch[k] === t) c[k] = patch[k];
  c.ramMb = Math.max(512, c.ramMb); save();
  if ('port' in patch) props.write(dirOf(c), { 'server-port': c.port });
  return view(c);
}
async function quitAll() { await Promise.all(servers.map((c) => stop(c.id))); }

// ---- Recovery of servers that outlived the app -----------------------------------
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function recover() {
  for (const c of servers) {
    if (!c.pid || !alive(c.pid)) { c.pid = null; continue; }
    const r = R(c.id), d = dirOf(c);
    Object.assign(r, { pid: c.pid, detached: true, startedAt: Date.now() });
    setStatus(c.id, 'running');
    if (!(await connectRcon(c.id))) { r.pid = c.pid = null; r.detached = false; setStatus(c.id, 'stopped'); continue; }
    log(c.id, '[Manager] Re-attached to a server that kept running while the app was closed.');
    const lf = path.join(d, 'logs', 'latest.log'); let pos = fs.existsSync(lf) ? fs.statSync(lf).size : 0;
    const iv = setInterval(() => {
      if (!alive(r.pid)) { clearInterval(iv); r.pid = c.pid = null; r.rcon && r.rcon.close(); r.rcon = null; r.detached = false; setStatus(c.id, 'stopped'); syncStats(); save(); return; }
      try { const sz = fs.statSync(lf).size; if (sz < pos) pos = 0; if (sz > pos) { const b = Buffer.alloc(sz - pos), fd = fs.openSync(lf, 'r'); fs.readSync(fd, b, 0, b.length, pos); fs.closeSync(fd); pos = sz; b.toString('utf8').split(/\r?\n/).filter(Boolean).forEach((l) => log(c.id, l)); } } catch {}
    }, 1000);
    r.exited = new Promise((res) => { r.onExit = res; }); r.stopping = false;
  }
  save(); syncStats();
}

// ---- Scheduler (every 30 s): daily restart with warnings, timed backups -----------
function tick() {
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), day = now.toDateString();
  for (const c of servers) {
    const r = R(c.id); if (r.status !== 'running') continue;
    if (/^\d\d:\d\d$/.test(c.dailyRestart)) {
      const [h, m] = c.dailyRestart.split(':').map(Number), diff = (h * 60 + m - nowMin + 1440) % 1440;
      for (const w of [5, 1]) if (diff === w && r.warned[day + w] !== 1) { r.warned[day + w] = 1; try { send(c.id, `say Server restarting in ${w} minute${w > 1 ? 's' : ''}.`); } catch {} }
      if (diff === 0 && r.warned[day + 'go'] !== 1) { r.warned[day + 'go'] = 1; log(c.id, '[Manager] Daily restart.'); restart(c.id).catch(() => {}); }
    }
    if (c.backupEveryHours > 0 && Date.now() - (c.lastBackup || 0) > c.backupEveryHours * 3600000) { c.lastBackup = Date.now(); save(); require('./backup').create(c, 'auto').catch((e) => log(c.id, '[Manager] Scheduled backup failed: ' + e.message)); }
  }
}

function init(emitFn) { emit = emitFn; recover(); setInterval(tick, 30000); }
module.exports = { init, list, view, create, switchType, start, stop, kill, restart, send, query, chat, remove, update, quitAll, cfgOf, dirOf, R, servers: () => servers, save, log, anyRunning: () => [...rt.values()].some((r) => r.status !== 'stopped' && r.status !== 'error'), PLUGIN, MODDED, setStatus };
