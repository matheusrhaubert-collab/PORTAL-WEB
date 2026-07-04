// Painel admin — LEGNO PORTAL WEB
// CRUD de cores, módulos (pai) e peças (componentes). Mostra o breakdown
// completo de cálculo para conferência (o cliente nunca vê essa tela).

let colorsCache = [];
let modulesCache = [];
let selectedModuleId = null;
let piecesCache = [];

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

// ---------- CORES ----------

async function loadColors() {
  const { data, error } = await supabaseClient.from('colors').select('*').order('name');
  if (error) { showError('colors-error', error); return; }
  colorsCache = data;
  renderColors();
  renderModuleColorLinks();
  populateColorFormula();
}

function renderColors() {
  const tbody = document.getElementById('colors-tbody');
  tbody.innerHTML = '';
  colorsCache.forEach((c) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>R$ ${Number(c.sheet_price_per_m2).toFixed(2)} / m²</td>
      <td>R$ ${Number(c.edge_price_per_linear_m).toFixed(2)} / m</td>
      <td>${c.active ? '<span class="badge">ativa</span>' : '<span class="badge">inativa</span>'}</td>
      <td><button class="secondary" onclick="editColor('${c.id}')">Editar</button>
          <button class="danger" onclick="deleteColor('${c.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function populateColorFormula() {
  // placeholder para futuras dicas de fórmula; mantém cores disponíveis globalmente acessíveis
}

window.editColor = function (id) {
  const c = colorsCache.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('color-id').value = c.id;
  document.getElementById('color-name').value = c.name;
  document.getElementById('color-sheet-price').value = c.sheet_price_per_m2;
  document.getElementById('color-edge-price').value = c.edge_price_per_linear_m;
  document.getElementById('color-active').checked = c.active;
};

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
  const payload = {
    name: document.getElementById('color-name').value.trim(),
    sheet_price_per_m2: parseFloat(document.getElementById('color-sheet-price').value),
    edge_price_per_linear_m: parseFloat(document.getElementById('color-edge-price').value),
    active: document.getElementById('color-active').checked
  };
  if (id) payload.id = id;
  const { error } = await supabaseClient.from('colors').upsert(payload);
  if (error) { showError('colors-error', error); return; }
  e.target.reset();
  document.getElementById('color-id').value = '';
  document.getElementById('color-active').checked = true;
  loadColors();
});

// ---------- MÓDULOS (PAI) ----------

async function loadModules() {
  const { data, error } = await supabaseClient.from('modules').select('*').order('name');
  if (error) { showError('modules-error', error); return; }
  modulesCache = data;
  renderModules();
  renderModuleSelect();
}

function renderModules() {
  const tbody = document.getElementById('modules-tbody');
  tbody.innerHTML = '';
  modulesCache.forEach((m) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.name}</td>
      <td>${m.width_min_mm}–${m.width_max_mm} mm</td>
      <td>${m.height_min_mm}–${m.height_max_mm} mm</td>
      <td>${m.depth_min_mm}–${m.depth_max_mm} mm</td>
      <td>${m.active ? '<span class="badge">ativo</span>' : '<span class="badge">inativo</span>'}</td>
      <td><button class="secondary" onclick="editModule('${m.id}')">Editar</button>
          <button class="danger" onclick="deleteModule('${m.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
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

window.editModule = function (id) {
  const m = modulesCache.find((x) => x.id === id);
  if (!m) return;
  document.getElementById('module-id').value = m.id;
  document.getElementById('module-name').value = m.name;
  document.getElementById('module-slug').value = m.slug || '';
  document.getElementById('module-description').value = m.description || '';
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
};

window.deleteModule = async function (id) {
  if (!confirm('Excluir este módulo e todas as suas peças/vínculos?')) return;
  const { error } = await supabaseClient.from('modules').delete().eq('id', id);
  if (error) { showError('modules-error', error); return; }
  if (selectedModuleId === id) { selectedModuleId = null; }
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
    width_min_mm: parseFloat(document.getElementById('module-width-min').value),
    width_max_mm: parseFloat(document.getElementById('module-width-max').value),
    width_default_mm: parseFloat(document.getElementById('module-width-default').value),
    height_min_mm: parseFloat(document.getElementById('module-height-min').value),
    height_max_mm: parseFloat(document.getElementById('module-height-max').value),
    height_default_mm: parseFloat(document.getElementById('module-height-default').value),
    depth_min_mm: parseFloat(document.getElementById('module-depth-min').value),
    depth_max_mm: parseFloat(document.getElementById('module-depth-max').value),
    depth_default_mm: parseFloat(document.getElementById('module-depth-default').value),
    active: document.getElementById('module-active').checked
  };
  if (id) payload.id = id;
  const { error } = await supabaseClient.from('modules').upsert(payload);
  if (error) { showError('modules-error', error); return; }
  e.target.reset();
  document.getElementById('module-id').value = '';
  document.getElementById('module-active').checked = true;
  loadModules();
});

