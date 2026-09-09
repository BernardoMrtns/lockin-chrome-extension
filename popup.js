import { STORAGE_KEYS } from './src/utils/storage.js';
import { canonicalizeSite, normalizeSites } from './src/core/blocking.js';
import {
  applyStaticText,
  formatClock,
  formatDuration,
  initI18n,
  plural,
  t
} from './src/utils/i18n.js';
import { renderLanguageTile } from './src/ui/language.js';
import { renderSupport } from './src/ui/support.js';

const METER_CELLS = 20;
const DEFAULT_MINUTES = 25;

const PRESETS = [
  { key: 'presetSocial', sites: ['instagram.com', 'x.com', 'tiktok.com', 'facebook.com'] },
  { key: 'presetVideo', sites: ['youtube.com', 'twitch.tv', 'netflix.com'] },
  { key: 'presetForums', sites: ['reddit.com', 'news.ycombinator.com'] }
];

const el = id => document.getElementById(id);

/** Draft list of sites. Committed to storage when a session starts. */
let draftSites = [];
let tickHandle = null;

/* ─────────── toast ─────────── */

let toastHandle = null;

function toast(text) {
  const node = el('toast');
  node.textContent = text;
  node.hidden = false;

  clearTimeout(toastHandle);
  toastHandle = setTimeout(() => {
    node.hidden = true;
  }, 2200);
}

/* ─────────── site chips ─────────── */

function renderSites() {
  const list = el('siteList');
  list.textContent = '';

  for (const site of draftSites) {
    const item = document.createElement('li');
    item.className = 'tag';

    const label = document.createElement('span');
    label.className = 'tag__label';
    label.textContent = site;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'tag__remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', t('popupRemoveSite', site));
    remove.addEventListener('click', () => {
      draftSites = draftSites.filter(entry => entry !== site);
      void persistSites();
      renderSites();
    });

    item.append(label, remove);
    list.append(item);
  }

  el('siteEmpty').hidden = draftSites.length > 0;
  el('siteCount').textContent = draftSites.length ? String(draftSites.length) : '';
  el('startBtn').disabled = draftSites.length === 0;
}

async function persistSites() {
  await chrome.storage.local.set({ [STORAGE_KEYS.SITES]: draftSites });
}

function addSites(candidates) {
  const before = draftSites.length;
  draftSites = normalizeSites([...draftSites, ...candidates]);

  const added = draftSites.length - before;
  void persistSites();
  renderSites();

  return added;
}

function renderPresets() {
  const wrap = el('presetChips');
  wrap.textContent = '';

  for (const preset of PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = t(preset.key);
    chip.addEventListener('click', () => {
      const added = addSites(preset.sites);
      toast(added ? plural('popupPresetAdded', added) : t('popupPresetNothingNew'));
    });
    wrap.append(chip);
  }
}

/* ─────────── duration ─────────── */

const durationChips = () => document.querySelectorAll('#durationChips [data-minutes]');

/**
 * The preset chips and the free-text field are one control with two faces: the
 * field holds a value only when it is not one of the presets, so the chosen
 * duration is never shown twice.
 */
function selectedMinutes() {
  const typed = Number.parseInt(el('minutesInput').value, 10);

  if (Number.isFinite(typed) && typed > 0) {
    return Math.min(typed, 1440);
  }

  for (const chip of durationChips()) {
    if (chip.getAttribute('aria-pressed') === 'true') {
      return Number(chip.dataset.minutes);
    }
  }

  return DEFAULT_MINUTES;
}

/** Presses the chip matching `minutes`, or none when the value is a custom one. */
function setDuration(minutes) {
  let matched = false;

  for (const chip of durationChips()) {
    const isMatch = Number(chip.dataset.minutes) === minutes;
    chip.setAttribute('aria-pressed', String(isMatch));
    matched = matched || isMatch;
  }

  el('minutesInput').value = matched ? '' : String(minutes);
}

/** Called as the user types: keep the chips in step with the field. */
function syncDurationChips() {
  const typed = Number.parseInt(el('minutesInput').value, 10);

  for (const chip of durationChips()) {
    chip.setAttribute('aria-pressed', String(Number(chip.dataset.minutes) === typed));
  }
}

