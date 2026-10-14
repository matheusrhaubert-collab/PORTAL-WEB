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
// 'area' = $/ft² de área coberta; 'share' = % do total do projeto (13/10, 2ª
// rodada: "outro infravermelho pra percentual do móvel e painéis")
let projectHeatmapMode = 'area';
let projectHeatmapSprites = [];
const HEAT_LAYER = 'mapa-calor';

function hmIsInch() { return ((document.getElementById('po-unit-select') || {}).value || 'mm') === 'in'; }
function hmMoney(v) { return '$' + Math.round(Number(v) || 0).toLocaleString('en-US'); }
function hmAreaFt2(s) { return (Number(s.width_mm) * Number(s.height_mm)) / (304.8 * 304.8); }
function hmFmtPerArea(perFt2) { return hmIsInch() ? hmMoney(perFt2) + '/ft²' : hmMoney(perFt2 / 0.092903) + '/m²'; }
function hmFmtArea(ft2) { return hmIsInch() ? (Math.round(ft2 * 10) / 10) + ' ft²' : (Math.round(ft2 * 0.092903 * 100) / 100) + ' m²'; }

// verde (0) → amarelo (0.5) → vermelho (1)
// Material do calor: SEM luz (MeshBasic — as luzes da cena estouram cor clara
// pra branco) e com a cor convertida pra linear (o renderer sai em sRGB e
// clareava tudo: laranja virava bege, cinza virava branco). As arestas
// pretas das peças continuam dando o volume.
function hmMaterial(hex) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).convertSRGBToLinear() });
}
// papel de cor da peça: a tag mora no Object3D PAI do mesh (tagPieceUserData)
// Mesh que NÃO deve ser pintado: a caixa invisível de clique (isHitboxProxy,
// opacity 0, do tamanho do módulo — pintada opaca ela cobre o móvel inteiro)
// e qualquer material totalmente transparente.
function hmSkipMesh(o) {
  if (o.userData && o.userData.isHitboxProxy) return true;
  const m = (o.userData && o.userData._heatOrig) || o.material;
  const list = Array.isArray(m) ? m : [m];
  return list.every((x) => x && x.transparent && Number(x.opacity) === 0);
}
function hmRoleOf(o, top) {
  let p = o;
  while (p && p !== top) { if (p.userData && p.userData.colorRoleId) return p.userData.colorRoleId; p = p.parent; }
  return null;
}
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
  const total = base * k;
  const items = slots.map((s) => {
    const price = (Number(s.result.total) || 0) * k;
    const area = hmAreaFt2(s);
    // no modo % o painel/filler ENTRA (é o que o Matt quer ver: "painel 1%")
    const skip = s.module.is_decoration || price <= 0 || (projectHeatmapMode === 'area' && (Number(s.width_mm) < 100 || area <= 0));
    const share = total > 0 ? price / total : 0;
    return { slot: s, price, area, share, perFt2: skip ? null : price / Math.max(area, 0.01), skip, metric: skip ? null : (projectHeatmapMode === 'share' ? share : price / Math.max(area, 0.01)) };
  });
  const vals = items.filter((i) => !i.skip).map((i) => i.metric);
  const min = vals.length ? Math.min(...vals) : 0, max = vals.length ? Math.max(...vals) : 0;
  const avg = base > 0 ? (base * k) / Math.max(items.reduce((a, i) => a + (i.skip ? 0 : i.area), 0), 0.01) : 0;
  items.forEach((i) => { i.t = (i.skip || max <= min) ? null : (i.metric - min) / (max - min); });
  return { items, min, max, avg, total, mode: projectHeatmapMode };
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
  if (projectHeatmapMode === 'colors') { applyProjectHeatmapColors(scene); return; }
  const data = projectHeatmapData();
  const byId = new Map(data.items.map((i) => [i.slot.id, i]));
  scene.children.forEach((g) => {
    const ud = g.userData || {};
    if (ud.slotId == null) return;
    const it = byId.get(ud.slotId);
    if (!it) return;
    const col = it.t == null ? { hex: 0xb9b4ac } : hmColor(it.t);
    g.traverse((o) => {
      if (!o.isMesh || !o.material || hmSkipMesh(o)) return;
      if (!o.userData._heatOrig) o.userData._heatOrig = o.material;
      o.material = hmMaterial(col.hex);
    });
    // sem rótulo em cima do módulo (13/10, Matt: "pode remover as tags, só as cores já ajudam muito")
  });
  renderProjectHeatmapLegend(data);
}

