/* Shellby pack validator, vendored from x-salmon/shellby v0.4.0 by scripts/sync-shellby.mjs.
   Do not edit by hand. Re-run the sync script when Shellby's pack format changes. */
(function (root) {
  'use strict';
  const defs = {};
  const cache = {};
  // Node built-ins are only used by Shellby's file loaders (not by validatePack);
  // these stand-ins let the same source run in the browser.
  const builtins = {
    '#fs': typeof require === 'function' ? require('fs') : {},
    '#path': typeof require === 'function' ? require('path') : { join: (...p) => p.join('/'), resolve: (...p) => p.join('/'), basename: p => String(p).split(/[\\/]/).pop(), dirname: p => String(p).split(/[\\/]/).slice(0, -1).join('/') },
  };
  const resolveMap = {"../skins":"skins","./seasons":"seasons","./achievements":"achievements","fs":"#fs","path":"#path"};
  function load(name) {
    if (builtins[name]) return builtins[name];
    if (cache[name]) return cache[name].exports;
    const module = cache[name] = { exports: {} };
    defs[name](module, module.exports, spec => {
      const target = resolveMap[spec];
      if (!target) throw new Error('shellby bundle: unknown require ' + spec);
      return load(target);
    }, '/shellby/src/main');
    return module.exports;
  }

  // ---- src/main/skins.js
  defs["skins"] = function (module, exports, require, __dirname) {
// Skins are JSON pixel grids. Built-ins ship in src/skins; users can drop their
// own into %APPDATA%/Shellby/skins. Everything is validated before it reaches
// the renderer.
const fs = require('fs');
const path = require('path');

const BUILTIN_DIR = path.join(__dirname, '..', 'skins');
const PARTS = new Set(['shell', 'body', 'claw', 'eyes', 'stalks', 'legs', 'extra']);
const HEX = /^#[0-9a-f]{6}$/i;

function validate(skin, fallbackId) {
  const errors = [];
  if (!skin || typeof skin !== 'object') return { errors: ['not an object'] };
  const pixels = Array.isArray(skin.pixels) ? skin.pixels.filter(r => typeof r === 'string') : [];
  if (!pixels.length || pixels.length > 32) errors.push('pixels must be 1–32 rows of strings');
  if (pixels.some(r => r.length > 40)) errors.push('rows must be at most 40 characters');
  const palette = {};
  for (const [ch, color] of Object.entries(skin.palette || {})) {
    if (ch.length === 1 && HEX.test(color)) palette[ch] = color;
    else errors.push(`bad palette entry ${JSON.stringify(ch)}`);
  }
  const parts = {};
  for (const [ch, part] of Object.entries(skin.parts || {})) {
    if (ch.length === 1 && PARTS.has(part)) parts[ch] = part;
  }
  const id = String(skin.id || fallbackId || '').replace(/[^\w-]/g, '').slice(0, 40);
  if (!id) errors.push('missing id');
  if (errors.length) return { errors };
  return {
    skin: {
      id, pixels, palette, parts,
      name: String(skin.name || id).slice(0, 40),
      author: String(skin.author || 'unknown').slice(0, 40),
      description: String(skin.description || '').slice(0, 120),
    },
    errors: [],
  };
}

function loadDir(dir, source) {
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    try {
      const { skin, errors } = validate(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), path.basename(f, '.json'));
      if (skin) out.push({ ...skin, source });
      else console.warn(`[shellby] skipped skin ${f}: ${errors.join('; ')}`);
    } catch (e) {
      console.warn(`[shellby] skipped skin ${f}: ${e.message}`);
    }
  }
  return out;
}

function loadSkins(userDir) {
  const byId = new Map();
  for (const s of loadDir(BUILTIN_DIR, 'builtin')) byId.set(s.id, s);
  for (const s of loadDir(userDir, 'user')) byId.set(s.id, s);
  return [...byId.values()];
}

module.exports = { loadSkins, validate, BUILTIN_DIR };

  };

  // ---- src/main/wardrobe/catalog.js
  defs["catalog"] = function (module, exports, require, __dirname) {
// Wardrobe packs: JSON files that add accessories (hats, glasses, held items…),
// ambient effects (falling snow, orbiting bats…) and skins. The built-in pack
// ships in src/wardrobe; community packs live in %APPDATA%/Shellby/wardrobe.
//
// Packs are data only. Everything is validated strictly before it reaches the
// renderer, and validation never throws: a bad item is skipped with a warning,
// a bad pack header rejects the pack. See docs/ADDONS.md for the format.
const fs = require('fs');
const path = require('path');
const { validate: validateSkin } = require('../skins');

const FORMAT = 1;
const MAX_FILE_BYTES = 512 * 1024;
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const ITEM_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const HEX = /^#[0-9a-f]{6}$/i;

const SLOTS = ['hat', 'face', 'neck', 'held', 'shell'];
const ANCHORS = ['head', 'face', 'neck', 'claw', 'shellTop'];
const FOLLOWS = ['stalks', 'body', 'claw', 'shell', 'eyes', 'legs'];
const MOTIONS = ['fall', 'rise', 'float', 'orbit', 'twinkle', 'burst'];
const RARITIES = ['common', 'rare', 'epic', 'legendary'];

const SLOT_ANCHOR = { hat: 'head', face: 'face', neck: 'neck', held: 'claw', shell: 'shellTop' };
const SLOT_FOLLOWS = { hat: 'stalks', face: 'stalks', neck: 'body', held: 'claw', shell: 'shell' };

// Where each anchor sits on the classic 22×13 crab (x = column, y = row, 0-based).
// Skins with a different shape can override any of these via "anchors".
const DEFAULT_ANCHORS = Object.freeze({
  head: Object.freeze([15, -1]),    // just above the gap between the eyes
  face: Object.freeze([15, 0]),     // between the eyes, on the eye row
  neck: Object.freeze([15, 4]),     // where the stalks meet the body
  claw: Object.freeze([21, 6]),     // tip of the claw pinch
  shellTop: Object.freeze([7, 0]),  // top of the shell
});

const LIMITS = Object.freeze({
  accessories: 200, effects: 50, skins: 50,
  itemGrid: 16, spriteGrid: 8, paletteMax: 16, spritesMax: 6,
});

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max && (min === 0 || v.trim().length > 0);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const q = v => JSON.stringify(v);

// ---- item field validators: each returns an error string or null

function checkPalette(p) {
  if (!isObj(p)) return 'palette must be an object';
  const keys = Object.keys(p);
  if (keys.length < 1 || keys.length > LIMITS.paletteMax) return `palette needs 1–${LIMITS.paletteMax} entries`;
  for (const k of keys) {
    if (k.length !== 1 || k === '.') return `bad palette key ${q(k)}`;
    if (typeof p[k] !== 'string' || !HEX.test(p[k])) return `bad palette colour for ${q(k)}`;
  }
  return null;
}

function copyPalette(p) {
  const out = Object.create(null); // no prototype: keys can never reach Object.prototype
  for (const k of Object.keys(p)) out[k] = p[k];
  return out;
}

function checkPixels(rows, max) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > max) return `pixels must be 1–${max} rows`;
  if (rows.some(r => typeof r !== 'string')) return 'pixels rows must be strings';
  if (rows.some(r => r.length > max)) return `pixels rows must be at most ${max} characters`;
  return null;
}

