// portal-06c-projetos-canvas-3d-acoes.js — 3/3 do que era
// portal-06-projetos-canvas.js (quebrado de novo em 2026-08-20, ver
// portal_js_monolito_performance na memória do projeto).
// Aba "Projetos": limite da furadeira (trava de medida), vista frontal
// padrão arrastável, vista de canto 3D interativa (paredes L/C-U), setas de
// redimensionamento em 3D (toque), esticar até encostar, botões
// duplicar/remover sobre o módulo selecionado, substituir módulo, peças do
// móvel (lista de corte + vista explodida).
// Carrega depois de portal-06b-projetos-canvas-ia-custo.js e ANTES de
// portal-07-construtor.js.


// ==========================================================================
// LIMITE DA FURADEIRA — o fundo tem que caber na máquina (2026-08-15)
// ==========================================================================
// Matt: "furo é furado e a máquina só passa até 1050mm (não é nem 1200mm).
// Quando a largura de um móvel passa de 1050mm interno, ainda temos a opção
// de deitar esse fundo pra ir até 2700mm interno. Porém se ele deitar, a
// altura não pode passar de 1050mm também." E depois: "acima de 1050 deita,
// 100%. Trava a medida do configurador quando chegar no limite. Detalhe
// importante: módulos que não têm fundo não têm essa preocupação."
//
// Deitar é automático e não precisa de código: o plano de corte já orienta a
// peça (ver veio/plano de corte). O que faltava era a TRAVA — hoje o
// configurador deixava chegar numa medida que a fábrica não consegue furar.
//
// A pegadinha: o teto de uma dimensão DEPENDE da outra. Deitado, um lado vai
// até 2700; o outro é que tem que caber nos 1050. Então não dá pra cravar um
// width_max no cadastro — tem que ser calculado a cada mudança, que é o que
// esta função faz.
const FURADEIRA_LADO_MAX_MM = 1050;   // o lado que PASSA na máquina
const FURADEIRA_COMP_MAX_MM = 2700;   // o lado que corre ao longo dela

// Quanto o fundo é MENOR que o módulo em cada eixo. Sai da peça resolvida de
// verdade (não de fórmula chutada), então acompanha qualquer cadastro: no
// "Bottom · Toe 4½ · Back" medido no ar dá 39 na largura e 19,5 na altura.
// Cacheado por módulo — isto é consultado a cada pointermove do arraste.
function projectSlotFundoOffsets(slot) {
  const modId = (slot.module || {}).id || null;
  if (slot._fundoOffId === modId) return slot._fundoOff || null;
  slot._fundoOffId = modId;
  slot._fundoOff = null;
  try {
    const W = Number(slot.width_mm) || 0, H = Number(slot.height_mm) || 0, D = Number(slot.depth_mm) || 0;
    if (!W || !H || !D) return null;
    const parts = resolvePiecesForViewer(
      slot.pieces, { W: W, H: H, D: D },
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    );
    // MÓDULO SEM FUNDO NÃO TEM ESSA PREOCUPAÇÃO — é metade do catálogo aqui
    // (todos os "… · No back"), e é a primeira coisa conferida de propósito.
    const f = (parts || []).find((p) => p.position_role === 'back');
    if (!f) return null;
    slot._fundoOff = { kW: W - Number(f.width_mm || 0), kH: H - Number(f.height_mm || 0) };
  } catch (e) { slot._fundoOff = null; }
  return slot._fundoOff;
}

// Teto desta dimensão do MÓDULO pra que o fundo continue fabricável, dado o
// tamanho ATUAL da outra. Infinity = sem restrição (módulo sem fundo).
function projectSlotMaxDimForDrilling(slot, axis) {
  if (axis !== 'width' && axis !== 'height') return Infinity;
  const off = projectSlotFundoOffsets(slot);
  if (!off) return Infinity;
  const kEste  = axis === 'width' ? off.kW : off.kH;
  const kOutro = axis === 'width' ? off.kH : off.kW;
  const outroMm = Number(slot[(axis === 'width' ? 'height' : 'width') + '_mm']) || 0;
  const ladoOutro = outroMm - kOutro;
  // O outro lado já passa dos 1050: ele é obrigatoriamente o lado deitado
  // (que corre até 2700), então ESTE é o que precisa passar na máquina.
  const teto = (ladoOutro > FURADEIRA_LADO_MAX_MM) ? FURADEIRA_LADO_MAX_MM : FURADEIRA_COMP_MAX_MM;
  return teto + kEste;
}

// Aplica uma referência de SKU (module_dimension_presets.reference, mesmo
// catálogo do dropdown "Selecionar referência" da vitrine — ver
// moduleSkuPresetsByModuleId/loadModuleSkuPresets em portal-01-core-catalogo.js)
// a um slot JÁ inserido no projeto. Pedido do usuário (2026-08-21, com print
// do painel de configuração): "quando tem opcoes travas com sku deve ter um
// dropbox mostrando as SKU pra rapida escolha" — o mesmo dropdown que já
// existe na tela "New Quote" (clique = adiciona no carrinho já com aquela
// medida) faltava aqui na aba Projetos (clique = aplica a medida no módulo
// já selecionado). Uma referência pode definir só largura, só altura, ou as
// duas — dimensão que ela não define fica como está (mesma regra de
// addModuleToCartWithSku). Cada chamada de updateProjectSlotDimension já
// recalcula preço/redesenha sozinha; chamar duas vezes (largura e depois
// altura) é redundante mas inofensivo — mantém o mesmo caminho testado de
// clamp/trava por eixo em vez de duplicar a lógica aqui.
function applyProjectSlotSku(slot, sku) {
  if (!sku) return;
  if (sku.width_mm != null) updateProjectSlotDimension(slot, 'width', sku.width_mm);
  if (sku.height_mm != null) updateProjectSlotDimension(slot, 'height', sku.height_mm);
}

// Calcula o valor FINAL (já clampado) de uma dimensão do slot, SEM mutar
// nada — extraído de updateProjectSlotDimension (2026-09-02) pra poder ser
// reaproveitado por quem precisa saber o tamanho final ANTES de aplicar (ver
// handleProject3DResizeMove/isFloorSlot em portal-08-projetos-paredes.js: a
// ilha precisa do tamanho já clampado pra recolocar o centro e ancorar a
// borda oposta à seta agarrada, em vez de crescer simétrica pros dois lados).
function projectSlotClampedDimensionMm(slot, axis, mm) {
  const m = slot.module;
  // Medida TRAVADA (width_locked/height_locked) — pedido do usuário
  // (2026-07-26): "quero usar o mesmo sistema de arrastar com as flechas so
  // com as medidas fixas". Em vez de clampar contínuo no min/max do módulo,
  // pula pro valor CADASTRADO (widthPresetsMm/heightPresetsMm, ver
  // insertProjectModuleDefault/restoreFavoriteProject/po-add-item-btn) mais
  // próximo de onde o arraste parou (Pricing.pickNearestPreset — mesma
  // função que já arredonda peça-módulo travada dentro de outro módulo, ver
  // fetchModuleLockedDimensionPresets).
  const isLocked = (axis === 'width' && m.width_locked) || (axis === 'height' && m.height_locked);
  if (isLocked) {
    const presets = axis === 'width' ? (slot.widthPresetsMm || []) : (slot.heightPresetsMm || []);
    if (presets.length) return Pricing.pickNearestPreset(presets, Number(mm) || 0);
  }
  const minMm = Number(m[`${axis}_min_mm`] || 0);
  let maxMm = Number(m[`${axis}_max_mm`]);
  if (!(maxMm > 0)) maxMm = Infinity;
  // Mesma regra de insertProjectModuleDefault (pedido do usuário, 2026-07-24:
  // medida travada "não pode reduzir não importa a regra") — altura travada
  // (m.height_locked) não é encolhida pelo teto/rodapé, só pelo min/max do
  // próprio módulo.
  if (axis === 'height' && !m.height_locked) {
    maxMm = Math.min(maxMm, Math.max(roomSettings.ceiling_mm - effectiveCeilingClearanceMm(m) - roomSettings.baseboard_mm - Number(slot.floor_height_mm || 0), 0));
  }
  // TRAVA DA FURADEIRA — o fundo tem que caber na máquina (ver
  // projectSlotMaxDimForDrilling). Entra junto com os outros tetos, no mesmo
  // clamp, então vale pro arraste das setas, pro campo digitado e pra
  // qualquer caminho que passe por aqui. Módulo sem fundo devolve Infinity e
  // nada muda.
  maxMm = Math.min(maxMm, projectSlotMaxDimForDrilling(slot, axis));
  return clamp(Number(mm) || 0, minMm, maxMm);
}

function updateProjectSlotDimension(slot, axis, mm) {
  slot[`${axis}_mm`] = projectSlotClampedDimensionMm(slot, axis, mm);
  recomputeProjectSlotPricing(slot);
  clampProjectSlotPosition(slot);
  resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
  renderProjectCanvas();
  markProjectDirty();
}

// Extraído de updateProjectSlotColor (só a parte que MEXE no slot, sem
// recalcular preço/re-renderizar) pra poder ser chamado em loop por
// applyColorRoleToAllProjectSlots (troca em massa, ver logo abaixo) sem
// duplicar a lógica de upsert em selectedColors.
function applyColorToProjectSlot(slot, roleId, color) {
  slot.colorsByRole = { ...slot.colorsByRole, [roleId]: color };
  // selectedColors (não só colorsByRole) precisa refletir a troca — é o
  // array que serializeProjectSlots() grava de verdade no banco (ver bug
  // 2026-07-21 em insertProjectModuleDefault, mesmo raciocínio: colorsByRole
  // sozinho renderiza bem na hora, mas quem "sobrevive" ao salvar/recarregar
  // é só selectedColors). Upsert por role_id — substitui a entrada antiga
  // dessa role se já existir, adiciona nova senão.
  const roleName = (colorRolesCache.find((r) => r.id === roleId) || {}).name || null;
  const entry = { role_id: roleId, role_name: roleName, color_id: color ? color.id : null, color_name: color ? color.name : null };
  const existingIdx = (slot.selectedColors || []).findIndex((sc) => sc.role_id === roleId);
  if (existingIdx >= 0) slot.selectedColors[existingIdx] = entry;
  else {
    if (!slot.selectedColors) slot.selectedColors = [];
    slot.selectedColors.push(entry);
  }
}

function updateProjectSlotColor(slot, roleId, color) {
  applyColorToProjectSlot(slot, roleId, color);
  recomputeProjectSlotPricing(slot);
  renderProjectCanvas();
  markProjectDirty();
}

// ==========================================================================
// MOVIMENTAÇÃO FINA (2026-08-23, pedido do Matt com print do Promob de
// referência) — "movimentacao / rotacao fina do modulo ja inserido no
// ambiente... coloco por exemplo 1mm e ele movimenta so essa quantidade pro
// sentido que eu quero". Painel de configuração (po-proj-config-panel,
// ver renderProjectConfigPanel) ganha um passo em mm/pol (lembrado durante a
// sessão, não salvo no projeto — mesmo espírito de po-unit-select) + setas
// que somam/subtraem exatamente esse passo do eixo escolhido, um clique = um
// passo. Reaproveita os MESMOS clamps/mutação que o arraste já usa
// (clampProjectSlotPosition, clampFloorSlotIntoRoom, resolveProjectSlotDepth)
// — a seta não pode conseguir uma posição que o arraste recusaria.
//
// Dois modelos de posição coexistem (ver isFloorSlot):
//   - módulo de PAREDE: x_mm (ao longo da parede) + floor_height_mm (altura
//     do chão). Sem eixo de profundidade — módulo de parede está sempre
//     encostado nela (z_order é só camada, não é uma medida). Sem rotação
//     própria: a peça sempre olha pra fora da parede que ocupa.
//   - módulo ILHA (placement='floor'): floor_x_mm/floor_z_mm (posição livre
//     no piso) + floor_rotation_deg (giro livre, não só múltiplo de 90°).
//
// projectMoveStepMm/projectMoveRotateStepDeg persistem só em memória
// (variável de módulo, não em `slot` nem no projeto) — trocar o passo com um
// módulo selecionado e clicar noutro já continua no mesmo passo.
let projectMoveStepMm = 1;
let projectMoveRotateStepDeg = 1;

// ATUALIZAÇÃO 2026-08-23 (pedido do Matt, com o mesmo print do Promob de
// referência: "o dimencionamento esta so num sentido... sao os 3 sentidos.
// rotacao nos 3 sentidos tambem"): os dois tipos de módulo passam a ter os 3
// eixos de movimento (X/Y/Z) e os 3 eixos de rotação (X/Y/Z) na UI, não só
// os 1-2 que o modelo de dados original previa. Pra não inventar colisão/
// física nova nos eixos que NUNCA existiram (parede não tinha profundidade
// livre nem rotação própria; ilha não tinha altura), cada tipo continua com
// os eixos REAIS que já tinha (com o mesmo clamp de sempre) e ganha os que
// faltavam como ajuste FINO — mesmo princípio já usado em offset_x_mm/
// offset_z_mm de position_role='front' (26-modulo-pecas-3d.js): não
// participa de colisão, não aparece nas vistas 2D (planta/frontal), só na
// cena 3D de verdade (ver fineOffsetZ_m/fineOffsetY_m/fineRotX/Y/Z em
// buildProjectAssemblies + renderFreeformWalls, portal-08/viewer3d_composition).
//
//   PAREDE:  X = x_mm (real, ao longo da parede) | Y = floor_height_mm (real,
//            altura) | Z = fineOffsetZMm (fino, afasta da parede)
//            Rotação X/Y/Z = fineRotXDeg/fineRotYDeg/fineRotZDeg (fino, os 3)
//   ILHA:    X = floor_x_mm (real) | Y = fineOffsetYMm (fino, eleva do chão)
//            | Z = floor_z_mm (real)
//            Rotação Y = floor_rotation_deg (real, já tinha — giro no lugar)
//            Rotação X/Z = fineRotXDeg/fineRotZDeg (fino, novos)

// Módulo de PAREDE — axis 'x' (ao longo da parede, real), 'y' (altura, real)
// ou 'z' (afastamento da parede, fino).
function nudgeProjectWallSlot(slot, axis, deltaMm) {
  if (axis === 'x') {
    slot.x_mm = Number(slot.x_mm || 0) + deltaMm;
  } else if (axis === 'y') {
    slot.floor_height_mm = Number(slot.floor_height_mm || 0) + deltaMm;
  } else {
    // 'z' — fino, sem clamp (mesma filosofia do offset_z_mm de 'front').
    slot.fineOffsetZMm = Number(slot.fineOffsetZMm || 0) + deltaMm;
  }
  if (axis === 'x' || axis === 'y') {
    // Mesmo clamp do arraste (largura da parede, recuo de canto, pé-direito) —
    // ver clampProjectSlotPosition em portal-06b-projetos-canvas-ia-custo.js.
    clampProjectSlotPosition(slot);
    resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
  }
  renderProjectCanvas();
  markProjectDirty();
  renderProjectConfigPanel(); // atualiza a leitura de posição no painel
}

// Módulo de PAREDE — rotação fina nos 3 eixos (nenhum é real: parede nunca
// girava sozinha, sempre olhava pra fora dela — ver comentário acima).
function nudgeProjectWallSlotRotation(slot, axis, deltaDeg) {
  const key = axis === 'x' ? 'fineRotXDeg' : axis === 'z' ? 'fineRotZDeg' : 'fineRotYDeg';
  slot[key] = ((Number(slot[key] || 0) + deltaDeg) % 360 + 360) % 360;
  renderProjectCanvas();
  markProjectDirty();
}

// Módulo ILHA — axis 'x'/'z' (posição livre no piso, real, mesmo clamp do
// arraste livre — ver clampFloorSlotIntoRoom) ou 'y' (elevação do chão, fina
// — só teto como limite de bom senso, sem checagem de colisão de verdade).
function nudgeProjectFloorSlot(slot, axis, deltaMm) {
  if (axis === 'x') {
    slot.floor_x_mm = Number(slot.floor_x_mm || 0) + deltaMm;
    clampFloorSlotIntoRoom(slot);
  } else if (axis === 'z') {
    slot.floor_z_mm = Number(slot.floor_z_mm || 0) + deltaMm;
    clampFloorSlotIntoRoom(slot);
  } else {
    const maxMm = Math.max(Number(roomSettings.ceiling_mm || 0) - Number(roomSettings.baseboard_mm || 0) - Number(slot.height_mm || 0), 0);
    slot.fineOffsetYMm = clamp(Number(slot.fineOffsetYMm || 0) + deltaMm, 0, maxMm);
  }
  renderProjectCanvas();
  markProjectDirty();
}

// Módulo ILHA — rotação. axis 'y' continua o giro REAL (gira em torno do
// próprio centro, sentido livre, reclampa a posição depois: girar troca a
// pegada largura<->profundidade perto de 90° e pode empurrar a peça pra fora
// do retângulo do ambiente). axis 'x'/'z' são tombar/rolar — finos, sem
// reclamp (a ilha pode "flutuar" visualmente ao inclinar, mesmo trade-off já
// aceito nos outros eixos finos).
function nudgeProjectFloorSlotRotation(slot, axis, deltaDeg) {
  if (axis === 'y') {
    slot.floor_rotation_deg = ((Number(slot.floor_rotation_deg || 0) + deltaDeg) % 360 + 360) % 360;
    clampFloorSlotIntoRoom(slot);
  } else {
    const key = axis === 'x' ? 'fineRotXDeg' : 'fineRotZDeg';
    slot[key] = ((Number(slot[key] || 0) + deltaDeg) % 360 + 360) % 360;
  }
  renderProjectCanvas();
  markProjectDirty();
}