// MODO CORES × LINHA (13/10, 3ª rodada, Matt: "comparando os preços das
// cores de fora do projeto com o projeto, do vermelho ao verde, do mais caro
// ao mais barato. tudo mais caro = projeto todo vermelho; mais barato = todo
// verde. separar portas, frentes e caixas"). Cada PEÇA é pintada pela
// posição da cor escolhida pro papel dela (Caixa, Porta/Frente, Painel…)
// dentro da faixa de preço de chapa que o módulo aceita naquele papel —
// então a porta e a caixa do mesmo módulo saem com cores diferentes. "Especial"
// fica fora da faixa.
const HM_EXCLUDE_RE = /especial|special/i;
function hmColorOk(c) { return !!c && c.active !== false && !HM_EXCLUDE_RE.test(String(c.name || '')); }
function hmSheetPrice(c) { return Number(c && c.sheet_price_per_m2) || 0; }
function applyProjectHeatmapColors(scene) {
  const slotById = new Map((projectSlots || []).map((s) => [s.id, s]));
  const roleStats = new Map(); // roleId -> { name, uses: Map(colorId -> {color, n, t}) }
  scene.children.forEach((g) => {
    const ud = g.userData || {};
    if (ud.slotId == null) return;
    const slot = slotById.get(ud.slotId);
    if (!slot || !slot.module || slot.module.visual_only) return;
    const decor = !!slot.module.is_decoration;
    g.traverse((o) => {
      if (!o.isMesh || !o.material || hmSkipMesh(o)) return;
      let hex = 0xb9b4ac;
      const rid = hmRoleOf(o, scene);
      if (!decor && rid) {
        const cur = slot.colorsByRole && slot.colorsByRole[rid];
        const opts = ((slot.colorOptionsByRole || {})[rid] || []).filter(hmColorOk);
        if (cur && opts.length) {
          const prices = opts.map(hmSheetPrice);
          const min = Math.min(...prices), max = Math.max(...prices);
          const t = max > min ? (hmSheetPrice(cur) - min) / (max - min) : 0;
          hex = hmColor(Math.max(0, Math.min(1, t))).hex;
          const rs = roleStats.get(rid) || { name: ((colorRolesCache || []).find((r) => r.id === rid) || {}).name || '', uses: new Map(), min, max };
          rs.min = Math.min(rs.min, min); rs.max = Math.max(rs.max, max);
          const u = rs.uses.get(cur.id) || { color: cur, n: 0, t };
          u.n++; rs.uses.set(cur.id, u); roleStats.set(rid, rs);
        }
      }
      if (!o.userData._heatOrig) o.userData._heatOrig = o.material;
      o.material = hmMaterial(hex);
    });
  });
  renderProjectHeatmapColorsLegend(roleStats);
}
function renderProjectHeatmapColorsLegend(roleStats) {
  const el = ensureProjectHeatmapLegend();
  if (!el) return;
  const t = (k, v) => I18n.t('heatmap.' + k, v);
  const m2 = (v) => hmIsInch() ? hmMoney(v / 10.7639) + '/ft²' : hmMoney(v) + '/m²';
  const rows = [...roleStats.values()].map((rs) => {
    const uses = [...rs.uses.values()].sort((a, b) => b.n - a.n);
    return '<li class="po-heatmap-role"><b>' + rs.name + '</b><span class="po-heatmap-range">' + m2(rs.min) + ' – ' + m2(rs.max) + '</span>'
      + uses.map((u) => '<span class="po-heatmap-use"><i style="background:' + hmColor(u.t).css + '"></i>' + u.color.name + ' · ' + m2(hmSheetPrice(u.color)) + '</span>').join('') + '</li>';
  }).join('');
  el.innerHTML = '<div class="po-heatmap-title">' + t('title_colors') + '</div>'
    + '<div class="po-heatmap-bar"></div>'
    + '<div class="po-heatmap-ends"><span>' + t('colors_cheapest') + '</span><span>' + t('colors_priciest') + '</span></div>'
    + '<ul class="po-heatmap-list po-heatmap-roles">' + rows + '</ul>'
    + '<p class="po-heatmap-hint">' + t('hint_colors') + '</p>';
  el.style.display = 'block';
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
  const share = data.mode === 'share';
  const fmt = (v) => share ? (Math.round(v * 1000) / 10) + '%' : hmFmtPerArea(v);
  const ranked = data.items.filter((i) => !i.skip).sort((a, b) => b.metric - a.metric);
  const nums = (typeof projectSlotsOrderSequence === 'function') ? new Map(projectSlotsOrderSequence().map((e) => [e.slot.id, e.numero])) : new Map();
  const row = (i) => '<li><i style="background:' + hmColor(i.t).css + '"></i><span>' + (nums.get(i.slot.id) != null ? '#' + nums.get(i.slot.id) + ' ' : '') + (share ? hmMoney(i.price) : hmFmtArea(i.area)) + '</span><b>' + fmt(i.metric) + '</b></li>';
  const mid = share ? t('total') + ' ' + hmMoney(data.total) : t('avg') + ' ' + hmFmtPerArea(data.avg);
  const n = share ? ranked.length : 6;
  el.innerHTML = '<div class="po-heatmap-title">' + t(share ? 'title_share' : 'title') + '</div>'
    + '<div class="po-heatmap-bar"></div>'
    + '<div class="po-heatmap-ends"><span>' + fmt(data.min) + '</span><span>' + mid + '</span><span>' + fmt(data.max) + '</span></div>'
    + '<ul class="po-heatmap-list">' + (share ? ranked.map(row).join('') : ranked.slice(0, 3).map(row).join('') + (ranked.length > 6 ? '<li class="po-heatmap-sep">…</li>' : '') + ranked.slice(-3).filter((i) => ranked.indexOf(i) >= 3).map(row).join('')) + '</ul>'
    + '<p class="po-heatmap-hint">' + t(share ? 'hint_share' : 'hint') + '</p>';
  el.style.display = 'block';
}

