import Chart from 'chart.js/auto';

const STORAGE_KEY = 'attemptCounters';
const HISTORY_KEY = 'sessionHistory';
let attemptChart = null;

function t(key, fallback = '') {
  return chrome.i18n?.getMessage?.(key) || fallback;
}

async function loadCounters() {
  return new Promise(resolve => {
    chrome.storage.local.get([STORAGE_KEY], (res) => {
      resolve(res[STORAGE_KEY] || {});
    });
  });
}

async function loadHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get([HISTORY_KEY], (res) => {
      resolve(res[HISTORY_KEY] || []);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function destroyChart() {
  if (attemptChart) {
    attemptChart.destroy();
    attemptChart = null;
  }
}

function drawChart(entries) {
  const canvas = document.getElementById('barChart');
  const chartWrap = document.getElementById('chartWrap');
  const chartEmpty = document.getElementById('chartEmpty');

  destroyChart();

  if (!entries.length) {
    chartWrap.dataset.empty = 'true';
    chartEmpty.textContent = t('summaryChartEmpty', 'Nenhuma tentativa registrada');
    canvas.setAttribute('aria-label', t('summaryChartEmpty', 'Nenhuma tentativa registrada'));
    return;
  }

  chartWrap.dataset.empty = 'false';
  canvas.removeAttribute('aria-label');

  const ctx = canvas.getContext('2d');
  const labels = entries.map(([site]) => site);
  const values = entries.map(([, count]) => count);

  attemptChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Tentativas',
        data: values,
        borderRadius: 12,
        borderSkipped: false,
        barPercentage: 0.7,
        categoryPercentage: 0.8,
        backgroundColor: context => {
          const chart = context.chart;
          const { ctx: chartCtx, chartArea } = chart;

          if (!chartArea) {
            return '#667eea';
          }

          const gradient = chartCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, '#8fb3ff');
          gradient.addColorStop(1, '#4f46e5');
          return gradient;
        },
        hoverBackgroundColor: '#a78bfa'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 650,
        easing: 'easeOutQuart'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          titleColor: '#ffffff',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(148, 163, 184, 0.22)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: context => `${context.formattedValue} tentativas`
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.06)'
          },
          ticks: {
            color: '#cbd5e1',
            maxRotation: 0,
            autoSkip: false
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.08)'
          },
          ticks: {
            color: '#cbd5e1',
            precision: 0
          }
        }
      }
    }
  });
}

function renderTable(entries) {
  const wrap = document.getElementById('tableWrap');
  if (!entries.length) {
    wrap.innerHTML = `<div class="empty">${t('summaryNoAttempts', 'Nenhuma tentativa registrada durante a última sessão de foco.')}</div>`;
    return;
  }
  let html = '<table><thead><tr><th>Site</th><th style="text-align:right">Tentativas</th></tr></thead><tbody>';
  for (const [site, count] of entries) {
    html += `<tr><td>${escapeHtml(site)}</td><td class="count">${count}</td></tr>`;
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function renderHistory(history) {
  const wrap = document.getElementById('historyWrap');
  if (!history.length) {
    wrap.innerHTML = `<div class="empty">${t('summaryNoHistory', 'Nenhum histórico de sessão disponível.')}</div>`;
    return;
  }
  wrap.innerHTML = history.slice(-10).reverse().map(session => {
    const date = new Date(session.date).toLocaleString('pt-BR');
    const attempts = Object.entries(session.counters || {});
    return `
      <div class="session">
        <h3>${date}</h3>
        <p>Duração: ${session.duration || 0} minutos</p>
        <p>Total de tentativas: ${attempts.reduce((sum, [, count]) => sum + count, 0)}</p>
        ${attempts.length > 0 ? `
          <div class="session-attempts">
            ${attempts.map(([site, count]) => `<span class="attempt-tag">${site}: ${count}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

async function refreshUI() {
  document.title = t('summaryPageTitle', 'Lock In — Resumo');
  document.getElementById('summaryTitle').textContent = t('summaryHeading', 'Resumo das Tentativas de Sessão');
  document.getElementById('historyTitle').textContent = t('summaryHistoryHeading', 'Histórico de Sessões');

  const counters = await loadCounters();
  const history = await loadHistory();

  const entries = Object.entries(counters).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  document.getElementById('metaText').textContent = t('summaryMetaText', 'Total de tentativas nesta sessão: {0}').replace('{0}', String(total));
  document.getElementById('totalText').textContent = t('summaryTotalText', 'Total: {0}').replace('{0}', String(total));
  document.getElementById('lastUpdated').textContent = t('summaryUpdatedText', 'Atualizado: {0}').replace('{0}', new Date().toLocaleString('pt-BR'));

  renderTable(entries);
  renderHistory(history);
  drawChart(entries);
}

// Initial load with small delay to ensure DOM is ready
setTimeout(() => {
  refreshUI();
}, 100);
