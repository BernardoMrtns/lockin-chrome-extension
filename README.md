# Lock In

A Chrome extension that locks the sites that derail you for as long as you
choose — and counts every time you try to sneak back.

No build step, no dependencies, no network requests. Manifest V3.

*Também disponível em [português](README.pt-BR.md).*

## What it does

- You build a list of sites and pick a duration. While the session is running,
  any attempt to open one of those sites lands on a block page instead.
- Every attempt is counted, per site and per day. The toolbar badge shows the
  running total for the current session.
- Pausing freezes the clock and releases the sites; resuming puts the lock back.
  Paused time does not count toward focused time.
- The summary page shows today's focus, a day streak, a 14-day graph, a ranking
  of the sites that kept calling, and the session history.
- English, Brazilian Portuguese and Spanish, switchable at any time from the
  flag tile at the top of the popup (and on the summary). English is the default.

## Languages

The default is **English**, for everyone — the browser's own language is never
consulted. The user's choice lives in `chrome.storage.local` and applies to all
three screens.

`chrome.i18n.getMessage` is no use here: it always answers in the browser's UI
language and cannot be redirected at runtime. So `src/utils/i18n.js` loads
`_locales/<code>/messages.json` with `fetch` and resolves keys itself, falling
back to English per key — an incomplete translation shows English rather than
showing blanks.

`chrome.i18n` is still used for exactly one thing: the manifest's `name` and
`description` (`__MSG_extName__`). That is the **store listing** text, which
Chrome resolves against the viewer's browser language — so the listing is
translated into all three languages for free.

Since `chrome.i18n` has no plural support, counted phrases live in two keys,
`<name>One` and `<name>Other`, chosen by `plural()`. All three languages split
1-vs-rest, which is all these need.

To add a language: create `_locales/<code>/messages.json`, add the entry to
`LOCALES` in `src/utils/i18n.js`, and add the flag drawing to
`src/ui/language.js`. `npm run check` fails if those three drift apart.

The flags are inline SVG, not emoji: Windows ships no glyph for regional
indicator pairs, so Chrome there draws 🇺🇸 as the letters "US" in a box. Each
button carries the language's own name as its accessible label — a flag stands
for a country, not a language, and the label is what is actually true.

## How blocking works

It does not use `declarativeNetRequest`. The service worker listens on
`chrome.tabs.onUpdated` / `onCreated` / `onActivated`, matches the URL against
the list, and redirects the tab to `blocked.html`.

That is deliberate: DNR blocks before render, but it cannot tell you *which*
rule fired without the extra `declarativeNetRequestFeedback` permission — and
counting attempts per site is half the point of the extension. The cost is that
navigation starts before the redirect.

Site matching:

| You type | It catches |
| --- | --- |
| `reddit.com` | `reddit.com`, `www.reddit.com`, `old.reddit.com` |
| `reddit` | any URL containing "reddit", including a search for reddit |

Schemes other than `http`/`https` are never blocked, so `chrome://extensions`
and the block page itself stay reachable.

## Permissions, and why each one exists

| Permission | What for |
| --- | --- |
| `storage` | keeping the site list, session state, counters and history |
| `tabs` | reading a tab's URL and redirecting it when it matches the list |
| `alarms` | ending the session on time, even while the service worker sleeps |

There are no `host_permissions`, no `web_accessible_resources`, and nothing is
loaded from the network — the font is bundled in `assets/fonts/`. That keeps
Chrome Web Store review on the fast path and does not leak the extension ID to
the sites you visit.

## Layout

```
manifest.json          permissions and entry points
background.js          service worker entry point
src/background/        tab, alarm and message listeners; attempt dedupe
src/core/blocking.js   host normalization and matching
src/core/timer.js      start, pause, resume, stop, counters, history
src/utils/storage.js   storage keys and daily stats
src/utils/i18n.js      translation loading, runtime switching, plurals
src/ui/language.js     flag tile (inline SVG)
assets/theme.css       shared design system (tokens + primitives)
popup.*                toolbar popup
blocked.*              interruption page
summary.*              stats page
tools/                 checks, tests and packaging (excluded from the zip)
```

Data lives in `chrome.storage.local` and never leaves the machine. History is
capped at 60 sessions and daily stats at 60 days.

## Development

There is no build step. What is in the repository is what runs.

Load it in the browser: `chrome://extensions` → turn on **Developer mode** →
**Load unpacked** → pick the repository root. After editing, hit reload on the
extension's card.

### Commands

