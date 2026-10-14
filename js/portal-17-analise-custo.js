// ============================================================
// ANÁLISE DE CUSTO — IA Services, aba Projetos (2026-10-13) — ETAPA 1
// ============================================================
// Pedido do Matt: "um botão que faça uma análise de custos do projeto. mostrar
// em porcentagem de cada módulo (com seus configurados) e considerar quanto
// ficaria com uma cor mais barata e mais cara da linha, tipo um dashboard
// gerencial do projeto. onde daria pra reduzir o preço [...] diminuir peças
// que ficam escondidas, como caixas, trocar pra cores mais baratas [...]
// colocar o budget e buscar modificações no projeto pra chegar nesse budget.
// tem que ser simples e que o vendedor use como ferramenta de fechamento."
// Decisões (13/10): preço como o gerente de conta vê (getDisplayPrice, com a
// margem dele); só administrador por enquanto; a versão econômica/premium é
// SALVA COMO PROJETO NOVO (o aberto não muda).
//
// NADA aqui é chute de IA: cada número vem de SIMULAR a troca no motor de
// preço de verdade (applyColorToProjectSlot + recomputeProjectSlotPricing)
// e voltar atrás. Cores ordenadas por preço de chapa (sheet_price_per_m2)
// + fita. Papel "escondido" = tudo que não é frente (Caixa, Rod…): a
// sugestão de economia começa por eles — o cliente não vê de fora.
// ETAPA 2 (combinado): lateral encostada → filler, acessórios, texto da IA.

let costPlanState = null;   // última análise
let costPlanRunning = false;
const COST_FRONT_ROLE_RE = /porta|frente|door|front|puerta|frente/i;

function tCost(k, vars) { return I18n.t('cost_plan.' + k, vars); }
function cpEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function cpMoney(v) { return '$' + Math.round(Number(v) || 0).toLocaleString('en-US'); }
function cpSleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function cpColorRank(c) { return (Number(c.sheet_price_per_m2) || 0) * 1000 + (Number(c.edge_price_per_linear_m) || 0); }
function cpRoleName(rid) { return ((colorRolesCache || []).find((r) => r.id === rid) || {}).name || ''; }
function cpIsFrontRole(rid) { return COST_FRONT_ROLE_RE.test(cpRoleName(rid)); }
function cpSlotLabel(s) {
  const un = (document.getElementById('po-unit-select') || {}).value || 'mm';
  return s.module.name + ' · ' + formatDimension(s.width_mm, un) + ' × ' + formatDimension(s.height_mm, un);
}
function cpIsInch() { return ((document.getElementById('po-unit-select') || {}).value || 'mm') === 'in'; }
// $/ft em polegada, $/m em mm — mesma régua interna (ft), só o rótulo muda
function cpPerLen(perFt) { return perFt == null ? '—' : (cpIsInch() ? cpMoney(perFt) + '/ft' : cpMoney(perFt / 0.3048) + '/m'); }
function cpLen(ft) { return cpIsInch() ? (Math.round(ft * 10) / 10) + ' ft' : (Math.round(ft * 0.3048 * 100) / 100) + ' m'; }
function cpWallName(w) { return w === 'floor' ? tCost('wall_floor') : I18n.t('proposal.wall_label', { n: Number(w) + 1 }); }
function cpSlots() { return (projectSlots || []).filter((s) => s.module && !s.module.visual_only && !s.module.is_decoration && s.result); }
function cpSumSlots(slots) { return slots.reduce((a, s) => a + (Number(s.result && s.result.total) || 0), 0); }

