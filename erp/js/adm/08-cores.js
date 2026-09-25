/* Painel admin — Cores, materiais e tamanhos de chapa
 *
 * Pedaço 9/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

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
      <td>${c.name}${c.thickness_mm ? ` <span class="badge" title="Espessura da chapa (migration 160)">${c.thickness_mm} mm</span>` : ''}</td>
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
  // Substrato (migration 088) — cor antiga vem sem a coluna preenchida; o
  // default do banco já é 'mdp', então o fallback aqui só cobre o caso de a
  // migration ainda não ter rodado.
  document.getElementById('color-substrato').value = c.substrato || 'mdp';
  // Densidade (migration 152) — null/undefined vira campo vazio (não '0',
  // que seria um valor inválido e mudaria o cálculo pra zero).
  document.getElementById('color-density').value = (c.density_kg_per_m3 === null || c.density_kg_per_m3 === undefined) ? '' : c.density_kg_per_m3;
  // Espessura (migration 160) — vazio = null = 19.5 padrão (ver E em pricing.js).
  document.getElementById('color-thickness').value = (c.thickness_mm === null || c.thickness_mm === undefined) ? '' : c.thickness_mm;
  document.getElementById('color-texture-url').value = c.texture_url || '';
  document.getElementById('color-texture-file').value = '';
  document.getElementById('color-default-sheet-size').value = c.default_sheet_size_id || '';
  document.getElementById('color-stock-in-house').checked = !!c.stock_in_house;
  document.getElementById('color-skip-cutting-plan').checked = !!c.skip_cutting_plan;
  document.getElementById('color-has-grain').checked = !!c.has_grain;
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
  // DATA.clearCache() -- sem isso, LOTES.colors() (cache de página inteira,
  // erp/js/data.js) continua servindo a cor excluída até um F5. Achado pelo
  // Matt em 21/09: editar "tem veio" de uma cor e gerar/recarregar peças do
  // Lotes na MESMA sessão sem dar F5 usava o valor antigo.
  if (typeof DATA !== 'undefined' && DATA.clearCache) DATA.clearCache();
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
    substrato: document.getElementById('color-substrato').value || 'mdp', // migration 088
    // Densidade (migration 152) — campo vazio = null = herda a densidade
    // global (ver calculateWeightKg em js/pricing.js). NÃO usar `|| null`
    // aqui: isso trocaria um 0 digitado por null também, mas 0 não é um
    // valor de densidade válido pra começo de conversa, então tudo bem.
    density_kg_per_m3: document.getElementById('color-density').value === '' ? null : parseFloat(document.getElementById('color-density').value),
    // Espessura da chapa (migration 160) — mesma regra da densidade: vazio =
    // null = padrão 19.5. É o E das fórmulas (pricing.js thicknessForPiece).
    thickness_mm: document.getElementById('color-thickness').value === '' ? null : parseFloat(document.getElementById('color-thickness').value),

    default_sheet_size_id: document.getElementById('color-default-sheet-size').value || null,
    stock_in_house: document.getElementById('color-stock-in-house').checked,
    skip_cutting_plan: document.getElementById('color-skip-cutting-plan').checked,
    has_grain: document.getElementById('color-has-grain').checked,   // migration 083
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
  document.getElementById('color-substrato').value = 'mdp';
  document.getElementById('color-density').value = '';
  document.getElementById('color-thickness').value = '';
  document.getElementById('color-texture-url').value = '';
  document.getElementById('color-texture-preview').innerHTML = '';
  document.getElementById('color-texture-upload-status').textContent = '';
  document.getElementById('color-default-sheet-size').value = '';
  document.getElementById('color-stock-in-house').checked = false;
  document.getElementById('color-skip-cutting-plan').checked = false;
  toggleColorSheetSizeFieldVisibility();
  document.getElementById('color-active').checked = true;
  // DATA.clearCache() -- mesmo motivo do deleteColor acima: sem isso,
  // LOTES.colors() (cache de página inteira, erp/js/data.js) continua
  // servindo has_grain/etc. antigos pro resto da sessão do navegador depois
  // de salvar uma cor aqui.
  if (typeof DATA !== 'undefined' && DATA.clearCache) DATA.clearCache();
  loadColors();
});