// Returns [normalizedUnlock, error]. Missing → {default:true}.
function checkUnlock(u, known) {
  if (u === undefined) return [{ default: true }, null];
  if (!isObj(u)) return [null, 'unlock must be an object'];
  const keys = Object.keys(u);
  if (keys.length !== 1) return [null, 'unlock must have exactly one of default, achievement, season'];
  if (hasOwn(u, 'default')) return u.default === true ? [{ default: true }, null] : [null, 'unlock.default must be true'];
  if (hasOwn(u, 'achievement')) {
    if (typeof u.achievement !== 'string' || !known.achievements.has(u.achievement)) return [null, `unknown achievement ${q(u.achievement)}`];
    return [{ achievement: u.achievement }, null];
  }
  if (hasOwn(u, 'season')) {
    if (typeof u.season !== 'string' || !known.seasons.has(u.season)) return [null, `unknown season ${q(u.season)}`];
    return [{ season: u.season }, null];
  }
  return [null, `unknown unlock type ${q(keys[0])}`];
}

// Fields shared by accessories and effects. Returns [fields, error].
function commonFields(raw) {
  if (!isStr(raw.name, 1, 40)) return [null, 'name must be 1–40 characters'];
  if (raw.description !== undefined && !isStr(raw.description, 0, 160)) return [null, 'description must be at most 160 characters'];
  if (raw.rarity !== undefined && !RARITIES.includes(raw.rarity)) return [null, `bad rarity ${q(raw.rarity)}`];
  return [{ name: raw.name, description: raw.description || '', rarity: raw.rarity || 'common' }, null];
}

