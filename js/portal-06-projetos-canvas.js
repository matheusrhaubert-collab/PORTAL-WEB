// portal-06-projetos-canvas.js — parte 6/9 de js/portal.js (ver
// portal-01-core-catalogo.js). Aba "Projetos" — o CANVAS 3D em si: arrastar
// da biblioteca, desfazer, gerador de projeto por IA, colisão entre módulos,
// modo câmera no toque (iPad), barras flutuantes, propriedades do módulo,
// duplicar/substituir/remover, contagem de furos pro preço, $ Fábrica, limite
// da furadeira, setas de redimensionar, botão Customizar. É o maior dos 9 —
// candidato a quebrar de novo no futuro se crescer mais.

// Alterações não salvas (pedido do usuário 2026-07-29) — true a partir da
// primeira edição de verdade (mover/redimensionar/trocar cor/forma da
// parede/adicionar/remover módulo), false de novo só ao salvar
// (saveProjectFavorite) ou carregar/resetar um projeto (restoreFavoriteProject/
// resetProject). Usado pra avisar antes de trocar de aba com edição perdida
// (ver o listener de .portal-tab-btn, mais abaixo no arquivo).
let projectDirty = false;
function markProjectDirty() {
  projectDirty = true;
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
  } else {
    slot.x_mm = Number(slot.x_mm || 0) - Number(slot.width_mm || 0) / 2;
    slot.floor_height_mm = Math.max(0, Number(slot.floor_height_mm || 0) - Number(slot.height_mm || 0) / 2);
    clampProjectSlotPosition(slot);
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
    const height_mm = clamp(Number(m.height_default_mm || 0), Number(m.height_min_mm || 0), effHeightMaxMm);
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
      hingeModel, slideModel,
      width_mm, height_mm, depth_mm,
      shelfQuantities,
      dimOverrides: {},
      selectedOptionalIds,
      result,
      thumbnail_data_url: null,
      widthPresetsMm: lockedDimensionPresets.width,
      heightPresetsMm: lockedDimensionPresets.height
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

// ==========================================================================
// GERADOR DE PROJETO POR IA (migration 080)
// ==========================================================================
//
// Fluxo: cliente mede a parede nos campos que já existem -> clica "Gerar com
// IA" -> responde 3-4 perguntas -> a Edge Function generate-project-layout
// (Gemini 2.5 Flash, texto) devolve uma lista de módulos -> ESTE arquivo
// valida a lista contra a receita do ambiente (room_recipes), completa o que
// faltou e cria os slots pelo caminho normal (insertProjectModuleDefault).
//
// A DIVISÃO É PROPOSITAL, não afrouxar:
//   IA decide  -> quais módulos e que largura (gosto/proporção).
//   JS decide  -> se o ambiente está completo, onde cada módulo encosta,
//                 quanto custa. Tudo determinístico e auditável.
//
// Por isso o resultado de um projeto gerado por IA é indistinguível de um
// montado na mão: mesmo slot, mesmo preço, mesma furação, mesmo 3D. Ele entra
// sujo (markProjectDirty) e o cliente continua editando normalmente.

let projectAiFunctions = [];   // module_functions
let projectAiRoomTypes = [];   // room_types
let projectAiRecipesByRoom = {}; // room_type_id -> [room_recipes] (com função embutida)
let projectAiRunning = false;

// Altura do chão onde começa a fileira de aéreos. 1400mm é a convenção de
// bancada (900) + faixa livre (500) — não vira campo de cadastro por ora
// porque o cliente pode arrastar depois; se virar reclamação recorrente,
// promover pra coluna em room_types em vez de espalhar constante.
const PROJECT_AI_UPPER_ROW_FLOOR_MM = 1400;

// Perguntas por ambiente. `key` é o que vai no prompt (em português mesmo —
// o Gemini lê bem, e assim o admin consegue relacionar pergunta e resposta
// olhando o log). Ambiente sem entrada aqui cai em PROJECT_AI_COMMON_QUESTIONS
// só, que já é suficiente pra gerar algo razoável.
// labelKey/optionKeys em vez de texto cravado (2026-08-18): estas perguntas
// aparecem PRA QUEM COMPRA, então precisam sair em pt/en/es como todo o resto.
// O texto é resolvido em renderProjectAiQuestions, na hora de desenhar — a
// resposta escolhida vai pra IA já no idioma do cliente, o que é indiferente
// pro modelo e evita ter que manter uma tabela de-para.
const PROJECT_AI_COMMON_QUESTIONS = [
  {
    key: 'orcamento',
    labelKey: 'project_ai.q_budget',
    optionKeys: ['project_ai.q_budget_1', 'project_ai.q_budget_2', 'project_ai.q_budget_3']
  },
  {
    key: 'estilo',
    labelKey: 'project_ai.q_style',
    optionKeys: ['project_ai.q_style_1', 'project_ai.q_style_2', 'project_ai.q_style_3', 'project_ai.q_style_4']
  }
];

const PROJECT_AI_QUESTIONS = {
  kitchen: [
    {
      key: 'quem_cozinha',
      labelKey: 'project_ai.q_cooking',
      optionKeys: ['project_ai.q_cooking_1', 'project_ai.q_cooking_2', 'project_ai.q_cooking_3']
    },
    {
      key: 'eletros',
      labelKey: 'project_ai.q_appliances',
      optionKeys: ['project_ai.q_appliances_1', 'project_ai.q_appliances_2', 'project_ai.q_appliances_3']
    },
    {
      key: 'aereos',
      labelKey: 'project_ai.q_upper',
      optionKeys: ['project_ai.q_upper_1', 'project_ai.q_upper_2', 'project_ai.q_upper_3']
    }
  ],
  closet: [
    {
      key: 'pendurado_vs_dobrado',
      labelKey: 'project_ai.q_hanging',
      optionKeys: ['project_ai.q_hanging_1', 'project_ai.q_hanging_2', 'project_ai.q_hanging_3']
    },
    { key: 'calcados', labelKey: 'project_ai.q_shoes', optionKeys: ['project_ai.q_shoes_1', 'project_ai.q_shoes_2', 'project_ai.q_shoes_3'] }
  ],
  office: [
    { key: 'uso', labelKey: 'project_ai.q_usage', optionKeys: ['project_ai.q_usage_1', 'project_ai.q_usage_2', 'project_ai.q_usage_3'] },
    { key: 'armazenamento', labelKey: 'project_ai.q_storage', optionKeys: ['project_ai.q_storage_1', 'project_ai.q_storage_2', 'project_ai.q_storage_3'] }
  ]
};

function projectAiQuestionsFor(roomKey) {
  return (PROJECT_AI_QUESTIONS[roomKey] || []).concat(PROJECT_AI_COMMON_QUESTIONS);
}

// Carregado uma vez no boot do portal (ver a chamada em initPortal/loadModules
// — junto do resto do catálogo). Falha aqui não pode derrubar a aba Projetos:
// sem migration 080 rodada, as tabelas nem existem e o botão só fica escondido.
async function loadProjectAiConfig() {
  try {
    const [fnRes, roomRes, recipeRes] = await Promise.all([
      supabaseClient.from('module_functions').select('*').eq('active', true).order('sort_order'),
      supabaseClient.from('room_types').select('*').eq('active', true).order('sort_order'),
      supabaseClient.from('room_recipes').select('*').order('priority', { ascending: false })
    ]);
    if (fnRes.error || roomRes.error || recipeRes.error) throw (fnRes.error || roomRes.error || recipeRes.error);
    projectAiFunctions = fnRes.data || [];
    projectAiRoomTypes = roomRes.data || [];
    projectAiRecipesByRoom = {};
    (recipeRes.data || []).forEach((r) => {
      if (!projectAiRecipesByRoom[r.room_type_id]) projectAiRecipesByRoom[r.room_type_id] = [];
      projectAiRecipesByRoom[r.room_type_id].push(r);
    });
  } catch (err) {
    // Silencioso de propósito: quem não rodou a migration não deve ver erro
    // vermelho numa aba que funciona perfeitamente sem esta funcionalidade.
    console.warn('Gerador por IA indisponível (migration 080 rodada?):', err);
    projectAiFunctions = [];
    projectAiRoomTypes = [];
    projectAiRecipesByRoom = {};
  }
  refreshProjectAiButton();
}

// O botão fica SEMPRE visível. A 1ª versão disto escondia o botão quando
// faltava receita ou função cadastrada — e o resultado foi um botão que
// simplesmente não existia, sem nenhuma pista do porquê (o usuário abriu a
// aba, não achou nada e teve que perguntar). Configuração faltando agora é
// explicada ao abrir o modal (projectAiConfigProblem), não escondida.
function refreshProjectAiButton() {
  const btn = document.getElementById('po-proj-ai-open-btn');
  if (!btn) return;
  // DESLIGADO a pedido do usuário (2026-08-06): "desabilita esse botão por
  // enquanto, vamos seguir com ele no futuro". A Edge Function estava
  // devolvendo 503 e a prioridade virou o controle do módulo no iPad.
  // Nada foi apagado — migration 080, admin, Edge Function e todo o código
  // do questionário seguem intactos. Pra religar, troque a linha abaixo por
  //   btn.style.display = '';
  btn.style.display = 'none';
}

// Devolve a mensagem do que está faltando pra usar o gerador, ou null se está
// tudo pronto. Ordem das checagens = ordem em que a pessoa precisa resolver.
function projectAiConfigProblem() {
  if (projectAiRoomTypes.length === 0) {
    return I18n.t('project_ai.config_missing_tables');
  }
  const hasRoomWithRecipe = projectAiRoomTypes.some((rt) => (projectAiRecipesByRoom[rt.id] || []).length > 0);
  if (!hasRoomWithRecipe) {
    return I18n.t('project_ai.config_no_recipe');
  }
  if (!allModules.some((m) => m.function_id)) {
    return I18n.t('project_ai.config_no_function');
  }
  return null;
}

function projectAiFunctionById(id) {
  return projectAiFunctions.find((f) => f.id === id) || null;
}

// ---------- Modal ----------

function openProjectAiModal() {
  const modal = document.getElementById('po-proj-ai-modal');
  if (!modal) return;

  // Configuração faltando: abre o modal mesmo assim, mostrando exatamente o
  // que falta e escondendo o formulário/botão de gerar. Bem melhor que um
  // botão inerte ou invisível.
  const problem = projectAiConfigProblem();
  const formEl = document.getElementById('po-proj-ai-form');
  const runBtn = document.getElementById('po-proj-ai-run-btn');
  if (problem) {
    if (formEl) formEl.style.display = 'none';
    if (runBtn) runBtn.style.display = 'none';
    setProjectAiError(problem);
    setProjectAiStatus('');
    const summaryEl = document.getElementById('po-proj-ai-walls-summary');
    if (summaryEl) summaryEl.textContent = '';
    modal.classList.add('open');
    return;
  }
  if (formEl) formEl.style.display = '';
  if (runBtn) runBtn.style.display = '';

  const roomSel = document.getElementById('po-proj-ai-room-select');
  roomSel.innerHTML = '';
  projectAiRoomTypes
    .filter((rt) => (projectAiRecipesByRoom[rt.id] || []).length > 0)
    .forEach((rt) => {
      const opt = document.createElement('option');
      opt.value = rt.id;
      opt.textContent = rt.name;
      roomSel.appendChild(opt);
    });
  renderProjectAiQuestions();
  renderProjectAiWallsSummary();
  setProjectAiError('');
  setProjectAiStatus('');
  modal.classList.add('open');
}

function closeProjectAiModal() {
  const modal = document.getElementById('po-proj-ai-modal');
  if (modal) modal.classList.remove('open');
}

function selectedProjectAiRoom() {
  const roomSel = document.getElementById('po-proj-ai-room-select');
  const id = roomSel ? roomSel.value : '';
  return projectAiRoomTypes.find((rt) => rt.id === id) || null;
}

function renderProjectAiQuestions() {
  const wrap = document.getElementById('po-proj-ai-questions');
  if (!wrap) return;
  const room = selectedProjectAiRoom();
  wrap.innerHTML = '';
  if (!room) return;
  projectAiQuestionsFor(room.key).forEach((q) => {
    const field = document.createElement('div');
    field.className = 'dim-field';
    const label = document.createElement('label');
    label.textContent = I18n.t(q.labelKey);
    const sel = document.createElement('select');
    sel.className = 'po-proj-library-filter-select';
    sel.dataset.aiQuestionKey = q.key;
    q.optionKeys.map((k) => I18n.t(k)).forEach((optText) => {
      const opt = document.createElement('option');
      opt.value = optText;
      opt.textContent = optText;
      sel.appendChild(opt);
    });
    field.appendChild(label);
    field.appendChild(sel);
    wrap.appendChild(field);
  });
}

function collectProjectAiAnswers() {
  const answers = {};
  document.querySelectorAll('#po-proj-ai-questions select[data-ai-question-key]').forEach((sel) => {
    answers[sel.dataset.aiQuestionKey] = sel.value;
  });
  return answers;
}

// Mostra as medidas que a IA vai receber — vindas dos campos que já existem
// na tela, nunca digitadas de novo aqui (duas fontes de verdade pra mesma
// medida é receita de divergência).
function renderProjectAiWallsSummary() {
  const el = document.getElementById('po-proj-ai-walls-summary');
  if (!el) return;
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const parts = getProjectWallRoles().map((role, idx) => {
    const w = getProjectWallWidthMm(idx);
    return I18n.t('project_ai.wall_label', { n: idx + 1, size: formatDimension(w, unit) });
  });
  parts.push(I18n.t('project_ai.ceiling_label', { size: formatDimension(roomSettings.ceiling_mm, unit) }));
  el.textContent = parts.join(' · ');
}

function setProjectAiError(msg) {
  const el = document.getElementById('po-proj-ai-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function setProjectAiStatus(msg) {
  const el = document.getElementById('po-proj-ai-status');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

// ---------- Catálogo que vai no prompt ----------
//
// Só módulo ATIVO, VISÍVEL e COM FUNÇÃO. `price_hint` é o preço de catálogo
// aproximado (largura padrão, cores padrão) só pra IA respeitar a resposta de
// orçamento — ela não soma nada, o preço de verdade sai do Pricing depois.
// Aqui é o cached do módulo se existir; senão, null (a IA lida bem com
// ausência).
function buildProjectAiCatalog() {
  return allModules
    .filter((m) => m.function_id)
    .map((m) => {
      const fn = projectAiFunctionById(m.function_id);
      return {
        id: m.id,
        name: m.name,
        function_key: fn ? fn.key : null,
        mount_type: m.mount_type || (fn ? fn.mount_hint : null) || 'floor',
        width_min_mm: Number(m.width_min_mm) || 0,
        width_max_mm: Number(m.width_max_mm) || 0,
        width_default_mm: Number(m.width_default_mm) || 0,
        height_default_mm: Number(m.height_default_mm) || 0,
        depth_default_mm: Number(m.depth_default_mm) || 0,
        is_decoration: !!m.is_decoration,
        price_hint: null,
        ai_hint: m.ai_hint || null
      };
    })
    .filter((m) => m.function_key);
}

function buildProjectAiRecipePayload(room) {
  return (projectAiRecipesByRoom[room.id] || []).map((r) => {
    const fn = projectAiFunctionById(r.function_id);
    return {
      function_key: fn ? fn.key : null,
      function_name: fn ? fn.name : '',
      function_description: fn ? fn.description : null,
      mount_hint: fn ? fn.mount_hint : null,
      min_qty: Number(r.min_qty) || 0,
      max_qty: r.max_qty == null ? null : Number(r.max_qty),
      priority: Number(r.priority) || 0,
      placement_note: r.placement_note || null
    };
  }).filter((r) => r.function_key);
}

// ---------- Validação determinística contra a receita ----------
//
// ESTE é o pedaço que garante "ambiente completo" — não o prompt. Roda DEPOIS
// da IA responder:
//   1. corta o que passou do max_qty da função;
//   2. para cada função obrigatória (min_qty >= 1) que ficou faltando,
//      escolhe sozinho um módulo daquela função (o mais estreito que sirva,
//      pra ter mais chance de caber) e injeta;
//   3. devolve os avisos, que o cliente vê depois de gerar.
//
// Nunca "conserta" silenciosamente sem avisar: se completou ou removeu algo,
// isso aparece na tela. Projeto de cozinha errado e silencioso é pior que
// projeto incompleto e explícito.
function enforceProjectAiRecipe(items, room, catalog) {
  const recipe = projectAiRecipesByRoom[room.id] || [];
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const warnings = [];
  const kept = [];
  const countByFunction = {};

  items.forEach((it) => {
    const cat = catalogById.get(it.module_id);
    if (!cat) return; // já filtrado na Edge Function, mas nunca confiar
    const key = cat.function_key;
    const rule = recipe.find((r) => {
      const fn = projectAiFunctionById(r.function_id);
      return fn && fn.key === key;
    });
    const max = rule && rule.max_qty != null ? Number(rule.max_qty) : Infinity;
    const current = countByFunction[key] || 0;
    if (current >= max) {
      warnings.push(I18n.t('project_ai.warn_removed_extra', { name: (projectAiFunctions.find((f) => f.key === key) || {}).name || key }));
      return;
    }
    countByFunction[key] = current + 1;
    kept.push({ ...it, function_key: key, mount_type: cat.mount_type, is_decoration: cat.is_decoration });
  });

  // Completa funções obrigatórias que faltaram.
  recipe.forEach((r) => {
    const fn = projectAiFunctionById(r.function_id);
    if (!fn || Number(r.min_qty) < 1) return;
    const have = countByFunction[fn.key] || 0;
    const missing = Number(r.min_qty) - have;
    if (missing <= 0) return;
    const candidates = catalog
      .filter((c) => c.function_key === fn.key)
      .sort((a, b) => a.width_min_mm - b.width_min_mm);
    if (candidates.length === 0) {
      warnings.push(I18n.t('project_ai.warn_function_without_module', { name: fn.name }));
      return;
    }
    for (let i = 0; i < missing; i++) {
      const pick = candidates[0];
      kept.push({
        module_id: pick.id,
        function_key: fn.key,
        mount_type: pick.mount_type,
        is_decoration: pick.is_decoration,
        width_mm: pick.width_default_mm || pick.width_min_mm,
        wall_index: 0,
        order: 999,
        reasoning: null,
        auto_completed: true
      });
      countByFunction[fn.key] = (countByFunction[fn.key] || 0) + 1;
      warnings.push(I18n.t('project_ai.warn_auto_completed', { missing: fn.name, added: pick.name }));
    }
  });

  return { items: kept, warnings };
}

// ---------- Posicionamento (determinístico, nunca vem da IA) ----------
//
// Duas fileiras independentes por parede: chão (floor+tall) e suspensa
// (wall). Cada uma preenche da esquerda pra direita na ordem que a IA pediu.
// Se o que a IA escolheu não cabe, o excedente é CORTADO com aviso, em vez de
// empilhar módulo em cima de módulo — melhor entregar uma parede correta e
// avisar do que uma parede impossível.
//
// Decoração (fogão, geladeira, cuba) NÃO consome largura da fileira: ela
// representa o eletro em cima/dentro de um móvel que já ocupou o espaço. Ela
// é ancorada no X do último módulo não-decorativo da mesma parede.
function layoutProjectAiItems(items) {
  const placed = [];
  const warnings = [];
  const wallCount = getProjectWallCount();

  for (let wallIndex = 0; wallIndex < wallCount; wallIndex++) {
    const wallWidth = getProjectWallWidthMm(wallIndex);
    const onWall = items
      .filter((it) => Number(it.wall_index || 0) === wallIndex)
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const cursor = { floor: 0, wall: 0 };
    let lastFloorX = 0;
    let lastFloorWidth = 0;

    onWall.forEach((it) => {
      const isUpper = it.mount_type === 'wall';
      const row = isUpper ? 'wall' : 'floor';
      const width = Number(it.width_mm) || 0;

      if (it.is_decoration) {
        // Ancorada no último móvel colocado no chão desta parede (ou no
        // início, se ainda não houver nenhum).
        placed.push({
          ...it,
          wall_index: wallIndex,
          x_mm: lastFloorX,
          width_mm: Math.min(width || lastFloorWidth, wallWidth),
          floor_height_mm: 0
        });
        return;
      }

      if (cursor[row] + width > wallWidth + 1) {
        warnings.push(I18n.t('project_ai.warn_did_not_fit', { name: moduleNameById(it.module_id), n: wallIndex + 1 }));
        return;
      }
      const x = cursor[row];
      cursor[row] += width;
      if (!isUpper) { lastFloorX = x; lastFloorWidth = width; }
      placed.push({
        ...it,
        wall_index: wallIndex,
        x_mm: x,
        width_mm: width,
        floor_height_mm: isUpper ? projectAiUpperRowFloorMm() : 0
      });
    });
  }

  return { placed, warnings };
}

// Altura da fileira suspensa, respeitando o pé direito real do ambiente —
// numa sala de pé direito baixo, 1400mm fixo jogaria o aéreo pro teto.
function projectAiUpperRowFloorMm() {
  const usable = Math.max(roomSettings.ceiling_mm - roomSettings.baseboard_mm, 0);
  return Math.min(PROJECT_AI_UPPER_ROW_FLOOR_MM, Math.max(usable - 600, 0));
}

function moduleNameById(id) {
  const m = allModules.find((mm) => mm.id === id);
  return m ? m.name : I18n.t('project_ai.module_fallback_name');
}

// Traduz o erro de supabaseClient.functions.invoke numa frase que diz o que
// FAZER. supabase-js embrulha a resposta HTTP em error.context (um Response),
// e o corpo dela tem a mensagem escrita na própria Edge Function — sem ler
// isso, todo problema vira um "não respondeu" genérico que não ajuda ninguém.
async function describeEdgeFunctionError(error, data, functionName) {
  if (data && data.error) return data.error;

  const status = error && error.context && Number(error.context.status);
  if (status === 404) {
    return I18n.t('project_ai.err_function_not_deployed', { fn: functionName });
  }
  if (status === 401 || status === 403) {
    return I18n.t('project_ai.err_no_permission');
  }

  // Tenta ler a mensagem de dentro do corpo da resposta (pode já ter sido
  // consumido; por isso o try).
  if (error && error.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body && body.error) return body.error;
    } catch (e) { /* corpo já lido ou não é JSON — segue pro genérico */ }
  }

  if (status) return I18n.t('project_ai.err_status', { status });
  return I18n.t('project_ai.err_network');
}

// ---------- Execução ----------

async function runProjectAiGeneration() {
  if (projectAiRunning) return;
  const room = selectedProjectAiRoom();
  if (!room) { setProjectAiError(I18n.t('project_ai.err_select_room')); return; }

  // Projeto com módulo já posto: gerar SUBSTITUI tudo. Perguntar antes é
  // obrigatório — perder uma cozinha inteira montada na mão por causa de um
  // clique não é aceitável.
  if (projectSlots.length > 0) {
    const ok = confirm(I18n.t('project_ai.confirm_replace'));
    if (!ok) return;
  }

  projectAiRunning = true;
  setProjectAiError('');
  setProjectAiStatus(I18n.t('project_ai.status_calling'));
  const runBtn = document.getElementById('po-proj-ai-run-btn');
  if (runBtn) runBtn.disabled = true;

  try {
    const catalog = buildProjectAiCatalog();
    const recipe = buildProjectAiRecipePayload(room);
    if (catalog.length === 0) throw new Error(I18n.t('project_ai.err_no_module_function'));
    if (recipe.length === 0) throw new Error(I18n.t('project_ai.err_no_recipe'));

    const walls = getProjectWallRoles().map((role, idx) => ({
      index: idx,
      width_mm: getProjectWallWidthMm(idx),
      label: `parede ${idx + 1} (${role})`
    }));

    const { data, error } = await supabaseClient.functions.invoke('generate-project-layout', {
      body: {
        room: { key: room.key, name: room.name, note: room.questionnaire_note },
        walls,
        ceiling_mm: roomSettings.ceiling_mm,
        baseboard_mm: roomSettings.baseboard_mm,
        recipe,
        catalog,
        answers: collectProjectAiAnswers()
      }
    });

    // supabase-js marca como "error" por status HTTP, mas o corpo ainda traz
    // a mensagem boa da function — mesmo tratamento do generate-gallery-render.
    //
    // A 1ª versão disto devolvia sempre "A IA não respondeu, tente de novo",
    // o que mandou o usuário tentar de novo várias vezes quando a causa real
    // era a Edge Function nem estar publicada (404). Agora o motivo REAL vem
    // pra tela: 404 = falta deploy, 401/403 = login, e nos outros casos o
    // corpo da resposta (que tem a mensagem escrita na própria function,
    // incluindo "GEMINI_API_KEY não configurada").
    if (error && !(data && data.items)) {
      console.error('generate-project-layout falhou:', error, data);
      throw new Error(await describeEdgeFunctionError(error, data, 'generate-project-layout'));
    }
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error((data && data.error) || I18n.t('project_ai.err_empty_result'));
    }

    setProjectAiStatus(I18n.t('project_ai.status_building'));
    const { items: enforced, warnings: recipeWarnings } = enforceProjectAiRecipe(data.items, room, catalog);
    const { placed, warnings: layoutWarnings } = layoutProjectAiItems(enforced);
    if (placed.length === 0) throw new Error(I18n.t('project_ai.err_nothing_fits'));

    // Limpa e recria. Sequencial de propósito: insertProjectModuleDefault faz
    // várias queries por módulo e resolve profundidade contra os slots que já
    // estão na parede — em paralelo, a profundidade sairia inconsistente.
    projectSlots = [];
    selectedProjectSlotId = null;
    for (const it of placed) {
      await insertProjectModuleDefault(it.module_id, {
        wall_index: it.wall_index,
        x_mm: it.x_mm,
        width_mm: it.width_mm,
        floor_height_mm: it.floor_height_mm
      });
    }

    renderProjectCanvas();
    markProjectDirty();
    closeProjectAiModal();

    const allWarnings = recipeWarnings.concat(layoutWarnings);
    showProjectAiResult(data.summary, allWarnings);
  } catch (err) {
    setProjectAiError(err.message || String(err));
  } finally {
    projectAiRunning = false;
    setProjectAiStatus('');
    if (runBtn) runBtn.disabled = false;
  }
}

