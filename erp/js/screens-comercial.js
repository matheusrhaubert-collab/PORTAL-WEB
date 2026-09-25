/* Legno ERP — Central de Pedidos (DADO REAL) e Liberação Financeira (exemplo).
 *
 * CENTRAL DE PEDIDOS (decisão do Matt, 2026-08-06):
 * uma única tabela public.orders. O cliente vê os pedidos dele pelo portal
 * (RLS "client manage own orders"), a fábrica vê todos aqui pela policy
 * "admin read orders" (migration 033). Não existe "pedido do portal" e
 * "pedido do ERP" — é o mesmo registro visto de dois ângulos.
 *
 * FABRICADO x COMPRADO sai do banco, não é invenção da tela:
 * order_items são os módulos fabricados; a lista de compras é somada
 * percorrendo module_components e pegando components.origin='comprado'
 * (migration 034). Ver DATA.resolvePurchased.
 */

const ScreensComercial = {};

/* Marcos que o CLIENTE enxerga, na ordem. Hoje derivam de orders.status;
   quando o schema erp existir, passam a derivar das etapas da OP — o
   cliente continua vendo o mesmo vocabulário. */
ScreensComercial.milestones = [
  { keys: ['draft', 'saved'],  label: 'Em montagem' },
  { keys: ['submitted'],       label: 'Enviado' },
  { keys: ['approved'],        label: 'Confirmado' },
  { keys: ['paid'],            label: 'Em produção' },
  { keys: ['delivered'],       label: 'Entregue' }
];

/* ============================================================
   Lista de pedidos
   ============================================================ */
ScreensComercial.ordersLoad = function () { return DATA.orders(); };

ScreensComercial.orders = function (params, orders) {
  const view = (params && params.view) || 'fabrica';

  /* A fábrica só se interessa por pedido que saiu do rascunho */
  const live = orders.filter(function (o) {
    const s = DATA.statusMap[o.status];
    return s ? s.factory : true;
  });
  const drafts = orders.length - live.length;

  const total = live.reduce(function (s, o) { return s + DATA.orderTotal(o); }, 0);
  const pieces = live.reduce(function (s, o) { return s + DATA.orderQty(o); }, 0);

  const kpis = '<div class="erp-grid erp-grid-4" style="margin-bottom:18px">' +
    UI.kpi('Pedidos na fábrica', live.length, drafts ? drafts + ' rascunho(s) fora da lista' : 'nenhum rascunho') +
    UI.kpi('Módulos pedidos', pieces, 'somando as quantidades') +
    UI.kpi('Aguardando aprovação', live.filter(function (o) { return o.status === 'submitted'; }).length,
      '<span class="erp-pill erp-pill-warn">não entra em produção</span>') +
    UI.kpi('Valor em carteira', UI.money(total), 'soma dos itens') +
    '</div>';

  const toggle =
    '<div class="erp-tabs">' +
    '<button class="' + (view === 'fabrica' ? 'active' : '') + '" onclick="location.hash=\'#/pedidos?view=fabrica\'">Visão fábrica</button>' +
    '<button class="' + (view === 'cliente' ? 'active' : '') + '" onclick="location.hash=\'#/pedidos?view=cliente\'">Visão cliente (prévia)</button>' +
    '</div>';

  return UI.head('Central de Pedidos',
    'Dado real de <span class="erp-mono">public.orders</span>. O cliente vê os pedidos dele no portal, a fábrica vê todos aqui.',
    '<button class="erp-btn-secondary" onclick="APP.reload()">Atualizar</button>') +
    kpis + toggle +
    (view === 'cliente' ? ScreensComercial._clientView(orders) : ScreensComercial._factoryView(live, drafts));
};