/* ─────────── meter ─────────── */

function buildMeter() {
  const meter = el('meter');

  for (let index = 0; index < METER_CELLS; index += 1) {
    const cell = document.createElement('span');
    cell.className = 'meter__cell';
    cell.dataset.on = 'false';
    meter.append(cell);
  }
}

function renderMeter(fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const filled = Math.round(clamped * METER_CELLS);
  const cells = el('meter').children;

  for (let index = 0; index < cells.length; index += 1) {
    cells[index].dataset.on = String(index < filled);
  }

  el('meter').setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
}

/* ─────────── tally ─────────── */

function renderTally(counters) {
  const entries = Object.entries(counters || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  el('tallyBlock').hidden = entries.length === 0;

  const list = el('tallyList');
  list.textContent = '';

  const max = entries.length ? entries[0][1] : 1;

  for (const [site, count] of entries) {
    const row = document.createElement('li');
    row.className = 'tally__row';

    const name = document.createElement('span');
    name.className = 'tally__site';
    name.textContent = site;

    const countWrap = document.createElement('span');
    countWrap.className = 'tally__count';

    const blocks = document.createElement('span');
    blocks.className = 'tally__blocks';

    // Cap the bar so one runaway site cannot squash the rest.
    const barLength = Math.max(1, Math.round((count / max) * 5));

    for (let index = 0; index < barLength; index += 1) {
      blocks.append(document.createElement('i'));
    }

    const number = document.createElement('span');
    number.textContent = String(count);

    countWrap.append(blocks, number);
    row.append(name, countWrap);
    list.append(row);
  }
}

/* ─────────── render ─────────── */

let lastSnapshot = null;

function renderRunning(snapshot) {
  const isPaused = Boolean(snapshot[STORAGE_KEYS.IS_PAUSED]);
  const startTs = snapshot[STORAGE_KEYS.START_TS] || 0;
  const endTs = snapshot[STORAGE_KEYS.END_TS] || 0;
  const remainingMs = isPaused
    ? snapshot[STORAGE_KEYS.REMAINING_MS] || 0
    : Math.max(0, endTs - Date.now());

  const totalMs = Math.max(1, endTs - startTs);
  const counters = snapshot[STORAGE_KEYS.COUNTERS] || {};
  const attempts = Object.values(counters).reduce((sum, n) => sum + n, 0);

  el('hero').dataset.paused = String(isPaused);
  el('clock').textContent = formatClock(remainingMs);
  el('heroLabel').textContent = isPaused ? t('popupPausedLabel') : t('popupRunningLabel');
  el('heroFoot').textContent = attempts
    ? plural('popupHeroBlocked', attempts)
    : t('popupHeroClean');

  renderMeter(1 - remainingMs / totalMs);

  const pauseBtn = el('pauseBtn');
  pauseBtn.textContent = isPaused ? t('popupResume') : t('popupPause');

  el('stateDot').dataset.state = isPaused ? 'paused' : 'on';
  el('stateLabel').textContent = isPaused ? t('popupPausedLabel') : t('popupRunningLabel');

  renderTally(counters);
}

function renderIdle(snapshot) {
  el('stateDot').dataset.state = 'off';
  el('stateLabel').textContent = t('popupIdleLabel');

  setDuration(snapshot[STORAGE_KEYS.LAST_USED_TIME] || DEFAULT_MINUTES);
  renderSites();
}

function renderToday(today) {
  const stats = today || { sessions: 0, focusMs: 0, attempts: 0 };

  el('todayLine').textContent = stats.sessions || stats.attempts
    ? t(
        'popupToday',
        plural('countSessions', stats.sessions),
        formatDuration(stats.focusMs),
        plural('countBlocked', stats.attempts)
      )
    : t('popupTodayEmpty');
}

function render(snapshot) {
  lastSnapshot = snapshot;

  const isFocusing = Boolean(snapshot[STORAGE_KEYS.IS_FOCUS]);

  el('viewIdle').hidden = isFocusing;
  el('viewRunning').hidden = !isFocusing;

  if (isFocusing) {
    renderRunning(snapshot);
  } else {
    renderIdle(snapshot);
  }

  renderToday(snapshot.today);
  scheduleTick(snapshot);
}

/* ─────────── ticking ─────────── */

function scheduleTick(snapshot) {
  clearInterval(tickHandle);
  tickHandle = null;

  const running = snapshot[STORAGE_KEYS.IS_FOCUS] && !snapshot[STORAGE_KEYS.IS_PAUSED];

  if (!running) {
    return;
  }

  // Half-second cadence keeps the seconds digit honest without a rAF loop.
  tickHandle = setInterval(() => {
    if (!lastSnapshot) {
      return;
    }

    const endTs = lastSnapshot[STORAGE_KEYS.END_TS] || 0;

    if (endTs - Date.now() <= 0) {
      clearInterval(tickHandle);
      tickHandle = null;
      void refresh();
      return;
    }

    renderRunning(lastSnapshot);
  }, 500);
}

/* ─────────── actions ─────────── */

async function send(action, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({ action, ...payload });
  } catch {
    return null;
  }
}

