/* Painel admin — ITENS COMPRADOS e REGRAS DE CONSUMO (migration 119)
 *
 * Arquivo NOVO — não veio do antigo js/admin.js. Carrega DEPOIS do
 * ADM.montar() (os listeners são registrados por getElementById no topo) e
 * depois do 02-precos.js, de onde sai marginProfilesCache.
 *
 * ==========================================================================
 * O QUE ESTA TELA RESOLVE
 * ==========================================================================
 * Matt, 2026-08-18: itens comprados moravam junto com mão de obra, e o preço
 * de compra da ferragem era literalmente um `labor_type`. No relatório de
 * custo isso somava ferro na coluna de capacidade de máquina.
 *
 * Aqui eles ganham cadastro próprio, e — a parte difícil — ganham o VÍNCULO
 * com o módulo. O vínculo não é uma lista digitada: é o furo. Ver o cabeçalho
 * de js/hardware.js pra o raciocínio completo, inclusive por que "todo furo
 * de Ø8 é cavilha" está errado.
 *
 * ATENÇÃO ao mexer: esta tela é a fonte do que o PORTAL usa pra precificar.
 * Regra cadastrada errada não dá erro nenhum — dá ferragem a mais ou a menos
 * no orçamento, em silêncio. É o mesmo tipo de falha do resolvedor de peças
 * duplicado (ver quatro_copias_do_resolvedor_de_pecas).
 */

let purchasedItemsCache = [];
let hardwareRulesCache = [];

const PURCHASED_KIND_LABELS = {
  ferragem_montagem: 'Ferragem de montagem',
  suporte: 'Suporte',
  dobradica: 'Dobradiça',
  corredica: 'Corrediça',
  puxador: 'Puxador',
  pe: 'Pé / sapata',
  acessorio: 'Acessório',
  outro: 'Outro'
};

const HOLE_KIND_LABELS = {
  proprio_face: 'Face (furo próprio)',
  proprio_face_tambor: 'Face própria c/ tambor',
  proprio_borda: 'Borda (furo próprio)',
  contrafuro_face: 'Face (recebido)',
  contrafuro_borda: 'Borda (recebido)',
  copo_tambor: 'Tambor do minifix',
  copo_dobradica: 'Copo da dobradiça',
  marcacao_dobradica: 'Marcação da dobradiça',
  base_dobradica: 'Base da dobradiça',
  corredica: 'Corrediça',
  suporte_prateleira: 'Suporte de prateleira'
};

function purchasedItemName(id) {
  const i = (purchasedItemsCache || []).find((x) => x.id === id);
  return i ? i.name : '—';
}

// ---------- 1. CATÁLOGO ----------

async function loadPurchasedItems() {
  clearError('purchased-items-error');
  const { data, error } = await supabaseClient
    .from('purchased_items').select('*').order('sort_order').order('name');
  if (error) {
    // Banco sem a migration 119: a tela existe, avisa e não quebra o resto do
    // painel (showLoggedIn é sequencial — um throw aqui derrubaria os
    // cadastros que carregam depois).
    showError('purchased-items-error', error);
    purchasedItemsCache = [];
    return;
  }
  purchasedItemsCache = data || [];
  renderPurchasedItems();
  populatePurchasedItemSelects();
  // As regras mostram o NOME do item; re-render pra refletir rename/exclusão.
  if (hardwareRulesCache.length) renderHardwareRules();
}