```bash
npm test        # session accounting, counters, matching and language logic
npm run check   # pre-publish checks
npm run icons   # regenerates icons/icon-{16,48,128}.png
npm run icons -- sheet   # also writes dist/icon-candidates.png to compare marks
npm run qr      # regenerates src/ui/qr-codes.js from the addresses
npm run serve   # static server for the preview harness
npm run zip     # runs the checks, then writes dist/lock-in-<version>.zip
```

`npm run check` looks for what store review usually rejects: permissions that
are declared but never used, `host_permissions`, `web_accessible_resources`,
remote references, manifest entries pointing at files that do not exist, and
locales drifting from each other, from the code, or from the flag list.

### UI preview

To see the screens without reloading the extension, serve the root and open the
harness — it stubs the `chrome.*` APIs, seeds sample data, and loads the real
code:

```bash
npm run serve
```

It sends `Cache-Control: no-store`. That is the whole reason it exists rather
than any static server: a cached `src/utils/i18n.js` served next to a freshly
edited translation looks exactly like a bug in the code, and a cache-busting
query string cannot reach the imports inside an ES module.

- `tools/preview.html?page=popup&scenario=idle`
- `tools/preview.html?page=popup&scenario=running`
- `tools/preview.html?page=popup&scenario=paused`
- `tools/preview.html?page=blocked&scenario=repeat`
- `tools/preview.html?page=blocked&scenario=over`
- `tools/preview.html?page=summary`

Append `&locale=pt_BR` or `&locale=es` to open straight into a translation. The
flag tile works in the harness, so you can switch languages there too.

## Donations

The popup footer has a `support` toggle and the summary page a card, both
rendering the same panel: LivePix, Bitcoin and Solana, each with a QR code.

The QR codes are generated by `tools/make-qr.mjs` — a from-scratch encoder,
because the extension makes no network requests and fetching them from a QR
service or embedding LivePix's own widget iframe would break that. They are
stored as module matrices in `src/ui/qr-codes.js` and drawn as inline SVG, so
the panel costs nothing to open. The QR box stays light in dark mode: an
inverted code is unreadable to most phone cameras.

The LivePix code encodes the public donation page, `livepix.gg/bernardomrtns`.
Not the `widget.livepix.gg/embed/...` URL — that is a page which *renders* a QR
code, so encoding it would send whoever scanned it to another QR code.

The crypto codes encode the bare address rather than a `bitcoin:` or `solana:`
URI, so the QR content is character-for-character what the page prints beside
it and the two can be checked against each other by eye.

`npm run check` validates both addresses. The Bitcoin one is verified properly:
bech32 carries a checksum, so a typo fails. **A Solana address cannot be
verified** — it is 32 raw bytes with no checksum, every 32-byte value is
syntactically valid, and Node's key import does not test curve membership
either (measured: it catches about 1% of single-character typos). So both
addresses are also pinned in `tools/check.mjs`; any change to one fails the
check until the pin is updated deliberately. That guards against the failure
that actually happens — a lossy edit — not against mistyping in the first
place. Verify a new address against the wallet before pinning it.

## Design

Neo-brutalist: 2px borders, solid offset shadows, flat saturated colour
(`#CCFF00` lime, `#FF4D8D` pink) on cream, heavy Space Grotesk type. Nothing
blurs — no `backdrop-filter`, no soft shadows, no gradient text.
`tools/check.mjs` fails the build if any of those appear in the CSS.

Tokens live in `assets/theme.css`, with dark mode via `prefers-color-scheme`.
The block page is the exception: it pins the pink field in both schemes, because
it is the one screen that should feel like running into a wall.

The icon is a prohibition sign on the lime tile. It is deliberately not clever:
at 16px, in a strip of other toolbar icons, an abstract mark carries no meaning
at all, and this is the one shape a person reads as "blocked" with no learning.
An earlier draft used a focus reticle, which read as a game's targeting sight.

It is generated by `tools/make-icons.mjs` — no dependencies, supersampled for
clean corners — so all three sizes stay consistent when a proportion changes.
Geometry is written in 16px units and scaled up, because 16px is the toolbar and
it is the only size that has to land on whole pixels. The 16px version drops the
black border: with one, there is no room left inside for the mark.

Every candidate mark lives in that same file, with a `SHIPPED` constant naming
the one in use, so `npm run icons -- sheet` can render them side by side at
every size without the comparison ever drifting from what ships.

## Licence

MIT — see [LICENSE](LICENSE).

Inspired by [Work Mode](https://github.com/ShreyRavi/workmode) by Shrey Ravi.
