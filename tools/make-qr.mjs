/**
 * Generates src/ui/qr-codes.js — the donation QR codes as module matrices.
 * Run with `npm run qr`.
 *
 * The codes are generated here rather than fetched from a QR service because
 * the extension makes no network requests at all: that is what keeps store
 * review on the fast path and stops it leaking anything about its users.
 * Embedding LivePix's own widget iframe would break the same rule.
 *
 * The crypto codes encode the bare address, not a `bitcoin:` / `solana:` URI.
 * Every wallet scanner reads a bare address, and it means the QR content is
 * character-for-character what the page displays next to it — so a cautious
 * donor can cross-check the two by eye. That is worth more than deep-linking.
 *
 * Byte mode, error correction level M, versions 1-10, smallest that fits.
 * Reference: ISO/IEC 18004; the tables below are the standard ones.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const PAYLOADS = [
  {
    key: 'LIVEPIX',
    label: 'LivePix',
    // The public donation page. The widget/embed URL is a page that *renders* a
    // QR code; encoding that one sends whoever scans it to another QR code.
    text: 'https://livepix.gg/bernardomrtns'
  },
  {
    key: 'BTC',
    label: 'Bitcoin',
    text: 'bc1qx249y9c7zvzv465jpekvp83yd8ztlk5gw0nqh2'
  },
  {
    key: 'SOL',
    label: 'Solana',
    text: 'G6Uqy8n3maKwYuDvtF4W4PAsFtg9xtubRopx7z8981RC'
  }
];

const OUT = fileURLToPath(new URL('../src/ui/qr-codes.js', import.meta.url));

/* ── tables (error correction level M) ── */

const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/**
 * Per version: [ecCodewordsPerBlock, blocksInGroup1, dataPerBlockGroup1,
 *               blocksInGroup2, dataPerBlockGroup2]
 */
const EC_BLOCKS = [
  null,
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44]
];

const ALIGNMENT = [
  null, [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
];

const VERSION_BITS = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

/**
 * Data modules left over after the last whole codeword, per version. The
 * standard leaves 7 spare bits in versions 2 to 6; they are written as zero.
 */
const REMAINDER_BITS = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0];

/* ── GF(256) ── */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generatorPoly(degree) {
  let poly = [1];

  for (let i = 0; i < degree; i += 1) {
    const next = new Array(poly.length + 1).fill(0);

    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }

    poly = next;
  }

  return poly;
}

function errorCodewords(data, count) {
  const gen = generatorPoly(count);
  const remainder = new Array(count).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);

    for (let i = 0; i < count; i += 1) {
      remainder[i] ^= mul(gen[i + 1], factor);
    }
  }

  return remainder;
}

/* ── bit stream ── */

function bitsToCodewords(bits) {
  const out = [];

  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ?? 0);
    out.push(byte);
  }

  return out;
}

const dataCapacity = version => {
  const [, b1, d1, b2, d2] = EC_BLOCKS[version];
  return b1 * d1 + b2 * d2;
};

function pickVersion(byteLength) {
  for (let version = 1; version <= 10; version += 1) {
    const header = 4 + (version >= 10 ? 16 : 8);
    if (Math.ceil((header + byteLength * 8) / 8) <= dataCapacity(version)) {
      return version;
    }
  }

  throw new Error(`${byteLength} bytes does not fit versions 1-10 at level M`);
}

function buildCodewords(bytes, version) {
  const capacity = dataCapacity(version);
  const bits = [];
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, version >= 10 ? 16 : 8);
  for (const byte of bytes) push(byte, 8);

  push(0, Math.min(4, capacity * 8 - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = bitsToCodewords(bits);
  const PAD = [0xec, 0x11];
  let padIndex = 0;

  while (codewords.length < capacity) {
    codewords.push(PAD[padIndex % 2]);
    padIndex += 1;
  }

  return codewords;
}

function interleave(codewords, version) {
  const [ecPerBlock, blocks1, data1, blocks2, data2] = EC_BLOCKS[version];
  const groups = [];
  let at = 0;

  for (let i = 0; i < blocks1; i += 1) {
    groups.push(codewords.slice(at, at + data1));
    at += data1;
  }
  for (let i = 0; i < blocks2; i += 1) {
    groups.push(codewords.slice(at, at + data2));
    at += data2;
  }

  const ecGroups = groups.map(block => errorCodewords(block, ecPerBlock));
  const out = [];
  const longest = Math.max(...groups.map(g => g.length));

  for (let i = 0; i < longest; i += 1) {
    for (const block of groups) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecPerBlock; i += 1) {
    for (const block of ecGroups) out.push(block[i]);
  }

  return out;
}

/* ── module placement ── */

function emptyMatrix(size) {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array(size).fill(0)),
    reserved: Array.from({ length: size }, () => new Array(size).fill(false))
  };
}