// O "porquê" do layout + o que precisou ser corrigido. Vai no bloco de erro/
// aviso que já existe na aba (po-proj-error), não num alert — o cliente
// precisa poder reler enquanto ajusta os módulos.
function showProjectAiResult(summary, warnings) {
  const el = document.getElementById('po-proj-error');
  if (!el) return;
  const lines = [];
  if (summary) lines.push(summary);
  if (warnings && warnings.length) lines.push(I18n.t('project_ai.auto_adjustments_prefix') + warnings.join(' '));
  if (lines.length === 0) return;
  el.textContent = lines.join(' — ');
  el.style.display = 'block';
}

// ---------- Listeners do modal ----------

(function attachProjectAiListeners() {
  const openBtn = document.getElementById('po-proj-ai-open-btn');
  if (openBtn) openBtn.addEventListener('click', openProjectAiModal);

  const closeBtn = document.getElementById('po-proj-ai-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', closeProjectAiModal);

  const cancelBtn = document.getElementById('po-proj-ai-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', closeProjectAiModal);

  const runBtn = document.getElementById('po-proj-ai-run-btn');
  if (runBtn) runBtn.addEventListener('click', runProjectAiGeneration);

  const roomSel = document.getElementById('po-proj-ai-room-select');
  if (roomSel) roomSel.addEventListener('change', renderProjectAiQuestions);

  // Fecha no clique fora e no Esc — mesmo padrão do modal de busca.
  const modal = document.getElementById('po-proj-ai-modal');
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeProjectAiModal(); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.classList.contains('open') && !projectAiRunning) closeProjectAiModal();
  });
})();

// Reabre o configurador já preenchido com a configuração salva de um slot do
// projeto (clicou "Editar configuração completa" no painel da direita) —
// mesmo padrão de editCompositionSlot, reaproveitando
// restoreSlotStateIntoConfigurator (genérica, não é específica de
// Composição) sem duplicar nada.
async function editProjectSlot(slotId) {
  const slot = projectSlots.find((s) => s.id === slotId);
  if (!slot) return;
  startProjectSlotConfig(slotId);
  try {
    await selectModule(slot.module.id);
    if (!currentModule) throw new Error(I18n.t('composition.edit_module_unavailable_error'));
    restoreSlotStateIntoConfigurator(slot);
  } catch (err) {
    exitProjectSlotConfig();
    const errorEl = document.getElementById('po-proj-error');
    if (errorEl) {
      errorEl.textContent = I18n.t('composition.edit_module_unavailable_error');
      errorEl.style.display = 'block';
    }
  }
}

const projModeCancelBtn = document.getElementById('po-proj-mode-cancel-btn');
if (projModeCancelBtn) {
  projModeCancelBtn.addEventListener('click', () => {
    exitProjectSlotConfig();
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
  });
}

// Posição horizontal padrão de um módulo NOVO — encosta à direita do último
// módulo já colocado NA PAREDE ATIVA (se couber na largura dela), senão
// volta pra x=0. Só um ponto de partida: o cliente arrasta pra reposicionar
// depois (o imã cuida do alinhamento fino).
function computeDefaultProjectSlotX(widthMm) {
  // Nasce DENTRO do vão útil, não em x=0 (2026-08-13). x=0 é o eixo do canto:
  // um módulo colocado ali já nasce metido na parede vizinha, e o usuário
  // ainda ia ter que arrastar pra fora. O recuo é a face interna dela.
  const recuo = projectWallCornerInsetMm(projectActiveWallIndex);
  const wallWidthMm = getProjectWallWidthMm(projectActiveWallIndex) - recuo.fim;
  const sameWallSlots = projectSlotsOnWall(projectActiveWallIndex);
  if (!sameWallSlots.length) return recuo.ini;
  const rightmost = sameWallSlots.reduce((max, s) => Math.max(max, Number(s.x_mm || 0) + Number(s.width_mm || 0)), recuo.ini);
  if (rightmost + widthMm <= wallWidthMm) return rightmost;
  return Math.max(recuo.ini, wallWidthMm - widthMm);
}

// ---------- Canvas 2D: medidas, imã (snap) e profundidade ----------

let projectPxPerMm = 1; // escala atual do canvas, recalculada a cada renderProjectCanvas()
let projectDragState = null;
const PROJECT_SNAP_PX = 10;                    // raio do "imã" em px de TELA — igual em qualquer zoom

// Raio do ímã pra Vista de Canto 3D (mm de verdade, não px de tela — ver
// snapMmOverride em snapProjectSlotAxis/snapProjectEdge). Pedido do usuário
// (2026-07-26, depois de testar o arrastar/esticar em 3D: "esperava
// encaixe automatico" e os módulos não estavam grudando): mais generoso que
// os ~10mm equivalentes do 2D, porque mirar com precisão via raycasting
// numa cena 3D em perspectiva é naturalmente menos preciso que um clique
// direto num canvas DOM plano — um raio pequeno quase nunca disparava.
const PROJECT_SNAP_3D_MM = 30;

// ÍMÃ DE CHÃO (2026-08-12) — "não está indo pro chão. preciso que ele se
// conecte ao chão quando eu puxar arrastando ele".
// O ímã de módulo (snapProjectSlotAxis) só encosta em OUTRO módulo: numa
// parede vazia, ou depois de atravessar a esquina pra uma parede sem
// vizinhos, não havia nada pra grudar e o módulo parava a 20/30mm do piso —
// perto o bastante pra parecer encostado na tela e errado de verdade no
// projeto. O chão passa a ser um alvo de ímã como qualquer outro.
//
// Raio generoso de propósito (mais que os 30mm entre módulos): "no chão" é o
// caso mais comum de todos, e módulo suspenso de verdade (aéreo) fica bem
// acima disso — quem quer 60mm de vão usa o campo de altura, não o arraste.
// 2026-08-12, 2ª rodada: 80mm era pouco pra valer na prática ("nao ta indo pro
// chao o movel"). 250mm é maior que qualquer rodapé e menor que qualquer
// módulo aéreo de verdade — na altura em que se arrasta um móvel de chão, ele
// desce; um armário suspenso a 1,4m não sente nada.
const PROJECT_FLOOR_SNAP_MM = 250;
function snapProjectSlotToFloor(yMm) {
  return (yMm > 0 && yMm <= PROJECT_FLOOR_SNAP_MM) ? 0 : yMm;
}