function renderPurchasedItems() {
  const tbody = document.getElementById('purchased-items-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  purchasedItemsCache.forEach((it) => {
    const perfil = (marginProfilesCache || []).find((p) => p.id === it.margin_profile_id);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${it.code || '—'}</td>
      <td>${it.name}</td>
      <td>${PURCHASED_KIND_LABELS[it.kind] || it.kind || '—'}</td>
      <td>${it.unit || 'un'}</td>
      <td>${it.rail_length_mm != null ? Math.round(it.rail_length_mm) + 'mm' : '<span class="hint">—</span>'}</td>
      <td>${Number(it.purchase_price || 0).toFixed(4)}</td>
      <td>${perfil ? perfil.name : '<span class="hint">padrão</span>'}</td>
      <td>${it.active ? 'Ativo' : 'Inativo'}</td>
      <td>
        <button type="button" class="secondary" style="margin-top:0;" onclick="window.purchasedItemEdit('${it.id}')">Editar</button>
        <button type="button" class="danger" style="margin-top:0;" onclick="window.purchasedItemDelete('${it.id}')">Excluir</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// Popula os dois selects que listam item comprado: o de "consome o item" da
// regra e — quando existir — o do componente. Um só lugar, senão o próximo
// select criado nasce vazio e ninguém lembra por quê.
function populatePurchasedItemSelects() {
  // hardware-rule-item (regra de consumo por furo/papel) e component-purchased-item
  // (migration 119 exposta na tela de Componentes, 2026-08-18 — "colocar itens
  // comprados como componentes", ver o comentário grande no topo do arquivo):
  // mesmo formato de opção nos dois, só muda o texto do "— nenhum —".
  [
    { id: 'hardware-rule-item', vazio: '— escolha —' },
    { id: 'component-purchased-item', vazio: '— nenhum (preço vem da mão de obra) —' },
    // Migration 129 — kit de suporte (item comprado secundário, ex: kit
    // suporte de um cabide). Mesmo formato, reaproveita esta função como
    // está.
    { id: 'component-support-purchased-item', vazio: '— nenhum (sem kit de suporte) —' }
  ].forEach(({ id, vazio }) => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="">${vazio}</option>`;
    purchasedItemsCache.filter((i) => i.active !== false).forEach((i) => {
      const o = document.createElement('option');
      o.value = i.id;
      o.textContent = (i.code ? i.code + ' · ' : '') + i.name;
      sel.appendChild(o);
    });
    if (prev) sel.value = prev;
  });
  // Perfis de margem: o do item e o padrão dos comprados
  ['purchased-item-margin-profile', 'purchased-margin-profile'].forEach((id, idx) => {
    const s = document.getElementById(id);
    if (!s) return;
    const prev = s.value;
    s.innerHTML = idx === 0
      ? '<option value="">— padrão dos comprados —</option>'
      : '<option value="">— margem do módulo (comportamento atual) —</option>';
    (marginProfilesCache || []).forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${p.name} (${((Number(p.markup_multiplier) - 1) * 100).toFixed(0)}%)`;
      s.appendChild(o);
    });
    if (prev) s.value = prev;
  });
  // O valor gravado em pricing_settings só pode ser aplicado depois que o
  // select tem as opções — daí estar aqui e não no loadPricingSettings.
  const padrao = document.getElementById('purchased-margin-profile');
  if (padrao && typeof pricingSettingsCache !== 'undefined' && pricingSettingsCache) {
    padrao.value = pricingSettingsCache.purchased_margin_profile_id || '';
  }
}

window.purchasedItemEdit = function (id) {
  const it = purchasedItemsCache.find((x) => x.id === id);
  if (!it) return;
  document.getElementById('purchased-item-id').value = it.id;
  document.getElementById('purchased-item-name').value = it.name || '';
  document.getElementById('purchased-item-code').value = it.code || '';
  document.getElementById('purchased-item-supplier').value = it.supplier || '';
  document.getElementById('purchased-item-kind').value = it.kind || 'ferragem_montagem';
  document.getElementById('purchased-item-unit').value = it.unit || 'un';
  document.getElementById('purchased-item-price').value = Number(it.purchase_price || 0);
  // Migration 128 — comprimento do trilho (só relevante pra corrediça).
  const railEl = document.getElementById('purchased-item-rail-length');
  if (railEl) railEl.value = it.rail_length_mm != null ? it.rail_length_mm : '';
  document.getElementById('purchased-item-margin-profile').value = it.margin_profile_id || '';
  document.getElementById('purchased-item-notes').value = it.notes || '';
  document.getElementById('purchased-item-active').checked = it.active !== false;
  const attrs = document.getElementById('purchased-item-attrs');
  if (attrs) attrs.value = it.attrs ? JSON.stringify(it.attrs) : '';
};

