'use strict';
// Internet sharing through playit.gg: a free tunnel that works without router setup, even behind CGNAT.
// Runs the official, signed playitd agent only while sharing is on. No Windows service is installed.
const fs = require('fs'), path = require('path'), cp = require('child_process'), crypto = require('crypto');
const U = require('./util');
const P = () => require('./proc');

const DIR = path.join(U.DATA, 'playit'), SECRET = path.join(DIR, 'secret.txt'), EXE = path.join(DIR, 'playitd.exe');
const API = 'https://api.playit.gg';
let child = null, claim = null, lastError = '', runCache = null, runAt = 0;

async function call(p, body, key) {
  const r = await U.fetchBuf(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: 'Agent-Key ' + key } : {}) }, body: JSON.stringify(body || {}) });
  let j; try { j = JSON.parse(r.body.toString('utf8')); } catch { throw new Error(`playit.gg sent an unexpected reply (${r.status}).`); }
  if (j.status === 'success') return j.data;
  const d = j.data || {};
  if (d.message === 'InvalidAgentKey') throw new Error('playit.gg no longer accepts this link. Press “Unlink” and set it up again.');
  throw new Error('playit.gg: ' + String(d.message || d.type || JSON.stringify(d)).slice(0, 200));
}
const secret = () => { try { return fs.readFileSync(SECRET, 'utf8').trim(); } catch { return ''; } };
const setEnabled = (on) => { U.settings.playit = { enabled: on }; U.saveSettings(); };

// Official signed build from playit's GitHub releases, checked against the SHA-256 GitHub publishes.
async function ensureAgent() {
  if (fs.existsSync(EXE)) return;
  fs.mkdirSync(DIR, { recursive: true });
  const rel = await U.fetchJson('https://api.github.com/repos/playit-cloud/playit-agent/releases/latest');
  const a = (rel.assets || []).find((x) => x.name === 'playitd-windows-x86_64-signed.exe');
  if (!a || !/^sha256:[0-9a-f]{64}$/.test(a.digest || '')) throw new Error('Could not find a verified playit agent download. Try again later.');
  await U.download(a.browser_download_url, EXE, { sha256: a.digest.slice(7) });
}
function startAgent() {
  if (child || !secret() || !fs.existsSync(EXE)) return;
  lastError = '';
  child = cp.spawn(EXE, ['--secret-path', SECRET, '--log-path', path.join(DIR, 'playitd.log')], { cwd: DIR, windowsHide: true, stdio: 'ignore' });
  child.on('error', (e) => { lastError = 'The playit agent could not start: ' + e.message; child = null; });
  child.on('exit', (code) => { if (child && code) lastError = `The playit agent stopped (code ${code}). Details: data\\playit\\playitd.log`; child = null; });
}
function stopAgent() { if (child) { try { child.kill(); } catch {} child = null; } }
process.on('exit', stopAgent);

// Sign-in: the person opens playit.gg/claim/<code>, signs in (free) and approves; we then get the agent key.
function beginClaim() {
  const code = crypto.randomBytes(5).toString('hex');
  claim = { code, url: 'https://playit.gg/claim/' + code, state: 'WaitingForUserVisit', error: '' };
  (async () => {
    const t0 = Date.now();
    while (claim && claim.code === code && Date.now() - t0 < 15 * 60000) {
      try {
        const st = await call('/claim/setup', { code, agent_type: 'self-managed', version: 'blockhost ' + ((U.APP && U.APP.version) || '2') });
        claim.state = st;
        if (st === 'UserRejected') { claim.error = 'The link was declined on playit.gg. Press “Set up” to try again.'; return; }
        if (st === 'UserAccepted') {
          const d = await call('/claim/exchange', { code });
          fs.mkdirSync(DIR, { recursive: true });
          fs.writeFileSync(SECRET, d.secret_key);
          claim = null;
          await ensureAgent(); startAgent(); setEnabled(true);
          return;
        }
      } catch (e) { if (claim) claim.error = e.message; else lastError = e.message; }
      await U.sleep(2500);
    }
    if (claim && claim.code === code) claim.error = 'The link expired. Press “Set up” to get a new one.';
  })();
  return claim;
}

async function runData(force) {
  const key = secret(); if (!key) return null;
  if (!force && runCache && Date.now() - runAt < 8000) return runCache;
  runCache = await call('/agents/rundata', {}, key); runAt = Date.now();
  return runCache;
}
// Minecraft Java tunnels get an SRV record, so the bare domain works; other types need the port.
const addressFor = (tunnels, port) => {
  const t = (tunnels || []).find((x) => x.local_port === port);
  if (!t) return null;
  const host = t.custom_domain || t.assigned_domain;
  return { address: t.tunnel_type === 'minecraft-java' ? host : `${host}:${t.port.from}`, withPort: `${host}:${t.port.from}`, disabled: !!t.disabled };
};
async function createTunnel(port, name) {
  const rd = await runData(true);
  if (addressFor(rd.tunnels, port)) return;
  await call('/tunnels/create', { name: String(name).slice(0, 40), tunnel_type: 'minecraft-java', port_type: 'tcp', port_count: 1, origin: { type: 'agent', data: { agent_id: rd.agent_id, local_ip: '127.0.0.1', local_port: port } }, enabled: true, alloc: null, firewall_id: null, proxy_protocol: null }, secret());
  runCache = null;
}

async function status(port) {
  const out = { linked: !!secret(), running: !!child, claim: claim && { url: claim.url, state: claim.state, error: claim.error }, error: lastError, tunnel: null, pending: false };
  if (out.linked && out.running && port) {
    try { const rd = await runData(); out.tunnel = addressFor(rd.tunnels, port); out.pending = !out.tunnel && (rd.pending || []).length > 0; } catch (e) { out.error = e.message; }
  }
  return out;
}

function routes(route) {
  const port = (x) => P().cfgOf(String(x.q.get('id') || (x.body && x.body.id) || '')).port;
  route('GET', '/api/share', (x) => status(x.q.get('id') ? port(x) : 0));
  route('POST', '/api/share/link', () => { if (secret()) return status(0); const c = beginClaim(); return { claim: { url: c.url, state: c.state } }; });
  route('POST', '/api/share/start', async () => { await ensureAgent(); startAgent(); setEnabled(true); return status(0); });
  route('POST', '/api/share/stop', () => { stopAgent(); setEnabled(false); return status(0); });
  route('POST', '/api/share/tunnel', async (x) => { const c = P().cfgOf(String(x.body.id || '')); await createTunnel(c.port, 'BlockHost ' + c.name); return status(c.port); });
  route('POST', '/api/share/unlink', () => { stopAgent(); fs.rmSync(SECRET, { force: true }); claim = null; runCache = null; setEnabled(false); return status(0); });
}

// Resume sharing after the app restarts if it was on.
if (U.settings.playit && U.settings.playit.enabled) startAgent();

module.exports = { routes, addressFor };
