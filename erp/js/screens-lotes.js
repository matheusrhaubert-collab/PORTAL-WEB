/* Legno ERP — telas do Lote e do Plano de Corte.
 *
 * Fluxo (é o do Cutrite, adaptado ao que a Legno já tem):
 *
 *   Lotes  →  Lote  →  Gerar plano  →  [rascunho na tela]  →  Salvar
 *                ↑                                              │
 *                └──────── histórico de planos ─────────────────┘
 *                                                               ↓
 *                                    baixa dos retalhos usados + entrada das sobras
 *
 * Duas coisas que valem lembrar ao mexer aqui:
 *
 * 1. GERAR NÃO MEXE NO ESTOQUE. O plano gerado é rascunho em memória
 *    (LOTES_UI._draft). Só o botão Salvar grava a versão, consome retalho e
 *    cadastra sobra. Dá pra gerar dez variações com parâmetros diferentes e
 *    salvar uma só.
 *
 * 2. AS TELAS SÃO FUNÇÕES SÍNCRONAS que devolvem HTML (contrato do roteador em
 *    app.js). O que precisa de estado vive em LOTES_UI._draft / _state e é
 *    redesenhado escrevendo em innerHTML de um container por id.
 */

const LOTES_UI = {};

LOTES_UI.BATCH_STATUS = {
  planejado:   { label: 'Planejado',   pill: 'erp-pill-neutral' },
  liberado:    { label: 'Liberado',    pill: 'erp-pill-info' },
  em_producao: { label: 'Em produção', pill: 'erp-pill-accent' },
  concluido:   { label: 'Concluído',   pill: 'erp-pill-ok' },
  cancelado:   { label: 'Cancelado',   pill: 'erp-pill-danger' }
};

LOTES_UI.PLAN_STATUS = {
  salvo:     { label: 'Salvo',     pill: 'erp-pill-info' },
  cortado:   { label: 'Cortado',   pill: 'erp-pill-ok' },
  cancelado: { label: 'Cancelado', pill: 'erp-pill-danger' }
};

LOTES_UI.OFFCUT_STATUS = {
  disponivel: { label: 'Disponível', pill: 'erp-pill-ok' },
  reservado:  { label: 'Reservado',  pill: 'erp-pill-warn' },
  consumido:  { label: 'Consumido',  pill: 'erp-pill-neutral' },
  descartado: { label: 'Descartado', pill: 'erp-pill-danger' }
};

LOTES_UI.mm = function (v) { return Math.round(Number(v) || 0).toLocaleString('pt-BR'); };
LOTES_UI.m2 = function (v) { return (Number(v) || 0).toFixed(2).replace('.', ',') + ' m²'; };
LOTES_UI.pct = function (v) { return (Number(v) || 0).toFixed(1).replace('.', ',') + '%'; };

/* Polegada fracionada, denominador variável — pedido do Matt (21/09) pra
   etiqueta: comprimento/largura em 1/16", espessura em 1/4" (chapa só vem
   em espessura padronizada — 1/4" já é precisão de sobra). Mesma lógica de
   mmToFractionalInches (js/client.js, que o erp/ não carrega), só que lá o
   denominador é fixo em 32 — aqui vira parâmetro. */
LOTES_UI._gcd = function (a, b) { return b === 0 ? a : LOTES_UI._gcd(b, a % b); };
LOTES_UI.mmToFraction = function (mm, denom) {
  const totalInches = Math.max(Number(mm) || 0, 0) / 25.4;
  let whole = Math.floor(totalInches);
  let numerator = Math.round((totalInches - whole) * denom);
  if (numerator === denom) { numerator = 0; whole += 1; }
  if (numerator === 0) return whole + '"';
  const divisor = LOTES_UI._gcd(numerator, denom);
  const num = numerator / divisor;
  const den = denom / divisor;
  return (whole > 0 ? whole + ' ' : '') + num + '/' + den + '"';
};

LOTES_UI.toast = function (msg, isError) {
  const el = document.getElementById('lotes-toast');
  if (!el) { if (isError) alert(msg); return; }
  el.className = 'erp-note' + (isError ? ' erp-error' : '');
  el.innerHTML = UI.esc(msg);
  el.style.display = 'block';
  if (!isError) setTimeout(function () { el.style.display = 'none'; }, 4000);
};

LOTES_UI.busy = function (btn, on, textOn) {
  if (!btn) return;
  if (on) { btn._t = btn.textContent; btn.disabled = true; btn.textContent = textOn || 'Aguarde…'; }
  else { btn.disabled = false; if (btn._t) btn.textContent = btn._t; }
};

/* ============================================================
   #/lotes — listagem
   ============================================================ */
LOTES_UI.listLoad = async function () {
  return { batches: await LOTES.batches() };
};

LOTES_UI.list = function (params, d) {
  const cards = d.batches.map(function (b) {
    const pieces = (b.batch_pieces || []).reduce(function (s, p) { return s + (p.quantity || 0); }, 0);
    const plans = (b.cut_plans || []).slice().sort(function (a, c) { return c.version - a.version; });
    const last = plans[0];
    const st = LOTES_UI.BATCH_STATUS[b.status] || LOTES_UI.BATCH_STATUS.planejado;
    return UI.panel(null,
      '<div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:12px">' +
        '<div><div class="erp-strong" style="font-size:15px">' +
          '<a href="#/lotes/' + b.id + '">' + UI.esc(b.code) + '</a>' +
          (b.name ? ' <span class="erp-muted">· ' + UI.esc(b.name) + '</span>' : '') + '</div>' +
        '<div class="erp-muted erp-small">aberto ' + UI.date(b.created_at) +
          (b.target_date ? ' · meta ' + UI.date(b.target_date) : '') + '</div></div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
          /* Plano feito é a informação que o Matt procura no card: sem ela,
             pra saber se o lote já foi cortado tinha que abrir um por um. */
          (last
            ? UI.pill('✓ plano v' + last.version, 'erp-pill-ok')
            : UI.pill('sem plano', 'erp-pill-warn')) +
          UI.pill(st.label, st.pill) +
        '</div>' +
      '</div>' +
      '<div class="erp-grid erp-grid-4" style="margin-bottom:12px">' +
        UI.kpi('Pedidos', (b.batch_orders || []).length, 'no lote') +
        UI.kpi('Peças', pieces, (b.batch_pieces || []).length + ' linhas') +
        (last
          ? UI.kpi('Chapas', last.total_sheets,
              (last.total_offcuts_used ? '+ ' + last.total_offcuts_used + ' retalho(s) · ' : '') +
              'perda ' + LOTES_UI.pct(last.waste_pct))
          : UI.kpi('Chapas', '—', 'depende do plano')) +
        (last
          ? UI.kpi('Plano', 'v' + last.version,
              plans.length > 1 ? plans.length + ' versões · ' + UI.date(last.created_at) : UI.date(last.created_at))
          : UI.kpi('Plano', 'nenhum', 'o lote ainda não foi otimizado')) +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<a class="erp-btn erp-btn-secondary erp-btn-sm" href="#/lotes/' + b.id + '">Abrir lote</a>' +
        (last
          ? '<a class="erp-btn erp-btn-sm" href="#/planos/' + last.id + '">Ver plano v' + last.version + '</a>' +
            '<a class="erp-btn erp-btn-secondary erp-btn-sm" href="#/planos/' + last.id + '/etiquetas">Etiquetas</a>' +
            '<a class="erp-btn erp-btn-ghost erp-btn-sm" href="#/lotes/' + b.id + '/plano">Gerar nova versão</a>'
          : '<a class="erp-btn erp-btn-sm" href="#/lotes/' + b.id + '/plano">Gerar plano de corte</a>') +
        /* Furação sai daqui, do lote — é o lote que vai pra máquina. Não
           depende de ter plano de corte: o plano diz como cortar a chapa, a
           furação vem do cadastro do módulo. São duas saídas independentes
           do mesmo lote. */
        '<button type="button" class="erp-btn erp-btn-secondary erp-btn-sm" ' +
          'onclick="FURACAO_LOTE.gerar(\'' + b.id + '\', this)">Furação (.ban)</button>' +
        '<a class="erp-btn erp-btn-ghost erp-btn-sm" href="#/lotes/' + b.id + '/furacao">Ver furação</a>' +
      '</div>');
  }).join('');

  return UI.head('Lotes de Produção',
    'O lote agrupa pedidos que dividem a mesma cor e a mesma chapa. É o que faz o nesting valer a pena — ' +
    'cortar três pedidos juntos gasta menos chapa que cortar cada um na sua vez.',
    '<a class="erp-btn erp-btn-secondary" href="#/materiais">Materiais</a>' +
    '<a class="erp-btn" href="#/lotes/novo">+ Novo lote</a>') +
    '<div id="lotes-toast" style="display:none"></div>' +
    UI.sourceNote('As peças do lote são explodidas dos PEDIDOS do portal (' +
      '<span class="erp-mono">order_items.breakdown</span> e <span class="erp-mono">cutting_list_items</span>) ' +
      'e congeladas no momento em que o lote é montado. Editar o catálogo depois não muda plano que já foi pro chão de fábrica.') +
    (d.batches.length ? cards : UI.panel(null,
      '<div class="erp-empty"><div class="erp-strong">Nenhum lote ainda.</div>' +
      '<div class="erp-muted erp-small" style="margin:8px 0 14px">Um lote nasce escolhendo os pedidos que vão ser cortados juntos.</div>' +
      '<a class="erp-btn" href="#/lotes/novo">Criar o primeiro lote</a></div>'));
};

/* ============================================================
   #/lotes/novo — montar o lote
   ============================================================ */
LOTES_UI.novoLoad = async function () {
  const [orders, params] = await Promise.all([LOTES.availableOrders(), LOTES.params()]);
  return { orders: orders, params: params };
};

LOTES_UI.novo = function (params, d) {
  const rows = d.orders.map(function (o) {
    const taken = !!o._batch_id;
    const t = DATA.typeMap[o.order_type] || { label: o.order_type || 'Módulos', pill: 'erp-pill-neutral' };
    return {
      pick: '<input type="checkbox" class="lote-order-pick" value="' + o.id + '"' + (taken ? ' disabled' : '') + '>',
      order: '<a href="#/pedidos/' + o.id + '" class="erp-strong">' + UI.esc(o.po_name || ('#' + o.id.slice(0, 8))) + '</a>' +
        (taken ? '<div class="erp-xs erp-muted">já está em <a href="#/lotes/' + o._batch_id + '">outro lote</a></div>' : ''),
      client: UI.esc(DATA.clientLabel(o)),
      type: UI.pill(t.label, t.pill),
      status: UI.pill('Aprovado', 'erp-pill-ok') +
        '<div class="erp-xs erp-muted">liberado ' + UI.date(o.finance_released_at) + '</div>',
      date: UI.date(o.created_at)
    };
  });

  const paramOptions = d.params.map(function (p) {
    return '<option value="' + p.id + '"' + (p.is_default ? ' selected' : '') + '>' + UI.esc(p.name) + '</option>';
  }).join('');

  return UI.crumb([{ label: 'Lotes', href: '#/lotes' }, { label: 'Novo lote' }]) +
    UI.head('Novo lote', 'Escolha os pedidos. As peças são explodidas e congeladas na hora — depois disso, mexer no catálogo não muda este lote.') +
    '<div id="lotes-toast" style="display:none"></div>' +
    UI.panel('Identificação',
      '<div class="erp-grid erp-grid-3">' +
        '<label class="erp-field"><span>Nome (opcional)</span><input type="text" id="lote-nome" placeholder="Ex.: Branco TX 18mm — semana 33"></label>' +
        '<label class="erp-field"><span>Data meta</span><input type="date" id="lote-meta"></label>' +
        '<label class="erp-field"><span>Parâmetro de corte sugerido</span><select id="lote-params">' +
          (paramOptions || '<option value="">(nenhum perfil cadastrado)</option>') + '</select></label>' +
      '</div>' +
      '<label class="erp-field" style="margin-top:10px"><span>Observação</span><input type="text" id="lote-obs" placeholder="Livre"></label>') +
    UI.panel('Pedidos disponíveis',
      '<div class="erp-toolbar"><span class="erp-muted erp-small">' +
        'Só aparece pedido <span class="erp-strong">liberado pelo financeiro</span>. ' +
        'Faltando algum? Ele está na fila da <a href="#/financeiro">Liberação Financeira</a> — ou o cliente ainda não aprovou, ' +
        'e aí ainda é orçamento. Pedido que já está em outro lote fica travado: a mesma peça não se corta duas vezes.' +
        '</span></div>' +
      (d.orders.length ? '' : '<div class="erp-empty"><div class="erp-strong">Nenhum pedido liberado.</div>' +
        '<div class="erp-muted erp-small" style="margin:8px 0 14px">O lote começa pelo financeiro: sem liberação, não há o que cortar.</div>' +
        '<a class="erp-btn" href="#/financeiro">Abrir Liberação Financeira</a></div>') +
      UI.table([
        { key: 'pick', label: '', width: '36px' },
        { key: 'order', label: 'Pedido' },
        { key: 'client', label: 'Cliente' },
        { key: 'type', label: 'Tipo' },
        { key: 'status', label: 'Status' },
        { key: 'date', label: 'Criado' }
      ], rows), true) +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button id="lote-criar-btn" onclick="LOTES_UI.criarLote(this)">Criar lote e carregar peças</button>' +
      '<a class="erp-btn erp-btn-secondary" href="#/lotes">Cancelar</a>' +
    '</div>';
};

