// portal-08-projetos-paredes.js — parte 8/9 de js/portal.js (ver
// portal-01-core-catalogo.js). Girar módulo (Shift+arrastar), vista superior/
// planta baixa, paredes por segmento (editor de paredes), estilo do desenho
// 3D (contorno/textura) e o menu de estilo.

// Converte um slot de parede em ILHA no chão (e vice-versa), preservando a
// posição atual como ponto de partida — usado pelo arraste livre do toque
// longo (iPad) e pelo soltar da biblioteca.
function convertProjectSlotToFloor(slot, xMm, zMm) {
  slot.placement = 'floor';
  slot.floor_x_mm = Number(xMm || 0);
  slot.floor_z_mm = Number(zMm || 0);
  slot.floor_height_mm = 0; // ilha apoia no chão
  slot.z_order = 0;
  if (slot.floor_rotation_deg == null) slot.floor_rotation_deg = 0;
}
// ==========================================================================
// GIRAR O MÓDULO — Shift + arrastar (2026-08-12)
// ==========================================================================
// Pedido do Matt: "ao apertar shift ele rotacione sobre o proprio eixo, pode
// ser de 5 em 5 com imas a cada 90. e me informe quando esta rotacionando no
// canto inferior da tela visivel", valendo pra "todos conectados ao chao".
//
// Quem pode girar: módulo que ESTÁ NO CHÃO — a ilha (placement='floor') e o
// módulo de parede apoiado no piso. Um aéreo/suspenso não gira: ele está
// pendurado na parede e o giro não teria significado físico (nem lugar pra
// guardar: floor_rotation_deg é do referencial do piso).
//
// Módulo de parede que gira VIRA ILHA na hora — é a única representação que
// tem ângulo próprio. Ele nasce na posição de mundo onde já estava e com o
// ângulo da parede, então o primeiro frame do giro não "pula".
const PROJECT_ROTATE_STEP_DEG = 5;      // passo do giro
const PROJECT_ROTATE_SNAP_DEG = 7;      // ímã: a menos disso de um múltiplo de 90, cola
const PROJECT_ROTATE_DEG_PER_PX = 0.5;  // sensibilidade do arraste horizontal

function projectSlotCanRotate(slot) {
  if (!slot) return false;
  if (isFloorSlot(slot)) return true;
  return Number(slot.floor_height_mm || 0) <= 0;
}

// Ângulo cru -> passo de 5° com ímã nos múltiplos de 90°. Devolve o ângulo e
// se o ímã pegou (o aviso na tela muda de cor pra confirmar).
function quantizeProjectRotation(rawDeg) {
  const norm = ((rawDeg % 360) + 360) % 360;
  const noventa = Math.round(norm / 90) * 90;
  let diff = norm - noventa;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  if (Math.abs(diff) <= PROJECT_ROTATE_SNAP_DEG) {
    return { deg: ((noventa % 360) + 360) % 360, snapped: true };
  }
  const passo = Math.round(norm / PROJECT_ROTATE_STEP_DEG) * PROJECT_ROTATE_STEP_DEG;
  return { deg: ((passo % 360) + 360) % 360, snapped: false };
}

function showProjectRotateHud(deg, snapped) {
  const el = document.getElementById('po-proj-rotate-hud');
  if (!el) return;
  el.textContent = I18n.t('project.rotating_badge', { deg: Math.round(deg) })
    + (snapped ? ' ·' : '');
  el.classList.toggle('snapped', !!snapped);
  el.style.display = 'block';
}
function hideProjectRotateHud() {
  const el = document.getElementById('po-proj-rotate-hud');
  if (el) el.style.display = 'none';
}

// Solta o módulo da parede mantendo EXATAMENTE onde ele está na cena: a
// posição de mundo vem do Group que renderFreeformWalls já posicionou (não
// recalculada aqui — seria repetir a fórmula de origin/alongDir/intoDir e
// arriscar divergir), e o ângulo inicial é o da parede em que ele estava.
function detachProjectSlotFromWallForRotation(slot, group) {
  const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === Number(slot.wall_index || 0));
  const xMm = group ? group.position.x * 1000 : Number(slot.floor_x_mm || 0);
  const zMm = group ? group.position.z * 1000 : Number(slot.floor_z_mm || 0);
  const anguloParedeDeg = wallGeo ? (wallGeo.rotationY * 180) / Math.PI : 0;
  convertProjectSlotToFloor(slot, xMm, zMm);
  slot.floor_rotation_deg = ((anguloParedeDeg % 360) + 360) % 360;
  return slot.floor_rotation_deg;
}

// ==========================================================================
// CO-ARRASTAR O GRUPO — mover junto (2026-09-03, ver comentário grande em
// portal-06b, seção "GRUPO DE MÓDULOS")
// ==========================================================================
// Mesmo padrão de "preview barato + commit no soltar" que o módulo agarrado
// já usa (ver o comentário grande sobre não reconstruir a cena a cada
// pointermove): os OUTROS membros do grupo só têm o Group do Three.js
// deslocado ao vivo (applyProjectGroupCoDragPreview); a posição de verdade
// (x_mm/floor_x_mm/floor_z_mm) só é gravada em commitProjectGroupCoDrag, no
// pointerup — daí a única renderProjectCanvas() do gesto inteiro.
function beginProjectGroupCoDrag(state, primarySlot) {
  state.groupCoDrag = null;
  if (!state || !primarySlot || typeof projectActiveGroupSelectionIds !== 'function') return;
  const ids = projectActiveGroupSelectionIds(primarySlot);
  if (!ids || ids.size < 2) return;
  const startBox = projectSlotWorldBox3D(primarySlot);
  if (!startBox) return;
  state.groupStartWorldXMm = startBox.cx;
  state.groupStartWorldZMm = startBox.cz;
  const members = [];
  ids.forEach((id) => {
    if (id === primarySlot.id) return;
    const m = projectSlots.find((s) => s.id === id);
    if (!m) return;
    const box = projectSlotWorldBox3D(m);
    if (!box) return;
    members.push({
      id: m.id,
      startWorldXMm: box.cx,
      startWorldZMm: box.cz,
      startXMm: Number(m.x_mm || 0), // só usado se for módulo de parede (commit)
      group: ViewerProjectEdit.findGroupBySlotId(m.id)
    });
  });
  if (members.length) state.groupCoDrag = members;
}

// Depois de uma renderProjectCanvas() NO MEIO do arraste (o módulo
// PRINCIPAL trocou de parede<->chão — os 3 únicos pontos que reconstroem a
// cena durante um arraste, ver "readota o novo" acima): os módulos do
// grupo em si não se moveram, só o Group deles morreu e nasceu de novo
// junto com a cena inteira. Reata as referências sem recalcular nada.
function refreshProjectGroupCoDragRefs(state) {
  if (!state || !state.groupCoDrag) return;
  state.groupCoDrag.forEach((m) => { m.group = ViewerProjectEdit.findGroupBySlotId(m.id); });
}

// Chamada a cada pointermove, logo depois do PRIMÁRIO já ter a posição "ao
// vivo" (state.group.position) atualizada — desloca o Group de cada outro
// membro pelo MESMO delta de mundo. Não mexe em x_mm/floor_x_mm/floor_z_mm
// ainda (só no soltar, ver commitProjectGroupCoDrag) — mesma separação
// preview/commit do módulo agarrado.
function applyProjectGroupCoDragPreview(state) {
  if (!state || !state.groupCoDrag || !state.groupCoDrag.length || !state.group) return;
  const deltaXMm = state.group.position.x * 1000 - state.groupStartWorldXMm;
  const deltaZMm = state.group.position.z * 1000 - state.groupStartWorldZMm;
  state.groupCoDrag.forEach((m) => {
    if (!m.group) return;
    m.group.position.x = (m.startWorldXMm + deltaXMm) / 1000;
    m.group.position.z = (m.startWorldZMm + deltaZMm) / 1000;
  });
}

// Commit de verdade, uma vez só no soltar (endDrag3D) — grava a posição
// final de cada membro no PRÓPRIO referencial dele: x_mm ao longo da SUA
// parede (projeção do delta de mundo no eixo along dela — funciona mesmo
// pra um grupo espalhado por paredes de ângulos diferentes) ou
// floor_x_mm/floor_z_mm de mundo direto pra ilha. Cada membro é clampado
// dentro dos PRÓPRIOS limites (parede/ambiente) — colisão entre módulos do
// grupo (uns contra os outros, ou contra módulos de FORA do grupo) não é
// checada aqui, só o limite físico de cada um; ver nota na seção "GRUPO DE
// MÓDULOS" (portal-06b) — simplificação deliberada, PENDENTE se o Matt
// pedir colisão de verdade no arraste em grupo.
function commitProjectGroupCoDrag(state, primarySlot) {
  if (!state || !state.groupCoDrag || !state.groupCoDrag.length || !primarySlot) return;
  const finalBox = projectSlotWorldBox3D(primarySlot);
  if (!finalBox) return;
  const deltaXMm = finalBox.cx - state.groupStartWorldXMm;
  const deltaZMm = finalBox.cz - state.groupStartWorldZMm;
  if (Math.abs(deltaXMm) < 0.01 && Math.abs(deltaZMm) < 0.01) return; // não moveu de verdade
  state.groupCoDrag.forEach((m) => {
    const member = projectSlots.find((s) => s.id === m.id);
    if (!member) return;
    if (isFloorSlot(member)) {
      member.floor_x_mm = m.startWorldXMm + deltaXMm;
      member.floor_z_mm = m.startWorldZMm + deltaZMm;
      clampFloorSlotIntoRoom(member);
    } else {
      const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === Number(member.wall_index || 0));
      if (!wallGeo) return;
      const alongDeltaMm = deltaXMm * wallGeo.alongDirX + deltaZMm * wallGeo.alongDirZ;
      member.x_mm = m.startXMm + alongDeltaMm;
      clampProjectSlotPosition(member);
    }
  });
}

function convertProjectSlotToWall(slot, wallIndex, xMm, floorHeightMm) {
  slot.placement = 'wall';
  slot.wall_index = Number(wallIndex || 0);
  slot.x_mm = Number(xMm || 0);
  slot.floor_height_mm = Math.max(0, Number(floorHeightMm || 0));
  clampProjectSlotPosition(slot);
  resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
}

