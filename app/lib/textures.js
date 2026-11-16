'use strict';
// Block colours + item icons from the user's own Minecraft client jar (falls back to a built-in table).
const fs = require('fs'), path = require('path');
const U = require('./util'), { Zip } = require('./zip'), png = require('./png'), im = require('./installers');

const TINT = { grass: [0x7c, 0xbd, 0x6b], foliage: [0x59, 0xae, 0x30], water: [0x3f, 0x76, 0xe4] };
const GRASS = /^(grass_block|short_grass|tall_grass|grass|fern|large_fern|sugar_cane)$/, FOLIAGE = /(_leaves|^vine)$/;
const FALLBACK = [[/water|bubble_column/, [63, 118, 228]], [/lava|magma/, [220, 90, 20]], [/grass|fern|moss/, [124, 189, 107]], [/leaves|vine/, [89, 174, 48]], [/snow|powder_snow/, [245, 250, 250]], [/ice/, [160, 200, 250]],
  [/sand$|^sand|sandstone/, [219, 207, 163]], [/red_sand/, [190, 102, 33]], [/gravel/, [131, 127, 126]], [/dirt|mud|podzol|mycelium|farmland|path/, [134, 96, 67]], [/log|wood|planks|stem|hyphae|bamboo/, [120, 94, 56]],
  [/deepslate|blackstone|basalt|obsidian|bedrock/, [60, 60, 66]], [/netherrack|nether_|crimson|warped_nylium/, [110, 45, 45]], [/end_stone/, [220, 222, 160]], [/terracotta|clay|brick/, [152, 94, 67]], [/coal|iron|gold|diamond|copper|redstone|ore/, [120, 120, 120]],
  [/stone|cobble|andesite|diorite|granite|tuff|calcite|dripstone/, [125, 125, 125]], [/glass/, [180, 220, 230]], [/wool|carpet|concrete/, [200, 200, 200]], [/cactus/, [60, 120, 50]]];

let jarCache = null, jarAt = 0;
function findJar() {
  if (Date.now() - jarAt < 30000) return jarCache;
  jarAt = Date.now();
  const dirs = [path.join(process.env.APPDATA || '', '.minecraft', 'versions'), path.join(process.env.USERPROFILE || '', 'curseforge', 'minecraft', 'Install', 'versions')];
  const found = [];
  if (U.settings.clientJar) found.push(U.settings.clientJar);
  for (const d of dirs) { try { for (const v of fs.readdirSync(d)) { try { for (const f of fs.readdirSync(path.join(d, v))) if (f.endsWith('.jar')) found.push(path.join(d, v, f)); } catch {} } } catch {} }
  try { for (const f of fs.readdirSync(path.join(U.DATA, 'cache'))) if (/^client-.*\.jar$/.test(f)) found.push(path.join(U.DATA, 'cache', f)); } catch {}
  const ok = found.filter((f) => { try { return fs.statSync(f).size > 1e6; } catch { return false; } }).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  jarCache = ok[0] || null;
  return jarCache;
}
let zip = null, zipFor = null;
function jar() { const f = findJar(); if (!f) return null; if (zipFor !== f) { zip && zip.close(); try { zip = new Zip(f); zipFor = f; } catch { zip = null; zipFor = null; return null; } } return zip; }

// Consent is the caller's job: only invoked from the "Download textures" button.
async function downloadClient(mcVersion) {
  const vj = await im.mojangVersion(mcVersion);
  const dest = path.join(U.DATA, 'cache', `client-${mcVersion}.jar`);
  await U.download(vj.downloads.client.url, dest, { sha1: vj.downloads.client.sha1 });
  jarAt = 0;
  return dest;
}

const colors = new Map();
function texture(rel) { const z = jar(); const b = z && z.read(`assets/minecraft/textures/${rel}.png`); return b ? png.decode(b) : null; }
function avg(img) {
  let r = 0, g = 0, b = 0, n = 0; const h = Math.min(img.h, img.w);
  for (let i = 0; i < img.w * h; i++) { const a = img.data[i * 4 + 3]; if (a < 40) continue; r += img.data[i * 4]; g += img.data[i * 4 + 1]; b += img.data[i * 4 + 2]; n++; }
  return n ? [r / n, g / n, b / n] : null;
}
function blockColor(name) {
  const n = name.replace(/^minecraft:/, '');
  if (colors.has(n)) return colors.get(n);
  let c = null;
  if (/^(air|cave_air|void_air)$/.test(n)) { colors.set(n, null); return null; }
  const tint = GRASS.test(n) ? TINT.grass : FOLIAGE.test(n) ? TINT.foliage : /^(water|bubble_column)$/.test(n) ? TINT.water : null;
  if (n === 'water') c = TINT.water.slice();
  else for (const s of ['', '_top', '_side', '_front', '_still', '_0', '_bottom']) { const img = texture('block/' + (n === 'grass_block' && s === '' ? 'grass_block_top' : n + s)); if (img && (c = avg(img))) break; }
  if (c && tint && n !== 'water') c = c.map((v, i) => (v * tint[i]) / 255);
  if (!c) { c = (FALLBACK.find(([re]) => re.test(n)) || [null, null])[1]; if (!c) { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; c = [90 + (h & 63), 90 + ((h >> 6) & 63), 90 + ((h >> 12) & 63)]; } }
  c = c.map(Math.round); colors.set(n, c); return c;
}
function icon(id) {
  const n = String(id).replace(/^minecraft:/, '').replace(/[^a-z0-9_]/g, ''), z = jar();
  if (!z) return null;
  for (const rel of ['item/' + n, 'block/' + n, 'block/' + n + '_side', 'block/' + n + '_top', 'block/' + n + '_front', 'block/' + n + '_0']) { const b = z.read(`assets/minecraft/textures/${rel}.png`); if (b) return b; }
  return null;
}
module.exports = { blockColor, icon, findJar, downloadClient, hasTextures: () => !!jar() };