LOTES_UI.criarLote = async function (btn) {
  const ids = Array.prototype.slice.call(document.querySelectorAll('.lote-order-pick:checked')).map(function (c) { return c.value; });
  if (!ids.length) { LOTES_UI.toast('Escolha pelo menos um pedido.', true); return; }
  LOTES_UI.busy(btn, true, 'Explodindo as peças…');
  try {
    const batch = await LOTES.createBatch({
      name: document.getElementById('lote-nome').value.trim() || null,
      target_date: document.getElementById('lote-meta').value || null,
      notes: document.getElementById('lote-obs').value.trim() || null,
      params_id: document.getElementById('lote-params').value || null,
      orderIds: ids
    });
    location.hash = '#/lotes/' + batch.id;
  } catch (err) {
    console.error(err);
    LOTES_UI.toast(LOTES.explainError(err), true);
    LOTES_UI.busy(btn, false);
  }
};

/* ============================================================
   #/lotes/:id — o lote, com a listagem de peças
   ============================================================ */
LOTES_UI.detailLoad = async function (p) {
  const [batch, colors] = await Promise.all([LOTES.batch(p.id), LOTES.colors()]);
  if (!batch) return { batch: null };
  return { batch: batch, colors: colors, groups: LOTES.groupPieces(batch._pieces, colors) };
};

LOTES_UI.detail = function (params, d) {
  if (!d.batch) return UI.errorBox('Lote não encontrado', 'Ele pode ter sido apagado.');
  const b = d.batch;
  const st = LOTES_UI.BATCH_STATUS[b.status] || LOTES_UI.BATCH_STATUS.planejado;
  const totalPieces = b._pieces.reduce(function (s, p) { return s + p.quantity; }, 0);
  const totalArea = d.groups.reduce(function (s, g) { return s + g.area_m2; }, 0);
  const totalEdge = d.groups.reduce(function (s, g) { return s + g.edge_m; }, 0);
  const hasPlan = b._plans.length > 0;

  /* Listagem de peças por grupo de material. É a "separação do lote": a
     bancada não trabalha por pedido, trabalha por cor+espessura, porque é
     assim que a chapa entra na seccionadora. */
  const groupsHtml = d.groups.map(function (g) {
    const rows = g.rows.map(function (r) {
      return {
        mod: '<span class="erp-strong erp-small">' + UI.esc(r.module_name || '—') + '</span>' +
          (r.client_name ? '<div class="erp-xs erp-muted">' + UI.esc(r.client_name) + '</div>' : ''),
        ref: '<span class="erp-mono erp-xs">' + UI.esc(r.reference || '—') + '</span>',
        desc: '<span class="erp-small">' + UI.esc(r.description || '—') + '</span>',
        comp: LOTES_UI.mm(r.comprimento_mm),
        larg: LOTES_UI.mm(r.largura_mm),
        esp: LOTES_UI.mm(r.espessura_mm),
        veio: r.has_grain ? UI.pill('sim', 'erp-pill-warn') : '<span class="erp-muted erp-xs">não</span>',
        fita: r.edge_banding ? (r.edge_banding + ' lados')
          : (Number(r.edge_band_m) ? (Number(r.edge_band_m).toFixed(2).replace('.', ',') + ' m') : '—'),
        qty: '<span class="erp-strong">' + r.quantity + '</span>',
        acao: r.source === 'manual'
          ? '<button class="erp-btn-ghost erp-btn-sm" onclick="LOTES_UI.removerPeca(\'' + r.id + '\')">remover</button>'
          : '<span class="erp-xs erp-muted">' + (r.source === 'cutting_list' ? 'planilha' : 'módulo') + '</span>'
      };
    });
    const semCor = !g.color_id;
    return UI.panel(null,
      '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
        '<div><div class="erp-strong">' + UI.swatch(g.color && g.color.swatch_hex, g.color_name) +
          ' · ' + LOTES_UI.mm(g.espessura_mm) + ' mm</div>' +
          '<div class="erp-muted erp-small">' + g.qty + ' peças · ' + LOTES_UI.m2(g.area_m2) +
          ' · fita ' + g.edge_m.toFixed(2).replace('.', ',') + ' m</div></div>' +
        (semCor ? UI.pill('sem cor — não entra no nesting', 'erp-pill-danger') : '') +
      '</div>' +
      (semCor ? '<div class="erp-note">Estas peças não têm cor definida no pedido, então não dá pra saber qual chapa usar. ' +
        'Confira o pedido de origem (cor por papel, <span class="erp-mono">selected_colors</span>) — ou acrescente a peça na mão com a cor certa.</div>' : '') +
      UI.table([
        { key: 'mod', label: 'Módulo / Cliente' },
        { key: 'ref', label: 'Ref.' },
        { key: 'desc', label: 'Descrição' },
        { key: 'comp', label: 'Compr. (mm)', align: 'right' },
        { key: 'larg', label: 'Larg. (mm)', align: 'right' },
        { key: 'esp', label: 'Esp.', align: 'right' },
        { key: 'veio', label: 'Veio' },
        { key: 'fita', label: 'Fita' },
        { key: 'qty', label: 'Qtd', align: 'right' },
        { key: 'acao', label: '' }
      ], rows));
  }).join('');

  const plansRows = b._plans.map(function (p) {
    const ps = LOTES_UI.PLAN_STATUS[p.status] || LOTES_UI.PLAN_STATUS.salvo;
    return {
      _href: '#/planos/' + p.id,
      v: '<span class="erp-mono erp-strong">v' + p.version + '</span>',
      code: '<span class="erp-mono erp-xs">' + UI.esc(p.code || '—') + '</span>',
      when: UI.date(p.created_at),
      sheets: p.total_sheets,
      offc: p.total_offcuts_used,
      pieces: p.total_pieces,
      waste: LOTES_UI.pct(p.waste_pct),
      strat: (p.params_snapshot && p.params_snapshot.strategy === 'maxrects')
        ? UI.pill('MaxRects', 'erp-pill-warn') : UI.pill('Guilhotina', 'erp-pill-neutral'),
      status: UI.pill(ps.label, ps.pill)
    };
  });

  /* O plano corrente é a maior versão. _plans já vem ordenado desc por
     version (LOTES.batch), mas não custa não depender disso. */
  const atual = hasPlan
    ? b._plans.slice().sort(function (x, y) { return y.version - x.version; })[0]
    : null;

  /* Faixa "já foi feito" — pedido do Matt: o lote tem que dizer, de cara, que
     o plano existe. Vem ANTES dos números do lote de propósito: é a primeira
     pergunta de quem abre a tela ("esse já cortei?"). */
  const faixaPlano = atual
    ? UI.panel(null,
        '<div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center">' +
          '<div>' +
            '<div class="erp-strong" style="font-size:15px">' +
              UI.pill('✓ plano de corte feito', 'erp-pill-ok') +
              ' <a href="#/planos/' + atual.id + '" class="erp-mono">' + UI.esc(atual.code || ('v' + atual.version)) + '</a>' +
            '</div>' +
            '<div class="erp-muted erp-small" style="margin-top:4px">' +
              'Versão ' + atual.version + ' de ' + b._plans.length + ' · gerado em ' + UI.date(atual.created_at) +
              ' · ' + atual.total_sheets + ' chapa(s) nova(s)' +
              (atual.total_offcuts_used ? ' + ' + atual.total_offcuts_used + ' retalho(s)' : '') +
              ' · ' + atual.total_pieces + ' peças · perda ' + LOTES_UI.pct(atual.waste_pct) +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            '<a class="erp-btn erp-btn-sm" href="#/planos/' + atual.id + '">Abrir plano</a>' +
            '<a class="erp-btn erp-btn-secondary erp-btn-sm" href="#/planos/' + atual.id + '/etiquetas">Etiquetas</a>' +
            '<a class="erp-btn erp-btn-ghost erp-btn-sm" href="#/lotes/' + b.id + '/plano">Gerar nova versão</a>' +
          '</div>' +
        '</div>')
    : UI.panel(null,
        '<div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center">' +
          '<div><div class="erp-strong">' + UI.pill('sem plano de corte', 'erp-pill-warn') + '</div>' +
          '<div class="erp-muted erp-small" style="margin-top:4px">As peças estão congeladas e prontas. Falta otimizar a chapa.</div></div>' +
          '<a class="erp-btn erp-btn-sm" href="#/lotes/' + b.id + '/plano">Gerar plano de corte</a>' +
        '</div>');

  return UI.crumb([{ label: 'Lotes', href: '#/lotes' }, { label: b.code }]) +
    UI.head(b.code + (b.name ? ' — ' + b.name : ''),
      'Peças congeladas em ' + UI.date(b.created_at) + '. ' +
      (hasPlan ? 'Este lote já tem plano salvo — recarregar as peças criaria divergência com o que foi pro chão de fábrica.'
               : 'Ainda sem plano salvo: dá pra recarregar as peças se o pedido mudou.'),
      /* Duas saídas do lote, lado a lado: o plano diz como cortar a chapa, a
         furação diz onde furar cada peça. Uma não depende da outra — dá pra
         tirar o .ban antes mesmo de otimizar o corte. */
      '<button type="button" class="erp-btn erp-btn-secondary" ' +
        'onclick="FURACAO_LOTE.gerar(\'' + b.id + '\', this)">Furação (.ban)</button> ' +
      /* Lote cortado ANTES da migration 160 (espessura por cor, plywood 18):
         as peças já existem com a medida antiga (base W-39), só a furação
         precisa acompanhar a espessura real. Ver FURACAO_LOTE.
         _aplicarEspessuraSoNoEixo. Lote novo não precisa deste botão. */
      '<button type="button" class="erp-btn erp-btn-ghost erp-btn-sm" ' +
        'title="Só pra lote cortado antes da espessura por cor: mantém as medidas do plano (19.5) e ajusta apenas a espessura da chapa na furação" ' +
        'onclick="FURACAO_LOTE.gerar(\'' + b.id + '\', this, { medidasComoCortadas: true })">.ban (lote já cortado)</button> ' +
    '<a class="erp-btn erp-btn-ghost erp-btn-sm" href="#/lotes/' + b.id + '/furacao">Ver furação</a> ' +
      (atual
        ? '<a class="erp-btn" href="#/planos/' + atual.id + '">Ver plano v' + atual.version + '</a>'
        : '<a class="erp-btn" href="#/lotes/' + b.id + '/plano">Gerar plano de corte</a>')) +
    '<div id="lotes-toast" style="display:none"></div>' +
    faixaPlano +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:18px">' +
      UI.kpi('Status', UI.pill(st.label, st.pill), (b.batch_orders || b._orders || []).length + ' pedidos') +
      UI.kpi('Peças', totalPieces, b._pieces.length + ' linhas em ' + d.groups.length + ' materiais') +
      UI.kpi('Área', LOTES_UI.m2(totalArea), 'chapa necessária, sem perda') +
      UI.kpi('Fita', totalEdge.toFixed(1).replace('.', ',') + ' m', 'borda a colar') +
    '</div>' +
    UI.panel('Pedidos do lote',
      (b._orders.length
        ? '<div style="display:flex;gap:8px;flex-wrap:wrap">' + b._orders.map(function (o) {
            return '<a class="erp-btn erp-btn-secondary erp-btn-sm" href="#/pedidos/' + o.id + '">' +
              UI.esc(o.po_name || ('#' + o.id.slice(0, 8))) + ' · ' + UI.esc(DATA.clientLabel(o)) + '</a>';
          }).join('') + '</div>'
        : '<span class="erp-muted erp-small">Nenhum pedido vinculado.</span>') +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
        (hasPlan
          ? '<span class="erp-muted erp-small">Recarregar peças está bloqueado: existe plano salvo.</span>'
          : '<button class="erp-btn-secondary erp-btn-sm" onclick="LOTES_UI.recarregarPecas(\'' + b.id + '\', this)">Recarregar peças dos pedidos</button>') +
        '<button class="erp-btn-danger erp-btn-sm" onclick="LOTES_UI.apagarLote(\'' + b.id + '\')">Apagar lote</button>' +
      '</div>') +
    UI.panel('Histórico de planos',
      UI.table([
        { key: 'v', label: 'Versão' },
        { key: 'code', label: 'Código' },
        { key: 'when', label: 'Gerado' },
        { key: 'sheets', label: 'Chapas novas', align: 'right' },
        { key: 'offc', label: 'Retalhos usados', align: 'right' },
        { key: 'pieces', label: 'Peças', align: 'right' },
        { key: 'waste', label: 'Perda', align: 'right' },
        { key: 'strat', label: 'Estratégia' },
        { key: 'status', label: 'Status' }
      ], plansRows), true) +
    '<h2 style="margin:22px 0 10px;font-size:15px">Peças do lote, por material</h2>' +
    (groupsHtml || UI.panel(null, '<div class="erp-empty">Nenhuma peça neste lote.</div>')) +
    LOTES_UI.addPieceForm(b.id, d.colors);
};

