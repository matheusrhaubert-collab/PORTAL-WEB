// portal-06a-projetos-canvas-core.js — 1/3 do que era portal-06-projetos-canvas.js
// (quebrado de novo em 2026-08-20 — o arquivo original tinha recrescido pra
// 312KB/6049 linhas em 1 dia desde a quebra de 19/08; ver
// portal_js_monolito_performance na memória do projeto).
// Aba "Projetos": desfazer (histórico de undo) e arrastar módulo da
// biblioteca pro canvas e soltar.
// Carrega depois de portal-05-cutlist.js e ANTES de
// portal-06b-projetos-canvas-ia-custo.js — mesmo escopo global (script
// clássico), a ordem entre os 3 pedaços que eram portal-06 importa.

// Alterações não salvas (pedido do usuário 2026-07-29) — true a partir da
// primeira edição de verdade (mover/redimensionar/trocar cor/forma da
// parede/adicionar/remover módulo), false de novo só ao salvar
// (saveProjectFavorite) ou carregar/resetar um projeto (restoreFavoriteProject/
// resetProject). Usado pra avisar antes de trocar de aba com edição perdida
// (ver o listener de .portal-tab-btn, mais abaixo no arquivo).
let projectDirty = false;
function markProjectDirty() {
  projectDirty = true;
  // Indicador verde de "salvo" (2026-08-28) — markProjectDirty é o MESMO
  // ponto único citado no comentário do Desfazer logo abaixo, então é o
  // gancho natural pra apagar o "✓ Salvo" também, sem duplicar em ~20
  // call-sites. Ver refreshProjectSaveIndicator em portal-09-projetos-final.js
  // (carrega DEPOIS deste arquivo, mas a chamada só acontece em uso real do
  // usuário, bem depois de todo <script> já ter carregado — mesmo padrão já
  // usado noutras pontes entre estes arquivos, ex. getProjectWallWidthMm).
  if (typeof refreshProjectSaveIndicator === 'function') refreshProjectSaveIndicator();
  // Desfazer (2026-08-08) — markProjectDirty já é o ponto por onde TODA
  // alteração real do projeto passa (é uma regra do arquivo, ver memória:
  // "novo ponto de mutação precisa lembrar de chamar markProjectDirty"), então
  // é o gancho natural do histórico em vez de espalhar um pushUndo() por ~20
  // call-sites. Ver pushProjectUndoState.
  pushProjectUndoState();
}

// ==========================================================================
// DESFAZER (botão "Voltar") — 2026-08-08
// ==========================================================================
// Pedido do usuário: "colocar botao voltar nas modificacoes do projeto".
//
// COMO FUNCIONA, e por que não é um "pushUndo() antes de cada mutação":
// markProjectDirty() roda DEPOIS da alteração, não antes — então não dá pra
// tirar a foto do estado anterior de dentro dele. A saída é manter uma
// "linha de base" (projectUndoBaseline) com a foto do estado ATUAL, sempre
// atualizada: quando uma alteração acontece, a baseline ainda guarda o mundo
// de ANTES — é ela que vai pra pilha, e só então uma foto nova é tirada.
//
// COALESCÊNCIA: esticar um módulo arrastando dispara markProjectDirty a cada
// pointermove (updateProjectSlotDimension re-renderiza a cada frame). Sem
// agrupar, um único gesto encheria a pilha de dezenas de passos e o botão
// Voltar andaria 1 pixel por clique. Alterações separadas por menos de
// PROJECT_UNDO_COALESCE_MS contam como UM passo: a baseline avança, mas nada
// novo é empilhado — o topo da pilha continua sendo o estado de antes do
// gesto inteiro.
//
// A foto NÃO passa por serializeProjectSlots/restore (que refaz busca de
// peças/cores no banco, é async e troca de aba): clona só os campos MUTÁVEIS
// de cada slot e compartilha por referência o que é catálogo imutável
// (module/pieces/colorOptionsByRole/hingeModel/slideModel). Resultado: desfazer
// é instantâneo e não toca a rede.
const PROJECT_UNDO_MAX = 40;
const PROJECT_UNDO_COALESCE_MS = 600;
let projectUndoStack = [];
let projectUndoBaseline = null;
let projectUndoLastPushAt = 0;

function cloneProjectSlotForUndo(slot) {
  return {
    ...slot,
    // Containers MUTADOS NO LUGAR em algum ponto do arquivo (push/atribuição
    // por índice/chave) — precisam de cópia própria, senão a foto mudaria
    // junto com o original e o desfazer não desfaria nada.
    selectedColors: (slot.selectedColors || []).map((c) => ({ ...c })),
    colorsByRole: { ...(slot.colorsByRole || {}) },
    shelfQuantities: { ...(slot.shelfQuantities || {}) },
    dimOverrides: { ...(slot.dimOverrides || {}) },
    pieceColorOverrides: JSON.parse(JSON.stringify(slot.pieceColorOverrides || {})),
    // Árvore do construtor: é MUTADA no lugar (o motor mexe nos nós), então
    // precisa de cópia funda — sem isso a foto do desfazer andaria junto.
    layout: slot.layout ? JSON.parse(JSON.stringify(slot.layout)) : null,
    selectedOptionalIds: (slot.selectedOptionalIds || []).slice(),
    // removedPieceIds (2026-08-20): mesmo motivo de selectedOptionalIds acima
    // — array mutado no lugar (push/splice ao remover/restaurar peça no modal
    // "Peças do móvel"), precisa de cópia própria pro desfazer e pra
    // duplicateProjectSlot (que reusa esta função) não compartilharem array.
    removedPieceIds: (slot.removedPieceIds || []).slice(),
    widthPresetsMm: (slot.widthPresetsMm || []).slice(),
    heightPresetsMm: (slot.heightPresetsMm || []).slice()
  };
}

function projectUndoSnapshot() {
  return {
    slots: projectSlots.map(cloneProjectSlotForUndo),
    wallShape: projectWallShape,
    wallWidthsMm: projectWallWidthsMm.slice(),
    activeWallIndex: projectActiveWallIndex,
    selectedSlotId: selectedProjectSlotId
  };
}

function pushProjectUndoState() {
  const now = Date.now();
  if (projectUndoBaseline) {
    if (now - projectUndoLastPushAt >= PROJECT_UNDO_COALESCE_MS) {
      projectUndoStack.push(projectUndoBaseline);
      if (projectUndoStack.length > PROJECT_UNDO_MAX) projectUndoStack.shift();
      projectUndoLastPushAt = now;
    }
  } else {
    // Primeiríssima alteração desta sessão de edição sem baseline (não
    // deveria acontecer — resetProjectUndo tira a foto inicial —, mas se
    // acontecer é melhor não ter passo nenhum do que empilhar lixo).
    projectUndoLastPushAt = now;
  }
  projectUndoBaseline = projectUndoSnapshot();
  refreshProjectUndoButton();
}

// Zera o histórico e tira a foto inicial — chamado quando o projeto TROCA por
// inteiro (carregar da lista, resetar, restaurar da galeria): o que veio antes
// não é mais "alteração deste projeto", é outro projeto.
function resetProjectUndo() {
  projectUndoStack = [];
  projectUndoLastPushAt = 0;
  projectUndoBaseline = projectUndoSnapshot();
  refreshProjectUndoButton();
}

function refreshProjectUndoButton() {
  const btn = document.getElementById('po-proj-undo-btn');
  if (btn) btn.disabled = projectUndoStack.length === 0;
}

function undoProjectChange() {
  const prev = projectUndoStack.pop();
  if (!prev) return;
  projectSlots = prev.slots.map(cloneProjectSlotForUndo);
  projectWallShape = prev.wallShape;
  projectWallWidthsMm = prev.wallWidthsMm.slice();
  projectActiveWallIndex = Math.min(prev.activeWallIndex, getProjectWallCount() - 1);
  selectedProjectSlotId = prev.slots.some((s) => s.id === prev.selectedSlotId) ? prev.selectedSlotId : null;

  // A foto volta a ser o estado restaurado, e o relógio da coalescência é
  // zerado — a PRÓXIMA alteração vira um passo novo na hora, sem ser
  // agrupada com o que veio antes do desfazer.
  projectUndoBaseline = projectUndoSnapshot();
  projectUndoLastPushAt = 0;

  persistProjectWallConfig();
  refreshProjectWallShapeButtons();
  refreshProjectWallTabs();
  refreshProjectWallWidthInput();
  project3DLastFitKey = null; // o ambiente pode ter mudado de forma — reenquadra
  renderProjectCanvas();
  renderProjectConfigPanel();
  refreshProjectUndoButton();
  projectDirty = true; // desfazer também é uma diferença em relação ao que está salvo
  if (typeof refreshProjectSaveIndicator === 'function') refreshProjectSaveIndicator();
}

// Alternância Frontal/Superior do canvas 2D (pedido do usuário, 2026-07-24:
// "temos visao frontal. quero uma visao de cima, paralela, com um botao em
// cima pra trocar de superior pra frontal"). 'front' = vista de sempre
// (arrastável); 'top' = vista de cima, só leitura — ver renderProjectCanvas/
// renderProjectCanvasTop mais abaixo.
let projectViewMode = 'front';
function newProjectSlotId() {
  projectSlotIdSeq += 1;
  return `pslot_${Date.now()}_${projectSlotIdSeq}`;
}

// Largura do ambiente — único dado de "sala" que a Composição não tinha
// (ela nunca desenhou parede, só empilhava em coluna sem largura total
// travada). Altura útil/rodapé continuam vindo de roomSettings (⚙ no topo,
// ver CEILING_CLEARANCE_MM/roomSettings acima) — mesma regra de sempre.
const PROJECT_WALL_WIDTH_DEFAULT_MM = 3000; // 3m, chute razoável de parede
const PROJECT_WALL_WIDTH_MIN_MM = 300;
const PROJECT_WALL_WIDTH_MAX_MM = 15000;

// Forma da parede (pedido do usuário, 2026-07-25: "quero criar uma opcao no
// projects, para fazer parede simples, parede dupla, e parede em C ou U.
// porem a visao sempre sera frontal da parede em que se esta editando os
// moveis") — cada forma é uma lista de PAPÉIS de parede, sempre na mesma
// ordem em que aparecem nas abas/tabs (ver refreshProjectWallTabs). A
// EDIÇÃO (arrastar/esticar/adicionar módulo) sempre acontece numa parede só
// por vez, a "ativa" (projectActiveWallIndex) — a vista frontal nunca muda
// disso, só a Vista Superior e o Visualizar 3D é que desenham as 2-3
// paredes juntas na geometria real (90°, ver getProjectWallGeometry em
// generateProject3D/renderProjectCanvasTop).
//
// Convenção geométrica (canto sempre reto/90°, confirmado com o usuário):
// 'main' é a parede de fundo, sempre centrada em X=0 (idêntica à parede
// única de sempre) — 'left'/'right' são as paredes-retorno, presas nas
// pontas esquerda/direita de 'main', esticando pra FORA da parede de fundo
// (em direção a quem olha o ambiente).
const PROJECT_WALL_ROLES_BY_SHAPE = {
  single: ['main'],
  double: ['main', 'right'],
  u: ['left', 'main', 'right']
};

