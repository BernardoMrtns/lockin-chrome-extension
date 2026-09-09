import { FOCUS_ALARM_NAME } from '../utils/storage.js';
import { buildBlockedPageUrl, findBlockedMatch } from '../core/blocking.js';
import {
  clearCounters,
  getActiveSites,
  getSnapshot,
  pauseFocus,
  recordAttempt,
  restoreState,
  resumeFocus,
  startFocus,
  stopFocus,
  updateBadge
} from '../core/timer.js';

/**
 * chrome.tabs.onUpdated fires several times per navigation (loading, title,
 * favicon, complete) and onActivated can fire right after. Without this guard
 * a single visit to a blocked site is counted two or three times.
 *
 * Keyed by `tabId:site`; entries are short-lived and the map is trimmed so a
 * long-running worker cannot grow it without bound.
 */
const recentRedirects = new Map();
const REDIRECT_DEDUPE_MS = 2500;

function alreadyHandled(tabId, site) {
  const key = `${tabId}:${site}`;
  const now = Date.now();
  const seenAt = recentRedirects.get(key);

  if (seenAt && now - seenAt < REDIRECT_DEDUPE_MS) {
    return true;
  }

  recentRedirects.set(key, now);

  if (recentRedirects.size > 200) {
    for (const [entryKey, ts] of recentRedirects) {
      if (now - ts > REDIRECT_DEDUPE_MS) {
        recentRedirects.delete(entryKey);
      }
    }
  }

  return false;
}

async function enforce(tabId, rawUrl) {
  if (typeof tabId !== 'number' || !rawUrl) {
    return;
  }

  const sites = await getActiveSites();

  if (!sites.length) {
    return;
  }

  const site = findBlockedMatch(rawUrl, sites);

  if (!site || alreadyHandled(tabId, site)) {
    return;
  }

  // Count first so the blocked page can show the tally without a round trip.
  const counts = await recordAttempt(site);

  try {
    await chrome.tabs.update(tabId, {
      url: buildBlockedPageUrl(site, counts)
    });
  } catch {
    // Tab went away mid-navigation.
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab?.url;

  if (url) {
    void enforce(tabId, url);
  }
});

chrome.tabs.onCreated.addListener(tab => {
  void enforce(tab?.id, tab?.pendingUrl || tab?.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await enforce(tabId, tab?.url || tab?.pendingUrl);
  } catch {
    // Tab closed before we got to it.
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  for (const key of recentRedirects.keys()) {
    if (key.startsWith(`${tabId}:`)) {
      recentRedirects.delete(key);
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void restoreState();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreState();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === FOCUS_ALARM_NAME) {
    void stopFocus({ completed: true });
  }
});

const handlers = {
  startFocus: msg => startFocus(msg.minutes, msg.blockedSites),
  stopFocus: () => stopFocus({ completed: false }),
  pauseFocus: () => pauseFocus(),
  resumeFocus: () => resumeFocus(),
  clearCounters: () => clearCounters(),
  getStatus: () => getSnapshot()
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.action];

  if (message?.action === 'closeThisTab') {
    const tabId = sender?.tab?.id;

    if (typeof tabId === 'number') {
      void chrome.tabs.remove(tabId).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false })
      );
    } else {
      sendResponse({ ok: false });
    }

    return true;
  }

  if (!handler) {
    sendResponse({ ok: false, error: 'unknown-action' });
    return false;
  }

  void (async () => {
    try {
      const result = await handler(message);
      sendResponse(result === undefined ? { ok: true } : result);
    } catch (error) {
      sendResponse({ ok: false, error: String(error?.message || error) });
    }
  })();

  return true;
});

// The worker can be respawned by any event, not just startup.
void updateBadge();
