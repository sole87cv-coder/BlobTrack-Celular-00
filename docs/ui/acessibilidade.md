# Acessibilidade — decisões e validação

Documento em português; navegação nomeada com aria-current; sheet e diálogo de permissões usam dialog nativo com título/descrição; botões de estado expõem aria-pressed; ranges têm labels; câmera, conexão, som e gravação aparecem em texto e não dependem só de cor.

Tema Sistema/Escuro/Claro, high contrast/forced colors, reduzir movimento e háptico opt-in (desligado por padrão) estão disponíveis. Alvos principais têm ao menos 44px, preferencialmente 48px; safe areas consideram os quatro lados.

A suíte verifica IDs, atributos, relações ARIA, navegação, metadados, estados, tokens e shell offline. Testes estáticos não substituem medição de contraste em cada sobreposição nem leitor de tela real.

Pendências de hardware: TalkBack/VoiceOver, teclado físico, orientação, notch, zoom 200%, câmera negada/ocupada, gravação e saída de áudio. APK e recursos Android permaneceram intocados.