'use strict';
// Animated tutorial: full-screen card with a looping CSS scene per step. Opens on first run; also from "Tutorial".
const CUR = '<div class="cur"><svg viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.5L9 19 4 2z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg></div>';
const BLK = '<div class="blk"></div>';
const STEPS = [
  { t: 'Welcome to BlockHost', p: 'Run your own Minecraft server at home, with no technical skills. This quick tour shows the whole thing in about a minute.',
    s: `<div class="s0"><div class="ring"></div><img src="icon.png" alt=""><span class="sp" style="left:170px;top:70px">✦</span><span class="sp" style="left:380px;top:60px;animation-delay:.8s">✦</span><span class="sp" style="left:330px;top:190px;animation-delay:1.5s">✦</span><span class="sp" style="left:190px;top:180px;animation-delay:.4s">✦</span></div>` },
  { t: '1. Create a server', p: 'Press “New server”, pick what kind of game you want (Plugins is a great start), and press Create. BlockHost downloads everything for you.',
    s: `<div class="s1"><div class="card c1"><div class="blk"></div><b>Plugins</b><small>Best for friends</small></div><div class="card c2"><div class="blk"></div><b>Classic</b><small>Plain Minecraft</small></div><div class="card c3"><div class="blk"></div><b>Mods</b><small>Light and fast</small></div><div class="mb b go">Create server</div><div class="prog"><i></i></div><div class="ok">✓</div>${CUR}</div>` },
  { t: '2. Press Start', p: 'One big button. Wait about 20 seconds until it says Running. You can see who is online and how smooth the server is.',
    s: `<div class="s2"><div class="mock hero"><b><span class="d"></span>My server</b><div class="txt"><span class="t1">Stopped</span><span class="t2">Starting…</span><span class="t3">Running · 3 players online</span></div></div><div class="mb g btn1"><span class="a">▶ Start server</span><span class="b">■ Stop server</span></div>
      <div class="mock tile" style="left:50px"><small>Players</small><b><span class="n n0">0 / 20</span><span class="n n1">1 / 20</span><span class="n n2">2 / 20</span><span class="n n3">3 / 20</span></b></div><div class="mock tile" style="left:210px"><small>Speed</small><b style="color:var(--green)">Smooth</b></div><div class="mock tile" style="left:370px"><small>Memory</small><b>2 GB</b></div>${CUR}</div>` },
  { t: '3. Invite your friends', p: 'Same Wi‑Fi? Copy the second address on the Home screen and send it. Friends somewhere else? Forward port 25565 on your router, or use a free tunnel like playit.gg.',
    s: `<div class="s3"><div class="mock join"><small>Friends on your Wi‑Fi</small><code>192.168.1.20:25565</code></div><div class="mb t cp">Copy</div><div class="done">Copied ✓</div>
      <div class="net"><div class="nd" style="left:8px"><i>💻</i>Your PC</div><div class="line l1"></div><div class="nd" style="left:206px"><i>📡</i>Router</div><div class="line l2"></div><div class="nd" style="left:400px"><i>🎮</i>Friends</div><div class="pkt"></div><span class="tag" style="left:150px">same Wi‑Fi: just copy</span><span class="tag" style="left:300px">elsewhere: port 25565</span></div>${CUR}</div>` },
  { t: '4. Add mods and plugins', p: 'Open Add‑ons, search, and press Install. Needed helper mods come along automatically. You can also drop a .jar file in.',
    s: `<div class="s4"><div class="mock row r1">${BLK}<b>Performance boost<small>Makes the server smoother</small></b><span class="ib"><span class="mb b i1">Install</span><span class="sp"></span><span class="mb i2">✓</span></span></div><div class="mock row r2">${BLK}<b>Land protection<small>Stops griefing</small></b><span class="ib"><span class="mb b">Install</span></span></div><div class="mock row r3">${BLK}<b>Better chat<small>Colors and emojis</small></b><span class="ib"><span class="mb b">Install</span></span></div><div class="cnt">1 installed</div>${CUR}</div>` },
  { t: '5. Back up your world', p: 'Press “Back up now” any time, or let BlockHost do it automatically. Restoring is one click, so mistakes are never permanent.',
    s: `<div class="s5"><div class="mock zip z3"><span style="font-size:22px">🗜️</span><div><b>Today 18:00</b><small>12 MB</small></div></div><div class="mock zip z2"><span style="font-size:22px">🗜️</span><div><b>Today 12:00</b><small>12 MB</small></div></div><div class="mock zip z1"><span style="font-size:22px">🗜️</span><div><b>Today 06:00</b><small>11 MB</small></div></div><div class="shield">🛡️</div><div class="arr">↻</div><div class="mb b restore">Restore</div></div>` },
  { t: '6. Ask the AI', p: 'Connect a free Google Gemini key under “Ask AI”. It explains crashes, and you can even describe a modpack idea and it builds the server for you. You always approve first.',
    s: `<div class="s6"><div class="bub u">Make me a chill Fabric server for 4 friends</div><div class="bub dots"><i></i><i></i><i></i></div><div class="bub a"><em>Fabric · Minecraft 1.21</em><br>12 mods: performance, minimap,<br>backpacks, better farming…</div><div class="mb g">Create server and install</div></div>` },
];

let tourAt = 0;
function startTour(from) {
  tourAt = Number.isInteger(from) ? from : 0;
  const old = document.getElementById('tour'); if (old) old.remove();
  const el = document.createElement('div'); el.id = 'tour'; document.body.append(el);
  const close = () => { try { localStorage.setItem('tourDone', '1'); } catch {} el.remove(); document.removeEventListener('keydown', key); };
  const draw = () => {
    const st = STEPS[tourAt], last = tourAt === STEPS.length - 1;
    el.innerHTML = `<div class="tcard"><div class="tstage" key="${tourAt}">${st.s}</div><h2>${st.t}</h2><p class="t">${st.p}</p><div class="tdots">${STEPS.map((_, i) => `<i class="${i === tourAt ? 'on' : ''}"></i>`).join('')}</div>
      <div class="tbtns"><button class="btn plain" id="t-skip">${last ? '' : 'Skip'}</button><div style="display:flex;gap:8px">${tourAt ? '<button class="btn" id="t-back">Back</button>' : ''}<button class="btn primary" id="t-next">${last ? 'Get started' : 'Next'}</button></div></div></div>`;
    document.getElementById('t-next').onclick = () => { if (last) close(); else { tourAt++; draw(); } };
    const b = document.getElementById('t-back'); if (b) b.onclick = () => { tourAt--; draw(); };
    document.getElementById('t-skip').onclick = close;
  };
  const key = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' && tourAt < STEPS.length - 1) { tourAt++; draw(); } else if (e.key === 'ArrowLeft' && tourAt > 0) { tourAt--; draw(); } };
  document.addEventListener('keydown', key); draw();
}