// ---------- simulação ----------
// Devolve, por slot e papel, quanto o total do projeto muda trocando pra
// cor mais barata e pra mais cara do papel — simulando de verdade e
// voltando. k = fator "fábrica → preço do dealer".
async function costPlanAnalyze() {
  try { if (typeof ensureProjectDrillingCatalog === 'function') await ensureProjectDrillingCatalog(); } catch (e) { /* segue */ }
  try { if (typeof repriceAllProjectSlots === 'function') repriceAllProjectSlots(); } catch (e) { /* segue */ }
  const slots = cpSlots();
  const base = cpSumSlots(slots);
  const k = base > 0 ? (getDisplayPrice(base) / base) : 1;
  const nums = (typeof projectSlotsOrderSequence === 'function') ? new Map(projectSlotsOrderSequence().map((e) => [e.slot.id, e.numero])) : new Map();
  const mods = [];
  const moves = []; // trocas possíveis
  for (const s of slots) {
    const t0 = Number(s.result.total) || 0;
    const bd = s.result.breakdown || [];
    const sum = (key) => bd.reduce((a, p) => a + (Number(p[key]) || 0), 0);
    const parts = { sheet: sum('sheet_cost') + sum('edge_cost'), labor: sum('labor_cost'), hardware: sum('hinge_cost') + sum('slide_cost') + sum('purchased_cost') };
    const roles = [];
    for (const rid of Object.keys(s.colorOptionsByRole || {})) {
      const opts = (s.colorOptionsByRole[rid] || []).slice().sort((a, b) => cpColorRank(a) - cpColorRank(b));
      const cur = s.colorsByRole && s.colorsByRole[rid];
      if (!opts.length || !cur) continue;
      const cheapest = opts[0], priciest = opts[opts.length - 1];
      let dMin = 0, dMax = 0;
      if (cheapest.id !== cur.id) { applyColorToProjectSlot(s, rid, cheapest); recomputeProjectSlotPricing(s); dMin = (Number(s.result.total) || 0) - t0; }
      if (priciest.id !== cur.id) { applyColorToProjectSlot(s, rid, priciest); recomputeProjectSlotPricing(s); dMax = (Number(s.result.total) || 0) - t0; }
      applyColorToProjectSlot(s, rid, cur); recomputeProjectSlotPricing(s);
      const front = cpIsFrontRole(rid);
      roles.push({ rid, name: cpRoleName(rid), cur: cur.name, front, cheapest: cheapest.name, priciest: priciest.name, dMin: dMin * k, dMax: dMax * k });
      if (dMin < -0.5) moves.push({ kind: 'save', slotId: s.id, rid, role: cpRoleName(rid), front, from: cur.name, to: cheapest, toName: cheapest.name, delta: dMin * k, label: cpSlotLabel(s), num: nums.get(s.id) });
      if (dMax > 0.5) moves.push({ kind: 'up', slotId: s.id, rid, role: cpRoleName(rid), front, from: cur.name, to: priciest, toName: priciest.name, delta: dMax * k, label: cpSlotLabel(s), num: nums.get(s.id) });
    }
    // COBERTURA DE PAREDE (13/10, Matt: "a cobertura da parede por custo de
    // módulo é um fator relevante") — $ por pé/metro linear de parede que o
    // módulo ocupa. Painel/filler ficam fora do ranking (largura de 3/4" vira
    // $/ft absurdo sem significar nada).
    const widthFt = Number(s.width_mm) / 304.8;
    const narrow = Number(s.width_mm) < 100;
    mods.push({ id: s.id, num: nums.get(s.id), label: cpSlotLabel(s), total: t0 * k, pct: base > 0 ? t0 / base : 0,
      parts: { sheet: parts.sheet * k, labor: parts.labor * k, hardware: parts.hardware * k }, roles,
      widthFt, perFt: narrow ? null : (t0 * k) / Math.max(widthFt, 0.01),
      wall: isFloorSlot(s) ? 'floor' : String(Number(s.wall_index) || 0) });
    await cpSleep(0); // não trava a tela
  }
  mods.sort((a, b) => b.total - a.total);
  const display = base * k;
  const totFt = mods.reduce((a, m) => a + m.widthFt, 0);
  const avgPerFt = totFt > 0 ? display / totFt : 0;
  const walls = {};
  mods.forEach((m) => { walls[m.wall] = walls[m.wall] || { wall: m.wall, ft: 0, total: 0, n: 0 }; walls[m.wall].ft += m.widthFt; walls[m.wall].total += m.total; walls[m.wall].n++; });
  const wallRows = Object.values(walls).map((w) => Object.assign(w, { perFt: w.ft > 0 ? w.total / w.ft : 0 })).sort((a, b) => b.total - a.total);
  // "investimento alto pra parede que cobre": bem acima da média do projeto
  mods.forEach((m) => { m.hot = m.perFt != null && avgPerFt > 0 && m.perFt >= avgPerFt * 1.6; });
  const allMin = display + moves.filter((m) => m.kind === 'save').reduce((a, m) => a + m.delta, 0);
  const allMax = display + moves.filter((m) => m.kind === 'up').reduce((a, m) => a + m.delta, 0);
  const hiddenMin = display + moves.filter((m) => m.kind === 'save' && !m.front).reduce((a, m) => a + m.delta, 0);
  return { display, allMin, allMax, hiddenMin, mods, moves, k, avgPerFt, totFt, wallRows };
}

