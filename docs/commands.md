# Commands

Everything you can type at this repository, by what you are trying to do.
There is no build step and no dependencies — every script below is plain Node.

## Running it in the browser

`chrome://extensions` → turn on **Developer mode** → **Load unpacked** → pick
the repository root. After editing a file, hit reload on the extension's card.

An unpacked install never auto-updates. Anyone running it this way stays on
whatever they loaded until they pull and reload by hand.

## While working

```bash
npm test
```

33 tests: session accounting, the counters, site matching, the badge, and the
language logic. No browser involved.

```bash
npm run check
```

The pre-publish checks. Run it before every commit — it is what stands in for
a build step. It fails on what store review rejects (permissions declared but
never used, `host_permissions`, `web_accessible_resources`, remote URLs,
manifest entries pointing at nothing), on locales drifting from each other or
from the code, on a version mismatch between `manifest.json` and
`package.json`, and on messages Chrome's own parser would refuse to load.

It also prints notes that are not failures: orphan CSS classes, unused
translation keys, the payload size.

## Seeing the interface without reloading

```bash
npm run serve
```

Serves the repository root on `http://127.0.0.1:8777` with
`Cache-Control: no-store`. That header is the whole reason this exists rather
than any static server: a cached `src/utils/i18n.js` next to a freshly edited
translation looks exactly like a bug in the code.

Then open any of these — they stub the `chrome.*` APIs, seed sample data, and
load the real pages:

| | |
| --- | --- |
| popup, nothing running | `tools/preview.html?page=popup&scenario=idle` |
| popup, session running | `tools/preview.html?page=popup&scenario=running` |
| popup, paused | `tools/preview.html?page=popup&scenario=paused` |
| block page, first visit | `tools/preview.html?page=blocked&scenario=first` |
| block page, repeat visit | `tools/preview.html?page=blocked&scenario=repeat` |
| block page, session over | `tools/preview.html?page=blocked&scenario=over` |
| summary | `tools/preview.html?page=summary` |

Append `&locale=pt_BR` or `&locale=es` to open straight into a translation.
The flag tile works there too.

## Regenerating things that are generated

Each of these writes files that are committed. Run them only when their input
changed, and commit the result.

```bash
npm run icons
```

Rewrites `icons/icon-{16,48,128}.png` from the drawing in
`tools/make-icons.mjs`. Supersampled, no dependencies.

```bash
npm run icons -- sheet
```

Also writes `dist/icon-candidates.png`, every mark side by side, for comparing
designs before picking one.

```bash
npm run qr
```

Rewrites `src/ui/qr-codes.js` from the donation addresses. The encoder is
written from scratch because the extension makes no network requests, so
fetching QR codes from a service is not an option. Changing an address means
changing the pinned copy in `tools/check.mjs` too — the check fails otherwise,
on purpose.

### Store images

These need the server running. Add `&save=1` to write the file into `store/`;
without it the image just renders in the page for eyeballing.

```bash
npm run serve
```

| | |
| --- | --- |
| screenshots, 1280x800 | `tools/make-shots.html?shot=idle&save=1` — also `running`, `blocked`, `summary` |
| small promo tile, 440x280 | `tools/make-tiles.html?tile=small&save=1` |
| marquee promo tile, 1400x560 | `tools/make-tiles.html?tile=marquee&save=1` |

Both mount the real pages through the same harness as the preview, so the
images cannot drift from the interface. They are not byte-reproducible: the
harness seeds its scenarios from the live clock, so the running timer and the
session dates differ between runs.

`store/` is gitignored. The images live only on the machine that made them and
in the store listing.

## Releasing

```bash
npm run release -- patch
```

Takes `patch`, `minor`, `major`, or an explicit version (`-- 1.2.0`). It bumps
`manifest.json` and `package.json` together, runs the tests and the checks,
builds the zip, then commits and tags, and prints the push command.

It refuses to run on a dirty tree, so commit first — the release commit is only
the version bump. If the tests or the checks fail, the version files go back to
their committed state and no tag is created.

```bash
npm run zip
```

Just the package, no version bump: runs the checks and writes
`dist/lock-in-<version>.zip`. Use it to rebuild an upload after a change that
does not deserve a new version — and note the store will reject it if the
version does not beat what is published.

## Git

```bash
git push origin rewrite-v1 && git push origin v1.0.1
```

Tags are not pushed by `git push` on its own. The release script prints the
exact pair for the version it just cut.

```bash
git checkout main && git merge --ff-only rewrite-v1 && git push origin main && git checkout rewrite-v1
```

Moves `main` up to the work branch. It matters beyond tidiness: the privacy
policy URL in the store listing points at `PRIVACY.md` **on main**, and anyone
installing unpacked from the repository gets whatever `main` says.

## Chrome Web Store

The dashboard is at <https://chrome.google.com/webstore/devconsole>.

**Updating**: the item → **Package** → **Upload new package** → the zip →
**Submit for review**. The listing, the permission justifications and the data
disclosures all persist; only the package changes.

**Every field the dashboard asks for**, including the wording for the single
purpose, the permission justifications and the descriptions in three
languages, is in [store-listing.md](store-listing.md).

Two things block publishing and are not on the item form at all — they live in
the account's **Settings**: a publisher contact email, and clicking through the
verification link it sends.