// Anexa os listeners de arrastar no <canvas> real do Three.js (uma única
// vez — checa domEl.dataset.legnoDragAttached porque renderProjectCanvasFrontCorner
// roda de novo a cada renderProjectCanvas(), mas o <canvas>/renderer da
// instância é reaproveitado entre renders, ver "if (renderer) return" em
// init() no viewer3d_composition.js — anexar nesta função de novo a cada
// render duplicaria o listener).
function attachProject3DEditDrag() {
  // Link público de visualização 3D (view3d, 02/09) — visitante sem conta
  // reaproveita esta MESMA Vista de Canto (bootView3DGuestView, ver
  // portal-09-projetos-final.js), então este é o ÚNICO lugar que precisa
  // travar: é a função inteira que liga clique/selecionar/arrastar/
  // redimensionar módulo nela. Sem isso o resto (rotacionar/zoom via
  // OrbitControls nativo) continua funcionando igual — não é o que este
  // guard bloqueia.
  if (window.PO_VIEW3D_READONLY) return;
  if (!ViewerProjectEdit) return;
  const domEl = ViewerProjectEdit.getDomElement && ViewerProjectEdit.getDomElement();
  if (!domEl || domEl.dataset.legnoDragAttached === '1') return;
  domEl.dataset.legnoDragAttached = '1';

  // Timer do "segurar pra arrastar" no toque (ver PROJECT_TOUCH_HOLD_MS).
  let hold3DTimer = null;
  const clearHold3DTimer = () => { if (hold3DTimer) { clearTimeout(hold3DTimer); hold3DTimer = null; } };

  // Duplo toque no AMBIENTE (2026-08-08, iPad): "duplo clica na parede ele
  // mostra a parede de frente. duplo clique no chao mostra vista de cima".
  // Detectado na mão (dois pointerup rápidos e próximos) em vez de usar
  // 'dblclick', que no iOS só dispara de forma confiável com mouse/trackpad.
  let lastRoomTap = null;
  // 400ms: mesma janela do duplo clique na SETA e no MÓDULO (ver
  // ARROW_DOUBLE_TAP_MS). Eram 320 aqui, mais apertado que o padrão do
  // sistema (~500ms) — dois cliques que a pessoa deu como duplo às vezes
  // contavam como dois simples e a câmera não focava.
  const ROOM_DOUBLE_TAP_MS = 400;
  const ROOM_DOUBLE_TAP_PX = 30;

  // Último toque numa SETA de redimensionamento — duplo clique na mesma seta
  // estica o módulo até encostar no vizinho (2026-08-08, ver
  // stretchProjectSlotToCollision). Janela um pouco mais larga que a do duplo
  // toque no ambiente: aqui o alvo é pequeno e a 2ª batida costuma demorar
  // mais a acertar.
  let lastArrowTap = null;
  const ARROW_DOUBLE_TAP_MS = 400;
  // Duplo clique no MÓDULO (2026-08-13) — enquadra ele de frente. Mesma janela
  // de tempo do duplo clique na seta.
  let lastModuleTap = null;

  // "Segurar" em cima de um módulo — o significado do gesto MUDOU no toque
  // (pedido do usuário 2026-08-08): "IPAD - clique longo, (tira a opcao de
  // mostrar preferencias) ele pode ser arrastado de uma parede pra outra ou
  // pro chao". Então:
  //   · TOQUE: segurar arma o ARRASTE LIVRE (freeMode) — o módulo passa a
  //     poder atravessar pra outra parede ou pro chão enquanto o dedo anda.
  //     As propriedades saíram daqui de propósito; quem quer editar dá um
  //     toque curto (seleciona) e usa o painel da direita.
  //   · MOUSE: continua abrindo as PROPRIEDADES, exatamente como antes — o
  //     pedido era explicitamente sobre o iPad, e no mouse arrastar já é
  //     imediato (não precisa de gesto pra "armar" nada).
  const startProject3DHoldGesture = (slot, isTouch) => {
    clearHold3DTimer();
    hold3DTimer = setTimeout(() => {
      hold3DTimer = null;
      const st = projectDrag3DState;
      if (!st || st.slotId !== slot.id || st.moved) return;
      if (isTouch) {
        st.armed = true;
        st.freeMode = true;
        // Contorno vermelho já está aceso; o "engatou" fica evidente porque a
        // partir daqui o módulo acompanha o dedo.
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* ok */ } }
        return;
      }
      projectDrag3DState = null;
      domEl.style.cursor = 'default';   // cursor sempre padrão (2026-08-13, ver o hover)
      openProjectSlotProps(slot.id);
    }, PROJECT_HOLD_MENU_MS);
  };

  domEl.addEventListener('pointerdown', (ev) => {
    // MODO CÂMERA ligado (toque, iPad): o dedo é só da câmera — nenhum
    // módulo é selecionado, arrastado ou esticado enquanto isso. Ver
    // setProjectCameraMode.
    if (projectCameraModeOn && ev.pointerType === 'touch') return;

    // ====================================================================
    // SÓ BOTÃO ESQUERDO — E ESTA CHECAGEM É A PRIMEIRA DE TODAS
    // ====================================================================
    // Ela existia, mas LÁ EMBAIXO, depois do teste das setas. Resultado: um
    // clique com o BOTÃO DO MEIO em cima de uma seta entrava no ramo da seta,
    // criava o arraste de resize e saía com return — tudo isso enquanto o
    // OrbitControls, que usa o mesmo botão do meio, girava a câmera. Os dois
    // gestos rodavam juntos: "cliquei com o scroll, rotacionou, selecionou
    // módulo, moveu módulo e esticou módulo. perdi o controle total".
    //
    // Botão do meio = girar câmera. Botão direito = pan. Nenhum dos dois pode
    // tocar em módulo, seta ou seleção. No toque e na caneta, ev.button é 0,
    // então nada muda pro iPad.
    if (ev.button !== 0) return;

    // CTRL/CMD+CLIQUE = SELEÇÃO MÚLTIPLA, NÃO ARRASTE (2026-09-03, Matt:
    // "quero poder agrupar varios modulos, apertar control e ir clicando").
    // Só marcação — nunca inicia giro, esticar ou mover, e nunca mexe no
    // painel de config da direita (esse continua sendo o último clique
    // SIMPLES, ver selectProjectSlot/toggleProjectMultiSelect em
    // portal-06b). Sai com return antes de qualquer outro ramo (setas,
    // giro, ilha, parede) — Ctrl+clique nunca é o começo de mais nada.
    if (ev.ctrlKey || ev.metaKey) {
      const hitCtrl = ViewerProjectEdit.pickAssemblyAtSticky
        ? ViewerProjectEdit.pickAssemblyAtSticky(ev.clientX, ev.clientY, projectActiveWallIndex, selectedProjectSlotId, 0)
        : null;
      if (hitCtrl && hitCtrl.slotId != null && typeof toggleProjectMultiSelect === 'function') {
        ev.preventDefault();
        toggleProjectMultiSelect(hitCtrl.slotId);
      }
      return;
    }

    // As SETAS de redimensionamento (toque) ficam desenhadas POR CIMA de
    // tudo, então precisam ser testadas ANTES do módulo — senão o raycaster
    // do módulo venceria e a seta nunca seria agarrada. Ver
    // refreshProject3DResizeArrows/setResizeArrows.
    const arrowHit = ViewerProjectEdit.pickResizeArrowAt
      ? ViewerProjectEdit.pickResizeArrowAt(ev.clientX, ev.clientY)
      : null;
    if (arrowHit && selectedProjectSlotId != null) {
      const arrowSlot = projectSlots.find((s) => s.id === selectedProjectSlotId);
      if (arrowSlot) {
        ev.preventDefault();
        // DUPLO clique/toque na MESMA seta: estica até encostar no vizinho
        // (2026-08-08 — ver stretchProjectSlotToCollision). Detectado aqui no
        // pointerdown, e não por um listener 'dblclick', porque o dblclick não
        // é confiável em toque no iOS e porque precisamos saber QUAL seta foi
        // atingida (informação que só o raycaster tem).
        const nowArrow = Date.now();
        if (lastArrowTap && lastArrowTap.axis === arrowHit.axis
          && lastArrowTap.slotId === arrowSlot.id
          && nowArrow - lastArrowTap.t <= ARROW_DOUBLE_TAP_MS) {
          lastArrowTap = null;
          projectDrag3DState = null;
          clearHold3DTimer();
          stretchProjectSlotToCollision(arrowSlot, arrowHit.axis);
          return;
        }
        lastArrowTap = { t: nowArrow, axis: arrowHit.axis, slotId: arrowSlot.id };
        // ACENDE A SETA AGARRADA (2026-08-13, iPad). No mouse quem avisa é o
        // hover; no dedo não existe hover — a seta só acendia depois, ou nunca.
        // Sem isso o gesto começa às cegas: "arrasta sem seta marcada". Acender
        // no pointerdown mostra, no instante do toque, exatamente qual eixo foi
        // pego. Ela apaga no fim do arraste (endDrag3D -> refreshProject3DResizeArrows).
        if (ViewerProjectEdit.highlightResizeArrow) ViewerProjectEdit.highlightResizeArrow(arrowHit.axis);
        try { domEl.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
        projectDrag3DState = {
          pointerId: ev.pointerId,
          slotId: arrowSlot.id,
          group: ViewerProjectEdit.findGroupBySlotId(arrowSlot.id),
          isTouch: ev.pointerType === 'touch',
          armed: true,
          moved: false,
          viaArrow: true,
          dragMode: 'resize',
          resizeAxis: arrowHit.axis,
          // Agarrando a SETA (não a borda), não existe offset de agarre: a
          // borda segue direto o ponteiro.
          grabOffsetEdgeMm: 0,
          startXMm: Number(arrowSlot.x_mm || 0),
          startWidthMm: Number(arrowSlot.width_mm || 0),
          // Ilha no chão (2026-09-02): pra ancorar a borda OPOSTA à seta
          // agarrada (ver handleProject3DResizeMove) precisamos do centro e
          // da profundidade no INÍCIO do arraste — width_mm/x_mm acima já
          // servem pro módulo de parede, mas a ilha usa floor_x_mm/floor_z_mm
          // como centro e tem profundidade própria (depth_mm) que também
          // pode ser esticada.
          startFloorXMm: Number(arrowSlot.floor_x_mm || 0),
          startFloorZMm: Number(arrowSlot.floor_z_mm || 0),
          startDepthMm: Number(arrowSlot.depth_mm || 0),
          startClientX: ev.clientX,
          startClientY: ev.clientY,
          liveWallIndex: Number(arrowSlot.wall_index || 0)
        };
        return;
      }
    }

    // (a checagem de botão esquerdo subiu pro topo deste handler — ver lá o
    // porquê; ela precisa valer também pro ramo das setas.)
    // preferredWallIndex=projectActiveWallIndex (ver comentário grande em
    // pickAssemblyAt, viewer3d_composition.js): perto do canto, prefere o
    // módulo da parede em edição em vez do hit geometricamente mais
    // próximo, que pode pertencer à outra parede.
    //
    // stickySlotId (2026-08-08, 3ª rodada): no TOQUE, o módulo já selecionado
    // não perde a seleção pra um vizinho encostado só porque o centro do dedo
    // caiu alguns milímetros fora dele — ver pickAssemblyAtSticky. No mouse
    // não se aplica (ponteiro é preciso; passar sticky ali atrapalharia quem
    // quer selecionar o vizinho de propósito).
    const stickySlop = (ev.pointerType === 'touch') ? PROJECT_STICKY_PICK_PX : 0;
    const hit = ViewerProjectEdit.pickAssemblyAtSticky(
      ev.clientX, ev.clientY, projectActiveWallIndex, selectedProjectSlotId, stickySlop
    );
    if (!hit || !hit.group) {
      // Clique em área vazia da cena (nenhum módulo embaixo do ponteiro) —
      // pedido do usuário (2026-07-26: "quando clicar na tela quero que nao
      // apareca ennhum modulo nas configuracoes da direita") — antes não
      // fazia nada aqui, então o painel de config à direita continuava
      // preso no ÚLTIMO módulo selecionado mesmo clicando fora dele. Câmera
      // desta vista é FIXA (setControlsEnabled(false), sem orbit), então um
      // pointerdown sem hit nunca é o início de um arraste de verdade — pode
      // desselecionar na hora, sem esperar o pointerup.
      // Apaga o contorno vermelho junto — desde que ele virou espelho da
      // seleção (2026-08-12), clicar na parede é o gesto de "solta esse
      // módulo" que o Matt pediu.
      deselectProjectSlot();
      return;
    }
    const slot = projectSlots.find((s) => s.id === hit.slotId);
    if (!slot) return;
    ev.preventDefault();

    // ---------- DUPLO CLIQUE NO MÓDULO: ENQUADRA ELE DE FRENTE ----------
    // Pedido do Matt (2026-08-13): "dar 2 cliques no modulo, cliques rapidos,
    // ele centraliza frontal esse modulo pra poder ser visto, mexido,
    // rotacionado". É também a resposta pro controle fino: de perto e
    // centralizado, cada pixel do mouse vale poucos milímetros.
    //
    // Detectado aqui no pointerdown (não num listener 'dblclick') pelo mesmo
    // motivo das setas: o dblclick não é confiável no toque do iOS e aqui já
    // se sabe QUAL módulo foi atingido.
    const agora = Date.now();
    if (lastModuleTap && lastModuleTap.slotId === slot.id
      && agora - lastModuleTap.t <= ARROW_DOUBLE_TAP_MS) {
      lastModuleTap = null;
      clearHold3DTimer();
      projectDrag3DState = null;
      selectProjectSlot(slot.id);
      frameProjectSlotFront(slot);
      return;
    }
    lastModuleTap = { t: agora, slotId: slot.id };

    try { domEl.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }

    // ---------- GIRAR (Shift + arrastar) ----------
    // Antes de qualquer outro modo: com Shift pressionado o arraste inteiro é
    // giro, nunca mover nem esticar (ver quantizeProjectRotation e o
    // comentário grande em projectSlotCanRotate).
    if (ev.shiftKey && projectSlotCanRotate(slot)) {
      const anguloInicial = isFloorSlot(slot)
        ? Number(slot.floor_rotation_deg || 0)
        : detachProjectSlotFromWallForRotation(slot, hit.group);
      selectProjectSlot(slot.id);
      projectDrag3DState = {
        pointerId: ev.pointerId,
        slotId: slot.id,
        group: hit.group,
        isTouch: ev.pointerType === 'touch',
        armed: true,
        moved: false,
        dragMode: 'rotate',
        resizeAxis: null,
        startClientX: ev.clientX,
        startClientY: ev.clientY,
        startRotationDeg: anguloInicial
      };
      domEl.style.cursor = 'default';
      showProjectRotateHud(anguloInicial, quantizeProjectRotation(anguloInicial).snapped);
      // Soltar da parede troca a representação do módulo (vira ilha): a cena
      // precisa ser reconstruída pra ele sair do grupo da parede. Feito uma
      // vez só, aqui — o giro em si só mexe em group.rotation.y.
      if (!isFloorSlot(slot)) { /* já convertido acima */ }
      renderProjectCanvas();
      projectDrag3DState.group = ViewerProjectEdit.findGroupBySlotId(slot.id) || hit.group;
      refreshProject3DHighlight();
      return;
    }

    // ---------- Módulo ILHA (solto no chão) ----------
    // Caminho totalmente separado do de parede: o plano de arraste é o PISO
    // (y=0), não o plano vertical de uma parede, e a posição é o CENTRO do
    // módulo em coordenadas de mundo. Sem esticar por borda aqui (ver
    // classifyProject3DGrab) — só mover.
    if (isFloorSlot(slot)) {
      const fp = projectFloorPointMm(ev.clientX, ev.clientY);
      const isTouchFloor = ev.pointerType === 'touch';
      projectDrag3DState = {
        pointerId: ev.pointerId,
        slotId: slot.id,
        group: hit.group,
        isTouch: isTouchFloor,
        armed: !isTouchFloor,
        moved: false,
        onFloor: true,
        dragMode: 'move',
        resizeAxis: null,
        startClientX: ev.clientX,
        startClientY: ev.clientY,
        grabOffsetFloorXMm: fp ? fp.xMm - Number(slot.floor_x_mm || 0) : 0,
        grabOffsetFloorZMm: fp ? fp.zMm - Number(slot.floor_z_mm || 0) : 0,
        prevFloorXMm: Number(slot.floor_x_mm || 0),
        prevFloorZMm: Number(slot.floor_z_mm || 0)
      };
      // GRUPO: captura ANTES de selectProjectSlot (que troca a seleção
      // múltipla pro grupo SALVO do módulo clicado, se houver — ver
      // beginProjectGroupCoDrag) — se o arraste começou numa seleção AD HOC
      // (só Ctrl+clique, sem grupo salvo), precisa ler projectMultiSelectIds
      // ANTES dela ser sobrescrita.
      beginProjectGroupCoDrag(projectDrag3DState, slot);
      // Agarrar JÁ seleciona (o contorno é a seleção agora) — assim o módulo
      // arrastado fica vermelho na hora e CONTINUA vermelho depois de soltar.
      selectProjectSlot(slot.id);
      domEl.style.cursor = 'default';
      startProject3DHoldGesture(slot, isTouchFloor);
      return;
    }

    const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === Number(slot.wall_index || 0));
    if (!wallGeo) return;
    // "Onde no módulo eu agarrei" (offset entre o ponto exato do clique no
    // plano da parede e a borda esquerda/base do módulo) — sem isso o
    // módulo "pularia" pra colar a borda esquerda no ponteiro assim que o
    // arraste começasse, em vez de continuar exatamente de onde foi
    // agarrado (mesmo princípio de qualquer drag-and-drop com grab point).
    const grabPoint = ViewerProjectEdit.intersectPlaneAtClient(
      ev.clientX, ev.clientY,
      { x: wallGeo.originX, y: 0, z: wallGeo.originZ },
      { x: wallGeo.intoDirX, y: 0, z: wallGeo.intoDirZ }
    );
    const grabAlongMm = grabPoint ? ((grabPoint.x - wallGeo.originX) * wallGeo.alongDirX + (grabPoint.z - wallGeo.originZ) * wallGeo.alongDirZ) * 1000 : Number(slot.x_mm || 0);
    const grabHeightMm = grabPoint ? grabPoint.y * 1000 : Number(slot.floor_height_mm || 0);

    // Profundidade atual do assembly (distância ao longo de intoDir, a
    // partir da origem da parede) — lida direto da posição REAL que
    // renderFreeformWalls já colocou o group (não recalcula z_order/
    // depth_mm/rodapé aqui, ver comentário grande no pointermove abaixo).
    // Mantida CONSTANTE durante todo o arraste (só x_mm/floor_height_mm
    // mudam arrastando, igual à vista Frontal 2D — profundidade/z_order só
    // se ajustam sozinhos depois, ver resolveProjectSlotDepth no soltar).
    const depthOffsetM = (hit.group.position.x - wallGeo.originX) * wallGeo.intoDirX + (hit.group.position.z - wallGeo.originZ) * wallGeo.intoDirZ;

    // Esticar módulo na Vista de Canto 3D (pedido do usuário 2026-07-26:
    // "nao estou conseguindo esticar os modulos do ambiente") — sem
    // handles/setinhas de verdade na cena 3D (seria preciso adicionar
    // geometria extra em cada assembly, mexendo em buildStandaloneAssembly/
    // viewer3d.js — arriscado só por isso, é código compartilhado com o
    // configurador de módulo único). Em vez disso, classifica se o AGARRE
    // inicial caiu perto de uma borda do módulo (classifyProject3DGrab,
    // MESMA função usada só pra trocar o cursor no hover, ver mais abaixo).
    // ESTICAR SÓ PELA SETA (2026-08-13). O agarre invisível de borda foi
    // DESLIGADO — a régua continua aqui e serve pro cursor/hover, mas não
    // inicia mais um resize sozinho.
    //
    // Motivo, nas palavras do Matt: "quando clico na lateral ele tá esticando
    // mesmo sem mostrar a seta colorida. preciso de controle e precisão nesses
    // comandos, não posso controlar a usabilidade sem ver o que estou
    // fazendo." Ele está certo: a borda não tem alça, não acende nada e ocupa
    // justamente onde a pessoa clica pra selecionar/arrastar o móvel. Quando
    // isso nasceu (2026-07-26) as setas ainda não existiam na cena — hoje
    // existem, são visíveis, acendem no hover e já fazem o mesmo trabalho.
    //
    // Reversível numa linha: trocar `false &&` por nada. Não voltar sem o Matt
    // pedir — foi decisão explícita dele.
    const widthMm = Number(slot.width_mm || 0);
    const grabBorda = classifyProject3DGrab(slot, grabAlongMm, grabHeightMm);
    const grab = (false && grabBorda) ? grabBorda : { dragMode: 'move', resizeAxis: null };
    let grabOffsetEdgeMm = 0;
    if (grab.resizeAxis === 'width-left') grabOffsetEdgeMm = grabAlongMm - Number(slot.x_mm || 0);
    else if (grab.resizeAxis === 'width-right') grabOffsetEdgeMm = grabAlongMm - (Number(slot.x_mm || 0) + widthMm);
    else if (grab.resizeAxis === 'height-top') grabOffsetEdgeMm = grabHeightMm - (Number(slot.floor_height_mm || 0) + Number(slot.height_mm || 0));

    // Toque: mesmo "segurar pra arrastar" da Vista Frontal 2D (ver
    // attachProjectSlotDrag) — no iPad, encostar o dedo pra SELECIONAR
    // acabava movendo o módulo, porque 4px de tolerância não existe num dedo.
    // Aqui o gesto começa desarmado e só engata depois do hold; enquanto
    // isso, deslizar o dedo cancela tudo.
    const isTouch3D = ev.pointerType === 'touch';
    projectDrag3DState = {
      pointerId: ev.pointerId,
      slotId: slot.id,
      group: hit.group,
      isTouch: isTouch3D,
      armed: !isTouch3D,
      depthOffsetM,
      dragMode: grab.dragMode,
      resizeAxis: grab.resizeAxis,
      grabOffsetEdgeMm,
      startXMm: Number(slot.x_mm || 0),
      startWidthMm: widthMm,
      moved: false,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      liveWallIndex: wallGeo.wallIndex,
      grabOffsetXMm: grabAlongMm - Number(slot.x_mm || 0),
      grabOffsetYMm: grabHeightMm - Number(slot.floor_height_mm || 0),
      // Última posição ACEITA — a colisão precisa saber de onde o módulo veio
      // pra decidir de que lado ele está batendo (ver resolveCollisionSlide).
      prevXMm: Number(slot.x_mm || 0),
      prevYMm: Number(slot.floor_height_mm || 0)
    };
    // GRUPO: mesma ordem (captura antes de selectProjectSlot) do ramo da
    // ilha acima — ver o comentário lá.
    beginProjectGroupCoDrag(projectDrag3DState, slot);
    // Agarrar JÁ seleciona (2026-08-12): o contorno vermelho é o espelho da
    // seleção, então o módulo agarrado acende na hora — no mouse E no toque —
    // e continua aceso depois de soltar, até clicar em outro ou na parede.
    selectProjectSlot(slot.id);
    domEl.style.cursor = 'default';

    startProject3DHoldGesture(slot, isTouch3D);
  });

  domEl.addEventListener('pointermove', (ev) => {
    const state = projectDrag3DState;
    // MODO CÂMERA (toque): nada de hover/arraste — o dedo é da câmera.
    if (projectCameraModeOn && ev.pointerType === 'touch') return;
    if (!state) {
      // HOVER (nenhum arraste em andamento) — pedido do usuário 2026-07-26:
      // "quero que quando o mouse passe em cima do modulo ele fique
      // contorno vermelho... nao sei qual modulo estou selecionando" +
      // "nao sei se o comando sera arrastar o modulo ou esticar ele".
      // Destaca o módulo embaixo do ponteiro (contorno vermelho) E já troca
      // o cursor conforme o MODO que um clique ali resultaria (mover vs
      // esticar largura/altura) — mesma classificação do pointerdown
      // (classifyProject3DGrab), só sem de fato começar nenhum arraste.
      // 2026-08-12: o hover NÃO mexe mais no contorno vermelho (ele é a
      // seleção agora, ver refreshProject3DHighlight) — só no cursor.
      // O AVISO DE "DÁ PRA AGARRAR AQUI" MUDOU DE LUGAR (2026-08-13).
      // Era o cursor (grab / ew-resize / ns-resize), e o Matt disse que não
      // resolvia: "mause longe e aparecendo seta... deixa o mouse sempre com o
      // cursor triangulo padrao. mas quando estiver em cima de uma das setas do
      // movel ela pode mudar de cor". Cursor agora é SEMPRE o padrão; quem
      // avisa é a própria seta, acendendo na cor do eixo (ver
      // highlightResizeArrow em viewer3d_composition.js). Vantagem prática: a
      // cor está no lugar exato onde o clique vale, então não tem como "achar"
      // que está em cima e não estar.
      domEl.style.cursor = 'default';
      const setaHover = ViewerProjectEdit.pickResizeArrowAt
        ? ViewerProjectEdit.pickResizeArrowAt(ev.clientX, ev.clientY)
        : null;
      if (ViewerProjectEdit.highlightResizeArrow) {
        ViewerProjectEdit.highlightResizeArrow(setaHover ? setaHover.axis : null);
      }
      return;
    }
    if (state.pointerId !== ev.pointerId) return;
    // BOTÃO JÁ SOLTO = arraste morto (2026-08-13). Relato do Matt: "levo o
    // mouse bem longe e mesmo assim ele fica como se tivesse pegando no modulo
    // ou nas setas... fica tudo balançando". É isto: o pointerup se perdia (o
    // resize re-renderiza a cena a cada frame, e capture/foco podem sumir no
    // meio), o estado do arraste ficava vivo e o módulo continuava seguindo o
    // mouse pra sempre. ev.buttons === 0 é a verdade do hardware — mais
    // confiável que esperar o evento de soltar chegar.
    if (ev.pointerType !== 'touch' && ev.buttons === 0) {
      finishProject3DDrag(ev);
      return;
    }
    const dPx = Math.hypot(ev.clientX - state.startClientX, ev.clientY - state.startClientY);
    if (!state.moved) {
      if (dPx < (state.isTouch ? PROJECT_TOUCH_SLOP_PX : PROJECT_CLICK_MOVE_THRESHOLD_PX)) return;
      // Mexeu: é arraste, não "segurar" — cancela a janela de propriedades.
      clearHold3DTimer();
      state.moved = true;
      state.armed = true;
      // SETAS SOMEM ENQUANTO MOVE (2026-08-13, Matt: "quando eu estou
      // arrastando um movel selecionado as setas ficam paradas no ponto de
      // partida, da uma sensacao ruim de usabilidade"). Mover não reconstrói a
      // cena a cada quadro — só reposiciona o Group, de propósito, porque
      // reconstruir seria caro — então as setas, que são objetos próprios da
      // cena, ficavam plantadas onde o módulo estava. Some com elas no começo
      // do gesto; o fim do arraste (renderProjectCanvas/endDrag3D) redesenha
      // na posição nova.
      // ESTICAR fica de fora: ali a cena É reconstruída a cada quadro
      // (updateProjectSlotDimension), então as setas já acompanham — e some-las
      // tiraria da tela justamente a alça que está sendo arrastada.
      if (state.dragMode !== 'resize' && ViewerProjectEdit.setResizeArrows) {
        ViewerProjectEdit.setResizeArrows(null);
      }
    }
    const slot = projectSlots.find((s) => s.id === state.slotId);
    if (!slot) { projectDrag3DState = null; return; }

    // ---------- GIRAR ----------
    // Arraste HORIZONTAL vira ângulo (0,5° por pixel), quantizado em 5° com
    // ímã nos múltiplos de 90°. O Group é girado ao vivo — sem reconstruir a
    // cena a cada frame, igual ao mover; o render de verdade é no soltar.
    if (state.dragMode === 'rotate') {
      const bruto = state.startRotationDeg + (ev.clientX - state.startClientX) * PROJECT_ROTATE_DEG_PER_PX;
      const q = quantizeProjectRotation(bruto);
      slot.floor_rotation_deg = q.deg;
      if (state.group) state.group.rotation.y = (q.deg * Math.PI) / 180;
      ViewerProjectEdit.updateHoverHighlight();
      showProjectRotateHud(q.deg, q.snapped);
      return;
    }

    // Esticar (largura/altura) é um modo TOTALMENTE separado de mover — ver
    // classificação no pointerdown acima. Delegado pra função própria
    // (reaproveita updateProjectSlotDimension/updateProjectSlotWidthFromLeft,
    // as MESMAS funções que a Vista Frontal 2D já usa — zero lógica de
    // clamp/preset/preço duplicada).
    if (state.dragMode === 'resize') {
      handleProject3DResizeMove(state, slot, ev);
      return;
    }

    // ---------- Arraste de módulo ILHA (no piso) ----------
    // Plano de arraste = piso (y=0). Movimento em X/Z do mundo, com colisão
    // opcional contra as outras ilhas (ver clampFloorSlotAgainstCollision).
    if (state.onFloor) {
      handleProject3DFloorMove(state, slot, ev);
      return;
    }

    // ---------- Passar da parede pro CHÃO ----------
    // Nasceu só pro toque longo (2026-08-08, iPad: "clique longo ... ele pode
    // ser arrastado de uma parede pra outra ou pro chao"), com medo de que num
    // arraste normal "passar o ponteiro por cima do piso viraria conversão
    // acidental".
    //
    // 2026-08-13, Matt: "quando modulo esta em uma parede nao consigo passar
    // ele pro chao. preciso que ele saia da parede pro chao como faz de uma
    // parede pra outra." Ou seja: tem que valer no arraste normal, mouse
    // incluído. O medo da conversão acidental continua legítimo, então em vez
    // de liberar geral a conversão pede uma INTENÇÃO clara — puxar o módulo
    // pra DENTRO do ambiente, além de PROJECT_PULL_TO_FLOOR_MM da parede.
    // Encostar de leve no piso perto do rodapé não converte nada; o toque
    // longo (freeMode) continua convertendo na hora, sem essa distância.
    if (state.freeMode || projectPointerPulledIntoRoom(state, ev)) {
      // ignoreSlotId = o próprio módulo arrastado. SEM isso a conversão nunca
      // acontecia (relato do usuário: "movel nao ta indo da parede pro piso"):
      // o móvel acompanha o ponteiro, então a caixa de clique dele fica sempre
      // entre a câmera e o chão e pickRoomSurfaceAt devolvia null.
      const surface = ViewerProjectEdit.pickRoomSurfaceAt
        ? ViewerProjectEdit.pickRoomSurfaceAt(ev.clientX, ev.clientY, state.slotId)
        : null;
      if (surface && surface.kind === 'floor') {
        const fp = projectFloorPointMm(ev.clientX, ev.clientY);
        if (fp) {
          convertProjectSlotToFloor(slot, fp.xMm, fp.zMm);
          state.onFloor = true;
          state.grabOffsetFloorXMm = 0;
          state.grabOffsetFloorZMm = 0;
          state.prevFloorXMm = fp.xMm;
          state.prevFloorZMm = fp.zMm;
          renderProjectCanvas();
          // A cena foi reconstruída: o Group antigo morreu, readota o novo.
          state.group = ViewerProjectEdit.findGroupBySlotId(slot.id);
          if (state.group) ViewerProjectEdit.setHoverHighlight(state.group);
          // GRUPO: os Groups dos OUTROS membros também morreram na
          // reconstrução (renderProjectCanvas troca todos) — readota.
          refreshProjectGroupCoDragRefs(state);
          return;
        }
      }
    }

    const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === state.liveWallIndex);
    if (!wallGeo) return;
    const hitPoint = ViewerProjectEdit.intersectPlaneAtClient(
      ev.clientX, ev.clientY,
      { x: wallGeo.originX, y: 0, z: wallGeo.originZ },
      { x: wallGeo.intoDirX, y: 0, z: wallGeo.intoDirZ }
    );
    if (!hitPoint) return;

    const alongMm = ((hitPoint.x - wallGeo.originX) * wallGeo.alongDirX + (hitPoint.z - wallGeo.originZ) * wallGeo.alongDirZ) * 1000;
    const heightMm = hitPoint.y * 1000;
    let xMm = alongMm - state.grabOffsetXMm;
    let yMm = clamp(heightMm - state.grabOffsetYMm, 0, projectSlotMaxFloorHeightMm(slot.height_mm, slot.module));

    // Ímã (pedido do usuário 2026-07-26: "os modulos nao tem aproximacao
    // tipo iman") — mesmas funções/candidatos da Vista Frontal 2D
    // (attachProjectSlotDrag): módulos da MESMA parede + o traçado da
    // parede vizinha convertido em pseudo-slots (projectGhostSnapTargets —
    // funciona igual aqui, é só matemática em mm, sem depender de nenhum
    // elemento DOM 2D). Aplicado ANTES da checagem de atravessar a esquina
    // (abaixo) — se o ímã já encostar exatamente na borda da parede, isso
    // não conta como "passar da borda" (só ultrapassar de verdade conta).
    const snapOthers = projectSlotsSameWallExcluding(slot).concat(projectGhostSnapTargets(wallGeo.wallIndex));
    xMm = snapProjectSlotAxis(xMm, Number(slot.width_mm || 0), true, snapOthers, PROJECT_SNAP_3D_MM);
    yMm = snapProjectSlotAxis(yMm, Number(slot.height_mm || 0), false, snapOthers, PROJECT_SNAP_3D_MM);
    // Chão por último: ele ganha de um ímã de módulo que tenha deixado a peça
    // a poucos milímetros do piso (ver PROJECT_FLOOR_SNAP_MM).
    yMm = snapProjectSlotToFloor(yMm);

    // Arrastar até a borda da parede ativa troca de parede (pedido do
    // usuário, confirmado via pergunta de esclarecimento: "arrastar até a
    // borda da parede ativa") — o módulo "atravessa" o canto e continua o
    // arraste na parede vizinha a partir da esquina compartilhada. Só
    // possível se existir vizinha NAQUELA borda (getProjectAdjacentWallEdgeInfo);
    // sem vizinha, clampa na própria borda (mesmo comportamento de sempre).
    const widthMm = Number(slot.width_mm || 0);
    const wallWidthMm = getProjectWallWidthMm(wallGeo.wallIndex);
    const edgeInfo = getProjectAdjacentWallEdgeInfo(wallGeo.wallIndex);

    // FORÇAR CONTRA A PAREDE PRA TROCAR (2026-08-13, pedido do Matt: "deixa
    // ele forçar um pouco contra a parede pra ir pra outra, assim garantimos
    // que ele vai ficar bem encostado").
    //
    // Antes bastava o módulo passar 1mm da borda pra ele pular pro outro lado
    // do canto — e quem só queria encostar acabava trocando de parede sem
    // querer, ou parando ANTES de encostar com medo de pular. Agora existe uma
    // zona morta: dentro dela o módulo trava rente ao canto (fica bem
    // encostado, que é o objetivo); passou dela, aí sim atravessa.
    //
    // O recuo do canto entra na conta porque o fim útil da parede não é a
    // largura dela, é a face interna da vizinha (ver projectWallCornerInsetMm).
    const FORCA_TROCA_MM = 140;
    const recuoCanto = projectWallCornerInsetMm(wallGeo.wallIndex);
    const limEsq = recuoCanto.ini;
    const limDir = wallWidthMm - recuoCanto.fim;
    if (xMm < limEsq && edgeInfo.left && xMm > limEsq - FORCA_TROCA_MM) { xMm = limEsq; }
    else if (xMm + widthMm > limDir && edgeInfo.right && xMm + widthMm < limDir + FORCA_TROCA_MM) { xMm = limDir - widthMm; }

    if (xMm < 0 && edgeInfo.left) {
      const neighborWidthMm = getProjectWallWidthMm(edgeInfo.left.wallIndex);
      // neighborCornerAtZero: a esquina compartilhada fica no x=0 da vizinha
      // (true) ou no x=largura dela (false) — ver getProjectAdjacentWallEdgeInfo.
      const cornerXMm = edgeInfo.left.neighborCornerAtZero ? 0 : Math.max(neighborWidthMm - widthMm, 0);
      slot.wall_index = edgeInfo.left.wallIndex;
      state.liveWallIndex = edgeInfo.left.wallIndex;
      xMm = cornerXMm;
      // Recalcula o offset de agarre NA NOVA parede a partir da posição
      // atual do ponteiro, senão o próximo pointermove usaria um offset
      // calculado no referencial da parede ANTERIOR (eixo along diferente).
      const newWallGeo = getProjectWallGeometry().find((w) => w.wallIndex === state.liveWallIndex);
      if (newWallGeo) {
        const p = ViewerProjectEdit.intersectPlaneAtClient(ev.clientX, ev.clientY,
          { x: newWallGeo.originX, y: 0, z: newWallGeo.originZ }, { x: newWallGeo.intoDirX, y: 0, z: newWallGeo.intoDirZ });
        if (p) state.grabOffsetXMm = ((p.x - newWallGeo.originX) * newWallGeo.alongDirX + (p.z - newWallGeo.originZ) * newWallGeo.alongDirZ) * 1000 - cornerXMm;
      }
      // NÃO chama setProjectActiveWallIndex aqui — ela dispara
      // renderProjectCanvas() (reconstrói a cena 3D inteira + reenquadra a
      // câmera), o que invalidaria state.group NO MEIO do arraste e daria
      // um solavanco visual bem no instante de atravessar o canto. Muda só
      // a variável + os 2 indicadores de UI (abas/campo de largura, ambos
      // sem efeito colateral nenhum na cena 3D) — o rebuild de verdade
      // acontece uma vez só, no soltar (ver endDrag3D/renderProjectCanvas).
      projectActiveWallIndex = state.liveWallIndex;
      refreshProjectWallTabs();
      refreshProjectWallWidthInput();
    } else if (xMm + widthMm > wallWidthMm && edgeInfo.right) {
      const cornerXMm = edgeInfo.right.neighborCornerAtZero ? 0 : Math.max(getProjectWallWidthMm(edgeInfo.right.wallIndex) - widthMm, 0);
      slot.wall_index = edgeInfo.right.wallIndex;
      state.liveWallIndex = edgeInfo.right.wallIndex;
      xMm = cornerXMm;
      const newWallGeo = getProjectWallGeometry().find((w) => w.wallIndex === state.liveWallIndex);
      if (newWallGeo) {
        const p = ViewerProjectEdit.intersectPlaneAtClient(ev.clientX, ev.clientY,
          { x: newWallGeo.originX, y: 0, z: newWallGeo.originZ }, { x: newWallGeo.intoDirX, y: 0, z: newWallGeo.intoDirZ });
        if (p) state.grabOffsetXMm = ((p.x - newWallGeo.originX) * newWallGeo.alongDirX + (p.z - newWallGeo.originZ) * newWallGeo.alongDirZ) * 1000 - cornerXMm;
      }
      // Mesmo motivo do bloco espelhado (borda esquerda) acima — não chamar
      // setProjectActiveWallIndex no meio do arraste.
      projectActiveWallIndex = state.liveWallIndex;
      refreshProjectWallTabs();
      refreshProjectWallWidthInput();
    } else {
      xMm = clamp(xMm, 0, Math.max(0, wallWidthMm - widthMm));
    }

    // COLISÃO (botão, 2026-08-08) — última etapa antes de commitar a posição,
    // DEPOIS do ímã e da troca de parede de propósito: o ímã pode encostar o
    // módulo exatamente na borda do vizinho (posição perfeitamente válida, sem
    // sobreposição), e atravessar a esquina troca o conjunto de vizinhos que
    // conta. Ligada, "para encostado" no primeiro obstáculo do caminho
    // (lateral, acima ou abaixo); desligada, devolve o pedido intacto e o
    // comportamento é o de sempre.
    if (projectCollisionEnabled) {
      // Acabou de ATRAVESSAR a esquina: a posição anterior era no referencial
      // da parede antiga e não diz nada sobre de que lado o módulo está
      // batendo aqui — nesse frame a colisão não bloqueia nada (o próximo
      // frame já tem um "de onde vim" válido nesta parede).
      const crossedWall = (state.prevWallIndex != null && state.prevWallIndex !== state.liveWallIndex);
      const solved = clampWallSlotAgainstCollision(
        slot, xMm, yMm,
        crossedWall ? xMm : state.prevXMm,
        crossedWall ? yMm : state.prevYMm
      );
      xMm = solved.x;
      yMm = solved.y;
    }
    // CHÃO DE NOVO, DEPOIS DA COLISÃO (2026-08-12, 2ª rodada: "nao ta indo pro
    // chao o movel"). A 1ª versão só grudava no chão ANTES do resolvedor de
    // colisão — e ele empurra o módulo pra cima ao encostar em qualquer
    // vizinho, desfazendo o ímã em silêncio. Só reaplica se NÃO houver módulo
    // ocupando o pedaço de parede embaixo dele; com algo embaixo, parar em
    // cima do vizinho é o certo e a colisão é quem manda.
    if (yMm > 0 && yMm <= PROJECT_FLOOR_SNAP_MM
        && !projectSlotHasNeighborBelow(slot, xMm, yMm)) {
      yMm = 0;
    }
    state.prevXMm = xMm;
    state.prevYMm = yMm;
    state.prevWallIndex = state.liveWallIndex;

    slot.x_mm = xMm;
    slot.floor_height_mm = yMm;

    // Preview ao vivo — move o Group de VERDADE direto (mesma fórmula de
    // posição de renderFreeformWalls em viewer3d_composition.js: origin +
    // alongDir*alongOffset + intoDir*depthOffset), sem reconstruir a cena
    // inteira a cada pointermove (caro: refaria todos os assemblies +
    // reenquadraria a câmera). depthOffsetM fica CONSTANTE (capturado no
    // pointerdown, ver acima) — só x_mm/floor_height_mm mudam arrastando.
    // Ao trocar de parede (bloco acima), a rotação também precisa
    // acompanhar na hora — senão o módulo continuaria "de frente" pra
    // parede antiga por um instante, visualmente errado. Só ao SOLTAR
    // (pointerup) um render completo de verdade acontece (resolveProjectSlotDepth
    // + renderProjectCanvas), corrigindo qualquer aproximação daqui.
    const liveWallGeo = getProjectWallGeometry().find((w) => w.wallIndex === state.liveWallIndex);
    if (liveWallGeo && state.group) {
      const alongOffsetM = xMm / 1000 + widthMm / 1000 / 2;
      state.group.position.x = liveWallGeo.originX + liveWallGeo.alongDirX * alongOffsetM + liveWallGeo.intoDirX * state.depthOffsetM;
      state.group.position.z = liveWallGeo.originZ + liveWallGeo.alongDirZ * alongOffsetM + liveWallGeo.intoDirZ * state.depthOffsetM;
      state.group.position.y = yMm / 1000;
      state.group.rotation.y = liveWallGeo.rotationY;
      // Contorno vermelho acompanha o módulo sendo arrastado ao vivo —
      // sem isso ficaria "preso" na posição de onde o hover começou (ver
      // updateHoverHighlight/viewer3d_composition.js: mais barato que
      // recriar o contorno, só atualiza a caixa a partir da posição ATUAL
      // do Group, que acabou de mudar acima).
      ViewerProjectEdit.updateHoverHighlight();
      // GRUPO: os outros membros seguem pelo MESMO delta de mundo, ao vivo
      // (ver applyProjectGroupCoDragPreview) — commit de verdade só no
      // soltar (endDrag3D), igual o módulo agarrado.
      applyProjectGroupCoDragPreview(state);
    }
  });

  const endDrag3D = (ev) => {
    clearHold3DTimer();
    const state = projectDrag3DState;
    if (!state || state.pointerId !== ev.pointerId) {
      // Sem arraste em andamento, um pointerup limpo pode ser a 2ª batida de
      // um DUPLO TOQUE no ambiente (parede/chão) — ver handleRoomDoubleTap.
      if (ev.type === 'pointerup') handleRoomTapForDoubleTap(ev);
      return;
    }
    projectDrag3DState = null;
    domEl.style.cursor = 'default';
    // Giro: some com o aviso e fecha o ciclo com um render de verdade (a
    // colisão da ilha usa a pegada girada, ver floorSlotFootprint).
    if (state.dragMode === 'rotate') {
      hideProjectRotateHud();
      // Girar muda a PEGADA no piso (90° troca largura por profundidade), então
      // o que estava dentro do quadrado pode ter passado a borda.
      const girado = projectSlots.find((s) => s.id === state.slotId);
      if (girado && isFloorSlot(girado)) clampFloorSlotIntoRoom(girado);
      renderProjectCanvas();
      refreshProject3DResizeArrows();
      markProjectDirty();
      return;
    }
    // Toque curto (soltou antes de engatar o arraste) = seleciona. É o
    // caminho normal do tap no iPad. As SETAS de redimensionamento (toque)
    // nascem exatamente daqui — pedido do usuário 2026-08-08: "clique rapido
    // no modulo mantem o vermelho envolta... ele abre setas pra
    // redimencionamento nos sentidos permitidos" (selectProjectSlot já
    // mantém o contorno; refreshProject3DResizeArrows desenha as setas).
    if (!state.moved) {
      if (ev.type !== 'pointercancel') {
        // CLIQUE PARADO: só é "selecionar" se o ponteiro estiver mesmo em cima
        // do módulo. Se não estiver, é "soltar".
        //
        // Sem esta conferência, clicar numa SETA de redimensionamento e não
        // arrastar re-selecionava o módulo — e a seta fica FORA do contorno
        // dele, exatamente no pedaço de parede onde a pessoa clica pra
        // desselecionar ("clico do ladinho dele na parede e não desclica").
        // O ramo de "clique no vazio" do pointerdown nunca era alcançado nesse
        // caso, porque a seta é testada antes e sai com return.
        //
        // Exceção no TOQUE via seta: lá o duplo toque na mesma seta estica o
        // módulo até o vizinho (2026-08-08, iPad) — desselecionar no primeiro
        // toque mataria a segunda batida. No mouse esse duplo clique deixa de
        // existir; arrastar a seta (que é o gesto principal) continua igual.
        // NO TOQUE, A CONFERÊNCIA É GRUDENTA (2026-08-13, iPad).
        //
        // O dedo não é preciso: o navegador reporta o CENTRO da área tocada, e
        // alguns milímetros fora do módulo bastam pra pickAssemblyAt devolver
        // null. Com a conferência simples, o toque curto (que é o gesto de
        // SELECIONAR no iPad) caía no "não tem módulo aqui" e DESSELECIONAVA —
        // é o "não fixa o vermelho após o clique" que o Matt relatou.
        // pickAssemblyAtSticky refaz o teste num anel em volta do ponto, que é
        // exatamente pra isso que ele existe (ver viewer3d_composition.js).
        const slopUp = (ev.pointerType === 'touch') ? PROJECT_STICKY_PICK_PX : 0;
        const sobre = ViewerProjectEdit.pickAssemblyAtSticky
          ? ViewerProjectEdit.pickAssemblyAtSticky(ev.clientX, ev.clientY, projectActiveWallIndex, state.slotId, slopUp)
          : (ViewerProjectEdit.pickAssemblyAt
            ? ViewerProjectEdit.pickAssemblyAt(ev.clientX, ev.clientY, projectActiveWallIndex)
            : null);
        // Conservador de propósito: só solta quando NÃO HÁ MÓDULO NENHUM sob o
        // ponteiro. Se houver outro módulo ali (seta desenhada por cima do
        // vizinho), mantém o comportamento antigo — desselecionar seria uma
        // surpresa pior que a de antes.
        const soltar = !sobre && !(state.viaArrow && state.isTouch);
        if (soltar) { deselectProjectSlot(); return; }
        selectProjectSlot(state.slotId);
        refreshProject3DResizeArrows();
      }
      return;
    }
    const slot = projectSlots.find((s) => s.id === state.slotId);
    if (slot && !isFloorSlot(slot)) {
      resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
    }
    // GRUPO: commit de verdade da posição dos outros membros — grava
    // x_mm/floor_x_mm/floor_z_mm de cada um (ver commitProjectGroupCoDrag),
    // ANTES do render final pra sair tudo junto num quadro só.
    if (slot) commitProjectGroupCoDrag(state, slot);
    renderProjectCanvas();
    refreshProject3DResizeArrows();
    markProjectDirty();
  };
  domEl.addEventListener('pointerup', endDrag3D);
  domEl.addEventListener('pointercancel', endDrag3D);
  // Rede de segurança (2026-08-13): soltar o botão FORA do canvas, trocar de
  // aba/janela no meio do arraste ou o navegador engolir o pointerup deixavam
  // o arraste eternamente vivo — o módulo continuava colado no ponteiro. Os
  // três caminhos agora terminam o gesto. finishProject3DDrag é o mesmo
  // endDrag3D, exposto pra quem está fora deste escopo (ver pointermove).
  finishProject3DDrag = endDrag3D;
  window.addEventListener('pointerup', endDrag3D);
  window.addEventListener('pointercancel', endDrag3D);
  window.addEventListener('blur', () => {
    if (projectDrag3DState) endDrag3D({ type: 'pointercancel', pointerId: projectDrag3DState.pointerId });
  });

  // BOTÃO DIREITO = CRIAR/DESFAZER GRUPO (2026-09-03, Matt: "botao diretio
  // criar grupo"). Sem menu próprio — reaproveita prompt()/confirm()
  // nativos (mesmo padrão já usado no projeto pra nomear coisas, ver
  // saveProjectFavoriteInner). Só faz algo com 2+ módulos na seleção
  // múltipla (Ctrl+clique solto, ou um grupo salvo já expandido pelo clique
  // simples — ver selectProjectSlot); com menos de 2, deixa o menu do
  // sistema operacional aparecer normal (não atrapalha quem só quer
  // inspecionar a página). O resto das ações do grupo (duplicar, ver
  // orçamento, renomear) fica na barra flutuante — ver
  // refreshProjectGroupToolbar, portal-06c.
  domEl.addEventListener('contextmenu', (ev) => {
    if (projectMultiSelectIds.size < 2) return;
    ev.preventDefault();
    const ids = Array.from(projectMultiSelectIds);
    const first = projectSlots.find((s) => s.id === ids[0]);
    const groupMembers = (first && first.group_id)
      ? projectSlots.filter((s) => s.group_id === first.group_id)
      : [];
    const isWholeSavedGroup = groupMembers.length > 0
      && groupMembers.length === ids.length
      && groupMembers.every((s) => projectMultiSelectIds.has(s.id));
    if (isWholeSavedGroup) {
      const nomeGrupo = first.group_name || I18n.t('project.group_default_name');
      if (confirm(I18n.t('project.group_ungroup_confirm', { name: nomeGrupo }))) {
        ungroupProjectSlots(projectMultiSelectIds);
      }
    } else {
      createProjectSlotGroup(projectMultiSelectIds);
    }
  });

  // ---------- Duplo toque no ambiente (2026-08-08, iPad) ----------
  // "duplo clica na parede ele mostra a parede de frente. duplo clique no chao
  // mostra vista de cima". Duas batidas rápidas e próximas no MESMO tipo de
  // superfície contam como duplo toque; qualquer toque em cima de um módulo
  // não chega aqui (pickRoomSurfaceAt devolve null quando tem móvel na
  // frente, e além disso o pointerdown do módulo consome o gesto).
  // Onde o gesto ATUAL começou. Em captura (true) pra rodar antes de qualquer
  // outro handler deste canvas — só registra, não decide nada.
  let inicioGesto3D = null;
  domEl.addEventListener('pointerdown', (ev) => {
    inicioGesto3D = { x: ev.clientX, y: ev.clientY, button: ev.button };
  }, true);

  // O MESMO pointerup chegava aqui DUAS VEZES — e era isso que fazia UM clique
  // valer por dois (2026-08-13).
  //
  // endDrag3D está registrado no canvas E na window (a rede de segurança pro
  // arraste que perdia o pointerup fora do canvas). Como o evento do canvas
  // BORBULHA até a window, os dois listeners recebem o MESMO objeto de evento:
  // a primeira passagem gravava lastRoomTap, a segunda encontrava esse registro
  // com 0ms e 0px de diferença e concluía "duplo toque". Resultado: um clique
  // na parede já jogava a câmera pra frente dela.
  //
  // Comparar a IDENTIDADE do evento resolve independente de quantos listeners
  // chamem — e não depende de qual deles chega primeiro.
  let ultimoEventoRoomTap = null;
  function handleRoomTapForDoubleTap(ev) {
    if (ev === ultimoEventoRoomTap) return;
    ultimoEventoRoomTap = ev;
    if (projectCameraModeOn && ev.pointerType === 'touch') return;
    // SÓ CLIQUE ESQUERDO, E SÓ CLIQUE PARADO (2026-08-13).
    //
    // Relato do Matt: "quando rotaciono com o scroll do mouse, ao soltar ele
    // vai pro frontal da parede que o mouse tá". Era isto: girar é o botão do
    // MEIO, e o pointerup dele caía aqui como se fosse um toque no ambiente.
    // Duas rotações seguidas viravam um "duplo toque" e a câmera pulava pra
    // frente da parede — no meio de um gesto de câmera, que é o pior momento
    // possível.
    //
    // O movimento também importa: soltar o botão depois de arrastar 300px não
    // é clique, é o fim de um giro/pan. 6px é a mesma ordem de grandeza do
    // limiar de clique do arraste de módulo (PROJECT_CLICK_MOVE_THRESHOLD_PX).
    //
    // Zerar lastRoomTap (em vez de só sair) é de propósito: um giro no meio de
    // dois cliques quebra a sequência, senão o segundo clique casaria com um
    // primeiro de antes da rotação.
    if (ev.button !== 0) { lastRoomTap = null; return; }
    if (inicioGesto3D && (inicioGesto3D.button !== 0
      || Math.hypot(ev.clientX - inicioGesto3D.x, ev.clientY - inicioGesto3D.y) > 6)) {
      lastRoomTap = null;
      return;
    }
    const surface = ViewerProjectEdit.pickRoomSurfaceAt
      ? ViewerProjectEdit.pickRoomSurfaceAt(ev.clientX, ev.clientY)
      : null;
    if (!surface) { lastRoomTap = null; return; }
    const now = Date.now();
    const prev = lastRoomTap;
    lastRoomTap = { t: now, x: ev.clientX, y: ev.clientY, kind: surface.kind, wallIndex: surface.wallIndex };
    if (!prev || prev.kind !== surface.kind) return;
    if (now - prev.t > ROOM_DOUBLE_TAP_MS) return;
    if (Math.hypot(ev.clientX - prev.x, ev.clientY - prev.y) > ROOM_DOUBLE_TAP_PX) return;
    lastRoomTap = null;
    applyRoomDoubleTap(surface);
  }

  function applyRoomDoubleTap(surface) {
    if (surface.kind === 'floor') {
      // CHÃO → A CÂMERA FOCA NO PONTO CLICADO (2026-08-13).
      //
      // Antes isto trocava a tela inteira pra Vista Superior 2D. Virou
      // problema quando o Matt ficou clicando na cena pra desselecionar um
      // módulo: dois cliques seguidos no chão jogavam ele numa OUTRA VISTA
      // sem querer. E não era o que ele pediu agora — "2 cliques rápidos pra
      // a câmera focar, tanto chão quanto paredes".
      //
      // Continua dando pra ir pra Vista Superior pelo botão "Top" ali em cima,
      // que é onde se procura por isso.
      //
      // Ângulo: bem de cima, mas não a prumo (y bem maior que z). A prumo o
      // desenho perde a noção de profundidade e o giro fica imprevisível perto
      // do polo. A distância atual da câmera é mantida (frameDirection sem
      // distOverride) — é aproximação de FOCO, não de zoom.
      if (ViewerProjectEdit.frameDirection && surface.point) {
        ViewerProjectEdit.frameDirection({ x: 0, y: 1, z: 0.35 }, surface.point);
      }
      return;
    }
    // Parede → vira a câmera pra encarar essa parede de frente. A parede
    // também vira a ATIVA (mesmo efeito das abas de parede), senão o
    // raycasting continuaria preferindo a anterior perto do canto (ver
    // preferredWallIndex em pickAssemblyAt).
    const idx = Number(surface.wallIndex);
    if (!Number.isFinite(idx)) return;
    const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === idx);
    if (!wallGeo) return;
    projectActiveWallIndex = idx;
    refreshProjectWallTabs();
    refreshProjectWallWidthInput();
    renderProjectCanvas();
    if (ViewerProjectEdit.frameDirection) {
      // Câmera na frente da parede (sentido CONTRÁRIO ao intoDir dela, que
      // aponta pra dentro do ambiente), levemente acima da metade do pé
      // direito pra não ficar rente ao chão.
      //
      // O ALVO é O PONTO CLICADO, não mais o centro da parede (2026-08-13):
      // "2 cliques rápidos pra a câmera FOCAR". Numa parede de 4m, mirar o
      // centro dela quando a pessoa clicou na ponta não é focar. Só a ALTURA
      // continua vindo do meio do pé direito — o ponto clicado no rodapé
      // deixaria a câmera olhando pro chão.
      const midAlongM = wallGeo.widthM / 2;
      const centro = {
        x: wallGeo.originX + wallGeo.alongDirX * midAlongM,
        z: wallGeo.originZ + wallGeo.alongDirZ * midAlongM
      };
      const target = {
        x: surface.point ? surface.point.x : centro.x,
        y: (roomSettings.ceiling_mm / 1000) / 2,
        z: surface.point ? surface.point.z : centro.z
      };
      ViewerProjectEdit.frameDirection({ x: wallGeo.intoDirX, y: 0.18, z: wallGeo.intoDirZ }, target);
    }
  }

  // GIRAR EM TORNO DO MÓDULO SELECIONADO (2026-08-12)
  // "quero chegar bem perto e rotacionar perto do movel sem perder ele do
  // centro da tela." O giro do OrbitControls acontece em volta do ALVO, que é
  // o centro do ambiente — de perto, o raio é tão grande que o móvel sai da
  // tela no primeiro movimento. Aqui, no instante em que o giro COMEÇA (botão
  // do meio, ver mouseButtons em viewer3d_composition.js), o alvo é
  // recentralizado no módulo selecionado. É um pan, não um giro: a cena não
  // salta, o móvel só desliza pro meio e o giro passa a ser em volta dele.
  domEl.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 1) return;                    // só o botão do meio = girar
    if (selectedProjectSlotId == null) return;
    if (!ViewerProjectEdit.centerOrbitOnGroup) return;
    const g = ViewerProjectEdit.findGroupBySlotId(selectedProjectSlotId);
    if (g) ViewerProjectEdit.centerOrbitOnGroup(g);
  }, true);   // captura: precisa rodar ANTES do OrbitControls começar a girar

  // Ponteiro saiu do canvas sem estar arrastando nada — devolve o cursor
  // padrão. NÃO apaga o contorno vermelho: ele é a seleção (2026-08-12), e
  // era justamente isso que fazia o módulo "perder o vermelho" e o Matt
  // perder o controle do que estava editando.
  domEl.addEventListener('pointerleave', () => {
    if (projectDrag3DState) return; // durante um arraste de verdade, mantém (setPointerCapture já garante os eventos)
    domEl.style.cursor = 'default';
  });
}

