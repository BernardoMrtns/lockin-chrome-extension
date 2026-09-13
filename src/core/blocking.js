/**
 * Rule matching and tab redirection.
 *
 * Blocking is done by redirecting the tab to blocked.html. There is no
 * declarativeNetRequest here on purpose: DNR cannot tell us *which* rule fired
 * without the extra `declarativeNetRequestFeedback` permission, and we want to
 * count attempts per site.
 *
 * A rule is a hostname, optionally followed by a path prefix. The path is what
 * lets one part of a site be shut while the rest stays open: `youtube.com` takes
 * the whole site away, `youtube.com/shorts` takes only the shorts feed and
 * leaves the lectures reachable.
 */

/** Collapses repeated slashes and drops the trailing one, so "/a//b/" is "/a/b". */
function normalizePath(path) {
  return path.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
}

/** Splits a rule into its hostname and its path prefix (which may be empty). */
function splitRule(rule) {
  const slash = rule.indexOf('/');

  return slash === -1
    ? { host: rule, path: '' }
    : { host: rule.slice(0, slash), path: rule.slice(slash) };
}

/**
 * Turns free-form user input ("https://X.com/home?a=1", "X.COM.") into a rule.
 * Query and fragment are dropped: they vary per visit and would never match.
 */
export function canonicalizeSite(site) {
  const raw = String(site || '').trim().toLowerCase();

  if (!raw) {
    return '';
  }

  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const hostAndPath = withoutScheme.split(/[?#]/)[0];
  const { host, path } = splitRule(hostAndPath);

  const cleanHost = host
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '')
    .trim();

  if (!cleanHost) {
    return '';
  }

  return `${cleanHost}${normalizePath(path)}`;
}

export function normalizeSites(sites) {
  return [...new Set((sites || []).map(canonicalizeSite).filter(Boolean))];
}

function isHttpUrl(rawUrl) {
  try {
    const { protocol } = new URL(rawUrl);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * A rule matches if the hostname equals its host or is a subdomain of it, and —
 * when the rule carries one — the path sits under its prefix. The prefix has to
 * end on a segment boundary, so `/shorts` does not swallow `/shortstories`.
 *
 * Bare keywords (no dot in the host) match anywhere in the URL, so "reddit"
 * catches old.reddit.com and google.com/search?q=reddit alike.
 */
function matches(rawUrl, rule) {
  if (!isHttpUrl(rawUrl) || !rule) {
    return false;
  }

  const url = new URL(rawUrl);
  const { host, path } = splitRule(rule);

  if (!host.includes('.')) {
    return url.href.toLowerCase().includes(rule);
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  if (hostname !== host && !hostname.endsWith(`.${host}`)) {
    return false;
  }

  if (!path) {
    return true;
  }

  const pathname = normalizePath(url.pathname.toLowerCase());

  return pathname === path || pathname.startsWith(`${path}/`);
}

/** Bare keyword < whole host < host pinned to a path; a longer path pins more. */
function specificity(rule) {
  const { host, path } = splitRule(rule);

  return host.includes('.') ? 1 + path.length : 0;
}

/**
 * Returns the blocked rule matching the URL, or '' when nothing matches.
 *
 * When several rules match, the most specific one wins. A list holding both
 * `youtube.com` and `youtube.com/shorts` tallies a shorts visit against the
 * shorts rule, which is the one that says something about the habit.
 */
export function findBlockedMatch(rawUrl, sites) {
  if (!isHttpUrl(rawUrl)) {
    return '';
  }

  let best = '';

  for (const site of normalizeSites(sites)) {
    if (matches(rawUrl, site) && (!best || specificity(site) > specificity(best))) {
      best = site;
    }
  }

  return best;
}

/** True when `broad` blocks every address `narrow` does. */
function covers(broad, narrow) {
  const wide = splitRule(broad);
  const thin = splitRule(narrow);

  // A keyword is a substring test, so it covers any rule whose text contains it.
  if (!wide.host.includes('.')) {
    return narrow.includes(broad);
  }

  if (thin.host !== wide.host && !thin.host.endsWith(`.${wide.host}`)) {
    return false;
  }

  return !wide.path || thin.path === wide.path || thin.path.startsWith(`${wide.path}/`);
}

/**
 * Returns the rule in `sites` that already blocks everything `site` would, or
 * '' when there is none.
 *
 * A path rule is silently pointless next to a broader one — adding
 * `youtube.com/shorts` to a list that already holds `youtube.com` changes
 * nothing — and without this the popup has no way to say so.
 */
export function findCoveringRule(site, sites) {
  const rule = canonicalizeSite(site);
  const { host, path } = splitRule(rule);

  if (!rule || !path || !host.includes('.')) {
    return '';
  }

  for (const other of normalizeSites(sites)) {
    if (other !== rule && covers(other, rule)) {
      return other;
    }
  }

  return '';
}

/**
 * `counts` is passed through the URL rather than fetched by the blocked page so
 * the tally is fixed at redirect time. Reloading the page then cannot inflate it.
 */
export function buildBlockedPageUrl(site, counts = null) {
  const params = new URLSearchParams();

  if (site) {
    params.set('site', site);
  }

  if (counts) {
    params.set('n', String(counts.sessionCount || 0));
    params.set('today', String(counts.todayCount || 0));
  }

  const query = params.toString();
  return `${chrome.runtime.getURL('blocked.html')}${query ? `?${query}` : ''}`;
}

export async function redirectTab(tabId, site) {
  if (typeof tabId !== 'number') {
    return false;
  }

  try {
    await chrome.tabs.update(tabId, { url: buildBlockedPageUrl(site) });
    return true;
  } catch {
    // Tab closed mid-flight, or is a tab we are not allowed to touch.
    return false;
  }
}

/** Sweeps every open tab. Used when a session starts or resumes. */
export async function findOpenBlockedTabs(sites) {
  const normalized = normalizeSites(sites);

  if (!normalized.length) {
    return [];
  }

  const tabs = await chrome.tabs.query({});
  const hits = [];

  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || !tab.url) {
      continue;
    }

    const site = findBlockedMatch(tab.url, normalized);

    if (site) {
      hits.push({ tabId: tab.id, site });
    }
  }

  return hits;
}