// Tem outro módulo bem embaixo deste, na faixa de parede que ele ocupa? Só
// serve pra decidir se o ímã de chão pode agir depois da colisão: com um
// vizinho embaixo, "encostar no chão" atravessaria ele.
function projectSlotHasNeighborBelow(slot, xMm, yMm) {
  const w = Number(slot.width_mm || 0);
  const x0 = Number(xMm || 0), x1 = x0 + w;
  return projectSlotsSameWallExcluding(slot).some(function (o) {
    const ox0 = Number(o.x_mm || 0), ox1 = ox0 + Number(o.width_mm || 0);
    const sobrepoeX = ox1 > x0 + 1 && ox0 < x1 - 1;   // 1mm de folga: encostar de lado não conta
    if (!sobrepoeX) return false;
    const topoDoVizinho = Number(o.floor_height_mm || 0) + Number(o.height_mm || 0);
    return topoDoVizinho > 1 && topoDoVizinho <= Number(yMm || 0) + 1;
  });
}
const PROJECT_CLICK_MOVE_THRESHOLD_PX = 4;      // abaixo disso, pointerup vira clique (seleciona) em vez de arraste
// Toque (iPad) — ver attachProjectSlotDrag. 4px de tolerância serve pra
// mouse, mas um dedo nunca fica parado nesse raio: o resultado no tablet era
// todo toque virar arraste e nada selecionar. 12px é a folga típica de dedo;
// 220ms é o tempo de "segurar" antes do arraste engatar (curto o suficiente
// pra não parecer travado, longo o suficiente pra não disparar num tap).
const PROJECT_TOUCH_SLOP_PX = 12;
// Escorregão que ainda vale como TOQUE no card da biblioteca (2026-08-16).
// Acima disso o gesto foi rolagem da lista e não insere nada. Ver
// attachProjectLibraryCardDrag.
const PROJECT_LIB_TAP_SLIP_PX = 24;
const PROJECT_TOUCH_HOLD_MS = 220;
// Segurar parado por este tempo abre as PROPRIEDADES do módulo (cor,
// dimensões, prateleiras) — pedido do usuário 2026-08-06, valendo tanto no
// iPad quanto no navegador com mouse. 500ms é o padrão de "long press" que o
// iOS usa; menos que isso dispara sem querer durante um arraste lento.
const PROJECT_HOLD_MENU_MS = 500;
// Raio (px de tela) em que um toque ainda "pertence" ao módulo já SELECIONADO,
// mesmo que o centro do dedo tenha caído em cima do vizinho — ver
// pickAssemblyAtSticky (viewer3d_composition.js). ~22px é meia largura típica
// da área de contato de um dedo adulto num iPad; menos que isso não resolvia o
// relato ("seleciona o modulo do lado"), muito mais e ficaria difícil trocar
// pro vizinho de propósito.
// 12px (era 22, baixado em 2026-08-13 a pedido do Matt no iPad: "clique fora
// do móvel pega móvel"). O anel grudento existe pra o dedo não PERDER o módulo
// já selecionado por 2-3mm de desvio — não pra alcançar o módulo de longe. Com
// 22px ele ia buscar seleção quase meio centímetro fora do contorno, e no dedo
// isso é bem visível. 12px cobre o desvio real do ponto de contato.
const PROJECT_STICKY_PICK_PX = 12;

// Altura máxima que a BASE (floor_height_mm) de um módulo de `heightMm` pode
// ter sem estourar o teto útil — mesma regra de sempre (pé direito − afastamento
// do teto, agora por módulo — migration_060, ver effectiveCeilingClearanceMm
// − rodapé), só isolada aqui pra também travar o eixo Y do arraste, não só a
// régua de altura do configurador (ver ceilingMaxHeightMm acima, que calcula
// o inverso: altura máxima dada uma base já fixa). `module` opcional (default
// null = sem afastamento nenhum, 0) — passar sempre slot.module quando
// disponível.
function projectSlotMaxFloorHeightMm(heightMm, module) {
  return Math.max(roomSettings.ceiling_mm - effectiveCeilingClearanceMm(module) - roomSettings.baseboard_mm - Number(heightMm || 0), 0);
}

function clampProjectSlotPosition(slot) {
  // Ilha no chão não é limitada por largura de parede nem por pé direito ao
  // longo de um plano vertical — o limite dela é o retângulo do ambiente no
  // piso (ver clampFloorSlotIntoRoom).
  if (isFloorSlot(slot)) return;
  // O MÓDULO PARA NA PAREDE VIZINHA, não dentro dela (2026-08-13).
  //
  // O limite era 0..(largura da parede), e a largura vai até o EIXO do canto —
  // então, no fim da parede, o módulo entrava os 150mm da parede
  // perpendicular. Era o "ele permitiu entrar" que o Matt viu.
  //
  // Agora o vão útil desconta a espessura de quem encosta em cada ponta.
  // Resultado: arrastado até o fim, o módulo encosta EXATAMENTE na face
  // interna da parede vizinha — que é o que se quer num canto de marcenaria.
  const idx = Number(slot.wall_index || 0);
  const recuo = projectWallCornerInsetMm(idx);
  const largura = getProjectWallWidthMm(idx) - recuo.ini - recuo.fim;
  const maxX = Math.max(0, largura - Number(slot.width_mm || 0));
  const maxY = projectSlotMaxFloorHeightMm(slot.height_mm, slot.module);
  // O MÍNIMO É O RECUO — MAS SÓ QUANDO DÁ PRA SAIR SEM ATROPELAR NINGUÉM.
  //
  // Duas exigências que brigam entre si, e a solução é atender as duas:
  //   · módulo NÃO PODE ficar dentro da parede vizinha (o "ainda tá entrando
  //     na parede"), então o mínimo tem que ser recuo.ini;
  //   · o clamp roda em vários pontos SEM passar pela colisão (render, resize,
  //     troca de parede), então empurrar cego mete o módulo no vizinho — foi
  //     exatamente o bug do "um módulo entrou no outro".
  //
  // Aqui: tenta tirar da parede; se o lugar novo colidir com outro módulo, o
  // empurrão é ABORTADO e a posição antiga fica. Sair da parede nunca vale
  // criar sobreposição — e o módulo que ficou pra trás continua acessível
  // (basta arrastar, e aí a colisão trabalha de verdade).
  const xAtual = Number(slot.x_mm || 0);
  let xMin = recuo.ini;
  if (xAtual < xMin && projectSlotOverlapsNeighbor(slot, xMin)) xMin = xAtual;
  slot.x_mm = clamp(xAtual, xMin, recuo.ini + maxX);
  slot.floor_height_mm = clamp(Number(slot.floor_height_mm || 0), 0, maxY);
}

// Este módulo, se fosse pra xProposto, encostaria em algum vizinho da MESMA
// parede? Só compara o vão horizontal e a faixa vertical — é o mesmo critério
// da colisão do arraste, sem o resolvedor de deslize (aqui a pergunta é
// sim/não, não "pra onde escorregar").
function projectSlotOverlapsNeighbor(slot, xProposto) {
  const w = Number(slot.width_mm || 0), h = Number(slot.height_mm || 0);
  const y0 = Number(slot.floor_height_mm || 0), y1 = y0 + h;
  return projectSlotsSameWallExcluding(slot).some((o) => {
    const ox = Number(o.x_mm || 0), ow = Number(o.width_mm || 0);
    const oy0 = Number(o.floor_height_mm || 0), oy1 = oy0 + Number(o.height_mm || 0);
    const cruzaX = xProposto < ox + ow - 1 && xProposto + w > ox + 1;
    const cruzaY = y0 < oy1 - 1 && y1 > oy0 + 1;
    return cruzaX && cruzaY;
  });
}

// Quanto cada ponta desta parede é "comida" pela parede que encosta nela.
// Zero quando aquela ponta é livre (parede solta) — aí o módulo pode ir até o
// fim de verdade. Só vale no modelo de segmentos; no modelo antigo das 3
// formas as paredes se encontram por construção e nada muda.
// SEMPRE ZERO desde 2026-08-15 — o módulo vai até o canto de verdade.
//
// Esta função descontava a ESPESSURA da parede vizinha (150mm por padrão) de
// cada ponta, partindo da ideia de que o corpo da vizinha come esse pedaço do
// trecho útil. Só que ele NÃO come: makeWallSurface (viewer3d_composition.js)
// posiciona a parede com o centro recuado espessura/2 no sentido CONTRÁRIO ao
// intoDir, ou seja, a FACE INTERNA da parede é exatamente a polilinha
// desenhada e todo o corpo dela fica FORA do ambiente. Duas paredes que se
// encontram num canto têm as duas faces internas passando pelo ponto do
// canto — não sobra nada pra descontar.
//
// O sintoma era o do Matt (2026-08-15): "quando arrasto ele no canto, ele
// afasta automaticamente" — o módulo parava 150mm antes da esquina e ficava
// um vão. Medido no site publicado: recuo {ini:0, fim:150} numa parede de
// 4000mm com vizinha de 150mm de espessura, e a caixa da parede vizinha
// inteiramente fora do ambiente.
//
// Fica como função (em vez de sumir) porque os ~4 chamadores usam o par
// {ini, fim} pra calcular limite esquerdo/direito e a zona morta de troca de
// parede; devolver zero num ponto só mantém todos eles coerentes. Se um dia a
// parede passar a ser desenhada CENTRADA na polilinha, é aqui que o desconto
// volta — e aí ele vale meia espessura, não uma inteira.
function projectWallCornerInsetMm(wallIndex) {
  return { ini: 0, fim: 0 };
}

// Ímã: dado um valor bruto (posição que o ponteiro pediria) e o tamanho do
// módulo nesse eixo, procura entre os cantos "interessantes" (paredes +
// bordas de todo outro módulo já no ambiente) o mais próximo dentro do raio
// de snap — pedido do usuário: "tipo iman que puxe os cantos dele pra eles
// se conectarem melhor e deixar eles bem alinhados". Mesma função pros dois
// eixos (isXAxis diferencia só qual campo/parede usar).
function snapProjectSlotAxis(rawValue, sizeMm, isXAxis, otherSlots, snapMmOverride) {
  // snapMmOverride (novo, 2026-07-26): a Vista de Canto 3D não tem uma
  // escala px/mm de tela de verdade (a posição vem de raycasting num plano
  // 3D, não de um canvas DOM) — usar PROJECT_SNAP_PX/projectPxPerMm ali daria
  // um raio de imã sem relação nenhuma com a precisão real do mouse naquela
  // vista. Chamadores 3D passam um raio fixo em mm (ver PROJECT_SNAP_3D_MM,
  // attachProject3DEditDrag/handleProject3DResizeMove); a Vista Frontal 2D
  // não passa nada e continua com o cálculo de sempre.
  const snapMm = (snapMmOverride != null) ? snapMmOverride : PROJECT_SNAP_PX / (projectPxPerMm || 1);
  const candidates = [0];
  if (isXAxis) candidates.push(getProjectWallWidthMm() - sizeMm);
  otherSlots.forEach((s) => {
    const pos = isXAxis ? Number(s.x_mm || 0) : Number(s.floor_height_mm || 0);
    const size = isXAxis ? Number(s.width_mm || 0) : Number(s.height_mm || 0);
    candidates.push(pos, pos + size, pos - sizeMm, pos + size - sizeMm);
  });
  let best = rawValue;
  let bestDiff = snapMm;
  candidates.forEach((c) => {
    const diff = Math.abs(c - rawValue);
    if (diff <= bestDiff) { bestDiff = diff; best = c; }
  });
  return best;
}

// Ímã pra ESTICAR (pedido do usuário, 2026-07-21: "eu quero que ao esticar
// ele puxe alinhamento com o que esta na tela.. tipo largura do painel de
// tras") — diferente de snapProjectSlotAxis (que snapa a posição de uma
// caixa de tamanho FIXO sendo movida): aqui só uma BORDA se move (a outra
// fica ancorada), então o candidato de imã é a própria borda de outro
// módulo (início OU fim), não as 4 combinações de início/fim de uma caixa
// inteira. Usado pelas 3 setinhas de esticar módulo (largura esq/dir,
// altura topo) em attachProjectSlotResizeHandle/pointermove abaixo.
function snapProjectEdge(rawEdgeMm, isXAxis, otherSlots, snapMmOverride) {
  const snapMm = (snapMmOverride != null) ? snapMmOverride : PROJECT_SNAP_PX / (projectPxPerMm || 1);
  const candidates = [0];
  if (isXAxis) candidates.push(getProjectWallWidthMm());
  otherSlots.forEach((s) => {
    const pos = isXAxis ? Number(s.x_mm || 0) : Number(s.floor_height_mm || 0);
    const size = isXAxis ? Number(s.width_mm || 0) : Number(s.height_mm || 0);
    candidates.push(pos, pos + size);
  });
  let best = rawEdgeMm;
  let bestDiff = snapMm;
  candidates.forEach((c) => {
    const diff = Math.abs(c - rawEdgeMm);
    if (diff <= bestDiff) { bestDiff = diff; best = c; }
  });
  return best;
}

// Sobreposição de dois retângulos. Ficou SEM CHAMADOR em 2026-08-08 (era usada
// só por resolveProjectSlotDepth, cuja regra foi desligada — ver lá). Mantida
// porque é a única definição de "sobrepõe" do arquivo e a colisão/Vista
// Superior podem precisar dela de novo; a colisão de hoje usa a sua própria
// conta com folga (EPS) em resolveCollisionSlide, que não serve pra um teste
// booleano puro.
function projectRectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Profundidade (z_order) — REGRA DESLIGADA em 2026-08-08.
//
// Como era: ao soltar um módulo, se a posição final SOBREPUSESSE outro módulo
// da mesma parede, ele virava a camada mais à frente entre os que tocava
// (z_order+1), e o 3D empurrava ele pra fora da parede em degraus de
// FREEFORM_DEPTH_STEP_M (6cm). Nasceu de um pedido antigo ("ao colocar um
// modulo na frente do outro, ele deve levar o modulo novo pra frente").
//
// Por que saiu: pedido do usuário 2026-08-08 — "eliminar a regra que afasta da
// parede quando mexe algum modulo se ja tiver um". Na prática, encostar dois
// módulos (o caso NORMAL de um projeto de marcenaria) era detectado como
// sobreposição em algum momento do arraste e o móvel "pulava" pra frente da
// parede sozinho, saindo do lugar onde vai ser instalado de verdade. Agora
// TODO módulo de parede fica encostado na parede, sempre.
//
// A função continua existindo (e sendo chamada nos mesmos ~8 lugares) em vez
// de sair fora: `z_order` ainda é serializado, ainda é lido pelos dois viewers
// e pelo photoreal.js, e a Vista Superior deriva profundidade dele. Zerar aqui,
// num ponto só, garante que qualquer caminho que "resolvia" profundidade agora
// aterrissa em 0 — inclusive projeto ANTIGO salvo com z_order alto, que se
// corrige sozinho no primeiro movimento (e renderProjectCanvas zera de saída,
// ver lá, pra projeto antigo já ABRIR encostado na parede).
function resolveProjectSlotDepth(slot /* , otherSlots */) {
  slot.z_order = 0;
}

// ==========================================================================
// COLISÃO ENTRE MÓDULOS (botão liga/desliga) — 2026-08-08
// ==========================================================================
// Pedido do usuário: "um botao de colisao deve existir, uma vez ligado os
// moveis ligados na parede nao podem se ultrapassar; quando estiver
// movimentando na parede ele deve parar ao encontrar outro modulo. dos lados
// ou abaixo ou acima". Entre as três opções oferecidas (parar encostado /
// parar + empurrar o vizinho / só avisar em vermelho), escolheu PARAR
// ENCOSTADO — o módulo desliza até tocar o vizinho e trava ali.
//
// Desligado por padrão de propósito: o comportamento de sempre (módulos podem
// se sobrepor, e a sobreposição vira camada de profundidade via
// resolveProjectSlotDepth) continua sendo o default, então nada do que já
// existia muda até o cliente ligar o botão.
let projectCollisionEnabled = false;
try {
  projectCollisionEnabled = localStorage.getItem('legno_proj_collision') === '1';
} catch (e) { /* ok sem persistir */ }

function setProjectCollisionEnabled(on) {
  projectCollisionEnabled = !!on;
  try { localStorage.setItem('legno_proj_collision', projectCollisionEnabled ? '1' : '0'); } catch (e) { /* ok */ }
  const btn = document.getElementById('po-proj-collision-btn');
  if (btn) btn.classList.toggle('active', projectCollisionEnabled);
}

// Resolve o deslize de um retângulo contra uma lista de outros retângulos,
// em DOIS PASSES independentes (primeiro o eixo horizontal, depois o
// vertical) — é o algoritmo clássico de colisão de plataforma 2D, e é o que
// dá a sensação de "deslizar rente ao vizinho" em vez de travar de vez assim
// que os dois se tocam em qualquer canto.
//
// A regra "só bloqueia quem eu ainda NÃO estava atravessando" (o teste com
// EPS contra a posição ANTERIOR) é o que impede um módulo que já nasceu
// sobreposto — projeto salvo antes do botão existir, ou o próprio cliente
// tendo ligado a colisão no meio da edição — de ficar preso pra sempre: um
// vizinho que já estava sobreposto antes do movimento simplesmente não conta
// como obstáculo, então dá pra arrastar pra fora dele normalmente.
//
// rect/prev/desired usam a convenção { x, y, w, h } com y CRESCENDO no
// sentido "pra cima"/"pra dentro" conforme o plano (parede: x=ao longo da
// parede, y=altura do chão; piso: x=X do mundo, y=Z do mundo).
const PROJECT_COLLISION_EPS_MM = 0.5;
function resolveCollisionSlide(desired, prev, sizeW, sizeH, others) {
  const EPS = PROJECT_COLLISION_EPS_MM;
  let x = desired.x;
  const bandsOverlapY = (oy, oh, y) => (y < oy + oh - EPS && y + sizeH > oy + EPS);
  const bandsOverlapX = (ox, ow, xx) => (xx < ox + ow - EPS && xx + sizeW > ox + EPS);

  others.forEach((o) => {
    if (!bandsOverlapY(o.y, o.h, prev.y)) return;
    if (desired.x > prev.x && prev.x + sizeW <= o.x + EPS) x = Math.min(x, o.x - sizeW);
    else if (desired.x < prev.x && prev.x >= o.x + o.w - EPS) x = Math.max(x, o.x + o.w);
  });

  let y = desired.y;
  others.forEach((o) => {
    if (!bandsOverlapX(o.x, o.w, x)) return;
    if (desired.y > prev.y && prev.y + sizeH <= o.y + EPS) y = Math.min(y, o.y - sizeH);
    else if (desired.y < prev.y && prev.y >= o.y + o.h - EPS) y = Math.max(y, o.y + o.h);
  });

  return { x, y };
}