window.purchasedItemDelete = async function (id) {
  // A FK de hardware_rules é `on delete cascade`: apagar o item leva junto as
  // regras que o consomem. Isso é o certo (regra apontando pra item que não
  // existe seria ferragem fantasma), mas precisa ser dito em voz alta —
  // apagar um item pode calar uma regra que alguém cadastrou meses atrás.
  const usadas = hardwareRulesCache.filter((r) => r.purchased_item_id === id).length;
  const aviso = usadas
    ? `Excluir este item? ${usadas} regra(s) de consumo apontam pra ele e serão apagadas junto.`
    : 'Excluir este item comprado?';
  if (!confirm(aviso)) return;
  const { error } = await supabaseClient.from('purchased_items').delete().eq('id', id);
  if (error) { showError('purchased-items-error', error); return; }
  await loadPurchasedItems();
  await loadHardwareRules();
};

const purchasedItemForm = document.getElementById('purchased-item-form');
if (purchasedItemForm) {
  purchasedItemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('purchased-items-error');
    const id = document.getElementById('purchased-item-id').value || undefined;

    let attrs = {};
    const attrsRaw = (document.getElementById('purchased-item-attrs') || {}).value || '';
    if (attrsRaw.trim()) {
      try { attrs = JSON.parse(attrsRaw); }
      catch (err) {
        showError('purchased-items-error', new Error('Atributos: JSON inválido. ' + err.message));
        return;
      }
    }

    const payload = {
      name: document.getElementById('purchased-item-name').value.trim(),
      code: document.getElementById('purchased-item-code').value.trim() || null,
      supplier: document.getElementById('purchased-item-supplier').value.trim() || null,
      kind: document.getElementById('purchased-item-kind').value,
      unit: document.getElementById('purchased-item-unit').value,
      purchase_price: parseFloat(document.getElementById('purchased-item-price').value) || 0,
      // Migration 128 — comprimento do trilho (mm), só relevante pra
      // corrediça; vazio = item de preço fixo (comportamento de sempre).
      rail_length_mm: (function () {
        const raw = (document.getElementById('purchased-item-rail-length') || {}).value;
        return raw === undefined || raw === null || raw === '' ? null : Number(raw);
      })(),
      margin_profile_id: document.getElementById('purchased-item-margin-profile').value || null,
      notes: document.getElementById('purchased-item-notes').value.trim() || null,
      active: document.getElementById('purchased-item-active').checked,
      attrs: attrs,
      updated_at: new Date().toISOString()
    };
    if (id) payload.id = id;
    else {
      // Mesmo motivo das cores: sem isto o item novo nasce com sort_order=0 e
      // pula pro topo da lista a cada cadastro.
      const max = purchasedItemsCache.reduce((m, i) => Math.max(m, Number(i.sort_order) || 0), 0);
      payload.sort_order = max + 10;
    }
    const { error } = await supabaseClient.from('purchased_items').upsert(payload);
    if (error) { showError('purchased-items-error', error); return; }
    purchasedItemFormReset();
    await loadPurchasedItems();
  });
}

function purchasedItemFormReset() {
  const f = document.getElementById('purchased-item-form');
  if (!f) return;
  f.reset();
  document.getElementById('purchased-item-id').value = '';
  document.getElementById('purchased-item-active').checked = true;
}
const purchasedItemClear = document.getElementById('purchased-item-clear');
if (purchasedItemClear) purchasedItemClear.addEventListener('click', purchasedItemFormReset);

// ---------- 2. MARGEM PADRÃO DOS COMPRADOS ----------

