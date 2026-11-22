# Interface e navegação — Os Corpos Compon o Som

## Mapa
A navegação principal tem quatro destinos: Palco, Sessão, Ajustes e Ajuda. O palco continua como tela inicial; a barra inferior respeita a área segura.

- Palco: visual ao vivo, estado, mudo e acesso ao sheet Ajustes rápidos.
- Sessão: gravação ativa/pausada, duração, encerrar e resultado atual para salvar/compartilhar.
- Ajustes: Câmera, Áudio, Visual, Gravação, Acessibilidade e Sobre. Os painéis existentes mantêm seus IDs e handlers.
- Ajuda: primeiros passos e orientação para câmera, áudio e gravação.

A navegação tem no máximo dois níveis. O sheet e o diálogo de permissões têm controles visíveis para abrir/fechar; gestos não são necessários.

## Estado
A chave local e IDs técnicos foram preservados. Tema, redução de movimento e háptico opt-in foram acrescentados à estrutura local existente. Pausa/retomada da gravação usa as operações existentes do gravador; não há pausa da sessão visual.

REC permanece visível com duração. Offline aparece como estado textual. Regiões vivas anunciam mudanças, nunca quadros do palco.