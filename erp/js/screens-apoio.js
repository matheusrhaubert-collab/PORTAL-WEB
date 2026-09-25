/* Legno ERP — Produtos, Compras, Expedição, Etiquetas e Projetos.
 *
 * FONTE ÚNICA: Produtos e Projetos são LEITURA do portal. O ERP não tem
 * cadastro paralelo — só acrescenta os campos de produção que o portal não tem.
 */

const ScreensApoio = {};

/* ============================================================
   Produtos — catálogo REAL do portal + configuração de produção
   ============================================================ */
ScreensApoio.productsLoad = async function () {
  const [mods, tax, idx] = await Promise.all([DATA.modules(), DATA.taxonomy(), DATA.componentIndex()]);
  return { mods: mods, tax: tax, idx: idx };
};

ScreensApoio.products = function (params, d) {
  const rows = d.mods.map(function (m) {
    const fam = d.tax.families[m.family_id];
    const cat = d.tax.categories[m.category_id];
    const links = d.idx.byModule[m.id] || [];
    const bought = links.filter(function (l) {
      const c = d.idx.components[l.component_id];
      return c && c.origin === 'comprado';
    }).length;
    const nested = links.filter(function (l) { return l.child_module_id; }).length;

    return {
      _href: '#/produtos/' + m.id,
      name: '<span class="erp-strong">' + UI.esc(m.name) + '</span>' +
        (m.slug ? '<div class="erp-xs erp-muted erp-mono">' + UI.esc(m.slug) + '</div>' : ''),
      tax: (fam ? UI.esc(fam.name) : '—') + (cat ? ' › ' + UI.esc(cat.name) : ''),
      dims: Math.round(m.width_default_mm) + ' × ' + Math.round(m.height_default_mm) + ' × ' + Math.round(m.depth_default_mm),
      range: Math.round(m.width_min_mm) + '–' + Math.round(m.width_max_mm) + ' mm',
      comp: links.length + ' item(ns)' +
        '<div class="erp-xs erp-muted">' + bought + ' comprado(s)' + (nested ? ' · ' + nested + ' módulo(s)' : '') + '</div>',
      active: m.active === false ? UI.pill('Inativo', 'erp-pill-neutral') : UI.pill('Ativo', 'erp-pill-ok'),
      route: UI.pill('Sem roteiro', 'erp-pill-warn')
    };
  });

  return UI.head('Produtos',
    'Catálogo real de <span class="erp-mono">public.modules</span> — o mesmo módulo que o cliente configura no portal.',
    '<a class="erp-btn erp-btn-secondary" href="../admin.html" target="_blank">Abrir cadastro no admin</a>' +
    '<button class="erp-btn-secondary" onclick="APP.reload()">Atualizar</button>') +
    UI.sourceNote('<span class="erp-strong">Nada de produto se cadastra aqui.</span> Dimensões, componentes, cores e preço ' +
      'continuam sendo editados no admin do portal. O ERP vai gravar só <span class="erp-mono">erp.product_manufacturing</span> ' +
      '— uma linha por módulo, ligada por <span class="erp-mono">module_id</span>. ' +
      'Por isso a coluna Roteiro aparece vazia: essa tabela ainda não existe.') +
    UI.panel(null, '<div class="erp-toolbar">' +
      '<input type="search" placeholder="Nome ou slug…" oninput="ScreensComercial.filterRows(this.value)">' +
      '<span class="erp-spacer"></span>' +
      '<span class="erp-muted erp-small">' + d.mods.length + ' módulo(s) no catálogo</span></div>' +
      UI.table([
        { key: 'name', label: 'Produto' },
        { key: 'tax', label: 'Família › Categoria' },
        { key: 'dims', label: 'Padrão L×A×P (mm)' },
        { key: 'range', label: 'Faixa de largura' },
        { key: 'comp', label: 'Estrutura' },
        { key: 'active', label: 'No portal' },
        { key: 'route', label: 'Roteiro' }
      ], rows), true);
};

ScreensApoio.productDetailLoad = async function (params) {
  const d = await ScreensApoio.productsLoad();
  d.module = d.mods.find(function (m) { return m.id === params.id; }) || null;
  return d;
};