// "Posição no ambiente" (2026-09-02, Matt: "quero subir pra 34 do chao essa
// peca. eu posso subir ela 34 mas nao consigo saber exatamente onde ela se
// encontra no ambiente, entao quero uma aba que mostre nos 3 eixos quanto
// ela esta afastada de cada ponta") — complementa a Movimentação acima (que
// só EMPURRA por passos) com uma LEITURA exata da distância até cada limite
// do ambiente, dos dois lados de cada eixo real, e edição direta de
// qualquer um dos dois lados. O outro lado NUNCA é guardado à parte — é
// sempre "limite − valor", recalculado no próximo render (por isso não
// existe "sincronizar os dois campos" aqui: editar um já move a peça, o
// outro lado atualiza sozinho quando o painel re-renderiza no fim). Os
// limites usados são os MESMOS das funções de clamp de verdade
// (projectWallSlotXBoundsMm/projectSlotMaxFloorHeightMm/
// projectFloorRoomBoundsMm, extraídas pra isso) — a leitura nunca pode
// mostrar ou aceitar um número que o clamp de arrastar recusaria.
// axisKey: 'x'|'y'|'z'. side: 'near' (rótulo da esquerda/frente/chão) ou
// 'far' (direita/fundo/teto) — 'z' de módulo de PAREDE só tem 'near' (é
// ajuste fino, sem "parede oposta" definida pro layout de paredes livres).
function setProjectSlotPositionFromSide(slot, axisKey, side, mmValue) {
  const v = Number(mmValue) || 0;
  if (isFloorSlot(slot)) {
    if (axisKey === 'y') {
      const maxY = Math.max(Number(roomSettings.ceiling_mm || 0) - Number(roomSettings.baseboard_mm || 0) - Number(slot.height_mm || 0), 0);
      slot.fineOffsetYMm = clamp(side === 'near' ? v : maxY - v, 0, maxY);
    } else {
      const b = projectFloorRoomBoundsMm(slot);
      const min = axisKey === 'x' ? b.xMin : b.zMin;
      const max = axisKey === 'x' ? b.xMax : b.zMax;
      const novo = side === 'near' ? min + v : max - v;
      if (axisKey === 'x') slot.floor_x_mm = novo; else slot.floor_z_mm = novo;
      clampFloorSlotIntoRoom(slot);
    }
  } else if (axisKey === 'x') {
    const b = projectWallSlotXBoundsMm(slot);
    slot.x_mm = side === 'near' ? b.min + v : b.max - v;
    clampProjectSlotPosition(slot);
    resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
  } else if (axisKey === 'y') {
    const maxY = projectSlotMaxFloorHeightMm(slot.height_mm, slot.module);
    slot.floor_height_mm = clamp(side === 'near' ? v : maxY - v, 0, maxY);
  } else {
    // 'z' de parede — fino, sem clamp (só existe o lado 'near').
    slot.fineOffsetZMm = v;
  }
  renderProjectCanvas();
  markProjectDirty();
  renderProjectConfigPanel(); // reflete o lado OPOSTO recalculado
}

// ==========================================================================
// REMOVER/RESTAURAR QUALQUER PEÇA (2026-08-20)
// ==========================================================================
// Pedido do Matt no modal "Peças do móvel": "nessa listagem eu gostaria de
// poder remover alguma peca ou trocar de cor." Propus um default mais
// conservador (só peça do Construtor, ou peça de casco com client_optional)
// e ele foi explícito: "quero remover qualquer peca." — inclusive lateral,
// fundo, base etc., sem depender de nenhuma flag do admin.
//
// slot.removedPieceIds guarda só os ids — a peça continua existindo em
// slot.pieces/slot.layoutPieces (nada é apagado de verdade), então
// restaurar é sempre possível e nenhum outro código (preço, 3D, furação)
// precisa saber que "remover" existe além de checar essa lista uma vez —
// ver projectSlotEffectivePieces (portal-06b) e o filtro espelhado nas
// duas telas de furação do ERP (furacao-ban.js/furacao-lote.js).
//
// LIMITAÇÃO CONHECIDA: peça de catálogo com quantidade configurável pelo
// cliente (shelfQuantities, ex. "3 prateleiras" do mesmo cadastro) tem UM
// piece.id só pras N cópias — remover uma remove as N juntas. Peça do
// Construtor (cada vão gera um id sintético PRÓPRIO, `lay:<nodeId>:<i>` em
// layout-engine.js) não tem essa limitação: cada porta/prateleira/divisória
// inserida no Construtor remove individualmente.
function removeProjectSlotPiece(slot, pieceId) {
  if (pieceId == null) return;
  if (!slot.removedPieceIds) slot.removedPieceIds = [];
  if (!slot.removedPieceIds.includes(pieceId)) slot.removedPieceIds.push(pieceId);
  recomputeProjectSlotPricing(slot);
  renderProjectSlotPiecesList(slot);
  renderProjectSlotPiecesExploded(slot);
  renderProjectCanvas();
  markProjectDirty();
}

function restoreProjectSlotPiece(slot, pieceId) {
  if (pieceId == null || !slot.removedPieceIds) return;
  slot.removedPieceIds = slot.removedPieceIds.filter((id) => id !== pieceId);
  recomputeProjectSlotPricing(slot);
  renderProjectSlotPiecesList(slot);
  renderProjectSlotPiecesExploded(slot);
  renderProjectCanvas();
  markProjectDirty();
}

// Cor de UMA instância de peça (migration 046, pieceColorOverrides) — mesmo
// formato/mesma leitura já usada em todo o app (resolvePiecesForViewer,
// Pricing.calculateAssembly/calculatePiece, buildCompositionAssemblies), só
// que agora tem uma UI que escreve nele a partir do modal "Peças do móvel"
// (antes só existia a leitura — ver [[pieceColorOverrides_so_leitura]] na
// investigação desta sessão). Upsert por role_id dentro do piece_id, mesmo
// padrão de applyColorToProjectSlot acima.
function setProjectSlotPieceColor(slot, pieceId, roleId, color) {
  if (pieceId == null || !roleId) return;
  if (!slot.pieceColorOverrides) slot.pieceColorOverrides = {};
  const perRole = { ...(slot.pieceColorOverrides[pieceId] || {}) };
  perRole[roleId] = color;
  slot.pieceColorOverrides = { ...slot.pieceColorOverrides, [pieceId]: perRole };
  recomputeProjectSlotPricing(slot);
  renderProjectSlotPiecesList(slot);
  renderProjectSlotPiecesExploded(slot);
  renderProjectCanvas();
  markProjectDirty();
}

// Troca em massa (pedido do usuário 2026-07-26: "que eu possa trocar as
// cores conforme os modelos de todos modulos inseridos de uma vez so") —
// mesmo princípio de applyColorRoleToComposition, mas em cima de
// projectSlots/recomputeProjectSlotPricing (usa peças EFETIVAS — sem
// opcional não marcado — igual todo o resto da aba Projetos, ver
// projectSlotEffectivePieces). Só mexe nos slots que realmente usam esse
// papel de cor (pieceTreeHasColorRole); erro num slot não trava os outros.
//
// Recebe o GRUPO inteiro, não só o roleId (2026-09-02) — mesma razão de
// applyColorRoleToComposition: loadColorRoleGroupsForSlots agora devolve a
// UNIÃO das cores do grupo, então uma cor pode não valer pra TODOS os
// módulos (ex.: "Fast Closet" de cores limitadas ao lado de um módulo com o
// catálogo inteiro — Matt: "nao deve trocar se algum com limitacao nao
// possa receber a cor do modulo que pode"). `group.moduleColorIds` diz
// quais módulos aceitam a cor escolhida; quem não aceita é PULADO, mantém
// a cor de antes.
function applyColorRoleToAllProjectSlots(group, color) {
  const { roleId, moduleColorIds } = group;
  const errorEl = document.getElementById('po-proj-side-color-error');
  if (errorEl) errorEl.style.display = 'none';
  let firstErrorMsg = null;
  projectSlots.forEach((slot) => {
    if (!pieceTreeHasColorRole(slot.pieces, roleId)) return;
    const allowedIds = moduleColorIds && moduleColorIds.get(slot.module.id);
    if (!allowedIds || !allowedIds.has(color.id)) return;
    try {
      applyColorToProjectSlot(slot, roleId, color);
      recomputeProjectSlotPricing(slot);
    } catch (err) {
      if (!firstErrorMsg) firstErrorMsg = err.message || String(err);
    }
  });
  if (firstErrorMsg && errorEl) {
    errorEl.textContent = I18n.t('project.side_color_error', { msg: firstErrorMsg });
    errorEl.style.display = 'block';
  }
  renderProjectCanvas();
  markProjectDirty();
}

async function loadProjectColorRoleGroups() {
  return loadColorRoleGroupsForSlots(projectSlots);
}

