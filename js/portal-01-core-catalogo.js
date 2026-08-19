// portal-01-core-catalogo.js — parte 1/9 de js/portal.js (dividido em 2026-08-19
// pra reduzir o tamanho do arquivo monolítico, pedido do Matt — "diminuir pra
// sermos mais eficientes"; ver memória "portal_js_monolito_performance" e
// "portal_js_split_2026_08_19"). Utilitários de dimensão/unidade/moeda +
// catálogo de módulos e o configurador da aba "Novo Pedido" (medidas, cores,
// peças opcionais, preço ao vivo).
//
// TODOS os 9 arquivos portal-0N-*.js compartilham o MESMO escopo global —
// são <script> comuns carregados em sequência no portal.html, não módulos ES.
// A ORDEM dos <script> importa: preserva exatamente a ordem em que este
// código existia dentro do portal.js original (não foi reorganizado, só
// cortado). NÃO mover trecho de um arquivo pro outro sem entender a ordem de
// carregamento — variável/função usada antes de ser definida quebra a tela.

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
// Margens NOMEADAS extras, vinculáveis por família/categoria (migration
// 070) — ver resolveMarkupMultiplierForModule abaixo. Carregado junto de
// pricingMarkupMultiplier (loadPricingMarkup), antes de loadTaxonomyFilters/
// loadModules — precisa estar pronto antes de qualquer calculateModulePrice.
let marginProfilesCache = [];
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

// MILÍMETRO QUEBRADO APARECE (2026-08-15). Era `Math.round(mm)`, que
// transformava 19,5 em "20 mm" na tela — a espessura nova da chapa ficava
// invisível e o Matt não tinha como conferir ("veja que as peças estão com
// 20mm"). Meio milímetro decide se a peça encaixa.
//
// Inteiro continua saindo inteiro ("761 mm", não "761.0 mm"): só quem tem
// casa decimal a mostra, então nada do que já estava certo fica mais
// poluído.
function formatMmSemPerder(mm) {
  const n = Number(mm) || 0;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}
function formatDimension(mm, unit) {
  switch (unit) {
    case 'cm': return `${(mm / 10).toFixed(1)} cm`;
    case 'm': return `${(mm / 1000).toFixed(3)} m`;
    case 'ft': return `${(mm / 304.8).toFixed(3)} ft`;
    case 'in': return mmToFractionalInches(mm);
    case 'mm':
    default: return `${formatMmSemPerder(mm)} mm`;
  }
}

