// ============================================================
// ACOMPANHAMENTO DO PEDIDO PRO DEALER (2026-10-26, migration 247)
// ============================================================
// Matt: "quero preparar essa tela [Meus Pedidos] com informações
// importantes pro dealer: dia da liberação financeira, cópia da invoice,
// prazo (após liberado) em dias úteis mostrado dia após dia aumentando num
// quadrinho, status do pedido (enviado pra fábrica → liberado pra produção →
// em lote → na embalagem → pronto pra coleta → liberação financeira pra
// coleta), lista de volumes (após embalado) PDF, desenhos técnicos PDF,
// status de prazo (no prazo / adiantado se embalado antes dos 15 dias
// corridos / atrasado depois dos 15), lista de peças / portas alumínio /
// ripados / portas especiais / ferragens (mesma do PCP) só PDF. Só no
// ambiente do administrador até validar pros dealers."
//
// LIGAR PROS DEALERS: trocar TRK_SO_ADMIN pra false. O banco já está pronto
// (as RPCs da migration 247 checam dono do pedido OU admin; a invoice tem
// policy de leitura pro dono).
//
// De onde vem cada etapa:
//   1 Enviado pra fábrica   orders.status approved/paid/delivered (approved_at)
//   2 Liberado pra produção orders.finance_released_at (ERP > Financeiro)
//   3 Em lote               erp.batch_orders.added_at   (RPC portal_order_tracking)
//   4 Na embalagem          1ª peça apontada num volume do pedido
//   5 Pronto pra coleta     TODOS os volumes do pedido embalados (último packed_at)
//   6 Liberado pra coleta   orders.pickup_released_at (ERP > Financeiro)
// Prazo: 15 dias CORRIDOS a partir da liberação pra produção, até "pronto".
// O quadrinho conta DIAS ÚTEIS (seg–sex; feriado não é descontado).
//
// PDFs: lista de volumes (RPC portal_order_volumes), desenhos técnicos
// (vistas/planta com cotas da Proposta + 1 folha por módulo) e lista do PCP
// — peças de chapa (LOTES.explodeOrders) + alumínio/vidros/portas
// especiais/ripados/gavetas dovetail/ferragens (LOTES.processosDosItens),
// carregando erp/js/data-lotes.js sob demanda: a MESMA conta do lote, não
// uma cópia que diverge.
//
// Ponto de entrada: renderOrderTracking (chamado no fim de renderOrderDetail,
// portal-02) e trkDecorateOrderList (fim de loadMyOrders, portal-02).

const TRK_SO_ADMIN = true;
const TRK_PRAZO_DIAS = 15;
const TRK_STEPS = ['sent', 'released', 'batch', 'packing', 'ready', 'pickup'];

