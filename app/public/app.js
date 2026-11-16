'use strict';
const TOKEN = document.querySelector('meta[name=blockhost-token]').content;
const $ = (s, e = document) => e.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tokUrl = (p) => p + (p.includes('?') ? '&' : '?') + 'token=' + TOKEN;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body, method) {
  const r = await fetch(path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { 'x-blockhost-token': TOKEN, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ')');
  return j;
}
const post = (p, b) => api(p, b === undefined ? {} : b);
function toast(msg, bad) { const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg; $('#toasts').append(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, bad ? 7000 : 3200); }
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, true); } };

// ---- icons (stroke style, like SF Symbols) ------------------------------------------
const P = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.8a3.5 3.5 0 010 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>', puzzle: '<path d="M10 3h4v3a2 2 0 104 0h3v5h-3a2 2 0 100 4h3v5h-5v-3a2 2 0 10-4 0v3H3v-5h3a2 2 0 100-4H3V6h7V3z"/>',
  backup: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v10h14V9M10 13h4"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l3 3-3 3M13 15h4"/>', chat: '<path d="M4 5h16v11H9l-5 4V5z"/>', folder: '<path d="M3 6h6l2 2h10v11H3V6z"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.8.6-1.5 1-1.5 2M12 17h.01"/>', power: '<path d="M12 3v9M6.3 6.8a8 8 0 1011.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>', chevron: '<path d="M7 10l5 5 5-5"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5"/>', play: '<path d="M7 4l13 8-13 8V4z" fill="currentColor"/>', stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
const ic = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;
$('#i-help').innerHTML = ic('help'); $('#i-power').innerHTML = ic('power'); $('#i-info').innerHTML = ic('info');
for (const el of document.querySelectorAll('.side-foot .nav > span:first-child')) el.style.cssText = 'width:20px;height:20px;display:inline-flex;color:var(--accent)';

