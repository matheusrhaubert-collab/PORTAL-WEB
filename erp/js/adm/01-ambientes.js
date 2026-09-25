/* Painel admin — Ambientes e receita de cômodo
 *
 * Pedaço 2/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

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
  const {
    table, tbodyId, formId, idFieldId, nameFieldId, priceFieldId, unitLabel, cacheSetter,
    // Campo extra OPCIONAL (migration 127 — só slide_models usa hoje:
    // rail_length_mm, o comprimento do trilho que Pricing.pickSlideModelByDepth
    // usa pra escolher a corrediça certa pela profundidade da gaveta).
    // hinge_models/labor_types não passam isto e continuam idênticos a antes.
    extraFieldId, extraFieldKey, extraColLabel
  } = opts;

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
      const extraCell = extraFieldKey
        ? `<td>${item[extraFieldKey] != null ? Math.round(item[extraFieldKey]) + 'mm' : '<span class="hint">—</span>'}</td>`
        : '';
      tr.innerHTML = `
        <td>${item.name}</td>
        ${extraCell}
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
    if (extraFieldId) {
      const el = document.getElementById(extraFieldId);
      if (el) el.value = item[extraFieldKey] != null ? item[extraFieldKey] : '';
    }
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
    if (extraFieldId) {
      const el = document.getElementById(extraFieldId);
      const raw = el ? el.value.trim() : '';
      payload[extraFieldKey] = raw === '' ? null : Number(raw);
    }
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
  unitLabel: '/ un', cacheSetter: (data) => { slideModelsCache = data; renderModuleOptionLinks(); populateTestCalcOptionSelects(); },
  // Migration 127 — comprimento do trilho. Cadastre uma linha de corrediça
  // POR COMPRIMENTO (305mm, 381mm...), cada uma com seu preço, e vincule
  // TODAS ao mesmo módulo-gaveta (aba "Modelos (dobradiça/corrediça)") — o
  // motor escolhe sozinho a certa pela profundidade real da gaveta.
  extraFieldId: 'slide-model-rail-length', extraFieldKey: 'rail_length_mm', extraColLabel: 'Trilho'
});
const laborTypesCRUD = setupPricedCatalogCRUD({
  table: 'labor_types', tbodyId: 'labor-types-tbody', formId: 'labor-type-form',
  idFieldId: 'labor-type-id', nameFieldId: 'labor-type-name', priceFieldId: 'labor-type-price',
  unitLabel: '/ un', cacheSetter: (data) => { laborTypesCache = data; fillSelect('component-labor-type', laborTypesCache); }
});

// Catálogo de PAPÉIS DE COR (migration 035) — substitui o binário fixo
// caixa/porta. Reusa o mesmo helper de families/categories/subcategories
// (name + active), só aponta o erro pro elemento próprio da seção.
//
// filterRows/hidden_from_admin (migration 155, Matt: "tira esse rod de
// opcao deixa tipo oculta") — o papel usado pelos itens de decoração
// (fogão/pia/lixeira/.../porta/janela, ver [[decor_itens_geometria_propria_141]])
// está com o name renomeado pra "Rod" no banco (Armadilha 1 da migration_141)
// e o Matt não quer ele aparecendo como opção pra ninguém escolher pra um
// componente de MÓVEL de verdade (misturaria a paleta fixa de 5 cores da
// decoração com as cores reais de laminado). colorRolesCache (FILTRADA,
// sem hidden_from_admin) é a lista certa pra popular qualquer <select> de
// ESCOLHA NOVA; colorRolesCacheAll (cheia) existe só pra não perder um
// color_role_id já salvo — ver o cuidado extra em
// erp/js/adm/07-tipos-componente.js (editComponentType) e
// erp/js/adm/13-modulo-pecas.js, que injetam a opção oculta de volta
// (marcada) SÓ quando o registro sendo editado já usa ela, pra salvar não
// apagar o vínculo sem querer.
const colorRolesCRUD = setupLookupCRUD({
  table: 'color_roles', tbodyId: 'color-roles-tbody', formId: 'color-role-form',
  idFieldId: 'color-role-id', nameFieldId: 'color-role-name', errorElId: 'color-roles-error',
  filterRows: (r) => !r.hidden_from_admin,
  cacheSetter: (data) => {
    colorRolesCacheAll = data;
    colorRolesCache = data.filter((r) => !r.hidden_from_admin);
    window['color-role-form_items'] = data;
    fillSelect('component-type-color-role', colorRolesCache);
    // Refaz qualquer UI que já tenha montado seletores por papel — sem isso,
    // criar/renomear um papel só refletiria depois de trocar de aba e voltar.
    renderModuleColorLinks();
    if (typeof renderModuleComponentsList === 'function') renderModuleComponentsList();
  }
});
