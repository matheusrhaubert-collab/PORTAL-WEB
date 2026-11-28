/* Fila do celular — ERP › Plano de corte (#/planos), 27/11/2026.
 *
 * Plano gerado pelo app do celular (erp/celular.html → "Refazer peça") fica
 * com cut_plans.origem = 'celular' e machine_sent_at vazio (migration 355).
 * Aqui, no PC da seccionadora, aparece um quadro no topo da lista de planos com
 * "Mandar pra máquina" = o mesmo MAQUINA_EXPORT.gerar do plano (escolhe a pasta
 * da SawBean, grava XML + etiquetas). Gravou → marca machine_sent_at e sai da
 * fila. A lista se atualiza sozinha a cada 30 s enquanto a tela está aberta.
 *
 * Não edita screens-lotes.js: embrulha LOTES_UI.plansLoad / plansList. Tem que
 * carregar DEPOIS de screens-lotes.js e ANTES de app.js (APP.routes guarda as
 * funções na hora em que app.js carrega).
 */
const CELFILA = { _sig: '' };

CELFILA.carrega = async function () {
  try {
    const { data, error } = await LOTES.erp().from('cut_plans')
      .select('id, code, batch_id, created_at, total_pieces, total_sheets, total_offcuts_used, status')
      .eq('origem', 'celular').is('machine_sent_at', null).neq('status', 'cancelado')
      .order('created_at', { ascending: true }).limit(50);
    if (error) return [];   // sem a migration 355: sem fila, a tela segue normal
    const planos = data || [];
    const ids = Array.from(new Set(planos.map(function (p) { return p.batch_id; })));
    if (ids.length) {
      const [b, rw] = await Promise.all([
        LOTES.erp().from('batches').select('id, code, name, notes').in('id', ids),
        LOTES.erp().from('piece_rework').select('new_batch_id, orig_piece_code, reason, created_by_name').in('new_batch_id', ids)
      ]);
      const porId = {}; (b.data || []).forEach(function (x) { porId[x.id] = x; });
      const rws = {}; (rw.data || []).forEach(function (x) { (rws[x.new_batch_id] = rws[x.new_batch_id] || []).push(x); });
      planos.forEach(function (p) { p._batch = porId[p.batch_id] || null; p._rw = rws[p.batch_id] || []; });
    }
    return planos;
  } catch (e) { return []; }
};

CELFILA.html = function (fila) {
  if (!fila || !fila.length) return '';
  return '<div class="erp-card" id="celfila" style="border:2px solid #a3362e;margin-bottom:16px">' +
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><b style="font-size:16px">📱 Fila do celular — esperando a máquina (' + fila.length + ')</b>' +
    '<span class="erp-muted erp-xs">peças refeitas pelo app; "Mandar pra máquina" grava a pasta da SawBean</span></div>' +
    '<table class="erp-table"><thead><tr><th>Plano</th><th>Lote</th><th>Peças</th><th>Motivo / quem</th><th>Gerado</th><th></th></tr></thead><tbody>' +
    fila.map(function (p) {
      const rw = p._rw || [];
      const motivo = Array.from(new Set(rw.map(function (r) { return r.reason; }).filter(Boolean))).join(', ');
      const quem = Array.from(new Set(rw.map(function (r) { return r.created_by_name; }).filter(Boolean))).join(', ');
      const pecas = rw.map(function (r) { return r.orig_piece_code; }).filter(Boolean).join(', ');
      const chapas = (p.total_sheets ? p.total_sheets + ' chapa(s)' : '') + (p.total_offcuts_used ? (p.total_sheets ? ' + ' : '') + p.total_offcuts_used + ' retalho(s)' : '');
      return '<tr>' +
        '<td><a href="#/planos/' + p.id + '">' + UI.esc(p.code || '—') + '</a></td>' +
        '<td>' + UI.esc(p._batch ? p._batch.code : '') + '</td>' +
        '<td>' + (p.total_pieces || 0) + (chapas ? '<div class="erp-xs erp-muted">' + UI.esc(chapas) + '</div>' : '') +
          (pecas ? '<div class="erp-xs erp-muted">refaz ' + UI.esc(pecas) + '</div>' : '') + '</td>' +
        '<td>' + UI.esc(motivo || '—') + (quem ? '<div class="erp-xs erp-muted">' + UI.esc(quem) + '</div>' : '') + '</td>' +
        '<td class="erp-xs">' + UI.esc(new Date(p.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })) + '</td>' +
        '<td style="white-space:nowrap"><button class="erp-btn" onclick="CELFILA.mandar(\'' + p.id + '\', this)">Mandar pra máquina</button> ' +
          '<button class="erp-btn-secondary erp-xs" title="Tira da fila sem gerar (ex.: já foi mandado de outro jeito)" onclick="CELFILA.marcar(\'' + p.id + '\', this)">já mandei</button></td>' +
      '</tr>';
    }).join('') + '</tbody></table></div>';
};

CELFILA.marcarNoBanco = async function (planId) {
  const { error } = await LOTES.erp().from('cut_plans')
    .update({ machine_sent_at: new Date().toISOString(), machine_sent_by: DATA.user ? DATA.user.id : null }).eq('id', planId);
  if (error) throw error;
};

CELFILA.mandar = async function (planId, btn) {
  await MAQUINA_EXPORT.gerar(planId, btn);
  const st = btn && btn.parentNode && btn.parentNode.querySelector('.erp-maquina-status');
  const txt = st ? st.textContent : '';
  if (!/gravados|baixado/.test(txt)) return;   // cancelou ou deu erro: fica na fila
  try {
    await CELFILA.marcarNoBanco(planId);
    const tr = btn.closest('tr'); if (tr) { tr.style.opacity = '.45'; btn.textContent = '✓ mandado'; btn.disabled = true; }
  } catch (e) { if (st) st.textContent += ' (não consegui tirar da fila: ' + (e.message || e) + ')'; }
};

CELFILA.marcar = async function (planId, btn) {
  if (!confirm('Tirar este plano da fila sem gerar a pasta agora?')) return;
  try { await CELFILA.marcarNoBanco(planId); const tr = btn.closest('tr'); if (tr) tr.remove(); }
  catch (e) { alert('Não consegui: ' + (e.message || e)); }
};

/* Atualiza sozinha enquanto a lista de planos está aberta (o operador deixa a
   tela parada no PC da máquina). Só redesenha quando a fila mudou. */
CELFILA._tick = async function () {
  if (location.hash !== '#/planos' || document.hidden) return;
  const fila = await CELFILA.carrega();
  const sig = fila.map(function (p) { return p.id; }).join(',');
  if (sig === CELFILA._sig) return;
  CELFILA._sig = sig;
  const el = document.getElementById('celfila');
  const novo = CELFILA.html(fila);
  if (el) { if (novo) el.outerHTML = novo; else el.remove(); }
  else if (novo && window.APP && APP.render) APP.render();
};
setInterval(CELFILA._tick, 30000);

(function () {
  if (typeof LOTES_UI === 'undefined' || !LOTES_UI.plansLoad || !LOTES_UI.plansList) return;
  const load = LOTES_UI.plansLoad, list = LOTES_UI.plansList;
  LOTES_UI.plansLoad = async function () {
    const [d, fila] = await Promise.all([load.apply(this, arguments), CELFILA.carrega()]);
    d._filaCelular = fila;
    CELFILA._sig = fila.map(function (p) { return p.id; }).join(',');
    return d;
  };
  LOTES_UI.plansList = function (params, d) {
    const html = list.apply(this, arguments);
    const fila = CELFILA.html(d && d._filaCelular);
    return fila ? fila + html : html;
  };
})();