let projectWallShape = 'single';
// PAREDES DESENHADAS (2026-08-13) — a lista de segmentos do editor de planta
// baixa. Vazia = projeto no modelo antigo (as 3 formas fixas), e tudo se
// comporta como sempre.
//
// A DECLARAÇÃO PRECISA FICAR AQUI, junto do resto do estado de parede, e não
// perto das funções que a usam lá embaixo: `let` tem zona morta temporal, e
// refreshProjectWallTabs() é CHAMADA no topo do arquivo durante o
// carregamento. Com a declaração lá embaixo, essa chamada explodia
// ("Cannot access before initialization"), o portal.js morria no meio e a
// página inteira ficava sem Supabase — foi o "não abre projetos / sem conexão
// com banco" de 2026-08-13.
const PROJECT_WALL_THICKNESS_MM = 150;
const PROJECT_WALL_DEFAULT_LEN_MM = 4000;   // 4m (2026-08-13, pedido do Matt)
// JÁ NASCE COM O PADRÃO (2026-08-13). Antes começava vazia e só ganhava as
// paredes no "↺ Novo projeto" — então um F5 caía no modelo antigo (uma parede
// derivada de projectWallShape) e o ambiente aparecia diferente do padrão
// combinado. Abrir um projeto salvo continua sobrescrevendo isto: com as
// paredes dele, se ele tiver; com [] se for do modelo antigo.
// newProjectWallSegmentId/defaultProjectWallSegments precisam estar
// DEFINIDAS AQUI (não mais lá embaixo, como no antigo portal.js monolítico,
// onde "function é hoisted" bastava). Desde a quebra em 9 arquivos
// (2026-08-19, ver memória do projeto) cada portal-0N-*.js é um <script>
// clássico SEPARADO, e hoisting de function só vale DENTRO do próprio
// script — a versão que morava no portal-08-projetos-paredes.js (que
// carrega DEPOIS deste arquivo) ainda não existia quando esta linha rodava:
// ReferenceError aqui embaixo, portal-06 abortava no meio da execução, e os
// `let` declarados MAIS ABAIXO no arquivo (projectAiFunctions,
// projectDrillingsByComponent) ficavam pra sempre em zona morta temporal —
// "Cannot access before initialization" toda vez que loadModules()/
// loadProjectAiConfig() tentavam usá-los, na aba Projetos inteira. Foi o
// "sem acesso ao ambiente de projetos, nem no site nem no local" de
// 2026-08-19.
function newProjectWallSegmentId() {
  return 'wseg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

// Padrão de projeto novo: duas paredes de 3m formando um canto, com o piso
// 3x3 que elas delimitam. Em L, com o canto na origem — é o ambiente que o
// Matt pediu como ponto de partida.
function defaultProjectWallSegments() {
  const L = PROJECT_WALL_DEFAULT_LEN_MM;
  // O L NASCE CENTRADO NA ORIGEM (2026-08-13). O enquadramento automático da
  // Vista de Canto olha a caixa delimitadora do ambiente pela bissetriz das
  // paredes; com o canto na origem e as duas pontas simétricas, a cena abre
  // com o canto no meio da tela e as duas paredes iguais — que é o
  // enquadramento que o Matt pediu ("a câmera bem no meio, dessa forma").
  // Com o L começando em x=0 ele nascia deslocado pra um lado.
  const h = L / 2;
  return [
    // Parede do fundo: da esquerda pra direita, atrás (z = -h).
    { id: newProjectWallSegmentId(), ax: -h, az: -h, bx: h, bz: -h, thicknessMm: PROJECT_WALL_THICKNESS_MM, ceilingMm: null },
    // Parede da direita: do fundo pra frente, saindo da ponta B da 1ª.
    { id: newProjectWallSegmentId(), ax: h, az: -h, bx: h, bz: h, thicknessMm: PROJECT_WALL_THICKNESS_MM, ceilingMm: null }
  ];
}
let projectWallSegments = defaultProjectWallSegments();
// Slot que o botão ⇄ (substituir módulo) está esperando trocar. Mesma regra de
// posição: é lido por closeProjectSearchModal e pelo clique do card da busca,
// que ficam ANTES no arquivo.
let projectReplaceSlotId = null;
let projectWallWidthsMm = [PROJECT_WALL_WIDTH_DEFAULT_MM]; // 1 largura por parede, mesma ordem de PROJECT_WALL_ROLES_BY_SHAPE[projectWallShape]
let projectActiveWallIndex = 0; // qual parede está sendo editada na vista Frontal agora

function persistProjectWallConfig() {
  try {
    localStorage.setItem('legno_project_wall_shape', projectWallShape);
    localStorage.setItem('legno_project_wall_widths_mm', JSON.stringify(projectWallWidthsMm));
  } catch (e) { /* ok sem persistir */ }
}

try {
  const savedShape = localStorage.getItem('legno_project_wall_shape');
  if (savedShape && PROJECT_WALL_ROLES_BY_SHAPE[savedShape]) projectWallShape = savedShape;
  const savedWidths = JSON.parse(localStorage.getItem('legno_project_wall_widths_mm') || 'null');
  if (Array.isArray(savedWidths) && savedWidths.length) {
    projectWallWidthsMm = savedWidths.map((w) => clamp(Number(w) || PROJECT_WALL_WIDTH_DEFAULT_MM, PROJECT_WALL_WIDTH_MIN_MM, PROJECT_WALL_WIDTH_MAX_MM));
  } else {
    // Migra o valor ANTIGO (legno_project_wall_width_mm, de antes desta
    // funcionalidade existir) — só faz sentido pra 'single', que é o shape
    // padrão de qualquer sessão que ainda não tenha a chave nova.
    const legacyWidth = Number(localStorage.getItem('legno_project_wall_width_mm'));
    if (legacyWidth > 0) projectWallWidthsMm = [clamp(legacyWidth, PROJECT_WALL_WIDTH_MIN_MM, PROJECT_WALL_WIDTH_MAX_MM)];
  }
  const roleCount = PROJECT_WALL_ROLES_BY_SHAPE[projectWallShape].length;
  while (projectWallWidthsMm.length < roleCount) projectWallWidthsMm.push(PROJECT_WALL_WIDTH_DEFAULT_MM);
  projectWallWidthsMm = projectWallWidthsMm.slice(0, roleCount);
} catch (e) { /* ok sem persistir */ }

function getProjectWallRoles() { return PROJECT_WALL_ROLES_BY_SHAPE[projectWallShape] || ['main']; }

// QUANTAS PAREDES O AMBIENTE TEM, DE VERDADE (2026-08-18).
//
// Esta funcao devolvia o tamanho de getProjectWallRoles(), que sai de
// PROJECT_WALL_ROLES_BY_SHAPE[projectWallShape] — o sistema ANTIGO de formas
// fixas (uma parede / dupla / C-U), aposentado em 2026-08-13 quando as
// paredes viraram planta desenhada (projectWallSegments / "Ajustar paredes").
// projectWallShape continua 'single' pra sempre num projeto novo, entao a
// contagem vinha 1 mesmo com o L de duas paredes que todo projeto novo ja
// nasce tendo (ver defaultProjectWallSegments).
//
// Era a mesma armadilha de getProjectWallWidthMm (2026-08-14, "PAREDE
// DESENHADA VENCE"): quem le parede tem que ler o DESENHO, nao a forma
// legada. O sintoma de hoje foi o Matt abrir o portal e cair na vista frontal
// 2D chapada — `getProjectWallCount() > 1` dava falso. E era so a ponta:
//   - generateProject3D / renderProjectForAiSnapshot caiam no renderFreeform
//     de UMA parede, ignorando as outras no "Visualizar 3D" e na foto de IA;
//   - o snapshot da IA/miniatura usava {frontal:true} (camera quase de frente,
//     pensada pra 1 parede) em vez de {angle:'corner'};
//   - layoutProjectAiItems so percorria a parede 0;
//   - o clamp de parede ativa do desfazer prendia tudo em 0.
//
// PROJECT_WALL_ROLES_BY_SHAPE continua servindo pro projeto salvo no modelo
// velho (sem wall_segments): la projectWallSegments fica vazio e o caminho e
// exatamente o de antes.
function getProjectWallCount() {
  if (projectWallSegments.length) return projectWallSegments.length;
  return getProjectWallRoles().length;
}

// wallIndex omitido = parede ATIVA (mantém 100% compatível com todo
// call-site antigo de antes desta funcionalidade, que só conhecia 1 parede).
//
// PAREDE DESENHADA VENCE (2026-08-14). Esta função nunca soube que
// projectWallSegments existe — sempre voltou o número travado em
// projectWallWidthsMm, que só o sistema antigo (single/double/U) escreve.
// Desde a "Ajustar paredes" (2026-08-13) o comprimento de verdade é o das
// pontas do segmento (ax/az/bx/bz), e esticar uma parede lá não atualiza
// projectWallWidthsMm nenhuma — quem chamava getProjectWallWidthMm (clamp de
// módulo, posição-padrão, ímã) continuava lendo o comprimento de ANTES do
// esticamento. Resultado: o módulo parava curto do canto de verdade, um
// "buraco invisível" (bug do Matt, 2026-08-14) sem nada de errado visível na
// parede em si — só na conta de até onde o módulo podia ir.
function getProjectWallWidthMm(wallIndex) {
  const idx = (typeof wallIndex === 'number') ? wallIndex : projectActiveWallIndex;
  if (projectWallSegments.length) {
    const seg = projectWallSegments[idx];
    if (seg) return Math.hypot(seg.bx - seg.ax, seg.bz - seg.az);
  }
  return projectWallWidthsMm[idx] || PROJECT_WALL_WIDTH_DEFAULT_MM;
}

// ---------- Módulo de PAREDE vs módulo ILHA (solto no chão) ----------
// Pedido do usuário (2026-08-08): "O modulo deve estar ligado a uma parede ou
// ao chao". Até aqui TODO slot pertencia obrigatoriamente a uma parede
// (wall_index + x_mm ao longo dela + floor_height_mm de altura). Agora um slot
// pode ter placement='floor': ele não pertence a parede nenhuma e sua posição
// é em coordenadas de MUNDO no piso — floor_x_mm/floor_z_mm (mesmo referencial
// do 3D: X=0 no meio da parede 'main', Z=0 no plano dela, Z cresce pra dentro
// do ambiente) + floor_rotation_deg (giro próprio em torno do eixo vertical).
//
// placement ausente = 'wall' em TODO lugar (projeto salvo antes desta
// funcionalidade continua abrindo igual, sem migration nenhuma — os slots já
// eram um JSON solto na coluna user_projects.slots, ver serializeProjectSlots).
function isFloorSlot(slot) {
  return !!slot && slot.placement === 'floor';
}
function projectFloorSlots() {
  return projectSlots.filter(isFloorSlot);
}
function projectSlotsOnWall(wallIndex) {
  return projectSlots.filter((s) => !isFloorSlot(s) && Number(s.wall_index || 0) === wallIndex);
}
// Mesma parede do slot dado, excluindo ele mesmo — substitui os antigos
// `projectSlots.filter((s) => s.id !== slot.id)` espalhados pelo arraste/
// snap/profundidade: com múltiplas paredes, "outro módulo" só deve contar
// os que estão na MESMA parede (imã/sobreposição/z_order não fazem sentido
// entre paredes fisicamente diferentes). Módulo ILHA nunca entra nessa conta
// (não está em parede nenhuma) — colisão de ilha é tratada em 2D no piso, ver
// clampFloorSlotAgainstCollision.
function projectSlotsSameWallExcluding(slot) {
  if (isFloorSlot(slot)) return [];
  const wallIndex = Number(slot.wall_index || 0);
  return projectSlots.filter((s) => !isFloorSlot(s) && s.id !== slot.id && Number(s.wall_index || 0) === wallIndex);
}

// PAPEL vs. NÚMERO (2026-08-18). Os papéis 'main'/'left'/'right' vêm das 3
// formas fixas de ambiente, aposentadas em 13/08. Com planta desenhada, o
// papel do segmento 1+ é 'seg1', 'seg2'... — chaves que não existem no
// dicionário, e I18n.t devolve a própria chave quando não acha: o cliente
// veria "project.wall_role_seg1" escrito na tela.
// Agora: papel conhecido vira nome ("lateral esquerda"); qualquer outro (ou
// nenhum) cai no NÚMERO da parede, que é como o editor de paredes já a
// identifica.
const PROJECT_WALL_ROLES_CONHECIDOS = ['main', 'left', 'right'];
function projectWallRoleLabel(role, idx) {
  if (PROJECT_WALL_ROLES_CONHECIDOS.indexOf(role) >= 0 && !projectWallSegments.length) {
    return I18n.t('project.wall_role_' + role);
  }
  return I18n.t('project.wall_numbered', { n: Number(idx || 0) + 1 });
}

function refreshProjectWallWidthInput() {
  const input = document.getElementById('po-proj-wall-width-input');
  const unitLabel = document.getElementById('po-proj-wall-width-unit');
  const labelEl = document.getElementById('po-proj-wall-width-label');
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const widthMm = getProjectWallWidthMm(projectActiveWallIndex);
  if (input && document.activeElement !== input) input.value = formatDimensionNumber(widthMm, unit);
  if (unitLabel) unitLabel.textContent = unitAbbrev(unit);
  if (labelEl) {
    const roles = getProjectWallRoles();
    // getProjectWallCount(), não roles.length: com planta desenhada os papéis
    // legados continuam sendo 1 só (ver get_project_wall_count_ignorava_planta).
    labelEl.textContent = getProjectWallCount() > 1
      ? (projectWallSegments.length
        ? I18n.t('project.wall_width_label_numbered', { n: projectActiveWallIndex + 1 })
        : I18n.t('project.wall_width_label_multi', { n: projectActiveWallIndex + 1, role: projectWallRoleLabel(roles[projectActiveWallIndex], projectActiveWallIndex) }))
      : I18n.t('project.wall_width_label');
  }
}
refreshProjectWallWidthInput();
// Foto inicial do histórico de desfazer. Roda AQUI (e não junto da definição
// de resetProjectUndo, lá em cima) porque a foto lê projectWallShape/
// projectWallWidthsMm/projectActiveWallIndex — que só existem a partir deste
// ponto do arquivo. Sem esta chamada, a PRIMEIRA alteração de cada sessão não
// teria estado anterior guardado e ficaria impossível de desfazer.
resetProjectUndo();

function refreshProjectWallShapeButtons() {
  [
    ['single', document.getElementById('po-proj-wall-shape-single-btn')],
    ['double', document.getElementById('po-proj-wall-shape-double-btn')],
    ['u', document.getElementById('po-proj-wall-shape-u-btn')]
  ].forEach(([shape, btn]) => { if (btn) btn.classList.toggle('active', projectWallShape === shape); });
}
refreshProjectWallShapeButtons();

function refreshProjectWallTabs() {
  const wrap = document.getElementById('po-proj-wall-tabs');
  if (!wrap) return;
  // Com paredes desenhadas, as ABAS DE PAREDE saem da faixa (2026-08-13): a
  // parede ativa passa a ser escolhida clicando nela no desenho, e uma lista
  // de "Parede 1 / Parede 2 / Parede 3..." cresceria sem limite conforme o
  // ambiente. A função continua inteira pro modelo antigo de 3 formas.
  if (projectWallSegments.length) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  const roles = getProjectWallRoles();
  if (roles.length <= 1) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = '';
  roles.forEach((role, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'po-proj-wall-tab-btn' + (idx === projectActiveWallIndex ? ' active' : '');
    btn.textContent = I18n.t('project.wall_tab_label', { n: idx + 1, role: projectWallRoleLabel(role, idx) });
    btn.addEventListener('click', () => setProjectActiveWallIndex(idx));
    wrap.appendChild(btn);
  });
}
refreshProjectWallTabs();

function setProjectActiveWallIndex(idx) {
  // Limite pela contagem REAL de paredes (getProjectWallCount, que respeita a
  // planta desenhada) — nao por roles.length. Com a forma legada travada em
  // 'single', roles.length era 1 e trocar pra parede 2/3 de um ambiente
  // desenhado era silenciosamente recusado aqui.
  if (idx < 0 || idx >= getProjectWallCount() || idx === projectActiveWallIndex) return;
  projectActiveWallIndex = idx;
  refreshProjectWallTabs();
  refreshProjectWallWidthInput();
  renderProjectCanvas();
}

// Troca a FORMA da parede (simples/dupla/C-U) — pedido do usuário: um botão
// pra escolher. Módulos já colocados nunca somem: se a parede que eles
// estavam deixa de existir na forma nova (ex.: 'left' ao encolher de C/U
// pra dupla ou simples), eles migram pra 'main'. Larguras são preservadas
// por PAPEL (não por índice) — trocar de simples pra dupla mantém a largura
// da parede de fundo e só a lateral nova nasce no tamanho padrão.
function setProjectWallShape(newShape) {
  if (!PROJECT_WALL_ROLES_BY_SHAPE[newShape] || newShape === projectWallShape) return;
  const oldRoles = getProjectWallRoles();
  const newRoles = PROJECT_WALL_ROLES_BY_SHAPE[newShape];
  const oldWidths = projectWallWidthsMm.slice();

  projectSlots.forEach((slot) => {
    if (isFloorSlot(slot)) return; // ilha não pertence a parede nenhuma
    const role = oldRoles[Number(slot.wall_index || 0)] || 'main';
    let newIdx = newRoles.indexOf(role);
    if (newIdx < 0) newIdx = newRoles.indexOf('main');
    if (newIdx < 0) newIdx = 0;
    slot.wall_index = newIdx;
  });

  projectWallWidthsMm = newRoles.map((role) => {
    const oldIdx = oldRoles.indexOf(role);
    return oldIdx >= 0 ? oldWidths[oldIdx] : PROJECT_WALL_WIDTH_DEFAULT_MM;
  });
  projectWallShape = newShape;
  const mainIdx = newRoles.indexOf('main');
  projectActiveWallIndex = mainIdx >= 0 ? mainIdx : 0;

  persistProjectWallConfig();
  refreshProjectWallShapeButtons();
  refreshProjectWallTabs();
  refreshProjectWallWidthInput();
  renderProjectCanvas();
  markProjectDirty();
}

const projWallShapeSingleBtn = document.getElementById('po-proj-wall-shape-single-btn');
if (projWallShapeSingleBtn) projWallShapeSingleBtn.addEventListener('click', () => setProjectWallShape('single'));
const projWallShapeDoubleBtn = document.getElementById('po-proj-wall-shape-double-btn');
if (projWallShapeDoubleBtn) projWallShapeDoubleBtn.addEventListener('click', () => setProjectWallShape('double'));
const projWallShapeUBtn = document.getElementById('po-proj-wall-shape-u-btn');
if (projWallShapeUBtn) projWallShapeUBtn.addEventListener('click', () => setProjectWallShape('u'));

// Muda a largura de UMA parede programaticamente (usado tanto pelo campo
// numérico quanto pelas setinhas de arrastar na própria parede, ver
// attachProjectWallResizeHandle abaixo) — wallIndex omitido = parede ATIVA.
// shiftModulesFromLeft=true (handle ESQUERDO) desloca todo módulo já
// colocado NESSA MESMA parede pelo mesmo delta, pra manterem a distância da
// parede DIREITA — "esticar pela esquerda" deve abrir espaço à esquerda dos
// módulos existentes, não empurrar tudo pra dentro da parede nova. O handle
// DIREITO não precisa disso: x_mm já é medido a partir da parede esquerda,
// que não se move.
function setProjectWallWidthMm(newWidthMm, shiftModulesFromLeft, wallIndex) {
  const idx = (typeof wallIndex === 'number') ? wallIndex : projectActiveWallIndex;
  const current = getProjectWallWidthMm(idx);
  const clamped = clamp(newWidthMm, PROJECT_WALL_WIDTH_MIN_MM, PROJECT_WALL_WIDTH_MAX_MM);
  const delta = clamped - current;
  if (shiftModulesFromLeft && delta !== 0) {
    projectSlots.forEach((s) => {
      if (Number(s.wall_index || 0) !== idx) return;
      s.x_mm = Math.max(0, Number(s.x_mm || 0) + delta);
    });
  }
  projectWallWidthsMm[idx] = clamped;
  persistProjectWallConfig();
  refreshProjectWallWidthInput();
  renderProjectCanvas();
}

// Setinhas na própria parede (pedido do usuário, 2026-07-21: "uma setinha na
// parede pra esticar ela pro lado direito e esquerdo... assim como nos
// móveis") — recriadas a cada renderProjectCanvas() (mesmo padrão do
// baseboard/linha do teto), então recebe o elemento já criado em vez de
// buscar por id.
// BUG CORRIGIDO (mesmo dia): o handle recebia setPointerCapture, mas
// setProjectWallWidthMm chama renderProjectCanvas() a cada pointermove, que
// faz canvas.innerHTML='' e recria os handles do zero — o elemento que
// tinha capturado o ponteiro é destruído no meio do arraste, então só o
// 1º pointermove funcionava e depois o arraste "morria" (sem eventos de
// move/up chegando mais). Correção: estado de arraste vira uma variável
// MÓDULO (projectWallDragState), e pointermove/pointerup/pointercancel
// ficam no `document` (registrados uma única vez, nunca destruídos) — só o
// pointerdown continua no próprio handle (refeito a cada render, mas só
// precisa disparar uma vez pra ligar o estado). Mesmo padrão usado abaixo
// pras novas setinhas de esticar módulo (projectResizeDragState).
let projectWallDragState = null; // { isRightHandle, startX, startWidthMm }
let projectResizeDragState = null; // { slotId, axis, startX, startY, startWidthMm, startHeightMm }

function attachProjectWallResizeHandle(handleEl, isRightHandle) {
  handleEl.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation(); // não deixa isso ser interpretado como clique/drag de módulo
    projectWallDragState = { isRightHandle, startX: ev.clientX, startWidthMm: getProjectWallWidthMm(projectActiveWallIndex), wallIndex: projectActiveWallIndex };
    handleEl.classList.add('dragging');
  });
}

