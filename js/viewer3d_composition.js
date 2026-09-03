// Cena 3D da COMPOSIÇÃO (vários módulos lado a lado) — LEGNO PORTAL WEB
//
// Cena Three.js SEPARADA e independente da cena singleton de js/viewer3d.js
// (usada pelo configurador normal, um módulo por vez, reaproveitada como
// overlay pela aba Composição pra escolher/configurar cada módulo) — não
// compartilha renderer/scene/camera com ela, e não mexe em nada de
// viewer3d.js além de consumir a função aditiva Viewer3D.
// buildStandaloneAssembly (ver comentário lá): monta o corpo/portas/pés/
// peças aninhadas de UM módulo como um THREE.Group autônomo, com a MESMA
// lógica de posicionamento já usada pelo viewer normal — esta cena só
// recebe esses Groups já prontos e os posiciona lado a lado em escala real,
// sem duplicar nenhuma fórmula de posicionamento de peça.
//
// Uso (ver js/portal.js, botão "Gerar 3D da composição"):
//   ViewerComposition.init('po-comp-3d-canvas');
//   ViewerComposition.render([{ group, width_m, height_m, depth_m }, ...]);
//
// Abrir portas/gavetas (2026-07-16): suportado via ViewerComposition.
// toggleDoors/toggleDrawers/areDoorsOpen/areDrawersOpen — estado PRÓPRIO
// desta cena (ver comentário de currentOpenables/doorsOpen abaixo),
// independente do configurador de módulo único. Limitação que CONTINUA
// aceita: sem balão de duplo-clique nesta cena (essa parte só existe no
// configurador individual, biblioteca de módulos de cada slot).
// FÁBRICA (2026-07-21, pedido do usuário: "visualizar 3d" na aba Projetos) —
// o corpo desta IIFE virou uma função nomeada, chamada uma vez pra criar
// ViewerComposition (exatamente como antes, zero mudança de comportamento
// pra Composição) E exposta como ViewerComposition.createInstance pra
// portal.js criar uma SEGUNDA instância independente (ViewerProject) — cada
// uma com seu PRÓPRIO renderer/scene/camera/currentGroups/doorsOpen (tudo
// dentro deste closure), sem disputar o canvas nem o estado de portas/
// gavetas uma da outra. Precisou virar fábrica porque init() já tinha um
// "só inicializa uma vez" (if (renderer) return) pensado pra UM canvas só —
// chamar init('po-proj-3d-canvas') na MESMA instância só ia reaproveitar o
// renderer já preso ao canvas da Composição.
function createViewerComposition3D() {
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  // Foto realista (2026-08-28, Matt: "a camera ta ficando diferente do
  // que eu vi no 3d") — quando o instante do último toque manual do
  // usuário nesta câmera (girar/arrastar/zoom), NÃO reação automática de
  // reenquadramento (fitCamera etc.). Ver getCameraState() mais abaixo e o
  // comentário grande em openPhotorealModal (portal-08-projetos-
  // paredes.js) pro motivo de existir.
  let lastUserCameraTouchAt = 0;
  let containerEl = null;
  let currentGroups = [];
  // Contorno de destaque (hover/seleção) — pedido do usuário 2026-07-26:
  // "quero que quando o mouse passe em cima do modulo ele fique contorno
  // vermelho, pra saber qual modulo sera editado ou movimentado". Só usado
  // por ViewerProjectEdit (Vista de Canto interativa, ver setHoverHighlight/
  // updateHoverHighlight/findGroupBySlotId abaixo) — THREE.BoxHelper é um
  // objeto de cena PRÓPRIO (linhas ao redor da bounding box de outro
  // Object3D), não mexe em nenhum material dos módulos de verdade.
  let hoverBoxHelper = null;

  // Abrir portas/gavetas (pedido do usuário, 2026-07-16: "quero opcao abrir
  // portas e gavetas no modulo composicao gerado") — ESTADO PRÓPRIO desta
  // cena, independente do configurador de módulo único (viewer3d.js tem o
  // seu próprio doorsOpen/drawersOpen/openables, ver comentário de
  // activeOpenCtx lá): abrir as portas da composição não mexe no
  // configurador individual, e vice-versa. currentOpenables é reconstruída a
  // cada render() (junta a lista `openables` que cada assembly já trouxe de
  // Viewer3D.buildStandaloneAssembly), doorsOpen/drawersOpen persistem ENTRE
  // renders (mesma convenção de viewer3d.js) — trocar cor/adicionar módulo
  // não fecha as portas já abertas sozinho, porque portal.js relê
  // areDoorsOpen()/areDrawersOpen() antes de reconstruir cada assembly (ver
  // generateComposition3D). Mesmo ângulo/interpolação de viewer3d.js
  // (DOOR_OPEN_ANGLE, animate() a cada frame) — comportamento visual idêntico
  // ao configurador de módulo único.
  let currentOpenables = [];
  let doorsOpen = false;
  let drawersOpen = false;
  // Junção automática de rodapé entre módulos adjacentes (migration 137,
  // pedido do Matt 2026-08-23). Override de SESSÃO — botão "Encaixe" da
  // barra do Projetos (ver toggleAutoJoinBaseboards/areBaseboardsAutoJoined
  // mais abaixo, e portal-08-projetos-paredes.js pela wiring do botão).
  // Nasce LIGADO (pedido original: "pode ate deixar botao la em cima na
  // barra sempre ligado"). Quando desligado, ignora auto_join_adjacent do
  // cadastro por inteiro — cada módulo sempre mantém seu próprio rodapé.
  let autoJoinBaseboards = true;

  // Guarda as dimensões do último enquadramento (ver bloco "Enquadramento
  // PRECISO" em render(), mais abaixo) — necessário pra snapshotFrontal()
  // recalcular a câmera numa direção diferente (frontal) sem duplicar a
  // fórmula de distância/raio da esfera, e pra devolver a câmera exatamente
  // de onde ela estava depois de tirar o print (a órbita normal do usuário
  // não pode ser afetada por gerar uma imagem pra IA).
  let lastFitTarget = null;
  let lastFitTotalWidth = 0;
  let lastFitFrameH = 0;
  let lastFitMaxDepth = 0;
  // Direção de câmera do último enquadramento de CANTO (renderFreeformWalls,
  // 2-3 paredes) — pedido do usuário (2026-07-26: "Imagem de IA 2 paredes ou
  // 3 paredes, camera pegando as duas paredes"). snapshot({angle:'corner'})
  // usa isto em vez de uma direção fixa (SNAPSHOT_ANGLE_DIRS foi pensada só
  // pra 1 parede — 'frontal' é quase Z puro, then corta as paredes laterais
  // de um L/C-U fora do enquadramento). Guardar a MESMA bissetriz que
  // renderFreeformWalls acabou de calcular (sem viés de parede ativa — só
  // ViewerProjectEdit passa activeWallIndex; o snapshot pra IA usa
  // ViewerProject, que nunca passa) garante as paredes todas visíveis, igual
  // à Vista de Canto.
  let lastFitDir = null;
  const DOOR_OPEN_ANGLE = Math.PI * 0.55;
  function openAngleFor(hingeSide) {
    return hingeSide === 'left' ? -DOOR_OPEN_ANGLE : DOOR_OPEN_ANGLE;
  }

  // Espaço entre módulos vizinhos — 0 (encostados) a pedido do usuário: os
  // módulos da composição devem se TOCAR, lado a lado, sem vão visível entre
  // eles (como dois móveis de verdade encostados um no outro).
  const GAP_M = 0;

  function available() {
    return typeof THREE !== 'undefined' && THREE.OrbitControls;
  }

  function init(containerId) {
    if (!available()) return;
    containerEl = document.getElementById(containerId);
    if (!containerEl) return;
    if (renderer) return; // já inicializado nesta sessão de página — reaproveita

    scene = new THREE.Scene();
    // Fundo BRANCO sólido — mesmo motivo/mesma escolha do viewer3d.js.
    scene.background = new THREE.Color(0xffffff);

    const width = containerEl.clientWidth || 300;
    const height = containerEl.clientHeight || 420;

    camera = new THREE.PerspectiveCamera(35, width / height, 0.01, 200);

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
    // 'start' dispara só em gesto de VERDADE do usuário (pointerdown que
    // vira giro/pan) — nunca em reenquadramento automático (fitCamera não
    // passa pelo OrbitControls). Zoom é tratado à parte, em
    // zoomTowardClient (enableZoom=false aqui, ver comentário abaixo).
    controls.addEventListener('start', () => { lastUserCameraTouchAt = Date.now(); });
    // SEM AMORTECIMENTO — a câmera anda exatamente com o ponteiro, 1:1.
    //
    // enableDamping + dampingFactor 0.08 (o que estava aqui) NÃO é "suavizar":
    // é fazer a câmera perseguir o alvo 8% por quadro. Na prática ela fica
    // sempre ~12 quadros atrás do mouse durante o arrasto e ainda continua
    // andando DEPOIS que o mouse parou. Foi exatamente o que o Matt relatou:
    // "delay grande de mexer no mouse e ver a tela mexer... deixa bem seco,
    // instantâneo". Isso também é meio caminho pro clique errado: com a cena
    // ainda deslizando, o que está sob o cursor no momento do clique não é
    // mais o que a pessoa mirou.
    //
    // Custo de desligar: o giro fica sem inércia (para na hora que o botão
    // solta). É o pedido. Não voltar sem o Matt pedir.
    controls.enableDamping = false;
    // 0.3 (30cm) vinha do visualizador de UM módulo e era o que fazia o zoom
    // "escorregar" na cena de ambiente: chegando perto do móvel o clamp
    // empurrava a câmera de volta e o ponto sob o cursor saía andando (Matt,
    // 2026-08-12). 5cm deixa encostar de verdade na peça.
    controls.minDistance = 0.05;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI * 0.49;
    // Zoom PRA ONDE O CURSOR/DEDOS APONTAM (pedido do usuário 2026-07-29: "o
    // zoom aproxima exatamente no meio da parede... quero mais liberdade pra
    // ver detalhes nas partes que ficam abaixo ou acima do meio da parede",
    // + "vou usar em tablets no futuro próximo, já deixo acertado os
    // detalhes pra isso") — o dolly padrão do OrbitControls sempre converge
    // pro controls.target (o "meio" de sempre), tanto no scroll do mouse
    // quanto no pinça de 2 dedos no touch. enableZoom=false desliga SÓ a
    // parte de zoom nativa (mouse E touch — handleTouchStartDollyPan/
    // handleTouchMoveDollyPan da biblioteca checam scope.enableZoom antes de
    // fazer dolly); o PAN de 2 dedos continua 100% nativo (gated só por
    // enablePan, que não mexemos) — sem esse pan nativo rodando junto, a
    // combinação arrastar+pinçar ficaria travada. handleZoomWheel (mouse,
    // ver função abaixo) e handleTouchMoveZoom (pinça, mesma função, ancora
    // no PONTO MÉDIO dos 2 dedos em vez do centro da tela) reimplementam só
    // o dolly, os dois chamando a mesma zoomTowardClient.
    controls.enableZoom = false;
    renderer.domElement.addEventListener('wheel', handleZoomWheel, { passive: false });
    renderer.domElement.addEventListener('touchstart', handleTouchStartZoom, { passive: true });
    renderer.domElement.addEventListener('touchmove', handleTouchMoveZoom, { passive: true });
    renderer.domElement.addEventListener('touchend', handleTouchEndZoom, { passive: true });
    renderer.domElement.addEventListener('touchcancel', handleTouchEndZoom, { passive: true });

    scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.15));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(2, 3, 2);
    scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
    fillLight.position.set(-2, 1, -2);
    scene.add(fillLight);

    window.addEventListener('resize', onResize);
    animate();
  }

  function onResize() {
    if (!containerEl || !camera || !renderer) return;
    const w = containerEl.clientWidth || 300;
    const h = containerEl.clientHeight || 420;
    if (camera.isOrthographicCamera) {
      // Ortográfica não tem aspect: o enquadramento é o próprio frustum. Mantém
      // a ALTURA visível e recalcula a largura, senão a cena estica ao mudar a
      // proporção do painel.
      const alturaVis = (camera.top - camera.bottom) || 1;
      const a = w / h;
      camera.left = -alturaVis * a / 2;
      camera.right = alturaVis * a / 2;
    } else {
      camera.aspect = w / h;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  // ==========================================================================
  // CÂMERA PARALELA (ortográfica) x PERSPECTIVA — 2026-08-13
  // ==========================================================================
  // Pedido do Matt. Paralela é o que marcenaria usa pra conferir alinhamento:
  // sem fuga, duas peças do mesmo tamanho medem o mesmo na tela, esteja uma na
  // frente da outra ou não.
  //
  // A troca preserva o enquadramento: a altura visível da ortográfica é
  // calculada da MESMA altura que a perspectiva mostra na distância atual do
  // alvo (2·d·tan(fov/2)), e o caminho de volta é o inverso. Assim o botão não
  // dá salto nenhum — só muda a projeção.
  //
  // O OrbitControls do r128 já lida com os dois tipos; o que ele não prevê é
  // TROCAR de câmera em pé. Trocar controls.object direto funciona (ele lê
  // scope.object em tudo) e evita recriar os controles, o que exigiria
  // reaplicar mouseButtons/enableZoom/limites e é onde isso costuma quebrar.
  // Ponto do mundo sob o cursor, no plano que passa pelo alvo da órbita — a
  // referência que o zoom ortográfico usa pra manter o ponto parado.
  function ndcParaMundoOrto(clientX, clientY) {
    if (!camera || !controls || !_raycaster) return null;
    _raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
    const normal = new THREE.Vector3();
    camera.getWorldDirection(normal);
    const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, controls.target);
    const alvo = new THREE.Vector3();
    return _raycaster.ray.intersectPlane(plano, alvo) ? alvo : null;
  }

  const CAM_FOV = 35;
  function setCameraProjection(tipo) {
    if (!camera || !controls || !renderer) return;
    const querOrto = tipo === 'paralela';
    if (querOrto === !!camera.isOrthographicCamera) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const a = (rect.width || 1) / (rect.height || 1);
    const alvo = controls.target.clone();
    const pos = camera.position.clone();
    const d = pos.distanceTo(alvo) || 3;
    let nova;
    if (querOrto) {
      const alturaVis = 2 * d * Math.tan((CAM_FOV * Math.PI / 180) / 2);
      nova = new THREE.OrthographicCamera(-alturaVis * a / 2, alturaVis * a / 2, alturaVis / 2, -alturaVis / 2, 0.01, 400);
    } else {
      nova = new THREE.PerspectiveCamera(CAM_FOV, a, 0.01, 200);
    }
    nova.position.copy(pos);
    nova.up.copy(camera.up);
    nova.lookAt(alvo);
    nova.updateProjectionMatrix();
    camera = nova;
    controls.object = camera;
    controls.update();
  }
  function getCameraProjection() {
    return (camera && camera.isOrthographicCamera) ? 'paralela' : 'perspectiva';
  }

  function animate() {
    if (!renderer) return;
    requestAnimationFrame(animate);
    if (controls) controls.update();
    // Interpolação suave de porta/gaveta abrindo/fechando — mesma matemática
    // de viewer3d.js/animate() (mantida idêntica de propósito, mesmo "feel"
    // nos dois viewers).
    currentOpenables.forEach((op) => {
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
    // NÃO DESENHA O QUE NINGUÉM ESTÁ VENDO (2026-08-13). display:none não para
    // o requestAnimationFrame: os viewers escondidos (o painel "Visualizar 3D"
    // fechado, o viewer oculto das miniaturas) continuavam renderizando a cena
    // inteira a cada quadro e disputando a GPU com o viewer que está na tela.
    // Na aba Projetos são DUAS ou TRÊS instâncias vivas ao mesmo tempo, então
    // isso é o orçamento de quadro do que a pessoa está mexendo.
    //
    // Só o desenho é pulado — o rAF continua, o estado das portas/gavetas
    // continua convergindo, e nada muda pro snapshot: snapshot() chama
    // renderer.render() por conta própria antes de ler o pixel (é o que faz a
    // foto realista e a miniatura funcionarem com o canvas escondido).
    if (containerEl && (!containerEl.clientWidth || !containerEl.clientHeight)) return;
    renderer.render(scene, camera);
  }

  function disposeObject3D(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      // SÓ dispose de .map pros sprites de texto das medidas (canvas
      // EXCLUSIVO de cada label, criado direto aqui em makeTextSprite/
      // buildDimensionAnnotations — esse sim vaza se não descartar).
      // NUNCA pros materiais de peça (corpo/porta/prateleira/etc): o .map
      // deles vem do textureCache/coreTextureCache COMPARTILHADO de
      // viewer3d.js (ver loadTexture/coreTexture lá, usados por
      // Viewer3D.buildStandaloneAssembly) — dispor ele aqui invalida a
      // textura pra QUALQUER outra peça que ainda esteja usando o mesmo
      // cache (outro módulo do MESMO projeto, ou até o configurador de
      // módulo único, já que o cache é uma variável só, compartilhada entre
      // toda a aba). Foi exatamente isso que causou o crash "Error
      // allocating Texture2D" / "WebGLRenderer: Context Lost" ao abrir um
      // projeto grande (26/08): render() chama clearGroups() a cada
      // (re)desenho, que descartava a textura compartilhada que os
      // assemblies RECÉM-montados (via cache) ainda estavam usando.
      // viewer3d.js já documenta essa regra no comentário de
      // coreTextureCache ("disposeObject3D descarta MATERIAL, não textura")
      // — esta função quebrava essa premissa sem os dois arquivos saberem.
      const isLabelSprite = !!obj.isSprite;
      materials.forEach((m) => {
        if (isLabelSprite && m.map) m.map.dispose();
        m.dispose();
      });
    }
    (obj.children || []).forEach(disposeObject3D);
  }

  function clearGroups() {
    currentGroups.forEach((group) => {
      scene.remove(group);
      disposeObject3D(group);
    });
    currentGroups = [];
  }

  // Material da peça original de rodapé, pra pintar a peça FUNDIDA igual —
  // sem isso a junção trocaria a cor/textura por um cinza genérico. mesh pode
  // ser o próprio Mesh (caso comum) ou um Group (giro de textura/conteúdo
  // especial) — desce até achar o primeiro Mesh de verdade, igual outros
  // pontos deste arquivo já fazem com objetos que podem vir dos dois jeitos.
  function pickBaseboardMaterial(obj) {
    if (!obj) return null;
    if (obj.isMesh && obj.material) return obj.material;
    let found = null;
    obj.traverse((o) => { if (!found && o.isMesh && o.material) found = o.material; });
    return found;
  }

  // JUNÇÃO AUTOMÁTICA DE RODAPÉ ENTRE MÓDULOS VIZINHOS (migration 137,
  // pedido do Matt 2026-08-23): "o rodape toekick fica separado por modulo,
  // porem na pratica ele precisa se unir ate no maximo 2.7metros... substitui
  // os 2 por um so no tamanho total".
  //
  // Chamada DEPOIS que a lista de assemblies de uma fileira (Composição) ou
  // de uma parede (Projetos) já foi posicionada no mundo (group.position/
  // rotation já definitivos) — nunca antes, porque a peça fundida precisa da
  // posição REAL de cada módulo, não da posição local dentro de cada um.
  //
  // Não recalcula NADA da posição/rotação por conta própria (perigoso demais
  // pra reescrever aqui, com paredes em qualquer ângulo — migration 100,
  // "paredes desenhadas"): lê a posição/rotação MUNDO já resolvida de cada
  // peça de rodapé (getWorldPosition/getWorldQuaternion, Three.js de
  // verdade), e só estende a peça ao longo do PRÓPRIO eixo local dela — por
  // isso funciona igual em qualquer ângulo de parede sem precisar conhecer
  // alongDir/intoDir/rotationY aqui.
  //
  // Cada peça de rodapé é identificada em viewer3d.js (placePieceInBox, ramo
  // 'baseboard') via mesh.userData.baseboardGeom — ver comentário lá.
  // ==========================================================================
  // COTAS (02/09, pedido do Matt: "mostrar as cotas no projeto... quero
  // saber quanto tem de espaco na parede... entre 2 objetos inseridos. na
  // largura altura... quero ver as linhas apontando do meio do modulo ate
  // bater no proximo objeto. com a cota no meio dessa linha").
  //
  // Só entre módulos da MESMA parede (list já é só os assemblies dela,
  // mesmo escopo de applyBaseboardJoins abaixo) — 2 eixos: LARGURA (vizinho
  // mais próximo ao lado, na mesma faixa de altura) e ALTURA (vizinho mais
  // próximo em cima, na mesma faixa de largura). Chamada DEPOIS que a
  // posição/rotação de cada assembly já é definitiva (mesma exigência de
  // applyBaseboardJoins), porque lê group.position de verdade.
  //
  // Este arquivo não sabe de unidade nem preferência do usuário — só desenha
  // a LINHA (geometria de verdade, THREE.Line) + uma "âncora" invisível no
  // meio dela com a distância em mm (userData.dimGapMm). Quem lê essa âncora
  // e escreve o texto é refreshProjectDimensionLabels
  // (portal-06c-projetos-canvas-3d-acoes.js), do mesmo jeito que os botões
  // flutuantes do módulo selecionado já fazem (ViewerProjectEdit.worldToClient
  // a cada frame, ver refreshProjectSlotActions).
  //
  // ESCOPO DESTA RODADA: só módulos de PAREDE (list) — módulos de ILHA
  // (chão) e a Vista Superior (plano 2D, sistema de desenho totalmente
  // diferente, ver renderProjectCanvasTop em portal-06c) ficam de fora,
  // PENDENTE de uma 2ª rodada.
  function buildProjectDimensionLines(list, ax, az, ox, oz, wallWidthM, room) {
    if (!Array.isArray(list) || !list.length) return;
    const alongDir = new THREE.Vector3(ax, 0, az);
    // Projeção escalar da ORIGEM da parede no próprio eixo dela — subtraindo
    // isto de qualquer `center.dot(alongDir)` sobra a posição "ao longo da
    // parede a partir do início dela" (0..wallWidthM), o mesmo referencial
    // de x_mm/width_m que já posicionou o group. Precisa disso pra saber
    // onde fica o LIMITE DA PAREDE (não só o vizinho mais próximo).
    const originAlong = (Number(ox) || 0) * ax + (Number(oz) || 0) * az;
    const wallW = Number(wallWidthM) || 0;
    const ceilingM = (room && Number(room.ceiling_m) > 0) ? Number(room.ceiling_m) : null;
    // Ponto "colado na parede" (02/09, pedido do Matt: "eu quero as linhas
    // azuis coladas na parede nao no centro do movel") — projeta qualquer
    // posição ao longo do eixo da parede (alongScalar = p.dot(alongDir)) de
    // volta pro PRÓPRIO PLANO da parede (profundidade zero), ignorando o
    // quanto o módulo esteja puxado pra dentro do ambiente. Sem isso, um
    // módulo com profundidade/afastamento da parede fazia a linha desenhar
    // na diagonal (do centro do módulo, já deslocado, até um ponto que É da
    // parede) em vez de ficar reta e encostada na parede como as larguras/
    // alturas realmente são medidas (a distância nunca considerou a
    // profundidade, só a posição ao longo da parede — só o DESENHO da linha
    // estava errado).
    const wallPoint = (alongScalar, y) => {
      const t = alongScalar - originAlong;
      return new THREE.Vector3(ox + ax * t, y, oz + az * t);
    };
    const entries = list.filter((a) => a && a.group).map((a) => ({
      // Convenção do group (ver comentário grande de renderFreeformWalls):
      // X/Z local centralizados, Y do chão pro topo — a posição MUNDO do
      // group já é o CENTRO ao longo da parede e a BASE (não o centro) na
      // vertical.
      center: a.group.position.clone(),
      halfW: a.width_m / 2,
      yBottom: a.group.position.y,
      yTop: a.group.position.y + a.height_m
    }));
    const DIM_MIN_GAP_M = 0.003; // encostado (ou sobreposto) não desenha nada
    const DIM_MAX_GAP_M = 3; // sanity: não "enxerga" vizinho do outro lado de um vão vazio enorme
    const DIM_TICK_M = 0.04;

    const dimGroup = new THREE.Group();
    dimGroup.userData.legnoLayer = 'cotas';
    const lineMat = new THREE.LineBasicMaterial({ color: 0x2b6cb0 });
    const addLine = (p1, p2) => {
      dimGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), lineMat));
    };
    const addAnchor = (mid, mm) => {
      const anchor = new THREE.Object3D();
      anchor.position.copy(mid);
      anchor.userData.dimGapMm = Math.round(mm);
      dimGroup.add(anchor);
    };

    // ---- LARGURA: vizinho mais próximo À DIREITA que compartilha alguma
    // faixa de altura com este módulo (senão um armário alto "veria" através
    // de um vão de altura vazio de um módulo baixo do outro lado). Se não
    // tiver NENHUM módulo daquele lado (best === null — não é só "longe",
    // é ausência mesmo), pedido do Matt 02/09 ("pega ate final da parede a
    // cota se nao tiver outro objeto inserido... sempre pega no limite ate
    // a parede"): mede até o CANTO da parede em vez de não desenhar nada.
    // Reta sempre reta (sem nada inclinado) — mesma altura yMid nas 2 pontas
    // nos dois casos. ----
    entries.forEach((e) => {
      let best = null, bestGap = Infinity;
      entries.forEach((o) => {
        if (o === e) return;
        const gap = o.center.dot(alongDir) - e.center.dot(alongDir) - e.halfW - o.halfW;
        if (gap < DIM_MIN_GAP_M - 1e-6) return;
        const overlap = Math.min(e.yTop, o.yTop) - Math.max(e.yBottom, o.yBottom);
        if (overlap <= 0) return;
        if (gap < bestGap) { bestGap = gap; best = o; }
      });
      const yMidSelf = (e.yBottom + e.yTop) / 2;
      const eAlongW = e.center.dot(alongDir);
      if (best && bestGap < DIM_MAX_GAP_M) {
        const yMid = (Math.max(e.yBottom, best.yBottom) + Math.min(e.yTop, best.yTop)) / 2;
        const bestAlongW = best.center.dot(alongDir);
        const p1 = wallPoint(eAlongW + e.halfW, yMid);
        const p2 = wallPoint(bestAlongW - best.halfW, yMid);
        addLine(p1, p2);
        addLine(p1.clone().add(new THREE.Vector3(0, -DIM_TICK_M / 2, 0)), p1.clone().add(new THREE.Vector3(0, DIM_TICK_M / 2, 0)));
        addLine(p2.clone().add(new THREE.Vector3(0, -DIM_TICK_M / 2, 0)), p2.clone().add(new THREE.Vector3(0, DIM_TICK_M / 2, 0)));
        addAnchor(p1.clone().lerp(p2, 0.5), bestGap * 1000);
      } else if (!best && wallW > 0) {
        // Fim da parede À DIREITA do módulo (relativo à origem da parede).
        const rightEdgeRel = (eAlongW - originAlong) + e.halfW;
        const gapToWall = wallW - rightEdgeRel;
        if (gapToWall > DIM_MIN_GAP_M) {
          const p1 = wallPoint(eAlongW + e.halfW, yMidSelf);
          const p2 = wallPoint(originAlong + wallW, yMidSelf);
          addLine(p1, p2);
          addLine(p1.clone().add(new THREE.Vector3(0, -DIM_TICK_M / 2, 0)), p1.clone().add(new THREE.Vector3(0, DIM_TICK_M / 2, 0)));
          addLine(p2.clone().add(new THREE.Vector3(0, -DIM_TICK_M / 2, 0)), p2.clone().add(new THREE.Vector3(0, DIM_TICK_M / 2, 0)));
          addAnchor(p1.clone().lerp(p2, 0.5), gapToWall * 1000);
        }
      }
      // Fim da parede À ESQUERDA — só quando NENHUM módulo (de qualquer
      // distância, sem limite de DIM_MAX_GAP_M: existência, não proximidade)
      // fica antes dele nessa faixa de altura, senão duplicaria a linha que
      // o vizinho já desenha pela busca "à direita" dele.
      const hasLeftNeighbor = entries.some((o) => {
        if (o === e) return false;
        const overlap = Math.min(e.yTop, o.yTop) - Math.max(e.yBottom, o.yBottom);
        if (overlap <= 0) return false;
        return (e.center.dot(alongDir) - e.halfW) - (o.center.dot(alongDir) + o.halfW) >= -DIM_MIN_GAP_M;
      });
      if (!hasLeftNeighbor && wallW > 0) {
        const leftEdgeRel = (eAlongW - originAlong) - e.halfW;
        if (leftEdgeRel > DIM_MIN_GAP_M) {
          const p1 = wallPoint(originAlong, yMidSelf);
          const p2 = wallPoint(eAlongW - e.halfW, yMidSelf);
          addLine(p1, p2);
          addLine(p1.clone().add(new THREE.Vector3(0, -DIM_TICK_M / 2, 0)), p1.clone().add(new THREE.Vector3(0, DIM_TICK_M / 2, 0)));
          addLine(p2.clone().add(new THREE.Vector3(0, -DIM_TICK_M / 2, 0)), p2.clone().add(new THREE.Vector3(0, DIM_TICK_M / 2, 0)));
          addAnchor(p1.clone().lerp(p2, 0.5), leftEdgeRel * 1000);
        }
      }
    });

    // ---- ALTURA: vizinho mais próximo EM CIMA que compartilha alguma faixa
    // de largura com este módulo (mesmo raciocínio, eixo trocado). Sem
    // vizinho ACIMA, mede até o TETO; sem vizinho ABAIXO (módulo elevado da
    // parede), mede até o CHÃO — mesmo princípio do "limite" acima, só que
    // o limite vertical é teto/chão em vez de canto de parede. ----
    entries.forEach((e) => {
      let best = null, bestGap = Infinity;
      entries.forEach((o) => {
        if (o === e) return;
        const gap = o.yBottom - e.yTop;
        if (gap < DIM_MIN_GAP_M - 1e-6) return;
        const eAlong = e.center.dot(alongDir), oAlong = o.center.dot(alongDir);
        const overlap = Math.min(eAlong + e.halfW, oAlong + o.halfW) - Math.max(eAlong - e.halfW, oAlong - o.halfW);
        if (overlap <= 0) return;
        if (gap < bestGap) { bestGap = gap; best = o; }
      });
      if (best && bestGap < DIM_MAX_GAP_M) {
        const eAlong = e.center.dot(alongDir), oAlong = best.center.dot(alongDir);
        const alongMid = (Math.max(eAlong - e.halfW, oAlong - best.halfW) + Math.min(eAlong + e.halfW, oAlong + best.halfW)) / 2;
        const p1 = wallPoint(alongMid, e.yTop);
        const p2 = wallPoint(alongMid, best.yBottom);
        addLine(p1, p2);
        const perp = new THREE.Vector3(-az, 0, ax); // perpendicular a alongDir, no plano horizontal
        addLine(p1.clone().addScaledVector(perp, -DIM_TICK_M / 2), p1.clone().addScaledVector(perp, DIM_TICK_M / 2));
        addLine(p2.clone().addScaledVector(perp, -DIM_TICK_M / 2), p2.clone().addScaledVector(perp, DIM_TICK_M / 2));
        addAnchor(p1.clone().lerp(p2, 0.5), bestGap * 1000);
      } else if (!best && ceilingM) {
        const gapToCeiling = ceilingM - e.yTop;
        if (gapToCeiling > DIM_MIN_GAP_M) {
          const eAlongH = e.center.dot(alongDir);
          const p1 = wallPoint(eAlongH, e.yTop);
          const p2 = wallPoint(eAlongH, ceilingM);
          addLine(p1, p2);
          const perp = new THREE.Vector3(-az, 0, ax);
          addLine(p1.clone().addScaledVector(perp, -DIM_TICK_M / 2), p1.clone().addScaledVector(perp, DIM_TICK_M / 2));
          addLine(p2.clone().addScaledVector(perp, -DIM_TICK_M / 2), p2.clone().addScaledVector(perp, DIM_TICK_M / 2));
          addAnchor(p1.clone().lerp(p2, 0.5), gapToCeiling * 1000);
        }
      }
      // CHÃO — só quando nenhum módulo (qualquer distância) fica embaixo
      // dele nessa faixa de largura, mesmo raciocínio de hasLeftNeighbor
      // acima (existência, não proximidade — evita duplicar a linha que o
      // vizinho de baixo já desenharia pela busca "em cima" dele).
      const hasBelowNeighbor = entries.some((o) => {
        if (o === e) return false;
        const eAlong = e.center.dot(alongDir), oAlong = o.center.dot(alongDir);
        const overlap = Math.min(eAlong + e.halfW, oAlong + o.halfW) - Math.max(eAlong - e.halfW, oAlong - o.halfW);
        if (overlap <= 0) return false;
        return e.yBottom - o.yTop >= -DIM_MIN_GAP_M;
      });
      if (!hasBelowNeighbor && e.yBottom > DIM_MIN_GAP_M) {
        const eAlongF = e.center.dot(alongDir);
        const p1 = wallPoint(eAlongF, 0);
        const p2 = wallPoint(eAlongF, e.yBottom);
        addLine(p1, p2);
        const perp = new THREE.Vector3(-az, 0, ax);
        addLine(p1.clone().addScaledVector(perp, -DIM_TICK_M / 2), p1.clone().addScaledVector(perp, DIM_TICK_M / 2));
        addLine(p2.clone().addScaledVector(perp, -DIM_TICK_M / 2), p2.clone().addScaledVector(perp, DIM_TICK_M / 2));
        addAnchor(p1.clone().lerp(p2, 0.5), e.yBottom * 1000);
      }
    });

    if (dimGroup.children.length) {
      scene.add(dimGroup);
      currentGroups.push(dimGroup);
    }
  }

  function applyBaseboardJoins(list) {
    if (!Array.isArray(list) || list.length < 2) return;

    const entries = [];
    list.forEach((a) => {
      if (!a || !a.group) return;
      a.group.updateMatrixWorld(true);
      let mesh = null;
      a.group.traverse((o) => { if (!mesh && o.userData && o.userData.baseboardGeom) mesh = o; });
      if (!mesh || mesh.visible === false) return;
      const g = mesh.userData.baseboardGeom;
      const worldPos = new THREE.Vector3(); mesh.getWorldPosition(worldPos);
      const worldQuat = new THREE.Quaternion(); mesh.getWorldQuaternion(worldQuat);
      const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(worldQuat).normalize();
      const half = g.faceA_m / 2;
      entries.push({
        mesh, worldPos, worldQuat, axisX,
        leftEdge: worldPos.clone().addScaledVector(axisX, -half),
        rightEdge: worldPos.clone().addScaledVector(axisX, half),
        faceA_m: g.faceA_m, faceB_m: g.faceB_m, thickness_m: g.thickness_m,
        auto_join_adjacent: g.auto_join_adjacent !== false,
        join_max_length_mm: g.join_max_length_mm || 2700
      });
    });
    if (entries.length < 2) return;

    // Ordena pela posição real ao longo do eixo local da 1ª peça — todas as
    // peças de uma mesma fileira/parede compartilham a mesma direção (mesmo
    // rotY), então projetar no eixo de qualquer uma dá a mesma ordem.
    const refAxis = entries[0].axisX;
    entries.forEach((e) => { e._t = e.worldPos.dot(refAxis); });
    entries.sort((p, q) => p._t - q._t);

    if (!autoJoinBaseboards) return; // botão "Encaixe" desligado pra sessão inteira

    // GRUPO (não só par-a-par) — 3+ módulos em fileira encostados também
    // viram 1 peça só, desde que o comprimento total não passe do limite. Um
    // par que já bateu no limite fecha o grupo ali; o próximo módulo começa
    // um grupo novo (não fica de fora pra sempre).
    const canChain = (cur, next) => {
      if (!next.auto_join_adjacent) return false;
      if (Math.abs(cur.faceB_m - next.faceB_m) > 0.001) return false; // altura diferente — não é a mesma peça
      if (Math.abs(cur.thickness_m - next.thickness_m) > 0.001) return false; // espessura diferente — não é a mesma peça
      if (cur.worldQuat.angleTo(next.worldQuat) > 0.01) return false; // módulos girados de jeitos diferentes — não fica reto
      if (cur.rightEdge.distanceTo(next.leftEdge) > BASEBOARD_JOIN_GAP_EPS_M) return false; // não está encostado (tolerância zero)
      return true;
    };

    let i = 0;
    while (i < entries.length) {
      if (!entries[i].auto_join_adjacent) { i++; continue; }
      let end = i;
      let maxLen_mm = entries[i].join_max_length_mm;
      while (end + 1 < entries.length && canChain(entries[end], entries[end + 1])) {
        const nextMaxLen_mm = Math.min(maxLen_mm, entries[end + 1].join_max_length_mm);
        const combined_mm = entries[i].leftEdge.distanceTo(entries[end + 1].rightEdge) * 1000;
        if (combined_mm > nextMaxLen_mm + 0.5) break; // passou do comprimento máximo — fecha o grupo aqui
        end++;
        maxLen_mm = nextMaxLen_mm;
      }

      if (end > i) {
        const L = entries[i], R = entries[end];
        const combinedLength_m = L.leftEdge.distanceTo(R.rightEdge);
        const material = pickBaseboardMaterial(L.mesh) || pickBaseboardMaterial(R.mesh);
        const geometry = new THREE.BoxGeometry(combinedLength_m, L.faceB_m, L.thickness_m);
        const merged = material ? new THREE.Mesh(geometry, material) : new THREE.Mesh(geometry);
        merged.position.copy(L.leftEdge.clone().add(R.rightEdge).multiplyScalar(0.5));
        merged.quaternion.copy(L.worldQuat);
        merged.castShadow = !!L.mesh.castShadow;
        merged.receiveShadow = !!L.mesh.receiveShadow;
        merged.userData.isMergedBaseboard = true;
        // ARESTA/CONTORNO (2026-08-23, Matt: "a textura dos materiais esta
        // certa. oq ue esta errado e as arestas... o contorno") — peça
        // montada aqui direto (fora do addPartToGroup do viewer3d.js) não
        // passava pelo buildEdgesForStyle, então saía chapada sem o contorno
        // que toda outra peça da cena tem (mesmo problema — e mesma correção
        // — que a parede já teve em makeWallSurface/buildRoomEnvironment
        // acima, ver comentário lá: "ARESTA NA PAREDE, no mesmo estilo dos
        // móveis").
        if (typeof Viewer3D !== 'undefined' && Viewer3D.buildEdgesForStyle) {
          const arestas = Viewer3D.buildEdgesForStyle(geometry);
          if (arestas) merged.add(arestas);
        }
        scene.add(merged);
        currentGroups.push(merged);

        // Esconde as peças originais do grupo inteiro — continuam existindo
        // (preço/corte/furação, se algum dia tiver, seguem a peça original),
        // só não aparecem mais desenhadas por cima da peça fundida.
        for (let k = i; k <= end; k++) entries[k].mesh.visible = false;
      }

      i = end + 1;
    }
  }

  function toggleAutoJoinBaseboards() {
    autoJoinBaseboards = !autoJoinBaseboards;
    return autoJoinBaseboards;
  }
  function areBaseboardsAutoJoined() { return autoJoinBaseboards; }

  // Sprite de texto simples (canvas 2D virando textura) — sem precisar
  // carregar fonte 3D nenhuma. Sempre de frente pra câmera (comportamento
  // padrão de THREE.Sprite), então serve bem pra rótulo de medida.
  function makeTextSprite(text) {
    const fontSize = 56;
    const paddingX = 22, paddingY = 14;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
    const textWidth = ctx.measureText(text).width;
    canvas.width = Math.ceil(textWidth) + paddingX * 2;
    canvas.height = fontSize + paddingY * 2;
    // Precisa redefinir o font depois de mudar width/height (resetar o canvas
    // zera o contexto).
    ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#c9c2b4';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
    ctx.fillStyle = '#2b2620';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    // Tamanho no MUNDO (metros) — a altura do sprite é fixa (worldH), a
    // largura segue a proporção do canvas pra não distorcer o texto.
    const worldH = 0.14;
    sprite.scale.set(worldH * (canvas.width / canvas.height), worldH, 1);
    return sprite;
  }

  // Uma linha reta simples entre dois pontos (Vector3), com a cor/espessura
  // padrão de linha de cota (CAD-style, discreta, cinza escura).
  function makeLine(p1, p2) {
    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);
    const material = new THREE.LineBasicMaterial({ color: 0x8a8378 });
    return new THREE.Line(geometry, material);
  }

  // ---------- Superfícies sólidas do ambiente (piso + paredes) ----------
  // Pedido do usuário (2026-08-08: "AMBOS - colocar chao"), escolhido entre as
  // opções como "piso sólido + paredes sólidas": até aqui o ambiente era só um
  // desenho de LINHAS (chão/teto/rodapé/altura máxima) sobre fundo branco — dá
  // pra medir, mas não dá sensação nenhuma de estar num cômodo, e um módulo
  // "solto no chão" (ilha, ver placement='floor' em portal.js) não teria
  // nenhuma referência visual de onde o chão está.
  //
  // As linhas CONTINUAM todas desenhadas por cima (mesmas cotas de sempre) —
  // as superfícies são aditivas, entram ATRÁS delas. Regras que fazem a coisa
  // funcionar sem atrapalhar a edição:
  //   - PAREDE usa FrontSide com a normal apontando PRA DENTRO do ambiente:
  //     vista de fora (câmera atrás da parede), a face de trás é descartada
  //     pelo backface culling e a parede simplesmente some — dá pra continuar
  //     olhando o projeto de qualquer ângulo sem uma parede tapando a cena.
  //   - PISO usa DoubleSide (aparece de cima E de baixo) — é o plano de
  //     referência principal, some nunca.
  //   - polygonOffset empurra a superfície pra trás no z-buffer, senão ela
  //     brigaria (z-fighting) com o fundo dos módulos encostados nela e com as
  //     próprias linhas de cota, que ficam no mesmo plano.
  //   - userData.isRoomSurface marca essas malhas pra que o raycasting de
  //     clique/arraste (pickAssemblyAt / pickRoomSurfaceAt) saiba distinguir
  //     "cliquei no ambiente" de "cliquei num módulo".
  const FLOOR_COLOR = 0xe3ddd2;
  const WALL_COLOR = 0xf2efe8;
  function makeRoomSurface(width, height, color, doubleSide, kind) {
    const geom = new THREE.PlaneGeometry(Math.max(width, 0.01), Math.max(height, 0.01));
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: 0.95, metalness: 0.0,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.isRoomSurface = true;
    mesh.userData.roomSurfaceKind = kind || 'wall';
    return mesh;
  }

  // Piso retangular deitado no plano Y=0 (chão), cobrindo x∈[x0,x1] e
  // z∈[z0,z1]. PlaneGeometry nasce em pé (normal +Z); girar -90° em X deita
  // ela com a normal pra CIMA (+Y).
  function makeFloorSurface(x0, x1, z0, z1) {
    const mesh = makeRoomSurface(Math.abs(x1 - x0), Math.abs(z1 - z0), FLOOR_COLOR, true, 'floor');
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    return mesh;
  }

  // GRADE do piso (pedido do usuário 2026-08-08: "deixa o piso visivel, tipo um
  // grid"). O piso sólido sozinho é uma mancha lisa de uma cor só — não dá
  // noção de escala nem de distância, e num render em perspectiva chega a
  // parecer fundo vazio. Uma grade a cada FLOOR_GRID_STEP_M dá referência
  // métrica e faz o chão "existir".
  //
  // Desenhada com UM único THREE.LineSegments (um par de vértices por
  // segmento) em vez de N objetos Line — um por linha viraria dezenas de draw
  // calls por render numa cena que já reconstrói tudo a cada arraste.
  // THREE.GridHelper não serve aqui: ele é sempre QUADRADO e centrado na
  // origem, e o piso deste app é um retângulo qualquer (largura da parede x
  // profundidade do ambiente).
  //
  // Levantada 1mm do chão pra não brigar com o próprio piso no z-buffer, e
  // marcada como superfície de ambiente NÃO (userData.isRoomSurface fica de
  // fora de propósito): quem clica no chão deve acertar o PISO, não a grade —
  // a grade é decoração, e um raio que passasse "entre" duas linhas devolveria
  // resultado diferente de um que passasse em cima de uma, o que deixaria o
  // pickRoomSurfaceAt errático.
  const FLOOR_GRID_STEP_M = 0.5;   // 50cm — legível sem virar hachura
  const FLOOR_GRID_COLOR = 0xc9c2b4;
  const FLOOR_GRID_LIFT_M = 0.001;
  function makeFloorGrid(x0, x1, z0, z1) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    const pts = [];
    // Linhas paralelas a Z (varrendo X) e vice-versa. Começa num múltiplo
    // exato do passo pra a grade ficar ancorada no mundo (não no canto do
    // retângulo) — assim ela não "escorrega" quando a largura da parede muda.
    const first = (v) => Math.ceil(v / FLOOR_GRID_STEP_M) * FLOOR_GRID_STEP_M;
    for (let x = first(minX); x <= maxX + 1e-6; x += FLOOR_GRID_STEP_M) {
      pts.push(new THREE.Vector3(x, FLOOR_GRID_LIFT_M, minZ), new THREE.Vector3(x, FLOOR_GRID_LIFT_M, maxZ));
    }
    for (let z = first(minZ); z <= maxZ + 1e-6; z += FLOOR_GRID_STEP_M) {
      pts.push(new THREE.Vector3(minX, FLOOR_GRID_LIFT_M, z), new THREE.Vector3(maxX, FLOOR_GRID_LIFT_M, z));
    }
    // Borda do piso sempre desenhada, mesmo que não caia num múltiplo do passo
    // — é ela que mostra onde o ambiente acaba.
    pts.push(new THREE.Vector3(minX, FLOOR_GRID_LIFT_M, minZ), new THREE.Vector3(maxX, FLOOR_GRID_LIFT_M, minZ));
    pts.push(new THREE.Vector3(minX, FLOOR_GRID_LIFT_M, maxZ), new THREE.Vector3(maxX, FLOOR_GRID_LIFT_M, maxZ));
    pts.push(new THREE.Vector3(minX, FLOOR_GRID_LIFT_M, minZ), new THREE.Vector3(minX, FLOOR_GRID_LIFT_M, maxZ));
    pts.push(new THREE.Vector3(maxX, FLOOR_GRID_LIFT_M, minZ), new THREE.Vector3(maxX, FLOOR_GRID_LIFT_M, maxZ));

    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: FLOOR_GRID_COLOR }));
  }

  // Parede em pé de p0 a p1 (pontos no chão), altura `ceilingH`, com a face
  // visível olhando pra `intoDir` (o vetor "pra dentro do ambiente" que
  // getProjectWallGeometry já define por parede em portal.js). Recuada
  // WALL_SURFACE_BACKOFF_M no sentido CONTRÁRIO ao intoDir pra ficar um fio
  // atrás das linhas de cota e do fundo dos módulos encostados nela.
  const WALL_SURFACE_BACKOFF_M = 0.004;
  // PAREDE SÓLIDA — 2026-08-13 (etapa 1 da reforma de paredes pedida pelo
  // Matt: "quero paredes sólidas, não só com uma linha... sempre 150mm de
  // espessura").
  //
  // Era um PlaneGeometry: uma folha sem volume, que de lado sumia e no canto
  // não encostava na vizinha. Agora é um bloco de WALL_THICKNESS_M crescendo
  // PRA TRÁS da face útil — a face que dá pro ambiente continua exatamente
  // onde estava, então nada do que já existe se desloca: módulo encostado na
  // parede, cota, colisão e o ímã continuam com a mesma referência.
  //
  // O comprimento é esticado em 1 espessura pra cada ponta (por isso o
  // +WALL_THICKNESS_M no comprimento): é o que faz duas paredes se
  // encontrarem no canto sem deixar fresta de 150mm.
  //
  // isRoomSurface continua marcado, então o duplo clique de focar a parede e
  // o "soltar módulo na parede" seguem funcionando igual.
  const WALL_THICKNESS_M = 0.15;
  // extras = { ini, fim } — esticar meia espessura naquela ponta, e SÓ quando
  // existe outra parede encostada ali (2026-08-13).
  //
  // Antes esticava sempre, nas duas pontas. Em ambiente fechado isso preenche
  // o canto e fica certo; em parede solta, ou em duas paredes que quase se
  // encontram, o excesso aparece como parede furando parede — foi o "no visual
  // elas atravessam umas às outras" que o Matt viu. Quem decide agora é a
  // planta: encostou, estica; não encostou, termina onde termina.
  function makeWallSurface(p0, p1, ceilingH, intoDir, extras) {
    const widthM = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const ix = (intoDir && intoDir.x) || 0;
    const iz = (intoDir && intoDir.z) || 0;
    const eIni = (extras && extras.ini) ? WALL_THICKNESS_M / 2 : 0;
    const eFim = (extras && extras.fim) ? WALL_THICKNESS_M / 2 : 0;
    const geom = new THREE.BoxGeometry(
      Math.max(widthM + eIni + eFim, 0.01),
      Math.max(ceilingH, 0.01),
      WALL_THICKNESS_M
    );
    // O excesso é assimétrico quando só uma ponta encosta: desloca o centro
    // metade da diferença ao longo da parede, senão a parede "anda".
    if (eIni !== eFim) {
      const dx = (p1.x - p0.x) / (widthM || 1), dz = (p1.z - p0.z) / (widthM || 1);
      geom.translate((eFim - eIni) / 2 * 0, 0, 0); // (o deslocamento real vai na posição, abaixo)
      geom.userData = { desloc: { x: dx * (eFim - eIni) / 2, z: dz * (eFim - eIni) / 2 } };
    }
    const mat = new THREE.MeshStandardMaterial({
      color: WALL_COLOR, roughness: 0.95, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.isRoomSurface = true;
    mesh.userData.roomSurfaceKind = 'wall';
    // A face +Z da caixa é a "de dentro": girar em Y até ela olhar pro
    // intoDir é a mesma conta que o plano usava.
    mesh.rotation.y = Math.atan2(ix, iz);
    // Centro recuado meia espessura (mais o fio de folga de sempre) no sentido
    // CONTRÁRIO ao intoDir: assim a face interna fica no lugar exato da folha
    // antiga.
    const recuo = WALL_THICKNESS_M / 2 + WALL_SURFACE_BACKOFF_M;
    const desl = (geom.userData && geom.userData.desloc) || { x: 0, z: 0 };
    mesh.position.set(
      (p0.x + p1.x) / 2 - ix * recuo + desl.x,
      ceilingH / 2,
      (p0.z + p1.z) / 2 - iz * recuo + desl.z
    );

    // ARESTA NA PAREDE, no mesmo estilo dos móveis (2026-08-13, Matt: "as
    // paredes não estão recebendo as arestas grossas também como os móveis").
    // A parede é montada aqui, fora do addPartToGroup, então não passava pelo
    // buildEdgesForStyle do viewer3d.js — ficava um bloco chapado enquanto o
    // móvel ao lado tinha contorno. Reaproveita a MESMA função, então os
    // quatro modos (fino/grosso/suave/nenhum) valem pros dois sem regra
    // duplicada: mudou o estilo, mudou nos dois juntos.
    if (typeof Viewer3D !== 'undefined' && Viewer3D.buildEdgesForStyle) {
      const arestas = Viewer3D.buildEdgesForStyle(geom);
      if (arestas) {
        arestas.userData.isRoomSurface = false;
        mesh.add(arestas);
      }
    }
    return mesh;
  }

  // PAREDE COM CANTO EM MEIA-ESQUADRIA (2026-08-18)
  // ========================================================================
  // O que incomodava o Matt: "essa juncao da parede... consegue deixar ela
  // unificada?", com o Promob de referencia ("as paredes sao bem limpas nas
  // juncoes").
  //
  // makeWallSurface (acima) resolve o canto ESTICANDO cada caixa meia
  // espessura pra dentro da vizinha. Fecha a fresta, mas as duas caixas se
  // SOBREPOEM: cada uma desenha o proprio contorno (buildEdgesForStyle), e o
  // pedaco de uma que entra na outra vira aquele quadradinho no vertice.
  // Aumentar/diminuir a sobra nao resolve — sobra pouco abre fresta, sobra
  // muita aumenta o quadrado.
  //
  // Aqui a parede deixa de ser uma caixa e vira um PRISMA com a planta
  // recortada: cada ponta encostada e cortada no angulo da bissetriz, do
  // jeito que se corta um rodape pra fazer canto. Quem manda no corte sao as
  // FACES, nao a espessura: o canto interno e o cruzamento das duas faces
  // internas, o externo e o cruzamento das duas externas (ver montarMitra em
  // buildRoomEnvironmentMultiWall). Vale pra qualquer angulo, nao so 90°.
  //
  // footprint = [A, B, C, D] em coordenada de MUNDO (metros, plano XZ):
  //   A = face interna na ponta 0     B = face interna na ponta 1
  //   C = face externa na ponta 1     D = face externa na ponta 0
  // A geometria ja sai em mundo, entao o mesh fica em (0,0,0) sem rotacao —
  // diferente de makeWallSurface, que posiciona/gira uma BoxGeometry local.
  function makeWallPrism(footprint, ceilingH, intoDir, alongDir) {
    const [A, B, C, D] = footprint;
    const h = Math.max(ceilingH, 0.01);
    const pos = [];
    // Emite um quad como 2 triangulos, com a ordem dos vertices ajustada pra
    // a normal apontar pro lado pedido. Fazer isso na conta (e nao "na
    // tentativa") e o que garante que a parede continue solida por fora e
    // vazada por dentro exatamente como a caixa era — o material usa
    // FrontSide, entao winding trocado = face invisivel.
    const quad = (v0, v1, v2, v3, n) => {
      const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
      const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const q = (nx * n[0] + ny * n[1] + nz * n[2]) >= 0 ? [v0, v1, v2, v3] : [v0, v3, v2, v1];
      pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
    };
    const b = (P) => [P.x, 0, P.z];
    const t = (P) => [P.x, h, P.z];
    const ix = (intoDir && intoDir.x) || 0, iz = (intoDir && intoDir.z) || 0;
    const ax = (alongDir && alongDir.x) || 0, az = (alongDir && alongDir.z) || 0;

    quad(b(A), b(B), t(B), t(A), [ix, 0, iz]);        // face de dentro do ambiente
    quad(b(D), b(C), t(C), t(D), [-ix, 0, -iz]);      // face de fora
    quad(b(A), b(D), t(D), t(A), [-ax, 0, -az]);      // topo da parede na ponta 0
    quad(b(B), b(C), t(C), t(B), [ax, 0, az]);        // ponta 1
    quad(t(A), t(B), t(C), t(D), [0, 1, 0]);          // topo
    quad(b(A), b(B), b(C), b(D), [0, -1, 0]);         // base

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: WALL_COLOR, roughness: 0.95, metalness: 0.0,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.userData.isRoomSurface = true;
    mesh.userData.roomSurfaceKind = 'wall';
    // Mesma aresta dos moveis (ver makeWallSurface) — agora ela desenha o
    // contorno da MITRA, que e justamente o traco limpo do canto.
    if (typeof Viewer3D !== 'undefined' && Viewer3D.buildEdgesForStyle) {
      const arestas = Viewer3D.buildEdgesForStyle(geom);
      if (arestas) {
        arestas.userData.isRoomSurface = false;
        mesh.add(arestas);
      }
    }
    return mesh;
  }

  // Cotas TOTAIS da composição inteira (pedido do usuário: "colocar essas
  // medidas no próprio desenho") — 3 linhas de cota estilo CAD, cada uma numa
  // face diferente do conjunto pra não se cruzarem: largura na FRENTE embaixo
  // (soma de todos os módulos), altura na ESQUERDA (maior módulo) e
  // profundidade na DIREITA (maior módulo). labels = { width, height, depth }
  // já vêm formatados por portal.js (respeitando a unidade escolhida pelo
  // cliente — mm/cm/m/pol/ft), esta função só desenha, não formata número
  // nenhum.
  function buildDimensionAnnotations(totalWidth, maxHeight, maxDepth, labels) {
    const group = new THREE.Group();
    const tick = Math.max(Math.min(Math.max(totalWidth, maxHeight, maxDepth) * 0.02, 0.06), 0.02);
    const margin = Math.max(Math.min(Math.max(totalWidth, maxHeight, maxDepth) * 0.08, 0.35), 0.12);

    if (labels && labels.width) {
      const z = maxDepth + margin;
      const y = 0;
      group.add(makeLine(new THREE.Vector3(-totalWidth / 2, y, z), new THREE.Vector3(totalWidth / 2, y, z)));
      group.add(makeLine(new THREE.Vector3(-totalWidth / 2, y, z - tick), new THREE.Vector3(-totalWidth / 2, y, z + tick)));
      group.add(makeLine(new THREE.Vector3(totalWidth / 2, y, z - tick), new THREE.Vector3(totalWidth / 2, y, z + tick)));
      const label = makeTextSprite(labels.width);
      label.position.set(0, 0.12, z);
      group.add(label);
    }

    if (labels && labels.height) {
      const x = -totalWidth / 2 - margin;
      const z = 0;
      group.add(makeLine(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, maxHeight, z)));
      group.add(makeLine(new THREE.Vector3(x - tick, 0, z), new THREE.Vector3(x + tick, 0, z)));
      group.add(makeLine(new THREE.Vector3(x - tick, maxHeight, z), new THREE.Vector3(x + tick, maxHeight, z)));
      const label = makeTextSprite(labels.height);
      label.position.set(x - 0.1, maxHeight / 2, z);
      group.add(label);
    }

    if (labels && labels.depth) {
      const x = totalWidth / 2 + margin;
      const y = 0;
      group.add(makeLine(new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y, maxDepth)));
      group.add(makeLine(new THREE.Vector3(x - tick, y, 0), new THREE.Vector3(x + tick, y, 0)));
      group.add(makeLine(new THREE.Vector3(x - tick, y, maxDepth), new THREE.Vector3(x + tick, y, maxDepth)));
      const label = makeTextSprite(labels.depth);
      label.position.set(x + 0.1, 0.06, maxDepth / 2);
      group.add(label);
    }

    // Tag pro teste de AR (2026-08-01, ver generateArGlbForProject em
    // portal.js): cotas CAD (linhas/rótulos) não fazem sentido plantadas no
    // ambiente real do cliente — export busca por este nome pra esconder
    // antes de exportar o .glb (GLTFExporter.parse com onlyVisible:true,
    // default, pula tudo invisible), sem remover nada da cena ao vivo.
    group.name = 'ar-export-exclude';
    return group;
  }

  // Ambiente da casa em volta da composição (pedido do usuário): parede de
  // fundo com a LINHA DO TETO na altura do pé direito informado pelo
  // cliente, BASEBOARD (rodapé da casa) correndo ao longo da parede, piso, e
  // uma linha tracejada de altura máxima permitida (pé direito − 5" — os
  // móveis nunca chegam nela porque a régua de altura já trava antes, ver
  // ceilingMaxHeightMm em portal.js; a linha só EXPLICA o limite pro
  // cliente). A parede/baseboard/piso avançam pros LADOS bem além dos
  // móveis (margem proporcional) — também pedido do usuário: dá pra ver o
  // baseboard seguindo livre, mostrando que não tem nada encostado neles.
  // room = { ceiling_m, baseboard_h_m, ceilingLabel, maxHeightLabel, minimal }
  // — tudo opcional; sem room, a cena fica exatamente como era (só os
  // móveis). room.minimal (pedido do usuário, 2026-07-19: "coloca so linha
  // de piso e teto", pras imagens-base mandadas pra IA — ver
  // renderCompositionForAiSnapshot em portal.js): pula a linha tracejada de
  // altura máxima, o baseboard tracejado, e os dois rótulos de texto — só as
  // 2 linhas sólidas (chão + teto) ficam.
  const BASEBOARD_DEPTH_M = 0.019; // ~3/4" — espessura típica de baseboard
  // Junção automática de rodapé (migration 137) — "folga zero" pra fundir 2
  // peças de módulos vizinhos numa peça só. Mesma tolerância que "esticar até
  // encostar" já usa (PROJECT_TOUCH_GAP_EPS_MM, portal-06c-projetos-canvas-
  // 3d-acoes.js) — não é exatamente 0 porque ponto flutuante de posição em
  // metros nunca bate exato, mas 0.5mm não é uma folga real de fabricação.
  const BASEBOARD_JOIN_GAP_EPS_M = 0.0005;
  const CEILING_CLEARANCE_M = 0.127; // 5" — afastamento mínimo móvel→teto
  // Pedido do usuário, 2026-07-16 ("subir a linha trasejada em 5inches"):
  // depois de alinhar a linha tracejada com a régua de altura MÁXIMA
  // (ceilingMaxHeightMm() em portal.js, que desconta o rodapé), o usuário
  // pediu explicitamente pra subir a linha 5" — decisão dele, mantendo o
  // desconto de rodapé na régua de altura (não mexe em ceilingMaxHeightMm()
  // nem no valor máximo que o cliente consegue configurar, só onde a linha
  // de referência é DESENHADA). Mesma constante/comentário do viewer3d.js.
  const MAX_HEIGHT_LINE_RAISE_M = 0.127; // 5"
  // Profundidade mínima do piso sólido quando o ambiente não define uma
  // (parede única / móveis rasos) — ver makeFloorSurface e o uso em
  // buildRoomEnvironment/buildRoomEnvironmentMultiWall.
  const ROOM_MIN_FLOOR_DEPTH_M = 1.8;

  // Retângulo REAL do piso desenhado (metros, mundo) — guardado na construção
  // do ambiente e exposto por getFloorRectM(). Existe porque portal.js precisa
  // travar o módulo ILHA dentro do piso e, até 2026-08-13, ele ESTIMAVA essa
  // área por conta própria: o móvel parava antes da borda visível ("nao vem
  // ate a ponta do piso. que ta livre"). Uma conta só, no lugar onde o piso é
  // de fato desenhado.
  let lastFloorRectM = null;

  // exactWidth (pedido do usuário, 2026-07-26: "gostaria de ver o final das
  // paredes, conforme medidas delas", depois "nao estou vendo as ultimas
  // alteracoes de piso e final da parede no 3D" — a versão original desse
  // pedido só tinha sido aplicada em viewer3d.js/rebuildRoomEnv, o
  // configurador de UM módulo só, não neste arquivo, que é quem desenha o
  // "Visualizar 3D" da aba Projetos) — true quando `totalWidth` é a largura
  // REAL da parede (renderFreeform, aba Projetos, forma 'single'), não uma
  // soma arbitrária de módulos (render/Composição, que não tem conceito de
  // parede — continua com a margem antiga, sem end-caps). Com exactWidth: a
  // linha termina exatamente no canto de verdade (sem a margem de 35%) e
  // ganha um traço vertical (chão até teto) em cada ponta marcando "aqui a
  // parede acaba" — mesmo tratamento de viewer3d.js/rebuildRoomEnv.
  function buildRoomEnvironment(totalWidth, maxDepth, room, exactWidth) {
    const group = new THREE.Group();
    const margin = exactWidth ? 0 : Math.max(totalWidth * 0.35, 0.9); // sobra de parede/baseboard pra cada lado
    const wallW = totalWidth + margin * 2;
    const ceilingH = room.ceiling_m;
    const baseH = room.baseboard_h_m || 0;

    // Superfícies SÓLIDAS (piso + parede) — pedido do usuário 2026-08-08
    // ("AMBOS - colocar chao", opção "piso sólido + paredes sólidas"). Isso
    // REVERTE em parte a escolha antiga de "só linhas limpas sobre o fundo
    // branco" (ver comentário logo abaixo, mantido porque as LINHAS continuam
    // todas exatamente como eram, desenhadas por cima das superfícies). O piso
    // avança pra dentro do ambiente até um pouco além do móvel mais fundo, com
    // um mínimo (ROOM_MIN_FLOOR_DEPTH_M) pra nunca ficar uma tira estreita
    // quando os móveis são rasos. Modo minimal (imagem-base pra IA, ver
    // room.minimal) continua SEM superfície nenhuma — a IA recebe o desenho
    // limpo de sempre.
    if (!room.minimal) {
      const floorDepth = Math.max((maxDepth || 0) + 0.6, ROOM_MIN_FLOOR_DEPTH_M);
      lastFloorRectM = { x0: -wallW / 2, x1: wallW / 2, z0: 0, z1: floorDepth };
      group.add(makeFloorSurface(-wallW / 2, wallW / 2, 0, floorDepth));
      group.add(makeFloorGrid(-wallW / 2, wallW / 2, 0, floorDepth));
      if (ceilingH > 0) {
        group.add(makeWallSurface(
          { x: -wallW / 2, z: 0 }, { x: wallW / 2, z: 0 },
          ceilingH, { x: 0, z: 1 }
        ));
      }
    }

    // Estilo escolhido pelo usuário ("deixa igual do cima"): SEM parede/piso
    // 3D — só linhas limpas sobre o fundo branco, como as do teto. Em cima:
    // linha sólida do teto + tracejada da altura máxima. Embaixo, espelhado:
    // linha sólida do CHÃO + tracejada do BASEBOARD, todas correndo a
    // largura inteira (bem além dos móveis, mostrando que não tem nada
    // encostado nos lados).
    // Linha do chão — sólida, na base da parede (y=0).
    group.add(makeLine(
      new THREE.Vector3(-wallW / 2, 0, 0.003),
      new THREE.Vector3(wallW / 2, 0, 0.003)
    ));

    // Linha do teto + rótulo com o pé direito informado (rótulo pulado em
    // modo minimal — ver comentário de room acima).
    group.add(makeLine(
      new THREE.Vector3(-wallW / 2, ceilingH, 0.003),
      new THREE.Vector3(wallW / 2, ceilingH, 0.003)
    ));
    // (rótulo do pé-direito removido em 2026-08-13 — ver o comentário grande
    // sobre rodapé/rodaforro na versão multi-parede desta função.)

    // (tracejadas de altura máxima e de rodapé removidas em 2026-08-13 —
    // ver o comentário grande na versão multi-parede desta função. A REGRA
    // de altura máxima continua valendo em ceilingMaxHeightMm/portal.js;
    // saiu só o desenho da linha.)

    // Traço vertical (chão até teto) em cada ponta — só quando a largura é
    // REAL (exactWidth), marcando o canto de verdade da parede (ver
    // comentário grande em cima da assinatura da função).
    if (exactWidth) {
      group.add(makeLine(new THREE.Vector3(-wallW / 2, 0, 0.003), new THREE.Vector3(-wallW / 2, ceilingH, 0.003)));
      group.add(makeLine(new THREE.Vector3(wallW / 2, 0, 0.003), new THREE.Vector3(wallW / 2, ceilingH, 0.003)));
    }

    // Tag pro teste de AR — ver comentário em buildDimensionAnnotations.
    group.name = 'ar-export-exclude';
    return group;
  }

  // Versão multi-parede de buildRoomEnvironment (pedido do usuário,
  // 2026-07-25: forma dupla/C-U na aba Projetos) — em vez de UMA parede
  // centrada em X=0, desenha uma linha de chão/teto/rodapé/altura-máxima por
  // SEGMENTO de parede, cada um na posição/direção de verdade (ver
  // getProjectWallGeometry em portal.js). segments = [{ originX, originZ,
  // alongDir:{x,z}, widthM, margin, label }].
  // CORRIGIDO (2026-07-26, usuário: "nao estou vendo as ultimas alteracoes de
  // piso e final da parede no 3D" — o pedido anterior de "ver o final das
  // paredes" só tinha sido aplicado em viewer3d.js/rebuildRoomEnv, não aqui,
  // que é quem desenha o "Visualizar 3D" da aba Projetos de verdade): margin
  // agora é sempre 0 (renderFreeformWalls não manda mais margem nenhuma pra
  // 'main' — CADA segmento aqui já é uma parede REAL, sem "ponta solta" que
  // precise de sobra) e cada segmento ganha um traço vertical (chão até
  // teto) nas DUAS pontas (p0/p1) marcando o canto de verdade — mesmo
  // tratamento de buildRoomEnvironment(exactWidth=true)/viewer3d.js. label=true
  // desenha o texto do pé-direito só uma vez (evita repetir o mesmo rótulo em
  // 2-3 paredes).
  function buildRoomEnvironmentMultiWall(segments, room) {
    const group = new THREE.Group();
    const ceilingH = room.ceiling_m;
    const baseH = room.baseboard_h_m || 0;

    // PISO SÓLIDO do ambiente (pedido do usuário 2026-08-08, "colocar chao").
    // Aqui não existe uma "profundidade do cômodo" cadastrada em lugar nenhum:
    // o ambiente é definido só pelos SEGMENTOS de parede (1 a 3, ver
    // getProjectWallGeometry em portal.js). O retângulo do piso é a caixa
    // delimitadora das PONTAS de todas as paredes, esticada pra dentro do
    // ambiente até um mínimo. Em L/C-U isso já dá o cômodo certo (as paredes
    // laterais correm ao longo de Z, então a caixa delimitadora sozinha já
    // tem a profundidade real); em parede única a caixa é degenerada (tudo em
    // z=0) e o mínimo é quem manda.
    if (!room.minimal && (segments || []).length) {
      let fx0 = Infinity, fx1 = -Infinity, fz0 = Infinity, fz1 = -Infinity;
      (segments || []).forEach((seg) => {
        const ax = seg.alongDir.x, az = seg.alongDir.z;
        [[seg.originX, seg.originZ], [seg.originX + ax * seg.widthM, seg.originZ + az * seg.widthM]]
          .forEach(([px, pz]) => {
            fx0 = Math.min(fx0, px); fx1 = Math.max(fx1, px);
            fz0 = Math.min(fz0, pz); fz1 = Math.max(fz1, pz);
          });
      });
      if (fz1 - fz0 < ROOM_MIN_FLOOR_DEPTH_M) fz1 = fz0 + ROOM_MIN_FLOOR_DEPTH_M;
      if (fx1 - fx0 < 0.3) fx1 = fx0 + 0.3;
      lastFloorRectM = { x0: fx0, x1: fx1, z0: fz0, z1: fz1 };
      group.add(makeFloorSurface(fx0, fx1, fz0, fz1));
      group.add(makeFloorGrid(fx0, fx1, fz0, fz1));
    }

    // Ponta 0 ou 1 de um segmento, em mundo — usada pelo teste de canto
    // (ver 'encosta' logo abaixo).
    const pontoDoSegmento = (sg, qual) => {
      const a = sg.alongDir.x, b = sg.alongDir.z;
      const m = sg.margin || 0;
      return qual === 0
        ? { x: sg.originX - a * m, z: sg.originZ - b * m }
        : { x: sg.originX + a * (sg.widthM + m), z: sg.originZ + b * (sg.widthM + m) };
    };
    (segments || []).forEach((seg, i) => {
      const ax = seg.alongDir.x, az = seg.alongDir.z;
      const margin = seg.margin || 0;
      const p0 = new THREE.Vector3(seg.originX - ax * margin, 0, seg.originZ - az * margin);
      const p1 = new THREE.Vector3(seg.originX + ax * (seg.widthM + margin), 0, seg.originZ + az * (seg.widthM + margin));

      // Superfície sólida desta parede (ver makeWallSurface) — a face visível
      // olha pra intoDir, então vista de FORA do ambiente a parede some
      // (backface culling) e não tapa o projeto. seg.intoDir vem de
      // renderFreeformWalls; sem ele (chamador antigo), pula a superfície e o
      // desenho fica só de linhas, exatamente como era antes.
      // Encosta em alguém nesta ponta? Devolve o ÍNDICE da vizinha (-1 = ponta
      // solta). Antes era um booleano ('encosta'), que bastava pra decidir
      // "estica ou não estica"; a meia-esquadria precisa saber QUAL parede,
      // pra cruzar as faces com as dela. 12cm de tolerância — abaixo da
      // própria espessura da parede, então só conta encontro de verdade.
      const TOL_CANTO = 0.12;
      const vizinhaEm = (px, pz) => {
        let achou = -1;
        (segments || []).forEach((o, j) => {
          if (j === i || achou >= 0) return;
          const a = pontoDoSegmento(o, 0), b = pontoDoSegmento(o, 1);
          if (Math.hypot(a.x - px, a.z - pz) < TOL_CANTO || Math.hypot(b.x - px, b.z - pz) < TOL_CANTO) achou = j;
        });
        return achou;
      };
      const temParede = !room.minimal && ceilingH > 0 && !!seg.intoDir;
      const juntaIni = temParede ? vizinhaEm(p0.x, p0.z) : -1;
      const juntaFim = temParede ? vizinhaEm(p1.x, p1.z) : -1;

      if (temParede) {
        // Reta de uma FACE (interna ou externa) do segmento, em mundo:
        // ponto + direção. A face interna fica sobre a linha do segmento,
        // recuada só o fio de folga; a externa, uma espessura atrás.
        const faceDoSegmento = (sg, externa) => {
          const jx = (sg.intoDir && sg.intoDir.x) || 0;
          const jz = (sg.intoDir && sg.intoDir.z) || 0;
          const rec = WALL_SURFACE_BACKOFF_M + (externa ? WALL_THICKNESS_M : 0);
          const q = pontoDoSegmento(sg, 0);
          return { P: { x: q.x - jx * rec, z: q.z - jz * rec }, D: { x: sg.alongDir.x, z: sg.alongDir.z } };
        };
        // Cruzamento de duas retas no plano XZ. null = paralelas (paredes
        // colineares: não há esquadria a fazer, a ponta fica reta).
        const cruzaRetas = (r1, r2) => {
          const den = r1.D.x * r2.D.z - r1.D.z * r2.D.x;
          if (Math.abs(den) < 1e-6) return null;
          const t = ((r2.P.x - r1.P.x) * r2.D.z - (r2.P.z - r1.P.z) * r2.D.x) / den;
          return { x: r1.P.x + r1.D.x * t, z: r1.P.z + r1.D.z * t };
        };
        // Ângulo quase raso (duas paredes quase em linha) manda a mitra pro
        // infinito e a parede sai com um espeto. Acima de 4 espessuras de
        // distância a ponta volta a ser reta — fresta de canto é bem menos
        // feio que bico de agulha.
        const LIMITE_MITRA_M = WALL_THICKNESS_M * 4;
        const valida = (pt, ref) => pt && Math.hypot(pt.x - ref.x, pt.z - ref.z) < LIMITE_MITRA_M ? pt : null;

        const ix = seg.intoDir.x || 0, iz = seg.intoDir.z || 0;
        const recua = (P, r) => ({ x: P.x - ix * r, z: P.z - iz * r });
        const IN = WALL_SURFACE_BACKOFF_M, OUT = WALL_SURFACE_BACKOFF_M + WALL_THICKNESS_M;
        let A = recua(p0, IN), D = recua(p0, OUT);
        let B = recua(p1, IN), C = recua(p1, OUT);

        [[juntaIni, p0, 'ini'], [juntaFim, p1, 'fim']].forEach(([idxViz, pRef, qual]) => {
          if (idxViz < 0) return;
          const viz = segments[idxViz];
          if (!viz || !viz.intoDir) return;
          const dentro = valida(cruzaRetas(faceDoSegmento(seg, false), faceDoSegmento(viz, false)), pRef);
          const fora = valida(cruzaRetas(faceDoSegmento(seg, true), faceDoSegmento(viz, true)), pRef);
          if (!dentro || !fora) return;
          if (qual === 'ini') { A = dentro; D = fora; } else { B = dentro; C = fora; }
        });

        const wallSurface = makeWallPrism([A, B, C, D], ceilingH, seg.intoDir, seg.alongDir);
        // De qual parede esta superfície é — lido por pickRoomSurfaceAt pra o
        // duplo toque "mostra essa parede de frente" (iPad) saber qual parede
        // ativar sem depender de nenhum módulo estar em cima dela.
        wallSurface.userData.wallIndex = seg.wallIndex;
        group.add(wallSurface);
      }

      group.add(makeLine(p0.clone(), p1.clone()));
      group.add(makeLine(p0.clone().setY(ceilingH), p1.clone().setY(ceilingH)));
      // Traço vertical de canto SÓ na ponta solta (2026-08-18). Na ponta
      // encostada ele fica enterrado dentro da mitra e cruza o contorno dela —
      // era parte do risco que aparecia no vértice.
      if (juntaIni < 0) group.add(makeLine(p0.clone(), p0.clone().setY(ceilingH)));
      if (juntaFim < 0) group.add(makeLine(p1.clone(), p1.clone().setY(ceilingH)));

      // ==================================================================
      // RÓTULO DE TETO E TRACEJADAS DE RODAPÉ/RODAFORRO — REMOVIDOS
      // ==================================================================
      // (2026-08-13, Matt: "essas linhas de limite que fizemos lá no começo
      // pode eliminar" — rodapé e rodaforro.)
      //
      // Elas nasceram quando o ambiente era só um desenho de linhas: sem
      // parede sólida, a tracejada era a ÚNICA pista de onde ia o rodapé e até
      // onde o móvel podia subir. Agora a parede tem volume, o piso tem
      // malha e o canto fecha — as tracejadas viraram ruído em cima do
      // desenho, ainda por cima em vermelho, competindo com o contorno de
      // seleção do módulo (que também é vermelho).
      //
      // O QUE NÃO MUDOU: a REGRA continua valendo. ceilingMaxHeightMm() em
      // portal.js segue descontando teto − 5" − rodapé pra limitar a altura do
      // módulo, e a regra do móvel suspenso sobre o rodapé (mais abaixo neste
      // arquivo) segue igual. Saiu o desenho da linha, não o limite.
    });

    // Tag pro teste de AR — ver comentário em buildDimensionAnnotations.
    group.name = 'ar-export-exclude';
    return group;
  }

  // assemblies = [{ group, width_m, height_m, depth_m }, ...] — um por slot
  // da composição, na mesma ordem esquerda->direita já usada em
  // compositionSlots (ver portal.js), cada um vindo pronto de
  // Viewer3D.buildStandaloneAssembly. Cada group nasce com X/Z centrados
  // localmente (mesma convenção do viewer singular: piso em Y=0, centro em
  // X=0/Z=0) — aqui só deslocamos cada um: no eixo X pra ficarem em fileira,
  // e no eixo Z pra todos ficarem com o FUNDO alinhado (mesma "parede"),
  // já que módulos de profundidades diferentes lado a lado normalmente
  // encostam na mesma parede, não ficam centralizados na mesma profundidade.
  // labels (opcional) = { width, height, depth } — texto JÁ formatado por
  // portal.js (respeitando mm/cm/m/pol/ft escolhido pelo cliente), pra
  // desenhar as cotas TOTAIS direto no desenho 3D (pedido do usuário: "eu
  // pensei em colocar essas medidas no próprio desenho"). Sem essa lista (ou
  // com uma medida faltando), simplesmente não desenha aquela cota — resto
  // da cena continua igual.
  function render(assemblies, labels, room) {
    if (!scene || !available()) return;
    onResize();
    clearGroups();
    // Reconstruída do zero a cada render — os assemblies antigos (e as
    // pivots/grupos que suas entradas de openables apontavam) já foram
    // descartados por clearGroups() acima. Cada assembly novo já nasce no
    // ângulo/estado certo (portal.js passa doors/drawers atuais pra
    // Viewer3D.buildStandaloneAssembly), só falta juntar as listas pra
    // animate() conseguir interpolar o PRÓXIMO toggle.
    currentOpenables = [];

    const list = (assemblies || []).filter((a) => a && a.group);
    if (!list.length) return;

    // Empilhamento vertical (pedido do usuário, 2026-07-16): cada assembly
    // pode trazer um `stack_on_id` (id do assembly de baixo, mesma coluna —
    // ver portal.js/generateComposition3D) e um `floor_height_m` (altura do
    // CHÃO DE VERDADE até a base dele, em metros — 0 = no chão). Assemblies
    // SEM stack_on_id são a BASE de uma coluna e avançam a fileira
    // esquerda->direita normalmente, exatamente como antes; um assembly COM
    // stack_on_id não abre coluna nova — reaproveita o centerX já calculado
    // pra base da coluna dele (mesmo X), só varia no eixo Y. Sem nenhum
    // stack_on_id (composições antigas, todo mundo é base), baseList ===
    // list e este bloco se comporta byte a byte como antes.
    const baseList = list.filter((a) => !a.stack_on_id);
    const stackedByBaseId = new Map();
    list.forEach((a) => { if (a.stack_on_id) stackedByBaseId.set(a.stack_on_id, a); });

    const totalWidth = baseList.reduce((sum, a) => sum + a.width_m, 0) + GAP_M * Math.max(baseList.length - 1, 0);
    let cursorX = -totalWidth / 2;
    let maxHeight = 0;
    let maxDepth = 0;

    // Posiciona UM assembly (base ou empilhado) em centerX já resolvido —
    // extraído do corpo antigo do forEach pra poder ser chamado duas vezes
    // por coluna (base + o que estiver empilhado em cima dela), sem duplicar
    // a lógica de chão/parede/baseboard.
    const placeOne = (a, centerX) => {
      a.group.position.x = centerX;
      // floor_height_m desloca o group a partir do chão de verdade (0 =
      // sempre foi o comportamento — position.y nunca era setado antes,
      // ficava no default 0 do THREE.Group).
      a.group.position.y = a.floor_height_m || 0;
      // Fundo (local z = -depth/2) de QUALQUER módulo cai em z=0 do mundo,
      // não importa a profundidade dele — módulos rasos/fundos ficam com a
      // mesma parede de trás, como no uso real.
      //
      // NADA AFASTA O MÓVEL DA PAREDE (2026-08-15, Matt: "nao pode afastar de
      // lugar nenhum. se tiver alguma regra de rodape, jogar pra frente, pode
      // eliminar tudo isso"). Existia aqui uma regra que recuava o móvel de
      // CHÃO pela espessura do rodapé (BASEBOARD_DEPTH_M) pra ele "tapar" o
      // rodapé como na vida real. Na prática, num projeto de marcenaria o
      // móvel é instalado rente à parede (o rodapé é recortado, não
      // contornado), e o recuo só aparecia como um vão errado entre o móvel e
      // a parede. Removida nos três renderers + photoreal.js.
      a.group.position.z = a.depth_m / 2;
      scene.add(a.group);
      currentGroups.push(a.group);
      if (Array.isArray(a.openables) && a.openables.length) {
        a.openables.forEach((op) => { op.slotId = a.id; });
        currentOpenables.push(...a.openables);
      }
      // Altura "total" de um bloco pro enquadramento/cotas é o TOPO dele
      // (chão + altura própria), não só a altura própria — um módulo
      // empilhado alto no ar não pode ficar cortado fora do quadro.
      maxHeight = Math.max(maxHeight, (a.floor_height_m || 0) + a.height_m);
      maxDepth = Math.max(maxDepth, a.depth_m);
    };

    baseList.forEach((a) => {
      const centerX = cursorX + a.width_m / 2;
      placeOne(a, centerX);
      const stacked = stackedByBaseId.get(a.id);
      if (stacked) placeOne(stacked, centerX);
      cursorX += a.width_m + GAP_M;
    });

    // Junção automática de rodapé (migration 137) — GAP_M é sempre 0 aqui,
    // então qualquer par de colunas consecutivas já nasce encostado; a
    // função decide sozinha, por par, se funde de verdade (cadastro +
    // comprimento máximo + botão "Encaixe").
    applyBaseboardJoins(baseList);

    if (room && room.ceiling_m > 0) {
      const envGroup = buildRoomEnvironment(totalWidth, maxDepth, room);
      scene.add(envGroup);
      currentGroups.push(envGroup);
    }

    if (labels) {
      const dimGroup = buildDimensionAnnotations(totalWidth, maxHeight, maxDepth, labels);
      scene.add(dimGroup);
      currentGroups.push(dimGroup);
    }

    // Enquadramento: com ambiente, a altura de referência passa a ser o pé
    // direito — a linha do teto (e o rótulo acima dela) precisa caber no
    // quadro inicial, não só os móveis.
    const frameH = room && room.ceiling_m > 0 ? Math.max(maxHeight, room.ceiling_m + 0.25) : maxHeight;
    const target = new THREE.Vector3(0, frameH / 2, maxDepth / 2);

    // Enquadramento PRECISO (pedido do usuário, 2026-07-16: "o zoom ainda
    // tira o que fica nas bordas pra fora... mais preciso nos módulos
    // inseridos") — mesmo raciocínio/fórmula do enquadramento do
    // configurador de um módulo só (ver comentário equivalente em
    // viewer3d.js/update, bloco "refit"): raio da ESFERA que contém a caixa
    // totalWidth×frameH×maxDepth inteira (metade da diagonal espacial), e a
    // distância exata que encosta essa esfera nas bordas do FOV da câmera —
    // considerando TANTO o FOV vertical quanto o horizontal (camera.aspect,
    // já atualizado por onResize() no início desta função). A fórmula
    // antiga (dist = maxDim*2.4, câmera num ponto fixo) não garantia
    // matematicamente que a composição inteira coubesse no quadro pra
    // qualquer proporção/tamanho — sobrava corte nas bordas em composições
    // bem largas/rasas ou telas estreitas.
    const R = 0.5 * Math.sqrt(totalWidth * totalWidth + frameH * frameH + maxDepth * maxDepth);
    const margin = 1.15;
    const dir = new THREE.Vector3(0.8, 0.55, 0.95).normalize();
    const fovYRad = (camera.fov || 35) * Math.PI / 180;
    const aspect = camera.aspect || 1;
    const fovXRad = 2 * Math.atan(Math.tan(fovYRad / 2) * aspect);
    const dist = Math.max(R / Math.sin(fovYRad / 2), R / Math.sin(fovXRad / 2)) * margin;
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target.x, target.y, target.z);
    if (controls) { controls.target.copy(target); controls.update(); }

    lastFitTarget = target.clone();
    lastFitTotalWidth = totalWidth;
    lastFitFrameH = frameH;
    lastFitMaxDepth = maxDepth;
  }

  // Espaço entre "camadas" de profundidade (pedido do usuário, 2026-07-21:
  // vista 3D da tela de Projetos) — cada z_order a mais (ver
  // renderProjectSlotDepth/resolveProjectSlotDepth em portal.js) empurra o
  // módulo esse tanto mais pra FRENTE da parede, só pra dar uma noção visual
  // de profundidade quando dois módulos se sobrepõem no canvas 2D; não é
  // uma medida real cadastrada em lugar nenhum, só um valor razoável de
  // separação.
  const FREEFORM_DEPTH_STEP_M = 0.06;

  // Posicionamento de POSIÇÃO LIVRE (pedido do usuário, 2026-07-21: "próxima
  // etapa, visualizar 3d" na aba Projetos) — mesma ideia de render() acima
  // (cada assembly já vem pronto de Viewer3D.buildStandaloneAssembly, só
  // posiciona), mas SEM a fileira esquerda->direita automática: usa a
  // posição x_m REAL de cada módulo no canvas 2D (ver x_mm em projectSlots/
  // portal.js) — wallWidthM é a largura do AMBIENTE inteiro (não a soma dos
  // módulos), então o enquadramento mostra a parede toda, com os vãos vazios
  // aparecendo de verdade. z_order (profundidade/camada, ver
  // resolveProjectSlotDepth em portal.js) empurra o módulo pra frente em
  // degraus de FREEFORM_DEPTH_STEP_M — mesma regra do baseboard (móvel no
  // chão recua a espessura do rodapé) que render() já usa, replicada aqui.
  function renderFreeform(assemblies, wallWidthM, room) {
    if (!scene || !available()) return;
    onResize();
    clearGroups();
    currentOpenables = [];

    const list = (assemblies || []).filter((a) => a && a.group);
    const totalWidth = Math.max(Number(wallWidthM) || 0, 0.3);
    let maxHeight = 0;
    let maxDepth = 0;

    list.forEach((a) => {
      a.group.position.x = -totalWidth / 2 + Number(a.x_m || 0) + a.width_m / 2;
      a.group.position.y = a.floor_height_m || 0;
      // Sem recuo de rodapé — ver comentário em placeOne() acima (2026-08-15:
      // nada afasta o móvel da parede).
      const layerZ = Number(a.z_order || 0) * FREEFORM_DEPTH_STEP_M;
      a.group.position.z = a.depth_m / 2 + layerZ;
      scene.add(a.group);
      currentGroups.push(a.group);
      if (Array.isArray(a.openables) && a.openables.length) {
        a.openables.forEach((op) => { op.slotId = a.id; });
        currentOpenables.push(...a.openables);
      }
      maxHeight = Math.max(maxHeight, (a.floor_height_m || 0) + a.height_m);
      maxDepth = Math.max(maxDepth, a.depth_m + layerZ);
    });

    if (room && room.ceiling_m > 0) {
      // exactWidth=true: totalWidth AQUI é wallWidthM, a largura REAL da
      // parede (não uma soma de módulos, ver comentário de renderFreeform
      // acima) — termina no canto de verdade + end-caps verticais, mesmo
      // pedido de "ver o final da parede" (2026-07-26).
      const envGroup = buildRoomEnvironment(totalWidth, maxDepth, room, true);
      scene.add(envGroup);
      currentGroups.push(envGroup);
    }

    const frameH = room && room.ceiling_m > 0 ? Math.max(maxHeight, room.ceiling_m + 0.25) : Math.max(maxHeight, 0.3);
    const effDepth = Math.max(maxDepth, 0.3);
    const target = new THREE.Vector3(0, frameH / 2, effDepth / 2);

    const R = 0.5 * Math.sqrt(totalWidth * totalWidth + frameH * frameH + effDepth * effDepth);
    const margin = 1.15;
    const dir = new THREE.Vector3(0.8, 0.55, 0.95).normalize();
    const fovYRad = (camera.fov || 35) * Math.PI / 180;
    const aspect = camera.aspect || 1;
    const fovXRad = 2 * Math.atan(Math.tan(fovYRad / 2) * aspect);
    const dist = Math.max(R / Math.sin(fovYRad / 2), R / Math.sin(fovXRad / 2)) * margin;
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target.x, target.y, target.z);
    if (controls) { controls.target.copy(target); controls.update(); }

    lastFitTarget = target.clone();
    lastFitTotalWidth = totalWidth;
    lastFitFrameH = frameH;
    lastFitMaxDepth = effDepth;
  }

  // Posicionamento MULTI-PAREDE (pedido do usuário, 2026-07-25: "parede
  // simples, parede dupla, e parede em C ou U" na aba Projetos) — mesma
  // ideia de renderFreeform (cada assembly já vem pronto de
  // Viewer3D.buildStandaloneAssembly, só posiciona pela x_m/z_order real),
  // mas agora cada PAREDE pode estar numa posição/direção diferente no
  // mundo 3D (canto reto/90°, ver getProjectWallGeometry em portal.js) em
  // vez de todo mundo estar sempre na mesma parede de fundo.
  //
  // wallsData = [{ assemblies, widthM, originX, originZ, alongDirX,
  // alongDirZ, intoDirX, intoDirZ, rotationY, role }, ...] — origin é o
  // canto onde a posição-ao-longo-da-parede (x_m de cada módulo) começa
  // (localX=0); alongDir é o vetor unitário (mundo) da direção em que
  // localX cresce; intoDir é o vetor unitário (mundo) "pra dentro do
  // ambiente" (onde a profundidade dos módulos avança); rotationY é o
  // ângulo (radianos) que faz a FRENTE de cada módulo (que nasce olhando
  // pra local +Z) apontar pra intoDir — para a parede de fundo ('main',
  // intoDir=+Z) é 0; para 'left' (intoDir=+X) é +90°; para 'right'
  // (intoDir=-X) é -90°. A posição de cada módulo é calculada por VETOR
  // (origin + alongDir*alongOffset + intoDir*depthOffset) — não depende da
  // rotação do próprio group pra nada, então não tem risco de "espelhar" a
  // ordem dos módulos ao longo da parede lateral.
  function renderFreeformWalls(wallsData, room, activeWallIndex, options) {
    const keepCamera = !!(options && options.keepCamera);
    if (!scene || !available()) return;
    onResize();
    clearGroups();
    currentOpenables = [];

    const walls = (wallsData || []).filter((w) => w && Array.isArray(w.assemblies));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let maxHeight = 0;

    walls.forEach((wall) => {
      const list = wall.assemblies.filter((a) => a && a.group);
      const ax = Number(wall.alongDirX) || 0;
      const az = Number(wall.alongDirZ) || 0;
      const ix = Number(wall.intoDirX) || 0;
      const iz = Number(wall.intoDirZ) || 0;
      const ox = Number(wall.originX) || 0;
      const oz = Number(wall.originZ) || 0;
      const rotY = Number(wall.rotationY) || 0;
      const cosR = Math.cos(rotY), sinR = Math.sin(rotY);

      list.forEach((a) => {
        const alongOffset = Number(a.x_m || 0) + a.width_m / 2;
        // NADA AFASTA O MÓVEL DA PAREDE (2026-08-15, Matt: "movel afasta da
        // parede ainda ... nao pode afastar de lugar nenhum. se tiver alguma
        // regra de rodape, jogar pra frente, pode eliminar tudo isso").
        //
        // Havia aqui um recuo pela espessura do rodapé (BASEBOARD_DEPTH_M) pra
        // móvel de CHÃO — a 1ª tentativa de corrigir o afastamento foi só
        // arrumar a ORDEM (setar Y antes de medir o bbox que decidia
        // "suspenso vs. no chão"), mas o recuo continuava existindo pra todo
        // móvel de chão, que é o caso normal. Agora a regra saiu inteira: o
        // fundo do módulo cai exatamente na face da parede, sempre.
        // Removida também em placeOne()/renderFreeform() acima e em
        // photoreal.js. O rodapé continua sendo DESENHADO no ambiente; ele só
        // não empurra mais ninguém.
        // Rotação fina 3 eixos (2026-08-23, ver assembly.fineRotX/Y/Z em
        // buildProjectAssemblies) — X/Z são SEMPRE ajuste fino (parede nunca
        // teve tilt/roll); Y soma o giro fino por cima do giro real da
        // parede (rotY, fixo por qual parede o módulo ocupa).
        a.group.rotation.set(a.fineRotX || 0, rotY + (a.fineRotY || 0), a.fineRotZ || 0);
        a.group.position.y = a.floor_height_m || 0;
        const layerDepth = Number(a.z_order || 0) * FREEFORM_DEPTH_STEP_M;
        // fineOffsetZ_m: afasta o módulo da parede além do "encostado" padrão
        // — ajuste fino só visual (ver comentário em buildProjectAssemblies),
        // soma na MESMA direção "pra dentro do ambiente" (ix/iz) que o resto
        // do depthOffset já usa, então funciona certo em qualquer ângulo de
        // parede.
        const depthOffset = a.depth_m / 2 + layerDepth + (a.fineOffsetZ_m || 0);

        a.group.position.x = ox + ax * alongOffset + ix * depthOffset;
        a.group.position.z = oz + az * alongOffset + iz * depthOffset;

        // Marca de onde este assembly veio (pedido do usuário 2026-07-26:
        // "quero ver os modulos em 3d... preciso passar o modulo de uma
        // parede pra outra arrastando" — a Vista de Canto de Projetos virou
        // uma cena 3D INTERATIVA em vez de só um preview). userData é o jeito
        // padrão do Three.js de anexar dado arbitrário num Object3D sem
        // interferir em nada da renderização — usado por pickAssemblyAt (ver
        // abaixo) pra, ao clicar/arrastar um objeto da cena, achar de volta
        // qual slot/parede ele representa (o raycaster só devolve meshes/
        // Object3D, não sabe nada de "slot" ou "parede").
        a.group.userData.slotId = a.id;
        a.group.userData.wallIndex = wall.wallIndex;
        // Botão "Camadas" (02/09) — toggle único de Decoração esconde o
        // assembly inteiro (ver buildProjectAssemblies, portal-08).
        a.group.userData.isDecoration = !!a.isDecoration;

        scene.add(a.group);
        currentGroups.push(a.group);
        if (Array.isArray(a.openables) && a.openables.length) {
          a.openables.forEach((op) => { op.slotId = a.id; });
          currentOpenables.push(...a.openables);
        }

        maxHeight = Math.max(maxHeight, (a.floor_height_m || 0) + a.height_m);

        // Bounding box em X/Z pra enquadrar a cena inteira (L/U não fica mais
        // simétrico em X=0 como o render()/renderFreeform() de parede única)
        // — os 4 cantos do módulo (já rotacionado igual ao group, mesma
        // matriz de rotY) dão o retângulo real ocupado no mundo.
        const halfW = a.width_m / 2, halfD = a.depth_m / 2;
        [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]].forEach(([lx, lz]) => {
          const wx = a.group.position.x + lx * cosR + lz * sinR;
          const wz = a.group.position.z - lx * sinR + lz * cosR;
          minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
          minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
        });
      });

      // Junção automática de rodapé (migration 137) — só entre módulos DESTA
      // mesma parede (list já é só os assemblies dela); módulos de paredes
      // diferentes nunca se tocam de verdade, mesmo se as coordenadas locais
      // parecerem próximas.
      applyBaseboardJoins(list);
      const wallWidthMForDims = Number(wall.widthM) || 0;
      if (options && options.dimensionsEnabled) buildProjectDimensionLines(list, ax, az, ox, oz, wallWidthMForDims, room);

      // Inclui a PAREDE em si (não só os módulos) na caixa delimitadora —
      // pedido do usuário (2026-07-26, Vista de Canto 3D): "a cena esta
      // deslocada pra direita, precisa centralizar". Antes só os 4 cantos
      // de cada MÓDULO entravam no enquadramento — se uma parede não tinha
      // nenhum módulo ainda (ou só 1 dos lados do L tinha móveis), a caixa
      // ficava pequena e deslocada pro lado que tinha módulos, e o
      // ambiente inteiro (com a outra parede, maior/vazia) saía cortado/
      // fora do centro. Os 2 cantos de CADA parede (início e fim, ao longo
      // de alongDir) garantem que a largura toda de toda parede sempre
      // conta pro enquadramento, com módulo ou sem.
      const wallWidthM = Number(wall.widthM) || 0;
      [0, wallWidthM].forEach((alongOffset) => {
        const wx = ox + ax * alongOffset;
        const wz = oz + az * alongOffset;
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
        minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
      });
    });

    // ---------- Módulos ILHA (soltos no chão) ----------
    // Pedido do usuário (2026-08-08): "O modulo deve estar ligado a uma parede
    // ou ao chao". Esses não pertencem a parede nenhuma — a posição vem em
    // coordenadas de MUNDO (floorX/floorZ, em metros, ver placement='floor' e
    // floor_x_mm/floor_z_mm em portal.js) mais um giro próprio em Y. Entram na
    // MESMA cena/currentGroups dos módulos de parede (mesmo raycasting, mesmo
    // contorno vermelho, mesmo arraste), só a matemática de posição muda.
    const floorList = ((options && options.floorAssemblies) || []).filter((a) => a && a.group);
    floorList.forEach((a) => {
      // Ilha: Y (rotationY, floor_rotation_deg) continua o giro REAL, com
      // colisão/reclamp no ambiente (ver nudgeProjectFloorSlotRotation). X/Z
      // de rotação (fineRotX/fineRotZ) são ajuste fino só visual — tombar/
      // rolar não existia antes, não tem checagem de "saiu do ambiente".
      a.group.rotation.set(a.fineRotX || 0, Number(a.rotationY) || 0, a.fineRotZ || 0);
      a.group.position.x = Number(a.floorX) || 0;
      a.group.position.z = Number(a.floorZ) || 0;
      // fineOffsetY_m: eleva a ilha do chão — ajuste fino só visual (mesmo
      // princípio do fineOffsetZ_m de parede acima), com clamp de teto feito
      // na origem (ver nudgeProjectFloorSlot, portal-06c).
      a.group.position.y = (a.floor_height_m || 0) + (a.fineOffsetY_m || 0);
      a.group.userData.slotId = a.id;
      a.group.userData.wallIndex = null;
      a.group.userData.isFloorIsland = true;
      // Botão "Camadas" (02/09) — mesma marca do ramo de parede acima.
      a.group.userData.isDecoration = !!a.isDecoration;
      scene.add(a.group);
      currentGroups.push(a.group);
      if (Array.isArray(a.openables) && a.openables.length) currentOpenables.push(...a.openables);
      maxHeight = Math.max(maxHeight, (a.floor_height_m || 0) + a.height_m);
      const halfW = a.width_m / 2, halfD = a.depth_m / 2;
      const cR = Math.cos(a.group.rotation.y), sR = Math.sin(a.group.rotation.y);
      [[-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD]].forEach(([lx, lz]) => {
        const wx = a.group.position.x + lx * cR + lz * sR;
        const wz = a.group.position.z - lx * sR + lz * cR;
        minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
        minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
      });
    });

    if (!isFinite(minX)) { minX = -0.15; maxX = 0.15; minZ = 0; maxZ = 0.3; }

    if (room && room.ceiling_m > 0) {
      // margin sempre 0 (2026-07-26: "ver o final das paredes de verdade")
      // — 'main' também termina exatamente no canto real agora (antes tinha
      // uma sobra de 15% só nela), coincidindo com onde 'left'/'right'
      // começam (ver buildRoomEnvironmentMultiWall, end-caps verticais).
      const segments = walls.map((wall) => ({
        originX: wall.originX, originZ: wall.originZ,
        alongDir: { x: wall.alongDirX, z: wall.alongDirZ },
        // intoDir (novo, 2026-08-08): a superfície SÓLIDA da parede precisa
        // saber pra que lado a face visível olha — ver makeWallSurface.
        intoDir: { x: wall.intoDirX, z: wall.intoDirZ },
        widthM: wall.widthM,
        margin: 0,
        label: wall.role === 'main',
        wallIndex: wall.wallIndex
      }));
      const envGroup = buildRoomEnvironmentMultiWall(segments, room);
      // Botão "Camadas" (02/09, pedido do Matt: "incluir... paredes como...
      // camada unica") — piso+paredes viram 1 grupo só, escondido/mostrado
      // de uma vez (ver applyProjectLayerVisibility, portal-06c).
      envGroup.userData.legnoLayer = 'paredes';
      scene.add(envGroup);
      currentGroups.push(envGroup);
    }

    const totalWidth = Math.max(maxX - minX, 0.3);
    const totalDepth = Math.max(maxZ - minZ, 0.3);
    const centerX = (minX + maxX) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const frameH = room && room.ceiling_m > 0 ? Math.max(maxHeight, room.ceiling_m + 0.25) : Math.max(maxHeight, 0.3);
    const target = new THREE.Vector3(centerX, frameH / 2, centerZ);

    // margin bem enxuta (pedido do usuário 2026-07-26: "aumentar a tela de
    // projeto... dar zoom nas duas paredes pra visualizar melhor") — 1.0 =
    // exatamente o enquadramento mínimo calculado (sem folga nenhuma extra),
    // já que o cálculo de dist logo abaixo já é PRECISO (projeção nos eixos
    // reais de tela, não mais uma esfera generosa — ver comentário grande
    // logo abaixo), então não sobra praticamente nada cortado mesmo sem
    // margem.
    const margin = 1.0;
    // Direção da câmera: bissetriz das paredes presentes (pedido do
    // usuário, 2026-07-26, na Vista de Canto de Projetos — câmera FIXA lá,
    // ver ViewerProjectEdit em portal.js: "a camera ta posicionada atras de
    // uma parede, precisa reposicionar a 45 graus de cada parede"). Antes
    // usava a MESMA direção fixa de renderFreeform (pensada pra câmera de 1
    // parede só, com OrbitControls livre pra corrigir manualmente) — em L/
    // C-U isso podia deixar a câmera quase de perfil/atrás de uma das
    // paredes dependendo da caixa delimitadora, e a Vista de Canto não tem
    // orbit pra corrigir (câmera fixa, ver setControlsEnabled(false)).
    // Somar o `intoDir` (a direção que CADA parede aponta pra dentro do
    // ambiente) de todas as paredes presentes dá exatamente a bissetriz do
    // canto: 2 paredes (dupla/L) → resultante a 45° de cada uma; 3 paredes
    // (C/U) → left/right se cancelam em X e sobra a direção da 'main'
    // (câmera centrada, olhando de frente pro fundo do U, com as duas
    // laterais simétricas nas bordas). Mesma fórmula beneficia o botão
    // "Visualizar 3D" (ViewerProject) também — só afeta forma com >1 parede,
    // renderFreeform (parede única) não usa este código.
    //
    // activeWallIndex (novo, pedido do usuário 2026-07-26: "nao consigo
    // selecionar os modulos de tras, precisao pra poder projetar melhor") —
    // só passado pela Vista de Canto de Projetos (ViewerProjectEdit, câmera
    // fixa sem orbit). Com a câmera exatamente na bissetriz, uma parede
    // lateral fica quase de perfil (ver comentário grande em pickAssemblyAt
    // /hitbox em portal.js) e os módulos dela ficam espremidos numa faixa
    // fina de tela — várias caixas de clique se sobrepõem na projeção 2D e o
    // raycaster sempre acerta a mais perto da câmera, nunca a que o usuário
    // está de fato apontando. Em vez de mudar o próprio raycasting (não tem
    // como adivinhar por geometria só qual módulo o usuário "quis" clicar
    // quando duas caixas ocupam o mesmo pixel), a solução é girar a câmera
    // pra ENCARAR de frente a parede em edição — mesmo gatilho que já troca
    // projectActiveWallIndex (abas de parede + Vista Superior, ver
    // setProjectActiveWallIndex/renderProjectMiniTopView em portal.js), sem
    // precisar de nenhum clique novo na cena 3D (que teria a MESMA
    // ambiguidade pra descobrir em qual parede o usuário quis clicar).
    // Dar um peso extra ao intoDir da parede ativa antes de somar inclina a
    // bissetriz pra ela (weight=1 em todas = comportamento antigo, idêntico
    // pra quem não passa activeWallIndex, ex. "Visualizar 3D"); ainda soma
    // as outras paredes com peso normal, então não perde o contexto de canto
    // (não vira uma vista 100% de frente, só bem menos de perfil).
    //
    // BIAS=3.5 (~16° de ângulo residual em relação a olhar reto pra parede)
    // NÃO foi suficiente — medido de verdade (script varrendo pickAssemblyAt
    // num grid fino de pixels, pedido do usuário 2026-07-26 "vamos tentar
    // virar a parede" depois de eu confirmar com dados que módulos mais
    // longe do canto ficavam quase sem território próprio na tela): com 3
    // módulos numa fileira, o profundidade real de cada um (ex. 41cm) nesse
    // ângulo residual faz um módulo "tampar" visualmente o de trás — não é
    // bug de raycasting, é oclusão geométrica de verdade, que piora
    // proporcionalmente à distância do módulo até o canto. BIAS=14 (~4° de
    // ângulo residual) reduz isso pra uma faixa bem mais estreita — testado
    // com o mesmo script, ver conversa. Ainda soma as outras paredes (não
    // vira 100% ortogonal), só um resquício bem pequeno de contexto de
    // canto.
    const ACTIVE_WALL_BIAS = 14;
    let intoSumX = 0, intoSumZ = 0;
    walls.forEach((wall) => {
      const w = (activeWallIndex != null && wall.wallIndex === activeWallIndex) ? ACTIVE_WALL_BIAS : 1;
      intoSumX += (Number(wall.intoDirX) || 0) * w;
      intoSumZ += (Number(wall.intoDirZ) || 0) * w;
    });
    if (Math.hypot(intoSumX, intoSumZ) < 0.001) { intoSumX = 0; intoSumZ = 1; } // fallback, não deveria ocorrer com paredes de verdade
    const dir = new THREE.Vector3(intoSumX, 0.55, intoSumZ).normalize();
    const fovYRad = (camera.fov || 35) * Math.PI / 180;
    const aspect = camera.aspect || 1;
    const fovXRad = 2 * Math.atan(Math.tan(fovYRad / 2) * aspect);

    // Distância da câmera: enquadramento PRECISO (pedido do usuário,
    // 2026-07-26: "as paredes estao muito longe, dificil de ver"). Antes
    // usava uma esfera envolvendo a caixa inteira (raio = metade da
    // diagonal 3D) — método simples, mas exagerado pra uma sala larga/rasa
    // como um L/C-U: a diagonal 3D de uma caixa larga e baixa é bem maior
    // que a distância mínima real necessária, empurrando a câmera bem mais
    // longe do que precisava (módulos ficavam pequenos/distantes). Agora
    // projeta os 8 cantos da caixa nos eixos de TELA de verdade da câmera
    // (direita/cima, derivados da direção `dir` já calculada acima) e usa a
    // maior projeção em cada eixo — é o enquadramento MÍNIMO que garante
    // nada cortado, sem a folga desnecessária da esfera.
    const forward = dir.clone().negate();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const rightAxis = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
    const upAxis = new THREE.Vector3().crossVectors(rightAxis, forward).normalize();
    const hw = totalWidth / 2, hh = frameH / 2, hd = totalDepth / 2;
    let maxU = 0.15, maxV = 0.15; // piso mínimo — evita divisão por ~0 numa caixa quase de um ponto só
    [-1, 1].forEach((sx) => [-1, 1].forEach((sy) => [-1, 1].forEach((sz) => {
      const corner = new THREE.Vector3(sx * hw, sy * hh, sz * hd);
      maxU = Math.max(maxU, Math.abs(corner.dot(rightAxis)));
      maxV = Math.max(maxV, Math.abs(corner.dot(upAxis)));
    })));
    const dist = Math.max(maxU / Math.tan(fovXRad / 2), maxV / Math.tan(fovYRad / 2)) * margin;
    // keepCamera (pedido do usuário 2026-07-26: "pode testar uma camera que
    // mexe? zoom e rotacao" — Vista de Canto de Projetos ganhou OrbitControls
    // de verdade, ver setControlsEnabled/renderProjectCanvasFrontCorner) —
    // sem isso, TODA chamada de renderFreeformWalls (que roda de novo a cada
    // arrastar/adicionar/redimensionar módulo, não só ao trocar de parede)
    // resetava a câmera pro enquadramento automático, jogando fora qualquer
    // ajuste manual (orbit/zoom) que o usuário acabou de fazer. Só quando
    // muda de parede/forma de verdade (ver fitKey em portal.js) que faz
    // sentido reenquadrar do zero — o resto do bounding box (totalWidth/
    // frameH/target etc.) continua recalculado sempre, é só a câmera em si
    // que não é tocada.
    if (!keepCamera) {
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target.x, target.y, target.z);
      if (controls) { controls.target.copy(target); controls.update(); }
    }

    lastFitTarget = target.clone();
    lastFitTotalWidth = totalWidth;
    lastFitFrameH = frameH;
    lastFitMaxDepth = totalDepth;
    lastFitDir = { x: dir.x, y: dir.y, z: dir.z };
  }

  // Chamados pelo botão "Abrir portas"/"Abrir gavetas" da Composição (ver
  // portal.js) — SEPARADOS (mesma convenção de viewer3d.js): cada um só mexe
  // no seu kind ('hinge' pra porta, 'slide' pra gaveta/módulo de corrediça)
  // entre as peças-que-abrem atualmente na cena, sem precisar reconstruir
  // nenhum assembly (animate() interpola suavemente). Devolve o novo estado
  // (true = abertas) pra quem chamou atualizar o texto do botão.
  //
  // onlySlotId (2026-08-27, pedido do Matt: "quando clico no modulo do
  // ambiente e deixo ele selecionado ao clicar nesses 2 de abertura quero
  // que so o modulo selecionado abra. pra abrir todos do ambeinte somente
  // se nenhum entiver selecionado") — opcional, passado pelo chamador
  // (ver po-proj-tb-doors-btn/po-proj-tb-drawers-btn em
  // portal-08-projetos-paredes.js) com o slot atualmente selecionado no
  // canvas 2D. Com um slotId: mexe SÓ nas peças daquele módulo (currentOpenables
  // já vem marcado com op.slotId, ver render()/renderFreeform()/
  // renderFreeformWalls() acima) e o estado "aberto" desse módulo é lido
  // DIRETO do targetAngle/targetOffset atual das peças dele — não existe
  // uma variável própria por slot, pra nunca dessincronizar do que já foi
  // aberto por um toggle "todos" anterior. Sem slotId (comportamento de
  // sempre, sem seleção): continua mexendo em TODA currentOpenables e
  // usando o booleano global doorsOpen/drawersOpen de sessão.
  function toggleDoors(onlySlotId) {
    if (onlySlotId != null) {
      const nowOpen = !areDoorsOpen(onlySlotId);
      currentOpenables.forEach((op) => {
        if (op.kind === 'hinge' && op.slotId === onlySlotId) op.targetAngle = nowOpen ? openAngleFor(op.hingeSide) : 0;
      });
      return nowOpen;
    }
    doorsOpen = !doorsOpen;
    currentOpenables.forEach((op) => {
      if (op.kind === 'hinge') op.targetAngle = doorsOpen ? openAngleFor(op.hingeSide) : 0;
    });
    return doorsOpen;
  }

  function toggleDrawers(onlySlotId) {
    if (onlySlotId != null) {
      const nowOpen = !areDrawersOpen(onlySlotId);
      currentOpenables.forEach((op) => {
        if (op.kind === 'slide' && op.slotId === onlySlotId) op.targetOffset = nowOpen ? op.distance : 0;
      });
      return nowOpen;
    }
    drawersOpen = !drawersOpen;
    currentOpenables.forEach((op) => {
      if (op.kind === 'slide') op.targetOffset = drawersOpen ? op.distance : 0;
    });
    return drawersOpen;
  }

  function areDoorsOpen(onlySlotId) {
    if (onlySlotId != null) {
      return currentOpenables.some((op) => op.kind === 'hinge' && op.slotId === onlySlotId && op.targetAngle);
    }
    return doorsOpen;
  }
  function areDrawersOpen(onlySlotId) {
    if (onlySlotId != null) {
      return currentOpenables.some((op) => op.kind === 'slide' && op.slotId === onlySlotId && op.targetOffset);
    }
    return drawersOpen;
  }

  // Galeria pública (migration 048, pedido do usuário: "gerar uma imagem de
  // ia" a partir do 3D da composição) — captura a cena INTEIRA já montada
  // como PNG, mesmo princípio de Viewer3D.snapshot() (viewer3d.js), mas essa
  // cena aqui NUNCA teve fundo transparente (scene.background é branco
  // sólido desde o início, ver init() acima) — não precisa esconder nenhum
  // grupo antes de capturar, é só renderizar e ler o canvas (preserveDrawingBuffer
  // já é true desde o WebGLRenderer criado em init()). Serve tanto de imagem
  // "de verdade" (enquanto a geração de IA não está plugada, ver
  // generateAiRenderForComposition em portal.js) quanto de imagem-fonte
  // ENVIADA pra IA depois (screenshot + swatch da cor real, ver plano
  // registrado em memória "AI render + galeria").
  // Direções nomeadas pra snapshot({angle}) — pedido do usuário (2026-07-19):
  // "existe a possibilidade de levar um arquivo 3d pra geracao da imagem ser
  // fiel ao projeto?" — a API de geração (Gemini/OpenAI) não aceita arquivo
  // 3D nenhum (só imagem 2D + texto), então a alternativa combinada foi
  // mandar VÁRIOS ângulos 2D do mesmo 3D como referência extra de geometria
  // (ver generateAiPreviewForGallery em portal.js), além do print frontal
  // principal (que continua sendo o único que define o enquadramento da
  // imagem final, ver comentário de buildGalleryPrompt no Edge Function).
  //   - frontal: já existia (pedido anterior, "geralmente quero fotos mais
  //     frontais") — praticamente sem componente lateral.
  //   - three_quarter: ângulo clássico de foto de catálogo/produto.
  //   - side: quase de perfil, bom pra profundidade/lateral que a frontal
  //     não mostra.
  //   - corner: pedido do usuário (2026-07-26, projetos com 2-3 paredes,
  //     "camera pegando as duas paredes") — 'frontal' é quase Z puro
  //     (pensado pra 1 parede só), então numa forma L/C-U as paredes
  //     laterais saem cortadas/quase de perfil do print PRINCIPAL (o único
  //     que define o enquadramento final, ver comentário grande logo acima).
  //     Sem direção fixa própria: usa lastFitDir, a MESMA bissetriz que
  //     renderFreeformWalls acabou de calcular pra quantas paredes o projeto
  //     realmente tiver (2 → 45° de cada uma; 3 → centrada no fundo do U) —
  //     ver comentário grande onde lastFitDir é declarado.
  const SNAPSHOT_ANGLE_DIRS = {
    frontal: [0.02, 0.12, 1],
    three_quarter: [0.75, 0.32, 0.9],
    side: [0.98, 0.18, 0.25]
  };

  function snapshot(options) {
    if (!renderer || !scene || !camera) return null;
    // options.angle (novo) tem prioridade; options.frontal (legado) vira
    // angle:'frontal' — nenhum caller antigo quebra.
    const angleKey = (options && options.angle) || (options && options.frontal ? 'frontal' : null);
    const dirArr = angleKey === 'corner'
      ? (lastFitDir ? [lastFitDir.x, lastFitDir.y, lastFitDir.z] : SNAPSHOT_ANGLE_DIRS.frontal)
      : (angleKey && SNAPSHOT_ANGLE_DIRS[angleKey]);
    // Reposiciona a câmera de VERDADE pro ângulo pedido (em vez de pedir pro
    // Gemini "reinventar" o ângulo via prompt — arriscado, pode distorcer a
    // geometria), tira o print dali, e devolve a câmera pra posição/órbita
    // que o usuário estava vendo antes — não afeta a navegação normal do 3D.
    let savedPosition = null;
    let savedTarget = null;
    if (dirArr && lastFitTarget) {
      savedPosition = camera.position.clone();
      savedTarget = controls ? controls.target.clone() : null;
      const target = lastFitTarget;
      const totalWidth = lastFitTotalWidth || 1;
      const frameH = lastFitFrameH || 1;
      const maxDepth = lastFitMaxDepth || 1;
      const R = 0.5 * Math.sqrt(totalWidth * totalWidth + frameH * frameH + maxDepth * maxDepth);
      const margin = 1.15;
      const dir = new THREE.Vector3(dirArr[0], dirArr[1], dirArr[2]).normalize();
      const fovYRad = (camera.fov || 35) * Math.PI / 180;
      const aspect = camera.aspect || 1;
      const fovXRad = 2 * Math.atan(Math.tan(fovYRad / 2) * aspect);
      const dist = Math.max(R / Math.sin(fovYRad / 2), R / Math.sin(fovXRad / 2)) * margin;
      camera.position.copy(target).addScaledVector(dir, dist);
      camera.lookAt(target.x, target.y, target.z);
    }
    try {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } catch (err) {
      return null;
    } finally {
      if (dirArr && savedPosition) {
        camera.position.copy(savedPosition);
        if (controls && savedTarget) { controls.target.copy(savedTarget); controls.update(); }
        camera.lookAt(controls ? controls.target : lastFitTarget);
        renderer.render(scene, camera);
      }
    }
  }

  // Proporção (largura/altura) do canvas atual — usada pra pedir pro Gemini
  // (generationConfig.imageConfig.aspectRatio) devolver a imagem numa
  // proporção parecida com o que foi enquadrado, em vez dele decidir sozinho
  // (o modelo tende a sair em 3:4/1:1 por padrão, cortando/espremendo o
  // enquadramento largo típico de uma composição — ver comentário em
  // generateAiPreviewForGallery em portal.js, que mapeia isto pro valor mais
  // próximo suportado pela API). containerEl já é redimensionado 1:1 com o
  // renderer/câmera (ver onResize()), então essa proporção é exatamente a
  // do print tirado por snapshot().
  function canvasAspectRatio() {
    if (!containerEl || !containerEl.clientWidth || !containerEl.clientHeight) return null;
    return containerEl.clientWidth / containerEl.clientHeight;
  }

  // ---------- Interatividade (arrastar módulo dentro da cena 3D) ----------
  // Pedido do usuário (2026-07-26), depois da 1ª tentativa (dobra CSS) ter
  // saído quebrada: "a visao ta ruim, preciso ver conforme imagem
  // referencia. quero ver os modulos em 3d tambem... preciso passar o
  // modulo de uma parede pra outra arrastando". A Vista de Canto de
  // Projetos (renderProjectCanvasFrontCorner, portal.js) passou a ser uma
  // instância PRÓPRIA desta fábrica (ViewerProjectEdit, câmera FIXA — ver
  // setControlsEnabled) com arrastar de verdade via raycasting. Em vez de
  // expor renderer/scene/camera crus (frágil — qualquer código de fora
  // poderia mexer neles de um jeito que desincroniza do resto do closure),
  // só 4 métodos MÍNIMOS ficam públicos:
  //   - setControlsEnabled: liga/desliga o OrbitControls (a Composição e o
  //     "Visualizar 3D" da Projetos continuam com órbita livre; só a Vista
  //     de Canto pede câmera fixa).
  //   - getDomElement: o <canvas> de verdade, pra portal.js anexar seus
  //     próprios listeners de pointerdown/move/up (não duplica nenhuma
  //     lógica de evento aqui dentro).
  //   - pickAssemblyAt: "o que tem embaixo do ponteiro" (slotId/wallIndex/
  //     group), subindo a árvore de pais do hit até achar o Group marcado em
  //     renderFreeformWalls (userData.slotId).
  //   - intersectPlaneAtClient: interseção do raio do ponteiro com um plano
  //     arbitrário (usado pra saber "onde no MUNDO 3D o ponteiro está
  //     apontando dentro do plano da parede ativa" — portal.js decompõe esse
  //     ponto em along-parede/altura usando a mesma geometria de parede que
  //     já usa pra POSICIONAR os módulos, ver getProjectWallGeometry).
  // enabled=true agora é usado pela Vista de Canto de Projetos também
  // (pedido do usuário 2026-07-26: "pode testar uma camera que mexe? zoom e
  // rotacao" — depois de melhorar bastante a seleção mas ainda achar difícil
  // de projetar sem poder ajustar o ângulo na hora). BOTÃO ESQUERDO fica de
  // fora do OrbitControls (LEFT: null) — é o mesmo botão que
  // attachProject3DEditDrag (portal.js) usa pra arrastar/esticar módulo via
  // raycasting; se o OrbitControls também reagisse a ele, os dois ficariam
  // brigando pelo mesmo gesto (arrastar um módulo giraria a câmera ao mesmo
  // tempo). BOTÃO DO MEIO (apertar a rodinha e arrastar) gira (ROTATE) —
  // pedido do usuário 2026-07-26: "pode fazer a rotacao apertando o scroll
  // ao inves do botao direito". DIREITO vira pan. Zoom por GIRAR o scroll
  // (sem apertar) já vem de graça do OrbitControls (enableZoom) e não
  // depende de mouseButtons — continua funcionando igual, independente de
  // qual botão está mapeado pra ROTATE/PAN.
  function setControlsEnabled(enabled) {
    if (!controls) return;
    controls.enabled = !!enabled;
    if (enabled && typeof THREE !== 'undefined' && THREE.MOUSE) {
      controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
    }
  }

  function getDomElement() {
    return renderer ? renderer.domElement : null;
  }

  // ==========================================================================
  // A CAUSA DO "O CLIQUE PEGA 1 METRO FORA DO MÓVEL" (2026-08-13)
  // ==========================================================================
  // THREE.Raycaster.params.Line.threshold vem 1 POR PADRÃO — e nesta cena a
  // unidade de mundo é o METRO. Ou seja: o raio "acerta" qualquer LINHA que
  // passe a até 1 METRO dele. O grupo de um módulo tem 11 LineSegments (os
  // contornos das peças), então o módulo virava um alvo com 1m de auréola
  // invisível em volta — foi exatamente isso, medido no navegador dele:
  //   módulo desenhado em x 471..539 px  ·  clique pegando em x 335..650 px
  // Os dois números batem: ~1m de cada lado, na escala daquela câmera.
  //
  // Isso também explica os hits "a 3mm um do outro" que apareceram no log: não
  // era raio raspando peça fina de perfil, era a distância até várias linhas
  // quase paralelas.
  //
  // 0.0005 (meio milímetro) = na prática, só acerta a linha quem passa em cima
  // dela. Points recebe o mesmo tratamento por segurança (não há Points na cena
  // hoje, mas o padrão dele também é generoso).
  const _raycaster = (typeof THREE !== 'undefined') ? new THREE.Raycaster() : null;
  if (_raycaster) {
    _raycaster.params.Line.threshold = 0.0005;
    if (_raycaster.params.Points) _raycaster.params.Points.threshold = 0.0005;
  }

  function ndcFromClient(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  // preferredWallIndex (novo, pedido do usuário 2026-07-26: "meu indicador
  // esta em cima do movel da parede selecionada, mas ele esta pegando o
  // modulo da esquerda da outra parede... como se tivesse mal calibrado") —
  // não é miscalibração de coordenada nenhuma: perto do canto, a caixa de
  // clique (hitbox) de um módulo da parede ATIVA e a de um módulo da OUTRA
  // parede podem se sobrepor na projeção 2D da tela (ainda mais depois do
  // viés de câmera — ver ACTIVE_WALL_BIAS em renderFreeformWalls — que deixa
  // a parede ativa de frente e a outra de perfil, sobrepondo as caixas dela
  // com as da ativa perto do canto). intersectObjects sempre devolve a mais
  // PRÓXIMA da câmera ao longo do raio, que não é necessariamente a que o
  // usuário está vendo "por cima" — pega TODOS os hits (já vêm ordenados por
  // distância) e prefere o mais próximo que pertença à parede em edição
  // (projectActiveWallIndex, ver portal.js); só cai pra qualquer parede se
  // nenhum hit bateu na ativa (clique claramente fora dela, sem ambiguidade
  // nenhuma pra resolver).
  // Diagnóstico TEMPORÁRIO (pedido do usuário 2026-07-26: "ainda to com
  // problema de selecao... ao passar mouse nao encontra o modulo" — 2ª
  // rodada de ajuste de raycasting não resolveu, então investigar antes de
  // mexer de novo às cegas). Ligar no console do navegador (F12):
  // `window.__legnoDebugPick = true`, passar o mouse por cima do módulo que
  // falha, e copiar as últimas linhas "[legno pickAssemblyAt]" logadas — só
  // loga quando o RESULTADO muda (não a cada pointermove) pra não lotar o
  // console. Não afeta nada em produção (fica mudo por padrão).
  // ONDE CADA MÓDULO ESTÁ NA TELA, em pixels de viewport (2026-08-13).
  //
  // Nasceu do relato "o clique pega muito fora do móvel": o log do pick sozinho
  // não resolve a dúvida, porque ele diz o que o raio acertou mas não diz onde
  // o módulo aparece. Projetando os 8 cantos da caixa do módulo pela MESMA
  // câmera que desenha, dá pra comparar direto com o clientX/clientY do clique:
  //   · clique DENTRO do retângulo e mesmo assim "errado" -> o móvel está sendo
  //     desenhado menor que a caixa dele (peça invisível/transparente esticando
  //     o bounding box), e o alvo a corrigir é a geometria, não o raycasting;
  //   · clique FORA do retângulo e ainda assim acertando -> aí sim é conta de
  //     câmera/rect errada no raycasting.
  function debugScreenRects() {
    const out = [];
    if (!camera || !renderer || typeof THREE === 'undefined') return out;
    const rect = renderer.domElement.getBoundingClientRect();
    const caixa = new THREE.Box3();
    const v = new THREE.Vector3();
    currentGroups.forEach((g) => {
      if (!g || !g.userData || g.userData.slotId == null) return;
      caixa.setFromObject(g);
      if (caixa.isEmpty()) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        v.set(
          (i & 1) ? caixa.max.x : caixa.min.x,
          (i & 2) ? caixa.max.y : caixa.min.y,
          (i & 4) ? caixa.max.z : caixa.min.z
        ).project(camera);
        const px = rect.left + ((v.x + 1) / 2) * rect.width;
        const py = rect.top + ((1 - v.y) / 2) * rect.height;
        x0 = Math.min(x0, px); x1 = Math.max(x1, px);
        y0 = Math.min(y0, py); y1 = Math.max(y1, py);
      }
      out.push({
        slotId: g.userData.slotId,
        x: [Math.round(x0), Math.round(x1)],
        y: [Math.round(y0), Math.round(y1)]
      });
    });
    return out;
  }

  // `extra` pode vir como FUNÇÃO — e vem, no caminho quente: montar o objeto
  // de diagnóstico (mapear todos os hits) custa alocação a cada pick, e pick
  // acontece até 9 vezes por toque (o anel do pickAssemblyAtSticky). Com o
  // diagnóstico desligado, a função simplesmente nunca é chamada.
  let _lastDebugPickKey = null;
  function _debugPickLog(clientX, clientY, result, extraOuFn) {
    if (typeof window === 'undefined' || !window.__legnoDebugPick) return;
    const extra = (typeof extraOuFn === 'function') ? extraOuFn() : extraOuFn;
    // Chave só pelo RESULTADO (slotId/wallIndex) + reason — não pelas
    // distâncias/coordenadas em `extra` (essas mudam a cada pixel de
    // pointermove, então incluí-las no throttle antes fazia logar quase
    // toda hora mesmo sem o resultado mudar, poluindo o console).
    // window.__legnoDebugPick = 'all' loga TODO pick, com as coordenadas.
    // O throttle por resultado escondia justamente o que interessa quando o
    // relato é "vai clicando até desclicar": todos os cliques que acertaram o
    // módulo davam o mesmo resultado e só o PRIMEIRO aparecia, então não dava
    // pra saber até onde a área errada ia.
    const tudo = window.__legnoDebugPick === 'all';
    const key = tudo
      ? (Math.round(clientX) + 'x' + Math.round(clientY))
      : JSON.stringify({ r: result ? [result.slotId, result.wallIndex] : null, reason: extra && extra.reason });
    if (key === _lastDebugPickKey) return;
    _lastDebugPickKey = key;
    // Loga como STRING já formatada (JSON.stringify), não como objeto
    // clicável — pedido do usuário mandou 2 screenshots seguidos do objeto
    // ainda FECHADO (precisa clicar na setinha ▸ pra abrir, aí abrir de novo
    // "result"/"hitsWithSlot" por dentro — fácil de esquecer numa captura de
    // tela rápida). Texto puro aparece tudo de uma vez, sem precisar clicar
    // em nada, só printar a área e mandar o print de novo.
    console.log('[legno pickAssemblyAt] ' + JSON.stringify({
      clientX: Math.round(clientX), clientY: Math.round(clientY),
      result: result ? { slotId: result.slotId, wallIndex: result.wallIndex } : null,
      // ONDE O MÓDULO ESTÁ NA TELA agora — compare com clientX/clientY acima.
      moduloNaTela: debugScreenRects(),
      ...extra
    }, null, 2));
  }

  // Wrapper de pickAssemblyAt com SELEÇÃO GRUDENTA (2026-08-08, 3ª rodada —
  // relato do usuário no iPad: "modulo clicado e com as setas aparecendo, mas
  // ao clicar na tela ele seleciona o modulo do lado, mesmo mostrando as setas
  // do modulo clicado. deve ficar travado so no clicado").
  //
  // A causa não é o raycaster errar: é o DEDO. O ponto de contato reportado
  // pelo navegador é o CENTRO da área tocada, e alguns milímetros de desvio
  // num módulo estreito visto em perspectiva caem na caixa de clique do
  // vizinho — o raio então acerta o vizinho de verdade, e a troca de seleção
  // está "correta" pela geometria e errada pela intenção.
  //
  // Solução: quando já existe um módulo selecionado e o toque acerta OUTRO,
  // relança o raio num anel de pontos ao redor do toque (o "raio do dedo").
  // Se o módulo selecionado aparecer em qualquer um deles, ele vence — ou
  // seja, encostar perto do que já está selecionado nunca rouba a seleção; só
  // um toque claramente em cima de outro módulo (nenhum ponto do anel
  // alcançando o selecionado) troca. Sem nada selecionado, ou no mouse (que é
  // preciso e não passa stickySlotId), o comportamento é o de sempre.
  const STICKY_RING_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  function pickAssemblyAtSticky(clientX, clientY, preferredWallIndex, stickySlotId, slopPx) {
    const direct = pickAssemblyAt(clientX, clientY, preferredWallIndex);
    if (stickySlotId == null || !slopPx) return direct;
    if (direct && direct.slotId === stickySlotId) return direct;
    for (let i = 0; i < STICKY_RING_DIRS.length; i++) {
      const d = STICKY_RING_DIRS[i];
      const hit = pickAssemblyAt(clientX + d[0] * slopPx, clientY + d[1] * slopPx, preferredWallIndex);
      if (hit && hit.slotId === stickySlotId) return hit;
    }
    return direct;
  }

  function pickAssemblyAt(clientX, clientY, preferredWallIndex) {
    if (!renderer || !camera || !_raycaster || !currentGroups.length) {
      _debugPickLog(clientX, clientY, null, {
        reason: 'early-return', hasRenderer: !!renderer, hasCamera: !!camera,
        hasRaycaster: !!_raycaster, currentGroupsCount: currentGroups.length
      });
      return null;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    _raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
    const rawHits = _raycaster.intersectObjects(currentGroups, true);
    // Só a caixa invisível de clique (isHitboxProxy, ver buildProjectAssemblies
    // em portal.js) — pedido do usuário 2026-07-26 depois de eu reproduzir o
    // bug de verdade (script varrendo pickAssemblyAt num grid, "vamos tentar
    // virar a parede" não resolveu porque a causa NÃO era ângulo de câmera).
    // Um módulo com muitas peças finas vistas quase de perfil (prateleiras
    // abertas, por ex.) gera DEZENAS de hits na geometria REAL a distâncias
    // quase idênticas às da caixa invisível do módulo VIZINHO ao lado (zero
    // vão entre eles) — "mais próximo" virava ruído sub-milimétrico entre
    // módulos diferentes. A caixa invisível de cada módulo é um bloco único
    // (6 faces só) que cobre o módulo INTEIRO, então nunca sofre desse
    // "graze" de várias peças finas quase paralelas ao raio — ignorar a
    // geometria real pro raycasting de clique (ela nunca precisou entrar
    // nessa conta, só a caixa) resolve na raiz. Fallback pra rawHits inteiro
    // se por algum motivo NENHUM hit for de caixa (não deveria ocorrer,
    // buildProjectAssemblies sempre adiciona uma — ver lá).
    // ==================================================================
    // A GEOMETRIA DE VERDADE MANDA (2026-08-13, 3ª rodada)
    // ==================================================================
    // Era o contrário: só a caixa invisível contava (isHitboxProxy), e a
    // geometria real era ignorada de propósito. O motivo original (2026-07-26)
    // era ambiguidade entre módulos VIZINHOS encostados: peças finas vistas
    // quase de perfil geram dezenas de hits a distâncias quase idênticas, e o
    // "mais próximo" virava ruído sub-milimétrico entre módulos diferentes.
    //
    // O custo disso só apareceu agora, com dado na mão: a caixa é do tamanho
    // DECLARADO do módulo (medido: 1757×900×560, igual ao cadastro), e um
    // módulo é quase todo AR — um casco de 6 peças finas com vão aberto no
    // meio. Clicar no buraco, vendo a parede do outro lado, selecionava o
    // módulo. É o "clico fora do móvel e ele pega" repetido três vezes pelo
    // Matt, e ele está certo: a área invisível É muito maior que o móvel.
    //
    // Agora: vence a PEÇA. A caixa fica só como último recurso, quando o raio
    // não achou geometria nenhuma daquele módulo — assim um módulo desenhado
    // com pouca coisa continua clicável, mas nunca mais o vazio dentro dele.
    // A ambiguidade entre vizinhos continua tratada logo abaixo
    // (preferredWallIndex + AMBIGUITY_TOLERANCE_M), que é onde ela deve ser
    // tratada mesmo.
    // A CAIXA VOLTOU A SER O ALVO (2026-08-13, 4ª rodada) — e foi ERRO MEU ter
    // tirado. Eu troquei o alvo pela geometria real achando que a caixa era a
    // culpada pelo "clique pega 1 metro fora"; a culpada era o
    // Line.threshold=1 (ver o comentário grande na criação do _raycaster).
    // Com aquilo corrigido, a caixa é exata — do tamanho do módulo — e é ela
    // que dá o clique confortável.
    //
    // Sem a caixa, um módulo de prateleiras abertas fica cheio de buraco: o
    // raio atravessa o vão, acerta a parede atrás e o clique NO MEIO DO MÓVEL
    // não seleciona nada. Foi exatamente o que o Matt relatou ("clico no meio
    // do movel e nao clica... tava muito bom antes"), e é o mesmo motivo pelo
    // qual a caixa foi criada em 2026-07-26.
    //
    // O filtro isMesh fica no fallback: contorno (LineSegments) nunca deve
    // decidir seleção, mesmo com threshold mínimo.
    const hitboxHits = rawHits.filter((h) => h.object && h.object.userData && h.object.userData.isHitboxProxy);
    const hits = hitboxHits.length
      ? hitboxHits
      : rawHits.filter((h) => h.object && h.object.isMesh);
    let firstAny = null;
    let firstAnyDist = Infinity;
    let matchedPreferred = null;
    let matchedPreferredDist = Infinity;
    for (let i = 0; i < hits.length; i++) {
      let obj = hits[i].object;
      while (obj) {
        if (obj.userData && obj.userData.slotId != null) {
          const found = { slotId: obj.userData.slotId, wallIndex: obj.userData.wallIndex, group: obj, point: hits[i].point.clone() };
          if (!firstAny) { firstAny = found; firstAnyDist = hits[i].distance; }
          if (preferredWallIndex != null && obj.userData.wallIndex === preferredWallIndex && !matchedPreferred) {
            matchedPreferred = found;
            matchedPreferredDist = hits[i].distance;
          }
          break;
        }
        obj = obj.parent;
      }
    }
    // AMBIGUITY_TOLERANCE_M (pedido do usuário 2026-07-26: "nao consigo
    // selecionar ele de forma nenhuma, ou pega da esquerda ou da direita") —
    // bug na versão anterior: preferir a parede ativa "vencia" mesmo quando o
    // hit dela estava BEM mais longe ao longo do raio que o hit mais próximo
    // de verdade (podia "alcançar" um módulo de outra fileira/parede lá atrás
    // e ignorar o módulo certo, mais perto, só porque pertencia à parede não-
    // ativa). Preferência só decide EMPATE de verdade (hits a uma distância
    // parecida = mesma região da tela, ambiguidade real de sobreposição perto
    // do canto); se o hit mais próximo está MUITO mais perto que qualquer hit
    // da parede preferida, o mais próximo vence sempre — é o módulo que o
    // usuário está genuinamente apontando.
    //
    // 0.5 ERA GENEROSO DEMAIS — confirmado com o mesmo script de varredura
    // (pedido do usuário, "vamos tentar virar a parede"): numa cena de canto
    // normal, módulos de paredes DIFERENTES facilmente ficam a menos de 0.5m
    // de distância um do outro ao longo do raio (a cena inteira não é muito
    // maior que isso), então a "preferência" quase sempre achava algum hit
    // da parede ativa dentro da folga e vencia mesmo longe do que o usuário
    // apontava — reproduzia exatamente esse ziguezague reportado. 0.03
    // (3cm) só cobre o caso de EMPATE de verdade (raio quase tangente à
    // linha onde duas caixas se tocam), sem alcançar módulos genuinamente
    // mais longe.
    const AMBIGUITY_TOLERANCE_M = 0.03;
    const result = (matchedPreferred && (matchedPreferredDist - firstAnyDist) <= AMBIGUITY_TOLERANCE_M)
      ? matchedPreferred
      : firstAny;
    _debugPickLog(clientX, clientY, result, () => ({
      reason: 'checked', preferredWallIndex, rectInside: (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom),
      firstAnyDist: isFinite(firstAnyDist) ? Number(firstAnyDist.toFixed(3)) : null,
      matchedPreferredDist: isFinite(matchedPreferredDist) ? Number(matchedPreferredDist.toFixed(3)) : null,
      currentGroupsCount: currentGroups.length, hitsTotal: hits.length,
      hitsWithSlot: hits.map((h) => {
        let o = h.object;
        while (o && !(o.userData && o.userData.slotId != null)) o = o.parent;
        return o ? { slotId: o.userData.slotId, wallIndex: o.userData.wallIndex, dist: Number(h.distance.toFixed(3)) } : null;
      }).filter(Boolean).slice(0, 8)
    }));
    return result;
  }

  // "Que SUPERFÍCIE do ambiente (piso/parede) está embaixo do ponteiro" —
  // contraparte de pickAssemblyAt (que só enxerga MÓDULOS). Usado por
  // portal.js pra: (a) duplo toque numa parede enquadrar ela de frente e
  // duplo toque no piso ir pra vista de cima (pedido 2026-08-08, iPad);
  // (b) descobrir onde soltar um módulo arrastado da biblioteca — se o dedo/
  // mouse soltou em cima do piso, o módulo vira ilha (placement='floor'); se
  // soltou numa parede, vira módulo de parede.
  // Devolve { kind:'floor'|'wall', wallIndex, point:{x,y,z} } ou null.
  //
  // ignoreSlotId (2026-08-08, 3ª rodada — relato do usuário: "movel nao ta indo
  // da parede pro piso"): torna UM módulo transparente pra este teste. Era
  // exatamente o bug — durante o arraste, o módulo acompanha o ponteiro, então
  // a caixa de clique dele está SEMPRE entre a câmera e o piso; o laço abaixo
  // via "tem móvel na frente" e devolvia null a cada frame, e a conversão
  // parede→chão (que depende deste retorno) nunca disparava. Passando o slot
  // em arraste aqui, o raio enxerga o ambiente atrás dele.
  function pickRoomSurfaceAt(clientX, clientY, ignoreSlotId) {
    if (!renderer || !camera || !_raycaster || !currentGroups.length) return null;
    _raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
    const hits = _raycaster.intersectObjects(currentGroups, true);
    for (let i = 0; i < hits.length; i++) {
      const obj = hits[i].object;
      if (obj && obj.userData && obj.userData.isRoomSurface) {
        return {
          kind: obj.userData.roomSurfaceKind || 'wall',
          wallIndex: obj.userData.wallIndex,
          point: { x: hits[i].point.x, y: hits[i].point.y, z: hits[i].point.z }
        };
      }
      // Um MÓDULO na frente da superfície ganha — clicar num móvel nunca deve
      // ser lido como "cliquei no piso/parede atrás dele". Menos o ignorado.
      let p = obj;
      while (p) {
        if (p.userData && p.userData.slotId != null) {
          if (ignoreSlotId != null && p.userData.slotId === ignoreSlotId) break; // atravessa este
          return null;
        }
        p = p.parent;
      }
    }
    return null;
  }

  // Projeta um ponto do MUNDO 3D pras coordenadas de tela (client) do canvas —
  // usado pelos botões flutuantes de Duplicar/Remover (2026-08-08, 3ª rodada),
  // que são elementos DOM de verdade posicionados em cima do módulo
  // selecionado. Devolve null se o ponto estiver ATRÁS da câmera (z do NDC
  // fora de [-1,1]), senão os botões apareceriam espelhados quando o usuário
  // gira a cena pra trás do móvel.
  function worldToClient(point) {
    if (!renderer || !camera) return null;
    const v = new THREE.Vector3(point.x, point.y, point.z).project(camera);
    if (v.z < -1 || v.z > 1) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + (v.x + 1) / 2 * rect.width,
      y: rect.top + (-v.y + 1) / 2 * rect.height
    };
  }

  function intersectPlaneAtClient(clientX, clientY, planeOrigin, planeNormal) {
    if (!renderer || !camera || !_raycaster) return null;
    _raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      new THREE.Vector3(planeNormal.x, planeNormal.y, planeNormal.z),
      new THREE.Vector3(planeOrigin.x, planeOrigin.y, planeOrigin.z)
    );
    const target = new THREE.Vector3();
    const hit = _raycaster.ray.intersectPlane(plane, target);
    return hit ? { x: target.x, y: target.y, z: target.z } : null;
  }

  // Zoom to cursor (pedido do usuário 2026-07-29) — acha o ponto do MUNDO 3D
  // embaixo do cursor (acerta a geometria de verdade quando dá, senão cai
  // pro plano que passa pelo alvo da órbita de frente pra câmera — sempre
  // bem definido, cobre o caso do usuário apontando pro vazio acima/abaixo
  // do móvel, ex. perto da linha do teto) e escala TANTO a câmera quanto o
  // alvo da órbita em direção a esse ponto pelo mesmo fator. Matemática
  // clássica de "zoom to cursor": como a direção câmera→alvo não muda (só o
  // comprimento), o ângulo de qualquer ponto em relação a essa direção
  // também não muda — o ponto sob o cursor fica visualmente PARADO na tela
  // enquanto a distância de órbita encolhe/cresce. controls.update() (fim da
  // função) já recalcula a esfera a partir de (camera.position - target) e
  // reaplica o clamp de minDistance/maxDistance sozinho, então não precisa
  // repetir esse clamp aqui.
  function zoomTowardClient(clientX, clientY, factor) {
    if (!_raycaster || !camera || !controls) return;
    lastUserCameraTouchAt = Date.now(); // ver comentário de lastUserCameraTouchAt lá em cima
    // ORTOGRÁFICA não tem "chegar perto": aproximar a câmera não muda o
    // tamanho aparente. Quem dá zoom é o frustum. Mantém o ponto sob o cursor
    // parado do mesmo jeito — só que movendo o ALVO em vez da câmera.
    if (camera.isOrthographicCamera) {
      const antes = ndcParaMundoOrto(clientX, clientY);
      camera.zoom = Math.max(0.02, Math.min(80, camera.zoom / factor));
      camera.updateProjectionMatrix();
      const depois = ndcParaMundoOrto(clientX, clientY);
      if (antes && depois) {
        const delta = new THREE.Vector3().subVectors(antes, depois);
        camera.position.add(delta);
        controls.target.add(delta);
      }
      controls.update();
      return;
    }
    _raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
    let point = null;
    if (currentGroups.length) {
      const hits = _raycaster.intersectObjects(currentGroups, true);
      if (hits.length) point = hits[0].point;
    }
    if (!point) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, controls.target);
      const hitPoint = new THREE.Vector3();
      point = _raycaster.ray.intersectPlane(plane, hitPoint) ? hitPoint : controls.target.clone();
    }
    const camOffset = new THREE.Vector3().subVectors(camera.position, point);
    const targetOffset = new THREE.Vector3().subVectors(controls.target, point);
    camera.position.copy(point).add(camOffset.multiplyScalar(factor));
    controls.target.copy(point).add(targetOffset.multiplyScalar(factor));
    // ---- Por que o zoom "escorregava" (2026-08-12) ----
    // "o zoom aqui no computador sempre ta levando pra baixo do ponteiro do
    // mouse. acho que e uma limitacao da camera."
    // Era o clamp de minDistance: a matemática acima aproxima câmera E alvo do
    // ponto pelo mesmo fator, o que mantém o ponto parado na tela — MAS o
    // controls.update() logo abaixo empurra a câmera de volta assim que a
    // distância bate no mínimo, e aí o ponto sob o cursor sai andando. Com
    // minDistance grande (0.3 = 30cm, herdado do visualizador de UM módulo)
    // isso começava a acontecer bem antes de "chegar perto do móvel".
    //
    // minDistance agora é 0.05 (ver init) — o clamp só entra quando o nariz da
    // câmera está de fato encostando na peça.
    controls.update();
  }

  // Centraliza a órbita num ponto do mundo SEM girar a cena: move o alvo e a
  // câmera pelo MESMO vetor (é um pan, não um giro), então a direção do olhar
  // não muda — o que estava sendo olhado desliza pro meio da tela e passa a
  // ser o eixo do giro.
  //
  // Pedido do Matt (2026-08-12): "quero chegar bem perto e rotacionar perto do
  // movel sem perder ele do centro da tela". Girar em torno do alvo antigo
  // (normalmente o centro do AMBIENTE) joga o móvel pra fora da tela assim que
  // se está perto dele — o raio da órbita é grande demais.
  function centerOrbitOn(point) {
    if (!controls || !camera || !point) return;
    const delta = new THREE.Vector3(point.x, point.y, point.z).sub(controls.target);
    controls.target.add(delta);
    camera.position.add(delta);
    controls.update();
  }

  // Mesmo que centerOrbitOn, mas a partir de um Group (usa o centro da caixa
  // que o contém) — é o que portal.js tem em mãos ao selecionar um módulo.
  function centerOrbitOnGroup(group) {
    if (!group) return;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const c = new THREE.Vector3();
    box.getCenter(c);
    centerOrbitOn({ x: c.x, y: c.y, z: c.z });
  }

  // ENQUADRAR UM MÓDULO DE FRENTE (2026-08-13) — duplo clique nele.
  // "achando que dar 2 cliques no modulo cliques rapidos, ele centraliza
  // frontal esse modulo pra poder ser visto mexido rotacionado."
  // A distância sai do TAMANHO do módulo (esfera que o contém / tan(fov/2)),
  // a mesma conta do enquadramento automático da cena — assim um nicho de
  // 400mm e um closet de 2,4m ficam ambos preenchendo a tela, e o alvo da
  // órbita passa a ser ele (girar acontece em volta do móvel, não do ambiente).
  function frameGroupFront(group, dir) {
    if (!group || !camera || !controls) return;
    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const c = new THREE.Vector3(); box.getCenter(c);
    const esfera = box.getBoundingSphere(new THREE.Sphere());
    const fov = (camera.fov * Math.PI) / 180;
    // 1.6 = respiro em volta do módulo (sem isso ele encosta nas bordas).
    const dist = Math.max((esfera.radius * 1.6) / Math.tan(fov / 2), 0.35);
    frameDirection(dir, { x: c.x, y: c.y, z: c.z }, dist);
  }

  // Zoom por BOTÃO (2026-08-08, etapa 2 do redesenho — a barra flutuante do
  // canvas tem + e −). Converge pro CENTRO do canvas, não pro alvo da órbita:
  // é o que a pessoa espera de um botão de zoom (o que está no meio da tela
  // continua no meio). Reaproveita zoomTowardClient, a mesma função do scroll
  // e da pinça — nenhuma matemática de câmera nova.
  // factor < 1 aproxima, > 1 afasta (mesma convenção de zoomTowardClient).
  function zoomByStep(factor) {
    if (!renderer || !controls || !controls.enabled) return;
    const rect = renderer.domElement.getBoundingClientRect();
    zoomTowardClient(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function handleZoomWheel(event) {
    event.preventDefault();
    if (!controls || !controls.enabled || !camera || !renderer) return;
    // Mesma escala por "notch" que o OrbitControls nativo usava (getZoomScale
    // interna dele, ver OrbitControls.js) — só o PONTO de convergência muda.
    const zoomScale = Math.pow(0.95, controls.zoomSpeed || 1);
    if (event.deltaY < 0) zoomTowardClient(event.clientX, event.clientY, zoomScale);
    else if (event.deltaY > 0) zoomTowardClient(event.clientX, event.clientY, 1 / zoomScale);
  }

  // Pinça de 2 dedos (touch) — mesma ideia do wheel acima, só que ancorada
  // no PONTO MÉDIO entre os 2 dedos em vez da posição do mouse, e a "escala"
  // vem da razão entre a distância ATUAL entre os dedos e a do frame
  // anterior (não um "notch" fixo — cada touchmove já traz o quanto os
  // dedos se moveram desde o último). _pinchLastDist null = não tem pinça em
  // andamento (0 ou 1 dedo, ou acabou de começar). PAN de 2 dedos continua
  // rodando via OrbitControls nativo em paralelo (ver comentário em init()),
  // então arrastar+pinçar ao mesmo tempo funciona igual um app de mapa.
  let _pinchLastDist = null;
  function touchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function handleTouchStartZoom(event) {
    _pinchLastDist = (event.touches.length === 2) ? touchDistance(event.touches) : null;
  }
  function handleTouchMoveZoom(event) {
    if (!controls || !controls.enabled || !camera || !renderer) return;
    if (event.touches.length !== 2) return;
    const dist = touchDistance(event.touches);
    if (_pinchLastDist === null || !_pinchLastDist) { _pinchLastDist = dist; return; }
    const ratio = dist / _pinchLastDist;
    _pinchLastDist = dist;
    if (!isFinite(ratio) || Math.abs(ratio - 1) < 0.0005) return;
    const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    // Dedos se afastando (ratio > 1) = zoom IN = factor < 1 (mesma convenção
    // de zoomTowardClient) — por isso 1/ratio, não ratio.
    zoomTowardClient(midX, midY, 1 / ratio);
  }
  function handleTouchEndZoom(event) {
    if (event.touches.length < 2) _pinchLastDist = null;
  }

  // Contorno vermelho de destaque (pedido do usuário, 2026-07-26: "quero que
  // quando o mouse passe em cima do modulo ele fique contorno vermelho...
  // nao sei qual modulo estou selecionando"). THREE.BoxHelper desenha um
  // wireframe ao redor da bounding box de QUALQUER Object3D — reaproveitado
  // (não recriado) entre chamadas via setFromObject, que reatribui o objeto
  // rastreado E recalcula a caixa de uma vez só. depthTest:false garante que
  // o contorno sempre aparece por CIMA das peças (não "afunda" atrás de uma
  // porta/prateleira mais perto da câmera), já que é só um indicador de UI,
  // não geometria real da cena.
  // Caixa do que está DESENHADO — sem a caixa invisível de clique.
  let hoverBoxAlvo = null;
  function caixaSemHitbox(group) {
    const b = new THREE.Box3();
    const tmp = new THREE.Box3();
    group.updateMatrixWorld(true);
    group.traverse((o) => {
      if (!o.isMesh || (o.userData && o.userData.isHitboxProxy)) return;
      tmp.setFromObject(o);
      if (!tmp.isEmpty()) b.union(tmp);
    });
    return b.isEmpty() ? new THREE.Box3().setFromObject(group) : b;
  }
  // Mesma ordem de cantos que THREE.BoxHelper.update() escreve.
  function escreveCaixaNoHelper(helper, caixa) {
    if (!helper || !helper.geometry || caixa.isEmpty()) return;
    const min = caixa.min, max = caixa.max;
    const pos = helper.geometry.attributes.position;
    const a = pos.array;
    a[0] = max.x; a[1] = max.y; a[2] = max.z;
    a[3] = min.x; a[4] = max.y; a[5] = max.z;
    a[6] = min.x; a[7] = min.y; a[8] = max.z;
    a[9] = max.x; a[10] = min.y; a[11] = max.z;
    a[12] = max.x; a[13] = max.y; a[14] = min.z;
    a[15] = min.x; a[16] = max.y; a[17] = min.z;
    a[18] = min.x; a[19] = min.y; a[20] = min.z;
    a[21] = max.x; a[22] = min.y; a[23] = min.z;
    pos.needsUpdate = true;
    helper.geometry.computeBoundingSphere();
  }

  function setHoverHighlight(group) {
    if (!scene) return;
    if (!group) {
      if (hoverBoxHelper) hoverBoxHelper.visible = false;
      hoverBoxAlvo = null;
      return;
    }
    if (!hoverBoxHelper) {
      hoverBoxHelper = new THREE.BoxHelper(group, 0xff0000);
      hoverBoxHelper.material.depthTest = false;
      hoverBoxHelper.material.linewidth = 2;
      hoverBoxHelper.renderOrder = 999;
      // Tag pro teste de AR — ver comentário em buildDimensionAnnotations.
      hoverBoxHelper.name = 'ar-export-exclude';
      scene.add(hoverBoxHelper);
    }
    // O CONTORNO IGNORA A CAIXA DE CLIQUE (2026-08-13).
    //
    // BoxHelper.setFromObject(group) inclui TODOS os filhos — e um deles é a
    // caixa invisível de clique (isHitboxProxy), que tem folga de propósito.
    // Resultado: o contorno vermelho nascia alguns milímetros maior que o
    // móvel e "passava" das peças. Ele é a única régua visual que a pessoa tem
    // pra saber onde o módulo começa e termina; ele precisa ser a GEOMETRIA
    // desenhada, nada além dela.
    //
    // BoxHelper.update() SEMPRE recalcula a partir de this.object e não aceita
    // uma caixa pronta — então os 8 cantos são escritos na mão, na mesma ordem
    // que ele usa (ver escreveCaixaNoHelper). O group fica guardado em
    // hoverBoxAlvo pra updateHoverHighlight refazer a conta durante o arraste.
    hoverBoxAlvo = group;
    escreveCaixaNoHelper(hoverBoxHelper, caixaSemHitbox(group));
    hoverBoxHelper.visible = true;
  }

  // Atualiza o contorno SEM trocar de objeto rastreado (mais barato que
  // setFromObject) — chamado a cada pointermove de um arraste de MOVER (ver
  // portal.js), que já reposiciona o Group ao vivo sem reconstruir a cena;
  // sem isso o contorno ficaria "preso" na posição de quando o hover
  // começou, em vez de acompanhar o módulo sendo arrastado.
  function updateHoverHighlight() {
    if (!hoverBoxHelper || !hoverBoxHelper.visible) return;
    // Mesma caixa filtrada do setHoverHighlight — chamar update() aqui traria
    // a caixa de clique de volta e o contorno voltaria a sobrar.
    if (hoverBoxAlvo) escreveCaixaNoHelper(hoverBoxHelper, caixaSemHitbox(hoverBoxAlvo));
    else hoverBoxHelper.update();
  }

  // Contorno de um GRUPO inteiro (2026-09-03, seleção múltipla/grupo —
  // Ctrl+clique ou grupo salvo, ver projectMultiSelectIds em portal-06a).
  // Virou UM BLOCO SÓ (2026-09-04, pedido do usuário: "quando vou
  // selecionar ele seleciona os componentes do grupo, quero que fique um
  // bloco grande vermelho selecionado, nao individualmente como esta
  // acontecendo") — antes era um BoxHelper POR módulo (caixa individual em
  // cada peça), o que lia como "vários selecionados", não "um grupo".
  // Agora é a caixa UNIÃO de todos os membros escrita num único
  // BoxHelper — mesma técnica de setHoverHighlight (caixa escrita na mão
  // pra ignorar a hitbox invisível de clique), só que a união de vários
  // Object3D em vez de um só. O contorno ÚNICO (setHoverHighlight) continua
  // existindo por cima, cuidando do módulo "principal" clicado
  // normalmente. groups = array de Object3D (vazio ou null apaga tudo).
  let multiHighlightHelper = null;
  let multiHighlightGroups = [];
  function uniaoDeGrupos(groups) {
    const b = new THREE.Box3();
    groups.forEach((g) => { if (g) b.union(caixaSemHitbox(g)); });
    return b;
  }
  function setMultiHighlight(groups) {
    if (!scene) return;
    multiHighlightGroups = (groups || []).filter(Boolean);
    if (!multiHighlightGroups.length) {
      if (multiHighlightHelper) multiHighlightHelper.visible = false;
      return;
    }
    if (!multiHighlightHelper) {
      multiHighlightHelper = new THREE.BoxHelper(multiHighlightGroups[0], 0xff0000);
      multiHighlightHelper.material.depthTest = false;
      multiHighlightHelper.material.linewidth = 2.5;
      multiHighlightHelper.renderOrder = 999;
      multiHighlightHelper.name = 'ar-export-exclude';
      scene.add(multiHighlightHelper);
    }
    escreveCaixaNoHelper(multiHighlightHelper, uniaoDeGrupos(multiHighlightGroups));
    multiHighlightHelper.visible = true;
  }
  // Recalcula a união SEM trocar de grupo rastreado (mesmo espírito de
  // updateHoverHighlight) — chamado a cada pointermove de um co-arraste de
  // grupo (portal-08-projetos-paredes.js), que já reposiciona os Groups ao
  // vivo sem reconstruir a cena; sem isto o bloco grande ficaria "preso" no
  // tamanho/posição de quando a seleção começou, em vez de acompanhar o
  // grupo sendo arrastado.
  function updateMultiHighlight() {
    if (!multiHighlightHelper || !multiHighlightHelper.visible || !multiHighlightGroups.length) return;
    escreveCaixaNoHelper(multiHighlightHelper, uniaoDeGrupos(multiHighlightGroups));
  }

  // Acha de volta o Group de um slotId específico dentro da cena ATUAL —
  // usado pra "readotar" o contorno de destaque depois de qualquer
  // reconstrução completa (renderFreeformWalls troca TODOS os Groups por
  // instâncias novas — o Group antigo que o contorno rastreava não existe
  // mais na cena, ver renderProjectCanvasFrontCorner em portal.js, que
  // rechama isto depois de cada render pra manter o destaque em sincronia).
  function findGroupBySlotId(slotId) {
    for (let i = 0; i < currentGroups.length; i++) {
      const g = currentGroups[i];
      if (g && g.userData && g.userData.slotId === slotId) return g;
    }
    return null;
  }

  // Recoloca a CÂMERA numa direção específica mantendo o alvo da órbita e a
  // distância atuais (pedido do usuário 2026-08-08, iPad: "duplo clique na
  // parede ele mostra a parede de frente. duplo clique no chao mostra vista de
  // cima"). Não é um reenquadramento (não recalcula bounding box nem zoom) —
  // só GIRA em volta do que já está enquadrado, então o usuário não perde o
  // zoom que tinha. dir = vetor (mundo) de onde a câmera deve olhar PRA o
  // alvo, ex.: {x:0,y:1,z:0.001} = de cima; -intoDir da parede = de frente
  // pra ela. target (opcional) recentraliza a órbita antes de girar.
  // distOverride (2026-08-13): sem ele a câmera mantém a distância que já
  // tinha, que é o certo pra "vira de frente pra esta parede". Pra enquadrar
  // UM módulo (duplo clique) a distância precisa vir do tamanho DELE, senão
  // ele aparece minúsculo no meio da tela.
  function frameDirection(dir, target, distOverride) {
    if (!camera || !controls) return;
    const t = target
      ? new THREE.Vector3(target.x, target.y, target.z)
      : controls.target.clone();
    const dist = (distOverride > 0)
      ? distOverride
      : (camera.position.distanceTo(controls.target) || 3);
    const d = new THREE.Vector3(dir.x, dir.y, dir.z);
    if (d.lengthSq() < 1e-9) return;
    d.normalize();
    controls.target.copy(t);
    camera.position.copy(t).addScaledVector(d, dist);
    camera.lookAt(t);
    controls.update();
  }

  // ---------- Setas de redimensionamento em 3D ----------
  // Pedido do usuário (2026-08-08, iPad): "clique rapido no modulo (tela
  // travada) mantem o vermelho envolta pra mostrar que esta selecionado, ele
  // abre setas pra redimencionamento nos sentidos permitidos". No mouse o
  // redimensionamento é por AGARRAR a borda do módulo (classifyProject3DGrab
  // em portal.js) — no dedo isso é impreciso demais e não tem cursor pra
  // avisar que ali estica, então o toque ganha alças VISÍVEIS de verdade.
  //
  // Quem decide QUAIS setas existem e ONDE elas ficam é portal.js (só ele
  // conhece a geometria da parede e os limites min/max de cada módulo) — aqui
  // só desenhamos e devolvemos qual foi tocada. spec = [{ axis, position:
  // {x,y,z}, dir:{x,y,z} }] (axis é a string opaca devolvida por
  // pickResizeArrowAt, ex. 'width-left'); null/[] apaga todas.
  let resizeArrowGroup = null;
  // CORES DA SETA (2026-08-13) — pedido do Matt, depois de o cursor especial
  // não resolver a sensação de imprecisão: "deixa o mouse sempre com o cursor
  // triangulo padrao. mas quando estiver em cima de uma das setas do movel ela
  // pode mudar de cor. vermelho azul e verde conforme o sentido dela. quando
  // ela se destacar com a cor ai sim saberei que posso clicar nela e
  // arrastar".
  //
  // Parada, a seta é cinza discreta — ela é alça, não decoração. Sob o
  // ponteiro, acende na cor do EIXO, na convenção universal de 3D (X vermelho,
  // Y verde, Z azul), que é também "largura / altura / profundidade" aqui.
  const RESIZE_ARROW_COLOR = 0x8a8580;
  const RESIZE_ARROW_AXIS_COLOR = {
    'width-left': 0xd8442f, 'width-right': 0xd8442f,   // X — vermelho
    'height-top': 0x2e9e5b,                             // Y — verde
    'depth-front': 0x2f6fd8                             // Z — azul
  };
  // Qual seta está acesa agora (string do eixo) — evita repintar a cada
  // pointermove quando nada mudou.
  let resizeArrowHot = null;
  // alvoGeneroso: no DEDO a área de toque precisa ser bem maior que a seta
  // desenhada; no MOUSE isso vira imprecisão — o ponteiro "pega" a seta a
  // 8cm de distância dela e o cliente sente que perdeu o controle fino
  // (Matt, 2026-08-13: "levo o mouse bem longe e mesmo assim ele fica como
  // se tivesse pegando... isso e horrivel pra usabilidade"). Quem informa é
  // portal.js, que sabe se o dispositivo é de toque.
  function setResizeArrows(spec, alvoGeneroso) {
    if (!scene) return;
    if (resizeArrowGroup) {
      scene.remove(resizeArrowGroup);
      disposeObject3D(resizeArrowGroup);
      resizeArrowGroup = null;
    }
    if (!spec || !spec.length) return;
    const group = new THREE.Group();
    group.name = 'ar-export-exclude';
    const shaftLen = 0.10, shaftR = 0.014, headLen = 0.075, headR = 0.038;
    // depthTest:false + renderOrder alto: a seta é UI, precisa aparecer por
    // cima do módulo mesmo estando geometricamente dentro dele.
    spec.forEach((item) => {
      // Material POR SETA (antes era um só compartilhado): acender uma sem
      // acender as outras exige cor própria em cada.
      const mat = new THREE.MeshBasicMaterial({ color: RESIZE_ARROW_COLOR, depthTest: false });
      const arrow = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 12), mat);
      shaft.position.y = shaftLen / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 16), mat);
      head.position.y = shaftLen + headLen / 2;
      // Alvo de toque generoso e invisível em volta da seta inteira — no dedo,
      // acertar um cone de 4cm é frustrante.
      // 2.2 era generoso DEMAIS (2026-08-13, iPad): o cilindro invisível ficava
      // com ~8cm de raio em volta de cada seta, encostando no módulo — tocar
      // perto da borda pra selecionar agarrava a seta e começava a esticar sem
      // nenhum aviso na tela. 1.6 continua confortável no dedo (o alvo fica com
      // ~6cm de diâmetro, acima do mínimo de toque) sem invadir o móvel.
      const fatorAlvo = alvoGeneroso ? 1.6 : 1.15;
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(headR * fatorAlvo, headR * fatorAlvo, shaftLen + headLen, 8),
        new THREE.MeshBasicMaterial({ visible: false, depthTest: false })
      );
      hit.position.y = (shaftLen + headLen) / 2;
      arrow.add(shaft); arrow.add(head); arrow.add(hit);
      arrow.renderOrder = 998;
      arrow.traverse((o) => { o.renderOrder = 998; o.userData.resizeAxis = item.axis; });
      arrow.userData.resizeAxis = item.axis;
      // Cilindro/cone do Three.js nascem apontando pra +Y — gira até apontar
      // pra dir.
      const d = new THREE.Vector3(item.dir.x, item.dir.y, item.dir.z).normalize();
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      arrow.position.set(item.position.x, item.position.y, item.position.z);
      arrow.userData.arrowMaterial = mat;
      group.add(arrow);
    });
    resizeArrowGroup = group;
    resizeArrowHot = null;
    scene.add(group);
  }

  // Acende a seta do eixo dado (null apaga todas). Chamada pelo hover de
  // portal.js — é o único aviso de "dá pra agarrar aqui", já que o cursor
  // agora fica sempre no triângulo padrão.
  function highlightResizeArrow(axis) {
    if (!resizeArrowGroup) { resizeArrowHot = null; return; }
    if (resizeArrowHot === axis) return;
    resizeArrowHot = axis || null;
    resizeArrowGroup.children.forEach((arrow) => {
      const mat = arrow.userData && arrow.userData.arrowMaterial;
      if (!mat) return;
      const aceso = !!axis && arrow.userData.resizeAxis === axis;
      mat.color.setHex(aceso
        ? (RESIZE_ARROW_AXIS_COLOR[arrow.userData.resizeAxis] || RESIZE_ARROW_COLOR)
        : RESIZE_ARROW_COLOR);
    });
  }

  // ---------- Prévia de onde o móvel vai cair ----------
  // Pedido do usuário (2026-08-08, iPad): "mostrar a area vermelha onde estiver
  // arrastando quando chegar no ambiente, mostrando onde vai ficar o movel
  // apos soltar o clique". Vale principalmente pro arraste vindo da
  // BIBLIOTECA: ali o módulo ainda não existe na cena, então não há nada
  // vermelho pra acompanhar o dedo — o cliente arrastava às cegas e só
  // descobria onde caiu depois de soltar.
  //
  // Desenha uma caixa de arestas (EdgesGeometry) do tamanho REAL do módulo,
  // mais um retângulo achatado no chão logo abaixo dela (a "sombra"/pegada,
  // que é o que dá a leitura de posição no piso — só a caixa flutuando é
  // ambígua em perspectiva). spec = { width_m, height_m, depth_m, position:
  // {x,y,z} (centro em X/Z, BASE em Y), rotationY }; null apaga.
  let dropPreviewGroup = null;
  const DROP_PREVIEW_COLOR = 0xd8442f;
  function setDropPreview(spec) {
    if (!scene) return;
    if (dropPreviewGroup) {
      scene.remove(dropPreviewGroup);
      disposeObject3D(dropPreviewGroup);
      dropPreviewGroup = null;
    }
    if (!spec) return;
    const w = Math.max(Number(spec.width_m) || 0.01, 0.01);
    const h = Math.max(Number(spec.height_m) || 0.01, 0.01);
    const d = Math.max(Number(spec.depth_m) || 0.01, 0.01);
    const group = new THREE.Group();
    group.name = 'ar-export-exclude';
    // depthTest:false — é indicador de UI, tem que aparecer por cima do móvel
    // que estiver na frente, senão some justamente quando mais importa (o
    // cliente arrastando pra um lugar já ocupado).
    const mat = new THREE.LineBasicMaterial({ color: DROP_PREVIEW_COLOR, depthTest: false });
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), mat
    );
    box.position.y = h / 2;
    group.add(box);
    // Pegada no chão (y≈0), relativa à BASE do módulo.
    const foot = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)),
      new THREE.LineBasicMaterial({ color: DROP_PREVIEW_COLOR, depthTest: false })
    );
    foot.rotation.x = -Math.PI / 2;
    foot.position.y = -(Number(spec.position.y) || 0) + 0.002;
    group.add(foot);

    group.traverse((o) => { o.renderOrder = 997; });
    group.rotation.y = Number(spec.rotationY) || 0;
    group.position.set(spec.position.x, Number(spec.position.y) || 0, spec.position.z);
    dropPreviewGroup = group;
    scene.add(group);
  }

  // Qual seta de redimensionamento está embaixo do ponteiro (ou null).
  // Raycast SÓ no grupo das setas — elas ficam por cima de tudo, então
  // precisam ser testadas ANTES de pickAssemblyAt no pointerdown (ver
  // attachProject3DEditDrag em portal.js).
  function pickResizeArrowAt(clientX, clientY) {
    if (!resizeArrowGroup || !renderer || !camera || !_raycaster) return null;
    _raycaster.setFromCamera(ndcFromClient(clientX, clientY), camera);
    const hits = _raycaster.intersectObject(resizeArrowGroup, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj) {
      if (obj.userData && obj.userData.resizeAxis) return { axis: obj.userData.resizeAxis };
      obj = obj.parent;
    }
    return null;
  }

  // Devolve a THREE.Scene bruta desta instância — teste de exportação AR
  // (2026-08-01, "colocar o móvel no ambiente real"): generateArGlbForProject
  // (portal.js) usa isto pra rodar o THREE.GLTFExporter em cima da MESMA
  // cena já montada (nenhuma peça/posição/cor duplicada), igual snapshot()
  // já faz pra imagem PNG. Só leitura — quem chamar não deve mutar a cena.
  function getScene() {
    return scene;
  }

  // Estado atual da câmera (posição + alvo + fov/aspect) em JSON puro —
  // Foto realista (js/photoreal.js, 2026-08-03): o path tracer roda numa
  // cena PRÓPRIA em three moderno (r181), então não dá pra passar o objeto
  // THREE.Camera direto (instâncias de versões diferentes); números crus
  // funcionam porque o MUNDO é o mesmo (mesma geometria de parede/módulo em
  // metros). Inclui qualquer orbit/zoom manual que o usuário fez (pedido:
  // "a foto deve pegar a camera do posicionamento do 3d").
  function getCameraState() {
    if (!camera) return null;
    const t = (controls && controls.target) ? controls.target : lastFitTarget;
    if (!t) return null;
    const state = {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: t.x, y: t.y, z: t.z },
      fov: camera.fov || 35,
      aspect: camera.aspect || (4 / 3),
      // Ver lastUserCameraTouchAt — 0 quando esta câmera nunca recebeu um
      // gesto manual do usuário nesta sessão (só enquadramento automático).
      touchedAt: lastUserCameraTouchAt
    };
    // ORTOGRÁFICA/Paralela (2026-08-26, Matt: "a foto realista gerada no
    // portal, nao esta respeitando a posicao escolhida da camera... ela
    // sempre traz so uma posicao fixa"). Em modo Paralelo (setCameraProjection,
    // a projeção que a marcenaria usa pra conferir alinhamento) o zoom NÃO
    // aproxima a câmera do alvo — quem muda é o FRUSTUM (camera.zoom, ver
    // zoomTowardClient: "ortográfica não tem 'chegar perto'... quem dá zoom é
    // o frustum"). position/target quase não se mexem nesse zoom (só a
    // correção pra manter o ponto sob o cursor parado) — sem avisar disso,
    // quem chama getCameraState (Foto realista) descartava o zoom de
    // verdade que o usuário deu e sempre montava a foto a partir de uma
    // posição perto do enquadramento automático inicial, não importa o
    // quanto o usuário tivesse se aproximado em Paralelo. orthoHeight = altura
    // visível em METROS de mundo (top-bottom já vêm em unidades de mundo,
    // zoom é o fator de aproximação) — o suficiente pra quem monta a câmera
    // do outro lado (photoreal.js) reconstruir o mesmo enquadramento.
    if (camera.isOrthographicCamera) {
      state.isOrthographic = true;
      state.orthoHeight = (camera.top - camera.bottom) / (camera.zoom || 1);
    }
    return state;
  }

  return {
    init, available, render, renderFreeform, renderFreeformWalls, snapshot, canvasAspectRatio,
    getCameraState,
    // Estado próprio de porta/gaveta da composição — ver comentário de
    // currentOpenables/doorsOpen acima. portal.js relê areDoorsOpen()/
    // areDrawersOpen() antes de reconstruir cada assembly (generateComposition3D),
    // pra um módulo novo/recolorido nascer já no estado atual em vez de
    // sempre fechado.
    toggleDoors, toggleDrawers, areDoorsOpen, areDrawersOpen,
    // Junção automática de rodapé entre módulos adjacentes (migration 137) —
    // override de sessão do botão "Encaixe" (ver portal-08-projetos-
    // paredes.js). Estado PRÓPRIO desta instância, mesma convenção de
    // doorsOpen/drawersOpen acima.
    toggleAutoJoinBaseboards, areBaseboardsAutoJoined,
    // Interatividade (ver bloco de comentário grande acima) — só usado pela
    // instância ViewerProjectEdit (portal.js); Composição/ViewerProject
    // (preview) nunca chamam nenhum destes.
    setControlsEnabled, getDomElement, pickAssemblyAt, intersectPlaneAtClient,
    setHoverHighlight, updateHoverHighlight, findGroupBySlotId, setMultiHighlight, updateMultiHighlight,
    // Ambiente sólido + câmera dirigida (2026-08-08) — ver comentários de
    // pickRoomSurfaceAt / frameDirection / setResizeArrows.
    pickRoomSurfaceAt, frameDirection, setResizeArrows, pickResizeArrowAt,
    setDropPreview,
    // 3ª rodada (2026-08-08) — ver pickAssemblyAtSticky (seleção que não pula
    // pro vizinho no dedo) e worldToClient (botões DOM sobre o módulo).
    // Projeção da câmera (2026-08-13): 'paralela' (ortográfica) x 'perspectiva'.
    setCameraProjection, getCameraProjection,
    pickAssemblyAtSticky, worldToClient, zoomByStep, highlightResizeArrow,
    // Diagnóstico (ver debugScreenRects) — chamável pelo console via
    // window.__legnoViewerEdit.debugScreenRects().
    debugScreenRects,
    // Retângulo do piso desenhado (ver lastFloorRectM) — quem trava a ilha
    // dentro do ambiente usa este, não uma estimativa própria.
    getFloorRectM: function () { return lastFloorRectM ? Object.assign({}, lastFloorRectM) : null; },
    // Girar em torno do módulo selecionado (2026-08-12) — ver centerOrbitOn.
    centerOrbitOn, centerOrbitOnGroup, frameGroupFront,
    // Teste AR (2026-08-01) — ver comentário de getScene acima.
    getScene
  };
}

// ViewerComposition continua sendo a MESMA instância global de sempre
// (Composição) — createInstance (novo, aditivo) deixa portal.js criar uma
// instância TOTALMENTE separada (renderer/scene/estado de portas próprios)
// pra qualquer outro canvas 3D independente, ex. ViewerProject na aba
// Projetos (ver renderFreeform acima).
const ViewerComposition = createViewerComposition3D();
ViewerComposition.createInstance = createViewerComposition3D;
// fim de viewer3d_composition.js
