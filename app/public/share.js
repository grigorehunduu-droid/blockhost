'use strict';
// "Play with friends anywhere" card on the Home screen: internet sharing through playit.gg.
// Kept in its own file; it uses app.js globals (api, post, esc, guard, cur, actions).
(() => {
  let timer = null;
  const STATE = { WaitingForUserVisit: 'Waiting for you to open the link…', WaitingForUser: 'Waiting for you to approve BlockHost on playit.gg…', UserAccepted: 'Linked. Starting…' };
  const H = '<h3>Play with friends anywhere</h3>';
  function card(s, srv) {
    if (s.claim) return H + `<p class="muted small" style="margin:4px 0 12px">1. Open the link and sign in to playit.gg (it's free). 2. Approve “BlockHost”. This page updates by itself.</p><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><button class="btn primary" data-act="ext" data-href="${esc(s.claim.url)}">Open playit.gg</button><span class="muted small">${esc(s.claim.error || STATE[s.claim.state] || '')}</span></div>`;
    if (!s.linked) return H + `<p class="muted small" style="margin:4px 0 12px">Free, through playit.gg. No router setup, and it works with any internet provider. Friends get an address to type into Minecraft.</p><button class="btn primary" data-act="sharelink">Set up internet sharing</button>`;
    if (!s.running) return H + `<p class="muted small" style="margin:4px 0 12px">Internet sharing is off.</p><button class="btn primary" data-act="sharestart">Turn on</button> <button class="btn plain" data-act="shareunlink">Unlink playit.gg</button>`;
    if (!s.tunnel) return H + (s.pending ? '<p class="muted small" style="margin:4px 0 12px"><span class="spinner" style="display:inline-block;vertical-align:-3px"></span> Getting an address…</p>' : `<p class="muted small" style="margin:4px 0 12px">Sharing is on. This server doesn't have an internet address yet.</p><button class="btn primary" data-act="sharetunnel">Get an address for ${esc(srv.name)}</button>`) + ' <button class="btn plain" data-act="sharestop">Turn off</button>';
    return H + `<div class="join" style="margin:10px 0"><div><span class="grow"><span class="muted small">Friends anywhere</span><code>${esc(s.tunnel.address)}</code></span><button class="btn sm" data-act="copy" data-v="${esc(s.tunnel.address)}">Copy</button></div></div>${s.tunnel.disabled ? '<p class="small" style="color:var(--orange)">This address is turned off on playit.gg.</p>' : ''}<p class="muted small">If that doesn't connect, try <code>${esc(s.tunnel.withPort)}</code>. The server has to be running.</p><button class="btn plain" data-act="sharestop">Turn off sharing</button>`;
  }
  const stop = () => { clearInterval(timer); timer = null; };
  async function paint() {
    const el = document.getElementById('share-card'), srv = cur();
    if (!el || !srv) return stop();
    try { const s = await api('/api/share?id=' + encodeURIComponent(srv.id)); el.innerHTML = card(s, srv) + (s.error ? `<p class="small" style="color:var(--red);margin-top:8px">${esc(s.error)}</p>` : ''); }
    catch (e) { el.innerHTML = H + `<p class="small" style="color:var(--red)">${esc(e.message)}</p>`; }
  }
  const act = (p, busy, body) => guard(async () => {
    const el = document.getElementById('share-card');
    if (el && busy) el.innerHTML = H + `<p class="muted small"><span class="spinner" style="display:inline-block;vertical-align:-3px"></span> ${busy}</p>`;
    try { await post(p, body ? body() : {}); } finally { paint(); }
  });
  Object.assign(actions, {
    sharelink: act('/api/share/link'),
    sharestart: act('/api/share/start', 'Starting… the first time this downloads the free playit helper (about 8 MB).'),
    sharestop: act('/api/share/stop'),
    shareunlink: act('/api/share/unlink'),
    sharetunnel: act('/api/share/tunnel', 'Creating the address…', () => ({ id: cur().id })),
  });
  // Insert the card on the Home screen, just above the notes area.
  new MutationObserver(() => {
    const notes = document.getElementById('h-notes');
    if (!notes || document.getElementById('share-card')) return;
    const c = document.createElement('div'); c.id = 'share-card'; c.className = 'card'; notes.before(c);
    stop(); paint(); timer = setInterval(paint, 4000);
  }).observe(document.getElementById('view'), { childList: true, subtree: true });
})();