// ---- sheets (replace alert/confirm/prompt) --------------------------------------------
let sheetGone = 0; // pending close animation; a new sheet opened meanwhile cancels it
function sheet(html, wide) { clearTimeout(sheetGone); const s = $('#sheet'); s.classList.remove('out'); s.innerHTML = `<div class="sheet ${wide ? 'wide' : ''}">${html}</div>`; s.hidden = false; return s.firstChild; }
const closeSheet = () => { const s = $('#sheet'); if (s.hidden) return; s.classList.add('out'); clearTimeout(sheetGone); sheetGone = setTimeout(() => { s.classList.remove('out'); s.hidden = true; s.innerHTML = ''; }, 200); };
$('#sheet').addEventListener('mousedown', (e) => { if (e.target.id === 'sheet') closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
function confirmSheet(title, body, ok = 'OK', danger = false) {
  return new Promise((res) => {
    sheet(`<h2>${esc(title)}</h2><p class="muted">${body}</p><div class="btns"><button class="btn" id="sh-no">Cancel</button><button class="btn ${danger ? 'solid-danger' : 'primary'}" id="sh-ok">${esc(ok)}</button></div>`);
    $('#sh-no').onclick = () => { closeSheet(); res(false); }; $('#sh-ok').onclick = () => { closeSheet(); res(true); };
  });
}
function promptSheet(title, body, placeholder = '') {
  return new Promise((res) => {
    sheet(`<h2>${esc(title)}</h2><p class="muted">${body}</p><input type="text" id="sh-in" placeholder="${esc(placeholder)}" style="width:100%;margin-top:12px"><div class="btns"><button class="btn" id="sh-no">Cancel</button><button class="btn primary" id="sh-ok">OK</button></div>`);
    $('#sh-in').focus(); $('#sh-in').onkeydown = (e) => { if (e.key === 'Enter') $('#sh-ok').click(); };
    $('#sh-no').onclick = () => { closeSheet(); res(null); }; $('#sh-ok').onclick = () => { const v = $('#sh-in').value; closeSheet(); res(v); };
  });
}

// ---- state --------------------------------------------------------------------------
const S = { servers: [], cur: localStorage.getItem('cur') || '', tab: 'home', totalMem: 8192, ai: { provider: 'gemini', models: {}, hasKey: {}, usage: {}, budget: 200000 }, lan: [], cfKey: false, chats: {} };
try { const t = localStorage.getItem('tab'); S.tab = { dashboard: 'home', mods: 'mods' }[t] || t || 'home'; } catch {}
const cur = () => S.servers.find((s) => s.id === S.cur) || S.servers[0];
const sp = (suffix) => `/api/servers/${cur().id}${suffix}`;
let view = { on: {} }, renderId = 0;
const MODDED = (t) => ['fabric', 'forge', 'neoforge'].includes(t);
const TYPE_NAME = { vanilla: 'Classic', paper: 'Plugins (Paper)', purpur: 'Plugins (Purpur)', fabric: 'Mods (Fabric)', forge: 'Mods (Forge)', neoforge: 'Mods (NeoForge)' };

async function refresh(keepView) {
  const j = await api('/api/state');
  Object.assign(S, { servers: j.servers, ai: j.ai, totalMem: j.totalMemMb, cfKey: j.cfKey, lan: j.lan || [] });
  S.cur = cur() ? cur().id : '';
  drawChrome(); if (!keepView) render();
}
const NAV = [['home', 'Home', 'home'], ['players', 'Players', 'users'], ['map', 'Map', 'map'], ['world', 'World', 'globe'], ['mods', 'Add-ons', 'puzzle'], ['events', 'Events', 'calendar'], ['backups', 'Backups', 'backup'], ['settings', 'Settings', 'gear']];
const NAV2 = [['console', 'Live log', 'terminal'], ['chat', 'Chat', 'chat'], ['ranks', 'Ranks', 'shield'], ['files', 'Files', 'folder'], ['ai', 'Ask AI', 'spark']]; // World, Events, Ranks: extras.js
const statusText = (s) => ({ stopped: 'Stopped', starting: 'Starting… about 20 seconds', running: 'Running', stopping: 'Stopping…', installing: 'Setting up… the first time takes a few minutes', crashed: 'It crashed', error: 'Something went wrong' }[s.status] || s.status);
function drawChrome() {
  const c = cur();
  $('#pickerwrap').innerHTML = c ? `<button class="picker" data-act="picker"><span class="dot ${c.status}" style="margin:0"></span><span class="grow"><b>${esc(c.name)}</b><small>${esc(TYPE_NAME[c.type] || c.type)} · ${esc(c.mc)}</small></span><span style="width:16px;height:16px;display:inline-flex">${ic('chevron')}</span></button>` : `<button class="picker" data-act="newserver"><span style="width:20px;height:20px;display:inline-flex;color:var(--accent)">${ic('plus')}</span><span class="grow"><b>Create a server</b></span></button>`;
  const item = ([k, n, i]) => `<button class="nav ${k === S.tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${ic(i)}<span>${n}</span></button>`;
  $('#nav').innerHTML = c ? NAV.map(item).join('') + '<div class="nav-title">Advanced</div>' + NAV2.map(item).join('') : '';
}
function pickerMenu(el) {
  const old = $('.pop'); if (old) return old.remove();
  const pop = document.createElement('div'); pop.className = 'pop';
  pop.innerHTML = S.servers.map((s) => `<button data-act="pick" data-id="${s.id}"><span class="dot ${s.status}" style="margin:0"></span>${esc(s.name)}</button>`).join('') + `<button data-act="newserver"><span style="width:18px;height:18px;display:inline-flex;color:var(--accent)">${ic('plus')}</span>New server…</button>`;
  el.parentElement.append(pop);
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.pop') && !e.target.closest('.picker')) { const p = $('.pop'); if (p) p.remove(); } });

const actions = {
  tab(el) { setTab(el.dataset.tab); },
  picker: (el) => pickerMenu(el),
  pick(el) { S.cur = el.dataset.id; localStorage.setItem('cur', S.cur); $('.pop')?.remove(); drawChrome(); render(); },
  newserver() { $('.pop')?.remove(); newServer(); },
  tour() { startTour(); },
  start: guard(async () => { await post(sp('/start')); }),
  stop: guard(async () => { await post(sp('/stop')); }),
  restart: guard(async () => { await post(sp('/restart')); toast('Restarting…'); }),
  kill: guard(async () => { if (await confirmSheet('Force stop?', 'Use this only if the server is stuck. Anything not saved yet may be lost.', 'Force stop', true)) await post(sp('/kill')); }),
  quit: guard(async () => {
    const running = S.servers.filter((s) => ['running', 'starting'].includes(s.status)).length;
    if (!await confirmSheet('Quit BlockHost?', running ? `This will safely stop ${running} running server${running > 1 ? 's' : ''} first.` : 'Closes BlockHost.', 'Quit', true)) return;
    await post('/api/quit'); document.body.innerHTML = '<p style="padding:60px;font-size:18px">BlockHost has closed. You can close this window.</p>'; setTimeout(() => window.close(), 400);
  }),
  copy: guard(async (el) => { await navigator.clipboard.writeText(el.dataset.v); toast('Copied: ' + el.dataset.v); }),
  ext: (el) => window.open(el.dataset.href, '_blank'),
  closesheet: () => closeSheet(),
  about: guard(async () => {
    const a = await api('/api/about');
    sheet(`<h2>BlockHost ${esc(a.version)}</h2><p class="muted">Run your own Minecraft server at home.</p><p class="small" style="margin:12px 0"><b>NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.</b></p>${a.update ? (a.update.newer ? `<div class="card">Version ${esc(a.update.latest)} is available. <a href="#" data-act="ext" data-href="${esc(a.update.url)}">Download it</a></div>` : '<p class="muted small">You have the latest version.</p>') : ''}<div class="btns" style="justify-content:flex-start"><button class="btn" data-act="legal" data-f="privacy">Privacy</button><button class="btn" data-act="legal" data-f="notices">Licenses</button><button class="btn primary" data-act="closesheet">Done</button></div>`);
  }),
  legal: guard(async (el) => { const t = await (await fetch('/legal/' + el.dataset.f + '.txt')).text(); sheet(`<h2>${el.dataset.f === 'privacy' ? 'Privacy' : 'Licenses'}</h2><pre style="white-space:pre-wrap;font:12.5px/1.5 var(--font);max-height:55vh;overflow:auto;margin:8px 0 0">${esc(t)}</pre><div class="btns"><button class="btn primary" data-act="closesheet">Done</button></div>`, true); }),
};
function setTab(t) { S.tab = t; localStorage.setItem('tab', t); drawChrome(); render(); }
// image fallbacks (replaces inline onerror handlers)
document.addEventListener('error', (e) => { const t = e.target; if (!t || t.tagName !== 'IMG' || !t.dataset.fb) return; if (t.dataset.fb === 'hide') t.style.visibility = 'hidden'; else { const s = document.createElement('span'); s.className = 'ltr'; s.textContent = t.dataset.l || '?'; t.replaceWith(s); } }, true);
// give every switch an accessible name from its row label
new MutationObserver(() => document.querySelectorAll('.switch input:not([aria-label])').forEach((i) => { const l = i.closest('.item'); const t = l && l.querySelector('.label'); if (t) i.setAttribute('aria-label', t.textContent.trim()); })).observe(document.body, { childList: true, subtree: true });
document.addEventListener('click', (e) => { const el = e.target.closest('[data-act]'); if (!el) return; const f = (view.actions && view.actions[el.dataset.act]) || actions[el.dataset.act]; if (f) f(el, e); });

// ---- live events ------------------------------------------------------------------------
function connect() {
  const es = new EventSource('/api/events?token=' + TOKEN);
  es.onopen = () => { $('#banner').hidden = true; }; es.onerror = () => { $('#banner').hidden = false; };
  es.onmessage = (m) => {
    const e = JSON.parse(m.data), s = S.servers.find((x) => x.id === e.id);
    if (e.t === 'quit') { es.close(); document.body.innerHTML = '<p style="padding:60px;font-size:18px">BlockHost has closed. You can close this window.</p>'; setTimeout(() => window.close(), 400); return; }
    if (e.t === 'status' && s) { s.status = e.status; s.message = e.message; if (['running', 'stopped', 'crashed'].includes(e.status)) refresh(true); drawChrome(); }
    if (e.t === 'players' && s) { s.players = e.players; s.maxPlayers = e.max || s.maxPlayers; }
    if (e.t === 'stats' && s) { s.cpu = e.pt.cpu; s.ramUsed = e.pt.ram; s.tps = e.pt.tps; s.mspt = e.pt.mspt; }
    if (e.id && e.id !== S.cur) return;
    if (view.on[e.t]) view.on[e.t](e);
  };
}

// ---- shared bits ----------------------------------------------------------------------------
const V = {};
const head = (title, right = '') => { $('#head').innerHTML = `<h1>${esc(title)}</h1>${right}`; };
const colorOf = (n) => `hsl(${[...n].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 360} 55% 50%)`;
const avatar = (n) => `<div class="avatar" style="background:${colorOf(n)}">${esc(n.charAt(0).toUpperCase())}</div>`;
const sw = (id, on, extra = '') => `<label class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${extra}><span></span></label>`;
const isOn = (s) => ['running', 'starting', 'stopping'].includes(s.status);
const gb = (mb) => (mb / 1024).toFixed(mb % 1024 ? 1 : 0) + ' GB';
const maxRam = () => Math.max(2048, Math.floor((S.totalMem * 0.75) / 512) * 512);
function noServer(el) {
  head('Welcome');
  el.innerHTML = `<div class="welcome"><img src="icon.png" alt=""><h2>Let's make your server</h2><p>It takes about two minutes. No technical knowledge needed.</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn primary big" data-act="newserver">Create my first server</button><button class="btn big" data-act="tour">Watch the 1‑minute tutorial</button></div></div>`;
}
function render() {
  view = { on: {} }; renderId++;
  const el = $('#view'); el.innerHTML = ''; el.scrollTop = 0;
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); clearTimeout(el.enterT); el.enterT = setTimeout(() => el.classList.remove('enter'), 1400); // blocks rise in; live repaints later don't replay it
  if (!cur()) { noServer(el); return; }
  (V[S.tab] || V.home)(el, cur(), renderId);
}

// ---- HOME ---------------------------------------------------------------------------------------
V.home = async (el, s, rid) => {
  head(s.name);
  const lan = S.lan[0], port = s.port;
  const heroBtn = (c) => c.status === 'running' ? `<button class="btn danger big" data-act="stop">${ic('stop')} Stop server</button>`
    : ['stopped', 'error', 'crashed'].includes(c.status) ? (c.installed ? `<button class="btn green big" data-act="start">${ic('play')} Start server</button>` : '<button class="btn big" disabled>Not installed</button>')
    : `<button class="btn big" disabled><span class="spinner"></span> ${esc(c.status === 'stopping' ? 'Stopping…' : c.status === 'starting' ? 'Starting…' : 'Setting up…')}</button>`;
  const sub = (c) => c.status === 'running' ? `Running · ${c.players.length} of ${c.maxPlayers} players online` : c.status === 'crashed' ? 'The server crashed.' : statusText(c);
  el.innerHTML = `<div class="wrap">
    <div class="hero"><div class="info"><div class="muted small" style="margin-bottom:4px">${esc(TYPE_NAME[s.type] || s.type)} · Minecraft ${esc(s.mc)}</div><h2><span class="dot ${s.status}" id="h-dot"></span><span id="h-text">${esc(sub(s))}</span></h2><p class="muted small" id="h-sub" style="margin-top:6px;min-height:20px"></p></div><div id="h-btn" style="display:flex;gap:10px;flex-wrap:wrap">${heroBtn(s)}</div></div>
    <div class="join">
      <div><span class="grow"><span class="muted small">Join from this PC</span><code>localhost:${port}</code></span><button class="btn sm" data-act="copy" data-v="localhost:${port}">${ic('copy')} Copy</button></div>
      <div><span class="grow"><span class="muted small">Friends on your Wi‑Fi</span><code>${lan ? esc(lan) + ':' + port : 'Not connected to a network'}</code></span>${lan ? `<button class="btn sm" data-act="copy" data-v="${esc(lan)}:${port}">${ic('copy')} Copy</button>` : ''}</div>
    </div>
    <p class="muted small" style="margin:-8px 4px 18px">Friends somewhere else? <a href="#" data-act="tourfriends">Show me how</a></p>
    <div id="h-notes"></div>
    <div class="tiles"><div class="tile"><div class="k">Players</div><div class="v" id="t-pl">${s.players.length} / ${s.maxPlayers}</div></div>
      <div class="tile"><div class="k">Speed</div><div class="v" id="t-tps">${tpsLabel(s.tps)}</div></div>
      <div class="tile"><div class="k">Memory</div><div class="v" id="t-ram">${s.ramUsed ? gb(s.ramUsed) : '—'}</div><div class="bar"><i id="t-bar" style="width:${Math.min(100, (s.ramUsed / s.ramMb) * 100 || 0)}%"></i></div></div></div>
    <details class="card" id="perf"><summary>Performance charts</summary><div id="charts" class="muted small" style="margin-top:10px">Memory<canvas class="graph" id="g-ram"></canvas>Processor<canvas class="graph" id="g-cpu"></canvas>Speed (ticks per second)<canvas class="graph" id="g-tps"></canvas></div></details>
    <div class="group-title">Quick settings</div>
    <div class="group">
      <div class="item"><div class="grow"><div class="label">Server name</div></div><input type="text" id="c-name" value="${esc(s.name)}" maxlength="40" style="width:210px" aria-label="Server name"></div>
      <div class="item"><div class="grow"><div class="label">Memory</div><div class="desc">More memory helps with mods and many players. Your PC has ${gb(S.totalMem)}.</div></div><div class="seg" id="ramseg">${[2048, 4096, 6144].map((v) => `<button data-ram="${v}" ${v > maxRam() ? 'disabled' : ''} class="${s.ramMb === v ? 'on' : ''}">${gb(v)}</button>`).join('')}<button data-ram="custom" class="${[2048, 4096, 6144].includes(s.ramMb) ? '' : 'on'}">${[2048, 4096, 6144].includes(s.ramMb) ? 'Custom' : gb(s.ramMb)}</button></div></div>
      <div class="item"><div class="grow"><div class="label">Most players at once</div></div><div class="stepper"><button data-step="-1" aria-label="Fewer players">−</button><b id="maxp">${s.maxPlayers}</b><button data-step="1" aria-label="More players">+</button></div></div>
      <div class="item"><div class="grow"><div class="label">Performance mode</div><div class="desc">How Java is tuned. “Aikar's” is the usual choice for Plugins servers; “Default” is fine for everything else.</div></div><select id="c-flags" aria-label="Performance mode"><option value="none">Default</option><option value="aikar">Aikar's flags</option><option value="paper">Paper's recommended</option></select></div>
      <div class="item"><div class="grow"><div class="label">Restart if it crashes</div><div class="desc">BlockHost brings it back automatically.</div></div>${sw('c-auto', s.autoRestart)}</div>
      <div class="item"><div class="grow"><div class="label">Restart every day</div><div class="desc">Keeps things fresh. Players get a 5 and 1 minute warning.</div></div><input type="time" id="c-daily" value="${esc(s.dailyRestart)}" style="${s.dailyRestart ? '' : 'opacity:.5'}">${sw('c-dailyon', !!s.dailyRestart)}</div>
    </div><p class="group-note">Changes to memory and players apply the next time the server starts.</p>
    <details class="card"><summary>Change Minecraft version or type</summary><p class="muted small" style="margin:8px 0">A backup is made first and your old add-ons are set aside, not deleted. Going to an older version can break a world; the backup lets you undo it.</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><select id="sw-type">${Object.entries(TYPE_NAME).map(([k, n]) => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${n}</option>`).join('')}</select><select id="sw-ver"></select><button class="btn primary" id="sw-go">Switch</button></div><p class="small" id="sw-warn" style="color:var(--orange);margin-top:8px"></p></details>
    <div style="text-align:center;margin-top:30px"><button class="btn danger sm" id="c-del">Delete this server…</button></div></div>`;

  const cfg = guard(async (patch) => { await post(sp('/config'), patch); await refresh(true); toast('Saved'); });
  $('#c-auto').onchange = (e) => cfg({ autoRestart: e.target.checked });
  $('#c-name').onchange = guard(async (e) => { const v = e.target.value.trim(); if (!v) { e.target.value = cur().name; return; } await post(sp('/config'), { name: v }); await refresh(true); head(cur().name); toast('Saved'); });
  $('#c-flags').value = s.flags; $('#c-flags').onchange = (e) => cfg({ flags: e.target.value });
  $('#c-dailyon').onchange = (e) => { const t = $('#c-daily'); if (e.target.checked) { t.value = t.value || '04:00'; t.style.opacity = 1; } else { t.value = ''; t.style.opacity = .5; } cfg({ dailyRestart: t.value }); };
  $('#c-daily').onchange = (e) => { $('#c-dailyon').checked = !!e.target.value; cfg({ dailyRestart: e.target.value }); };
  $('#ramseg').onclick = guard(async (e) => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.ram === 'custom') { const v = await promptSheet('Custom memory', `Enter memory in GB (1 to ${maxRam() / 1024}).`, '8'); if (v && +v >= 1) await cfg({ ramMb: Math.min(maxRam(), Math.round(+v * 1024)) }); render(); } else { await cfg({ ramMb: +b.dataset.ram }); render(); }
  });
  let mp = s.maxPlayers, mpT;
  el.querySelectorAll('[data-step]').forEach((b) => { b.onclick = () => { mp = Math.max(1, Math.min(1000, mp + +b.dataset.step)); $('#maxp').textContent = mp; clearTimeout(mpT); mpT = setTimeout(guard(async () => { await post(sp('/properties'), { props: { 'max-players': mp } }); toast('Saved – applies on next start'); }), 600); }; });
  const loadV = guard(async () => { const v = await api('/api/versions?type=' + $('#sw-type').value); if (rid !== renderId) return; $('#sw-ver').innerHTML = v.map((x) => `<option ${x.id === s.mc ? 'selected' : ''}>${esc(x.id)}</option>`).join(''); $('#sw-warn').textContent = $('#sw-type').value === 'vanilla' && s.type !== 'vanilla' ? 'Going to Classic removes anything that came from mods or plugins.' : ''; });
  $('#sw-type').onchange = loadV; loadV();
  $('#sw-go').onclick = guard(async () => { if (isOn(cur())) return toast('Stop the server first.', true); if (await confirmSheet('Switch version?', `Switch to ${esc(TYPE_NAME[$('#sw-type').value])} ${esc($('#sw-ver').value)}? A backup is made first.`, 'Switch')) { await post(sp('/switch'), { type: $('#sw-type').value, mc: $('#sw-ver').value }); await refresh(); } });
  $('#c-del').onclick = guard(async () => {
    if (isOn(cur())) return toast('Stop the server first.', true);
    if (!await confirmSheet('Delete this server?', 'It will be removed from BlockHost.', 'Continue', true)) return;
    const files = await confirmSheet('Delete its world and files too?', 'This permanently erases the world, backups stay in the backups folder. Choose "Keep files" to only remove it from the list.', 'Delete everything', true);
    await post(sp('/delete'), { deleteFiles: files }); S.cur = ''; await refresh();
  });

  const notes = (c) => (c.status === 'running' && c.rconFailed ? '<div class="card" style="border-left:4px solid var(--orange)"><b>Some live info is unavailable.</b><div class="muted small">BlockHost could not connect to the server’s control port, so player lists, speed and map dots may be missing. Restarting the server usually fixes it.</div></div>' : '') + (c.status === 'running' && c.rconPort ? `<p class="muted small" style="margin:0 4px 14px">BlockHost talks to this server on a private port (${c.rconPort}). <b>Never forward that port</b> on your router; friends only need ${c.port}.</p>` : '');
  // live updates
  const repaint = () => { const c = cur(); if (!c || rid !== renderId) return; $('#h-dot').className = 'dot ' + c.status; $('#h-text').textContent = sub(c); $('#h-btn').innerHTML = heroBtn(c) + (c.status === 'running' ? `<button class="btn" data-act="restart">Restart</button>` : '') + (c.status === 'crashed' ? '<button class="btn primary" data-act="askcrash">Ask AI what happened</button>' : '') + (['running', 'starting', 'stopping'].includes(c.status) ? '<button class="btn danger sm" data-act="kill">Force stop</button>' : ''); $('#h-notes').innerHTML = notes(c); $('#t-pl').textContent = `${c.players.length} / ${c.maxPlayers}`; $('#t-tps').textContent = tpsLabel(c.tps); $('#t-ram').textContent = c.ramUsed ? gb(c.ramUsed) : '—'; $('#t-bar').style.width = Math.min(100, (c.ramUsed / c.ramMb) * 100 || 0) + '%'; };
  repaint();
  view.on.status = repaint; view.on.players = repaint;
  view.on.log = (e) => { if (cur().status === 'installing' && e.line.startsWith('[Manager]')) $('#h-sub').textContent = e.line.replace('[Manager] ', '').trim().slice(0, 110); };
  const hist = (await api(sp('/stats'))).hist; if (rid !== renderId) return;
  const draw = () => { if (!$('#perf').open) return; graph($('#g-ram'), hist.map((p) => p.ram), s.ramMb, '#007aff', ' MB'); graph($('#g-cpu'), hist.map((p) => p.cpu), 100, '#ff9f0a', '%'); graph($('#g-tps'), hist.map((p) => p.tps), 20, '#34c759', ''); };
  $('#perf').ontoggle = draw;
  view.on.stats = (e) => { hist.push(e.pt); if (hist.length > 180) hist.shift(); repaint(); draw(); };
  view.actions = { askcrash: () => { S.pendingAsk = 'Look at the recent log. Why did the server crash and how do I fix it?'; setTab('ai'); }, tourfriends: (el, ev) => { ev.preventDefault(); startTour(3); } };
};
const tpsLabel = (t) => (t == null ? '—' : t >= 19 ? 'Smooth' : t >= 15 ? 'Okay' : 'Laggy');
function graph(cv, data, max, color, unit) {
  const w = cv.width = cv.clientWidth * 2, h = cv.height = cv.clientHeight * 2, g = cv.getContext('2d'), pts = data.filter((v) => v != null);
  g.clearRect(0, 0, w, h); if (pts.length > 1) { g.strokeStyle = color; g.fillStyle = color + '33'; g.lineWidth = 3; g.beginPath(); pts.forEach((v, i) => { const x = (i / (pts.length - 1)) * w, y = h - Math.min(1, v / max) * (h - 8) - 4; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.lineTo(w, h); g.lineTo(0, h); g.fill(); }
  g.fillStyle = '#8e8e93'; g.font = '22px sans-serif'; g.fillText(`${pts.length ? Math.round(pts[pts.length - 1] * 10) / 10 : '–'}${unit}`, 10, 26);
}

// ---- LIVE LOG -----------------------------------------------------------------------------------------
const ANSI = { 30: '#6b7280', 31: '#ff6b6b', 32: '#8ce99a', 33: '#ffd479', 34: '#74c0fc', 35: '#da77f2', 36: '#66d9e8', 37: '#dcdfe4', 90: '#868e96', 91: '#ff8787', 92: '#a9e34b', 93: '#ffe066', 94: '#91a7ff', 95: '#e599f7', 96: '#99e9f2', 97: '#fff' };
const MC = { 0: '#000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa', 8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff' };
function colorize(raw) {
  let out = '', open = false; const set = (c) => { if (open) out += '</span>'; open = !!c; if (c) out += `<span style="color:${c}">`; };
  for (const p of String(raw).split(/(\x1b\[[0-9;]*m|§[0-9a-fk-orA-FK-OR])/)) { let m; if ((m = p.match(/^\x1b\[([0-9;]*)m$/))) { for (const c of m[1].split(';')) { if (c === '' || c === '0') set(null); else if (ANSI[c]) set(ANSI[c]); } } else if ((m = p.match(/^§(.)$/))) { const k = m[1].toLowerCase(); if (MC[k]) set(MC[k]); else if (k === 'r') set(null); } else out += esc(p); }
  return out + (open ? '</span>' : '');
}
const logLine = (l) => `<div class="${/\b(ERROR|FATAL)\b|Exception/.test(l) ? 'bad' : /\bWARN/.test(l) ? 'warn' : ''}">${colorize(l)}</div>`;
V.console = async (el, s, rid) => {
  head('Live log');
  el.innerHTML = `<div class="wrap"><p class="muted small">Everything the server says. You can also type commands here.</p><div class="chips">${[['Who’s online', 'list'], ['Save the world', 'save-all'], ['Make it day', 'time set day'], ['Clear the weather', 'weather clear']].map(([n, c]) => `<button class="chip" data-cmd="${c}">${n}</button>`).join('')}</div><div class="logbox" id="console"></div><div class="bar-input"><input type="text" id="cmd" placeholder="Type a command, for example: list" autocomplete="off"><button class="btn primary" id="send">Send</button></div></div>`;
  const box = $('#console'), add = (l) => { const near = box.scrollTop + box.clientHeight > box.scrollHeight - 40; box.insertAdjacentHTML('beforeend', logLine(l)); while (box.childElementCount > 2500) box.firstChild.remove(); if (near) box.scrollTop = box.scrollHeight; };
  (await api(sp('/log'))).lines.forEach(add); if (rid !== renderId) return; box.scrollTop = box.scrollHeight; view.on.log = (e) => add(e.line);
  const hist = JSON.parse(sessionStorage.getItem('cmdhist') || '[]'); let hi = hist.length;
  const run = guard(async (v) => { if (!v) return; await post(sp('/console'), { cmd: v }); });
  const send = () => { const v = $('#cmd').value.trim(); if (!v) return; hist.push(v); hi = hist.length; sessionStorage.setItem('cmdhist', JSON.stringify(hist.slice(-50))); $('#cmd').value = ''; run(v); };
  $('#send').onclick = send; el.querySelectorAll('[data-cmd]').forEach((b) => { b.onclick = () => run(b.dataset.cmd); });
  $('#cmd').onkeydown = (e) => { if (e.key === 'Enter') send(); else if (e.key === 'ArrowUp' && hi > 0) $('#cmd').value = hist[--hi]; else if (e.key === 'ArrowDown') $('#cmd').value = hi < hist.length - 1 ? hist[++hi] : (hi = hist.length, ''); };
};

// ---- CHAT ---------------------------------------------------------------------------------------------------
V.chat = async (el, s, rid) => {
  head('Chat');
  el.innerHTML = `<div class="wrap"><div class="chatbox" id="chat"></div><div class="bar-input"><input type="text" id="msg" placeholder="Say something to everyone in the game…" maxlength="256"><button class="btn primary" id="send">Send</button></div></div>`;
  const box = $('#chat'), add = (e) => { const t = new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); box.insertAdjacentHTML('beforeend', e.kind === 'chat' ? `<div class="m"><span class="muted small">${t}</span> <b>${esc(e.name)}</b> ${esc(e.msg)}</div>` : `<div class="m ${e.kind}-l"><span class="muted small">${t}</span> ${esc(e.name)} ${esc(e.msg)}</div>`); box.scrollTop = box.scrollHeight; };
  const h = (await api(sp('/chat'))).chat; if (rid !== renderId) return; if (!h.length) box.innerHTML = '<div class="empty">Chat from your players shows up here.</div>'; else h.forEach(add);
  view.on.chat = (e) => { if (box.querySelector('.empty')) box.innerHTML = ''; add(e); };
  const send = guard(async () => { const v = $('#msg').value.trim(); if (!v) return; $('#msg').value = ''; await post(sp('/chat'), { msg: v }); });
  $('#send').onclick = send; $('#msg').onkeydown = (e) => { if (e.key === 'Enter') send(); };
};

// ---- PLAYERS -----------------------------------------------------------------------------------------------------
const slot = (i) => i ? `<div class="slot" title="${esc(i.id)}${i.name ? ' – ' + esc(i.name) : ''}"><img src="${tokUrl('/api/icon?id=' + encodeURIComponent(i.id))}" data-fb="ltr" data-l="${esc(i.id.replace(/^minecraft:/, '').charAt(0).toUpperCase())}">${i.count > 1 ? `<i>${i.count}</i>` : ''}</div>` : '<div class="slot"></div>';
const grid = (items, from, n) => { const by = {}; items.forEach((i) => { by[i.slot] = i; }); let h = '<div class="invgrid">'; for (let k = from; k < from + n; k++) h += slot(by[k]); return h + '</div>'; };
V.players = async (el, s, rid) => {
  head('Players');
  const load = guard(async () => {
    const [d, pr] = await Promise.all([api(sp('/players')), api(sp('/properties'))]); if (rid !== renderId) return;
    const wl = pr.props['white-list'] === 'true', a = (n, act, label, cls = '') => `<button class="btn sm ${cls}" data-act="pact" data-a="${act}" data-n="${esc(n)}">${label}</button>`;
    el.innerHTML = `<div class="wrap">${d.running ? '' : '<p class="muted" style="margin-bottom:12px">Start the server to manage players.</p>'}
      <div class="group-title">Online now (${d.online.length})</div><div class="group">${d.online.map((p) => `<div class="item">${avatar(p.name)}<div class="grow"><div class="label">${esc(p.name)}</div></div><div class="actions">${a(p.name, 'op', 'Make admin')}${a(p.name, 'deop', 'Remove admin')}${a(p.name, 'kick', 'Kick', 'danger')}${a(p.name, 'ban', 'Ban', 'danger')}<select data-act="gm" data-n="${esc(p.name)}" style="padding:5px 8px"><option value="">Game mode…</option><option value="survival">Survival</option><option value="creative">Creative</option><option value="adventure">Adventure</option><option value="spectator">Spectator</option></select><button class="btn sm" data-act="inv" data-u="${esc(p.uuid)}" data-n="${esc(p.name)}">Inventory</button></div></div>`).join('') || '<div class="empty">Nobody is online right now.</div>'}</div>
      <div class="group-title">Who can join</div><div class="group"><div class="item"><div class="grow"><div class="label">Only players I approve</div><div class="desc">Turn this on to make your server private.</div></div>${sw('wl-on', wl)}</div>
        <div class="item"><div class="grow"><input type="text" id="wl" placeholder="Add a player by name" style="width:100%"></div><button class="btn sm" data-act="wladd">Approve</button></div>
        ${d.whitelist.map((p) => `<div class="item">${avatar(p.name)}<div class="grow">${esc(p.name)}</div>${a(p.name, 'whitelist-remove', 'Remove')}</div>`).join('')}</div>
      ${d.ops.length ? `<div class="group-title">Admins</div><div class="group">${d.ops.map((p) => `<div class="item">${avatar(p.name)}<div class="grow">${esc(p.name)}</div>${a(p.name, 'deop', 'Remove admin')}</div>`).join('')}</div>` : ''}
      ${d.banned.length ? `<div class="group-title">Banned</div><div class="group">${d.banned.map((p) => `<div class="item">${avatar(p.name)}<div class="grow">${esc(p.name)}<div class="desc">${esc(p.reason || '')}</div></div>${a(p.name, 'unban', 'Unban')}</div>`).join('')}</div>` : ''}
      <div class="group-title">Everyone who has joined</div><div class="group">${d.known.map((p) => `<div class="item">${avatar(p.name)}<div class="grow">${esc(p.name)}</div><div class="actions">${a(p.name, 'op', 'Make admin')}${a(p.name, 'ban', 'Ban', 'danger')}<button class="btn sm" data-act="inv" data-u="${esc(p.uuid)}" data-n="${esc(p.name)}">Inventory</button></div></div>`).join('') || '<div class="empty">No one has joined yet.</div>'}</div></div>`;
    $('#wl-on').onchange = guard(async (e) => { await post(sp('/properties'), { props: { 'white-list': e.target.checked, 'enforce-whitelist': e.target.checked } }); if (d.running) await post(sp('/players'), { action: e.target.checked ? 'whitelist-on' : 'whitelist-off' }); toast(e.target.checked ? 'Only approved players can join' : 'Anyone can join'); });
  });
  await load(); view.on.players = () => { if (document.activeElement.tagName !== 'SELECT' && document.activeElement.tagName !== 'INPUT') load(); };
  view.actions = {
    pact: guard(async (b) => { const a = b.dataset.a; let reason = ''; if (a === 'ban' || a === 'kick') { reason = await promptSheet(a === 'ban' ? `Ban ${b.dataset.n}?` : `Kick ${b.dataset.n}?`, 'Add a reason if you like (optional).', 'Reason'); if (reason === null) return; } await post(sp('/players'), { action: a, name: b.dataset.n, reason }); toast('Done'); setTimeout(load, 700); }),
    gm: guard(async (sel) => { if (sel.value) { await post(sp('/players'), { action: 'gamemode', name: sel.dataset.n, gamemode: sel.value }); toast('Game mode changed'); } }),
    wladd: guard(async () => { const n = $('#wl').value.trim(); if (n) { await post(sp('/players'), { action: 'whitelist-add', name: n }); setTimeout(load, 700); } }),
    inv: guard(async (b) => {
      const d = await api(sp('/inventory?uuid=' + encodeURIComponent(b.dataset.u))), ar = d.armor;
      sheet(`<h2>${esc(b.dataset.n)}</h2><div class="muted small">Health ${d.health ?? '?'} · Level ${d.xp ?? '?'} · last saved snapshot</div><div class="group-title" style="margin-left:0">Armor and off‑hand</div><div class="invgrid" style="grid-template-columns:repeat(5,44px)">${slot(ar.head)}${slot(ar.chest)}${slot(ar.legs)}${slot(ar.feet)}${slot(d.offhand)}</div><div class="group-title" style="margin-left:0">Backpack</div>${grid(d.inventory, 9, 27)}<div class="group-title" style="margin-left:0">Hotbar</div>${grid(d.inventory, 0, 9)}<div class="group-title" style="margin-left:0">Ender chest</div>${grid(d.ender, 0, 27)}<div class="btns"><button class="btn primary" data-act="closesheet">Done</button></div>`, true);
    }),
  };
};
document.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.act === 'gm' && view.actions) view.actions.gm(e.target); });

// ---- MAP ---------------------------------------------------------------------------------------------------------------
V.map = async (el, s, rid) => {
  head('Map', `<div class="seg" id="m-dim"><button data-d="overworld" class="on">Overworld</button><button data-d="nether">Nether</button><button data-d="end">The End</button></div><button class="btn" id="m-bm">3D view (BlueMap)</button>`);
  el.innerHTML = `<div class="wrap" style="max-width:none"><div id="m-tex"></div><div class="mapwrap"><canvas id="m-cv"></canvas><div class="mapctl"><button id="m-in" aria-label="Zoom in">+</button><button id="m-out" aria-label="Zoom out">−</button><button id="m-me" aria-label="Center on a player" title="Center on a player">◎</button></div></div><p class="muted small" id="m-info" style="margin-top:8px"></p></div>`;
  const cv = $('#m-cv'), g = cv.getContext('2d'), M = { cx: 0, cz: 0, k: 1, regions: new Set(), img: new Map(), ver: Date.now(), markers: {}, dim: 'overworld' }, dimId = { overworld: 'minecraft:overworld', nether: 'minecraft:the_nether', end: 'minecraft:the_end' };
  function draw() {
    const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight; g.imageSmoothingEnabled = false; g.fillStyle = '#0f1115'; g.fillRect(0, 0, w, h);
    const x0 = Math.floor((M.cx - w / 2 / M.k) / 512), x1 = Math.floor((M.cx + w / 2 / M.k) / 512), z0 = Math.floor((M.cz - h / 2 / M.k) / 512), z1 = Math.floor((M.cz + h / 2 / M.k) / 512);
    for (let rz = z0; rz <= z1; rz++) for (let rx = x0; rx <= x1; rx++) { if (!M.regions.has(rx + ',' + rz)) continue; const key = `${M.dim}/${rx}/${rz}/${M.ver}`; let t = M.img.get(key); if (!t) { t = new Image(); t.onload = draw; t.src = tokUrl(sp(`/map/tile?dim=${M.dim}&x=${rx}&z=${rz}&v=${M.ver}`)); M.img.set(key, t); } if (t.complete && t.naturalWidth) g.drawImage(t, (rx * 512 - M.cx) * M.k + w / 2, (rz * 512 - M.cz) * M.k + h / 2, 512 * M.k, 512 * M.k); }
    g.font = '600 12px sans-serif';
    for (const [n, p] of Object.entries(M.markers)) { if ((p.dim || 'minecraft:overworld') !== dimId[M.dim]) continue; const x = (p.x - M.cx) * M.k + w / 2, y = (p.z - M.cz) * M.k + h / 2; g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillText(n, x + 10, y + 4); }
  }
  const load = guard(async () => {
    const d = await api(sp('/map?dim=' + M.dim)); if (rid !== renderId) return; M.regions = new Set(d.regions.map((r) => r.x + ',' + r.z)); M.markers = d.markers; M.ver = Date.now();
    const old = /^1\.(\d+)/.exec(cur().mc), tooOld = old && +old[1] < 13;
    $('#m-info').textContent = tooOld ? 'Maps for Minecraft versions older than 1.13 are not supported yet.' : d.regions.length ? 'Drag to move, scroll to zoom. Red dots are players.' : 'Nothing to show yet. Start the server and explore a bit, then the map fills in.';
    $('#m-tex').innerHTML = d.textures ? '' : `<div class="card">Colours are approximate because Minecraft isn't installed on this PC. <button class="btn sm" id="m-dl">Download the real textures (25 MB)</button></div>`;
    if ($('#m-dl')) $('#m-dl').onclick = guard(async () => { $('#m-dl').disabled = true; await post('/api/map/textures', { version: cur().mc }); toast('Done'); load(); });
    const first = Object.values(d.markers)[0]; if (first && !M.moved) { M.cx = first.x; M.cz = first.z; } draw();
  });
  $('#m-dim').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; [...$('#m-dim').children].forEach((x) => x.classList.toggle('on', x === b)); M.dim = b.dataset.d; M.moved = false; load(); };
  let drag = null; cv.onmousedown = (e) => { drag = [e.clientX, e.clientY]; cv.style.cursor = 'grabbing'; }; window.onmouseup = () => { drag = null; cv.style.cursor = 'grab'; };
  cv.onmousemove = (e) => { if (!drag) return; M.cx -= (e.clientX - drag[0]) / M.k; M.cz -= (e.clientY - drag[1]) / M.k; drag = [e.clientX, e.clientY]; M.moved = true; draw(); };
  const zoom = (f) => { M.k = Math.max(0.1, Math.min(8, M.k * f)); draw(); }; cv.onwheel = (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2); };
  $('#m-in').onclick = () => zoom(1.4); $('#m-out').onclick = () => zoom(1 / 1.4); $('#m-me').onclick = () => { const p = Object.values(M.markers)[0]; if (p) { M.cx = p.x; M.cz = p.z; draw(); } else toast('No players online'); };
  $('#m-bm').onclick = guard(async () => {
    try { await fetch('http://127.0.0.1:8100/', { mode: 'no-cors' }); } catch { return toast('BlueMap was not found on port 8100. Install the BlueMap add-on, start the server, and try again.', true); }
    $('.mapwrap').innerHTML = '<iframe src="http://127.0.0.1:8100/" title="BlueMap 3D map" style="width:100%;height:100%;border:0"></iframe><div class="mapctl"><button class="btn sm" data-act="map2d" style="width:auto;height:auto;border-radius:999px;padding:6px 14px">← 2D map</button></div>';
    view.actions = Object.assign({}, view.actions, { map2d: () => render() });
  });
  view.on.players = (e) => { M.markers = e.pos || {}; draw(); }; window.onresize = draw; await load();
};