function trkT(k, vars) { return I18n.t('track.' + k, vars); }
function trkEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function trkUnit() { return (document.getElementById('po-unit-select') || {}).value || 'mm'; }
function trkDim(mm) { return formatDimension(Number(mm) || 0, trkUnit()); }
function trkDate(iso) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString(currentLocale());
}
// data "de calendário" local (zera hora) — conta de dias não pode depender
// da hora em que a tela abriu
function trkDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function trkAddDays(d, n) { const x = trkDay(d); x.setDate(x.getDate() + n); return x; }
function trkCalendarDays(from, to) { return Math.round((trkDay(to) - trkDay(from)) / 86400000); }
// dias úteis DEPOIS de `from` até `to` (inclusive) — o dia da liberação é o
// dia 0, o 1º dia útil seguinte é o dia 1
function trkBusinessDays(from, to) {
  let n = 0;
  const end = trkDay(to);
  for (let d = trkAddDays(from, 1); d <= end; d = trkAddDays(d, 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}

let trkAdminCache = null;
async function trkCanSee() {
  if (!TRK_SO_ADMIN) return true;
  if (window.LEGNO_IS_ADMIN === true) return true;
  if (trkAdminCache !== null) return trkAdminCache;
  try {
    const { data, error } = await supabaseClient.rpc('is_admin');
    trkAdminCache = !error && data === true;
  } catch (e) { trkAdminCache = false; }
  return trkAdminCache;
}

// Andamento do chão de fábrica de vários pedidos de uma vez. Sem a
// migration 247 a RPC não existe — volta vazio (a tela mostra só o que vem
// de orders).
async function trkFetchTracking(orderIds) {
  const out = {};
  if (!orderIds.length) return out;
  try {
    const { data, error } = await supabaseClient.rpc('portal_order_tracking', { p_order_ids: orderIds });
    if (error) { console.warn('[acompanhamento] portal_order_tracking:', error.message); return out; }
    (data || []).forEach((r) => { out[r.order_id] = r; });
  } catch (e) { console.warn('[acompanhamento]', e); }
  return out;
}

// Estado completo de um pedido: etapas, prazo, status de entrega.
// `agora` só existe pro teste (scripts/tests/teste-acompanhamento-prazo.js).
function trkState(order, t, agora) {
  t = t || {};
  const now = agora ? new Date(agora) : new Date();
  const sentOk = ['approved', 'paid', 'delivered'].includes(order.status);
  const ready = Number(t.n_volumes) > 0 && Number(t.n_embalados) === Number(t.n_volumes);
  const at = {
    sent: sentOk ? (order.approved_at || order.submitted_at || null) : null,
    released: order.finance_released_at || null,
    batch: t.batch_added_at || null,
    packing: t.first_scan_at || (Number(t.n_completos) > 0 ? t.last_packed_at : null) || null,
    ready: ready ? (t.last_packed_at || null) : null,
    pickup: order.pickup_released_at || null
  };
  const done = {
    sent: sentOk, released: !!at.released, batch: !!t.batch_code, packing: !!at.packing || ready,
    ready: ready, pickup: !!at.pickup
  };
  let current = -1;
  TRK_STEPS.forEach((k, i) => { if (done[k]) current = i; });

  let prazo = null;
  if (at.released) {
    const rel = new Date(at.released);
    const deadline = trkAddDays(rel, TRK_PRAZO_DIAS);
    const finished = ready;
    const endRef = finished ? new Date(at.ready || now) : now;
    const elapsedCal = trkCalendarDays(rel, endRef);
    const bizDay = trkBusinessDays(rel, endRef);
    const bizTarget = trkBusinessDays(rel, deadline);
    let status;
    if (finished) status = elapsedCal < TRK_PRAZO_DIAS ? 'early' : (elapsedCal === TRK_PRAZO_DIAS ? 'on_time' : 'late');
    else status = elapsedCal <= TRK_PRAZO_DIAS ? 'on_time' : 'late';
    prazo = { released: rel, deadline, elapsedCal, bizDay, bizTarget, status, finished,
      daysLeft: TRK_PRAZO_DIAS - elapsedCal };
  }
  return { at, done, current, prazo, t };
}

// ---------- Lista "Meus Pedidos": chip com a etapa + prazo ----------
async function trkDecorateOrderList(orders, container) {
  if (!container || !(await trkCanSee())) return;
  const relevant = (orders || []).filter((o) => o.order_type !== 'cutting_list' && ['approved', 'paid', 'delivered'].includes(o.status));
  if (!relevant.length) return;
  const map = await trkFetchTracking(relevant.map((o) => o.id));
  relevant.forEach((o) => {
    const title = container.querySelector(`.portal-order-card[data-order-id="${o.id}"] .portal-order-title`);
    if (!title || title.querySelector('.po-trk-chip')) return;
    const st = trkState(o, map[o.id]);
    if (st.current >= 0) {
      const span = document.createElement('span');
      span.className = 'po-trk-chip';
      span.textContent = trkT('step_' + TRK_STEPS[st.current]);
      title.appendChild(span);
    }
    if (st.prazo) {
      const p = document.createElement('span');
      p.className = 'po-trk-chip po-trk-st-' + st.prazo.status;
      p.textContent = trkT('status_' + st.prazo.status) + (st.prazo.finished ? '' : ' · ' + trkT('biz_day_short', { n: st.prazo.bizDay }));
      title.appendChild(p);
    }
  });
}

// ---------- Tela do pedido: painel de acompanhamento ----------
let trkRenderSeq = 0;
async function renderOrderTracking(order, items) {
  const box = document.getElementById('po-order-track');
  if (!box) return;
  const seq = ++trkRenderSeq;
  if (!order || order.order_type === 'cutting_list' || !(await trkCanSee())) {
    box.style.display = 'none'; box.innerHTML = ''; return;
  }
  const map = await trkFetchTracking([order.id]);
  if (seq !== trkRenderSeq) return; // trocou de pedido (ou re-renderizou) no meio
  const st = trkState(order, map[order.id]);
  const t = st.t;

  const stepsHtml = TRK_STEPS.map((k, i) => {
    const cls = st.done[k] ? 'done' : (i === st.current + 1 ? 'next' : '');
    return `<div class="po-trk-step ${cls}">
      <div class="po-trk-dot">${st.done[k] ? '✓' : i + 1}</div>
      <div class="po-trk-step-name">${trkEsc(trkT('step_' + k))}</div>
      <div class="po-trk-step-date">${st.at[k] ? trkEsc(trkDate(st.at[k])) : ''}</div>
    </div>`;
  }).join('');

  let prazoHtml;
  if (st.prazo) {
    const p = st.prazo;
    const sq = [];
    const filled = Math.min(p.bizDay, p.bizTarget);
    for (let i = 0; i < p.bizTarget; i++) sq.push(`<span class="po-trk-sq${i < filled ? ' on' : ''}"></span>`);
    for (let i = p.bizTarget; i < Math.min(p.bizDay, p.bizTarget + 15); i++) sq.push('<span class="po-trk-sq late"></span>');
    const sub = p.finished
      ? trkT('ready_in', { n: p.elapsedCal })
      : (p.daysLeft >= 0 ? trkT('days_left', { n: p.daysLeft }) : trkT('days_over', { n: -p.daysLeft }));
    prazoHtml = `
      <div class="po-trk-card po-trk-counter">
        <div class="po-trk-card-label">${trkEsc(trkT('counter_label'))}</div>
        <div class="po-trk-counter-num">${p.bizDay}</div>
        <div class="po-trk-card-sub">${trkEsc(trkT('counter_of', { n: p.bizTarget }))}</div>
        <div class="po-trk-squares">${sq.join('')}</div>
      </div>
      <div class="po-trk-card">
        <div class="po-trk-card-label">${trkEsc(trkT('delivery_status'))}</div>
        <div><span class="po-trk-pill po-trk-st-${p.status}">${trkEsc(trkT('status_' + p.status))}</span></div>
        <div class="po-trk-card-sub">${trkEsc(sub)}</div>
        <div class="po-trk-card-sub">${trkEsc(trkT('deadline', { date: trkDate(p.deadline), n: TRK_PRAZO_DIAS }))}</div>
      </div>`;
  } else {
    prazoHtml = `<div class="po-trk-card po-trk-wide"><div class="po-trk-card-label">${trkEsc(trkT('counter_label'))}</div>
      <div class="po-trk-card-sub">${trkEsc(trkT('waiting_release'))}</div></div>`;
  }

  const releaseCard = `<div class="po-trk-card">
      <div class="po-trk-card-label">${trkEsc(trkT('release_label'))}</div>
      <div class="po-trk-card-value">${order.finance_released_at ? trkEsc(trkDate(order.finance_released_at)) : '—'}</div>
      <div class="po-trk-card-sub">${trkEsc(trkT('pickup_label'))}: ${order.pickup_released_at ? trkEsc(trkDate(order.pickup_released_at)) : '—'}</div>
    </div>`;

  const invoiceCard = `<div class="po-trk-card">
      <div class="po-trk-card-label">${trkEsc(trkT('invoice_label'))}</div>
      ${order.invoice_path
        ? `<button type="button" class="secondary" id="po-trk-invoice-btn">📄 ${trkEsc(order.invoice_number || trkT('invoice_open'))}</button>
           <div class="po-trk-card-sub">${trkEsc(trkDate(order.invoice_uploaded_at))}</div>`
        : `<div class="po-trk-card-sub">${trkEsc(trkT('invoice_none'))}</div>`}
    </div>`;

  const temVol = Number(t.n_volumes) > 0;
  const volTxt = temVol
    ? trkT('volumes_count', { packed: Number(t.n_embalados) || 0, total: Number(t.n_volumes) })
    : trkT('volumes_none');

  box.innerHTML = `
    <div class="po-trk-head">
      <strong>${trkEsc(trkT('title'))}</strong>
      ${TRK_SO_ADMIN ? `<span class="po-trk-admin-tag">${trkEsc(trkT('admin_only'))}</span>` : ''}
      ${t.batch_code ? `<span class="hint">${trkEsc(trkT('batch_label', { code: t.batch_code }))}</span>` : ''}
    </div>
    <div class="po-trk-steps">${stepsHtml}</div>
    <div class="po-trk-cards">${releaseCard}${prazoHtml}${invoiceCard}</div>
    <div class="po-trk-docs">
      <button type="button" class="secondary" id="po-trk-vol-btn" ${temVol ? '' : 'disabled'}>${trkEsc(trkT('pdf_volumes'))}</button>
      <button type="button" class="secondary" id="po-trk-draw-btn">${trkEsc(trkT('pdf_drawings'))}</button>
      <button type="button" class="secondary" id="po-trk-pcp-btn">${trkEsc(trkT('pdf_pcp'))}</button>
      <span class="hint">${trkEsc(volTxt)}</span>
      <span class="hint" id="po-trk-status"></span>
    </div>
    <div class="error" id="po-trk-error" style="display:none;"></div>`;
  box.style.display = 'block';

  const wire = (id, fn) => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('click', async () => {
      const err = document.getElementById('po-trk-error');
      const stEl = document.getElementById('po-trk-status');
      err.style.display = 'none';
      b.disabled = true;
      if (stEl) stEl.textContent = trkT('generating');
      try { await fn(); }
      catch (e) { console.error('[acompanhamento]', e); err.textContent = trkT('pdf_error', { msg: e.message || String(e) }); err.style.display = 'block'; }
      finally { b.disabled = false; if (stEl) stEl.textContent = ''; }
    });
  };
  wire('po-trk-vol-btn', () => trkPdfVolumes(order));
  wire('po-trk-draw-btn', () => trkPdfDrawings(order, items));
  wire('po-trk-pcp-btn', () => trkPdfPcp(order, items));
  const invBtn = document.getElementById('po-trk-invoice-btn');
  if (invBtn) invBtn.addEventListener('click', async () => {
    const win = window.open('', '_blank'); // abre no clique (bloqueador de pop-up)
    try {
      const { data, error } = await supabaseClient.storage.from('order-invoices').createSignedUrl(order.invoice_path, 3600);
      if (error) throw error;
      if (win) win.location.href = data.signedUrl; else window.location.href = data.signedUrl;
    } catch (e) {
      if (win) win.close();
      const err = document.getElementById('po-trk-error');
      err.textContent = trkT('invoice_error', { msg: e.message || String(e) }); err.style.display = 'block';
    }
  });
}

// ---------- ERP (data-lotes.js) sob demanda ----------
let trkLotesPromise = null;
function trkLoadLotes() {
  // data-lotes.js lê DATA.sb()/DATA._once — no portal só existe o
  // supabaseClient. Calço mínimo, só se o portal não tiver um DATA próprio.
  if (typeof window.DATA === 'undefined') {
    window.DATA = {
      _cache: {},
      _once(key, fn) { if (!this._cache[key]) this._cache[key] = fn(); return this._cache[key]; },
      sb() { return supabaseClient; },
      user: null,
      explainError(e) { return (e && e.message) || String(e); }
    };
  }
  if (typeof LOTES !== 'undefined') return Promise.resolve();
  if (trkLotesPromise) return trkLotesPromise;
  trkLotesPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // cache-buster diário (o deploy não reescreve este caminho)
    s.src = 'erp/js/data-lotes.js?v=' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
    s.onload = () => resolve();
    s.onerror = () => { trkLotesPromise = null; reject(new Error(trkT('erp_load_error'))); };
    document.head.appendChild(s);
  });
  return trkLotesPromise;
}

