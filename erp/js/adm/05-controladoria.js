/* Painel admin — Painel de controladoria
 *
 * Pedaço 6/21 do antigo js/admin.js, que virou módulo quando o
 * ERP passou a ser a única porta de entrada. O corte seguiu os próprios
 * marcadores de assunto do arquivo, então nada mudou de vizinho.
 * A ordem de carregamento em erp/index.html importa: é a mesma de antes. */

// ---------- CONTROLADORIA (dashboard) ----------
// Pedido do usuário 2026-08-05: "quantos pedidos entraram, quantos
// orçamentos foram gerados, quantos novos clientes se cadastraram" — tudo
// calculado no navegador em cima de tabelas que já existem (orders/quotes/
// user_profiles), sem migration nova. "Pedidos entrados" usa o MESMO filtro
// de status que a aba Pedidos já usa (submitted/approved/paid/delivered —
// ver renderOrdersList), pra bater com o que o admin já vê lá. "Orçamentos
// gerados" conta toda linha de quotes no período (a calculadora avulsa cria
// a linha assim que o orçamento é gerado). "Novos clientes cadastrados" é
// novo registro em user_profiles (contas de login do portal — não confundir
// com o CRM acima, que é cadastro manual do admin).

function getControladoriaRange() {
  const preset = document.getElementById('controladoria-period-select').value;
  const now = new Date();
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let start;
  if (preset === 'custom') {
    const fromVal = document.getElementById('controladoria-date-from').value;
    const toVal = document.getElementById('controladoria-date-to').value;
    start = fromVal ? new Date(fromVal + 'T00:00:00') : new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
    if (toVal) end = new Date(toVal + 'T23:59:59.999');
  } else if (preset === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  } else {
    const days = parseInt(preset, 10) || 30;
    start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1), 0, 0, 0, 0);
  }
  return { start, end };
}

function fmtDateBR(d) { return d.toLocaleDateString('pt-BR'); }

// Chave local YYYY-MM-DD — evita o bug clássico de usar toISOString() (UTC)
// pra bucketizar por dia, que desloca o dia perto da virada de fuso.
function crmDayKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildDayBuckets(start, end) {
  const days = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cur <= last) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function renderBarChart(chartElId, labelsElId, days, countsByKey) {
  const chartEl = document.getElementById(chartElId);
  const labelsEl = document.getElementById(labelsElId);
  chartEl.innerHTML = '';
  labelsEl.innerHTML = '';
  const max = Math.max(1, ...days.map((d) => countsByKey[crmDayKey(d)] || 0));
  const labelEvery = Math.max(1, Math.ceil(days.length / 10));
  days.forEach((d, i) => {
    const key = crmDayKey(d);
    const count = countsByKey[key] || 0;
    const col = document.createElement('div');
    col.className = 'bar-col';
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.style.height = `${Math.max(2, Math.round((count / max) * 100))}%`;
    bar.title = `${fmtDateBR(d)}: ${count}`;
    col.appendChild(bar);
    chartEl.appendChild(col);
    const span = document.createElement('span');
    span.textContent = (i % labelEvery === 0 || i === days.length - 1) ? `${d.getDate()}/${d.getMonth() + 1}` : '';
    labelsEl.appendChild(span);
  });
}

function renderKpiCard(value, label, breakdownLines) {
  const card = document.createElement('div');
  card.className = 'kpi-card';
  const breakdownHtml = breakdownLines && breakdownLines.length
    ? `<div class="kpi-breakdown">${breakdownLines.join('<br>')}</div>` : '';
  card.innerHTML = `<div class="kpi-value">${value}</div><div class="kpi-label">${label}</div>${breakdownHtml}`;
  return card;
}