ScreensComercial._factoryView = function (orders, drafts) {
  if (!orders.length) {
    return UI.panel(null, '<div class="erp-empty">' +
      '<div class="erp-strong">Nenhum pedido enviado ainda.</div>' +
      '<div style="margin-top:6px">Envie um pedido pelo portal e ele aparece aqui.' +
      (drafts ? ' Existem ' + drafts + ' rascunho(s) — rascunho não chega na fábrica.' : '') + '</div>' +
      '</div>');
  }

  const rows = orders.map(function (o) {
    const items = o.order_items || [];
    const qty = DATA.orderQty(o);
    return {
      _href: '#/pedidos/' + o.id,
      num: '<span class="erp-strong">' + UI.esc(o.po_name || ('#' + o.id.slice(0, 8))) + '</span>' +
        '<div class="erp-xs erp-muted erp-mono">' + UI.esc(o.id.slice(0, 8)) + '</div>',
      client: UI.esc(DATA.clientLabel(o)) +
        (o.client_email ? '<div class="erp-xs erp-muted">' + UI.esc(o.client_email) + '</div>' : ''),
      type: UI.statusPill(DATA.typeMap, o.order_type || 'modules'),
      status: UI.statusPill(DATA.statusMap, o.status),
      itens: items.length + ' linha(s)<div class="erp-xs erp-muted">' + qty + ' módulo(s)</div>',
      created: UI.date(o.created_at),
      value: UI.money(DATA.orderTotal(o))
    };
  });

  return UI.panel(null, '<div class="erp-toolbar">' +
    '<input type="search" id="erp-order-search" placeholder="Cliente, e-mail ou nome do pedido…" oninput="ScreensComercial.filterRows(this.value)">' +
    '<span class="erp-spacer"></span>' +
    '<span class="erp-muted erp-small">' + orders.length + ' pedido(s) na fábrica' +
    (drafts ? ' · ' + drafts + ' rascunho(s) oculto(s)' : '') + '</span></div>' +
    UI.table([
      { key: 'num', label: 'Pedido' },
      { key: 'client', label: 'Cliente' },
      { key: 'type', label: 'Tipo' },
      { key: 'status', label: 'Status' },
      { key: 'itens', label: 'Itens' },
      { key: 'created', label: 'Criado' },
      { key: 'value', label: 'Valor', align: 'right' }
    ], rows), true);
};

/* Filtro no cliente — a lista já está na tela, não precisa ir ao banco */
ScreensComercial.filterRows = function (q) {
  const t = (q || '').toLowerCase();
  document.querySelectorAll('table.erp-table tbody tr').forEach(function (tr) {
    tr.style.display = !t || tr.textContent.toLowerCase().indexOf(t) >= 0 ? '' : 'none';
  });
};

/* Prévia do que o cliente vê — mesmo registro, menos colunas, marcos no
   lugar de etapa de máquina. */
ScreensComercial._clientView = function (orders) {
  const byClient = {};
  orders.forEach(function (o) {
    const k = o.client_user_id || 'x';
    (byClient[k] = byClient[k] || []).push(o);
  });
  const keys = Object.keys(byClient);
  if (!keys.length) return UI.panel(null, '<div class="erp-empty">Nenhum pedido para mostrar.</div>');

  const first = byClient[keys[0]];
  const cards = first.map(function (o) {
    const idx = ScreensComercial.milestones.findIndex(function (m) { return m.keys.indexOf(o.status) >= 0; });
    const steps = ScreensComercial.milestones.map(function (m, i) {
      const cls = i < idx ? 'done' : (i === idx ? 'doing' : '');
      return '<div class="erp-route-step ' + cls + '"><div class="erp-route-name">' + UI.esc(m.label) + '</div>' +
        '<div class="erp-route-meta">' + (i < idx ? 'concluído' : i === idx ? 'agora' : 'a seguir') + '</div></div>';
    }).join('');
    return UI.panel(null,
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:14px">' +
      '<div><div class="erp-strong" style="font-size:16px">' + UI.esc(o.po_name || ('Pedido ' + o.id.slice(0, 8))) + '</div>' +
      '<div class="erp-muted erp-small">' + (o.order_items || []).length + ' itens · ' + UI.money(DATA.orderTotal(o)) + '</div></div>' +
      '<div>' + UI.statusPill(DATA.statusMap, o.status) + '</div></div>' +
      '<div class="erp-route">' + steps + '</div>');
  }).join('');

  return UI.sourceNote('<span class="erp-strong">Prévia.</span> É assim que o pedido aparece pro cliente no portal — ' +
    'mesma linha do banco, filtrada por RLS. Ele não vê OP, lote, chapa nem operador. ' +
    'Hoje o marco vem de <span class="erp-mono">orders.status</span>; quando a produção entrar, ele passa a ser ' +
    '<span class="erp-strong">derivado</span> das etapas — ninguém digita status duas vezes.') +
    '<div class="erp-muted erp-small" style="margin-bottom:12px">Simulando o login de <span class="erp-strong">' +
    UI.esc(DATA.clientLabel(first[0])) + '</span> (' + first.length + ' pedido(s))</div>' +
    cards;
};