// Setinhas de esticar CADA MÓDULO (pedido do usuário, 2026-07-21: "os
// modulos estao sem a setinha... quero que eles estiquem da mesma forma") —
// esquerda/direita mexem na largura (esquerda também desloca x_mm, pra
// crescer mantendo a borda DIREITA no lugar — mesma lógica de
// setProjectWallWidthMm com shiftModulesFromLeft), topo mexe na altura
// (cresce pra CIMA, base/floor_height_mm não muda — mesmo raciocínio: o
// lado que NÃO tem handle fica ancorado).
function attachProjectSlotResizeHandle(handleEl, slot, axis) {
  handleEl.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation(); // não deixa virar um drag de MOVER o módulo (attachProjectSlotDrag no div pai)
    projectResizeDragState = {
      slotId: slot.id,
      axis,
      startX: ev.clientX,
      startY: ev.clientY,
      startXMm: Number(slot.x_mm || 0),
      startWidthMm: Number(slot.width_mm || 0),
      startHeightMm: Number(slot.height_mm || 0)
    };
    handleEl.classList.add('dragging');
  });

  // DUPLO clique na setinha: estica até encostar no vizinho (2026-08-08 — o
  // pedido veio marcado como AMBOS, então vale também aqui na vista Frontal 2D
  // de parede única, não só nas setas 3D). Aqui dá pra usar o 'dblclick'
  // nativo: o alvo é um elemento DOM de verdade (na cena 3D não é, por isso lá
  // a detecção é na mão). O pointerdown acima já terá armado um arraste; como
  // o ponteiro não se moveu, esse arraste não mudou nada — cancelar aqui evita
  // que o pointerup seguinte o dê por concluído por cima do esticão.
  handleEl.addEventListener('dblclick', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    projectResizeDragState = null;
    handleEl.classList.remove('dragging');
    stretchProjectSlotToCollision(slot, axis);
  });
}

// Largura crescendo a partir da borda ESQUERDA — a borda DIREITA fica
// ancorada (x_mm recuando pra compensar), o oposto do
// updateProjectSlotDimension normal (que só mexe em width_mm, ancorado na
// esquerda — usado pela borda direita e pelo painel de config).
function updateProjectSlotWidthFromLeft(slot, newWidthMm) {
  const m = slot.module;
  // Largura TRAVADA (m.width_locked) — pula pro valor cadastrado
  // (widthPresetsMm) mais próximo do que o arraste pediu, em vez de aceitar
  // qualquer valor contínuo entre min/max (mesma regra de updateProjectSlotDimension,
  // ver comentário lá — pedido do usuário 2026-07-26).
  const widthPresetsMm = slot.widthPresetsMm || [];
  const clamped = (m.width_locked && widthPresetsMm.length)
    ? Pricing.pickNearestPreset(widthPresetsMm, newWidthMm)
    : clamp(newWidthMm, Number(m.width_min_mm || 0), (Number(m.width_max_mm) > 0 ? Number(m.width_max_mm) : Infinity));
  const rightEdgeMm = Number(slot.x_mm || 0) + Number(slot.width_mm || 0);
  slot.width_mm = clamped;
  slot.x_mm = Math.max(0, rightEdgeMm - clamped);
  recomputeProjectSlotPricing(slot);
  clampProjectSlotPosition(slot);
  resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
  renderProjectCanvas();
  markProjectDirty();
}

document.addEventListener('pointermove', (ev) => {
  if (projectWallDragState) {
    const dxPx = ev.clientX - projectWallDragState.startX;
    const dxMm = dxPx / (projectPxPerMm || 1);
    // Handle direito: arrastar pra DIREITA aumenta a largura. Handle
    // esquerdo: arrastar pra ESQUERDA (dxMm negativo) aumenta a largura —
    // por isso o sinal invertido.
    const newWidthMm = projectWallDragState.isRightHandle
      ? projectWallDragState.startWidthMm + dxMm
      : projectWallDragState.startWidthMm - dxMm;
    setProjectWallWidthMm(newWidthMm, !projectWallDragState.isRightHandle, projectWallDragState.wallIndex);
    return;
  }
  if (projectResizeDragState) {
    const state = projectResizeDragState;
    const slot = projectSlots.find((s) => s.id === state.slotId);
    if (!slot) { projectResizeDragState = null; return; }
    // Ímã ao esticar (pedido do usuário: "quero que ao esticar ele puxe
    // alinhamento com o que está na tela... tipo largura do painel de
    // trás") — snapProjectEdge puxa a borda que está se movendo pra
    // encostar na borda de outro módulo (ou parede/chão) dentro do raio de
    // imã, exatamente como já acontece ao MOVER um módulo. Módulos da MESMA
    // parede (projectSlotsSameWallExcluding) + o traçado fantasma da parede
    // vizinha (projectGhostSnapTargets — pedido do usuário 2026-07-26:
    // "consigo usar a referencia do tracado pra alinhamento tipo ima").
    const others = projectSlotsSameWallExcluding(slot).concat(projectGhostSnapTargets(Number(slot.wall_index || 0)));
    if (state.axis === 'width-right') {
      const dxMm = (ev.clientX - state.startX) / (projectPxPerMm || 1);
      const rawRightEdge = state.startXMm + state.startWidthMm + dxMm;
      const snappedRightEdge = snapProjectEdge(rawRightEdge, true, others);
      updateProjectSlotDimension(slot, 'width', snappedRightEdge - Number(slot.x_mm || 0));
    } else if (state.axis === 'width-left') {
      const dxMm = (ev.clientX - state.startX) / (projectPxPerMm || 1);
      const rawLeftEdge = state.startXMm + dxMm;
      const snappedLeftEdge = snapProjectEdge(rawLeftEdge, true, others);
      updateProjectSlotWidthFromLeft(slot, (state.startXMm + state.startWidthMm) - snappedLeftEdge);
    } else if (state.axis === 'height-top') {
      // Tela: clientY cresce pra BAIXO; arrastar pra CIMA (dyPx negativo)
      // precisa AUMENTAR a altura — sinal invertido.
      const dyMm = -(ev.clientY - state.startY) / (projectPxPerMm || 1);
      const rawTopEdge = Number(slot.floor_height_mm || 0) + state.startHeightMm + dyMm;
      const snappedTopEdge = snapProjectEdge(rawTopEdge, false, others);
      updateProjectSlotDimension(slot, 'height', snappedTopEdge - Number(slot.floor_height_mm || 0));
    }
  }
});
document.addEventListener('pointerup', () => {
  if (projectWallDragState) {
    projectWallDragState = null;
    document.querySelectorAll('.po-proj-wall-resize-handle.dragging').forEach((el) => el.classList.remove('dragging'));
    markProjectDirty();
  }
  if (projectResizeDragState) {
    projectResizeDragState = null;
    document.querySelectorAll('.po-proj-slot-resize.dragging').forEach((el) => el.classList.remove('dragging'));
    markProjectDirty();
  }
});
document.addEventListener('pointercancel', () => {
  projectWallDragState = null;
  projectResizeDragState = null;
  document.querySelectorAll('.po-proj-wall-resize-handle.dragging, .po-proj-slot-resize.dragging').forEach((el) => el.classList.remove('dragging'));
});

const projWallWidthInput = document.getElementById('po-proj-wall-width-input');
if (projWallWidthInput) {
  projWallWidthInput.addEventListener('change', () => {
    const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
    const mm = parseDimensionInput(projWallWidthInput.value, unit);
    const errorEl = document.getElementById('po-proj-error');
    if (mm === null || isNaN(mm)) {
      if (errorEl) { errorEl.textContent = I18n.t('project.wall_width_invalid_error'); errorEl.style.display = 'block'; }
      refreshProjectWallWidthInput();
      return;
    }
    if (errorEl) errorEl.style.display = 'none';
    setProjectWallWidthMm(mm, false);
  });
  projWallWidthInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); projWallWidthInput.blur(); }
  });
}

// ---------- Colunas ajustáveis (pedido do usuário, 2026-07-21) ----------
// "pode deixar as colunas laterais ajustaveis na largura?" — arrasta os
// dois handles finos entre biblioteca|canvas|painel de config pra dar mais
// espaço a qualquer um dos três. Largura em variáveis CSS no próprio
// .po-proj-layout (ver grid-template-columns no CSS), persistida no
// localStorage. Redimensionar chama renderProjectCanvas() de novo — a
// escala (px/mm) depende da largura disponível do wrap, que muda junto.

const PROJECT_COLUMN_MIN_PX = 150;
const PROJECT_COLUMN_MAX_PX = 460;
let projectLibraryWidthPx = 200;
let projectConfigWidthPx = 240;
try {
  const savedLib = Number(localStorage.getItem('legno_project_library_width_px'));
  if (savedLib > 0) projectLibraryWidthPx = clamp(savedLib, PROJECT_COLUMN_MIN_PX, PROJECT_COLUMN_MAX_PX);
  const savedCfg = Number(localStorage.getItem('legno_project_config_width_px'));
  if (savedCfg > 0) projectConfigWidthPx = clamp(savedCfg, PROJECT_COLUMN_MIN_PX, PROJECT_COLUMN_MAX_PX);
} catch (e) { /* ok sem persistir */ }

