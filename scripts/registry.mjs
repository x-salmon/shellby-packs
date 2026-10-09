// Loads and checks every pack in packs/. Shared by validate.mjs (PR checks) and
// build.mjs (site). Uses Shellby's own validator (lib/shellby.js), plus the
// registry's stricter rules: no warnings allowed, folder name == pack id, etc.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// PACKS_ROOT lets CI run the trusted checker from main against a PR's packs.
export const ROOT = path.resolve(process.env.PACKS_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
export const Shellby = require('../lib/shellby.js');
export const SITE_URL = 'https://x-salmon.github.io/shellby-packs/';
export const REPO_URL = 'https://github.com/x-salmon/shellby-packs';

const RESERVED = new Set(['shellby', 'shellby-packs', 'official', 'builtin', 'core']);
const ALLOWED_FILES = new Set(['pack.json', 'README.md']);
const MAX_README = 20 * 1024;

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function gitDate(rel) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', rel], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out || null;
  } catch { return null; }
}

function gitShow(ref, rel) {
  try { return execFileSync('git', ['show', `${ref}:${rel}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}

// Returns { packs: [{ id, dir, bytes, raw, json, pack, readme, sha256, updated }], problems: [{ pack, message }] }
export function loadPacks({ baseRef = null } = {}) {
  const dir = path.join(ROOT, 'packs');
  const problems = [];
  const packs = [];
  const known = { knownAchievements: Shellby.KNOWN_ACHIEVEMENTS, knownSeasons: Shellby.KNOWN_SEASONS };
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : [];
  for (const e of entries) {
    if (!e.isDirectory()) { problems.push({ pack: e.name, message: 'Only folders belong in packs/ (packs/<pack-id>/pack.json).' }); continue; }
    const folder = e.name;
    const rel = `packs/${folder}/pack.json`;
    const file = path.join(dir, folder, 'pack.json');
    const report = message => problems.push({ pack: folder, message });

    for (const f of fs.readdirSync(path.join(dir, folder))) {
      if (!ALLOWED_FILES.has(f)) report(`Unexpected file "${f}". A pack folder holds only pack.json and an optional README.md.`);
    }
    if (!fs.existsSync(file)) { report('Missing pack.json.'); continue; }
    const raw = fs.readFileSync(file);
    if (raw.length > Shellby.constants.MAX_FILE_BYTES) { report(`pack.json is ${raw.length} bytes; the limit is ${Shellby.constants.MAX_FILE_BYTES}.`); continue; }
    let json;
    try { json = JSON.parse(raw.toString('utf8').replace(/^﻿/, '')); } catch (err) { report(`pack.json isn't valid JSON: ${err.message}`); continue; }

    const r = Shellby.validatePack(json, { source: 'user', ...known });
    for (const m of r.errors) report(m);
    for (const m of r.warnings) report(`${m} (the gallery doesn't accept packs with skipped items)`);
    if (!r.pack) continue;
    if (json.id !== folder) report(`The folder name must match the pack id: rename packs/${folder} to packs/${json.id}.`);
    if (RESERVED.has(json.id)) report(`The id "${json.id}" is reserved.`);
    const total = ['accessories', 'effects', 'skins', 'voices', 'scenes', 'decor'].reduce((n, f) => n + r.pack[f].length, 0);
    if (!total) report('The pack is empty: add at least one accessory, effect, skin, voice, scene or piece of decor.');
    // Accessories, effects, skins, voices and decor share one set of keys in Shellby
    // (scenes keep their own), so an id used twice across them loses an item on install.
    const owner = new Map();
    for (const f of ['accessories', 'effects', 'skins', 'voices', 'decor']) {
      for (const it of r.pack[f]) {
        if (owner.has(it.key)) report(`The id "${it.key.split('/').pop()}" is used by both ${owner.get(it.key)} and ${f}. Give each item its own id.`);
        else owner.set(it.key, f);
      }
    }

    // Changed an already-published pack? Its version must go up so Shellby users see the update.
    if (baseRef) {
      const before = gitShow(baseRef, rel);
      if (before && before !== raw.toString('utf8')) {
        let oldVersion = null;
        try { oldVersion = JSON.parse(before).version; } catch { /* ignore */ }
        if (oldVersion && !isNewer(json.version, oldVersion)) report(`You changed this pack, so bump its version (it's ${json.version}; the published one is ${oldVersion}).`);
      }
    }

    let readme = null;
    const readmeFile = path.join(dir, folder, 'README.md');
    if (fs.existsSync(readmeFile)) {
      const buf = fs.readFileSync(readmeFile);
      if (buf.length > MAX_README) report(`README.md is too long (max ${MAX_README / 1024} KB).`);
      else readme = buf.toString('utf8');
    }
    packs.push({ id: json.id, dir: folder, bytes: raw.length, raw, json, pack: r.pack, readme, sha256: sha256(raw), updated: gitDate(`packs/${folder}`) || new Date().toISOString() });
  }
  const seen = new Map();
  for (const p of packs) {
    if (seen.has(p.id)) problems.push({ pack: p.dir, message: `Duplicate pack id "${p.id}" (also in packs/${seen.get(p.id)}).` });
    seen.set(p.id, p.dir);
  }
  return { packs: packs.sort((a, b) => (b.updated || '').localeCompare(a.updated || '')), problems };
}

function isNewer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (pa[i] !== pb[i]) return pa[i] > pb[i]; }
  return false;
}

// The machine-readable registry Shellby reads (contract: shellby src/main/registry.js).
export function registryIndex(packs) {
  return {
    format: 1,
    generated: new Date().toISOString(),
    packs: packs.map(p => ({
      id: p.id, name: p.pack.name, author: p.pack.author, version: p.pack.version,
      description: p.pack.description || '',
      url: `${SITE_URL}packs/${p.id}.json`,
      sha256: p.sha256, bytes: p.bytes,
      counts: {
        accessories: p.pack.accessories.length, effects: p.pack.effects.length, skins: p.pack.skins.length,
        voices: p.pack.voices.length, scenes: p.pack.scenes.length, decor: p.pack.decor.length,
      },
      updated: p.updated,
    })),
  };
}