LOTES_UI.addPieceForm = function (batchId, colors) {
  const colorOpts = '<option value="">— escolher —</option>' + colors.map(function (c) {
    return '<option value="' + c.id + '">' + UI.esc(c.name) + '</option>';
  }).join('');
  return UI.panel('Acrescentar peça na mão',
    '<div class="erp-muted erp-small" style="margin-bottom:10px">Reposição, quebra, amostra — peça que não veio de pedido nenhum. ' +
      'Ela fica marcada como <span class="erp-mono">manual</span> e sobrevive ao "recarregar peças".</div>' +
    '<div class="erp-grid erp-grid-4">' +
      '<label class="erp-field"><span>Descrição</span><input type="text" id="np-desc" placeholder="Lateral esquerda"></label>' +
      '<label class="erp-field"><span>Módulo/origem</span><input type="text" id="np-mod" placeholder="Reposição"></label>' +
      '<label class="erp-field"><span>Cor</span><select id="np-cor">' + colorOpts + '</select></label>' +
      '<label class="erp-field"><span>Espessura (mm)</span><input type="number" id="np-esp" value="18" min="1" step="0.1"></label>' +
      '<label class="erp-field"><span>Comprimento (mm)</span><input type="number" id="np-comp" min="1" step="1"></label>' +
      '<label class="erp-field"><span>Largura (mm)</span><input type="number" id="np-larg" min="1" step="1"></label>' +
      '<label class="erp-field"><span>Fita</span><select id="np-fita"><option value="0">sem fita</option>' +
        '<option value="2">2 lados (comprimento)</option><option value="4">4 lados</option></select></label>' +
      '<label class="erp-field"><span>Quantidade</span><input type="number" id="np-qtd" value="1" min="1" step="1"></label>' +
    '</div>' +
    '<label style="display:flex;gap:8px;align-items:center;margin:10px 0"><input type="checkbox" id="np-veio"> ' +
      '<span class="erp-small">Tem veio (não pode girar na chapa)</span></label>' +
    '<button class="erp-btn-secondary erp-btn-sm" onclick="LOTES_UI.adicionarPeca(\'' + batchId + '\', this)">Acrescentar peça</button>');
};

LOTES_UI.adicionarPeca = async function (batchId, btn) {
  const v = function (id) { const el = document.getElementById(id); return el ? el.value : ''; };
  const comp = Number(v('np-comp')), larg = Number(v('np-larg')), esp = Number(v('np-esp'));
  if (!(comp > 0) || !(larg > 0) || !(esp > 0)) { LOTES_UI.toast('Preencha comprimento, largura e espessura.', true); return; }
  const colorId = v('np-cor');
  if (!colorId) { LOTES_UI.toast('Escolha a cor — sem ela a peça não entra no nesting.', true); return; }
  const colors = await LOTES.colors();
  const color = colors.find(function (c) { return c.id === colorId; });
  /* Normaliza igual às peças que vêm do pedido: comprimento é sempre o maior
     lado. Se o usuário digitar trocado, a peça não vira um caso diferente. */
  const dims = LOTES.sortCutDims(comp, larg, esp);
  LOTES_UI.busy(btn, true, 'Salvando…');
  try {
    await LOTES.addPiece(batchId, {
      module_name: v('np-mod') || 'Manual',
      reference: 'MANUAL',
      description: v('np-desc') || '—',
      comprimento_mm: dims.comprimento_mm,
      largura_mm: dims.largura_mm,
      espessura_mm: dims.espessura_mm,
      quantity: Math.max(1, Math.round(Number(v('np-qtd'))) || 1),
      color_id: colorId,
      color_name: color ? color.name : null,
      edge_banding: Number(v('np-fita')) || 0,
      has_grain: document.getElementById('np-veio').checked
    });
    APP.render();
  } catch (err) {
    console.error(err);
    LOTES_UI.toast(LOTES.explainError(err), true);
    LOTES_UI.busy(btn, false);
  }
};

LOTES_UI.removerPeca = async function (id) {
  if (!confirm('Remover esta peça do lote?')) return;
  try { await LOTES.deletePiece(id); APP.render(); }
  catch (err) { LOTES_UI.toast(LOTES.explainError(err), true); }
};

LOTES_UI.recarregarPecas = async function (batchId, btn) {
  if (!confirm('Isso apaga as peças vindas dos pedidos e explode tudo de novo do estado ATUAL deles.\n\nPeças acrescentadas na mão são mantidas. Continuar?')) return;
  LOTES_UI.busy(btn, true, 'Recarregando…');
  try { await LOTES.reloadPieces(batchId); APP.render(); }
  catch (err) { console.error(err); LOTES_UI.toast(LOTES.explainError(err), true); LOTES_UI.busy(btn, false); }
};

LOTES_UI.apagarLote = async function (batchId) {
  if (!confirm('Apagar o lote apaga TAMBÉM os planos dele e as sobras que esses planos cadastraram.\n\nRetalho que os planos consumiram NÃO volta pro estoque por aqui — pra isso, apague plano a plano antes. Continuar?')) return;
  try { await LOTES.deleteBatch(batchId); location.hash = '#/lotes'; }
  catch (err) { LOTES_UI.toast(LOTES.explainError(err), true); }
};

/* ============================================================
   #/lotes/:id/plano — gerar o plano
   ============================================================ */
LOTES_UI.planNewLoad = async function (p) {
  const [batch, colors, sizes, paramList] = await Promise.all([
    LOTES.batch(p.id), LOTES.colors(), LOTES.sheetSizes(), LOTES.params()
  ]);
  if (!batch) return { batch: null };
  const groups = LOTES.groupPieces(batch._pieces, colors);
  /* Quantos retalhos existem hoje pra cada material — mostrado ANTES de gerar,
     porque é informação que muda a decisão do operador ("tenho 4 sobras dessa
     cor, vale rodar agora"). */
  for (let i = 0; i < groups.length; i++) {
    groups[i].offcuts = groups[i].color_id
      ? await LOTES.availableOffcutsFor(groups[i].color_id, groups[i].espessura_mm, 'menor_primeiro')
      : [];
  }
  return { batch: batch, colors: colors, sizes: sizes, paramList: paramList, groups: groups };
};

LOTES_UI.planNew = function (params, d) {
  if (!d.batch) return UI.errorBox('Lote não encontrado', '');
  const b = d.batch;
  LOTES_UI._state = { batch: b, groups: d.groups, sizes: d.sizes, paramList: d.paramList };
  LOTES_UI._draft = null;

  const usable = d.groups.filter(function (g) { return g.color_id; });
  const sizeOptions = d.sizes.map(function (s) {
    return '<option value="' + s.id + '">' + UI.esc(s.name) + ' — ' + LOTES_UI.mm(s.width_mm) + ' × ' + LOTES_UI.mm(s.height_mm) + ' mm</option>';
  }).join('');

  const groupRows = usable.map(function (g) {
    const def = g.color && g.color.default_sheet_size_id ? g.color.default_sheet_size_id : '';
    const opts = sizeOptions.replace('value="' + def + '"', 'value="' + def + '" selected');
    return '<tr>' +
      '<td><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="plano-grupo" value="' + g.key + '" checked> ' +
        UI.swatch(g.color && g.color.swatch_hex, g.color_name) + '</label></td>' +
      '<td class="erp-num">' + LOTES_UI.mm(g.espessura_mm) + '</td>' +
      '<td class="erp-num">' + g.qty + '</td>' +
      '<td class="erp-num">' + LOTES_UI.m2(g.area_m2) + '</td>' +
      '<td>' + (g.offcuts.length
        ? UI.pill(g.offcuts.length + ' no estoque', 'erp-pill-ok')
        : '<span class="erp-muted erp-xs">nenhum</span>') + '</td>' +
      '<td><select class="plano-chapa" data-key="' + g.key + '">' +
        (sizeOptions ? opts : '<option value="">(cadastre tamanhos de chapa no admin)</option>') + '</select>' +
        (def ? '' : '<div class="erp-xs erp-muted">esta cor não tem chapa padrão — escolha na mão</div>') + '</td>' +
      '</tr>';
  }).join('');

  const semCor = d.groups.filter(function (g) { return !g.color_id; });

  return UI.crumb([{ label: 'Lotes', href: '#/lotes' }, { label: b.code, href: '#/lotes/' + b.id }, { label: 'Gerar plano' }]) +
    UI.head('Gerar plano de corte — ' + b.code,
      'Gerar não mexe em nada: é rascunho na tela. O estoque de retalho só muda quando você clicar em Salvar.') +
    '<div id="lotes-toast" style="display:none"></div>' +
    (semCor.length ? '<div class="erp-error"><div class="erp-error-title">' + semCor.length +
      ' grupo(s) sem cor ficam de fora</div><div class="erp-error-detail">Sem cor não dá pra saber a chapa. ' +
      'Volte no lote e corrija a peça, ou siga sem ela.</div></div>' : '') +
    LOTES_UI.paramsPanel(d.paramList) +
    UI.panel('Materiais deste lote',
      '<table class="erp-table"><thead><tr><th>Cor</th><th class="erp-num">Esp. (mm)</th><th class="erp-num">Peças</th>' +
      '<th class="erp-num">Área</th><th>Retalhos</th><th style="width:280px">Chapa nova a usar</th></tr></thead><tbody>' +
      (groupRows || '<tr><td colspan="6"><div class="erp-empty">Nenhum material utilizável neste lote.</div></td></tr>') +
      '</tbody></table>', true) +
    '<div style="display:flex;gap:8px;margin:14px 0">' +
      '<button id="plano-gerar-btn" onclick="LOTES_UI.gerarPlano(this)">Gerar plano</button>' +
      '<a class="erp-btn erp-btn-secondary" href="#/lotes/' + b.id + '">Voltar ao lote</a>' +
    '</div>' +
    '<div id="plano-resultado"></div>';
};

/* Painel de parâmetros: carrega um perfil salvo e deixa ajustar na hora sem
   alterar o perfil. O que roda é sempre o que está na tela — e é isso que vai
   pra params_snapshot do plano salvo. */
