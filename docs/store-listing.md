# Chrome Web Store listing

Everything the dashboard asks for, ready to paste. The extension's **name** and
**short description** are not here: the store reads those from `manifest.json`
and `_locales/`, so it localizes them on its own.

Before submitting, the two URLs below have to resolve — they point at `main`,
so `rewrite-v1` must be merged first.

Two things live outside this page and block publishing on their own, in the
dashboard's **Settings**, not on the item: a publisher contact email, and
clicking through the verification link it sends. Neither appears on the item
form, so the item can look complete and still refuse to publish.

### Product details

| Field | Value |
| --- | --- |
| Package title | comes from `_locales`; leave it |
| Package summary | comes from `_locales`; leave it |
| Description | the detailed description below |
| Category | Productivity |
| Editing language | English (en) is the default; add Portuguese (Brazil) and Spanish as extra listings for their descriptions) |

### Graphics

| Field | File |
| --- | --- |
| Store icon, 128x128 | `icons/icon-128.png` — already the right size, fills the canvas, corners transparent |
| Screenshots, 1280x800 | `store/lock-in-idle.png`, `-running.png`, `-blocked.png`, `-summary.png`, in that order |
| Small promo tile, 440x280 | `store/lock-in-tile-small.png` |
| Marquee promo tile, 1400x560 | `store/lock-in-tile-marquee.png` |
| Promo video | none |

Upload the screenshots under **localized** assets, in the current editing
language. That is the slot the dashboard requires; the global one can stay
empty, and is meant for images with no text in them.

The screenshots do have text — the interface in them is English — so the
English listing is where they belong. Adding a Portuguese or Spanish listing
later means giving each one its own screenshots: either these same four, or
translated ones, which the pipeline can produce because the harness takes
`&locale=pt_BR` and `&locale=es`.

The two promo tiles are optional — they are what Google uses if it ever
features the extension. There is no downside to having them.

### Extra fields

| Field | Value |
| --- | --- |
| Official URL | none — that field only accepts a domain verified in Google Search Console |
| Homepage URL | `https://github.com/bernardomcma/lockin-chrome-extension` |
| Support URL | `https://github.com/bernardomcma/lockin-chrome-extension/issues` |
| Mature content | No |
| Item support | on — the support URL goes to the issue tracker, which is the right place for it |
| Privacy policy URL (Privacy tab) | `https://github.com/bernardomcma/lockin-chrome-extension/blob/main/PRIVACY.md` |

## Single purpose

> Lock In blocks a user-defined list of websites for a timed focus session and
> reports how many times the user tried to open them.

Keep it to one sentence. Reviewers reject a "single purpose" that lists two.

## Permission justifications

**storage**

> Stores the user's list of blocked sites, the state of the current focus
> session, and the per-site attempt counts and session history shown on the
> summary screen. All of it stays in `chrome.storage.local` on the user's
> device.

**tabs**

> Reads the URL of a tab as it navigates so that a site on the user's own block
> list can be replaced with the extension's block page, and so the attempt can
> be counted. URLs are compared in memory against that list and are never
> stored or transmitted.

**Remote code**

> No. The extension executes no remote code. Every script, style, font, and
> image is bundled in the package, and it makes no network requests.

**alarms**

> Ends the focus session at the scheduled time even when the browser has
> unloaded the extension's service worker in the meantime. Without it a session
> would keep running past its end whenever Chrome suspended the worker.

Every declared permission gets its own required field — `alarms` included.

## Data usage

Check **nothing** in the data-types list, then certify all three statements:
the data is not sold to third parties, not used for purposes unrelated to the
single purpose, and not used to determine creditworthiness or for lending.

Lock In collects no data at all. Anything the user enters stays in
`chrome.storage.local` and never leaves the device.

## Detailed description — English

> Pick the sites that derail you. Pick how long. Lock In shuts them for exactly
> that long — and counts every time you tried to sneak back.
>
> That count is the point. Most blockers tell you no and move on. This one keeps
> the receipt, so at the end of a session you know whether you sat down and
> worked or reached for the same tab nine times in forty minutes.
>
> — Set a timer from five minutes to a few hours, pause it, or stop early
> — Block a whole site, or just the part that gets you: youtube.com/shorts
> stays shut while the lectures stay open
> — Every blocked attempt is counted per site, and the block page tells you the
> number to your face
> — A summary screen with your sessions, your daily totals, and where the
> impulse actually goes
> — English, Português and Español, switchable from the popup
>
> No account. No sign-up. No servers, no analytics, no telemetry — the
> extension makes no network requests whatsoever, and it asks for no permission
> to read the pages you visit. Your list and your statistics stay on your
> machine.
>
> Free and open source: github.com/BernardoMrtns/lockin-chrome-extension

## Detailed description — Português (Brasil)

> Escolha os sites que te desviam. Escolha por quanto tempo. O Lock In fecha
> eles por exatamente esse tempo — e conta cada vez que você tentou voltar.
>
> Essa contagem é o ponto. A maioria dos bloqueadores diz não e esquece. Este
> guarda o comprovante: no fim da sessão você sabe se sentou e trabalhou ou se
> foi na mesma aba nove vezes em quarenta minutos.
>
> — Timer de cinco minutos a algumas horas, com pausar e encerrar antes
> — Bloqueie o site inteiro, ou só a parte que te pega: youtube.com/shorts
> fica fechado e as aulas continuam abertas
> — Cada tentativa bloqueada é contada por site, e a página de bloqueio te
> mostra o número na cara
> — Uma tela de resumo com suas sessões, seus totais por dia e para onde o
> impulso realmente vai
> — English, Português e Español, trocável no popup
>
> Sem conta. Sem cadastro. Sem servidor, sem analytics, sem telemetria — a
> extensão não faz nenhuma requisição de rede, e não pede permissão para ler as
> páginas que você visita. Sua lista e suas estatísticas ficam na sua máquina.
>
> Livre e de código aberto: github.com/BernardoMrtns/lockin-chrome-extension

## Detailed description — Español

> Elige los sitios que te desvían. Elige cuánto tiempo. Lock In los cierra
> exactamente ese tiempo — y cuenta cada vez que intentaste volver.
>
> Esa cuenta es el punto. Casi todos los bloqueadores dicen no y se olvidan.
> Este guarda el recibo: al terminar la sesión sabes si te sentaste a trabajar o
> si fuiste a la misma pestaña nueve veces en cuarenta minutos.
>
> — Temporizador de cinco minutos a varias horas, con pausa y parada anticipada
> — Bloquea el sitio entero, o solo la parte que te atrapa: youtube.com/shorts
> queda cerrado y las clases siguen abiertas
> — Cada intento bloqueado se cuenta por sitio, y la página de bloqueo te dice
> el número a la cara
> — Una pantalla de resumen con tus sesiones, tus totales diarios y hacia dónde
> va el impulso
> — English, Português y Español, cambiable desde el popup
>
> Sin cuenta. Sin registro. Sin servidores, sin analítica, sin telemetría — la
> extensión no hace ninguna petición de red, y no pide permiso para leer las
> páginas que visitas. Tu lista y tus estadísticas se quedan en tu máquina.
>
> Libre y de código abierto: github.com/BernardoMrtns/lockin-chrome-extension