// Monta (ou esconde) o painel de troca rápida dentro do po-proj-config-panel
// — chamado por renderProjectConfigPanel() sempre que NENHUM módulo está
// selecionado. Mesma estrutura por abas (uma por color_role_id) da
// Composição (ver renderCompositionSideColorPanel), só que escrevendo no
// innerHTML dinâmico do painel de Projetos em vez de um bloco HTML fixo —
// por isso o guard document.body.contains(tabsEl): a query é assíncrona, e
// se o usuário selecionar um módulo enquanto ela roda, renderProjectConfigPanel()
// já trocou o innerHTML inteiro do panel por outra coisa (o editor do
// módulo) — sem o guard, o resultado da query tentaria escrever em
// elementos que não existem mais no DOM.
async function renderProjectSideColorPanel() {
  const wrap = document.getElementById('po-proj-side-color-panel');
  const tabsEl = document.getElementById('po-proj-side-color-tabs');
  const swatchesEl = document.getElementById('po-proj-side-color-swatches');
  if (!wrap || !tabsEl || !swatchesEl) return;
  const groups = await loadProjectColorRoleGroups();
  if (!document.body.contains(tabsEl)) return; // painel já virou outra coisa enquanto a query rodava
  tabsEl.innerHTML = '';
  swatchesEl.innerHTML = '';
  if (!groups.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';

  if (!groups.some((g) => g.roleId === projColorActiveTabRoleId)) {
    projColorActiveTabRoleId = groups[0].roleId;
  }

  groups.forEach((group) => {
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'po-comp-color-tab-btn';
    tabBtn.textContent = group.roleName || I18n.t('color.prefix');
    if (group.roleId === projColorActiveTabRoleId) tabBtn.classList.add('active');
    tabBtn.addEventListener('click', () => {
      projColorActiveTabRoleId = group.roleId;
      renderProjectColorTabSwatches(groups);
    });
    tabsEl.appendChild(tabBtn);
  });

  renderProjectColorTabSwatches(groups);
}

// Desenha só as swatches da aba ATIVA — separado de renderProjectSideColorPanel
// pra trocar de aba sem reconsultar o banco de novo (mesmo padrão de
// renderCompositionColorTabSwatches). Nenhum swatch nasce "selecionado" —
// não é uma escolha única salva, é só um atalho de troca em massa.
function renderProjectColorTabSwatches(groups) {
  const tabsEl = document.getElementById('po-proj-side-color-tabs');
  const swatchesEl = document.getElementById('po-proj-side-color-swatches');
  if (!tabsEl || !swatchesEl) return;
  [...tabsEl.children].forEach((btn, i) => {
    btn.classList.toggle('active', groups[i] && groups[i].roleId === projColorActiveTabRoleId);
  });
  const group = groups.find((g) => g.roleId === projColorActiveTabRoleId);
  swatchesEl.innerHTML = '';
  if (!group) return;
  renderSwatches(swatchesEl, group.colors, null, (colorId) => {
    const chosen = group.colors.find((c) => c.id === colorId);
    if (chosen) applyColorRoleToAllProjectSlots(group, chosen);
  });
}

// Painel à direita (pedido do usuário: "ao clicar no modulo abre
// configuracoes da direita com as opcoes que ele carrega... eu resolva tudo
// na mesma tela") — editor de verdade: medida (steppers) e cor (swatches)
// direto aqui, recalculando preço a cada mudança. "Editar configuração
// completa" continua existindo pra opcionais/dobradiça-corrediça/peça
// aninhada — casos avançados que duplicar aqui traria mais risco de
// regressão (ver memória sobre fragilidade do 3D) do que valor pra Fase 1;
// reabre o MESMO configurador único de sempre (editProjectSlot).
function renderProjectConfigPanel() {
  const panel = document.getElementById('po-proj-config-panel');
  if (!panel) return;
  const slot = projectSlots.find((s) => s.id === selectedProjectSlotId);
  if (!slot) {
    // Nenhum módulo selecionado (clicou fora, ver attachProject3DEditDrag) —
    // pedido do usuário 2026-07-26: "quando clicar na tela quero que nao
    // apareca ennhum modulo nas configuracoes da direita e que eu possa
    // trocar as cores conforme os modelos de todos modulos inseridos de uma
    // vez so". Painel vira o troca-rápida-de-cor em massa (por papel de
    // cor/abas — mesmo padrão já validado na Composição, ver
    // renderCompositionSideColorPanel) em vez de só a dica vazia; escondido
    // via display:none até loadProjectColorRoleGroups() resolver (só aparece
    // se algum módulo tiver alguma peça com cor cadastrada).
    panel.innerHTML = `
      <p class="hint" id="po-proj-config-empty-hint">${I18n.t('project.select_module_hint')}</p>
      <div id="po-proj-side-color-panel" style="display:none;">
        <label>${I18n.t('project.side_color_label')}</label>
        <p class="hint">${I18n.t('project.side_color_hint')}</p>
        <div id="po-proj-side-color-tabs" class="po-comp-color-tabs"></div>
        <div id="po-proj-side-color-swatches" class="color-role-swatches"></div>
        <p id="po-proj-side-color-error" class="error" style="display:none;"></p>
      </div>
    `;
    renderProjectSideColorPanel();
    return;
  }
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const m = slot.module;

  // Pedido do usuário (3ª rodada, 2026-07-21): "não precisa botão menos e
  // mais. pode deixar mais próximo visualmente de cada variável" — tirou os
  // steppers (só o campo exato, editável por texto/Enter, como os outros
  // campos de medida do site) e label+input ficam colados, sem o
  // space-between que os separava (ver CSS .po-proj-config-dim-row).
  //
  // Pedido do usuário (2026-08-21, com print do painel): "quando tem opcoes
  // travas com sku deve ter um dropbox mostrando as SKU pra rapida escolha"
  // — eixo TRAVADO (m.width_locked/height_locked) com valores cadastrados
  // (module_dimension_presets, ver slot.widthPresetsLabeled/
  // heightPresetsLabeled preenchidos por insertProjectModuleDefault/restore/
  // duplicateProjectSlot) mostra um <select> com o rótulo/SKU de cada
  // opção (mesmo texto "label — medida" do dropdown de tamanho do opcional
  // aninhado, ver .po-optional-width-select em portal-01-core-catalogo.js)
  // em vez do campo de texto livre — eixo travado já só aceitava esses
  // valores mesmo (pickNearestPreset em updateProjectSlotDimension), só não
  // tinha como VER as opções sem arrastar a flecha até bater numa. Eixo sem
  // trava, ou travado mas sem preset cadastrado ainda (admin não populou),
  // continua no campo de texto de sempre.
  const dimRow = (axis, label) => {
    const isLockedAxis = (axis === 'width' && m.width_locked) || (axis === 'height' && m.height_locked);
    const labeledPresets = axis === 'width' ? (slot.widthPresetsLabeled || [])
      : axis === 'height' ? (slot.heightPresetsLabeled || [])
      : [];
    if (isLockedAxis && labeledPresets.length) {
      const currentMm = Number(slot[`${axis}_mm`]) || 0;
      let bestIdx = 0, bestDiff = Infinity;
      labeledPresets.forEach((p, i) => {
        const diff = Math.abs(Number(p.value_mm) - currentMm);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      });
      const options = labeledPresets.map((p, i) => `
        <option value="${p.value_mm}"${i === bestIdx ? ' selected' : ''}>${p.label ? `${p.label} — ${formatDimension(p.value_mm, unit)}` : formatDimension(p.value_mm, unit)}</option>
      `).join('');
      return `
        <div class="po-proj-config-dim-row">
          <label>${label}</label>
          <span class="po-proj-dim-value-wrap">
            <select class="po-proj-dim-select" data-axis="${axis}">${options}</select>
          </span>
        </div>
      `;
    }
    return `
      <div class="po-proj-config-dim-row">
        <label>${label}</label>
        <span class="po-proj-dim-value-wrap">
          <input type="text" inputmode="decimal" class="po-proj-dim-input" data-axis="${axis}" value="${formatDimensionNumber(slot[`${axis}_mm`], unit)}" />
          <span class="po-proj-dim-unit">${unitAbbrev(unit)}</span>
        </span>
      </div>
    `;
  };

  const usedRoleIds = Array.from(collectUsedColorRoleIds(projectSlotEffectivePieces(slot)));
  const colorSections = usedRoleIds.map((roleId) => {
    const opts = (slot.colorOptionsByRole && slot.colorOptionsByRole[roleId]) || [];
    if (!opts.length) return '';
    const roleName = (colorRolesCache.find((r) => r.id === roleId) || {}).name || '';
    const selected = slot.colorsByRole ? slot.colorsByRole[roleId] : null;
    const swatches = opts.map((c) => `
      <div class="po-proj-color-swatch${selected && selected.id === c.id ? ' selected' : ''}" data-role-id="${roleId}" data-color-id="${c.id}" title="${c.name}">
        ${c.texture_url ? `<img src="${c.texture_url}" alt="${c.name}" />` : `<span style="background:${c.swatch_hex || '#ccc'};"></span>`}
      </div>
    `).join('');
    return `<div class="po-proj-color-role-group"><label>${roleName}</label><div class="po-proj-color-swatches">${swatches}</div></div>`;
  }).join('');

  const depthLabel = Number(slot.z_order || 0) > 0
    ? I18n.t('project.config_depth_value_front', { n: slot.z_order })
    : I18n.t('project.config_depth_value_back');

  // Dropdown de referência/SKU (mesmo catálogo da vitrine "New Quote", ver
  // moduleSkuPresetsByModuleId/skuOptionLabel em portal-01-core-catalogo.js)
  // — só aparece se este módulo tem pelo menos 1 referência cadastrada.
  // Pré-seleciona a referência que já bate com a medida atual do slot
  // (findMatchingSkuReference), senão fica em "Selecionar..." sem aplicar
  // nada sozinho.
  const skuOptions = (typeof moduleSkuPresetsByModuleId !== 'undefined' ? moduleSkuPresetsByModuleId[m.id] : null) || [];
  const currentSkuRef = skuOptions.length ? findMatchingSkuReference(m.id, slot.width_mm, slot.height_mm) : null;
  const skuBlock = skuOptions.length ? `
    <div class="po-proj-config-dim-row po-proj-config-sku-row">
      <label>${I18n.t('step1.sku_label')}</label>
      <select class="po-proj-config-sku-select">
        <option value="">${I18n.t('step1.sku_placeholder')}</option>
        ${skuOptions.map((s) => `<option value="${s.reference}"${s.reference === currentSkuRef ? ' selected' : ''}>${skuOptionLabelForUnit(s, unit)}</option>`).join('')}
      </select>
    </div>
  ` : '';

  // "Movimentação/Rotação fina" (2026-08-23, pedido do Matt com print do
  // Promob de referência — ver comentário grande em cima de
  // nudgeProjectWallSlot pro porquê dos eixos reais vs. finos por tipo).
  // Reformulado na mesma data (2ª rodada, o Matt: "o dimencionamento esta so
  // num sentido... sao os 3 sentidos. rotacao nos 3 sentidos tambem. e ta
  // muito proximo da configuracao de cima, sem cabecalho, ta baguncado
  // jogado") — os dois tipos agora mostram os 3 eixos de movimento E os 3 de
  // rotação, sempre (mesmos botões/rótulos X/Y/Z pros dois tipos, só o que
  // cada eixo FAZ por baixo muda — ver nudgeProjectWallSlot(Rotation)/
  // nudgeProjectFloorSlot(Rotation) acima), dentro de um cartão com
  // cabeçalho próprio e separado visualmente do bloco de medidas acima
  // (.po-proj-config-move no CSS: borda + fundo leve + margem de respiro).
  const isFloor = isFloorSlot(slot);
  const positionRow = !isFloor ? `
    <div class="po-proj-config-row"><span>${I18n.t('project.config_position_label')}</span><span>${I18n.t('project.config_position_value', { x: formatDimension(slot.x_mm, unit), y: formatDimension(slot.floor_height_mm, unit) })}</span></div>
  ` : '';

  // Uma linha [rótulo do eixo] [−] [+] — mesmo layout pros 3 eixos de
  // movimento (data-move) e pros 3 de rotação (data-rotate), só troca o
  // atributo/ícone. `axis` vira o 1º char do data-attr; o handler do clique
  // (abaixo) lê o resto como o sinal do passo (Number("-1")/Number("1")).
  const axisRow = (attr, axis, labelKey, iconMinus, iconPlus) => `
    <div class="po-proj-move-axis-row">
      <span class="po-proj-move-axis-label">${I18n.t(labelKey)}</span>
      <button type="button" class="secondary po-proj-move-btn" data-${attr}="${axis}-1" title="-">${iconMinus}</button>
      <button type="button" class="secondary po-proj-move-btn" data-${attr}="${axis}1" title="+">${iconPlus}</button>
    </div>
  `;
  const moveAxesBlock = axisRow('move', 'x', 'project.move_axis_x', '◀', '▶')
    + axisRow('move', 'y', 'project.move_axis_y', '▼', '▲')
    + axisRow('move', 'z', 'project.move_axis_z', '◀', '▶');
  const rotateAxesBlock = axisRow('rotate', 'x', 'project.move_axis_x', '⟲', '⟳')
    + axisRow('rotate', 'y', 'project.move_axis_y', '⟲', '⟳')
    + axisRow('rotate', 'z', 'project.move_axis_z', '⟲', '⟳');
  // Aviso curto: quais eixos têm colisão de verdade (real, igual arrastar)
  // e quais são só ajuste visual fino (sem checagem nenhuma) — pra não
  // parecer bug quando um eixo "não trava em nada".
  const moveHint = isFloor ? I18n.t('project.move_hint_floor') : I18n.t('project.move_hint_wall');
  const moveBlock = `
    <div class="po-proj-config-move">
      <div class="po-proj-move-section">
        <div class="po-proj-move-section-header">
          <span class="po-proj-config-section-label">${I18n.t('project.move_section_label')}</span>
          <span class="po-proj-move-step-inline">
            <input type="text" inputmode="decimal" class="po-proj-move-step-input" value="${formatDimensionNumber(projectMoveStepMm, unit)}" />
            <span class="po-proj-dim-unit">${unitAbbrev(unit)}</span>
          </span>
        </div>
        <div class="po-proj-move-pad">${moveAxesBlock}</div>
      </div>
      <div class="po-proj-move-section po-proj-move-section-rotate">
        <div class="po-proj-move-section-header">
          <span class="po-proj-config-section-label">${I18n.t('project.move_rotate_section_label')}</span>
          <span class="po-proj-move-step-inline">
            <input type="text" inputmode="decimal" class="po-proj-move-rotate-step-input" value="${projectMoveRotateStepDeg}" />
            <span class="po-proj-dim-unit">°</span>
          </span>
        </div>
        <div class="po-proj-move-pad">${rotateAxesBlock}</div>
      </div>
      <p class="hint po-proj-move-hint">${moveHint}</p>
    </div>
  `;

  // "Posição no ambiente" — ver comentário grande em cima de
  // setProjectSlotPositionFromSide (function declaration) pro porquê de
  // cada eixo/lado. posField gera 1 campo editável com rótulo embaixo;
  // posAxisRow junta os campos de um eixo numa linha só (2 campos nos eixos
  // reais, 1 campo só no Z de parede — fino, sem "parede oposta").
  const posField = (axisKey, side, mm, label) => `
    <span class="po-proj-position-field">
      <input type="text" inputmode="decimal" class="po-proj-position-input" data-pos-axis="${axisKey}" data-pos-side="${side}" value="${formatDimensionNumber(mm, unit)}" />
      <span class="po-proj-dim-unit">${unitAbbrev(unit)}</span>
      <label>${label}</label>
    </span>
  `;
  const posAxisRow = (axisLabel, fieldsHtml) => `
    <div class="po-proj-position-axis">
      <span class="po-proj-position-axis-label">${axisLabel}</span>
      ${fieldsHtml}
    </div>
  `;
  let positionAxesHtml;
  if (isFloor) {
    const fb = projectFloorRoomBoundsMm(slot);
    const xNear = Number(slot.floor_x_mm || 0) - fb.xMin;
    const xFar = fb.xMax - Number(slot.floor_x_mm || 0);
    const zNear = Number(slot.floor_z_mm || 0) - fb.zMin;
    const zFar = fb.zMax - Number(slot.floor_z_mm || 0);
    const maxY = Math.max(Number(roomSettings.ceiling_mm || 0) - Number(roomSettings.baseboard_mm || 0) - Number(slot.height_mm || 0), 0);
    const yNear = Number(slot.fineOffsetYMm || 0);
    positionAxesHtml = posAxisRow('X', posField('x', 'near', xNear, I18n.t('project.position_left_label')) + posField('x', 'far', xFar, I18n.t('project.position_right_label')))
      + posAxisRow('Z', posField('z', 'near', zNear, I18n.t('project.position_front_label')) + posField('z', 'far', zFar, I18n.t('project.position_back_label')))
      + posAxisRow('Y', posField('y', 'near', yNear, I18n.t('project.position_floor_label')) + posField('y', 'far', maxY - yNear, I18n.t('project.position_ceiling_label')));
  } else {
    const xb = projectWallSlotXBoundsMm(slot);
    const xNear = Number(slot.x_mm || 0) - xb.min;
    const xFar = xb.max - Number(slot.x_mm || 0);
    const maxY = projectSlotMaxFloorHeightMm(slot.height_mm, slot.module);
    const yNear = Number(slot.floor_height_mm || 0);
    positionAxesHtml = posAxisRow('X', posField('x', 'near', xNear, I18n.t('project.position_left_label')) + posField('x', 'far', xFar, I18n.t('project.position_right_label')))
      + posAxisRow('Y', posField('y', 'near', yNear, I18n.t('project.position_floor_label')) + posField('y', 'far', maxY - yNear, I18n.t('project.position_ceiling_label')))
      + posAxisRow('Z', posField('z', 'near', Number(slot.fineOffsetZMm || 0), I18n.t('project.position_wall_label')));
  }
  const positionBlock = `
    <div class="po-proj-config-position">
      <span class="po-proj-config-section-label">${I18n.t('project.position_section_label')}</span>
      ${positionAxesHtml}
      <p class="hint po-proj-move-hint">${isFloor ? I18n.t('project.position_hint_floor') : I18n.t('project.position_hint_wall')}</p>
    </div>
  `;

  panel.innerHTML = `
    <h3>${slot.module.name}</h3>
    ${skuBlock}
    <div class="po-proj-config-dims">
      ${dimRow('width', I18n.t('step1.filter_width'))}
      ${dimRow('height', I18n.t('step1.filter_height'))}
      ${dimRow('depth', I18n.t('step1.filter_depth'))}
    </div>
    ${positionRow}
    ${colorSections ? `<div class="po-proj-config-colors"><span class="po-proj-config-section-label">${I18n.t('project.config_color_label')}</span>${colorSections}</div>` : ''}
    ${moveBlock}
    ${positionBlock}
    <div class="po-proj-config-row"><span>${I18n.t('project.config_depth_label')}</span><span>${depthLabel}</span></div>
    <div class="po-proj-config-row"><span>${I18n.t('project.config_price_label')}</span><span>${formatMoney((slot.result && slot.result.total) || 0)}</span></div>
    <div class="po-proj-config-row hint"><span>${I18n.t('volume_weight.label')}</span><span>${formatVolumeWeight((slot.result && slot.result.breakdown) || [])}</span></div>
    <button type="button" class="secondary" id="po-proj-config-edit-btn">${I18n.t('project.config_edit_btn')}</button>
    <button type="button" class="secondary" id="po-proj-config-duplicate-btn" title="${I18n.t('project.duplicate_title')}">${I18n.t('project.duplicate_btn')}</button>
    <button type="button" class="secondary po-proj-config-remove-btn" id="po-proj-config-remove-btn">${I18n.t('project.config_remove_btn')}</button>
  `;

  panel.querySelectorAll('.po-proj-dim-input').forEach((input) => {
    input.addEventListener('change', () => {
      const unit2 = (document.getElementById('po-unit-select') || {}).value || 'mm';
      const mm = parseDimensionInput(input.value, unit2);
      if (mm !== null && !isNaN(mm)) updateProjectSlotDimension(slot, input.dataset.axis, mm);
      else renderProjectConfigPanel();
    });
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } });
  });
  // "Posição no ambiente" — mesmo padrão de change/Enter dos campos de
  // medida acima, só que manda pra setProjectSlotPositionFromSide (o "lado"
  // vem do data-pos-side, near/far).
  panel.querySelectorAll('.po-proj-position-input').forEach((input) => {
    input.addEventListener('change', () => {
      const unit2 = (document.getElementById('po-unit-select') || {}).value || 'mm';
      const mm = parseDimensionInput(input.value, unit2);
      if (mm !== null && !isNaN(mm)) setProjectSlotPositionFromSide(slot, input.dataset.posAxis, input.dataset.posSide, mm);
      else renderProjectConfigPanel();
    });
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } });
  });
  // Dropdown de SKU (eixo travado com preset cadastrado, ver dimRow acima) —
  // escolher já aplica direto, mesmo caminho de sempre (updateProjectSlotDimension
  // já sabe travar no preset mais próximo, aqui o valor já É um preset exato).
  panel.querySelectorAll('.po-proj-dim-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      const mm = Number(sel.value);
      if (!isNaN(mm)) updateProjectSlotDimension(slot, sel.dataset.axis, mm);
    });
  });
  const skuSelectEl = panel.querySelector('.po-proj-config-sku-select');
  if (skuSelectEl) {
    skuSelectEl.addEventListener('change', () => {
      const reference = skuSelectEl.value;
      if (!reference) return;
      const sku = skuOptions.find((s) => s.reference === reference);
      applyProjectSlotSku(slot, sku);
      // updateProjectSlotDimension (chamada dentro de applyProjectSlotSku) só
      // redesenha a CENA — os campos de Largura/Altura e o preço estimado
      // aqui no painel ficariam com o valor velho até o usuário clicar em
      // outra coisa. Reconstrói o painel inteiro pra refletir a medida nova
      // (e a própria opção de SKU escolhida) na hora.
      renderProjectConfigPanel();
    });
  }
  panel.querySelectorAll('.po-proj-color-swatch').forEach((el) => {
    el.addEventListener('click', () => {
      const roleId = el.dataset.roleId;
      const opts = (slot.colorOptionsByRole && slot.colorOptionsByRole[roleId]) || [];
      const color = opts.find((c) => String(c.id) === el.dataset.colorId);
      if (color) updateProjectSlotColor(slot, roleId, color);
    });
  });

  // "Movimentação fina" — campo de passo (mesma conversão de unidade dos
  // campos de medida acima, ver dimRow) + setas, ver moveBlock e
  // nudgeProjectWallSlot/nudgeProjectFloorSlot/nudgeProjectFloorSlotRotation.
  const moveStepInputEl = panel.querySelector('.po-proj-move-step-input');
  if (moveStepInputEl) {
    moveStepInputEl.addEventListener('change', () => {
      const unit2 = (document.getElementById('po-unit-select') || {}).value || 'mm';
      const mm = parseDimensionInput(moveStepInputEl.value, unit2);
      if (mm !== null && !isNaN(mm) && mm > 0) projectMoveStepMm = mm;
      moveStepInputEl.value = formatDimensionNumber(projectMoveStepMm, unit2);
    });
    moveStepInputEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); moveStepInputEl.blur(); } });
  }
  panel.querySelectorAll('.po-proj-move-btn[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      // data-move: eixo + sinal grudados (ex: "x-1", "y1") — 1º char é o
      // eixo, o resto (incl. sinal) é Number() direto.
      const axis = btn.dataset.move[0];
      const deltaMm = Number(btn.dataset.move.slice(1)) * projectMoveStepMm;
      if (isFloor) nudgeProjectFloorSlot(slot, axis, deltaMm);
      else nudgeProjectWallSlot(slot, axis, deltaMm);
    });
  });
  const rotateStepInputEl = panel.querySelector('.po-proj-move-rotate-step-input');
  if (rotateStepInputEl) {
    rotateStepInputEl.addEventListener('change', () => {
      const deg = parseFloat(String(rotateStepInputEl.value).replace(',', '.'));
      if (!isNaN(deg) && deg > 0) projectMoveRotateStepDeg = deg;
      rotateStepInputEl.value = String(projectMoveRotateStepDeg);
    });
    rotateStepInputEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); rotateStepInputEl.blur(); } });
  }
  panel.querySelectorAll('.po-proj-move-btn[data-rotate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Mesma convenção do data-move: 1º char = eixo, resto = sinal do passo.
      const axis = btn.dataset.rotate[0];
      const deltaDeg = Number(btn.dataset.rotate.slice(1)) * projectMoveRotateStepDeg;
      if (isFloor) nudgeProjectFloorSlotRotation(slot, axis, deltaDeg);
      else nudgeProjectWallSlotRotation(slot, axis, deltaDeg);
    });
  });

  const editBtn = panel.querySelector('#po-proj-config-edit-btn');
  if (editBtn) editBtn.addEventListener('click', () => editProjectSlot(slot.id));
  // Duplicar também aqui (além dos botões flutuantes na cena 3D) — é o caminho
  // que funciona no desktop e na vista Frontal 2D de parede única, onde não
  // existe cena 3D pra pendurar botão nenhum.
  const dupBtn = panel.querySelector('#po-proj-config-duplicate-btn');
  if (dupBtn) dupBtn.addEventListener('click', () => duplicateProjectSlot(slot.id));
  const removeBtn = panel.querySelector('#po-proj-config-remove-btn');
  if (removeBtn) removeBtn.addEventListener('click', () => removeProjectSlot(slot.id));
}

