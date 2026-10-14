// ============================================================
// MAPA DE CALOR DE PREÇO — no próprio 3D (2026-10-13)
// ============================================================
// Pedido do Matt: "uma vista térmica por preço de cada item: mais vermelho
// onde o ft²/m² é mais caro pra cobrir a área, proporcional aos demais, do
// vermelho ao verde. beeem visual, ajuda a dar foco no que realmente
// importa. quero mostrar que um módulo pequeno é muito mais caro do que um
// grande."
//
// Métrica: preço do módulo (como o gerente de conta vê) ÷ área de frente
// coberta (largura × altura) = $/ft² (ou $/m² em mm). Escala relativa ao
// projeto: o mais barato por área fica verde, o mais caro vermelho, o meio
// amarelo. Painel/filler (largura < 100 mm) e decoração ficam cinza — não
// são decisão.
//
// Como pinta: troca o material de cada mesh do módulo por um Lambert da cor
// do calor (guarda o original em userData pra devolver), e põe um rótulo
// "$/ft²" flutuando no meio do módulo (sprite, mesmo makeProjectDimTextSprite
// da Vista com Cotas). A cena é reconstruída a cada render
// (renderFreeformWalls), então reaplica no mesmo hook de Camadas
// (applyProjectHeatmap chamado em renderProjectCanvasFrontCorner, portal-06c).
// Botão: grupo IA Services. Só administrador (mesma lista dos outros).

let projectHeatmapOn = false;
let projectHeatmapSprites = [];
const HEAT_LAYER = 'mapa-calor';

function hmIsInch() { return ((document.getElementById('po-unit-select') || {}).value || 'mm') === 'in'; }
function hmMoney(v) { return '$' + Math.round(Number(v) || 0).toLocaleString('en-US'); }
function hmAreaFt2(s) { return (Number(s.width_mm) * Number(s.height_mm)) / (304.8 * 304.8); }
function hmFmtPerArea(perFt2) { return hmIsInch() ? hmMoney(perFt2) + '/ft²' : hmMoney(perFt2 / 0.092903) + '/m²'; }
function hmFmtArea(ft2) { return hmIsInch() ? (Math.round(ft2 * 10) / 10) + ' ft²' : (Math.round(ft2 * 0.092903 * 100) / 100) + ' m²'; }

// verde (0) → amarelo (0.5) → vermelho (1)
function hmColor(t) {
  t = Math.max(0, Math.min(1, t));
  const a = t < 0.5 ? [46, 158, 91] : [232, 170, 30];
  const b = t < 0.5 ? [232, 170, 30] : [200, 40, 40];
  const u = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * u));
  return { hex: (c[0] << 16) | (c[1] << 8) | c[2], css: 'rgb(' + c.join(',') + ')' };
}

// Dados do mapa: um item por módulo precificado.
function projectHeatmapData() {
  const slots = (projectSlots || []).filter((s) => s.module && !s.module.visual_only && s.result);
  const base = slots.reduce((a, s) => a + (Number(s.result.total) || 0), 0);
  const k = base > 0 ? getDisplayPrice(base) / base : 1;
  const items = slots.map((s) => {
    const price = (Number(s.result.total) || 0) * k;
    const area = hmAreaFt2(s);
    const skip = s.module.is_decoration || Number(s.width_mm) < 100 || area <= 0 || price <= 0;
    return { slot: s, price, area, perFt2: skip ? null : price / area, skip };
  });
  const vals = items.filter((i) => !i.skip).map((i) => i.perFt2);
  const min = vals.length ? Math.min(...vals) : 0, max = vals.length ? Math.max(...vals) : 0;
  const avg = base > 0 ? (base * k) / Math.max(items.reduce((a, i) => a + (i.skip ? 0 : i.area), 0), 0.01) : 0;
  items.forEach((i) => { i.t = (i.skip || max <= min) ? null : (i.perFt2 - min) / (max - min); });
  return { items, min, max, avg, total: base * k };
}

function clearProjectHeatmap() {
  const scene = (typeof projectEditScene === 'function') ? projectEditScene() : null;
  if (!scene) return;
  scene.traverse((o) => {
    if (o.isMesh && o.userData && o.userData._heatOrig) { o.material = o.userData._heatOrig; delete o.userData._heatOrig; }
  });
  projectHeatmapSprites.forEach((sp) => { scene.remove(sp); try { sp.material.map.dispose(); sp.material.dispose(); } catch (e) { /* ok */ } });
  projectHeatmapSprites = [];
  const legend = document.getElementById('po-proj-heatmap-legend');
  if (legend) legend.style.display = 'none';
}