// Colisão de um módulo de PAREDE: o plano é a própria parede (x ao longo
// dela, y = altura do chão). Devolve a posição já corrigida; com o botão
// desligado devolve o pedido intacto.
function clampWallSlotAgainstCollision(slot, desiredXMm, desiredYMm, prevXMm, prevYMm, others) {
  if (!projectCollisionEnabled) return { x: desiredXMm, y: desiredYMm };
  const rects = others.map((s) => ({
    x: Number(s.x_mm || 0), y: Number(s.floor_height_mm || 0),
    w: Number(s.width_mm || 0), h: Number(s.height_mm || 0)
  }));
  return resolveCollisionSlide(
    { x: desiredXMm, y: desiredYMm }, { x: prevXMm, y: prevYMm },
    Number(slot.width_mm || 0), Number(slot.height_mm || 0), rects
  );
}

// Pegada (footprint) de um módulo ILHA no piso, em mm de MUNDO — { x, y, w, h }
// com y = Z do mundo. Giro de 90°/270° troca largura por profundidade.
function floorSlotFootprint(slot, centerXMm, centerZMm) {
  const rot = ((Number(slot.floor_rotation_deg || 0) % 360) + 360) % 360;
  const swapped = (rot === 90 || rot === 270);
  const w = swapped ? Number(slot.depth_mm || 0) : Number(slot.width_mm || 0);
  const h = swapped ? Number(slot.width_mm || 0) : Number(slot.depth_mm || 0);
  const cx = (centerXMm != null) ? centerXMm : Number(slot.floor_x_mm || 0);
  const cz = (centerZMm != null) ? centerZMm : Number(slot.floor_z_mm || 0);
  return { x: cx - w / 2, y: cz - h / 2, w, h };
}

// Colisão de um módulo ILHA: o plano é o PISO (x/z do mundo). Só colide com
// outras ilhas — um módulo de parede está pendurado/encostado na parede e sua
// pegada no chão não é uma informação que este app guarda de verdade (a
// profundidade dele na Vista Superior é derivada, ver
// computeProjectSlotsTopViewLayout), então tratá-lo como obstáculo aqui daria
// bloqueio fantasma. Recebe/devolve o CENTRO do módulo.
function clampFloorSlotAgainstCollision(slot, desiredXMm, desiredZMm, prevXMm, prevZMm) {
  if (!projectCollisionEnabled) return { x: desiredXMm, y: desiredZMm };
  const self = floorSlotFootprint(slot, desiredXMm, desiredZMm);
  const prev = floorSlotFootprint(slot, prevXMm, prevZMm);
  const others = projectFloorSlots()
    .filter((s) => s.id !== slot.id)
    .map((s) => floorSlotFootprint(s));
  const solved = resolveCollisionSlide(
    { x: self.x, y: self.y }, { x: prev.x, y: prev.y }, self.w, self.h, others
  );
  return { x: solved.x + self.w / 2, y: solved.y + self.h / 2 };
}

// ==========================================================================
// MODO CÂMERA NO TOQUE (iPad) — 2026-08-08
// ==========================================================================
// Pedido do usuário: "IPAD - A camera so pode movimentar se clicar no botao
// de rotacao da camera". No iPad a cena 3D acumulava dois papéis no MESMO
// gesto de um dedo (arrastar módulo vs. orbitar a câmera) e qualquer toque
// que escapasse do módulo saía girando a cena. Agora o dedo tem um dono só de
// cada vez, escolhido por um botão em MODO TRAVADO (liga/desliga — opção
// escolhida pelo usuário, em vez de "segurar o botão"):
//   · botão APAGADO ("tela travada"): o dedo edita módulos; o OrbitControls
//     fica desligado e nenhum gesto de 1 dedo move a câmera.
//   · botão ACESO: o dedo orbita/dá zoom; nenhum toque seleciona ou arrasta
//     módulo (o pointerdown de attachProject3DEditDrag sai fora logo no
//     início, ver lá).
// Mouse NUNCA passa por aqui: no desktop o botão do meio já gira e o esquerdo
// já arrasta módulo, sem ambiguidade nenhuma — por isso o botão só aparece em
// dispositivo de toque (projectIsTouchDevice).
let projectCameraModeOn = false;

function projectIsTouchDevice() {
  try {
    return (typeof window !== 'undefined')
      && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0)
      && window.matchMedia('(pointer: coarse)').matches;
  } catch (e) { return false; }
}

function setProjectCameraMode(on) {
  projectCameraModeOn = !!on;
  const btn = document.getElementById('po-proj-camera-btn');
  if (btn) btn.classList.toggle('active', projectCameraModeOn);
  // Em modo câmera some tudo que é alça de edição (setas e botões) — o dedo
  // ali é só da câmera, e alça visível sem função só confunde.
  if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows();
  if (typeof refreshProjectSlotActions === 'function') refreshProjectSlotActions();
  // Com o modo desligado o OrbitControls sai de cena por completo no toque —
  // é isso que faz a "tela travada" ser travada de verdade. No mouse os
  // controles continuam sempre ligados (ver applyProjectViewerControls).
  applyProjectViewerControls();
}

// Fonte ÚNICA da verdade de "o OrbitControls está ligado?" nesta cena —
// chamada tanto pelo toggle acima quanto por renderProjectCanvasFrontCorner
// (que roda a cada re-render e antes reativava incondicionalmente).
function applyProjectViewerControls() {
  if (!ViewerProjectEdit || !ViewerProjectEdit.setControlsEnabled) return;
  const enabled = projectIsTouchDevice() ? projectCameraModeOn : true;
  ViewerProjectEdit.setControlsEnabled(enabled);
}

// ==========================================================================
// BARRAS FLUTUANTES DO CANVAS — 2026-08-08 (etapa 2 do redesenho)
// ==========================================================================
// Os botões que antes moravam numa faixa acima do desenho agora flutuam POR
// CIMA dele (ver .po-proj-canvas-hud em style.css). O que muda em JS é pouco,
// de propósito: os ids continuam os mesmos, então todo listener antigo segue
// valendo. Só entram três botões novos de câmera e uma função que decide o que
// aparece em cada vista.
function refreshProjectCanvasHud() {
  // Barra de CÂMERA (ajustar/zoom) só existe na cena 3D: a Vista Superior é um
  // desenho 2D plano com escala calculada pra caber na tela (ver
  // renderProjectCanvasTop), não tem câmera pra mexer.
  const cameraHud = document.getElementById('po-proj-canvas-camera-hud');
  const edit3dWrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  const is3d = !!edit3dWrap && edit3dWrap.style.display !== 'none' && projectViewMode !== 'top';
  if (cameraHud) cameraHud.style.display = is3d ? 'flex' : 'none';
  // (A lixeira desta barra saiu a pedido do usuário — "pra nao clicar errado".
  // Remover continua na bolinha ✕ ao lado do módulo e no painel da direita.)
}

const projFitBtn = document.getElementById('po-proj-fit-btn');
if (projFitBtn) {
  projFitBtn.addEventListener('click', () => {
    // Reenquadrar = zerar a chave de fit e re-renderizar. É exatamente o que
    // resetProject/restoreFavoriteProject já fazem (ver project3DLastFitKey):
    // com a chave nula, renderProjectCanvasFrontCorner passa keepCamera=false
    // e renderFreeformWalls recalcula a distância/alvo pela caixa da cena.
    // Nenhuma matemática de câmera nova precisou ser escrita.
    project3DLastFitKey = null;
    renderProjectCanvas();
  });
}
// Mesma escala por passo que o OrbitControls usa por "notch" de scroll — o
// botão dá o mesmo salto que uma volta da rodinha, então os dois gestos
// parecem o mesmo zoom. factor < 1 aproxima (ver zoomByStep).
const PROJECT_ZOOM_STEP = 0.82;
const projZoomInBtn = document.getElementById('po-proj-zoom-in-btn');
if (projZoomInBtn) {
  projZoomInBtn.addEventListener('click', () => {
    if (ViewerProjectEdit && ViewerProjectEdit.zoomByStep) ViewerProjectEdit.zoomByStep(PROJECT_ZOOM_STEP);
  });
}
const projZoomOutBtn = document.getElementById('po-proj-zoom-out-btn');
if (projZoomOutBtn) {
  projZoomOutBtn.addEventListener('click', () => {
    if (ViewerProjectEdit && ViewerProjectEdit.zoomByStep) ViewerProjectEdit.zoomByStep(1 / PROJECT_ZOOM_STEP);
  });
}
const projUndoBtn = document.getElementById('po-proj-undo-btn');
if (projUndoBtn) projUndoBtn.addEventListener('click', () => undoProjectChange());
// Ctrl+Z / ⌘Z também desfazem — mas só com a aba Projetos aberta e fora de
// qualquer campo de texto (senão roubaria o desfazer nativo de quem está
// digitando uma medida).
document.addEventListener('keydown', (ev) => {
  if (!(ev.ctrlKey || ev.metaKey) || ev.key !== 'z' || ev.shiftKey) return;
  const tab = document.getElementById('po-tab-projects');
  if (!tab || tab.style.display === 'none') return;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
  ev.preventDefault();
  undoProjectChange();
});

const projCollisionBtn = document.getElementById('po-proj-collision-btn');
if (projCollisionBtn) {
  projCollisionBtn.addEventListener('click', () => setProjectCollisionEnabled(!projectCollisionEnabled));
  projCollisionBtn.classList.toggle('active', projectCollisionEnabled);
}
const projCameraBtn = document.getElementById('po-proj-camera-btn');
if (projCameraBtn) {
  // Só faz sentido em tela de toque — no desktop o botão fica escondido (o
  // mouse já tem botão do meio pra girar).
  projCameraBtn.style.display = projectIsTouchDevice() ? 'inline-block' : 'none';
  projCameraBtn.addEventListener('click', () => setProjectCameraMode(!projectCameraModeOn));
}

// Cor de fundo do retângulo do módulo no canvas — usa a primeira cor
// escolhida que tiver um swatch_hex (ver renderSwatches acima), senão um
// tom neutro só pra não ficar cinza genérico.
function projectSlotColorSwatch(slot) {
  const colors = Object.values(slot.colorsByRole || {});
  const withHex = colors.find((c) => c && c.swatch_hex);
  return withHex ? withHex.swatch_hex : '#e4d9c8';
}

// ---------- Vista frontal 2D REAL do módulo (pedido do usuário, 2026-07-21) ----------
// "quero ver o modulo 2d na tela. nao me serve esse bloco cinza. quero ver
// com as cores escolhidas e os componentes. versão 2D paralela da vista
// frontal" — desenha as peças de verdade (portas, gavetas, prateleiras,
// laterais) dentro da caixa do módulo, com a cor resolvida de cada uma, em
// vez de um retângulo cinza sólido. NÃO usa Three.js (mais simples/leve pra
// caber dentro de uma caixinha do canvas) — projeta em 2D só o subconjunto
// de placePieceInBox (viewer3d.js) que faz sentido numa vista SEM
// profundidade: cada posição automática (left/right/top/bottom/back/
// baseboard/countertop) vira uma tira fina na borda correspondente (mesma
// convenção "zero absoluto" documentada lá — offset_x/y_mm JÁ é a posição
// do canto chão-esquerda, não precisa de nenhuma âncora por papel); 'free'
// (a maioria das portas — ver hinge_side/resolveHingeSide em viewer3d.js) e
// 'drawer' têm posição própria; 'shelf' é uma aproximação (distribui no vão
// 0..H inteiro, sem descontar espessura de base/topo cadastrados — barato
// de calcular aqui, próximo o bastante pra uma prévia); 'leg'/'handle'/
// 'other' não desenham (mesma regra do 3D — ferragem sem relevância na
// chapa). Isso é DESENHO, não um novo motor de posicionamento — qualquer
// peça que caia fora dessas regras simplesmente não aparece, sem quebrar
// nada do 3D/preço de verdade (só usa resolvePiecesForViewer, já existente,
// pra pegar medida/offset/cor resolvidos).

