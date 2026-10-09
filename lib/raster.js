/* PNG rendering for social previews (og:image), in plain Node: pixel art is
   just coloured squares, so a raw RGBA buffer plus zlib is all it takes, with no
   browser and no image libraries in CI. Same anchors, pivots and ink line as
   render.js.
   Input must be validated packs (colours are checked hex). */
'use strict';
const zlib = require('zlib');
const { DEFAULT_ANCHORS, SLOT_ANCHOR, SLOT_Z, bigSprite, inkRings } = require('./render.js');

const HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const rgb = hex => { const m = HEX.exec(hex || ''); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null; };

class Canvas {
  constructor(w, h) { this.w = w; this.h = h; this.px = Buffer.alloc(w * h * 4); }
  // Source-over blend of one colour into a rectangle.
  fill(x, y, w, h, [r, g, b], a = 1) {
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.w, Math.round(x + w)), y1 = Math.min(this.h, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.w + xx) * 4;
        const da = this.px[i + 3] / 255, oa = a + da * (1 - a);
        this.px[i] = Math.round((r * a + this.px[i] * da * (1 - a)) / (oa || 1));
        this.px[i + 1] = Math.round((g * a + this.px[i + 1] * da * (1 - a)) / (oa || 1));
        this.px[i + 2] = Math.round((b * a + this.px[i + 2] * da * (1 - a)) / (oa || 1));
        this.px[i + 3] = Math.round(oa * 255);
      }
    }
  }
  // A pixel grid with its top-left at (x, y), each sprite pixel `k` screen pixels.
  // `ink` lines it first, a sprite pixel out all round, as Shellby does.
  grid(pixels, palette, x, y, k, { ink = false } = {}) {
    const cells = cellsOf(pixels, palette);
    if (ink) this.cells(inkRings([{ name: 'all', cells }]).get('all'), x, y, k);
    this.cells(cells, x, y, k);
  }
  cells(cells, x, y, k) {
    for (const [cx, cy, c] of cells) this.fill(x + cx * k, y + cy * k, k, k, rgb(c));
  }
  png() {
    const raw = Buffer.alloc((this.w * 4 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 4 + 1)] = 0; // filter: none
      this.px.copy(raw, y * (this.w * 4 + 1) + 1, y * this.w * 4, (y + 1) * this.w * 4);
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A grid's coloured cells, placed at (ox, oy): [x, y, colour][].
function cellsOf(pixels, palette, ox = 0, oy = 0, keep = () => true) {
  const cells = [];
  pixels.forEach((row, y) => [...row].forEach((ch, x) => {
    if (rgb(palette[ch]) && keep(ch)) cells.push([ox + x, oy + y, palette[ch]]);
  }));
  return cells;
}

// The crab plus accessories as inked layers, in paint order, and their bounding
// box (sprite pixels, ink included). Each part gets its own line, like render.js.
function crabLayers(skin, accessories) {
  const parts = skin.parts || {};
  const anchors = { ...DEFAULT_ANCHORS, ...(skin.anchors || {}) };
  const order = ['legs', 'stalks', 'body', 'claw', 'extra', 'shell', 'eyes'];
  const names = [...new Set(Object.values(parts))];
  const layers = [...order, ...names.filter(p => !order.includes(p))]
    .map(p => ({ name: p, cells: cellsOf(skin.pixels, skin.palette, 0, 0, ch => (parts[ch] || 'extra') === p) }));
  [...accessories].sort((a, b) => SLOT_Z.indexOf(a.slot) - SLOT_Z.indexOf(b.slot)).forEach((a, i) => {
    const [ax, ay] = anchors[a.anchor] || anchors[SLOT_ANCHOR[a.slot]] || [0, 0];
    layers.push({ name: `acc-${i}`, cells: cellsOf(a.pixels, a.palette, ax - a.pivot[0], ay - a.pivot[1]) });
  });
  const rings = inkRings(layers);
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const l of layers) for (const [x, y] of [...l.cells, ...rings.get(l.name)]) {
    box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x + 1); box.y1 = Math.max(box.y1, y + 1);
  }
  return { layers: layers.map(l => ({ ...l, ring: rings.get(l.name) })), box };
}

