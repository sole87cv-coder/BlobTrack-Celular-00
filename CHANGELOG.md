# Changelog

Este arquivo acompanha as alteracoes notaveis do BlobTrack Celular-00.

## [Unreleased]

### Melhorado
- Uniform locations WebGL agora sao cacheadas apos o link do programa, evitando consultas repetidas em cada frame.
- Envelope das zonas e atualizacao da interface reduzem trabalho/alocacao dentro do ciclo quente sem desacelerar rastreio ou audio.
- Tabs, efeitos e zonas receberam estados/rotulos ARIA sincronizados; erros de audio e WebGL mostram feedback breve.
- Listeners de interrupcao de audio sao registrados uma vez por contexto.
- Service worker avanca para v15 para atualizar clientes com os arquivos refinados.
- Estilos de espacamento padronizados e elevacao sutil aplicada a barra e ao indicador de estado.
- README documenta o tamanho estatico do shell, limites de benchmark e a regra de video dentro dos blobs.

### Documentado
- Adicionado `AUDITORIA.md` com inventario, dependencias, riscos estaticos, baseline e checklist de validacao manual.