// Quantas PEÇAS de verdade um módulo tem, descendo a árvore inteira — peça
// que é módulo aninhado (is_module) não conta como peça, conta o que tem
// dentro dela (mesma travessia de treeHasHinge/treeHasSlide, com child_pieces
// como filho). É o número que responde "quantos itens esse projeto tem" pra
// quem vai fabricar, e não "quantas linhas o catálogo mostra".
function countProjectPiecesDeep(pieces) {
  return (pieces || []).reduce((n, p) => (
    p.is_module ? n + countProjectPiecesDeep(p.child_pieces) : n + 1
  ), 0);
}

// Cartão "Resumo do projeto" (2026-08-08, etapa 3 do redesenho) — os números
// que ficam colados no canvas enquanto o cliente monta o ambiente. Substitui
// as duas linhas soltas (total e volume/peso) que viviam abaixo das 3 colunas,
// longe demais do desenho pra alguém acompanhar o preço subindo.
function renderProjectSummary() {
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const total = projectSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
  const items = projectSlots.reduce((sum, slot) => sum + countProjectPiecesDeep(projectSlotEffectivePieces(slot)), 0);
  // Acabamentos = cores DISTINTAS usadas no projeto inteiro (por id, não por
  // papel de cor: a mesma cor em caixa e porta é UM acabamento a comprar).
  const finishIds = new Set();
  projectSlots.forEach((slot) => {
    Object.values(slot.colorsByRole || {}).forEach((c) => { if (c && c.id) finishIds.add(c.id); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.values(perRole || {}).forEach((e) => { if (e && e.color_id) finishIds.add(e.color_id); });
    });
  });

  setText('po-proj-sum-modules', String(projectSlots.length));
  setText('po-proj-sum-items', String(items));
  setText('po-proj-sum-finishes', String(finishIds.size));
  setText('po-proj-total', formatMoney(total));
  // Volume/peso somado — migration 061. Cada slot é 1 unidade (Projetos não
  // tem conceito de quantidade), então soma direta dos breakdowns.
  setText('po-proj-volume-weight', projectSlots.length > 0
    ? formatVolumeWeightFromM3(projectSlots.reduce((sum, slot) => sum + itemVolumeM3((slot.result && slot.result.breakdown) || []), 0))
    : '—');

  // Empty state só enquanto o ambiente está vazio — com módulo, o resumo
  // ocupa a linha inteira (ver .po-proj-bottom no CSS).
  const emptyCard = document.getElementById('po-proj-empty-hint');
  if (emptyCard) emptyCard.style.display = projectSlots.length ? 'none' : '';

  // Lista detalhada — só redesenha se estiver aberta (é a única parte cara).
  if (projectDetailsOpen) renderProjectSummaryDetails();
}

// Compatibilidade: renderProjectTotal continua existindo com o nome antigo
// porque é chamada de vários pontos (troca de cor, medida, add/remove...).
function renderProjectTotal() {
  renderProjectSummary();
}

// Lista "Ver detalhes do projeto" — um resumo por módulo (nome, parede/chão,
// medidas e preço). Fechada por padrão pra não empurrar o canvas pra cima.
let projectDetailsOpen = false;

function renderProjectSummaryDetails() {
  const box = document.getElementById('po-proj-summary-details');
  if (!box) return;
  if (!projectSlots.length) {
    box.innerHTML = `<p class="hint">${I18n.t('project.summary_empty_details')}</p>`;
    return;
  }
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const roles = getProjectWallRoles();
  box.innerHTML = projectSlots.map((slot) => {
    const where = isFloorSlot(slot)
      ? I18n.t('project.floor_island_label')
      : projectWallRoleLabel(roles[Number(slot.wall_index || 0)], Number(slot.wall_index || 0));
    const dims = `${formatDimension(slot.width_mm, unit)} × ${formatDimension(slot.height_mm, unit)} × ${formatDimension(slot.depth_mm, unit)}`;
    return `
      <div class="po-proj-summary-detail-row" data-slot-id="${slot.id}">
        <span class="po-proj-summary-detail-name">${slot.module.name}</span>
        <span class="po-proj-summary-detail-meta">${where} · ${dims}</span>
        <span class="po-proj-summary-detail-price">${formatMoney((slot.result && slot.result.total) || 0)}</span>
      </div>
    `;
  }).join('');
  // Clicar numa linha seleciona o módulo no ambiente — é o que torna a lista
  // útil de verdade num projeto grande, em vez de só informativa.
  box.querySelectorAll('.po-proj-summary-detail-row').forEach((row) => {
    row.addEventListener('click', () => selectProjectSlot(row.dataset.slotId));
  });
}

const projDetailsBtn = document.getElementById('po-proj-details-btn');
if (projDetailsBtn) {
  projDetailsBtn.addEventListener('click', () => {
    projectDetailsOpen = !projectDetailsOpen;
    const box = document.getElementById('po-proj-summary-details');
    if (box) box.style.display = projectDetailsOpen ? 'block' : 'none';
    projDetailsBtn.setAttribute('aria-expanded', projectDetailsOpen ? 'true' : 'false');
    projDetailsBtn.textContent = I18n.t(projectDetailsOpen
      ? 'project.summary_details_hide_btn'
      : 'project.summary_details_btn');
    if (projectDetailsOpen) renderProjectSummaryDetails();
  });
}

// Desenha o canvas inteiro do zero a cada chamada (mesma filosofia de
// renderCompositionSlots — mais simples e seguro que reconciliar DOM
// incremental pra uma Fase 1). Só o arraste em si atualiza style.left/bottom
// direto no elemento SEM re-render completo (ver attachProjectSlotDrag),
// por performance — o re-render completo só acontece quando o arraste
// TERMINA (pointerup) ou quando algo fora do canvas muda (unidade, largura
// do ambiente, adicionar/editar/remover módulo).
function renderProjectCanvas() {
  const canvas = document.getElementById('po-proj-canvas');
  const wrap = document.querySelector('#po-tab-projects .po-proj-canvas-wrap');
  const dimsLabel = document.getElementById('po-proj-canvas-dims-label');
  const topViewHint = document.getElementById('po-proj-top-view-hint');
  if (!canvas || !wrap) return;

  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  projectSlots.forEach((slot) => {
    clampProjectSlotPosition(slot);
    // z_order sempre 0 — a regra de "afastar da parede quando sobrepõe" foi
    // desligada (ver resolveProjectSlotDepth). Zerar aqui, e não só no
    // resolve, é o que faz um projeto ANTIGO (salvo com módulos em camadas)
    // já ABRIR com tudo encostado na parede, sem precisar mexer em cada um.
    slot.z_order = 0;
  });

  if (projectViewMode === 'top') {
    renderProjectCanvasTop(canvas, wrap, dimsLabel, unit);
  } else {
    // VISTA FRONTAL 2D APOSENTADA (2026-08-18, pedido do Matt: "acabei de
    // abrir e entra naquela parede visao frontal. eliminamos essa pra deixar
    // a visao 3d direto"). Antes: 1 parede -> canvas 2D plano
    // (renderProjectCanvasFront); 2+ paredes -> cena 3D. Agora QUALQUER
    // projeto abre direto na cena 3D — o desenho plano deixou de ser o
    // primeiro contato com o projeto.
    //
    // renderProjectCanvasFront continua no arquivo, intacta e sem chamador
    // (mesmo padrao das telas congeladas por display:none): se um dia o 2D
    // precisar voltar, basta reativar o ramo `getProjectWallCount() <= 1`
    // aqui. Nada mais depende dela — projectPxPerMm so e lido pelo drop no
    // canvas plano, que agora nunca esta visivel (ver dropProjectModuleAt,
    // que testa offsetParent antes de usar), e a Vista Superior tem escala
    // propria.
    renderProjectCanvasFrontCorner(canvas, wrap, dimsLabel, unit);
  }
  if (topViewHint) topViewHint.style.display = projectViewMode === 'top' ? 'block' : 'none';
  renderProjectMiniTopView();
  // Depois das vistas: o que a barra flutuante mostra depende de QUAL vista
  // acabou de ser desenhada (a de câmera só existe na 3D).
  refreshProjectCanvasHud();

  // (O empty state deixou de ser controlado aqui em 2026-08-08, etapa 3:
  // virou um CARTÃO no rodapé do canvas e quem o mostra/esconde é
  // renderProjectSummary, chamada logo abaixo via renderProjectTotal. A regra
  // também mudou de propósito: antes sumia quando a PAREDE ATIVA tinha
  // módulo, o que fazia o convite "arraste um módulo" reaparecer só por
  // trocar pra uma parede ainda vazia de um projeto cheio. Agora ele só
  // aparece com o projeto INTEIRO vazio, que é quando o convite faz sentido.)

  const genBtn = document.getElementById('po-proj-generate-btn');
  const genHint = document.getElementById('po-proj-generate-hint');
  if (genBtn) genBtn.disabled = projectSlots.length < 1;
  if (genHint) genHint.style.display = projectSlots.length < 1 ? 'block' : 'none';
  // Foto realista segue a mesma regra do Visualizar 3D (>=1 módulo).
  const photoBtn = document.getElementById('po-proj-photoreal-btn');
  if (photoBtn) photoBtn.disabled = projectSlots.length < 1;

  // Mesmo comportamento de auto-regeneração da Composição (ver comp3dWrap em
  // renderCompositionSlots): se o 3D já estava aberto e o cliente mexeu no
  // canvas 2D (moveu/redimensionou/adicionou/removeu/trocou cor), regera
  // sozinho em vez de deixar a cena velha na tela.
  const proj3dWrap = document.getElementById('po-proj-3d-wrap');
  if (proj3dWrap && proj3dWrap.style.display !== 'none') {
    if (projectSlots.length >= 1) {
      generateProject3D();
    } else {
      proj3dWrap.style.display = 'none';
    }
  }

  renderProjectTotal();
  renderProjectConfigPanel();
}

// Pra cada aresta (esquerda/direita) do canvas da parede ATIVA, diz qual
// parede VIZINHA faz esquina ali (se existir) — pedido do usuário
// (2026-07-26, depois do painel mini de Vista Superior): "quero enxergar nem
// que seja so tracado, os modulos encostando nessa parede, mas que estao na
// parede do lado". Convenção de cantos (mesma de getProjectWallGeometry/
// computeProjectWallTopViewPlacements): 'left'.x=0 é a MESMA esquina que
// 'main'.x=0; 'main'.x=mainWidthMm é a mesma esquina que 'right'.x=0.
// 'left'/'right' só têm essa UMA esquina (a outra ponta é livre/aberta, sem
// parede). `neighborCornerAtZero` diz se, NA PAREDE VIZINHA, a esquina em
// questão fica no x=0 dela (true) ou no x=largura dela (false) — precisa
// pra medir a distância até a esquina a partir da ponta certa.
function getProjectAdjacentWallEdgeInfo(activeWallIndex) {
  const roles = getProjectWallRoles();
  const role = roles[activeWallIndex];
  const info = { left: null, right: null };
  if (role === 'main') {
    const leftIdx = roles.indexOf('left');
    if (leftIdx >= 0) info.left = { wallIndex: leftIdx, neighborCornerAtZero: true };
    const rightIdx = roles.indexOf('right');
    if (rightIdx >= 0) info.right = { wallIndex: rightIdx, neighborCornerAtZero: true };
  } else {
    // 'left' ou 'right': a única esquina que têm é com 'main', e ela sempre
    // cai na PRÓPRIA borda esquerda (x=0) — a borda direita é ponta aberta.
    const mainIdx = roles.indexOf('main');
    if (mainIdx >= 0) {
      info.left = {
        wallIndex: mainIdx,
        // Do lado da 'main': a esquina com 'left' fica no x=0 dela; a
        // esquina com 'right' fica na ponta OPOSTA (x=mainWidthMm).
        neighborCornerAtZero: role === 'left'
      };
    }
  }
  return info;
}

// Módulos da parede vizinha, com a distância de cada um até a esquina
// compartilhada — usado só pra desenhar o traçado fantasma perto da borda,
// não a peça de verdade (ela pertence a outro plano/parede).
// CORRIGIDO (2026-07-26, usuário: "tem um tracado bem maior do que a area
// real do modulo que esta aparecendo"): a largura do retângulo fantasma na
// TELA usava width_mm do módulo vizinho — errado, porque width_mm dele é a
// medida AO LONGO da parede vizinha (o eixo que fica "pra dentro da tela",
// invisível nesta vista), não o eixo que aparece na TELA da parede ativa.
// O eixo que realmente aparece (perpendicular à parede vizinha, na mesma
// direção do eixo horizontal da parede ATIVA — o canto é sempre 90°) é a
// PROFUNDIDADE (depth_mm) — o quanto o módulo realmente "invade"/aparece
// saliente perto do canto. x_mm (posição ao longo da parede vizinha)
// continua servindo só pro FILTRO de proximidade da esquina (maxGhostMm) e
// pra espalhar visualmente vários módulos próximos do canto (senão todos
// ficariam empilhados exatamente na borda) — não representa tamanho.
function projectAdjacentGhostSlots(neighborWallIndex, neighborCornerAtZero) {
  const neighborWidthMm = getProjectWallWidthMm(neighborWallIndex);
  return projectSlotsOnWall(neighborWallIndex).map((slot) => {
    const widthMm = Number(slot.width_mm || 0);
    const depthMm = Number(slot.depth_mm || 0);
    const x0 = Number(slot.x_mm || 0);
    const distFromCornerMm = neighborCornerAtZero ? x0 : Math.max(neighborWidthMm - x0 - widthMm, 0);
    return { slot, distFromCornerMm: Math.max(distFromCornerMm, 0), extentMm: depthMm };
  });
}

// Só desenha/usa como imã o traçado fantasma perto o bastante da esquina —
// módulo no meio da parede vizinha já aparece no painel mini (ver
// renderProjectMiniTopView), aqui o objetivo é só "o que está encostando
// nesta parede". Função própria porque tanto o desenho (renderProjectCanvasFront)
// quanto o imã (projectGhostSnapTargets, pedido do usuário 2026-07-26: "
// consigo usar a referencia do tracado pra alinhamento tipo ima pros modulos
// da parede") precisam do MESMO corte, senão o cliente veria o imã puxar
// pra um traçado que nem aparece na tela.
function projectGhostMaxDistMm(wallWidthMm) {
  return clamp(wallWidthMm * 0.35, 400, 1200);
}

// Traçado fantasma (ver projectAdjacentGhostSlots) traduzido em pseudo-slots
// — só os 4 campos que snapProjectSlotAxis/snapProjectEdge leem (x_mm/
// width_mm/floor_height_mm/height_mm) — na MESMA coordenada de tela da
// parede ATIVA (distFromCornerMm/extentMm, igual ao que
// renderProjectCanvasFront desenha). Concatenado em `others` no
// arrastar/esticar (ver attachProjectSlotDrag/pointermove) pra o imã também
// puxar alinhamento com o traçado, não só com módulos de VERDADE desta
// parede. Altura/base (floor_height_mm/height_mm) já são exatas de verdade
// (mesmo chão/teto em qualquer parede) — só x_mm/width_mm são a posição
// "desdobrada" da parede vizinha, mesma aproximação do traçado visual.
function projectGhostSnapTargets(activeWallIndex) {
  const wallWidthMm = getProjectWallWidthMm(activeWallIndex);
  const maxGhostMm = projectGhostMaxDistMm(wallWidthMm);
  const edgeInfo = getProjectAdjacentWallEdgeInfo(activeWallIndex);
  const targets = [];
  ['left', 'right'].forEach((edge) => {
    const info = edgeInfo[edge];
    if (!info) return;
    projectAdjacentGhostSlots(info.wallIndex, info.neighborCornerAtZero).forEach(({ slot, distFromCornerMm, extentMm }) => {
      if (distFromCornerMm > maxGhostMm) return;
      const x_mm = edge === 'left' ? distFromCornerMm : Math.max(wallWidthMm - distFromCornerMm - extentMm, 0);
      targets.push({
        x_mm,
        width_mm: extentMm,
        floor_height_mm: Number(slot.floor_height_mm || 0),
        height_mm: Number(slot.height_mm || 0)
      });
    });
  });
  return targets;
}

// ---------- Vista Frontal (padrão, arrastável) ----------

