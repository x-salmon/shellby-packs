// Vendors Shellby's own pack validator (and the data it needs) into this repo, so
// the gallery, the PR checks and Pack Studio validate with EXACTLY the app's code.
//
//   node scripts/sync-shellby.mjs [path-to-shellby-checkout]
//
// Output:
//   lib/shellby.js      UMD bundle: validatePack, SEASONS, ACHIEVEMENTS, DEFAULT_ANCHORS, …
//                       (works in Node and in the browser as window.Shellby)
//   lib/markdown.js     Shellby's escape-first Markdown renderer (for pack READMEs)
//   data/classic.json   the classic crab, for previews
//   data/base-pack.json Shellby's built-in wardrobe (ids reserved; used for previews)
//   data/shellby-version.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.argv[2] || process.env.SHELLBY_REPO || path.join(ROOT, '..', 'shellby'));
const read = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');

const modules = {
  skins: 'src/main/skins.js',
  catalog: 'src/main/wardrobe/catalog.js',
  seasons: 'src/main/wardrobe/seasons.js',
  achievements: 'src/main/wardrobe/achievements.js',
};
// How each module's require() calls resolve inside the bundle.
const resolveMap = { '../skins': 'skins', './seasons': 'seasons', './achievements': 'achievements', fs: '#fs', path: '#path' };

const version = JSON.parse(read('package.json')).version;
let out = `/* Shellby pack validator, vendored from x-salmon/shellby v${version} by scripts/sync-shellby.mjs.
   Do not edit by hand. Re-run the sync script when Shellby's pack format changes. */
(function (root) {
  'use strict';
  const defs = {};
  const cache = {};
  // Node built-ins are only used by Shellby's file loaders (not by validatePack);
  // these stand-ins let the same source run in the browser.
  const builtins = {
    '#fs': typeof require === 'function' ? require('fs') : {},
    '#path': typeof require === 'function' ? require('path') : { join: (...p) => p.join('/'), resolve: (...p) => p.join('/'), basename: p => String(p).split(/[\\\\/]/).pop(), dirname: p => String(p).split(/[\\\\/]/).slice(0, -1).join('/') },
  };
  const resolveMap = ${JSON.stringify(resolveMap)};
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
`;
for (const [name, rel] of Object.entries(modules)) {
  out += `\n  // ---- ${rel}\n  defs[${JSON.stringify(name)}] = function (module, exports, require, __dirname) {\n${read(rel)}\n  };\n`;
}
out += `
  const catalog = load('catalog');
  const seasons = load('seasons');
  const achievements = load('achievements');
  const api = {
    version: ${JSON.stringify(version)},
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
`;

fs.mkdirSync(path.join(ROOT, 'lib'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'lib', 'shellby.js'), out);
fs.writeFileSync(path.join(ROOT, 'lib', 'markdown.js'), `/* Vendored from x-salmon/shellby v${version} (src/renderer/shared/markdown.js). Do not edit. */\n` + read('src/renderer/shared/markdown.js'));
// The app's own sprite + effects engines, so interactive previews on the site
// are pixel-for-pixel what Shellby draws on the desktop.
for (const [from, to] of [
  ['src/renderer/shared/sprite.js', 'lib/sprite.js'],
  ['src/renderer/shared/effects.js', 'lib/effects.js'],
  ['src/renderer/shared/effects.css', 'lib/effects.css'],
]) {
  const banner = from.endsWith('.css') ? `/* Vendored from x-salmon/shellby v${version} (${from}). Do not edit. */\n` : `/* Vendored from x-salmon/shellby v${version} (${from}). Do not edit. */\n`;
  fs.writeFileSync(path.join(ROOT, to), banner + read(from));
}
fs.copyFileSync(path.join(SRC, 'docs', 'addon.schema.json'), path.join(ROOT, 'data', 'addon.schema.json'));
fs.writeFileSync(path.join(ROOT, 'data', 'classic.json'), read('src/skins/classic.json'));
fs.writeFileSync(path.join(ROOT, 'data', 'base-pack.json'), read('src/wardrobe/base.pack.json'));
fs.writeFileSync(path.join(ROOT, 'data', 'shellby-version.json'), JSON.stringify({ version, syncedAt: new Date().toISOString() }, null, 2) + '\n');
for (const f of ['PixelifySans.ttf', 'AtkinsonHyperlegible-Regular.ttf', 'AtkinsonHyperlegible-Bold.ttf', 'MartianMono.ttf', 'OFL-PixelifySans.txt', 'OFL-AtkinsonHyperlegible.txt', 'OFL-MartianMono.txt']) {
  fs.mkdirSync(path.join(ROOT, 'site', 'fonts'), { recursive: true });
  fs.copyFileSync(path.join(SRC, 'assets', 'fonts', f), path.join(ROOT, 'site', 'fonts', f));
}
fs.copyFileSync(path.join(SRC, 'assets', 'icon.png'), path.join(ROOT, 'site', 'icon.png'));
console.log(`synced validator + data from Shellby v${version} (${SRC})`);