// Esticar módulo na Vista de Canto 3D (ver classificação dragMode/resizeAxis
// no pointerdown de attachProject3DEditDrag acima) — mesma matemática de
// "borda arrastada" da Vista Frontal 2D (ver attachProjectSlotResizeHandle/
// pointermove documentado ali: updateProjectSlotDimension/
// updateProjectSlotWidthFromLeft, com snapProjectEdge pro ímã), só trocando
// "delta de pixel de tela" por "coordenada absoluta (mm) do raio do ponteiro
// no plano da parede", igual ao arrastar/mover acima. Ao contrário do mover
// (que só atualiza o Group direto, sem re-renderizar a cena inteira a cada
// frame), esticar PRECISA reconstruir a geometria de verdade — não dá pra
// só "escalar" o Group (portas/dobradiças/espessura de peça não devem
// esticar junto) — então updateProjectSlotDimension/updateProjectSlotWidthFromLeft
// chamam renderProjectCanvas() normalmente a cada pointermove, reconstruindo
// a cena (mais pesado que mover, mas correto).
// Arrastar um módulo ILHA pelo PISO (2026-08-08) — contraparte de "mover ao
// longo da parede" pro caso em que o móvel não está preso a parede nenhuma.
// Duas diferenças de fundo: o plano de arraste é horizontal (y=0, ver
// projectFloorPointMm) e a posição guardada é o CENTRO do módulo, não a borda
// esquerda. Igual ao mover de parede, o Group é reposicionado direto a cada
// frame (sem reconstruir a cena) e só o soltar dispara um render de verdade.
function handleProject3DFloorMove(state, slot, ev) {
  // Caminho de VOLTA do arraste livre (toque longo): largar a ilha em cima de
  // uma parede a "encosta" nela de novo, virando módulo de parede. Simétrico
  // ao trecho parede→chão no pointermove (ver freeMode lá).
  if (state.freeMode && ViewerProjectEdit.pickRoomSurfaceAt) {
    // Mesmo motivo do caminho parede→chão: a ilha arrastada tapa a parede
    // atrás dela e precisa ser ignorada no teste.
    const surface = ViewerProjectEdit.pickRoomSurfaceAt(ev.clientX, ev.clientY, state.slotId);
    if (surface && surface.kind === 'wall' && Number.isFinite(Number(surface.wallIndex))) {
      const wallIndex = Number(surface.wallIndex);
      const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === wallIndex);
      if (wallGeo) {
        const alongMm = ((surface.point.x - wallGeo.originX) * wallGeo.alongDirX
          + (surface.point.z - wallGeo.originZ) * wallGeo.alongDirZ) * 1000;
        convertProjectSlotToWall(slot, wallIndex, alongMm - Number(slot.width_mm || 0) / 2, surface.point.y * 1000);
        state.onFloor = false;
        state.liveWallIndex = wallIndex;
        state.prevWallIndex = wallIndex;
        state.prevXMm = Number(slot.x_mm || 0);
        state.prevYMm = Number(slot.floor_height_mm || 0);
        state.grabOffsetXMm = 0;
        state.grabOffsetYMm = 0;
        state.depthOffsetM = Number(slot.depth_mm || 0) / 2000;
        projectActiveWallIndex = wallIndex;
        refreshProjectWallTabs();
        refreshProjectWallWidthInput();
        renderProjectCanvas();
        state.group = ViewerProjectEdit.findGroupBySlotId(slot.id);
        if (state.group) ViewerProjectEdit.setHoverHighlight(state.group);
        refreshProjectGroupCoDragRefs(state);
        return;
      }
    }
  }

  const fp = projectFloorPointMm(ev.clientX, ev.clientY);
  if (!fp) return;
  let xMm = fp.xMm - (state.grabOffsetFloorXMm || 0);
  let zMm = fp.zMm - (state.grabOffsetFloorZMm || 0);

  const solved = clampFloorSlotAgainstCollision(
    slot, xMm, zMm,
    (state.prevFloorXMm != null) ? state.prevFloorXMm : xMm,
    (state.prevFloorZMm != null) ? state.prevFloorZMm : zMm
  );
  xMm = solved.x;
  zMm = solved.y;

  // ---------- VOLTAR PRO ENCOSTO DA PAREDE ----------
  // 2026-08-13, Matt: "agora saiu de uma parede foi pro piso mas nao volta pra
  // parede nem pra outras. preciso que ele pule de uma pra outra. ir e voltar."
  // O caminho de volta existia só no toque longo (freeMode) e exigia apontar
  // EM CIMA da parede — impossível na prática, porque o próprio móvel arrastado
  // fica na frente dela.
  //
  // Agora é por PROXIMIDADE, que é o gesto natural: encostou a traseira do
  // móvel a menos de PROJECT_SNAP_TO_WALL_MM de uma parede (e dentro do trecho
  // dela), ele gruda naquela parede. Vale pra QUALQUER parede do ambiente, o
  // que responde o "nem pra outras". Sair de novo é só puxar pra dentro do
  // ambiente (ver projectPointerPulledIntoRoom).
  const encosto = projectWallToSnapFloorSlot(slot, xMm, zMm);
  if (encosto) {
    convertProjectSlotToWall(slot, encosto.wallIndex, encosto.xMm, 0);
    state.onFloor = false;
    state.liveWallIndex = encosto.wallIndex;
    state.prevWallIndex = encosto.wallIndex;
    state.prevXMm = Number(slot.x_mm || 0);
    state.prevYMm = 0;
    state.grabOffsetXMm = 0;
    state.grabOffsetYMm = 0;
    state.depthOffsetM = Number(slot.depth_mm || 0) / 2000;
    projectActiveWallIndex = encosto.wallIndex;
    refreshProjectWallTabs();
    refreshProjectWallWidthInput();
    renderProjectCanvas();
    state.group = ViewerProjectEdit.findGroupBySlotId(slot.id);
    refreshProject3DHighlight();
    refreshProjectGroupCoDragRefs(state);
    return;
  }

  // NUNCA SAIR DO QUADRADO DO CHÃO (2026-08-13, "no chao nunca deixe ele sair
  // do quadrado do chao") — travado DURANTE o arraste, não só ao soltar: ver o
  // móvel voltando sozinho no fim é pior que ele parar na borda.
  const dentro = clampFloorPointIntoRoom(slot, xMm, zMm);
  xMm = dentro.x;
  zMm = dentro.z;
  state.prevFloorXMm = xMm;
  state.prevFloorZMm = zMm;

  slot.floor_x_mm = xMm;
  slot.floor_z_mm = zMm;
  if (state.group) {
    state.group.position.x = xMm / 1000;
    state.group.position.z = zMm / 1000;
    state.group.position.y = 0;
    ViewerProjectEdit.updateHoverHighlight();
    applyProjectGroupCoDragPreview(state);
  }
}

