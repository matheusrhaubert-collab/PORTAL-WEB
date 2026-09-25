/* Legno ERP — telas de apoio ligadas ao painel admin.
 *
 * A hospedagem dos cadastros do admin mora em js/adm/_adm.js (objeto ADM).
 * Sobrou aqui a tela de PCP → Etiquetas, que é do ERP mesmo.
 */

const ADMINX = {};

/* ============================================================
   PCP → Etiquetas: imprimir as etiquetas de um plano já gerado
   ============================================================
   Diferente de ENGENHARIA → Cadastro de etiquetas (#/etiquetas), que é o
   desenho do layout. Aqui é o uso do dia a dia: escolher o plano e mandar
   pra Zebra. A tela de etiquetas em si já existe (#/planos/:id/etiquetas) —
   isto é só a porta de entrada por PCP, em vez de obrigar a passar pela
   lista de planos. */
ADMINX.printLabelsLoad = function () {
  return LOTES_UI.plansLoad();
};

ADMINX.printLabels = function (params, d) {
  const plans = (d.plans || []).filter(function (p) { return p.status !== 'cancelado'; });

  const rows = plans.map(function (p) {
    const b = p.batches || {};
    return {
      _href: '#/planos/' + p.id + '/etiquetas',
      code: '<span class="erp-mono erp-strong">' + UI.esc(p.code || ('v' + p.version)) + '</span>' +
        '<div class="erp-xs erp-muted">' + UI.date(p.created_at) + '</div>',
      lote: b.code ? UI.esc(b.code) + (b.name ? '<div class="erp-xs erp-muted">' + UI.esc(b.name) + '</div>' : '')
                   : '<span class="erp-muted erp-xs">—</span>',
      pieces: (p.total_pieces != null ? p.total_pieces : '—'),
      sheets: (p.total_sheets != null ? p.total_sheets : '—'),
      acao: '<a class="erp-btn erp-btn-sm" href="#/planos/' + p.id + '/etiquetas">Etiquetas</a>'
    };
  });

  return UI.head('Etiquetas',
    'Escolha o plano de corte para imprimir as etiquetas das peças. O desenho do layout da etiqueta fica em Engenharia → Cadastro de etiquetas.',
    '<a class="erp-btn erp-btn-secondary" href="#/planos">Ver planos de corte</a>') +
    UI.panel('Planos disponíveis', rows.length
      ? UI.table([
          { key: 'code', label: 'Plano' },
          { key: 'lote', label: 'Lote' },
          { key: 'pieces', label: 'Peças', align: 'right' },
          { key: 'sheets', label: 'Chapas', align: 'right' },
          { key: 'acao', label: '', align: 'right' }
        ], rows)
      : '<div class="erp-empty">Nenhum plano de corte gerado ainda. Crie um lote e gere o plano em PCP → Lotes.</div>');
};