// Reaplica no estado atual da cena (idempotente — chamada depois de cada
// render e no toggle).
function applyProjectHeatmap() {
  const scene = (typeof projectEditScene === 'function') ? projectEditScene() : null;
  if (!scene || typeof THREE === 'undefined') return;
  // a cena pode ter sido reconstruída: sprites antigos já não estão nela
  projectHeatmapSprites = [];
  if (!projectHeatmapOn) { clearProjectHeatmap(); return; }
  const data = projectHeatmapData();
  const byId = new Map(data.items.map((i) => [i.slot.id, i]));
  scene.children.forEach((g) => {
    const ud = g.userData || {};
    if (ud.slotId == null) return;
    const it = byId.get(ud.slotId);
    if (!it) return;
    const col = it.t == null ? { hex: 0xb9b4ac } : hmColor(it.t);
    g.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (!o.userData._heatOrig) o.userData._heatOrig = o.material;
      o.material = new THREE.MeshLambertMaterial({ color: col.hex, transparent: false });
    });
    if (it.t != null) {
      const box = new THREE.Box3().setFromObject(g);
      if (!box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        const h = Math.min(0.14, Math.max(0.07, (box.max.x - box.min.x) * 0.12));
        const spr = makeProjectDimTextSprite(hmFmtPerArea(it.perFt2), h);
        spr.position.copy(c);
        spr.userData.legnoLayer = HEAT_LAYER;
        scene.add(spr);
        projectHeatmapSprites.push(spr);
      }
    }
  });
  renderProjectHeatmapLegend(data);
}

function ensureProjectHeatmapLegend() {
  let el = document.getElementById('po-proj-heatmap-legend');
  if (el) return el;
  const wrap = document.getElementById('po-proj-canvas-3d-edit-wrap');
  if (!wrap) return null;
  el = document.createElement('div');
  el.id = 'po-proj-heatmap-legend';
  el.className = 'po-heatmap-legend';
  wrap.appendChild(el);
  return el;
}

function renderProjectHeatmapLegend(data) {
  const el = ensureProjectHeatmapLegend();
  if (!el) return;
  const t = (k, v) => I18n.t('heatmap.' + k, v);
  const ranked = data.items.filter((i) => !i.skip).sort((a, b) => b.perFt2 - a.perFt2);
  const nums = (typeof projectSlotsOrderSequence === 'function') ? new Map(projectSlotsOrderSequence().map((e) => [e.slot.id, e.numero])) : new Map();
  const row = (i) => '<li><i style="background:' + hmColor(i.t).css + '"></i><span>' + (nums.get(i.slot.id) != null ? '#' + nums.get(i.slot.id) + ' ' : '') + hmFmtArea(i.area) + '</span><b>' + hmFmtPerArea(i.perFt2) + '</b></li>';
  el.innerHTML = '<div class="po-heatmap-title">' + t('title') + '</div>'
    + '<div class="po-heatmap-bar"></div>'
    + '<div class="po-heatmap-ends"><span>' + hmFmtPerArea(data.min) + '</span><span>' + t('avg') + ' ' + hmFmtPerArea(data.avg) + '</span><span>' + hmFmtPerArea(data.max) + '</span></div>'
    + '<ul class="po-heatmap-list">' + ranked.slice(0, 3).map(row).join('') + (ranked.length > 6 ? '<li class="po-heatmap-sep">…</li>' : '') + ranked.slice(-3).filter((i) => ranked.indexOf(i) >= 3).map(row).join('') + '</ul>'
    + '<p class="po-heatmap-hint">' + t('hint') + '</p>';
  el.style.display = 'block';
}

function toggleProjectHeatmap(on) {
  projectHeatmapOn = on == null ? !projectHeatmapOn : !!on;
  const btn = document.getElementById('po-proj-heatmap-btn');
  if (btn) btn.classList.toggle('active', projectHeatmapOn);
  applyProjectHeatmap();
}

(function attachProjectHeatmapBtn() {
  const btn = document.getElementById('po-proj-heatmap-btn');
  if (btn) btn.addEventListener('click', () => toggleProjectHeatmap());
})();
