# Gravação no BlobTrack Celular

## Comportamento atual

- O gravador captura a composição visual do palco em vídeo, sem áudio. O som reativo continua funcionando na aplicação, mas não é incluído no arquivo.
- A duração máxima padrão é de cinco minutos. Limites de bytes e memória também podem encerrar antes a gravação, preservando o trecho capturado.
- A taxa de bits do vídeo vem do perfil do aparelho: leve 2 Mb/s, equilibrado 3 Mb/s e alto 4,5 Mb/s.
- Quando `navigator.storage.estimate()` existe, a aplicação exige pelo menos 100 MB de espaço estimado livre. Se o navegador não oferece a API, ou ela falha, a gravação continua disponível porque a estimativa não é confiável o bastante para bloquear a função.
- Ao deixar a página oculta, aguarda cinco segundos e pausa a gravação se ela ainda estiver em segundo plano. Ao retornar, retoma somente a pausa automática; uma pausa manual permanece pausada.
- Durante o salvamento, os controles evitam iniciar uma segunda exportação. Cancelar ou falhar mantém o resultado disponível para nova tentativa; concluir o compartilhamento, salvamento ou download libera a referência após 30 segundos.
- O arquivo usa o nome `BlobTrack_YYYY-MM-DD_HH-mm-ss.mp4`. Desde `4cdf5cc` o gravador aceita **somente MP4** (H.264 Baseline, Main, High ou MP4 genérico). Se o navegador não oferece nenhum desses tipos, o botão **Gravar vídeo** fica desabilitado e com o título "Gravação não suportada neste navegador.".
- Ao tentar sair ou recarregar com a gravação em andamento ou pausada, o navegador pode exibir uma confirmação. O suporte visual varia entre navegadores.

## Limites conhecidos

`MediaRecorder`, tipos MIME, diretório de download, armazenamento temporário e comportamento em segundo plano variam entre navegador e sistema. Os testes automatizados usam APIs simuladas. Câmeras, navegador móvel, interrupções reais, espaço de armazenamento e reprodução dos arquivos precisam ser verificados nos aparelhos da matriz em [`device-matrix.md`](device-matrix.md); esses resultados ainda não foram medidos neste ambiente.

## Pré-checagem no emulador (Pacote 3)

Em 25/11/2026, no AVD `BlobTrackEmulator` (Android 10, `sdk_gphone64_x86_64`) com Chrome 124 e `https://blobtrak.vercel.app/`, o botão **Gravar vídeo** apareceu desabilitado: `#recordButtonPanel` com `hidden=true`, `disabled=true` e título "Gravação não suportada neste navegador.". A sonda via CDP confirmou `MediaRecorder.isTypeSupported`:

| Tipo | Chrome 124 (emulador) |
|---|---|
| `video/webm;codecs=vp9` | sim |
| `video/webm;codecs=vp8` | sim |
| `video/webm` | sim |
| `video/mp4` e variantes H.264 | **não** |

Como `selectRecordingMimeType` em `src/recorder.js` só relaciona MP4, `recorder.isSupported()` retorna `false` e a interface desabilita o botão. Isso é consequência da decisão `4cdf5cc` (MP4-only), **não** um erro de console ou uma regressão da `v60`. Nenhum arquivo de áudio/vídeo foi gerado e nada foi exportado no emulador. Gravação de 30 segundos, salvamento, compartilhamento e reprodução em aparelho físico continuam **não medidos**. Questionado em 25/11/2026, o V1su4rt confirmou **manter MP4-only**: não houve mudança de runtime, não há cache `v61` e nenhuma publicação nova.

## Manutenção

Se alterar MIME, duração, memória ou exportação, atualize `src/recorder.js`, os testes correspondentes em `tests/core.test.js` e a versão do shell em `sw.js` quando o código entregue à PWA mudar. Preserve o contrato de que o resultado parcial fica disponível após limites ou interrupções recuperáveis. Rode `npm test` e registre medições, sem atribuir ao rastreador custos de captura/exportação que não tenham sido medidos separadamente.