ScreensApoio.productDetail = function (params, d) {
  const m = d.module;
  if (!m) return '<div class="erp-empty">Produto não encontrado.</div>';

  const fam = d.tax.families[m.family_id];
  const cat = d.tax.categories[m.category_id];
  const links = d.idx.byModule[m.id] || [];

  const compRows = links.map(function (l) {
    if (l.child_module_id) {
      const child = d.mods.find(function (x) { return x.id === l.child_module_id; });
      return {
        ref: '<span class="erp-mono">' + UI.esc(child ? (child.slug || child.name) : l.child_module_id.slice(0, 8)) + '</span>',
        name: '<span class="erp-strong">' + UI.esc(child ? child.name : '(módulo removido)') + '</span>',
        kind: UI.pill('Módulo aninhado', 'erp-pill-info'),
        origin: '<span class="erp-muted">—</span>',
        qty: l.quantity_override != null ? l.quantity_override : 1
      };
    }
    const c = d.idx.components[l.component_id];
    if (!c) return { ref: '—', name: '(componente removido)', kind: '—', origin: '—', qty: '—' };
    const t = d.idx.types[c.type_id];
    return {
      ref: '<span class="erp-mono">' + UI.esc(c.reference) + '</span>',
      name: UI.esc(t ? t.name : 'Componente'),
      kind: UI.pill('Peça', 'erp-pill-neutral'),
      origin: c.origin === 'comprado' ? UI.pill('Comprado', 'erp-pill-accent') : UI.pill('Fabricação', 'erp-pill-ok'),
      qty: l.quantity_override != null ? l.quantity_override : (c.quantity != null ? c.quantity : 1)
    };
  });

  const boughtCount = compRows.filter(function (r) { return /Comprado/.test(r.origin); }).length;

  return UI.crumb([{ label: 'Produtos', href: '#/produtos' }, { label: m.name }]) +
    UI.head(m.name,
      (fam ? UI.esc(fam.name) : '—') + (cat ? ' › ' + UI.esc(cat.name) : '') +
      (m.slug ? ' · <span class="erp-mono">' + UI.esc(m.slug) + '</span>' : ''),
      '<a class="erp-btn erp-btn-secondary" href="../admin.html" target="_blank">Editar no admin</a>') +
    '<div class="erp-grid erp-grid-side"><div>' +
    UI.panel('Estrutura (leitura do portal)',
      UI.sourceNote('Vem de <span class="erp-mono">module_components</span> + <span class="erp-mono">components</span>. ' +
        'A coluna Origem é o que separa a lista de corte da lista de compras — ' +
        'este módulo tem <span class="erp-strong">' + boughtCount + '</span> item(ns) comprado(s).') +
      UI.table([
        { key: 'ref', label: 'Referência' },
        { key: 'name', label: 'Tipo' },
        { key: 'kind', label: 'Natureza' },
        { key: 'origin', label: 'Origem' },
        { key: 'qty', label: 'Qtd', align: 'right' }
      ], compRows)) +
    UI.panel('Configuração de produção',
      UI.demoNote('roteiro, lote mínimo, embalagem — schema erp') +
      '<div class="erp-inline-fields" style="margin-bottom:14px;opacity:.6">' +
      '<label class="erp-field"><span>Lote mínimo</span><input type="number" placeholder="—" disabled></label>' +
      '<label class="erp-field"><span>Lead time (dias)</span><input type="number" placeholder="—" disabled></label>' +
      '<label class="erp-field"><span>Volumes na embalagem</span><input type="number" placeholder="—" disabled></label>' +
      '</div>' +
      '<div class="erp-strong erp-small" style="margin-bottom:6px">Roteiro sugerido</div>' +
      '<div class="erp-route" style="opacity:.6">' + MOCK.processes.slice(0, 5).map(function (p) {
        return '<div class="erp-route-step"><div class="erp-route-name">' + UI.esc(p.name) + '</div>' +
          '<div class="erp-route-meta">' + UI.esc(p.workcenter) + '</div></div>';
      }).join('') + '</div>') +
    '</div><div>' +
    UI.panel('Vem do portal (leitura)', UI.def([
      ['Largura', Math.round(m.width_min_mm) + ' – ' + Math.round(m.width_max_mm) + ' mm<div class="erp-xs erp-muted">padrão ' + Math.round(m.width_default_mm) + '</div>'],
      ['Altura', Math.round(m.height_min_mm) + ' – ' + Math.round(m.height_max_mm) + ' mm<div class="erp-xs erp-muted">padrão ' + Math.round(m.height_default_mm) + '</div>'],
      ['Profundidade', Math.round(m.depth_min_mm) + ' – ' + Math.round(m.depth_max_mm) + ' mm<div class="erp-xs erp-muted">padrão ' + Math.round(m.depth_default_mm) + '</div>'],
      ['Itens na estrutura', links.length],
      ['Ativo', m.active === false ? UI.pill('Não', 'erp-pill-neutral') : UI.pill('Sim', 'erp-pill-ok')]
    ]) +
      '<div class="erp-sep"></div>' +
      '<div class="erp-muted erp-xs">Somente leitura aqui. Mudar dimensão ou componente muda o preço que o cliente vê — ' +
      'isso continua no admin do portal, com um dono só.</div>') +
    '</div></div>';
};

