/**
 * Support panel: LivePix, Bitcoin and Solana.
 *
 * Every QR is rendered as inline SVG from the matrices in qr-codes.js, so the
 * panel costs no network request. Embedding LivePix's own widget would have,
 * and the extension's whole pitch to store review is that it never phones home.
 *
 * The QR box is pinned light-on-dark-modules in both colour schemes: an
 * inverted QR is unreadable to most phone cameras, so this is the one place
 * that ignores the theme.
 */
import { ALL, BTC, LIVEPIX, SOL } from './qr-codes.js';
import { t } from '../utils/i18n.js';

/** Modules of blank margin around the code. Four is what the standard asks for. */
const QUIET = 4;

/**
 * One SVG path for the whole code, with horizontally adjacent dark modules
 * merged into single runs. A 37x37 code is ~700 modules; drawing each as its
 * own rect makes the popup visibly slower to open.
 */
function qrPath(qr) {
  const parts = [];

  for (let row = 0; row < qr.size; row += 1) {
    let runStart = -1;

    for (let col = 0; col <= qr.size; col += 1) {
      const dark = col < qr.size && qr.rows[row][col] === '1';

      if (dark && runStart === -1) {
        runStart = col;
      } else if (!dark && runStart !== -1) {
        const length = col - runStart;
        parts.push(`M${runStart + QUIET} ${row + QUIET}h${length}v1h-${length}z`);
        runStart = -1;
      }
    }
  }

  return parts.join('');
}

function qrSvg(qr) {
  const span = qr.size + QUIET * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

  svg.setAttribute('viewBox', `0 0 ${span} ${span}`);
  svg.setAttribute('class', 'qr__svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('supportQrAlt', qr.label));

  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('width', String(span));
  background.setAttribute('height', String(span));
  background.setAttribute('fill', '#ffffff');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', qrPath(qr));
  path.setAttribute('fill', '#0a0a0a');
  // Modules must not be smoothed away at small sizes.
  path.setAttribute('shape-rendering', 'crispEdges');

  svg.append(background, path);
  return svg;
}

async function copy(text, button) {
  const original = button.textContent;

  try {
    await navigator.clipboard.writeText(text);
    button.textContent = t('supportCopied');
    button.dataset.done = 'true';
  } catch {
    button.textContent = t('supportCopyFailed');
  }

  setTimeout(() => {
    button.textContent = original;
    delete button.dataset.done;
  }, 1600);
}

/** Truncates the middle of an address so both ends stay verifiable. */
function shorten(value) {
  return value.length <= 24 ? value : `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function methodPanel(entry) {
  const panel = document.createElement('div');
  panel.className = 'method';
  panel.dataset.method = entry.key;

  const qrBox = document.createElement('div');
  qrBox.className = 'qr';
  qrBox.append(qrSvg(entry));

  const body = document.createElement('div');
  body.className = 'method__body';

  const label = document.createElement('span');
  label.className = 'eyebrow';
  label.textContent = entry.label;

  const value = document.createElement('code');
  value.className = 'method__value';
  // Full value as the title so it can be read without copying.
  value.title = entry.text;
  // Links show their address with the scheme trimmed, which is how people read
  // a URL. Addresses show both ends, because there every character is money.
  value.textContent = entry.isLink
    ? entry.text.replace(/^https?:\/\//, '')
    : shorten(entry.text);

  const actions = document.createElement('div');
  actions.className = 'method__actions';

  if (entry.isLink) {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn btn--sm';
    open.textContent = t('supportOpenLivepix');
    open.addEventListener('click', () => {
      void chrome.tabs.create({ url: entry.text });
    });
    actions.append(open);
  } else {
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'btn btn--sm';
    copyButton.textContent = t('supportCopy');
    copyButton.setAttribute('aria-label', t('supportCopyAria', entry.label));
    copyButton.addEventListener('click', () => void copy(entry.text, copyButton));
    actions.append(copyButton);
  }

  body.append(label, value, actions);
  panel.append(qrBox, body);

  return panel;
}

const ENTRIES = [
  { ...LIVEPIX, key: 'livepix', isLink: true },
  { ...BTC, key: 'btc', isLink: false },
  { ...SOL, key: 'sol', isLink: false }
];

/**
 * Renders into `container`.
 *
 * `wide` shows all three side by side, for the summary page. The compact form
 * shows one at a time behind a segmented control, because three QR codes big
 * enough for a phone camera do not fit in a 344px popup.
 */
export function renderSupport(container, { wide = false } = {}) {
  container.textContent = '';
  container.dataset.wide = String(wide);

  const pitch = document.createElement('p');
  pitch.className = 'support__pitch';
  pitch.textContent = t('supportPitch');
  container.append(pitch);

  const panels = document.createElement('div');
  panels.className = 'support__panels';

  if (wide) {
    for (const entry of ENTRIES) panels.append(methodPanel(entry));
    container.append(panels);
  } else {
    const tabs = document.createElement('div');
    tabs.className = 'chips support__tabs';
    tabs.setAttribute('role', 'tablist');

    const show = key => {
      panels.textContent = '';
      panels.append(methodPanel(ENTRIES.find(entry => entry.key === key)));

      for (const chip of tabs.children) {
        chip.setAttribute('aria-selected', String(chip.dataset.method === key));
      }
    };

    for (const entry of ENTRIES) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.method = entry.key;
      chip.setAttribute('role', 'tab');
      chip.textContent = entry.label;
      chip.addEventListener('click', () => show(entry.key));
      tabs.append(chip);
    }

    container.append(tabs, panels);
    show(ENTRIES[0].key);
  }

  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = t('supportNote');
  container.append(note);
}

/** Exposed so tools/check.mjs can verify the addresses that ship. */
export const SUPPORT_ADDRESSES = { btc: BTC.text, sol: SOL.text, livepix: LIVEPIX.text };

export { ALL as SUPPORT_QRS };
