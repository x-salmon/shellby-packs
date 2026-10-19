// index.json's `by`: the author of the merged PR behind each pack's last change.
//   node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { packAuthors } from '../scripts/authors.mjs';

// A gallery with two packs, each in its own commit. Returns { root, sha: { id: commit } }.
function gallery() {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'packs-by-')));
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.email', 't@example.com'); git('config', 'user.name', 't');
  const sha = {};
  for (const id of ['frosty', 'tiny-hats']) {
    fs.mkdirSync(path.join(root, 'packs', id), { recursive: true });
    fs.writeFileSync(path.join(root, 'packs', id, 'pack.json'), `{"id":"${id}"}`);
    git('add', '-A'); git('commit', '-qm', `add ${id}`);
    sha[id] = git('rev-parse', 'HEAD');
  }
  return { root, sha };
}
const packs = [{ id: 'frosty', dir: 'frosty' }, { id: 'tiny-hats', dir: 'tiny-hats' }];
const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });
const pr = (login, { merged = '2026-11-02T10:00:00Z', base = 'main' } = {}) => ({ user: { login }, merged_at: merged, base: { ref: base } });

test('finds the merged PR author for each pack', async () => {
  const { root, sha } = gallery();
  try {
    const asked = [];
    const fetchImpl = async (url, opts) => {
      asked.push(url);
      assert.equal(opts.headers.Authorization, 'Bearer tok');
      if (url.includes(sha.frosty)) return reply(200, [pr('someone', { merged: null }), pr('crabfan'), pr('later', { merged: '2026-12-01T00:00:00Z' })]);
      return reply(200, [pr('octo', { base: 'other' })]);
    };
    const by = await packAuthors(packs, { root, token: 'tok', repo: 'x-salmon/shellby-packs', fetchImpl, log: () => {} });
    assert.deepEqual([...by], [['frosty', 'crabfan']]); // tiny-hats' PR went elsewhere: no `by`
    assert.ok(asked.every(u => u.startsWith('https://api.github.com/repos/x-salmon/shellby-packs/commits/')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('without a token (a local build) it asks nothing and finds nothing', async () => {
  const { root } = gallery();
  try {
    const by = await packAuthors(packs, { root, token: '', fetchImpl: () => assert.fail('no fetch without a token') });
    assert.equal(by.size, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('failures, bots and odd answers leave `by` out without failing the build', async () => {
  const { root, sha } = gallery();
  try {
    const logged = [];
    const fetchImpl = async url => {
      if (url.includes(sha.frosty)) throw new Error('offline');
      return reply(200, [pr('dependabot[bot]')]);
    };
    const by = await packAuthors(packs, { root, token: 'tok', fetchImpl, log: m => logged.push(m) });
    assert.equal(by.size, 0);
    assert.match(logged.join('\n'), /offline/);
    for (const answer of [reply(403, { message: 'rate limited' }), reply(200, { not: 'a list' }), reply(200, [{ merged_at: '2026-11-02', base: { ref: 'main' } }])]) {
      assert.equal((await packAuthors(packs, { root, token: 'tok', fetchImpl: async () => answer, log: () => {} })).size, 0);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('packs changed in one commit share one lookup', async () => {
  const { root } = gallery();
  try {
    let calls = 0;
    const same = [{ id: 'frosty', dir: 'frosty' }, { id: 'frosty-copy', dir: 'frosty' }];
    const by = await packAuthors(same, { root, token: 'tok', fetchImpl: async () => { calls++; return reply(200, [pr('crabfan')]); } });
    assert.equal(calls, 1);
    assert.deepEqual([...by.values()], ['crabfan', 'crabfan']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