// ---------- PEÇAS DO MÓDULO SELECIONADO ----------

document.getElementById('module-select').addEventListener('change', (e) => {
  selectedModuleId = e.target.value || null;
  document.getElementById('pieces-section').style.display = selectedModuleId ? 'block' : 'none';
  document.getElementById('module-colors-section').style.display = selectedModuleId ? 'block' : 'none';
  if (selectedModuleId) {
    loadPieces();
    renderModuleColorLinks();
  }
});

async function loadPieces() {
  clearError('pieces-error');
  const { data, error } = await supabaseClient
    .from('module_pieces')
    .select('*')
    .eq('module_id', selectedModuleId)
    .order('sort_order');
  if (error) { showError('pieces-error', error); return; }
  piecesCache = data;
  renderPieces();
  runTestCalculation();
}

function renderPieces() {
  const tbody = document.getElementById('pieces-tbody');
  tbody.innerHTML = '';
  piecesCache.forEach((p) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.reference}</td>
      <td>${p.quantity}</td>
      <td><code>${p.width_formula}</code></td>
      <td><code>${p.height_formula}</code></td>
      <td><code>${p.depth_formula}</code></td>
      <td><code>${p.area_m2_formula}</code></td>
      <td><code>${p.edge_band_linear_m_formula}</code></td>
      <td>R$ ${Number(p.labor_cost_per_unit).toFixed(2)}</td>
      <td><button class="secondary" onclick="editPiece('${p.id}')">Editar</button>
          <button class="danger" onclick="deletePiece('${p.id}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.editPiece = function (id) {
  const p = piecesCache.find((x) => x.id === id);
  if (!p) return;
  document.getElementById('piece-id').value = p.id;
  document.getElementById('piece-reference').value = p.reference;
  document.getElementById('piece-quantity').value = p.quantity;
  document.getElementById('piece-width-formula').value = p.width_formula;
  document.getElementById('piece-height-formula').value = p.height_formula;
  document.getElementById('piece-depth-formula').value = p.depth_formula;
  document.getElementById('piece-area-formula').value = p.area_m2_formula;
  document.getElementById('piece-edge-formula').value = p.edge_band_linear_m_formula;
  document.getElementById('piece-labor').value = p.labor_cost_per_unit;
  document.getElementById('piece-notes').value = p.notes || '';
};

window.deletePiece = async function (id) {
  if (!confirm('Excluir esta peça?')) return;
  const { error } = await supabaseClient.from('module_pieces').delete().eq('id', id);
  if (error) { showError('pieces-error', error); return; }
  loadPieces();
};

document.getElementById('piece-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('pieces-error');
  if (!selectedModuleId) return;

  const payload = {
    module_id: selectedModuleId,
    reference: document.getElementById('piece-reference').value.trim(),
    quantity: parseInt(document.getElementById('piece-quantity').value, 10),
    width_formula: document.getElementById('piece-width-formula').value.trim(),
    height_formula: document.getElementById('piece-height-formula').value.trim(),
    depth_formula: document.getElementById('piece-depth-formula').value.trim(),
    area_m2_formula: document.getElementById('piece-area-formula').value.trim(),
    edge_band_linear_m_formula: document.getElementById('piece-edge-formula').value.trim(),
    labor_cost_per_unit: parseFloat(document.getElementById('piece-labor').value),
    notes: document.getElementById('piece-notes').value.trim() || null
  };

  // Valida as fórmulas antes de salvar, usando dimensões de teste.
  try {
    Pricing.calculatePiece(payload, { W: 800, H: 2000, D: 560 });
  } catch (err) {
    showError('pieces-error', err);
    return;
  }

  const id = document.getElementById('piece-id').value || undefined;
  if (id) payload.id = id;
  const { error } = await supabaseClient.from('module_pieces').upsert(payload);
  if (error) { showError('pieces-error', error); return; }
  e.target.reset();
  document.getElementById('piece-id').value = '';
  document.getElementById('piece-quantity').value = 1;
  loadPieces();
});

