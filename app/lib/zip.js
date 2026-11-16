'use strict';
// Minimal zip reader: EOCD -> central directory -> inflateRaw. No zip64.
const fs = require('fs'), zlib = require('zlib');

class Zip {
  constructor(file) {
    this.fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(this.fd).size;
      const n = Math.min(size, 66000);
      const b = Buffer.alloc(n);
      fs.readSync(this.fd, b, 0, n, size - n);
      let i = n - 22;
      for (; i >= 0; i--) if (b.readUInt32LE(i) === 0x06054b50) break;
      if (i < 0) throw new Error('not a zip: ' + file);
      const cnt = b.readUInt16LE(i + 10), csz = b.readUInt32LE(i + 12), cof = b.readUInt32LE(i + 16);
      const cd = Buffer.alloc(csz);
      fs.readSync(this.fd, cd, 0, csz, cof);
      this.entries = new Map();
      let p = 0;
      for (let k = 0; k < cnt && cd.readUInt32LE(p) === 0x02014b50; k++) {
        const nl = cd.readUInt16LE(p + 28), el = cd.readUInt16LE(p + 30), cl = cd.readUInt16LE(p + 32);
        this.entries.set(cd.toString('utf8', p + 46, p + 46 + nl), { method: cd.readUInt16LE(p + 10), csize: cd.readUInt32LE(p + 20), off: cd.readUInt32LE(p + 42) });
        p += 46 + nl + el + cl;
      }
    } catch (e) { fs.closeSync(this.fd); throw e; }
  }
  has(name) { return this.entries.has(name); }
  read(name) {
    const e = this.entries.get(name);
    if (!e) return null;
    const h = Buffer.alloc(30);
    fs.readSync(this.fd, h, 0, 30, e.off);
    const d = Buffer.alloc(e.csize);
    fs.readSync(this.fd, d, 0, e.csize, e.off + 30 + h.readUInt16LE(26) + h.readUInt16LE(28));
    return e.method === 0 ? d : zlib.inflateRawSync(d);
  }
  close() { try { fs.closeSync(this.fd); } catch {} }
}
module.exports = { Zip };
