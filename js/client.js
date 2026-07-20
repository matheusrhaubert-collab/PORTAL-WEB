// Calculadora do cliente — LEGNO PORTAL WEB
// O cliente escolhe módulo, cor da caixa/porta, modelos (porta/dobradiça/
// corrediça) e medidas. Só o PREÇO TOTAL do módulo pai é exibido — o
// breakdown por peça fica só no painel admin.

let allModules = [];
let modules = [];
// pieces = peças do módulo raiz, já no formato RECURSIVO (Fase 2 — migration
// 023): cada item é OU uma peça-componente de catálogo (folha) OU um módulo
// inteiro usado como peça aninhada (is_module=true, child_pieces=[...] na
// mesma forma recursiva) — ver loadRecursivePiecesForModule. Substitui por
// completo o antigo par door_styles/drawer_types (removido nesta fase):
// um "modelo de porta" ou "modelo de gaveta" agora é só um módulo comum
// (normalmente marcado invisível) usado como peça.
let pieces = [];
// Catálogo de papéis de cor (migration 035 — color_roles) — substitui o
// binário fixo boxColors/doorColors. Carregado uma vez no init (mesmo
// espírito de hingeModels/slideModels).
let colorRolesCache = [];
// Cores disponíveis por papel PRA ESTE MÓDULO (module_colors filtrado por
// color_role_id) — { [role_id]: [colors...] }. Recarregado a cada troca de
// módulo (loadModuleColors).
let moduleColorsByRole = {};
// Cor escolhida pelo cliente, por papel — { [role_id]: color_id }. Substitui
// selectedBoxColorId/selectedDoorColorId.
let selectedColorIdByRole = {};
let hingeModels = [];
let slideModels = [];
let currentModule = null;
// Multiplicador de margem (migration 037, admin > Margem de preço) — aplicado
// UMA VEZ em cima do custo total no cálculo (ver Pricing.calculateModulePrice).
// Carregado uma vez no init (loadPricingMarkup); 1 = sem margem, se a tabela
// ainda não tiver linha ou a leitura falhar por qualquer motivo.
let pricingMarkupMultiplier = 1;

// Valores sugeridos/travados de medida (migration 028, module_dimension_presets)
// do módulo atual, agrupados por dimensão e já ordenados por sort_order —
// { width: [{value_mm,label,description}...], height: [...], depth: [...] }.
// Travado (currentModule.width_locked etc.) esconde a régua livre e mostra
// só um dropdown com esses valores; sem trava, a régua continua livre e
// esses valores viram chips de atalho (ver setupDimensionInputs).
let dimensionPresets = { width: [], height: [], depth: [] };

let viewer3dNeedsRefit = true; // recentraliza a câmera só na troca de módulo, não a cada tecla digitada

// Peças marcadas como opcionais (ex: puxador, rodapé, tampo, pé) não entram
// automaticamente — o cliente marca uma caixinha pra cada uma que quiser
// incluir (pode marcar várias ao mesmo tempo), desmarcadas por padrão.
// Guarda os IDs (component_id) atualmente marcados; reseta ao trocar de módulo.
let selectedOptionalComponentIds = new Set();

// ---------- Unidade de medida (só exibição — internamente tudo continua em mm) ----------
// O cliente escolhe em que unidade quer VER as medidas (mm, cm, m, polegada
// fracionada em 1/32", ou pés). Os sliders de largura/altura/profundidade
// continuam guardando o valor real em mm (é isso que o banco e as fórmulas
// esperam) — só o TEXTO mostrado ao lado de cada régua muda conforme a
// unidade escolhida. Trocar de unidade não move a peça nem recalcula preço.
const MM_PER_INCH = 25.4;

function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

// Converte mm pra uma polegada fracionada arredondada pro 1/32" mais
// próximo (o padrão de marcenaria/carpintaria), já simplificando a fração
// (ex: 16/32 vira 1/2).
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

// Igual formatDimension, mas só o número (sem unidade) — usado pra pré-
// preencher o campo de "medida exata" (o rótulo da unidade fica separado,
// ao lado do campo, pra ficar claro em que unidade digitar).
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

// Converte o texto digitado no campo de "medida exata" (na unidade
// atualmente escolhida) de volta pra mm — o valor real usado pelo slider,
// pelo cálculo de preço e pelo desenho 3D. Devolve null se não conseguir
// interpretar o texto. Pra polegada, aceita fração de marcenaria (ex:
// "12 3/8", "3/8") além de decimal (ex: "12.5").
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

// Atualiza só os TEXTOS (mín/máx/valor atual) de cada régua de dimensão na
// unidade escolhida — não mexe no valor real (em mm) guardado no slider.
// Também repreenche o campo de medida exata com o valor atual convertido,
// pra ficar fácil de editar (e o rótulo da unidade ao lado dele).
function updateDimensionUnitUI() {
  const unitSelect = document.getElementById('unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';
  const step = unit === 'in' ? (MM_PER_INCH / 32) : 1;
  [
    ['width', 'width-input', 'width-min-label', 'width-max-label', 'width-value', 'width-exact', 'width-exact-unit'],
    ['height', 'height-input', 'height-min-label', 'height-max-label', 'height-value', 'height-exact', 'height-exact-unit'],
    ['depth', 'depth-input', 'depth-min-label', 'depth-max-label', 'depth-value', 'depth-exact', 'depth-exact-unit']
  ].forEach(([, inputId, minId, maxId, valueId, exactId, exactUnitId]) => {
    const input = document.getElementById(inputId);
    if (!input || input.min === '' || input.max === '') return;
    input.step = step;
    document.getElementById(minId).textContent = formatDimension(parseFloat(input.min), unit);
    document.getElementById(maxId).textContent = formatDimension(parseFloat(input.max), unit);
    document.getElementById(valueId).textContent = formatDimension(parseFloat(input.value), unit);
    const exactEl = document.getElementById(exactId);
    // Não mexe no campo se o usuário estiver com o foco nele digitando —
    // senão o valor "pula" enquanto ele ainda está no meio de escrever.
    if (exactEl && document.activeElement !== exactEl) {
      exactEl.value = formatDimensionNumber(parseFloat(input.value), unit);
    }
    const exactUnitEl = document.getElementById(exactUnitId);
    if (exactUnitEl) exactUnitEl.textContent = unitAbbrev(unit);
  });
}

// Lê o que o cliente digitou no campo de medida exata de uma dimensão,
// converte pra mm na unidade atual, limita ao min/max do módulo, aplica no
// slider e recalcula preço + desenho 3D (mesmo caminho de quando arrasta a
// régua). Se não der pra interpretar o texto, só restaura o valor atual —
// não mostra erro, já que é um campo de conveniência.
function applyExactDimension(prefix) {
  const unitSelect = document.getElementById('unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';
  const exactEl = document.getElementById(prefix + '-exact');
  const slider = document.getElementById(prefix + '-input');
  if (!exactEl || !slider || slider.min === '' || slider.max === '') return;

  const mm = parseDimensionInput(exactEl.value, unit);
  if (mm === null || isNaN(mm)) {
    updateDimensionUnitUI();
    return;
  }
  const clamped = clamp(mm, parseFloat(slider.min), parseFloat(slider.max));
  slider.value = clamped;
  recalculate();
  updateDimensionUnitUI();
}

const unitSelectEl = document.getElementById('unit-select');
if (unitSelectEl) unitSelectEl.addEventListener('change', () => { updateDimensionUnitUI(); setupDimensionPresetsUI(); });

['width', 'height', 'depth'].forEach((prefix) => {
  const exactEl = document.getElementById(prefix + '-exact');
  if (!exactEl) return;
  exactEl.addEventListener('change', () => applyExactDimension(prefix));
  exactEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); applyExactDimension(prefix); exactEl.blur(); }
  });
});

