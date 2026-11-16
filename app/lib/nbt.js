'use strict';
const zlib = require('zlib');

// Parses (optionally gzipped) NBT. Compounds -> objects, lists -> arrays, long -> Number,
// byte/long arrays -> Buffer (raw big-endian), int arrays -> number[].
function parse(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  let p = 0;
  const str = () => { const l = buf.readUInt16BE(p); p += 2; const s = buf.toString('utf8', p, p + l); p += l; return s; };
  function val(t) {
    switch (t) {
      case 1: return buf.readInt8(p++);
      case 2: { const v = buf.readInt16BE(p); p += 2; return v; }
      case 3: { const v = buf.readInt32BE(p); p += 4; return v; }
      case 4: { const v = Number(buf.readBigInt64BE(p)); p += 8; return v; }
      case 5: { const v = buf.readFloatBE(p); p += 4; return v; }
      case 6: { const v = buf.readDoubleBE(p); p += 8; return v; }
      case 7: { const n = buf.readInt32BE(p); p += 4; const v = buf.subarray(p, p + n); p += n; return v; }
      case 8: return str();
      case 9: { const it = buf[p++]; const n = buf.readInt32BE(p); p += 4; const a = new Array(n); for (let i = 0; i < n; i++) a[i] = val(it); return a; }
      case 10: { const o = {}; for (;;) { const tt = buf[p++]; if (tt === 0) break; const k = str(); o[k] = val(tt); } return o; }
      case 11: { const n = buf.readInt32BE(p); p += 4; const a = new Array(n); for (let i = 0; i < n; i++) { a[i] = buf.readInt32BE(p); p += 4; } return a; }
      case 12: { const n = buf.readInt32BE(p); p += 4; const v = buf.subarray(p, p + n * 8); p += n * 8; return v; }
    }
    throw new Error('bad NBT tag ' + t);
  }
  if (buf[p++] !== 10) throw new Error('NBT root is not a compound');
  str();
  return val(10);
}

// Unpack `count` entries of `bits` bits from a packed long array (1.16+: entries never span longs).
function unpack(longs, bits, count) {
  const out = new Uint16Array(count);
  const per = Math.floor(64 / bits), mask = (1 << bits) - 1;
  for (let i = 0; i < count; i++) {
    const off = Math.floor(i / per) * 8;
    if (off + 8 > longs.length) break;
    const hi = longs.readUInt32BE(off), lo = longs.readUInt32BE(off + 4), sh = (i % per) * bits;
    out[i] = sh >= 32 ? (hi >>> (sh - 32)) & mask : sh + bits <= 32 ? (lo >>> sh) & mask : ((lo >>> sh) | (hi << (32 - sh))) & mask;
  }
  return out;
}
// 1.13-1.15 packing: entries run across long boundaries (bits taken LSB-first, continuing into the next long).
function unpackSpanning(longs, bits, count) {
  const n = longs.length / 8, L = new Array(n), mask = (1n << BigInt(bits)) - 1n, out = new Uint16Array(count);
  for (let k = 0; k < n; k++) L[k] = longs.readBigUInt64BE(k * 8);
  for (let i = 0; i < count; i++) {
    const bit = i * bits, li = bit >> 6, off = bit & 63;
    if (li >= n) break;
    let v = L[li] >> BigInt(off);
    if (off + bits > 64 && li + 1 < n) v |= L[li + 1] << BigInt(64 - off);
    out[i] = Number(v & mask);
  }
  return out;
}
module.exports = { parse, unpack, unpackSpanning };
