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

  function openAngleFor(hingeSide) {
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
  function loadTexture(url, rotateMode) {
    if (!url) return null;
    const rotateSuffix = rotateMode === true ? '|rot90' : rotateMode === 'right' ? '|rot90r' : '';
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
  }

  // color = registro da tabela colors ({ texture_url, swatch_hex, name }).
  function makeMaterial(color, rotateTexture) {
    const textureUrl = color && color.texture_url;
    const tex = textureUrl ? loadTexture(textureUrl, rotateTexture) : null;
    if (tex) {
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 });
    }
    const hex = (color && color.swatch_hex) || '#cccccc';
    return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, metalness: 0.05 });
  }

  // Cria a câmera de acordo com projectionMode atual — Perspectiva (padrão,
  // sempre foi assim) ou Ortográfica ("visão paralela"). A ortográfica nasce
  // com um frustum qualquer (-1..1) só de placeholder; quem chama sempre
  // reenquadra de verdade logo em seguida (update()/setProjectionMode), que
  // recalcula left/right/top/bottom a partir do módulo desenhado.
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
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
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
          op.group.rotation.y = op.currentAngle;
        }
      } else if (op.kind === 'slide') {
        const diff = op.targetOffset - op.currentOffset;
        if (Math.abs(diff) > 0.0002) {
          op.currentOffset += diff * 0.14;
          op.group.position.z = op.baseZ + op.currentOffset;
        }
      }
    });
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
  function buildContentGroup(contentOrGeometry, color, rotateTexture) {
    if (contentOrGeometry && contentOrGeometry.isGroup) return contentOrGeometry;
    const mesh = new THREE.Mesh(contentOrGeometry, makeMaterial(color, rotateTexture));
    const edgesGeometry = new THREE.EdgesGeometry(contentOrGeometry);
    const edges = new THREE.LineSegments(edgesGeometry, new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: EDGE_OPACITY }));
    const group = new THREE.Group();
    group.add(mesh);
    group.add(edges);
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
      const halfW = (opening.width || 0) / 2;
      const hingeX = opening.side === 'left' ? x - halfW : x + halfW;
      const localX = opening.side === 'left' ? halfW : -halfW;

      const pivot = new THREE.Group();
      content.position.set(localX, 0, 0);
      pivot.add(content);
      pivot.position.set(hingeX, y, z);

      const angle = doors ? openAngleFor(opening.side) : 0;
      pivot.rotation.y = angle;
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
  function resolveContent(part, geometry) {
    if (part && part.is_module && part.child_pieces && part.child_pieces.length) {
      const p = geometry.parameters;
      const assembly = buildModuleAssembly(part.child_pieces, p.width, p.height, p.depth);
      const centered = new THREE.Group();
      assembly.position.y = -p.height / 2;
      centered.add(assembly);
      return centered;
    }
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
      if (role === 'leg') return; // pés não fazem sentido dentro de uma sub-montagem aninhada
      if (!groups[role]) groups[role] = [];
      groups[role].push(p);
    });

    // Vão interno (Y) desta sub-montagem — mesmo espírito do bounds do
    // módulo pai (ver update()), pra 'shelf' distribuir entre o topo da base
    // e a face de baixo do topo desta composição, se ela tiver essas peças;
    // sem elas, cai pro volume local inteiro (innerBottomY=0, innerTopY=localH).
    const bounds = {
      innerBottomY: resolveThickness((groups['bottom'] || [])[0]),
      innerTopY: localH - resolveThickness((groups['top'] || [])[0]),
      legH: 0 // sub-montagem aninhada não tem pés próprios
    };

    const emit = (content, color, x, y, z, rotateTexture, opening) =>
      addPartToGroup(assembly, content, color, x, y, z, rotateTexture, opening);

    Object.keys(groups).forEach((role) => {
      const group = groups[role];
      if (role === 'front') {
        placeFrontGroupInBox(group, localW, localH, localD, bounds, emit);
      } else {
        group.forEach((part, index) => placePieceInBox(part, localW, localH, localD, index, group.length, bounds, emit));
      }
    });

    return assembly;
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
  function placePieceInBox(part, W, H, D, index, count, bounds, emitRaw) {
    const w = Math.max((part.width_mm || 0) / 1000, 0.002);
    const h = Math.max((part.height_mm || 0) / 1000, 0.002);
    const d = Math.max((part.depth_mm || 0) / 1000, 0.002);
    const role = part.position_role || 'other';
    const gap = 0.002;
    // Envolve o emit recebido pra marcar userData.pieceInfo (duplo-clique) no
    // Object3D devolvido, sem precisar tocar em nenhuma das chamadas
    // emit(...) abaixo (uma por role) — part já está em escopo aqui.
    const emit = (content, color, x, y, z, rotateTexture, opening) => {
      const obj = emitRaw(content, color, x, y, z, rotateTexture, opening);
      tagPieceUserData(obj, part);
      return obj;
    };

    // Deslocamento manual (mm -> m), cadastrado por módulo — some à posição
    // automática calculada pelo position_role (ex: fundo que entra num
    // rebaixo e fica alguns mm acima da base, em vez de centralizado).
    const offX = (part.offset_x_mm || 0) / 1000;
    const offY = (part.offset_y_mm || 0) / 1000;
    const offZ = (part.offset_z_mm || 0) / 1000;

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
      const geometry = new THREE.BoxGeometry(thickness, faceA, faceB);
      const x = -W / 2 + thickness / 2 + offX;
      const y = faceA / 2 + offY + legH;
      const z = -D / 2 + faceB / 2 + offZ;
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveRotateTexture(part.positioning, false), null);
    } else if (role === 'top' || role === 'bottom') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const geometry = new THREE.BoxGeometry(faceA, thickness, faceB);
      const x = -W / 2 + faceA / 2 + offX;
      const y = thickness / 2 + offY + legH;
      const z = -D / 2 + faceB / 2 + offZ;
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveRotateTexture(part.positioning, true), null);
    } else if (role === 'back') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const geometry = new THREE.BoxGeometry(faceA, faceB, thickness);
      const x = -W / 2 + faceA / 2 + offX;
      const y = faceB / 2 + offY + legH;
      const z = -D / 2 + thickness / 2 + offZ;
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveRotateTexture(part.positioning, false), null);
    } else if (role === 'shelf') {
      const { thickness, faceA, faceB } = splitThickness(w, h, d, part.positioning);
      const geometry = new THREE.BoxGeometry(faceA, thickness, faceB);
      // Quantidade escolhida pelo CLIENTE (componente com quantity_configurable
      // — client.js manda 1 peça repetida "count" vezes aqui). Distribui
      // igualmente dentro do VÃO INTERNO real do volume — do topo da base
      // até a face de baixo do topo/travessa — em vez da altura externa H
      // inteira, senão a conta ignora o espaço já ocupado pela base e pelo topo.
      const innerLow = (bounds && bounds.innerBottomY) || 0;
      const innerHigh = (bounds && bounds.innerTopY) || H;
      const span = Math.max(innerHigh - innerLow, 0.01);
      const y = innerLow + span * ((index + 1) / (count + 1));
      emit(resolveContent(part, geometry), part.color, 0 + offX, y + offY + legH, 0 + offZ, resolveRotateTexture(part.positioning, true), null);
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
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveRotateTexture(part.positioning, false), null);
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
      emit(resolveContent(part, geometry), part.color, x, y, z, resolveRotateTexture(part.positioning, true), null);
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
      if (resolveRotateTexture(part.positioning, false)) {
        rotateGeometryUV90(geometry);
      }
      const x = -W / 2 + w / 2 + offX;
      const y = h / 2 + offY + legH;
      const z = -D / 2 + d / 2 + offZ;
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
      const opening = hingeSide
        ? { type: 'hinge', side: hingeSide, width: w }
        : (part.is_module && part.opening_type === 'slide_out')
          ? { type: 'slide', distance: Math.min(d * 0.7, 0.4) }
          : null;
      // rotateTexture=false aqui embaixo (sempre) — o giro de 'free' já foi
      // aplicado na PRÓPRIA geometria acima (rotateGeometryUV90); passar
      // true/'right' pro material giraria a textura DE NOVO em cima disso,
      // dobrando o giro (90+90=180°, errado).
      const freeGroup = emit(resolveContent(part, geometry), part.color, x, y, z, false, opening);
      // Dobradiças visuais — mesma regra de 'front' (linha ~944): peça 'free'
      // com hingeSide resolvido é uma porta de verdade, só que posicionada
      // manualmente em vez de automaticamente. Sem isso, a porta abria/fechava
      // (openables já cobria isso via resolveHingeSide) mas não desenhava a
      // ferragem física da dobradiça.
      if (hingeSide) {
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

  function placeLegsGroup(group, W, D) {
    if (!group || !group.length) return;
    const first = group[0];
    const legW = Math.max((first.width_mm || 40) / 1000, 0.01);
    const legHeight = Math.max((first.height_mm || 114) / 1000, 0.01);
    const legRadius = legW / 2;
    const inset = legRadius + 0.01; // um pouco pra dentro da quina, não cravado bem na aresta

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
      const opening = hingeSide ? { type: 'hinge', side: hingeSide, width: doorW } : null;
      const doorGroup = emit(content, part.color, x + offX, faceB / 2 + offY + legH, D / 2 + thickness / 2 + gap + offZ, resolveRotateTexture(part.positioning, false), opening);
      tagPieceUserData(doorGroup, part); // duplo-clique (ver placePieceInBox pro mesmo padrão nos outros papéis)

      // Dobradiças em qualquer porta de verdade (hingeSide resolvido — frente
      // fixa não tem), seja ela uma peça-folha simples ou um modelo de porta
      // aninhado. Quantidade vem da MESMA regra usada no cálculo de preço
      // (Pricing.hingeCountForDoorHeight), pra nunca desenhar um número
      // diferente do que foi cobrado.
      if (hingeSide) {
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
  const ENV_CEILING_CLEARANCE_M = 0.127; // 5"
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
  function rebuildRoomEnv(W, D) {
    disposeRoomEnv();
    if (!roomEnvConfig || !scene) return;
    const cfg = roomEnvConfig;
    const group = new THREE.Group();
    const margin = Math.max(W * 0.35, 0.9);
    const wallW = W + margin * 2;
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
    group.add(makeEnvLine(new THREE.Vector3(-wallW / 2, 0, z), new THREE.Vector3(wallW / 2, 0, z), false, 0x8a8378));
    if (baseH > 0) {
      group.add(makeEnvLine(new THREE.Vector3(-wallW / 2, baseH, z), new THREE.Vector3(wallW / 2, baseH, z), true, 0x8a8378));
    }

    // Linha do teto (sólida) + rótulo, e tracejada vermelha da altura máx.
    if (ceilingH > 0) {
      group.add(makeEnvLine(new THREE.Vector3(-wallW / 2, ceilingH, z), new THREE.Vector3(wallW / 2, ceilingH, z), false, 0x8a8378));
      if (cfg.ceilingLabel) {
        const label = makeEnvTextSprite(cfg.ceilingLabel);
        label.position.set(0, ceilingH + 0.11, z + 0.05);
        group.add(label);
      }
      // CORREÇÃO (pedido do usuário, 2026-07-16: "to usando o maximo mas
      // ainda nao toca na linha segura") — faltava descontar o rodapé
      // (baseH) daqui, então esta linha ficava desenhada MAIS ALTA do que
      // o teto efetivo de verdade (ceilingMaxHeightMm() em portal.js, que
      // já descontava teto − 5" − rodapé − altura do chão do módulo) —
      // um módulo na altura MÁXIMA permitida pela régua nunca alcançava
      // esta linha, sobrava sempre uma folga do tamanho do rodapé. Mesma
      // conta de ceilingMaxHeightMm() (com altura do chão = 0 — esta linha
      // é uma referência FIXA do ambiente, não muda por módulo/coluna).
      // + MAX_HEIGHT_LINE_RAISE_M: pedido do usuário logo depois ("subir a
      // linha trasejada em 5inches") — só a linha sobe, a régua de altura
      // continua com o mesmo máximo de antes.
      const maxY = ceilingH - ENV_CEILING_CLEARANCE_M - baseH + MAX_HEIGHT_LINE_RAISE_M;
      group.add(makeEnvLine(new THREE.Vector3(-wallW / 2, maxY, z), new THREE.Vector3(wallW / 2, maxY, z), true, 0xb0503c));
      if (cfg.maxHeightLabel) {
        const label = makeEnvTextSprite(cfg.maxHeightLabel);
        label.position.set(wallW * 0.25, maxY - 0.11, z + 0.06);
        group.add(label);
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
    const inset = legRadius + 0.01;

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
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
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
    // Linhas de chão/teto/baseboard da casa do cliente no configurador —
    // opt-in, só o portal chama (ver setRoomEnvironment acima).
    setRoomEnvironment,
    // Monta um módulo autônomo (Group, sem tocar em nenhuma scene) — usado
    // pela aba "Composição" (js/viewer3d_composition.js) pra desenhar vários
    // módulos lado a lado numa cena própria. Ver comentário completo acima
    // de buildStandaloneAssembly — reaproveita a mesma lógica de
    // posicionamento de update(), não duplica/reescreve nada dela.
    buildStandaloneAssembly,
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
    toggleDoors: toggleOpenables, areDoorsOpen: areOpenablesOpen
  };
})();