// Ordem das economias: escondidas primeiro (maior economia primeiro), depois
// frentes. Marca as necessárias até chegar no budget.
function costPlanBudgetPlan(st, budget) {
  const saves = st.moves.filter((m) => m.kind === 'save').sort((a, b) => (a.front - b.front) || (a.delta - b.delta));
  let running = st.display;
  const plan = saves.map((m) => {
    const need = budget > 0 && running > budget;
    if (need) running += m.delta;
    return Object.assign({}, m, { picked: need, after: running });
  });
  return { plan, reached: budget > 0 ? running <= budget : false, finalValue: running };
}

// ---------- UI ----------
function ensureCostPlanModal() {
  if (document.getElementById('po-cost-plan-modal')) return;
  const m = document.createElement('div');
  m.id = 'po-cost-plan-modal';
  m.className = 'po-dimview-modal po-cost-modal';
  m.innerHTML = '<div class="po-dimview-modal-backdrop" id="po-cost-plan-backdrop"></div>'
    + '<div class="po-dimview-modal-card po-cost-card">'
    + '<div class="po-dimview-modal-head"><span class="po-dimview-modal-title">' + tCost('title') + '</span>'
    + '<button type="button" class="po-dimview-modal-close" id="po-cost-plan-close" aria-label="×">×</button></div>'
    + '<div class="po-dimview-modal-body po-cost-body" id="po-cost-plan-body"></div></div>';
  document.body.appendChild(m);
  const fechar = () => { if (!costPlanRunning) m.classList.remove('aberto'); };
  document.getElementById('po-cost-plan-backdrop').addEventListener('click', fechar);
  document.getElementById('po-cost-plan-close').addEventListener('click', fechar);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.classList.contains('aberto')) fechar(); });
  const body = document.getElementById('po-cost-plan-body');
  body.addEventListener('click', onCostPlanClick);
  body.addEventListener('input', (e) => { if (e.target.id === 'po-cost-budget') renderCostPlanBudget(); });
  body.addEventListener('change', (e) => { if (e.target.classList.contains('po-cost-pick')) renderCostPlanBudgetTotals(); });
}

async function openCostPlanModal() {
  ensureCostPlanModal();
  const m = document.getElementById('po-cost-plan-modal');
  const body = document.getElementById('po-cost-plan-body');
  m.classList.add('aberto');
  if (!cpSlots().length) { body.innerHTML = '<p class="po-cost-empty">' + tCost('empty') + '</p>'; return; }
  if (costPlanRunning) return;
  costPlanRunning = true;
  body.innerHTML = '<p class="po-cost-empty">' + tCost('analyzing') + '</p>';
  try {
    costPlanState = await costPlanAnalyze();
    costPlanState.budget = 0;
    renderCostPlan();
  } catch (e) {
    console.error('[analise-custo]', e);
    body.innerHTML = '<p class="po-cost-empty erro">' + cpEsc((e && e.message) || String(e)) + '</p>';
  } finally {
    costPlanRunning = false;
    try { renderProjectCanvas(); } catch (e) { /* ok */ }
  }
}