// Réplica de splitThickness (viewer3d.js) — decide qual das 3 medidas de
// uma peça de posição automática é a "espessura" (chapa fina), conforme o
// positioning cadastrado (mesma lógica, mesmos 4 casos + fallback pela
// menor medida).
function projectSplitThickness(w, h, d, positioning) {
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

// Achata a árvore de peças JÁ RESOLVIDAS (resolvePiecesForViewer) numa
// lista de retângulos { x, y, w, h, color, zPriority, depth }, em mm,
// relativos ao canto chão-esquerda do módulo RAIZ (offsetXmm/offsetYmm
// acumulam a posição de peças-módulo aninhadas — ver recursão em
// 'free'/'drawer' abaixo, os únicos papéis que fazem sentido conter peças
// filhas de verdade).
function computeProjectSlotElevationRects(piecesResolved, offsetXmm, offsetYmm) {
  const rects = [];
  (piecesResolved || []).forEach((part) => {
    const w = Number(part.width_mm || 0);
    const h = Number(part.height_mm || 0);
    const d = Number(part.depth_mm || 0);
    const role = part.position_role || 'other';
    const offX = Number(part.offset_x_mm || 0);
    const offY = Number(part.offset_y_mm || 0);
    // offset_z_mm (profundidade) não entra na posição 2D — só decide a
    // ORDEM de desenho (peça mais pra frente cobre a de trás), ver `depth`.
    const depth = Number(part.offset_z_mm || 0);
    const color = part.color;
    const push = (x, y, rw, rh, zPriority) => {
      rects.push({ x: offsetXmm + x, y: offsetYmm + y, w: Math.max(rw, 1), h: Math.max(rh, 1), color, zPriority, depth });
    };
    if (role === 'left' || role === 'right') {
      const { thickness, faceA } = projectSplitThickness(w, h, d, part.positioning);
      push(offX, offY, thickness, faceA, 1);
    } else if (role === 'drawer_side') {
      // Lateral de gaveta (migration 118): vista de frente ela é a espessura
      // por uma ALTURA que, nesse papel, vem da profundidade cadastrada — a
      // mesma troca de eixos do 3D (ver placePieceInBox em viewer3d.js).
      const { thickness, faceA, faceB } = projectSplitThickness(w, h, d, part.positioning);
      // Vista de frente: espessura por ALTURA — e a altura é a MENOR das duas
      // medidas que sobram (ver a regra em placePieceInBox/viewer3d.js).
      push(offX, offY, thickness, Math.min(faceA, faceB), 1);
    } else if (role === 'top' || role === 'bottom' || role === 'countertop') {
      const { thickness, faceA } = projectSplitThickness(w, h, d, part.positioning);
      push(offX, offY, faceA, thickness, 1);
    } else if (role === 'back' || role === 'baseboard') {
      const { thickness, faceA } = projectSplitThickness(w, h, d, part.positioning);
      push(offX, offY, faceA, thickness, 0);
    } else if (role === 'shelf') {
      push(offX, offY, w, h, 2);
    } else if (role === 'drawer' || role === 'free') {
      push(offX, offY, w, h, role === 'drawer' ? 3 : 4);
      // Peça-módulo aninhada com composição própria (gaveta com fundo/
      // laterais de verdade, ou um módulo usado como "peça") — desenha as
      // peças filhas por cima, deslocadas pro canto chão-esquerda DESTA peça.
      if (part.child_pieces && part.child_pieces.length) {
        computeProjectSlotElevationRects(part.child_pieces, offsetXmm + offX, offsetYmm + offY)
          .forEach((r) => rects.push(r));
      }
    }
    // 'leg'/'handle'/'other' — sem desenho (mesma regra do 3D).
  });
  return rects;
}

// HTML (divs absolutos, em % do próprio módulo — acompanha o resize sem
// precisar recalcular px) pra colocar dentro do .po-proj-slot no lugar do
// preenchimento cinza sólido. widthMm/heightMm são as medidas ATUAIS do
// módulo (pra converter mm->%); erro em qualquer etapa (módulo sem peças
// carregadas ainda, fórmula inválida etc.) devolve string vazia — cai pro
// fallback de cor sólida (div.style.background, ver renderProjectCanvas),
// nunca quebra o card inteiro.
function projectSlotElevationHtml(slot, widthMm, heightMm) {
  if (!slot.pieces || !slot.pieces.length || !widthMm || !heightMm) return '';
  const containerDims = { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm };
  const effectivePieces = projectSlotEffectivePieces(slot);
  let resolved;
  try {
    resolved = resolvePiecesForViewer(
      effectivePieces,
      containerDims,
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    );
  } catch (e) { return ''; }
  // Pés (position_role='leg', não desenhados — ver comentário acima): o
  // corpo inteiro sobe pela altura do pé, igual ao 3D (placePieceInBox soma
  // "legH" a TODA posição Y, ver viewer3d.js). Sem isso, o vão vazio do pé
  // aparecia no TOPO da caixa em vez de embaixo — offset_y_mm de cada peça é
  // calculado contra bodyDims (H já descontado do pé, ver resolveBodyDims em
  // pricing.js), então falta somar de volta aqui pra virar posição absoluta
  // dentro do módulo INTEIRO (0 = chão de verdade, não o topo do pé).
  let legH_mm = 0;
  try { legH_mm = Pricing.resolveBodyDims(effectivePieces, containerDims).legH_mm || 0; } catch (e) { /* sem pé, 0 */ }
  let rects;
  try {
    rects = computeProjectSlotElevationRects(resolved, 0, legH_mm);
  } catch (e) { return ''; }
  if (!rects.length) return '';
  rects.sort((a, b) => (a.zPriority - b.zPriority) || (a.depth - b.depth));
  return rects.map((r) => {
    const leftPct = (r.x / widthMm) * 100;
    const bottomPct = (r.y / heightMm) * 100;
    const wPct = Math.max((r.w / widthMm) * 100, 0.4);
    const hPct = Math.max((r.h / heightMm) * 100, 0.4);
    const style = r.color && r.color.texture_url
      ? `background-image:url('${r.color.texture_url}');background-size:cover;`
      : `background:${(r.color && r.color.swatch_hex) || '#cfc6b4'};`;
    return `<div class="po-proj-slot-piece" style="left:${leftPct}%;bottom:${bottomPct}%;width:${wPct}%;height:${hPct}%;${style}"></div>`;
  }).join('');
}

// Arraste por ponteiro (mouse/touch/caneta, unificado) — pointer capture no
// próprio elemento, então move/up continuam chegando nele mesmo se o
// ponteiro sair por cima de outro módulo.
//
// MOUSE: arrasta na hora; deslocamento abaixo de PROJECT_CLICK_MOVE_THRESHOLD_PX
// vira clique (seleciona) em vez de mover.
//
// TOQUE (iPad) — o mapa de gestos foi refeito 2 vezes em 2026-08-06, então
// vale registrar o porquê de cada volta:
//
//   1ª: tratava toque igual mouse (4px de tolerância). Num dedo isso é nada,
//       então TODO toque virava arraste e nada ficava selecionado.
//   2ª: virou "segurar-pra-arrastar". Resolveu o arraste acidental, mas o
//       usuário ficou SEM controle do módulo: "não consigo esticar o móvel,
//       não tem a seta, o móvel não fica selecionado, nenhum controle".
//   3ª (atual), desenhada pelo próprio usuário: "preciso ao ficar clicando
//       ele permanecer clicado mesmo tirando o clique, e aí abrir opções das
//       setas pra eu esticar" + "penso em segurar o clique e abrir opções de
//       cores, dimensões, agregados".
//
// Mapa atual, igual no dedo e no mouse:
//   - toque/clique curto  -> SELECIONA e continua selecionado (as setinhas de
//                            esticar aparecem e ficam, ver .selected no CSS);
//   - arrastar (passar de PROJECT_TOUCH_SLOP_PX) -> MOVE, sem espera nenhuma;
//   - segurar parado PROJECT_HOLD_MENU_MS -> abre as PROPRIEDADES do módulo
//                            (cor, dimensões, prateleiras) numa janela.
//
// O pointerdown NÃO dá preventDefault no toque: enquanto o gesto não virou
// arraste, a página precisa poder rolar. Depois que vira, quem segura a
// rolagem é o listener de touchmove (passive:false) logo abaixo —
// preventDefault em pointermove não impede scroll no iOS.
function attachProjectSlotDrag(div, slot) {
  // Timer do "segurar pra arrastar". Fica fora do state porque precisa ser
  // limpo em caminhos onde projectDragState já foi zerado (pointercancel).
  let holdTimer = null;
  const clearHoldTimer = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };

  div.addEventListener('pointerdown', (ev) => {
    const isTouch = ev.pointerType === 'touch';
    // Caneta (pen) conta como preciso: engata na hora, igual mouse.
    if (!isTouch) ev.preventDefault();
    try { div.setPointerCapture(ev.pointerId); } catch (e) { /* ok, alguns navegadores não precisam */ }
    projectDragState = {
      slotId: slot.id,
      pointerId: ev.pointerId,
      isTouch,
      // armed = o arraste está valendo. No mouse já nasce engatado; no toque
      // só depois do hold.
      armed: !isTouch,
      canceled: false,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startXMm: Number(slot.x_mm || 0),
      startYMm: Number(slot.floor_height_mm || 0),
      moved: false,
      liveX: Number(slot.x_mm || 0),
      liveY: Number(slot.floor_height_mm || 0)
    };
    // Segurar parado (dedo OU mouse) abre as propriedades do módulo. Se o
    // ponteiro se mexer antes, o pointermove cancela este timer e o gesto
    // vira arraste — as duas coisas nunca disputam.
    clearHoldTimer();
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (!projectDragState || projectDragState.slotId !== slot.id || projectDragState.canceled || projectDragState.moved) return;
      projectDragState.canceled = true;
      projectDragState = null;
      div.classList.remove('dragging');
      openProjectSlotProps(slot.id);
    }, PROJECT_HOLD_MENU_MS);
  });

  // Segura a rolagem da página SÓ enquanto o arraste está engatado. Precisa
  // ser passive:false, senão o preventDefault é ignorado.
  div.addEventListener('touchmove', (ev) => {
    if (projectDragState && projectDragState.slotId === slot.id && projectDragState.armed) ev.preventDefault();
  }, { passive: false });

  div.addEventListener('pointermove', (ev) => {
    if (!projectDragState || projectDragState.slotId !== slot.id || projectDragState.pointerId !== ev.pointerId) return;
    const dxPx = ev.clientX - projectDragState.startClientX;
    const dyPx = ev.clientY - projectDragState.startClientY;
    const dist = Math.hypot(dxPx, dyPx);

    const threshold = projectDragState.isTouch ? PROJECT_TOUCH_SLOP_PX : PROJECT_CLICK_MOVE_THRESHOLD_PX;
    if (!projectDragState.moved && dist > threshold) {
      // Passou do limiar: é arraste. Cancela o timer das propriedades — o
      // ponteiro se mexeu, então a intenção claramente não era "segurar".
      clearHoldTimer();
      projectDragState.moved = true;
      projectDragState.armed = true;
      div.classList.add('dragging');
    }
    if (!projectDragState.moved) return;

    const dxMm = dxPx / (projectPxPerMm || 1);
    // Canvas posiciona por 'bottom' (sobe = mais mm), tela usa clientY (desce
    // = mais px) — precisa inverter o sinal do eixo vertical.
    const dyMm = -dyPx / (projectPxPerMm || 1);

    // Módulos da MESMA parede + o traçado fantasma da parede vizinha (ver
    // projectGhostSnapTargets — pedido do usuário 2026-07-26, mesmo
    // raciocínio do imã de esticar acima).
    const others = projectSlotsSameWallExcluding(slot).concat(projectGhostSnapTargets(Number(slot.wall_index || 0)));
    const maxX = Math.max(0, getProjectWallWidthMm(Number(slot.wall_index || 0)) - Number(slot.width_mm || 0));
    const maxY = projectSlotMaxFloorHeightMm(slot.height_mm, slot.module);

    let x = clamp(projectDragState.startXMm + dxMm, 0, maxX);
    let y = clamp(projectDragState.startYMm + dyMm, 0, maxY);
    x = clamp(snapProjectSlotAxis(x, Number(slot.width_mm || 0), true, others), 0, maxX);
    y = clamp(snapProjectSlotAxis(y, Number(slot.height_mm || 0), false, others), 0, maxY);
    y = snapProjectSlotToFloor(y);   // mesmo ímã de chão da vista 3D

    div.style.left = Math.round(x * projectPxPerMm) + 'px';
    div.style.bottom = Math.round(y * projectPxPerMm) + 'px';
    projectDragState.liveX = x;
    projectDragState.liveY = y;
  });

  const endDrag = (ev) => {
    clearHoldTimer();
    if (!projectDragState || projectDragState.slotId !== slot.id) {
      // Gesto cancelado no meio (rolagem da página, ver pointermove) — só
      // limpa o visual, sem selecionar nem mover.
      div.classList.remove('dragging');
      return;
    }
    div.classList.remove('dragging');
    try { div.releasePointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    const state = projectDragState;
    projectDragState = null;
    // pointercancel = o navegador tomou o gesto (rolagem/zoom). Não é tap:
    // selecionar aqui faria o módulo "pular" pro painel sem a pessoa querer.
    if (ev.type === 'pointercancel') return;
    if (state.moved) {
      slot.x_mm = state.liveX;
      slot.floor_height_mm = state.liveY;
      resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
      renderProjectCanvas();
      markProjectDirty();
    } else {
      selectProjectSlot(slot.id);
    }
  };
  div.addEventListener('pointerup', endDrag);
  div.addEventListener('pointercancel', endDrag);
}

// ==========================================================================
// Propriedades do módulo numa janela (segurar o clique) — 2026-08-06
// ==========================================================================
// Pedido do usuário: "penso em segurar o clique (iPad e navegador normal) e
// abrir opções de cores, dimensões, agregados (prateleiras)... abrir as
// propriedades".
//
// Truque pra não duplicar NADA: em vez de recriar cor/medida/prateleira
// dentro do modal (o que significaria IDs repetidos e dois caminhos de
// listener pra manter em sincronia), a janela simplesmente MOVE o
// #po-proj-config-panel — o painel da direita, que já tem tudo isso pronto —
// pra dentro dela, e devolve pro lugar ao fechar. É o MESMO elemento: todo
// listener, render e correção futura vale nos dois lugares de graça.
//
// É também o que resolve o painel da direita estar recolhido no iPad: mesmo
// escondido, ele continua sendo a fonte da verdade.
let projectPropsOpen = false;

function openProjectSlotProps(slotId) {
  const modal = document.getElementById('po-proj-props-modal');
  const body = document.getElementById('po-proj-props-body');
  const panel = document.getElementById('po-proj-config-panel');
  if (!modal || !body || !panel) return;

  selectProjectSlot(slotId);

  const slot = projectSlots.find((s) => s.id === slotId);
  const titleEl = document.getElementById('po-proj-props-title');
  if (titleEl) titleEl.textContent = (slot && slot.module && slot.module.name) || I18n.t('project.props_title');

  body.appendChild(panel);       // move (não copia)
  modal.classList.add('open');
  projectPropsOpen = true;
}

function closeProjectSlotProps() {
  const modal = document.getElementById('po-proj-props-modal');
  const panel = document.getElementById('po-proj-config-panel');
  const home = document.getElementById('po-proj-config-col');
  if (!modal || !panel || !home) return;
  home.appendChild(panel);       // devolve pra coluna da direita
  modal.classList.remove('open');
  projectPropsOpen = false;
}

(function attachProjectPropsModal() {
  const modal = document.getElementById('po-proj-props-modal');
  if (!modal) return;
  const closeBtn = document.getElementById('po-proj-props-close');
  if (closeBtn) closeBtn.addEventListener('click', closeProjectSlotProps);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeProjectSlotProps(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && projectPropsOpen) closeProjectSlotProps();
  });
})();

function selectProjectSlot(slotId) {
  selectedProjectSlotId = slotId;
  document.querySelectorAll('#po-proj-canvas .po-proj-slot').forEach((el) => {
    el.classList.toggle('selected', el.dataset.slotId === slotId);
  });
  // Contorno vermelho da Vista de Canto 3D acompanha a SELEÇÃO (ver
  // refreshProject3DHighlight) — inclusive quando a seleção veio da vista 2D
  // ou da lista, não só de um clique dentro da cena 3D.
  if (typeof refreshProject3DHighlight === 'function') refreshProject3DHighlight();
  renderProjectConfigPanel();
  // Setas 3D de redimensionamento (toque) acompanham a seleção — ver
  // refreshProject3DResizeArrows (não faz nada no mouse nem sem 3D).
  if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows();
  // Botões Duplicar/Remover acompanham a seleção pelo mesmo caminho das setas.
  if (typeof refreshProjectSlotActions === 'function') refreshProjectSlotActions();
  // 🗑 da barra flutuante só habilita com módulo selecionado.
  if (typeof refreshProjectCanvasHud === 'function') refreshProjectCanvasHud();
}

// SOLTAR O MÓDULO — o contrário exato de selectProjectSlot.
//
// Virou função porque agora são QUATRO caminhos, e antes cada um repetia (ou
// esquecia) parte da limpeza. O relato que forçou isso (Matt, 2026-08-13):
// "em qualquer lugar que eu clique na parede ou no piso ele nao desclica o
// modulo... preciso dar zoom out, girar camera e ir clicando ate desclicar.
// por isso digo que esta incontrolavel."
//
// Os quatro caminhos: clique no vazio (pointerdown), clique que não acertou
// módulo nenhum conferido de novo no pointerup (rede de segurança pros gestos
// que abortam antes daquele ramo — a SETA é o caso comum, ela fica FORA do
// contorno do módulo, bem onde a pessoa clica pra "soltar"), a tecla Esc, e o
// clique na parede/piso da vista 2D.
function deselectProjectSlot() {
  if (selectedProjectSlotId == null) return;
  selectedProjectSlotId = null;
  if (typeof refreshProject3DHighlight === 'function') refreshProject3DHighlight();
  document.querySelectorAll('#po-proj-canvas .po-proj-slot.selected')
    .forEach((el) => el.classList.remove('selected'));
  renderProjectConfigPanel();
  if (typeof refreshProject3DResizeArrows === 'function') refreshProject3DResizeArrows();
  if (typeof refreshProjectSlotActions === 'function') refreshProjectSlotActions();
  if (typeof refreshProjectCanvasHud === 'function') refreshProjectCanvasHud();
}

// Esc SEMPRE solta o módulo. É a saída que não depende de acertar pixel
// nenhum — com a câmera de perto, o móvel ocupa a tela toda e "clicar no
// vazio" pode simplesmente não existir na viewport.
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (selectedProjectSlotId == null) return;
  // Janela aberta por cima: o Esc é dela (fechar a janela), não da seleção.
  const abertas = ['po-proj-builder-modal', 'po-proj-props-modal', 'po-proj-ai-modal'];
  if (abertas.some((id) => { const el = document.getElementById(id); return el && el.classList.contains('open'); })) return;
  deselectProjectSlot();
});

// ==========================================================================
// DUPLICAR MÓDULO — 2026-08-08 (3ª rodada)
// ==========================================================================
// Pedido do usuário: "quero uma opcao de, ao clicado, o modulo poder se
// repetir, com mesma cor e tamanho". Reaproveita cloneProjectSlotForUndo (a
// mesma cópia profunda dos campos mutáveis que o desfazer já usa — cor,
// medidas, prateleiras, opcionais, overrides por peça), então "mesma cor e
// tamanho" sai de graça e sem duplicar regra nenhuma. Módulo/peças/opções de
// cor continuam compartilhados por referência: são catálogo, iguais pros dois.
//
// ONDE A CÓPIA NASCE: colada ao lado do original, no espaço livre mais
// próximo. Preferência pela direita (leitura natural de uma parede); se não
// couber até o fim da parede, tenta a esquerda; se não couber dos dois lados,
// nasce em cima do original mesmo — melhor um módulo sobreposto pro cliente
// arrastar do que um "não coube" que não explica nada.
function duplicateProjectSlot(slotId) {
  const original = projectSlots.find((s) => s.id === slotId);
  if (!original) return null;
  const copy = cloneProjectSlotForUndo(original);
  copy.id = newProjectSlotId();
  copy.thumbnail_data_url = null; // a miniatura é do slot antigo; deixa recalcular

  if (isFloorSlot(copy)) {
    // Ilha: desloca no eixo local da largura, sem parede pra limitar.
    const rot = (Number(copy.floor_rotation_deg || 0) * Math.PI) / 180;
    const stepMm = Number(copy.width_mm || 0) || 600;
    copy.floor_x_mm = Number(copy.floor_x_mm || 0) + Math.cos(rot) * stepMm;
    copy.floor_z_mm = Number(copy.floor_z_mm || 0) - Math.sin(rot) * stepMm;
    projectSlots.push(copy);
    clampFloorSlotIntoRoom(copy);
  } else {
    const widthMm = Number(copy.width_mm || 0);
    const wallWidthMm = getProjectWallWidthMm(Number(copy.wall_index || 0));
    const rightX = Number(original.x_mm || 0) + widthMm;
    const leftX = Number(original.x_mm || 0) - widthMm;
    if (rightX + widthMm <= wallWidthMm) copy.x_mm = rightX;
    else if (leftX >= 0) copy.x_mm = leftX;
    projectSlots.push(copy);
    clampProjectSlotPosition(copy);
  }

  selectedProjectSlotId = copy.id;
  renderProjectCanvas();
  renderProjectConfigPanel();
  refreshProject3DResizeArrows();
  markProjectDirty();
  return copy;
}