// ---------- VÍNCULO MÓDULO x CORES ----------

async function renderModuleColorLinks() {
  const container = document.getElementById('module-colors-list');
  if (!selectedModuleId) { container.innerHTML = ''; return; }

  const { data: links, error } = await supabaseClient
    .from('module_colors')
    .select('color_id')
    .eq('module_id', selectedModuleId);
  if (error) { showError('pieces-error', error); return; }
  const linkedIds = new Set((links || []).map((l) => l.color_id));

  container.innerHTML = '';
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
        await supabaseClient.from('module_colors').upsert({ module_id: selectedModuleId, color_id: c.id });
      } else {
        await supabaseClient.from('module_colors').delete().eq('module_id', selectedModuleId).eq('color_id', c.id);
      }
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(c.name));
    container.appendChild(label);
  });
}

// ---------- CÁLCULO DE TESTE (conferência interna) ----------

document.getElementById('test-calc-form').addEventListener('submit', (e) => {
  e.preventDefault();
  runTestCalculation();
});

function runTestCalculation() {
  clearError('test-calc-error');
  const resultEl = document.getElementById('test-calc-result');
  if (!selectedModuleId || piecesCache.length === 0) {
    resultEl.innerHTML = '<p class="hint">Cadastre ao menos uma peça para testar o cálculo.</p>';
    return;
  }
  const module = modulesCache.find((m) => m.id === selectedModuleId);
  const colorId = document.getElementById('test-calc-color').value;
  const color = colorsCache.find((c) => c.id === colorId) || colorsCache[0];
  if (!color) {
    resultEl.innerHTML = '<p class="hint">Cadastre ao menos uma cor para testar o cálculo.</p>';
    return;
  }

  const width_mm = parseFloat(document.getElementById('test-calc-width').value) || module.width_default_mm;
  const height_mm = parseFloat(document.getElementById('test-calc-height').value) || module.height_default_mm;
  const depth_mm = parseFloat(document.getElementById('test-calc-depth').value) || module.depth_default_mm;

  try {
    const result = Pricing.calculateModulePrice({ module, pieces: piecesCache, color, width_mm, height_mm, depth_mm });
    let rows = result.breakdown.map((p) => `
      <tr>
        <td>${p.reference} (x${p.quantity})</td>
        <td>${p.width_mm.toFixed(0)} x ${p.height_mm.toFixed(0)} x ${p.depth_mm.toFixed(0)} mm</td>
        <td>${p.area_m2.toFixed(3)} m²</td>
        <td>${p.edge_band_m.toFixed(2)} m</td>
        <td>R$ ${p.sheet_cost.toFixed(2)}</td>
        <td>R$ ${p.edge_cost.toFixed(2)}</td>
        <td>R$ ${p.labor_cost.toFixed(2)}</td>
        <td><strong>R$ ${p.piece_total.toFixed(2)}</strong></td>
      </tr>
    `).join('');
    resultEl.innerHTML = `
      <table>
        <thead><tr><th>Peça</th><th>Dimensões</th><th>Chapa</th><th>Fita</th><th>Custo chapa</th><th>Custo fita</th><th>Mão de obra</th><th>Total peça</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="total-price">Total do módulo pai: R$ ${result.total.toFixed(2)}</p>
      <p class="hint">Esta é a única visão com breakdown por peça — o cliente vê apenas o total.</p>
    `;
  } catch (err) {
    showError('test-calc-error', err);
    resultEl.innerHTML = '';
  }
}

// Popula o select de cor do teste sempre que colorsCache mudar.
const _origLoadColors = loadColors;
loadColors = async function () {
  await _origLoadColors();
  const sel = document.getElementById('test-calc-color');
  const prev = sel.value;
  sel.innerHTML = '';
  colorsCache.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
};

// ---------- INIT ----------

(async function init() {
  document.getElementById('color-active').checked = true;
  document.getElementById('module-active').checked = true;
  document.getElementById('piece-quantity').value = 1;
  await loadColors();
  await loadModules();
})();
