/* Painel admin — Configuração, helpers e utilidades compartilhadas
 *
 * Pedaço 1/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

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
let colorRolesCache = []; // catálogo de papéis de cor (migration 035) — ex: "Caixa", "Porta/Frente", e quantos mais o admin criar. FILTRADO (migration 155): não inclui papéis hidden_from_admin (ex: "Rod", usado só pela decoração) — é a lista certa pra popular QUALQUER <select> de escolha.
let colorRolesCacheAll = []; // (migration 155) MESMA tabela, SEM filtro — só pra não perder um color_role_id já salvo (oculto ou não) quando um formulário abre pra editar um registro que já usa ele. Nunca usar pra popular opções de escolha nova.
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

  // filterRows (migration 155, pedido do Matt pro papel de cor "Rod" da
  // decoração: "tira esse rod de opcao deixa tipo oculta") — opcional, só
  // color_roles passa isso hoje. Filtra o que APARECE na tabela (render),
  // mas cacheSetter sempre recebe a lista CHEIA — quem precisa enxergar uma
  // linha oculta pra não corromper um valor já salvo (ver
  // erp/js/adm/07-tipos-componente.js) usa a lista cheia que o próprio
  // cacheSetter guardou à parte, nunca a filtrada.
  const filterRows = opts.filterRows || null;

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
    const visibleRows = filterRows ? data.filter(filterRows) : data;
    render(visibleRows);
    if (onLoaded) onLoaded(visibleRows);
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
