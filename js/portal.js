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
let cartItems = []; // espelha as linhas de order_items do pedido em andamento
let currentUser = null; // { id, email } da sessão logada

// ---------- Unidade de medida (idêntico ao client.js) ----------

const MM_PER_INCH = 25.4;

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

document.getElementById('po-unit-select').addEventListener('change', () => {
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
});

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
const CEILING_CLEARANCE_MM = 5 * MM_PER_INCH;        // afastamento mínimo móvel→teto

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
  return {
    ceiling_m: roomSettings.ceiling_mm / 1000,
    baseboard_h_m: roomSettings.baseboard_mm / 1000,
    ceilingLabel: I18n.t('comp3d.ceiling_line_label', { height: formatDimension(roomSettings.ceiling_mm, unit) }),
    maxHeightLabel: I18n.t('comp3d.max_height_label')
  };
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
  return Math.max(roomSettings.ceiling_mm - CEILING_CLEARANCE_MM - roomSettings.baseboard_mm - currentFloorHeightMm, 0);
}

// Reescreve os dois campos formatados na unidade global atual (não mexe no
// campo que o cliente está digitando agora).
function refreshRoomSettingsInputs() {
  const unit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  [['po-ceiling-input', roomSettings.ceiling_mm], ['po-baseboard-input', roomSettings.baseboard_mm]].forEach(([id, mm]) => {
    const input = document.getElementById(id);
    if (input && document.activeElement !== input) input.value = formatDimensionNumber(mm, unit);
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

[
  ['po-ceiling-input', 'ceiling_mm', 48 * MM_PER_INCH, 240 * MM_PER_INCH],
  ['po-baseboard-input', 'baseboard_mm', 0, 12 * MM_PER_INCH]
].forEach(([id, key, minMm, maxMm]) => {
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
    }
    refreshRoomSettingsInputs();
  });
});
refreshRoomSettingsInputs();

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
// ativa e o que roda ao trocar. Sempre inclui uma pill "Todas" no início.
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

  container.appendChild(makePill('', 'Todas'));
  items.forEach((item) => container.appendChild(makePill(item.id, item.name)));
}