// ---------- PDF: base ----------
const TRK_M = 12;
function trkPdfTxt(s) {
  // Helvetica do jsPDF só tem WinAnsi — tira o que não imprime
  return String(s == null ? '' : s)
    .replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/[^\x00-\xFF—–•“”‘’]/g, '');
}
function trkPdfNew(order, title, landscape) {
  if (typeof window.jspdf === 'undefined') throw new Error(I18n.t('pdf.not_available'));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'letter' });
  // título do PDF = rótulo do botão sem o "(PDF)"
  title = String(title).replace(/\s*\(PDF\)\s*$/i, '');
  const ctx = { doc, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight(), y: TRK_M, title, order };
  trkPdfHeader(ctx);
  return ctx;
}
function trkPdfHeader(ctx) {
  const { doc, W, order } = ctx;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30);
  doc.text(trkPdfTxt(ctx.title), TRK_M, TRK_M + 4);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(110);
  const who = [order.po_name, order.client_name].filter(Boolean).join(' — ') || ('#' + String(order.id).slice(0, 8));
  doc.text(trkPdfTxt(who), TRK_M, TRK_M + 9);
  doc.text(trkPdfTxt(trkDate(new Date())), W - TRK_M, TRK_M + 4, { align: 'right' });
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(TRK_M, TRK_M + 12, W - TRK_M, TRK_M + 12);
  doc.setTextColor(0);
  ctx.y = TRK_M + 18;
}
function trkPdfNewPage(ctx) { ctx.doc.addPage(); trkPdfHeader(ctx); }
function trkPdfEnsure(ctx, h) { if (ctx.y + h > ctx.H - TRK_M - 6) trkPdfNewPage(ctx); }
function trkPdfSection(ctx, text) {
  trkPdfEnsure(ctx, 16);
  const { doc, W } = ctx;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(110, 69, 39);
  doc.text(trkPdfTxt(String(text).toUpperCase()), TRK_M, ctx.y);
  doc.setDrawColor(224, 221, 214); doc.setLineWidth(0.3); doc.line(TRK_M, ctx.y + 1.5, W - TRK_M, ctx.y + 1.5);
  doc.setFont('helvetica', 'normal'); doc.setTextColor(0);
  ctx.y += 7;
}
function trkPdfNote(ctx, text) {
  trkPdfEnsure(ctx, 6);
  ctx.doc.setFontSize(9); ctx.doc.setTextColor(110);
  const lines = ctx.doc.splitTextToSize(trkPdfTxt(text), ctx.W - TRK_M * 2);
  ctx.doc.text(lines, TRK_M, ctx.y);
  ctx.doc.setTextColor(0);
  ctx.y += lines.length * 4 + 2;
}
// cols: [{label, w (fração da largura), align}] ; rows: [[texto...]]
function trkPdfTable(ctx, cols, rows) {
  const { doc, W } = ctx;
  const total = W - TRK_M * 2;
  const ws = cols.map((c) => c.w * total);
  const drawHead = () => {
    doc.setFillColor(246, 240, 232); doc.rect(TRK_M, ctx.y - 4, total, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    let x = TRK_M;
    cols.forEach((c, i) => {
      const right = c.align === 'right';
      doc.text(trkPdfTxt(c.label), right ? x + ws[i] - 1.5 : x + 1.5, ctx.y, { align: right ? 'right' : 'left' });
      x += ws[i];
    });
    doc.setFont('helvetica', 'normal');
    ctx.y += 5;
  };
  trkPdfEnsure(ctx, 12);
  drawHead();
  doc.setFontSize(8.5);
  rows.forEach((r, ri) => {
    const cells = r.map((v, i) => doc.splitTextToSize(trkPdfTxt(v), Math.max(4, ws[i] - 3)));
    const h = Math.max(1, ...cells.map((c) => c.length)) * 3.6 + 1.6;
    if (ctx.y + h > ctx.H - TRK_M - 6) { trkPdfNewPage(ctx); drawHead(); doc.setFontSize(8.5); }
    if (ri % 2) { doc.setFillColor(250, 249, 247); doc.rect(TRK_M, ctx.y - 3.4, total, h, 'F'); }
    let x = TRK_M;
    cells.forEach((lines, i) => {
      const right = cols[i].align === 'right';
      doc.text(lines, right ? x + ws[i] - 1.5 : x + 1.5, ctx.y, { align: right ? 'right' : 'left' });
      x += ws[i];
    });
    ctx.y += h;
  });
  ctx.y += 4;
}
function trkPdfFooters(ctx) {
  const { doc, W, H } = ctx;
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(`${i} / ${n}`, W - TRK_M, H - 6, { align: 'right' });
  }
  doc.setTextColor(0);
}
function trkFileBase(order) {
  return String(order.po_name || order.client_name || String(order.id).slice(0, 8)).replace(/[^A-Za-z0-9_-]+/g, '_');
}
function trkKg(kg) { const v = Number(kg) || 0; return `${v.toFixed(1)} kg / ${(v * 2.20462).toFixed(1)} lb`; }

