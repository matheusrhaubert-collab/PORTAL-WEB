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
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.3;
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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
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
    renderer.render(scene, camera);
  }

  function disposeObject3D(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      // .map (usado pelos sprites de texto das medidas, ver buildDimensionAnnotations)
      // também precisa dispose senão a textura do canvas vaza a cada re-render.
      materials.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
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

  // Parede em pé de p0 a p1 (pontos no chão), altura `ceilingH`, com a face
  // visível olhando pra `intoDir` (o vetor "pra dentro do ambiente" que
  // getProjectWallGeometry já define por parede em portal.js). Recuada
  // WALL_SURFACE_BACKOFF_M no sentido CONTRÁRIO ao intoDir pra ficar um fio
  // atrás das linhas de cota e do fundo dos módulos encostados nela.
  const WALL_SURFACE_BACKOFF_M = 0.004;
  function makeWallSurface(p0, p1, ceilingH, intoDir) {
    const widthM = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    const mesh = makeRoomSurface(widthM, ceilingH, WALL_COLOR, false, 'wall');
    const ix = (intoDir && intoDir.x) || 0;
    const iz = (intoDir && intoDir.z) || 0;
    // PlaneGeometry nasce com a normal em +Z; atan2 gira em Y até a normal
    // coincidir com intoDir.
    mesh.rotation.y = Math.atan2(ix, iz);
    mesh.position.set(
      (p0.x + p1.x) / 2 - ix * WALL_SURFACE_BACKOFF_M,
      ceilingH / 2,
      (p0.z + p1.z) / 2 - iz * WALL_SURFACE_BACKOFF_M
    );
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
      group.add(makeFloorSurface(-wallW / 2, wallW / 2, 0, floorDepth));
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
    if (room.ceilingLabel && !room.minimal) {
      const label = makeTextSprite(room.ceilingLabel);
      label.position.set(0, ceilingH + 0.11, 0.05);
      group.add(label);
    }

    // Linha tracejada da altura máxima + baseboard tracejado — pulados em
    // modo minimal (só chão + teto, ver comentário de room acima).
    if (!room.minimal) {
      // Linha tracejada da altura máxima permitida (teto − 5" − rodapé) —
      // CORREÇÃO (pedido do usuário, 2026-07-16: "to usando o maximo mas
      // ainda nao toca na linha segura", mesmo bug do viewer3d.js/
      // rebuildRoomEnv) — faltava descontar o rodapé (baseH) aqui, então a
      // linha ficava mais alta que o teto efetivo de verdade (mesma conta de
      // ceilingMaxHeightMm() em portal.js) e um módulo na altura MÁXIMA
      // permitida pela régua nunca alcançava esta linha.
      // + MAX_HEIGHT_LINE_RAISE_M: pedido do usuário logo depois ("subir a
      // linha trasejada em 5inches") — só a linha sobe, a régua de altura
      // continua com o mesmo máximo de antes.
      const maxY = ceilingH - CEILING_CLEARANCE_M - baseH + MAX_HEIGHT_LINE_RAISE_M;
      const dashGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-wallW / 2, maxY, 0.003),
        new THREE.Vector3(wallW / 2, maxY, 0.003)
      ]);
      const dashLine = new THREE.Line(dashGeom, new THREE.LineDashedMaterial({
        color: 0xb0503c, dashSize: 0.07, gapSize: 0.05
      }));
      dashLine.computeLineDistances();
      group.add(dashLine);
      if (room.maxHeightLabel) {
        const label = makeTextSprite(room.maxHeightLabel);
        // Deslocado pra DIREITA e num z próprio — centralizado, ele brigava
        // com o sprite do teto (mesmo plano) e aparecia cortado.
        label.position.set(wallW * 0.25, maxY - 0.11, 0.06);
        group.add(label);
      }

      // Baseboard — linha TRACEJADA na altura do topo do rodapé (mesmo
      // estilo da tracejada do teto, só que discreta/cinza pra não confundir
      // com a linha vermelha de limite), correndo a parede inteira.
      if (baseH > 0) {
        const baseGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-wallW / 2, baseH, 0.003),
          new THREE.Vector3(wallW / 2, baseH, 0.003)
        ]);
        const baseLine = new THREE.Line(baseGeom, new THREE.LineDashedMaterial({
          color: 0x8a8378, dashSize: 0.07, gapSize: 0.05
        }));
        baseLine.computeLineDistances();
        group.add(baseLine);
      }
    }

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
      group.add(makeFloorSurface(fx0, fx1, fz0, fz1));
    }

    (segments || []).forEach((seg) => {
      const ax = seg.alongDir.x, az = seg.alongDir.z;
      const margin = seg.margin || 0;
      const p0 = new THREE.Vector3(seg.originX - ax * margin, 0, seg.originZ - az * margin);
      const p1 = new THREE.Vector3(seg.originX + ax * (seg.widthM + margin), 0, seg.originZ + az * (seg.widthM + margin));

      // Superfície sólida desta parede (ver makeWallSurface) — a face visível
      // olha pra intoDir, então vista de FORA do ambiente a parede some
      // (backface culling) e não tapa o projeto. seg.intoDir vem de
      // renderFreeformWalls; sem ele (chamador antigo), pula a superfície e o
      // desenho fica só de linhas, exatamente como era antes.
      if (!room.minimal && ceilingH > 0 && seg.intoDir) {
        const wallSurface = makeWallSurface(
          { x: p0.x, z: p0.z }, { x: p1.x, z: p1.z },
          ceilingH, seg.intoDir
        );
        // De qual parede esta superfície é — lido por pickRoomSurfaceAt pra o
        // duplo toque "mostra essa parede de frente" (iPad) saber qual parede
        // ativar sem depender de nenhum módulo estar em cima dela.
        wallSurface.userData.wallIndex = seg.wallIndex;
        group.add(wallSurface);
      }

      group.add(makeLine(p0.clone(), p1.clone()));
      group.add(makeLine(p0.clone().setY(ceilingH), p1.clone().setY(ceilingH)));
      group.add(makeLine(p0.clone(), p0.clone().setY(ceilingH)));
      group.add(makeLine(p1.clone(), p1.clone().setY(ceilingH)));

      if (room.ceilingLabel && seg.label && !room.minimal) {
        const mid = p0.clone().lerp(p1, 0.5);
        const textLabel = makeTextSprite(room.ceilingLabel);
        textLabel.position.set(mid.x, ceilingH + 0.11, mid.z + 0.05);
        group.add(textLabel);
      }

      if (!room.minimal) {
        const maxY = ceilingH - CEILING_CLEARANCE_M - baseH + MAX_HEIGHT_LINE_RAISE_M;
        const dashGeom = new THREE.BufferGeometry().setFromPoints([p0.clone().setY(maxY), p1.clone().setY(maxY)]);
        const dashLine = new THREE.Line(dashGeom, new THREE.LineDashedMaterial({ color: 0xb0503c, dashSize: 0.07, gapSize: 0.05 }));
        dashLine.computeLineDistances();
        group.add(dashLine);

        if (baseH > 0) {
          const baseGeom = new THREE.BufferGeometry().setFromPoints([p0.clone().setY(baseH), p1.clone().setY(baseH)]);
          const baseLine = new THREE.Line(baseGeom, new THREE.LineDashedMaterial({ color: 0x8a8378, dashSize: 0.07, gapSize: 0.05 }));
          baseLine.computeLineDistances();
          group.add(baseLine);
        }
      }
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
      // Com ambiente (room): regra do baseboard pedida pelo usuário — móvel
      // SUSPENSO na parede (nada dele abaixo da altura do baseboard, medido
      // pelo bounding box real das peças, já considerando floor_height_m
      // acima) fica flush na parede e o baseboard continua aparecendo
      // embaixo dele; móvel NO CHÃO fica NA FRENTE do baseboard (recuado a
      // espessura dele), tapando-o como na vida real.
      let zOffset = 0;
      if (room && room.baseboard_h_m > 0) {
        const bbox = new THREE.Box3().setFromObject(a.group);
        const wallHung = bbox.min.y > room.baseboard_h_m + 0.001;
        zOffset = wallHung ? 0 : BASEBOARD_DEPTH_M;
      }
      a.group.position.z = a.depth_m / 2 + zOffset;
      scene.add(a.group);
      currentGroups.push(a.group);
      if (Array.isArray(a.openables) && a.openables.length) {
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
      let zOffset = 0;
      if (room && room.baseboard_h_m > 0) {
        const bbox = new THREE.Box3().setFromObject(a.group);
        const wallHung = bbox.min.y > room.baseboard_h_m + 0.001;
        zOffset = wallHung ? 0 : BASEBOARD_DEPTH_M;
      }
      const layerZ = Number(a.z_order || 0) * FREEFORM_DEPTH_STEP_M;
      a.group.position.z = a.depth_m / 2 + zOffset + layerZ;
      scene.add(a.group);
      currentGroups.push(a.group);
      if (Array.isArray(a.openables) && a.openables.length) {
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
        let zOffset = 0;
        if (room && room.baseboard_h_m > 0) {
          const bbox = new THREE.Box3().setFromObject(a.group);
          const wallHung = bbox.min.y > room.baseboard_h_m + 0.001;
          zOffset = wallHung ? 0 : BASEBOARD_DEPTH_M;
        }
        const layerDepth = Number(a.z_order || 0) * FREEFORM_DEPTH_STEP_M;
        const depthOffset = a.depth_m / 2 + zOffset + layerDepth;

        a.group.rotation.y = rotY;
        a.group.position.x = ox + ax * alongOffset + ix * depthOffset;
        a.group.position.z = oz + az * alongOffset + iz * depthOffset;
        a.group.position.y = a.floor_height_m || 0;

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

        scene.add(a.group);
        currentGroups.push(a.group);
        if (Array.isArray(a.openables) && a.openables.length) currentOpenables.push(...a.openables);

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
      a.group.rotation.y = Number(a.rotationY) || 0;
      a.group.position.x = Number(a.floorX) || 0;
      a.group.position.z = Number(a.floorZ) || 0;
      a.group.position.y = a.floor_height_m || 0;
      a.group.userData.slotId = a.id;
      a.group.userData.wallIndex = null;
      a.group.userData.isFloorIsland = true;
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
  function toggleDoors() {
    doorsOpen = !doorsOpen;
    currentOpenables.forEach((op) => {
      if (op.kind === 'hinge') op.targetAngle = doorsOpen ? openAngleFor(op.hingeSide) : 0;
    });
    return doorsOpen;
  }

  function toggleDrawers() {
    drawersOpen = !drawersOpen;
    currentOpenables.forEach((op) => {
      if (op.kind === 'slide') op.targetOffset = drawersOpen ? op.distance : 0;
    });
    return drawersOpen;
  }

  function areDoorsOpen() { return doorsOpen; }
  function areDrawersOpen() { return drawersOpen; }

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

  const _raycaster = (typeof THREE !== 'undefined') ? new THREE.Raycaster() : null;

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
  let _lastDebugPickKey = null;
  function _debugPickLog(clientX, clientY, result, extra) {
    if (typeof window === 'undefined' || !window.__legnoDebugPick) return;
    // Chave só pelo RESULTADO (slotId/wallIndex) + reason — não pelas
    // distâncias/coordenadas em `extra` (essas mudam a cada pixel de
    // pointermove, então incluí-las no throttle antes fazia logar quase
    // toda hora mesmo sem o resultado mudar, poluindo o console).
    const key = JSON.stringify({ r: result ? [result.slotId, result.wallIndex] : null, reason: extra && extra.reason });
    if (key === _lastDebugPickKey) return;
    _lastDebugPickKey = key;
    // Loga como STRING já formatada (JSON.stringify), não como objeto
    // clicável — pedido do usuário mandou 2 screenshots seguidos do objeto
    // ainda FECHADO (precisa clicar na setinha ▸ pra abrir, aí abrir de novo
    // "result"/"hitsWithSlot" por dentro — fácil de esquecer numa captura de
    // tela rápida). Texto puro aparece tudo de uma vez, sem precisar clicar
    // em nada, só printar a área e mandar o print de novo.
    console.log('[legno pickAssemblyAt] ' + JSON.stringify({
      clientX, clientY, result: result ? { slotId: result.slotId, wallIndex: result.wallIndex } : null, ...extra
    }, null, 2));
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
    const hitboxHits = rawHits.filter((h) => h.object && h.object.userData && h.object.userData.isHitboxProxy);
    const hits = hitboxHits.length ? hitboxHits : rawHits;
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
    _debugPickLog(clientX, clientY, result, {
      reason: 'checked', preferredWallIndex, rectInside: (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom),
      firstAnyDist: isFinite(firstAnyDist) ? Number(firstAnyDist.toFixed(3)) : null,
      matchedPreferredDist: isFinite(matchedPreferredDist) ? Number(matchedPreferredDist.toFixed(3)) : null,
      currentGroupsCount: currentGroups.length, hitsTotal: hits.length,
      hitsWithSlot: hits.map((h) => {
        let o = h.object;
        while (o && !(o.userData && o.userData.slotId != null)) o = o.parent;
        return o ? { slotId: o.userData.slotId, wallIndex: o.userData.wallIndex, dist: Number(h.distance.toFixed(3)) } : null;
      }).filter(Boolean).slice(0, 8)
    });
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
  function pickRoomSurfaceAt(clientX, clientY) {
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
      // ser lido como "cliquei no piso/parede atrás dele".
      let p = obj;
      while (p) { if (p.userData && p.userData.slotId != null) return null; p = p.parent; }
    }
    return null;
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
    controls.update();
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
  function setHoverHighlight(group) {
    if (!scene) return;
    if (!group) {
      if (hoverBoxHelper) hoverBoxHelper.visible = false;
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
    hoverBoxHelper.setFromObject(group);
    hoverBoxHelper.visible = true;
  }

  // Atualiza o contorno SEM trocar de objeto rastreado (mais barato que
  // setFromObject) — chamado a cada pointermove de um arraste de MOVER (ver
  // portal.js), que já reposiciona o Group ao vivo sem reconstruir a cena;
  // sem isso o contorno ficaria "preso" na posição de quando o hover
  // começou, em vez de acompanhar o módulo sendo arrastado.
  function updateHoverHighlight() {
    if (hoverBoxHelper && hoverBoxHelper.visible) hoverBoxHelper.update();
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
  function frameDirection(dir, target) {
    if (!camera || !controls) return;
    const t = target
      ? new THREE.Vector3(target.x, target.y, target.z)
      : controls.target.clone();
    const dist = camera.position.distanceTo(controls.target) || 3;
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
  const RESIZE_ARROW_COLOR = 0xd8442f;
  function setResizeArrows(spec) {
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
    const mat = new THREE.MeshBasicMaterial({ color: RESIZE_ARROW_COLOR, depthTest: false });
    spec.forEach((item) => {
      const arrow = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, 12), mat);
      shaft.position.y = shaftLen / 2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, 16), mat);
      head.position.y = shaftLen + headLen / 2;
      // Alvo de toque generoso e invisível em volta da seta inteira — no dedo,
      // acertar um cone de 4cm é frustrante.
      const hit = new THREE.Mesh(
        new THREE.CylinderGeometry(headR * 2.2, headR * 2.2, shaftLen + headLen, 8),
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
      group.add(arrow);
    });
    resizeArrowGroup = group;
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
    return {
      position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      target: { x: t.x, y: t.y, z: t.z },
      fov: camera.fov || 35,
      aspect: camera.aspect || (4 / 3)
    };
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
    // Interatividade (ver bloco de comentário grande acima) — só usado pela
    // instância ViewerProjectEdit (portal.js); Composição/ViewerProject
    // (preview) nunca chamam nenhum destes.
    setControlsEnabled, getDomElement, pickAssemblyAt, intersectPlaneAtClient,
    setHoverHighlight, updateHoverHighlight, findGroupBySlotId,
    // Ambiente sólido + câmera dirigida (2026-08-08) — ver comentários de
    // pickRoomSurfaceAt / frameDirection / setResizeArrows.
    pickRoomSurfaceAt, frameDirection, setResizeArrows, pickResizeArrowAt,
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