// Extraído de renderProjectCanvasFront (2026-07-26, pra viabilizar a "visão
// de canto" abaixo — renderProjectCanvasFrontCorner) — monta o conteúdo de
// UMA parede (rodapé/teto/módulos, com ou sem interação) dentro de um
// elemento DOM (`paneEl`) já posicionado/dimensionado pelo chamador. Recebe
// `pxPerMm` de fora (em vez de calcular sozinho) porque a visão de canto
// precisa que TODAS as paredes desenhadas usem a MESMA escala física (senão
// os módulos ficariam com proporção errada entre uma parede e outra) —
// `interactive=true` é usado só pra parede ATIVA (a única com handles de
// arrastar/esticar reais, ver attachProjectSlotDrag/attachProjectSlotResizeHandle/
// attachProjectWallResizeHandle — todos leem projectPxPerMm/projectActiveWallIndex
// globais, então continuam funcionando iguais não importa a parede estar
// dentro de um pane rotacionado(CSS) ou não, DESDE QUE só a parede sem
// rotação (`interactive=true`) receba esses handles).
function buildProjectWallPaneDom(paneEl, wallIndex, wallWidthMm, ceilingMm, unit, pxPerMm, interactive) {
  paneEl.innerHTML = '';
  paneEl.classList.toggle('po-proj-corner-pane-readonly', !interactive);

  const baseboard = document.createElement('div');
  baseboard.className = 'po-proj-canvas-baseboard';
  baseboard.style.height = Math.round(roomSettings.baseboard_mm * pxPerMm) + 'px';
  paneEl.appendChild(baseboard);
  const ceilingLine = document.createElement('div');
  ceilingLine.className = 'po-proj-canvas-ceiling-line';
  paneEl.appendChild(ceilingLine);

  if (interactive) {
    const resizeTitle = I18n.t('project.wall_resize_title');
    const resizeLeft = document.createElement('div');
    resizeLeft.className = 'po-proj-wall-resize-handle po-proj-wall-resize-left';
    resizeLeft.title = resizeTitle;
    paneEl.appendChild(resizeLeft);
    attachProjectWallResizeHandle(resizeLeft, false);

    const resizeRight = document.createElement('div');
    resizeRight.className = 'po-proj-wall-resize-handle po-proj-wall-resize-right';
    resizeRight.title = resizeTitle;
    paneEl.appendChild(resizeRight);
    attachProjectWallResizeHandle(resizeRight, true);

    // Clicar na PAREDE (área vazia do canvas, fora de qualquer módulo)
    // desseleciona — pedido do usuário (2026-07-26, já implementado na vista
    // 3D de canto via attachProject3DEditDrag) que faltava aqui na vista
    // plana de 1 parede só (a mais comum): o painel à direita ficava preso
    // no ÚLTIMO módulo clicado pra sempre, sem jeito de "soltar" e abrir o
    // troca-rápida-de-cor em massa (ver renderProjectConfigPanel).
    //
    // BUG CORRIGIDO (2026-08-01, relato do usuário: "quando eu clico em um
    // modulo e ele fica selecionado, ao trocar a cor, esta trocando todos"):
    // o comentário original assumia que preventDefault() no pointerdown do
    // módulo (attachProjectSlotDrag) suprimia o 'click' sintético que
    // borbulharia até aqui — falso pra ponteiro tipo MOUSE (só afeta os
    // eventos de mouse "de compatibilidade" de um ponteiro TOUCH, não um
    // clique de mouse de verdade). Resultado: clicar num módulo disparava
    // selectProjectSlot() (seleciona certo, painel vira o editor daquele
    // módulo) e LOGO EM SEGUIDA o 'click' nativo do mesmo clique borbulhava
    // até aqui e desselecionava de novo — o usuário via o painel em massa,
    // então qualquer cor escolhida ali trocava TODOS os módulos. Fix: só
    // desseleciona se o alvo do clique não for um módulo nem uma das
    // setinhas de esticar (que ficam FORA de .po-proj-slot, direto em
    // paneEl) — clique de verdade em módulo/setinha nunca deve chegar aqui.
    // GUARD (dataset flag, mesmo padrão de attachProject3DEditDrag/
    // legnoDragAttached): paneEl É O MESMO NÓ #po-proj-canvas reaproveitado
    // em TODO re-render (só o innerHTML é limpo, não os listeners do próprio
    // paneEl) — sem isso, cada render (arrastar, trocar unidade, trocar cor,
    // add/remove módulo...) empilharia mais um listener idêntico pra sempre.
    if (paneEl.dataset.legnoWallClickAttached !== '1') {
      paneEl.dataset.legnoWallClickAttached = '1';
      paneEl.addEventListener('click', (ev) => {
        if (ev.target.closest('.po-proj-slot, .po-proj-wall-resize-handle')) return;
        // Clicar na parede desseleciona nas DUAS vistas (2026-08-12). Passou a
        // usar deselectProjectSlot pra não esquecer as setas/botões flutuantes
        // do 3D, que esta cópia deixava acesos.
        deselectProjectSlot();
      });
    }
  }

  const wallSlots = projectSlotsOnWall(wallIndex);

  // Desenha da camada mais no fundo (z_order menor) pra mais na frente —
  // garante que o z-index visual (setado abaixo) e a ordem de pintura no
  // DOM concordem. Só os módulos DESTA parede (wallSlots).
  wallSlots
    .slice()
    .sort((a, b) => Number(a.z_order || 0) - Number(b.z_order || 0))
    .forEach((slot) => {
      const div = document.createElement('div');
      div.className = 'po-proj-slot' + (slot.id === selectedProjectSlotId ? ' selected' : '') + (interactive ? '' : ' po-proj-slot-readonly');
      div.dataset.slotId = slot.id;
      div.dataset.zOrder = String(Math.min(Number(slot.z_order || 0), 3));
      div.style.left = Math.round(Number(slot.x_mm || 0) * pxPerMm) + 'px';
      div.style.bottom = Math.round(Number(slot.floor_height_mm || 0) * pxPerMm) + 'px';
      div.style.width = Math.round(Number(slot.width_mm || 0) * pxPerMm) + 'px';
      div.style.height = Math.round(Number(slot.height_mm || 0) * pxPerMm) + 'px';
      div.style.zIndex = String(10 + Number(slot.z_order || 0));
      // Cor sólida continua de FUNDO (cobre qualquer vão que a vista
      // frontal 2D não desenhe — ver projectSlotElevationHtml) — só deixou
      // de ser a ÚNICA coisa visível: as peças de verdade (portas/gavetas/
      // prateleiras/laterais) desenham por cima, com a cor de cada uma.
      div.style.background = projectSlotColorSwatch(slot);
      div.title = slot.module.name;
      div.innerHTML = `
        <div class="po-proj-slot-elevation">${projectSlotElevationHtml(slot, Number(slot.width_mm || 0), Number(slot.height_mm || 0))}</div>
        <div class="po-proj-slot-label">
          <div class="po-proj-slot-name">${slot.module.name}</div>
          <div class="po-proj-slot-dims">${formatDimension(slot.width_mm, unit)} x ${formatDimension(slot.height_mm, unit)}</div>
        </div>
      `;

      if (interactive) {
        attachProjectSlotDrag(div, slot);

        // Setinhas de esticar (pedido do usuário: "os módulos estão sem a
        // setinha... quero que eles estiquem da mesma forma" que a parede) —
        // tiras finas nas bordas esquerda/direita (largura) e topo (altura),
        // sem círculo (pedido explícito). stopPropagation no pointerdown (ver
        // attachProjectSlotResizeHandle) evita disparar o drag de MOVER junto.
        // Pedido do usuário (2026-07-23): "tenho paineis com altura fixa em
        // 19mm, minimo e maximo iguais — a seta só deve aparecer nos sentidos
        // que tem minimo e maximo DIFERENTES" — módulo travado nesse eixo
        // (ex: painel só existe numa espessura) não ganha handle nenhum ali,
        // já que arrastar não faria nada mesmo (updateProjectSlotDimension
        // clampa pro mesmo valor).
        // Pedido do usuário (2026-07-24): módulo com "Valores sugeridos de
        // medida" TRAVADO (width_locked/height_locked — cliente só escolhe
        // entre os valores cadastrados, sem régua livre, ver admin) não podia
        // ganhar a setinha de esticar: arrastaria livremente pra QUALQUER valor
        // entre min/max, ignorando a lista de presets — furando a mesma trava
        // que o configurador de tela cheia respeita (setupDimensionPresetsUI
        // mostra dropdown em vez de régua livre).
        // Pedido do usuário (2026-07-26): "esse modulo tem so medidas travadas
        // na largura, mas quero usar o mesmo sistema de arrastar com as flechas
        // so com as medidas fixas" — em vez de esconder a seta, ela continua
        // aparecendo quando travado E existem 2+ valores cadastrados
        // (slot.widthPresetsMm/heightPresetsMm, ver insertProjectModuleDefault/
        // restoreFavoriteProject/po-add-item-btn), só que arrastar PULA direto
        // pro preset cadastrado mais próximo (Pricing.pickNearestPreset, ver
        // updateProjectSlotDimension/updateProjectSlotWidthFromLeft) em vez de
        // aceitar qualquer valor contínuo. Só 1 preset (ou nenhum) não tem pra
        // onde ir — aí sim some a seta, igual antes.
        const widthPresetsMm = slot.widthPresetsMm || [];
        const heightPresetsMm = slot.heightPresetsMm || [];
        const widthResizable = slot.module.width_locked
          ? widthPresetsMm.length > 1
          : Number(slot.module.width_min_mm) !== Number(slot.module.width_max_mm);
        const heightResizable = slot.module.height_locked
          ? heightPresetsMm.length > 1
          : Number(slot.module.height_min_mm) !== Number(slot.module.height_max_mm);

        if (widthResizable) {
          const resizeW1 = document.createElement('div');
          resizeW1.className = 'po-proj-slot-resize po-proj-slot-resize-left';
          resizeW1.title = I18n.t('project.module_resize_width_title');
          div.appendChild(resizeW1);
          attachProjectSlotResizeHandle(resizeW1, slot, 'width-left');

          const resizeW2 = document.createElement('div');
          resizeW2.className = 'po-proj-slot-resize po-proj-slot-resize-right';
          resizeW2.title = I18n.t('project.module_resize_width_title');
          div.appendChild(resizeW2);
          attachProjectSlotResizeHandle(resizeW2, slot, 'width-right');
        }

        if (heightResizable) {
          const resizeH = document.createElement('div');
          resizeH.className = 'po-proj-slot-resize po-proj-slot-resize-top';
          resizeH.title = I18n.t('project.module_resize_height_title');
          div.appendChild(resizeH);
          attachProjectSlotResizeHandle(resizeH, slot, 'height-top');
        }
      } else {
        // Parede vizinha (dobrada na visão de canto, ou fantasma na vista de
        // 1 parede) — só troca a parede ativa + seleciona o módulo ao
        // clicar, mesmo comportamento que o traçado fantasma antigo já tinha
        // (ver projectAdjacentGhostSlots) — não arrasta/redimensiona aqui.
        div.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setProjectActiveWallIndex(wallIndex);
          selectProjectSlot(slot.id);
        });
      }

      paneEl.appendChild(div);
    });
}

function renderProjectCanvasFront(canvas, wrap, dimsLabel, unit) {
  // Só a parede ATIVA aparece/é editável aqui — usado quando o projeto só
  // tem 1 parede (forma 'single'). Com mais de 1 parede, renderProjectCanvas
  // chama renderProjectCanvasFrontCorner em vez desta função (pedido do
  // usuário 2026-07-26: "ta dificil de projetar quando tem mais de uma
  // parede" — ver comentário no dispatcher).
  const wallWidthMm = getProjectWallWidthMm(projectActiveWallIndex);
  const ceilingMm = roomSettings.ceiling_mm;

  // Escala: pedido do usuário (2ª rodada) — "não estou conseguindo deixar a
  // parede na minha tela... pode diminuir os espaços em cima e encurtar na
  // altura essa parede". Antes só considerava a LARGURA disponível do wrap
  // — um pé direito alto (ex. 108") não cabia na tela e forçava rolagem.
  // Agora usa o MENOR entre a escala que cabe na largura E a que cabe na
  // ALTURA sobrando da viewport (do topo do wrap até o fim da janela, com
  // uma margem pra não colar no rodapé do navegador) — a parede inteira
  // (chão até o teto) sempre cabe sem rolar, e a largura respeita o espaço
  // lateral disponível também.
  // Pedido do usuário (3ª rodada): "isso ficou pequeno demais... deixa a
  // parede mais larga do que a altura. e aumenta todo visualizador" — o
  // orçamento de altura da 1ª correção (só 90px de margem) estava dominando
  // a conta e encolhendo tudo pra caber um pé-direito alto. Agora a margem é
  // bem menor (rótulo do topo também encolheu, ver .po-proj-canvas-scale-label)
  // e o piso de altura disponível é bem mais generoso — na prática a LARGURA
  // volta a ser quase sempre quem manda na escala (canvas fica mais largo
  // que alto, maior), e só em pé-direito MUITO alto a altura ainda limita
  // (com scroll vertical no wrap como saída, ver overflow:auto no CSS).
  const availableWidthPx = Math.max(wrap.clientWidth - 4, 320);
  const wrapTop = wrap.getBoundingClientRect().top;
  const availableHeightPx = Math.max(window.innerHeight - wrapTop - 40, 480);
  const widthScale = availableWidthPx / wallWidthMm;
  const heightScale = availableHeightPx / ceilingMm;
  projectPxPerMm = clamp(Math.min(widthScale, heightScale), 0.015, 0.8);

  canvas.style.width = Math.round(wallWidthMm * projectPxPerMm) + 'px';
  canvas.style.height = Math.round(ceilingMm * projectPxPerMm) + 'px';
  canvas.classList.remove('po-proj-canvas-top-mode');
  // Garante que a Vista de Canto 3D (só usada com >1 parede, ver
  // renderProjectCanvasFrontCorner) fique escondida — esta função só roda
  // pra forma 'single', mas o cliente pode ter estado na 3D antes de trocar
  // a forma da parede de volta pra 'single'.
  canvas.style.display = '';
  const edit3dWrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  if (edit3dWrap) edit3dWrap.style.display = 'none';

  if (dimsLabel) dimsLabel.textContent = `${formatDimension(wallWidthMm, unit)} x ${formatDimension(ceilingMm, unit)}`;

  buildProjectWallPaneDom(canvas, projectActiveWallIndex, wallWidthMm, ceilingMm, unit, projectPxPerMm, true);

  // Traçado fantasma dos módulos da(s) parede(s) VIZINHA(S) perto da esquina
  // (pedido do usuário 2026-07-26, depois do painel mini de Vista Superior:
  // "quero enxergar nem que seja so tracado, os modulos encostando nessa
  // parede, mas que estao na parede do lado"). Usa a MESMA escala real
  // (projectPxPerMm) da parede ativa: como o canto é sempre 90° (ver
  // getProjectWallGeometry), a distância de um módulo até a esquina NA
  // parede vizinha é fisicamente a mesma grandeza que "distância a partir da
  // borda" na parede ativa — não é uma aproximação de escala, só não
  // desenha a peça de verdade (é um retângulo tracejado) porque a peça
  // pertence a outro plano. Só perto da esquina (maxGhostMm) — módulos no
  // meio da parede vizinha já aparecem no painel mini, aqui o objetivo é só
  // "o que está encostando nesta parede".
  // OBS: na prática, com wallCount>1 esta função nem é mais chamada (ver
  // renderProjectCanvasFrontCorner, que mostra a parede vizinha de VERDADE
  // em vez de um traçado) — este bloco só continua ativo/relevante pra forma
  // 'single' (onde getProjectAdjacentWallEdgeInfo sempre retorna {left:null,
  // right:null} e o loop abaixo não desenha nada). Mantido por segurança/
  // robustez, sem custo real.
  const edgeInfo = getProjectAdjacentWallEdgeInfo(projectActiveWallIndex);
  const maxGhostMm = projectGhostMaxDistMm(wallWidthMm);
  ['left', 'right'].forEach((edge) => {
    const info = edgeInfo[edge];
    if (!info) return;
    projectAdjacentGhostSlots(info.wallIndex, info.neighborCornerAtZero).forEach(({ slot, distFromCornerMm, extentMm }) => {
      if (distFromCornerMm > maxGhostMm) return;
      const div = document.createElement('div');
      div.className = 'po-proj-ghost-slot';
      div.style[edge] = Math.round(distFromCornerMm * projectPxPerMm) + 'px';
      div.style.width = Math.round(extentMm * projectPxPerMm) + 'px';
      div.style.bottom = Math.round(Number(slot.floor_height_mm || 0) * projectPxPerMm) + 'px';
      div.style.height = Math.round(Number(slot.height_mm || 0) * projectPxPerMm) + 'px';
      div.title = slot.module.name;
      div.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setProjectActiveWallIndex(info.wallIndex);
        selectProjectSlot(slot.id);
      });
      canvas.appendChild(div);
    });
  });
}

// ---------- Vista de Canto 3D interativa (paredes L/C-U) ----------
// Pedido do usuário (2026-07-26, olhando um projeto em L): "acho que quando
// for parede em L devemos subir uma visao fixa em angulo dessa parede,
// mostrando as duas paredes ao mesmo tempo... visao paralela das duas de uma
// vez, mostrando o fim das paredes". 1ª versão usava uma "dobra" de CSS 3D
// (perspective+rotateY) — o usuário reportou que ficou QUEBRADA ("a visao ta
// ruim... nao ta conforme a imagem de referencia") e pediu, na mesma
// mensagem: "quero ver os modulos em 3d tambem, visao paralela. encaixando
// na parede. preciso passar o modulo de uma parede pra outra arrastando."
// Confirmado via pergunta de esclarecimento: motor = cena Three.js de
// verdade COM arrastar dentro dela; o jeito de trocar de parede arrastando =
// "arrastar até a borda da parede ativa" (não precisa mirar direto na
// parede vizinha dobrada, só encostar na borda já basta).
//
// Reaproveita a MESMA função que já desenha bonito pro botão "Visualizar 3D"
// (ViewerProject.renderFreeformWalls, ver generateProject3D/
// viewer3d_composition.js) — é literalmente a imagem de referência que o
// usuário mandou. Só que numa instância 3D PRÓPRIA (ViewerProjectEdit, ver
// abaixo) com câmera FIXA (OrbitControls desligado — setControlsEnabled(false),
// já confirmado antes: "Fixa, sem interação") e com um sistema de arrastar
// via raycasting montado aqui em cima (attachProject3DEditDrag).
const ViewerProjectEdit = (typeof ViewerComposition !== 'undefined' && ViewerComposition.createInstance)
  ? ViewerComposition.createInstance()
  : null;