function handleProject3DResizeMove(state, slot, ev) {
  // ---------- Ilha no chão ----------
  // Sem parede de referência, a matemática de "coordenada ao longo da parede"
  // não existe. Largura/profundidade ancoram na borda OPOSTA à seta agarrada
  // (ver bloco "ANCORAR NA BORDA OPOSTA À SETA" abaixo, 2026-09-02) e a
  // altura sai da interseção com o plano vertical lateral do próprio módulo.
  if (isFloorSlot(slot)) {
    const rot = (Number(slot.floor_rotation_deg || 0) * Math.PI) / 180;
    const axX = Math.cos(rot), axZ = -Math.sin(rot); // eixo local +X no mundo
    const azX = Math.sin(rot), azZ = Math.cos(rot);  // eixo local +Z no mundo
    if (state.resizeAxis === 'height-top') {
      const cx = Number(slot.floor_x_mm || 0) / 1000;
      const cz = Number(slot.floor_z_mm || 0) / 1000;
      const p = ViewerProjectEdit.intersectPlaneAtClient(
        ev.clientX, ev.clientY, { x: cx, y: 0, z: cz }, { x: axX, y: 0, z: axZ }
      );
      if (!p) return;
      updateProjectSlotDimension(slot, 'height', p.y * 1000 - Number(slot.floor_height_mm || 0));
      return;
    }
    const fp = projectFloorPointMm(ev.clientX, ev.clientY);
    if (!fp) return;

    // ANCORAR NA BORDA OPOSTA À SETA (2026-09-02) — Matt: "os paineis estao
    // esticando em ambos os lados, quero que eles estiquem so no sentido da
    // seta selecionada". Antes largura/profundidade da ilha cresciam
    // SIMÉTRICAS em torno do centro (halfMm*2 pros dois lados de largura, e
    // o mesmo pra profundidade) — o centro (floor_x_mm/floor_z_mm) nunca se
    // deslocava, então esticar por QUALQUER seta empurrava a borda de trás
    // junto. Agora a borda do lado OPOSTO à seta agarrada fica fixa (mesma
    // régua já usada nos módulos de parede — width-right ancora a esquerda,
    // width-left ancora a direita): acha o ponto-âncora a partir do
    // centro/tamanho de INÍCIO do arraste (startFloorXMm/startFloorZMm/
    // startWidthMm/startDepthMm — a âncora em si nunca se move durante o
    // arraste), calcula o tamanho novo projetando o ponteiro nesse eixo a
    // partir da âncora, e desloca o centro pra âncora + direção*(tamanho
    // novo/2) antes de aplicar a dimensão — assim a MESMA renderização já
    // sai na posição certa, sem precisar redesenhar duas vezes.
    const dir = (state.resizeAxis === 'width-left') ? { x: -axX, z: -axZ }
      : (state.resizeAxis === 'depth-front') ? { x: azX, z: azZ }
      : { x: axX, z: axZ }; // width-right
    const axisName = (state.resizeAxis === 'depth-front') ? 'depth' : 'width';
    const startSizeMm = (axisName === 'depth') ? state.startDepthMm : state.startWidthMm;
    const anchorXMm = state.startFloorXMm - dir.x * (startSizeMm / 2);
    const anchorZMm = state.startFloorZMm - dir.z * (startSizeMm / 2);
    const rawSizeMm = (fp.xMm - anchorXMm) * dir.x + (fp.zMm - anchorZMm) * dir.z;
    const newSizeMm = projectSlotClampedDimensionMm(slot, axisName, rawSizeMm);
    slot.floor_x_mm = anchorXMm + dir.x * (newSizeMm / 2);
    slot.floor_z_mm = anchorZMm + dir.z * (newSizeMm / 2);
    updateProjectSlotDimension(slot, axisName, newSizeMm);
    return;
  }

  const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === state.liveWallIndex);
  if (!wallGeo) return;

  // PROFUNDIDADE (2026-08-13) — caminho próprio: as outras duas medidas vivem
  // no plano DA PAREDE, mas profundidade cresce PERPENDICULAR a ele, e nesse
  // plano o ponteiro não diz nada. A leitura aqui é no plano HORIZONTAL na
  // altura do meio do módulo: a distância do ponto até a parede é a
  // profundidade. Sem ímã de propósito — profundidade não alinha com vizinho,
  // alinha com o corpo do móvel, e o cliente escolhe um valor de catálogo.
  if (state.resizeAxis === 'depth-front') {
    const yMeioM = (Number(slot.floor_height_mm || 0) + Number(slot.height_mm || 0) / 2) / 1000;
    const p = ViewerProjectEdit.intersectPlaneAtClient(
      ev.clientX, ev.clientY, { x: 0, y: yMeioM, z: 0 }, { x: 0, y: 1, z: 0 }
    );
    if (!p) return;
    const distMm = ((p.x - wallGeo.originX) * wallGeo.intoDirX + (p.z - wallGeo.originZ) * wallGeo.intoDirZ) * 1000;
    updateProjectSlotDimension(slot, 'depth', distMm);
    return;
  }

  const hitPoint = ViewerProjectEdit.intersectPlaneAtClient(
    ev.clientX, ev.clientY,
    { x: wallGeo.originX, y: 0, z: wallGeo.originZ },
    { x: wallGeo.intoDirX, y: 0, z: wallGeo.intoDirZ }
  );
  if (!hitPoint) return;

  const alongMm = ((hitPoint.x - wallGeo.originX) * wallGeo.alongDirX + (hitPoint.z - wallGeo.originZ) * wallGeo.alongDirZ) * 1000;
  const heightMm = hitPoint.y * 1000;
  const others = projectSlotsSameWallExcluding(slot).concat(projectGhostSnapTargets(wallGeo.wallIndex));

  if (state.resizeAxis === 'width-right') {
    const rawRightEdge = alongMm - state.grabOffsetEdgeMm;
    const snappedRightEdge = snapProjectEdge(rawRightEdge, true, others, PROJECT_SNAP_3D_MM);
    updateProjectSlotDimension(slot, 'width', snappedRightEdge - Number(slot.x_mm || 0));
  } else if (state.resizeAxis === 'width-left') {
    const rawLeftEdge = alongMm - state.grabOffsetEdgeMm;
    const snappedLeftEdge = snapProjectEdge(rawLeftEdge, true, others, PROJECT_SNAP_3D_MM);
    updateProjectSlotWidthFromLeft(slot, (state.startXMm + state.startWidthMm) - snappedLeftEdge);
  } else if (state.resizeAxis === 'height-top') {
    const rawTopEdge = heightMm - state.grabOffsetEdgeMm;
    const snappedTopEdge = snapProjectEdge(rawTopEdge, false, others, PROJECT_SNAP_3D_MM);
    updateProjectSlotDimension(slot, 'height', snappedTopEdge - Number(slot.floor_height_mm || 0));
  }
}

// ---------- Vista Superior (plan view, só leitura) ----------
// Pedido do usuário (2026-07-24): "temos visao frontal. quero uma visao de
// cima, paralela, com um botao em cima pra trocar de superior pra frontal".
// O app NUNCA guardou uma coordenada de profundidade real por módulo — só
// x_mm (posição horizontal) e z_order (um índice de "quem tampa quem" na
// vista frontal, ver resolveProjectSlotDepth). Então a profundidade daqui é
// DERIVADA, não editável: cada camada de z_order fica atrás de qualquer
// módulo de z_order menor que ela sobreponha no eixo X, a uma distância
// igual à profundidade (depth_mm) real desse módulo da frente. É uma
// aproximação pra dar noção de empilhamento frente/fundo, por isso a vista
// é só leitura (clique seleciona, mas não arrasta/estica) — mover/redimensionar
// continua sendo feito na vista Frontal.
function computeProjectSlotsTopViewLayout(slotsList) {
  const sorted = slotsList.slice().sort((a, b) => Number(a.z_order || 0) - Number(b.z_order || 0));
  const resolved = [];
  sorted.forEach((slot) => {
    const x0 = Number(slot.x_mm || 0);
    const x1 = x0 + Number(slot.width_mm || 0);
    let depthOffsetMm = 0;
    resolved.forEach((r) => {
      const overlapsX = x0 < r.x1 && x1 > r.x0;
      if (overlapsX && Number(r.slot.z_order || 0) < Number(slot.z_order || 0)) {
        depthOffsetMm = Math.max(depthOffsetMm, r.depthOffsetMm + Number(r.slot.depth_mm || 0));
      }
    });
    resolved.push({ slot, x0, x1, depthOffsetMm });
  });
  return resolved;
}

// VISTA SUPERIOR = PLANTA BAIXA DE VERDADE (2026-08-18)
// ==========================================================================
// A versao antiga (computeProjectWallTopViewPlacements) montava a vista de
// cima a partir dos PAPEIS legados 'main'/'left'/'right', com uma regra fixa
// por papel ("left nasce na ponta esquerda da main e cresce pra dentro").
// Isso so descrevia as 3 formas fixas de ambiente, aposentadas em 2026-08-13
// quando as paredes viraram planta desenhada (projectWallSegments). Com a
// forma legada travada em 'single', a Vista Superior:
//   - so desenhava os modulos da parede 0 (roles tinha 1 item);
//   - nao tinha como representar parede em angulo qualquer nem parede fora
//     das posicoes L/C-U.
//
// Agora a fonte e getProjectWallGeometry() — origem, direcao e comprimento
// REAIS de cada segmento, o mesmo que o 3D e o editor de paredes usam. Cada
// modulo e projetado direto no plano XZ do mundo (mm), e o desenho e o
// bounding box de tudo (paredes + modulos + ilhas) com uma margem. Parede
// torta sai torta, com o modulo girado junto (transform: rotate).
//
// O que NAO mudou: a profundidade do modulo de parede continua DERIVADA de
// z_order (computeProjectSlotsTopViewLayout, funcao acima, intacta) — por
// isso o contorno tracejado continua avisando que e aproximacao. Modulo ILHA
// (chao) continua com posicao real, sem aproximacao nenhuma.
//
// Sistema de coordenadas devolvido: screenX/screenY em MILIMETROS a partir do
// canto superior esquerdo do desenho (ja com a margem), com X = mundo X e
// Y = mundo Z. angleDeg gira o retangulo em torno do proprio canto (0,0).
function computeProjectTopViewPlan() {
  const walls = getProjectWallGeometry().map((w) => {
    const lenMm = Number(w.widthM || 0) * 1000;
    return {
      wallIndex: w.wallIndex,
      oculta: !!w.oculta,
      xMm: Number(w.originX || 0) * 1000,
      zMm: Number(w.originZ || 0) * 1000,
      alongX: Number(w.alongDirX || 0), alongZ: Number(w.alongDirZ || 0),
      intoX: Number(w.intoDirX || 0), intoZ: Number(w.intoDirZ || 0),
      lenMm,
      angleDeg: Math.atan2(Number(w.alongDirZ || 0), Number(w.alongDirX || 0)) * 180 / Math.PI
    };
  });

  const items = [];
  // Bounding box acumulado ponto a ponto (nada de Math.min(...array): com
  // muitos modulos o spread estoura a pilha).
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const eat = (x, z) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  };

  walls.forEach((wall) => {
    eat(wall.xMm, wall.zMm);
    eat(wall.xMm + wall.alongX * wall.lenMm, wall.zMm + wall.alongZ * wall.lenMm);
    computeProjectSlotsTopViewLayout(projectSlotsOnWall(wall.wallIndex)).forEach(({ slot, depthOffsetMm }) => {
      const wMm = Number(slot.width_mm || 0);
      const dMm = Number(slot.depth_mm || 0);
      const alongMm = Number(slot.x_mm || 0);
      // Canto do modulo mais proximo da ponta de origem da parede, ja
      // afastado da parede pelo depthOffset (empilhamento por z_order).
      const x = wall.xMm + wall.alongX * alongMm + wall.intoX * depthOffsetMm;
      const z = wall.zMm + wall.alongZ * alongMm + wall.intoZ * depthOffsetMm;
      items.push({ slot, xMm: x, zMm: z, wMm, dMm, angleDeg: wall.angleDeg });
      // Os 4 cantos entram no enquadramento (a parede pode estar em angulo).
      eat(x, z);
      eat(x + wall.alongX * wMm, z + wall.alongZ * wMm);
      eat(x + wall.intoX * dMm, z + wall.intoZ * dMm);
      eat(x + wall.alongX * wMm + wall.intoX * dMm, z + wall.alongZ * wMm + wall.intoZ * dMm);
    });
  });

  // Modulos ILHA (soltos no chao, 2026-08-08 — ver isFloorSlot): a Vista
  // Superior e EXATAMENTE o plano onde eles vivem, entao a posicao e a real.
  // floor_x_mm/floor_z_mm sao o CENTRO (mesma convencao do group no 3D).
  // Giro de 90/270 troca largura por profundidade em vez de rotacionar o
  // retangulo — o desenho fica igual e o rotulo continua na horizontal.
  projectFloorSlots().forEach((slot) => {
    const rot = ((Number(slot.floor_rotation_deg || 0) % 360) + 360) % 360;
    const swapped = (rot === 90 || rot === 270);
    const wMm = swapped ? Number(slot.depth_mm || 0) : Number(slot.width_mm || 0);
    const dMm = swapped ? Number(slot.width_mm || 0) : Number(slot.depth_mm || 0);
    const x = Number(slot.floor_x_mm || 0) - wMm / 2;
    const z = Number(slot.floor_z_mm || 0) - dMm / 2;
    items.push({ slot, xMm: x, zMm: z, wMm, dMm, angleDeg: 0 });
    eat(x, z); eat(x + wMm, z + dMm);
  });

  if (!Number.isFinite(minX)) { minX = 0; maxX = 0; minZ = 0; maxZ = 0; }
  const rawWidthMm = Math.max(maxX - minX, 100);
  const rawDepthMm = Math.max(maxZ - minZ, 100);
  // Margem: nunca menor que 300mm, e proporcional em ambiente grande — o
  // desenho nao pode nascer colado nas bordas do canvas.
  const marginMm = Math.max(300, Math.max(rawWidthMm, rawDepthMm) * 0.06);
  const originXMm = minX - marginMm;
  const originZMm = minZ - marginMm;

  return {
    // Origem do desenho no MUNDO — quem converte pixel de volta pra
    // coordenada de mundo (drop de modulo na Vista Superior) precisa dela.
    originXMm, originZMm,
    widthMm: rawWidthMm + marginMm * 2,
    depthMm: rawDepthMm + marginMm * 2,
    rawWidthMm, rawDepthMm,
    walls: walls.map((w) => ({
      ...w,
      screenX: w.xMm - originXMm,
      screenY: w.zMm - originZMm
    })),
    placements: items.map((it) => ({
      slot: it.slot,
      screenX: it.xMm - originXMm,
      screenY: it.zMm - originZMm,
      screenW: it.wMm,
      screenH: it.dMm,
      angleDeg: it.angleDeg
    }))
  };
}

// Origem (canto superior esquerdo do desenho) da ultima Vista Superior
// desenhada, em coordenada de MUNDO — ver dropProjectModuleAt, que precisa
// dela pra transformar "onde o mouse soltou" em posicao de ilha no chao.
let projectTopViewOrigin = { xMm: 0, zMm: 0 };

function renderProjectCanvasTop(canvas, wrap, dimsLabel, unit) {
  const plan = computeProjectTopViewPlan();
  projectTopViewOrigin = { xMm: plan.originXMm, zMm: plan.originZMm };

  const availableWidthPx = Math.max(wrap.clientWidth - 4, 320);
  const wrapTop = wrap.getBoundingClientRect().top;
  const availableHeightPx = Math.max(window.innerHeight - wrapTop - 40, 240);
  // Mesma escala nos dois eixos (vista PARALELA/ortografica, como pedido —
  // nao "esticar" um eixo mais que o outro) — usa a menor das duas pra caber
  // inteira na tela.
  projectPxPerMm = clamp(Math.min(availableWidthPx / plan.widthMm, availableHeightPx / plan.depthMm), 0.015, 0.8);

  canvas.style.width = Math.round(plan.widthMm * projectPxPerMm) + 'px';
  canvas.style.height = Math.round(plan.depthMm * projectPxPerMm) + 'px';
  canvas.innerHTML = '';
  canvas.classList.add('po-proj-canvas-top-mode');
  // Vista Superior sempre usa o canvas 2D plano — garante que a cena 3D
  // (renderProjectCanvasFrontCorner) fique escondida (so aparece no 'front').
  canvas.style.display = '';
  const edit3dWrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  if (edit3dWrap) edit3dWrap.style.display = 'none';

  // Uma linha por PAREDE DESENHADA, na posicao e no angulo dela. Parede
  // oculta (2026-08-13) some aqui igual some no 3D — os dois desenhos tem que
  // concordar sobre o que esta escondido.
  plan.walls.forEach((wall) => {
    if (wall.oculta) return;
    const line = document.createElement('div');
    line.className = 'po-proj-canvas-top-wall-seg' + (wall.wallIndex === projectActiveWallIndex ? ' active' : '');
    line.style.left = Math.round(wall.screenX * projectPxPerMm) + 'px';
    line.style.top = Math.round(wall.screenY * projectPxPerMm) + 'px';
    line.style.width = Math.round(wall.lenMm * projectPxPerMm) + 'px';
    line.style.transform = `rotate(${wall.angleDeg}deg)`;
    line.title = `${wall.wallIndex + 1} · ${formatDimension(Math.round(wall.lenMm), unit)}`;
    line.addEventListener('click', () => setProjectActiveWallIndex(wall.wallIndex));
    canvas.appendChild(line);
  });

  if (dimsLabel) {
    dimsLabel.textContent = I18n.t('project.top_view_dims_label', {
      w: formatDimension(Math.round(plan.rawWidthMm), unit),
      d: formatDimension(Math.round(plan.rawDepthMm), unit)
    });
  }

  plan.placements.forEach(({ slot, screenX, screenY, screenW, screenH, angleDeg }) => {
    const div = document.createElement('div');
    div.className = 'po-proj-slot po-proj-slot-top' + (slot.id === selectedProjectSlotId ? ' selected' : '');
    div.dataset.slotId = slot.id;
    div.style.left = Math.round(screenX * projectPxPerMm) + 'px';
    div.style.top = Math.round(screenY * projectPxPerMm) + 'px';
    div.style.width = Math.round(screenW * projectPxPerMm) + 'px';
    div.style.height = Math.round(screenH * projectPxPerMm) + 'px';
    // Parede em angulo -> o modulo gira junto, em torno do proprio canto de
    // origem (transform-origin: 0 0 no CSS). Angulo 0 nao emite transform
    // nenhum, entao o caso comum (parede reta) fica identico ao de antes.
    if (Math.abs(angleDeg) > 0.01) div.style.transform = `rotate(${angleDeg}deg)`;
    div.style.background = projectSlotColorSwatch(slot);
    div.title = slot.module.name;
    div.innerHTML = `
      <div class="po-proj-slot-label">
        <div class="po-proj-slot-name">${slot.module.name}</div>
        <div class="po-proj-slot-dims">${formatDimension(slot.width_mm, unit)} x ${formatDimension(slot.depth_mm, unit)}</div>
      </div>
    `;
    div.addEventListener('click', () => selectProjectSlot(slot.id));
    canvas.appendChild(div);
  });
}

// ---------- Mini Vista Superior (fixa ao lado da Frontal) ----------
// Pedido do usuário (2026-07-26): "quando seleciono so uma [parede] nao
// consigo ver o que tem nas outras... gostaria de uma tela pequena ao lado
// pra ver as outras e ter uma nocao melhor do que tem no ambiente". Perguntado
// o formato (miniaturas de elevação x Vista Superior fixa x os dois juntos) —
// escolheu manter a Vista Superior (já existente) sempre visível numa faixa
// menor ao lado da Frontal, em vez de precisar trocar de aba toda vez.
// Só aparece com 2-3 paredes (single não precisa disso, só tem 1 parede) e só
// quando o modo principal é 'front' — no modo 'top' o canvas grande já É essa
// vista, mostrar de novo no mini seria redundante.
// IMPORTANTE: usa uma escala LOCAL (miniPxPerMm), NUNCA escreve na variável
// global projectPxPerMm — essa global é lida pelo arraste/resize da Frontal
// GRANDE (ver comentário em cima da declaração de projectPxPerMm) enquanto
// esse painel mini está sendo desenhado ao lado dela; se o mini pisasse na
// global, arrastar um módulo na tela grande ficaria com a conta errada.
function renderProjectMiniTopView() {
  // DESLIGADA desde 2026-07-26 (pedido do usuário: "pode tirar visao top do
  // lado, aumentar a tela de projeto") — a Vista de Canto 3D ja mostra todas
  // as paredes de uma vez, o painel virou redundante.
  //
  // Em 2026-08-18 o corpo foi ESVAZIADO: ele era a unica outra chamadora de
  // computeProjectWallTopViewPlacements, que deixou de existir quando a Vista
  // Superior passou a sair da planta desenhada (ver computeProjectTopViewPlan).
  // Manter o corpo velho aqui seria guardar codigo que nao roda E nao compila
  // com a fonte nova. Se um dia o painel voltar, ele se reescreve em cima de
  // computeProjectTopViewPlan, que ja devolve tudo em coordenada de tela.
  const wrapEl = document.getElementById('po-proj-mini-top-wrap');
  const canvas = document.getElementById('po-proj-mini-top-canvas');
  if (!wrapEl || !canvas) return;
  wrapEl.style.display = 'none';
  canvas.innerHTML = '';
}


// Instância 3D PRÓPRIA da aba Projetos (createInstance, ver
// viewer3d_composition.js) — renderer/scene/câmera/estado de porta-gaveta
// totalmente separados de ViewerComposition (aba Composição), pra não colidir
// se o cliente tiver as duas cenas montadas na mesma sessão (abas diferentes
// do portal, mas o DOM/JS de ambas convive na mesma página).
const ViewerProject = (typeof ViewerComposition !== 'undefined' && ViewerComposition.createInstance)
  ? ViewerComposition.createInstance()
  : null;

// Junção automática de rodapé (migration 137, pedido do Matt 2026-08-23) —
// botão "Encaixe" da barra, mesmo padrão de projectCollisionEnabled
// (portal-06b): persiste em localStorage, .active pinta o ícone. Nasce
// LIGADO (pedido original) — só fica desligado se o Matt já tiver desligado
// antes nesta máquina.
//
// BUG CORRIGIDO (2026-08-23, "esse botao nao consigo desselecionar"): existem
// TRÊS cenas 3D independentes nesta aba, cada uma sua própria instância de
// ViewerComposition.createInstance() (portas/gavetas/rodapé são estado POR
// INSTÂNCIA, de propósito — ver comentário em createViewerComposition3D):
//   - ViewerProject     -> modal "Visualizar 3D" (generateProject3D, abaixo)
//   - ViewerProjectEdit -> Vista de Canto interativa (o canvas principal que
//     o cliente vê o tempo todo, ver renderProjectCanvasFrontCorner em
//     portal-06c-projetos-canvas-3d-acoes.js) — É ESTA que o Matt está
//     olhando quando clica o botão.
// O botão só sincronizava ViewerProject — a cena que o Matt via de verdade
// (ViewerProjectEdit) nascia sempre com autoJoinBaseboards=true e NUNCA era
// tocada, então parecia "preso" ligado não importa quantas vezes clicasse.
// Sincroniza as DUAS agora, sempre juntas.
function syncBaseboardJoinToViewer(viewer, enabled) {
  if (viewer && viewer.areBaseboardsAutoJoined && viewer.toggleAutoJoinBaseboards) {
    if (viewer.areBaseboardsAutoJoined() !== enabled) viewer.toggleAutoJoinBaseboards();
  }
}

