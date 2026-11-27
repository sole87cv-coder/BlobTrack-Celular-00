# Matriz de validação em aparelhos

Status deste ciclo: os itens da tabela abaixo ainda **não foram medidos em aparelhos físicos**. Testes automatizados não substituem esta verificação. Em 25/11/2026 foi executada uma pré-checagem funcional no emulador Android (detalhe a seguir); ela prova fluxo, não hardware, bateria, câmera real nem aparência final.

## Pré-checagem no emulador Android (25/11/2026)

Ambiente: AVD `BlobTrackEmulator`, Android 10, `sdk_gphone64_x86_64`, Chrome 124.0.0.0, viewport `160×284`, site publicado `https://blobtrak.vercel.app/` com cache `blobtrack-celular-00-v60`. Câmera e áudio concedidos ao Chrome via `adb shell pm grant`; CDP em `http://127.0.0.1:9222` via `adb forward tcp:9222 localabstract:chrome_devtools_remote`. APK debug `dist/BlobTrack-Celular-00-debug.apk` instalado (`com.blobtrack.celular00.debug`), mas a navegação funcional foi feita no Chrome.

| Item | Resultado no emulador | Limite do emulador |
|---|---|---|
| Câmera e WebGL | `Traseira principal`, `WebGL2 ativo`, quadro `160×284 · fps 20` | Câmera é virtual; não prova sensor, foco, luz ou cores reais |
| Três efeitos | `invert`, `threshold`, `dither` alternaram; janela de custo respondeu (`0,3 ms · 2 recortes` no threshold) | Não mede aparência final em tela física |
| Oito toggles e quatro abas | Todos ligaram/desligaram e voltaram ao estado original; abas trocaram de painel | — |
| Mudo e áudio | `#stageMuteButton` alternou `aria-pressed` | Áudio é sintético; não mede saída real nem latência |
| ROI / Retângulo | `#rectangleButton` com `aria-pressed=true`; ajuda por teclado presente | Não houve arrasto real com dedo nem validação de região em tela física |
| Blobs | Após **Reaprender fundo**: `0 → 1 → 2` blobs; energia `5%`, densidade `26%` | Fundo é estático; não prova rastreio de objeto real |
| Segundo plano | Home por ~6 s e retorno na mesma aba: sessão preservada (`Traseira principal`, palco visível, `fps ~18,7`, 2 blobs) | Não houve interrupção de chamada, bloqueio de tela real ou corte de energia |
| Rotação | Paisagem `160×90 · fps 19`, sessão preservada; rotação revertida ao final | Orientação forçada por `settings put system user_rotation` |
| Service worker / offline | Recarga sem rede reconstruiu a tela; `navigator.serviceWorker.controller` em `https://blobtrak.vercel.app/sw.js` | Não mede persistência em armazenamento real nem PWA instalada |
| Gravação | **Indisponível**: botão desabilitado, `title="Gravação não suportada neste navegador."` | Chrome 124 só oferece WebM; o gravador da `v60` aceita só MP4 (decisão `4cdf5cc`). Ver [`gravacao.md`](gravacao.md) |
| Console e rede | `consoleErrors []`, `failedRequests []` em todas as rotinas | — |
| Estabilidade 5 min | 30 amostras em 300,4 s: FPS p50 `19,7` / p95 `20,0` / mín `17,8`; `tAnalysis` p50 `16,28 ms` / p95 `20,44 ms` / pico `21,63 ms`; `tRender` p50 `0,80 ms` / p95 `1,04 ms` / pico `1,12 ms`; blobs `0–2`; quadros `160×284` a `15–21 fps`; `consoleErrors []` | Emulador x86 com câmera virtual: FPS e tempos **não** representam aparelho |

O soak acima é pré-checagem de estabilidade, não medição de celular: a queda para `15–16 fps` e o `tAnalysis` de ~`16–21 ms` ocorreram no x86 com câmera sintética. Não atribuir esses números a hardware real nem usá-los como baseline de regressão. Detalhe em [`perf-antes-depois.md`](perf-antes-depois.md).

A sessão é encerrada ao abrir uma **segunda aba** do app ("BlobTrack Celular-00 já está aberto em outra aba"); isso é o controle de aba única funcionando, não um defeito. Não confundir com o teste de segundo plano, que manteve a sessão ao sair e voltar na **mesma** aba.

## Matriz em aparelho físico (pendente)

| Plataforma / cenário | Verificação | Estado |
|---|---|---|
| Realme C67 (`RMX3890`), Android 15 + Realme UI, Chrome, 8 GB RAM, Snapdragon 685 octa-core | Relato do dono: app **muito pesado**, trava com todos os efeitos e trava ao gravar/salvar, sobretudo ao salvar | **Declarado, não medido por instrumento** — sem FPS, `tAnalysis`, `tRender`, RAM ou tempo de exportação registrados |
| Android intermediário/baixo | FPS e tempo de análise/render durante 5 minutos | Não medido |
| Android recente | FPS e estabilidade do palco durante 5 minutos | Não medido |
| iPhone mais antigo | Compatibilidade da câmera, composição e exportação | Não medido |
| iPhone recente | Compatibilidade da câmera, composição e exportação | Não medido |
| Android e iPhone | Câmera frontal/traseira, rotação e retorno do segundo plano | Não medido |
| Android e iPhone | ROI manual e blobs próximos/longe na rede geométrica | Não medido |
| Android e iPhone | ID persistente em cruzamento e absorção de alvo parado | Não medido |
| Navegadores móveis disponíveis | Gravação de 30 segundos por perfil, salvar/compartilhar e reproduzir o arquivo | Não medido |
| Navegadores móveis disponíveis | Ocultar a página por mais de cinco segundos, retomar e tentar sair durante gravação | Não medido |
| Android e iPhone | Composição de janela viva e efeitos; mensagem de pausa por desempenho | Não medido |

Sobre o Realme C67: com 8 núcleos e 8 GB declarados, `src/core/deviceProfile.js:8-10` tende ao perfil `equilibrado` ou `alto` — `startWidth` `320–480`, `captureWidth` `960`, alvo de `24–30 fps`, bitrate `3–4,5 Mbps` e `pixelRatio` `1,5–2` (limitado a `1,5` em `src/app.js:476`). É **inferência de código**, não medição: `navigator.deviceMemory` pode reportar outro valor no Chrome Android. O contraste com o emulador (`perfil leve`, `20 fps`, `captureWidth` `640`, quadro `160×284`) explica por que os números do x86 não podem ser usados como baseline do aparelho do V1su4rt.

Ao preencher esta matriz, registre aparelho, sistema, navegador e versão, perfil de qualidade, resolução, valor de FPS/`tAnalysis`/`tRender`, duração e comportamento observado. Preserve uma gravação curta de referência somente quando houver autorização e espaço disponível. Não misture tempo de exportação ao tempo de análise do rastreador.
