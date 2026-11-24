# Gravação no BlobTrack Celular

## Comportamento atual

- O gravador captura a composição visual do palco em vídeo, sem áudio. O som reativo continua funcionando na aplicação, mas não é incluído no arquivo.
- A duração máxima padrão é de cinco minutos. Limites de bytes e memória também podem encerrar antes a gravação, preservando o trecho capturado.
- A taxa de bits do vídeo vem do perfil do aparelho: leve 2 Mb/s, equilibrado 3 Mb/s e alto 4,5 Mb/s.
- Quando `navigator.storage.estimate()` existe, a aplicação exige pelo menos 100 MB de espaço estimado livre. Se o navegador não oferece a API, ou ela falha, a gravação continua disponível porque a estimativa não é confiável o bastante para bloquear a função.
- Ao deixar a página oculta, aguarda cinco segundos e pausa a gravação se ela ainda estiver em segundo plano. Ao retornar, retoma somente a pausa automática; uma pausa manual permanece pausada.
- Durante o salvamento, os controles evitam iniciar uma segunda exportação. Cancelar ou falhar mantém o resultado disponível para nova tentativa; concluir o compartilhamento, salvamento ou download libera a referência após 30 segundos.
- O arquivo usa o nome `BlobTrack_YYYY-MM-DD_HH-mm-ss.ext`. O gravador prefere WebM (VP9, VP8 e formato genérico) e usa MP4 quando disponível no navegador.
- Ao tentar sair ou recarregar com a gravação em andamento ou pausada, o navegador pode exibir uma confirmação. O suporte visual varia entre navegadores.

## Limites conhecidos

`MediaRecorder`, tipos MIME, diretório de download, armazenamento temporário e comportamento em segundo plano variam entre navegador e sistema. Os testes automatizados usam APIs simuladas. Câmeras, navegador móvel, interrupções reais, espaço de armazenamento e reprodução dos arquivos precisam ser verificados nos aparelhos da matriz em [`device-matrix.md`](device-matrix.md); esses resultados ainda não foram medidos neste ambiente.

## Manutenção

Se alterar MIME, duração, memória ou exportação, atualize `src/recorder.js`, os testes correspondentes em `tests/core.test.js` e a versão do shell em `sw.js` quando o código entregue à PWA mudar. Preserve o contrato de que o resultado parcial fica disponível após limites ou interrupções recuperáveis. Rode `npm test` e registre medições, sem atribuir ao rastreador custos de captura/exportação que não tenham sido medidos separadamente.