const purchasedMarginForm = document.getElementById('purchased-margin-form');
if (purchasedMarginForm) {
  purchasedMarginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('purchased-margin-error');
    const st = document.getElementById('purchased-margin-status');
    const val = document.getElementById('purchased-margin-profile').value || null;
    const { data, error } = await supabaseClient
      .from('pricing_settings')
      .update({ purchased_margin_profile_id: val, updated_at: new Date().toISOString() })
      .eq('id', true).select().single();
    if (error) { showError('purchased-margin-error', error); return; }
    pricingSettingsCache = data;
    aplicarMargemDosComprados(data);
    if (st) {
      st.textContent = val
        ? 'Margem salva. Vale pros itens sem margem própria.'
        : 'Salvo: comprados voltam a usar a margem do módulo.';
      setTimeout(() => { st.textContent = ''; }, 4000);
    }
  });
}

/* Publica no Pricing a margem dos comprados — o padrão e os overrides por
 * item. Espelha o aplicarLaborPorProcesso do 02-precos.js, e pelo mesmo
 * motivo: o preço mora num catálogo (margin_profiles) e pricing_settings só
 * diz qual linha é qual.
 *
 * Sem perfil escolhido, NÃO publica nada — e aí o Pricing mantém a margem do
 * módulo pro comprado, que é o comportamento de antes da migration 119.
 * Nascer neutro é de propósito: reclassificar (ferragem sai de mão de obra e
 * entra em material) e reprecificar no mesmo deploy deixaria impossível saber
 * qual dos dois mexeu no número. */
function aplicarMargemDosComprados(settings) {
  if (typeof Pricing === 'undefined' || !Pricing.setPurchasedMarkup) return;
  const mult = (perfilId) => {
    const p = (marginProfilesCache || []).find((x) => x.id === perfilId);
    return p ? Number(p.markup_multiplier) || 0 : 0;
  };
  Pricing.setPurchasedMarkup(mult(settings && settings.purchased_margin_profile_id));
  const porPerfil = {};
  (marginProfilesCache || []).forEach((p) => { porPerfil[p.id] = Number(p.markup_multiplier) || 0; });
  Pricing.setPurchasedMarkupByProfile(porPerfil);
  const porId = {};
  (purchasedItemsCache || []).forEach((i) => { porId[i.id] = i; });
  if (Pricing.setPurchasedItems) Pricing.setPurchasedItems(porId);
}

// ---------- 3. REGRAS DE CONSUMO ----------

async function loadHardwareRules() {
  clearError('hardware-rules-error');
  const { data, error } = await supabaseClient
    .from('hardware_rules').select('*').order('sort_order').order('name');
  if (error) { showError('hardware-rules-error', error); hardwareRulesCache = []; return; }
  hardwareRulesCache = data || [];
  renderHardwareRules();
  publicarCatalogoDeFerragem();
}

// Descreve o gatilho em uma linha legível. Vale o esforço: a coluna é o
// resumo do que a regra faz, e "proprio_face,copo_tambor|8|face" não é frase
// que alguém leia com confiança às cinco da tarde.
//
// hole_kinds é ARRAY desde a migration 119 (correção de 2026-08-18: o
// diâmetro sozinho decide cavilha/pino/tambor na FACE — ver cabeçalho de
// js/hardware.js — hole_kinds só escopa "vale pros furos do cadastro comum").
function hardwareTriggerLabel(r) {
  if (r.trigger_type === 'papel') return 'Peça com papel <code>' + (r.position_role || '?') + '</code>';
  const partes = [];
  const kinds = r.hole_kinds || [];
  partes.push(kinds.length
    ? kinds.map((k) => HOLE_KIND_LABELS[k] || k).join(' + ')
    : 'qualquer tipo de furo');
  if (r.diameter_mm !== null && r.diameter_mm !== undefined) partes.push('Ø' + Number(r.diameter_mm));
  if (r.face_kind) partes.push(r.face_kind === 'borda' ? 'na borda' : 'na face');
  return partes.join(' · ');
}

