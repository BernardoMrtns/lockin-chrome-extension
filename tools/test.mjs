/**
 * Logic tests for the background modules. Run with `npm test`.
 *
 * Stubs chrome.* and takes control of the clock, so session accounting can be
 * checked without a browser. The duration assertions exist because the original
 * code recorded remaining time instead of elapsed time.
 */

import { existsSync, readFileSync } from 'node:fs';

/* ── chrome stub ── */

let store = {};
let alarms = {};
let badge = '';
let tabs = [];
const updated = [];

const listener = () => ({ addListener() {} });

globalThis.chrome = {
  storage: {
    local: {
      get: async keys => {
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const key of list) {
          if (key in store) out[key] = structuredClone(store[key]);
        }
        return out;
      },
      set: async values => Object.assign(store, structuredClone(values)),
      remove: async keys => {
        for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
      }
    },
    onChanged: listener()
  },
  alarms: {
    clear: async name => { delete alarms[name]; },
    create: async (name, info) => { alarms[name] = info; },
    onAlarm: listener()
  },
  action: {
    setBadgeText: async ({ text }) => { badge = text; },
    setBadgeBackgroundColor: async () => {},
    setBadgeTextColor: async () => {}
  },
  tabs: {
    query: async () => structuredClone(tabs),
    get: async id => tabs.find(tab => tab.id === id),
    update: async (id, info) => { updated.push({ id, ...info }); },
    remove: async () => {},
    onUpdated: listener(),
    onCreated: listener(),
    onActivated: listener(),
    onRemoved: listener()
  },
  runtime: {
    getURL: path => `chrome-extension://test/${path}`,
    onInstalled: listener(),
    onStartup: listener(),
    onMessage: listener()
  },
  i18n: { getMessage: () => '', getUILanguage: () => 'en-US' }
};

/*
 * i18n.js runs in a page: it needs a document to stamp <html lang> on and a
 * fetch to pull the packaged translations. fetch is wired to the real files on
 * disk, so these tests exercise the shipped JSON rather than a fixture.
 */
globalThis.document = {
  documentElement: { lang: '' },
  querySelectorAll: () => []
};

const localeRoot = new URL('../_locales/', import.meta.url);