let projectBaseboardJoinEnabled = true;
try {
  const saved = localStorage.getItem('legno_proj_baseboard_join');
  if (saved != null) projectBaseboardJoinEnabled = saved === '1';
} catch (e) { /* ok sem persistir */ }
syncBaseboardJoinToViewer(ViewerProject, projectBaseboardJoinEnabled);
syncBaseboardJoinToViewer(typeof ViewerProjectEdit !== 'undefined' ? ViewerProjectEdit : null, projectBaseboardJoinEnabled);

function setProjectBaseboardJoinEnabled(on) {
  projectBaseboardJoinEnabled = !!on;
  try { localStorage.setItem('legno_proj_baseboard_join', projectBaseboardJoinEnabled ? '1' : '0'); } catch (e) { /* ok */ }
  const btn = document.getElementById('po-proj-baseboard-join-btn');
  if (btn) btn.classList.toggle('active', projectBaseboardJoinEnabled);
  syncBaseboardJoinToViewer(ViewerProject, projectBaseboardJoinEnabled);
  syncBaseboardJoinToViewer(typeof ViewerProjectEdit !== 'undefined' ? ViewerProjectEdit : null, projectBaseboardJoinEnabled);
  // Refaz as cenas AGORA — sem isso o botão só valeria da próxima vez que
  // algo mais mexesse no projeto (mover módulo, trocar cor...), o que pro
  // usuário parece um botão quebrado. generateProject3D() é só o modal
  // "Visualizar 3D"; renderProjectCanvas() é o canvas principal (Vista de
  // Canto) que o Matt realmente está olhando — os dois precisam redesenhar.
  generateProject3D();
  if (typeof renderProjectCanvas === 'function') renderProjectCanvas();
}

// Monta os assemblies 3D dos módulos soltos no ambiente (mesma lógica de
// buildCompositionAssemblies, ver comentário lá) + x_m/z_order (posição
// livre no chão e profundidade da pilha, exclusivos do canvas 2D da
// Projetos — a Composição não tem, sempre empilha em coluna única).
function buildProjectAssemblies(slotsList) {
  // MÓDULO OCULTO não é desenhado (2026-08-13). É filtro de visualização: ele
  // continua no projeto, no preço e no pedido — some só da cena, pra dar de
  // ver o que está atrás. "Mostrar tudo" na barra traz de volta.
  return (slotsList || []).filter((s) => !s.oculto).map((slot) => {
    const moduleDims = { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm };
    // projectSlotEffectivePieces (e não slot.pieces): é ele que soma o que o
    // construtor de armário gerou — sem isso a prateleira inserida existe no
    // preço e some do 3D.
    const parts = resolvePiecesForViewer(projectSlotEffectivePieces(slot), moduleDims, slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides);
    const openState = {
      doors: (ViewerProject && ViewerProject.areDoorsOpen) ? ViewerProject.areDoorsOpen() : false,
      drawers: (ViewerProject && ViewerProject.areDrawersOpen) ? ViewerProject.areDrawersOpen() : false
    };
    const assembly = Viewer3D.buildStandaloneAssembly(parts, slot.width_mm, slot.height_mm, slot.depth_mm, openState);
    if (assembly) {
      assembly.id = slot.id;
      // Camada "Decoração" do botão de camadas (02/09, pedido do Matt: "tirar
      // so os eletros, com isso eu consigo" + "incluir decoracao... como
      // camada unica") — marca o assembly INTEIRO (não peça a peça) porque o
      // toggle esconde o módulo de decoração de uma vez, não peça por peça
      // dele. Lido em renderFreeformWalls (viewer3d_composition.js), que
      // repassa pro userData do group de verdade que entra na cena.
      assembly.isDecoration = !!(slot.module && slot.module.is_decoration);
      assembly.floor_height_m = Number(slot.floor_height_mm || 0) / 1000;
      assembly.x_m = Number(slot.x_mm || 0) / 1000;
      assembly.z_order = Number(slot.z_order || 0);
      // Módulo ILHA (2026-08-08, ver isFloorSlot): posição em coordenadas de
      // MUNDO no piso em vez de "ao longo da parede". renderFreeformWalls lê
      // floorX/floorZ/rotationY (options.floorAssemblies) e ignora x_m/z_order.
      if (isFloorSlot(slot)) {
        assembly.floorX = Number(slot.floor_x_mm || 0) / 1000;
        assembly.floorZ = Number(slot.floor_z_mm || 0) / 1000;
        assembly.rotationY = (Number(slot.floor_rotation_deg || 0) * Math.PI) / 180;
      }

      // "Movimentação/Rotação fina" 3 eixos (2026-08-23, pedido do Matt: "sao
      // os 3 sentidos... rotacao nos 3 sentidos tambem", com referência ao
      // Promob) — ver nudgeProjectWallSlot/nudgeProjectFloorSlot em
      // portal-06c-projetos-canvas-3d-acoes.js. Só os eixos que JÁ eram reais
      // (x_mm/floor_height_mm de parede; floor_x_mm/floor_z_mm/floor_rotation_deg
      // de ilha) continuam com colisão/clamp de verdade. Os eixos que o modelo
      // de dados não tinha (Z de parede = afastar da parede; Y de ilha =
      // elevar do chão; e QUALQUER rotação além do giro vertical da ilha) são
      // um ajuste FINO só visual — mesmo princípio já usado em offset_x_mm/
      // offset_z_mm de position_role='front' (26-modulo-pecas-3d.js): não
      // participa de colisão nem aparece nas vistas 2D (planta/frontal), só
      // na cena 3D de verdade (renderFreeformWalls, viewer3d_composition.js).
      assembly.fineOffsetZ_m = Number(slot.fineOffsetZMm || 0) / 1000; // parede: afasta da parede
      assembly.fineOffsetY_m = Number(slot.fineOffsetYMm || 0) / 1000; // ilha: eleva do chão
      assembly.fineRotX = (Number(slot.fineRotXDeg || 0) * Math.PI) / 180;
      assembly.fineRotY = (Number(slot.fineRotYDeg || 0) * Math.PI) / 180; // só parede — ilha usa rotationY (floor_rotation_deg) acima
      assembly.fineRotZ = (Number(slot.fineRotZDeg || 0) * Math.PI) / 180;

      // Caixa invisível de "alvo de clique" (pedido do usuário 2026-07-26:
      // "nao estou conseguindo chegar com o mause no modulo baixo") — o
      // raycaster da Vista de Canto 3D (pickAssemblyAt, ver
      // viewer3d_composition.js) testa contra a geometria de VERDADE
      // (portas/prateleiras/laterais); um módulo com vãos abertos
      // (prateleira sem fundo, gaveteiro aberto etc.) tem "buracos" sem
      // nenhum triângulo — clicar no meio de um vão desses não acerta nada
      // do jeito que o usuário esperaria (o contorno visual do módulo
      // parece clicável por inteiro). Uma caixa transparente do tamanho
      // TOTAL do módulo, filha do mesmo group, garante que qualquer ponto
      // dentro do contorno visual seja clicável — não aparece na
      // renderização (opacity 0 + depthWrite false), só existe pro
      // raycaster. Convenção local do group (ver posicionamento em
      // renderFreeformWalls/render/renderFreeform, viewer3d_composition.js):
      // X e Z centralizados (-metade..+metade), Y do CHÃO pro topo
      // (0..height_m) — por isso o offset (0, height_m/2, 0): BoxGeometry
      // nasce centrada nos 3 eixos, essa translação alinha com a convenção
      // Y do group.
      // A CAIXA SEGUE O QUE ESTÁ DESENHADO, não a medida declarada
      // (2026-08-13). Antes ela era um bloco de width×height×depth do slot,
      // e essa é a diferença que o Matt sentiu: "o clique ta pegando no
      // módulo mesmo estando longe dele... quero o clique somente onde o
      // móvel está aparecendo na tela".
      //
      // Medida declarada ≠ volume ocupado sempre que alguma peça não existe
      // nessa configuração: opcional desmarcado, peça escondida por
      // visibilidade condicional (migration 031), peça-módulo que não coube no
      // preset travado, módulo de base/rodapé com altura de slot grande. Em
      // todos esses casos sobrava caixa invisível no ar, e clicar no vazio
      // selecionava o móvel.
      //
      // Box3.setFromObject devolve a caixa em coordenadas de MUNDO; aqui o
      // group ainda está na origem, sem rotação (quem posiciona é
      // renderFreeformWalls, depois), então mundo == local. Se isso mudar um
      // dia, esta conta passa a precisar da inversa da matriz do group.
      //
      // A caixa continua existindo (não dá pra raycastar só a geometria real):
      // um módulo de prateleiras abertas tem buracos sem triângulo nenhum, e
      // clicar no meio de um vão desses tem que selecionar o módulo — foi o
      // pedido de 2026-07-26 ("nao estou conseguindo chegar com o mause no
      // modulo baixo"). O que muda é só o TAMANHO dela.
      if (typeof THREE !== 'undefined') {
        let caixa = null;
        try {
          assembly.group.updateMatrixWorld(true);
          const b = new THREE.Box3().setFromObject(assembly.group);
          if (!b.isEmpty()) caixa = b;
        } catch (e) { caixa = null; }
        // MÓDULO QUE NÃO DESENHA NADA NÃO É CLICÁVEL no 3D. Antes ele ganhava
        // uma caixa do tamanho declarado: um volume invisível de 2 metros que
        // roubava o clique de quem mirava o ambiente atrás. Continua
        // selecionável pelo card do canvas 2D, que é onde ele aparece.
        // TETO DURO: a caixa NUNCA passa da medida declarada do módulo
        // (2026-08-13, 2ª rodada — o Matt mandou um print marcando de vermelho
        // a área onde o clique ainda pegava o módulo: era MUITO maior que o
        // móvel e maior até que as setas).
        //
        // A bounding box da geometria sozinha não bastava porque ela cresce
        // com QUALQUER coisa desenhada no group: peça com offset errado no
        // cadastro, porta desenhada aberta, peça-módulo aninhada que escapou
        // do casco. Um triângulo perdido a 1m de distância e a caixa inteira
        // vai junto — invisível, e catando clique no ambiente todo.
        //
        // Então a caixa final é a INTERSEÇÃO: bounding box do que está
        // desenhado ∩ caixa declarada do módulo (com folga). A folga da
        // FRENTE é maior porque porta sobreposta protrui de verdade
        // (viewer3d.placeFrontGroupInBox põe em z = D/2 + espessura + gap) e
        // ela É clicável.
        //
        // Convenção do group (renderFreeformWalls): X e Z centrados
        // (-metade..+metade), Y do CHÃO pro topo (0..altura).
        if (caixa) {
          const wM = Number(slot.width_mm || 0) / 1000;
          const hM = Number(slot.height_mm || 0) / 1000;
          const dM = Number(slot.depth_mm || 0) / 1000;
          // Folgas ENXUTAS (2026-08-13, depois do print do Matt): 2cm em volta
          // fazia a caixa de clique — e, por tabela, o contorno vermelho —
          // sobrar visivelmente do móvel. 2mm cobre arredondamento sem dar
          // auréola. Na frente, 2cm ainda cobre a porta sobreposta.
          const FOLGA = 0.002;
          const FOLGA_FRENTE = 0.02;
          if (wM > 0 && hM > 0 && dM > 0) {
            const limite = new THREE.Box3(
              new THREE.Vector3(-wM / 2 - FOLGA, -FOLGA, -dM / 2 - FOLGA),
              new THREE.Vector3(wM / 2 + FOLGA, hM + FOLGA, dM / 2 + FOLGA_FRENTE)
            );
            caixa.intersect(limite);
            // Interseção vazia = a geometria inteira está fora da caixa
            // declarada (cadastro bem errado). Cai na caixa declarada, que é o
            // pior caso aceitável — nunca no bounding box solto.
            if (caixa.isEmpty()) caixa = limite;
          }
          const tam = caixa.getSize(new THREE.Vector3());
          const meio = caixa.getCenter(new THREE.Vector3());
          // Piso de 1cm por eixo: um módulo de uma peça plana só (prateleira
          // solta) viraria uma caixa sem volume, impossível de acertar.
          const hitboxGeom = new THREE.BoxGeometry(
            Math.max(tam.x, 0.01), Math.max(tam.y, 0.01), Math.max(tam.z, 0.01)
          );
          // VER A CAIXA DE CLIQUE: no console do navegador (F12) rode
          //   window.__legnoDebugHitbox = true
          // e mexa em qualquer coisa que redesenhe a cena (arrastar um módulo,
          // trocar de parede). A caixa aparece em azul. `false` volta ao normal.
          //
          // Atalho sem console: o CONTORNO VERMELHO do módulo selecionado É
          // exatamente esta caixa — setHoverHighlight usa THREE.BoxHelper no
          // mesmo group, ou seja, o mesmo bounding box. Se o vermelho está
          // colado no móvel, a área de clique também está; o que sobra em
          // volta são as SETAS de redimensionamento, que ficam de 6cm a 23cm
          // FORA da face (PROJECT_ARROW_GAP_M + comprimento da seta) e são
          // testadas antes do módulo.
          const hitboxDebug = typeof window !== 'undefined' && window.__legnoDebugHitbox;
          const hitboxMat = new THREE.MeshBasicMaterial(hitboxDebug
            ? { color: 0x1e88e5, wireframe: true, transparent: true, opacity: 0.9, depthTest: false }
            : { transparent: true, opacity: 0, depthWrite: false });
          const hitbox = new THREE.Mesh(hitboxGeom, hitboxMat);
          hitbox.position.set(meio.x, meio.y, meio.z);
          hitbox.userData.isHitboxProxy = true;
          assembly.group.add(hitbox);
          // DIAGNÓSTICO — contraparte do window.__legnoDebugPick (que loga o
          // que o clique ACERTOU). Aqui sai o tamanho real da caixa de clique
          // no momento em que ela nasce. Com os dois lados dá pra afirmar, sem
          // adivinhar, se o clique errado veio da caixa (grande demais), da
          // seta (testada antes do módulo) ou de outra coisa.
          if (typeof window !== 'undefined' && window.__legnoDebugPick) {
            const mm = (v) => Math.round(v * 1000);
            console.log('[legno hitbox] ' + JSON.stringify({
              modulo: (slot.module && slot.module.name) || '', slot: slot.id,
              declarado_mm: [Math.round(slot.width_mm), Math.round(slot.height_mm), Math.round(slot.depth_mm)],
              caixa_mm: [mm(tam.x), mm(tam.y), mm(tam.z)],
              centro_mm: [mm(meio.x), mm(meio.y), mm(meio.z)],
              malhas: (() => { let n = 0; assembly.group.traverse((o) => { if (o.isMesh) n += 1; }); return n; })()
            }));
          }
        }
      }
    }
    return assembly;
  });
}

// Geometria (em METROS, mundo 3D) de cada parede da forma atual — canto
// sempre reto/90° (confirmado com o usuário). 'main' é a referência: sempre
// centrada em X=0, IDÊNTICA à parede única de sempre (compatibilidade total
// com forma 'single'). 'left'/'right' nascem exatamente nas pontas dela e
// esticam em direção a quem olha o ambiente (mundo +Z) — ver comentário
// grande em cima de renderFreeformWalls (viewer3d_composition.js) pra como
// origin/alongDir/intoDir/rotationY são usados pra posicionar cada módulo.
// ==========================================================================
// PAREDES POR SEGMENTO — 2026-08-13 (reforma pedida pelo Matt)
// ==========================================================================
// "quero paredes sólidas... e quero poder desenhar as paredes num blueprint.
// adicionar, remover, mexer nelas conforme necessário. sendo que elas sempre
// tenham 150mm de espessura. projeto entra com padrão duas paredes de 3 metros
// cada, chão de 3x3."
//
// Modelo (o mesmo do Editor de Paredes do Promob, conferido na tela dele):
// cada parede é um SEGMENTO com ponta A e ponta B em mm no mundo, espessura e
// pé-direito. Comprimento e ângulo são DERIVADOS das pontas — não guardados —
// senão as duas informações divergem no primeiro arraste.
//
// A ORDEM IMPORTA: o índice do segmento é o wall_index do módulo. Apagar uma
// parede do meio renumeraria as outras e os módulos iriam parar na parede
// errada — por isso a remoção não usa splice cru (ver removeProjectWallSegment).
//
// COMPATIBILIDADE: quem consome parede no projeto inteiro (canvas 2D, 3D,
// colisão, arraste, foto realista, pedido) passa por getProjectWallGeometry.
// Enquanto projectWallSegments estiver vazio, ela responde exatamente como
// antes, derivando de projectWallShape + projectWallWidthsMm. Projeto salvo
// velho continua abrindo sem conversão nenhuma.
// (a declaração de projectWallSegments está lá em cima, junto de
// projectWallShape — ver o porquê no comentário dela.)

// newProjectWallSegmentId() e defaultProjectWallSegments() MORARAM pro
// portal-06-projetos-canvas.js (2026-08-19 — correção do bug de TDZ que
// derrubava a aba Projetos inteira; ver comentário lá e a memória do
// projeto). Motivo: `let projectWallSegments = defaultProjectWallSegments();`
// no portal-06 roda no CARREGAMENTO do script, e portal-06 é carregado
// ANTES deste arquivo — um <script> clássico não enxerga function de outro
// <script> que ainda nem executou. Continuam chamáveis normalmente aqui
// embaixo (mesmo escopo global depois que os dois arquivos carregam), só a
// DEFINIÇÃO que precisou subir pra um arquivo mais cedo na ordem.

// Geometria de UM segmento no formato que o resto do sistema já entende.
// intoDir = normal do segmento apontando pro lado de DENTRO do ambiente.
// Convenção: dentro fica à ESQUERDA de quem caminha de A pra B — o mesmo
// "Orientação: Direita/Esquerda" do Promob, aqui fixo pra não virar mais um
// campo pra errar. Inverter a parede = trocar as pontas (o editor tem botão).
// Centro do ambiente = média das pontas de todas as paredes. É a referência
// pra saber qual lado de cada parede é "dentro".
function projectWallsCentroM() {
  let sx = 0, sz = 0, n = 0;
  projectWallSegments.forEach((s) => {
    sx += s.ax + s.bx; sz += s.az + s.bz; n += 2;
  });
  return n ? { x: sx / n / 1000, z: sz / n / 1000 } : { x: 0, z: 0 };
}

function projectWallSegmentGeometry(seg, idx) {
  const dx = (seg.bx - seg.ax) / 1000;
  const dz = (seg.bz - seg.az) / 1000;
  const comp = Math.hypot(dx, dz) || 0.001;
  const ax = dx / comp, az = dz / comp;

  // O LADO DE DENTRO É DECIDIDO PELA GEOMETRIA, NÃO PELA ORDEM DO DESENHO
  // (2026-08-13). Antes era sempre a normal à direita de A→B — o que faz o
  // módulo nascer FORA quando a parede foi desenhada no sentido contrário, e
  // ninguém desenha planta prestando atenção em sentido de traço. Foi o "está
  // colidindo com o lado externo da parede e deve ser interno".
  //
  // Agora: das duas normais, vale a que aponta pro CENTRO do ambiente. Numa
  // parede sozinha o centro cai em cima dela (produto escalar ~0) e fica a
  // normal à direita, igual a antes. O botão ⇋ virar continua mandando por
  // cima disso (seg.inverterLado), pra o caso de U/ilha onde "dentro" é
  // ambíguo de verdade.
  let ix = -az, iz = ax;
  const centro = projectWallsCentroM();
  const mx = (seg.ax + seg.bx) / 2000, mz = (seg.az + seg.bz) / 2000;
  if ((centro.x - mx) * ix + (centro.z - mz) * iz < -1e-6) { ix = -ix; iz = -iz; }
  if (seg.inverterLado) { ix = -ix; iz = -iz; }
  return {
    role: idx === 0 ? 'main' : 'seg' + idx,
    wallIndex: idx,
    widthM: comp,
    originX: seg.ax / 1000,
    originZ: seg.az / 1000,
    alongDirX: ax, alongDirZ: az,
    // NORMAL À DIREITA de (ax,az) — e isto NÃO é escolha estética, é a
    // convenção que o resto do sistema já usa (2026-08-13). Conferido contra
    // a geometria antiga: parede 'main' tem alongDir (1,0) e intoDir (0,1),
    // que é (-az, ax). Eu tinha escrito a normal à ESQUERDA, e o resultado foi
    // o módulo nascer do lado de FORA do ambiente — "os módulos entram por
    // fora dessas paredes, não no chão onde deveriam".
    intoDirX: ix, intoDirZ: iz,
    // rotationY do módulo encostado: ele olha pra dentro. Mesma derivação da
    // geometria antiga — main (intoDir 0,1) = 0; left (1,0) = +90°;
    // right (-1,0) = -90°.
    rotationY: Math.atan2(ix, iz),
    segmentId: seg.id,
    thicknessMm: Number(seg.thicknessMm) || PROJECT_WALL_THICKNESS_MM,
    ceilingMm: seg.ceilingMm || null,
    // Só de visualização — ver alternaOculta no wall-editor.js. A parede
    // continua existindo pro projeto e pro pedido.
    oculta: !!seg.oculta
  };
}

// Abre a planta baixa. O que volta substitui as paredes do projeto — e os
// MÓDULOS NÃO SE MEXEM (decisão do Matt: "modulos nao mexem"). Eles guardam
// wall_index + x_mm ao longo da parede, então continuam onde estavam mesmo se
// a parede encurtar ou girar; quem quiser reposicionar, arrasta.
function openProjectWallEditor() {
  // FALHA BARULHENTA. Este `if` já existiu como `return` mudo e o botão não
  // fazia nada — sem pista nenhuma na tela. O motivo real (2026-08-13) foi
  // js/wall-editor.js não estar publicado: arquivo NOVO não é rastreado pelo
  // git, e o subir.ps1 usa `git add -u` de propósito. Mesmo tropeço do
  // layout-engine.js. Um alerta economiza a rodada inteira de diagnóstico.
  if (typeof WallEditor === 'undefined') {
    alert(I18n.t('project.wall_editor_missing'));
    return;
  }
  WallEditor.open({
    segments: projectWallSegments.length ? projectWallSegments : WallEditor.padrao(),
    ceilingMm: (roomSettings && roomSettings.ceiling_mm) || 2600,
    baseboardMm: (roomSettings && roomSettings.baseboard_mm) || 0,
    onSave: (segs, ambiente) => {
      projectWallSegments = segs;
      // Pé-direito e rodapé saíram da faixa e vivem aqui agora (2026-08-13).
      // Em vez de escrever em roomSettings direto, o editor ESCREVE NOS INPUTS
      // antigos e dispara o 'change' deles: aquele listener já faz tudo que
      // precisa acontecer junto (clamp, localStorage, variável RODAPE das
      // fórmulas, régua de altura máxima, re-render dos viewers). Duplicar
      // essa cadeia aqui era garantir que uma das pontas ficasse pra trás.
      if (ambiente) {
        const un = (document.getElementById('po-unit-select') || {}).value || 'mm';
        [['po-proj-ceiling-input', ambiente.ceilingMm], ['po-proj-baseboard-input', ambiente.baseboardMm]]
          .forEach(([id, mm]) => {
            const inp = document.getElementById(id);
            if (!inp || !(mm >= 0)) return;
            inp.value = formatDimension(mm, un);
            inp.dispatchEvent(new Event('change'));
          });
      }
      // Módulo que ficou apontando pra uma parede que não existe mais volta
      // pra primeira — é o mínimo pra ele não sumir do desenho. Fora isso,
      // ninguém é movido.
      projectSlots.forEach((s) => {
        if (Number(s.wall_index || 0) >= projectWallSegments.length) s.wall_index = 0;
      });
      refreshProjectWallTabs();
      refreshProjectWallWidthInput();
      renderProjectCanvas();
      markProjectDirty();
    }
  });
}
(function ligaBotaoParedes() {
  const b = document.getElementById('po-proj-wall-editor-btn');
  if (b) b.addEventListener('click', openProjectWallEditor);
})();

function getProjectWallGeometry() {
  if (projectWallSegments.length) {
    return projectWallSegments.map((seg, idx) => projectWallSegmentGeometry(seg, idx));
  }
  const roles = getProjectWallRoles();
  const mainIdx = roles.indexOf('main');
  const mainWidthM = getProjectWallWidthMm(mainIdx >= 0 ? mainIdx : 0) / 1000;
  return roles.map((role, idx) => {
    const widthM = getProjectWallWidthMm(idx) / 1000;
    if (role === 'left') {
      return { role, wallIndex: idx, widthM, originX: -mainWidthM / 2, originZ: 0, alongDirX: 0, alongDirZ: 1, intoDirX: 1, intoDirZ: 0, rotationY: Math.PI / 2 };
    }
    if (role === 'right') {
      return { role, wallIndex: idx, widthM, originX: mainWidthM / 2, originZ: 0, alongDirX: 0, alongDirZ: 1, intoDirX: -1, intoDirZ: 0, rotationY: -Math.PI / 2 };
    }
    return { role, wallIndex: idx, widthM, originX: -mainWidthM / 2, originZ: 0, alongDirX: 1, alongDirZ: 0, intoDirX: 0, intoDirZ: 1, rotationY: 0 };
  });
}