function showError(msg) {
  const el = document.getElementById('calc-error');
  el.textContent = msg;
  el.style.display = 'block';
}
function clearError() {
  const el = document.getElementById('calc-error');
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

// ---------- Taxonomia (filtros) ----------

async function loadTaxonomyFilters() {
  const [families, categories, subcategories] = await Promise.all([
    supabaseClient.from('families').select('*').eq('active', true).order('name'),
    supabaseClient.from('categories').select('*').eq('active', true).order('name'),
    supabaseClient.from('subcategories').select('*').eq('active', true).order('name')
  ]);
  if (families.data) fillSelect('filter-family', families.data, 'Todas');
  if (categories.data) fillSelect('filter-category', categories.data, 'Todas');
  if (subcategories.data) fillSelect('filter-subcategory', subcategories.data, 'Todas');
}

['filter-family', 'filter-category', 'filter-subcategory'].forEach((id) => {
  document.getElementById(id).addEventListener('change', renderFilteredModuleSelect);
});

function renderFilteredModuleSelect() {
  const familyId = document.getElementById('filter-family').value;
  const categoryId = document.getElementById('filter-category').value;
  const subcategoryId = document.getElementById('filter-subcategory').value;

  modules = allModules.filter((m) =>
    (!familyId || m.family_id === familyId) &&
    (!categoryId || m.category_id === categoryId) &&
    (!subcategoryId || m.subcategory_id === subcategoryId)
  );

  const sel = document.getElementById('module-select');
  sel.innerHTML = '<option value="">— escolha um módulo —</option>';
  modules.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  document.getElementById('config-section').style.display = 'none';
}

// ---------- Módulos ----------

async function loadModules() {
  const { data, error } = await supabaseClient.from('modules').select('*').eq('active', true).order('name');
  if (error) { showError('Erro ao carregar módulos: ' + error.message); return; }
  allModules = data;
  renderFilteredModuleSelect();
}

document.getElementById('module-select').addEventListener('change', async (e) => {
  const id = e.target.value;
  if (!id) {
    document.getElementById('config-section').style.display = 'none';
    return;
  }
  currentModule = modules.find((m) => m.id === id);
  viewer3dNeedsRefit = true; // módulo novo -> recentraliza a câmera do 3D uma vez
  selectedOptionalComponentIds = new Set(); // módulo novo -> opcionais voltam a ficar desmarcados
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
  setupOptionVisibility();
  renderShelfQuantityInputs();
  renderOptionalComponents();
  document.getElementById('module-description').textContent = currentModule.description || '';
  document.getElementById('config-section').style.display = 'block';
  recalculate();
});

// Catálogo de papéis de cor (migration 035) — carregado uma vez, igual
// hingeModels/slideModels. Papéis inativos nem aparecem (policy "public read
// active color_roles").
async function loadColorRoles() {
  const { data, error } = await supabaseClient.from('color_roles').select('*').order('sort_order');
  if (error) { showError('Erro ao carregar papéis de cor: ' + error.message); return; }
  colorRolesCache = data || [];
}

// Multiplicador de margem (migration 037) — carregado uma vez no init. Falha
// silenciosa (mantém 1 = sem margem) se a leitura der erro por qualquer
// motivo, pra nunca travar a calculadora por causa disso.
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
  if (error) { showError('Erro ao carregar cores: ' + error.message); return; }
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
// inclui peças dentro de peças-módulo aninhadas), na ordem do catálogo
// (colorRolesCache já vem ordenado por sort_order).
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
// 035) — substitui os 2 blocos fixos "Cor da caixa"/"Cor da porta". Chamado
// depois que loadModuleColors E loadModulePieces já terminaram (precisa dos
// dois: cores disponíveis por papel + quais papéis as peças usam).
function renderColorRoleSwatchGroups() {
  const container = document.getElementById('color-role-swatch-groups');
  container.innerHTML = '';
  const usedRoleIds = collectUsedColorRoleIds(pieces);
  selectedColorIdByRole = {};
  colorRolesCache
    .filter((role) => usedRoleIds.has(role.id))
    .forEach((role) => {
      const colors = moduleColorsByRole[role.id] || [];
      if (colors.length === 0) return; // nenhuma cor cadastrada pra este papel neste módulo -- nada pra escolher
      selectedColorIdByRole[role.id] = colors[0].id;
      const group = document.createElement('div');
      group.className = 'color-role-swatch-group';
      const label = document.createElement('label');
      label.textContent = `Cor — ${role.name}`;
      const swatchesDiv = document.createElement('div');
      swatchesDiv.className = 'color-role-swatches';
      group.appendChild(label);
      group.appendChild(swatchesDiv);
      container.appendChild(group);
      renderSwatches(swatchesDiv, colors, selectedColorIdByRole[role.id], (id) => {
        selectedColorIdByRole[role.id] = id;
        recalculate();
      });
    });
}

// Busca os valores sugeridos/travados de medida deste módulo (migration 028)
// e agrupa por dimensão, já na ordem cadastrada pelo admin (sort_order).
async function loadModuleDimensionPresets(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_dimension_presets')
    .select('*')
    .eq('module_id', moduleId)
    .order('sort_order');
  if (error) { showError('Erro ao carregar valores sugeridos de medida: ' + error.message); return; }
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
    div.title = c.name; // ícone compacto — o nome fica disponível ao passar o mouse
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
// em profundidade ilimitada. Usada tanto pro módulo raiz (module-select)
// quanto, recursivamente, pra qualquer módulo filho (ex: um "modelo de
// porta" ou "modelo de gaveta", que agora são só módulos comuns usados como
// peça — sem tabela/UI especial nenhuma).
async function loadRecursivePiecesForModule(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('id, component_id, child_module_id, quantity_override, sort_order, width_formula_override, height_formula_override, depth_formula_override, offset_x_mm, offset_y_mm, offset_z_mm, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, components(*, labor_types(*), component_types(*))')
    .eq('module_id', moduleId)
    .order('sort_order');
  if (error) { showError('Erro ao carregar configuração do módulo: ' + error.message); return []; }

  const result = [];
  for (const row of (data || [])) {
    if (row.component_id) {
      if (!row.components || !row.components.active) continue;
      const quantity = (row.quantity_override !== null && row.quantity_override !== undefined)
        ? row.quantity_override
        : row.components.quantity;
      // Mão de obra vem de um catálogo pré-cadastrado (Mão de obra caixa,
      // LED, 1, 2, 3...) — o componente só escolhe qual tipo usa.
      const labor_cost_per_unit = row.components.labor_types ? row.components.labor_types.price_per_unit : 0;
      // Papel de cor (migration 035) vem do tipo do componente (Lateral,
      // Base, Porta, Gaveta...), não mais de um boolean is_front fixo.
      const color_role_id = row.components.component_types ? row.components.component_types.color_role_id : null;
      // Posicionamento (migration 024) — declara explicitamente o eixo de
      // espessura da peça no 3D (viewer3d.js splitThickness), substituindo a
      // auto-detecção por menor dimensão quando cadastrado no Tipo. null =
      // automático (comportamento antigo).
      const positioning = row.components.component_types ? row.components.component_types.positioning : null;
      // Fórmula de L/A/P: a mesma peça de catálogo pode ter fórmula
      // diferente dependendo do módulo pai (ex: espessura de lateral
      // diferente) — usa o override deste módulo se existir, senão a
      // fórmula padrão do componente.
      const width_formula = row.width_formula_override || row.components.width_formula;
      const height_formula = row.height_formula_override || row.components.height_formula;
      const depth_formula = row.depth_formula_override || row.components.depth_formula;
      result.push({
        ...row.components,
        // id vira o da LINHA (module_components.id — row.id), não o do
        // catálogo (migration 025: o mesmo componente pode ter 2+ linhas no
        // mesmo módulo, cada uma numa posição — se piece.id ficasse com o id
        // do catálogo, as instâncias colidiriam em selectedOptionalComponentIds/
        // shelfQuantities, que são keyed por piece.id em client.js/pricing.js).
        id: row.id,
        // Nome customizado desta instância (migration 032) — sobrescreve o
        // nome do catálogo só na exibição (balão do 3D). Fica DEPOIS do
        // ...row.components pra não ser apagado pelo spread.
        reference: row.reference_override || row.components.reference,
        quantity, labor_cost_per_unit, color_role_id, positioning,
        width_formula, height_formula, depth_formula,
        // Deslocamento — FÓRMULA (aceita W, H, D) só do DESENHO 3D — ex:
        // fundo que entra num rebaixo e fica "H-19" (19mm abaixo do topo) em
        // vez de centralizado. Ainda não é um valor em mm aqui — é avaliada
        // em recalculate()/resolvePiecesForViewer com as medidas atuais do
        // container. Não afeta preço.
        offset_x_formula: row.offset_x_mm || '0',
        offset_y_formula: row.offset_y_mm || '0',
        offset_z_formula: row.offset_z_mm || '0',
        // "Cliente escolhe a quantidade" (ex: prateleiras) vem do VÍNCULO
        // módulo x componente, não mais do componente global — o mesmo
        // componente pode ter um intervalo diferente em cada módulo.
        quantity_configurable: !!row.quantity_configurable,
        quantity_min: row.quantity_min,
        quantity_max: row.quantity_max,
        quantity_default: row.quantity_default,
        // "Opcional" (puxador, rodapé, tampo, pé...) — o cliente decide
        // incluir ou não via caixinha de marcar (ver renderOptionalComponents).
        client_optional: !!row.client_optional,
        // Só importa quando client_optional=true: caixinha já nasce marcada
        // (item já entra), mas o cliente ainda pode desmarcar e tirar — ver
        // o reset de selectedOptionalComponentIds na troca de módulo.
        client_optional_default_on: !!row.client_optional_default_on,
        visibility_dimension: row.visibility_dimension || null,
        visibility_min_mm: row.visibility_min_mm,
        visibility_max_mm: row.visibility_max_mm,
        is_module: false
      });
    } else if (row.child_module_id) {
      // Peça-módulo aninhada — busca a composição e as profundidades fixas
      // do módulo FILHO recursivamente. As fórmulas de L/A/P aqui são
      // OBRIGATÓRIAS (não são "override" de nada — são a única fonte de
      // dimensão dessa peça, ver admin.js/pricing.js).
      const [fixedDepths, childPieces, lockedPresets, ownHingeSlide] = await Promise.all([
        fetchModuleFixedDepths(row.child_module_id),
        loadRecursivePiecesForModule(row.child_module_id),
        fetchModuleLockedDimensionPresets(row.child_module_id),
        fetchModuleOwnHingeAndSlideModels(row.child_module_id)
      ]);
      result.push({
        // id vira o da LINHA (row.id) em vez do child_module_id — mesmo
        // motivo do branch de componente acima: o mesmo módulo aninhado
        // também pode ter 2+ linhas no módulo pai (migration 025).
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
        fixed_depths: fixedDepths,
        locked_width_presets: lockedPresets.width,
        locked_height_presets: lockedPresets.height,
        locked_depth_presets: lockedPresets.depth,
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
        // Nome do módulo filho — só existe pra dar nome à peça no
        // painel de duplo-clique do 3D (viewer3d.js); nada de cálculo
        // depende disso.
        module_name: lockedPresets.name,
        child_pieces: childPieces
      });
    }
  }
  return result;
}

// Profundidades fixas cadastradas pra um módulo (module_fixed_depths) —
// generaliza o antigo drawer_type_depths: QUALQUER módulo usado como peça
// aninhada pode ter isso, não só um "modelo de gaveta" especial. A peça não
// estica pra qualquer profundidade, só existe nessas medidas (ex: corrediças
// de 300/350/400/450mm) — Pricing.pickDrawerDepth escolhe sozinha qual cabe.
async function fetchModuleFixedDepths(moduleId) {
  const { data, error } = await supabaseClient.from('module_fixed_depths').select('depth_mm').eq('module_id', moduleId);
  if (error) { console.error(error); return []; }
  return (data || []).map((r) => Number(r.depth_mm));
}

// Um módulo pode ter Largura/Altura/Profundidade "travadas" (migration 028 —
// module_dimension_presets + width_locked/height_locked/depth_locked): quando
// o CLIENTE configura esse módulo DIRETO, ele só escolhe entre os valores
// cadastrados (ver setupDimensionPresetsUI). Isso se perdia quando o mesmo
// módulo era usado como PEÇA dentro de outro (child_module_id) — a fórmula
// (ex: depth_formula_override="D-20") sempre dava um valor contínuo, como se
// o módulo filho aceitasse qualquer medida. Busca aqui (só as dimensões que
// estiverem travadas — sem trava, não faz sentido "arredondar" nada, é só
// sugestão) pra loadRecursivePiecesForModule guardar na peça, e
// resolvePiecesForViewer/Pricing.calculateAssembly arredondarem pro valor
// permitido mais próximo (Pricing.pickNearestPreset), igual já acontecia só
// com profundidade fixa de gaveta (module_fixed_depths/pickDrawerDepth).
async function fetchModuleLockedDimensionPresets(moduleId) {
  const [moduleRes, presetsRes] = await Promise.all([
    supabaseClient.from('modules').select('name, width_locked, height_locked, depth_locked, width_min_mm, width_max_mm, height_min_mm, height_max_mm, depth_min_mm, depth_max_mm').eq('id', moduleId).single(),
    supabaseClient.from('module_dimension_presets').select('dimension, value_mm').eq('module_id', moduleId)
  ]);
  const mod = moduleRes.data || {};
  const byDim = { width: [], height: [], depth: [] };
  (presetsRes.data || []).forEach((row) => { if (byDim[row.dimension]) byDim[row.dimension].push(Number(row.value_mm)); });
  return {
    // Nome do módulo — reaproveitado aqui (já busca a linha de `modules`
    // pra ler width_locked/height_locked/depth_locked) pra dar nome à peça
    // aninhada nos parts do 3D (ver loadRecursivePiecesForModule abaixo e o
    // recurso de duplo-clique em viewer3d.js/client.js).
    name: mod.name || null,
    width: mod.width_locked ? byDim.width : [],
    height: mod.height_locked ? byDim.height : [],
    depth: mod.depth_locked ? byDim.depth : [],
    // Limite PRÓPRIO do módulo (sempre existe) — pedido do usuário: "quando
    // um modulo e inserido em outro, ele respeite os limites de tamanho do
    // modulo filho", regra fundamental, não opt-in. Ver clamp em
    // resolvePiecesForViewer/Pricing.calculateModulePiece.
    ownWidthMinMm: mod.width_min_mm,
    ownWidthMaxMm: mod.width_max_mm,
    ownHeightMinMm: mod.height_min_mm,
    ownHeightMaxMm: mod.height_max_mm,
    ownDepthMinMm: mod.depth_min_mm,
    ownDepthMaxMm: mod.depth_max_mm
  };
}

// Um módulo aninhado (usado como peça-módulo dentro de outro) pode já ter seu
// PRÓPRIO modelo de dobradiça/corrediça vinculado (module_hinge_models/
// module_slide_models DESSE módulo — mesma seção "Modelos disponíveis para
// este módulo" do admin, só que preenchida pro módulo FILHO, não pro módulo
// raiz que o cliente está configurando). Isso é hardware FIXO da peça (ex:
// "Drawer Soft Closet" só existe com corrediça HAFELE undermount SOFT
// CLOSET) — não faz sentido pedir pro cliente escolher de novo lá em cima, e
// muito menos EXIGIR que o módulo pai também tenha um modelo de corrediça
// vinculado só pra essa peça aninhada funcionar (bug reportado: o cálculo só
// olhava pro modelo escolhido no módulo raiz). Pricing.calculateModulePiece
// usa isto como override — só cai pro modelo escolhido pelo cliente
// (hingeModel/slideModel do módulo raiz) se o módulo filho NÃO tiver nada
// vinculado aqui. Se houver mais de um modelo ativo vinculado no filho, usa
// o primeiro — pensado pra hardware fixo (1 opção), não pra o cliente
// escolher entre vários (isso continua sendo papel do módulo raiz).
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
  if (error) { showError('Erro ao carregar modelos de dobradiça: ' + error.message); return; }
  hingeModels = (data || []).map((row) => row.hinge_models).filter((h) => h && h.active);
  fillSelect('hinge-model-select', hingeModels);
}

async function loadModuleSlideModels(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_slide_models')
    .select('slide_model_id, slide_models(*)')
    .eq('module_id', moduleId);
  if (error) { showError('Erro ao carregar modelos de corrediça: ' + error.message); return; }
  slideModels = (data || []).map((row) => row.slide_models).filter((s) => s && s.active);
  fillSelect('slide-model-select', slideModels);
}

// Mostra/esconde seletores de opcionais conforme as peças do módulo
// realmente precisarem deles. "Modelo de porta"/"Modelo de gaveta" (Fase 1)
// não existem mais — um modelo de porta/gaveta agora é só um módulo comum
// usado como peça aninhada (is_module), sem seletor próprio nenhum: o
// cliente nem percebe a diferença, só vê o resultado montado no 3D e no preço.
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
  // Posição no módulo, não só "Frente/porta" — a posição "Frente/porta" tem
  // bugs de posicionamento no 3D, então o admin usa "Peça livre" pras
  // portas e só confia no campo hinge_side pra marcar que abre), OU
  // peça-módulo aninhada (ex: um "modelo de porta") com opening_type
  // hinge_left/hinge_right — MAS só se essa peça-módulo não já tiver seu
  // PRÓPRIO modelo de dobradiça vinculado (own_hinge_model, ver
  // fetchModuleOwnHingeAndSlideModels): nesse caso o hardware é fixo da peça,
  // não precisa (nem deve) pedir pro cliente escolher aqui. Agora verifica em
  // QUALQUER profundidade (ver treeHasHinge).
  const usesHinges = treeHasHinge(pieces, true, false);
  // Corrediça: só existe hoje numa peça-módulo aninhada com opening_type
  // slide_out (ex: um "modelo de gaveta" usado como sub-montagem) — mesma
  // exceção acima quando a peça já tem own_slide_model próprio.
  const usesSlides = treeHasSlide(pieces, true, false);

  document.getElementById('door-color-wrap').style.display = hasDoorPieces ? 'block' : 'none';
  document.getElementById('hinge-model-wrap').style.display = usesHinges ? 'block' : 'none';
  document.getElementById('slide-model-wrap').style.display = usesSlides ? 'block' : 'none';

  // Botões "Abrir portas" e "Abrir gavetas" — SEPARADOS (pedido do usuário):
  // cada um só aparece se existir peça do seu próprio tipo neste módulo, em
  // QUALQUER profundidade de aninhamento (ver treeHasHinge/treeHasSlide), e
  // cada um controla só o seu grupo (ver Viewer3D.toggleDoorsOnly/
  // toggleDrawersOnly) — abrir as portas não abre as gavetas, e vice-versa.
  const hasOpenableHinge = treeHasHinge(pieces, false, false);
  const hasOpenableSlide = treeHasSlide(pieces, false, false);
  const toggleDoorsBtnEl = document.getElementById('toggle-doors-btn');
  if (toggleDoorsBtnEl) {
    toggleDoorsBtnEl.style.display = hasOpenableHinge ? 'inline-block' : 'none';
    toggleDoorsBtnEl.dataset.openLabel = 'Abrir portas';
    toggleDoorsBtnEl.dataset.closeLabel = 'Fechar portas';
    if (!Viewer3D.areDoorsOnlyOpen || !Viewer3D.areDoorsOnlyOpen()) {
      toggleDoorsBtnEl.textContent = toggleDoorsBtnEl.dataset.openLabel;
    }
  }
  const toggleDrawersBtnEl = document.getElementById('toggle-drawers-btn');
  if (toggleDrawersBtnEl) {
    toggleDrawersBtnEl.style.display = hasOpenableSlide ? 'inline-block' : 'none';
    toggleDrawersBtnEl.dataset.openLabel = 'Abrir gavetas';
    toggleDrawersBtnEl.dataset.closeLabel = 'Fechar gavetas';
    if (!Viewer3D.areDrawersOnlyOpen || !Viewer3D.areDrawersOnlyOpen()) {
      toggleDrawersBtnEl.textContent = toggleDrawersBtnEl.dataset.openLabel;
    }
  }
}