globalThis.fetch = async url => {
  const code = String(url).replace('chrome-extension://test/_locales/', '').split('/')[0];
  const file = new URL(`${code}/messages.json`, localeRoot);

  if (!existsSync(file)) {
    return { ok: false, json: async () => ({}) };
  }

  return { ok: true, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
};

/* ── controllable clock ── */

const realNow = Date.now;
let clock = realNow();

Date.now = () => clock;

const advanceMinutes = minutes => { clock += minutes * 60000; };

function reset() {
  store = {};
  alarms = {};
  badge = '';
  tabs = [];
  updated.length = 0;
  clock = realNow();
}

/* ── tiny test runner ── */

let passed = 0;
const failures = [];

async function test(name, body) {
  reset();

  try {
    await body();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  ✗ ${name}`);
    console.log(`      ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNear(actual, expected, toleranceMs, label) {
  const delta = Math.abs(actual - expected);
  assert(
    delta <= toleranceMs,
    `${label}: got ${(actual / 60000).toFixed(2)} min, expected ~${(expected / 60000).toFixed(2)} min`
  );
}

/* ── modules under test ── */

const { canonicalizeSite, findBlockedMatch, normalizeSites } =
  await import('../src/core/blocking.js');
const {
  clearCounters,
  getSnapshot,
  pauseFocus,
  recordAttempt,
  restoreState,
  resumeFocus,
  startFocus,
  stopFocus
} = await import('../src/core/timer.js');
const { STORAGE_KEYS, bumpToday, dayKey, getToday } = await import('../src/utils/storage.js');
const {
  DEFAULT_LOCALE,
  LOCALES,
  currentLocale,
  initI18n,
  isSupportedLocale,
  localeTag,
  plural: pluralOf,
  setLocale,
  t: translate
} = await import('../src/utils/i18n.js');

const MIN = 60000;

console.log('\nblocking');

await test('canonicalizeSite strips scheme, path, port, www and trailing dots', () => {
  assert(canonicalizeSite('https://www.X.com/home?a=1') === 'x.com', 'url form');
  assert(canonicalizeSite('  Instagram.COM.  ') === 'instagram.com', 'case and dots');
  assert(canonicalizeSite('example.com:8080') === 'example.com', 'port');
  assert(canonicalizeSite('') === '', 'empty');
});

await test('normalizeSites dedupes forms that resolve to one host', () => {
  const result = normalizeSites(['x.com', 'https://www.x.com/', 'X.COM', '']);
  assert(result.length === 1 && result[0] === 'x.com', `got ${JSON.stringify(result)}`);
});

await test('findBlockedMatch covers host, subdomain and www', () => {
  const sites = ['reddit.com'];
  assert(findBlockedMatch('https://reddit.com/r/x', sites) === 'reddit.com', 'exact');
  assert(findBlockedMatch('https://old.reddit.com/', sites) === 'reddit.com', 'subdomain');
  assert(findBlockedMatch('https://www.reddit.com/', sites) === 'reddit.com', 'www');
  assert(findBlockedMatch('https://notreddit.com/', sites) === '', 'suffix must not match');
});

await test('bare keywords match anywhere, domains do not over-match', () => {
  assert(findBlockedMatch('https://google.com/search?q=reddit', ['reddit']) === 'reddit', 'keyword');
  assert(findBlockedMatch('https://google.com/search?q=reddit', ['reddit.com']) === '', 'domain');
});

await test('non-http schemes are never blocked', () => {
  for (const url of [
    'chrome://extensions',
    'chrome-extension://abc/blocked.html?site=x.com',
    'about:blank',
    'file:///c:/x.com'
  ]) {
    assert(findBlockedMatch(url, ['x.com', 'extensions']) === '', `should skip ${url}`);
  }
});

console.log('\nsession accounting');

await test('startFocus arms the alarm and normalizes the site list', async () => {
  await startFocus(25, ['https://www.X.com/feed', 'x.com', 'reddit.com']);

  assert(store[STORAGE_KEYS.IS_FOCUS] === true, 'should be focusing');
  assertNear(store[STORAGE_KEYS.END_TS], clock + 25 * MIN, 50, 'endTs');
  assert(alarms.focusEnd, 'alarm armed');
  assert(
    JSON.stringify(store[STORAGE_KEYS.SITES]) === JSON.stringify(['x.com', 'reddit.com']),
    `sites: ${JSON.stringify(store[STORAGE_KEYS.SITES])}`
  );
});

// The original bug: history recorded (endTs - now), i.e. time *left*.
await test('stopping early records elapsed time, not remaining time', async () => {
  await startFocus(25, ['x.com']);
  advanceMinutes(10);

  const session = await stopFocus({ completed: false });

  assertNear(session.focusedMs, 10 * MIN, 1000, 'focusedMs');
  assert(session.completed === false, 'should be marked cut short');
  assert(session.plannedMinutes === 25, `plannedMinutes: ${session.plannedMinutes}`);
});

// Same bug, other end: running to completion made endTs === now, so it stored 0.
await test('running to completion records the full duration', async () => {
  await startFocus(25, ['x.com']);
  advanceMinutes(25);

  const session = await stopFocus({ completed: true });

  assertNear(session.focusedMs, 25 * MIN, 1000, 'focusedMs');
  assert(session.completed === true, 'should be marked completed');
});

await test('paused time is excluded from the recorded duration', async () => {
  await startFocus(25, ['x.com']);
  advanceMinutes(5);
  await pauseFocus();

  assertNear(store[STORAGE_KEYS.REMAINING_MS], 20 * MIN, 1000, 'remainingMs');
  assert(!alarms.focusEnd, 'alarm cleared while paused');

  advanceMinutes(120); // long coffee
  await resumeFocus();

  assert(alarms.focusEnd, 'alarm re-armed');
  assertNear(store[STORAGE_KEYS.END_TS], clock + 20 * MIN, 1000, 'endTs after resume');

  advanceMinutes(5);
  const session = await stopFocus({ completed: false });

  assertNear(session.focusedMs, 10 * MIN, 2000, 'focusedMs excludes the pause');
});

await test('stopping while paused does not credit the unused remainder', async () => {
  await startFocus(60, ['x.com']);
  advanceMinutes(10);
  await pauseFocus();
  advanceMinutes(5);

  const session = await stopFocus({ completed: false });

  assertNear(session.focusedMs, 10 * MIN, 2000, 'focusedMs');
});

await test('duration can never exceed what was planned', async () => {
  await startFocus(25, ['x.com']);
  advanceMinutes(500); // worker was asleep well past the alarm

  const session = await stopFocus({ completed: true });

  assertNear(session.focusedMs, 25 * MIN, 1000, 'focusedMs is capped at planned');
});

await test('stopFocus is a no-op when nothing is running', async () => {
  assert((await stopFocus({ completed: false })) === null, 'should return null');
  assert(!(store[STORAGE_KEYS.SESSION_HISTORY] || []).length, 'no phantom history entry');
});

await test('restoreState ends a session whose alarm fired while the worker slept', async () => {
  await startFocus(25, ['x.com']);
  advanceMinutes(30);
  await restoreState();

  assert(store[STORAGE_KEYS.IS_FOCUS] === false, 'session should be closed');
  assert(store[STORAGE_KEYS.SESSION_HISTORY].length === 1, 'session filed');
  assert(store[STORAGE_KEYS.SESSION_HISTORY][0].completed === true, 'marked completed');
});

await test('history is capped so storage cannot grow without bound', async () => {
  store[STORAGE_KEYS.SESSION_HISTORY] = Array.from({ length: 60 }, (_, index) => ({ index }));
  await startFocus(5, ['x.com']);
  advanceMinutes(5);
  await stopFocus({ completed: true });

  assert(store[STORAGE_KEYS.SESSION_HISTORY].length === 60, `got ${store[STORAGE_KEYS.SESSION_HISTORY].length}`);
  assert(
    store[STORAGE_KEYS.SESSION_HISTORY].at(-1).focusedMs !== undefined,
    'newest session is kept'
  );
});

console.log('\ncounters and daily stats');

await test('recordAttempt counts per session and per day', async () => {
  await startFocus(25, ['x.com']);

  const first = await recordAttempt('x.com');
  const second = await recordAttempt('x.com');
  await recordAttempt('reddit.com');

  assert(first.sessionCount === 1 && second.sessionCount === 2, 'session counts');
  assert(second.todayCount === 2, `todayCount: ${second.todayCount}`);
  assert(badge === '3', `badge should total all sites, got "${badge}"`);

  const today = await getToday();
  assert(today.attempts === 3, `today.attempts: ${today.attempts}`);
});

await test('empty and blank sites are not counted', async () => {
  assert((await recordAttempt('')) === null, 'empty string');
  assert((await recordAttempt('   ')) === null, 'whitespace');
  assert((await recordAttempt(null)) === null, 'null');
});

await test('clearCounters resets the session but keeps the daily record', async () => {
  await startFocus(25, ['x.com']);
  await recordAttempt('x.com');
  await clearCounters();

  assert(Object.keys(store[STORAGE_KEYS.COUNTERS]).length === 0, 'session counters cleared');
  assert((await getToday()).attempts === 1, 'daily total preserved');
});

await test('a new session starts its counters from zero', async () => {
  await startFocus(25, ['x.com']);
  await recordAttempt('x.com');
  advanceMinutes(25);
  await stopFocus({ completed: true });

  await startFocus(25, ['x.com']);
  assert(Object.keys(store[STORAGE_KEYS.COUNTERS]).length === 0, 'counters reset');
});

await test('completed sessions add to the day total', async () => {
  await startFocus(30, ['x.com']);
  advanceMinutes(30);
  await stopFocus({ completed: true });

  const today = await getToday();
  assertNear(today.focusMs, 30 * MIN, 1000, 'today.focusMs');
  assert(today.sessions === 1, `today.sessions: ${today.sessions}`);
});

await test('dailyStats keeps at most 60 days, newest first', async () => {
  const stats = {};

  for (let offset = 0; offset < 90; offset += 1) {
    const date = new Date(clock - offset * 86400000);
    stats[dayKey(date)] = { attempts: 1, focusMs: MIN, sessions: 1, sites: {} };
  }

  store[STORAGE_KEYS.DAILY_STATS] = stats;
  await bumpToday({ attempts: 1 });

  const keys = Object.keys(store[STORAGE_KEYS.DAILY_STATS]);
  assert(keys.length === 60, `kept ${keys.length} days`);
  assert(keys.includes(dayKey(new Date(clock))), 'today survives the prune');
});

console.log('\nbadge');

await test('badge is empty when idle, ON when clean, count when dirty', async () => {
  await stopFocus({ completed: false });
  assert(badge === '', `idle badge: "${badge}"`);

  await startFocus(25, ['x.com']);
  assert(badge === 'ON', `clean badge: "${badge}"`);

  await recordAttempt('x.com');
  assert(badge === '1', `dirty badge: "${badge}"`);

  await pauseFocus();
  assert(badge === 'II', `paused badge: "${badge}"`);
});

console.log('\nsnapshot');

await test('getSnapshot exposes what the popup needs, including today', async () => {
  await startFocus(25, ['x.com']);
  await recordAttempt('x.com');

  const snapshot = await getSnapshot();

  for (const key of [
    STORAGE_KEYS.SITES,
    STORAGE_KEYS.IS_FOCUS,
    STORAGE_KEYS.END_TS,
    STORAGE_KEYS.START_TS,
    STORAGE_KEYS.COUNTERS
  ]) {
    assert(key in snapshot, `snapshot missing ${key}`);
  }

  assert(snapshot.today?.attempts === 1, 'today attached');
});

console.log('\nservice worker wiring');

await test('background entry point registers without throwing', async () => {
  await import('../src/background/index.js');
});

console.log('\nlanguage');

await test('English is the default when nothing has been chosen', async () => {
  const locale = await initI18n();

  assert(locale.code === DEFAULT_LOCALE, `got ${locale.code}`);
  assert(DEFAULT_LOCALE === 'en', 'the default must be English');
  assert(translate('popupStart') === 'lock in', `got "${translate('popupStart')}"`);
});

await test('the browser UI language is deliberately not consulted', async () => {
  // A pt-BR Chrome must still open in English until the user picks otherwise.
  chrome.i18n.getUILanguage = () => 'pt-BR';
  const locale = await initI18n();
  chrome.i18n.getUILanguage = () => 'en-US';

  assert(locale.code === 'en', `got ${locale.code}`);
});

await test('a stored locale is honoured', async () => {
  store[STORAGE_KEYS.LOCALE] = 'pt_BR';
  await initI18n();

  assert(currentLocale().code === 'pt_BR', `got ${currentLocale().code}`);
  assert(translate('popupStart') === 'trancar', `got "${translate('popupStart')}"`);
  assert(localeTag() === 'pt-BR', `tag: ${localeTag()}`);
  assert(document.documentElement.lang === 'pt-BR', 'html lang should follow');
});

await test('every declared locale loads and translates', async () => {
  for (const locale of LOCALES) {
    store[STORAGE_KEYS.LOCALE] = locale.code;
    await initI18n();

    assert(currentLocale().code === locale.code, `${locale.code} did not activate`);

    const start = translate('popupStart');
    assert(start && start !== 'popupStart', `${locale.code} has no popupStart`);
  }
});

await test('an unsupported stored locale falls back to English', async () => {
  store[STORAGE_KEYS.LOCALE] = 'de';
  const locale = await initI18n();

  assert(locale.code === 'en', `got ${locale.code}`);
  assert(!isSupportedLocale('de'), 'de should not be supported');
  assert(isSupportedLocale('es'), 'es should be supported');
});

await test('a key missing from a translation falls back to English', async () => {
  store[STORAGE_KEYS.LOCALE] = 'es';
  await initI18n();

  // Every real key exists in every locale (check.mjs enforces that), so probe
  // the fallback with a key that is deliberately absent everywhere.
  assert(translate('nonexistentKey') === 'nonexistentKey', 'unknown keys echo back');
  assert(translate('popupStart') === 'bloquear', `got "${translate('popupStart')}"`);
});

await test('substitutions and plurals resolve per locale', async () => {
  store[STORAGE_KEYS.LOCALE] = 'pt_BR';
  await initI18n();

  assert(pluralOf('countBlocked', 1) === '1 barrado', pluralOf('countBlocked', 1));
  assert(pluralOf('countBlocked', 5) === '5 barrados', pluralOf('countBlocked', 5));
  assert(translate('popupSiteDuplicate', 'x.com').includes('x.com'), 'substitution');
});

await test('named placeholders resolve, in every locale', async () => {
  // "$1h$2" is illegal for Chrome's parser (it reads $1h$ as a placeholder
  // called "1h" and refuses to load the extension), so unitHoursMinutes is
  // written with declared placeholders. It still has to render as "1h50".
  for (const locale of LOCALES) {
    store[STORAGE_KEYS.LOCALE] = locale.code;
    await initI18n();

    const rendered = translate('unitHoursMinutes', 1, '50');

    assert(
      rendered === '1h50',
      `${locale.code} rendered unitHoursMinutes as "${rendered}", expected "1h50"`
    );
  }
});

await test('no message can trip Chrome\'s named-placeholder parser', async () => {
  // Mirrors the rule that broke the manifest load: every $NAME$ in a message
  // must be declared in that entry's own placeholders block.
  const named = /\$([A-Za-z0-9_@]+)\$/g;

  for (const locale of LOCALES) {
    const file = new URL(`${locale.code}/messages.json`, localeRoot);
    const bundle = JSON.parse(readFileSync(file, 'utf8'));

    for (const [key, entry] of Object.entries(bundle)) {
      const declared = new Set(
        Object.keys(entry.placeholders || {}).map(n => n.toLowerCase())
      );

      for (const [token, name] of String(entry.message).matchAll(named)) {
        assert(
          declared.has(name.toLowerCase()),
          `${locale.code} "${key}" uses ${token} with no declaration`
        );
      }
    }
  }
});

await test('setLocale persists the choice and ignores no-ops', async () => {
  store[STORAGE_KEYS.LOCALE] = 'en';
  await initI18n();

  assert((await setLocale('es')) === true, 'switching should report a change');
  assert(store[STORAGE_KEYS.LOCALE] === 'es', 'choice should be stored');

  await initI18n();
  assert((await setLocale('es')) === false, 'switching to the active locale is a no-op');
  assert((await setLocale('klingon')) === false, 'unknown locales are refused');
});

/* ── report ── */

Date.now = realNow;

console.log(`\n${passed} passed, ${failures.length} failed`);

if (failures.length) {
  process.exit(1);
}