function placeFinder(m, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue;

      const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const onRing = r === 0 || r === 6 || c === 0 || c === 6;
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4;

      m.modules[rr][cc] = inside && (onRing || inCore) ? 1 : 0;
      m.reserved[rr][cc] = true;
    }
  }
}

function placeAlignment(m, version) {
  const centres = ALIGNMENT[version];

  for (const r of centres) {
    for (const c of centres) {
      const nearFinder =
        (r === 6 && c === 6) ||
        (r === 6 && c === m.size - 7) ||
        (r === m.size - 7 && c === 6);
      if (nearFinder) continue;

      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          const ring = Math.max(Math.abs(dr), Math.abs(dc));
          m.modules[r + dr][c + dc] = ring === 1 ? 0 : 1;
          m.reserved[r + dr][c + dc] = true;
        }
      }
    }
  }
}

function placeTiming(m) {
  for (let i = 8; i < m.size - 8; i += 1) {
    const bit = i % 2 === 0 ? 1 : 0;
    if (!m.reserved[6][i]) { m.modules[6][i] = bit; m.reserved[6][i] = true; }
    if (!m.reserved[i][6]) { m.modules[i][6] = bit; m.reserved[i][6] = true; }
  }
}

/**
 * Marks the format and version areas as taken so data placement skips them.
 * Runs after the timing patterns, whose column 6 and row 6 win the overlap.
 */
function reserveFormatAreas(m, version) {
  for (let i = 0; i <= 8; i += 1) {
    if (!m.reserved[8][i]) { m.reserved[8][i] = true; }
    if (!m.reserved[i][8]) { m.reserved[i][8] = true; }
  }

  for (let i = 0; i < 8; i += 1) {
    m.reserved[8][m.size - 1 - i] = true;
    m.reserved[m.size - 1 - i][8] = true;
  }

  m.modules[m.size - 8][8] = 1; // the always-dark module
  m.reserved[m.size - 8][8] = true;

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const r = Math.floor(i / 3);
      const c = i % 3;
      m.reserved[m.size - 11 + c][r] = true;
      m.reserved[r][m.size - 11 + c] = true;
    }
  }
}

/** Zigzag placement in two-column strips, right to left, skipping column 6. */
function placeData(m, codewords) {
  const bits = [];
  for (const byte of codewords) {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >>> i) & 1);
  }

  let at = 0;
  let upward = true;
  let col = m.size - 1;

  while (col > 0) {
    if (col === 6) col -= 1; // the vertical timing pattern is not a data column

    for (let step = 0; step < m.size; step += 1) {
      const row = upward ? m.size - 1 - step : step;

      for (const c of [col, col - 1]) {
        if (m.reserved[row][c]) continue;
        m.modules[row][c] = bits[at] ?? 0;
        at += 1;
      }
    }

    upward = !upward;
    col -= 2;
  }

  return at;
}

/* ── masking ── */