/* ============================================================
   Detalhe do pedido — fabricado x comprado
   ============================================================ */
ScreensComercial.orderDetailLoad = function (params) { return DATA.order(params.id); };

ScreensComercial.orderDetail = function (params, o) {
  if (!o) return '<div class="erp-empty">Pedido não encontrado — ou sem permissão de leitura.</div>';

  const items = o.order_items || [];
  const qty = DATA.orderQty(o);

  const madeRows = items.map(function (i) {
    const colors = DATA.itemColorNames(i);
    return {
      name: '<span class="erp-strong">' + UI.esc(i.module_name) + '</span>' +
        (i.module_description ? '<div class="erp-xs erp-muted">' + UI.esc(i.module_description) + '</div>' : '') +
        (!i.module_id ? '<div class="erp-xs">' + UI.pill('módulo saiu do catálogo', 'erp-pill-warn') + '</div>' : ''),
      qty: i.quantity || 1,
      dims: Math.round(i.width_mm) + ' × ' + Math.round(i.height_mm) + ' × ' + Math.round(i.depth_mm),
      color: colors.length ? UI.esc(colors.join(' / ')) : '<span class="erp-muted">—</span>',
      unit: i.unit_price != null ? UI.money(i.unit_price) : '—',
      total: UI.money(i.total_price)
    };
  });

  const purchased = o._purchased || [];
  const boughtRows = purchased.map(function (b) {
    return {
      ref: '<span class="erp-mono">' + UI.esc(b.ref) + '</span>',
      name: UI.esc(b.name),
      qty: '<span class="erp-strong">' + b.qty + '</span>'
    };
  });

  const side =
    UI.panel('Resumo', UI.def([
      ['Cliente', UI.esc(DATA.clientLabel(o))],
      ['E-mail', o.client_email ? UI.esc(o.client_email) : '—'],
      ['Telefone', o.client_phone ? UI.esc(o.client_phone) : '—'],
      ['Criado', UI.date(o.created_at)],
      ['Enviado', o.submitted_at ? UI.date(o.submitted_at) : '—'],
      ['Aprovado', o.approved_at ? UI.date(o.approved_at) : '—'],
      ['Tipo', UI.statusPill(DATA.typeMap, o.order_type || 'modules')],
      ['Status', UI.statusPill(DATA.statusMap, o.status)],
      ['Total', '<span class="erp-strong">' + UI.money(DATA.orderTotal(o)) + '</span>']
    ])) +
    (o.delivery_address ? UI.panel('Entrega', '<div class="erp-small">' + UI.esc(o.delivery_address) + '</div>') : '') +
    UI.panel('Próximo passo',
      '<div class="erp-muted erp-small">Gerar OP, alocar em lote e apontar produção dependem do schema ' +
      '<span class="erp-mono">erp</span>, que ainda não foi criado. Por enquanto esta tela é leitura.</div>' +
      '<div style="margin-top:10px"><button class="erp-btn-secondary erp-btn-sm" disabled style="opacity:.5;cursor:not-allowed">Gerar OP</button></div>');

  const main =
    UI.panel('Peças fabricadas — ' + qty + ' módulo(s)',
      UI.sourceNote('Vem de <span class="erp-mono">public.order_items</span> — exatamente o que o cliente configurou no portal.') +
      UI.table([
        { key: 'name', label: 'Módulo' },
        { key: 'qty', label: 'Qtd', align: 'right' },
        { key: 'dims', label: 'Dimensões (mm)' },
        { key: 'color', label: 'Cores' },
        { key: 'unit', label: 'Unitário', align: 'right' },
        { key: 'total', label: 'Total', align: 'right' }
      ], madeRows)) +
    UI.panel('Peças compradas — ' + purchased.length + ' referência(s)',
      UI.sourceNote('Somado percorrendo a árvore de cada módulo e pegando os componentes com ' +
        '<span class="erp-mono">origin = \'comprado\'</span> (migration 034). ' +
        'Módulo aninhado multiplica a quantidade do filho pela do pai.') +
      (purchased.length
        ? UI.table([
            { key: 'ref', label: 'Referência' },
            { key: 'name', label: 'Tipo de componente' },
            { key: 'qty', label: 'Quantidade', align: 'right' }
          ], boughtRows)
        : '<div class="erp-empty">Nenhum componente marcado como comprado nos módulos deste pedido.<br>' +
          '<span class="erp-small">Se isso parecer errado, é sinal de que falta marcar <span class="erp-mono">origin=\'comprado\'</span> ' +
          'nos puxadores, pés e ferragens lá no admin.</span></div>'));

  return UI.crumb([{ label: 'Pedidos', href: '#/pedidos' }, { label: o.po_name || o.id.slice(0, 8) }]) +
    UI.head(o.po_name || ('Pedido ' + o.id.slice(0, 8)),
      UI.esc(DATA.clientLabel(o)) + ' · criado em ' + UI.date(o.created_at)) +
    '<div class="erp-grid erp-grid-side">' + main + '<div>' + side + '</div></div>';
};

