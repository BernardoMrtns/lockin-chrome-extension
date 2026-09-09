/**
 * Pre-publish checks. Run with `npm run check`.
 *
 * There is no build step, so this stands in for one: it parses every source
 * file, proves the locales agree with each other and with the code, and
 * fails on the things the Chrome Web Store review rejects extensions for.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const problems = [];
const notes = [];

const fail = message => problems.push(message);
const note = message => notes.push(message);

function read(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

/**
 * Blanks out comments while preserving offsets and line count, so checks that
 * look for forbidden constructs do not trip over prose describing them.
 * The `//` case ignores `://` so protocol-relative text survives intact.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (match, prefix) => prefix + ' '.repeat(match.length - prefix.length));
}

function walk(dir, out = []) {
  for (const entry of readdirSync(join(root, dir))) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') {
      continue;
    }

    const relPath = dir ? `${dir}/${entry}` : entry;

    if (statSync(join(root, relPath)).isDirectory()) {
      walk(relPath, out);
    } else {
      out.push(relPath);
    }
  }

  return out;
}

const allFiles = walk('');

// tools/ is dev-only and excluded from the zip, so it is parsed but exempt from
// the rules about what may ship (no remote URLs, no forbidden CSS, size).
const DEV_ONLY = new Set(['LICENSE', 'package.json', '.gitignore']);
const isShipped = file =>
  !file.startsWith('tools/') && !DEV_ONLY.has(file) && !file.endsWith('.md');

const files = allFiles.filter(isShipped);
const jsFiles = files.filter(file => file.endsWith('.js'));
const htmlFiles = files.filter(file => file.endsWith('.html'));
const cssFiles = files.filter(file => file.endsWith('.css'));

/* ── 1. every JS file parses, tools included ── */

for (const file of allFiles.filter(f => f.endsWith('.js') || f.endsWith('.mjs'))) {
  try {
    execFileSync(process.execPath, ['--check', join(root, file)], { stdio: 'pipe' });
  } catch (error) {
    fail(`${file} does not parse:\n${String(error.stderr || error.message).trim()}`);
  }
}

/* ── 2. every JSON file parses ── */

const json = {};

for (const file of allFiles.filter(candidate => candidate.endsWith('.json'))) {
  try {
    json[file] = JSON.parse(read(file));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }
}

/* ── 3. locales agree with each other ── */

const localeDirs = readdirSync(join(root, '_locales'));
const locales = {};

for (const locale of localeDirs) {
  const path = `_locales/${locale}/messages.json`;
  locales[locale] = json[path] || {};
}

const [baseLocale, ...otherLocales] = localeDirs;
const baseKeys = new Set(Object.keys(locales[baseLocale]));

for (const locale of otherLocales) {
  const keys = new Set(Object.keys(locales[locale]));

  for (const key of baseKeys) {
    if (!keys.has(key)) {
      fail(`_locales/${locale} is missing key "${key}" (present in ${baseLocale})`);
    }
  }

  for (const key of keys) {
    if (!baseKeys.has(key)) {
      fail(`_locales/${baseLocale} is missing key "${key}" (present in ${locale})`);
    }
  }
}

/* ── 3b. the code's locale list matches the _locales directories ── */

const i18nSource = read('src/utils/i18n.js');
const declaredCodes = [...i18nSource.matchAll(/\{\s*code:\s*'([^']+)'/g)].map(m => m[1]);

for (const code of declaredCodes) {
  if (!localeDirs.includes(code)) {
    fail(`i18n.js declares locale "${code}" but _locales/${code} does not exist`);
  }
}

for (const dir of localeDirs) {
  if (!declaredCodes.includes(dir)) {
    fail(`_locales/${dir} exists but i18n.js does not list it, so it is unreachable`);
  }
}

// English is the fallback in i18n.js, so it must be the comparison base here.
if (baseLocale !== 'en') {
  fail(`locale comparison base is "${baseLocale}" but i18n.js falls back to English`);
}

const flagKeys = [...read('src/ui/language.js').matchAll(/^\s{2}(\w+):\s*`/gm)].map(m => m[1]);

for (const code of declaredCodes) {
  const flag = i18nSource.match(
    new RegExp(`code:\\s*'${code}'[^}]*flag:\\s*'([^']+)'`)
  )?.[1];

  if (flag && !flagKeys.includes(flag)) {
    fail(`locale "${code}" wants flag "${flag}" but language.js has no such drawing`);
  }
}

/* ── 4. messages are legal for Chrome's own message parser ── */