const MASKS = [
  (i, j) => (i + j) % 2 === 0,
  i => i % 2 === 0,
  (i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0
];

function formatBits(mask) {
  const data = (0b00 << 3) | mask; // level M is 00
  let value = data << 10;

  for (let i = 4; i >= 0; i -= 1) {
    if ((value >>> (i + 10)) & 1) value ^= 0x537 << i;
  }

  return ((data << 10) | value) ^ 0x5412;
}

/**
 * Writes both copies of the format information.
 *
 * The split matters: the second copy puts bits 0-6 up the bottom-left column
 * and bits 7-14 along the top-right row. Taking one bit too many down the
 * column overwrites the always-dark module.
 */
function applyFormat(m, mask) {
  const bits = formatBits(mask);
  const bit = i => (bits >>> i) & 1;
  const set = (row, col, value) => { m.modules[row][col] = value; };

  // Copy one, wrapped around the top-left finder: up column 8, then along
  // row 8. Note the axes — the published placement is usually written as
  // (x, y), and reading it as (row, col) silently transposes the whole block.
  for (let i = 0; i <= 5; i += 1) set(i, 8, bit(i));
  set(7, 8, bit(6));
  set(8, 8, bit(7));
  set(8, 7, bit(8));
  for (let i = 9; i <= 14; i += 1) set(8, 14 - i, bit(i));

  // Copy two: bits 0-7 along row 8 from the right edge, bits 8-14 up the
  // bottom-left column. The split leaves the always-dark module untouched.
  for (let i = 0; i <= 7; i += 1) set(8, m.size - 1 - i, bit(i));
  for (let i = 8; i <= 14; i += 1) set(m.size - 15 + i, 8, bit(i));

  set(m.size - 8, 8, 1);
}

function applyVersionInfo(m, version) {
  if (version < 7) return;

  const bits = VERSION_BITS[version];

  for (let i = 0; i < 18; i += 1) {
    const value = (bits >>> i) & 1;
    const r = Math.floor(i / 3);
    const c = i % 3;
    m.modules[m.size - 11 + c][r] = value;
    m.modules[r][m.size - 11 + c] = value;
  }
}

function penalty(m) {
  const { size, modules } = m;
  const readers = [(a, b) => modules[a][b], (a, b) => modules[b][a]];
  let score = 0;

  for (let i = 0; i < size; i += 1) {
    for (const read of readers) {
      let run = 1;
      for (let j = 1; j < size; j += 1) {
        if (read(i, j) === read(i, j - 1)) {
          run += 1;
        } else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
  }

  for (let i = 0; i < size - 1; i += 1) {
    for (let j = 0; j < size - 1; j += 1) {
      const v = modules[i][j];
      if (v === modules[i][j + 1] && v === modules[i + 1][j] && v === modules[i + 1][j + 1]) {
        score += 3;
      }
    }
  }

  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j <= size - 11; j += 1) {
      for (const read of readers) {
        let matchA = true;
        let matchB = true;

        for (let k = 0; k < 11; k += 1) {
          const v = read(i, j + k);
          if (v !== A[k]) matchA = false;
          if (v !== B[k]) matchB = false;
        }

        if (matchA) score += 40;
        if (matchB) score += 40;
      }
    }
  }

  let dark = 0;
  for (let i = 0; i < size; i += 1) {
    for (let j = 0; j < size; j += 1) if (modules[i][j]) dark += 1;
  }

  score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;

  return score;
}

/* ── build ── */

function encode(text) {
  const bytes = [...Buffer.from(text, 'utf8')];
  const version = pickVersion(bytes.length);
  const size = version * 4 + 17;
  const codewords = interleave(buildCodewords(bytes, version), version);

  if (codewords.length !== TOTAL_CODEWORDS[version]) {
    throw new Error(
      `version ${version}: got ${codewords.length} codewords, expected ${TOTAL_CODEWORDS[version]}`
    );
  }

  let best = null;

  for (let mask = 0; mask < 8; mask += 1) {
    const m = emptyMatrix(size);

    placeFinder(m, 0, 0);
    placeFinder(m, 0, size - 7);
    placeFinder(m, size - 7, 0);
    placeAlignment(m, version);
    placeTiming(m);
    reserveFormatAreas(m, version);

    const placed = placeData(m, codewords);
    const slack = placed - codewords.length * 8;

    // The data region is not always a whole number of codewords: versions 2-6
    // leave 7 "remainder" bits over, which are placed as zero and ignored by
    // readers. Anything other than the documented slack means the function
    // patterns were laid out wrong.
    if (slack !== REMAINDER_BITS[version]) {
      throw new Error(
        `version ${version}: ${placed} data cells for ${codewords.length * 8} bits `
        + `(slack ${slack}, expected ${REMAINDER_BITS[version]})`
      );
    }

    for (let i = 0; i < size; i += 1) {
      for (let j = 0; j < size; j += 1) {
        if (!m.reserved[i][j] && MASKS[mask](i, j)) m.modules[i][j] ^= 1;
      }
    }

    applyFormat(m, mask);
    applyVersionInfo(m, version);

    const score = penalty(m);
    if (!best || score < best.score) best = { score, mask, m, version, size };
  }

  return best;
}

const results = PAYLOADS.map(payload => ({ ...payload, qr: encode(payload.text) }));

const body = results
  .map(({ key, label, text, qr }) => `
/** ${label} — QR version ${qr.version} (${qr.size}x${qr.size}), level M, mask ${qr.mask}. */
export const ${key} = {
  label: ${JSON.stringify(label)},
  text: ${JSON.stringify(text)},
  size: ${qr.size},
  rows: [
${qr.m.modules.map(row => `    '${row.join('')}'`).join(',\n')}
  ]
};`)
  .join('\n');

writeFileSync(
  OUT,
  `/**
 * Donation QR codes. Generated by tools/make-qr.mjs — do not hand-edit;
 * run \`npm run qr\` after changing an address.
 *
 * Stored as module matrices rather than images so the page renders them as
 * inline SVG: no extra request, and nothing fetched from the network.
 *
 * \`text\` is exactly what the QR encodes, and exactly what the page shows next
 * to it, so the two can be checked against each other.
 */
${body}

export const ALL = [LIVEPIX, BTC, SOL];
`,
  'utf8'
);

for (const { label, text, qr } of results) {
  console.log(
    `  ${label.padEnd(8)} v${qr.version} ${String(qr.size).padStart(2)}x${qr.size}  mask ${qr.mask}  penalty ${String(qr.score).padStart(4)}  ${text.length} chars`
  );
}

console.log('\n✓ wrote src/ui/qr-codes.js');