async function loadTaxonomyFilters() {
  const [families, categories, subcategories] = await Promise.all([
    supabaseClient.from('families').select('*').eq('active', true).order('name'),
    supabaseClient.from('categories').select('*').eq('active', true).order('name'),
    supabaseClient.from('subcategories').select('*').eq('active', true).order('name')
  ]);
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
  const categoriesInScope = categoriesCacheList.filter((c) => allModules.some((m) =>
    m.category_id === c.id && (!selectedFamilyId || m.family_id === selectedFamilyId)
  ));
  // Se a categoria/subcategoria escolhida não existe mais nesse recorte
  // (ex: trocou de família), reseta pra "Todas" — senão a grade continuaria
  // filtrando por um id que nem aparece mais nos pills, parecendo travada.
  if (selectedCategoryId && !categoriesInScope.some((c) => c.id === selectedCategoryId)) {
    selectedCategoryId = '';
    selectedSubcategoryId = '';
  }
  const subcategoriesInScope = subcategoriesCacheList.filter((s) => allModules.some((m) =>
    m.subcategory_id === s.id
    && (!selectedFamilyId || m.family_id === selectedFamilyId)
    && (!selectedCategoryId || m.category_id === selectedCategoryId)
  ));
  if (selectedSubcategoryId && !subcategoriesInScope.some((s) => s.id === selectedSubcategoryId)) {
    selectedSubcategoryId = '';
  }

  renderTabBar('po-filter-family', familiesCacheList, selectedFamilyId, (id) => {
    selectedFamilyId = id;
    renderTaxonomyTabBars();
    renderModuleGallery();
  });
  renderTabBar('po-filter-category', categoriesInScope, selectedCategoryId, (id) => {
    selectedCategoryId = id;
    renderTaxonomyTabBars();
    renderModuleGallery();
  });
  renderTabBar('po-filter-subcategory', subcategoriesInScope, selectedSubcategoryId, (id) => {
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
    card.innerHTML = `
      <div class="po-module-card-image-wrap">${moduleCardImage(m)}</div>
      <div class="po-module-card-body">
        <div class="po-module-card-name">${m.name}</div>
        <div class="po-module-card-dims">${dimsLine}</div>
        ${decorBadge}
      </div>
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
  // Recalcula os pills de Categoria/Subcategoria agora que allModules existe
  // de verdade — loadTaxonomyFilters roda ANTES de loadModules (ver
  // showLoggedIn), então o primeiro renderTaxonomyTabBars ali não tinha
  // módulo nenhum pra escopar as categorias ainda.
  renderTaxonomyTabBars();
  renderModuleGallery();
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
  const { data, error } = await supabaseClient.from('pricing_settings').select('markup_multiplier').eq('id', true).single();
  if (error || !data) return;
  const value = Number(data.markup_multiplier);
  if (isFinite(value) && value > 0) pricingMarkupMultiplier = value;
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
    .select('id, component_id, child_module_id, quantity_override, sort_order, width_formula_override, height_formula_override, depth_formula_override, offset_x_mm, offset_y_mm, offset_z_mm, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, client_dimension_configurable, width_min_mm, width_default_mm, width_max_mm, height_min_mm, height_default_mm, height_max_mm, depth_min_mm, depth_default_mm, depth_max_mm, client_color_configurable, components(*, labor_types(*), component_types(*))')
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

  listEl.querySelectorAll('.portal-item-remove').forEach((btn) => {
    btn.addEventListener('click', () => removeCartItem(btn.dataset.itemId));
  });
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
        ${removeBtn}
      </div>
    </div>
  `;
}

async function ensureDraftOrder() {
  if (currentDraftOrderId) return currentDraftOrderId;
  const { data, error } = await supabaseClient
    .from('orders')
    .insert({
      client_user_id: currentUser.id,
      client_email: currentUser.email,
      status: 'draft',
      // Se o cliente já preencheu "Nome do cliente"/"Nome da PO" antes de
      // adicionar o primeiro módulo, o pedido já nasce com isso gravado —
      // senão fica em branco e saveOrderInfo() atualiza depois.
      client_name: document.getElementById('po-order-client-name').value.trim() || null,
      po_name: document.getElementById('po-order-po-name').value.trim() || null
    })
    .select()
    .single();
  if (error) throw error;
  currentDraftOrderId = data.id;
  return currentDraftOrderId;
}

// Salva "Nome do cliente" e "Nome da PO" assim que o cliente sai do campo —
// cria o pedido em rascunho na hora se ainda não existir (antes só nascia
// quando o primeiro módulo era adicionado ao carrinho), já que agora esses
// dados fazem parte do começo do fluxo, não só do envio final.
async function saveOrderInfo() {
  const client_name = document.getElementById('po-order-client-name').value.trim() || null;
  const po_name = document.getElementById('po-order-po-name').value.trim() || null;
  if (!client_name && !po_name && !currentDraftOrderId) return; // nada digitado ainda, não cria pedido à toa
  try {
    const orderId = await ensureDraftOrder();
    await supabaseClient.from('orders').update({ client_name, po_name }).eq('id', orderId);
  } catch (err) {
    // Não bloqueia o fluxo por causa disso — o cliente ainda consegue
    // configurar e adicionar módulos; só o nome/PO que pode não ter salvo.
  }
}

['po-order-client-name', 'po-order-po-name'].forEach((id) => {
  document.getElementById(id).addEventListener('blur', saveOrderInfo);
});

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

document.getElementById('po-submit-order-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('po-submit-order-status');
  const cartError = document.getElementById('po-cart-error');
  cartError.style.display = 'none';
  if (!currentDraftOrderId || cartItems.length === 0) {
    cartError.textContent = I18n.t('cart.need_module_error');
    cartError.style.display = 'block';
    return;
  }
  statusEl.textContent = I18n.t('cart.saving');
  try {
    const client_phone = document.getElementById('po-order-phone').value.trim();
    // O status no banco continua "submitted" (não é um "envio" de verdade —
    // é só o pedido saindo do rascunho pra lista de "Meus pedidos"), mas em
    // toda a interface isso agora é chamado de "salvar", não "enviar".
    const { error } = await supabaseClient
      .from('orders')
      .update({ status: 'submitted', submitted_at: new Date().toISOString(), client_phone })
      .eq('id', currentDraftOrderId);
    if (error) throw error;
    statusEl.textContent = I18n.t('cart.order_saved');
    currentDraftOrderId = null;
    cartItems = [];
    renderCart();
    document.getElementById('po-order-phone').value = '';
    // Limpa nome do cliente/PO também — o próximo pedido começa do zero,
    // não continua com os dados do que acabou de ser salvo.
    document.getElementById('po-order-client-name').value = '';
    document.getElementById('po-order-po-name').value = '';
    myOrdersLoaded = false; // força recarregar a lista na próxima vez que a aba abrir
  } catch (err) {
    cartError.textContent = I18n.t('cart.save_error', { msg: err.message });
    cartError.style.display = 'block';
    statusEl.textContent = '';
  }
});

// Retoma um pedido em rascunho (se o cliente saiu no meio e voltou depois)
// — carrega os itens já adicionados de volta pro carrinho visível.
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
  // Repõe "Nome do cliente"/"Nome da PO" já preenchidos antes do cliente ter
  // saído no meio do pedido — senão ele veria os campos vazios de novo ao
  // voltar, mesmo já tendo digitado isso antes.
  document.getElementById('po-order-client-name').value = draftOrders[0].client_name || '';
  document.getElementById('po-order-po-name').value = draftOrders[0].po_name || '';
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

// Mapeamento de status -> texto mostrado no badge. 'submitted' agora é
// chamado de "Aberta" na interface (o pedido foi salvo mas ainda não foi
// aprovado/confirmado pelo cliente — ver tela do pedido, migration 047);
// 'approved' ("Aprovada") é definitivo, trava a tela (ver renderOrderDetail).
function orderStatusLabel(status) {
  if (status === 'draft') return I18n.t('my_orders.status_draft');
  if (status === 'submitted') return I18n.t('my_orders.status_submitted');
  if (status === 'approved') return I18n.t('my_orders.status_approved');
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
    // 'submitted' (Aberta) E 'approved' (Aprovada) aparecem aqui — só
    // 'draft' (carrinho em andamento, ainda não salvo) fica de fora.
    const { data: orders, error } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('client_user_id', currentUser.id)
      // 'saved' (migration 052) — pedido de Plano de Corte salvo mas não
      // aprovado ainda; precisa aparecer aqui pro cliente (é o "Meus
      // Pedidos" DELE), mesmo não aparecendo na lista do admin.
      .in('status', ['submitted', 'saved', 'approved'])
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
      // Título do cartão: nome da PO se tiver, senão nome do cliente, senão
      // só a data — antes era sempre só a data, difícil de achar um pedido
      // específico numa lista com vários.
      const title = o.po_name || o.client_name || I18n.t('my_orders.order_of', { date });
      const subtitle = (o.po_name || o.client_name) ? date : '';
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
    document.getElementById('po-orders-list-panel').style.display = 'none';
    document.getElementById('po-order-detail-section').style.display = 'block';
    renderOrderDetail();
  } catch (err) {
    listErrorEl.textContent = I18n.t('order_detail.load_error', { msg: err.message });
    listErrorEl.style.display = 'block';
  }
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

document.getElementById('po-order-detail-back-btn').addEventListener('click', closeOrderDetail);

function renderOrderDetail() {
  if (!currentOrderDetail) return;
  const { order, items } = currentOrderDetail;
  const isApproved = order.status === 'approved';

  document.getElementById('po-order-detail-title').textContent = order.po_name || order.client_name || I18n.t('pdf.order_fallback');
  document.getElementById('po-order-detail-status-badge').textContent = orderStatusLabel(order.status);

  const fieldsWrap = document.getElementById('po-order-detail-fields');
  fieldsWrap.classList.toggle('readonly', isApproved);
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
  [clientNameInput, poNameInput, phoneInput, emailInput, addressInput].forEach((input) => { input.disabled = isApproved; });

  const itemsWrap = document.getElementById('po-order-detail-items');
  itemsWrap.innerHTML = items.map((it, idx) => renderOrderDetailItemCard(it, idx, isApproved, currentOrderDetail.colorById)).join('');
  itemsWrap.querySelectorAll('.po-order-item-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => editOrderItem(order, items.find((it) => it.id === btn.dataset.itemId)));
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

  const approveBtn = document.getElementById('po-order-detail-approve-btn');
  const approveHint = document.getElementById('po-order-detail-approve-hint');
  approveBtn.style.display = isApproved ? 'none' : 'block';
  approveHint.style.display = isApproved ? 'none' : 'block';
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
  const colors = Array.isArray(it.selected_colors) ? it.selected_colors : [];
  const colorsHtml = colors.length
    ? `<div class="po-order-item-colors">${colors.map((c) => {
        const colorRec = colorById && colorById.get(c.color_id);
        const dotStyle = colorRec && colorRec.texture_url
          ? `background-image:url('${colorRec.texture_url}');background-size:cover;background-position:center;`
          : `background-color:${(colorRec && colorRec.swatch_hex) || '#cccccc'};`;
        return `<span><span class="po-order-item-color-dot" style="${dotStyle}"></span>${c.role_name}: ${c.color_name}</span>`;
      }).join('')}</div>`
    : '';
  const detailUnit = (document.getElementById('po-unit-select') || {}).value || 'mm';
  const dimsLine = `${formatDimension(it.width_mm, detailUnit)} x ${formatDimension(it.height_mm, detailUnit)} x ${formatDimension(it.depth_mm, detailUnit)}`;
  // Módulo decorativo (migration 039): mesmo aviso do carrinho, no lugar do preço.
  const decorModule = (allModules || []).find((mm) => mm.id === it.module_id);
  const isDecor = !!(decorModule && decorModule.is_decoration);
  const priceLine = isDecor ? I18n.t('decor.cart_note') : formatMoney(it.total_price);
  const editBtn = isApproved
    ? ''
    : `<button type="button" class="secondary po-order-item-edit-btn" data-item-id="${it.id}">${I18n.t('order_detail.edit_btn')}</button>`;
  return `
    <div class="po-order-item-card">
      <div class="po-order-item-number">${number}</div>
      ${img}
      <div class="po-order-item-info">
        <div class="po-order-item-dims">${dimsLine}</div>
        <div class="po-order-item-reference">${it.module_name}</div>
        ${it.module_description ? `<div class="po-order-item-description">${it.module_description}</div>` : ''}
        ${colorsHtml}
      </div>
      <div class="po-order-item-actions">
        <div class="po-order-item-unit-price">${priceLine}</div>
        ${editBtn}
      </div>
    </div>
  `;
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
  } catch (err) {
    errorEl.textContent = I18n.t('order_detail.approve_error', { msg: err.message });
    errorEl.style.display = 'block';
  } finally {
    approveBtn.disabled = false;
  }
});

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
      total_price: lastItemResult.result.total,
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
async function loadCompositionColorRoleGroups() {
  const roleTally = new Map();
  compositionSlots.forEach((slot) => collectCompositionColorRoleIds(slot.pieces, roleTally));
  if (roleTally.size === 0) return [];

  const roleIds = [...roleTally.keys()];
  const moduleIdsByRole = new Map();
  roleIds.forEach((roleId) => {
    const ids = [...new Set(
      compositionSlots
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
    const colors = [...commonIds].map((id) => anyColorMap.get(id)).filter(Boolean);
    if (colors.length === 0) return;
    const roleName = (colorRolesCache.find((r) => r.id === roleId) || {}).name || '';
    groups.push({ roleId, roleName, colors, moduleIds });
  });
  return groups;
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
// Fix: usa a proporção REAL do recorte já trimado (trimmedImageRatio,
// calculada por getImageAspectRatio DEPOIS do trim — só ela reflete o
// desenho de verdade, o canvas não), mas CLAMPADA entre 2:3 e 3:2 antes de
// mapear pro valor suportado mais próximo — nunca deixa ir aos extremos
// (21:9 nem 9:16) que foram exatamente onde a alucinação apareceu nos dois
// sentidos, mas também nunca força quadrado quando o desenho claramente não
// é quadrado (isso é o que sobra espaço vazio pra preencher).
function currentGalleryAspectRatio(trimmedImageRatio) {
  if (!trimmedImageRatio || !isFinite(trimmedImageRatio) || trimmedImageRatio <= 0) return '1:1';
  const clamped = Math.min(3 / 2, Math.max(2 / 3, trimmedImageRatio));
  return nearestSupportedAspectRatio(clamped) || '1:1';
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
    // Mostra a imagem BASE (exatamente o que vira imageDataUrl mandado pra
    // Edge Function) — pedido do usuário: "me manda a imagem que esta
    // usando de base pra gerar a ia", pra comparar com o resultado.
    if (basePreviewImg && basePreviewWrap) {
      basePreviewImg.src = trimmedSnapshot;
      basePreviewWrap.style.display = 'block';
    }

    // Ambiente já deve estar escolhido (select vem ANTES do botão no HTML,
    // ver portal.html) — manda o nome pra Edge Function montar um prompt de
    // decoração/ambientação específico dele (pedido do usuário, 2026-07-19:
    // "conforme o ambiente escolhido ja devemos colocar um prompt para
    // decoracao e ambientacao").
    const roomFamilyId = document.getElementById('po-gallery-room-type').value || null;
    const roomLabel = roomFamilyId ? galleryFamilyName(roomFamilyId) : null;
    const aspectRatio = currentGalleryAspectRatio(await getImageAspectRatio(trimmedSnapshot));

    let imageDataUrl = trimmedSnapshot;
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
        body: { imageDataUrl: trimmedSnapshot, moduleRefImages, colorLabel, colorRefImages, angleRefImages, roomLabel, aspectRatio }
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
          const fallbackAngleRefImages = await captureCompositionAngleReferences();
          const [{ moduleRefImages }, fallbackColorLabel, fallbackColorRefImages] = await Promise.all([
            fetchReferencePhotosForComposition(),
            buildColorDescriptionForComposition(),
            buildColorReferencesForComposition()
          ]);
          const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
            body: { imageDataUrl: trimmedSnapshot, moduleRefImages, colorLabel: fallbackColorLabel, colorRefImages: fallbackColorRefImages, angleRefImages: fallbackAngleRefImages, roomLabel: fallbackRoomLabel, aspectRatio: fallbackAspectRatio }
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
    .select('id, ai_image_data_url, render_status, composition_name, family_id, total_width_mm, total_height_mm, total_depth_mm, price_sale, colors_used, slots, likes_count, is_anonymous, author_display_name, created_at')
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
      .select('id, ai_image_data_url, render_status, composition_name, family_id, total_width_mm, total_height_mm, total_depth_mm, price_sale, colors_used, slots, likes_count, is_anonymous, author_display_name, created_at')
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
    const liked = galleryLikedPostIds.has(post.id);
    card.innerHTML = `
      <div class="po-gallery-card-image-wrap">
        <button type="button" class="po-gallery-like-btn">${liked ? '♥' : '♡'} ${Number(post.likes_count || 0)}</button>
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
        </div>
      </div>
    `;
    card.querySelector('.po-gallery-card-name').textContent = post.composition_name || I18n.t('gallery.untitled');
    card.querySelector('.po-gallery-card-author').textContent = I18n.t('gallery.posted_by', { name: authorLabel });
    card.querySelector('.po-gallery-like-btn').addEventListener('click', (ev) => toggleGalleryLike(post, ev.currentTarget));
    card.querySelector('.po-gallery-use-btn').addEventListener('click', () => restoreGalleryPostAsComposition(post));
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

async function toggleGalleryLike(post, btnEl) {
  if (!currentUser) {
    alert(I18n.t('fav.need_login'));
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
    btnEl.textContent = `${galleryLikedPostIds.has(post.id) ? '♥' : '♡'} ${post.likes_count}`;
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
      payload.ai_image_data_url = galleryAiPreviewImage;
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
let cutlistFinalPrice = null; // Number depois de "Gerar Preço"; null = precisa gerar de novo (linhas mudaram)
let cutlistInitialized = false;

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
    .select('id, name, sheet_price_per_m2, edge_price_per_linear_m, swatch_hex')
    .eq('active', true)
    .order('sort_order');
  if (error) return;
  cutlistColorsCache = data || [];
}

function initCuttingListTabIfNeeded() {
  if (cutlistInitialized) return;
  cutlistInitialized = true;
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
  hideCutlistFinalPrice();
  renderCutlistTable();
}

function clearCutlistRows() {
  cutlistRows = [];
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
}

// Regra do usuário: peça com o menor lado (comprimento OU largura) abaixo
// de 100mm não pode laminar os 4 lados — só 0 ou 2 (2 comprimentos).
function isCutlistEdge4Blocked(row) {
  const c = Number(row.comprimento_mm);
  const w = Number(row.largura_mm);
  if (!isFinite(c) || !isFinite(w) || c <= 0 || w <= 0) return false;
  return Math.min(c, w) < 100;
}

function validateCutlistRows() {
  return cutlistRows.length > 0 && cutlistRows.every((row) => {
    const edge = Number(row.edge_banding);
    const comprimento = Number(row.comprimento_mm);
    const largura = Number(row.largura_mm);
    return row.part_name && row.part_name.trim() &&
      Number(row.quantity) > 0 &&
      comprimento >= CUTLIST_COMPRIMENTO_MIN && comprimento <= CUTLIST_COMPRIMENTO_MAX &&
      largura >= CUTLIST_LARGURA_MIN && largura <= CUTLIST_LARGURA_MAX &&
      (Number(row.espessura_mm) === 19 || Number(row.espessura_mm) === 38) &&
      row.color_id &&
      [0, 2, 4].includes(edge) &&
      !(edge === 4 && isCutlistEdge4Blocked(row));
  });
}

function renderCutlistTable() {
  const tbody = document.getElementById('po-cutlist-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  cutlistRows.forEach((row) => {
    const tr = document.createElement('tr');
    const edge4Blocked = isCutlistEdge4Blocked(row);
    const colorOptions = cutlistColorsCache.map((c) =>
      `<option value="${c.id}" ${row.color_id === c.id ? 'selected' : ''}>${c.name}</option>`
    ).join('');
    tr.innerHTML = `
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
      <td>
        <select class="po-project-input cl-color" style="min-width:130px;">${colorOptions}</select>
      </td>
      <td>
        <select class="po-project-input cl-edge" style="width:170px;">
          <option value="0" ${Number(row.edge_banding) === 0 ? 'selected' : ''}>${I18n.t('cutlist.edge_0')}</option>
          <option value="2" ${Number(row.edge_banding) === 2 ? 'selected' : ''}>${I18n.t('cutlist.edge_2')}</option>
          <option value="4" ${Number(row.edge_banding) === 4 ? 'selected' : ''} ${edge4Blocked ? `disabled title="${I18n.t('cutlist.edge_4_blocked_title')}"` : ''}>${I18n.t('cutlist.edge_4')}</option>
        </select>
      </td>
      <td><input type="text" class="po-project-input cl-obs" style="width:120px;" value="${row.obs || ''}" /></td>
      <td><button type="button" class="secondary cl-remove-btn" style="margin-top:0; padding:4px 8px;">✕</button></td>
    `;
    tbody.appendChild(tr);

    tr.querySelector('.cl-op').addEventListener('input', (e) => { row.op = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-part-name').addEventListener('input', (e) => { row.part_name = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-quantity').addEventListener('input', (e) => { row.quantity = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-obs').addEventListener('input', (e) => { row.obs = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-color').addEventListener('change', (e) => { row.color_id = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-espessura').addEventListener('change', (e) => { row.espessura_mm = Number(e.target.value); hideCutlistFinalPrice(); });
    tr.querySelector('.cl-edge').addEventListener('change', (e) => { row.edge_banding = Number(e.target.value); hideCutlistFinalPrice(); });
    // Comprimento/largura re-renderizam a linha (no blur) pra recalcular se
    // a opção "4 lados" deve ficar bloqueada (regra dos 100mm).
    tr.querySelector('.cl-comprimento').addEventListener('input', (e) => { row.comprimento_mm = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-comprimento').addEventListener('change', () => renderCutlistTable());
    tr.querySelector('.cl-largura').addEventListener('input', (e) => { row.largura_mm = e.target.value; hideCutlistFinalPrice(); });
    tr.querySelector('.cl-largura').addEventListener('change', () => renderCutlistTable());
    tr.querySelector('.cl-remove-btn').addEventListener('click', () => removeCutlistRow(row._id));
  });
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

const cutlistAddRowBtn = document.getElementById('po-cutlist-add-row-btn');
if (cutlistAddRowBtn) cutlistAddRowBtn.addEventListener('click', () => addCutlistRow());

const cutlistClearBtn = document.getElementById('po-cutlist-clear-btn');
if (cutlistClearBtn) cutlistClearBtn.addEventListener('click', () => clearCutlistRows());

const cutlistGenerateBtn = document.getElementById('po-cutlist-generate-price-btn');
if (cutlistGenerateBtn) {
  cutlistGenerateBtn.addEventListener('click', () => {
    const errorEl = document.getElementById('po-cutlist-error');
    errorEl.style.display = 'none';
    if (cutlistRows.length === 0) {
      errorEl.textContent = I18n.t('cutlist.no_rows_error');
      errorEl.style.display = 'block';
      return;
    }
    if (!validateCutlistRows()) {
      errorEl.textContent = I18n.t('cutlist.invalid_rows_error');
      errorEl.style.display = 'block';
      return;
    }
    cutlistFinalPrice = computeCutlistTotal();
    document.getElementById('po-cutlist-final-price').textContent = formatMoney(cutlistFinalPrice);
    document.getElementById('po-cutlist-final-price-row').style.display = 'flex';
    document.getElementById('po-cutlist-save-btn').style.display = 'inline-block';
    document.getElementById('po-cutlist-approve-save-btn').style.display = 'inline-block';
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

// ---------- Abas ----------

document.getElementById('po-sidebar').querySelectorAll('.portal-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    // Segurança: se o cliente clicar numa aba de verdade enquanto o modal de
    // "escolher módulo da composição" está aberto por cima (ver
    // startCompositionSlotConfig), fecha o modal primeiro — equivalente a
    // cancelar, evita addTargetSlotIndex ficar "preso" e o botão de
    // "Adicionar" com o texto errado na próxima vez.
    if (addTargetSlotIndex !== null) {
      exitCompositionSlotConfig();
    }
    document.getElementById('po-sidebar').querySelectorAll('.portal-tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.portal-tab-page').forEach((page) => { page.style.display = 'none'; });
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.style.display = 'block';
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

function showLoggedOut() {
  document.getElementById('po-auth-section').style.display = 'block';
  document.getElementById('po-content').style.display = 'none';
  document.getElementById('po-logout-btn').style.display = 'none';
}

async function showLoggedIn(user) {
  currentUser = user;
  document.getElementById('po-auth-section').style.display = 'none';
  document.getElementById('po-content').style.display = 'block';
  document.getElementById('po-logout-btn').style.display = 'inline-block';
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
  } else {
    showLoggedOut();
  }

  supabaseClient.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_OUT') showLoggedOut();
  });
})();
// fim de portal.js