function removeProjectSlot(slotId) {
  projectSlots = projectSlots.filter((s) => s.id !== slotId);
  if (selectedProjectSlotId === slotId) selectedProjectSlotId = null;
  renderProjectCanvas();
  markProjectDirty();
}

// Recalcula slot.result (preço) do zero a partir do estado atual do slot —
// chamado depois de QUALQUER alteração inline (medida ou cor, ver
// updateProjectSlotDimension/updateProjectSlotColor abaixo). Mesma chamada
// de Pricing.calculateModulePrice usada em todo canto do arquivo (ver
// po-add-item-btn/applyColorRoleToComposition) — só os dados vêm do slot
// (slot.pieces/slot.colorsByRole/...) em vez dos globais do configurador de
// tela cheia, já que o slot tem cópia própria (ver insertProjectModuleDefault).
// slot.pieces guarda a árvore INTEIRA (opcionais não marcados incluídos) só
// pra quem veio de insertProjectModuleDefault — quem veio de "Editar
// configuração completa" já grava a lista PRÉ-filtrada (mesmo padrão da
// Composição). Filtrar de novo aqui é idempotente nos dois casos (peça já
// filtrada sempre passa no teste de novo), então funciona pros dois sem
// precisar saber qual caminho o slot veio.
// slot.layoutPieces = o que o CONSTRUTOR DE ARMÁRIO gerou (2026-08-13). São
// linhas idênticas às do catálogo (LayoutEngine.toPieceRows: position_role
// 'free' + offset absoluto), então daqui pra frente ninguém precisa saber que
// elas vieram de uma árvore: preço, 3D, elevação 2D e plano de corte tratam
// como peça normal. Este concat é o ÚNICO ponto de junção — é de propósito.
function projectSlotEffectivePieces(slot) {
  return slot.pieces
    .filter((p) => !p.client_optional || slot.selectedOptionalIds.includes(p.id))
    .concat(slot.layoutPieces || []);
}

// ==========================================================================
// CONTAGEM REAL DE FUROS PRO PREÇO (2026-08-15)
// ==========================================================================
// O custo de furação passou a usar os furos que a peça DE FATO recebe — os
// mesmos que saem no .ban, contra-furos propagados incluídos. É o que faz a
// lateral, que não tem furação própria, pagar pelos furos que a base abre
// nela (antes ela pagava só a parcela fixa; o Matt notou).
//
// CACHE, e não por preciosismo: recomputeProjectSlotPricing roda a CADA
// pointermove do arraste de medida, e contar furo exige montar as caixas de
// todas as peças (buildBoxes) — a parte cara do gerador. A chave é o que
// realmente muda a furação: módulo + as três medidas. Cor, margem e
// quantidade de prateleira não mexem em furo nenhum.
const projectHoleCountCache = new Map();
function projectHoleCountsFor(slot, parts) {
  if (typeof Drilling === 'undefined' || !Drilling.countHolesByPiece) return null;
  // CATÁLOGO AINDA NÃO CHEGOU: devolve null (= usa furos_equivalentes) e NÃO
  // guarda no cache. Sem esta guarda, a primeira precificação — que roda
  // antes do fetch terminar — gravava um mapa VAZIO na chave do módulo, e o
  // cache continuava servindo esse vazio pra sempre. O catálogo carregava, a
  // contagem passava a funcionar, e o preço não mudava: exatamente o "não
  // mudou" com 60 furos contados e $0,05 por furo cadastrado.
  if (!projectDrillingsByComponent) {
    // AUTOCORREÇÃO (2026-08-15): em vez de só desistir, dispara o
    // carregamento. Quando ele terminar, repriceAllProjectSlots recalcula
    // tudo sozinho — inclusive este slot, que acabou de ser precificado com
    // o número velho.
    //
    // Sem isto, o preço dependia de a furação ter carregado ANTES da
    // primeira precificação. Quando não carregava (o caso real), o slot
    // ficava com o valor do fallback pra sempre: um número errado com cara
    // de certo, que não avisa que está velho. Foi o que fez este item voltar
    // quatro vezes.
    ensureProjectDrillingCatalog();
    return null;
  }
  const chave = [(slot.module || {}).id, slot.width_mm, slot.height_mm, slot.depth_mm].join('|');
  if (projectHoleCountCache.has(chave)) return projectHoleCountCache.get(chave);
  let mapa = null;
  try {
    mapa = Drilling.countHolesByPiece(
      parts, Number(slot.width_mm) || 0, Number(slot.height_mm) || 0, Number(slot.depth_mm) || 0,
      {
        drillingsByComponent: projectDrillingsByComponent,
        holesByPattern: projectHolesByPattern,
        settings: projectDrillingSettings
      }
    );
  } catch (e) { mapa = null; }
  // O cache não pode crescer sem fim numa sessão longa de arraste: cada
  // milímetro arrastado é uma chave nova.
  if (projectHoleCountCache.size > 300) projectHoleCountCache.clear();
  projectHoleCountCache.set(chave, mapa);
  return mapa;
}

// Furação do catálogo, carregada uma vez por sessão. Sem ela a contagem sai
// vazia e o preço cai no furos_equivalentes do cadastro — o comportamento
// anterior, que continua correto, só menos preciso.
let projectDrillingsByComponent = null;
let projectHolesByPattern = null;
let projectDrillingSettings = null;

// Repreça tudo que já está na tela e atualiza os números. Existe como função
// própria porque é chamada de dentro de ensureProjectDrillingCatalog (quando
// a furação finalmente chega) — e um slot com preço velho não avisa que está
// velho: ele só mostra um número errado com cara de certo.
function repriceAllProjectSlots() {
  if (!projectSlots.length) return;
  projectSlots.forEach((slot) => {
    try { recomputeProjectSlotPricing(slot); } catch (e) { /* mantém o anterior */ }
  });
  try { renderProjectSummary(); } catch (e) { /* a tela pode não estar montada ainda */ }
}
// Promessa única: sem ela, várias precificações seguidas (é o que acontece no
// carregamento) disparariam o mesmo fetch em paralelo.
let projectDrillingCatalogLoading = null;
async function ensureProjectDrillingCatalog() {
  if (projectDrillingsByComponent) return;
  if (projectDrillingCatalogLoading) return projectDrillingCatalogLoading;
  projectDrillingCatalogLoading = (async () => {
  try {
    const [furos, programas, ajustes] = await Promise.all([
      supabaseClient.from('component_drillings').select('*').order('sort_order'),
      supabaseClient.from('drilling_pattern_holes').select('*').order('sort_order'),
      supabaseClient.from('drilling_settings').select('*').eq('id', true).single()
    ]);
    const porComp = {};
    (furos.data || []).forEach((r) => {
      if (!porComp[r.component_id]) porComp[r.component_id] = [];
      porComp[r.component_id].push(r);
    });
    projectDrillingsByComponent = porComp;
    projectHolesByPattern = (typeof Drilling !== 'undefined' && Drilling.groupPatternHoles)
      ? Drilling.groupPatternHoles((programas && programas.data) || []) : {};
    projectDrillingSettings = (ajustes && ajustes.data) || {};
    // Qualquer contagem feita ANTES daqui foi calculada sem catálogo. Zerar o
    // cache é o que faz o preço realmente mudar quando a furação chega —
    // cinto e suspensório junto com a guarda em projectHoleCountsFor.
    projectHoleCountCache.clear();
    // E REPREÇA AQUI DENTRO (2026-08-15). Antes o recálculo ficava nos dois
    // CHAMADORES desta função, e nenhum dos dois pegava o caso real: o
    // projeto era precificado no carregamento (catálogo ainda vindo pela
    // rede), caía no furos_equivalentes, e nada o recalculava depois. O
    // sintoma era o preço parado mostrando 20 furos (o número do cadastro)
    // em vez dos 12 contados — com o mapa funcionando perfeitamente se
    // chamado à mão.
    //
    // Dentro da função é o único lugar por onde TODO caminho passa, e roda
    // uma vez só (a guarda no topo garante).
    repriceAllProjectSlots();
  } catch (e) {
    // Falhar aqui não pode derrubar o preço: segue sem contagem real.
    projectDrillingsByComponent = {};
    projectHolesByPattern = {};
    projectDrillingSettings = {};
  }
  })();
  return projectDrillingCatalogLoading;
}

function recomputeProjectSlotPricing(slot) {
  // As peças da árvore são geometria ABSOLUTA em mm: mudou a medida do módulo,
  // elas têm que nascer de novo. Este é o funil por onde toda mudança de
  // dimensão passa, então é aqui que o recálculo mora.
  rebuildProjectSlotLayoutPieces(slot);
  const effectivePieces = projectSlotEffectivePieces(slot);
  const containerDims = { W: Number(slot.width_mm) || 0, H: Number(slot.height_mm) || 0, D: Number(slot.depth_mm) || 0 };
  // `parts` sai UMA vez e serve tanto a contagem de furos (abaixo) quanto o
  // consumo de ferragem (mais abaixo) — as duas dependem da MESMA resolução
  // (resolvePiecesForViewer), e calcular duas vezes só pra separar os dois
  // blocos seria custo em dobro (buildBoxes é a parte cara) sem ganho nenhum.
  let parts = null;
  try {
    parts = resolvePiecesForViewer(
      effectivePieces, containerDims,
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    );
  } catch (e) { parts = null; }
  // Publica a contagem real de furos ANTES de calcular (ver
  // projectHoleCountsFor). Pricing.setHoleCounts(null) volta ao
  // furos_equivalentes do cadastro, então nenhum caminho fica sem número.
  if (typeof Pricing !== 'undefined' && Pricing.setHoleCounts) {
    let contagem = null;
    try { contagem = parts ? projectHoleCountsFor(slot, parts) : null; } catch (e) { contagem = null; }
    Pricing.setHoleCounts(contagem);
  }
  // FERRAGEM DE MONTAGEM (minifix/cavilha/tambor/suporte, migration 119,
  // 2026-08-18) — mesma publicação por-módulo que setHoleCounts acima, e
  // pelo mesmo motivo: Hardware.consumoDoModulo conta a partir dos MESMOS
  // furos deste slot (collectAssembly por dentro), então precisa do `parts`
  // e das medidas de AGORA, não de um valor genérico. Sem isto — que era o
  // bug: hardware.js nem carregava no portal e ninguém chamava esta função
  // — moduleHardware ficava sempre null e a ferragem saía R$0 do $ Fábrica,
  // sem erro nenhum. Ver o carregamento do catálogo (Hardware.setCatalog)
  // logo depois do purchased_items, mais acima neste arquivo.
  if (typeof Pricing !== 'undefined' && Pricing.setModuleHardware) {
    let ferragem = null;
    if (parts && typeof Hardware !== 'undefined' && Hardware.consumoDoModulo) {
      try {
        ferragem = Hardware.consumoDoModulo(parts, containerDims.W, containerDims.H, containerDims.D, {
          drillingsByComponent: projectDrillingsByComponent,
          holesByPattern: projectHolesByPattern,
          settings: projectDrillingSettings
        });
      } catch (e) { ferragem = null; }
    }
    Pricing.setModuleHardware(ferragem);
    // Guarda no PRÓPRIO slot pro $ Fábrica ler sem recalcular (collectProjectCostReport,
    // 2026-08-18 — Matt: "nao esta aparecendo minifix, cavilha, corredica e tambor
    // minifix" no relatório). calculateModulePrice só soma isto no total — não
    // devolve a lista de volta pro chamador — então sem guardar aqui o relatório
    // não tinha como saber QUAIS itens formam aquele custo escondido no total.
    slot._hardwareConsumo = ferragem || [];
  }
  slot.result = slot.module.is_decoration
    ? { total: 0, breakdown: [] }
    : Pricing.calculateModulePrice({
      module: slot.module, pieces: effectivePieces, colorsByRole: slot.colorsByRole,
      hingeModel: slot.hingeModel, slideModel: slot.slideModel,
      shelfQuantities: slot.shelfQuantities, dimOverrides: slot.dimOverrides,
      pieceColorOverrides: slot.pieceColorOverrides,
      width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
      markupMultiplier: resolveMarkupMultiplierForModule(slot.module)
    });
}

// Editor inline de medida (steppers +/- e campo exato do painel da direita)
// — pedido do usuário: "clicando abre as configuracoes na direita e eu
// resolva tudo na mesma tela". Trava no min/max do módulo (mesmas colunas
// width_min_mm/max_mm etc. do catálogo) e, no eixo da altura, também no teto
// útil (mesma regra de sempre — pé direito − 5" − rodapé, considerando a
// posição vertical atual do módulo).
// A senha da aba Fábrica. Fica no código de propósito e isso está DOCUMENTADO
// como decisão consciente: ela impede o cliente de abrir a tela por curiosidade,
// não protege o dado — os custos já trafegam pro navegador dele hoje, e quem
// abrir o DevTools alcança tudo com ou sem senha. Blindar de verdade exige o
// cálculo sair do navegador (RPC com RLS). Adiado com o Matt, não esquecido.
const MONEY_FABRICA_SENHA = 'legno';
let moneyFabricaLiberada = false;
let moneyAbaAtual = 'orcamento';

function openMoneyModal() {
  const modal = document.getElementById('po-money-modal');
  if (!modal) return;
  modal.classList.add('open');

  // RECALCULA AO ABRIR (2026-08-15). O relatório lê slot.result, que pode ter
  // sido calculado numa condição pior do que a atual — tipicamente no
  // carregamento da página, antes de o catálogo de furação chegar pela rede.
  // O resultado ficava congelado num número do fallback: errado, mas com cara
  // de certo, sem nada na tela avisando que estava velho.
  //
  // Tentei antes garantir isso pela ORDEM (recalcular quando o catálogo
  // chegasse). Falhou quatro vezes seguidas porque sempre havia um caminho de
  // inicialização que não passava pelo gancho. Recalcular na abertura não
  // depende de ordem nenhuma: o que você está olhando acabou de ser
  // calculado, ponto.
  //
  // Custo: uma precificação de todos os módulos por abertura do painel. É um
  // clique manual, não um laço de render — e o cache de furos absorve a parte
  // cara.
  if (!projectDrillingsByComponent) {
    // Catálogo ainda não chegou: espera ele e só então desenha, senão o
    // painel abriria mostrando o número velho de novo.
    ensureProjectDrillingCatalog().then(() => { repriceAllProjectSlots(); renderMoneyModal(); });
  } else {
    repriceAllProjectSlots();
  }
  renderMoneyModal();
}
function closeMoneyModal() {
  const modal = document.getElementById('po-money-modal');
  if (modal) modal.classList.remove('open');
}

function renderMoneyModal() {
  const body = document.getElementById('po-money-body');
  if (!body) return;
  document.querySelectorAll('.po-money-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.moneyTab === moneyAbaAtual);
  });
  const rel = collectProjectCostReport(projectSlots);

  if (moneyAbaAtual === 'orcamento') { renderMoneyOrcamento(body, rel); return; }
  if (!moneyFabricaLiberada) { renderMoneySenha(body); return; }
  renderMoneyFabrica(body, rel);
}

// ---- Aba ORÇAMENTO: o que o cliente pode ver. Preço de venda, sem custo.
function renderMoneyOrcamento(body, rel) {
  const linhas = projectSlots.filter((s) => s.result).map((s) => (
    '<tr><td>' + escapeHtmlCutlist(s.module.name || '') + '</td>'
    + '<td class="num">' + Math.round(s.width_mm) + '×' + Math.round(s.height_mm) + '×' + Math.round(s.depth_mm) + '</td>'
    + '<td class="num">' + formatMoney(Number(s.result.total) || 0) + '</td></tr>'
  )).join('');
  body.innerHTML = '<p class="po-money-sub">' + I18n.t('money.quote_sub') + '</p>'
    + '<table class="po-money-table"><thead><tr><th>' + I18n.t('money.col_module') + '</th><th class="num">' + I18n.t('money.col_dims_mm') + '</th>'
    + '<th class="num">' + I18n.t('money.col_price') + '</th></tr></thead><tbody>' + linhas + '</tbody></table>'
    + '<div class="po-money-total"><span>' + I18n.t('money.quote_total') + '</span>'
    + '<strong>' + formatMoney(rel.totalVenda) + '</strong></div>';
}

