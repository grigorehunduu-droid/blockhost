'use strict';
// Release gate: fails if a folder that is about to be published contains API keys, saved settings or user data.
// Usage: node tools/check-secrets.js <dir>
const fs = require('fs'), path = require('path');
const dir = process.argv[2];
const PATTERNS = [[/AIza[0-9A-Za-z_-]{30,}/, 'Google API key'], [/sk-ant-[A-Za-z0-9_-]{10,}/, 'Anthropic key'], [/sk-(?:proj-)?[A-Za-z0-9_-]{30,}/, 'OpenAI-style key'], [/dpapi:[A-Za-z0-9+\/=]{40,}/, 'encrypted key blob'], [/"rcon\.password"|rcon\.password=[0-9a-f]{16,}/, 'RCON password'], [/ghp_[A-Za-z0-9]{30,}/, 'GitHub token']];
const TEXT = /\.(js|json|html|css|txt|md|ps1|bat|cs|manifest|properties|yml|yaml)$/i;
const bad = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name), rel = path.relative(dir, p);
    if (e.isDirectory()) { if (/^(data|\.git|node_modules)$/i.test(e.name)) bad.push(rel + '\\  (folder that must never be published)'); else walk(p); continue; }
    if (/^(settings|servers|instance)\.json$/i.test(e.name) && /data/i.test(rel)) bad.push(rel + '  (user data file)');
    if (!TEXT.test(e.name) || fs.statSync(p).size > 4e6) continue;
    const t = fs.readFileSync(p, 'utf8');
    for (const [re, what] of PATTERNS) if (re.test(t)) bad.push(`${rel}  (${what})`);
  }
})(dir);
if (bad.length) { console.error('SECRET CHECK FAILED:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log('secret check passed: no keys, settings or user data in', dir);