function formatDimensionNumber(mm, unit) {
  switch (unit) {
    case 'cm': return (mm / 10).toFixed(1);
    case 'm': return (mm / 1000).toFixed(3);
    case 'ft': return (mm / 304.8).toFixed(3);
    case 'in': return mmToFractionalInches(mm).replace('"', '');
    case 'mm':
    default: return formatMmSemPerder(mm);   // ver formatDimension: 19,5 ≠ 20
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
  // Plano de Corte (migration 073, 2026-08-02) — Comprimento/Largura de cada
  // linha reformatam pra unidade nova (o valor em MM por trás não muda,
  // só o texto exibido/editável). Re-render completo (não só o cabeçalho)
  // porque o VALOR de cada <input> também precisa reformatar.
  if (typeof cutlistRows !== 'undefined' && cutlistRows.length) renderCutlistTable();
  else if (typeof updateCutlistUnitLabels === 'function') updateCutlistUnitLabels();
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
  roomSettingsSaveBtn.addEventListener('click', async () => {
    if (typeof refreshProjectWallWidthInput === 'function') refreshProjectWallWidthInput();
    if (typeof renderProjectCanvas === 'function') renderProjectCanvas();
    // Margem de revenda (migration 072) — persiste e já re-renderiza Galeria
    // e Meus Projetos pra refletir o novo valor sem precisar trocar de aba.
    await saveResaleMarginPct();
    // Re-renderiza Galeria (respeitando os filtros atuais) e Meus Projetos
    // pra refletir a nova margem sem precisar trocar de aba.
    if (typeof applyGalleryFilters === 'function') applyGalleryFilters();
    if (typeof loadProjectFavoritesList === 'function') loadProjectFavoritesList();
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
  container.appendChild(makePill('', I18n.t('project.filter_all')));
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
        width_mm, height_mm, depth_mm, markupMultiplier: resolveMarkupMultiplierForModule(m)
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

  // Catálogo de FURAÇÃO junto com o resto (2026-08-15). Ele alimenta a
  // contagem real de furos que o custo de furação usa — e estava sendo
  // carregado SÓ em hydrateProjectLayoutPieces, que roda ao restaurar um
  // projeto salvo. Projeto montado do zero na sessão nunca passava por lá:
  // a contagem vinha vazia, a furação caía no furos_equivalentes (zero na
  // linha flatbord) e o custo não mudava — foi o "não mudou" do Matt.
  //
  // Fire-and-forget: quando terminar, repreça o que já estiver na tela.
  // O reprice agora mora DENTRO de ensureProjectDrillingCatalog (ver lá): era
  // aqui e no hydrate, e nenhum dos dois cobria o caminho real.
  ensureProjectDrillingCatalog();
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

  /* Mão de obra por processo (migrations 090/091). O preço mora em labor_types e
     pricing_settings só aponta qual linha é qual processo — por isso a
     consulta extra. O portal não tem cache de labor_types (só as linhas que
     vêm junto de cada componente), então busca as quatro direto.
     Best-effort: banco sem a 090 devolve ids undefined, a consulta nem sai,
     os quatro ficam em zero e nada muda — nenhuma peça está marcada "por
     processo" antes de o Matt marcar. */
  try {
    const campos = ['labor_corte_peca_id', 'labor_corte_metro_id',
      'labor_fita_passada_id', 'labor_fita_metro_id',
      'labor_furacao_peca_id', 'labor_furacao_furo_id',
      'labor_usinagem_peca_id', 'labor_usinagem_metro_id'];
    const ids = campos.map((k) => data[k]).filter(Boolean);
    if (ids.length && Pricing.setProcessLabor) {
      const { data: labs } = await supabaseClient
        .from('labor_types').select('id, price_per_unit').in('id', ids);
      const preco = (id) => {
        const l = (labs || []).find((x) => x.id === id);
        return l ? Number(l.price_per_unit) || 0 : 0;
      };
      Pricing.setProcessLabor({
        // corte_m2: o id no banco continua sendo labor_corte_metro_id (não
        // vale migration só pra renomear coluna), mas o SENTIDO mudou em
        // 2026-08-15 — o preço agora é por m² da peça, não por metro de
        // perímetro. Reajuste o valor no catálogo ao migrar.
        corte_peca: preco(data.labor_corte_peca_id), corte_m2: preco(data.labor_corte_metro_id),
        fita_passada: preco(data.labor_fita_passada_id), fita_metro: preco(data.labor_fita_metro_id),
        furacao_peca: preco(data.labor_furacao_peca_id), furacao_furo: preco(data.labor_furacao_furo_id),
        usinagem_peca: preco(data.labor_usinagem_peca_id), usinagem_metro: preco(data.labor_usinagem_metro_id)
      });
    }
  } catch (e) { console.warn('[labor por processo]', e); }
  // migration 061 — densidade pro cálculo de peso exibido ao cliente.
  const density = Number(data.weight_density_kg_per_m3);
  if (isFinite(density) && density > 0) materialDensityKgPerM3 = density;
  // migration 070 — margens nomeadas extras (família/categoria). Tabela pode
  // não existir ainda (Matt não rodou a migration) — erro aqui não deve
  // travar o resto do login, só deixa marginProfilesCache vazio (resolver
  // cai sempre no Padrão, comportamento de antes).
  try {
    const { data: profiles, error: profilesError } = await supabaseClient.from('margin_profiles').select('*');
    if (!profilesError && Array.isArray(profiles)) marginProfilesCache = profiles;
  } catch (e) { /* tabela ainda não existe — segue só com a margem Padrão */ }

  // Itens comprados (migration 119) — publica o catálogo no Pricing pra
  // qualquer lookup por purchased_item_id/attrs funcionar no PORTAL, não só
  // no "Teste de cálculo" do ERP (que publica via aplicarMargemDosComprados
  // em erp/js/adm/25-itens-comprados.js). 2026-08-18, Matt: "preciso colocar
  // as corredicas la nos itens comprados e puxar dependendo da profundidade
  // da gaveta" — sem isto, Pricing.pickDrawerSlidePurchasedItem nunca acha
  // nada no cliente, porque purchasedItemsById fica sempre {}.
  //
  // Best-effort igual margin_profiles acima: banco sem a migration 119
  // simplesmente não publica nada, e todo item comprado (inclusive o antigo
  // labor_type_id de components 'comprado') continua exatamente como hoje.
  //
  // De propósito NÃO publica setPurchasedMarkup/setPurchasedMarkupByProfile
  // aqui — isso reclassificaria margem de TODO comprado (pino, cavilha,
  // tambor, pé…) de uma vez, mudança maior que o pedido desta vez. Sem eles,
  // markupComprado() cai no markupMultiplier do módulo (a margem de sempre)
  // — ver calculateModulePrice.
  try {
    const { data: purchasedItems, error: purchasedError } = await supabaseClient.from('purchased_items').select('*');
    if (!purchasedError && Array.isArray(purchasedItems) && Pricing.setPurchasedItems) {
      const porId = {};
      purchasedItems.forEach((it) => { porId[it.id] = it; });
      Pricing.setPurchasedItems(porId);
    }
    // FERRAGEM DE MONTAGEM (minifix/cavilha/tambor/suporte, migration 119) —
    // 2026-08-18, Matt notou que sumiu do $ Fábrica. Causa: js/hardware.js
    // nunca carregava no portal (só no ERP) e ninguém publicava o catálogo
    // aqui — Hardware.consumoDoModulo ficava undefined/vazio pra sempre, sem
    // erro nenhum (ferragem só saía R$0, com cara de zero de verdade). Ver
    // recomputeProjectSlotPricing, que é quem CONSOME este catálogo — mesmo
    // padrão do purchasedItems acima: best-effort, banco sem a 119 = sem
    // ferragem calculada, comportamento de sempre.
    if (typeof Hardware !== 'undefined' && Hardware.setCatalog && Array.isArray(purchasedItems)) {
      const { data: hardwareRules, error: hwError } = await supabaseClient.from('hardware_rules').select('*');
      if (!hwError && Array.isArray(hardwareRules)) Hardware.setCatalog(purchasedItems, hardwareRules);
    }
  } catch (e) { /* tabela ainda não existe (migration 119 não rodou) — segue sem itens comprados */ }
}

// Margem efetiva de UM módulo (migration 070, pedido do usuário: "quero
// margens diferentes que eu possa aplicar pra modulos diferentes... na
// opcao da categoria ou familia") — CATEGORIA do módulo tem prioridade
// sobre FAMÍLIA (mais específico vence); nenhuma das duas com margem
// vinculada cai no Padrão (pricingMarkupMultiplier, comportamento de
// sempre). Duplicado em admin.js (resolveMarkupMultiplierForModule) — ver
// comentário lá, os dois arquivos não compartilham módulo/bundle.
function resolveMarkupMultiplierForModule(module) {
  if (!module) return pricingMarkupMultiplier;
  const category = module.category_id ? categoriesCacheList.find((c) => c.id === module.category_id) : null;
  if (category && category.margin_profile_id) {
    const profile = marginProfilesCache.find((p) => p.id === category.margin_profile_id);
    if (profile) return profile.markup_multiplier;
  }
  const family = module.family_id ? familiesCacheList.find((f) => f.id === module.family_id) : null;
  if (family && family.margin_profile_id) {
    const profile = marginProfilesCache.find((p) => p.id === family.margin_profile_id);
    if (profile) return profile.markup_multiplier;
  }
  return pricingMarkupMultiplier;
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
// collectUsedColorRoleIds mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

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
// loadRecursivePiecesForModule MUDOU DE CASA (2026-08-15): a cópia que ficava
// aqui foi para js/module-pieces.js, que agora é a ÚNICA. Estava duplicada em
// quatro arquivos e um campo novo esquecido numa delas fazia a peça sair SEM
// FURO, em silêncio. Coluna nova de module_components entra lá, uma vez só.

// Profundidades fixas cadastradas pra um módulo (module_fixed_depths) —
// generaliza o antigo drawer_type_depths: QUALQUER módulo usado como peça
// aninhada pode ter isso, não só um "modelo de gaveta" especial.
// fetchModuleFixedDepths mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

// Um módulo pode ter Largura/Altura/Profundidade "travadas" (migration 028 —
// module_dimension_presets + width_locked/height_locked/depth_locked). Isso
// se perdia quando o mesmo módulo era usado como PEÇA dentro de outro
// (child_module_id) — a fórmula (ex: depth_formula_override="D-20") sempre
// dava um valor contínuo. Busca aqui (só as dimensões travadas) pra
// resolvePiecesForViewer/Pricing.calculateAssembly arredondarem pro valor
// permitido mais próximo (Pricing.pickNearestPreset), igual já acontecia só
// com profundidade fixa de gaveta (module_fixed_depths/pickDrawerDepth).
// fetchModuleLockedDimensionPresets mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

// Um módulo aninhado pode já ter seu PRÓPRIO modelo de dobradiça/corrediça
// vinculado (module_hinge_models/module_slide_models DESSE módulo) — hardware
// FIXO da peça (ex: "Drawer Soft Closet" só existe com corrediça HAFELE
// undermount SOFT CLOSET). Pricing.calculateModulePiece usa isto como
// override do modelo escolhido pelo cliente no módulo raiz — evita exigir
// que o módulo pai também tenha um modelo vinculado só pra essa peça
// aninhada funcionar (ver client.js pro comentário completo). Se houver mais
// de um modelo ativo vinculado no filho, usa o primeiro (pensado pra
// hardware fixo, não pra escolha do cliente).
// fetchModuleOwnHingeAndSlideModels mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

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
// resolvePiecesForViewer mudou de casa (2026-08-15): agora vive em js/module-pieces.js,
// que e a UNICA copia. Estava duplicada em 3 arquivos — campo novo
// esquecido numa delas some em silencio (peca sem furo).

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
        pieceColorOverrides, width_mm, height_mm, depth_mm, markupMultiplier: resolveMarkupMultiplierForModule(currentModule)
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