function generateProject3D() {
  const wrap = document.getElementById('po-proj-3d-wrap');
  const canvas = document.getElementById('po-proj-3d-canvas');
  if (!wrap || !canvas) return;
  wrap.style.display = 'block';

  if (!ViewerProject || !ViewerProject.available()
    || typeof Viewer3D === 'undefined' || !Viewer3D.buildStandaloneAssembly) {
    canvas.innerHTML = `<p class="hint">${I18n.t('composition.not_available_3d')}</p>`;
    return;
  }

  ViewerProject.init('po-proj-3d-canvas');
  ensurePhotoFrameOverlay('po-proj-3d-canvas');

  // Forma 'single' (o caso de sempre) continua chamando renderFreeform tal
  // e qual — zero risco de regressão pro fluxo já existente. Só forma
  // dupla/C-U (2-3 paredes) passa pelo caminho novo (renderFreeformWalls,
  // ver viewer3d_composition.js).
  // Parede única E sem nenhuma ilha no chão continua no caminho antigo
  // (renderFreeform) tal e qual — zero risco de regressão. Ilha no chão
  // (2026-08-08) só existe no caminho multi-parede (renderFreeformWalls, que
  // é quem sabe posicionar por coordenada de mundo), então basta UMA ilha pra
  // o projeto de parede única também passar por lá.
  const floorAssemblies = buildProjectAssemblies(projectFloorSlots());
  // PLANTA DESENHADA SEMPRE PELO CAMINHO MULTI-PAREDE (2026-08-18): so quem
  // NAO tem wall_segments (projeto salvo no modelo velho de forma fixa) cai
  // no renderFreeform de uma parede centrada na origem. Com planta desenhada
  // a parede pode estar em qualquer lugar/angulo, e quem sabe posicionar por
  // coordenada de mundo e o renderFreeformWalls — mesmo caminho da cena de
  // edicao (renderProjectCanvasFrontCorner), pra os dois 3D concordarem.
  if (!projectWallSegments.length && getProjectWallCount() <= 1 && !floorAssemblies.length) {
    const assemblies = buildProjectAssemblies(projectSlots);
    ViewerProject.renderFreeform(assemblies, getProjectWallWidthMm() / 1000, viewerRoomEnvConfig());
  } else {
    // Mesmo filtro de parede oculta da Vista de Canto — os dois viewers
    // precisam concordar, senão o painel "Visualizar 3D" mostraria a parede
    // que você acabou de esconder.
    const wallsData = getProjectWallGeometry().filter((w) => !w.oculta).map((wall) => ({
      ...wall,
      assemblies: buildProjectAssemblies(projectSlotsOnWall(wall.wallIndex))
    }));
    ViewerProject.renderFreeformWalls(wallsData, viewerRoomEnvConfig(), null, { floorAssemblies });
  }

  refreshProjectOpenButtons();
}

// Botões "Abrir portas"/"Abrir gavetas" da Projetos — mesmo padrão de
// refreshCompositionOpenButtons (ver comentário lá), só que apontando pro
// estado PRÓPRIO de ViewerProject.
function refreshProjectOpenButtons() {
  const doorsBtn = document.getElementById('po-proj-toggle-doors-btn');
  const drawersBtn = document.getElementById('po-proj-toggle-drawers-btn');
  if (!doorsBtn && !drawersBtn) return;

  const hasHinge = projectSlots.some((slot) => treeHasHinge(slot.pieces, false, false));
  const hasSlide = projectSlots.some((slot) => treeHasSlide(slot.pieces, false, false));

  if (doorsBtn) {
    doorsBtn.style.display = hasHinge ? 'inline-block' : 'none';
    doorsBtn.dataset.openLabel = I18n.t('step2.open_doors');
    doorsBtn.dataset.closeLabel = I18n.t('step2.close_doors');
    const isOpen = ViewerProject && ViewerProject.areDoorsOpen && ViewerProject.areDoorsOpen();
    doorsBtn.textContent = isOpen ? doorsBtn.dataset.closeLabel : doorsBtn.dataset.openLabel;
  }
  if (drawersBtn) {
    drawersBtn.style.display = hasSlide ? 'inline-block' : 'none';
    drawersBtn.dataset.openLabel = I18n.t('step2.open_drawers');
    drawersBtn.dataset.closeLabel = I18n.t('step2.close_drawers');
    const isOpen = ViewerProject && ViewerProject.areDrawersOpen && ViewerProject.areDrawersOpen();
    drawersBtn.textContent = isOpen ? drawersBtn.dataset.closeLabel : drawersBtn.dataset.openLabel;
  }
}

const projToggleDoorsBtn = document.getElementById('po-proj-toggle-doors-btn');
if (projToggleDoorsBtn) {
  projToggleDoorsBtn.addEventListener('click', () => {
    try {
      const isOpen = ViewerProject.toggleDoors();
      projToggleDoorsBtn.textContent = isOpen
        ? (projToggleDoorsBtn.dataset.closeLabel || I18n.t('step2.close_doors'))
        : (projToggleDoorsBtn.dataset.openLabel || I18n.t('step2.open_doors'));
    } catch (err) {
      // Sem 3D o botão não faz nada.
    }
  });
}

const projToggleDrawersBtn = document.getElementById('po-proj-toggle-drawers-btn');
if (projToggleDrawersBtn) {
  projToggleDrawersBtn.addEventListener('click', () => {
    try {
      const isOpen = ViewerProject.toggleDrawers();
      projToggleDrawersBtn.textContent = isOpen
        ? (projToggleDrawersBtn.dataset.closeLabel || I18n.t('step2.close_drawers'))
        : (projToggleDrawersBtn.dataset.openLabel || I18n.t('step2.open_drawers'));
    } catch (err) {
      // Sem 3D o botão não faz nada.
    }
  });
}

// Junção automática de rodapé (migration 137) — mesmo padrão do botão de
// Colisão (portal-06b: setProjectCollisionEnabled), não do abrir-porta/
// gaveta acima: é um toggle de sessão que fica ligado/desligado (classe
// .active), não um verbo de ação com texto que troca.
const projBaseboardJoinBtn = document.getElementById('po-proj-baseboard-join-btn');
if (projBaseboardJoinBtn) {
  projBaseboardJoinBtn.addEventListener('click', () => setProjectBaseboardJoinEnabled(!projectBaseboardJoinEnabled));
  projBaseboardJoinBtn.classList.toggle('active', projectBaseboardJoinEnabled);
}

// ---------- TESTE de AR no navegador (2026-08-01, pedido do usuário) ----------
// Pergunta: "dá pra colocar o móvel projetado num ambiente real, com
// câmera ao vivo, andando em volta?" — resposta: sim, sem óculos, via
// Scene Viewer do Google (Android) / AR Quick Look (iOS), sem app nenhum.
// Este bloco é só o PRIMEIRO teste, cobrindo só Android:
//   1. Pega a MESMA THREE.Scene que a aba Projetos já montou em 3D
//      (ViewerProject.getScene(), ver viewer3d_composition.js — nenhuma
//      peça/posição/cor é recalculada, é a cena visível na tela).
//   2. Exporta ela pra .glb via THREE.GLTFExporter (script CDN em
//      portal.html, mesma versão r128 do resto do 3D).
//   3. Sobe o .glb pro bucket 'gallery-images' do Supabase Storage (mesmo
//      bucket já usado pra imagem de IA da Galeria — reaproveitado aqui só
//      pra ter uma URL https pública sem precisar de infra nova; se o
//      bucket tiver allow-list de MIME type travada em image/*, o upload
//      falha e Matt precisa liberar 'model/gltf-binary' nas policies dele,
//      ou criar um bucket novo só pra isso).
//   4. Monta o link "intent://" do Scene Viewer (só existe no Chrome
//      Android + Google app instalado) e redireciona — o próprio Android
//      abre a câmera, detecta o chão/parede e planta o móvel em escala
//      real (mesmas medidas mm do configurador).
// iOS ficou de fora deste teste (precisa de .usdz, exportador diferente).
function isAndroidBrowser() {
  return /Android/i.test(navigator.userAgent || '');
}

// PAUSADO (pedido do usuário, 2026-08-02: "pode retirar o ar que colocamos,
// nao quero continuar essa funcao por enquanto") — o wrap já nasce
// display:none no HTML (po-proj-ar-test-wrap) e este era o único código que
// tirava ele do escondido; comentado em vez de apagado (mesmo padrão de
// room_view_hidden/composicao_favoritos_hidden — reversível, é só
// descomentar de volta). generateArGlbForProject (abaixo) fica intocado, só
// inalcançável pela UI. Não mexe em captureProjectThumbnail (usado por
// "Meus Projetos", ver saveProjectFavorite) — função separada, só reaproveita
// a mesma técnica de snapshot, não depende deste bloco.
// (function initArTestVisibility() {
//   const wrap = document.getElementById('po-proj-ar-test-wrap');
//   if (wrap && isAndroidBrowser()) wrap.style.display = '';
// })();

async function generateArGlbForProject() {
  const statusEl = document.getElementById('po-proj-ar-test-status');
  const btn = document.getElementById('po-proj-test-ar-btn');
  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  if (!ViewerProject || !ViewerProject.getScene || typeof THREE === 'undefined' || !THREE.GLTFExporter) {
    setStatus(I18n.t('ar.no_3d'));
    return;
  }
  const scene = ViewerProject.getScene();
  if (!scene) {
    setStatus(I18n.t('ar.no_scene'));
    return;
  }

  if (btn) btn.disabled = true;
  setStatus(I18n.t('ar.generating'));

  // Esconde cotas CAD/ambiente virtual/contorno de hover antes de exportar
  // (tag 'ar-export-exclude', ver viewer3d_composition.js) — nenhum desses
  // faz sentido plantado no ambiente REAL do cliente via Scene Viewer, e um
  // deles (Sprite/Line de texto e o ambiente virtual com múltiplos
  // materiais) é o suspeito mais provável do Scene Viewer recusar o arquivo
  // ("algo errado com este objeto"). GLTFExporter.parse tem onlyVisible:true
  // por padrão, então só esconder já tira do .glb sem remover nada da cena
  // ao vivo (restaura a visibilidade original logo depois, mesmo em erro).
  const hiddenForExport = [];
  scene.traverse((obj) => {
    if (obj.name === 'ar-export-exclude' && obj.visible) {
      hiddenForExport.push(obj);
      obj.visible = false;
    }
  });

  try {
    const arrayBuffer = await new Promise((resolve, reject) => {
      const exporter = new THREE.GLTFExporter();
      // maxTextureSize (2026-08-01, arquivo de 20MB no 1º teste real): sem
      // isso o GLTFExporter reencoda CADA textura de cor/veio de madeira no
      // tamanho ORIGINAL do arquivo fonte (muitas vezes 2000px+, e se tiver
      // canal alpha vira PNG sem perdas, bem mais pesado que o JPEG fonte) —
      // pra visualização em AR no celular 1024px já é mais que suficiente
      // (a tela do celular não mostra a diferença), e reduz MUITO o arquivo
      // final (upload mais rápido + Scene Viewer carrega mais rápido).
      exporter.parse(scene, resolve, { binary: true, maxTextureSize: 1024 }, reject);
    });
    const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });

    setStatus(I18n.t('ar.uploading'));
    const path = `ar-test/${crypto.randomUUID()}.glb`;
    const { error: uploadError } = await supabaseClient.storage.from('gallery-images').upload(path, blob, {
      contentType: 'model/gltf-binary',
      upsert: false
    });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabaseClient.storage.from('gallery-images').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    // Scene Viewer: https://developers.google.com/ar/develop/scene-viewer
    const sceneViewerUrl =
      `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(publicUrl)}` +
      `&mode=ar_preferred&title=${encodeURIComponent(I18n.t('ar.scene_title'))}` +
      `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
      `action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(publicUrl)};end;`;

    // Link clicável ANTES de tentar o redirect automático — o upload acima
    // teve um await no meio (rede), então o navegador pode já não considerar
    // isto "resposta direta a um clique" e bloquear a navegação automática
    // pro intent://. Com o link na tela, Matt sempre consegue abrir na mão
    // mesmo se o redirect automático falhar silenciosamente.
    // publicUrl também exposto como TEXTO puro (selecionável/copiável) e no
    // console (2026-08-01, debug do "falha ao carregar objeto" no Scene
    // Viewer — precisa do link cru pra validar o .glb fora do celular, sem
    // depender do intent:// que só funciona dentro do próprio Android).
    console.log('[AR test] modelo .glb:', publicUrl, `(${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);
    if (statusEl) {
      statusEl.innerHTML = I18n.t('ar.model_ready', { mb: (arrayBuffer.byteLength / 1024 / 1024).toFixed(1) }) +
        `<a href="${sceneViewerUrl}">${I18n.t('ar.open_link')}</a> ${I18n.t('ar.open_link_hint')}<br>` +
        `<span style="font-size:11px;word-break:break-all;user-select:all;">${publicUrl}</span>`;
    }
    window.location.href = sceneViewerUrl;
  } catch (err) {
    console.error('generateArGlbForProject', err);
    setStatus(I18n.t('ar.error', { msg: (err && err.message) || err }));
  } finally {
    hiddenForExport.forEach((obj) => { obj.visible = true; });
    if (btn) btn.disabled = false;
  }
}

const projTestArBtn = document.getElementById('po-proj-test-ar-btn');
if (projTestArBtn) {
  projTestArBtn.addEventListener('click', generateArGlbForProject);
}