// Colunas recolhíveis (pedido do usuário 2026-08-06, testando no iPad Air
// 13"): recolhida, a coluna some e vira uma tira só com o botão de expandir,
// devolvendo a largura toda pro centro — que é onde ficam o canvas 2D e a
// Vista de Canto 3D. É o ganho de espaço que mais importa no tablet, bem
// maior do que qualquer aumento de altura.
const PROJECT_COLUMN_COLLAPSED_PX = 34;
let projectLibraryCollapsed = false;
let projectConfigCollapsed = false;
try {
  projectLibraryCollapsed = localStorage.getItem('legno_project_library_collapsed') === '1';
  projectConfigCollapsed = localStorage.getItem('legno_project_config_collapsed') === '1';
} catch (e) { /* ok sem persistir */ }

function applyProjectColumnWidths() {
  const layout = document.querySelector('#po-tab-projects .po-proj-layout');
  if (!layout) return;
  layout.classList.toggle('lib-collapsed', projectLibraryCollapsed);
  layout.classList.toggle('cfg-collapsed', projectConfigCollapsed);
  layout.style.setProperty('--proj-lib-w', (projectLibraryCollapsed ? PROJECT_COLUMN_COLLAPSED_PX : projectLibraryWidthPx) + 'px');
  layout.style.setProperty('--proj-cfg-w', (projectConfigCollapsed ? PROJECT_COLUMN_COLLAPSED_PX : projectConfigWidthPx) + 'px');
}
applyProjectColumnWidths();

// Recolher/expandir muda a largura disponível do centro, e a escala do canvas
// 2D (projectPxPerMm) é derivada dela — sem re-renderizar, os módulos ficam
// desenhados na escala antiga. O mesmo vale pras cenas 3D, que leem
// clientWidth/clientHeight do container: o 'resize' avisa os viewers que já
// escutam a janela (ViewerProject/ViewerProjectEdit), sem precisar de
// referência direta a eles daqui.
function toggleProjectColumn(isLeftColumn) {
  if (isLeftColumn) projectLibraryCollapsed = !projectLibraryCollapsed;
  else projectConfigCollapsed = !projectConfigCollapsed;
  applyProjectColumnWidths();
  try {
    localStorage.setItem('legno_project_library_collapsed', projectLibraryCollapsed ? '1' : '0');
    localStorage.setItem('legno_project_config_collapsed', projectConfigCollapsed ? '1' : '0');
  } catch (e) { /* ok sem persistir */ }
  renderProjectCanvas();
  // Um tick depois: o grid só recalcula a largura das colunas no próximo
  // layout, então medir agora devolveria a largura ANTIGA.
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
}

// TELA CHEIA da aba Projetos (pedido do Matt 2026-08-12: "toda essa sobra na
// esquerda e direita tem como aproveitar e ajustar conforme o máximo da tela
// de cada computador? quanto mais área melhor pra desenhar"). O <main> do
// portal trava em 1800px — bom pra ler catálogo/pedido, desperdício numa tela
// de desenho: num monitor 2560 sobravam ~380px brancos de cada lado. A classe
// no <body> tira o teto SÓ enquanto a aba Projetos está aberta (o CSS mora em
// css/style.css, ver .proj-fullbleed).
//
// Chamada de dois lugares: o listener genérico de troca de aba e o
// sendProjectToOrder (que troca de aba na mão, sem passar pelo listener) —
// esquecer o segundo deixaria "Meus Pedidos" esticado até a próxima troca.
function setProjectFullBleed(on) {
  const jaEstava = document.body.classList.contains('proj-fullbleed');
  if (jaEstava === !!on) return;
  document.body.classList.toggle('proj-fullbleed', !!on);
  // Saindo da aba: derruba a tela cheia junto (ver toggleProjectTelaCheia
  // abaixo). O topo do portal fica ESCONDIDO enquanto ela está ligada — sair
  // pra "Meus Pedidos" e achar a tela sem menu nenhum seria um beco sem saída.
  if (!on) {
    if (document.body.classList.contains('proj-tela-cheia')) {
      const sair = document.exitFullscreen || document.webkitExitFullscreen;
      if (sair && (document.fullscreenElement || document.webkitFullscreenElement)) {
        try { sair.call(document); } catch (e) { /* o listener limpa a classe */ }
      }
      document.body.classList.remove('proj-tela-cheia'); // caso do fallback sem Fullscreen API (iPad)
    }
  }
  // Mesma razão do setTimeout em toggleProjectColumn: os viewers 3D leem
  // clientWidth/clientHeight do container, e o layout novo só existe no
  // próximo tick. O 'resize' avisa quem já escuta a janela
  // (ViewerProject/ViewerProjectEdit/Viewer3D) sem referência direta daqui.
  setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
}

// TELA CHEIA DE VERDADE da aba Projetos (pedido do Matt 2026-08-14: "um botão
// na barra que expande a tela de projetos pra frente inclusive da barra do
// navegador"). O .proj-fullbleed de cima só solta a largura do <main>; quem
// come altura é a barra do navegador + o topo do portal. Aqui é a Fullscreen
// API de verdade.
//
// Fullscreen no documentElement, NÃO no painel da aba: elemento em fullscreen
// vira o topo da pilha de renderização e TUDO que está fora dele some — os
// modais do portal (Buscar, Gerar com IA, editor de paredes em iframe) são
// filhos do <body>, e em fullscreen do painel eles ficariam invisíveis com o
// clique valendo mesmo assim. Com o documento inteiro, nada muda de contexto.
//
// A classe no <body> é separada do fullscreen real de propósito: quem sai pelo
// Esc (o navegador faz sozinho, sem passar por este clique) precisa ver o menu
// voltar — daí o listener de fullscreenchange ser a ÚNICA fonte da verdade da
// classe. Nunca ligar/desligar a classe direto no clique.
function projectFullscreenAtivo() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

async function toggleProjectTelaCheia() {
  try {
    if (projectFullscreenAtivo()) {
      const sair = document.exitFullscreen || document.webkitExitFullscreen;
      if (sair) await sair.call(document);
      return;
    }
    const el = document.documentElement;
    const pedir = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!pedir) {
      // iPhone/iPad em Safari não tem Fullscreen API no documento. Sem ela,
      // pelo menos esconde topo/rodapé (ganha ~130px de altura) — o navegador
      // continua aparecendo, mas o botão não pode virar um clique morto.
      // Aqui a classe é ligada na mão porque não vai existir fullscreenchange.
      document.body.classList.toggle('proj-tela-cheia');
      setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
      return;
    }
    await pedir.call(el);
  } catch (e) {
    // Navegador pode recusar (política de gesto do usuário, iframe sem
    // allow="fullscreen"). Não vale quebrar a aba por causa disso.
  }
}

(function attachProjectTelaCheia() {
  const btn = document.getElementById('po-proj-fullscreen-btn');
  if (btn) btn.addEventListener('click', toggleProjectTelaCheia);
  const sincroniza = () => {
    const on = projectFullscreenAtivo();
    document.body.classList.toggle('proj-tela-cheia', on);
    if (btn) {
      btn.classList.toggle('active', on);
      btn.title = I18n.t(on ? 'project.fullscreen_exit_title' : 'project.fullscreen_title');
    }
    // Mesma razão do setTimeout em setProjectFullBleed: os viewers 3D leem o
    // tamanho do container, que só existe no próximo layout.
    setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  };
  document.addEventListener('fullscreenchange', sincroniza);
  document.addEventListener('webkitfullscreenchange', sincroniza);
})();

(function attachProjectColumnToggles() {
  const libBtn = document.getElementById('po-proj-lib-toggle');
  if (libBtn) libBtn.addEventListener('click', () => toggleProjectColumn(true));
  const cfgBtn = document.getElementById('po-proj-cfg-toggle');
  if (cfgBtn) cfgBtn.addEventListener('click', () => toggleProjectColumn(false));
})();

function attachProjectColumnResize(handleId, isLeftColumn) {
  const handle = document.getElementById(handleId);
  if (!handle) return;
  let dragState = null;
  handle.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    try { handle.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    dragState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startWidth: isLeftColumn ? projectLibraryWidthPx : projectConfigWidthPx
    };
    handle.classList.add('resizing');
  });
  handle.addEventListener('pointermove', (ev) => {
    if (!dragState || dragState.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - dragState.startX;
    // Handle da esquerda: arrastar pra DIREITA cresce a biblioteca. Handle
    // da direita: arrastar pra ESQUERDA cresce o painel de config (sinal
    // invertido — a coluna fica à DIREITA do handle, não à esquerda).
    const rawWidth = isLeftColumn ? dragState.startWidth + dx : dragState.startWidth - dx;
    const width = clamp(rawWidth, PROJECT_COLUMN_MIN_PX, PROJECT_COLUMN_MAX_PX);
    if (isLeftColumn) projectLibraryWidthPx = width; else projectConfigWidthPx = width;
    applyProjectColumnWidths();
    renderProjectCanvas();
  });
  const endDrag = (ev) => {
    if (!dragState || dragState.pointerId !== ev.pointerId) return;
    handle.classList.remove('resizing');
    try { handle.releasePointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    dragState = null;
    try {
      localStorage.setItem('legno_project_library_width_px', String(projectLibraryWidthPx));
      localStorage.setItem('legno_project_config_width_px', String(projectConfigWidthPx));
    } catch (e) { /* ok sem persistir */ }
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}
attachProjectColumnResize('po-proj-resize-handle-left', true);
attachProjectColumnResize('po-proj-resize-handle-right', false);

// ---------- Biblioteca (painel esquerdo) ----------
// Pedido do usuário 2026-07-21 (2ª rodada de feedback): "quero já ver os
// modulos na esquerda, com os filtros de categoria e sub categoria" — pills
// pequenas, com ESTADO PRÓPRIO (não usa selectedCategoryId/SubcategoryId da
// aba "Novo Orçamento" — trocar filtro aqui não deve bagunçar aquela aba).

let projectSelectedFamilyId = '';
let projectSelectedCategoryId = '';

// Pedido do usuário (2026-07-23): as 3 linhas de pills (família/categoria/
// subcategoria) atrapalhavam a visão dos módulos na biblioteca — trocado por
// UMA única caixa de seleção (só o nível família). Estado próprio
// (projectSelectedFamilyId), não compartilhado com os pills da aba "Novo
// Orçamento" (selectedCategoryId/SubcategoryId).
// Pedido do usuário (2026-07-29): "abaixo da selecao da familia, quero que
// abra a selecao da categoria" — dropdown de categoria logo abaixo do de
// família, mesmo estilo, escopado só pela família selecionada (cascata igual
// ao modal "Buscar"). Subcategoria continua não tendo dropdown aqui — pra
// isso ainda existe o modal do botão "Buscar" (ver
// renderProjectSearchModalFilterBars/po-proj-search-modal mais abaixo).
function renderProjectLibraryFilterBars() {
  const select = document.getElementById('po-proj-filter-family-select');
  const categorySelect = document.getElementById('po-proj-filter-category-select');
  if (!select) return;
  const familiesInScope = familiesCacheList.filter((f) => allModules.some((m) => m.family_id === f.id));
  if (projectSelectedFamilyId && !familiesInScope.some((f) => f.id === projectSelectedFamilyId)) {
    projectSelectedFamilyId = '';
  }
  select.innerHTML = '';
  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = I18n.t('project.filter_all');
  select.appendChild(allOption);
  familiesInScope.forEach((f) => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
  select.value = projectSelectedFamilyId;

  if (!categorySelect) return;
  const categoriesInScope = categoriesCacheList.filter((c) => allModules.some((m) =>
    m.category_id === c.id && (!projectSelectedFamilyId || m.family_id === projectSelectedFamilyId)
  ));
  if (projectSelectedCategoryId && !categoriesInScope.some((c) => c.id === projectSelectedCategoryId)) {
    projectSelectedCategoryId = '';
  }
  categorySelect.innerHTML = '';
  const allCategoryOption = document.createElement('option');
  allCategoryOption.value = '';
  allCategoryOption.textContent = I18n.t('project.filter_all');
  categorySelect.appendChild(allCategoryOption);
  categoriesInScope.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    categorySelect.appendChild(opt);
  });
  categorySelect.value = projectSelectedCategoryId;
}

const projFilterFamilySelect = document.getElementById('po-proj-filter-family-select');
if (projFilterFamilySelect) {
  projFilterFamilySelect.addEventListener('change', (e) => {
    projectSelectedFamilyId = e.target.value;
    projectSelectedCategoryId = '';
    renderProjectLibraryFilterBars();
    renderProjectLibrary();
  });
}

const projFilterCategorySelect = document.getElementById('po-proj-filter-category-select');
if (projFilterCategorySelect) {
  projFilterCategorySelect.addEventListener('change', (e) => {
    projectSelectedCategoryId = e.target.value;
    renderProjectLibrary();
  });
}

// Monta (se o módulo tiver referência cadastrada) e pendura no card o
// dropdown de SKU pra inserção rápida — ver comentário no chamador
// (renderProjectLibrary) pra contexto do pedido. Função própria (não inline
// no forEach) porque o mesmo bloco de "impedir o pointerdown/click de subir
// pro card" tem que existir OU o arraste do card (attachProjectLibraryCardDrag,
// que usa pointerdown+setPointerCapture no card INTEIRO) rouba o gesto e o
// <select> nativo nem abre.
function attachProjectLibrarySkuSelect(card, m, unit) {
  const skuOptions = moduleSkuPresetsByModuleId[m.id] || [];
  if (!skuOptions.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'po-proj-library-card-sku';
  const sel = document.createElement('select');
  sel.className = 'po-proj-library-card-sku-select';
  const autoOpt = document.createElement('option');
  autoOpt.value = '';
  autoOpt.textContent = I18n.t('step1.sku_placeholder');
  sel.appendChild(autoOpt);
  skuOptions.forEach((s) => {
    const o = document.createElement('option');
    o.value = s.reference;
    o.textContent = skuOptionLabelForUnit(s, unit);
    sel.appendChild(o);
  });
  ['pointerdown', 'click'].forEach((evt) => sel.addEventListener(evt, (e) => e.stopPropagation()));
  sel.addEventListener('change', () => {
    const reference = sel.value;
    if (!reference) return;
    const sku = skuOptions.find((s) => s.reference === reference);
    if (!sku) return;
    sel.disabled = true;
    insertProjectModuleDefault(m.id, { width_mm: sku.width_mm, height_mm: sku.height_mm })
      .then((slot) => {
        // insertProjectModuleDefault só seleciona/renderiza/marca sujo
        // sozinha quando NENHUM overrides é passado (o motivo: a IA insere
        // vários módulos em sequência e faz isso ela mesma 1x no fim do
        // lote, ver comentário lá dentro) — como aqui é 1 inserção avulsa
        // (não um lote), com overrides SEMPRE preenchido (é o próprio
        // tamanho do SKU), tem que fazer esses 3 passos na mão, senão o
        // módulo entra em projectSlots mas a cena continua exatamente como
        // estava (achado ao testar ao vivo — o item existe, só não aparece).
        if (!slot) return;
        selectedProjectSlotId = slot.id;
        renderProjectCanvas();
        markProjectDirty();
      })
      .finally(() => { sel.disabled = false; sel.value = ''; });
  });
  wrap.appendChild(sel);
  card.appendChild(wrap);
}

function renderProjectLibrary() {
  const grid = document.getElementById('po-proj-library-grid');
  if (!grid) return;
  const list = (allModules || []).filter((m) =>
    (!projectSelectedFamilyId || m.family_id === projectSelectedFamilyId) &&
    (!projectSelectedCategoryId || m.category_id === projectSelectedCategoryId)
  );
  grid.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'po-proj-library-empty';
    empty.textContent = I18n.t('step1.no_modules_found');
    grid.appendChild(empty);
    return;
  }
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  list.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'po-proj-library-card';
    card.title = m.name;
    const dimsLine = `${formatDimension(m.width_default_mm, unit)} x ${formatDimension(m.height_default_mm, unit)} x ${formatDimension(m.depth_default_mm, unit)}`;
    card.innerHTML = `
      ${moduleCardImage(m)}
      <div class="po-proj-library-card-name">${m.name}</div>
      <div class="po-proj-library-card-dims">${dimsLine}</div>
    `;
    // Dropdown de referência/SKU (2026-08-21, pedido do usuário: "pensando em
    // colocar nos modulos da esqureda tmabem pra insercao rapida no
    // ambiente") — mesmo catálogo/texto da vitrine "New Quote" (ver
    // moduleSkuPresetsByModuleId/skuOptionLabelForUnit em
    // portal-01-core-catalogo.js). Escolher uma referência já INSERE o
    // módulo no ambiente com a medida daquele SKU (em vez de só adicionar ao
    // carrinho, que é o que a vitrine faz) — mesmo caminho de sempre
    // (insertProjectModuleDefault), só que agora aceitando um override de
    // altura também (ver requestedHeightMm acima).
    attachProjectLibrarySkuSelect(card, m, unit);
    // Pedido do usuário (2ª rodada, 2026-07-21): "quero que clique no modulo
    // e ele seja inserido na tela do projeto... dando um clique no modulo
    // abre as configuracoes na direita e eu resolva tudo na mesma tela" —
    // insere JÁ com config padrão (1ª cor de cada papel, medida padrão do
    // catálogo, opcionais padrão) via insertProjectModuleDefault, sem abrir
    // o configurador de tela cheia. Medida/cor viram editáveis DIRETO no
    // painel da direita (ver renderProjectConfigPanel/updateProjectSlot*).
    // Isso é DIFERENTE da regra "sem atalho de adicionar rápido" do
    // carrinho normal (ver memória) — decisão explícita do usuário só pra
    // esta tela de Projetos, que é uma ferramenta de rascunho/layout, não o
    // pedido final.
    // Clique simples continua inserindo com a posição automática de sempre;
    // ARRASTAR o card e soltar dentro da cena posiciona onde o ponteiro
    // largou (2026-08-08) — ver attachProjectLibraryCardDrag.
    attachProjectLibraryCardDrag(card, m);
    grid.appendChild(card);
  });
}