/*
 * Chrome parses the whole default-locale bundle when the extension loads, and
 * reads `$NAME$` as a named placeholder that must be declared in that entry's
 * `placeholders` block. One undeclared name fails the entire manifest with
 * "Variable $NAME$ used but not defined" — not just that one string.
 *
 * The trap is a message like "$1h$2": the `$1h$` in the middle looks like a
 * placeholder called "1h". Two positional substitutions separated by letters
 * must be written the long way, with declared placeholders.
 */
const NAMED_PLACEHOLDER = /\$([A-Za-z0-9_@]+)\$/g;

/** `$$` is Chrome's escape for a literal `$`; blank it before scanning. */
function withoutEscapes(message) {
  return String(message ?? '').split('$$').join('  ');
}

/** The message with named placeholders expanded to their positional content. */
function resolveNamed(entry) {
  let out = withoutEscapes(entry?.message);

  for (const [name, definition] of Object.entries(entry?.placeholders || {})) {
    out = out.replace(new RegExp(`\\$${name}\\$`, 'gi'), definition?.content ?? '');
  }

  return out;
}

for (const locale of localeDirs) {
  for (const [key, entry] of Object.entries(locales[locale])) {
    const declared = new Map(
      Object.keys(entry.placeholders || {}).map(name => [name.toLowerCase(), name])
    );
    const used = new Set();

    for (const [, name] of withoutEscapes(entry.message).matchAll(NAMED_PLACEHOLDER)) {
      used.add(name.toLowerCase());

      if (!declared.has(name.toLowerCase())) {
        fail(
          `_locales/${locale} "${key}" uses $${name}$ but declares no such placeholder — `
          + `Chrome refuses to load the extension with `
          + `"Variable $${name}$ used but not defined"`
        );
      }
    }

    for (const [lower, name] of declared) {
      if (!used.has(lower)) {
        fail(`_locales/${locale} "${key}" declares placeholder "${name}" but never uses $${name}$`);
      }

      if (!entry.placeholders[name]?.content) {
        fail(`_locales/${locale} "${key}" placeholder "${name}" has no content`);
      }
    }
  }
}

/* ── 4b. no mojibake ── */

/*
 * U+FFFD is what a lossy encoding round-trip leaves behind. It renders as a
 * black diamond and is easy to miss in a diff, so fail on it outright.
 */
// Written as an escape, not the literal glyph, so this file does not flag itself.
const REPLACEMENT_CHAR = new RegExp('\uFFFD', 'g');

for (const file of allFiles.filter(f => /\.(json|js|mjs|html|css|md)$/.test(f))) {
  const source = read(file);
  const count = (source.match(REPLACEMENT_CHAR) || []).length;

  if (count) {
    fail(`${file} contains ${count} U+FFFD replacement character(s) — text was corrupted somewhere`);
  }
}

/* ── 5. placeholder counts match across locales ── */

function maxPlaceholder(entry) {
  const found = resolveNamed(entry).match(/\$([1-9])/g) || [];
  return found.reduce((max, token) => Math.max(max, Number(token.slice(1))), 0);
}

for (const key of baseKeys) {
  const counts = localeDirs.map(locale => maxPlaceholder(locales[locale][key]));

  if (new Set(counts).size > 1) {
    fail(`"${key}" uses a different number of placeholders per locale: ${
      localeDirs.map((locale, index) => `${locale}=${counts[index]}`).join(', ')
    }`);
  }
}

/* ── 6. keys used in code all exist ── */

const usedKeys = new Set();

for (const file of [...jsFiles, ...htmlFiles]) {
  const source = read(file);

  for (const match of source.matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)) {
    usedKeys.add(match[1]);
  }

  for (const match of source.matchAll(/data-i18n(?:-placeholder)?="([A-Za-z0-9_]+)"/g)) {
    usedKeys.add(match[1]);
  }

  for (const match of source.matchAll(/getMessage\(\s*'([A-Za-z0-9_]+)'/g)) {
    usedKeys.add(match[1]);
  }

  // plural('countBlocked', n) resolves to countBlockedOne / countBlockedOther.
  for (const match of source.matchAll(/\bplural\(\s*'([A-Za-z0-9_]+)'/g)) {
    usedKeys.add(`${match[1]}One`);
    usedKeys.add(`${match[1]}Other`);
  }
}

// Keys built at runtime from a list rather than written out literally.
for (const match of read('blocked.js').matchAll(/'(blockedShout\d)'/g)) {
  usedKeys.add(match[1]);
}

for (const match of read('popup.js').matchAll(/key:\s*'([A-Za-z0-9_]+)'/g)) {
  usedKeys.add(match[1]);
}

for (const key of usedKeys) {
  if (!baseKeys.has(key)) {
    fail(`code uses i18n key "${key}" but no locale defines it`);
  }
}

/* ── 7. manifest sanity ── */

const manifest = json['manifest.json'] || {};

for (const match of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
  if (!baseKeys.has(match[1])) {
    fail(`manifest references __MSG_${match[1]}__ but no locale defines it`);
  }
}

if (manifest.host_permissions?.length) {
  fail(`manifest declares host_permissions (${manifest.host_permissions.join(', ')}) — these trigger slow review`);
}

if (manifest.web_accessible_resources) {
  fail('manifest declares web_accessible_resources — this exposes the extension ID to every page');
}

const KNOWN_USED_PERMISSIONS = new Set(['storage', 'tabs', 'alarms']);

for (const permission of manifest.permissions || []) {
  if (!KNOWN_USED_PERMISSIONS.has(permission)) {
    fail(`manifest declares permission "${permission}" which the code never uses`);
  }
}

for (const referenced of [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {})
]) {
  if (referenced && !files.includes(referenced)) {
    fail(`manifest points at "${referenced}" which does not exist`);
  }
}