function renderProjectCanvasFrontCorner(canvas, wrap, dimsLabel, unit) {
  // Esconde o canvas 2D plano (só usado pra forma 'single') e mostra o wrap
  // da cena 3D interativa — nunca os dois ao mesmo tempo (ver
  // renderProjectCanvasFront/renderProjectCanvasTop, que fazem o inverso).
  canvas.style.display = 'none';
  const edit3dWrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  if (edit3dWrap) edit3dWrap.style.display = 'block';

  // Tamanho do canvas 3D: pedido do usuário (2026-07-26) "aumentar a tela
  // de projeto" — antes era uma altura FIXA em CSS (520px, ver
  // #po-proj-canvas-3d-edit), bem menor do que a viewport costuma permitir.
  // Mesma lógica de "cabe na largura E na altura sobrando da viewport" que
  // a vista Frontal 2D já usa (ver renderProjectCanvasFront) — o container
  // é redimensionado ANTES de chamar renderFreeformWalls, que já chama
  // onResize() (viewer3d_composition.js) logo no início e lê
  // containerEl.clientWidth/clientHeight — não precisa nenhum método novo
  // exposto, só mudar o tamanho do elemento antes de renderizar.
  const container3d = document.getElementById('po-proj-canvas-3d-edit');
  if (container3d) {
    const availableWidthPx = Math.max(wrap.clientWidth - 4, 320);
    const wrapTop = wrap.getBoundingClientRect().top;
    const availableHeightPx = Math.max(window.innerHeight - wrapTop - 40, 480);
    container3d.style.width = Math.round(availableWidthPx) + 'px';
    container3d.style.height = Math.round(availableHeightPx) + 'px';
  }

  // A CÂMERA NÃO GIRA MAIS SOZINHA PRA ENCARAR A PAREDE (2026-08-13).
  //
  // activeIdx era o que fazia a câmera girar quase de frente pra parede em
  // edição (ACTIVE_WALL_BIAS em viewer3d_composition.js), inclusive ao inserir
  // um módulo. Nasceu pra resolver um problema real de 2026-07-26 — de perfil,
  // os módulos de uma parede se sobrepõem na tela e viram alvo impossível de
  // clicar —, mas o preço é a cena saltar debaixo da mão de quem está
  // trabalhando. E aquele problema mudou de figura: o clique errado tinha
  // outra causa (Raycaster.params.Line.threshold em metros, corrigido hoje),
  // então o viés deixou de ser necessário pra acertar o módulo.
  //
  // null = bissetriz pura, sempre: as paredes ficam simétricas e a câmera só
  // se move quando o usuário move. Pedido explícito do Matt: "quando módulo é
  // inserido a câmera mostra a parede, vamos desativar essa função".
  //
  // Pra reativar: `projectActiveWallIndex` no lugar de null (o resto da cadeia
  // — peso, bissetriz, fitKey — continua inteiro).
  const activeIdx = null;
  const ceilingMm = roomSettings.ceiling_mm;
  const activeWidthMm = getProjectWallWidthMm(activeIdx);
  if (dimsLabel) dimsLabel.textContent = `${formatDimension(activeWidthMm, unit)} x ${formatDimension(ceilingMm, unit)}`;

  if (!ViewerProjectEdit || !ViewerProjectEdit.available()
    || typeof Viewer3D === 'undefined' || !Viewer3D.buildStandaloneAssembly) {
    const container = document.getElementById('po-proj-canvas-3d-edit');
    if (container) container.innerHTML = `<p class="hint">${I18n.t('composition.not_available_3d')}</p>`;
    return;
  }

  ViewerProjectEdit.init('po-proj-canvas-3d-edit');
  // Ponte pro console do navegador. ViewerProjectEdit é `const` de módulo, e
  // const NÃO vira propriedade de window (ver a mesma armadilha em
  // supabaseClient) — sem esta linha não há como diagnosticar clique/câmera
  // pelo F12, que é justamente o que precisa quando o relato é "o clique pega
  // fora do móvel". Só leitura; nada no código usa este nome.
  if (typeof window !== 'undefined') window.__legnoViewerEdit = ViewerProjectEdit;
  ensurePhotoFrameOverlay('po-proj-canvas-3d-edit');
  // OrbitControls LIGADO (pedido do usuário 2026-07-26: "ainda sim nao ficou
  // facil de projetar... pode testar uma camera que mexe? zoom e rotacao" —
  // depois dos ajustes de raycasting/ângulo terem melhorado bastante mas não
  // resolvido de vez). Câmera automática continua sendo o ponto de partida
  // (fitKey abaixo), mas agora o cliente pode girar (botão direito) e dar
  // zoom (scroll) na hora se um ângulo específico ainda estiver difícil —
  // ver setControlsEnabled (viewer3d_composition.js) pra como o botão
  // ESQUERDO fica de fora do orbit (continua livre pro drag de módulo).
  // Chamado a cada render (idempotente) porque init() só roda de verdade na
  // 1ª vez (reaproveita o mesmo renderer depois).
  // 2026-08-08: passou a respeitar o MODO CÂMERA do toque (iPad) — no mouse
  // continua sempre ligado, exatamente como era. Ver applyProjectViewerControls.
  applyProjectViewerControls();

  // PAREDE OCULTA some do 3D junto com os móveis dela (2026-08-13, pedido do
  // Matt). É filtro de DESENHO: os slots continuam no projeto, no preço e no
  // pedido — some só o que é mostrado, pra dar de ver o interior do ambiente
  // sem a parede da frente atrapalhando.
  const wallsGeometry = getProjectWallGeometry().filter((w) => !w.oculta);
  const wallsData = wallsGeometry.map((wallGeo) => ({
    ...wallGeo,
    assemblies: buildProjectAssemblies(projectSlotsOnWall(wallGeo.wallIndex))
  }));
  // activeIdx (parede em edição no momento — abas/Vista Superior) inclina a
  // câmera automática pra encarar essa parede de frente, pedido do usuário
  // (2026-07-26: "nao consigo selecionar os modulos de tras, preciso
  // precisao pra poder projetar melhor"). Ver comentário grande em
  // renderFreeformWalls (viewer3d_composition.js).
  //
  // fitKey/keepCamera (pedido do usuário, "camera que mexe" acima) — esta
  // função roda de novo a CADA re-render da vista (arrastar/adicionar/
  // remover/esticar módulo, não só ao trocar de parede/forma) porque
  // renderProjectCanvas() sempre chama renderProjectCanvasFrontCorner()
  // inteira. Sem isso, girar/dar zoom manualmente seria desfeito no
  // instante seguinte, assim que qualquer outra edição disparasse um
  // re-render. Só reenquadra do zero quando a CHAVE muda (forma da parede
  // ou parede ativa diferente da última vez) — projectWallShape entra na
  // chave pra cobrir troca de forma mesmo se o índice numérico coincidir
  // (ex.: 'single'→'double' ambos podem ter activeIdx=0). Outros lugares que
  // trocam de projeto inteiro (resetProject/restoreFavoriteProject/
  // restoreGalleryPostAsProject) zeram project3DLastFitKey explicitamente
  // pra garantir reenquadramento mesmo se a chave calculada coincidir por
  // acaso com a de antes.
  // A chave inclui a QUANTIDADE de paredes desenhadas: sem isso, adicionar ou
  // remover parede no editor não reenquadraria (activeIdx virou constante), e
  // o ambiente novo ficaria fora de vista até alguém mexer na câmera.
  const fitKey = projectWallShape + '|' + activeIdx + '|' + projectWallSegments.length;
  const keepCamera = project3DLastFitKey === fitKey;
  project3DLastFitKey = fitKey;
  ViewerProjectEdit.renderFreeformWalls(wallsData, viewerRoomEnvConfig(), activeIdx, {
    keepCamera,
    // Módulos ILHA (soltos no chão, 2026-08-08) — não pertencem a parede
    // nenhuma, então entram por fora de wallsData (ver options.floorAssemblies
    // em renderFreeformWalls/viewer3d_composition.js).
    floorAssemblies: buildProjectAssemblies(projectFloorSlots()),
    // Botão "Cotas" (02/09) — liga as linhas de distância entre módulos
    // vizinhos da MESMA parede (ver buildProjectDimensionLines,
    // viewer3d_composition.js). Só módulos de parede nesta rodada — ver
    // comentário PENDENTE lá sobre ilha/Vista Superior.
    dimensionsEnabled: !!projectDimensionsOn
  });

  // Readota o contorno de destaque (ver refreshProject3DHighlight) —
  // renderFreeformWalls troca TODOS os Groups por instâncias novas, então o
  // Group antigo que o contorno rastreava não existe mais na cena (ficaria
  // "preso"/desatualizado sem isto). Roda depois de QUALQUER render desta
  // vista, não importa a causa (arrastar, esticar, trocar de parede, add/
  // remover módulo) — mantém o destaque em sincronia sempre.
  refreshProject3DHighlight();

  attachProject3DEditDrag();
  // Setas de redimensionamento (toque) — a cena acabou de ser reconstruída,
  // então elas precisam ser redesenhadas na posição nova do módulo
  // selecionado (ver refreshProject3DResizeArrows).
  refreshProject3DResizeArrows();
  refreshProjectSlotActions();
  // Camadas (02/09) — renderFreeformWalls troca TODOS os Groups por
  // instâncias novas a cada render, então tanto o estado de visibilidade
  // quanto a lista de papéis em uso precisam ser reaplicados/recalculados
  // depois de QUALQUER render desta vista (mesmo motivo de
  // refreshProject3DHighlight logo acima).
  if (typeof applyProjectLayerVisibility === 'function') applyProjectLayerVisibility();
  if (typeof refreshProjectLayersMenu === 'function') refreshProjectLayersMenu();
  // Cotas (02/09) — a cena inteira foi trocada por Groups novos
  // (renderFreeformWalls), então as âncoras que refreshProjectDimensionLabels
  // rastreava não existem mais; reconta do zero a cada render.
  if (typeof refreshProjectDimensionLabels === 'function') refreshProjectDimensionLabels();
}

// Estado do arraste em andamento na Vista de Canto 3D — null quando nenhum
// arraste está rolando. Um só de cada vez (não precisa de Map por
// pointerId: esta cena não tem multi-touch/dedos múltiplos previsto).
let projectDrag3DState = null;
// Encerra o arraste em andamento — apontada pro endDrag3D de dentro de
// attachProject3DEditDrag (ver lá). Existe porque o pointermove precisa
// conseguir encerrar o gesto quando descobre que o botão já foi solto, e ele
// está no mesmo escopo, mas a rede de segurança de window/blur não.
let finishProject3DDrag = function () { projectDrag3DState = null; };

// CONTORNO VERMELHO = MÓDULO SELECIONADO (2026-08-12)
// ==========================================================================
// Era hover: o contorno seguia o mouse e sumia quando o ponteiro saía de
// cima. Reclamação do Matt: "quando eu clicar no modulo e ele ficar vermelho,
// quando o mouse sair de cima dele ele precisa permanecer clicado e nao pode
// selecionar outros modulos sem clique... isso perde totalmente meu
// controle". Agora o contorno é o espelho de selectedProjectSlotId — só muda
// com CLIQUE (num outro módulo, ou na parede/vazio, que desseleciona).
//
// Passar o mouse por cima continua trocando o CURSOR (grab/ew-resize/
// ns-resize, ver o pointermove), que é o aviso de "o que um clique aqui
// faria" sem mexer em seleção nenhuma.
//
// Precisa ser chamado depois de todo re-render da cena: renderFreeformWalls
// cria Groups novos e o contorno rastreia o Group, não o id.
function refreshProject3DHighlight() {
  if (typeof ViewerProjectEdit === 'undefined' || !ViewerProjectEdit.setHoverHighlight) return;
  const g = (selectedProjectSlotId != null && ViewerProjectEdit.findGroupBySlotId)
    ? ViewerProjectEdit.findGroupBySlotId(selectedProjectSlotId)
    : null;
  ViewerProjectEdit.setHoverHighlight(g || null);
}

// Chave da última vez que a câmera da Vista de Canto 3D foi reenquadrada
// automaticamente (forma da parede + parede ativa) — ver keepCamera em
// renderProjectCanvasFrontCorner. null força reenquadrar na próxima chamada
// (usado por resetProject/restoreFavoriteProject/restoreGalleryPostAsProject,
// que trocam o projeto INTEIRO — não dá pra confiar só na chave coincidir ou
// não, o bounding box pode ter mudado completamente mesmo com a mesma forma/
// parede ativa de antes).
let project3DLastFitKey = null;

// Classifica o que um AGARRE (pointerdown OU só hover, sem clicar) nesse
// ponto do módulo resultaria: mover o módulo inteiro, ou esticar largura/
// altura — mesma lógica usada tanto pra decidir o modo de verdade
// (pointerdown, ver attachProject3DEditDrag) quanto só pra trocar o CURSOR
// no hover (pedido do usuário: "nao sei se o comando sera arrastar o modulo
// ou esticar ele"), sem duplicar a régua de detecção de borda duas vezes.
// Quais eixos deste módulo aceitam redimensionar — extraído de
// classifyProject3DGrab (2026-08-08) porque as SETAS 3D de toque (ver
// refreshProject3DResizeArrows) precisam exatamente da mesma régua: "nos
// sentidos permitidos", nas palavras do pedido. Medida travada
// (width_locked/height_locked) só é redimensionável se houver 2+ valores
// cadastrados pra pular entre eles (ver widthPresetsMm/heightPresetsMm).
function projectSlotResizableAxes(slot) {
  const widthPresetsMm = slot.widthPresetsMm || [];
  const heightPresetsMm = slot.heightPresetsMm || [];
  return {
    width: slot.module.width_locked
      ? widthPresetsMm.length > 1
      : Number(slot.module.width_min_mm) !== Number(slot.module.width_max_mm),
    height: slot.module.height_locked
      ? heightPresetsMm.length > 1
      : Number(slot.module.height_min_mm) !== Number(slot.module.height_max_mm),
    // PROFUNDIDADE (2026-08-13, "nao tem seta pra profundidade"). Não tem
    // trava própria no cadastro (não existe depth_locked), então o critério é
    // só "o mín é diferente do máx" — módulo de profundidade única não ganha
    // seta, igual às outras duas.
    depth: Number(slot.module.depth_min_mm) !== Number(slot.module.depth_max_mm)
  };
}

function classifyProject3DGrab(slot, grabAlongMm, grabHeightMm) {
  const widthMm = Number(slot.width_mm || 0);
  const heightMm = Number(slot.height_mm || 0);
  const axes = projectSlotResizableAxes(slot);
  const widthResizable = axes.width;
  const heightResizable = axes.height;
  const localLeftMm = grabAlongMm - Number(slot.x_mm || 0);
  const localRightMm = widthMm - localLeftMm;
  const localTopMm = (Number(slot.floor_height_mm || 0) + heightMm) - grabHeightMm;
  const EDGE_ZONE_W_MM = clamp(widthMm * 0.18, 25, 60);
  const EDGE_ZONE_H_MM = clamp(heightMm * 0.18, 25, 60);

  // Ilha no chão: as bordas do módulo não estão num plano de parede nenhum
  // (grabAlongMm/grabHeightMm seriam coordenadas de outro referencial), então
  // agarrar sempre MOVE. Redimensionar ilha é pelas setas 3D (toque) ou pelo
  // painel da direita.
  if (isFloorSlot(slot)) return { dragMode: 'move', resizeAxis: null };

  if (widthResizable && localLeftMm <= EDGE_ZONE_W_MM) return { dragMode: 'resize', resizeAxis: 'width-left' };
  if (widthResizable && localRightMm <= EDGE_ZONE_W_MM) return { dragMode: 'resize', resizeAxis: 'width-right' };
  if (heightResizable && localTopMm <= EDGE_ZONE_H_MM) return { dragMode: 'resize', resizeAxis: 'height-top' };
  return { dragMode: 'move', resizeAxis: null };
}

