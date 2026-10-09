/* Shellby pack validator, vendored from x-salmon/shellby v0.77.0 by scripts/sync-shellby.mjs.
   Do not edit by hand. Re-run the sync script when Shellby's pack format changes. */
(function (root) {
  'use strict';
  const defs = {};
  const cache = {};
  // Node built-ins are only used by Shellby's file loaders (not by validatePack);
  // these stand-ins let the same source run in the browser.
  const builtins = {
    '#empty': {},
    '#fs': typeof require === 'function' ? require('fs') : {},
    '#path': typeof require === 'function' ? require('path') : { join: (...p) => p.join('/'), resolve: (...p) => p.join('/'), basename: p => String(p).split(/[\\/]/).pop(), dirname: p => String(p).split(/[\\/]/).slice(0, -1).join('/') },
  };
  const resolveMap = {"../skins":"skins","./seasons":"seasons","./achievements":"achievements","./dialogue":"dialogue","../voice":"voice","../scenes":"scenes","../bond":"bond","./xp":"#empty","fs":"#fs","path":"#path"};
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
  let files;
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
// ambient effects (falling snow, orbiting bats…), skins, dialogue: voices
// (a new way of talking) and scenes (see dialogue.js), and decor for his tank. The built-in pack
// ships in src/wardrobe; community packs live in %APPDATA%/Shellby/wardrobe.
//
// Packs are data only. Everything is validated strictly before it reaches the
// renderer, and validation never throws: a bad item is skipped with a warning,
// a bad pack header rejects the pack. See docs/ADDONS.md for the format.
const fs = require('fs');
const path = require('path');
const { validate: validateSkin } = require('../skins');
const { voiceContent, sceneContent } = require('./dialogue');

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

// Decor for his tank (src/main/tank.js). Pieces stand on the floor, against the
// back glass, or float in the water; substrates and backdrops are tiles the
// tank repeats. Spots are where he can do something with a piece.
const DECOR_CATEGORIES = ['structure', 'plant', 'rock', 'treasure', 'bubbler', 'substrate', 'backdrop'];
const DECOR_LAYERS = ['floor', 'back', 'float'];
const STYLE_CATEGORIES = ['substrate', 'backdrop'];
const SPOT_KINDS = ['hide', 'sit', 'climb', 'sleep', 'nibble', 'open', 'peek'];

const LIMITS = Object.freeze({
  accessories: 200, effects: 50, skins: 50, voices: 20, scenes: 60, decor: 100,
  itemGrid: 16, spriteGrid: 8, paletteMax: 16, spritesMax: 6,
  decorGrid: 32, framesMax: 3, spotsMax: 4,
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

function validateVoice(raw, known) {
  const [base, err] = commonFields(raw);
  if (err) return { error: err };
  const { content, warnings, error } = voiceContent(raw);
  if (error) return { error };
  const [unlock, ue] = checkUnlock(raw.unlock, known);
  if (ue) return { error: ue };
  return { item: { ...base, ...content, unlock }, warnings };
}

// A piece of tank decor. Frames are extra pictures of the same size, played in
// a loop at `fps` (a bubbler's bubbles, a swaying plant).
function validateDecor(raw, known) {
  const [base, err] = commonFields(raw);
  if (err) return { error: err };
  if (!DECOR_CATEGORIES.includes(raw.category)) return { error: `bad category ${q(raw.category)}` };
  const style = STYLE_CATEGORIES.includes(raw.category);
  if (raw.layer !== undefined && (style || !DECOR_LAYERS.includes(raw.layer))) return { error: style ? 'substrates and backdrops have no layer' : `bad layer ${q(raw.layer)}` };
  const e = checkPalette(raw.palette) || checkPixels(raw.pixels, LIMITS.decorGrid);
  if (e) return { error: e };
  const w = Math.max(...raw.pixels.map(r => r.length));
  if (w < 1) return { error: 'pixels must not be empty' };
  const frames = [];
  if (raw.frames !== undefined) {
    if (style || !Array.isArray(raw.frames) || raw.frames.length < 1 || raw.frames.length > LIMITS.framesMax) return { error: style ? 'substrates and backdrops have no frames' : `frames must be 1–${LIMITS.framesMax} pictures` };
    for (const [i, f] of raw.frames.entries()) {
      const fe = checkPixels(f, LIMITS.decorGrid);
      if (fe) return { error: `frame ${i}: ${fe}` };
      if (f.length !== raw.pixels.length || Math.max(...f.map(r => r.length)) > w) return { error: `frame ${i} must be the same size as pixels` };
      frames.push([...f]);
    }
  }
  if (raw.fps !== undefined && (!frames.length || !isInt(raw.fps, 1, 8))) return { error: 'fps must be an integer 1–8, with frames' };
  const spots = [];
  if (raw.spots !== undefined) {
    if (style || !Array.isArray(raw.spots) || raw.spots.length > LIMITS.spotsMax) return { error: style ? 'substrates and backdrops have no spots' : `spots must be at most ${LIMITS.spotsMax}` };
    for (const [i, s] of raw.spots.entries()) {
      if (!isObj(s) || !SPOT_KINDS.includes(s.kind)) return { error: `spot ${i}: bad kind ${q(s?.kind)}` };
      const at = s.at;
      if (!Array.isArray(at) || at.length !== 2 || !isInt(at[0], 0, w - 1) || !isInt(at[1], -LIMITS.decorGrid, raw.pixels.length - 1)) return { error: `spot ${i}: at must be [x, y] inside the piece` };
      spots.push({ kind: s.kind, at: [at[0], at[1]] });
    }
  }
  const [unlock, ue] = checkUnlock(raw.unlock, known);
  if (ue) return { error: ue };
  return {
    item: {
      ...base,
      category: raw.category,
      layer: style ? null : raw.layer || 'floor',
      palette: copyPalette(raw.palette),
      pixels: [...raw.pixels],
      frames, fps: frames.length ? raw.fps ?? 2 : 0, spots,
      unlock,
    },
  };
}

// Scenes are checked after voices, so one can name a voice from its own pack.
function validateScene(raw, known, pack) {
  const [base, err] = commonFields(raw);
  if (err) return { error: err };
  const { content, error } = sceneContent(raw, { seasons: known.seasons, voiceIds: pack.voices.map(v => v.id) });
  if (error) return { error };
  return { item: { name: base.name, description: base.description, ...content } };
}

// Voices come before scenes: see validateScene.
const KINDS = [
  ['accessories', 'accessory', validateAccessory],
  ['effects', 'effect', validateEffect],
  ['skins', 'skin', validatePackSkin],
  ['voices', 'voice', validateVoice],
  ['scenes', 'scene', validateScene],
  ['decor', 'decor', validateDecor],
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
    accessories: [], effects: [], skins: [], voices: [], scenes: [], decor: [],
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
      const { item, error, warnings: itemWarnings = [] } = check(raw, known, pack);
      if (error) { warnings.push(`skipped ${label} ${id}: ${error}`); return; }
      if (seen.has(id)) { warnings.push(`skipped ${label} ${id}: duplicate id (kept the first)`); return; }
      seen.add(id);
      warnings.push(...itemWarnings.map(w => `${label} ${id}: ${w}`));
      const key = keyOf(id);
      const extra = label === 'skin' ? { id: key } : { id };
      if (label === 'scene') extra.voice = item.voice ? keyOf(item.voice) : null;
      pack[field].push({ ...item, ...extra, key, packId: pack.id, source });
    });
  }
  return { pack, errors: [], warnings: capWarnings(warnings) };
}

// Enough to fix a pack by, without a junk one filling the Wardrobe.
const MAX_WARNINGS = 50;
const capWarnings = w => (w.length > MAX_WARNINGS ? [...w.slice(0, MAX_WARNINGS), `…and ${w.length - MAX_WARNINGS} more`] : w);

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
  const voices = new Map();
  const scenes = new Map();
  const decor = new Map();
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
      // A voice shares unlocks and "new" badges with the other items, so its key has to be theirs too.
      for (const v of pack.voices) {
        if (accessories.has(v.key) || effects.has(v.key) || skinKeys.has(v.key)) packWarnings.push(`skipped voice ${v.id}: key ${v.key} already taken`);
        else add(voices, v, 'voice');
      }
      for (const sc of pack.scenes) add(scenes, sc, 'scene');
      // Decor shares unlocks and "new" badges with the wardrobe's items too.
      for (const x of pack.decor) {
        if (accessories.has(x.key) || effects.has(x.key) || voices.has(x.key) || skinKeys.has(x.key)) packWarnings.push(`skipped decor ${x.id}: key ${x.key} already taken`);
        else add(decor, x, 'decor');
      }
      packs.push({
        id: pack.id, name: pack.name, author: pack.author, version: pack.version,
        description: pack.description, homepage: pack.homepage, source, file,
        counts: { accessories: pack.accessories.length, effects: pack.effects.length, skins: pack.skins.length, voices: pack.voices.length, scenes: pack.scenes.length, decor: pack.decor.length },
        warnings: packWarnings,
      });
    }
  }
  return { accessories, effects, skins, voices, scenes, decor, packs, errors };
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

// A removed pack waits a week in a folder beside the wardrobe's
// (userData/wardrobe-trash), so Undo can bring it back. Not inside the
// wardrobe folder, which you can open and which is read as packs.
const TRASH_DAYS = 7;
const trashDir = userDir => `${path.resolve(userDir)}-trash`;

/** Throw out what's been in the trash longer than TRASH_DAYS. Never throws. */
function emptyTrash(userDir, now = Date.now()) {
  const dir = trashDir(userDir);
  for (const f of listJson(dir)) {
    const file = path.join(dir, f);
    try { if (now - fs.statSync(file).mtimeMs > TRASH_DAYS * 864e5) fs.unlinkSync(file); } catch { /* next time */ }
  }
}

/**
 * Take `${userDir}/${packId}.json` out of the wardrobe, into the trash for a
 * week (one copy a pack id: the newest). Returns true if a file was moved.
 */
function removePack(packId, userDir, now = Date.now()) {
  const file = packPath(userDir, packId);
  if (!file) return false;
  emptyTrash(userDir, now);
  const dest = packPath(trashDir(userDir), packId);
  try {
    if (!fs.existsSync(file)) return false;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(file, dest);
    fs.utimesSync(dest, new Date(now), new Date(now)); // its week starts now, not when it was installed
    return true;
  } catch { return false; }
}

/**
 * Bring a removed pack back from the trash. Refused (false) if it's gone, or
 * a pack with its id has been installed since, which stays.
 */
function restorePack(packId, userDir) {
  const file = packPath(userDir, packId);
  const from = file && packPath(trashDir(userDir), packId);
  if (!from) return false;
  try {
    if (fs.existsSync(file) || !fs.existsSync(from)) return false;
    fs.renameSync(from, file);
    return true;
  } catch { return false; }
}

