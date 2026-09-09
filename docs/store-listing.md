# Chrome Web Store listing

Everything the dashboard asks for, ready to paste. The extension's **name** and
**short description** are not here: the store reads those from `manifest.json`
and `_locales/`, so it localizes them on its own.

Before submitting, the two URLs below have to resolve — they point at `main`,
so `rewrite-v1` must be merged first.

| Field | Value |
| --- | --- |
| Category | Productivity |
| Language | English (add Portuguese (Brazil) and Spanish as extra listings) |
| Homepage URL | comes from `homepage_url` in the manifest |
| Support URL | `https://github.com/BernardoMrtns/lockin-chrome-extension/issues` |
| Privacy policy URL | `https://github.com/BernardoMrtns/lockin-chrome-extension/blob/main/PRIVACY.md` |
| Mature content | No |
| Screenshots | `store/lock-in-idle.png`, `-running.png`, `-blocked.png`, `-summary.png`, in that order |

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

`alarms` needs no justification form, but if asked:

> Ends the focus session at the scheduled time even when the service worker has
> been unloaded by the browser in the meantime.

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