/* ============================================================
   Compras — ordem de compra com sugestão de IA
   ============================================================ */
ScreensApoio.purchases = function () {
  const ai = MOCK.aiPurchase;

  const urgencyPill = {
    alta:    UI.pill('Urgente', 'erp-pill-danger'),
    media:   UI.pill('Programar', 'erp-pill-warn'),
    coberto: UI.pill('Já coberto', 'erp-pill-info'),
    ok:      UI.pill('Não comprar', 'erp-pill-neutral')
  };

  const aiRows = ai.lines.map(function (l) {
    return {
      ref: '<span class="erp-mono">' + UI.esc(l.ref) + '</span>',
      name: '<span class="erp-strong">' + UI.esc(l.name) + '</span><div class="erp-xs erp-muted">' + UI.esc(l.supplier) + ' · lead ' + UI.esc(l.lead) + '</div>',
      need: l.need,
      stock: l.stock,
      suggest: l.suggest ? '<span class="erp-strong">' + l.suggest + '</span>' : '<span class="erp-muted">0</span>',
      urg: urgencyPill[l.urgency],
      why: '<span class="erp-small erp-muted">' + UI.esc(l.why) + '</span>',
      act: l.suggest
        ? '<button class="erp-btn-sm" onclick="UI.todo(\'Incluir na OC\')">Incluir</button>'
        : '<span class="erp-muted erp-xs">—</span>'
    };
  });

  const poRows = MOCK.purchaseOrders.map(function (po) {
    return {
      code: '<span class="erp-mono erp-strong">' + UI.esc(po.code) + '</span>',
      supplier: UI.esc(po.supplier),
      items: po.items.length + ' itens<div class="erp-xs erp-muted">' + po.items.map(function (i) { return UI.esc(i.ref); }).join(', ') + '</div>',
      created: UI.date(po.created),
      eta: po.eta ? UI.date(po.eta) : '<span class="erp-muted">—</span>',
      total: UI.money(po.total),
      status: UI.statusPill(MOCK.poStatus, po.status),
      act: po.status === 'rascunho'
        ? '<button class="erp-btn-sm" onclick="UI.todo(\'Enviar ao fornecedor\')">Enviar</button>'
        : '<button class="erp-btn-secondary erp-btn-sm" onclick="UI.todo(\'Receber\')">Receber</button>'
    };
  });

  return UI.head('Compras' + UI.demoTag(),
    'Ordens de compra dos itens que não passam pela produção. A sugestão automática cruza a demanda dos pedidos abertos com o estoque e o lead time de cada fornecedor.',
    '<button class="erp-btn-secondary" onclick="UI.todo(\'Recalcular sugestão\')">Recalcular sugestão</button>' +
    '<button onclick="UI.todo(\'Nova ordem de compra\')">+ Nova OC</button>') +
    UI.panel(null,
      '<div class="erp-ai-box">' +
      '<span class="erp-ai-tag">Sugestão automática</span>' +
      '<div class="erp-small erp-muted" style="margin-bottom:12px">Gerada em ' + UI.esc(ai.generated) + ' · ' + UI.esc(ai.reasoning) + '</div>' +
      UI.table([
        { key: 'ref', label: 'Referência' },
        { key: 'name', label: 'Item' },
        { key: 'need', label: 'Demanda', align: 'right' },
        { key: 'stock', label: 'Estoque', align: 'right' },
        { key: 'suggest', label: 'Sugerido', align: 'right' },
        { key: 'urg', label: 'Prioridade' },
        { key: 'why', label: 'Por quê' },
        { key: 'act', label: '' }
      ], aiRows) +
      '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<button onclick="UI.todo(\'Gerar OCs a partir da sugestão\')">Gerar OCs sugeridas</button>' +
      '<span class="erp-muted erp-xs">Agrupa por fornecedor e abre uma OC em rascunho para cada. Nada é enviado sem você revisar.</span>' +
      '</div></div>') +
    UI.panel('Ordens de compra', UI.table([
      { key: 'code', label: 'OC' },
      { key: 'supplier', label: 'Fornecedor' },
      { key: 'items', label: 'Itens' },
      { key: 'created', label: 'Criada' },
      { key: 'eta', label: 'Previsão' },
      { key: 'total', label: 'Total', align: 'right' },
      { key: 'status', label: 'Status' },
      { key: 'act', label: '' }
    ], poRows));
};