// ==========================================================================
// ARRASTAR DA BIBLIOTECA E SOLTAR NA CENA — 2026-08-08
// ==========================================================================
// Pedido do usuário: "os moveis devem ser arrastados da biblioteca e largados
// onde o mause soltar do clique". Até aqui o card só respondia a CLIQUE e o
// módulo entrava numa posição calculada automaticamente
// (computeDefaultProjectSlotX) — quem quisesse colocar num lugar específico
// tinha que inserir e depois arrastar dentro da cena, dois gestos pra uma
// intenção só.
//
// Implementado com Pointer Events (não com a API nativa de drag-and-drop do
// HTML5): a nativa não funciona em toque no iOS, e o alvo do drop aqui é um
// <canvas> WebGL onde a posição do ponteiro precisa virar um raio 3D — nada
// disso o dragover/drop nativo entrega de graça. O "fantasma" que acompanha o
// dedo/cursor é um <div> position:fixed criado na hora (.po-proj-drag-ghost).
//
// Clique curto (sem passar do limiar de movimento) continua caindo no
// comportamento antigo — inserir com posição automática.
let projectLibDragState = null;

function attachProjectLibraryCardDrag(card, moduleRow) {
  card.addEventListener('pointerdown', (ev) => {
    if (ev.button != null && ev.button !== 0) return;
    projectLibDragState = {
      pointerId: ev.pointerId,
      moduleId: moduleRow.id,
      moduleName: moduleRow.name,
      card,
      startX: ev.clientX,
      startY: ev.clientY,
      moved: false,
      // Maior distância que o dedo/cursor percorreu no gesto inteiro. É ela
      // que separa "toque que tremeu" de "rolagem da lista" lá no pointerup —
      // a posição FINAL não serve, porque uma rolagem volta perto de onde
      // começou e seria lida como toque.
      maxDist: 0,
      ghost: null
    };
    try { card.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
  });

  card.addEventListener('pointermove', (ev) => {
    const st = projectLibDragState;
    if (!st || st.pointerId !== ev.pointerId) return;
    if (!st.moved) {
      const dx = ev.clientX - st.startX;
      const dy = ev.clientY - st.startY;
      const d = Math.hypot(dx, dy);
      st.maxDist = Math.max(st.maxDist, d);
      if (d < (ev.pointerType === 'touch' ? PROJECT_TOUCH_SLOP_PX : PROJECT_CLICK_MOVE_THRESHOLD_PX)) return;
      // TOQUE: a biblioteca é uma lista que ROLA na vertical — se qualquer
      // movimento do dedo virasse arraste de módulo, rolar a lista no iPad
      // ficaria impossível. Casa com `touch-action: pan-y` no card (CSS), que
      // deixa o navegador cuidar da rolagem vertical nativamente.
      //
      // 2026-08-16 — "iPad não tá conseguindo inserir no ambiente" (Matt,
      // arrastando o card pra dentro da cena). A versão anterior decidia UMA
      // VEZ, no primeiro ponto que passava dos 12px: se ali |dy| >= |dx| ela
      // fazia `projectLibDragState = null` e o gesto MORRIA. Puxar da coluna
      // da esquerda quase sempre começa com uma descidinha, então o arraste
      // morria no primeiro milímetro e não ressuscitava nem indo 300px pra
      // direita — e, pior, o pointerup achava o estado nulo e nem caía no
      // atalho de toque curto. Nada acontecia, sem aviso nenhum.
      //
      // Agora a decisão é CONTÍNUA e o critério é o percurso HORIZONTAL de
      // verdade: assim que o dedo andar PROJECT_TOUCH_SLOP_PX no eixo X, o
      // arraste engata, não importa o quanto ele desceu no caminho. Enquanto
      // isso não acontece o gesto fica INDECISO — nunca é descartado.
      //
      // Quem protege a rolagem não é mais este if: é o `touch-action: pan-y`.
      // Quando o iOS decide que aquilo é uma rolagem vertical, ele assume o
      // gesto e manda `pointercancel`, e o endLibDrag já sai fora nesse caso.
      if (ev.pointerType === 'touch' && Math.abs(dx) < PROJECT_TOUCH_SLOP_PX) return;
      st.moved = true;
      st.ghost = buildProjectDragGhost(moduleRow);
      document.body.appendChild(st.ghost);
      card.classList.add('dragging-to-scene');
      // TRAVA A TELA (2026-08-12, iPad — "quando arrasto movel pro ambiente
      // qualquer desce ou sobe da tela ele desclica no movel. acho que preciso
      // travar a tela quando estiver arrastando"). O card nasce com
      // touch-action:pan-y pra lista poder rolar; assim que o arraste ENGATA,
      // essa permissão precisa sumir, senão qualquer componente vertical do
      // gesto vira rolagem e o iOS mata o ponteiro no meio do caminho
      // (pointercancel = "desclicou" sozinho). Só o touch-action não basta no
      // iOS: o listener global de touchmove (passive:false, ver
      // attachProjectDragScrollLock) é quem de fato segura a página.
      card.style.touchAction = 'none';
    }
    ev.preventDefault();
    st.ghost.style.left = ev.clientX + 'px';
    st.ghost.style.top = ev.clientY + 'px';
    highlightProjectDropTarget(ev.clientX, ev.clientY);
    // Contorno vermelho DENTRO da cena mostrando onde o móvel vai parar —
    // ver updateProjectDropPreview.
    updateProjectDropPreview(moduleRow, ev.clientX, ev.clientY);
  });

  const endLibDrag = (ev) => {
    const st = projectLibDragState;
    if (!st || st.pointerId !== ev.pointerId) return;
    projectLibDragState = null;
    if (st.ghost && st.ghost.parentNode) st.ghost.parentNode.removeChild(st.ghost);
    card.classList.remove('dragging-to-scene');
    card.style.touchAction = '';   // devolve a rolagem da lista (ver a trava no pointermove)
    highlightProjectDropTarget(null, null);
    if (ViewerProjectEdit && ViewerProjectEdit.setDropPreview) ViewerProjectEdit.setDropPreview(null);
    if (ev.type === 'pointercancel') return;
    if (!st.moved) {
      // Não passou do limiar: é um clique normal, comportamento de sempre.
      //
      // O TESTE É O PERCURSO, NÃO A POSIÇÃO FINAL (2026-08-16). Desde que o
      // gesto vertical parou de zerar o estado, uma rolagem da lista também
      // chega aqui com `moved` falso — e ela costuma terminar perto de onde
      // começou, então comparar início e fim a leria como toque e inseriria
      // um módulo a cada rolagem. `maxDist` é o quanto o dedo REALMENTE
      // andou: escorregão de toque fica embaixo do limiar, rolagem não.
      if (st.maxDist <= PROJECT_LIB_TAP_SLIP_PX) insertProjectModuleDefault(st.moduleId);
      return;
    }
    dropProjectModuleAt(st.moduleId, ev.clientX, ev.clientY);
  };
  card.addEventListener('pointerup', endLibDrag);
  card.addEventListener('pointercancel', endLibDrag);
}

// TRAVA GLOBAL DE ROLAGEM ENQUANTO ARRASTA (2026-08-12, iPad)
// ==========================================================================
// "quando arrasto movel pro ambiente qualquer desce ou sobe da tela ele
// desclica no movel. ta bem dificil de mover arrastar movel pro ambiente. acho
// que preciso travar a tela quando estiver arrastando ai vai ficar bom."
//
// O que acontecia: o dedo sai do card da biblioteca e atravessa a página até a
// cena. Nesse caminho ele passa por cima de elementos que ROLAM (a própria
// lista, o painel, a página), o Safari começa a rolar e mata o gesto de
// ponteiro no meio — o módulo "solta" sozinho.
//
// preventDefault em pointermove NÃO impede rolagem no iOS; só um touchmove com
// passive:false impede. Por isso o listener é no documento, uma vez só, e
// cobre os DOIS arrastes (o da biblioteca e o de dentro da cena 3D): enquanto
// qualquer um estiver engatado, a página inteira fica parada.
(function attachProjectDragScrollLock() {
  document.addEventListener('touchmove', (ev) => {
    const arrastandoDaBiblioteca = !!(projectLibDragState && projectLibDragState.moved);
    const arrastandoNaCena = !!(projectDrag3DState && projectDrag3DState.moved);
    if (arrastandoDaBiblioteca || arrastandoNaCena) ev.preventDefault();
  }, { passive: false });
})();

function buildProjectDragGhost(moduleRow) {
  const ghost = document.createElement('div');
  ghost.className = 'po-proj-drag-ghost';
  ghost.innerHTML = `${moduleCardImage(moduleRow)}<div>${moduleRow.name}</div>`;
  return ghost;
}

// Contorno vermelho DENTRO da cena 3D marcando onde o módulo vai parar se o
// arraste terminar agora (pedido do usuário 2026-08-08: "mostrar a area
// vermelha... mostrando onde vai ficar o movel apos soltar o clique").
//
// Usa as medidas PADRÃO do catálogo (width_default_mm etc.) porque as medidas
// finais só existem depois do insert (que clampa por min/max e pelo pé
// direito) — pro objetivo aqui, que é mostrar POSIÇÃO, a diferença é
// irrelevante e não custa uma ida ao banco a cada pointermove.
//
// A geometria de destino é calculada com a MESMA régua do drop de verdade
// (dropProjectModuleAt): piso vira ilha centrada no ponto; parede vira módulo
// centrado no ponto, na altura onde o ponteiro cruzou o plano dela.
function updateProjectDropPreview(moduleRow, clientX, clientY) {
  if (!ViewerProjectEdit || !ViewerProjectEdit.setDropPreview) return;
  const edit3dWrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  if (!edit3dWrap || edit3dWrap.offsetParent === null) { ViewerProjectEdit.setDropPreview(null); return; }
  const r = edit3dWrap.getBoundingClientRect();
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) {
    ViewerProjectEdit.setDropPreview(null);
    return;
  }

  const wM = Number(moduleRow.width_default_mm || 0) / 1000;
  const hM = Number(moduleRow.height_default_mm || 0) / 1000;
  const dM = Number(moduleRow.depth_default_mm || 0) / 1000;

  const surface = ViewerProjectEdit.pickRoomSurfaceAt
    ? ViewerProjectEdit.pickRoomSurfaceAt(clientX, clientY)
    : null;

  if (surface && surface.kind === 'floor') {
    ViewerProjectEdit.setDropPreview({
      width_m: wM, height_m: hM, depth_m: dM,
      position: { x: surface.point.x, y: 0, z: surface.point.z },
      rotationY: 0
    });
    return;
  }

  const wallIndex = (surface && Number.isFinite(Number(surface.wallIndex)))
    ? Number(surface.wallIndex)
    : projectActiveWallIndex;
  const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === wallIndex);
  if (!wallGeo) { ViewerProjectEdit.setDropPreview(null); return; }
  const p = ViewerProjectEdit.intersectPlaneAtClient(
    clientX, clientY,
    { x: wallGeo.originX, y: 0, z: wallGeo.originZ },
    { x: wallGeo.intoDirX, y: 0, z: wallGeo.intoDirZ }
  );
  if (!p) { ViewerProjectEdit.setDropPreview(null); return; }
  const alongM = (p.x - wallGeo.originX) * wallGeo.alongDirX + (p.z - wallGeo.originZ) * wallGeo.alongDirZ;
  // Mesma recentralização do drop real: o ponteiro fica no MEIO do módulo.
  const baseY = Math.max(0, p.y - hM / 2);
  const depthOffM = dM / 2;
  ViewerProjectEdit.setDropPreview({
    width_m: wM, height_m: hM, depth_m: dM,
    position: {
      x: wallGeo.originX + wallGeo.alongDirX * alongM + wallGeo.intoDirX * depthOffM,
      y: baseY,
      z: wallGeo.originZ + wallGeo.alongDirZ * alongM + wallGeo.intoDirZ * depthOffM
    },
    rotationY: wallGeo.rotationY
  });
}

