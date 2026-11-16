'use strict';
// Headless UI check: no window is shown. Usage: node tools/ui-test.js <port> <outDir> [dark]
const { spawn } = require('child_process'), fs = require('fs'), path = require('path');
const [port, out, scheme] = [process.argv[2], process.argv[3], process.argv[4] || 'light'];
fs.mkdirSync(out, { recursive: true });
const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find(fs.existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const prof = path.join(process.env.TEMP, 'bh-shot-profile-' + Date.now());
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--user-data-dir=' + prof, '--window-size=1280,820', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch('http://127.0.0.1:9333/json/list')).json(); if (list.length) break; } catch {} await sleep(250); }
  const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('[log] ' + d.params.entry.text); else if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value || a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.text; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.result.data, 'base64')); console.log('shot', name); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  const inst = process.env.BH_INSTANCE ? JSON.parse(fs.readFileSync(process.env.BH_INSTANCE, 'utf8')) : {};
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` + (inst.boot ? '?boot=' + inst.boot : '') }); await sleep(1500);
  const steps = JSON.parse(fs.readFileSync(path.join(__dirname, process.argv[5] || 'ui-steps.json'), 'utf8'));
  for (const s of steps) { if (s.js) { const v = await ev(s.js); if (s.log) console.log(s.name, '->', JSON.stringify(v)); } if (s.wait) await sleep(s.wait); if (s.shot) await shot(s.shot); }
  console.log('page errors:', errors.length ? errors : 'none');
  ws.close(); ch.kill();
})().catch((e) => { console.error(e); process.exit(1); });
