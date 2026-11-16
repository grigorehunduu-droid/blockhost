'use strict';
// server.properties helpers that keep comments and ordering.
const fs = require('fs'), path = require('path');
const file = (dir) => path.join(dir, 'server.properties');
function read(dir) {
  const o = {};
  try { for (const l of fs.readFileSync(file(dir), 'utf8').split(/\r?\n/)) { const m = l.match(/^([^#!=\s][^=]*?)\s*=(.*)$/); if (m) o[m[1]] = m[2]; } } catch {}
  return o;
}
function write(dir, changes) {
  let lines = [];
  try { lines = fs.readFileSync(file(dir), 'utf8').split(/\r?\n/); } catch {}
  const left = { ...changes };
  lines = lines.map((l) => { const m = l.match(/^([^#!=\s][^=]*?)\s*=/); if (m && m[1] in left) { const v = left[m[1]]; delete left[m[1]]; return `${m[1]}=${v}`; } return l; });
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  for (const [k, v] of Object.entries(left)) lines.push(`${k}=${v}`);
  fs.writeFileSync(file(dir), lines.join('\n') + '\n');
}
module.exports = { read, write };
