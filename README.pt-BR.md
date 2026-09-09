# Lock In

Uma extensão do Chrome que tranca os sites que te distraem por um tempo
determinado — e conta cada vez que você tenta escapar.

Sem build, sem dependências, sem requisição de rede. Manifest V3.

*Tradução do [README em inglês](README.md), que é a versão de referência.*

## O que ela faz

- Você monta uma lista de sites e escolhe uma duração. Enquanto a sessão está
  ativa, qualquer tentativa de abrir um desses sites cai numa página de bloqueio.
- Cada tentativa é contada, por site e por dia. O badge do ícone mostra o total
  da sessão em andamento.
- Pausar congela o cronômetro e libera os sites; retomar recoloca a tranca. O
  tempo pausado não entra na conta de foco.
- A página de resumo mostra foco de hoje, sequência de dias, um gráfico dos
  últimos 14 dias, o ranking dos sites que mais te chamaram e o histórico de
  sessões.
- Inglês, português do Brasil e espanhol, trocáveis a qualquer momento pelo
  tile de bandeiras no topo do popup (e no resumo). Inglês é o padrão.

## Idiomas

O padrão é **inglês**, para todo mundo — o idioma do Chrome não é consultado. A
escolha do usuário fica em `chrome.storage.local` e vale para as três telas.

`chrome.i18n.getMessage` não serve aqui: ele sempre responde no idioma da
interface do Chrome e não pode ser redirecionado em runtime. Então
`src/utils/i18n.js` carrega `_locales/<código>/messages.json` por `fetch` e
resolve as chaves ele mesmo, com fallback para o inglês por chave — uma tradução
incompleta aparece em inglês em vez de aparecer vazia.

`chrome.i18n` continua sendo usado para uma coisa: o `name` e a `description` do
manifest (`__MSG_extName__`). Isso é o texto da **listagem na store**, que o
Chrome resolve pelo idioma do navegador de quem está vendo — ou seja, a listagem
é traduzida automaticamente nos três idiomas sem trabalho extra.

Como não há plural em `chrome.i18n`, frases com contagem ficam em duas chaves,
`<nome>One` e `<nome>Other`, escolhidas por `plural()`. Os três idiomas separam
1-vs-resto, então isso é suficiente.

Para adicionar um idioma: crie `_locales/<código>/messages.json`, adicione a
entrada em `LOCALES` (`src/utils/i18n.js`) e o desenho da bandeira em
`src/ui/language.js`. `npm run check` reprova se as três coisas divergirem.

As bandeiras são SVG inline, não emoji: o Windows não tem glifo para pares de
indicadores regionais, então o Chrome lá desenha 🇺🇸 como as letras "US" numa
caixinha. Cada botão leva o nome do idioma no próprio idioma como rótulo
acessível — bandeira representa país, não idioma, e o rótulo é o que é verdade.

## Como o bloqueio funciona

Não usa `declarativeNetRequest`. O service worker escuta `chrome.tabs.onUpdated`
/ `onCreated` / `onActivated`, compara a URL com a lista e redireciona a aba para
`blocked.html`.

A escolha é deliberada: o DNR bloqueia antes da renderização, mas não informa
qual regra disparou sem a permissão extra `declarativeNetRequestFeedback` — e
contar tentativas por site é metade do propósito da extensão. O custo é que a
navegação começa antes do redirecionamento.

Correspondência de sites:

| Você digita | Pega |
| --- | --- |
| `reddit.com` | `reddit.com`, `www.reddit.com`, `old.reddit.com` |
| `reddit` | qualquer URL que contenha "reddit", inclusive uma busca por reddit |

Esquemas que não são `http`/`https` nunca são bloqueados, então
`chrome://extensions` e a própria página de bloqueio continuam acessíveis.

## Permissões, e por que cada uma existe

| Permissão | Para quê |
| --- | --- |
| `storage` | guardar lista de sites, estado da sessão, contadores e histórico |
| `tabs` | ler a URL da aba e redirecioná-la quando bate com a lista |
| `alarms` | encerrar a sessão no horário, mesmo com o service worker dormindo |

Não há `host_permissions`, não há `web_accessible_resources` e nada é carregado
da rede — a fonte está embutida em `assets/fonts/`. Isso mantém a revisão da
Chrome Web Store no caminho rápido e não expõe o ID da extensão para os sites
que você visita.

## Estrutura

```
manifest.json          permissões e pontos de entrada
background.js          entrada do service worker
src/background/        listeners de aba, alarme e mensagens; dedupe de tentativas
src/core/blocking.js   normalização de host e correspondência
src/core/timer.js      início, pausa, retomada, encerramento, contadores, histórico
src/utils/storage.js   chaves de storage e estatísticas diárias
src/utils/i18n.js      carregamento das traduções, troca em runtime, plural
src/ui/language.js     tile de bandeiras (SVG inline)
assets/theme.css       design system compartilhado (tokens + primitivas)
popup.*                popup da barra de ferramentas
blocked.*              página de interrupção
summary.*              página de estatísticas
tools/                 checks, testes e empacotamento (não vai no zip)
```

Os dados ficam em `chrome.storage.local` e nunca saem da máquina. O histórico é
limitado a 60 sessões e as estatísticas diárias a 60 dias.

## Desenvolvimento

Não há passo de build. O que está no repositório é o que roda.

Carregar no navegador: `chrome://extensions` → ativar **Modo do desenvolvedor**
→ **Carregar sem compactação** → escolher a raiz do repositório. Depois de
editar, clique em recarregar no card da extensão.