/* ============================================================
   Embalagem e Expedição
   ============================================================ */
ScreensApoio.shipping = function () {
  const cards = MOCK.shipments.map(function (s) {
    const scanned = s.packages.filter(function (p) { return p.scanned; }).length;
    const total = s.packages.length;
    const weight = s.packages.reduce(function (a, p) { return a + p.weight; }, 0);

    const pkgRows = s.packages.map(function (p) {
      return {
        code: '<span class="erp-mono erp-strong">' + UI.esc(p.code) + '</span>',
        desc: UI.esc(p.desc),
        dims: UI.esc(p.dims) + ' mm',
        weight: p.weight.toFixed(1).replace('.', ',') + ' kg',
        status: p.scanned ? UI.pill('Conferido', 'erp-pill-ok') : UI.pill('Falta bipar', 'erp-pill-warn'),
        act: '<button class="erp-btn-ghost erp-btn-sm" onclick="UI.todo(\'Reimprimir etiqueta do volume\')">Etiqueta</button>'
      };
    });

    return UI.panel(null,
      '<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:14px">' +
      '<div><div class="erp-strong" style="font-size:15px">' + UI.esc(s.code) + ' · <a href="#/pedidos/' + s.order + '">' + UI.esc(s.order) + '</a></div>' +
      '<div class="erp-muted erp-small">' + UI.esc(s.client) + ' — ' + UI.esc(s.address) + '</div>' +
      '<div class="erp-muted erp-small">Saída prevista: ' + UI.date(s.scheduled) + '</div></div>' +
      '<div>' + (s.status === 'conferindo' ? UI.pill('Conferindo', 'erp-pill-accent') : UI.pill('Aguardando produção', 'erp-pill-neutral')) + '</div>' +
      '</div>' +
      (total
        ? '<div class="erp-grid erp-grid-4" style="margin-bottom:14px">' +
          UI.kpi('Volumes', total, scanned + ' conferidos') +
          UI.kpi('Peso total', weight.toFixed(1).replace('.', ',') + ' kg', 'somado dos volumes') +
          UI.kpi('Conferência', UI.pct(scanned / total), UI.bar(scanned / total, scanned === total ? 'ok' : 'warn')) +
          UI.kpi('Pendente', (total - scanned), (total - scanned) ? '<span class="erp-pill erp-pill-warn">não pode faturar</span>' : '<span class="erp-pill erp-pill-ok">liberado</span>') +
          '</div>' +
          UI.table([
            { key: 'code', label: 'Volume' },
            { key: 'desc', label: 'Conteúdo' },
            { key: 'dims', label: 'Dimensões' },
            { key: 'weight', label: 'Peso', align: 'right' },
            { key: 'status', label: 'Conferência' },
            { key: 'act', label: '' }
          ], pkgRows) +
          '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' +
          '<button onclick="UI.openScan()">Bipar volume</button>' +
          '<button class="erp-btn-secondary" onclick="UI.todo(\'Imprimir etiquetas dos volumes\')">Imprimir todas</button>' +
          '<button class="erp-btn-secondary" onclick="UI.todo(\'Fechar expedição\')">Fechar expedição</button>' +
          '</div>'
        : '<div class="erp-empty" style="padding:24px">Nenhum volume embalado ainda. Os volumes aparecem conforme a etapa de embalagem é apontada nas OPs.</div>'));
  }).join('');

  return UI.head('Embalagem e Expedição' + UI.demoTag(),
    'A embalagem é a última etapa do roteiro. Cada volume recebe etiqueta com código próprio, e a expedição só fecha quando todos os volumes do pedido forem bipados.',
    '<button onclick="UI.openScan()">Bipar volume</button>') +
    UI.sourceNote('A conferência por leitura existe para pegar o erro que mais dói: caminhão sai com 5 volumes de 6. ' +
      'Enquanto faltar volume, a expedição não fecha e o pedido não vira "entregue" pro cliente.') +
    cards;
};

