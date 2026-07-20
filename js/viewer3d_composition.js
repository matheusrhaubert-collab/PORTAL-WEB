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
const ViewerComposition = (function () {
  let renderer = null;
  let scene = null;
  let camera = null;
  let controls = null;
  let containerEl = null;
  let currentGroups = [];

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

  function buildRoomEnvironment(totalWidth, maxDepth, room) {
    const group = new THREE.Group();
    const margin = Math.max(totalWidth * 0.35, 0.9); // sobra de parede/baseboard pra cada lado
    const wallW = totalWidth + margin * 2;
    const ceilingH = room.ceiling_m;
    const baseH = room.baseboard_h_m || 0;

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
    const dirArr = angleKey && SNAPSHOT_ANGLE_DIRS[angleKey];
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

  return {
    init, available, render, snapshot, canvasAspectRatio,
    // Estado próprio de porta/gaveta da composição — ver comentário de
    // currentOpenables/doorsOpen acima. portal.js relê areDoorsOpen()/
    // areDrawersOpen() antes de reconstruir cada assembly (generateComposition3D),
    // pra um módulo novo/recolorido nascer já no estado atual em vez de
    // sempre fechado.
    toggleDoors, toggleDrawers, areDoorsOpen, areDrawersOpen
  };
})();
// fim de viewer3d_composition.js
