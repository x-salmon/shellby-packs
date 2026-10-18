// Community news: every rule of the feed (docs/plans/community-events.md §2), one by one.
//   node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkItem, checkFeed, loadNews, newsFeed, winners, urlOk, MAX_FEED_BYTES } from '../scripts/news.mjs';
import { loadPacks } from '../scripts/registry.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = f => JSON.parse(fs.readFileSync(path.join(FIXTURES, 'news', f), 'utf8'));
const contest = read('contest-2026-11.json');
const winner = read('winner-2026-11.json');
const packs = new Map([['frosty', { contest: '2026-11' }], ['tiny-hats', { contest: null }]]);
const errs = (over, base = contest) => checkItem({ ...base, ...over }, { packs });
const fails = (over, base, re) => {
  const e = errs(over, base);
  assert.ok(e.some(m => re.test(m)), `expected ${re} for ${JSON.stringify(over)}, got ${JSON.stringify(e)}`);
};

test('the fixtures pass', () => {
  assert.deepEqual(errs({}), []);
  assert.deepEqual(errs({}, winner), []);
  assert.deepEqual(checkItem({ id: 'hello', kind: 'note', title: 'Hi', from: '2026-11-01', until: '2026-11-01' }), []);
});

test('id: [a-z0-9-], up to 60', () => {
  for (const id of ['Contest', 'contest_1', '', '-x', 'a'.repeat(61), 7, undefined]) fails({ id }, contest, /Bad id/);
  assert.deepEqual(errs({ id: 'a'.repeat(60) }), []);
});

test('kind: contest, winner, event, featured or note', () => {
  for (const kind of ['news', 'Contest', '', undefined]) fails({ kind }, contest, /Unknown kind/);
  for (const kind of ['event', 'note']) assert.deepEqual(errs({ kind, contest: undefined }), []);
});

test('title up to 60 and body up to 200, plain text', () => {
  fails({ title: 'x'.repeat(61) }, contest, /"title" must be 1–60/);
  fails({ title: '' }, contest, /"title"/);
  fails({ title: '   ' }, contest, /"title"/);
  fails({ title: undefined }, contest, /"title"/);
  assert.deepEqual(errs({ title: 'x'.repeat(60), body: 'y'.repeat(200) }), []);
  fails({ body: 'y'.repeat(201) }, contest, /"body" must be 1–200/);
  fails({ body: 'two\nlines' }, contest, /control character/);
  fails({ body: 'a <b>bold</b> move' }, contest, /plain text/);
  fails({ title: '<img src=x onerror=alert(1)>' }, contest, /plain text/);
  assert.deepEqual(errs({ body: 'Crabs < lobsters > shrimp' }), []); // a bracket isn't markup
  assert.deepEqual(errs({ body: undefined }), []);
});

test('url only to Shellby\'s own places', () => {
  for (const ok of ['https://github.com/x-salmon/shellby/discussions/1', 'https://getshellby.com/', 'https://getshellby.com/community/pack/frosty/', 'https://x-salmon.github.io/shellby-packs/']) assert.ok(urlOk(ok), ok);
  for (const bad of [
    'http://getshellby.com/', 'https://github.com/x-salmon', 'https://github.com/someone/x-salmon/', 'https://github.com.evil.com/x-salmon/',
    'https://getshellby.com.evil.com/', 'https://evil.getshellby.com/', 'https://x-salmon.github.io.evil/', 'https://user@getshellby.com/',
    'https://getshellby.com:8443/', 'javascript:alert(1)', `https://getshellby.com/${'a'.repeat(200)}`, 'https://getshellby.com/a b', 42,
  ]) assert.ok(!urlOk(bad), bad);
  fails({ url: 'https://discord.gg/abc' }, contest, /"url"/);
  assert.deepEqual(errs({ url: undefined }), []);
});

test('from and until: real dates, in order', () => {
  for (const from of ['2026-11-1', '2026-02-30', '2026-13-01', 'tomorrow', undefined, 20261101]) fails({ from }, contest, /"from" must be a real date/);
  fails({ until: undefined }, contest, /"until"/);
  fails({ from: '2026-11-22', until: '2026-11-21' }, contest, /before/);
  assert.deepEqual(errs({ from: '2028-02-29', until: '2028-02-29' }), []);
});

test('contest: only on a contest item, with month, theme and kinds', () => {
  fails({ contest: undefined }, contest, /needs "contest"/);
  fails({ contest: { ...contest.contest, month: '2026-13' } }, contest, /contest.month/);
  fails({ contest: { ...contest.contest, month: '2026-1' } }, contest, /contest.month/);
  fails({ contest: { ...contest.contest, theme: '' } }, contest, /contest.theme/);
  fails({ contest: { ...contest.contest, theme: 'x'.repeat(41) } }, contest, /contest.theme/);
  fails({ contest: { ...contest.contest, kinds: [] } }, contest, /contest.kinds/);
  fails({ contest: { ...contest.contest, kinds: ['hat'] } }, contest, /contest.kinds/);
  fails({ contest: { ...contest.contest, kinds: ['skin', 'skin'] } }, contest, /contest.kinds/);
  fails({ contest: { ...contest.contest, prize: 'gold' } }, contest, /contest.prize/);
  assert.deepEqual(errs({ contest: { ...contest.contest, kinds: ['skin', 'accessory', 'decor'] } }), []);
  fails({ kind: 'note' }, contest, /Only a contest item/);
});

