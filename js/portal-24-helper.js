// ============================================================
// HELPER "?" — COMO FAZER (tour guiado na própria tela) — 2026-10-16
// ============================================================
// Pedido do Matt: "quero criar um helper em IA SERVICE, botão novo '?', uma
// IA que mostre na própria tela como fazer o que foi solicitado. Ex.: como
// acrescentar uma prateleira interna?" — fases 1 e 2 (a fase 3, "faça pra
// mim", é o botão IA · Editar que já existe).
//
// COMO FUNCIONA
//   1. Botão "?" (#po-proj-helper-btn, 1º do grupo IA Services) abre a
//      janelinha "Como fazer?" com busca.
//   2. A busca é LOCAL e instantânea: casa o texto digitado (pt/en/es, sem
//      acento, plural ≈ singular) com HELPER_PERGUNTAS (137 perguntas de
//      iniciante, mesmo conteúdo de docs/helper-perguntas.xlsx).
//   3. Clicar numa pergunta roda o TOUR dela: a tela escurece, o botão certo
//      fica aceso e um balão explica. Quando o passo espera uma ação ("clique
//      em Customizar"), o tour avança SOZINHO quando a pessoa faz — ninguém
//      clica por ela. "Pular"/"Voltar"/Esc sempre disponíveis.
//   4. FASE 2 — "✨ Perguntar à IA": manda a pergunta + catálogo + lista dos
//      botões que existem na tela pra função generate-project-from-photo
//      (stage 'help', Gemini Flash). A IA devolve qual pergunta do catálogo é
//      (aí roda o tour pronto) OU monta passos novos apontando SÓ pra ids de
//      botões que existem (sanitizado no servidor e aqui).
//
// ONDE MEXER
//   - Pergunta nova → HELPER_PERGUNTAS (id, cat, tour, alvo, artigo, pt/en/es,
//     kw). Sem roteiro próprio em HELPER_TOURS, vira tour de 1 passo no
//     `alvo` (+ botão "Ler artigo" se tiver `artigo` da Central de Ajuda).
//   - Roteiro detalhado → HELPER_TOURS[tour] = [passos]. Passo:
//       el:      seletor CSS (1º VISÍVEL que casar) ou função () => elemento
//       fallback: seletor usado se `el` não aparecer
//       text:    T(pt, en, es)
//       wait:    'click' (avança quando clicam no destacado) | seletor (avança
//                quando ele fica visível) | função(passo) => true
//       skipIf:  função => true pula o passo (ex.: já está selecionado)
//       onEnter: função(passo) ao entrar (guardar estado inicial)
//   - Textos fixos da janela/balão → i18n.js, chaves helper.*.
//
// Só DOM + leitura de estado (projectSlots, projectBuilderSelId): não muda
// projeto, preço nem 3D.
// ============================================================