LOTES_UI.paramsPanel = function (paramList) {
  const opts = paramList.map(function (p) {
    return '<option value="' + p.id + '"' + (p.is_default ? ' selected' : '') + '>' + UI.esc(p.name) + (p.is_default ? ' (padrão)' : '') + '</option>';
  }).join('');
  const def = paramList.find(function (p) { return p.is_default; }) || paramList[0] || LOTES.PARAM_DEFAULTS;

  const num = function (id, label, val, step) {
    return '<label class="erp-field"><span>' + label + '</span>' +
      '<input type="number" id="' + id + '" value="' + (val != null ? val : 0) + '" step="' + (step || 1) + '" min="0"></label>';
  };
  const chk = function (id, label, val) {
    return '<label style="display:flex;gap:8px;align-items:center;padding:6px 0">' +
      '<input type="checkbox" id="' + id + '"' + (val ? ' checked' : '') + '> <span class="erp-small">' + label + '</span></label>';
  };

  return UI.panel('Parâmetros do corte',
    '<div class="erp-toolbar">' +
      '<select id="par-perfil" onchange="LOTES_UI.aplicarPerfil()">' + (opts || '<option value="">(sem perfil)</option>') + '</select>' +
      '<a class="erp-btn erp-btn-secondary erp-btn-sm" href="#/parametros-corte">Editar perfis</a>' +
      '<span class="erp-muted erp-small">Ajustar aqui vale só para esta geração — o perfil salvo não muda.</span>' +
    '</div>' +
    '<div class="erp-grid erp-grid-4" style="margin-top:10px">' +
      num('par-kerf', 'Serra / kerf (mm)', def.kerf_mm, 0.1) +
      num('par-tl', 'Refile esquerda (mm)', def.trim_left_mm) +
      num('par-tr', 'Refile direita (mm)', def.trim_right_mm) +
      num('par-tt', 'Refile topo (mm)', def.trim_top_mm) +
      num('par-tb', 'Refile base (mm)', def.trim_bottom_mm) +
      num('par-tret', 'Refile do retalho (mm)', def.trim_retalho_mm != null ? def.trim_retalho_mm : NESTING.RETALHO_TRIM_DEFAULT_MM) +
      num('par-minw', 'Retalho mín. — lado maior (mm)', def.min_offcut_width_mm) +
      num('par-minh', 'Retalho mín. — lado menor (mm)', def.min_offcut_height_mm) +
      '<label class="erp-field"><span>Prioridade do retalho</span><select id="par-prio">' +
        '<option value="menor_primeiro">Menor primeiro (gasta a sobra pequena)</option>' +
        '<option value="maior_primeiro">Maior primeiro</option>' +
        '<option value="mais_antigo">Mais antigo primeiro</option>' +
      '</select></label>' +
      '<label class="erp-field"><span>Estratégia</span><select id="par-strat">' +
        '<option value="guilhotina">Guilhotina — a seccionadora corta</option>' +
        '<option value="maxrects">MaxRects — aproveita mais, corte não passante</option>' +
      '</select></label>' +
      '<label class="erp-field"><span>Primeiro corte</span><select id="par-firstcut">' +
        '<option value="auto">Automático</option>' +
        '<option value="horizontal">Horizontal (transversal)</option>' +
        '<option value="vertical">Vertical (longitudinal)</option>' +
      '</select></label>' +
      // Empilhamento (pedido do Matt, 21/09-15): "material" só empilha
      // quando não custa chapa; "empilhar" aceita até 1 chapa a mais por
      // material pra fechar mais pilhas (ver NESTING._solveStacked). Só
      // desta geração — não é campo do perfil salvo.
      '<label class="erp-field"><span>Empilhamento (2 chapas)</span><select id="par-stack">' +
        '<option value="material">Empilhar só quando não gasta chapa a mais</option>' +
        '<option value="nenhum">Aproveitar melhor a chapa — 1 a 1, sem empilhar</option>' +
        '<option value="empilhar">Empilhar mais — aceita até 1 chapa a mais</option>' +
      '</select></label>' +
    '</div>' +
    '<div class="erp-grid erp-grid-3" style="margin-top:6px">' +
      chk('par-rot', 'Permitir girar a peça 90°', def.allow_rotation) +
      chk('par-veio', 'Respeitar veio (peça com veio nunca gira)', def.respect_grain) +
      chk('par-retalho', 'Usar retalhos do estoque antes de chapa nova', def.use_offcuts) +
    '</div>' +
    '<div class="erp-grid erp-grid-3" style="margin-top:6px">' +
      // Pedido do Matt (21/09-19): "aproveitamento melhor com cálculo mais
      // demorado" — ver NESTING._solve (deep_search). Só desta geração.
      chk('par-deep', 'Cálculo demorado — testa muito mais combinações (20 a 60 s)', false) +
      // Pedido do Matt (22/09-4): retalho pequeno só se não custar virada.
      '<label class="erp-field"><span>Retalho grande a partir de (m²)</span>' +
        '<input id="par-bigofc" type="number" step="0.1" min="0" value="1" title="Abaixo disso o retalho só é guardado se não custar nenhuma virada a mais — senão a máquina passa reto."></label>' +
    '</div>' +
    '<div class="erp-note" style="margin-top:6px">O <span class="erp-strong">kerf</span> é a espessura do disco: ' +
      'ele some da chapa a cada corte. O <span class="erp-strong">refile</span> é a borda que você descarta antes de começar. ' +
      'Errar esses dois pra menos é o motivo mais comum de faltar 2 mm na última peça da chapa.</div>');
};

/* <select> não aceita valor selecionado por atributo quando o HTML é montado
   por concatenação sem saber o valor de antemão — e innerHTML não executa
   <script>. Então o roteador chama isto DEPOIS de escrever a tela (rota com
   `after`). Sem esse passo os três selects abrem sempre na primeira opção,
   ignorando o perfil. */
LOTES_UI.afterPlanNew = function () {
  const st = LOTES_UI._state;
  if (!st) return;
  const def = (st.paramList || []).find(function (p) { return p.is_default; }) || (st.paramList || [])[0] || LOTES.PARAM_DEFAULTS;
  const set = function (id, v) { const el = document.getElementById(id); if (el && v != null) el.value = v; };
  set('par-strat', def.strategy);
  set('par-firstcut', def.first_cut);
  set('par-prio', def.offcut_priority);
};

LOTES_UI.aplicarPerfil = async function () {
  const id = document.getElementById('par-perfil').value;
  if (!id) return;
  const p = (LOTES_UI._state.paramList || []).find(function (x) { return x.id === id; });
  if (!p) return;
  const set = function (elId, v) { const el = document.getElementById(elId); if (el) el.value = v; };
  const chk = function (elId, v) { const el = document.getElementById(elId); if (el) el.checked = !!v; };
  set('par-kerf', p.kerf_mm); set('par-tl', p.trim_left_mm); set('par-tr', p.trim_right_mm);
  set('par-tt', p.trim_top_mm); set('par-tb', p.trim_bottom_mm);
  set('par-tret', p.trim_retalho_mm != null ? p.trim_retalho_mm : NESTING.RETALHO_TRIM_DEFAULT_MM);
  set('par-minw', p.min_offcut_width_mm); set('par-minh', p.min_offcut_height_mm);
  set('par-prio', p.offcut_priority); set('par-strat', p.strategy); set('par-firstcut', p.first_cut);
  chk('par-rot', p.allow_rotation); chk('par-veio', p.respect_grain); chk('par-retalho', p.use_offcuts);
};

LOTES_UI.readParams = function () {
  const n = function (id) { const el = document.getElementById(id); return el ? Number(el.value) || 0 : 0; };
  const v = function (id) { const el = document.getElementById(id); return el ? el.value : ''; };
  const c = function (id) { const el = document.getElementById(id); return el ? el.checked : false; };
  const perfilId = v('par-perfil') || null;
  const perfil = (LOTES_UI._state.paramList || []).find(function (x) { return x.id === perfilId; });
  return {
    id: perfilId,
    name: perfil ? perfil.name : 'Ajuste manual',
    kerf_mm: n('par-kerf'),
    trim_left_mm: n('par-tl'), trim_right_mm: n('par-tr'),
    trim_top_mm: n('par-tt'), trim_bottom_mm: n('par-tb'),
    trim_retalho_mm: n('par-tret'),
    min_offcut_width_mm: n('par-minw'), min_offcut_height_mm: n('par-minh'),
    offcut_priority: v('par-prio'), strategy: v('par-strat'), first_cut: v('par-firstcut'),
    stack_mode: v('par-stack') || 'material',
    deep_search: c('par-deep'),
    offcut_big_m2: n('par-bigofc') || 1,
    allow_rotation: c('par-rot'), respect_grain: c('par-veio'), use_offcuts: c('par-retalho'),
    label_prefix: perfil ? perfil.label_prefix : 'PC'
  };
};

LOTES_UI.gerarPlano = async function (btn) {
  const st = LOTES_UI._state;
  if (!st) return;
  const params = LOTES_UI.readParams();
  const picked = {};
  document.querySelectorAll('.plano-grupo:checked').forEach(function (c) { picked[c.value] = true; });
  const sizeByKey = {};
  document.querySelectorAll('.plano-chapa').forEach(function (s) { sizeByKey[s.dataset.key] = s.value; });

  const groups = st.groups.filter(function (g) { return g.color_id && picked[g.key]; });
  if (!groups.length) { LOTES_UI.toast('Marque pelo menos um material.', true); return; }

  LOTES_UI.busy(btn, true, 'Otimizando…');
  const out = [];
  const warnings = [];
  try {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const size = st.sizes.find(function (s) { return s.id === sizeByKey[g.key]; });
      if (!size) { warnings.push(g.color_name + ' ' + g.espessura_mm + 'mm: sem tamanho de chapa escolhido — pulado.'); continue; }

      const pieces = LOTES.expandForNesting(g.rows);
      /* Peça maior que a chapa é erro de cadastro, não de otimização. Avisa
         com nome e medida em vez de gerar plano com peça cortada errado. */
      const tooBig = pieces.filter(function (p) { return !NESTING.pieceFitsSheet(p, size.width_mm, size.height_mm, params); });
      if (tooBig.length) {
        const names = Array.from(new Set(tooBig.map(function (p) { return p.label + ' (' + Math.round(p.w) + '×' + Math.round(p.h) + ')'; })));
        warnings.push(g.color_name + ' ' + g.espessura_mm + 'mm: ' + tooBig.length +
          ' peça(s) não cabem na chapa ' + size.name + ' nem depois do refile — ' + names.slice(0, 4).join(', ') +
          (names.length > 4 ? '…' : '') + '. Ficaram de fora.');
      }
      const ok = pieces.filter(function (p) { return NESTING.pieceFitsSheet(p, size.width_mm, size.height_mm, params); });
      if (!ok.length) continue;

      const offcuts = params.use_offcuts
        ? (await LOTES.availableOffcutsFor(g.color_id, g.espessura_mm, params.offcut_priority)).map(function (o) {
            return { id: o.id, code: o.code, w: Number(o.width_mm), h: Number(o.height_mm), location: o.location };
          })
        : [];

      const newSheet = { sheet_size_id: size.id, name: size.name, w: Number(size.width_mm), h: Number(size.height_mm) };
      const result = NESTING.run({ pieces: ok, offcutBins: offcuts, newSheet: newSheet, params: params });
      /* Comparativo dos 3 modos de empilhamento (pedido do Matt, 21/09-16:
         "quantos planos a menos" — plano = padrão de corte = ciclo de
         máquina; pilha de 2 chapas conta 1). Roda os outros dois modos só
         pra mostrar os números; o rascunho continua sendo o do modo
         escolhido. */
      const compare = {};
      ['material', 'empilhar', 'nenhum'].forEach(function (mode) {
        const r = (mode === (params.stack_mode || 'material')) ? result
          : NESTING.run({ pieces: ok, offcutBins: offcuts, newSheet: newSheet, params: Object.assign({}, params, { stack_mode: mode }) });
        compare[mode] = {
          result: r,
          sheets: r.summary.sheets_new + r.summary.offcuts_used,
          sheets_new: r.summary.sheets_new,
          stacks: r.summary.stacks,
          patterns: r.summary.sheets_new + r.summary.offcuts_used - r.summary.stacks,
          cuts: r.summary.cuts || 0,
          turns: r.summary.turns || 0,
          waste_pct: r.summary.waste_pct,
          waste_net_pct: r.summary.waste_net_pct || 0,
          used_area: r.summary.used_area_mm2, total_area: r.summary.total_area_mm2,
          offcut_area: r.summary.offcut_area_mm2 || 0,
          offcuts: r.summary.offcuts_generated || 0,
          offcuts_used: r.summary.offcuts_used || 0
        };
      });
      out.push({ group: g, result: result, sheetSize: size, compare: compare });
    }

    LOTES_UI._draft = { batch: st.batch, params: params, groups: out, warnings: warnings };
    document.getElementById('plano-resultado').innerHTML = LOTES_UI.renderDraft(LOTES_UI._draft);
    window.scrollTo({ top: document.getElementById('plano-resultado').offsetTop - 20, behavior: 'smooth' });
  } catch (err) {
    console.error(err);
    LOTES_UI.toast(LOTES.explainError(err), true);
  } finally {
    LOTES_UI.busy(btn, false);
  }
};

// Nomes conforme o Matt entende (21/09-20): "aproveitar melhor" = chapa
// 1 a 1, sem pilha; empilhar de graça e empilhar pagando são os outros dois.
LOTES_UI.STACK_MODE_LABEL = { nenhum: 'Aproveitar melhor a chapa (1 a 1)', material: 'Empilhar só quando não gasta chapa', empilhar: 'Empilhar mais (até 1 chapa a mais)' };
LOTES_UI.STACK_MODES = ['nenhum', 'material', 'empilhar'];

