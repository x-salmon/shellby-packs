// Community news: news/<id>.json, one item per file, built into news.json beside
// index.json. Shellby fetches it once a day and shows one quiet card at a time
// (shellby src/main/news.js, docs/plans/community-events.md §2). The app drops a
// bad item on its own; the gallery refuses it, so a typo never reaches anyone.
// Shared by validate.mjs (PR checks) and build.mjs (site). See news/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, Shellby, CONTEST_RE, git } from './registry.mjs';

export const FORMAT = 1;
export const KINDS = ['contest', 'winner', 'event', 'featured', 'note'];
// What a contest may ask for: the validator's own names for a pack's kinds of item.
export const CONTEST_KINDS = ['skin', 'accessory', 'effect', 'voice', 'scene', 'decor'];
export const MAX_FEED_BYTES = 64 * 1024; // the app won't read a bigger feed
const ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELDS = new Set(['id', 'kind', 'title', 'body', 'url', 'from', 'until', 'contest', 'pack']);
const WITH_PACK = new Set(['featured', 'winner']);
// The only places a news item may link to: Shellby's own repos, site and gallery.
const URL_OK = [
  u => u.hostname === 'github.com' && u.pathname.startsWith('/x-salmon/'),
  u => u.hostname === 'getshellby.com',
  u => u.hostname === 'x-salmon.github.io',
];

const q = v => JSON.stringify(v);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// Plain text: the app shows it as written, so markup or control characters would show too.
const plainProblem = s => (/[\u0000-\u001f\u007f]/.test(s) ? 'has a line break or control character' : /<\/?[a-z!][^>]*>/i.test(s) ? 'looks like HTML; news is plain text' : null);
const isDate = s => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

export function urlOk(v) {
  if (typeof v !== 'string' || v.length > 200 || !/^https:\/\/\S+$/.test(v)) return false;
  let u;
  try { u = new URL(v); } catch { return false; }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && URL_OK.some(ok => ok(u));
}

function text(errors, item, field, max, { required = false } = {}) {
  const v = item[field];
  if (v === undefined && !required) return;
  if (typeof v !== 'string' || !v.trim() || v.length > max) { errors.push(`"${field}" must be 1–${max} characters of text.`); return; }
  const bad = plainProblem(v);
  if (bad) errors.push(`"${field}" ${bad}.`);
}

/**
 * Every problem with one news item, in plain English ([] when it's fine).
 * `packs` maps registry pack id -> { contest } for the packs in the gallery.
 */
export function checkItem(item, { packs = new Map() } = {}) {
  const errors = [];
  if (!isObj(item)) return ['A news item is one JSON object.'];
  for (const k of Object.keys(item)) if (!FIELDS.has(k)) errors.push(`Unknown field "${k}" (a news item has ${[...FIELDS].join(', ')}).`);
  if (typeof item.id !== 'string' || !ID_RE.test(item.id)) errors.push(`Bad id ${q(item.id)}: use lowercase letters, digits and dashes, up to 60.`);
  if (!KINDS.includes(item.kind)) errors.push(`Unknown kind ${q(item.kind)} (use one of ${KINDS.join(', ')}).`);
  text(errors, item, 'title', 60, { required: true });
  text(errors, item, 'body', 200);
  if (item.url !== undefined && !urlOk(item.url)) errors.push('"url" must be an https:// link of at most 200 characters to github.com/x-salmon/…, getshellby.com or x-salmon.github.io.');
  for (const f of ['from', 'until']) if (!isDate(item[f])) errors.push(`"${f}" must be a real date as "YYYY-MM-DD" (it's ${q(item[f])}).`);
  if (isDate(item.from) && isDate(item.until) && item.until < item.from) errors.push(`"until" (${item.until}) is before "from" (${item.from}).`);

  if (item.kind === 'contest') {
    const c = item.contest;
    if (!isObj(c)) errors.push('A contest item needs "contest": { "month": "YYYY-MM", "theme": "…", "kinds": ["skin"] }.');
    else {
      for (const k of Object.keys(c)) if (!['month', 'theme', 'kinds'].includes(k)) errors.push(`Unknown field "contest.${k}" (it has month, theme and kinds).`);
      if (typeof c.month !== 'string' || !CONTEST_RE.test(c.month)) errors.push(`"contest.month" must be "YYYY-MM" (it's ${q(c.month)}).`);
      if (typeof c.theme !== 'string' || !c.theme.trim() || c.theme.length > 40) errors.push('"contest.theme" must be 1–40 characters of text.');
      else if (plainProblem(c.theme)) errors.push(`"contest.theme" ${plainProblem(c.theme)}.`);
      if (!Array.isArray(c.kinds) || !c.kinds.length || c.kinds.some(k => !CONTEST_KINDS.includes(k)) || new Set(c.kinds).size !== c.kinds.length) {
        errors.push(`"contest.kinds" must list what entries may hold, each once: ${CONTEST_KINDS.join(', ')}.`);
      }
    }
  } else if (item.contest !== undefined) errors.push('Only a contest item has "contest".');

  if (item.pack !== undefined) {
    if (!WITH_PACK.has(item.kind)) errors.push('Only a featured or winner item names a "pack".');
    else if (typeof item.pack !== 'string' || !Shellby.constants.PACK_ID_RE.test(item.pack)) errors.push(`Bad pack id ${q(item.pack)}.`);
    else if (!packs.has(item.pack)) errors.push(`There's no pack "${item.pack}" in the gallery (merge the pack first).`);
    else if (item.kind === 'winner' && !packs.get(item.pack).contest) errors.push(`The pack "${item.pack}" has no "contest" field, so it isn't a contest entry.`);
  }
  return errors;
}

