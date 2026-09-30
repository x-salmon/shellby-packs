// Builds the static gallery into dist/ (deployed to GitHub Pages).
//   node scripts/build.mjs
// Fails if any pack fails validation, so a broken pack can never be published.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, SITE_URL, REPO_URL, Shellby, loadPacks, registryIndex } from './registry.mjs';

const require = createRequire(import.meta.url);
const R = require('../lib/render.js');
const md = require('../lib/markdown.js');
const classic = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'classic.json'), 'utf8'));
const OUT = path.join(ROOT, 'dist');
const esc = R.esc;
const SHELLBY_RELEASES = 'https://github.com/x-salmon/shellby/releases/latest';
const SLOT_NAMES = { hat: 'Hats', face: 'Face', neck: 'Neck', held: 'Held', shell: 'Shell', effect: 'Effects', skin: 'Colors' };

const { packs, problems } = loadPacks();
if (problems.length) {
  for (const p of problems) console.error(`✗ ${p.pack}: ${p.message}`);
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
const write = (rel, content) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content); };
const copyDir = (from, to) => fs.cpSync(path.join(ROOT, from), path.join(OUT, to), { recursive: true });

// ------------------------------------------------------------------ helpers
// A consistent frame so every crab thumbnail sits on the same baseline.
const FRAME = { x0: -1, y0: -9, x1: 25, y1: 13 };
const crabWith = (items, opts = {}) => R.crab(opts.skin || classic, items, { frame: FRAME, ...opts });
const skinView = s => ({ ...classic, ...s, parts: s.parts || classic.parts });
function itemArt(kind, item) {
  if (kind === 'effect') { const sp = R.bigSprite(item); return R.grid(sp.pixels, sp.palette, { className: 'px fx-art', label: item.name }); }
  if (kind === 'skin') return crabWith([], { skin: skinView(item), label: item.name });
  return crabWith([item], { label: `Shellby wearing ${item.name}` });
}
function outfitOf(p) {
  const bySlot = {};
  for (const a of p.pack.accessories) if (!bySlot[a.slot]) bySlot[a.slot] = a;
  return Object.values(bySlot);
}
const itemsOf = p => [
  ...p.pack.accessories.map(a => ({ kind: a.slot, item: a })),
  ...p.pack.effects.map(e => ({ kind: 'effect', item: e })),
  ...p.pack.skins.map(s => ({ kind: 'skin', item: s })),
];
const slotsOf = p => [...new Set(itemsOf(p).map(i => i.kind))];
const installUrl = id => `shellby://install?pack=${encodeURIComponent(id)}`;
const fmtDate = iso => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function layout({ title, description, page, depth, body }) {
  const base = depth ? '../'.repeat(depth) : './';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${SITE_URL}icon.png">
<meta name="theme-color" content="#0c1719">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">
<link rel="icon" href="${base}icon.png">
<link rel="stylesheet" href="${base}style.css">
<link rel="stylesheet" href="${base}lib/effects.css">
</head>
<body data-page="${page}" data-base="${base}">
<div class="caustics" aria-hidden="true"></div>
<header class="top">
  <a class="logo" href="${base}" aria-label="Shellby Wardrobe home">${R.crab(classic, [], { className: 'logo-crab' })}<span>Shellby <b>Wardrobe</b></span></a>
  <nav>
    <a href="${base}#packs"${page === 'home' ? ' aria-current="page"' : ''}>Packs</a>
    <a href="${base}studio/"${page === 'studio' ? ' aria-current="page"' : ''}>Pack Studio</a>
    <a href="${base}create/"${page === 'create' ? ' aria-current="page"' : ''}>Make a pack</a>
    <a class="get" href="${SHELLBY_RELEASES}">Get Shellby</a>
  </nav>
</header>
<main>
${body}
</main>
<footer class="foot">
  <p>Packs are made by the community and shared under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Every pack is checked with Shellby's own validator before it's published, and packs are pixel art and settings only, never code.</p>
  <p><a href="${REPO_URL}">Source &amp; submissions on GitHub</a> · <a href="https://github.com/x-salmon/shellby">Shellby</a> · <a href="${base}index.json">Registry JSON</a> · Shellby is an independent open-source project, not affiliated with Anthropic.</p>
</footer>
<script src="${base}lib/sprite.js"></script>
<script src="${base}lib/effects.js"></script>
${page === 'studio' ? `<script src="${base}lib/shellby.js"></script>\n<script src="${base}lib/render.js"></script>\n<script src="${base}studio.js"></script>` : `<script src="${base}app.js"></script>`}
</body>
</html>
`;
}

function installCard(p, { compact = false } = {}) {
  return `<div class="install${compact ? ' compact' : ''}">
    <a class="btn primary add" href="${installUrl(p.id)}" data-install="${esc(p.id)}"><span aria-hidden="true">＋</span> Add to Shellby</a>
    ${compact ? '' : `<a class="btn" href="../../packs/${esc(p.id)}.json" download="${esc(p.id)}.json">Download .json</a>`}
  </div>`;
}

// ------------------------------------------------------------------ home
const allItems = packs.flatMap(p => itemsOf(p).map(i => ({ ...i, p })));
const cards = packs.map(p => {
  const items = itemsOf(p);
  const search = [p.pack.name, p.pack.author, p.pack.description, ...items.map(i => i.item.name)].join(' ').toLowerCase();
  return `<article class="card" data-search="${esc(search)}" data-slots="${esc(slotsOf(p).join(' '))}" data-updated="${esc(p.updated)}" data-name="${esc(p.pack.name.toLowerCase())}">
  <a class="card-stage" href="pack/${esc(p.id)}/" aria-label="${esc(p.pack.name)} details">${p.pack.skins[0] && !p.pack.accessories.length ? crabWith([], { skin: skinView(p.pack.skins[0]) }) : crabWith(outfitOf(p))}</a>
  <div class="card-body">
    <h3><a href="pack/${esc(p.id)}/">${esc(p.pack.name)}</a></h3>
    <p class="by">by ${esc(p.pack.author)} · v${esc(p.pack.version)}</p>
    <p class="desc">${esc(p.pack.description || '')}</p>
    <div class="thumbs">${items.slice(0, 8).map(i => `<span class="thumb" title="${esc(i.item.name)}">${i.kind === 'skin' ? crabWith([], { skin: skinView(i.item) }) : i.kind === 'effect' ? itemArt('effect', i.item) : R.grid(i.item.pixels, i.item.palette, { className: 'px' })}</span>`).join('')}</div>
    <div class="card-foot">
      <span class="counts">${[p.pack.accessories.length && plural(p.pack.accessories.length, 'accessory').replace('accessorys', 'accessories'), p.pack.effects.length && plural(p.pack.effects.length, 'effect'), p.pack.skins.length && plural(p.pack.skins.length, 'color')].filter(Boolean).join(' · ')}</span>
      <a class="btn primary small add" href="${installUrl(p.id)}" data-install="${esc(p.id)}">＋ Add</a>
    </div>
  </div>
</article>`;
}).join('\n');

const tiles = allItems.map(({ kind, item, p }) => `<a class="tile rarity-${esc(item.rarity || 'common')}" href="pack/${esc(p.id)}/#${esc(item.id)}" data-search="${esc(`${item.name} ${p.pack.name} ${p.pack.author}`.toLowerCase())}" data-slots="${esc(kind)}" data-updated="${esc(p.updated)}" data-name="${esc(item.name.toLowerCase())}">
  <span class="tile-art">${itemArt(kind, item)}</span>
  <span class="tile-name">${esc(item.name)}</span>
  <span class="tile-pack">${esc(p.pack.name)}</span>
</a>`).join('\n');

const chips = ['all', 'hat', 'face', 'neck', 'held', 'shell', 'effect', 'skin'].map(s =>
  `<button type="button" class="chip${s === 'all' ? ' on' : ''}" data-slot="${s}" aria-pressed="${s === 'all'}">${s === 'all' ? 'Everything' : SLOT_NAMES[s]}</button>`).join('');

write('index.html', layout({
  title: 'Shellby Wardrobe: community packs for the desktop crab',
  description: 'Hats, effects and colors for Shellby, the pixel hermit crab that runs Claude Code on your desktop. Made by the community, one click to install.',
  page: 'home', depth: 0,
  body: `<section class="hero">
  <div class="hero-text">
    <p class="kicker">Community wardrobe for Shellby</p>
    <h1>Dress up the <em>desktop crab</em>.</h1>
    <p class="lede">Hats, effects and colors made by the community. Find something you like and click <b>Add to Shellby</b>. He shows you what's inside and asks before anything installs.</p>
    <div class="cta"><a class="btn primary" href="#packs">Browse packs</a><a class="btn" href="studio/">Make your own</a></div>
    <p class="stats">${plural(packs.length, 'pack')} · ${plural(allItems.length, 'item')} · <a href="${SHELLBY_RELEASES}">Don't have Shellby yet?</a></p>
  </div>
  <div class="hero-stage stage" id="heroStage">
    <div class="stage-fx"></div>
    <div class="stage-crab">${crabWith(outfitOf(packs[0] || { pack: { accessories: [] } }))}</div>
    <div class="stage-floor"></div>
    <p class="stage-caption" id="heroCaption" aria-live="polite"></p>
  </div>
</section>

<section class="browse" id="packs" aria-labelledby="packsTitle">
  <div class="section-head">
    <h2 id="packsTitle">Packs</h2>
    <div class="tools">
      <label class="search"><span class="sr">Search</span><input type="search" id="q" placeholder="Search hats, effects, creators…" autocomplete="off"></label>
      <select id="sort" aria-label="Sort"><option value="new">Newest</option><option value="az">A–Z</option></select>
    </div>
  </div>
  <div class="chips" role="group" aria-label="Filter by slot">${chips}</div>
  <div class="pack-grid" id="packGrid">
${cards}
  </div>
  <p class="empty" id="empty" hidden>Nothing matches. <a href="create/">Make it yourself?</a></p>
</section>

<section class="browse" id="items" aria-labelledby="itemsTitle">
  <div class="section-head"><h2 id="itemsTitle">Every item</h2><p class="muted">${plural(allItems.length, 'item')} from ${plural(packs.length, 'pack')}</p></div>
  <div class="item-grid" id="itemGrid">
${tiles}
  </div>
</section>`,
}));

// ------------------------------------------------------------------ pack pages
for (const p of packs) {
  const items = itemsOf(p);
  const readme = p.readme ? md.render(p.readme) : '';
  write(`pack/${p.id}/index.html`, layout({
    title: `${p.pack.name} by ${p.pack.author} · Shellby Wardrobe`,
    description: p.pack.description || `${p.pack.name}: a Shellby wardrobe pack.`,
    page: 'pack', depth: 2,
    body: `<nav class="crumbs" aria-label="Breadcrumb"><a href="../../#packs">Packs</a> <span aria-hidden="true">/</span> ${esc(p.pack.name)}</nav>
<section class="pack-hero">
  <div class="stage big" id="packStage" data-pack="${esc(p.id)}">
    <div class="stage-fx"></div>
    <div class="stage-crab">${crabWith(outfitOf(p))}</div>
    <div class="stage-floor"></div>
    <p class="stage-caption" id="packCaption" aria-live="polite">Click items below to try them on</p>
  </div>
  <div class="pack-info">
    <h1>${esc(p.pack.name)}</h1>
    <p class="by">by <b>${esc(p.pack.author)}</b> · v${esc(p.pack.version)} · updated ${esc(fmtDate(p.updated))}</p>
    <p class="lede">${esc(p.pack.description || '')}</p>
    ${installCard(p)}
    <p class="install-hint" id="installHint" hidden>Nothing happened? <b>Add to Shellby</b> needs Shellby 0.4 or newer. You can also download the file and drop it on Shellby's Wardrobe.</p>
    <dl class="facts">
      <dt>Contents</dt><dd>${[plural(p.pack.accessories.length, 'accessory').replace('accessorys', 'accessories'), plural(p.pack.effects.length, 'effect'), plural(p.pack.skins.length, 'color')].join(' · ')}</dd>
      <dt>Checksum</dt><dd><code title="${esc(p.sha256)}">sha256 ${esc(p.sha256.slice(0, 16))}…</code></dd>
      <dt>Source</dt><dd><a href="${REPO_URL}/blob/main/packs/${esc(p.id)}/pack.json">packs/${esc(p.id)}/pack.json</a></dd>
    </dl>
    <p class="muted small">Shellby shows the pack's contents and asks before installing. Packs are pixel art and settings only.</p>
  </div>
</section>
<section aria-labelledby="itemsHead">
  <h2 id="itemsHead">In this pack</h2>
  <div class="try-grid" id="tryGrid">
    ${items.map(({ kind, item }) => `<button type="button" class="tile try rarity-${esc(item.rarity || 'common')}" id="${esc(item.id)}" data-key="${esc(item.key)}" data-kind="${esc(kind)}" aria-pressed="false">
      <span class="tile-art">${itemArt(kind, item)}</span>
      <span class="tile-name">${esc(item.name)}</span>
      <span class="tile-pack">${esc(SLOT_NAMES[kind] || kind)}${item.rarity && item.rarity !== 'common' ? ` · ${esc(item.rarity)}` : ''}</span>
    </button>`).join('\n    ')}
  </div>
</section>
${readme ? `<section class="readme" aria-label="About this pack">${readme}</section>` : ''}`,
  }));
}

// ------------------------------------------------------------------ studio + create + 404
write('studio/index.html', layout({
  title: 'Pack Studio · Shellby Wardrobe',
  description: 'Write a Shellby wardrobe pack and see Shellby wear it live, with the same validator the app uses.',
  page: 'studio', depth: 1,
  body: fs.readFileSync(path.join(ROOT, 'site', 'studio.html'), 'utf8'),
}));
write('create/index.html', layout({
  title: 'Make a pack · Shellby Wardrobe',
  description: 'How to draw, test and publish a Shellby wardrobe pack.',
  page: 'create', depth: 1,
  body: fs.readFileSync(path.join(ROOT, 'site', 'create.html'), 'utf8'),
}));
write('404.html', layout({
  title: 'Not found · Shellby Wardrobe', description: 'Page not found.', page: '404', depth: 0,
  body: `<section class="notfound"><div class="stage">${crabWith([])}</div><h1>Shellby looked under every rock.</h1><p>That page isn't here. <a href="./">Back to the packs</a></p></section>`,
}));

// ------------------------------------------------------------------ data + static files
for (const p of packs) write(`packs/${p.id}.json`, p.raw); // exact bytes: the registry checksum covers these
write('index.json', JSON.stringify(registryIndex(packs), null, 2) + '\n');
write('catalog.json', JSON.stringify({
  skin: classic,
  packs: packs.map(p => ({ id: p.id, name: p.pack.name, author: p.pack.author, accessories: p.pack.accessories, effects: p.pack.effects, skins: p.pack.skins.map(skinView) })),
}));
write('addon.schema.json', fs.readFileSync(path.join(ROOT, 'data', 'addon.schema.json')));
copyDir('site/fonts', 'fonts');
copyDir('lib', 'lib');
for (const f of ['style.css', 'app.js', 'studio.js', 'icon.png', '.nojekyll']) {
  if (fs.existsSync(path.join(ROOT, 'site', f))) fs.copyFileSync(path.join(ROOT, 'site', f), path.join(OUT, f));
}
write('.nojekyll', '');
console.log(`built ${packs.length} packs, ${allItems.length} items -> dist/ (validator from Shellby v${Shellby.version})`);