function setProjectHeatmapMode(mode) {
  // mode: 'off' | 'area' | 'share'
  projectHeatmapOn = mode !== 'off';
  if (projectHeatmapOn) projectHeatmapMode = mode;
  const btn = document.getElementById('po-proj-heatmap-btn');
  if (btn) btn.classList.toggle('active', projectHeatmapOn);
  document.querySelectorAll('#po-proj-heatmap-list .po-heatmap-item').forEach((el) => el.classList.toggle('active', el.dataset.mode === (projectHeatmapOn ? projectHeatmapMode : 'off')));
  applyProjectHeatmap();
}
function toggleProjectHeatmap(on) { setProjectHeatmapMode((on == null ? !projectHeatmapOn : !!on) ? projectHeatmapMode : 'off'); }

// Botão + lista (mesmo padrão de Camadas: montaMenuCamadas + attachFloatingDropdown)
(function montaMenuMapaCalor() {
  const raiz = document.getElementById('po-proj-heatmap-menu');
  if (!raiz || typeof attachFloatingDropdown !== 'function') return;
  const t = (k) => I18n.t('heatmap.' + k);
  raiz.innerHTML = '<button type="button" class="po-tb-icon-card po-tb-icon-only" id="po-proj-heatmap-btn" title="' + t('btn_title') + '" aria-label="' + t('btn') + '">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c2.5 3 5 5.2 5 9a5 5 0 0 1-10 0c0-1.6.5-2.8 1.3-4 .6 1.2 1.4 1.8 2.2 2 0-2.5.5-5 1.5-7z"/><path d="M3 21h18"/></svg>'
    + '<span>' + t('btn') + '</span><i class="po-tb-dot"></i></button>'
    + '<div class="po-style-list po-layers-list" id="po-proj-heatmap-list">'
    + [['off', 'mode_off'], ['area', 'mode_area'], ['share', 'mode_share'], ['colors', 'mode_colors']].map(([m, k]) =>
      '<button type="button" class="po-style-item po-heatmap-item' + (m === 'off' ? ' active' : '') + '" data-mode="' + m + '">' + t(k) + '</button>').join('')
    + '</div>';
  const btn = raiz.querySelector('#po-proj-heatmap-btn');
  const lista = raiz.querySelector('#po-proj-heatmap-list');
  attachFloatingDropdown(raiz, btn, lista);
  lista.querySelectorAll('.po-heatmap-item').forEach((el) => el.addEventListener('click', () => { setProjectHeatmapMode(el.dataset.mode); raiz.classList.remove('aberto'); lista.style.display = 'none'; }));
})();
