export const STORAGE_KEYS = {
  SITES: 'blockedSites',
  IS_FOCUS: 'isFocusing',
  END_TS: 'focusEndTs',
  COUNTERS: 'attemptCounters',
  SETTINGS: 'settings',
  START_TS: 'focusStartTs',
  IS_PAUSED: 'isPaused',
  REMAINING_MS: 'remainingMs',
  LAST_USED_TIME: 'lastUsedTime',
  SESSION_HISTORY: 'sessionHistory'
};

export const FOCUS_ALARM_NAME = 'focusEnd';

function getLastErrorMessage() {
  const error = chrome.runtime.lastError;
  return error ? error.message : null;
}

export function storageGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, result => {
      const errorMessage = getLastErrorMessage();
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve(result);
    });
  });
}

export function storageSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const errorMessage = getLastErrorMessage();
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve();
    });
  });
}

export function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const errorMessage = getLastErrorMessage();
      if (errorMessage) {
        reject(new Error(errorMessage));
        return;
      }

      resolve();
    });
  });
}