function validateAccessory(raw, known) {
  const [base, err] = commonFields(raw);
  if (err) return { error: err };
  if (!SLOTS.includes(raw.slot)) return { error: `bad slot ${q(raw.slot)}` };
  if (raw.anchor !== undefined && !ANCHORS.includes(raw.anchor)) return { error: `bad anchor ${q(raw.anchor)}` };
  if (raw.follows !== undefined && !FOLLOWS.includes(raw.follows)) return { error: `bad follows ${q(raw.follows)}` };
  const pv = raw.pivot;
  if (!Array.isArray(pv) || pv.length !== 2 || !pv.every(n => isInt(n, -16, 32))) return { error: 'pivot must be [x, y] integers in -16..32' };
  const e = checkPalette(raw.palette) || checkPixels(raw.pixels, LIMITS.itemGrid);
  if (e) return { error: e };
  const [unlock, ue] = checkUnlock(raw.unlock, known);
  if (ue) return { error: ue };
  return {
    item: {
      ...base,
      slot: raw.slot,
      anchor: raw.anchor || SLOT_ANCHOR[raw.slot],
      follows: raw.follows || SLOT_FOLLOWS[raw.slot],
      pivot: [pv[0], pv[1]],
      palette: copyPalette(raw.palette),
      pixels: [...raw.pixels],
      unlock,
    },
  };
}

function validateEffect(raw, known) {
  const [base, err] = commonFields(raw);
  if (err) return { error: err };
  if (!MOTIONS.includes(raw.motion)) return { error: `bad motion ${q(raw.motion)}` };
  if (raw.count !== undefined && !isInt(raw.count, 1, 24)) return { error: 'count must be an integer 1–24' };
  if (raw.speed !== undefined && !(typeof raw.speed === 'number' && raw.speed >= 0.25 && raw.speed <= 3)) return { error: 'speed must be 0.25–3' };
  if (!Array.isArray(raw.sprites) || raw.sprites.length < 1 || raw.sprites.length > LIMITS.spritesMax) return { error: `sprites must be 1–${LIMITS.spritesMax} entries` };
  const sprites = [];
  for (const [i, s] of raw.sprites.entries()) {
    if (!isObj(s)) return { error: `sprite ${i} must be an object` };
    const e = checkPalette(s.palette) || checkPixels(s.pixels, LIMITS.spriteGrid);
    if (e) return { error: `sprite ${i}: ${e}` };
    sprites.push({ palette: copyPalette(s.palette), pixels: [...s.pixels] });
  }
  const [unlock, ue] = checkUnlock(raw.unlock, known);
  if (ue) return { error: ue };
  return {
    item: { ...base, motion: raw.motion, count: raw.count ?? 10, speed: raw.speed ?? 1, sprites, unlock },
  };
}

function validatePackSkin(raw, known) {
  const { skin, errors } = validateSkin(raw, undefined);
  if (!skin) return { error: errors.join('; ') };
  if (raw.anchors !== undefined && !isObj(raw.anchors)) return { error: 'anchors must be an object' };
  const anchors = {};
  for (const name of ANCHORS) anchors[name] = [...DEFAULT_ANCHORS[name]];
  for (const k of Object.keys(raw.anchors || {})) {
    const v = raw.anchors[k];
    if (!ANCHORS.includes(k)) return { error: `unknown anchor ${q(k)}` };
    if (!Array.isArray(v) || v.length !== 2 || !v.every(n => isInt(n, -16, 48))) return { error: `anchor ${k} must be [x, y] integers in -16..48` };
    anchors[k] = [v[0], v[1]];
  }
  const [unlock, ue] = checkUnlock(raw.unlock, known);
  if (ue) return { error: ue };
  return { item: { ...skin, unlock, anchors } };
}

const KINDS = [
  ['accessories', 'accessory', validateAccessory],
  ['effects', 'effect', validateEffect],
  ['skins', 'skin', validatePackSkin],
];