// ---------- PDF: lista de volumes ----------
async function trkPdfVolumes(order) {
  const { data, error } = await supabaseClient.rpc('portal_order_volumes', { p_order_id: order.id });
  if (error) throw error;
  const vols = data || [];
  if (!vols.length) throw new Error(trkT('volumes_none'));
  const ctx = trkPdfNew(order, trkT('pdf_volumes'), true);
  const peso = vols.reduce((s, v) => s + (Number(v.peso_kg) || 0), 0);
  const emb = vols.filter((v) => v.status === 'embalado').length;
  const pallets = new Set(vols.map((v) => v.pallet_n).filter((n) => n != null));
  trkPdfNote(ctx, trkT('vol_summary', { n: vols.length, packed: emb, weight: trkKg(peso), pallets: pallets.size || '—' }));
  trkPdfTable(ctx, [
    { label: trkT('col_vol'), w: 0.06 },
    { label: trkT('col_label'), w: 0.12 },
    { label: trkT('col_module'), w: 0.28 },
    { label: trkT('col_dims'), w: 0.22 },
    { label: trkT('col_weight'), w: 0.13, align: 'right' },
    { label: trkT('col_pieces'), w: 0.06, align: 'right' },
    { label: trkT('col_pallet'), w: 0.06, align: 'right' },
    { label: trkT('col_status'), w: 0.07 }
  ], vols.map((v) => [
    String(v.seq),
    v.rotulo || '',
    [v.module_number, v.module_name].filter(Boolean).join(' ') + (Number(v.total) > 1 ? ` (${v.idx}/${v.total})` : '') + (v.tipo === 'grande' ? ' G' : ''),
    `${trkDim(v.c_mm)} x ${trkDim(v.l_mm)} x ${trkDim(v.h_mm)}`,
    trkKg(v.peso_kg),
    String(v.n_pecas || 0),
    v.pallet_n != null ? String(v.pallet_n) : '—',
    trkT('vol_st_' + (v.status || 'aberto'))
  ]));
  trkPdfFooters(ctx);
  ctx.doc.save(`${trkT('file_volumes')}-${trkFileBase(order)}.pdf`);
}

