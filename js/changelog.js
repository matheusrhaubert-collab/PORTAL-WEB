// Histórico de versões do portal — alimenta o selo de versão e o modal
// "Novidades" (js/version-news.js). Pedido do Matt, 2026-09-07: "do lado da
// versao quero um botao curiosidade ou news, que mostre o historico de
// melhorias de cada versao. tipo v1.001 data da versao. v1.002 -data e o que
// foi melhoraqdo em topicos. pode salvar isso pra usuario saber o que
// melhorou desde a versao que ele estava usando."
//
// Arquivo puro (sem DOM, sem banco) — só dados, igual layout-engine.js no
// espírito. Ordem: MAIS NOVA PRIMEIRO (índice 0 = versão atual, é o que vira
// o número do selo).
//
// TRADUZIDO (2026-09-07, mesmo dia — Matt: "informacoes da atualizacao em
// portungues e meu cadastro esta ingles"). Antes "items" era um array só,
// sempre em português, com um comentário dizendo de propósito que isso NÃO
// passava pelo dicionário de js/i18n.js (raciocínio: era "conteúdo pro
// cliente ler", igual nome de módulo de catálogo) — mas o Matt deixou claro
// que o modal de Novidades É interface, não dado de catálogo: ele espera ler
// no idioma da conta dele, igual o resto da tela. Agora "items" é um objeto
// {pt, en, es} — cada versão nova precisa escrever as 3 (ver passo 3 abaixo).
// version-news.js escolhe o array certo pelo idioma atual (I18n.getLanguage()),
// caindo pro pt se faltar alguma tradução numa versão antiga.
//
// Pra lançar uma versão nova:
//   1. Copia o bloco de baixo, cola no TOPO do array (antes do de 2026-09-07).
//   2. Troca version/date pros novos.
//   3. Lista o que mudou em items.pt — frases curtas, em português — E
//      TRADUZ pra items.en/items.es também (não é interface fixa como o
//      resto de js/i18n.js, mas o cliente lê isso na tela dele, então
//      precisa acompanhar o idioma escolhido).
// Não precisa mexer em mais nada: o número do selo (#po-version-badge) e a
// bolinha de "tem novidade" atualizam sozinhos a partir do item [0] daqui.
window.LEGNO_CHANGELOG = [
  {
    version: '1.004',
    date: '2026-09-30',
    items: {
      pt: [
        "Novo módulo Aéreo de Canto 45°: porta na diagonal (encaixada no vão entre as laterais), dobradiça 135° com amortecedor, prateleira chanfrada e veio da porta na vertical.",
        "Novo módulo Base de Canto 90° (em L): duas portas com dobradiça 165°, larguras de cada lado independentes, prateleiras, e opção de rodapé (toe) ou pés plásticos.",
        "Nova ferramenta LED embutido na barra do módulo: qualquer peça (base, prateleira, lateral, fundo, porta), em qualquer face, na horizontal ou na vertical, com distância e margem de cada ponta separadas, e quantos LEDs precisar na mesma peça. Botões Top/Under, vista 2D da peça com o LED tracejado e as cotas (dá pra arrastar a linha e as pontas com o mouse), e o 3D gira por baixo. O LED aparece no 3D e na foto realista, o rasgo sai no arquivo da máquina e a usinagem por metro entra no orçamento.",
        "Novo: conectar um módulo a qualquer face de outro módulo ou parede (botão direito), com a janela \"Reposicionar\" em duas vistas para ajustar a posição e girar.",
        "Novo: duplicar módulo agora pergunta a direção (esquerda, direita, cima, baixo, frente, atrás) e quantas cópias.",
        "Novo: Ctrl+C num módulo e Ctrl+V no ponto do ambiente onde está o mouse para colar uma cópia ali.",
        "Novo: clicar numa parede ou no piso mostra nome e medidas no canto do visualizador 3D; a parede pode ser esticada pelas setas das pontas sem mexer os móveis.",
        "Novo: clicar numa peça da listagem de peças faz ela piscar no desenho 3D.",
        "Arrastar um módulo até a esquina agora trava no canto, sem pular sozinho para a parede vizinha.",
        "Peças chanfradas e em L saem com o contorno certo no arquivo da máquina; furação de borda a borda entre bases e travessas vizinhas; travessa longa vai até o fundo.",
        "Corrigido: salvar/atualizar projeto podia mostrar sucesso sem gravar — agora avisa quando não foi salvo.",
        "Corrigido: porta inserida no Construtor depois de ajustar o vão saía na posição antiga.",
        "Corrigido: fita de borda aparecendo trocada em peças longas no 3D, e contra-furo fantasma em peças estreitas."
      ],
      en: [
        "New 45° Corner Wall Cabinet: diagonal door (fitted in the opening between the sides), 135° soft-close hinge, chamfered shelf and vertical door grain.",
        "New 90° Corner Base Cabinet (L-shaped): two doors with 165° hinges, independent widths for each side, shelves, and toe kick or plastic legs option.",
        "New built-in LED tool in the module toolbar: any part (bottom, shelf, side, back, door), on either face, horizontal or vertical, with its own distance and a separate margin at each end, and as many LEDs as needed on the same part. Top/Under buttons, 2D view of the part with the LED dashed and dimensioned (drag the line and its ends with the mouse), and the 3D rotates to look underneath. The LED shows in 3D and in the photorealistic render, the groove goes into the machine file and machining per meter is added to the quote.",
        "New: connect a module to any face of another module or wall (right click), with the \"Reposition\" window in two views to adjust position and rotate.",
        "New: duplicating a module now asks for the direction (left, right, up, down, front, back) and how many copies.",
        "New: Ctrl+C on a module and Ctrl+V at the spot in the room where the mouse is to paste a copy there.",
        "New: clicking a wall or the floor shows its name and size in the corner of the 3D viewer; walls can be stretched with the end arrows without moving the furniture.",
        "New: clicking a piece in the parts list makes it blink in the 3D drawing.",
        "Dragging a module to the corner now stops at the corner, without jumping to the next wall on its own.",
        "Chamfered and L-shaped pieces get the right outline in the machine file; edge-to-edge drilling between neighboring bottoms and stretchers; the long stretcher now reaches the back panel.",
        "Fixed: saving/updating a project could show success without saving — it now warns when nothing was saved.",
        "Fixed: a door inserted in the Builder after adjusting the opening came out in the old position.",
        "Fixed: edge banding showing on the wrong side of long pieces in 3D, and phantom counter-holes on narrow pieces."
      ],
      es: [
        "Nuevo módulo Aéreo de Esquina 45°: puerta en diagonal (encajada en el hueco entre los laterales), bisagra 135° con cierre suave, estante chaflanado y veta de la puerta en vertical.",
        "Nuevo módulo Base de Esquina 90° (en L): dos puertas con bisagra 165°, anchos independientes de cada lado, estantes y opción de zócalo o patas plásticas.",
        "Nueva herramienta LED empotrado en la barra del módulo: cualquier pieza (base, estante, lateral, fondo, puerta), en cualquier cara, horizontal o vertical, con distancia y margen de cada punta por separado, y tantos LED como hagan falta en la misma pieza. Botones Top/Under, vista 2D de la pieza con el LED punteado y acotado (se arrastra la línea y sus puntas con el mouse), y el 3D gira por debajo. El LED aparece en el 3D y en la foto realista, la ranura sale en el archivo de la máquina y el mecanizado por metro entra en el presupuesto.",
        "Nuevo: conectar un módulo a cualquier cara de otro módulo o pared (botón derecho), con la ventana \"Reposicionar\" en dos vistas para ajustar la posición y girar.",
        "Nuevo: duplicar módulo ahora pregunta la dirección (izquierda, derecha, arriba, abajo, adelante, atrás) y cuántas copias.",
        "Nuevo: Ctrl+C en un módulo y Ctrl+V en el punto del ambiente donde está el mouse para pegar una copia allí.",
        "Nuevo: hacer clic en una pared o en el piso muestra nombre y medidas en la esquina del visor 3D; la pared se puede estirar con las flechas de las puntas sin mover los muebles.",
        "Nuevo: hacer clic en una pieza de la lista de piezas la hace parpadear en el dibujo 3D.",
        "Arrastrar un módulo hasta la esquina ahora se detiene en el rincón, sin saltar solo a la pared vecina.",
        "Piezas chaflanadas y en L salen con el contorno correcto en el archivo de la máquina; perforación de canto a canto entre bases y travesaños vecinos; el travesaño largo llega hasta el fondo.",
        "Corregido: guardar/actualizar el proyecto podía mostrar éxito sin guardar — ahora avisa cuando no se guardó.",
        "Corregido: la puerta insertada en el Constructor después de ajustar el hueco salía en la posición anterior.",
        "Corregido: tapacanto apareciendo del lado equivocado en piezas largas en el 3D, y contraperforación fantasma en piezas angostas."
      ]
    }
  },
  {
    version: '1.003',
    date: '2026-09-07',
    items: {
      pt: [
        'Barra de ferramentas da tela de Projetos reorganizada em categorias (Paredes, Vista, Ferramentas, Camadas, Render, Orçamento, Projeto), com um textinho identificando cada grupo.',
        'Novo botão "Refazer" ao lado do "Desfazer", pra reverter um desfazer feito a mais.',
        'Corrigido a exportação para o SketchUp: uma caixa invisível usada só pra clicar no móvel na tela não sai mais junto como um bloco sólido atrapalhando o desenho.',
        'Corrigido o ícone do menu "Visual" que aparecia mais baixo que os outros ícones da categoria Vista.',
        'Na categoria Camadas, ocultar um móvel agora destaca o botão em rosa, igual aos outros indicadores da barra.',
        'Botão "Enviar pro pedido" passou a usar o mesmo ícone preto e branco dos outros botões da barra, sem o fundo preto.',
        'Corrigido bug que, depois de gerar uma Proposta, trocava o ícone do botão pela palavra "Proposal" e não voltava mais sem recarregar a página.',
        'Ícones da barra reaproximados do texto de cada categoria, ocupando um pouco menos de altura.',
        'Corrigido a exportação para o SketchUp: peças com o mesmo acabamento agora viram UM material só (antes cada peça virava um material separado, mesmo usando a mesma textura, e era preciso trocar face por face).',
        'Corrigido a exportação para o SketchUp: textura que ainda estivesse carregando no momento do export não sai mais como "imagem não encontrada" no material.',
        'Novo: ferramenta de Régua na categoria Ferramentas — clique em 2 pontos do desenho pra ver a distância entre eles. O ponto desliza acompanhando o mouse ao longo da aresta (não pula mais pro canto mais próximo), com ímã só perto das pontas e do meio da aresta, uma linha guia mostrando o alinhamento, dá pra arrastar um ponto já marcado pra ajustar, e um botão "Limpar cotas" pra apagar as medições.',
        'Novo: botão "Print" na categoria Render — tira uma foto da vista atual (portas, móveis ocultos e estilo de traço exatamente como estão na tela) e guarda direto na galeria de fotos realistas.',
        'Câmera do visualizador de projeto agora gira quase até ficar totalmente de frente/paralela a uma parede, sem parar sempre um pouco de cima.',
        'Régua: agora dá pra clicar na linha da medição e arrastar pra afastar o traço/número da peça (sem mudar os pontos medidos), e clicar numa medição e apertar Delete pra apagar só ela.',
        'Corrigido a régua: ao ocultar uma camada (ex.: Porta/Frente) pra ver os internos do móvel, ela agora ignora de vez as peças ocultas — antes o clique ainda "via" a peça escondida, como se ela ainda estivesse lá.',
        'Corrigido a régua: selecionar e apagar (Delete) uma medição já feita agora funciona mesmo com a ferramenta de régua desligada — antes só dava pra mexer numa medição existente com a régua ligada.',
        'Modal "Novidades" (esta lista aqui) agora aparece traduzido no idioma da conta, em vez de sempre em português.',
        'Exportação para o SketchUp ganhou um botão "Cor sólida" ao lado: liga pra exportar sem as imagens de textura, usando no lugar uma cor parecida com cada textura — útil quando a textura chega toda preta/"não encontrada" ao importar no SketchUp.'
      ],
      en: [
        'Projects screen toolbar reorganized into categories (Walls, View, Tools, Layers, Render, Budget, Project), with a small label identifying each group.',
        'New "Redo" button next to "Undo", to bring back a change you undid one too many times.',
        'Fixed SketchUp export: an invisible box used only for clicking the piece on screen no longer comes along as a solid block cluttering the drawing.',
        'Fixed the "Style" menu icon that was sitting lower than the other icons in the View category.',
        'In the Layers category, hiding a piece of furniture now highlights the button in pink, like the other indicators in the toolbar.',
        'The "Send to order" button now uses the same black-and-white icon as the other toolbar buttons, without the black background.',
        'Fixed a bug where, after generating a Proposal, the button icon got replaced by the word "Proposal" and never came back without reloading the page.',
        'Toolbar icons moved closer to each category label, taking up a bit less height.',
        'Fixed SketchUp export: pieces with the same finish now become a SINGLE material (before, each piece became a separate material even when using the same texture, and you had to swap it face by face).',
        'Fixed SketchUp export: a texture still loading at the moment of export no longer shows up as "image not found" on the material.',
        'New: Ruler tool in the Tools category — click 2 points on the drawing to see the distance between them. The point slides along with the mouse following the edge (it no longer jumps to the nearest corner), with a magnet only near the ends and the middle of the edge, a guide line showing the alignment, you can drag an already-placed point to adjust it, and a "Clear measurements" button to remove them.',
        'New: "Print" button in the Render category — takes a photo of the current view (doors, hidden furniture and outline style exactly as shown on screen) and saves it straight to the photorealistic gallery.',
        'The project viewer camera now rotates almost all the way to a fully front-on/parallel view of a wall, instead of always stopping a bit from above.',
        'Ruler: you can now click the measurement line and drag it to move the line/number away from the piece (without changing the measured points), and click a measurement and press Delete to remove just that one.',
        'Fixed the ruler: hiding a layer (e.g. Door/Front) to see the inside of a piece of furniture now makes it fully ignore the hidden pieces — before, clicks could still "see" the hidden piece, as if it were still there.',
        'Fixed the ruler: selecting and deleting (Delete) an existing measurement now works even with the ruler tool turned off — before, you could only interact with an existing measurement while the ruler was on.',
        'The "What\'s New" modal (this list) now shows up translated in the account\'s language, instead of always in Portuguese.',
        'SketchUp export now has a "Solid color" toggle next to it: turn it on to export without texture images, using a similar solid color instead for each texture — useful when textures come in all black/"not found" after importing into SketchUp.'
      ],
      es: [
        'Barra de herramientas de la pantalla de Proyectos reorganizada en categorías (Paredes, Vista, Herramientas, Capas, Render, Presupuesto, Proyecto), con un textito identificando cada grupo.',
        'Nuevo botón "Rehacer" al lado de "Deshacer", para revertir un deshacer hecho de más.',
        'Corregida la exportación a SketchUp: una caja invisible usada solo para hacer clic en el mueble en la pantalla ya no sale junto como un bloque sólido que estorba el dibujo.',
        'Corregido el ícono del menú "Estilo" que aparecía más abajo que los demás íconos de la categoría Vista.',
        'En la categoría Capas, ocultar un mueble ahora resalta el botón en rosa, igual que los demás indicadores de la barra.',
        'El botón "Enviar al pedido" ahora usa el mismo ícono blanco y negro de los demás botones de la barra, sin el fondo negro.',
        'Corregido un error que, después de generar una Propuesta, cambiaba el ícono del botón por la palabra "Proposal" y no volvía sin recargar la página.',
        'Íconos de la barra reacercados al texto de cada categoría, ocupando un poco menos de altura.',
        'Corregida la exportación a SketchUp: piezas con el mismo acabado ahora se convierten en UN solo material (antes cada pieza se convertía en un material separado, aunque usara la misma textura, y había que cambiarlo cara por cara).',
        'Corregida la exportación a SketchUp: una textura que todavía estuviera cargando en el momento de exportar ya no aparece como "imagen no encontrada" en el material.',
        'Nuevo: herramienta de Regla en la categoría Herramientas — haz clic en 2 puntos del dibujo para ver la distancia entre ellos. El punto se desliza siguiendo el mouse a lo largo de la arista (ya no salta a la esquina más cercana), con un imán solo cerca de las puntas y del medio de la arista, una línea guía mostrando la alineación, se puede arrastrar un punto ya marcado para ajustarlo, y un botón "Borrar cotas" para eliminar las mediciones.',
        'Nuevo: botón "Print" en la categoría Render — toma una foto de la vista actual (puertas, muebles ocultos y estilo de trazo exactamente como están en la pantalla) y la guarda directo en la galería de fotos realistas.',
        'La cámara del visualizador de proyecto ahora gira casi hasta quedar totalmente de frente/paralela a una pared, sin detenerse siempre un poco desde arriba.',
        'Regla: ahora se puede hacer clic en la línea de la medición y arrastrarla para alejar el trazo/número de la pieza (sin cambiar los puntos medidos), y hacer clic en una medición y presionar Delete para borrar solo esa.',
        'Corregida la regla: al ocultar una capa (ej.: Puerta/Frente) para ver el interior del mueble, ahora ignora por completo las piezas ocultas — antes el clic todavía "veía" la pieza escondida, como si siguiera ahí.',
        'Corregida la regla: seleccionar y borrar (Delete) una medición ya hecha ahora funciona incluso con la herramienta de regla apagada — antes solo se podía interactuar con una medición existente con la regla encendida.',
        'El modal "Novedades" (esta lista) ahora aparece traducido en el idioma de la cuenta, en vez de siempre en portugués.',
        'La exportación a SketchUp ahora tiene un botón "Color sólido" al lado: actívalo para exportar sin las imágenes de textura, usando en su lugar un color parecido a cada textura — útil cuando la textura llega toda negra/"no encontrada" al importar en SketchUp.'
      ]
    }
  },
  {
    version: '1.002',
    date: '2026-09-07',
    items: {
      pt: [
        'Corrigido bug que fazia o menu "Visual" (estilos de desenho: textura, contorno fino/grosso, técnico) sumir da barra de ferramentas em telas de notebook.',
        'Novo botão "Exportar SketchUp" na tela de Projetos: baixa o móvel/ambiente 3D com as texturas, pronto pra abrir no SketchUp.'
      ],
      en: [
        'Fixed a bug that made the "Style" menu (drawing styles: texture, thin/thick outline, technical) disappear from the toolbar on laptop screens.',
        'New "Export SketchUp" button on the Projects screen: downloads the 3D furniture/room with textures, ready to open in SketchUp.'
      ],
      es: [
        'Corregido un error que hacía que el menú "Estilo" (estilos de dibujo: textura, contorno fino/grueso, técnico) desapareciera de la barra de herramientas en pantallas de notebook.',
        'Nuevo botón "Exportar SketchUp" en la pantalla de Proyectos: descarga el mueble/ambiente 3D con las texturas, listo para abrir en SketchUp.'
      ]
    }
  },
  {
    version: '1.001',
    date: '2026-09-07',
    items: {
      pt: [
        'Número da versão do portal agora aparece na tela.',
        'Botão de novidades ao lado da versão, com o histórico do que mudou em cada versão.'
      ],
      en: [
        'The portal\'s version number now appears on the screen.',
        'A "What\'s new" button next to the version, with the history of what changed in each version.'
      ],
      es: [
        'El número de versión del portal ahora aparece en la pantalla.',
        'Botón de novedades al lado de la versión, con el historial de lo que cambió en cada versión.'
      ]
    }
  }
];