/**
 * Validate and normalize one pack. Never throws.
 * @returns {{ pack: object|null, errors: string[], warnings: string[] }}
 */
function validatePack(json, { source = 'user', knownAchievements = new Set(), knownSeasons = new Set() } = {}) {
  const errors = [];
  const warnings = [];
  const known = { achievements: knownAchievements, seasons: knownSeasons };
  if (!isObj(json)) return { pack: null, errors: ['pack is not an object'], warnings };

  if (json.format !== FORMAT) errors.push(`unsupported format ${q(json.format)} (expected ${FORMAT})`);
  if (typeof json.id !== 'string' || !PACK_ID_RE.test(json.id)) errors.push(`bad pack id ${q(json.id)}`);
  if (!isStr(json.name, 1, 60)) errors.push('name must be 1–60 characters');
  if (!isStr(json.author, 1, 60)) errors.push('author must be 1–60 characters');
  if (typeof json.version !== 'string' || !VERSION_RE.test(json.version)) errors.push(`bad version ${q(json.version)} (use 1.2.3)`);
  if (errors.length) return { pack: null, errors, warnings };

  // Optional metadata: a bad value is dropped with a warning, the pack survives.
  let description = '';
  if (json.description !== undefined) {
    if (isStr(json.description, 0, 240)) description = json.description;
    else warnings.push('ignored description: must be at most 240 characters');
  }
  let homepage = '';
  if (json.homepage !== undefined) {
    if (isHttpsUrl(json.homepage)) homepage = json.homepage;
    else warnings.push('ignored homepage: must be an https:// URL of at most 200 characters');
  }

  const pack = {
    id: json.id, name: json.name, author: json.author, version: json.version,
    description, homepage, source,
    accessories: [], effects: [], skins: [],
  };
  const keyOf = id => (source === 'builtin' ? id : `${pack.id}/${id}`);

  for (const [field, label, check] of KINDS) {
    let list = json[field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) { warnings.push(`ignored ${field}: must be an array`); continue; }
    if (list.length > LIMITS[field]) {
      warnings.push(`only the first ${LIMITS[field]} ${field} were loaded`);
      list = list.slice(0, LIMITS[field]);
    }
    const seen = new Set();
    list.forEach((raw, i) => {
      const id = isObj(raw) ? raw.id : undefined;
      const name = typeof id === 'string' ? id : `#${i}`;
      if (typeof id !== 'string' || !ITEM_ID_RE.test(id)) { warnings.push(`skipped ${label} ${name}: bad id`); return; }
      const { item, error } = check(raw, known);
      if (error) { warnings.push(`skipped ${label} ${id}: ${error}`); return; }
      if (seen.has(id)) { warnings.push(`skipped ${label} ${id}: duplicate id (kept the first)`); return; }
      seen.add(id);
      const key = keyOf(id);
      const extra = label === 'skin' ? { id: key } : { id };
      pack[field].push({ ...item, ...extra, key, packId: pack.id, source });
    });
  }
  return { pack, errors: [], warnings };
}

function isHttpsUrl(v) {
  if (typeof v !== 'string' || v.length > 200 || !/^https:\/\/\S+$/.test(v)) return false;
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}

// Read + parse a pack file with a size cap. Returns { json } or { error }.
function readPackFile(file) {
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return { error: 'not a file' };
    if (st.size > MAX_FILE_BYTES) return { error: `file is larger than ${MAX_FILE_BYTES / 1024} KB` };
    return { json: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')) };
  } catch (e) {
    return { error: e.code === 'ENOENT' ? 'file not found' : `invalid JSON: ${e.message}` };
  }
}

