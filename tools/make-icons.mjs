/**
 * Generates icons/icon-16.png, icon-48.png and icon-128.png.
 *
 *   npm run icons          write the shipped icons
 *   npm run icons -- sheet also write dist/icon-candidates.png to compare marks
 *
 * Every candidate lives in this one file and `SHIPPED` names the one in use, so
 * the comparison sheet can never drift from what actually ships.
 *
 * Drawn here rather than exported from a design tool so the icons are
 * reproducible from source: change a number, re-run, and all three sizes stay
 * consistent. Rendering is supersampled and box-filtered down, which is what
 * gives the rounded corners clean edges without a graphics library.
 *
 * Geometry is expressed in 16px units and scaled, because 16px is the toolbar
 * and it is the only size that has to land on whole pixels.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));

/** The mark that ships. Change this, re-run, done. */
const SHIPPED = 'block';

const INK = [10, 10, 10, 255];
const LIME = [204, 255, 0, 255];
const CLEAR = [0, 0, 0, 0];

const SS = 8; // supersampling factor
const SIZES = [16, 48, 128];

/* ── shape helpers ── */

function roundedRect(x0, y0, size, radius) {
  const x1 = x0 + size;
  const y1 = y0 + size;

  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    if (x >= x0 + radius && x <= x1 - radius) return true;
    if (y >= y0 + radius && y <= y1 - radius) return true;

    const cx = x < x0 + radius ? x0 + radius : x1 - radius;
    const cy = y < y0 + radius ? y0 + radius : y1 - radius;

    return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  };
}

const ring = (cx, cy, outer, inner) => (x, y) => {
  const d2 = (x - cx) ** 2 + (y - cy) ** 2;
  return d2 <= outer ** 2 && d2 >= inner ** 2;
};

const disc = (cx, cy, r) => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;

const rect = (x0, y0, w, h) => (x, y) => x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h;

/** A bar at 45 degrees ("\"), clipped to a circle. */
const diagonalBar = (cx, cy, half, limit) => (x, y) => {
  if ((x - cx) ** 2 + (y - cy) ** 2 > limit ** 2) return false;
  return Math.abs((x - cx) - (y - cy)) / Math.SQRT2 <= half;
};

/** Pie wedge from 12 o'clock, clockwise, `fraction` of a full turn. */
const wedge = (cx, cy, r, fraction) => (x, y) => {
  if ((x - cx) ** 2 + (y - cy) ** 2 > r ** 2) return false;
  let angle = Math.atan2(x - cx, cy - y); // 0 at 12 o'clock, clockwise
  if (angle < 0) angle += Math.PI * 2;
  return angle <= fraction * Math.PI * 2;
};

/* ── the tile every mark sits on ── */

function tileLayers(size) {
  const radius = Math.max(2, Math.round(size * 0.19));
  // A hard black edge needs room for the mark inside it; at 16px there is
  // none, so the tile edge does the work on its own.
  const border = size >= 32 ? Math.max(2, Math.round(size * 0.07)) : 0;

  if (!border) {
    return [{ test: roundedRect(0, 0, size, radius), colour: LIME }];
  }

  return [
    { test: roundedRect(0, 0, size, radius), colour: INK },
    {
      test: roundedRect(border, border, size - border * 2, Math.max(1, radius - border)),
      colour: LIME
    }
  ];
}

/* ── candidates ── */

const CANDIDATES = {
  /*
   * The prohibition sign. Not clever, and that is the point: it is the one
   * shape a person reads as "blocked" with no learning at all, at 16px, in a
   * strip of other icons. An abstract mark carries no meaning at that size.
   */
  block(size) {
    const c = size / 2;
    const outer = size * 0.31;
    const stroke = Math.max(2, size * 0.105);
    const barHalf = stroke / 2;

    return [
      ...tileLayers(size),
      { test: ring(c, c, outer, outer - stroke), colour: INK },
      { test: diagonalBar(c, c, barHalf, outer), colour: INK }
    ];
  },

  /** A clock running down: says "timed", says nothing about blocking. */
  timer(size) {
    const c = size / 2;
    const outer = size * 0.32;
    const stroke = Math.max(2, size * 0.1);

    return [
      ...tileLayers(size),
      { test: ring(c, c, outer, outer - stroke), colour: INK },
      { test: wedge(c, c, outer - stroke * 1.6, 0.68), colour: INK }
    ];
  },

  /** A padlock, drawn heavy enough not to look like every other blocker. */
  padlock(size) {
    const bodyW = size * 0.46;
    const bodyH = size * 0.36;
    const bodyX = (size - bodyW) / 2;
    const bodyY = size * 0.5;
    const shackleR = size * 0.17;
    const shackleStroke = Math.max(2, size * 0.095);
    const c = size / 2;

    return [
      ...tileLayers(size),
      // shackle: a ring with its lower half cut away
      {
        test: (x, y) =>
          ring(c, bodyY, shackleR, shackleR - shackleStroke)(x, y) && y <= bodyY,
        colour: INK
      },
      { test: roundedRect(bodyX, bodyY, bodyW, Math.max(1, size * 0.06)), colour: INK },
      { test: rect(bodyX, bodyY, bodyW, bodyH), colour: INK }
    ];
  },

  /** The focus reticle that shipped first: distinctive, but abstract. */
  reticle(size) {
    const unit = size / 16;
    const px = n => Math.round(n * unit);
    const stem = Math.max(2, px(2));
    const arm = Math.max(3, px(4));
    const top = px(3);
    const height = size - px(6);
    const left = px(2);
    const right = size - px(2);
    const block = Math.max(4, px(4));
    const blockX = Math.round((size - block) / 2);

    return [
      ...tileLayers(size),
      { test: rect(left, top, stem, height), colour: INK },
      { test: rect(left, top, arm, stem), colour: INK },
      { test: rect(left, top + height - stem, arm, stem), colour: INK },
      { test: rect(right - stem, top, stem, height), colour: INK },
      { test: rect(right - arm, top, arm, stem), colour: INK },
      { test: rect(right - arm, top + height - stem, arm, stem), colour: INK },
      { test: rect(blockX, blockX, block, block), colour: INK }
    ];
  }
};

