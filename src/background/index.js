import { STORAGE_KEYS, storageGet } from '../utils/storage.js';
import {
  findBlockedMatch,
  redirectBlockedTab
} from '../core/blocking.js';
import {
  clearCounters,
  getFocusSnapshot,
  pauseFocus,
  recordBlockedAttempt,
  restoreFocusState,
  resumeFocus,
  startFocus,
  stopFocus
} from '../core/timer.js';

async function getCurrentState() {
  return getFocusSnapshot();
}

async function getActiveBlockedSites() {
  const state = await storageGet([
    STORAGE_KEYS.SITES,
    STORAGE_KEYS.IS_FOCUS,
    STORAGE_KEYS.IS_PAUSED
  ]);

  if (!state[STORAGE_KEYS.IS_FOCUS] || state[STORAGE_KEYS.IS_PAUSED]) {
    return [];
  }

  return state[STORAGE_KEYS.SITES] || [];
}

async function enforceBlockingForTab(tabId, rawUrl) {
  if (typeof tabId !== 'number' || !rawUrl) {
    return;
  }

  const blockedSites = await getActiveBlockedSites();

  if (!blockedSites.length) {
    return;
  }

  const matchedSite = findBlockedMatch(rawUrl, blockedSites);

  if (!matchedSite) {
    return;
  }

  await redirectBlockedTab(tabId, matchedSite);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab?.url;

  if (!url) {
    return;
  }

  void enforceBlockingForTab(tabId, url);
});

chrome.tabs.onCreated.addListener(tab => {
  void enforceBlockingForTab(tab?.id, tab?.pendingUrl || tab?.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await enforceBlockingForTab(tabId, tab?.url || tab?.pendingUrl);
  } catch {
    return;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  void restoreFocusState();
});

chrome.runtime.onStartup.addListener(() => {
  void restoreFocusState();
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== 'focusEnd') {
    return;
  }

  void (async () => {
    const state = await storageGet([STORAGE_KEYS.IS_FOCUS, STORAGE_KEYS.IS_PAUSED]);

    if (state[STORAGE_KEYS.IS_FOCUS] && !state[STORAGE_KEYS.IS_PAUSED]) {
      await stopFocus();
    }
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void (async () => {
    switch (message?.action) {
      case 'startFocus':
        await startFocus(message.minutes, message.blockedSites);
        sendResponse({ status: 'ok' });
        break;
      case 'stopFocus':
        await stopFocus();
        sendResponse({ status: 'ok' });
        break;
      case 'pauseFocus':
        await pauseFocus();
        sendResponse({ status: 'ok' });
        break;
      case 'resumeFocus':
        await resumeFocus();
        sendResponse({ status: 'ok' });
        break;
      case 'getStatus':
        sendResponse(await getCurrentState());
        break;
      case 'clearCounters':
        await clearCounters();
        sendResponse({ status: 'ok' });
        break;
      case 'registerBlockedAttempt':
        await recordBlockedAttempt(message.site);
        sendResponse({ status: 'ok' });
        break;
      case 'closeThisTab': {
        const tabIdToClose = sender?.tab?.id ?? message.tabId;

        if (typeof tabIdToClose === 'number') {
          await chrome.tabs.remove(tabIdToClose);
          sendResponse({ status: 'closed', tabId: tabIdToClose });
        } else {
          sendResponse({ status: 'no-tab-id' });
        }

        break;
      }
      default:
        sendResponse({ status: 'ignored' });
        break;
    }
  })();

  return true;
});