// ---- ADD-ONS (mods / plugins) --------------------------------------------------------------------------------------------------------
V.mods = async (el, s, rid) => {
  const plugin = ['paper', 'purpur'].includes(s.type), kind = plugin ? 'plugin' : 'mod';
  head('Add-ons');
  if (s.type === 'vanilla') { el.innerHTML = `<div class="wrap"><div class="card"><h3>Classic servers can't have add-ons</h3><p class="muted">Switch to <b>Plugins (Paper)</b> or <b>Mods (Fabric)</b> on the Home screen to add mods and plugins.</p></div></div>`; return; }
  let mode = 'browse', updates = {};
  const shell = () => { el.innerHTML = `<div class="wrap"><div style="margin-bottom:14px"><div class="seg" id="mode"><button data-m="browse" class="${mode === 'browse' ? 'on' : ''}">Find ${kind}s</button><button data-m="installed" class="${mode === 'installed' ? 'on' : ''}">Installed</button></div></div><div id="pane"></div></div>`; $('#mode').onclick = (e) => { const b = e.target.closest('button'); if (b) { mode = b.dataset.m; shell(); } }; (mode === 'browse' ? browse : installed)(); };
  function browse() {
    $('#pane').innerHTML = `<div class="card"><div style="display:flex;gap:10px;flex-wrap:wrap"><input type="search" id="q" placeholder="Search for ${kind}s (for example: performance, minimap, economy)" style="flex:1;min-width:200px"><div class="seg" id="src"><button data-s="modrinth" class="on">Modrinth</button><button data-s="curseforge">CurseForge</button></div><button class="btn primary" id="go">Search</button></div>
      <div id="cfkey" class="item" hidden style="padding:12px 0 0"><div class="grow muted small">CurseForge needs a free key: sign in at <a href="#" data-act="ext" data-href="https://console.curseforge.com">console.curseforge.com</a> → API keys.</div><input type="password" id="cfk" placeholder="Paste key" style="width:200px"><button class="btn sm" id="cfsave">Save</button></div></div>
      <div id="res"></div><div class="drop" id="drop">Or drop a <b>.jar</b> file here to add it</div>`;
    let src = 'modrinth'; const srcUi = () => { $('#cfkey').hidden = src !== 'curseforge' || S.cfKey; };
    const search = guard(async () => { if (src === 'curseforge' && !S.cfKey) return; $('#res').innerHTML = '<div class="empty"><span class="spinner"></span></div>'; const r = await api(sp(`/mods/search?source=${src}&q=${encodeURIComponent($('#q').value)}`)); if (rid !== renderId) return;
      $('#res').innerHTML = `<div class="group">${r.hits.map((h) => `<div class="item"><img class="thumb" src="${esc(h.icon || '')}" data-fb="hide"><div class="grow"><div class="label">${esc(h.title)} <span class="muted small">by ${esc(h.author)}</span></div><div class="desc">${esc(h.description)}</div></div><button class="btn sm primary" data-act="minst" data-p="${esc(h.id)}">Install</button></div>`).join('') || '<div class="empty">Nothing found. Try a different word.</div>'}</div>`; });
    $('#go').onclick = search; $('#q').onkeydown = (e) => { if (e.key === 'Enter') search(); };
    $('#src').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; [...$('#src').children].forEach((x) => x.classList.toggle('on', x === b)); src = b.dataset.s; srcUi(); if ($('#cfkey').hidden) search(); else $('#res').innerHTML = ''; };
    $('#cfsave').onclick = guard(async () => { await post('/api/curseforge/key', { key: $('#cfk').value }); S.cfKey = true; $('#cfk').value = ''; srcUi(); toast('Saved'); search(); });
    const drop = $('#drop'); drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = guard(async (e) => { e.preventDefault(); drop.classList.remove('over'); for (const f of e.dataTransfer.files) { if (!f.name.endsWith('.jar')) { toast(f.name + ' is not a .jar file', true); continue; } const r = await fetch(sp('/mods/upload?name=' + encodeURIComponent(f.name)), { method: 'POST', headers: { 'x-blockhost-token': TOKEN }, body: f }); const j = await r.json(); if (!r.ok) toast(j.error, true); else toast('Added ' + f.name); } });
    if (S.presetQuery) { $('#q').value = S.presetQuery; S.presetQuery = ''; }
    search();
  }
  const installed = guard(async () => {
    const l = await api(sp('/mods')); if (rid !== renderId) return;
    $('#pane').innerHTML = `<div style="margin-bottom:12px"><button class="btn" id="upd">Check for updates</button></div><div class="group">${l.map((m) => `<div class="item"><div class="grow"><div class="label">${esc(m.name)} <span class="muted small">${esc(m.version)}</span> ${updates[m.file] ? `<span class="badge green">Update ${esc(updates[m.file])}</span>` : ''}</div><div class="desc">${(m.size / 1048576).toFixed(1)} MB${m.enabled ? '' : ' · turned off'}</div></div>${updates[m.file] ? `<button class="btn sm primary" data-act="mupd" data-f="${esc(m.file)}">Update</button>` : ''}<label class="switch" title="Turn on or off"><input type="checkbox" data-act="mtog" data-f="${esc(m.file)}" ${m.enabled ? 'checked' : ''}><span></span></label><button class="btn sm danger" data-act="mrm" data-f="${esc(m.file)}">Remove</button></div>`).join('') || '<div class="empty">Nothing installed yet. Use “Find” to add some.</div>'}</div>`;
    $('#upd').onclick = guard(async () => { const u = await api(sp('/mods/updates')); updates = Object.fromEntries(u.map((x) => [x.file, x.latest])); toast(u.length ? `${u.length} update${u.length > 1 ? 's' : ''} available` : 'Everything is up to date'); installed(); });
  });
  view.actions = {
    minst: guard(async (b) => { b.disabled = true; b.innerHTML = '<span class="spinner"></span>'; try { const r = await post(sp('/mods/install'), { project: b.dataset.p, source: $('#src .on').dataset.s }); toast(r.installed.length ? 'Installed' : 'Already installed'); b.innerHTML = ic('check'); } catch (e) { b.disabled = false; b.textContent = 'Install'; throw e; } }),
    mtog: guard(async (b) => { await post(sp('/mods/toggle'), { file: b.dataset.f }); toast('Restart the server to apply'); installed(); }),
    mrm: guard(async (b) => { if (await confirmSheet('Remove this add-on?', esc(b.dataset.f), 'Remove', true)) { await post(sp('/mods/remove'), { file: b.dataset.f }); installed(); } }),
    mupd: guard(async (b) => { b.disabled = true; await post(sp('/mods/update'), { file: b.dataset.f }); delete updates[b.dataset.f]; toast('Updated'); installed(); }),
  };
  shell();
};
document.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.act === 'mtog' && view.actions) view.actions.mtog(e.target); });

