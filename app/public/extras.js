'use strict';
// Extra screens: problems + voice chat on Home, and the World (new world, seed test, pre-generate),
// Events (timed commands + phone alerts) and Ranks (LuckPerms) tabs. Server side: app/lib/extras.js.
Object.assign(P, {
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z"/>',
  bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4l2-2zM10 20a2 2 0 004 0"/>',
  warn: '<path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
});
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const card = (h) => `<div class="card">${h}</div>`;

// ---- Home: problems found in the log, and voice chat ----------------------------------------------------------------------------
const homeBase = V.home;
V.home = async (el, s, rid) => {
  await homeBase(el, s, rid);
  if (rid !== renderId || !$('#h-notes')) return;
  const box = document.createElement('div'), voice = document.createElement('div');
  $('#h-notes').after(box, voice);
  const load = guard(async () => {
    const list = await api(sp('/problems')); if (rid !== renderId) return;
    box.innerHTML = list.length ? card(`<h3 style="display:flex;align-items:center;gap:8px"><span style="width:20px;height:20px;display:inline-flex;color:var(--orange)">${ic('warn')}</span>${list.length} thing${list.length > 1 ? 's' : ''} to look at</h3>
      ${list.map((p) => `<div class="item" style="padding:10px 0;align-items:flex-start"><span class="dot ${p.level === 'bad' ? 'crashed' : 'starting'}" style="margin-top:7px;animation:none"></span><div class="grow"><div class="label">${esc(p.title)}${p.count > 1 ? ` <span class="badge gray">×${p.count}</span>` : ''}</div><div class="desc">${esc(p.fix)}</div></div></div>`).join('')}
      <div class="btns" style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn sm" data-act="askproblems">Ask AI to explain</button></div>`) : '';
  });
  const loadVoice = guard(async () => {
    const v = await api(sp('/voice')); if (rid !== renderId || !v.installed) { voice.innerHTML = ''; return; }
    const viaPlayit = /ply\.gg|playit/i.test(v.host);
    voice.innerHTML = card(`<h3 style="display:flex;align-items:center;gap:8px"><span style="width:20px;height:20px;display:inline-flex;color:var(--accent)">${ic('mic')}</span>Voice chat for friends anywhere</h3>
      <p class="muted small" style="margin:6px 0 12px">${viaPlayit ? `Set up: friends' voice goes through <code>${esc(v.host)}</code>.` : v.linked ? 'Simple Voice Chat is installed. One click makes its own internet tunnel so friends outside your Wi‑Fi can talk too.' : 'Simple Voice Chat is installed. Set up internet sharing above first, then come back here.'}</p>
      ${v.linked ? `<button class="btn ${viaPlayit ? '' : 'primary'}" data-act="voicesetup">${viaPlayit ? 'Set it up again' : 'Set up voice chat'}</button>` : ''}`);
  });
  load(); loadVoice();
  const prevLog = view.on.log, prevStatus = view.on.status; let t;
  view.on.log = (e) => { if (prevLog) prevLog(e); if (/ERROR|Can't keep up|OutOfMemory|BIND|behind|Could not load/.test(e.line)) { clearTimeout(t); t = setTimeout(load, 1500); } };
  view.on.status = (e) => { if (prevStatus) prevStatus(e); load(); };
  Object.assign(view.actions, {
    askproblems: () => { S.pendingAsk = 'Look at the recent log. Explain each problem in plain words and how to fix it.'; setTab('ai'); },
    voicesetup: guard(async (b) => { b.disabled = true; b.innerHTML = '<span class="spinner"></span> Setting up…'; try { const r = await post(sp('/voice')); toast('Voice chat uses ' + r.host + '. Restart the server to apply.'); } finally { loadVoice(); } }),
  });
};

// ---- World: seed test, new world, pre-generate ------------------------------------------------------------------------------
V.world = async (el, s, rid) => {
  head('World');
  const w = await api(sp('/world')); if (rid !== renderId) return;
  const canTest = ['vanilla', 'paper', 'purpur'].includes(s.type);
  el.innerHTML = `<div class="wrap">
    ${card(`<h3>This world</h3><p class="muted small">Folder <code>${esc(w.level)}</code> · Seed ${w.seed ? `<code>${esc(w.seed)}</code>` : 'random'}</p>`)}
    ${card(`<h3>Try a seed</h3><p class="muted small" style="margin:4px 0 12px">${canTest ? 'BlockHost makes a hidden test world with this seed and tells you what is near spawn. Takes about a minute; your real world is not touched.' : 'Seed testing works for Classic and Plugins servers.'}</p>
      <div class="bar-input" style="margin:0"><input type="text" id="w-seed" placeholder="Seed, for example 105849523" maxlength="64" value="${esc(S.lastSeed || '')}"><button class="btn primary" id="w-test" ${canTest ? '' : 'disabled'}>Test seed</button></div><div id="w-res"></div>`)}
    ${card(`<h3>Make a new world</h3><p class="muted small" style="margin:4px 0 12px">Uses the seed above (or a random one if empty). Your old world is <b>kept</b> in a folder next to it, so you can go back. Homes, warps and land claims from plugins still point at the old places.</p><button class="btn danger" id="w-new">Make a new world…</button>`)}
    <div id="w-gen"></div></div>`;
  const results = (r) => `<div class="group" style="margin-top:14px">${r.results.map((x) => `<div class="item"><div class="grow"><div class="label">${esc(x.name)}</div></div><span class="${x.found && x.dist < 500 ? 'badge green' : 'muted small'}">${x.found ? `${x.dist} blocks from spawn` : 'not nearby'}</span></div>`).join('')}</div>`;
  $('#w-test').onclick = guard(async () => {
    const seed = $('#w-seed').value.trim(); if (!seed) return toast('Type a seed first.', true);
    S.lastSeed = seed; const b = $('#w-test'); b.disabled = true; b.innerHTML = '<span class="spinner"></span> Testing…'; $('#w-res').innerHTML = '<p class="muted small" style="margin-top:12px">Making a test world… about a minute.</p>';
    try { const r = await post(sp('/seedtest'), { seed }); if (rid === renderId) $('#w-res').innerHTML = results(r); } catch (e) { $('#w-res').innerHTML = ''; throw e; } finally { b.disabled = false; b.textContent = 'Test seed'; }
  });
  $('#w-new').onclick = guard(async () => {
    if (isOn(cur())) return toast('Stop the server first.', true);
    const seed = $('#w-seed').value.trim();
    if (!await confirmSheet('Make a new world?', `The next start makes a brand new world${seed ? ` from seed <code>${esc(seed)}</code>` : ' with a random seed'}. Your current world is moved aside, not deleted. Players start fresh in the new world.`, 'Make new world', true)) return;
    const r = await post(sp('/newworld'), { seed }); toast(r.moved.length ? 'Old world kept as ' + r.moved[0] : 'Ready. Start the server to make the world.'); render();
  });
  // pre-generate: Chunky makes the land ahead of time so exploring does not lag
  const gen = $('#w-gen'), RE = /\[Chunky\] Task (running|finished|paused|stopped|cancelled)[^]*?(?:Processed: ([\d,]+) chunks \(([\d.]+)%\)(?:, ETA: ([\d:]+))?)?/i;
  let state = { phase: '', pct: 0, eta: '' }, size = 1500;
  const draw = () => {
    if (!w.chunky) { gen.innerHTML = card(`<h3>Pre-generate land</h3><p class="muted small" style="margin:4px 0 12px">Makes the land around spawn ahead of time, so exploring does not lag. Needs the free Chunky ${w.plugins ? 'plugin' : 'mod'}.</p><button class="btn" id="g-inst">Install Chunky</button>`); $('#g-inst').onclick = guard(async () => { $('#g-inst').disabled = true; await post(sp('/mods/install'), { project: 'chunky' }); toast('Chunky added. Restart the server to use it.'); }); return; }
    const running = state.phase === 'running';
    gen.innerHTML = card(`<h3>Pre-generate land</h3><p class="muted small" style="margin:4px 0 12px">Makes the land around spawn ahead of time, so exploring does not lag. The server keeps running while it works.</p>
      ${state.phase ? `<div class="bar" style="height:10px;border-radius:5px"><i style="width:${state.pct}%"></i></div><p class="muted small" style="margin:6px 0 12px">${running ? `${state.pct.toFixed(1)}%${state.eta ? ' · about ' + esc(state.eta) + ' left' : ''}` : state.phase === 'finished' ? 'Done.' : 'Paused.'}</p>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><div class="seg" id="g-size">${[500, 1000, 1500, 3000].map((r) => `<button data-r="${r}" class="${r === size ? 'on' : ''}">${r * 2} blocks</button>`).join('')}</div>
      ${running ? '<button class="btn" data-g="pause">Pause</button><button class="btn danger" data-g="cancel">Stop</button>' : state.phase === 'paused' || state.phase === 'stopped' ? '<button class="btn primary" data-g="continue">Continue</button>' : '<button class="btn primary" data-g="start">Start</button>'}</div>`);
    $('#g-size').onclick = (e) => { const b = e.target.closest('button'); if (b) { size = +b.dataset.r; draw(); } };
    gen.querySelectorAll('[data-g]').forEach((b) => { b.onclick = guard(async () => { await post(sp('/pregen'), { action: b.dataset.g, radius: size }); toast(b.dataset.g === 'start' ? 'Pre-generating… you can keep playing.' : 'OK'); }); });
  };
  const read = (line) => { const m = RE.exec(U_strip(line)); if (!m) return false; state = { phase: { running: 'running', finished: 'finished', paused: 'paused', stopped: 'paused', cancelled: '' }[m[1].toLowerCase()], pct: m[3] ? +m[3] : state.pct, eta: m[4] || '' }; if (state.phase === 'finished') state.pct = 100; return true; };
  (await api(sp('/log'))).lines.forEach(read); if (rid !== renderId) return;
  draw();
  view.on.log = (e) => { if (read(e.line)) draw(); };
};
const U_strip = (s) => String(s).replace(/\x1b\[[0-9;]*m|§./g, '');

// ---- Events: timed commands, and phone alerts ------------------------------------------------------------------------------
const PRESETS = {
  'Drop party': { announce: 'Drop party! Everyone gets a gift.', cmds: 'give @a diamond 3\ngive @a golden_apple 2' },
  'Snowball fight': { announce: 'Snowball fight starts now!', cmds: 'give @a snowball 64\neffect give @a speed 120 1' },
  'Movie night': { announce: 'Night falls on the server…', cmds: 'time set night\nweather clear' },
  'Save reminder': { announce: 'Reminder: the server restarts soon, find a safe spot.', cmds: '' },
};
V.events = async (el, s, rid) => {
  head('Events');
  let list = await api(sp('/events')); const alerts = await api('/api/alerts'); if (rid !== renderId) return;
  const days = (d) => (!d.length || d.length === 7 ? 'Every day' : d.map((x) => DAYS[x]).join(', '));
  const save = async (next) => { list = await post(sp('/events'), { events: next }); draw(); };
  const draw = () => {
    el.innerHTML = `<div class="wrap"><p class="muted small" style="margin-bottom:12px">Events run commands at a time you pick, while the server is running. Good for parties, contests and reminders.</p>
      <div class="group">${list.map((e) => `<div class="item"><div class="grow"><div class="label">${esc(e.name)} <span class="badge">${esc(e.time)}</span></div><div class="desc">${days(e.days)}${e.announce ? ' · “' + esc(e.announce) + '”' : ''}</div></div>
        <button class="btn sm" data-act="evrun" data-id="${e.id}">Run now</button><button class="btn sm" data-act="evedit" data-id="${e.id}">Edit</button>${sw('ev-' + e.id, e.on, `data-ev="${e.id}"`)}</div>`).join('') || '<div class="empty">No events yet.</div>'}</div>
      <div style="margin:12px 0 26px"><button class="btn primary" data-act="evedit">${ic('plus')} New event</button></div>
      <div class="group-title">Phone alerts</div><div id="al"></div></div>`;
    el.querySelectorAll('[data-ev]').forEach((i) => { i.onchange = guard(() => save(list.map((e) => (e.id === i.dataset.ev ? { ...e, on: i.checked } : e)))); });
    drawAlerts();
  };
  const drawAlerts = () => {
    const a = alerts, KINDS = [['crash', 'The server crashes'], ['backup', 'A backup fails'], ['join', 'A player joins'], ['start', 'The server starts'], ['stop', 'The server stops']];
    $('#al').innerHTML = !a.topic ? card(`<p class="muted small" style="margin-bottom:12px">Get a message on your phone when something happens, through the free ntfy app. No account needed.</p><button class="btn primary" data-act="alon">${ic('bell')} Turn on phone alerts</button>`)
      : `<div class="group"><div class="item"><div class="grow small"><b>On your phone:</b> 1. Install the free <a href="#" data-act="ext" data-href="https://ntfy.sh/app">ntfy app</a>. 2. Tap + and subscribe to <code style="user-select:all">${esc(a.topic)}</code>. Keep that name secret: anyone who knows it can read the alerts.</div><button class="btn sm" data-act="copy" data-v="${esc(a.topic)}">${ic('copy')} Copy</button></div>
        ${KINDS.map(([k, n]) => `<div class="item"><div class="grow"><div class="label">${n}</div></div>${sw('al-' + k, a.on[k], `data-al="${k}"`)}</div>`).join('')}</div>
        <div style="display:flex;gap:10px;margin-top:10px"><button class="btn" data-act="altest">Send a test</button><button class="btn danger" data-act="aloff">Turn off</button></div>`;
    el.querySelectorAll('[data-al]').forEach((i) => { i.onchange = guard(async () => { Object.assign(alerts, await post('/api/alerts', { on: { [i.dataset.al]: i.checked } })); }); });
  };
  const editor = (e) => {
    e = e || { name: '', time: '20:00', days: [], announce: '', cmds: '', on: true };
    const box = sheet(`<h2>${e.id ? 'Edit event' : 'New event'}</h2>
      ${e.id ? '' : `<div class="chips">${Object.keys(PRESETS).map((p) => `<button class="chip" data-pre="${esc(p)}">${esc(p)}</button>`).join('')}</div>`}
      <div class="group" style="margin-top:10px"><div class="item"><div class="grow label">Name</div><input type="text" id="e-name" maxlength="40" value="${esc(e.name)}" style="width:220px"></div>
      <div class="item"><div class="grow label">Time</div><input type="time" id="e-time" value="${esc(e.time)}"></div>
      <div class="item"><div class="grow"><div class="label">Days</div><div class="desc">None picked = every day</div></div><div class="seg" id="e-days">${DAYS.map((d, i) => `<button data-d="${i}" class="${e.days.includes(i) ? 'on' : ''}">${d}</button>`).join('')}</div></div>
      <div class="item"><div class="grow label">Message to players</div><input type="text" id="e-ann" maxlength="200" value="${esc(e.announce)}" style="width:260px" placeholder="Optional"></div></div>
      <p class="muted small" style="margin:12px 2px 6px">Commands, one per line (no slash needed):</p><textarea id="e-cmds" class="mono" rows="5" spellcheck="false">${esc(e.cmds)}</textarea>
      <div class="btns">${e.id ? '<button class="btn danger" id="e-del">Delete</button><span style="flex:1"></span>' : ''}<button class="btn" data-act="closesheet">Cancel</button><button class="btn primary" id="e-ok">Save</button></div>`, true);
    box.querySelectorAll('[data-pre]').forEach((b) => { b.onclick = () => { const p = PRESETS[b.dataset.pre]; $('#e-name').value = b.dataset.pre; $('#e-ann').value = p.announce; $('#e-cmds').value = p.cmds; }; });
    $('#e-days').onclick = (ev) => { const b = ev.target.closest('button'); if (b) b.classList.toggle('on'); };
    $('#e-ok').onclick = guard(async () => {
      const next = { ...e, name: $('#e-name').value.trim() || 'Event', time: $('#e-time').value, announce: $('#e-ann').value, cmds: $('#e-cmds').value, days: [...$('#e-days').querySelectorAll('.on')].map((b) => +b.dataset.d) };
      await save(e.id ? list.map((x) => (x.id === e.id ? next : x)) : [...list, next]); closeSheet(); toast('Saved');
    });
    if (e.id) $('#e-del').onclick = guard(async () => { await save(list.filter((x) => x.id !== e.id)); closeSheet(); toast('Deleted'); });
  };
  view.actions = {
    evedit: (b) => editor(list.find((e) => e.id === b.dataset.id)),
    evrun: guard(async (b) => { await post(sp('/events/run'), { id: b.dataset.id }); toast('Event started'); }),
    alon: guard(async () => { Object.assign(alerts, await post('/api/alerts', { newTopic: true })); drawAlerts(); }),
    aloff: guard(async () => { if (await confirmSheet('Turn off phone alerts?', 'Your phone stops getting messages. Turning it on again makes a new secret name.', 'Turn off', true)) { Object.assign(alerts, await post('/api/alerts', { off: true })); drawAlerts(); } }),
    altest: guard(async () => { await post('/api/alerts/test'); toast('Test sent. Check your phone.'); }),
  };
  draw();
};

// ---- Ranks (LuckPerms) -----------------------------------------------------------------------------------------------------------
V.ranks = async (el, s, rid) => {
  head('Ranks');
  let groups;
  try { groups = await api(sp('/ranks')); } catch (e) { if (rid === renderId) el.innerHTML = `<div class="wrap">${card(`<p class="muted">${esc(e.message)}</p>`)}</div>`; return; }
  if (rid !== renderId) return;
  const act = guard(async (body, msg) => { const r = await post(sp('/ranks'), body); toast(r.reply || msg, /could not|not found|invalid|already/i.test(r.reply || '')); V.ranks(el, s, rid); });
  el.innerHTML = `<div class="wrap"><p class="muted small" style="margin-bottom:12px">Ranks decide what players may do. Every player is in <b>default</b> unless you put them in another rank. Changes apply right away.</p>
    ${card(`<h3>Put a player in a rank</h3><div class="bar-input"><input type="text" id="r-pl" placeholder="Player name" maxlength="16"><select id="r-gr">${groups.map((g) => `<option>${esc(g.name)}</option>`).join('')}</select><button class="btn primary" id="r-go">Put in rank</button></div>`)}
    ${groups.map((g) => `<div class="group-title" style="display:flex;align-items:center;gap:8px"><span style="flex:1">${esc(g.name)}</span>${g.name === 'default' ? '' : `<button class="btn plain sm" data-act="rdel" data-g="${esc(g.name)}">Delete rank</button>`}</div>
      <div class="group">${g.perms.map((p) => `<div class="item"><div class="grow"><code>${esc(p.perm)}</code></div>${sw('', p.value, `data-g="${esc(g.name)}" data-p="${esc(p.perm)}" aria-label="Allow ${esc(p.perm)}"`)}<button class="btn plain sm" data-act="runset" data-g="${esc(g.name)}" data-p="${esc(p.perm)}">Remove</button></div>`).join('') || '<div class="empty">No permissions yet.</div>'}
      <div class="item"><input type="text" placeholder="Add a permission, e.g. essentials.home" data-add="${esc(g.name)}" style="flex:1"><button class="btn sm" data-act="radd" data-g="${esc(g.name)}">Add</button></div></div>`).join('')}
    <div style="margin-top:22px" class="bar-input"><input type="text" id="r-new" placeholder="New rank name, e.g. vip" maxlength="36"><button class="btn" id="r-mk">${ic('plus')} New rank</button></div></div>`;
  $('#r-go').onclick = () => act({ action: 'player', player: $('#r-pl').value.trim(), group: $('#r-gr').value }, 'Player moved');
  $('#r-mk').onclick = () => act({ action: 'create', group: $('#r-new').value.trim() }, 'Rank created');
  el.querySelectorAll('input[data-p]').forEach((i) => { i.onchange = () => act({ action: 'set', group: i.dataset.g, perm: i.dataset.p, value: i.checked }, i.checked ? 'Allowed' : 'Blocked'); });
  view.actions = {
    radd: (b) => act({ action: 'set', group: b.dataset.g, perm: el.querySelector(`[data-add="${CSS.escape(b.dataset.g)}"]`).value.trim(), value: true }, 'Permission added'),
    runset: (b) => act({ action: 'unset', group: b.dataset.g, perm: b.dataset.p }, 'Removed'),
    rdel: guard(async (b) => { if (await confirmSheet('Delete rank ' + esc(b.dataset.g) + '?', 'Players in it go back to default.', 'Delete', true)) act({ action: 'delete', group: b.dataset.g }, 'Rank deleted'); }),
  };
};
