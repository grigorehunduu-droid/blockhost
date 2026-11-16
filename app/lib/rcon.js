'use strict';
const net = require('net');

// Source RCON. After each command a type-0 sentinel packet is sent; the server answers it with the
// sentinel's id, which tells us the (possibly multi-packet) reply to the command is complete.
class Rcon {
  constructor(port, password, host = '127.0.0.1') { Object.assign(this, { port, password, host, n: 10, buf: Buffer.alloc(0), q: Promise.resolve(), h: null, closed: false }); }
  connect() {
    return new Promise((resolve, reject) => {
      const s = this.s = net.connect(this.port, this.host);
      const timer = setTimeout(() => s.destroy(new Error('rcon connect timeout')), 5000);
      s.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this._parse(); });
      s.on('error', (e) => { clearTimeout(timer); this.closed = true; reject(e); });
      s.on('close', () => { this.closed = true; if (this.onClose) this.onClose(); }); // a dropped socket fails the waiting command now, not at its timeout
      s.once('connect', () => {
        this.h = (id, type) => {
          if (type !== 2) return;
          clearTimeout(timer); this.h = null;
          if (id === -1) { this.close(); reject(new Error('rcon auth failed')); } else resolve(this); // close on refusal so the socket is not leaked
        };
        this._w(1, 3, this.password);
      });
    });
  }
  _w(id, type, body) {
    const b = Buffer.from(body, 'utf8'), out = Buffer.alloc(14 + b.length);
    out.writeInt32LE(10 + b.length, 0); out.writeInt32LE(id, 4); out.writeInt32LE(type, 8); b.copy(out, 12);
    this.s.write(out);
  }
  _parse() {
    while (this.buf.length >= 4) {
      const len = this.buf.readInt32LE(0);
      if (this.buf.length < 4 + len) return;
      const id = this.buf.readInt32LE(4), type = this.buf.readInt32LE(8), body = this.buf.toString('utf8', 12, 4 + len - 2);
      this.buf = this.buf.subarray(4 + len);
      if (this.h) this.h(id, type, body);
    }
  }
  cmd(c, timeoutMs = 8000) { // slow commands (a far /locate) need a longer wait
    const run = () => new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error('rcon closed'));
      const id = ++this.n, sid = ++this.n; let out = '';
      const done = () => { clearTimeout(t); this.h = null; this.onClose = null; };
      const t = setTimeout(() => { done(); reject(new Error('rcon timeout')); }, timeoutMs);
      this.onClose = () => { done(); reject(new Error('rcon closed')); };
      this.h = (pid, type, body) => {
        if (pid === id) out += body;
        else if (pid === sid) { done(); resolve(out); }
      };
      this._w(id, 2, c); this._w(sid, 0, '');
    });
    const p = this.q.then(run, run);
    this.q = p.catch(() => {});
    return p;
  }
  close() { this.closed = true; try { this.s.destroy(); } catch {} }
}
module.exports = { Rcon };