/* ============================================================
   Liberação financeira — ainda com dado de exemplo
   ============================================================ */
/* ============================================================
   Liberação Financeira — dado real (migration 082)
   ============================================================
   O portão entre o pedido e a produção. Enquanto não houver liberação, o
   pedido não entra em lote (LOTES.availableOrders filtra por
   finance_released_at). É a única tela que grava esse campo. */
ScreensComercial.financialLoad = async function () {
  return { orders: await DATA.financeOrders() };
};

ScreensComercial.financial = function (params, d) {
  const pendentes = d.orders.filter(function (o) { return !o.finance_released_at; });
  const liberados = d.orders.filter(function (o) { return !!o.finance_released_at; });

  const soma = function (list) { return list.reduce(function (s, o) { return s + (o._value || 0); }, 0); };

  /* Liberado NO MÊS, não liberado no total: o total só cresce e não diz nada.
     O mês responde "a fábrica recebeu trabalho esse mês?". */
  const agora = new Date();
  const doMes = liberados.filter(function (o) {
    const dt = new Date(o.finance_released_at);
    return dt.getMonth() === agora.getMonth() && dt.getFullYear() === agora.getFullYear();
  });

  const linha = function (o, liberado) {
    const t = DATA.typeMap[o.order_type] || { label: o.order_type || 'Módulos', pill: 'erp-pill-neutral' };
    const st = DATA.stageInfo(o);
    return {
      order: '<a href="#/pedidos/' + o.id + '" class="erp-strong">' +
        UI.esc(o.po_name || ('#' + o.id.slice(0, 8))) + '</a>' +
        '<div class="erp-xs erp-muted">' + UI.date(o.created_at) + '</div>',
      client: UI.esc(DATA.clientLabel(o)),
      type: UI.pill(t.label, t.pill),
      stage: UI.pill(st.label, st.pill),
      value: '<span class="erp-strong">' + UI.money(o._value) + '</span>',
      when: liberado
        ? UI.date(o.finance_released_at) +
          (o.finance_release_note ? '<div class="erp-xs erp-muted">' + UI.esc(o.finance_release_note) + '</div>' : '')
        : '<span class="erp-muted erp-xs">—</span>',
      acao: liberado
        ? '<button class="erp-btn-ghost erp-btn-sm" onclick="ScreensComercial.liberar(\'' + o.id + '\', false, this)">Desfazer</button>'
        : '<button class="erp-btn-sm" onclick="ScreensComercial.liberar(\'' + o.id + '\', true, this)">Liberar</button>'
    };
  };

  const cols = function (liberado) {
    return [
      { key: 'order', label: 'Pedido' },
      { key: 'client', label: 'Cliente' },
      { key: 'type', label: 'Tipo' },
      { key: 'stage', label: 'Estágio' },
      { key: 'value', label: 'Valor', align: 'right' },
      { key: liberado ? 'when' : 'when', label: liberado ? 'Liberado em' : '' },
      { key: 'acao', label: '' }
    ];
  };

  return UI.head('Liberação Financeira',
    'O portão entre o pedido e a produção. Só pedido liberado aqui aparece na hora de montar lote — ' +
    'sem liberação, o corte não começa.') +
    '<div id="fin-toast" style="display:none"></div>' +
    UI.sourceNote('Aparecem só pedidos <span class="erp-strong">implantados</span> — aqueles que o cliente já aprovou. ' +
      'Pedido sem aprovação do cliente ainda é orçamento e não chega aqui. ' +
      'Liberar grava quem liberou e quando (<span class="erp-mono">orders.finance_released_at</span>, migration 082).') +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:18px">' +
      UI.kpi('Aguardando liberação', pendentes.length,
        pendentes.length ? '<span class="erp-pill erp-pill-danger">travando produção</span>' : '<span class="erp-pill erp-pill-ok">fila limpa</span>') +
      UI.kpi('Valor travado', UI.money(soma(pendentes)), 'parado esperando o financeiro') +
      UI.kpi('Liberados no mês', doMes.length, UI.money(soma(doMes))) +
      UI.kpi('Liberados (total)', liberados.length, 'prontos pra entrar em lote') +
    '</div>' +
    UI.panel('Aguardando liberação',
      UI.table(cols(false), pendentes.map(function (o) { return linha(o, false); })), true) +
    UI.panel('Já liberados',
      UI.table(cols(true), liberados.map(function (o) { return linha(o, true); })), true) +
    UI.panel('Como a trava funciona',
      '<div class="erp-route">' +
      '<div class="erp-route-step done"><div class="erp-route-name">Orçamento</div><div class="erp-route-meta">cliente monta no portal</div></div>' +
      '<div class="erp-route-step done"><div class="erp-route-name">Implantado</div><div class="erp-route-meta">cliente aprova e trava</div></div>' +
      '<div class="erp-route-step doing"><div class="erp-route-name">Aprovado</div><div class="erp-route-meta">financeiro libera — esta tela</div></div>' +
      '<div class="erp-route-step"><div class="erp-route-name">Entra em lote</div><div class="erp-route-meta">só pedido liberado aparece lá</div></div>' +
      '<div class="erp-route-step"><div class="erp-route-name">Plano de corte</div><div class="erp-route-meta">chão de fábrica</div></div>' +
      '</div>');
};

