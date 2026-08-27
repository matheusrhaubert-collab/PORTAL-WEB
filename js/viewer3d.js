// Visualizador 3D do módulo — LEGNO PORTAL WEB
//
// Monta os COMPONENTES DE VERDADE do módulo (lateral esquerda, lateral
// direita, base, topo, fundo, porta, prateleira, gaveta...) dentro do
// volume do módulo, cada um na posição cadastrada (components.position_role)
// e com sua cor real (caixa ou porta, conforme o tipo do componente). É só
// ilustrativo: não participa do cálculo de preço, que continua vindo de
// pricing.js — o desenho só usa as MESMAS dimensões já resolvidas pelas
// fórmulas de cada peça (Pricing.calculatePiece), calculadas em client.js.
//
// Depende do Three.js (r128) + OrbitControls carregados via CDN antes deste
// arquivo (ver index.html). Se por algum motivo o Three.js não carregar
// (rede bloqueada, CDN fora do ar), as funções abaixo silenciosamente não
// fazem nada — o resto da calculadora continua funcionando normalmente.
//
// ZERO ABSOLUTO (peças ÚNICAS: left/right/top/bottom/back/baseboard/
// countertop) — a pedido do usuário, essas 7 posições NÃO têm mais nenhuma
// âncora automática por papel. Cada uma nasce com o PRÓPRIO canto
// chão-fundo-esquerda encostado no canto chão-fundo-esquerda do módulo
// (x=-W/2, y=0, z=-D/2), e Deslocar X/Y/Z é a posição ABSOLUTA e final desse
// canto a partir dali — não um ajuste em cima de uma posição escondida. Isso
// significa que 'left'/'right' (e 'top'/'bottom') usam a MESMA fórmula: pra
// encostar uma peça 'right' na direita, cadastre offset_x_mm = "W-19" (ou a
// espessura que for); pra 'top', offset_y_mm = "H-19". O admin decide a
// posição peça a peça, do zero — sem nenhuma regra escondida no meio da
// conta. legH (corpo deslocado pra cima quando o módulo tem pés) continua
// somando automaticamente ao Y dessas peças (exceto baseboard) — não é uma
// "âncora por papel", é uma exigência estrutural do corpo inteiro.
//
// PAPÉIS COM DISTRIBUIÇÃO AUTOMÁTICA (shelf, drawer, leg, front,
// handle) continuam como sempre: quando existe mais de uma peça do mesmo
// papel (ex: várias prateleiras, várias portas, 4 pés), a posição de cada
// instância é calculada automaticamente (distribuída no vão, empilhada,
// nas quinas...) — aqui Deslocar X/Y/Z continua sendo um AJUSTE FINO em
// cima dessa distribuição automática, não a posição absoluta.