/**
 * 1200x630 social preview for a pack: Shellby wearing it on the sand, the
 * pack's effect around him, and every item in a row along the bottom.
 */
function packPreview({ skin, accessories = [], effects = [], skins = [], decor = [] }) {
  const W = 1200, H = 630;
  const c = new Canvas(W, H);
  // water
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    c.fill(0, y, W, 1, [Math.round(15 - 9 * t), Math.round(48 - 29 * t), Math.round(57 - 35 * t)]);
  }
  // soft light: stepped rings (cheap radial glow)
  for (let r = 380; r > 0; r -= 20) c.fill(160 - r, 80 - r * 0.6, r * 2, r * 1.2, [127, 214, 194], 0.012);
  // sand
  const sandY = H - 150;
  c.fill(0, sandY, W, 150, [122, 106, 75]);
  c.fill(0, sandY, W, 12, [168, 148, 108]);
  for (let i = 0; i < 160; i++) c.fill((i * 97) % W, sandY + 22 + ((i * 41) % 110), 6, 6, [201, 180, 138], 0.5);

  const body = skins[0] ? { ...skin, ...skins[0], parts: skins[0].parts || skin.parts } : skin;
  const { layers, box } = crabLayers(body, accessories);
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const k = Math.max(4, Math.floor(Math.min(560 / bw, 330 / bh)));
  const ox = Math.round((W - bw * k) / 2 - box.x0 * k);
  const oy = sandY + 16 - box.y1 * k;
  c.fill(W / 2 - bw * k * 0.4, sandY + 6, bw * k * 0.8, 20, [0, 0, 0], 0.28); // shadow
  for (const l of layers) { c.cells(l.ring, ox, oy, k); c.cells(l.cells, ox, oy, k); }

  // effect sprites scattered in the water
  const fx = effects[0];
  if (fx) {
    const spots = [[0.1, 0.12], [0.86, 0.1], [0.2, 0.42], [0.78, 0.38], [0.36, 0.08], [0.64, 0.16], [0.06, 0.62], [0.93, 0.6]];
    spots.forEach(([sx, sy], i) => {
      const s = fx.sprites[i % fx.sprites.length] || bigSprite(fx);
      const sk = Math.max(4, Math.round(28 / Math.max(s.pixels.length, ...s.pixels.map(r => r.length))));
      c.grid(s.pixels, s.palette, Math.round(sx * W), Math.round(sy * (sandY - 40)), sk);
    });
  }

  // every item along the sand, like a shop shelf
  const items = [
    ...accessories.map(a => ({ pixels: a.pixels, palette: a.palette, ink: true })),
    ...effects.map(e => bigSprite(e)),
    ...decor.map(d => ({ pixels: d.pixels, palette: d.palette })), // the tank draws decor unlined
  ].slice(0, 10);
  const tile = 72, gap = 14, total = items.length * tile + (items.length - 1) * gap;
  items.forEach((it, i) => {
    const tx = Math.round((W - total) / 2 + i * (tile + gap)), ty = H - 98;
    c.fill(tx, ty, tile, tile, [6, 19, 22], 0.72);
    const pad = it.ink ? 2 : 0; // the line adds a pixel each side
    const iw = Math.max(...it.pixels.map(r => r.length)) + pad, ih = it.pixels.length + pad;
    const ik = Math.max(2, Math.floor(52 / Math.max(iw, ih)));
    const off = it.ink ? ik : 0;
    c.grid(it.pixels, it.palette, tx + Math.round((tile - iw * ik) / 2) + off, ty + Math.round((tile - ih * ik) / 2) + off, ik, { ink: it.ink });
  });
  return c.png();
}

module.exports = { Canvas, packPreview, crc32 };