// ---- Porta da aba FÁBRICA
function renderMoneySenha(body) {
  body.innerHTML = '<div class="po-money-lock">'
    + '<p>' + I18n.t('money.lock_intro') + '</p>'
    + '<input type="password" id="po-money-pass" placeholder="' + I18n.t('money.password_placeholder') + '" autocomplete="off">'
    + '<button type="button" id="po-money-pass-btn">' + I18n.t('money.password_open_btn') + '</button>'
    + '<p class="po-money-erro" id="po-money-erro"></p>'
    + '</div>';
  const tenta = () => {
    const v = (document.getElementById('po-money-pass') || {}).value || '';
    if (v === MONEY_FABRICA_SENHA) { moneyFabricaLiberada = true; renderMoneyModal(); return; }
    const e = document.getElementById('po-money-erro');
    if (e) e.textContent = I18n.t('money.wrong_password');
  };
  document.getElementById('po-money-pass-btn').addEventListener('click', tenta);
  document.getElementById('po-money-pass').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') tenta();
  });
}

// ---- Aba FÁBRICA: custo puro, aberto por natureza, com o % de cada linha.
function renderMoneyFabrica(body, rel) {
  const T = rel.totalCusto || 1;
  const pct = (v) => ((v / T) * 100).toFixed(1) + '%';
  const linha = (rot, detalhe, valor) => (
    '<tr><td>' + rot + '</td><td class="num dim">' + (detalhe || '') + '</td>'
    + '<td class="num">' + formatMoney(valor) + '</td>'
    + '<td class="num pct">' + pct(valor) + '</td></tr>'
  );
  const secao = (titulo) => '<tr class="po-money-sec"><td colspan="4">' + titulo + '</td></tr>';

  // SUBTOTAL POR NATUREZA (2026-08-15, Matt: "preciso um somatório de matéria-
  // prima e um de mão de obra"). É a divisão que a fábrica usa pra decidir
  // coisa diferente: matéria-prima se compra e se estoca; mão de obra é
  // capacidade de máquina e de gente. Somadas num total só, não dá pra
  // enxergar qual das duas está pesando.
  //
  // A FERRAGEM entra em matéria-prima, e não em mão de obra: dobradiça e
  // corrediça são insumo comprado, igual à chapa e à fita. O rótulo diz o que
  // está dentro pra não restar dúvida.
  const fer = rel.ferragem;
  const ferMontagem = Object.keys(rel.ferragemMontagem).map((k) => rel.ferragemMontagem[k])
    .sort((a, b) => b.custo - a.custo || a.name.localeCompare(b.name));
  const totalFerMontagem = ferMontagem.reduce((s, l) => s + l.custo, 0);
  const totalMateria = Object.keys(rel.material).reduce((s, k) => s + rel.material[k].custo, 0)
    + Object.keys(rel.fita).reduce((s, k) => s + rel.fita[k].custo, 0)
    + fer.dobradica.custo + fer['corrediça'].custo + totalFerMontagem;
  const totalMO = rel.labor.corte + rel.labor.fita + rel.labor.furacao
    + rel.labor.usinagem + rel.labor.antiga;

  const subtotal = (rot, valor) => (
    '<tr class="po-money-subtotal"><td>' + rot + '</td><td></td>'
    + '<td class="num">' + formatMoney(valor) + '</td>'
    + '<td class="num pct">' + pct(valor) + '</td></tr>'
  );

  let html = '';
  html += secao(I18n.t('money.section_material'));
  Object.keys(rel.material).sort().forEach((cor) => {
    const m = rel.material[cor];
    html += linha(I18n.t('money.row_board') + escapeHtmlCutlist(cor), m.m2.toFixed(3) + ' m²', m.custo);
  });
  Object.keys(rel.fita).sort().forEach((cor) => {
    const f = rel.fita[cor];
    html += linha(I18n.t('money.row_edgeband') + escapeHtmlCutlist(cor), f.m.toFixed(2) + ' m', f.custo);
  });
  // Dobradiça/corrediça QUEBRADA POR MODELO (2026-08-19, Matt: "nao esta
  // especificando qual corredica nem tamanho") — uma linha por modelo
  // realmente usado, com nome + comprimento do trilho quando tem, em vez de
  // um total genérico "Corrediças". Mesmo padrão de ferMontagem logo abaixo.
  // fer.dobradica.custo/fer['corrediça'].custo continuam existindo (usados
  // em totalMateria/rel.totalCusto), só não viram mais linha própria aqui.
  const dobradicaPorModelo = Object.keys(fer.dobradicaPorModelo).map((k) => fer.dobradicaPorModelo[k])
    .sort((a, b) => b.custo - a.custo || a.name.localeCompare(b.name));
  dobradicaPorModelo.forEach((l) => {
    html += linha(I18n.t('money.row_hinges') + ' — ' + l.name, l.qtd + ' ' + I18n.t('money.unit_pieces'), l.custo);
  });
  const corredicaPorModelo = Object.keys(fer.corredicaPorModelo).map((k) => fer.corredicaPorModelo[k])
    .sort((a, b) => b.custo - a.custo || a.name.localeCompare(b.name));
  corredicaPorModelo.forEach((l) => {
    const tam = l.rail_length_mm != null ? ' (' + Math.round(l.rail_length_mm) + 'mm)' : '';
    html += linha(I18n.t('money.row_slides') + ' — ' + l.name + tam, l.qtd + ' ' + I18n.t('money.unit_pairs'), l.custo);
  });
  // FERRAGEM DE MONTAGEM — minifix (pino+tambor), cavilha, suporte de
  // prateleira etc. (migration 119, ligada no $ Fábrica em 2026-08-18). Uma
  // linha por ITEM comprado, nome vem direto do cadastro (Itens Comprados),
  // então cavilha/tambor/pino aparecem com o nome que o Matt deu a eles lá.
  ferMontagem.forEach((l) => {
    html += linha(l.name, l.qtd + ' ' + (l.unit || 'un'), l.custo);
  });
  html += subtotal(I18n.t('money.subtotal_material'), totalMateria);

  html += secao(I18n.t('money.section_labor'));
  const rotulos = {
    corte: I18n.t('money.labor_cut'), fita: I18n.t('money.labor_glue'),
    furacao: I18n.t('money.labor_drill'), usinagem: I18n.t('money.labor_machining')
  };
  Object.keys(rotulos).forEach((k) => {
    if (rel.labor[k] > 0) html += linha(rotulos[k], '', rel.labor[k]);
  });
  // Peça fora do modelo por processo: aparece SEPARADA, nunca somada num
  // processo — senão o relatório diria que a fábrica gastou em furação um
  // dinheiro que na verdade é de uma labor antiga, indivisível.
  if (rel.labor.antiga > 0) {
    html += linha(I18n.t('money.labor_legacy'), '', rel.labor.antiga);
  }
  html += subtotal(I18n.t('money.subtotal_labor'), totalMO);

  // ---- MÓDULO × VALOR (pedido do Matt: "coloca módulo valor")
  let porMod = '';
  rel.porModulo.forEach((m) => {
    porMod += '<tr><td>' + escapeHtmlCutlist(m.nome) + '</td>'
      + '<td class="num dim">' + m.dims + '</td>'
      + '<td class="num">' + formatMoney(m.custo) + '</td>'
      + '<td class="num pct">' + ((m.custo / T) * 100).toFixed(1) + '%</td></tr>';
  });

  // ---- POR PEÇA, CADA ETAPA SEPARADA. É a tabela que responde "quantos
  // pequenos processos ele está cobrando" — uma linha por peça, uma coluna
  // por etapa. Sem linha por furo, como o Matt pediu.
  let porPeca = '';
  rel.detalhe.forEach((l) => {
    const cel = (v) => '<td class="num">' + (v > 0 ? formatMoney(v) : '<span class="zero">—</span>') + '</td>';
    porPeca += '<tr><td>' + escapeHtmlCutlist(l.peca) + (l.qtd > 1 ? ' <span class="dim">×' + l.qtd + '</span>' : '') + '</td>'
      + '<td class="num dim">' + l.m2.toFixed(3) + '</td>'
      + '<td class="num dim">' + (l.fitaM > 0 ? l.fitaM.toFixed(2) : '—') + '</td>'
      + cel(l.chapa) + cel(l.fita) + cel(l.corte) + cel(l.colagem) + cel(l.furacao)
      + cel(l.usinagem) + cel(l.laborAntiga) + cel(l.ferragem)
      + '<td class="num"><strong>' + formatMoney(l.total) + '</strong></td></tr>';
  });

  const margem = rel.totalVenda - rel.totalCusto;
  const th = (k, num) => '<th' + (num ? ' class="num"' : '') + '>' + I18n.t(k) + '</th>';
  body.innerHTML = '<p class="po-money-sub">' + I18n.t('money.factory_sub', { n: rel.pecas }) + '</p>'
    + '<table class="po-money-table"><thead><tr>' + th('money.col_nature') + th('money.col_qty', 1)
    + th('money.col_cost', 1) + '<th class="num">%</th></tr></thead><tbody>' + html + '</tbody></table>'

    + (rel.porModulo.length ? '<h4 class="po-money-h">' + I18n.t('money.by_module_title') + '</h4>'
      + '<table class="po-money-table"><thead><tr>' + th('money.col_module') + th('money.col_dims', 1)
      + th('money.col_cost', 1) + '<th class="num">%</th></tr></thead><tbody>' + porMod + '</tbody></table>' : '')

    + '<h4 class="po-money-h">' + I18n.t('money.by_piece_title') + '</h4>'
    + '<p class="po-money-sub">' + I18n.t('money.by_piece_sub') + '</p>'
    + '<div class="po-money-scroll"><table class="po-money-table po-money-peca"><thead><tr>'
    + th('money.col_piece') + '<th class="num">m²</th>' + th('money.col_edge_m', 1)
    + th('money.col_board', 1) + th('money.col_edge', 1) + th('money.col_cut', 1)
    + th('money.col_glue', 1) + th('money.col_drill', 1) + th('money.col_machining', 1)
    + th('money.col_legacy_labor', 1) + th('money.col_hardware', 1) + th('money.col_total', 1)
    + '</tr></thead><tbody>' + porPeca + '</tbody></table></div>'

    + '<div class="po-money-total"><span>' + I18n.t('money.total_cost') + '</span><strong>' + formatMoney(rel.totalCusto) + '</strong></div>'
    + '<div class="po-money-total secundario"><span>' + I18n.t('money.total_sale') + '</span>'
    + '<span>' + formatMoney(rel.totalVenda) + '</span></div>'
    + '<div class="po-money-total secundario"><span>' + I18n.t('money.gross_margin') + '</span>'
    + '<span>' + formatMoney(margem)
    + (rel.totalVenda > 0 ? ' · ' + ((margem / rel.totalVenda) * 100).toFixed(1) + I18n.t('money.pct_of_price') : '')
    + '</span></div>';
}

(function ligaMoneyModal() {
  const liga = () => {
    // Dois gatilhos: o da BARRA (principal, 2026-08-15) e o do rodapé do
    // resumo. Se um dia o do resumo sair, o da barra continua valendo.
    const btnTb = document.getElementById('po-proj-money-tb-btn');
    const btn = document.getElementById('po-proj-money-btn');
    if (!btnTb && !btn) return false;
    if (btnTb) btnTb.addEventListener('click', openMoneyModal);
    if (btn) btn.addEventListener('click', openMoneyModal);
    const fechar = document.getElementById('po-money-close');
    if (fechar) fechar.addEventListener('click', closeMoneyModal);
    document.querySelectorAll('.po-money-tab').forEach((b) => {
      b.addEventListener('click', () => { moneyAbaAtual = b.dataset.moneyTab; renderMoneyModal(); });
    });
    const modal = document.getElementById('po-money-modal');
    if (modal) modal.addEventListener('click', (ev) => { if (ev.target === modal) closeMoneyModal(); });
    return true;
  };
  if (!liga()) document.addEventListener('DOMContentLoaded', liga);
})();

