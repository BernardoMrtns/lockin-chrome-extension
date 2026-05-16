# Lock In

Lock In é uma extensão para Google Chrome que ajuda a manter foco durante sessões de estudo ou trabalho. A refatoração atual migrou o bloqueio para `chrome.declarativeNetRequest`, modularizou o service worker, adicionou i18n e empacotamento com Vite + CRXJS.

## O que a extensão faz

- Bloqueia sites distraidores no nível de rede, antes da página renderizar parcialmente.
- Inicia, pausa, retoma e encerra sessões de foco com timer persistente.
- Registra tentativas de acesso a sites bloqueados e mostra badge com o total.
- Exibe um resumo visual com Chart.js, tabela detalhada e histórico de sessões.
- Suporta português e inglês via `chrome.i18n`.

## Estrutura atual

- `background.js` é apenas o ponto de entrada do service worker.
- `src/background/index.js` registra listeners e coordena o fluxo principal.
- `src/core/blocking.js` monta e sincroniza regras dinâmicas do DNR.
- `src/core/timer.js` gerencia foco, pausa, retomada, contadores e histórico.
- `src/utils/storage.js` centraliza acesso a `chrome.storage.local`.
- `popup.js`, `blocked.js` e `summary.js` consomem mensagens e textos via i18n.

## Build gerado em `dist`

O build produzido por `npm run build` gera, entre outros, estes artefatos:

- `dist/manifest.json` com `default_locale`, `service-worker-loader.js` e permissões finais.
- `dist/service-worker-loader.js` e o bundle do worker em `dist/assets/background.js-*.js`.
- `dist/popup.html` e o bundle correspondente em `dist/assets/popup.html-*.js`.
- `dist/blocked.html`, `dist/blocked.js`, `dist/summary.html` e `dist/summary.js`.
- `dist/_locales/pt_BR/messages.json` e `dist/_locales/en/messages.json`.

## Como executar

### Desenvolvimento

```bash
npm install
npm run dev
```

### Produção

```bash
npm run build
```

Depois, carregue a pasta `dist/` como extensão sem compactação em `chrome://extensions`.

## Tecnologias

- JavaScript ES Modules
- Manifest V3
- `chrome.declarativeNetRequest`
- `chrome.alarms`, `chrome.storage.local`, `chrome.notifications`
- Vite + `@crxjs/vite-plugin`
- Chart.js

## Observações

- O bloqueio agora acontece antes da navegação completar, reduzindo flicker.
- O gráfico manual em Canvas foi substituído por Chart.js.
- A saída de build deve ser tratada como artefato gerado, não como código-fonte.