/* ============================================================
   Etiquetas — criador de layout (Zebra ZPL)
   ============================================================ */
ScreensApoio.labels = function (params) {
  const tplId = (params && params.tpl) || 'lt1';
  const tpl = MOCK.labelTemplates.find(function (t) { return t.id === tplId; }) || MOCK.labelTemplates[0];

  /* 1mm = 3px no preview. A escala real da G240 é 203 dpi = 8 pontos/mm. */
  const SC = 3.2;
  const cw = tpl.width_mm * SC;
  const ch = tpl.height_mm * SC;

  const els = tpl.elements.map(function (e) {
    const f = MOCK.labelFields.find(function (x) { return x.key === e.field; });
    const sample = f ? f.sample : e.field;
    if (e.type === 'text') {
      return '<div class="erp-label-el" data-id="' + e.id + '" style="left:' + (e.x * SC) + 'px;top:' + (e.y * SC) + 'px;' +
        'font-size:' + (e.size * SC / 3.2) + 'px;font-weight:' + (e.bold ? '700' : '400') + '">' + UI.esc(sample) + '</div>';
    }
    if (e.type === 'barcode') {
      return '<div class="erp-label-el erp-label-barcode" data-id="' + e.id + '" style="left:' + (e.x * SC) + 'px;top:' + (e.y * SC) + 'px;' +
        'width:' + (e.w * SC) + 'px;height:' + (e.h * SC) + 'px"></div>';
    }
    return '<div class="erp-label-el erp-label-qr" data-id="' + e.id + '" style="left:' + (e.x * SC) + 'px;top:' + (e.y * SC) + 'px;' +
      'width:' + (e.w * SC) + 'px;height:' + (e.h * SC) + 'px"></div>';
  }).join('');

  /* ZPL gerado a partir dos elementos — dots = mm × 8 (203 dpi) */
  const D = 8;
  let zpl = '^XA\n^PW' + Math.round(tpl.width_mm * D) + '\n^LL' + Math.round(tpl.height_mm * D) + '\n^LH0,0\n^CI28\n';
  tpl.elements.forEach(function (e) {
    const x = Math.round(e.x * D), y = Math.round(e.y * D);
    if (e.type === 'text') {
      zpl += '^FO' + x + ',' + y + '^A0N,' + Math.round(e.size * 2) + ',' + Math.round(e.size * 2) +
        '^FD{{' + e.field + '}}^FS\n';
    } else if (e.type === 'barcode') {
      zpl += '^FO' + x + ',' + y + '^BY2,3,' + Math.round(e.h * D) + '\n' +
        '^BCN,' + Math.round(e.h * D) + ',N,N,N^FD{{' + e.field + '}}^FS\n';
    } else {
      zpl += '^FO' + x + ',' + y + '^BQN,2,6^FDLA,{{' + e.field + '}}^FS\n';
    }
  });
  zpl += '^PQ1\n^XZ';

  const fieldChips = MOCK.labelFields.map(function (f) {
    return '<span class="erp-field-chip" title="' + UI.esc(f.from) + '" onclick="UI.todo(\'Inserir campo ' + UI.esc(f.key) + '\')">' + UI.esc(f.key) + '</span>';
  }).join('');

  const tplTabs = MOCK.labelTemplates.map(function (t) {
    return '<button class="' + (t.id === tpl.id ? 'active' : '') + '" onclick="location.hash=\'#/etiquetas?tpl=' + t.id + '\'">' +
      UI.esc(t.name) + ' <span class="erp-xs erp-muted">' + t.width_mm + '×' + t.height_mm + '</span></button>';
  }).join('');

  return UI.head('Criador de Etiquetas' + UI.demoTag(),
    'Layout visual que gera ZPL para a Zebra G240. O ZPL sai com marcadores <span class="erp-mono">{{CAMPO}}</span> — na hora de imprimir, cada marcador é trocado pelo valor real da peça ou do volume.',
    '<button class="erp-btn-secondary" onclick="UI.todo(\'Novo layout\')">+ Novo layout</button>' +
    '<button onclick="UI.todo(\'Imprimir teste na G240\')">Imprimir teste</button>') +
    '<div class="erp-tabs">' + tplTabs + '</div>' +
    '<div class="erp-grid erp-grid-side"><div>' +
    UI.panel('Layout — ' + tpl.name + ' (' + tpl.width_mm + ' × ' + tpl.height_mm + ' mm)',
      '<div class="erp-note">Arraste os elementos no mockup para sentir o posicionamento. As coordenadas são em mm a partir do canto superior esquerdo — é assim que a Zebra pensa.</div>' +
      '<div class="erp-label-canvas" id="erp-label-canvas" style="width:' + cw + 'px;height:' + ch + 'px">' + els + '</div>' +
      '<div class="erp-muted erp-xs" style="text-align:center;margin-top:8px">Prévia em ' + tpl.dpi + ' dpi · o código de barras e o QR são representações, o desenho real é feito pela impressora</div>' +
      '<div class="erp-sep"></div>' +
      '<div class="erp-strong erp-small" style="margin-bottom:6px">Campos disponíveis</div>' +
      '<div class="erp-muted erp-xs" style="margin-bottom:8px">Todos vêm das tabelas que já existem — passe o mouse para ver a origem.</div>' +
      '<div>' + fieldChips + '</div>') +
    UI.panel('ZPL gerado', '<pre class="erp-zpl">' + UI.esc(zpl) + '</pre>' +
      '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="erp-btn-secondary erp-btn-sm" onclick="UI.todo(\'Copiar ZPL\')">Copiar</button>' +
      '<button class="erp-btn-secondary erp-btn-sm" onclick="UI.todo(\'Testar em labelary.com\')">Pré-visualizar renderizado</button>' +
      '</div>') +
    '</div><div>' +
    UI.panel('Impressora',
      UI.def([
        ['Modelo', 'Zebra G240 (GK420d/GX)'],
        ['Resolução', '203 dpi — 8 pontos/mm'],
        ['Largura útil', '104 mm'],
        ['Linguagem', 'ZPL II'],
        ['Conexão', 'USB / rede']
      ]) +
      '<div class="erp-sep"></div>' +
      '<div class="erp-strong erp-small" style="margin-bottom:6px">Como o navegador chega na impressora</div>' +
      '<div class="erp-muted erp-small">O navegador não fala com a Zebra sozinho. Precisa de uma ponte — o <span class="erp-strong">Zebra Browser Print</span> ' +
      '(app leve instalado no PC da fábrica, expõe a impressora em <span class="erp-mono">localhost</span>) ou um agente próprio. ' +
      'É uma instalação por máquina que imprime, feita uma vez.</div>') +
    UI.panel('Elemento selecionado',
      '<div class="erp-muted erp-small" style="margin-bottom:10px">Clique num elemento do layout.</div>' +
      '<div class="erp-inline-fields">' +
      '<label class="erp-field"><span>X (mm)</span><input type="number" value="3"></label>' +
      '<label class="erp-field"><span>Y (mm)</span><input type="number" value="3"></label>' +
      '</div>' +
      '<label class="erp-field"><span>Campo</span><select>' +
      MOCK.labelFields.map(function (f) { return '<option>' + UI.esc(f.key) + ' — ' + UI.esc(f.label) + '</option>'; }).join('') +
      '</select></label>' +
      '<label class="erp-field"><span>Tipo</span><select><option>Texto</option><option>Código de barras (Code 128)</option><option>QR Code</option><option>Linha</option></select></label>' +
      '<label class="erp-field"><span>Tamanho da fonte</span><input type="number" value="22"></label>') +
    UI.panel('Onde cada layout é usado', '<ul class="erp-small" style="margin:0;padding-left:18px">' +
      '<li><span class="erp-strong">Peça — chão de fábrica:</span> impressa na abertura do lote, uma por peça do plano de corte. É o código que o operador bipa.</li>' +
      '<li style="margin-top:6px"><span class="erp-strong">Volume — expedição:</span> impressa na etapa de embalagem, uma por volume. É o código que fecha a conferência.</li>' +
      '</ul>') +
    '</div></div>';
};