function listJson(dir) {
  if (!dir) return [];
  try { return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.json')).sort(); } catch { return []; }
}

/**
 * Load the built-in pack(s) then every user pack. Missing dirs are fine.
 */
function loadCatalog({ builtinDir, userDir, knownAchievements = new Set(), knownSeasons = new Set() } = {}) {
  const accessories = new Map();
  const effects = new Map();
  const skinKeys = new Set();
  const skins = [];
  const packs = [];
  const errors = [];
  const builtinIds = new Set();
  const userIds = new Map(); // id -> file that claimed it

  for (const [dir, source] of [[builtinDir, 'builtin'], [userDir, 'user']]) {
    for (const f of listJson(dir)) {
      const file = path.join(dir, f);
      const { json, error } = readPackFile(file);
      if (error) { errors.push(`${f}: ${error}`); continue; }
      const { pack, errors: errs, warnings } = validatePack(json, { source, knownAchievements, knownSeasons });
      if (!pack) { errors.push(`${f}: ${errs.join('; ')}`); continue; }
      if (builtinIds.has(pack.id)) { errors.push(`${f}: id reserved (${pack.id})`); continue; }
      if (source === 'user' && userIds.has(pack.id)) {
        errors.push(`${f}: duplicate pack id ${pack.id} (kept ${userIds.get(pack.id)})`);
        continue;
      }
      (source === 'builtin' ? builtinIds.add(pack.id) : userIds.set(pack.id, f));

      const packWarnings = [...warnings];
      const add = (map, item, label) => {
        if (map.has(item.key)) packWarnings.push(`skipped ${label} ${item.id}: key ${item.key} already taken`);
        else map.set(item.key, item);
      };
      for (const a of pack.accessories) add(accessories, a, 'accessory');
      for (const x of pack.effects) add(effects, x, 'effect');
      for (const s of pack.skins) {
        if (skinKeys.has(s.key)) packWarnings.push(`skipped skin ${s.id}: key ${s.key} already taken`);
        else { skinKeys.add(s.key); skins.push(s); }
      }
      packs.push({
        id: pack.id, name: pack.name, author: pack.author, version: pack.version,
        description: pack.description, homepage: pack.homepage, source, file,
        counts: { accessories: pack.accessories.length, effects: pack.effects.length, skins: pack.skins.length },
        warnings: packWarnings,
      });
    }
  }
  return { accessories, effects, skins, packs, errors };
}

// Resolve `${userDir}/${id}.json`, refusing anything that would land outside userDir.
function packPath(userDir, packId) {
  if (typeof packId !== 'string' || !PACK_ID_RE.test(packId)) return null;
  const root = path.resolve(userDir);
  const dest = path.resolve(root, `${packId}.json`);
  const rel = path.relative(root, dest);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) return null;
  return dest;
}

/**
 * Validate a pack file and copy it into userDir as <id>.json.
 * opts: { knownAchievements, knownSeasons, reservedIds? } — reservedIds (e.g. the
 * built-in pack ids) are refused so an install can't be shadowed on next load.
 */
function installPack(srcPath, userDir, opts = {}) {
  const { json, error } = readPackFile(srcPath);
  if (error) return { ok: false, errors: [error], warnings: [] };
  const { pack, errors, warnings } = validatePack(json, { ...opts, source: 'user' });
  if (!pack) return { ok: false, errors, warnings };
  if (opts.reservedIds && opts.reservedIds.has(pack.id)) return { ok: false, errors: [`id reserved (${pack.id})`], warnings };
  const dest = packPath(userDir, pack.id);
  if (!dest) return { ok: false, errors: ['refusing to write outside the wardrobe folder'], warnings };
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = dest + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(json, null, 2));
    fs.renameSync(tmp, dest);
  } catch (e) {
    return { ok: false, errors: [`could not save pack: ${e.message}`], warnings };
  }
  return { ok: true, pack, errors: [], warnings, dest };
}

/** Delete `${userDir}/${packId}.json`. Returns true if a file was removed. */
function removePack(packId, userDir) {
  const file = packPath(userDir, packId);
  if (!file) return false;
  try { fs.unlinkSync(file); return true; } catch { return false; }
}

