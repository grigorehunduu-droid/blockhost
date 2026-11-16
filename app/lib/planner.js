'use strict';
// "Describe your server" -> AI proposes a plan -> every mod name is verified against Modrinth for the
// chosen type/version -> the user reviews and confirms. The AI never installs anything by itself.
const inst = require('./installers'), mods = require('./mods');
const TYPES = ['vanilla', 'paper', 'purpur', 'fabric', 'forge', 'neoforge'];
const MODDED = (t) => ['fabric', 'forge', 'neoforge'].includes(t);
const clamp = (n, lo, hi, d) => (Number.isFinite(+n) ? Math.max(lo, Math.min(hi, Math.round(+n))) : d);

const SYSTEM = `You design Minecraft Java server setups for a non-technical host. Reply with ONLY one JSON object, no prose, no code fences:
{"name":"short server name","type":"fabric|forge|neoforge|paper|purpur|vanilla","mc":"minecraft version e.g. 1.21.11","ramMb":4096,"summary":"2 friendly sentences about what they will get","mods":[{"query":"exact Modrinth project name","why":"short reason"}]}
Rules: choose the type that fits the idea (plugins for friend/survival/minigame servers -> paper or purpur; mods for gameplay overhauls -> fabric, or forge/neoforge only if the idea needs a mod that is only there). Pick a Minecraft version with broad mod support. At most 20 entries in "mods". Use real, popular Modrinth mod/plugin names; do NOT list library/API mods (Fabric API, Architectury, etc. are installed automatically as dependencies). Skip client-only mods (shaders, minimaps) because this is a server. ramMb between 2048 and 8192, more for bigger packs. If the idea is plain vanilla use type "vanilla" and an empty mods list.`;

async function pool(items, n, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } })); return out; }
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

async function resolve(queries, type, mc) {
  return pool(queries, 4, async (q) => {
    try {
      const r = await mods.search({ type, mc }, q.query, 0);
      const n = norm(q.query);
      const exact = r.hits.find((h) => norm(h.title) === n || norm(h.slug) === n);
      // Exact names only: a fuzzy guess could install an unrelated mod the AI never meant.
      return exact ? { ...q, found: true, approx: false, id: exact.id, title: exact.title, icon: exact.icon, description: exact.description } : { ...q, found: false };
    } catch { return { ...q, found: false }; }
  });
}

async function design(idea, chat) {
  const r = await chat(SYSTEM, [{ role: 'user', content: String(idea).slice(0, 1500) }]);
  const m = String(r.text).match(/\{[\s\S]*\}/);
  let p; try { p = JSON.parse(m && m[0]); } catch { throw new Error('The AI did not return a usable plan. Try describing it a little differently.'); }
  const type = TYPES.includes(p.type) ? p.type : 'paper';
  const ids = (await inst.versions(type)).map((v) => v.id);
  let mc = ids.includes(p.mc) ? p.mc : ids[0];
  let queries = type === 'vanilla' ? [] : (Array.isArray(p.mods) ? p.mods : []).slice(0, 20).map((x) => ({ query: String(x.query || x.name || '').slice(0, 60), why: String(x.why || '').slice(0, 160) })).filter((x) => x.query);
  let resolved = await resolve(queries, type, mc), note = '';
  // New Minecraft versions often lack mods: if too few were found, try a few older lines and keep the best.
  if (queries.length && resolved.filter((x) => x.found).length < queries.length * 0.6) {
    const line = (v) => v.split('.').slice(0, 2).join('.'), seen = new Set([line(mc)]), cands = [];
    for (const v of ids.slice(ids.indexOf(mc) + 1)) if (!seen.has(line(v))) { seen.add(line(v)); cands.push(v); if (cands.length === 3) break; }
    let best = { mc, resolved, n: resolved.filter((x) => x.found).length };
    for (const v of cands) { const rr = await resolve(queries, type, v), n = rr.filter((x) => x.found).length; if (n > best.n) best = { mc: v, resolved: rr, n }; }
    if (best.mc !== mc) note = `Minecraft ${mc} is too new for many of these mods, so ${best.mc} was chosen instead.`;
    ({ mc, resolved } = best);
  }
  return { name: String(p.name || 'My modpack').slice(0, 40), type, mc, ramMb: clamp(p.ramMb, 2048, 8192, MODDED(type) ? 4096 : 2048), summary: String(p.summary || '').slice(0, 400), note, mods: resolved };
}

// Validates what the browser sends back before anything is created.
async function validateBuild(b, maxRam) {
  if (!b || b.eula !== true) throw Object.assign(new Error('Please accept the Minecraft EULA first.'), { status: 400 });
  if (!TYPES.includes(b.type)) throw Object.assign(new Error('Unknown server type'), { status: 400 });
  const ids = (await inst.versions(b.type)).map((v) => v.id);
  if (!ids.includes(b.mc)) throw Object.assign(new Error('That Minecraft version is not available for ' + b.type), { status: 400 });
  const projects = (Array.isArray(b.mods) ? b.mods : []).filter((x) => /^[A-Za-z0-9]{8}$/.test(String(x))).slice(0, 30);
  return { name: String(b.name || 'My server').slice(0, 40), type: b.type, mc: b.mc, ramMb: clamp(b.ramMb, 1024, maxRam, 2048), projects };
}
module.exports = { design, validateBuild };