/* ── 8. nothing loads from the network ── */

/*
 * XML namespace URIs are identifiers, not addresses — createElementNS requires
 * the SVG one verbatim and nothing is ever fetched from it.
 */
const NAMESPACE_URIS = new Set([
  'http://www.w3.org/2000/svg',
  'http://www.w3.org/1999/xhtml',
  'http://www.w3.org/1999/xlink'
]);

/*
 * Addresses the extension hands to the browser when the user clicks, and never
 * requests itself. The donation link is data, like the address it sits next to;
 * what matters is that nothing here is loaded into a page.
 */
const OUTBOUND_LINKS = new Set([
  'https://livepix.gg/bernardomrtns'
]);

for (const file of [...htmlFiles, ...cssFiles, ...jsFiles]) {
  // Comments may cite a URL; only fetched references matter.
  for (const match of stripComments(read(file)).matchAll(/https?:\/\/[^\s'"()]+/g)) {
    if (NAMESPACE_URIS.has(match[0]) || OUTBOUND_LINKS.has(match[0])) {
      continue;
    }

    fail(`${file} references a remote URL (${match[0]}) — everything must be bundled`);
  }
}

// An allowlisted link must stay a link: never fetched, never loaded into a page.
for (const file of [...htmlFiles, ...cssFiles, ...jsFiles]) {
  const source = stripComments(read(file));

  for (const pattern of [
    /fetch\(\s*['"`]https?:/,
    /(?:src|href)\s*=\s*['"`]https?:/,
    /import\(\s*['"`]https?:/,
    /@import\s+(?:url\()?['"]?https?:/
  ]) {
    if (pattern.test(source)) {
      fail(`${file} loads something over the network (${pattern.source})`);
    }
  }
}

/* ── 9. local assets referenced by CSS/HTML exist ── */

for (const file of [...cssFiles, ...htmlFiles]) {
  const source = read(file);
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';

  const refs = [
    ...[...source.matchAll(/url\(\s*'([^']+)'\s*\)/g)].map(match => match[1]),
    ...[...source.matchAll(/(?:href|src)="([^"#:]+)"/g)].map(match => match[1])
  ];

  for (const ref of refs) {
    const resolved = relative(root, join(root, dir, ref)).replace(/\\/g, '/');

    if (!files.includes(resolved)) {
      fail(`${file} references "${ref}" which resolves to a missing file (${resolved})`);
    }
  }
}

/* ── 9b. the donation addresses are well formed ── */

/*
 * A mistyped address sends someone's money nowhere recoverable, and a QR code
 * makes it impossible to notice by eye. Both address formats carry enough
 * structure to be checked, so they are checked on every run.
 */
// Imported rather than scraped: qr-codes.js is generated data with no browser
// dependencies, so Node can load it and there is no quoting to guess at.
const qrModule = await import(new URL('../src/ui/qr-codes.js', import.meta.url));

/** bech32 checksum, per BIP-173. */
function bech32Check(address) {
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

  const polymod = values => {
    let chk = 1;
    for (const v of values) {
      const top = chk >>> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i += 1) if ((top >>> i) & 1) chk ^= GEN[i];
    }
    return chk;
  };

  const split = address.lastIndexOf('1');
  if (split < 1) return { ok: false, why: 'no separator' };

  const hrp = address.slice(0, split);
  const data = [];

  for (const c of address.slice(split + 1)) {
    const idx = CHARSET.indexOf(c);
    if (idx === -1) return { ok: false, why: `bad character "${c}"` };
    data.push(idx);
  }

  const expand = [];
  for (const c of hrp) expand.push(c.charCodeAt(0) >>> 5);
  expand.push(0);
  for (const c of hrp) expand.push(c.charCodeAt(0) & 31);

  const check = polymod([...expand, ...data]);
  if (check !== 1) return { ok: false, why: `checksum failed (0x${check.toString(16)})` };

  return { ok: true, hrp, witnessVersion: data[0], dataLength: data.length };
}

/** base58 decode, returning the byte length. */
function base58Length(input) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = 0n;

  for (const c of input) {
    const idx = ALPHABET.indexOf(c);
    if (idx === -1) return { ok: false, why: `bad character "${c}"` };
    num = num * 58n + BigInt(idx);
  }

  let length = 0;
  while (num > 0n) { num >>= 8n; length += 1; }
  for (const c of input) { if (c === '1') length += 1; else break; }

  return { ok: true, length };
}

/*
 * Pinned copies of the addresses.
 *
 * Both were read off the Ledger app by the project owner and confirmed
 * character-for-character against these values on 2026-09-09.
 *
 * This exists because structure is not enough. A bech32 address carries a
 * checksum, so a typo in the Bitcoin one is caught below. A Solana address is
 * 32 raw bytes with no checksum at all: every 32-byte value is a syntactically
 * valid address, and Node's key import does not validate curve membership
 * either (measured: it rejects about 1% of single-character typos). Pinning is
 * the only thing that catches a silent edit, which is the failure that actually
 * happens — an editor mangling a character, a bad copy-paste, a lossy tool.
 *
 * Changing an address means changing it here too, on purpose.
 */
const EXPECTED_ADDRESSES = {
  LIVEPIX: 'https://livepix.gg/bernardomrtns',
  BTC: 'bc1qx249y9c7zvzv465jpekvp83yd8ztlk5gw0nqh2',
  SOL: 'G6Uqy8n3maKwYuDvtF4W4PAsFtg9xtubRopx7z8981RC'
};

for (const [key, expected] of Object.entries(EXPECTED_ADDRESSES)) {
  const actual = qrModule[key]?.text;

  if (actual !== expected) {
    fail(
      `${key} address changed: qr-codes.js has "${actual}" but check.mjs pins `
      + `"${expected}". If the change is intended, update the pin as well.`
    );
  }
}

const btcAddress = qrModule.BTC?.text ?? null;
const solAddress = qrModule.SOL?.text ?? null;

if (!btcAddress) {
  fail('could not read the BTC address out of src/ui/qr-codes.js');
} else {
  const result = bech32Check(btcAddress);

  if (!result.ok) {
    fail(`BTC address ${btcAddress} is not valid bech32: ${result.why}`);
  } else if (result.hrp !== 'bc') {
    fail(`BTC address ${btcAddress} is not mainnet (prefix "${result.hrp}")`);
  } else if (result.witnessVersion !== 0 || result.dataLength !== 39) {
    fail(`BTC address ${btcAddress} is not a P2WPKH address`);
  }
}

if (!solAddress) {
  fail('could not read the SOL address out of src/ui/qr-codes.js');
} else {
  const result = base58Length(solAddress);

  if (!result.ok) {
    fail(`SOL address ${solAddress} is not valid base58: ${result.why}`);
  } else if (result.length !== 32) {
    fail(`SOL address ${solAddress} decodes to ${result.length} bytes, expected 32`);
  }
}

/* ── 10. the aesthetic rules, enforced ── */

const bannedInCss = [
  [/backdrop-filter/, 'backdrop-filter'],
  [/-webkit-text-fill-color\s*:\s*transparent/, 'gradient text'],
  [/filter\s*:\s*blur/, 'blur filter']
];

for (const file of cssFiles) {
  const source = stripComments(read(file));

  for (const [pattern, label] of bannedInCss) {
    if (pattern.test(source)) {
      fail(`${file} uses ${label} — the design system forbids it`);
    }
  }
}

/* ── 11. size ── */

const totalBytes = files.reduce((sum, file) => sum + statSync(join(root, file)).size, 0);

note(`shipped payload: ${(totalBytes / 1024).toFixed(1)} KB across ${files.length} files`);
note(`locales: ${localeDirs.join(', ')} · ${baseKeys.size} keys each · ${usedKeys.size} used in code`);

const unused = [...baseKeys].filter(key => !usedKeys.has(key) && !key.startsWith('ext'));

if (unused.length) {
  note(`unused i18n keys: ${unused.join(', ')}`);
}

/* ── report ── */

for (const line of notes) {
  console.log(`  · ${line}`);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n`);

  for (const problem of problems) {
    console.error(`  ✗ ${problem}`);
  }

  process.exit(1);
}

console.log('\n✓ all checks passed');
