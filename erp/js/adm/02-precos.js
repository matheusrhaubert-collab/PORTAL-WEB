/* Painel admin — Margem de preço, margens por família/categoria, plano de corte
 *
 * Pedaço 3/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- MARGEM DE PREÇO (migration 037) ----------
// Tabela singleton (1 linha só, id fixo true) — só carrega/atualiza essa
// linha, não é um CRUD de lista como os catálogos acima. Guardada em
// multiplicador (1.35 = +35%) no banco, mas mostrada/editada no admin como
// PERCENTUAL (mais natural pra digitar margem) — a conversão é só aqui.
let pricingSettingsCache = { markup_multiplier: 1 };

function markupMultiplierToPercent(multiplier) {
  return (Number(multiplier) - 1) * 100;
}

/* Mão de obra por processo (migrations 090/091) — publica as 6 parcelas
 * (fixa + variável de corte, fita e furação) no Pricing.
 *
 * O preço mora em labor_types (um catálogo só pra reajustar) e
 * pricing_settings só diz qual linha é qual processo. Resolve do
 * laborTypesCache em vez de consultar: 20-auth.js carrega laborTypesCRUD
 * ANTES de loadPricingSettings, de propósito.
 *
 * Banco sem a 090: as colunas vêm undefined, os quatro ficam em zero, e peça
 * nenhuma está marcada "por processo" ainda — nada muda. */
function aplicarLaborPorProcesso(settings) {
  if (typeof Pricing === 'undefined' || !Pricing.setProcessLabor) return;
  const preco = function (id) {
    const l = (laborTypesCache || []).find(function (x) { return x.id === id; });
    return l ? Number(l.price_per_unit) || 0 : 0;
  };
  const g = function (campo) { return preco(settings && settings[campo]); };
  Pricing.setProcessLabor({
        // corte_m2: o id no banco continua sendo labor_corte_metro_id (não
        // vale migration só pra renomear coluna), mas o SENTIDO mudou em
        // 2026-08-15 — o preço agora é por m² da peça, não por metro de
        // perímetro. Reajuste o valor no catálogo ao migrar.
    corte_peca: g('labor_corte_peca_id'), corte_m2: g('labor_corte_metro_id'),
    fita_passada: g('labor_fita_passada_id'), fita_metro: g('labor_fita_metro_id'),
    furacao_peca: g('labor_furacao_peca_id'), furacao_furo: g('labor_furacao_furo_id'),
    usinagem_peca: g('labor_usinagem_peca_id'), usinagem_metro: g('labor_usinagem_metro_id')
  });
}

async function loadPricingSettings() {
  clearError('pricing-settings-error');
  const { data, error } = await supabaseClient.from('pricing_settings').select('*').eq('id', true).single();
  if (error) { showError('pricing-settings-error', error); return; }
  pricingSettingsCache = data;
  aplicarLaborPorProcesso(data);
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