/* ============================================================
   Central de Projetos — user_projects REAL (leitura via migration 078)
   ============================================================ */

/* wall_shape veio da migration 058. Nem todo banco terá rodado — por isso o
   fallback para 'single' em vez de quebrar. */
ScreensApoio.wallLabel = function (p) {
  const shape = p.wall_shape || 'single';
  const widths = Array.isArray(p.wall_widths_mm) ? p.wall_widths_mm : [p.wall_width_mm];
  const map = { single: 'Parede única', double: 'L (2 paredes)', u: 'C-U (3 paredes)' };
  return (map[shape] || shape) + ' · ' + widths.map(function (w) { return Math.round(w || 0); }).join(' + ') + ' mm';
};

ScreensApoio.slotCount = function (p) {
  return Array.isArray(p.slots) ? p.slots.length : 0;
};

ScreensApoio.projectsLoad = function () { return DATA.projects(); };

ScreensApoio.projects = function (params, projects) {
  if (!projects.length) {
    /* Lista vazia aqui é ambígua: pode ser que não haja projeto, ou que a
       policy "admin read user_projects" (migration 078) não tenha rodado
       neste banco — RLS negando devolve lista vazia, não erro. Por isso as
       duas hipóteses aparecem. */
    return UI.head('Central de Projetos', 'Os projetos 3D que os clientes montaram no portal.') +
      UI.panel(null, '<div class="erp-empty"><div class="erp-strong">Nenhum projeto visível.</div>' +
        '<div style="margin-top:8px">Duas explicações possíveis:</div>' +
        '<ul style="display:inline-block;text-align:left;margin-top:6px" class="erp-small">' +
        '<li>Nenhum cliente salvou projeto ainda — salve um na aba Projetos do portal.</li>' +
        '<li>A <span class="erp-mono">migration_078</span> não rodou neste banco. Sem a policy ' +
        '"admin read user_projects", o RLS devolve lista vazia em vez de erro.</li>' +
        '</ul></div>');
  }

  const cards = projects.map(function (p) {
    const thumb = p.ai_preview_url || p.thumbnail_data_url;
    // client_name/client_email vêm de DATA.projects() (join com
    // user_profiles) — null quando o dono não tem linha lá (login antigo,
    // ou perfil ainda não criado no primeiro acesso).
    const cliente = UI.esc(p.client_name || p.client_email || '(cliente sem perfil)');
    return '<div class="erp-panel erp-project-card" style="margin:0">' +
      '<div class="erp-thumb" style="margin-bottom:10px">' +
      (thumb ? '<img src="' + UI.esc(thumb) + '" style="width:100%;height:100%;object-fit:cover" alt="">' : 'sem miniatura') +
      '</div>' +
      '<div class="erp-strong erp-small">' + UI.esc(p.name) + '</div>' +
      '<div class="erp-muted erp-xs" style="margin-bottom:4px">' + cliente + '</div>' +
      '<div class="erp-muted erp-xs" style="margin-bottom:8px">' + UI.esc(ScreensApoio.wallLabel(p)) + '</div>' +
      '<div class="erp-muted erp-xs" style="margin-bottom:10px">' + ScreensApoio.slotCount(p) + ' módulo(s) · ' +
      (p.cached_value_usd != null ? UI.money(p.cached_value_usd) + ' · ' : '') + 'atualizado ' + UI.date(p.updated_at) + '</div>' +
      '<a class="erp-btn erp-btn-secondary erp-btn-sm" href="#/projetos/' + p.id + '">Abrir</a>' +
      '</div>';
  }).join('');

  return UI.head('Central de Projetos',
    'Os mesmos projetos 3D que o cliente montou no portal, acessíveis da fábrica. Serve para entender o ambiente antes de montar.',
    '<a class="erp-btn erp-btn-secondary" href="../portal.html" target="_blank">Abrir portal</a>' +
    '<button class="erp-btn-secondary" onclick="APP.reload()">Atualizar</button>') +
    UI.sourceNote('<span class="erp-strong">Leitura pura.</span> Nada aqui é editável — o projeto pertence ao cliente ' +
      '(<span class="erp-mono">public.user_projects</span>, policy "admin read user_projects" da migration 078). ' +
      'Se a fábrica precisa mudar algo, isso vira alteração de pedido, não edição silenciosa do projeto.') +
    '<div class="erp-toolbar" style="margin-bottom:12px">' +
    '<input type="search" placeholder="Nome do projeto ou do cliente…" oninput="ScreensApoio.filterProjectCards(this.value)">' +
    '<span class="erp-spacer"></span>' +
    '<span class="erp-muted erp-small">' + projects.length + ' projeto(s)</span></div>' +
    '<div id="ap-projetos-grid" class="erp-grid erp-grid-4">' + cards + '</div>';
};

