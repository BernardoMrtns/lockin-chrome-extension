/**
 * Shared test harness for tools/preview.html and tools/make-shots.html.
 * Not shipped (tools/ is excluded from the zip).
 *
 * Stubs the chrome.* APIs the UI touches, seeds a scenario into fake storage,
 * then loads the real page markup and the real module — so both the preview and
 * the store screenshots show the actual production code, not a mockup, and the
 * two can never drift apart.
 */

const ROOT = '../';

const now = Date.now();

export const SCENARIOS = {
  idle: {
    blockedSites: ['instagram.com', 'x.com', 'youtube.com', 'reddit.com'],
    isFocusing: false,
    lastUsedTime: 45
  },
  running: {
    blockedSites: ['instagram.com', 'x.com', 'youtube.com'],
    isFocusing: true,
    isPaused: false,
    focusStartTs: now - 16 * 60000,
    focusEndTs: now + 9 * 60000 + 22000,
    attemptCounters: { 'instagram.com': 5, 'x.com': 3, 'youtube.com': 1 },
    lastUsedTime: 25
  },
  paused: {
    blockedSites: ['instagram.com', 'x.com'],
    isFocusing: true,
    isPaused: true,
    focusStartTs: now - 12 * 60000,
    focusEndTs: now + 13 * 60000,
    remainingMs: 13 * 60000 + 40000,
    attemptCounters: { 'instagram.com': 2 },
    lastUsedTime: 25
  }
};

const BLOCKED_PARAMS = {
  first: { site: 'instagram.com', n: '1', today: '1' },
  repeat: { site: 'instagram.com', n: '3', today: '4' }
};

const LOCALE_ALIASES = {
  en: 'en', pt: 'pt_BR', pt_BR: 'pt_BR', 'pt-BR': 'pt_BR', es: 'es'
};

function dayKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

function seedDailyStats() {
  const stats = {};
  const shape = [0, 52, 95, 0, 130, 74, 25, 168, 40, 0, 88, 145, 60, 110];

  shape.forEach((minutes, index) => {
    if (!minutes) return;

    const date = new Date();
    date.setDate(date.getDate() - (shape.length - 1 - index));

    stats[dayKey(date)] = {
      focusMs: minutes * 60000,
      sessions: Math.max(1, Math.round(minutes / 45)),
      attempts: Math.round(minutes / 9),
      sites: {
        'instagram.com': Math.round(minutes / 14),
        'x.com': Math.round(minutes / 22)
      }
    };
  });

  return stats;
}

function seedHistory() {
  return [6, 5, 4, 3, 2, 1].map(daysAgo => {
    const date = new Date(now - daysAgo * 86400000);
    const planned = [25, 45, 90][daysAgo % 3];
    const completed = daysAgo % 3 !== 1;

    return {
      date: date.toISOString(),
      focusedMs: (completed ? planned : Math.round(planned * 0.4)) * 60000,
      plannedMinutes: planned,
      completed,
      counters: { 'instagram.com': daysAgo, 'x.com': Math.max(0, daysAgo - 2) }
    };
  });
}

/** Installs the stub on `window.chrome` and returns the backing store. */
export function installChromeStub({ page, scenario, locale } = {}) {
  // The blocked page only makes sense over a live session, unless the scenario
  // deliberately asks for the "session already ended" state.
  const fallback = page === 'blocked' && scenario !== 'over' ? 'running' : 'idle';

  const store = {
    ...(SCENARIOS[scenario] || SCENARIOS[fallback]),
    sessionHistory: seedHistory(),
    dailyStats: seedDailyStats()
  };

  // The pages read their language from storage, same as in the extension.
  if (locale) {
    store.uiLocale = LOCALE_ALIASES[locale] || 'en';
  }

  if (page === 'summary') {
    store.attemptCounters = {
      'instagram.com': 14,
      'x.com': 9,
      'youtube.com': 6,
      'reddit.com': 4,
      'news.ycombinator.com': 1
    };
  }

  const changeListeners = [];

  window.chrome = {
    // chrome.i18n only serves the manifest now; the pages fetch _locales
    // themselves so the language can be switched at runtime.
    i18n: {
      getMessage: () => '',
      getUILanguage: () => 'en-US'
    },
    runtime: {
      getURL: path => ROOT + path,
      sendMessage: async message => {
        if (message.action === 'getStatus') {
          return {
            ...store,
            today: store.dailyStats[dayKey()]
              || { attempts: 0, focusMs: 0, sessions: 0, sites: {} }
          };
        }

        return { ok: true };
      },
      lastError: null
    },
    storage: {
      local: {
        get: async keys => {
          const list = Array.isArray(keys) ? keys : [keys];
          const out = {};
          for (const key of list) if (key in store) out[key] = store[key];
          return out;
        },
        set: async values => {
          Object.assign(store, values);
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = { newValue: value };
          }
          changeListeners.forEach(fn => fn(changes, 'local'));
        },
        remove: async keys => {
          for (const key of (Array.isArray(keys) ? keys : [keys])) delete store[key];
        }
      },
      onChanged: { addListener: fn => changeListeners.push(fn) }
    },
    tabs: { create: async () => {} },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
      setBadgeTextColor: async () => {}
    }
  };

  return store;
}

/** Loads a page's stylesheets into the current document and waits for them. */
export async function loadStyles(doc, bust) {
  for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
    const clone = document.createElement('link');
    clone.rel = 'stylesheet';
    clone.href = ROOT + link.getAttribute('href') + bust;
    document.head.append(clone);
  }

  await Promise.all(
    [...document.querySelectorAll('link[rel="stylesheet"]')].map(
      link => new Promise(resolve => {
        if (link.sheet) return resolve();
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', resolve, { once: true });
      })
    )
  );
}

/**
 * Fetches a page's real markup, mounts its body into `target`, and runs its
 * module. `target` defaults to the document body, which is what the preview
 * wants; the screenshot tool passes its own container.
 */
export async function mountPage({ page, scenario, target = document.body }) {
  const bust = `?v=${Date.now()}`;
  const html = await fetch(`${ROOT}${page}.html${bust}`).then(r => r.text());
  const doc = new DOMParser().parseFromString(html, 'text/html');

  await loadStyles(doc, bust);

  target.className = doc.body.className;
  target.insertAdjacentHTML(
    'afterbegin',
    doc.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g, '')
  );

  if (page === 'blocked') {
    // blocked.js reads its tally from the query string, so rewrite it first.
    const params = new URLSearchParams(BLOCKED_PARAMS[scenario] || BLOCKED_PARAMS.repeat);
    history.replaceState(null, '', `?${params}`);
  }

  // Let the stylesheets settle before the module measures anything.
  await new Promise(resolve => setTimeout(resolve, 60));
  await import(`${ROOT}${page}.js${bust}`);

  // And let the module's own async boot (i18n fetch, first render) finish.
  await new Promise(resolve => setTimeout(resolve, 260));
}
