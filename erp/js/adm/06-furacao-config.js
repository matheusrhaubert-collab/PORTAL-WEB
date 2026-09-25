/* Painel admin — Configurações de furação
 *
 * Pedaço 7/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

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
  // migration 163 — profundidade máxima do contra-furo que cai numa FACE
  // (pino Ø8 da base na face da lateral). Ver Drilling.collectCounterHoles.
  document.getElementById('drilling-counter-face-depth').value = s.counter_face_depth_mm ?? 12;
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
ADM.aoAbrir('tab-drilling-settings', loadDrillingSettingsTab);

document.getElementById('drilling-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('drilling-settings-error');
  const statusEl = document.getElementById('drilling-settings-status');
  statusEl.textContent = '';
  const val = (id) => parseFloat(document.getElementById(id).value);
  const payload = {
    touch_tolerance_mm: val('drilling-touch-tolerance'),
    counter_face_depth_mm: val('drilling-counter-face-depth'),
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
