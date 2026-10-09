/* Pixel-art SVG rendering for the gallery: the crab wearing accessories, lone
   items, effect sprites and tank decor. Mirrors Shellby's sprite builder (same
   anchors, pivots, part groups and ink line) but returns strings, so pages
   render at build time and Pack Studio can reuse it in the browser. Input must
   be validated first (colors are checked hex; ids are escaped anyway). */
(function (root) {
  'use strict';
  const SLOT_ANCHOR = { hat: 'head', face: 'face', neck: 'neck', held: 'claw', shell: 'shellTop' };
  const SLOT_Z = ['shell', 'neck', 'hat', 'face', 'held'];
  const DEFAULT_ANCHORS = { head: [15, -1], face: [15, 0], neck: [15, 4], claw: [21, 6], shellTop: [7, 0] };
  const HEX = /^#[0-9a-f]{6}$/i;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const colourOf = (pal, ch) => { const c = pal?.[ch]; return typeof c === 'string' && HEX.test(c) ? c : null; };

  // ------------------------------------------------------------ ink
  // Shellby's line (src/renderer/shared/sprite.js inkRings): every empty cell
  // beside a layer, in the darkest colour of the layer it touches, sunk toward
  // INK. A cell any layer fills gets none, and a one-pixel gap stays open.
  // Keep in step with the vendored lib/sprite.js.
  const INK = '#141225';
  const INK_DEPTH = 0.78;
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const rgb = c => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const lum = c => { const [r, g, b] = rgb(c); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const sink = c => '#' + rgb(c).map((v, i) => Math.round(v + (rgb(INK)[i] - v) * INK_DEPTH).toString(16).padStart(2, '0')).join('');

  // layers: [{ name, cells: [x, y, colour][] }] -> Map(name -> its line's cells)
  function inkRings(layers) {
    const filled = new Set();
    for (const l of layers) for (const [x, y] of l.cells) filled.add(x + ',' + y);
    const has = (x, y) => filled.has(x + ',' + y);
    const out = new Map();
    for (const l of layers) {
      const own = new Map(l.cells.map(([x, y, c]) => [x + ',' + y, c]));
      const ring = new Map();
      for (const [x, y] of l.cells) {
        for (const [dx, dy] of N4) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (has(nx, ny) || ring.has(k)) continue;
          if ((has(nx - 1, ny) && has(nx + 1, ny)) || (has(nx, ny - 1) && has(nx, ny + 1))) continue;
          const near = N4.map(([ex, ey]) => own.get((nx + ex) + ',' + (ny + ey))).filter(Boolean);
          const darkest = near.reduce((a, b) => (lum(b) < lum(a) ? b : a));
          ring.set(k, [nx, ny, sink(darkest)]);
        }
      }
      out.set(l.name, [...ring.values()]);
    }
    return out;
  }

  // A pixel grid's cells, placed at (ox, oy): [x, y, colour][].
  function cellsOf(pixels, palette, ox = 0, oy = 0, keep = () => true) {
    const cells = [];
    pixels.forEach((row, y) => [...row].forEach((ch, x) => {
      const c = colourOf(palette, ch);
      if (c && keep(ch, x, y)) cells.push([ox + x, oy + y, c]);
    }));
    return cells;
  }

  // Cells -> <rect>s, a horizontal run of one colour merged into one.
  function rects(cells) {
    const rows = new Map();
    for (const c of cells) { if (!rows.has(c[1])) rows.set(c[1], []); rows.get(c[1]).push(c); }
    let out = '';
    for (const [y, row] of rows) {
      row.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < row.length;) {
        let j = i + 1;
        while (j < row.length && row[j][0] === row[j - 1][0] + 1 && row[j][2] === row[i][2]) j++;
        out += `<rect x="${row[i][0]}" y="${y}" width="${j - i}" height="1" fill="${row[i][2]}"/>`;
        i = j;
      }
    }
    return out;
  }

  const boxOf = (cells, box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) => {
    for (const [x, y] of cells) {
      box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x + 1); box.y1 = Math.max(box.y1, y + 1);
    }
    return box;
  };

  const svgOpen = (box, cls, label) =>
    `<svg xmlns="http://www.w3.org/2000/svg" class="${esc(cls)}" viewBox="${box.x0} ${box.y0} ${box.x1 - box.x0} ${box.y1 - box.y0}" shape-rendering="crispEdges"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}>`;

  // Layers ([{ name, cls, cells }]) as <g>s, each with its ink line beneath it.
  function inked(layers, ink) {
    const rings = ink ? inkRings(layers) : new Map();
    const all = boxOf(layers.flatMap(l => [...l.cells, ...(rings.get(l.name) || [])]));
    const markup = layers.map(l => {
      const line = rings.get(l.name);
      return `<g class="${esc(l.cls)}">${line && line.length ? `<g class="ink">${rects(line)}</g>` : ''}${rects(l.cells)}</g>`;
    }).join('');
    return { markup, box: all };
  }

  // The crab wearing `accessories` (normalized items). Parts become <g class="part part-x">
  // so pages can animate them like the desktop critter. opts.ink: false leaves his line off.
  function crab(skin, accessories = [], opts = {}) {
    const parts = skin.parts || {};
    const anchors = { ...DEFAULT_ANCHORS, ...(skin.anchors || {}) };
    const partNames = [...new Set(Object.values(parts))];
    const order = ['legs', 'stalks', 'body', 'claw', 'extra', 'shell', 'eyes'];
    const layers = [];
    for (const p of [...order, ...partNames.filter(p => !order.includes(p))]) {
      const cells = cellsOf(skin.pixels, skin.palette, 0, 0, ch => (parts[ch] || 'extra') === p);
      if (cells.length) layers.push({ name: p, cls: `part part-${p}`, cells });
    }
    [...accessories].sort((a, b) => SLOT_Z.indexOf(a.slot) - SLOT_Z.indexOf(b.slot)).forEach((a, i) => {
      const [ax, ay] = anchors[a.anchor] || anchors[SLOT_ANCHOR[a.slot]] || [0, 0];
      const cells = cellsOf(a.pixels, a.palette, ax - a.pivot[0], ay - a.pivot[1]);
      if (cells.length) layers.push({ name: `acc-${i}`, cls: `part part-${a.follows || 'body'} acc acc-${a.slot}`, cells });
    });
    const { markup, box: all } = inked(layers, opts.ink !== false);
    // Pad so every outfit sits on the same baseline and stays centered.
    const pad = opts.pad ?? 1;
    const box = opts.frame
      ? { x0: Math.min(all.x0, opts.frame.x0) - pad, y0: Math.min(all.y0, opts.frame.y0) - pad, x1: Math.max(all.x1, opts.frame.x1) + pad, y1: all.y1 + pad }
      : { x0: all.x0 - pad, y0: all.y0 - pad, x1: all.x1 + pad, y1: all.y1 + pad };
    return `${svgOpen(box, `crab ${opts.className || ''}`.trim(), opts.label)}${markup}</svg>`;
  }

  // A lone pixel grid (accessory, effect sprite or decor), tightly framed.
  // opts.ink lines it like Shellby's wardrobe does for things he wears.
  function grid(pixels, palette, opts = {}) {
    const cells = cellsOf(pixels, palette);
    if (!cells.length) return '';
    const { markup, box: b } = inked([{ name: 'all', cls: 'art', cells }], !!opts.ink);
    const pad = opts.pad ?? 0;
    const box = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
    return `${svgOpen(box, opts.className || 'px', opts.label)}${markup}</svg>`;
  }

  // The most detailed sprite of an effect (a snowflake, not a lone pixel).
  const bigSprite = fx => [...fx.sprites].sort((a, b) => b.pixels.join('').length - a.pixels.join('').length)[0];

  const api = { crab, grid, bigSprite, esc, inkRings, DEFAULT_ANCHORS, SLOT_ANCHOR, SLOT_Z };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShellbyRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