const Viewer3D = (function () {
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let partMeshes = [];
  // Grupo que envolve TODAS as peças de 1º nível do módulo raiz (o que
  // addPart desenha) — nasce vazio, filho direto da scene, e existe só pra
  // dar um "cabo" único pra deslocar o módulo inteiro no eixo Y (altura do
  // chão, pedido do usuário 2026-07-16 — ver floor_height_mm em update()),
  // sem tocar em NENHUMA fórmula de posicionamento local das peças (que
  // continuam todas relativas a este grupo, exatamente como antes eram
  // relativas à scene). Ver nota de fragilidade no topo do arquivo — este é
  // o motivo de escolher um deslocamento de grupo por fora, em vez de somar
  // o offset dentro de placePart/placeFrontGroup/etc.
  let moduleGroup = null;
  let textureLoader = null;
  let containerEl = null;
  const textureCache = {};

  // Duplo-clique numa peça -> ver info (nome/medidas/cor) — pedido do
  // usuário. raycaster acha o mesh realmente clicado; onPieceDoubleClickCb é
  // registrado por client.js/portal.js (ver onPieceDoubleClick) e recebe
  // (pieceInfo, clientX, clientY) pra desenhar o balão perto do clique.
  let raycaster = null;
  let onPieceDoubleClickCb = null;

  // Promises de textura ainda carregando (ver loadTexture/
  // waitForPendingTextures) — drenado a cada chamada de
  // waitForPendingTextures(), não cresce indefinidamente.
  let pendingTexturePromises = [];

  // Devolve uma Promise que resolve quando toda textura pedida ATÉ AGORA (ver
  // loadTexture) terminar de carregar (sucesso ou erro — não trava pra
  // sempre num PNG quebrado). Uso: depois de Viewer3D.update(...), antes de
  // Viewer3D.snapshot(), pra garantir que a miniatura sai com a cor/textura
  // certa, não um frame intermediário em branco/cinza (admin.js usa isso pra
  // gerar a imagem 3D "oficial" do módulo).
  function waitForPendingTextures() {
    const pending = pendingTexturePromises;
    pendingTexturePromises = [];
    return Promise.all(pending);
  }

  // Peças "que abrem" — porta com dobradiça (position_role='front', gira em
  // torno de um pivô na dobradiça) ou gaveta/módulo aninhado com abertura por
  // corrediça (opening_type='slide_out', desliza no eixo Z). openables guarda,
  // pra cada peça-que-abre atualmente desenhada, o suficiente pra animar em
  // animate(): { kind:'hinge', group, hingeSide, currentAngle, targetAngle }
  // ou { kind:'slide', group, baseZ, distance, currentOffset, targetOffset }.
  // doorsOpen/drawersOpen são os estados PERSISTENTES (entre updates) de cada
  // grupo — trocar cor/medida não fecha as peças sozinho. Separados (pedido
  // do usuário) pra "Abrir portas" e "Abrir gavetas" serem controles
  // independentes: abrir as portas não mexe nas gavetas, e vice-versa. Antes
  // era um único openState/toggleOpenables cobrindo os dois kinds juntos.
  // Maior dimensão (W/H/D) do módulo na ÚLTIMA vez que a câmera foi
  // enquadrada (refit OU acompanhamento suave) — usado pra escalar a
  // distância da câmera proporcionalmente quando o cliente muda alguma
  // medida (ver update()), sem perder o ângulo/rotação que ele já ajustou.
  let lastMaxDim = null;

  // Tipo de projeção da câmera — 'perspective' (padrão, sempre foi assim) ou
  // 'orthographic' ("visão paralela", pedido do usuário: funciona melhor pra
  // desenhar peças chapadas/ripadas, sem a distorção de perspectiva que faz
  // ripas paralelas parecerem convergir). Trocado via setProjectionMode —
  // reconstrói câmera+controls (OrbitControls é preso a UM objeto câmera na
  // criação, não dá pra só trocar o tipo do mesmo objeto).
  let projectionMode = 'perspective';

  // Últimos argumentos recebidos por update() — guardado só pra
  // setProjectionMode conseguir reenquadrar a cena de novo (mesmas peças/
  // medidas) depois de trocar o tipo de câmera, sem quem chamou precisar
  // montar tudo de novo.
  let lastUpdateArgs = null;

  let openables = [];
  let doorsOpen = false;
  let drawersOpen = false;
  const DOOR_OPEN_ANGLE = Math.PI * 0.55; // ~99° — um pouco além de 90° pra parecer bem aberta
  // Basculante/basculante inverso (2026-08-20, pedido do Matt com foto de
  // referência) — ângulo MENOR que o da porta giro de propósito: o pistão a
  // gás sustenta a porta numa posição intermediária, não deixa ela cair/
  // levantar até quase encostar (o que aconteceria perto de 90°+); ~76°
  // aberto dá a leitura de "sustentada pelo pistão" da foto.
  const FLAP_OPEN_ANGLE = Math.PI * 0.42;

  // Contexto de abertura ATIVO durante uma chamada de buildStandaloneAssembly
  // (pedido do usuário, 2026-07-16: "quero opcao abrir portas e gavetas no
  // modulo composicao gerado") — null = comportamento de sempre (usa o
  // doorsOpen/drawersOpen/openables acima, da cena singleton). Quando
  // buildStandaloneAssembly está montando um módulo autônomo pra Composição,
  // seta este contexto com o estado aberto/fechado PRÓPRIO da composição (ver
  // viewer3d_composition.js) e uma lista de openables PRÓPRIA (não a da cena
  // singleton) — assim os dois viewers têm estado de porta/gaveta
  // independente, sem um afetar o outro. positionWithOpening (chamada por
  // TODA peça que abre, em qualquer profundidade de módulo aninhado — ver
  // buildModuleAssembly/resolveContent) lê este contexto em vez das variáveis
  // globais quando ele está setado. Síncrono/sem await entre o set e o
  // reset (buildStandaloneAssembly), então não há risco de a cena singleton
  // "ver" este contexto no meio de um update() dela — JS é single-threaded.
  let activeOpenCtx = null;

  // Peça sendo desenhada AGORA (migration 088). Mesmo padrão e mesma
  // justificativa do activeOpenCtx acima: buildContentGroup só recebia a
  // COR, e pra escolher o material de cada face ela precisa também de
  // edge_banding e positioning — que são da peça.
  //
  // Passar `part` por parâmetro exigiria mudar a assinatura de emit /
  // addPart / addPartToGroup / buildContentGroup e as ~8 chamadas espalhadas
  // por placePieceInBox e placeFrontGroupInBox. Num arquivo onde uma mexida
  // especulativa já custou uma regressão em cascata, trocar 8 assinaturas
  // pra carregar um dado de leitura é risco à toa. O contexto é setado por
  // quem já tem `part` em mãos, lido logo em seguida e limpo — tudo
  // síncrono, JS é single-threaded, não há como uma peça ver a outra.
  let activePart = null;

  // Setar/limpar num lugar só — quem desenha uma peça chama isto em volta da
  // emissão dela. Restaura o valor anterior (e não null) porque peça-módulo
  // aninhada emite peças DENTRO da emissão da peça-pai; e limpa no finally,
  // porque peça nenhuma pode herdar a receita de fita da peça anterior se
  // alguma coisa estourar no meio.
  function comPeca(part, fn) {
    const antes = activePart;
    activePart = part || null;
    try { return fn(); } finally { activePart = antes; }
  }

  // hingeSide 'left'/'right' = dobradiça de embutir (eixo Y, vertical, na
  // ALTURA da porta) — porta_giro, sempre. 'top'/'bottom' = basculante/
  // basculante inverso (eixo X, horizontal, na LARGURA) — ver
  // positionWithOpening pro giro em si. Sinal escolhido pra a porta SEMPRE
  // abrir pra FORA do móvel (+Z), nunca pra dentro (bateria nas
  // prateleiras/fundo): 'top' (basculante) precisa de ângulo NEGATIVO em X
  // pra a base da porta ir pra +Z; 'bottom' (basculante inverso) precisa de
  // ângulo POSITIVO em X pelo mesmo motivo, espelhado (ver dedução completa
  // no comentário de positionWithOpening).
  function openAngleFor(hingeSide) {
    if (hingeSide === 'top') return -FLAP_OPEN_ANGLE;
    if (hingeSide === 'bottom') return FLAP_OPEN_ANGLE;
    return hingeSide === 'left' ? -DOOR_OPEN_ANGLE : DOOR_OPEN_ANGLE;
  }

  function available() {
    return typeof THREE !== 'undefined' && THREE.OrbitControls;
  }

  // rotateMode = true pra peças horizontais comuns (topo/base/prateleira): a
  // face visível delas usa o par de eixos (X,Z) do BoxGeometry, que o
  // Three.js mapeia a textura girada 90° em relação às faces verticais (que
  // usam Y) — sem isso o veio da madeira sai "deitado" na base/prateleira e
  // "em pé" nas laterais. rotateMode = 'right' é um giro de 90° no sentido
  // OPOSTO (pedido do usuário, 2026-07-11) — só usado por
  // 'horizontal_no_plano' (ver resolveRotateTexture): esse tipo de posição
  // usa a peça física VIRADA (o próprio usuário gira a peça pra montar nesse
  // tipo), então o giro padrão saía do lado errado; precisa do giro
  // contrário, específico só pra este positioning. Cacheia uma cópia por
  // modo de giro (chave própria pra cada um), pra não afetar as peças que
  // usam outro giro (ou nenhum) com a mesma textura.
  //
  // ESCALA FÍSICA (2026-08-12, pedido do Matt: "a textura parece que se estica
  // e encolhe... eu corto de uma chapa com uma só textura, então ela não pode
  // se redimensionar conforme o tamanho"). Até aqui o UV 0..1 da face era
  // esticado no tamanho da peça: um filler de 80mm e uma lateral de 2000mm
  // mostravam a MESMA imagem inteira, então o veio saía gordo na peça pequena
  // e espremido na grande — exatamente o oposto de peças cortadas da mesma
  // chapa. Agora a imagem vale um pedaço FIXO de chapa (TEXTURE_TILE_MM) e o
  // repeat sai do tamanho REAL da face em mm, igual já era feito no miolo
  // (ver coreTexture/makeCoreMaterial). Peça pequena passa a mostrar só um
  // PEDAÇO da textura — é o que acontece na chapa de verdade.
  //
  // O tile é constante mesmo (decisão do Matt: nada de coluna nova por cor).
  // Pra calibrar sem editar código dá pra rodar no console:
  //   window.LEGNO_TEXTURE_TILE_MM = 1500; Viewer3D.update(...)  // ou re-render
  const TEXTURE_TILE_MM = 1000;
  function textureTileMm() {
    const v = Number(typeof window !== 'undefined' ? window.LEGNO_TEXTURE_TILE_MM : 0);
    return v > 0 ? v : TEXTURE_TILE_MM;
  }
  // Quantiza o repeat pra 0.05: peça arrastada de 600 pra 601mm não pode criar
  // uma textura NOVA na GPU a cada milímetro (o cache abaixo nunca é
  // esvaziado por disposeObject3D, que só descarta MATERIAL — ver comentário
  // do coreTextureCache).
  // Passo mais fino embaixo de 0.5 de propósito: a FITA de 18mm dá repeat
  // 0.018 e um passo único de 0.05 zeraria ela.
  function quantizaRepeat(mm) {
    if (!(mm > 0)) return 1;
    const r = mm / textureTileMm();
    const passo = r < 0.5 ? 200 : 20;
    return Math.max(0.005, Math.min(64, Math.round(r * passo) / passo));
  }
  function loadTexture(url, rotateMode) {
    if (!url) return null;
    const rotateSuffix = rotateMode === true ? '|rot90' : rotateMode === 'right' ? '|rot90r' : '';
    // 2026-08-27 (Matt: "sobre as texturas pesando no ambiente, você chegou
    // a avaliar?" — diagnóstico real: Viewer3D.textureMemoryReport() achou
    // 61 uploads de GPU / ~1.93GB de VRAM com só 5 módulos abertos, uso real
    // dele passa de 100). CAUSA: até aqui a chave de cache incluía o repeat
    // físico (repU/repV, derivado do tamanho em mm da peça — ver
    // quantizaRepeat), então a MESMA imagem de acabamento usada em peças de
    // tamanhos diferentes virava um upload de GPU NOVO por tamanho. Agora a
    // chave é só (url, giro) — no MÁXIMO 3 texturas por cor (sem giro,
    // rot90, rot90r) — e o "tamanho físico" que antes ia em tex.repeat passa
    // a ser pré-escalado DIRETO no UV de cada peça (ver scaleFaceUV/
    // scaleAllFacesUV, chamadas em makeBoxMaterials e buildContentGroup), do
    // mesmo jeito que rotateGeometryUV90 já mexe no buffer de UV pra girar o
    // veio da peça 'free'. Resultado visual idêntico (matemática + harness
    // de screenshot antes/depois, ver memória do projeto) — o que muda é só
    // ONDE a escala é aplicada: antes na Texture (1 upload de GPU por
    // combinação de tamanho/rotação), agora na geometria da peça (não custa
    // upload nenhum, é só um buffer de vértice).
    const cacheKey = url + rotateSuffix;
    if (textureCache[cacheKey]) return textureCache[cacheKey];
    // Rastreia o carregamento (assíncrono) desta textura — usado por
    // waitForPendingTextures(), pra quem quer tirar um snapshot "de verdade"
    // (ver admin.js, geração da imagem 3D do módulo) esperar as texturas
    // baterem antes de capturar, em vez de arriscar uma miniatura com a cor
    // errada (fallback cinza) só porque o PNG ainda não tinha decodificado
    // no instante do render síncrono do snapshot().
    let resolveLoaded;
    pendingTexturePromises.push(new Promise((resolve) => { resolveLoaded = resolve; }));
    const tex = textureLoader.load(url, () => resolveLoaded(), undefined, () => resolveLoaded());
    if ('colorSpace' in tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
    } else if ('encoding' in tex) {
      tex.encoding = THREE.sRGBEncoding;
    }
    if (rotateMode === true) {
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI / 2;
    } else if (rotateMode === 'right') {
      tex.center.set(0.5, 0.5);
      tex.rotation = -Math.PI / 2;
    }
    // Repeat fica em (1,1) sempre — o repeat físico agora é pré-escalado no
    // UV de cada peça (ver comentário grande acima). Ainda precisa de
    // RepeatWrapping: o UV pré-escalado passa de 1 (ex.: peça de 3 tiles
    // vira UV até 3.0), e sem repeat wrapping isso viraria ClampToEdge
    // (padrão do Three) em vez de repetir a imagem.
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    // Textura repetida vista de raspão (a fita de 18mm, principalmente) vira
    // moiré sem filtro anisotrópico.
    if (renderer && renderer.capabilities && renderer.capabilities.getMaxAnisotropy) {
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    textureCache[cacheKey] = tex;
    return tex;
  }

  // Gira o UV de uma geometria em 90°, DIRETO no buffer da geometria — usado
  // como alternativa ao giro por textura (tex.rotation, ver loadTexture) pra
  // peça 'free' (posição livre, ver placePieceInBox): essa peça é vista de
  // FRENTE (face Z, U=largura/V=altura direto, sem nenhuma troca de eixo),
  // diferente de prateleira/topo/base (vistas de CIMA, face Y, U=largura/
  // V=profundidade) — é PRA essas últimas que o giro por textura (tex.rotation)
  // foi pensado originalmente e onde já funciona. Testado com a peça 'free'
  // (2026-07-11, pedido do usuário: "Horizontal no plano" não girava o veio
  // de jeito nenhum, nem pra esquerda nem pra direita) o giro por textura não
  // fazia efeito visual nenhum nessa peça — então pra 'free' passa a girar o
  // UV da própria geometria (garantido, não depende de texture.matrix).
  function rotateGeometryUV90(geometry) {
    const uvAttr = geometry.attributes && geometry.attributes.uv;
    if (!uvAttr) return;
    for (let i = 0; i < uvAttr.count; i++) {
      const u = uvAttr.getX(i);
      const v = uvAttr.getY(i);
      uvAttr.setXY(i, v, 1 - u);
    }
    uvAttr.needsUpdate = true;
    // Marca a geometria: quem for calcular o repeat físico (ver
    // dimensoesDaFaceMm) precisa trocar U por V, senão a peça 'free' com veio
    // girado sai com a escala trocada nos dois eixos.
    geometry.userData = geometry.userData || {};
    geometry.userData.uvRotated90 = !geometry.userData.uvRotated90;
  }

  // Pré-escala o UV de UM PAR de faces opostas de uma BoxGeometry pelo
  // tamanho físico da peça (repU/repV, de quantizaRepeat) — substitui o que
  // antes era tex.repeat.set(...) por instância de Texture (ver comentário
  // grande em loadTexture, 2026-08-27). Só mexe nos vértices DESSE par (uma
  // BoxGeometry tem 4 vértices próprios por face, sem compartilhar com as
  // outras 5 — escalar um par não afeta os outros).
  //
  // pairIndex: 0 = par ±X (groups 0,1), 1 = par ±Y (groups 2,3), 2 = par ±Z
  // (groups 4,5) — mesma ordem que o Three usa nos groups de uma
  // BoxGeometry padrão (+X,-X,+Y,-Y,+Z,-Z), e a mesma ordem do array de
  // materiais [mx, mx, my, my, mz, mz] que makeBoxMaterials devolve.
  //
  // rotateTexture importa pro PIVÔ da escala, não só pro giro em si — achado
  // só no harness de screenshot antes/depois (a 1ª versão disto ignorava
  // rotateTexture aqui e saía com a textura picada/deslocada nas peças
  // giradas). Motivo: com giro, o Three roda a textura em torno do CENTRO
  // (tex.center=(0.5,0.5), setado só quando rotateMode é true/'right' — ver
  // loadTexture) — e como antes a escala física vinha JUNTO na mesma matriz
  // da textura (repeat + rotação + center combinados por
  // Matrix3.setUvTransform), ela saía "grudada" nesse mesmo pivô central.
  // Sem giro, tex.center nunca foi setado (fica no default (0,0) do Three),
  // então a escala sempre foi a partir da ORIGEM. Pra reproduzir o resultado
  // antigo exatamente, esta função replica o mesmo pivô: SEM giro, escala a
  // partir de 0 (u*repU); COM giro, escala em torno de 0.5
  // (0.5 + (u-0.5)*repU) — testado com harness de screenshot antes/depois
  // pros dois giros e sem giro (ver memória do projeto).
  function scaleFaceUV(geometry, pairIndex, repU, repV, rotateTexture) {
    if (repU === 1 && repV === 1) return;
    const uvAttr = geometry.attributes && geometry.attributes.uv;
    if (!uvAttr) return;
    const idxAttr = geometry.index;
    const feito = {};
    const girou = rotateTexture === true || rotateTexture === 'right';
    const escala = (vi) => {
      if (feito[vi]) return;
      feito[vi] = true;
      const u = uvAttr.getX(vi), v = uvAttr.getY(vi);
      if (girou) {
        uvAttr.setXY(vi, 0.5 + (u - 0.5) * repU, 0.5 + (v - 0.5) * repV);
      } else {
        uvAttr.setXY(vi, u * repU, v * repV);
      }
    };
    const groups = geometry.groups;
    if (idxAttr && groups && groups.length === 6) {
      [groups[pairIndex * 2], groups[pairIndex * 2 + 1]].forEach((g) => {
        for (let i = g.start; i < g.start + g.count; i++) escala(idxAttr.getX(i));
      });
    } else {
      // Fallback defensivo (BoxGeometry sem index/groups não é esperado no
      // Three usado aqui, r128/r181 sempre gera os dois) — layout padrão: 4
      // vértices por face, 2 faces por par, na ordem +X,-X,+Y,-Y,+Z,-Z.
      const base = pairIndex * 8;
      for (let i = base; i < base + 8; i++) escala(i);
    }
    uvAttr.needsUpdate = true;
  }

  // Mesma escala nos 3 pares — usado quando a peça inteira leva UM material
  // só (sem receita de fita cadastrada, ver buildContentGroup): a escala
  // vem da FACE GRANDE (dimensoesDaFaceMm) e vale pros 6 lados igual.
  function scaleAllFacesUV(geometry, repU, repV, rotateTexture) {
    scaleFaceUV(geometry, 0, repU, repV, rotateTexture);
    scaleFaceUV(geometry, 1, repU, repV, rotateTexture);
    scaleFaceUV(geometry, 2, repU, repV, rotateTexture);
  }

  // Face "grande" de uma caixa em mm, DEDUZIDA da própria geometria: os dois
  // maiores lados (o menor é sempre a espessura). Usado só quando a peça cai
  // no material ÚNICO (sem receita de fita cadastrada) — com receita, cada par
  // de faces recebe a medida certa em makeBoxMaterials.
  // Qual eixo da geometria vira U e qual vira V é FIXO no Three, por par de
  // faces: ±X -> U=Z,V=Y; ±Y -> U=X,V=Z; ±Z -> U=X,V=Y. Ordenar os lados por
  // tamanho (a 1ª versão disto) chutava errado numa porta 600×2000, onde o U
  // é o lado MENOR — por isso a dedução aqui é pelo eixo da espessura.
  function dimensoesDaFaceMm(geometry) {
    const p = geometry && geometry.parameters;
    if (!p || p.width == null || p.height == null || p.depth == null) return null;
    const x = p.width * 1000, y = p.height * 1000, z = p.depth * 1000;
    let u, v;
    if (z <= x && z <= y) { u = x; v = y; }        // espessura em Z -> face ±Z
    else if (x <= y && x <= z) { u = z; v = y; }   // espessura em X -> face ±X
    else { u = x; v = z; }                          // espessura em Y -> face ±Y
    // UV girado no próprio buffer (peça 'free', ver rotateGeometryUV90): o
    // atributo u passa a carregar o que era v, então a escala troca junto.
    const girado = !!(geometry.userData && geometry.userData.uvRotated90);
    return girado ? { u: v, v: u } : { u: u, v: v };
  }

  // color = registro da tabela colors ({ texture_url, swatch_hex, name }).
  // O tamanho REAL da face (o que mantinha a textura na escala da chapa em
  // vez de esticar) não entra mais aqui — 2026-08-27, ver loadTexture: agora
  // é pré-escalado direto no UV da geometria, ANTES desta função ser
  // chamada (scaleFaceUV/scaleAllFacesUV, em makeBoxMaterials/
  // buildContentGroup).
  function makeMaterial(color, rotateTexture) {
    // Modo "só cor" (ver estiloDesenho): nem chega a pedir a imagem. É o que
    // faz a cena pesar menos — textura de chapa é o item mais caro aqui, em
    // download e em memória de GPU.
    const textureUrl = estiloDesenho.textura ? (color && color.texture_url) : null;
    const tex = textureUrl ? loadTexture(textureUrl, rotateTexture) : null;
    if (tex) {
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
    }
    const hex = (color && color.swatch_hex) || '#cccccc';
    return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0.05 });
  }

  // ==========================================================================
  // MIOLO DA CHAPA (migration 088) — o que aparece na borda SEM fita
  // ==========================================================================
  // Desenhado em canvas, não carregado de arquivo: é uma faixa de 18mm vista
  // de raspão: uma foto de verdade seria vista a 3 pixels de altura e o custo
  // (upload, Storage, mais um cadastro, offline quebrado no file://) não se
  // pagaria. Procedural também deixa a lâmina do plywood ter espessura
  // coerente independente do tamanho da peça.
  //
  // A diferença entre os três é o que se vê de longe, que é o ponto:
  //   mdp      partícula grossa, granulado bem visível, bege puxando marrom
  //   mdf      denso e liso, quase liso, um marrom mais escuro e uniforme
  //   plywood  lâminas empilhadas — listras claras/escuras atravessando
  const coreImageCache = {};
  function coreImage(tipo) {
    if (coreImageCache[tipo]) return coreImageCache[tipo];

    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const g = cv.getContext('2d');

    if (tipo === 'plywood') {
      // Lâminas: faixas horizontais alternando claro/escuro, com a linha de
      // cola mais escura entre elas. A faixa corre no sentido da LARGURA da
      // borda (V da textura), que é o que se vê num compensado de canto.
      const laminas = 7;
      for (let i = 0; i < laminas; i++) {
        const y = Math.round(i * S / laminas);
        const alt = Math.round(S / laminas);
        g.fillStyle = i % 2 ? '#c9a473' : '#ddbe93';
        g.fillRect(0, y, S, alt);
        g.fillStyle = 'rgba(120,86,48,0.55)';   // linha de cola
        g.fillRect(0, y, S, 1);
      }
      // Fibra dentro de cada lâmina
      for (let i = 0; i < 700; i++) {
        g.fillStyle = 'rgba(150,110,66,' + (0.05 + Math.random() * 0.14).toFixed(2) + ')';
        g.fillRect(Math.random() * S, Math.random() * S, 3 + Math.random() * 9, 1);
      }
    } else {
      g.fillStyle = tipo === 'mdf' ? '#a8825a' : '#d6bd94';
      g.fillRect(0, 0, S, S);
      // MDP tem partícula grande e contrastada; MDF é pó prensado, quase liso.
      const n = tipo === 'mdf' ? 900 : 1500;
      const tamMax = tipo === 'mdf' ? 2 : 6;
      const forca = tipo === 'mdf' ? 0.10 : 0.30;
      for (let i = 0; i < n; i++) {
        const claro = Math.random() > 0.5;
        g.fillStyle = (claro ? 'rgba(245,228,198,' : 'rgba(122,90,52,')
          + (0.05 + Math.random() * forca).toFixed(2) + ')';
        const w = 1 + Math.random() * tamMax;
        const h = 1 + Math.random() * (tamMax * 0.6);
        g.fillRect(Math.random() * S, Math.random() * S, w, h);
      }
    }

    coreImageCache[tipo] = cv;
    return cv;
  }

  // A textura precisa de repeat DIFERENTE por face: a borda de uma prateleira
  // é 800mm × 18mm, e esticar um quadrado nisso viraria um borrão. O repeat
  // vem do tamanho real da face, então a partícula sai do mesmo tamanho em
  // qualquer peça.
  //
  // No plywood tem mais: as lâminas têm que atravessar a ESPESSURA, não
  // correr ao longo dela. As listras do canvas variam no eixo V, então quando
  // a espessura cai no U a textura é girada 90°.
  //
  // Cache por (tipo, tiles, giro) com os tiles arredondados: o conjunto de
  // combinações é pequeno e as texturas são reaproveitadas entre rebuilds.
  // Isso não é só economia — disposeObject3D descarta MATERIAL, não textura,
  // então textura criada por peça a cada update() vazaria na GPU.
  const coreTextureCache = {};
  function coreTexture(tipo, tilesU, tilesV, girar) {
    const u = Math.max(1, Math.min(64, Math.round(tilesU)));
    const v = Math.max(1, Math.min(64, Math.round(tilesV)));
    const chave = tipo + '|' + u + '|' + v + '|' + (girar ? 1 : 0);
    if (coreTextureCache[chave]) return coreTextureCache[chave];
    const t = new THREE.CanvasTexture(coreImage(tipo));
    // sRGB, igual loadTexture faz na textura da cor (2026-08-12, "onde era pra
    // aparecer o MDP está branco em cima da lateral"): sem isto o Three trata
    // o canvas como LINEAR e o renderer converte pra sRGB na saída de novo —
    // o bege #d6bd94 do MDP sai lavado, quase branco. O miolo nasceu assim, o
    // bug só ficou visível quando a escala da textura melhorou o resto.
    if ('colorSpace' in t) {
      t.colorSpace = THREE.SRGBColorSpace;
    } else if ('encoding' in t) {
      t.encoding = THREE.sRGBEncoding;
    }
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    if (girar) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
      t.repeat.set(v, u);
    } else {
      t.repeat.set(u, v);
    }
    coreTextureCache[chave] = t;
    return t;
  }

  // uMm/vMm: tamanho REAL (mm) dos dois lados desta face; espessuraNoU diz
  // se a espessura da peça caiu no eixo U.
  function makeCoreMaterial(color, uMm, vMm, espessuraNoU) {
    const s = (color && color.substrato);
    const tipo = s === 'plywood' || s === 'mdf' ? s : 'mdp';
    // Uma "casa" da textura vale a espessura da peça: é a escala em que o
    // granulado e as lâminas ficam do tamanho que a gente vê na chapa.
    const esp = Math.max(3, espessuraNoU ? uMm : vMm);
    return new THREE.MeshStandardMaterial({
      map: coreTexture(tipo, uMm / esp, vMm / esp, !!espessuraNoU),
      roughness: 0.95, metalness: 0.0
    });
  }

  // ==========================================================================
  // MATERIAL POR FACE — face com cor, borda com fita ou miolo
  // ==========================================================================
  // BoxGeometry aceita 6 materiais, na ordem +X, -X, +Y, -Y, +Z, -Z. A peça
  // tem duas faces GRANDES (as perpendiculares à espessura) — essas sempre
  // levam a cor/textura, como sempre levaram. As outras quatro são as bordas.
  //
  // Qual borda tem fita vem da receita da máquina (0/2/4) traduzida por
  // Pricing.pecaNaMaquina: "2 comprimentos" são os dois lados que MEDEM o
  // comprimento, e pra ir de um ao outro você anda no eixo da LARGURA — daí
  // as faces fitadas serem as perpendiculares a lKey. Essa é a rotação que o
  // Matt pediu: a peça é cadastrada deitada na máquina e desenhada de pé no
  // ambiente, sem dois cadastros.
  //
  // A fita é do mesmo material da face (fita e chapa são a mesma cor — é por
  // isso que colors tem edge_price_per_linear_m). Sem receita cadastrada
  // (edge_banding null, que é todo componente antes da 088) devolve null e
  // quem chama usa um material só, exatamente como antes.
  //
  // Cada papel monta a BoxGeometry com a espessura num eixo diferente
  // ('left' nasce (espessura, faceA, faceB), 'back' nasce (faceA, faceB,
  // espessura), a porta nasce (largura, altura, espessura)...). Em vez de
  // repetir essa tabela aqui — e ter que lembrar dela toda vez que um papel
  // novo aparecer — o mapeamento é DEDUZIDO: cada eixo da geometria é casado
  // com o eixo do módulo que tem aquela medida. A geometria é construída a
  // partir de w/h/d, então o casamento sempre existe.
  //
  // Peça com dois lados iguais (quadrada) é ambígua, e tudo bem: se os dois
  // lados medem o mesmo, comprimento e largura são o mesmo número e as duas
  // leituras dão a mesma metragem de fita.
  function eixosDaGeometria(geometry, part) {
    const p = geometry && geometry.parameters;
    if (!p) return null;
    const alvo = { w: (part.width_mm || 0) / 1000, h: (part.height_mm || 0) / 1000, d: (part.depth_mm || 0) / 1000 };
    const sobra = ['w', 'h', 'd'];
    const casa = function (medida) {
      let melhor = 0, dif = Infinity;
      sobra.forEach(function (k, i) {
        const e = Math.abs(alvo[k] - medida);
        if (e < dif) { dif = e; melhor = i; }
      });
      return sobra.splice(melhor, 1)[0];
    };
    return { x: casa(p.width), y: casa(p.height), z: casa(p.depth) };
  }

  function makeBoxMaterials(geometry, part, color, rotateTexture) {
    if (!part || part.edge_banding == null) return null;
    if (typeof Pricing === 'undefined' || !Pricing.pecaNaMaquina) return null;
    const ax = eixosDaGeometria(geometry, part);
    if (!ax) return null;

    const m = Pricing.pecaNaMaquina(
      part.width_mm || 0, part.height_mm || 0, part.depth_mm || 0, part.positioning);
    const mm = { w: part.width_mm || 0, h: part.height_mm || 0, d: part.depth_mm || 0 };

    // FUNDO COM VEIO TRAVADO — a fita não pode seguir "C = lado maior" da
    // máquina quando o veio já é uma escolha FIXA do cadastro (Matt,
    // 2026-08-18: "a borda trocou, mas a textura ainda tá no mesmo veio...
    // como uma parte da peça gira e a outra não" — só o fundo, a única peça
    // que ele viu girar, e a POSIÇÃO da peça nunca muda, só a orientação).
    //
    // resolveGrainRotate (a textura) olha part.veio ANTES de qualquer
    // magnitude — 'horizontal'/'vertical' travam, sem depender de w×h.
    // Pricing.pecaNaMaquina (a fita, logo acima) NUNCA soube que part.veio
    // existe: sempre escolhe o lado maior como "comprimento" (mesma regra
    // do plano de corte/.ban, que é onde ela TEM que valer). Resultado: ao
    // esticar o módulo, a fita pula de par de borda sozinha (magnitude)
    // enquanto o veio (corretamente travado) fica parado — a peça "gira
    // pela metade".
    //
    // ESCOPO: só aqui no desenho 3D, só quando o papel é 'back' (único
    // reportado) e só quando o veio está TRAVADO (não 'livre'/ausente) —
    // sem veio travado não há nada fixo pra sincronizar, e o comportamento
    // de sempre (C = lado maior, igual pricing/drilling) continua idêntico.
    // Pricing.pecaNaMaquina em si NÃO muda — preço, .ban e plano de corte
    // continuam no plano da máquina, que é onde esse "gira" É correto.
    if (part.position_role === 'back' && (part.veio === 'horizontal' || part.veio === 'vertical')) {
      // Mesma leitura que resolveGrainRotate faz pro fundo (uM=faceA=width,
      // vM=faceB=height): 'horizontal' é o mesmo resultado de width>=height
      // (cKey='w'), 'vertical' o mesmo de height>width (cKey='h') — força a
      // MESMA escolha que a rota 'livre' já faria nesse caso, só sem
      // depender da magnitude atual.
      m.lKey = part.veio === 'horizontal' ? 'h' : 'w';
    }

    // BASE/PRATELEIRA/TOPO EM MÓDULO QUASE QUADRADO — a fita sumia (virava
    // miolo/cor da madeira) numa borda que devia ser da cor do móvel (Matt,
    // 2026-08-18, com foto: "são as bases, dá pra ver que a borda não é da
    // cor do móvel, ela tá na cor da madeira (sem borda)").
    //
    // migration 097: a receita de fita É POR PAPEL — "sempre uma prateleira
    // vai ser 2 lados" — e pra base/prateleira/topo esses "2 lados" SEMPRE
    // são frente+fundo (os únicos bordos expostos: esquerda/direita ficam
    // escondidos encostados nas laterais do casco). Isso NUNCA devia
    // depender de qual medida é maior.
    //
    // Só que `Pricing.pecaNaMaquina` (a fita, acima) não sabe de papel
    // nenhum — só olha w×h×d e escolhe C(comprimento)=o lado MAIOR entre
    // width/depth, L(largura)=o menor, e é o par perpendicular a L que
    // recebe a fita de 2 lados. No caso comum (módulo mais largo que
    // fundo) largura=depth por acaso já dá o resultado certo (fita na
    // frente/fundo) — mas quando o módulo fica mais FUNDO que LARGO (ou
    // quase quadrado, onde arredondamento de polegada pode empurrar pra
    // qualquer lado — foi exatamente o caso reportado, módulo ~31.5"×31.5"),
    // depth vira "maior" (cKey), largura vira 'width' (lKey), e a fita pula
    // pro par ERRADO (esquerda/direita) — a frente/fundo, que É onde a fita
    // tinha que estar, fica sem nada (miolo/madeira à mostra).
    //
    // ESCOPO: top/bottom/shelf/countertop (os papéis com receita fixa
    // "2 lados = frente+fundo") — 'd' é sempre a largura(L) pra fita aqui,
    // nunca o lado maior. Guard `m.tKey !== 'd'` pra não colidir com
    // positioning 'vertical_no_plano'/'horizontal_no_plano' (onde 'd' É a
    // espessura, não uma face — caso raro, não visto em produção nesses
    // papéis, mas mais seguro checar). Pricing.pecaNaMaquina em si continua
    // INTOCADO — preço/plano de corte/.ban seguem "lado maior" de propósito.
    //
    // 2026-08-19 (8ª virada): estendido pro papel 'free' — Matt, com foto de
    // um armário feito no Construtor de Armário: "essas bordas devem ficar
    // sempre pra frente [...] quando a largura fica maior que o comprimento
    // a borda gira". As peças da foto (divisórias/bases divisórias entre
    // gavetas) nascem do LayoutEngine com position_role SEMPRE 'free'
    // (toPieceRows, js/layout-engine.js linha ~644 — "a peça gerada sai
    // sempre com position_role='free'... é o papel mais simples e o único
    // sem comportamento automático por cima"). É o MESMO bug da 6ª virada
    // (base/prateleira/topo em módulo quase quadrado): sem papel próprio
    // cadastrado, `Pricing.pecaNaMaquina` escolhe o par de fita pelo lado
    // MAIOR (magnitude), e quando o módulo fica mais largo que fundo (o
    // caso reportado) a peça 'free' às vezes cai do lado errado — igual às
    // pré-existentes 'top'/'bottom'/'shelf' antes do fix de 18/08. Pra uma
    // peça 'free' sem `positioning` cadastrado (a esmagadora maioria: ela
    // NASCE sem positioning, ver comentário da própria função), o eixo da
    // FRENTE do módulo é sempre 'd' (profundidade) — vale tanto pra uma
    // divisória vertical (frente/fundo são as pontas expostas) quanto pra
    // uma base divisória horizontal (mesma lógica de prateleira). Mesmo
    // guard `m.tKey !== 'd'` protege peças 'free' que por acaso vieram com
    // a espessura no eixo de profundidade (positioning *_no_plano) — aí a
    // frente já é face colorida, não borda, e o código não mexe.
    if (
      (part.position_role === 'top' || part.position_role === 'bottom' ||
        part.position_role === 'shelf' || part.position_role === 'countertop' ||
        part.position_role === 'free') &&
      m.tKey !== 'd'
    ) {
      m.lKey = 'd';
    }

    // Fita e chapa são a MESMA cor (é por isso que colors tem
    // edge_price_per_linear_m e não uma cor própria) — mas desde a escala
    // física da textura (2026-08-12) não podem mais ser a mesma INSTÂNCIA de
    // material: a face grande tem 600×2000mm e a fita 18×2000mm, e cada uma
    // precisa do seu próprio repeat pra textura sair no tamanho da chapa. São
    // no máximo 3 materiais por peça (um por par de faces), e a TEXTURA
    // continua compartilhada via cache (ver loadTexture), que é o que
    // realmente pesa na GPU.
    //
    // Orientação UV de cada par de faces numa BoxGeometry, em eixos da
    // GEOMETRIA (o Three fixa isto): ±X -> U=Z, V=Y; ±Y -> U=X, V=Z;
    // ±Z -> U=X, V=Y. Traduzido pra eixos do MÓDULO via ax.
    const UV = {
      x: { u: ax.z, v: ax.y },
      y: { u: ax.x, v: ax.z },
      z: { u: ax.x, v: ax.y }
    };

    // Pra cada par de faces, o material sai do eixo do módulo que aquele par
    // atravessa: espessura -> face grande (cor); largura -> os lados do
    // COMPRIMENTO; comprimento -> os lados da largura.
    // Índice do par de faces (±X/±Y/±Z) na ORDEM que o Three usa nos
    // groups de uma BoxGeometry — mesma ordem do array [mx,mx,my,my,mz,mz]
    // abaixo. Usado por scaleFaceUV pra escalar só os vértices DESSE par
    // (2026-08-27, ver loadTexture pro motivo: a escala física saiu da
    // Texture, foi pro UV da geometria).
    const PAIR_INDEX = { x: 0, y: 1, z: 2 };
    const doPar = function (geoEixo) {
      const eixo = ax[geoEixo];
      const uv = UV[geoEixo];
      const pairIndex = PAIR_INDEX[geoEixo];
      if (eixo === m.tKey) {
        scaleFaceUV(geometry, pairIndex, quantizaRepeat(mm[uv.u]), quantizaRepeat(mm[uv.v]), rotateTexture);
        return makeMaterial(color, rotateTexture);
      }
      const temFita = eixo === m.lKey ? part.edge_banding >= 2 : part.edge_banding === 4;
      if (temFita) {
        scaleFaceUV(geometry, pairIndex, quantizaRepeat(mm[uv.u]), quantizaRepeat(mm[uv.v]), rotateTexture);
        return makeMaterial(color, rotateTexture);
      }
      return makeCoreMaterial(color, mm[uv.u], mm[uv.v], uv.u === m.tKey);
    };
    const mx = doPar('x'), my = doPar('y'), mz = doPar('z');
    return [mx, mx, my, my, mz, mz];
  }

  // Cria a câmera de acordo com projectionMode atual — Perspectiva (padrão,
  // sempre foi assim) ou Ortográfica ("visão paralela"). A ortográfica nasce
  // com um frustum qualquer (-1..1) só de placeholder; quem chama sempre
  // reenquadra de verdade logo em seguida (update()/setProjectionMode), que
  // recalcula left/right/top/bottom a partir do módulo desenhado.

  // Diagnóstico de peso de textura na GPU (Matt, 27/08 — investigando o
  // crash "Error allocating Texture2D"/"Context Lost" em projeto grande e
  // a demora ao inserir/editar peça, ver [[viewer3d_composition_texture_dispose_bug]]
  // e [[decor_itens_geometria_propria_141]]). SÓ LEITURA — não muda nada,
  // não afeta render nenhum. Conta quantas entradas distintas o cache de
  // loadTexture() acumulou nesta aba (cada entrada = 1 upload de GPU) e
  // estima o peso em VRAM (largura×altura×4 bytes RGBA8, ×1.33 de folga
  // pra mipmap). Agrupa por URL base pra mostrar quantas VARIANTES DE
  // TAMANHO a MESMA imagem de acabamento acumulou — é isso que multiplica
  // o consumo (a mesma foto de chapa usada em peças de tamanhos/rotações
  // diferentes vira N uploads na GPU, não 1), ver comentário de
  // loadTexture/quantizaRepeat. Roda no console do navegador (F12), com o
  // projeto grande já aberto: Viewer3D.textureMemoryReport()
  function textureMemoryReport() {
    const porUrl = {};
    let totalBytes = 0;
    let semDimensao = 0;
    Object.keys(textureCache).forEach((chave) => {
      const tex = textureCache[chave];
      const url = chave.split('|')[0];
      const img = tex && tex.image;
      const w = (img && (img.naturalWidth || img.width)) || 0;
      const h = (img && (img.naturalHeight || img.height)) || 0;
      const bytes = w && h ? Math.round(w * h * 4 * 1.33) : 0;
      if (!bytes) semDimensao++;
      totalBytes += bytes;
      if (!porUrl[url]) porUrl[url] = { variantes: 0, bytes: 0, w, h };
      porUrl[url].variantes++;
      porUrl[url].bytes += bytes;
    });
    const resumoPorUrl = Object.keys(porUrl).map((url) => ({
      url: url.length > 60 ? '...' + url.slice(-57) : url,
      variantes: porUrl[url].variantes,
      dimensaoAprox: porUrl[url].w + '×' + porUrl[url].h,
      mbEstimado: Number((porUrl[url].bytes / 1024 / 1024).toFixed(1))
    })).sort((a, b) => b.variantes - a.variantes);

    const totalMb = Number((totalBytes / 1024 / 1024).toFixed(1));
    const totalEntradas = Object.keys(textureCache).length;
    const totalMiolo = Object.keys(coreTextureCache).length;

    console.log(
      '[Viewer3D] Texturas de cor/chapa: ' + totalEntradas + ' uploads distintos na GPU, ~' +
      totalMb + ' MB estimados (RGBA8 + mipmap). Miolo/MDP (procedural, leve): ' + totalMiolo + ' uploads.' +
      (semDimensao ? ' ' + semDimensao + ' entradas ainda sem dimensão conhecida (imagem não carregou).' : '')
    );
    if (typeof console.table === 'function') console.table(resumoPorUrl);
    return { totalEntradas, totalMb, totalMiolo, porUrl: resumoPorUrl };
  }

  function createCamera(width, height) {
    if (projectionMode === 'orthographic') {
      return new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
    }
    return new THREE.PerspectiveCamera(35, width / height, 0.01, 100);
  }

  function init(containerId) {
    if (!available()) return;
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;

    scene = new THREE.Scene();
    // Fundo BRANCO sólido (pedido do usuário) — pintado pelo próprio Three.js
    // antes de qualquer peça, então tanto o visualizador ao vivo quanto
    // qualquer imagem gerada (snapshot() — "Imagem 3D do módulo" no admin,
    // miniatura do carrinho, thumbnail da composição) sempre saem com fundo
    // branco de verdade (pixel opaco), não transparente dependendo de que
    // cor tem por trás na tela onde a imagem for usada depois.
    scene.background = new THREE.Color(0xffffff);

    // Ver comentário na declaração de moduleGroup, acima — criado uma vez
    // por init(), nunca recriado por update() (só reposicionado no eixo Y).
    moduleGroup = new THREE.Group();
    scene.add(moduleGroup);

    const width = containerEl.clientWidth || 300;
    const height = containerEl.clientHeight || 320;

    camera = createCamera(width, height);

    // preserveDrawingBuffer: true — necessário pra snapshot() conseguir ler o
    // canvas via toDataURL() (usado pelo portal do cliente pra gerar a
    // miniatura de cada módulo adicionado ao pedido). Sem isso, o buffer
    // pode já ter sido limpo pelo navegador no momento da leitura.
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    if ('outputColorSpace' in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    containerEl.innerHTML = '';
    containerEl.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    // Sem amortecimento — câmera 1:1 com o ponteiro (mesma decisão e mesmo
    // motivo do viewer3d_composition.js, 2026-08-13: o damping de 0.08 deixava
    // a cena ~12 quadros atrás do mouse e ainda escorregando depois de soltar).
    controls.enableDamping = false;
    controls.minDistance = 0.3;
    controls.maxDistance = 8;
    controls.maxPolarAngle = Math.PI * 0.49; // não deixa olhar de baixo pra cima

    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.15));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(2, 3, 2);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
    fillLight.position.set(-2, 1, -2);
    scene.add(fillLight);

    textureLoader = new THREE.TextureLoader();

    raycaster = new THREE.Raycaster();
    // Line.threshold vem 1 por padrão e a unidade aqui é o METRO: sem isto o
    // raio acerta qualquer contorno que passe a até 1m dele. Mesma correção e
    // mesmo motivo do viewer3d_composition.js (2026-08-13) — lá isso fazia o
    // clique pegar o módulo a um metro de distância dele.
    raycaster.params.Line.threshold = 0.0005;
    if (raycaster.params.Points) raycaster.params.Points.threshold = 0.0005;
    renderer.domElement.addEventListener('dblclick', handleDoubleClick);

    window.addEventListener('resize', onResize);
    animate();
  }

  // Duplo-clique no canvas -> acha a peça 3D sob o cursor (raycaster) e, se
  // ela tiver userData.pieceInfo (ver tagPieceUserData), avisa quem chamou
  // Viewer3D.onPieceDoubleClick(cb) com a info + a posição de TELA do clique
  // (event.clientX/clientY), pra desenhar um balão perto do ponto clicado.
  // Sobe a árvore a partir do mesh/aresta realmente atingido até achar o
  // ancestral mais próximo com pieceInfo — necessário porque cada peça é um
  // Group (caixa + aresta, ver buildContentGroup) e uma peça-módulo aninhada
  // pode ter várias camadas de sub-grupos (ver buildModuleAssembly): o
  // ancestral MAIS PRÓXIMO garante que clicar numa peça interna (ex: uma
  // prateleira dentro de uma gaveta aninhada) mostra a info dessa peça
  // interna, não a da gaveta inteira por fora.
  function handleDoubleClick(event) {
    if (!raycaster || !camera || !renderer || !partMeshes.length) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(partMeshes, true);
    if (!intersects.length) return;
    let obj = intersects[0].object;
    let info = null;
    while (obj) {
      if (obj.userData && obj.userData.pieceInfo) { info = obj.userData.pieceInfo; break; }
      obj = obj.parent;
    }
    if (info && onPieceDoubleClickCb) onPieceDoubleClickCb(info, event.clientX, event.clientY);
  }

  // Registrado por client.js/portal.js na inicialização da página pra
  // receber (pieceInfo, clientX, clientY) toda vez que uma peça com info for
  // duplo-clicada — ver handleDoubleClick.
  function onPieceDoubleClick(cb) {
    onPieceDoubleClickCb = cb;
  }

  function onResize() {
    if (!containerEl || !camera || !renderer) return;
    const w = containerEl.clientWidth || 300;
    const h = containerEl.clientHeight || 320;
    // OrthographicCamera não tem ".aspect" (o enquadramento dela vem de
    // left/right/top/bottom, recalculados só quando o módulo é redesenhado —
    // ver update()/setProjectionMode) — só a Perspectiva usa aspect ratio.
    if (camera.isPerspectiveCamera) {
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);
    if (controls) controls.update();
    openables.forEach((op) => {
      if (op.kind === 'hinge') {
        const diff = op.targetAngle - op.currentAngle;
        if (Math.abs(diff) > 0.0005) {
          op.currentAngle += diff * 0.14;
          // basculante/basculante inverso giram em X (ver
          // positionWithOpening); dobradiça comum (left/right) em Y, como
          // sempre.
          if (op.hingeSide === 'top' || op.hingeSide === 'bottom') {
            op.group.rotation.x = op.currentAngle;
          } else {
            op.group.rotation.y = op.currentAngle;
          }
          // Pistão a gás (basculante) tem uma ponta fixa no corpo e outra
          // presa na porta — precisa ser recalculado a cada quadro que a
          // porta girar (ver placeFlapHardware). Ferragem comum (dobradiça
          // de embutir, pé...) nasce inteira dentro do grupo que já gira/já
          // é fixo, não precisa disso.
          if (op.group.userData && op.group.userData.updateStruts) {
            op.group.userData.updateStruts();
          }
        }
      } else if (op.kind === 'slide') {
        const diff = op.targetOffset - op.currentOffset;
        if (Math.abs(diff) > 0.0002) {
          op.currentOffset += diff * 0.14;
          op.group.position.z = op.baseZ + op.currentOffset;
        }
      }
    });
    // Não desenha o que ninguém está vendo — mesma decisão e mesmo motivo do
    // viewer3d_composition.js (2026-08-13). O viewer escondido das miniaturas
    // continuava renderizando a cena a cada quadro. snapshot() renderiza por
    // conta própria antes do toDataURL, então a miniatura não muda.
    if (containerEl && (!containerEl.clientWidth || !containerEl.clientHeight)) return;
    renderer.render(scene, camera);
  }

  // Descobre qual dos 3 eixos resolvidos (w,h,d) da peça é a "espessura" e
  // devolve { thickness, faceA, faceB } pra facilitar a montagem por posição.
  //
  // positioning (migration 024 — component_types.positioning, ver
  // client.js/portal.js) declara EXPLICITAMENTE o eixo, substituindo a
  // heurística por menor dimensão quando cadastrado no Tipo de componente:
  //   'horizontal'          -> espessura = h (fino na altura; faceA=w, faceB=d)
  //   'vertical'            -> espessura = w (fino na largura; faceA=h, faceB=d)
  //   'vertical_no_plano'/
  //   'horizontal_no_plano' -> espessura = d (fino na profundidade;
  //                            faceA=w, faceB=h) — os dois só diferem no
  //                            giro da textura (ver resolveRotateTexture),
  //                            não no eixo.
  // Sem positioning (null/undefined/valor desconhecido) cai pro
  // comportamento ANTIGO: a menor das 3 dimensões vira espessura — mantém
  // módulos já cadastrados exatamente como estavam antes desta migration.
  function splitThickness(w, h, d, positioning) {
    if (positioning === 'horizontal') return { thickness: h, faceA: w, faceB: d };
    if (positioning === 'vertical') return { thickness: w, faceA: h, faceB: d };
    if (positioning === 'vertical_no_plano' || positioning === 'horizontal_no_plano') {
      return { thickness: d, faceA: w, faceB: h };
    }
    const dims = [w, h, d];
    const minIdx = dims.indexOf(Math.min(w, h, d));
    const thickness = dims[minIdx];
    const rest = dims.filter((_, i) => i !== minIdx);
    return { thickness, faceA: rest[0], faceB: rest[1] };
  }

  // Decide se a textura da peça nasce com o UV girado (grão da madeira no
  // sentido horizontal) ou não (sentido vertical) — migration 024. Peças
  // 'horizontal' sempre giram (uma travessa larga e baixa precisa do grão
  // correndo na horizontal, diferente de uma porta alta e estreita).
  // 'horizontal_no_plano' também gira, mas no sentido OPOSTO — 90° pra
  // DIREITA em vez do giro padrão (pedido do usuário, 2026-07-11: "pra esse
  // tipo de posicionamento quero que a textura gire 90 graus pra direita,
  // por que eu viro a peça pra esse tipo" — a peça física é montada virada
  // pra este positioning específico, então precisa do giro contrário pro
  // veio da madeira sair certo). Mesmo eixo de espessura que 'horizontal'
  // (ver splitThickness) — só o giro da textura muda entre os dois.
  // 'vertical'/'vertical_no_plano' nunca giram. Sem positioning cadastrado,
  // usa o `fallback` (o valor hardcoded que cada position_role já usava
  // antes desta migration), preservando a aparência de módulos existentes.
  function resolveRotateTexture(positioning, fallback) {
    if (positioning === 'horizontal_no_plano') return 'right';
    if (positioning === 'horizontal') return true;
    if (positioning === 'vertical' || positioning === 'vertical_no_plano') return false;
    return fallback;
  }

  // SENTIDO DO VEIO NO DESENHO
  // ======================================================================
  // HISTÓRICO, porque a regra já virou duas vezes:
  //
  //   2026-08-12 — o desenho passou a copiar a conta do plano de corte
  //   (LayoutEngine.validar: peça de veio 'livre' recebe
  //   `p.veio = p.w >= p.h ? 'horizontal' : 'vertical'`), pra TODA peça de
  //   painel. Motivo: rodapé/travessa saíam com o veio em pé na tela e
  //   deitados na chapa.
  //
  //   2026-08-16 (manhã) — a conta do lado longo ficou SÓ NO FUNDO: a troca
  //   comprimento/largura é assunto da máquina, e no projeto ela fazia a
  //   lateral de um módulo baixo virar sozinha.
  //
  //   2026-08-16 (tarde) — REGRESSÃO E AJUSTE. Tirar a regra de TUDO que não
  //   era fundo levou junto a peça 'free', e a base divisória do construtor
  //   (761 × 19,5) passou a desenhar com o veio EM PÉ, seguindo um
  //   `positioning` que ela não tem. "a prateleira não tá com textura certa
  //   [...] não é uma prateleira, é uma base divisória" (Matt).
  //   O corte certo não é "fundo x resto", é POR PAPEL: onde existe
  //   orientação declarada (lateral, topo, base, prateleira, porta) o formato
  //   não opina; onde não existe (fundo, peça livre) ele é a única fonte.
  //   Ver PAPEIS_VEIO_PELO_FORMATO.
  //
  // O plano de corte, o preço e o .ban NÃO passam por aqui — eles continuam
  // com a conta do lado longo (LayoutEngine.validar). Este arquivo é só o
  // desenho.
  //
  // uM/vM = os dois lados da face VISÍVEL desta peça, nos eixos U e V da
  // textura (o Three fixa isso por par de face: ±X -> U=Z,V=Y; ±Y -> U=X,V=Z;
  // ±Z -> U=X,V=Y). true = veio no sentido do U, false = no sentido do V.
  //
  // Acima de tudo: cor/componente com veio CADASTRADO ('horizontal'/
  // 'vertical', migration 086) manda — é exigência estética e não tem
  // jeitinho, mesma frase do LayoutEngine. Aí nem o formato nem o
  // positioning opinam.
  // 2026-08-16 — SÓ O FUNDO deita pelo lado longo.
  // Matt, olhando um módulo baixo: "as laterais estão invertindo no desenho
  // quando ficam muito baixas [...] isso deve acontecer na máquina, mas não no
  // projeto, a laminação e principalmente o veio da peça não pode mudar na
  // lateral (só muda no fundo por uma questão de chapa)".
  //
  // Uma lateral de 300 de altura por 600 de profundidade caía em `uM >= vM` e
  // saía com o veio deitado — o desenho contradizia a peça. A troca
  // comprimento/largura é assunto da MÁQUINA (LayoutEngine.validar continua
  // gravando p.veio pelo lado longo, e o plano de corte/.ban seguem iguais);
  // o projeto tem que mostrar a peça como ela é.
  //
  // O fundo é a única exceção, e por um motivo físico: ele deita pra caber na
  // chapa ("quando o lado maior for largura o fundo deve ter a textura
  // deitada"), e é essa regra que limita o móvel.
  //
  // CUIDADO: isto REVERTE, de propósito, a parte de rodapé/travessa do pedido
  // de 2026-08-12 ("todo rodapé e travessa deve ser deitado") PRA PEÇA 'free'
  // sem veio cadastrado. Se um rodapé voltar a aparecer com o veio em pé
  // DEPOIS de conferir que ele está em PAPEIS_VEIO_PELO_FORMATO, o conserto é
  // no CADASTRO da peça (positioning 'horizontal'), não em reabrir a regra de
  // formato aqui.
  // PAPÉIS EM QUE O FORMATO DECIDE O VEIO LIVRE.
  // 'back'         — o fundo deita pra caber na CHAPA. Limitação física.
  // 'free'/'other' — a peça que não declara orientação nenhuma: travessa (o
  //                  papel 'Travamento' saiu na migration 026) e, desde o
  //                  construtor, a base divisória e a divisória, que nascem
  //                  do LayoutEngine com position_role 'free'.
  //                  Aqui o formato é a ÚNICA informação que existe.
  // 'baseboard'    — rodapé tem PAPEL PRÓPRIO (não é 'free' — ver
  //                  POSITION_ROLE_LABELS em admin.js), e por isso tinha
  //                  ficado de fora desta lista até 2026-08-19: sem
  //                  'baseboard' aqui, resolveGrainRotate caía direto no
  //                  fallback=false que o placePart('baseboard') passa,
  //                  então o veio saía sempre EM PÉ quando a peça não tinha
  //                  `positioning` cadastrado — exatamente a regra de
  //                  2026-08-12 que o comentário acima descreve, só que
  //                  nunca tinha sido aplicada de fato pro papel 'baseboard'.
  //                  Ver memória do projeto "veio no desenho" / rodapé.
  // Todo o resto (left/right/top/bottom/shelf/front/drawer) tem orientação
  // própria e NÃO opina por formato — foi isso que fazia a lateral de um
  // módulo baixo virar sozinha.
  const PAPEIS_VEIO_PELO_FORMATO = { back: 1, free: 1, other: 1, baseboard: 1 };
  function resolveGrainRotate(part, uM, vM, fallback) {
    const veio = part && part.veio;
    if (veio === 'horizontal') return true;
    if (veio === 'vertical') return false;
    const papel = (part && part.position_role) || 'other';
    if (PAPEIS_VEIO_PELO_FORMATO[papel] && (!veio || veio === 'livre')) return uM >= vM;
    return resolveRotateTexture(part && part.positioning, fallback);
  }

  // Espessura resolvida (em metros) de uma peça já calculada — usado só pra
  // descobrir onde a base/topo terminam, e assim distribuir as prateleiras
  // dentro do VÃO INTERNO real do módulo (ver placePart -> 'shelf').
  function resolveThickness(part) {
    if (!part) return 0;
    const w = Math.max((part.width_mm || 0) / 1000, 0.002);
    const h = Math.max((part.height_mm || 0) / 1000, 0.002);
    const d = Math.max((part.depth_mm || 0) / 1000, 0.002);
    return splitThickness(w, h, d, part.positioning).thickness;
  }

  // Descarta geometry/material de um Object3D e de TODA a árvore de filhos
  // dele, recursivamente — necessário porque uma peça pode ser, hoje, uma
  // montagem aninhada de profundidade arbitrária (módulo dentro de módulo
  // dentro de módulo — ver buildModuleAssembly), não só 1-2 níveis fixos
  // (mesh+aresta, ou pivô+mesh+aresta) como antes.
  function disposeObject3D(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
    (obj.children || []).forEach(disposeObject3D);
  }

  function clearParts() {
    partMeshes.forEach((group) => {
      (moduleGroup || scene).remove(group);
      disposeObject3D(group);
    });
    partMeshes = [];
    openables = [];
  }

  // Recebe uma geometria "crua" (BoxGeometry/CylinderGeometry de uma peça
  // simples) OU um Group já pronto (uma montagem aninhada inteira — ver
  // buildModuleAssembly) e devolve sempre um Group: caixa colorida + aresta
  // preta por cima (THREE.EdgesGeometry) no caso da geometria crua, ou o
  // próprio Group intacto no caso de já vir pronto (uma peça-módulo aninhada
  // já é, ela mesma, um Group com suas próprias peças internas — não faz
  // sentido nem é possível "envolver" ela numa aresta única).
  // Aresta preto puro + opaco (0x000000, sem transparência) fazia a linha
  // ficar muito forte/grossa no print 3D — pedido do usuário (2026-07-21):
  // "o desenho vem com contornos pretos muito grandes, e a IA entende que
  // sao negativos, ou confunde ela" — a IA (Gemini) interpretava a aresta
  // preta pesada como se fosse um vão/corte de verdade na peça, em vez de
  // só uma linha de contorno. Cinza escuro + opacidade reduzida continua
  // marcando a borda de cada peça (útil pro cliente ver os limites no
  // configurador on-screen), mas sem o contraste extremo que confundia o
  // material na hora de gerar a imagem realista.
  const EDGE_COLOR = 0x3a3a3a;
  const EDGE_OPACITY = 0.45;

  // ==========================================================================
  // ESTILO DE DESENHO — pedido do Matt (2026-08-13)
  // ==========================================================================
  // "uns botões... que deixe o 3d com linhas mais grossas, com linhas
  // transparentes, e com texturas só de cores, pra pesar menos se quiser. ou
  // também sem linhas grossas, deixar com linha fina como opcional".
  //
  //   contorno: 'fino' (padrão) | 'grosso' | 'suave' | 'nenhum'
  //   textura:  true (madeira)  | false (só a cor da chapa — bem mais leve:
  //             nenhuma imagem baixada, nenhuma textura na GPU)
  //
  // 'grosso' NÃO usa linewidth: WebGL ignora linewidth > 1 em praticamente
  // todo navegador/plataforma (limitação do ANGLE), e foi por isso que
  // material.linewidth = 2 nunca fez efeito em lugar nenhum deste projeto. O
  // traço grosso aqui é uma linha DESENHADA DUAS VEZES com um deslocamento
  // mínimo em cada eixo — barato e funciona em qualquer GPU.
  //
  // O estilo é global e só vale na PRÓXIMA montagem: quem troca precisa
  // remontar a cena (o portal chama renderProjectCanvas logo depois).
  //   face: 'solido' (padrão) | 'translucido' | 'nenhum' (só as arestas)
  const estiloDesenho = { contorno: 'fino', textura: true, face: 'solido' };
  function setDrawStyle(opts) {
    if (!opts) return estiloDesenho;
    if (opts.contorno) estiloDesenho.contorno = opts.contorno;
    if (opts.face) estiloDesenho.face = opts.face;
    if (opts.textura !== undefined) estiloDesenho.textura = !!opts.textura;
    return estiloDesenho;
  }
  function getDrawStyle() {
    return { contorno: estiloDesenho.contorno, textura: estiloDesenho.textura, face: estiloDesenho.face };
  }

  // Aplica o estilo de FACE no material já montado — depois, e não dentro do
  // makeMaterial, porque uma peça pode ter material POR FACE (migration 088:
  // face com a cor, borda com fita) e todos precisam do mesmo tratamento.
  //
  // 'nenhum' usa material.visible (não object.visible): o Raycaster do Three
  // olha para object.visible, então a peça continua sendo alvo de clique
  // mesmo sem aparecer — é o que mantém o móvel selecionável no modo "só
  // arestas".
  //
  // depthWrite:false no translúcido evita que a peça da frente apague as de
  // trás no buffer de profundidade, que é o efeito que faz um móvel
  // "transparente" mostrar só a primeira camada e parecer quebrado.
  function aplicaEstiloFace(material) {
    const f = estiloDesenho.face;
    if (!material || f === 'solido') return material;
    const lista = Array.isArray(material) ? material : [material];
    lista.forEach((m) => {
      if (!m) return;
      if (f === 'nenhum') { m.visible = false; return; }
      m.transparent = true;
      m.opacity = 0.28;
      m.depthWrite = false;
    });
    return material;
  }

  // Monta o contorno de uma peça conforme o estilo. Devolve null quando o
  // estilo é 'nenhum' — aí o grupo da peça sai sem contorno nenhum, que é o
  // desenho mais leve possível.
  function buildEdgesForStyle(geometria) {
    const est = estiloDesenho.contorno;
    if (est === 'nenhum') return null;
    // 'grosso' é PRETO CHEIO (pedido do Matt, 2026-08-13: "esse pode deixar
    // preto"). O cinza de 45% do padrão existe pra não competir com a madeira;
    // no traço grosso o objetivo é o oposto — é o modo de "desenho técnico",
    // onde a linha tem que dominar. Os outros modos seguem o cinza de sempre.
    const preto = est === 'grosso';
    const opacidade = est === 'suave' ? 0.16 : (preto ? 1 : EDGE_OPACITY);
    const eg = new THREE.EdgesGeometry(geometria);
    const mat = new THREE.LineBasicMaterial({
      color: preto ? 0x000000 : EDGE_COLOR,
      transparent: !preto, opacity: opacidade
    });
    const linha = new THREE.LineSegments(eg, mat);
    if (est !== 'grosso') return linha;
    // Traço grosso: 4 cópias deslocadas de 0,4mm nas diagonais do plano da
    // tela. Em escala de metros isso é 0.0004 — invisível como deslocamento,
    // suficiente pra engrossar o traço.
    const grosso = new THREE.Group();
    grosso.add(linha);
    const d = 0.0004;
    [[d, d, 0], [-d, d, 0], [d, -d, 0], [-d, -d, 0]].forEach((o) => {
      const c = new THREE.LineSegments(eg, mat);
      c.position.set(o[0], o[1], o[2]);
      grosso.add(c);
    });
    return grosso;
  }
  function buildContentGroup(contentOrGeometry, color, rotateTexture) {
    if (contentOrGeometry && contentOrGeometry.isGroup) return contentOrGeometry;
    // Fita/miolo por face (migration 088) só em caixa: um cabide tubular é
    // cilindro e não tem borda de chapa pra mostrar. Sem receita cadastrada,
    // makeBoxMaterials devolve null e cai no material único de sempre.
    const ehCaixa = !!(contentOrGeometry && contentOrGeometry.type === 'BoxGeometry');
    const materiais = ehCaixa
      ? makeBoxMaterials(contentOrGeometry, activePart, color, rotateTexture)
      : null;
    // Sem receita de fita (todo componente antes da 088) é UM material nos 6
    // lados — aí o repeat sai da face grande (ver dimensoesDaFaceMm), agora
    // pré-escalado direto no UV dos 6 lados (scaleAllFacesUV) em vez de
    // tex.repeat por instância de Texture (ver loadTexture, 2026-08-27) — 1
    // textura só por cor/giro, não mais 1 por tamanho de peça. Peça que não
    // é caixa (cabide tubular) fica com faceMm null, sem escala nenhuma
    // (comportamento antigo, textura esticada na peça inteira).
    const faceMm = ehCaixa ? dimensoesDaFaceMm(contentOrGeometry) : null;
    if (faceMm && !materiais) {
      scaleAllFacesUV(contentOrGeometry, quantizaRepeat(faceMm.u), quantizaRepeat(faceMm.v), rotateTexture);
    }
    const mesh = new THREE.Mesh(
      contentOrGeometry,
      aplicaEstiloFace(materiais || makeMaterial(color, rotateTexture)));
    const edges = buildEdgesForStyle(contentOrGeometry);
    const group = new THREE.Group();
    group.add(mesh);
    if (edges) group.add(edges);
    return group;
  }

  // Posiciona um "content" (ver buildContentGroup) em (x,y,z), aplicando —
  // se pedido — um mecanismo de abertura:
  //   opening = { type:'hinge', side:'left'|'right', width } — porta com
  //     dobradiça: cria um grupo-pivô alinhado com a borda da dobradiça
  //     (x ± width/2) e coloca o content DENTRO dele, deslocado localmente
  //     pro lado oposto — girar o pivô no eixo Y faz a peça abrir/fechar em
  //     torno da dobradiça, não do próprio centro. Registrado em `openables`
  //     como kind:'hinge'.
  //   opening = { type:'slide', distance } — gaveta/módulo de corrediça:
  //     não precisa de grupo extra, só desloca o próprio content no eixo Z a
  //     partir da posição-base (z) — "puxado" = z + distance. Registrado em
  //     `openables` como kind:'slide'.
  //   opening = null — sem abertura, só posiciona.
  // Em ambos os casos com abertura, a peça já nasce no estado PERSISTENTE do
  // seu próprio kind (doorsOpen pra hinge, drawersOpen pra slide), pra não
  // "bater" fechada/aberta toda vez que o módulo é redesenhado (troca de
  // cor/medida) enquanto as peças estão abertas — e pra abrir as portas não
  // afetar as gavetas já abertas (ou fechadas), e vice-versa.
  function positionWithOpening(content, opening, x, y, z) {
    // Contexto ativo (buildStandaloneAssembly/Composição) sobrepõe o estado
    // global da cena singleton — ver comentário de activeOpenCtx acima.
    const ctx = activeOpenCtx;
    const doors = ctx ? ctx.doors : doorsOpen;
    const drawers = ctx ? ctx.drawers : drawersOpen;
    const targetOpenables = ctx ? ctx.openables : openables;

    if (opening && opening.type === 'hinge') {
      // 'top'/'bottom' (basculante/basculante inverso, 2026-08-20): eixo da
      // dobradiça é HORIZONTAL, na LARGURA da porta — o pivô fica na
      // ALTURA (Y), não na largura (X) como left/right. Mesmo mecanismo de
      // sempre (grupo-pivô deslocado até a borda da dobradiça, content
      // deslocado pro lado OPOSTO dentro dele), só trocando qual eixo/
      // coordenada é a "borda que gira".
      const isFlap = opening.side === 'top' || opening.side === 'bottom';
      let hingeX = x, hingeY = y, localX = 0, localY = 0;
      if (isFlap) {
        const halfH = (opening.height || 0) / 2;
        hingeY = opening.side === 'top' ? y + halfH : y - halfH;
        localY = opening.side === 'top' ? -halfH : halfH;
      } else {
        const halfW = (opening.width || 0) / 2;
        hingeX = opening.side === 'left' ? x - halfW : x + halfW;
        localX = opening.side === 'left' ? halfW : -halfW;
      }

      const pivot = new THREE.Group();
      content.position.set(localX, localY, 0);
      pivot.add(content);
      pivot.position.set(hingeX, hingeY, z);

      const angle = doors ? openAngleFor(opening.side) : 0;
      // Giro em torno de X (basculante, horizontal) ou Y (dobradiça comum,
      // vertical) — nunca os dois pro mesmo pivô.
      if (isFlap) pivot.rotation.x = angle; else pivot.rotation.y = angle;
      targetOpenables.push({ kind: 'hinge', group: pivot, hingeSide: opening.side, currentAngle: angle, targetAngle: angle });
      return pivot;
    }

    if (opening && opening.type === 'slide') {
      content.position.set(x, y, z);
      const offset = drawers ? (opening.distance || 0) : 0;
      content.position.z = z + offset;
      targetOpenables.push({ kind: 'slide', group: content, baseZ: z, distance: opening.distance || 0, currentOffset: offset, targetOffset: offset });
      return content;
    }

    content.position.set(x, y, z);
    return content;
  }

  // Cria a peça (ou montagem aninhada) e a adiciona direto na SCENE — usada
  // pra peças de 1º nível do módulo pai. Rastreada em partMeshes (limpa em
  // clearParts a cada recalculate()).
  function addPart(contentOrGeometry, color, x, y, z, rotateTexture, opening) {
    const content = buildContentGroup(contentOrGeometry, color, rotateTexture);
    const placed = positionWithOpening(content, opening, x, y, z);
    (moduleGroup || scene).add(placed);
    partMeshes.push(placed);
    return placed;
  }

  // Mesma coisa, mas encaixa como filho de um grupo maior em vez de ir
  // direto pra scene/partMeshes — usada dentro de buildModuleAssembly, onde
  // quem rastreia/descarta é o grupo externo da montagem (o "content" que um
  // addPart de nível acima recebe), não cada sub-peça individualmente.
  function addPartToGroup(parentGroup, contentOrGeometry, color, x, y, z, rotateTexture, opening) {
    const content = buildContentGroup(contentOrGeometry, color, rotateTexture);
    const placed = positionWithOpening(content, opening, x, y, z);
    parentGroup.add(placed);
    return placed;
  }

  // Info da peça pro balão de duplo-clique (client.js/portal.js) — nome
  // (reference do catálogo ou nome do módulo filho), medidas JÁ RESOLVIDAS
  // (mm) e nome da cor. NUNCA inclui preço (breakdown de custo é
  // interno/admin — ver pricing.js). Guardado em userData do próprio
  // Object3D devolvido por addPart/addPartToGroup (o mesmo objeto rastreado
  // em partMeshes ou filho de uma sub-montagem), pra o raycaster de
  // duplo-clique (setupDoubleClickPicking) achar subindo a árvore a partir
  // do mesh realmente clicado.
  function tagPieceUserData(obj, part) {
    if (!obj || !part) return;
    obj.userData.pieceInfo = {
      reference: part.reference || null,
      width_mm: part.width_mm,
      height_mm: part.height_mm,
      depth_mm: part.depth_mm,
      color_name: (part.color && part.color.name) || null
    };
  }

  // Resolve o lado de dobradiça efetivo de uma peça, cobrindo os dois jeitos
  // que isso pode vir cadastrado: peça-componente de catálogo usa
  // hinge_side ('left'/'right'/'none'); peça-módulo aninhada (migration 023)
  // usa opening_type ('hinge_left'/'hinge_right'/'slide_out'/'none') —
  // devolve null quando a peça não abre por dobradiça (pode ainda assim
  // abrir por corrediça, ver opening_type==='slide_out' tratado à parte).
  function resolveHingeSide(part) {
    if (part.is_module) {
      if (part.opening_type === 'hinge_left') return 'left';
      if (part.opening_type === 'hinge_right') return 'right';
      // basculante/basculante inverso (2026-08-20) — eixo horizontal, ver
      // comentário grande de openAngleFor/positionWithOpening mais abaixo.
      if (part.opening_type === 'hinge_top') return 'top';
      if (part.opening_type === 'hinge_bottom') return 'bottom';
      return null;
    }
    return (part.hinge_side && part.hinge_side !== 'none') ? part.hinge_side : null;
  }

  // Se a peça for, ela mesma, um módulo aninhado com composição própria
  // (part.is_module && part.child_pieces.length), monta essa composição
  // RECURSIVAMENTE (buildModuleAssembly) no lugar da geometria simples —
  // usa as dimensões (width/height/depth) da PRÓPRIA geometria que o
  // chamador já calculou pro papel dela (ex: espessura/faceA/faceB de uma
  // lateral, ou largura/altura/profundidade de uma gaveta) como o volume
  // local dessa sub-montagem. Sem is_module/child_pieces, devolve a
  // geometria normal (peça-folha comum, comportamento de sempre).
  //
  // CORREÇÃO (bug irmão do de offset_y_formula/legH): buildModuleAssembly
  // nasce com Y local 0 = PISO da sub-montagem (comentário lá embaixo
  // explica o porquê), mas TODO chamador daqui (left/right/top/bottom/back/
  // shelf/handle/baseboard/countertop/free/front) calcula o "y" que passa
  // pro emit() assumindo um conteúdo CENTRADO na própria origem — exatamente
  // como um BoxGeometry comum, que vai de -altura/2 a +altura/2. Sem
  // envolver a montagem, ela nascia deslocada pra CIMA em metade da própria
  // altura (ex: "Drawer Soft Closet" com 150mm de altura ficava 75mm acima
  // do esperado, além de qualquer erro de offset_y_formula) — só o papel
  // 'drawer' escapava disso porque tem código próprio que já compensa
  // manualmente ("y - drawerH/2", sem passar por resolveContent). Aqui
  // resolvemos de vez pra TODOS os papéis: envolve a montagem num grupo
  // extra, deslocando-a -altura/2 por dentro, pra ela virar centrada igual
  // uma caixa comum — dali em diante nenhum chamador precisa saber se o
  // conteúdo é uma peça simples ou uma composição aninhada.
  // Inclinação de uma peça (migration 065 componente-folha / 066
  // peça-módulo — pedido do usuário: sapateira). Único ponto que aplica o
  // giro, cobrindo os dois formatos de conteúdo que passam por aqui: uma
  // BufferGeometry solta (peça-folha comum) OU um Group de composição
  // aninhada (módulo com 2+ peças, ex: prateleira + fence pro sapato não
  // cair — gira como um corpo rígido só). Sempre em torno do PRÓPRIO CENTRO
  // (Object3D.rotation.x pro Group; BufferGeometry.rotateX bakeia nos
  // vértices pra caixa comum) — SIMPLIFICAÇÃO CONSCIENTE (mesmo espírito do
  // cabide oval, migration 062): o pino de verdade fica na borda de trás,
  // não no centro, então é uma aproximação visual; pilha muito apertada pode
  // fazer a frente de uma encostar visualmente no fundo da de baixo — nesse
  // caso aumente o espaçamento (menos prateleiras/módulo mais alto), não é
  // bug de posicionamento. Sinal: positivo = frente (Z positivo, ver
  // 'handle') mais BAIXA que o fundo (Z negativo, ver 'back') — pedido do
  // usuário. SEM gate de position_role (2026-07-31, correção: o caso real do
  // usuário usa position_role='free', não 'shelf' — a peça-módulo
  // prateleira+fence é posicionada manualmente via Deslocar X/Y/Z, não pelo
  // empilhamento automático do pino) — tilt_angle_deg é 0 por padrão em
  // qualquer papel, então só tem efeito onde o admin realmente preencheu.
  function resolveContent(part, geometry) {
    const tiltDeg = (part && part.tilt_angle_deg) || 0;
    if (part && part.is_module && part.child_pieces && part.child_pieces.length) {
      const p = geometry.parameters;
      const assembly = buildModuleAssembly(part.child_pieces, p.width, p.height, p.depth);
      const centered = new THREE.Group();
      assembly.position.y = -p.height / 2;
      centered.add(assembly);
      if (tiltDeg) centered.rotation.x = tiltDeg * Math.PI / 180;
      return centered;
    }
    if (tiltDeg) geometry.rotateX(tiltDeg * Math.PI / 180);
    return geometry;
  }

  // Chamados pelos botões "Abrir portas" e "Abrir gavetas" do cliente —
  // SEPARADOS (pedido do usuário): cada um só mexe no seu próprio kind de
  // peça-que-abre ('hinge' pra porta, 'slide' pra gaveta/módulo de
  // corrediça), sem afetar o outro. Inverte o estado persistente do seu kind
  // e define o alvo (ângulo ou deslocamento) de cada peça-que-abre
  // atualmente desenhada daquele kind — animate() faz o resto (interpolação
  // suave a cada frame). Devolve o novo estado (true = abertas) pra quem
  // chamou poder atualizar o texto do botão.
  function toggleDoorsOnly() {
    doorsOpen = !doorsOpen;
    openables.forEach((op) => {
      if (op.kind === 'hinge') op.targetAngle = doorsOpen ? openAngleFor(op.hingeSide) : 0;
    });
    return doorsOpen;
  }

  function toggleDrawersOnly() {
    drawersOpen = !drawersOpen;
    openables.forEach((op) => {
      if (op.kind === 'slide') op.targetOffset = drawersOpen ? op.distance : 0;
    });
    return drawersOpen;
  }

  function areDoorsOnlyOpen() {
    return doorsOpen;
  }

  function areDrawersOnlyOpen() {
    return drawersOpen;
  }

  // Apelidos legados: toggleOpenables/areOpenablesOpen cobriam os dois kinds
  // JUNTOS (comportamento antigo, antes do pedido de separar). Mantidos
  // apontando pra "portas" — se algum código externo ainda chamar esses
  // nomes, continua funcionando, só que agora só afeta portas (mesmo
  // significado literal do nome). client.js/portal.js já foram atualizados
  // pra chamar toggleDoorsOnly/toggleDrawersOnly diretamente.
  const toggleOpenables = toggleDoorsOnly;
  const areOpenablesOpen = areDoorsOnlyOpen;

  // Monta um MÓDULO ANINHADO como uma composição de VERDADE (lateral, base,
  // topo, fundo, porta, gaveta, travamento...) em vez de uma caixa única —
  // pieces = peças da composição desse módulo filho (module_components,
  // resolvidas recursivamente — ver client.js/portal.js/admin.js), já
  // resolvidas com W/H/D = dimensões JÁ CALCULADAS do próprio módulo filho
  // (localW/localH/localD, em metros). Reusa os MESMOS papéis
  // (position_role) e a mesma lógica de ancoragem automática das peças do
  // módulo pai (ver placePieceInBox/placeFrontGroupInBox), só que
  // reescalada pro volume local desse módulo filho e com origem no CHÃO
  // dele (Y local 0 = piso do módulo filho, não o centro) — o grupo
  // devolvido é posicionado depois no slot correspondente dentro do módulo
  // pai (ex: no lugar de uma porta ou de uma gaveta), no lugar de uma caixa
  // única. Papéis sem posição 3D definida (ex: puxador, 'other') simplesmente
  // não são desenhados, igual ao módulo pai. RECURSIVO: se alguma peça desta
  // composição for, ela mesma, outro módulo aninhado (is_module +
  // child_pieces), essa sub-sub-composição é montada de novo chamando esta
  // mesma função — profundidade de aninhamento ilimitada.
  function buildModuleAssembly(pieces, localW, localH, localD) {
    const assembly = new THREE.Group();

    const groups = {};
    (pieces || []).forEach((p) => {
      const role = p.position_role || 'other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(p);
    });

    // Pés (position_role='leg') dentro de uma sub-montagem aninhada: mesma
    // regra do módulo pai (ver update()) — o corpo (todas as outras peças
    // desta composição) ocupa localH menos a altura do pé, e o pé preenche o
    // vão de baixo. CORRIGIDO (2026-08-25, Matt: "não aparece os pés de
    // plástico quando insiro como módulo aninhado") — antes esta peça era
    // descartada aqui sem desenhar nada (comentário antigo: "pés não fazem
    // sentido dentro de uma sub-montagem aninhada"), o que também escondia o
    // pé de um módulo tipo "Gola" (pé + rodapé) empacotado pra reuso como
    // peça aninhada em outros módulos. Agora desenha igual ao nível raiz, só
    // que como filho do Group desta sub-montagem (placeLegsGroupIntoGroup,
    // mesma função já usada por buildStandaloneAssembly, aba Composição).
    const legPart = (groups['leg'] || [])[0];
    const legH = legPart ? Math.max((legPart.height_mm || 0) / 1000, 0.01) : 0;
    const boxH = Math.max(localH - legH, 0.05);

    // Vão interno (Y) desta sub-montagem — mesmo espírito do bounds do
    // módulo pai (ver update()), pra 'shelf' distribuir entre o topo da base
    // e a face de baixo do topo desta composição, se ela tiver essas peças;
    // sem elas, cai pro volume local do CORPO (boxH, já descontado o pé, se
    // houver — innerBottomY=0, innerTopY=boxH sem 'bottom'/'top').
    const bounds = {
      innerBottomY: resolveThickness((groups['bottom'] || [])[0]),
      innerTopY: boxH - resolveThickness((groups['top'] || [])[0]),
      legH: legH
    };

    const emit = (content, color, x, y, z, rotateTexture, opening) =>
      addPartToGroup(assembly, content, color, x, y, z, rotateTexture, opening);

    Object.keys(groups).forEach((role) => {
      const group = groups[role];
      if (role === 'front') {
        placeFrontGroupInBox(group, localW, boxH, localD, bounds, emit);
      } else if (role === 'leg') {
        placeLegsGroupIntoGroup(assembly, group, localW, localD);
      } else {
        group.forEach((part, index) => placePieceInBox(part, localW, boxH, localD, index, group.length, bounds, emit));
      }
    });

    return assembly;
  }

  // ---- Cabide tubular oval (shape_type='oval_rod', migration 062) ----
  // Pedido do usuário: um componente pode pedir um desenho de TUBO OVAL em
  // vez da caixa padrão — hoje toda peça (exceto o cilindro vertical
  // hardcoded do 'leg', ver placeLegsGroup) é uma THREE.BoxGeometry. Só tem
  // efeito em position_role='free' (ver dispatch dentro de placePieceInBox
  // abaixo) — shape_type é ortogonal a position_role, decide só a
  // GEOMETRIA, nunca o posicionamento (ver comentário da migration 062).
  //
  // Técnica: um CylinderGeometry "deitado" (eixo Y, o padrão) vira um tubo
  // OVAL deitado no eixo X em 2 passos — escala não-uniforme (X vira o
  // semieixo maior/menor da elipse, Z o outro) enquanto o eixo ainda é Y,
  // depois rotaciona 90° em Z (isso troca Y<->X, deitando o comprimento no
  // eixo X sem mexer na elipse já escalada em X/Z). Mesma primitiva
  // (CylinderGeometry) já usada no 'leg' — só a escala+rotação é nova.
  function buildEllipticalTubeGeometry(length, height, depth, segments) {
    const geometry = new THREE.CylinderGeometry(1, 1, Math.max(length, 0.001), segments, 1, false);
    geometry.scale(Math.max(height, 0.001) / 2, 1, Math.max(depth, 0.001) / 2);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
  }

  // Disco/anel coaxial ao tubo (mesma rotação acima, sem a escala elíptica —
  // usado pro colar e pro suporte/"ponteira" nas pontas, que são redondos).
  function buildAxialDiscGeometry(thickness, radius, segments) {
    const geometry = new THREE.CylinderGeometry(Math.max(radius, 0.001), Math.max(radius, 0.001), Math.max(thickness, 0.001), segments);
    geometry.rotateZ(Math.PI / 2);
    return geometry;
  }

  // Grupo completo do cabide: tubo oval + 2 suportes nas pontas (colar +
  // disco de fixação). SIMPLIFICAÇÃO CONSCIENTE: os suportes são desenhados
  // COAXIAIS ao tubo (não em ângulo saindo de uma parede/lateral) — uma peça
  // 'free' não sabe onde fica a parede/lateral que a segura (é só uma
  // posição X/Y/Z manual), então uma mão-francesa "de verdade" (em ângulo)
  // exigiria adivinhar uma direção que não existe nos dados. O resultado
  // ainda lê como "cabide com suporte nas pontas", só não reproduz o ângulo
  // exato da mão-francesa da foto de referência.
  // Centrado na PRÓPRIA origem (largura/altura/profundidade -w/2..w/2 etc.),
  // igual a uma BoxGeometry comum — quem chama (placePieceInBox) posiciona
  // esse centro exatamente como posicionaria o centro de uma caixa do mesmo
  // w/h/d, então o cabide "ocupa o mesmo volume" que a caixa ocuparia.
  //
  // Cabide SEMPRE PRETO, igual ao pé plástico (ver LEG_COLOR/placeLegsGroup
  // mais abaixo) — Matt, 2026-08-20: primeiro "o cabide aparece branco, como
  // deixo ele preto"; depois, já com uma cor cadastrada: "troquei pra cor de
  // rod black, mas o rod so sai com a cor da caixa de onde e inserido".
  // CAUSA RAIZ das duas: o cabide (shape_type='oval_rod', componente "ROD
  // BLACK") usa o MESMO mecanismo de papel de cor (color_role_id ->
  // colorsByRole, escolhido pelo cliente por módulo via module_colors) de
  // qualquer peça de madeira comum — só que o tipo "Hanger" nunca tem cor
  // cadastrada pra esse papel em NENHUM módulo (ninguém vinculou
  // module_colors pra ele), então: sem cor nenhuma, cai no fallback cinza de
  // makeMaterial (1º sintoma, "aparece branco"); e o fallback DEFENSIVO de
  // projectLayoutRowsForSlot (portal-07-construtor.js — "papel sem opção,
  // usa o papel que o slot JÁ tem escolhido, senão o preço trava") REESCREVE
  // o color_role_id da peça pro papel da CAIXA (2º sintoma, "só sai com a
  // cor da caixa") — trocar a cor no cadastro do componente não ajuda porque
  // o papel de cor nunca é dela pra começo de conversa. Fix igual ao pé:
  // ferragem/acessório não usa a cor de caixa/porta escolhida pelo cliente —
  // cor FIXA no código, ignorando o papel de cor de propósito.
  const ROD_COLOR = { swatch_hex: '#000000' };
  function buildOvalRodContent(w, h, d, color) {
    const group = new THREE.Group();
    const material = makeMaterial(color, false);
    const segments = 24;

    const tubeGeometry = buildEllipticalTubeGeometry(w, h, d, segments);
    group.add(new THREE.Mesh(tubeGeometry, material));

    // Colar (anel um pouco mais largo que o tubo, encostado bem na ponta) +
    // disco de fixação (representa a base da mão-francesa/"ponteira"), um
    // par em cada extremidade.
    const collarLength = Math.min(w * 0.06, 0.02);
    const collarScale = 1.18;
    const plateRadius = Math.max(h, d) * 0.6;
    const plateThickness = Math.min(h, d) * 0.22;

    [-1, 1].forEach((side) => {
      const collarGeometry = buildEllipticalTubeGeometry(collarLength, h * collarScale, d * collarScale, segments);
      const collar = new THREE.Mesh(collarGeometry, material);
      collar.position.x = side * (w / 2 - collarLength / 2);
      group.add(collar);

      const plateGeometry = buildAxialDiscGeometry(plateThickness, plateRadius, segments);
      const plate = new THREE.Mesh(plateGeometry, material);
      plate.position.x = side * (w / 2 + plateThickness / 2);
      group.add(plate);
    });

    return group;
  }

  // ---- Recortes em L na lateral (migration 094) ----
  // Matt, 2026-08-12: "todos modulos toe 4 1/2 tem esse recorte em L de
  // 4 1/2 x 3". A lateral desce inteira até o chão e perde um pedaço no canto
  // da FRENTE embaixo — é ali que o toe encaixa. Até agora o 3D desenhava a
  // lateral como um retângulo cheio: o entalhe era cobrado (usinagem_m,
  // migration 092) mas não aparecia, e o toe parecia flutuar dentro de uma
  // caixa fechada.
  //
  // SÃO VÁRIOS, NÃO UM: a gola pede o mesmo recorte no canto de CIMA, e a
  // carcaça niche.34.gola.toe45 existe — a mesma lateral leva os dois. Por
  // isso part.recortes é uma LISTA de {canto, h, d} e cada canto do contorno
  // é resolvido separado.
  //
  // O recorte NÃO muda a medida da peça: a chapa é serrada retangular e o L é
  // feito depois, na fresadora. Por isso ele entra só aqui, na geometria, e
  // não nas fórmulas de largura/altura/profundidade nem no plano de corte.
  //
  // TÉCNICA: um THREE.Shape com o contorno em L, extrudado na espessura.
  // O shape vive no plano XY local; o mapeamento pro módulo é
  //   shape.x -> profundidade (Z do módulo, +x = FRENTE)
  //   shape.y -> altura       (Y do módulo, +y = CIMA)
  //   extrusão -> espessura   (X do módulo)
  // e o rotateY(-90°) no fim faz exatamente essa troca (a extrusão cai no -X,
  // mas ela é simétrica depois de centrada, então o sinal não importa).
  //
  // SIMPLIFICAÇÃO CONSCIENTE: peça entalhada perde a fita/miolo por face
  // (makeBoxMaterials só sabe ler BoxGeometry) e desenha com o material único
  // da cor. A aresta (EdgesGeometry) continua funcionando em qualquer
  // geometria — e é ela que faz o L ser LIDO como recorte na tela.
  //
  // Devolve uma BoxGeometry normal quando não há recorte, então todo o resto
  // do viewer (incluindo material por face) continua exatamente como antes.
  const CANTOS_RECORTE = {
    // [sinal em profundidade (+1 = frente), sinal em altura (+1 = cima)]
    'frente-baixo': [1, -1],
    'frente-cima': [1, 1],
    'fundo-baixo': [-1, -1],
    'fundo-cima': [-1, 1]
  };
  function buildPanelGeometry(part, thickness, faceA, faceB) {
    const box = function () { return new THREE.BoxGeometry(thickness, faceA, faceB); };
    if (!part || !Array.isArray(part.recortes) || !part.recortes.length) return box();
    if (typeof THREE.Shape !== 'function' || typeof THREE.ExtrudeGeometry !== 'function') return box();

    const bx = faceB / 2, by = faceA / 2;
    // Os 4 cantos em sentido anti-horário, começando no fundo-baixo, e a
    // direção de chegada/saída de cada um (é o que diz pra que lado o recorte
    // "come" a peça em cada canto).
    const cantos = [
      { nome: 'fundo-baixo', p: [-bx, -by], din: [0, -1], dout: [1, 0] },
      { nome: 'frente-baixo', p: [bx, -by], din: [1, 0], dout: [0, 1] },
      { nome: 'frente-cima', p: [bx, by], din: [0, 1], dout: [-1, 0] },
      { nome: 'fundo-cima', p: [-bx, by], din: [-1, 0], dout: [0, -1] }
    ];

    // Cada canto recebe no máximo um recorte. Um recorte sem altura OU sem
    // profundidade não é recorte nenhum; canto desconhecido é ignorado.
    let algum = false;
    (part.recortes || []).forEach(function (r) {
      if (!r) return;
      const nh = Math.max((r.h || 0) / 1000, 0); // altura do L
      const nd = Math.max((r.d || 0) / 1000, 0); // profundidade do L
      if (nh <= 0 || nd <= 0) return;
      if (!CANTOS_RECORTE[r.canto]) return;
      const c = cantos.find(function (x) { return x.nome === r.canto; });
      if (!c || c.nh) return;
      c.nh = nh; c.nd = nd;
      algum = true;
    });
    if (!algum) return box();

    // Dois recortes na mesma aresta não podem se encontrar, e um recorte
    // sozinho não pode comer a peça inteira — nos dois casos o contorno sai
    // degenerado (a peça vira uma fita ou some). Vale mais desenhar a peça
    // inteira do que desenhar errado, então qualquer excesso cancela tudo.
    //   arestas de baixo/cima medem faceB e são comidas pela PROFUNDIDADE;
    //   arestas da frente/fundo medem faceA e são comidas pela ALTURA.
    const arestas = [
      [0, 1, faceB, 'nd'], [1, 2, faceA, 'nh'],
      [2, 3, faceB, 'nd'], [3, 0, faceA, 'nh']
    ];
    const cabe = arestas.every(function (a) {
      return (cantos[a[0]][a[3]] || 0) + (cantos[a[1]][a[3]] || 0) < a[2];
    });
    if (!cabe) return box();

    // Quanto o recorte anda em cada eixo: nd na profundidade (x do shape),
    // nh na altura (y do shape).
    const pontos = [];
    cantos.forEach(function (c) {
      if (!c.nh) { pontos.push(c.p); return; }
      const ext = function (dir) { return dir[0] !== 0 ? c.nd : c.nh; };
      const ei = ext(c.din), eo = ext(c.dout);
      const recuado = [c.p[0] - c.din[0] * ei, c.p[1] - c.din[1] * ei];
      pontos.push(recuado);
      pontos.push([recuado[0] + c.dout[0] * eo, recuado[1] + c.dout[1] * eo]);
      pontos.push([c.p[0] + c.dout[0] * eo, c.p[1] + c.dout[1] * eo]);
    });

    const shape = new THREE.Shape();
    pontos.forEach(function (p, i) {
      if (i === 0) shape.moveTo(p[0], p[1]); else shape.lineTo(p[0], p[1]);
    });
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, steps: 1 });
    // ExtrudeGeometry nasce de 0 a `depth` no eixo da extrusão; a peça precisa
    // estar centrada na própria origem, igual a uma BoxGeometry, porque quem
    // chama posiciona o CENTRO.
    geometry.translate(0, 0, -thickness / 2);
    geometry.rotateY(-Math.PI / 2);
    return geometry;
  }

  // Monta uma peça dentro de um volume-caixa (W,H,D em metros) conforme seu
  // position_role, delegando a criação/posicionamento efetivos pra `emit`
  // (content, color, x, y, z, rotateTexture, opening) — quem chama decide se
  // isso vai direto pra scene (nível do módulo pai, ver placePart) ou como
  // filho de um grupo de sub-montagem (nível de módulo aninhado, ver
  // buildModuleAssembly). w/h/d = dimensões JÁ RESOLVIDAS dessa peça
  // (Pricing.calculatePiece), em metros. index/count = usados pra empilhar
  // múltiplas peças do mesmo papel (ex: 3 prateleiras, 2 gavetas) espaçadas
  // dentro do volume. RECURSIVO: se part.is_module && part.child_pieces.length,
  // a peça vira uma composição própria (ver resolveContent/buildModuleAssembly)
  // no lugar de uma caixa simples, em qualquer um dos papéis abaixo.
  // =====================================================================
  // ITENS DE DECORAÇÃO COM GEOMETRIA PRÓPRIA (migration 141, 2026-08-26)
  //
  // Substitui as caixas planas da migration 039 (fogão/micro-ondas) e
  // acrescenta 5 itens novos (forno de torre duplo, lava-louças, pia, farm
  // pia, lixeira dupla) — mesmo padrão de dispatch por shape_type que o
  // cabide tubular (oval_rod, migration 062) já usa: cada módulo decorativo
  // tem UMA peça 'free' só, W/H/D=100% do módulo, e o shape_type
  // ('decor_fogao', 'decor_pia'...) escolhe qual função abaixo desenha o
  // conteúdo em vez da caixa padrão. Testado à parte (7 itens, screenshots
  // via Chromium headless, Three.js r128 real) em
  // scratch/teste-eletros-decor-3d.html antes de entrar aqui — ver
  // CLAUDE.md / memória do projeto pra contexto.
  //
  // Cor: só o material "main" respeita a cor escolhida pelo cliente
  // (part.color.swatch_hex, papel "Decor — Principal", as mesmas 5 cores
  // fixas da migration 039). Os outros materiais (inox de detalhe, vidro,
  // cromado, display, plástico do balde...) são FIXOS no código — mesmo
  // princípio de LEG_COLOR/ROD_COLOR logo acima: ferragem/acabamento que não
  // muda com a cor da caixa escolhida pelo cliente.

  const DECOR_SWATCH_MATERIAL_HINTS = {
    '#1c1c1e': { metal: 0.30, rough: 0.42 }, // Decor Preto
    '#f4f4f2': { metal: 0.05, rough: 0.55 }, // Decor Branco
    '#b9bdc1': { metal: 0.75, rough: 0.32 }, // Decor Inox
    '#9a8f83': { metal: 0.02, rough: 0.85 }, // Decor Tecido
    '#6b4f3a': { metal: 0.03, rough: 0.60 }, // Decor Madeira
  };

  function resolveDecorMaterials(color) {
    const hex = (color && color.swatch_hex) || '#c9cdd1';
    const hint = DECOR_SWATCH_MATERIAL_HINTS[String(hex).toLowerCase()] || { metal: 0.5, rough: 0.4 };
    return {
      main: new THREE.MeshStandardMaterial({ color: hex, metalness: hint.metal, roughness: hint.rough }),
      detail: new THREE.MeshStandardMaterial({ color: 0x35383c, metalness: 0.55, roughness: 0.28 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0.15, roughness: 0.12 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd7dadd, metalness: 0.9, roughness: 0.15 }),
      display: new THREE.MeshStandardMaterial({ color: 0x0c1a12, emissive: 0x2ecc71, emissiveIntensity: 0.55, roughness: 0.4 }),
      counter: new THREE.MeshStandardMaterial({ color: 0xe6e1d8, metalness: 0.02, roughness: 0.6 }),
      binPlastic: new THREE.MeshStandardMaterial({ color: 0x2b2f33, metalness: 0.08, roughness: 0.55 }),
      cabinetFront: new THREE.MeshStandardMaterial({ color: 0xa9764f, metalness: 0.02, roughness: 0.55 }),
      cabinetCarc: new THREE.MeshStandardMaterial({ color: 0xcfc9bd, metalness: 0.02, roughness: 0.68 }),
    };
  }

  // ---- helpers de geometria (eixo-alinhados, mesma técnica do teste solto) ----
  function decorBoxMesh(w, h, d, material) {
    return new THREE.Mesh(new THREE.BoxGeometry(Math.max(w, 0.001), Math.max(h, 0.001), Math.max(d, 0.001)), material);
  }

  function decorRoundedBox(w, d, h, r, material) {
    const g = new THREE.Group();
    r = Math.max(0, Math.min(r, w / 2 - 0.002, d / 2 - 0.002));
    if (r <= 0.0015) { const m = decorBoxMesh(w, h, d, material); m.position.y = h / 2; g.add(m); return g; }
    const coreW = w - 2 * r, coreD = d - 2 * r;
    const bx = decorBoxMesh(w, h, coreD, material); bx.position.y = h / 2; g.add(bx);
    const bz = decorBoxMesh(coreW, h, d, material); bz.position.y = h / 2; g.add(bz);
    const cylGeo = new THREE.CylinderGeometry(r, r, h, 16);
    [[coreW / 2, coreD / 2], [-coreW / 2, coreD / 2], [coreW / 2, -coreD / 2], [-coreW / 2, -coreD / 2]].forEach(([cx, cz]) => {
      const c = new THREE.Mesh(cylGeo, material); c.position.set(cx, h / 2, cz); g.add(c);
    });
    return g;
  }

  // Caixa afunilada (mais estreita embaixo) — CylinderGeometry de 4 lados
  // vira um prisma retangular ao girar 45° (mesmo truque de baixo risco já
  // usado em decorRoundedBox/decorFlatRing, sem geometria customizada);
  // radiusBottom < radiusTop afunila IGUAL nos eixos X e Z, e a escala não-
  // uniforme (w, 1, d) achata esse prisma de círculo pra retângulo — topo e
  // base saem com a MESMA proporção W:D, só a base menor (taper < 1). Base
  // em y=0 (mesma convenção de decorRoundedBox). taper=1 = caixa reta (sem
  // afunilar), útil pra reaproveitar como caixa retangular comum também
  // (ex: base/plataforma de madeira, aba/borda do balde).
  // Usada pela primeira vez na lixeira dupla (26/08, referência: Häfele
  // Wood Double Waste Bin Pull-Out — baldes retangulares afunilados, não
  // cilíndricos como a v1 tinha).
  function decorTaperedBox(w, h, d, taper, material) {
    const t = Math.max(0.03, Math.min(1, taper));
    const geo = new THREE.CylinderGeometry(1, t, Math.max(h, 0.001), 4, 1);
    geo.rotateY(Math.PI / 4);
    geo.translate(0, Math.max(h, 0.001) / 2, 0);
    const mesh = new THREE.Mesh(geo, material);
    mesh.scale.set(Math.max(w, 0.001), 1, Math.max(d, 0.001));
    return mesh;
  }

  function decorFrontKnob(r, len, material) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), material);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  function decorFlatRing(rOuter, tube, material) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(rOuter, tube, 8, 20), material);
    m.rotation.x = Math.PI / 2;
    return m;
  }

  function decorAddControlStrip(parent, w, h, depth, x, y, z, frameMat, displayMat, nButtons) {
    const frame = decorBoxMesh(w, h, depth, frameMat); frame.position.set(x, y, z); parent.add(frame);
    const dispW = w * 0.28, dispH = h * 0.55;
    const disp = decorBoxMesh(dispW, dispH, 0.004, displayMat);
    disp.position.set(x - w / 2 + dispW / 2 + w * 0.05, y, z + depth / 2 + 0.002);
    parent.add(disp);
    const btnSize = Math.min(0.016, h * 0.5), gap = 0.008;
    let bx = x - w / 2 + dispW + w * 0.14;
    for (let i = 0; i < nButtons; i++) {
      const b = decorBoxMesh(btnSize, btnSize, 0.005, frameMat);
      b.position.set(bx, y, z + depth / 2 + 0.0025);
      parent.add(b);
      bx += btnSize + gap;
    }
  }

  function decorAddDoorWithGlass(parent, w, h, depth, x, y, z, frameMat, glassMat, handleMat, handleSide) {
    const door = decorBoxMesh(w, h, depth, frameMat); door.position.set(x, y, z); parent.add(door);
    const glassW = w * 0.8, glassH = h * 0.68;
    const glass = decorBoxMesh(glassW, glassH, 0.006, glassMat);
    glass.position.set(x, y + h * 0.03, z + depth / 2 + 0.0035);
    parent.add(glass);
    if (handleSide === 'top') {
      const handle = decorBoxMesh(w * 0.86, 0.02, 0.03, handleMat);
      handle.position.set(x, y + h / 2 - 0.03, z + depth / 2 + 0.02);
      parent.add(handle);
    } else if (handleSide === 'right') {
      const handle = decorBoxMesh(0.02, h * 0.55, 0.03, handleMat);
      handle.position.set(x + w / 2 - 0.03, y, z + depth / 2 + 0.02);
      parent.add(handle);
    }
  }

  function decorAddFeet(parent, w, d, material, footH) {
    const inset = Math.min(0.05, w * 0.06, d * 0.06), r = 0.014;
    const pts = [[w / 2 - inset, d / 2 - inset], [-(w / 2 - inset), d / 2 - inset], [w / 2 - inset, -(d / 2 - inset)], [-(w / 2 - inset), -(d / 2 - inset)]];
    pts.forEach(([x, z]) => {
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, footH, 10), material);
      foot.position.set(x, footH / 2, z);
      parent.add(foot);
    });
  }

  function decorAddControlPanelKnobs(parent, W, y, z, material, n) {
    const spacing = (W * 0.7) / Math.max(1, n - 1);
    let x = -W * 0.35;
    for (let i = 0; i < n; i++) {
      const k = decorFrontKnob(0.013, 0.022, material);
      k.position.set(x, y, z + 0.011);
      parent.add(k);
      x += spacing;
    }
  }

  function decorFaucet(material, riserH, spoutLen) {
    const g = new THREE.Group();
    const r = 0.011;
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(r, r, riserH, 12), material);
    riser.position.y = riserH / 2; g.add(riser);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(r * 1.2, 12, 8), material);
    joint.position.y = riserH; g.add(joint);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, spoutLen, 12), material);
    spout.rotation.x = Math.PI / 2;
    spout.position.set(0, riserH, spoutLen / 2);
    g.add(spout);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.014, 0.014), material);
    lever.position.set(0.05, riserH * 0.55, 0.02);
    g.add(lever);
    return g;
  }

  function decorCounterWithCutout(W, D, counterT, cutW, cutD, material) {
    const g = new THREE.Group();
    const sideW = Math.max(0.001, (W - cutW) / 2);
    const frontBackD = Math.max(0.001, (D - cutD) / 2);
    const left = decorBoxMesh(sideW, counterT, D, material); left.position.set(-(cutW / 2 + sideW / 2), -counterT / 2, 0); g.add(left);
    const right = decorBoxMesh(sideW, counterT, D, material); right.position.set((cutW / 2 + sideW / 2), -counterT / 2, 0); g.add(right);
    const front = decorBoxMesh(cutW, counterT, frontBackD, material); front.position.set(0, -counterT / 2, (cutD / 2 + frontBackD / 2)); g.add(front);
    const back = decorBoxMesh(cutW, counterT, frontBackD, material); back.position.set(0, -counterT / 2, -(cutD / 2 + frontBackD / 2)); g.add(back);
    return g;
  }

  // ---- construtores por item (W,H,D em METROS — já resolvidos por placePieceInBox) ----
  function buildDecorFogao(W, H, D, mats) {
    const g = new THREE.Group();
    const footH = 0.03;
    const cooktopH = Math.max(0.02, H * 0.045);
    const bodyH = Math.max(0.1, H - footH - cooktopH);
    decorAddFeet(g, W, D, mats.detail, footH);
    const body = decorRoundedBox(W, D, bodyH, 0.014, mats.main); body.position.y = footH; g.add(body);
    const cooktop = decorRoundedBox(W, D, cooktopH, 0.012, mats.detail); cooktop.position.y = footH + bodyH; g.add(cooktop);
    const topY = footH + bodyH + cooktopH;
    const burnerPos = [[-W * 0.24, D * 0.18], [W * 0.24, D * 0.18], [-W * 0.24, -D * 0.16], [W * 0.24, -D * 0.16]];
    burnerPos.forEach(([bx, bz], i) => {
      const rOuter = i < 2 ? W * 0.10 : W * 0.085;
      const r1 = decorFlatRing(rOuter, 0.006, mats.chrome); r1.position.set(bx, topY + 0.004, bz); g.add(r1);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.014, 10), mats.chrome);
      cap.position.set(bx, topY + 0.01, bz); g.add(cap);
    });
    decorAddControlPanelKnobs(g, W, footH + bodyH - 0.06, D / 2, mats.detail, 4);
    const doorH = bodyH * 0.8, doorW = W - 0.08, doorD = 0.025;
    decorAddDoorWithGlass(g, doorW, doorH, doorD, 0, footH + doorH / 2 + bodyH * 0.08, D / 2 + doorD / 2, mats.main, mats.glass, mats.chrome, 'top');
    return g;
  }

  function buildDecorMicroondas(W, H, D, mats) {
    const g = new THREE.Group();
    const body = decorRoundedBox(W, D, H, 0.01, mats.main); g.add(body);
    const doorW = W * 0.62, doorH = H * 0.8, doorD = 0.02;
    decorAddDoorWithGlass(g, doorW, doorH, doorD, -W * 0.5 + doorW / 2 + 0.015, H * 0.52, D / 2 + doorD / 2, mats.detail, mats.glass, mats.chrome, 'right');
    decorAddControlStrip(g, W * 0.28, H * 0.7, 0.015, W * 0.5 - W * 0.14 - 0.01, H * 0.52, D / 2 + 0.0075, mats.detail, mats.display, 4);
    return g;
  }

  function buildDecorFornoTorreDuplo(W, H, D, mats) {
    const g = new THREE.Group();
    const body = decorRoundedBox(W, D, H, 0.014, mats.main); g.add(body);
    const doorH = H * 0.34, doorW = W - 0.07, doorD = 0.025;
    const y1 = H * 0.28, y2 = H * 0.70;
    decorAddControlStrip(g, W * 0.7, 0.045, 0.018, 0, y1 + doorH / 2 + 0.05, D / 2 + 0.009, mats.detail, mats.display, 3);
    decorAddDoorWithGlass(g, doorW, doorH, doorD, 0, y1, D / 2 + doorD / 2, mats.main, mats.glass, mats.chrome, 'top');
    decorAddControlStrip(g, W * 0.7, 0.045, 0.018, 0, y2 + doorH / 2 + 0.05, D / 2 + 0.009, mats.detail, mats.display, 3);
    decorAddDoorWithGlass(g, doorW, doorH, doorD, 0, y2, D / 2 + doorD / 2, mats.main, mats.glass, mats.chrome, 'top');
    return g;
  }

  function buildDecorLavaLoucas(W, H, D, mats) {
    const g = new THREE.Group();
    const toeH = 0.09;
    const bodyH = H - toeH;
    const body = decorRoundedBox(W, D, bodyH, 0.012, mats.main); body.position.y = toeH; g.add(body);
    const toe = decorBoxMesh(W * 0.94, toeH * 0.8, 0.02, mats.glass); toe.position.set(0, toeH * 0.4, D / 2 - 0.02); g.add(toe);
    decorAddControlStrip(g, W * 0.9, 0.05, 0.02, 0, toeH + bodyH - 0.03, D / 2 + 0.01, mats.detail, mats.display, 5);
    const doorH = bodyH - 0.12, doorW = W - 0.05, doorD = 0.02, doorY = toeH + doorH / 2 + 0.02;
    const door = decorBoxMesh(doorW, doorH, doorD, mats.main); door.position.set(0, doorY, D / 2 + doorD / 2); g.add(door);
    for (let i = 0; i < 3; i++) {
      const line = decorBoxMesh(doorW * 0.86, 0.006, 0.006, mats.detail);
      line.position.set(0, doorY - doorH * 0.28 + i * doorH * 0.22, D / 2 + doorD + 0.004);
      g.add(line);
    }
    const handle = decorBoxMesh(doorW * 0.5, 0.018, 0.025, mats.chrome);
    handle.position.set(0, doorY + doorH / 2 - 0.025, D / 2 + doorD + 0.014);
    g.add(handle);
    return g;
  }

  function buildDecorPia(W, H, D, mats) {
    const g = new THREE.Group();
    const counterT = 0.03;
    const basinW = W * 0.78, basinD = D * 0.62, basinH = Math.max(0.1, Math.min(0.2, H * 0.9));
    const counter = decorCounterWithCutout(W, D, counterT, basinW + 0.02, basinD + 0.02, mats.counter); g.add(counter);
    const basin = decorBoxMesh(basinW, basinH, basinD, mats.main); basin.position.set(0, -basinH / 2 - 0.005, 0); g.add(basin);
    const rim = decorRoundedBox(basinW + 0.02, basinD + 0.02, 0.008, 0.01, mats.chrome); rim.position.y = -0.004; g.add(rim);
    const fct = decorFaucet(mats.chrome, Math.min(0.22, H * 1.05 || 0.2), 0.13);
    fct.position.set(0, 0, -D * 0.32);
    g.add(fct);
    return g;
  }

  function buildDecorFarmPia(W, H, D, mats) {
    const g = new THREE.Group();
    const apronH = H * 0.75;
    const counterT = 0.03;
    const apron = decorBoxMesh(W * 0.92, apronH, 0.05, mats.main); apron.position.set(0, apronH / 2, D / 2 - 0.02); g.add(apron);
    const basinW = W * 0.8, basinD = D * 0.68, basinH = apronH * 0.75;
    const counter = decorCounterWithCutout(W, D, counterT, basinW + 0.02, basinD + 0.02, mats.counter);
    counter.position.y = apronH; g.add(counter);
    const basin = decorBoxMesh(basinW, basinH, basinD, mats.detail);
    basin.position.set(0, apronH - counterT - basinH / 2 + 0.01, -0.01);
    g.add(basin);
    const fct = decorFaucet(mats.chrome, Math.min(0.24, apronH * 1.1), 0.15);
    fct.position.set(0, apronH, -D * 0.28);
    g.add(fct);
    return g;
  }

  function buildDecorLixeiraDupla(W, H, D, mats) {
    const g = new THREE.Group();
    // SÓ o carrinho puxa-saco (sem gabinete/porta em volta) — pedido do
    // usuário (26/08, depois de mandar a referência real Häfele Wood
    // Double Waste Bin Pull-Out): "quero sem o movel do lado, por que eu
    // vou colocar dentro de um movel" — ele mesmo posiciona isso dentro do
    // armário real que já está montando (v1 tinha gabinete oco + porta
    // aberta em volta; removido nesta v3). Preenche W×D direto; H NÃO
    // estica o carrinho — altura de peça de ferragem é fixa no mundo real
    // (proporcional à largura, não ao H do módulo) — só ocupa o espaço
    // vertical que precisa; o resto do H fica em branco acima, e tudo bem
    // (o módulo pode ser mais alto que o carrinho de verdade).
    const platformW = W * 0.92;
    const platformD = D * 0.85;
    const platformT = Math.min(0.03, H * 0.08);
    const platform = decorTaperedBox(platformW, platformT, platformD, 1, mats.cabinetFront);
    platform.position.set(0, 0, 0);
    g.add(platform);

    const binWTop = platformW * 0.42;
    const binDTop = platformD * 0.86;
    const binGap = platformW * 0.12;
    const binH = binWTop * 1.15;
    const railT = 0.01;
    const railH = binH + 0.04;
    const railD = platformD * 0.92;
    [-1, 1].forEach((side) => {
      const rail = decorTaperedBox(railT, railH, railD, 1, mats.chrome);
      rail.position.set(side * (platformW / 2 + railT / 2), platformT, 0);
      g.add(rail);
    });

    [-1, 1].forEach((side) => {
      const bx = side * (binWTop / 2 + binGap / 2);
      const bin = decorTaperedBox(binWTop, binH, binDTop, 0.72, mats.binPlastic);
      bin.position.set(bx, platformT, 0);
      g.add(bin);
      const rim = decorTaperedBox(binWTop * 1.08, 0.014, binDTop * 1.08, 1, mats.binPlastic);
      rim.position.set(bx, platformT + binH, 0);
      g.add(rim);
    });

    const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, platformW + 2 * railT, 10), mats.chrome);
    bracket.rotation.z = Math.PI / 2;
    bracket.position.set(0, platformT + railH - 0.02, -railD / 2);
    g.add(bracket);

    return g;
  }


  function buildDecorCooktop(W, H, D, mats) {
    const g = new THREE.Group();
    // Placa de vidro/cerâmica com 4 bocas + controles touch no topo — sem
    // gabinete embaixo (encaixa no recorte de bancada que o próprio usuário
    // já modela). H não estica a peça — é só a espessura real do vidro
    // (fixa e pequena); se o módulo for mais "alto" que isso, sobra vão
    // embaixo/acima, e tudo bem (mesma lógica da lixeira dupla).
    const platformW = W * 0.96;
    const plateD = D * 0.90;
    const plateT = Math.min(0.012, Math.max(0.006, H * 0.3));
    const plate = decorRoundedBox(platformW, plateD, plateT, 0.012, mats.glass);
    plate.position.set(0, 0, 0);
    g.add(plate);

    const burnerR = Math.min(platformW, plateD) * 0.13;
    const offX = platformW * 0.24, offZ = plateD * 0.20;
    [-1, 1].forEach((rz) => {
      [-1, 1].forEach((cx) => {
        const ring = decorFlatRing(burnerR, burnerR * 0.09, mats.detail);
        ring.position.set(cx * offX, plateT + 0.0015, rz * offZ);
        g.add(ring);
        const innerRing = decorFlatRing(burnerR * 0.55, burnerR * 0.06, mats.detail);
        innerRing.position.set(cx * offX, plateT + 0.0015, rz * offZ);
        g.add(innerRing);
      });
    });

    const dispW = platformW * 0.22, dispD = plateD * 0.10;
    const disp = decorBoxMesh(dispW, 0.0015, dispD, mats.display);
    disp.position.set(0, plateT + 0.002, plateD / 2 - plateD * 0.13);
    g.add(disp);
    const btnCount = 4, btnSize = Math.min(0.018, plateD * 0.05);
    let bx = -btnSize * (btnCount - 1);
    for (let i = 0; i < btnCount; i++) {
      const b = decorBoxMesh(btnSize, 0.0012, btnSize, mats.detail);
      b.position.set(bx, plateT + 0.0018, plateD / 2 - plateD * 0.045);
      g.add(b);
      bx += btnSize * 2;
    }

    return g;
  }

  function buildDecorCoifa(W, H, D, mats) {
    const g = new THREE.Group();
    // Coifa de parede: corpo/redoma embaixo (y=0 = base do corpo, altura
    // de instalação típica acima do cooktop) + duto cônico subindo até H
    // (topo, perto do teto). Diferente da lixeira: aqui H IMPORTA de
    // verdade — o duto precisa vencer o vão até o teto que o cliente
    // configurar.
    const bodyW = W * 0.94;
    const bodyD = D * 0.85;
    const bodyH = Math.min(H * 0.22, 0.16);
    const body = decorRoundedBox(bodyW, bodyD, bodyH, 0.015, mats.main);
    body.position.set(0, 0, 0);
    g.add(body);

    decorAddControlStrip(g, bodyW * 0.5, bodyH * 0.28, 0.012, 0, bodyH * 0.5, bodyD / 2, mats.detail, mats.display, 3);

    // duto cônico: largo perto do corpo, estreito perto do teto.
    // decorTaperedBox nativo é base(y=0)=estreita / topo(y=h)=larga — aqui
    // é o oposto, então invertemos com rotation.x=PI e compensamos
    // position.y (o pivô passa a ser a ponta ESTREITA, no topo; a ponta
    // LARGA fica pivô.y - ductH, que colocamos exatamente no topo do
    // corpo).
    const ductH = Math.max(0.05, H - bodyH);
    const ductWBottom = bodyW * 0.55;
    const ductDBottom = bodyD * 0.55;
    const ductTaper = 0.42;
    const duct = decorTaperedBox(ductWBottom, ductH, ductDBottom, ductTaper, mats.main);
    duct.rotation.x = Math.PI;
    duct.position.set(0, bodyH + ductH, 0);
    g.add(duct);

    return g;
  }

  function buildDecorSpiceRack(W, H, D, mats) {
    const g = new THREE.Group();
    // Carrinho porta-temperos "puxa-fora" de verdade (Matt mandou foto de
    // produto real, 27/08: "spice rack quero um assim" — tipo Rev-A-Shelf
    // 432, troca do desenho v1 de postes+potes): corpo estreito de madeira
    // (2 laterais + 4 prateleiras, a de cima com bandeja/aba baixa em vez
    // de trilho) + trilho de arame cromado em U na frente das 3
    // prateleiras de baixo + corrediça na base + mãozinhas de fixação na
    // frente. Solto, sem armário em volta — encaixa dentro do vão/armário
    // que o usuário já modela (mesmo princípio da lixeira dupla).
    const panelT = Math.min(0.014, Math.max(0.008, W * 0.09));
    const bodyD = D * 0.92;
    const shelfN = 4;
    const shelfT = 0.012;

    [-1, 1].forEach((side) => {
      const panel = decorBoxMesh(panelT, H, bodyD, mats.cabinetFront);
      panel.position.set(side * (W / 2 - panelT / 2), H / 2, 0);
      g.add(panel);
    });

    const innerW = Math.max(0.02, W - 2 * panelT);
    const lipH = 0.03;
    // Reserva lipH no topo pra bandeja da prateleira de cima NÃO furar o
    // teto do módulo (H) — a prateleira de cima fica embaixo da bandeja,
    // não no topo absoluto.
    const shelfSpan = Math.max(0.05, H - shelfT - lipH);
    const shelfGap = shelfSpan / (shelfN - 1);
    for (let i = 0; i < shelfN; i++) {
      const y = i * shelfGap + shelfT / 2;
      const isTop = i === shelfN - 1;
      const shelf = decorBoxMesh(innerW, shelfT, bodyD, mats.cabinetFront);
      shelf.position.set(0, y, 0);
      g.add(shelf);

      if (isTop) {
        const lip = decorBoxMesh(innerW, lipH, 0.01, mats.cabinetFront);
        lip.position.set(0, y + shelfT / 2 + lipH / 2, bodyD / 2 - 0.005);
        g.add(lip);
      } else {
        const railY = y + shelfT / 2 + 0.05;
        const railR = 0.004;
        const front = new THREE.Mesh(new THREE.CylinderGeometry(railR, railR, innerW * 0.94, 8), mats.chrome);
        front.rotation.z = Math.PI / 2;
        front.position.set(0, railY, bodyD / 2 - 0.01);
        g.add(front);
        [-1, 1].forEach((side) => {
          const ret = new THREE.Mesh(new THREE.CylinderGeometry(railR, railR, 0.10, 8), mats.chrome);
          ret.rotation.x = Math.PI / 2;
          ret.position.set(side * innerW * 0.47, railY, bodyD / 2 - 0.06);
          g.add(ret);
        });
      }
    }

    const slide = decorBoxMesh(W * 0.94, 0.02, bodyD * 0.9, mats.chrome);
    slide.position.set(0, 0.01, 0);
    g.add(slide);

    [0.08, H - 0.08].forEach((y) => {
      const bracket = decorBoxMesh(0.03, 0.05, 0.012, mats.detail);
      bracket.position.set(-W / 2 + 0.02, y, bodyD / 2 + 0.006);
      g.add(bracket);
    });

    return g;
  }


  function buildDecorLavaSeca(W, H, D, mats) {
    const g = new THREE.Group();
    // Máquina de lavar e secar — aparelho independente com corpo próprio
    // (como fogão/lava-louças, NÃO é peça solta pra dentro de um
    // armário): corpo com cantos arredondados, porta redonda com visor de
    // vidro, painel de controle + knobs no topo, pés.
    const footH = Math.min(0.02, H * 0.03);
    const bodyH = H - footH;
    const body = decorRoundedBox(W, D, bodyH, 0.02, mats.main);
    body.position.set(0, footH, 0);
    g.add(body);

    decorAddFeet(g, W, D, mats.detail, footH);

    const panelY = footH + bodyH * 0.90;
    decorAddControlStrip(g, W * 0.6, bodyH * 0.10, 0.02, 0, panelY, D / 2, mats.detail, mats.display, 5);
    decorAddControlPanelKnobs(g, W * 0.5, panelY, D / 2, mats.chrome, 2);

    const doorR = Math.min(W, bodyH) * 0.30;
    const doorY = footH + bodyH * 0.42;
    const doorZ = D / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(doorR, doorR * 0.12, 10, 24), mats.chrome);
    rim.position.set(0, doorY, doorZ + 0.005);
    g.add(rim);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(doorR * 0.85, doorR * 0.85, 0.02, 24), mats.glass);
    glass.rotation.x = Math.PI / 2;
    glass.position.set(0, doorY, doorZ + 0.01);
    g.add(glass);
    const drumRing = new THREE.Mesh(new THREE.TorusGeometry(doorR * 0.7, doorR * 0.05, 8, 20), mats.detail);
    drumRing.position.set(0, doorY, doorZ + 0.012);
    g.add(drumRing);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, doorR * 0.5, 10), mats.chrome);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(doorR * 0.95, doorY, doorZ + 0.01);
    g.add(handle);

    return g;
  }

  const DECOR_BUILDERS = {
    decor_fogao: buildDecorFogao,
    decor_microondas: buildDecorMicroondas,
    decor_forno_torre_duplo: buildDecorFornoTorreDuplo,
    decor_lava_loucas: buildDecorLavaLoucas,
    decor_pia: buildDecorPia,
    decor_farm_pia: buildDecorFarmPia,
    decor_lixeira_dupla: buildDecorLixeiraDupla,
    decor_cooktop: buildDecorCooktop,
    decor_coifa: buildDecorCoifa,
    decor_spice_rack: buildDecorSpiceRack,
    decor_lava_seca: buildDecorLavaSeca,
  };

  function placePieceInBox(part, W, H, D, index, count, bounds, emitRaw) {
    const w = Math.max((part.width_mm || 0) / 1000, 0.002);
    const h = Math.max((part.height_mm || 0) / 1000, 0.002);
    const d = Math.max((part.depth_mm || 0) / 1000, 0.002);
    const role = part.position_role || 'other';
    const gap = 0.002;
    // Envolve o emit recebido pra marcar userData.pieceInfo (duplo-clique) no
    // Object3D devolvido, sem precisar tocar em nenhuma das chamadas
    // emit(...) abaixo (uma por role) — part já está em escopo aqui.
    // Toda peça-folha do módulo passa por aqui, em qualquer papel e em
    // qualquer nível de aninhamento — é o ponto certo pra publicar a peça
    // atual pro material por face (migration 088).
    const emit = (content, color, x, y, z, rotateTexture, opening) => {
      const obj = comPeca(part, () => emitRaw(content, color, x, y, z, rotateTexture, opening));
      tagPieceUserData(obj, part);
      return obj;
    };

    // Deslocamento manual (mm -> m), cadastrado por módulo — some à posição
    // automática calculada pelo position_role (ex: fundo que entra num
    // rebaixo e fica alguns mm acima da base, em vez de centralizado).
    const offX = (part.offset_x_mm || 0) / 1000;
    const offY = (part.offset_y_mm || 0) / 1000;
    const offZ = (part.offset_z_mm || 0) / 1000;

    // Giro de canto (migration 067, pedido do usuário: módulo em L/canto —
    // ex: closet com um módulo normal atrás + o MESMO módulo girado 90° na
    // frente, encostado sem lateral entre os dois). Só múltiplos de 90°: é o
    // único caso em que dá pra trocar largura<->profundidade de forma EXATA
    // (sem virar aproximação geométrica). Usado só dentro do branch 'free'
    // logo abaixo (ver comentário lá) — nas demais posições (esquerda/
    // direita/topo/base/fundo/prateleira/rodapé/tampo) o campo é ignorado de
    // propósito, porque splitThickness já decide sozinho qual eixo é a
    // espessura; girar essas peças exigiria redesenhar essa lógica inteira
    // pra um caso de uso que, na prática, é sempre um módulo/peça 'free'
    // posicionado à mão.
    const rotYDeg = (((part.rotation_y_deg || 0) % 360) + 360) % 360;
    const swapFootprint = rotYDeg === 90 || rotYDeg === 270;

    // Se o módulo tem pés (position_role='leg'), o corpo inteiro (todas as
    // peças normais) sobe na altura resolvida do pé — os pés preenchem o
    // vão de baixo. H já vem como a altura DISPONÍVEL pro corpo (H total
    // escolhido pelo cliente menos a altura do pé), então só falta somar
    // esse deslocamento em toda posição vertical. Numa sub-montagem
    // aninhada (buildModuleAssembly), bounds.legH é sempre 0 (sem pés).
    const legH = (bounds && bounds.legH) || 0;

    // ZERO ABSOLUTO (pedido do usuário): left/right/top/bottom/back/
    // baseboard/countertop NÃO têm mais uma âncora automática por papel —
    // cada uma nasce com o PRÓPRIO canto chão-fundo-esquerda encostado no
    // canto chão-fundo-esquerda do módulo (x=-W/2, y=0, z=-D/2), e
    // Deslocar X/Y/Z (offX/offY/offZ) é a posição ABSOLUTA e final desse
    // canto a partir dali — não um ajuste em cima de nenhuma posição
    // escondida. Isso significa que 'left' e 'right' (ou 'top' e 'bottom')
    // usam exatamente a MESMA fórmula agora: pra colocar uma peça 'right'
    // encostada na direita, cadastre offset_x_mm = (W - espessura), calculado
    // como fórmula "W-19" por exemplo; o mesmo vale pra 'top' (offset_y_mm =
    // "H-19") — o admin decide a posição peça a peça, do zero. legH (corpo
    // deslocado pra cima quando o módulo tem pés) continua somando
    // automaticamente ao Y dessas peças — não é uma "âncora por papel", é uma
    // exigência estrutural do corpo inteiro (não faz sentido o corpo flutuar
    // acima dos pés só em algumas peças).
    if (role === 'left' || role === 'right') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      // Recorte em L (migration 094) — buildPanelGeometry devolve a
      // BoxGeometry de sempre quando a peça não tem entalhe cadastrado.
      const geometry = buildPanelGeometry(part, thickness, faceA, faceB);
      const x = -W / 2 + thickness / 2 + offX;
      const y = faceA / 2 + offY + legH;
      const z = -D / 2 + faceB / 2 + offZ;
      // Face visível da lateral é o par ±X: U = profundidade, V = altura.
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveGrainRotate(part, faceB, faceA, false), null);
    // LATERAL DE GAVETA — a lateral do casco DEITADA PRA TRÁS (migration 118).
    //
    // Pedido do Matt (2026-08-18): "preciso uma posição nova para inserir as
    // laterais dessa gaveta, que é um flatbord 2C. porém ele é uma lateral
    // deitada pra trás. digo, na lateral as bordas vão na frente. nesse caso
    // elas vão em cima e embaixo" + "a altura precisa virar profundidade".
    //
    // É o mesmo painel de 'left'/'right', com UMA troca: a medida cadastrada
    // como ALTURA vira a profundidade do painel, e a PROFUNDIDADE vira a
    // altura. Por isso faceA e faceB entram trocados em relação à lateral do
    // casco — e a espessura continua saindo do MESMO splitThickness, pra não
    // mudar qual das três medidas é lida como espessura.
    //
    // O veio nasce DEITADO (fallback true = corre no sentido do U, que aqui é
    // a profundidade) em vez de em pé como na lateral do casco. Veio
    // cadastrado continua vencendo, como em todo papel.
    //
    // ESCOPO, e isto é uma trava, não um detalhe: 'drawer_side' existe SÓ pro
    // desenho. Plano de corte, preço, receita de fita, furação e .ban leem o
    // componente Flatbord 2C exatamente como sempre leram — "o flatbord
    // continua intacto no plano de corte, nele você não pode tocar. JAMAIS".
    } else if (role === 'drawer_side') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      // O LADO LONGO SEMPRE CORRE NA PROFUNDIDADE — é isso que "deitada pra
      // trás" quer dizer, e é o que põe as duas bordas laminadas do 2C em
      // cima e embaixo em vez de na frente.
      //
      // Trocar altura por profundidade CEGAMENTE (1ª versão, 18/08) estava
      // errado: depende de qual medida o cadastro escreveu onde. A lateral
      // direita deste mesmo módulo (cadastro antigo, que já estava certa) usa
      // 19.5 / H / D — ali não há nada a trocar, e a troca cega deixava a peça
      // D de altura por H de profundidade, de pé de novo.
      //
      // A regra que vale nas duas convenções: das duas medidas que sobram
      // depois da espessura, a MENOR é a altura da lateral e a MAIOR é a
      // profundidade. Uma lateral de gaveta é sempre mais funda que alta.
      const faceY = Math.min(faceA, faceB); // menor -> altura da gaveta
      const faceZ = Math.max(faceA, faceB); // maior -> profundidade (lado longo)
      const geometry = buildPanelGeometry(part, thickness, faceY, faceZ);
      const x = -W / 2 + thickness / 2 + offX;
      const y = faceY / 2 + offY + legH;
      const z = -D / 2 + faceZ / 2 + offZ;
      // Face visível é o par ±X: U = profundidade (o lado longo agora), V = altura.
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveGrainRotate(part, faceZ, faceY, true), null);
    } else if (role === 'top' || role === 'bottom') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const geometry = new THREE.BoxGeometry(faceA, thickness, faceB);
      const x = -W / 2 + faceA / 2 + offX;
      const y = thickness / 2 + offY + legH;
      const z = -D / 2 + faceB / 2 + offZ;
      // Vista de cima (par ±Y): U = largura, V = profundidade.
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveGrainRotate(part, faceA, faceB, true), null);
    } else if (role === 'back') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const geometry = new THREE.BoxGeometry(faceA, faceB, thickness);
      const x = -W / 2 + faceA / 2 + offX;
      const y = faceB / 2 + offY + legH;
      const z = -D / 2 + thickness / 2 + offZ;
      // VEIO LIVRE DEITA SOZINHO (Matt, 2026-08-11): "quando o lado maior for
      // largura o fundo deve ter a textura deitada; quando for na altura,
      // padrão veio em pé".
      //
      // O fundo é a peça com veio 'livre' (migration 086): ele não tem
      // exigência estética, então gira pra caber na chapa — e é justamente
      // essa a regra que limita o móvel ("passando de 1,2m trava o outro
      // sentido"). Até agora o 3D desenhava sempre em pé, então um móvel
      // 2400 × 800 aparecia com o veio vertical enquanto a fábrica cortava
      // deitado.
      //
      // A conta é a MESMA de LayoutEngine.validar ('livre' -> horizontal
      // quando w >= h); duas contas diferentes pro mesmo veio divergiriam.
      // Só vale pra veio livre: porta e frente têm veio 'vertical' cadastrado
      // e não giram nunca, por mais larga que a peça fique.
      // 2026-08-12 essa conta virou regra geral de todo painel; em 2026-08-16
      // voltou a ser SÓ DAQUI (resolveGrainRotate testa position_role==='back').
      // O fundo é onde ela nasceu e o único lugar onde ela faz sentido: é
      // limitação de CHAPA, não estética.
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveGrainRotate(part, faceA, faceB, false), null);
    } else if (role === 'shelf') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const geometry = new THREE.BoxGeometry(faceA, thickness, faceB);
      // Inclinação (migration 065/066, pedido do usuário: sapateira) — ver
      // resolveContent, que aplica o giro (peça-folha OU módulo aninhado
      // inteiro) em torno do PRÓPRIO CENTRO, sem mexer em nada do
      // empilhamento automático por pino aqui embaixo.
      // Quantidade escolhida pelo CLIENTE (componente com quantity_configurable
      // — client.js manda 1 peça repetida "count" vezes aqui). Distribui
      // igualmente dentro do VÃO INTERNO real do volume — do topo da base
      // até a face de baixo do topo/travessa — em vez da altura externa H
      // inteira, senão a conta ignora o espaço já ocupado pela base e pelo topo.
      const innerLow = (bounds && bounds.innerBottomY) || 0;
      const innerHigh = (bounds && bounds.innerTopY) || H;
      const span = Math.max(innerHigh - innerLow, 0.01);
      const y = innerLow + span * ((index + 1) / (count + 1));
      // Prateleira também é vista de cima: U = largura, V = profundidade.
      emit(resolveContent(part, geometry), part.color, 0 + offX, y + offY + legH, 0 + offZ, resolveGrainRotate(part, faceA, faceB, true), null);
    } else if (role === 'drawer') {
      // Gaveta = caixa de verdade (não painel fino) — empilha as gavetas
      // verticalmente perto da frente do volume. offY (Deslocar Y) é um
      // AJUSTE FINO em cima desse empilhamento automático, igual a todo
      // outro papel (shelf/top/bottom/front/handle/baseboard/countertop/
      // free/leg) — CORREÇÃO: antes offY era calculado mas nunca somado
      // aqui, então qualquer fórmula de Deslocar Y cadastrada numa gaveta
      // era silenciosamente ignorada (só X/Z respeitavam o cadastro).
      const slotH = H / count;
      const drawerH = Math.min(h, slotH * 0.9);
      const drawerW = Math.min(w, W * 0.97);
      const drawerD = Math.min(d, D * 0.9);
      const y = slotH * (count - index - 0.5) + offY;
      const x = 0 + offX;
      const z = D / 2 - drawerD / 2 - gap + offZ;
      // child_pieces = módulo aninhado (migration 023, ver buildModuleAssembly);
      // drawerComposition = campo antigo, mantido só por compatibilidade
      // enquanto client.js/portal.js ainda não migraram (task #156).
      const childPieces = part.child_pieces || part.drawerComposition;
      if (childPieces && childPieces.length > 0) {
        // Composição REAL (fundo, laterais, frente...) — ver
        // buildModuleAssembly. O grupo nasce com Y local 0 = piso da própria
        // gaveta, então o deslocamento pro slot usa y - drawerH/2 (em vez de
        // y, que representa o CENTRO da caixa única) pra alinhar o piso da
        // composição com o piso que a caixa única ocuparia.
        const assembly = buildModuleAssembly(childPieces, drawerW, drawerH, drawerD);
        // 'slide_out' só existe numa peça-módulo de verdade (opening_type) —
        // gaveta desliza pra fora no eixo Z ao "abrir" (ver toggleOpenables).
        const opening = (part.is_module && part.opening_type === 'slide_out')
          ? { type: 'slide', distance: Math.min(drawerD * 0.7, 0.4) }
          : null;
        emit(assembly, null, x, y - drawerH / 2 + legH, z, false, opening);
      } else {
        // Sem composição cadastrada (ou módulo aninhado sem peças ainda) —
        // cai pro comportamento antigo, uma caixa única sólida.
        const geometry = new THREE.BoxGeometry(drawerW, drawerH, drawerD);
        emit(geometry, part.color, x, y + legH, z, false, null);
      }
    } else if (role === 'handle') {
      // Puxador: peça de ferragem de verdade (não painel fino) — usa w/h/d
      // resolvidos direto, sem repartir em espessura/face como os painéis.
      // Distribuído ao longo da LARGURA do volume (um do lado do outro),
      // igualmente espaçado — não tenta grudar em cada porta individual
      // (o desenho é ilustrativo, não precisa saber onde cada porta
      // termina). Y central por padrão (offset_y_mm pode levar pra perto do
      // topo/base, ex: "H-100" pra ficar perto do topo). Z um pouco à
      // frente do plano onde as portas ficam (D/2 + ~20mm, espessura típica
      // de porta), pra não ficar cravado dentro da porta.
      const geometry = new THREE.BoxGeometry(w, h, d);
      const x = count > 1 ? (-W / 2 + W * ((index + 1) / (count + 1))) : 0;
      const doorPlaneApprox = D / 2 + 0.02;
      emit(resolveContent(part, geometry), part.color, x + offX, H / 2 + offY + legH, doorPlaneApprox + d / 2 + offZ, false, null);
    } else if (role === 'baseboard') {
      // Rodapé — zero absoluto igual às demais peças únicas, MAS sem +legH
      // (o rodapé preenche o vão visual embaixo do corpo, não é uma peça do
      // corpo que sobe junto com ele — mesma exceção que os pés já tinham).
      // O recuo da frente (antes um valor fixo de 30mm) agora é só mais um
      // caso de uso do Deslocar Z: cadastre offset_z_formula = "D-thickness-30"
      // (ou o valor que quiser) pra reproduzir o recuo antigo.
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const geometry = new THREE.BoxGeometry(faceA, faceB, thickness);
      const x = -W / 2 + faceA / 2 + offX;
      const y = faceB / 2 + offY;
      const z = -D / 2 + thickness / 2 + offZ;
      // RODAPÉ — é o caso que o Matt levantou: 1200×100 deita sozinho agora
      // (U = comprimento, V = altura), sem depender do positioning.
      const baseboardObj = emit(resolveContent(part, geometry), part.color, x, y, z, resolveGrainRotate(part, faceA, faceB, false), null);
      // Junção automática com módulo vizinho (migration 137) — não desenha
      // nada diferente aqui (peça isolada continua exatamente igual); só
      // publica em userData as medidas JÁ RESOLVIDAS desta peça (faceA =
      // comprimento local, em metros, centro no mesmo eixo X do módulo) pra
      // quem monta a COMPOSIÇÃO (viewer3d_composition.js) poder achar duas
      // peças de módulos vizinhos e trocá-las por uma peça única — sem
      // duplicar a conta de faceA/thickness (mesma fonte, sem risco de
      // divergir como aconteceu com drilling.pieceBox no passado).
      if (baseboardObj) {
        baseboardObj.userData.baseboardGeom = {
          faceA_m: faceA, faceB_m: faceB, thickness_m: thickness,
          localX_m: x, localY_m: y, localZ_m: z,
          auto_join_adjacent: part.auto_join_adjacent !== false,
          join_max_length_mm: part.join_max_length_mm != null ? Number(part.join_max_length_mm) : 2700
        };
      }
    } else if (role === 'countertop') {
      // Tampo — zero absoluto igual às demais. Antes nascia automaticamente
      // em cima do corpo inteiro (H+legH); agora isso é responsabilidade do
      // Deslocar Y (ex: offset_y_formula = "H" pra ficar na altura do corpo —
      // legH some automaticamente igual às outras peças únicas).
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const geometry = new THREE.BoxGeometry(faceA, thickness, faceB);
      const x = -W / 2 + faceA / 2 + offX;
      const y = thickness / 2 + offY + legH;
      const z = -D / 2 + faceB / 2 + offZ;
      // Tampo, vista de cima: U = largura, V = profundidade.
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveGrainRotate(part, faceA, faceB, true), null);
    } else if (role === 'free' && part.shape_type === 'oval_rod') {
      // Cabide tubular oval (migration 062) — MESMO cálculo de posição do
      // 'free' comum logo abaixo (zero absoluto, canto chão-fundo-esquerda),
      // só que o conteúdo emitido é o tubo oval + suportes (buildOvalRodContent)
      // em vez de uma BoxGeometry. Ramo próprio (em vez de um `if` dentro do
      // 'free' de baixo) pra não arriscar mexer em nada do caminho de caixa
      // já validado — giro de textura/dobradiça/corrediça (específicos de
      // painel de madeira) não se aplicam aqui, por isso ficam de fora.
      // Giro de canto (migration 067) — troca w<->d só na conta de POSIÇÃO
      // (onde o centro do tubo encosta no canto do módulo pai); o tubo em si
      // continua construído com w/h/d de verdade, só GIRA como corpo rígido
      // em torno do próprio centro (buildOvalRodContent já devolve um Group
      // centrado na origem).
      const fw = swapFootprint ? d : w;
      const fd = swapFootprint ? w : d;
      const x = -W / 2 + fw / 2 + offX;
      const y = h / 2 + offY + legH;
      const z = -D / 2 + fd / 2 + offZ;
      const rodContent = buildOvalRodContent(w, h, d, ROD_COLOR);
      if (rotYDeg) rodContent.rotation.y = rotYDeg * Math.PI / 180;
      emit(rodContent, null, x, y, z, false, null);
    } else if (role === 'free' && DECOR_BUILDERS[part.shape_type]) {
      // Itens de decoração com geometria própria (migration 141) — mesmo
      // padrão de dispatch por shape_type do cabide oval_rod acima, só que
      // aqui shape_type escolhe QUAL item desenhar (decor_fogao, decor_pia...)
      // em vez de uma forma geométrica genérica.
      const fw = swapFootprint ? d : w;
      const fd = swapFootprint ? w : d;
      const x = -W / 2 + fw / 2 + offX;
      const y = offY + legH;
      const z = -D / 2 + fd / 2 + offZ;
      const decorContent = DECOR_BUILDERS[part.shape_type](w, h, d, resolveDecorMaterials(part.color));
      if (rotYDeg) decorContent.rotation.y = rotYDeg * Math.PI / 180;
      emit(decorContent, null, x, y, z, false, null);
    } else if (role === 'free') {
      // Peça livre — SEM nenhum papel/comportamento automático. Desenha a
      // caixa com as PRÓPRIAS medidas mapeadas DIRETO pros eixos da cena
      // (largura->X, altura->Y, profundidade->Z, sempre, não importa qual
      // delas é a mais fina) e posiciona 100% pela Posição X/Y/Z (zero
      // absoluto, canto chão-fundo-esquerda) — igual às 7 posições únicas,
      // mas SEM entrar em nenhum cálculo de vão interno (innerBottomY/
      // innerTopY/innerLeftX/innerRightX, usados por 'shelf' e 'front') nem
      // em nenhuma distribuição automática. Pensada pra qualquer peça que
      // não seja a lateral/topo/base/fundo de verdade do corpo (usar uma
      // dessas posições numa peça que não é a de verdade contamina esse
      // cálculo, afetando prateleiras/portas de forma errada) nem se encaixe
      // nos papéis com comportamento próprio (porta, prateleira, gaveta, pé,
      // puxador). Repita quantas instâncias quiser com "+ Duplicar"
      // (migration 025), cada uma com sua própria posição — sem afetar as
      // outras.
      const geometry = new THREE.BoxGeometry(w, h, d);
      // Giro do veio da madeira (migration 024/positioning) — peça 'free' é
      // vista de FRENTE (face Z: U=largura, V=altura direto), então gira o
      // UV da PRÓPRIA geometria em vez de usar tex.rotation (ver
      // rotateGeometryUV90 — esse mecanismo é o que provou funcionar de
      // verdade nesta peça; tex.rotation, pensado pra peças vistas de CIMA
      // tipo prateleira/topo, não fazia efeito visual aqui).
      // 2026-08-12: a decisão passa pelo resolveGrainRotate. 2026-08-16: a
      // regra do lado longo saiu de tudo que não é fundo, então a peça LIVRE
      // (rodapé e travessa, o caso comum desde que o papel 'Travamento' saiu
      // na migration 026) volta a seguir o `positioning` CADASTRADO — rodapé
      // que precise sair deitado tem que estar como 'horizontal' no admin.
      // O MECANISMO continua o mesmo (girar o UV da geometria, não a textura).
      if (resolveGrainRotate(part, w, h, false)) {
        rotateGeometryUV90(geometry);
      }
      // Giro de canto (migration 067) — troca w<->d só na conta de POSIÇÃO
      // (onde o canto chão-fundo-esquerda da peça encosta no canto do módulo
      // pai); a caixa/sub-montagem em si continua construída com w/h/d de
      // verdade (ver resolveContent/emit abaixo), só GIRA como corpo rígido
      // em torno do próprio centro.
      const fw = swapFootprint ? d : w;
      const fd = swapFootprint ? w : d;
      const x = -W / 2 + fw / 2 + offX;
      const y = h / 2 + offY + legH;
      const z = -D / 2 + fd / 2 + offZ;
      // Abertura (dobradiça OU corrediça) — CORREÇÃO: 'free' emitia sempre
      // com opening=null, então uma peça-módulo aninhada com opening_type
      // configurado (ex: "Drawer Soft Closet" com opening_type='slide_out',
      // cadastrada como 'free' em vez de 'drawer' porque precisa de posição
      // 100% customizada via Deslocar X/Y/Z) nunca entrava em `openables` —
      // o botão "Abrir portas"/"Abrir gavetas" não tinha nada pra animar
      // nela, mesmo com opening_type certinho no admin. Mesma regra genérica
      // já usada em 'front' (resolveHingeSide) e 'drawer' (opening_type===
      // 'slide_out'), agora também aqui — width/distance calculados a partir
      // das PRÓPRIAS medidas resolvidas da peça (w/d), já que 'free' não
      // reparte em espessura/face como os papéis com posição automática.
      const hingeSide = resolveHingeSide(part);
      // 2026-08-20 (Matt: frente de gaveta agregada) — 'free' com
      // opening_type='slide_out' abre mesmo sem ser peça-módulo (is_module):
      // antes só pegava aqui uma peça-módulo aninhada de verdade; a gaveta/
      // frente de gaveta do Construtor são peças-COMPONENTE comuns
      // (is_module:false, mesmo caso de toda porta do Construtor — ver
      // resolveHingeSide/hinge_side), então nunca abriam no 3D antes desta
      // correção (mesmo bug-irmão do BUG #2 de hinge_side, migration 132).
      // slide_distance_mm (novo, só na frente de gaveta sintetizada por
      // layout-engine.js emitContent): sobrescreve a distância genérica
      // (baseada na PRÓPRIA profundidade `d`, ótima pro caixote da gaveta,
      // errada pra frente fina de ~19.5mm) — a frente precisa abrir a MESMA
      // distância que o caixote atrás dela, senão parece travada.
      const opening = hingeSide
        ? { type: 'hinge', side: hingeSide, width: w, height: h }
        : (part.opening_type === 'slide_out')
          ? { type: 'slide', distance: part.slide_distance_mm != null ? part.slide_distance_mm / 1000 : Math.min(d * 0.7, 0.4) }
          : null;
      // rotateTexture=false aqui embaixo (sempre) — o giro de 'free' já foi
      // aplicado na PRÓPRIA geometria acima (rotateGeometryUV90); passar
      // true/'right' pro material giraria a textura DE NOVO em cima disso,
      // dobrando o giro (90+90=180°, errado).
      const freeContent = resolveContent(part, geometry);
      // Giro de canto (migration 067) — aplicado DEPOIS de resolveContent
      // (que já pode ter aplicado tilt_angle_deg em X) pra girar o conteúdo
      // inteiro em torno do próprio centro no eixo Y: 'centered' (Group, caso
      // is_module) já nasce centrado nos 3 eixos, então só girar; geometria
      // solta (BufferGeometry, caso peça-folha comum) baqueia a rotação nos
      // próprios vértices, igual ao tilt_angle_deg em X logo acima.
      if (rotYDeg) {
        if (freeContent.isGroup) {
          freeContent.rotation.y = rotYDeg * Math.PI / 180;
        } else {
          freeContent.rotateY(rotYDeg * Math.PI / 180);
        }
      }
      const freeGroup = emit(freeContent, part.color, x, y, z, false, opening);
      // Dobradiças visuais — mesma regra de 'front' (linha ~944): peça 'free'
      // com hingeSide resolvido é uma porta de verdade, só que posicionada
      // manualmente em vez de automaticamente. Sem isso, a porta abria/fechava
      // (openables já cobria isso via resolveHingeSide) mas não desenhava a
      // ferragem física da dobradiça.
      if (hingeSide === 'top' || hingeSide === 'bottom') {
        placeFlapHardware(freeGroup, w, h, d, hingeSide);
      } else if (hingeSide) {
        placeDoorHinges(freeGroup, w, h, d, part.height_mm, hingeSide);
      }
    }
    // role === 'other' -> não desenha (ferragem/reforço sem relevância visual).
  }

  // Fina camada em cima de placePieceInBox pra uso no NÍVEL DO MÓDULO PAI —
  // emite direto na scene (ver addPart/partMeshes/clearParts).
  function placePart(part, W, H, D, index, count, bounds) {
    placePieceInBox(part, W, H, D, index, count, bounds, (content, color, x, y, z, rotateTexture, opening) =>
      addPart(content, color, x, y, z, rotateTexture, opening)
    );
  }

  // Pés (position_role='leg'): ferragem que ergue o corpo do móvel do chão —
  // um em cada quina (até 4, uma peça do grupo por quina). Diferente das
  // outras posições, NÃO recebem o deslocamento legH (eles SÃO a referência
  // do chão) — ficam sempre de y=0 até y=altura do próprio pé, usando o W/D
  // TOTAIS do módulo (não descontados), já que ficam por fora/embaixo do corpo.
  // Pé sempre preto e cilíndrico (pé regulável de verdade é redondo,
  // geralmente plástico ou metal preto) — não usa a cor de caixa/porta
  // escolhida pelo cliente, então a cor da peça no cadastro é ignorada aqui
  // de propósito. O diâmetro vem da largura resolvida do componente (a
  // mesma fórmula que antes definia a largura da "caixa" do pé).
  const LEG_COLOR = { swatch_hex: '#000000' };
  // Distância padrão do CENTRO do pé até a quina do módulo (Matt,
  // 2026-08-19: "quero que os pes plasticos fiquem a 100mm de distancia da
  // spontas pra dentro. hoje eles estao muito pra fora" — antes era só o
  // raio do pé + 10mm, quase na aresta). Usado nos 3 lugares que desenham pé
  // (placeLegsGroup/placeLegsGroupIntoGroup aqui e a cópia fiel em
  // photoreal.js) — mesmo valor, um lugar só pra não desalinhar de novo.
  const LEG_INSET_MM = 100;

  function placeLegsGroup(group, W, D) {
    if (!group || !group.length) return;
    const first = group[0];
    const legW = Math.max((first.width_mm || 40) / 1000, 0.01);
    const legHeight = Math.max((first.height_mm || 114) / 1000, 0.01);
    const legRadius = legW / 2;
    // 100mm pra dentro da quina (Matt, 2026-08-19: "hoje eles estao muito
    // pra fora") — antes era só legRadius+10mm (pé quase na aresta). O
    // Math.max mantém a mesma folga de segurança de sempre (nunca deixar o
    // pé pendurado pra fora do módulo) pro caso raro de um pé maior que
    // 200mm de diâmetro.
    const inset = Math.max(LEG_INSET_MM / 1000, legRadius + 0.01);

    const corners = [
      [-W / 2 + inset, -D / 2 + inset],
      [W / 2 - inset, -D / 2 + inset],
      [-W / 2 + inset, D / 2 - inset],
      [W / 2 - inset, D / 2 - inset]
    ];

    group.slice(0, 4).forEach((part, i) => {
      const [x, z] = corners[i] || corners[corners.length - 1];
      // CylinderGeometry já nasce com o eixo (altura) alinhado a Y — exatamente
      // a orientação que o pé precisa, sem rotação nenhuma.
      const geometry = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 16);
      const offX = (part.offset_x_mm || 0) / 1000;
      const offY = (part.offset_y_mm || 0) / 1000;
      const offZ = (part.offset_z_mm || 0) / 1000;
      const legObj = addPart(geometry, LEG_COLOR, x + offX, legHeight / 2 + offY, z + offZ);
      tagPieceUserData(legObj, part); // duplo-clique — mesmo padrão de placePieceInBox
    });
  }

  // Portas/frentes (position_role='front') são tratadas à parte, e não peça
  // por peça como as outras: em vez de dividir a largura do módulo em
  // "count" fatias IGUAIS (o que só funciona se todas as portas tiverem
  // exatamente a mesma largura e juntas preencherem o módulo inteiro), elas
  // são EMPILHADAS da esquerda pra direita, cada uma com a LARGURA REAL da
  // própria fórmula. A porta é "sobreposta" (overlay) — ela cobre a BORDA
  // DE FORA da lateral, não fica encaixada dentro do vão interno como uma
  // prateleira — então o zero de referência é a face EXTERNA do módulo
  // (início da lateral, x=-W/2), não a face interna/fim da lateral (que é
  // onde o vão útil começa). A primeira porta nasce encostada 2mm depois
  // dessa face externa, a próxima nasce 2mm depois da borda direita da
  // anterior, e assim por diante. Isso corrige o caso de só existir 1 porta
  // (ela fica flush na esquerda, não centralizada boiando no módulo inteiro)
  // e também o de portas com larguras diferentes (dupla assimétrica).
  // offset_x_mm continua disponível pra ajuste fino de cada porta.
  //
  // Eixo Y: zero de referência = o CHÃO DO CORPO (mesma convenção do
  // 'back'/'bottom'), NÃO o centro do módulo — a porta nasce ENCOSTADA NO
  // CHÃO por padrão (faceB/2, só metade da própria altura acima do chão),
  // e offset_y_mm vira um deslocamento limpo "pra cima a partir do chão"
  // (ex: "H-h" pra encostar no topo em vez de embaixo). Antes ficava
  // centralizada em H/2 (metade da altura TOTAL do corpo) — isso funcionava
  // por acidente enquanto a porta ocupava quase toda a altura do módulo, mas
  // quebrava assim que a porta ficava mais baixa que o corpo (ex: porta
  // embaixo + gaveta em cima): a peça reduzida sobrava IGUAL dos dois lados
  // (embaixo e em cima) em vez de ficar flush no chão com a sobra só em cima.
  function placeFrontGroupInBox(group, W, H, D, bounds, emit) {
    const gap = 0.002;
    let cursorX = -W / 2 + gap;
    const legH = (bounds && bounds.legH) || 0; // corpo desloca pra cima se o módulo tiver pés

    group.forEach((part) => {
      const w = Math.max((part.width_mm || 0) / 1000, 0.002);
      const h = Math.max((part.height_mm || 0) / 1000, 0.002);
      const d = Math.max((part.depth_mm || 0) / 1000, 0.002);
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const doorW = faceA; // largura REAL da própria porta (fórmula do componente), sem repartir por "slot"

      const offX = (part.offset_x_mm || 0) / 1000;
      const offY = (part.offset_y_mm || 0) / 1000;
      const offZ = (part.offset_z_mm || 0) / 1000;

      const geometry = new THREE.BoxGeometry(doorW, faceB, thickness);
      // RECURSIVO: um "modelo de porta" (Fase 2) é um módulo aninhado usado
      // como peça 'front' — nesse caso a porta vira sua própria composição
      // (moldura, painel...) em vez de um painel único (ver resolveContent).
      const content = resolveContent(part, geometry);
      const x = cursorX + doorW / 2;
      const hingeSide = resolveHingeSide(part);
      // height: doorHeightM — só usada por hingeSide 'top'/'bottom'
      // (basculante), ver positionWithOpening; 'left'/'right' continuam
      // usando só width, comportamento de sempre.
      //
      // CORRIGIDO (2026-08-23, Matt: "coloquei sistema de abertura
      // deslizante mas ela nao abre" — frente de gaveta ligada direto no
      // módulo, position_role='front', opening_type='slide_out'): esta
      // função só sabia montar `opening` pro caso 'hinge' — quando
      // hingeSide não resolvia (frente sem dobradiça, caso de toda gaveta/
      // frente deslizante), `opening` caía sempre em null, então a peça
      // nunca entrava em `openables` e o botão "Abrir gavetas" não tinha
      // nada pra animar nela. Mesmo bug-irmão do já corrigido em 'free'
      // (2026-08-20, ver comentário lá) — 'front' também precisa do
      // fallback pra opening_type==='slide_out'. positionWithOpening já
      // sabe posicionar type:'slide' (desloca no eixo Z a partir da base) —
      // só faltava esta função pedir isso.
      // CORRIGIDO (2026-08-23, 2ª parte — Matt: "a frente ainda nao abre,
      // so a gaveta abre. mesmo as duas tendo abertura deslizante"): a
      // distância de fallback (sem slide_distance_mm cadastrado, que hoje só
      // a árvore do Construtor preenche — não existe campo pra isso no
      // formulário manual de Componentes) usava `d` = a PRÓPRIA profundidade
      // do painel (aqui sempre fina, ~19mm — é uma frente/porta, não uma
      // caixa) — Math.min(0.019*0.7, 0.4) ≈ 13mm de curso. A peça ATÉ abria
      // (entrava em openables certinho), só que 13mm ao lado da gaveta de
      // verdade (papel 'drawer', que desliza uma fração da profundidade REAL
      // do módulo, quase sempre 250-350mm) é visualmente imperceptível —
      // parecia não abrir. Corrigido pra usar `D` (profundidade do
      // CONTAINER, mesmo parâmetro que o papel 'drawer' já usa pro próprio
      // fallback, ver `Math.min(drawerD * 0.7, 0.4)` no papel 'drawer' bem
      // acima) — assim uma frente solta desliza a mesma ordem de grandeza da
      // gaveta que ela cobre, mesmo sem slide_distance_mm cadastrado.
      const opening = hingeSide
        ? { type: 'hinge', side: hingeSide, width: doorW, height: faceB }
        : (part.opening_type === 'slide_out')
          ? { type: 'slide', distance: part.slide_distance_mm != null ? part.slide_distance_mm / 1000 : Math.min(D * 0.7, 0.4) }
          : null;
      // comPeca: a porta é o único papel que NÃO passa pelo emit de
      // placePieceInBox (ela tem empilhamento próprio, ver o comentário
      // grande acima), então o contexto da peça pro material por face
      // (migration 088) precisa ser publicado aqui também. Sem isto a porta
      // seria a única peça do módulo sem fita/miolo na borda.
      // Porta vista de frente: U = largura da porta, V = altura. Porta comum
      // (mais alta que larga) continua com veio em pé, igual sempre.
      const doorGroup = comPeca(part, () => emit(content, part.color, x + offX, faceB / 2 + offY + legH, D / 2 + thickness / 2 + gap + offZ, resolveGrainRotate(part, doorW, faceB, false), opening));
      tagPieceUserData(doorGroup, part); // duplo-clique (ver placePieceInBox pro mesmo padrão nos outros papéis)

      // Dobradiças em qualquer porta de verdade (hingeSide resolvido — frente
      // fixa não tem), seja ela uma peça-folha simples ou um modelo de porta
      // aninhado. Quantidade vem da MESMA regra usada no cálculo de preço
      // (Pricing.hingeCountForDoorHeight), pra nunca desenhar um número
      // diferente do que foi cobrado.
      if (hingeSide === 'top' || hingeSide === 'bottom') {
        placeFlapHardware(doorGroup, doorW, faceB, thickness, hingeSide);
      } else if (hingeSide) {
        placeDoorHinges(doorGroup, doorW, faceB, thickness, part.height_mm, hingeSide);
      }

      cursorX = x + doorW / 2 + gap; // próxima porta encosta 2mm depois desta
    });
  }

  // Fina camada em cima de placeFrontGroupInBox pra uso no NÍVEL DO MÓDULO
  // PAI — emite direto na scene (ver addPart/partMeshes/clearParts).
  function placeFrontGroup(group, W, H, D, bounds) {
    placeFrontGroupInBox(group, W, H, D, bounds, (content, color, x, y, z, rotateTexture, opening) =>
      addPart(content, color, x, y, z, rotateTexture, opening)
    );
  }

  // Dobradiça é sempre metálica (niquelada/cromada), independente da cor da
  // porta — mesmo princípio do pé sempre preto: ferragem não usa a cor de
  // caixa/porta escolhida pelo cliente. Material próprio (não reaproveita
  // makeMaterial, que é ajustado pra madeira — roughness alto, metalness
  // baixo): metal de verdade precisa do oposto, roughness baixo e metalness
  // alto, senão fica com cara de plástico/madeira pintada de cinza.
  // Sem cache: cria materiais novos a cada chamada (mesmo padrão do resto do
  // arquivo — makeMaterial também nunca reaproveita instância). Isso importa
  // aqui porque clearParts() dá dispose() nos materiais das peças removidas
  // a cada recalculate(); se o material fosse cacheado/compartilhado entre
  // dobradiças, a primeira atualização do 3D deixaria as dobradiças
  // seguintes com material já "descartado" (dispose'd) e a renderização
  // quebrada.
  function getHingeMaterials() {
    return {
      metal: new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.25, metalness: 0.85 }),
      screw: new THREE.MeshStandardMaterial({ color: '#54585c', roughness: 0.4, metalness: 0.6 })
    };
  }

  // Desenha as dobradiças na borda da dobradiça de uma porta (dentro do
  // MESMO grupo-pivô da porta — ver addPart — pra girarem junto quando a
  // porta abre). doorHeightM/doorThicknessM = altura/espessura JÁ
  // resolvidas da porta (metros). height_mm = altura da porta em mm, usada
  // só pra descobrir a QUANTIDADE pela regra de negócio (2 até 1m, 3 até
  // 1.4m, 4 até 2m, 5 até 2.5m — ver Pricing.hingeCountForDoorHeight).
  // Posição: sempre 10cm (0.1m) das duas extremidades (eixo Y); as do meio
  // (se houver mais de 2) ficam distribuídas em espaços iguais entre essas
  // duas. No eixo X, NÃO fica em cima da borda física da dobradiça (X local
  // = 0, onde o pivô gira — ver addPart): uma dobradiça de embutir de
  // verdade tem o copo/aba furados uns 2cm pra DENTRO da porta, não exatos
  // na quina. Desenhando em X=0 a ferragem ficava espetada bem na quina da
  // porta, "vazando" pro lado de fora dela quando fechada — daí o pedido de
  // trazer pra mais pra dentro. hingeSide/doorWidthM definem o sentido
  // ("pra dentro" é sempre em direção ao MEIO da porta, oposto ao lado onde
  // fica a dobradiça) e o quanto dá pra afastar sem passar do centro em
  // portas bem estreitas.
  //
  // Cada dobradiça vira um pequeno conjunto de 4 peças (em vez de um
  // círculo achatado só), pra dar a sensação de profundidade de uma
  // dobradiça de embutir de verdade:
  //  - ABA: disco fino encostado na parte de trás da porta (a "chapinha"
  //    visível, de onde sai o braço até a lateral do móvel).
  //  - COPO: cilindro mais estreito que ENTRA na porta (o furo broqueado
  //    onde o corpo da dobradiça se encaixa) — dá o efeito de recesso.
  //  - 2 PARAFUSOS: pontos escuros na aba, um de cada lado — detalhe que
  //    quebra a superfície lisa e ajuda a "vender" a ferragem de verdade.
  function placeDoorHinges(doorGroup, doorWidthM, doorHeightM, doorThicknessM, height_mm, hingeSide) {
    if (!doorGroup || typeof Pricing === 'undefined' || !Pricing.hingeCountForDoorHeight) return;
    const count = Pricing.hingeCountForDoorHeight(height_mm || 0);
    const margin = 0.1; // 10cm das extremidades
    const bottomY = -doorHeightM / 2 + margin;
    const topY = doorHeightM / 2 - margin;

    const flangeRadius = 0.019;
    const flangeThickness = 0.0025;
    const cupRadius = 0.0135;
    const cupDepth = Math.min(0.013, Math.max(doorThicknessM - 0.004, 0.006)); // não deixa o copo "vazar" pela frente em portas finas
    const screwRadius = 0.0018;
    const screwThickness = 0.001;

    // ~23mm da borda até o centro do copo é uma distância típica de
    // dobradiça de embutir de verdade; em portas bem estreitas, limita a no
    // máximo 35% da largura pra não passar do meio da porta.
    const insetTarget = 0.023;
    const insetX = Math.min(insetTarget, (doorWidthM || 0) * 0.35);
    // A porta fica sempre do lado OPOSTO à dobradiça dentro do grupo-pivô
    // (ver addPart: localX = +metade da largura pra dobradiça esquerda, -
    // metade pra direita) — "pra dentro da porta" é o mesmo sentido desse
    // deslocamento.
    const hingeLocalX = hingeSide === 'left' ? insetX : -insetX;

    const { metal, screw: screwMaterial } = getHingeMaterials();
    const doorBackZ = -doorThicknessM / 2;

    for (let i = 0; i < count; i++) {
      const y = count > 1 ? bottomY + (topY - bottomY) * (i / (count - 1)) : 0;

      // Aba — fica encostada na parte de trás da porta, um pouco pra fora
      // (sentido do interior do módulo), como a chapinha de uma dobradiça real.
      const flangeGeo = new THREE.CylinderGeometry(flangeRadius, flangeRadius, flangeThickness, 20);
      flangeGeo.rotateX(Math.PI / 2);
      const flange = new THREE.Mesh(flangeGeo, metal);
      flange.position.set(hingeLocalX, y, doorBackZ - flangeThickness / 2);
      doorGroup.add(flange);

      // Copo — entra pra DENTRO da porta (sentido contrário à aba), como o
      // furo broqueado onde o corpo da dobradiça se encaixa de verdade.
      const cupGeo = new THREE.CylinderGeometry(cupRadius, cupRadius, cupDepth, 20);
      cupGeo.rotateX(Math.PI / 2);
      const cup = new THREE.Mesh(cupGeo, metal);
      cup.position.set(hingeLocalX, y, doorBackZ + cupDepth / 2);
      doorGroup.add(cup);

      // 2 parafusos na aba, espaçados verticalmente (mesmo eixo da porta) —
      // como os parafusos reais que prendem a chapinha na madeira.
      [-1, 1].forEach((side) => {
        const screwGeo = new THREE.CylinderGeometry(screwRadius, screwRadius, screwThickness, 10);
        screwGeo.rotateX(Math.PI / 2);
        const screwMesh = new THREE.Mesh(screwGeo, screwMaterial);
        screwMesh.position.set(hingeLocalX, y + side * flangeRadius * 0.55, doorBackZ - flangeThickness - screwThickness / 2);
        doorGroup.add(screwMesh);
      });
    }
  }

  // Ferragem de porta BASCULANTE/BASCULANTE INVERSO (2026-08-20, pedido do
  // Matt com foto de referência — antes disso os 2 mecanismos saíam com
  // opening_type:'none', sem hardware nenhum desenhado, ver migration 132).
  // Diferente de placeDoorHinges (dobradiça de embutir, eixo vertical): a
  // porta basculante não usa dobradiça de embutir — usa um par de PISTÕES A
  // GÁS (1 de cada lado, esquerda/direita) que sustentam a porta aberta
  // numa posição intermediária, mais uns "nós" de dobradiça simples na
  // própria borda que gira (piano hinge / dobradiça de pressão, não copo
  // broqueado).
  //
  // doorGroup AQUI já É o grupo-pivô (mesmo `doorGroup`/`freeGroup` que os
  // dois chamadores passam pra placeDoorHinges — ver positionWithOpening: pra
  // opening.type==='hinge' o `emit()` devolve o `pivot`, não o content cru).
  // Local space do pivô: origem (0,0,0) = a PRÓPRIA borda que gira (topo da
  // porta pra hingeSide 'top', base pra 'bottom' — ver positionWithOpening),
  // eixo X = largura da porta (-doorWidthM/2..+doorWidthM/2, centrado),
  // sinal de Y = pra ONDE a porta pendura a partir da dobradiça ('top':
  // desce, Y local negativo; 'bottom': sobe, Y local positivo).
  //
  // O pistão conecta 2 pontos que NÃO giram juntos: uma ponta é fixa no
  // corpo do móvel (não gira com a porta), a outra é presa na porta (gira
  // junto). Por isso o cilindro do pistão não pode nascer uma vez só — ele
  // é recalculado a cada quadro que a porta estiver girando (ver
  // `updateStruts`, chamada de dentro de animate() via
  // `pivot.userData.updateStruts`), igual uma peça de "olhar pro alvo"
  // comum em jogos/3D. A ponta fixa e o cilindro do pistão são filhos do
  // MESMO parent que o doorGroup (não do doorGroup em si — senão girariam
  // junto com a porta), pra ficarem no mesmo espaço de coordenadas.
  function placeFlapHardware(doorGroup, doorWidthM, doorHeightM, doorThicknessM, hingeSide) {
    const parent = doorGroup && doorGroup.parent;
    if (!parent || typeof THREE === 'undefined') return;
    const { metal } = getHingeMaterials();

    // ---- 1. "Nós" de dobradiça na própria borda que gira (visual simples,
    // 3 pontos ao longo da largura — não tem copo/aba porque não é
    // dobradiça de embutir). Ficam DENTRO do doorGroup: giram junto com a
    // porta (fisicamente corretos, o corpo da dobradiça é preso na porta).
    const knuckleRadius = 0.007;
    const knuckleLen = Math.min(0.045, doorWidthM * 0.1);
    [0.12, 0.5, 0.88].forEach((f) => {
      const lx = -doorWidthM / 2 + doorWidthM * f;
      const geo = new THREE.CylinderGeometry(knuckleRadius, knuckleRadius, knuckleLen, 12);
      geo.rotateZ(Math.PI / 2); // cilindro nasce em pé (eixo Y); deita no eixo X (largura)
      const knuckle = new THREE.Mesh(geo, metal);
      knuckle.position.set(lx, 0, -doorThicknessM / 2 - knuckleRadius * 0.6);
      doorGroup.add(knuckle);
    });

    // ---- 2. Pistão a gás — 1 de cada lado (esquerda/direita da porta) ----
    // sign: 'top' (basculante) a porta pendura PRA BAIXO do pivô (Y local
    // negativo); 'bottom' (basculante inverso) pendura PRA CIMA (Y local
    // positivo) — ver positionWithOpening.
    const sign = hingeSide === 'top' ? -1 : 1;
    // Ponta da porta: perto da borda LIVRE (oposta à dobradiça), onde o
    // pistão tem alavanca de verdade — igual a foto de referência.
    const doorEndLocalY = sign * (doorHeightM - Math.min(0.12, doorHeightM * 0.25));
    // Ponta fixa no corpo: mais perto da dobradiça que a ponta da porta
    // (suporte curto, preso na lateral perto do topo/base do móvel), e
    // puxada pra TRÁS (sentido do interior do móvel) a partir da posição
    // FECHADA da porta — aproximação por não termos a profundidade real do
    // módulo aqui (mesmo espírito das outras SIMPLIFICAÇÕES CONSCIENTES do
    // arquivo, ex.: giro de peça inclinada).
    const fixedLocalYOffset = sign * Math.min(0.15, doorHeightM * 0.4);
    const fixedBackZ = doorGroup.position.z - Math.min(0.13, doorThicknessM + 0.09);

    const insetX = Math.min(0.045, doorWidthM * 0.12);
    const strutRadius = 0.006;
    const braceGeo = () => new THREE.BoxGeometry(0.018, 0.05, 0.03);
    const struts = [];

    [-1, 1].forEach((sideX) => {
      const lx = sideX * (doorWidthM / 2 - insetX);

      // Suporte fixo na lateral do móvel — filho do PARENT (não gira).
      const bracket = new THREE.Mesh(braceGeo(), metal);
      bracket.position.set(doorGroup.position.x + lx, doorGroup.position.y + fixedLocalYOffset, fixedBackZ);
      parent.add(bracket);

      // Suporte na porta — filho do doorGroup (gira junto).
      const doorBracket = new THREE.Mesh(braceGeo(), metal);
      doorBracket.position.set(lx, doorEndLocalY, -doorThicknessM / 2 - 0.015);
      doorGroup.add(doorBracket);

      // Cilindro do pistão — filho do PARENT (não gira; sua ORIENTAÇÃO/
      // COMPRIMENTO é que mudam a cada quadro pra continuar ligando as 2
      // pontas, ver updateStruts).
      const strutGeo = new THREE.CylinderGeometry(strutRadius, strutRadius, 0.1, 8);
      const strutMesh = new THREE.Mesh(strutGeo, metal);
      parent.add(strutMesh);

      struts.push({ mesh: strutMesh, fixedPos: bracket.position, doorLocalPos: doorBracket.position });
    });

    const tmpWorld = new THREE.Vector3();
    const tmpDir = new THREE.Vector3();
    const upVec = new THREE.Vector3(0, 1, 0);
    function updateStruts() {
      parent.updateMatrixWorld(true);
      doorGroup.updateMatrixWorld(true);
      struts.forEach((s) => {
        tmpWorld.copy(s.doorLocalPos);
        doorGroup.localToWorld(tmpWorld); // ponta da porta -> espaço da cena
        parent.worldToLocal(tmpWorld);    // -> espaço do parent (mesmo da ponta fixa/pistão)
        tmpDir.subVectors(tmpWorld, s.fixedPos);
        const len = Math.max(tmpDir.length(), 0.02);
        s.mesh.position.copy(s.fixedPos).addScaledVector(tmpDir, 0.5);
        s.mesh.scale.set(1, len / 0.1, 1); // strutGeo nasceu com altura 0.1
        s.mesh.quaternion.setFromUnitVectors(upVec, tmpDir.normalize());
      });
    }
    updateStruts(); // estado inicial (a porta já nasce aberta/fechada conforme doorsOpen)
    doorGroup.userData.updateStruts = updateStruts;
  }

  // width_mm/height_mm/depth_mm = medidas atuais do módulo (do formulário do
  // cliente) — usadas só como volume/limites de montagem e enquadramento da
  // câmera. parts = lista de peças JÁ RESOLVIDAS (uma por componente/módulo
  // aninhado do módulo): { position_role, width_mm, height_mm, depth_mm,
  // color }, onde color já vem escolhido (caixa ou porta) conforme a peça.
  // Qualquer peça pode opcionalmente ser um MÓDULO ANINHADO (Fase 2 —
  // migration 023) em vez de um componente-folha: is_module=true,
  // opening_type ('none'/'hinge_left'/'hinge_right'/'slide_out') e
  // child_pieces — [{ position_role, width_mm, height_mm, depth_mm, color,
  // is_module?, child_pieces? }] com as peças REAIS da composição desse
  // módulo filho (fundo, laterais, frente/porta, gaveta...), já resolvidas
  // com W/H/D = dimensões do próprio módulo filho (client.js/portal.js/
  // admin.js) — recursivo em profundidade ilimitada. Se presente,
  // buildModuleAssembly monta o corpo de verdade em vez de uma caixa única
  // (ver resolveContent, chamado de dentro de placePieceInBox/
  // placeFrontGroupInBox), com abertura por dobradiça (hinge_left/right) ou
  // por corrediça (slide_out — desliza no eixo Z). drawerComposition (nome
  // antigo, pré-Fase 2) continua aceito como sinônimo de child_pieces só
  // por compatibilidade, até client.js/portal.js migrarem (task #156). refit
  // = true recentraliza a câmera (usado só na troca de módulo, pra não
  // brigar com o zoom/rotação que o cliente já ajustou manualmente ao só
  // mudar cor/medida).
  //   tightFrame — true pra um enquadramento BEM mais apertado (margem
  //     mínima garantida, sem cortar o módulo) e compatível com câmera
  //     ortográfica ("visão paralela") — usado só pela geração de imagem 3D
  //     do admin (module-image-viewer3d-canvas), pra caber mais peça na
  //     miniatura da vitrine. Sem isso (undefined/false), comportamento de
  //     sempre — configurador do cliente (portal.js/client.js) não muda em
  //     nada.
  // ---- Ambiente da casa (linhas de chão/teto/baseboard) ----
  // Mesmo estilo da aba Composição (ver buildRoomEnvironment em
  // viewer3d_composition.js), agora também no configurador da aba Quote
  // (pedido do usuário: "seguir na aba quote a mesma regra das linhas do
  // chão e do teto"). OPT-IN: só desenha depois que alguém chamar
  // setRoomEnvironment(cfg) — portal.js chama com o pé direito/rodapé do
  // cliente; admin.js/client.js não chamam e ficam exatamente como sempre.
  // As linhas ficam num grupo próprio (fora de partMeshes), escondido
  // durante snapshot() pra miniatura do carrinho continuar só com o móvel.
  let roomEnvGroup = null;
  let roomEnvConfig = null;
  // Afastamento do teto — migration_060 (pedido do usuário 2026-07-29): agora
  // é OPT-IN por módulo (module.ceiling_clearance_enabled/ceiling_clearance_mm
  // no admin), não mais um valor fixo pra todo mundo. Este viewer (singleton
  // do configurador de 1 módulo só) sempre tem exatamente UM módulo por vez,
  // então dá pra desenhar a linha refletindo a regra REAL — portal.js passa
  // o valor certo em cfg.ceilingClearanceM (ver viewerRoomEnvConfig). Sem
  // esse campo (chamador antigo, ou nenhum roomEnvConfig setado ainda), cai
  // no default de 5" de sempre — mantém compatibilidade com qualquer uso que
  // não tenha sido atualizado.
  const ENV_CEILING_CLEARANCE_DEFAULT_M = 0.127; // 5"
  // Pedido do usuário, 2026-07-16 ("subir a linha trasejada em 5inches"):
  // depois de alinhar a linha tracejada com a régua de altura MÁXIMA
  // (ceilingMaxHeightMm() em portal.js, que desconta o rodapé), o usuário
  // pediu explicitamente pra subir a linha 5" — decisão dele, mantendo o
  // desconto de rodapé na régua de altura (não mexe em ceilingMaxHeightMm()
  // nem no valor máximo que o cliente consegue configurar, só onde a linha
  // de referência é DESENHADA).
  const MAX_HEIGHT_LINE_RAISE_M = 0.127; // 5"

  function makeEnvLine(p1, p2, dashed, color) {
    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const line = dashed
      ? new THREE.Line(geometry, new THREE.LineDashedMaterial({ color, dashSize: 0.07, gapSize: 0.05 }))
      : new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
    if (dashed) line.computeLineDistances();
    return line;
  }

  function makeEnvTextSprite(text) {
    const fontSize = 56;
    const paddingX = 22, paddingY = 14;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
    canvas.width = Math.ceil(ctx.measureText(text).width) + paddingX * 2;
    canvas.height = fontSize + paddingY * 2;
    ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2b2620';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    const worldH = 0.14;
    sprite.scale.set(worldH * (canvas.width / canvas.height), worldH, 1);
    return sprite;
  }

  function disposeRoomEnv() {
    if (!roomEnvGroup) return;
    scene.remove(roomEnvGroup);
    roomEnvGroup.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    roomEnvGroup = null;
  }

  // Redesenhada a cada update(), dimensionada pro módulo atual: as linhas
  // correm bem além do móvel pros dois lados (mesma regra de margem da
  // Composição), mostrando que não tem nada encostado.
  //
  // Pedido do usuário (2026-07-26, editando um módulo de Projeto: "gostaria
  // de ver o final das paredes, conforme medidas delas") — antes a linha
  // sempre usava uma margem GENÉRICA (proporcional à largura do módulo, sem
  // nenhuma relação com a parede de verdade — ficava parecendo que o chão/
  // teto continuavam pra sempre). Quando o chamador conhece a largura REAL
  // da parede (cfg.wallWidthM, só a aba Projetos tem esse dado — ver
  // viewerRoomEnvConfig em portal.js), a linha termina exatamente nos
  // cantos verdadeiros e ganha um traço vertical em cada ponta (chão até o
  // teto) marcando visualmente "aqui a parede acaba", não um corte
  // arbitrário de tela. cfg.moduleOffsetFromLeftM (distância do canto
  // esquerdo até a borda esquerda DESTE módulo, se o slot já existir)
  // posiciona o módulo no ponto certo dentro da parede; sem isso (módulo
  // novo, ainda sem posição salva), cai pra centralizado. Sem wallWidthM
  // nenhum (Composição/"Novo Orçamento" — não tem conceito de parede),
  // comportamento 100% igual a antes (margem genérica).
  function rebuildRoomEnv(W, D) {
    disposeRoomEnv();
    if (!roomEnvConfig || !scene) return;
    const cfg = roomEnvConfig;
    const group = new THREE.Group();
    const hasRealWall = cfg.wallWidthM > 0;
    let wallLeftX, wallRightX;
    if (hasRealWall) {
      const offsetFromLeftM = (typeof cfg.moduleOffsetFromLeftM === 'number')
        ? cfg.moduleOffsetFromLeftM
        : Math.max((cfg.wallWidthM - W) / 2, 0);
      wallLeftX = -W / 2 - offsetFromLeftM;
      wallRightX = wallLeftX + cfg.wallWidthM;
    } else {
      const margin = Math.max(W * 0.35, 0.9);
      wallLeftX = -W / 2 - margin;
      wallRightX = W / 2 + margin;
    }
    const wallWFull = wallRightX - wallLeftX;
    const ceilingH = cfg.ceiling_m;
    const baseH = cfg.baseboard_h_m || 0;
    // Plano da "parede" — CORREÇÃO (2026-07-15, pedido do usuário: módulos
    // soltos apareciam "no meio da parede" em vez de na frente dela): antes
    // z=0 (centro Z do módulo, já que ele nasce de z=-D/2 a z=+D/2 — ver
    // placePieceInBox), então um módulo fundo furava a linha da parede pela
    // metade. A parede de verdade fica atrás do móvel — encostada no FUNDO
    // dele (z=-D/2, mesmo raciocínio do comentário em
    // viewer3d_composition.js/buildScene: "Fundo de QUALQUER módulo cai
    // no plano da parede"), não no centro. D pode não vir informado (chamada
    // antiga sem esse argumento) — cai pra 0 (comportamento anterior) nesse caso.
    const z = -((D || 0) / 2);

    // Linha do chão (sólida) + baseboard (tracejada cinza).
    group.add(makeEnvLine(new THREE.Vector3(wallLeftX, 0, z), new THREE.Vector3(wallRightX, 0, z), false, 0x8a8378));
    // (tracejada do rodapé removida em 2026-08-13 — ver o comentário sobre
    //  rodapé/rodaforro em viewer3d_composition.js. A regra do móvel suspenso
    //  sobre o rodapé continua valendo; saiu só o desenho.)

    // Linha do teto (sólida) + rótulo, e tracejada vermelha da altura máx.
    if (ceilingH > 0) {
      group.add(makeEnvLine(new THREE.Vector3(wallLeftX, ceilingH, z), new THREE.Vector3(wallRightX, ceilingH, z), false, 0x8a8378));
      // (rótulo do pé-direito, tracejada da altura máxima e o rótulo dela
      //  removidos em 2026-08-13, a pedido do Matt: com parede sólida elas
      //  viraram ruído sobre o desenho. ceilingMaxHeightMm() em portal.js
      //  segue limitando a altura do módulo exatamente como antes.)

      // Traço vertical (chão até o teto) em cada ponta — só quando a largura
      // é REAL (hasRealWall), marcando o canto de verdade da parede. Sem
      // isso a linha simplesmente "acaba no ar" e não fica claro que ali é
      // o fim da parede, não um corte arbitrário.
      if (hasRealWall) {
        group.add(makeEnvLine(new THREE.Vector3(wallLeftX, 0, z), new THREE.Vector3(wallLeftX, ceilingH, z), false, 0x8a8378));
        group.add(makeEnvLine(new THREE.Vector3(wallRightX, 0, z), new THREE.Vector3(wallRightX, ceilingH, z), false, 0x8a8378));
      }
    }

    roomEnvGroup = group;
    scene.add(group);
  }

  // cfg = { ceiling_m, baseboard_h_m, ceilingLabel, maxHeightLabel } liga o
  // ambiente; null desliga. Se já tem módulo desenhado, redesenha na hora
  // reenquadrando (o teto precisa caber no quadro).
  function setRoomEnvironment(cfg) {
    roomEnvConfig = cfg || null;
    if (scene && lastUpdateArgs) update({ ...lastUpdateArgs, refit: true });
  }

  function update({ width_mm, height_mm, depth_mm, parts, refit, tightFrame, floor_height_mm }) {
    if (!scene || !available()) return;
    // Guardado só pra setProjectionMode conseguir reenquadrar de novo (mesma
    // peças/medidas) depois de trocar Perspectiva<->Ortográfica.
    lastUpdateArgs = { width_mm, height_mm, depth_mm, parts, refit, tightFrame, floor_height_mm };

    // Reajusta o tamanho do canvas/câmera pro tamanho ATUAL do container.
    // Necessário porque init() roda com a seção de configuração ainda
    // escondida (display:none => clientWidth 0), então a câmera nasce com uma
    // proporção estreita/quadrada; só o evento "resize" da JANELA chamava
    // onResize() antes, então quando a seção aparecia (module-select) o
    // desenho continuava com a proporção antiga — o módulo saía desenhado
    // pra proporção errada e aparecia "jogado" pro canto do canvas real, bem
    // mais largo. Rechecar aqui, toda vez que o 3D é atualizado, resolve sem
    // precisar caçar todo lugar que muda a visibilidade do container.
    onResize();

    const W = Math.max(width_mm || 400, 50) / 1000;
    const H = Math.max(height_mm || 700, 50) / 1000;
    const D = Math.max(depth_mm || 500, 50) / 1000;
    // Altura do chão (pedido do usuário, 2026-07-16: "mostrar isso no
    // desenho" — ver po-comp-floor-height-input em portal.js) — desloca o
    // moduleGroup inteiro no eixo Y a partir do chão de verdade (Y=0, onde
    // as linhas de rebuildRoomEnv continuam fixas). 0 fora do modo
    // Composição (floor_height_mm não é passado), comportamento idêntico a
    // antes.
    const floorOffsetM = Math.max(0, Number(floor_height_mm || 0)) / 1000;
    if (moduleGroup) moduleGroup.position.y = floorOffsetM;

    clearParts();

    // Agrupa por position_role pra empilhar corretamente peças repetidas
    // (várias prateleiras, várias gavetas, portas duplas, 4 pés...).
    const groups = {};
    (parts || []).forEach((part) => {
      const role = part.position_role || 'other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(part);
    });

    // Pés (position_role='leg'): erguem o corpo do móvel do chão. A altura
    // escolhida pelo cliente (H) JÁ INCLUI a altura dos pés — então o corpo
    // (laterais, base, topo, fundo, frente, prateleiras, gavetas,
    // travamentos) ocupa só "boxH" = H - altura do pé, deslocado pra cima
    // nessa mesma altura; os pés preenchem o vão de baixo, um em cada quina.
    // Sem pés cadastrados, legH = 0 e nada muda (comportamento de sempre).
    const legPart = (groups['leg'] || [])[0];
    const legH = legPart ? Math.max((legPart.height_mm || 0) / 1000, 0.01) : 0;
    const boxH = Math.max(H - legH, 0.05);

    // Vão interno real — do topo da base até a face de baixo do topo (Y), e
    // de dentro da lateral esquerda até dentro da lateral direita (X), se o
    // módulo tiver essas peças; senão cai pro volume externo inteiro. Usado
    // pra distribuir prateleiras (Y) e empilhar portas (X) dentro do vão
    // ÚTIL de verdade, não do volume externo do módulo. legH some pra placePart
    // saber quanto deslocar cada peça normal pra cima (0 se não tiver pés).
    const bounds = {
      innerBottomY: resolveThickness((groups['bottom'] || [])[0]),
      innerTopY: boxH - resolveThickness((groups['top'] || [])[0]),
      innerLeftX: -W / 2 + resolveThickness((groups['left'] || [])[0]),
      innerRightX: W / 2 - resolveThickness((groups['right'] || [])[0]),
      legH
    };

    Object.keys(groups).forEach((role) => {
      const group = groups[role];
      if (role === 'front') {
        placeFrontGroup(group, W, boxH, D, bounds);
      } else if (role === 'leg') {
        placeLegsGroup(group, W, D);
      } else {
        group.forEach((part, index) => placePart(part, W, boxH, D, index, group.length, bounds));
      }
    });

    // Linhas do ambiente (chão/baseboard/teto/altura máx) — só se alguém
    // ligou via setRoomEnvironment (portal). Redimensionadas pro W/D atuais
    // (D pra alinhar o plano da parede com o FUNDO do módulo, não o centro).
    rebuildRoomEnv(W, D);

    // O centro vertical de verdade do módulo é sempre H/2 (ele nasce no
    // chão, y=0, e cresce pra cima) — X/Z já ficam sempre em 0 porque W e D
    // são simétricos (-W/2..W/2, -D/2..D/2), então só a altura precisa de
    // acompanhamento. Duas situações:
    // - refit=true (troca de módulo): reenquadra do zero, com um ângulo
    //   padrão bonito, ignorando qualquer rotação/zoom anterior (é outro
    //   módulo, não faz sentido manter o enquadramento do anterior).
    // - refit=false (só mudou medida/cor no MESMO módulo): sem isso, alterar
    //   a altura ou a profundidade deixava o desenho "descentralizado" —
    //   a câmera continuava mirando o H/2 ANTIGO enquanto o corpo crescia/
    //   encolhia a partir do chão, e a distância também ficava desatualizada
    //   pra profundidade/largura novas. Em vez de resetar o ângulo (o que
    //   brigaria com a rotação que o cliente já ajustou manualmente), só
    //   reposiciona o alvo pro novo H/2 e reescala a distância câmera-alvo
    //   proporcionalmente à mudança de tamanho — preserva o ângulo de visão
    //   e o "nível de zoom" relativo, só recentraliza e reenquadra o volume.
    const maxDim = Math.max(W, H, D);
    // + floorOffsetM: o centro vertical de verdade do módulo, em coordenadas
    // de MUNDO, agora é floorOffsetM + H/2 (o corpo nasce no chão do
    // moduleGroup, y local=0, e o moduleGroup em si já foi deslocado acima)
    // — sem isso a câmera continuaria mirando H/2 mesmo com o módulo
    // flutuando mais alto, cortando ele do quadro. floorOffsetM=0 (fora do
    // modo Composição) devolve exatamente o H/2 de sempre.
    const newTarget = new THREE.Vector3(0, floorOffsetM + H / 2, 0);

    if (refit && tightFrame) {
      // Enquadramento apertado (pedido do usuário, só usado pela geração de
      // imagem 3D do admin) — calcula o raio da ESFERA que contém a caixa
      // W×H×D inteira, de QUALQUER ângulo de câmera (metade da diagonal
      // espacial: sqrt(W²+H²+D²)/2). Isso garante matematicamente o módulo
      // inteiro visível, com a MENOR margem possível (~8%, só pra não cortar
      // quina/aresta por arredondamento) — bem mais justo que a margem
      // generosa fixa (~2.4x) usada por padrão no configurador do cliente
      // (esse "else" abaixo continua 100% intocado).
      const R = 0.5 * Math.sqrt(W * W + H * H + D * D);
      const margin = 1.1;
      // Ângulo de câmera fixo (isométrico-like) — direção UNITÁRIA, não
      // dependente de W/H/D, pra dar pra resolver a distância exata a partir
      // só do raio/margem (ver abaixo), sem aproximação.
      const dir = new THREE.Vector3(0.8, 0.55, 0.95).normalize();

      if (camera.isOrthographicCamera) {
        // Ortográfica ("visão paralela") — o "zoom" não depende da
        // distância (câmera pode ficar em qualquer lugar na mesma direção),
        // só do frustum (left/right/top/bottom). Dimensiona o frustum pra
        // caber a esfera inteira, com a proporção (aspect) do canvas atual.
        const distance = R * 3; // só posição/ângulo de visão
        camera.position.copy(newTarget).addScaledVector(dir, distance);
        camera.lookAt(newTarget.x, newTarget.y, newTarget.z);
        const aspect = (containerEl.clientWidth || 300) / (containerEl.clientHeight || 320);
        const halfHeight = R * margin;
        const halfWidth = halfHeight * aspect;
        camera.left = -halfWidth;
        camera.right = halfWidth;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.near = 0.01;
        camera.far = Math.max(100, distance * 3);
      } else {
        // Perspectiva — resolve a distância EXATA (não aproximada) que
        // encosta a esfera de raio R*margin nas bordas do FOV vertical
        // atual da câmera: distance = (R*margin) / sin(fov/2).
        const fovRad = (camera.fov || 35) * Math.PI / 180;
        const distance = (R * margin) / Math.sin(fovRad / 2);
        camera.position.copy(newTarget).addScaledVector(dir, distance);
        camera.lookAt(newTarget.x, newTarget.y, newTarget.z);
      }
      camera.updateProjectionMatrix();
      if (controls) {
        controls.target.copy(newTarget);
        controls.update();
      }
      lastMaxDim = maxDim;
    } else if (refit) {
      // Com ambiente ligado (setRoomEnvironment) e módulo NO CHÃO DE VERDADE
      // (floorOffsetM=0), o quadro inicial precisa incluir a linha do teto
      // (+ rótulo acima dela), não só o módulo — mesma regra da Composição.
      // Módulo ELEVADO (floorOffsetM>0 — ver floor_height_mm/moduleGroup
      // acima): pedido do usuário, 2026-07-16: "o zoom foca no meio da
      // parede, mas deveria focar nos módulos inseridos" — encaixar o teto
      // inteiro no quadro fazia a câmera se afastar até o módulo (que pode
      // ser bem menor que o pé direito) virar um ponto minúsculo, fora do
      // centro. Nesse caso o enquadramento ignora o teto e foca só no
      // módulo (mesma conta de newTarget/maxDim usada quando não tem
      // ambiente nenhum) — a linha do teto continua desenhada na cena (ver
      // rebuildRoomEnv), só não entra mais no cálculo de zoom/mira.
      const includeCeilingInFrame = !!(roomEnvConfig && roomEnvConfig.ceiling_m > 0 && floorOffsetM === 0);
      const frameH = includeCeilingInFrame ? Math.max(H, roomEnvConfig.ceiling_m + 0.25) : H;
      const frameTarget = includeCeilingInFrame ? new THREE.Vector3(0, frameH / 2, 0) : newTarget;
      const frameMaxDim = Math.max(W, frameH, D);

      // Enquadramento PRECISO (pedido do usuário, 2026-07-16: "o zoom ainda
      // tira o que fica nas bordas pra fora... mais preciso nos módulos
      // inseridos") — a fórmula antiga (dist = frameMaxDim*2.4, câmera num
      // ponto fixo relativo à origem) era um palpite "que geralmente parece
      // bom", sem garantir matematicamente que o volume inteiro coubesse no
      // quadro pra qualquer proporção de módulo/tela — sobrava corte nas
      // bordas em módulos bem largos/rasos ou telas estreitas, e piorava
      // ainda mais quando o alvo saía do centro (módulo elevado, ver
      // floorOffsetM acima). Troca pro MESMO método já usado e testado no
      // enquadramento apertado do admin ("tightFrame", bloco acima): raio da
      // ESFERA que contém a caixa W×frameH×D inteira (metade da diagonal
      // espacial), e a distância exata que encosta essa esfera nas bordas
      // do FOV da câmera — aqui considerando TANTO o FOV vertical quanto o
      // horizontal (via camera.aspect, atualizado por onResize() logo no
      // início desta função), não só o vertical como o bloco do admin: um
      // módulo bem mais largo que alto podia estourar as bordas laterais
      // mesmo com a esfera "cabendo" verticalmente.
      const R = 0.5 * Math.sqrt(W * W + frameH * frameH + D * D);
      const margin = 1.15;
      const dir = new THREE.Vector3(0.8, 0.55, 0.95).normalize();
      if (camera.isPerspectiveCamera) {
        const fovYRad = (camera.fov || 35) * Math.PI / 180;
        const aspect = camera.aspect || 1;
        const fovXRad = 2 * Math.atan(Math.tan(fovYRad / 2) * aspect);
        const dist = Math.max(R / Math.sin(fovYRad / 2), R / Math.sin(fovXRad / 2)) * margin;
        camera.position.copy(frameTarget).addScaledVector(dir, dist);
      } else {
        // Ortográfica: zoom dela não depende de distância, só do frustum
        // (left/right/top/bottom, ver setProjectionMode) — mantém a mesma
        // conta heurística de sempre, não coberta por este ajuste.
        const dist = frameMaxDim * 2.4;
        camera.position.set(dist * 0.8, frameH * 0.75 + frameMaxDim * 0.35, dist * 0.95);
      }
      camera.lookAt(frameTarget.x, frameTarget.y, frameTarget.z);
      if (controls) {
        controls.target.copy(frameTarget);
        controls.update();
      }
      lastMaxDim = maxDim;
    } else if (controls && lastMaxDim) {
      if (roomEnvConfig && roomEnvConfig.ceiling_m > 0) {
        // Ambiente ligado: o quadro é dominado pelo teto (fixo), não pelo
        // módulo — mudar medida NÃO deve mexer na câmera (o módulo cresce/
        // encolhe dentro do mesmo quadro). Só atualiza o lastMaxDim.
        lastMaxDim = maxDim;
      } else {
        const offset = camera.position.clone().sub(controls.target);
        const scale = maxDim / lastMaxDim;
        offset.multiplyScalar(scale);
        camera.position.copy(newTarget).add(offset);
        camera.lookAt(newTarget.x, newTarget.y, newTarget.z);
        controls.target.copy(newTarget);
        controls.update();
        lastMaxDim = maxDim;
      }
    }
  }

  // Pés — variante de placeLegsGroup (ver comentário lá) que adiciona os
  // pés como FILHOS de um grupo recebido (addPartToGroup) em vez de ir
  // direto pra scene/partMeshes da cena singleton (addPart) — usada só por
  // buildStandaloneAssembly (composição, ver abaixo). Matemática IDÊNTICA a
  // placeLegsGroup, só o destino (grupo em vez de scene) muda; nenhuma
  // fórmula de posicionamento foi tocada/duplicada com alteração.
  function placeLegsGroupIntoGroup(parentGroup, group, W, D) {
    if (!group || !group.length) return;
    const first = group[0];
    const legW = Math.max((first.width_mm || 40) / 1000, 0.01);
    const legHeight = Math.max((first.height_mm || 114) / 1000, 0.01);
    const legRadius = legW / 2;
    const inset = Math.max(LEG_INSET_MM / 1000, legRadius + 0.01); // ver LEG_INSET_MM

    const corners = [
      [-W / 2 + inset, -D / 2 + inset],
      [W / 2 - inset, -D / 2 + inset],
      [-W / 2 + inset, D / 2 - inset],
      [W / 2 - inset, D / 2 - inset]
    ];

    group.slice(0, 4).forEach((part, i) => {
      const [x, z] = corners[i] || corners[corners.length - 1];
      const geometry = new THREE.CylinderGeometry(legRadius, legRadius, legHeight, 16);
      const offX = (part.offset_x_mm || 0) / 1000;
      const offY = (part.offset_y_mm || 0) / 1000;
      const offZ = (part.offset_z_mm || 0) / 1000;
      const legObj = addPartToGroup(parentGroup, geometry, LEG_COLOR, x + offX, legHeight / 2 + offY, z + offZ);
      tagPieceUserData(legObj, part);
    });
  }

  // Monta um módulo COMPLETO E AUTÔNOMO (corpo + portas + pés + peças
  // aninhadas — a MESMA composição visual que update() desenha pro módulo
  // raiz da cena singleton) como um THREE.Group independente, sem adicionar
  // nada a nenhuma scene — quem chama decide onde/quando encaixar o grupo
  // devolvido. Usada pela aba "Composição" (ver js/viewer3d_composition.js)
  // pra desenhar vários módulos lado a lado numa cena PRÓPRIA, separada da
  // cena singleton usada pelo configurador normal (Viewer3D.update/init
  // continuam intocados — nenhum comportamento existente muda).
  //
  // Reaproveita a MESMA lógica de posicionamento já usada por update()
  // (placePieceInBox/placeFrontGroupInBox/buildModuleAssembly) — nenhuma
  // fórmula de posicionamento é duplicada nem reescrita aqui, só
  // reempacotada pra devolver um Group em vez de desenhar direto na cena
  // singleton (ver comentário de fragilidade no topo do arquivo — évitando
  // reescrever essa lógica é exatamente o ponto).
  //
  // openState = { doors, drawers } opcional (pedido do usuário, 2026-07-16:
  // "quero opcao abrir portas e gavetas no modulo composicao gerado") — cada
  // peça-que-abre nasce já no ângulo/deslocamento correspondente a esse
  // estado (mesma mecânica de porta/gaveta da cena singleton, ver
  // positionWithOpening), e o grupo devolvido carrega sua PRÓPRIA lista
  // `openables` (independente da cena singleton) pra quem chamou poder
  // animar abrir/fechar depois (ver ViewerComposition.toggleDoors/
  // toggleDrawers em viewer3d_composition.js). Omitir openState = portas/
  // gavetas nascem fechadas, como antes.
  function buildStandaloneAssembly(parts, width_mm, height_mm, depth_mm, openState) {
    if (!available()) return null;

    const W = Math.max(width_mm || 400, 50) / 1000;
    const H = Math.max(height_mm || 700, 50) / 1000;
    const D = Math.max(depth_mm || 500, 50) / 1000;

    const group = new THREE.Group();
    const assemblyOpenables = [];
    // Ativa o contexto ANTES de montar (inclusive pra módulos aninhados
    // recursivos via resolveContent/buildModuleAssembly, que também passam
    // por positionWithOpening) — desativa no finally, síncrono, sem risco de
    // vazar pra uma chamada de update() da cena singleton (ver activeOpenCtx).
    activeOpenCtx = {
      doors: !!(openState && openState.doors),
      drawers: !!(openState && openState.drawers),
      openables: assemblyOpenables
    };

    try {
      const groups = {};
      (parts || []).forEach((part) => {
        const role = part.position_role || 'other';
        if (!groups[role]) groups[role] = [];
        groups[role].push(part);
      });

      const legPart = (groups['leg'] || [])[0];
      const legH = legPart ? Math.max((legPart.height_mm || 0) / 1000, 0.01) : 0;
      const boxH = Math.max(H - legH, 0.05);

      const bounds = {
        innerBottomY: resolveThickness((groups['bottom'] || [])[0]),
        innerTopY: boxH - resolveThickness((groups['top'] || [])[0]),
        innerLeftX: -W / 2 + resolveThickness((groups['left'] || [])[0]),
        innerRightX: W / 2 - resolveThickness((groups['right'] || [])[0]),
        legH
      };

      const emit = (content, color, x, y, z, rotateTexture, opening) =>
        addPartToGroup(group, content, color, x, y, z, rotateTexture, opening);

      Object.keys(groups).forEach((role) => {
        const roleParts = groups[role];
        if (role === 'front') {
          placeFrontGroupInBox(roleParts, W, boxH, D, bounds, emit);
        } else if (role === 'leg') {
          placeLegsGroupIntoGroup(group, roleParts, W, D);
        } else {
          roleParts.forEach((part, index) => placePieceInBox(part, W, boxH, D, index, roleParts.length, bounds, emit));
        }
      });

      return { group, width_m: W, height_m: H, depth_m: D, openables: assemblyOpenables };
    } finally {
      activeOpenCtx = null;
    }
  }

  // Tira uma miniatura PNG (data URL) do que está desenhado agora — usado
  // pelo portal do cliente pra guardar uma imagem ilustrativa de cada
  // módulo configurado, no momento em que ele é adicionado ao pedido.
  // Força um render síncrono antes de ler o canvas (o loop de animate()
  // roda em requestAnimationFrame, então sem isso a leitura podia pegar um
  // frame ainda não desenhado). Devolve null se o 3D não estiver disponível.
  function snapshot() {
    if (!renderer || !scene || !camera) return null;
    // Esconde as linhas do ambiente (chão/teto/baseboard) durante o
    // snapshot — a miniatura do carrinho deve mostrar SÓ o móvel.
    const envWasVisible = !!(roomEnvGroup && roomEnvGroup.visible);
    if (roomEnvGroup) roomEnvGroup.visible = false;
    try {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } catch (err) {
      return null;
    } finally {
      if (roomEnvGroup) roomEnvGroup.visible = envWasVisible;
    }
  }

  // Troca Perspectiva <-> Ortográfica ("visão paralela", pedido do usuário).
  // OrbitControls fica preso a UM objeto câmera desde a criação — não dá pra
  // só mudar o "tipo" da mesma instância, então troca de verdade: descarta
  // os controls antigos, cria uma câmera nova do tipo pedido, controls novos
  // presos a ela, e reenquadra usando o ÚLTIMO update() recebido (mesmas
  // peças/medidas de antes) — quem chamou não precisa montar tudo de novo.
  // Chamável ANTES de init() também (só guarda o modo — a próxima init() já
  // nasce com a câmera certa).
  function setProjectionMode(mode) {
    if (mode !== 'perspective' && mode !== 'orthographic') return;
    if (mode === projectionMode) return;
    projectionMode = mode;
    if (!renderer || !containerEl) return; // ainda não inicializado — init() resolve

    const width = containerEl.clientWidth || 300;
    const height = containerEl.clientHeight || 320;
    const prevTarget = controls ? controls.target.clone() : new THREE.Vector3(0, 0, 0);

    if (controls) controls.dispose();
    camera = createCamera(width, height);
    // Posição/mira provisórias — update() (chamado logo abaixo, se houver
    // peça anterior) reenquadra de verdade, incluindo a posição final.
    camera.position.set(prevTarget.x + 1, prevTarget.y + 1, prevTarget.z + 1);
    camera.lookAt(prevTarget);
    camera.updateProjectionMatrix();

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    // Sem amortecimento — ver o comentário na outra criação de OrbitControls
    // deste arquivo (2026-08-13).
    controls.enableDamping = false;
    controls.minDistance = 0.05;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.target.copy(prevTarget);
    controls.update();

    if (lastUpdateArgs) {
      update({ ...lastUpdateArgs, refit: true });
    } else {
      onResize();
    }
  }

  function getProjectionMode() {
    return projectionMode;
  }

  return {
    init, update, available, snapshot,
    // Exposto só pra diagnóstico/teste automatizado (mesmo padrão de
    // Drilling._internals e Hardware._casaFuro) — ver
    // scripts/tests/teste-veio-rodape.js. Não é API pra telas usarem.
    _internals: { resolveGrainRotate, resolveRotateTexture, PAPEIS_VEIO_PELO_FORMATO },
    // Linhas de chão/teto/baseboard da casa do cliente no configurador —
    // opt-in, só o portal chama (ver setRoomEnvironment acima).
    setRoomEnvironment,
    // Monta um módulo autônomo (Group, sem tocar em nenhuma scene) — usado
    // pela aba "Composição" (js/viewer3d_composition.js) pra desenhar vários
    // módulos lado a lado numa cena própria. Ver comentário completo acima
    // de buildStandaloneAssembly — reaproveita a mesma lógica de
    // posicionamento de update(), não duplica/reescreve nada dela.
    buildStandaloneAssembly,
    // Estilo de desenho (contorno fino/grosso/suave/nenhum + textura on/off) —
    // ver estiloDesenho. Vale pra QUALQUER cena montada por este arquivo,
    // inclusive a da Composição/Projetos, porque todas passam por
    // addPartToGroup/makeMaterial. Só afeta a próxima montagem.
    setDrawStyle, getDrawStyle,
    // Exposto pra quem monta geometria FORA do addPartToGroup e ainda assim
    // precisa do mesmo contorno — hoje as paredes do ambiente
    // (viewer3d_composition.js/makeWallSurface). Sem isto o móvel teria
    // aresta e a parede não.
    buildEdgesForStyle,
    // Materiais por face de UMA peça (migration 088) — face com a cor, borda
    // com fita ou com o miolo da chapa. Exposto pra quem monta cena PRÓPRIA
    // (o construtor de módulos do ERP) não precisar reimplementar a regra e
    // acabar divergindo do 3D principal. Devolve null quando a peça ainda
    // não tem receita de fita: quem chama usa o material único de sempre.
    materialsForPart: makeBoxMaterials,
    materialForColor: makeMaterial,
    // Geometria da chapa de UMA peça (migration 094) — BoxGeometry normal, ou
    // o contorno em L quando ela tem recorte cadastrado (o entalhe do toe).
    // Exposto pelo mesmo motivo de materialsForPart logo acima: quem monta
    // cena PRÓPRIA (o construtor de módulos do ERP) usa a mesma função em vez
    // de criar uma BoxGeometry na mão e desenhar a lateral sem o entalhe.
    geometryForPart: buildPanelGeometry,
    // Perspectiva <-> Ortográfica ("visão paralela") — ver setProjectionMode.
    // Usado hoje só pelo admin (geração de imagem 3D do módulo).
    setProjectionMode, getProjectionMode,
    // Espera texturas em carregamento antes de um snapshot "oficial" — ver
    // admin.js (geração da imagem 3D do módulo).
    waitForPendingTextures,
    // Duplo-clique numa peça -> painel de info (ver handleDoubleClick).
    onPieceDoubleClick,
    // Controles SEPARADOS de porta e gaveta (pedido do usuário) — "Abrir
    // portas" só mexe em peças kind:'hinge', "Abrir gavetas" só em
    // kind:'slide', cada um com seu próprio estado persistente.
    toggleDoorsOnly, areDoorsOnlyOpen,
    toggleDrawersOnly, areDrawersOnlyOpen,
    // Apelidos legados (comportamento antigo, cobria os dois kinds juntos —
    // ver definição de toggleOpenables/areOpenablesOpen acima): mantidos só
    // por segurança, caso algum código externo ainda os chame. Novo código
    // (client.js/portal.js) já usa toggleDoorsOnly/toggleDrawersOnly direto.
    toggleOpenables, areOpenablesOpen,
    toggleDoors: toggleOpenables, areDoorsOpen: areOpenablesOpen,
    // Diagnóstico de VRAM de textura, ver comentário completo na definição
    // de textureMemoryReport acima. Uso: Viewer3D.textureMemoryReport() no
    // console do navegador.
    textureMemoryReport
  };
})();
