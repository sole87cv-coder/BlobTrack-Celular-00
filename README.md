# BlobTrack Celular-00

Projeto independente, mobile-first, inspirado no conceito do Ctrl-v-0: o que acontece diante da câmera alimenta um único conjunto de envelopes compartilhado pelo palco visual e pelo motor de som.

## Abrir

O app usa câmera e áudio do navegador. Publique em HTTPS ou sirva em `localhost` (considerado contexto seguro pelos navegadores):

```powershell
python -m http.server 8000
```

No computador de desenvolvimento, abra `http://localhost:8000`. Para acessar pelo telefone, use a URL HTTPS de um túnel que encaminhe para essa porta. Para uso instalado, publique a pasta em um host HTTPS. A primeira carga guarda a casca no service worker para abrir offline; câmera e áudio continuam dependendo do navegador e da permissão local.

## O que já está montado

- Interface para celular, controles por toque, áreas seguras, abas no retrato e medição/controles em duas colunas na paisagem.
- Câmera frontal/traseira, solicitação de permissão ao tocar em **Ligar**, captura PNG, tela cheia quando disponível e tentativa de Wake Lock.
- WebGL2 com três efeitos; rastreio de movimento em resolução reduzida; seis zonas e cinco sinais com envelopes compartilhados.
- Áudio iniciado pelo gesto de **Ligar**, AudioWorklet e um AudioContext por aba; mute com rampa curta.
- PWA em tela cheia, orientação livre, ícone e cache offline da casca.
- BroadcastChannel para impedir que uma segunda aba inicie uma sessão de áudio.

## Limites atuais

Este é o primeiro esqueleto funcional da versão móvel. O rastreador mede mudança de luminância e atividade por seis áreas; ainda não identifica silhuetas ou blobs, e os retângulos manuais servem como overlay visual. Não há sensor de profundidade nem mapeamento de paralaxe. O app deixa como `—` métricas de áudio e latência que o navegador ainda não mede. O HUD mostra `—` antes de haver uma medição. O suporte a câmera, exposição, tela cheia e Wake Lock varia por navegador.

Nenhum código de Kinect, OpenFrameworks, driver de câmera de mesa ou sistema de build Windows foi trazido para este repositório.
