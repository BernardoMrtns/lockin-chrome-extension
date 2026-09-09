import { STORAGE_KEYS, dayKey, getDailyStats } from './src/utils/storage.js';
import { applyStaticText, initI18n, localeTag, plural, t } from './src/utils/i18n.js';
import { renderLanguageTile } from './src/ui/language.js';
import { renderSupport } from './src/ui/support.js';

const GRAPH_DAYS = 14;

const el = id => document.getElementById(id);
const locale = localeTag;

/* ─────────── formatting ─────────── */

function minutesOf(ms) {
  return Math.round(ms / 60000);
}

function formatFocus(ms) {
  const totalMinutes = minutesOf(ms);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours ? { value: `${hours}h${String(minutes).padStart(2, '0')}`, unit: '' }
    : { value: String(minutes), unit: t('unitMinAbbrev') };
}

function formatWhen(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString(locale(), {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/* ─────────── stat blocks ─────────── */

function statBlock({ label, value, unit, accent = false }) {
  const block = document.createElement('div');
  block.className = 'stat';
  block.dataset.accent = String(accent);

  const labelNode = document.createElement('span');
  labelNode.className = 'eyebrow stat__label';
  labelNode.textContent = label;

  const valueNode = document.createElement('span');
  valueNode.className = 'numeral stat__value';
  valueNode.textContent = value;

  if (unit) {
    const unitNode = document.createElement('span');
    unitNode.className = 'stat__unit';
    unitNode.textContent = ` ${unit}`;
    valueNode.append(unitNode);
  }

  block.append(labelNode, valueNode);
  return block;
}

/**
 * Consecutive days ending today (or yesterday) with at least one session.
 * Yesterday counts as alive so the streak does not reset mid-morning.
 */
function computeStreak(daily) {
  const cursor = new Date();
  let streak = 0;

  if (!(daily[dayKey(cursor)]?.sessions > 0)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (daily[dayKey(cursor)]?.sessions > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function renderStats(daily, history) {
  const today = daily[dayKey()] || { sessions: 0, focusMs: 0, attempts: 0 };
  const focus = formatFocus(today.focusMs || 0);
  const allTimeMs = Object.values(daily).reduce((sum, day) => sum + (day.focusMs || 0), 0);
  const allTime = formatFocus(allTimeMs);

  const wrap = el('stats');
  wrap.textContent = '';
  wrap.append(
    statBlock({ label: t('statTodayFocus'), value: focus.value, unit: focus.unit, accent: true }),
    statBlock({ label: t('statTodaySessions'), value: String(today.sessions || 0) }),
    statBlock({ label: t('statTodayBlocked'), value: String(today.attempts || 0) }),
    statBlock({ label: t('statStreak'), value: String(computeStreak(daily)), unit: t('unitDaysAbbrev') }),
    statBlock({ label: t('statAllTime'), value: allTime.value, unit: allTime.unit })
  );

  el('headSub').textContent = history.length
    ? t(
        'summarySub',
        plural('countSessions', history.length),
        allTime.value + (allTime.unit ? ` ${allTime.unit}` : '')
      )
    : t('summarySubEmpty');
}

/* ─────────── 14-day graph ─────────── */

function renderGraph(daily) {
  const graph = el('graph');
  graph.textContent = '';

  const days = [];

  for (let offset = GRAPH_DAYS - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);

    const key = dayKey(date);
    const day = daily[key] || {};

    days.push({
      date,
      key,
      focusMs: day.focusMs || 0,
      attempts: day.attempts || 0,
      sessions: day.sessions || 0
    });
  }

  const peak = Math.max(...days.map(day => day.focusMs), 1);
  const hasAny = days.some(day => day.focusMs > 0 || day.attempts > 0);

  el('graphEmpty').hidden = hasAny;
  graph.hidden = !hasAny;
  el('weekLegend').textContent = hasAny ? t('summaryWeekLegend') : '';

  if (!hasAny) {
    return;
  }

  const todayKey = dayKey();

  for (const day of days) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.dataset.focus = String(day.focusMs > 0);
    bar.dataset.today = String(day.key === todayKey);
    bar.tabIndex = 0;

    const label = t(
      'summaryBarTooltip',
      minutesOf(day.focusMs),
      plural('countSessions', day.sessions),
      plural('countBlocked', day.attempts)
    );
    bar.setAttribute('aria-label', `${day.key} — ${label}`);

    const fill = document.createElement('div');
    fill.className = 'bar__fill';
    // Floor at 4% so a day with a short session is still visibly nonzero.
    fill.style.height = day.focusMs > 0
      ? `${Math.max(4, (day.focusMs / peak) * 100)}%`
      : '3px';

    const value = document.createElement('span');
    value.className = 'bar__value';
    value.textContent = label;

    // Day of month, not weekday: 14 days repeats weekday names, and in
    // Portuguese three of them abbreviate to "s".
    const dayName = document.createElement('span');
    dayName.className = 'bar__day';
    dayName.textContent = String(day.date.getDate());

    bar.append(value, fill, dayName);
    graph.append(bar);
  }
}

/* ─────────── offenders ─────────── */

function renderRanks(counters) {
  const entries = Object.entries(counters || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  el('ranksEmpty').hidden = entries.length > 0;

  const list = el('ranks');
  list.textContent = '';
  list.hidden = entries.length === 0;

  if (!entries.length) {
    return;
  }

  const peak = entries[0][1];

  entries.forEach(([site, count], index) => {
    const row = document.createElement('li');
    row.className = 'rank';

    const position = document.createElement('span');
    position.className = 'rank__pos';
    position.textContent = String(index + 1).padStart(2, '0');

    const body = document.createElement('div');
    body.className = 'rank__body';

    const name = document.createElement('span');
    name.className = 'rank__site';
    name.textContent = site;

    const track = document.createElement('div');
    track.className = 'rank__track';

    const bar = document.createElement('div');
    bar.className = 'rank__bar';
    bar.style.width = `${(count / peak) * 100}%`;

    track.append(bar);
    body.append(name, track);

    const countNode = document.createElement('span');
    countNode.className = 'rank__count';
    countNode.textContent = String(count);

    row.append(position, body, countNode);
    list.append(row);
  });
}

/* ─────────── history ─────────── */

function renderSessions(history) {
  const recent = history.slice(-20).reverse();

  el('sessionsEmpty').hidden = recent.length > 0;

  const list = el('sessions');
  list.textContent = '';
  list.hidden = recent.length === 0;

  for (const session of recent) {
    const item = document.createElement('li');
    item.className = 'session';

    const when = document.createElement('span');
    when.className = 'session__when';
    when.textContent = formatWhen(session.date);

    const attempts = Object.values(session.counters || {}).reduce((sum, n) => sum + n, 0);

    // Older records stored `duration` (in minutes) before focusedMs existed.
    const focusedMs = typeof session.focusedMs === 'number'
      ? session.focusedMs
      : (session.duration || 0) * 60000;

    const meta = document.createElement('span');
    meta.className = 'session__meta';
    meta.textContent = t(
      'summarySessionMeta',
      minutesOf(focusedMs),
      session.plannedMinutes ?? minutesOf(focusedMs),
      plural('countBlocked', attempts)
    );

    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.dataset.kind = session.completed ? 'done' : 'cut';
    badge.textContent = session.completed ? t('summaryBadgeDone') : t('summaryBadgeCut');

    item.append(when, meta, badge);
    list.append(item);
  }
}

/* ─────────── load ─────────── */

async function refresh() {
  const [state, daily] = await Promise.all([
    chrome.storage.local.get([STORAGE_KEYS.COUNTERS, STORAGE_KEYS.SESSION_HISTORY]),
    getDailyStats()
  ]);

  const counters = state[STORAGE_KEYS.COUNTERS] || {};
  const history = state[STORAGE_KEYS.SESSION_HISTORY] || [];

  renderStats(daily, history);
  renderGraph(daily);
  renderRanks(counters);
  renderSessions(history);
}

function wire() {
  el('clearCountersBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'clearCounters' }).catch(() => null);
    await refresh();
  });

  el('resetBtn').addEventListener('click', async () => {
    if (!window.confirm(t('summaryResetConfirm'))) {
      return;
    }

    await chrome.storage.local.remove([
      STORAGE_KEYS.SESSION_HISTORY,
      STORAGE_KEYS.DAILY_STATS,
      STORAGE_KEYS.COUNTERS
    ]);

    await chrome.runtime.sendMessage({ action: 'clearCounters' }).catch(() => null);
    await refresh();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }

    if (STORAGE_KEYS.LOCALE in changes) {
      void applyLocale();
      return;
    }

    void refresh();
  });
}

async function applyLocale() {
  await initI18n();
  applyStaticText();
  document.title = t('summaryPageTitle');
  renderLanguageTile(el('langs'));
  renderSupport(el('supportPanel'), { wide: true });
  await refresh();
}

wire();
void applyLocale();