// ==========================================================================
// SETAS DE REDIMENSIONAMENTO EM 3D (toque) — 2026-08-08
// ==========================================================================
// Pedido do usuário (iPad): "clique rapido no modulo (tela travada) mantem o
// vermelho envolta pra mostrar que esta selecionado, ele abre setas pra
// redimencionamento nos sentidos permitidos". No mouse, esticar é agarrar a
// borda do módulo (classifyProject3DGrab) com o cursor mudando pra ↔/↕ como
// pista — no dedo não existe cursor nem precisão de borda, então a alça
// precisa ser um objeto visível de verdade na cena.
//
// A geometria é calculada AQUI (não no viewer) porque só portal.js conhece a
// parede em que o módulo está e o que ele pode ou não esticar; o viewer só
// desenha e devolve qual seta foi tocada (setResizeArrows/pickResizeArrowAt em
// viewer3d_composition.js).
const PROJECT_ARROW_GAP_M = 0.06; // folga entre a face do módulo e o início da seta
function refreshProject3DResizeArrows() {
  if (!ViewerProjectEdit || !ViewerProjectEdit.setResizeArrows) return;
  // Setas em TODO dispositivo (mudou em 2026-08-08, 2ª rodada). Nasceram só
  // pro toque, mas o pedido "nas setas, 2 cliques" veio marcado como AMBOS —
  // e no mouse a única forma de esticar era agarrar a borda invisível do
  // módulo (classifyProject3DGrab), coisa que ninguém descobre sem ser
  // avisado. Com alça visível, o gesto fica igual nos dois e o duplo clique
  // tem onde acontecer. O agarre de borda continua funcionando em paralelo.
  const slot = (selectedProjectSlotId != null)
    ? projectSlots.find((s) => s.id === selectedProjectSlotId)
    : null;
  if (!slot || projectCameraModeOn) { ViewerProjectEdit.setResizeArrows(null); return; }

  const axes = projectSlotResizableAxes(slot);
  const spec = [];
  const heightM = Number(slot.height_mm || 0) / 1000;
  const widthM = Number(slot.width_mm || 0) / 1000;
  const baseY = Number(slot.floor_height_mm || 0) / 1000;

  if (isFloorSlot(slot)) {
    // Ilha: as setas de largura seguem o eixo local X do módulo (girado por
    // floor_rotation_deg), não um eixo de parede.
    const rot = (Number(slot.floor_rotation_deg || 0) * Math.PI) / 180;
    const ax = { x: Math.cos(rot), y: 0, z: -Math.sin(rot) }; // eixo local +X no mundo
    const cx = Number(slot.floor_x_mm || 0) / 1000;
    const cz = Number(slot.floor_z_mm || 0) / 1000;
    const midY = baseY + heightM / 2;
    if (axes.width) {
      const off = widthM / 2 + PROJECT_ARROW_GAP_M;
      spec.push({ axis: 'width-right', dir: ax, position: { x: cx + ax.x * off, y: midY, z: cz + ax.z * off } });
      spec.push({ axis: 'width-left', dir: { x: -ax.x, y: 0, z: -ax.z }, position: { x: cx - ax.x * off, y: midY, z: cz - ax.z * off } });
    }
    if (axes.height) {
      spec.push({ axis: 'height-top', dir: { x: 0, y: 1, z: 0 }, position: { x: cx, y: baseY + heightM + PROJECT_ARROW_GAP_M, z: cz } });
    }
    if (axes.depth) {
      // Eixo local +Z da ilha (perpendicular ao +X já calculado acima).
      const az = { x: Math.sin(rot), y: 0, z: Math.cos(rot) };
      const offD = Number(slot.depth_mm || 0) / 2000 + PROJECT_ARROW_GAP_M;
      spec.push({ axis: 'depth-front', dir: az, position: { x: cx + az.x * offD, y: midY, z: cz + az.z * offD } });
    }
    ViewerProjectEdit.setResizeArrows(spec, projectIsTouchDevice());
    return;
  }

  const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === Number(slot.wall_index || 0));
  if (!wallGeo) { ViewerProjectEdit.setResizeArrows(null); return; }
  // Ponto no MUNDO a partir de "quanto ao longo da parede" + "que altura" —
  // mesma decomposição origin + alongDir*along + intoDir*depth já usada pra
  // posicionar os módulos (ver renderFreeformWalls).
  const depthOffM = Number(slot.depth_mm || 0) / 2000 + Number(slot.z_order || 0) * 0.004;
  const worldAt = (alongM, y) => ({
    x: wallGeo.originX + wallGeo.alongDirX * alongM + wallGeo.intoDirX * depthOffM,
    y,
    z: wallGeo.originZ + wallGeo.alongDirZ * alongM + wallGeo.intoDirZ * depthOffM
  });
  const x0M = Number(slot.x_mm || 0) / 1000;
  const midY = baseY + heightM / 2;
  if (axes.width) {
    spec.push({
      axis: 'width-right',
      dir: { x: wallGeo.alongDirX, y: 0, z: wallGeo.alongDirZ },
      position: worldAt(x0M + widthM + PROJECT_ARROW_GAP_M, midY)
    });
    spec.push({
      axis: 'width-left',
      dir: { x: -wallGeo.alongDirX, y: 0, z: -wallGeo.alongDirZ },
      position: worldAt(x0M - PROJECT_ARROW_GAP_M, midY)
    });
  }
  if (axes.height) {
    spec.push({
      axis: 'height-top',
      dir: { x: 0, y: 1, z: 0 },
      position: worldAt(x0M + widthM / 2, baseY + heightM + PROJECT_ARROW_GAP_M)
    });
  }
  if (axes.depth) {
    // Aponta pra DENTRO do ambiente (intoDir da parede), saindo da face da
    // frente do módulo — é o sentido em que a profundidade cresce.
    const frenteM = Number(slot.depth_mm || 0) / 1000 + PROJECT_ARROW_GAP_M;
    spec.push({
      axis: 'depth-front',
      dir: { x: wallGeo.intoDirX, y: 0, z: wallGeo.intoDirZ },
      position: {
        x: wallGeo.originX + wallGeo.alongDirX * (x0M + widthM / 2) + wallGeo.intoDirX * frenteM,
        y: midY,
        z: wallGeo.originZ + wallGeo.alongDirZ * (x0M + widthM / 2) + wallGeo.intoDirZ * frenteM
      }
    });
  }
  // Alvo generoso só no dedo — no mouse, área grande vira imprecisão.
  ViewerProjectEdit.setResizeArrows(spec, projectIsTouchDevice());
}

// Enquadra UM módulo de frente na Vista de Canto 3D (duplo clique nele,
// 2026-08-13). A direção de onde a câmera olha:
//   * módulo de parede — de frente pra parede dele (o contrário do intoDir,
//     que aponta pra dentro do ambiente), com uma leve inclinação de cima pra
//     não ficar um desenho técnico chapado;
//   * ilha — mantém a direção atual da câmera, só aproxima e centraliza (uma
//     ilha não tem "frente" definida pelo ambiente; a frente dela depende do
//     giro que o próprio cliente deu).
function frameProjectSlotFront(slot) {
  if (!ViewerProjectEdit || !ViewerProjectEdit.frameGroupFront) return;
  const g = ViewerProjectEdit.findGroupBySlotId(slot.id);
  if (!g) return;
  let dir = null;
  if (!isFloorSlot(slot)) {
    const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === Number(slot.wall_index || 0));
    if (wallGeo) dir = { x: wallGeo.intoDirX, y: 0.16, z: wallGeo.intoDirZ };
  }
  if (!dir) {
    const cam = ViewerProjectEdit.getCameraState && ViewerProjectEdit.getCameraState();
    if (cam && cam.position && cam.target) {
      dir = {
        x: cam.position.x - cam.target.x,
        y: cam.position.y - cam.target.y,
        z: cam.position.z - cam.target.z
      };
    } else {
      dir = { x: 0, y: 0.3, z: 1 };
    }
  }
  ViewerProjectEdit.frameGroupFront(g, dir);
  refreshProject3DResizeArrows();
}

// ==========================================================================
// ESTICAR ATÉ ENCOSTAR (duplo clique na seta) — 2026-08-08
// ==========================================================================
// Pedido do usuário: "nas setas, quando dar 2 cliques na seta, o modulo pode
// ir ate encostar na primeira colisao. se tiver recurso de chegar ate la" —
// confirmado por pergunta que é ESTICAR (não andar): a borda daquele lado
// cresce até tocar o vizinho, "preenchendo o vão". O "se tiver recurso" está
// respeitado de graça: quem aplica a medida é updateProjectSlotDimension /
// updateProjectSlotWidthFromLeft, que já clampam no min/max do módulo (e a
// altura também no pé direito) — pedir 3m numa peça que vai até 900mm resulta
// em 900mm, não em erro.
//
// "Primeira colisão" = a borda mais próxima, NAQUELE sentido, entre os módulos
// da mesma parede cuja faixa perpendicular se cruza com a deste (dois móveis
// em alturas que não se cruzam não se estorvam), com a própria parede como
// último obstáculo. Independe do botão Colisão estar ligado: aqui o usuário
// pediu explicitamente pra encostar, não é uma trava de arraste.
const PROJECT_TOUCH_GAP_EPS_MM = 0.5;
function stretchProjectSlotToCollision(slot, axis) {
  // Ilha no chão fica de fora: "vão até o vizinho" pressupõe uma parede como
  // régua e vizinhos alinhados nela — solto no meio do ambiente isso não
  // existe. Esticar ilha continua sendo arrastando a seta ou pelo painel.
  if (isFloorSlot(slot)) return false;

  const others = projectSlotsSameWallExcluding(slot);
  const x0 = Number(slot.x_mm || 0);
  const w = Number(slot.width_mm || 0);
  const y0 = Number(slot.floor_height_mm || 0);
  const h = Number(slot.height_mm || 0);
  const wallWidthMm = getProjectWallWidthMm(Number(slot.wall_index || 0));
  // Faixas que se cruzam: só conta como obstáculo quem divide altura com este
  // módulo (pros eixos de largura) ou divide largura com ele (pro eixo da
  // altura). EPS evita que um vizinho apenas ENCOSTADO na borda conte como
  // sobreposição de faixa.
  const sharesRow = (s) => (y0 < Number(s.floor_height_mm || 0) + Number(s.height_mm || 0) - PROJECT_TOUCH_GAP_EPS_MM)
    && (y0 + h > Number(s.floor_height_mm || 0) + PROJECT_TOUCH_GAP_EPS_MM);
  const sharesColumn = (s) => (x0 < Number(s.x_mm || 0) + Number(s.width_mm || 0) - PROJECT_TOUCH_GAP_EPS_MM)
    && (x0 + w > Number(s.x_mm || 0) + PROJECT_TOUCH_GAP_EPS_MM);

  if (axis === 'width-right') {
    let limit = wallWidthMm;
    others.forEach((s) => {
      if (!sharesRow(s)) return;
      const left = Number(s.x_mm || 0);
      if (left >= x0 + w - PROJECT_TOUCH_GAP_EPS_MM) limit = Math.min(limit, left);
    });
    const target = limit - x0;
    if (!(target > 0)) return false;
    updateProjectSlotDimension(slot, 'width', target);
    return true;
  }

  if (axis === 'width-left') {
    let limit = 0;
    others.forEach((s) => {
      if (!sharesRow(s)) return;
      const right = Number(s.x_mm || 0) + Number(s.width_mm || 0);
      if (right <= x0 + PROJECT_TOUCH_GAP_EPS_MM) limit = Math.max(limit, right);
    });
    // A borda DIREITA fica ancorada (é o outro lado que anda) — mesma
    // convenção de updateProjectSlotWidthFromLeft, que recebe a largura nova.
    const target = (x0 + w) - limit;
    if (!(target > 0)) return false;
    updateProjectSlotWidthFromLeft(slot, target);
    return true;
  }

  if (axis === 'height-top') {
    // Sem vizinho acima, o limite é o teto útil — updateProjectSlotDimension
    // já aplica essa mesma régua (pé direito − afastamento − rodapé) sozinho,
    // então pedir Infinity aqui é seguro e evita duplicar a fórmula.
    let limit = Infinity;
    others.forEach((s) => {
      if (!sharesColumn(s)) return;
      const bottom = Number(s.floor_height_mm || 0);
      if (bottom >= y0 + h - PROJECT_TOUCH_GAP_EPS_MM) limit = Math.min(limit, bottom);
    });
    const target = (limit === Infinity)
      ? Number(slot.module.height_max_mm || 0) || 100000
      : limit - y0;
    if (!(target > 0)) return false;
    updateProjectSlotDimension(slot, 'height', target);
    return true;
  }

  return false;
}

// ==========================================================================
// BOTÕES "DUPLICAR / REMOVER" SOBRE O MÓDULO SELECIONADO — 2026-08-08 (3ª rodada)
// ==========================================================================
// São DOM, não geometria 3D (ver o bloco em portal.html). Como a cena 3D é
// interativa (orbit, zoom, arraste), a posição na tela muda a todo instante —
// então enquanto houver módulo selecionado um laço de requestAnimationFrame
// reposiciona os botões. O laço só existe enquanto os botões estão visíveis
// (para sozinho quando some a seleção), e cada quadro faz duas escritas de
// style: barato o suficiente pra não competir com o render do Three.js.
//
// Alternativa descartada: recalcular só nos eventos (pointerup, wheel, render).
// O OrbitControls tem damping — a câmera continua se movendo DEPOIS do dedo
// sair, e os botões ficariam derrapando atrás dela.
let projectSlotActionsRafId = null;

function projectSlotActionsAnchorWorld(slot) {
  // Âncora: EMBAIXO do módulo, centrada (2026-08-13, pedido do Matt com
  // layout junto). Ficava no canto superior direito, onde disputava espaço
  // com a seta de altura e, em módulo alto, saía do enquadramento. Embaixo o
  // lugar é sempre livre — nenhuma seta mora ali — e a barra fica no caminho
  // natural do olhar, logo abaixo do que está selecionado.
  const baseY = Number(slot.floor_height_mm || 0) / 1000;
  // 18cm abaixo da base (era 10cm). O afastamento em MUNDO acompanha o zoom —
  // se ficasse só no CSS, a barra colaria no móvel ao aproximar a câmera.
  const y = Math.max(baseY - 0.18, 0.01);
  if (isFloorSlot(slot)) {
    const rot = (Number(slot.floor_rotation_deg || 0) * Math.PI) / 180;
    return {
      x: Number(slot.floor_x_mm || 0) / 1000,
      y,
      z: Number(slot.floor_z_mm || 0) / 1000
    };
  }
  const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === Number(slot.wall_index || 0));
  if (!wallGeo) return null;
  const alongM = (Number(slot.x_mm || 0) + Number(slot.width_mm || 0) / 2) / 1000;
  const depthOffM = Number(slot.depth_mm || 0) / 2000;
  return {
    x: wallGeo.originX + wallGeo.alongDirX * alongM + wallGeo.intoDirX * depthOffM,
    y,
    z: wallGeo.originZ + wallGeo.alongDirZ * alongM + wallGeo.intoDirZ * depthOffM
  };
}

function refreshProjectSlotActions() {
  const el = document.getElementById('po-proj-slot-actions');
  if (!el) return;
  const wrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  const slot = (selectedProjectSlotId != null)
    ? projectSlots.find((s) => s.id === selectedProjectSlotId)
    : null;
  const visible = !!slot
    && !!wrap && wrap.offsetParent !== null      // só na Vista de Canto 3D
    && !projectCameraModeOn                       // em modo câmera o dedo é da câmera
    && !!ViewerProjectEdit && !!ViewerProjectEdit.worldToClient;

  if (!visible) {
    el.style.display = 'none';
    if (projectSlotActionsRafId) { cancelAnimationFrame(projectSlotActionsRafId); projectSlotActionsRafId = null; }
    return;
  }

  const tick = () => {
    projectSlotActionsRafId = null;
    const liveSlot = (selectedProjectSlotId != null)
      ? projectSlots.find((s) => s.id === selectedProjectSlotId)
      : null;
    const stillVisible = !!liveSlot && !!wrap && wrap.offsetParent !== null && !projectCameraModeOn;
    if (!stillVisible) { el.style.display = 'none'; return; }
    const anchor = projectSlotActionsAnchorWorld(liveSlot);
    const screen = anchor ? ViewerProjectEdit.worldToClient(anchor) : null;
    if (!screen) { el.style.display = 'none'; }
    else {
      el.style.display = 'flex';
      el.style.left = Math.round(screen.x) + 'px';
      el.style.top = Math.round(screen.y) + 'px';
    }
    projectSlotActionsRafId = requestAnimationFrame(tick);
  };
  if (!projectSlotActionsRafId) projectSlotActionsRafId = requestAnimationFrame(tick);
}

// ==========================================================================
// COTAS (02/09) — botão liga/desliga (ver #po-proj-dims-btn, wiring em
// portal-08-projetos-paredes.js). A LINHA 3D de verdade é desenhada dentro
// de renderFreeformWalls (ver buildProjectDimensionLines,
// viewer3d_composition.js, só quando dimensionsEnabled) — esta função aqui
// só cuida do NÚMERO flutuante (DOM, não dá pra escrever texto legível
// direto no WebGL sem uma lib de fonte 3D à parte), reaproveitando o mesmo
// padrão de refreshProjectSlotActions logo acima (RAF + worldToClient a
// cada frame, pra acompanhar o giro/zoom da câmera).
let projectDimensionsOn = false;
let projectDimLabelsRafId = null;
function refreshProjectDimensionLabels() {
  const wrap3d = document.getElementById('po-proj-canvas-3d-edit-wrap');
  const container = document.getElementById('po-proj-dim-labels');
  if (!container) return;
  const stop = () => {
    container.innerHTML = '';
    if (projectDimLabelsRafId) { cancelAnimationFrame(projectDimLabelsRafId); projectDimLabelsRafId = null; }
  };
  if (!projectDimensionsOn || !wrap3d || wrap3d.offsetParent === null
      || !ViewerProjectEdit || !ViewerProjectEdit.getScene || !ViewerProjectEdit.worldToClient) {
    stop();
    return;
  }
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const tick = () => {
    projectDimLabelsRafId = null;
    if (!projectDimensionsOn || wrap3d.offsetParent === null) { stop(); return; }
    const scene = ViewerProjectEdit.getScene();
    const anchors = [];
    if (scene) {
      scene.traverse((obj) => {
        if (obj.userData && typeof obj.userData.dimGapMm === 'number') anchors.push(obj);
      });
    }
    // Reaproveita os <span> já existentes em vez de recriar tudo a cada
    // frame (60x/s) — só muda a quantidade quando o número de cotas muda de
    // verdade (módulo movido/adicionado/removido, ver renderProjectCanvasFrontCorner).
    while (container.children.length < anchors.length) {
      const span = document.createElement('span');
      span.className = 'po-proj-dim-label';
      container.appendChild(span);
    }
    while (container.children.length > anchors.length) container.removeChild(container.lastChild);
    anchors.forEach((anchor, i) => {
      const el = container.children[i];
      const screen = ViewerProjectEdit.worldToClient(anchor.position);
      if (!screen) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.left = Math.round(screen.x) + 'px';
      el.style.top = Math.round(screen.y) + 'px';
      el.textContent = formatDimensionNumber(anchor.userData.dimGapMm, unit) + unitAbbrev(unit);
    });
    projectDimLabelsRafId = requestAnimationFrame(tick);
  };
  if (!projectDimLabelsRafId) projectDimLabelsRafId = requestAnimationFrame(tick);
}

