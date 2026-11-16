'use strict';
// Draws the BlockHost icon (an original stacked-server mark on a blue tile) and writes icon.png,
// favicon.ico and build/app.ico. Deliberately not a Minecraft-style block, to stay clear of Mojang's brand.
const fs = require('fs'), path = require('path');
const png = require('../app/lib/png');

const G = 32; // pixel-art grid
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const BARS = [7, 14, 21]; // top row of each server slab

function cell(x, y) { // colour of one grid cell -> [r,g,b,a]
  const r = 6, ax = Math.min(x, G - 1 - x), ay = Math.min(y, G - 1 - y);
  if (ax < r && ay < r && Math.hypot(r - 0.5 - ax, r - 0.5 - ay) > r) return [0, 0, 0, 0]; // rounded tile corners
  const bg = [...mix([45, 104, 235], [27, 52, 140], y / (G - 1)), 255];
  for (const y0 of BARS) {
    if (y < y0 || y > y0 + 4 || x < 6 || x > 25) continue;
    if ((x === 6 || x === 25) && (y === y0 || y === y0 + 4)) return bg; // rounded slab ends
    if (y === y0 + 4) return [168, 184, 214, 255]; // slab shadow edge
    if (x >= 8 && x <= 9 && y >= y0 + 1 && y <= y0 + 2) return y0 === 7 ? [52, 214, 110, 255] : [255, 196, 64, 255]; // status lights
    if (y === y0 + 2 && x >= 14 && x <= 23 && x % 2 === 0) return [140, 156, 186, 255]; // vents
    return [238, 243, 252, 255];
  }
  return bg;
}
const grid = Array.from({ length: G }, (_, y) => Array.from({ length: G }, (_, x) => cell(x, y)));
function render(n) {
  const b = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = grid[Math.min(G - 1, Math.floor((y * G) / n))][Math.min(G - 1, Math.floor((x * G) / n))]; b.set(c, (y * n + x) * 4); }
  return png.encode(n, n, b);
}
function ico(sizes) {
  const frames = sizes.map(render), head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => { const o = 6 + i * 16; head[o] = s === 256 ? 0 : s; head[o + 1] = s === 256 ? 0 : s; head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6); head.writeUInt32LE(frames[i].length, o + 8); head.writeUInt32LE(off, o + 12); off += frames[i].length; });
  return Buffer.concat([head, ...frames]);
}
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'app/public/icon.png'), render(256));
fs.writeFileSync(path.join(root, 'app/public/favicon.ico'), ico([16, 32, 48]));
fs.writeFileSync(path.join(root, 'build/app.ico'), ico([16, 32, 48, 256]));
console.log('icons written');