// The feed as Shellby reads it: { format, items }. Every problem with it ([] when fine).
export function checkFeed(feed, opts) {
  if (!isObj(feed) || feed.format !== FORMAT || !Array.isArray(feed.items)) return [`The feed must be { "format": ${FORMAT}, "items": [...] }.`];
  const problems = [];
  const seen = new Set();
  feed.items.forEach((item, i) => {
    const name = isObj(item) && typeof item.id === 'string' ? item.id : `#${i}`;
    for (const m of checkItem(item, opts)) problems.push({ item: name, message: m });
    if (isObj(item) && seen.has(item.id)) problems.push({ item: name, message: `Duplicate id "${item.id}".` });
    if (isObj(item)) seen.add(item.id);
  });
  const bytes = Buffer.byteLength(JSON.stringify(feed, null, 2) + '\n'); // as build.mjs writes it
  if (bytes > MAX_FEED_BYTES) problems.push({ item: 'news.json', message: `The feed is ${bytes} bytes; Shellby reads at most ${MAX_FEED_BYTES}. Remove items that have ended.` });
  return problems;
}

// Newest first, so a reader that stops early still sees what's current.
export const newsFeed = items => ({ format: FORMAT, items: [...items].sort((a, b) => b.from.localeCompare(a.from) || a.id.localeCompare(b.id)) });

/**
 * Loads news/*.json. `packs` is loadPacks()'s list (for "pack" and winners).
 * Returns { feed, problems: [{ item, message }] }; the feed holds only items that passed.
 */
export function loadNews({ root = ROOT, packs = [] } = {}) {
  const dir = path.join(root, 'news');
  const byId = new Map(packs.map(p => [p.id, { contest: p.contest }]));
  const problems = [];
  const items = [];
  const files = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  // An id is forever: Shellby remembers dismissed ids, so a reused one would stay hidden.
  const gone = new Set((git(root, ['log', '--no-renames', '--diff-filter=D', '--name-only', '--format=', '--', 'news/']) || '').split('\n')
    .map(f => /^news\/([^/]+)\.json$/.exec(f.trim())?.[1]).filter(Boolean));
  for (const e of files) {
    if (e.name === 'README.md') continue;
    const report = message => problems.push({ item: e.name, message });
    if (!e.isFile() || !e.name.endsWith('.json')) { report('Only <id>.json files (and README.md) belong in news/.'); continue; }
    let item;
    try { item = JSON.parse(fs.readFileSync(path.join(dir, e.name), 'utf8').replace(/^﻿/, '')); } catch (err) { report(`Isn't valid JSON: ${err.message}`); continue; }
    const errors = checkItem(item, { packs: byId });
    const id = e.name.slice(0, -'.json'.length);
    if (isObj(item) && item.id !== id) errors.push(`The file name must match the id: rename it to news/${item.id}.json.`);
    if (gone.has(id)) errors.push(`The id "${id}" was used before and removed; pick a new one.`);
    for (const m of errors) report(m);
    if (!errors.length) items.push(item);
  }
  const feed = newsFeed(items);
  for (const p of checkFeed(feed, { packs: byId })) problems.push(p);
  return { feed, problems };
}

// Pack ids a winner item names: the gallery marks them in index.json.
export const winners = feed => new Set(feed.items.filter(i => i.kind === 'winner' && i.pack).map(i => i.pack));