// ---------- PDF: desenhos técnicos ----------
function trkItemsSorted(items) { return (items || []).slice().sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)); }
function trkModelNames(breakdown) {
  const out = { hinge: null, slide: null };
  (function walk(list) {
    (list || []).forEach((p) => {
      if (!out.hinge && p.hinge_model_name && Number(p.hinge_count) > 0) out.hinge = p.hinge_model_name;
      if (!out.slide && p.slide_model_name && Number(p.slide_cost) > 0) out.slide = p.slide_model_name;
      if (p.is_module) walk(p.child_breakdown);
    });
  })(breakdown);
  return out;
}
// cota simples: linha com traço nas pontas e o valor no meio
function trkDimH(doc, x1, x2, y, label) {
  doc.setDrawColor(27, 31, 138); doc.setLineWidth(0.25);
  doc.line(x1, y, x2, y); doc.line(x1, y - 1.5, x1, y + 1.5); doc.line(x2, y - 1.5, x2, y + 1.5);
  doc.setFontSize(8); doc.setTextColor(27, 31, 138);
  doc.text(trkPdfTxt(label), (x1 + x2) / 2, y - 1.2, { align: 'center' });
  doc.setTextColor(0);
}
function trkDimV(doc, x, y1, y2, label) {
  doc.setDrawColor(27, 31, 138); doc.setLineWidth(0.25);
  doc.line(x, y1, x, y2); doc.line(x - 1.5, y1, x + 1.5, y1); doc.line(x - 1.5, y2, x + 1.5, y2);
  doc.setFontSize(8); doc.setTextColor(27, 31, 138);
  doc.text(trkPdfTxt(label), x - 1.5, (y1 + y2) / 2, { angle: 90, align: 'center' });
  doc.setTextColor(0);
}
async function trkPdfDrawings(order, items) {
  await trkLoadLotes();
  const list = trkItemsSorted(items);
  const ctx = trkPdfNew(order, trkT('pdf_drawings'), false);
  const { doc, W, H } = ctx;
  const unit = trkUnit();
  const contentW = W - TRK_M * 2;

  // 1) Ambiente: vistas por parede + planta (mesmo desenho da Proposta)
  if (typeof proposalHasLayoutData === 'function' && proposalHasLayoutData(order, list)) {
    const walls = proposalWallList(order, list);
    walls.forEach((wall, i) => {
      if (i > 0) trkPdfNewPage(ctx);
      trkPdfSection(ctx, trkT('draw_elevation'));
      ctx.y = proposalDrawElevation(doc, wall, proposalItemsOnWall(list, wall.wallIndex), ctx.y, contentW, unit) + 6;
    });
    trkPdfNewPage(ctx);
    trkPdfSection(ctx, trkT('draw_plan'));
    proposalDrawUnifiedFloorPlan(doc, walls, list, TRK_M, ctx.y + 2, contentW, H - ctx.y - TRK_M - 10, unit);
  } else {
    trkPdfSection(ctx, trkT('draw_elevation'));
    trkPdfNote(ctx, trkT('draw_no_layout'));
  }

  // 2) Uma folha por módulo (número = mesma sequência da etiqueta)
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    trkPdfNewPage(ctx);
    const num = String(i + 1).padStart(3, '0');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(trkPdfTxt(`${trkT('module_short')} ${num} — ${it.module_name || ''}`), TRK_M, ctx.y);
    doc.setFont('helvetica', 'normal');
    ctx.y += 6;
    const topY = ctx.y;
    // imagem (esquerda)
    let imgBottom = topY;
    const meta = await proposalImageMeta(it.thumbnail_data_url || null);
    if (meta) {
      const fit = proposalFitImage(doc, meta, TRK_M, topY, contentW * 0.42, 70);
      imgBottom = fit.y + fit.h;
    }
    // vista frontal + lateral cotadas (direita)
    const w = Number(it.width_mm) || 0, h = Number(it.height_mm) || 0, d = Number(it.depth_mm) || 0;
    let drawBottom = topY;
    if (w > 0 && h > 0) {
      const areaX = TRK_M + contentW * 0.48, areaW = contentW * 0.52 - 6, areaH = 62;
      const gap = Math.max(150, (w + d) * 0.12);
      const s = Math.min((areaW - 14) / Math.max(1, w + d + gap), (areaH - 12) / Math.max(1, h));
      const fx = areaX + 8, fy = topY + 8;
      doc.setDrawColor(60); doc.setLineWidth(0.35);
      doc.rect(fx, fy, w * s, h * s);
      trkDimH(doc, fx, fx + w * s, fy - 3, trkDim(w));
      trkDimV(doc, fx - 3, fy, fy + h * s, trkDim(h));
      if (d > 0) {
        const sx = fx + w * s + gap * s;
        doc.setDrawColor(60); doc.setLineWidth(0.35);
        doc.rect(sx, fy, d * s, h * s);
        trkDimH(doc, sx, sx + d * s, fy - 3, trkDim(d));
        doc.setFontSize(7.5); doc.setTextColor(120);
        doc.text(trkPdfTxt(trkT('draw_side')), sx + (d * s) / 2, fy + h * s + 4, { align: 'center' });
      }
      doc.setFontSize(7.5); doc.setTextColor(120);
      doc.text(trkPdfTxt(trkT('draw_front')), fx + (w * s) / 2, fy + h * s + 4, { align: 'center' });
      doc.setTextColor(0);
      drawBottom = fy + h * s + 8;
    }
    ctx.y = Math.max(imgBottom, drawBottom) + 5;

    // dados do módulo
    const models = trkModelNames(it.breakdown);
    const linhas = [
      [trkT('draw_size'), `${trkDim(w)} x ${trkDim(h)} x ${trkDim(d)}` + (unit !== 'mm' ? `  (${Math.round(w)} x ${Math.round(h)} x ${Math.round(d)} mm)` : '')],
      ...(it.selected_colors || []).map((c) => [c.role_name || trkT('draw_color'), c.color_name || '—']),
      ...(models.hinge ? [[trkT('draw_hinge'), models.hinge]] : []),
      ...(models.slide ? [[trkT('draw_slide'), models.slide]] : []),
      ...(it.module_description ? [[trkT('draw_desc'), it.module_description]] : [])
    ];
    trkPdfTable(ctx, [{ label: trkT('draw_info'), w: 0.3 }, { label: '', w: 0.7 }], linhas);

    // peças de chapa do módulo (mesma explosão do lote)
    const pecas = LOTES.flattenBreakdown(it.breakdown, Number(it.quantity) || 1).filter((l) => l.origin !== 'comprado');
    if (pecas.length) {
      trkPdfSection(ctx, trkT('draw_pieces'));
      trkPdfTable(ctx, [
        { label: trkT('col_piece'), w: 0.46 }, { label: trkT('col_qty'), w: 0.1, align: 'right' },
        { label: trkT('col_dims'), w: 0.44 }
      ], pecas.map((l) => [l.reference, String(Math.round(l.quantity * 100) / 100),
        [l.width_mm, l.height_mm, l.depth_mm].map((v) => trkDim(v)).join(' x ')]));
    }
  }
  trkPdfFooters(ctx);
  doc.save(`${trkT('file_drawings')}-${trkFileBase(order)}.pdf`);
}