function renderShelfQuantityInputs() {
  const container = document.getElementById('shelf-quantities-wrap');
  container.innerHTML = '';
  pieces.filter((p) => p.quantity_configurable).forEach((p) => {
    const div = document.createElement('div');
    div.innerHTML = `
      <label>${p.reference} — quantidade (${p.quantity_min} a ${p.quantity_max})</label>
      <input type="number" class="shelf-qty-input" data-piece-id="${p.id}"
        min="${p.quantity_min}" max="${p.quantity_max}" value="${p.quantity_default}" />
    `;
    container.appendChild(div);
  });
  document.querySelectorAll('.shelf-qty-input').forEach((input) => {
    input.addEventListener('input', recalculate);
  });
}

// Peças marcadas como opcionais pelo admin (ex: puxador, rodapé, tampo, pé)
// aparecem aqui como caixinhas de marcar independentes — o cliente pode
// marcar quantas quiser ao mesmo tempo, cada uma somando seu próprio preço.
// Desmarcadas por padrão; recalculate() só inclui as marcadas.
function renderOptionalComponents() {
  const container = document.getElementById('optional-components-list');
  const wrap = document.getElementById('optional-components-wrap');
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
      recalculate();
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(p.reference));
    container.appendChild(label);
  });
}

function setupDimensionInputs() {
  const w = document.getElementById('width-input');
  const h = document.getElementById('height-input');
  const d = document.getElementById('depth-input');
  w.min = currentModule.width_min_mm; w.max = currentModule.width_max_mm; w.value = currentModule.width_default_mm;
  h.min = currentModule.height_min_mm; h.max = currentModule.height_max_mm; h.value = currentModule.height_default_mm;
  d.min = currentModule.depth_min_mm; d.max = currentModule.depth_max_mm; d.value = currentModule.depth_default_mm;
  // Os sliders guardam o valor real em mm — os textos de mín/máx/valor ao
  // lado de cada um é que são exibidos na unidade escolhida pelo cliente.
  updateDimensionUnitUI();
  setupDimensionPresetsUI();
}