function renderCostPlan() {
  const st = costPlanState;
  const body = document.getElementById('po-cost-plan-body');
  if (!st || !body) return;
  const bar = (v, max, cls) => '<div class="po-cost-bar"><i class="' + (cls || '') + '" style="width:' + Math.max(2, Math.round(100 * v / (max || 1))) + '%"></i></div>';
  // 1) faixa
  let h = '<section class="po-cost-sec"><h4>' + tCost('sec_range') + '</h4>'
    + '<div class="po-cost-range">'
    + '<div><span>' + tCost('range_min') + '</span><strong>' + cpMoney(st.allMin) + '</strong><small>' + tCost('range_min_hint') + '</small></div>'
    + '<div class="atual"><span>' + tCost('range_now') + '</span><strong>' + cpMoney(st.display) + '</strong><small>' + tCost('range_hidden_hint', { v: cpMoney(st.hiddenMin) }) + '</small></div>'
    + '<div><span>' + tCost('range_max') + '</span><strong>' + cpMoney(st.allMax) + '</strong><small>' + tCost('range_max_hint') + '</small></div>'
    + '</div></section>';
  // 1b) cobertura por parede
  h += '<section class="po-cost-sec"><h4>' + tCost('sec_walls') + '</h4>'
    + '<p class="po-cost-hint">' + tCost('walls_avg', { v: cpPerLen(st.avgPerFt), ft: cpLen(st.totFt) }) + '</p>'
    + '<table class="po-cost-walls"><thead><tr><th>' + tCost('col_wall') + '</th><th>' + tCost('col_len') + '</th><th>' + tCost('col_modules') + '</th><th>' + tCost('col_total') + '</th><th>' + tCost('col_perlen') + '</th></tr></thead><tbody>'
    + st.wallRows.map((w) => '<tr><td>' + cpEsc(cpWallName(w.wall)) + '</td><td>' + cpLen(w.ft) + '</td><td>' + w.n + '</td><td>' + cpMoney(w.total) + '</td><td class="' + (w.perFt >= st.avgPerFt * 1.3 ? 'hot' : '') + '">' + cpPerLen(w.perFt) + '</td></tr>').join('')
    + '</tbody></table></section>';
  // 2) módulos
  const maxT = Math.max(...st.mods.map((x) => x.total), 1);
  h += '<section class="po-cost-sec"><h4>' + tCost('sec_modules') + '</h4><div class="po-cost-mods">';
  st.mods.forEach((x) => {
    h += '<div class="po-cost-mod" data-slot="' + x.id + '"><div class="po-cost-mod-row">'
      + '<span class="po-cost-num">' + (x.num != null ? '#' + x.num : '') + '</span>'
      + '<span class="po-cost-name">' + cpEsc(x.label) + '</span>'
      + '<span class="po-cost-pct">' + Math.round(x.pct * 100) + '%</span>'
      + '<span class="po-cost-perft' + (x.hot ? ' hot' : '') + '" title="' + cpEsc(tCost('perlen_title')) + '">' + cpPerLen(x.perFt) + (x.hot ? ' ▲' : '') + '</span>'
      + '<span class="po-cost-val">' + cpMoney(x.total) + '</span></div>'
      + bar(x.total, maxT)
      + '<div class="po-cost-mod-detail">'
      + (x.hot ? '<p class="po-cost-hot-note">' + tCost('hot_note', { v: cpPerLen(x.perFt), avg: cpPerLen(st.avgPerFt), wall: cpEsc(cpWallName(x.wall)) }) + '</p>' : '')
      + '<div class="po-cost-parts">'
      + '<span>' + tCost('part_sheet') + ' <b>' + cpMoney(x.parts.sheet) + '</b></span>'
      + '<span>' + tCost('part_labor') + ' <b>' + cpMoney(x.parts.labor) + '</b></span>'
      + '<span>' + tCost('part_hardware') + ' <b>' + cpMoney(x.parts.hardware) + '</b></span></div>'
      + '<ul class="po-cost-roles">' + x.roles.map((r) => '<li><b>' + cpEsc(r.name) + '</b>: ' + cpEsc(r.cur)
        + (r.dMin < -0.5 ? ' · <span class="menos">' + cpMoney(r.dMin) + ' ' + tCost('with', { c: r.cheapest }) + '</span>' : '')
        + (r.dMax > 0.5 ? ' · <span class="mais">+' + cpMoney(r.dMax) + ' ' + tCost('with', { c: r.priciest }) + '</span>' : '')
        + '</li>').join('') + '</ul></div></div>';
  });
  h += '</div></section>';
  // 3) budget
  h += '<section class="po-cost-sec"><h4>' + tCost('sec_budget') + '</h4>'
    + '<div class="po-cost-budget-row"><label>' + tCost('budget_label') + ' <input type="number" id="po-cost-budget" min="0" step="100" placeholder="' + Math.round(st.display * 0.8) + '" value="' + (st.budget || '') + '" /></label>'
    + '<span id="po-cost-budget-msg"></span></div>'
    + '<div id="po-cost-budget-list"></div>'
    + '<div class="po-client-actions"><button type="button" class="po-btn-primary-block" id="po-cost-make-economy">' + tCost('make_economy') + '</button></div>'
    + '</section>';
  // 4) upsell
  const ups = st.moves.filter((m) => m.kind === 'up').sort((a, b) => b.delta - a.delta);
  const upsByColor = {};
  ups.forEach((m) => { const key = m.role + '→' + m.toName; upsByColor[key] = upsByColor[key] || { role: m.role, to: m.toName, delta: 0, n: 0 }; upsByColor[key].delta += m.delta; upsByColor[key].n++; });
  h += '<section class="po-cost-sec"><h4>' + tCost('sec_upsell') + '</h4><ul class="po-cost-ups">'
    + Object.values(upsByColor).sort((a, b) => b.delta - a.delta).slice(0, 6).map((u) =>
      '<li><span>' + tCost('up_line', { role: cpEsc(u.role), c: cpEsc(u.to), n: u.n }) + '</span><b>+' + cpMoney(u.delta) + '</b></li>').join('')
    + '</ul><p class="po-cost-hint">' + tCost('up_hint') + '</p>'
    + '<div class="po-client-actions"><button type="button" class="secondary" id="po-cost-make-premium">' + tCost('make_premium') + '</button></div></section>';
  // 5) resumo pro cliente
  h += '<section class="po-cost-sec"><h4>' + tCost('sec_summary') + '</h4><textarea id="po-cost-summary" rows="5" readonly></textarea>'
    + '<div class="po-client-actions"><button type="button" class="secondary" id="po-cost-copy">' + tCost('copy') + '</button></div></section>';
  body.innerHTML = h;
  renderCostPlanBudget();
}