// Acende o contorno tracejado no canvas que receberia o módulo se soltasse
// agora (o 3D de canto ou o 2D plano, o que estiver visível).
function highlightProjectDropTarget(clientX, clientY) {
  const targets = [
    document.getElementById('po-proj-canvas-3d-edit-wrap'),
    document.getElementById('po-proj-canvas')
  ];
  targets.forEach((el) => {
    if (!el) return;
    let over = false;
    if (clientX != null && el.offsetParent !== null) {
      const r = el.getBoundingClientRect();
      over = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    }
    el.classList.toggle('drop-target', over);
  });
}

// Solta o módulo no ponto (clientX, clientY). Três destinos possíveis, nesta
// ordem:
//   1. PISO da cena 3D  -> módulo ILHA (placement 'floor') exatamente onde o
//      raio do ponteiro cruza o chão.
//   2. PAREDE da cena 3D -> módulo de parede naquela parede, na posição/altura
//      onde o raio cruza o plano dela (a parede também vira a ativa).
//   3. Canvas 2D plano (parede única, vista Frontal) -> converte px em mm pela
//      escala atual (projectPxPerMm) e insere ali.
// Fora de qualquer canvas, o drop é ignorado (nada é inserido) — soltar no
// vazio não deve criar módulo nenhum.
// EMPURRAR PRA FORA DE SOBREPOSIÇÃO AO SOLTAR (2026-08-20, relato do Matt:
// "mesmo o ima ligado, os modulos nao estao respeitando o espaco um do
// outro. nao deveria poder transpacar um sobre o outro" — com prints
// mostrando dois módulos "Bottom" nascendo exatamente um em cima do outro).
//
// Achado: o botão de colisão (clampWallSlotAgainstCollision/
// resolveCollisionSlide, ver portal-06b-projetos-canvas-ia-custo.js) só
// existia no ARRASTE de um módulo já colocado — nunca no NASCIMENTO de um
// módulo novo (soltar da biblioteca em cima de outro, ver dropProjectModuleAt
// abaixo). Clicar na biblioteca sem arrastar está a salvo disso
// (computeDefaultProjectSlotX já entra depois do último módulo da parede,
// de propósito) — só o drag-and-drop tinha esse buraco.
//
// Por que não reaproveitar resolveCollisionSlide direto: aquele resolvedor
// desliza a partir de uma posição ANTERIOR válida (sabe de que lado o
// módulo vinha) — um módulo que acabou de NASCER não tem "de onde veio".
// Por isso este é mais simples: só olha quem a posição de nascimento
// atravessa de verdade (mesma faixa de altura, ver sharesRow em
// stretchProjectSlotToCollision) e empurra pro lado — esquerda ou direita —
// que precisar do MENOR deslocamento. Só roda com o botão de colisão
// ligado; desligado, sobrepor de propósito continua sendo o comportamento
// de sempre (camada de profundidade, ver resolveProjectSlotDepth).
function pushProjectSlotClearOnDrop(slot) {
  if (!projectCollisionEnabled || isFloorSlot(slot)) return;
  const EPS = PROJECT_COLLISION_EPS_MM;
  const w = Number(slot.width_mm || 0);
  const h = Number(slot.height_mm || 0);
  const x0 = Number(slot.x_mm || 0);
  const y0 = Number(slot.floor_height_mm || 0);
  const wallWidthMm = getProjectWallWidthMm(Number(slot.wall_index || 0));

  const sharesRow = (s) => (y0 < Number(s.floor_height_mm || 0) + Number(s.height_mm || 0) - EPS)
    && (y0 + h > Number(s.floor_height_mm || 0) + EPS);
  const overlapping = projectSlotsSameWallExcluding(slot).filter((s) => sharesRow(s)
    && x0 < Number(s.x_mm || 0) + Number(s.width_mm || 0) - EPS
    && x0 + w > Number(s.x_mm || 0) + EPS);
  if (!overlapping.length) return;

  // rightLimit/leftLimit = a borda mais apertada entre TODOS os vizinhos que
  // a posição de nascimento atravessa — encostar em qualquer uma delas já
  // limpa a sobreposição com o grupo inteiro (o caso raro de um módulo tão
  // largo que continua cruzando outro vizinho do OUTRO lado ao encostar fica
  // sobreposto mesmo, igual ao resolveCollisionSlide também não ter milagre
  // pra vão menor que o módulo).
  let rightLimit = wallWidthMm, leftLimit = 0;
  overlapping.forEach((s) => {
    rightLimit = Math.min(rightLimit, Number(s.x_mm || 0));
    leftLimit = Math.max(leftLimit, Number(s.x_mm || 0) + Number(s.width_mm || 0));
  });
  const moveLeftDist = x0 - (rightLimit - w);
  const moveRightDist = leftLimit - x0;
  const canGoLeft = (rightLimit - w) >= -EPS;
  const canGoRight = (leftLimit + w) <= wallWidthMm + EPS;
  if (canGoLeft && (!canGoRight || moveLeftDist <= moveRightDist)) {
    slot.x_mm = Math.max(0, rightLimit - w);
  } else if (canGoRight) {
    slot.x_mm = Math.min(wallWidthMm - w, leftLimit);
  }
  // Nem um nem outro coube (vão mais estreito que o módulo): deixa
  // sobreposto — não tem onde encostar sem sair da parede.
}

// EMPURRAR ILHA PRA FORA DE SOBREPOSIÇÃO AO SOLTAR (2026-08-26, relato do
// Matt: "mesmo com ima colisao ligado os moveis se sobrepoe um ao outro" —
// print com dois módulos-ilha (Base 1/2 Drawer Cabinet) soltos no chão um
// em cima do outro).
//
// Contraparte de pushProjectSlotClearOnDrop, só que no PISO (2 eixos, X/Z do
// mundo) em vez de ao longo de uma parede (1 eixo). O buraco era o mesmo:
// dropProjectModuleAt só chamava clampFloorSlotIntoRoom (limite do
// AMBIENTE) pra módulo-ilha recém-solto — nunca checava sobreposição contra
// outra ilha já no piso. clampFloorSlotAgainstCollision (usado no ARRASTE de
// uma ilha já colocada, ver handleProject3DFloorMove) não serve aqui pelo
// mesmo motivo do caso de parede: ele desliza a partir de uma posição
// ANTERIOR válida, e um módulo recém-nascido não tem "de onde veio".
//
// Resolução por eixo separador (SAT simplificado): a cada rodada, acha a
// primeira ilha que ainda penetra e empurra pelo eixo (X ou Z) de MENOR
// penetração — é o deslocamento mínimo que já limpa aquele par. Repete até
// não sobrar ninguém penetrando (ou estourar o limite de rodadas, caso raro
// de várias ilhas empilhadas that se realimentam). Fecha com
// clampFloorSlotIntoRoom de novo — empurrar pra limpar outra ilha pode ter
// jogado o módulo pra fora do retângulo do ambiente.
const PROJECT_FLOOR_PUSH_MAX_ITER = 12;
function pushProjectFloorSlotClearOnDrop(slot) {
  if (!projectCollisionEnabled) return;
  const EPS = PROJECT_COLLISION_EPS_MM;
  let fp = floorSlotFootprint(slot);
  const others = projectFloorSlots()
    .filter((s) => s.id !== slot.id)
    .map((s) => floorSlotFootprint(s));
  if (!others.length) return;

  for (let iter = 0; iter < PROJECT_FLOOR_PUSH_MAX_ITER; iter++) {
    let moved = false;
    for (const o of others) {
      const overlapX = Math.min(fp.x + fp.w, o.x + o.w) - Math.max(fp.x, o.x);
      const overlapZ = Math.min(fp.y + fp.h, o.y + o.h) - Math.max(fp.y, o.y);
      if (overlapX <= EPS || overlapZ <= EPS) continue; // não penetra este vizinho
      const cx = fp.x + fp.w / 2;
      const cz = fp.y + fp.h / 2;
      const ocx = o.x + o.w / 2;
      const ocz = o.y + o.h / 2;
      if (overlapX <= overlapZ) {
        fp.x += (cx >= ocx ? 1 : -1) * overlapX;
      } else {
        fp.y += (cz >= ocz ? 1 : -1) * overlapZ;
      }
      moved = true;
    }
    if (!moved) break;
  }

  slot.floor_x_mm = fp.x + fp.w / 2;
  slot.floor_z_mm = fp.y + fp.h / 2;
  clampFloorSlotIntoRoom(slot);
}

async function dropProjectModuleAt(moduleId, clientX, clientY) {
  const edit3dWrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  const flatCanvas = document.getElementById('po-proj-canvas');
  const inside = (el) => {
    if (!el || el.offsetParent === null) return false;
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };

  let overrides = null;

  if (inside(edit3dWrap) && ViewerProjectEdit && ViewerProjectEdit.pickRoomSurfaceAt) {
    const surface = ViewerProjectEdit.pickRoomSurfaceAt(clientX, clientY);
    if (surface && surface.kind === 'floor') {
      overrides = { placement: 'floor', floor_x_mm: surface.point.x * 1000, floor_z_mm: surface.point.z * 1000 };
    } else {
      // Parede (superfície de parede embaixo do ponteiro, ou o próprio plano
      // da parede ativa quando o ponteiro caiu em cima de outro módulo).
      const wallIndex = (surface && Number.isFinite(Number(surface.wallIndex)))
        ? Number(surface.wallIndex)
        : projectActiveWallIndex;
      const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === wallIndex);
      if (wallGeo) {
        const p = ViewerProjectEdit.intersectPlaneAtClient(
          clientX, clientY,
          { x: wallGeo.originX, y: 0, z: wallGeo.originZ },
          { x: wallGeo.intoDirX, y: 0, z: wallGeo.intoDirZ }
        );
        if (p) {
          const alongMm = ((p.x - wallGeo.originX) * wallGeo.alongDirX + (p.z - wallGeo.originZ) * wallGeo.alongDirZ) * 1000;
          overrides = { wall_index: wallIndex, x_mm: alongMm, floor_height_mm: Math.max(0, p.y * 1000) };
        }
      }
    }
  } else if (inside(flatCanvas) && projectViewMode === 'top') {
    // VISTA SUPERIOR: soltar aqui e soltar no CHAO (2026-08-18). O canvas da
    // vista de cima e o plano XZ do ambiente, entao o ponto do mouse tem uma
    // coordenada de mundo exata — vira modulo ILHA ali. Antes este drop caia
    // no ramo da Frontal 2D logo abaixo e era lido como "x ao longo da parede
    // ativa + altura do chao": em cima o eixo vertical e PROFUNDIDADE, nao
    // altura, entao o modulo nascia flutuando numa altura arbitraria.
    // projectTopViewOrigin e o canto superior esquerdo do desenho em
    // coordenada de mundo (ver renderProjectCanvasTop).
    const r = flatCanvas.getBoundingClientRect();
    const px = projectPxPerMm || 1;
    overrides = {
      placement: 'floor',
      floor_x_mm: projectTopViewOrigin.xMm + (clientX - r.left) / px,
      floor_z_mm: projectTopViewOrigin.zMm + (clientY - r.top) / px
    };
  } else if (inside(flatCanvas)) {
    // Frontal 2D plana — caminho aposentado em 2026-08-18 (o canvas nunca
    // fica visivel nesse modo, ver renderProjectCanvas). Mantido junto da
    // funcao que ele serve, pra voltar inteiro se o 2D voltar.
    const r = flatCanvas.getBoundingClientRect();
    const xMm = (clientX - r.left) / (projectPxPerMm || 1);
    const yMm = (r.bottom - clientY) / (projectPxPerMm || 1);
    overrides = { wall_index: projectActiveWallIndex, x_mm: xMm, floor_height_mm: Math.max(0, yMm) };
  }

  if (!overrides) return; // soltou fora de qualquer canvas — não insere nada

  const slot = await insertProjectModuleDefault(moduleId, overrides);
  if (!slot) return;
  // O módulo nasce CENTRADO no ponto onde o ponteiro soltou (é o que "largado
  // onde o mouse soltar" quer dizer na prática) — insertProjectModuleDefault
  // recebeu a borda esquerda/o centro cru, aqui só recentraliza agora que a
  // largura final (já clampada pelo catálogo) é conhecida.
  if (isFloorSlot(slot)) {
    clampFloorSlotIntoRoom(slot);
    pushProjectFloorSlotClearOnDrop(slot);
  } else {
    slot.x_mm = Number(slot.x_mm || 0) - Number(slot.width_mm || 0) / 2;
    slot.floor_height_mm = Math.max(0, Number(slot.floor_height_mm || 0) - Number(slot.height_mm || 0) / 2);
    clampProjectSlotPosition(slot);
    pushProjectSlotClearOnDrop(slot);
    resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
    if (Number(slot.wall_index || 0) !== projectActiveWallIndex) {
      projectActiveWallIndex = Number(slot.wall_index || 0);
      refreshProjectWallTabs();
      refreshProjectWallWidthInput();
    }
  }
  selectedProjectSlotId = slot.id;
  renderProjectCanvas();
  renderProjectConfigPanel();
  markProjectDirty();
}