test('pack: featured or winner only, a real gallery pack; a winner\'s is an entry', () => {
  fails({ pack: 'Frosty!' }, winner, /Bad pack id/);
  fails({ pack: 'x' }, winner, /Bad pack id/); // the registry's id rule wants 2–40
  fails({ pack: 'no-such-pack' }, winner, /no pack "no-such-pack"/);
  fails({ pack: 'tiny-hats' }, winner, /isn't a contest entry/);
  assert.deepEqual(errs({ kind: 'featured', pack: 'tiny-hats' }, winner), []);
  assert.deepEqual(errs({ pack: undefined }, winner), []); // "no entries this month"
  fails({ kind: 'note', pack: 'frosty' }, winner, /Only a featured or winner/);
});

test('unknown fields are refused, so a typo can\'t pass quietly', () => {
  fails({ untill: '2026-11-30' }, contest, /Unknown field "untill"/);
  assert.deepEqual(checkItem([]), ['A news item is one JSON object.']);
});

test('the feed: format 1, unique ids, newest first, at most 64 KB', () => {
  assert.deepEqual(checkFeed(newsFeed([contest, winner]), { packs }), []);
  assert.deepEqual(newsFeed([contest, winner]).items.map(i => i.id), ['winner-2026-11', 'contest-2026-11']);
  assert.match(checkFeed({ format: 2, items: [] })[0], /format/);
  assert.match(checkFeed({ format: 1 })[0], /format/);
  assert.ok(checkFeed({ format: 1, items: [contest, contest] }, { packs }).some(p => /Duplicate id/.test(p.message)));
  const many = Array.from({ length: 400 }, (_, i) => ({ ...contest, kind: 'note', contest: undefined, id: `note-${i}`, body: 'b'.repeat(200) }));
  const big = checkFeed(newsFeed(many));
  assert.ok(JSON.stringify(newsFeed(many)).length > MAX_FEED_BYTES);
  assert.ok(big.some(p => /Shellby reads at most/.test(p.message)));
});

test('loadNews builds the feed from news/*.json and marks winners', () => {
  const { packs: list, problems } = loadPacks({ root: FIXTURES });
  assert.deepEqual(problems, []);
  const r = loadNews({ root: FIXTURES, packs: list });
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.feed.items.map(i => i.id), ['winner-2026-11', 'contest-2026-11']);
  assert.deepEqual([...winners(r.feed)], ['frosty']);
  // Without the pack in the gallery, the winner item fails and is left out.
  const alone = loadNews({ root: FIXTURES, packs: [] });
  assert.deepEqual(alone.feed.items.map(i => i.id), ['contest-2026-11']);
  assert.ok(alone.problems.some(p => p.item === 'winner-2026-11.json' && /no pack "frosty"/.test(p.message)));
});

test('loadNews: file name is the id, only .json files, and an id is never reused', () => {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'packs-news-')));
  try {
    const run = (...a) => execFileSync('git', a, { cwd: root, stdio: 'ignore' });
    run('init', '-q'); run('config', 'user.email', 't@example.com'); run('config', 'user.name', 't');
    fs.mkdirSync(path.join(root, 'news'));
    const put = (f, v) => fs.writeFileSync(path.join(root, 'news', f), typeof v === 'string' ? v : JSON.stringify(v));
    put('README.md', '# news');
    put('old-note.json', { ...contest, id: 'old-note', kind: 'note', contest: undefined });
    run('add', '-A'); run('commit', '-qm', 'add');
    assert.deepEqual(loadNews({ root }).problems, []);
    fs.rmSync(path.join(root, 'news', 'old-note.json'));
    run('add', '-A'); run('commit', '-qm', 'remove');
    put('old-note.json', { ...contest, id: 'old-note', kind: 'note', contest: undefined, title: 'Something new' });
    put('misnamed.json', { ...contest });
    put('broken.json', '{ "id": ');
    put('notes.txt', 'hi');
    const r = loadNews({ root });
    const about = f => r.problems.filter(p => p.item === f).map(p => p.message).join(' | ');
    assert.match(about('old-note.json'), /used before and removed/);
    assert.match(about('misnamed.json'), /rename it to news\/contest-2026-11\.json/);
    assert.match(about('broken.json'), /valid JSON/);
    assert.match(about('notes.txt'), /Only <id>\.json files/);
    assert.deepEqual(r.feed.items, []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('no news/ folder is an empty feed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packs-nonews-'));
  try { assert.deepEqual(loadNews({ root }), { feed: { format: 1, items: [] }, problems: [] }); } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
