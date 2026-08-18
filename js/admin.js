// Painel admin — LEGNO PORTAL WEB
// CRUD de taxonomia, catálogos de opcionais, cores, componentes (biblioteca
// reutilizável), módulos (pai) e o vínculo módulo x componentes. Mostra o
// breakdown completo de cálculo para conferência (o cliente nunca vê essa
// tela).

let colorsCache = [];
let sheetSizesCache = []; // tamanhos de chapa (migration 063) — usados pelo select "Tamanho de chapa padrão" no form de cor
let modulesCache = [];
let selectedModuleId = null;
let componentsCache = [];       // biblioteca global de componentes
let moduleComponentLinks = [];  // [{ component_id, quantity_override }] do módulo selecionado
let modulePieces = [];          // componentes ligados ao módulo, já com a quantidade efetiva resolvida
let moduleComponentRenderedIds = new Set(); // ids já mostrados como linha (usados + adicionados nesta sessão, ainda não salvos) — usado pra filtrar o select de "Adicionar componente"
let moduleAddComponentSelectEl = null; // <select> vivo da seção "Adicionar componente" do módulo atual
let moduleAddComponentSectionEl = null; // wrapper vivo da seção "Adicionar componente" — novas linhas são inseridas antes dele
let familiesCache = [];
let categoriesCache = [];
let subcategoriesCache = [];
let componentTypesCache = [];
let hingeModelsCache = [];
let slideModelsCache = [];
let laborTypesCache = [];
let colorRolesCache = []; // catálogo de papéis de cor (migration 035) — ex: "Caixa", "Porta/Frente", e quantos mais o admin criar
let marginProfilesCache = []; // catálogo de margens nomeadas (migration 070) — ver seção "MARGENS POR FAMÍLIA/CATEGORIA"

function showError(elId, err) {
  const el = document.getElementById(elId);
  el.textContent = err && err.message ? err.message : String(err);
  el.style.display = 'block';
}
function clearError(elId) {
  const el = document.getElementById(elId);
  el.textContent = '';
  el.style.display = 'none';
}

// ==========================================================================
// Helper genérico: CRUD simples de tabela "lookup" (id, name, active)
// Usado para families / categories / subcategories.
// ==========================================================================

function setupLookupCRUD(opts) {
  const { table, tbodyId, formId, idFieldId, nameFieldId, cacheSetter, onLoaded } = opts;
  // errorElId é opcional — todo uso antigo (families/categories/subcategories)
  // continua mostrando erro em "taxonomy-error"; um uso novo (ex: color_roles,
  // fora da aba Taxonomia) pode passar o próprio elemento de erro.
  const errorElId = opts.errorElId || 'taxonomy-error';
  // Campo extra opcional (migration 070, pedido do usuário: "na opcao da
  // categoria ou familia, eu tenha opcao de ligar com a margem que eu
  // quero") — só families/categories passam isso (ver setupLookupCRUD abaixo);
  // subcategories/color_roles continuam sem, de propósito (pedido foi só
  // "familia ou categoria"). extraLabel() resolve o nome exibido na tabela
  // (ex: nome do perfil de margem, ou "Padrão" quando null).
  const extraSelectFieldId = opts.extraSelectFieldId || null;
  const extraSelectColumn = opts.extraSelectColumn || null;
  const extraLabel = opts.extraLabel || (() => '');

  async function load() {
    let { data, error } = await supabaseClient.from(table).select('*').order('sort_order').order('name');
    // Fallback pra quem ainda não rodou migration_057 (sort_order pode não
    // existir ainda nessa tabela) — sem isso o order('sort_order') falha e
    // a lista inteira vem vazia, não só desordenada. Ver mesmo comentário em
    // portal.js loadTaxonomyFilters.
    if (error) {
      ({ data, error } = await supabaseClient.from(table).select('*').order('name'));
    }
    if (error) { showError(errorElId, error); return; }
    cacheSetter(data);
    render(data);
    if (onLoaded) onLoaded(data);
  }

  // Setas ▲▼ pra reordenar — mesma ideia de moveColor (ver admin.js "CORES"):
  // troca o sort_order dos dois vizinhos e regrava os dois. items já chega
  // ordenado por sort_order (load() acima), então o índice na lista É a
  // posição visual. Essa ordem é o que o portal usa nas abas de
  // família/categoria/subcategoria (a aba "Todas" continua fixa no fim,
  // isso é decidido no portal.js, não aqui).
  window[formId + '_move'] = async function (id, dir) {
    const items = window[formId + '_items'] || [];
    const index = items.findIndex((x) => x.id === id);
    const otherIndex = index + dir;
    if (index === -1 || otherIndex < 0 || otherIndex >= items.length) return;
    const a = items[index];
    const b = items[otherIndex];
    const { error } = await supabaseClient.from(table).upsert([
      { ...a, sort_order: b.sort_order },
      { ...b, sort_order: a.sort_order }
    ]);
    if (error) { showError(errorElId, error); return; }
    load();
  };

  function render(items) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';
    items.forEach((item, index) => {
      const tr = document.createElement('tr');
      const upDisabled = index === 0 ? 'disabled' : '';
      const downDisabled = index === items.length - 1 ? 'disabled' : '';
      tr.innerHTML = `
        <td>${item.name}</td>
        ${extraSelectFieldId ? `<td class="hint">${extraLabel(item) || 'Padrão'}</td>` : ''}
        <td>
          <button type="button" class="secondary" style="margin-top:0;padding:4px 8px;" ${upDisabled} onclick="window['${formId}_move']('${item.id}', -1)" title="Mover pra cima">▲</button>
          <button type="button" class="secondary" style="margin-top:0;padding:4px 8px;" ${downDisabled} onclick="window['${formId}_move']('${item.id}', 1)" title="Mover pra baixo">▼</button>
          <button type="button" class="secondary" style="margin-top:0;padding:4px 8px;" onclick="window['${formId}_edit']('${item.id}')">Editar</button>
          <button type="button" class="danger" style="margin-top:0;padding:4px 8px;" onclick="window['${formId}_delete']('${item.id}')">X</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  window[formId + '_edit'] = function (id) {
    const items = window[formId + '_items'] || [];
    const item = items.find((x) => x.id === id);
    if (!item) return;
    document.getElementById(idFieldId).value = item.id;
    document.getElementById(nameFieldId).value = item.name;
    if (extraSelectFieldId) {
      const extraEl = document.getElementById(extraSelectFieldId);
      if (extraEl) extraEl.value = item[extraSelectColumn] || '';
    }
  };

  window[formId + '_delete'] = async function (id) {
    if (!confirm('Excluir este item?')) return;
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if (error) { showError(errorElId, error); return; }
    load();
  };

  document.getElementById(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(errorElId);
    const id = document.getElementById(idFieldId).value || undefined;
    const payload = { name: document.getElementById(nameFieldId).value.trim(), active: true };
    if (extraSelectFieldId) {
      const extraEl = document.getElementById(extraSelectFieldId);
      payload[extraSelectColumn] = (extraEl && extraEl.value) || null;
    }
    if (id) {
      payload.id = id;
    } else {
      // Item novo entra no FIM da lista (maior sort_order + 1) — sem isso
      // nasceria com sort_order=0 e pularia pro topo, bagunçando a ordem que
      // o admin já organizou com as setas ▲▼ (mesma lógica de cor nova, ver
      // "CORES" acima).
      const items = window[formId + '_items'] || [];
      const maxSortOrder = items.reduce((max, it) => Math.max(max, it.sort_order || 0), 0);
      payload.sort_order = maxSortOrder + 1;
    }
    const { error } = await supabaseClient.from(table).upsert(payload);
    if (error) { showError(errorElId, error); return; }
    e.target.reset();
    document.getElementById(idFieldId).value = '';
    load();
  });

  return { load };
}

// margin_profile_id (migration 070) — nome mostrado na tabela é resolvido
// contra marginProfilesCache (declarado mais abaixo, na seção "MARGENS POR
// FAMÍLIA/CATEGORIA"); populateMarginProfileSelects() (idem) é quem
// preenche as <select id="family-margin-profile">/"category-margin-profile".
function marginProfileLabel(item) {
  if (!item.margin_profile_id) return '';
  const profile = (marginProfilesCache || []).find((p) => p.id === item.margin_profile_id);
  return profile ? `${profile.name} (${markupMultiplierToPercent(profile.markup_multiplier).toFixed(0)}%)` : '';
}

const familiesCRUD = setupLookupCRUD({
  table: 'families', tbodyId: 'families-tbody', formId: 'family-form',
  idFieldId: 'family-id', nameFieldId: 'family-name',
  extraSelectFieldId: 'family-margin-profile', extraSelectColumn: 'margin_profile_id', extraLabel: marginProfileLabel,
  cacheSetter: (data) => { familiesCache = data; window['family-form_items'] = data; populateModuleTaxonomySelects(); }
});
const categoriesCRUD = setupLookupCRUD({
  table: 'categories', tbodyId: 'categories-tbody', formId: 'category-form',
  idFieldId: 'category-id', nameFieldId: 'category-name',
  extraSelectFieldId: 'category-margin-profile', extraSelectColumn: 'margin_profile_id', extraLabel: marginProfileLabel,
  cacheSetter: (data) => { categoriesCache = data; window['category-form_items'] = data; populateModuleTaxonomySelects(); }
});
const subcategoriesCRUD = setupLookupCRUD({
  table: 'subcategories', tbodyId: 'subcategories-tbody', formId: 'subcategory-form',
  idFieldId: 'subcategory-id', nameFieldId: 'subcategory-name',
  cacheSetter: (data) => { subcategoriesCache = data; window['subcategory-form_items'] = data; populateModuleTaxonomySelects(); }
});

function populateModuleTaxonomySelects() {
  fillSelect('module-family', familiesCache);
  fillSelect('module-category', categoriesCache);
  fillSelect('module-subcategory', subcategoriesCache);
  // Reaplica os nomes de família/categoria/subcategoria na árvore de
  // "Configurar módulo" (renderModuleConfigTree é definida mais abaixo no
  // arquivo, mas é function declaration — já existe por hoisting).
  if (typeof renderModuleConfigTree === 'function') renderModuleConfigTree();
}

function fillSelect(selectId, items) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">—</option>';
  items.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.name;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

// ==========================================================================
// FUNÇÕES DO MÓDULO + RECEITA DO AMBIENTE (migration 080)
// ==========================================================================
//
// Não usa setupLookupCRUD porque essas tabelas têm mais que name+active
// (key/description/mount_hint), e a receita é uma tabela de ligação com
// quantidade — o helper genérico não cobre nenhum dos dois sem virar um
// emaranhado de opções.
//
// A `key` é o contrato com o prompt e com o validador do portal: só é
// editável na CRIAÇÃO. Renomear o `name` depois é livre e não quebra nada.

let moduleFunctionsCache = [];
let roomTypesCache = [];
let roomRecipesCache = [];

const MOUNT_TYPE_LABELS = { floor: 'Chão', wall: 'Suspenso', tall: 'Coluna alta' };

async function loadModuleFunctions() {
  const { data, error } = await supabaseClient
    .from('module_functions').select('*').order('sort_order').order('name');
  if (error) { showError('room-ai-error', error); return; }
  moduleFunctionsCache = data || [];
  renderModuleFunctions();
  populateModuleFunctionSelects();
}

function renderModuleFunctions() {
  const tbody = document.getElementById('module-functions-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  moduleFunctionsCache.forEach((f) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code style="font-size:11px;">${f.key}</code></td>
      <td>${f.name}${f.active ? '' : ' <span class="badge">inativo</span>'}</td>
      <td>${MOUNT_TYPE_LABELS[f.mount_hint] || '—'}</td>
      <td>
        <button type="button" class="secondary" onclick="editModuleFunction('${f.id}')">Editar</button>
        <button type="button" class="danger" onclick="deleteModuleFunction('${f.id}')">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Popula tanto o <select> do formulário de módulo quanto o da receita.
function populateModuleFunctionSelects() {
  const moduleSel = document.getElementById('module-function');
  if (moduleSel) {
    const prev = moduleSel.value;
    moduleSel.innerHTML = '<option value="">— sem função —</option>';
    moduleFunctionsCache.filter((f) => f.active).forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      moduleSel.appendChild(opt);
    });
    if (prev) moduleSel.value = prev;
  }
  const recipeSel = document.getElementById('room-recipe-function');
  if (recipeSel) {
    const prev = recipeSel.value;
    recipeSel.innerHTML = '';
    moduleFunctionsCache.filter((f) => f.active).forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = f.name;
      recipeSel.appendChild(opt);
    });
    if (prev) recipeSel.value = prev;
  }
}

window.editModuleFunction = function (id) {
  const f = moduleFunctionsCache.find((x) => x.id === id);
  if (!f) return;
  document.getElementById('module-function-id').value = f.id;
  document.getElementById('module-function-key').value = f.key;
  document.getElementById('module-function-key').readOnly = true;
  document.getElementById('module-function-name').value = f.name;
  document.getElementById('module-function-mount').value = f.mount_hint || '';
  document.getElementById('module-function-description').value = f.description || '';
};

window.deleteModuleFunction = async function (id) {
  // modules.function_id é "on delete" sem cascade (fica null por não ser
  // not null? não — a FK é restrita), então avisa em vez de dar erro cru.
  const usedBy = (modulesCache || []).filter((m) => m.function_id === id).length;
  const msg = usedBy > 0
    ? `${usedBy} módulo(s) usam esta função e vão ficar sem função (e fora do gerador por IA). Excluir mesmo assim?`
    : 'Excluir esta função?';
  if (!confirm(msg)) return;
  // Solta os módulos primeiro pra FK não barrar a exclusão.
  if (usedBy > 0) {
    const { error: clearErr } = await supabaseClient.from('modules').update({ function_id: null }).eq('function_id', id);
    if (clearErr) { showError('room-ai-error', clearErr); return; }
  }
  const { error } = await supabaseClient.from('module_functions').delete().eq('id', id);
  if (error) { showError('room-ai-error', error); return; }
  await loadModuleFunctions();
  await loadRoomRecipes();
  await loadModules();
};

const moduleFunctionForm = document.getElementById('module-function-form');
if (moduleFunctionForm) {
  moduleFunctionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('room-ai-error');
    const id = document.getElementById('module-function-id').value || undefined;
    // Normaliza a chave (minúscula, sem espaço) — ela vai pro prompt e pro
    // validador; espaço/acento aqui só gera confusão depois.
    const rawKey = document.getElementById('module-function-key').value.trim().toLowerCase();
    const key = rawKey.replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
    if (!key) { showError('room-ai-error', 'Chave inválida.'); return; }
    const maxSort = moduleFunctionsCache.reduce((max, f) => Math.max(max, f.sort_order || 0), 0);
    const payload = {
      key,
      name: document.getElementById('module-function-name').value.trim(),
      mount_hint: document.getElementById('module-function-mount').value || null,
      description: document.getElementById('module-function-description').value.trim() || null
    };
    if (id) payload.id = id; else payload.sort_order = maxSort + 10;
    const { error } = await supabaseClient.from('module_functions').upsert(payload);
    if (error) { showError('room-ai-error', error); return; }
    e.target.reset();
    document.getElementById('module-function-id').value = '';
    document.getElementById('module-function-key').readOnly = false;
    await loadModuleFunctions();
  });
}

// ---------- Ambientes + receita ----------

async function loadRoomTypes() {
  const { data, error } = await supabaseClient
    .from('room_types').select('*').order('sort_order').order('name');
  if (error) { showError('room-ai-error', error); return; }
  roomTypesCache = data || [];
  const sel = document.getElementById('room-type-select');
  if (sel) {
    const prev = sel.value;
    sel.innerHTML = '';
    roomTypesCache.forEach((rt) => {
      const opt = document.createElement('option');
      opt.value = rt.id;
      opt.textContent = rt.name;
      sel.appendChild(opt);
    });
    if (prev && roomTypesCache.some((rt) => rt.id === prev)) sel.value = prev;
  }
  await loadRoomRecipes();
}

function selectedRoomTypeId() {
  const sel = document.getElementById('room-type-select');
  return sel ? sel.value : '';
}

async function loadRoomRecipes() {
  const roomTypeId = selectedRoomTypeId();
  if (!roomTypeId) { roomRecipesCache = []; renderRoomRecipes(); return; }
  const { data, error } = await supabaseClient
    .from('room_recipes').select('*').eq('room_type_id', roomTypeId).order('priority', { ascending: false });
  if (error) { showError('room-ai-error', error); return; }
  roomRecipesCache = data || [];
  renderRoomRecipes();
}

function renderRoomRecipes() {
  const tbody = document.getElementById('room-recipes-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  roomRecipesCache.forEach((r) => {
    const fn = moduleFunctionsCache.find((f) => f.id === r.function_id);
    const tr = document.createElement('tr');
    // Obrigatória (min >= 1) em negrito: é a informação que mais importa
    // olhando a tabela — é o que o portal vai completar sozinho se faltar.
    const nameHtml = r.min_qty >= 1
      ? `<strong>${fn ? fn.name : '(função removida)'}</strong>`
      : (fn ? fn.name : '(função removida)');
    tr.innerHTML = `
      <td>${nameHtml}</td>
      <td>${r.min_qty}</td>
      <td>${r.max_qty == null ? '∞' : r.max_qty}</td>
      <td>${r.priority}</td>
      <td>
        <button type="button" class="secondary" onclick="editRoomRecipe('${r.id}')">Editar</button>
        <button type="button" class="danger" onclick="deleteRoomRecipe('${r.id}')">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.editRoomRecipe = function (id) {
  const r = roomRecipesCache.find((x) => x.id === id);
  if (!r) return;
  document.getElementById('room-recipe-id').value = r.id;
  document.getElementById('room-recipe-function').value = r.function_id;
  document.getElementById('room-recipe-min').value = r.min_qty;
  document.getElementById('room-recipe-max').value = r.max_qty == null ? '' : r.max_qty;
  document.getElementById('room-recipe-priority').value = r.priority;
  document.getElementById('room-recipe-note').value = r.placement_note || '';
};

window.deleteRoomRecipe = async function (id) {
  if (!confirm('Excluir esta linha da receita?')) return;
  const { error } = await supabaseClient.from('room_recipes').delete().eq('id', id);
  if (error) { showError('room-ai-error', error); return; }
  await loadRoomRecipes();
};

const roomTypeSelectEl = document.getElementById('room-type-select');
if (roomTypeSelectEl) roomTypeSelectEl.addEventListener('change', () => { loadRoomRecipes(); });

const roomRecipeForm = document.getElementById('room-recipe-form');
if (roomRecipeForm) {
  roomRecipeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('room-ai-error');
    const roomTypeId = selectedRoomTypeId();
    if (!roomTypeId) { showError('room-ai-error', 'Selecione um ambiente primeiro.'); return; }
    const maxRaw = document.getElementById('room-recipe-max').value;
    const payload = {
      room_type_id: roomTypeId,
      function_id: document.getElementById('room-recipe-function').value,
      min_qty: parseInt(document.getElementById('room-recipe-min').value, 10) || 0,
      max_qty: maxRaw === '' ? null : (parseInt(maxRaw, 10) || 0),
      priority: parseInt(document.getElementById('room-recipe-priority').value, 10) || 0,
      placement_note: document.getElementById('room-recipe-note').value.trim() || null
    };
    const id = document.getElementById('room-recipe-id').value;
    if (id) payload.id = id;
    if (payload.max_qty != null && payload.max_qty < payload.min_qty) {
      showError('room-ai-error', 'Máximo não pode ser menor que o mínimo.');
      return;
    }
    // onConflict na chave única (room_type_id, function_id) — sem isso,
    // salvar de novo a mesma função do mesmo ambiente estoura violação de
    // unique em vez de atualizar a linha existente.
    const { error } = await supabaseClient
      .from('room_recipes').upsert(payload, { onConflict: 'room_type_id,function_id' });
    if (error) { showError('room-ai-error', error); return; }
    e.target.reset();
    document.getElementById('room-recipe-id').value = '';
    await loadRoomRecipes();
  });
}

// ==========================================================================
// Helper genérico: CRUD de catálogo com preço (hinge_models / slide_models /
// labor_types) — todos têm name + price_per_unit + active.
// ==========================================================================

function setupPricedCatalogCRUD(opts) {
  const { table, tbodyId, formId, idFieldId, nameFieldId, priceFieldId, unitLabel, cacheSetter } = opts;

  async function load() {
    const { data, error } = await supabaseClient.from(table).select('*').order('name');
    if (error) { showError('catalogs-error', error); return; }
    cacheSetter(data);
    window[formId + '_items'] = data;
    render(data);
  }

  function render(items) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';
    items.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.name}</td>
        <td>$${Number(item.price_per_unit).toFixed(2)} ${unitLabel}</td>
        <td>${item.active ? '<span class="badge">ativo</span>' : '<span class="badge">inativo</span>'}</td>
        <td>
          <button type="button" class="secondary" onclick="window['${formId}_edit']('${item.id}')">Editar</button>
          <button type="button" class="danger" onclick="window['${formId}_delete']('${item.id}')">Excluir</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  window[formId + '_edit'] = function (id) {
    const items = window[formId + '_items'] || [];
    const item = items.find((x) => x.id === id);
    if (!item) return;
    document.getElementById(idFieldId).value = item.id;
    document.getElementById(nameFieldId).value = item.name;
    document.getElementById(priceFieldId).value = item.price_per_unit;
  };

  window[formId + '_delete'] = async function (id) {
    if (!confirm('Excluir este item?')) return;
    const { error } = await supabaseClient.from(table).delete().eq('id', id);
    if (error) { showError('catalogs-error', error); return; }
    load();
  };

  document.getElementById(formId).addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('catalogs-error');
    const id = document.getElementById(idFieldId).value || undefined;
    const payload = {
      name: document.getElementById(nameFieldId).value.trim(),
      price_per_unit: parseFloat(document.getElementById(priceFieldId).value),
      active: true
    };
    if (id) payload.id = id;
    const { error } = await supabaseClient.from(table).upsert(payload);
    if (error) { showError('catalogs-error', error); return; }
    e.target.reset();
    document.getElementById(idFieldId).value = '';
    load();
  });

  return { load };
}

const hingeModelsCRUD = setupPricedCatalogCRUD({
  table: 'hinge_models', tbodyId: 'hinge-models-tbody', formId: 'hinge-model-form',
  idFieldId: 'hinge-model-id', nameFieldId: 'hinge-model-name', priceFieldId: 'hinge-model-price',
  unitLabel: '/ un', cacheSetter: (data) => { hingeModelsCache = data; renderModuleOptionLinks(); populateTestCalcOptionSelects(); }
});
const slideModelsCRUD = setupPricedCatalogCRUD({
  table: 'slide_models', tbodyId: 'slide-models-tbody', formId: 'slide-model-form',
  idFieldId: 'slide-model-id', nameFieldId: 'slide-model-name', priceFieldId: 'slide-model-price',
  unitLabel: '/ un', cacheSetter: (data) => { slideModelsCache = data; renderModuleOptionLinks(); populateTestCalcOptionSelects(); }
});
const laborTypesCRUD = setupPricedCatalogCRUD({
  table: 'labor_types', tbodyId: 'labor-types-tbody', formId: 'labor-type-form',
  idFieldId: 'labor-type-id', nameFieldId: 'labor-type-name', priceFieldId: 'labor-type-price',
  unitLabel: '/ un', cacheSetter: (data) => { laborTypesCache = data; fillSelect('component-labor-type', laborTypesCache); }
});

// Catálogo de PAPÉIS DE COR (migration 035) — substitui o binário fixo
// caixa/porta. Reusa o mesmo helper de families/categories/subcategories
// (name + active), só aponta o erro pro elemento próprio da seção.
const colorRolesCRUD = setupLookupCRUD({
  table: 'color_roles', tbodyId: 'color-roles-tbody', formId: 'color-role-form',
  idFieldId: 'color-role-id', nameFieldId: 'color-role-name', errorElId: 'color-roles-error',
  cacheSetter: (data) => {
    colorRolesCache = data;
    window['color-role-form_items'] = data;
    fillSelect('component-type-color-role', colorRolesCache);
    // Refaz qualquer UI que já tenha montado seletores por papel — sem isso,
    // criar/renomear um papel só refletiria depois de trocar de aba e voltar.
    renderModuleColorLinks();
    if (typeof renderModuleComponentsList === 'function') renderModuleComponentsList();
  }
});

// ---------- MARGEM DE PREÇO (migration 037) ----------
// Tabela singleton (1 linha só, id fixo true) — só carrega/atualiza essa
// linha, não é um CRUD de lista como os catálogos acima. Guardada em
// multiplicador (1.35 = +35%) no banco, mas mostrada/editada no admin como
// PERCENTUAL (mais natural pra digitar margem) — a conversão é só aqui.
let pricingSettingsCache = { markup_multiplier: 1 };

function markupMultiplierToPercent(multiplier) {
  return (Number(multiplier) - 1) * 100;
}

async function loadPricingSettings() {
  clearError('pricing-settings-error');
  const { data, error } = await supabaseClient.from('pricing_settings').select('*').eq('id', true).single();
  if (error) { showError('pricing-settings-error', error); return; }
  pricingSettingsCache = data;
  document.getElementById('pricing-margin-percent').value = markupMultiplierToPercent(data.markup_multiplier).toFixed(2);
  // Densidade do material (migration 061) — só pra estimar o peso mostrado
  // ao cliente (ver comentário no admin.html); default 700 se a coluna
  // ainda não existir num banco antigo (migration não rodada).
  const densityEl = document.getElementById('pricing-density-kg-m3');
  if (densityEl) densityEl.value = Number(data.weight_density_kg_per_m3 ?? 700);
  // Plano de Corte (migration 051) — mesmos campos, formulário separado.
  const cutlistMarginEl = document.getElementById('pricing-cutlist-margin-percent');
  const cutlistThicknessEl = document.getElementById('pricing-cutlist-thickness-percent');
  const cutlistLaborEl = document.getElementById('pricing-cutlist-labor-price');
  if (cutlistMarginEl) cutlistMarginEl.value = markupMultiplierToPercent(data.cutting_list_markup_multiplier ?? 1).toFixed(2);
  if (cutlistThicknessEl) cutlistThicknessEl.value = markupMultiplierToPercent(data.cutting_list_thickness_38_multiplier ?? 1).toFixed(2);
  if (cutlistLaborEl) cutlistLaborEl.value = Number(data.cutting_list_labor_price_per_piece ?? 0).toFixed(2);
  // Se o "Teste de cálculo" já tiver um resultado na tela, refaz com a
  // margem atualizada (evita mostrar um preço de cliente desatualizado).
  if (typeof runTestCalculation === 'function' && selectedModuleId) runTestCalculation();
}

// ---------- MARGENS POR FAMÍLIA/CATEGORIA (migration 070) ----------
// Catálogo de margens NOMEADAS, além da margem "Padrão" acima (pricing_settings.
// markup_multiplier) — pedido do usuário 2026-08-02: "quero margens
// diferentes que eu possa aplicar pra modulos diferentes... na opcao da
// categoria ou familia, eu tenha opcao de ligar com a margem que eu quero".
// Mesmo padrão visual/percentual do form de Margem Padrão acima (digita %,
// grava multiplicador). families-form/category-form (setupLookupCRUD,
// bem acima) ganharam um <select> "Margem" que lista estes perfis + "Padrão"
// (value vazio = null = continua usando pricing_settings).
async function loadMarginProfiles() {
  clearError('margin-profiles-error');
  const { data, error } = await supabaseClient.from('margin_profiles').select('*').order('sort_order').order('name');
  if (error) { showError('margin-profiles-error', error); return; }
  marginProfilesCache = data || [];
  window['margin-profile-form_items'] = marginProfilesCache;
  renderMarginProfiles(marginProfilesCache);
  populateMarginProfileSelects();
  // families/categories já carregadas mostram o NOME do perfil (marginProfileLabel
  // lê marginProfilesCache) — precisa re-render pra refletir um rename/exclusão.
  if (familiesCache.length) renderFamiliesTableIfLoaded();
}

// setupLookupCRUD (bem acima) só re-renderiza quando a PRÓPRIA tabela muda —
// families/categories não sabem que margin_profiles mudou. Solução simples:
// re-chama o load() de cada um (families/categoriesCRUD já existem nesse
// ponto do arquivo, hoisting de const não ajuda aqui, então lê via
// window['family-form_items'] em vez de re-fetch pra não gastar rede à toa).
function renderFamiliesTableIfLoaded() {
  if (typeof familiesCRUD !== 'undefined' && familiesCRUD.load) familiesCRUD.load();
  if (typeof categoriesCRUD !== 'undefined' && categoriesCRUD.load) categoriesCRUD.load();
}

// Mesma resolução de portal.js (resolveMarkupMultiplierForModule) — CATEGORIA
// do módulo tem prioridade sobre FAMÍLIA, e nenhuma das duas cai no Padrão
// (pricing_settings.markup_multiplier). Duplicado de propósito (admin.js e
// portal.js não compartilham módulo/bundle) — qualquer mudança na regra de
// resolução precisa ser replicada nos dois arquivos.
function resolveMarkupMultiplierForModule(module) {
  const defaultMultiplier = pricingSettingsCache.markup_multiplier || 1;
  if (!module) return defaultMultiplier;
  const category = module.category_id ? categoriesCache.find((c) => c.id === module.category_id) : null;
  if (category && category.margin_profile_id) {
    const profile = marginProfilesCache.find((p) => p.id === category.margin_profile_id);
    if (profile) return profile.markup_multiplier;
  }
  const family = module.family_id ? familiesCache.find((f) => f.id === module.family_id) : null;
  if (family && family.margin_profile_id) {
    const profile = marginProfilesCache.find((p) => p.id === family.margin_profile_id);
    if (profile) return profile.markup_multiplier;
  }
  return defaultMultiplier;
}

function populateMarginProfileSelects() {
  ['family-margin-profile', 'category-margin-profile'].forEach((id) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Padrão</option>';
    marginProfilesCache.forEach((profile) => {
      const opt = document.createElement('option');
      opt.value = profile.id;
      opt.textContent = `${profile.name} (${markupMultiplierToPercent(profile.markup_multiplier).toFixed(0)}%)`;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  });
}

function renderMarginProfiles(items) {
  const tbody = document.getElementById('margin-profiles-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  items.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.name}</td>
      <td>${markupMultiplierToPercent(item.markup_multiplier).toFixed(2)}%</td>
      <td>
        <button type="button" class="secondary" style="margin-top:0;" onclick="window.marginProfileEdit('${item.id}')">Editar</button>
        <button type="button" class="danger" style="margin-top:0;" onclick="window.marginProfileDelete('${item.id}')">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.marginProfileEdit = function (id) {
  const item = marginProfilesCache.find((p) => p.id === id);
  if (!item) return;
  document.getElementById('margin-profile-id').value = item.id;
  document.getElementById('margin-profile-name').value = item.name;
  document.getElementById('margin-profile-percent').value = markupMultiplierToPercent(item.markup_multiplier).toFixed(2);
};

// Apagar um perfil em uso não quebra família/categoria nenhuma — a FK tem
// "on delete set null" (migration 070), elas voltam pro Padrão sozinhas.
window.marginProfileDelete = async function (id) {
  if (!confirm('Excluir esta margem? Famílias/categorias vinculadas voltam pra margem Padrão.')) return;
  const { error } = await supabaseClient.from('margin_profiles').delete().eq('id', id);
  if (error) { showError('margin-profiles-error', error); return; }
  loadMarginProfiles();
};

const marginProfileForm = document.getElementById('margin-profile-form');
if (marginProfileForm) {
  marginProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('margin-profiles-error');
    const id = document.getElementById('margin-profile-id').value || undefined;
    const name = document.getElementById('margin-profile-name').value.trim();
    const percent = parseFloat(document.getElementById('margin-profile-percent').value);
    if (!name || !isFinite(percent) || percent <= -100) {
      showError('margin-profiles-error', new Error('Informe um nome e uma margem válida (maior que -100%).'));
      return;
    }
    const payload = { name, markup_multiplier: 1 + percent / 100 };
    if (id) payload.id = id;
    const { error } = await supabaseClient.from('margin_profiles').upsert(payload);
    if (error) { showError('margin-profiles-error', error); return; }
    marginProfileForm.reset();
    document.getElementById('margin-profile-id').value = '';
    loadMarginProfiles();
  });
}

// ---------- PLANO DE CORTE — margem/espessura/mão de obra (migration 051) ----------
const pricingCutlistSettingsForm = document.getElementById('pricing-cutlist-settings-form');
if (pricingCutlistSettingsForm) {
  pricingCutlistSettingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('pricing-cutlist-settings-error');
    const statusEl = document.getElementById('pricing-cutlist-settings-status');
    statusEl.textContent = '';
    const marginPercent = parseFloat(document.getElementById('pricing-cutlist-margin-percent').value);
    const thicknessPercent = parseFloat(document.getElementById('pricing-cutlist-thickness-percent').value);
    const laborPrice = parseFloat(document.getElementById('pricing-cutlist-labor-price').value);
    if (!isFinite(marginPercent) || marginPercent < 0 || !isFinite(thicknessPercent) || thicknessPercent < 0 || !isFinite(laborPrice) || laborPrice < 0) {
      showError('pricing-cutlist-settings-error', new Error('Preencha os 3 campos com valores válidos (0 ou mais).'));
      return;
    }
    const { data, error } = await supabaseClient
      .from('pricing_settings')
      .update({
        cutting_list_markup_multiplier: 1 + marginPercent / 100,
        cutting_list_thickness_38_multiplier: 1 + thicknessPercent / 100,
        cutting_list_labor_price_per_piece: laborPrice,
        updated_at: new Date().toISOString()
      })
      .eq('id', true)
      .select()
      .single();
    if (error) { showError('pricing-cutlist-settings-error', error); return; }
    pricingSettingsCache = data;
    statusEl.textContent = 'Configuração salva.';
    setTimeout(() => { statusEl.textContent = ''; }, 3000);
  });
}

// ---------- PERFIS DE USUÁRIO (migration 051) ----------
// user_profiles nasce só quando o cliente loga no portal ao menos uma vez
// (ver ensureOwnUserProfile em portal.js) — role='cliente' por padrão, só o
// admin (aqui) promove pra lojista/contractor/administrador.
//
// "Lojista" virou "Dealer" na tela (migration 075, portal exclusivo do
// dealer: logo própria, galeria privada, toggle Legno/Dealer) — só o RÓTULO
// mudou aqui, o valor gravado em user_profiles.role continua sendo a string
// 'lojista' (nenhuma migration de dado, nenhum outro lugar do código
// precisou mudar).
const ADMIN_ROLE_LABELS = { cliente: 'Cliente', lojista: 'Dealer', contractor: 'Contractor', administrador: 'Administrador' };

// Valor em projetos por usuário (migration 078, pedido do usuário
// 2026-08-03: "quero na tela admin saber quanto cada usuario esta fazendo
// de projetos, em valores") — busca TODOS os user_projects (só possível
// depois da policy "admin read user_projects" da migration 078) e agrupa
// client_user_id -> {count, total, missing} em JS, mesmo padrão de
// agrupamento client-side já usado em outras telas deste app (o volume de
// projetos não justifica RPC/view nova). cached_value_usd é o valor de
// VENDA já calculado (Pricing.calculateModulePrice, sem margem de revenda
// — ver migration 076); projeto NUNCA aberto/salvo depois da 076 fica com
// cached_value_usd null e entra em "missing" em vez de contar como $0 (pra
// não subestimar o total mostrado).
async function loadProjectValueByUser() {
  const byUser = {};
  try {
    const { data, error } = await supabaseClient
      .from('user_projects')
      .select('client_user_id, cached_value_usd');
    if (error) throw error;
    (data || []).forEach((row) => {
      const key = row.client_user_id;
      if (!byUser[key]) byUser[key] = { count: 0, total: 0, missing: 0 };
      byUser[key].count += 1;
      if (row.cached_value_usd === null || row.cached_value_usd === undefined) {
        byUser[key].missing += 1;
      } else {
        byUser[key].total += Number(row.cached_value_usd) || 0;
      }
    });
  } catch (err) {
    console.error('Não deu pra carregar o valor de projetos por usuário (migration 078 rodou?):', err);
  }
  return byUser;
}

async function loadProfiles() {
  clearError('profiles-error');
  const tbody = document.getElementById('profiles-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="hint">Carregando...</td></tr>';
  const [{ data, error }, projectValueByUser] = await Promise.all([
    supabaseClient.from('user_profiles').select('*').order('created_at', { ascending: false }),
    loadProjectValueByUser()
  ]);
  if (error) { showError('profiles-error', error); tbody.innerHTML = ''; return; }
  tbody.innerHTML = '';
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="hint">Nenhum usuário cadastrado ainda.</td></tr>';
    return;
  }
  data.forEach((profile) => {
    const tr = document.createElement('tr');
    const dateStr = profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '—';
    const options = Object.keys(ADMIN_ROLE_LABELS).map((role) =>
      `<option value="${role}" ${profile.role === role ? 'selected' : ''}>${ADMIN_ROLE_LABELS[role]}</option>`
    ).join('');
    const projStats = projectValueByUser[profile.user_id];
    const projectsCell = projStats ? String(projStats.count) : '0';
    const valueCell = projStats
      ? `$${projStats.total.toFixed(2)}` + (projStats.missing > 0 ? ` <span class="hint">(+${projStats.missing} sem valor calculado)</span>` : '')
      : '—';
    tr.innerHTML = `
      <td><input type="text" class="profile-name-input" value="${(profile.full_name || '').replace(/"/g, '&quot;')}" placeholder="—" style="width:140px;" /></td>
      <td>${profile.email || '—'}</td>
      <td><select class="profile-role-select">${options}</select></td>
      <td>${dateStr}</td>
      <td>${projectsCell}</td>
      <td>${valueCell}</td>
      <td><button type="button" class="secondary profile-save-btn" style="margin-top:0;">Salvar</button></td>
    `;
    tr.querySelector('.profile-save-btn').addEventListener('click', async () => {
      const role = tr.querySelector('.profile-role-select').value;
      const fullName = tr.querySelector('.profile-name-input').value.trim();
      const { error: updateError } = await supabaseClient
        .from('user_profiles')
        .update({ role, full_name: fullName || null, updated_at: new Date().toISOString() })
        .eq('user_id', profile.user_id);
      if (updateError) { showError('profiles-error', updateError); return; }
      const btn = tr.querySelector('.profile-save-btn');
      const original = btn.textContent;
      btn.textContent = 'Salvo!';
      setTimeout(() => { btn.textContent = original; }, 2000);
    });
    tbody.appendChild(tr);
  });
}
document.getElementById('profiles-tab-btn').addEventListener('click', loadProfiles);

// ---------- CRIAR USUÁRIO (migration 053 + Edge Function admin-create-user) ----------
// Conta de verdade (e-mail + senha), pronta pra usar na hora — precisa da
// Edge Function porque criar usuário com senha exige a chave service_role
// do Supabase, que nunca pode ir pro navegador (ver comentário completo no
// topo de supabase/functions/admin-create-user/index.ts).
const createUserForm = document.getElementById('create-user-form');
if (createUserForm) {
  createUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('create-user-error');
    const statusEl = document.getElementById('create-user-status');
    statusEl.textContent = 'Criando...';
    const full_name = document.getElementById('create-user-name').value.trim();
    const email = document.getElementById('create-user-email').value.trim();
    const password = document.getElementById('create-user-password').value;
    const role = document.getElementById('create-user-role').value;
    try {
      const { data, error } = await supabaseClient.functions.invoke('admin-create-user', {
        body: { full_name, email, password, role }
      });
      // supabase-js só popula `error` pra falha de rede/HTTP — uma resposta
      // 4xx/5xx da function com corpo JSON {error: "..."} ainda pode cair
      // aqui como FunctionsHttpError; nesse caso o corpo real vem em
      // error.context (Response) — tenta ler antes de mostrar mensagem genérica.
      if (error) {
        let msg = error.message || 'Erro ao criar usuário.';
        if (error.context && typeof error.context.json === 'function') {
          try { const body = await error.context.json(); if (body && body.error) msg = body.error; } catch (_e) { /* mantém msg genérica */ }
        }
        throw new Error(msg);
      }
      if (data && data.error) throw new Error(data.error);
      statusEl.textContent = `Usuário "${email}" criado.`;
      createUserForm.reset();
      setTimeout(() => { statusEl.textContent = ''; }, 4000);
      loadProfiles();
    } catch (err) {
      statusEl.textContent = '';
      showError('create-user-error', err);
    }
  });
}

// ---------- CRM DE CLIENTES DA FÁBRICA (migration 079) ----------
// Cadastro comercial da fábrica (nome, telefone, empresa, endereço +
// histórico de reuniões) — DIFERENTE de user_profiles/"Perfis" (contas de
// login do portal). Vínculo com um usuário do portal é opcional (campo
// linked_user_id), pensado como primeiro passo do ERP integrado.
let crmClientsCache = [];
let selectedCrmClientId = null;

async function loadCrmClients() {
  clearError('crm-clients-list-error');
  const tbody = document.getElementById('crm-clients-tbody');
  tbody.innerHTML = '<tr><td colspan="5" class="hint">Carregando...</td></tr>';
  const { data, error } = await supabaseClient
    .from('crm_clients')
    .select('*')
    .order('nome', { ascending: true });
  if (error) { showError('crm-clients-list-error', error); tbody.innerHTML = ''; return; }
  crmClientsCache = data || [];
  renderCrmClientsTable(crmClientsCache);
}

function renderCrmClientsTable(list) {
  const tbody = document.getElementById('crm-clients-tbody');
  tbody.innerHTML = '';
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="hint">Nenhum cliente cadastrado ainda.</td></tr>';
    return;
  }
  list.forEach((client) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(client.nome || '—').replace(/</g, '&lt;')}</td>
      <td>${(client.empresa || '—').replace(/</g, '&lt;')}</td>
      <td>${(client.telefone || '—').replace(/</g, '&lt;')}</td>
      <td>${(client.endereco || '—').replace(/</g, '&lt;')}</td>
      <td><button type="button" class="secondary crm-client-view-btn" style="margin-top:0;">Ver</button></td>
    `;
    tr.querySelector('.crm-client-view-btn').addEventListener('click', () => openCrmClientDetail(client.id));
    tbody.appendChild(tr);
  });
}

document.getElementById('crm-clients-search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  if (!q) { renderCrmClientsTable(crmClientsCache); return; }
  renderCrmClientsTable(crmClientsCache.filter((c) =>
    (c.nome || '').toLowerCase().includes(q) || (c.empresa || '').toLowerCase().includes(q)
  ));
});

document.getElementById('crm-client-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('crm-client-error');
  const nome = document.getElementById('crm-client-nome').value.trim();
  const telefone = document.getElementById('crm-client-telefone').value.trim();
  const empresa = document.getElementById('crm-client-empresa').value.trim();
  const endereco = document.getElementById('crm-client-endereco').value.trim();
  const { error } = await supabaseClient.from('crm_clients').insert({
    nome, telefone: telefone || null, empresa: empresa || null, endereco: endereco || null
  });
  if (error) { showError('crm-client-error', error); return; }
  document.getElementById('crm-client-form').reset();
  loadCrmClients();
});

// Popula o select de vínculo com usuário do portal (user_profiles) — só
// carregado quando o painel de detalhe abre pela 1ª vez nesta sessão.
let crmLinkedUserOptionsLoaded = false;
async function populateCrmLinkedUserSelect() {
  if (crmLinkedUserOptionsLoaded) return;
  const { data, error } = await supabaseClient
    .from('user_profiles')
    .select('user_id, full_name, email')
    .order('email', { ascending: true });
  if (error) return; // não bloqueia o resto do painel por causa disso
  const select = document.getElementById('crm-client-edit-linked-user');
  data.forEach((profile) => {
    const opt = document.createElement('option');
    opt.value = profile.user_id;
    opt.textContent = profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email;
    select.appendChild(opt);
  });
  crmLinkedUserOptionsLoaded = true;
}

async function openCrmClientDetail(clientId) {
  selectedCrmClientId = clientId;
  clearError('crm-client-detail-error');
  await populateCrmLinkedUserSelect();
  const client = crmClientsCache.find((c) => c.id === clientId);
  if (!client) return;
  document.getElementById('crm-client-edit-id').value = client.id;
  document.getElementById('crm-client-edit-nome').value = client.nome || '';
  document.getElementById('crm-client-edit-telefone').value = client.telefone || '';
  document.getElementById('crm-client-edit-empresa').value = client.empresa || '';
  document.getElementById('crm-client-edit-endereco').value = client.endereco || '';
  document.getElementById('crm-client-edit-notes').value = client.notes || '';
  document.getElementById('crm-client-edit-linked-user').value = client.linked_user_id || '';
  document.getElementById('crm-client-detail-panel').style.display = '';
  document.getElementById('crm-meeting-date').value = new Date().toISOString().slice(0, 10);
  await loadCrmMeetings(clientId);
  document.getElementById('crm-client-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('crm-client-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('crm-client-detail-error');
  const id = document.getElementById('crm-client-edit-id').value;
  const statusEl = document.getElementById('crm-client-edit-status');
  const linkedUserVal = document.getElementById('crm-client-edit-linked-user').value;
  const { error } = await supabaseClient.from('crm_clients').update({
    nome: document.getElementById('crm-client-edit-nome').value.trim(),
    telefone: document.getElementById('crm-client-edit-telefone').value.trim() || null,
    empresa: document.getElementById('crm-client-edit-empresa').value.trim() || null,
    endereco: document.getElementById('crm-client-edit-endereco').value.trim() || null,
    notes: document.getElementById('crm-client-edit-notes').value.trim() || null,
    linked_user_id: linkedUserVal || null,
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (error) { showError('crm-client-detail-error', error); return; }
  statusEl.textContent = 'Salvo!';
  setTimeout(() => { statusEl.textContent = ''; }, 2000);
  loadCrmClients();
});

document.getElementById('crm-client-delete-btn').addEventListener('click', async () => {
  const id = document.getElementById('crm-client-edit-id').value;
  if (!id) return;
  if (!confirm('Excluir este cliente e todo o histórico de reuniões dele? Essa ação não pode ser desfeita.')) return;
  const { error } = await supabaseClient.from('crm_clients').delete().eq('id', id);
  if (error) { showError('crm-client-detail-error', error); return; }
  document.getElementById('crm-client-detail-panel').style.display = 'none';
  selectedCrmClientId = null;
  loadCrmClients();
});

async function loadCrmMeetings(clientId) {
  clearError('crm-meetings-error');
  const tbody = document.getElementById('crm-meetings-tbody');
  tbody.innerHTML = '<tr><td colspan="3" class="hint">Carregando...</td></tr>';
  const { data, error } = await supabaseClient
    .from('crm_client_meetings')
    .select('*')
    .eq('client_id', clientId)
    .order('meeting_date', { ascending: false });
  if (error) { showError('crm-meetings-error', error); tbody.innerHTML = ''; return; }
  tbody.innerHTML = '';
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="hint">Nenhuma reunião registrada ainda.</td></tr>';
    return;
  }
  data.forEach((meeting) => {
    const tr = document.createElement('tr');
    const dateStr = meeting.meeting_date ? new Date(meeting.meeting_date + 'T00:00:00').toLocaleDateString('pt-BR') : '—';
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${(meeting.notes || '').replace(/</g, '&lt;')}</td>
      <td><button type="button" class="secondary crm-meeting-delete-btn" style="margin-top:0;">Excluir</button></td>
    `;
    tr.querySelector('.crm-meeting-delete-btn').addEventListener('click', async () => {
      if (!confirm('Excluir esta reunião do histórico?')) return;
      const { error: delError } = await supabaseClient.from('crm_client_meetings').delete().eq('id', meeting.id);
      if (delError) { showError('crm-meetings-error', delError); return; }
      loadCrmMeetings(clientId);
    });
    tbody.appendChild(tr);
  });
}

document.getElementById('crm-meeting-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('crm-meetings-error');
  if (!selectedCrmClientId) return;
  const meeting_date = document.getElementById('crm-meeting-date').value;
  const notes = document.getElementById('crm-meeting-notes').value.trim();
  const { error } = await supabaseClient.from('crm_client_meetings').insert({
    client_id: selectedCrmClientId, meeting_date, notes
  });
  if (error) { showError('crm-meetings-error', error); return; }
  document.getElementById('crm-meeting-notes').value = '';
  loadCrmMeetings(selectedCrmClientId);
});

document.getElementById('crm-clients-tab-btn').addEventListener('click', loadCrmClients);

// ---------- CONTROLADORIA (dashboard) ----------
// Pedido do usuário 2026-08-05: "quantos pedidos entraram, quantos
// orçamentos foram gerados, quantos novos clientes se cadastraram" — tudo
// calculado no navegador em cima de tabelas que já existem (orders/quotes/
// user_profiles), sem migration nova. "Pedidos entrados" usa o MESMO filtro
// de status que a aba Pedidos já usa (submitted/approved/paid/delivered —
// ver renderOrdersList), pra bater com o que o admin já vê lá. "Orçamentos
// gerados" conta toda linha de quotes no período (a calculadora avulsa cria
// a linha assim que o orçamento é gerado). "Novos clientes cadastrados" é
// novo registro em user_profiles (contas de login do portal — não confundir
// com o CRM acima, que é cadastro manual do admin).

function getControladoriaRange() {
  const preset = document.getElementById('controladoria-period-select').value;
  const now = new Date();
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start;
  if (preset === 'custom') {
    const fromVal = document.getElementById('controladoria-date-from').value;
    const toVal = document.getElementById('controladoria-date-to').value;
    start = fromVal ? new Date(fromVal + 'T00:00:00') : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
    if (toVal) end = new Date(toVal + 'T23:59:59.999');
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  } else {
    const days = parseInt(preset, 10) || 30;
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1), 0, 0, 0, 0);
  }
  return { start, end };
}

function fmtDateBR(d) { return d.toLocaleDateString('pt-BR'); }

// Chave local YYYY-MM-DD — evita o bug clássico de usar toISOString() (UTC)
// pra bucketizar por dia, que desloca o dia perto da virada de fuso.
function crmDayKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildDayBuckets(start, end) {
  const days = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function renderBarChart(chartElId, labelsElId, days, countsByKey) {
  const chartEl = document.getElementById(chartElId);
  const labelsEl = document.getElementById(labelsElId);
  chartEl.innerHTML = '';
  labelsEl.innerHTML = '';
  const max = Math.max(1, ...days.map((d) => countsByKey[crmDayKey(d)] || 0));
  const labelEvery = Math.max(1, Math.ceil(days.length / 10));
  days.forEach((d, i) => {
    const key = crmDayKey(d);
    const count = countsByKey[key] || 0;
    const col = document.createElement('div');
    col.className = 'bar-col';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${Math.max(2, Math.round((count / max) * 100))}%`;
    bar.title = `${fmtDateBR(d)}: ${count}`;
    col.appendChild(bar);
    chartEl.appendChild(col);
    const span = document.createElement('span');
    span.textContent = (i % labelEvery === 0 || i === days.length - 1) ? `${d.getDate()}/${d.getMonth() + 1}` : '';
    labelsEl.appendChild(span);
  });
}

function renderKpiCard(value, label, breakdownLines) {
  const card = document.createElement('div');
  card.className = 'kpi-card';
  const breakdownHtml = breakdownLines && breakdownLines.length
    ? `<div class="kpi-breakdown">${breakdownLines.join('<br>')}</div>` : '';
  card.innerHTML = `<div class="kpi-value">${value}</div><div class="kpi-label">${label}</div>${breakdownHtml}`;
  return card;
}

async function loadControladoria() {
  clearError('controladoria-error');
  const { start, end } = getControladoriaRange();
  document.getElementById('controladoria-range-label').textContent = `${fmtDateBR(start)} — ${fmtDateBR(end)}`;
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const [ordersRes, quotesRes, profilesRes] = await Promise.all([
    supabaseClient.from('orders')
      .select('id, order_type, submitted_at')
      .in('status', ['submitted', 'approved', 'paid', 'delivered'])
      .gte('submitted_at', startISO).lte('submitted_at', endISO),
    supabaseClient.from('quotes')
      .select('id, created_at')
      .gte('created_at', startISO).lte('created_at', endISO),
    supabaseClient.from('user_profiles')
      .select('user_id, created_at, role')
      .gte('created_at', startISO).lte('created_at', endISO)
  ]);
  if (ordersRes.error) { showError('controladoria-error', ordersRes.error); return; }
  if (quotesRes.error) { showError('controladoria-error', quotesRes.error); return; }
  if (profilesRes.error) { showError('controladoria-error', profilesRes.error); return; }

  const orders = ordersRes.data || [];
  const quotes = quotesRes.data || [];
  const profiles = profilesRes.data || [];

  const cardsEl = document.getElementById('controladoria-cards');
  cardsEl.innerHTML = '';
  const ORDER_TYPE_LABELS = { modules: 'Módulos', project: 'Projeto', cutting_list: 'Plano de Corte' };
  const orderTypeCounts = {};
  orders.forEach((o) => { const t = o.order_type || 'modules'; orderTypeCounts[t] = (orderTypeCounts[t] || 0) + 1; });
  const orderBreakdown = Object.keys(orderTypeCounts).map((t) => `${ORDER_TYPE_LABELS[t] || t}: ${orderTypeCounts[t]}`);
  cardsEl.appendChild(renderKpiCard(orders.length, 'Pedidos entrados', orderBreakdown));

  cardsEl.appendChild(renderKpiCard(quotes.length, 'Orçamentos gerados'));

  const roleCounts = {};
  profiles.forEach((p) => { const r = p.role || 'cliente'; roleCounts[r] = (roleCounts[r] || 0) + 1; });
  const roleBreakdown = Object.keys(roleCounts).map((r) => `${ADMIN_ROLE_LABELS[r] || r}: ${roleCounts[r]}`);
  cardsEl.appendChild(renderKpiCard(profiles.length, 'Novos clientes cadastrados', roleBreakdown));

  // Gráfico diário — só faz sentido pra período curto o bastante pra ficar
  // legível; período mais longo (custom grande) fica só com os cards.
  const days = buildDayBuckets(start, end);
  const noteEl = document.getElementById('controladoria-chart-note');
  const chartsEl = document.getElementById('controladoria-charts');
  if (days.length > 92) {
    chartsEl.style.display = 'none';
    noteEl.style.display = 'block';
    return;
  }
  chartsEl.style.display = 'flex';
  noteEl.style.display = 'none';

  const ordersByDay = {};
  orders.forEach((o) => { if (o.submitted_at) { const k = crmDayKey(new Date(o.submitted_at)); ordersByDay[k] = (ordersByDay[k] || 0) + 1; } });
  const quotesByDay = {};
  quotes.forEach((q) => { const k = crmDayKey(new Date(q.created_at)); quotesByDay[k] = (quotesByDay[k] || 0) + 1; });
  const profilesByDay = {};
  profiles.forEach((p) => { const k = crmDayKey(new Date(p.created_at)); profilesByDay[k] = (profilesByDay[k] || 0) + 1; });

  renderBarChart('controladoria-chart-orders', 'controladoria-chart-orders-labels', days, ordersByDay);
  renderBarChart('controladoria-chart-quotes', 'controladoria-chart-quotes-labels', days, quotesByDay);
  renderBarChart('controladoria-chart-clients', 'controladoria-chart-clients-labels', days, profilesByDay);
}

document.getElementById('controladoria-period-select').addEventListener('change', () => {
  const isCustom = document.getElementById('controladoria-period-select').value === 'custom';
  document.getElementById('controladoria-custom-from').style.display = isCustom ? '' : 'none';
  document.getElementById('controladoria-custom-to').style.display = isCustom ? '' : 'none';
  if (!isCustom) loadControladoria();
});
document.getElementById('controladoria-refresh-btn').addEventListener('click', loadControladoria);
document.getElementById('controladoria-tab-btn').addEventListener('click', loadControladoria);

document.getElementById('pricing-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('pricing-settings-error');
  const statusEl = document.getElementById('pricing-settings-status');
  statusEl.textContent = '';
  const percent = parseFloat(document.getElementById('pricing-margin-percent').value);
  const density = parseFloat(document.getElementById('pricing-density-kg-m3').value);
  if (!isFinite(percent) || percent < 0) {
    showError('pricing-settings-error', new Error('Informe uma margem válida (0 ou mais).'));
    return;
  }
  if (!isFinite(density) || density < 0) {
    showError('pricing-settings-error', new Error('Informe uma densidade válida (0 ou mais).'));
    return;
  }
  const multiplier = 1 + percent / 100;
  const { data, error } = await supabaseClient
    .from('pricing_settings')
    .update({ markup_multiplier: multiplier, weight_density_kg_per_m3: density, updated_at: new Date().toISOString() })
    .eq('id', true)
    .select()
    .single();
  if (error) { showError('pricing-settings-error', error); return; }
  pricingSettingsCache = data;
  statusEl.textContent = 'Margem salva.';
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
  if (typeof runTestCalculation === 'function' && selectedModuleId) runTestCalculation();
});

// ---------- FURAÇÃO — CONFIGURAÇÕES (migrations 038 + 043) ----------
// Aba "Furação": dobradiça automática (porta + base na lateral) e tolerância
// de contato (drilling_settings, singleton). A furação PADRÃO de cada peça —
// incluindo o CONTRA-FURO propagado pra peça tocada, que substituiu o antigo
// padrão global de toque (drilling_touch_holes, DEPRECIADA) — fica no
// formulário do componente, não aqui.

async function loadDrillingSettingsTab() {
  clearError('drilling-settings-error');
  const settingsRes = await supabaseClient.from('drilling_settings').select('*').eq('id', true).single();

  if (settingsRes.error) { showError('drilling-settings-error', settingsRes.error); return; }
  const s = settingsRes.data || {};
  document.getElementById('drilling-touch-tolerance').value = s.touch_tolerance_mm ?? 5;
  document.getElementById('drilling-hinge-enabled').checked = s.hinge_enabled !== false;
  document.getElementById('drilling-hinge-cup-diameter').value = s.hinge_cup_diameter_mm ?? 35;
  document.getElementById('drilling-hinge-cup-depth').value = s.hinge_cup_depth_mm ?? 13;
  document.getElementById('drilling-hinge-cup-from-edge').value = s.hinge_cup_center_from_edge_mm ?? 22;
  document.getElementById('drilling-hinge-margin').value = s.hinge_edge_margin_mm ?? 100;
  document.getElementById('drilling-hinge-mark-diameter').value = s.hinge_mark_diameter_mm ?? 3;
  document.getElementById('drilling-hinge-mark-depth').value = s.hinge_mark_depth_mm ?? 2;
  document.getElementById('drilling-hinge-mark-offset').value = s.hinge_mark_offset_mm ?? 24;
  document.getElementById('drilling-hinge-mark-from-edge').value = s.hinge_mark_center_from_edge_mm ?? 28;
  // Base da dobradiça na lateral (migration 043)
  document.getElementById('drilling-plate-enabled').checked = s.hinge_plate_enabled !== false;
  document.getElementById('drilling-plate-diameter').value = s.hinge_plate_diameter_mm ?? 5;
  document.getElementById('drilling-plate-depth').value = s.hinge_plate_depth_mm ?? 12;
  document.getElementById('drilling-plate-from-front').value = s.hinge_plate_from_front_mm ?? 37;
  document.getElementById('drilling-plate-spacing').value = s.hinge_plate_screw_spacing_mm ?? 32;
  // Corrediça undermount (migration 044)
  document.getElementById('drilling-slide-enabled').checked = s.slide_enabled !== false;
  document.getElementById('drilling-slide-diameter').value = s.slide_diameter_mm ?? 5;
  document.getElementById('drilling-slide-depth').value = s.slide_depth_mm ?? 12;
  document.getElementById('drilling-slide-height').value = s.slide_height_mm ?? 37;
  document.getElementById('drilling-slide-holes').value = slideHolesToText(s.slide_holes_json);
  // Suporte de prateleira na lateral (migration 045)
  document.getElementById('drilling-shelf-enabled').checked = s.shelf_enabled !== false;
  document.getElementById('drilling-shelf-diameter').value = s.shelf_diameter_mm ?? 3;
  document.getElementById('drilling-shelf-depth').value = s.shelf_depth_mm ?? 10;
  document.getElementById('drilling-shelf-front').value = s.shelf_front_setback_mm ?? 37;
  document.getElementById('drilling-shelf-back').value = s.shelf_back_setback_mm ?? 37;
  document.getElementById('drilling-shelf-voffset').value = s.shelf_vertical_offset_mm ?? 0;
}

// {"305":[37,165,261],...} <-> "305:37,165,261; 381:..." (formato do input)
function slideHolesToText(json) {
  let o = json;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (e) { o = null; } }
  if (!o || typeof o !== 'object') return '305:37,165,261; 381:37,165,357; 457:37,165,357; 533:37,165,453';
  return Object.keys(o).sort((a, b) => Number(a) - Number(b))
    .map((len) => len + ':' + (o[len] || []).join(',')).join('; ');
}

function slideHolesFromText(text) {
  const out = {};
  String(text || '').split(';').forEach((chunk) => {
    const [len, dists] = chunk.split(':');
    const L = parseFloat(len);
    if (!(L > 0) || !dists) return;
    const arr = dists.split(',').map((d) => parseFloat(d)).filter((d) => d > 0);
    if (arr.length) out[Math.round(L)] = arr;
  });
  return Object.keys(out).length ? out : null;
}
document.getElementById('drilling-settings-tab-btn').addEventListener('click', loadDrillingSettingsTab);

document.getElementById('drilling-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('drilling-settings-error');
  const statusEl = document.getElementById('drilling-settings-status');
  statusEl.textContent = '';
  const val = (id) => parseFloat(document.getElementById(id).value);
  const payload = {
    touch_tolerance_mm: val('drilling-touch-tolerance'),
    hinge_enabled: document.getElementById('drilling-hinge-enabled').checked,
    hinge_cup_diameter_mm: val('drilling-hinge-cup-diameter'),
    hinge_cup_depth_mm: val('drilling-hinge-cup-depth'),
    hinge_cup_center_from_edge_mm: val('drilling-hinge-cup-from-edge'),
    hinge_edge_margin_mm: val('drilling-hinge-margin'),
    hinge_mark_diameter_mm: val('drilling-hinge-mark-diameter'),
    hinge_mark_depth_mm: val('drilling-hinge-mark-depth'),
    hinge_mark_offset_mm: val('drilling-hinge-mark-offset'),
    hinge_mark_center_from_edge_mm: val('drilling-hinge-mark-from-edge'),
    hinge_plate_enabled: document.getElementById('drilling-plate-enabled').checked,
    hinge_plate_diameter_mm: val('drilling-plate-diameter'),
    hinge_plate_depth_mm: val('drilling-plate-depth'),
    hinge_plate_from_front_mm: val('drilling-plate-from-front'),
    hinge_plate_screw_spacing_mm: val('drilling-plate-spacing'),
    slide_enabled: document.getElementById('drilling-slide-enabled').checked,
    slide_diameter_mm: val('drilling-slide-diameter'),
    slide_depth_mm: val('drilling-slide-depth'),
    slide_height_mm: val('drilling-slide-height'),
    slide_holes_json: slideHolesFromText(document.getElementById('drilling-slide-holes').value),
    shelf_enabled: document.getElementById('drilling-shelf-enabled').checked,
    shelf_diameter_mm: val('drilling-shelf-diameter'),
    shelf_depth_mm: val('drilling-shelf-depth'),
    shelf_front_setback_mm: val('drilling-shelf-front'),
    shelf_back_setback_mm: val('drilling-shelf-back'),
    shelf_vertical_offset_mm: val('drilling-shelf-voffset'),
    updated_at: new Date().toISOString()
  };
  if (!payload.slide_holes_json) {
    showError('drilling-settings-error', new Error('Furos por trilho: formato inválido — use "305:37,165,261; 381:37,165,357".'));
    return;
  }
  const skipCheck = ['hinge_enabled', 'hinge_plate_enabled', 'slide_enabled', 'shelf_enabled', 'slide_holes_json', 'updated_at'];
  for (const k of Object.keys(payload)) {
    if (!skipCheck.includes(k) && !isFinite(payload[k])) {
      showError('drilling-settings-error', new Error('Preencha todos os campos numéricos com valores válidos.'));
      return;
    }
  }
  const { error } = await supabaseClient.from('drilling_settings').update(payload).eq('id', true);
  if (error) { showError('drilling-settings-error', error); return; }
  statusEl.textContent = 'Configurações salvas.';
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
});

// ---------- TIPOS DE COMPONENTE ----------
// Tipo do componente (Lateral, Base, Prateleira, Porta, Gaveta...).
// color_role_id (migration 035) decide qual papel de cor peças desse tipo
// usam — substitui o antigo boolean is_front (só 2 opções fixas) e o campo
// manual "papel da cor" por componente, ainda mais antigo.

async function loadComponentTypes() {
  const { data, error } = await supabaseClient.from('component_types').select('*, color_roles(*)').order('name');
  if (error) { showError('component-types-error', error); return; }
  componentTypesCache = data;
  renderComponentTypes();
  fillSelect('component-type', componentTypesCache);
}

// Rótulos amigáveis pro valor cru salvo em component_types.positioning —
// usado só pra exibir na tabela (o <select> do formulário já mostra o texto
// completo nas próprias <option>).
const POSITIONING_LABELS = {
  horizontal: 'Horizontal',
  vertical: 'Vertical',
  vertical_no_plano: 'Vertical no plano',
  horizontal_no_plano: 'Horizontal no plano'
};
function positioningLabel(value) {
  return POSITIONING_LABELS[value] || '<span class="hint">automático</span>';
}

function renderComponentTypes() {
  const tbody = document.getElementById('component-types-tbody');
  tbody.innerHTML = '';
  componentTypesCache.forEach((t) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.color_roles ? t.color_roles.name : '<span class="hint">sem papel</span>'}</td>
      <td>${positioningLabel(t.positioning)}</td>
      <td>${t.active ? '<span class="badge">ativo</span>' : '<span class="badge">inativo</span>'}</td>
      <td><button class="secondary" onclick="editComponentType('${t.id}')">Editar</button>
          <button class="danger" onclick="deleteComponentType('${t.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.editComponentType = function (id) {
  const t = componentTypesCache.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('component-type-id').value = t.id;
  document.getElementById('component-type-name').value = t.name;
  document.getElementById('component-type-color-role').value = t.color_role_id || '';
  document.getElementById('component-type-positioning').value = t.positioning || '';
};

window.deleteComponentType = async function (id) {
  if (!confirm('Excluir este tipo de componente?')) return;
  const { error } = await supabaseClient.from('component_types').delete().eq('id', id);
  if (error) { showError('component-types-error', error); return; }
  loadComponentTypes();
};

document.getElementById('component-type-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('component-types-error');
  const id = document.getElementById('component-type-id').value || undefined;
  const payload = {
    name: document.getElementById('component-type-name').value.trim(),
    color_role_id: document.getElementById('component-type-color-role').value || null,
    positioning: document.getElementById('component-type-positioning').value || null,
    active: true
  };
  if (id) payload.id = id;
  const { error } = await supabaseClient.from('component_types').upsert(payload);
  if (error) { showError('component-types-error', error); return; }
  e.target.reset();
  document.getElementById('component-type-id').value = '';
  loadComponentTypes();
});

// ---------- (REMOVIDO) MODELOS DE PORTA / MODELOS DE GAVETA ----------
// Migration 023 (módulo-como-componente): o sistema especial de "modelo de
// porta" e "modelo de gaveta" (door_styles/drawer_types + suas composições e
// profundidades fixas) foi REMOVIDO por inteiro. Um estilo de porta ou uma
// construção de gaveta agora é só um módulo comum — normalmente marcado
// "Invisível" (ver checkbox no formulário de módulo) pra não aparecer na
// galeria do cliente — usado como PEÇA ANINHADA dentro de outro módulo (ver
// "Componentes deste módulo" mais abaixo: seção "Adicionar módulo (peça
// aninhada)"). Profundidade fixa também generalizou: qualquer módulo pode
// ter isso agora (ver "Profundidades fixas" na tela de configurar módulo),
// não só um "modelo de gaveta" especial.

let __removedDoorDrawerStyleSystem = true; // marcador — nada mais usa isso

// ---------- CORES ----------

async function loadColors() {
  const { data, error } = await supabaseClient.from('colors').select('*').order('sort_order').order('name');
  if (error) { showError('colors-error', error); return; }
  colorsCache = data;
  renderColors();
  renderModuleColorLinks();
  populateTestCalcOptionSelects();
  fillSelect('component-preview-color', colorsCache);
  updateComponentPreview();
}

// ---------- TAMANHOS DE CHAPA (migration 063) ----------
// Padrões reutilizáveis (ex: "EGGER 5X9") vinculados por cor no form acima
// (color-default-sheet-size) — usados pelo nesting do "Gerar Plano de
// Corte" no portal do Contractor. Mesmo padrão de CRUD+setas ▲▼ das Cores.

async function loadSheetSizes() {
  const { data, error } = await supabaseClient.from('cutting_list_sheet_sizes').select('*').order('sort_order').order('name');
  if (error) { showError('sheet-sizes-error', error); return; }
  sheetSizesCache = data || [];
  renderSheetSizes();
  populateColorDefaultSheetSizeSelect();
}

// Popula o select do form de cor com os tamanhos cadastrados (inclusive
// inativos, pra não sumir a seleção de uma cor já vinculada a um tamanho
// que foi desativado depois) — mantém o valor selecionado atual se houver.
function populateColorDefaultSheetSizeSelect() {
  const select = document.getElementById('color-default-sheet-size');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">— nenhum (cliente escolhe) —</option>' +
    sheetSizesCache.map((s) => `<option value="${s.id}">${s.name} (${s.width_mm} x ${s.height_mm}mm)${s.active ? '' : ' — inativo'}</option>`).join('');
  select.value = current;
}

function renderSheetSizes() {
  const tbody = document.getElementById('sheet-sizes-tbody');
  tbody.innerHTML = '';
  sheetSizesCache.forEach((s, index) => {
    const tr = document.createElement('tr');
    const upDisabled = index === 0 ? 'disabled' : '';
    const downDisabled = index === sheetSizesCache.length - 1 ? 'disabled' : '';
    tr.innerHTML = `
      <td>${s.name}</td>
      <td>${s.width_mm}</td>
      <td>${s.height_mm}</td>
      <td>${s.kerf_mm}</td>
      <td>${s.active ? '<span class="badge">ativo</span>' : '<span class="badge">inativo</span>'}</td>
      <td>
          <button class="secondary" ${upDisabled} onclick="moveSheetSize('${s.id}', -1)" title="Mover pra cima">▲</button>
          <button class="secondary" ${downDisabled} onclick="moveSheetSize('${s.id}', 1)" title="Mover pra baixo">▼</button>
          <button class="secondary" onclick="editSheetSize('${s.id}')">Editar</button>
          <button class="danger" onclick="deleteSheetSize('${s.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.moveSheetSize = async function (id, dir) {
  const index = sheetSizesCache.findIndex((s) => s.id === id);
  const otherIndex = index + dir;
  if (index === -1 || otherIndex < 0 || otherIndex >= sheetSizesCache.length) return;
  const a = sheetSizesCache[index];
  const b = sheetSizesCache[otherIndex];
  const { error } = await supabaseClient.from('cutting_list_sheet_sizes').upsert([
    { ...a, sort_order: b.sort_order },
    { ...b, sort_order: a.sort_order }
  ]);
  if (error) { showError('sheet-sizes-error', error); return; }
  loadSheetSizes();
};

window.editSheetSize = function (id) {
  const s = sheetSizesCache.find((x) => x.id === id);
  if (!s) return;
  document.getElementById('sheet-size-id').value = s.id;
  document.getElementById('sheet-size-name').value = s.name;
  document.getElementById('sheet-size-width').value = s.width_mm;
  document.getElementById('sheet-size-height').value = s.height_mm;
  document.getElementById('sheet-size-kerf').value = s.kerf_mm;
  document.getElementById('sheet-size-active').checked = s.active;
};

window.deleteSheetSize = async function (id) {
  if (!confirm('Excluir este tamanho de chapa? Cores vinculadas a ele voltam a "nenhum".')) return;
  const { error } = await supabaseClient.from('cutting_list_sheet_sizes').delete().eq('id', id);
  if (error) { showError('sheet-sizes-error', error); return; }
  loadSheetSizes();
};

document.getElementById('sheet-size-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('sheet-sizes-error');
  const id = document.getElementById('sheet-size-id').value || undefined;
  const payload = {
    name: document.getElementById('sheet-size-name').value.trim(),
    width_mm: parseFloat(document.getElementById('sheet-size-width').value),
    height_mm: parseFloat(document.getElementById('sheet-size-height').value),
    kerf_mm: parseFloat(document.getElementById('sheet-size-kerf').value),
    active: document.getElementById('sheet-size-active').checked
  };
  if (id) {
    payload.id = id;
  } else {
    const maxSortOrder = sheetSizesCache.reduce((max, s) => Math.max(max, s.sort_order || 0), 0);
    payload.sort_order = maxSortOrder + 1;
  }
  const { error } = await supabaseClient.from('cutting_list_sheet_sizes').upsert(payload);
  if (error) { showError('sheet-sizes-error', error); return; }
  e.target.reset();
  document.getElementById('sheet-size-id').value = '';
  document.getElementById('sheet-size-kerf').value = '4';
  document.getElementById('sheet-size-active').checked = true;
  loadSheetSizes();
});

function renderColors() {
  const tbody = document.getElementById('colors-tbody');
  tbody.innerHTML = '';
  colorsCache.forEach((c, index) => {
    const tr = document.createElement('tr');
    const thumb = c.texture_url
      ? `<img class="texture-thumb" src="${c.texture_url}" alt="${c.name}" />`
      : `<span class="texture-thumb" style="display:inline-block;background:${c.swatch_hex || '#cccccc'};"></span>`;
    // Setas ▲▼ pra reordenar — controla a ordem que os swatches aparecem
    // tanto aqui quanto pro cliente/portal (ver moveColor). Desabilitada nas
    // pontas (primeira não sobe, última não desce).
    const upDisabled = index === 0 ? 'disabled' : '';
    const downDisabled = index === colorsCache.length - 1 ? 'disabled' : '';
    const sheetSize = sheetSizesCache.find((s) => s.id === c.default_sheet_size_id);
    tr.innerHTML = `
      <td>${thumb}</td>
      <td>${c.name}</td>
      <td>$${Number(c.sheet_price_per_m2).toFixed(2)} / m²</td>
      <td>$${Number(c.edge_price_per_linear_m).toFixed(2)} / m</td>
      <td>${c.stock_in_house ? '<span class="badge">stock in house</span>' : (c.skip_cutting_plan ? '<span class="badge">cor especial</span>' : (sheetSize ? sheetSize.name : '<span class="hint">— nenhum —</span>'))}</td>
      <td>${c.active ? '<span class="badge">ativa</span>' : '<span class="badge">inativa</span>'}</td>
      <td>
          <button class="secondary" ${upDisabled} onclick="moveColor('${c.id}', -1)" title="Mover pra cima">▲</button>
          <button class="secondary" ${downDisabled} onclick="moveColor('${c.id}', 1)" title="Mover pra baixo">▼</button>
          <button class="secondary" onclick="editColor('${c.id}')">Editar</button>
          <button class="danger" onclick="deleteColor('${c.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Troca a ordem de exibição desta cor com a vizinha (dir=-1 sobe, dir=+1
// desce) — troca os valores de sort_order das duas e grava as duas de uma
// vez. colorsCache já está na ordem atual (loadColors ordena por
// sort_order), então o índice na lista é exatamente a posição visual.
window.moveColor = async function (id, dir) {
  const index = colorsCache.findIndex((c) => c.id === id);
  const otherIndex = index + dir;
  if (index === -1 || otherIndex < 0 || otherIndex >= colorsCache.length) return;
  const a = colorsCache[index];
  const b = colorsCache[otherIndex];
  // Manda o registro INTEIRO de cada cor (não só id+sort_order): "name" é
  // obrigatório e sem valor padrão no banco — um upsert parcial só com
  // id+sort_order tentaria inserir a linha com name=null antes mesmo de
  // chegar no conflito, e quebraria com "not-null constraint". Mandando o
  // objeto completo (com sort_order trocado) o resto fica só reafirmado,
  // sem mudar nada de verdade.
  const { error } = await supabaseClient.from('colors').upsert([
    { ...a, sort_order: b.sort_order },
    { ...b, sort_order: a.sort_order }
  ]);
  if (error) { showError('colors-error', error); return; }
  loadColors();
};

async function uploadTextureIfSelected() {
  const fileInput = document.getElementById('color-texture-file');
  const file = fileInput.files && fileInput.files[0];
  if (!file) return null;

  const statusEl = document.getElementById('color-texture-upload-status');
  statusEl.textContent = 'Enviando textura...';

  const ext = file.name.split('.').pop();
  const path = `colors/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabaseClient.storage.from('textures').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (uploadError) {
    statusEl.textContent = '';
    throw new Error('Falha ao subir textura: ' + uploadError.message);
  }

  const { data } = supabaseClient.storage.from('textures').getPublicUrl(path);
  statusEl.textContent = 'Textura enviada.';
  return data.publicUrl;
}

document.getElementById('color-texture-file').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  const preview = document.getElementById('color-texture-preview');
  if (!file) { preview.innerHTML = ''; return; }
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img class="texture-thumb" src="${url}" alt="preview" />`;
});

window.editColor = function (id) {
  const c = colorsCache.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('color-id').value = c.id;
  document.getElementById('color-name').value = c.name;
  document.getElementById('color-sheet-price').value = c.sheet_price_per_m2;
  document.getElementById('color-edge-price').value = c.edge_price_per_linear_m;
  document.getElementById('color-active').checked = c.active;
  document.getElementById('color-swatch-hex').value = c.swatch_hex || '#cccccc';
  document.getElementById('color-texture-url').value = c.texture_url || '';
  document.getElementById('color-texture-file').value = '';
  document.getElementById('color-default-sheet-size').value = c.default_sheet_size_id || '';
  document.getElementById('color-stock-in-house').checked = !!c.stock_in_house;
  document.getElementById('color-skip-cutting-plan').checked = !!c.skip_cutting_plan;
  toggleColorSheetSizeFieldVisibility();
  const preview = document.getElementById('color-texture-preview');
  preview.innerHTML = c.texture_url ? `<img class="texture-thumb" src="${c.texture_url}" alt="preview" />` : '';
  document.getElementById('color-texture-upload-status').textContent = '';
};

// Esconde o select de tamanho de chapa quando "STOCK IN HOUSE" OU "Cor
// Especial" está marcado — nenhum dos dois nunca roda nesting, não tem por
// quê escolher um tamanho que não vai ser usado (migration 064/074).
function toggleColorSheetSizeFieldVisibility() {
  const field = document.getElementById('color-sheet-size-field');
  const stockCheckbox = document.getElementById('color-stock-in-house');
  const specialCheckbox = document.getElementById('color-skip-cutting-plan');
  if (field && stockCheckbox && specialCheckbox) {
    field.style.display = (stockCheckbox.checked || specialCheckbox.checked) ? 'none' : '';
  }
}
document.getElementById('color-stock-in-house').addEventListener('change', toggleColorSheetSizeFieldVisibility);
document.getElementById('color-skip-cutting-plan').addEventListener('change', toggleColorSheetSizeFieldVisibility);

window.deleteColor = async function (id) {
  if (!confirm('Excluir esta cor?')) return;
  const { error } = await supabaseClient.from('colors').delete().eq('id', id);
  if (error) { showError('colors-error', error); return; }
  loadColors();
};

document.getElementById('color-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('colors-error');
  const id = document.getElementById('color-id').value || undefined;

  let texture_url = document.getElementById('color-texture-url').value || null;
  try {
    const uploadedUrl = await uploadTextureIfSelected();
    if (uploadedUrl) texture_url = uploadedUrl;
  } catch (err) {
    showError('colors-error', err);
    return;
  }

  const payload = {
    name: document.getElementById('color-name').value.trim(),
    sheet_price_per_m2: parseFloat(document.getElementById('color-sheet-price').value),
    edge_price_per_linear_m: parseFloat(document.getElementById('color-edge-price').value),
    texture_url: texture_url,
    swatch_hex: document.getElementById('color-swatch-hex').value || '#cccccc',
    default_sheet_size_id: document.getElementById('color-default-sheet-size').value || null,
    stock_in_house: document.getElementById('color-stock-in-house').checked,
    skip_cutting_plan: document.getElementById('color-skip-cutting-plan').checked,
    active: document.getElementById('color-active').checked
  };
  if (id) {
    payload.id = id;
  } else {
    // Cor nova entra no FIM da lista (maior sort_order + 1) — sem isso ela
    // nasceria com sort_order=0 e pularia pro topo, bagunçando a ordem que
    // o admin já tinha organizado com as setas ▲▼.
    const maxSortOrder = colorsCache.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);
    payload.sort_order = maxSortOrder + 1;
  }
  const { error } = await supabaseClient.from('colors').upsert(payload);
  if (error) { showError('colors-error', error); return; }
  e.target.reset();
  document.getElementById('color-id').value = '';
  document.getElementById('color-swatch-hex').value = '#cccccc';
  document.getElementById('color-texture-url').value = '';
  document.getElementById('color-texture-preview').innerHTML = '';
  document.getElementById('color-texture-upload-status').textContent = '';
  document.getElementById('color-default-sheet-size').value = '';
  document.getElementById('color-stock-in-house').checked = false;
  document.getElementById('color-skip-cutting-plan').checked = false;
  toggleColorSheetSizeFieldVisibility();
  document.getElementById('color-active').checked = true;
  loadColors();
});

// ---------- COMPONENTES (biblioteca global reutilizável) ----------

async function loadComponents() {
  const { data, error } = await supabaseClient.from('components').select('*, labor_types(*), component_types(*)').order('reference');
  if (error) { showError('components-error', error); return; }
  componentsCache = data;
  renderComponents();
  renderModuleComponentsList();
  // "Copiar furação de" (migration 038) — o select depende do componentsCache
  // recém-carregado; preenche aqui pra já funcionar sem precisar clicar em
  // Editar/Novo antes.
  populateDrillingCopySelect();
}

const POSITION_ROLE_LABELS = {
  left: 'Lateral esq.', right: 'Lateral dir.', top: 'Topo', bottom: 'Base',
  back: 'Fundo', front: 'Frente/porta', shelf: 'Prateleira', drawer: 'Gaveta',
  // 'drawer_side' (migration 118) = a lateral do CASCO deitada pra trás: o
  // lado longo corre na profundidade, as bordas laminadas ficam em cima e
  // embaixo. Só o DESENHO muda — o componente (Flatbord 2C) é o mesmo.
  drawer_side: 'Lateral de gaveta',
  leg: 'Pé', handle: 'Puxador', baseboard: 'Rodapé',
  countertop: 'Tampo', free: 'Peça livre', other: 'Outro/interno'
};

// Origem do componente (migration 034) — decide se a peça vira linha na
// "Lista de peças" (corte) ou na "Lista de compra" na aba Pedidos do admin.
const ORIGIN_LABELS = { fabricacao: 'Fabricação', comprado: 'Comprado' };

function renderComponents() {
  const tbody = document.getElementById('components-tbody');
  tbody.innerHTML = '';
  componentsCache.forEach((c) => {
    const typeLabel = c.component_types ? c.component_types.name : '<span class="hint">sem tipo</span>';
    const positionLabel = POSITION_ROLE_LABELS[c.position_role] || '—';
    const originLabel = ORIGIN_LABELS[c.origin] || ORIGIN_LABELS.fabricacao;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${typeLabel}</td>
      <td>${c.reference}</td>
      <td>${c.notes || ''}</td>
      <td><code>${c.width_formula}</code></td>
      <td><code>${c.height_formula}</code></td>
      <td><code>${c.depth_formula}</code></td>
      <td><code>${c.area_m2_formula}</code></td>
      <td><code>${c.edge_band_linear_m_formula}</code></td>
      <td>${c.labor_types ? `${c.labor_types.name} ($${Number(c.labor_types.price_per_unit).toFixed(2)})` : '<span class="hint">não definida</span>'}</td>
      <td>${positionLabel}</td>
      <td>${originLabel}</td>
      <td><button class="secondary" onclick="editComponent('${c.id}')">Editar</button>
          <button class="danger" onclick="deleteComponent('${c.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// Mostra bem claro se o formulário está criando um componente novo ou
// editando um já existente — antes disso não tinha NENHUM aviso visual, só
// um campo escondido (component-id) guardando o id do último "Editar"
// clicado, então dava pra sair preenchendo um componente "novo" sem perceber
// que ainda estava em modo edição, e o Salvar sobrescrevia o antigo em vez
// de criar um novo.
function setComponentFormMode(component) {
  const banner = document.getElementById('component-form-banner');
  const bannerRef = document.getElementById('component-form-banner-ref');
  const submitBtn = document.getElementById('component-submit-btn');
  if (component) {
    banner.style.display = 'block';
    bannerRef.textContent = `"${component.reference}"`;
    submitBtn.textContent = `Salvar alterações em "${component.reference}"`;
  } else {
    banner.style.display = 'none';
    bannerRef.textContent = '';
    submitBtn.textContent = 'Salvar novo componente';
  }
}

// Limpa o formulário por completo e volta pro modo "novo componente" — usado
// tanto pelo botão "+ Novo componente" / "Cancelar edição" quanto depois de
// salvar com sucesso.
function resetComponentForm() {
  document.getElementById('component-form').reset();
  document.getElementById('component-id').value = '';
  document.getElementById('component-quantity').value = 1;
  document.getElementById('component-preview-width').value = 800;
  document.getElementById('component-preview-height').value = 2000;
  document.getElementById('component-preview-depth').value = 560;
  document.getElementById('component-origin').value = 'fabricacao';
  // Padrão pedido pelo usuário: um componente novo nasce como "Peça livre"
  // (não "Lateral esquerda", que era só a 1ª opção da lista e acabava
  // "escolhida" por padrão sem ninguém ter escolhido de verdade).
  document.getElementById('component-position-role').value = 'free';
  document.getElementById('component-shape-type').value = 'box'; // migration 062
  document.getElementById('component-tilt-angle').value = 0; // migration 065
  // Furação padrão (migration 038) — formulário novo nasce sem furos.
  componentDrillingsDraft = [];
  renderComponentDrillingRows();
  populateDrillingCopySelect();
  setComponentFormMode(null);
}

document.getElementById('component-new-btn').addEventListener('click', () => {
  resetComponentForm();
  document.getElementById('component-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('component-cancel-edit-btn').addEventListener('click', () => {
  resetComponentForm();
});

window.editComponent = function (id) {
  const c = componentsCache.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('component-id').value = c.id;
  document.getElementById('component-type').value = c.type_id || '';
  document.getElementById('component-reference').value = c.reference;
  document.getElementById('component-quantity').value = c.quantity;
  document.getElementById('component-width-formula').value = c.width_formula;
  document.getElementById('component-height-formula').value = c.height_formula;
  document.getElementById('component-depth-formula').value = c.depth_formula;
  document.getElementById('component-area-formula').value = c.area_m2_formula;
  document.getElementById('component-edge-formula').value = c.edge_band_linear_m_formula;
  document.getElementById('component-labor-type').value = c.labor_type_id || '';
  document.getElementById('component-position-role').value = c.position_role || 'other';
  document.getElementById('component-shape-type').value = c.shape_type || 'box'; // migration 062
  document.getElementById('component-tilt-angle').value = c.tilt_angle_deg || 0; // migration 065
  document.getElementById('component-rotation-y').value = c.rotation_y_deg || 0; // migration 067
  document.getElementById('component-hinge-side').value = c.hinge_side || 'none';
  document.getElementById('component-shelf-support').checked = !!c.drill_shelf_support;
  document.getElementById('component-notes').value = c.notes || '';
  document.getElementById('component-origin').value = c.origin || 'fabricacao';
  // Furação padrão (migration 038) — carrega os furos já salvos deste
  // componente pro rascunho editável (async, preenche quando chegar).
  loadComponentDrillingsIntoForm(c.id);
  setComponentFormMode(c);
  updateComponentPreview();
  document.getElementById('component-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteComponent = async function (id) {
  if (!confirm('Excluir este componente? Ele será removido de todos os módulos que o usam.')) return;
  const { error } = await supabaseClient.from('components').delete().eq('id', id);
  if (error) { showError('components-error', error); return; }
  // Se o componente excluído era o que estava sendo editado no formulário,
  // volta pro modo "novo" — senão o form ficaria com o id de um componente
  // que não existe mais, e o próximo "Salvar" tentaria um upsert órfão.
  if (document.getElementById('component-id').value === id) resetComponentForm();
  loadComponents();
};

document.getElementById('component-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('components-error');

  const payload = {
    type_id: document.getElementById('component-type').value || null,
    reference: document.getElementById('component-reference').value.trim(),
    quantity: parseInt(document.getElementById('component-quantity').value, 10),
    width_formula: document.getElementById('component-width-formula').value.trim(),
    height_formula: document.getElementById('component-height-formula').value.trim(),
    depth_formula: document.getElementById('component-depth-formula').value.trim(),
    area_m2_formula: document.getElementById('component-area-formula').value.trim(),
    edge_band_linear_m_formula: document.getElementById('component-edge-formula').value.trim(),
    labor_type_id: document.getElementById('component-labor-type').value || null,
    position_role: document.getElementById('component-position-role').value || 'other',
    shape_type: document.getElementById('component-shape-type').value || 'box', // migration 062
    tilt_angle_deg: parseFloat(document.getElementById('component-tilt-angle').value) || 0, // migration 065
    rotation_y_deg: parseInt(document.getElementById('component-rotation-y').value, 10) || 0, // migration 067
    hinge_side: document.getElementById('component-hinge-side').value || 'none',
    drill_shelf_support: document.getElementById('component-shelf-support').checked,
    notes: document.getElementById('component-notes').value.trim() || null,
    origin: document.getElementById('component-origin').value || 'fabricacao'
  };

  // Valida as fórmulas antes de salvar, usando dimensões de teste.
  try {
    Pricing.calculatePiece(payload, { W: 800, H: 2000, D: 560 });
  } catch (err) {
    showError('components-error', err);
    return;
  }

  const id = document.getElementById('component-id').value || undefined;
  if (id) payload.id = id;
  // .select().single() pra receber o id de volta — um componente NOVO precisa
  // do id gerado pra salvar a furação padrão (component_drillings) junto.
  const { data: savedComponent, error } = await supabaseClient.from('components').upsert(payload).select('id').single();
  if (error) { showError('components-error', error); return; }

  // FURAÇÃO PADRÃO (migration 038) — salva o rascunho da tabelinha do
  // formulário: apaga tudo do componente e re-insere (mesma estratégia
  // simples de outras listas filhas do admin; a tabela é pequena).
  const drillErr = await saveComponentDrillings(savedComponent.id);
  if (drillErr) { showError('component-drilling-error', drillErr); return; }

  resetComponentForm();
  loadComponents();
});

// ---------- FURAÇÃO PADRÃO DO COMPONENTE (migration 038) ----------
// Rascunho em memória, renderizado como linhas de inputs na tabelinha do
// formulário — só persiste quando o próprio componente é salvo.
let componentDrillingsDraft = [];

const DRILLING_FACE_OPTIONS = [
  ['face', 'Face (por cima)'],
  ['verso', 'Verso (por baixo)'],
  ['borda_esq', 'Borda esquerda (x=0)'],
  ['borda_dir', 'Borda direita (x=C)'],
  ['borda_sup', 'Borda de cima (y=0)'],
  ['borda_inf', 'Borda de baixo (y=L)']
];

function renderComponentDrillingRows() {
  const tbody = document.getElementById('component-drilling-tbody');
  tbody.innerHTML = '';
  if (componentDrillingsDraft.length === 0) {
    tbody.innerHTML = '<tr><td colspan="15" class="hint">Nenhum furo padrão cadastrado nesta peça.</td></tr>';
    updateComponentDrillingPreview();
    return;
  }
  componentDrillingsDraft.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const faceOptions = DRILLING_FACE_OPTIONS
      .map(([v, label]) => `<option value="${v}" ${row.face === v ? 'selected' : ''}>${label}</option>`).join('');
    // Contra-furo (migrations 043 + 054): vale em QUALQUER sentido, mas o
    // significado muda — em furo de BORDA propaga um furo de FACE na peça
    // que a borda encosta (043); em furo de FACE/VERSO propaga um furo de
    // BORDA na peça em pé apoiada naquela face (054, ex: lateral sobre o
    // topcover). Os campos "Copo" (counter_face_*) só existem no caso de
    // FACE: tambor minifix na face da peça apoiada, a "dist." da borda.
    const isEdgeRow = /^borda_/.test(row.face || '');
    const counterTitle = isEdgeRow
      ? 'Furo de FACE gerado na peça que esta borda encosta (ex: lateral)'
      : 'Furo de BORDA gerado na peça em pé apoiada nesta face (ex: cavilha Ø8 / canal do bolt minifix)';
    const camHint = isEdgeRow
      ? ' style="width:55px;background:#fdf3e6;" title="Copo só tem efeito em furo de FACE — é o tambor minifix gerado na peça em pé apoiada"'
      : ' style="width:55px;" title="Tambor minifix gerado na FACE da peça apoiada, a Dist. mm da borda que encostou (ex: Ø12 × 13, dist. 34) — deixe em branco pra propagar só o furo de borda (cavilha)"';
    tr.innerHTML = `
      <td><select data-field="face">${faceOptions}</select></td>
      <td><input data-field="x_formula" value="${row.x_formula || ''}" style="width:70px;" /></td>
      <td><input data-field="y_formula" value="${row.y_formula || ''}" style="width:70px;" /></td>
      <td><input data-field="diameter_mm" type="number" step="0.1" min="0.5" value="${row.diameter_mm ?? ''}" style="width:60px;" /></td>
      <td><input data-field="depth_formula" value="${row.depth_formula || ''}" style="width:60px;" /></td>
      <td><input data-field="repeat_count_formula" value="${row.repeat_count_formula || '1'}" style="width:50px;" /></td>
      <td><input data-field="repeat_dx_mm" type="number" step="0.1" value="${row.repeat_dx_mm ?? 0}" style="width:60px;" /></td>
      <td><input data-field="repeat_dy_mm" type="number" step="0.1" value="${row.repeat_dy_mm ?? 0}" style="width:60px;" /></td>
      <td><input data-field="counter_diameter_mm" type="number" step="0.1" min="0.5" value="${row.counter_diameter_mm ?? ''}" style="width:55px;" title="${counterTitle}" /></td>
      <td><input data-field="counter_depth_mm" type="number" step="0.1" min="0.5" value="${row.counter_depth_mm ?? ''}" style="width:55px;" title="${counterTitle}" /></td>
      <td><input data-field="counter_face_diameter_mm" type="number" step="0.1" min="0.5" value="${row.counter_face_diameter_mm ?? ''}"${camHint} /></td>
      <td><input data-field="counter_face_depth_mm" type="number" step="0.1" min="0.5" value="${row.counter_face_depth_mm ?? ''}"${camHint} /></td>
      <td><input data-field="counter_face_offset_mm" type="number" step="0.1" min="0.5" value="${row.counter_face_offset_mm ?? ''}"${camHint} /></td>
      <td><input data-field="notes" value="${(row.notes || '').replace(/"/g, '&quot;')}" style="width:110px;" /></td>
      <td><button type="button" class="secondary drilling-row-remove" style="margin-top:0;">✕</button></td>
    `;
    tr.querySelectorAll('[data-field]').forEach((el) => {
      el.addEventListener('input', () => { componentDrillingsDraft[idx][el.dataset.field] = el.value; updateComponentDrillingPreview(); });
      el.addEventListener('change', () => {
        componentDrillingsDraft[idx][el.dataset.field] = el.value;
        // trocar o Sentido re-renderiza pra habilitar/desabilitar o contra-furo
        if (el.dataset.field === 'face') { renderComponentDrillingRows(); return; }
        updateComponentDrillingPreview();
      });
    });
    tr.querySelector('.drilling-row-remove').addEventListener('click', () => {
      componentDrillingsDraft.splice(idx, 1);
      renderComponentDrillingRows();
    });
    tbody.appendChild(tr);
  });
  updateComponentDrillingPreview();
}

// ---------- VISUALIZADOR 2D DA FURAÇÃO PADRÃO ----------
// Desenha a peça DEITADA no plano da máquina (mesma convenção do .ban:
// X = 0..C da esquerda, Y = 0..L da borda de cima), com as dimensões de
// teste da Prévia, e plota cada furo do rascunho: furo de face = círculo
// cheio, verso = círculo tracejado, furo de borda = retângulo entrando pela
// borda (comprimento = profundidade). Furo fora da chapa fica VERMELHO —
// mesmo critério do gerador (drilling.js/addHole), que descartaria o furo.
function updateComponentDrillingPreview() {
  const container = document.getElementById('component-drilling-preview');
  const metaEl = document.getElementById('component-drilling-preview-meta');
  if (!container || !metaEl) return;
  container.innerHTML = '';
  metaEl.textContent = '';
  if (typeof Drilling === 'undefined' || !Drilling._internals) return;

  const W = parseFloat(document.getElementById('component-preview-width').value) || 0;
  const H = parseFloat(document.getElementById('component-preview-height').value) || 0;
  const D = parseFloat(document.getElementById('component-preview-depth').value) || 0;
  const piece = {
    quantity: 1,
    width_formula: document.getElementById('component-width-formula').value.trim() || 'W',
    height_formula: document.getElementById('component-height-formula').value.trim() || 'H',
    depth_formula: document.getElementById('component-depth-formula').value.trim() || 'D',
    area_m2_formula: 'w*h/1000000',
    edge_band_linear_m_formula: '0'
  };
  let dims;
  try {
    dims = Pricing.calculatePiece(piece, { W, H, D });
  } catch (e) {
    metaEl.textContent = 'Fórmulas de L/A/P da peça inválidas — corrija acima pra ver o desenho.';
    return;
  }
  const type = componentTypesCache.find((t) => t.id === document.getElementById('component-type').value);
  const positioning = type ? type.positioning : null;
  const t = Drilling._internals.splitThickness(dims.width_mm, dims.height_mm, dims.depth_mm, positioning);
  const m = Drilling._internals.machineDims(t);
  if (!(m.C > 0) || !(m.L > 0)) return;
  metaEl.textContent = 'Plano da máquina: C ' + Math.round(m.C) + ' × L ' + Math.round(m.L)
    + ' mm, espessura E ' + Math.round(m.E) + ' mm — X da esquerda, Y da borda de cima.';

  // avalia os furos (mesma lógica de collectStandardHoles em drilling.js —
  // usa resolveDrillingHoleXY pra aplicar a MESMA rotação/correção de
  // sentido que o gerador real aplica quando a peça gira pro corte).
  // C/L/E = plano de CADASTRO (C = faceA, L = faceB), estáveis mesmo quando
  // a peça gira; W/H = dimensões reais da peça (correção 2026-07-14, junto
  // com a rotação rígida do padrão em drilling.js/localToMachine).
  const vars = { C: t.faceA, L: t.faceB, E: t.thickness, W: dims.width_mm || 0, H: dims.height_mm || 0 };
  const holes = [];
  const badRows = [];
  componentDrillingsDraft.forEach((row, i) => {
    let x, y, depth, count;
    try {
      x = Pricing.evalFormula(row.x_formula || '0', vars);
      y = Pricing.evalFormula(row.y_formula || '0', vars);
      depth = Pricing.evalFormula(row.depth_formula || '0', vars);
      count = Math.max(Math.floor(Pricing.evalFormula(row.repeat_count_formula || '1', vars)), 0);
    } catch (e) { badRows.push(i + 1); return; }
    const dia = parseFloat(row.diameter_mm) || 0;
    for (let k = 0; k < count; k++) {
      const rawX = x + k * (parseFloat(row.repeat_dx_mm) || 0);
      const rawY = y + k * (parseFloat(row.repeat_dy_mm) || 0);
      const resolved = Drilling._internals.resolveDrillingHoleXY(t, row, rawX, rawY) || { face: row.face || 'face', x: rawX, y: rawY };
      const outside = resolved.x < -0.01 || resolved.x > m.C + 0.01 || resolved.y < -0.01 || resolved.y > m.L + 0.01 || !(dia > 0) || !(depth > 0);
      holes.push({ face: resolved.face, x: resolved.x, y: resolved.y, dia, depth, outside });
    }
  });
  if (badRows.length) {
    metaEl.textContent += ' ATENÇÃO: fórmula inválida na(s) linha(s) ' + badRows.join(', ') + ' — furo(s) não desenhado(s).';
  }

  container.innerHTML = buildDrillingPlaneSvg(m, holes);
}

// Desenha o plano da máquina (C × L) com os furos — compartilhado entre o
// visualizador do componente (furação padrão) e o do módulo (Teste de
// cálculo, furação completa: padrão + toque + dobradiça).
// holes: [{ face, x, y, dia, depth, outside }] em coordenadas da máquina.
function buildDrillingPlaneSvg(m, holes) {
  const pad = Math.max(m.C, m.L) * 0.06 + 20; // respiro pras cotas
  const vbW = m.C + 2 * pad;
  const vbH = m.L + 2 * pad;
  const sw = Math.max(m.C, m.L) / 400; // "1px" proporcional ao tamanho da peça
  const fontSize = 11 * (vbW / 640);

  const svgParts = [];
  svgParts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + vbW.toFixed(1) + ' ' + vbH.toFixed(1) + '" style="width:100%;height:auto;border:1px solid #ddd;background:#fff;">');
  // chapa
  svgParts.push('<rect x="' + pad + '" y="' + pad + '" width="' + m.C + '" height="' + m.L + '" fill="#f7f3ec" stroke="#333" stroke-width="' + (sw * 1.5) + '"/>');
  // cotas
  svgParts.push('<text x="' + (pad + m.C / 2) + '" y="' + (pad - 6 * sw) + '" text-anchor="middle" font-size="' + fontSize + '" fill="#555">C = ' + Math.round(m.C) + '</text>');
  svgParts.push('<text x="' + (pad - 6 * sw) + '" y="' + (pad + m.L / 2) + '" text-anchor="middle" font-size="' + fontSize + '" fill="#555" transform="rotate(-90 ' + (pad - 6 * sw) + ' ' + (pad + m.L / 2) + ')">L = ' + Math.round(m.L) + '</text>');
  // origem
  svgParts.push('<text x="' + (pad + 3 * sw) + '" y="' + (pad + fontSize + 2 * sw) + '" font-size="' + (fontSize * 0.9) + '" fill="#999">0,0</text>');

  holes.forEach((h) => {
    const stroke = h.outside ? '#c0392b' : '#1a5276';
    const fill = h.outside ? 'rgba(192,57,43,0.25)' : 'rgba(26,82,118,0.25)';
    const title = '<title>' + h.face + ' — Ø' + h.dia + ' × ' + (Math.round(h.depth * 10) / 10) + 'mm @ X ' + (Math.round(h.x * 10) / 10) + ', Y ' + (Math.round(h.y * 10) / 10) + (h.outside ? ' (FORA DA CHAPA — será ignorado)' : '') + '</title>';
    // círculo no TAMANHO REAL do furo (mínimo ~1px só pra não sumir) — a
    // visibilidade de furo pequeno vem da cruzinha, que tem tamanho mínimo
    // próprio. Antes o raio mínimo era sw*2 e um furo de 3mm era desenhado
    // igual a um de 8mm em peça grande.
    const r = Math.max(h.dia / 2, sw);
    const cr = Math.max(r, sw * 2.5); // meia-largura da cruzinha
    if (h.face === 'face' || h.face === 'verso') {
      const dash = h.face === 'verso' ? ' stroke-dasharray="' + (4 * sw) + ' ' + (3 * sw) + '"' : '';
      svgParts.push('<circle cx="' + (pad + h.x) + '" cy="' + (pad + h.y) + '" r="' + r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"' + dash + '>' + title + '</circle>');
      // cruzinha no centro (também serve de alvo do mouse pro tooltip)
      svgParts.push('<path d="M ' + (pad + h.x - cr) + ' ' + (pad + h.y) + ' h ' + (cr * 2) + ' M ' + (pad + h.x) + ' ' + (pad + h.y - cr) + ' v ' + (cr * 2) + '" stroke="' + stroke + '" stroke-width="' + (sw * 0.8) + '"/>');
      // círculo transparente maior por cima, só pra facilitar o hover/tooltip
      svgParts.push('<circle cx="' + (pad + h.x) + '" cy="' + (pad + h.y) + '" r="' + cr + '" fill="transparent">' + title + '</circle>');
    } else {
      // furo de borda: retângulo entrando pela borda, comprimento = profundidade
      let rx, ry, rw, rh;
      if (h.face === 'borda_esq') { rx = pad; ry = pad + h.y - h.dia / 2; rw = h.depth; rh = h.dia; }
      else if (h.face === 'borda_dir') { rx = pad + m.C - h.depth; ry = pad + h.y - h.dia / 2; rw = h.depth; rh = h.dia; }
      else if (h.face === 'borda_sup') { rx = pad + h.x - h.dia / 2; ry = pad; rw = h.dia; rh = h.depth; }
      else { rx = pad + h.x - h.dia / 2; ry = pad + m.L - h.depth; rw = h.dia; rh = h.depth; }
      svgParts.push('<rect x="' + rx + '" y="' + ry + '" width="' + Math.max(rw, sw) + '" height="' + Math.max(rh, sw) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '">' + title + '</rect>');
    }
  });
  svgParts.push('</svg>');
  return svgParts.join('');
}

// Redesenha o visualizador quando as dimensões de teste ou as fórmulas de
// L/A/P (que mudam o tamanho do plano) ou o tipo (positioning) mudam.
['component-preview-width', 'component-preview-height', 'component-preview-depth',
  'component-width-formula', 'component-height-formula', 'component-depth-formula'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updateComponentDrillingPreview);
});
document.getElementById('component-type').addEventListener('change', updateComponentDrillingPreview);

document.getElementById('component-drilling-add-btn').addEventListener('click', () => {
  componentDrillingsDraft.push({
    face: 'face', x_formula: '', y_formula: '', diameter_mm: 5,
    depth_formula: '10', repeat_count_formula: '1', repeat_dx_mm: 0, repeat_dy_mm: 0,
    counter_diameter_mm: null, counter_depth_mm: null,
    counter_face_diameter_mm: null, counter_face_depth_mm: null, counter_face_offset_mm: null,
    notes: ''
  });
  renderComponentDrillingRows();
});

// ---- Copiar furação de outro componente ----
// O select é preenchido quando o formulário do componente carrega (editar/
// novo) — preencher no focus não funcionava: o navegador abre a listinha
// ANTES da busca async no banco terminar, e ela aparecia vazia. Só lista
// componentes que TÊM furação cadastrada, com a contagem de furos no rótulo.
async function populateDrillingCopySelect() {
  const sel = document.getElementById('component-drilling-copy-select');
  if (!sel) return;
  const prev = sel.value;
  const { data, error } = await supabaseClient.from('component_drillings').select('component_id');
  if (error) { showError('component-drilling-error', error); return; }
  const countByComponent = {};
  (data || []).forEach((r) => { countByComponent[r.component_id] = (countByComponent[r.component_id] || 0) + 1; });
  const editingId = document.getElementById('component-id').value;
  const options = (componentsCache || [])
    .filter((c) => countByComponent[c.id] && c.id !== editingId)
    .sort((a, b) => a.reference.localeCompare(b.reference))
    .map((c) => `<option value="${c.id}">${c.reference} (${countByComponent[c.id]} furo${countByComponent[c.id] > 1 ? 's' : ''})</option>`);
  sel.innerHTML = '<option value="">— escolher componente —</option>' + options.join('');
  if (options.length === 0) {
    sel.innerHTML = '<option value="">(nenhum componente com furação cadastrada)</option>';
  }
  if (prev) sel.value = prev;
}

document.getElementById('component-drilling-copy-btn').addEventListener('click', async () => {
  clearError('component-drilling-error');
  const sourceId = document.getElementById('component-drilling-copy-select').value;
  if (!sourceId) return;
  const { data, error } = await supabaseClient
    .from('component_drillings')
    .select('*')
    .eq('component_id', sourceId)
    .order('sort_order');
  if (error) { showError('component-drilling-error', error); return; }
  (data || []).forEach((r) => {
    componentDrillingsDraft.push({
      face: r.face, x_formula: r.x_formula, y_formula: r.y_formula,
      diameter_mm: r.diameter_mm, depth_formula: r.depth_formula,
      repeat_count_formula: r.repeat_count_formula,
      repeat_dx_mm: r.repeat_dx_mm, repeat_dy_mm: r.repeat_dy_mm,
      counter_diameter_mm: r.counter_diameter_mm, counter_depth_mm: r.counter_depth_mm,
      counter_face_diameter_mm: r.counter_face_diameter_mm, counter_face_depth_mm: r.counter_face_depth_mm,
      counter_face_offset_mm: r.counter_face_offset_mm,
      notes: r.notes || ''
    });
  });
  renderComponentDrillingRows();
});

async function loadComponentDrillingsIntoForm(componentId) {
  clearError('component-drilling-error');
  componentDrillingsDraft = [];
  if (componentId) {
    const { data, error } = await supabaseClient
      .from('component_drillings')
      .select('*')
      .eq('component_id', componentId)
      .order('sort_order');
    if (error) { showError('component-drilling-error', error); }
    componentDrillingsDraft = (data || []).map((r) => ({
      face: r.face, x_formula: r.x_formula, y_formula: r.y_formula,
      diameter_mm: r.diameter_mm, depth_formula: r.depth_formula,
      repeat_count_formula: r.repeat_count_formula,
      repeat_dx_mm: r.repeat_dx_mm, repeat_dy_mm: r.repeat_dy_mm,
      counter_diameter_mm: r.counter_diameter_mm, counter_depth_mm: r.counter_depth_mm,
      counter_face_diameter_mm: r.counter_face_diameter_mm, counter_face_depth_mm: r.counter_face_depth_mm,
      counter_face_offset_mm: r.counter_face_offset_mm,
      notes: r.notes || ''
    }));
  }
  renderComponentDrillingRows();
  populateDrillingCopySelect();
}

// Valida e persiste o rascunho — devolve o erro (ou null) em vez de mostrar,
// pra quem chama decidir onde exibir.
async function saveComponentDrillings(componentId) {
  // valida as fórmulas com dimensões de teste antes de gravar
  const testVars = { C: 800, L: 500, E: 18 };
  for (const row of componentDrillingsDraft) {
    try {
      Pricing.evalFormula(row.x_formula || '0', testVars);
      Pricing.evalFormula(row.y_formula || '0', testVars);
      Pricing.evalFormula(row.depth_formula || '0', testVars);
      Pricing.evalFormula(row.repeat_count_formula || '1', testVars);
    } catch (err) {
      return new Error('Fórmula inválida na furação padrão: ' + err.message);
    }
    if (!(parseFloat(row.diameter_mm) > 0)) return new Error('Furação padrão: diâmetro precisa ser maior que zero.');
    // Contra-furo agora vale em qualquer sentido (migrations 043 + 054), mas
    // meio preenchido seria descartado em silêncio no insert — recusar e explicar.
    const rowIsEdge = /^borda_/.test(row.face || '');
    const hasCDia = parseFloat(row.counter_diameter_mm) > 0;
    const hasCDep = parseFloat(row.counter_depth_mm) > 0;
    if (hasCDia !== hasCDep) {
      return new Error('Furação padrão: preencha Contra Ø E Contra prof. juntos (ou apague os dois).');
    }
    const camVals = [row.counter_face_diameter_mm, row.counter_face_depth_mm, row.counter_face_offset_mm];
    const camFilled = camVals.filter((v) => parseFloat(v) > 0).length;
    if (camFilled > 0 && rowIsEdge) {
      return new Error('Furação padrão: Copo Ø/prof./dist. só tem efeito em furo de FACE (tambor minifix na peça em pé apoiada) — em furo de borda, apague esses campos.');
    }
    if (camFilled > 0 && camFilled < 3) {
      return new Error('Furação padrão: preencha Copo Ø, prof. E dist. da borda juntos (ou apague os três).');
    }
    if (camFilled === 3 && !(hasCDia && hasCDep)) {
      return new Error('Furação padrão: o Copo acompanha o furo de borda propagado — preencha também Contra Ø/prof. (ex: Ø8 do canal do bolt).');
    }
  }
  const { error: delError } = await supabaseClient.from('component_drillings').delete().eq('component_id', componentId);
  if (delError) return delError;
  if (componentDrillingsDraft.length === 0) return null;
  const rows = componentDrillingsDraft.map((r, i) => {
    // contra-furo (043 borda→face + 054 face→borda): persiste com os DOIS
    // campos válidos; copo (counter_face_*) só em linha de face, com os TRÊS
    const isEdge = /^borda_/.test(r.face || '');
    const cDia = parseFloat(r.counter_diameter_mm);
    const cDep = parseFloat(r.counter_depth_mm);
    const hasCounter = cDia > 0 && cDep > 0;
    const camDia = parseFloat(r.counter_face_diameter_mm);
    const camDep = parseFloat(r.counter_face_depth_mm);
    const camOff = parseFloat(r.counter_face_offset_mm);
    const hasCam = !isEdge && hasCounter && camDia > 0 && camDep > 0 && camOff > 0;
    return {
      component_id: componentId,
      face: r.face || 'face',
      x_formula: String(r.x_formula || '0').trim() || '0',
      y_formula: String(r.y_formula || '0').trim() || '0',
      diameter_mm: parseFloat(r.diameter_mm),
      depth_formula: String(r.depth_formula || '10').trim() || '10',
      repeat_count_formula: String(r.repeat_count_formula || '1').trim() || '1',
      repeat_dx_mm: parseFloat(r.repeat_dx_mm) || 0,
      repeat_dy_mm: parseFloat(r.repeat_dy_mm) || 0,
      counter_diameter_mm: hasCounter ? cDia : null,
      counter_depth_mm: hasCounter ? cDep : null,
      counter_face_diameter_mm: hasCam ? camDia : null,
      counter_face_depth_mm: hasCam ? camDep : null,
      counter_face_offset_mm: hasCam ? camOff : null,
      notes: (r.notes || '').trim() || null,
      sort_order: i
    };
  });
  const { error: insError } = await supabaseClient.from('component_drillings').insert(rows);
  return insError || null;
}

// ---------- PRÉVIA DO COMPONENTE (dimensões e cor de teste) ----------
// Recalcula ao vivo, dentro do próprio formulário, o mesmo tipo de
// resultado que a linha "TOTAL ESTIMATED" mostraria — chapa, fita, mão de
// obra e total — usando as fórmulas e a cor/dimensões de teste escolhidas.
function updateComponentPreview() {
  const resultEl = document.getElementById('component-preview-result');
  if (!resultEl) return;

  const color = colorsCache.find((c) => c.id === document.getElementById('component-preview-color').value) || colorsCache[0];
  const laborType = laborTypesCache.find((l) => l.id === document.getElementById('component-labor-type').value) || null;
  const W = parseFloat(document.getElementById('component-preview-width').value) || 0;
  const H = parseFloat(document.getElementById('component-preview-height').value) || 0;
  const D = parseFloat(document.getElementById('component-preview-depth').value) || 0;

  const piece = {
    quantity: parseInt(document.getElementById('component-quantity').value, 10) || 1,
    width_formula: document.getElementById('component-width-formula').value.trim(),
    height_formula: document.getElementById('component-height-formula').value.trim(),
    depth_formula: document.getElementById('component-depth-formula').value.trim(),
    area_m2_formula: document.getElementById('component-area-formula').value.trim(),
    edge_band_linear_m_formula: document.getElementById('component-edge-formula').value.trim()
  };

  if (!color) {
    resultEl.innerHTML = '<p>Cadastre ao menos uma cor para ver a prévia.</p>';
    return;
  }

  try {
    const dims = Pricing.calculatePiece(piece, { W, H, D });
    const sheet_cost = dims.area_m2 * color.sheet_price_per_m2 * dims.quantity;
    const edge_cost = dims.edge_band_m * color.edge_price_per_linear_m * dims.quantity;
    const labor_cost = (laborType ? laborType.price_per_unit : 0) * dims.quantity;
    const total = sheet_cost + edge_cost + labor_cost;
    resultEl.innerHTML = `
      <table>
        <tbody>
          <tr><td>Largura (W)</td><td>${dims.width_mm.toFixed(0)} mm</td></tr>
          <tr><td>Altura (H)</td><td>${dims.height_mm.toFixed(0)} mm</td></tr>
          <tr><td>Profundidade (D)</td><td>${dims.depth_mm.toFixed(0)} mm</td></tr>
          <tr><td>M²</td><td>${dims.area_m2.toFixed(3)} — $${sheet_cost.toFixed(2)}</td></tr>
          <tr><td>Fita</td><td>${dims.edge_band_m.toFixed(2)} m — $${edge_cost.toFixed(2)}</td></tr>
          <tr><td>Mão de obra</td><td>${laborType ? laborType.name : '—'} — $${labor_cost.toFixed(2)}</td></tr>
          <tr><td><strong>Total estimado</strong></td><td><strong>$${total.toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
    `;
  } catch (err) {
    resultEl.innerHTML = `<p>${err.message}</p>`;
  }
}

[
  'component-width-formula', 'component-height-formula', 'component-depth-formula',
  'component-area-formula', 'component-edge-formula', 'component-quantity',
  'component-preview-width', 'component-preview-height', 'component-preview-depth'
].forEach((id) => {
  document.getElementById(id).addEventListener('input', updateComponentPreview);
});
['component-labor-type', 'component-preview-color'].forEach((id) => {
  document.getElementById(id).addEventListener('change', updateComponentPreview);
});

// ---------- MÓDULOS (PAI) ----------

async function loadModules() {
  // sort_order (migration 068) — mesmo desempate por nome do
  // setupLookupCRUD/loadTaxonomyFilters; fallback pra quem ainda não rodou
  // a migration (order('sort_order') quebraria a query inteira, não só a
  // ordenação).
  let { data, error } = await supabaseClient.from('modules').select('*').order('sort_order').order('name');
  if (error) {
    ({ data, error } = await supabaseClient.from('modules').select('*').order('name'));
  }
  if (error) { showError('modules-error', error); return; }
  modulesCache = data;
  renderModuleSelect();
  renderModuleConfigTree();
}

function renderModuleSelect() {
  const sel = document.getElementById('module-select');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— selecione um módulo —</option>';
  modulesCache.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

// Mesmo aviso visual de "editando X" que já existe em Componentes — antes
// disso não tinha NENHUM indicativo de que o formulário estava em modo
// edição (só o campo escondido module-id guardando o último "Editar"
// clicado), e também não existia nenhum jeito claro de começar um módulo do
// zero (o formulário ficava sempre visível, sem "resetar" sozinho, então
// dava pra sair criando um módulo novo com dados de um antigo ainda no ar).
// mode: undefined/'edit' (editando módulo existente) ou 'duplicate'
// (formulário pré-preenchido a partir de outro módulo, ainda vai virar um
// registro NOVO ao salvar — ver window.duplicateModule).
function setModuleFormMode(module, mode) {
  const banner = document.getElementById('module-form-banner');
  const bannerText = document.getElementById('module-form-banner-text');
  const submitBtn = document.getElementById('module-submit-btn');
  if (module && mode === 'duplicate') {
    banner.style.display = 'block';
    bannerText.innerHTML = `Duplicando <strong>"${module.name}"</strong> — ajuste o nome e a referência abaixo e clique em "Salvar". Cores, opcionais e componentes desse módulo serão copiados pro módulo novo.`;
    submitBtn.textContent = 'Salvar módulo duplicado';
  } else if (module) {
    banner.style.display = 'block';
    bannerText.innerHTML = `Editando <strong>"${module.name}"</strong> — clicar em "Salvar" abaixo vai ATUALIZAR este módulo, não criar um novo.`;
    submitBtn.textContent = `Salvar alterações em "${module.name}"`;
  } else {
    banner.style.display = 'none';
    bannerText.innerHTML = '';
    submitBtn.textContent = 'Salvar novo módulo';
  }
}

// Id do módulo sendo duplicado (window.duplicateModule) — se preenchido, o
// próximo submit do form vai, além de criar o módulo novo, copiar cores,
// opcionais e componentes vinculados desse módulo de origem. Fica null em
// qualquer outro modo (novo módulo do zero / editando um existente).
let duplicatingFromModuleId = null;

// Limpa o formulário por completo e volta pro modo "novo módulo" — usado
// pelo botão "+ Novo módulo", por "Cancelar edição" e depois de salvar com
// sucesso.
function resetModuleForm() {
  document.getElementById('module-form').reset();
  document.getElementById('module-id').value = '';
  document.getElementById('module-active').checked = true;
  document.getElementById('module-invisible').checked = false;
  document.getElementById('module-decoration').checked = false;
  document.getElementById('module-ceiling-clearance-enabled').checked = false;
  document.getElementById('module-ceiling-clearance-mm').value = 0;
  duplicatingFromModuleId = null;
  setModuleFormMode(null);
}

// "Dados do módulo" (module-form-section) é só mais uma aba na MESMA tira
// de Cores/Modelos/etc (ver MODULE_CONFIG_SUBTAB_IDS/showModuleConfigSubtab
// mais abaixo) — pedido do usuário, que achou o bloco separado (antes um
// <details> sempre visível acima do cabeçalho) "atrapalhando". A diferença
// é que essa aba específica precisa funcionar mesmo com NENHUM módulo
// selecionado ainda (fluxo de "+ Novo módulo" do zero) — as outras 6 exigem
// selectedModuleId. showModuleFormTab() força cabeçalho/tira visíveis pra
// cobrir esse caso; hideModuleConfigMainCol() volta pro estado vazio.
function showModuleFormTab() {
  document.getElementById('module-config-empty-hint').style.display = 'none';
  document.getElementById('module-config-header').style.display = 'block';
  document.getElementById('module-subtabs').style.display = 'flex';
  showModuleConfigSubtab('module-form-section');
}
function hideModuleConfigMainCol() {
  document.getElementById('module-config-empty-hint').style.display = 'block';
  document.getElementById('module-config-header').style.display = 'none';
  document.getElementById('module-subtabs').style.display = 'none';
}

document.getElementById('module-new-btn').addEventListener('click', () => {
  resetModuleForm();
  document.getElementById('module-config-current-name').textContent = 'Novo módulo';
  showModuleFormTab();
  document.getElementById('module-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('module-cancel-edit-btn').addEventListener('click', () => {
  resetModuleForm();
  if (selectedModuleId) {
    showModuleConfigSubtab('module-colors-section');
  } else {
    hideModuleConfigMainCol();
  }
});

// Preenche os campos de "Dados do módulo" com os dados de UM módulo —
// extraído do antigo editModule pra também ser chamado sempre que a seleção
// mudar (ver listener de module-select 'change' mais abaixo), não só quando
// o usuário clica em "Editar". Sem isso, trocar de módulo pela árvore
// deixava essa aba "presa" mostrando os dados do módulo anterior (bug
// relatado pelo usuário: parecia que a seleção não atualizava nada).
function fillModuleFormForEdit(m) {
  // Qualquer duplicação em andamento fica inválida assim que a seleção muda
  // pra um módulo em modo de EDIÇÃO normal — sem isso, clicar em "Duplicar"
  // e depois navegar pra outro módulo e salvar acabaria copiando cores/
  // componentes do módulo errado pro módulo errado (duplicatingFromModuleId
  // ficaria "grudado" do clique de duplicar anterior).
  duplicatingFromModuleId = null;
  document.getElementById('module-id').value = m.id;
  document.getElementById('module-name').value = m.name;
  document.getElementById('module-slug').value = m.slug || '';
  document.getElementById('module-description').value = m.description || '';
  document.getElementById('module-family').value = m.family_id || '';
  document.getElementById('module-category').value = m.category_id || '';
  document.getElementById('module-subcategory').value = m.subcategory_id || '';
  document.getElementById('module-width-min').value = m.width_min_mm;
  document.getElementById('module-width-max').value = m.width_max_mm;
  document.getElementById('module-width-default').value = m.width_default_mm;
  document.getElementById('module-height-min').value = m.height_min_mm;
  document.getElementById('module-height-max').value = m.height_max_mm;
  document.getElementById('module-height-default').value = m.height_default_mm;
  document.getElementById('module-depth-min').value = m.depth_min_mm;
  document.getElementById('module-depth-max').value = m.depth_max_mm;
  document.getElementById('module-depth-default').value = m.depth_default_mm;
  document.getElementById('module-active').checked = m.active;
  document.getElementById('module-invisible').checked = !!m.is_invisible;
  document.getElementById('module-decoration').checked = !!m.is_decoration;
  document.getElementById('module-ceiling-clearance-enabled').checked = !!m.ceiling_clearance_enabled;
  document.getElementById('module-ceiling-clearance-mm').value = m.ceiling_clearance_mm || 0;
  setModuleFunctionFields(m);
  setModuleFormMode(m);
}

// Função/montagem/dica de IA (migration 080) — extraído porque os DOIS
// caminhos que preenchem o formulário (editar e duplicar) precisam disso, e
// a lista de campos tende a crescer.
function setModuleFunctionFields(m) {
  document.getElementById('module-function').value = m.function_id || '';
  document.getElementById('module-mount-type').value = m.mount_type || '';
  document.getElementById('module-ai-hint').value = m.ai_hint || '';
}

// Editar (chamado pelos botões da árvore, ver renderModuleConfigTree) também
// seleciona o módulo no <select> escondido — antes "Editar" só preenchia o
// formulário (a aba "Módulos" era separada de "Configurar módulo"); agora
// que os dois vivem juntos, editar já carrega cores/componentes/etc. dele
// na coluna principal ao lado, sem precisar clicar 2x.
window.editModule = function (id) {
  const m = modulesCache.find((x) => x.id === id);
  if (!m) return;
  fillModuleFormForEdit(m);
  const sel = document.getElementById('module-select');
  if (sel.value !== m.id) { sel.value = m.id; sel.dispatchEvent(new Event('change')); }
  showModuleFormTab();
  document.getElementById('module-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Pré-preenche o formulário com os dados de um módulo já existente, mas com
// o id vazio (então o submit vai criar um registro NOVO) e nome/slug com um
// sufixo "(cópia)" só de sugestão — o usuário troca por um nome e referência
// próprios antes de salvar, como pedido: "eu só dou outro nome e outra
// referência". Depois de salvar, copyModuleConfig() copia cores, opcionais
// e componentes vinculados do módulo de origem pro módulo novo.
window.duplicateModule = function (id) {
  const m = modulesCache.find((x) => x.id === id);
  if (!m) return;
  document.getElementById('module-id').value = '';
  document.getElementById('module-name').value = `${m.name} (cópia)`;
  document.getElementById('module-slug').value = m.slug ? `${m.slug}-copia` : '';
  document.getElementById('module-description').value = m.description || '';
  document.getElementById('module-family').value = m.family_id || '';
  document.getElementById('module-category').value = m.category_id || '';
  document.getElementById('module-subcategory').value = m.subcategory_id || '';
  document.getElementById('module-width-min').value = m.width_min_mm;
  document.getElementById('module-width-max').value = m.width_max_mm;
  document.getElementById('module-width-default').value = m.width_default_mm;
  document.getElementById('module-height-min').value = m.height_min_mm;
  document.getElementById('module-height-max').value = m.height_max_mm;
  document.getElementById('module-height-default').value = m.height_default_mm;
  document.getElementById('module-depth-min').value = m.depth_min_mm;
  document.getElementById('module-depth-max').value = m.depth_max_mm;
  document.getElementById('module-depth-default').value = m.depth_default_mm;
  document.getElementById('module-active').checked = m.active;
  document.getElementById('module-invisible').checked = !!m.is_invisible;
  document.getElementById('module-decoration').checked = !!m.is_decoration;
  document.getElementById('module-ceiling-clearance-enabled').checked = !!m.ceiling_clearance_enabled;
  document.getElementById('module-ceiling-clearance-mm').value = m.ceiling_clearance_mm || 0;
  setModuleFunctionFields(m);
  duplicatingFromModuleId = m.id;
  setModuleFormMode(m, 'duplicate');
  showModuleFormTab();
  document.getElementById('module-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Copia os vínculos de um módulo (componentes com todos os overrides, cores,
// modelos de porta/gaveta/dobradiça/corrediça disponíveis) pra outro módulo.
// Usada só depois que o módulo NOVO (destino) já foi inserido — ver o
// submit do module-form, chamada quando duplicatingFromModuleId está
// preenchido.
async function copyModuleConfig(fromId, toId) {
  const { data: comps, error: compsErr } = await supabaseClient
    .from('module_components').select('*').eq('module_id', fromId);
  if (compsErr) throw compsErr;
  if (comps && comps.length > 0) {
    // Não copia o "id" da linha de origem — cada module_components agora tem
    // uma PK própria (uuid), gerada de novo pra cada linha inserida (ver
    // migration 023). Copiar o id causaria conflito de chave primária.
    const rows = comps.map((c) => { const { id, ...rest } = c; return { ...rest, module_id: toId }; });
    const { error } = await supabaseClient.from('module_components').insert(rows);
    if (error) throw error;
  }
  // Profundidades fixas (module_fixed_depths) — generaliza o antigo
  // drawer_type_depths, agora é config do módulo em si, então entra na
  // duplicação junto com o resto.
  const { data: depths, error: depthsErr } = await supabaseClient
    .from('module_fixed_depths').select('depth_mm').eq('module_id', fromId);
  if (depthsErr) throw depthsErr;
  if (depths && depths.length > 0) {
    const { error } = await supabaseClient.from('module_fixed_depths')
      .insert(depths.map((d) => ({ module_id: toId, depth_mm: d.depth_mm })));
    if (error) throw error;
  }
  // module_colors ganhou color_role_id na migration 035 (parte da chave
  // composta, NOT NULL) — antes desta correção, o loop só copiava color_id
  // e o insert quebrava com "null value in column color_role_id". Por isso
  // cada tabela agora declara a lista COMPLETA de colunas de vínculo a
  // copiar, não só uma.
  const linkTables = [
    ['module_colors', ['color_role_id', 'color_id']],
    ['module_hinge_models', ['hinge_model_id']],
    ['module_slide_models', ['slide_model_id']]
  ];
  for (const [table, fks] of linkTables) {
    const { data: rows, error: selErr } = await supabaseClient.from(table).select(fks.join(',')).eq('module_id', fromId);
    if (selErr) throw selErr;
    if (rows && rows.length > 0) {
      const insertRows = rows.map((r) => {
        const row = { module_id: toId };
        fks.forEach((fk) => { row[fk] = r[fk]; });
        return row;
      });
      const { error } = await supabaseClient.from(table).insert(insertRows);
      if (error) throw error;
    }
  }
}

window.deleteModule = async function (id) {
  if (!confirm('Excluir este módulo e todos os seus vínculos?')) return;
  const { error } = await supabaseClient.from('modules').delete().eq('id', id);
  if (error) { showError('modules-error', error); return; }
  if (selectedModuleId === id) { selectedModuleId = null; }
  // Se o módulo excluído era o que estava sendo editado no formulário, volta
  // pro modo "novo" — senão o form ficaria com o id de um módulo que não
  // existe mais, e o próximo "Salvar" tentaria um upsert órfão.
  if (document.getElementById('module-id').value === id) resetModuleForm();
  loadModules();
};

document.getElementById('module-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('modules-error');
  const id = document.getElementById('module-id').value || undefined;
  const payload = {
    name: document.getElementById('module-name').value.trim(),
    slug: document.getElementById('module-slug').value.trim() || null,
    description: document.getElementById('module-description').value.trim() || null,
    family_id: document.getElementById('module-family').value || null,
    category_id: document.getElementById('module-category').value || null,
    subcategory_id: document.getElementById('module-subcategory').value || null,
    width_min_mm: parseFloat(document.getElementById('module-width-min').value),
    width_max_mm: parseFloat(document.getElementById('module-width-max').value),
    width_default_mm: parseFloat(document.getElementById('module-width-default').value),
    height_min_mm: parseFloat(document.getElementById('module-height-min').value),
    height_max_mm: parseFloat(document.getElementById('module-height-max').value),
    height_default_mm: parseFloat(document.getElementById('module-height-default').value),
    depth_min_mm: parseFloat(document.getElementById('module-depth-min').value),
    depth_max_mm: parseFloat(document.getElementById('module-depth-max').value),
    depth_default_mm: parseFloat(document.getElementById('module-depth-default').value),
    active: document.getElementById('module-active').checked,
    is_invisible: document.getElementById('module-invisible').checked,
    is_decoration: document.getElementById('module-decoration').checked,
    ceiling_clearance_enabled: document.getElementById('module-ceiling-clearance-enabled').checked,
    ceiling_clearance_mm: parseFloat(document.getElementById('module-ceiling-clearance-mm').value) || 0,
    // migration 080 — função/montagem/dica de IA
    function_id: document.getElementById('module-function').value || null,
    mount_type: document.getElementById('module-mount-type').value || null,
    ai_hint: document.getElementById('module-ai-hint').value.trim() || null
  };
  if (id) payload.id = id;
  const { data: savedModule, error } = await supabaseClient.from('modules').upsert(payload).select().single();
  if (error) { showError('modules-error', error); return; }
  if (duplicatingFromModuleId && savedModule) {
    try {
      await copyModuleConfig(duplicatingFromModuleId, savedModule.id);
    } catch (copyErr) {
      showError('modules-error', 'Módulo duplicado, mas houve um erro ao copiar cores/opcionais/componentes: ' + (copyErr.message || copyErr));
    }
  }
  resetModuleForm();
  await loadModules();
  // Depois de salvar, seleciona o módulo (novo, duplicado ou editado) e
  // pousa na aba "Cores" — o próximo passo natural é configurar o que ele
  // usa, não ficar olhando pro formulário que acabou de ser salvo.
  if (savedModule) {
    const sel = document.getElementById('module-select');
    sel.value = savedModule.id;
    sel.dispatchEvent(new Event('change'));
    showModuleConfigSubtab('module-colors-section');
  }
});

// ---------- VÍNCULO MÓDULO x COMPONENTES ----------

document.getElementById('module-select').addEventListener('change', (e) => {
  selectedModuleId = e.target.value || null;
  document.getElementById('pieces-section').style.display = selectedModuleId ? 'block' : 'none';
  document.getElementById('module-colors-section').style.display = selectedModuleId ? 'block' : 'none';
  document.getElementById('module-options-section').style.display = selectedModuleId ? 'block' : 'none';
  document.getElementById('module-image-section').style.display = selectedModuleId ? 'block' : 'none';
  // "Profundidades fixas" (module_fixed_depths) ficou obsoleta — generalizada
  // por "Valores sugeridos de medida" (module_dimension_presets, seção
  // abaixo), que cobre largura/altura/profundidade e não deixa a peça
  // aparecer menor do que deveria existir (ver Pricing.isBelowMinLockedPreset)
  // em vez de só "espremer" na maior que caiba. Seção OCULTADA a pedido do
  // usuário (permanece sempre display:none, ver admin.html) — a coluna e os
  // dados de módulos antigos que já usam fixed_depths continuam funcionando
  // normalmente no cálculo/3D (pricing.js dá prioridade a fixed_depths sobre
  // locked_depth_presets quando ambos existem), só não são mais editáveis
  // por aqui.
  document.getElementById('module-dimension-presets-section').style.display = selectedModuleId ? 'block' : 'none';
  // Teste de cálculo (conferência interna) — aba própria na tira, mas
  // continua liberado/travado pelo mesmo selectedModuleId que sempre
  // controlou todas as outras seções aqui.
  document.getElementById('module-test-calc-section').style.display = selectedModuleId ? 'block' : 'none';
  if (selectedModuleId) {
    renderModuleComponentsList();
    renderModuleColorLinks();
    renderModuleOptionLinks();
    renderModuleDimensionPresets();
    renderModuleImageSection();
    loadModuleImageColorOptions();
  }
});

// ---------- ÁRVORE DE MÓDULOS + SUB-ABAS ("Configurar módulo") ----------
// Reorganização pura de apresentação: o <select id="module-select"> acima
// continua sendo a ÚNICA fonte de verdade pra qual módulo está selecionado
// (o listener de 'change' logo acima é quem decide o que cada seção mostra
// e dispara os renders de dados) — a árvore só é uma UI alternativa que seta
// sel.value e dispara 'change' nele, e as sub-abas só escolhem QUAL das
// seções já liberadas por aquele listener fica visível por vez. Voltou a
// ser tira de abas no topo (não mais <details> empilhados) a pedido do
// usuário: o accordion vertical deixava tudo "muito afastado" — a tira
// horizontal fica bem mais compacta.
// module-form-section ("Dados do módulo") é a única que não exige
// selectedModuleId — precisa funcionar no fluxo de "+ Novo módulo" do zero,
// antes de qualquer módulo existir/estar selecionado (ver showModuleFormTab).
const MODULE_CONFIG_SUBTAB_IDS = [
  'module-form-section',
  'module-colors-section',
  'module-options-section',
  'module-image-section',
  'module-dimension-presets-section',
  'pieces-section',
  'module-test-calc-section'
];
let activeModuleConfigSubtab = 'module-colors-section';

function showModuleConfigSubtab(targetId) {
  activeModuleConfigSubtab = targetId;
  document.querySelectorAll('#module-subtabs .module-subtab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.subtab === targetId);
  });
  MODULE_CONFIG_SUBTAB_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const needsModule = id !== 'module-form-section';
    el.style.display = ((!needsModule || selectedModuleId) && id === targetId) ? 'block' : 'none';
  });
}

document.querySelectorAll('#module-subtabs .module-subtab-btn').forEach((btn) => {
  btn.addEventListener('click', () => showModuleConfigSubtab(btn.dataset.subtab));
});

// Segundo listener no MESMO <select> (registrado depois do de cima, então
// roda depois — selectedModuleId já está atualizado): só cuida da parte
// visual nova (mostrar dica vazia vs. cabeçalho+sub-abas, título do módulo
// atual, destacar o item ativo na árvore e reaplicar a sub-aba escolhida).
document.getElementById('module-select').addEventListener('change', () => {
  const hasModule = !!selectedModuleId;
  document.getElementById('module-config-empty-hint').style.display = hasModule ? 'none' : 'block';
  document.getElementById('module-config-header').style.display = hasModule ? 'block' : 'none';
  document.getElementById('module-subtabs').style.display = hasModule ? 'flex' : 'none';
  const m = modulesCache.find((x) => x.id === selectedModuleId);
  document.getElementById('module-config-current-name').textContent = m ? m.name : '—';
  // "Dados do módulo" acompanha a seleção atual — sem isso, clicar num
  // módulo diferente na árvore (sem passar pelo botão "Editar") deixava o
  // formulário mostrando os dados do módulo anterior.
  if (m) { fillModuleFormForEdit(m); } else { resetModuleForm(); }
  showModuleConfigSubtab(activeModuleConfigSubtab);
  renderModuleConfigTree();
});

// Agrupa modulesCache por família/categoria/subcategoria (os 3 campos que
// cada módulo já tem — não é um critério novo) só pra apresentar como
// árvore em vez de <option> plana. Cada item, ao clicar, seta o <select>
// escondido e dispara 'change' nele — reusa 100% da lógica de carregar/
// mostrar dados que já existia antes desta reorganização.
function renderModuleConfigTree() {
  const container = document.getElementById('module-config-tree');
  if (!container) return;
  const searchEl = document.getElementById('module-config-search');
  const searchTerm = (searchEl && searchEl.value || '').trim().toLowerCase();

  const familyName = (id) => (familiesCache.find((f) => f.id === id) || {}).name || 'Sem família';
  const categoryName = (id) => (categoriesCache.find((c) => c.id === id) || {}).name || 'Sem categoria';
  const subcategoryName = (id) => (subcategoriesCache.find((s) => s.id === id) || {}).name || 'Sem subcategoria';

  const filtered = modulesCache.filter((m) => !searchTerm || m.name.toLowerCase().includes(searchTerm));

  if (filtered.length === 0) {
    container.innerHTML = '<p class="hint">Nenhum módulo encontrado.</p>';
    return;
  }

  // família -> categoria -> subcategoria -> módulo[], só reorganização
  // visual da mesma lista que já vinha ordenada por nome do banco.
  const groups = new Map();
  filtered.forEach((m) => {
    const fKey = m.family_id || '__none__';
    const cKey = m.category_id || '__none__';
    const sKey = m.subcategory_id || '__none__';
    if (!groups.has(fKey)) groups.set(fKey, new Map());
    const catMap = groups.get(fKey);
    if (!catMap.has(cKey)) catMap.set(cKey, new Map());
    const subMap = catMap.get(cKey);
    if (!subMap.has(sKey)) subMap.set(sKey, []);
    subMap.get(sKey).push(m);
  });

  // Família/categoria viram <details> — fechados por padrão ("tudo
  // minimizado"), mas forçados abertos quando: o usuário está buscando
  // (senão os resultados da busca ficariam escondidos atrás de um grupo
  // fechado) ou o grupo contém o módulo selecionado no momento (senão
  // trocar de módulo "esconderia" o item ativo da árvore).
  const forceOpen = !!searchTerm;
  let html = '';
  groups.forEach((catMap, fKey) => {
    const familyHasActive = Array.from(catMap.values())
      .some((subMap) => Array.from(subMap.values()).some((mods) => mods.some((m) => m.id === selectedModuleId)));
    const familyOpen = forceOpen || familyHasActive;
    html += `<details class="module-tree-family"${familyOpen ? ' open' : ''}><summary>${fKey === '__none__' ? 'Sem família' : familyName(fKey)}</summary><div class="module-tree-family-body">`;
    catMap.forEach((subMap, cKey) => {
      const categoryHasActive = Array.from(subMap.values()).some((mods) => mods.some((m) => m.id === selectedModuleId));
      const categoryOpen = forceOpen || categoryHasActive;
      html += `<details class="module-tree-category"${categoryOpen ? ' open' : ''}><summary>${cKey === '__none__' ? 'Sem categoria' : categoryName(cKey)}</summary><div class="module-tree-category-body">`;
      subMap.forEach((mods, sKey) => {
        if (sKey !== '__none__') {
          html += `<div class="module-tree-subcategory-label">${subcategoryName(sKey)}</div>`;
        }
        // Setas ▲▼ (migration 068) — reordena DENTRO do grupo (mesma família +
        // categoria + subcategoria), que é exatamente o array `mods` aqui.
        // data-group guarda os ids do grupo INTEIRO na ordem visual atual —
        // moveModuleInTreeGroup usa isso pra reindexar o grupo todo a cada
        // clique (ver comentário lá: evita empate em sort_order=0).
        const groupIds = mods.map((x) => x.id).join(',');
        mods.forEach((m, idx) => {
          const active = m.id === selectedModuleId ? ' active' : '';
          const upDisabled = idx === 0 ? 'disabled' : '';
          const downDisabled = idx === mods.length - 1 ? 'disabled' : '';
          html += `
            <div class="module-tree-item${active}" data-module-id="${m.id}" data-group="${groupIds}">
              <span class="module-tree-item-name">${m.name}${m.active ? '' : ' <span class="badge">inativo</span>'}</span>
              <span class="module-tree-item-actions">
                <button type="button" class="secondary mc-row-btn" data-action="move-up" ${upDisabled} title="Mover pra cima">▲</button>
                <button type="button" class="secondary mc-row-btn" data-action="move-down" ${downDisabled} title="Mover pra baixo">▼</button>
                <button type="button" class="secondary mc-row-btn" data-action="edit" title="Editar">✎</button>
                <button type="button" class="secondary mc-row-btn" data-action="duplicate" title="Duplicar">⧉</button>
                <button type="button" class="danger mc-row-btn" data-action="delete" title="Excluir">🗑</button>
              </span>
            </div>`;
        });
      });
      html += '</div></details>';
    });
    html += '</div></details>';
  });
  container.innerHTML = html;

  // Um listener só (delegação) em vez de um por linha/botão — mais simples
  // de manter conforme a árvore é reconstruída a cada render. Clique num
  // botão de ação NÃO seleciona o módulo (stopPropagation); clique no resto
  // da linha seleciona, como antes.
  container.querySelectorAll('.module-tree-item').forEach((row) => {
    const moduleId = row.dataset.moduleId;
    row.addEventListener('click', () => {
      const sel = document.getElementById('module-select');
      sel.value = moduleId;
      sel.dispatchEvent(new Event('change'));
    });
    row.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        const action = btn.dataset.action;
        if (action === 'edit') window.editModule(moduleId);
        else if (action === 'duplicate') window.duplicateModule(moduleId);
        else if (action === 'delete') window.deleteModule(moduleId);
        else if (action === 'move-up') moveModuleInTreeGroup(moduleId, -1, row.dataset.group.split(','));
        else if (action === 'move-down') moveModuleInTreeGroup(moduleId, 1, row.dataset.group.split(','));
      });
    });
  });
}

// Setas ▲▼ da árvore de módulos (migration 068) — reindexa o GRUPO INTEIRO
// (mesma família + categoria + subcategoria, ver groupIds em
// renderModuleConfigTree) a cada clique, não só o par trocado: se vários
// módulos do grupo ainda estiverem empatados em sort_order=0 (nunca
// reordenados manualmente), um swap simples de só 2 registros não teria
// efeito visual nenhum (0 vira 0). Reatribuir 1,2,3... pra todo o grupo na
// nova ordem visual corrige isso de vez, e depois de usado uma vez vira um
// swap normal (mesma ideia de setupLookupCRUD/moveColor, só que num grupo
// menor do que a tabela inteira).
async function moveModuleInTreeGroup(moduleId, dir, groupIds) {
  const index = groupIds.indexOf(moduleId);
  const otherIndex = index + dir;
  if (index === -1 || otherIndex < 0 || otherIndex >= groupIds.length) return;
  const reordered = groupIds.slice();
  const tmp = reordered[index];
  reordered[index] = reordered[otherIndex];
  reordered[otherIndex] = tmp;
  const updates = reordered
    .map((id, i) => {
      const m = modulesCache.find((x) => x.id === id);
      return m ? { ...m, sort_order: i + 1 } : null;
    })
    .filter(Boolean);
  const { error } = await supabaseClient.from('modules').upsert(updates);
  if (error) { showError('modules-error', error); return; }
  await loadModules();
}

const moduleConfigSearchEl = document.getElementById('module-config-search');
if (moduleConfigSearchEl) moduleConfigSearchEl.addEventListener('input', renderModuleConfigTree);

// ---------- IMAGEM 3D DO MÓDULO ----------
//
// Gera uma miniatura de VERDADE (peças/cores reais deste módulo, na
// configuração PADRÃO — mesmo critério de quickAddModule em portal.js: 1ª
// cor cadastrada como caixa E porta, medida padrão, só os opcionais "vem
// marcado por padrão") pra substituir o ícone SVG genérico da vitrine do
// portal (ver drawModuleSvg em portal.js). Câmera SEMPRE no mesmo ângulo
// relativo — Viewer3D.update(..., refit:true) calcula a posição da câmera só
// a partir de L/A/P (ver update() em viewer3d.js), então qualquer orbit que
// o admin tenha feito antes de clicar é ignorado: essa é a "câmera
// fixa/padrão" pedida, sem precisar de nenhum código novo de câmera.
//
// loadRecursivePiecesForModule/fetchModuleFixedDepths/
// fetchModuleLockedDimensionPresets/fetchModuleOwnHingeAndSlideModels/
// resolvePiecesForViewer abaixo são cópias fiéis das mesmas funções de
// client.js/portal.js (mesma lógica de resolução recursiva de peças/medidas/
// deslocamento pro 3D) — só adaptadas pro padrão de erro do admin
// (showError(elId, err) em vez de um banner global).

// ⚠️ ARQUIVO FÓSSIL — js/admin.js NÃO É CARREGADO POR NENHUMA PÁGINA.
// Conferido em 2026-08-15: nenhum .html tem <script src="js/admin.js">. O
// painel admin virou o ERP e o código foi extraído pra erp/js/adm/*. Editar
// aqui não tem efeito nenhum — eu mesmo perdi tempo fazendo isso, achando que
// consertava a tela do ERP. A cópia VIVA deste resolvedor é js/module-pieces.js.
async function loadRecursivePiecesForModule(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('id, component_id, child_module_id, quantity_override, sort_order, width_formula_override, height_formula_override, depth_formula_override, offset_x_mm, offset_y_mm, offset_z_mm, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, client_dimension_configurable, width_min_mm, width_default_mm, width_max_mm, height_min_mm, height_default_mm, height_max_mm, depth_min_mm, depth_default_mm, depth_max_mm, tilt_angle_deg, rotation_y_deg, usinagem_m, recortes, drilling_pattern_id, grain_dir, components(*, labor_types(*), component_types(*))')
    .eq('module_id', moduleId)
    .order('sort_order');
  if (error) { showError('module-image-error', error); return []; }

  const result = [];
  for (const row of (data || [])) {
    if (row.component_id) {
      if (!row.components || !row.components.active) continue;
      const quantity = (row.quantity_override !== null && row.quantity_override !== undefined)
        ? row.quantity_override
        : row.components.quantity;
      const labor_cost_per_unit = row.components.labor_types ? row.components.labor_types.price_per_unit : 0;
      // Papel de cor (migration 035) — vem do tipo do componente, não mais
      // do boolean is_front.
      const color_role_id = row.components.component_types ? row.components.component_types.color_role_id : null;
      const positioning = row.components.component_types ? row.components.component_types.positioning : null;
      const width_formula = row.width_formula_override || row.components.width_formula;
      const height_formula = row.height_formula_override || row.components.height_formula;
      const depth_formula = row.depth_formula_override || row.components.depth_formula;
      result.push({
        ...row.components,
        id: row.id,
        // Id do CATÁLOGO (components.id) — o spread acima o perde (id vira o
        // da linha, migration 025), mas a furação (migration 038) precisa
        // dele pra buscar os furos padrão em component_drillings.
        component_id: row.component_id,
        // PROGRAMA DE FURAÇÃO desta linha (migration 105). Vem do USO, não do
        // componente: na linha "flatbord" existem só duas chapas cruas, então
        // a furação não pode morar nelas. Quando preenchido, drilling.js usa
        // os furos do programa; NULL cai em component_drillings, que é o
        // caminho dos módulos antigos.
        drilling_pattern_id: row.drilling_pattern_id || null,
        // Sentido do veio por uso (migration 105) — mesma lógica.
        grain_dir: row.grain_dir || null,
        // Nome customizado desta instância (migration 032) — sobrescreve o
        // nome do catálogo só na exibição (admin, teste de cálculo, balão do
        // 3D). Vazio/null = usa o nome do catálogo, como sempre (por isso
        // fica DEPOIS do ...row.components, senão o spread apagaria).
        reference: row.reference_override || row.components.reference,
        quantity, labor_cost_per_unit, positioning,
        /* Migration 090 — POSIÇÃO E COR PASSAM A SER DO USO, não da peça.
           A peça genérica ("Flatbord 2C") é a mesma chapa em qualquer lugar
           do módulo; o que ela vira — base, divisória, topo — é decidido
           aqui, na linha que diz "este módulo usa esta peça".

           As duas colunas já existiam em module_components e já eram lidas
           na peça-MÓDULO; a peça-folha simplesmente nunca as leu. O schema
           inclusive documenta a intenção: "componente usa
           components.position_role" quando nulo.

           Seguro por construção: o admin grava null em toda linha de
           peça-folha (13-modulo-pecas.js), então nulo continua herdando e
           nenhum módulo existente se mexe. */
        position_role: row.position_role || row.components.position_role,
        color_role_id: row.color_role_id || color_role_id,
        // Metros de usinagem DESTE uso (migration 092) — a mesma lateral é
        // entalhada numa carcaça e lisa em outra, por isso vem da linha do
        // módulo e não do componente.
        usinagem_m: row.usinagem_m || 0,
        // Recortes em L DESTE uso (migration 094) — lista de {canto, h, d}.
        // Por uso e não por componente, igual usinagem_m; lista porque a
        // carcaça gola + toe 4½ leva dois na mesma lateral. Só desenho: a
        // chapa continua sendo cortada retangular.
        recortes: Array.isArray(row.recortes) ? row.recortes : [],
        // Veio e "leva furo" (migration 086) — o Construtor valida o CASCO
        // contra a chapa com estes dois, exatamente como valida as peças da
        // árvore. Sem eles, uma peça grande demais pra chapa passava batido.
        veio: row.components.veio || 'livre',
        fura: row.components.fura !== false,
        // Limite do lado no plano da máquina (migration 090)
        lado_min_mm: row.components.lado_min_mm || null,
        lado_max_mm: row.components.lado_max_mm || null,
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
        // Sub-configuração de medidas (migration 036) — necessária aqui
        // porque o export de furação (migration 038) re-resolve o pedido com
        // os dim_overrides gravados em order_items; sem esses campos a
        // checagem client_dimension_configurable nunca ativaria no admin.
        client_dimension_configurable: !!row.client_dimension_configurable,
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
        module_name: lockedPresets.name,
        child_pieces: childPieces
      });
    }
  }
  return result;
}

// fetchModuleFixedDepths já existe mais abaixo neste arquivo (usada pela
// seção obsoleta "Profundidades fixas" — ver renderModuleFixedDepthsList) —
// mesma assinatura/comportamento (module_fixed_depths.depth_mm -> array de
// Number), reaproveitada aqui sem duplicar (function declaration é hoisted,
// funciona independente da ordem no arquivo).

async function fetchModuleLockedDimensionPresets(moduleId) {
  const [moduleRes, presetsRes] = await Promise.all([
    supabaseClient.from('modules').select('name, width_locked, height_locked, depth_locked, width_min_mm, width_max_mm, height_min_mm, height_max_mm, depth_min_mm, depth_max_mm').eq('id', moduleId).single(),
    supabaseClient.from('module_dimension_presets').select('dimension, value_mm').eq('module_id', moduleId)
  ]);
  const mod = moduleRes.data || {};
  const byDim = { width: [], height: [], depth: [] };
  (presetsRes.data || []).forEach((row) => { if (byDim[row.dimension]) byDim[row.dimension].push(Number(row.value_mm)); });
  return {
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

async function fetchModuleOwnHingeAndSlideModels(moduleId) {
  const [hingeRes, slideRes] = await Promise.all([
    supabaseClient.from('module_hinge_models').select('hinge_model_id, hinge_models(*)').eq('module_id', moduleId),
    supabaseClient.from('module_slide_models').select('slide_model_id, slide_models(*)').eq('module_id', moduleId)
  ]);
  const hinge = (hingeRes.data || []).map((r) => r.hinge_models).find((h) => h && h.active) || null;
  const slide = (slideRes.data || []).map((r) => r.slide_models).find((s) => s && s.active) || null;
  return { hinge, slide };
}

// Lista de cores cadastradas pro módulo, AGRUPADA POR PAPEL (migration 035
// — module_colors agora tem color_role_id, mesma tabela usada em "Cores
// disponíveis para este módulo", ver renderModuleColorLinks) — pra deixar o
// admin ESCOLHER qual cor usar por papel na imagem 3D, em vez de travar
// sempre na 1ª cor cadastrada (pedido do usuário). Devolve só os papéis que
// realmente têm alguma cor cadastrada pra este módulo.
async function fetchModuleColorsForImageList(moduleId) {
  const [{ data, error }, usedRoleIds] = await Promise.all([
    supabaseClient.from('module_colors').select('color_id, color_role_id, colors(*)').eq('module_id', moduleId),
    collectUsedColorRoleIdsForModule(moduleId)
  ]);
  if (error) { console.error(error); return []; }
  const byRole = new Map();
  (data || []).forEach((row) => {
    if (!row.colors || !row.colors.active) return;
    // Mesmo filtro da aba Cores (renderModuleColorLinks): só papel que
    // alguma peça deste módulo REALMENTE usa — sem isso, um vínculo
    // avulso em module_colors (ex: sobra de uma duplicação/"Marcar todas"
    // antiga) fazia "Cor — Painel" aparecer aqui pra um módulo sem
    // nenhuma peça de painel.
    if (!usedRoleIds.has(row.color_role_id)) return;
    if (!byRole.has(row.color_role_id)) byRole.set(row.color_role_id, []);
    byRole.get(row.color_role_id).push(row.colors);
  });
  const roleOrder = new Map(colorRolesCache.map((r, idx) => [r.id, idx]));
  return Array.from(byRole.entries())
    .map(([role_id, colors]) => ({
      role_id,
      role_name: (colorRolesCache.find((r) => r.id === role_id) || {}).name || 'Papel removido',
      colors: colors.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    }))
    .sort((a, b) => (roleOrder.get(a.role_id) || 0) - (roleOrder.get(b.role_id) || 0));
}

let moduleImageColorsCache = []; // [{ role_id, role_name, colors: [...] }]
let moduleImageColorSelectEls = {}; // role_id -> <select> vivo (pra ler o valor escolhido na hora de gerar)

// Preenche um <select> por papel de cor que este módulo realmente tem cor
// cadastrada — preserva a seleção atual se ainda for válida, senão cai pra
// 1ª cor cadastrada daquele papel (mesmo default de antes, agora por papel).
function populateModuleImageColorSelects(rolesWithColors) {
  const container = document.getElementById('module-image-color-selects');
  const noColorsHint = document.getElementById('module-image-no-colors-hint');
  const btn = document.getElementById('generate-module-image-btn');

  const prevValues = {};
  Object.keys(moduleImageColorSelectEls).forEach((roleId) => { prevValues[roleId] = moduleImageColorSelectEls[roleId].value; });

  container.innerHTML = '';
  moduleImageColorSelectEls = {};
  rolesWithColors.forEach(({ role_id, role_name, colors }) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = `Cor — ${role_name}`;
    const sel = document.createElement('select');
    sel.innerHTML = colors.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    if (colors.some((c) => c.id === prevValues[role_id])) sel.value = prevValues[role_id];
    wrap.appendChild(label);
    wrap.appendChild(sel);
    container.appendChild(wrap);
    moduleImageColorSelectEls[role_id] = sel;
  });

  const hasColors = rolesWithColors.length > 0;
  noColorsHint.style.display = hasColors ? 'none' : 'block';
  btn.disabled = !hasColors;
}

async function loadModuleImageColorOptions() {
  if (!selectedModuleId) return;
  moduleImageColorsCache = await fetchModuleColorsForImageList(selectedModuleId);
  populateModuleImageColorSelects(moduleImageColorsCache);
}

function resolvePiecesForViewer(piecesList, containerDims, colorsByRole, shelfQuantities, dimOverrides) {
  const { bodyDims } = Pricing.resolveBodyDims(piecesList, containerDims);
  const parts = [];
  (piecesList || []).forEach((piece) => {
    const pieceContainerDims = piece.position_role === 'leg' ? containerDims : bodyDims;
    const quantityOverride = piece.quantity_configurable ? shelfQuantities[piece.id] : undefined;
    // Sub-configuração de medidas (migration 036) — mesmo comportamento de
    // portal.js/client.js; dimOverrides é opcional (a aba Imagem 3D não
    // passa nada), usado pelo export de furação (migration 038) com os
    // dim_overrides gravados no pedido.
    const dimOverride = piece.client_dimension_configurable && dimOverrides ? dimOverrides[piece.id] : undefined;
    const dims = Pricing.calculatePiece(piece, pieceContainerDims, quantityOverride, dimOverride);

    // Visibilidade condicional (migration 031) — mesma checagem do preço
    // (Pricing.calculateAssembly), pra 3D e preço nunca divergirem.
    if (!Pricing.isPieceVisible(piece, pieceContainerDims)) return;

    if (Pricing.isBelowMinLockedPreset(piece.locked_width_presets, dims.width_mm)
      || Pricing.isBelowMinLockedPreset(piece.locked_height_presets, dims.height_mm)
      || Pricing.isBelowMinLockedPreset(piece.locked_depth_presets, dims.depth_mm)) {
      return;
    }

    const color = colorsByRole && colorsByRole[piece.color_role_id];
    const roundedQty = Math.round(dims.quantity);
    const qty = Math.max(isNaN(roundedQty) ? 1 : roundedQty, 0);

    let resolvedDepthMm = dims.depth_mm;
    if (piece.fixed_depths && piece.fixed_depths.length > 0) {
      resolvedDepthMm = Pricing.pickDrawerDepth(piece.fixed_depths, dims.depth_mm);
    } else if (piece.locked_depth_presets && piece.locked_depth_presets.length > 0) {
      resolvedDepthMm = Pricing.pickNearestPreset(piece.locked_depth_presets, dims.depth_mm);
    }
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

    // Trava de segurança — mesmo comportamento de client.js/portal.js, agora
    // condicional a position_role !== 'free' (2026-07-09): 'free' já ignora
    // vão-interno/empilhamento automático em placePieceInBox, então também
    // não deve ter a MEDIDA clampada aqui — ver comentário completo em
    // client.js pro histórico (is_module foi tentado antes e revertido).
    if (piece.position_role !== 'free') {
      resolvedWidthMm = Math.min(resolvedWidthMm, pieceContainerDims.W);
      resolvedHeightMm = Math.min(resolvedHeightMm, pieceContainerDims.H);
      resolvedDepthMm = Math.min(resolvedDepthMm, pieceContainerDims.D);
    }

    let childParts = null;
    if (piece.is_module && piece.child_pieces && piece.child_pieces.length) {
      const childContainerDims = { W: resolvedWidthMm, H: resolvedHeightMm, D: resolvedDepthMm };
      childParts = resolvePiecesForViewer(piece.child_pieces, childContainerDims, colorsByRole, shelfQuantities, dimOverrides);
    }

    // N/COUNT (pedido do usuário 2026-07-15): quando esta peça se repete
    // (qty>1, tipicamente quantity_configurable — ex: várias prateleiras
    // 'free' escolhidas pelo cliente), o deslocamento agora é avaliado
    // DENTRO do loop, uma vez por cópia — cada cópia ganha as PRÓPRIAS N
    // (seu número, 1..qty) e COUNT (qty total) na fórmula, além de W/H/D/w/h/d
    // de sempre. Antes offset_x/y/z_mm era calculado UMA vez só (fora do
    // loop) e repetido em toda cópia — por isso N cópias de 'free' nasciam
    // todas empilhadas exatamente na mesma posição (nenhuma fórmula tinha
    // como saber "sou a 2ª de 3"). Com qty=1 (peça única, o caso mais comum),
    // N=1 e COUNT=1 sempre — fórmulas antigas que não usam N/COUNT continuam
    // se comportando EXATAMENTE como antes, comportamento antigo preservado.
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
        reference: piece.reference || piece.module_name || null,
        // Ids pra furação (migration 038): component_id = catálogo (busca em
        // component_drillings; null em peça-módulo), piece_id = linha de
        // module_components (só diagnóstico). A aba Imagem 3D ignora ambos.
        component_id: piece.component_id || null,
        piece_id: piece.id || null,
        // Origem (migration 034) — o export de furação pula peça 'comprado'
        // (ferragem pronta não é furada). Vem do spread de row.components.
        origin: piece.origin || 'fabricacao',
        position_role: piece.position_role,
        shape_type: piece.shape_type, // migration 062 — desenho 3D (caixa/cabide tubular oval)
        tilt_angle_deg: piece.tilt_angle_deg || 0, // migration 065 — inclinação (só 'shelf')
        rotation_y_deg: piece.rotation_y_deg || 0, // migration 067 — giro de canto (só 'free')
        // Recortes em L (migration 094) — entalhes do toe/gola na lateral,
        // ver viewer3d.js buildPanelGeometry. [] = peça inteira.
        recortes: piece.recortes || [],
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
        // Fita de borda (migration 088) — o 3D usa junto com positioning
        // pra decidir qual face leva fita e qual mostra o miolo da chapa
        // (js/viewer3d.js makeBoxMaterials). null = componente ainda na
        // fórmula antiga: desenha como sempre, material único.
        edge_banding: piece.edge_banding == null ? null : Number(piece.edge_banding),
        // Suporte de prateleira (migration 045) — vem do spread de
        // row.components; a furação usa pra furar a lateral sob a prateleira.
        drill_shelf_support: !!piece.drill_shelf_support,
        child_pieces: childParts
      });
    }
  });
  return parts;
}

let moduleImageViewerInitialized = false;

function renderModuleImageSection() {
  const module = modulesCache.find((m) => m.id === selectedModuleId);
  const preview = document.getElementById('module-image-preview');
  const emptyHint = document.getElementById('module-image-empty-hint');
  document.getElementById('module-image-status').textContent = '';
  if (module && module.thumbnail_data_url) {
    preview.src = module.thumbnail_data_url;
    preview.style.display = 'block';
    emptyHint.style.display = 'none';
  } else {
    preview.removeAttribute('src');
    preview.style.display = 'none';
    emptyHint.style.display = 'block';
  }
}

// Extraído de generateModuleImage (fazia tudo isto inline) pra reaproveitar
// também em generateModuleAiImage — ambos os botões partem do MESMO print
// 3D fresco (mesma cor escolhida, mesma projeção), só o que fazem com esse
// print depois é diferente (salvar direto vs. mandar pro Gemini primeiro).
async function captureModuleViewerSnapshot() {
  const module = modulesCache.find((m) => m.id === selectedModuleId);
  if (!module) throw new Error('Nenhum módulo selecionado.');

  // Cor escolhida pelo admin nos selects (um por papel, ver
  // populateModuleImageColorSelects) em vez de travar sempre na 1ª cor
  // cadastrada — pedido do usuário.
  const colorsByRole = {};
  Object.keys(moduleImageColorSelectEls).forEach((roleId) => {
    const sel = moduleImageColorSelectEls[roleId];
    const roleColors = (moduleImageColorsCache.find((r) => r.role_id === roleId) || {}).colors || [];
    colorsByRole[roleId] = roleColors.find((c) => c.id === sel.value) || roleColors[0];
  });
  if (Object.keys(colorsByRole).length === 0) throw new Error('Este módulo não tem nenhuma cor cadastrada — cadastre uma cor antes de gerar a imagem.');

  const pieces = await loadRecursivePiecesForModule(module.id);

  // Configuração PADRÃO (mesmo critério de quickAddModule em portal.js):
  // medida padrão, só opcionais marcados "vem marcado por padrão".
  const effectivePieces = pieces.filter((p) => !p.client_optional || p.client_optional_default_on);
  const shelfQuantities = {};
  pieces.filter((p) => p.quantity_configurable).forEach((p) => { shelfQuantities[p.id] = p.quantity_default; });

  const containerDims = { W: module.width_default_mm, H: module.height_default_mm, D: module.depth_default_mm };
  const parts = resolvePiecesForViewer(effectivePieces, containerDims, colorsByRole, shelfQuantities);

  // Perspectiva ou visão paralela (ortográfica) — escolha do admin (radio
  // buttons ao lado do botão "Gerar imagem 3D"). setProjectionMode troca a
  // câmera ANTES do init() se ainda não inicializado (só guarda o modo,
  // ver viewer3d.js) — por isso vem antes do Viewer3D.init() abaixo.
  const projectionEl = document.querySelector('input[name="module-image-projection"]:checked');
  Viewer3D.setProjectionMode(projectionEl ? projectionEl.value : 'perspective');

  if (!moduleImageViewerInitialized) {
    Viewer3D.init('module-image-viewer3d-canvas');
    moduleImageViewerInitialized = true;
  }
  // refit:true -- câmera SEMPRE no mesmo ângulo relativo (calculado só a
  // partir de L/A/P em update(), viewer3d.js), ignorando qualquer orbit
  // anterior -- é isso que garante a "câmera fixa/padrão" pedida, igual
  // pra todo módulo. tightFrame:true -- pedido do usuário: margem mínima
  // garantida (sem cortar o módulo), bem mais justa que a margem padrão do
  // configurador do cliente (que não muda em nada com isso).
  Viewer3D.update({
    width_mm: module.width_default_mm,
    height_mm: module.height_default_mm,
    depth_mm: module.depth_default_mm,
    parts,
    refit: true,
    tightFrame: true
  });
  // Espera texturas (se houver) terminarem de carregar antes de capturar —
  // sem isso a miniatura podia sair com o fallback cinza (ver
  // makeMaterial) só porque o PNG ainda não tinha decodificado no instante
  // do render síncrono do snapshot().
  await Viewer3D.waitForPendingTextures();
  const dataUrl = Viewer3D.snapshot();
  if (!dataUrl) throw new Error('Não foi possível gerar a imagem (3D indisponível neste navegador).');

  return { dataUrl, colorsByRole, module };
}

async function generateModuleImage() {
  clearError('module-image-error');
  if (!selectedModuleId) return;

  const statusEl = document.getElementById('module-image-status');
  const btn = document.getElementById('generate-module-image-btn');
  btn.disabled = true;
  statusEl.textContent = 'Gerando...';

  try {
    const { dataUrl, module } = await captureModuleViewerSnapshot();

    const { error } = await supabaseClient.from('modules').update({ thumbnail_data_url: dataUrl }).eq('id', module.id);
    if (error) throw error;

    module.thumbnail_data_url = dataUrl;
    renderModuleImageSection();
    statusEl.textContent = 'Imagem gerada e salva — já aparece na vitrine do portal.';
  } catch (err) {
    showError('module-image-error', err);
    statusEl.textContent = '';
  } finally {
    // Só reabilita se ainda houver cor cadastrada — populateModuleImageColorSelects
    // já desabilita o botão quando a lista está vazia, não força reabilitar aqui.
    btn.disabled = moduleImageColorsCache.length === 0;
  }
}

document.getElementById('generate-module-image-btn').addEventListener('click', generateModuleImage);

// Faz upload de uma data URL (base64) pro bucket 'textures' — mesmo bucket
// já usado por uploadTextureIfSelected (foto de cor) e uploadReferencePhotoFile
// (fotos de referência manuais), só que a partir de uma imagem já gerada em
// memória (vinda do Gemini) em vez de um <input type="file">.
async function uploadDataUrlToTextures(dataUrl, pathPrefix) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error('Imagem inválida pra upload.');
  const mimeType = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ext = mimeType.split('/')[1] || 'png';
  const path = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabaseClient.storage.from('textures').upload(path, new Blob([bytes], { type: mimeType }), {
    cacheControl: '3600',
    upsert: false
  });
  if (uploadError) throw new Error('Falha ao subir imagem: ' + uploadError.message);
  const { data } = supabaseClient.storage.from('textures').getPublicUrl(path);
  return data.publicUrl;
}

// Ícones de vitrine dos módulos ANINHADOS usados como peça deste módulo
// (module_components.child_module_id, 1 nível — não desce pra netos) —
// pedido do usuário (2026-07-19): "e se levar como referencia pra geracao
// da ia esses icones de cada modulo selecionado?". Cada módulo filho já
// tem seu próprio modules.thumbnail_data_url (foto de vitrine, gerada por
// IA ou upload manual) — mandar isso como referência ajuda a IA a manter o
// design/ferragem daquela peça consistente com o que já foi gerado pra ela,
// em vez de reinventar. Cap de MAX_NESTED_MODULE_REF_ICONS: nunca manda
// mais que isso (custo/tamanho do payload) — se o módulo tiver mais peças-
// módulo distintas que o cap, os excedentes ficam de fora (sort_order já
// vem da query, então prioriza os primeiros na lista de peças).
const MAX_NESTED_MODULE_REF_ICONS = 3;
async function fetchNestedModuleRefIconsForModule(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('child_module_id')
    .eq('module_id', moduleId)
    .not('child_module_id', 'is', null)
    .order('sort_order');
  if (error || !data) return [];
  const seen = new Set();
  const result = [];
  for (const row of data) {
    if (!row.child_module_id || seen.has(row.child_module_id)) continue;
    seen.add(row.child_module_id);
    const childModule = modulesCache.find((m) => m.id === row.child_module_id);
    if (childModule && childModule.thumbnail_data_url) {
      result.push({ moduleName: childModule.name, dataUrl: childModule.thumbnail_data_url });
      if (result.length >= MAX_NESTED_MODULE_REF_ICONS) break;
    }
  }
  return result;
}

// "✨ Gerar imagem de IA" — pedido do usuário (2026-07-19): "e se colocar um
// 'gerar imagem de ia' e deixar tudo mais bonito no site. e essa imagem ja
// leva como referencia quando for usada em uma composicao. pra ver os
// detalhes melhor de cada modulo." Fluxo: mesmo print 3D fresco de
// captureModuleViewerSnapshot() acima → OpenAI gpt-image-1 em mode:'catalog'
// (fundo branco, sem sombra, ver generate-gallery-render/index.ts) → vira a
// nova imagem de vitrine (modules.thumbnail_data_url) E é salva em
// reference_photos (migration 050) como foto de referência DESTE módulo —
// bootstrap automático do banco de referências, sem precisar fotografar o
// produto de verdade. Se a IA falhar por qualquer motivo, a imagem de
// vitrine atual NÃO é tocada (só o "Gerar imagem 3D" puro é 100% confiável,
// sem depender de IA).
async function generateModuleAiImage() {
  clearError('module-image-error');
  if (!selectedModuleId) return;

  const statusEl = document.getElementById('module-image-status');
  const btn = document.getElementById('generate-module-ai-image-btn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gerando com IA...';
  statusEl.textContent = 'Gerando imagem de IA...';

  try {
    const { dataUrl: rawSnapshot, colorsByRole, module } = await captureModuleViewerSnapshot();

    // colorLabel: TEXTO, não imagem (mesmo mecanismo de
    // buildColorDescriptionForComposition em portal.js) — nome + hex
    // aproximado de cada cor escolhida, deduplicado.
    const colorLabel = [...new Set(Object.values(colorsByRole)
      .filter(Boolean)
      .map((c) => (c.swatch_hex ? `${c.name} (hex aproximado ${c.swatch_hex})` : c.name))
      .filter(Boolean))].join(', ') || null;

    const moduleRefImages = await fetchNestedModuleRefIconsForModule(module.id);

    const { data: renderData, error: renderError } = await supabaseClient.functions.invoke('generate-gallery-render', {
      body: { imageDataUrl: rawSnapshot, mode: 'catalog', colorLabel, moduleRefImages }
    });
    if (renderError || !renderData || !renderData.imageDataUrl) {
      console.error('generate-gallery-render (catalog) falhou:', renderError, renderData);
      if (renderError && typeof renderError.context?.json === 'function') {
        renderError.context.json().then((body) => console.error('Corpo do erro:', body)).catch(() => {});
      }
      throw new Error('Não foi possível gerar a imagem de IA agora (a imagem de vitrine não foi alterada). Veja o console/logs da function pra detalhes.');
    }
    const aiDataUrl = renderData.imageDataUrl;

    const { error: updateError } = await supabaseClient.from('modules').update({ thumbnail_data_url: aiDataUrl }).eq('id', module.id);
    if (updateError) throw updateError;
    module.thumbnail_data_url = aiDataUrl;
    renderModuleImageSection();

    // Bootstrap automático do banco de referências — best-effort: se isto
    // falhar, a imagem de vitrine já foi salva com sucesso acima, não trava
    // nem mostra erro pro admin por causa disso (é um bônus, não o objetivo
    // principal do botão).
    try {
      const AUTO_CAPTION = 'Gerado automaticamente (imagem de vitrine)';
      const photoUrl = await uploadDataUrlToTextures(aiDataUrl, 'reference-photos');
      // Substitui a referência AUTO-gerada anterior deste módulo (se houver)
      // em vez de acumular uma nova toda vez que o admin clica de novo —
      // referência cadastrada manualmente (caption diferente) nunca é tocada.
      await supabaseClient.from('reference_photos').delete().eq('module_id', module.id).eq('caption', AUTO_CAPTION);
      await supabaseClient.from('reference_photos').insert({ module_id: module.id, photo_url: photoUrl, caption: AUTO_CAPTION });
    } catch (refErr) {
      console.error('Falha ao salvar referência automática (não crítico):', refErr);
    }

    statusEl.textContent = 'Imagem de IA gerada e salva — já aparece na vitrine do portal e como referência do módulo.';
  } catch (err) {
    showError('module-image-error', err);
    statusEl.textContent = '';
  } finally {
    btn.disabled = moduleImageColorsCache.length === 0;
    btn.textContent = originalLabel;
  }
}

document.getElementById('generate-module-ai-image-btn').addEventListener('click', generateModuleAiImage);

// Muda pra aba "Configurar módulo" e já seleciona um módulo específico —
// atalho usado pelo botão "Ver módulo" numa peça-módulo aninhada (ver
// renderModuleNestedRow) pra navegar direto pra configuração do módulo
// filho, igual "Ver componente" já faz pra componentes de catálogo.
function goToModuleConfig(moduleId) {
  const tabBtn = document.querySelector('.admin-tab-btn[data-tab="tab-module-config"]');
  if (tabBtn) tabBtn.click();
  const sel = document.getElementById('module-select');
  sel.value = moduleId;
  sel.dispatchEvent(new Event('change'));
}

// ---------- PROFUNDIDADES FIXAS DO MÓDULO ----------
// Generaliza o antigo drawer_type_depths: QUALQUER módulo pode ter medidas
// fixas de profundidade, usadas quando ELE MESMO é usado como peça aninhada
// dentro de outro módulo (ver module_components.child_module_id). Não afeta
// o módulo quando usado como módulo-pai comum.

async function renderModuleFixedDepthsList() {
  const container = document.getElementById('module-fixed-depths-list');
  if (!selectedModuleId) { container.innerHTML = ''; return; }
  const { data, error } = await supabaseClient
    .from('module_fixed_depths')
    .select('*')
    .eq('module_id', selectedModuleId)
    .order('depth_mm');
  if (error) { showError('module-fixed-depths-error', error); return; }
  container.innerHTML = '';
  if (!data || data.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Nenhuma profundidade fixa cadastrada — este módulo estica livremente (comportamento padrão).';
    container.appendChild(p);
    return;
  }
  data.forEach((row) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'row';
    rowDiv.style.alignItems = 'center';
    rowDiv.style.marginTop = '4px';
    const label = document.createElement('span');
    label.textContent = `${Number(row.depth_mm).toFixed(0)} mm`;
    label.style.flex = '1';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'danger';
    removeBtn.style.marginTop = '0';
    removeBtn.textContent = 'Remover';
    removeBtn.addEventListener('click', async () => {
      await supabaseClient.from('module_fixed_depths').delete().eq('id', row.id);
      renderModuleFixedDepthsList();
    });
    rowDiv.appendChild(label);
    rowDiv.appendChild(removeBtn);
    container.appendChild(rowDiv);
  });
}

document.getElementById('module-add-fixed-depth-btn').addEventListener('click', async () => {
  if (!selectedModuleId) return;
  const input = document.getElementById('module-new-fixed-depth');
  const value = parseFloat(input.value);
  if (!value || value <= 0) return;
  const { error } = await supabaseClient.from('module_fixed_depths').insert({ module_id: selectedModuleId, depth_mm: value });
  if (error) { showError('module-fixed-depths-error', error); return; }
  input.value = '';
  renderModuleFixedDepthsList();
});

// Busca as profundidades fixas de um módulo qualquer (usado ao resolver uma
// peça-módulo aninhada — não necessariamente o módulo selecionado na tela).
async function fetchModuleFixedDepths(moduleId) {
  const { data, error } = await supabaseClient.from('module_fixed_depths').select('depth_mm').eq('module_id', moduleId);
  if (error) { console.error(error); return []; }
  return (data || []).map((r) => Number(r.depth_mm));
}

// ---------- VALORES SUGERIDOS/TRAVADOS DE MEDIDA (migration 028) ----------
// Largura/Altura/Profundidade do módulo de PRIMEIRO NÍVEL (o que o próprio
// cliente escolhe e configura direto no portal) — diferente das
// "Profundidades fixas" acima, que só entram em jogo quando ESTE módulo é
// usado como peça aninhada dentro de outro. Sem trava (padrão): a régua
// livre continua igual, esses valores só aparecem como chips de atalho.
// Com trava: a régua livre some, vira um dropdown só com esses valores.

const DIMENSION_PRESET_DIMENSIONS = [
  { key: 'width', label: 'Largura' },
  { key: 'height', label: 'Altura' },
  { key: 'depth', label: 'Profundidade' }
];

// Catálogo de valores padrão "com referência" (código interno conhecido) —
// usado pra preencher a caixa de seleção rápida abaixo da tabela, em vez de
// digitar Valor/Nome/Referência na mão toda vez. Largura já vem populada com
// a série B09-B48 (padrão de largura de armário base, 3" em 3", igual aos
// valores B09-B24 já cadastrados). Altura/Profundidade ficam vazias por
// enquanto — nenhuma convenção de código foi confirmada pra elas ainda; para
// popular, adicione objetos no mesmo formato { value_mm, label, reference }.
const DIMENSION_PRESET_CATALOG = {
  width: [
    { value_mm: 229, label: 'B09', reference: '' },
    { value_mm: 305, label: 'B12', reference: '' },
    { value_mm: 381, label: 'B15', reference: '' },
    { value_mm: 457, label: 'B18', reference: '' },
    { value_mm: 533, label: 'B21', reference: '' },
    { value_mm: 609, label: 'B24', reference: '' },
    { value_mm: 686, label: 'B27', reference: '' },
    { value_mm: 762, label: 'B30', reference: '' },
    { value_mm: 838, label: 'B33', reference: '' },
    { value_mm: 914, label: 'B36', reference: '' },
    { value_mm: 991, label: 'B39', reference: '' },
    { value_mm: 1067, label: 'B42', reference: '' },
    { value_mm: 1143, label: 'B45', reference: '' },
    { value_mm: 1219, label: 'B48', reference: '' }
  ],
  height: [],
  depth: []
};

// Troca o sort_order de duas linhas VIZINHAS da mesma dimensão (mesmo padrão
// de setupLookupCRUD/moveColor: troca os dois valores e regrava os dois) —
// `rows` já vem ordenado por sort_order (query em renderModuleDimensionPresets),
// então o índice na lista É a posição visual de verdade.
async function moveDimensionPreset(rows, index, dir) {
  const otherIndex = index + dir;
  if (otherIndex < 0 || otherIndex >= rows.length) return;
  const a = rows[index];
  const b = rows[otherIndex];
  const { error } = await supabaseClient.from('module_dimension_presets').upsert([
    { ...a, sort_order: b.sort_order },
    { ...b, sort_order: a.sort_order }
  ]);
  if (error) { showError('module-dimension-presets-error', error); return; }
  renderModuleDimensionPresets();
}

async function renderModuleDimensionPresets() {
  const container = document.getElementById('module-dimension-presets-groups');
  if (!selectedModuleId) { container.innerHTML = ''; return; }

  const module = modulesCache.find((m) => m.id === selectedModuleId);

  const { data, error } = await supabaseClient
    .from('module_dimension_presets')
    .select('*')
    .eq('module_id', selectedModuleId)
    .order('sort_order');
  if (error) { showError('module-dimension-presets-error', error); return; }

  const byDimension = { width: [], height: [], depth: [] };
  (data || []).forEach((row) => { if (byDimension[row.dimension]) byDimension[row.dimension].push(row); });

  container.innerHTML = '';
  DIMENSION_PRESET_DIMENSIONS.forEach(({ key, label }) => {
    const group = document.createElement('div');
    group.className = 'dim-preset-group';
    group.style.marginTop = '16px';
    group.style.paddingTop = '12px';
    group.style.borderTop = '1px solid #e3ddd0';

    const heading = document.createElement('h3');
    heading.textContent = label;
    heading.style.margin = '0 0 6px 0';
    group.appendChild(heading);

    const lockLabel = document.createElement('label');
    lockLabel.style.display = 'block';
    lockLabel.style.marginBottom = '8px';
    const lockCheckbox = document.createElement('input');
    lockCheckbox.type = 'checkbox';
    lockCheckbox.style.width = 'auto';
    lockCheckbox.style.display = 'inline-block';
    lockCheckbox.checked = !!(module && module[`${key}_locked`]);
    lockCheckbox.addEventListener('change', async () => {
      const { error: lockErr } = await supabaseClient
        .from('modules')
        .update({ [`${key}_locked`]: lockCheckbox.checked })
        .eq('id', selectedModuleId);
      if (lockErr) { showError('module-dimension-presets-error', lockErr); lockCheckbox.checked = !lockCheckbox.checked; return; }
      if (module) module[`${key}_locked`] = lockCheckbox.checked;
    });
    lockLabel.appendChild(lockCheckbox);
    lockLabel.appendChild(document.createTextNode(' Travar (cliente só escolhe entre as opções abaixo, sem régua livre)'));
    group.appendChild(lockLabel);

    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Valor (mm)</th><th>Nome</th><th>Descrição</th><th>Referência (interna)</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');
    const rows = byDimension[key];
    if (rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 5;
      td.className = 'hint';
      td.textContent = 'Nenhum valor cadastrado.';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      const valTd = document.createElement('td'); valTd.textContent = `${Number(row.value_mm).toFixed(0)} mm`;
      const labelTd = document.createElement('td'); labelTd.textContent = row.label || '—';
      const descTd = document.createElement('td'); descTd.textContent = row.description || '—';
      const refTd = document.createElement('td'); refTd.textContent = row.reference || '—';
      const actionTd = document.createElement('td');
      actionTd.style.whiteSpace = 'nowrap';

      // ▲▼ (pedido do usuário 2026-07-29: "quero poder reordenar as posições
      // travadas, pra cima ou pra baixo") — mesma ideia das setas de
      // família/categoria/cor (troca o sort_order dos dois vizinhos e regrava
      // os dois); `rows` já vem ordenado por sort_order (query acima), então
      // o índice na lista é a posição visual de verdade. Essa ordem é a
      // mesma que o cliente vê no dropdown "Travado" (sem régua livre) do
      // portal.
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'secondary';
      upBtn.style.marginTop = '0';
      upBtn.style.marginRight = '4px';
      upBtn.textContent = '▲';
      upBtn.title = 'Mover pra cima';
      upBtn.disabled = index === 0;
      upBtn.addEventListener('click', () => moveDimensionPreset(rows, index, -1));

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'secondary';
      downBtn.style.marginTop = '0';
      downBtn.style.marginRight = '6px';
      downBtn.textContent = '▼';
      downBtn.title = 'Mover pra baixo';
      downBtn.disabled = index === rows.length - 1;
      downBtn.addEventListener('click', () => moveDimensionPreset(rows, index, 1));

      // "Editar" (pedido do usuário 2026-07-29: "quero mudar alguma
      // informacao... para largura, altura e profundidade") — antes só dava
      // pra Remover e recadastrar do zero pra corrigir um valor/nome/
      // descrição/referência. Edição IN-PLACE: troca as 4 células de texto
      // por inputs preenchidos com o valor atual, e os botões da linha por
      // Salvar/Cancelar — mesmos campos do formulário "+ Adicionar" abaixo,
      // só que fazendo update em vez de insert. Cancelar/Salvar chamam
      // renderModuleDimensionPresets() de novo, que já busca do banco e
      // desfaz a edição in-place sozinho (sem precisar de estado próprio).
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'secondary';
      editBtn.style.marginTop = '0';
      editBtn.style.marginRight = '6px';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', () => {
        valTd.innerHTML = '';
        const valueEditInput = document.createElement('input');
        valueEditInput.type = 'number'; valueEditInput.min = '0'; valueEditInput.style.width = '90px';
        valueEditInput.value = row.value_mm;
        valTd.appendChild(valueEditInput);

        labelTd.innerHTML = '';
        const labelEditInput = document.createElement('input');
        labelEditInput.type = 'text'; labelEditInput.value = row.label || '';
        labelTd.appendChild(labelEditInput);

        descTd.innerHTML = '';
        const descEditInput = document.createElement('input');
        descEditInput.type = 'text'; descEditInput.value = row.description || '';
        descTd.appendChild(descEditInput);

        refTd.innerHTML = '';
        const refEditInput = document.createElement('input');
        refEditInput.type = 'text'; refEditInput.value = row.reference || '';
        refTd.appendChild(refEditInput);

        actionTd.innerHTML = '';
        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'secondary';
        saveBtn.style.marginTop = '0';
        saveBtn.style.marginRight = '6px';
        saveBtn.textContent = 'Salvar';
        saveBtn.addEventListener('click', async () => {
          const value = parseFloat(valueEditInput.value);
          if (!value || value <= 0) return;
          const { error: updErr } = await supabaseClient.from('module_dimension_presets').update({
            value_mm: value,
            label: labelEditInput.value.trim() || null,
            description: descEditInput.value.trim() || null,
            reference: refEditInput.value.trim() || null
          }).eq('id', row.id);
          if (updErr) { showError('module-dimension-presets-error', updErr); return; }
          renderModuleDimensionPresets();
        });
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'secondary';
        cancelBtn.style.marginTop = '0';
        cancelBtn.textContent = 'Cancelar';
        cancelBtn.addEventListener('click', () => renderModuleDimensionPresets());
        actionTd.appendChild(saveBtn);
        actionTd.appendChild(cancelBtn);
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'danger';
      removeBtn.style.marginTop = '0';
      removeBtn.textContent = 'Remover';
      removeBtn.addEventListener('click', async () => {
        await supabaseClient.from('module_dimension_presets').delete().eq('id', row.id);
        renderModuleDimensionPresets();
      });
      actionTd.appendChild(upBtn);
      actionTd.appendChild(downBtn);
      actionTd.appendChild(editBtn);
      actionTd.appendChild(removeBtn);
      tr.appendChild(valTd); tr.appendChild(labelTd); tr.appendChild(descTd); tr.appendChild(refTd); tr.appendChild(actionTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    group.appendChild(table);

    // Caixa de seleção rápida: escolher um valor já conhecido/padrão (com
    // referência) preenche os campos abaixo sozinho — só falta clicar em
    // "+ Adicionar" como de costume. Some se não houver catálogo pra essa
    // dimensão, ou já usar todos os valores cadastrados.
    const catalog = DIMENSION_PRESET_CATALOG[key] || [];
    const usedValues = new Set(rows.map((r) => Number(r.value_mm)));
    const availablePresets = catalog.filter((p) => !usedValues.has(p.value_mm));
    let quickSelect = null;
    if (availablePresets.length > 0) {
      const quickRow = document.createElement('div');
      quickRow.className = 'row';
      quickRow.style.marginTop = '8px';
      quickRow.style.alignItems = 'center';
      quickRow.innerHTML = `<div><select class="dim-preset-quick-select"><option value="">Valor padrão (com referência)…</option></select></div>`;
      quickSelect = quickRow.querySelector('.dim-preset-quick-select');
      availablePresets.forEach((preset, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `${preset.value_mm} mm — ${preset.label}`;
        quickSelect.appendChild(opt);
      });
      group.appendChild(quickRow);
    }

    const addRow = document.createElement('div');
    addRow.className = 'row';
    addRow.style.marginTop = '8px';
    addRow.style.alignItems = 'center';
    addRow.innerHTML = `
      <div><input type="number" min="0" class="dim-preset-value" placeholder="Valor (mm)" /></div>
      <div><input type="text" class="dim-preset-label" placeholder="Nome (opcional)" /></div>
      <div><input type="text" class="dim-preset-description" placeholder="Descrição (opcional)" /></div>
      <div><input type="text" class="dim-preset-reference" placeholder="Referência interna (opcional)" /></div>
      <div style="flex:0;"><button type="button" class="secondary dim-preset-add-btn" style="margin-top:0;white-space:nowrap;">+ Adicionar</button></div>
    `;
    const valueInput = addRow.querySelector('.dim-preset-value');
    const labelInput = addRow.querySelector('.dim-preset-label');
    const descInput = addRow.querySelector('.dim-preset-description');
    const refInput = addRow.querySelector('.dim-preset-reference');
    if (quickSelect) {
      quickSelect.addEventListener('change', () => {
        if (quickSelect.value === '') return;
        const preset = availablePresets[Number(quickSelect.value)];
        if (!preset) return;
        valueInput.value = preset.value_mm;
        labelInput.value = preset.label || '';
        descInput.value = preset.description || '';
        refInput.value = preset.reference || '';
        quickSelect.value = '';
      });
    }
    addRow.querySelector('.dim-preset-add-btn').addEventListener('click', async () => {
      const value = parseFloat(valueInput.value);
      if (!value || value <= 0) return;
      const { error: addErr } = await supabaseClient.from('module_dimension_presets').insert({
        module_id: selectedModuleId,
        dimension: key,
        value_mm: value,
        label: labelInput.value.trim() || null,
        description: descInput.value.trim() || null,
        reference: refInput.value.trim() || null,
        sort_order: rows.length
      });
      if (addErr) { showError('module-dimension-presets-error', addErr); return; }
      valueInput.value = ''; labelInput.value = ''; descInput.value = ''; refInput.value = '';
      renderModuleDimensionPresets();
    });
    group.appendChild(addRow);

    container.appendChild(group);
  });
}

// ---------- PREVENÇÃO DE CICLO (módulo-como-componente) ----------
// Migration 023 NÃO impede ciclos no banco (módulo A contendo B contendo A
// de volta) — isso fica por conta da aplicação. Antes de deixar o admin
// escolher um módulo candidato como peça aninhada dentro do módulo atual,
// verificamos se esse candidato JÁ contém (direta ou indiretamente) o
// módulo atual — se contém, permitir a escolha fecharia um ciclo.
async function getModuleDescendantIds(moduleId, seen) {
  seen = seen || new Set();
  if (seen.has(moduleId)) return seen;
  seen.add(moduleId);
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('child_module_id')
    .eq('module_id', moduleId)
    .not('child_module_id', 'is', null);
  if (error) return seen;
  for (const row of (data || [])) {
    if (row.child_module_id && !seen.has(row.child_module_id)) {
      await getModuleDescendantIds(row.child_module_id, seen);
    }
  }
  return seen;
}

let moduleComponentFieldRefs = []; // referências vivas aos controles renderizados — usadas pra ler o estado atual (ainda não salvo) na hora de testar/salvar
let moduleComponentRenderedModuleIds = new Set(); // ids de MÓDULOS já mostrados como peça aninhada (usados + adicionados nesta sessão) — paralelo a moduleComponentRenderedIds (componentes)
let moduleAddModuleSelectEl = null; // <select> vivo da seção "Adicionar módulo (peça aninhada)"
let moduleAddModuleSectionEl = null; // wrapper vivo dessa seção — novas linhas entram antes dele

// "📋 Copiar" / "📋 Colar aqui" (pedido do usuário 2026-07-31: a primeira
// versão — escolher módulo de origem + escolher peça em 2 selects — "ficou
// bem chata de fazer isso, quero copiar e colar mesmo, 2 cliques") —
// clipboard em memória (dura a sessão inteira do admin, sobrevive trocar de
// módulo): 📋 Copiar numa linha (renderModuleComponentRow/renderModuleNestedRow)
// grava aqui a configuração INTEIRA daquela linha (mesmo buildLinkDataFromRef
// já usado por "+ Duplicar" — funciona mesmo se a linha original ainda não
// foi salva); abrir OUTRO módulo e clicar "📋 Colar aqui" (renderPasteComponentSection)
// insere uma linha nova com essa configuração. null = nada copiado ainda.
let copiedModuleComponentLink = null; // { kind: 'component'|'module', catalogId, catalogLabel, sourceModuleName, link }
let modulePasteLabelEl = null; // <span> vivo que mostra "Copiado: X (de Y)" — atualizado por refreshPasteComponentButton
let modulePasteBtnEl = null; // botão "📋 Colar aqui" vivo — habilitado/desabilitado por refreshPasteComponentButton

// Reconta quais módulos estão em uso como peça aninhada (linhas atualmente
// renderizadas, salvas ou não) — chamado depois de um "🔁 Trocar módulo"
// (ver renderModuleNestedRow) pra manter moduleComponentRenderedModuleIds
// (e por consequência o select de "Adicionar módulo") consistente com o
// novo child_module_id da linha trocada, sem precisar recarregar a lista
// inteira do banco.
function recomputeRenderedModuleIds() {
  moduleComponentRenderedModuleIds = new Set(
    moduleComponentFieldRefs.filter((r) => r.kind === 'module').map((r) => r.childModuleId)
  );
}

async function renderModuleComponentsList() {
  const container = document.getElementById('module-components-list');
  if (!selectedModuleId) { container.innerHTML = ''; return; }

  const { data: links, error } = await supabaseClient
    .from('module_components')
    .select('id, component_id, child_module_id, quantity_override, sort_order, width_formula_override, height_formula_override, depth_formula_override, offset_x_mm, offset_y_mm, offset_z_mm, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, tilt_angle_deg, rotation_y_deg, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, client_dimension_configurable, width_min_mm, width_default_mm, width_max_mm, height_min_mm, height_default_mm, height_max_mm, depth_min_mm, depth_default_mm, depth_max_mm')
    .eq('module_id', selectedModuleId);
  if (error) { showError('pieces-error', error); return; }
  moduleComponentLinks = links || []; // estado como está gravado no banco agora (linha de base)
  const componentLinks = moduleComponentLinks.filter((l) => l.component_id);
  const moduleLinks = moduleComponentLinks.filter((l) => l.child_module_id);
  // REPETIÇÃO PERMITIDA (migration 025): o mesmo componente/módulo pode
  // aparecer em mais de uma linha (posições diferentes) — por isso agora
  // agrupa num Map de ARRAYS (uma entrada por instância), não mais um valor
  // único por component_id/child_module_id. Usado só pra filtrar as opções
  // já usadas nos selects "Adicionar componente"/"Adicionar módulo" — a
  // ORDEM de exibição na tela vem de allLinksSorted, logo abaixo.
  const linkedMap = new Map();
  componentLinks.forEach((l) => {
    if (!linkedMap.has(l.component_id)) linkedMap.set(l.component_id, []);
    linkedMap.get(l.component_id).push(l);
  });
  const linkedModuleMap = new Map();
  moduleLinks.forEach((l) => {
    if (!linkedModuleMap.has(l.child_module_id)) linkedModuleMap.set(l.child_module_id, []);
    linkedModuleMap.get(l.child_module_id).push(l);
  });
  moduleComponentRenderedIds = new Set(linkedMap.keys());
  moduleComponentRenderedModuleIds = new Set(linkedModuleMap.keys());

  setSaveStatus('', '');
  container.innerHTML = '';
  moduleComponentFieldRefs = [];

  const usedHeading = document.createElement('p');
  usedHeading.className = 'hint';
  usedHeading.style.marginTop = '0';
  usedHeading.textContent = moduleComponentLinks.length > 0
    ? 'Peças usadas neste módulo:'
    : 'Nenhuma peça usada ainda neste módulo — use "Adicionar componente" ou "Adicionar módulo" abaixo.';
  container.appendChild(usedHeading);

  // Uma linha por INSTÂNCIA (não por componente/módulo) — se o mesmo
  // componente tiver 2 linhas gravadas (2 posições diferentes), renderiza as
  // 2, cada uma com seu próprio rowId/offset/quantidade. TODAS as linhas
  // (componente + módulo aninhado) são ordenadas JUNTAS por sort_order — as
  // setas ▲▼ (moveModulePieceRow) reordenam livremente entre os dois tipos,
  // então a exibição tem que respeitar essa ordem única, não mais agrupar
  // por componente/catálogo como antes (o que ignorava qualquer reordenação
  // manual do admin).
  const allLinksSorted = [...moduleComponentLinks].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  allLinksSorted.forEach((link) => {
    if (link.component_id) {
      const c = componentsCache.find((x) => x.id === link.component_id);
      if (c) renderModuleComponentRow(c, link, container);
    } else if (link.child_module_id) {
      const m = modulesCache.find((x) => x.id === link.child_module_id);
      if (m) renderModuleNestedRow(m, link, container);
    }
  });

  renderAddComponentSection(container);
  await renderAddModuleSection(container);
  renderPasteComponentSection(container);

  computeModulePieces();
}

// "📋 Colar aqui" (pedido do usuário 2026-07-31, 2ª versão — a 1ª exigia
// escolher módulo de origem + escolher a peça em 2 selects, "ficou bem
// chata... quero copiar e colar mesmo, 2 cliques"): mostra o que está no
// clipboard em memória (copiedModuleComponentLink, preenchido pelo botão
// "📋 Copiar" de renderModuleComponentRow/renderModuleNestedRow) e um botão
// que insere essa configuração aqui — só 2 cliques no total (Copiar na
// linha de origem, Colar aqui). Sem nada copiado ainda, mostra só a dica e
// o botão fica desabilitado (nunca escondido — senão o admin não saberia
// que o recurso existe antes de usar o Copiar pela 1ª vez).
function renderPasteComponentSection(container) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';
  wrap.style.borderTop = '1px solid #eee';
  wrap.style.paddingTop = '12px';
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';
  wrap.style.flexWrap = 'wrap';

  const label = document.createElement('span');
  label.className = 'hint';
  label.style.flex = '1';

  const pasteBtn = document.createElement('button');
  pasteBtn.type = 'button';
  pasteBtn.className = 'secondary';
  pasteBtn.textContent = '📋 Colar aqui';
  pasteBtn.style.flex = '0 0 auto';

  wrap.appendChild(label);
  wrap.appendChild(pasteBtn);
  container.appendChild(wrap);

  modulePasteLabelEl = label;
  modulePasteBtnEl = pasteBtn;
  refreshPasteComponentButton();

  pasteBtn.addEventListener('click', async () => {
    const copied = copiedModuleComponentLink;
    if (!copied) return;
    pasteBtn.disabled = true;
    try {
      if (copied.kind === 'component') {
        const c = componentsCache.find((x) => x.id === copied.catalogId);
        if (!c) { alert('O componente copiado não existe mais no catálogo — não dá pra colar.'); return; }
        renderModuleComponentRow(c, { ...copied.link, id: null }, container, wrap, true);
        moduleComponentRenderedIds.add(c.id);
        refreshAddComponentOptions();
      } else {
        const m = modulesCache.find((x) => x.id === copied.catalogId);
        if (!m) { alert('O módulo copiado não existe mais — não dá pra colar.'); return; }
        // Mesma trava de ciclo do "Adicionar módulo" (refreshAddModuleOptions)
        // — colar uma peça-módulo que (direta ou indiretamente) contém ESTE
        // módulo criaria uma recursão infinita no desenho 3D/cálculo de preço.
        const descendants = await getModuleDescendantIds(m.id);
        if (descendants.has(selectedModuleId)) {
          alert('Não é possível colar esta peça aqui: ela faria este módulo entrar dentro dele mesmo (ciclo).');
          return;
        }
        renderModuleNestedRow(m, { ...copied.link, id: null }, container, wrap, true);
        moduleComponentRenderedModuleIds.add(m.id);
        await refreshAddModuleOptions();
      }
      setSaveStatus('Alterações não salvas.', 'unsaved');
      computeModulePieces();
    } finally {
      pasteBtn.disabled = false;
    }
  });
}

// Atualiza o texto/estado do botão "📋 Colar aqui" — chamado tanto ao
// renderizar a seção (renderPasteComponentSection) quanto na hora do "📋
// Copiar" de uma linha (pra refletir na hora, caso copiar e colar aconteçam
// dentro do MESMO módulo aberto, sem trocar de tela no meio).
function refreshPasteComponentButton() {
  if (!modulePasteLabelEl || !modulePasteBtnEl) return;
  if (!copiedModuleComponentLink) {
    modulePasteLabelEl.textContent = 'Nada copiado ainda — clique em "📋 Copiar" numa peça (deste ou de outro módulo) pra poder colar aqui.';
    modulePasteBtnEl.disabled = true;
    return;
  }
  const kindLabel = copiedModuleComponentLink.kind === 'module' ? ' (módulo aninhado)' : '';
  modulePasteLabelEl.textContent = `Copiado: ${copiedModuleComponentLink.catalogLabel}${kindLabel} — de "${copiedModuleComponentLink.sourceModuleName}".`;
  modulePasteBtnEl.disabled = false;
}

// Seção "Adicionar componente" — uma lista suspensa só com os componentes do
// catálogo que este módulo AINDA NÃO usa, mais um botão que transforma a
// escolha numa linha configurável normal (igual as de cima). Nada é gravado
// no banco aqui — só quando o admin clicar em "Salvar componentes deste
// módulo", igual a qualquer outra alteração nesta tela.
function renderAddComponentSection(container) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '20px';
  wrap.style.borderTop = '1px solid #eee';
  wrap.style.paddingTop = '12px';
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';

  const select = document.createElement('select');
  select.style.marginTop = '0';
  select.style.flex = '1';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'secondary';
  addBtn.textContent = '+ Adicionar componente';
  addBtn.style.flex = '0 0 auto';

  wrap.appendChild(select);
  wrap.appendChild(addBtn);
  container.appendChild(wrap);

  moduleAddComponentSelectEl = select;
  moduleAddComponentSectionEl = wrap;
  refreshAddComponentOptions();

  addBtn.addEventListener('click', () => {
    const componentId = select.value;
    if (!componentId) return;
    const c = componentsCache.find((x) => x.id === componentId);
    if (!c) return;
    renderModuleComponentRow(c, null, container, wrap, true);
    moduleComponentRenderedIds.add(componentId);
    refreshAddComponentOptions();
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });
}

// Reconta quais componentes de catálogo estão em uso nesta lista (linhas
// atualmente renderizadas, salvas ou não) — chamado depois de um "🔁 Trocar"
// (ver renderModuleComponentRow) pra manter moduleComponentRenderedIds (e por
// consequência o select de "Adicionar componente") consistente com o novo
// component_id da linha trocada, sem precisar recarregar a lista inteira do
// banco. Paralelo a recomputeRenderedModuleIds (mesma ideia, pra módulos).
function recomputeRenderedComponentIds() {
  moduleComponentRenderedIds = new Set(
    moduleComponentFieldRefs.filter((r) => r.kind === 'component').map((r) => r.componentId)
  );
}

// Atualiza as opções do select de "Adicionar componente" pra sempre refletir
// só o que ainda não está na lista de cima (usado ou recém-adicionado nesta
// sessão, antes mesmo de salvar).
function refreshAddComponentOptions() {
  if (!moduleAddComponentSelectEl) return;
  const available = componentsCache.filter((c) => !moduleComponentRenderedIds.has(c.id));
  moduleAddComponentSelectEl.innerHTML = available.length > 0
    ? available.map((c) => `<option value="${c.id}">${c.reference}</option>`).join('')
    : '<option value="">Todo o catálogo já foi adicionado</option>';
}

// Seção "Adicionar módulo (peça aninhada)" — MÓDULO-COMO-COMPONENTE (migration
// 023): igual "Adicionar componente", mas a lista é de MÓDULOS em vez de
// componentes do catálogo — ex: um "modelo de porta Shaker" cadastrado como
// módulo comum (normalmente marcado "Invisível"), usado aqui como peça deste
// módulo. Exclui: o próprio módulo selecionado (não pode se conter), módulos
// já usados como peça aqui, e qualquer módulo que já contenha (direta ou
// indiretamente) o módulo atual — nestá-lo aqui fecharia um CICLO (ver
// getModuleDescendantIds e o comentário na migration 023 sobre essa
// prevenção ser responsabilidade da aplicação, não do banco).
async function renderAddModuleSection(container) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';
  wrap.style.display = 'flex';
  wrap.style.gap = '8px';
  wrap.style.alignItems = 'center';

  const select = document.createElement('select');
  select.style.marginTop = '0';
  select.style.flex = '1';

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'secondary';
  addBtn.textContent = '+ Adicionar módulo (peça aninhada)';
  addBtn.style.flex = '0 0 auto';

  wrap.appendChild(select);
  wrap.appendChild(addBtn);
  container.appendChild(wrap);

  moduleAddModuleSelectEl = select;
  moduleAddModuleSectionEl = wrap;
  await refreshAddModuleOptions();

  addBtn.addEventListener('click', () => {
    const childId = select.value;
    if (!childId) return;
    const m = modulesCache.find((x) => x.id === childId);
    if (!m) return;
    renderModuleNestedRow(m, null, container, wrap, true);
    moduleComponentRenderedModuleIds.add(childId);
    refreshAddModuleOptions();
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });
}

// Recalcula as opções do select de "Adicionar módulo" — assíncrono porque
// precisa checar, pra cada candidato, se nesta-lo criaria um ciclo.
async function refreshAddModuleOptions() {
  if (!moduleAddModuleSelectEl) return;
  const candidates = modulesCache.filter((m) =>
    m.id !== selectedModuleId && !moduleComponentRenderedModuleIds.has(m.id)
  );
  const allowed = [];
  for (const cand of candidates) {
    const descendants = await getModuleDescendantIds(cand.id);
    if (!descendants.has(selectedModuleId)) allowed.push(cand);
  }
  moduleAddModuleSelectEl.innerHTML = allowed.length > 0
    ? allowed.map((m) => `<option value="${m.id}">${m.name}${m.is_invisible ? ' (invisível)' : ''}</option>`).join('')
    : '<option value="">Nenhum módulo disponível (todos já usados ou formariam ciclo)</option>';
}

// Muda pra aba "Componentes" (biblioteca global) e já abre o componente em
// modo edição lá — atalho pra quando o admin quer mexer na definição do
// componente (fórmulas base, tipo, mão de obra...) sem precisar procurar
// manualmente na tabela.
function goToComponentInCatalog(id) {
  const tabBtn = document.querySelector('.admin-tab-btn[data-tab="tab-components"]');
  if (tabBtn) tabBtn.click();
  window.editComponent(id);
}

// Reordena as peças (setas ▲▼ de renderModuleComponentRow/
// renderModuleNestedRow) — pura manipulação de DOM, NADA é salvo no banco
// aqui: mesmo espírito de todo o resto desta tela (só grava quando o admin
// clica em "Salvar componentes deste módulo"). collectPendingLinks lê a
// ordem final direto do DOM (via wrap.dataset.rowId) na hora de montar
// sort_order, então mover aqui já é suficiente — não precisa reordenar
// nenhum array em memória junto.
// Só troca de posição com a vizinha de cima/baixo que TAMBÉM for uma linha
// de peça de verdade (classe 'module-piece-row') — nunca ultrapassa pro
// título da lista nem pras seções "Adicionar componente"/"Adicionar módulo"
// no fim do container.
function moveModulePieceRow(wrap, dir) {
  const sibling = dir === -1 ? wrap.previousElementSibling : wrap.nextElementSibling;
  if (!sibling || !sibling.classList.contains('module-piece-row')) return;
  if (dir === -1) {
    wrap.parentNode.insertBefore(wrap, sibling);
  } else {
    wrap.parentNode.insertBefore(sibling, wrap);
  }
  setSaveStatus('Alterações não salvas.', 'unsaved');
  computeModulePieces();
}

// Renderiza UM componente na lista de "Componentes deste módulo" — um
// cabeçalho sempre visível (caixinha + nome + qtd. override) e um painel de
// detalhes (fórmulas, deslocamento, opcionais...) que nasce SEMPRE recolhido
// (nunca abre sozinho, nem em componente já configurado nem em componente
// recém-adicionado) — o admin abre só quando realmente precisa mexer, pra
// não empilhar dezenas de blocos abertos ao mesmo tempo na tela. Um botão
// "Ver componente" leva direto pro cadastro dele na aba Componentes.
//   insertBeforeEl — se passado, a linha entra ANTES desse elemento em vez de
//     no fim do container (usado pra manter a seção "Adicionar componente"
//     sempre por último).
//   forceChecked — true quando a linha nasce de "Adicionar componente"
//     (ainda sem existingLink, mas já deve nascer marcada como usada).
//   suggestedName — nome sugerido (não obrigatório) já pré-preenchido no
//     campo de nome customizado; só vem do botão "+ Duplicar" (ex: "RIPA
//     RIPADO 2"), pra diferenciar instâncias repetidas do mesmo componente
//     sem o admin precisar digitar do zero — ele ainda pode apagar/editar.
function renderModuleComponentRow(c, existingLink, container, insertBeforeEl, forceChecked, suggestedName) {
  // rowId identifica esta INSTÂNCIA (esta linha de module_components), não o
  // componente — desde a migration 025 o mesmo componente pode ter várias
  // linhas (posições diferentes) no mesmo módulo, então a identidade pra
  // salvar/apagar tem que ser por linha, não por componente. Linha existente
  // reusa o id do banco; linha nova (Adicionar/Duplicar) ganha um uuid
  // gerado aqui mesmo, já pronto pro upsert (onConflict: 'id').
  const rowId = (existingLink && existingLink.id) || crypto.randomUUID();

  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';
  // Marcador usado pelas setas ▲▼ (moveModulePieceRow) e por collectPendingLinks
  // (sort_order) pra achar/reconhecer linhas de peça de verdade dentro do
  // container — distingue de outros elementos que também vivem lá (título,
  // seções "Adicionar componente"/"Adicionar módulo" no fim).
  wrap.className = 'module-piece-row';
  wrap.dataset.rowId = rowId;

  const header = document.createElement('div');
  header.className = 'row';
  header.style.alignItems = 'center';
  header.style.padding = '8px 10px';
  header.style.background = '#f7f5f2';
  header.style.border = '1px solid #e8e4de';
  header.style.borderRadius = '6px';

  const labelDiv = document.createElement('div');
  labelDiv.style.flex = '2';
  const label = document.createElement('label');
  label.style.display = 'flex';
  label.style.alignItems = 'center';
  label.style.gap = '6px';
  label.style.marginTop = '0';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.style.width = 'auto';
  checkbox.checked = forceChecked ? true : !!existingLink;
  label.appendChild(checkbox);
  const nameSpan = document.createElement('span');
  nameSpan.textContent = `${(existingLink && existingLink.reference_override) || suggestedName || c.reference} (padrão: ${c.quantity})`;
  label.appendChild(nameSpan);
  labelDiv.appendChild(label);

  // Quantidade override — o CAMPO em si nasce lá embaixo, no painel de
  // detalhes (ver qtyWrap), fora do cabeçalho sempre visível: raramente
  // usada, e ocupava espaço horizontal que faz falta pro nome do componente
  // quando o módulo tem muitas peças (pedido do usuário — cabeçalho mais
  // estreito, mais peças visíveis por vez sem precisar rolar tanto).
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.placeholder = 'qtd padrão';
  qtyInput.style.marginTop = '0';
  qtyInput.disabled = !checkbox.checked;
  if (existingLink && existingLink.quantity_override !== undefined && existingLink.quantity_override !== null) {
    qtyInput.value = existingLink.quantity_override;
  }

  // Setas ▲▼ pra reordenar — puro DOM (ver moveModulePieceRow); a ordem só
  // vira sort_order de verdade quando o admin clicar em "Salvar componentes
  // deste módulo" (collectPendingLinks lê a ordem final direto do DOM).
  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.className = 'secondary mc-row-btn mc-row-btn-arrow';
  moveUpBtn.style.flex = '0 0 auto';
  moveUpBtn.title = 'Mover pra cima';
  moveUpBtn.textContent = '▲';
  moveUpBtn.addEventListener('click', () => moveModulePieceRow(wrap, -1));

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.className = 'secondary mc-row-btn mc-row-btn-arrow';
  moveDownBtn.style.flex = '0 0 auto';
  moveDownBtn.title = 'Mover pra baixo';
  moveDownBtn.textContent = '▼';
  moveDownBtn.addEventListener('click', () => moveModulePieceRow(wrap, 1));

  // Botão que leva direto pro cadastro deste componente na aba Componentes
  // (biblioteca global) — sempre visível, independe de estar marcado ou não.
  const gotoBtn = document.createElement('button');
  gotoBtn.type = 'button';
  gotoBtn.className = 'secondary mc-row-btn';
  gotoBtn.style.flex = '0 0 auto';
  gotoBtn.textContent = 'Ver componente';
  gotoBtn.addEventListener('click', () => goToComponentInCatalog(c.id));

  // "Duplicar" — cria OUTRA instância deste MESMO componente neste módulo,
  // em posição diferente (migration 025: repetir o mesmo componente
  // várias vezes deixou de ser bloqueado). Pedido do usuário (2026-07-26:
  // "quando duplicar um componente quero que leve todas as configuracoes
  // originais pro novo componente duplicado") — a duplicata agora HERDA
  // tudo o que já estava configurado nesta linha (fórmulas, deslocamento,
  // visibilidade condicional, quantidade configurável, opcional, cor
  // configurável...), lido do estado ATUAL dos campos (buildLinkDataFromRef
  // — funciona mesmo se a linha original ainda não foi salva). Só id e
  // nome customizado NÃO são herdados: id vira um novo (senão colidiria com
  // a linha original ao salvar) e o nome cai pro numerado de sempre (senão
  // as duas instâncias apareceriam com o mesmo nome customizado).
  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'secondary mc-row-btn';
  dupBtn.style.flex = '0 0 auto';
  dupBtn.title = 'Adicionar outra instância deste componente, com a mesma configuração, em outra posição';
  dupBtn.textContent = '+ Duplicar';
  dupBtn.addEventListener('click', () => {
    // Sugere um nome numerado (ex: "RIPA RIPADO 2", "RIPA RIPADO 3"...)
    // contando quantas linhas já existem pra este MESMO componente entre as
    // renderizadas agora (salvas ou ainda não salvas) — 1-indexado a partir
    // da PRÓXIMA instância, já que a original (linha 1) continua sem número.
    const existingCount = moduleComponentFieldRefs.filter((ref) => ref.kind === 'component' && ref.componentId === c.id).length;
    const suggestedName = `${c.reference} ${existingCount + 1}`;
    const thisRef = moduleComponentFieldRefs.find((ref) => ref.rowId === rowId);
    const clonedLink = thisRef ? { ...buildLinkDataFromRef(thisRef, 0), id: null, reference_override: null } : null;
    renderModuleComponentRow(c, clonedLink, container, wrap.nextSibling, true, suggestedName);
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // "📋 Copiar" — pra colar em OUTRO módulo (pedido do usuário 2026-07-31,
  // "quero copiar um componente de um modulo e colar ele com as mesmas
  // configuracoes em outro modulo... quero copiar e colar mesmo, 2
  // cliques"): grava a configuração INTEIRA desta linha (mesmo
  // buildLinkDataFromRef do "+ Duplicar" acima — funciona mesmo se a linha
  // ainda não foi salva) no clipboard em memória (copiedModuleComponentLink,
  // sobrevive trocar de módulo). O botão "📋 Colar aqui" (fim da lista,
  // renderPasteComponentSection) faz a outra metade.
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary mc-row-btn';
  copyBtn.style.flex = '0 0 auto';
  copyBtn.title = 'Copiar esta peça (com toda a configuração) pra colar em outro módulo';
  copyBtn.textContent = '📋 Copiar';
  copyBtn.addEventListener('click', () => {
    const thisRef = moduleComponentFieldRefs.find((ref) => ref.rowId === rowId);
    if (!thisRef) return;
    const sourceModule = modulesCache.find((x) => x.id === selectedModuleId);
    copiedModuleComponentLink = {
      kind: 'component',
      catalogId: c.id,
      catalogLabel: c.reference,
      sourceModuleName: (sourceModule && sourceModule.name) || '?',
      link: buildLinkDataFromRef(thisRef, 0)
    };
    refreshPasteComponentButton();
  });

  // "🔁 Trocar" — troca QUAL componente de catálogo esta linha referencia,
  // mantendo tudo o mais já configurado NESTA linha (fórmulas override de
  // L/A/P, posição/deslocamento, visibilidade condicional, quantidade
  // override, opcional...) — mesmo espírito do "🔁 Trocar módulo" já
  // existente pra peça-módulo aninhada (ver renderModuleNestedRow), só que
  // pra componente de catálogo em vez de módulo.
  const swapBtn = document.createElement('button');
  swapBtn.type = 'button';
  swapBtn.className = 'secondary mc-row-btn';
  swapBtn.style.flex = '0 0 auto';
  swapBtn.title = 'Trocar o componente de catálogo usado nesta linha, mantendo fórmulas/posição/quantidade já configurados aqui';
  swapBtn.textContent = '🔁 Trocar';

  const swapWrap = document.createElement('div');
  swapWrap.className = 'row';
  swapWrap.style.padding = '8px 10px';
  swapWrap.style.background = '#fff';
  swapWrap.style.border = '1px solid #e8e4de';
  swapWrap.style.borderTop = 'none';
  swapWrap.style.gap = '8px';
  swapWrap.style.alignItems = 'center';
  swapWrap.style.display = 'none';

  const swapSelect = document.createElement('select');
  swapSelect.style.marginTop = '0';
  swapSelect.style.flex = '1';

  const swapConfirmBtn = document.createElement('button');
  swapConfirmBtn.type = 'button';
  swapConfirmBtn.className = 'secondary';
  swapConfirmBtn.style.flex = '0 0 auto';
  swapConfirmBtn.textContent = 'Confirmar troca';

  const swapCancelBtn = document.createElement('button');
  swapCancelBtn.type = 'button';
  swapCancelBtn.className = 'secondary';
  swapCancelBtn.style.flex = '0 0 auto';
  swapCancelBtn.textContent = 'Cancelar';

  swapWrap.appendChild(swapSelect);
  swapWrap.appendChild(swapConfirmBtn);
  swapWrap.appendChild(swapCancelBtn);

  swapBtn.addEventListener('click', () => {
    if (swapWrap.style.display !== 'none') { swapWrap.style.display = 'none'; return; }
    // Lista o catálogo INTEIRO, sem excluir componentes já usados em outras
    // linhas — mesma decisão do swap de módulo aninhado: migration 025
    // permite repetir o mesmo componente em 2+ linhas, então já usado em
    // outro lugar não é motivo pra tirar da lista aqui.
    swapWrap.style.display = 'flex';
    swapSelect.innerHTML = componentsCache.length > 0
      ? componentsCache.map((cc) => `<option value="${cc.id}" ${cc.id === c.id ? 'selected' : ''}>${cc.reference}</option>`).join('')
      : '<option value="">Nenhum componente disponível</option>';
  });

  swapCancelBtn.addEventListener('click', () => { swapWrap.style.display = 'none'; });

  swapConfirmBtn.addEventListener('click', () => {
    const newId = swapSelect.value;
    if (!newId || newId === c.id) { swapWrap.style.display = 'none'; return; }
    const newComponent = componentsCache.find((x) => x.id === newId);
    if (!newComponent) return;
    c = newComponent; // reatribui o parâmetro — gotoBtn/dupBtn e os placeholders abaixo fecham sobre esta variável, então já passam a enxergar o componente novo
    nameSpan.textContent = `${nameOverrideInput.value.trim() || c.reference} (padrão: ${c.quantity})`;
    nameOverrideInput.placeholder = c.reference;
    qtyLbl.textContent = `Quantidade override (padrão do catálogo: ${c.quantity})`;
    // Placeholders/labels de fórmula override — mostram o padrão do
    // componente NOVO (o valor digitado no override, se houver, continua
    // intocado; só o "padrão: ..." de referência muda).
    widthField.div.querySelector('label').textContent = `Fórmula largura override (padrão: ${c.width_formula})`;
    widthField.input.placeholder = c.width_formula;
    heightField.div.querySelector('label').textContent = `Fórmula altura override (padrão: ${c.height_formula})`;
    heightField.input.placeholder = c.height_formula;
    depthField.div.querySelector('label').textContent = `Fórmula profundidade override (padrão: ${c.depth_formula})`;
    depthField.input.placeholder = c.depth_formula;
    const ref = moduleComponentFieldRefs.find((r) => r.rowId === rowId);
    if (ref) ref.componentId = c.id;
    recomputeRenderedComponentIds();
    refreshAddComponentOptions();
    swapWrap.style.display = 'none';
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // Botão de recolher/expandir o painel de detalhes — só faz sentido (e só
  // aparece) quando o componente está marcado como usado. Nasce sempre
  // fechado ("▸ Configurar"), mesmo pra um componente já configurado antes.
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'secondary mc-row-btn';
  toggleBtn.style.flex = '0 0 auto';
  toggleBtn.style.display = checkbox.checked ? 'inline-block' : 'none';
  toggleBtn.textContent = '▸ Configurar';

  header.appendChild(labelDiv);
  header.appendChild(moveUpBtn);
  header.appendChild(moveDownBtn);
  header.appendChild(gotoBtn);
  header.appendChild(dupBtn);
  header.appendChild(copyBtn);
  header.appendChild(swapBtn);
  header.appendChild(toggleBtn);
  wrap.appendChild(header);
  wrap.appendChild(swapWrap);

  // Painel de detalhes — sempre nasce recolhido (o admin abre só quando
  // precisa mexer), mesmo quando o componente já está marcado como usado.
  const detailsDiv = document.createElement('div');
  detailsDiv.style.padding = '10px 10px 4px 10px';
  detailsDiv.style.border = '1px solid #e8e4de';
  detailsDiv.style.borderTop = 'none';
  detailsDiv.style.borderRadius = '0 0 6px 6px';
  detailsDiv.style.display = 'none';
  wrap.appendChild(detailsDiv);

  // Nome customizado desta instância (migration 032) — útil quando o mesmo
  // componente aparece 2+ vezes neste módulo (migration 025) e o admin
  // precisa diferenciar ("Ripa 1", "Ripa 2"...) na tela, no teste de cálculo
  // e no balão de duplo-clique do 3D. Vazio = usa o nome do catálogo, como
  // sempre — não afeta preço nem o cadastro global do componente.
  const nameOverrideWrap = document.createElement('div');
  nameOverrideWrap.style.marginTop = '0';
  const nameOverrideLbl = document.createElement('label');
  nameOverrideLbl.style.fontSize = '12px';
  nameOverrideLbl.style.marginTop = '0';
  nameOverrideLbl.textContent = 'Nome customizado desta instância (opcional — ex: "Ripa 1", "Ripa 2")';
  const nameOverrideInput = document.createElement('input');
  nameOverrideInput.type = 'text';
  nameOverrideInput.placeholder = c.reference;
  nameOverrideInput.style.marginTop = '2px';
  nameOverrideInput.disabled = !checkbox.checked;
  if (existingLink && existingLink.reference_override) nameOverrideInput.value = existingLink.reference_override;
  else if (suggestedName) nameOverrideInput.value = suggestedName;
  nameOverrideWrap.appendChild(nameOverrideLbl);
  nameOverrideWrap.appendChild(nameOverrideInput);
  detailsDiv.appendChild(nameOverrideWrap);

  nameOverrideInput.addEventListener('input', () => {
    nameSpan.textContent = `${nameOverrideInput.value.trim() || c.reference} (padrão: ${c.quantity})`;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // Quantidade override (ver qtyDiv/qtyInput criados lá em cima, junto do
  // cabeçalho — só o CAMPO nasceu aqui embaixo, no painel de detalhes, pra
  // não ocupar espaço no cabeçalho sempre visível).
  const qtyWrap = document.createElement('div');
  qtyWrap.style.marginTop = '10px';
  const qtyLbl = document.createElement('label');
  qtyLbl.style.fontSize = '12px';
  qtyLbl.style.marginTop = '0';
  qtyLbl.textContent = `Quantidade override (padrão do catálogo: ${c.quantity})`;
  qtyWrap.appendChild(qtyLbl);
  qtyWrap.appendChild(qtyInput);
  detailsDiv.appendChild(qtyWrap);

  // Fórmulas de L/A/P sobrescritas só pra este módulo — a mesma peça de
  // catálogo pode precisar de fórmula diferente dependendo do módulo pai
  // (ex: espessura de lateral diferente). Vazio = usa a fórmula padrão do
  // componente (mostrada no placeholder/label).
  const formulaRow = document.createElement('div');
  formulaRow.className = 'row';
  formulaRow.style.marginTop = '4px';

  function makeFormulaField(labelText, defaultFormula, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = `${labelText} (padrão: ${defaultFormula})`;
    const input = document.createElement('input');
    input.placeholder = defaultFormula;
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked;
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const widthField = makeFormulaField('Fórmula largura override', c.width_formula, existingLink && existingLink.width_formula_override);
  const heightField = makeFormulaField('Fórmula altura override', c.height_formula, existingLink && existingLink.height_formula_override);
  const depthField = makeFormulaField('Fórmula profundidade override', c.depth_formula, existingLink && existingLink.depth_formula_override);
  formulaRow.appendChild(widthField.div);
  formulaRow.appendChild(heightField.div);
  formulaRow.appendChild(depthField.div);
  detailsDiv.appendChild(formulaRow);

  // Posição/deslocamento — FÓRMULA (aceita W, H, D do módulo, igual as
  // fórmulas de L/A/P) só pro DESENHO 3D. Não afeta preço.
  // ZERO ABSOLUTO (a pedido do usuário) pras 7 posições ÚNICAS — lateral
  // esquerda/direita, topo, base, fundo, rodapé, tampo: esses 3 campos são a
  // posição FINAL e ABSOLUTA do canto chão-fundo-esquerda da peça, a partir
  // do canto chão-fundo-esquerda do módulo — sem nenhuma âncora automática
  // por trás. Ex: pra encostar uma peça "Lateral direita" na direita,
  // escreve "W-19" (W = largura do módulo, 19 = espessura da peça) no
  // Deslocar X; deixado em branco/0, a peça nasce encostada na ESQUERDA
  // (mesmo canto de qualquer peça única). Nas demais posições (prateleira,
  // porta, pé, gaveta, travamento) — que já têm distribuição automática
  // (várias prateleiras espaçadas, portas empilhadas, 4 pés nas quinas...) —
  // esses campos continuam sendo só um AJUSTE FINO em cima dessa
  // distribuição, como sempre foram.
  const offsetRow = document.createElement('div');
  offsetRow.className = 'row';
  offsetRow.style.marginTop = '4px';

  function makeOffsetField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.placeholder = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked;
    if (existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== '' && String(existingValue).trim() !== '0') {
      input.value = existingValue;
    }
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const offsetXField = makeOffsetField('Posição X (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça) — peça única: absoluta a partir da esquerda; senão: ajuste fino', existingLink && existingLink.offset_x_mm);
  const offsetYField = makeOffsetField('Posição Y (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça; RODAPE = altura do rodapé da casa do cliente, ex: "RODAPE" começa em cima do baseboard) — peça única: absoluta a partir do chão; senão: ajuste fino', existingLink && existingLink.offset_y_mm);
  const offsetZField = makeOffsetField('Posição Z (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça, ex "D-d" encosta na frente) — peça única: absoluta a partir do fundo; senão: ajuste fino', existingLink && existingLink.offset_z_mm);
  offsetRow.appendChild(offsetXField.div);
  offsetRow.appendChild(offsetYField.div);
  offsetRow.appendChild(offsetZField.div);
  detailsDiv.appendChild(offsetRow);

  // Visibilidade condicional (migration 031) — esta peça só existe quando a
  // dimensão ESCOLHIDA do MÓDULO (W/H/D, container — não a medida própria já
  // resolvida da peça) estiver dentro do intervalo mín/máx. Sem dimensão
  // escolhida, sempre visível (comportamento padrão, igual antes desta
  // feature existir). Min e/ou máx em branco = sem limite naquele lado (ex:
  // só "Largura >= 1000" = preenche só o mínimo).
  const visibilityWrap = document.createElement('div');
  visibilityWrap.style.marginTop = '10px';
  const visibilityLbl = document.createElement('label');
  visibilityLbl.style.fontSize = '12px';
  visibilityLbl.style.marginTop = '0';
  visibilityLbl.textContent = 'Condição de visibilidade (opcional)';
  visibilityWrap.appendChild(visibilityLbl);

  const visibilityRow = document.createElement('div');
  visibilityRow.className = 'row';
  visibilityRow.style.marginTop = '2px';

  const visibilityDimDiv = document.createElement('div');
  visibilityDimDiv.style.flex = '1';
  const visibilityDimSelect = document.createElement('select');
  visibilityDimSelect.style.marginTop = '0';
  visibilityDimSelect.disabled = !checkbox.checked;
  visibilityDimSelect.innerHTML = `
    <option value="">Sempre visível (sem condição)</option>
    <option value="W">Largura do módulo (W)</option>
    <option value="H">Altura do módulo (H)</option>
    <option value="D">Profundidade do módulo (D)</option>
  `;
  visibilityDimSelect.value = (existingLink && existingLink.visibility_dimension) || '';
  visibilityDimDiv.appendChild(visibilityDimSelect);

  const visibilityMinDiv = document.createElement('div');
  visibilityMinDiv.style.flex = '1';
  const visibilityMinInput = document.createElement('input');
  visibilityMinInput.type = 'number';
  visibilityMinInput.placeholder = 'Mínimo (mm)';
  visibilityMinInput.style.marginTop = '0';
  visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
  if (existingLink && existingLink.visibility_min_mm !== undefined && existingLink.visibility_min_mm !== null) {
    visibilityMinInput.value = existingLink.visibility_min_mm;
  }
  visibilityMinDiv.appendChild(visibilityMinInput);

  const visibilityMaxDiv = document.createElement('div');
  visibilityMaxDiv.style.flex = '1';
  const visibilityMaxInput = document.createElement('input');
  visibilityMaxInput.type = 'number';
  visibilityMaxInput.placeholder = 'Máximo (mm)';
  visibilityMaxInput.style.marginTop = '0';
  visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
  if (existingLink && existingLink.visibility_max_mm !== undefined && existingLink.visibility_max_mm !== null) {
    visibilityMaxInput.value = existingLink.visibility_max_mm;
  }
  visibilityMaxDiv.appendChild(visibilityMaxInput);

  visibilityRow.appendChild(visibilityDimDiv);
  visibilityRow.appendChild(visibilityMinDiv);
  visibilityRow.appendChild(visibilityMaxDiv);
  visibilityWrap.appendChild(visibilityRow);

  const visibilityHint = document.createElement('p');
  visibilityHint.className = 'hint';
  visibilityHint.textContent = 'Peça só aparece (preço + 3D) quando a dimensão escolhida do módulo estiver dentro do intervalo. Deixe "Sempre visível" pra nunca esconder (padrão).';
  visibilityWrap.appendChild(visibilityHint);
  detailsDiv.appendChild(visibilityWrap);

  visibilityDimSelect.addEventListener('change', () => {
    visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // "Cliente escolhe a quantidade" (ex: prateleiras) — específico deste
  // módulo usando este componente, não do componente em si (o mesmo
  // componente de catálogo pode ter um intervalo num módulo pequeno e
  // outro num módulo grande). Quando marcado, ignora a quantidade fixa
  // (qtyInput acima) — o cliente escolhe dentro de mín/padrão/máx.
  const qtyConfigWrap = document.createElement('div');
  qtyConfigWrap.style.marginTop = '6px';
  const qtyConfigLabel = document.createElement('label');
  qtyConfigLabel.style.display = 'flex';
  qtyConfigLabel.style.alignItems = 'center';
  qtyConfigLabel.style.gap = '6px';
  qtyConfigLabel.style.fontSize = '12px';
  qtyConfigLabel.style.marginTop = '0';
  const qtyConfigCheckbox = document.createElement('input');
  qtyConfigCheckbox.type = 'checkbox';
  qtyConfigCheckbox.style.width = 'auto';
  qtyConfigCheckbox.checked = !!(existingLink && existingLink.quantity_configurable);
  qtyConfigCheckbox.disabled = !checkbox.checked;
  qtyConfigLabel.appendChild(qtyConfigCheckbox);
  qtyConfigLabel.appendChild(document.createTextNode('Cliente escolhe a quantidade neste módulo (ex: prateleiras)'));
  qtyConfigWrap.appendChild(qtyConfigLabel);
  detailsDiv.appendChild(qtyConfigWrap);

  const qtyRangeRow = document.createElement('div');
  qtyRangeRow.className = 'row';
  qtyRangeRow.style.marginTop = '4px';
  qtyRangeRow.style.display = qtyConfigCheckbox.checked ? 'flex' : 'none';

  function makeQtyRangeField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked || !qtyConfigCheckbox.checked;
    if (existingValue !== undefined && existingValue !== null) input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const qtyMinField = makeQtyRangeField('Quantidade mínima', existingLink && existingLink.quantity_min);
  const qtyDefaultField = makeQtyRangeField('Quantidade padrão (cliente)', existingLink && existingLink.quantity_default);
  const qtyMaxField = makeQtyRangeField('Quantidade máxima', existingLink && existingLink.quantity_max);
  qtyRangeRow.appendChild(qtyMinField.div);
  qtyRangeRow.appendChild(qtyDefaultField.div);
  qtyRangeRow.appendChild(qtyMaxField.div);
  detailsDiv.appendChild(qtyRangeRow);

  // "Cliente pode adicionar/remover (opcional)" — ex: puxador, rodapé,
  // tampo, pé. Diferente de "cliente escolhe a quantidade" (que é sobre
  // QUANTAS peças), isso é sobre SE a peça entra ou não — o cliente vê
  // uma caixinha de marcar na calculadora, desmarcada por padrão, e pode
  // marcar vários opcionais diferentes ao mesmo tempo.
  const clientOptionalWrap = document.createElement('div');
  clientOptionalWrap.style.marginTop = '6px';
  const clientOptionalLabel = document.createElement('label');
  clientOptionalLabel.style.display = 'flex';
  clientOptionalLabel.style.alignItems = 'center';
  clientOptionalLabel.style.gap = '6px';
  clientOptionalLabel.style.fontSize = '12px';
  clientOptionalLabel.style.marginTop = '0';
  const clientOptionalCheckbox = document.createElement('input');
  clientOptionalCheckbox.type = 'checkbox';
  clientOptionalCheckbox.style.width = 'auto';
  clientOptionalCheckbox.checked = !!(existingLink && existingLink.client_optional);
  clientOptionalCheckbox.disabled = !checkbox.checked;
  clientOptionalLabel.appendChild(clientOptionalCheckbox);
  clientOptionalLabel.appendChild(document.createTextNode('Cliente pode adicionar/remover (opcional — ex: puxador, rodapé, tampo, pé)'));
  clientOptionalWrap.appendChild(clientOptionalLabel);
  detailsDiv.appendChild(clientOptionalWrap);

  // Só faz sentido quando o opcional acima está marcado: em vez da
  // caixinha nascer desmarcada (cliente precisa clicar pra incluir), ela
  // já nasce MARCADA — o componente já entra por padrão, mas o cliente
  // ainda pode desmarcar e tirar. Cobre o caso do pé/puxador/etc que
  // "quase sempre" é usado, mas ainda precisa poder ser removido.
  const defaultOnWrap = document.createElement('div');
  defaultOnWrap.style.marginTop = '4px';
  defaultOnWrap.style.marginLeft = '20px';
  const defaultOnLabel = document.createElement('label');
  defaultOnLabel.style.display = 'flex';
  defaultOnLabel.style.alignItems = 'center';
  defaultOnLabel.style.gap = '6px';
  defaultOnLabel.style.fontSize = '12px';
  defaultOnLabel.style.marginTop = '0';
  const defaultOnCheckbox = document.createElement('input');
  defaultOnCheckbox.type = 'checkbox';
  defaultOnCheckbox.style.width = 'auto';
  defaultOnCheckbox.checked = !!(existingLink && existingLink.client_optional_default_on);
  defaultOnCheckbox.disabled = !checkbox.checked || !clientOptionalCheckbox.checked;
  defaultOnLabel.appendChild(defaultOnCheckbox);
  defaultOnLabel.appendChild(document.createTextNode('Vem marcado por padrão (cliente ainda pode desmarcar e tirar)'));
  defaultOnWrap.appendChild(defaultOnLabel);
  detailsDiv.appendChild(defaultOnWrap);

  // "Cliente pode escolher a cor desta peça separadamente" (migration 046,
  // generalizado 2026-07-19 pra peça-FOLHA também — pedido do usuário: "pra
  // peca tambem, por que quero deixar por exemplo so uma shelf de cor
  // separada"). Até aqui só existia em peça-MÓDULO aninhada
  // (renderModuleNestedRow) — o motor de preço/3D (effectiveColorsForPiece
  // em pricing.js, resolvePiecesForViewer em portal.js) já mesclava
  // pieceColorOverrides por piece.id pra QUALQUER peça sem precisar de
  // mudança nenhuma; só faltava dar o mesmo botão aqui pra peça-componente
  // (ex: uma prateleira específica usando o mesmo papel "Caixa" das
  // laterais, mas o cliente quer ela numa cor diferente). Sem faixa
  // min/padrão/máx pra configurar (as cores já vêm de module_colors do
  // módulo pai) — só liga/desliga o painel extra no portal.
  const colorConfigWrap = document.createElement('div');
  colorConfigWrap.style.marginTop = '6px';
  const colorConfigLabel = document.createElement('label');
  colorConfigLabel.style.display = 'flex';
  colorConfigLabel.style.alignItems = 'center';
  colorConfigLabel.style.gap = '6px';
  colorConfigLabel.style.fontSize = '12px';
  colorConfigLabel.style.marginTop = '0';
  const colorConfigCheckbox = document.createElement('input');
  colorConfigCheckbox.type = 'checkbox';
  colorConfigCheckbox.style.width = 'auto';
  colorConfigCheckbox.checked = !!(existingLink && existingLink.client_color_configurable);
  colorConfigCheckbox.disabled = !checkbox.checked;
  colorConfigLabel.appendChild(colorConfigCheckbox);
  colorConfigLabel.appendChild(document.createTextNode('Cliente pode escolher a cor desta peça separadamente'));
  colorConfigWrap.appendChild(colorConfigLabel);
  detailsDiv.appendChild(colorConfigWrap);

  // Nada aqui grava no banco — só atualiza a prévia (teste de cálculo) e
  // marca "alterações não salvas". A gravação de verdade só acontece no
  // clique do botão "Salvar componentes deste módulo".
  function onAnyFieldChange() {
    qtyInput.disabled = !checkbox.checked;
    nameOverrideInput.disabled = !checkbox.checked;
    widthField.input.disabled = !checkbox.checked;
    heightField.input.disabled = !checkbox.checked;
    depthField.input.disabled = !checkbox.checked;
    offsetXField.input.disabled = !checkbox.checked;
    offsetYField.input.disabled = !checkbox.checked;
    offsetZField.input.disabled = !checkbox.checked;
    visibilityDimSelect.disabled = !checkbox.checked;
    visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    qtyConfigCheckbox.disabled = !checkbox.checked;
    qtyRangeRow.style.display = qtyConfigCheckbox.checked ? 'flex' : 'none';
    [qtyMinField.input, qtyDefaultField.input, qtyMaxField.input].forEach((input) => {
      input.disabled = !checkbox.checked || !qtyConfigCheckbox.checked;
    });
    clientOptionalCheckbox.disabled = !checkbox.checked;
    defaultOnCheckbox.disabled = !checkbox.checked || !clientOptionalCheckbox.checked;
    colorConfigCheckbox.disabled = !checkbox.checked;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  }

  // Marcar/desmarcar "usado neste módulo" só mostra/esconde o botão de
  // recolher — o painel continua sempre fechado ao marcar (o admin abre
  // manualmente se quiser mexer), e some por completo ao desmarcar (não tem
  // nada útil pra mostrar de um componente que não é usado).
  checkbox.addEventListener('change', () => {
    toggleBtn.style.display = checkbox.checked ? 'inline-block' : 'none';
    detailsDiv.style.display = 'none';
    toggleBtn.textContent = '▸ Configurar';
  });

  toggleBtn.addEventListener('click', () => {
    const isOpen = detailsDiv.style.display !== 'none';
    detailsDiv.style.display = isOpen ? 'none' : 'block';
    toggleBtn.textContent = isOpen ? '▸ Configurar' : '▾ Configurar';
  });

  checkbox.addEventListener('change', onAnyFieldChange);
  qtyInput.addEventListener('input', onAnyFieldChange);
  qtyConfigCheckbox.addEventListener('change', onAnyFieldChange);
  clientOptionalCheckbox.addEventListener('change', onAnyFieldChange);
  defaultOnCheckbox.addEventListener('change', onAnyFieldChange);
  colorConfigCheckbox.addEventListener('change', onAnyFieldChange);
  [widthField.input, heightField.input, depthField.input, offsetXField.input, offsetYField.input, offsetZField.input,
    qtyMinField.input, qtyDefaultField.input, qtyMaxField.input, visibilityMinInput, visibilityMaxInput].forEach((input) => {
    input.addEventListener('input', onAnyFieldChange);
  });

  moduleComponentFieldRefs.push({
    kind: 'component',
    rowId, componentId: c.id, checkbox, qtyInput, nameOverrideInput, widthField, heightField, depthField,
    offsetXField, offsetYField, offsetZField,
    visibilityDimSelect, visibilityMinInput, visibilityMaxInput,
    qtyConfigCheckbox, qtyMinField, qtyDefaultField, qtyMaxField,
    clientOptionalCheckbox, defaultOnCheckbox,
    colorConfigCheckbox
  });
  if (insertBeforeEl) container.insertBefore(wrap, insertBeforeEl);
  else container.appendChild(wrap);
}

// Renderiza UM MÓDULO na lista de "Componentes deste módulo" — mesma
// estrutura visual de renderModuleComponentRow (cabeçalho sempre visível +
// painel de detalhes recolhido), mas pra uma peça-módulo aninhada (migration
// 023): fórmulas de L/A/P são OBRIGATÓRIAS (o módulo aninhado não tem
// fórmula própria pra herdar) e existem campos extras que só fazem sentido
// aqui — posição, cor e tipo de abertura, já que component_types/hinge_side
// não existem pra um módulo. Um botão "Ver módulo" leva direto pra
// configuração do módulo filho na aba "Configurar módulo".
function renderModuleNestedRow(childModule, existingLink, container, insertBeforeEl, forceChecked, suggestedName) {
  // rowId identifica esta INSTÂNCIA (ver mesmo comentário em
  // renderModuleComponentRow) — desde a migration 025 o mesmo módulo
  // aninhado também pode ter várias linhas no mesmo módulo pai.
  const rowId = (existingLink && existingLink.id) || crypto.randomUUID();

  const wrap = document.createElement('div');
  wrap.style.marginTop = '10px';
  // Marcador usado pelas setas ▲▼ (moveModulePieceRow) e por collectPendingLinks
  // (sort_order) pra achar/reconhecer linhas de peça de verdade dentro do
  // container — distingue de outros elementos que também vivem lá (título,
  // seções "Adicionar componente"/"Adicionar módulo" no fim).
  wrap.className = 'module-piece-row';
  wrap.dataset.rowId = rowId;

  const header = document.createElement('div');
  header.className = 'row';
  header.style.alignItems = 'center';
  header.style.padding = '8px 10px';
  header.style.background = '#eef2f7';
  header.style.border = '1px solid #d7e0ea';
  header.style.borderRadius = '6px';

  const labelDiv = document.createElement('div');
  labelDiv.style.flex = '2';
  const label = document.createElement('label');
  label.style.display = 'flex';
  label.style.alignItems = 'center';
  label.style.gap = '6px';
  label.style.marginTop = '0';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.style.width = 'auto';
  checkbox.checked = forceChecked ? true : !!existingLink;
  label.appendChild(checkbox);
  const nameSpan = document.createElement('span');
  nameSpan.textContent = `📦 ${(existingLink && existingLink.reference_override) || suggestedName || childModule.name} (módulo aninhado)`;
  label.appendChild(nameSpan);
  labelDiv.appendChild(label);

  // Quantidade override — o CAMPO em si nasce lá embaixo, no painel de
  // detalhes (ver qtyWrap), fora do cabeçalho sempre visível (mesmo motivo
  // de renderModuleComponentRow — cabeçalho mais estreito/mais peças
  // visíveis por vez).
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '0';
  qtyInput.placeholder = 'qtd (padrão 1)';
  qtyInput.style.marginTop = '0';
  qtyInput.disabled = !checkbox.checked;
  if (existingLink && existingLink.quantity_override !== undefined && existingLink.quantity_override !== null) {
    qtyInput.value = existingLink.quantity_override;
  }

  // Setas ▲▼ pra reordenar — mesmo padrão da peça-componente (ver
  // moveModulePieceRow).
  const moveUpBtn = document.createElement('button');
  moveUpBtn.type = 'button';
  moveUpBtn.className = 'secondary mc-row-btn mc-row-btn-arrow';
  moveUpBtn.style.flex = '0 0 auto';
  moveUpBtn.title = 'Mover pra cima';
  moveUpBtn.textContent = '▲';
  moveUpBtn.addEventListener('click', () => moveModulePieceRow(wrap, -1));

  const moveDownBtn = document.createElement('button');
  moveDownBtn.type = 'button';
  moveDownBtn.className = 'secondary mc-row-btn mc-row-btn-arrow';
  moveDownBtn.style.flex = '0 0 auto';
  moveDownBtn.title = 'Mover pra baixo';
  moveDownBtn.textContent = '▼';
  moveDownBtn.addEventListener('click', () => moveModulePieceRow(wrap, 1));

  const gotoBtn = document.createElement('button');
  gotoBtn.type = 'button';
  gotoBtn.className = 'secondary mc-row-btn';
  gotoBtn.style.flex = '0 0 auto';
  gotoBtn.textContent = 'Ver módulo';
  gotoBtn.addEventListener('click', () => goToModuleConfig(childModule.id));

  // "Duplicar" — mesmo espírito do botão em renderModuleComponentRow: cria
  // outra instância deste MESMO módulo aninhado neste módulo pai, em posição
  // diferente (migration 025). Pedido do usuário (2026-07-26): a duplicata
  // herda tudo o que já estava configurado nesta linha (fórmulas de L/A/P,
  // posição, cor, abertura, deslocamento, visibilidade condicional,
  // quantidade, sub-configuração de medidas...), lido do estado ATUAL dos
  // campos (buildLinkDataFromRef) — só id (novo, senão colidiria ao salvar)
  // e nome customizado (cai pro numerado de sempre) não são herdados.
  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'secondary mc-row-btn';
  dupBtn.style.flex = '0 0 auto';
  dupBtn.title = 'Adicionar outra instância deste módulo aninhado, com a mesma configuração, em outra posição';
  dupBtn.textContent = '+ Duplicar';
  dupBtn.addEventListener('click', () => {
    // Mesmo espírito do "+ Duplicar" de renderModuleComponentRow — sugere um
    // nome numerado pra diferenciar as instâncias repetidas deste módulo.
    const existingCount = moduleComponentFieldRefs.filter((ref) => ref.kind === 'module' && ref.childModuleId === childModule.id).length;
    const suggestedName = `${childModule.name} ${existingCount + 1}`;
    const thisRef = moduleComponentFieldRefs.find((ref) => ref.rowId === rowId);
    const clonedLink = thisRef ? { ...buildLinkDataFromRef(thisRef, 0), id: null, reference_override: null } : null;
    renderModuleNestedRow(childModule, clonedLink, container, wrap.nextSibling, true, suggestedName);
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // "📋 Copiar" — pra colar em OUTRO módulo, mesmo mecanismo/pedido do
  // usuário do botão gêmeo em renderModuleComponentRow (ver comentário lá).
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'secondary mc-row-btn';
  copyBtn.style.flex = '0 0 auto';
  copyBtn.title = 'Copiar esta peça-módulo (com toda a configuração) pra colar em outro módulo';
  copyBtn.textContent = '📋 Copiar';
  copyBtn.addEventListener('click', () => {
    const thisRef = moduleComponentFieldRefs.find((ref) => ref.rowId === rowId);
    if (!thisRef) return;
    const sourceModule = modulesCache.find((x) => x.id === selectedModuleId);
    copiedModuleComponentLink = {
      kind: 'module',
      catalogId: childModule.id,
      catalogLabel: childModule.name,
      sourceModuleName: (sourceModule && sourceModule.name) || '?',
      link: buildLinkDataFromRef(thisRef, 0)
    };
    refreshPasteComponentButton();
  });

  // "🔁 Trocar módulo" — troca QUAL módulo aninhado esta linha referencia,
  // mantendo tudo o mais que já foi configurado NESTA linha (fórmulas de
  // L/A/P, posição, cor, abertura, deslocamento, visibilidade condicional,
  // quantidade...) — tudo isso vive no próprio module_components (o link),
  // não no módulo filho, então trocar o child_module_id não mexe em nada
  // disso. Pedido do usuário: reaproveitar o dimensionamento/posicionamento
  // já configurado ao trocar de peça, sem ter que recriar a linha do zero.
  const swapBtn = document.createElement('button');
  swapBtn.type = 'button';
  swapBtn.className = 'secondary mc-row-btn';
  swapBtn.style.flex = '0 0 auto';
  swapBtn.title = 'Trocar o módulo aninhado usado nesta linha, mantendo fórmulas/posição/cor/abertura já configurados aqui';
  swapBtn.textContent = '🔁 Trocar';

  const swapWrap = document.createElement('div');
  swapWrap.className = 'row';
  swapWrap.style.padding = '8px 10px';
  swapWrap.style.background = '#fff';
  swapWrap.style.border = '1px solid #d7e0ea';
  swapWrap.style.borderTop = 'none';
  swapWrap.style.gap = '8px';
  swapWrap.style.alignItems = 'center';
  swapWrap.style.display = 'none';

  const swapSelect = document.createElement('select');
  swapSelect.style.marginTop = '0';
  swapSelect.style.flex = '1';

  const swapConfirmBtn = document.createElement('button');
  swapConfirmBtn.type = 'button';
  swapConfirmBtn.className = 'secondary';
  swapConfirmBtn.style.flex = '0 0 auto';
  swapConfirmBtn.textContent = 'Confirmar troca';

  const swapCancelBtn = document.createElement('button');
  swapCancelBtn.type = 'button';
  swapCancelBtn.className = 'secondary';
  swapCancelBtn.style.flex = '0 0 auto';
  swapCancelBtn.textContent = 'Cancelar';

  swapWrap.appendChild(swapSelect);
  swapWrap.appendChild(swapConfirmBtn);
  swapWrap.appendChild(swapCancelBtn);

  swapBtn.addEventListener('click', async () => {
    if (swapWrap.style.display !== 'none') { swapWrap.style.display = 'none'; return; }
    swapSelect.innerHTML = '<option value="">Carregando...</option>';
    swapWrap.style.display = 'flex';
    // Mesma prevenção de ciclo usada em "Adicionar módulo" (getModuleDescendantIds)
    // — só exclui o módulo pai atual e quem formaria ciclo; o próprio módulo já
    // usado nesta linha continua na lista (caso o admin queira trocar e voltar).
    const candidates = modulesCache.filter((m) => m.id !== selectedModuleId);
    const allowed = [];
    for (const cand of candidates) {
      const descendants = await getModuleDescendantIds(cand.id);
      if (!descendants.has(selectedModuleId)) allowed.push(cand);
    }
    swapSelect.innerHTML = allowed.length > 0
      ? allowed.map((m) => `<option value="${m.id}" ${m.id === childModule.id ? 'selected' : ''}>${m.name}${m.is_invisible ? ' (invisível)' : ''}</option>`).join('')
      : '<option value="">Nenhum módulo disponível</option>';
  });

  swapCancelBtn.addEventListener('click', () => { swapWrap.style.display = 'none'; });

  swapConfirmBtn.addEventListener('click', () => {
    const newId = swapSelect.value;
    if (!newId || newId === childModule.id) { swapWrap.style.display = 'none'; return; }
    const m = modulesCache.find((x) => x.id === newId);
    if (!m) return;
    childModule = m; // reatribui o parâmetro — gotoBtn/dupBtn e o placeholder abaixo fecham sobre esta variável, então já passam a enxergar o novo módulo
    nameSpan.textContent = `📦 ${nameOverrideInput.value.trim() || childModule.name} (módulo aninhado)`;
    nameOverrideInput.placeholder = childModule.name;
    // Se "cliente pode configurar as medidas" já estiver ligado e os 9 campos
    // ainda em branco, sugere a faixa do módulo NOVO (mesma regra de quando o
    // checkbox é marcado pela primeira vez — ver prefillDimRangeFromChildModule).
    if (dimConfigCheckbox.checked) prefillDimRangeFromChildModule();
    const ref = moduleComponentFieldRefs.find((r) => r.rowId === rowId);
    if (ref) ref.childModuleId = m.id;
    recomputeRenderedModuleIds();
    refreshAddModuleOptions();
    swapWrap.style.display = 'none';
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'secondary mc-row-btn';
  toggleBtn.style.flex = '0 0 auto';
  toggleBtn.style.display = checkbox.checked ? 'inline-block' : 'none';
  toggleBtn.textContent = '▸ Configurar';

  header.appendChild(labelDiv);
  header.appendChild(moveUpBtn);
  header.appendChild(moveDownBtn);
  header.appendChild(gotoBtn);
  header.appendChild(dupBtn);
  header.appendChild(copyBtn);
  header.appendChild(swapBtn);
  header.appendChild(toggleBtn);
  wrap.appendChild(header);
  wrap.appendChild(swapWrap);

  const detailsDiv = document.createElement('div');
  detailsDiv.style.padding = '10px 10px 4px 10px';
  detailsDiv.style.border = '1px solid #d7e0ea';
  detailsDiv.style.borderTop = 'none';
  detailsDiv.style.borderRadius = '0 0 6px 6px';
  detailsDiv.style.display = 'none';
  wrap.appendChild(detailsDiv);

  // Nome customizado desta instância (migration 032) — mesmo campo/mesma
  // regra de uma peça-componente (ver renderModuleComponentRow): útil quando
  // o mesmo módulo aninhado se repete neste módulo pai.
  const nameOverrideWrap = document.createElement('div');
  nameOverrideWrap.style.marginTop = '0';
  const nameOverrideLbl = document.createElement('label');
  nameOverrideLbl.style.fontSize = '12px';
  nameOverrideLbl.style.marginTop = '0';
  nameOverrideLbl.textContent = 'Nome customizado desta instância (opcional)';
  const nameOverrideInput = document.createElement('input');
  nameOverrideInput.type = 'text';
  nameOverrideInput.placeholder = childModule.name;
  nameOverrideInput.style.marginTop = '2px';
  nameOverrideInput.disabled = !checkbox.checked;
  if (existingLink && existingLink.reference_override) nameOverrideInput.value = existingLink.reference_override;
  else if (suggestedName) nameOverrideInput.value = suggestedName;
  nameOverrideWrap.appendChild(nameOverrideLbl);
  nameOverrideWrap.appendChild(nameOverrideInput);
  detailsDiv.appendChild(nameOverrideWrap);

  nameOverrideInput.addEventListener('input', () => {
    nameSpan.textContent = `📦 ${nameOverrideInput.value.trim() || childModule.name} (módulo aninhado)`;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // Quantidade override (ver qtyInput criado lá em cima, junto do
  // cabeçalho — só o CAMPO nasceu aqui embaixo, no painel de detalhes, pra
  // não ocupar espaço no cabeçalho sempre visível).
  const qtyWrap = document.createElement('div');
  qtyWrap.style.marginTop = '10px';
  const qtyLbl = document.createElement('label');
  qtyLbl.style.fontSize = '12px';
  qtyLbl.style.marginTop = '0';
  qtyLbl.textContent = 'Quantidade override (padrão: 1)';
  qtyWrap.appendChild(qtyLbl);
  qtyWrap.appendChild(qtyInput);
  detailsDiv.appendChild(qtyWrap);

  // Fórmulas de L/A/P — OBRIGATÓRIAS aqui (diferente do "override" de uma
  // peça-componente): o módulo aninhado não tem fórmula própria de catálogo
  // pra herdar, então isso é a ÚNICA fonte de dimensão dele dentro deste
  // módulo pai. W/H/D nas fórmulas referem-se ao módulo PAI (mesmo espírito
  // de qualquer fórmula de componente).
  const formulaRow = document.createElement('div');
  formulaRow.className = 'row';
  formulaRow.style.marginTop = '4px';

  function makeRequiredFormulaField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = `${labelText} (obrigatório)`;
    const input = document.createElement('input');
    input.placeholder = 'ex: W-4';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked;
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const widthField = makeRequiredFormulaField('Fórmula largura', existingLink && existingLink.width_formula_override);
  const heightField = makeRequiredFormulaField('Fórmula altura', existingLink && existingLink.height_formula_override);
  const depthField = makeRequiredFormulaField('Fórmula profundidade', existingLink && existingLink.depth_formula_override);
  formulaRow.appendChild(widthField.div);
  formulaRow.appendChild(heightField.div);
  formulaRow.appendChild(depthField.div);
  detailsDiv.appendChild(formulaRow);

  // Posição / cor / abertura — só existem aqui (peça-módulo não tem
  // components.position_role/color_role/hinge_side pra herdar).
  const roleRow = document.createElement('div');
  roleRow.className = 'row';
  roleRow.style.marginTop = '4px';

  const positionDiv = document.createElement('div');
  positionDiv.style.flex = '1';
  const positionLbl = document.createElement('label');
  positionLbl.style.fontSize = '12px';
  positionLbl.style.marginTop = '0';
  positionLbl.textContent = 'Posição no módulo';
  const positionSelect = document.createElement('select');
  positionSelect.style.marginTop = '2px';
  positionSelect.disabled = !checkbox.checked;
  Object.keys(POSITION_ROLE_LABELS).forEach((role) => {
    const opt = document.createElement('option');
    opt.value = role;
    opt.textContent = POSITION_ROLE_LABELS[role];
    positionSelect.appendChild(opt);
  });
  positionSelect.value = (existingLink && existingLink.position_role) || 'other';
  positionDiv.appendChild(positionLbl);
  positionDiv.appendChild(positionSelect);

  const colorDiv = document.createElement('div');
  colorDiv.style.flex = '1';
  const colorLbl = document.createElement('label');
  colorLbl.style.fontSize = '12px';
  colorLbl.style.marginTop = '0';
  colorLbl.textContent = 'Cor';
  const colorSelect = document.createElement('select');
  colorSelect.style.marginTop = '2px';
  colorSelect.disabled = !checkbox.checked;
  // Papéis de cor (migration 035) — antes eram 2 <option> fixas (Caixa/Porta),
  // agora vem do catálogo color_roles (o admin pode ter criado mais).
  colorSelect.innerHTML = colorRolesCache.map((r) => `<option value="${r.id}">${r.name}</option>`).join('');
  colorSelect.value = (existingLink && existingLink.color_role_id) || (colorRolesCache[0] ? colorRolesCache[0].id : '');
  colorDiv.appendChild(colorLbl);
  colorDiv.appendChild(colorSelect);

  const openingDiv = document.createElement('div');
  openingDiv.style.flex = '1';
  const openingLbl = document.createElement('label');
  openingLbl.style.fontSize = '12px';
  openingLbl.style.marginTop = '0';
  openingLbl.textContent = 'Abertura';
  const openingSelect = document.createElement('select');
  openingSelect.style.marginTop = '2px';
  openingSelect.disabled = !checkbox.checked;
  openingSelect.innerHTML = `
    <option value="none">Não abre</option>
    <option value="hinge_left">Gira — dobradiça esquerda</option>
    <option value="hinge_right">Gira — dobradiça direita</option>
    <option value="slide_out">Desliza (corrediça)</option>
  `;
  openingSelect.value = (existingLink && existingLink.opening_type) || 'none';
  openingDiv.appendChild(openingLbl);
  openingDiv.appendChild(openingSelect);

  // Inclinação (migration 066) — mesmo campo/mesma regra da peça-componente
  // (migration 065), só que aqui pro CONJUNTO inteiro (este módulo aninhado
  // inteiro gira como um corpo rígido só, ver js/viewer3d.js resolveContent).
  // Funciona com qualquer Posição (positionSelect acima) — em "Prateleira"
  // mantém o pino/empilhamento automático; em "Peça livre" mantém o
  // Deslocar X/Y/Z manual (caso real do usuário: sapateira posicionada à
  // mão, não empilhada).
  const angleDiv = document.createElement('div');
  angleDiv.style.flex = '1';
  const angleLbl = document.createElement('label');
  angleLbl.style.fontSize = '12px';
  angleLbl.style.marginTop = '0';
  angleLbl.textContent = 'Inclinação (graus)';
  const angleInput = document.createElement('input');
  angleInput.type = 'number';
  angleInput.step = '1';
  angleInput.min = '-60';
  angleInput.max = '60';
  angleInput.style.marginTop = '2px';
  angleInput.disabled = !checkbox.checked;
  angleInput.value = (existingLink && existingLink.tilt_angle_deg) || 0;
  angleInput.title = 'Funciona com qualquer Posição (Prateleira mantém o pino automático; Peça livre mantém o Deslocar X/Y/Z). Positivo = frente mais baixa que o fundo (sapateira).';
  angleDiv.appendChild(angleLbl);
  angleDiv.appendChild(angleInput);

  // Giro de canto (migration 067) — pro CONJUNTO inteiro (este módulo
  // aninhado inteiro gira como corpo rígido, mesmo espírito da Inclinação
  // acima, eixo Y em vez de X). SÓ tem efeito de verdade com Posição =
  // "Peça livre" (troca largura<->profundidade na hora de posicionar — ver
  // js/viewer3d.js placePieceInBox); caso real: módulo em L/canto, o mesmo
  // módulo usado 2x, um deles girado 90° encostado no outro sem lateral.
  const rotYDiv = document.createElement('div');
  rotYDiv.style.flex = '1';
  const rotYLbl = document.createElement('label');
  rotYLbl.style.fontSize = '12px';
  rotYLbl.style.marginTop = '0';
  rotYLbl.textContent = 'Giro (canto)';
  const rotYSelect = document.createElement('select');
  rotYSelect.style.marginTop = '2px';
  rotYSelect.disabled = !checkbox.checked;
  rotYSelect.innerHTML = `
    <option value="0">0° (reto)</option>
    <option value="90">90°</option>
    <option value="180">180°</option>
    <option value="270">270°</option>
  `;
  rotYSelect.value = String((existingLink && existingLink.rotation_y_deg) || 0);
  rotYSelect.title = 'Só funciona de verdade com Posição = "Peça livre" (ex: módulo em L/canto). Troca largura por profundidade na posição, sem mudar como o módulo é construído.';
  rotYDiv.appendChild(rotYLbl);
  rotYDiv.appendChild(rotYSelect);

  roleRow.appendChild(positionDiv);
  roleRow.appendChild(colorDiv);
  roleRow.appendChild(openingDiv);
  roleRow.appendChild(angleDiv);
  roleRow.appendChild(rotYDiv);
  detailsDiv.appendChild(roleRow);

  // Corrediças por unidade — só relevante quando Abertura = "Desliza".
  const slidesDiv = document.createElement('div');
  slidesDiv.style.marginTop = '4px';
  slidesDiv.style.display = openingSelect.value === 'slide_out' ? 'block' : 'none';
  const slidesLbl = document.createElement('label');
  slidesLbl.style.fontSize = '12px';
  slidesLbl.style.marginTop = '0';
  slidesLbl.textContent = 'Corrediças por unidade';
  const slidesInput = document.createElement('input');
  slidesInput.type = 'number';
  slidesInput.min = '0';
  slidesInput.style.marginTop = '2px';
  slidesInput.disabled = !checkbox.checked;
  slidesInput.value = (existingLink && existingLink.slides_per_unit) || 2;
  slidesDiv.appendChild(slidesLbl);
  slidesDiv.appendChild(slidesInput);
  detailsDiv.appendChild(slidesDiv);

  openingSelect.addEventListener('change', () => {
    slidesDiv.style.display = openingSelect.value === 'slide_out' ? 'block' : 'none';
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // Deslocamento — mesmo campo/mesma regra de uma peça-componente.
  const offsetRow = document.createElement('div');
  offsetRow.className = 'row';
  offsetRow.style.marginTop = '4px';

  function makeOffsetField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.placeholder = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked;
    if (existingValue !== undefined && existingValue !== null && String(existingValue).trim() !== '' && String(existingValue).trim() !== '0') {
      input.value = existingValue;
    }
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const offsetXField = makeOffsetField('Posição X (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça) — peça única: absoluta a partir da esquerda; senão: ajuste fino', existingLink && existingLink.offset_x_mm);
  const offsetYField = makeOffsetField('Posição Y (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça; RODAPE = altura do rodapé da casa do cliente, ex: "RODAPE" começa em cima do baseboard) — peça única: absoluta a partir do chão; senão: ajuste fino', existingLink && existingLink.offset_y_mm);
  const offsetZField = makeOffsetField('Posição Z (fórmula W,H,D,w,h,d — minúsculo = medida da própria peça, ex "D-d" encosta na frente) — peça única: absoluta a partir do fundo; senão: ajuste fino', existingLink && existingLink.offset_z_mm);
  offsetRow.appendChild(offsetXField.div);
  offsetRow.appendChild(offsetYField.div);
  offsetRow.appendChild(offsetZField.div);
  detailsDiv.appendChild(offsetRow);

  // Visibilidade condicional (migration 031) — mesmo campo/mesma regra de
  // uma peça-componente (ver renderModuleComponentRow): esta peça-módulo só
  // existe quando a dimensão escolhida do módulo PAI estiver dentro do
  // intervalo mín/máx. Sem dimensão escolhida, sempre visível.
  const visibilityWrap = document.createElement('div');
  visibilityWrap.style.marginTop = '10px';
  const visibilityLbl = document.createElement('label');
  visibilityLbl.style.fontSize = '12px';
  visibilityLbl.style.marginTop = '0';
  visibilityLbl.textContent = 'Condição de visibilidade (opcional)';
  visibilityWrap.appendChild(visibilityLbl);

  const visibilityRow = document.createElement('div');
  visibilityRow.className = 'row';
  visibilityRow.style.marginTop = '2px';

  const visibilityDimDiv = document.createElement('div');
  visibilityDimDiv.style.flex = '1';
  const visibilityDimSelect = document.createElement('select');
  visibilityDimSelect.style.marginTop = '0';
  visibilityDimSelect.disabled = !checkbox.checked;
  visibilityDimSelect.innerHTML = `
    <option value="">Sempre visível (sem condição)</option>
    <option value="W">Largura do módulo (W)</option>
    <option value="H">Altura do módulo (H)</option>
    <option value="D">Profundidade do módulo (D)</option>
  `;
  visibilityDimSelect.value = (existingLink && existingLink.visibility_dimension) || '';
  visibilityDimDiv.appendChild(visibilityDimSelect);

  const visibilityMinDiv = document.createElement('div');
  visibilityMinDiv.style.flex = '1';
  const visibilityMinInput = document.createElement('input');
  visibilityMinInput.type = 'number';
  visibilityMinInput.placeholder = 'Mínimo (mm)';
  visibilityMinInput.style.marginTop = '0';
  visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
  if (existingLink && existingLink.visibility_min_mm !== undefined && existingLink.visibility_min_mm !== null) {
    visibilityMinInput.value = existingLink.visibility_min_mm;
  }
  visibilityMinDiv.appendChild(visibilityMinInput);

  const visibilityMaxDiv = document.createElement('div');
  visibilityMaxDiv.style.flex = '1';
  const visibilityMaxInput = document.createElement('input');
  visibilityMaxInput.type = 'number';
  visibilityMaxInput.placeholder = 'Máximo (mm)';
  visibilityMaxInput.style.marginTop = '0';
  visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
  if (existingLink && existingLink.visibility_max_mm !== undefined && existingLink.visibility_max_mm !== null) {
    visibilityMaxInput.value = existingLink.visibility_max_mm;
  }
  visibilityMaxDiv.appendChild(visibilityMaxInput);

  visibilityRow.appendChild(visibilityDimDiv);
  visibilityRow.appendChild(visibilityMinDiv);
  visibilityRow.appendChild(visibilityMaxDiv);
  visibilityWrap.appendChild(visibilityRow);

  const visibilityHint = document.createElement('p');
  visibilityHint.className = 'hint';
  visibilityHint.textContent = 'Peça só aparece (preço + 3D) quando a dimensão escolhida do módulo estiver dentro do intervalo. Deixe "Sempre visível" pra nunca esconder (padrão).';
  visibilityWrap.appendChild(visibilityHint);
  detailsDiv.appendChild(visibilityWrap);

  visibilityDimSelect.addEventListener('change', () => {
    visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  });

  // "Cliente escolhe a quantidade" e "Cliente pode adicionar/remover" — mesmo
  // padrão/mesmo significado de uma peça-componente.
  const qtyConfigWrap = document.createElement('div');
  qtyConfigWrap.style.marginTop = '6px';
  const qtyConfigLabel = document.createElement('label');
  qtyConfigLabel.style.display = 'flex';
  qtyConfigLabel.style.alignItems = 'center';
  qtyConfigLabel.style.gap = '6px';
  qtyConfigLabel.style.fontSize = '12px';
  qtyConfigLabel.style.marginTop = '0';
  const qtyConfigCheckbox = document.createElement('input');
  qtyConfigCheckbox.type = 'checkbox';
  qtyConfigCheckbox.style.width = 'auto';
  qtyConfigCheckbox.checked = !!(existingLink && existingLink.quantity_configurable);
  qtyConfigCheckbox.disabled = !checkbox.checked;
  qtyConfigLabel.appendChild(qtyConfigCheckbox);
  qtyConfigLabel.appendChild(document.createTextNode('Cliente escolhe a quantidade neste módulo'));
  qtyConfigWrap.appendChild(qtyConfigLabel);
  detailsDiv.appendChild(qtyConfigWrap);

  const qtyRangeRow = document.createElement('div');
  qtyRangeRow.className = 'row';
  qtyRangeRow.style.marginTop = '4px';
  qtyRangeRow.style.display = qtyConfigCheckbox.checked ? 'flex' : 'none';

  function makeQtyRangeField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked || !qtyConfigCheckbox.checked;
    if (existingValue !== undefined && existingValue !== null) input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const qtyMinField = makeQtyRangeField('Quantidade mínima', existingLink && existingLink.quantity_min);
  const qtyDefaultField = makeQtyRangeField('Quantidade padrão (cliente)', existingLink && existingLink.quantity_default);
  const qtyMaxField = makeQtyRangeField('Quantidade máxima', existingLink && existingLink.quantity_max);
  qtyRangeRow.appendChild(qtyMinField.div);
  qtyRangeRow.appendChild(qtyDefaultField.div);
  qtyRangeRow.appendChild(qtyMaxField.div);
  detailsDiv.appendChild(qtyRangeRow);

  // "Cliente pode configurar as medidas desta peça" (migration 036) — pedido
  // do usuário: um módulo composto de peças-módulo aninhadas (ex: "Painel" =
  // "Painel Ripado" + "Bench Hall 1") só deixava o cliente mexer no W/H/D do
  // módulo PAI; a peça aninhada só media o que a fórmula desta linha
  // calculava a partir disso, sem controle nenhum do cliente sobre ELA. Com
  // isso ligado, o cliente ganha (Passo 2 do portal) um bloco "▸ Configurar
  // <peça>" com sliders PRÓPRIOS de L/A/P só pra esta peça — mesmo padrão de
  // dado do W/H/D do módulo (min/padrão/máx em mm), escopado a este vínculo.
  // Quando ligado, o valor do cliente SUBSTITUI o resultado da fórmula desta
  // peça (mesma regra de "Cliente escolhe a quantidade" acima — o override
  // sempre vale, não é "só se o cliente mexer"), mas a fórmula continua
  // obrigatória no cadastro (usada quando esta opção está DESLIGADA).
  const dimConfigWrap = document.createElement('div');
  dimConfigWrap.style.marginTop = '6px';
  const dimConfigLabel = document.createElement('label');
  dimConfigLabel.style.display = 'flex';
  dimConfigLabel.style.alignItems = 'center';
  dimConfigLabel.style.gap = '6px';
  dimConfigLabel.style.fontSize = '12px';
  dimConfigLabel.style.marginTop = '0';
  const dimConfigCheckbox = document.createElement('input');
  dimConfigCheckbox.type = 'checkbox';
  dimConfigCheckbox.style.width = 'auto';
  dimConfigCheckbox.checked = !!(existingLink && existingLink.client_dimension_configurable);
  dimConfigCheckbox.disabled = !checkbox.checked;
  dimConfigLabel.appendChild(dimConfigCheckbox);
  dimConfigLabel.appendChild(document.createTextNode('Cliente pode configurar as medidas desta peça (sub-configuração)'));
  dimConfigWrap.appendChild(dimConfigLabel);
  detailsDiv.appendChild(dimConfigWrap);

  const dimRangeRow = document.createElement('div');
  dimRangeRow.className = 'row';
  dimRangeRow.style.marginTop = '4px';
  dimRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';

  function makeDimRangeField(labelText, existingValue) {
    const div = document.createElement('div');
    div.style.flex = '1';
    const lbl = document.createElement('label');
    lbl.style.fontSize = '12px';
    lbl.style.marginTop = '0';
    lbl.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.style.marginTop = '2px';
    input.disabled = !checkbox.checked || !dimConfigCheckbox.checked;
    if (existingValue !== undefined && existingValue !== null) input.value = existingValue;
    div.appendChild(lbl);
    div.appendChild(input);
    return { div, input };
  }

  const dimWidthMinField = makeDimRangeField('Largura mínima (mm)', existingLink && existingLink.width_min_mm);
  const dimWidthDefaultField = makeDimRangeField('Largura padrão (mm)', existingLink && existingLink.width_default_mm);
  const dimWidthMaxField = makeDimRangeField('Largura máxima (mm)', existingLink && existingLink.width_max_mm);
  dimRangeRow.appendChild(dimWidthMinField.div);
  dimRangeRow.appendChild(dimWidthDefaultField.div);
  dimRangeRow.appendChild(dimWidthMaxField.div);
  detailsDiv.appendChild(dimRangeRow);

  const dimHeightRangeRow = document.createElement('div');
  dimHeightRangeRow.className = 'row';
  dimHeightRangeRow.style.marginTop = '4px';
  dimHeightRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
  const dimHeightMinField = makeDimRangeField('Altura mínima (mm)', existingLink && existingLink.height_min_mm);
  const dimHeightDefaultField = makeDimRangeField('Altura padrão (mm)', existingLink && existingLink.height_default_mm);
  const dimHeightMaxField = makeDimRangeField('Altura máxima (mm)', existingLink && existingLink.height_max_mm);
  dimHeightRangeRow.appendChild(dimHeightMinField.div);
  dimHeightRangeRow.appendChild(dimHeightDefaultField.div);
  dimHeightRangeRow.appendChild(dimHeightMaxField.div);
  detailsDiv.appendChild(dimHeightRangeRow);

  const dimDepthRangeRow = document.createElement('div');
  dimDepthRangeRow.className = 'row';
  dimDepthRangeRow.style.marginTop = '4px';
  dimDepthRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
  const dimDepthMinField = makeDimRangeField('Profundidade mínima (mm)', existingLink && existingLink.depth_min_mm);
  const dimDepthDefaultField = makeDimRangeField('Profundidade padrão (mm)', existingLink && existingLink.depth_default_mm);
  const dimDepthMaxField = makeDimRangeField('Profundidade máxima (mm)', existingLink && existingLink.depth_max_mm);
  dimDepthRangeRow.appendChild(dimDepthMinField.div);
  dimDepthRangeRow.appendChild(dimDepthDefaultField.div);
  dimDepthRangeRow.appendChild(dimDepthMaxField.div);
  detailsDiv.appendChild(dimDepthRangeRow);

  const dimConfigHint = document.createElement('p');
  dimConfigHint.className = 'hint';
  dimConfigHint.textContent = 'Ligado, o cliente vê um bloco "▸ Configurar" só desta peça no Passo 2, com sliders de L/A/P dentro desta faixa. Por padrão a peça continua acompanhando a fórmula acima (ou seja, o módulo pai) — só quando o cliente mexe manualmente num desses sliders é que aquele eixo específico vira fixo (o cliente pode voltar ao automático a qualquer momento). Em branco, sugere automaticamente a Largura/Altura/Profundidade mín/padrão/máx já cadastradas no módulo "' + (childModule.name || '') + '" (editar aqui não muda o cadastro original do módulo, só esta linha).';
  detailsDiv.appendChild(dimConfigHint);

  // Sugere automaticamente as 9 faixas (min/padrão/máx x L/A/P) a partir do
  // PRÓPRIO cadastro do módulo filho (childModule.width_min_mm etc., os
  // mesmos campos que aparecem quando esse módulo é configurado DIRETO,
  // fora de qualquer composição) — só quando os 9 campos ainda estão em
  // branco, pra nunca sobrescrever um valor que o admin já customizou aqui.
  // É só um PONTO DE PARTIDA: gravado em module_components (este vínculo),
  // nunca em modules (o cadastro do módulo filho) — editar aqui não altera
  // o módulo "${childModule.name}" original nem nenhum outro lugar que o
  // reaproveite.
  function prefillDimRangeFromChildModule() {
    const allFields = [dimWidthMinField, dimWidthDefaultField, dimWidthMaxField,
      dimHeightMinField, dimHeightDefaultField, dimHeightMaxField,
      dimDepthMinField, dimDepthDefaultField, dimDepthMaxField];
    const allEmpty = allFields.every((f) => f.input.value === '');
    if (!allEmpty) return;
    if (childModule.width_min_mm !== undefined && childModule.width_min_mm !== null) dimWidthMinField.input.value = childModule.width_min_mm;
    if (childModule.width_default_mm !== undefined && childModule.width_default_mm !== null) dimWidthDefaultField.input.value = childModule.width_default_mm;
    if (childModule.width_max_mm !== undefined && childModule.width_max_mm !== null) dimWidthMaxField.input.value = childModule.width_max_mm;
    if (childModule.height_min_mm !== undefined && childModule.height_min_mm !== null) dimHeightMinField.input.value = childModule.height_min_mm;
    if (childModule.height_default_mm !== undefined && childModule.height_default_mm !== null) dimHeightDefaultField.input.value = childModule.height_default_mm;
    if (childModule.height_max_mm !== undefined && childModule.height_max_mm !== null) dimHeightMaxField.input.value = childModule.height_max_mm;
    if (childModule.depth_min_mm !== undefined && childModule.depth_min_mm !== null) dimDepthMinField.input.value = childModule.depth_min_mm;
    if (childModule.depth_default_mm !== undefined && childModule.depth_default_mm !== null) dimDepthDefaultField.input.value = childModule.depth_default_mm;
    if (childModule.depth_max_mm !== undefined && childModule.depth_max_mm !== null) dimDepthMaxField.input.value = childModule.depth_max_mm;
  }

  dimConfigCheckbox.addEventListener('change', () => {
    if (dimConfigCheckbox.checked) prefillDimRangeFromChildModule();
  });

  // "Cliente pode escolher a cor desta peça separadamente" (migration 046) —
  // pedido do usuário: um módulo pai com 2+ peças-módulo aninhadas usando o
  // MESMO papel de cor (ex: duas caixas internas, ambas papel "Caixa") só
  // deixava trocar a cor das duas JUNTAS (um colorsByRole só pra árvore
  // inteira, ver renderColorRoleSwatchGroups no portal). Ligado aqui, o
  // cliente ganha (Passo 2 do portal) um bloco de swatches PRÓPRIO só pra
  // esta instância — a escolha ali substitui, só pra ela e tudo dentro dela,
  // o valor que viria do módulo pai (ver effectiveColorsForPiece em
  // pricing.js). Sem faixa min/padrão/máx pra configurar aqui (diferente do
  // bloco de medida acima) — as CORES disponíveis já vêm de module_colors do
  // módulo pai, isto só liga/desliga o controle extra no portal.
  const colorConfigWrap = document.createElement('div');
  colorConfigWrap.style.marginTop = '6px';
  const colorConfigLabel = document.createElement('label');
  colorConfigLabel.style.display = 'flex';
  colorConfigLabel.style.alignItems = 'center';
  colorConfigLabel.style.gap = '6px';
  colorConfigLabel.style.fontSize = '12px';
  colorConfigLabel.style.marginTop = '0';
  const colorConfigCheckbox = document.createElement('input');
  colorConfigCheckbox.type = 'checkbox';
  colorConfigCheckbox.style.width = 'auto';
  colorConfigCheckbox.checked = !!(existingLink && existingLink.client_color_configurable);
  colorConfigCheckbox.disabled = !checkbox.checked;
  colorConfigLabel.appendChild(colorConfigCheckbox);
  colorConfigLabel.appendChild(document.createTextNode('Cliente pode escolher a cor desta peça separadamente'));
  colorConfigWrap.appendChild(colorConfigLabel);
  detailsDiv.appendChild(colorConfigWrap);

  const clientOptionalWrap = document.createElement('div');
  clientOptionalWrap.style.marginTop = '6px';
  const clientOptionalLabel = document.createElement('label');
  clientOptionalLabel.style.display = 'flex';
  clientOptionalLabel.style.alignItems = 'center';
  clientOptionalLabel.style.gap = '6px';
  clientOptionalLabel.style.fontSize = '12px';
  clientOptionalLabel.style.marginTop = '0';
  const clientOptionalCheckbox = document.createElement('input');
  clientOptionalCheckbox.type = 'checkbox';
  clientOptionalCheckbox.style.width = 'auto';
  clientOptionalCheckbox.checked = !!(existingLink && existingLink.client_optional);
  clientOptionalCheckbox.disabled = !checkbox.checked;
  clientOptionalLabel.appendChild(clientOptionalCheckbox);
  clientOptionalLabel.appendChild(document.createTextNode('Cliente pode adicionar/remover (opcional)'));
  clientOptionalWrap.appendChild(clientOptionalLabel);
  detailsDiv.appendChild(clientOptionalWrap);

  const defaultOnWrap = document.createElement('div');
  defaultOnWrap.style.marginTop = '4px';
  defaultOnWrap.style.marginLeft = '20px';
  const defaultOnLabel = document.createElement('label');
  defaultOnLabel.style.display = 'flex';
  defaultOnLabel.style.alignItems = 'center';
  defaultOnLabel.style.gap = '6px';
  defaultOnLabel.style.fontSize = '12px';
  defaultOnLabel.style.marginTop = '0';
  const defaultOnCheckbox = document.createElement('input');
  defaultOnCheckbox.type = 'checkbox';
  defaultOnCheckbox.style.width = 'auto';
  defaultOnCheckbox.checked = !!(existingLink && existingLink.client_optional_default_on);
  defaultOnCheckbox.disabled = !checkbox.checked || !clientOptionalCheckbox.checked;
  defaultOnLabel.appendChild(defaultOnCheckbox);
  defaultOnLabel.appendChild(document.createTextNode('Vem marcado por padrão (cliente ainda pode desmarcar e tirar)'));
  defaultOnWrap.appendChild(defaultOnLabel);
  detailsDiv.appendChild(defaultOnWrap);

  function onAnyFieldChange() {
    qtyInput.disabled = !checkbox.checked;
    nameOverrideInput.disabled = !checkbox.checked;
    widthField.input.disabled = !checkbox.checked;
    heightField.input.disabled = !checkbox.checked;
    depthField.input.disabled = !checkbox.checked;
    positionSelect.disabled = !checkbox.checked;
    colorSelect.disabled = !checkbox.checked;
    openingSelect.disabled = !checkbox.checked;
    slidesInput.disabled = !checkbox.checked;
    offsetXField.input.disabled = !checkbox.checked;
    offsetYField.input.disabled = !checkbox.checked;
    offsetZField.input.disabled = !checkbox.checked;
    visibilityDimSelect.disabled = !checkbox.checked;
    visibilityMinInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    visibilityMaxInput.disabled = !checkbox.checked || !visibilityDimSelect.value;
    qtyConfigCheckbox.disabled = !checkbox.checked;
    qtyRangeRow.style.display = qtyConfigCheckbox.checked ? 'flex' : 'none';
    [qtyMinField.input, qtyDefaultField.input, qtyMaxField.input].forEach((input) => {
      input.disabled = !checkbox.checked || !qtyConfigCheckbox.checked;
    });
    clientOptionalCheckbox.disabled = !checkbox.checked;
    defaultOnCheckbox.disabled = !checkbox.checked || !clientOptionalCheckbox.checked;
    dimConfigCheckbox.disabled = !checkbox.checked;
    dimRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
    dimHeightRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
    dimDepthRangeRow.style.display = dimConfigCheckbox.checked ? 'flex' : 'none';
    [dimWidthMinField.input, dimWidthDefaultField.input, dimWidthMaxField.input,
      dimHeightMinField.input, dimHeightDefaultField.input, dimHeightMaxField.input,
      dimDepthMinField.input, dimDepthDefaultField.input, dimDepthMaxField.input].forEach((input) => {
      input.disabled = !checkbox.checked || !dimConfigCheckbox.checked;
    });
    colorConfigCheckbox.disabled = !checkbox.checked;
    setSaveStatus('Alterações não salvas.', 'unsaved');
    computeModulePieces();
  }

  checkbox.addEventListener('change', () => {
    toggleBtn.style.display = checkbox.checked ? 'inline-block' : 'none';
    detailsDiv.style.display = 'none';
    toggleBtn.textContent = '▸ Configurar';
  });

  toggleBtn.addEventListener('click', () => {
    const isOpen = detailsDiv.style.display !== 'none';
    detailsDiv.style.display = isOpen ? 'none' : 'block';
    toggleBtn.textContent = isOpen ? '▸ Configurar' : '▾ Configurar';
  });

  checkbox.addEventListener('change', onAnyFieldChange);
  qtyInput.addEventListener('input', onAnyFieldChange);
  positionSelect.addEventListener('change', onAnyFieldChange);
  colorSelect.addEventListener('change', onAnyFieldChange);
  rotYSelect.addEventListener('change', onAnyFieldChange);
  slidesInput.addEventListener('input', onAnyFieldChange);
  qtyConfigCheckbox.addEventListener('change', onAnyFieldChange);
  clientOptionalCheckbox.addEventListener('change', onAnyFieldChange);
  defaultOnCheckbox.addEventListener('change', onAnyFieldChange);
  dimConfigCheckbox.addEventListener('change', onAnyFieldChange);
  colorConfigCheckbox.addEventListener('change', onAnyFieldChange);
  [widthField.input, heightField.input, depthField.input, offsetXField.input, offsetYField.input, offsetZField.input,
    qtyMinField.input, qtyDefaultField.input, qtyMaxField.input, visibilityMinInput, visibilityMaxInput,
    dimWidthMinField.input, dimWidthDefaultField.input, dimWidthMaxField.input,
    dimHeightMinField.input, dimHeightDefaultField.input, dimHeightMaxField.input,
    dimDepthMinField.input, dimDepthDefaultField.input, dimDepthMaxField.input, angleInput].forEach((input) => {
    input.addEventListener('input', onAnyFieldChange);
  });

  moduleComponentFieldRefs.push({
    kind: 'module',
    rowId, childModuleId: childModule.id, checkbox, qtyInput, nameOverrideInput, widthField, heightField, depthField,
    positionSelect, colorSelect, openingSelect, slidesInput, angleInput, rotYSelect,
    offsetXField, offsetYField, offsetZField,
    visibilityDimSelect, visibilityMinInput, visibilityMaxInput,
    qtyConfigCheckbox, qtyMinField, qtyDefaultField, qtyMaxField,
    clientOptionalCheckbox, defaultOnCheckbox,
    dimConfigCheckbox, dimWidthMinField, dimWidthDefaultField, dimWidthMaxField,
    dimHeightMinField, dimHeightDefaultField, dimHeightMaxField,
    dimDepthMinField, dimDepthDefaultField, dimDepthMaxField,
    colorConfigCheckbox
  });
  if (insertBeforeEl) container.insertBefore(wrap, insertBeforeEl);
  else container.appendChild(wrap);
}

// Lê o estado ATUAL dos controles na tela (marcado/desmarcado, quantidade,
// overrides de fórmula) — inclusive o que ainda não foi salvo — no mesmo
// formato de "link" que vem do banco, pra usar tanto na prévia quanto no
// salvamento.
// Lê o estado ATUAL dos campos de UMA linha (ref, ver moduleComponentFieldRefs)
// e monta um objeto no mesmo formato de uma linha de `module_components` —
// extraído de collectPendingLinks (mesma lógica campo-a-campo de sempre,
// agora reaproveitada em 2 lugares) pra também servir o botão "+ Duplicar"
// (pedido do usuário 2026-07-26: "quando duplicar um componente quero que
// leve todas as configuracoes originais pro novo componente duplicado") —
// lendo do DOM em vez de moduleComponentLinks (o snapshot do banco), a
// duplicata reflete até edição ainda NÃO salva na linha original.
function buildLinkDataFromRef(ref, sortOrder) {
  const quantityConfigurable = ref.qtyConfigCheckbox.checked;
  const base = {
    // id = identidade da PRÓPRIA LINHA (não do componente/módulo) — ver
    // renderModuleComponentRow/renderModuleNestedRow. Permite salvar via
    // upsert(onConflict:'id') e permite 2+ linhas com o mesmo
    // component_id/child_module_id (migration 025).
    id: ref.rowId,
    sort_order: sortOrder,
    component_id: ref.kind === 'component' ? ref.componentId : null,
    child_module_id: ref.kind === 'module' ? ref.childModuleId : null,
    // Nome customizado desta instância (migration 032) — vazio = null =
    // usa o nome do catálogo/módulo, como sempre.
    reference_override: ref.nameOverrideInput.value.trim() === '' ? null : ref.nameOverrideInput.value.trim(),
    quantity_override: ref.qtyInput.value === '' ? null : parseInt(ref.qtyInput.value, 10),
    width_formula_override: ref.widthField.input.value.trim() === '' ? null : ref.widthField.input.value.trim(),
    height_formula_override: ref.heightField.input.value.trim() === '' ? null : ref.heightField.input.value.trim(),
    depth_formula_override: ref.depthField.input.value.trim() === '' ? null : ref.depthField.input.value.trim(),
    // Deslocamento é uma FÓRMULA (aceita W, H, D) — vazio = "0".
    offset_x_mm: ref.offsetXField.input.value.trim() === '' ? '0' : ref.offsetXField.input.value.trim(),
    offset_y_mm: ref.offsetYField.input.value.trim() === '' ? '0' : ref.offsetYField.input.value.trim(),
    offset_z_mm: ref.offsetZField.input.value.trim() === '' ? '0' : ref.offsetZField.input.value.trim(),
    // Visibilidade condicional (migration 031) — sem dimensão escolhida,
    // grava tudo null (sempre visível). Com dimensão escolhida, min/max
    // em branco viram null individualmente (sem limite naquele lado).
    visibility_dimension: ref.visibilityDimSelect.value || null,
    visibility_min_mm: ref.visibilityDimSelect.value && ref.visibilityMinInput.value !== ''
      ? parseFloat(ref.visibilityMinInput.value) : null,
    visibility_max_mm: ref.visibilityDimSelect.value && ref.visibilityMaxInput.value !== ''
      ? parseFloat(ref.visibilityMaxInput.value) : null,
    // "Cliente escolhe a quantidade" — só faz sentido (e só é gravado)
    // neste vínculo módulo x peça, não no componente/módulo global.
    quantity_configurable: quantityConfigurable,
    quantity_min: quantityConfigurable && ref.qtyMinField.input.value !== '' ? parseInt(ref.qtyMinField.input.value, 10) : null,
    quantity_default: quantityConfigurable && ref.qtyDefaultField.input.value !== '' ? parseInt(ref.qtyDefaultField.input.value, 10) : null,
    quantity_max: quantityConfigurable && ref.qtyMaxField.input.value !== '' ? parseInt(ref.qtyMaxField.input.value, 10) : null,
    // "Cliente pode adicionar/remover" (opcional) — ex: puxador, rodapé,
    // tampo, pé. Também só faz sentido por vínculo módulo x peça.
    client_optional: ref.clientOptionalCheckbox.checked,
    // Só grava true se "opcional" também estiver marcado — evita salvar
    // um "vem marcado por padrão" órfão (sem efeito nenhum) se o admin
    // desmarcar o opcional depois de já ter marcado este.
    client_optional_default_on: ref.clientOptionalCheckbox.checked && ref.defaultOnCheckbox.checked
  };
  // position_role/color_role_id/opening_type/slides_per_unit só existem
  // (e só são gravados) numa peça-módulo — peça-componente herda tudo
  // isso de components/component_types, então grava null aqui pra não
  // confundir com um valor que na verdade veio de outro lugar.
  if (ref.kind === 'module') {
    // Sub-configuração de medidas (migration 036) — só existe (e só é
    // gravada) numa peça-módulo, mesmo raciocínio de position_role/cor/
    // abertura logo acima. Campos min/padrão/máx em branco viram null
    // individualmente quando a opção está desligada, igual ao padrão já
    // usado em quantity_min/default/max.
    const dimConfigurable = ref.dimConfigCheckbox.checked;
    return {
      ...base,
      position_role: ref.positionSelect.value || 'other',
      color_role_id: ref.colorSelect.value || (colorRolesCache[0] ? colorRolesCache[0].id : null),
      opening_type: ref.openingSelect.value || 'none',
      slides_per_unit: ref.openingSelect.value === 'slide_out' ? (parseInt(ref.slidesInput.value, 10) || 0) : 0,
      // Inclinação do CONJUNTO (migration 066) — só peça-módulo tem esse
      // campo (peça-componente usa components.tilt_angle_deg, migration 065).
      tilt_angle_deg: parseFloat(ref.angleInput.value) || 0,
      // Giro de canto (migration 067) — mesmo raciocínio de tilt_angle_deg
      // acima, só peça-módulo tem esse campo por vínculo.
      rotation_y_deg: parseInt(ref.rotYSelect.value, 10) || 0,
      client_dimension_configurable: dimConfigurable,
      width_min_mm: dimConfigurable && ref.dimWidthMinField.input.value !== '' ? parseFloat(ref.dimWidthMinField.input.value) : null,
      width_default_mm: dimConfigurable && ref.dimWidthDefaultField.input.value !== '' ? parseFloat(ref.dimWidthDefaultField.input.value) : null,
      width_max_mm: dimConfigurable && ref.dimWidthMaxField.input.value !== '' ? parseFloat(ref.dimWidthMaxField.input.value) : null,
      height_min_mm: dimConfigurable && ref.dimHeightMinField.input.value !== '' ? parseFloat(ref.dimHeightMinField.input.value) : null,
      height_default_mm: dimConfigurable && ref.dimHeightDefaultField.input.value !== '' ? parseFloat(ref.dimHeightDefaultField.input.value) : null,
      height_max_mm: dimConfigurable && ref.dimHeightMaxField.input.value !== '' ? parseFloat(ref.dimHeightMaxField.input.value) : null,
      depth_min_mm: dimConfigurable && ref.dimDepthMinField.input.value !== '' ? parseFloat(ref.dimDepthMinField.input.value) : null,
      depth_default_mm: dimConfigurable && ref.dimDepthDefaultField.input.value !== '' ? parseFloat(ref.dimDepthDefaultField.input.value) : null,
      depth_max_mm: dimConfigurable && ref.dimDepthMaxField.input.value !== '' ? parseFloat(ref.dimDepthMaxField.input.value) : null,
      // "Cliente pode escolher a cor desta peça separadamente" (migration
      // 046) — só existe (e só é gravado) numa peça-módulo, mesmo
      // raciocínio de client_dimension_configurable acima.
      client_color_configurable: ref.colorConfigCheckbox.checked
    };
  }
  return {
    ...base, position_role: null, color_role_id: null, opening_type: 'none', slides_per_unit: 0, tilt_angle_deg: null, rotation_y_deg: 0,
    client_dimension_configurable: false,
    width_min_mm: null, width_default_mm: null, width_max_mm: null,
    height_min_mm: null, height_default_mm: null, height_max_mm: null,
    depth_min_mm: null, depth_default_mm: null, depth_max_mm: null,
    // "Cliente pode escolher a cor desta peça separadamente" (migration
    // 046, generalizado pra peça-folha 2026-07-19) — aqui SIM existe pra
    // peça-componente (diferente de client_dimension_configurable acima,
    // que continua só pra peça-módulo).
    client_color_configurable: ref.colorConfigCheckbox.checked
  };
}

function collectPendingLinks() {
  // Ordem de exibição (setas ▲▼, ver moveModulePieceRow) — lida direto do
  // DOM (wrap.dataset.rowId, na ordem visual atual dos '.module-piece-row')
  // em vez de qualquer array em memória, já que mover uma linha só mexe no
  // DOM. Linhas fora do container (não deveria acontecer) ficam com
  // sort_order 0 — não quebra nada, só não fica na posição "certa".
  const listContainer = document.getElementById('module-components-list');
  const sortOrderByRowId = new Map();
  if (listContainer) {
    Array.from(listContainer.children)
      .filter((el) => el.classList && el.classList.contains('module-piece-row'))
      .forEach((el, index) => sortOrderByRowId.set(el.dataset.rowId, index));
  }

  return moduleComponentFieldRefs
    .filter((ref) => ref.checkbox.checked)
    .map((ref) => buildLinkDataFromRef(ref, sortOrderByRowId.has(ref.rowId) ? sortOrderByRowId.get(ref.rowId) : 0));
}

function setSaveStatus(text, kind) {
  const el = document.getElementById('module-components-save-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = kind === 'unsaved' ? '#b45309' : (kind === 'error' ? '#b91c1c' : (kind === 'saved' ? '#15803d' : ''));
}

document.getElementById('module-components-save-btn').addEventListener('click', async () => {
  if (!selectedModuleId) return;
  setSaveStatus('Salvando...', '');

  const pending = collectPendingLinks();

  // Migration 025: o mesmo componente/módulo pode ter várias LINHAS no mesmo
  // módulo (posições diferentes) — a identidade de cada linha é o próprio
  // "id" (não mais component_id/child_module_id, que deixaram de ser únicos).
  // Uma linha some do banco quando seu id não aparece mais no que está
  // marcado na tela agora (checkbox desmarcado ou linha removida).
  const pendingIds = new Set(pending.map((p) => p.id));
  const toDeleteIds = moduleComponentLinks
    .filter((l) => !pendingIds.has(l.id))
    .map((l) => l.id);

  // Valida as fórmulas de deslocamento (aceitam W, H, D) antes de gravar,
  // usando as medidas padrão do módulo como teste — mesmo espírito da
  // validação de fórmula no cadastro de componente.
  const module = modulesCache.find((m) => m.id === selectedModuleId);
  const testDims = {
    W: (module && module.width_default_mm) || 800,
    H: (module && module.height_default_mm) || 2000,
    D: (module && module.depth_default_mm) || 560
  };
  for (const p of pending) {
    const label = p.component_id
      ? ((componentsCache.find((x) => x.id === p.component_id) || {}).reference || p.component_id)
      : ((modulesCache.find((x) => x.id === p.child_module_id) || {}).name || p.child_module_id);
    // Peça-módulo exige fórmula de L/A/P preenchida (não é "override" de
    // nada — é a única fonte de dimensão dela, ver comentário na migration
    // 023 e em renderModuleNestedRow).
    if (p.child_module_id && (!p.width_formula_override || !p.height_formula_override || !p.depth_formula_override)) {
      setSaveStatus(`Preencha as 3 fórmulas (largura/altura/profundidade) do módulo aninhado "${label}" — são obrigatórias.`, 'error');
      return;
    }
    try {
      // Deslocamento também aceita w/h/d minúsculo (dimensão RESOLVIDA da
      // PRÓPRIA peça — mesma convenção de area_m2_formula/edge_band_linear_m_
      // formula), pra fórmulas tipo "D-d" (encosta na frente do vão, ver
      // client.js/portal.js resolvePiecesForViewer). Pra peça-módulo, calcula
      // o teste de w/h/d a partir das PRÓPRIAS fórmulas de L/A/P dela (o que
      // já valida essas 3 fórmulas também, substituindo as chamadas
      // separadas que existiam aqui antes). Pra peça-componente (sem L/A/P
      // próprias cadastradas neste vínculo), usa W/H/D do módulo como valor
      // de teste — só precisa ser um número válido pra fórmula não quebrar
      // por "variável desconhecida", não precisa ser a medida real.
      let testPieceW = testDims.W, testPieceH = testDims.H, testPieceD = testDims.D;
      if (p.child_module_id) {
        // Só faz sentido validar aqui porque, pra peça-módulo, essas
        // fórmulas são obrigatórias e sempre estão preenchidas neste ponto.
        testPieceW = Pricing.evalFormula(p.width_formula_override, testDims);
        testPieceH = Pricing.evalFormula(p.height_formula_override, testDims);
        testPieceD = Pricing.evalFormula(p.depth_formula_override, testDims);
      }
      // N/COUNT (2026-07-15) — mesmas variáveis novas de resolvePiecesForViewer
      // (deslocamento por cópia, quantidade configurável); aqui é só validação
      // de fórmula antes de salvar, então usa valores de teste quaisquer
      // (N=1, COUNT=1) só pra "N"/"COUNT" não estourar "variável desconhecida".
      const offsetTestVars = { ...testDims, w: testPieceW, h: testPieceH, d: testPieceD, N: 1, COUNT: 1 };
      Pricing.evalFormula(p.offset_x_mm, offsetTestVars);
      Pricing.evalFormula(p.offset_y_mm, offsetTestVars);
      Pricing.evalFormula(p.offset_z_mm, offsetTestVars);
    } catch (err) {
      setSaveStatus(`Fórmula inválida em "${label}": ${err.message}`, 'error');
      return;
    }
  }

  // Se "cliente escolhe a quantidade" estiver marcado neste módulo, exige um
  // intervalo válido (mín ≤ padrão ≤ máx) — mesma validação que existia
  // antes no cadastro global do componente, agora por vínculo módulo x peça.
  for (const p of pending) {
    if (!p.quantity_configurable) continue;
    const label = p.component_id
      ? ((componentsCache.find((x) => x.id === p.component_id) || {}).reference || p.component_id)
      : ((modulesCache.find((x) => x.id === p.child_module_id) || {}).name || p.child_module_id);
    if ([p.quantity_min, p.quantity_default, p.quantity_max].some((v) => v === null || isNaN(v))) {
      setSaveStatus(`Preencha quantidade mínima, padrão e máxima em "${label}" (marcado como "cliente escolhe a quantidade").`, 'error');
      return;
    }
    if (!(p.quantity_min <= p.quantity_default && p.quantity_default <= p.quantity_max)) {
      setSaveStatus(`O intervalo de quantidade de "${label}" precisa respeitar mínima ≤ padrão ≤ máxima.`, 'error');
      return;
    }
  }

  // Mesma validação acima, agora pra "cliente pode configurar as medidas
  // desta peça" (migration 036) — só existe em peça-módulo, um intervalo
  // válido por eixo (L, A e P, cada um mín ≤ padrão ≤ máx).
  for (const p of pending) {
    if (!p.client_dimension_configurable) continue;
    const label = (modulesCache.find((x) => x.id === p.child_module_id) || {}).name || p.child_module_id;
    const axes = [
      ['Largura', p.width_min_mm, p.width_default_mm, p.width_max_mm],
      ['Altura', p.height_min_mm, p.height_default_mm, p.height_max_mm],
      ['Profundidade', p.depth_min_mm, p.depth_default_mm, p.depth_max_mm]
    ];
    for (const [axisLabel, min, def, max] of axes) {
      if ([min, def, max].some((v) => v === null || isNaN(v))) {
        setSaveStatus(`Preencha ${axisLabel.toLowerCase()} mínima, padrão e máxima em "${label}" (marcado como "cliente pode configurar as medidas").`, 'error');
        return;
      }
      if (!(min <= def && def <= max)) {
        setSaveStatus(`O intervalo de ${axisLabel.toLowerCase()} de "${label}" precisa respeitar mínima ≤ padrão ≤ máxima.`, 'error');
        return;
      }
    }
  }

  try {
    if (toDeleteIds.length > 0) {
      const { error } = await supabaseClient.from('module_components').delete()
        .eq('module_id', selectedModuleId).in('id', toDeleteIds);
      if (error) throw error;
    }
    // Upsert único por "id" (a PK de cada linha) — migration 025 removeu as
    // unique constraints de module_id+component_id/child_module_id que
    // antes exigiam um upsert separado por tipo de peça; agora um só
    // onConflict:'id' cobre componente e módulo aninhado ao mesmo tempo,
    // inclusive quando há 2+ linhas repetindo o mesmo componente/módulo.
    if (pending.length > 0) {
      const { error } = await supabaseClient.from('module_components').upsert(
        pending.map((p) => ({ module_id: selectedModuleId, ...p })),
        { onConflict: 'id' }
      );
      if (error) throw error;
    }
    await renderModuleComponentsList(); // recarrega do banco -> essa vira a nova linha de base
    setSaveStatus('Salvo.', 'saved');
  } catch (err) {
    setSaveStatus('Erro ao salvar: ' + (err.message || err), 'error');
  }
});

// Carrega recursivamente as peças de um módulo (e seus módulos aninhados,
// em qualquer profundidade) DIRETO DO BANCO — usado só pra resolver as
// peças de um módulo aninhado (child_module_id), já que a composição do
// módulo FILHO é editada em outra hora (quando ele mesmo é selecionado
// aqui), não na tela do módulo PAI que está sendo editado agora. Devolve o
// formato de "peça" que Pricing.calculateAssembly espera (ver pricing.js:
// leaf comum, ou is_module=true com child_pieces).
async function loadRecursivePieces(moduleId) {
  const { data: links, error } = await supabaseClient
    .from('module_components')
    .select('id, component_id, child_module_id, quantity_override, width_formula_override, height_formula_override, depth_formula_override, quantity_configurable, quantity_min, quantity_max, quantity_default, client_optional, client_optional_default_on, position_role, color_role_id, opening_type, slides_per_unit, visibility_dimension, visibility_min_mm, visibility_max_mm, reference_override, tilt_angle_deg, rotation_y_deg, usinagem_m, recortes, components(*, labor_types(*), component_types(*))')
    .eq('module_id', moduleId);
  if (error) { console.error(error); return []; }

  const pieces = [];
  for (const link of (links || [])) {
    if (link.component_id) {
      const component = link.components;
      if (!component || !component.active) continue;
      const quantity = (link.quantity_override !== null && link.quantity_override !== undefined) ? link.quantity_override : component.quantity;
      const labor_cost_per_unit = component.labor_types ? component.labor_types.price_per_unit : 0;
      const color_role_id = component.component_types ? component.component_types.color_role_id : null;
      pieces.push({
        ...component,
        // id vira o da LINHA (module_components.id), não o do catálogo —
        // migration 025 permite repetir o mesmo componente em 2+ linhas do
        // mesmo módulo; se piece.id ficasse com o id do catálogo, as duas
        // instâncias colidiriam em qualquer lógica keyed por id (shelfQuantities,
        // caixinha de opcional marcada) mesmo sendo posições diferentes.
        id: link.id,
        // Nome customizado desta instância (migration 032) — ver mesmo
        // comentário em loadRecursivePiecesForModule.
        reference: link.reference_override || component.reference,
        quantity, labor_cost_per_unit, color_role_id,
        width_formula: link.width_formula_override || component.width_formula,
        height_formula: link.height_formula_override || component.height_formula,
        depth_formula: link.depth_formula_override || component.depth_formula,
        quantity_configurable: !!link.quantity_configurable,
        quantity_min: link.quantity_min, quantity_max: link.quantity_max, quantity_default: link.quantity_default,
        client_optional: !!link.client_optional,
        visibility_dimension: link.visibility_dimension || null,
        visibility_min_mm: link.visibility_min_mm,
        visibility_max_mm: link.visibility_max_mm,
        is_module: false
      });
    } else if (link.child_module_id) {
      const childModule = modulesCache.find((m) => m.id === link.child_module_id);
      const fixedDepths = await fetchModuleFixedDepths(link.child_module_id);
      const childPieces = await loadRecursivePieces(link.child_module_id);
      pieces.push({
        id: link.id,
        reference: link.reference_override || (childModule ? childModule.name : 'Módulo removido'),
        module_name: childModule ? childModule.name : 'Módulo removido',
        is_module: true,
        position_role: link.position_role || 'other',
        color_role_id: link.color_role_id || null,
        opening_type: link.opening_type || 'none',
        slides_per_unit: link.slides_per_unit || 0,
        tilt_angle_deg: link.tilt_angle_deg || 0, // migration 066 — inclinação do conjunto (só 'shelf')
        rotation_y_deg: link.rotation_y_deg || 0, // migration 067 — giro de canto do conjunto (só 'free')
        width_formula: link.width_formula_override,
        height_formula: link.height_formula_override,
        depth_formula: link.depth_formula_override,
        quantity: (link.quantity_override !== null && link.quantity_override !== undefined) ? link.quantity_override : 1,
        quantity_configurable: !!link.quantity_configurable,
        quantity_min: link.quantity_min, quantity_max: link.quantity_max, quantity_default: link.quantity_default,
        client_optional: !!link.client_optional,
        visibility_dimension: link.visibility_dimension || null,
        visibility_min_mm: link.visibility_min_mm,
        visibility_max_mm: link.visibility_max_mm,
        fixed_depths: fixedDepths,
        child_pieces: childPieces
      });
    }
  }
  return pieces;
}

// Resolve as peças marcadas na tela (mesmo o que ainda não foi salvo) numa
// lista de "peças efetivas" no formato que o motor de cálculo espera —
// componentes viram peça-folha (igual sempre foi); módulos aninhados viram
// peça is_module=true com child_pieces resolvidas RECURSIVAMENTE a partir do
// que já está salvo no banco pro módulo filho (ver loadRecursivePieces).
// Assíncrona porque resolver um módulo aninhado exige buscar no banco — usada
// só pra prévia (teste de cálculo), não depende de nada estar salvo no NÍVEL
// atual (module_id = selectedModuleId).
async function computeModulePieces() {
  const pending = collectPendingLinks();
  const resolved = [];
  for (const link of pending) {
    if (link.component_id) {
      const component = componentsCache.find((c) => c.id === link.component_id);
      if (!component) continue;
      const quantity = (link.quantity_override !== null && link.quantity_override !== undefined)
        ? link.quantity_override
        : component.quantity;
      const labor_cost_per_unit = component.labor_types ? component.labor_types.price_per_unit : 0;
      // Papel de cor vem do tipo do componente (migration 035), não mais de
      // um campo manual por componente.
      const color_role_id = component.component_types ? component.component_types.color_role_id : null;
      // Fórmula de L/A/P: usa o override deste módulo se existir, senão a
      // fórmula padrão do componente.
      const width_formula = link.width_formula_override || component.width_formula;
      const height_formula = link.height_formula_override || component.height_formula;
      const depth_formula = link.depth_formula_override || component.depth_formula;
      resolved.push({
        ...component,
        // id = id da LINHA (link.id), não do catálogo — ver mesmo comentário
        // em loadRecursivePieces (migration 025: instâncias repetidas do
        // mesmo componente não podem colidir em shelfQuantities/opcionais).
        id: link.id,
        // Nome customizado desta instância (migration 032).
        reference: link.reference_override || component.reference,
        quantity, labor_cost_per_unit, color_role_id, width_formula, height_formula, depth_formula,
        quantity_configurable: !!link.quantity_configurable,
        quantity_min: link.quantity_min,
        quantity_max: link.quantity_max,
        quantity_default: link.quantity_default,
        client_optional: !!link.client_optional,
        visibility_dimension: link.visibility_dimension || null,
        visibility_min_mm: link.visibility_min_mm,
        visibility_max_mm: link.visibility_max_mm,
        is_module: false
      });
    } else if (link.child_module_id) {
      const childModule = modulesCache.find((m) => m.id === link.child_module_id);
      const fixedDepths = await fetchModuleFixedDepths(link.child_module_id);
      const childPieces = await loadRecursivePieces(link.child_module_id);
      resolved.push({
        id: link.id,
        reference: link.reference_override || (childModule ? childModule.name : 'Módulo removido'),
        module_name: childModule ? childModule.name : 'Módulo removido',
        is_module: true,
        position_role: link.position_role || 'other',
        color_role_id: link.color_role_id || null,
        opening_type: link.opening_type || 'none',
        slides_per_unit: link.slides_per_unit || 0,
        tilt_angle_deg: link.tilt_angle_deg || 0, // migration 066 — inclinação do conjunto (só 'shelf')
        rotation_y_deg: link.rotation_y_deg || 0, // migration 067 — giro de canto do conjunto (só 'free')
        width_formula: link.width_formula_override,
        height_formula: link.height_formula_override,
        depth_formula: link.depth_formula_override,
        quantity: (link.quantity_override !== null && link.quantity_override !== undefined) ? link.quantity_override : 1,
        quantity_configurable: !!link.quantity_configurable,
        quantity_min: link.quantity_min,
        quantity_max: link.quantity_max,
        quantity_default: link.quantity_default,
        client_optional: !!link.client_optional,
        visibility_dimension: link.visibility_dimension || null,
        visibility_min_mm: link.visibility_min_mm,
        visibility_max_mm: link.visibility_max_mm,
        fixed_depths: fixedDepths,
        child_pieces: childPieces
      });
    }
  }
  modulePieces = resolved;

  renderTestCalcShelfInputs();
  renderTestCalcOptionalInputs();
  runTestCalculation();
}

// ---------- VÍNCULO MÓDULO x CORES ----------

// Papéis de cor que as peças de um módulo REALMENTE usam, recursivo (inclui
// peças dentro de peças-módulo aninhadas) — mesma ideia de
// collectUsedColorRoleIds em portal.js/client.js, só que consultando o
// banco direto (o admin não tem a árvore de peças já resolvida na tela de
// Cores) em vez de reaproveitar um array de peças já carregado.
async function collectUsedColorRoleIdsForModule(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_components')
    .select('child_module_id, color_role_id, components(component_types(color_role_id))')
    .eq('module_id', moduleId);
  if (error) { showError('module-colors-error', error); return new Set(); }
  const ids = new Set();
  for (const row of (data || [])) {
    if (row.child_module_id) {
      if (row.color_role_id) ids.add(row.color_role_id);
      const childIds = await collectUsedColorRoleIdsForModule(row.child_module_id);
      childIds.forEach((id) => ids.add(id));
    } else if (row.components && row.components.component_types && row.components.component_types.color_role_id) {
      ids.add(row.components.component_types.color_role_id);
    }
  }
  return ids;
}

async function renderModuleColorLinks() {
  const container = document.getElementById('module-colors-list');
  if (!selectedModuleId) { container.innerHTML = ''; return; }

  // Migration 035: module_colors agora tem color_role_id — cada papel de
  // cor tem sua PRÓPRIA lista de cores permitidas pra este módulo (antes
  // era uma lista só, valendo pra caixa E porta ao mesmo tempo).
  const [{ data: links, error }, usedRoleIds] = await Promise.all([
    supabaseClient.from('module_colors').select('color_id, color_role_id').eq('module_id', selectedModuleId),
    collectUsedColorRoleIdsForModule(selectedModuleId)
  ]);
  if (error) { showError('pieces-error', error); return; }
  const linkedByRole = new Map();
  (links || []).forEach((l) => {
    if (!linkedByRole.has(l.color_role_id)) linkedByRole.set(l.color_role_id, new Set());
    linkedByRole.get(l.color_role_id).add(l.color_id);
  });

  container.innerHTML = '';
  clearError('module-colors-error');
  // Só mostra papéis que alguma peça deste módulo REALMENTE usa — antes
  // mostrava todo o catálogo (Caixa, Porta/Frente, Painel...) mesmo pra
  // módulos sem nenhuma peça daquele papel, o que parecia bug (seção
  // "Painel" aparecia cheia de checkbox marcado num módulo sem nenhum
  // painel). Pra um papel aparecer aqui, atribua-o a um Tipo de Componente
  // (aba "Tipos de componente") ou numa peça-módulo aninhada (aba
  // "Componentes") primeiro.
  const rolesToShow = colorRolesCache.filter((role) => usedRoleIds.has(role.id));
  if (rolesToShow.length === 0) {
    container.innerHTML = '<p class="hint">Nenhuma peça deste módulo usa papel de cor ainda. Atribua um papel de cor a um Tipo de Componente (aba "Tipos de componente") ou a uma peça-módulo aninhada (aba "Componentes") pra ele aparecer aqui.</p>';
    return;
  }
  rolesToShow.forEach((role) => {
    const roleWrap = document.createElement('div');
    roleWrap.style.marginTop = '10px';
    roleWrap.style.paddingTop = '8px';
    roleWrap.style.borderTop = '1px solid #e3ddd0';
    const heading = document.createElement('p');
    heading.className = 'hint';
    heading.style.margin = '0 0 4px 0';
    heading.style.display = 'flex';
    heading.style.alignItems = 'center';
    heading.style.justifyContent = 'space-between';
    heading.style.gap = '8px';
    heading.innerHTML = `<strong>${role.name}</strong>`;
    roleWrap.appendChild(heading);

    // "Marcar/Desmarcar todas" — vincula (ou remove) TODAS as cores do
    // catálogo pra este papel neste módulo de uma vez, em vez de precisar
    // clicar cor por cor (pedido do usuário, listas de cor costumam ter
    // bastante item). Upsert/delete em lote + re-renderiza a seção inteira
    // pra refletir o estado novo (mesmo padrão do checkbox individual
    // abaixo, só que pra todas de uma vez).
    if (colorsCache.length > 0) {
      const bulkWrap = document.createElement('span');
      bulkWrap.style.display = 'flex';
      bulkWrap.style.gap = '4px';
      bulkWrap.style.flexShrink = '0';
      const selectAllBtn = document.createElement('button');
      selectAllBtn.type = 'button';
      selectAllBtn.className = 'secondary mc-row-btn';
      selectAllBtn.textContent = 'Marcar todas';
      const clearAllBtn = document.createElement('button');
      clearAllBtn.type = 'button';
      clearAllBtn.className = 'secondary mc-row-btn';
      clearAllBtn.textContent = 'Desmarcar todas';
      selectAllBtn.addEventListener('click', async () => {
        clearError('module-colors-error');
        const rows = colorsCache.map((c) => ({ module_id: selectedModuleId, color_role_id: role.id, color_id: c.id }));
        const { error } = await supabaseClient.from('module_colors').upsert(rows);
        if (error) { showError('module-colors-error', error); return; }
        loadModuleImageColorOptions();
        renderModuleColorLinks();
      });
      clearAllBtn.addEventListener('click', async () => {
        clearError('module-colors-error');
        const { error } = await supabaseClient.from('module_colors').delete()
          .eq('module_id', selectedModuleId).eq('color_role_id', role.id);
        if (error) { showError('module-colors-error', error); return; }
        loadModuleImageColorOptions();
        renderModuleColorLinks();
      });
      bulkWrap.appendChild(selectAllBtn);
      bulkWrap.appendChild(clearAllBtn);
      heading.appendChild(bulkWrap);
    }

    const linkedIds = linkedByRole.get(role.id) || new Set();
    colorsCache.forEach((c) => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '6px';
      label.style.marginTop = '4px';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.style.width = 'auto';
      checkbox.checked = linkedIds.has(c.id);
      checkbox.addEventListener('change', async () => {
        if (checkbox.checked) {
          await supabaseClient.from('module_colors').upsert({ module_id: selectedModuleId, color_role_id: role.id, color_id: c.id });
        } else {
          await supabaseClient.from('module_colors').delete()
            .eq('module_id', selectedModuleId).eq('color_role_id', role.id).eq('color_id', c.id);
        }
        // Mantém os selects de cor da "Imagem 3D do módulo" em dia sem
        // precisar trocar de módulo e voltar.
        loadModuleImageColorOptions();
      });
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(c.name));
      roleWrap.appendChild(label);
    });
    container.appendChild(roleWrap);
  });
}

// ---------- VÍNCULO MÓDULO x MODELOS (porta/dobradiça/corrediça) ----------

async function renderModuleOptionLinks() {
  if (!selectedModuleId) return;
  await renderOneOptionLink('module_hinge_models', 'hinge_model_id', hingeModelsCache, 'module-hinge-models-list');
  await renderOneOptionLink('module_slide_models', 'slide_model_id', slideModelsCache, 'module-slide-models-list');
}

async function renderOneOptionLink(joinTable, fkColumn, catalogItems, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const { data: links, error } = await supabaseClient
    .from(joinTable)
    .select(fkColumn)
    .eq('module_id', selectedModuleId);
  if (error) { showError('pieces-error', error); return; }
  const linkedIds = new Set((links || []).map((l) => l[fkColumn]));

  container.innerHTML = '';
  catalogItems.forEach((item) => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.marginTop = '4px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.width = 'auto';
    checkbox.checked = linkedIds.has(item.id);
    checkbox.addEventListener('change', async () => {
      if (checkbox.checked) {
        await supabaseClient.from(joinTable).upsert({ module_id: selectedModuleId, [fkColumn]: item.id });
      } else {
        await supabaseClient.from(joinTable).delete().eq('module_id', selectedModuleId).eq(fkColumn, item.id);
      }
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(item.name));
    container.appendChild(label);
  });
}

// ---------- CÁLCULO DE TESTE (conferência interna) ----------

document.getElementById('test-calc-form').addEventListener('submit', (e) => {
  e.preventDefault();
  runTestCalculation();
});

let testCalcColorSelectEls = {}; // role_id -> <select> vivo

// Um <select> de cor por papel cadastrado (migration 035 — antes eram 2
// selects fixos, Cor da caixa/Cor da porta). Usa TODAS as cores do catálogo
// (colorsCache), não só as vinculadas a um módulo — esta é uma ferramenta
// de conferência interna, não a tela do cliente.
function populateTestCalcColorSelects() {
  const container = document.getElementById('test-calc-color-selects');
  const prevValues = {};
  Object.keys(testCalcColorSelectEls).forEach((roleId) => { prevValues[roleId] = testCalcColorSelectEls[roleId].value; });

  container.innerHTML = '';
  testCalcColorSelectEls = {};
  colorRolesCache.forEach((role) => {
    const wrap = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = `Cor — ${role.name}`;
    const sel = document.createElement('select');
    sel.innerHTML = colorsCache.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    if (colorsCache.some((c) => c.id === prevValues[role.id])) sel.value = prevValues[role.id];
    sel.addEventListener('change', runTestCalculation);
    wrap.appendChild(label);
    wrap.appendChild(sel);
    container.appendChild(wrap);
    testCalcColorSelectEls[role.id] = sel;
  });
}

function populateTestCalcOptionSelects() {
  populateTestCalcColorSelects();
  fillSelect('test-calc-hinge-model', hingeModelsCache);
  fillSelect('test-calc-slide-model', slideModelsCache);
}

function renderTestCalcShelfInputs() {
  const container = document.getElementById('test-calc-shelf-quantities');
  container.innerHTML = '';
  modulePieces.filter((p) => p.quantity_configurable).forEach((p) => {
    const div = document.createElement('div');
    div.innerHTML = `<label>${p.reference} — quantidade (${p.quantity_min}-${p.quantity_max})</label>
      <input type="number" class="test-calc-shelf-qty" data-piece-id="${p.id}" min="${p.quantity_min}" max="${p.quantity_max}" value="${p.quantity_default}" />`;
    container.appendChild(div);
  });
}

// Peças marcadas "cliente pode adicionar/remover" (opcional) — mesmo
// padrão de caixinha de marcar que o cliente vê na calculadora, pra essa
// prévia interna refletir de verdade o que vai acontecer lá (desmarcado
// por padrão, precisa marcar pra entrar no total).
function renderTestCalcOptionalInputs() {
  const container = document.getElementById('test-calc-optionals');
  container.innerHTML = '';
  modulePieces.filter((p) => p.client_optional).forEach((p) => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    label.style.marginTop = '4px';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.style.width = 'auto';
    checkbox.className = 'test-calc-optional-checkbox';
    checkbox.dataset.pieceId = p.id;
    checkbox.addEventListener('change', runTestCalculation);
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(`${p.reference} (opcional)`));
    container.appendChild(label);
  });
}

function runTestCalculation() {
  clearError('test-calc-error');
  const resultEl = document.getElementById('test-calc-result');
  if (!selectedModuleId || modulePieces.length === 0) {
    resultEl.innerHTML = '<p class="hint">Marque ao menos um componente para testar o cálculo.</p>';
    return;
  }
  const module = modulesCache.find((m) => m.id === selectedModuleId);

  const colorsByRole = {};
  Object.keys(testCalcColorSelectEls).forEach((roleId) => {
    colorsByRole[roleId] = colorsCache.find((c) => c.id === testCalcColorSelectEls[roleId].value) || colorsCache[0];
  });
  const hingeModel = hingeModelsCache.find((h) => h.id === document.getElementById('test-calc-hinge-model').value) || null;
  const slideModel = slideModelsCache.find((s) => s.id === document.getElementById('test-calc-slide-model').value) || null;

  if (Object.keys(colorsByRole).length === 0 || colorsCache.length === 0) {
    resultEl.innerHTML = '<p class="hint">Cadastre ao menos uma cor para testar o cálculo.</p>';
    return;
  }

  const shelfQuantities = {};
  document.querySelectorAll('.test-calc-shelf-qty').forEach((input) => {
    shelfQuantities[input.dataset.pieceId] = parseInt(input.value, 10);
  });

  // Peças opcionais só entram se a caixinha estiver marcada — mesma regra
  // que vale na calculadora do cliente.
  const checkedOptionalIds = new Set();
  document.querySelectorAll('.test-calc-optional-checkbox').forEach((input) => {
    if (input.checked) checkedOptionalIds.add(input.dataset.pieceId);
  });
  const effectivePieces = modulePieces.filter((p) => !p.client_optional || checkedOptionalIds.has(p.id));

  const width_mm = parseFloat(document.getElementById('test-calc-width').value) || module.width_default_mm;
  const height_mm = parseFloat(document.getElementById('test-calc-height').value) || module.height_default_mm;
  const depth_mm = parseFloat(document.getElementById('test-calc-depth').value) || module.depth_default_mm;

  try {
    const result = Pricing.calculateModulePrice({
      module, pieces: effectivePieces, colorsByRole, hingeModel, slideModel, shelfQuantities,
      width_mm, height_mm, depth_mm
    });
    // Peça-módulo (sub-montagem aninhada) não tem chapa/fita/mão de obra
    // PRÓPRIA — quem tem isso são as peças-folha lá dentro dela (ver
    // pricing.js: calculateModulePiece). Antes esta tabela mostrava só um
    // resumo opaco ("Composição própria — $X/unidade") pra peça-módulo, sem
    // dar pra conferir se a mão de obra das peças-folha LÁ DENTRO estava
    // sendo somada de verdade. Agora renderBreakdownRow é recursiva: além da
    // linha-resumo da sub-montagem, ela desenha (indentada, com "↳") cada
    // peça-folha de child_breakdown — inclusive peça-módulo aninhada dentro
    // de peça-módulo, em qualquer profundidade — pra conferência visual
    // direta de chapa/fita/mão de obra/dobradiça/corrediça de cada peça real.
    const roleNameById = (id) => (colorRolesCache.find((r) => r.id === id) || {}).name || '—';
    function renderBreakdownRow(p, depth) {
      const indent = depth > 0 ? '<span class="hint">' + '&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(depth) + '↳ </span>' : '';
      if (p.is_module) {
        const childRows = (p.child_breakdown || []).map((cp) => renderBreakdownRow(cp, depth + 1)).join('');
        return `
          <tr>
            <td>${indent}📦 ${p.reference} (x${p.quantity}, sub-montagem${p.color_role_id ? ', ' + roleNameById(p.color_role_id) : ''})</td>
            <td>${p.width_mm.toFixed(0)} x ${p.height_mm.toFixed(0)} x ${p.depth_mm.toFixed(0)} mm</td>
            <td colspan="4" class="hint">Composição própria — $${p.child_total.toFixed(2)} / unidade (peças abaixo)</td>
            <td>$${p.hinge_cost.toFixed(2)}</td>
            <td>$${p.slide_cost.toFixed(2)}</td>
            <td><strong>$${p.piece_total.toFixed(2)}</strong></td>
          </tr>
          ${childRows}
        `;
      }
      return `
        <tr>
          <td>${indent}${p.reference} (x${p.quantity}, ${roleNameById(p.color_role_id)})</td>
          <td>${p.width_mm.toFixed(0)} x ${p.height_mm.toFixed(0)} x ${p.depth_mm.toFixed(0)} mm</td>
          <td>${p.area_m2.toFixed(3)} m²</td>
          <td>${p.edge_band_m.toFixed(2)} m</td>
          <td>$${p.sheet_cost.toFixed(2)}</td>
          <td>$${p.edge_cost.toFixed(2)}</td>
          <td>$${p.labor_cost.toFixed(2)}</td>
          <td>$${p.hinge_cost.toFixed(2)}</td>
          <td>$${p.slide_cost.toFixed(2)}</td>
          <td><strong>$${p.piece_total.toFixed(2)}</strong></td>
        </tr>
      `;
    }
    let rows = result.breakdown.map((p) => renderBreakdownRow(p, 0)).join('');
    // Preço do cliente = custo x margem — calculado de novo aqui SÓ pra
    // exibir lado a lado com o custo puro (result.total acima é sempre o
    // CUSTO, sem margem, porque esta chamada não passa markupMultiplier — é
    // o "Teste de cálculo" interno). Migration 070: a margem usada agora é a
    // do módulo (categoria > família > Padrão, ver resolveMarkupMultiplierForModule),
    // não mais sempre a Padrão — pra este teste bater com o que o cliente vê
    // de verdade no portal.
    const effectiveMultiplier = resolveMarkupMultiplierForModule(module);
    const clientTotal = result.total * effectiveMultiplier;
    resultEl.innerHTML = `
      <table>
        <thead><tr><th>Peça</th><th>Dimensões</th><th>Chapa</th><th>Fita</th><th>Custo chapa</th><th>Custo fita</th><th>Mão de obra</th><th>Dobradiça</th><th>Corrediça</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="total-price">Custo do módulo pai: $${result.total.toFixed(2)}</p>
      <p class="total-price">Preço pro cliente (com margem de ${markupMultiplierToPercent(effectiveMultiplier).toFixed(2)}%): $${clientTotal.toFixed(2)}</p>
      <p class="hint">Peças-módulo (sub-montagem, 📦) mostram as peças-folha de dentro indentadas ("↳") logo abaixo, com o custo de mão de obra de cada uma — confira aí se a mão de obra está sendo somada. Esta é a única visão com breakdown por peça e custo — o cliente vê apenas o total com margem.</p>
    `;
  } catch (err) {
    showError('test-calc-error', err);
    resultEl.innerHTML = '';
  }
}

// Selects de cor (um por papel) já ganham seu próprio listener 'change' na
// hora de serem criados dinamicamente — ver populateTestCalcColorSelects.
['test-calc-hinge-model', 'test-calc-slide-model'].forEach((id) => {
  document.getElementById(id).addEventListener('change', runTestCalculation);
});

// ---------- FURAÇÃO — VISUALIZAÇÃO NO TESTE DE CÁLCULO (migration 038) ----------
// Desenha cada peça do módulo selecionado com TODOS os furos que o export
// .ban geraria (padrão + contra-furo propagado + dobradiça), usando as mesmas
// dimensões/opções de teste do Teste de cálculo e a MESMA geração do export
// de verdade (Drilling.collectOrderPieces) — desenho e arquivo nunca divergem.
document.getElementById('module-drilling-preview-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('module-drilling-preview-status');
  const listEl = document.getElementById('module-drilling-preview-list');
  listEl.innerHTML = '';
  statusEl.textContent = '';
  if (!selectedModuleId) { statusEl.textContent = 'Selecione um módulo primeiro.'; return; }
  if (typeof Drilling === 'undefined') { statusEl.textContent = 'drilling.js não carregou — recarregue a página.'; return; }
  statusEl.textContent = 'Gerando...';
  try {
    const module = modulesCache.find((m) => m.id === selectedModuleId);
    const [pieces, drillsRes, patternHolesRes, settingsRes] = await Promise.all([
      loadRecursivePiecesForModule(selectedModuleId),
      supabaseClient.from('component_drillings').select('*').order('sort_order'),
      // Furos dos PROGRAMAS (migration 105) — é daqui que a linha "flatbord"
      // tira a furação, já que os dois componentes crus não têm nenhuma.
      supabaseClient.from('drilling_pattern_holes').select('*').order('sort_order'),
      supabaseClient.from('drilling_settings').select('*').eq('id', true).single()
    ]);
    if (drillsRes.error) throw drillsRes.error;
    if (settingsRes.error) throw settingsRes.error;

    // Erro engolido de propósito: sem a migration 105 o mapa fica vazio e tudo
    // segue pela furação do componente, como antes.
    const holesByPattern = Drilling.groupPatternHoles(
      (patternHolesRes && !patternHolesRes.error && patternHolesRes.data) || []);

    const drillingsByComponent = {};
    (drillsRes.data || []).forEach((row) => {
      if (!drillingsByComponent[row.component_id]) drillingsByComponent[row.component_id] = [];
      drillingsByComponent[row.component_id].push(row);
    });

    // Mesmos filtros/entradas do runTestCalculation: opcionais marcados,
    // quantidades de prateleira e dimensões de teste.
    const checkedOptionalIds = new Set();
    document.querySelectorAll('.test-calc-optional-checkbox').forEach((input) => {
      if (input.checked) checkedOptionalIds.add(input.dataset.pieceId);
    });
    const effectivePieces = pieces.filter((p) => !p.client_optional || checkedOptionalIds.has(p.id));
    const shelfQuantities = {};
    document.querySelectorAll('.test-calc-shelf-qty').forEach((input) => {
      shelfQuantities[input.dataset.pieceId] = parseInt(input.value, 10);
    });
    const W = parseFloat(document.getElementById('test-calc-width').value) || (module ? module.width_default_mm : 0);
    const H = parseFloat(document.getElementById('test-calc-height').value) || (module ? module.height_default_mm : 0);
    const D = parseFloat(document.getElementById('test-calc-depth').value) || (module ? module.depth_default_mm : 0);

    const parts = resolvePiecesForViewer(effectivePieces, { W, H, D }, {}, shelfQuantities);
    const recs = Drilling.collectOrderPieces(
      [{ moduleName: module ? module.name : '', parts, W, H, D, quantity: 1 }],
      { drillingsByComponent, holesByPattern, settings: settingsRes.data || {} }
    );

    if (recs.length === 0) {
      statusEl.textContent = 'Nenhum furo gerado neste módulo — confira a furação padrão dos componentes (incluindo contra-furos de borda) e as dobradiças (aba Furação).';
      return;
    }

    recs.forEach((rec) => {
      const m = { C: rec.comprimento_mm, L: rec.largura_mm, E: rec.espessura_mm };
      const holes = rec.holes.map((h) => ({ face: h.face, x: h.x, y: h.y, dia: h.diameter, depth: h.depth, outside: false }));
      const card = document.createElement('div');
      card.innerHTML = '<strong>' + rec.reference + '</strong> <span class="hint">x' + rec.quantity + ' — '
        + Math.round(m.C) + ' × ' + Math.round(m.L) + ' × ' + Math.round(m.E) + ' mm, ' + holes.length + ' furo(s)</span>'
        + buildDrillingPlaneSvg(m, holes);
      listEl.appendChild(card);
    });
    statusEl.textContent = recs.length + ' peça(s) com furação.';
  } catch (err) {
    statusEl.textContent = '';
    showError('test-calc-error', err);
  }
});

// ---------- PEDIDOS (orders/order_items enviados pelo portal do cliente) ----------
// Só leitura (migration 033 deu ao admin permissão de SELECT nessas duas
// tabelas — antes disso o admin não enxergava pedido nenhum, só o próprio
// cliente dono). Objetivo: a partir de um pedido já enviado, montar a
// listagem de peças (corte) que vai pra produção — comprimento/largura/
// espessura/cor/referência/descrição de cada peça real, já multiplicada
// pela quantidade de cada módulo do pedido.

let ordersCache = [];
let currentCutlistOrder = null; // pedido aberto na tela de lista de peças — usado pelo export de furação
let currentOrderCutlistRows = []; // última lista de peças (fabricação) renderizada — o botão de CSV baixa exatamente isso
let currentPurchaseListRows = []; // última lista de compra (comprados) renderizada — idem, botão de CSV próprio

async function renderOrdersList() {
  clearError('orders-error');
  const tbody = document.getElementById('orders-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="hint">Carregando...</td></tr>';
  // 'submitted' ("Pendente"), 'approved' ("Aprovada", migration 047), 'paid'
  // ("Paga") e 'delivered' ("Entregue", migration 059 — sequência Pendente →
  // Aprovada → Paga → Entregue) — antes só existia 'submitted', então
  // filtrar só por ele bastava; qualquer estágio novo precisa continuar
  // aparecendo aqui, senão o pedido sumiria da tela do admin ao avançar.
  const { data, error } = await supabaseClient
    .from('orders')
    .select('id, po_name, client_name, client_email, client_phone, delivery_address, status, submitted_at, order_type')
    .in('status', ['submitted', 'approved', 'paid', 'delivered'])
    .order('submitted_at', { ascending: false });
  if (error) { showError('orders-error', error); tbody.innerHTML = ''; return; }
  ordersCache = data || [];
  tbody.innerHTML = '';
  if (ordersCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="hint">Nenhum pedido enviado ainda.</td></tr>';
    return;
  }
  // Rótulo do status (mesmo texto do portal do cliente, ver orderStatusLabel
  // em portal.js) — 'submitted' virou "Pendente" (era "Aberta").
  const orderStatusLabels = { submitted: 'Pendente', approved: 'Aprovada', paid: 'Paga', delivered: 'Entregue' };
  ordersCache.forEach((order) => {
    const tr = document.createElement('tr');
    const dateStr = order.submitted_at ? new Date(order.submitted_at).toLocaleString('pt-BR') : '—';
    const statusLabel = orderStatusLabels[order.status] || order.status;
    // order_type (migration 051) — 'cutting_list' é a planilha do Contractor
    // (cutting_list_items), sem order_type (ou 'modules') é o pedido normal
    // de módulo configurado (order_items) — botão abre a tela certa.
    // 'project' (2026-08-02) — pedido criado pela aba Projetos do portal
    // (sendProjectToOrder), vive em order_items igual a 'modules', só muda o
    // rótulo aqui pra deixar claro de onde veio.
    const isCutlist = order.order_type === 'cutting_list';
    const typeLabel = isCutlist ? 'Plano de Corte' : (order.order_type === 'project' ? 'Projeto' : 'Módulos');
    tr.innerHTML = `
      <td>${order.po_name || '—'}</td>
      <td>${typeLabel}</td>
      <td>${order.client_name || '—'}</td>
      <td>${order.client_email || '—'}</td>
      <td>${order.client_phone || '—'}</td>
      <td>${statusLabel}</td>
      <td>${dateStr}</td>
      <td style="white-space:nowrap;">
        <button type="button" class="secondary order-view-cutlist-btn" style="margin-top:0;">Ver peças</button>
        ${order.status === 'approved' ? '<button type="button" class="secondary order-mark-paid-btn" style="margin-top:0;">Marcar pago</button>' : ''}
        ${order.status === 'paid' ? '<button type="button" class="secondary order-mark-delivered-btn" style="margin-top:0;">Marcar entregue</button>' : ''}
      </td>
    `;
    tr.querySelector('.order-view-cutlist-btn').addEventListener('click', () => {
      if (isCutlist) openOrderCuttingList(order);
      else openOrderCutlist(order);
    });
    // Pago/Entregue (migration 059) — mesma sequência/gravação do botão
    // equivalente no portal do cliente (po-order-detail-mark-paid-btn/
    // po-order-detail-mark-delivered-btn em portal.js); confirmado via
    // AskUserQuestion que tanto o admin quanto o cliente podem marcar.
    const markPaidBtn = tr.querySelector('.order-mark-paid-btn');
    if (markPaidBtn) {
      markPaidBtn.addEventListener('click', async () => {
        const { error: payErr } = await supabaseClient.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', order.id);
        if (payErr) { showError('orders-error', payErr); return; }
        renderOrdersList();
      });
    }
    const markDeliveredBtn = tr.querySelector('.order-mark-delivered-btn');
    if (markDeliveredBtn) {
      markDeliveredBtn.addEventListener('click', async () => {
        const { error: delErr } = await supabaseClient.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', order.id);
        if (delErr) { showError('orders-error', delErr); return; }
        renderOrdersList();
      });
    }
    tbody.appendChild(tr);
  });
}
document.getElementById('orders-tab-btn').addEventListener('click', renderOrdersList);

// Visualização do pedido de PLANO DE CORTE (migration 051) — cutting_list_items,
// diferente de openOrderCutlist (que deriva peças de order_items/módulo).
async function openOrderCuttingList(order) {
  clearError('order-cutting-list-error');
  document.getElementById('orders-list-section').style.display = 'none';
  document.getElementById('order-cutting-list-section').style.display = 'block';
  document.getElementById('order-cutting-list-title').textContent = order.po_name || order.client_name || '(sem nome)';
  const dateStr = order.submitted_at ? new Date(order.submitted_at).toLocaleString('pt-BR') : '—';
  document.getElementById('order-cutting-list-meta').textContent =
    `Cliente: ${order.client_name || '—'} · E-mail: ${order.client_email || '—'} · Enviado em: ${dateStr}`;

  const tbody = document.getElementById('order-cutting-list-tbody');
  tbody.innerHTML = '<tr><td colspan="12" class="hint">Carregando...</td></tr>';

  const { data: items, error } = await supabaseClient
    .from('cutting_list_items')
    .select('*')
    .eq('order_id', order.id)
    .order('sort_order');
  if (error) { showError('order-cutting-list-error', error); tbody.innerHTML = ''; return; }

  tbody.innerHTML = '';
  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="hint">Nenhuma peça neste pedido.</td></tr>';
    document.getElementById('order-cutting-list-total').textContent = '';
    return;
  }
  let total = 0;
  items.forEach((it) => {
    total += Number(it.total_price || 0);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.op || '—'}</td>
      <td>${it.part_name}</td>
      <td>${it.quantity}</td>
      <td>${Number(it.comprimento_mm).toFixed(0)}</td>
      <td>${Number(it.largura_mm).toFixed(0)}</td>
      <td>${it.has_grain ? 'Sim' : 'Não'}</td>
      <td>${Number(it.espessura_mm).toFixed(0)}mm</td>
      <td>${it.color_name || '—'}</td>
      <td>${it.edge_banding}</td>
      <td>${it.obs || ''}</td>
      <td>$${Number(it.unit_price || 0).toFixed(2)}</td>
      <td>$${Number(it.total_price || 0).toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
  document.getElementById('order-cutting-list-total').textContent = `Total: $${total.toFixed(2)}`;
}
document.getElementById('order-cutting-list-back-btn').addEventListener('click', () => {
  document.getElementById('order-cutting-list-section').style.display = 'none';
  document.getElementById('orders-list-section').style.display = 'block';
});

// Duplicado de portal.js de propósito (não há bundle compartilhado entre
// portal.js/admin.js neste projeto — mesmo padrão já usado pra outros
// helpers pequenos). Ver comentário completo em uploadGalleryImageToStorage
// no portal.js / migration 055.
async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}
async function uploadGalleryImageToStorage(imageDataUrl) {
  if (!imageDataUrl || !imageDataUrl.startsWith('data:')) return imageDataUrl;
  const blob = await dataUrlToBlob(imageDataUrl);
  const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseClient.storage.from('gallery-images').upload(path, blob, {
    contentType: blob.type || 'image/png',
    upsert: false
  });
  if (error) throw error;
  const { data } = supabaseClient.storage.from('gallery-images').getPublicUrl(path);
  return data.publicUrl;
}

// Botão "Migrar imagens antigas pro Storage" (pedido do usuário 2026-07-20)
// — converte posts publicados ANTES da migration 055, que ainda têm a
// imagem inteira em base64 na coluna ai_image_data_url.
//
// CORREÇÃO (mesmo dia): a 1ª versão buscava `id, ai_image_data_url` de
// TODOS os posts antigos numa única query — exatamente o problema que essa
// migração inteira existe pra resolver (muitos MB de base64 numa consulta
// só, pode travar/estourar statement_timeout igual já tinha acontecido na
// galeria pública, ver GALLERY_PAGE_SIZE em portal.js). Agora busca só os
// IDS primeiro (leve, mesmo com centenas de posts) e depois busca/sobe/
// atualiza a imagem de UM post por vez dentro do loop — nunca mais de uma
// imagem inteira na memória ao mesmo tempo.
async function migrateGalleryImagesToStorage() {
  const btn = document.getElementById('gallery-migrate-storage-btn');
  const statusEl = document.getElementById('gallery-migrate-storage-status');
  btn.disabled = true;
  statusEl.textContent = 'Buscando posts antigos...';
  try {
    const { data: idsData, error: idsError } = await supabaseClient
      .from('gallery_posts')
      .select('id')
      .like('ai_image_data_url', 'data:%');
    if (idsError) throw idsError;
    const ids = (idsData || []).map((p) => p.id);
    if (ids.length === 0) {
      statusEl.textContent = 'Nenhum post antigo pra migrar — tudo já está no Storage.';
      return;
    }
    let done = 0;
    let failed = 0;
    for (const id of ids) {
      statusEl.textContent = `Migrando ${done + failed + 1}/${ids.length}...`;
      try {
        // Busca a imagem DESTE post agora (1 por vez, nunca em lote).
        const { data: row, error: rowError } = await supabaseClient
          .from('gallery_posts')
          .select('ai_image_data_url')
          .eq('id', id)
          .single();
        if (rowError) throw rowError;
        const publicUrl = await uploadGalleryImageToStorage(row.ai_image_data_url);
        const { error: updateError } = await supabaseClient
          .from('gallery_posts')
          .update({ ai_image_data_url: publicUrl })
          .eq('id', id);
        if (updateError) throw updateError;
        done++;
      } catch (postErr) {
        console.error(`Falha ao migrar post ${id}:`, postErr);
        failed++;
      }
    }
    statusEl.textContent = failed
      ? `${done} migrado(s), ${failed} falharam (veja o console). Pode clicar de novo pra tentar os que faltam.`
      : `${done} post(s) migrado(s) com sucesso.`;
    renderGalleryAdminList();
  } catch (err) {
    statusEl.textContent = `Erro: ${err.message || err} — confirme que rodou a migration 055 (bucket "gallery-images") no SQL editor do Supabase.`;
  } finally {
    btn.disabled = false;
  }
}
const galleryMigrateStorageBtn = document.getElementById('gallery-migrate-storage-btn');
if (galleryMigrateStorageBtn) galleryMigrateStorageBtn.addEventListener('click', () => migrateGalleryImagesToStorage());

// ---------- GALERIA — moderação (migration 048) ----------
// Post público criado pelo cliente na aba Composição do portal (imagem +
// preço + medidas + cores), fica 'pending' até o admin aprovar aqui — só
// depois disso aparece na galeria pública do portal (RLS: "public read
// approved gallery_posts" só libera status='approved'). Esta tela do admin
// já enxerga TUDO (RLS "admin manage gallery_posts", is_admin()), inclusive
// price_cost e author_display_name/author_user_id mesmo quando o post é
// anônimo — pedido explícito do usuário: essas colunas nunca aparecem pro
// cliente, mas ficam disponíveis aqui pra uso em apresentações depois.
// Paginação (pedido do usuário 2026-07-20: a tela ficava travada em
// "Carregando..." — esta consulta buscava TODOS os posts de uma vez,
// incluindo o base64 de quem ainda não tinha sido migrado pro Storage —
// mesmo bug que já tinha estourado statement_timeout na galeria pública,
// ver GALLERY_PAGE_SIZE em portal.js). Some sozinha a virar necessária
// assim que todos os posts estiverem migrados (linha vira só uma URL
// curta, uma consulta sem LIMIT nenhum volta a ser rápida) — mas mantida
// por segurança, a galeria só tende a crescer.
const GALLERY_ADMIN_PAGE_SIZE = 10;
let galleryAdminPostsCache = [];
let galleryAdminHasMore = false;
// Cache de nome de família entre páginas — evita rebuscar family que já
// apareceu numa página anterior.
let galleryAdminFamilyNameById = new Map();

// "Cliente de referência" (pedido do usuário 2026-08-02) — margem de
// revenda (migration 072) do cliente escolhido no dropdown, usada só pra
// PREVIEW numa coluna extra da tabela (ver renderGalleryAdminRows). 0 =
// nenhum cliente escolhido, coluna mostra "—".
let galleryAdminReferenceMarginPct = 0;

// Lista de clientes com margem configurada, pro dropdown de referência.
// user_profiles.select('*') já inclui resale_margin_pct (migration 072) —
// mesma policy de leitura que loadProfiles() já usa (admin enxerga todas as
// linhas via is_admin()).
async function loadGalleryReferenceClients() {
  const sel = document.getElementById('gallery-reference-client-select');
  if (!sel) return;
  const { data, error } = await supabaseClient
    .from('user_profiles')
    .select('user_id, email, full_name, resale_margin_pct')
    .order('email');
  if (error) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— nenhum —</option>';
  (data || []).forEach((profile) => {
    const opt = document.createElement('option');
    opt.value = profile.user_id;
    const label = profile.full_name || profile.email || profile.user_id;
    opt.textContent = `${label} (margem ${Number(profile.resale_margin_pct || 0)}%)`;
    opt.dataset.marginPct = Number(profile.resale_margin_pct || 0);
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

document.getElementById('gallery-reference-client-select').addEventListener('change', (ev) => {
  const opt = ev.target.selectedOptions[0];
  galleryAdminReferenceMarginPct = opt ? Number(opt.dataset.marginPct || 0) : 0;
  renderGalleryAdminRows();
});

// Recalcula preço de UM post a partir do snapshot salvo em `slots` (mesmo
// formato de user_compositions.slots/user_projects.slots) — mirror de
// computeProjectSlotsTotal (portal.js), adaptado pros caches do admin
// (modulesCache/loadRecursivePiecesForModule/resolveMarkupMultiplierForModule
// já existem aqui, não precisa duplicar catálogo). Sem fallback de cor
// padrão por papel (diferente do portal.js, que usa moduleColorsByRole pra
// preencher cor não escolhida) — aqui só usa a cor que já estava salva no
// slot; se faltar alguma, aquele slot é pulado (mesmo comportamento de
// "catálogo mudou e a config não fecha mais" do portal.js).
async function computeGalleryPostPrice(slotConfigs) {
  if (!Array.isArray(slotConfigs) || slotConfigs.length === 0) return { total: 0, costTotal: 0, skipped: 0 };
  if (!modulesCache.length) await loadModules();
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

  let total = 0;
  let costTotal = 0;
  let skipped = 0;
  for (const cfg of slotConfigs) {
    const module = modulesCache.find((m) => m.id === cfg.module_id);
    if (!module) { skipped += 1; continue; }
    try {
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
      const result = module.is_decoration
        ? { total: 0, cost_total: 0 }
        : Pricing.calculateModulePrice({
          module, pieces: effectivePieces, colorsByRole, hingeModel, slideModel,
          shelfQuantities: cfg.shelf_quantities || {}, dimOverrides: cfg.dim_overrides || {},
          pieceColorOverrides,
          width_mm: cfg.width_mm, height_mm: cfg.height_mm, depth_mm: cfg.depth_mm,
          markupMultiplier: resolveMarkupMultiplierForModule(module)
        });
      total += Number(result.total) || 0;
      costTotal += Number(result.cost_total) || 0;
    } catch (calcErr) { skipped += 1; } // catálogo mudou e a config não fecha mais — não entra na soma
  }
  return { total, costTotal, skipped };
}

// Botão "Recalcular Galeria" (pedido do usuário 2026-08-02) — corrige
// price_sale/price_cost desatualizados: esses valores são um SNAPSHOT
// gravado no momento em que o cliente publicou (ver
// publishCompositionToGallery/portal.js), então se o preço de um módulo ou
// a margem do admin mudar depois, a Galeria fica com valor velho. Roda
// sobre TODOS os posts pending/approved (rejeitado não aparece pra
// ninguém, não vale a pena gastar tempo recalculando) — busca em páginas
// pra não estourar limite de linha nenhuma consulta.
const GALLERY_RECALC_PAGE_SIZE = 50;
async function recalculateGalleryPrices() {
  const btn = document.getElementById('gallery-recalc-btn');
  const statusEl = document.getElementById('gallery-recalc-status');
  if (btn.disabled) return;
  btn.disabled = true;
  let processed = 0;
  let updated = 0;
  let totalSkippedSlots = 0;
  try {
    let from = 0;
    for (;;) {
      const { data, error } = await supabaseClient
        .from('gallery_posts')
        .select('id, slots')
        .in('status', ['pending', 'approved'])
        .order('created_at', { ascending: false })
        .range(from, from + GALLERY_RECALC_PAGE_SIZE - 1);
      if (error) { statusEl.textContent = 'Erro: ' + error.message; return; }
      const page = data || [];
      if (page.length === 0) break;
      for (const post of page) {
        processed += 1;
        statusEl.textContent = `Recalculando… (${processed})`;
        const slots = Array.isArray(post.slots) ? post.slots : [];
        const { total, costTotal, skipped } = await computeGalleryPostPrice(slots);
        totalSkippedSlots += skipped;
        const { error: updErr } = await supabaseClient
          .from('gallery_posts')
          .update({ price_sale: total, price_cost: costTotal })
          .eq('id', post.id);
        if (!updErr) updated += 1;
      }
      if (page.length < GALLERY_RECALC_PAGE_SIZE) break;
      from += GALLERY_RECALC_PAGE_SIZE;
    }
    statusEl.textContent = `Recalculado: ${updated}/${processed} post(s)`
      + (totalSkippedSlots > 0 ? ` — ${totalSkippedSlots} módulo(s) ignorado(s) (não existem mais no catálogo).` : '.');
  } finally {
    btn.disabled = false;
    renderGalleryAdminList();
  }
}
document.getElementById('gallery-recalc-btn').addEventListener('click', recalculateGalleryPrices);

function updateGalleryAdminLoadMoreBtn() {
  const btn = document.getElementById('gallery-admin-load-more-btn');
  if (btn) btn.style.display = galleryAdminHasMore ? 'inline-block' : 'none';
}

async function renderGalleryAdminList() {
  clearError('gallery-admin-error');
  const tbody = document.getElementById('gallery-admin-tbody');
  tbody.innerHTML = '<tr><td colspan="12" class="hint">Carregando...</td></tr>';
  galleryAdminPostsCache = [];
  galleryAdminFamilyNameById = new Map();
  const statusFilter = document.getElementById('gallery-admin-status-filter').value;
  let query = supabaseClient
    .from('gallery_posts')
    // family_id trocou room_type (migration 049) — mesma taxonomia de
    // família usada em todo o catálogo (ver "Taxonomia" no admin). Busca
    // SEM embed families(name) de propósito: logo depois de rodar uma
    // migration que cria uma FK nova, o cache de schema do PostgREST às
    // vezes ainda não reconhece a relação ("Could not find a relationship
    // between 'gallery_posts' and 'families' in the schema cache") — em
    // vez de depender de recarregar o cache, busca os nomes numa 2ª query
    // separada (mesmo padrão já usado no resto do app pra resolver ids
    // salvos, ver restoreFavoriteComposition em portal.js) e junta no client.
    .select('id, ai_image_data_url, composition_name, family_id, price_sale, price_cost, author_display_name, is_anonymous, likes_count, status, created_at')
    .order('created_at', { ascending: false })
    .range(0, GALLERY_ADMIN_PAGE_SIZE - 1);
  if (statusFilter) query = query.eq('status', statusFilter);
  const { data, error } = await query;
  if (error) { showError('gallery-admin-error', error); tbody.innerHTML = ''; return; }
  galleryAdminPostsCache = data || [];
  galleryAdminHasMore = galleryAdminPostsCache.length === GALLERY_ADMIN_PAGE_SIZE;
  updateGalleryAdminLoadMoreBtn();
  await renderGalleryAdminRows();
}

// "Carregar mais" — busca a PRÓXIMA página (a partir do que já está em
// galleryAdminPostsCache) e concatena, mesmo padrão de loadMoreGalleryPosts
// em portal.js.
async function loadMoreGalleryAdminPosts() {
  const btn = document.getElementById('gallery-admin-load-more-btn');
  if (!galleryAdminHasMore || (btn && btn.disabled)) return;
  if (btn) btn.disabled = true;
  clearError('gallery-admin-error');
  try {
    const statusFilter = document.getElementById('gallery-admin-status-filter').value;
    const from = galleryAdminPostsCache.length;
    let query = supabaseClient
      .from('gallery_posts')
      .select('id, ai_image_data_url, composition_name, family_id, price_sale, price_cost, author_display_name, is_anonymous, likes_count, status, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + GALLERY_ADMIN_PAGE_SIZE - 1);
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data, error } = await query;
    if (error) { showError('gallery-admin-error', error); return; }
    const newPosts = data || [];
    galleryAdminPostsCache = galleryAdminPostsCache.concat(newPosts);
    galleryAdminHasMore = newPosts.length === GALLERY_ADMIN_PAGE_SIZE;
    updateGalleryAdminLoadMoreBtn();
    await renderGalleryAdminRows();
  } finally {
    if (btn) btn.disabled = false;
  }
}
document.getElementById('gallery-admin-load-more-btn').addEventListener('click', loadMoreGalleryAdminPosts);

// Monta as linhas da tabela a partir de galleryAdminPostsCache (extraído de
// renderGalleryAdminList pra poder ser reaproveitado por "Carregar mais"
// sem refazer a consulta inteira).
async function renderGalleryAdminRows() {
  const tbody = document.getElementById('gallery-admin-tbody');
  const data = galleryAdminPostsCache;
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="12" class="hint">Nenhum post encontrado.</td></tr>';
    return;
  }
  const missingFamilyIds = [...new Set(data.map((p) => p.family_id).filter((id) => id && !galleryAdminFamilyNameById.has(id)))];
  if (missingFamilyIds.length) {
    const { data: familiesData } = await supabaseClient.from('families').select('id, name').in('id', missingFamilyIds);
    (familiesData || []).forEach((f) => galleryAdminFamilyNameById.set(f.id, f.name));
  }
  const familyNameById = galleryAdminFamilyNameById;
  tbody.innerHTML = '';
  data.forEach((post) => {
    const tr = document.createElement('tr');
    const dateStr = post.created_at ? new Date(post.created_at).toLocaleString('pt-BR') : '—';
    const statusLabel = { pending: 'Pendente', approved: 'Aprovado', rejected: 'Rejeitado' }[post.status] || post.status;
    const imgHtml = post.ai_image_data_url
      ? `<img src="${post.ai_image_data_url}" alt="" class="gallery-admin-thumb" style="width:70px;height:70px;object-fit:contain;border:1px solid var(--border);border-radius:6px;cursor:zoom-in;" />`
      : '—';
    // Preview de revenda (pedido do usuário 2026-08-02) — preço de venda ×
    // (1 + margem do cliente escolhido no dropdown "Cliente de
    // referência"). Só cosmético, não grava nada — ver
    // galleryAdminReferenceMarginPct/loadGalleryReferenceClients.
    const resaleHtml = galleryAdminReferenceMarginPct > 0
      ? `$${(Number(post.price_sale || 0) * (1 + galleryAdminReferenceMarginPct / 100)).toFixed(2)}`
      : '—';
    tr.innerHTML = `
      <td>${imgHtml}</td>
      <td>${post.composition_name || '—'}</td>
      <td>${familyNameById.get(post.family_id) || '—'}</td>
      <td>$${Number(post.price_sale || 0).toFixed(2)}</td>
      <td>$${Number(post.price_cost || 0).toFixed(2)}</td>
      <td>${post.author_display_name || '—'}</td>
      <td>${post.is_anonymous ? 'Sim' : 'Não'}</td>
      <td>${Number(post.likes_count || 0)}</td>
      <td>${statusLabel}</td>
      <td>${dateStr}</td>
      <td>${resaleHtml}</td>
      <td></td>
    `;
    const actionsTd = tr.lastElementChild;
    if (post.status !== 'approved') {
      const approveBtn = document.createElement('button');
      approveBtn.type = 'button';
      approveBtn.textContent = 'Aprovar';
      approveBtn.style.marginTop = '0';
      approveBtn.addEventListener('click', () => updateGalleryPostStatus(post.id, 'approved'));
      actionsTd.appendChild(approveBtn);
    }
    if (post.status !== 'rejected') {
      const rejectBtn = document.createElement('button');
      rejectBtn.type = 'button';
      rejectBtn.className = 'secondary';
      rejectBtn.textContent = 'Rejeitar';
      rejectBtn.style.marginTop = '0';
      rejectBtn.style.marginLeft = '6px';
      rejectBtn.addEventListener('click', () => updateGalleryPostStatus(post.id, 'rejected'));
      actionsTd.appendChild(rejectBtn);
    }
    // "Editar" — abre a composição deste post no Portal (aba Composição,
    // já carregada) pra admin ajustar módulos/cores/medidas e salvar DE
    // VOLTA no mesmo post (não cria um novo) — pedido do usuário: "eu como
    // administrador, quero fazer alteracao na composicao dos projetos da
    // galeria ... pra ela ficar mais fiel as imagens geradas". Nova aba:
    // não perde a lista de moderação aberta aqui. Ver
    // maybeLoadGalleryPostForAdminEdit/saveGalleryPostAdminEdit em portal.js.
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary';
    editBtn.textContent = 'Editar';
    editBtn.style.marginTop = '0';
    editBtn.style.marginLeft = '6px';
    editBtn.addEventListener('click', () => window.open(`portal.html?editGalleryPost=${post.id}`, '_blank'));
    actionsTd.appendChild(editBtn);
    // Excluir de VERDADE (apaga a linha) — diferente de "Rejeitar", que só
    // esconde da galeria pública (status='rejected', ver RLS "public read
    // approved gallery_posts") mas mantém o registro pro admin ver depois.
    // Pedido do usuário: "como removo da galeria uma imagem que eu quero
    // tirar" — mesmo padrão de confirm() + delete já usado no resto do
    // admin.js (ex.: deleteColor/deleteComponent).
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Excluir';
    deleteBtn.style.marginTop = '0';
    deleteBtn.style.marginLeft = '6px';
    deleteBtn.addEventListener('click', () => deleteGalleryPost(post.id));
    actionsTd.appendChild(deleteBtn);
    // Miniatura 70x70 é pequena demais pra avaliar antes de aprovar (pedido
    // do usuário: "eu preciso poder clicar e abrir foto grande pra
    // aprovar") — reaproveita o MESMO lightbox/CSS já criado pra galeria
    // pública do portal (.po-gallery-lightbox-*, ver css/style.css;
    // admin.html carrega o mesmo style.css).
    const thumbImg = tr.querySelector('.gallery-admin-thumb');
    if (thumbImg) thumbImg.addEventListener('click', () => openGalleryAdminLightbox(post.ai_image_data_url));
    tbody.appendChild(tr);
  });
}

function openGalleryAdminLightbox(imageUrl) {
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

async function updateGalleryPostStatus(postId, newStatus) {
  const payload = { status: newStatus };
  if (newStatus === 'approved') payload.approved_at = new Date().toISOString();
  const { error } = await supabaseClient.from('gallery_posts').update(payload).eq('id', postId);
  if (error) { showError('gallery-admin-error', error); return; }
  renderGalleryAdminList();
}

async function deleteGalleryPost(postId) {
  if (!confirm('Excluir esta imagem da galeria? Não tem como desfazer.')) return;
  const { error } = await supabaseClient.from('gallery_posts').delete().eq('id', postId);
  if (error) { showError('gallery-admin-error', error); return; }
  renderGalleryAdminList();
}

document.getElementById('gallery-tab-btn').addEventListener('click', () => {
  renderGalleryAdminList();
  loadGalleryReferenceClients();
});
document.getElementById('gallery-admin-status-filter').addEventListener('change', renderGalleryAdminList);

// ---------- REFERÊNCIAS (fotos reais de MÓDULO pra fidelidade da IA) ----------
// migration_050_reference_photos.sql. Pedido do usuário (2026-07-19): "as
// imagens estao ficando diferentes tecnicamente do nosso produto... podemos
// criar um banco com cada referencia de modulo pra gerar a imagem mais
// fiel?" — cor NÃO tem foto de referência (removido a pedido do usuário
// logo em seguida: "acho que não precisa referência de cor, ela pode subir
// no próprio prompt pra ia gerar" — cor vira só texto no prompt, ver
// buildColorDescriptionForComposition em portal.js e generateModuleAiImage
// acima). Reaproveita o bucket 'textures' já existente (mesmo de
// uploadTextureIfSelected, cor — ver schema.sql "STORAGE — texturas das
// cores/chapas"), só um prefixo de caminho diferente — sem bucket/policy de
// Storage novos. generateAiPreviewForGallery (portal.js) e
// generateModuleAiImage (acima) escolhem no máximo 1 referência de módulo
// por chamada (mandar muitas imagens de referência de uma vez tende a
// CONFUNDIR o Gemini, não só custar mais). Uma referência pode ser
// cadastrada manualmente aqui (foto real) OU gerada automaticamente pelo
// botão "✨ Gerar imagem de IA" (caption 'Gerado automaticamente...').

function populateReferenceModuleSelect() {
  const sel = document.getElementById('reference-module-select');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— selecione —</option>';
  modulesCache.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

// Mesmo padrão de uploadTextureIfSelected() (acima, foto de cor) — bucket
// 'textures', só o prefixo de caminho muda (reference-photos/ em vez de
// colors/), pra não misturar os dois tipos de imagem dentro do mesmo bucket.
async function uploadReferencePhotoFile(file) {
  const ext = file.name.split('.').pop();
  const path = `reference-photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabaseClient.storage.from('textures').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (uploadError) throw new Error('Falha ao subir foto: ' + uploadError.message);
  const { data } = supabaseClient.storage.from('textures').getPublicUrl(path);
  return data.publicUrl;
}

document.getElementById('reference-photo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('reference-photos-error');
  const moduleId = document.getElementById('reference-module-select').value || null;
  const fileInput = document.getElementById('reference-photo-file');
  const file = fileInput.files && fileInput.files[0];
  const statusEl = document.getElementById('reference-photo-upload-status');
  if (!moduleId) {
    showError('reference-photos-error', 'Escolha um módulo.');
    return;
  }
  if (!file) {
    showError('reference-photos-error', 'Escolha um arquivo de foto.');
    return;
  }
  statusEl.textContent = 'Enviando foto...';
  try {
    const photoUrl = await uploadReferencePhotoFile(file);
    const { error } = await supabaseClient.from('reference_photos').insert({
      module_id: moduleId,
      photo_url: photoUrl,
      caption: document.getElementById('reference-photo-caption').value.trim() || null
    });
    if (error) throw error;
    statusEl.textContent = '';
    e.target.reset();
    renderReferencePhotosList();
  } catch (err) {
    statusEl.textContent = '';
    showError('reference-photos-error', err);
  }
});

async function renderReferencePhotosList() {
  const tbody = document.getElementById('reference-photos-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="hint">Carregando...</td></tr>';
  const { data, error } = await supabaseClient
    .from('reference_photos')
    .select('id, module_id, photo_url, caption, created_at')
    .order('created_at', { ascending: false });
  if (error) { showError('reference-photos-error', error); tbody.innerHTML = ''; return; }
  tbody.innerHTML = '';
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="hint">Nenhuma foto de referência ainda.</td></tr>';
    return;
  }
  data.forEach((ref) => {
    const tr = document.createElement('tr');
    const moduleName = ref.module_id ? ((modulesCache.find((m) => m.id === ref.module_id) || {}).name || '—') : '—';
    tr.innerHTML = `
      <td><img src="${ref.photo_url}" alt="" class="reference-photo-thumb" style="width:70px;height:70px;object-fit:cover;border:1px solid var(--border);border-radius:6px;cursor:zoom-in;" /></td>
      <td>${moduleName}</td>
      <td>${ref.caption || '—'}</td>
      <td></td>
    `;
    const actionsTd = tr.lastElementChild;
    // Reaproveita o MESMO lightbox já criado pra galeria (openGalleryAdminLightbox).
    tr.querySelector('.reference-photo-thumb').addEventListener('click', () => openGalleryAdminLightbox(ref.photo_url));
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Excluir';
    deleteBtn.addEventListener('click', () => deleteReferencePhoto(ref.id));
    actionsTd.appendChild(deleteBtn);
    tbody.appendChild(tr);
  });
}

async function deleteReferencePhoto(id) {
  if (!confirm('Excluir esta foto de referência? Não tem como desfazer.')) return;
  const { error } = await supabaseClient.from('reference_photos').delete().eq('id', id);
  if (error) { showError('reference-photos-error', error); return; }
  renderReferencePhotosList();
}

function renderReferencePhotosTab() {
  populateReferenceModuleSelect();
  renderReferencePhotosList();
}

document.getElementById('references-tab-btn').addEventListener('click', renderReferencePhotosTab);

// Achata recursivamente o breakdown de UM order_item (mesmo formato que
// Pricing.calculateAssembly devolve — ver pricing.js) em peças FOLHA reais.
// Uma peça-módulo (is_module=true) não é uma peça física de chapa — é uma
// sub-montagem; as peças de verdade dela estão em child_breakdown. O
// "multiplier" carrega a quantidade acumulada de todos os níveis acima
// (quantidade do order_item x quantidade de cada peça-módulo no caminho) até
// chegar na folha, senão o total de peças subestimaria pedidos com módulo
// aninhado ou "quantidade" > 1 no card do módulo.
function flattenOrderItemBreakdown(breakdown, multiplier) {
  const rows = [];
  (breakdown || []).forEach((p) => {
    const qty = (p.quantity || 1) * multiplier;
    if (p.is_module) {
      rows.push(...flattenOrderItemBreakdown(p.child_breakdown, qty));
    } else {
      rows.push({
        reference: p.reference || '—',
        // description/origin só existem em pedidos calculados DEPOIS das
        // mudanças em pricing.js que passaram a copiar piece.notes/origin
        // pro breakdown — pedidos mais antigos não têm esses campos
        // gravados. Sem origin, trata como 'fabricacao' (era o único
        // comportamento possível antes da migration 034 existir).
        description: p.description || '—',
        origin: p.origin || 'fabricacao',
        color_role_id: p.color_role_id,
        width_mm: p.width_mm,
        height_mm: p.height_mm,
        depth_mm: p.depth_mm,
        quantity: qty
      });
    }
  });
  return rows;
}

// Comprimento/Largura/Espessura de uma peça de chapa não vêm de um eixo fixo
// (width_mm/height_mm/depth_mm sozinhos não dizem qual dos 3 é a espessura,
// isso depende de como a peça foi montada no módulo) — mas TODA peça de
// chapa é fina num dos 3 eixos. Convenção de marcenaria (confirmada com o
// usuário): espessura = a menor das 3 dimensões, largura = a do meio,
// comprimento = a maior.
function sortPieceCutDims(width_mm, height_mm, depth_mm) {
  const sorted = [width_mm, height_mm, depth_mm].slice().sort((a, b) => a - b);
  return { thickness_mm: sorted[0], largura_mm: sorted[1], comprimento_mm: sorted[2] };
}

async function openOrderCutlist(order) {
  currentCutlistOrder = order; // usado pelo export de furação (migration 038)
  clearError('order-cutlist-error');
  document.getElementById('orders-list-section').style.display = 'none';
  document.getElementById('order-cutlist-section').style.display = 'block';
  document.getElementById('order-cutlist-title').textContent = order.po_name || order.client_name || '(sem nome)';
  const dateStr = order.submitted_at ? new Date(order.submitted_at).toLocaleString('pt-BR') : '—';
  document.getElementById('order-cutlist-meta').textContent =
    `Cliente: ${order.client_name || '—'} · E-mail: ${order.client_email || '—'} · Telefone: ${order.client_phone || '—'} · Enviado em: ${dateStr}`;

  const tbody = document.getElementById('order-cutlist-tbody');
  const purchaseTbody = document.getElementById('order-purchase-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="hint">Carregando...</td></tr>';
  purchaseTbody.innerHTML = '';

  const { data: items, error } = await supabaseClient
    .from('order_items')
    .select('module_name, quantity, selected_colors, breakdown, sort_order')
    .eq('order_id', order.id)
    .order('sort_order');
  if (error) { showError('order-cutlist-error', error); tbody.innerHTML = ''; return; }

  // Duas listas separadas (migration 034 — origin por componente): peça de
  // FABRICAÇÃO vira linha de corte (com medidas/cor); peça COMPRADA (ex:
  // puxador, pé, ferragem) vira linha da lista de compra (só referência +
  // quantidade, medida não importa pra comprar pronto). Uma linha por
  // ocorrência de peça-folha, agrupada (soma de quantidade) quando
  // referência/descrição/medidas/cor são IDÊNTICAS — não importa de qual
  // módulo do pedido a peça veio, porque o que importa é o item final, não
  // a origem dele dentro do pedido.
  const groupedCut = new Map();
  const groupedPurchase = new Map();
  (items || []).forEach((item) => {
    const leafRows = flattenOrderItemBreakdown(item.breakdown, item.quantity || 1);
    leafRows.forEach((leaf) => {
      if (leaf.origin === 'comprado') {
        const key = [item.module_name, leaf.reference, leaf.description].join('|');
        if (!groupedPurchase.has(key)) {
          groupedPurchase.set(key, {
            module_name: item.module_name,
            reference: leaf.reference,
            description: leaf.description,
            quantity: 0
          });
        }
        groupedPurchase.get(key).quantity += leaf.quantity;
        return;
      }
      // Cor por papel (migration 035) — item.selected_colors é o jsonb
      // gravado no pedido: [{ role_id, role_name, color_id, color_name }].
      // Casa pelo role_id da peça (leaf.color_role_id).
      const colorEntry = (item.selected_colors || []).find((sc) => sc.role_id === leaf.color_role_id);
      const colorName = colorEntry ? colorEntry.color_name : '—';
      const { thickness_mm, largura_mm, comprimento_mm } = sortPieceCutDims(leaf.width_mm, leaf.height_mm, leaf.depth_mm);
      const key = [item.module_name, leaf.reference, leaf.description, comprimento_mm.toFixed(1), largura_mm.toFixed(1), thickness_mm.toFixed(1), colorName].join('|');
      if (!groupedCut.has(key)) {
        groupedCut.set(key, {
          module_name: item.module_name,
          reference: leaf.reference,
          description: leaf.description,
          comprimento_mm, largura_mm, thickness_mm,
          color: colorName,
          quantity: 0
        });
      }
      groupedCut.get(key).quantity += leaf.quantity;
    });
  });

  const byModuleThenReference = (a, b) => a.module_name.localeCompare(b.module_name) || a.reference.localeCompare(b.reference);
  currentOrderCutlistRows = Array.from(groupedCut.values()).sort(byModuleThenReference);
  currentPurchaseListRows = Array.from(groupedPurchase.values()).sort(byModuleThenReference);

  tbody.innerHTML = '';
  if (currentOrderCutlistRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="hint">Nenhuma peça de fabricação neste pedido.</td></tr>';
  } else {
    currentOrderCutlistRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.module_name}</td>
        <td>${row.reference}</td>
        <td>${row.description}</td>
        <td>${row.comprimento_mm.toFixed(0)}</td>
        <td>${row.largura_mm.toFixed(0)}</td>
        <td>${row.thickness_mm.toFixed(0)}</td>
        <td>${row.color}</td>
        <td>${row.quantity}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  purchaseTbody.innerHTML = '';
  if (currentPurchaseListRows.length === 0) {
    purchaseTbody.innerHTML = '<tr><td colspan="4" class="hint">Nenhum item comprado neste pedido.</td></tr>';
  } else {
    currentPurchaseListRows.forEach((row) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${row.module_name}</td>
        <td>${row.reference}</td>
        <td>${row.description}</td>
        <td>${row.quantity}</td>
      `;
      purchaseTbody.appendChild(tr);
    });
  }
}

document.getElementById('order-cutlist-back-btn').addEventListener('click', () => {
  document.getElementById('order-cutlist-section').style.display = 'none';
  document.getElementById('orders-list-section').style.display = 'block';
});

// CSV separado por ";" (padrão do Excel PT-BR) com BOM UTF-8 na frente (pra
// acentuação abrir certo direto no Excel) — usado tanto pela lista de peças
// (fabricação) quanto pela lista de compra (comprados), cada botão passa
// seu próprio header/linhas/prefixo de nome de arquivo.
function downloadCsv(filenamePrefix, header, rows) {
  if (rows.length === 0) return;
  const csvEscape = (val) => {
    const str = String(val === null || val === undefined ? '' : val);
    return /[";\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  };
  const lines = [header.join(';')];
  rows.forEach((row) => { lines.push(row.map(csvEscape).join(';')); });
  const bom = String.fromCharCode(0xFEFF); // BOM UTF-8 na frente, pra acentuação abrir certo no Excel
  const csvContent = bom + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const titleText = document.getElementById('order-cutlist-title').textContent || 'pedido';
  a.download = `${filenamePrefix}-${titleText.replace(/[^a-z0-9]+/gi, '_')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById('order-cutlist-csv-btn').addEventListener('click', () => {
  const header = ['Módulo', 'Referência', 'Descrição', 'Comprimento (mm)', 'Largura (mm)', 'Espessura (mm)', 'Cor', 'Quantidade'];
  const rows = currentOrderCutlistRows.map((row) => [
    row.module_name, row.reference, row.description,
    row.comprimento_mm.toFixed(0), row.largura_mm.toFixed(0), row.thickness_mm.toFixed(0),
    row.color, row.quantity
  ]);
  downloadCsv('lista-de-pecas', header, rows);
});

document.getElementById('order-purchase-csv-btn').addEventListener('click', () => {
  const header = ['Módulo', 'Referência', 'Descrição', 'Quantidade'];
  const rows = currentPurchaseListRows.map((row) => [row.module_name, row.reference, row.description, row.quantity]);
  downloadCsv('lista-de-compra', header, rows);
});

// ---------- FURAÇÃO (ZIP de .ban) — migration 038 ----------
// Re-resolve as peças do pedido a partir da CONFIGURAÇÃO gravada em cada
// order_item (module_id + medidas + shelf_quantities + dim_overrides +
// opcionais escolhidos) contra o cadastro ATUAL de módulos/furação — de
// propósito NÃO usa o snapshot breakdown: furação é conhecimento de
// produção e pode ser corrigida/cadastrada DEPOIS do pedido feito (o preço,
// esse sim, fica congelado no breakdown). Um .ban por peça única (mesma
// peça + mesmos furos agrupa e soma quantidade), mais um índice .txt
// mapeando arquivo -> módulo/peça/medidas/quantidade.
document.getElementById('order-drilling-zip-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('order-drilling-status');
  clearError('order-cutlist-error');
  if (!currentCutlistOrder) return;
  if (typeof JSZip === 'undefined') {
    showError('order-cutlist-error', new Error('Biblioteca de ZIP não carregou — recarregue a página.'));
    return;
  }
  statusEl.textContent = 'Gerando furação...';
  try {
    const [itemsRes, drillsRes, patternHolesRes, settingsRes] = await Promise.all([
      supabaseClient.from('order_items')
        .select('module_id, module_name, quantity, width_mm, height_mm, depth_mm, shelf_quantities, dim_overrides, selected_optional_component_ids, sort_order, modules(is_decoration)')
        .eq('order_id', currentCutlistOrder.id)
        .order('sort_order'),
      supabaseClient.from('component_drillings').select('*').order('sort_order'),
      // Furos dos PROGRAMAS (migration 105) — sem isto o .ban do pedido sairia
      // sem furo nenhum pros modulos da linha "flatbord".
      supabaseClient.from('drilling_pattern_holes').select('*').order('sort_order'),
      supabaseClient.from('drilling_settings').select('*').eq('id', true).single()
    ]);
    const holesByPattern = Drilling.groupPatternHoles(
      (patternHolesRes && !patternHolesRes.error && patternHolesRes.data) || []);
    if (itemsRes.error) throw itemsRes.error;
    if (drillsRes.error) throw drillsRes.error;
    if (settingsRes.error) throw settingsRes.error;

    const drillingsByComponent = {};
    (drillsRes.data || []).forEach((row) => {
      if (!drillingsByComponent[row.component_id]) drillingsByComponent[row.component_id] = [];
      drillingsByComponent[row.component_id].push(row);
    });

    // Resolve cada item do pedido pro formato de parts do drilling.js —
    // mesma resolução usada pela aba Imagem 3D (loadRecursivePiecesForModule
    // + resolvePiecesForViewer), com a configuração escolhida pelo cliente.
    const drillingItems = [];
    let skippedModules = 0;
    for (const item of (itemsRes.data || [])) {
      // Módulo decorativo (migration 039) não vai pra produção — nem furação.
      if (item.modules && item.modules.is_decoration) continue;
      const pieces = await loadRecursivePiecesForModule(item.module_id);
      if (!pieces || pieces.length === 0) { skippedModules += 1; continue; }
      const selectedIds = item.selected_optional_component_ids || [];
      const effectivePieces = pieces.filter((p) => !p.client_optional || selectedIds.includes(p.id));
      const containerDims = { W: item.width_mm, H: item.height_mm, D: item.depth_mm };
      const parts = resolvePiecesForViewer(
        effectivePieces, containerDims, {}, item.shelf_quantities || {}, item.dim_overrides || {}
      );
      drillingItems.push({
        moduleName: item.module_name,
        parts,
        W: item.width_mm, H: item.height_mm, D: item.depth_mm,
        quantity: item.quantity || 1
      });
    }

    const files = Drilling.generateOrderFiles(drillingItems, {
      drillingsByComponent,
      holesByPattern,
      settings: settingsRes.data || {}
    });

    if (files.length === 0) {
      statusEl.textContent = 'Nenhum furo gerado — cadastre furação padrão nos componentes (incluindo contra-furos de borda) ou dobradiças.';
      return;
    }

    const zip = new JSZip();
    const indexLines = ['arquivo;modulo;peca;comprimento_mm;largura_mm;espessura_mm;quantidade;furos'];
    files.forEach((f) => {
      zip.file(f.filename, f.content);
      indexLines.push([
        f.filename, f.module_name, f.reference,
        Math.round(f.comprimento_mm), Math.round(f.largura_mm), Math.round(f.espessura_mm),
        f.quantity, f.holes_count
      ].join(';'));
    });
    zip.file('00_indice.txt', indexLines.join('\r\n') + '\r\n');

    const blob = await zip.generateAsync({ type: 'blob' });
    const titleText = currentCutlistOrder.po_name || currentCutlistOrder.client_name || 'pedido';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'furacao_' + titleText.replace(/[^a-zA-Z0-9_-]+/g, '_') + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    statusEl.textContent = files.length + ' arquivo(s) .ban gerado(s)'
      + (skippedModules > 0 ? ' — ' + skippedModules + ' módulo(s) do pedido não existem mais no cadastro e ficaram de fora.' : '.');
  } catch (err) {
    statusEl.textContent = '';
    showError('order-cutlist-error', err);
  }
});

// ---------- AUTENTICAÇÃO ----------

function showLoggedOut() {
  document.getElementById('login-section').style.display = 'block';
  document.getElementById('admin-content').style.display = 'none';
  document.getElementById('logout-btn').style.display = 'none';
}

async function showLoggedIn() {
  document.getElementById('login-section').style.display = 'none';
  document.getElementById('admin-content').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-block';
  document.getElementById('color-active').checked = true;
  document.getElementById('color-swatch-hex').value = '#cccccc';
  document.getElementById('module-active').checked = true;
  document.getElementById('component-quantity').value = 1;
  // ANTES de families/categories (migration 070) — marginProfileLabel() usa
  // marginProfilesCache pra mostrar o nome da margem vinculada na tabela,
  // precisa estar populado no 1º render de families-tbody/categories-tbody.
  await loadMarginProfiles();
  await familiesCRUD.load();
  await categoriesCRUD.load();
  await subcategoriesCRUD.load();
  await hingeModelsCRUD.load();
  await slideModelsCRUD.load();
  await laborTypesCRUD.load();
  await colorRolesCRUD.load(); // antes de loadComponentTypes — o form de tipo de componente já nasce com o <select> de papel populado
  // migration 080 — funções/receitas precisam vir ANTES de loadModules: o
  // <select id="module-function"> do formulário de módulo é populado a partir
  // de moduleFunctionsCache, e a árvore de módulos mostra o nome da função.
  await loadModuleFunctions();
  await loadRoomTypes();
  await loadPricingSettings();
  await loadComponentTypes();
  await loadSheetSizes();
  await loadColors();
  await loadComponents();
  await loadModules();
}

// Qualquer cliente com conta no portal.html (role='cliente'/'lojista'/
// 'contractor') consegue logar AQUI TAMBÉM, porque é a mesma base de auth do
// Supabase — login certo não significa "é admin". Antes, showLoggedIn() era
// chamado direto após um login válido, sem checar nada: um perfil não-admin
// via o painel inteiro renderizado (só as ESCRITAS falhavam depois, via RLS
// is_admin(), migration_018_admin_allowlist.sql). ensureAdminOrSignOut() faz
// a mesma checagem real (RPC is_admin(), allow-list admin_users) ANTES de
// mostrar admin-content — quem não está na allow-list é deslogado na hora e
// vê um erro, igual a um login errado.
async function ensureAdminOrSignOut() {
  const { data: isAdmin, error } = await supabaseClient.rpc('is_admin');
  if (error || !isAdmin) {
    await supabaseClient.auth.signOut();
    showLoggedOut();
    const errorEl = document.getElementById('login-error');
    if (errorEl) {
      errorEl.textContent = 'Este usuário não tem acesso ao painel administrativo.';
      errorEl.style.display = 'block';
    }
    return false;
  }
  return true;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    errorEl.textContent = error.message;
    errorEl.style.display = 'block';
    return;
  }
  if (!(await ensureAdminOrSignOut())) return;
  await showLoggedIn();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  showLoggedOut();
});

// ---------- INIT ----------

(async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    if (await ensureAdminOrSignOut()) await showLoggedIn();
  } else {
    showLoggedOut();
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') showLoggedOut();
  });
})();