function renderHardwareRules() {
  const tbody = document.getElementById('hardware-rules-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  hardwareRulesCache.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${hardwareTriggerLabel(r)}</td>
      <td>${purchasedItemName(r.purchased_item_id)}</td>
      <td>${Number(r.qty)}</td>
      <td>${r.active ? 'Ativa' : 'Inativa'}</td>
      <td>
        <button type="button" class="secondary" style="margin-top:0;" onclick="window.hardwareRuleEdit('${r.id}')">Editar</button>
        <button type="button" class="danger" style="margin-top:0;" onclick="window.hardwareRuleDelete('${r.id}')">Excluir</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

// Publica catálogo + regras no motor. É o que faz o "Teste de cálculo" do ERP
// ver a mesma ferragem que o portal vê.
function publicarCatalogoDeFerragem() {
  if (typeof Hardware === 'undefined' || !Hardware.setCatalog) return;
  Hardware.setCatalog(purchasedItemsCache, hardwareRulesCache);
}

window.hardwareRuleEdit = function (id) {
  const r = hardwareRulesCache.find((x) => x.id === id);
  if (!r) return;
  document.getElementById('hardware-rule-id').value = r.id;
  document.getElementById('hardware-rule-name').value = r.name || '';
  document.getElementById('hardware-rule-trigger').value = r.trigger_type || 'furo';
  const kindsSel = document.getElementById('hardware-rule-hole-kinds');
  if (kindsSel) {
    const marcados = r.hole_kinds || [];
    Array.from(kindsSel.options).forEach((o) => { o.selected = marcados.indexOf(o.value) !== -1; });
  }
  document.getElementById('hardware-rule-diameter').value = (r.diameter_mm === null || r.diameter_mm === undefined) ? '' : Number(r.diameter_mm);
  document.getElementById('hardware-rule-face-kind').value = r.face_kind || '';
  document.getElementById('hardware-rule-position-role').value = r.position_role || '';
  document.getElementById('hardware-rule-item').value = r.purchased_item_id || '';
  document.getElementById('hardware-rule-qty').value = Number(r.qty);
  document.getElementById('hardware-rule-notes').value = r.notes || '';
  document.getElementById('hardware-rule-active').checked = r.active !== false;
  hardwareRuleToggleTrigger();
};

window.hardwareRuleDelete = async function (id) {
  if (!confirm('Excluir esta regra? A ferragem que ela adicionava some do orçamento a partir do próximo cálculo.')) return;
  const { error } = await supabaseClient.from('hardware_rules').delete().eq('id', id);
  if (error) { showError('hardware-rules-error', error); return; }
  loadHardwareRules();
};

function hardwareRuleToggleTrigger() {
  const t = (document.getElementById('hardware-rule-trigger') || {}).value || 'furo';
  const furo = document.getElementById('hardware-rule-furo-wrap');
  const papel = document.getElementById('hardware-rule-papel-wrap');
  if (furo) furo.style.display = t === 'furo' ? '' : 'none';
  if (papel) papel.style.display = t === 'papel' ? '' : 'none';
}

// Os 4 tipos do "cadastro comum" (component_drillings/drilling_pattern_holes
// normal, sem contar dobradiça/corrediça/suporte) — ver o cabeçalho de
// js/hardware.js. É a marcação certa pra qualquer regra de minifix/cavilha.
const HOLE_KINDS_CADASTRO_COMUM = ['proprio_face', 'proprio_face_tambor', 'contrafuro_face', 'copo_tambor'];

function hardwareRuleFormReset() {
  const f = document.getElementById('hardware-rule-form');
  if (!f) return;
  f.reset();
  document.getElementById('hardware-rule-id').value = '';
  document.getElementById('hardware-rule-qty').value = 1;
  document.getElementById('hardware-rule-active').checked = true;
  const kindsSel = document.getElementById('hardware-rule-hole-kinds');
  if (kindsSel) Array.from(kindsSel.options).forEach((o) => { o.selected = false; });
  hardwareRuleToggleTrigger();
}

const hardwareRuleKindsComum = document.getElementById('hardware-rule-kinds-comum');
if (hardwareRuleKindsComum) {
  hardwareRuleKindsComum.addEventListener('click', () => {
    const kindsSel = document.getElementById('hardware-rule-hole-kinds');
    if (!kindsSel) return;
    Array.from(kindsSel.options).forEach((o) => { o.selected = HOLE_KINDS_CADASTRO_COMUM.indexOf(o.value) !== -1; });
  });
}

const hardwareRuleForm = document.getElementById('hardware-rule-form');
if (hardwareRuleForm) {
  hardwareRuleForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError('hardware-rules-error');
    const id = document.getElementById('hardware-rule-id').value || undefined;
    const trigger = document.getElementById('hardware-rule-trigger').value;
    const diaRaw = document.getElementById('hardware-rule-diameter').value;

    const kindsSel = document.getElementById('hardware-rule-hole-kinds');
    const kindsMarcados = kindsSel ? Array.from(kindsSel.selectedOptions).map((o) => o.value) : [];

    const payload = {
      name: document.getElementById('hardware-rule-name').value.trim(),
      trigger_type: trigger,
      // Campos do OUTRO gatilho vão a null de propósito: uma regra 'papel'
      // que guardasse hole_kinds de uma edição anterior viraria uma regra que
      // parece dizer uma coisa e faz outra. Nenhum tipo marcado -> null
      // (="qualquer"), não array vazio, pra bater com o que hardware.js espera.
      hole_kinds: (trigger === 'furo' && kindsMarcados.length) ? kindsMarcados : null,
      diameter_mm: (trigger === 'furo' && diaRaw !== '') ? parseFloat(diaRaw) : null,
      face_kind: trigger === 'furo' ? (document.getElementById('hardware-rule-face-kind').value || null) : null,
      position_role: trigger === 'papel' ? (document.getElementById('hardware-rule-position-role').value.trim() || null) : null,
      purchased_item_id: document.getElementById('hardware-rule-item').value || null,
      qty: parseFloat(document.getElementById('hardware-rule-qty').value) || 0,
      notes: document.getElementById('hardware-rule-notes').value.trim() || null,
      active: document.getElementById('hardware-rule-active').checked
    };
    if (!payload.purchased_item_id) {
      showError('hardware-rules-error', new Error('Escolha o item comprado que esta regra consome.'));
      return;
    }
    if (trigger === 'papel' && !payload.position_role) {
      showError('hardware-rules-error', new Error('Gatilho por papel precisa do papel da peça (ex: handle, leg).'));
      return;
    }
    if (id) payload.id = id;
    else {
      const max = hardwareRulesCache.reduce((m, r) => Math.max(m, Number(r.sort_order) || 0), 0);
      payload.sort_order = max + 10;
    }
    const { error } = await supabaseClient.from('hardware_rules').upsert(payload);
    if (error) { showError('hardware-rules-error', error); return; }
    hardwareRuleFormReset();
    loadHardwareRules();
  });
}

/* Amarração dos controles que não são <form>. Mesmo padrão do
 * 24-programas-furacao.js: tenta ligar já e, se o HTML ainda não estiver
 * injetado (este script pode rodar antes do ADM.montar() num index.html
 * reordenado por engano), reagenda no DOMContentLoaded. */
(function ligaItensComprados() {
  const liga = () => {
    const t = document.getElementById('hardware-rule-trigger');
    if (!t) return false;
    t.addEventListener('change', hardwareRuleToggleTrigger);
    const clear = document.getElementById('hardware-rule-clear');
    if (clear) clear.addEventListener('click', hardwareRuleFormReset);
    hardwareRuleToggleTrigger();
    return true;
  };
  if (!liga()) document.addEventListener('DOMContentLoaded', liga);
})();
