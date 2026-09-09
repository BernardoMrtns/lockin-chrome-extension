/**
 * Hostname matching and tab redirection.
 *
 * Blocking is done by redirecting the tab to blocked.html. There is no
 * declarativeNetRequest here on purpose: DNR cannot tell us *which* rule fired
 * without the extra `declarativeNetRequestFeedback` permission, and we want to
 * count attempts per site.
 */

/** Turns free-form user input ("https://X.com/home", "X.COM.") into a bare hostname. */
export function canonicalizeSite(site) {
  const raw = String(site || '').trim().toLowerCase();

  if (!raw) {
    return '';
  }

  const withoutScheme = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const hostOnly = withoutScheme.split(/[/?#]/)[0];

  return hostOnly
    .replace(/^www\./, '')
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '')
    .trim();
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
 * A site matches if the hostname equals it or is a subdomain of it.
 * Bare keywords (no dot) match anywhere in the URL, so "reddit" catches
 * old.reddit.com and google.com/search?q=reddit alike.
 */
function matches(rawUrl, site) {
  if (!isHttpUrl(rawUrl) || !site) {
    return false;
  }

  const url = new URL(rawUrl);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  if (!site.includes('.')) {
    return url.href.toLowerCase().includes(site);
  }

  return hostname === site || hostname.endsWith(`.${site}`);
}

/** Returns the first blocked site matching the URL, or '' when nothing matches. */
export function findBlockedMatch(rawUrl, sites) {
  if (!isHttpUrl(rawUrl)) {
    return '';
  }

  for (const site of normalizeSites(sites)) {
    if (matches(rawUrl, site)) {
      return site;
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