LOTES_UI.renderDraft = function (draft) {
  let sheets = 0, offc = 0, pieces = 0, used = 0, total = 0, novos = 0, novosArea = 0, stacks = 0;
  const zero = function () { return { sheets: 0, patterns: 0, stacks: 0, turns: 0, cuts: 0, used: 0, total: 0, offc: 0, noffc: 0, uoffc: 0 }; };
  const cmp = { material: zero(), empilhar: zero(), nenhum: zero() };
  draft.groups.forEach(function (g) {
    sheets += g.result.summary.sheets_new;
    offc += g.result.summary.offcuts_used;
    pieces += g.result.summary.pieces_placed;
    used += g.result.summary.used_area_mm2;
    total += g.result.summary.total_area_mm2;
    novos += g.result.summary.offcuts_generated;
    stacks += g.result.summary.stacks || 0;
    g.result.sheets.forEach(function (sh) { sh.offcuts.forEach(function (o) { novosArea += o.w * o.h; }); });
    Object.keys(cmp).forEach(function (m) {
      if (g.compare && g.compare[m]) {
        const v = g.compare[m];
        cmp[m].sheets += v.sheets; cmp[m].patterns += v.patterns; cmp[m].stacks += v.stacks || 0; cmp[m].turns += v.turns || 0; cmp[m].cuts += v.cuts || 0;
        cmp[m].used += v.used_area || 0; cmp[m].total += v.total_area || 0; cmp[m].offc += v.offcut_area || 0; cmp[m].noffc += v.offcuts || 0; cmp[m].uoffc += v.offcuts_used || 0;
      }
    });
  });
  const waste = total > 0 ? (1 - used / total) * 100 : 0;
  const totalSheets = sheets + offc;                 // chapas físicas (novas + retalhos)
  const patterns = totalSheets - stacks;             // planos de corte = ciclos de máquina
  const modeNow = draft.params.stack_mode || 'material';
  const pct = function (n, d) { return d > 0 ? LOTES_UI.pct(100 * n / d) : '—'; };
  /* Cartões de decisão (pedido do Matt, 21/09-18: "bem visual pra tomar
     decisão"): um por modo, com planos de corte e chapas em número grande
     e a DIFERENÇA em relação ao modo escolhido (verde = ganha, vermelho =
     paga). O botão troca o rascunho pro outro modo na hora — os 3
     resultados já foram calculados em gerarPlano, não recalcula nada. */
  const comparativo = draft.groups.some(function (g) { return g.compare; })
    ? (function () {
        const base = cmp[modeNow];
        const delta = function (n, unit, goodWhenNegative) {
          if (n === 0) return '<span class="erp-muted">igual</span>';
          const good = goodWhenNegative ? n < 0 : n > 0;
          const txt = (n > 0 ? '+' : '\u2212') + Math.abs(n) + ' ' + unit + (Math.abs(n) === 1 ? '' : 's');
          return '<span style="font-weight:800;color:' + (good ? '#2f6b3d' : '#b23a3a') + '">' + txt + '</span>';
        };
        const cards = LOTES_UI.STACK_MODES.map(function (m) {
          const v = cmp[m];
          const sel = m === modeNow;
          const dPl = v.patterns - base.patterns, dCh = v.sheets - base.sheets;
          return '<div style="border:2px solid ' + (sel ? 'var(--accent)' : '#e3dfd6') + ';border-radius:8px;padding:12px 14px;background:' + (sel ? '#fbf7ee' : '#fff') + '">' +
            '<div class="erp-small" style="font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#7c766c;margin-bottom:8px">' +
              LOTES_UI.STACK_MODE_LABEL[m] + (sel ? ' <span class="erp-pill erp-pill-ok">escolhido</span>' : '') + '</div>' +
            '<div style="display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap">' +
              '<div><div style="font-size:28px;font-weight:800;line-height:1">' + v.patterns + '</div><div class="erp-xs erp-muted">planos de corte<br>(ciclos de máquina)</div></div>' +
              '<div><div style="font-size:28px;font-weight:800;line-height:1">' + v.sheets + '</div><div class="erp-xs erp-muted">chapas<br>(' + (v.stacks || 0) + ' pilha' + (v.stacks === 1 ? '' : 's') + ')</div></div>' +
              '<div><div style="font-size:28px;font-weight:800;line-height:1">' + v.turns + '</div><div class="erp-xs erp-muted">viradas<br>(' + v.cuts + ' cortes)</div></div>' +
              '<div><div style="font-size:28px;font-weight:800;line-height:1">' + LOTES_UI.pct(v.total > 0 ? Math.max(0, (v.total - v.used - v.offc) / v.total) * 100 : 0) + '</div>' +
                '<div class="erp-xs erp-muted">quebra real<br>(bruta ' + LOTES_UI.pct(v.total > 0 ? (1 - v.used / v.total) * 100 : 0) + ')</div></div>' +
              '<div><div style="font-size:28px;font-weight:800;line-height:1">' + v.uoffc + '</div><div class="erp-xs erp-muted">retalhos<br>usados</div></div>' +
              '<div><div style="font-size:28px;font-weight:800;line-height:1">' + v.noffc + '</div><div class="erp-xs erp-muted">retalhos<br>gerados (' + LOTES_UI.m2(v.offc / 1e6) + ')</div></div>' +
            '</div>' +
            // Quebra por material (pedido do Matt, 22/09-5: "coloca quebra
            // pra decidir melhor") — chapas · planos · viradas de cada um.
            (draft.groups.length > 1
              ? '<div class="erp-xs erp-muted" style="margin-top:8px;border-top:1px solid #eae7e0;padding-top:6px">' +
                draft.groups.map(function (g) {
                  const v2 = g.compare && g.compare[m];
                  if (!v2) return '';
                  return '<div><span class="erp-strong">' + UI.esc(g.group.color_name) + ' ' + LOTES_UI.mm(g.group.espessura_mm) + 'mm</span>: ' +
                    v2.sheets + ' chapa' + (v2.sheets === 1 ? '' : 's') + (v2.offcuts_used ? ' (' + v2.offcuts_used + ' retalho' + (v2.offcuts_used === 1 ? '' : 's') + ' usado' + (v2.offcuts_used === 1 ? '' : 's') + ')' : '') + ' · ' + v2.patterns + ' plano' + (v2.patterns === 1 ? '' : 's') +
                    ' · ' + v2.turns + ' virada' + (v2.turns === 1 ? '' : 's') + (v2.stacks ? ' · ' + v2.stacks + ' pilha' + (v2.stacks === 1 ? '' : 's') : '') +
                    ' · quebra ' + LOTES_UI.pct((v2.waste_net_pct || 0) * 100) + ' · ' + (v2.offcuts || 0) + ' retalho' + (v2.offcuts === 1 ? '' : 's') + '</div>';
                }).join('') + '</div>'
              : '') +
            '<div class="erp-small" style="margin-top:10px">' +
              (sel ? '<span class="erp-muted">é o rascunho abaixo</span>'
                   : (function () {
                       const wv = v.total > 0 ? (v.total - v.used - v.offc) / v.total * 100 : 0;
                       const wb = base.total > 0 ? (base.total - base.used - base.offc) / base.total * 100 : 0;
                       const dW = Math.round((wv - wb) * 10) / 10;
                       const dWtxt = dW === 0 ? '<span class="erp-muted">igual</span>'
                         : '<span style="font-weight:800;color:' + (dW < 0 ? '#2f6b3d' : '#b23a3a') + '">' + (dW > 0 ? '+' : '\u2212') + Math.abs(dW).toFixed(1).replace('.', ',') + ' pt quebra</span>';
                       return 'vs. escolhido: ' + delta(dPl, 'plano', true) + ' &nbsp;·&nbsp; ' + delta(dCh, 'chapa', true) + ' &nbsp;·&nbsp; ' + delta(v.turns - base.turns, 'virada', true) + ' &nbsp;·&nbsp; ' + dWtxt +
                         ' &nbsp;·&nbsp; ' + delta(v.uoffc - base.uoffc, 'retalho usado', false) + ' &nbsp;·&nbsp; ' + delta(v.noffc - base.noffc, 'retalho gerado', false);
                     })()) +
            '</div>' +
            (sel ? '' : '<button class="erp-btn-secondary erp-btn-sm" style="margin-top:10px" onclick="LOTES_UI.usarModoEmpilhamento(\'' + m + '\')">Usar este</button>') +
          '</div>';
        }).join('');
        return UI.panel('Empilhar ou aproveitar melhor?',
          '<div class="erp-muted erp-small" style="margin-bottom:10px">Plano de corte = padrão de corte = 1 ciclo da máquina; pilha de 2 chapas iguais conta 1 ciclo. ' +
            'Virada = sub-retângulo que precisa girar pra cortar no outro sentido (pilha conta 1x). ' +
            'Verde é o que você ganha, vermelho o que paga, em relação ao modo escolhido.</div>' +
          '<div class="erp-grid erp-grid-3">' + cards + '</div>');
      })()
    : '';
  const blocks = draft.groups.map(function (g) {
    // Pilhas (empilhamento): detectadas pela geometria, igual ao plano salvo.
    const stacks = NESTING.detectStacks(g.result.sheets.map(function (s, i) { return { s: s, i: i }; }),
      function (o) { return NESTING.sheetSignature(o.s.width, o.s.height, o.s.source, o.s.placed, o.s.offcuts); },
      function (o) { return o.i; });
    const sheetsHtml = g.result.sheets.map(function (sh, i) {
      const isOff = sh.source === 'retalho';
      const st = stacks.byId[i];
      const stackBadge = (st && st.members.length > 1)
        ? ' ' + UI.pill('empilhada: chapas ' + st.members.map(function (m) { return m + 1; }).join(' + '), 'erp-pill-ok')
        : '';
      return '<div style="margin-bottom:18px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px">' +
          '<div class="erp-strong erp-small">Chapa ' + (i + 1) + ' — ' +
            (isOff ? UI.pill('retalho ' + UI.esc(sh.offcut.code), 'erp-pill-ok') : UI.esc(sh.sheet_size_name)) + stackBadge +
            ' <span class="erp-muted">' + LOTES_UI.mm(sh.width) + ' × ' + LOTES_UI.mm(sh.height) + ' mm</span></div>' +
          '<div class="erp-small erp-muted">' + sh.placed.length + ' peças · aproveitamento ' +
            LOTES_UI.pct(sh.usedPct * 100) + ' · ' + sh.offcuts.length + ' sobra(s) aproveitável(is)</div>' +
        '</div>' +
        NESTING.sheetSVG(sh, draft.params) +
        '</div>';
    }).join('');
    return UI.panel(UI.esc(g.group.color_name) + ' · ' + LOTES_UI.mm(g.group.espessura_mm) + ' mm',
      '<div class="erp-grid erp-grid-4" style="margin-bottom:14px">' +
        UI.kpi('Chapas novas', g.result.summary.sheets_new, UI.esc(g.sheetSize.name)) +
        UI.kpi('Planos de corte', (g.result.summary.sheets_new + g.result.summary.offcuts_used - (g.result.summary.stacks || 0)),
          (g.result.summary.stacks ? g.result.summary.stacks + ' pilha(s) de 2' : 'sem pilha') +
          (g.compare ? ' · outros modos: ' + LOTES_UI.STACK_MODES.filter(function (m) { return m !== (draft.params.stack_mode || 'material'); })
            .map(function (m) { return LOTES_UI.STACK_MODE_LABEL[m] + ' ' + g.compare[m].sheets + ' ch/' + g.compare[m].patterns + ' pl'; }).join(', ') : '')) +
        UI.kpi('Viradas', g.result.summary.turns || 0, (g.result.summary.cuts || 0) + ' cortes de máquina') +
        UI.kpi('Retalhos usados', g.result.summary.offcuts_used, 'baixados ao salvar') +
        UI.kpi('Peças', g.result.summary.pieces_placed,
          g.result.summary.pieces_unplaced ? '<span class="erp-pill erp-pill-danger">' + g.result.summary.pieces_unplaced + ' sem lugar</span>' : 'todas posicionadas') +
        UI.kpi('Perda real', LOTES_UI.pct((g.result.summary.waste_net_pct || 0) * 100),
          'bruta ' + LOTES_UI.pct(g.result.summary.waste_pct * 100) + ' · ' + g.result.summary.offcuts_generated + ' sobras viram retalho') +
      '</div>' +
      /* Quais retalhos do estoque entraram (pedido do Matt, 22/09-12: "colocar
         aqui os retalhos usados") — código e medida, na ordem das chapas. */
      (function () {
        const usados = g.result.sheets
          .map(function (sh, i) { return { sh: sh, n: i + 1 }; })
          .filter(function (e) { return e.sh.source === 'retalho' && e.sh.offcut; });
        if (!usados.length) return '';
        return '<div class="erp-small" style="margin:-6px 0 14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
          '<span class="erp-muted">Retalhos usados:</span>' +
          usados.map(function (e) {
            const b = e.sh.offcut;
            return '<span class="erp-pill erp-pill-ok" title="Chapa ' + e.n + ' do plano · ' + e.sh.placed.length + ' peça(s)">' +
              UI.esc(b.code || 'Retalho') + ' ' + LOTES_UI.mm(b.w) + '×' + LOTES_UI.mm(b.h) + ' <span class="erp-muted">(ch. ' + e.n + ')</span></span>';
          }).join('') +
        '</div>';
      })() +
      sheetsHtml);
  }).join('');

  return '<h2 style="margin:20px 0 10px;font-size:15px">Rascunho do plano</h2>' +
    (draft.warnings.length
      ? '<div class="erp-error"><div class="erp-error-title">Atenção</div><div class="erp-error-detail">' +
        draft.warnings.map(UI.esc).join('<br>') + '</div></div>' : '') +
    (draft.params.strategy === 'maxrects'
      ? '<div class="erp-note"><span class="erp-strong">MaxRects:</span> este layout encaixa peça em vão no meio da chapa. ' +
        'A seccionadora SAMACH não faz esse corte — só corte passante. Use pra comparar aproveitamento, não pra mandar pra máquina.</div>' : '') +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:14px">' +
      UI.kpi('Chapas novas', sheets, 'a consumir do estoque') +
      UI.kpi('Planos de corte', patterns, stacks ? stacks + ' pilha(s) de 2 — ' + totalSheets + ' chapas físicas' : totalSheets + ' chapas, nenhuma empilhada') +
      UI.kpi('Retalhos usados', offc, pct(offc, totalSheets) + ' das chapas do plano') +
      UI.kpi('Retalhos gerados', novos, pct(novosArea, total) + ' da área total') +
    '</div>' +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:14px">' +
      UI.kpi('Peças posicionadas', pieces, 'em ' + totalSheets + ' chapa(s)') +
      UI.kpi('Perda real', LOTES_UI.pct(total > 0 ? Math.max(0, (total - used - novosArea) / total) * 100 : 0),
        'bruta ' + LOTES_UI.pct(waste) + ' — ' + LOTES_UI.m2(novosArea / 1000000) + ' ficam em retalho') +
    '</div>' + comparativo +
    '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' +
      '<button onclick="LOTES_UI.salvarPlano(this)">Salvar plano (dá baixa nos retalhos)</button>' +
      '<button class="erp-btn-secondary" onclick="document.getElementById(\'plano-resultado\').innerHTML=\'\';LOTES_UI._draft=null">Descartar rascunho</button>' +
    '</div>' + blocks;
};