// Botão "Visualizar 3D" — só dispara generateProject3D() + rola até o
// resultado (mesmo padrão de compGenerateBtn).
const projGenerateBtn = document.getElementById('po-proj-generate-btn');
if (projGenerateBtn) {
  projGenerateBtn.addEventListener('click', () => {
    generateProject3D();
    const wrap = document.getElementById('po-proj-3d-wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// Moldura "área da foto realista" (2026-08-03, pedido do usuário: "mostrar
// a area da foto no 3d") — a foto sai 4:3 com a MESMA câmera/fov vertical
// do viewer, então o recorte real na tela é: altura inteira, largura =
// altura×4/3, centrado (a câmera da foto só estreita o campo HORIZONTAL).
// Injeta uma vez por container (idempotente); posicionamento 100% via CSS
// (.po-photoframe, aspect-ratio) — resize se ajusta sozinho. Texto fixo
// sem i18n (beta, mesmo critério do botão).
function ensurePhotoFrameOverlay(containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.querySelector('.po-photoframe')) return;
  if (!container.style.position && getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  const frame = document.createElement('div');
  frame.className = 'po-photoframe';
  frame.innerHTML = '<span class="po-photoframe-label">' + I18n.t('photoreal.frame_label') + '</span>';
  container.appendChild(frame);
  // Avisa quem controla a visibilidade (botão "Linhas" da barra) que existe
  // moldura nova pra aplicar o estado atual.
  document.dispatchEvent(new Event('legno:photoframe'));
}

// Botão "📸 Foto realista (beta)" (2026-08-03) — junta paredes + peças JÁ
// RESOLVIDAS (mesmo resolvePiecesForViewer do viewer normal, zero lógica
// nova de preço/dimensão) e entrega pro Photoreal (js/photoreal.js), que
// renderiza com path tracer numa cena própria em three moderno. Nada aqui
// toca no viewer atual — se Photoreal falhar, o resto da aba segue igual.
// Callback passado como sceneData.onSave pro Photoreal — CHAMADO
// AUTOMATICAMENTE por ele quando o render termina (ver maybeAutoSave em
// photoreal.js), ATUALIZADO 2026-08-03 (pedido do usuário: "quero que ela
// fique carregada no projeto salvo. automaticamente ela salva e fica na
// tela... pode tambem deixar salvar mais de uma versao, porque podem ter
// mais angulos"): antes gravava SEMPRE no mesmo campo user_projects.
// ai_preview_url (cada foto sobrescrevia a anterior); agora insere uma
// LINHA NOVA em project_photoreal_photos (migration 077) a cada render — a
// grade inteira fica visível na aba Projetos (ver
// refreshProjectPhotorealGallery). ai_preview_url CONTINUA sendo atualizado
// pra apontar pra essa foto mais recente — é o valor que
// generateAiPreviewForProjectGallery/publishProjectToGallery preferem como
// base pro Gemini em vez de tirar um screenshot novo do 3D (ver comentário
// grande perto de lá) — não mudou. Exige projeto já salvo em "Meus
// Projetos" (precisa de loadedProjectFavorite.id pra saber em qual projeto
// gravar).
async function savePhotorealRenderToProject(dataUrl) {
  if (!currentUser) throw new Error(I18n.t('fav.need_login'));
  if (!loadedProjectFavorite || !loadedProjectFavorite.id) {
    throw new Error(I18n.t('photoreal.need_saved_project'));
  }
  const publicUrl = await uploadGalleryImageToStorage(dataUrl);

  // Grade de versões (migration 077, Matt precisa rodar) — se a tabela
  // ainda não existir, não trava o salvamento: cai pro comportamento antigo
  // (só ai_preview_url atualizado, sem grade de miniaturas na tela).
  try {
    const { data: photoRow, error: insertError } = await supabaseClient
      .from('project_photoreal_photos')
      .insert({ project_id: loadedProjectFavorite.id, image_url: publicUrl })
      .select('id, image_url, created_at')
      .single();
    if (insertError) throw insertError;
    projectPhotorealPhotos = [photoRow, ...projectPhotorealPhotos];
    renderProjectPhotorealGallery();
  } catch (galleryErr) {
    console.error('Não deu pra guardar a versão na grade de fotos (migration 077 rodou?):', galleryErr);
  }

  const { error } = await supabaseClient.from('user_projects').update({ ai_preview_url: publicUrl }).eq('id', loadedProjectFavorite.id);
  if (error) throw error;
  loadedProjectFavorite.ai_preview_url = publicUrl;
}

// ---------- Grade de fotos realistas salvas (migration 077) ----------
// Cache local da sessão (evita reconsultar a cada foto salva); populada por
// refreshProjectPhotorealGallery() sempre que o projeto "amarrado" na tela
// muda (salvar novo, restaurar da lista, excluir o carregado — mesmos 3
// pontos que já chamavam refreshProjectFavoriteButtons()).
let projectPhotorealPhotos = [];

async function loadProjectPhotorealPhotos(projectId) {
  if (!projectId) { projectPhotorealPhotos = []; return; }
  try {
    const { data, error } = await supabaseClient
      .from('project_photoreal_photos')
      .select('id, image_url, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    projectPhotorealPhotos = data || [];
  } catch (err) {
    console.error('Não deu pra carregar as fotos realistas salvas (migration 077 rodou?):', err);
    projectPhotorealPhotos = [];
  }
}

// Miniaturas com botão de excluir (pedido do usuário: "pode colcoar um
// botao de deletar se precisar") — clique na imagem abre o mesmo lightbox
// grande da Galeria pública (openGalleryLightbox), clique na lixeira exclui
// só aquela versão sem mexer nas outras.
function renderProjectPhotorealGallery() {
  const wrap = document.getElementById('po-proj-photoreal-gallery-wrap');
  const grid = document.getElementById('po-proj-photoreal-gallery');
  if (!wrap || !grid) return;
  if (!projectPhotorealPhotos.length) { wrap.style.display = 'none'; grid.innerHTML = ''; return; }
  wrap.style.display = 'block';
  grid.innerHTML = projectPhotorealPhotos.map((photo) => `
    <div class="po-photoreal-gallery-item">
      <img src="${photo.image_url}" alt="" data-photo-id="${photo.id}" />
      <button type="button" class="po-photoreal-gallery-delete" title="${I18n.t('photoreal.delete_title')}" data-photo-id="${photo.id}">🗑️</button>
    </div>
  `).join('');
  grid.querySelectorAll('img[data-photo-id]').forEach((img) => {
    img.addEventListener('click', () => openGalleryLightbox(img.getAttribute('src')));
  });
  grid.querySelectorAll('.po-photoreal-gallery-delete').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteProjectPhotorealPhoto(btn.dataset.photoId);
    });
  });
}

async function deleteProjectPhotorealPhoto(photoId) {
  if (!photoId) return;
  if (!confirm(I18n.t('photoreal.delete_confirm'))) return;
  try {
    const { error } = await supabaseClient.from('project_photoreal_photos').delete().eq('id', photoId);
    if (error) throw error;
    projectPhotorealPhotos = projectPhotorealPhotos.filter((p) => String(p.id) !== String(photoId));
    renderProjectPhotorealGallery();
  } catch (err) {
    alert(I18n.t('photoreal.delete_error') + (err && err.message ? err.message : err));
  }
}

// Chamada em todo ponto que muda qual projeto está carregado na tela (ver
// refreshProjectFavoriteButtons, que já roda nesses mesmos 3 pontos:
// acabou de salvar um projeto novo, restaurou um projeto salvo, ou excluiu
// o que estava carregado). Fire-and-forget de propósito — não atrasa o
// resto do fluxo síncrono, e falha (migration ausente) já é tratada dentro
// de loadProjectPhotorealPhotos.
function refreshProjectPhotorealGallery() {
  if (loadedProjectFavorite && loadedProjectFavorite.id) {
    loadProjectPhotorealPhotos(loadedProjectFavorite.id).then(renderProjectPhotorealGallery);
  } else {
    projectPhotorealPhotos = [];
    renderProjectPhotorealGallery();
  }
}

const projPhotorealBtn = document.getElementById('po-proj-photoreal-btn');
if (projPhotorealBtn) {
  // Monta a cena e abre o modal do Photoreal — extraído numa função própria
  // (2026-08-03, pedido do usuário: "pra gerar tem que salvar projeto. se
  // nao da isso e perco tempo da renderizacao por que nao volta") porque
  // agora tem 2 caminhos até aqui: direto (projeto já salvo) ou só DEPOIS
  // de salvar com sucesso (ver checagem no listener de click, abaixo).
  // Antes o aviso "salve o projeto" só aparecia no FIM do render inteiro
  // (250 amostras, minutos de GPU), quando o callback onSave tentava
  // gravar e falhava — agora barra ANTES de gastar esse tempo.
  const openPhotorealModal = () => {
    const walls = getProjectWallGeometry().map((wall) => ({
      ...wall,
      modules: projectSlotsOnWall(wall.wallIndex).map((slot) => ({
        id: slot.id,
        width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
        x_mm: Number(slot.x_mm || 0),
        z_order: Number(slot.z_order || 0),
        floor_height_mm: Number(slot.floor_height_mm || 0),
        parts: resolvePiecesForViewer(
          projectSlotEffectivePieces(slot),
          { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm },
          slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
        )
      }))
    }));
    // Módulos ILHA (soltos no chão, ver isFloorSlot) — NOVO 02/09, pedido do
    // Matt com foto ("essa mesa da esquerda desapareceu. sao so paineis que
    // subi do piso"): até aqui só os módulos de PAREDE (projectSlotsOnWall)
    // entravam nesta cena — a foto realista nunca soube que existe uma ilha.
    // Mesmos campos que buildProjectAssemblies usa pra montar o assembly da
    // Vista de Canto (ver lá), pra Photoreal.buildProjectScene posicionar
    // idêntico (mesmo raciocínio do resto deste arquivo: "porta fiel de
    // renderFreeformWalls").
    const floors = projectFloorSlots().map((slot) => ({
      id: slot.id,
      width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
      floor_x_mm: Number(slot.floor_x_mm || 0),
      floor_z_mm: Number(slot.floor_z_mm || 0),
      floor_rotation_deg: Number(slot.floor_rotation_deg || 0),
      floor_height_mm: Number(slot.floor_height_mm || 0),
      fineOffsetYMm: Number(slot.fineOffsetYMm || 0),
      fineRotXDeg: Number(slot.fineRotXDeg || 0),
      fineRotZDeg: Number(slot.fineRotZDeg || 0),
      parts: resolvePiecesForViewer(
        projectSlotEffectivePieces(slot),
        { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm },
        slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
      )
    }));
    // Câmera do "posicionamento 3D" (pedido do usuário 2026-08-03): a foto
    // sai do MESMO ângulo/zoom que o usuário está vendo. DOIS viewers 3D
    // convivem na aba Projetos — a Vista de Canto de EDIÇÃO (ViewerProjectEdit,
    // sempre presente enquanto o projeto é montado) e o painel separado
    // "Visualizar 3D" (ViewerProject, aposentado da interface principal mas
    // ainda alcançável pelo botão de mesmo nome).
    //
    // A 1ª versão disto (2026-08-03) priorizava ViewerProject sempre que
    // #po-proj-3d-wrap estivesse VISÍVEL na tela — e ficou quebrada de novo
    // em 2026-08-28 (Matt: "a camera ta ficando diferente do que eu vi no
    // 3d... usei os dois [painéis] em momentos diferentes"): abrir
    // "Visualizar 3D" uma vez deixa aquele painel visível PRA SEMPRE (nada
    // esconde de volta sozinho, só o botão "← Voltar" dele) — então depois
    // de girar a câmera de volta na Vista de Canto, a checagem de
    // visibilidade continuava achando #po-proj-3d-wrap "aberto" e usando a
    // câmera VELHA/abandonada de ViewerProject em vez da que a pessoa
    // acabou de ajustar.
    //
    // Fix: em vez de "qual painel está visível", pergunta "em qual dos dois
    // o usuário mexeu a câmera por ÚLTIMO" (touchedAt, ver
    // lastUserCameraTouchAt em viewer3d_composition.js — só conta gesto
    // manual de verdade, nunca reenquadramento automático). Empate (os dois
    // em 0, nenhum tocado manualmente ainda) cai pra Vista de Canto por
    // padrão, já que é a que fica na tela o tempo todo editando o projeto.
    let cameraState = null;
    const stateMain = (ViewerProject && ViewerProject.getCameraState) ? ViewerProject.getCameraState() : null;
    const stateEdit = (ViewerProjectEdit && ViewerProjectEdit.getCameraState) ? ViewerProjectEdit.getCameraState() : null;
    if (stateMain && stateEdit) {
      cameraState = (Number(stateEdit.touchedAt || 0) >= Number(stateMain.touchedAt || 0)) ? stateEdit : stateMain;
    } else {
      cameraState = stateEdit || stateMain || null;
    }
    Photoreal.open({
      walls,
      floors,
      camera: cameraState,
      room: {
        ceiling_m: roomSettings.ceiling_mm / 1000,
        baseboard_h_m: roomSettings.baseboard_mm / 1000
      },
      onSave: savePhotorealRenderToProject
    });
  };

  // Guarda de reentrância do BOTÃO (além da trava global de
  // saveProjectFavorite): sem ela, o segundo toque enquanto o confirm/prompt
  // do salvar está aberto reentrava neste handler e mostrava um SEGUNDO
  // confirm "salvar agora?" — foi o "pediu pra salvar 2x" do relato. A trava
  // do save impede o banco duplicar; esta aqui impede a pergunta duplicar.
  let photorealBtnBusy = false;
  projPhotorealBtn.addEventListener('click', async () => {
    if (photorealBtnBusy) return;
    photorealBtnBusy = true;
    projPhotorealBtn.disabled = true;
    try {
      if (typeof Photoreal === 'undefined' || !Photoreal.open) {
        alert(I18n.t('photoreal.unavailable'));
        return;
      }
      if (!currentUser) { alert(I18n.t('fav.need_login')); return; }
      // Exige projeto salvo ANTES de abrir o render (não só ao tentar guardar
      // a foto no fim) — oferece salvar na hora em vez de só bloquear.
      if (!loadedProjectFavorite || !loadedProjectFavorite.id) {
        const wantsToSave = confirm(I18n.t('photoreal.confirm_save_first'));
        if (!wantsToSave) return;
        await saveProjectFavorite(null);
        // saveProjectFavorite cancela (prompt do nome) ou mostra erro sozinho
        // (po-proj-error) sem lançar exceção — só segue se realmente salvou.
        if (!loadedProjectFavorite || !loadedProjectFavorite.id) return;
      }
      openPhotorealModal();
    } finally {
      photorealBtnBusy = false;
      projPhotorealBtn.disabled = false;
    }
  });
}

// "← Voltar ao ambiente 2D" — fecha o 3D e rola de volta pro canvas, SEM
// trocar de aba (ver comentário no botão em portal.html). Diferente de
// po-proj-back-btn, que sai da aba Projetos de vez.
const projClose3dBtn = document.getElementById('po-proj-close-3d-btn');
if (projClose3dBtn) {
  projClose3dBtn.addEventListener('click', () => {
    const wrap = document.getElementById('po-proj-3d-wrap');
    if (wrap) wrap.style.display = 'none';
    const canvasWrap = document.querySelector('#po-tab-projects .po-proj-canvas-outer');
    if (canvasWrap) canvasWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function resetProject() {
  if (projectSlots.length && !confirm(I18n.t('project.reset_confirm'))) return;
  projectSlots = [];
  selectedProjectSlotId = null;
  // AMBIENTE PADRÃO (2026-08-13): duas paredes de 3m em L e o piso 3x3 que
  // elas delimitam — o ponto de partida que o Matt pediu. Antes o projeto novo
  // nascia com UMA parede e o resto vinha das 3 formas fixas, que saíram.
  projectWallSegments = defaultProjectWallSegments();
  projectActiveWallIndex = 0;
  refreshProjectWallTabs();
  refreshProjectWallWidthInput();
  // DESAMARRA do projeto salvo (BUG corrigido 2026-08-08, relato do usuário:
  // "salvei projeto e comecei novo, ao comecar novo a imagem realista do
  // antigo ficou la como se fosse o antigo ainda"). resetProject esvaziava só
  // os módulos e deixava loadedProjectFavorite apontando pro projeto ANTERIOR
  // — com três consequências, não só a visual: a grade de fotos realistas
  // continuava na tela, o botão "Atualizar <nome>" continuava oferecendo
  // sobrescrever o projeto antigo, e uma foto realista gerada no ambiente NOVO
  // seria gravada como foto do projeto VELHO. refreshProjectFavoriteButtons()
  // já chama refreshProjectPhotorealGallery(), que zera a grade quando não há
  // projeto amarrado.
  loadedProjectFavorite = null;
  refreshProjectFavoriteButtons();
  project3DLastFitKey = null; // força reenquadrar a câmera 3D no próximo render (ver comentário na declaração)
  renderProjectCanvas();
  projectDirty = false; // ambiente esvaziado de propósito, não é uma alteração pendente de salvar
  if (typeof refreshProjectSaveIndicator === 'function') refreshProjectSaveIndicator();
  resetProjectUndo();    // projeto TROCOU inteiro — histórico anterior não é mais "alteração deste projeto"
}
const projResetBtn = document.getElementById('po-proj-reset-btn');
if (projResetBtn) projResetBtn.addEventListener('click', resetProject);

// "Enviar pro pedido" (pedido do usuário 2026-08-02: "precisamos criar um
// fluxo unico de pedidos. projetos, cutting list e carrinho devem levar ao
// mesmo ponto. MY ORDERS" — e depois, refinando: "o projeto deve levar
// direto pra my orders, sem passar pelo carrinho, por que pode misturar com
// outras coisas. mantenha a mesma tela do my orders so separa por
// modulos/componentes que estao no projeto") — cria um pedido PRÓPRIO
// (orders + order_items, order_type='project'), totalmente separado do
// rascunho do carrinho (currentDraftOrderId/cartItems nunca são tocados
// aqui), pega TODOS os módulos de TODAS as paredes do projeto de uma vez
// (projectSlots) e abre direto na tela de detalhe do pedido — a MESMA tela
// usada por qualquer pedido em "Meus Pedidos" (openOrderDetail), só que os
// itens dela são só os módulos deste projeto (separado por ser um pedido à
// parte, não por um filtro na tela). O projeto em si (projectSlots/"Meus
// Projetos") não é alterado — dá pra reabrir e enviar de novo quando quiser.
// status nasce direto em 'submitted' (mesma distinção 'draft' vs 'submitted'
// de saveOrderAndFreeCart: já aparece em "Meus Pedidos"/admin sem exigir os
// 5 campos — só "Aprovar Pedido" continua exigindo isso, na mesma tela de
// sempre).
// MINIATURA DE PEÇA — FALLBACK (extraída em 2026-08-26 de dentro de
// sendProjectToOrder pra ser reaproveitada por 2 chamadores). slot.
// thumbnail_data_url de um módulo da aba Projetos É SEMPRE null — em todo
// o código de Projetos (portal-06/07/08) ele só é ZERADO (inserção nova,
// duplicar, editar no Construtor), nunca CALCULADO; quem calcula de
// verdade é só este fallback aqui, na hora de exportar. Mesma técnica do
// "adicionar direto por SKU" (getSkuAddHiddenViewer/buildCompositionAssemblies,
// ver addModuleToCartWithSku em portal-01): monta o módulo isolado num
// canvas escondido e tira o snapshot.
//
// Motivo da extração (relato do Matt: "na proposta nem no pedido ta
// aparecendo os modulos no icones"): buildProposalItemFromSlot
// (portal-10-proposta.js), usada pelo botão "📄 Proposta" DIRETO na aba
// Projetos, nunca teve esta rede de segurança — só lia
// `slot.thumbnail_data_url || null`, que dá null SEMPRE pro caso acima, então
// a prévia de Proposta saía com TODOS os ícones em branco, sem exceção. Se
// o pedido de verdade ("Enviar pro pedido") também está saindo sem ícone,
// o log de erro abaixo (antes era um catch mudo, "sem 3D disponível — item
// entra sem imagem mesmo, não trava o envio") agora aparece no console pra
// dar uma pista de verdade em vez de falhar calado.
async function renderProjectSlotThumbnailFallback(slot) {
  if (slot.thumbnail_data_url) return slot.thumbnail_data_url;
  try {
    const viewer = getSkuAddHiddenViewer();
    const syntheticSlot = {
      pieces: projectSlotEffectivePieces(slot),
      width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
      colorsByRole: slot.colorsByRole, pieceColorOverrides: slot.pieceColorOverrides || {},
      shelfQuantities: slot.shelfQuantities, dimOverrides: slot.dimOverrides
    };
    viewer.render(buildCompositionAssemblies([syntheticSlot]), null, null);
    if (typeof Viewer3D.waitForPendingTextures === 'function') await Viewer3D.waitForPendingTextures();
    const raw = viewer.snapshot();
    return raw ? await trimTransparentPng(raw) : null;
  } catch (e) {
    // ANTES: catch mudo ("sem 3D disponível — item entra sem imagem mesmo,
    // não trava o envio"). Isso é o que tornava este bug indiagnosticável —
    // não tinha pista nenhuma de qual das 3+ coisas que podem falhar aqui
    // (viewer sem WebGL, peças vazias, exceção no builder) era a real.
    console.warn('[thumbnail fallback] falhou pro módulo', slot && slot.module && slot.module.name, e);
    return null;
  }
}

async function sendProjectToOrder() {
  const errorEl = document.getElementById('po-proj-error');
  if (errorEl) errorEl.style.display = 'none';
  if (!projectSlots.length) {
    if (errorEl) { errorEl.textContent = I18n.t('project.send_to_order_empty'); errorEl.style.display = 'block'; }
    return;
  }
  const btn = document.getElementById('po-proj-send-to-order-btn');
  if (btn) btn.disabled = true;
  try {
    // Geometria do ambiente + render, CONGELADOS no momento do envio
    // (migration 139, pedido do usuário 2026-08-24: "gerador de proposta...
    // vista paralelo de todas as paredes e topo com cotas, isso deve gerar
    // sozinho"). wall_shape/wall_widths_mm vêm do estado vivo do projeto
    // (mesmos globais que renderProjectCanvas usa). Os 2 campos de render são
    // lidos DIRETO do banco (não de loadedProjectFavorite, que só guarda
    // {id,name,ai_preview_url} em memória e nunca teve thumbnail_data_url —
    // ver photoreal_save_as_ai_base.md) pra pegar a versão mais fresca
    // possível e não depender de todo ponto que reatribui aquele objeto.
    // Sem projeto salvo (loadedProjectFavorite null), os 2 ficam null — a
    // Proposta cai pro fallback dela mesma (aviso "sem render").
    let projectRenderFields = { project_thumbnail_data_url: null, project_photoreal_url: null };
    if (loadedProjectFavorite && loadedProjectFavorite.id) {
      try {
        const { data: freshProject } = await supabaseClient
          .from('user_projects')
          .select('thumbnail_data_url, ai_preview_url')
          .eq('id', loadedProjectFavorite.id)
          .single();
        if (freshProject) {
          projectRenderFields = {
            project_thumbnail_data_url: freshProject.thumbnail_data_url || null,
            project_photoreal_url: freshProject.ai_preview_url || null
          };
        }
      } catch (e) { /* sem render disponível — pedido segue sem ele, Proposta avisa na hora */ }
    }
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        client_user_id: currentUser.id,
        client_email: currentUser.email,
        order_type: 'project',
        status: 'submitted',
        submitted_at: new Date().toISOString(),
        wall_shape: projectWallShape,
        wall_widths_mm: projectWallWidthsMm.slice(),
        ...projectRenderFields
      })
      .select()
      .single();
    if (orderError) throw orderError;

    // Miniatura (pedido do usuário 2026-08-02: "nao veio os desenhos
    // (icones") — slot.thumbnail_data_url pode estar vazio (projeto salvo
    // antes da captura automática existir, ou o snapshot do 3D falhou
    // silenciosamente na hora de configurar o módulo — sempre foi
    // "best-effort"). Em vez de mandar o item sem imagem nenhuma pro pedido,
    // gera uma agora como FALLBACK — ver renderProjectSlotThumbnailFallback
    // logo abaixo (extraída daqui em 2026-08-26 pra ser reaproveitada
    // também pela prévia de Proposta). Sequencial de propósito — o viewer
    // escondido é reaproveitado (singleton), não dá pra rodar em paralelo.
    const payloads = [];
    for (let idx = 0; idx < projectSlots.length; idx++) {
      const slot = projectSlots[idx];
      const thumb = await renderProjectSlotThumbnailFallback(slot);
      payloads.push({
        order_id: order.id,
        module_id: slot.module.id,
        module_name: slot.module.name,
        module_description: slot.module.description || null,
        selected_colors: slot.selectedColors,
        hinge_model_id: slot.hingeModel ? slot.hingeModel.id : null,
        slide_model_id: slot.slideModel ? slot.slideModel.id : null,
        width_mm: slot.width_mm,
        height_mm: slot.height_mm,
        depth_mm: slot.depth_mm,
        shelf_quantities: slot.shelfQuantities,
        dim_overrides: slot.dimOverrides,
        piece_color_overrides: buildPieceColorOverridesSnapshot(slot.pieceColorOverrides),
        selected_optional_component_ids: slot.selectedOptionalIds,
        // removed_piece_ids (migration 134): peça removida manualmente pelo
        // cliente no modal "Peças do móvel" — o ERP (furacao-ban/
        // furacao-lote) precisa disto pra não cortar/furar peça removida.
        removed_piece_ids: slot.removedPieceIds || [],
        // GEOMETRIA DO CONSTRUTOR DE VÃOS (migration 121). null quando o
        // slot não usa o construtor (a maioria). Não é o preço nem a
        // furação — é só onde cada peça do interior ficou, pra os
        // exportadores de furação do ERP conseguirem enxergar peça de
        // construtor pela primeira vez. Ver rebuildProjectSlotLayoutPieces
        // (._layoutGeometry) e [[construtor_como_motor_principal]].
        layout: slot._layoutGeometry || null,
        // POSIÇÃO NO AMBIENTE (migration 139) — congela onde este módulo
        // ficava na sala no momento do envio, pros mesmos 4 campos que
        // renderProjectCanvasTop/renderFreeformWalls usam pra desenhar
        // elevação/planta baixa. Sem isto a Proposta só teria a lista solta
        // de módulos, sem saber em qual parede/posição cada um fica.
        project_placement: {
          wall_index: Number(slot.wall_index || 0),
          x_mm: Number(slot.x_mm || 0),
          floor_height_mm: Number(slot.floor_height_mm || 0),
          z_order: Number(slot.z_order || 0)
        },
        quantity: 1,
        unit_price: (slot.result && slot.result.total) || 0,
        total_price: (slot.result && slot.result.total) || 0,
        breakdown: (slot.result && slot.result.breakdown) || [],
        thumbnail_data_url: thumb,
        sort_order: idx
      });
    }
    const { error: itemsError } = await supabaseClient.from('order_items').insert(payloads);
    if (itemsError) throw itemsError;

    myOrdersLoaded = false; // força "Meus Pedidos" recarregar na próxima vez que a lista aparecer

    // Troca de aba SEM passar pelo listener genérico de .portal-tab-btn —
    // aquele listener perguntaria "sair sem salvar alterações do projeto?"
    // (projectDirty, ver comentário lá) só por estarmos saindo da aba
    // Projetos, o que confundiria: o pedido JÁ foi enviado com sucesso nesse
    // ponto, então esse aviso não ajudaria em nada (o projeto em si continua
    // intacto do jeito que estava, salvo ou não).
    document.getElementById('po-sidebar').querySelectorAll('.portal-tab-btn').forEach((b) => b.classList.remove('active'));
    const myOrdersBtn = document.querySelector('.portal-tab-btn[data-tab="po-tab-my-orders"]');
    if (myOrdersBtn) myOrdersBtn.classList.add('active');
    document.querySelectorAll('.portal-tab-page').forEach((page) => { page.style.display = 'none'; });
    const myOrdersPage = document.getElementById('po-tab-my-orders');
    if (myOrdersPage) myOrdersPage.style.display = 'block';
    // Saiu da aba Projetos por aqui também — sem isto "Meus Pedidos" herdaria
    // a largura de tela cheia (ver setProjectFullBleed).
    setProjectFullBleed(false);

    await openOrderDetail(order.id);
  } catch (err) {
    if (errorEl) { errorEl.textContent = I18n.t('project.send_to_order_error', { msg: err.message || String(err) }); errorEl.style.display = 'block'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}
const projSendToOrderBtn = document.getElementById('po-proj-send-to-order-btn');
if (projSendToOrderBtn) projSendToOrderBtn.addEventListener('click', sendProjectToOrder);

// Alternância Frontal/Superior (pedido do usuário, 2026-07-24) — só troca
// projectViewMode e reaproveita renderProjectCanvas pra redesenhar (mesmo
// padrão do toggle Grade/Lista do Passo 1).
const projViewFrontBtn = document.getElementById('po-proj-view-front-btn');
const projViewTopBtn = document.getElementById('po-proj-view-top-btn');
function setProjectViewMode(mode) {
  projectViewMode = mode;
  // .active vale pros dois visuais: o segmentado novo (po-tb-seg-btn) usa a
  // MESMA classe do antigo (po-view-toggle-btn), então esta função não mudou.
  if (projViewFrontBtn) projViewFrontBtn.classList.toggle('active', mode === 'front');
  if (projViewTopBtn) projViewTopBtn.classList.toggle('active', mode === 'top');
  renderProjectCanvas();
}
if (projViewFrontBtn) projViewFrontBtn.addEventListener('click', () => setProjectViewMode('front'));
if (projViewTopBtn) projViewTopBtn.addEventListener('click', () => setProjectViewMode('top'));

// ==========================================================================
// ESTILO DO DESENHO 3D — contorno e textura (2026-08-13)
// ==========================================================================
// Pedido do Matt: "uns botões... que deixe o 3d com linhas mais grossas, com
// linhas transparentes, e com texturas só de cores, pra pesar menos se
// quiser. ou também sem linhas grossas, deixar com linha fina como opcional".
//
// Quem desenha é o Viewer3D (setDrawStyle) — e o estilo só entra na PRÓXIMA
// montagem, porque contorno e material são criados peça a peça. Então cada
// clique aqui remonta a cena: renderProjectCanvas refaz a Vista de Canto, e
// generateProject3D o painel "Visualizar 3D" quando ele está aberto.
//
// A escolha fica no localStorage: é preferência de trabalho (o Matt vai
// querer "só cor" no notebook e textura na hora de mostrar pro cliente), não
// dado do projeto — não tem por que virar campo salvo no banco.
const PROJECT_DRAW_STYLE_KEY = 'legno_proj_draw_style';
const PROJECT_CAM_PROJ_KEY = 'legno_proj_cam_proj';
// Contorno na FOTO REALISTA (2026-08-13). Sem linha o render fica fotográfico;
// com linha vira apresentação técnica. Preferência de trabalho, igual ao
// estilo do 3D — vai pro localStorage, não pro projeto.
const PROJECT_RENDER_LINHAS_KEY = 'legno_proj_render_linhas';
let projectRenderComLinhas = (function () {
  try { return localStorage.getItem(PROJECT_RENDER_LINHAS_KEY) === '1'; } catch (e) { return false; }
})();

// Projeção da câmera nos dois viewers da aba de uma vez. O ícone muda junto:
// ⬛ perspectiva (com fuga), ⬜ paralela (ortográfica).
function atualizaBotaoProjecao(tipo) {
  // Virou um par de botões (Perspectiva | Paralelo) no layout novo — o estado
  // é qual dos dois está aceso, em vez de um ícone que trocava de desenho.
  // Dois botões dizem quais são as opções sem precisar clicar pra descobrir.
  document.querySelectorAll('#po-proj-canvas-tools [data-proj]').forEach((b) => {
    b.classList.toggle('active', b.dataset.proj === tipo);
  });
}
function aplicaProjecaoCamera(tipo) {
  [typeof ViewerProjectEdit !== 'undefined' ? ViewerProjectEdit : null,
    typeof ViewerProject !== 'undefined' ? ViewerProject : null].forEach((v) => {
    if (v && v.setCameraProjection) v.setCameraProjection(tipo);
  });
  atualizaBotaoProjecao(tipo);
  try { localStorage.setItem(PROJECT_CAM_PROJ_KEY, tipo); } catch (e) { /* anônimo */ }
}
// Combinações NOMEADAS, no modelo do menu de estilos do Promob. É o que o
// usuário escolhe; os três interruptores de baixo (textura, contorno, face)
// continuam existindo no Viewer3D, só deixaram de ser expostos um a um.
const PROJECT_DRAW_PRESETS = {
  textura_linhas: { textura: true, contorno: 'fino', face: 'solido' },
  textura_grossas: { textura: true, contorno: 'grosso', face: 'solido' },
  textura: { textura: true, contorno: 'nenhum', face: 'solido' },
  cor_linhas: { textura: false, contorno: 'fino', face: 'solido' },
  cor: { textura: false, contorno: 'nenhum', face: 'solido' },
  translucido: { textura: false, contorno: 'fino', face: 'translucido' },
  arestas: { textura: false, contorno: 'fino', face: 'nenhum' },
  tecnico: { textura: false, contorno: 'grosso', face: 'nenhum' }
};

// ==========================================================================
// MENU DE ESTILO COM ÍCONE — 2026-08-13
// ==========================================================================
// "quero um ícone bem bonitinho colorido pra entender melhor na frente da
// escrita." <option> nativo não aceita SVG (só texto), então o <select> virou
// um menu próprio: botão + lista. Cada item é uma AMOSTRA do que o estilo faz
// — madeira com contorno fino, madeira com contorno grosso, cinza chapado,
// translúcido, só arestas — que é mais rápido de ler que o nome.
// nome/nomeCurto viraram CHAVES de i18n (2026-08-18) — este menu fica na barra
// principal de Projetos, é das primeiras coisas que o cliente lê.
// nomeCurto existe porque "Texturas com linhas grossas" empurrava a barra
// inteira pra fora da tela: o botão fechado mostra o curto, a lista o longo.
// Antes o curto era feito com três .replace() em cima do texto em português —
// que não sobreviveria a tradução nenhuma.
const PROJECT_DRAW_OPCOES = [
  { id: 'textura_linhas', nomeKey: 'draw_style.texture_lines', nomeCurtoKey: 'draw_style.texture_lines_short', madeira: true, linha: 'fina', face: 'cheia' },
  { id: 'textura_grossas', nomeKey: 'draw_style.texture_thick_lines', nomeCurtoKey: 'draw_style.texture_thick_lines_short', madeira: true, linha: 'grossa', face: 'cheia' },
  { id: 'textura', nomeKey: 'draw_style.texture', madeira: true, linha: 'nenhuma', face: 'cheia' },
  { id: 'cor_linhas', nomeKey: 'draw_style.fill_lines', nomeCurtoKey: 'draw_style.fill_lines_short', madeira: false, linha: 'fina', face: 'cheia' },
  { id: 'cor', nomeKey: 'draw_style.fill', madeira: false, linha: 'nenhuma', face: 'cheia' },
  { id: 'translucido', nomeKey: 'draw_style.translucent', madeira: false, linha: 'fina', face: 'meia' },
  { id: 'arestas', nomeKey: 'draw_style.no_fill', madeira: false, linha: 'fina', face: 'vazia' },
  { id: 'tecnico', nomeKey: 'draw_style.technical', madeira: false, linha: 'grossa', face: 'vazia' }
];
// Nome da opção no idioma da vez. `curto` = versão que cabe no botão fechado;
// opção sem nomeCurtoKey usa o nome normal (já é curto).
function nomeEstilo(o, curto) {
  return I18n.t(curto && o.nomeCurtoKey ? o.nomeCurtoKey : o.nomeKey);
}
function iconeEstilo(o) {
  const preenche = o.face === 'vazia' ? 'none'
    : (o.madeira ? '#c9a06a' : '#cfcac1');
  const opac = o.face === 'meia' ? 0.35 : 1;
  const larg = o.linha === 'grossa' ? 2.6 : (o.linha === 'fina' ? 1 : 0);
  const cor = o.linha === 'grossa' ? '#111' : '#6b6357';
  const veio = o.madeira && o.face !== 'vazia'
    ? '<path d="M6 8h12M6 12h12M6 16h12" stroke="#a67c46" stroke-width="0.9" opacity="0.65"/>'
    : '';
  return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">'
    + '<rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="' + preenche + '" fill-opacity="' + opac + '"'
    + (larg ? ' stroke="' + cor + '" stroke-width="' + larg + '"' : '') + '/>'
    + veio + '</svg>';
}
// Dropdowns "flutuantes" (Estilo/Camadas) — 02/09: a barra
// (#po-proj-canvas-tools) precisa de overflow-x:auto pra rolar em zoom alto
// (ver comentario grande acima da regra CSS de "BARRA CABENDO NA TELA"), e
// isso faz o navegador tratar overflow-y como 'auto' tambem (regra do
// proprio spec de CSS Overflow quando overflow-x nao e 'visible' — nao e bug
// de codigo) — a lista do dropdown, que nascia absoluta DENTRO da barra,
// ficava cortada sempre que passava da altura dela. Matt reportou isso na
// Camadas: "a camada abre pra baixo da barra que nao da pra ver, pode jogar
// pra fora da barra". Fix: ao abrir, a lista sai do fluxo normal (reparent
// pra <body>) e vira position:fixed, posicionada por JS a partir do
// retangulo real do botao (getBoundingClientRect) — assim nenhum ancestral
// (barra, card, scroll) consegue cortar ela. Mesmo helper serve Estilo e
// Camadas (mesmo esqueleto HTML/CSS dos dois, .po-style-btn/.po-style-list).
function attachFloatingDropdown(raiz, btn, lista) {
  const posicionar = () => {
    const rect = btn.getBoundingClientRect();
    const largura = Math.max(lista.offsetWidth || 0, 190);
    let left = rect.left;
    if (left + largura > window.innerWidth - 8) left = Math.max(8, window.innerWidth - largura - 8);
    lista.style.left = left + 'px';
    lista.style.top = (rect.bottom + 4) + 'px';
  };
  const abrir = () => {
    if (lista.parentNode !== document.body) document.body.appendChild(lista);
    lista.style.position = 'fixed';
    lista.style.zIndex = '9999';
    lista.style.display = 'block';
    posicionar();
    raiz.classList.add('aberto');
  };
  const fechar = () => {
    raiz.classList.remove('aberto');
    lista.style.display = 'none';
  };
  btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (raiz.classList.contains('aberto')) fechar(); else abrir();
  });
  document.addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
  window.addEventListener('resize', () => { if (raiz.classList.contains('aberto')) posicionar(); });
  return { abrir, fechar };
}
function montaMenuEstilo() {
  const raiz = document.getElementById('po-proj-style-menu');
  if (!raiz) return;
  raiz.innerHTML = '<button type="button" class="po-style-btn" id="po-proj-style-btn"></button>'
    + '<div class="po-style-list" id="po-proj-style-list">'
    + PROJECT_DRAW_OPCOES.map((o) => (
      '<button type="button" class="po-style-item" data-estilo="' + o.id + '">'
      + iconeEstilo(o) + '<span>' + nomeEstilo(o, false) + '</span></button>'
    )).join('')
    + '</div>';
  const btn = raiz.querySelector('#po-proj-style-btn');
  const lista = raiz.querySelector('#po-proj-style-list');
  const dropdown = attachFloatingDropdown(raiz, btn, lista);
  lista.querySelectorAll('.po-style-item').forEach((it) => {
    it.addEventListener('click', () => {
      dropdown.fechar();
      const p = PROJECT_DRAW_PRESETS[it.dataset.estilo];
      if (p) applyProjectDrawStyle(p, true);
    });
  });
}
function pintaBotaoEstilo(idAtual) {
  const btn = document.getElementById('po-proj-style-btn');
  const o = PROJECT_DRAW_OPCOES.find((x) => x.id === idAtual) || PROJECT_DRAW_OPCOES[0];
  // Nome curto no botão fechado (o longo fica na lista): "Texturas com linhas
  // grossas" empurrava a barra inteira pra fora da tela.
  const curto = nomeEstilo(o, true);
  if (btn) btn.innerHTML = iconeEstilo(o) + '<span>' + curto + '</span><i class="po-style-caret">▾</i>';
  document.querySelectorAll('#po-proj-style-list .po-style-item').forEach((it) => {
    it.classList.toggle('ativo', it.dataset.estilo === o.id);
  });
}
function nomeDoPresetAtual(s) {
  const achado = Object.keys(PROJECT_DRAW_PRESETS).find((k) => {
    const p = PROJECT_DRAW_PRESETS[k];
    return p.textura === s.textura && p.contorno === s.contorno && p.face === (s.face || 'solido');
  });
  return achado || 'textura_linhas';
}

function applyProjectDrawStyle(estilo, remontar) {
  if (typeof Viewer3D === 'undefined' || !Viewer3D.setDrawStyle) return;
  const s = Viewer3D.setDrawStyle(estilo);
  pintaBotaoEstilo(nomeDoPresetAtual(s));
  try { localStorage.setItem(PROJECT_DRAW_STYLE_KEY, JSON.stringify(s)); } catch (e) { /* modo anônimo */ }
  if (remontar) {
    renderProjectCanvas();
    const wrap3d = document.getElementById('po-proj-3d-wrap');
    if (wrap3d && wrap3d.style.display !== 'none' && typeof generateProject3D === 'function') generateProject3D();
  }
}
(function attachProjectDrawStyle() {
  montaMenuEstilo();

  // Portas / gavetas: espelham os botões que já existiam no painel 3D (hoje
  // escondido). Quem sabe abrir/fechar é o viewer; aqui só refletimos o estado
  // pra o botão acender enquanto está aberto.
  //
  // Com módulo selecionado (2026-08-27, pedido do Matt): abre/fecha só ELE
  // (selectedProjectSlotId, ver portal-06a); sem seleção, continua abrindo/
  // fechando todos do ambiente, igual sempre foi. O painel antigo (ViewerProject,
  // usado pela foto realista/AR) só entende "todos" — por isso só é
  // sincronizado quando NÃO há seleção; abrir um módulo sozinho não teria
  // como refletir lá.
  [['po-proj-tb-doors-btn', 'po-proj-toggle-doors-btn', (slotId) => ViewerProjectEdit && ViewerProjectEdit.areDoorsOpen && ViewerProjectEdit.areDoorsOpen(slotId)],
    ['po-proj-tb-drawers-btn', 'po-proj-toggle-drawers-btn', (slotId) => ViewerProjectEdit && ViewerProjectEdit.areDrawersOpen && ViewerProjectEdit.areDrawersOpen(slotId)]]
    .forEach(([idNovo, idOrig, estaAberto]) => {
      const b = document.getElementById(idNovo);
      if (!b) return;
      b.addEventListener('click', () => {
        // A Vista de Canto é a cena que está na tela — é nela que abre.
        const onlySlotId = selectedProjectSlotId;
        if (idNovo.indexOf('doors') >= 0) {
          if (ViewerProjectEdit && ViewerProjectEdit.toggleDoors) ViewerProjectEdit.toggleDoors(onlySlotId);
        } else if (ViewerProjectEdit && ViewerProjectEdit.toggleDrawers) {
          ViewerProjectEdit.toggleDrawers(onlySlotId);
        }
        // Mantém o painel antigo em sincronia (ele ainda alimenta a foto
        // realista e a exportação AR) — só no caso "todos" (sem seleção).
        if (onlySlotId == null) {
          const orig = document.getElementById(idOrig);
          if (orig && orig.offsetParent !== null) orig.click();
        }
        setTimeout(() => b.classList.toggle('active', !!estaAberto(onlySlotId)), 30);
      });
    });

  // OCULTAR / MOSTRAR TUDO. Ocultar age no que estiver selecionado; sem
  // seleção, avisa em vez de não fazer nada. "Mostrar tudo" é a saída de
  // emergência: sem ela, um módulo escondido sem seleção seria impossível de
  // recuperar pela interface.
  const bOcultar = document.getElementById('po-proj-tb-ocultar-btn');
  if (bOcultar) {
    bOcultar.addEventListener('click', () => {
      const slot = projectSlots.find((s) => s.id === selectedProjectSlotId);
      if (!slot) {
        alert(I18n.t('project.hide_needs_selection'));
        return;
      }
      slot.oculto = true;
      deselectProjectSlot();
      renderProjectCanvas();
      markProjectDirty();
    });
  }
  const bMostrar = document.getElementById('po-proj-tb-mostrar-btn');
  if (bMostrar) {
    bMostrar.addEventListener('click', () => {
      projectSlots.forEach((s) => { s.oculto = false; });
      projectWallSegments.forEach((w) => { w.oculta = false; });
      renderProjectCanvas();
      markProjectDirty();
    });
  }
  // (Botão "← Projetos" da barra de cima REMOVIDO em 02/09 — pedido do
  // Matt pra ganhar espaço na barra. O "← Voltar" original do rodapé,
  // #po-proj-back-btn, continua existindo e funcionando sozinho.)
  // Projeção da câmera. Vale pros DOIS viewers da aba (a Vista de Canto e o
  // painel "Visualizar 3D"), pra não ficar um em cada modo. Não precisa
  // remontar a cena: é só a matriz de projeção.
  document.querySelectorAll('#po-proj-canvas-tools [data-proj]').forEach((b) => {
    b.addEventListener('click', () => aplicaProjecaoCamera(b.dataset.proj));
  });

  // RENDER na barra. O botão daqui apenas CLICA no de baixo (que ficou
  // escondido): toda a regra de habilitar/desabilitar, projeto salvo, câmera e
  // autosave continua num lugar só. Espelhar a lógica aqui seria criar uma
  // segunda porta pro mesmo quarto — e uma delas ficaria pra trás.
  const bRender = document.getElementById('po-proj-render-btn');
  const bOrig = document.getElementById('po-proj-photoreal-btn');
  if (bRender && bOrig) {
    bRender.addEventListener('click', () => {
      // FALHA BARULHENTA: antes, com o original desabilitado, o clique não
      // fazia nada e parecia botão quebrado ("o botão render não gera
      // render"). O original só habilita com pelo menos 1 módulo — e isso
      // precisa ser dito, não adivinhado.
      if (bOrig.disabled) {
        alert(I18n.t('project.render_needs_module'));
        return;
      }
      bOrig.click();
    });
    // O de baixo é quem sabe quando pode renderizar (precisa de módulo e de
    // projeto salvo); este espelha o estado dele.
    const espelha = () => { bRender.disabled = bOrig.disabled; };
    espelha();
    new MutationObserver(espelha).observe(bOrig, { attributes: true, attributeFilter: ['disabled'] });
  }
  // "Linhas" liga/desliga a MARCAÇÃO DA ÁREA DA FOTO — as tracejadas que
  // mostram o recorte que o render vai pegar (2026-08-13: "o botão linha não
  // desativa a linha de marcação do render"). Eu tinha entendido como
  // contorno DENTRO da foto; é a moldura na tela, e ela atrapalha justamente
  // quem está projetando e não vai renderizar agora.
  const bLinhas = document.getElementById('po-proj-render-linhas-btn');
  if (bLinhas) {
    const pinta = () => {
      bLinhas.classList.toggle('active', projectRenderComLinhas);
      document.querySelectorAll('.po-photoframe').forEach((f) => {
        f.style.display = projectRenderComLinhas ? '' : 'none';
      });
    };
    bLinhas.addEventListener('click', () => {
      projectRenderComLinhas = !projectRenderComLinhas;
      try { localStorage.setItem(PROJECT_RENDER_LINHAS_KEY, projectRenderComLinhas ? '1' : '0'); } catch (e) { /* ok */ }
      pinta();
    });
    // A moldura é criada depois (ensurePhotoFrameOverlay, no primeiro render
    // da cena), então reaplica quando ela aparecer — senão o estado "desligado"
    // valeria só até o próximo redesenho.
    pinta();
    setTimeout(pinta, 1500);
    document.addEventListener('legno:photoframe', pinta);
  }
  let projSalva = null;
  try { projSalva = localStorage.getItem(PROJECT_CAM_PROJ_KEY); } catch (e) { projSalva = null; }
  if (projSalva === 'paralela') setTimeout(() => aplicaProjecaoCamera('paralela'), 1200);
  else atualizaBotaoProjecao('perspectiva');
  // Preferência da última sessão — aplicada SEM remontar (a cena ainda nem
  // existe neste ponto do carregamento).
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(PROJECT_DRAW_STYLE_KEY) || 'null'); } catch (e) { salvo = null; }
  applyProjectDrawStyle(salvo || {}, false);
})();

