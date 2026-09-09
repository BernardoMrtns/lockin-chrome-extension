export const STORAGE_KEYS = {
  SITES: 'blockedSites',
  IS_FOCUS: 'isFocusing',
  IS_PAUSED: 'isPaused',
  START_TS: 'focusStartTs',
  END_TS: 'focusEndTs',
  REMAINING_MS: 'remainingMs',
  LAST_USED_TIME: 'lastUsedTime',
  COUNTERS: 'attemptCounters',
  SESSION_HISTORY: 'sessionHistory',
  DAILY_STATS: 'dailyStats',
  LOCALE: 'uiLocale'
};

export const FOCUS_ALARM_NAME = 'focusEnd';

/** Sessions kept in history. Older ones are dropped so storage stays bounded. */
export const HISTORY_LIMIT = 60;

/** Days kept in dailyStats. */
const DAILY_STATS_LIMIT = 60;

export function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

export function storageSet(values) {
  return chrome.storage.local.set(values);
}

/** Local calendar day as YYYY-MM-DD. Uses local time so "today" matches the user's day. */
export function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function emptyDay() {
  return { attempts: 0, focusMs: 0, sessions: 0, sites: {} };
}

export async function getDailyStats() {
  const state = await storageGet([STORAGE_KEYS.DAILY_STATS]);
  return state[STORAGE_KEYS.DAILY_STATS] || {};
}

export async function getToday() {
  const stats = await getDailyStats();
  return { ...emptyDay(), ...(stats[dayKey()] || {}) };
}

/**
 * Merges numeric deltas into today's bucket and prunes days beyond DAILY_STATS_LIMIT.
 * `patch.sites` is a map of site -> delta.
 */
export async function bumpToday(patch) {
  const stats = await getDailyStats();
  const key = dayKey();
  const today = { ...emptyDay(), ...(stats[key] || {}) };

  today.attempts += patch.attempts || 0;
  today.focusMs += patch.focusMs || 0;
  today.sessions += patch.sessions || 0;

  if (patch.sites) {
    today.sites = { ...today.sites };
    for (const [site, delta] of Object.entries(patch.sites)) {
      today.sites[site] = (today.sites[site] || 0) + delta;
    }
  }

  stats[key] = today;

  const pruned = Object.fromEntries(
    Object.entries(stats)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, DAILY_STATS_LIMIT)
  );

  await storageSet({ [STORAGE_KEYS.DAILY_STATS]: pruned });
  return today;
}