// Quanto o ponteiro precisa entrar no ambiente (distância da parede) pra um
// arraste normal soltar o módulo da parede e jogá-lo no chão — ver o uso no
// pointermove da Vista de Canto 3D. Grande o bastante pra não disparar quando
// o cursor só raspa o piso ao mover um módulo baixo, pequeno o bastante pra
// ser um gesto natural de "puxar pra dentro do quarto".
const PROJECT_PULL_TO_FLOOR_MM = 350;

// Distância em que a ilha "gruda" de volta numa parede (2026-08-13). Menor que
// PROJECT_PULL_TO_FLOOR_MM de propósito: a folga pra SAIR precisa ser maior
// que a folga pra ENTRAR, senão o módulo fica preso num vai-e-volta de um
// frame só (gruda na parede, o ponteiro já está além do limite de saída,
// solta, gruda de novo...). 250 < 350 dá uma faixa morta de 100mm.
const PROJECT_SNAP_TO_WALL_MM = 250;

// Em qual parede esta ilha deve encostar, se em alguma. Devolve
// { wallIndex, xMm } (xMm = borda esquerda ao longo da parede) ou null.
//
// Critério: a traseira do móvel está a menos de PROJECT_SNAP_TO_WALL_MM do
// plano da parede E o corpo dele cai dentro do trecho da parede. Testa TODAS
// as paredes e fica com a mais próxima — num canto, as duas estão perto e a
// escolha tem que ser a que ele está de fato encostando.
function projectWallToSnapFloorSlot(slot, xMm, zMm) {
  const larguraMm = Number(slot.width_mm || 0);
  const fp = floorSlotFootprint(slot, xMm, zMm);
  const meiaProfMm = fp.h / 2;
  let melhor = null;
  getProjectWallGeometry().forEach((w) => {
    const dxM = xMm / 1000 - w.originX;
    const dzM = zMm / 1000 - w.originZ;
    const aoLongoMm = (dxM * w.alongDirX + dzM * w.alongDirZ) * 1000;
    const paraDentroMm = (dxM * w.intoDirX + dzM * w.intoDirZ) * 1000;
    const folgaMm = paraDentroMm - meiaProfMm;          // traseira até a parede
    if (folgaMm > PROJECT_SNAP_TO_WALL_MM || folgaMm < -meiaProfMm) return;
    const larguraDaParedeMm = getProjectWallWidthMm(w.wallIndex);
    const esquerdaMm = aoLongoMm - larguraMm / 2;
    // Precisa caber e estar dentro do trecho — encostar "no ar", passando da
    // ponta da parede, não é encostar.
    if (esquerdaMm < -larguraMm / 2 || esquerdaMm > larguraDaParedeMm - larguraMm / 2) return;
    if (!melhor || folgaMm < melhor.folgaMm) {
      melhor = {
        wallIndex: w.wallIndex,
        xMm: clamp(esquerdaMm, 0, Math.max(0, larguraDaParedeMm - larguraMm)),
        folgaMm
      };
    }
  });
  return melhor;
}
function projectPointerPulledIntoRoom(state, ev) {
  const wallGeo = getProjectWallGeometry().find((w) => w.wallIndex === state.liveWallIndex);
  if (!wallGeo) return false;
  const fp = projectFloorPointMm(ev.clientX, ev.clientY);
  if (!fp) return false;
  // Distância do ponto do piso até o PLANO da parede, medida no sentido de
  // dentro do ambiente. Negativa = atrás da parede.
  const dentroMm = ((fp.xMm / 1000 - wallGeo.originX) * wallGeo.intoDirX
    + (fp.zMm / 1000 - wallGeo.originZ) * wallGeo.intoDirZ) * 1000;
  return dentroMm >= PROJECT_PULL_TO_FLOOR_MM;
}

// PROFUNDIDADE DO PISO desenhado — espelha ROOM_MIN_FLOOR_DEPTH_M (1,8m) de
// viewer3d_composition.js, que cresce junto com o móvel mais fundo do
// ambiente. Usada só pra travar a ilha dentro do piso; se as duas contas
// divergirem um pouco, o efeito é a ilha parar um dedo antes da borda — nunca
// depois, que é o que não pode acontecer.
const PROJECT_FLOOR_MIN_DEPTH_MM = 1800;
function projectFloorDepthMm() {
  const maisFundo = projectSlots.reduce((mx, s) => Math.max(mx, Number(s.depth_mm || 0)), 0);
  return Math.max(PROJECT_FLOOR_MIN_DEPTH_MM, maisFundo + 400);
}

// Mantém uma ilha dentro do retângulo do ambiente (entre as paredes laterais,
// da parede de fundo pra frente). Sem isso, soltar perto da borda do piso
// deixaria o móvel meio atravessado na parede.
//
// 2026-08-13 ("no chao nunca deixe ele sair do quadrado do chao"): ganhou o
// limite da FRENTE (antes só travava contra a parede de fundo, então dava pra
// arrastar o móvel pra fora do piso pela frente) e passou a ser chamada
// durante o ARRASTE, não só ao soltar — arrastar pra fora e ver o móvel
// voltando sozinho no fim é pior que ele parar na borda.
function clampFloorSlotIntoRoom(slot) {
  const p = clampFloorPointIntoRoom(slot, Number(slot.floor_x_mm || 0), Number(slot.floor_z_mm || 0));
  slot.floor_x_mm = p.x;
  slot.floor_z_mm = p.z;
}
function clampFloorPointIntoRoom(slot, xMm, zMm) {
  const fp = floorSlotFootprint(slot);
  const halfW = fp.w / 2;
  const halfD = fp.h / 2;

  // O RETÂNGULO VEM DO PISO DESENHADO (2026-08-13, "ele ta com uma limitacao
  // bem estranha e nao vem ate a ponta do piso. que ta livre"). A 1ª versão
  // estimava a área aqui — largura da parede principal e uma profundidade
  // chutada — e a estimativa era MENOR que o piso de verdade, então o móvel
  // parava no meio do nada. Agora quem responde é quem desenha
  // (ViewerProjectEdit.getFloorRectM); a estimativa antiga ficou só de reserva
  // pro caso do 3D ainda não ter sido construído.
  const rect = (ViewerProjectEdit && ViewerProjectEdit.getFloorRectM)
    ? ViewerProjectEdit.getFloorRectM() : null;
  let xMin, xMax, zMin, zMax;
  if (rect) {
    xMin = rect.x0 * 1000 + halfW; xMax = rect.x1 * 1000 - halfW;
    zMin = rect.z0 * 1000 + halfD; zMax = rect.z1 * 1000 - halfD;
  } else {
    const roles = getProjectWallRoles();
    const mainWidthMm = getProjectWallWidthMm(Math.max(roles.indexOf('main'), 0));
    xMin = -mainWidthMm / 2 + halfW; xMax = mainWidthMm / 2 - halfW;
    zMin = halfD; zMax = Math.max(projectFloorDepthMm() - halfD, halfD);
  }
  const meioX = (xMin + xMax) / 2;
  const meioZ = (zMin + zMax) / 2;
  return {
    // Móvel MAIOR que o ambiente inverte os limites (mín > máx) e o clamp
    // comum jogaria ele pro canto. Nesse caso o certo é o meio.
    x: (xMin > xMax) ? meioX : clamp(Number(xMm || 0), xMin, xMax),
    z: (zMin > zMax) ? meioZ : clamp(Number(zMm || 0), zMin, zMax)
  };
}

// ---------- Modal "Buscar módulo" (botão da biblioteca) ----------
// Pedido do usuário (2026-07-23): "quero um botao buscar no lugar de
// digitar... quando clicado deve abrir uma nova janela mostrando as abas em
// 3 camadas, e os modulos abaixo conforme a escolha das camadas" — clicar
// num módulo já insere no projeto e fecha o modal (mesmo comportamento do
// clique na biblioteca lateral). Estado PRÓPRIO (não usa
// projectSelectedFamilyId do dropdown da biblioteca, nem
// selectedCategoryId/SubcategoryId da aba "Novo Orçamento") — mesma cascata
// de sempre: família reescopa categoria, categoria reescopa subcategoria.
let projSearchModalFamilyId = '';
let projSearchModalCategoryId = '';
let projSearchModalSubcategoryId = '';

function renderProjectSearchModalFilterBars() {
  const familiesInScope = familiesCacheList.filter((f) => allModules.some((m) => m.family_id === f.id));
  if (projSearchModalFamilyId && !familiesInScope.some((f) => f.id === projSearchModalFamilyId)) {
    projSearchModalFamilyId = '';
  }
  const categoriesInScope = categoriesCacheList.filter((c) => allModules.some((m) =>
    m.category_id === c.id && (!projSearchModalFamilyId || m.family_id === projSearchModalFamilyId)
  ));
  if (projSearchModalCategoryId && !categoriesInScope.some((c) => c.id === projSearchModalCategoryId)) {
    projSearchModalCategoryId = '';
  }
  const subcategoriesInScope = subcategoriesCacheList.filter((s) => allModules.some((m) =>
    m.subcategory_id === s.id
    && (!projSearchModalFamilyId || m.family_id === projSearchModalFamilyId)
    && (!projSearchModalCategoryId || m.category_id === projSearchModalCategoryId)
  ));
  if (projSearchModalSubcategoryId && !subcategoriesInScope.some((s) => s.id === projSearchModalSubcategoryId)) {
    projSearchModalSubcategoryId = '';
  }
  renderTabBar('po-proj-search-filter-family', familiesInScope, projSearchModalFamilyId, (id) => {
    projSearchModalFamilyId = id;
    renderProjectSearchModalFilterBars();
    renderProjectSearchModalGrid();
  });
  renderTabBar('po-proj-search-filter-category', categoriesInScope, projSearchModalCategoryId, (id) => {
    projSearchModalCategoryId = id;
    projSearchModalSubcategoryId = '';
    renderProjectSearchModalFilterBars();
    renderProjectSearchModalGrid();
  });
  renderTabBar('po-proj-search-filter-subcategory', subcategoriesInScope, projSearchModalSubcategoryId, (id) => {
    projSearchModalSubcategoryId = id;
    renderProjectSearchModalFilterBars();
    renderProjectSearchModalGrid();
  });
}

function renderProjectSearchModalGrid() {
  const grid = document.getElementById('po-proj-search-modal-grid');
  if (!grid) return;
  const list = (allModules || []).filter((m) =>
    (!projSearchModalFamilyId || m.family_id === projSearchModalFamilyId) &&
    (!projSearchModalCategoryId || m.category_id === projSearchModalCategoryId) &&
    (!projSearchModalSubcategoryId || m.subcategory_id === projSearchModalSubcategoryId)
  );
  grid.innerHTML = '';
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'po-proj-library-empty';
    empty.textContent = I18n.t('step1.no_modules_found');
    grid.appendChild(empty);
    return;
  }
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  list.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'po-proj-library-card';
    card.title = m.name;
    const dimsLine = `${formatDimension(m.width_default_mm, unit)} x ${formatDimension(m.height_default_mm, unit)} x ${formatDimension(m.depth_default_mm, unit)}`;
    card.innerHTML = `
      ${moduleCardImage(m)}
      <div class="po-proj-library-card-name">${m.name}</div>
      <div class="po-proj-library-card-dims">${dimsLine}</div>
    `;
    // Mesmo comportamento da biblioteca lateral (insertProjectModuleDefault
    // insere já com config padrão) — só que aqui também fecha o modal em
    // seguida, pra voltar direto pro canvas com o módulo já no ambiente.
    card.addEventListener('click', () => {
      // MODO SUBSTITUIR (2026-08-13): a mesma busca serve pros dois gestos —
      // inserir um módulo novo ou trocar o que está selecionado. Quem decide é
      // projectReplaceSlotId, armado pelo botão ⇄ da barra do módulo.
      if (projectReplaceSlotId != null) {
        const alvo = projectReplaceSlotId;
        projectReplaceSlotId = null;
        replaceProjectSlotModule(alvo, m.id);
      } else {
        insertProjectModuleDefault(m.id);
      }
      closeProjectSearchModal();
    });
    grid.appendChild(card);
  });
}

function openProjectSearchModal() {
  renderProjectSearchModalFilterBars();
  renderProjectSearchModalGrid();
  document.getElementById('po-proj-search-modal').classList.add('open');
}

function closeProjectSearchModal() {
  document.getElementById('po-proj-search-modal').classList.remove('open');
  // Fechar sem escolher DESARMA a substituição — senão a próxima vez que a
  // busca fosse aberta pelo botão normal trocaria o módulo em vez de inserir.
  projectReplaceSlotId = null;
}

const projLibrarySearchBtn = document.getElementById('po-proj-library-search-btn');
if (projLibrarySearchBtn) {
  projLibrarySearchBtn.addEventListener('click', openProjectSearchModal);
}
const projSearchModalCloseBtn = document.getElementById('po-proj-search-modal-close');
if (projSearchModalCloseBtn) {
  projSearchModalCloseBtn.addEventListener('click', closeProjectSearchModal);
}
const projSearchModalEl = document.getElementById('po-proj-search-modal');
if (projSearchModalEl) {
  projSearchModalEl.addEventListener('click', (ev) => {
    if (ev.target.id === 'po-proj-search-modal') closeProjectSearchModal();
  });
}
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && projSearchModalEl && projSearchModalEl.classList.contains('open')) {
    closeProjectSearchModal();
  }
});

// ---------- Abrir/fechar o configurador em modo "Projeto" ----------
// Espelha startCompositionSlotConfig/exitCompositionSlotConfig quase ao pé
// da letra — mesmo overlay (#po-tab-new-order em modo modal), só que grava
// o destino em addTargetProjectSlotId em vez de addTargetSlotIndex.