module.exports = {
  validatePack, loadCatalog, installPack, removePack,
  FORMAT, MAX_FILE_BYTES, PACK_ID_RE, ITEM_ID_RE, VERSION_RE,
  SLOTS, ANCHORS, FOLLOWS, MOTIONS, RARITIES, SLOT_ANCHOR, SLOT_FOLLOWS, DEFAULT_ANCHORS, LIMITS,
};

  };

  // ---- src/main/wardrobe/seasons.js
  defs["seasons"] = function (module, exports, require, __dirname) {
// Seasonal events. Each season is a yearly window of [month, day] dates
// (inclusive, local time) that may wrap the new year. While a season is active
// its items can be unlocked ({"unlock": {"season": "<id>"}}) and its outfit is
// suggested. Outfit values are item keys in the built-in pack.

const freeze = s => Object.freeze({ ...s, start: Object.freeze(s.start), end: Object.freeze(s.end), outfit: Object.freeze(s.outfit) });

const SEASONS = Object.freeze([
  { id: 'halloween', name: 'Spooky Season', emoji: '🎃', start: [10, 1], end: [11, 2], priority: 3, outfit: { hat: 'witch-hat', held: 'pumpkin-pail', shell: 'bat-wings', effect: 'bats' } },
  { id: 'winter', name: 'Winter Holidays', emoji: '❄️', start: [12, 1], end: [1, 7], priority: 3, outfit: { hat: 'santa-hat', neck: 'striped-scarf', held: 'candy-cane', effect: 'snow' } },
  { id: 'valentine', name: 'Valentine’s', emoji: '💘', start: [2, 7], end: [2, 15], priority: 3, outfit: { held: 'rose', effect: 'hearts' } },
  { id: 'spring', name: 'Spring', emoji: '🌱', start: [3, 20], end: [5, 31], priority: 1, outfit: { hat: 'flower-crown', shell: 'sprout' } },
  { id: 'summer', name: 'Summer', emoji: '☀️', start: [6, 21], end: [8, 31], priority: 1, outfit: { face: 'sunglasses', held: 'ice-cream', effect: 'fireflies' } },
  { id: 'autumn', name: 'Autumn', emoji: '🍂', start: [9, 15], end: [11, 30], priority: 2, outfit: { neck: 'autumn-scarf', effect: 'leaves' } },
].map(freeze));

const KNOWN_SEASONS = new Set(SEASONS.map(s => s.id));
const byId = id => SEASONS.find(s => s.id === id) || null;

// [month, day] -> comparable number, e.g. [10, 1] -> 1001
const md = ([m, d]) => m * 100 + d;
const wraps = s => md(s.start) > md(s.end);

function validDate(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
}

function inWindow(season, date) {
  const today = (date.getMonth() + 1) * 100 + date.getDate();
  const a = md(season.start);
  const b = md(season.end);
  return wraps(season) ? today >= a || today <= b : today >= a && today <= b;
}

const startIn = (season, year) => new Date(year, season.start[0] - 1, season.start[1]);

/** Is `seasonId` running on `date`? Unknown ids are never active. */
function isActive(seasonId, date = new Date()) {
  const s = byId(seasonId);
  return !!s && inWindow(s, validDate(date));
}

/** Every season running on `date`, highest priority first (ties by id). */
function activeSeasons(date = new Date()) {
  const d = validDate(date);
  return SEASONS.filter(s => inWindow(s, d))
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The one season to feature in the UI, or null. */
function featuredSeason(date = new Date()) {
  return activeSeasons(date)[0] || null;
}

/**
 * Start (local midnight) of the current window if the season is active,
 * otherwise of the next window strictly after `date`. Unknown id → null.
 */
function nextStart(seasonId, date = new Date()) {
  const s = byId(seasonId);
  if (!s) return null;
  const d = validDate(date);
  const year = d.getFullYear();
  if (inWindow(s, d)) {
    // A wrapping window seen from January started the previous year.
    const today = (d.getMonth() + 1) * 100 + d.getDate();
    return startIn(s, wraps(s) && today < md(s.start) ? year - 1 : year);
  }
  const thisYear = startIn(s, year);
  return thisYear > d ? thisYear : startIn(s, year + 1);
}

module.exports = { SEASONS, KNOWN_SEASONS, activeSeasons, featuredSeason, isActive, nextStart };

  };

  // ---- src/main/wardrobe/achievements.js
  defs["achievements"] = function (module, exports, require, __dirname) {
// Achievements: small milestones that unlock wardrobe items. Stats are a flat,
// JSON-friendly object persisted by the caller; everything here is pure, so
// recordStat returns a new object instead of mutating.
// Rewards are item keys in the built-in pack (src/wardrobe/base.pack.json).

const ACHIEVEMENTS = Object.freeze([
  { id: 'first-task', name: 'Hello, World', icon: '🐚', description: 'Finish your first task', stat: 'tasksCompleted', goal: 1, rewards: ['party-hat', 'confetti'] },
  { id: 'ten-tasks', name: 'Regular', icon: '🔨', description: 'Finish 10 tasks', stat: 'tasksCompleted', goal: 10, rewards: ['hard-hat'] },
  { id: 'quarter-century', name: 'Distinguished', icon: '🎩', description: 'Finish 25 tasks', stat: 'tasksCompleted', goal: 25, rewards: ['top-hat'] },
  { id: 'centurion', name: 'Crab Royalty', icon: '👑', description: 'Finish 100 tasks', stat: 'tasksCompleted', goal: 100, rewards: ['crown'] },
  { id: 'crew-boss', name: 'Crew Boss', icon: '⚓', description: 'Send out your first helper agent', stat: 'helpersSpawned', goal: 1, rewards: ['captains-hat'] },
  { id: 'all-hands', name: 'All Hands', icon: '🏴‍☠️', description: 'Have 3 helpers working at once', stat: 'maxCrew', goal: 3, rewards: ['pirate-bandana'] },
  { id: 'fleet', name: 'Fleet Admiral', icon: '⛵', description: 'Send out 25 helpers in total', stat: 'helpersSpawned', goal: 25, rewards: ['jolly-roger'] },
  { id: 'toolmaker', name: 'Toolmaker', icon: '🎓', description: 'Shellby learns his first new trick', stat: 'tricksLearned', goal: 1, rewards: ['grad-cap'] },
  { id: 'inventor', name: 'Inventor', icon: '🧙', description: 'Shellby learns 5 new tricks', stat: 'tricksLearned', goal: 5, rewards: ['wizard-hat'] },
  { id: 'tinkerer', name: 'Tinkerer', icon: '🔧', description: 'Approve running a script Shellby wrote', stat: 'createdScriptsRun', goal: 1, rewards: ['wrench'] },
  { id: 'clockwork', name: 'Clockwork', icon: '⏱️', description: 'Run your first routine', stat: 'routinesRun', goal: 1, rewards: ['pocket-watch'] },
  { id: 'night-owl', name: 'Night Owl', icon: '🦉', description: 'Finish a task between midnight and 5 AM', stat: 'nightTasks', goal: 1, rewards: ['nightcap'], hidden: true },
  { id: 'early-bird', name: 'Early Bird', icon: '☕', description: 'Finish a task between 5 and 8 AM', stat: 'earlyTasks', goal: 1, rewards: ['coffee-mug'], hidden: true },
  { id: 'multitasker', name: 'Multitasker', icon: '🎧', description: 'Run 3 conversations at the same time', stat: 'maxParallel', goal: 3, rewards: ['headphones'] },
  { id: 'careful', name: 'Safety First', icon: '🥽', description: 'Answer 25 permission prompts', stat: 'permissionsAnswered', goal: 25, rewards: ['safety-goggles'] },
  { id: 'planner', name: 'Master Planner', icon: '🧐', description: 'Approve a plan from Plan mode', stat: 'plansApproved', goal: 1, rewards: ['monocle'] },
  { id: 'special-delivery', name: 'Special Delivery', icon: '✈️', description: 'Drop a file on Shellby', stat: 'filesDropped', goal: 1, rewards: ['paper-plane'] },
  { id: 'loyal', name: 'Old Friends', icon: '🌈', description: 'Use Shellby on 7 different days', stat: 'activeDays', goal: 7, rewards: ['rainbow-scarf'] },
].map(a => Object.freeze({ hidden: false, ...a, rewards: Object.freeze(a.rewards) })));

const KNOWN_ACHIEVEMENTS = new Set(ACHIEVEMENTS.map(a => a.id));

const COUNTERS = [
  'tasksCompleted', 'helpersSpawned', 'maxCrew', 'tricksLearned', 'createdScriptsRun', 'routinesRun',
  'nightTasks', 'earlyTasks', 'maxParallel', 'permissionsAnswered', 'plansApproved', 'filesDropped',
];
const MAX_DAYS = 400;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Simple "+1" events.
const INCREMENTS = {
  'helper-spawned': 'helpersSpawned',
  'trick-learned': 'tricksLearned',
  'created-script-approved': 'createdScriptsRun',
  'routine-run': 'routinesRun',
  'permission-answered': 'permissionsAnswered',
  'plan-approved': 'plansApproved',
  'files-dropped': 'filesDropped',
};
// "Keep the high-water mark" events: payload { n }.
const MAXIMA = { 'crew-size': 'maxCrew', parallel: 'maxParallel' };

function emptyStats() {
  const s = {};
  for (const k of COUNTERS) s[k] = 0;
  s.activeDays = [];
  return s;
}

const count = v => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

// Deduped, sorted oldest → newest, keeping only the most recent MAX_DAYS.
function cleanDays(days) {
  if (!Array.isArray(days)) return [];
  const set = new Set(days.filter(d => typeof d === 'string' && DAY_RE.test(d)));
  return [...set].sort().slice(-MAX_DAYS);
}

/** Tolerate anything read from disk: missing, negative, NaN, wrong types. */
function normalizeStats(raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const s = emptyStats();
  for (const k of COUNTERS) s[k] = count(Object.prototype.hasOwnProperty.call(src, k) ? src[k] : 0);
  s.activeDays = cleanDays(src.activeDays);
  return s;
}

function localDay(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Apply one event. Returns a new Stats object; `stats` is never mutated. */
function recordStat(stats, event, payload = {}, now = new Date()) {
  const s = normalizeStats(stats);
  const when = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const markActive = () => { s.activeDays = cleanDays([...s.activeDays, localDay(when)]); };

  if (event === 'task-completed') {
    s.tasksCompleted += 1;
    const h = when.getHours();
    if (h < 5) s.nightTasks += 1;
    else if (h < 8) s.earlyTasks += 1;
    markActive();
  } else if (event === 'active') {
    markActive();
  } else if (Object.prototype.hasOwnProperty.call(INCREMENTS, event)) {
    s[INCREMENTS[event]] += 1;
  } else if (Object.prototype.hasOwnProperty.call(MAXIMA, event)) {
    const k = MAXIMA[event];
    s[k] = Math.max(s[k], count(payload && payload.n));
  }
  return s;
}

/** Numeric value of a stat (activeDays → number of days). */
function statValue(stats, stat) {
  if (stat === 'activeDays') return Array.isArray(stats && stats.activeDays) ? stats.activeDays.length : 0;
  return count(stats && stats[stat]);
}

/** Ids of achievements newly earned: goal met and not already in `unlocked`. */
function evaluate(stats, unlocked = new Set()) {
  return ACHIEVEMENTS.filter(a => !unlocked.has(a.id) && statValue(stats, a.stat) >= a.goal).map(a => a.id);
}

/** Display rows for the UI. Secret achievements stay secret until done. */
function progress(stats, unlocked = new Set()) {
  return ACHIEVEMENTS.map(a => {
    const value = statValue(stats, a.stat);
    const done = unlocked.has(a.id) || value >= a.goal;
    const secret = a.hidden && !done;
    return {
      id: a.id,
      name: secret ? '???' : a.name,
      description: secret ? 'A secret achievement' : a.description,
      icon: a.icon,
      current: done ? a.goal : Math.min(value, a.goal),
      goal: a.goal,
      done,
      rewards: [...a.rewards],
      hidden: a.hidden,
    };
  });
}

module.exports = {
  ACHIEVEMENTS, KNOWN_ACHIEVEMENTS, emptyStats, normalizeStats, recordStat, statValue, evaluate, progress,
};

  };

  const catalog = load('catalog');
  const seasons = load('seasons');
  const achievements = load('achievements');
  const api = {
    version: "0.4.0",
    validatePack: catalog.validatePack,
    constants: {
      FORMAT: catalog.FORMAT, MAX_FILE_BYTES: catalog.MAX_FILE_BYTES, PACK_ID_RE: catalog.PACK_ID_RE, ITEM_ID_RE: catalog.ITEM_ID_RE,
      SLOTS: catalog.SLOTS, ANCHORS: catalog.ANCHORS, FOLLOWS: catalog.FOLLOWS, MOTIONS: catalog.MOTIONS, RARITIES: catalog.RARITIES,
      SLOT_ANCHOR: catalog.SLOT_ANCHOR, SLOT_FOLLOWS: catalog.SLOT_FOLLOWS, DEFAULT_ANCHORS: catalog.DEFAULT_ANCHORS, LIMITS: catalog.LIMITS,
    },
    SEASONS: seasons.SEASONS, KNOWN_SEASONS: seasons.KNOWN_SEASONS,
    ACHIEVEMENTS: achievements.ACHIEVEMENTS, KNOWN_ACHIEVEMENTS: achievements.KNOWN_ACHIEVEMENTS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shellby = api;
})(typeof window !== 'undefined' ? window : globalThis);
