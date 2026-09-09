# Privacy policy

**Lock In** does not collect, transmit, or sell any data. There is no server,
no analytics, no telemetry, and no account.

This is verifiable rather than promised: the extension ships with no
`host_permissions`, makes no network requests of any kind, and `npm run check`
fails the build if a remote URL or a `fetch` to one is ever introduced.

## What is stored, and where

Everything lives in `chrome.storage.local` on your own machine. It never leaves
it.

| Stored | Why |
| --- | --- |
| Your list of blocked sites | To know what to block |
| Whether a session is running, and its start/end time | To run the timer across browser restarts |
| Per-site attempt counts | To show how often you tried to open each site |
| The last 60 sessions and 60 days of totals | To draw the summary screen |
| Your chosen interface language | To remember it |

Older sessions and daily totals are discarded automatically once those limits
are reached.

## Permissions

- **`storage`** — keeps the list and the statistics above on your device.
- **`tabs`** — reads the URL of a tab as it navigates, so a blocked site can be
  replaced with the block page. URLs are compared against your own list in
  memory and are never stored or sent anywhere.
- **`alarms`** — ends the session when the time is up, even if the service
  worker was unloaded in the meantime.

There is no permission to read page content, and none is requested.

## Removing your data

Uninstalling the extension deletes its local storage.

Short of that, the extension's own interface deletes it: **reset** on the
summary screen removes the session history, the daily totals and the attempt
counts, and each site on the popup's list has a control that removes it.

## Donations

The support panel shows a Bitcoin address, a Solana address, and a link to a
LivePix page. The addresses are static text rendered locally, and the QR codes
are generated at build time from those same strings — nothing is contacted
until you choose to open the LivePix link, at which point that page's own
policy applies.

## Contact

Open an issue at
<https://github.com/BernardoMrtns/lockin-chrome-extension/issues>.

_Last updated: 9 September 2026._
