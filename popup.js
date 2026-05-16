const STORAGE_KEYS = {
  SITES: 'blockedSites',
  IS_FOCUS: 'isFocusing',
  END_TS: 'focusEndTs',
  COUNTERS: 'attemptCounters',
  LAST_USED_TIME: 'lastUsedTime',
  START_TS: 'focusStartTs',
  IS_PAUSED: 'isPaused',
  REMAINING_MS: 'remainingMs'
};

function $(id){ return document.getElementById(id); }

function t(key, fallback = '') {
  return chrome.i18n?.getMessage?.(key) || fallback;
}

async function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
async function setStorage(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

let timerFrameId = null;

function stopTimerFrame() {
  if (timerFrameId !== null) {
    cancelAnimationFrame(timerFrameId);
    timerFrameId = null;
  }
}

function startTimerFrame(st) {
  stopTimerFrame();

  const isFocus = st?.[STORAGE_KEYS.IS_FOCUS] || false;
  const isPaused = st?.[STORAGE_KEYS.IS_PAUSED] || false;

  if (!isFocus || isPaused) {
    return;
  }

  const frame = () => {
    const currentState = st;

    if (!currentState?.[STORAGE_KEYS.IS_FOCUS] || currentState?.[STORAGE_KEYS.IS_PAUSED]) {
      timerFrameId = null;
      return;
    }

    updateTimer(currentState[STORAGE_KEYS.END_TS], currentState);
    timerFrameId = requestAnimationFrame(frame);
  };

  timerFrameId = requestAnimationFrame(frame);
}

async function loadUI() {
  $('statusText').innerText = t('popupLoading', 'Carregando...');
  document.title = t('popupTitle', 'Lock In');
  $('appTitle').textContent = t('appName', 'Lock In');
  $('blockedSitesLabel').textContent = t('popupBlockedSitesLabel', 'Sites bloqueados (uma por linha):');
  $('sitesInput').placeholder = t('popupSitesPlaceholder', 'ex: twitter.com');
  $('focusTimeLabel').textContent = t('popupFocusTimeLabel', 'Tempo de foco (min)');

  const st = await getStorage([STORAGE_KEYS.SITES, STORAGE_KEYS.IS_FOCUS, STORAGE_KEYS.END_TS, STORAGE_KEYS.COUNTERS, STORAGE_KEYS.LAST_USED_TIME, STORAGE_KEYS.START_TS, STORAGE_KEYS.IS_PAUSED, STORAGE_KEYS.REMAINING_MS]);
  const sites = st[STORAGE_KEYS.SITES] || [];
  $('sitesInput').value = sites.join('\n');

  // Load the last used time or default to 25 minutes
  const lastUsedTime = st[STORAGE_KEYS.LAST_USED_TIME] || 25;
  $('minutesInput').value = lastUsedTime;

  updateStatus(st);

  $('startBtn').textContent = t('popupStartFocus', 'Iniciar foco');
  $('startBtn').setAttribute('aria-label', t('popupStartFocusAria', 'Iniciar foco'));
  $('pauseBtn').setAttribute('aria-label', t('popupPauseFocusAria', 'Pausar foco'));
  $('stopBtn').textContent = t('popupStopFocus', 'Parar');
  $('stopBtn').setAttribute('aria-label', t('popupStopFocusAria', 'Parar foco'));
  $('showSummary').textContent = t('popupShowSummary', 'Mostrar resumo');
  $('showSummary').setAttribute('aria-label', t('popupShowSummaryAria', 'Mostrar resumo'));
  $('clearCounts').textContent = t('popupClearCounts', 'Limpar contadores');
  $('clearCounts').setAttribute('aria-label', t('popupClearCountsAria', 'Limpar contadores'));
}

function updateStatus(st) {
  const isFocus = st?.[STORAGE_KEYS.IS_FOCUS] || false;
  const isPaused = st?.[STORAGE_KEYS.IS_PAUSED] || false;
  const endTs = st?.[STORAGE_KEYS.END_TS] || 0;
  if (isFocus) {
    if (isPaused) {
      $('statusText').innerText = t('popupStatusPaused', 'Modo foco pausado');
      $('timerText').innerText = t('popupTimerPaused', 'Pausado');
      updateCircle(0, 1, t('popupTimerPauseCircle', 'Pausa'));
      stopTimerFrame();
    } else {
      $('statusText').innerText = t('popupStatusActive', 'Modo foco ativo');
      updateTimer(endTs, st);
      startTimerFrame(st);
    }
  } else {
    $('statusText').innerText = t('popupStatusInactive', 'Modo foco inativo');
    $('timerText').innerText = '';
    updateCircle(0, 1, '');
    stopTimerFrame();
  }

  // Update pause button text
  const pauseBtn = $('pauseBtn');
  if (isFocus) {
    pauseBtn.disabled = false;
    if (isPaused) {
      pauseBtn.textContent = t('popupResumeFocus', 'Retomar');
      pauseBtn.setAttribute('aria-label', t('popupResumeFocusAria', 'Retomar foco'));
    } else {
      pauseBtn.textContent = t('popupPauseFocus', 'Pausar');
      pauseBtn.setAttribute('aria-label', t('popupPauseFocusAria', 'Pausar foco'));
    }
  } else {
    pauseBtn.disabled = true;
    pauseBtn.textContent = t('popupPauseFocus', 'Pausar');
    pauseBtn.setAttribute('aria-label', t('popupPauseFocusAria', 'Pausar foco'));
  }
}

function updateTimer(endTs, st) {
  const msLeft = endTs - Date.now();
  if (msLeft <= 0) {
    $('timerText').innerText = t('popupTimerFinished', 'Tempo finalizado');
    updateCircle(0, 1, '');
    stopTimerFrame();
    return;
  }
  const m = Math.floor(msLeft/60000);
  const s = Math.floor((msLeft%60000)/1000).toString().padStart(2,'0');
  $('timerText').innerText = `${m}:${s} restantes`;
  // Circle progress
  const startTs = st[STORAGE_KEYS.START_TS] || 0;
  const totalDuration = startTs && startTs < endTs ? endTs - startTs : 25 * 60 * 1000;
  const progress = Math.max(0, Math.min(1, msLeft / totalDuration));
  updateCircle(progress, 1, `${m}:${s}`);
}

function updateCircle(progress, max, text) {
  const circleFg = document.querySelector('.circle-fg');
  const circleBg = document.querySelector('.circle-bg');
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  
  if (circleFg) {
    // Inner circle fills as time progresses
    const fgOffset = circumference * (1 - progress);
    circleFg.setAttribute('stroke-dasharray', circumference);
    circleFg.setAttribute('stroke-dashoffset', fgOffset);
  }
  
  if (circleBg) {
    // Outer circle empties as time runs out
    const bgOffset = circumference * progress;
    circleBg.setAttribute('stroke-dasharray', circumference);
    circleBg.setAttribute('stroke-dashoffset', bgOffset);
  }
  
  const circleText = document.getElementById('circleText');
  if (circleText) circleText.textContent = text;
}

$('startBtn').addEventListener('click', async () => {
  const st = await getStorage([STORAGE_KEYS.IS_PAUSED, STORAGE_KEYS.IS_FOCUS]);
  const isPaused = st[STORAGE_KEYS.IS_PAUSED] || false;
  const isFocus = st[STORAGE_KEYS.IS_FOCUS] || false;

  if (isFocus && isPaused) {
    // Resume
    chrome.runtime.sendMessage({ action: 'resumeFocus' }, () => {
      loadUI();
      window.close();
    });
  } else {
    // Start new session
    const minutes = parseInt($('minutesInput').value) || 25;
    const sites = $('sitesInput').value.split('\n').map(s => s.trim()).filter(Boolean);

    // Save the last used time
    await setStorage({ [STORAGE_KEYS.LAST_USED_TIME]: minutes });

    await setStorage({ [STORAGE_KEYS.SITES]: sites });
    chrome.runtime.sendMessage({ action: 'startFocus', minutes, blockedSites: sites }, () => {
      loadUI();
      window.close();
    });
  }
});

$('pauseBtn').addEventListener('click', async () => {
  const st = await getStorage([STORAGE_KEYS.IS_PAUSED, STORAGE_KEYS.IS_FOCUS]);
  const isPaused = st[STORAGE_KEYS.IS_PAUSED] || false;
  const isFocus = st[STORAGE_KEYS.IS_FOCUS] || false;

  if (!isFocus) return; // Safety check, though button should be disabled

  if (isPaused) {
    // Resume
    chrome.runtime.sendMessage({ action: 'resumeFocus' }, () => {
      loadUI();
      window.close();
    });
  } else {
    // Pause
    chrome.runtime.sendMessage({ action: 'pauseFocus' }, () => {
      loadUI();
      window.close();
    });
  }
});

$('stopBtn').addEventListener('click', async () => {
  chrome.runtime.sendMessage({ action: 'stopFocus' }, () => {
    loadUI();
    window.close();
  });
});

// Add event listener to open the summary page
document.getElementById('showSummary').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('summary.html') });
});

$('clearCounts').addEventListener('click', async () => {
  await setStorage({ [STORAGE_KEYS.COUNTERS]: {} });
  alert(t('popupCountsCleared', 'Contadores limpos.'));
});

document.addEventListener('DOMContentLoaded', loadUI);