/* Troca o rascunho pro outro modo de empilhamento (cartões acima) sem
   recalcular: cada grupo já guarda o resultado dos 3 modos em g.compare. */
LOTES_UI.usarModoEmpilhamento = function (mode) {
  const draft = LOTES_UI._draft;
  if (!draft) return;
  draft.groups.forEach(function (g) {
    if (g.compare && g.compare[mode]) g.result = g.compare[mode].result;
  });
  draft.params = Object.assign({}, draft.params, { stack_mode: mode });
  const sel = document.getElementById('par-stack');
  if (sel) sel.value = mode;
  document.getElementById('plano-resultado').innerHTML = LOTES_UI.renderDraft(draft);
};

LOTES_UI.salvarPlano = async function (btn) {
  const draft = LOTES_UI._draft;
  if (!draft) return;
  LOTES_UI.busy(btn, true, 'Salvando…');
  try {
    const res = await LOTES.savePlan({
      batchId: draft.batch.id,
      batchCode: draft.batch.code,
      groups: draft.groups,
      params: draft.params
    });
    LOTES_UI._draft = null;
    /* Os avisos de estoque nascem no salvar e a tela seguinte é outra — sem
       guardar, eles se perderiam na navegação. São a única pista de que o
       plano consumiu material que o cadastro não tinha. */
    LOTES_UI._saveWarnings = res.estoqueAvisos || [];
    location.hash = '#/planos/' + res.plan.id;
  } catch (err) {
    console.error(err);
    LOTES_UI.toast(LOTES.explainError(err), true);
    LOTES_UI.busy(btn, false);
  }
};

/* ============================================================
   #/planos/:id — plano salvo
   ============================================================ */
LOTES_UI.planLoad = async function (p) {
  return { plan: await LOTES.plan(p.id) };
};

/* Perda REAL do plano salvo: bruta menos a sobra guardada como retalho
   (offcuts_json das chapas) — mesma conta do rascunho (NESTING.run
   waste_net_pct). Em %. */
LOTES_UI.planNetWastePct = function (plan) {
  let total = 0, offc = 0;
  (plan._sheets || []).forEach(function (s) {
    total += Number(s.width_mm) * Number(s.height_mm);
    (s.offcuts_json || []).forEach(function (o) { offc += Number(o.w) * Number(o.h); });
  });
  if (!(total > 0)) return 0;
  return Math.max(0, (total - Number(plan.used_area_mm2) - offc) / total) * 100;
};