function renderCostPlanBudget() {
  const st = costPlanState;
  const list = document.getElementById('po-cost-budget-list');
  if (!st || !list) return;
  st.budget = Number((document.getElementById('po-cost-budget') || {}).value) || 0;
  const { plan } = costPlanBudgetPlan(st, st.budget);
  if (!plan.length) { list.innerHTML = '<p class="po-cost-hint">' + tCost('no_saves') + '</p>'; renderCostPlanBudgetTotals(); return; }
  let html = '<ul class="po-cost-plan">';
  let lastFront = null;
  plan.forEach((m, i) => {
    if (m.front !== lastFront) { html += '<li class="po-cost-group">' + tCost(m.front ? 'group_front' : 'group_hidden') + '</li>'; lastFront = m.front; }
    html += '<li><label><input type="checkbox" class="po-cost-pick" data-i="' + i + '"' + (m.picked ? ' checked' : '') + ' />'
      + '<span>' + (m.num != null ? '#' + m.num + ' ' : '') + cpEsc(m.label) + ' — <b>' + cpEsc(m.role) + '</b>: ' + cpEsc(m.from) + ' → ' + cpEsc(m.toName) + '</span>'
      + '<em class="menos">' + cpMoney(m.delta) + '</em></label></li>';
  });
  html += '</ul>';
  list.innerHTML = html;
  st.plan = plan;
  renderCostPlanBudgetTotals();
}

function costPlanPicked() {
  const st = costPlanState;
  if (!st || !st.plan) return [];
  return Array.from(document.querySelectorAll('.po-cost-pick')).filter((c) => c.checked).map((c) => st.plan[Number(c.dataset.i)]).filter(Boolean);
}

function renderCostPlanBudgetTotals() {
  const st = costPlanState;
  const msg = document.getElementById('po-cost-budget-msg');
  if (!st || !msg) return;
  const picked = costPlanPicked();
  const saving = picked.reduce((a, m) => a + m.delta, 0);
  const after = st.display + saving;
  const b = st.budget;
  let txt = tCost('budget_result', { after: cpMoney(after), save: cpMoney(-saving) });
  let cls = '';
  if (b > 0) { if (after <= b) { txt += ' ✓ ' + tCost('budget_ok'); cls = 'ok'; } else { txt += ' · ' + tCost('budget_missing', { v: cpMoney(after - b) }); cls = 'falta'; } }
  msg.textContent = txt; msg.className = cls;
  const ta = document.getElementById('po-cost-summary');
  if (ta) ta.value = costPlanSummaryText(picked, after);
}