const projSlotDuplicateBtn = document.getElementById('po-proj-slot-duplicate-btn');
if (projSlotDuplicateBtn) {
  // pointerdown com stopPropagation: o botão fica POR CIMA do canvas 3D, e sem
  // isso o mesmo toque também viraria um pointerdown de seleção/arraste lá
  // embaixo (o listener do canvas não sabe que o dedo pousou num botão).
  projSlotDuplicateBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  projSlotDuplicateBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (selectedProjectSlotId != null) duplicateProjectSlot(selectedProjectSlotId);
  });
}
// ==========================================================================
// SUBSTITUIR MÓDULO — 2026-08-13
// ==========================================================================
// "quero um botão depois de remover que abre os módulos e substitui pelo
// módulo novo, porém mesma largura altura e profundidade. o antigo remove."
//
// Não cria slot novo: o MESMO slot passa a apontar pro outro módulo. Assim
// posição, parede, altura do chão, giro e a ordem na cena continuam
// exatamente como estavam — inserir + apagar perderia tudo isso e ainda
// mudaria o id do slot (que é a chave da seleção, do undo e do layout do
// construtor).
//
// Quem faz a troca é repointProjectSlotToModule, que já existia: ela mantém
// as MEDIDAS (são números do slot, não do módulo) e as cores por PAPEL, e
// recarrega peças/dobradiça/corrediça/presets do módulo novo. O que falta
// aqui é só respeitar os limites do módulo novo — uma medida que era válida
// no antigo pode estar fora do min/max do outro.
//
// (projectReplaceSlotId é declarado lá em cima, junto do resto do estado da
// aba — ver o comentário sobre zona morta temporal em projectWallSegments.)

async function replaceProjectSlotModule(slotId, novoModuleId) {
  const slot = projectSlots.find((s) => s.id === slotId);
  if (!slot || !novoModuleId) return;
  const antes = { w: slot.width_mm, h: slot.height_mm, d: slot.depth_mm };
  try {
    await repointProjectSlotToModule(slot, novoModuleId);
  } catch (e) {
    alert((e && e.message) || String(e));
    return;
  }
  // Medidas: mantém as de antes, clampadas no que o módulo novo aceita.
  // Medida TRAVADA (width_locked/height_locked) pula pro valor cadastrado
  // mais próximo, mesma regra do arraste (ver updateProjectSlotDimension).
  const m = slot.module || {};
  const ajusta = (valor, min, max, travado, presets) => {
    if (travado && (presets || []).length) return Pricing.pickNearestPreset(presets, valor);
    return clamp(valor, Number(min) || 1, Number(max) || valor);
  };
  slot.width_mm = ajusta(antes.w, m.width_min_mm, m.width_max_mm, m.width_locked, slot.widthPresetsMm);
  slot.height_mm = ajusta(antes.h, m.height_min_mm, m.height_max_mm, m.height_locked, slot.heightPresetsMm);
  slot.depth_mm = ajusta(antes.d, m.depth_min_mm, m.depth_max_mm, false, null);

  // A árvore do construtor era do módulo ANTIGO: os ids de agregado até
  // podem existir no novo, mas o casco (e portanto os vãos) é outro. Guardar
  // ela geraria peça no lugar errado, calada. Some junto com o módulo velho.
  slot.layout = null;
  slot.layoutPieces = [];
  slot.thumbnail_data_url = null;

  clampProjectSlotPosition(slot);
  resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
  recomputeProjectSlotPricing(slot);
  renderProjectCanvas();
  selectProjectSlot(slot.id);
  markProjectDirty();
}

// ==========================================================================
// PEÇAS DO MÓVEL — lista de corte + vista explodida (2026-08-13)
// ==========================================================================
// "quero uma tela mostrando todas as peças que esse móvel tem: descrição,
// comprimento, largura, cor, veio... tipo uma lista de plano de corte. quero
// ver ele explodido, pra conferência."
//
// As DUAS coisas na mesma tela de propósito: a lista diz o que vai ser
// cortado, a explodida diz onde cada peça entra. Conferir uma sem a outra é
// como conferir uma lista de compras sem saber a receita.
//
// A lista sai de resolvePiecesForViewer + Pricing.calculatePiece — as MESMAS
// funções que alimentam preço e 3D. Não existe cálculo próprio aqui: se a
// conferência usasse outra conta, ela deixaria de ser conferência.
let piecesViewer = null;
let piecesAssembly = null;
// Slot do modal ABERTO no momento — os botões de remover/restaurar e o
// seletor de cor (delegados em #po-pieces-list, ver ligaPecasDoMovel) usam
// isto pra achar o slot de novo no clique, em vez de fechar sobre a
// referência `slot` do render (que ficaria presa ao slot de quando o modal
// abriu, e um clique rápido em "remover" logo após trocar de módulo
// selecionado bateria no slot errado).
let piecesModalSlotId = null;

function openProjectSlotPieces(slotId) {
  const slot = projectSlots.find((s) => s.id === slotId);
  const modal = document.getElementById('po-pieces-modal');
  if (!slot || !modal) return;
  piecesModalSlotId = slotId;
  const titulo = document.getElementById('po-pieces-title');
  if (titulo) titulo.textContent = (slot.module && slot.module.name) || I18n.t('pieces.modal_title');
  modal.classList.add('open');
  renderProjectSlotPiecesList(slot);
  renderProjectSlotPiecesExploded(slot);
}

// Achata a árvore (peça-módulo tem filhas) — a conferência quer a peça que vai
// pra serra, não o agrupamento.
//
// FIX (2026-08-20): estava lendo `p.child_parts`, mas resolvePiecesForViewer
// (js/module-pieces.js) escreve `child_pieces` — o ramo de peça-módulo
// aninhada nunca expandia de verdade, ela só aparecia como 1 linha só
// (fallback do `else`). Achado ao dar `piece_id` a cada linha pra remoção;
// não tinha bug report do usuário porque os módulos testados até aqui não
// tinham peça aninhada com filhos resolvidos.
function flatProjectPieces(parts, prefixo) {
  const saida = [];
  (parts || []).forEach((p) => {
    if (p.is_module && Array.isArray(p.child_pieces) && p.child_pieces.length) {
      saida.push(...flatProjectPieces(p.child_pieces, (prefixo ? prefixo + ' · ' : '') + (p.reference || '')));
    } else {
      saida.push({ p, grupo: prefixo || '' });
    }
  });
  return saida;
}

// "quero remover qualquer peca" (2026-08-20) — lista TODAS as peças,
// inclusive a já removida (mostrada riscada, com botão de restaurar), por
// isso usa projectSlotAllPiecesBeforeRemoval em vez de
// projectSlotEffectivePieces (essa segunda seria o que sobra DEPOIS da
// remoção — não dá pra restaurar o que nem aparece mais).
function renderProjectSlotPiecesList(slot) {
  const el = document.getElementById('po-pieces-list');
  if (!el) return;
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  let parts = [];
  try {
    parts = resolvePiecesForViewer(
      projectSlotAllPiecesBeforeRemoval(slot),
      { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm },
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    ) || [];
  } catch (e) { parts = []; }
  const linhas = flatProjectPieces(parts);
  if (!linhas.length) { el.innerHTML = '<p class="hint">' + I18n.t('pieces.empty') + '</p>'; return; }

  const removidas = slot.removedPieceIds || [];
  const colorOptionsByRole = slot.colorOptionsByRole || {};

  // Maior × médio × menor: é assim que a peça chega na serra, e é assim que a
  // lista de corte do ERP já mostra. Guardar "largura/altura/profundidade"
  // aqui obrigaria quem confere a traduzir de cabeça a cada linha.
  const dim = (p) => {
    const v = [Number(p.width_mm) || 0, Number(p.height_mm) || 0, Number(p.depth_mm) || 0].sort((a, b) => b - a);
    return { c: v[0], l: v[1], e: v[2] };
  };
  el.innerHTML = '<table class="po-pieces-table"><thead><tr>'
    + '<th>#</th><th>' + I18n.t('pieces.col_piece') + '</th><th>' + I18n.t('pieces.col_length')
    + '</th><th>' + I18n.t('pieces.col_width') + '</th><th>' + I18n.t('pieces.col_thickness')
    + '</th><th>' + I18n.t('pieces.col_color') + '</th><th>' + I18n.t('pieces.col_grain')
    + '</th><th>' + I18n.t('pieces.col_actions') + '</th>'
    + '</tr></thead><tbody>'
    + linhas.map(({ p, grupo }, i) => {
      const d = dim(p);
      const pieceId = p.piece_id;
      const removida = pieceId != null && removidas.includes(pieceId);
      const veio = p.veio || (p.components && p.components.veio) || I18n.t('pieces.grain_free');
      const pieceIdAttr = escapeHtmlCutlist(pieceId == null ? '' : pieceId);
      const nome = escapeHtmlCutlist((grupo ? grupo + ' · ' : '') + (p.reference || p.module_name || ''))
        + (removida ? ' <span class="po-piece-removed-badge">(' + I18n.t('pieces.removed_badge') + ')</span>' : '');

      // Cor: seletor só quando o papel de cor desta peça tem mais de 1 opção
      // cadastrada (pedido original: "trocar de cor" faz sentido quando há
      // pra onde trocar) — senão mostra só o nome, igual sempre foi.
      const opcoesCor = (p.color_role_id && colorOptionsByRole[p.color_role_id]) || [];
      let corCell;
      if (!removida && p.color_role_id && opcoesCor.length > 1) {
        const currentId = p.color && p.color.id;
        corCell = '<select class="po-piece-color-select" data-piece-id="' + pieceIdAttr
          + '" data-role-id="' + escapeHtmlCutlist(p.color_role_id) + '">'
          + opcoesCor.map((c) => '<option value="' + escapeHtmlCutlist(c.id) + '"'
            + (c.id === currentId ? ' selected' : '') + '>' + escapeHtmlCutlist(c.name) + '</option>').join('')
          + '</select>';
      } else {
        const cor = (p.color && (p.color.name || p.color.code)) || '—';
        corCell = escapeHtmlCutlist(cor);
      }

      // Ação: remover qualquer peça, sem gating de client_optional (pedido
      // explícito do Matt) — restaurar sempre disponível, sem confirm()
      // nativo (trava o resto da extensão do Chrome/qualquer automação).
      const acaoCell = pieceId == null ? '' : (removida
        ? '<button type="button" class="secondary po-piece-restore-btn" data-piece-action="restore" data-piece-id="' + pieceIdAttr
          + '" title="' + escapeHtmlCutlist(I18n.t('pieces.restore_btn')) + '">↺</button>'
        : '<button type="button" class="secondary po-piece-remove-btn" data-piece-action="remove" data-piece-id="' + pieceIdAttr
          + '" title="' + escapeHtmlCutlist(I18n.t('pieces.remove_btn')) + '">×</button>');

      return '<tr data-idx="' + i + '"' + (removida ? ' class="po-piece-removed"' : '') + '><td>' + (i + 1) + '</td>'
        + '<td>' + nome + '</td>'
        + '<td>' + formatDimension(d.c, unit) + '</td>'
        + '<td>' + formatDimension(d.l, unit) + '</td>'
        + '<td>' + formatDimension(d.e, unit) + '</td>'
        + '<td>' + corCell + '</td>'
        + '<td>' + escapeHtmlCutlist(veio) + '</td>'
        + '<td>' + acaoCell + '</td></tr>';
    }).join('')
    + '</tbody></table>'
    + '<p class="hint">' + I18n.t('pieces.footer_hint', { n: linhas.length }) + '</p>';
}

// Explodir = afastar cada peça do CENTRO do módulo, na direção em que ela já
// está. Não recalcula posição nenhuma: pega o assembly pronto (o mesmo do 3D)
// e empurra cada filho pra fora. Assim a explodida nunca "inventa" um arranjo
// diferente do que está montado.
function renderProjectSlotPiecesExploded(slot) {
  const cont = document.getElementById('po-pieces-3d');
  if (!cont || typeof ViewerComposition === 'undefined' || !ViewerComposition.createInstance) return;
  if (!piecesViewer) piecesViewer = ViewerComposition.createInstance();
  piecesViewer.init('po-pieces-3d');
  const asm = buildCompositionAssemblies([{
    pieces: projectSlotEffectivePieces(slot),
    width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
    colorsByRole: slot.colorsByRole, pieceColorOverrides: slot.pieceColorOverrides || {},
    shelfQuantities: slot.shelfQuantities, dimOverrides: slot.dimOverrides
  }]);
  piecesAssembly = (asm && asm[0]) || null;
  if (!piecesAssembly || !piecesAssembly.group) return;
  // Guarda a posição original de cada filho: explodir é interpolar entre ela e
  // a posição afastada, e sem o original não há como voltar.
  piecesAssembly.group.children.forEach((c) => {
    if (!c.userData.__pos0) c.userData.__pos0 = c.position.clone();
  });
  piecesViewer.render(asm, null, null);
  aplicaExplosao();
}

function aplicaExplosao() {
  const range = document.getElementById('po-pieces-explode');
  if (!piecesAssembly || !piecesAssembly.group || typeof THREE === 'undefined') return;
  const f = (Number(range && range.value) || 0) / 100;
  const h = (piecesAssembly.height_m || 0) / 2;
  piecesAssembly.group.children.forEach((c) => {
    const p0 = c.userData.__pos0;
    if (!p0) return;
    // Direção: do centro do módulo pra peça. Peça que nasce no centro exato
    // (fundo, por ex.) recebe um empurrão pra trás, senão ficaria parada
    // dentro da nuvem e escondida.
    const dir = new THREE.Vector3(p0.x, p0.y - h, p0.z);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    c.position.copy(p0).addScaledVector(dir, f * 0.55);
  });
}

// ATENÇÃO À ORDEM NO HTML: esta função roda no carregamento do portal.js e
// precisa que o modal JÁ EXISTA no documento. Eu tinha inserido o markup do
// modal DEPOIS das tags <script> — os getElementById devolviam null, nenhum
// listener era ligado, e o resultado foi "o Explodir não mexe e o X não fecha,
// a tela trancou". Os dois sintomas, uma causa só. O bloco do modal agora fica
// antes dos scripts; qualquer tela nova precisa nascer lá também.
(function ligaPecasDoMovel() {
  const b = document.getElementById('po-proj-slot-pieces-btn');
  if (b) {
    b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (selectedProjectSlotId != null) openProjectSlotPieces(selectedProjectSlotId);
    });
  }
  // Três saídas pra fechar: o ×, o fundo e Esc. Tela sem saída óbvia é tela
  // trancada — e o × sozinho já falhou uma vez.
  const modal = document.getElementById('po-pieces-modal');
  const fecha = () => { if (modal) modal.classList.remove('open'); };
  const fechar = document.getElementById('po-pieces-close');
  if (fechar) fechar.addEventListener('click', fecha);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) fecha(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('open')) fecha();
  });
  const range = document.getElementById('po-pieces-explode');
  if (range) range.addEventListener('input', aplicaExplosao);

  // Remover/restaurar/trocar cor por peça (2026-08-20) — delegado no
  // container em vez de um listener por linha: a tabela inteira é
  // reconstruída (innerHTML) a cada ação, então listener por linha vazaria
  // (o elemento antigo morre, mas closures acumulam) ou precisaria ser
  // religado toda vez. Delegado, liga uma vez só aqui.
  const lista = document.getElementById('po-pieces-list');
  if (lista) {
    lista.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-piece-action]');
      if (!btn || !lista.contains(btn)) return;
      const slot = projectSlots.find((s) => s.id === piecesModalSlotId);
      if (!slot) return;
      const pieceId = btn.getAttribute('data-piece-id');
      if (btn.getAttribute('data-piece-action') === 'remove') removeProjectSlotPiece(slot, pieceId);
      else if (btn.getAttribute('data-piece-action') === 'restore') restoreProjectSlotPiece(slot, pieceId);
    });
    lista.addEventListener('change', (e) => {
      const sel = e.target.closest('select.po-piece-color-select');
      if (!sel || !lista.contains(sel)) return;
      const slot = projectSlots.find((s) => s.id === piecesModalSlotId);
      if (!slot) return;
      const pieceId = sel.getAttribute('data-piece-id');
      const roleId = sel.getAttribute('data-role-id');
      const colors = (slot.colorOptionsByRole && slot.colorOptionsByRole[roleId]) || [];
      const color = colors.find((c) => c.id === sel.value);
      if (color) setProjectSlotPieceColor(slot, pieceId, roleId, color);
    });
  }
})();

const projSlotReplaceBtn = document.getElementById('po-proj-slot-replace-btn');
if (projSlotReplaceBtn) {
  projSlotReplaceBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  projSlotReplaceBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (selectedProjectSlotId == null) return;
    projectReplaceSlotId = selectedProjectSlotId;
    openProjectSearchModal();
  });
}

const projSlotRemoveBtn = document.getElementById('po-proj-slot-remove-btn');
if (projSlotRemoveBtn) {
  projSlotRemoveBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  projSlotRemoveBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (selectedProjectSlotId != null) removeProjectSlot(selectedProjectSlotId);
  });
}