// ---- BACKUPS ---------------------------------------------------------------------------------------------------------------------
V.backups = async (el, s, rid) => {
  head('Backups');
  el.innerHTML = `<div class="wrap"><div class="card" style="text-align:center"><p class="muted" style="margin-bottom:14px">A backup is a safe copy of your world. You can go back to it any time.</p><button class="btn primary big" id="bk">${ic('backup')} Back up now</button></div>
    <div class="group-title">Automatic backups</div><div class="group"><div class="item"><div class="grow"><div class="label">Back up automatically</div><div class="desc">Every <input type="number" id="bh" min="1" style="width:64px;padding:4px 8px" value="${s.backupEveryHours || 6}"> hours, keeping the last <input type="number" id="bn" min="1" style="width:64px;padding:4px 8px" value="${s.backupKeep}"> backups.</div></div>${sw('bauto', s.backupEveryHours > 0)}</div></div>
    <div class="group-title">Your backups</div><div class="group" id="bl"></div></div>`;
  const list = guard(async () => { const l = await api(sp('/backups')); if (rid !== renderId) return; $('#bl').innerHTML = l.map((b) => `<div class="item"><div class="grow"><div class="label">${esc(new Date(b.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))}</div><div class="desc">${(b.size / 1048576).toFixed(1)} MB · ${esc(b.label || 'manual')}</div></div><button class="btn sm" data-act="brs" data-f="${esc(b.file)}">Restore</button><button class="btn sm danger" data-act="brd" data-f="${esc(b.file)}">Delete</button></div>`).join('') || '<div class="empty">No backups yet.</div>'; });
  $('#bk').onclick = guard(async () => { $('#bk').disabled = true; $('#bk').innerHTML = '<span class="spinner"></span> Backing up…'; try { await post(sp('/backups')); toast('Backup created'); } finally { $('#bk').disabled = false; $('#bk').innerHTML = ic('backup') + ' Back up now'; } list(); });
  const saveAuto = guard(async () => { await post(sp('/config'), { backupEveryHours: $('#bauto').checked ? Math.max(1, +$('#bh').value || 6) : 0, backupKeep: Math.max(1, +$('#bn').value || 5) }); toast('Saved'); });
  ['bauto', 'bh', 'bn'].forEach((id) => { $('#' + id).onchange = saveAuto; });
  view.actions = {
    brs: guard(async (b) => { if (isOn(cur())) return toast('Stop the server first, then restore.', true); if (await confirmSheet('Restore this backup?', 'Your current world is kept next to it, so you can undo this.', 'Restore')) { await post(sp('/backups/restore'), { file: b.dataset.f }); toast('Restored'); } }),
    brd: guard(async (b) => { if (await confirmSheet('Delete this backup?', 'This can’t be undone.', 'Delete', true)) { await post(sp('/backups/delete'), { file: b.dataset.f }); list(); } }),
  };
  list();
};

