// The Pack check's gallery rules for community events: a contest entry's month,
// event-limited items, and what index.json carries (by, contest, winner).
//   node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPacks, registryIndex, KNOWN_EVENTS } from '../scripts/registry.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const frosty = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'packs', 'frosty', 'pack.json'), 'utf8'));

// Checks one pack (frosty with `over` merged in) in a gallery of its own.
function check(over = {}, edit = p => p) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-check-'));
  try {
    fs.mkdirSync(path.join(root, 'packs', 'frosty'), { recursive: true });
    const pack = edit(structuredClone({ ...frosty, ...over }));
    for (const k of Object.keys(pack)) if (pack[k] === undefined) delete pack[k];
    fs.writeFileSync(path.join(root, 'packs', 'frosty', 'pack.json'), JSON.stringify(pack));
    return loadPacks({ root });
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const messages = r => r.problems.map(p => p.message).join(' | ');

test('the fixture entry passes, keeping its contest month and event unlock', () => {
  const r = check();
  assert.deepEqual(r.problems, []);
  assert.equal(r.packs[0].contest, '2026-11');
  assert.deepEqual(r.packs[0].pack.accessories[0].unlock, { event: 'frostbite' });
});

test('contest: "YYYY-MM" or nothing', () => {
  assert.equal(check({ contest: undefined }).packs[0].contest, null);
  for (const contest of ['2026-13', '2026-1', '2026-11-01', 'november', 202611, null, '']) {
    assert.match(messages(check({ contest })), /"contest" must be the contest's month/, String(contest));
  }
});

test('unlock: { event } for every built-in event, and nothing else', () => {
  for (const id of ['harvest', 'haunting', 'frostbite', 'penpal', 'spring-clean', 'low-tide', 'molt-day']) assert.ok(KNOWN_EVENTS.has(id), id);
  const withEvent = (event, field = 'accessories') => p => { p[field][0].unlock = { event }; return p; };
  for (const id of KNOWN_EVENTS) {
    for (const field of ['accessories', 'skins']) {
      const r = check({}, withEvent(id, field));
      assert.deepEqual(r.problems, [], `${field} ${id}`);
      assert.deepEqual(r.packs[0].pack[field][0].unlock, { event: id });
    }
  }
  for (const bad of ['halloween', 'Frostbite', '', 7]) assert.match(messages(check({}, withEvent(bad))), /unknown event/, String(bad));
  // One kind of unlock at a time, as for seasons.
  assert.match(messages(check({}, p => { p.accessories[0].unlock = { event: 'haunting', season: 'halloween' }; return p; })), /exactly one/);
  // Seasons and achievements still work as before.
  assert.deepEqual(check({}, p => { p.accessories[0].unlock = { season: 'winter' }; return p; }).problems, []);
});

test('index.json: by, contest and winner only when known', () => {
  const [p] = check().packs;
  const plain = registryIndex([{ ...p, contest: null }]).packs[0];
  assert.ok(!('by' in plain) && !('contest' in plain) && !('winner' in plain));
  const full = registryIndex([{ ...p, by: 'crabfan', winner: true }]).packs[0];
  assert.equal(full.by, 'crabfan');
  assert.equal(full.contest, '2026-11');
  assert.equal(full.winner, true);
});
