/* Pixel-art SVG rendering for the gallery: the crab wearing accessories, lone
   items and effect sprites. Mirrors Shellby's sprite builder (same anchors,
   pivots and part groups) but returns strings, so pages render at build time
   and Pack Studio can reuse it in the browser. Input must be validated first
   (colors are checked hex; ids are escaped anyway). */
(function (root) {
  'use strict';
  const SLOT_ANCHOR = { hat: 'head', face: 'face', neck: 'neck', held: 'claw', shell: 'shellTop' };
  const SLOT_Z = ['shell', 'neck', 'hat', 'face', 'held'];
  const DEFAULT_ANCHORS = { head: [15, -1], face: [15, 0], neck: [15, 4], claw: [21, 6], shellTop: [7, 0] };
  const HEX = /^#[0-9a-f]{6}$/i;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Horizontal runs of one colour -> <rect>s. Returns { rects, box }.
  function runs(pixels, palette, ox = 0, oy = 0, keep = () => true) {
    let rects = '';
    const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    pixels.forEach((row, y) => {
      let x = 0;
      while (x < row.length) {
        const ch = row[x];
        const color = palette[ch];
        if (!color || !HEX.test(color) || !keep(ch, x, y)) { x++; continue; }
        let end = x + 1;
        while (end < row.length && row[end] === ch && keep(ch, end, y)) end++;
        rects += `<rect x="${ox + x}" y="${oy + y}" width="${end - x}" height="1" fill="${color}"/>`;
        box.x0 = Math.min(box.x0, ox + x); box.y0 = Math.min(box.y0, oy + y);
        box.x1 = Math.max(box.x1, ox + end); box.y1 = Math.max(box.y1, oy + y + 1);
        x = end;
      }
    });
    return { rects, box };
  }

  const svgOpen = (box, cls, label) =>
    `<svg xmlns="http://www.w3.org/2000/svg" class="${esc(cls)}" viewBox="${box.x0} ${box.y0} ${box.x1 - box.x0} ${box.y1 - box.y0}" shape-rendering="crispEdges"${label ? ` role="img" aria-label="${esc(label)}"` : ' aria-hidden="true"'}>`;

  // The crab wearing `accessories` (normalized items). Parts become <g class="part part-x">
  // so pages can animate them like the desktop critter.
  function crab(skin, accessories = [], opts = {}) {
    const parts = skin.parts || {};
    const anchors = { ...DEFAULT_ANCHORS, ...(skin.anchors || {}) };
    const groups = {};
    const all = { x0: 0, y0: 0, x1: Math.max(...skin.pixels.map(r => r.length)), y1: skin.pixels.length };
    const partNames = [...new Set(Object.values(parts))];
    for (const part of partNames) {
      const r = runs(skin.pixels, skin.palette, 0, 0, ch => parts[ch] === part);
      if (r.rects) groups[part] = { rects: r.rects, box: r.box };
    }
    const accs = [...accessories].sort((a, b) => SLOT_Z.indexOf(a.slot) - SLOT_Z.indexOf(b.slot));
    let accMarkup = '';
    for (const a of accs) {
      const [ax, ay] = anchors[a.anchor] || anchors[SLOT_ANCHOR[a.slot]] || [0, 0];
      const r = runs(a.pixels, a.palette, ax - a.pivot[0], ay - a.pivot[1]);
      if (!r.rects) continue;
      all.x0 = Math.min(all.x0, r.box.x0); all.y0 = Math.min(all.y0, r.box.y0);
      all.x1 = Math.max(all.x1, r.box.x1); all.y1 = Math.max(all.y1, r.box.y1);
      accMarkup += `<g class="part part-${esc(a.follows || 'body')} acc acc-${esc(a.slot)}">${r.rects}</g>`;
    }
    const order = ['legs', 'stalks', 'body', 'claw', 'extra', 'shell', 'eyes'];
    let body = '';
    for (const p of [...order, ...partNames.filter(p => !order.includes(p))]) {
      if (groups[p]) body += `<g class="part part-${esc(p)}">${groups[p].rects}</g>`;
    }
    // Pad so every outfit sits on the same baseline and stays centered.
    const pad = opts.pad ?? 1;
    const box = opts.frame
      ? { x0: Math.min(all.x0, opts.frame.x0) - pad, y0: Math.min(all.y0, opts.frame.y0) - pad, x1: Math.max(all.x1, opts.frame.x1) + pad, y1: all.y1 + pad }
      : { x0: all.x0 - pad, y0: all.y0 - pad, x1: all.x1 + pad, y1: all.y1 + pad };
    return `${svgOpen(box, `crab ${opts.className || ''}`.trim(), opts.label)}${body}${accMarkup}</svg>`;
  }

  // A lone pixel grid (accessory or effect sprite), tightly framed.
  function grid(pixels, palette, opts = {}) {
    const r = runs(pixels, palette);
    if (!r.rects) return '';
    const pad = opts.pad ?? 0;
    const box = { x0: r.box.x0 - pad, y0: r.box.y0 - pad, x1: r.box.x1 + pad, y1: r.box.y1 + pad };
    return `${svgOpen(box, opts.className || 'px', opts.label)}${r.rects}</svg>`;
  }

  // The most detailed sprite of an effect (a snowflake, not a lone pixel).
  const bigSprite = fx => [...fx.sprites].sort((a, b) => b.pixels.join('').length - a.pixels.join('').length)[0];

  const api = { crab, grid, bigSprite, esc, DEFAULT_ANCHORS, SLOT_ANCHOR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShellbyRender = api;
})(typeof window !== 'undefined' ? window : globalThis);