ScreensApoio.filterProjectCards = function (q) {
  const t = (q || '').toLowerCase();
  const grid = document.getElementById('ap-projetos-grid');
  if (!grid) return;
  grid.querySelectorAll('.erp-project-card').forEach(function (card) {
    card.style.display = !t || card.textContent.toLowerCase().indexOf(t) >= 0 ? '' : 'none';
  });
};

ScreensApoio.projectDetailLoad = function (params) { return DATA.project(params.id); };

ScreensApoio.projectDetail = function (params, p) {
  if (!p) return '<div class="erp-empty">Projeto não encontrado — ou sem permissão de leitura.</div>';

  const slots = Array.isArray(p.slots) ? p.slots : [];
  const thumb = p.ai_preview_url || p.thumbnail_data_url;

  /* slots é o jsonb que o portal grava. O formato é dele — o ERP só lê o que
     precisa e ignora o resto, para não quebrar quando o portal acrescentar
     campo novo. */
  const slotRows = slots.map(function (s, i) {
    return {
      n: i + 1,
      name: UI.esc(s.module_name || s.moduleName || '(módulo)'),
      dims: [s.width_mm, s.height_mm, s.depth_mm].every(function (v) { return v != null; })
        ? Math.round(s.width_mm) + ' × ' + Math.round(s.height_mm) + ' × ' + Math.round(s.depth_mm)
        : '—',
      pos: s.x_mm != null ? Math.round(s.x_mm) + ' mm da esquerda' : '—',
      floor: s.floor_height_mm != null ? Math.round(s.floor_height_mm) + ' mm do chão' : '0 mm do chão'
    };
  });

  return UI.crumb([{ label: 'Projetos', href: '#/projetos' }, { label: p.name }]) +
    UI.head(p.name, ScreensApoio.wallLabel(p) + ' · ' + slots.length + ' módulo(s)') +
    '<div class="erp-grid erp-grid-side"><div>' +
    UI.panel('Vista do projeto',
      thumb
        ? '<img src="' + UI.esc(thumb) + '" style="width:100%;border-radius:8px;border:1px solid var(--border)" alt="">'
        : '<div style="aspect-ratio:16/9;background:#efece6;border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9a9184">sem miniatura salva</div>') +
    UI.panel('Módulos do ambiente',
      UI.sourceNote('Lido do <span class="erp-mono">slots</span> (jsonb) que o portal grava. ' +
        'Posição é medida a partir da borda esquerda da parede.') +
      (slotRows.length
        ? UI.table([
            { key: 'n', label: '#', width: '40px' },
            { key: 'name', label: 'Módulo' },
            { key: 'dims', label: 'Dimensões (mm)' },
            { key: 'pos', label: 'Posição' },
            { key: 'floor', label: 'Altura' }
          ], slotRows)
        : '<div class="erp-empty">Projeto sem módulos posicionados.</div>')) +
    '</div><div>' +
    UI.panel('Ficha', UI.def([
      ['Nome', UI.esc(p.name)],
      ['Paredes', UI.esc(ScreensApoio.wallLabel(p))],
      ['Módulos', slots.length],
      ['Criado', UI.date(p.created_at)],
      ['Atualizado', UI.date(p.updated_at)],
      ['Render IA', p.ai_preview_url ? UI.pill('Sim', 'erp-pill-ok') : UI.pill('Não', 'erp-pill-neutral')]
    ])) +
    UI.panel('Viewer 3D',
      UI.demoNote('embutir o viewer3d.js do portal') +
      '<div class="erp-muted erp-xs">O plano é importar o arquivo do portal, não copiar — assim o 3D da fábrica ' +
      'nunca fica diferente do 3D que o cliente aprovou.</div>') +
    UI.panel('Para a montagem',
      '<div class="erp-muted erp-small">O que o montador costuma precisar olhar aqui:</div>' +
      '<ul class="erp-small" style="margin:8px 0 0;padding-left:18px">' +
      '<li>Qual lado do módulo encosta na parede (define o lado da fita)</li>' +
      '<li>Sentido de abertura das portas no canto</li>' +
      '<li>Altura do rodapé e folga do teto</li>' +
      '<li>Ordem de montagem em ambiente em L ou U</li>' +
      '</ul>') +
    '</div></div>';
};
