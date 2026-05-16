const params = new URLSearchParams(location.search);
const site = params.get('site') || '';
const tabId = Number.parseInt(params.get('tabId') || '', 10);
let attemptReported = false;

function t(key, fallback = '') {
  return chrome.i18n?.getMessage?.(key) || fallback;
}

function renderBlockedSite() {
  document.title = t('blockedPageTitle', 'Bloqueado — Lock In');
  document.getElementById('blockedTitle').textContent = t('blockedPageHeading', 'Ops — site bloqueado');
  document.getElementById('blockedDescription').textContent = t('blockedPageDescription', 'Este site está bloqueado porque você está em uma sessão de foco.');
  document.getElementById('closeBtn').textContent = t('blockedCloseButton', 'Fechar');
  document.getElementById('siteText').innerText = site ? `${t('blockedAttemptLabel', 'Tentativa:')} ${site}` : '';
}

async function reportAttemptOnce() {
  if (attemptReported || !site) {
    return;
  }

  attemptReported = true;

  try {
    await chrome.runtime.sendMessage({ action: 'registerBlockedAttempt', site });
  } catch (error) {
    console.warn('Failed to report blocked attempt:', error);
  }
}

renderBlockedSite();
void reportAttemptOnce();

document.getElementById('closeBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'closeThisTab', tabId }, (resp) => {
    if (!resp || resp.status !== 'closed') {
      try {
        window.close();
      } catch (e) {
        window.location.href = 'about:blank';
      }
    }
  });
});