ScreensComercial.liberar = async function (orderId, liberar, btn) {
  /* A observação é opcional e só faz sentido ao liberar — desfazer limpa tudo,
     inclusive ela. prompt() cancelado (null) aborta a operação; string vazia
     é uma liberação sem observação, que é legítima. */
  let nota = null;
  if (liberar) {
    nota = prompt('Observação da liberação (opcional):\n\nEx.: "50% recebido em 08/08", "cliente antigo, libera".');
    if (nota === null) return;
  } else if (!confirm('Desfazer a liberação? O pedido volta a travar a produção — e se ele já estiver dentro de um lote, o lote NÃO é desfeito junto.')) {
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = liberar ? 'Liberando…' : 'Desfazendo…';
  try {
    await DATA.setFinanceRelease(orderId, liberar, nota ? nota.trim() : null);
    APP.render();
  } catch (err) {
    console.error(err);
    const el = document.getElementById('fin-toast');
    if (el) {
      el.className = 'erp-error';
      el.innerHTML = '<div class="erp-error-title">Não consegui gravar a liberação</div>' +
        '<div class="erp-error-detail">' + UI.esc(DATA.explainError(err)) + '</div>';
      el.style.display = 'block';
    } else {
      alert(DATA.explainError(err));
    }
    btn.disabled = false;
    btn.textContent = original;
  }
};