// ---- SETTINGS -----------------------------------------------------------------------------------------------------------------------------
const PROPS = [
  ['Gameplay', [['gamemode', ['survival', 'creative', 'adventure', 'spectator'], 'Default game mode', 'What new players start in.'], ['difficulty', ['peaceful', 'easy', 'normal', 'hard'], 'Difficulty', ''], ['pvp', 'bool', 'Players can fight each other', ''], ['hardcore', 'bool', 'Hardcore', 'Players are banned when they die.'], ['spawn-monsters', 'bool', 'Monsters', ''], ['spawn-animals', 'bool', 'Animals', ''], ['allow-flight', 'bool', 'Allow flying', 'Needed by some mods; otherwise flying can kick players.'], ['allow-nether', 'bool', 'Nether portals work', ''], ['enable-command-block', 'bool', 'Command blocks', '']]],
  ['Server', [['motd', 'text', 'Message in the server list', 'What players see under your server name.'], ['view-distance', 'number', 'How far players see', 'In chunks. Lower is faster. 8 to 12 is typical.'], ['simulation-distance', 'number', 'How far things move', 'In chunks. Lower is faster.'], ['spawn-protection', 'number', 'Protected area around spawn', 'In blocks. 0 turns it off.']]],
  ['World', [['level-name', 'text', 'World folder name', ''], ['level-seed', 'text', 'World seed', 'Only used when a new world is made.']]],
];
V.settings = async (el, s, rid) => {
  head('Settings');
  const d = await api(sp('/properties')); if (rid !== renderId) return;
  const row = ([k, t, l, desc]) => `<div class="item"><div class="grow"><div class="label">${l}</div>${desc ? `<div class="desc">${desc}</div>` : ''}</div>${t === 'bool' ? sw('p-' + k, d.props[k] === 'true', `data-k="${k}"`) : Array.isArray(t) ? `<select data-k="${k}">${t.map((o) => `<option ${d.props[k] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>` : `<input data-k="${k}" type="${t}" value="${esc(d.props[k] ?? '')}" style="width:${t === 'number' ? '90px' : '220px'}">`}</div>`;
  const offline = d.props['online-mode'] === 'false', plugin = ['paper', 'purpur'].includes(s.type);
  const joinGroup = `<div class="group-title">Who can join</div><div class="group"><div class="item"><div class="grow"><div class="label">Allow non‑premium accounts</div><div class="desc">Lets players without a paid Minecraft account join (this is “offline mode”). Off is safer: only real, verified accounts get in.</div></div>${sw('p-offline', offline)}</div>
    ${offline ? `<div class="item" style="align-items:flex-start"><div class="grow small" style="color:var(--orange)"><b>Heads up:</b> in this mode anyone can join using any name, including an admin's. Turn on “Only players I approve” in Players${plugin ? ', and add a login-password plugin' : ''}.</div><div class="actions"><button class="btn sm" data-act="gotoplayers">Open Players</button>${plugin ? '<button class="btn sm" data-act="gotologin">Find a login plugin</button>' : ''}</div></div>` : ''}</div>`;
  el.innerHTML = `<div class="wrap"><div id="restartbar"></div>${joinGroup}${PROPS.map(([g, rows]) => `<div class="group-title">${g}</div><div class="group">${rows.map(row).join('')}</div>`).join('')}
    <details class="card" style="margin-top:22px"><summary>Advanced: edit the raw file</summary><textarea id="raw" class="mono" rows="14" spellcheck="false" style="margin-top:10px">${esc(d.raw)}</textarea><div class="btns" style="margin-top:10px"><button class="btn primary" id="rs">Save file</button></div></details></div>`;
  const saved = guard(async (inp) => { const k = inp.dataset.k, v = inp.type === 'checkbox' ? String(inp.checked) : inp.value; const r = await post(sp('/properties'), { props: { [k]: v } }); toast('Saved'); $('#restartbar').innerHTML = r.restartNeeded ? `<div class="card" style="display:flex;align-items:center;gap:12px"><div class="grow muted">Restart the server to apply your changes.</div><button class="btn primary" data-act="restart">Restart now</button></div>` : ''; });
  el.querySelectorAll('[data-k]').forEach((i) => { i.onchange = () => saved(i); });
  const setOffline = guard(async (on) => { const r = await post(sp('/properties'), { props: { 'online-mode': on ? 'false' : 'true' } }); toast(on ? 'Non‑premium accounts allowed' : 'Only verified accounts can join'); if (r.restartNeeded) toast('Restart the server to apply'); V.settings(el, s, rid); });
  $('#p-offline').onchange = async (e) => {
    if (!e.target.checked) return setOffline(false);
    e.target.checked = false; // stays off until the person confirms
    if (await confirmSheet('Allow non‑premium accounts?', 'Players will be able to join <b>without a paid Minecraft account</b>, but there is no way to check who they really are: <b>anyone can join as any name</b>, even an admin. Players also get a different identity than on a verified server, so their items and admin rights do not carry over when you switch this back.<br><br>If you turn this on, also use “Only players I approve”' + (['paper', 'purpur'].includes(s.type) ? ' and a login-password plugin.' : '.'), 'Allow them', true)) setOffline(true);
  };
  view.actions = { gotoplayers: () => setTab('players'), gotologin: () => { S.presetQuery = 'LibreLogin'; setTab('mods'); } };
  $('#rs').onclick = guard(async () => { await post(sp('/properties'), { raw: $('#raw').value }); toast('Saved'); });
};

// ---- FILES ---------------------------------------------------------------------------------------------------------------------------------------
V.files = async (el, s, rid) => {
  head('Files');
  let dir = '';
  const open = guard(async (d) => {
    dir = d; const l = await api(sp('/files?path=' + encodeURIComponent(d))); if (rid !== renderId) return; const up = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '';
    el.innerHTML = `<div class="wrap"><p class="muted small">For advanced users. You can only open files inside this server's folder.</p><div class="group-title">/${esc(d)}</div><div class="group">${d ? `<div class="file" data-act="fdir" data-p="${esc(up)}">↩ Back</div>` : ''}${l.map((f) => `<div class="file" data-act="${f.dir ? 'fdir' : 'ffile'}" data-p="${esc((d ? d + '/' : '') + f.name)}">${f.dir ? '📁' : '📄'} <span class="grow">${esc(f.name)}</span><span class="muted small">${f.dir ? '' : (f.size / 1024).toFixed(1) + ' KB'}</span></div>`).join('')}</div><div id="ed"></div></div>`;
  });
  view.actions = { fdir: (b) => open(b.dataset.p), ffile: guard(async (b) => { const p = b.dataset.p, r = await api(sp('/file?path=' + encodeURIComponent(p))); $('#ed').innerHTML = `<div class="card" style="margin-top:16px"><h3>${esc(p)}</h3><textarea id="fc" class="mono" rows="20" spellcheck="false" style="margin-top:10px">${esc(r.content)}</textarea><div class="btns" style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn primary" id="fs">Save</button></div><p class="muted small">Stop the server first for most config files.</p></div>`; $('#fs').onclick = guard(async () => { await post(sp('/file'), { path: p, content: $('#fc').value }); toast('Saved'); }); $('#ed').scrollIntoView({ behavior: 'smooth' }); }) };
  open('');
};