async function loadControladoria() {
  clearError('controladoria-error');
  const { start, end } = getControladoriaRange();
  document.getElementById('controladoria-range-label').textContent = `${fmtDateBR(start)} — ${fmtDateBR(end)}`;
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const [ordersRes, quotesRes, profilesRes] = await Promise.all([
    supabaseClient.from('orders')
      .select('id, order_type, submitted_at')
      .in('status', ['submitted', 'approved', 'paid', 'delivered'])
      .gte('submitted_at', startISO).lte('submitted_at', endISO),
    supabaseClient.from('quotes')
      .select('id, created_at')
      .gte('created_at', startISO).lte('created_at', endISO),
    supabaseClient.from('user_profiles')
      .select('user_id, created_at, role')
      .gte('created_at', startISO).lte('created_at', endISO)
  ]);
  if (ordersRes.error) { showError('controladoria-error', ordersRes.error); return; }
  if (quotesRes.error) { showError('controladoria-error', quotesRes.error); return; }
  if (profilesRes.error) { showError('controladoria-error', profilesRes.error); return; }

  const orders = ordersRes.data || [];
  const quotes = quotesRes.data || [];
  const profiles = profilesRes.data || [];

  const cardsEl = document.getElementById('controladoria-cards');
  cardsEl.innerHTML = '';
  const ORDER_TYPE_LABELS = { modules: 'Módulos', project: 'Projeto', cutting_list: 'Plano de Corte' };
  const orderTypeCounts = {};
  orders.forEach((o) => { const t = o.order_type || 'modules'; orderTypeCounts[t] = (orderTypeCounts[t] || 0) + 1; });
  const orderBreakdown = Object.keys(orderTypeCounts).map((t) => `${ORDER_TYPE_LABELS[t] || t}: ${orderTypeCounts[t]}`);
  cardsEl.appendChild(renderKpiCard(orders.length, 'Pedidos entrados', orderBreakdown));

  cardsEl.appendChild(renderKpiCard(quotes.length, 'Orçamentos gerados'));

  const roleCounts = {};
  profiles.forEach((p) => { const r = p.role || 'cliente'; roleCounts[r] = (roleCounts[r] || 0) + 1; });
  // ADMIN_ROLE_LABELS morava em erp/js/adm/03-usuarios.js — essa aba virou
  // só um link pra Central de Contatos (2026-09-02), então o catalogo de
  // labels do role do portal se mudou pra CT.PORTAL_ROLE_LABELS
  // (js/data-contatos.js, que carrega antes deste script).
  const roleBreakdown = Object.keys(roleCounts).map((r) => `${CT.PORTAL_ROLE_LABELS[r] || r}: ${roleCounts[r]}`);
  cardsEl.appendChild(renderKpiCard(profiles.length, 'Novos clientes cadastrados', roleBreakdown));

  // Gráfico diário — só faz sentido pra período curto o bastante pra ficar
  // legível; período mais longo (custom grande) fica só com os cards.
  const days = buildDayBuckets(start, end);
  const noteEl = document.getElementById('controladoria-chart-note');
  const chartsEl = document.getElementById('controladoria-charts');
  if (days.length > 92) {
    chartsEl.style.display = 'none';
    noteEl.style.display = 'block';
    return;
  }
  chartsEl.style.display = 'flex';
  noteEl.style.display = 'none';

  const ordersByDay = {};
  orders.forEach((o) => { if (o.submitted_at) { const k = crmDayKey(new Date(o.submitted_at)); ordersByDay[k] = (ordersByDay[k] || 0) + 1; } });
  const quotesByDay = {};
  quotes.forEach((q) => { const k = crmDayKey(new Date(q.created_at)); quotesByDay[k] = (quotesByDay[k] || 0) + 1; });
  const profilesByDay = {};
  profiles.forEach((p) => { const k = crmDayKey(new Date(p.created_at)); profilesByDay[k] = (profilesByDay[k] || 0) + 1; });

  renderBarChart('controladoria-chart-orders', 'controladoria-chart-orders-labels', days, ordersByDay);
  renderBarChart('controladoria-chart-quotes', 'controladoria-chart-quotes-labels', days, quotesByDay);
  renderBarChart('controladoria-chart-clients', 'controladoria-chart-clients-labels', days, profilesByDay);
}

document.getElementById('controladoria-period-select').addEventListener('change', () => {
  const isCustom = document.getElementById('controladoria-period-select').value === 'custom';
  document.getElementById('controladoria-custom-from').style.display = isCustom ? '' : 'none';
  document.getElementById('controladoria-custom-to').style.display = isCustom ? '' : 'none';
  if (!isCustom) loadControladoria();
});
document.getElementById('controladoria-refresh-btn').addEventListener('click', loadControladoria);
ADM.aoAbrir('tab-controladoria', loadControladoria);

document.getElementById('pricing-settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('pricing-settings-error');
  const statusEl = document.getElementById('pricing-settings-status');
  statusEl.textContent = '';
  const percent = parseFloat(document.getElementById('pricing-margin-percent').value);
  const density = parseFloat(document.getElementById('pricing-density-kg-m3').value);
  if (!isFinite(percent) || percent < 0) {
    showError('pricing-settings-error', new Error('Informe uma margem válida (0 ou mais).'));
    return;
  }
  if (!isFinite(density) || density < 0) {
    showError('pricing-settings-error', new Error('Informe uma densidade válida (0 ou mais).'));
    return;
  }
  const multiplier = 1 + percent / 100;
  const { data, error } = await supabaseClient
    .from('pricing_settings')
    .update({ markup_multiplier: multiplier, weight_density_kg_per_m3: density, updated_at: new Date().toISOString() })
    .eq('id', true)
    .select()
    .single();
  if (error) { showError('pricing-settings-error', error); return; }
  pricingSettingsCache = data;
  statusEl.textContent = 'Margem salva.';
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
  if (typeof runTestCalculation === 'function' && selectedModuleId) runTestCalculation();
});