// ==========================================================================
// CAMADAS (02/09) — pedido do Matt: "um que mostre as camadas (caixa,
// portas, paineis, decoracao,etc.) e que eu possa ocultar quantos eu
// quiser, por exemplo quero ocultar so as frentes pra ver os internos...
// tirar so os eletros, com isso eu consigo". Esclarecido por ele depois:
// "modelo de cor. serve como camada" — a própria camada É o papel de cor
// (color_role_id, migration 035) que cada peça já carrega pra pintura
// (Caixa/Porta-Frente/qualquer papel novo que ele cadastrar no admin), sem
// inventar categoria nenhuma nova — e "gostaria de incluir decoracao e
// paredes como 2 camadas que sao unicas": essas 2 são linhas FIXAS, sempre
// presentes, além da lista dinâmica de papéis de cor em uso no projeto.
//
// Onde cada objeto da cena diz a que camada pertence (ver
// tagPieceUserData em viewer3d.js e renderFreeformWalls/
// buildProjectAssemblies em viewer3d_composition.js/portal-08):
//   - Object3D.userData.colorRoleId — POR PEÇA (uma porta é 'Porta/Frente',
//     uma lateral é 'Caixa', um puxador cadastrado à parte seria seu
//     próprio papel, etc.).
//   - Object3D.userData.isDecoration — no GROUP do assembly INTEIRO de um
//     módulo de decoração — esconde o módulo de uma vez, não peça a peça
//     (um fogão não tem "papel de cor" que faça sentido separar).
//   - Object3D.userData.legnoLayer === 'paredes' — no group do ambiente
//     (piso+paredes) — mesma ideia, uma unidade só.
// ==========================================================================
const PROJECT_LAYER_DECOR = 'decoracao';
const PROJECT_LAYER_WALLS = 'paredes';
// Chaves (color_role_id, ou 'decoracao'/'paredes') atualmente OCULTAS —
// vazio de propósito (nasce tudo visível); não persiste entre sessões, é
// uma ferramenta de inspeção enquanto trabalha, não configuração do projeto.
let projectHiddenLayers = new Set();

// Percorre a cena da Vista de Canto aplicando fn em cada Object3D. fn pode
// devolver true pra NÃO descer nos filhos — usado por isDecoration/paredes,
// que são "tudo ou nada" (não faz sentido olhar peça por peça lá dentro).
function walkProjectSceneObjects(node, fn) {
  if (!node) return;
  if (fn(node)) return;
  (node.children || []).forEach((child) => walkProjectSceneObjects(child, fn));
}
function projectEditScene() {
  return (typeof ViewerProjectEdit !== 'undefined' && ViewerProjectEdit.getScene) ? ViewerProjectEdit.getScene() : null;
}

// Aplica projectHiddenLayers na cena de verdade (só .visible, sem remontar
// nada) — chamada depois de QUALQUER render da Vista de Canto e a cada
// clique numa caixinha do menu.
function applyProjectLayerVisibility() {
  const scene = projectEditScene();
  if (!scene) return;
  walkProjectSceneObjects(scene, (obj) => {
    if (!obj.userData) return false;
    if (obj.userData.legnoLayer === PROJECT_LAYER_WALLS) {
      obj.visible = !projectHiddenLayers.has(PROJECT_LAYER_WALLS);
      return true;
    }
    if (obj.userData.isDecoration) {
      obj.visible = !projectHiddenLayers.has(PROJECT_LAYER_DECOR);
      return true;
    }
    if (obj.userData.colorRoleId) {
      obj.visible = !projectHiddenLayers.has(obj.userData.colorRoleId);
    }
    return false;
  });
}

// Papéis de cor REALMENTE em uso na cena aberta agora — a lista muda de
// projeto pra projeto (só aparece "Painel", por exemplo, se esse papel
// existir no admin E algum módulo do projeto usar ele). Decoração/Paredes
// não entram aqui — são fixas, adicionadas direto em refreshProjectLayersMenu.
function collectProjectColorRoleIdsInUse() {
  const scene = projectEditScene();
  const ids = new Set();
  if (!scene) return ids;
  walkProjectSceneObjects(scene, (obj) => {
    if (!obj.userData) return false;
    if (obj.userData.legnoLayer === PROJECT_LAYER_WALLS) return true;
    if (obj.userData.isDecoration) return true;
    if (obj.userData.colorRoleId) ids.add(obj.userData.colorRoleId);
    return false;
  });
  return ids;
}

// Botão+lista montados por JS (mesmo padrão do menu "Visual", montaMenuEstilo
// acima) — chamado 1 vez no carregamento; o CONTEÚDO da lista quem atualiza é
// refreshProjectLayersMenu, chamada depois de cada render.
function montaMenuCamadas() {
  const raiz = document.getElementById('po-proj-layers-menu');
  if (!raiz) return;
  raiz.innerHTML = '<button type="button" class="po-style-btn po-layers-btn" id="po-proj-layers-btn">'
    + '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>'
    + '<span>' + I18n.t('project.layers_btn') + '</span>'
    + '<i class="po-tb-dot" id="po-proj-layers-dot"></i>'
    + '<i class="po-style-caret">\u25be</i></button>'
    + '<div class="po-style-list po-layers-list" id="po-proj-layers-list"></div>';
  const btn = raiz.querySelector('#po-proj-layers-btn');
  const lista = raiz.querySelector('#po-proj-layers-list');
  attachFloatingDropdown(raiz, btn, lista);
}

// Reconstrói só a LISTA (checkboxes) — os papéis em uso podem ter mudado
// (módulo novo, cor trocada). Preserva marcado/desmarcado (projectHiddenLayers
// não é resetado aqui).
function refreshProjectLayersMenu() {
  const lista = document.getElementById('po-proj-layers-list');
  const btn = document.getElementById('po-proj-layers-btn');
  if (!lista) return;
  const idsEmUso = Array.from(collectProjectColorRoleIdsInUse());
  const linhas = idsEmUso
    .map((id) => (colorRolesCache || []).find((r) => r.id === id))
    .filter(Boolean)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((r) => ({ key: r.id, nome: r.name }));
  // Decoração/Paredes: FIXAS, sempre no fim, mesmo sem módulo de decoração
  // no projeto agora (pedido do Matt: "camadas que sao unicas" — não somem).
  linhas.push({ key: PROJECT_LAYER_DECOR, nome: I18n.t('project.layers_decoration') });
  linhas.push({ key: PROJECT_LAYER_WALLS, nome: I18n.t('project.layers_walls') });

  // Ícone de "olhinho" (02/09, pedido do Matt: "pode alinar isso e colocar
  // um olhinho mostrando visualizacao. so pra deixar mais bonito.") — o
  // checkbox continua sendo quem manda (funcionalidade igual), o olho é só
  // um reforço visual do estado: 1 SVG só com um traço de "riscado" por
  // cima (.po-layer-eye-slash) que a classe .oculto na linha mostra/esconde
  // via CSS, sem precisar trocar de ícone no JS.
  const olhoSvg = '<svg class="po-layer-eye" viewBox="0 0 24 24" width="15" height="15" fill="none" '
    + 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="2.4"/>'
    + '<line class="po-layer-eye-slash" x1="4" y1="4" x2="20" y2="20"/></svg>';
  lista.innerHTML = linhas.map((l) => {
    const oculto = projectHiddenLayers.has(l.key);
    return '<label class="po-layers-item' + (oculto ? ' oculto' : '') + '">'
      + '<input type="checkbox" data-layer-key="' + l.key + '"' + (oculto ? '' : ' checked') + '>'
      + '<span>' + l.nome + '</span>'
      + olhoSvg
      + '</label>';
  }).join('');
  lista.querySelectorAll('input[data-layer-key]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.layerKey;
      if (cb.checked) projectHiddenLayers.delete(key); else projectHiddenLayers.add(key);
      const linha = cb.closest('.po-layers-item');
      if (linha) linha.classList.toggle('oculto', !cb.checked);
      applyProjectLayerVisibility();
      if (btn) btn.classList.toggle('active', projectHiddenLayers.size > 0);
    });
  });
  if (btn) btn.classList.toggle('active', projectHiddenLayers.size > 0);
}
montaMenuCamadas();

// ==========================================================================
// COTAS (02/09) — botão liga/desliga (só isso, sem opção — ver
// portal.html #po-proj-dims-btn). Quem desenha a linha 3D é
// buildProjectDimensionLines (viewer3d_composition.js, só quando
// dimensionsEnabled) e quem escreve o número flutuante é
// refreshProjectDimensionLabels (portal-06c) — aqui só o estado
// (projectDimensionsOn) e o remonte da cena pra ligar/desligar.
// ==========================================================================
(function attachProjectDimensionsToggle() {
  const btn = document.getElementById('po-proj-dims-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    projectDimensionsOn = !projectDimensionsOn;
    btn.classList.toggle('active', projectDimensionsOn);
    renderProjectCanvas();
  });
})();

// ---------- PROJETOS SALVOS (migration 056) ----------
// Mesmo espírito de "Composições favoritas" (ver bloco perto de
// saveCompositionFavorite acima), mas numa tabela própria (user_projects) —
// projectSlots tem formato diferente (x_mm/z_order livres, sem stack_on_id)
// + existe um dado a mais que a Composição não tem (wall_width_mm, a
// largura do ambiente).

let loadedProjectFavorite = null; // { id, name, ai_preview_url } quando o projeto em edição veio de um projeto salvo (ai_preview_url usado como base fixa da IA, ver savePhotorealRenderToProject/generateAiPreviewForProjectGallery)

function serializeProjectSlots() {
  return projectSlots.map((slot) => ({
    id: slot.id,
    wall_index: Number(slot.wall_index || 0),
    x_mm: Number(slot.x_mm || 0),
    floor_height_mm: Number(slot.floor_height_mm || 0),
    z_order: Number(slot.z_order || 0),
    // Módulo ILHA (2026-08-08, ver isFloorSlot) — gravados SEMPRE, inclusive
    // pra slot de parede (placement:'wall' + zeros), pra não precisar de
    // nenhuma checagem de "campo existe?" na volta. Projeto salvo ANTES disso
    // simplesmente não tem as chaves e o restore cai no default 'wall'.
    placement: isFloorSlot(slot) ? 'floor' : 'wall',
    floor_x_mm: Number(slot.floor_x_mm || 0),
    floor_z_mm: Number(slot.floor_z_mm || 0),
    floor_rotation_deg: Number(slot.floor_rotation_deg || 0),
    // Movimentação/Rotação FINA 3 eixos (2026-08-23, ver comentário grande em
    // cima de nudgeProjectWallSlot, portal-06c-projetos-canvas-3d-acoes.js) —
    // gravados SEMPRE (parede e ilha, default 0), mesmo padrão de
    // floor_x_mm/floor_z_mm acima: sem chave = projeto salvo antes disso, cai
    // no default 0 na restauração (ver portal-09-projetos-final.js).
    fine_offset_z_mm: Number(slot.fineOffsetZMm || 0),
    fine_offset_y_mm: Number(slot.fineOffsetYMm || 0),
    fine_rot_x_deg: Number(slot.fineRotXDeg || 0),
    fine_rot_y_deg: Number(slot.fineRotYDeg || 0),
    fine_rot_z_deg: Number(slot.fineRotZDeg || 0),
    module_id: slot.module.id,
    width_mm: slot.width_mm,
    height_mm: slot.height_mm,
    depth_mm: slot.depth_mm,
    selected_colors: slot.selectedColors || [],
    piece_color_overrides: buildPieceColorOverridesSnapshot(slot.pieceColorOverrides),
    hinge_model_id: slot.hingeModel ? slot.hingeModel.id : null,
    slide_model_id: slot.slideModel ? slot.slideModel.id : null,
    shelf_quantities: slot.shelfQuantities || {},
    dim_overrides: slot.dimOverrides || {},
    selected_optional_ids: slot.selectedOptionalIds || [],
    // removed_piece_ids (2026-08-20): remoção manual de qualquer peça pelo
    // cliente no modal "Peças do móvel" (pedido "quero remover qualquer
    // peca") — cabe no mesmo jsonb de slots que já existe, sem migration,
    // mesmo raciocínio do comentário do `layout` logo abaixo.
    removed_piece_ids: slot.removedPieceIds || [],
    // Árvore de vãos montada no construtor de armário (spec §4.5 — cabe no
    // jsonb que já existe, sem migration). null = o cliente não mexeu.
    layout: slot.layout || null,
    thumbnail_data_url: slot.thumbnail_data_url || null,
    // Grupo de módulos (2026-09-03) — null/null = avulso. Ver
    // createProjectSlotGroup/ungroupProjectSlots (portal-06b) e a
    // restauração em portal-09-projetos-final.js.
    group_id: slot.group_id || null,
    group_name: slot.group_name || null
  }));
}
