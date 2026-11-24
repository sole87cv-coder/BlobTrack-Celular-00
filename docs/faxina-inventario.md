# Inventário e decisão de organização

Inventário feito na branch `chore/organizacao`, em 24/11/2026. Foram encontrados 81 arquivos rastreados pelo Git e 17.478 arquivos no disco fora de `.git/` e `node_modules/`; a diferença está concentrada em caches e ferramentas locais do Android/Visual Studio.

## Classificação

| Caminho | Classe | Evidência de uso ou origem | Decisão |
|---|---|---|---|
| `src/**` (21 arquivos) | CORE | Import graph do app; cobre captura, detecção, áudio, renderização, interface e sessões. | Manter |
| `tests/**` (24 arquivos) | CORE | `node --test` descobre a suíte; baseline: 148 aprovados. | Manter |
| `android/app/src/**`, `android/*.gradle`, `android/build-apk.ps1`, `android/README.md` (12 arquivos rastreados) | CORE | Projeto Android, configuração Gradle, instruções e build do APK. | Manter |
| `scripts/bench-blobtrack.js` | CORE | Executa o benchmark reproduzível documentado neste diretório. | Manter |
| `docs/**` (4 arquivos rastreados antes deste inventário) | CORE | Documentação de benchmark e interface referenciada pelo projeto. | Manter |
| `index.html`, `sw.js`, `manifest.webmanifest`, `vercel.json`, `package.json`, `.gitignore`, `.vercelignore` | CORE | Entradas e configurações de execução, deploy, cache e testes. | Manter |
| `icons/**` (3 arquivos) | CORE | Ícones referenciados pelo manifesto e interface PWA. | Manter |
| `teste.html`, `teste.js`, `teste.css` | CORE | Página de diagnóstico referenciada pela documentação, pelo shell offline e pelo pacote Android. | Manter |
| `README.md`, `AUDITORIA.md`, `BUGS-CROP.md`, `CHANGELOG.md`, `RECORDING-PLAN.md` | CORE | Documentação de uso, decisões, auditoria e validação. | Manter |
| `dist/BlobTrack-Celular-00-debug.apk` | CORE | Artefato debug rastreado; documentado no README e nas instruções Android. | Manter |
| `.vs/**` (19 arquivos no inventário) | GERADO/CACHE | Estado local do Visual Studio; não aparece entre os arquivos rastreados. | Manter no disco; já ignorado |
| `android/.gradle/**` | GERADO/CACHE | Estado de execução/cache do Gradle; fora do índice Git e regenerável pelo Gradle. | Manter no disco; já ignorado |
| `android/.local-build/**` | GERADO/CACHE | Contém JDK 17, Android SDK 35, Gradle 8.9 e ferramentas/AVD locais. Recriar exige downloads e configuração. | Manter no disco; já ignorado |
| `android/app/build/**` | GERADO/CACHE | Saída intermediária do Gradle; fora do índice Git. | Manter no disco; já ignorado |
| `android/local.properties` | GERADO/CACHE | Caminho local do SDK, criado pelo script de build e ignorado pelo Git. | Manter no disco; já ignorado |
| Candidatos a arquivos de outro projeto, cópias, zips ou rascunhos soltos | ÓRFÃO CANDIDATO | Busca na raiz e nos arquivos do projeto não encontrou candidato identificável. Nomes como `teste.*` são referenciados e necessários. | Nenhum candidato; nada apagado |

## Verificações e limites

- `git ls-files`: 81 arquivos rastreados. Os arquivos rastreados estão nas categorias CORE acima.
- `rg` em fontes, HTML, configurações, documentação e testes confirmou referências a `teste.html`, `teste.js`, `teste.css`, ao núcleo do tracker e ao benchmark.
- A inspeção dos diretórios de primeiro nível não encontrou conteúdo de outro projeto. Os nomes encontrados dentro dos caches do SDK são recursos fornecidos pelas ferramentas Android, não cópias de outro projeto.
- Não houve arquivo de classe C para testar removendo, nem arquivo movido. A árvore de trabalho permaneceu na branch própria; os arquivos preexistentes de benchmark foram preservados previamente em um stash.
- A validação manual de HTTPS foi informada como concluída pelo usuário. Câmera, blobs, áudio, HUD, botão Fundo e acesso físico não foram revalidados neste inventário: **não verificado**.
- A estrutura de código já segue `src/`, `tests/`, `scripts/`, `docs/` e `android/`. Nenhum movimento é necessário; manter nomes e caminhos atuais reduz risco.