function startProjectSlotConfig(slotId) {
  addTargetProjectSlotId = slotId;
  highlightSelectedModuleCard('');
  document.getElementById('po-config-section').style.display = 'none';
  document.getElementById('po-module-description').textContent = '';
  currentModule = null;
  lastItemResult = null;

  document.getElementById('po-proj-mode-banner').style.display = 'flex';
  document.getElementById('po-add-item-btn').textContent = I18n.t('step2.add_to_project_btn');

  // Altura do chão (mm) — mesmo campo que a Composição usa
  // (po-comp-floor-height-wrap), reaproveitado aqui como a posição VERTICAL
  // de verdade do módulo no ambiente (ver floor_height_mm em projectSlots).
  // Editando um slot já existente, restoreSlotStateIntoConfigurator
  // (chamada por editProjectSlot logo depois) sobrescreve com o valor de
  // verdade salvo; aqui só um palpite inicial (posição atual se já existe,
  // 0 se é módulo novo).
  const floorHeightWrap = document.getElementById('po-comp-floor-height-wrap');
  if (floorHeightWrap) floorHeightWrap.style.display = 'block';
  const existing = projectSlots.find((s) => s.id === slotId);
  currentFloorHeightMm = existing ? Number(existing.floor_height_mm || 0) : 0;
  refreshFloorHeightInputUI();
  renderFloorHeightPresetChips();

  const newOrderTab = document.getElementById('po-tab-new-order');
  newOrderTab.classList.add('po-modal-mode');
  newOrderTab.style.display = 'block';
  newOrderTab.scrollTop = 0;
  window.scrollTo(0, 0);
}

function exitProjectSlotConfig() {
  addTargetProjectSlotId = null;
  document.getElementById('po-proj-mode-banner').style.display = 'none';
  document.getElementById('po-add-item-btn').textContent = I18n.t('step2.add_to_order_btn');
  const floorHeightWrap = document.getElementById('po-comp-floor-height-wrap');
  if (floorHeightWrap) floorHeightWrap.style.display = 'none';
  const newOrderTab = document.getElementById('po-tab-new-order');
  newOrderTab.classList.remove('po-modal-mode');
  newOrderTab.style.display = 'none';
}

// ---------- Inserção direta com config PADRÃO (pedido do usuário, 2ª rodada) ----------
// Busca só o que precisa pra montar um slot padrão (peças/cores/dobradiça/
// corrediça) SEM tocar nos globais do configurador de tela cheia (pieces/
// currentModule/moduleColorsByRole etc. — esses continuam servindo só a
// aba "Novo Orçamento"/"Editar configuração completa", ver
// startProjectSlotConfig). Cada projectSlot carrega sua PRÓPRIA cópia
// (slot.pieces/slot.colorOptionsByRole/...), então vários módulos no
// projeto nunca disputam o mesmo estado global.

async function fetchModuleColorsByRoleRaw(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_colors')
    .select('color_id, color_role_id, colors(*)')
    .eq('module_id', moduleId);
  if (error) { console.error(error); return {}; }
  const byRole = {};
  (data || []).forEach((row) => {
    if (!row.colors || !row.colors.active) return;
    if (!byRole[row.color_role_id]) byRole[row.color_role_id] = [];
    byRole[row.color_role_id].push(row.colors);
  });
  Object.keys(byRole).forEach((roleId) => byRole[roleId].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
  return byRole;
}

async function fetchModuleHingeModelsRaw(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_hinge_models')
    .select('hinge_model_id, hinge_models(*)')
    .eq('module_id', moduleId);
  if (error) { console.error(error); return []; }
  return (data || []).map((row) => row.hinge_models).filter((h) => h && h.active);
}

async function fetchModuleSlideModelsRaw(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_slide_models')
    .select('slide_model_id, slide_models(*)')
    .eq('module_id', moduleId);
  if (error) { console.error(error); return []; }
  return (data || []).map((row) => row.slide_models).filter((s) => s && s.active);
}

// Quantidade padrão de cada peça configurável (prateleira/gaveta com
// quantity_configurable) — recursivo, mesmo cuidado da memória "shallow
// piece checks" (não parar só no 1º nível, uma peça-módulo aninhada pode
// ter peças configuráveis escondidas dentro dela).
function collectDefaultShelfQuantities(piecesList, acc) {
  acc = acc || {};
  (piecesList || []).forEach((p) => {
    if (p.quantity_configurable) {
      acc[p.id] = (p.quantity_default !== null && p.quantity_default !== undefined) ? p.quantity_default : p.quantity;
    }
    if (p.child_pieces && p.child_pieces.length) collectDefaultShelfQuantities(p.child_pieces, acc);
  });
  return acc;
}

// `overrides` (migration 080) é usado SÓ pelo gerador por IA — o clique
// normal na biblioteca continua chamando sem segundo argumento e se comporta
// exatamente como antes. Serve pra forçar largura/parede/altura do chão/X do
// slot que está sendo criado, em vez de aceitar os defaults do catálogo.
// Deliberadamente NÃO aceita preço nem peças: o resultado de um módulo
// inserido pela IA tem que ser idêntico ao mesmo módulo inserido na mão.
// Devolve o slot criado (ou null), pra quem chamou conseguir encadear.
async function insertProjectModuleDefault(moduleId, overrides = null) {
  const m = allModules.find((mm) => mm.id === moduleId);
  if (!m) return null;
  const errorEl = document.getElementById('po-proj-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    const [modulePieces, colorOptionsByRole, hingeModelOptions, slideModelOptions, lockedDimensionPresets] = await Promise.all([
      loadRecursivePiecesForModule(m.id),
      fetchModuleColorsByRoleRaw(m.id),
      fetchModuleHingeModelsRaw(m.id),
      fetchModuleSlideModelsRaw(m.id),
      // Valores de largura/altura TRAVADOS (m.width_locked/height_locked) —
      // pedido do usuário 2026-07-26: as setinhas de esticar do canvas
      // pulam entre esses valores em vez de aceitar qualquer medida contínua
      // (ver widthPresetsMm/heightPresetsMm no slot, usados por
      // updateProjectSlotDimension/updateProjectSlotWidthFromLeft).
      fetchModuleLockedDimensionPresets(m.id)
    ]);

    const usedRoleIds = collectUsedColorRoleIds(modulePieces);
    const colorsByRole = {};
    usedRoleIds.forEach((roleId) => {
      const opts = colorOptionsByRole[roleId];
      if (opts && opts.length) colorsByRole[roleId] = opts[0];
    });
    // BUG achado 2026-07-21 (usuário: "puxei o projeto e não apareceu
    // nada" — na real todo módulo era pulado com "Nenhuma cor selecionada
    // para a peça X" no console): este caminho de inserção rápida (clicar
    // na biblioteca insere direto, ver projects_screen_2d_canvas na
    // memória) preenchia colorsByRole normalmente (renderiza/precifica bem
    // na hora), mas `selectedColors` — o snapshot que serializeProjectSlots
    // grava de verdade no banco — ficava um array VAZIO fixo, nunca
    // preenchido a partir de colorsByRole. Ao salvar e recarregar, o
    // restore reconstrói colorsByRole SÓ a partir de selectedColors — que
    // vinha vazio — e a peça correspondente não tinha cor nenhuma. Mesmo
    // formato de selectedColors usado pelo configurador completo (ver
    // "selected_colors (migration 035)" perto de po-add-item-btn).
    const selectedOptionalIds = modulePieces.filter((p) => p.client_optional && p.client_optional_default_on).map((p) => p.id);
    const effectivePieces = modulePieces.filter((p) => !p.client_optional || selectedOptionalIds.includes(p.id));
    const shelfQuantities = collectDefaultShelfQuantities(modulePieces);
    const hingeModel = hingeModelOptions[0] || null;
    const slideModel = slideModelOptions[0] || null;

    // Bug relatado pelo usuário (2026-07-24, com print mostrando "FAST
    // CLOSET" travado em 2408mm de altura no admin, mas entrando no Projetos
    // com 87" / ~2210mm): esse clamp de teto (maxHeightMm) reduzia a altura
    // até de módulo com altura TRAVADA (m.height_locked, "Valores sugeridos
    // de medida" no admin — cliente só escolhe entre os valores cadastrados,
    // sem régua livre). Medida travada é uma medida FIXA de catálogo (ex:
    // painel/porta com tamanho de fábrica) — não pode ser espremida por
    // nenhuma regra de ambiente (pé direito, rodapé...), "não importa a
    // regra", nas palavras do usuário. Por isso o teto só entra na conta
    // quando a altura NÃO está travada; travada, usa o default de catálogo
    // puro (só ainda clampado pelo min/max do PRÓPRIO módulo, que numa
    // configuração correta já bate com os presets cadastrados).
    const maxHeightMm = Math.max(roomSettings.ceiling_mm - effectiveCeilingClearanceMm(m) - roomSettings.baseboard_mm, 0);
    const effHeightMaxMm = m.height_locked ? Number(m.height_max_mm || Infinity) : Math.min(Number(m.height_max_mm || Infinity), maxHeightMm);
    // Largura pedida pela IA passa pelo MESMO clamp do default de catálogo —
    // a Edge Function já clampa, mas nunca confiar só nela (o mín/máx pode
    // ter mudado no admin entre montar o prompt e aplicar a resposta).
    const requestedWidthMm = overrides && Number(overrides.width_mm) > 0
      ? Number(overrides.width_mm)
      : Number(m.width_default_mm || 0);
    const width_mm = clamp(requestedWidthMm, Number(m.width_min_mm || 0), Number(m.width_max_mm || Infinity));
    // Altura por override (2026-08-21) — mesma ideia da largura acima, só que
    // até agora só a IA tinha esse caminho. Adicionado pro dropdown de
    // referência/SKU da biblioteca (ver renderProjectLibrary/skuOptionLabelForUnit):
    // uma referência pode definir largura E altura juntas (ex: "B30" =
    // 30"x34.5"), e sem isso a altura entrava sempre com o default do
    // catálogo, ignorando o que a referência escolhida realmente é.
    const requestedHeightMm = overrides && Number(overrides.height_mm) > 0
      ? Number(overrides.height_mm)
      : Number(m.height_default_mm || 0);
    const height_mm = clamp(requestedHeightMm, Number(m.height_min_mm || 0), effHeightMaxMm);
    const depth_mm = clamp(Number(m.depth_default_mm || 0), Number(m.depth_min_mm || 0), Number(m.depth_max_mm || Infinity));

    const result = m.is_decoration
      ? { total: 0, breakdown: [] }
      : Pricing.calculateModulePrice({
        module: m, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
        shelfQuantities, dimOverrides: {}, pieceColorOverrides: {},
        width_mm, height_mm, depth_mm, markupMultiplier: resolveMarkupMultiplierForModule(m)
      });

    const slot = {
      id: newProjectSlotId(),
      wall_index: (overrides && Number.isFinite(Number(overrides.wall_index))) ? Number(overrides.wall_index) : projectActiveWallIndex,
      x_mm: 0,
      floor_height_mm: (overrides && Number(overrides.floor_height_mm) > 0) ? Number(overrides.floor_height_mm) : 0,
      z_order: 0,
      // Módulo de PAREDE por padrão; vira ilha só se o drop pedir (ver
      // isFloorSlot/convertProjectSlotToFloor logo abaixo).
      placement: 'wall',
      floor_x_mm: 0,
      floor_z_mm: 0,
      floor_rotation_deg: 0,
      module: m,
      pieces: modulePieces,
      colorOptionsByRole,
      colorsByRole,
      selectedColors: Object.keys(colorsByRole).map((roleId) => ({
        role_id: roleId,
        role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null,
        color_id: colorsByRole[roleId] ? colorsByRole[roleId].id : null,
        color_name: colorsByRole[roleId] ? colorsByRole[roleId].name : null
      })),
      pieceColorOverrides: {},
      // removedPieceIds (2026-08-20): peças removidas manualmente pelo
      // cliente no modal "Peças do móvel" — começa vazio, nasce junto com o
      // slot pra projectSlotEffectivePieces sempre achar o array (ver
      // portal-06b-projetos-canvas-ia-custo.js).
      removedPieceIds: [],
      hingeModel, slideModel,
      width_mm, height_mm, depth_mm,
      shelfQuantities,
      dimOverrides: {},
      selectedOptionalIds,
      result,
      thumbnail_data_url: null,
      widthPresetsMm: lockedDimensionPresets.width,
      heightPresetsMm: lockedDimensionPresets.height,
      // Versão com label/SKU (ver dimRow em portal-06c-projetos-canvas-3d-acoes.js)
      // — mesma fonte, só que preservando o rótulo cadastrado no admin em vez
      // de só o valor em mm.
      widthPresetsLabeled: lockedDimensionPresets.widthLabeled,
      heightPresetsLabeled: lockedDimensionPresets.heightLabeled
    };
    // Soltar no CHÃO (2026-08-08) — arrastar da biblioteca e largar em cima do
    // piso cria um módulo ILHA em vez de um módulo de parede (ver isFloorSlot).
    // As coordenadas já vêm em mm de mundo de quem chamou (o drop sabe onde o
    // ponteiro cruzou o plano y=0).
    if (overrides && overrides.placement === 'floor') {
      convertProjectSlotToFloor(slot, Number(overrides.floor_x_mm || 0), Number(overrides.floor_z_mm || 0));
    } else {
      slot.x_mm = (overrides && Number.isFinite(Number(overrides.x_mm)))
        ? Number(overrides.x_mm)
        : computeDefaultProjectSlotX(slot.width_mm);
      resolveProjectSlotDepth(slot, projectSlotsOnWall(slot.wall_index));
    }
    projectSlots.push(slot);
    // A IA insere vários módulos em sequência: selecionar e re-renderizar a
    // cada um é desperdício (e faz a tela piscar). Quem chamou com overrides
    // é responsável por renderizar/marcar sujo no fim do lote.
    if (!overrides) {
      selectedProjectSlotId = slot.id;
      renderProjectCanvas();
      markProjectDirty();
    }
    return slot;
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message || String(err); errorEl.style.display = 'block'; }
    return null;
  }
}

