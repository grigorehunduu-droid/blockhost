'use strict';
// NBT, PNG and zip readers: the parsers behind the map, inventories and mod metadata.
const test = require('node:test'), assert = require('node:assert'), zlib = require('zlib');
const nbt = require('../app/lib/nbt'), png = require('../app/lib/png'), { Zip } = require('../app/lib/zip');
const fs = require('fs'), os = require('os'), path = require('path');

const int = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); return b; };
const str = (s) => { const b = Buffer.from(s); const h = Buffer.alloc(2); h.writeUInt16BE(b.length); return Buffer.concat([h, b]); };
const tag = (type, name, payload) => Buffer.concat([Buffer.from([type]), str(name), payload]);
function sampleNbt() {
  const longs = Buffer.alloc(16); longs.writeBigUInt64BE(1n, 0); longs.writeBigUInt64BE(2n, 8);
  const list = Buffer.concat([Buffer.from([8]), int(2), str('a'), str('b')]);
  const body = Buffer.concat([tag(3, 'n', int(42)), tag(8, 's', str('hi')), tag(9, 'l', list), tag(12, 'la', Buffer.concat([int(2), longs])), Buffer.from([0])]);
  return Buffer.concat([Buffer.from([10]), str(''), body]);
}

test('NBT: compounds, ints, strings, lists, long arrays', () => {
  const o = nbt.parse(sampleNbt());
  assert.equal(o.n, 42); assert.equal(o.s, 'hi'); assert.deepEqual(o.l, ['a', 'b']); assert.equal(o.la.length, 16);
});
test('NBT: gzipped input (player .dat files)', () => { assert.equal(nbt.parse(zlib.gzipSync(sampleNbt())).s, 'hi'); });
test('NBT: rejects a root that is not a compound', () => { assert.throws(() => nbt.parse(Buffer.from([8, 0, 0, 0, 0]))); });

test('unpack: 1.16+ packing (entries never cross a long)', () => {
  const bits = 5, per = Math.floor(64 / bits), vals = Array.from({ length: 30 }, (_, i) => (i * 7) % 32);
  const longs = Buffer.alloc(Math.ceil(30 / per) * 8);
  vals.forEach((v, i) => { const off = Math.floor(i / per) * 8, cur = longs.readBigUInt64BE(off); longs.writeBigUInt64BE(cur | (BigInt(v) << BigInt((i % per) * bits)), off); });
  assert.deepEqual([...nbt.unpack(longs, bits, 30)], vals);
});
test('unpackSpanning: 1.13-1.15 packing (entries cross longs)', () => {
  const bits = 5, vals = Array.from({ length: 40 }, (_, i) => (i * 11) % 32);
  let big = 0n; vals.forEach((v, i) => { big |= BigInt(v) << BigInt(i * bits); });
  const n = Math.ceil((40 * bits) / 64), buf = Buffer.alloc(n * 8);
  for (let k = 0; k < n; k++) buf.writeBigUInt64BE((big >> BigInt(k * 64)) & ((1n << 64n) - 1n), k * 8);
  assert.deepEqual([...nbt.unpackSpanning(buf, bits, 40)], vals);
});

test('PNG: encode then decode gives the same pixels', () => {
  const px = Buffer.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
  const d = png.decode(png.encode(3, 2, px));
  assert.equal(d.w, 3); assert.equal(d.h, 2); assert.deepEqual([...d.data], [...px]);
});
test('PNG: garbage decodes to null instead of throwing', () => { assert.equal(png.decode(Buffer.from('not a png')), null); });

function makeZip(entries) { // [{name, data, deflate}]
  const locals = [], central = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), body = e.deflate ? zlib.deflateRawSync(e.data) : e.data, crc = png.crc32(e.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, name, body); central.push(ch, name); off += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
test('zip: reads stored and deflated entries (mod .jar metadata)', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bh-zip-')), 'm.jar');
  fs.writeFileSync(f, makeZip([{ name: 'fabric.mod.json', data: Buffer.from('{"id":"x"}') }, { name: 'plugin.yml', data: Buffer.from('name: Demo\n'.repeat(20)), deflate: true }]));
  const z = new Zip(f);
  try { assert.equal(z.read('fabric.mod.json').toString(), '{"id":"x"}'); assert.equal(z.read('plugin.yml').toString(), 'name: Demo\n'.repeat(20)); assert.equal(z.read('missing'), null); } finally { z.close(); }
});
test('zip: a file that is not a zip is refused', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bh-zip-')), 'x.jar'); fs.writeFileSync(f, 'hello');
  assert.throws(() => new Zip(f));
});
