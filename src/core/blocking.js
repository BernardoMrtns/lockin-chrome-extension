function normalizeBlockedSites(blockedSites) {
  return [...new Set((blockedSites || [])
    .map(site => canonicalizeBlockedSite(site))
    .filter(Boolean))];
}

function canonicalizeBlockedSite(site) {
  const raw = String(site || '').trim().toLowerCase();

  if (!raw) {
    return '';
  }

  try {
    const parsedUrl = raw.includes('://') ? new URL(raw) : new URL(`https://${raw}`);
    return parsedUrl.hostname.replace(/\.+$/, '');
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .replace(/[/?#].*$/, '')
      .replace(/\.+$/, '')
      .trim();
  }
}

function isNavigableHttpUrl(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

function matchesBlockedSite(rawUrl, blockedSite) {
  if (!isNavigableHttpUrl(rawUrl) || !blockedSite) {
    return false;
  }

  try {
    const parsedUrl = new URL(rawUrl);
    const hostname = parsedUrl.hostname.toLowerCase();
    const fullUrl = parsedUrl.href.toLowerCase();
    const normalizedSite = canonicalizeBlockedSite(blockedSite);

    if (!normalizedSite) {
      return false;
    }

    const isDomainLike = normalizedSite.includes('.') || normalizedSite.includes(':');

    if (isDomainLike) {
      return hostname === normalizedSite || hostname.endsWith(`.${normalizedSite}`);
    }

    return fullUrl.includes(normalizedSite);
  } catch {
    return false;
  }
}

export function findBlockedMatch(rawUrl, blockedSites) {
  const normalizedSites = normalizeBlockedSites(blockedSites);

  for (const site of normalizedSites) {
    if (matchesBlockedSite(rawUrl, site)) {
      return site;
    }
  }

  return '';
}

export function buildBlockedPageUrl(site, tabId) {
  const blockedSite = String(site || '').trim();
  const params = new URLSearchParams();

  if (blockedSite) {
    params.set('site', blockedSite);
  }

  if (typeof tabId === 'number') {
    params.set('tabId', String(tabId));
  }

  const query = params.toString();
  return `${chrome.runtime.getURL('blocked.html')}${query ? `?${query}` : ''}`;
}

export async function redirectBlockedTab(tabId, site) {
  if (typeof tabId !== 'number') {
    return false;
  }

  await chrome.tabs.update(tabId, {
    url: buildBlockedPageUrl(site, tabId)
  });

  return true;
}

async function enforceBlockedTabs(blockedSites) {
  const normalizedSites = normalizeBlockedSites(blockedSites);

  if (!normalizedSites.length) {
    return [];
  }

  const tabs = await chrome.tabs.query({});
  const matches = [];

  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || !tab.url) {
      continue;
    }

    const matchedSite = findBlockedMatch(tab.url, normalizedSites);

    if (!matchedSite) {
      continue;
    }

    matches.push({ tabId: tab.id, site: matchedSite });
  }

  await Promise.all(matches.map(match => redirectBlockedTab(match.tabId, match.site)));
  return matches;
}

export async function syncBlockingRules(blockedSites) {
  const normalizedSites = normalizeBlockedSites(blockedSites);

  if (!normalizedSites.length) {
    return [];
  }

  await enforceBlockedTabs(normalizedSites);
  return normalizedSites;
}

export async function clearBlockingRules() {
  return;
}