async function refresh() {
  const snapshot = await send('getStatus');

  if (!snapshot) {
    return;
  }

  if (!snapshot[STORAGE_KEYS.IS_FOCUS]) {
    draftSites = normalizeSites(snapshot[STORAGE_KEYS.SITES] || []);
  }

  render(snapshot);
}

function wire() {
  el('addForm').addEventListener('submit', event => {
    event.preventDefault();

    const input = el('siteInput');
    const candidate = canonicalizeSite(input.value);

    if (!candidate) {
      toast(t('popupSiteInvalid'));
      return;
    }

    if (draftSites.includes(candidate)) {
      toast(t('popupSiteDuplicate', candidate));
      input.value = '';
      return;
    }

    addSites([candidate]);
    input.value = '';
    input.focus();
  });

  el('durationChips').addEventListener('click', event => {
    const chip = event.target.closest('[data-minutes]');

    if (!chip) {
      return;
    }

    setDuration(Number(chip.dataset.minutes));
  });

  el('minutesInput').addEventListener('input', syncDurationChips);

  el('startBtn').addEventListener('click', async () => {
    if (!draftSites.length) {
      toast(t('popupSitesEmpty'));
      return;
    }

    await send('startFocus', { minutes: selectedMinutes(), blockedSites: draftSites });
    await refresh();
  });

  el('pauseBtn').addEventListener('click', async () => {
    const isPaused = Boolean(lastSnapshot?.[STORAGE_KEYS.IS_PAUSED]);
    await send(isPaused ? 'resumeFocus' : 'pauseFocus');
    await refresh();
  });

  el('stopBtn').addEventListener('click', async () => {
    await send('stopFocus');
    await refresh();
  });

  el('summaryBtn').addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('summary.html') });
  });

  el('supportBtn').addEventListener('click', () => {
    const panel = el('supportPanel');
    const opening = panel.hidden;

    if (opening) {
      renderSupport(panel, { wide: false });
    }

    panel.hidden = !opening;
    el('supportBtn').setAttribute('aria-expanded', String(opening));
    el('supportBtn').dataset.open = String(opening);
  });

  // The session can end from the alarm while the popup is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }

    // A language change can come from this popup or from an open summary tab.
    if (STORAGE_KEYS.LOCALE in changes) {
      void applyLocale();
      return;
    }

    const watched = [
      STORAGE_KEYS.IS_FOCUS,
      STORAGE_KEYS.IS_PAUSED,
      STORAGE_KEYS.END_TS,
      STORAGE_KEYS.COUNTERS
    ];

    if (watched.some(key => key in changes)) {
      void refresh();
    }
  });

  window.addEventListener('unload', () => clearInterval(tickHandle));
}

/** Everything holding a translated string, rebuilt for the active language. */
async function applyLocale() {
  await initI18n();
  applyStaticText();
  renderPresets();
  renderLanguageTile(el('langs'));

  if (!el('supportPanel').hidden) {
    renderSupport(el('supportPanel'), { wide: false });
  }

  await refresh();
}

buildMeter();
wire();
void applyLocale();
