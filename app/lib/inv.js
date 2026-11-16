'use strict';
const fs = require('fs'), path = require('path');
const nbt = require('./nbt'), props = require('./props');
const P = () => require('./proc');

function playerFile(c, uuid) {
  if (!/^[0-9a-f-]{32,36}$/i.test(uuid)) throw new Error('bad uuid');
  const d = P().dirOf(c), lvl = props.read(d)['level-name'] || 'world';
  const cands = [[lvl, 'playerdata'], [lvl, 'players', 'data'], [lvl, 'dimensions', 'minecraft', 'overworld', 'players', 'data']].map((p) => path.join(d, ...p, uuid + '.dat'));
  return cands.find((f) => fs.existsSync(f)) || null;
}
const text = (v) => { if (typeof v !== 'string') return v && v.text ? String(v.text) : ''; try { const j = JSON.parse(v); return typeof j === 'string' ? j : j.text || ''; } catch { return v; } };
const item = (i) => i && i.id ? { slot: i.Slot, id: i.id, count: i.count ?? i.Count ?? 1, name: text(i.components?.['minecraft:custom_name'] ?? i.tag?.display?.Name) } : null;
function read(c, uuid) {
  const f = playerFile(c, uuid);
  if (!f) return null;
  const n = nbt.parse(fs.readFileSync(f));
  const inv = (n.Inventory || []).map(item).filter(Boolean);
  const armor = { head: null, chest: null, legs: null, feet: null }, legacy = { 103: 'head', 102: 'chest', 101: 'legs', 100: 'feet' };
  let offhand = null;
  const main = inv.filter((i) => {
    if (legacy[i.slot]) { armor[legacy[i.slot]] = i; return false; }
    if (i.slot === -106) { offhand = i; return false; }
    return true;
  });
  if (n.equipment) { for (const k of Object.keys(armor)) if (n.equipment[k]) armor[k] = item(n.equipment[k]); if (n.equipment.offhand) offhand = item(n.equipment.offhand); }
  return { inventory: main, armor, offhand, ender: (n.EnderItems || []).map(item).filter(Boolean), selected: n.SelectedItemSlot, xp: n.XpLevel, health: n.Health, food: n.foodLevel, gamemode: n.playerGameType, pos: n.Pos };
}
module.exports = { read };