/* ── raster ── */

function render(name, size) {
  const layers = CANDIDATES[name](size);
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          let colour = CLEAR;

          for (const layer of layers) {
            if (layer.test(px, py)) colour = layer.colour;
          }

          r += colour[0] * colour[3];
          g += colour[1] * colour[3];
          b += colour[2] * colour[3];
          a += colour[3];
        }
      }

      const offset = (y * size + x) * 4;
      // Un-premultiply so partly covered edge pixels keep their true colour.
      pixels[offset] = a ? Math.round(r / a) : 0;
      pixels[offset + 1] = a ? Math.round(g / a) : 0;
      pixels[offset + 2] = a ? Math.round(b / a) : 0;
      pixels[offset + 3] = Math.round(a / (SS * SS));
    }
  }

  return pixels;
}

/* ── png ── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

function toPng(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const raw = Buffer.alloc((width * 4 + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const at = y * (width * 4 + 1);
    raw[at] = 0; // filter: none
    pixels.copy(raw, at + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ── contact sheet ── */

function blit(target, targetWidth, source, sourceSize, atX, atY, scale = 1) {
  for (let y = 0; y < sourceSize * scale; y += 1) {
    for (let x = 0; x < sourceSize * scale; x += 1) {
      const from = (Math.floor(y / scale) * sourceSize + Math.floor(x / scale)) * 4;
      const alpha = source[from + 3] / 255;

      if (alpha === 0) continue;

      const to = ((atY + y) * targetWidth + atX + x) * 4;

      for (let ch = 0; ch < 3; ch += 1) {
        target[to + ch] = Math.round(source[from + ch] * alpha + target[to + ch] * (1 - alpha));
      }

      target[to + 3] = 255;
    }
  }
}

function writeSheet() {
  const names = Object.keys(CANDIDATES);
  const pad = 24;
  const rowHeight = 160;
  const width = pad * 5 + 128 + 48 + 128 + 16;
  const height = pad + names.length * rowHeight;

  const canvas = Buffer.alloc(width * height * 4);

  // paper background
  for (let i = 0; i < width * height; i += 1) {
    canvas[i * 4] = 242;
    canvas[i * 4 + 1] = 237;
    canvas[i * 4 + 2] = 225;
    canvas[i * 4 + 3] = 255;
  }

  names.forEach((name, index) => {
    const y = pad + index * rowHeight;
    let x = pad;

    blit(canvas, width, render(name, 128), 128, x, y);
    x += 128 + pad;

    blit(canvas, width, render(name, 48), 48, x, y + 40);
    x += 48 + pad;

    // 16px at 8x, nearest neighbour, so pixel decisions are visible
    blit(canvas, width, render(name, 16), 16, x, y, 8);
    x += 128 + pad;

    blit(canvas, width, render(name, 16), 16, x, y + 56);
  });

  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist', 'icon-candidates.png'), toPng(width, height, canvas));

  console.log(`\n  dist/icon-candidates.png — rows, top to bottom: ${names.join(', ')}`);
  console.log('  columns: 128, 48, 16 at 8x, 16 actual size');
}

/* ── write ── */

const outDir = join(root, 'icons');
mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const png = toPng(size, size, render(SHIPPED, size));
  writeFileSync(join(outDir, `icon-${size}.png`), png);
  console.log(`  icons/icon-${size}.png  ${String(png.length).padStart(5)} bytes  (${SHIPPED})`);
}

if (process.argv.includes('sheet')) {
  writeSheet();
}

console.log('\n✓ icons written');