// Texto curto pro vendedor usar com o cliente (determinístico; a versão por
// IA fica pra etapa 2).
function costPlanSummaryText(picked, after) {
  const st = costPlanState;
  const nome = (typeof loadedProjectFavorite !== 'undefined' && loadedProjectFavorite && loadedProjectFavorite.name) || tCost('project');
  const hidden = picked.filter((m) => !m.front), front = picked.filter((m) => m.front);
  const lines = [tCost('sum_intro', { name: nome, now: cpMoney(st.display), min: cpMoney(st.allMin), max: cpMoney(st.allMax) })];
  if (picked.length) {
    lines.push(tCost('sum_after', { after: cpMoney(after), save: cpMoney(st.display - after) }));
    if (hidden.length) lines.push(tCost('sum_hidden', { n: hidden.length, c: hidden[0].toName }));
    if (front.length) lines.push(tCost('sum_front', { n: front.length, c: front[0].toName }));
  }
  const top = st.mods[0];
  if (top) lines.push(tCost('sum_top', { m: top.label, pct: Math.round(top.pct * 100) }));
  const hot = st.mods.filter((m) => m.hot);
  if (hot.length) lines.push(tCost('sum_hot', { n: hot.length, list: hot.map((m) => '#' + m.num).join(', '), v: cpPerLen(hot[0].perFt), avg: cpPerLen(st.avgPerFt) }));
  return lines.join(' ');
}

async function onCostPlanClick(e) {
  const mod = e.target.closest('.po-cost-mod-row');
  if (mod) { mod.parentElement.classList.toggle('aberto'); return; }
  if (e.target.id === 'po-cost-copy') {
    const ta = document.getElementById('po-cost-summary');
    try { await navigator.clipboard.writeText(ta.value); e.target.textContent = tCost('copied'); setTimeout(() => { e.target.textContent = tCost('copy'); }, 1500); } catch (err) { ta.select(); }
    return;
  }
  if (e.target.id === 'po-cost-make-economy') { await costPlanMakeVersion(costPlanPicked(), 'economy'); return; }
  if (e.target.id === 'po-cost-make-premium') {
    const ups = costPlanState.moves.filter((m) => m.kind === 'up');
    await costPlanMakeVersion(ups, 'premium');
  }
}

// Aplica as trocas no projeto aberto e SALVA COMO PROJETO NOVO (o original
// continua salvo como estava). Depois o projeto aberto é a versão nova.
async function costPlanMakeVersion(moves, kind) {
  if (!moves.length) { alert(tCost('nothing_picked')); return; }
  if (!currentUser) { alert(I18n.t('fav.need_login')); return; }
  const baseName = (loadedProjectFavorite && loadedProjectFavorite.name) || tCost('project');
  const suffix = tCost(kind === 'economy' ? 'suffix_economy' : 'suffix_premium');
  const name = prompt(tCost('version_name_prompt'), baseName + ' · ' + suffix);
  if (!name) return;
  if (typeof pushProjectUndoState === 'function') pushProjectUndoState();
  moves.forEach((m) => {
    const s = projectSlots.find((x) => x.id === m.slotId);
    if (!s) return;
    applyColorToProjectSlot(s, m.rid, m.to);
    recomputeProjectSlotPricing(s);
  });
  renderProjectCanvas();
  markProjectDirty();
  const folder = (loadedProjectFavorite && loadedProjectFavorite.client_folder) || costPlanState.clientFolder || null;
  loadedProjectFavorite = null; // força INSERT (projeto novo), nunca sobrescreve o original
  try {
    const id = await saveProjectFavorite(null, Object.assign({ name: name.trim() }, folder ? { clientFolder: folder } : {}));
    if (id) {
      document.getElementById('po-cost-plan-modal').classList.remove('aberto');
      alert(tCost('version_saved', { name: name.trim(), v: cpMoney(getDisplayPrice(cpSumSlots(cpSlots()))) }));
    }
  } catch (e) { alert((e && e.message) || String(e)); }
}

(function attachCostPlanBtn() {
  const btn = document.getElementById('po-proj-costplan-btn');
  if (btn) btn.addEventListener('click', openCostPlanModal);
  if (typeof I18n !== 'undefined' && typeof I18n.onLanguageChange === 'function') {
    I18n.onLanguageChange(() => { const m = document.getElementById('po-cost-plan-modal'); if (m && !m.classList.contains('aberto')) m.remove(); });
  }
})();