LOTES_UI.planView = function (params, d) {
  if (!d.plan) return UI.errorBox('Plano não encontrado', '');
  const plan = d.plan;
  const ps = LOTES_UI.PLAN_STATUS[plan.status] || LOTES_UI.PLAN_STATUS.salvo;
  const snap = plan.params_snapshot || {};

  /* Reconstitui o formato que NESTING.sheetSVG espera a partir do que foi
     gravado. O desenho do histórico é o MESMO desenho do rascunho — se um dia
     divergirem, é bug: a fonte é a mesma função. */
  const stacks = LOTES.planStacks(plan);
  const machineNo = LOTES.sheetMachineNo(plan);
  const indexById = {};
  plan._sheets.forEach(function (s) { indexById[s.id] = s.index_no; });
  const sheetsHtml = plan._sheets.map(function (s) {
    const st = stacks.byId[s.id];
    const stackBadge = (st && st.members.length > 1)
      ? ' ' + UI.pill('empilhada: chapas ' + st.members.map(function (m) { return indexById[m]; }).join(' + '), 'erp-pill-ok')
      : '';
    const sh = {
      width: Number(s.width_mm), height: Number(s.height_mm),
      offcuts: s.offcuts_json || [],
      placed: (s._pieces || []).map(function (p) {
        return {
          x: Number(p.x_mm), y: Number(p.y_mm), w: Number(p.w_mm), h: Number(p.h_mm),
          rotated: p.rotated,
          // code: pieace_code -- pedido do Matt (21/09-4): clicar numa
          // peça no nesting abre o visor 3D dela (#/peca/:codigo,
          // migration 158, ver NESTING.sheetSVG/LOTES_UI.abrirPeca3D).
          piece: { label: p.reference || p.label || '', grain: p.has_grain, code: p.piece_code || null }
        };
      })
    };
    return '<div style="margin-bottom:20px">' +
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:6px">' +
        // Número como a máquina mostra (por material) + posição geral do plano.
        '<div class="erp-strong erp-small" title="Painel ' + (machineNo[s.id] ? machineNo[s.id].n : '?') + ' no arquivo ' + UI.esc(s.color_name || '') +
          ' da máquina · chapa ' + s.index_no + ' na ordem geral do plano">Chapa ' + (machineNo[s.id] ? machineNo[s.id].n + '/' + machineNo[s.id].total : s.index_no) +
          ' <span class="erp-muted" style="font-weight:400">(#' + s.index_no + ' no plano)</span> — ' +
          (s.source === 'retalho' ? UI.pill('retalho', 'erp-pill-ok') : UI.esc(s.sheet_size_name || 'Chapa')) + stackBadge + ' · ' +
          UI.swatch(null, s.color_name) + ' ' + LOTES_UI.mm(s.espessura_mm) + 'mm · ' +
          LOTES_UI.mm(s.width_mm) + ' × ' + LOTES_UI.mm(s.height_mm) + ' mm</div>' +
        '<div class="erp-small erp-muted">' + (s._pieces || []).length + ' peças · aproveitamento ' +
          LOTES_UI.pct(s.used_pct) + '</div>' +
      '</div>' +
      NESTING.sheetSVG(sh, snap) +
      '<div class="erp-xs erp-muted" style="margin-top:4px">' +
        (s._pieces || []).map(function (p) { return '<span class="erp-mono">' + UI.esc(p.piece_code) + '</span> ' + UI.esc(p.reference || ''); }).join(' · ') +
      '</div></div>';
  }).join('');

  const exportBtns = EXPORTC.formats.map(function (f) {
    return '<button class="erp-btn-secondary erp-btn-sm" title="' + UI.esc(f.hint) +
      '" onclick="LOTES_UI.exportar(\'' + f.id + '\')">' + UI.esc(f.label) + '</button>';
  }).join('');

  LOTES_UI._plan = plan;

  return UI.crumb([{ label: 'Lotes', href: '#/lotes' },
      { label: (plan._batch && plan._batch.code) || 'Lote', href: '#/lotes/' + plan.batch_id },
      { label: 'Plano v' + plan.version }]) +
    UI.head('Plano ' + (plan.code || ('v' + plan.version)),
      'Gerado em ' + UI.date(plan.created_at) + ' com o perfil "' + UI.esc(snap.name || '—') + '". ' +
      'Esta versão é imutável: gerar de novo cria a v' + (plan.version + 1) + ', não sobrescreve esta.',
      '<a class="erp-btn" href="#/planos/' + plan.id + '/etiquetas">Etiquetas</a>' +
      (plan.status === 'salvo'
        ? '<button class="erp-btn-secondary" onclick="LOTES_UI.marcarCortado(\'' + plan.id + '\')">Marcar como cortado</button>' : '')) +
    '<div id="lotes-toast" style="display:none"></div>' +
    LOTES_UI.renderSaveWarnings() +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:16px">' +
      UI.kpi('Status', UI.pill(ps.label, ps.pill), 'v' + plan.version) +
      UI.kpi('Chapas novas', plan.total_sheets, plan.total_offcuts_used + ' retalhos usados') +
      UI.kpi('Peças', plan.total_pieces, 'com código de barras') +
      UI.kpi('Perda real', LOTES_UI.pct(LOTES_UI.planNetWastePct(plan)),
        'bruta ' + LOTES_UI.pct(plan.waste_pct) + ' · fita: ' + Number(plan.total_edge_m).toFixed(1).replace('.', ',') + ' m') +
    '</div>' +
    UI.panel('Enviar para a máquina',
      '<div class="erp-muted erp-small" style="margin-bottom:10px">Formato nativo da Samach SawBean confirmado (21/09): o botão abaixo ' +
        'gera uma pasta com o XML de corte (um por material) e as etiquetas de peça e retalho em .emf, do jeito que a máquina espera — ' +
        'sem precisar zipar. Os três CSV continuam aqui como alternativa manual.</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
        '<button class="erp-btn" onclick="MAQUINA_EXPORT.gerar(&quot;' + plan.id + '&quot;, this)">Gerar pasta pra máquina (Samach)</button>' +
      '</div>' +
      /* PDFs de retalho (pedido do Matt, 22/09-15): o que pegar no estoque
         antes de cortar (ordem da máquina) e o que conferir/guardar depois. */
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">' +
        '<button class="erp-btn-secondary" onclick="RETALHOS_PDF.chapas(&quot;' + plan.id + '&quot;, this)"' +
          ' title="Chapas inteiras a separar pro plano, por material e tamanho, com quantidade">Separação de chapas (PDF)</button>' +
        '<button class="erp-btn-secondary" onclick="RETALHOS_PDF.pegar(&quot;' + plan.id + '&quot;, this)"' +
          ' title="Retalhos do estoque que este plano usa, na ordem em que entram na máquina, com código de barras">Retalhos a pegar (PDF)</button>' +
        '<button class="erp-btn-secondary" onclick="RETALHOS_PDF.conferencia(&quot;' + plan.id + '&quot;, this)"' +
          ' title="Sobras que o plano cadastrou como retalho — conferir medida e local depois do corte">Conferência de retalhos (PDF)</button>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + exportBtns + '</div>') +
    UI.panel('Parâmetros usados nesta versão',
      UI.def([
        ['Estratégia', snap.strategy === 'maxrects' ? 'MaxRects (não guilhotinado)' : 'Guilhotina'],
        ['Serra (kerf)', LOTES_UI.mm(snap.kerf_mm) + ' mm'],
        ['Refile', 'E ' + LOTES_UI.mm(snap.trim_left_mm) + ' · D ' + LOTES_UI.mm(snap.trim_right_mm) +
          ' · T ' + LOTES_UI.mm(snap.trim_top_mm) + ' · B ' + LOTES_UI.mm(snap.trim_bottom_mm) + ' mm'],
        ['Refile do retalho', LOTES_UI.mm(NESTING.retalhoTrim(snap)) + ' mm (4 lados)'],
        ['Rotação 90°', snap.allow_rotation ? 'permitida' : 'bloqueada'],
        ['Veio', snap.respect_grain ? 'respeitado' : 'ignorado'],
        ['Retalhos', snap.use_offcuts ? 'usados (' + UI.esc(snap.offcut_priority || '') + ')' : 'não usados'],
        ['Retalho mínimo', LOTES_UI.mm(snap.min_offcut_width_mm) + ' × ' + LOTES_UI.mm(snap.min_offcut_height_mm) + ' mm']
      ])) +
    '<h2 style="margin:20px 0 10px;font-size:15px">Chapas</h2>' + sheetsHtml +
    UI.panel('Zona de perigo',
      '<div class="erp-muted erp-small" style="margin-bottom:10px">Apagar este plano devolve ao estoque os retalhos que ele consumiu ' +
        'e remove as sobras que ele cadastrou. Use quando o plano foi gerado por engano — não depois de cortado.</div>' +
      '<button class="erp-btn-danger erp-btn-sm" onclick="LOTES_UI.apagarPlano(\'' + plan.id + '\', \'' + plan.batch_id + '\')">Apagar plano e reverter estoque</button>');
};

/* Avisos de estoque do último salvamento. Consome ao mostrar (uma vez só) —
   se ficassem, reapareceriam toda vez que alguém abrisse o plano, e aviso que
   não some vira aviso que ninguém lê. */
LOTES_UI.renderSaveWarnings = function () {
  const w = LOTES_UI._saveWarnings;
  if (!w || !w.length) return '';
  LOTES_UI._saveWarnings = null;
  return '<div class="erp-error"><div class="erp-error-title">Plano salvo — mas o estoque tem pendência</div>' +
    '<div class="erp-error-detail">' + w.map(UI.esc).join('\n') + '\n\n' +
    'Ajuste em Materiais. O plano em si está salvo e íntegro.</div></div>';
};

LOTES_UI.exportar = function (formatId) {
  if (!LOTES_UI._plan) return;
  EXPORTC.download(LOTES_UI._plan, formatId);
};

LOTES_UI.marcarCortado = async function (planId) {
  try { await LOTES.setPlanStatus(planId, 'cortado'); APP.render(); }
  catch (err) { LOTES_UI.toast(LOTES.explainError(err), true); }
};

LOTES_UI.apagarPlano = async function (planId, batchId) {
  if (!confirm('Apagar o plano, devolver os retalhos consumidos e remover as sobras que ele gerou?')) return;
  try { await LOTES.deletePlan(planId); location.hash = '#/lotes/' + batchId; }
  catch (err) { LOTES_UI.toast(LOTES.explainError(err), true); }
};

/* ============================================================
   #/planos/:id/etiquetas — folha de etiquetas
   ============================================================ */
LOTES_UI.labelsLoad = async function (p) {
  const plan = await LOTES.plan(p.id);
  /* Bolinha preta = peça vai pra furadeira (FURACAO_LOTE.marcarPecasFuradas).
     Falhar aqui não pode impedir de imprimir etiqueta — sai sem bolinha e
     com aviso na tela. */
  let furErro = null;
  if (plan && plan._pieces.length) {
    try { await FURACAO_LOTE.marcarPecasFuradas(plan.batch_id, plan._pieces); }
    catch (err) { console.error('[etiquetas] não consegui ver quais peças furam:', err); furErro = err; }
  }
  return { plan: plan, furErro: furErro };
};

LOTES_UI.labels = function (params, d) {
  if (!d.plan) return UI.errorBox('Plano não encontrado', '');
  const plan = d.plan;
  const sheetByPiece = {};
  plan._sheets.forEach(function (s) { (s._pieces || []).forEach(function (p) { sheetByPiece[p.id] = s; }); });
  const machineNo = LOTES.sheetMachineNo(plan);

  /* Ordem da etiqueta = ordem de saída da máquina: chapa 1 do começo ao fim,
     depois chapa 2. Assim o operador pega a etiqueta de cima e ela é da peça
     que acabou de sair. */
  // Com empilhamento as duas chapas da pilha saem intercaladas (ver
  // LOTES.piecesInOutputOrder) — mesma ordem da pasta pra máquina.
  const ordered = LOTES.piecesInOutputOrder(plan);

  const cards = ordered.map(function (p) {
    const s = sheetByPiece[p.id];
    // Código da peça só embaixo do código de barras (BARCODE.svg já
    // escreve o texto ali por padrão) — pedido do Matt (21/09), tirei a
    // duplicata que tinha em cima também.
    //
    // Módulo e fita viraram 2 selos grandes, separados e em negrito, cada
    // um com seu rótulo (MÓD / EDGEBAND) — pedido do Matt (21/09): "quero
    // so o numero do modulo, sem mais nenhuma informacao... bem visiveis,
    // negrito e caixa alta" e "fita... so numero... deixa separado pra nao
    // confundir com o numero do modulo". Sem esse rótulo, "014" sozinho do
    // lado de "2" sozinho vira ambíguo pro operador — por isso os dois
    // ficam com prefixo curto em vez de nenhum texto. edge_banding aqui
    // sempre é 0/2/4 (nunca null: erp.cut_plan_pieces.edge_banding é "not
    // null default 0", e LOTES.explodeOrders já clampa o valor antes de
    // gravar) — não tem mais fallback pra metro linear (fita_m), o Matt
    // disse que não precisa mais disso.
    // Zero à ESQUERDA de outro algarismo fica em branco (não o "0" sozinho
    // do Edgeband, que é valor de verdade) — pedido do Matt (21/09): "0"
    // não some, só os zeros de preenchimento do padStart(3) desaparecem
    // ("014" -> " 14", "001" -> "  1", "100" continua "100"). Espaço
    // sem-quebra (&nbsp;) em vez de espaço normal, pra não perder a largura
    // fixa do número (o próprio zero mudo continua ocupando o lugar dele).
    // "001, 003" (caso de módulos fundidos) precisa apagar o zero de CADA
    // grupo, não só do primeiro — por isso separa por vírgula antes de
    // aplicar o regex, em vez de rodar 1x na string inteira.
    const modDigits = p.module_number
      ? p.module_number.split(', ').map(function (n) {
          return UI.esc(n).replace(/^0+(?=[0-9])/, function (zeros) { return '&nbsp;'.repeat(zeros.length); });
        }).join(', ')
      : '';
    const modBadge = p.module_number
      ? '<span class="erp-etq-badge erp-etq-badge-mod"><span class="erp-etq-badge-label">Mód</span>' +
        '<span class="erp-etq-badge-num">' + modDigits + '</span></span>'
      : '';
    const edgeBadge = '<span class="erp-etq-badge erp-etq-badge-edge"><span class="erp-etq-badge-label">Edgeband</span>' +
      '<span class="erp-etq-badge-num">' + (p.edge_banding || 0) + '</span></span>';
    return '<div class="erp-etq">' +
      // Topo: nome da peça à esquerda (onde antes era "chapa N"), material
      // à direita (pedido do Matt, 21/09-3: "deixa o nome da parte do
      // produto no lugar da chapa1, e o plywood coloca la to topo alinhado
      // na direita").
      '<div class="erp-etq-top">' +
        '<span class="erp-etq-part">' + UI.esc(p.reference || '—') + '</span>' +
        '<span class="erp-etq-material">' + UI.esc(p.color_name || '') + '</span>' +
      '</div>' +
      '<div class="erp-etq-bc">' + BARCODE.svg(p.piece_code, { height: 30, narrow: 1.4 }) +
        // Bolinha preta embaixo do código, à direita = vai pra furadeira
        // (tem PC-xxx.ban). Pedido do Matt, 23/09.
        (p._furado ? '<span class="erp-etq-furo" title="Vai pra furadeira"></span>' : '') +
      '</div>' +
      // "chapa N" foi pro lugar que era do material, ao lado da medida em
      // mm (pedido do Matt, 21/09-3: "a chapa1 coloca no lugar do
      // plywood").
      '<div class="erp-etq-dim-row">' +
        '<span class="erp-etq-dim">' + LOTES_UI.mm(p.w_mm) + ' × ' + LOTES_UI.mm(p.h_mm) +
          ' × ' + LOTES_UI.mm(p.espessura_mm) + ' mm' + (p.rotated ? ' ↻' : '') + '</span>' +
        // Número da chapa como a máquina mostra (por material) — LOTES.sheetMachineNo.
        '<span class="erp-etq-sheet">chapa ' + (s && machineNo[s.id] ? machineNo[s.id].n : (s ? s.index_no : '?')) + '</span>' +
      '</div>' +
      // Mesma medida em polegada fracionada — pedido do Matt (21/09):
      // comprimento/largura em 1/16", espessura em 1/4".
      '<div class="erp-etq-in">' + LOTES_UI.mmToFraction(p.w_mm, 16) + ' × ' + LOTES_UI.mmToFraction(p.h_mm, 16) +
        ' × ' + LOTES_UI.mmToFraction(p.espessura_mm, 4) + '</div>' +
      '<div class="erp-etq-badges">' + modBadge + edgeBadge + '</div>' +
      '<div class="erp-etq-line">' + UI.esc(p.module_name || '') + '</div>' +
      // Pedido centralizado logo acima do cliente, os 2 sempre grudados no
      // limite inferior da etiqueta (position:absolute via CSS
      // .erp-etq-po / .erp-etq-client) — pedido do Matt (21/09-2 e
      // 21/09-3). VEIO removido da etiqueta a pedido dele mesmo (21/09-2,
      // "esse veio nao precisa").
      (p.po_name ? '<div class="erp-etq-po">' + UI.esc(p.po_name) + '</div>' : '') +
      '<div class="erp-etq-client">' + UI.esc(p.client_name || '') + '</div>' +
      '</div>';
  }).join('');

  return '<div class="erp-noprint">' +
      UI.crumb([{ label: 'Lotes', href: '#/lotes' },
        { label: (plan._batch && plan._batch.code) || 'Lote', href: '#/lotes/' + plan.batch_id },
        { label: 'Plano v' + plan.version, href: '#/planos/' + plan.id }, { label: 'Etiquetas' }]) +
      UI.head('Etiquetas — ' + (plan.code || ''),
        ordered.length + ' etiquetas, na ordem em que as peças saem da máquina (chapa 1 primeiro). ' +
        'Código de barras em Code 39 — qualquer leitor de mão lê sem configurar. ' +
        (d.furErro ? '<b style="color:var(--danger)">Não consegui verificar a furação — as bolinhas de furadeira NÃO aparecem nesta impressão (ver F12).</b>'
          : '● = peça vai pra furadeira (' + ordered.filter(function (p) { return p._furado; }).length + ' de ' + ordered.length + ').'),
        '<button onclick="window.print()">Imprimir</button>' +
        '<button class="erp-btn-secondary" onclick="LOTES_UI.exportar(\'etiquetas\')">Baixar CSV</button>') +
    '</div>' +
    '<div class="erp-etq-sheet-grid">' + cards + '</div>';
};

/* ============================================================
   #/planos — todos os planos gerados
   ============================================================
   A visão por LOTE (dentro do lote) responde "o que já tentei pra este lote".
   Esta responde "o que a fábrica cortou" — é a lista que o Matt pediu pra
   entrar no menu, e o ponto de partida natural pra reimprimir etiqueta de um
   lote de ontem. */
LOTES_UI.plansLoad = async function () {
  return { plans: await LOTES.allPlans() };
};

LOTES_UI.plansList = function (params, d) {
  const plans = d.plans;
  const salvos = plans.filter(function (p) { return p.status === 'salvo'; });
  const cortados = plans.filter(function (p) { return p.status === 'cortado'; });
  const chapas = plans.reduce(function (s, p) { return s + (p.total_sheets || 0); }, 0);
  const retalhos = plans.reduce(function (s, p) { return s + (p.total_offcuts_used || 0); }, 0);
  /* Perda média ponderada por chapa, não média das médias: um plano de 1 chapa
     com 60% de perda não pode pesar igual a um de 20 chapas com 12%. */
  const totalArea = plans.reduce(function (s, p) { return s + (p.total_sheets || 0) + (p.total_offcuts_used || 0); }, 0);
  const perdaPond = totalArea > 0
    ? plans.reduce(function (s, p) { return s + (p.waste_pct || 0) * ((p.total_sheets || 0) + (p.total_offcuts_used || 0)); }, 0) / totalArea
    : 0;

  const rows = plans.map(function (p) {
    const st = LOTES_UI.PLAN_STATUS[p.status] || LOTES_UI.PLAN_STATUS.salvo;
    const b = p.batches || {};
    const snap = p.params_snapshot || {};
    return {
      _href: '#/planos/' + p.id,
      code: '<span class="erp-mono erp-strong">' + UI.esc(p.code || ('v' + p.version)) + '</span>' +
        '<div class="erp-xs erp-muted">' + UI.date(p.created_at) + '</div>',
      lote: b.code
        ? '<a href="#/lotes/' + b.id + '" class="erp-small">' + UI.esc(b.code) + '</a>' +
          (b.name ? '<div class="erp-xs erp-muted">' + UI.esc(b.name) + '</div>' : '')
        : '<span class="erp-muted erp-xs">—</span>',
      v: 'v' + p.version,
      sheets: p.total_sheets,
      offc: p.total_offcuts_used
        ? UI.pill(String(p.total_offcuts_used), 'erp-pill-ok')
        : '<span class="erp-muted erp-xs">0</span>',
      pieces: p.total_pieces,
      waste: LOTES_UI.pct(p.waste_pct),
      strat: snap.strategy === 'maxrects'
        ? UI.pill('MaxRects', 'erp-pill-warn') : UI.pill('Guilhotina', 'erp-pill-neutral'),
      status: UI.pill(st.label, st.pill),
      acao: '<a class="erp-btn erp-btn-ghost erp-btn-sm" href="#/planos/' + p.id + '/etiquetas">Etiquetas</a>'
    };
  });

  return UI.head('Planos de Corte',
    'Todo plano já gerado, do mais novo pro mais antigo. Clique pra ver os desenhos chapa a chapa, ' +
    'os parâmetros que rodaram e reimprimir etiqueta.',
    '<a class="erp-btn erp-btn-secondary" href="#/materiais">Materiais</a>' +
    '<a class="erp-btn erp-btn-secondary" href="#/parametros-corte">Parâmetros</a>' +
    '<a class="erp-btn" href="#/lotes">Lotes</a>') +
    '<div id="lotes-toast" style="display:none"></div>' +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:16px">' +
      UI.kpi('Planos', plans.length, salvos.length + ' salvos · ' + cortados.length + ' cortados') +
      UI.kpi('Chapas novas', chapas, 'somando todos os planos') +
      UI.kpi('Retalhos aproveitados', retalhos, 'chapa que não foi comprada') +
      UI.kpi('Perda média', LOTES_UI.pct(perdaPond), 'ponderada por chapa') +
    '</div>' +
    (plans.length
      ? UI.panel(null, UI.table([
          { key: 'code', label: 'Plano' },
          { key: 'lote', label: 'Lote' },
          { key: 'v', label: 'Versão' },
          { key: 'sheets', label: 'Chapas', align: 'right' },
          { key: 'offc', label: 'Retalhos', align: 'right' },
          { key: 'pieces', label: 'Peças', align: 'right' },
          { key: 'waste', label: 'Perda', align: 'right' },
          { key: 'strat', label: 'Estratégia' },
          { key: 'status', label: 'Status' },
          { key: 'acao', label: '' }
        ], rows), true)
      : UI.panel(null, '<div class="erp-empty"><div class="erp-strong">Nenhum plano gerado ainda.</div>' +
          '<div class="erp-muted erp-small" style="margin:8px 0 14px">O plano nasce dentro de um lote.</div>' +
          '<a class="erp-btn" href="#/lotes">Ir para Lotes</a></div>'));
};

/* ============================================================
   #/parametros-corte — a tela de parâmetros (estilo Cutrite)
   ============================================================ */
LOTES_UI.paramsScreenLoad = async function () {
  return { list: await LOTES.params() };
};

LOTES_UI.paramsScreen = function (params, d) {
  LOTES_UI._paramList = d.list;
  const rows = d.list.map(function (p) {
    return {
      name: '<span class="erp-strong">' + UI.esc(p.name) + '</span>' + (p.is_default ? ' ' + UI.pill('padrão', 'erp-pill-ok') : ''),
      strat: p.strategy === 'maxrects' ? UI.pill('MaxRects', 'erp-pill-warn') : UI.pill('Guilhotina', 'erp-pill-neutral'),
      kerf: LOTES_UI.mm(p.kerf_mm) + ' mm',
      trim: 'E' + LOTES_UI.mm(p.trim_left_mm) + ' D' + LOTES_UI.mm(p.trim_right_mm) +
        ' T' + LOTES_UI.mm(p.trim_top_mm) + ' B' + LOTES_UI.mm(p.trim_bottom_mm) +
        ' · ret. ' + LOTES_UI.mm(NESTING.retalhoTrim(p)),
      offc: p.use_offcuts ? UI.pill('usa', 'erp-pill-ok') : UI.pill('não usa', 'erp-pill-neutral'),
      min: LOTES_UI.mm(p.min_offcut_width_mm) + ' × ' + LOTES_UI.mm(p.min_offcut_height_mm) + ' mm',
      acao: '<button class="erp-btn-secondary erp-btn-sm" onclick="LOTES_UI.editarPerfil(\'' + p.id + '\')">Editar</button> ' +
        '<button class="erp-btn-ghost erp-btn-sm" onclick="LOTES_UI.excluirPerfil(\'' + p.id + '\')">Excluir</button>'
    };
  });

  return UI.head('Parâmetros de corte',
    'Cada perfil é um jeito de otimizar. O plano guarda uma CÓPIA do perfil que usou — mudar o perfil aqui não reescreve plano antigo.',
    '<button onclick="LOTES_UI.editarPerfil(null)">+ Novo perfil</button>') +
    '<div id="lotes-toast" style="display:none"></div>' +
    '<div id="param-form"></div>' +
    UI.panel('Perfis',
      UI.table([
        { key: 'name', label: 'Perfil' },
        { key: 'strat', label: 'Estratégia' },
        { key: 'kerf', label: 'Serra' },
        { key: 'trim', label: 'Refile' },
        { key: 'offc', label: 'Retalho' },
        { key: 'min', label: 'Retalho mínimo' },
        { key: 'acao', label: '' }
      ], rows), true) +
    UI.panel('O que cada coisa faz',
      '<dl class="erp-def">' +
      '<dt>Serra (kerf)</dt><dd>Espessura do disco. Cada corte come esse tanto de material. ' +
        'Se o cadastro estiver menor que o disco real, a última peça de cada chapa fica curta — e ninguém entende por quê.</dd>' +
      '<dt>Refile</dt><dd>Faixa da borda da chapa que você joga fora antes de começar (canto batido, esquadro fora). ' +
        'É por isso que uma chapa de 2750 não corta 2750 de peça.</dd>' +
      '<dt>Guilhotina × MaxRects</dt><dd>Guilhotina só faz corte que atravessa a chapa inteira — é o que a seccionadora consegue. ' +
        'MaxRects encaixa peça em vão no meio e aproveita mais, mas o corte não existe na sua máquina.</dd>' +
      '<dt>Primeiro corte</dt><dd>Se a chapa é aberta primeiro no sentido do comprimento ou da largura. ' +
        'No automático o otimizador escolhe o que gasta menos.</dd>' +
      '<dt>Retalho mínimo</dt><dd>A sobra só vira retalho de estoque se passar dos DOIS mínimos. ' +
        'Abaixo disso é resto: guardar pedaço pequeno demais só entope a prateleira.</dd>' +
      '<dt>Prioridade do retalho</dt><dd>Menor primeiro gasta a sobra pequena antes de picar uma grande. ' +
        'É o padrão porque evita transformar o estoque num monte de pedaço inútil.</dd>' +
      '</dl>');
};

LOTES_UI.editarPerfil = function (id) {
  const p = id ? (LOTES_UI._paramList || []).find(function (x) { return x.id === id; }) : Object.assign({}, LOTES.PARAM_DEFAULTS);
  if (!p) return;
  if (p.trim_retalho_mm == null) p.trim_retalho_mm = NESTING.RETALHO_TRIM_DEFAULT_MM; // perfil de antes da migration 159
  const n = function (key, label, step) {
    return '<label class="erp-field"><span>' + label + '</span><input type="number" id="pf-' + key + '" value="' +
      (p[key] != null ? p[key] : 0) + '" step="' + (step || 1) + '" min="0"></label>';
  };
  const c = function (key, label) {
    return '<label style="display:flex;gap:8px;align-items:center;padding:6px 0"><input type="checkbox" id="pf-' + key + '"' +
      (p[key] ? ' checked' : '') + '> <span class="erp-small">' + label + '</span></label>';
  };
  const sel = function (key, label, opts) {
    return '<label class="erp-field"><span>' + label + '</span><select id="pf-' + key + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (p[key] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
      '</select></label>';
  };

  document.getElementById('param-form').innerHTML = UI.panel(id ? 'Editar perfil' : 'Novo perfil',
    '<div class="erp-grid erp-grid-3">' +
      '<label class="erp-field"><span>Nome</span><input type="text" id="pf-name" value="' + UI.esc(p.name || '') + '"></label>' +
      n('kerf_mm', 'Serra / kerf (mm)', 0.1) +
      sel('strategy', 'Estratégia', [['guilhotina', 'Guilhotina (seccionadora)'], ['maxrects', 'MaxRects (router/comparação)']]) +
      n('trim_left_mm', 'Refile esquerda (mm)') +
      n('trim_right_mm', 'Refile direita (mm)') +
      n('trim_top_mm', 'Refile topo (mm)') +
      n('trim_bottom_mm', 'Refile base (mm)') +
      n('trim_retalho_mm', 'Refile do retalho (mm)') +
      sel('first_cut', 'Primeiro corte', [['auto', 'Automático'], ['horizontal', 'Horizontal'], ['vertical', 'Vertical']]) +
      sel('offcut_priority', 'Prioridade do retalho', [['menor_primeiro', 'Menor primeiro'], ['maior_primeiro', 'Maior primeiro'], ['mais_antigo', 'Mais antigo']]) +
      n('min_offcut_width_mm', 'Retalho mín. — lado maior (mm)') +
      n('min_offcut_height_mm', 'Retalho mín. — lado menor (mm)') +
      '<label class="erp-field"><span>Prefixo do código da peça</span><input type="text" id="pf-label_prefix" value="' + UI.esc(p.label_prefix || 'PC') + '"></label>' +
    '</div>' +
    '<div class="erp-grid erp-grid-3" style="margin-top:6px">' +
      c('allow_rotation', 'Permitir girar 90°') +
      c('respect_grain', 'Respeitar veio') +
      c('use_offcuts', 'Usar retalhos do estoque') +
      c('is_default', 'Este é o perfil padrão') +
    '</div>' +
    '<label class="erp-field" style="margin-top:8px"><span>Observação</span><input type="text" id="pf-notes" value="' + UI.esc(p.notes || '') + '"></label>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button onclick="LOTES_UI.salvarPerfil(' + (id ? '\'' + id + '\'' : 'null') + ', this)">Salvar perfil</button>' +
      '<button class="erp-btn-secondary" onclick="document.getElementById(\'param-form\').innerHTML=\'\'">Cancelar</button>' +
    '</div>');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

LOTES_UI.salvarPerfil = async function (id, btn) {
  const n = function (key) { const el = document.getElementById('pf-' + key); return el ? Number(el.value) || 0 : 0; };
  const v = function (key) { const el = document.getElementById('pf-' + key); return el ? el.value : ''; };
  const c = function (key) { const el = document.getElementById('pf-' + key); return el ? el.checked : false; };
  const name = v('name').trim();
  if (!name) { LOTES_UI.toast('O perfil precisa de nome.', true); return; }
  LOTES_UI.busy(btn, true, 'Salvando…');
  try {
    await LOTES.saveParams({
      id: id || undefined,
      name: name,
      is_default: c('is_default'),
      kerf_mm: n('kerf_mm'),
      trim_left_mm: n('trim_left_mm'), trim_right_mm: n('trim_right_mm'),
      trim_top_mm: n('trim_top_mm'), trim_bottom_mm: n('trim_bottom_mm'),
      trim_retalho_mm: n('trim_retalho_mm'),
      strategy: v('strategy'), first_cut: v('first_cut'),
      allow_rotation: c('allow_rotation'), respect_grain: c('respect_grain'),
      use_offcuts: c('use_offcuts'), offcut_priority: v('offcut_priority'),
      min_offcut_width_mm: n('min_offcut_width_mm'), min_offcut_height_mm: n('min_offcut_height_mm'),
      label_prefix: v('label_prefix') || 'PC',
      notes: v('notes') || null
    });
    if (LOTES.paramsMigrationPending) { LOTES_UI.toast(LOTES.paramsMigrationPending, true); LOTES.paramsMigrationPending = null; }
    APP.render();
  } catch (err) {
    console.error(err);
    LOTES_UI.toast(LOTES.explainError(err), true);
    LOTES_UI.busy(btn, false);
  }
};

LOTES_UI.excluirPerfil = async function (id) {
  if (!confirm('Tirar este perfil da lista? Planos que já usaram ele continuam intactos — eles guardam uma cópia dos parâmetros.')) return;
  try { await LOTES.deleteParams(id); APP.render(); }
  catch (err) { LOTES_UI.toast(LOTES.explainError(err), true); }
};

/* ============================================================
   Retalhos — as ações; a TELA mora em Materiais
   ============================================================
   A tela #/retalhos foi absorvida pela aba Retalhos de #/materiais
   (screens-materiais.js). Duas telas escrevendo no mesmo estoque é pedir
   divergência: uma some com o botão que a outra tem e ninguém percebe.
   O endereço antigo continua funcionando via APP.ALIASES em app.js.

   Estas duas funções ficaram porque a tela nova as chama pelo onclick — são
   ação, não tela. */
LOTES_UI.mudarRetalho = async function (id, status) {
  try { await LOTES.setOffcutStatus(id, status); APP.render(); }
  catch (err) { LOTES_UI.toast(LOTES.explainError(err), true); }
};

LOTES_UI.editarLocal = async function (id) {
  const loc = prompt('Onde este retalho está guardado?');
  if (loc === null) return;
  try { await LOTES.saveOffcut({ id: id, location: loc.trim() || null }); APP.render(); }
  catch (err) { LOTES_UI.toast(LOTES.explainError(err), true); }
};
