// Portal do cliente — LEGNO PORTAL WEB
//
// Fluxo: o cliente cria uma conta / entra (Supabase Auth), monta um PEDIDO
// adicionando módulo a módulo (cada um configurado com as mesmas opções da
// calculadora avulsa — medidas, cores, opcionais...), a lista vai crescendo
// com o somatório, e no final ele envia o pedido inteiro de uma vez. Depois
// pode ver os pedidos já salvos na aba "Meus pedidos".
//
// A parte de "configurar um módulo" (filtros, medidas, cores, opcionais, 3D
// ao vivo) é a mesma lógica já validada em client.js, só que em vez de
// enviar um orçamento avulso ao clicar em enviar, ela fica guardada em
// "lastItemResult" até o cliente clicar em "Adicionar este módulo ao
// pedido" — aí sim vira uma linha em order_items.

// ---------- Estado: configurador do módulo atual ----------

let allModules = [];
let modules = [];
let familiesCacheList = [];
let categoriesCacheList = [];
let subcategoriesCacheList = [];
// pieces = peças do módulo raiz, já no formato RECURSIVO (Fase 2 — migration
// 023): cada item é OU uma peça-componente de catálogo (folha) OU um módulo
// inteiro usado como peça aninhada (is_module=true, child_pieces=[...] na
// mesma forma recursiva) — ver loadRecursivePiecesForModule (idêntica à de
// client.js). Substitui por completo o antigo par door_styles/drawer_types.
let pieces = [];
// Catálogo de papéis de cor (migration 035 — color_roles), carregado uma vez
// no init — substitui o binário fixo boxColors/doorColors (ver client.js
// pro mesmo padrão, comentado com mais detalhe lá).
let colorRolesCache = [];
// Cores disponíveis por papel PRA O MÓDULO ATUAL — { [role_id]: [colors...] }.
let moduleColorsByRole = {};
// Cor escolhida pelo cliente, por papel — { [role_id]: color_id }.
let selectedColorIdByRole = {};
// Cor escolhida pelo cliente, POR PEÇA-MÓDULO ANINHADA com
// client_color_configurable ligado (migration 046) — { [piece_id]: { [role_id]: color_id } }.
// Independente de selectedColorIdByRole (que continua valendo pro resto da árvore, pros papéis
// sem override): ver renderColorRoleSwatchGroups/collectColorConfigurablePieces.
let nestedModuleColorSelections = {};
let hingeModels = [];
let slideModels = [];
let currentModule = null;
// Multiplicador de margem (migration 037, admin > Margem de preço) — mesmo
// espírito de client.js (ver comentário lá). Carregado uma vez no login.
let pricingMarkupMultiplier = 1;
// Densidade do material em kg/m³ (migration 061, admin > Preço) — usada só
// pra estimar o PESO mostrado ao cliente (volume x densidade), junto do
// preço e da metragem cúbica (m³). Default 700 (MDP/MDF cru) até carregar
// (ou se a coluna ainda não existir num banco antigo) — mesmo padrão de
// pricingMarkupMultiplier acima (widened no mesmo select, ver loadPricingMarkup).
let materialDensityKgPerM3 = 700;

let viewer3dNeedsRefit = true;
let selectedOptionalComponentIds = new Set();

// Altura do chão (mm) do módulo em configuração agora — fonte de verdade
// interna do campo #po-comp-floor-height-input (ver refreshFloorHeightInputUI/
// applyFloorHeightInput mais abaixo), que EXIBE esse valor na unidade
// global escolhida (mm/cm/m/pol/ft), mas guarda/usa sempre em mm por baixo
// — mesmo padrão de width_mm/height_mm/depth_mm (guardados em mm no
// slider, só formatados na hora de mostrar). Sem slider aqui (não faz
// sentido pra altura do chão), então precisa dessa variável em vez de ler
// de um input[type=range].value.
let currentFloorHeightMm = 0;

// Valores sugeridos/travados de medida (migration 028, module_dimension_presets)
// do módulo atual — mesmo mecanismo do client.js (ver lá pra explicação
// completa): travado esconde a régua livre e mostra um dropdown só com
// esses valores; sem trava, a régua fica livre e eles viram chips de atalho.
let dimensionPresets = { width: [], height: [], depth: [] };

// Resultado calculado do módulo que está sendo configurado agora (ainda não
// adicionado ao pedido) — é isso que vira uma linha de order_items quando o
// cliente clica em "Adicionar".
let lastItemResult = null;

// Sub-configuração de medidas por peça-módulo aninhada (migration 036) —
// funções de refresh de label (unidade de medida) registradas por
// renderPieceDimensionSubconfigs, chamadas de dentro de updateDimensionUnitUI
// pra ficar em sincronia com a régua do módulo pai quando o cliente troca a
// unidade (mm/cm/m/ft/in). Zerado a cada renderPieceDimensionSubconfigs
// (módulo trocado = sliders antigos não existem mais no DOM).
let pieceSubconfigLabelUpdaters = [];

// Por padrão, uma peça com sub-configuração ACOMPANHA o módulo pai — mede o
// que a fórmula calcular a partir do W/H/D atual dele, exatamente como uma
// peça sem essa opção (pedido do usuário: "mesmo com as configurações dele
// separadas, ele de praxe acompanharia as configurações do pai em primeiro
// lugar"). Só quando o cliente mexe manualmente num slider da peça é que
// aquele eixo (só aquele — os outros 2 continuam acompanhando o pai) vira um
// valor FIXO, independente do que aconteça com o módulo pai dali pra frente.
// Chaves `${piece_id}:${axis}` ('width'/'height'/'depth'). Zerado a cada
// renderPieceDimensionSubconfigs (módulo trocado = nenhum eixo customizado
// ainda nesse módulo novo).
let touchedPieceDimAxes = new Set();

// ---------- Estado: pedido (carrinho) ----------

let currentDraftOrderId = null; // null até o primeiro item ser adicionado (ou até um rascunho existente ser retomado)
// Status de verdade do pedido apontado por currentDraftOrderId — 'draft'
// quando é um rascunho novo (criado por ensureDraftOrder/retomado por
// loadDraftOrderIfAny), ou o status real de um pedido JÁ existente quando o
// cliente volta a mexer nele via "Continuar comprando" (continueShoppingOnOrder
// — pode ser um 'submitted'/"Pendente" antigo). Usado por startNewOrder pra
// decidir se é seguro APAGAR o pedido de vez ao "descartar" (só se ainda for
// 'draft' — nunca apaga um pedido que já existia antes desta sessão).
let currentDraftOrderStatus = null;
let cartItems = []; // espelha as linhas de order_items do pedido em andamento
let currentUser = null; // { id, email } da sessão logada

// ---------- Unidade de medida (idêntico ao client.js) ----------

const MM_PER_INCH = 25.4;

// migration 061 — precisam ser declaradas AQUI (não onde são usadas lá
// embaixo, perto de formatWeightKg/formatVolumeWeight) porque
// setupWeightUnitSelect() é CHAMADA logo no início do script (ver
// "setupWeightUnitSelect();" perto de refreshRoomSettingsInputs()) — sendo
// `const`, ficam numa "zona morta temporal" até a linha da declaração
// rodar; chamar a função antes disso lançava
// "ReferenceError: Cannot access 'WEIGHT_UNIT_STORAGE_KEY' before
// initialization" (bug relatado pelo usuário, página inteira ficava em
// branco porque isso quebrava a execução do script logo no começo).
const KG_PER_LB = 0.45359237;
const WEIGHT_UNIT_STORAGE_KEY = 'legno_weight_unit';

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function mmToFractionalInches(mm) {
  const totalInches = Math.max(mm, 0) / MM_PER_INCH;
  let whole = Math.floor(totalInches);
  let numerator = Math.round((totalInches - whole) * 32);
  if (numerator === 32) { numerator = 0; whole += 1; }
  if (numerator === 0) return `${whole}"`;
  const divisor = gcd(numerator, 32);
  const num = numerator / divisor;
  const den = 32 / divisor;
  return whole > 0 ? `${whole} ${num}/${den}"` : `${num}/${den}"`;
}

function formatDimension(mm, unit) {
  switch (unit) {
    case 'cm': return `${(mm / 10).toFixed(1)} cm`;
    case 'm': return `${(mm / 1000).toFixed(3)} m`;
    case 'ft': return `${(mm / 304.8).toFixed(3)} ft`;
    case 'in': return mmToFractionalInches(mm);
    case 'mm':
    default: return `${Math.round(mm)} mm`;
  }
}

function formatDimensionNumber(mm, unit) {
  switch (unit) {
    case 'cm': return (mm / 10).toFixed(1);
    case 'm': return (mm / 1000).toFixed(3);
    case 'ft': return (mm / 304.8).toFixed(3);
    case 'in': return mmToFractionalInches(mm).replace('"', '');
    case 'mm':
    default: return `${Math.round(mm)}`;
  }
}

function unitAbbrev(unit) {
  switch (unit) {
    case 'cm': return 'cm';
    case 'm': return 'm';
    case 'ft': return 'ft';
    case 'in': return 'in';
    case 'mm':
    default: return 'mm';
  }
}

function parseDimensionInput(str, unit) {
  if (!str) return null;
  const clean = String(str).trim().replace(/["']/g, '').replace(',', '.');
  if (!clean) return null;

  if (unit === 'in') {
    const fractionMatch = clean.match(/^(\d+(?:\.\d+)?)?\s*(\d+)\/(\d+)$/);
    if (fractionMatch) {
      const whole = fractionMatch[1] ? parseFloat(fractionMatch[1]) : 0;
      const num = parseFloat(fractionMatch[2]);
      const den = parseFloat(fractionMatch[3]);
      if (!den) return null;
      return (whole + num / den) * MM_PER_INCH;
    }
    const asDecimal = parseFloat(clean);
    return isNaN(asDecimal) ? null : asDecimal * MM_PER_INCH;
  }

  const val = parseFloat(clean);
  if (isNaN(val)) return null;
  switch (unit) {
    case 'cm': return val * 10;
    case 'm': return val * 1000;
    case 'ft': return val * 304.8;
    case 'mm':
    default: return val;
  }
}

function updateDimensionUnitUI() {
  const unitSelect = document.getElementById('po-unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';
  const step = unit === 'in' ? (MM_PER_INCH / 32) : 1;
  [
    ['width', 'po-width-input', 'po-width-min-label', 'po-width-max-label', 'po-width-value', 'po-width-exact', 'po-width-exact-unit'],
    ['height', 'po-height-input', 'po-height-min-label', 'po-height-max-label', 'po-height-value', 'po-height-exact', 'po-height-exact-unit'],
    ['depth', 'po-depth-input', 'po-depth-min-label', 'po-depth-max-label', 'po-depth-value', 'po-depth-exact', 'po-depth-exact-unit']
  ].forEach(([, inputId, minId, maxId, valueId, exactId, exactUnitId]) => {
    const input = document.getElementById(inputId);
    if (!input || input.min === '' || input.max === '') return;
    input.step = step;
    document.getElementById(minId).textContent = formatDimension(parseFloat(input.min), unit);
    document.getElementById(maxId).textContent = formatDimension(parseFloat(input.max), unit);
    document.getElementById(valueId).textContent = formatDimension(parseFloat(input.value), unit);
    const exactEl = document.getElementById(exactId);
    if (exactEl && document.activeElement !== exactEl) {
      exactEl.value = formatDimensionNumber(parseFloat(input.value), unit);
    }
    const exactUnitEl = document.getElementById(exactUnitId);
    if (exactUnitEl) exactUnitEl.textContent = unitAbbrev(unit);
  });
  // Sliders de sub-configuração (migration 036, ver renderPieceDimensionSubconfigs)
  // seguem a mesma unidade escolhida pro módulo pai.
  pieceSubconfigLabelUpdaters.forEach((fn) => fn());
}

function applyExactDimension(prefix) {
  const unitSelect = document.getElementById('po-unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';
  const exactEl = document.getElementById('po-' + prefix + '-exact');
  const slider = document.getElementById('po-' + prefix + '-input');
  if (!exactEl || !slider || slider.min === '' || slider.max === '') return;

  const mm = parseDimensionInput(exactEl.value, unit);
  if (mm === null || isNaN(mm)) {
    updateDimensionUnitUI();
    return;
  }
  const clamped = clamp(mm, parseFloat(slider.min), parseFloat(slider.max));
  slider.value = clamped;
  recalculatePreview();
  updateDimensionUnitUI();
}

// Extraído do listener de po-unit-select (2026-07-31, migration 061) pra
// virar uma função nomeada reaproveitável — o novo seletor de unidade de
// PESO (po-weight-unit-select) precisa re-renderizar exatamente o mesmo
// conjunto de telas (todo lugar que mostra preço agora mostra volume/peso
// do lado, ver formatVolumeWeight), sem duplicar a lista em dois listeners.
function refreshAllUnitDependentViews() {
  updateDimensionUnitUI();
  setupDimensionPresetsUI();
  // Seletor de unidade agora é GLOBAL (topo do portal) — precisa re-render
  // de TUDO que já mostra uma medida formatada na tela (bug relatado pelo
  // usuário: "aqui ta polegadas, mas os módulos estão aparecendo com mm"),
  // não só a régua do módulo em configuração. Mesmo conjunto de telas que o
  // listener de troca de IDIOMA já re-renderiza (ver I18n.onLanguageChange
  // mais abaixo) — faz sentido, é o mesmo tipo de "texto formatado que não
  // tem data-i18n pra se atualizar sozinho". renderCompositionSlots() já
  // cuida sozinha dos totais E de regerar o 3D se ele já estiver aberto (ver
  // final da função) — não precisa repetir essa lógica aqui.
  if (typeof allModules !== 'undefined' && allModules.length) renderModuleGallery();
  renderCart();
  if (typeof myOrdersLoaded !== 'undefined' && myOrdersLoaded) loadMyOrders();
  if (typeof renderCompositionSlots === 'function') renderCompositionSlots();
  refreshRoomSettingsInputs();
  // Campo de altura do chão (step 2) também é texto livre na unidade
  // global — mesmo motivo do refreshRoomSettingsInputs acima. As entradas
  // INLINE nos cards da Composição (ver renderCompositionSlots, chamado
  // logo acima) já se reformatam sozinhas porque os cards são reconstruídos
  // do zero a cada render.
  if (typeof refreshFloorHeightInputUI === 'function') refreshFloorHeightInputUI();
  // Rótulo "Ceiling: X" das linhas do ambiente segue a unidade global.
  if (typeof applyViewerRoomEnvironment === 'function') applyViewerRoomEnvironment();
  // Canvas 2D de Projetos (largura do ambiente + medidas de cada módulo no
  // ambiente) também é texto formatado na unidade global — mesmo motivo dos
  // outros re-renders acima.
  if (typeof refreshProjectWallWidthInput === 'function') refreshProjectWallWidthInput();
  if (typeof renderProjectCanvas === 'function') renderProjectCanvas();
  // Preço do módulo em configuração (step 2) também mostra volume/peso do
  // lado agora — se já tem um resultado calculado na tela, refaz só a
  // exibição (não precisa recalcular o preço, só reformatar).
  if (typeof lastItemResult !== 'undefined' && lastItemResult && lastItemResult.result) {
    const vwEl = document.getElementById('po-item-volume-weight');
    if (vwEl) vwEl.textContent = formatVolumeWeight(lastItemResult.result.breakdown);
  }
}

document.getElementById('po-unit-select').addEventListener('change', refreshAllUnitDependentViews);

// ---- Pé direito (ceiling) e rodapé (baseboard) da casa do cliente ----
// Pedido do usuário: o 3D da composição deve mostrar a linha do teto e o
// baseboard da casa, os móveis NÃO podem chegar a menos de 5" do teto (a
// régua de altura fica travada em pé direito − 5"), e móveis encostados na
// parede não tapam o baseboard (só móveis no chão, que ficam na frente
// dele). Os campos ficam no topo do portal (po-ceiling-input /
// po-baseboard-input, ao lado do idioma/unidade), aceitam o valor na unidade
// global escolhida e persistem em mm no localStorage.
const ROOM_CEILING_DEFAULT_MM = 120 * MM_PER_INCH;   // 10 ft (padrão escolhido pelo usuário)
const ROOM_BASEBOARD_DEFAULT_MM = 5.5 * MM_PER_INCH; // 5 1/2" (baseboard americano comum)

// Afastamento do teto — migration_060 (pedido do usuário 2026-07-29): "a
// regra do afastamento do celing... quero que seja aplicada somente quando o
// item tiver essa regra nas configuracoes do modulo... e nela vai ter o valor
// que deve ser respeitado pra nao bater no teto (regra do rodape continua
// igual)". Antes era um valor FIXO (CEILING_CLEARANCE_MM = 5") aplicado a
// TODO módulo sem exceção; agora é OPT-IN por módulo
// (module.ceiling_clearance_enabled, cadastrado no admin) com um valor
// PRÓPRIO (module.ceiling_clearance_mm) — sem a opção marcada (ou sem módulo
// nenhum informado), o afastamento é 0: o móvel pode ir até o teto, só o
// rodapé (roomSettings.baseboard_mm, regra que NÃO mudou) continua sempre
// descontado. Usada em todo lugar que antes lia CEILING_CLEARANCE_MM direto
// (ver grep — ceilingMaxHeightMm/insertProjectModuleDefault/
// projectSlotMaxFloorHeightMm/updateProjectSlotDimension/viewerRoomEnvConfig).
function effectiveCeilingClearanceMm(module) {
  if (!module || !module.ceiling_clearance_enabled) return 0;
  return Number(module.ceiling_clearance_mm) || 0;
}

let roomSettings = {
  ceiling_mm: ROOM_CEILING_DEFAULT_MM,
  baseboard_mm: ROOM_BASEBOARD_DEFAULT_MM
};
try {
  const savedRoom = JSON.parse(localStorage.getItem('legno_room_settings') || 'null');
  if (savedRoom && Number(savedRoom.ceiling_mm) > 0) roomSettings.ceiling_mm = Number(savedRoom.ceiling_mm);
  if (savedRoom && Number(savedRoom.baseboard_mm) >= 0) roomSettings.baseboard_mm = Number(savedRoom.baseboard_mm);
} catch (e) { /* localStorage indisponível/corrompido — usa padrões */ }

// Rodapé do cliente vira variável de fórmula (RODAPE/RB) em pricing.js —
// admin pode escrever ex. Posição Y = "RODAPE" pra peça começar em cima do
// baseboard da casa do cliente.
if (typeof Pricing !== 'undefined' && Pricing.setFormulaGlobals) {
  Pricing.setFormulaGlobals({ RODAPE: roomSettings.baseboard_mm, RB: roomSettings.baseboard_mm });
}

// Config do ambiente 3D (chão/teto/baseboard) — usada TANTO pela Composição
// (ViewerComposition.render) quanto pelo configurador da aba Quote
// (Viewer3D.setRoomEnvironment), sempre com os rótulos na unidade global
// atual.
function viewerRoomEnvConfig() {
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const cfg = {
    ceiling_m: roomSettings.ceiling_mm / 1000,
    baseboard_h_m: roomSettings.baseboard_mm / 1000,
    ceilingLabel: I18n.t('comp3d.ceiling_line_label', { height: formatDimension(roomSettings.ceiling_mm, unit) }),
    maxHeightLabel: I18n.t('comp3d.max_height_label'),
    // Afastamento do teto do módulo ATUAL sendo configurado (migration_060,
    // ver effectiveCeilingClearanceMm) — só este viewer (Viewer3D, singleton
    // do configurador de 1 módulo só, "Novo Orçamento"/edição de slot) tem
    // sempre exatamente UM módulo por vez, então dá pra desenhar a linha
    // tracejada de altura máxima refletindo a regra REAL deste módulo
    // específico. rebuildRoomEnv (viewer3d.js) cai pro próprio padrão de 5"
    // se este campo não vier preenchido (chamadores antigos continuam
    // iguais). A Composição/Projetos (viewer3d_composition.js) têm VÁRIOS
    // módulos na mesma cena — não dá pra desenhar 1 linha "correta" ali, por
    // isso ficaram de fora desta mudança (continuam com o 5" fixo só como
    // referência informativa, não como regra de verdade — a regra de verdade
    // já é sempre por módulo, ver updateProjectSlotDimension/
    // projectSlotMaxFloorHeightMm).
    ceilingClearanceM: effectiveCeilingClearanceMm(currentModule) / 1000
  };
  // Editando um módulo de PROJETO em tela cheia (addTargetProjectSlotId, ver
  // startProjectSlotConfig) — pedido do usuário 2026-07-26: "gostaria de ver
  // o final das paredes, conforme medidas delas". Só a aba Projetos tem uma
  // largura de parede de verdade — passa ela (+ a posição x_mm do slot já
  // existente, se houver) pro Viewer3D desenhar o chão/teto terminando no
  // canto de verdade (ver rebuildRoomEnv em viewer3d.js) em vez da margem
  // genérica de sempre. try/catch só por segurança: esta função já é
  // chamada uma vez na carga inicial da página (applyViewerRoomEnvironment()
  // logo abaixo), ANTES de addTargetProjectSlotId/projectSlots existirem
  // (declarados bem mais abaixo neste arquivo) — nesse 1º call, cai
  // silenciosamente pro comportamento sem parede real (igual sempre foi).
  try {
    if (addTargetProjectSlotId !== null) {
      const existingSlot = projectSlots.find((s) => s.id === addTargetProjectSlotId);
      const wallIndex = existingSlot ? Number(existingSlot.wall_index || 0) : projectActiveWallIndex;
      cfg.wallWidthM = getProjectWallWidthMm(wallIndex) / 1000;
      if (existingSlot) cfg.moduleOffsetFromLeftM = Number(existingSlot.x_mm || 0) / 1000;
    }
  } catch (e) { /* 1ª chamada da página, antes das variáveis de Projetos existirem — ver comentário acima */ }
  return cfg;
}

// Liga as linhas do ambiente no viewer do configurador (aba Quote) — pedido
// do usuário: mesma regra das linhas do chão/teto da Composição.
function applyViewerRoomEnvironment() {
  if (typeof Viewer3D !== 'undefined' && Viewer3D.setRoomEnvironment) {
    Viewer3D.setRoomEnvironment(viewerRoomEnvConfig());
  }
}
applyViewerRoomEnvironment();

// Altura MÁXIMA efetiva de qualquer móvel = pé direito − 5" (afastamento do
// teto) − altura do rodapé (o móvel na parede começa ACIMA do baseboard, não
// tapa ele — então o rodapé também come espaço útil; correção pedida pelo
// usuário: "descontou o de cima mas não descontou o rodapé, tem que
// descontar os 2") − a altura do CHÃO deste módulo (currentFloorHeightMm —
// pedido do usuário, 2026-07-16: "ele tem que considerar de onde parte do
// chao pra dar o maximo"): um módulo empilhado que já nasce mais alto tem
// MENOS espaço vertical sobrando até o teto, não o mesmo de sempre.
// currentFloorHeightMm é 0 fora do modo Composição (e pra qualquer módulo
// no chão de verdade dentro dela), então esta conta continua IDÊNTICA à de
// antes nesses casos — só muda pra quem está configurando um módulo já
// deslocado do chão.
function ceilingMaxHeightMm() {
  return Math.max(roomSettings.ceiling_mm - effectiveCeilingClearanceMm(currentModule) - roomSettings.baseboard_mm - currentFloorHeightMm, 0);
}

// Reescreve os campos formatados na unidade global atual (não mexe no campo
// que o cliente está digitando agora). Pedido do usuário 2026-07-29: além dos
// campos do menu ⚙ (po-ceiling-input/po-baseboard-input), a aba Projetos
// ganhou espelhos próprios (po-proj-ceiling-input/po-proj-baseboard-input,
// ao lado da largura do ambiente) — mesmo roomSettings, só mais um lugar pra
// ler/editar.
function refreshRoomSettingsInputs() {
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  [
    ['po-ceiling-input', roomSettings.ceiling_mm],
    ['po-baseboard-input', roomSettings.baseboard_mm],
    ['po-proj-ceiling-input', roomSettings.ceiling_mm],
    ['po-proj-baseboard-input', roomSettings.baseboard_mm]
  ].forEach(([id, mm]) => {
    const input = document.getElementById(id);
    if (input && document.activeElement !== input) input.value = formatDimensionNumber(mm, unit);
  });
  ['po-proj-ceiling-unit', 'po-proj-baseboard-unit'].forEach((id) => {
    const unitEl = document.getElementById(id);
    if (unitEl) unitEl.textContent = unitAbbrev(unit);
  });
}

// Re-trava a régua de altura do módulo em configuração (se houver) depois
// que o cliente mudou o pé direito — mesmo teto efetivo aplicado em
// setupDimensionInputs e no clamp de addToCart.
function applyRoomSettingsToConfigurator() {
  const h = document.getElementById('po-height-input');
  if (!h || typeof currentModule === 'undefined' || !currentModule) return;
  h.max = Math.min(currentModule.height_max_mm, ceilingMaxHeightMm());
  if (parseFloat(h.value) > parseFloat(h.max)) {
    h.value = h.max;
    recalculatePreview();
  }
  setupDimensionPresetsUI();
  updateDimensionUnitUI();
}

// ROOM_SETTINGS_FIELDS: cada chave de roomSettings agora pode ter MAIS de um
// input na tela (pedido do usuário 2026-07-29: os mesmos pé direito/rodapé
// do menu ⚙ também aparecem juntos da largura do ambiente na aba Projetos,
// po-proj-ceiling-input/po-proj-baseboard-input) — todos escrevem no MESMO
// roomSettings[key], então editar em qualquer um dos dois lugares atualiza o
// outro (refreshRoomSettingsInputs reescreve todos os ids de uma vez).
const ROOM_SETTINGS_FIELDS = [
  { key: 'ceiling_mm', minMm: 48 * MM_PER_INCH, maxMm: 240 * MM_PER_INCH, ids: ['po-ceiling-input', 'po-proj-ceiling-input'] },
  { key: 'baseboard_mm', minMm: 0, maxMm: 12 * MM_PER_INCH, ids: ['po-baseboard-input', 'po-proj-baseboard-input'] }
];
ROOM_SETTINGS_FIELDS.forEach(({ key, minMm, maxMm, ids }) => {
  ids.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('change', () => {
      const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
      const mm = parseDimensionInput(input.value, unit);
      if (mm !== null && !isNaN(mm)) {
        roomSettings[key] = clamp(mm, minMm, maxMm);
        try { localStorage.setItem('legno_room_settings', JSON.stringify(roomSettings)); } catch (e) { /* ok sem persistir */ }
        // Atualiza a variável de fórmula RODAPE/RB e re-renderiza o módulo em
        // configuração (fórmulas de posição/medida podem usar o rodapé).
        if (typeof Pricing !== 'undefined' && Pricing.setFormulaGlobals) {
          Pricing.setFormulaGlobals({ RODAPE: roomSettings.baseboard_mm, RB: roomSettings.baseboard_mm });
        }
        applyRoomSettingsToConfigurator();
        if (typeof currentModule !== 'undefined' && currentModule) recalculatePreview();
        applyViewerRoomEnvironment();
        // 3D da composição já aberto na tela → regenera sozinho com a nova
        // parede/teto (mesmo comportamento de editar um slot, ver
        // renderCompositionSlots).
        const compWrap = document.getElementById('po-comp-3d-wrap');
        if (compWrap && compWrap.style.display !== 'none' && typeof compositionSlots !== 'undefined' && compositionSlots.length >= 2) {
          generateComposition3D();
        }
        // Espelhos na aba Projetos (largura+altura+rodapé juntos, pedido do
        // usuário 2026-07-29) — mesma regra do botão "Salvar" do menu ⚙:
        // reformata a régua e regera o canvas 2D com o novo teto/rodapé.
        if (typeof refreshProjectWallWidthInput === 'function') refreshProjectWallWidthInput();
        if (typeof renderProjectCanvas === 'function') renderProjectCanvas();
      }
      refreshRoomSettingsInputs();
    });
  });
});
refreshRoomSettingsInputs();
setupWeightUnitSelect(); // migration 061 — lê a unidade de peso salva (kg/lb) e liga o listener.

// Botão "Salvar" (pedido do usuário, 2026-07-23) — pé direito/rodapé/unidade
// já persistem/aplicam sozinhos ao sair do campo (ver listeners acima), mas
// o canvas 2D da aba Projetos (renderProjectCanvas) só se atualizava quando
// algo DENTRO daquela aba mudava (arrastar, adicionar módulo etc.), não
// quando o cliente mexia aqui no menu de Configurações. Este botão força o
// refresh explicitamente, sem exigir abrir/fechar a aba Projetos.
const roomSettingsSaveBtn = document.getElementById('po-room-settings-save-btn');
if (roomSettingsSaveBtn) {
  roomSettingsSaveBtn.addEventListener('click', () => {
    if (typeof refreshProjectWallWidthInput === 'function') refreshProjectWallWidthInput();
    if (typeof renderProjectCanvas === 'function') renderProjectCanvas();
  });
}

// Menu de Configurações do topnav (pé direito/rodapé/unidade/idioma) —
// pedido do usuário: "a barra de ferramentas esta baguncada, precisa deixar
// algumas coisas ocultas, pra dar espaco e deixar bem clean". Esses 4
// controles em si (inputs/selects) e toda a lógica acima continuam
// idênticos — só a APRESENTAÇÃO virou um dropdown fechado por padrão em vez
// de sempre visível na barra. Toggle simples + fecha ao clicar fora, mesmo
// padrão de qualquer outro menu solto neste app.
const topnavSettingsToggle = document.getElementById('po-topnav-settings-toggle');
const topnavSettingsMenu = document.getElementById('po-topnav-settings-menu');
if (topnavSettingsToggle && topnavSettingsMenu) {
  topnavSettingsToggle.addEventListener('click', (ev) => {
    ev.stopPropagation();
    topnavSettingsMenu.style.display = topnavSettingsMenu.style.display === 'none' ? 'flex' : 'none';
  });
  topnavSettingsMenu.addEventListener('click', (ev) => ev.stopPropagation());
  document.addEventListener('click', () => { topnavSettingsMenu.style.display = 'none'; });
}

// Trocar senha (migration 053, pedido do usuário 2026-07-19) — pra quem
// recebeu uma senha simples do admin (criada em admin.html, aba Perfis)
// poder trocar sozinho. supabase.auth.updateUser roda com a PRÓPRIA sessão
// do cliente logado — não precisa de admin nem de Edge Function nenhuma.
const changePasswordBtn = document.getElementById('po-change-password-btn');
if (changePasswordBtn) {
  changePasswordBtn.addEventListener('click', async () => {
    const input = document.getElementById('po-change-password-input');
    const statusEl = document.getElementById('po-change-password-status');
    const newPassword = input.value;
    if (!newPassword || newPassword.length < 6) {
      statusEl.textContent = I18n.t('nav.change_password_too_short');
      return;
    }
    statusEl.textContent = '…';
    try {
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
      if (error) throw error;
      input.value = '';
      statusEl.textContent = I18n.t('nav.change_password_success');
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
    } catch (err) {
      statusEl.textContent = I18n.t('nav.change_password_error', { msg: err.message });
    }
  });
}

['width', 'height', 'depth'].forEach((prefix) => {
  const exactEl = document.getElementById('po-' + prefix + '-exact');
  if (!exactEl) return;
  exactEl.addEventListener('change', () => applyExactDimension(prefix));
  exactEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); applyExactDimension(prefix); exactEl.blur(); }
  });
});

function clamp(value, min, max) {
  if (isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function showError(msg) {
  const el = document.getElementById('po-calc-error');
  el.textContent = msg;
  el.style.display = 'block';
}
function clearError() {
  const el = document.getElementById('po-calc-error');
  el.textContent = '';
  el.style.display = 'none';
}

function fillSelect(selectId, items, placeholder) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = placeholder ? `<option value="">${placeholder}</option>` : '';
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    sel.appendChild(opt);
  });
}

// ---------- Taxonomia (agora em pills clicáveis, não <select>) ----------

let selectedFamilyId = '';
let selectedCategoryId = '';
let selectedSubcategoryId = '';

// Marca se o usuário já clicou em alguma pill deste nível (incluindo
// "Todas" explicitamente) — usado por renderTaxonomyTabBars pra saber se
// pode aplicar o default de "primeira aba" ou se deve respeitar a escolha
// do usuário (pedido do usuário, 2026-07-24: "deixa aba todas pro final mas
// comeca mostrando a primeira aba" — Todas continua no fim, mas o estado
// inicial/default passa a ser a primeira aba real, não "Todas").
let familyTouchedByUser = false;
let categoryTouchedByUser = false;
let subcategoryTouchedByUser = false;

// Busca por nome + faixas de Largura/Altura/Profundidade (fase 1 da
// reformulação da vitrine, ver renderModuleGallery/rangeOverlapsModule) —
// filtros adicionais além de família/categoria/subcategoria, todos
// combinados (E lógico) na hora de decidir quais módulos aparecem na grade.
let moduleSearchText = '';
let widthRangeFilter = '';
let heightRangeFilter = '';
let depthRangeFilter = '';

// value = "minMm-maxMm" (ver <option> em portal.html) ou '' (sem filtro).
// Um módulo passa no filtro se a faixa ESCOLHIDA se sobrepõe à faixa
// min/max que ele pode assumir (não exige que o padrão dele caia exatamente
// dentro — um módulo que ESTICA até a faixa pedida também é relevante pro
// contratante, que pode reconfigurar a medida depois).
function rangeOverlapsModule(filterValue, minMm, maxMm) {
  if (!filterValue) return true;
  const [lo, hi] = filterValue.split('-').map(Number);
  return maxMm >= lo && minMm <= hi;
}

// Constrói uma barra de pills (tipo abas) num container — substitui o
// antigo <select> por algo mais visual, "biblioteca" (família/categoria/
// subcategoria), como pedido. selectedId/onSelect controlam qual pill fica
// ativa e o que roda ao trocar. Sempre inclui uma pill "Todas" — no FIM da
// lista (pedido do usuário, 2026-07-23: "deixa aba todas por ultimo"), não
// mais na frente.
function renderTabBar(containerId, items, selectedId, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  function makePill(id, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'po-tab-pill' + (id === selectedId ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => onSelect(id));
    return btn;
  }

  items.forEach((item) => container.appendChild(makePill(item.id, item.name)));
  container.appendChild(makePill('', 'Todas'));
}

async function loadTaxonomyFilters() {
  let [families, categories, subcategories] = await Promise.all([
    supabaseClient.from('families').select('*').eq('active', true).order('sort_order').order('name'),
    supabaseClient.from('categories').select('*').eq('active', true).order('sort_order').order('name'),
    supabaseClient.from('subcategories').select('*').eq('active', true).order('sort_order').order('name')
  ]);
  // Fallback pra quem ainda não rodou migration_057 (coluna sort_order ainda
  // não existe no banco): order('sort_order') numa coluna inexistente faz a
  // query INTEIRA falhar (não só a ordenação) — sem isso, families/categories/
  // subcategories vinham vazios e todas as abas/dropdowns da taxonomia
  // sumiam. Recai pra ordem por nome (comportamento de antes) até a
  // migration ser aplicada.
  if (families.error || categories.error || subcategories.error) {
    [families, categories, subcategories] = await Promise.all([
      supabaseClient.from('families').select('*').eq('active', true).order('name'),
      supabaseClient.from('categories').select('*').eq('active', true).order('name'),
      supabaseClient.from('subcategories').select('*').eq('active', true).order('name')
    ]);
  }
  familiesCacheList = families.data || [];
  categoriesCacheList = categories.data || [];
  subcategoriesCacheList = subcategories.data || [];
  renderTaxonomyTabBars();
}

// Categoria só mostra pills que têm pelo menos 1 módulo na família
// selecionada (ou em qualquer família, se "Todas" estiver selecionada) —
// evita pills vazias/irrelevantes (pedido do usuário: só abrir as categorias
// que existem em cada aba de família). Subcategoria segue a mesma ideia em
// cascata, escopada TAMBÉM pela categoria selecionada — só mostra o que
// existe dentro do recorte família+categoria atual. Depende de allModules já
// carregado (loadModules) — antes disso (primeiro render, ver showLoggedIn)
// as duas listas ficam vazias por um instante e são recalculadas assim que
// loadModules chama renderTaxonomyTabBars() de novo.
function renderTaxonomyTabBars() {
  // Família: enquanto o usuário não tocar nessa pill e a lista já tiver
  // carregado, assume a primeira aba (ordem = sort_order do admin, ver
  // migration_057) em vez de ficar parado em "Todas".
  if (!familyTouchedByUser && !selectedFamilyId && familiesCacheList.length) {
    selectedFamilyId = familiesCacheList[0].id;
  }

  const categoriesInScope = categoriesCacheList.filter((c) => allModules.some((m) =>
    m.category_id === c.id && (!selectedFamilyId || m.family_id === selectedFamilyId)
  ));
  // Se a categoria/subcategoria escolhida não existe mais nesse recorte
  // (ex: trocou de família), reseta — senão a grade continuaria filtrando
  // por um id que nem aparece mais nos pills, parecendo travada. O reset
  // também limpa o "touched" do nível: no novo recorte isso conta como
  // estado inicial de novo, então o default de "primeira aba" pode entrar.
  if (selectedCategoryId && !categoriesInScope.some((c) => c.id === selectedCategoryId)) {
    selectedCategoryId = '';
    selectedSubcategoryId = '';
    categoryTouchedByUser = false;
    subcategoryTouchedByUser = false;
  }
  if (!categoryTouchedByUser && !selectedCategoryId && categoriesInScope.length) {
    selectedCategoryId = categoriesInScope[0].id;
  }

  const subcategoriesInScope = subcategoriesCacheList.filter((s) => allModules.some((m) =>
    m.subcategory_id === s.id
    && (!selectedFamilyId || m.family_id === selectedFamilyId)
    && (!selectedCategoryId || m.category_id === selectedCategoryId)
  ));
  if (selectedSubcategoryId && !subcategoriesInScope.some((s) => s.id === selectedSubcategoryId)) {
    selectedSubcategoryId = '';
    subcategoryTouchedByUser = false;
  }
  if (!subcategoryTouchedByUser && !selectedSubcategoryId && subcategoriesInScope.length) {
    selectedSubcategoryId = subcategoriesInScope[0].id;
  }

  renderTabBar('po-filter-family', familiesCacheList, selectedFamilyId, (id) => {
    familyTouchedByUser = true;
    selectedFamilyId = id;
    renderTaxonomyTabBars();
    renderModuleGallery();
  });
  renderTabBar('po-filter-category', categoriesInScope, selectedCategoryId, (id) => {
    categoryTouchedByUser = true;
    selectedCategoryId = id;
    renderTaxonomyTabBars();
    renderModuleGallery();
  });
  renderTabBar('po-filter-subcategory', subcategoriesInScope, selectedSubcategoryId, (id) => {
    subcategoryTouchedByUser = true;
    selectedSubcategoryId = id;
    renderTaxonomyTabBars();
    renderModuleGallery();
  });
}

// Desenho ilustrativo simples (projeção tipo "cavalier") de uma caixa
// proporcional à largura/altura/profundidade PADRÃO do módulo — não é o
// móvel de verdade (isso só o visualizador 3D em "2. Configure" mostra),
// é só um ícone pra ajudar a reconhecer o módulo na biblioteca visual, tipo
// os catálogos de programas como o Promob. Gerado automaticamente a partir
// dos dados que já existem — não depende de nenhuma imagem cadastrada.
function drawModuleSvg(m) {
  const w = Math.max(m.width_default_mm || 1, 1);
  const h = Math.max(m.height_default_mm || 1, 1);
  const d = Math.max(m.depth_default_mm || 1, 1);
  // Limita as proporções pra módulos com dimensões muito extremas (ex: um
  // filete bem fino ou uma coluna bem alta) ainda renderem uma caixa
  // reconhecível, em vez de uma lasca quase invisível.
  const whRatio = Math.min(Math.max(w / h, 0.3), 3);
  const dhRatio = Math.min(Math.max(d / h, 0.15), 0.9);

  const boxH = 46;
  const boxW = boxH * whRatio;
  const depth = boxH * dhRatio;
  const angle = Math.PI / 6; // 30° — projeção simples, mesmo ângulo pra todos os cartões
  const dx = depth * Math.cos(angle);
  const dy = depth * Math.sin(angle);

  const viewW = boxW + dx + 16;
  const viewH = boxH + dy + 16;
  const frontX0 = 8;
  const frontY0 = dy + 8;
  const frontX1 = frontX0 + boxW;
  const frontY1 = frontY0 + boxH;

  const pts = (arr) => arr.map((p) => p.join(',')).join(' ');
  const topPoints = pts([
    [frontX0, frontY0], [frontX1, frontY0],
    [frontX1 + dx, frontY0 - dy], [frontX0 + dx, frontY0 - dy]
  ]);
  const sidePoints = pts([
    [frontX1, frontY0], [frontX1 + dx, frontY0 - dy],
    [frontX1 + dx, frontY1 - dy], [frontX1, frontY1]
  ]);

  return `<svg viewBox="0 0 ${viewW} ${viewH}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${topPoints}" fill="#e7d9c4" stroke="#8a5a34" stroke-width="1"/>
    <polygon points="${sidePoints}" fill="#d8c3a3" stroke="#8a5a34" stroke-width="1"/>
    <rect x="${frontX0}" y="${frontY0}" width="${boxW}" height="${boxH}" fill="#f0e5d3" stroke="#8a5a34" stroke-width="1"/>
  </svg>`;
}

// Imagem do card: usa a imagem 3D de VERDADE gerada no admin
// (modules.thumbnail_data_url, ver "Imagem 3D do módulo" na aba "Configurar
// módulo") quando existir; sem isso, cai pro ícone SVG genérico de sempre
// (drawModuleSvg) — nenhuma regressão pros módulos que ainda não têm imagem.
function moduleCardImage(m) {
  if (m.thumbnail_data_url) {
    return `<img src="${m.thumbnail_data_url}" alt="${m.name}" class="po-module-card-image" />`;
  }
  return drawModuleSvg(m);
}

function renderModuleGallery() {
  const search = moduleSearchText.trim().toLowerCase();
  modules = allModules.filter((m) =>
    (!selectedFamilyId || m.family_id === selectedFamilyId) &&
    (!selectedCategoryId || m.category_id === selectedCategoryId) &&
    (!selectedSubcategoryId || m.subcategory_id === selectedSubcategoryId) &&
    (!search || m.name.toLowerCase().includes(search)) &&
    rangeOverlapsModule(widthRangeFilter, m.width_min_mm, m.width_max_mm) &&
    rangeOverlapsModule(heightRangeFilter, m.height_min_mm, m.height_max_mm) &&
    rangeOverlapsModule(depthRangeFilter, m.depth_min_mm, m.depth_max_mm)
  );

  const gallery = document.getElementById('po-module-gallery');
  gallery.innerHTML = '';

  if (modules.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'po-module-gallery-empty';
    empty.textContent = I18n.t('step1.no_modules_found');
    gallery.appendChild(empty);
  }

  modules.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'po-module-card' + (currentModule && currentModule.id === m.id ? ' selected' : '');
    card.dataset.moduleId = m.id;

    // Corpo do card (imagem/ícone + nome + medidas padrão) abre a
    // configuração COMPLETA de sempre (cor, medida exata, opcionais) — pra
    // isso, clique aqui continua chamando selectModule. REMOVIDO 2026-07-19
    // (pedido do usuário: "tirar esse botao add, por que precisa sempre
    // customizar antes de inserir no carrinho de compras") o atalho
    // "Adicionar módulo" que existia aqui — adicionava a configuração
    // PADRÃO direto no carrinho sem passar pela tela de configuração; todo
    // módulo agora só entra no pedido depois de configurado (ver
    // quickAddModule/fetchModuleDefaultsForQuickAdd, removidas junto por
    // ficarem sem nenhum chamador).
    // Unidade GLOBAL (po-unit-select, topo do portal) — antes ficava sempre
    // em mm aqui mesmo com o cliente já tendo trocado pra polegada/cm/etc,
    // o que confundia (unidade lá em cima dizia uma coisa, o card mostrava
    // outra). formatDimension já cuida de mm/cm/m/ft/pol fracionada.
    const galleryUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
    const dimsLine = `${formatDimension(m.width_default_mm, galleryUnit)} x ${formatDimension(m.height_default_mm, galleryUnit)} x ${formatDimension(m.depth_default_mm, galleryUnit)}`;
    // Reskin (2026-07-09): imagem/nome/medidas agrupados em wrappers
    // (.po-module-card-image-wrap / .po-module-card-body) só pra CSS conseguir
    // trocar o layout entre grade e lista (ver .po-view-list em style.css) —
    // os seletores usados abaixo (.po-module-card-name/.po-module-card-dims/
    // svg,.po-module-card-image) continuam funcionando iguais, só que agora
    // um nível mais fundo no HTML.
    // Selo de decorativo (migration 039) — avisa já na vitrine que o item
    // não gera preço nem entra no orçamento.
    const decorBadge = m.is_decoration
      ? `<div class="po-module-card-decor hint" style="font-size:11px;">🛋️ ${I18n.t('decor.cart_note')}</div>`
      : '';
    // Dropdown de referência (SKU) — aparece sempre que o módulo tem pelo
    // menos 1 referência cadastrada (largura e/ou altura, ver
    // loadModuleSkuPresets/addModuleToCartWithSku). Cada código vira uma
    // opção mostrando as dimensões que ele cobre; código com largura E
    // altura mostra os dois juntos, código de só uma dimensão mostra só ela
    // (a outra usa o padrão do módulo ao adicionar). Selecionar uma opção já
    // insere direto no carrinho, sem passar pela tela de configuração — a
    // ÚNICA exceção ao "sem atalho de adicionar rápido" (2026-07-19), pedida
    // explicitamente pelo usuário em 2026-07-29.
    const skuOptions = moduleSkuPresetsByModuleId[m.id] || [];
    const skuOptionLabel = (s) => {
      if (s.width_mm != null && s.height_mm != null) {
        return `${s.reference} — ${formatDimension(s.width_mm, galleryUnit)} x ${formatDimension(s.height_mm, galleryUnit)}`;
      }
      if (s.width_mm != null) {
        return `${s.reference} — ${I18n.t('step1.filter_width')} ${formatDimension(s.width_mm, galleryUnit)}`;
      }
      return `${s.reference} — ${I18n.t('step1.filter_height')} ${formatDimension(s.height_mm, galleryUnit)}`;
    };
    const skuBlock = skuOptions.length ? `
      <div class="po-module-card-sku">
        <select class="po-module-card-sku-select">
          <option value="">${I18n.t('step1.sku_placeholder')}</option>
          ${skuOptions.map((s) => `<option value="${s.reference}">${skuOptionLabel(s)}</option>`).join('')}
        </select>
      </div>
    ` : '';
    card.innerHTML = `
      <div class="po-module-card-image-wrap">${moduleCardImage(m)}</div>
      <div class="po-module-card-body">
        <div class="po-module-card-name">${m.name}</div>
        <div class="po-module-card-dims">${dimsLine}</div>
        ${decorBadge}
      </div>
      ${skuBlock}
    `;

    card.querySelector('.po-module-card-name').addEventListener('click', () => selectModule(m.id));
    card.querySelector('.po-module-card-dims').addEventListener('click', () => selectModule(m.id));
    // Clique na imagem (SVG genérico OU foto 3D real, ver moduleCardImage)
    // também abre a configuração completa, igual nome/medidas. Clicar em
    // qualquer lugar do card fora desses três alvos não faz nada — pedido do
    // usuário 2026-07-19 foi só tirar o atalho de adicionar SEM configurar,
    // não adicionar um clique-em-qualquer-lugar novo.
    const imageEl = card.querySelector('svg, .po-module-card-image');
    if (imageEl) imageEl.addEventListener('click', () => selectModule(m.id));

    const skuSelect = card.querySelector('.po-module-card-sku-select');
    if (skuSelect) {
      skuSelect.addEventListener('click', (e) => e.stopPropagation());
      skuSelect.addEventListener('change', (e) => {
        const reference = e.target.value;
        if (!reference) return;
        addModuleToCartWithSku(m.id, reference, skuSelect);
      });
    }

    gallery.appendChild(card);
  });

  document.getElementById('po-config-section').style.display = 'none';
}

document.getElementById('po-module-search').addEventListener('input', (e) => {
  moduleSearchText = e.target.value;
  renderModuleGallery();
});
['po-filter-width-range', 'po-filter-height-range', 'po-filter-depth-range'].forEach((id) => {
  document.getElementById(id).addEventListener('change', (e) => {
    if (id === 'po-filter-width-range') widthRangeFilter = e.target.value;
    else if (id === 'po-filter-height-range') heightRangeFilter = e.target.value;
    else depthRangeFilter = e.target.value;
    renderModuleGallery();
  });
});

// Alterna grade/lista (reskin 2026-07-09) — puramente visual, só troca a
// classe .po-view-list na galeria (ver style.css); não muda nenhum dado.
const poViewGridBtn = document.getElementById('po-view-grid-btn');
const poViewListBtn = document.getElementById('po-view-list-btn');
if (poViewGridBtn && poViewListBtn) {
  poViewGridBtn.addEventListener('click', () => {
    document.getElementById('po-module-gallery').classList.remove('po-view-list');
    poViewGridBtn.classList.add('active');
    poViewListBtn.classList.remove('active');
  });
  poViewListBtn.addEventListener('click', () => {
    document.getElementById('po-module-gallery').classList.add('po-view-list');
    poViewListBtn.classList.add('active');
    poViewGridBtn.classList.remove('active');
  });
}

// REMOVIDO 2026-07-19 (pedido do usuário: "tirar esse botao add, por que
// precisa sempre customizar antes de inserir no carrinho de compras"):
// fetchModuleDefaultsForQuickAdd + quickAddModule, que adicionavam um módulo
// direto no carrinho com a configuração PADRÃO (1ª cor cadastrada, medida
// padrão, sem opcionais), sem passar pela tela de configuração completa. Sem
// chamador nenhum depois que o botão "Adicionar módulo" saiu do card da
// vitrine (ver renderModuleGallery) — removidas junto em vez de ficarem
// mortas no arquivo.

// Só troca a marcação visual de qual cartão está selecionado — usado ao
// escolher um módulo (ver selectModule), pra não precisar reconstruir a
// galeria inteira (o que esconderia a seção "2. Configure" por um instante
// enquanto o módulo novo ainda está carregando).
function highlightSelectedModuleCard(id) {
  document.querySelectorAll('#po-module-gallery .po-module-card').forEach((card) => {
    card.classList.toggle('selected', card.dataset.moduleId === id);
  });
}

// ---------- Módulos ----------

// Dropdown de referência (SKU) no card do catálogo (pedido do usuário,
// 2026-07-29) — usa module_dimension_presets (admin, seções Largura/Altura,
// campo "Referência (interna)", migration_028). Pedido explícito do usuário:
// "quero que mostre todas referencias cadastradas na largura e todas (se
// tiver) na altura. tudo que tenha referencia deve aparecer" — cada código de
// referência vira UMA opção, seja ele só de largura, só de altura, ou (se o
// MESMO código existir nos dois) largura+altura juntos. Dimensão sem
// referência pra aquele código usa o padrão do módulo (ver
// addModuleToCartWithSku). Diferente do comentário original da migration_028
// ("referência... nunca aparece pro cliente") — decisão explícita do usuário
// aqui é mostrar o código de verdade no dropdown do cliente.
// moduleSkuPresetsByModuleId: { [module_id]: [{ reference, width_mm|null,
// height_mm|null }, ...] }.
let moduleSkuPresetsByModuleId = {};

async function loadModuleSkuPresets() {
  const { data, error } = await supabaseClient
    .from('module_dimension_presets')
    .select('module_id, dimension, value_mm, reference')
    .in('dimension', ['width', 'height'])
    .not('reference', 'is', null);
  if (error) { moduleSkuPresetsByModuleId = {}; return; }
  const byModule = {};
  (data || []).forEach((row) => {
    const ref = (row.reference || '').trim();
    if (!ref) return;
    if (!byModule[row.module_id]) byModule[row.module_id] = { width: {}, height: {} };
    byModule[row.module_id][row.dimension][ref] = Number(row.value_mm);
  });
  const result = {};
  Object.keys(byModule).forEach((moduleId) => {
    const { width, height } = byModule[moduleId];
    const refs = Array.from(new Set([...Object.keys(width), ...Object.keys(height)]));
    if (refs.length) {
      result[moduleId] = refs
        .map((ref) => ({
          reference: ref,
          width_mm: Object.prototype.hasOwnProperty.call(width, ref) ? width[ref] : null,
          height_mm: Object.prototype.hasOwnProperty.call(height, ref) ? height[ref] : null
        }))
        .sort((a, b) => a.reference.localeCompare(b.reference));
    }
  });
  moduleSkuPresetsByModuleId = result;
}

// Acha qual referência cadastrada (se alguma) bate com a largura/altura de UM
// item já no pedido — pedido do usuário (2026-07-29): "quando tiver
// referencia cadastrada quero ela bem grande no lado do icone do modulo" na
// tela do pedido. Não grava a referência no order_item (evita mais uma
// migration): calcula na hora da exibição, reaproveitando
// moduleSkuPresetsByModuleId (mesma lista usada no dropdown da vitrine).
// Cada candidato só bate se TODA dimensão que ele define (width_mm/
// height_mm, quando não-nula) for igual à do item — dimensão que o código
// não define (null) não entra na comparação, deixando passar (mesma regra de
// addModuleToCartWithSku, que usa o padrão do módulo pra dimensão sem
// referência). Quando mais de um código bate, prioriza o mais específico
// (o que define as duas dimensões, depois o de 1 dimensão só).
function findMatchingSkuReference(moduleId, widthMm, heightMm) {
  const list = moduleSkuPresetsByModuleId[moduleId] || [];
  const eq = (a, b) => Math.round(Number(a)) === Math.round(Number(b));
  let best = null;
  let bestScore = -1;
  list.forEach((s) => {
    const widthOk = s.width_mm == null || eq(s.width_mm, widthMm);
    const heightOk = s.height_mm == null || eq(s.height_mm, heightMm);
    if (!widthOk || !heightOk) return;
    const score = (s.width_mm != null ? 1 : 0) + (s.height_mm != null ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = s; }
  });
  return best ? best.reference : null;
}

// Adiciona o módulo direto no carrinho com a largura/altura do SKU escolhido
// (o resto — cor, dobradiça/corrediça, opcionais — usa o mesmo padrão de
// "1ª opção cadastrada" do insertProjectModuleDefault, mas gravando em
// order_items/cartItems, não em projectSlots). Único ponto do catálogo que
// pula a tela de configuração (Passo 2) — só existe quando o módulo tem pelo
// menos 1 SKU (ver loadModuleSkuPresets); decisão explícita do usuário
// 2026-07-29, diferente do atalho "Adicionar módulo" removido em
// 2026-07-19 (esse não tinha referência nenhuma, era só o padrão de
// catálogo) — ver memória feedback_no_quick_add_shortcut.
// Viewer 3D escondido só pra gerar a miniatura do item adicionado direto
// pelo dropdown de SKU (ver #po-sku-add-hidden-viewer no HTML pro raciocínio
// completo de por que este viewer precisa ficar DENTRO de po-tab-new-order,
// diferente do getOrderDetailHiddenViewer que fica em Meus Pedidos) — mesma
// instância reaproveitada em toda troca (ViewerComposition.createInstance),
// nunca recriada.
let skuAddHiddenViewer = null;
function getSkuAddHiddenViewer() {
  if (!skuAddHiddenViewer) {
    skuAddHiddenViewer = ViewerComposition.createInstance();
    skuAddHiddenViewer.init('po-sku-add-hidden-viewer');
  }
  return skuAddHiddenViewer;
}

async function addModuleToCartWithSku(moduleId, reference, selectEl) {
  const sku = (moduleSkuPresetsByModuleId[moduleId] || []).find((s) => s.reference === reference);
  const m = allModules.find((mm) => mm.id === moduleId);
  const cartError = document.getElementById('po-cart-error');
  if (!sku || !m) return;
  if (cartError) cartError.style.display = 'none';
  if (selectEl) selectEl.disabled = true;
  try {
    const [modulePieces, colorOptionsByRole, hingeModelOptions, slideModelOptions] = await Promise.all([
      loadRecursivePiecesForModule(m.id),
      fetchModuleColorsByRoleRaw(m.id),
      fetchModuleHingeModelsRaw(m.id),
      fetchModuleSlideModelsRaw(m.id)
    ]);
    const usedRoleIds = collectUsedColorRoleIds(modulePieces);
    const colorsByRole = {};
    usedRoleIds.forEach((roleId) => {
      const opts = colorOptionsByRole[roleId];
      if (opts && opts.length) colorsByRole[roleId] = opts[0];
    });
    const selectedOptionalIds = modulePieces.filter((p) => p.client_optional && p.client_optional_default_on).map((p) => p.id);
    const effectivePieces = modulePieces.filter((p) => !p.client_optional || selectedOptionalIds.includes(p.id));
    const shelfQuantities = collectDefaultShelfQuantities(modulePieces);
    const hingeModel = hingeModelOptions[0] || null;
    const slideModel = slideModelOptions[0] || null;

    // Referência pode cobrir só uma das duas dimensões (ex: código só
    // cadastrado na Largura) — a que não tem valor nessa referência usa o
    // padrão do módulo, clampado (mesma conta de insertProjectModuleDefault).
    const width_mm = sku.width_mm != null
      ? sku.width_mm
      : clamp(Number(m.width_default_mm || 0), Number(m.width_min_mm || 0), Number(m.width_max_mm || Infinity));
    const height_mm = sku.height_mm != null
      ? sku.height_mm
      : clamp(Number(m.height_default_mm || 0), Number(m.height_min_mm || 0), Number(m.height_max_mm || Infinity));
    const depth_mm = clamp(Number(m.depth_default_mm || 0), Number(m.depth_min_mm || 0), Number(m.depth_max_mm || Infinity));

    const result = m.is_decoration
      ? { total: 0, breakdown: [] }
      : Pricing.calculateModulePrice({
        module: m, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
        shelfQuantities, dimOverrides: {}, pieceColorOverrides: {},
        width_mm, height_mm, depth_mm, markupMultiplier: pricingMarkupMultiplier
      });

    const selectedColors = Object.keys(colorsByRole).map((roleId) => ({
      role_id: roleId,
      role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null,
      color_id: colorsByRole[roleId] ? colorsByRole[roleId].id : null,
      color_name: colorsByRole[roleId] ? colorsByRole[roleId].name : null
    }));

    // Miniatura (pedido do usuário 2026-07-29: "quando insiro um novo direto
    // do portal ele vem sem imagem") — este fluxo pula o configurador
    // (Passo 2) de propósito (ver comentário logo acima da função), então
    // nunca existia um Viewer3D "de verdade" na tela pra tirar o snapshot
    // como o "Adicionar ao carrinho" normal faz (Viewer3D.snapshot()).
    // Mesma solução da tela do pedido (getOrderDetailHiddenViewer/
    // recolorOrderItem): monta o módulo isolado num canvas escondido
    // (buildCompositionAssemblies, mesma função da Composição), tira o
    // snapshot e recorta a margem. Best-effort — se falhar por qualquer
    // motivo, thumbnail_data_url fica null (comportamento de antes), não
    // trava o item de entrar no carrinho por causa só da imagem.
    let thumbnail_data_url = null;
    try {
      const viewer = getSkuAddHiddenViewer();
      const syntheticSlot = {
        pieces: effectivePieces,
        width_mm, height_mm, depth_mm,
        colorsByRole, pieceColorOverrides: {},
        shelfQuantities, dimOverrides: {}
      };
      viewer.render(buildCompositionAssemblies([syntheticSlot]), null, null);
      if (typeof Viewer3D.waitForPendingTextures === 'function') await Viewer3D.waitForPendingTextures();
      const raw = viewer.snapshot();
      thumbnail_data_url = raw ? await trimTransparentPng(raw) : null;
    } catch (e) { /* miniatura não gerou — item entra sem imagem, igual sempre foi até agora */ }

    const orderId = await ensureDraftOrder();
    const payload = {
      order_id: orderId,
      module_id: m.id,
      module_name: m.name,
      module_description: m.description || null,
      selected_colors: selectedColors,
      hinge_model_id: hingeModel ? hingeModel.id : null,
      slide_model_id: slideModel ? slideModel.id : null,
      width_mm, height_mm, depth_mm,
      shelf_quantities: shelfQuantities,
      dim_overrides: {},
      piece_color_overrides: {},
      selected_optional_component_ids: selectedOptionalIds,
      quantity: 1,
      unit_price: result.total,
      total_price: result.total,
      breakdown: result.breakdown,
      thumbnail_data_url,
      sort_order: cartItems.length
    };
    const { data, error } = await supabaseClient.from('order_items').insert(payload).select().single();
    if (error) throw error;
    cartItems.push(data);
    renderCart();
  } catch (err) {
    if (cartError) { cartError.textContent = I18n.t('cart.add_error', { msg: err.message }); cartError.style.display = 'block'; }
  } finally {
    if (selectEl) { selectEl.disabled = false; selectEl.value = ''; }
  }
}

async function loadModules() {
  // is_invisible (migration 023, "Invisível" no admin) — módulo que só deve
  // existir pra ser usado como peça aninhada DENTRO de outro módulo, nunca
  // como item do próprio cliente. BUG 2026-07-19: essa checagem nunca
  // existia aqui — o admin marcava "Invisível" mas o módulo continuava
  // aparecendo na galeria/composição/etc do portal do cliente igual
  // qualquer outro, porque este SELECT só filtrava por active. allModules
  // alimenta a galeria (renderModuleGallery) E os fallbacks de busca por id
  // em qualquer lugar do portal (editCompositionSlot/restoreFavoriteComposition/
  // decorModule em renderCartItemRow etc.) — filtrando aqui, na fonte, cobre
  // todos esses lugares de uma vez, sem precisar duplicar a checagem em cada
  // um. admin.js NÃO usa esta função (tem sua própria modulesCache, sem
  // filtro, pra continuar deixando escolher um invisível como peça).
  const { data, error } = await supabaseClient.from('modules').select('*').eq('active', true).eq('is_invisible', false).order('name');
  if (error) { showError(I18n.t('loaderr.modules', { msg: error.message })); return; }
  allModules = data;
  // Dropdown de referência (SKU) do card do catálogo — pedido do usuário
  // (2026-07-29): "abaixo do quadro de cada modulo... um dropdown pra
  // seleção do modulo, só quero mostrar quando tiverem referência
  // preenchida... ai pode colocar direto no carrinho". Carrega sem travar a
  // renderização da galeria (best effort — se falhar, nenhum card ganha
  // dropdown, sem quebrar o catálogo).
  loadModuleSkuPresets().then(() => renderModuleGallery()).catch(() => {});
  // Recalcula os pills de Categoria/Subcategoria agora que allModules existe
  // de verdade — loadTaxonomyFilters roda ANTES de loadModules (ver
  // showLoggedIn), então o primeiro renderTaxonomyTabBars ali não tinha
  // módulo nenhum pra escopar as categorias ainda.
  renderTaxonomyTabBars();
  renderModuleGallery();
  // Mesma corrida no login já achada em restoreFavoriteProject (ver
  // comentário lá): se o cliente já estiver na aba Projetos quando
  // loadModules() termina (ex.: entrou direto nela logo depois de logar,
  // antes do catálogo carregar), a biblioteca à esquerda tinha renderizado
  // "Nenhum módulo encontrado" com allModules ainda vazio e nunca mais se
  // atualizava sozinha. Reforça aqui, igual já faz pra renderModuleGallery()
  // acima.
  const projectsTab = document.getElementById('po-tab-projects');
  if (projectsTab && projectsTab.style.display !== 'none') {
    renderProjectLibraryFilterBars();
    renderProjectLibrary();
  }
}

// Chamado ao clicar num cartão da biblioteca de módulos (antes era o
// listener de 'change' de um <select> — a lógica de carregar tudo desse
// módulo continua a mesma, só a forma de escolher é que virou visual).
async function selectModule(id) {
  if (!id) {
    document.getElementById('po-config-section').style.display = 'none';
    return;
  }
  // Fallback pra allModules: `modules` é a lista já FILTRADA pelos pills de
  // família/categoria/subcategoria (ver renderModuleGallery) — editar um slot
  // de composição (editCompositionSlot) pode chamar selectModule pra um
  // módulo que não está no recorte de filtro ativo agora, então busca em
  // allModules também antes de desistir.
  currentModule = modules.find((m) => m.id === id) || allModules.find((m) => m.id === id);
  highlightSelectedModuleCard(id);
  // Linha tracejada de altura máxima do viewer 3D reflete o afastamento do
  // teto DESTE módulo específico agora (migration_060, ver
  // effectiveCeilingClearanceMm/viewerRoomEnvConfig) — precisa reaplicar toda
  // vez que o módulo muda, senão ficaria mostrando a regra do módulo anterior.
  applyViewerRoomEnvironment();
  viewer3dNeedsRefit = true;
  selectedOptionalComponentIds = new Set();
  await Promise.all([
    loadModuleColors(id),
    loadModulePieces(id),
    loadModuleHingeModels(id),
    loadModuleSlideModels(id),
    loadModuleDimensionPresets(id)
  ]);
  // Opcionais marcados pelo admin como "vem marcado por padrão" já entram
  // pré-selecionados (o cliente ainda pode desmarcar); os demais opcionais
  // continuam começando desmarcados, como sempre.
  selectedOptionalComponentIds = new Set(
    pieces.filter((p) => p.client_optional && p.client_optional_default_on).map((p) => p.id)
  );
  // Precisa de loadModuleColors E loadModulePieces já prontos (os dois do
  // Promise.all acima) — por isso só monta os grupos de swatches aqui, não
  // dentro de loadModuleColors.
  renderColorRoleSwatchGroups();
  setupDimensionInputs();
  // Empilhamento (addStackOnId, ver startCompositionSlotConfig/
  // renderCompositionSlots "Colocar em cima"): módulo empilhado herda a
  // LARGURA da base da coluna por padrão (pedido do usuário, 2026-07-16:
  // "quando subir o top modulo, puxar mesma lagura do de baixo") — evita
  // duas colunas com larguras diferentes desalinhadas no 3D. Só a largura
  // (altura/profundidade continuam livres, cada bloco pode ter a sua) —
  // clampada no min/max do módulo NOVO (pode divergir do da base); se o
  // módulo tiver largura travada (width_locked), reaplica
  // setupDimensionPresetsUI() depois pra sincronizar o dropdown com o
  // preset mais próximo do valor herdado, senão ele ficava preso no
  // primeiro preset da lista (setupDimensionInputs já rodou uma vez com o
  // valor PADRÃO do módulo, antes da gente sobrescrever aqui).
  if (addStackOnId) {
    const baseSlot = compositionSlots.find((s) => s.id === addStackOnId);
    const widthInput = document.getElementById('po-width-input');
    if (baseSlot && widthInput) {
      widthInput.value = clamp(baseSlot.width_mm, parseFloat(widthInput.min), parseFloat(widthInput.max));
      setupDimensionPresetsUI();
    }
  }
  setupOptionVisibility();
  renderShelfQuantityInputs();
  renderPieceDimensionSubconfigs();
  renderOptionalComponents();
  document.getElementById('po-module-description').textContent = currentModule.description || '';
  const configSection = document.getElementById('po-config-section');
  configSection.style.display = 'block';
  // Rola até a tela de configuração assim que o módulo é escolhido (pedido
  // do usuário, 2026-07-16: "quando eu clico no modulo escolhido ele ja
  // deve levar ate a tela de configuracao") — sem isso, a grade de módulos
  // (com filtros de categoria/medida) podia ser alta o bastante pra deixar
  // "2. Configure..." fora da tela depois que ela aparece (display:block
  // sozinho não rola a página), parecendo que o clique não fez nada. Vale
  // tanto pro fluxo normal quanto dentro do modal da Composição (mesma
  // função, mesmo comportamento nos dois).
  configSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  recalculatePreview();
}

// Catálogo de papéis de cor (migration 035) — carregado uma vez, igual
// hingeModels/slideModels.
async function loadColorRoles() {
  const { data, error } = await supabaseClient.from('color_roles').select('*').order('sort_order');
  if (error) { showError(I18n.t('loaderr.color_roles', { msg: error.message })); return; }
  colorRolesCache = data || [];
}

// Multiplicador de margem (migration 037) — ver client.js pro mesmo padrão.
// Falha silenciosa (mantém 1 = sem margem) se a leitura der erro.
async function loadPricingMarkup() {
  // select('*') (não a lista específica de colunas) DE PROPÓSITO — se o
  // banco ainda não rodou a migration_061 (weight_density_kg_per_m3 não
  // existe ainda), pedir essa coluna nomeada faria a query INTEIRA falhar
  // (PostgREST rejeita coluna desconhecida), e markup_multiplier também
  // ficaria sem carregar — todo preço do cliente cairia pro custo puro, sem
  // margem nenhuma, silenciosamente. select('*') sempre funciona, com ou sem
  // a coluna nova (data.weight_density_kg_per_m3 vem undefined até a
  // migration rodar, já tratado abaixo pelo isFinite).
  const { data, error } = await supabaseClient.from('pricing_settings').select('*').eq('id', true).single();
  if (error || !data) return;
  const value = Number(data.markup_multiplier);
  if (isFinite(value) && value > 0) pricingMarkupMultiplier = value;
  // migration 061 — densidade pro cálculo de peso exibido ao cliente.
  const density = Number(data.weight_density_kg_per_m3);
  if (isFinite(density) && density > 0) materialDensityKgPerM3 = density;
}

async function loadModuleColors(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_colors')
    .select('color_id, color_role_id, colors(*)')
    .eq('module_id', moduleId);
  if (error) { showError(I18n.t('loaderr.colors', { msg: error.message })); return; }
  // Agrupado por papel (migration 035) — antes era uma lista só, valendo
  // pra caixa E porta ao mesmo tempo. Ordem escolhida pelo admin (setas ▲▼
  // na tela de Cores) — o join não garante essa ordem sozinho.
  moduleColorsByRole = {};
  (data || []).forEach((row) => {
    if (!row.colors || !row.colors.active) return;
    if (!moduleColorsByRole[row.color_role_id]) moduleColorsByRole[row.color_role_id] = [];
    moduleColorsByRole[row.color_role_id].push(row.colors);
  });
  Object.keys(moduleColorsByRole).forEach((roleId) => {
    moduleColorsByRole[roleId].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  });
}

// Papéis de cor que as peças do módulo atual REALMENTE usam (recursivo —
// inclui peças dentro de peças-módulo aninhadas), na ordem do catálogo.
function collectUsedColorRoleIds(piecesList) {
  const ids = new Set();
  (piecesList || []).forEach((p) => {
    if (p.color_role_id) ids.add(p.color_role_id);
    if (p.is_module && p.child_pieces) {
      collectUsedColorRoleIds(p.child_pieces).forEach((id) => ids.add(id));
    }
  });
  return ids;
}

// Monta um grupo de swatches por papel de cor usado neste módulo (migration
// 035) — substitui os 2 blocos fixos "Cor da caixa"/"Cor da porta".
// presetColorsByRole (opcional) — usado ao reabrir um slot de composição já
// configurado pra edição (ver editCompositionSlot/restoreSlotStateIntoConfigurator):
// { [role_id]: colorObj } com a cor que o cliente já tinha escolhido antes,
// pra nascer selecionada em vez de sempre cair na 1ª cor cadastrada.
// presetPieceColorOverrides (opcional, migration 046) — mesma ideia de
// presetColorsByRole, mas pra reabrir um slot já configurado com as cores
// POR PEÇA-MÓDULO já escolhidas antes (ver editCompositionSlot/
// restoreSlotStateIntoConfigurator): { [piece_id]: { [role_id]: colorObj } }.
function renderColorRoleSwatchGroups(presetColorsByRole, presetPieceColorOverrides) {
  const container = document.getElementById('po-color-role-swatch-groups');
  container.innerHTML = '';
  const usedRoleIds = collectUsedColorRoleIds(pieces);
  selectedColorIdByRole = {};
  colorRolesCache
    .filter((role) => usedRoleIds.has(role.id))
    .forEach((role) => {
      const colors = moduleColorsByRole[role.id] || [];
      if (colors.length === 0) return; // sem cor cadastrada pra este papel neste módulo -- nada pra escolher
      const preset = presetColorsByRole && presetColorsByRole[role.id];
      const initialColor = (preset && colors.find((c) => c.id === preset.id)) || colors[0];
      selectedColorIdByRole[role.id] = initialColor.id;
      const group = document.createElement('div');
      group.className = 'color-role-swatch-group';
      const label = document.createElement('label');
      // Nome da cor ESCOLHIDA (só ela, não uma lista com todas — os swatches
      // já têm o nome de cada uma no title/tooltip do hover, ninguém pediu
      // pra mostrar todos os nomes o tempo todo) ao lado do nome do papel de
      // cor, ex: "Cor — Caixa: Preto". Atualizado tanto aqui (seleção
      // inicial, primeira cor da lista ou a preset) quanto no onSelect do
      // clique abaixo.
      const selectedNameSpan = document.createElement('span');
      selectedNameSpan.className = 'color-role-selected-name';
      selectedNameSpan.textContent = initialColor.name;
      label.textContent = `${I18n.t('color.prefix')} — ${role.name}: `;
      label.appendChild(selectedNameSpan);
      const swatchesDiv = document.createElement('div');
      swatchesDiv.className = 'color-role-swatches';
      group.appendChild(label);
      group.appendChild(swatchesDiv);
      container.appendChild(group);
      renderSwatches(swatchesDiv, colors, selectedColorIdByRole[role.id], (id) => {
        selectedColorIdByRole[role.id] = id;
        const chosen = colors.find((c) => c.id === id);
        if (chosen) selectedNameSpan.textContent = chosen.name;
        recalculatePreview();
      });
    });

  // Cor por peça separada, INDIVIDUAL (migration 046, generalizado pra
  // peça-folha 2026-07-19) — só pras peças com client_color_configurable
  // ligado no admin (ver collectColorConfigurablePieces), tanto peça-módulo
  // aninhada quanto peça-folha comum (ex: "só esta prateleira"). Um bloco
  // titulado por peça, com um grupo de swatches por papel de cor que essa
  // peça usa: o PRÓPRIO color_role_id dela (sempre relevante — é o que
  // decide a cor dela mesma) MAIS qualquer papel usado dentro de
  // piece.child_pieces (só existe/importa pra peça-módulo — uma peça-folha
  // não tem filhos, então esse lado do Set fica vazio pra ela). A escolha
  // aqui é independente da(s) acima: começa igual (mesma 1ª cor / preset),
  // mas o cliente pode divergir só pra esta instância sem afetar nenhuma
  // outra peça que use o mesmo papel.
  nestedModuleColorSelections = {};
  collectColorConfigurablePieces(pieces).forEach((piece) => {
    const pieceRoleIds = collectUsedColorRoleIds(piece.child_pieces);
    if (piece.color_role_id) pieceRoleIds.add(piece.color_role_id);
    const rolesWithColors = colorRolesCache.filter((role) => pieceRoleIds.has(role.id) && (moduleColorsByRole[role.id] || []).length > 0);
    if (rolesWithColors.length === 0) return; // nada cadastrado pra nenhum papel usado por esta peça -- sem painel

    const pieceName = piece.reference || piece.module_name || I18n.t('step2.piece_fallback');
    const pieceOverridesPreset = presetPieceColorOverrides && presetPieceColorOverrides[piece.id];

    const block = document.createElement('div');
    block.className = 'color-role-piece-block';
    const title = document.createElement('div');
    title.className = 'color-role-piece-block-title';
    title.textContent = `${I18n.t('color.piece_prefix', { piece: pieceName })}`;
    block.appendChild(title);

    nestedModuleColorSelections[piece.id] = {};
    rolesWithColors.forEach((role) => {
      const colors = moduleColorsByRole[role.id] || [];
      const preset = pieceOverridesPreset && pieceOverridesPreset[role.id];
      const initialColor = (preset && colors.find((c) => c.id === preset.id)) || colors[0];
      nestedModuleColorSelections[piece.id][role.id] = initialColor.id;

      const group = document.createElement('div');
      group.className = 'color-role-swatch-group';
      const label = document.createElement('label');
      const selectedNameSpan = document.createElement('span');
      selectedNameSpan.className = 'color-role-selected-name';
      selectedNameSpan.textContent = initialColor.name;
      label.textContent = `${I18n.t('color.prefix')} — ${role.name}: `;
      label.appendChild(selectedNameSpan);
      const swatchesDiv = document.createElement('div');
      swatchesDiv.className = 'color-role-swatches';
      group.appendChild(label);
      group.appendChild(swatchesDiv);
      block.appendChild(group);
      renderSwatches(swatchesDiv, colors, nestedModuleColorSelections[piece.id][role.id], (id) => {
        nestedModuleColorSelections[piece.id][role.id] = id;
        const chosen = colors.find((c) => c.id === id);
        if (chosen) selectedNameSpan.textContent = chosen.name;
        recalculatePreview();
      });
    });
    container.appendChild(block);
  });
}

// Monta { [piece_id]: { [role_id]: registro de "colors" } } a partir do
// estado atual de nestedModuleColorSelections (ids) — mesma conversão
// id->registro que colorsByRole já faz pros papéis de nível raiz em
// recalculatePreview, só que por peça. Usado tanto pro cálculo de preço
// quanto pro 3D (ver Pricing.calculateModulePrice/resolvePiecesForViewer).
function buildPieceColorOverrides() {
  const pieceColorOverrides = {};
  Object.keys(nestedModuleColorSelections).forEach((pieceId) => {
    const perRole = nestedModuleColorSelections[pieceId];
    const resolved = {};
    Object.keys(perRole).forEach((roleId) => {
      const colors = moduleColorsByRole[roleId] || [];
      const color = colors.find((c) => c.id === perRole[roleId]);
      if (color) resolved[roleId] = color;
    });
    if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
  });
  return pieceColorOverrides;
}

// Snapshot compacto (id/nome, não o registro inteiro) pra gravar em
// order_items.piece_color_overrides (migration 046) — mesmo espírito de
// "selected_colors", só que por peça-módulo. Só por completude/auditoria,
// nada lê isto de volta (preço/3D já ficam corretos via breakdown/thumbnail
// no momento do pedido — mesma nota de dim_overrides).
function buildPieceColorOverridesSnapshot(pieceColorOverrides) {
  const snapshot = {};
  Object.keys(pieceColorOverrides || {}).forEach((pieceId) => {
    const perRole = pieceColorOverrides[pieceId];
    snapshot[pieceId] = {};
    Object.keys(perRole).forEach((roleId) => {
      const color = perRole[roleId];
      snapshot[pieceId][roleId] = {
        role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null,
        color_id: color ? color.id : null,
        color_name: color ? color.name : null
      };
    });
  });
  return snapshot;
}

// Busca os valores sugeridos/travados de medida deste módulo (migration 028)
// e agrupa por dimensão, já na ordem cadastrada pelo admin (sort_order).
async function loadModuleDimensionPresets(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_dimension_presets')
    .select('*')
    .eq('module_id', moduleId)
    .order('sort_order');
  if (error) { showError(I18n.t('loaderr.dimension_presets', { msg: error.message })); return; }
  dimensionPresets = { width: [], height: [], depth: [] };
  (data || []).forEach((row) => { if (dimensionPresets[row.dimension]) dimensionPresets[row.dimension].push(row); });
}

// container: elemento DOM (não mais um id) — migration 035 renderiza um
// número dinâmico de grupos de swatches, um por papel de cor.
function renderSwatches(container, items, selectedId, onSelect) {
  container.innerHTML = '';
  items.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'color-swatch' + (c.id === selectedId ? ' selected' : '');
    div.title = c.name;
    const img = c.texture_url
      ? `<img src="${c.texture_url}" alt="${c.name}" />`
      : `<span class="swatch-fallback" style="background:${c.swatch_hex || '#cccccc'};"></span>`;
    div.innerHTML = `${img}<span>${c.name}</span>`;
    div.addEventListener('click', () => {
      onSelect(c.id);
      Array.from(container.children).forEach((child) => child.classList.remove('selected'));
      div.classList.add('selected');
    });
    container.appendChild(div);
  });
}

// Carrega a composição de um módulo (module_components) RECURSIVAMENTE
// (Fase 2 — migration 023): cada linha é OU uma peça-componente de catálogo
// (component_id) OU outro módulo inteiro usado como peça aninhada
// (child_module_id) — nesse segundo caso, busca as próprias peças/
// profundidades fixas desse módulo filho chamando esta mesma função de novo,
// em profundidade ilimitada. Idêntica à de client.js.
async function loadRecursivePiecesForModule(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('id, component_id, child_module_id, quantity_override, sort_order, width_formula_override, height_formula_override, depth_formula_override, offset_x_mm, offset_y_mm, offset_z_mm, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, client_dimension_configurable, width_min_mm, width_default_mm, width_max_mm, height_min_mm, height_default_mm, height_max_mm, depth_min_mm, depth_default_mm, depth_max_mm, client_color_configurable, tilt_angle_deg, rotation_y_deg, components(*, labor_types(*), component_types(*))')
    .eq('module_id', moduleId)
    .order('sort_order');
  if (error) { showError(I18n.t('loaderr.module_config', { msg: error.message })); return []; }

  const result = [];
  for (const row of (data || [])) {
    if (row.component_id) {
      if (!row.components || !row.components.active) continue;
      const quantity = (row.quantity_override !== null && row.quantity_override !== undefined)
        ? row.quantity_override
        : row.components.quantity;
      const labor_cost_per_unit = row.components.labor_types ? row.components.labor_types.price_per_unit : 0;
      // Papel de cor (migration 035) vem do tipo do componente, não mais de
      // um boolean is_front fixo.
      const color_role_id = row.components.component_types ? row.components.component_types.color_role_id : null;
      // Posicionamento (migration 024) — eixo de espessura explícito no 3D,
      // ver client.js/viewer3d.js. null = automático (comportamento antigo).
      const positioning = row.components.component_types ? row.components.component_types.positioning : null;
      const width_formula = row.width_formula_override || row.components.width_formula;
      const height_formula = row.height_formula_override || row.components.height_formula;
      const depth_formula = row.depth_formula_override || row.components.depth_formula;
      result.push({
        ...row.components,
        // id vira o da LINHA (row.id), não o do catálogo — migration 025
        // permite repetir o mesmo componente em 2+ linhas do mesmo módulo;
        // sem isso, as instâncias colidiriam em selectedOptionalComponentIds/
        // shelfQuantities (keyed por piece.id em client.js/portal.js/pricing.js).
        id: row.id,
        // Nome customizado desta instância (migration 032) — sobrescreve o
        // nome do catálogo só na exibição (balão do 3D). Fica DEPOIS do
        // ...row.components pra não ser apagado pelo spread.
        reference: row.reference_override || row.components.reference,
        quantity, labor_cost_per_unit, color_role_id, positioning,
        width_formula, height_formula, depth_formula,
        offset_x_formula: row.offset_x_mm || '0',
        offset_y_formula: row.offset_y_mm || '0',
        offset_z_formula: row.offset_z_mm || '0',
        quantity_configurable: !!row.quantity_configurable,
        quantity_min: row.quantity_min,
        quantity_max: row.quantity_max,
        quantity_default: row.quantity_default,
        client_optional: !!row.client_optional,
        client_optional_default_on: !!row.client_optional_default_on,
        visibility_dimension: row.visibility_dimension || null,
        visibility_min_mm: row.visibility_min_mm,
        visibility_max_mm: row.visibility_max_mm,
        // Cor configurável separadamente (migration 046, generalizado pra
        // peça-folha 2026-07-19) — "cliente pode escolher a cor desta peça
        // separadamente", ver collectColorConfigurablePieces/
        // renderColorRoleSwatchGroups. Antes só existia em peça-módulo.
        client_color_configurable: !!row.client_color_configurable,
        is_module: false
      });
    } else if (row.child_module_id) {
      const [fixedDepths, childPieces, lockedPresets, ownHingeSlide] = await Promise.all([
        fetchModuleFixedDepths(row.child_module_id),
        loadRecursivePiecesForModule(row.child_module_id),
        fetchModuleLockedDimensionPresets(row.child_module_id),
        fetchModuleOwnHingeAndSlideModels(row.child_module_id)
      ]);
      result.push({
        // id vira o da LINHA (row.id) em vez do child_module_id — mesmo
        // motivo do branch de componente acima (migration 025).
        id: row.id,
        is_module: true,
        // reference_override (migration 032) tem prioridade; sem ele, cai no
        // fallback module_name já existente em resolvePiecesForViewer
        // (piece.reference || piece.module_name).
        reference: row.reference_override || null,
        position_role: row.position_role || 'other',
        color_role_id: row.color_role_id || null,
        opening_type: row.opening_type || 'none',
        slides_per_unit: row.slides_per_unit || 0,
        tilt_angle_deg: row.tilt_angle_deg || 0, // migration 066 — inclinação do conjunto (só 'shelf')
        rotation_y_deg: row.rotation_y_deg || 0, // migration 067 — giro de canto do conjunto (só 'free')
        width_formula: row.width_formula_override,
        height_formula: row.height_formula_override,
        depth_formula: row.depth_formula_override,
        offset_x_formula: row.offset_x_mm || '0',
        offset_y_formula: row.offset_y_mm || '0',
        offset_z_formula: row.offset_z_mm || '0',
        quantity: (row.quantity_override !== null && row.quantity_override !== undefined) ? row.quantity_override : 1,
        quantity_configurable: !!row.quantity_configurable,
        quantity_min: row.quantity_min,
        quantity_max: row.quantity_max,
        quantity_default: row.quantity_default,
        client_optional: !!row.client_optional,
        client_optional_default_on: !!row.client_optional_default_on,
        visibility_dimension: row.visibility_dimension || null,
        visibility_min_mm: row.visibility_min_mm,
        visibility_max_mm: row.visibility_max_mm,
        // Sub-configuração de medidas (migration 036) — "cliente pode
        // configurar as medidas desta peça", ver renderModuleNestedRow no
        // admin. Só existe em peça-módulo (mesmo raciocínio de position_role/
        // cor/abertura acima).
        client_dimension_configurable: !!row.client_dimension_configurable,
        // Cor configurável por instância (migration 046) — "cliente pode
        // escolher a cor desta peça separadamente", ver
        // collectColorConfigurablePieces/renderColorRoleSwatchGroups. Só
        // existe (e só é gravado) numa peça-módulo, mesmo raciocínio de
        // client_dimension_configurable acima.
        client_color_configurable: !!row.client_color_configurable,
        width_min_mm: row.width_min_mm,
        width_default_mm: row.width_default_mm,
        width_max_mm: row.width_max_mm,
        height_min_mm: row.height_min_mm,
        height_default_mm: row.height_default_mm,
        height_max_mm: row.height_max_mm,
        depth_min_mm: row.depth_min_mm,
        depth_default_mm: row.depth_default_mm,
        depth_max_mm: row.depth_max_mm,
        fixed_depths: fixedDepths,
        locked_width_presets: lockedPresets.width,
        locked_height_presets: lockedPresets.height,
        locked_depth_presets: lockedPresets.depth,
        // Presets COM rótulo (ex: '55"') — pros dropdowns de tamanho
        // (renderOptionalComponents e renderPieceDimensionSubconfigs); o
        // cálculo usa os arrays sem rótulo acima.
        locked_width_preset_options: lockedPresets.widthLabeled,
        locked_height_preset_options: lockedPresets.heightLabeled,
        locked_depth_preset_options: lockedPresets.depthLabeled,
        // Módulo filho decorativo (migration 039) — o "Configurar peça" só
        // mostra dropdowns de eixo travado (ex: polegada da TV), nunca
        // sliders livres (ver renderPieceDimensionSubconfigs).
        is_decoration: lockedPresets.is_decoration,
        own_hinge_model: ownHingeSlide.hinge,
        own_slide_model: ownHingeSlide.slide,
        // Limite de tamanho PRÓPRIO do módulo filho (sempre ativo, ver
        // fetchModuleLockedDimensionPresets) — clampado em
        // resolvePiecesForViewer/Pricing.calculateModulePiece.
        own_width_min_mm: lockedPresets.ownWidthMinMm,
        own_width_max_mm: lockedPresets.ownWidthMaxMm,
        own_height_min_mm: lockedPresets.ownHeightMinMm,
        own_height_max_mm: lockedPresets.ownHeightMaxMm,
        own_depth_min_mm: lockedPresets.ownDepthMinMm,
        own_depth_max_mm: lockedPresets.ownDepthMaxMm,
        // Nome do módulo filho — só pra dar nome à peça no painel de
        // duplo-clique do 3D (viewer3d.js); nada de cálculo depende disso.
        module_name: lockedPresets.name,
        child_pieces: childPieces
      });
    }
  }
  return result;
}

// Profundidades fixas cadastradas pra um módulo (module_fixed_depths) —
// generaliza o antigo drawer_type_depths: QUALQUER módulo usado como peça
// aninhada pode ter isso, não só um "modelo de gaveta" especial.
async function fetchModuleFixedDepths(moduleId) {
  const { data, error } = await supabaseClient.from('module_fixed_depths').select('depth_mm').eq('module_id', moduleId);
  if (error) { console.error(error); return []; }
  return (data || []).map((r) => Number(r.depth_mm));
}

// Um módulo pode ter Largura/Altura/Profundidade "travadas" (migration 028 —
// module_dimension_presets + width_locked/height_locked/depth_locked). Isso
// se perdia quando o mesmo módulo era usado como PEÇA dentro de outro
// (child_module_id) — a fórmula (ex: depth_formula_override="D-20") sempre
// dava um valor contínuo. Busca aqui (só as dimensões travadas) pra
// resolvePiecesForViewer/Pricing.calculateAssembly arredondarem pro valor
// permitido mais próximo (Pricing.pickNearestPreset), igual já acontecia só
// com profundidade fixa de gaveta (module_fixed_depths/pickDrawerDepth).
async function fetchModuleLockedDimensionPresets(moduleId) {
  const [moduleRes, presetsRes] = await Promise.all([
    supabaseClient.from('modules').select('name, width_locked, height_locked, depth_locked, is_decoration, width_min_mm, width_max_mm, height_min_mm, height_max_mm, depth_min_mm, depth_max_mm').eq('id', moduleId).single(),
    supabaseClient.from('module_dimension_presets').select('dimension, value_mm, label, sort_order').eq('module_id', moduleId).order('sort_order')
  ]);
  const mod = moduleRes.data || {};
  const byDim = { width: [], height: [], depth: [] };
  // Versão com rótulo (label do admin, ex: '55"', 'Queen') — usada pelo
  // dropdown de tamanho ao lado do opcional (ver renderOptionalComponents).
  const byDimLabeled = { width: [], height: [], depth: [] };
  (presetsRes.data || []).forEach((row) => {
    if (!byDim[row.dimension]) return;
    byDim[row.dimension].push(Number(row.value_mm));
    byDimLabeled[row.dimension].push({ value_mm: Number(row.value_mm), label: row.label || null });
  });
  return {
    // Nome do módulo — reaproveitado aqui (já busca a linha de `modules`)
    // pra dar nome à peça aninhada nos parts do 3D (ver
    // loadRecursivePiecesForModule abaixo e o duplo-clique em viewer3d.js).
    name: mod.name || null,
    is_decoration: !!mod.is_decoration,
    width: mod.width_locked ? byDim.width : [],
    height: mod.height_locked ? byDim.height : [],
    depth: mod.depth_locked ? byDim.depth : [],
    widthLabeled: mod.width_locked ? byDimLabeled.width : [],
    heightLabeled: mod.height_locked ? byDimLabeled.height : [],
    depthLabeled: mod.depth_locked ? byDimLabeled.depth : [],
    // Limite PRÓPRIO do módulo (sempre existe, migration original de
    // modules.width_min_mm/max_mm etc) — até agora só era buscado/respeitado
    // quando o admin ligava "cliente pode configurar as medidas desta peça"
    // (client_dimension_configurable, migration 036). Pedido do usuário:
    // "quando um modulo e inserido em outro, ele respeite os limites de
    // tamanho do modulo filho" — regra fundamental, sempre ativa, não
    // opt-in. Ver clamp em resolvePiecesForViewer/pricing.js.
    ownWidthMinMm: mod.width_min_mm,
    ownWidthMaxMm: mod.width_max_mm,
    ownHeightMinMm: mod.height_min_mm,
    ownHeightMaxMm: mod.height_max_mm,
    ownDepthMinMm: mod.depth_min_mm,
    ownDepthMaxMm: mod.depth_max_mm
  };
}

// Um módulo aninhado pode já ter seu PRÓPRIO modelo de dobradiça/corrediça
// vinculado (module_hinge_models/module_slide_models DESSE módulo) — hardware
// FIXO da peça (ex: "Drawer Soft Closet" só existe com corrediça HAFELE
// undermount SOFT CLOSET). Pricing.calculateModulePiece usa isto como
// override do modelo escolhido pelo cliente no módulo raiz — evita exigir
// que o módulo pai também tenha um modelo vinculado só pra essa peça
// aninhada funcionar (ver client.js pro comentário completo). Se houver mais
// de um modelo ativo vinculado no filho, usa o primeiro (pensado pra
// hardware fixo, não pra escolha do cliente).
async function fetchModuleOwnHingeAndSlideModels(moduleId) {
  const [hingeRes, slideRes] = await Promise.all([
    supabaseClient.from('module_hinge_models').select('hinge_model_id, hinge_models(*)').eq('module_id', moduleId),
    supabaseClient.from('module_slide_models').select('slide_model_id, slide_models(*)').eq('module_id', moduleId)
  ]);
  const hinge = (hingeRes.data || []).map((r) => r.hinge_models).find((h) => h && h.active) || null;
  const slide = (slideRes.data || []).map((r) => r.slide_models).find((s) => s && s.active) || null;
  return { hinge, slide };
}

async function loadModulePieces(moduleId) {
  pieces = await loadRecursivePiecesForModule(moduleId);
}

async function loadModuleHingeModels(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_hinge_models')
    .select('hinge_model_id, hinge_models(*)')
    .eq('module_id', moduleId);
  if (error) { showError(I18n.t('loaderr.hinge_models', { msg: error.message })); return; }
  hingeModels = (data || []).map((row) => row.hinge_models).filter((h) => h && h.active);
  fillSelect('po-hinge-model-select', hingeModels);
}

async function loadModuleSlideModels(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_slide_models')
    .select('slide_model_id, slide_models(*)')
    .eq('module_id', moduleId);
  if (error) { showError(I18n.t('loaderr.slide_models', { msg: error.message })); return; }
  slideModels = (data || []).map((row) => row.slide_models).filter((s) => s && s.active);
  fillSelect('po-slide-model-select', slideModels);
}

// Mostra/esconde seletores de opcionais conforme as peças do módulo
// realmente precisarem deles. "Modelo de porta"/"Modelo de gaveta" (Fase 1)
// não existem mais — um modelo de porta/gaveta agora é só um módulo comum
// usado como peça aninhada (is_module), sem seletor próprio nenhum.
// Percorre RECURSIVAMENTE a árvore de peças (piece.child_pieces — mesma
// forma recursiva de pricing.js/resolvePiecesForViewer), checando se existe
// alguma peça com dobradiça em qualquer profundidade. BUG CORRIGIDO
// (2026-07-10): antes, setupOptionVisibility só olhava o 1º nível de
// `pieces` — uma peça-módulo aninhada com opening_type='none' (que não abre
// ELA MESMA, mas tem portas DE VERDADE dentro do child_pieces dela, ex: um
// módulo "Bench With Doors" usado como peça aninhada) escondia o botão
// "Abrir portas" e o seletor de modelo de dobradiça, mesmo com as portas
// internas funcionando certinho no 3D (viewer3d.js já constrói/abre essas
// portas recursivamente — só esta checagem de visibilidade não acompanhava).
// respectOwnModel=true (usesHinges, decide se mostra o <select> de modelo)
// respeita own_hinge_model herdado de um ancestral, mesma precedência de
// pricing.js calculateModulePiece ("effectiveHingeModel = piece.own_hinge_model
// || hingeModel", propagada pra baixo) — uma peça com hardware PRÓPRIO (ou
// dentro de uma que tem) não deve forçar o cliente a escolher um modelo
// global. respectOwnModel=false (hasOpenableHinge, decide o botão) ignora
// isso de propósito — o botão deve aparecer sempre que existir qualquer
// porta, mesmo com hardware fixo/próprio, pra o cliente conseguir abrir/ver.
function treeHasHinge(pieces, respectOwnModel, inheritedCovered) {
  return (pieces || []).some((p) => {
    if (p.is_module) {
      const coveredHere = respectOwnModel && (inheritedCovered || !!p.own_hinge_model);
      const selfOpens = p.opening_type === 'hinge_left' || p.opening_type === 'hinge_right';
      const selfCounts = selfOpens && !coveredHere;
      return selfCounts || treeHasHinge(p.child_pieces, respectOwnModel, coveredHere);
    }
    return !!(p.hinge_side && p.hinge_side !== 'none') && !(respectOwnModel && inheritedCovered);
  });
}

// Mesma ideia de treeHasHinge, pra corrediça (opening_type==='slide_out',
// só existe em peça-módulo aninhada — não há equivalente "leaf" pra
// corrediça hoje, ao contrário de hinge_side numa peça-componente comum).
function treeHasSlide(pieces, respectOwnModel, inheritedCovered) {
  return (pieces || []).some((p) => {
    if (!p.is_module) return false;
    const coveredHere = respectOwnModel && (inheritedCovered || !!p.own_slide_model);
    const selfCounts = p.opening_type === 'slide_out' && !coveredHere;
    return selfCounts || treeHasSlide(p.child_pieces, respectOwnModel, coveredHere);
  });
}

function setupOptionVisibility() {
  // Dobradiça: peça-componente comum com hinge_side setado (qualquer
  // Posição no módulo, não só "Frente/porta" — pedido do usuário: a
  // posição "Frente/porta" tem bugs de posicionamento no 3D, então ele usa
  // "Peça livre" pras portas e só confia no campo hinge_side pra marcar que
  // abre), OU peça-módulo aninhada (ex: um "modelo de porta") com
  // opening_type hinge_left/hinge_right — MAS só se essa peça-módulo não já
  // tiver seu PRÓPRIO modelo de dobradiça vinculado (own_hinge_model):
  // nesse caso o hardware é fixo da peça, não precisa pedir pro cliente
  // escolher aqui. Agora verifica em QUALQUER profundidade (ver treeHasHinge).
  const usesHinges = treeHasHinge(pieces, true, false);
  // Corrediça: só existe hoje numa peça-módulo aninhada com opening_type
  // slide_out (ex: um "modelo de gaveta" usado como sub-montagem) — mesma
  // exceção acima quando a peça já tem own_slide_model próprio.
  const usesSlides = treeHasSlide(pieces, true, false);

  document.getElementById('po-hinge-model-wrap').style.display = usesHinges ? 'block' : 'none';
  document.getElementById('po-slide-model-wrap').style.display = usesSlides ? 'block' : 'none';

  // Botões "Abrir portas" e "Abrir gavetas" — SEPARADOS (pedido do usuário):
  // cada um só aparece se existir peça do seu próprio tipo neste módulo, em
  // QUALQUER profundidade de aninhamento (ver treeHasHinge/treeHasSlide), e
  // cada um controla só o seu grupo (ver Viewer3D.toggleDoorsOnly/
  // toggleDrawersOnly) — abrir as portas não abre as gavetas, e vice-versa.
  const hasOpenableHinge = treeHasHinge(pieces, false, false);
  const hasOpenableSlide = treeHasSlide(pieces, false, false);
  const toggleDoorsBtnEl = document.getElementById('po-toggle-doors-btn');
  if (toggleDoorsBtnEl) {
    toggleDoorsBtnEl.style.display = hasOpenableHinge ? 'inline-block' : 'none';
    toggleDoorsBtnEl.dataset.openLabel = I18n.t('step2.open_doors');
    toggleDoorsBtnEl.dataset.closeLabel = I18n.t('step2.close_doors');
    if (!Viewer3D.areDoorsOnlyOpen || !Viewer3D.areDoorsOnlyOpen()) {
      toggleDoorsBtnEl.textContent = toggleDoorsBtnEl.dataset.openLabel;
    }
  }
  const toggleDrawersBtnEl = document.getElementById('po-toggle-drawers-btn');
  if (toggleDrawersBtnEl) {
    toggleDrawersBtnEl.style.display = hasOpenableSlide ? 'inline-block' : 'none';
    toggleDrawersBtnEl.dataset.openLabel = I18n.t('step2.open_drawers');
    toggleDrawersBtnEl.dataset.closeLabel = I18n.t('step2.close_drawers');
    if (!Viewer3D.areDrawersOnlyOpen || !Viewer3D.areDrawersOnlyOpen()) {
      toggleDrawersBtnEl.textContent = toggleDrawersBtnEl.dataset.openLabel;
    }
  }
}

function renderShelfQuantityInputs() {
  const container = document.getElementById('po-shelf-quantities-wrap');
  container.innerHTML = '';
  pieces.filter((p) => p.quantity_configurable).forEach((p) => {
    const div = document.createElement('div');
    div.innerHTML = `
      <label>${I18n.t('step2.shelf_qty_label', { ref: p.reference, min: p.quantity_min, max: p.quantity_max })}</label>
      <input type="number" class="po-shelf-qty-input" data-piece-id="${p.id}"
        min="${p.quantity_min}" max="${p.quantity_max}" value="${p.quantity_default}" />
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.po-shelf-qty-input').forEach((input) => {
    input.addEventListener('input', recalculatePreview);
  });
}

// Percorre a árvore recursiva de `pieces` (qualquer profundidade — uma peça-
// módulo configurável pode estar aninhada dentro de outra) coletando toda
// peça-módulo com client_dimension_configurable=true (migration 036).
function collectDimConfigurablePieces(piecesList, results) {
  results = results || [];
  (piecesList || []).forEach((p) => {
    if (p.is_module && p.client_dimension_configurable) results.push(p);
    if (p.is_module && p.child_pieces && p.child_pieces.length) {
      collectDimConfigurablePieces(p.child_pieces, results);
    }
  });
  return results;
}

// Mesmo padrão de collectDimConfigurablePieces (migration 036), pra cor
// (migration 046) — acha toda peça-módulo aninhada, em qualquer
// profundidade, com "cliente pode escolher a cor desta peça separadamente"
// ligado no admin (client_color_configurable). Sempre desce em QUALQUER
// peça-módulo (mesmo as sem o flag ligado) pra achar as que estão mais
// fundo — mesmo cuidado da memória "shallow piece checks" (checar só o
// nível raiz perderia peças escondidas dentro de um módulo usado como peça).
function collectColorConfigurablePieces(piecesList, results) {
  results = results || [];
  (piecesList || []).forEach((p) => {
    // Generalizado 2026-07-19 pra peça-FOLHA também ("pra peca tambem...
    // quero deixar por exemplo so uma shelf de cor separada") — antes só
    // peça-módulo (is_module) qualificava. O motor de preço/3D já mesclava
    // pieceColorOverrides por piece.id genericamente (ver
    // effectiveColorsForPiece em pricing.js), então uma peça-folha comum
    // com o flag ligado funciona sem nenhuma outra mudança no cálculo.
    if (p.client_color_configurable) results.push(p);
    if (p.is_module && p.child_pieces && p.child_pieces.length) {
      collectColorConfigurablePieces(p.child_pieces, results);
    }
  });
  return results;
}

// "Sub-configuração de medidas" (migration 036, pedido do usuário): um
// módulo composto de peças-módulo aninhadas (ex: "Painel" = "Painel Ripado" +
// "Bench Hall 1") só deixava o cliente mexer no W/H/D do módulo PAI — a peça
// aninhada só media o que a fórmula desta linha calculava a partir disso. Pra
// cada peça-módulo com client_dimension_configurable=true, desenha um bloco
// "▸ Configurar <peça>" (nasce fechado, mesmo padrão de "▸ Configurar" no
// admin) que expande com sliders PRÓPRIOS de L/A/P — mesma régua visual do
// W/H/D do módulo pai (classes dim-field/dim-slider-row/dim-value-row),
// dentro da faixa mín/máx cadastrada pelo admin nesta peça.
//
// POR PADRÃO A PEÇA ACOMPANHA O PAI (pedido explícito do usuário): o slider
// só nasce com um valor qualquer (width_default_mm etc.) até a PRIMEIRA
// sincronização (ver syncUntouchedPieceDimSliders, chamada de dentro de
// recalculatePreview) — a partir daí, enquanto o cliente não mexer NAQUELE
// eixo especificamente, o slider é reposicionado a cada recálculo pro valor
// que a FÓRMULA desta peça der a partir do W/H/D atual do módulo pai (ou de
// quem estiver acima dela na árvore) — exatamente como se a opção estivesse
// desligada. Só quando o cliente arrasta um slider (evento 'input' de
// verdade — reposicionar via JS não dispara isso) é que aquele eixo entra em
// touchedPieceDimAxes e vira um valor FIXO dali em diante, independente do
// que aconteça com o módulo pai — os outros 2 eixos da mesma peça continuam
// acompanhando normalmente. Um link "usar automático" some esse eixo de
// touchedPieceDimAxes e volta a acompanhar o pai.
function renderPieceDimensionSubconfigs() {
  const container = document.getElementById('po-piece-subconfigs-wrap');
  if (!container) return;
  container.innerHTML = '';
  pieceSubconfigLabelUpdaters = [];
  touchedPieceDimAxes = new Set();

  const configurablePieces = collectDimConfigurablePieces(pieces);
  const unitSelect = document.getElementById('po-unit-select');
  const AXES = [['width', I18n.t('step1.filter_width')], ['height', I18n.t('step1.filter_height')], ['depth', I18n.t('step1.filter_depth')]];

  configurablePieces.forEach((p) => {
    const pieceName = p.reference || p.module_name || I18n.t('step2.piece_fallback');

    const wrap = document.createElement('div');
    wrap.className = 'po-piece-subconfig';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'po-piece-subconfig-toggle';
    toggleBtn.textContent = I18n.t('step2.configure_piece_closed', { piece: pieceName });
    wrap.appendChild(toggleBtn);

    const body = document.createElement('div');
    body.className = 'po-piece-subconfig-body';
    body.style.display = 'none';
    wrap.appendChild(body);

    AXES.forEach(([axis, label]) => {
      // Eixo TRAVADO por presets no módulo aninhado (ex: polegadas da TV):
      // dropdown com os valores/rótulos cadastrados em vez de slider — a
      // régua livre confundia (mostrava "36 25/32"" enquanto o cálculo
      // travava na polegada mais próxima). "Automático" mantém a fórmula
      // da linha (maior preset que caiba). Vem ANTES da checagem de
      // mín/máx: eixo travado nem precisa de faixa cadastrada.
      const lockedOpts = p[`locked_${axis}_preset_options`];
      if (lockedOpts && lockedOpts.length > 0) {
        const field = document.createElement('div');
        field.className = 'dim-field';
        const fieldLabel = document.createElement('label');
        fieldLabel.textContent = label;
        field.appendChild(fieldLabel);
        const select = document.createElement('select');
        select.className = 'po-piece-subconfig-locked-select';
        select.dataset.pieceId = p.id;
        select.dataset.axis = axis;
        const unit0 = unitSelect ? unitSelect.value : 'mm';
        const autoOpt = document.createElement('option');
        autoOpt.value = '';
        autoOpt.textContent = I18n.t('step2.use_automatic');
        select.appendChild(autoOpt);
        lockedOpts.forEach((opt) => {
          const o = document.createElement('option');
          o.value = String(opt.value_mm);
          o.textContent = opt.label || formatDimension(opt.value_mm, unit0);
          select.appendChild(o);
        });
        select.addEventListener('change', () => recalculatePreview());
        field.appendChild(select);
        body.appendChild(field);
        return;
      }

      // Peça DECORATIVA (ex: TV): eixo sem preset travado não é configurável
      // — sem slider livre, mesmo que a linha tenha mín/máx salvos (o admin
      // pré-preenche essas faixas ao marcar "cliente pode configurar", e
      // numa TV altura/profundidade são derivadas da polegada).
      if (p.is_decoration) return;

      const minMm = p[`${axis}_min_mm`];
      const maxMm = p[`${axis}_max_mm`];
      const defaultMm = p[`${axis}_default_mm`];
      // Sem faixa cadastrada pro admin nesse eixo específico — não desenha
      // slider pra ele (o admin pode ter deixado só largura/altura
      // configuráveis, por exemplo, e a profundidade continua na fórmula).
      if (minMm === null || minMm === undefined || maxMm === null || maxMm === undefined || !isFinite(minMm) || !isFinite(maxMm)) return;

      const axisKey = `${p.id}:${axis}`;

      const field = document.createElement('div');
      field.className = 'dim-field';
      const fieldLabel = document.createElement('label');
      fieldLabel.textContent = label;
      field.appendChild(fieldLabel);

      const sliderRow = document.createElement('div');
      sliderRow.className = 'dim-slider-row';
      const minLabel = document.createElement('span');
      minLabel.className = 'dim-bound';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'dim-slider po-piece-subconfig-slider';
      slider.dataset.pieceId = p.id;
      slider.dataset.axis = axis;
      slider.min = minMm;
      slider.max = maxMm;
      // Chute inicial só até a primeira sincronização automática (ver
      // syncUntouchedPieceDimSliders) — o eixo ainda não foi tocado, então
      // isso vira o valor real da fórmula assim que ela rodar.
      slider.value = (defaultMm !== null && defaultMm !== undefined && isFinite(defaultMm)) ? defaultMm : minMm;
      const maxLabel = document.createElement('span');
      maxLabel.className = 'dim-bound dim-bound-max';
      sliderRow.appendChild(minLabel);
      sliderRow.appendChild(slider);
      sliderRow.appendChild(maxLabel);
      field.appendChild(sliderRow);

      const valueRow = document.createElement('div');
      valueRow.className = 'dim-value-row';
      const valueSpan = document.createElement('span');
      valueSpan.className = 'dim-value';
      const resetLink = document.createElement('button');
      resetLink.type = 'button';
      resetLink.className = 'po-piece-subconfig-reset';
      resetLink.textContent = I18n.t('step2.use_automatic');
      resetLink.style.display = 'none';
      valueRow.appendChild(valueSpan);
      valueRow.appendChild(resetLink);
      field.appendChild(valueRow);

      function refreshLabels() {
        const unit = unitSelect ? unitSelect.value : 'mm';
        minLabel.textContent = formatDimension(minMm, unit);
        maxLabel.textContent = formatDimension(maxMm, unit);
        valueSpan.textContent = formatDimension(parseFloat(slider.value), unit);
      }
      refreshLabels();
      // Guardado no próprio elemento (não só na closure) pra
      // syncUntouchedPieceDimSliders — que roda fora deste forEach, depois
      // de recalcular o preço — conseguir atualizar o texto sem precisar
      // duplicar a lógica de formatação.
      slider._refreshLabels = refreshLabels;
      pieceSubconfigLabelUpdaters.push(refreshLabels);

      slider.addEventListener('input', () => {
        // Interação de verdade do cliente (arrastar o slider) — só isso
        // dispara 'input'; reposicionar via JS (sync automático) não conta,
        // então este eixo vira "tocado" só quando o cliente realmente mexe.
        touchedPieceDimAxes.add(axisKey);
        resetLink.style.display = 'inline';
        refreshLabels();
        recalculatePreview();
      });

      resetLink.addEventListener('click', () => {
        touchedPieceDimAxes.delete(axisKey);
        resetLink.style.display = 'none';
        recalculatePreview();
      });

      body.appendChild(field);
    });

    toggleBtn.addEventListener('click', () => {
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      toggleBtn.textContent = I18n.t(isOpen ? 'step2.configure_piece_closed' : 'step2.configure_piece_open', { piece: pieceName });
    });

    container.appendChild(wrap);
  });
}

// Acha, na árvore recursiva do breakdown (Pricing.calculateAssembly/
// calculateModulePrice — child_breakdown pra peça-módulo), a entrada de uma
// peça específica pelo piece_id (= module_components.id, único em qualquer
// profundidade — ver loadRecursivePiecesForModule).
function findBreakdownEntry(breakdown, pieceId) {
  for (const entry of (breakdown || [])) {
    if (entry.piece_id === pieceId) return entry;
    if (entry.child_breakdown) {
      const found = findBreakdownEntry(entry.child_breakdown, pieceId);
      if (found) return found;
    }
  }
  return null;
}

// Reposiciona, depois de CADA recálculo (ver recalculatePreview), todo
// slider de sub-configuração cujo eixo ainda NÃO foi tocado pelo cliente
// (touchedPieceDimAxes) pro valor que o breakdown recém-calculado deu pra
// aquela peça — é isso que faz a peça "acompanhar o módulo pai" por padrão
// (a fórmula já usa o W/H/D atual do pai; só espelha o resultado no slider).
// Não dispara 'input' (setar .value via JS não dispara), então isto nunca
// marca o eixo como tocado nem entra em loop de recálculo.
function syncUntouchedPieceDimSliders(breakdown) {
  document.querySelectorAll('.po-piece-subconfig-slider').forEach((slider) => {
    const pieceId = slider.dataset.pieceId;
    const axis = slider.dataset.axis;
    if (touchedPieceDimAxes.has(`${pieceId}:${axis}`)) return;
    const entry = findBreakdownEntry(breakdown, pieceId);
    if (!entry) return;
    const resolvedMm = entry[`${axis}_mm`];
    if (resolvedMm === undefined || resolvedMm === null || !isFinite(resolvedMm)) return;
    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    slider.value = clamp(resolvedMm, min, max);
    if (slider._refreshLabels) slider._refreshLabels();
  });
}

// Lê os sliders de sub-configuração renderizados agora (ver
// renderPieceDimensionSubconfigs) no formato que Pricing.calculatePiece/
// resolvePiecesForViewer esperam — { [piece_id]: { width_mm, height_mm,
// depth_mm } } — só inclui um eixo se o cliente REALMENTE tiver mexido nele
// (touchedPieceDimAxes); eixo não tocado fica de fora do override inteiro,
// pra continuar acompanhando a fórmula (= o módulo pai) por padrão, como
// pedido. Peça com só 1-2 eixos tocados manda só essas chaves — as outras
// continuam vindo da fórmula.
function readPieceDimOverridesFromDOM() {
  const dimOverrides = {};
  document.querySelectorAll('.po-piece-subconfig-slider').forEach((slider) => {
    const pieceId = slider.dataset.pieceId;
    const axis = slider.dataset.axis;
    if (!touchedPieceDimAxes.has(`${pieceId}:${axis}`)) return;
    if (!dimOverrides[pieceId]) dimOverrides[pieceId] = {};
    dimOverrides[pieceId][`${axis}_mm`] = parseFloat(slider.value);
  });
  // Dropdowns de eixo TRAVADO no "Configurar peça" (ver
  // renderPieceDimensionSubconfigs) — valor vazio = automático (fórmula).
  document.querySelectorAll('.po-piece-subconfig-locked-select').forEach((sel) => {
    if (!sel.value) return;
    const pieceId = sel.dataset.pieceId;
    if (!dimOverrides[pieceId]) dimOverrides[pieceId] = {};
    dimOverrides[pieceId][`${sel.dataset.axis}_mm`] = parseFloat(sel.value);
  });
  // Dropdown de tamanho ao lado do OPCIONAL (ver renderOptionalComponents,
  // ex: polegada da TV) — mesmo mecanismo de override; "Auto" (valor vazio)
  // deixa a fórmula da linha decidir. Vem DEPOIS dos sliders de propósito:
  // se o cliente usou os dois pro mesmo eixo, o dropdown (mais específico)
  // ganha.
  document.querySelectorAll('.po-optional-width-select').forEach((sel) => {
    if (!sel.value) return;
    const pieceId = sel.dataset.pieceId;
    if (!dimOverrides[pieceId]) dimOverrides[pieceId] = {};
    dimOverrides[pieceId].width_mm = parseFloat(sel.value);
  });
  return dimOverrides;
}

function renderOptionalComponents() {
  const container = document.getElementById('po-optional-components-list');
  const wrap = document.getElementById('po-optional-components-wrap');
  if (!container || !wrap) return;
  container.innerHTML = '';
  const optionalPieces = pieces.filter((p) => p.client_optional);
  wrap.style.display = optionalPieces.length > 0 ? 'block' : 'none';
  optionalPieces.forEach((p) => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.marginTop = '4px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.width = 'auto';
    checkbox.checked = selectedOptionalComponentIds.has(p.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedOptionalComponentIds.add(p.id);
      else selectedOptionalComponentIds.delete(p.id);
      recalculatePreview();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(p.reference || p.module_name || ''));

    // Dropdown de TAMANHO ao lado do opcional (pedido do usuário — ex: TV
    // por polegada): só pra peça-módulo aninhada com largura TRAVADA
    // (module_dimension_presets, ex: 32"/40"/55"...) e com "cliente pode
    // configurar as medidas" (migration 036) ligado nesta linha — é esse
    // flag que autoriza o override de medida no cálculo (dimOverrides).
    // "Auto" (padrão) mantém a fórmula da linha, que já trava no preset
    // mais próximo que caiba (Pricing.pickNearestPreset).
    const sizeOptions = p.is_module && p.client_dimension_configurable
      ? (p.locked_width_preset_options || [])
      : [];
    if (sizeOptions.length > 0) {
      const sizeSelect = document.createElement('select');
      sizeSelect.className = 'po-optional-width-select';
      sizeSelect.dataset.pieceId = p.id;
      sizeSelect.style.width = 'auto';
      sizeSelect.style.marginLeft = '4px';
      const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
      const autoOpt = document.createElement('option');
      autoOpt.value = '';
      autoOpt.textContent = I18n.t('step2.use_automatic');
      sizeSelect.appendChild(autoOpt);
      sizeOptions.forEach((opt) => {
        const o = document.createElement('option');
        o.value = String(opt.value_mm);
        o.textContent = opt.label || formatDimension(opt.value_mm, unit);
        sizeSelect.appendChild(o);
      });
      sizeSelect.addEventListener('change', () => {
        // escolher um tamanho já marca o opcional junto (ninguém escolhe
        // polegada de uma TV que não vai levar)
        if (sizeSelect.value && !checkbox.checked) {
          checkbox.checked = true;
          selectedOptionalComponentIds.add(p.id);
        }
        recalculatePreview();
      });
      // o <select> dentro do <label> não pode togglar o checkbox ao clicar
      sizeSelect.addEventListener('click', (ev) => ev.preventDefault());
      label.appendChild(sizeSelect);
    }

    container.appendChild(label);
  });
}

function setupDimensionInputs() {
  const w = document.getElementById('po-width-input');
  const h = document.getElementById('po-height-input');
  const d = document.getElementById('po-depth-input');
  w.min = currentModule.width_min_mm; w.max = currentModule.width_max_mm; w.value = currentModule.width_default_mm;
  // Altura travada também pelo pé direito da casa (ceilingMaxHeightMm =
  // pé direito − 5" de afastamento mínimo do teto) — o menor dos dois tetos
  // vence; o default desce junto se ficar acima do limite.
  const effHeightMax = Math.min(currentModule.height_max_mm, ceilingMaxHeightMm());
  h.min = currentModule.height_min_mm; h.max = effHeightMax;
  h.value = Math.min(currentModule.height_default_mm, effHeightMax);
  d.min = currentModule.depth_min_mm; d.max = currentModule.depth_max_mm; d.value = currentModule.depth_default_mm;
  updateDimensionUnitUI();
  setupDimensionPresetsUI();
}

// Idêntico ao de client.js (ver lá pra explicação completa) — aplica, pra
// cada dimensão, o modo TRAVADO (dropdown com só os valores cadastrados em
// module_dimension_presets) ou SUGERIDO (régua livre + chips de atalho),
// usando os ids "po-" deste arquivo e recalculatePreview() em vez de
// recalculate().
function setupDimensionPresetsUI() {
  const unitSelect = document.getElementById('po-unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';

  [
    ['width', 'po-width-input', 'po-width-locked-select', 'po-width-preset-chips'],
    ['height', 'po-height-input', 'po-height-locked-select', 'po-height-preset-chips'],
    ['depth', 'po-depth-input', 'po-depth-locked-select', 'po-depth-preset-chips']
  ].forEach(([key, sliderId, selectId, chipsId]) => {
    const slider = document.getElementById(sliderId);
    const select = document.getElementById(selectId);
    const chipsWrap = document.getElementById(chipsId);
    if (!slider || !select || !chipsWrap) return;

    const dimField = slider.closest('.dim-field');
    const sliderRow = slider.closest('.dim-slider-row');
    const valueRow = dimField ? dimField.querySelector('.dim-value-row') : null;
    // Altura: presets acima do teto efetivo (pé direito − 5") somem da lista
    // — mesmo limite já aplicado na régua livre (setupDimensionInputs).
    const presets = ((dimensionPresets && dimensionPresets[key]) || [])
      .filter((p) => key !== 'height' || Number(p.value_mm) <= ceilingMaxHeightMm());
    const locked = !!(currentModule && currentModule[`${key}_locked`]) && presets.length > 0;

    const labelFor = (p) => (p.label ? `${p.label} (${formatDimension(p.value_mm, unit)})` : formatDimension(p.value_mm, unit));

    if (locked) {
      if (sliderRow) sliderRow.style.display = 'none';
      if (valueRow) valueRow.style.display = 'none';
      chipsWrap.style.display = 'none';
      select.style.display = 'block';

      const currentMm = parseFloat(slider.value);
      select.innerHTML = '';
      presets.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.value_mm;
        opt.textContent = labelFor(p);
        select.appendChild(opt);
      });
      const match = presets.find((p) => Math.abs(Number(p.value_mm) - currentMm) < 0.01);
      select.value = match ? match.value_mm : presets[0].value_mm;
      if (!match) slider.value = presets[0].value_mm;
    } else {
      if (sliderRow) sliderRow.style.display = '';
      if (valueRow) valueRow.style.display = '';
      select.style.display = 'none';

      chipsWrap.innerHTML = '';
      presets.forEach((p) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'dim-preset-chip';
        chip.textContent = labelFor(p);
        chip.addEventListener('click', () => {
          slider.value = p.value_mm;
          recalculatePreview();
          updateDimensionUnitUI();
        });
        chipsWrap.appendChild(chip);
      });

      // Atalho "Máximo (teto − zona segura)" — só na altura (pedido do
      // usuário, 2026-07-16: "quero uma opcao pra ir ate o maximo do teto -
      // zona segura") — sobe a régua até o teto EFETIVO que já trava
      // slider.max (ceilingMaxHeightMm(), ver setupDimensionInputs: pé
      // direito − 5" de afastamento mínimo − rodapé). Sempre visível na
      // altura, independente de existir preset cadastrado no admin — vem da
      // configuração de pé direito/rodapé do próprio cliente (topo do
      // portal), não do catálogo.
      if (key === 'height') {
        const maxChip = document.createElement('button');
        maxChip.type = 'button';
        maxChip.className = 'dim-preset-chip';
        maxChip.textContent = I18n.t('step2.height_max_ceiling_chip', { height: formatDimension(parseFloat(slider.max), unit) });
        maxChip.addEventListener('click', () => {
          slider.value = slider.max;
          recalculatePreview();
          updateDimensionUnitUI();
        });
        chipsWrap.appendChild(maxChip);
      }

      chipsWrap.style.display = chipsWrap.children.length > 0 ? 'flex' : 'none';
    }
  });
}

['width', 'height', 'depth'].forEach((key) => {
  const select = document.getElementById(`po-${key}-locked-select`);
  const slider = document.getElementById(`po-${key}-input`);
  if (!select || !slider) return;
  select.addEventListener('change', () => {
    slider.value = select.value;
    recalculatePreview();
    updateDimensionUnitUI();
  });
});

['po-width-input', 'po-height-input', 'po-depth-input', 'po-hinge-model-select', 'po-slide-model-select'].forEach((id) => {
  document.getElementById(id).addEventListener('input', recalculatePreview);
});
['po-width-input', 'po-height-input', 'po-depth-input'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updateDimensionUnitUI);
});

// Reescreve o campo de altura do chão na unidade global ATUAL a partir da
// fonte de verdade em mm (currentFloorHeightMm) — mesmo padrão de
// refreshRoomSettingsInputs (po-ceiling-input/po-baseboard-input) e do bloco
// width/height/depth em updateDimensionUnitUI: não mexe no campo enquanto o
// cliente está digitando nele (document.activeElement), senão o cursor
// "pula" a cada tecla.
function refreshFloorHeightInputUI() {
  const input = document.getElementById('po-comp-floor-height-input');
  const unitEl = document.getElementById('po-comp-floor-height-unit');
  if (!input) return;
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  if (document.activeElement !== input) input.value = formatDimensionNumber(currentFloorHeightMm, unit);
  if (unitEl) unitEl.textContent = unitAbbrev(unit);
}

// Confirma o texto digitado (Enter ou saiu do campo) — parseia na unidade
// global atual (fração de polegada inclusive, mesma função de
// largura/altura/profundidade), atualiza a fonte de verdade em mm, e força
// um refit da câmera antes de recalcular (pedido do usuário, 2026-07-16: "o
// zoom ainda pega so meio da parede e movel some no zoom"). Motivo do
// refit: mudar largura/altura/profundidade chama recalculatePreview() com
// refit=false de propósito (Viewer3D.update, ver comentário "só reposiciona
// o alvo... preserva o ângulo de visão"), e esse caminho NÃO REPOSICIONA a
// câmera nenhum pouco quando o ambiente da Composição está ligado (só
// atualiza lastMaxDim — ver "else if (controls && lastMaxDim)" em
// viewer3d.js/update). Isso é intencional pra largura/altura/profundidade
// (o módulo cresce/encolhe no mesmo lugar, câmera não devia ficar
// "pulando"), mas pra altura do CHÃO o módulo inteiro se desloca de
// verdade no eixo Y — sem forçar um refit aqui, o quadro ficava parado no
// enquadramento antigo enquanto o módulo subia/descia, saindo da vista.
function applyFloorHeightInput() {
  const input = document.getElementById('po-comp-floor-height-input');
  if (!input) return;
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const mm = parseDimensionInput(input.value, unit);
  if (mm === null || isNaN(mm)) {
    refreshFloorHeightInputUI(); // texto inválido — devolve o valor válido anterior
    return;
  }
  currentFloorHeightMm = Math.max(0, mm);
  refreshFloorHeightInputUI();
  // Teto efetivo (ceilingMaxHeightMm) agora depende de currentFloorHeightMm
  // (pedido do usuário, 2026-07-16: "ele tem que considerar de onde parte
  // do chao pra dar o maximo") — subir o chão encolhe o espaço vertical
  // sobrando, então a régua de altura (e o chip "Máximo") precisam
  // re-travar AGORA, não só na próxima vez que o pé direito/rodapé mudar.
  applyRoomSettingsToConfigurator();
  viewer3dNeedsRefit = true;
  recalculatePreview();
}

const floorHeightInputEl = document.getElementById('po-comp-floor-height-input');
if (floorHeightInputEl) {
  // 'change' (não 'input') — mesmo padrão de po-ceiling-input/po-baseboard-input
  // e do campo "exato" de largura/altura/profundidade (applyExactDimension):
  // parseDimensionInput não dá pra rodar a cada tecla digitada (uma fração
  // de polegada tipo "15 1/16" fica ambígua/inválida no meio da digitação),
  // então só confirma no blur ou Enter.
  floorHeightInputEl.addEventListener('change', applyFloorHeightInput);
  floorHeightInputEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); applyFloorHeightInput(); floorHeightInputEl.blur(); }
  });
}

// Resolve uma lista de peças (folha OU módulo aninhado, formato recursivo)
// pro formato que Viewer3D.update espera — idêntica à de client.js (exceto
// pieceColorOverrides, migration 046, que só existe aqui/no portal).
// pieceColorOverrides: { [piece_id]: { [color_role_id]: registro de "colors" } } — cor própria
// por INSTÂNCIA de peça-módulo aninhada com client_color_configurable (ver
// collectColorConfigurablePieces/buildPieceColorOverrides), espelha
// Pricing.effectiveColorsForPiece pra 3D e preço nunca divergirem.
function resolvePiecesForViewer(piecesList, containerDims, colorsByRole, shelfQuantities, dimOverrides, pieceColorOverrides) {
  const { bodyDims } = Pricing.resolveBodyDims(piecesList, containerDims);
  const parts = [];
  (piecesList || []).forEach((piece) => {
    const pieceContainerDims = piece.position_role === 'leg' ? containerDims : bodyDims;
    const quantityOverride = piece.quantity_configurable ? shelfQuantities[piece.id] : undefined;
    // Sub-configuração de medidas (migration 036) — mesma peça, mesmo id
    // (module_components.id) usado em Pricing.calculateAssembly, pra 3D e
    // preço nunca divergirem (ver comentário em calculatePiece/pricing.js).
    const dimOverride = piece.client_dimension_configurable && dimOverrides ? dimOverrides[piece.id] : undefined;
    const dims = Pricing.calculatePiece(piece, pieceContainerDims, quantityOverride, dimOverride);

    // Visibilidade condicional (migration 031) — mesma checagem do preço
    // (Pricing.calculateAssembly), pra 3D e preço nunca divergirem: sem isso
    // aqui, uma peça escondida do preço continuaria aparecendo no desenho.
    if (!Pricing.isPieceVisible(piece, pieceContainerDims)) return;

    // Peça-módulo com dimensão TRAVADA (locked_*_presets) que não cabe nem
    // no MENOR valor cadastrado nessa dimensão: essa peça NÃO EXISTE nessa
    // configuração (mesma regra de Pricing.calculateModulePiece, pra preço e
    // 3D nunca divergirem) — some do desenho em vez de aparecer menor do que
    // qualquer configuração real dela permite.
    if (Pricing.isBelowMinLockedPreset(piece.locked_width_presets, dims.width_mm)
      || Pricing.isBelowMinLockedPreset(piece.locked_height_presets, dims.height_mm)
      || Pricing.isBelowMinLockedPreset(piece.locked_depth_presets, dims.depth_mm)) {
      return;
    }

    // Cor própria desta instância (migration 046) — se pieceColorOverrides tiver uma entrada
    // pra este piece.id, ela substitui só os papéis que tem, mantendo os demais herdados do
    // pai; o resultado (não o colorsByRole original) desce pra child_pieces mais abaixo, pra um
    // módulo aninhado ainda mais fundo com override PRÓPRIO continuar vencendo sobre este.
    const pieceOverride = pieceColorOverrides && pieceColorOverrides[piece.id];
    const effectiveColorsByRole = pieceOverride ? Object.assign({}, colorsByRole, pieceOverride) : colorsByRole;
    const color = effectiveColorsByRole && effectiveColorsByRole[piece.color_role_id];
    const roundedQty = Math.round(dims.quantity);
    const qty = Math.max(isNaN(roundedQty) ? 1 : roundedQty, 0);

    // Profundidade FIXA (module_fixed_depths, generaliza o antigo
    // drawer_type_depths) tem prioridade sobre locked_depth_presets (sistema
    // mais antigo, específico de gaveta/corrediça — não muda nada em
    // módulos que já usam module_fixed_depths).
    let resolvedDepthMm = dims.depth_mm;
    if (piece.fixed_depths && piece.fixed_depths.length > 0) {
      resolvedDepthMm = Pricing.pickDrawerDepth(piece.fixed_depths, dims.depth_mm);
    } else if (piece.locked_depth_presets && piece.locked_depth_presets.length > 0) {
      resolvedDepthMm = Pricing.pickNearestPreset(piece.locked_depth_presets, dims.depth_mm);
    }
    // Largura/altura TRAVADAS no módulo FILHO (migration 028) — mesma ideia
    // acima, generalizada: o módulo usado como peça só existe nesses valores.
    let resolvedWidthMm = dims.width_mm;
    if (piece.locked_width_presets && piece.locked_width_presets.length > 0) {
      resolvedWidthMm = Pricing.pickNearestPreset(piece.locked_width_presets, dims.width_mm);
    }
    let resolvedHeightMm = dims.height_mm;
    if (piece.locked_height_presets && piece.locked_height_presets.length > 0) {
      resolvedHeightMm = Pricing.pickNearestPreset(piece.locked_height_presets, dims.height_mm);
    }

    // LIMITE PRÓPRIO do módulo filho (sempre ativo, mesma trava de
    // Pricing.calculateModulePiece — ver comentário lá) — pedido do
    // usuário: "quando um modulo e inserido em outro, ele respeite os
    // limites de tamanho do modulo filho". Peça-folha nunca tem
    // own_*_min/max_mm setado (undefined), então isto não afeta ela.
    resolvedWidthMm = Pricing.clampToOwnRange(resolvedWidthMm, piece.own_width_min_mm, piece.own_width_max_mm);
    resolvedHeightMm = Pricing.clampToOwnRange(resolvedHeightMm, piece.own_height_min_mm, piece.own_height_max_mm);
    resolvedDepthMm = Pricing.clampToOwnRange(resolvedDepthMm, piece.own_depth_min_mm, piece.own_depth_max_mm);

    // TRAVA DE SEGURANÇA: uma peça (folha ou módulo aninhado) nunca pode
    // ficar maior que o espaço disponível no container que a recebe
    // (locked_*_presets pode arredondar pro valor mais PRÓXIMO, não
    // necessariamente o que CABE). Clampa sempre, nos 3 eixos — EXCETO pra
    // position_role='free' (ver client.js pro histórico completo).
    //
    // REVERTIDO (2026-07-07): tentei liberar isso só pra peça-folha (is_module)
    // — quebrou o desenho 3D em cascata, porque is_module não diz nada sobre
    // COMO a peça se posiciona.
    // CORRIGIDO (2026-07-09): condição certa é position_role==='free', que já
    // ignora vão-interno/empilhamento automático em placePieceInBox — só
    // faltava a MEDIDA também não ser clampada aqui.
    if (piece.position_role !== 'free') {
      resolvedWidthMm = Math.min(resolvedWidthMm, pieceContainerDims.W);
      resolvedHeightMm = Math.min(resolvedHeightMm, pieceContainerDims.H);
      resolvedDepthMm = Math.min(resolvedDepthMm, pieceContainerDims.D);
    }

    // Deslocamento é uma fórmula — avaliada contra o MESMO container que a
    // peça usa pras próprias dimensões, MAIS as próprias dimensões
    // RESOLVIDAS (já travadas/clampadas acima) desta peça, disponíveis em
    // minúsculo (w/h/d) — mesma convenção já usada em area_m2_formula/
    // edge_band_linear_m_formula (Pricing.calculatePiece). Isso permite
    // fórmulas como "D-d" (Posição Z), que encostam a peça na FRENTE do vão
    // (D = profundidade do container, d = profundidade da PRÓPRIA peça) —
    // funciona pra QUALQUER container, ao contrário de um valor fixo tipo
    // "20" (calibrado só pra um módulo pai específico).
    let childParts = null;
    if (piece.is_module && piece.child_pieces && piece.child_pieces.length) {
      const childContainerDims = { W: resolvedWidthMm, H: resolvedHeightMm, D: resolvedDepthMm };
      childParts = resolvePiecesForViewer(piece.child_pieces, childContainerDims, effectiveColorsByRole, shelfQuantities, dimOverrides, pieceColorOverrides);
    }

    // N/COUNT (pedido do usuário 2026-07-15, ESPELHA admin.js/client.js):
    // quando esta peça se repete (qty>1 — ex: várias prateleiras 'free' com
    // "cliente escolhe a quantidade"), o deslocamento agora é avaliado
    // DENTRO do loop, uma vez por cópia — cada cópia ganha N (seu número,
    // 1..qty) e COUNT (qty total) na fórmula, além de W/H/D/w/h/d de sempre.
    // Antes offset_x/y/z_mm era calculado uma vez só e repetido em toda
    // cópia — por isso N cópias de 'free' nasciam empilhadas na mesma
    // posição. Com qty=1 (caso mais comum), N=1/COUNT=1 sempre — fórmulas
    // antigas sem N/COUNT continuam se comportando exatamente como antes.
    for (let i = 0; i < qty; i++) {
      const offsetVars = {
        W: pieceContainerDims.W, H: pieceContainerDims.H, D: pieceContainerDims.D,
        w: resolvedWidthMm, h: resolvedHeightMm, d: resolvedDepthMm,
        N: i + 1, COUNT: qty
      };
      let offset_x_mm = 0, offset_y_mm = 0, offset_z_mm = 0;
      try { offset_x_mm = Pricing.evalFormula(piece.offset_x_formula, offsetVars); } catch (e) { /* ignora, usa 0 */ }
      try { offset_y_mm = Pricing.evalFormula(piece.offset_y_formula, offsetVars); } catch (e) { /* ignora, usa 0 */ }
      try { offset_z_mm = Pricing.evalFormula(piece.offset_z_formula, offsetVars); } catch (e) { /* ignora, usa 0 */ }
      parts.push({
        // Nome pra exibir no balão de duplo-clique (viewer3d.js/portal.js):
        // peça-folha usa a referência do catálogo (piece.reference,
        // espalhado via loadRecursivePiecesForModule); peça-módulo aninhada
        // usa o nome do módulo filho (module_name). Nunca inclui preço.
        reference: piece.reference || piece.module_name || null,
        position_role: piece.position_role,
        shape_type: piece.shape_type, // migration 062 — desenho 3D (caixa/cabide tubular oval)
        tilt_angle_deg: piece.tilt_angle_deg || 0, // migration 065 — inclinação (só 'shelf')
        rotation_y_deg: piece.rotation_y_deg || 0, // migration 067 — giro de canto (só 'free')
        width_mm: resolvedWidthMm,
        height_mm: resolvedHeightMm,
        depth_mm: resolvedDepthMm,
        color,
        offset_x_mm, offset_y_mm, offset_z_mm,
        hinge_side: piece.hinge_side,
        is_module: !!piece.is_module,
        opening_type: piece.opening_type,
        slides_per_unit: piece.slides_per_unit,
        positioning: piece.positioning,
        child_pieces: childParts
      });
    }
  });
  return parts;
}

// Recalcula o preço/3D do módulo que está sendo configurado agora (ainda
// não faz parte do pedido) — mesma lógica de recalculate() do client.js,
// incluindo a redução de altura do corpo quando há pé (Pricing.resolveBodyDims).
function recalculatePreview() {
  clearError();
  if (!currentModule || Object.keys(selectedColorIdByRole).length === 0 || pieces.length === 0) return;

  const width_mm = clamp(parseFloat(document.getElementById('po-width-input').value), currentModule.width_min_mm, currentModule.width_max_mm);
  // Teto efetivo = menor entre o máximo do módulo e (pé direito − 5") — ver
  // roomSettings/ceilingMaxHeightMm no topo do arquivo.
  const height_mm = clamp(parseFloat(document.getElementById('po-height-input').value), currentModule.height_min_mm, Math.min(currentModule.height_max_mm, ceilingMaxHeightMm()));
  const depth_mm = clamp(parseFloat(document.getElementById('po-depth-input').value), currentModule.depth_min_mm, currentModule.depth_max_mm);

  // colorsByRole (migration 035) — um registro de "colors" por papel
  // escolhido pelo cliente (ver renderColorRoleSwatchGroups).
  const colorsByRole = {};
  Object.keys(selectedColorIdByRole).forEach((roleId) => {
    const colors = moduleColorsByRole[roleId] || [];
    colorsByRole[roleId] = colors.find((c) => c.id === selectedColorIdByRole[roleId]) || colors[0];
  });
  const hingeModel = hingeModels.find((h) => h.id === document.getElementById('po-hinge-model-select').value) || null;
  const slideModel = slideModels.find((s) => s.id === document.getElementById('po-slide-model-select').value) || null;

  const shelfQuantities = {};
  document.querySelectorAll('.po-shelf-qty-input').forEach((input) => {
    shelfQuantities[input.dataset.pieceId] = parseInt(input.value, 10);
  });

  // Sub-configuração de medidas por peça-módulo aninhada (migration 036) —
  // ver renderPieceDimensionSubconfigs/readPieceDimOverridesFromDOM.
  const dimOverrides = readPieceDimOverridesFromDOM();

  // Cor por peça-módulo aninhada (migration 046) — ver
  // renderColorRoleSwatchGroups/buildPieceColorOverrides.
  const pieceColorOverrides = buildPieceColorOverrides();

  const effectivePieces = pieces.filter((p) => !p.client_optional || selectedOptionalComponentIds.has(p.id));

  try {
    const moduleDims = { W: width_mm, H: height_mm, D: depth_mm };
    // resolvePiecesForViewer já cuida da redução de altura pelo pé, da
    // profundidade fixa e da recursão em peças-módulo (child_pieces).
    const parts = resolvePiecesForViewer(effectivePieces, moduleDims, colorsByRole, shelfQuantities, dimOverrides, pieceColorOverrides);
    // Altura do chão (currentFloorHeightMm — só é setada fora de 0 em modo
    // Composição, ver startCompositionSlotConfig/restoreSlotStateIntoConfigurator/
    // applyFloorHeightInput; fica 0 no fluxo normal, comportamento de sempre,
    // módulo no chão de verdade). Pedido do usuário 2026-07-16: "mostrar
    // isso no desenho" — Viewer3D.update desloca o módulo no eixo Y.
    const floor_height_mm = currentFloorHeightMm;
    Viewer3D.update({ width_mm, height_mm, depth_mm, parts, refit: viewer3dNeedsRefit, floor_height_mm });
    viewer3dNeedsRefit = false;
  } catch (err) {
    // Sem 3D a calculadora continua normal.
  }

  try {
    // MÓDULO DECORATIVO (migration 039) — não gera preço nem breakdown de
    // produção: entra no carrinho com $0 e breakdown VAZIO (assim nada dele
    // aparece na lista de corte/compra/furação do admin). O 3D acima já foi
    // desenhado normalmente.
    const result = currentModule.is_decoration
      ? { total: 0, breakdown: [] }
      : Pricing.calculateModulePrice({
        module: currentModule, pieces: effectivePieces, colorsByRole, hingeModel, slideModel, shelfQuantities, dimOverrides,
        pieceColorOverrides, width_mm, height_mm, depth_mm, markupMultiplier: pricingMarkupMultiplier
      });
    // selected_colors (migration 035) — snapshot por papel, formato gravado
    // em order_items/quotes.
    const selectedColors = Object.keys(colorsByRole).map((roleId) => ({
      role_id: roleId,
      role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null,
      color_id: colorsByRole[roleId] ? colorsByRole[roleId].id : null,
      color_name: colorsByRole[roleId] ? colorsByRole[roleId].name : null
    }));
    lastItemResult = {
      result, colorsByRole, selectedColors, hingeModel, slideModel,
      shelfQuantities, dimOverrides, pieceColorOverrides, selectedOptionalIds: Array.from(selectedOptionalComponentIds),
      width_mm, height_mm, depth_mm
    };
    // Reposiciona os sliders de sub-configuração ainda não tocados pro valor
    // que a fórmula acabou de dar (ver syncUntouchedPieceDimSliders) — é
    // isso que faz a peça acompanhar o módulo pai por padrão.
    syncUntouchedPieceDimSliders(result.breakdown);
    // Decorativo: mostra o aviso no lugar do preço.
    document.getElementById('po-item-price').textContent = currentModule.is_decoration
      ? I18n.t('decor.not_included')
      : '$' + result.total.toFixed(2);
    // Volume (m³) + peso — migration 061. Módulo decorativo tem breakdown
    // vazio (ver comentário acima), formatVolumeWeight some sozinho (m³/kg
    // ficam 0.00/0.0, então esconde a linha em vez de mostrar zero).
    const itemVwEl = document.getElementById('po-item-volume-weight');
    if (itemVwEl) itemVwEl.textContent = currentModule.is_decoration ? '' : formatVolumeWeight(result.breakdown);
    document.getElementById('po-price-section').style.display = 'block';
  } catch (err) {
    showError(I18n.t('step2.price_calc_error', { msg: err.message }));
    document.getElementById('po-price-section').style.display = 'none';
    lastItemResult = null;
  }
}

// Botões SEPARADOS (pedido do usuário): "Abrir portas" só mexe nas peças com
// dobradiça (Viewer3D.toggleDoorsOnly), "Abrir gavetas" só nas de corrediça
// (Viewer3D.toggleDrawersOnly) — cada botão com seu próprio estado, sem
// afetar o outro.
const toggleDoorsBtn = document.getElementById('po-toggle-doors-btn');
if (toggleDoorsBtn) {
  toggleDoorsBtn.addEventListener('click', () => {
    try {
      const isOpen = Viewer3D.toggleDoorsOnly();
      toggleDoorsBtn.textContent = isOpen
        ? (toggleDoorsBtn.dataset.closeLabel || I18n.t('step2.close_doors'))
        : (toggleDoorsBtn.dataset.openLabel || I18n.t('step2.open_doors'));
    } catch (err) {
      // Sem 3D o botão não faz nada.
    }
  });
}

const toggleDrawersBtn = document.getElementById('po-toggle-drawers-btn');
if (toggleDrawersBtn) {
  toggleDrawersBtn.addEventListener('click', () => {
    try {
      const isOpen = Viewer3D.toggleDrawersOnly();
      toggleDrawersBtn.textContent = isOpen
        ? (toggleDrawersBtn.dataset.closeLabel || I18n.t('step2.close_drawers'))
        : (toggleDrawersBtn.dataset.openLabel || I18n.t('step2.open_drawers'));
    } catch (err) {
      // Sem 3D o botão não faz nada.
    }
  });
}

// ---------- Carrinho / pedido ----------

function formatMoney(v) { return '$' + Number(v || 0).toFixed(2); }

// ---- Volume (m³) + peso (kg/lb) — migration 061 ----
// Pedido do usuário: mostrar, junto do preço, a metragem cúbica e o peso de
// cada módulo/projeto/pedido. Volume vem de Pricing.calculateVolumeM3
// (soma width_mm x height_mm x depth_mm das peças-COMPONENTE do breakdown,
// sem contar peça-módulo/container pai — ver comentário em pricing.js).
// Peso = volume x materialDensityKgPerM3 (kg/m³, admin > Preço), convertido
// pra libra se o cliente escolher isso na barra de preferências.
// KG_PER_LB e WEIGHT_UNIT_STORAGE_KEY ficam declaradas lá em cima (perto de
// MM_PER_INCH), não aqui — ver comentário lá do porquê.

// Unidade de peso escolhida (kg/lb) — PERSISTIDA em localStorage, diferente
// de po-unit-select (medida linear, não persiste — ver comentário no HTML).
// getWeightUnit() sempre lê do <select> na tela (fonte da verdade em tempo
// real, mesmo padrão de getUnit() implícito nos ~25 lugares que leem
// po-unit-select direto); a persistência só entra na hora de popular o
// <select> no load inicial (ver setupWeightUnitSelect, chamado no boot).
function getWeightUnit() {
  return (document.getElementById('po-weight-unit-select') || {}).value || 'kg';
}
function setupWeightUnitSelect() {
  const sel = document.getElementById('po-weight-unit-select');
  if (!sel) return;
  const saved = localStorage.getItem(WEIGHT_UNIT_STORAGE_KEY);
  if (saved === 'kg' || saved === 'lb') sel.value = saved;
  sel.addEventListener('change', () => {
    localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, sel.value);
    refreshAllUnitDependentViews();
  });
}

// kg -> unidade escolhida, já formatado com 1 casa decimal + sufixo.
function formatWeightKg(kg) {
  const unit = getWeightUnit();
  const value = unit === 'lb' ? kg / KG_PER_LB : kg;
  return value.toFixed(1) + ' ' + unit;
}

// Volume m³ formatado (2 casas — módulo pequeno em m³ inteiro fica "0.00"
// sem decimais suficientes, 2 casas já distingue módulos comuns entre si).
function formatVolumeM3(m3) {
  return m3.toFixed(2) + ' m³';
}

// Volume de UM item, em m³, já multiplicado pela quantidade — breakdown
// (result.breakdown/it.breakdown) é sempre POR UNIDADE (mesma convenção de
// unit_price: total_price = unit_price × quantity, ver saveOrderItemEdit/
// updateOrderItemQuantity), então o volume precisa da mesma multiplicação
// pra bater com o total real que vai ser produzido/entregue.
function itemVolumeM3(breakdown, quantity) {
  if (typeof Pricing === 'undefined' || !Pricing.calculateVolumeM3) return 0;
  return Pricing.calculateVolumeM3(breakdown || []) * (Number(quantity) || 1);
}

// String pronta pra colocar do lado do preço: "0.25 m³ · 12.3 kg", a partir
// de um total em m³ JÁ SOMADO (ver itemVolumeM3/somas no carrinho/pedido/
// projeto — cada chamador soma os itens que fizerem sentido pra ele, com
// quantidade já considerada, antes de formatar aqui).
function formatVolumeWeightFromM3(totalM3) {
  const kg = totalM3 * materialDensityKgPerM3;
  return formatVolumeM3(totalM3) + ' · ' + formatWeightKg(kg);
}

// Atalho pro caso comum de UM item só (quantidade 1, ex: preview do módulo
// em configuração — ainda não tem quantidade escolhida).
function formatVolumeWeight(breakdown, quantity) {
  return formatVolumeWeightFromM3(itemVolumeM3(breakdown, quantity));
}

// Atualiza a linha de volume/peso somado no rodapé da tela do pedido
// (#po-order-detail-volume-weight) — extraído porque tem DOIS lugares que
// recalculam o total do pedido: renderOrderDetail (abre a tela) e
// updateOrderItemQuantity (edita quantidade sem reconstruir a tela toda).
function updateOrderDetailVolumeWeight(items) {
  const el = document.getElementById('po-order-detail-volume-weight');
  if (!el) return;
  el.textContent = (items && items.length > 0)
    ? formatVolumeWeightFromM3(items.reduce((sum, it) => sum + itemVolumeM3(it.breakdown, it.quantity), 0))
    : '';
}

// Preço da Galeria (pedido do usuário 2026-07-19, referência de catálogo
// "Starting at $2,269") — sem casas decimais E sem separador de milhar
// (diferente do formatMoney acima, que continua com centavos pro
// carrinho/pedidos — esse aqui é só cosmético pro card da Galeria).
function formatGalleryPrice(v) { return '$' + Math.round(Number(v || 0)); }

// Locale pra Date.toLocaleString/toLocaleDateString — acompanha o idioma da
// interface (I18n.getLanguage()), não fica sempre travado em pt-BR agora que
// o portal também existe em inglês/espanhol.
const LOCALE_BY_LANG = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
function currentLocale() {
  return LOCALE_BY_LANG[(typeof I18n !== 'undefined' && I18n.getLanguage()) || 'pt'] || 'pt-BR';
}

// Constrói a linha de cores exibida por item (carrinho, histórico, PDF) a
// partir de selected_colors (jsonb: [{ role_id, role_name, color_id,
// color_name }]) — substitui os antigos box_color_name/door_color_name
// fixos, já que agora o número de papéis de cor é dinâmico (migration 035).
function formatColorsLine(it) {
  const colors = Array.isArray(it.selected_colors) ? it.selected_colors : [];
  if (colors.length === 0) return '';
  return colors.map((c) => `${c.role_name}: ${c.color_name}`).join(' | ');
}

function cartTotal() {
  return cartItems.reduce((sum, it) => sum + Number(it.total_price || 0), 0);
}

function renderCart() {
  const listEl = document.getElementById('po-cart-list');
  // Reskin (2026-07-09): o carrinho agora é o painel "Seu Pedido", fixo do
  // lado — sempre visível (a antiga display:none até ter item some; em vez
  // disso mostra um estado vazio dentro da lista).
  const countBadge = document.getElementById('po-cart-count-badge');
  if (countBadge) countBadge.textContent = String(cartItems.length);

  listEl.innerHTML = cartItems.length > 0
    ? cartItems.map((it) => renderCartItemRow(it, true)).join('')
    : `<p class="hint po-cart-empty">${I18n.t('cart.empty')}</p>`;
  document.getElementById('po-cart-total').textContent = formatMoney(cartTotal());
  // Volume/peso somados de todos os itens do carrinho — migration 061
  // (quantidade de cada item já considerada, ver itemVolumeM3).
  const cartVwEl = document.getElementById('po-cart-volume-weight');
  if (cartVwEl) {
    cartVwEl.textContent = cartItems.length > 0
      ? formatVolumeWeightFromM3(cartItems.reduce((sum, it) => sum + itemVolumeM3(it.breakdown, it.quantity), 0))
      : '';
  }

  listEl.querySelectorAll('.portal-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeCartItem(btn.dataset.itemId));
  });

  // "Revisar pedido" (ver reviewDraftOrder) só faz sentido com algo pra
  // revisar — só aparece depois do 1º módulo adicionado (mesmo momento em
  // que currentDraftOrderId nasce, ver ensureDraftOrder).
  const reviewBtn = document.getElementById('po-cart-review-btn');
  if (reviewBtn) reviewBtn.style.display = cartItems.length > 0 ? 'block' : 'none';
  // "Novo Pedido" (pedido do usuário 2026-07-29, ver startNewOrder) — mesma
  // condição: só faz sentido zerar se tiver algo pra zerar.
  const newOrderBtn = document.getElementById('po-cart-new-order-btn');
  if (newOrderBtn) newOrderBtn.style.display = cartItems.length > 0 ? 'block' : 'none';
}

// Mesmo layout de linha usado no carrinho (pedido sendo montado) e no
// histórico ("Meus pedidos") — imagem, referência/descrição, cor caixa/
// porta, L x A x P, preço. removable=true mostra o botão de remover
// (só faz sentido enquanto o pedido ainda é um rascunho).
function renderCartItemRow(it, removable) {
  const thumb = it.thumbnail_data_url
    ? `<img src="${it.thumbnail_data_url}" alt="${it.module_name}" class="portal-item-thumb" />`
    : `<div class="portal-item-thumb portal-item-thumb-empty"></div>`;
  const colorsLine = formatColorsLine(it);
  const removeBtn = removable
    ? `<button type="button" class="portal-item-remove secondary" data-item-id="${it.id}">${I18n.t('cart.remove_btn')}</button>`
    : '';
  const qty = it.quantity || 1;
  // Módulo decorativo (migration 039): no lugar do preço ($0.00), a linha
  // mostra o aviso "não incluído no orçamento". Detecta pelo cadastro atual
  // do módulo (allModules) — item de pedido antigo cujo módulo sumiu cai no
  // preço normal ($0.00, inofensivo).
  const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
  const isDecor = !!(decorModule && decorModule.is_decoration);
  // Preço da linha: qty=1 mostra só o total (igual sempre foi); qty>1 (só
  // existe em pedidos antigos, de quando havia o atalho "Adicionar módulo"
  // rápido da vitrine, removido 2026-07-19 — mantido aqui só pra exibir
  // itens já salvos, nada cria qty>1 mais) mostra o preço unitário x
  // quantidade também, pra ficar claro de onde veio o total.
  const priceLine = isDecor
    ? `<span class="hint">${I18n.t('decor.cart_note')}</span>`
    : (qty > 1
      ? `${formatMoney(it.unit_price)} × ${qty} = ${formatMoney(it.total_price)}`
      : formatMoney(it.total_price));
  const qtyLine = qty > 1 ? `<div>${I18n.t('cart.qty_label', { n: qty })}</div>` : '';
  // Unidade GLOBAL (po-unit-select) — mesmo motivo do card da vitrine
  // (renderModuleGallery): não pode ficar preso em mm enquanto o resto do
  // portal já mostra em polegada/cm/etc.
  const cartUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const dimsLine = `${formatDimension(it.width_mm, cartUnit)} x ${formatDimension(it.height_mm, cartUnit)} x ${formatDimension(it.depth_mm, cartUnit)}`;
  // Volume (m³) + peso — migration 061. Não repete pra item decorativo
  // (breakdown vazio, mesma condição do "não incluído no orçamento" acima).
  // qty já considerado (breakdown é por unidade, ver itemVolumeM3).
  const volumeWeightLine = isDecor ? '' : `<div class="hint">${formatVolumeWeight(it.breakdown || [], qty)}</div>`;
  return `
    <div class="portal-item-row">
      ${thumb}
      <div class="portal-item-info">
        <div class="portal-item-title">${it.module_name}</div>
        ${it.module_description ? `<div class="hint">${it.module_description}</div>` : ''}
        ${colorsLine ? `<div>${colorsLine}</div>` : ''}
        <div>${dimsLine}</div>
        ${qtyLine}
      </div>
      <div class="portal-item-price">
        ${priceLine}
        ${volumeWeightLine}
        ${removeBtn}
      </div>
    </div>
  `;
}

// Nome do cliente/PO (client_name/po_name) NÃO nascem mais aqui — desde o
// reskin de 2026-07-29 ("aqui eu quero visualizar minha ordem, e salvo so na
// outra tela") a barra lateral "Seu Pedido" virou só visualização; esses
// campos (junto com telefone/e-mail/endereço) só existem na tela do pedido
// (#po-order-detail-section, ver reviewDraftOrder/renderOrderDetail) —
// preenchidos e gravados só quando o cliente clica "Revisar pedido" e depois
// "Aprovar Pedido" lá.
async function ensureDraftOrder() {
  if (currentDraftOrderId) return currentDraftOrderId;
  const { data, error } = await supabaseClient
    .from('orders')
    .insert({
      client_user_id: currentUser.id,
      client_email: currentUser.email,
      status: 'draft'
    })
    .select()
    .single();
  if (error) throw error;
  currentDraftOrderId = data.id;
  currentDraftOrderStatus = 'draft';
  return currentDraftOrderId;
}

// Corta as bordas "de fundo" de uma miniatura PNG (Viewer3D.snapshot()) —
// o enquadramento da câmera do configurador deixa uma margem grande ao redor
// do móvel (pra caber peças bem maiores em outras configurações), o que
// fazia o desenho final aparecer bem pequeno dentro do quadro do card
// (carrinho, composição, "meu ambiente", tela do pedido) — pedido do
// usuário: "os ícones... estão com desenho muito pequeno" e depois "da bem
// mais zoom nos modulo 3d". Devolve uma nova data URL só com a área que
// realmente tem o desenho + uma margem pequena, assim object-fit:contain do
// CSS preenche o quadro de verdade em vez de mostrar bastante espaço vazio
// ao redor de um desenho minúsculo. Não mexe em nada da câmera/
// posicionamento 3D em si (viewer3d.js intocado) — só pós-processa a
// imagem já capturada.
//
// 2026-07-19: generalizado pra detectar o fundo pela cor do canto (não só
// alpha) — a versão antiga só cortava alpha<=10, então miniaturas antigas
// capturadas com fundo OPACO (sem transparência real) não recortavam nada
// (o canvas inteiro "tinha alpha", a caixa delimitadora virava o canvas
// inteiro = zero de corte, o que explica o desenho continuar minúsculo
// mesmo depois do corte "funcionar" sem erro). Agora qualquer pixel que
// difira o bastante da cor do canto superior-esquerdo (fundo, seja ele
// transparente ou uma cor sólida) conta como "desenho real".
function trimTransparentPng(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const w = canvas.width, h = canvas.height;

        // Referência de fundo = cor do canto superior-esquerdo (funciona
        // tanto pra fundo transparente -- alpha 0 -- quanto pra fundo
        // opaco uniforme, ex.: branco).
        const bgI = 0;
        const bg = [data[bgI], data[bgI + 1], data[bgI + 2], data[bgI + 3]];
        const THRESHOLD = 24; // soma de |Δ| nos 4 canais pra contar como "diferente do fundo"

        let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const diff = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1])
              + Math.abs(data[i + 2] - bg[2]) + Math.abs(data[i + 3] - bg[3]);
            if (diff > THRESHOLD) {
              found = true;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (!found) { resolve(dataUrl); return; }

        // Margem reduzida (era 4%) — quanto menos sobra ao redor, mais o
        // desenho preenche o quadro (pedido: "da bem mais zoom").
        const pad = Math.round(Math.max(w, h) * 0.015);
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(w - 1, maxX + pad);
        maxY = Math.min(h - 1, maxY + pad);

        const trimmedW = maxX - minX + 1;
        const trimmedH = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = trimmedW;
        out.height = trimmedH;
        out.getContext('2d').drawImage(canvas, minX, minY, trimmedW, trimmedH, 0, 0, trimmedW, trimmedH);
        resolve(out.toDataURL('image/png'));
      } catch (err) {
        resolve(dataUrl); // canvas "tainted" ou outro erro -- devolve a original, nunca quebra o fluxo
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Proporção real (largura/altura) de uma data URL de imagem já recortada
// (trimTransparentPng) — usada por currentGalleryAspectRatio pra saber o
// formato VERDADEIRO do móvel, não o do painel/canvas na tela (que tem
// altura fixa de 420px em CSS, sempre parecido, independente do desenho —
// ver #po-comp-3d-canvas em style.css).
function getImageAspectRatio(dataUrl) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

// Preenche (NUNCA corta, nunca estica) uma imagem já recortada até bater
// EXATAMENTE a proporção pedida ao Gemini — fundo branco sólido só nas
// bordas que sobrarem, o móvel fica sempre no tamanho/proporção originais,
// só centralizado numa tela maior. Pedido do usuário (2026-07-31): "a IA
// sempre altera projeto quando a proporcao da imagem e diferente do padrao
// dela... isso nao pode acontecer".
//
// Causa raiz do bug: currentGalleryAspectRatio já calculava a proporção
// suportada mais próxima e mandava esse valor pro parâmetro
// generationConfig.imageConfig.aspectRatio do Gemini (ver Edge Function) —
// mas a IMAGEM em si (trimmedSnapshot) continuava na proporção REAL do
// móvel, quase sempre diferente da proporção pedida. O Gemini então tinha
// que decidir sozinho como encaixar um conteúdo de uma proporção dentro de
// uma tela de saída de outra proporção — e a forma mais "óbvia" pra um
// modelo de edição de imagem resolver isso é redimensionar o conteúdo pra
// caber (exatamente o "muda o projeto pra caber" relatado), não inventar
// espaço vazio do nada.
//
// Fix: a imagem MANDADA já sai pré-preenchida na proporção exata pedida —
// o Gemini nunca mais precisa decidir como encaixar nada, só (no máximo)
// decorar minimamente a borda extra (as regras de "zone-limited decoration"
// do prompt em buildGalleryPrompt já cobrem isso, incluindo proibição
// explícita de adicionar móvel grande).
function padImageToAspectRatio(dataUrl, targetRatio) {
  return new Promise((resolve) => {
    if (!dataUrl || !targetRatio || !isFinite(targetRatio) || targetRatio <= 0) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { resolve(dataUrl); return; }
        const currentRatio = w / h;
        // Já bate (tolerância pequena, escala log) — não recria a imagem à toa.
        if (Math.abs(Math.log(currentRatio / targetRatio)) < 0.01) { resolve(dataUrl); return; }
        let outW = w, outH = h;
        if (currentRatio > targetRatio) {
          // Móvel mais largo que o alvo -- aumenta a ALTURA da tela (nunca
          // corta largura, só adiciona fundo em cima/embaixo).
          outH = Math.round(w / targetRatio);
        } else {
          // Móvel mais estreito/alto que o alvo -- aumenta a LARGURA da
          // tela (nunca corta altura, só adiciona fundo nas laterais).
          outW = Math.round(h * targetRatio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outW, outH);
        ctx.drawImage(img, Math.round((outW - w) / 2), Math.round((outH - h) / 2));
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        resolve(dataUrl); // canvas "tainted" ou outro erro -- devolve a original, nunca quebra o fluxo
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Reencoda uma data URL de imagem pra JPEG — pedido do usuário (2026-07-19):
// "manda as cores em jpg pra uma melhor textura", ao mandar as fotos reais
// de acabamento (colors.texture_url, ver buildColorReferencesForComposition)
// pro Gemini. O upload original pode estar em qualquer formato (PNG, etc.);
// isto aqui garante JPEG na hora de enviar, sem precisar reconverter o
// arquivo já salvo no Storage. Fundo branco antes de desenhar (JPEG não tem
// canal alpha — se a foto original tiver transparência, viraria preto sem
// isso).
function toJpegDataUrl(dataUrl, quality) {
  return new Promise((resolve) => {
    if (!dataUrl) { resolve(dataUrl); return; }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', quality || 0.92));
      } catch (err) {
        resolve(dataUrl); // canvas "tainted" ou outro erro -- devolve a original, nunca quebra o fluxo
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

document.getElementById('po-add-item-btn').addEventListener('click', async () => {
  const cartError = document.getElementById('po-cart-error');
  cartError.style.display = 'none';
  if (!lastItemResult || !currentModule) {
    showError(I18n.t('step2.configure_before_add_error'));
    return;
  }

  // Editando um módulo de um PEDIDO JÁ SALVO (ver editOrderItem/tela do
  // pedido, migration 047) — em vez de inserir uma linha nova ou mexer numa
  // composição, faz UPDATE na MESMA linha de order_items e volta pra tela
  // do pedido (ver saveOrderItemEdit). Checado ANTES do modo Composição —
  // os dois nunca ficam setados ao mesmo tempo.
  if (editingOrderItemId) {
    await saveOrderItemEdit();
    return;
  }

  // Modo "Projetos" (ver startProjectSlotConfig, canvas 2D — pedido do
  // usuário 2026-07-21) — grava a configuração completa deste módulo em
  // projectSlots (posição livre x/y + profundidade), não em
  // compositionSlots nem em order_items. Checado ANTES do modo Composição
  // (os dois nunca ficam setados ao mesmo tempo, mesma convenção de
  // editingOrderItemId acima). Posição em si (x_mm/floor_height_mm/z_order)
  // só é ATRIBUÍDA aqui quando o slot é NOVO — editando um já existente
  // (editProjectSlot) preserva onde o cliente já tinha arrastado ele.
  if (addTargetProjectSlotId !== null) {
    let thumbnail_data_url = null;
    try { thumbnail_data_url = await trimTransparentPng(Viewer3D.snapshot()); } catch (e) { /* sem 3D, sem miniatura */ }
    const effectivePieces = pieces.filter((p) => !p.client_optional || selectedOptionalComponentIds.has(p.id));
    if (typeof applyFloorHeightInput === 'function') applyFloorHeightInput();
    const existingSlot = projectSlots.find((s) => s.id === addTargetProjectSlotId);
    const newSlot = {
      id: addTargetProjectSlotId,
      wall_index: existingSlot ? Number(existingSlot.wall_index || 0) : projectActiveWallIndex,
      x_mm: existingSlot ? Number(existingSlot.x_mm || 0) : 0, // recalculado abaixo se for slot novo
      floor_height_mm: currentFloorHeightMm,
      z_order: existingSlot ? Number(existingSlot.z_order || 0) : 0,
      module: currentModule,
      pieces: effectivePieces,
      // Cores DISPONÍVEIS pro módulo (não só a escolhida) — precisa
      // continuar aqui depois de editar via "Editar configuração completa",
      // senão o painel inline (ver renderProjectConfigPanel) perderia as
      // opções de swatch pra trocar cor sem reabrir o modal de novo.
      // moduleColorsByRole é o global que loadModuleColors (chamado por
      // selectModule) acabou de preencher pra este MESMO currentModule.
      colorOptionsByRole: moduleColorsByRole,
      colorsByRole: lastItemResult.colorsByRole,
      selectedColors: lastItemResult.selectedColors,
      pieceColorOverrides: lastItemResult.pieceColorOverrides,
      hingeModel: lastItemResult.hingeModel,
      slideModel: lastItemResult.slideModel,
      width_mm: lastItemResult.width_mm,
      height_mm: lastItemResult.height_mm,
      depth_mm: lastItemResult.depth_mm,
      shelfQuantities: lastItemResult.shelfQuantities,
      dimOverrides: lastItemResult.dimOverrides,
      selectedOptionalIds: lastItemResult.selectedOptionalIds,
      result: lastItemResult.result,
      thumbnail_data_url,
      // Valores de largura/altura TRAVADOS (currentModule.width_locked/
      // height_locked) — o global `dimensionPresets` já está fresco pra
      // ESTE módulo (loadModuleDimensionPresets, chamado dentro de
      // selectModule logo antes de abrir esta tela) — sem precisar de outra
      // consulta. Usado pelas setinhas de esticar do canvas (pedido do
      // usuário 2026-07-26, ver widthResizable/heightResizable e
      // updateProjectSlotDimension/updateProjectSlotWidthFromLeft).
      widthPresetsMm: currentModule.width_locked ? (dimensionPresets.width || []).map((r) => Number(r.value_mm)) : [],
      heightPresetsMm: currentModule.height_locked ? (dimensionPresets.height || []).map((r) => Number(r.value_mm)) : []
    };
    if (!existingSlot) newSlot.x_mm = computeDefaultProjectSlotX(newSlot.width_mm);

    const idx = projectSlots.findIndex((s) => s.id === addTargetProjectSlotId);
    if (idx >= 0) projectSlots[idx] = newSlot; else projectSlots.push(newSlot);
    markProjectDirty();

    exitProjectSlotConfig();
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
    selectedProjectSlotId = newSlot.id;
    renderProjectCanvas();
    return;
  }

  // Modo "Composição" (ver startCompositionSlotConfig, mais abaixo neste
  // arquivo): em vez de gravar em order_items/cartItems (isso é um PEDIDO),
  // guarda a configuração completa deste módulo só na memória, no slot da
  // composição, e volta pra aba "Composição" já mostrando o próximo slot
  // vazio à direita. Nada é salvo no banco aqui — a composição hoje é só
  // uma ferramenta de visualização, não vira pedido sozinha.
  if (addTargetSlotIndex !== null) {
    let thumbnail_data_url = null;
    try { thumbnail_data_url = await trimTransparentPng(Viewer3D.snapshot()); } catch (e) { /* sem 3D, sem miniatura */ }
    const effectivePieces = pieces.filter((p) => !p.client_optional || selectedOptionalComponentIds.has(p.id));
    // id/stack_on_id (empilhamento, ver renderCompositionSlots/addStackOnId):
    // sobrescrevendo um slot JÁ preenchido (edição, nem insert nem stack —
    // ver editCompositionSlot), preserva o id/stack_on_id que esse slot já
    // tinha, senão qualquer módulo empilhado em cima dele ficaria órfão
    // (stack_on_id apontando pra um id que sumiu). Em qualquer outro caso
    // (slot vazio do final, insert lado-a-lado, ou stack em cima de outro)
    // é sempre um slot NOVO: id novo, stack_on_id = addStackOnId (setado só
    // pelo botão "Colocar em cima", null nos outros dois).
    const existingSlot = !compositionInsertMode ? compositionSlots[addTargetSlotIndex] : null;
    // Garante que um valor digitado mas ainda não confirmado (sem Enter/blur
    // — ver applyFloorHeightInput, só roda no 'change') não fique de fora se
    // o cliente for direto pro botão "Adicionar" com o campo ainda focado.
    if (typeof applyFloorHeightInput === 'function') applyFloorHeightInput();
    const floor_height_mm = currentFloorHeightMm;
    const newSlot = {
      id: existingSlot ? existingSlot.id : newSlotId(),
      stack_on_id: existingSlot ? (existingSlot.stack_on_id || null) : addStackOnId,
      floor_height_mm,
      module: currentModule,
      pieces: effectivePieces,
      colorsByRole: lastItemResult.colorsByRole,
      selectedColors: lastItemResult.selectedColors,
      pieceColorOverrides: lastItemResult.pieceColorOverrides,
      hingeModel: lastItemResult.hingeModel,
      slideModel: lastItemResult.slideModel,
      width_mm: lastItemResult.width_mm,
      height_mm: lastItemResult.height_mm,
      depth_mm: lastItemResult.depth_mm,
      shelfQuantities: lastItemResult.shelfQuantities,
      dimOverrides: lastItemResult.dimOverrides,
      selectedOptionalIds: lastItemResult.selectedOptionalIds,
      result: lastItemResult.result,
      thumbnail_data_url
    };
    // Modo INSERIR (ver startCompositionSlotConfig/renderCompositionSlots,
    // divisor "+" entre cards) — abre espaço nessa posição em vez de
    // sobrescrever o que já estava lá; modo normal (editar um slot já
    // preenchido OU adicionar no slot vazio do final) sobrescreve na mesma
    // posição, como sempre.
    if (compositionInsertMode) {
      compositionSlots.splice(addTargetSlotIndex, 0, newSlot);
    } else {
      compositionSlots[addTargetSlotIndex] = newSlot;
    }
    compositionInsertMode = false;
    exitCompositionSlotConfig();
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
    renderCompositionSlots();
    return;
  }

  try {
    const orderId = await ensureDraftOrder();
    let thumbnail_data_url = null;
    try { thumbnail_data_url = await trimTransparentPng(Viewer3D.snapshot()); } catch (e) { /* sem 3D, sem miniatura */ }

    const payload = {
      order_id: orderId,
      module_id: currentModule.id,
      module_name: currentModule.name,
      module_description: currentModule.description || null,
      selected_colors: lastItemResult.selectedColors,
      hinge_model_id: lastItemResult.hingeModel ? lastItemResult.hingeModel.id : null,
      slide_model_id: lastItemResult.slideModel ? lastItemResult.slideModel.id : null,
      width_mm: lastItemResult.width_mm,
      height_mm: lastItemResult.height_mm,
      depth_mm: lastItemResult.depth_mm,
      shelf_quantities: lastItemResult.shelfQuantities,
      dim_overrides: lastItemResult.dimOverrides,
      piece_color_overrides: buildPieceColorOverridesSnapshot(lastItemResult.pieceColorOverrides),
      selected_optional_component_ids: lastItemResult.selectedOptionalIds,
      // Configuração completa sempre adiciona 1 unidade por vez — quantidade
      // >1 só existia no atalho "Adicionar módulo" da vitrine (quickAddModule),
      // removido 2026-07-19 (todo módulo precisa passar pela configuração
      // completa antes de entrar no carrinho agora).
      quantity: 1,
      unit_price: lastItemResult.result.total,
      total_price: lastItemResult.result.total,
      breakdown: lastItemResult.result.breakdown,
      thumbnail_data_url,
      sort_order: cartItems.length
    };

    const { data, error } = await supabaseClient.from('order_items').insert(payload).select().single();
    if (error) throw error;
    cartItems.push(data);
    renderCart();

    // Reseta o configurador pra escolher o PRÓXIMO módulo do zero.
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
    viewer3dNeedsRefit = true;
  } catch (err) {
    cartError.textContent = I18n.t('cart.add_error', { msg: err.message });
    cartError.style.display = 'block';
  }
});

async function removeCartItem(itemId) {
  try {
    const { error } = await supabaseClient.from('order_items').delete().eq('id', itemId);
    if (error) throw error;
    cartItems = cartItems.filter((it) => it.id !== itemId);
    renderCart();
  } catch (err) {
    const cartError = document.getElementById('po-cart-error');
    cartError.textContent = I18n.t('cart.remove_error', { msg: err.message });
    cartError.style.display = 'block';
  }
}

// "Revisar pedido" (pedido do usuário 2026-07-29) — leva a tela do pedido
// (#po-order-detail-section, a mesma que "Meus Pedidos" abre pra pedidos já
// salvos) pro pedido ainda em RASCUNHO sendo montado agora. Antes só dava
// pra chegar nessa tela depois que o antigo botão "Salvar pedido" mudava o
// status pra 'submitted' — esse botão não existe mais (ver ensureDraftOrder/
// renderCart), então essa é a ÚNICA porta de entrada agora. openOrderDetail
// não filtra por status (busca a linha de "orders" direto pelo id), então
// funciona igual pra 'draft' — a diferença toda fica em renderOrderDetail
// (Aprovar Pedido continua exigindo os 5 campos preenchidos, e é isso que
// agora faz o papel de "salvar" o pedido pra valer, ver order_detail_
// approval_screen).
function reviewDraftOrder() {
  if (!currentDraftOrderId) return;
  const myOrdersBtn = document.querySelector('.portal-tab-btn[data-tab="po-tab-my-orders"]');
  if (myOrdersBtn) myOrdersBtn.click();
  openOrderDetail(currentDraftOrderId);
}
const cartReviewBtn = document.getElementById('po-cart-review-btn');
if (cartReviewBtn) cartReviewBtn.addEventListener('click', reviewDraftOrder);

// "Continuar comprando" (pedido do usuário 2026-07-29: "abre o carrinho e vai
// pra tela de new quote pra selecionar poder acrescentar outros itens...
// isso se nao tiver aprovado ainda") — o inverso de reviewDraftOrder: sai da
// tela do pedido de volta pro catálogo, mas com ESTE pedido (o que estava
// aberto — pode ser o rascunho atual OU um "Pendente" antigo revisitado via
// Meus Pedidos) virando o rascunho ATIVO, pra qualquer módulo adicionado
// dali em diante entrar nele (mesmo order_id), não criar um pedido separado.
// isLocked já garante que o botão nem aparece pra pedido aprovado/pago/
// entregue (ver renderOrderDetail), mas o guard de alterações não salvas
// (orderDetailHasUnsavedChanges) roda aqui TAMBÉM, igual ao "Voltar" — senão
// sairia sem avisar igual ao bug que motivou aquele fix.
async function continueShoppingOnOrder() {
  if (!currentOrderDetail) return;
  if (orderDetailHasUnsavedChanges() && !confirm(I18n.t('order_detail.unsaved_changes_confirm'))) return;
  const orderId = currentOrderDetail.order.id;
  currentDraftOrderId = orderId;
  // Guarda o status REAL (pode ser 'submitted' num pedido antigo revisitado)
  // — ver comentário na declaração de currentDraftOrderStatus: isso é o que
  // impede "Novo Pedido" de apagar um pedido que já existia antes desta ida
  // ao catálogo.
  currentDraftOrderStatus = currentOrderDetail.order.status;
  const { data: items } = await supabaseClient
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('sort_order');
  cartItems = items || [];
  renderCart();
  // Fecha a tela do pedido igual ao "Voltar" faria (sem chamar
  // closeOrderDetail() inteiro — não queremos voltar pra lista "Meus
  // Pedidos", e sim ir direto pro catálogo) — já confirmamos acima, então
  // esconder a seção agora evita o guard de troca de aba perguntar de novo.
  currentOrderDetail = null;
  document.getElementById('po-order-detail-section').style.display = 'none';
  const newOrderTabBtn = document.querySelector('.portal-tab-btn[data-tab="po-tab-new-order"]');
  if (newOrderTabBtn) newOrderTabBtn.click();
}
const continueShoppingBtnEl = document.getElementById('po-order-detail-continue-shopping-btn');
if (continueShoppingBtnEl) continueShoppingBtnEl.addEventListener('click', continueShoppingOnOrder);

// "Salvar Pedido" (pedido do usuário 2026-07-29: "nao opcao de salvar ordem
// pra comecar uma nova, so de approvar a ordem. esse aprove deve ser ultima
// coisa. preciso um salvar pra liberar o carrinho novo") — finaliza o
// pedido como um registro de verdade ('draft' -> 'submitted', ver
// migration_017), SEM exigir os 5 campos nem travar a tela (diferente de
// "Aprovar Pedido", que continua o ÚLTIMO passo — só quando o cliente
// decidir aprovar de vez, isLocked continua travando tudo só nesse ponto).
// Fecha o ciclo que faltava em "Novo Pedido" (ver startNewOrder logo
// abaixo): antes, escolher "salvar" lá levava pra reviewDraftOrder() e não
// tinha NENHUM jeito de sair dali sem aprovar — agora tem este botão.
async function saveOrderAndFreeCart() {
  if (!currentOrderDetail) return;
  const errorEl = document.getElementById('po-order-detail-error');
  const statusEl = document.getElementById('po-order-detail-save-order-status');
  const btn = document.getElementById('po-order-detail-save-order-btn');
  if (errorEl) errorEl.style.display = 'none';
  if (btn) btn.disabled = true;
  try {
    const orderId = currentOrderDetail.order.id;
    // Só muda o status de verdade se ainda for 'draft' — um 'submitted'
    // revisitado (via Meus Pedidos) já é um registro real, não precisa (nem
    // deve) reescrever submitted_at de novo.
    if (currentOrderDetail.order.status === 'draft') {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ status: 'submitted', submitted_at: new Date().toISOString() })
        .eq('id', orderId)
        .select()
        .single();
      if (error) throw error;
      currentOrderDetail.order = data;
    }
    // Libera o carrinho — se este pedido era o rascunho ativo, desanexa
    // (mesmo raciocínio de currentDraftOrderStatus/discardCurrentDraftOrder,
    // só que aqui NADA é apagado: o pedido continua intacto, só para de ser
    // "o carrinho" — a próxima adição no catálogo cria um rascunho NOVO).
    if (currentDraftOrderId === orderId) {
      currentDraftOrderId = null;
      currentDraftOrderStatus = null;
      cartItems = [];
      renderCart();
    }
    renderOrderDetail(); // badge/status atualiza pra "Pendente"
    if (statusEl) {
      statusEl.textContent = I18n.t('order_detail.order_saved');
      statusEl.style.display = 'block';
      setTimeout(() => { statusEl.style.display = 'none'; statusEl.textContent = ''; }, 4000);
    }
  } catch (err) {
    if (errorEl) { errorEl.textContent = I18n.t('order_detail.save_order_error', { msg: err.message || String(err) }); errorEl.style.display = 'block'; }
  } finally {
    if (btn) btn.disabled = false;
  }
}
const saveOrderBtnEl = document.getElementById('po-order-detail-save-order-btn');
if (saveOrderBtnEl) saveOrderBtnEl.addEventListener('click', saveOrderAndFreeCart);

// "Novo Pedido" (pedido do usuário 2026-07-29: "preciso um botao novo
// pedido. zera o pedido anteriro (pede se quer salvar) e comeca do zero") —
// 2 confirmações em sequência (só confirm() nativo, mesmo padrão do resto do
// portal, sem modal customizado): primeiro pergunta se quer SALVAR/revisar o
// pedido atual antes (OK leva pra "Revisar pedido" — reviewDraftOrder — o
// cliente decide lá se aprova ou volta e clica "Novo Pedido" de novo
// depois); só se recusar salvar é que confirma de novo, agora no tom de
// "tem certeza" antes de zerar pra valer (evita clique acidental derrubando
// um pedido em andamento).
function startNewOrder() {
  if (cartItems.length === 0) return; // nada pra zerar (guard extra — o botão já nem aparece nesse caso)
  if (confirm(I18n.t('cart.new_order_save_confirm'))) {
    reviewDraftOrder();
    return;
  }
  if (!confirm(I18n.t('cart.new_order_discard_confirm'))) return;
  discardCurrentDraftOrder();
}

// Some com o pedido atual de vez (chamado só depois de confirmado acima) —
// só APAGA a linha de "orders" (cascade em order_items) quando ainda é um
// 'draft' de verdade: um pedido 'submitted' revisitado via "Continuar
// comprando" (continueShoppingOnOrder) é um pedido JÁ EXISTENTE antes desta
// sessão e não pode ser destruído por aqui — só desanexa (o cliente ainda
// enxerga ele intacto em "Meus Pedidos"). Sem essa distinção, um 'draft'
// abandonado (não apagado, só desanexado em memória) voltaria sozinho no
// próximo login (loadDraftOrderIfAny pega o 'draft' mais recente), contendo
// justamente os itens que o cliente pediu pra "zerar".
async function discardCurrentDraftOrder() {
  const orderIdToDiscard = currentDraftOrderId;
  const wasFreshDraft = currentDraftOrderStatus === 'draft';
  currentDraftOrderId = null;
  currentDraftOrderStatus = null;
  cartItems = [];
  renderCart();
  if (wasFreshDraft && orderIdToDiscard) {
    try { await supabaseClient.from('orders').delete().eq('id', orderIdToDiscard); }
    catch (e) { /* best-effort — o carrinho já foi zerado na tela de qualquer forma */ }
  }
}
const cartNewOrderBtn = document.getElementById('po-cart-new-order-btn');
if (cartNewOrderBtn) cartNewOrderBtn.addEventListener('click', startNewOrder);

// Retoma um pedido em rascunho (se o cliente saiu no meio e voltou depois)
// — carrega os itens já adicionados de volta pro carrinho visível. Nome do
// cliente/PO desse rascunho (se já preenchidos via a tela do pedido numa
// visita anterior) não precisam ser repostos em campo nenhum aqui — a barra
// lateral não tem mais esses campos, eles só aparecem de novo se o cliente
// clicar "Revisar pedido" e abrir a tela do pedido.
async function loadDraftOrderIfAny() {
  const { data: draftOrders, error } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('client_user_id', currentUser.id)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !draftOrders || draftOrders.length === 0) return;
  currentDraftOrderId = draftOrders[0].id;
  currentDraftOrderStatus = 'draft';
  const { data: items } = await supabaseClient
    .from('order_items')
    .select('*')
    .eq('order_id', currentDraftOrderId)
    .order('sort_order');
  cartItems = items || [];
  renderCart();
}

// ---------- Meus pedidos (histórico de pedidos salvos) ----------

let myOrdersLoaded = false;

// Mapeamento de status -> texto mostrado no badge. 'submitted' é chamado de
// "Pendente" na interface (pedido do usuário 2026-07-29 — era "Aberta"; o
// status no banco continua o mesmo, só o rótulo mudou); 'approved'
// ("Aprovada") trava os campos de contato/entrega (ver renderOrderDetail).
// 'paid'/'delivered' (migration 059) são os 2 estágios seguintes — sequência
// Pendente → Aprovada → Paga → Entregue, sempre nessa ordem.
function orderStatusLabel(status) {
  if (status === 'draft') return I18n.t('my_orders.status_draft');
  if (status === 'submitted') return I18n.t('my_orders.status_submitted');
  if (status === 'approved') return I18n.t('my_orders.status_approved');
  if (status === 'paid') return I18n.t('my_orders.status_paid');
  if (status === 'delivered') return I18n.t('my_orders.status_delivered');
  // 'saved' (migration 052) — só existe pro Plano de Corte ("Salvar", não
  // "Aprovar"): fica no "Meus Pedidos" do cliente, mas nunca aparece na
  // lista de Pedidos do admin (não filtra por 'saved' lá — ver
  // renderOrdersList em admin.js), ou seja, não vai pra fábrica.
  if (status === 'saved') return I18n.t('my_orders.status_saved');
  return status;
}

async function loadMyOrders() {
  const container = document.getElementById('po-orders-list');
  const errorEl = document.getElementById('po-orders-error');
  errorEl.style.display = 'none';
  container.innerHTML = `<p class="hint">${I18n.t('my_orders.loading')}</p>`;
  try {
    // 'submitted' (Pendente), 'approved' (Aprovada), 'paid' (Paga) e
    // 'delivered' (Entregue, migration 059) aparecem aqui — só 'draft'
    // (carrinho em andamento, ainda não salvo) fica de fora.
    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('client_user_id', currentUser.id)
      // 'saved' (migration 052) — pedido de Plano de Corte salvo mas não
      // aprovado ainda; precisa aparecer aqui pro cliente (é o "Meus
      // Pedidos" DELE), mesmo não aparecendo na lista do admin.
      .in('status', ['submitted', 'saved', 'approved', 'paid', 'delivered'])
      .order('submitted_at', { ascending: false });
    if (error) throw error;

    if (!orders || orders.length === 0) {
      container.innerHTML = `<p class="hint">${I18n.t('my_orders.none_yet')}</p>`;
      myOrdersLoaded = true;
      return;
    }

    // Pedido de módulo (order_items) e pedido de Plano de Corte
    // (cutting_list_items, migration 051) vivem em tabelas diferentes —
    // separa os ids por order_type antes de buscar, senão um pedido de
    // plano de corte apareceria com total $0 (sem order_items nenhum).
    const moduleOrderIds = orders.filter((o) => o.order_type !== 'cutting_list').map((o) => o.id);
    const cutlistOrderIds = orders.filter((o) => o.order_type === 'cutting_list').map((o) => o.id);
    const [{ data: allItems, error: itemsError }, { data: allCutlistItems, error: cutlistItemsError }] = await Promise.all([
      moduleOrderIds.length
        ? supabaseClient.from('order_items').select('*').in('order_id', moduleOrderIds).order('sort_order')
        : Promise.resolve({ data: [] }),
      cutlistOrderIds.length
        ? supabaseClient.from('cutting_list_items').select('*').in('order_id', cutlistOrderIds).order('sort_order')
        : Promise.resolve({ data: [] })
    ]);
    if (itemsError) throw itemsError;
    if (cutlistItemsError) throw cutlistItemsError;

    const itemsByOrder = {};
    (allItems || []).forEach((it) => {
      if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
      itemsByOrder[it.order_id].push(it);
    });
    const cutlistItemsByOrder = {};
    (allCutlistItems || []).forEach((it) => {
      if (!cutlistItemsByOrder[it.order_id]) cutlistItemsByOrder[it.order_id] = [];
      cutlistItemsByOrder[it.order_id].push(it);
    });

    // Clicar no cartão (fora do botão de PDF) abre a tela grande do pedido
    // (ver openOrderDetail/renderOrderDetail, migration 047) — substitui o
    // antigo expand-inline (pedido do usuário 2026-07-19: "abre essa tela").
    // Pedido de Plano de Corte abre uma tela read-only diferente (sem PDF
    // nesta versão — ver openCutlistOrderDetail).
    container.innerHTML = orders.map((o) => {
      const isCutlist = o.order_type === 'cutting_list';
      const items = isCutlist ? (cutlistItemsByOrder[o.id] || []) : (itemsByOrder[o.id] || []);
      const total = items.reduce((sum, it) => sum + Number(it.total_price || 0), 0);
      const date = o.submitted_at ? new Date(o.submitted_at).toLocaleString(currentLocale()) : '';
      // Título do cartão: PO e nome do cliente AGORA os dois em destaque
      // (pedido do usuário 2026-07-29: "quero ver o nome da PO em destaque
      // nessa listagem de pedidos, nome do cliente tambem") — antes só um
      // dos dois aparecia (PO tinha prioridade, cliente só entrava se não
      // tivesse PO). Sem nenhum dos dois, cai no fallback de sempre (data).
      const title = o.po_name || o.client_name || I18n.t('my_orders.order_of', { date });
      // Segunda linha: cliente (se a PO já apareceu no título) + data — só
      // mostra o que ainda não apareceu no título, pra não repetir o mesmo
      // nome duas vezes quando só um dos dois existe.
      const subtitleParts = [];
      if (o.po_name && o.client_name) subtitleParts.push(o.client_name);
      if (date) subtitleParts.push(date);
      const subtitle = subtitleParts.join(' — ');
      return `
        <div class="portal-order-card portal-order-card-clickable" data-order-id="${o.id}">
          <div class="portal-order-header">
            <div class="portal-order-title">
              <strong>${title}</strong>
              ${subtitle ? `<span class="hint">— ${subtitle}</span>` : ''}
              <span class="badge">${orderStatusLabel(o.status)}</span>
              ${isCutlist ? `<span class="badge" data-i18n="admin.orders_type_cutting_list">${I18n.t('admin.orders_type_cutting_list')}</span>` : ''}
            </div>
            <span class="portal-order-total">${formatMoney(total)}</span>
          </div>
          <div class="portal-order-actions">
            <button type="button" class="secondary portal-order-view-btn" data-order-id="${o.id}">${I18n.t('my_orders.view_details')}</button>
            ${isCutlist ? '' : `<button type="button" class="secondary portal-order-pdf-btn" data-order-id="${o.id}">${I18n.t('my_orders.generate_pdf')}</button>`}
          </div>
        </div>
      `;
    }).join('');

    const openDetailFor = (orderId) => {
      const order = orders.find((o) => o.id === orderId);
      if (!order) return;
      if (order.order_type === 'cutting_list') openCutlistOrderDetail(order, cutlistItemsByOrder[order.id] || []);
      else openOrderDetail(orderId);
    };
    container.querySelectorAll('.portal-order-card-clickable').forEach((card) => {
      card.addEventListener('click', () => openDetailFor(card.dataset.orderId));
    });
    container.querySelectorAll('.portal-order-view-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => { ev.stopPropagation(); openDetailFor(btn.dataset.orderId); });
    });
    container.querySelectorAll('.portal-order-pdf-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation(); // não deixa "vazar" pro card e abrir a tela do pedido junto
        const order = orders.find((o) => o.id === btn.dataset.orderId);
        generateOrderPDF(order, itemsByOrder[btn.dataset.orderId] || []);
      });
    });

    myOrdersLoaded = true;
  } catch (err) {
    errorEl.textContent = I18n.t('my_orders.load_error', { msg: err.message });
    errorEl.style.display = 'block';
    container.innerHTML = '';
  }
}

// ---------- Tela do pedido (migration 047, 2026-07-19) ----------
// Aberta a partir de "Meus Pedidos" — mostra cada módulo configurado
// (imagem grande, medidas, cores, descrição, preço) só pra VISUALIZAR;
// produto não se edita direto aqui (ver editOrderItem pro botão "Editar").
// "Aprovar Pedido" exige nome do cliente/OP/telefone/e-mail/endereço de
// entrega preenchidos e trava a tela pra sempre (sem fluxo de reabertura
// nesta versão — confirmado via AskUserQuestion).

let currentOrderDetail = null; // { order, items } do pedido aberto agora nesta tela, null quando fechada

async function openOrderDetail(orderId) {
  const listErrorEl = document.getElementById('po-orders-error');
  listErrorEl.style.display = 'none';
  try {
    const [{ data: order, error }, { data: items, error: itemsError }] = await Promise.all([
      supabaseClient.from('orders').select('*').eq('id', orderId).single(),
      supabaseClient.from('order_items').select('*').eq('order_id', orderId).order('sort_order')
    ]);
    if (error) throw error;
    if (itemsError) throw itemsError;

    // Bolinha de cor (pedido do usuário 2026-07-19: "quero uma bolinha das
    // cores selecionadas, em cada modelo") — selected_colors é um snapshot
    // congelado no order_item (só role_name/color_name, pra nunca mudar
    // mesmo que a cor seja renomeada depois), sem a APARÊNCIA visual
    // (swatch_hex/texture_url). Busca o registro de "colors" de verdade por
    // color_id no catálogo atual só pra desenhar a bolinha — funciona
    // retroativo em pedidos antigos também (não depende de re-salvar nada).
    const colorIds = [...new Set((items || []).flatMap((it) => (it.selected_colors || []).map((c) => c.color_id)).filter(Boolean))];
    const { data: colorsData } = colorIds.length
      ? await supabaseClient.from('colors').select('id, swatch_hex, texture_url').in('id', colorIds)
      : { data: [] };
    const colorById = new Map((colorsData || []).map((c) => [c.id, c]));

    currentOrderDetail = { order, items: items || [], colorById };
    // Reseta a aba ativa E qualquer troca de cor pendente (ver
    // orderDetailPendingColorChanges) — cada pedido tem seus próprios
    // papéis de cor disponíveis (ver renderOrderDetailColorPanel), não faz
    // sentido herdar aba ou pendência do pedido anterior.
    orderDetailColorActiveTabRoleId = null;
    orderDetailPendingColorChanges = {};
    document.getElementById('po-orders-list-panel').style.display = 'none';
    document.getElementById('po-order-detail-section').style.display = 'block';
    renderOrderDetail();
  } catch (err) {
    listErrorEl.textContent = I18n.t('order_detail.load_error', { msg: err.message });
    listErrorEl.style.display = 'block';
  }
}

// Aviso de alterações não salvas na tela do pedido (pedido do usuário
// 2026-07-29: "quando dou back, ele nao pede pra salvar alteracoes, nem de
// cor nem de quantidade"; ampliado no mesmo dia — "nao ta salvando
// informacoes do cabecalho do pedido": os campos de nome/OP/telefone/e-mail/
// endereço SÓ gravam quando o cliente clica "Salvar informações" — clicar
// "Voltar" sem clicar nele antes perdia a edição inteira, silenciosamente)
// — mesmo espírito do guard da aba Projetos (ver projectDirty/
// markProjectDirty), mas aqui NADA fica pendente de verdade em memória por
// muito tempo (cor em massa fica em orderDetailPendingColorChanges até
// "Alterar cores"; quantidade grava sozinha no 'change' do campo) — então em
// vez de um flag dedicado, checa na hora: (1) alguma troca de cor em massa
// ainda não aplicada, (2) algum campo de quantidade com valor digitado na
// tela diferente do que está realmente salvo no item, e (3) algum campo do
// cabeçalho (nome/OP/telefone/e-mail/endereço) com valor digitado diferente
// do que está gravado em currentOrderDetail.order. (1)/(2) cobrem tanto
// "ainda nem saiu do campo" quanto "saiu do campo mas o save falhou" (erro de
// rede/RLS); (3) é sempre assim, já que o cabeçalho não tem auto-save nenhum.
function orderDetailHasUnsavedChanges() {
  if (Object.keys(orderDetailPendingColorChanges).length > 0) return true;
  if (!currentOrderDetail) return false;
  const qtyDirty = currentOrderDetail.items.some((it) => {
    const input = document.getElementById(`po-order-item-qty-${it.id}`);
    if (!input) return false;
    const domQty = Math.max(1, Math.round(Number(input.value)) || 1);
    return domQty !== (Number(it.quantity) || 1);
  });
  if (qtyDirty) return true;
  return orderDetailHeaderFieldsDirty();
}

// Compara o que está digitado nos campos do cabeçalho AGORA contra o que
// currentOrderDetail.order tem gravado de verdade (atualizado só pelos
// botões "Salvar informações"/"Aprovar Pedido", ver seus handlers) — string
// vazia e null contam como "iguais" (o campo nunca foi preenchido dos dois
// lados), senão qualquer pedido aberto sem telefone/endereço preenchidos já
// nasceria "sujo" à toa.
function orderDetailHeaderFieldsDirty() {
  if (!currentOrderDetail) return false;
  const order = currentOrderDetail.order;
  const pairs = [
    ['po-order-detail-client-name', order.client_name],
    ['po-order-detail-po-name', order.po_name],
    ['po-order-detail-phone', order.client_phone],
    ['po-order-detail-email', order.client_email],
    ['po-order-detail-address', order.delivery_address]
  ];
  return pairs.some(([id, saved]) => {
    const el = document.getElementById(id);
    if (!el) return false;
    return el.value.trim() !== (saved || '');
  });
}

// Volta pra lista — recarrega ela (myOrdersLoaded=false força loadMyOrders a
// buscar de novo) porque aprovar o pedido muda o status/badge exibido.
function closeOrderDetail() {
  currentOrderDetail = null;
  document.getElementById('po-order-detail-section').style.display = 'none';
  document.getElementById('po-orders-list-panel').style.display = 'block';
  myOrdersLoaded = false;
  loadMyOrders();
}

document.getElementById('po-order-detail-back-btn').addEventListener('click', () => {
  if (orderDetailHasUnsavedChanges() && !confirm(I18n.t('order_detail.unsaved_changes_confirm'))) return;
  closeOrderDetail();
});

function renderOrderDetail() {
  if (!currentOrderDetail) return;
  const { order, items } = currentOrderDetail;
  // isLocked cobre os 3 estágios "pra frente" (Aprovada/Paga/Entregue,
  // migration 059) — antes só existia 'approved' como estágio final, então
  // "isApproved" bastava; com Pago/Entregue vindo DEPOIS de aprovado, usar só
  // isApproved destravaria os campos de novo num pedido já pago/entregue
  // (bug que corrigimos aqui: os 3 têm que travar igual).
  const isApproved = order.status === 'approved';
  const isPaid = order.status === 'paid';
  const isDelivered = order.status === 'delivered';
  const isLocked = isApproved || isPaid || isDelivered;

  document.getElementById('po-order-detail-title').textContent = order.po_name || order.client_name || I18n.t('pdf.order_fallback');
  document.getElementById('po-order-detail-status-badge').textContent = orderStatusLabel(order.status);

  const fieldsWrap = document.getElementById('po-order-detail-fields');
  fieldsWrap.classList.toggle('readonly', isLocked);
  const clientNameInput = document.getElementById('po-order-detail-client-name');
  const poNameInput = document.getElementById('po-order-detail-po-name');
  const phoneInput = document.getElementById('po-order-detail-phone');
  const emailInput = document.getElementById('po-order-detail-email');
  const addressInput = document.getElementById('po-order-detail-address');
  clientNameInput.value = order.client_name || '';
  poNameInput.value = order.po_name || '';
  phoneInput.value = order.client_phone || '';
  emailInput.value = order.client_email || '';
  addressInput.value = order.delivery_address || '';
  [clientNameInput, poNameInput, phoneInput, emailInput, addressInput].forEach((input) => { input.disabled = isLocked; });

  // A tela inteira é reconstruída (innerHTML) a cada render — qualquer
  // seletor de cor por módulo que estivesse aberto não existe mais no DOM
  // novo, então reseta o controle pra não ficar apontando pra um id morto.
  orderItemColorPickerOpenId = null;

  const itemsWrap = document.getElementById('po-order-detail-items');
  itemsWrap.innerHTML = items.map((it, idx) => renderOrderDetailItemCard(it, idx, isLocked, currentOrderDetail.colorById)).join('');
  itemsWrap.querySelectorAll('.po-order-item-color-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleOrderItemColorPicker(btn.dataset.itemId, btn.dataset.roleId, btn.dataset.pickerId));
  });
  itemsWrap.querySelectorAll('.po-order-item-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => editOrderItem(order, items.find((it) => it.id === btn.dataset.itemId)));
  });
  itemsWrap.querySelectorAll('.po-order-item-remove-btn').forEach((btn) => {
    btn.addEventListener('click', () => removeOrderDetailItem(btn.dataset.itemId));
  });
  // Quantidade (pedido do usuário 2026-07-29) — 'change' (não 'input') pra só
  // gravar quando o cliente termina de mexer (sai do campo ou aperta Enter),
  // igual ao padrão de "Salvar informações": não fica batendo no banco a cada
  // dígito digitado.
  itemsWrap.querySelectorAll('.po-order-item-qty-input').forEach((input) => {
    input.addEventListener('change', () => updateOrderItemQuantity(input.dataset.itemId, input.value));
  });

  // Recorta a margem transparente de novo, AGORA nesta tela (pedido do
  // usuário 2026-07-19: "ainda esta com desenhos muito distantes") —
  // trimTransparentPng já roda uma vez no momento em que o item é
  // adicionado/editado (ver saveOrderItemEdit/po-add-item-btn), mas pedidos
  // salvos ANTES dessa peça existir (ou cuja captura sobrou com bastante
  // margem transparente) ficam com o desenho pequeno boiando no meio do
  // quadro grande (.po-order-item-image). Reaplicar aqui, na EXIBIÇÃO, é
  // 100% cosmético e retroativo — não mexe no 3D/câmera (viewer3d.js
  // intocado), só reprocessa o PNG já salvo; roda em background e troca o
  // src quando terminar (o cliente já vê a imagem original enquanto isso).
  itemsWrap.querySelectorAll('.po-order-item-image[data-raw-src]').forEach((imgEl) => {
    const raw = imgEl.dataset.rawSrc;
    trimTransparentPng(raw).then((trimmed) => { if (trimmed) imgEl.src = trimmed; });
  });

  const total = items.reduce((sum, it) => sum + Number(it.total_price || 0), 0);
  document.getElementById('po-order-detail-total').textContent = formatMoney(total);
  updateOrderDetailVolumeWeight(items);

  // Aprovar só enquanto NADA foi decidido ainda (Pendente) — some a partir
  // de Aprovada em diante (isLocked cobre Aprovada/Paga/Entregue), não só
  // quando já está Aprovada como era antes de Pago/Entregue existirem.
  const approveBtn = document.getElementById('po-order-detail-approve-btn');
  const approveHint = document.getElementById('po-order-detail-approve-hint');
  approveBtn.style.display = isLocked ? 'none' : 'block';
  approveHint.style.display = isLocked ? 'none' : 'block';

  // "Salvar Pedido" (pedido do usuário 2026-07-29) — mesma trava do "Aprovar
  // Pedido" (isLocked): uma vez aprovado não tem mais "carrinho ativo" pra
  // liberar. Some SÓ quando o pedido já foi enviado pra frente (submitted em
  // diante) — igual às outras ações desta faixa.
  const saveOrderBtn = document.getElementById('po-order-detail-save-order-btn');
  const saveOrderStatus = document.getElementById('po-order-detail-save-order-status');
  if (saveOrderBtn) saveOrderBtn.style.display = isLocked ? 'none' : 'block';
  if (saveOrderStatus) saveOrderStatus.style.display = 'none';

  // "Continuar comprando" (pedido do usuário 2026-07-29) — mesma trava do
  // "Aprovar Pedido" (isLocked): não faz sentido acrescentar item num pedido
  // já decidido.
  const continueShoppingBtn = document.getElementById('po-order-detail-continue-shopping-btn');
  if (continueShoppingBtn) continueShoppingBtn.style.display = isLocked ? 'none' : 'block';

  // "Salvar informações" (pedido do usuário 2026-07-29: "quero um botao
  // salvar informacoes, para poder voltar e manter as informacoes salvas,
  // pra fechar posteriormente") — grava nome/OP/telefone/e-mail/endereço SEM
  // exigir os 5 campos nem travar a tela (diferente de "Aprovar Pedido");
  // só faz sentido enquanto os campos ainda estão editáveis.
  const saveInfoBtn = document.getElementById('po-order-detail-save-info-btn');
  const saveInfoStatus = document.getElementById('po-order-detail-save-info-status');
  if (saveInfoBtn) saveInfoBtn.style.display = isLocked ? 'none' : 'inline-block';
  if (saveInfoStatus) saveInfoStatus.textContent = '';

  // Pago/Entregue (migration 059) — sequência Pendente → Aprovada → Paga →
  // Entregue, sempre nessa ordem: só mostra o botão do PRÓXIMO passo válido
  // pro status atual (cliente E admin podem marcar, ver AskUserQuestion).
  const markPaidBtn = document.getElementById('po-order-detail-mark-paid-btn');
  const markDeliveredBtn = document.getElementById('po-order-detail-mark-delivered-btn');
  const deliveredHint = document.getElementById('po-order-detail-delivered-hint');
  if (markPaidBtn) markPaidBtn.style.display = isApproved ? 'block' : 'none';
  if (markDeliveredBtn) markDeliveredBtn.style.display = isPaid ? 'block' : 'none';
  if (deliveredHint) deliveredHint.style.display = isDelivered ? 'block' : 'none';

  // Painel de troca rápida de cor (ver renderOrderDetailColorPanel) — busca
  // as peças de cada módulo (DB), por isso é assíncrono; roda em paralelo,
  // não trava o resto da tela que já foi montada síncrono acima.
  renderOrderDetailColorPanel();
}

// ---------- Troca rápida de cor na tela do pedido ----------
// Pedido do usuário (2026-07-29): "quero o check list que ja esxite onde eu
// possa trocar rapidamente as cores" — mesmo padrão de abas por papel de cor
// já usado na Composição/Projetos (ver loadColorRoleGroupsForSlots, função
// genérica reaproveitada aqui igualzinho), só que os "slots" aqui são
// order_items JÁ SALVOS no banco (não objetos vivos em memória) — cada troca
// busca o hinge/slide/cores reais (mesmo padrão de editOrderItem), recalcula
// o preço (Pricing.calculateModulePrice) e grava direto via update, sem
// reabrir o configurador completo. Só disponível enquanto o pedido não está
// aprovado (renderOrderDetailColorPanel esconde o painel quando isApproved).
//
// Miniatura grande de cada card (thumbnail_data_url) — pedido do usuário
// (2026-07-29, feedback depois da 1ª versão): "a cor esta trocando, preco
// tambem, mas nao ta puxando a imagem que e bem importante". Esta tela não
// tem nenhum canvas 3D visível (diferente da Composição/Projetos), então a
// miniatura é regenerada num viewer ESCONDIDO, criado uma vez e reaproveitado
// (ver getOrderDetailHiddenViewer/recolorOrderItem) — monta o módulo isolado
// (Viewer3D.buildStandaloneAssembly via buildCompositionAssemblies, mesma
// função que a Composição já usa) num canvas fora da tela
// (#po-order-detail-hidden-viewer), tira o snapshot e recorta a margem
// (trimTransparentPng) antes de salvar. Se a regeneração falhar por algum
// motivo, mantém a miniatura antiga em vez de travar a troca de cor (cor/
// preço são o que importa de verdade; a imagem é best-effort).
let orderDetailColorActiveTabRoleId = null;
let orderDetailHiddenViewer = null; // instância única, reaproveitada (ver ViewerComposition.createInstance)

function getOrderDetailHiddenViewer() {
  if (!orderDetailHiddenViewer) {
    orderDetailHiddenViewer = ViewerComposition.createInstance();
    orderDetailHiddenViewer.init('po-order-detail-hidden-viewer');
  }
  return orderDetailHiddenViewer;
}

async function loadOrderDetailColorRoleGroups() {
  if (!currentOrderDetail) return [];
  const items = currentOrderDetail.items;
  const moduleIds = [...new Set(items.map((it) => it.module_id))];
  const piecesByModule = {};
  await Promise.all(moduleIds.map(async (mid) => {
    try { piecesByModule[mid] = await loadRecursivePiecesForModule(mid); } catch (e) { piecesByModule[mid] = []; }
  }));
  // "slots" falsos só com o suficiente pra loadColorRoleGroupsForSlots
  // funcionar (ela só lê slot.pieces e slot.module.id) — reaproveita a MESMA
  // função genérica da Composição/Projetos, sem duplicar a lógica de
  // interseção de cores comuns.
  const pseudoSlots = items.map((it) => ({ module: { id: it.module_id }, pieces: piecesByModule[it.module_id] || [] }));
  return loadColorRoleGroupsForSlots(pseudoSlots);
}

// Resolve um order_item de volta pro formato "colorsByRole"/
// "pieceColorOverrides" com registros de cor de verdade (mesmo padrão de
// editOrderItem, extraído aqui pra reaproveitar sem reabrir o configurador).
async function resolveOrderItemColorContext(it) {
  const colorIds = [...new Set(
    (it.selected_colors || []).map((c) => c.color_id)
      .concat(Object.values(it.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id)))
      .filter(Boolean)
  )];
  const [{ data: colorsData }, hingeRes, slideRes] = await Promise.all([
    colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : Promise.resolve({ data: [] }),
    it.hinge_model_id ? supabaseClient.from('hinge_models').select('*').eq('id', it.hinge_model_id).single() : Promise.resolve({ data: null }),
    it.slide_model_id ? supabaseClient.from('slide_models').select('*').eq('id', it.slide_model_id).single() : Promise.resolve({ data: null })
  ]);
  const colorById = new Map((colorsData || []).map((c) => [c.id, c]));
  const colorsByRole = {};
  (it.selected_colors || []).forEach((sc) => {
    const c = colorById.get(sc.color_id);
    if (c) colorsByRole[sc.role_id] = c;
  });
  const pieceColorOverrides = {};
  Object.keys(it.piece_color_overrides || {}).forEach((pieceId) => {
    const perRole = it.piece_color_overrides[pieceId];
    const resolved = {};
    Object.keys(perRole).forEach((roleId) => {
      const c = colorById.get(perRole[roleId].color_id);
      if (c) resolved[roleId] = c;
    });
    if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
  });
  return { colorsByRole, pieceColorOverrides, hingeModel: hingeRes.data || null, slideModel: slideRes.data || null };
}

// Troca 1 OU MAIS papéis de cor NESTE item de uma vez (changes = [{roleId,
// color}, ...]), recalcula preço, tenta regenerar a miniatura (best-effort,
// ver comentário acima) e grava tudo numa única gravação. Aceitar VÁRIAS
// trocas de uma vez (não só uma) é o que permite ao painel de troca em massa
// aplicar Caixa+Porta+etc juntos com só 1 recálculo de preço + 1 render 3D +
// 1 update por item, em vez de repetir tudo isso por papel trocado — pedido
// do usuário (2026-07-29): "hoje quando troco a cor demora muito... quero um
// botao alterar cores, pra fazer os calculos depois de alterar as cores, pra
// nao ficar muito pesado". Usado por applyPendingColorChangesToOrderItems
// (troca em massa, só executa quando o cliente clica "Alterar cores") e por
// applyColorToSingleOrderItem (troca por módulo, sempre 1 change só). Lança
// erro pra quem chamou decidir como mostrar.
async function recolorOrderItem(it, changes) {
  const m = allModules.find((mm) => mm.id === it.module_id);
  if (!m) throw new Error(I18n.t('order_detail.edit_module_unavailable_error'));
  const pieces = await loadRecursivePiecesForModule(it.module_id);

  const { colorsByRole, pieceColorOverrides, hingeModel, slideModel } = await resolveOrderItemColorContext(it);
  changes.forEach(({ roleId, color }) => {
    colorsByRole[roleId] = color; // troca só os papéis escolhidos, mantém os outros como já estavam
  });

  const selectedOptionalIds = it.selected_optional_component_ids || [];
  const effectivePieces = pieces.filter((p) => !p.client_optional || selectedOptionalIds.includes(p.id));
  const result = m.is_decoration
    ? { total: 0, breakdown: [] }
    : Pricing.calculateModulePrice({
      module: m, pieces: effectivePieces, colorsByRole,
      hingeModel, slideModel,
      shelfQuantities: it.shelf_quantities || {}, dimOverrides: it.dim_overrides || {},
      pieceColorOverrides,
      width_mm: it.width_mm, height_mm: it.height_mm, depth_mm: it.depth_mm,
      markupMultiplier: pricingMarkupMultiplier
    });

  // Ordem = a mesma do cadastro (color_roles.sort_order, reordenável pelas
  // setas ▲▼ na aba "Papéis de cor" do admin) — pedido do usuário
  // (2026-07-29): "quero mesma sequencia de cores do cadastro". Antes disso
  // a ordem vinha de Object.keys(colorsByRole) (ordem de inserção do
  // objeto), que só coincidia com o cadastro por já vir assim de
  // resolveOrderItemColorContext — mas um papel novo (módulo mudou depois do
  // pedido) entraria no FIM em vez da posição certa. Ordenar aqui, sempre que
  // uma cor é trocada, garante a sequência certa pra sempre, não só quando o
  // acaso ajuda.
  const selected_colors = Object.keys(colorsByRole)
    .sort((a, b) => {
      const sa = (colorRolesCache.find((r) => r.id === a) || {}).sort_order || 0;
      const sb = (colorRolesCache.find((r) => r.id === b) || {}).sort_order || 0;
      return sa - sb;
    })
    .map((rid) => ({
      role_id: rid,
      role_name: (colorRolesCache.find((r) => r.id === rid) || {}).name || null,
      color_id: colorsByRole[rid] ? colorsByRole[rid].id : null,
      color_name: colorsByRole[rid] ? colorsByRole[rid].name : null
    }));

  // total_price precisa levar a quantidade em conta (ver
  // updateOrderItemQuantity/pedido do usuário 2026-07-29: "quero opcao de
  // quantidade") — sem isso, trocar a cor DEPOIS de mudar a quantidade
  // resetaria o total de volta pro preço de 1 unidade só.
  const qtyForTotal = Number(it.quantity) || 1;
  const updatePayload = { selected_colors, unit_price: result.total, total_price: result.total * qtyForTotal, breakdown: result.breakdown };

  // Miniatura nova, num viewer escondido (ver comentário acima) — best-
  // effort: se der qualquer problema (textura que não carrega, módulo sem
  // peça nenhuma, etc.), mantém a miniatura antiga em vez de travar a troca
  // de cor por causa só da imagem.
  try {
    const viewer = getOrderDetailHiddenViewer();
    const syntheticSlot = {
      pieces: effectivePieces,
      width_mm: it.width_mm, height_mm: it.height_mm, depth_mm: it.depth_mm,
      colorsByRole, pieceColorOverrides,
      shelfQuantities: it.shelf_quantities || {}, dimOverrides: it.dim_overrides || {}
    };
    viewer.render(buildCompositionAssemblies([syntheticSlot]), null, null);
    if (typeof Viewer3D.waitForPendingTextures === 'function') await Viewer3D.waitForPendingTextures();
    const raw = viewer.snapshot();
    const trimmed = raw ? await trimTransparentPng(raw) : null;
    if (trimmed) updatePayload.thumbnail_data_url = trimmed;
  } catch (e) { /* miniatura não regenerou — mantém a antiga, cor/preço já estão certos */ }

  const { data: updated, error } = await supabaseClient
    .from('order_items')
    .update(updatePayload)
    .eq('id', it.id)
    .select()
    .single();
  if (error) throw error;
  Object.assign(it, updated); // atualiza o item em memória (currentOrderDetail.items) com o que voltou do banco
  return it;
}

// Painel de troca em massa — ESTADO PENDENTE (pedido do usuário 2026-07-29:
// "hoje quando troco a cor demora muito... quero um botao alterar cores,
// pra fazer os calculos depois de alterar as cores, pra nao ficar muito
// pesado num ambiente tao dinamico"). Antes, clicar numa swatch aplicava
// IMEDIATAMENTE (1 recálculo de preço + 1 render 3D escondido + 1 update no
// banco POR ITEM AFETADO, pra cada clique) — lento com vários itens/papéis.
// Agora clicar só marca a escolha aqui (sem tocar no banco); o cálculo de
// verdade só roda quando o cliente clica "Alterar cores"
// (applyPendingColorChangesToOrderItems), UMA vez só, já juntando todos os
// papéis pendentes por item (ver recolorOrderItem(it, changes[])).
// { [roleId]: colorObj }
let orderDetailPendingColorChanges = {};

// Só marca a escolha (não grava nada ainda) e atualiza a UI: swatch
// selecionada na aba, e o botão "Alterar cores" aparece/mostra quantas
// trocas estão pendentes.
function stageColorRoleChange(roleId, color) {
  orderDetailPendingColorChanges[roleId] = color;
  renderOrderDetailColorPendingState();
}

function orderDetailPendingColorCount() {
  return Object.keys(orderDetailPendingColorChanges).length;
}

// Mostra/escreve o botão "Alterar cores" com a contagem de trocas pendentes
// — chamado ao marcar uma escolha nova E ao terminar de aplicar (pra
// esconder de novo, contagem zerada).
function renderOrderDetailColorPendingState() {
  const applyBtn = document.getElementById('po-order-detail-color-apply-btn');
  if (!applyBtn) return;
  const count = orderDetailPendingColorCount();
  applyBtn.style.display = count > 0 ? 'inline-block' : 'none';
  applyBtn.textContent = I18n.t('order_detail.apply_color_changes_btn', { n: count });
}

// Roda de verdade só quando o cliente clica "Alterar cores" — pra CADA item
// afetado, junta TODOS os papéis pendentes que o módulo dele usa num só
// recolorOrderItem() (1 recálculo de preço + 1 render 3D + 1 update, não um
// por papel). Mostra "Processando..." (pedido do usuário: "talvez uma
// janela de carregamento mostrando que esta processando ate finalizar") —
// desabilita o painel inteiro enquanto roda, pra não deixar clicar de novo
// no meio do processamento.
async function applyPendingColorChangesToOrderItems() {
  if (!currentOrderDetail) return;
  const pending = orderDetailPendingColorChanges;
  const roleIds = Object.keys(pending);
  if (!roleIds.length) return;
  const errorEl = document.getElementById('po-order-detail-color-error');
  if (errorEl) errorEl.style.display = 'none';
  const applyBtn = document.getElementById('po-order-detail-color-apply-btn');
  const panel = document.getElementById('po-order-detail-color-panel');
  if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = I18n.t('order_detail.applying_color_changes'); }
  if (panel) panel.classList.add('po-order-detail-color-panel-busy');

  const { items } = currentOrderDetail;
  let firstErrorMsg = null;
  for (const it of items) {
    try {
      const pieces = await loadRecursivePiecesForModule(it.module_id);
      const changes = roleIds
        .filter((rid) => pieceTreeHasColorRole(pieces, rid))
        .map((rid) => ({ roleId: rid, color: pending[rid] }));
      if (!changes.length) continue; // este módulo não usa nenhum dos papéis pendentes, pula
      await recolorOrderItem(it, changes);
    } catch (err) {
      if (!firstErrorMsg) firstErrorMsg = err.message || String(err);
    }
  }

  orderDetailPendingColorChanges = {};
  if (panel) panel.classList.remove('po-order-detail-color-panel-busy');
  if (firstErrorMsg && errorEl) {
    errorEl.textContent = I18n.t('order_detail.color_swap_error', { msg: firstErrorMsg });
    errorEl.style.display = 'block';
  }
  renderOrderDetail(); // atualiza cards/total com os preços/cores/miniaturas novos (e o próprio painel de cor, já sem pendências)
}

const orderDetailColorApplyBtn = document.getElementById('po-order-detail-color-apply-btn');
if (orderDetailColorApplyBtn) {
  orderDetailColorApplyBtn.addEventListener('click', applyPendingColorChangesToOrderItems);
}

// Troca de cor POR MÓDULO (pedido do usuário 2026-07-29: "quero uma opcao de
// trocar a cor por modulo tambem") — diferente do painel de abas acima (que
// troca o papel escolhido em TODOS os itens que o usam de uma vez), este
// afeta só o card clicado. Ver toggleOrderItemColorPicker pra abertura do
// seletor inline em cada linha de cor do card.
async function applyColorToSingleOrderItem(itemId, roleId, color) {
  if (!currentOrderDetail) return;
  const errorEl = document.getElementById('po-order-detail-color-error');
  if (errorEl) errorEl.style.display = 'none';
  const it = currentOrderDetail.items.find((x) => x.id === itemId);
  if (!it) return;
  try {
    // Troca por módulo continua IMEDIATA (não entra no estado pendente do
    // painel em massa) — é só 1 item, já é rápido o suficiente sozinho.
    await recolorOrderItem(it, [{ roleId, color }]);
    renderOrderDetail();
  } catch (err) {
    if (errorEl) { errorEl.textContent = I18n.t('order_detail.color_swap_error', { msg: err.message }); errorEl.style.display = 'block'; }
  }
}

// Abre/fecha o seletor de cor inline de UMA linha (papel de cor) de UM card
// — só um aberto por vez (fecha qualquer outro antes). Busca as cores
// cadastradas pra este módulo+papel na hora do clique (não pré-carrega pra
// todo card, evitaria N consultas desnecessárias em pedidos grandes).
let orderItemColorPickerOpenId = null; // id do container do picker aberto agora, null = nenhum

async function toggleOrderItemColorPicker(itemId, roleId, pickerId) {
  if (orderItemColorPickerOpenId && orderItemColorPickerOpenId !== pickerId) {
    const prev = document.getElementById(orderItemColorPickerOpenId);
    if (prev) { prev.style.display = 'none'; prev.innerHTML = ''; }
  }
  const el = document.getElementById(pickerId);
  if (!el) return;
  if (orderItemColorPickerOpenId === pickerId) {
    el.style.display = 'none';
    el.innerHTML = '';
    orderItemColorPickerOpenId = null;
    return;
  }
  orderItemColorPickerOpenId = pickerId;
  el.style.display = 'block';
  el.innerHTML = `<p class="hint">${I18n.t('order_detail.color_loading')}</p>`;
  const it = currentOrderDetail && currentOrderDetail.items.find((x) => x.id === itemId);
  if (!it) return;
  const { data, error } = await supabaseClient
    .from('module_colors')
    .select('color_id, colors(*)')
    .eq('module_id', it.module_id)
    .eq('color_role_id', roleId);
  if (error || !data) { el.innerHTML = ''; return; }
  // Mesma ordem do cadastro (colors.sort_order) — mesmo motivo/pedido do
  // usuário do fix em loadColorRoleGroupsForSlots (2026-07-29): este picker
  // por item é um caminho separado (busca module_colors direto, não passa
  // pela função genérica), então precisa da mesma ordenação por conta própria.
  const colors = data.map((row) => row.colors)
    .filter((c) => c && c.active)
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
  const currentColorId = ((it.selected_colors || []).find((c) => c.role_id === roleId) || {}).color_id || null;
  el.innerHTML = '';
  renderSwatches(el, colors, currentColorId, (colorId) => {
    const chosen = colors.find((c) => c.id === colorId);
    if (chosen) applyColorToSingleOrderItem(itemId, roleId, chosen);
  });
}

async function renderOrderDetailColorPanel() {
  const panel = document.getElementById('po-order-detail-color-panel');
  const tabsEl = document.getElementById('po-order-detail-color-tabs');
  const swatchesEl = document.getElementById('po-order-detail-color-swatches');
  if (!panel || !tabsEl || !swatchesEl || !currentOrderDetail) return;
  // Pago/entregue também travam (migration 059) — não só aprovado. Ver
  // mesma checagem "isLocked" em renderOrderDetail.
  if (['approved', 'paid', 'delivered'].includes(currentOrderDetail.order.status)) { panel.style.display = 'none'; return; }
  const groups = await loadOrderDetailColorRoleGroups();
  // Abas na mesma sequência do cadastro (color_roles.sort_order) — pedido do
  // usuário 2026-07-29. loadColorRoleGroupsForSlots (função genérica
  // compartilhada com Composição/Projetos, não tocada aqui) devolve na ordem
  // que cada papel foi ENCONTRADO percorrendo as peças, que normalmente
  // coincide mas não é garantido; ordenar aqui, só nesta tela, corrige sem
  // arriscar mudar o comportamento de quem já usa a função genérica.
  groups.sort((a, b) => {
    const sa = (colorRolesCache.find((r) => r.id === a.roleId) || {}).sort_order || 0;
    const sb = (colorRolesCache.find((r) => r.id === b.roleId) || {}).sort_order || 0;
    return sa - sb;
  });
  tabsEl.innerHTML = '';
  swatchesEl.innerHTML = '';
  if (!groups.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  if (!groups.some((g) => g.roleId === orderDetailColorActiveTabRoleId)) {
    orderDetailColorActiveTabRoleId = groups[0].roleId;
  }
  groups.forEach((group) => {
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'po-comp-color-tab-btn'; // mesmo visual da Composição, reaproveitado
    tabBtn.textContent = group.roleName || I18n.t('color.prefix');
    if (group.roleId === orderDetailColorActiveTabRoleId) tabBtn.classList.add('active');
    tabBtn.addEventListener('click', () => {
      orderDetailColorActiveTabRoleId = group.roleId;
      renderOrderDetailColorTabSwatches(groups);
    });
    tabsEl.appendChild(tabBtn);
  });
  renderOrderDetailColorTabSwatches(groups);
  // Botão "Alterar cores" é um elemento estático (fora de tabsEl/swatchesEl,
  // não recriado a cada render) — sincroniza ele aqui também, não só em
  // stageColorRoleChange, senão ficaria com contagem velha ao reabrir a
  // tela pra um pedido diferente (pendência já foi zerada em openOrderDetail,
  // mas o texto/visibilidade do botão em si só atualiza quando chamado).
  renderOrderDetailColorPendingState();
}

function renderOrderDetailColorTabSwatches(groups) {
  const tabsEl = document.getElementById('po-order-detail-color-tabs');
  const swatchesEl = document.getElementById('po-order-detail-color-swatches');
  if (!tabsEl || !swatchesEl) return;
  [...tabsEl.children].forEach((btn, i) => {
    btn.classList.toggle('active', groups[i] && groups[i].roleId === orderDetailColorActiveTabRoleId);
  });
  const group = groups.find((g) => g.roleId === orderDetailColorActiveTabRoleId);
  swatchesEl.innerHTML = '';
  if (!group) return;
  // Swatch marcada = escolha PENDENTE desta aba (se já clicou uma), não a
  // cor que já estava aplicada — reflete o estado "ainda não confirmado"
  // (ver orderDetailPendingColorChanges/stageColorRoleChange).
  const pendingColor = orderDetailPendingColorChanges[group.roleId];
  renderSwatches(swatchesEl, group.colors, pendingColor ? pendingColor.id : null, (colorId) => {
    const chosen = group.colors.find((c) => c.id === colorId);
    if (chosen) stageColorRoleChange(group.roleId, chosen);
  });
}

// Mesma imagem grande (thumbnail_data_url — snapshot do 3D no momento em
// que o módulo foi configurado, ver trimTransparentPng) que o carrinho já
// usa pequena (.portal-item-thumb) — aqui só em tamanho maior
// (.po-order-item-image), pedido do usuário: "quero imagem de cada modulo
// grande". Sem 3D novo sendo gerado — reaproveita o PNG já salvo.
function renderOrderDetailItemCard(it, idx, isApproved, colorById) {
  const number = String(idx + 1).padStart(2, '0');
  // data-raw-src (não src direto) — renderOrderDetail troca pro recortado
  // assim que trimTransparentPng terminar (ver comentário lá); o cliente vê
  // esta versão original por uma fração de segundo até isso acontecer.
  const img = it.thumbnail_data_url
    ? `<img src="${it.thumbnail_data_url}" data-raw-src="${it.thumbnail_data_url}" alt="${it.module_name}" class="po-order-item-image" />`
    : `<div class="po-order-item-image po-order-item-image-empty"></div>`;
  // Bolinha de cor (pedido do usuário 2026-07-19) — um span circular por
  // papel, colorido com o swatch_hex (ou texture_url, quando a cor é uma
  // textura de madeira em vez de sólida) do registro em colorById (ver
  // openOrderDetail). Sem o registro (cor apagada do catálogo depois do
  // pedido, caso raro) cai num cinza neutro em vez de quebrar.
  // Cada linha agora é um BOTÃO (pedido do usuário 2026-07-29: "quero uma
  // opcao de trocar a cor por modulo tambem") — clicar abre um seletor
  // inline (ver toggleOrderItemColorPicker/applyColorToSingleOrderItem) só
  // pra ESTE item, diferente do painel de abas no topo da tela (que troca o
  // papel em todos os itens que o usam de uma vez). Desabilitado quando o
  // pedido já foi aprovado (trava tudo, mesma regra do botão "Editar").
  const colors = Array.isArray(it.selected_colors) ? it.selected_colors : [];
  const colorsHtml = colors.length
    ? `<div class="po-order-item-colors">${colors.map((c) => {
        const colorRec = colorById && colorById.get(c.color_id);
        const dotStyle = colorRec && colorRec.texture_url
          ? `background-image:url('${colorRec.texture_url}');background-size:cover;background-position:center;`
          : `background-color:${(colorRec && colorRec.swatch_hex) || '#cccccc'};`;
        const pickerId = `po-order-item-color-picker-${it.id}-${c.role_id}`;
        return `
          <div class="po-order-item-color-line">
            <button type="button" class="po-order-item-color-btn" data-item-id="${it.id}" data-role-id="${c.role_id}" data-picker-id="${pickerId}" ${isApproved ? 'disabled' : ''}>
              <span class="po-order-item-color-dot" style="${dotStyle}"></span>${c.role_name}: ${c.color_name}
            </button>
            <div id="${pickerId}" class="po-order-item-color-picker" style="display:none;"></div>
          </div>
        `;
      }).join('')}</div>`
    : '';
  const detailUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const dimsLine = `${formatDimension(it.width_mm, detailUnit)} x ${formatDimension(it.height_mm, detailUnit)} x ${formatDimension(it.depth_mm, detailUnit)}`;
  // Módulo decorativo (migration 039): mesmo aviso do carrinho, no lugar do preço.
  const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
  const isDecor = !!(decorModule && decorModule.is_decoration);
  const priceLine = isDecor ? I18n.t('decor.cart_note') : formatMoney(it.total_price);
  // Volume (m³) + peso — migration 061. data-item-id pra updateOrderItemQuantity
  // conseguir atualizar só esta linha depois de mudar a quantidade.
  const volumeWeightLine = isDecor ? '' : formatVolumeWeight(it.breakdown || [], it.quantity);
  const editBtn = isApproved
    ? ''
    : `<button type="button" class="secondary po-order-item-edit-btn" data-item-id="${it.id}">${I18n.t('order_detail.edit_btn')}</button>`;
  // Botão remover (pedido do usuário 2026-07-29: "BOTAO REMOVER item da
  // lista") — mesma trava de "Editar"/quantidade/cor (some quando o pedido já
  // foi decidido). Diferente de removeCartItem (carrinho, sem confirmação —
  // rascunho ainda não é "compromisso" nenhum): aqui já é um pedido salvo, e
  // remover apaga o registro de order_items de vez, então pede confirmação
  // (mesmo padrão de resetProject/project.reset_confirm).
  const removeBtn = isApproved
    ? ''
    : `<button type="button" class="secondary po-order-item-remove-btn" data-item-id="${it.id}" style="color: var(--danger); border-color: var(--danger);">${I18n.t('order_detail.remove_btn')}</button>`;
  // Código de referência (SKU) — pedido do usuário (2026-07-29): "quando
  // tiver referencia cadastrada quero ela bem grande no lado do icone do
  // modulo". Não vem gravado no order_item (evita mais uma migration) — é
  // calculado na hora batendo largura/altura do item contra os códigos
  // cadastrados no módulo (ver findMatchingSkuReference); item sem nenhum
  // código correspondente simplesmente não mostra nada aqui, como sempre.
  const skuRef = findMatchingSkuReference(it.module_id, it.width_mm, it.height_mm);
  const skuHtml = skuRef ? `<div class="po-order-item-sku-code">${skuRef}</div>` : '';
  // Quantidade editável (pedido do usuário 2026-07-29: "quero opcao de
  // quantidade, pode ser alterada e salvar alteracao. muda preco.") —
  // updateOrderItemQuantity recalcula total_price = unit_price × quantidade e
  // grava direto (mesmo padrão de "Salvar informações": sem exigir reabrir o
  // configurador completo). Trava junto com o resto quando o pedido já foi
  // decidido (isApproved aqui já cobre Aprovada/Paga/Entregue, ver isLocked
  // em renderOrderDetail).
  const qty = Number(it.quantity) || 1;
  const qtyHtml = `
    <div class="po-order-item-qty-row">
      <label for="po-order-item-qty-${it.id}">${I18n.t('order_detail.quantity_label')}</label>
      <input type="number" id="po-order-item-qty-${it.id}" min="1" step="1" class="po-order-item-qty-input" data-item-id="${it.id}" value="${qty}" ${isApproved ? 'disabled' : ''} />
    </div>
  `;
  return `
    <div class="po-order-item-card">
      <div class="po-order-item-number">${number}</div>
      ${img}
      ${skuHtml}
      <div class="po-order-item-info">
        <div class="po-order-item-dims">${dimsLine}</div>
        <div class="po-order-item-reference">${it.module_name}</div>
        ${it.module_description ? `<div class="po-order-item-description">${it.module_description}</div>` : ''}
        ${colorsHtml}
      </div>
      <div class="po-order-item-actions">
        ${qtyHtml}
        <div class="po-order-item-unit-price" data-item-id="${it.id}">${priceLine}</div>
        <div class="hint po-order-item-volume-weight" data-item-id="${it.id}">${volumeWeightLine}</div>
        ${editBtn}
        ${removeBtn}
      </div>
    </div>
  `;
}

// Remove um item já salvo do pedido (pedido do usuário 2026-07-29: "BOTAO
// REMOVER item da lista") — apaga direto de order_items, atualiza
// currentOrderDetail.items em memória e reconstrói a tela (números 01/02/...
// e o total precisam se ajustar). Confirmação antes (diferente do carrinho
// em rascunho): aqui é um pedido salvo de verdade.
async function removeOrderDetailItem(itemId) {
  if (!currentOrderDetail) return;
  if (!confirm(I18n.t('order_detail.remove_confirm'))) return;
  const errorEl = document.getElementById('po-order-detail-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    const { error } = await supabaseClient.from('order_items').delete().eq('id', itemId);
    if (error) throw error;
    currentOrderDetail.items = currentOrderDetail.items.filter((x) => x.id !== itemId);
    renderOrderDetail();
  } catch (err) {
    if (errorEl) { errorEl.textContent = I18n.t('order_detail.remove_error', { msg: err.message || String(err) }); errorEl.style.display = 'block'; }
  }
}

// Quantidade editável no item já salvo (pedido do usuário 2026-07-29: "quero
// opcao de quantidade, pode ser alterada e salvar alteracao. muda preco.") —
// total_price = unit_price × quantidade (unit_price nunca muda aqui, só o
// total); grava direto no order_item e atualiza só a linha de preço deste
// card + o total do pedido no rodapé, sem reconstruir a tela inteira (evita
// fechar um seletor de cor que porventura esteja aberto noutro item).
async function updateOrderItemQuantity(itemId, newQtyRaw) {
  if (!currentOrderDetail) return;
  const it = currentOrderDetail.items.find((x) => x.id === itemId);
  if (!it) return;
  const inputEl = document.getElementById(`po-order-item-qty-${itemId}`);
  const newQty = Math.max(1, Math.round(Number(newQtyRaw)) || 1);
  if (inputEl) { inputEl.value = newQty; inputEl.disabled = true; }
  const errorEl = document.getElementById('po-order-detail-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    const newTotal = Number(it.unit_price || 0) * newQty;
    const { data, error } = await supabaseClient
      .from('order_items')
      .update({ quantity: newQty, total_price: newTotal })
      .eq('id', itemId)
      .select()
      .single();
    if (error) throw error;
    Object.assign(it, data); // atualiza o item em memória (currentOrderDetail.items) com o que voltou do banco
    const priceEl = document.querySelector(`.po-order-item-unit-price[data-item-id="${itemId}"]`);
    if (priceEl) {
      const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
      const isDecor = !!(decorModule && decorModule.is_decoration);
      priceEl.textContent = isDecor ? I18n.t('decor.cart_note') : formatMoney(it.total_price);
    }
    const total = currentOrderDetail.items.reduce((sum, x) => sum + Number(x.total_price || 0), 0);
    document.getElementById('po-order-detail-total').textContent = formatMoney(total);
    updateOrderDetailVolumeWeight(currentOrderDetail.items);
    const itemVwEl = document.querySelector(`.po-order-item-volume-weight[data-item-id="${itemId}"]`);
    if (itemVwEl) {
      const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
      itemVwEl.textContent = (decorModule && decorModule.is_decoration) ? '' : formatVolumeWeight(it.breakdown || [], it.quantity);
    }
  } catch (err) {
    if (inputEl) inputEl.value = it.quantity || 1; // reverte o campo pro valor salvo de verdade
    if (errorEl) { errorEl.textContent = I18n.t('order_detail.quantity_error', { msg: err.message || String(err) }); errorEl.style.display = 'block'; }
  } finally {
    if (inputEl) inputEl.disabled = false;
  }
}

document.getElementById('po-order-detail-approve-btn').addEventListener('click', async () => {
  if (!currentOrderDetail) return;
  const errorEl = document.getElementById('po-order-detail-error');
  errorEl.style.display = 'none';
  const client_name = document.getElementById('po-order-detail-client-name').value.trim();
  const po_name = document.getElementById('po-order-detail-po-name').value.trim();
  const client_phone = document.getElementById('po-order-detail-phone').value.trim();
  const client_email = document.getElementById('po-order-detail-email').value.trim();
  const delivery_address = document.getElementById('po-order-detail-address').value.trim();
  // Pedido do usuário: pra aprovar, precisa ter "nome do OP, nome do
  // cliente, telefone, endereço de entrega e email" — todos os 5.
  if (!client_name || !po_name || !client_phone || !client_email || !delivery_address) {
    errorEl.textContent = I18n.t('order_detail.approve_missing_fields_error');
    errorEl.style.display = 'block';
    return;
  }
  const approveBtn = document.getElementById('po-order-detail-approve-btn');
  approveBtn.disabled = true;
  try {
    const { data, error } = await supabaseClient
      .from('orders')
      .update({
        client_name, po_name, client_phone, client_email, delivery_address,
        status: 'approved', approved_at: new Date().toISOString()
      })
      .eq('id', currentOrderDetail.order.id)
      .select()
      .single();
    if (error) throw error;
    currentOrderDetail.order = data;
    renderOrderDetail(); // trava a tela (isApproved=true) — ver renderOrderDetail
    // Se este era o pedido "ativo" do carrinho (currentDraftOrderId — caso
    // comum: aprovou vindo direto de "Revisar pedido"), desanexa — senão o
    // próximo módulo adicionado no catálogo entraria escondido dentro de um
    // pedido JÁ APROVADO (ensureDraftOrder reaproveitaria o id cego, sem
    // checar status). Descoberto ao implementar "Novo Pedido" (mesmo
    // raciocínio de currentDraftOrderStatus, ver startNewOrder/
    // discardCurrentDraftOrder) — bug pré-existente, não introduzido ali.
    if (currentDraftOrderId === data.id) {
      currentDraftOrderId = null;
      currentDraftOrderStatus = null;
      cartItems = [];
      renderCart();
    }
  } catch (err) {
    errorEl.textContent = I18n.t('order_detail.approve_error', { msg: err.message });
    errorEl.style.display = 'block';
  } finally {
    approveBtn.disabled = false;
  }
});

// "Salvar informações" (pedido do usuário 2026-07-29) — grava nome/OP/
// telefone/e-mail/endereço parcialmente, sem exigir os 5 campos e sem travar
// a tela (diferente de "Aprovar Pedido") — só pra não perder o que já foi
// digitado se o cliente fechar e voltar depois.
const orderDetailSaveInfoBtn = document.getElementById('po-order-detail-save-info-btn');
if (orderDetailSaveInfoBtn) {
  orderDetailSaveInfoBtn.addEventListener('click', async () => {
    if (!currentOrderDetail) return;
    const errorEl = document.getElementById('po-order-detail-error');
    const statusEl = document.getElementById('po-order-detail-save-info-status');
    errorEl.style.display = 'none';
    const client_name = document.getElementById('po-order-detail-client-name').value.trim() || null;
    const po_name = document.getElementById('po-order-detail-po-name').value.trim() || null;
    const client_phone = document.getElementById('po-order-detail-phone').value.trim() || null;
    const client_email = document.getElementById('po-order-detail-email').value.trim() || null;
    const delivery_address = document.getElementById('po-order-detail-address').value.trim() || null;
    orderDetailSaveInfoBtn.disabled = true;
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ client_name, po_name, client_phone, client_email, delivery_address })
        .eq('id', currentOrderDetail.order.id)
        .select()
        .single();
      if (error) throw error;
      currentOrderDetail.order = data;
      if (statusEl) statusEl.textContent = I18n.t('order_detail.info_saved');
      // Não chama renderOrderDetail() inteiro (reconstruiria os cards/painel
      // de cor sem necessidade) — mas o TÍTULO no topo (po_name/client_name)
      // depende desses campos e precisa refletir o save na hora, senão dá a
      // impressão de que nada foi salvo mesmo tendo salvo de verdade (pedido
      // do usuário 2026-07-29: "nao ta salvando informacoes do cabecalho").
      const titleEl = document.getElementById('po-order-detail-title');
      if (titleEl) titleEl.textContent = data.po_name || data.client_name || I18n.t('pdf.order_fallback');
    } catch (err) {
      errorEl.textContent = I18n.t('order_detail.save_info_error', { msg: err.message });
      errorEl.style.display = 'block';
    } finally {
      orderDetailSaveInfoBtn.disabled = false;
    }
  });
}

// Pago/Entregue (migration 059) — sequência Pendente → Aprovada → Paga →
// Entregue. Cliente E admin podem marcar (confirmado via AskUserQuestion) —
// os mesmos 2 botões existem em admin.js/renderOrdersList.
const orderDetailMarkPaidBtn = document.getElementById('po-order-detail-mark-paid-btn');
if (orderDetailMarkPaidBtn) {
  orderDetailMarkPaidBtn.addEventListener('click', async () => {
    if (!currentOrderDetail) return;
    const errorEl = document.getElementById('po-order-detail-error');
    errorEl.style.display = 'none';
    orderDetailMarkPaidBtn.disabled = true;
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', currentOrderDetail.order.id)
        .select()
        .single();
      if (error) throw error;
      currentOrderDetail.order = data;
      renderOrderDetail();
    } catch (err) {
      errorEl.textContent = I18n.t('order_detail.mark_paid_error', { msg: err.message });
      errorEl.style.display = 'block';
    } finally {
      orderDetailMarkPaidBtn.disabled = false;
    }
  });
}
const orderDetailMarkDeliveredBtn = document.getElementById('po-order-detail-mark-delivered-btn');
if (orderDetailMarkDeliveredBtn) {
  orderDetailMarkDeliveredBtn.addEventListener('click', async () => {
    if (!currentOrderDetail) return;
    const errorEl = document.getElementById('po-order-detail-error');
    errorEl.style.display = 'none';
    orderDetailMarkDeliveredBtn.disabled = true;
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', currentOrderDetail.order.id)
        .select()
        .single();
      if (error) throw error;
      currentOrderDetail.order = data;
      renderOrderDetail();
    } catch (err) {
      errorEl.textContent = I18n.t('order_detail.mark_delivered_error', { msg: err.message });
      errorEl.style.display = 'block';
    } finally {
      orderDetailMarkDeliveredBtn.disabled = false;
    }
  });
}

// ---------- Editar módulo de um pedido já salvo (migration 047) ----------
// "Editar" reabre o configurador de sempre (Passo 2), prefiltrado com o que
// já estava salvo neste order_item — mesmo padrão de editCompositionSlot/
// restoreSlotStateIntoConfigurator, só que a "fonte da verdade" é uma linha
// de order_items já no banco (não um slot em memória), então salvar faz
// UPDATE na mesma linha em vez de inserir uma nova (ver saveOrderItemEdit,
// branch no topo do handler de po-add-item-btn).

let editingOrderItemId = null; // id do order_items sendo editado agora, null = não está editando
let editingOrderId = null; // order_id dono desse item — pra voltar pra tela do pedido certa depois de salvar

async function editOrderItem(order, item) {
  if (!item) return;
  const errorEl = document.getElementById('po-order-detail-error');
  errorEl.style.display = 'none';
  const module = allModules.find((m) => m.id === item.module_id);
  if (!module) {
    // Módulo pode ter sido desativado/removido do catálogo desde que este
    // pedido foi salvo — mesma situação/mensagem de editCompositionSlot.
    errorEl.textContent = I18n.t('order_detail.edit_module_unavailable_error');
    errorEl.style.display = 'block';
    return;
  }
  try {
    // Resolve selected_colors/piece_color_overrides (snapshots id/nome, ver
    // buildPieceColorOverridesSnapshot) de volta pra registros reais de
    // "colors" — mesmo padrão de restoreFavoriteComposition.
    const colorIds = [...new Set(
      (item.selected_colors || []).map((c) => c.color_id)
        .concat(Object.values(item.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id)))
        .filter(Boolean)
    )];
    const [{ data: colorsData }, hingeRes, slideRes] = await Promise.all([
      colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : Promise.resolve({ data: [] }),
      item.hinge_model_id ? supabaseClient.from('hinge_models').select('*').eq('id', item.hinge_model_id).single() : Promise.resolve({ data: null }),
      item.slide_model_id ? supabaseClient.from('slide_models').select('*').eq('id', item.slide_model_id).single() : Promise.resolve({ data: null })
    ]);
    const colorById = new Map((colorsData || []).map((c) => [c.id, c]));

    const colorsByRole = {};
    (item.selected_colors || []).forEach((sc) => {
      const color = colorById.get(sc.color_id);
      if (color) colorsByRole[sc.role_id] = color;
    });
    const pieceColorOverrides = {};
    Object.keys(item.piece_color_overrides || {}).forEach((pieceId) => {
      const perRole = item.piece_color_overrides[pieceId];
      const resolved = {};
      Object.keys(perRole).forEach((roleId) => {
        const color = colorById.get(perRole[roleId].color_id);
        if (color) resolved[roleId] = color;
      });
      if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
    });

    editingOrderItemId = item.id;
    editingOrderId = order.id;

    document.getElementById('po-order-edit-mode-banner').style.display = 'flex';
    document.getElementById('po-order-edit-mode-label').textContent = item.module_name;
    document.getElementById('po-add-item-btn').textContent = I18n.t('order_detail.save_edit_btn');

    const newOrderTab = document.getElementById('po-tab-new-order');
    newOrderTab.classList.add('po-modal-mode');
    newOrderTab.style.display = 'block';
    newOrderTab.scrollTop = 0;
    window.scrollTo(0, 0);

    await selectModule(module.id);
    if (!currentModule) throw new Error(I18n.t('order_detail.edit_module_unavailable_error'));
    restoreSlotStateIntoConfigurator({
      colorsByRole, pieceColorOverrides,
      hingeModel: hingeRes.data || null, slideModel: slideRes.data || null,
      width_mm: item.width_mm, height_mm: item.height_mm, depth_mm: item.depth_mm,
      shelfQuantities: item.shelf_quantities || {},
      dimOverrides: item.dim_overrides || {},
      selectedOptionalIds: item.selected_optional_component_ids || [],
      floor_height_mm: 0
    });
  } catch (err) {
    exitOrderItemEdit();
    errorEl.textContent = I18n.t('order_detail.edit_module_unavailable_error');
    errorEl.style.display = 'block';
  }
}

// Fecha o modal e devolve o botão/estado normais — equivalente a
// exitCompositionSlotConfig, mas pro modo "editando item de pedido salvo".
function exitOrderItemEdit() {
  editingOrderItemId = null;
  editingOrderId = null;
  document.getElementById('po-order-edit-mode-banner').style.display = 'none';
  document.getElementById('po-add-item-btn').textContent = I18n.t('step2.add_to_order_btn');
  const newOrderTab = document.getElementById('po-tab-new-order');
  newOrderTab.classList.remove('po-modal-mode');
  newOrderTab.style.display = 'none';
  highlightSelectedModuleCard('');
  document.getElementById('po-config-section').style.display = 'none';
  document.getElementById('po-module-description').textContent = '';
  currentModule = null;
  lastItemResult = null;
}

const orderEditCancelBtn = document.getElementById('po-order-edit-mode-cancel-btn');
if (orderEditCancelBtn) {
  orderEditCancelBtn.addEventListener('click', () => {
    const orderId = editingOrderId;
    exitOrderItemEdit();
    if (orderId) openOrderDetail(orderId);
  });
}

// Grava as mudanças na MESMA linha de order_items (UPDATE, não insert) e
// volta pra tela do pedido — chamado pelo branch no topo do handler de
// po-add-item-btn quando editingOrderItemId está setado.
async function saveOrderItemEdit() {
  const cartError = document.getElementById('po-cart-error');
  cartError.style.display = 'none';
  try {
    let thumbnail_data_url = null;
    try { thumbnail_data_url = await trimTransparentPng(Viewer3D.snapshot()); } catch (e) { /* sem 3D, mantém a miniatura antiga (não sobrescreve com null) */ }

    const payload = {
      module_id: currentModule.id,
      module_name: currentModule.name,
      module_description: currentModule.description || null,
      selected_colors: lastItemResult.selectedColors,
      hinge_model_id: lastItemResult.hingeModel ? lastItemResult.hingeModel.id : null,
      slide_model_id: lastItemResult.slideModel ? lastItemResult.slideModel.id : null,
      width_mm: lastItemResult.width_mm,
      height_mm: lastItemResult.height_mm,
      depth_mm: lastItemResult.depth_mm,
      shelf_quantities: lastItemResult.shelfQuantities,
      dim_overrides: lastItemResult.dimOverrides,
      piece_color_overrides: buildPieceColorOverridesSnapshot(lastItemResult.pieceColorOverrides),
      selected_optional_component_ids: lastItemResult.selectedOptionalIds,
      unit_price: lastItemResult.result.total,
      // Preserva a quantidade que já estava salva no item (ver
      // updateOrderItemQuantity/pedido do usuário 2026-07-29) — esta tela
      // (configurador completo) não mexe em quantidade, só reconfigura o
      // módulo; sem isso, editar qualquer coisa aqui resetaria o total de
      // volta pro preço de 1 unidade só, perdendo a quantidade escolhida.
      total_price: lastItemResult.result.total * (Number((currentOrderDetail && currentOrderDetail.items.find((x) => x.id === editingOrderItemId) || {}).quantity) || 1),
      breakdown: lastItemResult.result.breakdown
    };
    if (thumbnail_data_url) payload.thumbnail_data_url = thumbnail_data_url;

    const orderId = editingOrderId;
    const { error } = await supabaseClient.from('order_items').update(payload).eq('id', editingOrderItemId);
    if (error) throw error;

    exitOrderItemEdit();
    await openOrderDetail(orderId);
  } catch (err) {
    cartError.textContent = I18n.t('cart.add_error', { msg: err.message });
    cartError.style.display = 'block';
  }
}

// Gera um PDF simples (client-side, via jsPDF) com o resumo do pedido —
// referência/cliente, data, cada módulo com medidas/cores/preço, e o total.
// Não depende de nenhum backend — só reaproveita os dados já carregados na
// tela de "Meus pedidos".
function generateOrderPDF(order, items) {
  if (!order || typeof window.jspdf === 'undefined') {
    alert(I18n.t('pdf.not_available'));
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 18;
  // Unidade GLOBAL (po-unit-select) — o PDF é gerado na hora que o cliente
  // clica, então usa a mesma unidade que ele está vendo na tela nesse
  // momento (mesmo motivo do card da vitrine/carrinho/composição: não fica
  // travado em mm).
  const pdfUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';

  function ensureSpace(nextLineHeight) {
    if (y + nextLineHeight > pageHeight - 14) {
      doc.addPage();
      y = 18;
    }
  }

  doc.setFontSize(16);
  doc.text(I18n.t('pdf.title'), 14, y);
  y += 9;

  doc.setFontSize(10);
  const title = order.po_name || order.client_name || I18n.t('pdf.order_fallback');
  doc.text(I18n.t('pdf.reference', { title }), 14, y); y += 6;
  if (order.client_name && order.po_name) { doc.text(I18n.t('pdf.client', { name: order.client_name }), 14, y); y += 6; }
  if (order.client_phone) { doc.text(I18n.t('pdf.phone', { phone: order.client_phone }), 14, y); y += 6; }
  const date = order.submitted_at ? new Date(order.submitted_at).toLocaleString(currentLocale()) : '';
  doc.text(I18n.t('pdf.date', { date }), 14, y); y += 6;
  doc.text(I18n.t('pdf.status', { status: orderStatusLabel(order.status) }), 14, y); y += 10;

  doc.setFontSize(12);
  doc.text(I18n.t('pdf.modules'), 14, y); y += 7;

  doc.setFontSize(9);
  items.forEach((it, idx) => {
    ensureSpace(22);
    doc.setFontSize(10);
    doc.text(`${idx + 1}. ${it.module_name}`, 14, y); y += 5;
    doc.setFontSize(9);
    doc.text(`   ${formatDimension(it.width_mm, pdfUnit)} x ${formatDimension(it.height_mm, pdfUnit)} x ${formatDimension(it.depth_mm, pdfUnit)}`, 14, y); y += 5;
    const colorLine = formatColorsLine(it);
    if (colorLine) { doc.text(`   ${colorLine}`, 14, y); y += 5; }
    const qty = it.quantity || 1;
    // Módulo decorativo (migration 039): a linha do PDF avisa que o item é
    // só ambientação, em vez de mostrar "Preço: $0.00".
    const pdfDecorModule = (allModules || []).find((mm) => mm.id === it.module_id);
    const priceLine = (pdfDecorModule && pdfDecorModule.is_decoration)
      ? I18n.t('pdf.decor_line')
      : (qty > 1
        ? I18n.t('pdf.price_line_qty', { unit: formatMoney(it.unit_price), qty, total: formatMoney(it.total_price) })
        : I18n.t('pdf.price_line', { total: formatMoney(it.total_price) }));
    doc.text(`   ${priceLine}`, 14, y); y += 7;
  });

  const total = items.reduce((sum, it) => sum + Number(it.total_price || 0), 0);
  ensureSpace(10);
  doc.setFontSize(12);
  doc.text(I18n.t('pdf.order_total', { total: formatMoney(total) }), 14, y);

  const filenameBase = (order.po_name || order.client_name || 'pedido')
    .toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'pedido';
  doc.save(`${filenameBase}.pdf`);
}

// ---------- Visualizar no meu ambiente (overlay manual, sem IA) ----------
//
// Nível 1 de "montar visualmente o ambiente do cliente": sem geração de
// imagem por IA, sem enviar nada ao servidor — o cliente sobe uma foto do
// próprio espaço e arrasta/redimensiona por cima a miniatura de cada módulo
// que já está no carrinho. Reaproveita 100% o que já existia: cada item do
// carrinho ganha um thumbnail_data_url (PNG com fundo TRANSPARENTE, via
// Viewer3D.snapshot() no momento em que foi adicionado — ver
// addCurrentItemToCart) já na medida/cor que o cliente escolheu, então o
// "recorte" colado na foto já reflete a configuração real, sem precisar
// gerar nada novo. Tudo puramente client-side (arquivo local, nunca sobe
// pro Supabase) — o resultado só existe pra visualizar/baixar na hora.

let roomLayers = []; // [{ el, imgEl }] — uma entrada por módulo colocado na foto

function renderRoomCartPicker() {
  const list = document.getElementById('po-room-cart-picker-list');
  const emptyHint = document.getElementById('po-room-cart-empty-hint');
  if (!list) return;
  // Só entram itens com thumbnail (sem 3D disponível, thumbnail_data_url
  // fica null — ver addCurrentItemToCart) — nesse caso não tem o que colar.
  const withThumb = cartItems.filter((it) => it.thumbnail_data_url);
  list.innerHTML = '';
  emptyHint.style.display = withThumb.length === 0 ? 'block' : 'none';
  withThumb.forEach((it) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'po-room-cart-picker-item';
    btn.innerHTML = `<img src="${it.thumbnail_data_url}" alt="${it.module_name}" /><span>${it.module_name}</span>`;
    btn.addEventListener('click', () => addRoomLayer(it.thumbnail_data_url));
    list.appendChild(btn);
  });
}

document.getElementById('po-room-photo-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = document.getElementById('po-room-photo');
    img.onload = () => {
      document.getElementById('po-room-empty-hint').style.display = 'none';
      document.getElementById('po-room-editor').style.display = 'block';
      clearRoomLayers();
      renderRoomCartPicker();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('po-room-clear-btn').addEventListener('click', () => {
  document.getElementById('po-room-photo-input').value = '';
  document.getElementById('po-room-photo').removeAttribute('src');
  document.getElementById('po-room-editor').style.display = 'none';
  document.getElementById('po-room-empty-hint').style.display = 'block';
  clearRoomLayers();
});

function clearRoomLayers() {
  roomLayers.forEach((l) => l.el.remove());
  roomLayers = [];
}

// Cola um módulo (PNG transparente) no centro do stage, num tamanho inicial
// de até 40% da largura da foto exibida (mantendo a proporção real da
// miniatura) — o cliente ajusta posição/tamanho a partir daí.
function addRoomLayer(src) {
  const stage = document.getElementById('po-room-stage');
  const probe = new Image();
  probe.onload = () => {
    const stageRect = stage.getBoundingClientRect();
    const maxW = stageRect.width * 0.4;
    const scale = Math.min(1, maxW / probe.naturalWidth);
    const width = probe.naturalWidth * scale;
    const height = probe.naturalHeight * scale;
    const x = (stageRect.width - width) / 2;
    const y = (stageRect.height - height) / 2;

    const el = document.createElement('div');
    el.className = 'po-room-layer';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;

    const layerImg = document.createElement('img');
    layerImg.src = src;
    layerImg.draggable = false;
    el.appendChild(layerImg);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'po-room-layer-remove';
    removeBtn.textContent = '×';
    // pointerdown com stopPropagation — senão o listener de arrastar (preso
    // no próprio .po-room-layer, que é o pai) também dispararia junto.
    removeBtn.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    removeBtn.addEventListener('click', () => {
      el.remove();
      roomLayers = roomLayers.filter((l) => l.el !== el);
    });
    el.appendChild(removeBtn);

    const handle = document.createElement('div');
    handle.className = 'po-room-layer-resize-handle';
    el.appendChild(handle);

    stage.appendChild(el);
    roomLayers.push({ el, imgEl: layerImg });
    makeRoomLayerDraggable(el, stage);
    makeRoomLayerResizable(handle, el, probe.naturalWidth / probe.naturalHeight);
  };
  probe.src = src;
}

// Arrastar — Pointer Events cobre mouse E touch com o mesmo código (célula
// principal do uso no celular). setPointerCapture garante que o "arrastar"
// continua recebendo os eventos mesmo se o dedo/cursor sair de cima do
// elemento no meio do gesto.
function makeRoomLayerDraggable(el, stage) {
  el.addEventListener('pointerdown', (e) => {
    // Só arrasta clicando no próprio quadro ou na imagem — não quando o
    // clique já foi tratado pelo botão de remover ou pela alça de resize
    // (ambos param propagation antes de chegar aqui).
    if (e.target !== el && e.target.tagName !== 'IMG') return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX, startY = e.clientY;
    const startLeft = parseFloat(el.style.left) || 0;
    const startTop = parseFloat(el.style.top) || 0;

    function onMove(ev) {
      el.style.left = `${startLeft + (ev.clientX - startX)}px`;
      el.style.top = `${startTop + (ev.clientY - startY)}px`;
    }
    function onUp(ev) {
      el.releasePointerCapture(ev.pointerId);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    }
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  });
}

// Redimensionar pela alça do canto — mantém a proporção original da
// miniatura (não distorce o módulo).
function makeRoomLayerResizable(handle, el, aspectRatio) {
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = el.offsetWidth;

    function onMove(ev) {
      const newWidth = Math.max(30, startWidth + (ev.clientX - startX));
      el.style.width = `${newWidth}px`;
      el.style.height = `${newWidth / aspectRatio}px`;
    }
    function onUp(ev) {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    }
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  });
}

// "Baixar imagem montada" — desenha a foto ORIGINAL (resolução real, não o
// tamanho reduzido exibido na tela) + cada camada num <canvas> escondido,
// escalando a posição/tamanho de cada camada pela mesma razão entre a
// resolução real da foto e o tamanho exibido no stage. Assim o PNG baixado
// sai na qualidade da foto original, não na resolução da tela.
document.getElementById('po-room-download-btn').addEventListener('click', () => {
  const photo = document.getElementById('po-room-photo');
  const stage = document.getElementById('po-room-stage');
  if (!photo.src) return;
  const stageRect = stage.getBoundingClientRect();
  const scaleX = photo.naturalWidth / stageRect.width;
  const scaleY = photo.naturalHeight / stageRect.height;

  const canvas = document.createElement('canvas');
  canvas.width = photo.naturalWidth;
  canvas.height = photo.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  roomLayers.forEach((layer) => {
    const x = (parseFloat(layer.el.style.left) || 0) * scaleX;
    const y = (parseFloat(layer.el.style.top) || 0) * scaleY;
    const w = layer.el.offsetWidth * scaleX;
    const h = layer.el.offsetHeight * scaleY;
    ctx.drawImage(layer.imgEl, x, y, w, h);
  });

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meu-ambiente-legno.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
});

// ---------- Composição (2+ módulos conectados, cada um configurado independentemente) ----------
//
// Fileira de "slots" sempre da esquerda pra direita: o cliente clica no
// retângulo vazio (sempre o último da fileira), isso ABRE A MESMA tela de
// "Novo Orçamento" (catálogo + configurador — nenhuma UI duplicada) marcando
// addTargetSlotIndex; o clique em "Adicionar este módulo à composição" (ver
// handler de po-add-item-btn acima) captura o resultado no slot em vez de
// gravar em order_items, e a fileira ganha um novo slot vazio à direita.
// "Gerar 3D da composição" é a próxima etapa (ainda não implementada aqui) —
// vai desenhar os módulos juntos, em escala real, numa cena NOVA e separada
// do visualizador de configuração, sem tocar na lógica de posicionamento já
// existente em viewer3d.js.

let compositionSlots = [];
let addTargetSlotIndex = null; // null = configurador normal (adiciona ao carrinho); número = slot da composição sendo configurado agora
// true = addTargetSlotIndex é uma posição de INSERÇÃO (abre espaço, não
// sobrescreve o que já está lá) — ver startCompositionSlotConfig/divisor "+"
// entre cards em renderCompositionSlots. false pros dois outros casos:
// editar um slot já preenchido (sobrescreve o próprio índice) ou adicionar
// no slot vazio do final (sobrescreve uma posição nova, vazia).
let compositionInsertMode = false;
// Empilhamento vertical (pedido do usuário, 2026-07-16): id (string opaca,
// gerada por newSlotId()) da coluna-base em que o PRÓXIMO módulo confirmado
// deve empilhar por cima — null = não está empilhando, o próximo módulo
// abre coluna nova (comportamento de sempre). Setado só pelo botão "Colocar
// em cima" de um card já preenchido (ver renderCompositionSlots) e sempre
// resetado em exitCompositionSlotConfig(), igual compositionInsertMode.
let addStackOnId = null;
// Aba ativa do painel de troca rápida de cor (pedido do usuário, 2026-07-16:
// "pode fazer por abas pra nao ocupar muito espaco na tela") — color_role_id
// do grupo (Caixa/Porta/Painel/etc., ver loadCompositionColorRoleGroups)
// mostrado no momento; null = nenhuma aba escolhida ainda (renderCompositionSideColorPanel
// cai pro primeiro grupo encontrado). Mantido entre re-renders (troca de cor,
// adicionar/remover módulo) pra não voltar sempre pra primeira aba — só reseta
// pra o primeiro grupo se a aba ativa deixar de existir (ex: removeu o único
// módulo que usava aquele papel de cor).
let compColorActiveTabRoleId = null;
// Mesma ideia, versão Projetos (ver renderProjectSideColorPanel/
// applyColorRoleToAllProjectSlots) — painel separado, aba ativa própria.
let projColorActiveTabRoleId = null;

// Cada slot da composição ganha um id opaco e estável (não é o id do
// módulo do catálogo — vários slots podem repetir o mesmo módulo) só pra
// permitir que OUTRO slot se refira a ele via stack_on_id (empilhado em
// cima dele, mesma coluna). Não precisa ser globalmente único, só único
// dentro desta composição em memória.
let compositionSlotIdSeq = 0;
function newSlotId() {
  compositionSlotIdSeq += 1;
  return `slot_${Date.now()}_${compositionSlotIdSeq}`;
}

// Botão "↺ Nova composição" (pedido do usuário, 2026-07-19: "colcoar botao
// la em cima noa composition. ai zera pra iniciar um novo") — zera
// compositionSlots e todo estado de UI dependente, sem precisar remover
// módulo por módulo. NÃO mexe em pedidos já adicionados (cartItems) nem em
// favoritos já salvos (user_compositions) — só a composição em EDIÇÃO na
// tela. Confirma antes se já tem algo montado (mesmo padrão de
// fav.delete_confirm, ver saveCompositionFavorite/deleteFavorite).
function resetComposition() {
  if (compositionSlots.length && !confirm(I18n.t('composition.reset_confirm'))) return;
  compositionSlots = [];
  // Solta o vínculo com o favorito que estava sendo editado (se algum) —
  // senão "Salvar alterações" continuaria mirando o favorito antigo depois
  // de começar do zero.
  loadedFavorite = null;
  refreshFavoriteButtons();
  renderCompositionSlots();
  const comp3dWrap = document.getElementById('po-comp-3d-wrap');
  if (comp3dWrap) comp3dWrap.style.display = 'none';
  const comp3dTotal = document.getElementById('po-comp-3d-total');
  if (comp3dTotal) comp3dTotal.textContent = '';
  const favStatus = document.getElementById('po-comp-fav-status');
  if (favStatus) favStatus.textContent = '';
  const compError = document.getElementById('po-comp-error');
  if (compError) compError.style.display = 'none';
  // Prévia de IA/formulário de publicar na Galeria eram da composição
  // ANTERIOR — não faz sentido continuar mostrando (ver
  // generateAiPreviewForGallery/galleryPublishToggleBtn).
  galleryAiPreviewImage = null;
  galleryAiPreviewStatus = null;
  const aiPreviewWrap = document.getElementById('po-gallery-ai-preview-wrap');
  if (aiPreviewWrap) aiPreviewWrap.style.display = 'none';
  const basePreviewWrap = document.getElementById('po-gallery-base-preview-wrap');
  if (basePreviewWrap) basePreviewWrap.style.display = 'none';
  const publishForm = document.getElementById('po-gallery-publish-form');
  if (publishForm) publishForm.style.display = 'none';
  // Solta o vínculo com o post da Galeria em edição admin (se algum) — ver
  // maybeLoadGalleryPostForAdminEdit/saveGalleryPostAdminEdit. Também tira o
  // ?editGalleryPost=<id> da URL (sem recarregar a página) pra um F5
  // acidental não voltar a carregar o post antigo.
  editingGalleryPostId = null;
  editingGalleryPostName = null;
  updateGalleryAdminEditBanner();
  const adminEditStatus = document.getElementById('po-comp-admin-edit-status');
  if (adminEditStatus) adminEditStatus.style.display = 'none';
  if (new URLSearchParams(window.location.search).has('editGalleryPost')) {
    const url = new URL(window.location.href);
    url.searchParams.delete('editGalleryPost');
    window.history.replaceState({}, '', url);
  }
}
const compResetBtn = document.getElementById('po-comp-reset-btn');
if (compResetBtn) compResetBtn.addEventListener('click', resetComposition);

function renderCompositionSlots() {
  const container = document.getElementById('po-comp-slots');
  if (!container) return;
  container.innerHTML = '';
  // Unidade GLOBAL (po-unit-select) — mesmo motivo do card da vitrine
  // (renderModuleGallery) e do carrinho (renderCartItemRow): a medida de
  // cada card da composição também precisa seguir mm/cm/m/ft/pol atual, não
  // ficar travada em mm.
  const compUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';

  // Divisor "+" ANTES de cada COLUNA preenchida (pedido do usuário: "acrescentar
  // algum módulo no meio de dois já configurados") — inserir na posição idx
  // empurra essa coluna e todas depois dela uma casa pra direita. O append no
  // final continua sendo o card vazio de sempre, não precisa de divisor ali.
  const addDivider = (insertIndex) => {
    const divider = document.createElement('div');
    divider.className = 'po-comp-slot-divider';
    divider.textContent = '+';
    divider.title = I18n.t('composition.insert_here_title');
    divider.addEventListener('click', () => startCompositionSlotConfig(insertIndex, { insert: true }));
    container.appendChild(divider);
  };

  // Um card por slot (mesmo HTML/comportamento de sempre) — extraído do
  // antigo forEach pra poder ser chamado tanto pro slot BASE de uma coluna
  // quanto pro slot EMPILHADO em cima dele (ver buildColumn abaixo).
  // slotIndex aqui é sempre o índice de verdade em compositionSlots (não a
  // posição visual), usado por editCompositionSlot/remoção.
  const buildSlotCard = (slot, slotIndex) => {
    const div = document.createElement('div');
    div.className = 'po-comp-slot filled';
    div.title = I18n.t('composition.click_to_edit_title');
    div.innerHTML = `
      ${slot.thumbnail_data_url ? `<img class="po-comp-slot-thumb" src="${slot.thumbnail_data_url}" alt="${slot.module.name}" />` : ''}
      <div class="po-comp-slot-name">${slot.module.name}</div>
      <div class="po-comp-slot-dims">${formatDimension(slot.width_mm, compUnit)} x ${formatDimension(slot.height_mm, compUnit)} x ${formatDimension(slot.depth_mm, compUnit)}</div>
      <label class="po-comp-slot-floor-height">
        <span>${I18n.t('composition.floor_height_short_label')}</span>
        <input type="text" inputmode="decimal" class="po-comp-slot-floor-height-input" value="${formatDimensionNumber(slot.floor_height_mm || 0, compUnit)}" />
        <span class="po-comp-slot-floor-height-unit">${unitAbbrev(compUnit)}</span>
      </label>
      <button type="button" class="po-comp-slot-remove" title="${I18n.t('composition.remove_title')}">×</button>
    `;
    // Clicar no card (fora do X) reabre o configurador já preenchido com a
    // configuração salva deste slot — pedido do usuário: "poder editar os
    // módulos... antes de adicionar ao pedido".
    div.addEventListener('click', () => editCompositionSlot(slotIndex));
    div.querySelector('.po-comp-slot-remove').addEventListener('click', (ev) => {
      ev.stopPropagation(); // não deixa o clique "vazar" pro card e abrir edição junto
      // Remove o slot clicado E, se ele for a BASE de uma coluna, o que
      // estiver empilhado em cima dele junto (senão sobraria um
      // stack_on_id órfão apontando pra um slot que não existe mais).
      compositionSlots = compositionSlots.filter((s) => s.id !== slot.id && s.stack_on_id !== slot.id);
      renderCompositionSlots();
    });

    // Altura do chão editável DIRETO no card (pedido do usuário, 2026-07-16:
    // "poder escolher a altura de cada item... que eu possa mexer depois de
    // inserido vendo os dois no mesmo ambiente") — não precisa reabrir o
    // configurador completo pra ajustar isso. stopPropagation no <label>
    // (cobre clique tanto no texto quanto no input, já que o clique borbulha
    // do input até o label) evita que o clique "vaze" pro card e abra a
    // edição do módulo. Só atualiza os totais (chips) + regera o 3D se já
    // estiver aberto — NÃO chama renderCompositionSlots() de novo aqui,
    // senão o campo perderia o foco a cada edição.
    const floorHeightLabel = div.querySelector('.po-comp-slot-floor-height');
    const floorHeightInput = div.querySelector('.po-comp-slot-floor-height-input');
    if (floorHeightLabel) floorHeightLabel.addEventListener('click', (ev) => ev.stopPropagation());
    if (floorHeightInput) {
      floorHeightInput.addEventListener('change', () => {
        // Texto livre na unidade global (compUnit — mesma variável usada
        // pra formatar largura/altura/profundidade deste card, ver início de
        // renderCompositionSlots), igual ao campo do modal (ver
        // applyFloorHeightInput). Texto inválido é ignorado — devolve o
        // valor válido anterior formatado em vez de zerar o slot.
        const mm = parseDimensionInput(floorHeightInput.value, compUnit);
        const v = mm === null || isNaN(mm) ? Number(slot.floor_height_mm || 0) : Math.max(0, mm);
        slot.floor_height_mm = v;
        floorHeightInput.value = formatDimensionNumber(v, compUnit);
        renderCompositionTotals();
        const comp3dWrap = document.getElementById('po-comp-3d-wrap');
        if (comp3dWrap && comp3dWrap.style.display !== 'none') generateComposition3D();
      });
      floorHeightInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') { ev.preventDefault(); floorHeightInput.blur(); }
      });
    }
    return div;
  };

  // Colunas = slots-base (sem stack_on_id), na ordem em que aparecem em
  // compositionSlots (esquerda->direita, como sempre). Cada coluna pode ter
  // no máximo um slot empilhado em cima dela (stack_on_id === base.id) —
  // "um ou 2 blocos a escolher", pedido do usuário.
  const stackedByBaseId = new Map();
  compositionSlots.forEach((s) => { if (s.stack_on_id) stackedByBaseId.set(s.stack_on_id, s); });

  compositionSlots.forEach((base, baseIdx) => {
    if (base.stack_on_id) return; // só itera colunas (bases) aqui — o empilhado é desenhado junto da base dele
    addDivider(baseIdx);

    const stacked = stackedByBaseId.get(base.id);
    const columnWrap = document.createElement('div');
    columnWrap.className = 'po-comp-slot-column';
    columnWrap.style.display = 'flex';
    columnWrap.style.flexDirection = 'column';
    columnWrap.style.gap = '6px';

    // Botão "Colocar em cima" ACIMA do quadro (pedido do usuário, 2026-07-16:
    // "quero o botao em cima do quadro ao inves de baixo") — só aparece numa
    // coluna que ainda não tem os 2 blocos (base + empilhado); clicar nele
    // abre o configurador igual ao card vazio do final, mas marcando
    // addStackOnId pra esse novo módulo nascer na MESMA coluna de `base`,
    // sem avançar a fileira.
    if (!stacked) {
      const stackBtn = document.createElement('button');
      stackBtn.type = 'button';
      stackBtn.className = 'po-comp-slot-stack-btn secondary';
      stackBtn.textContent = '↑ ' + I18n.t('composition.add_stacked_btn');
      stackBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        startCompositionSlotConfig(compositionSlots.length, { stackOnId: base.id });
      });
      columnWrap.appendChild(stackBtn);
    }

    if (stacked) {
      // Empilhado desenhado ACIMA da base na lista (fisicamente fica em
      // cima dele no ambiente) — índice de verdade em compositionSlots via
      // indexOf, já que stackedByBaseId guarda o objeto, não a posição.
      columnWrap.appendChild(buildSlotCard(stacked, compositionSlots.indexOf(stacked)));
    }
    columnWrap.appendChild(buildSlotCard(base, baseIdx));

    container.appendChild(columnWrap);
  });

  // Sempre um slot vazio no final — é ele que o cliente clica pra adicionar
  // o PRÓXIMO módulo (índice = tamanho atual da fileira).
  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'po-comp-slot empty';
  emptyDiv.innerHTML = `<span class="po-comp-slot-plus">+</span><span>${I18n.t('composition.add_module_slot')}</span>`;
  emptyDiv.addEventListener('click', () => startCompositionSlotConfig(compositionSlots.length));
  container.appendChild(emptyDiv);

  const genBtn = document.getElementById('po-comp-generate-btn');
  const genHint = document.getElementById('po-comp-generate-hint');
  genBtn.disabled = compositionSlots.length < 2;
  genHint.style.display = compositionSlots.length < 2 ? 'block' : 'none';

  renderCompositionTotals();

  // Se o 3D da composição JÁ estava aberto (cliente clicou "Gerar 3D" antes)
  // e agora editou/inseriu/removeu um módulo, regera sozinho em vez de
  // deixar o desenho velho na tela até o próximo clique manual — pedido do
  // usuário: "quando voltei precisei gerar de novo pra atualizar... talvez
  // na alteração já deva gerar automático pra não confundir".
  const comp3dWrap = document.getElementById('po-comp-3d-wrap');
  if (comp3dWrap && comp3dWrap.style.display !== 'none') {
    if (compositionSlots.length >= 2) {
      generateComposition3D();
    } else {
      // Composição deixou de ter módulos suficientes pra gerar (removeu até
      // sobrar só 1) — esconde o resultado velho em vez de deixar uma cena
      // desatualizada visível.
      comp3dWrap.style.display = 'none';
    }
  }
}

// Reabre o configurador já preenchido com a configuração salva de um slot da
// composição (clicou no card, não no X de remover) — mantém o MESMO módulo
// do slot (não dá pra trocar de módulo num slot já configurado nesta
// versão), só restaura cor/medida/opcionais/modelo/sub-configurações salvas
// em vez de voltar tudo pro padrão do módulo. Reaproveita 100% do modo
// "Composição" que já existe (startCompositionSlotConfig) — ao confirmar,
// o handler de po-add-item-btn sobrescreve esta MESMA posição (addTargetSlotIndex),
// exatamente como preencher um slot vazio.
async function editCompositionSlot(slotIndex) {
  const slot = compositionSlots[slotIndex];
  if (!slot) return;
  startCompositionSlotConfig(slotIndex);
  try {
    await selectModule(slot.module.id);
    if (!currentModule) throw new Error(I18n.t('composition.edit_module_unavailable_error'));
    restoreSlotStateIntoConfigurator(slot);
  } catch (err) {
    // Módulo pode ter sido desativado/removido do catálogo desde que este
    // slot foi configurado -- não deixa o modal quebrado aberto, volta pra
    // composição e avisa em vez de estourar um erro sem tratamento.
    exitCompositionSlotConfig();
    const errorEl = document.getElementById('po-comp-error');
    if (errorEl) {
      errorEl.textContent = I18n.t('composition.edit_module_unavailable_error');
      errorEl.style.display = 'block';
    }
  }
}

// Aplica, na tela de configuração recém-aberta pro MESMO módulo (ver
// editCompositionSlot), tudo que o cliente já tinha escolhido antes: medida
// exata, cor por papel, modelo de dobradiça/corrediça, quantidade de
// prateleiras/gavetas configuráveis, opcionais marcados e sub-configuração de
// medida de peças-módulo aninhadas. selectModule() já deixou tudo no valor
// PADRÃO do módulo — aqui só sobrescreve com o que estava salvo no slot.
function restoreSlotStateIntoConfigurator(slot) {
  // Altura do chão salva deste slot — startCompositionSlotConfig (chamado
  // por editCompositionSlot antes desta função) já preencheu o campo com um
  // palpite (0, ou sugestão de empilhamento), mas editar um slot já
  // preenchido é o valor de VERDADE que estava salvo, não um palpite. Feito
  // ANTES de mexer no slider de altura (abaixo) de propósito: o teto
  // efetivo (ceilingMaxHeightMm) depende de currentFloorHeightMm (pedido do
  // usuário, 2026-07-16: "ele tem que considerar de onde parte do chao pra
  // dar o maximo") — se restaurasse a altura primeiro, o clamp usaria o
  // max ANTIGO (calculado com a altura do chão errada, geralmente 0).
  currentFloorHeightMm = Number(slot.floor_height_mm || 0);
  refreshFloorHeightInputUI();
  applyRoomSettingsToConfigurator();

  const widthInput = document.getElementById('po-width-input');
  const heightInput = document.getElementById('po-height-input');
  const depthInput = document.getElementById('po-depth-input');
  if (widthInput) widthInput.value = clamp(slot.width_mm, parseFloat(widthInput.min), parseFloat(widthInput.max));
  if (heightInput) heightInput.value = clamp(slot.height_mm, parseFloat(heightInput.min), parseFloat(heightInput.max));
  if (depthInput) depthInput.value = clamp(slot.depth_mm, parseFloat(depthInput.min), parseFloat(depthInput.max));
  setupDimensionPresetsUI();
  updateDimensionUnitUI();

  // Cores — re-renderiza os grupos de swatches já com a cor salva marcada
  // (ver renderColorRoleSwatchGroups, agora aceita presets opcionais) —
  // colorsByRole pro nível raiz E pieceColorOverrides (migration 046) por
  // peça-módulo aninhada com cor separada.
  renderColorRoleSwatchGroups(slot.colorsByRole, slot.pieceColorOverrides);

  const hingeSelect = document.getElementById('po-hinge-model-select');
  const slideSelect = document.getElementById('po-slide-model-select');
  if (hingeSelect && slot.hingeModel) hingeSelect.value = slot.hingeModel.id;
  if (slideSelect && slot.slideModel) slideSelect.value = slot.slideModel.id;

  document.querySelectorAll('.po-shelf-qty-input').forEach((input) => {
    const saved = slot.shelfQuantities ? slot.shelfQuantities[input.dataset.pieceId] : undefined;
    if (saved !== undefined && saved !== null) input.value = saved;
  });

  selectedOptionalComponentIds = new Set(slot.selectedOptionalIds || []);
  renderOptionalComponents();

  // Sub-configuração de medida de peças-módulo aninhadas (migration 036) —
  // marca os eixos salvos como TOCADOS, senão o próximo recálculo os
  // sobrescreveria de volta pro valor "acompanha o pai" (ver
  // syncUntouchedPieceDimSliders/touchedPieceDimAxes).
  touchedPieceDimAxes = new Set();
  Object.keys(slot.dimOverrides || {}).forEach((pieceId) => {
    const axesMm = slot.dimOverrides[pieceId];
    Object.keys(axesMm).forEach((key) => {
      const axis = key.replace('_mm', '');
      const slider = document.querySelector(`.po-piece-subconfig-slider[data-piece-id="${pieceId}"][data-axis="${axis}"]`);
      if (!slider) return;
      slider.value = axesMm[key];
      touchedPieceDimAxes.add(`${pieceId}:${axis}`);
      const field = slider.closest('.dim-field');
      const resetLink = field ? field.querySelector('.po-piece-subconfig-reset') : null;
      if (resetLink) resetLink.style.display = 'inline';
      if (slider._refreshLabels) slider._refreshLabels();
    });
  });

  recalculatePreview();
}

// Medidas TOTAIS da composição, em mm — como os módulos ficam sempre lado a
// lado da esquerda pra direita (ver hint da aba), a largura total é a SOMA
// de cada slot; altura e profundidade não se somam (são medidas "de pé",
// lado a lado), usa o MAIOR valor entre os slots. Mesma fórmula usada tanto
// pra escrever os chips acima da fileira quanto pras cotas desenhadas na
// cena 3D (ver generateComposition3D/ViewerComposition.render) — um só lugar
// pra essa conta, os dois lugares sempre concordam.
// Empilhamento (2026-07-16): largura total soma uma vez POR COLUNA (base +
// empilhado compartilham o mesmo X no 3D — ver viewer3d_composition.js —
// então contar os dois separadamente infla a largura); usa a MAIOR largura
// entre base/empilhado como largura da coluna (não força os dois a serem
// iguais). Altura total passa a considerar floor_height_mm: o topo de cada
// bloco é floor_height_mm + height_mm, e a altura total da composição é o
// maior topo entre todos os blocos (não só o maior height_mm sozinho).
// Sem nenhum slot empilhado (stack_on_id sempre null, floor_height_mm
// sempre 0 — caso de toda composição existente antes desta feature), essa
// conta é IDÊNTICA à antiga: colunas = todos os slots, largura da coluna =
// width_mm do próprio, topo = height_mm.
function computeCompositionTotalsMm() {
  if (compositionSlots.length === 0) return null;
  const baseSlots = compositionSlots.filter((s) => !s.stack_on_id);
  const stackedByBaseId = new Map();
  compositionSlots.forEach((s) => { if (s.stack_on_id) stackedByBaseId.set(s.stack_on_id, s); });

  let totalWidth = 0;
  let totalHeight = 0;
  baseSlots.forEach((base) => {
    const stacked = stackedByBaseId.get(base.id);
    totalWidth += Math.max(Number(base.width_mm || 0), stacked ? Number(stacked.width_mm || 0) : 0);
    const baseTop = Number(base.floor_height_mm || 0) + Number(base.height_mm || 0);
    const stackedTop = stacked ? Number(stacked.floor_height_mm || 0) + Number(stacked.height_mm || 0) : 0;
    totalHeight = Math.max(totalHeight, baseTop, stackedTop);
  });

  return {
    totalWidth,
    totalHeight,
    totalDepth: Math.max(...compositionSlots.map((s) => Number(s.depth_mm || 0)))
  };
}

// Chips de texto acima da fileira de slots com as medidas totais — sempre
// mostra as 3 (pedido do usuário: "não precisa selecionar ou não", depois de
// pedir inicialmente pra poder esconder cada uma). Fica útil mesmo antes de
// gerar o 3D (ver buildDimensionAnnotations em viewer3d_composition.js, que
// desenha as mesmas medidas direto no desenho quando o 3D já foi gerado).
function renderCompositionTotals() {
  const line = document.getElementById('po-comp-totals-line');
  if (!line) return;
  const totals = computeCompositionTotalsMm();
  if (!totals) { line.innerHTML = ''; return; }

  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  line.innerHTML = [
    `<span class="po-comp-total-chip">${I18n.t('composition.total_width_label')}: ${formatDimension(totals.totalWidth, unit)}</span>`,
    `<span class="po-comp-total-chip">${I18n.t('composition.total_height_label')}: ${formatDimension(totals.totalHeight, unit)}</span>`,
    `<span class="po-comp-total-chip">${I18n.t('composition.total_depth_label')}: ${formatDimension(totals.totalDepth, unit)}</span>`
  ].join('');
}

// Abre o catálogo/configurador de "Novo Orçamento" pra escolher e configurar
// o módulo deste slot — reaproveita a tela inteira (grade de módulos,
// medidas, cores, opcionais) tal como já funciona pra adicionar ao carrinho,
// SEM duplicar nada. A diferença pro fluxo normal: em vez de trocar de aba
// de verdade (o que esconderia a Composição por trás), abre "Novo Orçamento"
// como um MODAL de tela cheia por cima da própria aba Composição — o
// cliente nunca "sai" visualmente da tela de composição, só volta pra ela
// (fechando o modal) ao confirmar ou cancelar. Só marca addTargetSlotIndex
// pra po-add-item-btn saber que o destino deste resultado é um slot da
// composição, não o pedido de verdade. opts.insert=true (divisor "+" entre
// cards) marca o modo INSERÇÃO (ver compositionInsertMode) em vez de
// sobrescrever/editar a posição.
// Atalhos rápidos pro campo de altura do chão — "0 (chão)" e "Rodapé
// (Xmm)" (pedido do usuário, 2026-07-16: "deve ter a opcao proxima do
// rodape, ou 0 ou rodape de padrao e livre como ja esta") — o campo
// continua 100% livre pra digitar qualquer valor, isto é só um atalho pros
// dois casos mais comuns. Rodapé usa roomSettings.baseboard_mm (mesmo
// valor configurado em po-baseboard-input, topo do portal — ver "Pé
// direito (ceiling) e rodapé (baseboard) da casa do cliente" no topo do
// arquivo), arredondado só pro RÓTULO do chip (o valor aplicado no campo é
// o mm exato, sem arredondar).
function renderFloorHeightPresetChips() {
  const wrap = document.getElementById('po-comp-floor-height-preset-chips');
  if (!wrap) return;
  wrap.innerHTML = '';
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const presets = [
    { value: 0, label: I18n.t('step2.floor_height_preset_floor') },
    // Rótulo formatado na unidade global atual (não trava em "mm") — mesmo
    // motivo do resto do campo, ver refreshFloorHeightInputUI.
    { value: roomSettings.baseboard_mm, label: `${I18n.t('step2.floor_height_preset_baseboard')} (${formatDimension(roomSettings.baseboard_mm, unit)})` }
  ];
  presets.forEach((p) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'dim-preset-chip';
    chip.textContent = p.label;
    chip.addEventListener('click', () => {
      currentFloorHeightMm = p.value;
      refreshFloorHeightInputUI();
      // Re-trava a régua de altura pro novo teto efetivo (ver
      // applyFloorHeightInput/ceilingMaxHeightMm — mesmo motivo).
      applyRoomSettingsToConfigurator();
      // Clicar num chip não passa pelo 'change' do campo de texto (ver
      // applyFloorHeightInput), então precisa forçar o refit aqui também,
      // senão a câmera não acompanha o chip "Rodapé" erguendo o módulo (ver
      // comentário em applyFloorHeightInput).
      viewer3dNeedsRefit = true;
      recalculatePreview();
    });
    wrap.appendChild(chip);
  });
}

function startCompositionSlotConfig(slotIndex, opts) {
  opts = opts || {};
  addTargetSlotIndex = slotIndex;
  compositionInsertMode = !!opts.insert;
  // Empilhamento (ver botão "Colocar em cima" em renderCompositionSlots):
  // opts.stackOnId = id do slot-base desta coluna. Guarda em addStackOnId
  // pro handler de po-add-item-btn saber que este módulo (novo, sempre
  // ADICIONADO no final do array — nunca insert) deve nascer com
  // stack_on_id apontando pra essa base, em vez de abrir coluna nova.
  addStackOnId = opts.stackOnId || null;
  highlightSelectedModuleCard('');
  document.getElementById('po-config-section').style.display = 'none';
  document.getElementById('po-module-description').textContent = '';
  currentModule = null;
  lastItemResult = null;

  document.getElementById('po-comp-mode-banner').style.display = 'flex';
  document.getElementById('po-comp-mode-slot-label').textContent = String(slotIndex + 1);
  document.getElementById('po-add-item-btn').textContent = I18n.t('step2.add_to_composition_btn');

  // Altura do chão (mm) — só existe em modo Composição, mesma visibilidade
  // do banner acima (ver comentário no HTML, portal.html). Empilhando em
  // cima de uma base (addStackOnId setado), sugere a altura do TOPO dela
  // (floor_height_mm + height_mm) como ponto de partida — editável, não
  // trava o cliente nesse valor. Editando um slot já existente (nem insert
  // nem stack), o valor de verdade vem de restoreSlotStateIntoConfigurator
  // (chamada logo depois por editCompositionSlot), que sobrescreve isto.
  const floorHeightWrap = document.getElementById('po-comp-floor-height-wrap');
  if (floorHeightWrap) floorHeightWrap.style.display = 'block';
  {
    const baseSlot = addStackOnId ? compositionSlots.find((s) => s.id === addStackOnId) : null;
    currentFloorHeightMm = baseSlot ? Number(baseSlot.floor_height_mm || 0) + Number(baseSlot.height_mm || 0) : 0;
    refreshFloorHeightInputUI();
  }
  renderFloorHeightPresetChips();

  const newOrderTab = document.getElementById('po-tab-new-order');
  newOrderTab.classList.add('po-modal-mode');
  newOrderTab.style.display = 'block';
  newOrderTab.scrollTop = 0;
  window.scrollTo(0, 0);
}

// Fecha o modal e devolve o botão/estado normais de "Novo Orçamento"
// (adicionar ao pedido) — a aba Composição nunca foi escondida, então basta
// esconder o modal de volta pra "voltar" pra ela. Não desfaz slots já
// confirmados.
function exitCompositionSlotConfig() {
  addTargetSlotIndex = null;
  compositionInsertMode = false;
  addStackOnId = null;
  document.getElementById('po-comp-mode-banner').style.display = 'none';
  document.getElementById('po-add-item-btn').textContent = I18n.t('step2.add_to_order_btn');
  const floorHeightWrap = document.getElementById('po-comp-floor-height-wrap');
  if (floorHeightWrap) floorHeightWrap.style.display = 'none';
  const newOrderTab = document.getElementById('po-tab-new-order');
  newOrderTab.classList.remove('po-modal-mode');
  newOrderTab.style.display = 'none';
}

const compModeCancelBtn = document.getElementById('po-comp-mode-cancel-btn');
if (compModeCancelBtn) {
  compModeCancelBtn.addEventListener('click', () => {
    exitCompositionSlotConfig();
    highlightSelectedModuleCard('');
    document.getElementById('po-config-section').style.display = 'none';
    document.getElementById('po-module-description').textContent = '';
    currentModule = null;
    lastItemResult = null;
  });
}

// "Gerar 3D da composição" — monta os módulos dos slots lado a lado, em
// escala real, numa cena 3D NOVA e independente (js/viewer3d_composition.js)
// do visualizador de configuração (Viewer3D/#po-viewer3d-canvas, que
// continua intocado e é reaproveitado só como overlay pra configurar cada
// slot). Cada slot já guarda tudo que precisa pra isso (slot.pieces +
// width/height/depth_mm + boxColor/doorColor/shelfQuantities — ver
// po-add-item-btn acima), então não é preciso buscar nada de novo no banco:
// resolvePiecesForViewer (já usado pra desenhar o 3D de configuração de um
// módulo só) resolve as medidas/posições de cada peça, e
// Viewer3D.buildStandaloneAssembly (nova função aditiva em viewer3d.js, que
// não muda nada do comportamento existente) monta essa lista de peças num
// Group 3D autônomo — a mesma lógica de posicionamento de sempre, só
// devolvida pronta pra encaixar noutra cena em vez de desenhar direto na
// cena singleton.
// Extraída do antigo listener de clique do compGenerateBtn (ver abaixo) pra
// poder ser chamada de dois lugares: o clique manual em "Gerar 3D da
// composição" E automaticamente de renderCompositionSlots() sempre que o
// cliente edita/insere/remove um módulo com o 3D JÁ ABERTO na tela — pedido
// do usuário: "alterei a configuração de um módulo já gerado 3D, mas quando
// voltei precisei gerar de novo pra atualizar... talvez na alteração já
// deva gerar automático pra não confundir". Não faz scrollIntoView aqui (só
// no clique manual) — regerar sozinho enquanto o cliente está editando não
// deve ficar puxando a tela pra baixo.
// ---------- Troca rápida de cor das laterais (pedido do usuário, 2026-07-16) ----------
// "quero colocar um troca rapida de cores nas laterias... deve ficar em
// quadros do lado do 3d, sem espremer o visualizador" — um controle SÓ
// (opção escolhida quando perguntado, em vez de um por módulo) que troca a
// cor de TODOS os módulos da composição de uma vez, ao lado do canvas.

// Detecta o papel de cor usado por QUALQUER peça de um módulo (qualquer
// position_role — não só 'left'/'right' — pedido do usuário, 2026-07-16:
// "ainda so tenho uma opcao de cor pra trocar, preciso painel, caixas,
// portas": o catálogo usa um color_role_id PRÓPRIO por peça/papel, ex. um
// papel "Caixa" nas laterais, outro "Porta" nas peças de frente com
// dobradiça, outro "Painel" em alguma peça de fundo/prateleira — restringir
// a busca a left/right escondia todos os outros), olhando recursivamente
// peças-módulo aninhadas — mesmo cuidado do bug já corrigido em
// setupOptionVisibility (ver memória "shallow piece checks"): checar só o
// nível raiz perderia peças escondidas dentro de um módulo usado como peça.
// Soma na Map acc: color_role_id -> quantas peças usam esse papel, em toda a
// composição.
function collectCompositionColorRoleIds(piecesList, acc) {
  (piecesList || []).forEach((p) => {
    if (p.color_role_id) {
      acc.set(p.color_role_id, (acc.get(p.color_role_id) || 0) + 1);
    }
    if (p.child_pieces && p.child_pieces.length) collectCompositionColorRoleIds(p.child_pieces, acc);
  });
  return acc;
}

// true se ALGUMA peça (recursivo, qualquer position_role) deste módulo usa
// o papel de cor roleId — usado pra saber quais slots o painel afeta.
function pieceTreeHasColorRole(piecesList, roleId) {
  return (piecesList || []).some((p) =>
    p.color_role_id === roleId ||
    (p.child_pieces && p.child_pieces.length && pieceTreeHasColorRole(p.child_pieces, roleId))
  );
}

// Descobre TODOS os papéis de cor usados em QUALQUER peça da composição
// atual (não só o mais comum — pedido do usuário, 2026-07-16: "so apareceu
// um modelo de cor pra trocar", depois generalizado pra além de laterais:
// "preciso painel, caixas, portas") e, pra CADA papel, busca as cores
// cadastradas em todos os módulos afetados por ele, devolvendo só a
// INTERSEÇÃO (cor que existe pra todo mundo naquele grupo) — assim qualquer
// swatch mostrado sempre funciona em todos os módulos que aquele grupo
// afeta, sem precisar checar módulo por módulo na hora do clique. Devolve
// [] se a composição não tem nenhuma peça com cor cadastrada (painel fica
// escondido). Um módulo pode aparecer em mais de um grupo (ex: usa "Caixa"
// nas laterais E "Porta" na frente) — cada grupo é independente, vira sua
// própria aba na UI (ver renderCompositionSideColorPanel).
// Extraído pra receber QUALQUER lista de slots (pedido do usuário
// 2026-07-26, aba Projetos: "que eu possa trocar as cores conforme os
// modelos de todos modulos inseridos de uma vez so" — mesmo painel de troca
// rápida que já existia só na Composição, agora também em Projetos, ver
// loadProjectColorRoleGroups/applyColorRoleToAllProjectSlots abaixo). Puro
// leitura (só monta os grupos disponíveis), nenhuma mudança de comportamento
// pra quem já chamava loadCompositionColorRoleGroups().
async function loadColorRoleGroupsForSlots(slotsList) {
  const roleTally = new Map();
  slotsList.forEach((slot) => collectCompositionColorRoleIds(slot.pieces, roleTally));
  if (roleTally.size === 0) return [];

  const roleIds = [...roleTally.keys()];
  const moduleIdsByRole = new Map();
  roleIds.forEach((roleId) => {
    const ids = [...new Set(
      slotsList
        .filter((slot) => pieceTreeHasColorRole(slot.pieces, roleId))
        .map((slot) => slot.module.id)
    )];
    moduleIdsByRole.set(roleId, ids);
  });

  const allModuleIds = [...new Set([].concat(...moduleIdsByRole.values()))];
  if (allModuleIds.length === 0) return [];

  const { data, error } = await supabaseClient
    .from('module_colors')
    .select('module_id, color_role_id, color_id, colors(*)')
    .in('color_role_id', roleIds)
    .in('module_id', allModuleIds);
  if (error || !data) return [];

  // byRoleModule: roleId -> moduleId -> Map(color_id -> colorObj)
  const byRoleModule = new Map();
  data.forEach((row) => {
    if (!row.colors || !row.colors.active) return;
    if (!byRoleModule.has(row.color_role_id)) byRoleModule.set(row.color_role_id, new Map());
    const perModule = byRoleModule.get(row.color_role_id);
    if (!perModule.has(row.module_id)) perModule.set(row.module_id, new Map());
    perModule.get(row.module_id).set(row.color_id, row.colors);
  });

  const groups = [];
  roleIds.forEach((roleId) => {
    const moduleIds = moduleIdsByRole.get(roleId) || [];
    const perModule = byRoleModule.get(roleId);
    if (!perModule || moduleIds.length === 0) return;
    let commonIds = null;
    moduleIds.forEach((mId) => {
      const colorMap = perModule.get(mId);
      const ids = new Set(colorMap ? colorMap.keys() : []);
      commonIds = commonIds === null ? ids : new Set([...commonIds].filter((id) => ids.has(id)));
    });
    if (!commonIds || commonIds.size === 0) return;
    const anyColorMap = perModule.get(moduleIds[0]);
    // Ordem = a mesma do cadastro (colors.sort_order, migration_020) — sem
    // isso a ordem vinha de [...Set] (ordem de retorno da query em
    // module_colors, sem nenhum .order(), então praticamente aleatória/por
    // id). Pedido do usuário (2026-07-29, depois de ver o painel de troca
    // rápida): "as cores ainda nao estao na sequencia certa cadastrada no
    // administrativo" — função COMPARTILHADA (Composição/Projetos/tela do
    // pedido usam todas loadColorRoleGroupsForSlots), corrigir aqui resolve
    // as 3 telas de uma vez.
    const colors = [...commonIds]
      .map((id) => anyColorMap.get(id))
      .filter(Boolean)
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    if (colors.length === 0) return;
    const roleName = (colorRolesCache.find((r) => r.id === roleId) || {}).name || '';
    groups.push({ roleId, roleName, colors, moduleIds });
  });
  return groups;
}

async function loadCompositionColorRoleGroups() {
  return loadColorRoleGroupsForSlots(compositionSlots);
}

// Aplica a cor escolhida a um papel de cor (qualquer um — Caixa/Porta/
// Painel/etc., ver loadCompositionColorRoleGroups) em TODO módulo da
// composição que tiver peça com esse papel (ver pieceTreeHasColorRole) —
// recalcula o preço de cada slot afetado (cor muda custo de chapa/fita de
// borda, ver Pricing.calculateLeafPiece) e regera a cena + totais via
// renderCompositionSlots(). Erro num slot específico não trava os outros —
// cada um roda seu próprio try/catch, mantendo o preço/cor anteriores
// daquele slot se a troca não fechar por algum motivo (ex: catálogo mudou
// entre a hora que o slot foi criado e agora).
function applyColorRoleToComposition(roleId, color) {
  const errorEl = document.getElementById('po-comp-side-color-error');
  if (errorEl) errorEl.style.display = 'none';
  let firstErrorMsg = null;
  compositionSlots.forEach((slot) => {
    if (!pieceTreeHasColorRole(slot.pieces, roleId)) return;
    const nextColorsByRole = { ...slot.colorsByRole, [roleId]: color };
    try {
      const result = slot.module.is_decoration
        ? { total: 0, breakdown: [] }
        : Pricing.calculateModulePrice({
          module: slot.module, pieces: slot.pieces, colorsByRole: nextColorsByRole,
          hingeModel: slot.hingeModel, slideModel: slot.slideModel,
          shelfQuantities: slot.shelfQuantities, dimOverrides: slot.dimOverrides,
          // pieceColorOverrides (migration 046) — a troca em massa não pode apagar cor
          // separada que o cliente já tinha escolhido pra uma peça-módulo específica
          // (override sempre vence, ver effectiveColorsForPiece em pricing.js).
          pieceColorOverrides: slot.pieceColorOverrides,
          width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
          markupMultiplier: pricingMarkupMultiplier
        });
      slot.colorsByRole = nextColorsByRole;
      slot.selectedColors = Object.keys(nextColorsByRole).map((rid) => ({
        role_id: rid,
        role_name: (colorRolesCache.find((r) => r.id === rid) || {}).name || null,
        color_id: nextColorsByRole[rid] ? nextColorsByRole[rid].id : null,
        color_name: nextColorsByRole[rid] ? nextColorsByRole[rid].name : null
      }));
      slot.result = result;
    } catch (err) {
      if (!firstErrorMsg) firstErrorMsg = err.message || String(err);
    }
  });
  if (firstErrorMsg && errorEl) {
    errorEl.textContent = I18n.t('composition.side_color_error', { msg: firstErrorMsg });
    errorEl.style.display = 'block';
  }
  renderCompositionSlots(); // atualiza cards/totais + regera o 3D sozinho (já aberto, ver fim da função)
}

// Monta (ou esconde) o painel de troca rápida ao lado do canvas — chamado
// sempre que a composição 3D é (re)gerada, pra continuar em sincronia com
// os módulos atuais (adicionar/remover um slot pode mudar qual papel de
// cor é "o das laterais" ou quais cores são comuns a todos).
async function renderCompositionSideColorPanel() {
  const panel = document.getElementById('po-comp-side-color-panel');
  const tabsEl = document.getElementById('po-comp-side-color-tabs');
  const swatchesEl = document.getElementById('po-comp-side-color-swatches');
  if (!panel || !tabsEl || !swatchesEl) return;
  const groups = await loadCompositionColorRoleGroups();
  tabsEl.innerHTML = '';
  swatchesEl.innerHTML = '';
  if (!groups.length) { panel.style.display = 'none'; return; }
  panel.style.display = 'block';

  // Por ABAS (pedido do usuário, 2026-07-16: "pode fazer por abas pra nao
  // ocupar muito espaco na tela") — um grupo por papel de cor encontrado
  // (Caixa/Porta/Painel/etc., ver loadCompositionColorRoleGroups, generalizado
  // além de só laterais), mas só a aba ATIVA mostra as swatches, em vez de
  // empilhar todos os grupos verticalmente (crescia demais com 3+ papéis).
  // Mantém a aba ativa entre re-renders (compColorActiveTabRoleId) — só cai
  // pro primeiro grupo se a aba ativa não existir mais nesta lista.
  if (!groups.some((g) => g.roleId === compColorActiveTabRoleId)) {
    compColorActiveTabRoleId = groups[0].roleId;
  }

  groups.forEach((group) => {
    const tabBtn = document.createElement('button');
    tabBtn.type = 'button';
    tabBtn.className = 'po-comp-color-tab-btn';
    tabBtn.textContent = group.roleName || I18n.t('color.prefix');
    if (group.roleId === compColorActiveTabRoleId) tabBtn.classList.add('active');
    tabBtn.addEventListener('click', () => {
      compColorActiveTabRoleId = group.roleId;
      renderCompositionColorTabSwatches(groups);
    });
    tabsEl.appendChild(tabBtn);
  });

  renderCompositionColorTabSwatches(groups);
}

// Desenha só as swatches da aba ATIVA (compColorActiveTabRoleId) — separado
// de renderCompositionSideColorPanel pra trocar de aba sem precisar
// reconsultar o banco (loadCompositionColorRoleGroups) de novo, já que
// `groups` (com as cores já resolvidas) é reaproveitado inteiro. Nenhum
// swatch nasce "selecionado" — cada módulo pode ter uma cor diferente até o
// cliente clicar (isto não é uma seleção única salva, é só um atalho de
// troca em massa).
function renderCompositionColorTabSwatches(groups) {
  const tabsEl = document.getElementById('po-comp-side-color-tabs');
  const swatchesEl = document.getElementById('po-comp-side-color-swatches');
  if (!tabsEl || !swatchesEl) return;
  [...tabsEl.children].forEach((btn, i) => {
    btn.classList.toggle('active', groups[i] && groups[i].roleId === compColorActiveTabRoleId);
  });
  const group = groups.find((g) => g.roleId === compColorActiveTabRoleId);
  swatchesEl.innerHTML = '';
  if (!group) return;
  renderSwatches(swatchesEl, group.colors, null, (colorId) => {
    const chosen = group.colors.find((c) => c.id === colorId);
    if (chosen) applyColorRoleToComposition(group.roleId, chosen);
  });
}

// Monta os assemblies 3D de um conjunto de slots (extraído de
// generateComposition3D pra poder ser reaproveitado por
// renderCompositionForAiSnapshot — ver comentário lá — sem duplicar a lógica
// de peças/cor/empilhamento). slotsList = compositionSlots por padrão, mas
// pode vir filtrada (ex.: sem os módulos decorativos).
function buildCompositionAssemblies(slotsList) {
  return slotsList.map((slot) => {
    const moduleDims = { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm };
    const parts = resolvePiecesForViewer(slot.pieces, moduleDims, slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides);
    // openState (pedido do usuário, 2026-07-16: "quero opcao abrir portas e
    // gavetas no modulo composicao gerado") — relê o estado ATUAL de
    // porta/gaveta da composição (ver ViewerComposition.areDoorsOpen/
    // areDrawersOpen) antes de montar, pra um módulo reconstruído (troca de
    // cor, empilhamento, novo slot) nascer já aberto/fechado igual aos
    // outros, em vez de sempre fechado.
    const openState = {
      doors: (typeof ViewerComposition !== 'undefined' && ViewerComposition.areDoorsOpen) ? ViewerComposition.areDoorsOpen() : false,
      drawers: (typeof ViewerComposition !== 'undefined' && ViewerComposition.areDrawersOpen) ? ViewerComposition.areDrawersOpen() : false
    };
    const assembly = Viewer3D.buildStandaloneAssembly(parts, slot.width_mm, slot.height_mm, slot.depth_mm, openState);
    // Empilhamento (ver viewer3d_composition.js/render): id/stack_on_id
    // decidem se este assembly abre coluna nova (avança a fileira) ou
    // reaproveita o X de uma coluna já posicionada; floor_height_m (metros,
    // mesma convenção de width_m/height_m/depth_m que buildStandaloneAssembly
    // já devolve) desloca o group no eixo Y a partir do chão de verdade.
    if (assembly) {
      assembly.id = slot.id;
      assembly.stack_on_id = slot.stack_on_id || null;
      assembly.floor_height_m = Number(slot.floor_height_mm || 0) / 1000;
    }
    return assembly;
  });
}

function generateComposition3D() {
  const wrap = document.getElementById('po-comp-3d-wrap');
  const canvas = document.getElementById('po-comp-3d-canvas');
  if (!wrap || !canvas) return;
  wrap.style.display = 'block';

  if (typeof ViewerComposition === 'undefined' || !ViewerComposition.available()
    || typeof Viewer3D === 'undefined' || !Viewer3D.buildStandaloneAssembly) {
    canvas.innerHTML = `<p class="hint">${I18n.t('composition.not_available_3d')}</p>`;
    return;
  }

  const assemblies = buildCompositionAssemblies(compositionSlots);

  // Cotas totais direto no desenho (pedido do usuário: "eu pensei em
  // colocar essas medidas no próprio desenho") — mesma conta de
  // computeCompositionTotalsMm() usada nos chips de texto acima da fileira,
  // só formatada na unidade atual antes de mandar pro viewer3d_composition.js
  // (que não sabe nada de mm/cm/pol — só desenha o texto pronto).
  const totalsMm = computeCompositionTotalsMm();
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const dimensionLabels = totalsMm ? {
    width: formatDimension(totalsMm.totalWidth, unit),
    height: formatDimension(totalsMm.totalHeight, unit),
    depth: formatDimension(totalsMm.totalDepth, unit)
  } : null;

  // ViewerComposition.init/render (viewer3d_composition.js) já são seguros
  // de chamar de novo em cima de uma cena existente: init() reaproveita o
  // renderer se já existir, e render() descarta (dispose) os groups antigos
  // antes de montar os novos — não vaza contexto WebGL nem duplica cena.
  // Ambiente da casa (linhas de chão/teto/baseboard, ver
  // buildRoomEnvironment em viewer3d_composition.js) — mesma config usada
  // pelo configurador da aba Quote (viewerRoomEnvConfig, rótulos já na
  // unidade global atual).
  ViewerComposition.init('po-comp-3d-canvas');
  ViewerComposition.render(assemblies, dimensionLabels, viewerRoomEnvConfig());

  // Botões "Abrir portas"/"Abrir gavetas" da composição — mesma checagem
  // recursiva (treeHasHinge/treeHasSlide) usada pro configurador de módulo
  // único, só que em QUALQUER slot da composição (um só módulo com porta já
  // basta pra mostrar o botão, que abre as portas de TODOS os módulos que
  // tiverem). Reaproveita os mesmos rótulos i18n (step2.open_doors/
  // close_doors/open_drawers/close_drawers).
  refreshCompositionOpenButtons();

  // Preço do CONJUNTO — soma o total já calculado de cada slot (cada um
  // já rodou Pricing.calculateModulePrice na hora em que foi configurado,
  // ver po-add-item-btn/compositionSlots acima), sem precisar recalcular
  // nada aqui.
  const totalEl = document.getElementById('po-comp-3d-total');
  if (totalEl) {
    const total = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
    totalEl.textContent = I18n.t('composition.total_estimated', { total: formatMoney(total) });
  }

  // Painel de troca rápida de cor das laterais (ver bloco acima) — refeito
  // toda vez que a cena é (re)gerada, pra continuar batendo com os módulos
  // atuais da composição. Assíncrono (consulta module_colors), não trava o
  // desenho 3D síncrono acima.
  renderCompositionSideColorPanel();
}

// Versão "limpa" da cena, só pra tirar o(s) print(s) que viram base pra IA
// (ver generateAiPreviewForGallery/publishCompositionToGallery) — pedido do
// usuário (2026-07-19): "essas imagens de base, retira as cotas e coloca so
// linha de piso e teto. retira as decoracoes deixa a ia gerar elas".
//   - SEM cotas: manda labels=null pro render() (ver "if (labels)" em
//     viewer3d_composition.js/render — sem isso não desenha as 3 linhas de
//     medida largura/altura/profundidade).
//   - SÓ linha de piso e teto: room.minimal=true (ver buildRoomEnvironment
//     em viewer3d_composition.js) — tira a linha tracejada de altura máxima,
//     o baseboard tracejado, e os rótulos de texto, mantendo só as 2 linhas
//     sólidas.
//   - SEM módulos decorativos (is_decoration): a IA já recebe instrução pra
//     decorar a cena sozinha (ver buildRoomStagingFragment no Edge Function)
//     — um vaso/planta genérico do catálogo dentro do print só confundia
//     (podia sair duplicado ou brigando com a decoração que a IA adiciona).
// SEMPRE temporária: quem chamar isto pra tirar print(s) tem que chamar
// generateComposition3D() de novo depois, pra devolver a cena normal (com
// cotas/decoração/linhas completas) que o cliente estava vendo.
function renderCompositionForAiSnapshot() {
  if (typeof ViewerComposition === 'undefined' || !ViewerComposition.available()
    || typeof Viewer3D === 'undefined' || !Viewer3D.buildStandaloneAssembly) {
    return false;
  }
  const cleanSlots = compositionSlots.filter((slot) => !(slot.module && slot.module.is_decoration));
  if (!cleanSlots.length) return false;
  const assemblies = buildCompositionAssemblies(cleanSlots);
  const room = { ...viewerRoomEnvConfig(), minimal: true };
  ViewerComposition.init('po-comp-3d-canvas');
  ViewerComposition.render(assemblies, null, room);
  return true;
}

// Botões "Abrir portas"/"Abrir gavetas" da composição (pedido do usuário,
// 2026-07-16: "quero opcao abrir portas e gavetas no modulo composicao
// gerado") — mesmo padrão dos botões do configurador de módulo único
// (po-toggle-doors-btn/po-toggle-drawers-btn), só que apontando pro estado
// PRÓPRIO da cena de composição (ViewerComposition.toggleDoors/toggleDrawers,
// ver viewer3d_composition.js) em vez do Viewer3D da cena singleton — os dois
// são independentes de propósito. Mostra cada botão só se ALGUM slot da
// composição tiver peça do tipo correspondente, em qualquer profundidade
// (mesma treeHasHinge/treeHasSlide recursiva já usada pelo configurador
// individual). Chamada de dentro de generateComposition3D() (toda vez que a
// cena é (re)gerada) — assim um módulo removido/adicionado atualiza a
// visibilidade dos botões junto.
function refreshCompositionOpenButtons() {
  const doorsBtn = document.getElementById('po-comp-toggle-doors-btn');
  const drawersBtn = document.getElementById('po-comp-toggle-drawers-btn');
  if (!doorsBtn && !drawersBtn) return;

  const hasHinge = compositionSlots.some((slot) => treeHasHinge(slot.pieces, false, false));
  const hasSlide = compositionSlots.some((slot) => treeHasSlide(slot.pieces, false, false));

  if (doorsBtn) {
    doorsBtn.style.display = hasHinge ? 'inline-block' : 'none';
    doorsBtn.dataset.openLabel = I18n.t('step2.open_doors');
    doorsBtn.dataset.closeLabel = I18n.t('step2.close_doors');
    const isOpen = typeof ViewerComposition !== 'undefined' && ViewerComposition.areDoorsOpen && ViewerComposition.areDoorsOpen();
    doorsBtn.textContent = isOpen ? doorsBtn.dataset.closeLabel : doorsBtn.dataset.openLabel;
  }
  if (drawersBtn) {
    drawersBtn.style.display = hasSlide ? 'inline-block' : 'none';
    drawersBtn.dataset.openLabel = I18n.t('step2.open_drawers');
    drawersBtn.dataset.closeLabel = I18n.t('step2.close_drawers');
    const isOpen = typeof ViewerComposition !== 'undefined' && ViewerComposition.areDrawersOpen && ViewerComposition.areDrawersOpen();
    drawersBtn.textContent = isOpen ? drawersBtn.dataset.closeLabel : drawersBtn.dataset.openLabel;
  }
}

const compToggleDoorsBtn = document.getElementById('po-comp-toggle-doors-btn');
if (compToggleDoorsBtn) {
  compToggleDoorsBtn.addEventListener('click', () => {
    try {
      const isOpen = ViewerComposition.toggleDoors();
      compToggleDoorsBtn.textContent = isOpen
        ? (compToggleDoorsBtn.dataset.closeLabel || I18n.t('step2.close_doors'))
        : (compToggleDoorsBtn.dataset.openLabel || I18n.t('step2.open_doors'));
    } catch (err) {
      // Sem 3D o botão não faz nada.
    }
  });
}

const compToggleDrawersBtn = document.getElementById('po-comp-toggle-drawers-btn');
if (compToggleDrawersBtn) {
  compToggleDrawersBtn.addEventListener('click', () => {
    try {
      const isOpen = ViewerComposition.toggleDrawers();
      compToggleDrawersBtn.textContent = isOpen
        ? (compToggleDrawersBtn.dataset.closeLabel || I18n.t('step2.close_drawers'))
        : (compToggleDrawersBtn.dataset.openLabel || I18n.t('step2.open_drawers'));
    } catch (err) {
      // Sem 3D o botão não faz nada.
    }
  });
}

// Botão "Gerar 3D da composição" — só dispara generateComposition3D() (ver
// acima) + rola a tela até o resultado (a única parte que faz sentido SÓ no
// clique manual, não na regeneração automática).
const compGenerateBtn = document.getElementById('po-comp-generate-btn');
if (compGenerateBtn) {
  compGenerateBtn.addEventListener('click', () => {
    generateComposition3D();
    // O resultado nasce escondido no fim da página (wrap começa
    // display:none) — rola até ele, senão o cliente pode nem perceber que
    // já gerou.
    const wrap = document.getElementById('po-comp-3d-wrap');
    if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------- COMPOSIÇÕES FAVORITAS (migration 042) ----------
// O cliente logado salva a composição atual com um nome (user_compositions,
// RLS: só as próprias linhas) e recarrega depois na aba Favoritos — pra usar
// de novo ou alterar e salvar por cima. O que vai pro banco é a CONFIGURAÇÃO
// de cada slot (ids + medidas + escolhas), não o preço: ao carregar, tudo é
// re-resolvido contra o catálogo atual (mesma filosofia do export de furação).

let loadedFavorite = null; // { id, name } quando a composição em edição veio de um favorito

// Edição de post da Galeria como ADMIN (pedido do usuário, 2026-07-19: "eu
// como administrador, quero fazer alteracao na composicao dos projetos da
// galeria ... e poder salvar essa composicao, pra ela ficar mais fiel as
// imagens geradas") — ver maybeLoadGalleryPostForAdminEdit/
// saveGalleryPostAdminEdit mais abaixo. null = edição normal (comportamento
// de sempre, sem nenhum post amarrado).
let editingGalleryPostId = null;
// Nome original do post (composition_name) — guardado à parte porque
// restoreFavoriteComposition(..., bindAsFavorite=false) SEMPRE zera
// loadedFavorite pra null (é o comportamento correto pro caso normal, ver
// restoreGalleryPostAsComposition), então sem isso saveGalleryPostAdminEdit
// apagaria o nome do post a cada salvamento.
let editingGalleryPostName = null;

function serializeCompositionSlots() {
  return compositionSlots.map((slot) => ({
    // id/stack_on_id (empilhamento) — id é uma string opaca só de uso
    // interno (newSlotId()), guardada aqui só pra stack_on_id de OUTRO slot
    // desta mesma composição conseguir se referir a ele depois de recarregar
    // o favorito (ver restoreFavoriteComposition). floor_height_mm 0 é o
    // padrão pra composições salvas antes desta feature (chão de verdade).
    id: slot.id,
    stack_on_id: slot.stack_on_id || null,
    floor_height_mm: Number(slot.floor_height_mm || 0),
    module_id: slot.module.id,
    width_mm: slot.width_mm,
    height_mm: slot.height_mm,
    depth_mm: slot.depth_mm,
    selected_colors: slot.selectedColors || [],
    // piece_color_overrides (migration 046) — snapshot compacto (id/nome),
    // mesmo formato gravado em order_items (ver buildPieceColorOverridesSnapshot);
    // resolvido de volta pra registros reais em restoreFavoriteComposition.
    piece_color_overrides: buildPieceColorOverridesSnapshot(slot.pieceColorOverrides),
    hinge_model_id: slot.hingeModel ? slot.hingeModel.id : null,
    slide_model_id: slot.slideModel ? slot.slideModel.id : null,
    shelf_quantities: slot.shelfQuantities || {},
    dim_overrides: slot.dimOverrides || {},
    selected_optional_ids: slot.selectedOptionalIds || [],
    thumbnail_data_url: slot.thumbnail_data_url || null
  }));
}

// Mostra/esconde o botão "Salvar alterações em ..." conforme a composição
// atual veio (ou não) de um favorito carregado.
function refreshFavoriteButtons() {
  const updateBtn = document.getElementById('po-comp-update-fav-btn');
  if (!updateBtn) return;
  if (loadedFavorite) {
    updateBtn.textContent = I18n.t('fav.update_btn', { name: loadedFavorite.name });
    updateBtn.style.display = 'inline-block';
  } else {
    updateBtn.style.display = 'none';
  }
}

async function saveCompositionFavorite(overwriteId) {
  const statusEl = document.getElementById('po-comp-fav-status');
  const errorEl = document.getElementById('po-comp-error');
  errorEl.style.display = 'none';
  statusEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = I18n.t('fav.need_login');
    errorEl.style.display = 'block';
    return;
  }
  if (compositionSlots.length === 0) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  try {
    if (overwriteId) {
      const { error } = await supabaseClient
        .from('user_compositions')
        .update({ slots: serializeCompositionSlots(), updated_at: new Date().toISOString() })
        .eq('id', overwriteId);
      if (error) throw error;
      statusEl.textContent = I18n.t('fav.updated_status', { name: loadedFavorite ? loadedFavorite.name : '' });
    } else {
      const name = (prompt(I18n.t('fav.name_prompt'), I18n.t('fav.default_name')) || '').trim();
      if (!name) return;
      const { data, error } = await supabaseClient
        .from('user_compositions')
        .insert({ client_user_id: currentUser.id, name, slots: serializeCompositionSlots() })
        .select('id, name')
        .single();
      if (error) throw error;
      loadedFavorite = { id: data.id, name: data.name };
      statusEl.textContent = I18n.t('fav.saved_status');
    }
    refreshFavoriteButtons();
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  } catch (err) {
    errorEl.textContent = err.message || String(err);
    errorEl.style.display = 'block';
  }
}

const compSaveFavBtn = document.getElementById('po-comp-save-fav-btn');
if (compSaveFavBtn) compSaveFavBtn.addEventListener('click', () => saveCompositionFavorite(null));
const compUpdateFavBtn = document.getElementById('po-comp-update-fav-btn');
if (compUpdateFavBtn) compUpdateFavBtn.addEventListener('click', () => {
  if (loadedFavorite) saveCompositionFavorite(loadedFavorite.id);
});

async function loadFavoritesList() {
  const listEl = document.getElementById('po-fav-list');
  const errorEl = document.getElementById('po-fav-error');
  if (!listEl) return;
  errorEl.style.display = 'none';
  listEl.innerHTML = '';
  const { data, error } = await supabaseClient
    .from('user_compositions')
    .select('id, name, slots, updated_at')
    .order('updated_at', { ascending: false });
  if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }
  if (!data || data.length === 0) {
    listEl.innerHTML = `<p class="hint">${I18n.t('fav.empty')}</p>`;
    return;
  }
  data.forEach((fav) => {
    const card = document.createElement('div');
    card.className = 'panel';
    card.style.marginTop = '10px';
    const slots = Array.isArray(fav.slots) ? fav.slots : [];
    const thumbs = slots
      .filter((s) => s.thumbnail_data_url)
      .map((s) => `<img src="${s.thumbnail_data_url}" alt="" style="height:64px;margin-right:4px;" />`)
      .join('');
    const dateStr = fav.updated_at ? new Date(fav.updated_at).toLocaleString() : '—';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div>
          <strong class="po-fav-name"></strong>
          <div class="hint">${I18n.t('fav.modules_label', { n: slots.length })} · ${I18n.t('fav.updated_label', { date: dateStr })}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="po-fav-load">${I18n.t('fav.load_btn')}</button>
          <button type="button" class="secondary po-fav-rename" style="margin-top:0;">${I18n.t('fav.rename_btn')}</button>
          <button type="button" class="secondary po-fav-delete" style="margin-top:0;">${I18n.t('fav.delete_btn')}</button>
        </div>
      </div>
      ${thumbs ? `<div style="margin-top:8px;">${thumbs}</div>` : ''}
    `;
    card.querySelector('.po-fav-name').textContent = fav.name; // textContent: nome é texto livre do cliente
    card.querySelector('.po-fav-load').addEventListener('click', () => restoreFavoriteComposition(fav));
    card.querySelector('.po-fav-rename').addEventListener('click', async () => {
      const newName = (prompt(I18n.t('fav.name_prompt'), fav.name) || '').trim();
      if (!newName || newName === fav.name) return;
      const { error: renameErr } = await supabaseClient
        .from('user_compositions')
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', fav.id);
      if (renameErr) { errorEl.textContent = renameErr.message; errorEl.style.display = 'block'; return; }
      if (loadedFavorite && loadedFavorite.id === fav.id) { loadedFavorite.name = newName; refreshFavoriteButtons(); }
      loadFavoritesList();
    });
    card.querySelector('.po-fav-delete').addEventListener('click', async () => {
      if (!confirm(I18n.t('fav.delete_confirm', { name: fav.name }))) return;
      const { error: delErr } = await supabaseClient.from('user_compositions').delete().eq('id', fav.id);
      if (delErr) { errorEl.textContent = delErr.message; errorEl.style.display = 'block'; return; }
      if (loadedFavorite && loadedFavorite.id === fav.id) { loadedFavorite = null; refreshFavoriteButtons(); }
      loadFavoritesList();
    });
    listEl.appendChild(card);
  });
}

// Reconstrói compositionSlots a partir da configuração salva — re-resolve
// peças/preço contra o catálogo ATUAL (módulo apagado é pulado com aviso;
// módulo que mudou de fórmula/preço volta atualizado, de propósito).
// bindAsFavorite=false (Galeria pública, migration 048): mesma lógica de
// resolução, mas NÃO amarra loadedFavorite a nenhuma user_compositions
// existente — a composição carregada fica "solta", e o próximo "Salvar
// como favorita" cria uma linha NOVA pertencente ao usuário atual (RLS de
// user_compositions já é owner-only, então não daria nem pra sobrescrever a
// composição de outra pessoa). Pedido do usuário: "pode abrir o ambiente e
// fazer suas alterações... o cliente não sai do zero" — ver
// restoreGalleryPostAsComposition.
async function restoreFavoriteComposition(fav, bindAsFavorite = true) {
  const errorEl = document.getElementById('po-fav-error');
  errorEl.style.display = 'none';
  try {
    // Corrida no login (2026-07-21, mesmo bug achado em restoreFavoriteProject
    // — ver comentário lá): allModules só é preenchido depois de um showLoggedIn()
    // assíncrono (loadModules, no fim da cadeia). Se o cliente clicar
    // "Carregar" rápido demais (ex.: acabou de logar), allModules ainda está
    // [] e TODO módulo salvo seria pulado por engano ("módulo não existe mais
    // no catálogo"), mesmo existindo de verdade. Recarrega antes de resolver.
    if (!allModules.length) await loadModules();
    const slotConfigs = Array.isArray(fav.slots) ? fav.slots : [];

    // busca cores/dobradiças/corrediças referenciadas, numa ida só por tabela
    // (inclui os color_id de dentro de piece_color_overrides, migration 046,
    // senão a cor separada de uma peça-módulo se perderia ao recarregar).
    const pieceColorOverrideColorIds = slotConfigs.flatMap((s) =>
      Object.values(s.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id))
    );
    const colorIds = [...new Set(
      slotConfigs.flatMap((s) => (s.selected_colors || []).map((c) => c.color_id))
        .concat(pieceColorOverrideColorIds)
        .filter(Boolean)
    )];
    const hingeIds = [...new Set(slotConfigs.map((s) => s.hinge_model_id).filter(Boolean))];
    const slideIds = [...new Set(slotConfigs.map((s) => s.slide_model_id).filter(Boolean))];
    const [colorsRes, hingeRes, slideRes] = await Promise.all([
      colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : { data: [] },
      hingeIds.length ? supabaseClient.from('hinge_models').select('*').in('id', hingeIds) : { data: [] },
      slideIds.length ? supabaseClient.from('slide_models').select('*').in('id', slideIds) : { data: [] }
    ]);
    const colorById = new Map((colorsRes.data || []).map((c) => [c.id, c]));
    const hingeById = new Map((hingeRes.data || []).map((h) => [h.id, h]));
    const slideById = new Map((slideRes.data || []).map((s) => [s.id, s]));

    const restored = [];
    let skipped = 0;
    for (const cfg of slotConfigs) {
      const module = allModules.find((m) => m.id === cfg.module_id);
      if (!module) { skipped += 1; continue; }
      const piecesList = await loadRecursivePiecesForModule(module.id);
      if (!piecesList || piecesList.length === 0) { skipped += 1; continue; }
      const optionalIds = cfg.selected_optional_ids || [];
      const effectivePieces = piecesList.filter((p) => !p.client_optional || optionalIds.includes(p.id));
      const colorsByRole = {};
      (cfg.selected_colors || []).forEach((sc) => {
        const color = colorById.get(sc.color_id);
        if (color) colorsByRole[sc.role_id] = color;
      });
      const hingeModel = cfg.hinge_model_id ? (hingeById.get(cfg.hinge_model_id) || null) : null;
      const slideModel = cfg.slide_model_id ? (slideById.get(cfg.slide_model_id) || null) : null;
      // piece_color_overrides (migration 046) — resolve o snapshot compacto
      // (id/nome, ver buildPieceColorOverridesSnapshot) de volta pra
      // registros reais de "colors", igual colorsByRole logo acima.
      const pieceColorOverrides = {};
      Object.keys(cfg.piece_color_overrides || {}).forEach((pieceId) => {
        const perRole = cfg.piece_color_overrides[pieceId];
        const resolved = {};
        Object.keys(perRole).forEach((roleId) => {
          const color = colorById.get(perRole[roleId].color_id);
          if (color) resolved[roleId] = color;
        });
        if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
      });
      let result;
      try {
        result = module.is_decoration
          ? { total: 0, breakdown: [] }
          : Pricing.calculateModulePrice({
            module, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
            shelfQuantities: cfg.shelf_quantities || {}, dimOverrides: cfg.dim_overrides || {},
            pieceColorOverrides,
            width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
            markupMultiplier: pricingMarkupMultiplier
          });
      } catch (calcErr) { skipped += 1; continue; } // catálogo mudou e a config não fecha mais
      restored.push({
        // id/stack_on_id/floor_height_mm (empilhamento) — favoritos salvos
        // ANTES desta feature não têm cfg.id, então cada slot ganha um id
        // novo (newSlotId()) e stack_on_id/floor_height_mm caem nos padrões
        // (null / 0 = sem empilhar, no chão de verdade), reproduzindo
        // exatamente o comportamento antigo pra esses favoritos.
        id: cfg.id || newSlotId(),
        stack_on_id: cfg.stack_on_id || null,
        floor_height_mm: Number(cfg.floor_height_mm || 0),
        module,
        pieces: effectivePieces,
        colorsByRole,
        selectedColors: cfg.selected_colors || [],
        pieceColorOverrides,
        hingeModel, slideModel,
        width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
        shelfQuantities: cfg.shelf_quantities || {},
        dimOverrides: cfg.dim_overrides || {},
        selectedOptionalIds: optionalIds,
        result,
        thumbnail_data_url: cfg.thumbnail_data_url || null
      });
    }

    // Limpa stack_on_id órfão: se o slot-base de uma coluna foi pulado
    // (módulo apagado do catálogo, ver "skipped" acima), o slot que estava
    // empilhado em cima dele não pode continuar apontando pra um id que não
    // existe mais em `restored` — vira uma coluna nova (base) em vez de
    // desaparecer ou quebrar o render.
    const restoredIds = new Set(restored.map((s) => s.id));
    restored.forEach((s) => { if (s.stack_on_id && !restoredIds.has(s.stack_on_id)) s.stack_on_id = null; });

    compositionSlots = restored;
    loadedFavorite = bindAsFavorite ? { id: fav.id, name: fav.name } : null;
    refreshFavoriteButtons();

    // vai pra aba Composição já com os slots montados
    const compTabBtn = document.querySelector('#po-sidebar .portal-tab-btn[data-tab="po-tab-composition"]');
    if (compTabBtn) compTabBtn.click();
    renderCompositionSlots();

    const statusEl = document.getElementById('po-comp-fav-status');
    statusEl.textContent = I18n.t('fav.loaded_status', { name: fav.name })
      + (skipped > 0 ? ' ' + I18n.t('fav.load_partial', { n: skipped }) : '');
    setTimeout(() => { statusEl.textContent = ''; }, 6000);
  } catch (err) {
    errorEl.textContent = I18n.t('fav.load_error', { msg: err.message || String(err) });
    errorEl.style.display = 'block';
  }
}

// "Adicionar composição ao pedido" — grava cada módulo da composição como
// uma linha normal de order_items (mesmo formato/payload de po-add-item-btn,
// só que um insert por slot em vez de um só), já que não existe (nem foi
// pedido) nenhum conceito de "grupo"/"pacote" na tabela hoje — cada módulo
// vira uma linha independente no carrinho, igual a qualquer módulo
// adicionado avulso. slot.result (calculado quando o módulo foi configurado,
// ver po-add-item-btn/compositionSlots) já tem o breakdown/total prontos —
// não recalcula nada aqui.
const compAddCartBtn = document.getElementById('po-comp-add-cart-btn');
if (compAddCartBtn) {
  compAddCartBtn.addEventListener('click', async () => {
    const errorEl = document.getElementById('po-comp-cart-error');
    errorEl.style.display = 'none';
    if (!compositionSlots.length) return;
    compAddCartBtn.disabled = true;
    try {
      const orderId = await ensureDraftOrder();
      for (const slot of compositionSlots) {
        const payload = {
          order_id: orderId,
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
          quantity: 1,
          unit_price: slot.result.total,
          total_price: slot.result.total,
          breakdown: slot.result.breakdown,
          thumbnail_data_url: slot.thumbnail_data_url,
          sort_order: cartItems.length
        };
        const { data, error } = await supabaseClient.from('order_items').insert(payload).select().single();
        if (error) throw error;
        cartItems.push(data);
      }
      renderCart();

      // Composição inserida no pedido — limpa os slots e esconde o
      // resultado 3D, pra deixar claro que já foi adicionada (evita clicar
      // de novo sem querer e duplicar os módulos no carrinho).
      compositionSlots = [];
      renderCompositionSlots();
      document.getElementById('po-comp-3d-wrap').style.display = 'none';
      document.getElementById('po-comp-3d-total').textContent = '';
    } catch (err) {
      errorEl.textContent = I18n.t('composition.add_error', { msg: err.message });
      errorEl.style.display = 'block';
    } finally {
      compAddCartBtn.disabled = false;
    }
  });
}

// ---------- GALERIA PÚBLICA (migration 048) ----------
// Publicar a composição já gerada (3D + preço) como um post público, pra
// virar portfólio de ambientes/produtos: pedido do usuário — "quanto mais
// usuarios fizerem suas composicoes no site maior a galeria e mais conteudo
// vamos ter de base pra novos clientes" — e o ponto central: qualquer
// visitante pode abrir um post e continuar editando a partir dali
// (restoreGalleryPostAsComposition abaixo), "o cliente nao sai do zero".
//
// Geração de IA (Gemini) ainda NÃO está plugada (sem backend neste projeto,
// chave ainda não pronta — ver migration_048_galeria_composicoes.sql) — por
// enquanto a "imagem" publicada é o próprio screenshot 3D da composição
// (ViewerComposition.snapshot(), fundo branco sólido, recortado com
// trimTransparentPng). Trocar por um render de IA de verdade depois é só
// substituir a linha `const rawSnapshot = ...` abaixo por uma chamada pro
// endpoint/edge function que devolve a imagem gerada — nada mais no resto
// do pipeline (DB, grade, filtros, curtidas, "usar esta composição") muda.

// "Ambiente" da Galeria (migration 049) — pedido do usuário: "esses
// ambientes devem ser os mesmo dos modulos, copia a taxonomia das
// categorias". Antes era uma lista fixa inventada (cozinha/quarto/sala/...);
// agora usa a MESMA taxonomia de família já usada em todo o catálogo
// (familiesCacheList, carregada uma vez em showLoggedIn via
// loadTaxonomyFilters() — reaproveitada aqui, sem query nova).
function populateGalleryFamilySelect(selectEl, includeAllOption) {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = '';
  if (includeAllOption) {
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = I18n.t('gallery.room_type_all');
    selectEl.appendChild(optAll);
  }
  familiesCacheList.forEach((fam) => {
    const opt = document.createElement('option');
    opt.value = fam.id;
    opt.textContent = fam.name;
    selectEl.appendChild(opt);
  });
  if (current) selectEl.value = current;
}

function galleryFamilyName(familyId) {
  const fam = familiesCacheList.find((f) => f.id === familyId);
  return fam ? fam.name : null;
}

// Gemini só aceita um conjunto FIXO de proporções de saída (generationConfig.
// imageConfig.aspectRatio) — sem mandar nada, ele tende a sair em 3:4/1:1 por
// padrão, o que espreme/corta o enquadramento tipicamente bem largo de uma
// composição (pedido do usuário: "ainda ficou com esse formato" — o preview
// veio em pé, com faixa branca dos lados). nearestSupportedAspectRatio mapeia
// uma proporção qualquer pro valor suportado mais próximo (distância em
// escala log — compara proporções, não diferenças absolutas). Quem chama
// hoje é currentGalleryAspectRatio (mais abaixo) — a partir da proporção
// REAL do recorte trimado (getImageAspectRatio), não mais do canvas/
// container (#po-comp-3d-canvas tem altura FIXA de 420px em CSS, não
// reflete o desenho em si).
const GEMINI_SUPPORTED_ASPECT_RATIOS = [
  { label: '21:9', value: 21 / 9 },
  { label: '16:9', value: 16 / 9 },
  { label: '5:4', value: 5 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:4', value: 3 / 4 },
  { label: '2:3', value: 2 / 3 },
  { label: '9:16', value: 9 / 16 }
];
function nearestSupportedAspectRatio(ratio) {
  if (!ratio || !isFinite(ratio) || ratio <= 0) return null;
  let best = null;
  let bestDiff = Infinity;
  GEMINI_SUPPORTED_ASPECT_RATIOS.forEach((opt) => {
    const diff = Math.abs(Math.log(opt.value / ratio));
    if (diff < bestDiff) { bestDiff = diff; best = opt.label; }
  });
  return best;
}
// Valor numérico (largura/altura) de um rótulo tipo '16:9' — usado por
// padImageToAspectRatio pra saber quanto preencher, a partir do MESMO rótulo
// que currentGalleryAspectRatio já escolheu e que vai no aspectRatio da Edge
// Function (garante que a imagem preenchida e o parâmetro mandado ao Gemini
// sejam sempre exatamente a mesma proporção).
function aspectRatioLabelToValue(label) {
  const found = GEMINI_SUPPORTED_ASPECT_RATIOS.find((opt) => opt.label === label);
  return found ? found.value : null;
}
// 2026-07-19 — pedido do usuário: "ela tenta encher de moveis que nao existe
// quando a tela e esticada lateralmente ... deve ser uma imagem quadrada pra
// evitar isso". Antes esta função mapeava a proporção do CANVAS (container
// #po-comp-3d-canvas, altura fixa 420px em CSS — reflete o tamanho do
// painel na TELA, não o desenho em si) pro valor suportado mais próximo —
// numa composição bem larga isso dava um frame muito largo, e o Gemini
// "inventava" móveis extras nas laterais pra preencher o espaço vazio.
// Fixar em 1:1 sempre resolveu esse caso, mas TROCOU o problema de lado:
// um painel/porta ESTREITO E ALTO (ex.: um módulo só, recortado bem justo
// pelo trim — ver trimTransparentPng, margem de só 1,5%) forçado num
// quadrado sobra MUITO espaço vazio dos lados, e a IA passou a preencher
// aquilo com nicho/cômoda/quarto inteiro, descentralizando o móvel
// original (relatado com print pelo usuário no mesmo dia).
//
// Usa a proporção REAL do recorte já trimado (trimmedImageRatio, calculada
// por getImageAspectRatio DEPOIS do trim — só ela reflete o desenho de
// verdade, o canvas não).
//
// 2026-07-31 — REMOVIDO o clamp entre 2:3 e 3:2 que existia aqui (pedido do
// usuário: "a IA sempre altera projeto quando a proporcao da imagem e
// diferente do padrao dela... isso nao pode acontecer"). O clamp forçava um
// móvel bem largo (ex.: um guarda-roupa de 5 módulos) a pedir uma proporção
// bem mais "quadrada" do que a real ao Gemini — só esse descompasso já
// bastava pra IA redimensionar o móvel pra caber no formato pedido. Agora
// que a imagem MANDADA é pré-preenchida (padImageToAspectRatio, chamado por
// quem usa este valor) pra bater EXATAMENTE a proporção escolhida aqui, não
// existe mais descompasso nenhum entre "imagem enviada" e "proporção
// pedida" — o clamp não é mais necessário pra evitar a alucinação de móvel
// extra (ver histórico logo acima) porque aquele problema também era
// causado pelo mesmo descompasso, só que no sentido contrário (tela vazia
// demais, não desenho espremido).
function currentGalleryAspectRatio(trimmedImageRatio) {
  if (!trimmedImageRatio || !isFinite(trimmedImageRatio) || trimmedImageRatio <= 0) return '1:1';
  return nearestSupportedAspectRatio(trimmedImageRatio) || '1:1';
}

// Cores usadas no conjunto inteiro (pra colors_used da galeria, filtro
// "Cor") — junta selectedColors de cada slot + os overrides por peça
// (migration 046), deduplicado por color_id (a mesma cor usada em papéis
// diferentes conta uma vez só).
function aggregateColorsUsedForComposition() {
  const byColorId = new Map();
  compositionSlots.forEach((slot) => {
    (slot.selectedColors || []).forEach((c) => { if (c.color_id) byColorId.set(c.color_id, c); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.keys(perRole).forEach((roleId) => {
        const color = perRole[roleId];
        if (color && color.id && !byColorId.has(color.id)) {
          byColorId.set(color.id, { role_id: roleId, role_name: null, color_id: color.id, color_name: color.name });
        }
      });
    });
  });
  return [...byColorId.values()];
}

// Igual a aggregateColorsUsedForComposition, mas agrupado POR MÓDULO — só
// pra montar o prompt da IA (buildColorDescriptionForComposition), NÃO usado
// pro colors_used salvo no banco (esse continua achatado, o filtro de cor da
// galeria depende do formato flat com .color_id). Motivo: o cliente relatou
// (2026-07-19) que a IA errou a cor do criado-mudo numa composição
// cabeceira+criado-mudo — a lista antiga era um texto único misturando as
// cores de TODOS os módulos sem dizer qual peça usa qual, então a IA
// "adivinhava". Agora cada módulo vira seu próprio trecho no prompt.
function aggregateColorsUsedPerModuleForComposition() {
  const byModule = new Map(); // moduleName -> Map(colorId -> colorEntry)
  compositionSlots.forEach((slot) => {
    const moduleName = (slot.module && slot.module.name) || '?';
    if (!byModule.has(moduleName)) byModule.set(moduleName, new Map());
    const colorMap = byModule.get(moduleName);
    (slot.selectedColors || []).forEach((c) => { if (c.color_id) colorMap.set(c.color_id, c); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.keys(perRole).forEach((roleId) => {
        const color = perRole[roleId];
        if (color && color.id && !colorMap.has(color.id)) {
          colorMap.set(color.id, { role_id: roleId, role_name: null, color_id: color.id, color_name: color.name });
        }
      });
    });
  });
  return [...byModule.entries()].map(([moduleName, colorMap]) => ({ moduleName, colors: [...colorMap.values()] }));
}

// Estado da pré-visualização de IA (pedido do usuário: "quero gerar a
// imagem de ia antes de publicar") — preenchido por generateAiPreviewForGallery()
// quando o cliente clica "✨ Gerar imagem realista", ANTES de enviar pra
// Galeria de verdade. Resetado toda vez que o formulário reabre, pra nunca
// publicar sem querer a pré-visualização de uma composição/sessão anterior.
let galleryAiPreviewImage = null;
let galleryAiPreviewStatus = null; // 'ready' (IA de verdade) | 'failed' (caiu pro screenshot 3D) | null (ainda não gerou)

const galleryPublishToggleBtn = document.getElementById('po-gallery-publish-toggle-btn');
if (galleryPublishToggleBtn) {
  galleryPublishToggleBtn.addEventListener('click', () => {
    const form = document.getElementById('po-gallery-publish-form');
    if (!form) return;
    const isHidden = form.style.display === 'none';
    if (isHidden) {
      populateGalleryFamilySelect(document.getElementById('po-gallery-room-type'), false);
      galleryAiPreviewImage = null;
      galleryAiPreviewStatus = null;
      document.getElementById('po-gallery-ai-preview-wrap').style.display = 'none';
      const baseWrap = document.getElementById('po-gallery-base-preview-wrap');
      if (baseWrap) baseWrap.style.display = 'none';
    }
    form.style.display = isHidden ? 'block' : 'none';
  });
}

// Fetch genérico + conversão pra data URL (fetch + blob + FileReader) —
// usado só pra fotos de referência de MÓDULO (fetchReferencePhotosForComposition,
// logo abaixo). A cor NÃO manda mais imagem nenhuma pro Gemini (nem foto de
// referência, nem a textura antiga colors.texture_url) — pedido do usuário
// (2026-07-19): "acho que não precisa referência de cor, ela pode subir no
// próprio prompt pra ia gerar". Cor vira só TEXTO no prompt (nome + hex —
// ver buildColorDescriptionForComposition), mais simples de manter (não
// precisa fotografar/catalogar acabamento nenhum) e, segundo o usuário, já
// suficiente pra IA acertar o tom.
async function fetchUrlAsDataUrl(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    return null;
  }
}

// Descrição em TEXTO (não imagem) das cores usadas na composição — nome +
// hex aproximado (colors.swatch_hex) POR MÓDULO, ex.:
// "Cabeceira Estofada: Bege Linho (hex aproximado #C9B79C); Criado-mudo
// Suspenso: Verde Musgo (hex aproximado #4B5D45)". Enviada como colorLabel
// pro Gemini (ver supabase/functions/generate-gallery-render), que inclui
// isto direto no prompt de texto.
//
// Agrupado por módulo (aggregateColorsUsedPerModuleForComposition) desde
// 2026-07-19 — antes era uma lista única sem dizer qual peça usa qual cor, e
// o cliente relatou a IA aplicando a cor errada no criado-mudo de uma
// composição cabeceira+criado-mudo.
async function buildColorDescriptionForComposition() {
  const perModule = aggregateColorsUsedPerModuleForComposition();
  if (!perModule.length) return null;
  const allColorIds = [...new Set(perModule.flatMap((m) => m.colors.map((c) => c.color_id)).filter(Boolean))];
  const hexByColorId = new Map();
  if (allColorIds.length) {
    try {
      const { data } = await supabaseClient.from('colors').select('id, swatch_hex').in('id', allColorIds);
      (data || []).forEach((c) => { if (c.swatch_hex) hexByColorId.set(c.id, c.swatch_hex); });
    } catch (err) {
      // segue só com o nome, sem hex — nunca trava a geração por causa disso.
    }
  }
  const moduleLabels = perModule
    .map(({ moduleName, colors }) => {
      const names = [...new Set(colors
        .map((c) => {
          if (!c.color_name) return null;
          const hex = hexByColorId.get(c.color_id);
          return hex ? `${c.color_name} (hex aproximado ${hex})` : c.color_name;
        })
        .filter(Boolean))];
      return names.length ? `${moduleName}: ${names.join(', ')}` : null;
    })
    .filter(Boolean);
  return moduleLabels.length ? moduleLabels.join('; ') : null;
}

// Foto REAL do acabamento (colors.texture_url — já existe, usada hoje só no
// viewer 3D/admin, ver uploadTextureIfSelected em admin.js) enviada como
// IMAGEM pro Gemini, não só o hex em texto — pedido do usuário (2026-07-19):
// "nao ta subindo a cor certa, temos que enviar o arquivo da cor pra ser
// exato". Reverte a decisão anterior de só texto (ver comentário antigo em
// buildColorDescriptionForComposition, que ainda continua sendo enviado
// junto como reforço/fallback pras cores sem foto cadastrada).
// Reencodada em JPEG antes de mandar (ver toJpegDataUrl) — pedido do
// usuário (2026-07-19): "manda as cores em jpg pra uma melhor textura".
// Dedupe por color_id (não por módulo+cor) — se a MESMA cor for usada em
// dois módulos, manda a foto uma vez só, com o rótulo listando os dois.
const MAX_COLOR_REF_PHOTOS = 4;
async function buildColorReferencesForComposition() {
  const perModule = aggregateColorsUsedPerModuleForComposition();
  if (!perModule.length) return [];
  const colorIds = [...new Set(perModule.flatMap((m) => m.colors.map((c) => c.color_id)).filter(Boolean))];
  if (!colorIds.length) return [];
  const modulesByColorId = new Map();
  perModule.forEach(({ moduleName, colors }) => {
    colors.forEach((c) => {
      if (!c.color_id) return;
      if (!modulesByColorId.has(c.color_id)) modulesByColorId.set(c.color_id, new Set());
      modulesByColorId.get(c.color_id).add(moduleName);
    });
  });
  try {
    const { data } = await supabaseClient.from('colors').select('id, name, texture_url').in('id', colorIds);
    const withPhoto = (data || []).filter((c) => c.texture_url).slice(0, MAX_COLOR_REF_PHOTOS);
    const images = (await Promise.all(withPhoto.map(async (c) => {
      const rawDataUrl = await fetchUrlAsDataUrl(c.texture_url);
      if (!rawDataUrl) return null;
      const dataUrl = await toJpegDataUrl(rawDataUrl);
      const moduleNames = [...(modulesByColorId.get(c.id) || [])].join(', ');
      const label = moduleNames ? `${moduleNames}: ${c.name}` : c.name;
      return { label, dataUrl };
    }))).filter(Boolean);
    return images;
  } catch (err) {
    // Nunca trava a geração por causa disso — sem foto de cor cai pro texto
    // (buildColorDescriptionForComposition) mesmo.
    return [];
  }
}

// Ângulos EXTRAS do mesmo 3D (3/4 e lateral), só pra dar mais informação de
// GEOMETRIA pra IA — pedido do usuário (2026-07-19): "existe a possibilidade
// de levar um arquivo 3d pra geracao da imagem ser fiel ao projeto?". A API
// de geração (Gemini/OpenAI) não aceita arquivo 3D nenhum, só imagem 2D +
// texto — a alternativa foi mandar MAIS vistas 2D do mesmo 3D (ver
// ViewerComposition.snapshot({angle}) em viewer3d_composition.js), além da
// vista frontal principal (que continua sendo a ÚNICA que define o
// enquadramento da imagem final, ver buildGalleryPrompt no Edge Function —
// estas aqui são só referência extra, não mudam o ângulo de saída).
// Sequencial (não Promise.all) de propósito: snapshot() mexe na câmera
// COMPARTILHADA da cena, chamadas concorrentes se atropelariam.
async function captureCompositionAngleReferences() {
  if (typeof ViewerComposition === 'undefined' || !ViewerComposition.snapshot) return [];
  const angles = [
    { angle: 'three_quarter', label: 'vista 3/4 (referência de geometria)' },
    { angle: 'side', label: 'vista lateral (referência de geometria)' }
  ];
  const images = [];
  for (const { angle, label } of angles) {
    const raw = ViewerComposition.snapshot({ angle });
    if (!raw) continue;
    const trimmed = await trimTransparentPng(raw);
    if (trimmed) images.push({ label, dataUrl: trimmed });
  }
  return images;
}

// Banco de fotos de referência REAIS de MÓDULO (migration 050) — pedido do
// usuário (2026-07-19): "podemos criar um banco com cada referencia de
// modulo pra gerar a imagem mais fiel?" (a parte de referência de COR foi
// removida a pedido do próprio usuário logo em seguida — ver
// buildColorDescriptionForComposition acima).
//
// Antes escolhia só 1 foto no TOTAL, mesmo quando a composição tinha vários
// módulos diferentes (ex.: cabeceira + criado-mudo) — o segundo módulo
// nunca recebia referência nenhuma e a IA inventava o desenho dele do zero
// só a partir do print 3D (cliente relatou, 2026-07-19: "errou a cor do
// criado mudo e o desenho do criado mudo também"). Agora escolhe até 1 foto
// POR módulo distinto, até um teto de 3 módulos — mandar muitas fotos DO
// MESMO módulo de uma vez é que tende a confundir o Gemini (comentário
// antigo), mandar 1 de cada módulo diferente é justamente o que corrige
// peças sem referência nenhuma.
const MAX_MODULE_REF_PHOTOS = 3;
async function fetchReferencePhotosForComposition() {
  const moduleNameById = new Map();
  compositionSlots.forEach((s) => { if (s.module && s.module.id) moduleNameById.set(s.module.id, s.module.name); });
  const moduleIds = [...moduleNameById.keys()];
  if (!moduleIds.length) return { moduleRefImages: [] };
  try {
    const { data } = await supabaseClient.from('reference_photos').select('id, module_id, photo_url').in('module_id', moduleIds);
    const firstPhotoByModule = new Map();
    (data || []).forEach((p) => { if (!firstPhotoByModule.has(p.module_id)) firstPhotoByModule.set(p.module_id, p.photo_url); });
    const chosen = [...firstPhotoByModule.entries()].slice(0, MAX_MODULE_REF_PHOTOS);
    const moduleRefImages = (await Promise.all(chosen.map(async ([moduleId, photoUrl]) => {
      const dataUrl = await fetchUrlAsDataUrl(photoUrl);
      return dataUrl ? { moduleName: moduleNameById.get(moduleId) || null, dataUrl } : null;
    }))).filter(Boolean);
    return { moduleRefImages };
  } catch (err) {
    // Nunca trava a geração por causa disso — sem referência é o
    // comportamento de sempre (só print 3D + descrição em texto da cor).
    return { moduleRefImages: [] };
  }
}

// "✨ Gerar imagem realista" — pedido do usuário: "quero gerar a imagem de
// ia antes de publicar" (antes a geração só acontecia escondida dentro do
// envio final, o cliente nunca via o resultado antes de publicar de
// verdade). Tira o screenshot 3D + chama a Edge Function do Gemini (ver
// supabase/functions/generate-gallery-render), mostra o resultado na hora
// (preview <img>), e guarda em galleryAiPreviewImage/Status pra
// publishCompositionToGallery reaproveitar sem gerar de novo. Sempre mostra
// ALGUMA imagem no preview (a de IA se deu certo, senão o próprio screenshot
// 3D) — nunca deixa o botão "não fazer nada visível".
async function generateAiPreviewForGallery() {
  const btn = document.getElementById('po-gallery-generate-ai-btn');
  const previewWrap = document.getElementById('po-gallery-ai-preview-wrap');
  const previewImg = document.getElementById('po-gallery-ai-preview-img');
  const previewHint = document.getElementById('po-gallery-ai-preview-hint');
  const basePreviewWrap = document.getElementById('po-gallery-base-preview-wrap');
  const basePreviewImg = document.getElementById('po-gallery-base-preview-img');
  const errorEl = document.getElementById('po-gallery-publish-error');
  errorEl.style.display = 'none';
  if (!compositionSlots.length) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = I18n.t('gallery.generating_ai_status');
  // Troca pra versão "limpa" da cena (sem cotas, sem decoração, só linha de
  // piso/teto — ver renderCompositionForAiSnapshot) antes de tirar QUALQUER
  // print que vá pra IA. SEMPRE restaurada no finally, mesmo se a geração
  // falhar no meio — o cliente nunca deve ver a cena "limpa" persistir na
  // tela normal.
  const usedCleanScene = renderCompositionForAiSnapshot();
  try {
    // Print quase-frontal, não o ângulo 3/4 padrão de navegação (pedido do
    // usuário: "geralmente quero fotos mais frontais") — ver comentário de
    // ViewerComposition.snapshot(options.frontal) em viewer3d_composition.js.
    const rawSnapshot = (typeof ViewerComposition !== 'undefined' && ViewerComposition.snapshot) ? ViewerComposition.snapshot({ frontal: true }) : null;
    const trimmedSnapshot = rawSnapshot ? await trimTransparentPng(rawSnapshot) : null;
    if (!trimmedSnapshot) {
      errorEl.textContent = I18n.t('gallery.generate_ai_no_3d_error');
      errorEl.style.display = 'block';
      return;
    }
    // Ambiente já deve estar escolhido (select vem ANTES do botão no HTML,
    // ver portal.html) — manda o nome pra Edge Function montar um prompt de
    // decoração/ambientação específico dele (pedido do usuário, 2026-07-19:
    // "conforme o ambiente escolhido ja devemos colocar um prompt para
    // decoracao e ambientacao").
    const roomFamilyId = document.getElementById('po-gallery-room-type').value || null;
    const roomLabel = roomFamilyId ? galleryFamilyName(roomFamilyId) : null;
    const aspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));
    // Preenche a imagem ANTES de mandar pro Gemini, pra ela já sair
    // exatamente na proporção pedida acima (nunca corta/estica o móvel) —
    // ver padImageToAspectRatio, corrige o "muda o projeto pra caber".
    const sourceImageForAi = (await padImageToAspectRatio(trimmedSnapshot, aspectRatioLabelToValue(aspectRatio))) || trimmedSnapshot;

    // Mostra a imagem BASE (exatamente o que vira imageDataUrl mandado pra
    // Edge Function) — pedido do usuário: "me manda a imagem que esta
    // usando de base pra gerar a ia", pra comparar com o resultado.
    if (basePreviewImg && basePreviewWrap) {
      basePreviewImg.src = sourceImageForAi;
      basePreviewWrap.style.display = 'block';
    }

    let imageDataUrl = sourceImageForAi;
    let renderStatus = 'failed';
    try {
      // Vistas extras (3/4 + lateral) do MESMO 3D, só pra geometria — ver
      // captureCompositionAngleReferences. Sequencial e ANTES do Promise.all
      // abaixo (mexe na câmera compartilhada, melhor não sobrepor com nada).
      const angleRefImages = await captureCompositionAngleReferences();
      // Banco de fotos de referência de MÓDULO (migration 050) + foto REAL do
      // acabamento de cada cor (colors.texture_url) — cliente relatou
      // (2026-07-19) que a cor sem foto ("só texto") não saía exata, pediu
      // pra mandar o arquivo da cor mesmo (ver buildColorReferencesForComposition).
      // colorLabel (texto) continua indo junto como reforço/fallback.
      const [{ moduleRefImages }, colorLabel, colorRefImages] = await Promise.all([
        fetchReferencePhotosForComposition(),
        buildColorDescriptionForComposition(),
        buildColorReferencesForComposition()
      ]);
      const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
        body: { imageDataUrl: sourceImageForAi, moduleRefImages, colorLabel, colorRefImages, angleRefImages, roomLabel, aspectRatio }
      });
      if (!renderError && renderData && renderData.imageDataUrl) {
        imageDataUrl = renderData.imageDataUrl;
        renderStatus = 'ready';
      } else {
        // Não mostra o motivo real pro CLIENTE (mensagem genérica de
        // fallback já cobre isso), mas loga no console pra dar pra
        // diagnosticar (ver DevTools) — a function pode devolver o erro
        // exato no corpo (ver generate-gallery-render/index.ts) mesmo
        // quando supabase-js marca a resposta como "error" por causa do
        // status HTTP (400/500/502).
        console.error('generate-gallery-render falhou:', renderError, renderData);
        if (renderError && typeof renderError.context?.json === 'function') {
          renderError.context.json().then((body) => console.error('Corpo do erro:', body)).catch(() => {});
        }
      }
    } catch (aiErr) {
      // Function não publicada ainda, sem crédito, rede fora, etc. — segue
      // com o screenshot 3D mesmo (renderStatus fica 'failed').
      console.error('generate-gallery-render: erro ao chamar a function:', aiErr);
    }

    galleryAiPreviewImage = imageDataUrl;
    galleryAiPreviewStatus = renderStatus;
    previewImg.src = imageDataUrl;
    previewHint.textContent = renderStatus === 'ready'
      ? I18n.t('gallery.generate_ai_ready_hint')
      : I18n.t('gallery.generate_ai_fallback_hint');
    previewWrap.style.display = 'block';
  } finally {
    // Devolve a cena normal (cotas + decoração + linhas completas) — nunca
    // deixa o cliente vendo a versão "limpa" que só existiu pro print da IA.
    if (usedCleanScene) generateComposition3D();
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

const galleryGenerateAiBtn = document.getElementById('po-gallery-generate-ai-btn');
if (galleryGenerateAiBtn) galleryGenerateAiBtn.addEventListener('click', generateAiPreviewForGallery);

// Clique na prévia (antes de publicar) também abre em tela cheia, reaproveitando
// o mesmo lightbox dos cards já publicados (openGalleryLightbox, ver abaixo).
const galleryAiPreviewImgEl = document.getElementById('po-gallery-ai-preview-img');
if (galleryAiPreviewImgEl) {
  galleryAiPreviewImgEl.addEventListener('click', () => {
    if (galleryAiPreviewImgEl.src) openGalleryLightbox(galleryAiPreviewImgEl.src);
  });
}
// Mesma coisa pra imagem BASE (o print 3D enviado como imageDataUrl pra
// Edge Function, ver generateAiPreviewForGallery) — pedido do usuário:
// "me manda a imagem que esta usando de base pra gerar a ia".
const galleryBasePreviewImgEl = document.getElementById('po-gallery-base-preview-img');
if (galleryBasePreviewImgEl) {
  galleryBasePreviewImgEl.addEventListener('click', () => {
    if (galleryBasePreviewImgEl.src) openGalleryLightbox(galleryBasePreviewImgEl.src);
  });
}

async function publishCompositionToGallery() {
  const errorEl = document.getElementById('po-gallery-publish-error');
  const statusEl = document.getElementById('po-gallery-publish-status');
  errorEl.style.display = 'none';
  statusEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = I18n.t('fav.need_login');
    errorEl.style.display = 'block';
    return;
  }
  if (!compositionSlots.length) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  const submitBtn = document.getElementById('po-gallery-publish-submit-btn');
  submitBtn.disabled = true;
  try {
    // Reaproveita a pré-visualização já gerada (botão "✨ Gerar imagem
    // realista", ver generateAiPreviewForGallery) — pedido do usuário:
    // "quero gerar a imagem de ia antes de publicar", não gerar de novo (e
    // pagar de novo) na hora de enviar. Se o cliente pulou essa etapa e
    // clicou direto em "Enviar pra Galeria", cai pro comportamento antigo:
    // gera na hora, com fallback pro screenshot 3D puro se a IA falhar —
    // nunca trava a publicação por causa disso.
    let imageDataUrl;
    let renderStatus;
    if (galleryAiPreviewImage) {
      imageDataUrl = galleryAiPreviewImage;
      renderStatus = galleryAiPreviewStatus;
    } else {
      // Mesma cena "limpa" (sem cotas/decoração, só piso+teto) usada em
      // generateAiPreviewForGallery — ver renderCompositionForAiSnapshot.
      // SEMPRE restaurada logo abaixo, antes de seguir pro resto da função.
      const usedCleanSceneFallback = renderCompositionForAiSnapshot();
      const rawSnapshot = (typeof ViewerComposition !== 'undefined' && ViewerComposition.snapshot) ? ViewerComposition.snapshot({ frontal: true }) : null;
      const trimmedSnapshot = rawSnapshot ? await trimTransparentPng(rawSnapshot) : null;
      imageDataUrl = trimmedSnapshot;
      renderStatus = trimmedSnapshot ? 'pending' : 'failed';
      if (trimmedSnapshot) {
        try {
          const fallbackFamilyId = document.getElementById('po-gallery-room-type').value || null;
          const fallbackRoomLabel = fallbackFamilyId ? galleryFamilyName(fallbackFamilyId) : null;
          const fallbackAspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));
          // Mesma correção do preview: preenche pra bater exatamente a
          // proporção pedida ao Gemini antes de mandar (ver padImageToAspectRatio).
          const fallbackSourceImage = (await padImageToAspectRatio(trimmedSnapshot, aspectRatioLabelToValue(fallbackAspectRatio))) || trimmedSnapshot;
          imageDataUrl = fallbackSourceImage;
          const fallbackAngleRefImages = await captureCompositionAngleReferences();
          const [{ moduleRefImages }, fallbackColorLabel, fallbackColorRefImages] = await Promise.all([
            fetchReferencePhotosForComposition(),
            buildColorDescriptionForComposition(),
            buildColorReferencesForComposition()
          ]);
          const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
            body: { imageDataUrl: fallbackSourceImage, moduleRefImages, colorLabel: fallbackColorLabel, colorRefImages: fallbackColorRefImages, angleRefImages: fallbackAngleRefImages, roomLabel: fallbackRoomLabel, aspectRatio: fallbackAspectRatio }
          });
          if (!renderError && renderData && renderData.imageDataUrl) {
            imageDataUrl = renderData.imageDataUrl;
            renderStatus = 'ready';
          }
        } catch (aiErr) {
          // Function não publicada ainda, sem crédito, rede fora, etc. —
          // segue com o screenshot 3D mesmo (renderStatus continua 'pending').
        } finally {
          if (usedCleanSceneFallback) generateComposition3D();
        }
      } else if (usedCleanSceneFallback) {
        generateComposition3D();
      }
    }

    // Sobe a imagem pro Storage antes de gravar o post (ver
    // uploadGalleryImageToStorage acima) — se falhar por qualquer motivo
    // (bucket/migration 055 ainda não rodou, rede fora), cai pro base64
    // como antes em vez de travar a publicação.
    try {
      imageDataUrl = await uploadGalleryImageToStorage(imageDataUrl);
    } catch (uploadErr) {
      console.error('Falha ao subir imagem da Galeria pro Storage, mantendo base64:', uploadErr);
    }

    const totalsMm = computeCompositionTotalsMm();
    const priceSale = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
    const priceCost = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.cost_total) || 0), 0);
    const isAnonymous = !!document.getElementById('po-gallery-anonymous-chk').checked;
    // Ambiente = MESMA taxonomia de família dos módulos (migration 049) —
    // ver populateGalleryFamilySelect. Sem "outro" fixo: se o cliente não
    // escolher (ou não houver família cadastrada), fica null.
    const familyId = document.getElementById('po-gallery-room-type').value || null;

    const payload = {
      author_user_id: currentUser.id,
      // Sem tabela de perfil neste projeto (ver showLoggedIn) — usa o
      // e-mail da sessão como nome de exibição, igual ao chip do topo do
      // portal. is_anonymous decide só se a TELA mostra isso ou não; o
      // valor real fica sempre gravado (pedido do usuário: uso interno em
      // apresentações).
      author_display_name: currentUser.email || null,
      is_anonymous: isAnonymous,
      status: 'pending',
      render_status: renderStatus,
      ai_image_data_url: imageDataUrl,
      composition_name: loadedFavorite ? loadedFavorite.name : null,
      family_id: familyId,
      total_width_mm: totalsMm ? totalsMm.totalWidth : null,
      total_height_mm: totalsMm ? totalsMm.totalHeight : null,
      total_depth_mm: totalsMm ? totalsMm.totalDepth : null,
      price_sale: priceSale,
      price_cost: priceCost,
      colors_used: aggregateColorsUsedForComposition(),
      slots: serializeCompositionSlots()
    };
    const { error } = await supabaseClient.from('gallery_posts').insert(payload);
    if (error) throw error;
    statusEl.textContent = I18n.t('gallery.publish_success');
    document.getElementById('po-gallery-anonymous-chk').checked = false;
    galleryAiPreviewImage = null;
    galleryAiPreviewStatus = null;
    document.getElementById('po-gallery-ai-preview-wrap').style.display = 'none';
    const baseWrapAfterPublish = document.getElementById('po-gallery-base-preview-wrap');
    if (baseWrapAfterPublish) baseWrapAfterPublish.style.display = 'none';
    setTimeout(() => {
      statusEl.textContent = '';
      document.getElementById('po-gallery-publish-form').style.display = 'none';
    }, 4000);
  } catch (err) {
    errorEl.textContent = err.message || String(err);
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
  }
}

const galleryPublishSubmitBtn = document.getElementById('po-gallery-publish-submit-btn');
if (galleryPublishSubmitBtn) galleryPublishSubmitBtn.addEventListener('click', publishCompositionToGallery);

// Converte um data: URL (base64) num Blob pra poder subir pro Storage —
// fetch() aceita data: URL como entrada (funciona em todo browser moderno),
// mais simples que decodificar base64 na mão com atob()/Uint8Array.
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

// "⬇️ Baixar" / "↗️ Compartilhar" a imagem gerada (pedido do usuário,
// 2026-07-21) — direto na prévia, ANTES de publicar na Galeria (que exige
// login + moderação). imageDataUrl aqui é sempre a mesma base64 que já está
// em galleryAiPreviewImage/projectGalleryAiPreviewImage (nunca a URL do
// Storage — o upload só acontece na hora de publicar, ver
// uploadGalleryImageToStorage), então funciona mesmo sem ter publicado nada
// ainda.
function dataUrlFileExtension(dataUrl) {
  const match = /^data:image\/(\w+);/.exec(dataUrl || '');
  return match ? match[1].replace('jpeg', 'jpg') : 'png';
}

function downloadGeneratedImage(dataUrl, filenameBase) {
  if (!dataUrl) return;
  const ext = dataUrlFileExtension(dataUrl);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${filenameBase || 'imagem'}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Web Share API (nível 2, com arquivo) — funciona nativamente em
// celular (abre o menu de compartilhar do sistema: WhatsApp, Instagram,
// etc.) e em boa parte dos desktops modernos. Sem suporte (ou usuário
// cancelou o share nativo, que dispara AbortError), cai pro download —
// nunca deixa o botão "sem fazer nada visível", mesma filosofia de
// generateAiPreviewForGallery (sempre mostra alguma imagem no preview).
async function shareGeneratedImage(dataUrl, filenameBase, statusEl) {
  if (!dataUrl) return;
  if (statusEl) statusEl.textContent = '';
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const ext = dataUrlFileExtension(dataUrl);
    const file = new File([blob], `${filenameBase || 'imagem'}.${ext}`, { type: blob.type || 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // usuário cancelou o share nativo — não faz nada
  }
  downloadGeneratedImage(dataUrl, filenameBase);
  if (statusEl) statusEl.textContent = I18n.t('gallery.share_unsupported_hint');
}

const galleryAiDownloadBtn = document.getElementById('po-gallery-ai-download-btn');
if (galleryAiDownloadBtn) {
  galleryAiDownloadBtn.addEventListener('click', () => downloadGeneratedImage(galleryAiPreviewImage, 'composicao'));
}
const galleryAiShareBtn = document.getElementById('po-gallery-ai-share-btn');
if (galleryAiShareBtn) {
  galleryAiShareBtn.addEventListener('click', () => shareGeneratedImage(galleryAiPreviewImage, 'composicao', document.getElementById('po-gallery-ai-preview-hint')));
}

// Migration 055 + pedido do usuário 2026-07-20 ("gallery muito lenta pra
// abrir"): a causa era a imagem inteira em base64 dentro da linha de
// gallery_posts — cada select trazia vários MB de texto do Postgres antes
// de mostrar qualquer coisa. Agora sobe o arquivo pro bucket
// "gallery-images" e devolve só a URL pública (poucos bytes) pra gravar em
// ai_image_data_url — MESMA coluna, só troca o conteúdo (data: URL -> URL
// https), então nada mais no app precisa mudar (os <img src="..."> value
// continuam funcionando iguais nos dois formatos).
// Se já vier uma URL http(s) (post já migrado, ou nada mudou nesta edição),
// devolve sem subir de novo. Duplicada em admin.js (não há bundle
// compartilhado entre portal.js/admin.js neste projeto, mesmo padrão já
// usado pra outros helpers pequenos como formatMoney).
async function uploadGalleryImageToStorage(imageDataUrl) {
  if (!imageDataUrl || !imageDataUrl.startsWith('data:')) return imageDataUrl;
  const blob = await dataUrlToBlob(imageDataUrl);
  const ext = (blob.type.split('/')[1] || 'png').split('+')[0]; // "image/svg+xml" -> "svg"
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseClient.storage.from('gallery-images').upload(path, blob, {
    contentType: blob.type || 'image/png',
    upsert: false
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('gallery-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---------- GALERIA — grade pública, filtros, curtidas, "usar esta composição" ----------

let galleryPostsCache = [];
let galleryLikedPostIds = new Set();
// Paginação (2026-07-19) — a consulta original buscava TODAS as composições
// aprovadas de uma vez, sem LIMIT, incluindo colunas grandes
// (ai_image_data_url em base64, slots jsonb) — passou a devolver "canceling
// statement due to statement timeout" do Postgres conforme a galeria
// cresceu (mais posts = mais bytes de imagem lidos numa consulta só). Agora
// carrega em páginas de GALLERY_PAGE_SIZE, mais rápido por vez e sem
// depender do tamanho total da galeria.
// Reduzido de 24 pra 10 (2026-07-19, pedido do usuário: "ainda nao puxou,
// deixa so 10 talvez") — a página de 24 ainda estourava o statement_timeout,
// então cada consulta precisa ler menos bytes de imagem de uma vez.
const GALLERY_PAGE_SIZE = 10;
let galleryHasMore = false;

// Curtidas do usuário atual pra um conjunto de posts — extraído pra
// reaproveitar tanto na carga inicial (loadGalleryList) quanto ao "Carregar
// mais" (loadMoreGalleryPosts), que só precisa buscar curtidas dos posts
// NOVOS (os já carregados continuam em galleryLikedPostIds).
async function fetchGalleryLikedPostIds(postIds) {
  if (!currentUser || !postIds.length) return new Set();
  const { data } = await supabaseClient
    .from('gallery_post_likes')
    .select('gallery_post_id')
    .eq('user_id', currentUser.id)
    .in('gallery_post_id', postIds);
  return new Set((data || []).map((l) => l.gallery_post_id));
}

function updateGalleryLoadMoreBtn() {
  const btn = document.getElementById('po-gallery-load-more-btn');
  if (btn) btn.style.display = galleryHasMore ? 'inline-block' : 'none';
}

async function loadGalleryList() {
  const errorEl = document.getElementById('po-gallery-error');
  errorEl.style.display = 'none';
  // Só as colunas SEGURAS pro cliente — preço de CUSTO e a identidade real
  // do autor de post anônimo nunca são pedidos aqui de propósito (RLS é por
  // LINHA, não por coluna — ver comentário da migration 048; a proteção de
  // verdade é nunca selecionar essas colunas nesta tela, mesmo raciocínio já
  // aceito no projeto pra margem/custo de order_items).
  const { data, error } = await supabaseClient
    .from('gallery_posts')
    .select('id, ai_image_data_url, render_status, composition_name, family_id, source_type, wall_width_mm, total_width_mm, total_height_mm, total_depth_mm, price_sale, colors_used, slots, likes_count, is_anonymous, author_display_name, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .range(0, GALLERY_PAGE_SIZE - 1);
  if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }
  galleryPostsCache = data || [];
  galleryHasMore = galleryPostsCache.length === GALLERY_PAGE_SIZE;
  updateGalleryLoadMoreBtn();

  galleryLikedPostIds = await fetchGalleryLikedPostIds(galleryPostsCache.map((p) => p.id));

  populateGalleryFamilySelect(document.getElementById('po-gallery-filter-room'), true);
  populateGalleryColorFilter();
  applyGalleryFilters();
}

// "Carregar mais" — busca a PRÓXIMA página (range a partir do que já está em
// galleryPostsCache) e concatena, sem re-buscar o que já foi carregado.
async function loadMoreGalleryPosts() {
  const btn = document.getElementById('po-gallery-load-more-btn');
  const errorEl = document.getElementById('po-gallery-error');
  if (!galleryHasMore || (btn && btn.disabled)) return;
  if (btn) btn.disabled = true;
  errorEl.style.display = 'none';
  try {
    const from = galleryPostsCache.length;
    const { data, error } = await supabaseClient
      .from('gallery_posts')
      .select('id, ai_image_data_url, render_status, composition_name, family_id, source_type, wall_width_mm, total_width_mm, total_height_mm, total_depth_mm, price_sale, colors_used, slots, likes_count, is_anonymous, author_display_name, created_at')
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .range(from, from + GALLERY_PAGE_SIZE - 1);
    if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }
    const newPosts = data || [];
    galleryPostsCache = galleryPostsCache.concat(newPosts);
    galleryHasMore = newPosts.length === GALLERY_PAGE_SIZE;
    const newLikes = await fetchGalleryLikedPostIds(newPosts.map((p) => p.id));
    newLikes.forEach((id) => galleryLikedPostIds.add(id));
    populateGalleryColorFilter();
    applyGalleryFilters();
    updateGalleryLoadMoreBtn();
  } finally {
    if (btn) btn.disabled = false;
  }
}
const galleryLoadMoreBtn = document.getElementById('po-gallery-load-more-btn');
if (galleryLoadMoreBtn) galleryLoadMoreBtn.addEventListener('click', loadMoreGalleryPosts);

function populateGalleryColorFilter() {
  const sel = document.getElementById('po-gallery-filter-color');
  if (!sel) return;
  const current = sel.value;
  const byColorId = new Map();
  galleryPostsCache.forEach((post) => {
    (post.colors_used || []).forEach((c) => { if (c.color_id) byColorId.set(c.color_id, c.color_name); });
  });
  sel.innerHTML = '';
  const optAll = document.createElement('option');
  optAll.value = '';
  optAll.textContent = I18n.t('gallery.filter_color_all');
  sel.appendChild(optAll);
  [...byColorId.entries()].sort((a, b) => (a[1] || '').localeCompare(b[1] || '')).forEach(([colorId, colorName]) => {
    const opt = document.createElement('option');
    opt.value = colorId;
    opt.textContent = colorName || colorId;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

function applyGalleryFilters() {
  const room = document.getElementById('po-gallery-filter-room').value;
  const priceMin = parseFloat(document.getElementById('po-gallery-filter-price-min').value);
  const priceMax = parseFloat(document.getElementById('po-gallery-filter-price-max').value);
  const widthMin = parseFloat(document.getElementById('po-gallery-filter-width-min').value);
  const widthMax = parseFloat(document.getElementById('po-gallery-filter-width-max').value);
  const colorId = document.getElementById('po-gallery-filter-color').value;

  const filtered = galleryPostsCache.filter((post) => {
    if (room && post.family_id !== room) return false;
    if (!isNaN(priceMin) && Number(post.price_sale || 0) < priceMin) return false;
    if (!isNaN(priceMax) && Number(post.price_sale || 0) > priceMax) return false;
    if (!isNaN(widthMin) && Number(post.total_width_mm || 0) < widthMin) return false;
    if (!isNaN(widthMax) && Number(post.total_width_mm || 0) > widthMax) return false;
    if (colorId && !(post.colors_used || []).some((c) => c.color_id === colorId)) return false;
    return true;
  });
  renderGalleryGrid(filtered);
}

// Ícone de compartilhar em SVG (em vez de emoji "⤴") — pedido do usuário
// 2026-07-20: o emoji não renderizava de forma confiável (aparecia como
// círculo vazio em algumas fontes/SO). SVG com stroke="currentColor" segue
// a cor definida em .po-gallery-share-btn (preto), sem depender de fonte.
const GALLERY_SHARE_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="2"/>
  <circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
  <circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="2"/>
  <line x1="8.6" y1="10.6" x2="15.4" y2="6.4" stroke="currentColor" stroke-width="2"/>
  <line x1="8.6" y1="13.4" x2="15.4" y2="17.6" stroke="currentColor" stroke-width="2"/>
</svg>`;

// Ícones de marca (pedido do usuário 2026-07-20: "usa icones de acordo com
// cada app, mais profissional" — trocou os emojis 📌📘💬✉️🔗 por SVG com a
// cor/forma reconhecível de cada rede, igual qualquer app de verdade faz.
const GALLERY_SHARE_ICONS = {
  pinterest: `<svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align:middle;flex:none;"><circle cx="12" cy="12" r="12" fill="#E60023"/><path d="M12.02 5.5c-3.6 0-5.42 2.58-5.42 4.73 0 1.3.5 2.46 1.55 2.89.17.07.33 0 .38-.19l.16-.62c.05-.2.03-.27-.11-.44-.32-.38-.52-.87-.52-1.57 0-2.02 1.51-3.83 3.94-3.83 2.15 0 3.33 1.31 3.33 3.07 0 2.31-1.02 4.26-2.54 4.26-.84 0-1.46-.69-1.26-1.54.24-1.01.7-2.1.7-2.83 0-.65-.35-1.2-1.08-1.2-.86 0-1.54.89-1.54 2.08 0 .76.26 1.27.26 1.27s-.87 3.68-1.02 4.33c-.3 1.27-.05 2.83-.02 2.98.01.09.13.11.18.04.08-.1 1.05-1.3 1.38-2.5.09-.34.53-2.06.53-2.06.26.5 1.03.94 1.85.94 2.44 0 4.09-2.22 4.09-5.19 0-2.24-1.9-4.6-5-4.6z" fill="#fff"/></svg>`,
  facebook: `<svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align:middle;flex:none;"><circle cx="12" cy="12" r="12" fill="#1877F2"/><path d="M13.5 12.5h2l.3-2.3h-2.3V8.7c0-.67.19-1.12 1.14-1.12h1.22V5.53C15.63 5.5 14.9 5.44 14.05 5.44c-1.79 0-3.02 1.09-3.02 3.1v1.66H9v2.3h2.03v6.06h2.47V12.5z" fill="#fff"/></svg>`,
  whatsapp: `<svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align:middle;flex:none;"><circle cx="12" cy="12" r="12" fill="#25D366"/><path d="M12 5.5a6.5 6.5 0 00-5.6 9.79L5.5 18.5l3.32-.87A6.5 6.5 0 1012 5.5zm0 1.3a5.2 5.2 0 11-2.66 9.66l-.19-.11-1.98.52.53-1.93-.12-.2A5.2 5.2 0 0112 6.8zm-2.62 2.1c-.14 0-.36.05-.55.27-.19.21-.72.7-.72 1.72s.74 1.99.84 2.13c.1.14 1.45 2.28 3.6 3.1 1.79.68 2.15.55 2.54.51.39-.04 1.25-.51 1.43-1 .18-.49.18-.91.13-1-.05-.09-.19-.14-.4-.25-.21-.11-1.25-.62-1.44-.69-.19-.07-.34-.11-.48.11-.14.21-.55.69-.68.83-.13.14-.25.16-.46.05-.21-.11-.9-.33-1.71-1.06-.63-.56-1.06-1.26-1.18-1.47-.12-.21-.01-.32.09-.43.1-.1.21-.25.32-.37.11-.13.14-.21.21-.36.07-.14.04-.27-.02-.38-.05-.11-.48-1.19-.67-1.62-.17-.42-.35-.36-.48-.37h-.4z" fill="#fff"/></svg>`,
  email: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;flex:none;"><rect x="2" y="5" width="20" height="14" rx="2" stroke="#5f6368" stroke-width="1.6"/><path d="M3 6.5l9 6.5 9-6.5" stroke="#5f6368" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  link: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="vertical-align:middle;flex:none;"><path d="M9.5 14.5l5-5M8 14a3 3 0 010-4.24l2-2A3 3 0 0114.24 8m-1.24 8a3 3 0 004.24 0l2-2a3 3 0 00-4.24-4.24" stroke="#5f6368" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`
};

function renderGalleryGrid(posts) {
  const grid = document.getElementById('po-gallery-grid');
  const emptyHint = document.getElementById('po-gallery-empty-hint');
  if (!grid) return;
  grid.innerHTML = '';
  emptyHint.style.display = posts.length ? 'none' : 'block';

  posts.forEach((post) => {
    const card = document.createElement('div');
    card.className = 'po-gallery-card';
    const authorLabel = post.is_anonymous ? I18n.t('gallery.anonymous_author') : (post.author_display_name || I18n.t('gallery.anonymous_author'));
    const dims = (post.total_width_mm && post.total_height_mm && post.total_depth_mm)
      ? `${Math.round(post.total_width_mm)} × ${Math.round(post.total_height_mm)} × ${Math.round(post.total_depth_mm)} mm`
      : '';
    const likeContent = galleryLikeButtonContent(post);
    card.innerHTML = `
      <div class="po-gallery-card-image-wrap">
        <button type="button" class="po-gallery-like-btn${likeContent.hasCount ? ' has-count' : ''}">${likeContent.html}</button>
        ${post.ai_image_data_url
          ? `<img src="${post.ai_image_data_url}" alt="" class="po-gallery-card-image" /><div class="po-gallery-card-image-zoom-hint">🔍</div>`
          : `<div class="po-gallery-card-image-empty"></div>`}
      </div>
      <div class="po-gallery-card-body">
        <div class="po-gallery-card-name"></div>
        <div class="po-gallery-card-meta hint">${galleryFamilyName(post.family_id) || ''}${dims ? ' · ' + dims : ''}</div>
        <div class="po-gallery-card-author hint"></div>
        <div class="po-gallery-card-price-label hint">${I18n.t('gallery.price_label')}</div>
        <div class="po-gallery-card-price">${formatGalleryPrice(post.price_sale)}</div>
        <div class="po-gallery-card-actions">
          <button type="button" class="po-gallery-use-btn">${I18n.t('gallery.use_composition_btn')} →</button>
          <button type="button" class="po-gallery-share-btn" title="${I18n.t('gallery.share_btn_label')}" aria-label="${I18n.t('gallery.share_btn_label')}">${GALLERY_SHARE_ICON_SVG}</button>
        </div>
      </div>
    `;
    card.querySelector('.po-gallery-card-name').textContent = post.composition_name || I18n.t('gallery.untitled');
    card.querySelector('.po-gallery-card-author').textContent = I18n.t('gallery.posted_by', { name: authorLabel });
    card.querySelector('.po-gallery-like-btn').addEventListener('click', (ev) => toggleGalleryLike(post, ev.currentTarget));
    // Pedido do usuário 2026-07-20: Galeria pública pra visitante, mas
    // "Customizar" pede login na hora — abre o modal (guardando a
    // composição em pendingGalleryPostForAuth) em vez de tentar carregar
    // uma aba que nem existe pra quem não tem conta (Composição fica
    // escondida em modo visitante, ver guest-mode no CSS).
    card.querySelector('.po-gallery-use-btn').addEventListener('click', () => {
      if (!currentUser) { openAuthModal(post); return; }
      restoreGalleryPostBySourceType(post);
    });
    card.querySelector('.po-gallery-share-btn').addEventListener('click', (ev) => { ev.stopPropagation(); openGalleryShareMenu(post, ev.currentTarget); });
    const cardImg = card.querySelector('.po-gallery-card-image');
    if (cardImg) cardImg.addEventListener('click', () => openGalleryLightbox(post.ai_image_data_url));
    grid.appendChild(card);
  });
}

// Lightbox simples pra ver a imagem gerada em tamanho grande (pedido do
// usuário: "nao consigo dar zoom, bem ruim de ver assim"). Overlay único,
// criado uma vez e reaproveitado (lazy), object-fit:contain então nada é
// cortado — o card em si usa 'cover' só pra preencher bonito a miniatura.
function openGalleryLightbox(imageUrl) {
  if (!imageUrl) return;
  let overlay = document.getElementById('po-gallery-lightbox');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'po-gallery-lightbox';
    overlay.className = 'po-gallery-lightbox-overlay';
    overlay.innerHTML = `
      <button type="button" class="po-gallery-lightbox-close" aria-label="Fechar">&times;</button>
      <img class="po-gallery-lightbox-img" alt="" />
    `;
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay || ev.target.classList.contains('po-gallery-lightbox-close')) {
        overlay.style.display = 'none';
      }
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') overlay.style.display = 'none';
    });
    document.body.appendChild(overlay);
  }
  overlay.querySelector('.po-gallery-lightbox-img').src = imageUrl;
  overlay.style.display = 'flex';
}

// Pedido do usuário 2026-07-20: coração vermelho "bonito" em vez do texto
// cru — só CONTORNO (♡) quando o post ainda não tem nenhuma curtida, e
// PREENCHIDO (♥) + número quando likes_count > 0 (sem número nenhum no
// estado de zero curtidas). Cor vem do CSS (.po-gallery-like-heart), o
// glifo em si (♡ vazado vs ♥ sólido) já dá a diferença de contorno/cheio.
// Usado tanto no render inicial (renderGalleryGrid) quanto depois de
// curtir/descurtir (toggleGalleryLike), pra nunca duas lógicas divergirem.
function galleryLikeButtonContent(post) {
  const count = Number(post.likes_count || 0);
  if (count > 0) {
    return { html: `<span class="po-gallery-like-heart">♥</span><span class="po-gallery-like-count">${count}</span>`, hasCount: true };
  }
  return { html: `<span class="po-gallery-like-heart">♡</span>`, hasCount: false };
}

async function toggleGalleryLike(post, btnEl) {
  if (!currentUser) {
    openAuthModal(post);
    return;
  }
  const alreadyLiked = galleryLikedPostIds.has(post.id);
  btnEl.disabled = true;
  try {
    if (alreadyLiked) {
      const { error } = await supabaseClient.from('gallery_post_likes').delete()
        .eq('gallery_post_id', post.id).eq('user_id', currentUser.id);
      if (error) throw error;
      galleryLikedPostIds.delete(post.id);
      post.likes_count = Math.max(Number(post.likes_count || 0) - 1, 0);
    } else {
      const { error } = await supabaseClient.from('gallery_post_likes').insert({
        gallery_post_id: post.id, user_id: currentUser.id
      });
      if (error) throw error;
      galleryLikedPostIds.add(post.id);
      post.likes_count = Number(post.likes_count || 0) + 1;
    }
    const content = galleryLikeButtonContent(post);
    btnEl.innerHTML = content.html;
    btnEl.classList.toggle('has-count', content.hasCount);
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    btnEl.disabled = false;
  }
}

// "Usar esta composição" — carrega o snapshot do post na aba Composição, SEM
// amarrar a nenhum favorito existente (bindAsFavorite=false, ver
// restoreFavoriteComposition) — pedido do usuário: "pode abrir o ambiente e
// fazer suas alterações... o cliente nao sai do zero". id null é
// deliberado: não existe (nem poderia, RLS owner-only) nenhuma
// user_compositions correspondente a um post de outra pessoa.
function restoreGalleryPostAsComposition(post) {
  restoreFavoriteComposition({ id: null, name: post.composition_name || I18n.t('gallery.untitled'), slots: post.slots }, false);
}

// Botão "Compartilhar" no card (pedido do usuário 2026-07-20, na sequência
// perguntou sobre Pinterest — puxado pra dentro do mesmo menu). Link aponta
// pra portal.html?galleryPost=<id>, que reabre essa composição específica
// direto na aba Composição pra quem clicar (ver maybeOpenSharedGalleryPost
// mais abaixo). Pinterest/Facebook usam a URL real da imagem
// (post.ai_image_data_url) — só existe uma URL de verdade (em vez de
// base64) depois da migration 055; post antigo ainda não migrado continua
// compartilhando o link, só sem preview de imagem no cartão do Pinterest.
function buildGalleryShareUrl(post) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('galleryPost', post.id);
  return url.toString();
}

let galleryShareMenuEl = null;
let galleryShareMenuPost = null;

function closeGalleryShareMenu() {
  if (galleryShareMenuEl) galleryShareMenuEl.style.display = 'none';
}

function openGalleryShareMenu(post, anchorEl) {
  if (galleryShareMenuEl && galleryShareMenuPost === post && galleryShareMenuEl.style.display === 'flex') {
    closeGalleryShareMenu();
    return;
  }
  galleryShareMenuPost = post;
  if (!galleryShareMenuEl) {
    galleryShareMenuEl = document.createElement('div');
    galleryShareMenuEl.className = 'po-gallery-share-menu';
    document.body.appendChild(galleryShareMenuEl);
    document.addEventListener('click', (ev) => {
      if (galleryShareMenuEl.style.display === 'flex' && !galleryShareMenuEl.contains(ev.target) && !ev.target.closest('.po-gallery-share-btn')) {
        closeGalleryShareMenu();
      }
    });
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeGalleryShareMenu(); });
    window.addEventListener('resize', closeGalleryShareMenu);
  }

  const pageUrl = buildGalleryShareUrl(post);
  const imageUrl = (post.ai_image_data_url && post.ai_image_data_url.startsWith('http')) ? post.ai_image_data_url : '';
  const title = post.composition_name || I18n.t('gallery.untitled');
  const shareText = `${title} — ${I18n.t('gallery.price_label')} ${formatGalleryPrice(post.price_sale)}`;
  const pinterestUrl = `https://www.pinterest.com/pin/create/button/?url=${encodeURIComponent(pageUrl)}${imageUrl ? `&media=${encodeURIComponent(imageUrl)}` : ''}&description=${encodeURIComponent(shareText)}`;
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + ' ' + pageUrl)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(shareText + '\n' + pageUrl)}`;

  galleryShareMenuEl.innerHTML = `
    <a href="${pinterestUrl}" target="_blank" rel="noopener noreferrer" class="po-gallery-share-item">${GALLERY_SHARE_ICONS.pinterest} ${I18n.t('gallery.share_pinterest')}</a>
    <a href="${facebookUrl}" target="_blank" rel="noopener noreferrer" class="po-gallery-share-item">${GALLERY_SHARE_ICONS.facebook} ${I18n.t('gallery.share_facebook')}</a>
    <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" class="po-gallery-share-item">${GALLERY_SHARE_ICONS.whatsapp} ${I18n.t('gallery.share_whatsapp')}</a>
    <a href="${emailUrl}" class="po-gallery-share-item">${GALLERY_SHARE_ICONS.email} ${I18n.t('gallery.share_email')}</a>
    <button type="button" class="po-gallery-share-item po-gallery-share-copy-btn">${GALLERY_SHARE_ICONS.link} ${I18n.t('gallery.share_copy_link')}</button>
  `;
  const copyBtn = galleryShareMenuEl.querySelector('.po-gallery-share-copy-btn');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      copyBtn.textContent = I18n.t('gallery.share_copied');
      setTimeout(() => { if (galleryShareMenuPost === post) copyBtn.innerHTML = `${GALLERY_SHARE_ICONS.link} ${I18n.t('gallery.share_copy_link')}`; }, 2000);
    } catch (err) {
      copyBtn.textContent = pageUrl;
    }
  });

  galleryShareMenuEl.style.display = 'flex';
  const rect = anchorEl.getBoundingClientRect();
  const menuRect = galleryShareMenuEl.getBoundingClientRect();
  let left = rect.left + window.scrollX;
  if (left + menuRect.width > window.scrollX + document.documentElement.clientWidth - 8) {
    left = rect.right + window.scrollX - menuRect.width;
  }
  galleryShareMenuEl.style.top = `${rect.bottom + window.scrollY + 6}px`;
  galleryShareMenuEl.style.left = `${left}px`;
}

// Link compartilhado (?galleryPost=<id>) — abre direto na aba Composição já
// carregada com a composição daquele post, pra quem recebeu o link (via
// Pinterest/Facebook/WhatsApp/e-mail) ver e poder customizar na hora, sem
// precisar procurar na Galeria. Chamada depois de showLoggedIn (precisa de
// currentUser) tanto no init() quanto no submit do login — mesmo padrão de
// maybeLoadGalleryPostForAdminEdit. Só posts aprovados (RLS já bloquearia
// os outros de qualquer forma, mas o filtro aqui deixa explícito).
async function maybeOpenSharedGalleryPost() {
  const postId = new URLSearchParams(window.location.search).get('galleryPost');
  if (!postId || !currentUser) return;
  try {
    const { data: post, error } = await supabaseClient
      .from('gallery_posts')
      .select('id, composition_name, slots, source_type, wall_width_mm')
      .eq('id', postId)
      .eq('status', 'approved')
      .single();
    if (error || !post) return;
    // Troca de aba fica a cargo do restore certo (restoreFavoriteComposition
    // vai pra Composição, restoreFavoriteProject vai pra Projetos) — ver
    // restoreGalleryPostBySourceType.
    restoreGalleryPostBySourceType(post);
    // Tira o parâmetro da URL depois de abrir — um F5 acidental não deve
    // reabrir por cima de alterações que o cliente já tenha feito.
    const url = new URL(window.location.href);
    url.searchParams.delete('galleryPost');
    window.history.replaceState({}, '', url);
  } catch (err) {
    console.error('Erro ao abrir composição compartilhada:', err);
  }
}

function updateGalleryAdminEditBanner() {
  const banner = document.getElementById('po-comp-admin-edit-banner');
  if (banner) banner.style.display = editingGalleryPostId ? 'flex' : 'none';
}

// Entrada da edição admin — chamada uma vez no init() (ver fim do arquivo)
// quando a URL vem com ?editGalleryPost=<id> (link "Editar" da lista de
// moderação em admin.html). Confere is_admin() de VERDADE no servidor (RPC,
// ver migration_018_admin_allowlist.sql) antes de carregar qualquer coisa —
// um cliente comum que descobrisse o parâmetro na URL não consegue nada além
// do que a RLS "admin manage gallery_posts" já bloqueia, mas a checagem aqui
// evita mostrar a tela de edição pra quem não é admin.
async function maybeLoadGalleryPostForAdminEdit() {
  const postId = new URLSearchParams(window.location.search).get('editGalleryPost');
  if (!postId || !currentUser) return;
  try {
    const { data: isAdmin, error: adminErr } = await supabaseClient.rpc('is_admin');
    if (adminErr || !isAdmin) {
      alert(I18n.t('gallery.admin_edit_not_allowed'));
      return;
    }
    // select('*') aqui é intencional (diferente de loadGalleryList, que só
    // pega colunas seguras pro cliente comum) — quem chegou até aqui já
    // passou pelo is_admin() acima, e RLS "admin manage gallery_posts" já
    // libera tudo pra admin de qualquer forma.
    const { data: post, error } = await supabaseClient.from('gallery_posts').select('*').eq('id', postId).single();
    if (error || !post) {
      alert(I18n.t('gallery.admin_edit_load_error'));
      return;
    }
    await restoreFavoriteComposition({ id: null, name: post.composition_name || I18n.t('gallery.untitled'), slots: post.slots }, false);
    editingGalleryPostId = post.id;
    editingGalleryPostName = post.composition_name || null;
    updateGalleryAdminEditBanner();
  } catch (err) {
    console.error('Erro ao carregar post da galeria pra edição admin:', err);
  }
}

// "Salvar alterações na Galeria" — atualiza DIRETO o post existente (não
// cria um novo, diferente de publishCompositionToGallery). Só mexe nos
// campos derivados da composição em si (slots/cores/medidas/preço); status
// de moderação, autoria e anonimato do post NÃO são tocados aqui — a
// moderação continua só pela lista do admin.html. Se o admin também gerou
// uma prévia de IA nova nesta sessão (mesmo botão "✨ Gerar imagem com IA" de
// sempre, ver generateAiPreviewForGallery), a imagem publicada é atualizada
// junto — senão a imagem/render_status que já existiam continuam.
async function saveGalleryPostAdminEdit() {
  if (!editingGalleryPostId) return;
  const btn = document.getElementById('po-comp-admin-save-gallery-btn');
  const statusEl = document.getElementById('po-comp-admin-edit-status');
  if (!compositionSlots.length) {
    if (statusEl) {
      statusEl.textContent = I18n.t('fav.need_slots');
      statusEl.style.display = 'block';
    }
    return;
  }
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = ''; statusEl.style.display = 'none'; }
  try {
    const totalsMm = computeCompositionTotalsMm();
    const priceSale = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
    const priceCost = compositionSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.cost_total) || 0), 0);
    const payload = {
      composition_name: editingGalleryPostName,
      slots: serializeCompositionSlots(),
      colors_used: aggregateColorsUsedForComposition(),
      total_width_mm: totalsMm ? totalsMm.totalWidth : null,
      total_height_mm: totalsMm ? totalsMm.totalHeight : null,
      total_depth_mm: totalsMm ? totalsMm.totalDepth : null,
      price_sale: priceSale,
      price_cost: priceCost
    };
    if (galleryAiPreviewImage) {
      try {
        payload.ai_image_data_url = await uploadGalleryImageToStorage(galleryAiPreviewImage);
      } catch (uploadErr) {
        console.error('Falha ao subir imagem da Galeria pro Storage, mantendo base64:', uploadErr);
        payload.ai_image_data_url = galleryAiPreviewImage;
      }
      payload.render_status = galleryAiPreviewStatus;
    }
    const { error } = await supabaseClient.from('gallery_posts').update(payload).eq('id', editingGalleryPostId);
    if (error) throw error;
    if (statusEl) {
      statusEl.textContent = I18n.t('gallery.admin_save_success');
      statusEl.style.display = 'block';
      statusEl.classList.remove('error');
    }
    setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 5000);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = I18n.t('gallery.admin_save_error', { msg: err.message || String(err) });
      statusEl.style.display = 'block';
      statusEl.classList.add('error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}
const galleryAdminSaveBtn = document.getElementById('po-comp-admin-save-gallery-btn');
if (galleryAdminSaveBtn) galleryAdminSaveBtn.addEventListener('click', saveGalleryPostAdminEdit);

['po-gallery-filter-price-min', 'po-gallery-filter-price-max',
  'po-gallery-filter-width-min', 'po-gallery-filter-width-max'
].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', applyGalleryFilters);
});
['po-gallery-filter-room', 'po-gallery-filter-color'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('change', applyGalleryFilters);
});
const galleryFilterClearBtn = document.getElementById('po-gallery-filter-clear-btn');
if (galleryFilterClearBtn) {
  galleryFilterClearBtn.addEventListener('click', () => {
    document.getElementById('po-gallery-filter-room').value = '';
    document.getElementById('po-gallery-filter-price-min').value = '';
    document.getElementById('po-gallery-filter-price-max').value = '';
    document.getElementById('po-gallery-filter-width-min').value = '';
    document.getElementById('po-gallery-filter-width-max').value = '';
    document.getElementById('po-gallery-filter-color').value = '';
    applyGalleryFilters();
  });
}

// ---------- PLANO DE CORTE (migration 051, 2026-07-19) ----------
// Aba exclusiva do perfil Contractor (user_profiles.role) — planilha
// digitada/importada de peças avulsas (não vem de módulo configurado).
// "Gerar Preço" calcula tudo (m² da cor + fita de borda + mão de obra por
// peça + margem especial do plano de corte) mas só mostra o TOTAL final —
// mesmo padrão de "cálculo interno nunca aparece pro cliente" já usado em
// order_items.breakdown. "Aprovar e Salvar" grava direto como pedido
// aprovado (order_type='cutting_list', status='approved') — não passa pelo
// ciclo rascunho/aberto dos pedidos de módulo, porque aqui aprovar e salvar
// são o mesmo botão/pedido do usuário.

let currentUserProfile = null; // { user_id, email, role } — null até ensureOwnUserProfile() rodar
let cutlistColorsCache = [];
let cutlistPricingSettings = { cutting_list_markup_multiplier: 1, cutting_list_thickness_38_multiplier: 1, cutting_list_labor_price_per_piece: 0 };
let cutlistRows = [];
let cutlistRowSeq = 1;
// Linhas marcadas pra troca em massa (pedido do usuário 2026-07-31: "quero um
// quadrado pra selecionar e fazer uma troca de todos selecionados") — guarda
// row._id, não índice (índice muda ao remover linha do meio).
let cutlistCheckedIds = new Set();
// id sentinela pro popup de cor quando aberto pela barra de aplicar-em-massa
// (nenhuma row._id real jamais bate com isso), reaproveitando o mesmo
// singleton cutlistColorPopupEl/cutlistColorPopupRowId de sempre.
const CUTLIST_BULK_COLOR_POPUP_ID = 'bulk';
let cutlistFinalPrice = null; // Number depois de "Gerar Preço"; null = precisa gerar de novo (linhas mudaram)
let cutlistInitialized = false;

// Tamanhos de chapa cadastrados no admin (migration 063) — usados pelo
// "Gerar Plano de Corte". Cor sem default_sheet_size_id obriga escolha
// manual (ver renderCutlistSheetPickerPanel).
let cutlistSheetSizesCache = [];
let cutlistPendingPlanGroups = null; // grupos aguardando escolha manual de tamanho (painel visível)

// Limites de medida da chapa (pedido do usuário 2026-07-19) — mesmos valores
// no input (min/max do <input type="number">, só ajuda visual/teclado) e na
// validação de verdade antes de "Gerar Preço" (validateCutlistRows) e no
// banco (migration 051b, CHECK em cutting_list_items).
const CUTLIST_COMPRIMENTO_MIN = 76;
const CUTLIST_COMPRIMENTO_MAX = 2700;
const CUTLIST_LARGURA_MIN = 76;
const CUTLIST_LARGURA_MAX = 1500;

// Garante que o cliente logado tem uma linha em user_profiles. Só consegue
// CRIAR a própria linha com role='cliente' (policy "self insert own profile
// as cliente") — quem promove pra lojista/contractor/administrador é
// sempre o admin (admin.html, aba Perfis). Falha silenciosa (perfil
// continua null, aba Plano de Corte fica escondida) se a tabela ainda não
// existir ou der erro de rede — não deve travar o login.
async function ensureOwnUserProfile() {
  try {
    const { data, error } = await supabaseClient.from('user_profiles').select('*').eq('user_id', currentUser.id).maybeSingle();
    if (error) return;
    if (data) { currentUserProfile = data; return; }
    const { data: inserted, error: insertError } = await supabaseClient
      .from('user_profiles')
      .insert({ user_id: currentUser.id, email: currentUser.email })
      .select()
      .single();
    if (!insertError && inserted) currentUserProfile = inserted;
  } catch (err) {
    // silencioso — ver comentário acima
  }
}

function canUseCuttingList() {
  return !!currentUserProfile && (currentUserProfile.role === 'contractor' || currentUserProfile.role === 'administrador');
}

function applyCuttingListTabVisibility() {
  const btn = document.getElementById('po-nav-tab-cutting-list');
  if (btn) btn.style.display = canUseCuttingList() ? '' : 'none';
}

// Margem/espessura/mão de obra do plano de corte (migration 051, estende
// pricing_settings da migration 037). Falha silenciosa mantém os defaults
// (multiplicador 1 = sem margem/acréscimo, mão de obra $0) se der erro.
async function loadCuttingListPricingSettings() {
  const { data, error } = await supabaseClient
    .from('pricing_settings')
    .select('cutting_list_markup_multiplier, cutting_list_thickness_38_multiplier, cutting_list_labor_price_per_piece')
    .eq('id', true)
    .single();
  if (error || !data) return;
  cutlistPricingSettings = {
    cutting_list_markup_multiplier: Number(data.cutting_list_markup_multiplier) || 1,
    cutting_list_thickness_38_multiplier: Number(data.cutting_list_thickness_38_multiplier) || 1,
    cutting_list_labor_price_per_piece: Number(data.cutting_list_labor_price_per_piece) || 0
  };
}

async function loadCutlistColors() {
  if (cutlistColorsCache.length) return;
  const { data, error } = await supabaseClient
    .from('colors')
    // texture_url adicionado (pedido do usuário 2026-07-29: quadrado de cor
    // no lugar do <select> de texto puro) — sem ele o quadradinho cairia
    // sempre no swatch_hex genérico, mesmo pra cores com textura cadastrada.
    .select('id, name, sheet_price_per_m2, edge_price_per_linear_m, swatch_hex, texture_url, default_sheet_size_id, stock_in_house')
    .eq('active', true)
    .order('sort_order');
  if (error) return;
  cutlistColorsCache = data || [];
}

// Tamanhos de chapa (migration 063) — mesmo padrão de cache de
// loadCutlistColors, só lido uma vez por sessão.
async function loadCutlistSheetSizes() {
  if (cutlistSheetSizesCache.length) return;
  const { data, error } = await supabaseClient
    .from('cutting_list_sheet_sizes')
    .select('id, name, width_mm, height_mm, kerf_mm')
    .eq('active', true)
    .order('sort_order');
  if (error) return;
  cutlistSheetSizesCache = data || [];
}

function initCuttingListTabIfNeeded() {
  if (cutlistInitialized) return;
  cutlistInitialized = true;
  loadCutlistSheetSizes();
  loadCutlistColors().then(() => {
    if (cutlistRows.length === 0) addCutlistRow();
    else renderCutlistTable();
  });
}

function newCutlistRow() {
  return {
    _id: cutlistRowSeq++,
    op: '',
    part_name: '',
    quantity: 1,
    comprimento_mm: '',
    largura_mm: '',
    espessura_mm: 19,
    color_id: cutlistColorsCache[0] ? cutlistColorsCache[0].id : null,
    edge_banding: 0,
    obs: ''
  };
}

function addCutlistRow(overrides) {
  cutlistRows.push(Object.assign(newCutlistRow(), overrides || {}));
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function removeCutlistRow(rowId) {
  cutlistRows = cutlistRows.filter((r) => r._id !== rowId);
  cutlistCheckedIds.delete(rowId);
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function clearCutlistRows() {
  cutlistRows = [];
  cutlistCheckedIds.clear();
  cutlistValidationAttempted = false;
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function hideCutlistFinalPrice() {
  cutlistFinalPrice = null;
  const priceRow = document.getElementById('po-cutlist-final-price-row');
  const saveBtn = document.getElementById('po-cutlist-save-btn');
  const approveBtn = document.getElementById('po-cutlist-approve-save-btn');
  if (priceRow) priceRow.style.display = 'none';
  if (saveBtn) saveBtn.style.display = 'none';
  if (approveBtn) approveBtn.style.display = 'none';
  // Plano de corte (migration 063) fica desatualizado com qualquer mudança
  // de linha, igual ao preço — some junto (função declarada mais abaixo no
  // arquivo, mas function declaration é hoisted).
  hideCutlistPlanResults();
}

// Regra do usuário: peça com o menor lado (comprimento OU largura) abaixo
// de 100mm não pode laminar os 4 lados — só 0 ou 2 (2 comprimentos).
function isCutlistEdge4Blocked(row) {
  const c = Number(row.comprimento_mm);
  const w = Number(row.largura_mm);
  if (!isFinite(c) || !isFinite(w) || c <= 0 || w <= 0) return false;
  return Math.min(c, w) < 100;
}

// Lista os problemas específicos de UMA linha (pedido do usuário 2026-07-29:
// "a mensagem nao esta clara do que esta faltando pra gerar o preco") — o
// aviso genérico antigo dizia "corrija as linhas destacadas em vermelho",
// mas NENHUM código de verdade destacava nada de vermelho (renderCutlistTable
// nunca aplicava essa classe em lugar nenhum), então a mensagem prometia algo
// que não existia e não dizia qual linha/campo estava errado. Agora cada
// problema vira um item nomeado (usado tanto pra montar a mensagem detalhada
// quanto pra aplicar a borda vermelha de verdade no campo certo).
function getCutlistRowIssues(row) {
  const issues = [];
  const edge = Number(row.edge_banding);
  const comprimento = Number(row.comprimento_mm);
  const largura = Number(row.largura_mm);
  if (!row.part_name || !row.part_name.trim()) issues.push('part_name');
  if (!(Number(row.quantity) > 0)) issues.push('quantity');
  if (!(comprimento >= CUTLIST_COMPRIMENTO_MIN && comprimento <= CUTLIST_COMPRIMENTO_MAX)) issues.push('comprimento');
  if (!(largura >= CUTLIST_LARGURA_MIN && largura <= CUTLIST_LARGURA_MAX)) issues.push('largura');
  if (!(Number(row.espessura_mm) === 19 || Number(row.espessura_mm) === 38)) issues.push('espessura');
  if (!row.color_id) issues.push('color');
  if (![0, 2, 4].includes(edge)) issues.push('edge');
  else if (edge === 4 && isCutlistEdge4Blocked(row)) issues.push('edge4blocked');
  return issues;
}

function validateCutlistRows() {
  return cutlistRows.length > 0 && cutlistRows.every((row) => getCutlistRowIssues(row).length === 0);
}

// Só passa a destacar campos em vermelho DEPOIS da 1ª tentativa de "Gerar
// Preço" que falhou (senão toda linha nova, com comprimento/largura ainda
// vazios por padrão, já nasceria vermelha sem o usuário ter feito nada —
// ruim). Uma vez true, fica true (feedback ao vivo conforme corrige cada
// campo) — resetado só em "Limpar tudo" (começa do zero de verdade).
let cutlistValidationAttempted = false;

// 1 seletor DOM por tipo de problema — 'edge' e 'edge4blocked' apontam pro
// MESMO campo (só existe 1 seletor de fita por linha), daí o Set na função
// abaixo pra não tentar limpar/marcar o mesmo elemento 2x de forma conflitante.
const CUTLIST_FIELD_SELECTOR_BY_ISSUE = {
  part_name: '.cl-part-name',
  quantity: '.cl-quantity',
  comprimento: '.cl-comprimento',
  largura: '.cl-largura',
  espessura: '.cl-espessura',
  color: '.cl-color-btn',
  edge: '.cl-edge',
  edge4blocked: '.cl-edge'
};

// Aplica/remove a borda vermelha nos campos de UMA linha já renderizada, sem
// precisar re-renderizar a linha inteira inteira (evita perder o foco/cursor
// de quem ainda está digitando) — chamada tanto na criação da linha quanto
// em cada listener de campo, quando cutlistValidationAttempted é true.
function refreshCutlistRowHighlight(tr, row) {
  if (!cutlistValidationAttempted) return;
  const issues = getCutlistRowIssues(row);
  const invalidSelectors = new Set(issues.map((k) => CUTLIST_FIELD_SELECTOR_BY_ISSUE[k]).filter(Boolean));
  Array.from(new Set(Object.values(CUTLIST_FIELD_SELECTOR_BY_ISSUE))).forEach((sel) => {
    const el = tr.querySelector(sel);
    if (el) el.classList.toggle('cl-field-invalid', invalidSelectors.has(sel));
  });
}

// Mini ícone ao lado do seletor de Fita de Borda (pedido do usuário
// 2026-07-20: tirou o diagrama grande do lado e pediu pra mostrar a fita
// "conforme a pessoa escolhe do lado do seletor", sem aumentar a altura da
// barra — por isso é pequeno e cabe dentro da altura do <select>). Lados em
// laranja = onde entra a fita, conforme o valor escolhido (0/2/4). "2" segue
// a mesma peça landscape do resto da tela: os 2 lados do comprimento = topo
// e base do retângulo.
function cutlistEdgeIconSvg(edgeValue) {
  const e = Number(edgeValue);
  const top = e === 2 || e === 4;
  const bottom = e === 2 || e === 4;
  const left = e === 4;
  const right = e === 4;
  const active = '#ff7a3d';
  const base = '#c9ab84';
  const sw = (on) => on ? 3 : 1.5;
  return `<svg width="30" height="20" viewBox="0 0 30 20" style="vertical-align:middle; flex:none;">
    <rect x="3" y="3" width="24" height="14" fill="#e6c69c"/>
    <line x1="3" y1="3" x2="27" y2="3" stroke="${top ? active : base}" stroke-width="${sw(top)}"/>
    <line x1="3" y1="17" x2="27" y2="17" stroke="${bottom ? active : base}" stroke-width="${sw(bottom)}"/>
    <line x1="3" y1="3" x2="3" y2="17" stroke="${left ? active : base}" stroke-width="${sw(left)}"/>
    <line x1="27" y1="3" x2="27" y2="17" stroke="${right ? active : base}" stroke-width="${sw(right)}"/>
  </svg>`;
}

// Popup de cor do Plano de Corte — FOLLOW-UP 2026-07-29: a 1ª versão usava
// renderSwatches() (grade de quadradinhos, nome só em tooltip) dentro de um
// <div> filho da própria célula da tabela; usuário reportou 2 problemas: (1)
// "quando clico nao vejo nome" — queria o nome sempre visível, em LISTA
// vertical (como o <select> nativo antigo), não uma grade com nome só no
// hover; (2) "a tela nao expande pra fora, fica oculta" — a célula fica
// dentro de #po-cutlist-table-wrap, que tem overflow-x:auto (isso também
// força overflow-y:auto por regra do CSS), então o popup posicionado como
// filho da célula era CORTADO por esse wrapper. Fix: popup único (singleton),
// anexado direto no <body> com position:fixed (fora da hierarquia do
// wrapper — não sofre clipping de overflow nenhum), reposicionado via
// getBoundingClientRect() do botão clicado a cada abertura, e conteúdo é uma
// lista vertical (não grade) com o quadradinho + NOME em texto normal por
// linha (renderCutlistColorPopupList, não renderSwatches).
let cutlistColorPopupEl = null; // singleton, criado sob demanda
let cutlistColorPopupRowId = null; // row._id do popup aberto agora, null = fechado

function getCutlistColorPopupEl() {
  if (cutlistColorPopupEl) return cutlistColorPopupEl;
  const el = document.createElement('div');
  el.id = 'po-cutlist-color-popup';
  el.className = 'cl-color-popup-fixed';
  el.style.display = 'none';
  // Campo de busca fixo no topo (pedido do usuário 2026-07-31: "quero poder
  // digitar as primeiras letras e puxar as cores conforme escrevo") + wrap
  // separado que rola por baixo dele — diferente de antes (o popup inteiro
  // rolava), pra o campo de busca nunca sumir de vista rolando a lista.
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'cl-color-search-input';
  searchInput.placeholder = I18n.t('cutlist.color_search_placeholder');
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    const all = el._allItems || [];
    const filtered = q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
    renderCutlistColorPopupList(el._listWrap, filtered, el._selectedId, el._onSelect);
  });
  // Digitar não pode deixar o Tab/setas vazarem pra trás da linha da
  // tabela nem fechar o popup sem querer.
  searchInput.addEventListener('keydown', (e) => e.stopPropagation());
  const listWrap = document.createElement('div');
  listWrap.className = 'cl-color-list-wrap';
  el.appendChild(searchInput);
  el.appendChild(listWrap);
  el._searchInput = searchInput;
  el._listWrap = listWrap;
  document.body.appendChild(el);
  // Clique fora fecha — mas ignora o próprio clique que ABRIU o popup (o
  // listener do botão já rodou e setou cutlistColorPopupRowId antes deste
  // aqui rodar, na fase de bubble; sem esse "closest" ele fecharia na hora).
  document.addEventListener('click', (e) => {
    if (cutlistColorPopupRowId === null) return;
    if (el.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.cl-color-btn')) return;
    closeCutlistColorPopup();
  });
  // BUG CORRIGIDO 2026-07-31: antes fechava em QUALQUER scroll da página —
  // inclusive rolando a lista de DENTRO do próprio popup, porque 'scroll'
  // não faz bubble mas o listener em fase de captura (true) no window
  // intercepta mesmo assim. Agora só fecha se a rolagem não teve origem
  // dentro do popup.
  window.addEventListener('scroll', (e) => {
    if (el.contains(e.target)) return;
    closeCutlistColorPopup();
  }, true);
  cutlistColorPopupEl = el;
  return el;
}

function closeCutlistColorPopup() {
  if (!cutlistColorPopupEl) return;
  cutlistColorPopupEl.style.display = 'none';
  cutlistColorPopupEl._listWrap.innerHTML = '';
  cutlistColorPopupEl._searchInput.value = '';
  cutlistColorPopupRowId = null;
}

// Lista vertical (ícone + nome em texto, sempre visível) — diferente de
// renderSwatches (grade de ícones, nome só em title/tooltip), a pedido
// explícito do usuário só pra esta tela ("quero em lista como antes").
function renderCutlistColorPopupList(container, items, selectedId, onSelect) {
  container.innerHTML = '';
  items.forEach((c) => {
    const row = document.createElement('div');
    row.className = 'cl-color-list-item' + (c.id === selectedId ? ' selected' : '');
    const dotStyle = c.texture_url
      ? `background-image:url('${c.texture_url}'); background-size:cover; background-position:center;`
      : `background-color:${c.swatch_hex || '#cccccc'};`;
    row.innerHTML = `<span class="cl-color-dot" style="${dotStyle}"></span><span class="cl-color-list-name">${c.name}</span>`;
    row.addEventListener('click', () => onSelect(c.id));
    container.appendChild(row);
  });
}

function toggleCutlistColorPicker(row, btnEl) {
  const popup = getCutlistColorPopupEl();
  if (cutlistColorPopupRowId === row._id) {
    closeCutlistColorPopup();
    return;
  }
  cutlistColorPopupRowId = row._id;
  const rect = btnEl.getBoundingClientRect();
  popup.style.left = `${Math.round(rect.left)}px`;
  popup.style.top = `${Math.round(rect.bottom + 4)}px`;
  popup.style.display = 'block';
  popup._allItems = cutlistColorsCache;
  popup._selectedId = row.color_id;
  popup._onSelect = (colorId) => {
    row.color_id = colorId;
    hideCutlistFinalPrice();
    closeCutlistColorPopup();
    renderCutlistTable();
  };
  renderCutlistColorPopupList(popup._listWrap, cutlistColorsCache, row.color_id, popup._onSelect);
  popup._searchInput.focus();
}

// Mesmo popup de cor, mas o "onSelect" aplica em TODAS as linhas marcadas de
// uma vez (ver renderCutlistBulkToolbar) em vez de uma linha só.
function toggleCutlistBulkColorPicker(btnEl) {
  const popup = getCutlistColorPopupEl();
  if (cutlistColorPopupRowId === CUTLIST_BULK_COLOR_POPUP_ID) {
    closeCutlistColorPopup();
    return;
  }
  cutlistColorPopupRowId = CUTLIST_BULK_COLOR_POPUP_ID;
  const rect = btnEl.getBoundingClientRect();
  popup.style.left = `${Math.round(rect.left)}px`;
  popup.style.top = `${Math.round(rect.bottom + 4)}px`;
  popup.style.display = 'block';
  popup._allItems = cutlistColorsCache;
  popup._selectedId = null;
  popup._onSelect = (colorId) => {
    applyCutlistBulk('color_id', colorId);
    closeCutlistColorPopup();
  };
  renderCutlistColorPopupList(popup._listWrap, cutlistColorsCache, null, popup._onSelect);
  popup._searchInput.focus();
}

// Barra "Aplicar em massa" (pedido do usuário 2026-07-31: "quero um quadrado
// pra selecionar e fazer uma troca de todos selecionados, pode ser tickness,
// pode ser a cor, pode ser a edgband") — montada via JS (não HTML estático)
// pra poder usar I18n.t() nos textos, mesmo padrão do resto da tela. Chamada
// de dentro de renderCutlistTable() a cada render pra manter a contagem de
// selecionadas em dia.
function renderCutlistBulkToolbar() {
  const wrap = document.getElementById('po-cutlist-bulk-toolbar');
  if (!wrap) return;
  const n = cutlistCheckedIds.size;
  // Todo <select>/<button> aqui dentro precisa de margin-top:0 (o `button`
  // global tem margin-top:14px — sem zerar, os botões "Aplicar..." ficavam
  // mais baixos que os <select> ao lado, mesmo com align-items:center no
  // wrap; pedido do usuário 2026-07-31 "alinha melhor"). Regra .cl-bulk-field
  // em css/style.css cobre isso pra todo filho direto, então os inputs
  // abaixo não precisam repetir o style inline.
  wrap.innerHTML = `
    <span class="hint" style="margin:0; font-weight:600;">${I18n.t('cutlist.bulk_selected_count', { n })}</span>
    <input type="text" id="po-cutlist-bulk-op" class="po-project-input cl-bulk-field" style="width:90px;" placeholder="${I18n.t('cutlist.col_op')}" />
    <button type="button" class="secondary cl-bulk-field" id="po-cutlist-bulk-op-btn">${I18n.t('cutlist.bulk_apply_op_btn')}</button>
    <select id="po-cutlist-bulk-espessura" class="po-project-input cl-bulk-field" style="width:100px;">
      <option value="19">19mm</option>
      <option value="38">38mm</option>
    </select>
    <button type="button" class="secondary cl-bulk-field" id="po-cutlist-bulk-espessura-btn">${I18n.t('cutlist.bulk_apply_thickness_btn')}</button>
    <button type="button" class="secondary cl-color-btn cl-bulk-field" id="po-cutlist-bulk-color-btn">
      <span class="cl-color-label">${I18n.t('cutlist.bulk_apply_color_btn')}</span>
    </button>
    <select id="po-cutlist-bulk-edge" class="po-project-input cl-bulk-field" style="width:170px;">
      <option value="0">${I18n.t('cutlist.edge_0')}</option>
      <option value="2">${I18n.t('cutlist.edge_2')}</option>
      <option value="4">${I18n.t('cutlist.edge_4')}</option>
    </select>
    <button type="button" class="secondary cl-bulk-field" id="po-cutlist-bulk-edge-btn">${I18n.t('cutlist.bulk_apply_edge_btn')}</button>
  `;
  wrap.querySelector('#po-cutlist-bulk-op-btn').addEventListener('click', () => {
    applyCutlistBulk('op', document.getElementById('po-cutlist-bulk-op').value);
  });
  wrap.querySelector('#po-cutlist-bulk-espessura-btn').addEventListener('click', () => {
    applyCutlistBulk('espessura_mm', Number(document.getElementById('po-cutlist-bulk-espessura').value));
  });
  wrap.querySelector('#po-cutlist-bulk-color-btn').addEventListener('click', (e) => toggleCutlistBulkColorPicker(e.currentTarget));
  wrap.querySelector('#po-cutlist-bulk-edge-btn').addEventListener('click', () => {
    applyCutlistBulk('edge_banding', Number(document.getElementById('po-cutlist-bulk-edge').value));
  });
}

// field = 'op' | 'espessura_mm' | 'color_id' | 'edge_banding'. Aplica só nas
// linhas marcadas (cutlistCheckedIds). Fita "4 lados" respeita a mesma trava
// por linha do dropdown individual (peça com lado < 100mm não pode) — pula
// essas silenciosamente em vez de forçar um estado inválido.
function applyCutlistBulk(field, value) {
  if (cutlistCheckedIds.size === 0) {
    alert(I18n.t('cutlist.bulk_none_selected'));
    return;
  }
  cutlistRows.forEach((row) => {
    if (!cutlistCheckedIds.has(row._id)) return;
    if (field === 'edge_banding' && value === 4 && isCutlistEdge4Blocked(row)) return;
    row[field] = value;
  });
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function renderCutlistTable() {
  const tbody = document.getElementById('po-cutlist-tbody');
  if (!tbody) return;
  renderCutlistBulkToolbar();
  const selectAllEl = document.getElementById('po-cutlist-select-all');
  if (selectAllEl) {
    selectAllEl.checked = cutlistRows.length > 0 && cutlistRows.every((r) => cutlistCheckedIds.has(r._id));
    if (selectAllEl.dataset.cutlistSelectAllAttached !== '1') {
      selectAllEl.dataset.cutlistSelectAllAttached = '1';
      selectAllEl.addEventListener('change', () => {
        if (selectAllEl.checked) cutlistRows.forEach((r) => cutlistCheckedIds.add(r._id));
        else cutlistCheckedIds.clear();
        renderCutlistTable();
      });
    }
  }
  tbody.innerHTML = '';
  cutlistRows.forEach((row) => {
    const tr = document.createElement('tr');
    const edge4Blocked = isCutlistEdge4Blocked(row);
    // Quadrado de cor (pedido do usuário 2026-07-29: "quadrado pequeno do
    // lado mostrando a cor, tanto no dropdown quanto na linha das
    // informacoes") — <select>/<option> nativos não aceitam HTML dentro
    // (limite do próprio navegador), então trocado por botão+popup, mesmo
    // padrão já usado em .po-order-item-color-btn/-picker (order-detail),
    // reaproveitando renderSwatches() pro painel. O quadrado no BOTÃO (fechado)
    // já cobre "na linha das informacoes"; os quadrados dentro do popup
    // cobrem "no dropdown".
    const selectedColor = cutlistColorsCache.find((c) => c.id === row.color_id) || null;
    const colorDotStyle = selectedColor && selectedColor.texture_url
      ? `background-image:url('${selectedColor.texture_url}'); background-size:cover; background-position:center;`
      : `background-color:${(selectedColor && selectedColor.swatch_hex) || '#cccccc'};`;
    tr.innerHTML = `
      <td><input type="checkbox" class="cl-row-check" ${cutlistCheckedIds.has(row._id) ? 'checked' : ''} /></td>
      <td><input type="text" class="po-project-input cl-op" style="width:64px;" value="${row.op || ''}" /></td>
      <td><input type="text" class="po-project-input cl-part-name" style="width:140px;" value="${row.part_name || ''}" /></td>
      <td><input type="number" min="1" step="1" class="po-project-input cl-quantity" style="width:56px;" value="${row.quantity}" /></td>
      <td><input type="number" min="${CUTLIST_COMPRIMENTO_MIN}" max="${CUTLIST_COMPRIMENTO_MAX}" step="1" class="po-project-input cl-comprimento" style="width:90px;" value="${row.comprimento_mm}" /></td>
      <td><input type="number" min="${CUTLIST_LARGURA_MIN}" max="${CUTLIST_LARGURA_MAX}" step="1" class="po-project-input cl-largura" style="width:90px;" value="${row.largura_mm}" /></td>
      <td>
        <select class="po-project-input cl-espessura" style="width:78px;">
          <option value="19" ${Number(row.espessura_mm) === 19 ? 'selected' : ''}>19mm</option>
          <option value="38" ${Number(row.espessura_mm) === 38 ? 'selected' : ''}>38mm</option>
        </select>
      </td>
      <td class="cl-color-cell">
        <button type="button" class="cl-color-btn">
          <span class="cl-color-dot" style="${colorDotStyle}"></span>
          <span class="cl-color-label">${selectedColor ? selectedColor.name : ''}</span>
        </button>
      </td>
      <td style="display:flex; align-items:center; gap:6px;">
        <select class="po-project-input cl-edge" style="width:170px; margin-top:0;">
          <option value="0" ${Number(row.edge_banding) === 0 ? 'selected' : ''}>${I18n.t('cutlist.edge_0')}</option>
          <option value="2" ${Number(row.edge_banding) === 2 ? 'selected' : ''}>${I18n.t('cutlist.edge_2')}</option>
          <option value="4" ${Number(row.edge_banding) === 4 ? 'selected' : ''} ${edge4Blocked ? `disabled title="${I18n.t('cutlist.edge_4_blocked_title')}"` : ''}>${I18n.t('cutlist.edge_4')}</option>
        </select>
        <span class="cl-edge-icon">${cutlistEdgeIconSvg(row.edge_banding)}</span>
      </td>
      <td><input type="text" class="po-project-input cl-obs" style="width:120px;" value="${row.obs || ''}" /></td>
      <td><button type="button" class="secondary cl-remove-btn" style="margin-top:0; padding:4px 8px;">✕</button></td>
    `;
    tbody.appendChild(tr);

    // Destaque de vermelho de verdade nos campos com problema — só depois de
    // uma tentativa de "Gerar Preço" já ter falhado (cutlistValidationAttempted).
    // Ver getCutlistRowIssues/mensagem detalhada no handler do botão.
    refreshCutlistRowHighlight(tr, row);

    tr.querySelector('.cl-row-check').addEventListener('change', (e) => {
      if (e.target.checked) cutlistCheckedIds.add(row._id);
      else cutlistCheckedIds.delete(row._id);
      renderCutlistTable();
    });
    tr.querySelector('.cl-op').addEventListener('input', (e) => { row.op = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-part-name').addEventListener('input', (e) => { row.part_name = e.target.value; hideCutlistFinalPrice(); refreshCutlistRowHighlight(tr, row); });
    tr.querySelector('.cl-quantity').addEventListener('input', (e) => { row.quantity = e.target.value; hideCutlistFinalPrice(); refreshCutlistRowHighlight(tr, row); });
    tr.querySelector('.cl-obs').addEventListener('input', (e) => { row.obs = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-color-btn').addEventListener('click', (e) => toggleCutlistColorPicker(row, e.currentTarget));
    tr.querySelector('.cl-espessura').addEventListener('change', (e) => { row.espessura_mm = Number(e.target.value); hideCutlistFinalPrice(); refreshCutlistRowHighlight(tr, row); });
    tr.querySelector('.cl-edge').addEventListener('change', (e) => {
      row.edge_banding = Number(e.target.value);
      hideCutlistFinalPrice();
      const iconEl = tr.querySelector('.cl-edge-icon');
      if (iconEl) iconEl.innerHTML = cutlistEdgeIconSvg(row.edge_banding);
      refreshCutlistRowHighlight(tr, row);
    });
    // Comprimento/largura re-renderizam a linha (no blur) pra recalcular se
    // a opção "4 lados" deve ficar bloqueada (regra dos 100mm).
    tr.querySelector('.cl-comprimento').addEventListener('input', (e) => { row.comprimento_mm = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-comprimento').addEventListener('change', () => renderCutlistTable());
    tr.querySelector('.cl-largura').addEventListener('input', (e) => { row.largura_mm = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-largura').addEventListener('change', () => renderCutlistTable());
    tr.querySelector('.cl-remove-btn').addEventListener('click', () => removeCutlistRow(row._id));

    // Pedido do usuário 2026-07-31: "cada tab leve pra proxima caixa" — Tab
    // pra frente pula direto pra próxima caixa de digitação da linha, na
    // ORDEM VISUAL (OP → Peça → Qtd → Comprimento → Largura → Espessura →
    // Cor → Fita → Obs), pulando o checkbox de seleção e o botão ✕ (não são
    // "caixas" de preencher). No fim da linha, vai pro OP da PRÓXIMA linha;
    // no Obs da ÚLTIMA linha, cria uma linha nova e vai pro OP dela (regra
    // que já existia desde 2026-07-20, agora generalizada pra linha inteira
    // em vez de só o último campo). Delegado num único listener no <tr> em
    // vez de um por campo.
    tr.addEventListener('keydown', (e) => handleCutlistFieldTab(e, row));
  });
}

// Sequência de "caixas" de digitação por linha, na mesma ordem visual das
// colunas da tabela — ver handleCutlistFieldTab.
const CUTLIST_TAB_FIELDS = ['cl-op', 'cl-part-name', 'cl-quantity', 'cl-comprimento', 'cl-largura', 'cl-espessura', 'cl-color-btn', 'cl-edge', 'cl-obs'];

// Foca uma caixa específica (por linha + classe do campo) DEPOIS de um
// possível re-render — não guarda referência direta ao <input>/<select>
// porque renderCutlistTable() recria o <tbody> inteiro (destruiria a
// referência antiga).
function focusCutlistField(rowId, fieldClass) {
  const tbody = document.getElementById('po-cutlist-tbody');
  if (!tbody) return;
  const idx = cutlistRows.findIndex((r) => r._id === rowId);
  if (idx === -1) return;
  const tr = tbody.children[idx];
  const el = tr && tr.querySelector(`.${fieldClass}`);
  if (el) el.focus();
}

// Tab pra frente numa das caixas de CUTLIST_TAB_FIELDS: sempre
// preventDefault() (não deixa o navegador decidir sozinho pra onde ir) e
// controla o foco na mão. Motivo de não confiar no Tab nativo: comprimento/
// largura disparam renderCutlistTable() completo no 'change' (recalcula a
// trava de "4 lados" abaixo de 100mm) — se o navegador já tivesse decidido
// mover o foco pro próximo elemento do DOM ANTES desse re-render rodar, o
// elemento-alvo seria destruído no meio do processo e o foco se perderia
// (caía no <body>), quebrando a cadeia de Tabs a partir dali. Por isso aqui
// SEMPRE re-renderiza primeiro (se preciso) e só then foca o campo já
// existente no DOM novo.
function handleCutlistFieldTab(e, row) {
  if (e.key !== 'Tab' || e.shiftKey) return;
  const fieldClass = CUTLIST_TAB_FIELDS.find((cls) => e.target.classList && e.target.classList.contains(cls));
  if (!fieldClass) return; // checkbox/botão ✕: deixa o Tab nativo agir
  e.preventDefault();
  const fieldIdx = CUTLIST_TAB_FIELDS.indexOf(fieldClass);
  if (fieldIdx < CUTLIST_TAB_FIELDS.length - 1) {
    renderCutlistTable();
    focusCutlistField(row._id, CUTLIST_TAB_FIELDS[fieldIdx + 1]);
    return;
  }
  // Última caixa da linha (Obs).
  const rowIdx = cutlistRows.findIndex((r) => r._id === row._id);
  const isLastRow = rowIdx === cutlistRows.length - 1;
  if (isLastRow) {
    addCutlistRow(); // já chama renderCutlistTable() internamente
    const newRow = cutlistRows[cutlistRows.length - 1];
    focusCutlistField(newRow._id, 'cl-op');
    return;
  }
  renderCutlistTable();
  const nextRow = cutlistRows[rowIdx + 1];
  focusCutlistField(nextRow._id, 'cl-op');
}

// Mesma matemática de custo já usada em pricing.js (area_m2 x
// sheet_price_per_m2, edge_band_m x edge_price_per_linear_m), só que por
// linha digitada em vez de por peça de módulo. "2 comprimentos" = fita só
// nos 2 lados do comprimento; "4 lados" = perímetro inteiro. Multiplicador
// de espessura e mão de obra por peça são específicos do plano de corte
// (migration 051); margem especial é aplicada UMA VEZ no total geral (mesmo
// espírito do markup_multiplier da migration 037 — nunca componível).
function computeCutlistTotal() {
  let grandTotal = 0;
  cutlistRows.forEach((row) => {
    const color = cutlistColorsCache.find((c) => c.id === row.color_id);
    if (!color) { row._unit_price = 0; row._total_price = 0; return; }
    const qty = Number(row.quantity) || 0;
    const comprimentoM = Number(row.comprimento_mm) / 1000;
    const larguraM = Number(row.largura_mm) / 1000;
    const areaM2 = comprimentoM * larguraM;
    const edge = Number(row.edge_banding);
    const edgeM = edge === 4 ? 2 * (comprimentoM + larguraM) : edge === 2 ? 2 * comprimentoM : 0;
    const thicknessMultiplier = Number(row.espessura_mm) === 38 ? cutlistPricingSettings.cutting_list_thickness_38_multiplier : 1;
    const sheetCost = areaM2 * Number(color.sheet_price_per_m2 || 0) * thicknessMultiplier;
    const edgeCost = edgeM * Number(color.edge_price_per_linear_m || 0);
    const laborCost = cutlistPricingSettings.cutting_list_labor_price_per_piece;
    const unitPrice = sheetCost + edgeCost + laborCost;
    row._unit_price = unitPrice;
    row._total_price = unitPrice * qty;
    grandTotal += row._total_price;
  });
  return grandTotal * cutlistPricingSettings.cutting_list_markup_multiplier;
}

// ---------- Plano de Corte / Nesting (migration 063) ----------
// Pedido do usuário 2026-07-31: botão "Gerar Plano de Corte" que encaixa as
// peças chapa a chapa (like a cutting-diagram estimator) e mostra quantas
// chapas + quantos metros de fita de borda são necessários. Tamanho de
// chapa vem da cor (colors.default_sheet_size_id) quando cadastrado; cor
// sem tamanho vinculado ("especial") faz o Contractor escolher na hora
// entre os tamanhos ativos (cutlistSheetSizesCache).
//
// Igual ao resto da aba Plano de Corte, isso é uma ESTIMATIVA rápida pro
// Contractor planejar compra/produção — não um desenho de corte de
// produção exato (não considera veio da madeira, porque a planilha nunca
// coletou essa informação por peça).

function escapeHtmlCutlist(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// MaxRects Best-Area-Fit com rotação de 90° livre (sem dado de veio pra
// travar orientação — ver comentário acima). kerf é reservado como margem
// extra à direita/abaixo de cada peça colocada (aproximação padrão desse
// tipo de calculadora rápida, mesmo espírito de "estimativa" já usado no
// resto da aba).
function packSheetsMaxRects(pieces, sheetW, sheetH, kerf) {
  function rectContains(outer, inner) {
    return inner.x >= outer.x - 1e-6 && inner.y >= outer.y - 1e-6 &&
      inner.x + inner.w <= outer.x + outer.w + 1e-6 && inner.y + inner.h <= outer.y + outer.h + 1e-6;
  }
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;
  }
  function pruneFreeRects(freeRects) {
    for (let i = freeRects.length - 1; i >= 0; i--) {
      for (let j = 0; j < freeRects.length; j++) {
        if (i === j) continue;
        if (rectContains(freeRects[j], freeRects[i])) { freeRects.splice(i, 1); break; }
      }
    }
  }
  function splitFreeRect(freeRect, placedRect, outList) {
    if (!rectsOverlap(freeRect, placedRect)) { outList.push(freeRect); return; }
    if (placedRect.x > freeRect.x) outList.push({ x: freeRect.x, y: freeRect.y, w: placedRect.x - freeRect.x, h: freeRect.h });
    if (placedRect.x + placedRect.w < freeRect.x + freeRect.w) outList.push({ x: placedRect.x + placedRect.w, y: freeRect.y, w: (freeRect.x + freeRect.w) - (placedRect.x + placedRect.w), h: freeRect.h });
    if (placedRect.y > freeRect.y) outList.push({ x: freeRect.x, y: freeRect.y, w: freeRect.w, h: placedRect.y - freeRect.y });
    if (placedRect.y + placedRect.h < freeRect.y + freeRect.h) outList.push({ x: freeRect.x, y: placedRect.y + placedRect.h, w: freeRect.w, h: (freeRect.y + freeRect.h) - (placedRect.y + placedRect.h) });
  }
  function newSheet() {
    return { width: sheetW, height: sheetH, placed: [], freeRects: [{ x: 0, y: 0, w: sheetW, h: sheetH }] };
  }
  function placeInSheet(sheet, piece) {
    const candidates = [{ w: piece.w, h: piece.h, rotated: false }];
    if (piece.w !== piece.h) candidates.push({ w: piece.h, h: piece.w, rotated: true });
    let best = null;
    sheet.freeRects.forEach((freeRect) => {
      candidates.forEach((cand) => {
        const pw = cand.w + kerf;
        const ph = cand.h + kerf;
        if (pw > freeRect.w + 1e-6 || ph > freeRect.h + 1e-6) return;
        const leftoverArea = freeRect.w * freeRect.h - pw * ph;
        const leftoverSide = Math.min(freeRect.w - pw, freeRect.h - ph);
        if (!best || leftoverArea < best.leftoverArea - 1e-6 ||
            (Math.abs(leftoverArea - best.leftoverArea) < 1e-6 && leftoverSide < best.leftoverSide)) {
          best = { freeRect, cand, leftoverArea, leftoverSide };
        }
      });
    });
    if (!best) return false;
    const footprint = { x: best.freeRect.x, y: best.freeRect.y, w: best.cand.w + kerf, h: best.cand.h + kerf };
    sheet.placed.push({ x: best.freeRect.x, y: best.freeRect.y, w: best.cand.w, h: best.cand.h, rotated: best.cand.rotated, label: piece.label, id: piece.id });
    const newFreeRects = [];
    sheet.freeRects.forEach((fr) => splitFreeRect(fr, footprint, newFreeRects));
    pruneFreeRects(newFreeRects);
    sheet.freeRects = newFreeRects.filter((r) => r.w > 0.5 && r.h > 0.5);
    return true;
  }

  const remaining = pieces.slice().sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || (b.w * b.h) - (a.w * a.h));
  const sheets = [];
  let current = newSheet();
  sheets.push(current);
  remaining.forEach((piece) => {
    if (!placeInSheet(current, piece)) {
      current = newSheet();
      sheets.push(current);
      if (!placeInSheet(current, piece)) {
        // Não deveria acontecer — cutlistFitsSheetSize já filtra peça maior
        // que a chapa antes de chegar aqui. Marca como overflow em vez de
        // travar a geração inteira do plano.
        current.placed.push({ x: 0, y: 0, w: Math.min(piece.w, sheetW), h: Math.min(piece.h, sheetH), rotated: false, label: piece.label, id: piece.id, overflow: true });
      }
    }
  });
  return sheets;
}

// Verifica se a peça cabe na chapa em QUALQUER orientação — usado antes de
// rodar o nesting pra avisar o Contractor em vez de gerar um plano com peça
// cortada errado.
function cutlistPieceFitsSheet(w, h, sheetW, sheetH) {
  return (w <= sheetW && h <= sheetH) || (h <= sheetW && w <= sheetH);
}

// Agrupa as linhas por cor+espessura (uma chapa é sempre de UM material —
// não dá pra misturar cor/espessura na mesma chapa) e já soma os metros de
// fita de borda de cada grupo (mesma fórmula de computeCutlistTotal).
function groupCutlistRowsForPlan() {
  const groups = new Map();
  cutlistRows.forEach((row) => {
    const color = cutlistColorsCache.find((c) => c.id === row.color_id);
    if (!color) return;
    const qty = Math.max(0, Math.round(Number(row.quantity)) || 0);
    const w = Number(row.comprimento_mm);
    const h = Number(row.largura_mm);
    if (qty <= 0 || !(w > 0) || !(h > 0)) return;
    const key = `${row.color_id}|${row.espessura_mm}`;
    if (!groups.has(key)) {
      groups.set(key, { key, color, espessura_mm: Number(row.espessura_mm), pieces: [], edgeM: 0, sheetSize: null });
    }
    const g = groups.get(key);
    for (let i = 0; i < qty; i++) {
      g.pieces.push({ id: `${row._id}-${i}`, w, h, label: row.part_name || row.op || '—' });
    }
    const edge = Number(row.edge_banding);
    const comprimentoM = w / 1000;
    const larguraM = h / 1000;
    const edgeM = edge === 4 ? 2 * (comprimentoM + larguraM) : edge === 2 ? 2 * comprimentoM : 0;
    g.edgeM += edgeM * qty;
  });
  return Array.from(groups.values());
}

function hideCutlistPlanResults() {
  const panel = document.getElementById('po-cutlist-plan-picker-panel');
  const results = document.getElementById('po-cutlist-plan-results');
  if (panel) panel.style.display = 'none';
  if (results) results.style.display = 'none';
  cutlistPendingPlanGroups = null;
}

// Ponto de entrada do botão "Gerar Plano de Corte" — já rodou
// validateCutlistRowsWithUI() antes (ver listener do botão). Resolve o
// tamanho de chapa de cada grupo automaticamente (color.default_sheet_size_id);
// se sobrar grupo sem tamanho, mostra o painel de escolha manual em vez de
// gerar direto.
async function startCutlistPlanFlow() {
  hideCutlistPlanResults();
  await loadCutlistSheetSizes();
  const groups = groupCutlistRowsForPlan();
  if (groups.length === 0) return;
  groups.forEach((g) => {
    // STOCK IN HOUSE (migration 064, renomeado de "usa retalhos") — nunca
    // precisa de tamanho de chapa, porque nunca vai rodar nesting nenhum
    // pra esse grupo (só preço, sem chapa nem fita — pedido do usuário
    // 2026-07-31).
    if (g.color.stock_in_house) return;
    if (g.color.default_sheet_size_id) {
      g.sheetSize = cutlistSheetSizesCache.find((s) => s.id === g.color.default_sheet_size_id) || null;
    }
  });
  const needsManual = groups.filter((g) => !g.color.stock_in_house && !g.sheetSize);
  if (needsManual.length > 0) {
    if (cutlistSheetSizesCache.length === 0) {
      const errorEl = document.getElementById('po-cutlist-error');
      errorEl.textContent = I18n.t('cutlist.plan_no_sheet_sizes_error');
      errorEl.style.display = 'block';
      return;
    }
    renderCutlistSheetPickerPanel(groups, needsManual);
    return;
  }
  renderCutlistPlanResults(groups);
}

// Painel inline (mesmo padrão visual da barra de aplicar-em-massa) pra
// escolher manualmente o tamanho de chapa dos grupos sem
// default_sheet_size_id ("cor especial", pedido do usuário 2026-07-31).
function renderCutlistSheetPickerPanel(allGroups, needsManual) {
  cutlistPendingPlanGroups = allGroups;
  const panel = document.getElementById('po-cutlist-plan-picker-panel');
  if (!panel) return;
  const options = cutlistSheetSizesCache.map((s) => `<option value="${s.id}">${escapeHtmlCutlist(s.name)} (${s.width_mm} x ${s.height_mm}mm)</option>`).join('');
  panel.innerHTML = `
    <p class="hint" style="margin:0 0 8px;">${I18n.t('cutlist.plan_choose_size_hint')}</p>
    ${needsManual.map((g) => `
      <div class="row" style="align-items:center; margin-bottom:8px;" data-plan-group-key="${g.key}">
        <div style="flex:0 0 auto; min-width:180px;"><strong>${escapeHtmlCutlist(g.color.name)}</strong> — ${g.espessura_mm}mm</div>
        <div><select class="po-project-input plan-picker-select" data-key="${g.key}">${options}</select></div>
      </div>
    `).join('')}
    <button type="button" class="po-btn-primary-block plan-picker-confirm-btn" style="margin-top:8px;">${I18n.t('cutlist.plan_generate_confirm_btn')}</button>
  `;
  panel.style.display = 'block';
  panel.querySelector('.plan-picker-confirm-btn').addEventListener('click', () => {
    if (!cutlistPendingPlanGroups) return;
    panel.querySelectorAll('.plan-picker-select').forEach((sel) => {
      const g = cutlistPendingPlanGroups.find((gr) => gr.key === sel.dataset.key);
      if (g) g.sheetSize = cutlistSheetSizesCache.find((s) => s.id === sel.value) || null;
    });
    const resolvedGroups = cutlistPendingPlanGroups;
    panel.style.display = 'none';
    cutlistPendingPlanGroups = null;
    renderCutlistPlanResults(resolvedGroups);
  });
}

// Desenha uma chapa como SVG (retângulos + rótulo peça/dimensão), escalado
// pra caber num container de largura fixa — mesmo espírito visual do
// diagrama de referência (chapa com as peças encaixadas e legendadas).
function renderCutlistSheetSVG(sheet) {
  const maxW = 620;
  const scale = maxW / sheet.width;
  const svgW = Math.round(sheet.width * scale);
  const svgH = Math.round(sheet.height * scale);
  const rects = sheet.placed.map((p) => {
    const x = p.x * scale, y = p.y * scale, w = p.w * scale, h = p.h * scale;
    const fill = p.overflow ? '#f5c2c7' : '#bcd9ee';
    const stroke = p.overflow ? '#c0392b' : '#4a6fa5';
    const fontSize = Math.max(8, Math.min(12, Math.min(w, h) / 6));
    const label = escapeHtmlCutlist(p.label);
    const dims = `${Math.round(p.w)} x ${Math.round(p.h)}${p.rotated ? ' ↻' : ''}`;
    const showText = w > 30 && h > 16;
    return `<g>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      ${showText ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 - 5).toFixed(1)}" font-size="${fontSize}" text-anchor="middle" fill="#333">${label}</text>
      <text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + 9).toFixed(1)}" font-size="${fontSize}" text-anchor="middle" fill="#333">${dims}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" style="border:2px solid #333; background:#fff; max-width:100%; display:block; margin:0 auto;">${rects}</svg>`;
}

// Preço de um grupo cor+espessura (mesma matemática de computeCutlistTotal,
// só somada por grupo em vez do pedido inteiro) — usado pelas linhas STOCK
// IN HOUSE do Plano de Corte, que mostram só o preço (sem chapa/fita).
// Depende de computeCutlistTotal() já ter rodado nesta chamada (popula
// row._total_price em cada linha, pré-margem) — ver chamada logo no início
// de renderCutlistPlanResults.
function computeCutlistGroupPrice(colorId, espessuraMm) {
  let subtotal = 0;
  cutlistRows.forEach((row) => {
    if (row.color_id !== colorId || Number(row.espessura_mm) !== espessuraMm) return;
    subtotal += Number(row._total_price) || 0;
  });
  return subtotal * cutlistPricingSettings.cutting_list_markup_multiplier;
}

// Roda o nesting de cada grupo e monta a tela de resultado: resumo (chapas
// por material + total, metros de fita por material + total) e os
// diagramas chapa a chapa. Peça maior que a chapa escolhida entra como
// "overflow" (destacada em vermelho) em vez de travar a geração inteira.
// Grupo de cor STOCK IN HOUSE (migration 064, renomeado de "usa retalhos")
// pula o nesting inteiro E não mostra fita — só o preço do grupo (pedido do
// usuário 2026-07-31), não entra em grandTotalSheets nem grandTotalEdgeM.
function renderCutlistPlanResults(groups) {
  const results = document.getElementById('po-cutlist-plan-results');
  if (!results) return;
  computeCutlistTotal(); // popula row._total_price em cutlistRows — usado por computeCutlistGroupPrice
  const oversizeWarnings = [];
  let grandTotalSheets = 0;
  let grandTotalEdgeM = 0;
  let grandTotalStockPrice = 0;

  const summaryRows = [];
  const sheetsHtml = [];

  groups.forEach((g) => {
    // STOCK IN HOUSE — sem nesting/contagem de chapa e sem metro de fita,
    // só a lista de peças (agrupada por peça+medida, senão viraria uma
    // linha por unidade) e o preço do grupo.
    if (g.color.stock_in_house) {
      const groupPrice = computeCutlistGroupPrice(g.color.id, g.espessura_mm);
      grandTotalStockPrice += groupPrice;
      const pieceCounts = new Map();
      g.pieces.forEach((p) => {
        const key = `${p.label}|${p.w}|${p.h}`;
        if (!pieceCounts.has(key)) pieceCounts.set(key, { label: p.label, w: p.w, h: p.h, qty: 0 });
        pieceCounts.get(key).qty += 1;
      });
      summaryRows.push(`
        <tr>
          <td>${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm</td>
          <td>${I18n.t('cutlist.plan_stock_label')}</td>
          <td>—</td>
          <td>—</td>
          <td>${formatMoney(groupPrice)}</td>
        </tr>
      `);
      sheetsHtml.push(`<h3 style="margin-top:22px;">${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm · ${I18n.t('cutlist.plan_stock_label')}</h3>`);
      sheetsHtml.push(`
        <table>
          <thead><tr>
            <th>${I18n.t('cutlist.col_part_name')}</th>
            <th>${I18n.t('cutlist.col_length')}</th>
            <th>${I18n.t('cutlist.col_width')}</th>
            <th>${I18n.t('cutlist.col_quantity')}</th>
          </tr></thead>
          <tbody>${Array.from(pieceCounts.values()).map((p) => `<tr><td>${escapeHtmlCutlist(p.label)}</td><td>${Math.round(p.w)}</td><td>${Math.round(p.h)}</td><td>${p.qty}</td></tr>`).join('')}</tbody>
        </table>
      `);
      return;
    }
    if (!g.sheetSize) return; // defesa — não deveria sobrar grupo sem tamanho aqui
    const oversizePieces = g.pieces.filter((p) => !cutlistPieceFitsSheet(p.w, p.h, g.sheetSize.width_mm, g.sheetSize.height_mm));
    if (oversizePieces.length > 0) {
      oversizeWarnings.push(I18n.t('cutlist.plan_oversize_warning', {
        color: g.color.name, size: `${g.sheetSize.width_mm} x ${g.sheetSize.height_mm}`
      }));
    }
    const sheets = packSheetsMaxRects(g.pieces, g.sheetSize.width_mm, g.sheetSize.height_mm, Number(g.sheetSize.kerf_mm) || 0);
    grandTotalSheets += sheets.length;
    grandTotalEdgeM += g.edgeM;

    summaryRows.push(`
      <tr>
        <td>${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm</td>
        <td>${escapeHtmlCutlist(g.sheetSize.name)} (${g.sheetSize.width_mm} x ${g.sheetSize.height_mm}mm)</td>
        <td>${sheets.length}</td>
        <td>${g.edgeM.toFixed(2)} m</td>
        <td>—</td>
      </tr>
    `);

    sheetsHtml.push(`<h3 style="margin-top:22px;">${escapeHtmlCutlist(g.color.name)} — ${g.espessura_mm}mm · ${escapeHtmlCutlist(g.sheetSize.name)}</h3>`);
    sheets.forEach((sheet, idx) => {
      sheetsHtml.push(`
        <div style="margin:12px 0;">
          <p class="hint" style="margin-bottom:6px;">${I18n.t('cutlist.plan_sheet_label', { n: idx + 1, total: sheets.length })}</p>
          ${renderCutlistSheetSVG(sheet)}
        </div>
      `);
    });
  });

  results.innerHTML = `
    <h3>${I18n.t('cutlist.plan_summary_title')}</h3>
    ${oversizeWarnings.length ? `<p class="error" style="display:block;">${oversizeWarnings.join('<br/>')}</p>` : ''}
    <table>
      <thead><tr>
        <th>${I18n.t('cutlist.plan_col_material')}</th>
        <th>${I18n.t('cutlist.plan_col_sheet_size')}</th>
        <th>${I18n.t('cutlist.plan_col_sheet_count')}</th>
        <th>${I18n.t('cutlist.plan_col_edge_m')}</th>
        <th>${I18n.t('cutlist.plan_col_price')}</th>
      </tr></thead>
      <tbody>${summaryRows.join('')}</tbody>
    </table>
    <p style="margin-top:10px;">
      <strong>${I18n.t('cutlist.plan_total_sheets', { n: grandTotalSheets })}</strong>
      · <strong>${I18n.t('cutlist.plan_total_edge_m', { m: grandTotalEdgeM.toFixed(2) })}</strong>
      ${grandTotalStockPrice > 0 ? ` · <strong>${I18n.t('cutlist.plan_total_stock_price', { v: formatMoney(grandTotalStockPrice) })}</strong>` : ''}
    </p>
    <button type="button" class="secondary" id="po-cutlist-plan-close-btn" style="margin-top:6px;">${I18n.t('cutlist.plan_close_btn')}</button>
    ${sheetsHtml.join('')}
  `;
  results.style.display = 'block';
  const closeBtn = document.getElementById('po-cutlist-plan-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', hideCutlistPlanResults);
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Importação de planilha (.xlsx/.csv/.txt via SheetJS) ----------

function parseCutlistDelimitedText(text) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
  return lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
}

function mapImportedRowsToCutlist(rowsArray) {
  if (!rowsArray || rowsArray.length === 0) return [];
  const firstRow = (rowsArray[0] || []).map((c) => String(c == null ? '' : c).trim().toLowerCase());
  const looksLikeHeader = firstRow.some((c) => ['op', 'peça', 'peca', 'part', 'pieza', 'nome da peça'].includes(c));
  const dataRows = looksLikeHeader ? rowsArray.slice(1) : rowsArray;
  return dataRows
    .filter((r) => (r || []).some((cell) => String(cell == null ? '' : cell).trim() !== ''))
    .map((r) => {
      const [op, partName, quantity, comprimento, largura, espessura, colorName, edgeRaw, obs] = r;
      const thickness = Number(espessura) === 38 ? 38 : 19; // qualquer valor diferente de 38 cai no padrão seguro (19)
      const edge = [0, 2, 4].includes(Number(edgeRaw)) ? Number(edgeRaw) : 0;
      const matchedColor = cutlistColorsCache.find((c) => c.name.trim().toLowerCase() === String(colorName == null ? '' : colorName).trim().toLowerCase());
      return Object.assign(newCutlistRow(), {
        op: op || '',
        part_name: partName || '',
        quantity: Number(quantity) || 1,
        comprimento_mm: Number(comprimento) || '',
        largura_mm: Number(largura) || '',
        espessura_mm: thickness,
        color_id: matchedColor ? matchedColor.id : (cutlistColorsCache[0] ? cutlistColorsCache[0].id : null),
        edge_banding: edge,
        obs: obs || ''
      });
    });
}

async function importCutlistFile(file) {
  const errorEl = document.getElementById('po-cutlist-error');
  const statusEl = document.getElementById('po-cutlist-status');
  errorEl.style.display = 'none';
  try {
    await loadCutlistColors(); // garante o catálogo de cores carregado antes de casar pelo nome
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    let rowsArray;
    if (ext === 'csv' || ext === 'txt') {
      const text = await file.text();
      rowsArray = parseCutlistDelimitedText(text);
    } else {
      if (typeof XLSX === 'undefined') throw new Error('SheetJS não carregou (sem conexão?)');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rowsArray = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
    }
    const imported = mapImportedRowsToCutlist(rowsArray);
    imported.forEach((r) => cutlistRows.push(r));
    hideCutlistFinalPrice();
    renderCutlistTable();
    statusEl.textContent = I18n.t('cutlist.import_success', { n: imported.length });
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  } catch (err) {
    errorEl.textContent = I18n.t('cutlist.import_error', { msg: err.message });
    errorEl.style.display = 'block';
  }
}

// Modelo pra download (pedido do usuário 2026-07-20): mesma ordem de colunas
// do hint acima (cutlist.import_format_hint), cabeçalho traduzido no idioma
// atual + 1 linha de exemplo já preenchida. mapImportedRowsToCutlist
// reconhece o cabeçalho (looksLikeHeader) então funciona no reimport normal.
async function downloadCutlistTemplate() {
  if (typeof XLSX === 'undefined') return;
  await loadCutlistColors(); // garante que a linha de exemplo use uma cor real do catálogo
  const header = [
    I18n.t('cutlist.col_op'),
    I18n.t('cutlist.col_part_name'),
    I18n.t('cutlist.col_quantity'),
    I18n.t('cutlist.col_length'),
    I18n.t('cutlist.col_width'),
    I18n.t('cutlist.col_thickness'),
    I18n.t('cutlist.col_color'),
    I18n.t('cutlist.col_edge'),
    I18n.t('cutlist.col_obs')
  ];
  const exampleColorName = cutlistColorsCache[0] ? cutlistColorsCache[0].name : '';
  const exampleRow = ['OP-001', 'Lateral', 2, 600, 400, 19, exampleColorName, 2, ''];
  const ws = XLSX.utils.aoa_to_sheet([header, exampleRow]);
  ws['!cols'] = [8, 16, 6, 14, 12, 10, 16, 8, 20].map((w) => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plano de Corte');
  XLSX.writeFile(wb, 'modelo-plano-de-corte.xlsx');
}

// ---------- Botões da aba ----------

const cutlistImportBtn = document.getElementById('po-cutlist-import-btn');
const cutlistImportInput = document.getElementById('po-cutlist-import-input');
if (cutlistImportBtn && cutlistImportInput) {
  cutlistImportBtn.addEventListener('click', () => cutlistImportInput.click());
  cutlistImportInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // permite reimportar o mesmo arquivo depois
    if (file) await importCutlistFile(file);
  });
}

const cutlistDownloadTemplateBtn = document.getElementById('po-cutlist-download-template-btn');
if (cutlistDownloadTemplateBtn) cutlistDownloadTemplateBtn.addEventListener('click', () => downloadCutlistTemplate());

const cutlistAddRowBtn = document.getElementById('po-cutlist-add-row-btn');
if (cutlistAddRowBtn) cutlistAddRowBtn.addEventListener('click', () => addCutlistRow());

const cutlistClearBtn = document.getElementById('po-cutlist-clear-btn');
if (cutlistClearBtn) cutlistClearBtn.addEventListener('click', () => clearCutlistRows());

// Extraído do handler de "Gerar Preço" (pedido do usuário 2026-07-31: mesma
// validação precisa rodar antes de "Gerar Plano de Corte") — comportamento
// idêntico ao de antes, só isolado numa função reaproveitável.
function validateCutlistRowsWithUI() {
  const errorEl = document.getElementById('po-cutlist-error');
  errorEl.style.display = 'none';
  if (cutlistRows.length === 0) {
    errorEl.textContent = I18n.t('cutlist.no_rows_error');
    errorEl.style.display = 'block';
    return false;
  }
  if (!validateCutlistRows()) {
    // Mensagem detalhada por linha (pedido do usuário 2026-07-29: "a
    // mensagem nao esta clara do que esta faltando pra gerar o preco") —
    // antes era um aviso genérico só. cutlistValidationAttempted=true
    // liga o destaque vermelho de verdade nos campos (ver
    // refreshCutlistRowHighlight) a partir deste re-render.
    cutlistValidationAttempted = true;
    const fieldLabel = {
      part_name: I18n.t('cutlist.col_part_name'),
      quantity: I18n.t('cutlist.col_quantity'),
      comprimento: I18n.t('cutlist.col_length'),
      largura: I18n.t('cutlist.col_width'),
      espessura: I18n.t('cutlist.col_thickness'),
      color: I18n.t('cutlist.col_color'),
      edge: I18n.t('cutlist.col_edge'),
      edge4blocked: I18n.t('cutlist.edge_4_blocked_title')
    };
    const rowLines = [];
    cutlistRows.forEach((row, idx) => {
      const issues = getCutlistRowIssues(row);
      if (issues.length) {
        rowLines.push(I18n.t('cutlist.row_issue_group', { n: idx + 1, fields: issues.map((k) => fieldLabel[k]).join(', ') }));
      }
    });
    errorEl.textContent = rowLines.length
      ? `${I18n.t('cutlist.invalid_rows_error')} ${rowLines.join(' | ')}`
      : I18n.t('cutlist.invalid_rows_error');
    errorEl.style.display = 'block';
    renderCutlistTable();
    return false;
  }
  return true;
}

const cutlistGenerateBtn = document.getElementById('po-cutlist-generate-price-btn');
if (cutlistGenerateBtn) {
  cutlistGenerateBtn.addEventListener('click', () => {
    if (!validateCutlistRowsWithUI()) return;
    cutlistFinalPrice = computeCutlistTotal();
    document.getElementById('po-cutlist-final-price').textContent = formatMoney(cutlistFinalPrice);
    document.getElementById('po-cutlist-final-price-row').style.display = 'flex';
    document.getElementById('po-cutlist-save-btn').style.display = 'inline-block';
    document.getElementById('po-cutlist-approve-save-btn').style.display = 'inline-block';
  });
}

const cutlistGeneratePlanBtn = document.getElementById('po-cutlist-generate-plan-btn');
if (cutlistGeneratePlanBtn) {
  cutlistGeneratePlanBtn.addEventListener('click', () => {
    if (!validateCutlistRowsWithUI()) return;
    startCutlistPlanFlow();
  });
}

// Dois botões, dois destinos (pedido do usuário 2026-07-19):
// "Salvar" -> status='saved' (migration 052) — fica só no "Meus Pedidos" do
// cliente, NÃO aparece na lista de Pedidos do admin (não vai pra fábrica).
// "Aprovar" -> status='approved' — aparece pro cliente E pro admin
// (produção/fábrica), igual ao pedido de módulo aprovado.
async function saveCutlistOrder(finalStatus) {
  const errorEl = document.getElementById('po-cutlist-error');
  const statusEl = document.getElementById('po-cutlist-status');
  errorEl.style.display = 'none';
  if (cutlistFinalPrice === null) return; // defesa extra — botões só aparecem depois de "Gerar Preço"
  statusEl.textContent = '…';
  try {
    const poName = document.getElementById('po-cutlist-order-name').value.trim();
    const isApproved = finalStatus === 'approved';
    const { data: order, error: orderError } = await supabaseClient
      .from('orders')
      .insert({
        client_user_id: currentUser.id,
        client_name: currentUser.email,
        client_email: currentUser.email,
        po_name: poName || null,
        order_type: 'cutting_list',
        status: finalStatus,
        submitted_at: new Date().toISOString(),
        approved_at: isApproved ? new Date().toISOString() : null
      })
      .select()
      .single();
    if (orderError) throw orderError;

    const itemsPayload = cutlistRows.map((row, idx) => {
      const color = cutlistColorsCache.find((c) => c.id === row.color_id);
      return {
        order_id: order.id,
        op: row.op || null,
        part_name: row.part_name,
        quantity: Number(row.quantity),
        comprimento_mm: Number(row.comprimento_mm),
        largura_mm: Number(row.largura_mm),
        espessura_mm: Number(row.espessura_mm),
        color_id: row.color_id,
        color_name: color ? color.name : null,
        edge_banding: Number(row.edge_banding),
        obs: row.obs || null,
        unit_price: Number((row._unit_price || 0).toFixed(2)),
        total_price: Number((row._total_price || 0).toFixed(2)),
        sort_order: idx
      };
    });
    const { error: itemsError } = await supabaseClient.from('cutting_list_items').insert(itemsPayload);
    if (itemsError) throw itemsError;

    statusEl.textContent = isApproved ? I18n.t('cutlist.approve_success') : I18n.t('cutlist.save_success');
    cutlistRows = [];
    hideCutlistFinalPrice();
    document.getElementById('po-cutlist-order-name').value = '';
    renderCutlistTable();
    myOrdersLoaded = false; // força "Meus Pedidos" recarregar na próxima visita
    setTimeout(() => { statusEl.textContent = ''; }, 6000);
  } catch (err) {
    statusEl.textContent = '';
    errorEl.textContent = I18n.t('cutlist.save_error', { msg: err.message });
    errorEl.style.display = 'block';
  }
}

const cutlistSaveBtn = document.getElementById('po-cutlist-save-btn');
if (cutlistSaveBtn) cutlistSaveBtn.addEventListener('click', () => saveCutlistOrder('saved'));
const cutlistApproveSaveBtn = document.getElementById('po-cutlist-approve-save-btn');
if (cutlistApproveSaveBtn) cutlistApproveSaveBtn.addEventListener('click', () => saveCutlistOrder('approved'));

// ---------- Visualização read-only de um pedido de Plano de Corte já salvo
// (aberto a partir de "Meus Pedidos" — ver loadMyOrders) ----------

function openCutlistOrderDetail(order, items) {
  document.getElementById('po-orders-list-panel').style.display = 'none';
  document.getElementById('po-cutlist-order-detail-section').style.display = 'block';
  document.getElementById('po-cutlist-order-detail-title').textContent = order.po_name || order.client_name || I18n.t('pdf.order_fallback');
  document.getElementById('po-cutlist-order-detail-status-badge').textContent = orderStatusLabel(order.status);
  const tbody = document.getElementById('po-cutlist-order-detail-tbody');
  tbody.innerHTML = (items || []).map((it) => `
    <tr>
      <td>${it.op || '—'}</td>
      <td>${it.part_name}</td>
      <td>${it.quantity}</td>
      <td>${Number(it.comprimento_mm).toFixed(0)}</td>
      <td>${Number(it.largura_mm).toFixed(0)}</td>
      <td>${Number(it.espessura_mm).toFixed(0)}mm</td>
      <td>${it.color_name || '—'}</td>
      <td>${it.edge_banding}</td>
      <td>${it.obs || ''}</td>
    </tr>
  `).join('');
  const total = (items || []).reduce((sum, it) => sum + Number(it.total_price || 0), 0);
  document.getElementById('po-cutlist-order-detail-total').textContent = formatMoney(total);
}

const cutlistOrderDetailBackBtn = document.getElementById('po-cutlist-order-detail-back-btn');
if (cutlistOrderDetailBackBtn) {
  cutlistOrderDetailBackBtn.addEventListener('click', () => {
    document.getElementById('po-cutlist-order-detail-section').style.display = 'none';
    document.getElementById('po-orders-list-panel').style.display = 'block';
  });
}

// ---------- Projetos (canvas 2D — pedido do usuário, 2026-07-21) ----------
// "quero fazer uma tela de projetos mesmo... busca o modulo na biblioteca ao
// lado esquerdo. joga no ambiente visao frontal 2D paralela (nao
// perspectiva) e ao clicar no modulo abre configuracoes da direita... deve
// dar pra arrastar esse modulo no ambiente, e ele deve ter um tipo iman que
// puxe os cantos dele pra eles se conectarem melhor... ao colocar um modulo
// na frente do outro, ele deve levar o modulo novo pra frente".
//
// FASE 1 (entrega faseada combinada com o usuário — risco menor que tudo de
// uma vez): canvas 2D com arrastar/imã/profundidade, painel de config à
// direita (resumo + botão pra reabrir a configuração completa) e preço
// total. Fases seguintes (NÃO estão aqui ainda): vista 3D com portas/
// gavetas, vista superior, lista de módulos, salvar projeto, gerar IA,
// comprar, ajuda.
//
// Arquitetura: projectSlots tem o MESMO formato de compositionSlots (mesmos
// campos width_mm/height_mm/depth_mm/colorsByRole/pieces/result/etc. — ver
// po-add-item-btn) + x_mm (posição horizontal, novo) — floor_height_mm já
// existia (era só um campo manual de altura na Composição) e vira aqui a
// posição VERTICAL de verdade, arrastável. z_order = profundidade (0 =
// encostado na parede; sobrepor outro módulo no arraste soma 1 acima do
// maior z_order que ele estiver tocando). Reaproveita 100% do configurador
// de módulo único que a Composição já usa (startProjectSlotConfig imita
// startCompositionSlotConfig; restoreSlotStateIntoConfigurator é chamada
// direto, sem duplicar) — só muda o destino do "Adicionar".

let projectSlots = [];
let addTargetProjectSlotId = null; // null = não está configurando módulo de projeto agora
let selectedProjectSlotId = null;  // slot mostrado no painel de config à direita
let projectSlotIdSeq = 0;

// Alterações não salvas (pedido do usuário 2026-07-29) — true a partir da
// primeira edição de verdade (mover/redimensionar/trocar cor/forma da
// parede/adicionar/remover módulo), false de novo só ao salvar
// (saveProjectFavorite) ou carregar/resetar um projeto (restoreFavoriteProject/
// resetProject). Usado pra avisar antes de trocar de aba com edição perdida
// (ver o listener de .portal-tab-btn, mais abaixo no arquivo).
let projectDirty = false;
function markProjectDirty() { projectDirty = true; }

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
function getProjectWallCount() { return getProjectWallRoles().length; }

// wallIndex omitido = parede ATIVA (mantém 100% compatível com todo
// call-site antigo de antes desta funcionalidade, que só conhecia 1 parede).
function getProjectWallWidthMm(wallIndex) {
  const idx = (typeof wallIndex === 'number') ? wallIndex : projectActiveWallIndex;
  return projectWallWidthsMm[idx] || PROJECT_WALL_WIDTH_DEFAULT_MM;
}

function projectSlotsOnWall(wallIndex) {
  return projectSlots.filter((s) => Number(s.wall_index || 0) === wallIndex);
}
// Mesma parede do slot dado, excluindo ele mesmo — substitui os antigos
// `projectSlots.filter((s) => s.id !== slot.id)` espalhados pelo arraste/
// snap/profundidade: com múltiplas paredes, "outro módulo" só deve contar
// os que estão na MESMA parede (imã/sobreposição/z_order não fazem sentido
// entre paredes fisicamente diferentes).
function projectSlotsSameWallExcluding(slot) {
  const wallIndex = Number(slot.wall_index || 0);
  return projectSlots.filter((s) => s.id !== slot.id && Number(s.wall_index || 0) === wallIndex);
}

function projectWallRoleLabel(role) { return I18n.t('project.wall_role_' + role); }

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
    labelEl.textContent = roles.length > 1
      ? I18n.t('project.wall_width_label_multi', { n: projectActiveWallIndex + 1, role: projectWallRoleLabel(roles[projectActiveWallIndex]) })
      : I18n.t('project.wall_width_label');
  }
}
refreshProjectWallWidthInput();

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
  const roles = getProjectWallRoles();
  if (roles.length <= 1) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = '';
  roles.forEach((role, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'po-proj-wall-tab-btn' + (idx === projectActiveWallIndex ? ' active' : '');
    btn.textContent = I18n.t('project.wall_tab_label', { n: idx + 1, role: projectWallRoleLabel(role) });
    btn.addEventListener('click', () => setProjectActiveWallIndex(idx));
    wrap.appendChild(btn);
  });
}
refreshProjectWallTabs();

function setProjectActiveWallIndex(idx) {
  const roles = getProjectWallRoles();
  if (idx < 0 || idx >= roles.length || idx === projectActiveWallIndex) return;
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

function applyProjectColumnWidths() {
  const layout = document.querySelector('#po-tab-projects .po-proj-layout');
  if (!layout) return;
  layout.style.setProperty('--proj-lib-w', projectLibraryWidthPx + 'px');
  layout.style.setProperty('--proj-cfg-w', projectConfigWidthPx + 'px');
}
applyProjectColumnWidths();

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
  allOption.textContent = 'Todas';
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
  allCategoryOption.textContent = 'Todas';
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
    card.addEventListener('click', () => insertProjectModuleDefault(m.id));
    grid.appendChild(card);
  });
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
      insertProjectModuleDefault(m.id);
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

async function insertProjectModuleDefault(moduleId) {
  const m = allModules.find((mm) => mm.id === moduleId);
  if (!m) return;
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
    const width_mm = clamp(Number(m.width_default_mm || 0), Number(m.width_min_mm || 0), Number(m.width_max_mm || Infinity));
    const height_mm = clamp(Number(m.height_default_mm || 0), Number(m.height_min_mm || 0), effHeightMaxMm);
    const depth_mm = clamp(Number(m.depth_default_mm || 0), Number(m.depth_min_mm || 0), Number(m.depth_max_mm || Infinity));

    const result = m.is_decoration
      ? { total: 0, breakdown: [] }
      : Pricing.calculateModulePrice({
        module: m, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
        shelfQuantities, dimOverrides: {}, pieceColorOverrides: {},
        width_mm, height_mm, depth_mm, markupMultiplier: pricingMarkupMultiplier
      });

    const slot = {
      id: newProjectSlotId(),
      wall_index: projectActiveWallIndex,
      x_mm: 0,
      floor_height_mm: 0,
      z_order: 0,
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
    slot.x_mm = computeDefaultProjectSlotX(slot.width_mm);
    resolveProjectSlotDepth(slot, projectSlotsOnWall(projectActiveWallIndex));
    projectSlots.push(slot);
    selectedProjectSlotId = slot.id;
    renderProjectCanvas();
    markProjectDirty();
  } catch (err) {
    if (errorEl) { errorEl.textContent = err.message || String(err); errorEl.style.display = 'block'; }
  }
}

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
  const wallWidthMm = getProjectWallWidthMm(projectActiveWallIndex);
  const sameWallSlots = projectSlotsOnWall(projectActiveWallIndex);
  if (!sameWallSlots.length) return 0;
  const rightmost = sameWallSlots.reduce((max, s) => Math.max(max, Number(s.x_mm || 0) + Number(s.width_mm || 0)), 0);
  if (rightmost + widthMm <= wallWidthMm) return rightmost;
  return Math.max(0, wallWidthMm - widthMm);
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
const PROJECT_CLICK_MOVE_THRESHOLD_PX = 4;      // abaixo disso, pointerup vira clique (seleciona) em vez de arraste

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
  const maxX = Math.max(0, getProjectWallWidthMm(Number(slot.wall_index || 0)) - Number(slot.width_mm || 0));
  const maxY = projectSlotMaxFloorHeightMm(slot.height_mm, slot.module);
  slot.x_mm = clamp(Number(slot.x_mm || 0), 0, maxX);
  slot.floor_height_mm = clamp(Number(slot.floor_height_mm || 0), 0, maxY);
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

function projectRectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Profundidade: ao soltar o módulo, se a posição final SOBREPÕE (de
// verdade, não só encostada — ver projectRectsOverlap) outro módulo já no
// ambiente, ele vira a camada mais à frente entre os que ele toca. Sem
// sobreposição nenhuma, volta a ficar encostado na parede (z_order 0) —
// pedido do usuário: "ao colocar um modulo na frente do outro, ele deve
// levar o modulo novo pra frente".
function resolveProjectSlotDepth(slot, otherSlots) {
  const rectA = { x: slot.x_mm, w: slot.width_mm, y: slot.floor_height_mm, h: slot.height_mm };
  let maxOverlapZ = -1;
  otherSlots.forEach((s) => {
    const rectB = { x: s.x_mm, w: s.width_mm, y: s.floor_height_mm, h: s.height_mm };
    if (projectRectsOverlap(rectA, rectB)) maxOverlapZ = Math.max(maxOverlapZ, Number(s.z_order || 0));
  });
  slot.z_order = maxOverlapZ >= 0 ? maxOverlapZ + 1 : 0;
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
// ponteiro sair por cima de outro módulo. Distingue clique de arraste pelo
// deslocamento total (PROJECT_CLICK_MOVE_THRESHOLD_PX): abaixo disso,
// pointerup seleciona o módulo (abre o painel da direita) em vez de mover.
function attachProjectSlotDrag(div, slot) {
  div.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    try { div.setPointerCapture(ev.pointerId); } catch (e) { /* ok, alguns navegadores não precisam */ }
    projectDragState = {
      slotId: slot.id,
      pointerId: ev.pointerId,
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startXMm: Number(slot.x_mm || 0),
      startYMm: Number(slot.floor_height_mm || 0),
      moved: false,
      liveX: Number(slot.x_mm || 0),
      liveY: Number(slot.floor_height_mm || 0)
    };
    div.classList.add('dragging');
  });

  div.addEventListener('pointermove', (ev) => {
    if (!projectDragState || projectDragState.slotId !== slot.id || projectDragState.pointerId !== ev.pointerId) return;
    const dxPx = ev.clientX - projectDragState.startClientX;
    const dyPx = ev.clientY - projectDragState.startClientY;
    if (!projectDragState.moved && Math.hypot(dxPx, dyPx) > PROJECT_CLICK_MOVE_THRESHOLD_PX) {
      projectDragState.moved = true;
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

    div.style.left = Math.round(x * projectPxPerMm) + 'px';
    div.style.bottom = Math.round(y * projectPxPerMm) + 'px';
    projectDragState.liveX = x;
    projectDragState.liveY = y;
  });

  const endDrag = (ev) => {
    if (!projectDragState || projectDragState.slotId !== slot.id) return;
    div.classList.remove('dragging');
    try { div.releasePointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    const state = projectDragState;
    projectDragState = null;
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

function selectProjectSlot(slotId) {
  selectedProjectSlotId = slotId;
  document.querySelectorAll('#po-proj-canvas .po-proj-slot').forEach((el) => {
    el.classList.toggle('selected', el.dataset.slotId === slotId);
  });
  renderProjectConfigPanel();
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
function projectSlotEffectivePieces(slot) {
  return slot.pieces.filter((p) => !p.client_optional || slot.selectedOptionalIds.includes(p.id));
}

function recomputeProjectSlotPricing(slot) {
  const effectivePieces = projectSlotEffectivePieces(slot);
  slot.result = slot.module.is_decoration
    ? { total: 0, breakdown: [] }
    : Pricing.calculateModulePrice({
      module: slot.module, pieces: effectivePieces, colorsByRole: slot.colorsByRole,
      hingeModel: slot.hingeModel, slideModel: slot.slideModel,
      shelfQuantities: slot.shelfQuantities, dimOverrides: slot.dimOverrides,
      pieceColorOverrides: slot.pieceColorOverrides,
      width_mm: slot.width_mm, height_mm: slot.height_mm, depth_mm: slot.depth_mm,
      markupMultiplier: pricingMarkupMultiplier
    });
}

// Editor inline de medida (steppers +/- e campo exato do painel da direita)
// — pedido do usuário: "clicando abre as configuracoes na direita e eu
// resolva tudo na mesma tela". Trava no min/max do módulo (mesmas colunas
// width_min_mm/max_mm etc. do catálogo) e, no eixo da altura, também no teto
// útil (mesma regra de sempre — pé direito − 5" − rodapé, considerando a
// posição vertical atual do módulo).
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
  const removeBtn = panel.querySelector('#po-proj-config-remove-btn');
  if (removeBtn) removeBtn.addEventListener('click', () => removeProjectSlot(slot.id));
}

function renderProjectTotal() {
  const totalEl = document.getElementById('po-proj-total');
  if (!totalEl) return;
  const total = projectSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
  totalEl.textContent = I18n.t('project.total_estimated', { total: formatMoney(total) });
  // Volume/peso somado do projeto — migration 061. Cada slot é 1 unidade
  // (sem conceito de quantidade em Projetos), então soma direta dos
  // breakdowns, sem multiplicador.
  const vwEl = document.getElementById('po-proj-volume-weight');
  if (vwEl) {
    vwEl.textContent = projectSlots.length > 0
      ? formatVolumeWeightFromM3(projectSlots.reduce((sum, slot) => sum + itemVolumeM3((slot.result && slot.result.breakdown) || []), 0))
      : '';
  }
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
  const emptyHint = document.getElementById('po-proj-empty-hint');
  const topViewHint = document.getElementById('po-proj-top-view-hint');
  if (!canvas || !wrap) return;

  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  projectSlots.forEach((slot) => clampProjectSlotPosition(slot));

  if (projectViewMode === 'top') {
    renderProjectCanvasTop(canvas, wrap, dimsLabel, unit);
  } else if (getProjectWallCount() > 1) {
    // Pedido do usuário (2026-07-26, olhando um projeto em L): "quando for
    // parede em L devemos subir uma visao fixa em angulo... mostrando as
    // duas paredes ao mesmo tempo... visao paralela das duas de uma vez,
    // mostrando o fim das paredes" — confirmado via pergunta de
    // esclarecimento que isso SUBSTITUI a Vista Frontal de 1 parede por vez
    // (não fica ao lado dela) quando o projeto tem mais de 1 parede
    // (dupla/L ou C-U), e que a câmera é FIXA/sem interação (sem
    // orbitar/zoom) — só clique pra trocar de parede ativa, igual o
    // traçado fantasma já fazia.
    renderProjectCanvasFrontCorner(canvas, wrap, dimsLabel, unit);
  } else {
    renderProjectCanvasFront(canvas, wrap, dimsLabel, unit);
  }
  if (topViewHint) topViewHint.style.display = projectViewMode === 'top' ? 'block' : 'none';
  renderProjectMiniTopView();

  // Frontal: "vazio" é por PAREDE ativa (é o que está na tela) — Superior
  // mostra todas as paredes juntas, então usa o total do projeto.
  const emptyCount = projectViewMode === 'top' ? projectSlots.length : projectSlotsOnWall(projectActiveWallIndex).length;
  if (emptyHint) emptyHint.style.display = emptyCount ? 'none' : 'block';

  const genBtn = document.getElementById('po-proj-generate-btn');
  const genHint = document.getElementById('po-proj-generate-hint');
  if (genBtn) genBtn.disabled = projectSlots.length < 1;
  if (genHint) genHint.style.display = projectSlots.length < 1 ? 'block' : 'none';

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
        if (selectedProjectSlotId != null) {
          selectedProjectSlotId = null;
          renderProjectConfigPanel();
        }
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

  const activeIdx = projectActiveWallIndex;
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
  ViewerProjectEdit.setControlsEnabled(true);

  const wallsGeometry = getProjectWallGeometry();
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
  const fitKey = projectWallShape + '|' + activeIdx;
  const keepCamera = project3DLastFitKey === fitKey;
  project3DLastFitKey = fitKey;
  ViewerProjectEdit.renderFreeformWalls(wallsData, viewerRoomEnvConfig(), activeIdx, { keepCamera });

  // Readota o contorno de destaque (ver project3DHoveredSlotId abaixo) —
  // renderFreeformWalls troca TODOS os Groups por instâncias novas, então o
  // Group antigo que o contorno rastreava não existe mais na cena (ficaria
  // "preso"/desatualizado sem isto). Roda depois de QUALQUER render desta
  // vista, não importa a causa (arrastar, esticar, trocar de parede, add/
  // remover módulo) — mantém o destaque em sincronia sempre.
  if (project3DHoveredSlotId) {
    const g = ViewerProjectEdit.findGroupBySlotId(project3DHoveredSlotId);
    ViewerProjectEdit.setHoverHighlight(g || null);
    if (!g) project3DHoveredSlotId = null;
  }

  attachProject3DEditDrag();
}

// Estado do arraste em andamento na Vista de Canto 3D — null quando nenhum
// arraste está rolando. Um só de cada vez (não precisa de Map por
// pointerId: esta cena não tem multi-touch/dedos múltiplos previsto).
let projectDrag3DState = null;

// Qual módulo está com o contorno vermelho de destaque agora (hover OU
// sendo arrastado/esticado) — pedido do usuário 2026-07-26: "quero que
// quando o mouse passe em cima do modulo ele fique contorno vermelho, pra
// saber qual modulo sera editado ou movimentado". Variável própria (não
// reaproveita selectedProjectSlotId, que é sobre CLIQUE/seleção — hover é
// TRANSIENTE, sem precisar clicar) pra sobreviver a reconstruções da cena
// (ver readoção acima em renderProjectCanvasFrontCorner).
let project3DHoveredSlotId = null;

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
function classifyProject3DGrab(slot, grabAlongMm, grabHeightMm) {
  const widthMm = Number(slot.width_mm || 0);
  const heightMm = Number(slot.height_mm || 0);
  const widthPresetsMm = slot.widthPresetsMm || [];
  const heightPresetsMm = slot.heightPresetsMm || [];
  const widthResizable = slot.module.width_locked
    ? widthPresetsMm.length > 1
    : Number(slot.module.width_min_mm) !== Number(slot.module.width_max_mm);
  const heightResizable = slot.module.height_locked
    ? heightPresetsMm.length > 1
    : Number(slot.module.height_min_mm) !== Number(slot.module.height_max_mm);
  const localLeftMm = grabAlongMm - Number(slot.x_mm || 0);
  const localRightMm = widthMm - localLeftMm;
  const localTopMm = (Number(slot.floor_height_mm || 0) + heightMm) - grabHeightMm;
  const EDGE_ZONE_W_MM = clamp(widthMm * 0.18, 25, 60);
  const EDGE_ZONE_H_MM = clamp(heightMm * 0.18, 25, 60);

  if (widthResizable && localLeftMm <= EDGE_ZONE_W_MM) return { dragMode: 'resize', resizeAxis: 'width-left' };
  if (widthResizable && localRightMm <= EDGE_ZONE_W_MM) return { dragMode: 'resize', resizeAxis: 'width-right' };
  if (heightResizable && localTopMm <= EDGE_ZONE_H_MM) return { dragMode: 'resize', resizeAxis: 'height-top' };
  return { dragMode: 'move', resizeAxis: null };
}

// Anexa os listeners de arrastar no <canvas> real do Three.js (uma única
// vez — checa domEl.dataset.legnoDragAttached porque renderProjectCanvasFrontCorner
// roda de novo a cada renderProjectCanvas(), mas o <canvas>/renderer da
// instância é reaproveitado entre renders, ver "if (renderer) return" em
// init() no viewer3d_composition.js — anexar nesta função de novo a cada
// render duplicaria o listener).
function attachProject3DEditDrag() {
  if (!ViewerProjectEdit) return;
  const domEl = ViewerProjectEdit.getDomElement && ViewerProjectEdit.getDomElement();
  if (!domEl || domEl.dataset.legnoDragAttached === '1') return;
  domEl.dataset.legnoDragAttached = '1';

  domEl.addEventListener('pointerdown', (ev) => {
    // SÓ botão ESQUERDO (ev.button===0) — pedido do usuário 2026-07-26
    // ("pode fazer a rotacao apertando o scroll ao inves do botao direito")
    // revelou um bug: esse handler não checava qual botão foi clicado, então
    // um clique do MEIO ou DIREITO em cima de um módulo (comum — módulos
    // ocupam a maior parte da tela) também disparava a lógica de arrastar/
    // esticar módulo, brigando com o OrbitControls (ver setControlsEnabled,
    // viewer3d_composition.js — meio=girar, direito=pan agora). Sem este
    // guard, girar a câmera podia mover o módulo embaixo do cursor por
    // engano, ou simplesmente travar o gesto de orbit pela metade.
    if (ev.button !== 0) return;
    // preferredWallIndex=projectActiveWallIndex (ver comentário grande em
    // pickAssemblyAt, viewer3d_composition.js): perto do canto, prefere o
    // módulo da parede em edição em vez do hit geometricamente mais
    // próximo, que pode pertencer à outra parede.
    const hit = ViewerProjectEdit.pickAssemblyAt(ev.clientX, ev.clientY, projectActiveWallIndex);
    if (!hit || !hit.group) {
      // Clique em área vazia da cena (nenhum módulo embaixo do ponteiro) —
      // pedido do usuário (2026-07-26: "quando clicar na tela quero que nao
      // apareca ennhum modulo nas configuracoes da direita") — antes não
      // fazia nada aqui, então o painel de config à direita continuava
      // preso no ÚLTIMO módulo selecionado mesmo clicando fora dele. Câmera
      // desta vista é FIXA (setControlsEnabled(false), sem orbit), então um
      // pointerdown sem hit nunca é o início de um arraste de verdade — pode
      // desselecionar na hora, sem esperar o pointerup.
      if (selectedProjectSlotId != null) {
        selectedProjectSlotId = null;
        renderProjectConfigPanel();
      }
      return;
    }
    const slot = projectSlots.find((s) => s.id === hit.slotId);
    if (!slot) return;
    ev.preventDefault();
    try { domEl.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }

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
    const widthMm = Number(slot.width_mm || 0);
    const grab = classifyProject3DGrab(slot, grabAlongMm, grabHeightMm);
    let grabOffsetEdgeMm = 0;
    if (grab.resizeAxis === 'width-left') grabOffsetEdgeMm = grabAlongMm - Number(slot.x_mm || 0);
    else if (grab.resizeAxis === 'width-right') grabOffsetEdgeMm = grabAlongMm - (Number(slot.x_mm || 0) + widthMm);
    else if (grab.resizeAxis === 'height-top') grabOffsetEdgeMm = grabHeightMm - (Number(slot.floor_height_mm || 0) + Number(slot.height_mm || 0));

    projectDrag3DState = {
      pointerId: ev.pointerId,
      slotId: slot.id,
      group: hit.group,
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
      grabOffsetYMm: grabHeightMm - Number(slot.floor_height_mm || 0)
    };
    // Destaque vermelho continua no módulo sendo agarrado (já deveria estar
    // aceso pelo hover que precede o clique — reforçado aqui pra cobrir
    // toque/touch, que não dispara um pointermove de hover antes).
    project3DHoveredSlotId = slot.id;
    ViewerProjectEdit.setHoverHighlight(hit.group);
    domEl.style.cursor = grab.dragMode === 'resize' ? (grab.resizeAxis === 'height-top' ? 'ns-resize' : 'ew-resize') : 'grabbing';
  });

  domEl.addEventListener('pointermove', (ev) => {
    const state = projectDrag3DState;
    if (!state) {
      // HOVER (nenhum arraste em andamento) — pedido do usuário 2026-07-26:
      // "quero que quando o mouse passe em cima do modulo ele fique
      // contorno vermelho... nao sei qual modulo estou selecionando" +
      // "nao sei se o comando sera arrastar o modulo ou esticar ele".
      // Destaca o módulo embaixo do ponteiro (contorno vermelho) E já troca
      // o cursor conforme o MODO que um clique ali resultaria (mover vs
      // esticar largura/altura) — mesma classificação do pointerdown
      // (classifyProject3DGrab), só sem de fato começar nenhum arraste.
      const hoverHit = ViewerProjectEdit.pickAssemblyAt(ev.clientX, ev.clientY, projectActiveWallIndex);
      if (!hoverHit) {
        project3DHoveredSlotId = null;
        ViewerProjectEdit.setHoverHighlight(null);
        domEl.style.cursor = 'default';
        return;
      }
      project3DHoveredSlotId = hoverHit.slotId;
      ViewerProjectEdit.setHoverHighlight(hoverHit.group);
      const hoverSlot = projectSlots.find((s) => s.id === hoverHit.slotId);
      let cursor = 'grab';
      const hoverWallGeo = hoverSlot && getProjectWallGeometry().find((w) => w.wallIndex === Number(hoverSlot.wall_index || 0));
      if (hoverSlot && hoverWallGeo) {
        const p = ViewerProjectEdit.intersectPlaneAtClient(ev.clientX, ev.clientY,
          { x: hoverWallGeo.originX, y: 0, z: hoverWallGeo.originZ }, { x: hoverWallGeo.intoDirX, y: 0, z: hoverWallGeo.intoDirZ });
        if (p) {
          const hoverAlongMm = ((p.x - hoverWallGeo.originX) * hoverWallGeo.alongDirX + (p.z - hoverWallGeo.originZ) * hoverWallGeo.alongDirZ) * 1000;
          const hoverHeightMm = p.y * 1000;
          const grab = classifyProject3DGrab(hoverSlot, hoverAlongMm, hoverHeightMm);
          if (grab.dragMode === 'resize') cursor = grab.resizeAxis === 'height-top' ? 'ns-resize' : 'ew-resize';
        }
      }
      domEl.style.cursor = cursor;
      return;
    }
    if (state.pointerId !== ev.pointerId) return;
    if (!state.moved) {
      const dPx = Math.hypot(ev.clientX - state.startClientX, ev.clientY - state.startClientY);
      if (dPx < PROJECT_CLICK_MOVE_THRESHOLD_PX) return;
      state.moved = true;
    }
    const slot = projectSlots.find((s) => s.id === state.slotId);
    if (!slot) { projectDrag3DState = null; return; }

    // Esticar (largura/altura) é um modo TOTALMENTE separado de mover — ver
    // classificação no pointerdown acima. Delegado pra função própria
    // (reaproveita updateProjectSlotDimension/updateProjectSlotWidthFromLeft,
    // as MESMAS funções que a Vista Frontal 2D já usa — zero lógica de
    // clamp/preset/preço duplicada).
    if (state.dragMode === 'resize') {
      handleProject3DResizeMove(state, slot, ev);
      return;
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

    // Arrastar até a borda da parede ativa troca de parede (pedido do
    // usuário, confirmado via pergunta de esclarecimento: "arrastar até a
    // borda da parede ativa") — o módulo "atravessa" o canto e continua o
    // arraste na parede vizinha a partir da esquina compartilhada. Só
    // possível se existir vizinha NAQUELA borda (getProjectAdjacentWallEdgeInfo);
    // sem vizinha, clampa na própria borda (mesmo comportamento de sempre).
    const widthMm = Number(slot.width_mm || 0);
    const wallWidthMm = getProjectWallWidthMm(wallGeo.wallIndex);
    const edgeInfo = getProjectAdjacentWallEdgeInfo(wallGeo.wallIndex);
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
    }
  });

  const endDrag3D = (ev) => {
    const state = projectDrag3DState;
    if (!state || state.pointerId !== ev.pointerId) return;
    projectDrag3DState = null;
    domEl.style.cursor = 'grab';
    if (!state.moved) {
      selectProjectSlot(state.slotId);
      return;
    }
    const slot = projectSlots.find((s) => s.id === state.slotId);
    if (slot) {
      resolveProjectSlotDepth(slot, projectSlotsSameWallExcluding(slot));
    }
    renderProjectCanvas();
    markProjectDirty();
  };
  domEl.addEventListener('pointerup', endDrag3D);
  domEl.addEventListener('pointercancel', endDrag3D);

  // Ponteiro saiu do canvas sem estar arrastando nada — apaga o contorno de
  // destaque e o cursor especial (senão ficaria "grudado" mostrando o
  // último módulo sobrevoado mesmo com o mouse já fora da cena 3D).
  domEl.addEventListener('pointerleave', () => {
    if (projectDrag3DState) return; // durante um arraste de verdade, mantém (setPointerCapture já garante os eventos)
    project3DHoveredSlotId = null;
    ViewerProjectEdit.setHoverHighlight(null);
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
function handleProject3DResizeMove(state, slot, ev) {
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

// Junta a Vista Superior de CADA parede (computeProjectSlotsTopViewLayout,
// função de cima — continua igual, opera só na lista de módulos de UMA
// parede) num único sistema de coordenadas de tela, respeitando o canto reto
// (90°) da forma escolhida (pedido do usuário, 2026-07-25). Não é
// aproximação nova: o eixo Y (screenY) é literalmente a MESMA grandeza física
// nas 3 paredes — distância da parede de FUNDO ('main') pra dentro do
// ambiente — porque 'left'/'right' nascem exatamente nas pontas da 'main' e
// esticam em direção à frente. Só o eixo X muda de sentido: 'main' usa a
// posição ao longo dela mesma (x_mm, igual sempre foi); 'left'/'right' usam
// a profundidade DERIVADA (depthOffsetMm, mesma conta de sempre, por
// sobreposição de z_order) como posição X física — crescendo pra DENTRO do
// ambiente a partir de cada ponta.
function computeProjectWallTopViewPlacements() {
  const roles = getProjectWallRoles();
  const mainIdx = roles.indexOf('main');
  const mainWidthMm = getProjectWallWidthMm(mainIdx >= 0 ? mainIdx : 0);
  const placements = [];
  let maxYMm = 0;

  roles.forEach((role, idx) => {
    const layout = computeProjectSlotsTopViewLayout(projectSlotsOnWall(idx));
    layout.forEach(({ slot, depthOffsetMm }) => {
      const depthMm = Number(slot.depth_mm || 0);
      const alongMm = Number(slot.x_mm || 0);
      const widthMm = Number(slot.width_mm || 0);
      let screenX, screenY, screenW, screenH;
      if (role === 'left') {
        screenX = depthOffsetMm;
        screenY = alongMm;
        screenW = depthMm;
        screenH = widthMm;
      } else if (role === 'right') {
        screenX = mainWidthMm - depthOffsetMm - depthMm;
        screenY = alongMm;
        screenW = depthMm;
        screenH = widthMm;
      } else { // 'main'
        screenX = alongMm;
        screenY = depthOffsetMm;
        screenW = widthMm;
        screenH = depthMm;
      }
      maxYMm = Math.max(maxYMm, screenY + screenH);
      placements.push({ slot, screenX, screenY, screenW, screenH });
    });
  });

  // Parede de retorno (dupla/C-U) sempre entra no orçamento de profundidade
  // do desenho, mesmo SEM nenhum módulo nela ainda (pedido do usuário
  // 2026-07-26: "top nao ta mostrando a parede completa de um lado") — antes
  // maxYMm só crescia com a posição/altura dos MÓDULOS já colocados (linha
  // acima), então um projeto novo (sem módulo nenhum) tinha maxYMm=0 e o
  // canvas nascia baixinho (só a margem mínima de renderProjectCanvasTop);
  // a linha vertical que representa a parede lateral (po-proj-canvas-top-
  // wall-line-side, ver renderProjectCanvasTop) é desenhada na largura REAL
  // daquela parede na MESMA escala — ficava mais alta que o canvas e
  // aparecia cortada. Usar a largura da própria parede como piso de maxYMm
  // garante que o canvas sempre nasce alto o bastante pra mostrar a parede
  // de retorno inteira, com ou sem módulo.
  roles.forEach((role, idx) => {
    if (role === 'left' || role === 'right') {
      maxYMm = Math.max(maxYMm, getProjectWallWidthMm(idx));
    }
  });

  return { placements, mainWidthMm, maxYMm };
}

function renderProjectCanvasTop(canvas, wrap, dimsLabel, unit) {
  const roles = getProjectWallRoles();
  const { placements, mainWidthMm, maxYMm } = computeProjectWallTopViewPlacements();
  // Profundidade total do desenho: o que os módulos realmente ocupam + uma
  // margem (mínimo 300mm) — sem sala com profundidade real cadastrada, é só
  // um enquadramento razoável pro desenho não ficar colado nas bordas.
  const totalDepthMm = Math.max(maxYMm, 100) + Math.max(maxYMm * 0.25, 300);

  const availableWidthPx = Math.max(wrap.clientWidth - 4, 320);
  const wrapTop = wrap.getBoundingClientRect().top;
  const availableHeightPx = Math.max(window.innerHeight - wrapTop - 40, 240);
  const widthScale = availableWidthPx / mainWidthMm;
  const heightScale = availableHeightPx / totalDepthMm;
  // Mesma escala nos dois eixos (vista PARALELA/ortográfica, como pedido —
  // não "esticar" um eixo mais que o outro) — usa a menor das duas pra caber
  // inteira na tela.
  projectPxPerMm = clamp(Math.min(widthScale, heightScale), 0.015, 0.8);

  canvas.style.width = Math.round(mainWidthMm * projectPxPerMm) + 'px';
  canvas.style.height = Math.round(totalDepthMm * projectPxPerMm) + 'px';
  canvas.innerHTML = '';
  canvas.classList.add('po-proj-canvas-top-mode');
  // Vista Superior sempre usa o canvas 2D plano, mesmo com >1 parede —
  // garante que a Vista de Canto 3D (renderProjectCanvasFrontCorner) fique
  // escondida (só aparece no modo 'front').
  canvas.style.display = '';
  const edit3dWrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  if (edit3dWrap) edit3dWrap.style.display = 'none';

  const wallLine = document.createElement('div');
  wallLine.className = 'po-proj-canvas-top-wall-line';
  canvas.appendChild(wallLine);

  // Paredes de retorno (dupla/C-U) — linha vertical em cada ponta, só pra
  // dar noção do formato do ambiente (não é espessura de parede real).
  if (roles.includes('left')) {
    const leftLine = document.createElement('div');
    leftLine.className = 'po-proj-canvas-top-wall-line-side po-proj-canvas-top-wall-line-left';
    leftLine.style.height = Math.round(getProjectWallWidthMm(roles.indexOf('left')) * projectPxPerMm) + 'px';
    canvas.appendChild(leftLine);
  }
  if (roles.includes('right')) {
    const rightLine = document.createElement('div');
    rightLine.className = 'po-proj-canvas-top-wall-line-side po-proj-canvas-top-wall-line-right';
    rightLine.style.height = Math.round(getProjectWallWidthMm(roles.indexOf('right')) * projectPxPerMm) + 'px';
    canvas.appendChild(rightLine);
  }

  if (dimsLabel) {
    dimsLabel.textContent = I18n.t('project.top_view_dims_label', {
      w: formatDimension(mainWidthMm, unit),
      d: formatDimension(Math.round(maxYMm), unit)
    });
  }

  placements.forEach(({ slot, screenX, screenY, screenW, screenH }) => {
    const div = document.createElement('div');
    div.className = 'po-proj-slot po-proj-slot-top' + (slot.id === selectedProjectSlotId ? ' selected' : '');
    div.dataset.slotId = slot.id;
    div.style.left = Math.round(screenX * projectPxPerMm) + 'px';
    div.style.top = Math.round(screenY * projectPxPerMm) + 'px';
    div.style.width = Math.round(screenW * projectPxPerMm) + 'px';
    div.style.height = Math.round(screenH * projectPxPerMm) + 'px';
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
  const wrapEl = document.getElementById('po-proj-mini-top-wrap');
  const canvas = document.getElementById('po-proj-mini-top-canvas');
  if (!wrapEl || !canvas) return;

  // Pedido do usuário (2026-07-26, olhando a Vista de Canto 3D já pronta):
  // "pode tirar visao top do lado, aumentar a tela de projeto" — esse
  // painel só ligava exatamente nas MESMAS condições da Vista de Canto 3D
  // (>1 parede, modo 'front' — ver renderProjectCanvasFrontCorner), que
  // agora já mostra as duas paredes de uma vez em 3D de verdade, tornando
  // este painel redundante. Desligado (nunca mais aparece) — reversível
  // (é só essa linha), o resto da função/lógica fica intacta caso precise
  // voltar. Também libera a largura toda de .po-proj-canvas-row pro canvas
  // 3D (flex:1, ver CSS — um elemento display:none não ocupa espaço).
  const show = false;
  wrapEl.style.display = show ? 'block' : 'none';
  if (!show) { canvas.innerHTML = ''; return; }

  const roles = getProjectWallRoles();
  const { placements, mainWidthMm, maxYMm } = computeProjectWallTopViewPlacements();
  const totalDepthMm = Math.max(maxYMm, 100) + Math.max(maxYMm * 0.25, 300);

  const availableWidthPx = Math.max((canvas.parentElement.clientWidth || 170) - 4, 100);
  const maxHeightPx = 260;
  const widthScale = availableWidthPx / mainWidthMm;
  const heightScale = maxHeightPx / totalDepthMm;
  const miniPxPerMm = clamp(Math.min(widthScale, heightScale), 0.004, 0.4);

  canvas.style.width = Math.round(mainWidthMm * miniPxPerMm) + 'px';
  canvas.style.height = Math.round(totalDepthMm * miniPxPerMm) + 'px';
  canvas.innerHTML = '';

  const wallLine = document.createElement('div');
  wallLine.className = 'po-proj-canvas-top-wall-line';
  canvas.appendChild(wallLine);

  if (roles.includes('left')) {
    const leftLine = document.createElement('div');
    leftLine.className = 'po-proj-canvas-top-wall-line-side po-proj-canvas-top-wall-line-left';
    leftLine.style.height = Math.round(getProjectWallWidthMm(roles.indexOf('left')) * miniPxPerMm) + 'px';
    canvas.appendChild(leftLine);
  }
  if (roles.includes('right')) {
    const rightLine = document.createElement('div');
    rightLine.className = 'po-proj-canvas-top-wall-line-side po-proj-canvas-top-wall-line-right';
    rightLine.style.height = Math.round(getProjectWallWidthMm(roles.indexOf('right')) * miniPxPerMm) + 'px';
    canvas.appendChild(rightLine);
  }

  // Faixa clicável por parede (atrás dos módulos) — dá contexto de qual
  // trecho da mini planta é a parede ATIVA na Frontal ao lado, e permite
  // trocar de parede clicando direto aqui (mesma função das abas em cima do
  // canvas, ver setProjectActiveWallIndex).
  const bandMm = Math.max(totalDepthMm * 0.18, 80);
  roles.forEach((role, idx) => {
    const zone = document.createElement('div');
    zone.className = 'po-proj-mini-wall-zone' + (idx === projectActiveWallIndex ? ' active' : '');
    let zx, zy, zw, zh;
    if (role === 'left') { zx = 0; zy = 0; zw = bandMm; zh = getProjectWallWidthMm(idx); }
    else if (role === 'right') { zx = mainWidthMm - bandMm; zy = 0; zw = bandMm; zh = getProjectWallWidthMm(idx); }
    else { zx = 0; zy = 0; zw = mainWidthMm; zh = bandMm; }
    zone.style.left = Math.round(zx * miniPxPerMm) + 'px';
    zone.style.top = Math.round(zy * miniPxPerMm) + 'px';
    zone.style.width = Math.round(zw * miniPxPerMm) + 'px';
    zone.style.height = Math.round(zh * miniPxPerMm) + 'px';
    zone.title = I18n.t('project.wall_tab_label', { n: idx + 1, role: projectWallRoleLabel(role) });
    zone.addEventListener('click', () => setProjectActiveWallIndex(idx));
    canvas.appendChild(zone);
  });

  placements.forEach(({ slot, screenX, screenY, screenW, screenH }) => {
    const div = document.createElement('div');
    div.className = 'po-proj-mini-slot' + (slot.id === selectedProjectSlotId ? ' selected' : '');
    div.style.left = Math.round(screenX * miniPxPerMm) + 'px';
    div.style.top = Math.round(screenY * miniPxPerMm) + 'px';
    div.style.width = Math.round(screenW * miniPxPerMm) + 'px';
    div.style.height = Math.round(screenH * miniPxPerMm) + 'px';
    div.style.background = projectSlotColorSwatch(slot);
    div.title = slot.module.name;
    div.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const wallIdx = Number(slot.wall_index || 0);
      if (wallIdx !== projectActiveWallIndex) setProjectActiveWallIndex(wallIdx);
      selectProjectSlot(slot.id);
    });
    canvas.appendChild(div);
  });
}

// Instância 3D PRÓPRIA da aba Projetos (createInstance, ver
// viewer3d_composition.js) — renderer/scene/câmera/estado de porta-gaveta
// totalmente separados de ViewerComposition (aba Composição), pra não colidir
// se o cliente tiver as duas cenas montadas na mesma sessão (abas diferentes
// do portal, mas o DOM/JS de ambas convive na mesma página).
const ViewerProject = (typeof ViewerComposition !== 'undefined' && ViewerComposition.createInstance)
  ? ViewerComposition.createInstance()
  : null;

// Monta os assemblies 3D dos módulos soltos no ambiente (mesma lógica de
// buildCompositionAssemblies, ver comentário lá) + x_m/z_order (posição
// livre no chão e profundidade da pilha, exclusivos do canvas 2D da
// Projetos — a Composição não tem, sempre empilha em coluna única).
function buildProjectAssemblies(slotsList) {
  return slotsList.map((slot) => {
    const moduleDims = { W: slot.width_mm, H: slot.height_mm, D: slot.depth_mm };
    const parts = resolvePiecesForViewer(slot.pieces, moduleDims, slot.colorsByRole, slot.shelfQuantities, slot.dimOverrides, slot.pieceColorOverrides);
    const openState = {
      doors: (ViewerProject && ViewerProject.areDoorsOpen) ? ViewerProject.areDoorsOpen() : false,
      drawers: (ViewerProject && ViewerProject.areDrawersOpen) ? ViewerProject.areDrawersOpen() : false
    };
    const assembly = Viewer3D.buildStandaloneAssembly(parts, slot.width_mm, slot.height_mm, slot.depth_mm, openState);
    if (assembly) {
      assembly.id = slot.id;
      assembly.floor_height_m = Number(slot.floor_height_mm || 0) / 1000;
      assembly.x_m = Number(slot.x_mm || 0) / 1000;
      assembly.z_order = Number(slot.z_order || 0);

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
      if (typeof THREE !== 'undefined') {
        const wM = slot.width_mm / 1000, hM = slot.height_mm / 1000, dM = slot.depth_mm / 1000;
        const hitboxGeom = new THREE.BoxGeometry(Math.max(wM, 0.01), Math.max(hM, 0.01), Math.max(dM, 0.01));
        const hitboxMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const hitbox = new THREE.Mesh(hitboxGeom, hitboxMat);
        hitbox.position.set(0, hM / 2, 0);
        hitbox.userData.isHitboxProxy = true;
        assembly.group.add(hitbox);
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
function getProjectWallGeometry() {
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

  // Forma 'single' (o caso de sempre) continua chamando renderFreeform tal
  // e qual — zero risco de regressão pro fluxo já existente. Só forma
  // dupla/C-U (2-3 paredes) passa pelo caminho novo (renderFreeformWalls,
  // ver viewer3d_composition.js).
  if (getProjectWallCount() <= 1) {
    const assemblies = buildProjectAssemblies(projectSlots);
    ViewerProject.renderFreeform(assemblies, getProjectWallWidthMm() / 1000, viewerRoomEnvConfig());
  } else {
    const wallsData = getProjectWallGeometry().map((wall) => ({
      ...wall,
      assemblies: buildProjectAssemblies(projectSlotsOnWall(wall.wallIndex))
    }));
    ViewerProject.renderFreeformWalls(wallsData, viewerRoomEnvConfig());
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

// Mostra o botão de teste só em Android — em qualquer outro aparelho o
// Scene Viewer não existe, melhor nem oferecer um botão que não vai funcionar.
(function initArTestVisibility() {
  const wrap = document.getElementById('po-proj-ar-test-wrap');
  if (wrap && isAndroidBrowser()) wrap.style.display = '';
})();

async function generateArGlbForProject() {
  const statusEl = document.getElementById('po-proj-ar-test-status');
  const btn = document.getElementById('po-proj-test-ar-btn');
  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  if (!ViewerProject || !ViewerProject.getScene || typeof THREE === 'undefined' || !THREE.GLTFExporter) {
    setStatus('3D não disponível — gere o "Visualizar 3D" primeiro.');
    return;
  }
  const scene = ViewerProject.getScene();
  if (!scene) {
    setStatus('Nenhuma cena 3D montada ainda — clique em "Visualizar 3D" antes.');
    return;
  }

  if (btn) btn.disabled = true;
  setStatus('Gerando modelo 3D (.glb)...');

  try {
    const arrayBuffer = await new Promise((resolve, reject) => {
      const exporter = new THREE.GLTFExporter();
      exporter.parse(scene, resolve, { binary: true }, reject);
    });
    const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });

    setStatus('Enviando pro servidor...');
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
      `&mode=ar_preferred&title=${encodeURIComponent('Legno — teste AR')}` +
      `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
      `action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(publicUrl)};end;`;

    // Link clicável ANTES de tentar o redirect automático — o upload acima
    // teve um await no meio (rede), então o navegador pode já não considerar
    // isto "resposta direta a um clique" e bloquear a navegação automática
    // pro intent://. Com o link na tela, Matt sempre consegue abrir na mão
    // mesmo se o redirect automático falhar silenciosamente.
    if (statusEl) {
      statusEl.innerHTML = `Modelo pronto. <a href="${sceneViewerUrl}">Abrir em AR</a> (se não abrir sozinho, toque no link).`;
    }
    window.location.href = sceneViewerUrl;
  } catch (err) {
    console.error('generateArGlbForProject', err);
    setStatus(`Erro ao gerar AR: ${(err && err.message) || err}`);
  } finally {
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
  project3DLastFitKey = null; // força reenquadrar a câmera 3D no próximo render (ver comentário na declaração)
  renderProjectCanvas();
  projectDirty = false; // ambiente esvaziado de propósito, não é uma alteração pendente de salvar
}
const projResetBtn = document.getElementById('po-proj-reset-btn');
if (projResetBtn) projResetBtn.addEventListener('click', resetProject);

// Alternância Frontal/Superior (pedido do usuário, 2026-07-24) — só troca
// projectViewMode e reaproveita renderProjectCanvas pra redesenhar (mesmo
// padrão do toggle Grade/Lista do Passo 1).
const projViewFrontBtn = document.getElementById('po-proj-view-front-btn');
const projViewTopBtn = document.getElementById('po-proj-view-top-btn');
function setProjectViewMode(mode) {
  projectViewMode = mode;
  if (projViewFrontBtn) projViewFrontBtn.classList.toggle('active', mode === 'front');
  if (projViewTopBtn) projViewTopBtn.classList.toggle('active', mode === 'top');
  renderProjectCanvas();
}
if (projViewFrontBtn) projViewFrontBtn.addEventListener('click', () => setProjectViewMode('front'));
if (projViewTopBtn) projViewTopBtn.addEventListener('click', () => setProjectViewMode('top'));

// ---------- PROJETOS SALVOS (migration 056) ----------
// Mesmo espírito de "Composições favoritas" (ver bloco perto de
// saveCompositionFavorite acima), mas numa tabela própria (user_projects) —
// projectSlots tem formato diferente (x_mm/z_order livres, sem stack_on_id)
// + existe um dado a mais que a Composição não tem (wall_width_mm, a
// largura do ambiente).

let loadedProjectFavorite = null; // { id, name } quando o projeto em edição veio de um projeto salvo

function serializeProjectSlots() {
  return projectSlots.map((slot) => ({
    id: slot.id,
    wall_index: Number(slot.wall_index || 0),
    x_mm: Number(slot.x_mm || 0),
    floor_height_mm: Number(slot.floor_height_mm || 0),
    z_order: Number(slot.z_order || 0),
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
    thumbnail_data_url: slot.thumbnail_data_url || null
  }));
}

function refreshProjectFavoriteButtons() {
  const updateBtn = document.getElementById('po-proj-update-fav-btn');
  if (!updateBtn) return;
  if (loadedProjectFavorite) {
    updateBtn.textContent = I18n.t('fav.update_btn', { name: loadedProjectFavorite.name });
    updateBtn.style.display = 'inline-block';
  } else {
    updateBtn.style.display = 'none';
  }
}

async function saveProjectFavorite(overwriteId) {
  const statusEl = document.getElementById('po-proj-fav-status');
  const errorEl = document.getElementById('po-proj-error');
  errorEl.style.display = 'none';
  statusEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = I18n.t('fav.need_login');
    errorEl.style.display = 'block';
    return;
  }
  if (projectSlots.length === 0) {
    errorEl.textContent = I18n.t('project.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  try {
    // wall_width_mm (coluna antiga, só 1 número) continua gravada com a
    // largura da parede 'main' pra qualquer projeto salvo antes desta
    // funcionalidade que ainda dependa dela — wall_shape/wall_widths_mm
    // (migration 058) é quem manda de verdade a partir de agora.
    const mainWidthMm = getProjectWallWidthMm(Math.max(getProjectWallRoles().indexOf('main'), 0));
    if (overwriteId) {
      const { error } = await supabaseClient
        .from('user_projects')
        .update({
          slots: serializeProjectSlots(),
          wall_width_mm: mainWidthMm,
          wall_shape: projectWallShape,
          wall_widths_mm: projectWallWidthsMm,
          updated_at: new Date().toISOString()
        })
        .eq('id', overwriteId);
      if (error) throw error;
      statusEl.textContent = I18n.t('project.updated_status', { name: loadedProjectFavorite ? loadedProjectFavorite.name : '' });
    } else {
      const name = (prompt(I18n.t('project.name_prompt'), I18n.t('project.default_name')) || '').trim();
      if (!name) return;
      const { data, error } = await supabaseClient
        .from('user_projects')
        .insert({
          client_user_id: currentUser.id, name,
          slots: serializeProjectSlots(),
          wall_width_mm: mainWidthMm,
          wall_shape: projectWallShape,
          wall_widths_mm: projectWallWidthsMm
        })
        .select('id, name')
        .single();
      if (error) throw error;
      loadedProjectFavorite = { id: data.id, name: data.name };
      statusEl.textContent = I18n.t('project.saved_status');
    }
    refreshProjectFavoriteButtons();
    projectDirty = false; // acabou de salvar — pedido do usuário 2026-07-29 ("preciso... uma mensagem salvar alteracoes")
    setTimeout(() => { statusEl.textContent = ''; }, 4000);
  } catch (err) {
    errorEl.textContent = err.message || String(err);
    errorEl.style.display = 'block';
  }
}

const projSaveFavBtn = document.getElementById('po-proj-save-fav-btn');
if (projSaveFavBtn) projSaveFavBtn.addEventListener('click', () => saveProjectFavorite(null));
const projUpdateFavBtn = document.getElementById('po-proj-update-fav-btn');
if (projUpdateFavBtn) {
  projUpdateFavBtn.addEventListener('click', () => {
    if (loadedProjectFavorite) saveProjectFavorite(loadedProjectFavorite.id);
  });
}

async function loadProjectFavoritesList() {
  const listEl = document.getElementById('po-proj-fav-list');
  const errorEl = document.getElementById('po-proj-fav-error');
  if (!listEl) return;
  errorEl.style.display = 'none';
  listEl.innerHTML = '';
  const { data, error } = await supabaseClient
    .from('user_projects')
    .select('id, name, slots, wall_width_mm, wall_shape, wall_widths_mm, updated_at')
    .order('updated_at', { ascending: false });
  if (error) { errorEl.textContent = error.message; errorEl.style.display = 'block'; return; }
  if (!data || data.length === 0) {
    listEl.innerHTML = `<p class="hint">${I18n.t('project.saved_list_empty')}</p>`;
    return;
  }
  data.forEach((proj) => {
    const card = document.createElement('div');
    card.className = 'panel';
    card.style.marginTop = '10px';
    const slots = Array.isArray(proj.slots) ? proj.slots : [];
    const thumbs = slots
      .filter((s) => s.thumbnail_data_url)
      .map((s) => `<img src="${s.thumbnail_data_url}" alt="" style="height:64px;margin-right:4px;" />`)
      .join('');
    const dateStr = proj.updated_at ? new Date(proj.updated_at).toLocaleString() : '—';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div>
          <strong class="po-proj-fav-name"></strong>
          <div class="hint">${I18n.t('fav.modules_label', { n: slots.length })} · ${I18n.t('project.updated_label', { date: dateStr })}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button type="button" class="po-proj-fav-load">${I18n.t('project.load_btn')}</button>
          <button type="button" class="secondary po-proj-fav-rename" style="margin-top:0;">${I18n.t('fav.rename_btn')}</button>
          <button type="button" class="secondary po-proj-fav-delete" style="margin-top:0;">${I18n.t('fav.delete_btn')}</button>
        </div>
      </div>
      ${thumbs ? `<div style="margin-top:8px;">${thumbs}</div>` : ''}
    `;
    card.querySelector('.po-proj-fav-name').textContent = proj.name; // textContent: nome é texto livre do cliente
    card.querySelector('.po-proj-fav-load').addEventListener('click', () => restoreFavoriteProject(proj));
    card.querySelector('.po-proj-fav-rename').addEventListener('click', async () => {
      const newName = (prompt(I18n.t('project.name_prompt'), proj.name) || '').trim();
      if (!newName || newName === proj.name) return;
      const { error: renameErr } = await supabaseClient
        .from('user_projects')
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', proj.id);
      if (renameErr) { errorEl.textContent = renameErr.message; errorEl.style.display = 'block'; return; }
      if (loadedProjectFavorite && loadedProjectFavorite.id === proj.id) { loadedProjectFavorite.name = newName; refreshProjectFavoriteButtons(); }
      loadProjectFavoritesList();
    });
    card.querySelector('.po-proj-fav-delete').addEventListener('click', async () => {
      if (!confirm(I18n.t('project.delete_confirm', { name: proj.name }))) return;
      const { error: delErr } = await supabaseClient.from('user_projects').delete().eq('id', proj.id);
      if (delErr) { errorEl.textContent = delErr.message; errorEl.style.display = 'block'; return; }
      if (loadedProjectFavorite && loadedProjectFavorite.id === proj.id) { loadedProjectFavorite = null; refreshProjectFavoriteButtons(); }
      loadProjectFavoritesList();
    });
    listEl.appendChild(card);
  });
}

// Toggle antigo (po-proj-fav-list-toggle-btn/po-proj-fav-list-wrap) foi
// REMOVIDO do HTML — a lista agora vive na aba própria "Meus Projetos"
// (po-tab-my-projects, carregada no listener de troca de aba, ver
// 'po-tab-my-projects' perto do fim deste arquivo). loadProjectFavoritesList
// continua igual, só passou a escrever direto em po-proj-fav-list (mesmo id,
// só mudou de aba-pai).

// Reconstrói projectSlots a partir da configuração salva (ver
// restoreFavoriteComposition acima pro mesmo raciocínio linha a linha, não
// repetido aqui) — as diferenças: x_mm/z_order em vez de stack_on_id,
// wall_width_mm próprio (ver setProjectWallWidthMm), e cada slot precisa de
// colorOptionsByRole recarregado (loadModuleColors) pra alimentar o painel
// de swatch inline (renderProjectConfigPanel) — a Composição não tem esse
// painel inline, só o configurador completo, então não precisa disso.
async function restoreFavoriteProject(fav, bindAsFavorite = true) {
  const errorEl = document.getElementById('po-proj-fav-error') || document.getElementById('po-proj-error');
  if (errorEl) errorEl.style.display = 'none';
  try {
    // Corrida no login: allModules só fica pronto depois de um showLoggedIn()
    // assíncrono (loadColorRoles → ... → loadModules, no fim da cadeia — ver
    // showLoggedIn). Clicar "Carregar no Projeto" rápido demais (ex.: acabou
    // de logar/recarregar a página) pega allModules ainda vazio ([]) — e
    // TODO módulo salvo é pulado por engano (.find nunca acha nada num
    // array vazio), mesmo o módulo existindo de verdade no catálogo. Isso
    // bate exatamente com o relato do usuário: "6 de 6" pulados, 100% —
    // sinal de allModules vazio, não de módulo realmente apagado.
    if (!allModules.length) await loadModules();
    const slotConfigs = Array.isArray(fav.slots) ? fav.slots : [];

    const pieceColorOverrideColorIds = slotConfigs.flatMap((s) =>
      Object.values(s.piece_color_overrides || {}).flatMap((perRole) => Object.values(perRole).map((e) => e.color_id))
    );
    const colorIds = [...new Set(
      slotConfigs.flatMap((s) => (s.selected_colors || []).map((c) => c.color_id))
        .concat(pieceColorOverrideColorIds)
        .filter(Boolean)
    )];
    const hingeIds = [...new Set(slotConfigs.map((s) => s.hinge_model_id).filter(Boolean))];
    const slideIds = [...new Set(slotConfigs.map((s) => s.slide_model_id).filter(Boolean))];
    const [colorsRes, hingeRes, slideRes] = await Promise.all([
      colorIds.length ? supabaseClient.from('colors').select('*').in('id', colorIds) : { data: [] },
      hingeIds.length ? supabaseClient.from('hinge_models').select('*').in('id', hingeIds) : { data: [] },
      slideIds.length ? supabaseClient.from('slide_models').select('*').in('id', slideIds) : { data: [] }
    ]);
    const colorById = new Map((colorsRes.data || []).map((c) => [c.id, c]));
    const hingeById = new Map((hingeRes.data || []).map((h) => [h.id, h]));
    const slideById = new Map((slideRes.data || []).map((s) => [s.id, s]));

    const restored = [];
    let skipped = 0;
    // Sequencial (não Promise.all) de propósito: loadModuleColors mexe no
    // global moduleColorsByRole — chamadas concorrentes se sobrescreveriam.
    for (const cfg of slotConfigs) {
      const module = allModules.find((m) => m.id === cfg.module_id);
      if (!module) { skipped += 1; continue; }
      const piecesList = await loadRecursivePiecesForModule(module.id);
      if (!piecesList || piecesList.length === 0) { skipped += 1; continue; }
      const optionalIds = cfg.selected_optional_ids || [];
      const effectivePieces = piecesList.filter((p) => !p.client_optional || optionalIds.includes(p.id));
      await loadModuleColors(module.id); // preenche o global moduleColorsByRole pra ESTE módulo — precisa vir ANTES do fallback abaixo
      // Valores de largura/altura TRAVADOS (module.width_locked/height_locked)
      // — precisa buscar de novo aqui (o slot restaurado é um objeto NOVO,
      // não carrega nada do que insertProjectModuleDefault já tinha buscado
      // da 1ª vez) pras setinhas de esticar do canvas funcionarem também num
      // projeto salvo recarregado (pedido do usuário 2026-07-26, ver
      // widthPresetsMm/heightPresetsMm no slot).
      const lockedDimensionPresets = await fetchModuleLockedDimensionPresets(module.id);
      const selectedColorsResolved = [...(cfg.selected_colors || [])];
      const colorsByRole = {};
      selectedColorsResolved.forEach((sc) => {
        const color = colorById.get(sc.color_id);
        if (color) colorsByRole[sc.role_id] = color;
      });
      // Autocura (2026-07-21) — projetos salvos ANTES do fix de
      // insertProjectModuleDefault (clicar na biblioteca insere direto)
      // gravaram selected_colors VAZIO mesmo com peça exigindo cor, e o
      // slot inteiro era pulado no restore ("Nenhuma cor selecionada para a
      // peça X", relatado pelo usuário — projeto "bed3"). Em vez de só
      // corrigir daqui pra frente, preenche aqui também qualquer papel de
      // cor que as peças REALMENTE usam (recursivo, ver
      // collectUsedColorRoleIds) mas que ficou faltando — com a 1ª opção
      // disponível do catálogo, mesmo critério de "cor padrão" que
      // insertProjectModuleDefault já usa pra módulo novo. Atualiza
      // selectedColorsResolved junto, pra "Salvar alterações" gravar o
      // preenchimento de volta e o projeto parar de precisar disso a cada load.
      collectUsedColorRoleIds(effectivePieces).forEach((roleId) => {
        if (colorsByRole[roleId]) return;
        const fallback = (moduleColorsByRole[roleId] || [])[0];
        if (!fallback) return;
        colorsByRole[roleId] = fallback;
        const idx = selectedColorsResolved.findIndex((sc) => sc.role_id === roleId);
        const entry = { role_id: roleId, role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null, color_id: fallback.id, color_name: fallback.name };
        if (idx >= 0) selectedColorsResolved[idx] = entry; else selectedColorsResolved.push(entry);
      });
      const hingeModel = cfg.hinge_model_id ? (hingeById.get(cfg.hinge_model_id) || null) : null;
      const slideModel = cfg.slide_model_id ? (slideById.get(cfg.slide_model_id) || null) : null;
      const pieceColorOverrides = {};
      Object.keys(cfg.piece_color_overrides || {}).forEach((pieceId) => {
        const perRole = cfg.piece_color_overrides[pieceId];
        const resolved = {};
        Object.keys(perRole).forEach((roleId) => {
          const color = colorById.get(perRole[roleId].color_id);
          if (color) resolved[roleId] = color;
        });
        if (Object.keys(resolved).length) pieceColorOverrides[pieceId] = resolved;
      });
      let result;
      try {
        result = module.is_decoration
          ? { total: 0, breakdown: [] }
          : Pricing.calculateModulePrice({
            module, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
            shelfQuantities: cfg.shelf_quantities || {}, dimOverrides: cfg.dim_overrides || {},
            pieceColorOverrides,
            width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
            markupMultiplier: pricingMarkupMultiplier
          });
      } catch (calcErr) { skipped += 1; continue; } // catálogo mudou e a config não fecha mais
      restored.push({
        id: cfg.id || newProjectSlotId(),
        wall_index: Number(cfg.wall_index || 0), // clampado mais abaixo, depois que a forma/parede é restaurada
        x_mm: Number(cfg.x_mm || 0),
        floor_height_mm: Number(cfg.floor_height_mm || 0),
        z_order: Number(cfg.z_order || 0),
        module,
        pieces: effectivePieces,
        colorOptionsByRole: moduleColorsByRole,
        colorsByRole,
        selectedColors: selectedColorsResolved,
        pieceColorOverrides,
        hingeModel, slideModel,
        width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
        shelfQuantities: cfg.shelf_quantities || {},
        dimOverrides: cfg.dim_overrides || {},
        selectedOptionalIds: optionalIds,
        result,
        thumbnail_data_url: cfg.thumbnail_data_url || null,
        widthPresetsMm: lockedDimensionPresets.width,
        heightPresetsMm: lockedDimensionPresets.height
      });
    }

    // Vai pra aba Projetos ANTES de atribuir os dados novos — o canvas
    // (renderProjectCanvas) mede o clientWidth do wrap pra calcular a escala
    // px/mm, e isso só funciona com display:block (mesmo motivo do
    // comentário em "if (btn.dataset.tab === 'po-tab-projects')" no listener
    // de troca de aba, mais abaixo neste arquivo).
    const projTabBtn = document.querySelector('#po-sidebar .portal-tab-btn[data-tab="po-tab-projects"]');
    if (projTabBtn) projTabBtn.click();

    // Forma/largura das paredes (migration 058) — projeto salvo ANTES desta
    // funcionalidade não tem wall_shape/wall_widths_mm, só o wall_width_mm
    // antigo (1 parede só): cai em 'single' com essa largura, mesmo
    // comportamento de sempre.
    const restoredShape = (fav.wall_shape && PROJECT_WALL_ROLES_BY_SHAPE[fav.wall_shape]) ? fav.wall_shape : 'single';
    const restoredRoleCount = PROJECT_WALL_ROLES_BY_SHAPE[restoredShape].length;
    let restoredWidths = Array.isArray(fav.wall_widths_mm) ? fav.wall_widths_mm.map((w) => Number(w) || PROJECT_WALL_WIDTH_DEFAULT_MM) : [];
    if (!restoredWidths.length) restoredWidths = [Number(fav.wall_width_mm) || PROJECT_WALL_WIDTH_DEFAULT_MM];
    while (restoredWidths.length < restoredRoleCount) restoredWidths.push(PROJECT_WALL_WIDTH_DEFAULT_MM);
    restoredWidths = restoredWidths.slice(0, restoredRoleCount).map((w) => clamp(w, PROJECT_WALL_WIDTH_MIN_MM, PROJECT_WALL_WIDTH_MAX_MM));

    projectWallShape = restoredShape;
    projectWallWidthsMm = restoredWidths;
    projectActiveWallIndex = Math.max(PROJECT_WALL_ROLES_BY_SHAPE[restoredShape].indexOf('main'), 0);
    persistProjectWallConfig();
    refreshProjectWallShapeButtons();
    refreshProjectWallTabs();

    // Só agora dá pra clampar wall_index com segurança (já sabemos quantas
    // paredes a forma restaurada tem) — módulo apontando pra uma parede que
    // não existe mais nessa forma (ex.: salvo em C/U, restaurado depois de
    // já ter voltado pra 'single' manualmente) cai na primeira.
    restored.forEach((slot) => {
      if (slot.wall_index < 0 || slot.wall_index >= restoredRoleCount) slot.wall_index = 0;
    });

    projectSlots = restored;
    selectedProjectSlotId = null;
    project3DLastFitKey = null; // projeto TROCOU inteiro — reenquadra a câmera 3D mesmo se a chave coincidir (ver comentário na declaração)
    refreshProjectWallWidthInput();
    loadedProjectFavorite = bindAsFavorite ? { id: fav.id, name: fav.name } : null;
    refreshProjectFavoriteButtons();
    renderProjectCanvas();
    projectDirty = false; // acabou de carregar do banco, nada pendente ainda

    const statusEl = document.getElementById('po-proj-fav-status');
    if (statusEl) {
      statusEl.textContent = I18n.t('project.loaded_status', { name: fav.name })
        + (skipped > 0 ? ' ' + I18n.t('project.load_partial', { n: skipped }) : '');
      setTimeout(() => { statusEl.textContent = ''; }, 6000);
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = I18n.t('project.load_error', { msg: err.message || String(err) });
      errorEl.style.display = 'block';
    }
  }
}

// ---------- GERAR IMAGEM COM IA + GALERIA PARA PROJETOS (migration 056) ----------
// Cópia adaptada do bloco da Composição (generateAiPreviewForGallery/
// publishCompositionToGallery e os helpers que eles chamam — ver comentários
// perto de cada um lá pro raciocínio completo, não repetido aqui) operando
// em cima de projectSlots/ViewerProject em vez de compositionSlots/
// ViewerComposition. gallery_posts ganha source_type='project' +
// wall_width_mm (migration 056) pra "Personalizar" saber reconstruir de
// volta na aba Projetos (ver restoreGalleryPostAsProject mais abaixo).

// Largura = a da PAREDE (getProjectWallWidthMm), não a soma dos módulos
// (teria vãos vazios contados errado) — equivalente a
// computeCompositionTotalsMm(), que soma colunas em vez disso.
function computeProjectTotalsMm() {
  if (projectSlots.length === 0) return null;
  let totalHeight = 0;
  let totalDepth = 0;
  projectSlots.forEach((s) => {
    totalHeight = Math.max(totalHeight, Number(s.floor_height_mm || 0) + Number(s.height_mm || 0));
    totalDepth = Math.max(totalDepth, Number(s.depth_mm || 0));
  });
  return { totalWidth: getProjectWallWidthMm(), totalHeight, totalDepth };
}

function aggregateColorsUsedForProject() {
  const byColorId = new Map();
  projectSlots.forEach((slot) => {
    (slot.selectedColors || []).forEach((c) => { if (c.color_id) byColorId.set(c.color_id, c); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.keys(perRole).forEach((roleId) => {
        const color = perRole[roleId];
        if (color && color.id && !byColorId.has(color.id)) {
          byColorId.set(color.id, { role_id: roleId, role_name: null, color_id: color.id, color_name: color.name });
        }
      });
    });
  });
  return [...byColorId.values()];
}

function aggregateColorsUsedPerModuleForProject() {
  const byModule = new Map(); // moduleName -> Map(colorId -> colorEntry)
  projectSlots.forEach((slot) => {
    const moduleName = (slot.module && slot.module.name) || '?';
    if (!byModule.has(moduleName)) byModule.set(moduleName, new Map());
    const colorMap = byModule.get(moduleName);
    (slot.selectedColors || []).forEach((c) => { if (c.color_id) colorMap.set(c.color_id, c); });
    Object.values(slot.pieceColorOverrides || {}).forEach((perRole) => {
      Object.keys(perRole).forEach((roleId) => {
        const color = perRole[roleId];
        if (color && color.id && !colorMap.has(color.id)) {
          colorMap.set(color.id, { role_id: roleId, role_name: null, color_id: color.id, color_name: color.name });
        }
      });
    });
  });
  return [...byModule.entries()].map(([moduleName, colorMap]) => ({ moduleName, colors: [...colorMap.values()] }));
}

async function buildColorDescriptionForProject() {
  const perModule = aggregateColorsUsedPerModuleForProject();
  if (!perModule.length) return null;
  const allColorIds = [...new Set(perModule.flatMap((m) => m.colors.map((c) => c.color_id)).filter(Boolean))];
  const hexByColorId = new Map();
  if (allColorIds.length) {
    try {
      const { data } = await supabaseClient.from('colors').select('id, swatch_hex').in('id', allColorIds);
      (data || []).forEach((c) => { if (c.swatch_hex) hexByColorId.set(c.id, c.swatch_hex); });
    } catch (err) { /* segue só com o nome, sem hex */ }
  }
  const moduleLabels = perModule
    .map(({ moduleName, colors }) => {
      const names = [...new Set(colors
        .map((c) => {
          if (!c.color_name) return null;
          const hex = hexByColorId.get(c.color_id);
          return hex ? `${c.color_name} (hex aproximado ${hex})` : c.color_name;
        })
        .filter(Boolean))];
      return names.length ? `${moduleName}: ${names.join(', ')}` : null;
    })
    .filter(Boolean);
  return moduleLabels.length ? moduleLabels.join('; ') : null;
}

const MAX_COLOR_REF_PHOTOS_PROJECT = 4;
async function buildColorReferencesForProject() {
  const perModule = aggregateColorsUsedPerModuleForProject();
  if (!perModule.length) return [];
  const colorIds = [...new Set(perModule.flatMap((m) => m.colors.map((c) => c.color_id)).filter(Boolean))];
  if (!colorIds.length) return [];
  const modulesByColorId = new Map();
  perModule.forEach(({ moduleName, colors }) => {
    colors.forEach((c) => {
      if (!c.color_id) return;
      if (!modulesByColorId.has(c.color_id)) modulesByColorId.set(c.color_id, new Set());
      modulesByColorId.get(c.color_id).add(moduleName);
    });
  });
  try {
    const { data } = await supabaseClient.from('colors').select('id, name, texture_url').in('id', colorIds);
    const withPhoto = (data || []).filter((c) => c.texture_url).slice(0, MAX_COLOR_REF_PHOTOS_PROJECT);
    const images = (await Promise.all(withPhoto.map(async (c) => {
      const rawDataUrl = await fetchUrlAsDataUrl(c.texture_url);
      if (!rawDataUrl) return null;
      const dataUrl = await toJpegDataUrl(rawDataUrl);
      const moduleNames = [...(modulesByColorId.get(c.id) || [])].join(', ');
      const label = moduleNames ? `${moduleNames}: ${c.name}` : c.name;
      return { label, dataUrl };
    }))).filter(Boolean);
    return images;
  } catch (err) {
    return [];
  }
}

const MAX_MODULE_REF_PHOTOS_PROJECT = 3;
async function fetchReferencePhotosForProject() {
  const moduleNameById = new Map();
  projectSlots.forEach((s) => { if (s.module && s.module.id) moduleNameById.set(s.module.id, s.module.name); });
  const moduleIds = [...moduleNameById.keys()];
  if (!moduleIds.length) return { moduleRefImages: [] };
  try {
    const { data } = await supabaseClient.from('reference_photos').select('id, module_id, photo_url').in('module_id', moduleIds);
    const firstPhotoByModule = new Map();
    (data || []).forEach((p) => { if (!firstPhotoByModule.has(p.module_id)) firstPhotoByModule.set(p.module_id, p.photo_url); });
    const chosen = [...firstPhotoByModule.entries()].slice(0, MAX_MODULE_REF_PHOTOS_PROJECT);
    const moduleRefImages = (await Promise.all(chosen.map(async ([moduleId, photoUrl]) => {
      const dataUrl = await fetchUrlAsDataUrl(photoUrl);
      return dataUrl ? { moduleName: moduleNameById.get(moduleId) || null, dataUrl } : null;
    }))).filter(Boolean);
    return { moduleRefImages };
  } catch (err) {
    return { moduleRefImages: [] };
  }
}

async function captureProjectAngleReferences() {
  if (!ViewerProject || !ViewerProject.snapshot) return [];
  const angles = [
    { angle: 'three_quarter', label: 'vista 3/4 (referência de geometria)' },
    { angle: 'side', label: 'vista lateral (referência de geometria)' }
  ];
  const images = [];
  for (const { angle, label } of angles) {
    const raw = ViewerProject.snapshot({ angle });
    if (!raw) continue;
    const trimmed = await trimTransparentPng(raw);
    if (trimmed) images.push({ label, dataUrl: trimmed });
  }
  return images;
}

// Versão "limpa" da cena do Projeto só pra tirar o(s) print(s) que viram
// base pra IA — mesmo princípio de renderCompositionForAiSnapshot (ver
// comentário lá). SEMPRE temporária: quem chamar isto tem que chamar
// generateProject3D() de novo depois, pra devolver a cena normal.
function renderProjectForAiSnapshot() {
  if (!ViewerProject || !ViewerProject.available()
    || typeof Viewer3D === 'undefined' || !Viewer3D.buildStandaloneAssembly) {
    return false;
  }
  const cleanSlots = projectSlots.filter((slot) => !(slot.module && slot.module.is_decoration));
  if (!cleanSlots.length) return false;
  const room = { ...viewerRoomEnvConfig(), minimal: true };
  ViewerProject.init('po-proj-3d-canvas');
  // Mesma ramificação single vs. dupla/C-U de generateProject3D (ver
  // comentário lá) — só muda a origem dos slots (cleanSlots, sem decoração).
  if (getProjectWallCount() <= 1) {
    const assemblies = buildProjectAssemblies(cleanSlots);
    ViewerProject.renderFreeform(assemblies, getProjectWallWidthMm() / 1000, room);
  } else {
    const wallsData = getProjectWallGeometry().map((wall) => ({
      ...wall,
      assemblies: buildProjectAssemblies(cleanSlots.filter((s) => Number(s.wall_index || 0) === wall.wallIndex))
    }));
    ViewerProject.renderFreeformWalls(wallsData, room);
  }
  return true;
}

let projectGalleryAiPreviewImage = null;
let projectGalleryAiPreviewStatus = null;

const projGalleryPublishToggleBtn = document.getElementById('po-proj-gallery-publish-toggle-btn');
if (projGalleryPublishToggleBtn) {
  projGalleryPublishToggleBtn.addEventListener('click', () => {
    const form = document.getElementById('po-proj-gallery-publish-form');
    if (!form) return;
    const isHidden = form.style.display === 'none';
    if (isHidden) {
      populateGalleryFamilySelect(document.getElementById('po-proj-gallery-room-type'), false);
      projectGalleryAiPreviewImage = null;
      projectGalleryAiPreviewStatus = null;
      document.getElementById('po-proj-gallery-ai-preview-wrap').style.display = 'none';
      const baseWrap = document.getElementById('po-proj-gallery-base-preview-wrap');
      if (baseWrap) baseWrap.style.display = 'none';
    }
    form.style.display = isHidden ? 'block' : 'none';
  });
}

async function generateAiPreviewForProjectGallery() {
  const btn = document.getElementById('po-proj-gallery-generate-ai-btn');
  const previewWrap = document.getElementById('po-proj-gallery-ai-preview-wrap');
  const previewImg = document.getElementById('po-proj-gallery-ai-preview-img');
  const previewHint = document.getElementById('po-proj-gallery-ai-preview-hint');
  const basePreviewWrap = document.getElementById('po-proj-gallery-base-preview-wrap');
  const basePreviewImg = document.getElementById('po-proj-gallery-base-preview-img');
  const errorEl = document.getElementById('po-proj-gallery-publish-error');
  errorEl.style.display = 'none';
  if (!projectSlots.length) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = I18n.t('gallery.generating_ai_status');
  const usedCleanScene = renderProjectForAiSnapshot();
  try {
    // 2+ paredes (L/C-U) usa angle:'corner' (pedido do usuário 2026-07-26:
    // "Imagem de IA 2 paredes ou 3 paredes, camera pegando as duas
    // paredes") — {frontal:true} é quase Z puro, pensado pra 1 parede só,
    // e cortava as laterais fora do print principal. Ver comentário grande
    // em snapshot()/lastFitDir (viewer3d_composition.js).
    const snapshotOptions = getProjectWallCount() > 1 ? { angle: 'corner' } : { frontal: true };
    const rawSnapshot = (ViewerProject && ViewerProject.snapshot) ? ViewerProject.snapshot(snapshotOptions) : null;
    const trimmedSnapshot = rawSnapshot ? await trimTransparentPng(rawSnapshot) : null;
    if (!trimmedSnapshot) {
      errorEl.textContent = I18n.t('gallery.generate_ai_no_3d_error');
      errorEl.style.display = 'block';
      return;
    }
    const roomFamilyId = document.getElementById('po-proj-gallery-room-type').value || null;
    const roomLabel = roomFamilyId ? galleryFamilyName(roomFamilyId) : null;
    const aspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));
    // Preenche a imagem ANTES de mandar pro Gemini, pra ela já sair
    // exatamente na proporção pedida acima (nunca corta/estica o projeto) —
    // ver padImageToAspectRatio, corrige o "muda o projeto pra caber".
    const sourceImageForAi = (await padImageToAspectRatio(trimmedSnapshot, aspectRatioLabelToValue(aspectRatio))) || trimmedSnapshot;

    if (basePreviewImg && basePreviewWrap) {
      basePreviewImg.src = sourceImageForAi;
      basePreviewWrap.style.display = 'block';
    }

    let imageDataUrl = sourceImageForAi;
    let renderStatus = 'failed';
    try {
      const angleRefImages = await captureProjectAngleReferences();
      const [{ moduleRefImages }, colorLabel, colorRefImages] = await Promise.all([
        fetchReferencePhotosForProject(),
        buildColorDescriptionForProject(),
        buildColorReferencesForProject()
      ]);
      const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
        body: { imageDataUrl: sourceImageForAi, moduleRefImages, colorLabel, colorRefImages, angleRefImages, roomLabel, aspectRatio }
      });
      if (!renderError && renderData && renderData.imageDataUrl) {
        imageDataUrl = renderData.imageDataUrl;
        renderStatus = 'ready';
      } else {
        console.error('generate-gallery-render falhou (projeto):', renderError, renderData);
        if (renderError && typeof renderError.context?.json === 'function') {
          renderError.context.json().then((body) => console.error('Corpo do erro:', body)).catch(() => {});
        }
      }
    } catch (aiErr) {
      console.error('generate-gallery-render: erro ao chamar a function (projeto):', aiErr);
    }

    projectGalleryAiPreviewImage = imageDataUrl;
    projectGalleryAiPreviewStatus = renderStatus;
    previewImg.src = imageDataUrl;
    previewHint.textContent = renderStatus === 'ready'
      ? I18n.t('gallery.generate_ai_ready_hint')
      : I18n.t('gallery.generate_ai_fallback_hint');
    previewWrap.style.display = 'block';
  } finally {
    if (usedCleanScene) generateProject3D();
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

const projGalleryGenerateAiBtn = document.getElementById('po-proj-gallery-generate-ai-btn');
if (projGalleryGenerateAiBtn) projGalleryGenerateAiBtn.addEventListener('click', generateAiPreviewForProjectGallery);

const projGalleryAiPreviewImgEl = document.getElementById('po-proj-gallery-ai-preview-img');
if (projGalleryAiPreviewImgEl) {
  projGalleryAiPreviewImgEl.addEventListener('click', () => {
    if (projGalleryAiPreviewImgEl.src) openGalleryLightbox(projGalleryAiPreviewImgEl.src);
  });
}
const projGalleryBasePreviewImgEl = document.getElementById('po-proj-gallery-base-preview-img');
if (projGalleryBasePreviewImgEl) {
  projGalleryBasePreviewImgEl.addEventListener('click', () => {
    if (projGalleryBasePreviewImgEl.src) openGalleryLightbox(projGalleryBasePreviewImgEl.src);
  });
}

// "⬇️ Baixar" / "↗️ Compartilhar" — mesma coisa da Composição (ver
// downloadGeneratedImage/shareGeneratedImage acima), só lendo
// projectGalleryAiPreviewImage em vez de galleryAiPreviewImage.
const projGalleryAiDownloadBtn = document.getElementById('po-proj-gallery-ai-download-btn');
if (projGalleryAiDownloadBtn) {
  projGalleryAiDownloadBtn.addEventListener('click', () => downloadGeneratedImage(projectGalleryAiPreviewImage, 'projeto'));
}
const projGalleryAiShareBtn = document.getElementById('po-proj-gallery-ai-share-btn');
if (projGalleryAiShareBtn) {
  projGalleryAiShareBtn.addEventListener('click', () => shareGeneratedImage(projectGalleryAiPreviewImage, 'projeto', document.getElementById('po-proj-gallery-ai-preview-hint')));
}

async function publishProjectToGallery() {
  const errorEl = document.getElementById('po-proj-gallery-publish-error');
  const statusEl = document.getElementById('po-proj-gallery-publish-status');
  errorEl.style.display = 'none';
  statusEl.textContent = '';
  if (!currentUser) {
    errorEl.textContent = I18n.t('fav.need_login');
    errorEl.style.display = 'block';
    return;
  }
  if (!projectSlots.length) {
    errorEl.textContent = I18n.t('fav.need_slots');
    errorEl.style.display = 'block';
    return;
  }
  const submitBtn = document.getElementById('po-proj-gallery-publish-submit-btn');
  submitBtn.disabled = true;
  try {
    let imageDataUrl;
    let renderStatus;
    if (projectGalleryAiPreviewImage) {
      imageDataUrl = projectGalleryAiPreviewImage;
      renderStatus = projectGalleryAiPreviewStatus;
    } else {
      const usedCleanSceneFallback = renderProjectForAiSnapshot();
      const rawSnapshot = (ViewerProject && ViewerProject.snapshot) ? ViewerProject.snapshot({ frontal: true }) : null;
      const trimmedSnapshot = rawSnapshot ? await trimTransparentPng(rawSnapshot) : null;
      imageDataUrl = trimmedSnapshot;
      renderStatus = trimmedSnapshot ? 'pending' : 'failed';
      if (trimmedSnapshot) {
        try {
          const fallbackFamilyId = document.getElementById('po-proj-gallery-room-type').value || null;
          const fallbackRoomLabel = fallbackFamilyId ? galleryFamilyName(fallbackFamilyId) : null;
          const fallbackAspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));
          // Mesma correção do preview: preenche pra bater exatamente a
          // proporção pedida ao Gemini antes de mandar (ver padImageToAspectRatio).
          const fallbackSourceImage = (await padImageToAspectRatio(trimmedSnapshot, aspectRatioLabelToValue(fallbackAspectRatio))) || trimmedSnapshot;
          imageDataUrl = fallbackSourceImage;
          const fallbackAngleRefImages = await captureProjectAngleReferences();
          const [{ moduleRefImages }, fallbackColorLabel, fallbackColorRefImages] = await Promise.all([
            fetchReferencePhotosForProject(),
            buildColorDescriptionForProject(),
            buildColorReferencesForProject()
          ]);
          const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
            body: { imageDataUrl: fallbackSourceImage, moduleRefImages, colorLabel: fallbackColorLabel, colorRefImages: fallbackColorRefImages, angleRefImages: fallbackAngleRefImages, roomLabel: fallbackRoomLabel, aspectRatio: fallbackAspectRatio }
          });
          if (!renderError && renderData && renderData.imageDataUrl) {
            imageDataUrl = renderData.imageDataUrl;
            renderStatus = 'ready';
          }
        } catch (aiErr) {
          // segue com o screenshot 3D mesmo (renderStatus continua 'pending')
        } finally {
          if (usedCleanSceneFallback) generateProject3D();
        }
      } else if (usedCleanSceneFallback) {
        generateProject3D();
      }
    }

    try {
      imageDataUrl = await uploadGalleryImageToStorage(imageDataUrl);
    } catch (uploadErr) {
      console.error('Falha ao subir imagem da Galeria pro Storage (projeto), mantendo base64:', uploadErr);
    }

    const totalsMm = computeProjectTotalsMm();
    const priceSale = projectSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.total) || 0), 0);
    const priceCost = projectSlots.reduce((sum, slot) => sum + Number((slot.result && slot.result.cost_total) || 0), 0);
    const isAnonymous = !!document.getElementById('po-proj-gallery-anonymous-chk').checked;
    const familyId = document.getElementById('po-proj-gallery-room-type').value || null;

    const payload = {
      author_user_id: currentUser.id,
      author_display_name: currentUser.email || null,
      is_anonymous: isAnonymous,
      status: 'pending',
      render_status: renderStatus,
      ai_image_data_url: imageDataUrl,
      composition_name: loadedProjectFavorite ? loadedProjectFavorite.name : null,
      family_id: familyId,
      source_type: 'project',
      // Sempre a largura da parede 'main' (não a da parede ativa no
      // momento de publicar) — gallery_posts só guarda 1 número (não passou
      // pela migration 058 de wall_shape/wall_widths_mm ainda), então isso é
      // só um resumo aproximado pra forma dupla/C-U (a peça "Personalizar"
      // de um post assim reabre em 'single', só com essa largura — gap
      // conhecido, não implementado).
      wall_width_mm: getProjectWallWidthMm(Math.max(getProjectWallRoles().indexOf('main'), 0)),
      total_width_mm: totalsMm ? totalsMm.totalWidth : null,
      total_height_mm: totalsMm ? totalsMm.totalHeight : null,
      total_depth_mm: totalsMm ? totalsMm.totalDepth : null,
      price_sale: priceSale,
      price_cost: priceCost,
      colors_used: aggregateColorsUsedForProject(),
      slots: serializeProjectSlots()
    };
    const { error } = await supabaseClient.from('gallery_posts').insert(payload);
    if (error) throw error;
    statusEl.textContent = I18n.t('gallery.publish_success');
    document.getElementById('po-proj-gallery-anonymous-chk').checked = false;
    projectGalleryAiPreviewImage = null;
    projectGalleryAiPreviewStatus = null;
    document.getElementById('po-proj-gallery-ai-preview-wrap').style.display = 'none';
    const baseWrapAfterPublish = document.getElementById('po-proj-gallery-base-preview-wrap');
    if (baseWrapAfterPublish) baseWrapAfterPublish.style.display = 'none';
    setTimeout(() => {
      statusEl.textContent = '';
      document.getElementById('po-proj-gallery-publish-form').style.display = 'none';
    }, 4000);
  } catch (err) {
    errorEl.textContent = err.message || String(err);
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
  }
}

const projGalleryPublishSubmitBtn = document.getElementById('po-proj-gallery-publish-submit-btn');
if (projGalleryPublishSubmitBtn) projGalleryPublishSubmitBtn.addEventListener('click', publishProjectToGallery);

// "Personalizar" num post de PROJETO (source_type='project') — mesma ideia
// de restoreGalleryPostAsComposition (ver acima), só que carrega em
// projectSlots (ver restoreFavoriteProject) + a largura do ambiente salva
// junto (post.wall_width_mm). id null: não existe (nem poderia, RLS
// owner-only) nenhuma user_projects correspondente a um post de outra
// pessoa.
function restoreGalleryPostAsProject(post) {
  restoreFavoriteProject({ id: null, name: post.composition_name || I18n.t('gallery.untitled'), slots: post.slots, wall_width_mm: post.wall_width_mm }, false);
}

// Despacha "Personalizar" pro restore certo conforme source_type do post
// (migration 056) — composição (coluna empilhada, sem largura de ambiente)
// ou projeto (módulos soltos, com wall_width_mm). Usada nos 3 pontos que
// abrem um post da Galeria fora da própria tela (card "Personalizar", link
// compartilhado ?galleryPost=, retomada de login pendente) — cada restore já
// troca de aba sozinho (Composição ou Projetos), então quem chama isto não
// precisa mais decidir a aba na mão.
function restoreGalleryPostBySourceType(post) {
  if (post && post.source_type === 'project') restoreGalleryPostAsProject(post);
  else restoreGalleryPostAsComposition(post);
}

// Delete/Backspace remove o módulo SELECIONADO do projeto (pedido do
// usuário, 2026-07-21: "clicando no modulo e delete ele deve ser deletado
// do projeto") — só age quando: a aba Projetos está visível, tem um módulo
// selecionado (ver selectProjectSlot) e o foco NÃO está num campo de texto
// (senão apagaria o módulo enquanto o cliente só queria apagar uma letra
// digitando a largura/nome de busca, etc.).
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
  if (!selectedProjectSlotId) return;
  const projectsTab = document.getElementById('po-tab-projects');
  if (!projectsTab || projectsTab.style.display === 'none') return;
  const active = document.activeElement;
  const tag = active && active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active && active.isContentEditable)) return;
  ev.preventDefault();
  removeProjectSlot(selectedProjectSlotId);
});

// ---------- Abas ----------

document.getElementById('po-sidebar').querySelectorAll('.portal-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    // Aviso de alterações não salvas (pedido do usuário 2026-07-29: "depois
    // que mudo a cor dos modulos ja inseridos no projeto ele nao salva essa
    // alteracao... preciso no botao voltar uma mensagem salvar alteracoes")
    // — Projetos SEMPRE foi só-salva-manual (troca de cor, mover, redimensionar,
    // forma da parede... nada disso grava sozinho, só o botão "Salvar
    // projeto"/"Salvar alterações", ver saveProjectFavorite); antes disso não
    // existia nenhum aviso ao sair da aba, então dava pra perder edição sem
    // perceber. projectDirty (ver markProjectDirty) fica true a partir da
    // primeira edição de verdade e só volta a false ao salvar/carregar um
    // projeto — checado aqui, ANTES de qualquer outra coisa no handler, pra
    // cancelar a troca de aba inteira se o cliente desistir no confirm().
    if (
      document.getElementById('po-tab-projects').style.display !== 'none' &&
      btn.dataset.tab !== 'po-tab-projects' &&
      projectDirty &&
      !confirm(I18n.t('project.unsaved_changes_confirm'))
    ) {
      return;
    }
    // Mesmo aviso, agora pra tela do pedido (ver orderDetailHasUnsavedChanges/
    // po-order-detail-back-btn acima) — trocar de aba pelo menu lateral
    // enquanto a tela do pedido está aberta é OUTRO jeito de "sair" dela além
    // do botão "Voltar", e tinha o mesmo buraco (perdia troca de cor em massa
    // pendente/quantidade digitada sem confirmar).
    if (
      document.getElementById('po-order-detail-section').style.display !== 'none' &&
      btn.dataset.tab !== 'po-tab-my-orders' &&
      orderDetailHasUnsavedChanges() &&
      !confirm(I18n.t('order_detail.unsaved_changes_confirm'))
    ) {
      return;
    }
    // Segurança: se o cliente clicar numa aba de verdade enquanto o modal de
    // "escolher módulo da composição" está aberto por cima (ver
    // startCompositionSlotConfig), fecha o modal primeiro — equivalente a
    // cancelar, evita addTargetSlotIndex ficar "preso" e o botão de
    // "Adicionar" com o texto errado na próxima vez.
    if (addTargetSlotIndex !== null) {
      exitCompositionSlotConfig();
    }
    // Mesma segurança acima, pro modal de "configurar módulo do Projeto"
    // (ver startProjectSlotConfig) — nunca fica setado ao mesmo tempo que
    // addTargetSlotIndex.
    if (addTargetProjectSlotId !== null) {
      exitProjectSlotConfig();
    }
    document.getElementById('po-sidebar').querySelectorAll('.portal-tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.portal-tab-page').forEach((page) => { page.style.display = 'none'; });
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.style.display = 'block';
    if (btn.dataset.tab === 'po-tab-projects') {
      // display:block já aplicado logo acima — canvas consegue medir
      // clientWidth do wrap agora pra calcular a escala px/mm (ver
      // renderProjectCanvas). Biblioteca reconstruída toda vez (barata,
      // allModules já está em memória) pra pegar módulo novo/alterado.
      renderProjectLibraryFilterBars();
      renderProjectLibrary();
      refreshProjectWallWidthInput();
      renderProjectCanvas();
    }
    if (btn.dataset.tab === 'po-tab-my-orders' && !myOrdersLoaded) {
      loadMyOrders();
    }
    // Recarrega a lista de módulos disponíveis pra colar na foto sempre que
    // a aba abre — o carrinho pode ter mudado desde a última visita.
    if (btn.dataset.tab === 'po-tab-room-view') {
      renderRoomCartPicker();
    }
    if (btn.dataset.tab === 'po-tab-composition') {
      renderCompositionSlots();
    }
    // Favoritos (migration 042) — recarrega a lista a cada visita (pode ter
    // salvo/renomeado/excluído desde a última vez).
    if (btn.dataset.tab === 'po-tab-favorites') {
      loadFavoritesList();
    }
    // Meus Projetos (pedido do usuário, 2026-07-24) — mesma ideia de
    // Favoritos: recarrega a cada visita (loadProjectFavoritesList já
    // existia, só rodava atrás do toggle antigo dentro da aba Projetos).
    if (btn.dataset.tab === 'po-tab-my-projects') {
      loadProjectFavoritesList();
    }
    // Galeria pública (migration 048) — recarrega a cada visita (outros
    // clientes podem ter publicado desde a última vez).
    if (btn.dataset.tab === 'po-tab-gallery') {
      loadGalleryList();
    }
    // Plano de Corte (migration 051) — carrega o catálogo de cores só na
    // primeira visita (cutlistInitialized), já parte com 1 linha vazia.
    if (btn.dataset.tab === 'po-tab-cutting-list') {
      initCuttingListTabIfNeeded();
    }
  });
});

// ---------- Autenticação ----------

// Guarda a composição que o VISITANTE tentou abrir/curtir sem estar logado
// — usada pra retomar a ação assim que o login (email/senha OU Google)
// terminar, em vez de simplesmente cair na tela normal sem contexto. Ver
// openAuthModal/resumePendingGalleryAction.
let pendingGalleryPostForAuth = null;

// Modal de login (pedido do usuário 2026-07-20: "deixa a pagina GALLERY
// publica... ao clicar customizar pedir login") — reaproveita o MESMO
// #po-auth-section de sempre (forms/ids intocados), só que agora abre por
// cima em vez de ser a única coisa na tela. `post` é opcional — quando
// existe, é a composição que o visitante estava tentando abrir (guardada
// em pendingGalleryPostForAuth pra retomar depois do login).
function openAuthModal(post) {
  pendingGalleryPostForAuth = post || null;
  document.getElementById('po-auth-section').classList.add('open');
  document.getElementById('po-login-error').style.display = 'none';
  document.getElementById('po-login-email').focus();
}

function closeAuthModal() {
  document.getElementById('po-auth-section').classList.remove('open');
}

// Chamada depois de login/cadastro bem-sucedido (email+senha OU Google via
// redirect, ver maybeOpenSharedGalleryPost/init) — se o visitante tinha
// clicado em "Customizar" numa composição específica antes de ser
// interrompido pelo login, abre ela agora em vez de só cair na tela normal.
function resumePendingGalleryAction() {
  if (!pendingGalleryPostForAuth) return;
  const post = pendingGalleryPostForAuth;
  pendingGalleryPostForAuth = null;
  restoreGalleryPostBySourceType(post);
}

function showLoggedOut() {
  currentUser = null;
  closeAuthModal();
  document.getElementById('po-content').style.display = 'block';
  document.getElementById('po-logout-btn').style.display = 'none';
  // Modo visitante (pedido do usuário: Galeria pública) — só a aba Galeria
  // fica acessível na navegação (ver CSS #po-sidebar.guest-mode); o resto
  // do app continua exigindo conta de verdade.
  const sidebar = document.getElementById('po-sidebar');
  if (sidebar) sidebar.classList.add('guest-mode');
  const guestLoginBtn = document.getElementById('po-guest-login-btn');
  if (guestLoginBtn) guestLoginBtn.style.display = 'inline-block';
  const userChip = document.getElementById('po-user-chip');
  if (userChip) userChip.style.display = 'none';
  // Nomes de família (usados em galleryFamilyName, pro filtro/legenda de
  // cada card) normalmente só carregavam em showLoggedIn — visitante
  // também precisa, senão o "Ambiente" do card fica em branco. Tabela
  // pública (sem dado sensível), então seguro tentar mesmo sem sessão; se
  // a RLS um dia mudar pra exigir login, isso só volta a ficar vazio (sem
  // travar nada, ver loadTaxonomyFilters).
  if (typeof loadTaxonomyFilters === 'function') loadTaxonomyFilters().catch(() => {});
  const galleryTabBtn = document.querySelector('#po-sidebar .portal-tab-btn[data-tab="po-tab-gallery"]');
  if (galleryTabBtn) galleryTabBtn.click();
}

async function showLoggedIn(user) {
  currentUser = user;
  closeAuthModal();
  document.getElementById('po-content').style.display = 'block';
  document.getElementById('po-logout-btn').style.display = 'inline-block';
  // Sai do modo visitante — nav completa de volta, chip de usuário no lugar
  // do botão "Entrar".
  const sidebar = document.getElementById('po-sidebar');
  if (sidebar) sidebar.classList.remove('guest-mode');
  const guestLoginBtn = document.getElementById('po-guest-login-btn');
  if (guestLoginBtn) guestLoginBtn.style.display = 'none';
  const userChip = document.getElementById('po-user-chip');
  if (userChip) userChip.style.display = 'flex';
  // Chip de usuário no nav superior (reskin 2026-07-09) — só exibe o e-mail
  // da sessão logada, não há tabela de perfil/nome cadastrado pra puxar daqui.
  const userNameEl = document.getElementById('po-user-name');
  const userAvatarEl = document.getElementById('po-user-avatar');
  if (userNameEl) userNameEl.textContent = user.email || 'Minha conta';
  if (userAvatarEl) userAvatarEl.textContent = (user.email || '?').charAt(0).toUpperCase();
  myOrdersLoaded = false;
  currentDraftOrderId = null;
  cartItems = [];
  await loadColorRoles();
  await loadPricingMarkup();
  // Perfil (migration 051) — decide se a aba "Plano de Corte" aparece
  // (só Contractor/Administrador). Precisa vir antes de
  // applyCuttingListTabVisibility, e a config de preço do plano de corte
  // pode carregar em paralelo (não bloqueia o resto do login).
  await ensureOwnUserProfile();
  applyCuttingListTabVisibility();
  loadCuttingListPricingSettings();
  await loadTaxonomyFilters();
  await loadModules();
  await loadDraftOrderIfAny();
}

document.getElementById('po-show-signup').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('po-login-block').style.display = 'none';
  document.getElementById('po-signup-block').style.display = 'block';
});
document.getElementById('po-show-login').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('po-signup-block').style.display = 'none';
  document.getElementById('po-login-block').style.display = 'block';
});

document.getElementById('po-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('po-login-error');
  errorEl.style.display = 'none';
  const email = document.getElementById('po-login-email').value.trim();
  const password = document.getElementById('po-login-password').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }
  await showLoggedIn(data.user);
  await maybeOpenSharedGalleryPost();
  resumePendingGalleryAction();
});

// Fechar o modal de login: botão X, clicar no fundo escuro, ou Esc — igual
// ao padrão já usado no lightbox da galeria (openGalleryLightbox). Guest
// pode desistir e continuar navegando a Galeria sem logar.
document.getElementById('po-auth-modal-close').addEventListener('click', () => { pendingGalleryPostForAuth = null; closeAuthModal(); });
document.getElementById('po-auth-section').addEventListener('click', (ev) => {
  if (ev.target.id === 'po-auth-section') { pendingGalleryPostForAuth = null; closeAuthModal(); }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.getElementById('po-auth-section').classList.contains('open')) {
    pendingGalleryPostForAuth = null;
    closeAuthModal();
  }
});

// Botão "Entrar" do topo (visitante, modo guest) — abre o modal sem
// composição pendente nenhuma (é só o cliente pedindo pra entrar direto,
// não uma ação interrompida).
const guestLoginBtnEl = document.getElementById('po-guest-login-btn');
if (guestLoginBtnEl) guestLoginBtnEl.addEventListener('click', () => openAuthModal(null));

// Login com Google (pedido do usuário 2026-07-20: "faz ligar com google da
// pessoa pra ser rapido") — supabaseClient.auth.signInWithOAuth manda a
// pessoa pro Google e VOLTA pra esta mesma URL (redirectTo). Se tinha uma
// composição pendente (pendingGalleryPostForAuth), embute ?galleryPost=<id>
// no redirect — maybeOpenSharedGalleryPost() já roda no init() assim que a
// sessão voltar, então reabre a composição certa sozinho, sem precisar de
// nenhum código extra pra esse caminho (diferente do login por senha, que
// não recarrega a página e por isso chama resumePendingGalleryAction()
// direto). Só funciona depois do Matt configurar o provider Google no
// painel do Supabase (Authentication > Providers) + OAuth client no Google
// Cloud Console — sem isso, o Supabase devolve um erro claro (mostrado
// em po-login-error), não trava nada.
document.getElementById('po-google-login-btn').addEventListener('click', async () => {
  const errorEl = document.getElementById('po-login-error');
  errorEl.style.display = 'none';
  const basePath = `${window.location.origin}${window.location.pathname}`;
  const redirectTo = pendingGalleryPostForAuth ? `${basePath}?galleryPost=${pendingGalleryPostForAuth.id}` : basePath;
  const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('po-signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('po-signup-error');
  const successEl = document.getElementById('po-signup-success');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';
  const name = document.getElementById('po-signup-name').value.trim();
  const phone = document.getElementById('po-signup-phone').value.trim();
  const email = document.getElementById('po-signup-email').value.trim();
  const password = document.getElementById('po-signup-password').value;
  const { data, error } = await supabaseClient.auth.signUp({
    email, password,
    options: { data: { name, phone } }
  });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }
  // Se o projeto Supabase exige confirmação de e-mail, não há sessão ainda
  // — pede pra checar o e-mail e ir pra tela de login depois de confirmar.
  if (data.session) {
    await showLoggedIn(data.user);
    resumePendingGalleryAction();
  } else {
    successEl.textContent = I18n.t('auth.signup_success');
    successEl.style.display = 'block';
    document.getElementById('po-signup-form').reset();
  }
});

document.getElementById('po-logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showLoggedOut();
});

// Balão de info da peça (duplo-clique no 3D) — mesma lógica de client.js,
// só que lendo a unidade e escrevendo no tooltip com prefixo "po-" (ver
// portal.html). Mostra nome/referência, L/A/P e cor — nunca preço.
function showPieceInfoTooltip(info, clientX, clientY) {
  const tooltip = document.getElementById('po-piece-info-tooltip');
  if (!tooltip) return;
  const unitSelect = document.getElementById('po-unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';
  const dims = `${I18n.t('dims.width_abbrev')} ${formatDimension(info.width_mm, unit)} × ${I18n.t('dims.height_abbrev')} ${formatDimension(info.height_mm, unit)} × ${I18n.t('dims.depth_abbrev')} ${formatDimension(info.depth_mm, unit)}`;
  tooltip.innerHTML = `
    <button type="button" class="piece-info-close" aria-label="${I18n.t('tooltip.close_label')}">&times;</button>
    <strong>${info.reference || I18n.t('tooltip.piece_fallback')}</strong>
    <div>${dims}</div>
    ${info.color_name ? `<div>${info.color_name}</div>` : ''}
  `;
  tooltip.style.display = 'block';
  positionPieceInfoTooltip(tooltip, clientX, clientY);
  const closeBtn = tooltip.querySelector('.piece-info-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { tooltip.style.display = 'none'; });
}

function positionPieceInfoTooltip(tooltip, clientX, clientY) {
  const rect = tooltip.getBoundingClientRect();
  let left = clientX + 14;
  let top = clientY + 14;
  if (left + rect.width > window.innerWidth) left = clientX - rect.width - 14;
  if (top + rect.height > window.innerHeight) top = clientY - rect.height - 14;
  tooltip.style.left = Math.max(8, left) + 'px';
  tooltip.style.top = Math.max(8, top) + 'px';
}

document.addEventListener('click', (e) => {
  const tooltip = document.getElementById('po-piece-info-tooltip');
  if (tooltip && tooltip.style.display !== 'none' && !tooltip.contains(e.target)) {
    tooltip.style.display = 'none';
  }
});

// Re-renderiza o conteúdo montado dinamicamente em JS (galeria, carrinho,
// meus pedidos, slots de composição) sempre que o idioma muda — esses
// pedaços já chamam I18n.t() na hora de montar a string, então não têm
// data-i18n pra applyStaticTranslations() re-aplicar sozinha, e ficariam
// "congelados" no idioma antigo até o próximo re-render natural.
if (typeof I18n !== 'undefined' && I18n.onLanguageChange) {
  I18n.onLanguageChange(() => {
    if (typeof allModules !== 'undefined' && allModules.length) renderModuleGallery();
    renderCart();
    if (myOrdersLoaded) loadMyOrders();
    if (compositionSlots.length) renderCompositionSlots();
    // Rótulos das linhas do ambiente (Ceiling/altura máx) traduzidos.
    applyViewerRoomEnvironment();
  });
}

(async function init() {
  try {
    Viewer3D.init('po-viewer3d-canvas');
    Viewer3D.onPieceDoubleClick(showPieceInfoTooltip);
  } catch (err) {
    // Sem Three.js/WebGL o portal continua funcionando, só sem o 3D.
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await showLoggedIn(session.user);
    // Precisa vir DEPOIS de showLoggedIn (usa currentUser) — ver
    // maybeLoadGalleryPostForAdminEdit.
    await maybeLoadGalleryPostForAdminEdit();
    await maybeOpenSharedGalleryPost();
  } else {
    showLoggedOut();
  }

  supabaseClient.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') showLoggedOut();
  });
})();
// fim de portal.js