// ==========================================================================
// $ FÁBRICA — o custo do projeto aberto por natureza (2026-08-15)
// ==========================================================================
// Pedido do Matt: "quero enxergar esses custos todos separados no módulo...
// um relatório completo, mostrando quantos m² de material, fita de borda, por
// cor, e cada labor. % do lado sobre o total. Sem margem, só custo."
//
// NÃO calcula nada novo. Tudo isto já sai de Pricing.calculateModulePrice, por
// peça, no `breakdown` (que o próprio pricing.js marca como "uso interno/admin
// — NÃO mostrar ao cliente: custo puro"). Aqui é só somar e agrupar.
//
// Três detalhes que decidem se o número fecha:
//   1. `area_m2` e `edge_band_m` são POR UNIDADE; sheet_cost/edge_cost/
//      labor_cost já vêm multiplicados pela quantidade. Misturar isso é o
//      jeito mais fácil de o relatório não bater com o total.
//   2. Peça-MÓDULO (is_module) não tem custo próprio: o custo está nas
//      child_breakdown dela. Por isso a travessia é recursiva e só soma folha.
//   3. `labor_breakdown` só existe na peça que está em processo (migration
//      090). Quem não está tem uma labor única e indivisível — ela vai pra
//      linha "Mão de obra (peça antiga)" em vez de sumir ou ser chutada em
//      cima de um processo.
function collectProjectCostReport(slots) {
  const rel = {
    material: {},      // por cor: { m2, custo }
    fita: {},          // por cor: { m, custo }
    labor: { corte: 0, fita: 0, furacao: 0, usinagem: 0, antiga: 0 },
    ferragem: {
      dobradica: { qtd: 0, custo: 0 }, corrediça: { qtd: 0, custo: 0 },
      // POR MODELO (2026-08-19, Matt: "nao esta especificando qual corredica
      // nem tamanho"). Os buckets acima (dobradica/corrediça) continuam
      // existindo pra rel.totalCusto e o "qtd total" — estes aqui são só pra
      // exibir QUAL corrediça/dobradiça pagou por cada parcela, quebrado por
      // modelo (nome + comprimento do trilho, quando tem). Chave: model_id
      // (hinge_model_id/slide_model_id, ver Pricing.calculateModulePiece/
      // calculateLeafPiece) — mesmo padrão de ferragemMontagem abaixo.
      dobradicaPorModelo: {}, corredicaPorModelo: {}
    },
    // FERRAGEM DE MONTAGEM (minifix/cavilha/tambor/suporte, migration 119,
    // 2026-08-18) — Matt: "nao esta aparecendo minifix, cavilha, corredica e
    // tambor minifix" no $ Fábrica. Causa: o cálculo (Hardware.consumoDoModulo,
    // ligado hoje mais cedo em recomputeProjectSlotPricing) já soma certo no
    // TOTAL do módulo, mas essa lista nunca virava linha nenhuma na tela —
    // ficava escondida dentro do total, sem nome nem valor visível. Chave é o
    // item_id (mesmo item comprado repetido em módulos diferentes soma numa
    // linha só, igual dobradiça/corrediça acima).
    ferragemMontagem: {}, // por item_id: { code, name, unit, qtd, custo }
    totalCusto: 0,
    totalVenda: 0,
    pecas: 0,
    detalhe: [],       // uma linha por PEÇA, com cada etapa separada
    porModulo: []      // { nome, dims, custo, venda } — "módulo × valor"
  };

  const nomeCor = (slot, roleId) => {
    const c = (slot.colorsByRole || {})[roleId];
    return (c && c.name) || I18n.t('money.no_color');
  };

  // Empilha custo de dobradiça/corrediça POR MODELO (2026-08-19) — id ausente
  // (peça antiga calculada antes desta mudança, ou hardware sem modelo
  // identificável) cai num balde "modelo não identificado" em vez de sumir.
  const registraFerragemModelo = (mapa, modelId, modelName, railMm, qtd, custo) => {
    const chave = modelId || ('#' + (modelName || '?'));
    const acc = mapa[chave] || (mapa[chave] = {
      name: modelName || I18n.t('money.no_hardware_model'),
      rail_length_mm: railMm != null ? railMm : null,
      qtd: 0, custo: 0
    });
    acc.qtd += qtd;
    acc.custo += custo;
    if (acc.rail_length_mm == null && railMm != null) acc.rail_length_mm = railMm;
  };

  // Rótulo da peça com "— Modelo NNNmm" quando tem hardware com nome
  // identificado — é o que faz a tabela "BY PART" também responder "qual
  // corrediça" sem precisar abrir a linha de matéria-prima.
  const labelComModelo = (base, modelName, railMm) => {
    if (!modelName) return base;
    const tam = railMm != null ? ' ' + Math.round(railMm) + 'mm' : '';
    return base + ' — ' + modelName + tam;
  };

  const anda = (slot, linhas, prefixo, fator) => {
    fator = fator || 1;
    (linhas || []).forEach((p) => {
      if (p.is_module) {
        // Peça-módulo não tem CHAPA/FITA/MÃO DE OBRA próprias (isso está nos
        // filhos, por isso a travessia recursiva abaixo) — mas PODE ter
        // dobradiça/corrediça PRÓPRIA, quando ela mesma abre (opening_type/
        // slides_per_unit do módulo filho, OU do agregado que a gerou — ver
        // Pricing.calculateModulePiece, hinge_cost/slide_cost calculados em
        // cima do "efetivo" da peça-módulo, não repassados pros filhos).
        //
        // BUG (Matt, 2026-08-19: "e deixei tudo ligado e no construtor nao
        // apareceu a corredica no preco"): esta função assumia "peça-módulo
        // nunca tem custo próprio" — verdade pra chapa/fita/mão de obra,
        // falso pra dobradiça/corrediça. Uma gaveta usada como agregado
        // (accessory_types.child_module_id, opening_type=slide_out) SEMPRE
        // caía aqui sem a corrediça dela ser contada: nem a linha
        // "Corrediças" aparecia (ferragem.corrediça.custo nunca recebia
        // nada), nem o total "By module"/rel.totalCusto batiam com
        // Pricing.calculateModulePrice (que soma certo — SÓ este relatório,
        // que refaz a soma peça a peça, estava com o buraco). O total de
        // VENDA (slot.result.total, o que o cliente paga) sempre esteve
        // certo — só o detalhamento de CUSTO que escondia a parcela.
        //
        // `fator` acumula a quantidade dos ANCESTRAIS (peça-módulo dentro de
        // peça-módulo) — mesmo padrão de collectPurchasedCost em
        // js/pricing.js. hinge_cost/slide_cost do PRÓPRIO `p` já vêm
        // multiplicados pela quantidade DELE (ver calculateModulePiece), por
        // isso não entra de novo aqui — só o fator dos pais.
        const hingeCost = (Number(p.hinge_cost) || 0) * fator;
        const slideCost = (Number(p.slide_cost) || 0) * fator;
        if (hingeCost > 0 || slideCost > 0) {
          const qtdEfetiva = (Number(p.quantity) || 1) * fator;
          const baseLabel = (prefixo ? prefixo + ' › ' : '') + (p.reference || '');
          // Entra no detalhe (linha própria na tabela "BY PART", coluna
          // HARDWARE) pro total "By module" (que soma rel.detalhe) fechar —
          // sem isto, a linha "Corrediças" apareceria certa mas o total do
          // módulo continuaria batendo errado. NÃO soma em rel.pecas: não é
          // uma peça física cortada, é hardware da peça-módulo. Rótulo ganha
          // "— Modelo NNNmm" (2026-08-19) quando o modelo é identificado.
          rel.detalhe.push({
            modulo: (slot.module && slot.module.name) || '',
            peca: hingeCost > 0
              ? labelComModelo(baseLabel, p.hinge_model_name, null)
              : labelComModelo(baseLabel, p.slide_model_name, p.slide_model_rail_length_mm),
            qtd: qtdEfetiva,
            m2: 0, fitaM: 0, chapa: 0, fita: 0, corte: 0, colagem: 0, furacao: 0, usinagem: 0, laborAntiga: 0,
            ferragem: hingeCost + slideCost,
            total: hingeCost + slideCost
          });
          if (hingeCost > 0) {
            rel.ferragem.dobradica.qtd += (Number(p.hinge_count) || 0) * qtdEfetiva;
            rel.ferragem.dobradica.custo += hingeCost;
            registraFerragemModelo(rel.ferragem.dobradicaPorModelo, p.hinge_model_id, p.hinge_model_name, null,
              (Number(p.hinge_count) || 0) * qtdEfetiva, hingeCost);
          }
          if (slideCost > 0) {
            rel.ferragem['corrediça'].qtd += qtdEfetiva;
            rel.ferragem['corrediça'].custo += slideCost;
            registraFerragemModelo(rel.ferragem.corredicaPorModelo, p.slide_model_id, p.slide_model_name,
              p.slide_model_rail_length_mm, qtdEfetiva, slideCost);
          }
        }
        // O nome dela vira prefixo pra a peça-folha lá dentro não aparecer
        // solta no detalhamento — "Gaveta › Fundo" diz de onde veio.
        anda(slot, p.child_breakdown, (prefixo ? prefixo + ' › ' : '') + (p.reference || ''), fator * (Number(p.quantity) || 1));
        return;
      }
      const qtd = Number(p.quantity) || 1;
      rel.pecas += qtd;

      // DETALHE POR PEÇA (2026-08-15, Matt: "coloca o valor de cada etapa, não
      // só somatório. Quero ver quantos pequenos processos ele está cobrando,
      // não precisa uma linha por furo, mas POR PEÇA o que ele tá cobrando").
      // É a linha que permite auditar: dá pra ver a peça que está pagando
      // furação sem levar furo, ou corte caro demais pro tamanho dela.
      const lb = p.labor_breakdown || {};
      const pecaBase = (prefixo ? prefixo + ' › ' : '') + (p.reference || '');
      // "— Modelo NNNmm" (2026-08-19) na peça-folha comum também — uma porta/
      // gaveta feita de componente de catálogo (não peça-módulo) pode ter
      // hinge_cost/slide_cost própria (calculateLeafPiece), mesmo motivo do
      // branch is_module acima.
      const pecaLabel = (Number(p.hinge_cost) || 0) > 0
        ? labelComModelo(pecaBase, p.hinge_model_name, null)
        : (Number(p.slide_cost) || 0) > 0
          ? labelComModelo(pecaBase, p.slide_model_name, p.slide_model_rail_length_mm)
          : pecaBase;
      rel.detalhe.push({
        modulo: (slot.module && slot.module.name) || '',
        peca: pecaLabel,
        qtd: qtd,
        m2: (Number(p.area_m2) || 0) * qtd,
        fitaM: (Number(p.edge_band_m) || 0) * qtd,
        chapa: Number(p.sheet_cost) || 0,
        fita: Number(p.edge_cost) || 0,
        corte: Number(lb.corte) || 0,
        colagem: Number(lb.fita) || 0,
        furacao: Number(lb.furacao) || 0,
        usinagem: Number(lb.usinagem) || 0,
        // Sem labor_breakdown a peça tem uma labor única e indivisível — ela
        // vai nesta coluna, e NUNCA distribuída pelos processos.
        laborAntiga: p.labor_breakdown ? 0 : (Number(p.labor_cost) || 0),
        ferragem: (Number(p.hinge_cost) || 0) + (Number(p.slide_cost) || 0),
        total: (Number(p.sheet_cost) || 0) + (Number(p.edge_cost) || 0)
          + (Number(p.labor_cost) || 0) + (Number(p.hinge_cost) || 0) + (Number(p.slide_cost) || 0)
      });

      const cor = nomeCor(slot, p.color_role_id);
      const m = rel.material[cor] || (rel.material[cor] = { m2: 0, custo: 0 });
      m.m2 += (Number(p.area_m2) || 0) * qtd;
      m.custo += Number(p.sheet_cost) || 0;

      if ((Number(p.edge_band_m) || 0) > 0) {
        const f = rel.fita[cor] || (rel.fita[cor] = { m: 0, custo: 0 });
        f.m += (Number(p.edge_band_m) || 0) * qtd;
        f.custo += Number(p.edge_cost) || 0;
      }

      if (p.labor_breakdown) {
        rel.labor.corte += Number(p.labor_breakdown.corte) || 0;
        rel.labor.fita += Number(p.labor_breakdown.fita) || 0;
        rel.labor.furacao += Number(p.labor_breakdown.furacao) || 0;
        rel.labor.usinagem += Number(p.labor_breakdown.usinagem) || 0;
      } else {
        rel.labor.antiga += Number(p.labor_cost) || 0;
      }

      if ((Number(p.hinge_cost) || 0) > 0) {
        rel.ferragem.dobradica.qtd += (Number(p.hinge_count) || 0) * qtd;
        rel.ferragem.dobradica.custo += Number(p.hinge_cost) || 0;
        registraFerragemModelo(rel.ferragem.dobradicaPorModelo, p.hinge_model_id, p.hinge_model_name, null,
          (Number(p.hinge_count) || 0) * qtd, Number(p.hinge_cost) || 0);
      }
      if ((Number(p.slide_cost) || 0) > 0) {
        rel.ferragem['corrediça'].qtd += qtd;
        rel.ferragem['corrediça'].custo += Number(p.slide_cost) || 0;
        registraFerragemModelo(rel.ferragem.corredicaPorModelo, p.slide_model_id, p.slide_model_name,
          p.slide_model_rail_length_mm, qtd, Number(p.slide_cost) || 0);
      }
    });
  };

  (slots || []).forEach((slot) => {
    if (!slot.result) return;
    const antes = rel.detalhe.length;
    anda(slot, slot.result.breakdown, '');
    // Custo do módulo = soma das peças DELE (as que acabaram de entrar no
    // detalhe). Sai daí, e não de outro campo, pelo mesmo motivo do total
    // geral: se alguma peça deixar de ser contada, o número denuncia.
    let custo = rel.detalhe.slice(antes).reduce((s2, l) => s2 + l.total, 0);
    // FERRAGEM DE MONTAGEM deste módulo (cavilha/tambor/pino/suporte) — é
    // consumo do MÓDULO inteiro (o furo é da junta, não de UMA peça), então
    // não tem como entrar na travessia peça-a-peça (`anda`) acima. Guardado
    // em recomputeProjectSlotPricing (slot._hardwareConsumo).
    (slot._hardwareConsumo || []).forEach((l) => {
      if (!l || !l.item_id) return;
      const c = Number(l.cost) || 0;
      custo += c;
      const acc = rel.ferragemMontagem[l.item_id] || (rel.ferragemMontagem[l.item_id] = {
        code: l.code || null, name: l.name || '', unit: l.unit || 'un', qtd: 0, custo: 0
      });
      acc.qtd += Number(l.qty) || 0;
      acc.custo += c;
    });
    rel.porModulo.push({
      nome: (slot.module && slot.module.name) || '',
      dims: Math.round(slot.width_mm) + '×' + Math.round(slot.height_mm) + '×' + Math.round(slot.depth_mm),
      custo: custo,
      venda: Number(slot.result.total) || 0
    });
    rel.totalVenda += Number(slot.result.total) || 0;
  });

  // O custo total sai da SOMA das partes, não de outro campo: assim, se
  // alguma natureza deixar de ser contada, os percentuais denunciam na hora
  // em vez de fechar 100% escondendo o buraco.
  Object.keys(rel.material).forEach((k) => { rel.totalCusto += rel.material[k].custo; });
  Object.keys(rel.ferragemMontagem).forEach((k) => { rel.totalCusto += rel.ferragemMontagem[k].custo; });
  Object.keys(rel.fita).forEach((k) => { rel.totalCusto += rel.fita[k].custo; });
  Object.keys(rel.labor).forEach((k) => { rel.totalCusto += rel.labor[k]; });
  rel.totalCusto += rel.ferragem.dobradica.custo + rel.ferragem['corrediça'].custo;
  return rel;
}

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

function updateProjectSlotDimension(slot, axis, mm) {
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
    if (presets.length) {
      slot[`${axis}_mm`] = Pricing.pickNearestPreset(presets, Number(mm) || 0);
      recomputeProjectSlotPricing(slot);
      clampProjectSlotPosition(slot);
      resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
      renderProjectCanvas();
      markProjectDirty();
      return;
    }
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
  slot[`${axis}_mm`] = clamp(Number(mm) || 0, minMm, maxMm);
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

// Troca em massa (pedido do usuário 2026-07-26: "que eu possa trocar as
// cores conforme os modelos de todos modulos inseridos de uma vez so") —
// mesmo princípio de applyColorRoleToComposition, mas em cima de
// projectSlots/recomputeProjectSlotPricing (usa peças EFETIVAS — sem
// opcional não marcado — igual todo o resto da aba Projetos, ver
// projectSlotEffectivePieces). Só mexe nos slots que realmente usam esse
// papel de cor (pieceTreeHasColorRole); erro num slot não trava os outros.
function applyColorRoleToAllProjectSlots(roleId, color) {
  const errorEl = document.getElementById('po-proj-side-color-error');
  if (errorEl) errorEl.style.display = 'none';
  let firstErrorMsg = null;
  projectSlots.forEach((slot) => {
    if (!pieceTreeHasColorRole(slot.pieces, roleId)) return;
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
    if (chosen) applyColorRoleToAllProjectSlots(group.roleId, chosen);
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
  const dimRow = (axis, label) => `
    <div class="po-proj-config-dim-row">
      <label>${label}</label>
      <span class="po-proj-dim-value-wrap">
        <input type="text" inputmode="decimal" class="po-proj-dim-input" data-axis="${axis}" value="${formatDimensionNumber(slot[`${axis}_mm`], unit)}" />
        <span class="po-proj-dim-unit">${unitAbbrev(unit)}</span>
      </span>
    </div>
  `;

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

  panel.innerHTML = `
    <h3>${slot.module.name}</h3>
    <div class="po-proj-config-dims">
      ${dimRow('width', I18n.t('step1.filter_width'))}
      ${dimRow('height', I18n.t('step1.filter_height'))}
      ${dimRow('depth', I18n.t('step1.filter_depth'))}
    </div>
    ${colorSections ? `<div class="po-proj-config-colors"><span class="po-proj-config-section-label">${I18n.t('project.config_color_label')}</span>${colorSections}</div>` : ''}
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
  panel.querySelectorAll('.po-proj-color-swatch').forEach((el) => {
    el.addEventListener('click', () => {
      const roleId = el.dataset.roleId;
      const opts = (slot.colorOptionsByRole && slot.colorOptionsByRole[roleId]) || [];
      const color = opts.find((c) => String(c.id) === el.dataset.colorId);
      if (color) updateProjectSlotColor(slot, roleId, color);
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
    floorAssemblies: buildProjectAssemblies(projectFloorSlots())
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

function openProjectSlotPieces(slotId) {
  const slot = projectSlots.find((s) => s.id === slotId);
  const modal = document.getElementById('po-pieces-modal');
  if (!slot || !modal) return;
  const titulo = document.getElementById('po-pieces-title');
  if (titulo) titulo.textContent = (slot.module && slot.module.name) || I18n.t('pieces.modal_title');
  modal.classList.add('open');
  renderProjectSlotPiecesList(slot);
  renderProjectSlotPiecesExploded(slot);
}

// Achata a árvore (peça-módulo tem filhas) — a conferência quer a peça que vai
// pra serra, não o agrupamento.
function flatProjectPieces(parts, prefixo) {
  const saida = [];
  (parts || []).forEach((p) => {
    if (p.is_module && Array.isArray(p.child_parts) && p.child_parts.length) {
      saida.push(...flatProjectPieces(p.child_parts, (prefixo ? prefixo + ' · ' : '') + (p.module_name || p.reference || '')));
    } else {
      saida.push({ p, grupo: prefixo || '' });
    }
  });
  return saida;
}

function renderProjectSlotPiecesList(slot) {
  const el = document.getElementById('po-pieces-list');
  if (!el) return;
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  let parts = [];
  try {
    parts = resolvePiecesForViewer(
      projectSlotEffectivePieces(slot),
      { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm },
      slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides
    ) || [];
  } catch (e) { parts = []; }
  const linhas = flatProjectPieces(parts);
  if (!linhas.length) { el.innerHTML = '<p class="hint">' + I18n.t('pieces.empty') + '</p>'; return; }

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
    + '</th><th>' + I18n.t('pieces.col_color') + '</th><th>' + I18n.t('pieces.col_grain') + '</th>'
    + '</tr></thead><tbody>'
    + linhas.map(({ p, grupo }, i) => {
      const d = dim(p);
      const cor = (p.color && (p.color.name || p.color.code)) || '—';
      const veio = p.veio || (p.components && p.components.veio) || I18n.t('pieces.grain_free');
      return '<tr data-idx="' + i + '"><td>' + (i + 1) + '</td>'
        + '<td>' + escapeHtmlCutlist((grupo ? grupo + ' · ' : '') + (p.reference || p.module_name || '')) + '</td>'
        + '<td>' + formatDimension(d.c, unit) + '</td>'
        + '<td>' + formatDimension(d.l, unit) + '</td>'
        + '<td>' + formatDimension(d.e, unit) + '</td>'
        + '<td>' + escapeHtmlCutlist(cor) + '</td>'
        + '<td>' + escapeHtmlCutlist(veio) + '</td></tr>';
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
