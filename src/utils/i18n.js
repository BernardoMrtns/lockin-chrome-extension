/**
 * Runtime-switchable translations.
 *
 * chrome.i18n.getMessage cannot be redirected — it always answers in the
 * browser's UI language — so the UI strings are loaded from the packaged
 * _locales files instead and the choice is kept in storage. chrome.i18n still
 * serves the manifest (`__MSG_extName__`), which Chrome resolves against the
 * browser locale for the store listing; that is a separate concern.
 *
 * Counted phrases are stored as two keys, `<name>One` and `<name>Other`, and
 * picked by `plural`. English, Portuguese and Spanish all split 1-vs-rest.
 */
import { STORAGE_KEYS, storageGet, storageSet } from './storage.js';

export const DEFAULT_LOCALE = 'en';

/**
 * `tag` is the BCP-47 tag handed to Intl for dates and numbers. `name` is
 * written in its own language, which is what language pickers should show.
 */
export const LOCALES = [
  { code: 'en', tag: 'en-US', name: 'English', short: 'EN', flag: 'us' },
  { code: 'pt_BR', tag: 'pt-BR', name: 'Português', short: 'PT', flag: 'br' },
  { code: 'es', tag: 'es-ES', name: 'Español', short: 'ES', flag: 'es' }
];

const byCode = new Map(LOCALES.map(locale => [locale.code, locale]));

let active = byCode.get(DEFAULT_LOCALE);
let messages = {};

/** English, kept loaded so a key missing from a translation still renders. */
let fallbackMessages = {};

async function fetchMessages(code) {
  const response = await fetch(chrome.runtime.getURL(`_locales/${code}/messages.json`));

  if (!response.ok) {
    throw new Error(`could not load _locales/${code}/messages.json`);
  }

  return response.json();
}

export function currentLocale() {
  return active;
}

export function isSupportedLocale(code) {
  return byCode.has(code);
}

/**
 * Loads the stored locale, or English. English is the deliberate default for
 * everyone: the browser's own language is not consulted.
 */
export async function initI18n() {
  const stored = (await storageGet([STORAGE_KEYS.LOCALE]))[STORAGE_KEYS.LOCALE];

  active = byCode.get(stored) || byCode.get(DEFAULT_LOCALE);

  fallbackMessages = await fetchMessages(DEFAULT_LOCALE);
  messages = active.code === DEFAULT_LOCALE
    ? fallbackMessages
    : await fetchMessages(active.code).catch(() => fallbackMessages);

  document.documentElement.lang = active.tag;

  return active;
}

/** Persists the choice. Pages pick it up through storage.onChanged. */
export async function setLocale(code) {
  if (!byCode.has(code) || code === active.code) {
    return false;
  }

  await storageSet({ [STORAGE_KEYS.LOCALE]: code });
  return true;
}

/**
 * Expands Chrome's named placeholders, then the positional ones.
 *
 * Chrome reads `$NAME$` in a message as a named placeholder that must be
 * declared in the entry's `placeholders` block, and refuses to load the whole
 * extension if one is not — so a message like `"$1h$2"` is illegal, because
 * `$1h$` looks like a placeholder called "1h". Two adjacent positional
 * substitutions separated by letters have to be written the long way:
 *
 *   { message: "$HOURS$h$MINUTES$",
 *     placeholders: { HOURS: { content: "$1" }, MINUTES: { content: "$2" } } }
 *
 * Placeholder names are matched case-insensitively, as Chrome does.
 */
export function t(key, ...substitutions) {
  const entry = messages[key] || fallbackMessages[key];

  if (!entry) {
    return key;
  }

  let out = entry.message;

  if (entry.placeholders) {
    for (const [name, definition] of Object.entries(entry.placeholders)) {
      out = out.replace(
        new RegExp(`\\$${name}\\$`, 'gi'),
        definition?.content ?? ''
      );
    }
  }

  substitutions.forEach((value, index) => {
    out = out.split(`$${index + 1}`).join(String(value));
  });

  return out;
}

/** `plural('countSessions', 1)` reads countSessionsOne, otherwise ...Other. */
export function plural(key, count) {
  return t(`${key}${count === 1 ? 'One' : 'Other'}`, count);
}

/** BCP-47 tag for Intl formatting. */
export function localeTag() {
  return active.tag;
}

/** Fills every [data-i18n] and [data-i18n-placeholder] node. */
export function applyStaticText(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }

  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
}

/** "9:22" — minutes and zero-padded seconds, floored at zero. */
export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** "1h50" / "45 min" — compact, for stat lines that carry several figures. */
export function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return t('unitMinutes', minutes);
  }

  return minutes
    ? t('unitHoursMinutes', hours, String(minutes).padStart(2, '0'))
    : t('unitHours', hours);
}