// Aplica, pra cada dimensão, o modo TRAVADO (dropdown com só os valores
// cadastrados em module_dimension_presets, régua livre escondida) ou
// SUGERIDO (régua livre normal + chips de atalho com os valores
// cadastrados) — migration 028. Travado só entra em vigor se houver pelo
// menos 1 valor cadastrado pra essa dimensão (senão, mesmo marcado como
// travado no admin, cai pro comportamento normal de régua livre, pra nunca
// deixar o cliente sem nenhuma opção). Chamado ao trocar de módulo
// (setupDimensionInputs) e de novo sempre que a unidade de medida muda (pra
// reformatar os rótulos na unidade escolhida sem perder o valor atual) — o
// slider real (fonte da verdade em mm, lido por recalculate()) nunca é
// escondido de fato, só visualmente substituído pelo dropdown quando travado.
function setupDimensionPresetsUI() {
  const unitSelect = document.getElementById('unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';

  [
    ['width', 'width-input', 'width-locked-select', 'width-preset-chips'],
    ['height', 'height-input', 'height-locked-select', 'height-preset-chips'],
    ['depth', 'depth-input', 'depth-locked-select', 'depth-preset-chips']
  ].forEach(([key, sliderId, selectId, chipsId]) => {
    const slider = document.getElementById(sliderId);
    const select = document.getElementById(selectId);
    const chipsWrap = document.getElementById(chipsId);
    if (!slider || !select || !chipsWrap) return;

    const dimField = slider.closest('.dim-field');
    const sliderRow = slider.closest('.dim-slider-row');
    const valueRow = dimField ? dimField.querySelector('.dim-value-row') : null;
    const presets = (dimensionPresets && dimensionPresets[key]) || [];
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
      // Mantém o valor atual se ele bater com um dos presets (dentro de uma
      // margem pequena, pra tolerar arredondamento); senão cai pro primeiro
      // preset cadastrado e sincroniza o slider real com esse valor.
      const match = presets.find((p) => Math.abs(Number(p.value_mm) - currentMm) < 0.01);
      select.value = match ? match.value_mm : presets[0].value_mm;
      if (!match) slider.value = presets[0].value_mm;
    } else {
      if (sliderRow) sliderRow.style.display = '';
      if (valueRow) valueRow.style.display = '';
      select.style.display = 'none';

      chipsWrap.innerHTML = '';
      if (presets.length > 0) {
        chipsWrap.style.display = 'flex';
        presets.forEach((p) => {
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'dim-preset-chip';
          chip.textContent = labelFor(p);
          chip.addEventListener('click', () => {
            slider.value = p.value_mm;
            recalculate();
            updateDimensionUnitUI();
          });
          chipsWrap.appendChild(chip);
        });
      } else {
        chipsWrap.style.display = 'none';
      }
    }
  });
}

