/* PNG rendering for social previews (og:image), in plain Node: pixel art is
   just coloured squares, so a raw RGBA buffer plus zlib is all it takes, with no
   browser and no image libraries in CI. Same anchors and pivots as render.js.
   Input must be validated packs (colours are checked hex). */
'use strict';
const zlib = require('zlib');
const { DEFAULT_ANCHORS, SLOT_ANCHOR, bigSprite } = require('./render.js');

const SLOT_Z = ['shell', 'neck', 'hat', 'face', 'held'];
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
  grid(pixels, palette, x, y, k) {
    pixels.forEach((row, ry) => [...row].forEach((ch, rx) => {
      const c = rgb(palette[ch]);
      if (c) this.fill(x + rx * k, y + ry * k, k, k, c);
    }));
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

// Bounding box (sprite pixels) of the crab plus accessories.
function crabBox(skin, accessories) {
  const anchors = { ...DEFAULT_ANCHORS, ...(skin.anchors || {}) };
  const box = { x0: 0, y0: 0, x1: Math.max(...skin.pixels.map(r => r.length)), y1: skin.pixels.length };
  const placed = [...accessories].sort((a, b) => SLOT_Z.indexOf(a.slot) - SLOT_Z.indexOf(b.slot)).map(a => {
    const [ax, ay] = anchors[a.anchor] || anchors[SLOT_ANCHOR[a.slot]] || [0, 0];
    const x = ax - a.pivot[0], y = ay - a.pivot[1];
    const w = Math.max(...a.pixels.map(r => r.length));
    box.x0 = Math.min(box.x0, x); box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x + w); box.y1 = Math.max(box.y1, y + a.pixels.length);
    return { a, x, y };
  });
  return { box, placed };
}

/**
 * 1200x630 social preview for a pack: Shellby wearing it on the sand, the
 * pack's effect around him, and every item in a row along the bottom.
 */
function packPreview({ skin, accessories = [], effects = [], skins = [] }) {
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
  const { box, placed } = crabBox(body, accessories);
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const k = Math.max(4, Math.floor(Math.min(560 / bw, 330 / bh)));
  const ox = Math.round((W - bw * k) / 2 - box.x0 * k);
  const oy = sandY + 16 - box.y1 * k;
  c.fill(W / 2 - bw * k * 0.4, sandY + 6, bw * k * 0.8, 20, [0, 0, 0], 0.28); // shadow
  c.grid(body.pixels, body.palette, ox, oy, k);
  for (const { a, x, y } of placed) c.grid(a.pixels, a.palette, ox + x * k, oy + y * k, k);

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
  const items = [...accessories.map(a => ({ pixels: a.pixels, palette: a.palette })), ...effects.map(e => bigSprite(e))].slice(0, 10);
  const tile = 72, gap = 14, total = items.length * tile + (items.length - 1) * gap;
  items.forEach((it, i) => {
    const tx = Math.round((W - total) / 2 + i * (tile + gap)), ty = H - 98;
    c.fill(tx, ty, tile, tile, [6, 19, 22], 0.72);
    const iw = Math.max(...it.pixels.map(r => r.length)), ih = it.pixels.length;
    const ik = Math.max(2, Math.floor(52 / Math.max(iw, ih)));
    c.grid(it.pixels, it.palette, tx + Math.round((tile - iw * ik) / 2), ty + Math.round((tile - ih * ik) / 2), ik);
  });
  return c.png();
}

module.exports = { Canvas, packPreview, crc32 };
