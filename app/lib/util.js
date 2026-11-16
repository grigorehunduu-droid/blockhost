'use strict';
const fs = require('fs'), path = require('path'), https = require('https'), http = require('http'), net = require('net'), cp = require('child_process'), crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = process.env.BLOCKHOST_DATA || path.join(ROOT, 'data'); // override lets tests use a throwaway folder
for (const d of ['', 'java', 'cache', 'logs', 'servers', 'backups']) fs.mkdirSync(path.join(DATA, d), { recursive: true });
const APP = readJsonEarly(path.join(__dirname, '..', 'version.json'), { name: 'BlockHost', version: '0.0.0', homepage: '' });
function readJsonEarly(f, def) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } }
// Modrinth etc. ask apps to identify themselves; set "homepage" in app/version.json to your project page.
const UA = 'BlockHost/' + APP.version + (APP.homepage ? ' (+' + APP.homepage + ')' : '');
// Keep log files from growing forever: rotate anything over 1 MB at startup.
for (const f of ['app.log', 'node.out', 'node.err']) { try { const p = path.join(DATA, 'logs', f); if (fs.statSync(p).size > (1 << 20)) fs.renameSync(p, p + '.1'); } catch {} }

const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
const writeJson = (f, o) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o, null, 2)); fs.renameSync(t, f); };

// API keys are encrypted at rest with Windows DPAPI (current user only), so a copied settings.json or
// data folder does not expose them. The key goes to PowerShell on stdin, never on a command line.
const PS_ENC = "Add-Type -AssemblyName System.Security;$t=[Console]::In.ReadToEnd();[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($t),$null,'CurrentUser'))";
const PS_DEC = "Add-Type -AssemblyName System.Security;$t=[Console]::In.ReadToEnd().Trim();[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($t),$null,'CurrentUser'))";
function dpapi(script, input) {
  const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || !r.stdout) throw new Error('DPAPI unavailable');
  return r.stdout.trim();
}
const sealed = new Map(); // plaintext -> ciphertext, so unchanged keys are not re-encrypted
const seal = (v) => { if (!v) return v; if (!sealed.has(v)) { try { sealed.set(v, 'dpapi:' + dpapi(PS_ENC, v)); } catch { return v; } } return sealed.get(v); };
const unseal = (v) => { if (typeof v !== 'string' || !v.startsWith('dpapi:')) return v; try { const p = dpapi(PS_DEC, v.slice(6)); sealed.set(p, v); return p; } catch { return undefined; } };

const settingsFile = path.join(DATA, 'settings.json');
const settings = readJson(settingsFile, {});
settings.ai = settings.ai || { provider: 'gemini', keys: {}, models: {} };
settings.ai.keys = settings.ai.keys || {}; settings.ai.models = settings.ai.models || {};
let plaintextFound = false;
for (const [k, v] of Object.entries(settings.ai.keys)) { if (typeof v === 'string' && !v.startsWith('dpapi:')) plaintextFound = true; const p = unseal(v); if (p) settings.ai.keys[k] = p; else delete settings.ai.keys[k]; }
if (settings.curseforgeKey) { if (!settings.curseforgeKey.startsWith('dpapi:')) plaintextFound = true; const p = unseal(settings.curseforgeKey); if (p) settings.curseforgeKey = p; else delete settings.curseforgeKey; }
function saveSettings() {
  const disk = JSON.parse(JSON.stringify(settings));
  for (const k of Object.keys(disk.ai.keys)) disk.ai.keys[k] = seal(disk.ai.keys[k]);
  if (disk.curseforgeKey) disk.curseforgeKey = seal(disk.curseforgeKey);
  writeJson(settingsFile, disk);
}
if (plaintextFound) saveSettings(); // upgrade old plaintext files