// ---- ASK AI ------------------------------------------------------------------------------------------------------------------------------------------
const PROV = {
  gemini: { name: 'Google Gemini', tag: 'Free to start', keyUrl: 'https://aistudio.google.com/apikey', usageUrl: 'https://aistudio.google.com/usage', blurb: 'Easiest and has a free tier.' },
  anthropic: { name: 'Claude', tag: 'Pay as you go', keyUrl: 'https://console.anthropic.com/settings/keys', usageUrl: 'https://console.anthropic.com/settings/usage', blurb: 'Very good at explaining problems.' },
  openai: { name: 'ChatGPT (OpenAI)', tag: 'Pay as you go', keyUrl: 'https://platform.openai.com/api-keys', usageUrl: 'https://platform.openai.com/usage', blurb: 'Needs a few dollars of credit.' },
};
const usageBar = () => {
  const p = S.ai.provider, u = (S.ai.usage || {})[p] || { requests: 0, tokens: 0 }, b = S.ai.budget || 200000, pct = Math.min(100, (u.tokens / b) * 100), col = pct < 70 ? 'var(--green)' : pct < 90 ? 'var(--orange)' : 'var(--red)';
  return `<div class="card" id="usage"><div style="display:flex;align-items:baseline;gap:10px"><h3 class="grow" style="flex:1">AI usage today</h3><span class="muted small">${esc(PROV[p].name)}</span></div>
    <div class="bar" style="height:10px;margin:12px 0 8px"><i style="width:${pct}%;background:${col}"></i></div>
    <div class="muted small">${u.requests} question${u.requests === 1 ? '' : 's'} · ${u.tokens.toLocaleString()} of ${b.toLocaleString()} words-ish (tokens) allowed today${pct >= 100 ? ' — <b style="color:var(--red)">limit reached</b>' : ''}</div>
    <div class="muted small" style="margin-top:6px">This counts what BlockHost sends. Your real balance is in your <a href="#" data-act="ext" data-href="${PROV[p].usageUrl}">${esc(PROV[p].name)} dashboard</a>. <a href="#" data-act="setlimit">Change the daily limit</a></div></div>`;
};
V.ai = async (el, s, rid) => {
  head('Ask AI');
  const a = S.ai, prov = a.provider, hasKey = !!a.hasKey[prov], msgs = S.chats[s.id] = S.chats[s.id] || [];
  const providerCards = `<div class="cards">${Object.entries(PROV).map(([k, v]) => `<button class="choice ${k === prov ? 'on' : ''}" data-act="aiprov" data-p="${k}"><span class="badge ${k === 'gemini' ? 'green' : 'gray'}">${v.tag}</span>${ic('spark')}<b>${v.name}</b><span class="d">${v.blurb}</span></button>`).join('')}</div>`;
  const keyCard = `<div class="card"><h3>Connect an AI</h3><p class="muted small" style="margin:4px 0 14px">The AI can explain crashes, answer questions about your server and even build a whole server from an idea. It needs an <b>API key</b> (a ChatGPT or Claude subscription can't be used for this).</p>${providerCards}
    <ol class="muted" style="margin:16px 0 8px;padding-left:20px;line-height:1.9"><li><a href="#" data-act="ext" data-href="${PROV[prov].keyUrl}">Open ${esc(PROV[prov].name)}'s key page</a> and create a key</li><li>Paste it here</li></ol>
    <div style="display:flex;gap:10px"><input type="password" id="a-key" placeholder="Paste your ${esc(PROV[prov].name)} key" style="flex:1" autocomplete="off"><button class="btn primary" id="a-save">Connect</button></div><p class="muted small" style="margin-top:8px">🔒 Your key is stored encrypted on this PC and is only ever sent to ${esc(PROV[prov].name)}.</p></div>`;
  const chatCard = `<div class="card"><h3>Ask about “${esc(s.name)}”</h3><p class="muted small" style="margin:4px 0 10px">The AI sees your server type, version, memory, add-ons and recent log. Commands it suggests only run when you press Run.</p><div class="chips">${['Why did my server crash?', 'Why is it laggy?', 'How do I let friends join?'].map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div><div id="a-chat"></div><div class="bar-input"><textarea id="a-in" rows="2" placeholder="Ask anything…"></textarea><button class="btn primary" id="a-send" style="align-self:flex-end">Ask</button></div></div>`;
  const buildCard = `<div class="card"><h3>${ic('spark').replace('<svg', '<svg width="20" height="20" style="vertical-align:-4px;color:var(--accent)"')} Build a server from an idea</h3><p class="muted small" style="margin:4px 0 10px">Describe the server you imagine. The AI picks the software, version and mods, BlockHost checks they exist, and you review everything before anything is installed.</p><textarea id="idea" rows="3" placeholder="Example: A relaxed Fabric server for 4 friends with better performance, a few quality-of-life mods and some magic."></textarea><div class="chips">${['Chill survival with friends', 'Tech and automation modpack', 'Fast and lag-free for 10 players'].map((q) => `<button class="chip" data-idea="${esc(q)}">${esc(q)}</button>`).join('')}</div><button class="btn primary" id="design">Design my server</button></div>`;
  const settingsCard = `<details class="card"><summary>AI settings</summary><div style="margin-top:12px">${providerCards}<div class="item" style="padding:12px 0"><div class="grow label">Model</div><select id="a-model"></select><button class="btn sm" id="a-load">Refresh list</button></div><div class="item" style="padding:0"><div class="grow label">Key</div><button class="btn sm danger" id="a-clear">Remove key</button></div></div></details>`;
  el.innerHTML = `<div class="wrap">${hasKey ? usageBar() + buildCard + chatCard + settingsCard : keyCard}</div>`;

  const providerPick = guard(async (b) => { await post('/api/ai/settings', { provider: b.dataset.p }); await refresh(true); V.ai(el, s, rid); });
  view.actions = { aiprov: providerPick, setlimit: guard(async (_, ev) => { ev.preventDefault(); const v = await promptSheet('Daily AI limit', 'Maximum tokens BlockHost may use per day. About 700 tokens is one short answer; 200,000 is plenty.', String(S.ai.budget)); if (v && +v >= 1000) { await post('/api/ai/settings', { budget: +v }); await refresh(true); $('#usage').outerHTML = usageBar(); } }), ext: actions.ext };
  if (!hasKey) { $('#a-save').onclick = guard(async () => { const k = $('#a-key').value.trim(); if (k.length < 10) return toast('That doesn’t look like a key.', true); await post('/api/ai/settings', { provider: prov, keyFor: prov, key: k }); toast('Connected'); await refresh(true); V.ai(el, s, rid); }); return; }

  const models = guard(async () => { const m = (await api('/api/ai/models?provider=' + prov)).models, sel = a.models[prov] || (prov === 'anthropic' ? 'claude-sonnet-5-5' : m[0]); $('#a-model').innerHTML = m.map((x) => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join(''); if (!a.models[prov]) await post('/api/ai/settings', { modelFor: prov, model: $('#a-model').value }); });
  $('#a-model').innerHTML = `<option>${esc(a.models[prov] || '(loading…)')}</option>`; models();
  $('#a-load').onclick = models; $('#a-model').onchange = guard(() => post('/api/ai/settings', { modelFor: prov, model: $('#a-model').value }).then(() => refresh(true)));
  $('#a-clear').onclick = guard(async () => { if (await confirmSheet('Remove the key?', 'You can connect again any time.', 'Remove', true)) { await post('/api/ai/settings', { keyFor: prov, key: '' }); await refresh(true); V.ai(el, s, rid); } });

  const mdish = (t) => String(t).split(/```/).map((p, i) => { if (i % 2 === 0) return esc(p); const nl = p.indexOf('\n'), lang = p.slice(0, nl).trim(), body = p.slice(nl + 1).trim(); return lang === 'mc' ? body.split('\n').filter(Boolean).map((c) => `<div class="cmd"><code>${esc(c)}</code><button class="btn sm green" data-act="airun" data-c="${esc(c)}">Run</button></div>`).join('') : `<div class="cmd"><code>${esc(body)}</code></div>`; }).join('');
  const draw = () => { $('#a-chat').innerHTML = msgs.map((m) => `<div class="ai-msg ${m.role === 'user' ? 'user' : ''}">${m.role === 'user' ? esc(m.content) : mdish(m.content)}</div>`).join(''); };
  const ask = guard(async (text) => { if (!text.trim()) return; msgs.push({ role: 'user', content: text }); draw(); $('#a-in').value = ''; $('#a-chat').insertAdjacentHTML('beforeend', '<div class="ai-msg" id="a-wait"><span class="spinner"></span></div>');
    try { const r = await post(sp('/ai'), { messages: msgs }); msgs.push({ role: 'assistant', content: r.reply }); S.ai = r.ai; $('#usage').outerHTML = usageBar(); } catch (e) { msgs.pop(); throw e; } finally { draw(); } });
  $('#a-send').onclick = () => ask($('#a-in').value); el.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => ask(b.dataset.q); });
  view.actions.airun = guard(async (b) => { await post(sp('/console'), { cmd: b.dataset.c }); toast('Sent: ' + b.dataset.c); b.disabled = true; });
  el.querySelectorAll('[data-idea]').forEach((b) => { b.onclick = () => { $('#idea').value = b.dataset.idea; }; });
  $('#design').onclick = guard(async () => {
    const idea = $('#idea').value.trim(); if (idea.length < 5) return toast('Describe the server in a sentence or two.', true);
    $('#design').disabled = true; $('#design').innerHTML = '<span class="spinner"></span> Designing…';
    try { const r = await post('/api/ai/plan', { idea }); S.ai = r.ai; planSheet(r.plan); } finally { $('#design').disabled = false; $('#design').textContent = 'Design my server'; $('#usage') && ($('#usage').outerHTML = usageBar()); }
  });
  draw();
  if (S.pendingAsk) { const q = S.pendingAsk; S.pendingAsk = null; ask(q); }
};

function planSheet(plan) {
  const found = plan.mods.filter((m) => m.found), missing = plan.mods.filter((m) => !m.found);
  sheet(`<h2>Here's your plan</h2><p class="muted" style="margin-bottom:12px">${esc(plan.summary)}</p>${plan.note ? `<p class="small" style="color:var(--orange);margin-bottom:10px">${esc(plan.note)}</p>` : ''}
    <div class="group"><div class="item"><div class="grow label">Server name</div><input type="text" id="pl-name" value="${esc(plan.name)}" style="width:220px"></div>
    <div class="item"><div class="grow label">Type</div><span>${esc(TYPE_NAME[plan.type])} · Minecraft ${esc(plan.mc)}</span></div>
    <div class="item"><div class="grow label">Memory</div><span>${gb(Math.min(plan.ramMb, maxRam()))}</span></div></div>
    ${found.length ? `<div class="group-title">Add-ons to install (${found.length})</div><div class="group">${found.map((m) => `<label class="item" style="cursor:pointer"><input type="checkbox" class="pl-mod" value="${esc(m.id)}" checked style="width:18px;height:18px"><img class="thumb" style="width:36px;height:36px" src="${esc(m.icon || '')}" data-fb="hide"><div class="grow"><div class="label">${esc(m.title)} ${m.approx ? '<span class="badge gray">closest match</span>' : ''}</div><div class="desc">${esc(m.why || m.description)}</div></div></label>`).join('')}</div>` : '<p class="muted" style="margin:10px 0">No extra add-ons in this plan.</p>'}
    ${missing.length ? `<details style="margin-top:10px"><summary class="muted small">${missing.length} suggestion${missing.length > 1 ? 's' : ''} couldn't be found for this version</summary><p class="muted small" style="margin-top:6px">${missing.map((m) => esc(m.query)).join(', ')}</p></details>` : ''}
    <div class="item" style="padding:16px 0 0"><div class="grow small">I accept the <a href="#" data-act="ext" data-href="https://aka.ms/MinecraftEULA">Minecraft EULA</a></div>${sw('pl-eula', false)}</div>
    <div class="btns"><button class="btn" data-act="closesheet">Cancel</button><button class="btn primary" id="pl-go">Create server${found.length ? ' and install' : ''}</button></div>`, true);
  $('#pl-go').onclick = guard(async () => {
    if (!$('#pl-eula').checked) return toast('Please accept the Minecraft EULA first.', true);
    $('#pl-go').disabled = true; $('#pl-go').innerHTML = '<span class="spinner"></span> Creating…';
    const mods = [...document.querySelectorAll('.pl-mod:checked')].map((i) => i.value);
    try { const srv = await post('/api/ai/build', { name: $('#pl-name').value, type: plan.type, mc: plan.mc, ramMb: Math.min(plan.ramMb, maxRam()), mods, eula: true }); S.cur = srv.id; localStorage.setItem('cur', srv.id); closeSheet(); await refresh(); setTab('home'); toast('Setting up your server…'); }
    finally { const b = $('#pl-go'); if (b) { b.disabled = false; b.textContent = 'Create server'; } }
  });
}

// ---- NEW SERVER (wizard sheet) -----------------------------------------------------------------------------------------------------------------------
const CHOICES = [
  ['paper', 'Plugins', 'Best for playing with friends. Fast and easy to extend.', 'cube', 'Recommended'],
  ['vanilla', 'Classic', 'Plain Minecraft, exactly like the official game.', 'cube'],
  ['fabric', 'Light mods', 'Fast mods like performance boosters and new features.', 'puzzle'],
  ['neoforge', 'Big mods', 'Large modpacks and heavy mods (modern).', 'puzzle'],
  ['forge', 'Big mods (classic)', 'Older big modpacks that need Forge.', 'puzzle'],
  ['purpur', 'Plugins+', 'Plugins with extra options to tweak the game.', 'cube'],
];
function newServer() {
  let type = 'paper';
  sheet(`<h2>New server</h2><p class="muted" style="margin-bottom:14px">What kind of game do you want?</p>
    <div class="cards" id="types">${CHOICES.map(([k, n, d, i, b]) => `<button class="choice ${k === type ? 'on' : ''}" data-t="${k}">${b ? `<span class="badge">${b}</span>` : ''}${ic(i)}<b>${n}</b><span class="d">${d}</span></button>`).join('')}<button class="choice" data-t="__ai">${ic('spark')}<b>Describe it</b><span class="d">Tell the AI your idea and it builds the server for you.</span></button></div>
    <div class="group" style="margin-top:16px"><div class="item"><div class="grow label">Name</div><input type="text" id="ns-name" value="My server" style="width:220px"></div>
      <div class="item"><div class="grow"><div class="label">Minecraft version</div><div class="desc">The newest is picked for you.</div></div><select id="ns-ver"><option>Loading…</option></select></div>
      <div class="item"><div class="grow small">I accept the <a href="#" data-act="ext" data-href="https://aka.ms/MinecraftEULA">Minecraft EULA</a></div>${sw('ns-eula', false)}</div></div>
    <p class="muted small" style="margin-top:10px">The first setup downloads Java and the server. Big mods take longer.</p>
    <div class="btns"><button class="btn" data-act="closesheet">Cancel</button><button class="btn primary" id="ns-go">Create server</button></div>`, true);
  const load = guard(async () => { $('#ns-ver').innerHTML = '<option>Loading…</option>'; const v = await api('/api/versions?type=' + type); $('#ns-ver').innerHTML = v.map((x, i) => `<option value="${esc(x.id)}">${esc(x.id)}${i === 0 ? ' (newest)' : ''}${x.beta ? ' (beta)' : ''}</option>`).join(''); });
  $('#types').onclick = (e) => { const b = e.target.closest('.choice'); if (!b) return; if (b.dataset.t === '__ai') { closeSheet(); setTab('ai'); toast('Describe your idea under “Build a server from an idea”.'); return; } type = b.dataset.t; [...$('#types').children].forEach((x) => x.classList.toggle('on', x === b)); load(); };
  load();
  $('#ns-go').onclick = guard(async () => {
    if (!$('#ns-eula').checked) return toast('Please accept the Minecraft EULA first.', true);
    $('#ns-go').disabled = true; $('#ns-go').innerHTML = '<span class="spinner"></span> Creating…';
    try { const srv = await post('/api/servers', { name: $('#ns-name').value, type, mc: $('#ns-ver').value, ramMb: Math.min(MODDED(type) ? 4096 : 2048, maxRam()), eula: true }); S.cur = srv.id; localStorage.setItem('cur', srv.id); closeSheet(); await refresh(); setTab('home'); }
    finally { const b = $('#ns-go'); if (b) { b.disabled = false; b.textContent = 'Create server'; } }
  });
}

// ---- boot --------------------------------------------------------------------------------------------------------------------------------------------------
connect();
refresh().then(() => { try { if (!localStorage.getItem('tourDone') && typeof startTour === 'function') startTour(); } catch {} }).catch((e) => toast(e.message, true));
