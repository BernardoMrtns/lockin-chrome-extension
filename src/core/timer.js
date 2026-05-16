import {
  FOCUS_ALARM_NAME,
  STORAGE_KEYS,
  storageGet,
  storageSet
} from '../utils/storage.js';
import { clearBlockingRules, syncBlockingRules } from './blocking.js';

const DEFAULT_FOCUS_MINUTES = 25;

function nowMs() {
  return Date.now();
}

async function updateBadge() {
  const state = await storageGet([STORAGE_KEYS.COUNTERS, STORAGE_KEYS.IS_FOCUS]);
  const counters = state[STORAGE_KEYS.COUNTERS] || {};
  const isFocus = state[STORAGE_KEYS.IS_FOCUS] || false;

  if (!isFocus) {
    await chrome.action.setBadgeText({ text: '' });
    return;
  }

  const totalAttempts = Object.values(counters).reduce((sum, count) => sum + count, 0);
  await chrome.action.setBadgeText({ text: totalAttempts ? String(totalAttempts) : '' });

  if (totalAttempts) {
    await chrome.action.setBadgeBackgroundColor({ color: '#ff4d4d' });
  }
}

async function persistSessionHistory(sessionSnapshot) {
  const historyState = await storageGet([STORAGE_KEYS.SESSION_HISTORY]);
  const sessionHistory = historyState[STORAGE_KEYS.SESSION_HISTORY] || [];

  sessionHistory.push(sessionSnapshot);

  await storageSet({
    [STORAGE_KEYS.SESSION_HISTORY]: sessionHistory
  });
}

export async function getFocusSnapshot() {
  return storageGet([
    STORAGE_KEYS.SITES,
    STORAGE_KEYS.IS_FOCUS,
    STORAGE_KEYS.END_TS,
    STORAGE_KEYS.COUNTERS,
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.START_TS,
    STORAGE_KEYS.IS_PAUSED,
    STORAGE_KEYS.REMAINING_MS,
    STORAGE_KEYS.LAST_USED_TIME,
    STORAGE_KEYS.SESSION_HISTORY
  ]);
}

export async function recordBlockedAttempt(site) {
  const blockedSite = String(site || '').trim();

  if (!blockedSite) {
    return;
  }

  const state = await storageGet([STORAGE_KEYS.COUNTERS]);
  const counters = state[STORAGE_KEYS.COUNTERS] || {};

  counters[blockedSite] = (counters[blockedSite] || 0) + 1;

  await storageSet({
    [STORAGE_KEYS.COUNTERS]: counters
  });

  await updateBadge();
}

export async function clearCounters() {
  await storageSet({
    [STORAGE_KEYS.COUNTERS]: {}
  });

  await updateBadge();
}

export async function startFocus(minutes, blockedSites) {
  const focusMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_FOCUS_MINUTES;
  const startTs = nowMs();
  const endTs = startTs + focusMinutes * 60 * 1000;
  const sites = Array.isArray(blockedSites) ? blockedSites : (await storageGet([STORAGE_KEYS.SITES]))[STORAGE_KEYS.SITES] || [];

  await chrome.alarms.clear(FOCUS_ALARM_NAME);
  await storageSet({
    [STORAGE_KEYS.IS_FOCUS]: true,
    [STORAGE_KEYS.END_TS]: endTs,
    [STORAGE_KEYS.START_TS]: startTs,
    [STORAGE_KEYS.IS_PAUSED]: false,
    [STORAGE_KEYS.REMAINING_MS]: 0,
    [STORAGE_KEYS.LAST_USED_TIME]: focusMinutes,
    [STORAGE_KEYS.COUNTERS]: {}
  });

  await syncBlockingRules(sites);
  await chrome.alarms.create(FOCUS_ALARM_NAME, { when: endTs });
  await updateBadge();
}

export async function stopFocus() {
  await chrome.alarms.clear(FOCUS_ALARM_NAME);

  const state = await storageGet([
    STORAGE_KEYS.COUNTERS,
    STORAGE_KEYS.END_TS
  ]);

  const counters = state[STORAGE_KEYS.COUNTERS] || {};
  const endTs = state[STORAGE_KEYS.END_TS] || nowMs();
  const durationMinutes = Math.max(0, Math.round((endTs - nowMs()) / 60000));

  await persistSessionHistory({
    date: new Date().toISOString(),
    duration: durationMinutes,
    counters
  });

  await storageSet({
    [STORAGE_KEYS.IS_FOCUS]: false,
    [STORAGE_KEYS.END_TS]: 0,
    [STORAGE_KEYS.START_TS]: 0,
    [STORAGE_KEYS.IS_PAUSED]: false,
    [STORAGE_KEYS.REMAINING_MS]: 0
  });

  await clearBlockingRules();
  await updateBadge();
}

export async function pauseFocus() {
  const state = await storageGet([
    STORAGE_KEYS.END_TS,
    STORAGE_KEYS.IS_FOCUS
  ]);

  if (!state[STORAGE_KEYS.IS_FOCUS]) {
    return;
  }

  const endTs = state[STORAGE_KEYS.END_TS] || nowMs();
  const remainingMs = Math.max(0, endTs - nowMs());

  await chrome.alarms.clear(FOCUS_ALARM_NAME);
  await storageSet({
    [STORAGE_KEYS.IS_PAUSED]: true,
    [STORAGE_KEYS.REMAINING_MS]: remainingMs
  });

  await clearBlockingRules();
  await updateBadge();
}

export async function resumeFocus() {
  const state = await storageGet([
    STORAGE_KEYS.REMAINING_MS,
    STORAGE_KEYS.SITES
  ]);

  const remainingMs = state[STORAGE_KEYS.REMAINING_MS] || 0;
  const blockedSites = state[STORAGE_KEYS.SITES] || [];
  const newEndTs = nowMs() + remainingMs;

  await storageSet({
    [STORAGE_KEYS.END_TS]: newEndTs,
    [STORAGE_KEYS.IS_PAUSED]: false,
    [STORAGE_KEYS.REMAINING_MS]: 0
  });

  await syncBlockingRules(blockedSites);
  await chrome.alarms.create(FOCUS_ALARM_NAME, { when: newEndTs });
  await updateBadge();
}

export async function restoreFocusState() {
  const state = await getFocusSnapshot();

  if (!state[STORAGE_KEYS.IS_FOCUS]) {
    await clearBlockingRules();
    await updateBadge();
    return state;
  }

  if (state[STORAGE_KEYS.IS_PAUSED]) {
    await clearBlockingRules();
    await updateBadge();
    return state;
  }

  const endTs = state[STORAGE_KEYS.END_TS] || nowMs();

  if (endTs <= nowMs()) {
    await stopFocus();
    return getFocusSnapshot();
  }

  await syncBlockingRules(state[STORAGE_KEYS.SITES] || []);
  await chrome.alarms.create(FOCUS_ALARM_NAME, { when: endTs });
  await updateBadge();

  return state;
}