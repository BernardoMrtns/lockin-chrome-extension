/**
 * Language tile.
 *
 * The flags are inline SVG rather than emoji: Windows ships no glyphs for
 * regional-indicator pairs, so Chrome there renders U+1F1FA U+1F1F8 as the
 * letters "US" in boxes instead of a flag. They are drawn simplified — at 26px
 * wide the real number of stars and stripes turns to mush.
 *
 * Each button carries the language's own name as its accessible label, so the
 * flag is decoration and the actual meaning is never carried by the image
 * alone. Flags stand for countries, not languages; the label is what is true.
 */
import { LOCALES, currentLocale, setLocale } from '../utils/i18n.js';

const STRIPE = 16 / 7;

const FLAGS = {
  us: `
    <rect width="24" height="16" fill="#F7F7F7"/>
    <g fill="#B31942">
      <rect y="0" width="24" height="${STRIPE}"/>
      <rect y="${STRIPE * 2}" width="24" height="${STRIPE}"/>
      <rect y="${STRIPE * 4}" width="24" height="${STRIPE}"/>
      <rect y="${STRIPE * 6}" width="24" height="${STRIPE}"/>
    </g>
    <rect width="10.4" height="${STRIPE * 3.5}" fill="#0A3161"/>
    <g fill="#F7F7F7">
      <circle cx="2.1" cy="1.6" r="0.5"/><circle cx="5.2" cy="1.6" r="0.5"/>
      <circle cx="8.3" cy="1.6" r="0.5"/><circle cx="3.65" cy="4" r="0.5"/>
      <circle cx="6.75" cy="4" r="0.5"/><circle cx="2.1" cy="6.4" r="0.5"/>
      <circle cx="5.2" cy="6.4" r="0.5"/><circle cx="8.3" cy="6.4" r="0.5"/>
    </g>`,
  br: `
    <rect width="24" height="16" fill="#009B3A"/>
    <path d="M12 1.7 L22.3 8 L12 14.3 L1.7 8 Z" fill="#FEDF00"/>
    <circle cx="12" cy="8" r="3.5" fill="#002776"/>
    <path d="M8.9 6.9 A 3.5 3.5 0 0 0 15.1 9.4" stroke="#F7F7F7" stroke-width="0.9" fill="none"/>`,
  es: `
    <rect width="24" height="16" fill="#AA151B"/>
    <rect y="4" width="24" height="8" fill="#F1BF00"/>`
};

function flagSvg(key) {
  return `<svg class="lang__flag" viewBox="0 0 24 16" aria-hidden="true" focusable="false">${
    FLAGS[key] || ''
  }</svg>`;
}

/**
 * Renders the tile into `container`. Selecting a language only writes storage;
 * the page re-renders when it sees the change, so every open page and the
 * popup stay in step.
 */
export function renderLanguageTile(container) {
  container.textContent = '';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', 'Language');

  const activeCode = currentLocale().code;

  for (const locale of LOCALES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lang';
    button.dataset.code = locale.code;
    button.setAttribute('aria-pressed', String(locale.code === activeCode));
    button.setAttribute('aria-label', locale.name);
    button.title = locale.name;
    button.innerHTML = flagSvg(locale.flag);

    button.addEventListener('click', () => {
      void setLocale(locale.code);
    });

    container.append(button);
  }
}