(function () {
  'use strict';

  const T = (pt, en, es) => ({ pt, en, es });
  const $ = (s) => { try { return document.querySelector(s); } catch (e) { return null; } };
  const lang = () => ((typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'pt');
  const t = (k, v) => ((typeof I18n !== 'undefined' && I18n.t) ? I18n.t(k, v) : k);
  const tx = (o) => (!o ? '' : (typeof o === 'string' ? o : (o[lang()] || o.pt || '')));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // ==========================================================================
  // CATÁLOGO — 137 perguntas (fonte: docs/helper-perguntas.xlsx)
  // ==========================================================================
  const HELPER_PERGUNTAS = [
  {"id": "projeto-novo", "cat": "projeto", "tour": "projeto-novo", "alvo": null, "artigo": "criar-projeto-paredes", "pt": "Como começo um projeto novo?", "en": "How do I start a new project?", "es": "¿Cómo empiezo un proyecto nuevo?", "kw": "novo projeto começar iniciar ambiente new project start nuevo proyecto empezar"},
  {"id": "projeto-salvar", "cat": "projeto", "tour": "projeto-salvar", "alvo": "#po-proj-toolbar-save-btn", "artigo": "salvar-proposta-enviar", "pt": "Como salvo meu projeto?", "en": "How do I save my project?", "es": "¿Cómo guardo mi proyecto?", "kw": "salvar gravar guardar save store guardar"},
  {"id": "projeto-abrir", "cat": "projeto", "tour": "projeto-abrir", "alvo": "#po-proj-fav-list", "artigo": null, "pt": "Como abro um projeto que já salvei?", "en": "How do I open a saved project?", "es": "¿Cómo abro un proyecto guardado?", "kw": "abrir carregar meus projetos salvo open load my projects abrir cargar"},
  {"id": "projeto-copia", "cat": "projeto", "tour": "projeto-salvar-como", "alvo": "#po-proj-save-fav-btn", "artigo": null, "pt": "Como salvo uma cópia do projeto com outro nome?", "en": "How do I save a copy of the project?", "es": "¿Cómo guardo una copia del proyecto?", "kw": "copia duplicar projeto salvar como versao save as copy duplicate version copia"},
  {"id": "projeto-limpar", "cat": "projeto", "tour": "projeto-limpar", "alvo": "#po-proj-reset-btn", "artigo": null, "pt": "Como apago tudo e começo do zero?", "en": "How do I clear everything and start over?", "es": "¿Cómo borro todo y empiezo de cero?", "kw": "limpar resetar zerar recomeçar reset clear start over limpiar"},
  {"id": "projeto-cliente", "cat": "projeto", "tour": "projeto-dados-cliente", "alvo": "#po-proj-client-btn", "artigo": null, "pt": "Onde coloco os dados do cliente?", "en": "Where do I enter the client's info?", "es": "¿Dónde pongo los datos del cliente?", "kw": "cliente nome telefone endereco email client customer info datos cliente"},
  {"id": "projeto-importar-codigo", "cat": "projeto", "tour": "projeto-importar-codigo", "alvo": "#po-proj-import-code", "artigo": null, "pt": "Como abro um projeto que alguém me mandou por código?", "en": "How do I import a project from a code?", "es": "¿Cómo importo un proyecto con un código?", "kw": "codigo importar compartilhado recebido import code shared codigo"},
  {"id": "conta-unidade", "cat": "projeto", "tour": "conta-unidade", "alvo": "#po-unit-select", "artigo": "conta-idioma-unidade", "pt": "Como troco de polegadas para milímetros?", "en": "How do I switch between inches and millimeters?", "es": "¿Cómo cambio de pulgadas a milímetros?", "kw": "unidade polegada mm milimetro inch metric unidad pulgada"},
  {"id": "conta-idioma", "cat": "projeto", "tour": "conta-unidade", "alvo": "#po-lang-switcher", "artigo": "conta-idioma-unidade", "pt": "Como troco o idioma do portal?", "en": "How do I change the language?", "es": "¿Cómo cambio el idioma?", "kw": "idioma lingua ingles espanhol portugues language english spanish idioma"},
  {"id": "parede-construir", "cat": "paredes", "tour": "paredes-desenhar", "alvo": "#po-proj-wall-editor-btn", "artigo": "paredes-btn", "pt": "Como construo as paredes?", "en": "How do I build the walls?", "es": "¿Cómo construyo las paredes?", "kw": "parede desenhar planta baixa criar wall draw floor plan pared dibujar"},
  {"id": "parede-formato", "cat": "paredes", "tour": "paredes-formato", "alvo": "#po-proj-wall-editor-btn", "artigo": "criar-projeto-paredes", "pt": "Como faço um ambiente em L ou em U?", "en": "How do I make an L-shaped or U-shaped room?", "es": "¿Cómo hago un ambiente en L o en U?", "kw": "L U reta formato duas paredes shape l-shaped u-shaped forma"},
  {"id": "parede-largura", "cat": "paredes", "tour": "paredes-medida", "alvo": "#po-proj-wall-editor-btn", "artigo": "criar-projeto-paredes", "pt": "Como mudo a largura de uma parede?", "en": "How do I change a wall's width?", "es": "¿Cómo cambio el ancho de una pared?", "kw": "largura comprimento medida parede width length wall ancho largo"},
  {"id": "parede-pe-direito", "cat": "paredes", "tour": "paredes-altura", "alvo": "#po-proj-wall-editor-btn", "artigo": "criar-projeto-paredes", "pt": "Como mudo a altura do teto (pé-direito)?", "en": "How do I change the ceiling height?", "es": "¿Cómo cambio la altura del techo?", "kw": "pe direito teto altura ceiling height techo altura"},
  {"id": "parede-trocar", "cat": "paredes", "tour": "paredes-abas", "alvo": "#po-proj-canvas-3d-edit-wrap", "artigo": null, "pt": "Como passo de uma parede para outra?", "en": "How do I switch between walls?", "es": "¿Cómo paso de una pared a otra?", "kw": "trocar parede aba proxima wall tab switch next cambiar pared"},
  {"id": "parede-importar-desenho", "cat": "paredes", "tour": "paredes-ia", "alvo": "#po-proj-ai-walls-btn", "artigo": null, "pt": "Como importo as paredes de um desenho ou planta?", "en": "How do I import walls from a drawing or floor plan?", "es": "¿Cómo importo las paredes de un dibujo o plano?", "kw": "importar desenho planta pdf foto ia paredes import drawing floor plan ai walls plano"},
  {"id": "parede-janela-porta", "cat": "paredes", "tour": "paredes-aberturas", "alvo": "#po-proj-wall-editor-btn", "artigo": null, "pt": "Como coloco uma janela ou porta na parede?", "en": "How do I add a window or door to the wall?", "es": "¿Cómo pongo una ventana o puerta en la pared?", "kw": "janela porta abertura vao parede window door opening ventana puerta"},
  {"id": "parede-tomada", "cat": "paredes", "tour": "paredes-estruturas", "alvo": "#po-proj-structures-btn", "artigo": null, "pt": "Como marco tomadas, interruptores e canos na parede?", "en": "How do I mark outlets, switches and pipes on the wall?", "es": "¿Cómo marco enchufes, interruptores y tuberías?", "kw": "tomada interruptor cano exaustao ventilacao estrutura outlet switch pipe vent enchufe"},
  {"id": "parede-rebaixar", "cat": "paredes", "tour": "paredes-rebaixar", "alvo": "#po-proj-wall-cutaway-btn", "artigo": null, "pt": "A parede está na frente e não consigo clicar no móvel. Como escondo ela?", "en": "A wall is in front and I can't click the cabinet. How do I hide it?", "es": "La pared está delante y no puedo hacer clic en el mueble. ¿Cómo la oculto?", "kw": "rebaixar parede esconder ocultar frente tampando atras clicar cutaway lower hide wall in front behind rebajar ocultar pared"},
  {"id": "parede-apagar", "cat": "paredes", "tour": "paredes-desenhar", "alvo": "#po-proj-wall-editor-btn", "artigo": null, "pt": "Como apago uma parede?", "en": "How do I delete a wall?", "es": "¿Cómo borro una pared?", "kw": "apagar deletar remover parede delete remove wall borrar"},
  {"id": "parede-angulo", "cat": "paredes", "tour": "paredes-desenhar", "alvo": "#po-proj-wall-editor-btn", "artigo": null, "pt": "Como faço uma parede em ângulo (não 90°)?", "en": "How do I make an angled wall?", "es": "¿Cómo hago una pared en ángulo?", "kw": "angulo diagonal inclinada 45 parede angle angled wall angulo"},
  {"id": "importar-2020", "cat": "paredes", "tour": "importar-2020", "alvo": "#po-proj-import2020-open-btn", "artigo": null, "pt": "Como importo um projeto do 2020?", "en": "How do I import a 2020 project?", "es": "¿Cómo importo un proyecto de 2020?", "kw": "2020 importar design import"},
  {"id": "importar-promob", "cat": "paredes", "tour": "importar-promob", "alvo": "#po-proj-importpromob-open-btn", "artigo": null, "pt": "Como importo um projeto do Promob?", "en": "How do I import a Promob project?", "es": "¿Cómo importo un proyecto de Promob?", "kw": "promob importar import"},
  {"id": "projeto-foto", "cat": "paredes", "tour": "projeto-foto", "alvo": "#po-proj-photo-open-btn", "artigo": null, "pt": "Como crio o projeto a partir de uma foto?", "en": "How do I create a project from a photo?", "es": "¿Cómo creo el proyecto desde una foto?", "kw": "foto imagem projeto ia photo picture image foto"},
  {"id": "projeto-pdf", "cat": "paredes", "tour": "projeto-pdf", "alvo": "#po-proj-pdf-open-btn", "artigo": null, "pt": "Como crio o projeto a partir de um PDF?", "en": "How do I create a project from a PDF?", "es": "¿Cómo creo el proyecto desde un PDF?", "kw": "pdf prancha projeto arquiteto ia pdf plans architect"},
  {"id": "importar-opcoes", "cat": "importar", "tour": "importar-menu", "alvo": "#po-proj-tb-ia", "artigo": null, "pt": "De onde eu consigo importar um projeto?", "en": "Where can I import a project from?", "es": "¿Desde dónde puedo importar un proyecto?", "kw": "importar opcoes 2020 promob pdf foto codigo import options importar"},
  {"id": "importar-2020-arquivo", "cat": "importar", "tour": "importar-2020", "alvo": "#po-proj-import2020-pdf-btn", "artigo": null, "pt": "Que arquivo do 2020 eu uso pra importar?", "en": "Which 2020 file do I use to import?", "es": "¿Qué archivo de 2020 uso para importar?", "kw": "2020 item list relatorio pdf arquivo report file archivo"},
  {"id": "importar-2020-texto", "cat": "importar", "tour": "importar-2020", "alvo": "#po-proj-import2020-manual-link", "artigo": null, "pt": "Posso colar a lista do 2020 em vez de anexar o PDF?", "en": "Can I paste the 2020 list instead of attaching the PDF?", "es": "¿Puedo pegar la lista de 2020 en vez del PDF?", "kw": "2020 colar texto manual paste text pegar"},
  {"id": "importar-2020-posicao", "cat": "importar", "tour": "importar-2020", "alvo": null, "artigo": null, "pt": "Por que os módulos do 2020 entram em fila numa parede só?", "en": "Why do 2020 cabinets come in lined up on one wall?", "es": "¿Por qué los módulos de 2020 entran en fila?", "kw": "2020 fila posicao uma parede organizar lined up position fila"},
  {"id": "importar-revisar", "cat": "importar", "tour": "importar-2020", "alvo": "#po-proj-import2020-review", "artigo": null, "pt": "O que acontece com códigos que não existem no catálogo?", "en": "What happens to codes not found in the catalog?", "es": "¿Qué pasa con códigos que no existen en el catálogo?", "kw": "codigo nao encontrado revisar casar catalogo not found review codigo"},
  {"id": "importar-promob-arquivo", "cat": "importar", "tour": "importar-promob", "alvo": "#po-proj-importpromob-file-btn", "artigo": null, "pt": "Que arquivo do Promob eu uso pra importar?", "en": "Which Promob file do I use to import?", "es": "¿Qué archivo de Promob uso?", "kw": "promob arquivo .promob extensao file archivo"},
  {"id": "importar-promob-paredes", "cat": "importar", "tour": "importar-promob", "alvo": "#po-proj-importpromob-review", "artigo": null, "pt": "O Promob traz as paredes e a posição dos módulos?", "en": "Does Promob import bring the walls and positions?", "es": "¿Promob trae las paredes y posiciones?", "kw": "promob paredes posicao giro cena walls positions paredes"},
  {"id": "importar-pdf-referencias", "cat": "importar", "tour": "referencias", "alvo": "#po-proj-ref-grid", "artigo": null, "pt": "As imagens do PDF original ficam salvas no projeto?", "en": "Are the original PDF images kept in the project?", "es": "¿Las imágenes del PDF original quedan en el proyecto?", "kw": "pdf imagens originais pranchas referencia guardar images references"},
  {"id": "importar-ajustar", "cat": "importar", "tour": "modulo-mover", "alvo": "#po-proj-canvas", "artigo": null, "pt": "Importei, e agora? Como ajusto o que veio errado?", "en": "I imported — how do I fix what came in wrong?", "es": "Importé, ¿cómo ajusto lo que vino mal?", "kw": "depois importar ajustar corrigir errado fix after import ajustar"},
  {"id": "modulo-inserir", "cat": "modulos", "tour": "modulo-arrastar", "alvo": "#po-proj-library-search-btn", "artigo": "inserir-mover-modulos", "pt": "Como coloco um módulo na parede?", "en": "How do I place a cabinet on the wall?", "es": "¿Cómo pongo un módulo en la pared?", "kw": "inserir colocar adicionar modulo armario arrastar biblioteca add place cabinet drag modulo mueble"},
  {"id": "modulo-procurar", "cat": "modulos", "tour": "modulo-procurar", "alvo": "#po-proj-library-search-btn", "artigo": "buscar-modulo-projeto", "pt": "Como procuro um módulo específico?", "en": "How do I search for a specific cabinet?", "es": "¿Cómo busco un módulo específico?", "kw": "procurar buscar pesquisar search find buscar"},
  {"id": "modulo-filtrar", "cat": "modulos", "tour": "modulo-procurar", "alvo": "#po-proj-library-search-btn", "artigo": "buscar-modulo-projeto", "pt": "Como filtro só os módulos de base ou aéreos?", "en": "How do I filter base or wall cabinets?", "es": "¿Cómo filtro módulos base o aéreos?", "kw": "filtro familia categoria base aereo filter family category filtro"},
  {"id": "modulo-sku", "cat": "modulos", "tour": "modulo-sku", "alvo": "#po-proj-library-search-btn", "artigo": "sku-referencia-rapida", "pt": "Como insiro um módulo pela referência (SKU)?", "en": "How do I insert a cabinet by SKU?", "es": "¿Cómo inserto un módulo por referencia (SKU)?", "kw": "sku referencia codigo medida pronta reference code"},
  {"id": "modulo-mover", "cat": "modulos", "tour": "modulo-mover", "alvo": "#po-proj-canvas-3d-edit-wrap", "artigo": "inserir-mover-modulos", "pt": "Como movo um módulo de lugar?", "en": "How do I move a cabinet?", "es": "¿Cómo muevo un módulo?", "kw": "mover arrastar posicao lugar move drag position mover"},
  {"id": "modulo-posicao-exata", "cat": "modulos", "tour": "modulo-posicao", "alvo": null, "artigo": "posicao-no-ambiente", "pt": "Como coloco o módulo numa posição exata (distância da parede)?", "en": "How do I set an exact position for a cabinet?", "es": "¿Cómo pongo el módulo en una posición exacta?", "kw": "posicao exata distancia x y altura do chao exact position distance posicion"},
  {"id": "modulo-girar", "cat": "modulos", "tour": "modulo-girar", "alvo": null, "artigo": "ilha-modulos-soltos", "pt": "Como giro um módulo?", "en": "How do I rotate a cabinet?", "es": "¿Cómo giro un módulo?", "kw": "girar rotacionar virar rotate turn girar"},
  {"id": "modulo-esticar", "cat": "modulos", "tour": "modulo-setas", "alvo": null, "artigo": null, "pt": "Como estico o módulo até encostar na parede ou no vizinho?", "en": "How do I stretch a cabinet to fill the gap?", "es": "¿Cómo estiro el módulo hasta tocar la pared?", "kw": "esticar encostar preencher vao completar stretch fill gap estirar"},
  {"id": "modulo-medida", "cat": "modulos", "tour": "modulo-medida", "alvo": "#po-proj-config-panel", "artigo": "medidas-cores-preco", "pt": "Como mudo a largura, altura ou profundidade de um módulo?", "en": "How do I change a cabinet's width, height or depth?", "es": "¿Cómo cambio el ancho, alto o fondo de un módulo?", "kw": "medida largura altura profundidade tamanho size width height depth medida"},
  {"id": "modulo-setas", "cat": "modulos", "tour": "modulo-setas", "alvo": null, "artigo": null, "pt": "Como redimensiono o módulo pelas setas?", "en": "How do I resize with the arrows?", "es": "¿Cómo redimensiono con las flechas?", "kw": "setas redimensionar puxar arrows resize handles flechas"},
  {"id": "modulo-ilha", "cat": "modulos", "tour": "modulo-ilha", "alvo": null, "artigo": "ilha-modulos-soltos", "pt": "Como faço uma ilha ou um módulo solto no meio do ambiente?", "en": "How do I make an island or freestanding cabinet?", "es": "¿Cómo hago una isla o un módulo suelto?", "kw": "ilha solto meio piso island freestanding isla"},
  {"id": "modulo-aereo-altura", "cat": "modulos", "tour": "modulo-posicao", "alvo": null, "artigo": "posicao-no-ambiente", "pt": "Como mudo a altura do aéreo em relação ao chão?", "en": "How do I change the wall cabinet's height from the floor?", "es": "¿Cómo cambio la altura del aéreo desde el piso?", "kw": "aereo altura chao elevar subir wall cabinet height floor aereo"},
  {"id": "modulo-duplicar", "cat": "modulos", "tour": "modulo-duplicar", "alvo": "#po-proj-slot-duplicate-btn", "artigo": "acoes-do-modulo-selecionado", "pt": "Como duplico um módulo?", "en": "How do I duplicate a cabinet?", "es": "¿Cómo duplico un módulo?", "kw": "duplicar copiar repetir clonar duplicate copy duplicar"},
  {"id": "modulo-substituir", "cat": "modulos", "tour": "modulo-substituir", "alvo": "#po-proj-slot-replace-btn", "artigo": "acoes-do-modulo-selecionado", "pt": "Como troco um módulo por outro sem apagar?", "en": "How do I replace a cabinet with another?", "es": "¿Cómo reemplazo un módulo por otro?", "kw": "substituir trocar modulo replace swap reemplazar"},
  {"id": "modulo-remover", "cat": "modulos", "tour": "modulo-remover", "alvo": "#po-proj-slot-remove-btn", "artigo": "acoes-do-modulo-selecionado", "pt": "Como apago um módulo?", "en": "How do I delete a cabinet?", "es": "¿Cómo borro un módulo?", "kw": "apagar deletar remover excluir modulo delete remove borrar"},
  {"id": "modulo-selecionar-varios", "cat": "modulos", "tour": "modulo-grupo", "alvo": "#po-proj-canvas-3d-edit-wrap", "artigo": null, "pt": "Como seleciono vários módulos de uma vez?", "en": "How do I select several cabinets at once?", "es": "¿Cómo selecciono varios módulos?", "kw": "selecionar varios grupo multiplos select multiple group seleccionar"},
  {"id": "modulo-colisao", "cat": "modulos", "tour": "modulo-colisao", "alvo": "#po-proj-collision-btn", "artigo": "encaixe-colisao", "pt": "Como evito que um módulo fique em cima do outro?", "en": "How do I stop cabinets from overlapping?", "es": "¿Cómo evito que los módulos se superpongan?", "kw": "colisao sobrepor encaixe overlap collision snap colision"},
  {"id": "modulo-canto", "cat": "modulos", "tour": "modulo-canto", "alvo": "#po-proj-library-search-btn", "artigo": null, "pt": "Como monto o canto entre duas paredes?", "en": "How do I build the corner between two walls?", "es": "¿Cómo armo la esquina entre dos paredes?", "kw": "canto 90 45 esquina corner"},
  {"id": "modulo-customizado", "cat": "modulos", "tour": "modulo-novo", "alvo": "#po-proj-new-module-btn", "artigo": null, "pt": "Como insiro um módulo customizado (medida livre)?", "en": "How do I add a custom cabinet?", "es": "¿Cómo inserto un módulo personalizado?", "kw": "customizado personalizado sob medida novo modulo custom new cabinet personalizado"},
  {"id": "modulo-ima-canto", "cat": "modulos", "tour": "modulo-ima-canto", "alvo": "#po-proj-canvas-3d-edit-wrap", "artigo": null, "pt": "Como alinho um módulo com o vizinho da outra parede no canto?", "en": "How do I line up a cabinet with the one on the other wall at the corner?", "es": "¿Cómo alineo un módulo con el vecino de la otra pared en la esquina?", "kw": "canto alinhar ima encostar outra parede vizinho esquina corner align snap magnet other wall esquina alinear iman"},
  {"id": "modulo-canto-cego", "cat": "modulos", "tour": "modulo-canto-cego", "alvo": "#po-proj-library-search-btn", "artigo": null, "pt": "Como monto um canto cego (blind corner) na cozinha?", "en": "How do I build a blind corner in the kitchen?", "es": "¿Cómo armo una esquina ciega (blind corner) en la cocina?", "kw": "canto cego blind corner painel fixo cozinha new classic esquina ciega cocina panel fijo"},
  {"id": "projeto-ia-gerar", "cat": "modulos", "tour": "projeto-ia", "alvo": "#po-proj-ai-open-btn", "artigo": null, "pt": "Como a IA monta o projeto pra mim?", "en": "How do I let AI generate the project?", "es": "¿Cómo genero el proyecto con IA?", "kw": "ia gerar automatico inteligencia ai generate automatic ia"},
  {"id": "construtor-usar", "cat": "construtor", "tour": "construtor-abrir", "alvo": "#po-proj-slot-customize-btn", "artigo": "construtor-basico", "pt": "Como uso o construtor?", "en": "How do I use the builder?", "es": "¿Cómo uso el constructor?", "kw": "construtor usar montar personalizar interno internos funciona builder use customize constructor usar"},
  {"id": "construtor-portas", "cat": "construtor", "tour": "construtor-portas", "alvo": "#po-proj-slot-customize-btn", "artigo": "portas-gavetas-construtor", "pt": "Como coloco portas num módulo?", "en": "How do I add doors to a cabinet?", "es": "¿Cómo pongo puertas en un módulo?", "kw": "porta portas inserir door doors puerta"},
  {"id": "construtor-gavetas", "cat": "construtor", "tour": "construtor-gavetas", "alvo": "#po-proj-slot-customize-btn", "artigo": "portas-gavetas-construtor", "pt": "Como coloco gavetas num módulo?", "en": "How do I add drawers to a cabinet?", "es": "¿Cómo pongo cajones en un módulo?", "kw": "gaveta gavetas inserir drawer cajon"},
  {"id": "construtor-prateleira", "cat": "construtor", "tour": "construtor-prateleira", "alvo": "#po-proj-slot-customize-btn", "artigo": "construtor-basico", "pt": "Como acrescento uma prateleira interna?", "en": "How do I add an inner shelf?", "es": "¿Cómo agrego un estante interno?", "kw": "prateleira interna fixa shelf inner estante repisa"},
  {"id": "construtor-prateleira-regulavel", "cat": "construtor", "tour": "construtor-prateleira-regulavel", "alvo": "#po-proj-slot-customize-btn", "artigo": null, "pt": "Como coloco prateleira regulável no móvel?", "en": "How do I add adjustable shelves?", "es": "¿Cómo pongo estantes regulables?", "kw": "prateleira regulavel pino suporte furos adjustable shelf pins regulable"},
  {"id": "construtor-divisoria", "cat": "construtor", "tour": "construtor-divisoria", "alvo": "#po-proj-slot-customize-btn", "artigo": "construtor-basico", "pt": "Como divido o módulo com uma divisória vertical?", "en": "How do I add a vertical divider?", "es": "¿Cómo divido el módulo con una división vertical?", "kw": "divisoria vertical dividir vao divider partition division"},
  {"id": "construtor-vaos-iguais", "cat": "construtor", "tour": "construtor-divisoria", "alvo": "#po-proj-slot-customize-btn", "artigo": "construtor-basico", "pt": "Como divido o vão em partes iguais?", "en": "How do I split a space into equal parts?", "es": "¿Cómo divido el hueco en partes iguales?", "kw": "partes iguais dividir vao igual equal split even partes iguales"},
  {"id": "construtor-cabideiro", "cat": "construtor", "tour": "construtor-cabideiro", "alvo": "#po-proj-slot-customize-btn", "artigo": null, "pt": "Como coloco um cabideiro (barra de pendurar)?", "en": "How do I add a closet rod?", "es": "¿Cómo pongo un barral para colgar?", "kw": "cabide cabideiro barra pendurar closet rod hanger barral"},
  {"id": "construtor-acessorios", "cat": "construtor", "tour": "construtor-acessorios", "alvo": "#po-proj-slot-customize-btn", "artigo": null, "pt": "Como coloco cestos e acessórios internos?", "en": "How do I add baskets and accessories?", "es": "¿Cómo pongo cestos y accesorios?", "kw": "cesto acessorio aramado basket accessory pull out cesto"},
  {"id": "construtor-trocar-porta", "cat": "construtor", "tour": "construtor-trocar-porta", "alvo": "#po-proj-slot-customize-btn", "artigo": "portas-gavetas-construtor", "pt": "Como troco o modelo da porta?", "en": "How do I change the door style?", "es": "¿Cómo cambio el modelo de puerta?", "kw": "trocar porta modelo shaker lisa estilo door style model cambiar puerta"},
  {"id": "construtor-trocar-gaveta", "cat": "construtor", "tour": "construtor-trocar-gaveta", "alvo": "#po-proj-slot-customize-btn", "artigo": null, "pt": "Como troco o tipo de gaveta (ex.: dovetail)?", "en": "How do I change the drawer type (e.g. dovetail)?", "es": "¿Cómo cambio el tipo de cajón?", "kw": "trocar gaveta dovetail madeira modelo drawer box type cambiar cajon"},
  {"id": "construtor-lado-porta", "cat": "construtor", "tour": "construtor-lado-porta", "alvo": "#po-proj-slot-customize-btn", "artigo": null, "pt": "Como mudo o lado de abertura da porta?", "en": "How do I change which side the door opens?", "es": "¿Cómo cambio el lado de apertura de la puerta?", "kw": "lado abertura esquerda direita dobradica hinge side left right lado apertura"},
  {"id": "construtor-vidro", "cat": "construtor", "tour": "construtor-trocar-porta", "alvo": "#po-proj-slot-customize-btn", "artigo": null, "pt": "Como coloco porta de vidro?", "en": "How do I add a glass door?", "es": "¿Cómo pongo puerta de vidrio?", "kw": "vidro porta vidro glass door vidrio"},
  {"id": "construtor-puxador", "cat": "construtor", "tour": "construtor-puxador", "alvo": null, "artigo": null, "pt": "Como escolho o puxador?", "en": "How do I choose the handle?", "es": "¿Cómo elijo el tirador?", "kw": "puxador alca handle pull knob tirador"},
  {"id": "construtor-apagar-interno", "cat": "construtor", "tour": "construtor-apagar", "alvo": "#po-proj-slot-customize-btn", "artigo": "construtor-basico", "pt": "Como tiro uma prateleira, porta ou gaveta que coloquei?", "en": "How do I remove a shelf, door or drawer I added?", "es": "¿Cómo quito un estante, puerta o cajón?", "kw": "tirar remover interno apagar prateleira porta gaveta remove inside quitar"},
  {"id": "construtor-desfazer", "cat": "construtor", "tour": "construtor-apagar", "alvo": "#po-proj-builder-undo", "artigo": null, "pt": "Como desfaço uma mudança dentro do construtor?", "en": "How do I undo inside the builder?", "es": "¿Cómo deshago en el constructor?", "kw": "desfazer voltar construtor undo builder deshacer"},
  {"id": "led-colocar", "cat": "led", "tour": "led-embutido", "alvo": "#po-proj-slot-led-btn", "artigo": null, "pt": "Como coloco LED embutido no móvel?", "en": "How do I add built-in LED lighting?", "es": "¿Cómo pongo LED empotrado en el mueble?", "kw": "led luz iluminacao fita embutido rasgo light lighting strip luz"},
  {"id": "led-peca", "cat": "led", "tour": "led-embutido", "alvo": "#po-led-pieces", "artigo": null, "pt": "Em qual peça posso colocar o LED (prateleira, lateral, tampo)?", "en": "Which part can I put the LED on?", "es": "¿En qué pieza puedo poner el LED?", "kw": "led peca prateleira lateral tampo fundo rodape qual which part shelf side pieza"},
  {"id": "led-aereo", "cat": "led", "tour": "led-embutido", "alvo": "#po-proj-slot-led-btn", "artigo": null, "pt": "Como coloco LED embaixo do armário aéreo?", "en": "How do I add under-cabinet LED?", "es": "¿Cómo pongo LED debajo del aéreo?", "kw": "led embaixo aereo under cabinet bancada iluminar debajo"},
  {"id": "led-face", "cat": "led", "tour": "led-embutido", "alvo": "#po-led-modal", "artigo": null, "pt": "Como escolho se o LED fica em cima ou embaixo da peça (Top/Under)?", "en": "How do I choose LED on top or under the part?", "es": "¿Cómo elijo LED arriba o abajo de la pieza?", "kw": "led face top under cima baixo lado face cara"},
  {"id": "led-direcao", "cat": "led", "tour": "led-embutido", "alvo": "#po-led-modal", "artigo": null, "pt": "Como deixo o LED na horizontal ou na vertical?", "en": "How do I set the LED horizontal or vertical?", "es": "¿Cómo pongo el LED horizontal o vertical?", "kw": "led direcao horizontal vertical orientacao orientation direccion"},
  {"id": "led-modelo", "cat": "led", "tour": "led-embutido", "alvo": "#po-led-modal", "artigo": null, "pt": "Como escolho o modelo (perfil) do LED?", "en": "How do I choose the LED profile?", "es": "¿Cómo elijo el perfil del LED?", "kw": "led modelo perfil tamanho rasgo profile model perfil"},
  {"id": "led-posicao", "cat": "led", "tour": "led-embutido", "alvo": "#po-led-modal", "artigo": null, "pt": "Como mudo a posição (distância da frente) e o comprimento do LED?", "en": "How do I change the LED position (distance from the front) and length?", "es": "¿Cómo cambio la posición (distancia al frente) y el largo del LED?", "kw": "led posicao distancia frente fundo comprimento margem position front length largo frente"},
  {"id": "led-varios", "cat": "led", "tour": "led-embutido", "alvo": "#po-led-modal", "artigo": null, "pt": "Como coloco mais de um LED na mesma peça?", "en": "How do I add more than one LED to the same part?", "es": "¿Cómo pongo más de un LED en la misma pieza?", "kw": "led varios dois mais de um linhas frente fundo multiple several varios"},
  {"id": "led-duplicar", "cat": "led", "tour": "led-duplicar", "alvo": "#po-led-dup-btn", "artigo": null, "pt": "Como copio o LED pras peças iguais do móvel (ex.: todas as prateleiras)?", "en": "How do I copy the LED to the identical parts of the cabinet (e.g. all shelves)?", "es": "¿Cómo copio el LED a las piezas iguales del mueble (ej.: todas las estantes)?", "kw": "led duplicar copiar repetir iguais todas prateleiras laterais duplicate copy same identical all shelves duplicar copiar iguales"},
  {"id": "led-ferragem", "cat": "led", "tour": "led-embutido", "alvo": "#po-led-modal", "artigo": null, "pt": "O que é o aviso amarelo de LED em cima da ferragem?", "en": "What is the yellow warning about the LED over hardware?", "es": "¿Qué es el aviso amarillo del LED sobre el herraje?", "kw": "led aviso ferragem minifix furo conflito triangulo amarelo warning hardware hole conflict aviso herraje"},
  {"id": "led-remover", "cat": "led", "tour": "led-embutido", "alvo": "#po-led-modal", "artigo": null, "pt": "Como removo o LED de uma peça?", "en": "How do I remove the LED from a part?", "es": "¿Cómo quito el LED de una pieza?", "kw": "led remover tirar apagar remove delete quitar"},
  {"id": "led-ver", "cat": "led", "tour": "led-embutido", "alvo": "#po-proj-render-btn", "artigo": null, "pt": "Como vejo o LED aceso no 3D e no render?", "en": "How do I see the LED lit in 3D and in the render?", "es": "¿Cómo veo el LED encendido en 3D y en el render?", "kw": "led aceso ver 3d render foto lit see encendido"},
  {"id": "led-preco", "cat": "led", "tour": "preco-modulo", "alvo": "#po-proj-slot-money-btn", "artigo": null, "pt": "O LED entra no preço? Como vejo quanto custa?", "en": "Is the LED included in the price?", "es": "¿El LED entra en el precio?", "kw": "led preco custo usinagem metro price cost precio"},
  {"id": "tamponar-modulo", "cat": "pecas", "tour": "tamponamento", "alvo": "#po-proj-slot-tamp-btn", "artigo": null, "pt": "Como tampono um módulo?", "en": "How do I add finished panels around a cabinet?", "es": "¿Cómo tapo un módulo con paneles?", "kw": "tamponar tamponamento acabamento lateral painel finished end panel tapacanto"},
  {"id": "tamponar-grupo", "cat": "pecas", "tour": "tamponamento", "alvo": "#po-proj-group-toolbar", "artigo": null, "pt": "Como tampono vários módulos juntos?", "en": "How do I add panels around a group of cabinets?", "es": "¿Cómo tapo varios módulos juntos?", "kw": "tamponar grupo varios modulos group panels"},
  {"id": "painel-lateral", "cat": "pecas", "tour": "tamponamento", "alvo": "#po-proj-slot-tamp-btn", "artigo": null, "pt": "Como insiro um painel lateral?", "en": "How do I add a side panel?", "es": "¿Cómo inserto un panel lateral?", "kw": "painel lateral vertical side panel panel lateral"},
  {"id": "painel-superior", "cat": "pecas", "tour": "tamponamento", "alvo": "#po-proj-slot-tamp-btn", "artigo": null, "pt": "Como coloco um painel em cima ou embaixo (tampo)?", "en": "How do I add a top or bottom panel?", "es": "¿Cómo pongo un panel arriba o abajo?", "kw": "tampo painel superior inferior horizontal top bottom panel tapa"},
  {"id": "pecas-ver", "cat": "pecas", "tour": "pecas-movel", "alvo": "#po-proj-slot-pieces-btn", "artigo": null, "pt": "Como vejo as peças de um móvel?", "en": "How do I see a cabinet's parts?", "es": "¿Cómo veo las piezas de un mueble?", "kw": "pecas lista corte cutlist parts pieces piezas"},
  {"id": "pecas-deletar", "cat": "pecas", "tour": "peca-remover", "alvo": "#po-proj-canvas-3d-edit-wrap", "artigo": null, "pt": "Como deleto uma peça do móvel?", "en": "How do I delete a part from a cabinet?", "es": "¿Cómo borro una pieza del mueble?", "kw": "deletar peca remover fundo lateral delete part remove piece borrar pieza"},
  {"id": "rodape", "cat": "pecas", "tour": "rodape", "alvo": "#po-proj-wall-editor-btn", "artigo": "rodape-juncao", "pt": "Como mudo a altura do rodapé?", "en": "How do I change the toe kick height?", "es": "¿Cómo cambio la altura del zócalo?", "kw": "rodape toe kick altura base zocalo"},
  {"id": "rodape-juntar", "cat": "pecas", "tour": "rodape", "alvo": "#po-proj-baseboard-join-btn", "artigo": "rodape-juncao", "pt": "Como junto o rodapé de módulos vizinhos numa peça só?", "en": "How do I merge toe kicks of adjacent cabinets?", "es": "¿Cómo uno el zócalo de módulos vecinos?", "kw": "juntar rodape unir emendar peca so producao preco join merge toe kick unir zocalo"},
  {"id": "rodape-juntar-producao", "cat": "pecas", "tour": "rodape", "alvo": "#po-proj-baseboard-join-btn", "artigo": null, "pt": "Se eu juntar o rodapé, ele sai como uma peça só na produção e no preço?", "en": "If I merge the toe kick, does it become a single part in production and price?", "es": "Si uno el zócalo, ¿sale como una sola pieza en producción y precio?", "kw": "juntar rodape uma peca so producao preco duplicado cobrar merge single part production price unir zocalo"},
  {"id": "pes", "cat": "pecas", "tour": "modulo-substituir", "alvo": null, "artigo": null, "pt": "Como uso pés plásticos em vez de rodapé?", "en": "How do I use plastic legs instead of a toe kick?", "es": "¿Cómo uso patas plásticas en vez de zócalo?", "kw": "pe plastico pes regulaveis legs feet patas"},
  {"id": "ferragens-3d", "cat": "pecas", "tour": "ferragens-3d", "alvo": "#po-proj-hardware3d-btn", "artigo": null, "pt": "Como vejo as ferragens no 3D?", "en": "How do I see the hardware in 3D?", "es": "¿Cómo veo los herrajes en 3D?", "kw": "ferragem dobradica corredica minifix cavilha hardware hinge slide herrajes"},
  {"id": "cor-modulo", "cat": "cores", "tour": "cor-modulo", "alvo": "#po-proj-config-panel", "artigo": "trocar-cor-modulo", "pt": "Como troco a cor de um módulo?", "en": "How do I change a cabinet's color?", "es": "¿Cómo cambio el color de un módulo?", "kw": "cor acabamento trocar color finish cambiar color"},
  {"id": "cor-projeto", "cat": "cores", "tour": "cor-projeto", "alvo": null, "artigo": "trocar-cor-modulo", "pt": "Como troco a cor do projeto inteiro de uma vez?", "en": "How do I change the color of the whole project?", "es": "¿Cómo cambio el color de todo el proyecto?", "kw": "cor todos projeto inteiro tudo all whole project color todo"},
  {"id": "cor-porta-caixa", "cat": "cores", "tour": "cor-modulo", "alvo": "#po-proj-config-panel", "artigo": "trocar-cor-modulo", "pt": "Como uso uma cor na porta e outra na caixa?", "en": "How do I use one color for doors and another for the box?", "es": "¿Cómo uso un color en puertas y otro en la caja?", "kw": "cor porta caixa diferente frente interno two tone door box color"},
  {"id": "cor-veio", "cat": "cores", "tour": "cor-modulo", "alvo": "#po-proj-config-panel", "artigo": null, "pt": "Como mudo o sentido do veio da madeira?", "en": "How do I change the wood grain direction?", "es": "¿Cómo cambio la dirección de la veta?", "kw": "veio textura madeira sentido grain wood direction veta"},
  {"id": "mapa-calor", "cat": "preco", "tour": "mapa-calor", "alvo": "#po-proj-heatmap-btn", "artigo": null, "pt": "Como vejo quais módulos são mais caros (mapa de calor)?", "en": "How do I see which cabinets cost the most (heat map)?", "es": "¿Cómo veo qué módulos cuestan más (mapa de calor)?", "kw": "mapa calor caro preco por area budget orcamento heat map expensive mapa calor presupuesto"},
  {"id": "vista-frontal", "cat": "vista", "tour": "vista-frontal", "alvo": "#po-proj-view-front-btn", "artigo": "vista-frontal-superior", "pt": "Como vejo a parede de frente?", "en": "How do I see the wall from the front?", "es": "¿Cómo veo la pared de frente?", "kw": "vista frontal frente elevacao front view elevation frontal"},
  {"id": "vista-cima", "cat": "vista", "tour": "vista-cima", "alvo": "#po-proj-view-top-btn", "artigo": "vista-frontal-superior", "pt": "Como vejo o ambiente de cima (planta)?", "en": "How do I see the room from above?", "es": "¿Cómo veo el ambiente desde arriba?", "kw": "vista cima superior planta top view plan planta"},
  {"id": "vista-camera", "cat": "vista", "tour": "vista-camera", "alvo": "#po-proj-canvas-3d-edit-wrap", "artigo": "girar-camera-zoom", "pt": "Como giro a câmera e dou zoom?", "en": "How do I rotate the camera and zoom?", "es": "¿Cómo giro la cámara y hago zoom?", "kw": "girar camera zoom aproximar orbitar rotate camera zoom"},
  {"id": "vista-enquadrar", "cat": "vista", "tour": "vista-camera", "alvo": "#po-proj-fit-btn", "artigo": "girar-camera-zoom", "pt": "Como centralizo tudo na tela de novo?", "en": "How do I fit everything back on screen?", "es": "¿Cómo centro todo en la pantalla?", "kw": "centralizar enquadrar perdi encaixar fit center lost centrar"},
  {"id": "vista-perspectiva", "cat": "vista", "tour": "vista-projecao", "alvo": "#po-proj-camproj-btn", "artigo": "projecao-camera", "pt": "Qual a diferença entre perspectiva e paralela?", "en": "What's the difference between perspective and parallel view?", "es": "¿Diferencia entre perspectiva y paralela?", "kw": "perspectiva paralela ortogonal projecao perspective parallel orthographic"},
  {"id": "vista-estilo", "cat": "vista", "tour": "vista-estilo", "alvo": "#po-proj-style-menu", "artigo": "estilo-visual", "pt": "Como mudo o estilo do desenho (linhas, cores)?", "en": "How do I change the drawing style?", "es": "¿Cómo cambio el estilo del dibujo?", "kw": "estilo visual linhas aramado solido style wireframe estilo"},
  {"id": "vista-abrir-portas", "cat": "vista", "tour": "vista-abrir-portas", "alvo": "#po-proj-tb-doors-btn", "artigo": "abrir-portas-gavetas-ocultar", "pt": "Como abro as portas e gavetas pra ver por dentro?", "en": "How do I open doors and drawers to see inside?", "es": "¿Cómo abro puertas y cajones para ver adentro?", "kw": "abrir portas gavetas ver dentro open doors drawers inside abrir"},
  {"id": "vista-ocultar", "cat": "vista", "tour": "camadas", "alvo": "#po-proj-tb-ocultar-btn", "artigo": "camadas", "pt": "Como escondo um módulo ou uma camada?", "en": "How do I hide a cabinet or a layer?", "es": "¿Cómo oculto un módulo o una capa?", "kw": "ocultar esconder camada layer hide ocultar capa"},
  {"id": "vista-mostrar-tudo", "cat": "vista", "tour": "camadas", "alvo": "#po-proj-tb-mostrar-btn", "artigo": "camadas", "pt": "Escondi algo, como mostro tudo de novo?", "en": "How do I show everything again?", "es": "¿Cómo muestro todo otra vez?", "kw": "mostrar tudo reaparecer sumiu show all unhide mostrar"},
  {"id": "vista-cotas", "cat": "vista", "tour": "cotas", "alvo": "#po-proj-dims-btn", "artigo": "cotas", "pt": "Como mostro as medidas entre os módulos?", "en": "How do I show dimensions between cabinets?", "es": "¿Cómo muestro las medidas entre módulos?", "kw": "cotas medidas distancia dimensions measurements cotas"},
  {"id": "vista-regua", "cat": "vista", "tour": "regua", "alvo": "#po-proj-ruler-btn", "artigo": null, "pt": "Como meço uma distância na tela?", "en": "How do I measure a distance?", "es": "¿Cómo mido una distancia?", "kw": "regua medir trena distancia ruler measure tape regla"},
  {"id": "vista-tela-cheia", "cat": "vista", "tour": "tela-cheia", "alvo": "#po-proj-fullscreen-btn", "artigo": "tela-cheia", "pt": "Como uso a tela cheia?", "en": "How do I go fullscreen?", "es": "¿Cómo uso pantalla completa?", "kw": "tela cheia fullscreen maximizar pantalla completa"},
  {"id": "vista-fixar-barra", "cat": "vista", "tour": "fixar-barra", "alvo": "#po-proj-pin-toolbar-btn", "artigo": null, "pt": "Como deixo a barra de ferramentas fixa?", "en": "How do I pin the toolbar?", "es": "¿Cómo fijo la barra de herramientas?", "kw": "fixar barra ferramentas travar alfinete grudar colunas pin toolbar sticky fijar"},
  {"id": "vista-barra-janela", "cat": "vista", "tour": "fixar-barra", "alvo": "#po-proj-pin-toolbar-btn", "artigo": null, "pt": "Por que a barra fixa some quando abro uma janela (Paredes, LED…)?", "en": "Why does the pinned toolbar disappear when I open a window (Walls, LED…)?", "es": "¿Por qué la barra fija desaparece al abrir una ventana (Paredes, LED…)?", "kw": "barra fixa some sumiu janela paredes led atras escondida pinned toolbar hidden window behind barra desaparece"},
  {"id": "vista-cada-parede", "cat": "vista", "tour": "plano-tecnico", "alvo": "#po-proj-techplan-btn", "artigo": null, "pt": "Como gero uma vista cotada de cada parede?", "en": "How do I generate a dimensioned view of each wall?", "es": "¿Cómo genero una vista acotada de cada pared?", "kw": "vista cada parede elevacao cotada plano tecnico wall elevations technical plan alzado"},
  {"id": "vista-print", "cat": "vista", "tour": "print-vista", "alvo": "#po-proj-print-view-btn", "artigo": null, "pt": "Como tiro um print da vista atual?", "en": "How do I take a screenshot of the current view?", "es": "¿Cómo saco una captura de la vista actual?", "kw": "print captura screenshot imagem tela captura"},
  {"id": "desfazer", "cat": "vista", "tour": "desfazer", "alvo": "#po-proj-undo-btn", "artigo": "desfazer", "pt": "Como desfaço ou refaço uma ação?", "en": "How do I undo or redo?", "es": "¿Cómo deshago o rehago?", "kw": "desfazer refazer voltar ctrl z undo redo deshacer"},
  {"id": "render", "cat": "render", "tour": "render", "alvo": "#po-proj-render-btn", "artigo": "foto-realista", "pt": "Como renderizo (foto realista)?", "en": "How do I render a photo-realistic image?", "es": "¿Cómo renderizo una imagen realista?", "kw": "render renderizar foto realista imagem photoreal render"},
  {"id": "render-area", "cat": "render", "tour": "render", "alvo": "#po-proj-render-linhas-btn", "artigo": "foto-realista", "pt": "Como escolho o enquadramento da foto?", "en": "How do I frame the render?", "es": "¿Cómo elijo el encuadre de la foto?", "kw": "enquadramento area foto linhas framing area"},
  {"id": "render-galeria", "cat": "render", "tour": "render-galeria", "alvo": "#po-proj-photoreal-gallery", "artigo": null, "pt": "Onde ficam as fotos que gerei?", "en": "Where are my rendered images?", "es": "¿Dónde quedan las fotos generadas?", "kw": "galeria fotos geradas onde baixar download gallery images galeria"},
  {"id": "render-ia-ambiente", "cat": "render", "tour": "render-ia", "alvo": "#po-proj-gallery-generate-ai-btn", "artigo": null, "pt": "Como gero uma imagem com IA do ambiente decorado?", "en": "How do I generate an AI image of the decorated room?", "es": "¿Cómo genero una imagen con IA del ambiente?", "kw": "ia imagem decorado ambiente ai image staging decorado"},
  {"id": "render-publicar", "cat": "render", "tour": "render-publicar", "alvo": "#po-proj-gallery-publish-toggle-btn", "artigo": null, "pt": "Como publico meu projeto na galeria?", "en": "How do I publish my project to the gallery?", "es": "¿Cómo publico mi proyecto en la galería?", "kw": "publicar galeria compartilhar publish gallery share publicar"},
  {"id": "exportar-sketchup", "cat": "render", "tour": "exportar-sketchup", "alvo": "#po-proj-export-sketchup-btn", "artigo": null, "pt": "Como exporto para o SketchUp?", "en": "How do I export to SketchUp?", "es": "¿Cómo exporto a SketchUp?", "kw": "sketchup exportar dae export"},
  {"id": "ver-ar", "cat": "render", "tour": "ver-ar", "alvo": "#po-proj-test-ar-btn", "artigo": null, "pt": "Como vejo o móvel em realidade aumentada?", "en": "How do I view the cabinet in AR?", "es": "¿Cómo veo el mueble en realidad aumentada?", "kw": "realidade aumentada ar celular augmented reality realidad aumentada"},
  {"id": "preco-fabrica", "cat": "preco", "tour": "preco-fabrica", "alvo": "#po-proj-money-tb-btn", "artigo": "dollar-orcamento-fabrica", "pt": "Como gero o preço de fábrica?", "en": "How do I get the factory price?", "es": "¿Cómo genero el precio de fábrica?", "kw": "preco fabrica custo orcamento factory price cost precio fabrica"},
  {"id": "preco-cliente", "cat": "preco", "tour": "preco-cliente", "alvo": "#po-margins-btn", "artigo": "margem-logo-dealer", "pt": "Como gero o preço para o cliente?", "en": "How do I get the price for my client?", "es": "¿Cómo genero el precio para el cliente?", "kw": "preco cliente venda margem final client price retail precio cliente"},
  {"id": "preco-margem", "cat": "preco", "tour": "preco-cliente", "alvo": "#po-margins-btn", "artigo": "margem-logo-dealer", "pt": "Como configuro minha margem?", "en": "How do I set my margin?", "es": "¿Cómo configuro mi margen?", "kw": "margem markup lucro desconto margin markup margen"},
  {"id": "preco-modulo", "cat": "preco", "tour": "preco-modulo", "alvo": "#po-proj-slot-money-btn", "artigo": "medidas-cores-preco", "pt": "Como vejo o preço de um módulo só?", "en": "How do I see the price of one cabinet?", "es": "¿Cómo veo el precio de un solo módulo?", "kw": "preco modulo individual quanto custa price one cabinet precio modulo"},
  {"id": "preco-total", "cat": "preco", "tour": "preco-total", "alvo": "#po-proj-summary", "artigo": null, "pt": "Onde vejo o total do projeto?", "en": "Where do I see the project total?", "es": "¿Dónde veo el total del proyecto?", "kw": "total resumo soma projeto summary total resumen"},
  {"id": "preco-reduzir", "cat": "preco", "tour": "analise-custo", "alvo": "#po-proj-costplan-btn", "artigo": null, "pt": "Como descubro onde dá pra baixar o preço do projeto?", "en": "How do I find ways to lower the project price?", "es": "¿Cómo encuentro dónde bajar el precio?", "kw": "reduzir baratear analise custo budget orcamento cliente lower price cost analysis reducir"},
  {"id": "proposta", "cat": "preco", "tour": "proposta", "alvo": "#po-proj-proposal-btn", "artigo": "salvar-proposta-enviar", "pt": "Como gero a proposta para o cliente?", "en": "How do I create the client proposal?", "es": "¿Cómo genero la propuesta para el cliente?", "kw": "proposta pdf cliente apresentacao proposal quote propuesta"},
  {"id": "proposta-imagens", "cat": "preco", "tour": "referencias", "alvo": "#po-proj-ref-add-btn", "artigo": null, "pt": "Como anexo imagens na proposta?", "en": "How do I attach images to the proposal?", "es": "¿Cómo adjunto imágenes en la propuesta?", "kw": "anexar imagem referencia proposta attach image reference adjuntar"},
  {"id": "enviar-pedido", "cat": "preco", "tour": "enviar-pedido", "alvo": "#po-proj-send-to-order-btn", "artigo": "carrinho-pedido", "pt": "Como transformo o projeto em pedido para a fábrica?", "en": "How do I turn the project into an order?", "es": "¿Cómo convierto el proyecto en pedido?", "kw": "pedido enviar fabrica comprar fechar order send buy pedido"},
  {"id": "peso-volume", "cat": "preco", "tour": "preco-total", "alvo": "#po-proj-volume-weight", "artigo": null, "pt": "Como vejo o peso e o volume para o frete?", "en": "How do I see weight and volume for shipping?", "es": "¿Cómo veo peso y volumen para el flete?", "kw": "peso volume frete entrega weight volume shipping peso"},
  {"id": "lista-corte", "cat": "preco", "tour": "lista-corte", "alvo": "#po-nav-tab-cutting-list", "artigo": null, "pt": "Como vejo a lista de corte do projeto?", "en": "How do I see the project's cutting list?", "es": "¿Cómo veo la lista de corte?", "kw": "lista corte cutting list pecas lista de corte"},
  {"id": "meus-pedidos", "cat": "preco", "tour": "meus-pedidos", "alvo": ".portal-tab-btn[data-tab=\"po-tab-my-orders\"]", "artigo": null, "pt": "Como acompanho meus pedidos?", "en": "How do I track my orders?", "es": "¿Cómo sigo mis pedidos?", "kw": "meus pedidos acompanhar status my orders track mis pedidos"},
  {"id": "orcamento-rapido", "cat": "preco", "tour": "orcamento-rapido", "alvo": ".portal-tab-btn[data-tab=\"po-tab-new-order\"]", "artigo": "novo-orcamento", "pt": "Como faço um orçamento rápido sem desenhar o ambiente?", "en": "How do I make a quick quote without drawing the room?", "es": "¿Cómo hago un presupuesto rápido sin dibujar?", "kw": "orcamento rapido new quote sem desenho quick quote presupuesto rapido"},
  ];

  const CATEGORIAS = ['projeto', 'paredes', 'importar', 'modulos', 'construtor', 'led', 'pecas', 'cores', 'vista', 'render', 'preco'];
  // As que o Matt listou como "principais de iniciante" — aparecem primeiro.
  const POPULARES = ['parede-construir', 'parede-importar-desenho', 'modulo-customizado', 'construtor-portas',
    'construtor-gavetas', 'construtor-prateleira', 'tamponar-modulo', 'painel-lateral', 'construtor-trocar-porta',
    'construtor-prateleira-regulavel', 'pecas-deletar', 'construtor-usar', 'led-colocar', 'render',
    'preco-fabrica', 'preco-cliente', 'vista-cada-parede', 'importar-opcoes'];

  // ==========================================================================
  // UTILITÁRIOS DE TELA
  // ==========================================================================
  function visivel(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0;
  }
  function achar(sel) {
    if (!sel) return null;
    if (typeof sel === 'function') { try { const el = sel(); return visivel(el) ? el : null; } catch (e) { return null; } }
    let lista;
    try { lista = document.querySelectorAll(sel); } catch (e) { return null; }
    for (let i = 0; i < lista.length; i++) if (visivel(lista[i])) return lista[i];
    // Botão dentro de um menu da barra (Paredes, Vista, Camadas, Render,
    // Orçamento, IA Services — portal-25, 20/10): fechado, ele não aparece —
    // abre o painel e tenta de novo. Botão escondido pela regra "só
    // administrador" (display:none nele mesmo) continua não valendo.
    const menus = window.LegnoTbMenus;
    if (menus) {
      for (let i = 0; i < lista.length; i++) {
        const el = lista[i];
        if (el.style.display === 'none' || !menus.abrirPara(el)) continue;
        if (visivel(el)) return el;
      }
    }
    return null;
  }
  const aberto = (sel) => () => !!achar(sel);
  const fechado = (sel) => () => !achar(sel);
  function nSlots() {
    try { return (typeof projectSlots !== 'undefined' && Array.isArray(projectSlots)) ? projectSlots.length : 0; } catch (e) { return 0; }
  }
  function selVao() {
    try { return (typeof projectBuilderSelId !== 'undefined') ? projectBuilderSelId : null; } catch (e) { return null; }
  }
  // Card da biblioteca do CONSTRUTOR cujo nome casa — os nomes vêm do
  // cadastro (numa língua só), por isso o teste aceita pt/en/es.
  function itemConstrutor(teste) {
    return () => {
      const cards = document.querySelectorAll('#po-proj-builder-lib .po-proj-builder-item');
      for (let i = 0; i < cards.length; i++) {
        if (visivel(cards[i]) && teste(norm(cards[i].textContent))) return cards[i];
      }
      return null;
    };
  }
  const pai = (sel) => () => { const e = $(sel); return e ? (e.closest('label') || e.parentElement) : null; };

  // ==========================================================================
  // PASSOS REAPROVEITADOS
  // ==========================================================================
  const CANVAS = '#po-proj-canvas-3d-edit-wrap, #po-proj-canvas';
  const P = {
    aba: {
      el: '.portal-tab-btn[data-tab="po-tab-projects"]',
      skipIf: aberto('#po-tab-projects'),
      wait: '#po-tab-projects',
      text: T('Abra a aba Projetos.', 'Open the Projects tab.', 'Abra la pestaña Proyectos.')
    },
    temModulo: {
      el: '#po-proj-library-search-btn',
      skipIf: () => nSlots() > 0,
      wait: () => nSlots() > 0,
      text: T('Primeiro coloque um móvel no ambiente: clique em + Módulo e escolha um.',
        'First place a cabinet in the room: click + Cabinet and pick one.',
        'Primero coloque un mueble: haga clic en + Módulo y elija uno.')
    },
    selecionar: {
      el: CANVAS,
      skipIf: () => !!(achar('#po-proj-slot-actions') || achar('#po-proj-group-toolbar')),
      wait: () => !!(achar('#po-proj-slot-actions') || achar('#po-proj-group-toolbar')),
      text: T('Clique no móvel no desenho 3D pra selecionar. Aparece uma barrinha de botões em cima dele.',
        'Click the cabinet in the 3D drawing to select it. A small button bar appears above it.',
        'Haga clic en el mueble en el dibujo 3D para seleccionarlo. Aparece una barrita de botones encima.')
    },
    // ---- editor de paredes ----
    paredesAbrir: {
      el: '#po-proj-wall-editor-btn',
      skipIf: aberto('#po-wall-editor-modal'),
      wait: '#po-wall-editor-modal',
      text: T('Clique em Paredes pra abrir a planta baixa do ambiente.',
        'Click Walls to open the room floor plan.',
        'Haga clic en Paredes para abrir la planta del ambiente.')
    },
    paredesOk: {
      el: '#po-wall-editor-modal [data-acao="ok"]',
      wait: fechado('#po-wall-editor-modal'),
      text: T('Clique em OK pra aplicar no projeto.', 'Click OK to apply it to the project.', 'Haga clic en OK para aplicarlo al proyecto.')
    },
    paredesSelecionar: {
      el: '#po-wall-stage',
      text: T('Clique na parede que você quer mudar (ela fica destacada).',
        'Click the wall you want to change (it gets highlighted).',
        'Haga clic en la pared que quiere cambiar (queda resaltada).')
    },
    // ---- construtor ----
    construtorAbrir: {
      el: '#po-proj-slot-customize-btn',
      skipIf: aberto('#po-proj-builder-modal'),
      wait: '#po-proj-builder-modal',
      text: T('Clique em Customizar (✎). Abre o construtor só deste móvel — o catálogo não muda.',
        'Click Customize (✎). It opens the builder for this cabinet only — the catalog is not changed.',
        'Haga clic en Personalizar (✎). Abre el constructor solo de este mueble — el catálogo no cambia.')
    },
    construtorVao: {
      el: '#po-proj-builder-stage',
      onEnter: (p) => { p._v0 = selVao(); },
      wait: (p) => selVao() != null && selVao() !== p._v0,
      text: T('Clique no vão (espaço vazio) do desenho onde quer colocar. O vão escolhido fica destacado e a lista ao lado mostra só o que cabe nele.',
        'Click the empty space in the drawing where you want to add it. The chosen space is highlighted and the list shows only what fits.',
        'Haga clic en el hueco (espacio vacío) del dibujo donde quiere colocarlo. El hueco elegido se resalta y la lista muestra solo lo que cabe.')
    },
    construtorSalvar: {
      el: '#po-proj-builder-save',
      wait: fechado('#po-proj-builder-modal'),
      text: T('Clique em Salvar. O móvel atualiza no 3D, no preço e na lista de peças.',
        'Click Save. The cabinet updates in 3D, in the price and in the parts list.',
        'Haga clic en Guardar. El mueble se actualiza en 3D, en el precio y en la lista de piezas.')
    }
  };
  function abrirModal(btn, modal, text) {
    return { el: btn, skipIf: aberto(modal), wait: modal, text };
  }
  function itemPasso(teste, nome) {
    return {
      el: itemConstrutor(teste),
      fallback: '#po-proj-builder-lib',
      wait: 'click',
      text: T('Clique em ' + nome.pt + ' na lista (ou arraste até o vão). Se não aparecer, o vão é pequeno demais — escolha outro vão.',
        'Click ' + nome.en + ' in the list (or drag it onto the space). If it is not listed, the space is too small — pick another one.',
        'Haga clic en ' + nome.es + ' en la lista (o arrástrelo al hueco). Si no aparece, el hueco es muy pequeño — elija otro.')
    };
  }
  function construtor(meio) {
    return [P.aba, P.temModulo, P.selecionar, P.construtorAbrir].concat(meio, [P.construtorSalvar]);
  }
  const ehPrateleiraFixa = (n) => /prateleira|shelf|estante|repisa/.test(n) && !/regul|adjust/.test(n);

  // ==========================================================================
  // ROTEIROS DETALHADOS (o resto do catálogo usa o tour de 1 passo no `alvo`)
  // ==========================================================================
  const HELPER_TOURS = {
    // ---------------- PROJETO ----------------
    'projeto-novo': [P.aba,
      { el: '#po-proj-reset-btn', text: T('Novo projeto: este botão limpa o ambiente atual (salve antes se quiser guardar o que está aberto).',
        'New project: this button clears the current room (save first if you want to keep it).',
        'Proyecto nuevo: este botón limpia el ambiente actual (guarde antes si quiere conservarlo).') },
      { el: '#po-proj-wall-editor-btn', text: T('Depois desenhe as paredes aqui…', 'Then draw the walls here…', 'Luego dibuje las paredes aquí…') },
      { el: '#po-proj-library-search-btn', text: T('…e coloque os módulos pelo botão + Módulo.', '…and add cabinets with the + Cabinet button.', '…y agregue los módulos con el botón + Módulo.') }],

    // ---------------- PAREDES ----------------
    'paredes-desenhar': [P.aba, P.paredesAbrir,
      { el: '#po-wall-stage', text: T('Esta é a planta baixa, vista de cima. Clique numa parede pra selecionar; arrastar um canto faz ajuste grosso.',
        'This is the floor plan seen from above. Click a wall to select it; dragging a corner makes a rough adjustment.',
        'Esta es la planta vista desde arriba. Haga clic en una pared para seleccionarla; arrastrar una esquina hace un ajuste grueso.') },
      { el: '#po-wall-editor-modal [data-acao="add"]', text: T('“+ parede” acrescenta uma parede nova ligada à última. “+ solta” cria uma parede separada (meia-parede, ilha).',
        '“+ wall” adds a new wall connected to the last one. “+ free” creates a separate wall (half wall, island).',
        '“+ pared” agrega una pared nueva unida a la última. “+ suelta” crea una pared separada (media pared, isla).') },
      { el: '#po-wall-comp', text: T('Com a parede selecionada, digite o comprimento — medida de DENTRO, de canto a canto, como foi tirada na obra. A espessura cresce pra fora.',
        'With the wall selected, type its length — INSIDE measurement, corner to corner, as taken on site. The thickness grows outward.',
        'Con la pared seleccionada, escriba el largo — medida INTERIOR, de esquina a esquina, como se tomó en obra. El espesor crece hacia afuera.') },
      { el: '#po-wall-ang', text: T('Giro em relação à parede anterior: 90 faz um canto reto; 45 faz uma parede em diagonal.',
        'Turn relative to the previous wall: 90 makes a square corner; 45 makes a diagonal wall.',
        'Giro respecto a la pared anterior: 90 hace una esquina recta; 45 hace una pared en diagonal.') },
      { el: '#po-wall-fechar', text: T('“Fechar” liga a última parede na primeira e mostra quantos mm sobram — é o jeito de pegar medida errada antes de fabricar.',
        '“Close” joins the last wall to the first and shows the leftover gap — the way to catch a wrong measurement before manufacturing.',
        '“Cerrar” une la última pared con la primera y muestra cuántos mm sobran — así se detecta una medida errada antes de fabricar.') },
      { el: '#po-wall-editor-modal [data-acao="remover"]', text: T('Pra apagar uma parede: selecione e clique em Remover.',
        'To delete a wall: select it and click Remove.', 'Para borrar una pared: selecciónela y haga clic en Eliminar.') },
      P.paredesOk],
    'paredes-formato': [P.aba, P.paredesAbrir,
      { el: '#po-wall-editor-modal [data-acao="add"]', text: T('Pra um ambiente em L: com uma parede pronta, clique “+ parede” — ela já entra ligada à anterior. Pra U, clique mais uma vez.',
        'For an L-shaped room: with one wall in place, click “+ wall” — it comes connected to the previous one. For a U, click once more.',
        'Para un ambiente en L: con una pared lista, haga clic en “+ pared” — ya entra unida a la anterior. Para U, haga clic una vez más.') },
      { el: '#po-wall-ang', text: T('Deixe o giro em 90° pra canto reto.', 'Keep the turn at 90° for a square corner.', 'Deje el giro en 90° para esquina recta.') },
      { el: '#po-wall-comp', text: T('Digite o comprimento de cada parede (medida de dentro).', 'Type the length of each wall (inside measurement).', 'Escriba el largo de cada pared (medida interior).') },
      P.paredesOk],
    'paredes-medida': [P.aba, P.paredesAbrir, P.paredesSelecionar,
      { el: '#po-wall-comp', text: T('Digite o novo comprimento e tecle Enter. Só essa parede muda; o resto do contorno acompanha sem mudar de medida.',
        'Type the new length and press Enter. Only that wall changes; the rest of the outline follows without changing size.',
        'Escriba el nuevo largo y pulse Enter. Solo cambia esa pared; el resto del contorno acompaña sin cambiar de medida.') },
      P.paredesOk],
    'paredes-altura': [P.aba, P.paredesAbrir,
      { el: '#po-wall-teto', text: T('Pé-direito do ambiente inteiro.', 'Ceiling height for the whole room.', 'Altura del techo de todo el ambiente.') },
      { el: '#po-wall-pd', text: T('Se só uma parede tem altura diferente (viga, rebaixo), selecione ela e use “Altura desta parede”.',
        'If only one wall has a different height (beam, soffit), select it and use “Height of this wall”.',
        'Si solo una pared tiene otra altura (viga, cielo bajo), selecciónela y use “Altura de esta pared”.') },
      P.paredesOk],
    'rodape': [P.aba, P.paredesAbrir,
      { el: '#po-wall-rodape', text: T('Altura do rodapé dos móveis de base (o recuo embaixo).', 'Toe kick height for base cabinets.', 'Altura del zócalo de los muebles bajos.') },
      P.paredesOk,
      { el: '#po-proj-baseboard-join-btn', text: T('Dica: este botão junta o rodapé de módulos encostados numa peça só — e ela sai UMA peça só também na produção e no preço (o 1º módulo leva a peça inteira, os outros ficam sem), sem cobrar duplicado.',
        'Tip: this button merges the toe kick of touching cabinets into a single part — and it is ONE part in production and price too (the 1st cabinet carries the whole part, the others drop theirs), no double charge.',
        'Consejo: este botón une el zócalo de módulos pegados en una sola pieza — y sale UNA sola pieza también en producción y precio (el 1er módulo lleva la pieza entera, los otros no), sin cobrar doble.') }],
    'paredes-rebaixar': [P.aba,
      { el: '#po-proj-wall-cutaway-btn', fallback: '#po-proj-dd-walls-btn', wait: 'click', text: T('No menu Paredes, clique em Rebaixar paredes.',
        'In the Walls menu, click Lower walls.',
        'En el menú Paredes, haga clic en Rebajar paredes.') },
      { el: CANVAS, text: T('Pronto: a parede que fica NA FRENTE da vista vira uma mureta baixa, e você clica no móvel que estava atrás. Gire a câmera — as paredes do fundo continuam inteiras e cada uma desce só quando passa pra frente. Clique de novo no botão pra desligar.',
        'Done: the wall IN FRONT of the view becomes a low curb, and you can click the cabinet behind it. Orbit the camera — the back walls stay whole and each one only lowers when it comes to the front. Click the button again to turn it off.',
        'Listo: la pared que queda DELANTE de la vista se vuelve un murete bajo, y puede hacer clic en el mueble que estaba detrás. Gire la cámara — las paredes del fondo siguen enteras y cada una baja solo cuando pasa adelante. Haga clic de nuevo en el botón para apagarlo.') }],
    'paredes-aberturas': [P.aba, P.paredesAbrir,
      { el: '#po-wall-stage', text: T('Selecione a parede onde fica a porta ou a janela.', 'Select the wall where the door or window is.', 'Seleccione la pared donde está la puerta o ventana.') },
      { el: '#po-wall-editor-modal .po-wall-aberturas-add', text: T('Clique em + porta, + janela ou + passagem. Depois ajuste posição, largura e altura na lista logo acima.',
        'Click + door, + window or + opening. Then adjust position, width and height in the list just above.',
        'Haga clic en + puerta, + ventana o + paso. Luego ajuste posición, ancho y alto en la lista de arriba.') },
      P.paredesOk,
      { el: '#po-proj-structures-btn', text: T('Também dá pra pôr portas, janelas, tomadas e interruptores pelo botão Estruturas.',
        'You can also add doors, windows, outlets and switches with the Structures button.',
        'También puede poner puertas, ventanas, enchufes e interruptores con el botón Estructuras.') }],
    'paredes-estruturas': [P.aba,
      { el: '#po-proj-structures-btn', skipIf: aberto('#po-proj-structures-list'), wait: '#po-proj-structures-list',
        text: T('Clique em Estruturas: tomadas, interruptores, canos, exaustão, ventilação, portas e janelas.',
          'Click Structures: outlets, switches, pipes, exhaust, vents, doors and windows.',
          'Haga clic en Estructuras: enchufes, interruptores, tuberías, extracción, ventilación, puertas y ventanas.') },
      { el: '#po-proj-structures-list', text: T('Escolha o item: ele entra no desenho como um módulo — arraste pra posição certa. Não entra no orçamento e pode ser escondido nas Camadas.',
        'Pick the item: it enters the drawing like a cabinet — drag it into place. It is not priced and can be hidden in Layers.',
        'Elija el elemento: entra al dibujo como un módulo — arrástrelo a su lugar. No entra en el presupuesto y se puede ocultar en Capas.') }],
    'paredes-abas': [P.aba,
      { el: CANVAS, text: T('Clique numa parede no desenho 3D pra trabalhar nela — o nome e a medida aparecem no rodapé do desenho.',
        'Click a wall in the 3D drawing to work on it — its name and size appear at the bottom of the drawing.',
        'Haga clic en una pared del dibujo 3D para trabajar en ella — el nombre y la medida aparecen abajo del dibujo.') },
      { el: '#po-proj-view-front-btn', text: T('Na Vista frontal você vê uma parede de cada vez, de frente.', 'Front view shows one wall at a time, head-on.', 'La vista frontal muestra una pared a la vez, de frente.') }],
    'paredes-ia': [P.aba,
      abrirModal('#po-proj-ai-walls-btn', '#po-ai-walls-modal', T('Clique em IA · Paredes.', 'Click AI · Walls.', 'Haga clic en IA · Paredes.')),
      { el: '#po-ai-walls-file', text: T('Anexe a foto ou o PDF da planta. As medidas do desenho são lidas como internas (de parede a parede).',
        'Attach the photo or PDF of the floor plan. Drawing measurements are read as inside dimensions (wall to wall).',
        'Adjunte la foto o el PDF del plano. Las medidas del dibujo se leen como interiores (de pared a pared).') },
      { el: '#po-ai-walls-ceiling', text: T('Confira o pé-direito.', 'Check the ceiling height.', 'Revise la altura del techo.') },
      { el: '#po-ai-walls-read', wait: '#po-ai-walls-apply', text: T('Clique em Ler e espere a IA desenhar as paredes.', 'Click Read and wait for the AI to draw the walls.', 'Haga clic en Leer y espere a que la IA dibuje las paredes.') },
      { el: '#po-ai-walls-apply', wait: fechado('#po-ai-walls-modal'), text: T('Confira e clique em Aplicar. Qualquer medida dá pra ajustar depois no botão Paredes.',
        'Review and click Apply. Any measurement can be fixed later with the Walls button.',
        'Revise y haga clic en Aplicar. Cualquier medida se ajusta después con el botón Paredes.') }],

    // ---------------- IMPORTAR ----------------
    'importar-menu': [P.aba,
      { el: '#po-proj-tb-ia', text: T('Em IA Services ficam as importações: 2020, Promob, foto e PDF (IA · Paredes fica no grupo Paredes). Pergunte de novo citando qual delas, que eu mostro o passo a passo.',
        'Imports live in AI Services: 2020, Promob, photo and PDF (AI · Walls is in the Walls group). Ask again naming one and I will walk you through it.',
        'Las importaciones están en Servicios IA: 2020, Promob, foto y PDF (IA · Paredes está en el grupo Paredes). Pregunte de nuevo nombrando una y le muestro el paso a paso.') }],
    'importar-2020': [P.aba,
      abrirModal('#po-proj-import2020-open-btn', '#po-proj-import2020-modal', T('Clique em Importar do 2020.', 'Click Import from 2020.', 'Haga clic en Importar de 2020.')),
      { el: '#po-proj-import2020-pdf-btn', text: T('Anexe o PDF do relatório “Item List” exportado do 2020 Design (ou use “colar o texto manualmente”).',
        'Attach the “Item List” report PDF exported from 2020 Design (or use “paste the text manually”).',
        'Adjunte el PDF del informe “Item List” exportado de 2020 Design (o use “pegar el texto manualmente”).') },
      { el: '#po-proj-import2020-process-btn', wait: 'click', text: T('Clique pra ler os códigos.', 'Click to read the codes.', 'Haga clic para leer los códigos.') },
      { el: '#po-proj-import2020-review', text: T('Confira: cada código do 2020 aparece com o módulo Legno correspondente. O que não for reconhecido fica marcado pra você escolher.',
        'Review: each 2020 code shows the matching Legno cabinet. Anything not recognized is flagged for you to choose.',
        'Revise: cada código de 2020 aparece con el módulo Legno correspondiente. Lo no reconocido queda marcado para que usted elija.') },
      { el: '#po-proj-import2020-create-btn', wait: 'click', text: T('Clique em criar. Os módulos entram em fila na parede (o relatório do 2020 não traz posição) — depois é só arrastar.',
        'Click create. Cabinets come in lined up on the wall (the 2020 report has no positions) — then just drag them.',
        'Haga clic en crear. Los módulos entran en fila en la pared (el informe de 2020 no trae posición) — luego solo arrástrelos.') }],
    'importar-promob': [P.aba,
      abrirModal('#po-proj-importpromob-open-btn', '#po-proj-importpromob-modal', T('Clique em Importar do Promob.', 'Click Import from Promob.', 'Haga clic en Importar de Promob.')),
      { el: '#po-proj-importpromob-file-btn', text: T('Escolha o arquivo .promob do projeto.', 'Choose the project .promob file.', 'Elija el archivo .promob del proyecto.') },
      { el: '#po-proj-importpromob-review', text: T('O Promob traz a cena inteira: paredes, medida, posição e giro de cada módulo. Confira o casamento com o catálogo.',
        'Promob brings the whole scene: walls, size, position and rotation of each cabinet. Check the catalog matches.',
        'Promob trae la escena entera: paredes, medida, posición y giro de cada módulo. Revise la correspondencia con el catálogo.') },
      { el: '#po-proj-importpromob-create-btn', wait: 'click', text: T('Clique em criar.', 'Click create.', 'Haga clic en crear.') }],
    'projeto-foto': [P.aba,
      abrirModal('#po-proj-photo-open-btn', '#po-proj-photo-modal', T('Clique em Projeto a partir de foto.', 'Click Project from photo.', 'Haga clic en Proyecto desde foto.')),
      { el: '#po-proj-photo-attach-btn', text: T('Anexe a foto do ambiente.', 'Attach the room photo.', 'Adjunte la foto del ambiente.') },
      { el: '#po-proj-photo-wall-input', text: T('Informe a largura da parede…', 'Enter the wall width…', 'Indique el ancho de la pared…') },
      { el: '#po-proj-photo-ceiling-input', text: T('…e o pé-direito, pra IA ter a escala certa.', '…and the ceiling height, so the AI gets the scale right.', '…y la altura del techo, para que la IA tenga la escala correcta.') },
      { el: '#po-proj-photo-run-btn', wait: 'click', text: T('Clique pra IA ler a foto e espere.', 'Click so the AI reads the photo, and wait.', 'Haga clic para que la IA lea la foto y espere.') },
      { el: '#po-proj-photo-create-btn', wait: 'click', text: T('Confira o resultado e clique em criar o projeto.', 'Review the result and click create project.', 'Revise el resultado y haga clic en crear el proyecto.') }],
    'projeto-pdf': [P.aba,
      abrirModal('#po-proj-pdf-open-btn', '#po-proj-pdf-modal', T('Clique em Projetos a partir de PDF.', 'Click Projects from PDF.', 'Haga clic en Proyectos desde PDF.')),
      { el: '#po-proj-pdf-attach-btn', text: T('Anexe o PDF do projeto (pranchas do arquiteto/designer).', 'Attach the project PDF (architect/designer sheets).', 'Adjunte el PDF del proyecto (láminas del arquitecto/diseñador).') },
      { el: '#po-proj-pdf-ceiling-input', text: T('Confira o pé-direito.', 'Check the ceiling height.', 'Revise la altura del techo.') },
      { el: '#po-proj-pdf-run-btn', wait: 'click', text: T('Clique pra IA ler o PDF e espere.', 'Click so the AI reads the PDF, and wait.', 'Haga clic para que la IA lea el PDF y espere.') },
      { el: '#po-proj-pdf-create-btn', wait: 'click', text: T('Confira e clique em criar. As pranchas originais ficam salvas em Referências, pra ir na proposta.',
        'Review and click create. The original sheets are kept in References, for the proposal.',
        'Revise y haga clic en crear. Las láminas originales quedan en Referencias, para la propuesta.') }],

    // ---------------- MÓDULOS ----------------
    'modulo-arrastar': [P.aba,
      abrirModal('#po-proj-library-search-btn', '#po-proj-search-modal', T('Clique em + Módulo.', 'Click + Cabinet.', 'Haga clic en + Módulo.')),
      { el: '#po-proj-search-modal-grid', onEnter: (p) => { p._n = nSlots(); }, wait: (p) => nSlots() > p._n,
        text: T('Clique no módulo pra inserir — ou escolha a referência no menu do card. Trena verde = medida editável.',
          'Click the cabinet to insert it — or pick a reference in the card menu. Green tape = editable size.',
          'Haga clic en el módulo para insertarlo — o elija la referencia en el menú de la tarjeta. Cinta verde = medida editable.') },
      { el: CANVAS, text: T('Pronto! Clique no móvel pra selecionar e ajustar medida, cor e internos.',
        'Done! Click the cabinet to select it and adjust size, color and interior.',
        '¡Listo! Haga clic en el mueble para ajustar medida, color e interiores.') }],
    'modulo-procurar': [P.aba,
      abrirModal('#po-proj-library-search-btn', '#po-proj-search-modal', T('Clique em + Módulo.', 'Click + Cabinet.', 'Haga clic en + Módulo.')),
      { el: '#po-proj-search-filter-family', text: T('Filtre por família, categoria e subcategoria…', 'Filter by family, category and subcategory…', 'Filtre por familia, categoría y subcategoría…') },
      { el: '#po-proj-search-modal-grid', text: T('…e clique no módulo pra inserir.', '…and click the cabinet to insert it.', '…y haga clic en el módulo para insertarlo.') }],
    'modulo-mover': [P.aba, P.temModulo,
      { el: CANVAS, text: T('Clique e arraste o móvel ao longo da parede. Com o Encaixe ligado ele para encostado no vizinho.',
        'Click and drag the cabinet along the wall. With Snap on, it stops against its neighbor.',
        'Haga clic y arrastre el mueble a lo largo de la pared. Con Encaje activado se detiene junto al vecino.') },
      { el: '#po-proj-collision-btn', text: T('Este é o botão do Encaixe (impede sobrepor).', 'This is the Snap button (prevents overlapping).', 'Este es el botón de Encaje (evita superponer).') }],
    'modulo-girar': [P.aba, P.temModulo,
      { el: CANVAS, text: T('Segure Shift e arraste o móvel pra girar — o ângulo aparece no canto do desenho enquanto gira.',
        'Hold Shift and drag the cabinet to rotate it — the angle shows in the corner of the drawing while rotating.',
        'Mantenga Shift y arrastre el mueble para girarlo — el ángulo aparece en la esquina del dibujo mientras gira.') }],
    'modulo-setas': [P.aba, P.temModulo, P.selecionar,
      { el: CANVAS, text: T('Com o móvel selecionado aparecem setas nos lados: arraste uma seta pra esticar ou encolher daquele lado. Dois cliques na seta esticam até encostar no vizinho ou na parede.',
        'With the cabinet selected, arrows appear on its sides: drag an arrow to stretch or shrink that side. Double-click an arrow to stretch until it touches the neighbor or wall.',
        'Con el mueble seleccionado aparecen flechas a los lados: arrastre una para estirar o encoger ese lado. Doble clic en la flecha estira hasta tocar al vecino o la pared.') }],
    'modulo-medida': [P.aba, P.temModulo, P.selecionar,
      { el: '#po-proj-config-panel', fallback: '#po-proj-cfg-toggle', text: T('No painel da direita ficam Largura, Altura e Profundidade. Digite a medida e o preço recalcula na hora.',
        'The right panel has Width, Height and Depth. Type the size and the price updates instantly.',
        'En el panel derecho están Ancho, Alto y Fondo. Escriba la medida y el precio se recalcula al instante.') }],
    'modulo-posicao': [P.aba, P.temModulo, P.selecionar,
      { el: '#po-proj-config-panel', fallback: '#po-proj-cfg-toggle', text: T('No painel da direita dá pra digitar a posição: distância até a parede/canto e altura do chão (aéreos).',
        'In the right panel you can type the position: distance to the wall/corner and height from the floor (wall cabinets).',
        'En el panel derecho puede escribir la posición: distancia a la pared/esquina y altura desde el piso (aéreos).') }],
    'modulo-duplicar': [P.aba, P.temModulo, P.selecionar,
      abrirModal('#po-proj-slot-duplicate-btn', '#po-proj-duplicate-modal', T('Clique em Duplicar (⧉).', 'Click Duplicate (⧉).', 'Haga clic en Duplicar (⧉).')),
      { el: '#po-proj-duplicate-modal .po-proj-duplicate-card, #po-proj-duplicate-modal', text: T('Escolha a direção e a quantidade de cópias e confirme.', 'Choose the direction and number of copies, then confirm.', 'Elija la dirección y la cantidad de copias y confirme.') }],
    'modulo-substituir': [P.aba, P.temModulo, P.selecionar,
      abrirModal('#po-proj-slot-replace-btn', '#po-proj-search-modal', T('Clique em Substituir (⇄).', 'Click Replace (⇄).', 'Haga clic en Reemplazar (⇄).')),
      { el: '#po-proj-search-modal-grid', text: T('Escolha o novo módulo: ele entra no lugar do antigo, com a mesma largura, altura, profundidade e posição.',
        'Choose the new cabinet: it takes the old one’s place with the same width, height, depth and position.',
        'Elija el nuevo módulo: ocupa el lugar del anterior con el mismo ancho, alto, fondo y posición.') }],
    'modulo-remover': [P.aba, P.temModulo, P.selecionar,
      { el: '#po-proj-slot-remove-btn', wait: 'click', text: T('Clique no ✕ pra remover o móvel. Se errar, Desfazer (↶) traz de volta.',
        'Click ✕ to remove the cabinet. If it was a mistake, Undo (↶) brings it back.',
        'Haga clic en ✕ para quitar el mueble. Si se equivoca, Deshacer (↶) lo devuelve.') }],
    'modulo-grupo': [P.aba, P.temModulo,
      { el: CANVAS, text: T('Segure Shift e arraste numa área vazia do desenho: forma uma janela de seleção e pega todos os móveis dentro dela.',
        'Hold Shift and drag over an empty area of the drawing: a selection box picks every cabinet inside it.',
        'Mantenga Shift y arrastre en un área vacía del dibujo: se forma una ventana de selección que toma todos los muebles dentro.') }],
    'modulo-novo': [P.aba,
      abrirModal('#po-proj-new-module-btn', '#po-nm-modal', T('Clique em Novo módulo.', 'Click New cabinet.', 'Haga clic en Nuevo módulo.')),
      { el: '#po-nm-grid, #po-nm-body', text: T('Escolha a base: com fundo ou sem fundo.', 'Choose the base: with or without back.', 'Elija la base: con fondo o sin fondo.') },
      { el: '#po-nm-vista, #po-nm-body', text: T('Ajuste largura, altura e profundidade (clique nas cotas do desenho pra digitar).',
        'Set width, height and depth (click the dimensions on the drawing to type).',
        'Ajuste ancho, alto y fondo (haga clic en las cotas del dibujo para escribir).') },
      { el: '#po-nm-ok-medidas', wait: 'click', text: T('Clique no OK verde pra ir pros internos.', 'Click the green OK to go to the interior.', 'Haga clic en el OK verde para ir a los interiores.') },
      { el: '#po-proj-builder-stage, #po-nm-body', text: T('Agora clique num vão do desenho e escolha o que colocar (portas, gavetas, prateleiras…).',
        'Now click a space in the drawing and choose what to add (doors, drawers, shelves…).',
        'Ahora haga clic en un hueco del dibujo y elija qué colocar (puertas, cajones, estantes…).') },
      { el: '#po-proj-builder-save, #po-nm-foot', wait: () => !achar('#po-nm-modal') && !achar('#po-proj-builder-modal'),
        text: T('Clique no OK/Salvar verde e o móvel é criado no ambiente.', 'Click the green OK/Save and the cabinet is created in the room.', 'Haga clic en el OK/Guardar verde y el mueble se crea en el ambiente.') }],
    'projeto-ia': [P.aba,
      abrirModal('#po-proj-ai-open-btn', '#po-proj-ai-modal', T('Clique em Gerar com IA.', 'Click Generate with AI.', 'Haga clic en Generar con IA.')),
      { el: '#po-proj-ai-questions, #po-proj-ai-form', text: T('Responda as perguntas…', 'Answer the questions…', 'Responda las preguntas…') },
      { el: '#po-proj-ai-run-btn', wait: 'click', text: T('…e clique em Gerar. A IA monta uma 1ª versão na parede que você já mediu; depois é só ajustar arrastando.',
        '…and click Generate. The AI builds a first version on the wall you measured; then adjust by dragging.',
        '…y haga clic en Generar. La IA arma una 1ª versión en la pared medida; luego ajuste arrastrando.') }],

    // ---------------- CONSTRUTOR ----------------
    'construtor-abrir': construtor([P.construtorVao,
      { el: '#po-proj-builder-lib', text: T('Esta lista mostra o que cabe no vão escolhido: divisórias, prateleiras, portas, gavetas, acessórios. Clique num item (ou arraste até o vão) pra inserir. Clicar numa peça no desenho tira ela.',
        'This list shows what fits the chosen space: dividers, shelves, doors, drawers, accessories. Click an item (or drag it onto the space) to insert. Clicking a part in the drawing removes it.',
        'Esta lista muestra lo que cabe en el hueco elegido: divisiones, estantes, puertas, cajones, accesorios. Haga clic en un elemento (o arrástrelo) para insertarlo. Hacer clic en una pieza del dibujo la quita.') },
      { el: '#po-proj-builder-undo', text: T('Errou? Desfazer volta o último passo.', 'Made a mistake? Undo reverts the last step.', '¿Se equivocó? Deshacer revierte el último paso.') }]),
    'construtor-portas': construtor([P.construtorVao, itemPasso((n) => /porta|door|puerta/.test(n), T('Porta', 'Door', 'Puerta'))]),
    'construtor-gavetas': construtor([P.construtorVao, itemPasso((n) => /gaveta|drawer|cajon/.test(n), T('Gaveta', 'Drawer', 'Cajón'))]),
    'construtor-prateleira': construtor([P.construtorVao, itemPasso(ehPrateleiraFixa, T('Prateleira', 'Shelf', 'Estante'))]),
    'construtor-prateleira-regulavel': construtor([P.construtorVao, itemPasso((n) => /regul|adjust/.test(n), T('Prateleira regulável', 'Adjustable shelf', 'Estante regulable')),
      { el: '#po-proj-builder-stage', text: T('A regulável vem com os furos de pino nas laterais e o kit de suportes entra sozinho no preço e na lista de compra.',
        'The adjustable shelf comes with pin holes in the sides, and the support kit is added to the price and shopping list automatically.',
        'La regulable viene con los agujeros de pines en los laterales y el kit de soportes entra solo en el precio y la lista de compra.') }]),
    'construtor-divisoria': construtor([P.construtorVao, itemPasso((n) => /divis|divider/.test(n), T('Divisória', 'Divider', 'División')),
      { el: '#po-proj-builder-stage', text: T('Pra partes iguais, use a quantidade (setinhas no card) antes de inserir: 2 divisórias = 3 vãos iguais. Clique na medida de um vão pra digitar um valor exato.',
        'For equal parts, set the quantity (arrows on the card) before inserting: 2 dividers = 3 equal spaces. Click a space’s dimension to type an exact value.',
        'Para partes iguales, use la cantidad (flechitas en la tarjeta) antes de insertar: 2 divisiones = 3 huecos iguales. Haga clic en la medida de un hueco para escribir un valor exacto.') }]),
    'construtor-cabideiro': construtor([P.construtorVao, itemPasso((n) => /cabid|cabide|closet rod|\brod\b|barra|colgar/.test(n), T('Cabideiro', 'Closet rod', 'Barral'))]),
    'construtor-acessorios': construtor([P.construtorVao, itemPasso((n) => /cesto|basket|aramad|acess/.test(n), T('o acessório', 'the accessory', 'el accesorio'))]),
    'construtor-trocar-porta': construtor([P.construtorVao,
      { el: '#po-proj-builder-stage', text: T('Pra trocar o modelo: clique na porta atual no desenho pra tirá-la…', 'To change the style: click the current door in the drawing to remove it…', 'Para cambiar el modelo: haga clic en la puerta actual del dibujo para quitarla…') },
      { el: '#po-proj-builder-lib', text: T('…e clique no novo modelo de porta na lista (vidro, lisa, shaker…).', '…then click the new door style in the list (glass, slab, shaker…).', '…y haga clic en el nuevo modelo de puerta en la lista (vidrio, lisa, shaker…).') }]),
    'construtor-lado-porta': construtor([
      { el: '#po-proj-builder-stage', text: T('No desenho, em cima da porta, há os controles dela: o do lado de abertura troca esquerda ↔ direita, e o de folhas troca 1 ↔ 2 folhas.',
        'In the drawing, on the door, there are its controls: the hinge side one switches left ↔ right, and the leaves one switches 1 ↔ 2 doors.',
        'En el dibujo, sobre la puerta, están sus controles: el de lado de apertura cambia izquierda ↔ derecha, y el de hojas cambia 1 ↔ 2 hojas.') }]),
    'construtor-apagar': construtor([
      { el: '#po-proj-builder-stage', text: T('Clique direto na peça que quer tirar (prateleira, porta, gaveta) — ela sai na hora.',
        'Click directly on the part you want to remove (shelf, door, drawer) — it goes away right away.',
        'Haga clic directamente en la pieza que quiere quitar (estante, puerta, cajón) — sale al instante.') },
      { el: '#po-proj-builder-undo', text: T('Desfazer volta o último passo, se tirar algo sem querer.', 'Undo brings back the last step if you removed something by accident.', 'Deshacer revierte el último paso si quitó algo sin querer.') }]),
    'construtor-trocar-gaveta': [P.aba, P.temModulo, P.selecionar,
      { el: '#po-proj-config-panel', fallback: '#po-proj-cfg-toggle', text: T('No painel da direita, no cartão da gaveta, escolha o modelo (ex.: Hardwood Dovetail). Muda só o caixote; frente e corrediça continuam.',
        'In the right panel, on the drawer card, choose the model (e.g. Hardwood Dovetail). Only the box changes; front and slide stay.',
        'En el panel derecho, en la tarjeta del cajón, elija el modelo (ej.: Hardwood Dovetail). Solo cambia la caja; frente y corredera siguen.') }],

    // ---------------- LED ----------------
    'led-embutido': [P.aba, P.temModulo, P.selecionar,
      abrirModal('#po-proj-slot-led-btn', '#po-led-modal', T('Clique em LED na barrinha do móvel.', 'Click LED on the cabinet’s button bar.', 'Haga clic en LED en la barrita del mueble.')),
      { el: '#po-led-pieces', text: T('Escolha a peça que recebe o LED: prateleira, lateral, tampo, fundo, rodapé…', 'Choose the part that gets the LED: shelf, side, top, back, toe kick…', 'Elija la pieza que lleva el LED: estante, lateral, tapa, fondo, zócalo…') },
      { el: pai('[data-i18n="led.model_label"]'), text: T('Modelo do perfil: define a largura e a profundidade do rasgo.', 'Profile model: sets the width and depth of the groove.', 'Modelo del perfil: define el ancho y la profundidad de la ranura.') },
      { el: pai('[data-i18n="led.face_label"]'), text: T('Face: Top (em cima) ou Under (embaixo — ex.: luz embaixo do aéreo). Em seguida escolha horizontal ou vertical.',
        'Face: Top or Under (e.g. light under a wall cabinet). Then choose horizontal or vertical.',
        'Cara: Top (arriba) o Under (abajo — ej.: luz bajo el aéreo). Luego elija horizontal o vertical.') },
      { el: '#po-led-pos', text: T('Posição: em prateleira, base, tampo e lateral é a distância da FRENTE (o 1º LED nasce a 50 mm da frente). Ajuste também as margens das pontas — o tracejado na vista 2D mostra o rasgo e dá pra arrastar com o mouse.',
        'Position: on shelves, bottoms, tops and sides it is the distance from the FRONT (the 1st LED starts 50 mm from the front). Also set the end margins — the dashed line in the 2D view shows the groove and can be dragged with the mouse.',
        'Posición: en estante, base, tapa y lateral es la distancia al FRENTE (el 1er LED nace a 50 mm del frente). Ajuste también los márgenes de las puntas — el trazo en la vista 2D muestra la ranura y se puede arrastrar con el ratón.') },
      { el: '#po-led-lines', text: T('Precisa de mais de um LED na peça? “+ LED” cria outro, já andando da frente pro fundo.',
        'Need more than one LED on the part? “+ LED” adds another one, moving from the front toward the back.',
        '¿Necesita más de un LED en la pieza? “+ LED” crea otro, avanzando del frente hacia el fondo.') },
      { el: '#po-led-conflitos', skipIf: () => !achar('#po-led-conflitos'), text: T('Aviso amarelo: o rasgo passa em cima de uma ferragem (minifix, corrediça…). Não trava — mas vale mudar a posição pra não dar problema na produção.',
        'Yellow warning: the groove runs over hardware (cam lock, slide…). It does not block you — but consider moving it to avoid production problems.',
        'Aviso amarillo: la ranura pasa sobre un herraje (minifix, corredera…). No bloquea — pero conviene mover la posición para evitar problemas en producción.') },
      { el: '#po-led-apply-btn', wait: 'click', text: T('Clique em Aplicar LED. Vira rasgo na furação, entra no preço (usinagem por metro) e aparece aceso no 3D e no render. Pra tirar: “Remover todos os LEDs desta peça”.',
        'Click Apply LED. It becomes a groove in the machining, is priced (per meter) and shows lit in 3D and renders. To remove: “Remove all LEDs from this part”.',
        'Haga clic en Aplicar LED. Se vuelve ranura en el mecanizado, entra en el precio (por metro) y aparece encendido en 3D y render. Para quitar: “Quitar todos los LED de esta pieza”.') },
      { el: '#po-led-dup-btn', skipIf: () => !achar('#po-led-dup-btn'), text: T('Atalho: “Duplicar em N peça(s) igual(is)” copia esses LEDs pras peças do mesmo tipo e mesma medida deste móvel (ex.: todas as prateleiras). Na lateral direita o rasgo vai pro lado de dentro, igual na esquerda.',
        'Shortcut: “Duplicate to N identical part(s)” copies these LEDs to the parts of this cabinet with the same type and size (e.g. all shelves). On the right side the groove goes to the inside, same as the left.',
        'Atajo: “Duplicar en N pieza(s) igual(es)” copia estos LED a las piezas del mismo tipo y medida de este mueble (ej.: todas las estantes). En el lateral derecho la ranura va hacia adentro, igual que en el izquierdo.') }],

    'led-duplicar': [P.aba, P.temModulo, P.selecionar,
      abrirModal('#po-proj-slot-led-btn', '#po-led-modal', T('Clique em LED na barrinha do móvel.', 'Click LED on the cabinet’s button bar.', 'Haga clic en LED en la barrita del mueble.')),
      { el: '#po-led-pieces', text: T('Escolha uma peça e aplique o LED nela (as que já têm LED mostram o selo LED).',
        'Pick a part and apply the LED to it (parts that already have LED show the LED badge).',
        'Elija una pieza y aplíquele el LED (las que ya tienen LED muestran la etiqueta LED).') },
      { el: '#po-led-dup-btn', fallback: '#po-led-apply-btn', text: T('Depois de aplicado, aparece “Duplicar em N peça(s) igual(is)”: copia os LEDs pras peças do mesmo tipo e mesma medida deste móvel (lateral esquerda e direita contam como iguais). Se o botão não aparece, ainda não tem LED aplicado ou não existe peça igual.',
        'Once applied, “Duplicate to N identical part(s)” appears: it copies the LEDs to the parts of this cabinet with the same type and size (left and right sides count as identical). If the button does not show, no LED is applied yet or there is no identical part.',
        'Después de aplicado aparece “Duplicar en N pieza(s) igual(es)”: copia los LED a las piezas del mismo tipo y medida de este mueble (lateral izquierdo y derecho cuentan como iguales). Si el botón no aparece, aún no hay LED aplicado o no existe pieza igual.') }],

    // ---------------- PEÇAS / PAINÉIS ----------------
    'tamponamento': [P.aba, P.temModulo, P.selecionar,
      { el: '#po-proj-slot-tamp-btn, #po-proj-group-toolbar', skipIf: aberto('#po-tamp-modal'), wait: '#po-tamp-modal',
        text: T('Clique em Tamponamento. (Com vários móveis selecionados, use o Tamponamento da barra do grupo.)',
          'Click End panels. (With several cabinets selected, use End panels on the group bar.)',
          'Haga clic en Paneles. (Con varios muebles seleccionados, use Paneles en la barra del grupo.)') },
      { el: '#po-tamp-view', text: T('Vista frontal do móvel. Clique dos lados pra pôr painel lateral, em cima/embaixo pra tampo; clique num painel pra tirar. Lateral = altura do móvel e profundidade + 25 mm; tampo = 1 mm a mais de cada lado e cobre as laterais.',
        'Front view of the cabinet. Click the sides for a side panel, top/bottom for a top panel; click a panel to remove it. Side = cabinet height, depth + 25 mm; top = 1 mm extra each side and covers the sides.',
        'Vista frontal del mueble. Haga clic a los lados para panel lateral, arriba/abajo para tapa; clic en un panel para quitarlo. Lateral = altura del mueble y fondo + 25 mm; tapa = 1 mm más por lado y cubre los laterales.') },
      { el: '#po-tamp-done', wait: fechado('#po-tamp-modal'), text: T('Clique em Pronto.', 'Click Done.', 'Haga clic en Listo.') }],
    'pecas-movel': [P.aba, P.temModulo, P.selecionar,
      abrirModal('#po-proj-slot-pieces-btn', '#po-pieces-modal', T('Clique em Peças (▤).', 'Click Parts (▤).', 'Haga clic en Piezas (▤).')),
      { el: '#po-pieces-list', text: T('Esta é a lista de corte deste móvel, pra conferir antes de produzir.', 'This is the cut list for this cabinet, to check before production.', 'Esta es la lista de corte de este mueble, para revisar antes de producir.') },
      { el: '#po-pieces-explode', text: T('Este botão afasta as peças no 3D (vista explodida).', 'This button spreads the parts apart in 3D (exploded view).', 'Este botón separa las piezas en 3D (vista explotada).') }],
    'peca-remover': [P.aba, P.temModulo,
      { el: CANVAS, wait: '#po-proj-piece-toolbar', text: T('Dê dois cliques rápidos na peça do móvel (ex.: uma lateral ou o fundo) no desenho 3D.',
        'Double-click the cabinet part (e.g. a side or the back) in the 3D drawing.',
        'Haga doble clic rápido en la pieza del mueble (ej.: un lateral o el fondo) en el dibujo 3D.') },
      { el: '#po-proj-piece-toolbar [data-acao="remover"]', wait: 'click', text: T('Clique na lixeira pra remover a peça (ou tecle Delete). Desfazer (↶) traz de volta.',
        'Click the trash can to remove the part (or press Delete). Undo (↶) brings it back.',
        'Haga clic en la papelera para quitar la pieza (o pulse Supr). Deshacer (↶) la devuelve.') }],

    // ---------------- VISUALIZAÇÃO ----------------
    'mapa-calor': [P.aba, P.temModulo,
      { el: '#po-proj-heatmap-btn', fallback: '#po-proj-dd-budget-btn', wait: 'click', text: T('O Mapa de calor fica no menu Orçamento ($). Clique nele.',
        'The Heat map is in the Budget ($) menu. Click it.',
        'El Mapa de calor está en el menú Presupuesto ($). Haga clic en él.') },
      { el: '#po-proj-heatmap-list', text: T('Escolha o modo: por área ($/ft² de frente — verde barato, vermelho caro), % do total do projeto, ou cores × linha (caixa, portas, painéis). Pra desligar: Desligado.',
        'Choose a mode: by area ($/ft² of front — green cheap, red expensive), % of the project total, or colors × line (box, doors, panels). To turn it off: Off.',
        'Elija el modo: por área ($/ft² de frente — verde barato, rojo caro), % del total del proyecto, o colores × línea (caja, puertas, paneles). Para apagarlo: Apagado.') }],
    'fixar-barra': [P.aba,
      { el: '#po-proj-pin-toolbar-btn', text: T('Clique no alfinete pra travar a barra: ao rolar a página ela fica grudada no topo, e as colunas de módulos e do painel acompanham. Clique de novo pra soltar.',
        'Click the pin to lock the toolbar: when you scroll it stays stuck at the top, and the cabinet list and side panel follow. Click again to release it.',
        'Haga clic en el alfiler para fijar la barra: al desplazar queda pegada arriba, y las columnas de módulos y del panel acompañan. Clic de nuevo para soltarla.') },
      { el: '#po-proj-pin-toolbar-btn', text: T('Quando uma janela abre por cima (Paredes, LED, Peças, Orçamento…), a barra fixa se esconde pra não ficar na frente dela — e volta sozinha quando você fecha a janela.',
        'When a window opens on top (Walls, LED, Parts, Budget…), the pinned toolbar hides so it does not cover it — and comes back by itself when you close the window.',
        'Cuando una ventana se abre encima (Paredes, LED, Piezas, Presupuesto…), la barra fija se oculta para no taparla — y vuelve sola al cerrar la ventana.') }],
    'modulo-ima-canto': [P.aba, P.temModulo,
      { el: CANVAS, text: T('Arraste o módulo em direção ao canto. Quando ele chega perto do módulo da outra parede, o ímã encosta os dois sozinho — em qualquer ângulo de canto, contando também o Painel Fixo do canto cego.',
        'Drag the cabinet toward the corner. When it gets close to the cabinet on the other wall, the magnet snaps them together — at any corner angle, including the Fixed Panel of a blind corner.',
        'Arrastre el módulo hacia la esquina. Cuando se acerca al módulo de la otra pared, el imán los junta solo — en cualquier ángulo de esquina, contando también el Panel Fijo de la esquina ciega.') }],
    'modulo-canto-cego': [P.aba,
      abrirModal('#po-proj-library-search-btn', '#po-proj-search-modal', T('Clique em + Módulo.', 'Click + Cabinet.', 'Haga clic en + Módulo.')),
      { el: '#po-proj-search-modal', text: T('Digite “blind” na busca e escolha o módulo de canto cego. Ele já vem com o Painel Fixo cobrindo o vão cego e a travessa vertical (stretcher) na frente.',
        'Type “blind” in the search and pick the blind corner cabinet. It already comes with the Fixed Panel covering the blind space and the vertical stretcher at the front.',
        'Escriba “blind” en la búsqueda y elija el módulo de esquina ciega. Ya viene con el Panel Fijo cubriendo el hueco ciego y el travesaño vertical (stretcher) al frente.') },
      { el: CANVAS, text: T('Coloque no canto e arraste até o módulo da outra parede — o ímã encosta, e o Painel Fixo conta na colisão.',
        'Place it in the corner and drag it up to the cabinet on the other wall — the magnet snaps it, and the Fixed Panel counts for collision.',
        'Colóquelo en la esquina y arrástrelo hasta el módulo de la otra pared — el imán lo junta, y el Panel Fijo cuenta en la colisión.') }],
    'camadas': [P.aba,
      { el: '#po-proj-layers-menu', text: T('Em Camadas você liga/desliga grupos inteiros (portas, decoração, estruturas…).', 'In Layers you turn whole groups on/off (doors, decoration, structures…).', 'En Capas activa/desactiva grupos enteros (puertas, decoración, estructuras…).') },
      { el: '#po-proj-tb-ocultar-btn', text: T('Este esconde o que estiver selecionado…', 'This one hides whatever is selected…', 'Este oculta lo que esté seleccionado…') },
      { el: '#po-proj-tb-mostrar-btn', text: T('…e este mostra tudo de novo.', '…and this one shows everything again.', '…y este muestra todo de nuevo.') }],
    'vista-camera': [P.aba,
      { el: CANVAS, text: T('Arraste numa área vazia pra girar a vista e use a roda do mouse (ou pinça no iPad) pra aproximar.',
        'Drag on an empty area to orbit the view and use the mouse wheel (or pinch on iPad) to zoom.',
        'Arrastre en un área vacía para girar la vista y use la rueda del ratón (o pellizco en iPad) para acercar.') },
      { el: '#po-proj-fit-btn', text: T('Se perder o desenho, este botão enquadra tudo de novo.', 'If you lose the drawing, this button frames everything again.', 'Si pierde el dibujo, este botón encuadra todo de nuevo.') }],
    'plano-tecnico': [P.aba, P.temModulo,
      { el: '#po-proj-techplan-btn', wait: 'click', text: T('Clique em Plano técnico: gera a vista cotada de cada parede que tem móvel e a planta baixa — com e sem portas.',
        'Click Technical plan: it generates a dimensioned view of each wall with cabinets plus the floor plan — with and without doors.',
        'Haga clic en Plano técnico: genera la vista acotada de cada pared con muebles y la planta — con y sin puertas.') },
      { el: '#po-techplan-status', fallback: CANVAS, text: T('Acompanhe o andamento aqui. Quando terminar, as pranchas ficam prontas pra baixar.',
        'Follow the progress here. When it finishes, the sheets are ready to download.',
        'Siga el avance aquí. Al terminar, las láminas quedan listas para descargar.') }],

    // ---------------- RENDER ----------------
    'render': [P.aba,
      { el: '#po-proj-render-linhas-btn', text: T('Ligue a marcação da área da foto e gire/aproxime o 3D até enquadrar o que quer na imagem.',
        'Turn on the photo area marker and orbit/zoom the 3D until the framing is right.',
        'Active la marca del área de la foto y gire/acerque el 3D hasta encuadrar lo que quiere.') },
      { el: '#po-proj-render-btn', wait: 'click', text: T('Clique em Gerar foto realista e aguarde.', 'Click Generate photo-realistic image and wait.', 'Haga clic en Generar foto realista y espere.') },
      { el: '#po-proj-photoreal-gallery-wrap', fallback: '#po-proj-photoreal-gallery', text: T('As fotos geradas ficam aqui, embaixo do projeto, pra baixar ou pôr na proposta.',
        'Generated images appear here, below the project, to download or add to the proposal.',
        'Las fotos generadas quedan aquí, debajo del proyecto, para descargar o poner en la propuesta.') }],

    // ---------------- PREÇO ----------------
    'preco-fabrica': [P.aba,
      abrirModal('#po-proj-money-tb-btn', '#po-money-modal', T('Clique no $ (Orçamento).', 'Click $ (Budget).', 'Haga clic en $ (Presupuesto).')),
      { el: '#po-money-modal > div, #po-money-modal', text: T('Aqui está o orçamento: custo de fábrica por módulo, itens comprados e total. Pra ver um móvel só, selecione ele e use o $ da barrinha dele.',
        'Here is the budget: factory cost per cabinet, purchased items and total. To see one cabinet only, select it and use the $ on its bar.',
        'Aquí está el presupuesto: costo de fábrica por módulo, artículos comprados y total. Para ver un solo mueble, selecciónelo y use el $ de su barrita.') }],
    'preco-cliente': [
      abrirModal('#po-margins-btn', '#po-margins-modal', T('Clique em Margens (no topo) pra definir desconto de fábrica e sua margem.',
        'Click Margins (top bar) to set the factory discount and your margin.',
        'Haga clic en Márgenes (arriba) para definir el descuento de fábrica y su margen.')),
      { el: '#po-margins-body', text: T('Com a margem configurada, os preços do portal já aparecem como preço de venda pro seu cliente.',
        'With your margin set, portal prices show as the selling price for your client.',
        'Con el margen configurado, los precios del portal aparecen como precio de venta a su cliente.') },
      P.aba,
      { el: '#po-proj-proposal-btn', text: T('Pra entregar ao cliente, gere a Proposta: PDF com imagens, módulos e preço final.',
        'To hand it to the client, generate the Proposal: a PDF with images, cabinets and final price.',
        'Para entregar al cliente, genere la Propuesta: PDF con imágenes, módulos y precio final.') }],
    'proposta': [P.aba,
      { el: '#po-proj-proposal-btn', wait: 'click', text: T('Clique em Proposta: monta o PDF pro cliente com imagens, módulos e preço.',
        'Click Proposal: it builds the client PDF with images, cabinets and price.',
        'Haga clic en Propuesta: arma el PDF para el cliente con imágenes, módulos y precio.') }],
    'enviar-pedido': [P.aba,
      { el: '#po-proj-toolbar-save-btn', text: T('Salve o projeto antes.', 'Save the project first.', 'Guarde el proyecto antes.') },
      { el: '#po-proj-send-to-order-btn', wait: 'click', text: T('Clique em Enviar pro pedido: os módulos vão pro pedido da fábrica.', 'Click Send to order: the cabinets go to the factory order.', 'Haga clic en Enviar al pedido: los módulos van al pedido de fábrica.') }]
  };

  // ==========================================================================
  // BUSCA LOCAL
  // ==========================================================================
  const PARADAS = new Set(('como como que qual quais onde quando eu meu minha meus o a os as um uma uns umas de do da dos das no na nos nas em ' +
    'pra pro pros pras para por pelo pela e ou se com sem faco fazer faz posso consigo tem ter ja ' +
    'how do does i my me the a an to in on of for can is it what where which with and or ' +
    'el la los las un una de del en mi mis por para que como donde cual hago puedo es y o con').split(/\s+/));
  function tokens(s) {
    return norm(s).replace(/[^a-z0-9.]+/g, ' ').split(' ').filter((w) => w && w.length > 1 && !PARADAS.has(w));
  }
  const INDICE = HELPER_PERGUNTAS.map((q) => ({
    q,
    toks: new Set(tokens([q.pt, q.en, q.es, q.kw].join(' ')))
  }));
  function buscar(texto) {
    const qt = tokens(texto);
    if (!qt.length) return [];
    const res = [];
    INDICE.forEach((ix) => {
      let score = 0, achou = 0;
      qt.forEach((w) => {
        if (ix.toks.has(w)) { score += 3; achou++; return; }
        if (w.length < 4) return;
        for (const h of ix.toks) {
          if (h.length >= 4 && (h.startsWith(w) || w.startsWith(h) || (w.length >= 5 && h.length >= 5 && h.slice(0, 5) === w.slice(0, 5)))) { score += 2; achou++; return; }
        }
      });
      if (!score) return;
      // pergunta no idioma atual que casa quase inteira ganha um empurrão
      score += achou / qt.length;
      res.push({ q: ix.q, score, cobertura: achou / qt.length });
    });
    return res.sort((a, b) => b.score - a.score).slice(0, 7);
  }

  // ==========================================================================
  // TOUR
  // ==========================================================================
  let tour = null;   // { steps, i, meta, enterAt, alvo, manual }
  let hl = null, pop = null, raf = null;

  function garanteOverlay() {
    if (!hl) { hl = document.createElement('div'); hl.className = 'po-hlp-hl'; document.body.appendChild(hl); }
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'po-hlp-pop';
      pop.addEventListener('click', onPopClick);
      document.body.appendChild(pop);
    }
  }
  function iniciarTour(steps, meta) {
    pararTour();
    if (!steps || !steps.length) return;
    garanteOverlay();
    // cópia rasa: onEnter guarda estado no passo, não pode vazar entre tours
    tour = { steps: steps.map((s) => Object.assign({}, s)), i: -1, meta: meta || {} };
    irPara(0, 1);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function pararTour() {
    tour = null;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    if (hl) hl.style.display = 'none';
    if (pop) pop.style.display = 'none';
  }
  function seguro(fn, arg) { try { return fn(arg); } catch (e) { return false; } }
  function irPara(i, dir) {
    if (!tour) return;
    const steps = tour.steps;
    while (i >= 0 && i < steps.length && steps[i].skipIf && seguro(steps[i].skipIf, steps[i])) i += (dir || 1);
    if (i >= steps.length) { concluir(); return; }
    if (i < 0) return;   // voltou além do 1º passo que vale: fica onde está
    tour.i = i;
    tour.enterAt = Date.now();
    tour.manual = dir < 0;   // voltou: não avança sozinho até clicar em Próximo
    tour.alvo = null;
    const st = steps[i];
    if (st.onEnter) seguro(st.onEnter, st);
    tour.rolou = false;
    renderPop();
  }
  function avancar() { if (tour) irPara(tour.i + 1, 1); }
  function concluir() {
    if (!tour) return;
    tour.fim = true;
    if (hl) hl.style.display = 'none';
    pop.innerHTML = '<div class="po-hlp-pop-head"><strong>' + esc(t('helper.done_title')) + '</strong>'
      + '<button type="button" class="po-hlp-x" data-hlp="fechar" aria-label="' + esc(t('helper.close')) + '">&times;</button></div>'
      + '<p class="po-hlp-pop-text">' + esc(t('helper.done_text')) + '</p>'
      + '<div class="po-hlp-pop-btns"><button type="button" class="secondary" data-hlp="fechar">' + esc(t('helper.close')) + '</button>'
      + '<button type="button" data-hlp="outra">' + esc(t('helper.another')) + '</button></div>';
    pop.style.display = 'block';
    centralizar();
  }
  function renderPop() {
    const st = tour.steps[tour.i];
    // contagem só dos passos que valem agora (os pulados, ex. "abra a aba
    // Projetos" quando já está nela, não entram no "Passo X de Y")
    const vale = (s, j) => j === tour.i || !(s.skipIf && seguro(s.skipIf, s));
    const total = tour.steps.filter(vale).length;
    const n = tour.steps.slice(0, tour.i + 1).filter((s, j) => vale(s, j)).length;
    const espera = !!st.wait;

    const art = tour.meta.q && tour.meta.q.artigo;
    const titulo = tour.meta.titulo || (tour.meta.q ? tx(tour.meta.q) : '');
    pop.innerHTML = '<div class="po-hlp-pop-head"><span class="po-hlp-step">' + esc(t('helper.step_of', { n, total })) + '</span>'
      + '<button type="button" class="po-hlp-x" data-hlp="fechar" aria-label="' + esc(t('helper.close')) + '">&times;</button></div>'
      + (titulo ? '<div class="po-hlp-pop-title">' + esc(titulo) + '</div>' : '')
      + '<p class="po-hlp-pop-text">' + esc(tx(st.text)) + '</p>'
      + (espera ? '<p class="po-hlp-pop-wait">' + esc(t('helper.waiting')) + '</p>' : '')
      + '<p class="po-hlp-pop-miss" style="display:none;">' + esc(t('helper.missing')) + '</p>'
      + '<div class="po-hlp-pop-btns">'
      + (n > 1 ? '<button type="button" class="secondary" data-hlp="voltar">' + esc(t('helper.back')) + '</button>' : '')
      + (art ? '<button type="button" class="secondary" data-hlp="artigo">' + esc(t('helper.read_article')) + '</button>' : '')
      + '<button type="button" data-hlp="proximo">' + esc(n === total ? t('helper.finish') : (espera ? t('helper.skip') : t('helper.next'))) + '</button>'
      + '</div>';
    pop.style.display = 'block';
  }
  function onPopClick(ev) {
    const b = ev.target.closest('[data-hlp]');
    if (!b) return;
    const a = b.getAttribute('data-hlp');
    if (a === 'fechar') pararTour();
    else if (a === 'proximo') avancar();
    else if (a === 'voltar') irPara(tour.i - 1, -1);
    else if (a === 'artigo') { const art = tour.meta.q && tour.meta.q.artigo; pararTour(); abrirArtigo(art); }
    else if (a === 'outra') { pararTour(); abrirHelper(); }
  }
  function loop() {
    raf = requestAnimationFrame(loop);
    if (!tour || tour.fim) return;
    const st = tour.steps[tour.i];
    let el = achar(st.el);
    if (!el && st.fallback) el = achar(st.fallback);
    tour.alvo = el;
    if (el && !tour.rolou) {
      tour.rolou = true;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
        try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) { /* ok */ }
      }
    }
    posicionar(el);
    const miss = pop.querySelector('.po-hlp-pop-miss');
    if (miss) miss.style.display = (!el && Date.now() - tour.enterAt > 1500) ? 'block' : 'none';
    if (tour.manual || Date.now() - tour.enterAt < 350) return;
    if (typeof st.wait === 'function' && seguro(st.wait, st)) avancar();
    else if (typeof st.wait === 'string' && st.wait !== 'click' && achar(st.wait)) avancar();
  }
  function posicionar(el) {
    const M = 12, W = Math.min(320, innerWidth - 2 * M);
    pop.style.width = W + 'px';
    if (!el) { hl.style.display = 'none'; centralizar(); return; }
    const r = el.getBoundingClientRect();
    const pad = 6;
    hl.style.display = 'block';
    hl.style.left = (r.left - pad) + 'px';
    hl.style.top = (r.top - pad) + 'px';
    hl.style.width = (r.width + 2 * pad) + 'px';
    hl.style.height = (r.height + 2 * pad) + 'px';
    const ph = pop.offsetHeight || 160;
    let top, left;
    if (r.bottom + pad + 10 + ph < innerHeight - M) top = r.bottom + pad + 10;
    else if (r.top - pad - 10 - ph > M) top = r.top - pad - 10 - ph;
    else top = Math.max(M, Math.min(innerHeight - ph - M, r.top + r.height / 2 - ph / 2));
    // alvo enorme (o desenho inteiro): balão por dentro, no canto de cima
    if (r.height > innerHeight * 0.6 && r.width > innerWidth * 0.5) top = Math.max(M, r.top + 16);
    left = r.left + r.width / 2 - W / 2;
    if (top > r.top - 10 && top < r.bottom && !(r.height > innerHeight * 0.6 && r.width > innerWidth * 0.5)) {
      // ficou do lado (não coube em cima nem embaixo): encosta ao lado do alvo
      left = (r.right + 14 + W < innerWidth - M) ? r.right + 14 : r.left - 14 - W;
    }
    left = Math.max(M, Math.min(innerWidth - W - M, left));
    pop.style.left = left + 'px';
    pop.style.top = Math.max(M, top) + 'px';
  }
  function centralizar() {
    const W = Math.min(320, innerWidth - 24);
    pop.style.width = W + 'px';
    pop.style.left = Math.max(12, (innerWidth - W) / 2) + 'px';
    pop.style.top = Math.max(12, innerHeight * 0.28) + 'px';
  }
  // Clique no elemento destacado → avança (capture: roda antes do
  // stopPropagation dos botões do canvas; o app trata o clique normalmente).
  document.addEventListener('click', (ev) => {
    if (!tour || tour.fim || !tour.alvo) return;
    const st = tour.steps[tour.i];
    if (st.wait !== 'click') return;
    if (pop && pop.contains(ev.target)) return;
    if (tour.alvo.contains(ev.target)) {
      const i = tour.i;
      setTimeout(() => { if (tour && tour.i === i) avancar(); }, 250);
    }
  }, true);
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (tour) { pararTour(); return; }
    const m = document.getElementById('po-hlp-modal');
    if (m && m.classList.contains('open')) fecharHelper();
  });
  window.addEventListener('resize', () => { if (tour) tour.rolou = false; });

  // ---- tour de uma pergunta ----
  function passosDaPergunta(q) {
    const pronto = HELPER_TOURS[q.tour];
    if (pronto) return pronto;
    if (!q.alvo) return null;
    const passos = [];
    const alvoEl = $(q.alvo);
    if (alvoEl && alvoEl.closest('#po-tab-projects')) passos.push(P.aba);
    passos.push({
      el: q.alvo,
      text: T(t('helper.generic_step', { q: q.pt }), t('helper.generic_step', { q: q.en }), t('helper.generic_step', { q: q.es }))
    });
    return passos;
  }
  function rodarPergunta(q) {
    fecharHelper();
    const passos = passosDaPergunta(q);
    if (passos) { iniciarTour(passos, { q }); return; }
    if (q.artigo) { abrirArtigo(q.artigo); return; }
    abrirCentral(tx(q));
  }

  // ---- Central de Ajuda (portal-12-ajuda.js) ----
  function abrirArtigo(artId) {
    if (typeof openHelpModal !== 'function') return;
    let catId = null;
    try {
      (helpCategories() || []).some((c) => (c.articles || []).some((a) => (a.id === artId ? (catId = c.id, true) : false)));
    } catch (e) { /* ok */ }
    openHelpModal(catId, artId);
  }
  function abrirCentral(busca) {
    if (typeof openHelpModal !== 'function') return;
    openHelpModal();
    const inp = document.getElementById('po-help-search-input');
    if (inp && busca) {
      inp.value = busca;
      if (typeof runHelpSearch === 'function') runHelpSearch(busca);
      inp.focus();
    }
  }

  // ==========================================================================
  // JANELA "COMO FAZER?"
  // ==========================================================================
  let catAtiva = '';
  function garanteModal() {
    let m = document.getElementById('po-hlp-modal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'po-hlp-modal';
    m.innerHTML = '<div class="po-hlp-card" role="dialog" aria-modal="true">'
      + '<div class="po-hlp-head"><h3 id="po-hlp-title"></h3>'
      + '<button type="button" class="po-auth-modal-close" id="po-hlp-close">&times;</button></div>'
      + '<div class="po-hlp-search"><input type="search" id="po-hlp-input" autocomplete="off" />'
      + '<button type="button" id="po-hlp-ask"></button></div>'
      + '<div class="po-hlp-ia" id="po-hlp-ia" style="display:none;"></div>'
      + '<div class="po-hlp-chips" id="po-hlp-chips"></div>'
      + '<div class="po-hlp-list" id="po-hlp-list"></div>'
      + '<div class="po-hlp-foot"><button type="button" class="po-hlp-link" id="po-hlp-central"></button></div>'
      + '</div>';
    document.body.appendChild(m);
    m.addEventListener('click', (ev) => { if (ev.target === m) fecharHelper(); });
    m.querySelector('#po-hlp-close').addEventListener('click', fecharHelper);
    const inp = m.querySelector('#po-hlp-input');
    let deb = null;
    inp.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(renderLista, 110); });
    inp.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      const r = buscar(inp.value);
      if (r.length && r[0].cobertura >= 0.6) rodarPergunta(r[0].q);
      else if (inp.value.trim()) perguntarIA(inp.value.trim());
    });
    m.querySelector('#po-hlp-ask').addEventListener('click', () => { if (inp.value.trim()) perguntarIA(inp.value.trim()); else inp.focus(); });
    m.querySelector('#po-hlp-central').addEventListener('click', () => { const v = inp.value.trim(); fecharHelper(); abrirCentral(v); });
    m.querySelector('#po-hlp-chips').addEventListener('click', (ev) => {
      const c = ev.target.closest('[data-cat]');
      if (!c) return;
      catAtiva = c.getAttribute('data-cat');
      inp.value = '';
      renderLista();
    });
    m.querySelector('#po-hlp-list').addEventListener('click', (ev) => {
      const it = ev.target.closest('[data-q]');
      if (!it) return;
      const q = HELPER_PERGUNTAS.find((x) => x.id === it.getAttribute('data-q'));
      if (q) rodarPergunta(q);
    });
    m.querySelector('#po-hlp-ia').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-ia]');
      if (!b || !iaUltima) return;
      if (iaUltima.q) rodarPergunta(iaUltima.q);
      else if (iaUltima.passos) { fecharHelper(); iniciarTour(iaUltima.passos, { titulo: iaUltima.pergunta }); }
    });
    return m;
  }
  function textosModal() {
    const m = garanteModal();
    m.querySelector('#po-hlp-title').textContent = t('helper.title');
    m.querySelector('#po-hlp-close').setAttribute('aria-label', t('helper.close'));
    m.querySelector('#po-hlp-input').placeholder = t('helper.placeholder');
    m.querySelector('#po-hlp-ask').textContent = t('helper.ask_ai');
    m.querySelector('#po-hlp-central').textContent = t('helper.open_center');
  }
  function abrirHelper() {
    pararTour();
    const m = garanteModal();
    textosModal();
    m.classList.add('open');
    const inp = m.querySelector('#po-hlp-input');
    renderLista();
    setTimeout(() => inp.focus(), 30);
  }
  function fecharHelper() {
    const m = document.getElementById('po-hlp-modal');
    if (m) m.classList.remove('open');
  }
  function itemHtml(q) {
    return '<button type="button" class="po-hlp-item" data-q="' + esc(q.id) + '">'
      + '<span class="po-hlp-item-q">' + esc(tx(q)) + '</span>'
      + '<span class="po-hlp-item-cat">' + esc(t('helper.cat_' + q.cat)) + '</span></button>';
  }
  function renderLista() {
    const m = garanteModal();
    const v = m.querySelector('#po-hlp-input').value.trim();
    const chips = m.querySelector('#po-hlp-chips');
    const lista = m.querySelector('#po-hlp-list');
    if (v) {
      chips.style.display = 'none';
      const r = buscar(v);
      lista.innerHTML = r.length
        ? r.map((x) => itemHtml(x.q)).join('')
        : '<p class="po-hlp-empty">' + esc(t('helper.no_results')) + '</p>';
      return;
    }
    chips.style.display = '';
    chips.innerHTML = ['', ...CATEGORIAS].map((c) => '<button type="button" class="po-hlp-chip' + (c === catAtiva ? ' active' : '')
      + '" data-cat="' + c + '">' + esc(c ? t('helper.cat_' + c) : t('helper.popular')) + '</button>').join('');
    const qs = catAtiva
      ? HELPER_PERGUNTAS.filter((q) => q.cat === catAtiva)
      : POPULARES.map((id) => HELPER_PERGUNTAS.find((q) => q.id === id)).filter(Boolean);
    lista.innerHTML = qs.map(itemHtml).join('');
  }

  // ==========================================================================
  // FASE 2 — PERGUNTAR À IA (generate-project-from-photo, stage 'help')
  // ==========================================================================
  let iaUltima = null, iaRodando = false;
  function rotulo(el) {
    const s = el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.textContent || '';
    return s.replace(/\s+/g, ' ').trim().slice(0, 90);
  }
  function coletarElementos() {
    const vistos = new Set(), out = [];
    document.querySelectorAll('#po-tab-projects [id], #po-proj-slot-actions [id], .portal-tab-btn, #po-margins-btn').forEach((el) => {
      if (out.length >= 260) return;
      if (!/^(BUTTON|INPUT|SELECT)$/.test(el.tagName) && !el.classList.contains('portal-tab-btn')) return;
      const id = el.id || (el.dataset.tab ? 'tab:' + el.dataset.tab : '');
      if (!id || vistos.has(id) || /^po-hlp/.test(id)) return;
      const lb = rotulo(el);
      if (!lb) return;
      vistos.add(id);
      out.push({ id, label: lb });
    });
    return out;
  }
  function seletorDoId(id) {
    return id.indexOf('tab:') === 0 ? '.portal-tab-btn[data-tab="' + id.slice(4).replace(/"/g, '') + '"]' : '#' + (window.CSS && CSS.escape ? CSS.escape(id) : id);
  }
  function iaStatus(html) {
    const box = garanteModal().querySelector('#po-hlp-ia');
    box.style.display = html ? '' : 'none';
    box.innerHTML = html || '';
  }
  async function perguntarIA(pergunta) {
    if (iaRodando) return;
    if (typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.functions) {
      iaStatus('<p class="po-hlp-ia-err">' + esc(t('helper.ai_error', { msg: 'supabase' })) + '</p>');
      return;
    }
    iaRodando = true;
    iaUltima = null;
    iaStatus('<p class="po-hlp-ia-wait">' + esc(t('helper.ai_thinking')) + '</p>');
    const L = lang();
    try {
      const elements = coletarElementos();
      const body = {
        stage: 'help', question: pergunta, lang: L,
        catalog: HELPER_PERGUNTAS.map((q) => ({ id: q.id, q: q[L] || q.pt, guided: !!(HELPER_TOURS[q.tour] || q.alvo) })),
        elements
      };
      const { data, error } = await supabaseClient.functions.invoke('generate-project-from-photo', { body });
      if (error || !data || data.error) {
        let msg = (data && data.error) || (error && error.message) || '?';
        if (typeof describeEdgeFunctionError === 'function') { try { msg = await describeEdgeFunctionError(error, data, 'generate-project-from-photo'); } catch (e) { /* ok */ } }
        throw new Error(msg);
      }
      const q = data.match_id ? HELPER_PERGUNTAS.find((x) => x.id === data.match_id) : null;
      const ids = new Set(elements.map((e) => e.id));
      const passos = (Array.isArray(data.steps) ? data.steps : [])
        .filter((s) => s && ids.has(String(s.element_id)))
        .slice(0, 8)
        .map((s) => {
          const sel = seletorDoId(String(s.element_id));
          const el = $(sel);
          const txt = String(s.text || '').slice(0, 300);
          return { el: sel, text: T(txt, txt, txt), wait: (el && el.tagName === 'BUTTON') ? 'click' : null };
        });
      iaUltima = { pergunta, q: (q && passosDaPergunta(q)) ? q : null, passos: passos.length ? passos : null };
      const podeMostrar = !!(iaUltima.q || iaUltima.passos);
      iaStatus('<p class="po-hlp-ia-ans">' + esc(String(data.answer || '')) + '</p>'
        + (q ? '<p class="po-hlp-ia-match">→ ' + esc(tx(q)) + '</p>' : '')
        + (podeMostrar ? '<button type="button" data-ia="mostrar">' + esc(t('helper.show_me')) + '</button>' : ''));
    } catch (e) {
      iaStatus('<p class="po-hlp-ia-err">' + esc(t('helper.ai_error', { msg: (e && e.message) || String(e) })) + '</p>');
    } finally {
      iaRodando = false;
    }
  }

  // ==========================================================================
  // BOTÃO "?" + idioma
  // ==========================================================================
  function ligar() {
    const b = document.getElementById('po-proj-helper-btn');
    if (b && !b.dataset.hlpOn) { b.dataset.hlpOn = '1'; b.addEventListener('click', abrirHelper); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar);
  else ligar();
  if (typeof I18n !== 'undefined' && I18n.onLanguageChange) {
    I18n.onLanguageChange(() => {
      const m = document.getElementById('po-hlp-modal');
      if (m && m.classList.contains('open')) { textosModal(); renderLista(); }
      if (tour && !tour.fim) renderPop();
    });
  }

  // Exposto pra testes e pra outros botões poderem chamar um tour direto.
  window.LegnoHelper = {
    abrir: abrirHelper,
    rodar: (id) => { const q = HELPER_PERGUNTAS.find((x) => x.id === id); if (q) rodarPergunta(q); },
    buscar,
    perguntas: HELPER_PERGUNTAS,
    tours: HELPER_TOURS,
    parar: pararTour
  };
})();
