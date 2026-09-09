/**
 * Builds the Chrome Web Store upload zip. Run with `npm run zip`.
 *
 * Runs the checks first and refuses to package if any fail, so a broken
 * manifest or a missing translation cannot reach the store listing.
 *
 * The archive is written here rather than shelled out to a zip tool: Windows
 * PowerShell 5.1's Compress-Archive writes entry paths with backslashes, which
 * the ZIP spec forbids and which some consumers extract as flat filenames.
 * Node ships zlib, so a correct archive is cheaper than the workaround.
 */
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

import { PAYLOAD } from './payload.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/* ── checks gate the package ── */

console.log('running checks first...\n');

try {
  execFileSync(process.execPath, [join(root, 'tools', 'check.mjs')], {
    stdio: 'inherit',
    cwd: root
  });
} catch {
  console.error('\nchecks failed — not packaging.');
  process.exit(1);
}

/* ── collect the payload ── */

function collect(entry, out = []) {
  const absolute = join(root, entry);

  if (!existsSync(absolute)) {
    throw new Error(`payload entry "${entry}" does not exist`);
  }

  if (statSync(absolute).isDirectory()) {
    for (const child of readdirSync(absolute)) {
      collect(`${entry}/${child}`, out);
    }
  } else {
    out.push(entry);
  }

  return out;
}

const paths = PAYLOAD.flatMap(entry => collect(entry));

/* ── minimal zip writer ── */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date/time, as the ZIP local header expects. */
function dosStamp(date) {
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2));
  const day =
    ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { time, day };
}

const now = new Date();
const { time, day } = dosStamp(now);

const locals = [];
const centrals = [];
let offset = 0;

for (const path of paths) {
  // ZIP entry names always use forward slashes, whatever the host platform is.
  const name = Buffer.from(path.split(/[\\/]/).join('/'), 'utf8');
  const contents = readFileSync(join(root, path));
  const compressed = deflateRawSync(contents, { level: 9 });

  // Only take the deflated form when it actually helps.
  const useDeflate = compressed.length < contents.length;
  const body = useDeflate ? compressed : contents;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(contents);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(method, 8);
  localHeader.writeUInt16LE(time, 10);
  localHeader.writeUInt16LE(day, 12);
  localHeader.writeUInt32LE(crc, 14);
  localHeader.writeUInt32LE(body.length, 18);
  localHeader.writeUInt32LE(contents.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28); // extra field length

  locals.push(localHeader, name, body);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0, 8); // flags
  centralHeader.writeUInt16LE(method, 10);
  centralHeader.writeUInt16LE(time, 12);
  centralHeader.writeUInt16LE(day, 14);
  centralHeader.writeUInt32LE(crc, 16);
  centralHeader.writeUInt32LE(body.length, 20);
  centralHeader.writeUInt32LE(contents.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra
  centralHeader.writeUInt16LE(0, 32); // comment
  centralHeader.writeUInt16LE(0, 34); // disk number
  centralHeader.writeUInt16LE(0, 36); // internal attrs
  centralHeader.writeUInt32LE(0, 38); // external attrs
  centralHeader.writeUInt32LE(offset, 42);

  centrals.push(centralHeader, name);

  offset += localHeader.length + name.length + body.length;
}

const centralDirectory = Buffer.concat(centrals);

const endRecord = Buffer.alloc(22);
endRecord.writeUInt32LE(0x06054b50, 0);
endRecord.writeUInt16LE(0, 4); // this disk
endRecord.writeUInt16LE(0, 6); // disk with central directory
endRecord.writeUInt16LE(paths.length, 8);
endRecord.writeUInt16LE(paths.length, 10);
endRecord.writeUInt32LE(centralDirectory.length, 12);
endRecord.writeUInt32LE(offset, 16);
endRecord.writeUInt16LE(0, 20); // comment length

/* ── write it out ── */

const { version } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const outDir = join(root, 'dist');

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const outFile = join(outDir, `lock-in-${version}.zip`);
writeFileSync(outFile, Buffer.concat([...locals, centralDirectory, endRecord]));

const kb = (statSync(outFile).size / 1024).toFixed(1);

console.log(`\n✓ packaged dist/lock-in-${version}.zip — ${paths.length} files, ${kb} KB`);
console.log('  upload at https://chrome.google.com/webstore/devconsole');
