/**
 * Turns a live DOM node into an alpha-free PNG. Not shipped.
 *
 * Shared by make-shots.html and make-tiles.html. Every hard-won detail in here
 * cost a debugging session — the CDATA wrapper, XMLSerializer, the fixed-to-
 * absolute rewrite, the hand-rolled colour-type-2 encoder — so there is exactly
 * one copy of it.
 */

/* ── css ── */

async function asDataUri(root, path) {
  const buffer = await fetch(root + path).then(r => r.arrayBuffer());
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);

  return `data:font/woff2;base64,${btoa(binary)}`;
}

/**
 * Every stylesheet the composition needs, as one string with the fonts
 * base64-inlined.
 *
 * @param {string} root  path prefix from the page to the repo root
 * @param {string[]} hrefs  repo-relative stylesheet paths
 */
export async function collectCss(root, hrefs) {
  /*
   * foreignObject rasterisation cannot reach out for a font file: the SVG is
   * loaded as an image, with no access to anything but data: URIs. Without
   * this the whole image silently falls back to a system font.
   */
  const [latin, latinExt] = await Promise.all([
    asDataUri(root, 'assets/fonts/space-grotesk-latin.woff2'),
    asDataUri(root, 'assets/fonts/space-grotesk-latin-ext.woff2')
  ]);

  const sheets = await Promise.all(
    hrefs.map(href => fetch(root + href).then(r => r.text()))
  );

  // The composition rules live in the calling page's own inline <style>, not
  // in a linked sheet. Leaving them out yields unpositioned content at its
  // natural size.
  const inline = [...document.querySelectorAll('style')]
    .map(node => node.textContent)
    .join('\n');

  /*
   * The base font hangs off `body`, and the outermost wrapper inside a
   * foreignObject is a bare div. Without this the text renders in the document
   * default, which is a serif.
   */
  const rootReset = `
    .shot-root {
      font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
      font-size: 14px;
      line-height: 1.45;
      color: #0a0a0a;
      -webkit-font-smoothing: antialiased;
    }
  `;

  /*
   * `position: fixed` resolves against the viewport, and inside the rasterised
   * SVG the viewport is the whole canvas — the block page's hazard stripes
   * flooded an entire screenshot once. Absolute keeps them inside the mount,
   * which is a containing block by virtue of its transform.
   */
  const pages = sheets
    .join('\n')
    .replace(/position:\s*fixed/g, 'position: absolute');

  return [pages, inline, rootReset]
    .join('\n')
    .replace("url('fonts/space-grotesk-latin.woff2')", `url('${latin}')`)
    .replace("url('fonts/space-grotesk-latin-ext.woff2')", `url('${latinExt}')`);
}

/** Stylesheet paths linked by the calling page, repo-relative. */
export function linkedStylesheets(root) {
  return [...document.querySelectorAll('link[rel="stylesheet"]')]
    .map(link => link.getAttribute('href').replace(root, '').split('?')[0]);
}

/* ── rasterise ── */

export async function rasterise(node, width, height, css, background = '#f2ede1') {
  // XMLSerializer, not outerHTML: the SVG is parsed as XML, where a bare
  // boolean attribute like `hidden` and unclosed void tags are both fatal.
  const markup = new XMLSerializer().serializeToString(node);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    '<foreignObject width="100%" height="100%">',
    '<div xmlns="http://www.w3.org/1999/xhtml" class="shot-root">',
    // CDATA rather than escaping: the stylesheet is a text node in an XML
    // document, where a bare `<` is fatal. One CSS comment mentioning a tag
    // name was enough to break the whole rasterisation with an opaque
    // "source image cannot be decoded". `]]>` is the one sequence CDATA
    // cannot carry, so it is broken up.
    `<style><![CDATA[${css.split(']]>').join(']] >')}]]></style>`,
    markup,
    '</div></foreignObject></svg>'
  ].join('');

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();

  // alpha: false so nothing translucent can survive into the encoder.
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0);

  return canvas;
}

/* ── png, without an alpha channel ── */

/*
 * canvas.toDataURL always emits RGBA, and the store asks for 24-bit PNG with
 * no alpha channel — it says so on the upload field itself. Encoding it here
 * costs about fifty lines and removes any question of the upload being
 * refused. CompressionStream('deflate') produces exactly the zlib wrapper an
 * IDAT chunk wants.
 */
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

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(out.length - 4, crc32(out.subarray(4, out.length - 4)));

  return out;
}

export async function encodePngNoAlpha(canvas) {
  const { width, height } = canvas;
  const { data } = canvas.getContext('2d').getImageData(0, 0, width, height);

  // Each scanline carries a leading filter byte; 0 means "no filtering".
  const raw = new Uint8Array((width * 3 + 1) * height);
  let at = 0;

  for (let y = 0; y < height; y += 1) {
    raw[at] = 0;
    at += 1;

    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      raw[at] = data[from];
      raw[at + 1] = data[from + 1];
      raw[at + 2] = data[from + 2];
      at += 3;
    }
  }

  const deflated = new Uint8Array(
    await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))
    ).arrayBuffer()
  );

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type 2: RGB, no alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflated),
    chunk('IEND', new Uint8Array(0))
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;

  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }

  return png;
}

/** POSTs the bytes to the dev server, which writes them under store/. */
export async function save(name, bytes) {
  const response = await fetch(`/__write?name=${name}`, { method: 'POST', body: bytes });
  return response.ok ? `store/${name}` : `failed: ${response.status}`;
}