// Dropdown travado (modo "Travar") — escolher uma opção aplica o valor
// direto no slider real (mesma fonte de verdade em mm usada por
// recalculate()/pricing/3D) e recalcula, igual ao clique num chip sugerido.
['width', 'height', 'depth'].forEach((key) => {
  const select = document.getElementById(`${key}-locked-select`);
  const slider = document.getElementById(`${key}-input`);
  if (!select || !slider) return;
  select.addEventListener('change', () => {
    slider.value = select.value;
    recalculate();
    updateDimensionUnitUI();
  });
});

['width-input', 'height-input', 'depth-input', 'hinge-model-select', 'slide-model-select'].forEach((id) => {
  document.getElementById(id).addEventListener('input', recalculate);
});
// Atualiza o texto do valor ao lado da régua em tempo real enquanto arrasta
// (o valor em mm — que é o que importa pro cálculo — já é lido direto do
// slider em recalculate(), isso aqui é só o texto exibido na unidade escolhida).
['width-input', 'height-input', 'depth-input'].forEach((id) => {
  document.getElementById(id).addEventListener('input', updateDimensionUnitUI);
});

let lastResult = null;

// Resolve uma lista de peças (folha OU módulo aninhado, formato recursivo —
// ver loadRecursivePiecesForModule) pro formato que Viewer3D.update espera:
// { position_role, width_mm, height_mm, depth_mm, color, offset_x_mm/y/z,
// hinge_side, is_module, opening_type, slides_per_unit, child_pieces }.
// containerDims = { W, H, D } do CONTÊINER que essas peças ocupam (módulo
// raiz, ou — recursivamente — as dimensões JÁ RESOLVIDAS de uma peça-módulo
// pai, pras peças internas dela). Mesma lógica de resolução (resolveBodyDims
// pro pé, pickDrawerDepth pra profundidade fixa) usada por
// Pricing.calculateAssembly, pra preço e desenho 3D nunca divergirem.
function resolvePiecesForViewer(piecesList, containerDims, colorsByRole, shelfQuantities) {
  const { bodyDims } = Pricing.resolveBodyDims(piecesList, containerDims);
  const parts = [];
  (piecesList || []).forEach((piece) => {
    const pieceContainerDims = piece.position_role === 'leg' ? containerDims : bodyDims;
    const quantityOverride = piece.quantity_configurable ? shelfQuantities[piece.id] : undefined;
    const dims = Pricing.calculatePiece(piece, pieceContainerDims, quantityOverride);

    // Visibilidade condicional (migration 031) — mesma checagem do preço
    // (Pricing.calculateAssembly), pra 3D e preço nunca divergirem: sem isso
    // aqui, uma peça escondida do preço continuaria aparecendo no desenho.
    if (!Pricing.isPieceVisible(piece, pieceContainerDims)) return;

    // Peça-módulo com dimensão TRAVADA (locked_*_presets) que não cabe nem
    // no MENOR valor cadastrado nessa dimensão: essa peça NÃO EXISTE nessa
    // configuração (mesma regra de Pricing.calculateModulePiece/
    // isBelowMinLockedPreset, pra preço e 3D nunca divergirem) — ex: cliente
    // diminuiu a profundidade do módulo pai até sobrar menos espaço do que a
    // menor gaveta configurada cabe; a gaveta some do desenho em vez de
    // aparecer menor do que qualquer configuração real dela permite.
    if (Pricing.isBelowMinLockedPreset(piece.locked_width_presets, dims.width_mm)
      || Pricing.isBelowMinLockedPreset(piece.locked_height_presets, dims.height_mm)
      || Pricing.isBelowMinLockedPreset(piece.locked_depth_presets, dims.depth_mm)) {
      return;
    }

    const color = colorsByRole && colorsByRole[piece.color_role_id];
    // Arredonda e nunca deixa negativo — mas RESPEITA 0 de propósito (ex:
    // cliente escolheu 0 prateleiras). Só cai pra 1 se vier algo inválido.
    const roundedQty = Math.round(dims.quantity);
    const qty = Math.max(isNaN(roundedQty) ? 1 : roundedQty, 0);

    // Peça (folha ou módulo aninhado) com profundidade FIXA cadastrada
    // (module_fixed_depths, generaliza o antigo drawer_type_depths) — mesma
    // regra usada no preço (Pricing.pickDrawerDepth), pra o 3D bater com o
    // que foi cobrado. Tem prioridade sobre locked_depth_presets (sistema
    // mais antigo, específico de gaveta/corrediça — não muda nada em módulos
    // que já usam module_fixed_depths).
    let resolvedDepthMm = dims.depth_mm;
    if (piece.fixed_depths && piece.fixed_depths.length > 0) {
      resolvedDepthMm = Pricing.pickDrawerDepth(piece.fixed_depths, dims.depth_mm);
    } else if (piece.locked_depth_presets && piece.locked_depth_presets.length > 0) {
      resolvedDepthMm = Pricing.pickNearestPreset(piece.locked_depth_presets, dims.depth_mm);
    }
    // Largura/altura TRAVADAS no módulo FILHO (migration 028 —
    // width_locked/height_locked + module_dimension_presets): o módulo usado
    // como peça só existe nesses valores, mesma ideia da profundidade acima
    // generalizada — sem isso, a fórmula (ex: "W-50") dava uma medida
    // contínua mesmo que esse módulo, configurado direto pelo cliente, só
    // aceite um punhado de larguras/alturas fixas.
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

    // TRAVA DE SEGURANÇA: uma peça (folha ou módulo aninhado) NUNCA pode
    // ficar maior que o espaço disponível no container que a recebe — senão
    // ela "vaza" pra fora do corpo do módulo pai. Isso pode acontecer com
    // locked_*_presets, que arredonda pro valor mais PRÓXIMO (não
    // necessariamente o que CABE) — ex: gaveta com presets [305,381,457,533]
    // dentro de um vão de 500mm arredondaria pra 533mm (mais próximo de um
    // valor cru de ~520mm) e estouraria o corpo. Clampa sempre, com ou sem
    // trava configurada, nos 3 eixos — EXCETO pra position_role='free'.
    //
    // REVERTIDO (2026-07-07): tentei liberar isso só pra peça-folha (is_module)
    // pra deixar "W+44"/"H+10" em frente de gaveta ficar maior de propósito —
    // quebrou o desenho 3D em cascata, porque is_module não diz nada sobre
    // COMO a peça se posiciona; pegou peças 'front'/'drawer' que dependem de
    // empilhamento automático e as tirou do lugar.
    // CORRIGIDO (2026-07-09): a condição certa é position_role==='free', não
    // is_module. Esse papel já SEMPRE ignorou vão-interno e empilhamento
    // automático em placePieceInBox (viewer3d.js) e sua posição já é 100%
    // absoluta via Deslocar X/Y/Z; só faltava a MEDIDA também não ser
    // clampada aqui, senão "W+44" numa peça livre nunca aparecia maior que o
    // container por mais que a fórmula mandasse. Papéis com comportamento
    // automático (front/drawer/shelf/etc.) continuam clampados — só 'free'
    // fica de fora, porque só 'free' foi desenhado pra não depender de caber
    // dentro do container.
    if (piece.position_role !== 'free') {
      resolvedWidthMm = Math.min(resolvedWidthMm, pieceContainerDims.W);
      resolvedHeightMm = Math.min(resolvedHeightMm, pieceContainerDims.H);
      resolvedDepthMm = Math.min(resolvedDepthMm, pieceContainerDims.D);
    }

    // Deslocamento é uma fórmula — avaliada contra o MESMO container que a
    // peça usa pras próprias dimensões (pieceContainerDims: bodyDims
    // reduzido pelo pé, exceto pro próprio pé, que usa o container cheio),
    // MAIS as próprias dimensões RESOLVIDAS (já travadas/clampadas acima)
    // desta peça, disponíveis em minúsculo (w/h/d) — mesma convenção já usada
    // em area_m2_formula/edge_band_linear_m_formula (Pricing.calculatePiece).
    // Isso permite fórmulas como "D-d" (Posição Z), que encostam a peça na
    // FRENTE do vão (D = profundidade do container, d = profundidade da
    // PRÓPRIA peça) — funciona pra QUALQUER container, ao contrário de um
    // valor fixo tipo "20" (calibrado só pra um módulo pai específico, quebra
    // se essa gaveta for reaproveitada num módulo com profundidade diferente
    // — foi exatamente esse o bug reportado). CORREÇÃO ANTERIOR (mantida):
    // usar o container CHEIO (em vez de pieceContainerDims) fazia legH ser
    // contado 2x em Y quando o módulo tinha pé — X e Z não eram afetados.
    // RECURSIVO: peça-módulo (is_module) tem sua própria composição
    // (child_pieces) — resolve ela de novo aqui, usando as dimensões JÁ
    // RESOLVIDAS (e já arredondadas pras travas acima) desta peça-módulo
    // como o novo container, em profundidade ilimitada (ex: um "modelo de
    // porta" com sua própria moldura/painel).
    let childParts = null;
    if (piece.is_module && piece.child_pieces && piece.child_pieces.length) {
      const childContainerDims = { W: resolvedWidthMm, H: resolvedHeightMm, D: resolvedDepthMm };
      childParts = resolvePiecesForViewer(piece.child_pieces, childContainerDims, colorsByRole, shelfQuantities);
    }

    // N/COUNT (pedido do usuário 2026-07-15, ESPELHA admin.js/portal.js):
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
        // Nome pra exibir no balão de duplo-clique (viewer3d.js/client.js):
        // peça-folha usa a referência do catálogo (components.reference,
        // já vem espalhado em piece via loadRecursivePiecesForModule);
        // peça-módulo aninhada usa o nome do módulo filho (module_name,
        // ver fetchModuleLockedDimensionPresets). Nunca inclui preço.
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

function recalculate() {
  clearError();
  if (!currentModule || Object.keys(selectedColorIdByRole).length === 0 || pieces.length === 0) return;

  const width_mm = clamp(parseFloat(document.getElementById('width-input').value), currentModule.width_min_mm, currentModule.width_max_mm);
  const height_mm = clamp(parseFloat(document.getElementById('height-input').value), currentModule.height_min_mm, currentModule.height_max_mm);
  const depth_mm = clamp(parseFloat(document.getElementById('depth-input').value), currentModule.depth_min_mm, currentModule.depth_max_mm);

  // colorsByRole (migration 035) — um registro de "colors" por papel
  // escolhido pelo cliente (ver renderColorRoleSwatchGroups), substitui o
  // par fixo boxColor/doorColor.
  const colorsByRole = {};
  Object.keys(selectedColorIdByRole).forEach((roleId) => {
    const colors = moduleColorsByRole[roleId] || [];
    colorsByRole[roleId] = colors.find((c) => c.id === selectedColorIdByRole[roleId]) || colors[0];
  });
  const hingeModel = hingeModels.find((h) => h.id === document.getElementById('hinge-model-select').value) || null;
  const slideModel = slideModels.find((s) => s.id === document.getElementById('slide-model-select').value) || null;

  const shelfQuantities = {};
  document.querySelectorAll('.shelf-qty-input').forEach((input) => {
    shelfQuantities[input.dataset.pieceId] = parseInt(input.value, 10);
  });

  // Peças opcionais (puxador, rodapé, tampo, pé...) só entram se o cliente
  // marcou a caixinha — as demais (client_optional=false) entram sempre,
  // igual antes. Essa lista filtrada é o que vai tanto pro desenho 3D
  // quanto pro cálculo de preço, pra manter os dois sempre coerentes.
  const effectivePieces = pieces.filter((p) => !p.client_optional || selectedOptionalComponentIds.has(p.id));

  // Desenho 3D é só ilustrativo — usa as MESMAS dimensões já resolvidas
  // pelas fórmulas de cada componente (Pricing.calculatePiece, a mesma
  // função usada no cálculo de preço) pra montar as peças de verdade dentro
  // do volume do módulo, cada uma na posição cadastrada (position_role).
  // Atualiza independente do cálculo de preço dar certo ou não, e nunca
  // deixa um erro do visualizador quebrar o resto.
  try {
    const moduleDims = { W: width_mm, H: height_mm, D: depth_mm };
    // resolvePiecesForViewer já cuida da redução de altura pelo pé
    // (Pricing.resolveBodyDims), da profundidade fixa (pickDrawerDepth) e da
    // recursão em peças-módulo (child_pieces) — mesma lógica usada no
    // cálculo de preço, pra desenho e preço nunca divergirem.
    const parts = resolvePiecesForViewer(effectivePieces, moduleDims, colorsByRole, shelfQuantities);
    Viewer3D.update({ width_mm, height_mm, depth_mm, parts, refit: viewer3dNeedsRefit });
    viewer3dNeedsRefit = false;
  } catch (err) {
    // Se o Three.js falhar por algum motivo, a calculadora de preço continua normal.
  }

  try {
    // Cálculo local (mesma fórmula do admin). Peças/preços vêm do banco;
    // nada é exposto ao cliente além do total.
    const result = Pricing.calculateModulePrice({
      module: currentModule, pieces: effectivePieces, colorsByRole, hingeModel, slideModel, shelfQuantities,
      width_mm, height_mm, depth_mm, markupMultiplier: pricingMarkupMultiplier
    });
    // Guardado junto no result (não devolvido por Pricing.calculateModulePrice
    // — ele não conhece nomes de papel, só ids) pra virar quotes.selected_colors
    // na hora de enviar o orçamento (ver submit de #quote-form abaixo).
    result.selected_colors = Object.keys(colorsByRole).map((roleId) => ({
      role_id: roleId,
      role_name: (colorRolesCache.find((r) => r.id === roleId) || {}).name || null,
      color_id: colorsByRole[roleId] ? colorsByRole[roleId].id : null,
      color_name: colorsByRole[roleId] ? colorsByRole[roleId].name : null
    }));
    lastResult = result;
    document.getElementById('total-price').textContent = '$' + result.total.toFixed(2);
    document.getElementById('price-section').style.display = 'block';
  } catch (err) {
    showError('Não foi possível calcular o preço com essas opções: ' + err.message);
    document.getElementById('price-section').style.display = 'none';
    lastResult = null;
  }
}

function clamp(value, min, max) {
  if (isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

// ---------- Envio de orçamento ----------

document.getElementById('quote-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!lastResult) return;
  clearError();

  const payload = {
    module_id: currentModule.id,
    selected_colors: lastResult.selected_colors,
    hinge_model_id: lastResult.hinge_model_id,
    slide_model_id: lastResult.slide_model_id,
    width_mm: lastResult.width_mm,
    height_mm: lastResult.height_mm,
    depth_mm: lastResult.depth_mm,
    shelf_quantities: lastResult.shelf_quantities,
    total_price: lastResult.total,
    breakdown: lastResult.breakdown, // guardado para uso interno, cliente não vê
    client_name: document.getElementById('client-name').value.trim(),
    client_email: document.getElementById('client-email').value.trim(),
    client_phone: document.getElementById('client-phone').value.trim(),
    status: 'submitted'
  };

  const { error } = await supabaseClient.from('quotes').insert(payload);
  if (error) { showError('Erro ao enviar orçamento: ' + error.message); return; }

  document.getElementById('quote-form-wrap').style.display = 'none';
  document.getElementById('quote-success').style.display = 'block';
});

// Botões SEPARADOS (pedido do usuário): "Abrir portas" só mexe nas peças com
// dobradiça (Viewer3D.toggleDoorsOnly), "Abrir gavetas" só nas de corrediça
// (Viewer3D.toggleDrawersOnly) — cada botão com seu próprio estado, sem
// afetar o outro.
const toggleDoorsBtn = document.getElementById('toggle-doors-btn');
if (toggleDoorsBtn) {
  toggleDoorsBtn.addEventListener('click', () => {
    try {
      const isOpen = Viewer3D.toggleDoorsOnly();
      toggleDoorsBtn.textContent = isOpen
        ? (toggleDoorsBtn.dataset.closeLabel || 'Fechar portas')
        : (toggleDoorsBtn.dataset.openLabel || 'Abrir portas');
    } catch (err) {
      // Sem Three.js o botão simplesmente não faz nada.
    }
  });
}

const toggleDrawersBtn = document.getElementById('toggle-drawers-btn');
if (toggleDrawersBtn) {
  toggleDrawersBtn.addEventListener('click', () => {
    try {
      const isOpen = Viewer3D.toggleDrawersOnly();
      toggleDrawersBtn.textContent = isOpen
        ? (toggleDrawersBtn.dataset.closeLabel || 'Fechar gavetas')
        : (toggleDrawersBtn.dataset.openLabel || 'Abrir gavetas');
    } catch (err) {
      // Sem Three.js o botão simplesmente não faz nada.
    }
  });
}

// Balão de info da peça (duplo-clique no 3D, ver Viewer3D.onPieceDoubleClick
// em viewer3d.js) — mostra nome/referência, L/A/P (na unidade escolhida
// pelo cliente) e nome da cor. NUNCA mostra preço (o breakdown de custo é
// interno/admin, ver pricing.js). position:fixed com coordenadas de TELA
// (event.clientX/clientY), então funciona igual em qualquer scroll/layout.
function showPieceInfoTooltip(info, clientX, clientY) {
  const tooltip = document.getElementById('piece-info-tooltip');
  if (!tooltip) return;
  const unitSelect = document.getElementById('unit-select');
  const unit = unitSelect ? unitSelect.value : 'mm';
  const dims = `L ${formatDimension(info.width_mm, unit)} × A ${formatDimension(info.height_mm, unit)} × P ${formatDimension(info.depth_mm, unit)}`;
  tooltip.innerHTML = `
    <button type="button" class="piece-info-close" aria-label="Fechar">&times;</button>
    <strong>${info.reference || 'Peça'}</strong>
    <div>${dims}</div>
    ${info.color_name ? `<div>${info.color_name}</div>` : ''}
  `;
  tooltip.style.display = 'block';
  positionPieceInfoTooltip(tooltip, clientX, clientY);
  const closeBtn = tooltip.querySelector('.piece-info-close');
  if (closeBtn) closeBtn.addEventListener('click', () => { tooltip.style.display = 'none'; });
}

// Posiciona o balão perto do ponto clicado, sem deixar vazar pra fora da
// janela (inverte pro lado oposto do cursor quando não cabe).
function positionPieceInfoTooltip(tooltip, clientX, clientY) {
  const rect = tooltip.getBoundingClientRect();
  let left = clientX + 14;
  let top = clientY + 14;
  if (left + rect.width > window.innerWidth) left = clientX - rect.width - 14;
  if (top + rect.height > window.innerHeight) top = clientY - rect.height - 14;
  tooltip.style.left = Math.max(8, left) + 'px';
  tooltip.style.top = Math.max(8, top) + 'px';
}

// Fecha o balão com 1 clique em qualquer lugar fora dele (o duplo-clique que
// o abre já disparou seus 2 cliques ANTES do dblclick chegar em
// Viewer3D.onPieceDoubleClick, então não fecha sozinho ao abrir).
document.addEventListener('click', (e) => {
  const tooltip = document.getElementById('piece-info-tooltip');
  if (tooltip && tooltip.style.display !== 'none' && !tooltip.contains(e.target)) {
    tooltip.style.display = 'none';
  }
});

(async function init() {
  try {
    Viewer3D.init('viewer3d-canvas');
    Viewer3D.onPieceDoubleClick(showPieceInfoTooltip);
  } catch (err) {
    // Sem Three.js/WebGL a calculadora continua funcionando normalmente,
    // só sem o desenho 3D.
  }
  await loadColorRoles();
  await loadPricingMarkup();
  await loadTaxonomyFilters();
  await loadModules();
})();