module.exports = {
  validatePack, loadCatalog, installPack, removePack, restorePack, emptyTrash, TRASH_DAYS,
  FORMAT, MAX_FILE_BYTES, PACK_ID_RE, ITEM_ID_RE, VERSION_RE,
  SLOTS, ANCHORS, FOLLOWS, MOTIONS, RARITIES, SLOT_ANCHOR, SLOT_FOLLOWS, DEFAULT_ANCHORS, LIMITS,
  DECOR_CATEGORIES, DECOR_LAYERS, STYLE_CATEGORIES, SPOT_KINDS,
};

  };

  // ---- src/main/wardrobe/seasons.js
  defs["seasons"] = function (module, exports, require, __dirname) {
// Seasonal events. Each season is a yearly window of [month, day] dates
// (inclusive, local time) that may wrap the new year. While a season is active
// its items can be unlocked ({"unlock": {"season": "<id>"}}) and its outfit is
// suggested. Outfit values are item keys from the built-in packs in src/wardrobe.
//
// The windows are written for the northern hemisphere. The ones that follow the
// weather (`nature`: spring, summer, autumn) move six months for someone south
// of the equator ({ south: true }, from the town picked for the weather; see
// weather.js); the holidays keep their dates wherever you are.

const freeze = s => Object.freeze({ ...s, start: Object.freeze(s.start), end: Object.freeze(s.end), outfit: Object.freeze(s.outfit) });

const SEASONS = Object.freeze([
  { id: 'halloween', name: 'Spooky Season', emoji: '🎃', start: [10, 1], end: [11, 2], priority: 3, outfit: { hat: 'witch-hat', held: 'pumpkin-pail', shell: 'bat-wings', effect: 'bats' } },
  { id: 'winter', name: 'Winter Holidays', emoji: '❄️', start: [12, 1], end: [1, 7], priority: 3, outfit: { hat: 'santa-hat', neck: 'striped-scarf', held: 'candy-cane', effect: 'snow' } },
  { id: 'valentine', name: 'Valentine’s', emoji: '💘', start: [2, 7], end: [2, 15], priority: 3, outfit: { hat: 'heart-antennae', face: 'blush', held: 'rose', shell: 'cupid-wings', effect: 'hearts' } },
  { id: 'spring', name: 'Spring', emoji: '🌱', start: [3, 20], end: [5, 31], priority: 1, nature: true, outfit: { hat: 'flower-crown', shell: 'sprout' } },
  { id: 'summer', name: 'Summer', emoji: '☀️', start: [6, 21], end: [8, 31], priority: 1, nature: true, outfit: { hat: 'sun-hat', face: 'beach-shades', neck: 'lei', held: 'ice-cream', effect: 'fireflies' } },
  { id: 'autumn', name: 'Autumn', emoji: '🍂', start: [9, 15], end: [11, 30], priority: 2, nature: true, outfit: { hat: 'acorn-cap', neck: 'autumn-scarf', shell: 'wheat-sheaf', effect: 'leaves' } },
].map(freeze));

const KNOWN_SEASONS = new Set(SEASONS.map(s => s.id));

// Six months on: [3, 20] -> [9, 20]. A day the new month doesn't have comes
// back to its last ([8, 31] -> [2, 28], [5, 31] -> [11, 30]), since the
// Wardrobe turns ends into real dates for its banner (service.js windowEnd).
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const halfYear = ([m, d]) => { const to = ((m + 5) % 12) + 1; return [to, Math.min(d, MONTH_DAYS[to - 1])]; };
const southern = new Map(SEASONS.filter(s => s.nature).map(s => [s.id, freeze({ ...s, start: halfYear(s.start), end: halfYear(s.end) })]));

/** The season as it falls where you are: nature seasons flip south of the equator. */
const local = (season, { south = false } = {}) => (south && southern.get(season.id)) || season;
const byId = (id, opts) => { const s = SEASONS.find(x => x.id === id); return s ? local(s, opts) : null; };

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
function isActive(seasonId, date = new Date(), opts = {}) {
  const s = byId(seasonId, opts);
  return !!s && inWindow(s, validDate(date));
}

/** Every season running on `date`, highest priority first (ties by id), with the dates where you are. */
function activeSeasons(date = new Date(), opts = {}) {
  const d = validDate(date);
  return SEASONS.map(s => local(s, opts)).filter(s => inWindow(s, d))
    .sort((a, b) => b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The one season to feature in the UI, or null. */
function featuredSeason(date = new Date(), opts = {}) {
  return activeSeasons(date, opts)[0] || null;
}

/**
 * Start (local midnight) of the current window if the season is active,
 * otherwise of the next window strictly after `date`. Unknown id → null.
 */
function nextStart(seasonId, date = new Date(), opts = {}) {
  const s = byId(seasonId, opts);
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

module.exports = { SEASONS, KNOWN_SEASONS, activeSeasons, featuredSeason, isActive, nextStart, local };

  };

  // ---- src/main/wardrobe/achievements.js
  defs["achievements"] = function (module, exports, require, __dirname) {
// Achievements: small milestones that unlock wardrobe items. Stats are a flat,
// JSON-friendly object persisted by the caller; everything here is pure, so
// recordStat returns a new object instead of mutating.
// Rewards are item keys from the built-in packs in src/wardrobe/. They must match the
// item's own `unlock: { achievement }` gate — test/packs.test.js checks both directions.

const ACHIEVEMENTS = Object.freeze([
  { id: 'first-task', name: 'Hello, World', icon: '🐚', description: 'Finish your first task', stat: 'tasksCompleted', goal: 1, rewards: ['party-hat', 'confetti'] },
  { id: 'ten-tasks', name: 'Regular', icon: '🔨', description: 'Finish 10 tasks', stat: 'tasksCompleted', goal: 10, rewards: ['hard-hat', 'keycap'] },
  { id: 'quarter-century', name: 'Distinguished', icon: '🎩', description: 'Finish 25 tasks', stat: 'tasksCompleted', goal: 25, rewards: ['top-hat', 'dog-tag'] },
  { id: 'centurion', name: 'Crab Royalty', icon: '👑', description: 'Finish 100 tasks', stat: 'tasksCompleted', goal: 100, rewards: ['crown', 'medal'] },
  { id: 'crew-boss', name: 'Crew Boss', icon: '⚓', description: 'Send out your first helper agent', stat: 'helpersSpawned', goal: 1, rewards: ['captains-hat', 'whistle'] },
  { id: 'all-hands', name: 'All Hands', icon: '🏴‍☠️', description: 'Have 3 helpers working at once', stat: 'maxCrew', goal: 3, rewards: ['pirate-bandana', 'high-vis'] },
  { id: 'fleet', name: 'Fleet Admiral', icon: '⛵', description: 'Send out 25 helpers in total', stat: 'helpersSpawned', goal: 25, rewards: ['jolly-roger', 'tiny-sail'] },
  { id: 'toolmaker', name: 'Toolmaker', icon: '🎓', description: 'Shellby learns his first new trick', stat: 'tricksLearned', goal: 1, rewards: ['grad-cap', 'book-stack'] },
  { id: 'inventor', name: 'Inventor', icon: '🧙', description: 'Shellby learns 5 new tricks', stat: 'tricksLearned', goal: 5, rewards: ['wizard-hat', 'bonsai'] },
  { id: 'tinkerer', name: 'Tinkerer', icon: '🔧', description: 'Approve running a script Shellby wrote', stat: 'createdScriptsRun', goal: 1, rewards: ['wrench', 'rubber-duck'] },
  { id: 'clockwork', name: 'Clockwork', icon: '⏱️', description: 'Run your first routine', stat: 'routinesRun', goal: 1, rewards: ['pocket-watch', 'pager'] },
  { id: 'night-owl', name: 'Night Owl', icon: '🦉', description: 'Finish a task between midnight and 5 AM', stat: 'nightTasks', goal: 1, rewards: ['nightcap', 'sleep-mask', 'starry-night'], hidden: true },
  { id: 'early-bird', name: 'Early Bird', icon: '☕', description: 'Finish a task between 5 and 8 AM', stat: 'earlyTasks', goal: 1, rewards: ['coffee-mug', 'eye-black'], hidden: true },
  { id: 'multitasker', name: 'Multitasker', icon: '🎧', description: 'Run 3 conversations at the same time', stat: 'maxParallel', goal: 3, rewards: ['headphones', 'cursors'] },
  { id: 'careful', name: 'Safety First', icon: '🥽', description: 'Answer 25 permission prompts', stat: 'permissionsAnswered', goal: 25, rewards: ['safety-goggles', 'face-shield'] },
  { id: 'planner', name: 'Master Planner', icon: '🧐', description: 'Approve a plan from Plan mode', stat: 'plansApproved', goal: 1, rewards: ['monocle', 'reading-glasses'] },
  { id: 'special-delivery', name: 'Special Delivery', icon: '✈️', description: 'Drop a file on Shellby', stat: 'filesDropped', goal: 1, rewards: ['paper-plane', 'backpack'] },
  { id: 'loyal', name: 'Old Friends', icon: '🌈', description: 'Use Shellby on 7 different days', stat: 'activeDays', goal: 7, rewards: ['rainbow-scarf', 'barnacles'] },
  { id: 'check-up', name: 'Check-Up', icon: '🩺', description: "Look at your PC's vitals in the Health view", stat: 'healthViews', goal: 1, rewards: ['stethoscope', 'scanner-visor', 'glass-thermometer'] },
  { id: 'keep-your-cool', name: 'Keep Your Cool', icon: '🧊', description: 'Shellby cools down after a heat warning', stat: 'heatCooled', goal: 1, rewards: ['sweatband', 'hand-fan', 'fire-extinguisher'], hidden: true },
  { id: 'show-off', name: 'Show-Off', icon: '📸', description: 'Share your crab card', stat: 'cardsShared', goal: 1, rewards: ['camera', 'pearls'] },
  { id: 'spring-cleaning', name: 'Spring Cleaning', icon: '🧹', description: 'Free up space after a low-disk warning', stat: 'spaceFreed', goal: 1, rewards: ['broom', 'toadstool'] },
  { id: 'good-crab', name: 'Good Crab', icon: '💕', description: 'Pet Shellby 25 times', stat: 'petsGiven', goal: 25, rewards: ['heart-shades', 'starfish'], hidden: true },
  { id: 'frequent-flyer', name: 'Frequent Flyer', icon: '🛩️', description: 'Throw Shellby across your screen', stat: 'timesThrown', goal: 1, rewards: ['aviator-cap', 'inner-tube'], hidden: true },
  { id: 'deep-focus', name: 'Deep Focus', icon: '⛑️', description: 'Finish 5 focus sessions', stat: 'focusSessions', goal: 5, rewards: ['guard-helmet', 'welding-mask', 'diver'] },
  { id: 'open-house', name: 'Open House', icon: '🏡', description: "A friend's crab drops by", stat: 'visitorsHosted', goal: 1, rewards: ['sea-glass', 'friendship-bracelet'] },
  { id: 'pen-pals', name: 'Pen Pals', icon: '💌', description: 'Wave to friends 5 times', stat: 'wavesSent', goal: 5, rewards: ['message-bottle'] },
  { id: 'green-light', name: 'Green Light', icon: '🟢', description: 'Fix a failing build on one of your pull requests', stat: 'buildsFixed', goal: 1, rewards: ['green-flag', 'lighthouse'] },
  // Up on your windows (src/main/perch.js).
  { id: 'window-sill', name: 'Window Sill', icon: '🪟', description: 'Shellby climbs up onto one of your windows', stat: 'perchesMade', goal: 1, rewards: ['spyglass'] },
  { id: 'hang-on', name: 'Hang On!', icon: '🎢', description: 'Drag a window 2,000 px with Shellby riding it', stat: 'longestRide', goal: 2000, rewards: ['racing-goggles'] },
  { id: 'rodeo', name: 'Rodeo', icon: '🤠', description: 'Shake Shellby off a window 10 times', stat: 'timesShaken', goal: 10, rewards: ['cowboy-hat'], hidden: true },
  { id: 'leap-of-faith', name: 'Leap of Faith', icon: '🪂', description: 'Shellby falls off one window and lands on another', stat: 'windowLeaps', goal: 1, rewards: ['parachute'], hidden: true },
  { id: 'trapeze', name: 'Trapeze', icon: '🎪', description: 'Throw Shellby onto a window and he catches the title bar', stat: 'windowCatches', goal: 1, rewards: ['ringmaster-collar'], hidden: true },
  // Up the edges of the screen (src/main/climb.js) and mischief (src/main/mischief.js).
  { id: 'spider-crab', name: 'Spider-Crab', icon: '🧗', description: 'Shellby climbs the side of your screen 10 times', stat: 'wallsClimbed', goal: 10, rewards: ['climbing-helmet'] },
  { id: 'sticky-feet', name: 'Sticky Feet', icon: '🦎', description: 'Throw Shellby at the edge of the screen and he sticks to it', stat: 'wallsStuck', goal: 1, rewards: ['chalk-bag'], hidden: true },
  { id: 'little-gremlin', name: 'Little Gremlin', icon: '😈', description: 'Shellby gets up to mischief 10 times', stat: 'pranksPulled', goal: 10, rewards: ['bandit-mask'], hidden: true },
  // Shell stickers (src/main/stickers.js).
  { id: 'tagged', name: 'Tagged', icon: '🏷️', description: 'Ship a project and earn its sticker', stat: 'stickersEarned', goal: 1, rewards: ['sticker-sheet'] },
  { id: 'sticker-bomb', name: 'Sticker Bomb', icon: '🎨', description: 'Ship 10 different projects', stat: 'stickersEarned', goal: 10, rewards: ['paint-can'] },
  { id: 'shiny', name: 'Shiny', icon: '✨', description: 'Ship one project often enough that its sticker goes holo', stat: 'holoStickers', goal: 1, rewards: ['holo-visor'] },
  { id: 'liftoff', name: 'Liftoff', icon: '🚀', description: 'Release version 1.0 of something', stat: 'majorReleases', goal: 1, rewards: ['rocket'] },
  { id: 'well-traveled', name: 'Well Traveled', icon: '🧳', description: 'Put stickers on 3 different shells', stat: 'stickeredShells', goal: 3, rewards: ['luggage-tag'] },
  { id: 'swap-meet', name: 'Swap Meet', icon: '🤝', description: "A visiting friend's crab leaves you one of their stickers", stat: 'friendStickers', goal: 1, rewards: ['trade-binder'] },
  // Just the two of you (src/main/life.js, gifts.js, bond.js, playtime.js). None of these need Claude.
  { id: 'beachcomber', name: 'Beachcomber', icon: '🐚', description: 'Shellby digs you up his first gift', stat: 'findsMade', goal: 1, rewards: ['sand-pail', 'pebble-floor'] },
  { id: 'magpie', name: 'Magpie', icon: '🐦', description: 'Shellby digs you up 25 gifts', stat: 'findsMade', goal: 25, rewards: ['metal-detector'] },
  { id: 'curator', name: 'Curator', icon: '🏛️', description: 'Complete a set of finds on the shelf', stat: 'setsCompleted', goal: 1, rewards: ['treasure-chest'] },
  { id: 'x-marks', name: 'X Marks the Spot', icon: '🗺️', description: 'Shellby digs up something legendary', stat: 'legendaryFinds', goal: 1, rewards: ['doubloon-medal'], hidden: true },
  { id: 'best-friends', name: 'Best Friends', icon: '💞', description: 'Become best friends with Shellby', stat: 'bondLevel', goal: 4, rewards: ['friendship-locket', 'jelly-lamp'] },
  { id: 'peekaboo', name: 'Peekaboo', icon: '🙈', description: 'Find Shellby in hide and seek', stat: 'hidesFound', goal: 1, rewards: ['leafy-disguise'] },
  { id: 'good-arm', name: 'Good Arm', icon: '🎾', description: 'Play fetch with Shellby 10 times', stat: 'fetches', goal: 10, rewards: ['tennis-ball'] },
  { id: 'player-two', name: 'Player Two', icon: '🎮', description: 'Shellby watches you finish 5 games', stat: 'gamesWatched', goal: 5, rewards: ['game-controller'], hidden: true },
  { id: 'on-air', name: 'Quiet on Set', icon: '🤫', description: 'Shellby keeps quiet through 5 calls', stat: 'callsHushed', goal: 5, rewards: ['on-air-light'], hidden: true },
  { id: 'storyteller', name: 'Little Scenes', icon: '🎭', description: 'Catch Shellby in 10 different little scenes', stat: 'scenesSeen', goal: 10, rewards: ['bubble-pipe'] },
  { id: 'gossip', name: 'Gossip', icon: '💬', description: 'Your crab chats with visiting crabs 5 times', stat: 'banters', goal: 5, rewards: ['tin-can-phone'] },
  // Snacks and naps (src/main/needs.js). Looking after him only ever adds.
  { id: 'snack-time', name: 'Snack Time', icon: '🦐', description: 'Feed Shellby his first snack', stat: 'snacksFed', goal: 1, rewards: ['snack-bowl'] },
  { id: 'well-fed', name: 'Well Fed', icon: '🍽️', description: 'Feed Shellby 100 snacks', stat: 'snacksFed', goal: 100, rewards: ['napkin-bib'] },
  { id: 'squeaky-clean', name: 'Squeaky Clean', icon: '🧼', description: 'Give Shellby 25 rinses', stat: 'rinsesGiven', goal: 25, rewards: ['bath-sponge'] },
  { id: 'night-night', name: 'Night Night', icon: '🧸', description: 'Tuck Shellby in 10 times', stat: 'tuckIns', goal: 10, rewards: ['sleepy-teddy'] },
  { id: 'golden-tummy', name: 'Golden Tummy', icon: '✨', description: 'Share a golden plankton with Shellby', stat: 'goldenSnacks', goal: 1, rewards: ['golden-spoon'], hidden: true },
  // The shipyard: the work XP already pays for (xp.js AWARDS), fed from awardXp in main.js.
  { id: 'launch-day', name: 'Launch Day', icon: '🛰️', description: 'Deploy or publish something', stat: 'deploys', goal: 1, rewards: ['mission-patch'] },
  { id: 'back-to-green', name: 'Back to Green', icon: '🧪', description: 'Turn failing tests green 10 times', stat: 'testsFixed', goal: 10, rewards: ['test-tube'] },
  { id: 'ghostbuster', name: 'Ghostbuster', icon: '👻', description: 'Fix a flaky test for good', stat: 'flakesFixed', goal: 1, rewards: ['proton-pack'], hidden: true },
  // Surprises (src/main/surprises.js): rare on purpose, so hidden until they happen.
  { id: 'critical-hit', name: 'Critical Hit', icon: '🎲', description: 'One turn takes a red test suite all the way to green, and he makes a fuss', stat: 'critHits', goal: 1, rewards: ['lucky-d20'], hidden: true },
  { id: 'natural-twenty', name: 'Natural Twenty', icon: '✨', description: 'Land 20 critical hits', stat: 'critHits', goal: 20, rewards: ['golden-d20'], hidden: true },
  { id: 'clean-landing', name: 'Clean Landing', icon: '🛬', description: 'A copy comes home with its checks green on the first try, and he makes a fuss', stat: 'cleanLandings', goal: 1, rewards: ['pilot-wings'], hidden: true },
  { id: 'issue-to-ship', name: 'Issue to Ship', icon: '🧭', description: 'Take an issue all the way to a pull request', stat: 'issuesShipped', goal: 1, rewards: ['ships-wheel'] },
  { id: 'clean-bill', name: 'Clean Bill', icon: '📋', description: 'Get a clean dependency audit', stat: 'cleanAudits', goal: 1, rewards: ['clipboard'] },
  { id: 'tidy-shell', name: 'Tidy Shell', icon: '🪶', description: 'Turn off a plugin or MCP server that sits idle', stat: 'toolsTidied', goal: 1, rewards: ['feather-duster'] },
  { id: 'fresh-start', name: 'Fresh Start', icon: '📝', description: 'Start a crowded conversation fresh with a summary', stat: 'freshStarts', goal: 1, rewards: ['fresh-page'] },
  { id: 'on-a-roll', name: 'On a Roll', icon: '🔥', description: 'Keep a 7-day streak going', stat: 'longestStreak', goal: 7, rewards: ['flame-scarf'] },
  { id: 'unstoppable', name: 'Unstoppable', icon: '☄️', description: 'Keep a 30-day streak going', stat: 'longestStreak', goal: 30, rewards: ['blazing-crest'], hidden: true },
  { id: 'double-digits', name: 'Double Digits', icon: '🪸', description: 'Reach level 10', stat: 'level', goal: 10, rewards: ['coral-laurel', 'sunken-ship'] },
  // His tank (src/main/tank.js): the most pieces it's held at once.
  { id: 'moving-in', name: 'Moving In', icon: '🪴', description: 'Put the first piece of decor in his tank', stat: 'tankPieces', goal: 1, rewards: ['sunken-chest'] },
  { id: 'interior-designer', name: 'Interior Designer', icon: '🏰', description: 'Have 15 pieces in his tank at once', stat: 'tankPieces', goal: 15, rewards: ['coral-fan'] },
  { id: 'house-guest', name: 'House Guest', icon: '🛋️', description: "A friend's crab drops by while his tank is on your calling card", stat: 'houseGuests', goal: 1, rewards: ['guest-bench'] },
  // His life in it (src/main/tank/life.js).
  { id: 'aquascaper', name: 'Aquascaper', icon: '🌿', description: 'Have 5 different plants in his tank at once', stat: 'tankPlants', goal: 5, rewards: ['anubias'] },
  { id: 'on-display', name: 'On Display', icon: '🖼️', description: 'Put 3 complete sets of finds on display in his tank', stat: 'setsShown', goal: 3, rewards: ['display-plinth'] },
  { id: 'upsized', name: 'Upsized', icon: '📦', description: 'Move him into the 30 gallon tank', stat: 'tankSize', goal: 3, rewards: ['old-anchor'] },
  { id: 'night-light', name: 'Night Light', icon: '🌙', description: 'Watch him fall asleep in his tank', stat: 'tankNaps', goal: 1, rewards: ['moon-lamp'], hidden: true },
  // The Bugdex (src/main/bugdex.js).
  { id: 'gotcha', name: 'Gotcha!', icon: '🫙', description: 'Catch your first bug for the Bugdex', stat: 'bugsCaught', goal: 1, rewards: ['bug-net', 'specimen-jar'] },
  { id: 'field-notes', name: 'Field Notes', icon: '📓', description: 'Catch 10 different kinds of bug', stat: 'bugSpecies', goal: 10, rewards: ['magnifier'] },
  { id: 'naturalist', name: 'Naturalist', icon: '🌿', description: 'Catch every bug in one habitat of the Bugdex', stat: 'habitatsDone', goal: 1, rewards: ['bug-terrarium'] },
  { id: 'fix-em-all', name: 'Field Researcher', icon: '🧢', description: 'Catch 40 different kinds of bug', stat: 'bugSpecies', goal: 40, rewards: ['trainer-cap'] }, // ids kept: earned trophies and hats stay earned
  { id: 'exterminator', name: 'Pest Control', icon: '🧯', description: 'Catch 100 bugs', stat: 'bugsCaught', goal: 100, rewards: ['bug-sprayer-pack'] },
  { id: 'golden-touch', name: 'Golden Touch', icon: '✨', description: 'Catch a golden bug', stat: 'goldenCatches', goal: 1, rewards: ['golden-net'], hidden: true },
  { id: 'ghost-whisperer', name: 'Ghost Whisperer', icon: '🏮', description: 'Catch 3 different ghosts from the wreck', stat: 'ghostSpecies', goal: 3, rewards: ['ghost-jar'] },
  { id: 'heisenberg', name: 'Uncertainty Principle', icon: '🥽', description: 'Catch a legendary bug', stat: 'legendaryBugs', goal: 1, rewards: ['quantum-goggles'], hidden: true },
  // Tide events (src/main/events.js): finish every goal while it's on. The
  // trophy is once; the medal for each year is the events' own.
  { id: 'harvest-home', name: 'Harvest Home', icon: '🌾', description: 'Finish Harvest Moon while it\'s on', stat: 'eventsHarvest', goal: 1, rewards: ['harvest-sheaf'] },
  { id: 'the-haunted', name: 'The Haunted', icon: '🎃', description: 'Finish The Haunting while it\'s on', stat: 'eventsHaunting', goal: 1, rewards: ['wisp-lantern'] },
  { id: 'snowed-in', name: 'Snowed In', icon: '❄️', description: 'Finish Frostbite while it\'s on', stat: 'eventsFrostbite', goal: 1, rewards: ['ice-castle'] },
  { id: 'pen-pals-forever', name: 'Pen Pals Forever', icon: '💌', description: 'Finish Pen Pal Week while it\'s on', stat: 'eventsPenpal', goal: 1, rewards: ['post-box'] },
  { id: 'spick-and-span', name: 'Spick and Span', icon: '🌸', description: 'Finish Spring Clean while it\'s on', stat: 'eventsSpringClean', goal: 1, rewards: ['flower-pot'] },
  { id: 'beachcombed', name: 'Beachcombed', icon: '🌊', description: 'Finish Low Tide while it\'s on', stat: 'eventsLowTide', goal: 1, rewards: ['giant-clam'] },
  { id: 'tide-turner', name: 'Tide Turner', icon: '🏅', description: 'Win 6 tide event medals', stat: 'eventMedals', goal: 6, rewards: [] },
  // Sparkly finds and bugs (gifts.js, bugdex.js).
  { id: 'glimmer', name: 'Glimmer', icon: '✨', description: 'Find your first sparkly one, find or bug', stat: 'sparkles', goal: 1, rewards: ['glitter-jar'] },
  { id: 'shiny-hunter', name: 'Shiny Hunter', icon: '🌟', description: 'Find 5 sparkly ones', stat: 'sparkles', goal: 5, rewards: ['sparkle-trail'] },
  { id: 'dazzled', name: 'Dazzled', icon: '💎', description: 'A sparkly legendary', stat: 'legendarySparkles', goal: 1, rewards: [], hidden: true },
  // Crab eggs (src/main/eggs.js) and swaps (src/main/swaps.js).
  { id: 'proud-parent', name: 'Proud Parent', icon: '🥚', description: 'A friend hatches one of your eggs', stat: 'eggsHatched', goal: 1, rewards: ['crab-nest'] },
  { id: 'big-clutch', name: 'Big Clutch', icon: '🐣', description: '5 friends hatch your eggs', stat: 'eggsHatched', goal: 5, rewards: [] },
  { id: 'hatchling', name: 'Hatchling', icon: '🍼', description: 'Hatch a friend\'s egg', stat: 'eggsFromFriends', goal: 1, rewards: ['baby-bib'] },
  { id: 'fair-trade', name: 'Fair Trade', icon: '🤝', description: 'Swap a find with a friend', stat: 'swapsMade', goal: 1, rewards: [] },
  { id: 'missing-piece', name: 'Missing Piece', icon: '🧩', description: 'Finish a set with a swap', stat: 'swapSets', goal: 1, rewards: [] },
  { id: 'top-crab', name: 'Top Crab', icon: '🥇', description: 'Top the friends\' board for a month', stat: 'boardWins', goal: 1, rewards: [] },
].map(a => Object.freeze({ hidden: false, ...a, rewards: Object.freeze(a.rewards) })));

const KNOWN_ACHIEVEMENTS = new Set(ACHIEVEMENTS.map(a => a.id));

const COUNTERS = [
  'tasksCompleted', 'helpersSpawned', 'maxCrew', 'tricksLearned', 'createdScriptsRun', 'routinesRun',
  'nightTasks', 'earlyTasks', 'maxParallel', 'permissionsAnswered', 'plansApproved', 'filesDropped',
  'healthViews', 'heatCooled', 'spaceFreed', 'cardsShared', 'petsGiven', 'timesThrown', 'focusSessions', 'buildsFixed', 'visitorsHosted', 'wavesSent',
  'perchesMade', 'timesShaken', 'windowLeaps', 'windowCatches', 'longestRide', 'wallsClimbed', 'wallsStuck', 'pranksPulled',
  'stickersEarned', 'holoStickers', 'majorReleases', 'stickeredShells', 'friendStickers',
  'findsMade', 'setsCompleted', 'legendaryFinds', 'bondLevel', 'hidesFound', 'fetches', 'gamesWatched', 'callsHushed', 'scenesSeen', 'banters',
  'snacksFed', 'rinsesGiven', 'tuckIns', 'goldenSnacks',
  'deploys', 'testsFixed', 'flakesFixed', 'issuesShipped', 'cleanAudits', 'toolsTidied', 'freshStarts', 'longestStreak', 'level',
  'tankPieces', 'houseGuests', 'tankPlants', 'setsShown', 'tankSize', 'tankNaps', 'critHits', 'cleanLandings',
  'bugsCaught', 'habitatsDone', 'legendaryBugs', 'goldenCatches', 'bugSpecies', 'ghostSpecies',
  'eventsHarvest', 'eventsHaunting', 'eventsFrostbite', 'eventsPenpal', 'eventsSpringClean', 'eventsLowTide', 'eventMedals',
  'sparkles', 'legendarySparkles', 'eggsHatched', 'eggsFromFriends', 'swapsMade', 'swapSets', 'boardWins',
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
  'health-viewed': 'healthViews',
  'health-cooled': 'heatCooled',
  'health-space-freed': 'spaceFreed',
  'card-shared': 'cardsShared',
  petted: 'petsGiven',
  thrown: 'timesThrown',
  'focus-completed': 'focusSessions',
  'ci-fixed': 'buildsFixed',
  'visitor-hosted': 'visitorsHosted',
  'house-guest': 'houseGuests',
  'tank-nap': 'tankNaps',
  'wave-sent': 'wavesSent',
  perched: 'perchesMade',
  shaken: 'timesShaken',
  'window-leap': 'windowLeaps',
  'caught-on-window': 'windowCatches',
  climbed: 'wallsClimbed',
  'stuck-to-wall': 'wallsStuck',
  pinched: 'pranksPulled',
  nudged: 'pranksPulled',
  'note-delivered': 'pranksPulled',
  'find-made': 'findsMade',
  'set-completed': 'setsCompleted',
  'legendary-find': 'legendaryFinds',
  'hide-found': 'hidesFound',
  fetched: 'fetches',
  'game-watched': 'gamesWatched',
  'call-hushed': 'callsHushed',
  banter: 'banters',
  fed: 'snacksFed',
  rinsed: 'rinsesGiven',
  tucked: 'tuckIns',
  'golden-snack': 'goldenSnacks',
  deployed: 'deploys',
  'tests-fixed': 'testsFixed',
  'flake-fixed': 'flakesFixed',
  'issue-shipped': 'issuesShipped',
  'deps-clean': 'cleanAudits',
  'toolbox-tidied': 'toolsTidied',
  'started-fresh': 'freshStarts',
  'crit-hit': 'critHits',
  'clean-landing': 'cleanLandings',
  'bug-caught': 'bugsCaught',
  'habitat-done': 'habitatsDone',
  'legendary-bug': 'legendaryBugs',
  'golden-catch': 'goldenCatches',
  // Tide events (src/main/wiring/events.js).
  'event-done-harvest': 'eventsHarvest',
  'event-done-haunting': 'eventsHaunting',
  'event-done-frostbite': 'eventsFrostbite',
  'event-done-penpal': 'eventsPenpal',
  'event-done-spring-clean': 'eventsSpringClean',
  'event-done-low-tide': 'eventsLowTide',
  'sparkle-found': 'sparkles',
  'sparkle-legendary': 'legendarySparkles',
  'egg-hatched': 'eggsHatched',
  'hatched-from-egg': 'eggsFromFriends',
  'swap-made': 'swapsMade',
  'swap-set': 'swapSets',
  'board-won': 'boardWins',
};
// "Keep the high-water mark" events: payload { n }.
const MAXIMA = {
  'crew-size': 'maxCrew', parallel: 'maxParallel', ride: 'longestRide',
  // Shell stickers (src/main/stickers.js) report their totals.
  'stickers-earned': 'stickersEarned', 'holo-stickers': 'holoStickers', 'one-point-oh': 'majorReleases', 'stickered-shells': 'stickeredShells', 'friend-stickers': 'friendStickers',
  // Bond level and the number of different scenes seen (src/main/life.js) report their totals.
  'bond-level': 'bondLevel', 'scenes-seen': 'scenesSeen',
  // The longest streak (streaks.js) and the XP level (xp.js), reported by awardXp in main.js.
  streak: 'longestStreak', level: 'level',
  // The pieces in his tank (src/main/tank.js), reported when you save it.
  'tank-pieces': 'tankPieces',
  // ...and its life (src/main/tank/life.js): plants on show, sets on display, the biggest tank (SIZES index + 1).
  'tank-plants': 'tankPlants', 'sets-shown': 'setsShown', 'tank-size': 'tankSize',
  // The Bugdex (src/main/bugdex.js) reports how many kinds of bug, and of ghost, it has caught.
  'bug-species': 'bugSpecies', 'ghost-species': 'ghostSpecies',
  // Tide event medals won, all years (src/main/events.js).
  'event-medal': 'eventMedals',
};

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

  // ---- src/main/wardrobe/dialogue.js
  defs["dialogue"] = function (module, exports, require, __dirname) {
// Dialogue in wardrobe packs: voices (a whole new way of talking: a pirate, a
// grump, another language) and scenes (little stories told in beats, like the
// ones in src/main/scenes.js).
//
// Still data only. A line is short plain text, shown with textContent. A scene
// can only name animations, props and things to hold that Shellby already
// draws. Neither can run anything, load anything or reach outside his bubble.
// catalog.js handles each item's name, rarity and unlock; this file checks
// what it says and does. Never throws. See docs/ADDONS.md.
const { OCCASIONS: VOICE_OCCASIONS, TEMPERAMENTS, MAX_LINE } = require('../voice');
const { SCENE_BITS, PROPS, HOLDS, WEARS } = require('../scenes');
const { LEVELS } = require('../bond');

const OCCASIONS = Object.freeze(Object.keys(VOICE_OCCASIONS));
// What a voice does on occasions it has no lines for: fall back to Shellby's
// own lines, or say nothing (right for another language).
const FALLBACKS = Object.freeze(['shellby', 'quiet']);
// Scene conditions that are simply on (scenes.js `fits`). bond and season take a value.
const WHEN_FLAGS = Object.freeze(['night', 'day', 'weekend', 'friday', 'monday', 'music', 'cursor', 'find']);
const WHEN_KEYS = Object.freeze([...WHEN_FLAGS, 'bond', 'season']);
const SAY_KEYS = Object.freeze(['any', ...TEMPERAMENTS]);
const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/;
// Control characters and bidi overrides have no business in a speech bubble.
// (Zero-width joiners stay: emoji sequences and some scripts need them.)
const CONTROL_RE = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;

const LIMITS = Object.freeze({
  linesPerOccasion: 20, sayChoices: 6, beats: 8,
  beatMinMs: 500, beatMaxMs: 5000, sceneMaxMs: 12000, // test/scenes.test.js holds the built-ins to the same
});

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
// Quote a value in a warning, cut short: a junk pack shouldn't fill the log.
const q = v => JSON.stringify(typeof v === 'string' && v.length > 32 ? `${v.slice(0, 32)}…` : v);
// Characters as people count them (an emoji is one), like the schema's maxLength.
const lengthOf = s => [...s].length;

/** Why a line can't go in his bubble, or null if it can. */
function lineProblem(v) {
  if (typeof v !== 'string' || !v.trim()) return 'must be text';
  if (lengthOf(v) > MAX_LINE) return `${q(v)} is longer than ${MAX_LINE} characters`;
  if (CONTROL_RE.test(v)) return `${q(v)} has a control character`;
  return null;
}

// A list of lines, keeping the good ones. Duplicates are dropped quietly.
function lineList(list, where, warnings) {
  if (!Array.isArray(list)) { warnings.push(`ignored ${where}: must be a list of lines`); return []; }
  if (list.length > LIMITS.linesPerOccasion) warnings.push(`only the first ${LIMITS.linesPerOccasion} lines of ${where} were loaded`);
  const out = [];
  for (const line of list.slice(0, LIMITS.linesPerOccasion)) {
    const bad = lineProblem(line);
    if (bad) warnings.push(`ignored a line in ${where}: ${bad}`);
    else if (!out.includes(line)) out.push(line);
  }
  return out;
}

// { occasion: [lines] } with unknown occasions and empty lists left out.
function occasionLines(obj, where, warnings) {
  const out = Object.create(null); // no prototype: keys can never reach Object.prototype
  if (!isObj(obj)) { warnings.push(`ignored ${where}: must be an object`); return out; }
  for (const k of Object.keys(obj)) {
    if (!OCCASIONS.includes(k)) { warnings.push(`ignored ${where} ${q(k)}: unknown occasion`); continue; }
    const lines = lineList(obj[k], `${where}.${k}`, warnings);
    if (lines.length) out[k] = lines;
  }
  return out;
}

/**
 * What a voice says. Returns { content: { lines, flavor, fallback, lang }, warnings } or { error }.
 * A bad line or occasion is dropped with a warning. A voice with nothing left to say is an error.
 */
function voiceContent(raw) {
  const warnings = [];
  if (raw.fallback !== undefined && !FALLBACKS.includes(raw.fallback)) return { error: `fallback must be ${FALLBACKS.join(' or ')}` };
  const lines = occasionLines(raw.lines, 'lines', warnings);
  if (!Object.keys(lines).length) return { error: 'lines needs at least one occasion with a line' };
  const flavor = Object.create(null);
  if (raw.flavor !== undefined) {
    if (!isObj(raw.flavor)) warnings.push('ignored flavor: must be an object');
    else {
      for (const t of Object.keys(raw.flavor)) {
        if (!TEMPERAMENTS.includes(t)) { warnings.push(`ignored flavor ${q(t)}: unknown temperament`); continue; }
        const extra = occasionLines(raw.flavor[t], `flavor.${t}`, warnings);
        if (Object.keys(extra).length) flavor[t] = extra;
      }
    }
  }
  let lang = '';
  if (raw.lang !== undefined) {
    if (typeof raw.lang === 'string' && LANG_RE.test(raw.lang)) lang = raw.lang;
    else warnings.push(`ignored lang ${q(raw.lang)}: use a language tag like "es" or "pt-BR"`);
  }
  return { content: { lines, flavor, fallback: raw.fallback || 'shellby', lang }, warnings };
}

// A beat's `say`: a line, a list to pick from, or { any, <temperament>: ... }.
function checkSay(say) {
  const one = v => {
    if (Array.isArray(v)) {
      if (v.length < 1 || v.length > LIMITS.sayChoices) return `a list of lines needs 1–${LIMITS.sayChoices} entries`;
      return v.map(lineProblem).find(Boolean) || null;
    }
    return lineProblem(v);
  };
  if (!isObj(say)) return one(say);
  const keys = Object.keys(say);
  if (!keys.length) return 'say needs at least one line';
  const unknown = keys.find(k => !SAY_KEYS.includes(k));
  if (unknown) return `say has unknown key ${q(unknown)} (use any, ${TEMPERAMENTS.join(', ')})`;
  return keys.map(k => one(say[k])).find(Boolean) || null;
}

const copySay = say => (Array.isArray(say) ? [...say] : isObj(say) ? Object.fromEntries(Object.keys(say).map(k => [k, copySay(say[k])])) : say);

function checkBeat(b, i) {
  if (!isObj(b)) return [null, `beat ${i} must be an object`];
  if (!SCENE_BITS.includes(b.bit)) return [null, `beat ${i}: unknown bit ${q(b.bit)}`];
  if (!Number.isInteger(b.ms) || b.ms < LIMITS.beatMinMs || b.ms > LIMITS.beatMaxMs) return [null, `beat ${i}: ms must be a whole number ${LIMITS.beatMinMs}–${LIMITS.beatMaxMs}`];
  if (b.prop !== undefined && !PROPS.includes(b.prop)) return [null, `beat ${i}: unknown prop ${q(b.prop)}`];
  if (b.hold !== undefined && !HOLDS.includes(b.hold)) return [null, `beat ${i}: unknown hold ${q(b.hold)}`];
  if (b.wear !== undefined && !WEARS.includes(b.wear)) return [null, `beat ${i}: unknown wear ${q(b.wear)}`];
  if (b.say !== undefined) {
    const bad = checkSay(b.say);
    if (bad) return [null, `beat ${i}: ${bad}`];
  }
  const beat = { bit: b.bit, ms: b.ms };
  for (const k of ['prop', 'hold', 'wear']) if (b[k] !== undefined) beat[k] = b[k];
  if (b.say !== undefined) beat.say = copySay(b.say);
  return [beat, null];
}

function checkWhen(w, seasons) {
  if (w === undefined) return [{}, null];
  if (!isObj(w)) return [null, 'when must be an object'];
  const out = {};
  for (const k of Object.keys(w)) {
    if (!WHEN_KEYS.includes(k)) return [null, `unknown condition when.${k}`];
    if (WHEN_FLAGS.includes(k)) {
      if (w[k] !== true) return [null, `when.${k} must be true`];
      out[k] = true;
    } else if (k === 'bond') {
      if (!Number.isInteger(w.bond) || w.bond < 1 || w.bond >= LEVELS.length) return [null, `when.bond must be a whole number 1–${LEVELS.length - 1}`];
      out.bond = w.bond;
    } else {
      if (typeof w.season !== 'string' || !seasons.has(w.season)) return [null, `unknown season ${q(w.season)}`];
      out.season = w.season;
    }
  }
  if (out.night && out.day) return [null, 'when.night and when.day can never both hold'];
  return [out, null];
}

/**
 * A scene's beats and when it plays. voiceIds: the voices this pack defines, so
 * a scene can belong to one ("voice": "pirate") and only play while it's worn.
 * Returns { content: { who, when, voice, beats } } or { error }.
 */
function sceneContent(raw, { seasons = new Set(), voiceIds = [] } = {}) {
  let who = [];
  if (raw.who !== undefined) {
    if (!Array.isArray(raw.who) || raw.who.some(t => !TEMPERAMENTS.includes(t))) return { error: `who must list temperaments (${TEMPERAMENTS.join(', ')})` };
    who = [...new Set(raw.who)];
  }
  const [when, we] = checkWhen(raw.when, seasons);
  if (we) return { error: we };
  let voice = null;
  if (raw.voice !== undefined) {
    if (typeof raw.voice !== 'string' || !voiceIds.includes(raw.voice)) return { error: `voice ${q(raw.voice)} isn't a voice in this pack` };
    voice = raw.voice;
  }
  if (!Array.isArray(raw.beats) || raw.beats.length < 1 || raw.beats.length > LIMITS.beats) return { error: `beats must be 1–${LIMITS.beats} entries` };
  const beats = [];
  for (const [i, b] of raw.beats.entries()) {
    const [beat, err] = checkBeat(b, i);
    if (err) return { error: err };
    beats.push(beat);
  }
  const ms = beats.reduce((n, b) => n + b.ms, 0);
  if (ms > LIMITS.sceneMaxMs) return { error: `beats add up to ${ms} ms; a scene can be at most ${LIMITS.sceneMaxMs}` };
  return { content: { who, when, voice, beats } };
}

module.exports = {
  voiceContent, sceneContent, lineProblem,
  OCCASIONS, FALLBACKS, WHEN_FLAGS, WHEN_KEYS, SAY_KEYS, LANG_RE, LIMITS,
};

  };

  // ---- src/main/voice.js
  defs["voice"] = function (module, exports, require, __dirname) {
// Shellby's voice and his little habits: the short lines he says in his bubble,
// and what he gets up to when nothing's happening. Every line is his own —
// Shellby never quotes Claude.
//
// Pure: no I/O, no clock, no randomness of its own (callers pass `now` and
// `rand`), so the whole personality is testable. See test/voice.test.js.
//
// Three rules keep him a pet instead of a nuisance:
//   1. 'quiet' says nothing at all, ever — exactly the glyph-only Shellby
//      ('work' says only what's about the work).
//   2. Every occasion has a cooldown, and a global gap sits between any two
//      lines, so he can't chatter.
//   3. He never repeats a line while another one in the pool is unused.
// A fourth rule lives in the renderer: anything that matters (a health alert, a
// red build, a countdown) outranks everything here.

const { classifyCommand } = require('./xp');

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

// How talkative he is. 'quiet' is the pre-voice Shellby, kept as a real choice.
// 'work' only speaks up about the work (WORK_OCCASIONS) and has no idle habits:
// Work mode's voice (workmode.js), and a choice of its own.
const CHATTER = Object.freeze(['quiet', 'work', 'normal', 'chatty']);
// Smallest gap between any two lines, whatever the occasion.
const GAP = Object.freeze({ quiet: Infinity, work: 40 * SECOND, normal: 40 * SECOND, chatty: 12 * SECOND });
// 'chatty' shortens every cooldown; 'normal' uses them as written.
const COOLDOWN_SCALE = Object.freeze({ quiet: Infinity, work: 1, normal: 1, chatty: 0.4 });
// What 'work' still says: a task done or failed, a new trick, a trophy's one
// line, a dev server falling over, a fix or a merge. Asking is the raised claw (see OCCASIONS),
// and a red build is the renderer's, so both show whatever he's set to.
const WORK_OCCASIONS = new Set(['success', 'error', 'learned', 'newTricks', 'unlocked', 'serverDown', 'fixed', 'merged', 'todosAll', 'jobFailed']);
// The bubble holds two short lines. Longer than this and he'd be clipped.
const MAX_LINE = 24;

/**
 * Everything he has an opinion about.
 *   every: cooldown for this occasion (ms)
 *   ttl:   how long the line stays in the bubble (ms)
 *   only:  'chatty' when the occasion is too chirpy for 'normal'
 * Deliberately absent: 'asking'. A raised claw and a '?' is a call to action,
 * and a joke in its place would only soften it.
 */
const OCCASIONS = Object.freeze({
  // --- the moods he already had, in words
  working: { every: 4 * MINUTE, ttl: 5 * SECOND },
  success: { every: 0, ttl: 6 * SECOND },
  error: { every: 0, ttl: 7 * SECOND },
  learned: { every: 0, ttl: 8 * SECOND },
  newTricks: { every: 0, ttl: 8 * SECOND }, // Claude Code updated and can do new things (claude/tricks.js)
  unlocked: { every: 0, ttl: 7 * SECOND },
  petted: { every: 20 * SECOND, ttl: 3 * SECOND },

  // --- what the work actually is (from the tool stream)
  tests: { every: 3 * MINUTE, ttl: 5 * SECOND },
  passed: { every: 2 * MINUTE, ttl: 6 * SECOND },
  fixed: { every: 2 * MINUTE, ttl: 7 * SECOND }, // red tests green again, on changed code (xp.js 'fixed')
  merged: { every: 2 * MINUTE, ttl: 7 * SECOND }, // one of your pull requests merged
  push: { every: 2 * MINUTE, ttl: 6 * SECOND },
  deploy: { every: 2 * MINUTE, ttl: 7 * SECOND },
  bigWrite: { every: 5 * MINUTE, ttl: 5 * SECOND },
  sameFile: { every: 10 * MINUTE, ttl: 6 * SECOND },
  searching: { every: 6 * MINUTE, ttl: 5 * SECOND, only: 'chatty' },
  web: { every: 6 * MINUTE, ttl: 5 * SECOND, only: 'chatty' },
  crew: { every: 4 * MINUTE, ttl: 6 * SECOND },
  longTask: { every: 8 * MINUTE, ttl: 6 * SECOND },
  serverDown: { every: 2 * MINUTE, ttl: 7 * SECOND }, // a dev server fell over (devservers/service.js)

  // --- what Claude Code does by itself (wiring/native.js)
  todoDone: { every: 90 * SECOND, ttl: 4 * SECOND },  // a to-do on Claude's own list ticked off
  todosAll: { every: 0, ttl: 6 * SECOND },            // ...and that was the last one
  jobDone: { every: MINUTE, ttl: 6 * SECOND },        // a command it left running in the background finished
  jobFailed: { every: MINUTE, ttl: 7 * SECOND },
  remembered: { every: 5 * MINUTE, ttl: 6 * SECOND }, // it wrote a memory down (auto memory)
  compacted: { every: 5 * MINUTE, ttl: 6 * SECOND }, // the conversation was compacted (/compact, or by itself)
  skillFirst: { every: 0, ttl: 7 * SECOND },          // the first time it used a skill here
  planning: { every: 5 * MINUTE, ttl: 5 * SECOND },   // it switched itself to planning

  // --- he's on your wallpaper all day; he may as well notice
  morning: { every: 20 * HOUR, ttl: 8 * SECOND },
  latenight: { every: 6 * HOUR, ttl: 8 * SECOND },
  back: { every: 20 * HOUR, ttl: 10 * SECOND },

  // --- your day, not just your code (see surroundings.js). Only ever the kind
  // of app, never what's in it.
  gameOver: { every: 30 * MINUTE, ttl: 7 * SECOND },
  callOver: { every: 20 * MINUTE, ttl: 7 * SECOND },
  sheetStretch: { every: 3 * HOUR, ttl: 7 * SECOND },
  docStretch: { every: 3 * HOUR, ttl: 7 * SECOND },
  slideStretch: { every: 3 * HOUR, ttl: 7 * SECOND },
  friday: { every: 20 * HOUR, ttl: 8 * SECOND },
  weekend: { every: 20 * HOUR, ttl: 8 * SECOND },
  monday: { every: 20 * HOUR, ttl: 8 * SECOND },
  // His tank (tank/life.js): a piece you just put in, moving day, and now and then a word about it on the desktop.
  tank: { every: 3 * HOUR, ttl: 7 * SECOND },
  tankNew: { every: 0, ttl: 6 * SECOND },

  // --- things he digs up (gifts.js) and remembers (bond.js)
  found: { every: 0, ttl: 7 * SECOND },
  memory: { every: 3 * HOUR, ttl: 8 * SECOND },
  milestone: { every: 0, ttl: 10 * SECOND },

  // --- nothing happening. Normal hears it now and then; chatty mutters more.
  idle: { every: 25 * MINUTE, ttl: 6 * SECOND },
  oops: { every: 10 * MINUTE, ttl: 4 * SECOND }, // a clumsy habit (trip, stuck)

  // --- up on your windows (see perch.js)
  perch: { every: 3 * MINUTE, ttl: 5 * SECOND },
  ride: { every: 2 * MINUTE, ttl: 4 * SECOND },
  shaken: { every: 30 * SECOND, ttl: 4 * SECOND },
  dropped: { every: 30 * SECOND, ttl: 4 * SECOND },
  dizzy: { every: MINUTE, ttl: 5 * SECOND },
  pop: { every: MINUTE, ttl: 4 * SECOND },
  caught: { every: 30 * SECOND, ttl: 5 * SECOND },

  // --- you, typing (typing.js): a burst he watched you finish
  typingBurst: { every: 10 * MINUTE, ttl: 5 * SECOND },
  typingRecord: { every: 0, ttl: 7 * SECOND },

  // --- the weather outside (weather.js remarkFor), as it turns
  rainStart: { every: 2 * HOUR, ttl: 7 * SECOND },
  snowStart: { every: 2 * HOUR, ttl: 7 * SECOND },
  stormStart: { every: 2 * HOUR, ttl: 7 * SECOND },
  rainStopped: { every: 2 * HOUR, ttl: 6 * SECOND },

  // --- up the edges of the screen (see climb.js)
  climb: { every: 3 * MINUTE, ttl: 4 * SECOND },
  stuck: { every: 30 * SECOND, ttl: 4 * SECOND },
  leap: { every: MINUTE, ttl: 4 * SECOND },
  letgo: { every: MINUTE, ttl: 4 * SECOND },

  // --- mischief, if you asked for it (see mischief.js)
  pinched: { every: 0, ttl: 3 * SECOND },
  yanked: { every: 0, ttl: 3 * SECOND },
  shoved: { every: 0, ttl: 3 * SECOND },
  noteOff: { every: MINUTE, ttl: 3 * SECOND },
  note: { every: 0, ttl: 5 * SECOND },
  behave: { every: 0, ttl: 4 * SECOND },
  noPrank: { every: 0, ttl: 3 * SECOND },

  // --- his needs (see needs.js). The needy ones are rare by design: needs.js
  // keeps 45 minutes between them on top of these.
  peckish: { every: HOUR, ttl: 5 * SECOND },
  sandy: { every: HOUR, ttl: 5 * SECOND },
  sleepy: { every: HOUR, ttl: 5 * SECOND },
  mopey: { every: HOUR, ttl: 5 * SECOND },
  fed: { every: 0, ttl: 4 * SECOND },
  stuffed: { every: 0, ttl: 4 * SECOND },
  pantryEmpty: { every: 0, ttl: 5 * SECOND },
  snackEarned: { every: 10 * MINUTE, ttl: 4 * SECOND },
  tide: { every: 0, ttl: 6 * SECOND },
  rinsed: { every: 0, ttl: 4 * SECOND },
  tuckedIn: { every: 0, ttl: 4 * SECOND },
  notSleepy: { every: 0, ttl: 4 * SECOND },
  cheered: { every: 5 * MINUTE, ttl: 4 * SECOND },
});

// His lines. Short, dry, and his own. Every pool needs at least three or the
// anti-repeat has nothing to choose from.
const LINES = Object.freeze({
  working: ['on it', 'claws out', 'digging in', 'leave it to me'],
  success: ['done!', 'nailed it', 'all yours', "that'll do"],
  error: ['uh oh', 'that broke', 'hm.', 'ow'],
  learned: ['new trick!', 'ooh, useful', 'mine now'],
  newTricks: ['claude leveled up!', 'new tricks!', 'ooh, upgrades'],
  unlocked: ['shiny!', 'for me?', 'ooh'],
  petted: ['hee', 'again?', 'mm'],
  tests: ['tests again?', 'fingers crossed', 'moment of truth'],
  passed: ['all green!', 'told you', 'green!'],
  fixed: ['fixed it!', 'red to green!', 'squashed it'],
  merged: ['merged!', 'it landed!', 'in it goes'],
  push: ['shipped it', 'off it goes', "it's out there"],
  deploy: ["it's live!", 'live!', 'launched'],
  bigWrite: ['big one', "that's a lot", 'phew'],
  sameFile: ['this file again?', 'old friend', 'third time lucky'],
  searching: ['rummaging…', 'somewhere here', 'digging…'],
  web: ['surfacing…', 'back in a tick', 'off to look'],
  crew: ['all claws in', "it's crowded", 'the lads'],
  longTask: ['still going…', 'bear with me', 'nearly'],
  serverDown: ['your server tipped over', 'server down!', 'it fell over'],
  todoDone: ['one down', 'ticked it', 'next!', 'check!'],
  todosAll: ['list done!', 'every box ticked', 'all ticked off'],
  jobDone: ['that one finished', 'background done', "it's back"],
  jobFailed: ['the background one broke', 'that one failed', 'background: ow'],
  remembered: ['noted!', "I'll remember", 'into my notebook'],
  compacted: ['packed it down', 'travelling light', 'room to think'],
  skillFirst: ['first time with that!', 'new trick in use!', 'ooh, a skill'],
  planning: ['plotting…', 'drawing a map', 'thinking it through'],
  morning: ['morning', "you're up", 'morning!'],
  latenight: ['you too?', 'late one', 'still up?'],
  back: ["you're back!", 'missed you', 'where were you?'],
  gameOver: ['gg', 'did we win?', 'good game?', 'rematch?'],
  callOver: ['phew, over', "how'd it go?", 'can I talk now?', 'shh no more'],
  sheetStretch: ['numbers again?', 'cells, cells, cells', 'spreadsheet day?', 'sum it up'],
  docStretch: ['still writing?', 'big essay?', 'word by word'],
  slideStretch: ['big presentation?', 'next slide!', 'add a crab slide'],
  friday: ['friday!', 'nearly weekend', 'home stretch'],
  tank: ['my tank is cosy', 'thinking about my tank', 'I like my tank'],
  tankNew: ['ooh, something new', 'for me?', 'my tank!'],
  weekend: ["it's the weekend", 'lazy day?', 'weekend crab'],
  monday: ['monday again', 'new week', 'need coffee'],
  found: ['found something!', 'ooh, look', 'for you!', 'treasure!'],
  memory: ['remember that?', 'good times', 'us two'],
  milestone: ['look how far!', 'what a run', 'us two!'],
  idle: ['all quiet', "tide's out", 'anything?', 'hm', 'nice day'],
  oops: ['oops', 'nobody saw that', 'meant to do that', 'ahem'],
  perch: ['nice view', 'comfy up here', 'my spot now', "what's this one?"],
  ride: ['wheee', 'steady!', 'faster!', 'whoa'],
  shaken: ['rude!', 'HEY', 'oof', 'was that needed?'],
  dropped: ['oh no', '…huh', 'where did it go?', 'not again'],
  dizzy: ['the room spins', 'whoa…', 'which way is up'],
  pop: ['boing!', 'squashed!', 'okay okay'],
  caught: ['caught it!', 'stuck the landing', 'ta-da'],
  typingBurst: ['whoa, fast', 'claws are tired', 'look at you go', 'keyboard on fire'],
  typingRecord: ['new record!', 'fastest yet!', 'personal best!'],
  rainStart: ["it's raining out", 'brolly time', 'rain! my favourite', 'hear that rain?'],
  snowStart: ["it's snowing!", 'snow!', 'hat on, then'],
  stormStart: ['thunder…', 'storm coming', 'hold the brolly'],
  rainStopped: ['rain stopped', 'dry again', 'puddles now'],
  climb: ['going up', 'hup!', 'to the top!', 'sticky feet'],
  stuck: ['stuck it!', 'sticky feet!', 'got a grip', 'splat. hi'],
  leap: ['geronimo!', 'wheee', 'catch me!'],
  letgo: ['bombs away', 'oops, let go', 'down I go'],
  pinched: ['snip!', 'mine now', 'hehe', 'gotcha'],
  yanked: ['fine, fine', 'aww', 'strong one'],
  shoved: ['hup!', 'a little to the left', 'better there', 'heave!'],
  noteOff: ['brb', 'one sec', 'got something for you'],
  note: ['for you', 'special delivery', 'read it!', 'a note!'],
  behave: ['ok… fine', 'I’ll be good', 'promise'],
  noPrank: ['nothing to pinch', 'not now', 'maybe later'],

  peckish: ["tummy's rumbling…", 'is that plankton?', 'snack o\'clock?', 'bit peckish'],
  sandy: ['bit sandy here', 'sand everywhere', 'could use a rinse'],
  sleepy: ['*yawn*', 'so sleepy…', 'nap soon?'],
  mopey: ['…', 'hey… you there?', 'bit quiet today', 'just me then'],
  fed: ['nom nom nom', 'best. snack. ever.', 'mmm, plankton', 'thank you!'],
  stuffed: ['stuffed. saving it.', "couldn't eat a thing", 'later, maybe'],
  pantryEmpty: ['no snacks left…', 'pantry\'s empty', 'later then'],
  snackEarned: ['snack!', 'ooh, plankton', 'one for later'],
  tide: ['the tide brought snacks!', 'look what washed up', 'free plankton!'],
  rinsed: ['squeaky clean!', 'so shiny', 'ahh, fresh'],
  tuckedIn: ['night night', 'just five minutes', 'g\'night'],
  notSleepy: ['not sleepy!', 'wide awake', 'maybe later'],
  cheered: ['there you are!', 'yay, you!', 'missed you'],
});

// A crab is a crab, but yours is a particular one. The temperament comes from
// the install's own seed, so it never changes on you, and it adds lines rather
// than replacing them.
const TEMPERAMENTS = Object.freeze(['chipper', 'fussy', 'cocky', 'sleepy']);
const FLAVOR = Object.freeze({
  chipper: {
    working: ['love this bit'], success: ['yay!'], error: ['we go again'],
    passed: ['knew it!'], morning: ['bright and early'], idle: ['lovely day', 'what next?'],
    ride: ['again! again!'], perch: ['hello up here!'],
    gameOver: ['you were great!'], callOver: ['nice chat?'], weekend: ['adventure day!'],
    friday: ['woo, friday!'], found: ['look look look!'], fed: ['yum yum yum!'],
  },
  fussy: {
    working: ['carefully now'], success: ['tidy'], error: ['I knew it'],
    bigWrite: ['too much'], sameFile: ['again? really?'], idle: ['dusty in here'],
    perch: ['dusty up here'], shaken: ['how undignified'], climb: ['wipe your walls'], shoved: ['crooked. fixed it'],
    sheetStretch: ['check cell B12'], gameOver: ['enough screen time'], monday: ['mondays. ugh.'],
    found: ['needs a polish'], sandy: ['this is unbearable'], rinsed: ['finally. thank you.'],
  },
  cocky: {
    working: ['watch this'], success: ['easy', 'obviously'], error: ['not my fault'],
    passed: ['never doubted it'], push: ["you're welcome"], idle: ['bored'],
    shaken: ['meant to do that'], caught: ['obviously'], pinched: ['too easy'], stuck: ['like a pro'],
    gameOver: ['I could beat that'], slideStretch: ['I should present'], found: ['you can thank me'],
    callOver: ['I was quiet. ask.'], fed: ['I deserved that'], mopey: ['fine. ignore me.'],
  },
  sleepy: {
    working: ['yawn… on it'], success: ['…done'], error: ['ugh'],
    longTask: ['so long…'], latenight: ['bedtime'], idle: ['nap time?', 'quiet…'],
    perch: ['good nap spot'], dropped: ['was asleep…'],
    weekend: ['sleep in?'], monday: ['five more minutes'], callOver: ['dozed off, sorry'],
    found: ['found it napping'], tuckedIn: ['finally…'], sleepy: ['eyes… closing…'],
  },
});

// What each temperament is like, for the places that show it (Settings, the
// Us page, his crab card). Short and in his favour.
const TEMPERAMENT_INFO = Object.freeze({
  chipper: Object.freeze({ name: 'Chipper', emoji: '🌞', blurb: 'Delighted by everything. Digs a lot and peeks at what you’re doing.' }),
  fussy: Object.freeze({ name: 'Fussy', emoji: '🧽', blurb: 'Likes things just so. Polishes his shell and notices the dust.' }),
  cocky: Object.freeze({ name: 'Cocky', emoji: '😎', blurb: 'Never wrong, never worried. Shows off and takes the credit.' }),
  sleepy: Object.freeze({ name: 'Sleepy', emoji: '💤', blurb: 'In no hurry. Stretches, flops over and naps more than most.' }),
});

// What he does with his claws when there's nothing to do. The renderer animates
// these (critter.css); strolling is the one that moves his window (motion.js).
// The small fidgets (settling his shell, a scratch, a yawn) fill the gaps
// between the bigger habits; trip and stuck are the rare clumsy ones.
const BITS = Object.freeze(['dig', 'polish', 'peek', 'stretch', 'flop', 'shuffle', 'scratch', 'yawn', 'trip', 'stuck']);
const CLUMSY_BITS = Object.freeze(['trip', 'stuck']);
const BIT_WEIGHT = Object.freeze({
  chipper: { dig: 2, polish: 1, peek: 2, stretch: 1, flop: 1, shuffle: 1, scratch: 1, yawn: 0.5, trip: 0.5, stuck: 0.5 },
  fussy: { dig: 1, polish: 3, peek: 1, stretch: 1, flop: 1, shuffle: 2, scratch: 1, yawn: 0.5, trip: 0.5, stuck: 0.5 },
  cocky: { dig: 1, polish: 2, peek: 2, stretch: 2, flop: 1, shuffle: 1, scratch: 1, yawn: 0.5, trip: 0.5, stuck: 0.5 },
  sleepy: { dig: 1, polish: 1, peek: 1, stretch: 2, flop: 3, shuffle: 1, scratch: 1, yawn: 2, trip: 0.5, stuck: 0.5 },
});

// ---------------------------------------------------------------- what the work is

// A finished shell command, scored the same way XP scores it (see xp.js), is
// the clearest signal of what just happened.
const RESULT_OCCASION = Object.freeze({ tests: 'passed', ship: 'push', deploy: 'deploy' });

const SEARCH_TOOLS = new Set(['Grep', 'Glob']);
const WEB_TOOLS = new Set(['WebFetch', 'WebSearch']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const BIG_WRITE_CHARS = 2000;   // a write this size is worth a "phew"
const SAME_FILE_AFTER = 3;      // the third visit to one file earns a remark

/**
 * What he'd remark on as a tool call starts, or null. Everything it needs is a
 * plain value the caller already has, so this knows nothing about tool inputs:
 *   command: the shell command, for a Bash/PowerShell call
 *   chars:   how much a write tool is writing (stream.js writeChars)
 *   touches: times this conversation has now written to that same file
 */
function occasionForTool(name, { command = '', chars = 0, touches = 0 } = {}) {
  if (typeof name !== 'string') return null;
  if (chars > 0) {
    if (touches >= SAME_FILE_AFTER) return 'sameFile';
    if (chars >= BIG_WRITE_CHARS) return 'bigWrite';
    return null;
  }
  if (SHELL_TOOLS.has(name)) return classifyCommand(command) === 'tests' ? 'tests' : null;
  if (SEARCH_TOOLS.has(name)) return 'searching';
  if (WEB_TOOLS.has(name)) return 'web';
  return null;
}

/** What a successfully finished command was: 'tests' | 'ship' | 'deploy' -> occasion. */
const occasionForCommand = kind => RESULT_OCCASION[kind] || null;

const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

/** Tolerate anything read from disk. */
function normalize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const said = {};
  for (const [k, at] of Object.entries(src.said && typeof src.said === 'object' ? src.said : {})) {
    if (OCCASIONS[k] && Number.isFinite(at)) said[k] = at;
  }
  const recent = {};
  for (const [k, list] of Object.entries(src.recent && typeof src.recent === 'object' ? src.recent : {})) {
    if (OCCASIONS[k] && Array.isArray(list)) recent[k] = list.filter(Number.isInteger).slice(-8);
  }
  return {
    seed: typeof src.seed === 'string' && src.seed ? src.seed.slice(0, 64) : null,
    lastRunAt: Number.isFinite(src.lastRunAt) ? src.lastRunAt : null,
    lastSpokeAt: num(src.lastSpokeAt, 0),
    said, recent,
  };
}

/** The chattiness setting, tolerating anything. */
const chatterOf = v => (CHATTER.includes(v) ? v : 'normal');
// Scenes, digging, idle mutters and the rest of his own little life: only at
// 'normal' and 'chatty'.
const hasHabits = v => ['normal', 'chatty'].includes(chatterOf(v));

/** Your crab's temperament: stable for a given seed, so it's always the same crab. */
function temperamentOf(seed) {
  if (typeof seed !== 'string' || !seed) return TEMPERAMENTS[0];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return TEMPERAMENTS[(h >>> 0) % TEMPERAMENTS.length];
}

// A voice from a wardrobe pack ({ lines, flavor, fallback }, see
// wardrobe/dialogue.js) speaks for every occasion it has lines for.
const voiceCovers = (worn, occasion, temperament) => !!(worn?.lines?.[occasion] || worn?.flavor?.[temperament]?.[occasion]);

/**
 * Base lines plus the temperament's own, for one occasion. With a pack voice on
 * (`worn`), its lines instead. On occasions it has no lines for, his own lines
 * come back, or none at all with fallback 'quiet'.
 */
function poolFor(occasion, temperament, worn = null) {
  if (worn && voiceCovers(worn, occasion, temperament)) {
    return [...(worn.lines[occasion] || []), ...(worn.flavor?.[temperament]?.[occasion] || [])];
  }
  if (worn?.fallback === 'quiet') return [];
  const base = LINES[occasion] || [];
  const extra = FLAVOR[temperament]?.[occasion] || [];
  return [...base, ...extra];
}

/**
 * The line he says for `occasion`, or null when he should keep it to himself.
 * Returns { text, occasion, until, state } — `state` is a new voice state to
 * persist; the old one is never mutated.
 *   opts: { chatter, rand, force, text } — force skips the cooldowns (a level-up
 *   shouldn't lose its line because he said something 30 seconds ago). `text`
 *   is a line made elsewhere (a memory, a milestone) that still has to pass
 *   every rule here; it must fit the bubble. `voice` is the pack voice he's
 *   wearing, if any (see poolFor). With fallback 'quiet' its own line replaces
 *   `text`, or he keeps quiet.
 */
function say(stateIn, occasion, now, { chatter = 'normal', rand = Math.random, force = false, text: textIn = null, voice: worn = null } = {}) {
  const state = normalize(stateIn);
  const level = chatterOf(chatter);
  const rule = OCCASIONS[occasion];
  if (!rule || level === 'quiet') return null;
  if (rule.only === 'chatty' && level !== 'chatty') return null;
  if (level === 'work' && !WORK_OCCASIONS.has(occasion)) return null;
  const t = num(now, NaN);
  if (!Number.isFinite(t)) return null;
  if (!force) {
    if (t - state.lastSpokeAt < GAP[level]) return null;
    const last = state.said[occasion];
    if (last != null && t - last < rule.every * COOLDOWN_SCALE[level]) return null;
  }
  const temperament = temperamentOf(state.seed);
  // A line made elsewhere carries something real (which memory, which find, how
  // many days), so a character voice lets it through. A quiet voice is another
  // language: it says its own line for the occasion, or nothing.
  let text = textIn;
  if (text != null && worn?.fallback === 'quiet') {
    if (!voiceCovers(worn, occasion, temperament)) return null;
    text = null;
  }
  if (text != null) {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_LINE) return null;
    return {
      text, occasion, until: t + rule.ttl,
      state: { ...state, lastSpokeAt: t, said: { ...state.said, [occasion]: t } },
    };
  }
  const pool = poolFor(occasion, temperament, worn);
  if (!pool.length) return null;
  // Don't repeat a line while another one in the pool is still unused.
  const seen = new Set(state.recent[occasion] || []);
  let choices = pool.map((_, i) => i).filter(i => !seen.has(i));
  if (!choices.length) choices = pool.map((_, i) => i);
  const index = choices[Math.min(choices.length - 1, Math.floor(rand() * choices.length))];
  return {
    text: pool[index],
    occasion,
    until: t + rule.ttl,
    state: {
      ...state,
      lastSpokeAt: t,
      said: { ...state.said, [occasion]: t },
      recent: { ...state.recent, [occasion]: [...(state.recent[occasion] || []), index].slice(-Math.ceil(pool.length / 2)) },
    },
  };
}

/** 'morning' first thing, 'latenight' in the small hours, else null. */
function timeOccasion(now, hour = new Date(num(now, 0)).getHours()) {
  if (hour >= 5 && hour < 10) return 'morning';
  if (hour >= 1 && hour < 5) return 'latenight';
  return null;
}

/** 'back' when Shellby last ran days ago, else null. */
function absenceOccasion(lastRunAt, now, days = 3) {
  if (!Number.isFinite(lastRunAt) || !Number.isFinite(now)) return null;
  return now - lastRunAt >= days * 24 * HOUR ? 'back' : null;
}

/** One idle habit, weighted by temperament. */
function pickBit(seed, rand = Math.random) {
  const weights = BIT_WEIGHT[temperamentOf(seed)];
  const total = BITS.reduce((n, b) => n + weights[b], 0);
  let r = rand() * total;
  for (const b of BITS) { r -= weights[b]; if (r < 0) return b; }
  return BITS[0];
}

module.exports = {
  CHATTER, WORK_OCCASIONS, OCCASIONS, LINES, FLAVOR, TEMPERAMENTS, TEMPERAMENT_INFO, BITS, CLUMSY_BITS, MAX_LINE, GAP, SAME_FILE_AFTER,
  normalize, chatterOf, hasHabits, temperamentOf, poolFor, voiceCovers, say, timeOccasion, absenceOccasion, pickBit,
  occasionForTool, occasionForCommand,
};

  };

  // ---- src/main/scenes.js
  defs["scenes"] = function (module, exports, require, __dirname) {
// Little scenes: a few beats strung together instead of a single habit. He
// squints at your cursor, creeps up on it, pounces, misses, and says he meant
// to. He builds a sandcastle and watches it crumble. He gets the hiccups.
//
// A scene is a list of beats; each beat is one animation (a `bit`, drawn by a
// body class in critter.css), maybe a prop beside him, maybe something in his
// claw or on his face, and maybe a line. Lines can differ by temperament.
// Pure: picking and resolving take `rand`; src/main/life.js plays them.
// See test/scenes.test.js.

const MAX_LINE = 24; // voice.js MAX_LINE

// Props the renderer knows how to draw (src/renderer/critter/life.js).
const PROPS = Object.freeze(['castle', 'castle-fall', 'bubbles', 'fly', 'shooting-star', 'juggle', 'heart', 'achoo', 'zz', 'notes', 'sweat']);
// Things he can hold or wear for a scene. 'find' is his favourite find (gifts.js).
const HOLDS = Object.freeze(['find', 'coffee', 'pebble', 'mic']);
const WEARS = Object.freeze(['shades']);
// Animations the scenes use, beyond his everyday habits (voice.js BITS).
const SCENE_BITS = Object.freeze([
  'dig', 'polish', 'peek', 'stretch', 'flop', 'squint', 'creep', 'pounce', 'nose', 'sneeze', 'sniff', 'hic', 'hold',
  'blow', 'nod', 'jolt', 'curl', 'admire', 'rock', 'bow', 'swat', 'jab', 'gaze', 'juggle', 'bonk', 'present', 'lean',
  'sip', 'boogie', 'hide', 'boo', 'shiver', 'wave', 'count',
]);

const T = ['chipper', 'fussy', 'cocky', 'sleepy'];

/*
 * who:   temperaments it suits (they're three times likelier to get it); all can.
 * when:  conditions, all of which must hold:
 *   night / day / weekend / friday / monday, music (something's playing),
 *   bond (at least this level, bond.js), find (has a favourite find),
 *   cursor (the pointer is near him), season ('halloween' ...)
 * beats: { bit, ms, say?, prop?, hold?, wear? } — `say` is a line, a list to
 *   pick from, or { any, <temperament>: ... }.
 */
const SCENES = Object.freeze([
  {
    id: 'pounce', name: 'Pounces on your cursor', who: ['chipper', 'cocky'], when: { cursor: true },
    beats: [
      { bit: 'squint', ms: 1400, say: '…' },
      { bit: 'creep', ms: 1600 },
      { bit: 'pounce', ms: 650, say: { any: 'GOT IT', sleepy: 'hup' } },
      { bit: 'flop', ms: 1300, say: { any: 'meant to do that', fussy: 'how undignified', sleepy: 'too fast', chipper: 'next time!' } },
    ],
  },
  {
    id: 'sneeze', name: 'Sneezes', beats: [
      { bit: 'nose', ms: 1000, say: 'a-' },
      { bit: 'nose', ms: 1000, say: 'a-a-' },
      { bit: 'sneeze', ms: 750, say: 'ACHOO!', prop: 'achoo' },
      { bit: 'sniff', ms: 1500, say: { any: "'scuse me", fussy: 'sand. everywhere.', cocky: 'bless me', sleepy: 'woke myself up' } },
    ],
  },
  {
    id: 'hiccups', name: 'Gets the hiccups', beats: [
      { bit: 'hic', ms: 900, say: 'hic!' },
      { bit: 'hic', ms: 900, say: 'hic!' },
      { bit: 'hold', ms: 2200, say: 'holding breath…' },
      { bit: 'admire', ms: 1100, say: 'gone!' },
      { bit: 'hic', ms: 900, say: '…hic!' },
    ],
  },
  {
    id: 'bubbles', name: 'Blows bubbles', who: ['chipper', 'sleepy'], beats: [
      { bit: 'blow', ms: 2800, prop: 'bubbles', say: 'blub' },
      { bit: 'gaze', ms: 1800, say: { any: 'pretty', cocky: 'best ones yet', fussy: 'one popped early' } },
    ],
  },
  {
    id: 'nodoff', name: 'Nods off', who: ['sleepy'], beats: [
      { bit: 'nod', ms: 1800, prop: 'zz', say: 'zz…' },
      { bit: 'nod', ms: 1800, prop: 'zz' },
      { bit: 'jolt', ms: 800, say: { any: "wasn't asleep!", sleepy: 'five more minutes', cocky: 'resting my eyes' } },
    ],
  },
  {
    id: 'workout', name: 'Works out', who: ['chipper', 'cocky'], when: { day: true }, beats: [
      { bit: 'curl', ms: 1300, say: 'one…' },
      { bit: 'curl', ms: 1300, say: 'two…' },
      { bit: 'curl', ms: 1500, say: '…three', prop: 'sweat' },
      { bit: 'flop', ms: 1600, say: { any: 'enough for today', cocky: 'feel the burn', chipper: 'so strong!' } },
    ],
  },
  {
    id: 'castle', name: 'Builds a sandcastle', beats: [
      { bit: 'dig', ms: 1800, say: { any: 'building…', fussy: 'precisely…' } },
      { bit: 'admire', ms: 2000, prop: 'castle', say: { any: 'masterpiece', cocky: 'nailed it', chipper: 'my castle!' } },
      { bit: 'squint', ms: 1000, prop: 'castle-fall' },
      { bit: 'flop', ms: 1500, say: { any: '…my castle', fussy: 'the foundations!', sleepy: 'oh well', cocky: 'it was a draft' } },
    ],
  },
  {
    id: 'mirror', name: 'Admires his shell', who: ['cocky', 'fussy'], beats: [
      { bit: 'polish', ms: 1800 },
      { bit: 'admire', ms: 1900, say: { any: 'looking good', fussy: 'one smudge…', sleepy: 'good enough' } },
      { bit: 'polish', ms: 1400, say: { any: 'there.', cocky: 'perfect. as usual.' } },
    ],
  },
  {
    id: 'airguitar', name: 'Plays air guitar', who: ['cocky', 'chipper'], when: { music: true }, beats: [
      { bit: 'rock', ms: 2600, prop: 'notes', say: '♪ shred ♪' },
      { bit: 'rock', ms: 1800, prop: 'notes' },
      { bit: 'bow', ms: 1100, say: { any: 'thank you!', cocky: "I'm here all week", sleepy: 'encore later' } },
    ],
  },
  {
    id: 'fly', name: 'Swats at a fly', beats: [
      { bit: 'squint', ms: 1400, prop: 'fly', say: 'bzz?' },
      { bit: 'swat', ms: 900, prop: 'fly' },
      { bit: 'swat', ms: 900, prop: 'fly', say: { any: 'get lost', chipper: 'come back!', fussy: 'shoo. SHOO.' } },
      { bit: 'squint', ms: 1300, say: '…' },
    ],
  },
  {
    id: 'counting', name: 'Counts grains of sand', who: ['fussy'], beats: [
      { bit: 'count', ms: 1700, say: '4,817…' },
      { bit: 'count', ms: 1700, say: '4,818…' },
      { bit: 'jolt', ms: 900, say: { any: 'lost count', fussy: 'start again.' } },
    ],
  },
  {
    id: 'shadowbox', name: 'Shadow-boxes', who: ['cocky'], beats: [
      { bit: 'jab', ms: 1600, say: 'float like a…' },
      { bit: 'jab', ms: 1300 },
      { bit: 'admire', ms: 1400, say: '…crab' },
    ],
  },
  {
    id: 'stargaze', name: 'Watches the stars', when: { night: true }, beats: [
      { bit: 'gaze', ms: 2600, say: { any: 'so many stars', sleepy: 'pretty… yawn' } },
      { bit: 'gaze', ms: 1600, prop: 'shooting-star', say: 'a wish!' },
      { bit: 'admire', ms: 1500, say: { any: "won't tell you", chipper: 'wished for you!' } },
    ],
  },
  {
    id: 'sunbathe', name: 'Sunbathes', when: { weekend: true, day: true }, beats: [
      { bit: 'stretch', ms: 1300, wear: 'shades' },
      { bit: 'flop', ms: 3200, wear: 'shades', say: { any: 'this is the life', fussy: 'SPF 50, obviously' } },
      { bit: 'flop', ms: 2000, wear: 'shades' },
    ],
  },
  {
    id: 'juggle', name: 'Juggles pebbles', who: ['chipper', 'cocky'], beats: [
      { bit: 'juggle', ms: 2800, prop: 'juggle', say: 'hup hup hup' },
      { bit: 'bonk', ms: 900, say: 'ow' },
      { bit: 'sniff', ms: 1200, say: { any: 'nobody saw that', chipper: 'again!' } },
    ],
  },
  {
    id: 'coffee', name: 'Needs his coffee', when: { monday: true }, beats: [
      { bit: 'sip', ms: 1700, hold: 'coffee', say: 'monday…' },
      { bit: 'sip', ms: 1700, hold: 'coffee' },
      { bit: 'stretch', ms: 1300, hold: 'coffee', say: 'better.' },
    ],
  },
  {
    id: 'friday', name: 'Friday boogie', when: { friday: true }, beats: [
      { bit: 'boogie', ms: 2600, prop: 'notes', say: 'friday!' },
      { bit: 'boogie', ms: 2000, prop: 'notes', say: { any: 'weekend soon', fussy: 'tidy desk first' } },
    ],
  },
  {
    id: 'showfind', name: 'Shows off his favourite find', when: { bond: 2, find: true }, beats: [
      { bit: 'present', ms: 2200, hold: 'find', say: { any: 'my favourite', cocky: 'my treasure', fussy: 'polished it' } },
      { bit: 'polish', ms: 1500, hold: 'find' },
      { bit: 'admire', ms: 1300, hold: 'find', say: '…mine' },
    ],
  },
  {
    id: 'heart', name: 'Draws you a heart', when: { bond: 3 }, beats: [
      { bit: 'dig', ms: 1800 },
      { bit: 'admire', ms: 2600, prop: 'heart', say: { any: 'for you', cocky: "don't make it weird", sleepy: 'for you… zz' } },
    ],
  },
  {
    id: 'snuggle', name: 'Leans on your cursor', when: { bond: 4, cursor: true }, beats: [
      { bit: 'lean', ms: 2800, say: '♥' },
      { bit: 'lean', ms: 2000 },
    ],
  },
  {
    id: 'karaoke', name: 'Sings karaoke', who: ['chipper'], when: { music: true }, beats: [
      { bit: 'rock', ms: 2400, hold: 'mic', prop: 'notes', say: '♪ la la la ♪' },
      { bit: 'bow', ms: 1200, hold: 'mic', say: 'thank you!' },
    ],
  },
  {
    id: 'boo', name: 'Tries to scare you', when: { season: 'halloween' }, beats: [
      { bit: 'hide', ms: 1700, say: '…' },
      { bit: 'boo', ms: 800, say: 'BOO!' },
      { bit: 'admire', ms: 1300, say: { any: 'scared you?', fussy: 'very spooky' } },
    ],
  },
  {
    id: 'shiver', name: 'Shivers', when: { season: 'winter' }, beats: [
      { bit: 'shiver', ms: 2400, say: 'brrr' },
      { bit: 'stretch', ms: 1300, say: { any: 'cosy now', sleepy: 'hibernate?' } },
    ],
  },
  {
    id: 'wave', name: 'Waves at you', when: { cursor: true, bond: 1 }, beats: [
      { bit: 'wave', ms: 1800, say: { any: 'hi!', fussy: 'hello.', sleepy: 'oh, hi', cocky: 'hey you' } },
    ],
  },
].map(s => Object.freeze({ who: [], when: {}, ...s, beats: Object.freeze(s.beats.map(Object.freeze)) })));

/** Does a scene's `when` hold in this moment? */
function fits(scene, ctx = {}) {
  const w = scene.when;
  const hour = Number.isFinite(ctx.hour) ? ctx.hour : 12;
  const night = hour >= 21 || hour < 5;
  if (w.night && !night) return false;
  if (w.day && night) return false;
  if (w.weekend && !(ctx.weekday === 0 || ctx.weekday === 6)) return false;
  if (w.friday && ctx.dayOccasion !== 'friday') return false;
  if (w.monday && ctx.dayOccasion !== 'monday') return false;
  if (w.music && !ctx.music) return false;
  if (w.cursor && !ctx.cursorNear) return false;
  if (w.find && !ctx.hasFind) return false;
  if (w.bond && !((ctx.bond || 0) >= w.bond)) return false;
  if (w.season && !(ctx.seasons || []).includes(w.season)) return false;
  return true;
}

/**
 * Which scene next, or null. Ones that suit his temperament come up more; the
 * last few he did are left out so he doesn't loop.
 *   ctx: { temperament, hour, weekday, dayOccasion, music, cursorNear, hasFind, bond, seasons }
 *   scenes: the ones to choose from: his own, plus any from wardrobe packs.
 */
function pickScene(ctx = {}, recent = [], rand = Math.random, scenes = SCENES) {
  const pool = scenes.filter(s => fits(s, ctx) && !recent.includes(s.id));
  if (!pool.length) return null;
  // However many packs are installed, pack scenes together come up no more
  // often than his own do: they add to his repertoire, they don't replace it.
  const own = pool.filter(s => SCENES.includes(s)).length;
  const extra = pool.length - own;
  const packShare = extra > own && own ? own / extra : 1;
  // Scenes that only happen at a particular moment are the special ones: give them a lift.
  const weight = s => (s.who.includes(ctx.temperament) ? 3 : 1) * (Object.keys(s.when).length ? 1.6 : 1) * (SCENES.includes(s) ? 1 : packShare);
  const sum = pool.reduce((n, s) => n + weight(s), 0);
  let r = rand() * sum;
  for (const s of pool) { r -= weight(s); if (r < 0) return s; }
  return pool[pool.length - 1];
}

/** A line for this temperament from a beat's `say`. */
function lineFor(say, temperament, rand = Math.random) {
  if (say == null) return null;
  let v = say;
  if (typeof v === 'object' && !Array.isArray(v)) v = v[temperament] ?? v.any;
  if (Array.isArray(v)) v = v[Math.min(v.length - 1, Math.floor(rand() * v.length))];
  return typeof v === 'string' && [...v].length <= MAX_LINE ? v : null;
}

/**
 * The scene's beats with every line settled for this crab: [{ bit, ms, say, prop, hold, wear }].
 * silent: play it without words (he's wearing a pack voice in another language,
 * and this scene wasn't written for it).
 */
function resolve(scene, temperament, rand = Math.random, { silent = false } = {}) {
  if (!scene) return [];
  return scene.beats.map(b => ({
    bit: b.bit, ms: b.ms, say: silent ? null : lineFor(b.say, temperament, rand), prop: b.prop || null, hold: b.hold || null, wear: b.wear || null,
  }));
}

/**
 * Which scenes he can do in a voice: his own and every pack scene written for
 * anyone, plus the ones written for the voice he's wearing. Returns the list
 * and whether a scene should play silent.
 *   packScenes: [{ id, voice, who, when, beats }] (voice: a voice key or null)
 *   worn: { key, fallback } or null
 */
function inVoice(packScenes = [], worn = null) {
  const key = worn?.key || null;
  const list = [...SCENES, ...packScenes.filter(s => !s.voice || s.voice === key)];
  const silent = s => !!worn && worn.fallback === 'quiet' && s.voice !== key;
  return { list, silent };
}

/** How long it runs, start to finish. */
const lengthOf = beats => beats.reduce((n, b) => n + b.ms, 0);

module.exports = { SCENES, PROPS, HOLDS, WEARS, SCENE_BITS, TEMPERAMENTS: T, fits, pickScene, lineFor, resolve, inVoice, lengthOf };

  };

  // ---- src/main/bond.js
  defs["bond"] = function (module, exports, require, __dirname) {
// He remembers you. A bond that grows with petting, playing and days spent
// together (it never shrinks: he can get peckish or a bit mopey, see needs.js,
// but that never costs a single point here), a
// journal of the moments worth keeping ("You shook me off Chrome"), the days
// worth marking (100 days together, his hatch day, your birthday if you tell
// him), and the odd line that brings one of them back up.
//
// Pure: no I/O, no clock, no randomness of its own (callers pass `now` and
// `rand`). src/main/life.js keeps it; see test/bond.test.js.

const DAY = 24 * 60 * 60 * 1000;

const LEVELS = Object.freeze([
  { at: 0, name: 'New friends', icon: '🥚' },
  { at: 25, name: 'Pals', icon: '🐚' },
  { at: 100, name: 'Buddies', icon: '🦀' },
  { at: 260, name: 'Close friends', icon: '💛' },
  { at: 600, name: 'Best friends', icon: '💞' },
  { at: 1300, name: 'Inseparable', icon: '🌟' },
].map(Object.freeze));

// What each level opens up. src/main/scenes.js and life.js check `bond` levels
// against the same numbers.
const UNLOCKS = Object.freeze([
  { level: 1, text: 'He starts bringing up things you did together.' },
  { level: 2, text: 'He shows off his favourite find, and asks to play hide and seek.' },
  { level: 3, text: 'He draws you hearts in the sand.' },
  { level: 4, text: 'He leans on your cursor for a cuddle. (And a trophy.)' },
  { level: 5, text: 'Golden hearts when you pet him.' },
].map(Object.freeze));

// How a bond grows. `perDay` caps the ones you could otherwise farm.
const EARN = Object.freeze({
  day: { points: 5 },                    // another day together (also counts the days)
  pet: { points: 1, perDay: 10 },
  play: { points: 3, perDay: 4 },        // hide and seek, fetch
  ride: { points: 1, perDay: 3 },        // riding a window you drag
  find: { points: 1, perDay: 5 },        // a gift he dug up for you
  visit: { points: 3, perDay: 2 },       // a friend's crab dropped by
  banter: { points: 1, perDay: 3 },
  feed: { points: 1, perDay: 3 },        // a snack (needs.js)
  care: { points: 1, perDay: 2 },        // a rinse or a tuck-in
});

const DAY_MILESTONES = Object.freeze([7, 30, 50, 100, 200, 365, 500, 730, 1000]);
const JOURNAL_MAX = 200;                 // repeatable moments kept; firsts are never let go
const RECALL_AFTER = 2 * DAY;            // a memory has to be a couple of days old to bring up
const MAX_LINE = 24;                     // voice.js MAX_LINE

const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const pos = v => (Number.isFinite(v) && v > 0 ? v : 0);
const clip = (s, n = 80) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n) : '');

// ---------------------------------------------------------------- the journal
// Each kind of memory: how it reads on the Us page, and whether only the first
// one counts. `data` carries the few plain values the text needs.
const MEMORIES = Object.freeze({
  hatched: { first: true, icon: '🥚', text: () => 'Moved onto your desktop' },
  'first-pet': { first: true, icon: '♥', text: () => 'His first pet' },
  'first-throw': { first: true, icon: '🛩️', text: () => 'You threw him across the screen' },
  'first-perch': { first: true, icon: '🧗', text: d => `Climbed onto ${d.app || 'a window'} for the first time` },
  shaken: { icon: '🤠', text: d => `You shook him off ${d.app || 'a window'}` },
  'big-ride': { icon: '🎢', text: d => `Rode ${d.app || 'a window'} ${Math.round(d.px || 0).toLocaleString('en-US')} px` },
  'first-find': { first: true, icon: '🐚', text: d => `Dug up his first find: ${d.item || 'something'}` },
  'rare-find': { icon: '✨', text: d => `Found ${d.item || 'something rare'}` },
  'set-done': { icon: '🏆', text: d => `Finished the ${d.set || ''} set` },
  visitor: { icon: '🏡', text: d => `@${d.login}'s crab came to visit` },
  game: { icon: '🎮', text: d => (d.app ? `Watched you play ${d.app}` : 'Watched you play a game') },
  'first-call': { first: true, icon: '🤫', text: () => 'Kept quiet through your first call' },
  'hide-found': { icon: '🙈', text: d => `You found him in hide and seek in ${fmtTime(d.ms)}` },
  'hide-won': { first: true, icon: '🏅', text: () => 'Won his first game of hide and seek' },
  'first-fetch': { first: true, icon: '🎾', text: () => 'Your first game of fetch' },
  'first-snack': { first: true, icon: '🦐', text: () => 'You fed him his first snack' },
  'first-bath': { first: true, icon: '🧼', text: () => 'His first rinse' },
  'golden-snack': { first: true, icon: '✨', text: () => 'Shared a golden plankton' },
  // His tank (tank/life.js).
  'tank-gift': { first: true, icon: '🏰', text: d => `You gave him ${d.item ? `a ${d.item.toLowerCase()}` : 'something'} for his tank` },
  'moving-day': { icon: '📦', text: d => `Moving day: the ${d.size || 'bigger tank'}` },
  'set-shown': { icon: '🖼️', text: d => `Put the ${d.set || ''} set on display` },
  days: { icon: '🗓️', text: d => `${d.n} days together` },
  level: { icon: '💞', text: d => `Became ${d.name}` },
  birthday: { icon: '🎂', text: () => 'Wished you a happy birthday' },
  hatchday: { icon: '🕯️', text: d => `${d.years} year${d.years === 1 ? '' : 's'} on your desktop` },
  // Tide events, sparklies, eggs, swaps and the friends' board (docs/plans/viral.md).
  'event-medal': { icon: '🏅', text: d => `Finished ${d.event || 'a tide event'}` },
  'first-shiny': { first: true, icon: '✨', text: d => `His first sparkly one: ${d.item || 'something'}` },
  'egg-hatched': { icon: '🐣', text: d => (d.login ? `@${d.login} hatched one of his eggs: ${d.name || 'a baby crab'}` : `Hatched from @${d.from || 'a friend'}'s egg`) },
  'first-swap': { first: true, icon: '🤝', text: d => `Swapped finds with @${d.login || 'a friend'} for the first time` },
  'board-month': { icon: '🥇', text: d => `${d.place || 'On'} the friends' board in ${d.month || 'a month'}` },
});

const FIRSTS = new Set(Object.keys(MEMORIES).filter(k => MEMORIES[k].first));

// Newest first, as the journal is kept. Firsts always stay (there are only a
// handful, each written once, oldest copy kept); the rest stop at JOURNAL_MAX.
function trim(journal) {
  const seen = new Set();
  let kept = 0;
  const out = [];
  for (let i = journal.length - 1; i >= 0; i--) { // oldest first, so a first keeps its real date
    const e = journal[i];
    if (FIRSTS.has(e.kind)) { if (!seen.has(e.kind)) { seen.add(e.kind); out.push(e); } } else out.push(e);
  }
  out.reverse();
  return out.filter(e => FIRSTS.has(e.kind) || ++kept <= JOURNAL_MAX);
}

const fmtTime = ms => { const s = Math.max(0, Math.round((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

const cleanData = d => {
  const out = {};
  for (const [k, v] of Object.entries(d && typeof d === 'object' ? d : {})) {
    if (typeof v === 'string') out[k] = clip(v, 40);
    else if (Number.isFinite(v)) out[k] = v;
  }
  return out;
};

/** Tolerate anything read from disk. */
function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const t = r.today && typeof r.today === 'object' ? r.today : {};
  const today = {};
  for (const k of Object.keys(EARN)) today[k] = Math.floor(pos(t[k]));
  today.date = typeof t.date === 'string' ? t.date : null;
  const bd = r.birthday && typeof r.birthday === 'object' ? r.birthday : null;
  const journal = trim((Array.isArray(r.journal) ? r.journal : [])
    .filter(e => e && MEMORIES[e.kind] && pos(e.at))
    .map(e => ({ kind: e.kind, at: e.at, data: cleanData(e.data) })));
  const birthday = bd && Number.isInteger(bd.m) && Number.isInteger(bd.d) && bd.m >= 1 && bd.m <= 12 && bd.d >= 1 && bd.d <= 31 ? { m: bd.m, d: bd.d } : null;
  return {
    hatchedAt: pos(r.hatchedAt),
    points: Math.floor(pos(r.points)),
    days: Math.floor(pos(r.days)),
    lastDay: typeof r.lastDay === 'string' ? r.lastDay : null,
    level: Math.min(LEVELS.length - 1, Math.floor(pos(r.level))),
    today,
    birthday,
    celebrated: (Array.isArray(r.celebrated) ? r.celebrated : []).filter(s => typeof s === 'string' && /^[a-z]+:\d{4}$/.test(s)).slice(-10),
    journal,
    // Every first he's written down, even one a journal from before firsts were
    // kept for good has lost: seeded from the journal, so it's never written twice.
    firsts: [...new Set([...(Array.isArray(r.firsts) ? r.firsts : []).filter(k => FIRSTS.has(k)), ...journal.filter(e => FIRSTS.has(e.kind)).map(e => e.kind)])],
    recalled: (Array.isArray(r.recalled) ? r.recalled : []).filter(n => Number.isFinite(n)).slice(-12),
  };
}

/** { index, name, icon, points, floor, next, progress } for a point total. */
function levelFor(points) {
  const p = Math.floor(pos(points));
  let index = 0;
  while (index < LEVELS.length - 1 && p >= LEVELS[index + 1].at) index++;
  const floor = LEVELS[index].at;
  const next = LEVELS[index + 1]?.at ?? null;
  return { index, name: LEVELS[index].name, icon: LEVELS[index].icon, points: p, floor, next, progress: next ? (p - floor) / (next - floor) : 1 };
}

/**
 * Write a moment down. Firsts are written once, ever. Returns the new state (the old
 * one is never mutated) and whether anything was added.
 */
function remember(stateIn, kind, now, data = {}) {
  const state = normalize(stateIn);
  const rule = MEMORIES[kind];
  const t = Number(now);
  if (!rule || !Number.isFinite(t)) return { state, added: false };
  if (rule.first && state.firsts.includes(kind)) return { state, added: false };
  const entry = { kind, at: t, data: cleanData(data) };
  const firsts = rule.first ? [...state.firsts, kind] : state.firsts;
  return { state: { ...state, journal: trim([entry, ...state.journal]), firsts }, added: true };
}

/**
 * The bond grows. Returns { state, gained, levelUp (the new level or null),
 * milestone (days, when 'day' reached one) }. Capped kinds stop counting for
 * the day once they hit their cap.
 */
function earn(stateIn, kind, now) {
  let state = normalize(stateIn);
  const rule = EARN[kind];
  const t = Number(now);
  const none = { state, gained: 0, levelUp: null, milestone: null };
  if (!rule || !Number.isFinite(t)) return none;
  const day = dayKey(t);
  let today = state.today.date === day ? state.today : { ...Object.fromEntries(Object.keys(EARN).map(k => [k, 0])), date: day };
  let milestone = null;
  if (kind === 'day') {
    if (state.lastDay === day) return none;
    const days = state.days + 1;
    state = { ...state, days, lastDay: day, hatchedAt: state.hatchedAt || t };
    if (DAY_MILESTONES.includes(days)) {
      milestone = days;
      state = remember(state, 'days', t, { n: days }).state;
    }
  } else if (rule.perDay && today[kind] >= rule.perDay) {
    return { ...none, state: { ...state, today } };
  }
  today = { ...today, [kind]: (today[kind] || 0) + 1 };
  const before = levelFor(state.points);
  const points = state.points + rule.points;
  const after = levelFor(points);
  state = { ...state, points, today };
  let levelUp = null;
  if (after.index > state.level) {
    levelUp = { index: after.index, name: after.name, icon: after.icon };
    state = { ...remember(state, 'level', t, { name: after.name }).state, level: after.index };
  }
  return { state, gained: points - before.points, levelUp, milestone };
}

/** First run (or the first run of this feature): when did he move in? */
function hatch(stateIn, now, { since = null } = {}) {
  const state = normalize(stateIn);
  if (state.hatchedAt) return state;
  const at = pos(since) && since < now ? since : now;
  return { ...remember({ ...state, hatchedAt: at }, 'hatched', at).state, hatchedAt: at };
}

/** Your birthday, from the Us page: { m, d } or null to forget it. */
function setBirthday(stateIn, bd) {
  const state = normalize(stateIn);
  if (bd == null) return { ...state, birthday: null };
  const m = Math.floor(Number(bd.m)), d = Math.floor(Number(bd.d));
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= new Date(2024, m, 0).getDate())) return state;
  return { ...state, birthday: { m, d } };
}

/**
 * 'birthday' | 'hatchday' when today is one (and it hasn't been celebrated
 * this year), else null. A 29 February birthday is kept on the 28th in other years.
 */
function specialDay(stateIn, now) {
  const state = normalize(stateIn);
  const d = new Date(Number(now));
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
  const leap = new Date(y, 1, 29).getMonth() === 1;
  const is = bd => bd && bd.m === m && (bd.d === day || (bd.m === 2 && bd.d === 29 && !leap && day === 28));
  if (is(state.birthday) && !state.celebrated.includes(`birthday:${y}`)) return 'birthday';
  if (state.hatchedAt) {
    const h = new Date(state.hatchedAt);
    if (h.getFullYear() < y && is({ m: h.getMonth() + 1, d: h.getDate() }) && !state.celebrated.includes(`hatchday:${y}`)) return 'hatchday';
  }
  return null;
}

/** Mark a special day done for this year, and write it down. */
function celebrate(stateIn, which, now) {
  const state = normalize(stateIn);
  const y = new Date(Number(now)).getFullYear();
  const tag = `${which}:${y}`;
  if (state.celebrated.includes(tag)) return state;
  const years = state.hatchedAt ? y - new Date(state.hatchedAt).getFullYear() : 0;
  const next = { ...state, celebrated: [...state.celebrated, tag].slice(-10) };
  return remember(next, which, now, which === 'hatchday' ? { years } : {}).state;
}

/** What he'd say on a special day or a milestone. */
function celebrationLine(which, { days = 0, years = 0 } = {}) {
  if (which === 'birthday') return 'happy birthday!!';
  if (which === 'hatchday') return years > 1 ? `${years} years together!` : 'happy hatch day!';
  if (which === 'days') return `${days} days together!`;
  return null;
}

// ---------------------------------------------------------------- bringing it back up
// Each kind of memory he can mention, as bubble-sized lines. Lines that come
// out too long for the bubble are simply skipped.
const RECALL = Object.freeze({
  shaken: d => (d.app ? [`remember ${d.app}?`, `${d.app} owes me one`] : []),
  'big-ride': d => (d.app ? [`that ${d.app} ride!`, 'what a ride that was'] : ['what a ride that was']),
  'first-perch': d => (d.app ? [`miss the ${d.app} view`] : []),
  'rare-find': d => (d.item ? [`my ${d.item.toLowerCase()}…`, 'still got my treasure'] : []),
  'first-find': () => ['my first find…'],
  visitor: d => [`miss @${d.login}`, 'when\'s the next visit?'],
  game: d => (d.app ? [`more ${d.app}?`, 'gg that time'] : ['gg that time']),
  'hide-found': d => [`you found me in ${fmtTime(d.ms)}`, 'hide and seek again?'],
  'first-fetch': () => ['fetch later?'],
  'first-pet': () => ['you pet me first'],
  'first-snack': () => ['my first snack…', 'still taste that plankton'],
  'golden-snack': () => ['that golden plankton!'],
});

/**
 * A memory to bring up, or null. Never one that's still fresh, and not the
 * same one again until a few others have had their turn. Returns { text, state }.
 *   extra: { days, throws, petted } for lines that come from counts, not the journal
 */
function recall(stateIn, now, rand = Math.random, { throws = 0 } = {}) {
  const state = normalize(stateIn);
  const t = Number(now);
  if (!Number.isFinite(t) || levelFor(state.points).index < 1) return null;
  const options = [];
  state.journal.forEach((e, i) => {
    if (t - e.at < RECALL_AFTER || !RECALL[e.kind] || state.recalled.includes(e.at)) return;
    for (const text of RECALL[e.kind](e.data)) if (text.length <= MAX_LINE) options.push({ text, at: e.at, i });
  });
  if (state.days >= 3) options.push({ text: `day ${state.days}, us two`, at: -state.days });
  if (throws >= 5) options.push({ text: `${throws} throws. ow.`, at: -throws - 100000 });
  const usable = options.filter(o => o.text.length <= MAX_LINE && !state.recalled.includes(o.at));
  if (!usable.length) return null;
  const pick = usable[Math.min(usable.length - 1, Math.floor(rand() * usable.length))];
  return { text: pick.text, state: { ...state, recalled: [...state.recalled, pick.at].slice(-12) } };
}

/** Everything the Us page shows. */
function view(stateIn, now = Date.now()) {
  const state = normalize(stateIn);
  const lvl = levelFor(state.points);
  const nextMilestone = DAY_MILESTONES.find(n => n > state.days) || null;
  return {
    level: lvl,
    levels: LEVELS.map((l, i) => ({ ...l, index: i, reached: i <= lvl.index })),
    unlocks: UNLOCKS.map(u => ({ ...u, open: lvl.index >= u.level, levelName: LEVELS[u.level].name })),
    days: state.days,
    hatchedAt: state.hatchedAt,
    birthday: state.birthday,
    nextMilestone,
    journal: state.journal.map(e => ({ kind: e.kind, at: e.at, icon: MEMORIES[e.kind].icon, text: MEMORIES[e.kind].text(e.data) })),
    now,
  };
}

module.exports = {
  LEVELS, UNLOCKS, EARN, DAY_MILESTONES, MEMORIES, RECALL_AFTER, JOURNAL_MAX,
  normalize, levelFor, remember, earn, hatch, setBirthday, specialDay, celebrate, celebrationLine, recall, view, fmtTime,
};

  };

  const catalog = load('catalog');
  const seasons = load('seasons');
  const achievements = load('achievements');
  const api = {
    version: "0.77.0",
    validatePack: catalog.validatePack,
    constants: {
      FORMAT: catalog.FORMAT, MAX_FILE_BYTES: catalog.MAX_FILE_BYTES, PACK_ID_RE: catalog.PACK_ID_RE, ITEM_ID_RE: catalog.ITEM_ID_RE,
      SLOTS: catalog.SLOTS, ANCHORS: catalog.ANCHORS, FOLLOWS: catalog.FOLLOWS, MOTIONS: catalog.MOTIONS, RARITIES: catalog.RARITIES,
      SLOT_ANCHOR: catalog.SLOT_ANCHOR, SLOT_FOLLOWS: catalog.SLOT_FOLLOWS, DEFAULT_ANCHORS: catalog.DEFAULT_ANCHORS, LIMITS: catalog.LIMITS,
      DECOR_CATEGORIES: catalog.DECOR_CATEGORIES, DECOR_LAYERS: catalog.DECOR_LAYERS, STYLE_CATEGORIES: catalog.STYLE_CATEGORIES, SPOT_KINDS: catalog.SPOT_KINDS,
    },
    SEASONS: seasons.SEASONS, KNOWN_SEASONS: seasons.KNOWN_SEASONS,
    ACHIEVEMENTS: achievements.ACHIEVEMENTS, KNOWN_ACHIEVEMENTS: achievements.KNOWN_ACHIEVEMENTS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Shellby = api;
})(typeof window !== 'undefined' ? window : globalThis);
