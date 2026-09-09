import { STORAGE_KEYS } from './src/utils/storage.js';
import { applyStaticText, formatClock, initI18n, t } from './src/utils/i18n.js';

const params = new URLSearchParams(location.search);
const site = params.get('site') || '';
const sessionCount = Number.parseInt(params.get('n') || '0', 10) || 0;
const todayCount = Number.parseInt(params.get('today') || '0', 10) || 0;

const el = id => document.getElementById(id);

/*
 * A small rotation of headlines, chosen by the attempt count rather than at
 * random, so hammering reload does not turn the page into a slot machine.
 */
const SHOUTS = ['blockedShout1', 'blockedShout2', 'blockedShout3', 'blockedShout4'];

function shoutFor(count) {
  return t(SHOUTS[Math.min(Math.max(count, 1), SHOUTS.length) - 1]);
}

function tallyText() {
  if (todayCount > 1) {
    return t('blockedTallyToday', todayCount);
  }

  if (sessionCount > 1) {
    return t('blockedTallySession', sessionCount);
  }

  return t('blockedTallyFirst');
}

/*
 * Session state is cached rather than re-read every tick: the clock only needs
 * endTs to count down locally, and storage.onChanged tells us when that changes.
 * A blocked tab can sit open for an hour; polling storage once a second for it
 * buys nothing.
 */
let session = null;
let tickHandle = null;

async function loadSession() {
  const state = await chrome.storage.local.get([
    STORAGE_KEYS.IS_FOCUS,
    STORAGE_KEYS.IS_PAUSED,
    STORAGE_KEYS.END_TS,
    STORAGE_KEYS.REMAINING_MS
  ]);

  session = {
    isFocusing: Boolean(state[STORAGE_KEYS.IS_FOCUS]),
    isPaused: Boolean(state[STORAGE_KEYS.IS_PAUSED]),
    endTs: state[STORAGE_KEYS.END_TS] || 0,
    remainingMs: state[STORAGE_KEYS.REMAINING_MS] || 0
  };

  render();
}

function remainingMs() {
  if (!session?.isFocusing) {
    return 0;
  }

  return session.isPaused
    ? session.remainingMs
    : Math.max(0, session.endTs - Date.now());
}

/** Full render. Called on load and whenever the session state changes. */
function render() {
  const over = !session?.isFocusing;

  el('stateLabel').textContent = over
    ? t('popupIdleLabel')
    : t(session.isPaused ? 'popupPausedLabel' : 'popupRunningLabel');

  el('clockline').hidden = over || session.isPaused;
  el('tally').textContent = over ? t('blockedSessionOver') : tallyText();
  el('footNote').textContent = over ? t('blockedFootNoteOver') : t('blockedFootNote');

  // While the session runs, the honest way "back to work" is to close the tab
  // that pulled you away. Going back in history would land on the blocked site
  // and bounce straight back here. Once the session is over, back is safe.
  el('primaryBtn').textContent = over ? t('blockedGoNow') : t('blockedBack');

  if (session?.isPaused) {
    el('tally').textContent = t('blockedPausedNote');
  }

  renderClock();
}

/** Cheap path: only the digits change. */
function renderClock() {
  if (!session?.isFocusing || session.isPaused) {
    clearInterval(tickHandle);
    tickHandle = null;
    return;
  }

  el('clock').textContent = formatClock(remainingMs());

  if (remainingMs() <= 0) {
    // The alarm is about to land; pick up the new state when it writes.
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function startTicking() {
  clearInterval(tickHandle);
  tickHandle = setInterval(renderClock, 1000);
}

function renderStatic() {
  applyStaticText();
  document.title = t('blockedPageTitle');

  el('heading').textContent = shoutFor(Math.max(todayCount, sessionCount, 1));
  el('siteName').textContent = site || t('blockedThisSite');
  el('siteVerb').textContent = t('blockedSiteVerb');
  el('clockLabel').textContent = t('blockedRemainingLabel');
  el('secondaryBtn').textContent = t('popupSummary');
}

function wire() {
  el('primaryBtn').addEventListener('click', async () => {
    if (!session?.isFocusing) {
      history.back();
      return;
    }

    const response = await chrome.runtime
      .sendMessage({ action: 'closeThisTab' })
      .catch(() => null);

    if (!response?.ok) {
      // Chrome refuses window.close() on tabs it did not open via script; the
      // background path above is the one that normally works.
      window.close();
    }
  });

  el('secondaryBtn').addEventListener('click', () => {
    location.replace(chrome.runtime.getURL('summary.html'));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }

    if (STORAGE_KEYS.LOCALE in changes) {
      void boot();
      return;
    }

    const watched = [STORAGE_KEYS.IS_FOCUS, STORAGE_KEYS.IS_PAUSED, STORAGE_KEYS.END_TS];

    if (watched.some(key => key in changes)) {
      void loadSession().then(startTicking);
    }
  });
}

/*
 * No language tile here on purpose: this page is an interruption, and the one
 * thing it should not offer is something to fiddle with. It follows whatever
 * the popup is set to.
 */
async function boot() {
  await initI18n();
  renderStatic();
  await loadSession();
  startTicking();
}

wire();
void boot();