### Comandos

```bash
npm test        # sessões, contadores, correspondência e lógica de idioma
npm run check   # checks de pré-publicação
npm run icons   # regenera icons/icon-{16,48,128}.png
npm run icons -- sheet   # também gera dist/icon-candidates.png para comparar
npm run qr      # regenera src/ui/qr-codes.js a partir dos endereços
npm run serve   # servidor estático para o harness de prévia
npm run zip     # roda os checks e gera dist/lock-in-<versão>.zip
```

`npm run check` verifica o que a revisão da store costuma reprovar: permissões
declaradas e não usadas, `host_permissions`, `web_accessible_resources`,
referências remotas, arquivos apontados pelo manifest que não existem, e as
localidades divergindo entre si, do código ou da lista de bandeiras.

### Prévia da interface

Para ver as telas sem recarregar a extensão, sirva a raiz e abra o harness — ele
mocka as APIs `chrome.*`, popula dados de exemplo e carrega o código real:

```bash
npm run serve
```

Ele envia `Cache-Control: no-store`. É a razão de existir em vez de qualquer
servidor estático: um `src/utils/i18n.js` em cache servido ao lado de uma
tradução recém-editada parece exatamente um bug no código, e cache-busting por
query string não alcança os imports dentro de um módulo ES.

- `tools/preview.html?page=popup&scenario=idle`
- `tools/preview.html?page=popup&scenario=running`
- `tools/preview.html?page=popup&scenario=paused`
- `tools/preview.html?page=blocked&scenario=repeat`
- `tools/preview.html?page=blocked&scenario=over`
- `tools/preview.html?page=summary`

Adicione `&locale=pt_BR` ou `&locale=es` para abrir já numa tradução. O tile de
bandeiras funciona no harness, então dá para trocar de idioma ali mesmo.

## Doações

O rodapé do popup tem um botão `apoiar` e a página de resumo um card, os dois
renderizando o mesmo painel: LivePix, Bitcoin e Solana, cada um com QR code.

Os QR codes são gerados por `tools/make-qr.mjs` — um encoder escrito do zero,
porque a extensão não faz nenhuma requisição de rede e buscá-los de um serviço
de QR ou embutir o widget do LivePix quebraria isso. Ficam como matrizes em
`src/ui/qr-codes.js` e são desenhados como SVG inline. A caixa do QR continua
clara no modo escuro: código invertido é ilegível para a maioria das câmeras.

O código do LivePix codifica a página pública de doação,
`livepix.gg/bernardomrtns`. Não a URL `widget.livepix.gg/embed/...` — aquela é
uma página que *renderiza* um QR code, então codificá-la levaria quem escaneou
para outro QR code.

Os códigos de cripto codificam o endereço puro, não uma URI `bitcoin:` ou
`solana:`, então o conteúdo do QR é caractere por caractere o que a página
mostra ao lado — e dá para conferir um contra o outro a olho.

`npm run check` valida os dois endereços. O do Bitcoin é validado de verdade:
bech32 tem checksum, então erro de digitação falha. **Um endereço Solana não
pode ser validado** — são 32 bytes crus sem checksum, qualquer valor de 32
bytes é sintaticamente válido, e o import de chave do Node não testa se o ponto
está na curva (medido: pega cerca de 1% dos erros de um caractere). Por isso os
dois endereços também ficam fixados em `tools/check.mjs`; qualquer alteração
falha o check até o valor fixado ser atualizado de propósito. Isso protege da
falha que de fato acontece — uma edição corrompida — não de digitar errado na
origem. Confira um endereço novo contra a carteira antes de fixá-lo.

## Design

Neo-brutalista: bordas de 2px, sombra sólida deslocada, cores planas e saturadas
(`#CCFF00` lima, `#FF4D8D` rosa) sobre creme, tipografia Space Grotesk pesada.
Nada desfoca — sem `backdrop-filter`, sem sombra suave, sem texto em gradiente.
`tools/check.mjs` reprova o build se algum desses aparecer no CSS.

Os tokens ficam em `assets/theme.css` e há suporte a modo escuro via
`prefers-color-scheme`. A página de bloqueio é a exceção: ela fixa o campo rosa
nos dois esquemas, porque é a única tela que deve parecer uma parede.

O ícone é um sinal de proibição sobre o quadrado lima. Ele é deliberadamente
não-criativo: em 16px, numa fileira de outros ícones da barra, uma marca
abstrata não comunica nada, e essa é a única forma que se lê como "bloqueado"
sem precisar aprender. Um rascunho anterior usava uma mira de foco, que lia como
mira de jogo.

É gerado por `tools/make-icons.mjs` — sem dependências, com supersampling para
cantos limpos — para que os três tamanhos fiquem consistentes quando uma
proporção muda. A geometria é escrita em unidades de 16px e escalada, porque
16px é a barra de ferramentas e é o único tamanho que precisa cair em pixel
inteiro. A versão de 16px abre mão da borda preta: com ela, não sobra espaço
interno para a marca.

Todos os candidatos ficam nesse mesmo arquivo, com uma constante `SHIPPED`
nomeando o que está em uso, então `npm run icons -- sheet` renderiza todos lado
a lado em todos os tamanhos sem a comparação nunca divergir do que é publicado.

## Licença

MIT — veja [LICENSE](LICENSE).

Inspirado em [Work Mode](https://github.com/ShreyRavi/workmode), de Shrey Ravi.