// Plain-language message for the usual "no internet" failures.
function netError(e, u) {
  const codes = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT'];
  if (/^timeout: /.test(e.message)) return Object.assign(new Error(u.host + ' took too long to answer. Try again in a minute.'), { network: true }); // connected, but no reply in time
  if (codes.includes(e.code)) return Object.assign(new Error("Couldn't reach " + u.host + '. Check your internet connection and try again.'), { network: true });
  return e;
}
// Streams a response; follows redirects (GET only).
function request(url, { method = 'GET', headers = {}, body = null, redirects = 5, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, { method, headers: { 'User-Agent': UA, ...headers }, timeout }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects > 0 && method === 'GET') {
        r.resume();
        return resolve(request(new URL(r.headers.location, u).href, { method, headers, redirects: redirects - 1, timeout }));
      }
      resolve(r);
    });
    req.on('error', (e) => reject(netError(e, u)));
    req.on('timeout', () => req.destroy(new Error('timeout: ' + u.host)));
    if (body) req.write(body);
    req.end();
  });
}
async function fetchBuf(url, opts) {
  const r = await request(url, opts);
  const chunks = [];
  for await (const c of r) chunks.push(c);
  return { status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) };
}
async function fetchJson(url, opts = {}) {
  const r = await fetchBuf(url, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } });
  const txt = r.body.toString('utf8');
  if (r.status >= 400) throw new Error(`HTTP ${r.status} from ${new URL(url).host}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}
// Downloads to dest; verifies any of sha512/sha256/sha1/md5 that are given before the file is kept.
async function download(url, dest, opts = {}) {
  const { onProgress } = opts;
  const r = await request(url, { timeout: 60000 });
  if (r.statusCode >= 400) { r.resume(); throw new Error('HTTP ' + r.statusCode + ' downloading from ' + new URL(url).host); }
  const total = +r.headers['content-length'] || 0;
  let got = 0, last = 0;
  const hashers = {};
  for (const alg of ['sha512', 'sha256', 'sha1', 'md5']) if (opts[alg]) hashers[alg] = crypto.createHash(alg);
  const tmp = dest + '.part';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const out = fs.createWriteStream(tmp);
  for await (const c of r) {
    for (const h of Object.values(hashers)) h.update(c);
    got += c.length;
    if (!out.write(c)) await new Promise((ok) => out.once('drain', ok));
    if (onProgress && Date.now() - last > 1000) { last = Date.now(); onProgress(got, total); }
  }
  await new Promise((ok, bad) => { out.end(); out.on('finish', ok); out.on('error', bad); });
  for (const [alg, h] of Object.entries(hashers)) {
    if (h.digest('hex') !== String(opts[alg]).toLowerCase()) { fs.unlinkSync(tmp); throw new Error('A download from ' + new URL(url).host + ' failed its safety check (checksum mismatch) and was discarded. Try again.'); }
  }
  fs.renameSync(tmp, dest);
  return dest;
}

// ---- disk space -----------------------------------------------------------------------------
function freeBytes(dir) { try { const s = fs.statfsSync(dir); return s.bavail * s.bsize; } catch { return Infinity; } }
function ensureSpace(dir, need, what) {
  const free = freeBytes(dir);
  if (free < need) throw new Error('Not enough free disk space for ' + what + ': about ' + (need / 2 ** 30).toFixed(1) + ' GB needed, ' + (free / 2 ** 30).toFixed(1) + ' GB free.');
}
function dirSize(p) {
  let n = 0;
  try { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, e.name); n += e.isDirectory() ? dirSize(q) : fs.statSync(q).size; } } catch {}
  return n;
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    cp.execFile(cmd, args, { windowsHide: true, maxBuffer: 64 << 20, ...opts }, (e, stdout, stderr) => e ? reject(Object.assign(e, { stdout, stderr })) : resolve({ stdout, stderr }));
  });
}
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

// Resolve rel inside base, refusing escapes (.. , absolute paths, symlink/junction targets).
function safeJoin(base, rel) {
  const b = path.resolve(base);
  const p = path.resolve(b, String(rel || '').replace(/^[\\/]+/, ''));
  if (p !== b && !p.startsWith(b + path.sep)) throw new Error('path outside server folder');
  let probe = p;
  while (!fs.existsSync(probe) && probe !== b) probe = path.dirname(probe);
  const real = fs.realpathSync(probe), realBase = fs.realpathSync(b);
  if (real !== realBase && !real.startsWith(realBase + path.sep)) throw new Error('path outside server folder');
  return p;
}
const safeName = (n) => { n = String(n || ''); if (!n || n !== path.basename(n) || /[\\/:*?"<>|]/.test(n) || n.startsWith('.')) throw new Error('bad file name'); return n; };

function freePort(start) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(freePort(start + 1)));
    s.listen(start, '0.0.0.0', () => s.close(() => resolve(start)));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripCodes = (s) => String(s).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/§./g, '');

module.exports = { APP, ensureSpace, freeBytes, dirSize, ROOT, DATA, UA, readJson, writeJson, settings, saveSettings, request, fetchBuf, fetchJson, download, run, TAR, safeJoin, safeName, freePort, sleep, stripCodes };
