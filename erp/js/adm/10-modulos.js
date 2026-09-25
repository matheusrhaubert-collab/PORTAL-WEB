/* Painel admin — Módulos (pai), vínculo com componentes e árvore
 *
 * Pedaço 11/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

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
  // Medidas sugeridas / SKU (module_dimension_presets) — pedido do Matt
  // 2026-08-24: "ao duplicar quero que duplique as medidas sugeridas
  // tambem". Faltava desde sempre (copyModuleConfig só copiava
  // componentes/profundidades fixas/cores/dobradiça/corrediça, nunca os
  // presets de largura/altura/profundidade cadastrados na aba "Medidas
  // sugeridas"). Mesmo padrão de module_components acima: copia a linha
  // INTEIRA (não só FKs, como o linkTables abaixo) porque cada preset tem
  // seu próprio valor/rótulo/SKU, e descarta o "id" de origem — cada preset
  // tem PK própria (uuid), copiar o id colidiria com a linha original.
  const { data: dimPresets, error: dimPresetsErr } = await supabaseClient
    .from('module_dimension_presets').select('*').eq('module_id', fromId);
  if (dimPresetsErr) throw dimPresetsErr;
  if (dimPresets && dimPresets.length > 0) {
    const rows2 = dimPresets.map((p) => { const { id, ...rest } = p; return { ...rest, module_id: toId }; });
    const { error } = await supabaseClient.from('module_dimension_presets').insert(rows2);
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
  // 3D ao vivo da aba "Componentes" (26-modulo-pecas-3d.js) — só reparenta o
  // Viewer3D singleton pro canvas desta aba quando ela É a aba que ficou
  // visível agora (mesmo cuidado de "Imagem 3D": nunca em segundo plano).
  if (targetId === 'pieces-section' && selectedModuleId) ModulePieces3D.onTabShown();
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