// ---------- PDF: lista do PCP (peças + processos + ferragens) ----------
async function trkPdfPcp(order, items) {
  await trkLoadLotes();
  const list = trkItemsSorted(items);
  const [pecas, piRes] = await Promise.all([
    LOTES.explodeOrders([order.id]),
    supabaseClient.from('purchased_items').select('id, code, name, kind, unit, attrs')
  ]);
  const piById = {};
  ((piRes && !piRes.error && piRes.data) || []).forEach((p) => { piById[p.id] = p; });
  const proc = LOTES.processosDosItens(list.map((it) => Object.assign({}, it, { order_id: order.id })), { [order.id]: order }, piById);
  const ctx = trkPdfNew(order, trkT('pdf_pcp'), true);
  const mods = (o) => (o || []).map((x) => (x.mods || []).join(', ')).join('; ');

  // 1) peças de chapa
  trkPdfSection(ctx, trkT('pcp_pieces', { n: pecas.reduce((s, p) => s + (Number(p.quantity) || 0), 0) }));
  if (pecas.length) {
    const ord = pecas.slice().sort((a, b) => String(a.module_number || '').localeCompare(String(b.module_number || '')) || String(a.reference).localeCompare(String(b.reference)));
    trkPdfTable(ctx, [
      { label: trkT('col_module'), w: 0.2 }, { label: trkT('col_piece'), w: 0.22 },
      { label: trkT('col_qty'), w: 0.05, align: 'right' }, { label: trkT('col_length'), w: 0.1, align: 'right' },
      { label: trkT('col_width'), w: 0.1, align: 'right' }, { label: trkT('col_thick'), w: 0.07, align: 'right' },
      { label: trkT('col_color'), w: 0.18 }, { label: trkT('col_edge'), w: 0.08 }
    ], ord.map((p) => [
      [p.module_number || Array.from(p._moduleNumbers || []).join(','), p.module_name].filter(Boolean).join(' '),
      p.reference + (p.description && p.description !== '—' ? ' — ' + p.description : ''),
      String(p.quantity), trkDim(p.comprimento_mm), trkDim(p.largura_mm), trkDim(p.espessura_mm),
      p.color_name || '—', p.edge_banding ? trkT('edge_sides', { n: p.edge_banding }) : '—'
    ]));
  } else trkPdfNote(ctx, trkT('pcp_empty'));

  // 2) alumínio (perfis de porta, LED, cabide)
  if (proc.aluminio.length) {
    trkPdfSection(ctx, trkT('pcp_aluminum'));
    proc.aluminio.forEach((g) => {
      trkPdfNote(ctx, `${g.material} — ${g.totalPecas} ${trkT('pcs')}, ${trkDim(g.totalMm)}` + (g.barras ? ` — ${trkT('bars', { n: g.barras.length, len: trkDim(g.barra_mm) })}` : ''));
      trkPdfTable(ctx, [
        { label: trkT('col_length'), w: 0.16, align: 'right' }, { label: trkT('col_angle'), w: 0.1 },
        { label: trkT('col_qty'), w: 0.08, align: 'right' }, { label: trkT('col_piece'), w: 0.36 }, { label: trkT('col_modules'), w: 0.3 }
      ], g.cortes.map((c) => [trkDim(c.len), c.angulo, String(c.quantity), c.ref + (c.portas.length ? ' (' + c.portas.join(', ') + ')' : ''), mods(c.onde)]));
    });
  }
  // 3) portas especiais / ripados / dupladas (montagem)
  if (proc.montagem.length) {
    trkPdfSection(ctx, trkT('pcp_special'));
    trkPdfTable(ctx, [
      { label: trkT('col_type'), w: 0.16 }, { label: trkT('col_module'), w: 0.22 }, { label: trkT('col_piece'), w: 0.22 },
      { label: trkT('col_qty'), w: 0.06, align: 'right' }, { label: trkT('col_dims'), w: 0.34 }
    ], proc.montagem.map((m) => [trkT('mont_' + m.tipo), `${m.mod} ${m.movel}`, m.ref, String(Math.round(m.quantity)),
      `${trkDim(m.w)} x ${trkDim(m.h)}` + (m.partes.length ? ' — ' + m.partes.map((p) => `${p.ref} ${trkDim(p.w)} x ${trkDim(p.h)}`).join('; ') : '')]));
  }
  // 4) vidros
  if (proc.vidros.length) {
    trkPdfSection(ctx, trkT('pcp_glass'));
    trkPdfTable(ctx, [
      { label: trkT('col_type'), w: 0.3 }, { label: trkT('col_width'), w: 0.13, align: 'right' }, { label: trkT('col_height'), w: 0.13, align: 'right' },
      { label: trkT('col_qty'), w: 0.07, align: 'right' }, { label: 'm2', w: 0.08, align: 'right' }, { label: trkT('col_modules'), w: 0.29 }
    ], proc.vidros.map((v) => [v.tipo, trkDim(v.w), trkDim(v.h), String(v.quantity), v.m2.toFixed(2), mods(v.onde)]));
  }
  // 5) gavetas dovetail
  if (proc.dovetail.length) {
    trkPdfSection(ctx, trkT('pcp_dovetail'));
    trkPdfTable(ctx, [
      { label: trkT('col_piece'), w: 0.3 }, { label: trkT('col_dims'), w: 0.35 }, { label: trkT('col_qty'), w: 0.07, align: 'right' }, { label: trkT('col_modules'), w: 0.28 }
    ], proc.dovetail.map((g) => [g.reference, `${trkDim(g.w)} x ${trkDim(g.h)} x ${trkDim(g.d)}`, String(g.quantity), mods(g.onde)]));
  }
  // 6) ferragens
  trkPdfSection(ctx, trkT('pcp_hardware'));
  if (proc.ferragens.length) {
    trkPdfTable(ctx, [
      { label: trkT('col_cat'), w: 0.16 }, { label: trkT('col_item'), w: 0.36 }, { label: trkT('col_code'), w: 0.12 },
      { label: trkT('col_qty'), w: 0.1, align: 'right' }, { label: trkT('col_modules'), w: 0.26 }
    ], proc.ferragens.map((f) => [trkT('fer_' + f.cat), f.nome, f.code || '', `${f.total} ${f.unit || ''}`,
      f.porMod.map((m) => `${m.mod}: ${m.qtd}`).join(', ')]));
  } else trkPdfNote(ctx, trkT('pcp_empty'));
  trkPdfNote(ctx, trkT('pcp_hardware_note'));

  trkPdfFooters(ctx);
  ctx.doc.save(`${trkT('file_pcp')}-${trkFileBase(order)}.pdf`);
}

// pro teste de bancada (node) — no navegador não existe module
if (typeof module !== 'undefined' && module.exports) module.exports = { trkState, trkBusinessDays, trkCalendarDays };
