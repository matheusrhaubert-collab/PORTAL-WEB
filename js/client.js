// Calculadora do cliente — LEGNO PORTAL WEB
// O cliente escolhe módulo, cor e dimensões. Só o PREÇO TOTAL do módulo pai
// é exibido — o breakdown por peça fica só no painel admin.

let modules = [];
let pieces = [];
let colors = [];
let currentModule = null;

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

async function loadModules() {
  const { data, error } = await supabaseClient.from('modules').select('*').eq('active', true).order('name');
  if (error) { showError('Erro ao carregar módulos: ' + error.message); return; }
  modules = data;
  const sel = document.getElementById('module-select');
  sel.innerHTML = '<option value="">— escolha um módulo —</option>';
  modules.forEach((m) => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    sel.appendChild(opt);
  });
}

document.getElementById('module-select').addEventListener('change', async (e) => {
  const id = e.target.value;
  if (!id) {
    document.getElementById('config-section').style.display = 'none';
    return;
  }
  currentModule = modules.find((m) => m.id === id);
  await loadModuleColors(id);
  await loadModulePieces(id);
  setupDimensionInputs();
  document.getElementById('module-description').textContent = currentModule.description || '';
  document.getElementById('config-section').style.display = 'block';
  recalculate();
});

async function loadModuleColors(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_colors')
    .select('color_id, colors(*)')
    .eq('module_id', moduleId);
  if (error) { showError('Erro ao carregar cores: ' + error.message); return; }
  colors = (data || []).map((row) => row.colors).filter((c) => c && c.active);
  const sel = document.getElementById('color-select');
  sel.innerHTML = '';
  colors.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
}

async function loadModulePieces(moduleId) {
  const { data, error } = await supabaseClient
    .from('module_pieces')
    .select('*')
    .eq('module_id', moduleId)
    .order('sort_order');
  if (error) { showError('Erro ao carregar configuração do módulo: ' + error.message); return; }
  pieces = data;
}

function setupDimensionInputs() {
  const w = document.getElementById('width-input');
  const h = document.getElementById('height-input');
  const d = document.getElementById('depth-input');
  w.min = currentModule.width_min_mm; w.max = currentModule.width_max_mm; w.value = currentModule.width_default_mm;
  h.min = currentModule.height_min_mm; h.max = currentModule.height_max_mm; h.value = currentModule.height_default_mm;
  d.min = currentModule.depth_min_mm; d.max = currentModule.depth_max_mm; d.value = currentModule.depth_default_mm;
  document.getElementById('width-range').textContent = `(${currentModule.width_min_mm}–${currentModule.width_max_mm} mm)`;
  document.getElementById('height-range').textContent = `(${currentModule.height_min_mm}–${currentModule.height_max_mm} mm)`;
  document.getElementById('depth-range').textContent = `(${currentModule.depth_min_mm}–${currentModule.depth_max_mm} mm)`;
}

['width-input', 'height-input', 'depth-input', 'color-select'].forEach((id) => {
  document.getElementById(id).addEventListener('input', recalculate);
});

let lastResult = null;

function recalculate() {
  clearError();
  if (!currentModule || colors.length === 0 || pieces.length === 0) return;

  const width_mm = clamp(parseFloat(document.getElementById('width-input').value), currentModule.width_min_mm, currentModule.width_max_mm);
  const height_mm = clamp(parseFloat(document.getElementById('height-input').value), currentModule.height_min_mm, currentModule.height_max_mm);
  const depth_mm = clamp(parseFloat(document.getElementById('depth-input').value), currentModule.depth_min_mm, currentModule.depth_max_mm);

  const colorId = document.getElementById('color-select').value;
  const color = colors.find((c) => c.id === colorId) || colors[0];
  if (!color) return;

  try {
    // Cálculo local (mesma fórmula do admin). Peças/preços vêm do banco;
    // nada é exposto ao cliente além do total.
    const result = Pricing.calculateModulePrice({ module: currentModule, pieces, color, width_mm, height_mm, depth_mm });
    lastResult = result;
    document.getElementById('total-price').textContent = 'R$ ' + result.total.toFixed(2);
    document.getElementById('price-section').style.display = 'block';
  } catch (err) {
    showError('Não foi possível calcular o preço para essas medidas: ' + err.message);
    document.getElementById('price-section').style.display = 'none';
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
    color_id: document.getElementById('color-select').value,
    width_mm: lastResult.width_mm,
    height_mm: lastResult.height_mm,
    depth_mm: lastResult.depth_mm,
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

(async function init() {
  await loadModules();
})();
