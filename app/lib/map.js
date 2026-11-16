'use strict';
// Top-down Anvil renderer: .mca -> 512x512 PNG per region, cached by mtime.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const U = require('./util'), nbt = require('./nbt'), png = require('./png'), tex = require('./textures'), props = require('./props');
const P = () => require('./proc');

// Old layout (world/DIM-1) and the newer dimensions/<ns>/<name> layout are both probed.
function regionDir(c, dim) {
  const d = P().dirOf(c), lvl = props.read(d)['level-name'] || 'world';
  const tail = { overworld: ['', 'overworld'], nether: ['DIM-1', 'the_nether'], end: ['DIM1', 'the_end'] }[dim];
  if (!tail) throw new Error('bad dimension');
  const cands = [
    ...(dim === 'overworld' ? [[lvl, 'region']] : [[lvl, tail[0], 'region'], [lvl + (dim === 'nether' ? '_nether' : '_the_end'), tail[0], 'region']]),
    [lvl, 'dimensions', 'minecraft', tail[1], 'region'],
  ];
  for (const c2 of cands) { const p = path.join(d, ...c2); if (fs.existsSync(p)) return p; }
  return null;
}
function regions(c, dim) {
  const dir = regionDir(c, dim); if (!dir) return [];
  return fs.readdirSync(dir).map((f) => { const m = f.match(/^r\.(-?\d+)\.(-?\d+)\.mca$/); return m && fs.statSync(path.join(dir, f)).size > 8192 ? { x: +m[1], z: +m[2] } : null; }).filter(Boolean);
}

function heights(longs) {
  for (const b of [9, 8, 10, 11, 12, 7]) if (Math.ceil(256 / Math.floor(64 / b)) === longs.length / 8) return nbt.unpack(longs, b, 256);
  const bits = longs.length / 32; // 1.14-1.15: 256 entries packed across longs
  if (Number.isInteger(bits) && bits >= 7 && bits <= 12) return nbt.unpackSpanning(longs, bits, 256);
  return null;
}
// legacy = 1.13-1.17 chunk (everything under "Level"); dv = DataVersion (below 2529 = packed across longs).
function renderChunk(ch, cx, cz, img, legacy, dv) {
  const secs = ch.sections || ch.Sections, hm = ch.Heightmaps || ch.heightmaps;
  if (!secs || !hm || !hm.MOTION_BLOCKING) return;
  const minY = ch.yPos !== undefined ? ch.yPos * 16 : legacy ? 0 : -64;
  const spanning = legacy && dv < 2529;
  const mot = heights(hm.MOTION_BLOCKING), ocean = hm.OCEAN_FLOOR ? heights(hm.OCEAN_FLOOR) : null;
  if (!mot) return;
  const byY = new Map();
  const blockAt = (x, y, z) => {
    const sy = y >> 4; let s = byY.get(sy);
    if (s === undefined) {
      const sec = secs.find((q) => q.Y === sy);
      let rawPal = null, data = null;
      if (sec && sec.block_states) { rawPal = sec.block_states.palette; data = sec.block_states.data; } // 1.18+
      else if (sec && sec.Palette) { rawPal = sec.Palette; data = sec.BlockStates; } // 1.13-1.17
      if (!rawPal) s = null;
      else {
        const pal = rawPal.map((p) => p.Name || p.id || p[''] || 'minecraft:air'), bits = Math.max(4, Math.ceil(Math.log2(pal.length)));
        s = { pal, idx: pal.length > 1 && data ? (spanning ? nbt.unpackSpanning(data, bits, 4096) : nbt.unpack(data, bits, 4096)) : null };
      }
      byY.set(sy, s);
    }
    if (!s) return 'minecraft:air';
    return s.pal[s.idx ? s.idx[((y & 15) << 8) | (z << 4) | x] : 0];
  };
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = z * 16 + x, h = mot[i]; if (!h) continue;
    const top = h + minY - 1, name = blockAt(x, top, z);
    let col = tex.blockColor(name); if (!col) continue;
    if (name === 'minecraft:water' && ocean) {
      const fy = ocean[i] + minY - 1, depth = Math.max(0, top - fy), fc = tex.blockColor(blockAt(x, fy, z)) || col, a = Math.min(0.9, 0.4 + depth * 0.04);
      col = col.map((v, k) => v * a + fc[k] * (1 - a));
    } else {
      const d = Math.max(-4, Math.min(4, h - mot[z > 0 ? i - 16 : i])), f = 1 + d * 0.07;
      col = col.map((v) => Math.min(255, v * f));
    }
    const o = ((cz * 16 + z) * 512 + cx * 16 + x) * 4;
    img[o] = col[0]; img[o + 1] = col[1]; img[o + 2] = col[2]; img[o + 3] = 255;
  }
}
async function renderRegion(file) {
  const buf = fs.readFileSync(file), img = Buffer.alloc(512 * 512 * 4);
  for (let i = 0; i < 1024; i++) {
    const sector = buf.readUInt32BE(i * 4) >>> 8; if (!sector) continue;
    const pos = sector * 4096, len = buf.readUInt32BE(pos), ct = buf[pos + 4], raw = buf.subarray(pos + 5, pos + 4 + len);
    try {
      const data = ct === 2 ? zlib.inflateSync(raw) : ct === 1 ? zlib.gunzipSync(raw) : ct === 3 ? raw : null;
      if (data) { const ch = nbt.parse(data); renderChunk(ch.Level || ch, i & 31, i >> 5, img, !!ch.Level, ch.DataVersion || 0); }
    } catch {}
    if (i % 32 === 31) await new Promise((r) => setImmediate(r));
  }
  return png.encode(512, 512, img);
}
const inflight = new Map();
async function tile(c, dim, x, z) {
  const dir = regionDir(c, dim); x = +x; z = +z;
  if (!dir || !Number.isInteger(x) || !Number.isInteger(z)) return null;
  const mca = path.join(dir, `r.${x}.${z}.mca`);
  if (!fs.existsSync(mca)) return null;
  const cdir = path.join(U.DATA, 'cache', 'map', c.id, dim); fs.mkdirSync(cdir, { recursive: true });
  const out = path.join(cdir, `r.${x}.${z}.png`), mt = fs.statSync(mca).mtime;
  const key = out;
  try { if (fs.statSync(out).mtimeMs === mt.getTime()) return fs.readFileSync(out); } catch {}
  if (!inflight.has(key)) inflight.set(key, renderRegion(mca).then((b) => { fs.writeFileSync(out, b); fs.utimesSync(out, mt, mt); return b; }).finally(() => inflight.delete(key)));
  return inflight.get(key);
}
module.exports = { regions, tile, regionDir };
