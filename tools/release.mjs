/**
 * Cuts a release. Run with `npm run release -- patch` (or minor, major, or an
 * explicit version like 1.2.0).
 *
 * The version lives in two files, has to be greater than the last one, and the
 * store only accepts a package whose number beats what is already published.
 * Doing that by hand is four steps with one silent failure mode each, so it is
 * one step here:
 *
 *   1. bump manifest.json and package.json together
 *   2. run the checks and the tests
 *   3. build dist/lock-in-<version>.zip
 *   4. commit and tag
 *
 * If the checks or the tests fail, the version files are put back the way they
 * were. A half-applied release is worse than no release.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const VERSION_FILES = ['manifest.json', 'package.json'];

const die = message => {
  console.error(`\n  ${message}\n`);
  process.exit(1);
};

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const run = (...args) => execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' });

/* ── what are we releasing ── */

const requested = process.argv[2];

if (!requested) {
  die('usage: npm run release -- <patch|minor|major|x.y.z>');
}

const current = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).version;
const parts = current.split('.').map(Number);

if (parts.length !== 3 || parts.some(Number.isNaN)) {
  die(`the current version "${current}" is not x.y.z, so it cannot be bumped automatically`);
}

const BUMPS = {
  major: ([x]) => [x + 1, 0, 0],
  minor: ([x, y]) => [x, y + 1, 0],
  patch: ([x, y, z]) => [x, y, z + 1]
};

let next;

if (BUMPS[requested]) {
  next = BUMPS[requested](parts).join('.');
} else if (/^\d+\.\d+\.\d+$/.test(requested)) {
  next = requested;
} else {
  die(`"${requested}" is neither patch, minor, major, nor an x.y.z version`);
}

/**
 * Component-wise, numerically: Chrome compares each dotted field as a number,
 * so 1.0.10 really does beat 1.0.9 — string comparison would say otherwise.
 * A release that goes backwards is only rejected at upload, long after the
 * commit and the tag exist.
 */
function isGreater(candidate, than) {
  for (let i = 0; i < Math.max(candidate.length, than.length); i += 1) {
    const a = candidate[i] ?? 0;
    const b = than[i] ?? 0;

    if (a !== b) return a > b;
  }

  return false;
}

if (!isGreater(next.split('.').map(Number), parts)) {
  die(`${next} is not greater than the current ${current}`);
}

/* ── refuse to release a mess ── */

const dirty = git('status', '--porcelain');

if (dirty) {
  console.error('\n  the working tree has uncommitted changes:\n');
  for (const line of dirty.split('\n')) console.error(`    ${line}`);
  die('commit them first, so the release commit is only the version bump');
}

const tag = `v${next}`;

if (git('tag', '-l', tag)) {
  die(`tag ${tag} already exists`);
}

/* ── bump ── */

console.log(`\nreleasing ${current} -> ${next}\n`);

for (const file of VERSION_FILES) {
  const path = join(root, file);
  const source = readFileSync(path, 'utf8');

  // Edited as text, not re-serialised: rewriting the JSON would reformat the
  // whole file and bury the one-line change in a diff nobody can read.
  const updated = source.replace(
    /("version"\s*:\s*")[^"]+(")/,
    (match, before, after) => before + next + after
  );

  if (updated === source) {
    die(`could not find a "version" field to update in ${file}`);
  }

  writeFileSync(path, updated);
  console.log(`  ${file} -> ${next}`);
}

/*
 * Safe to check out: the working tree was verified clean above, so the
 * committed copy of each of these is identical to what was there a moment ago.
 * The only thing being discarded is this script's own edit.
 */
const restore = () => {
  execFileSync('git', ['checkout', '--', ...VERSION_FILES], { cwd: root });
  console.error('\n  version files restored to their committed state.');
};

/* ── prove it works before committing to it ── */

try {
  console.log('');
  run(join(root, 'tools', 'test.mjs'));
  run(join(root, 'tools', 'zip.mjs')); // runs the checks itself, then packages
} catch {
  restore();
  die('the tests or the checks failed, so nothing was released');
}

/* ── record it ── */

git('add', ...VERSION_FILES);
git('commit', '-m', `release: ${next}`);
git('tag', '-a', tag, '-m', `Lock In ${next}`);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');

console.log(`\n✓ released ${next}\n`);
console.log(`  dist/lock-in-${next}.zip is ready to upload`);
console.log('\n  push it:');
console.log(`    git push origin ${branch} && git push origin ${tag}`);
console.log('\n  then upload the zip at the dashboard, under Package > Upload new package:');
console.log('    https://chrome.google.com/webstore/devconsole\n');
