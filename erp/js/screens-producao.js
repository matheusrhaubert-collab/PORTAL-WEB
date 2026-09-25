/* Legno ERP — Processos, Lotes, Ordens de Produção e Apontamento.
 *
 * Encadeamento: PROCESSO (cadastro) → vira ROTEIRO no produto → ao liberar o
 * pedido gera ORDEM DE PRODUÇÃO com uma etapa por processo do roteiro →
 * as OPs de mesma cor entram num LOTE → o chão de fábrica APONTA por leitura.
 */

const ScreensProducao = {};

/* ============================================================
   Processos produtivos
   ============================================================ */
ScreensProducao.processes = function () {
  const rows = MOCK.processes.map(function (p) {
    const usedBy = MOCK.products.filter(function (m) { return m.mfg.route.indexOf(p.id) >= 0; }).length;
    return {
      _href: '#/processos/' + p.id,
      code: '<span class="erp-mono erp-strong">' + UI.esc(p.code) + '</span>',
      name: '<span class="erp-swatch" style="background:' + p.color + '"></span>' + UI.esc(p.name),
      wc: UI.esc(p.workcenter),
      setup: p.setup_min + ' min',
      time: p.time_min.toFixed(1).replace('.', ',') + ' min / ' + p.unit,
      scan: p.scan ? UI.pill('Sim', 'erp-pill-ok') : UI.pill('Não', 'erp-pill-neutral'),
      check: p.checklist + ' itens',
      used: usedBy + ' produto(s)'
    };
  });

  return UI.head('Processos Produtivos' + UI.demoTag(),
    'O processo é a peça de Lego do roteiro. Cadastra uma vez aqui, liga em quantos produtos quiser — e cada OP nasce com uma etapa por processo do roteiro.',
    '<button onclick="UI.todo(\'Novo processo\')">+ Novo processo</button>') +
    UI.panel(null, UI.table([
      { key: 'code', label: 'Código' },
      { key: 'name', label: 'Processo' },
      { key: 'wc', label: 'Centro de trabalho' },
      { key: 'setup', label: 'Setup', align: 'right' },
      { key: 'time', label: 'Tempo padrão', align: 'right' },
      { key: 'scan', label: 'Aponta por leitura' },
      { key: 'check', label: 'Checklist' },
      { key: 'used', label: 'Usado em' }
    ], rows), true) +
    UI.panel('Onde cada campo é usado', '<div class="erp-grid erp-grid-3">' +
      '<div><div class="erp-strong erp-small">Tempo padrão + setup</div><div class="erp-muted erp-small">Alimenta a capacidade do lote e a data prometida ao cliente. Sem isso o prazo é chute.</div></div>' +
      '<div><div class="erp-strong erp-small">Aponta por leitura</div><div class="erp-muted erp-small">Define se o operador bipa cada peça ou se confirma a etapa inteira de uma vez. Corte e colagem: peça a peça. Montagem: por módulo.</div></div>' +
      '<div><div class="erp-strong erp-small">Checklist</div><div class="erp-muted erp-small">Perguntas que travam o avanço da etapa. É onde a qualidade vira dado em vez de conversa.</div></div>' +
      '</div>');
};

ScreensProducao.processDetail = function (params) {
  const p = MOCK.processById(params.id);
  if (!p) return '<div class="erp-empty">Processo não encontrado.</div>';

  const checks = MOCK.processChecks[p.id] || [
    { id: 'x1', text: 'Checklist ainda não cadastrado para este processo', required: false, type: 'confirm' }
  ];

  const checkRows = checks.map(function (c, i) {
    const typeLabel = { confirm: 'Confirmação', medida: 'Medida', foto: 'Foto' }[c.type] || c.type;
    return {
      n: i + 1,
      text: UI.esc(c.text) + (c.target ? '<div class="erp-xs erp-muted">Alvo: ' + UI.esc(c.target) + '</div>' : ''),
      type: UI.pill(typeLabel, c.type === 'medida' ? 'erp-pill-info' : c.type === 'foto' ? 'erp-pill-accent' : 'erp-pill-neutral'),
      req: c.required ? UI.pill('Trava', 'erp-pill-danger') : UI.pill('Opcional', 'erp-pill-neutral'),
      act: '<button class="erp-btn-ghost erp-btn-sm" onclick="UI.todo(\'Editar item\')">Editar</button>'
    };
  });

  const used = MOCK.products.filter(function (m) { return m.mfg.route.indexOf(p.id) >= 0; });

  return UI.crumb([{ label: 'Processos', href: '#/processos' }, { label: p.name }]) +
    UI.head(p.name, 'Centro de trabalho: ' + UI.esc(p.workcenter),
      '<button class="erp-btn-secondary" onclick="UI.todo(\'Duplicar processo\')">Duplicar</button>' +
      '<button onclick="UI.todo(\'Salvar processo\')">Salvar</button>') +
    '<div class="erp-grid erp-grid-side">' +
    '<div>' +
      UI.panel('Definição',
        '<div class="erp-inline-fields" style="margin-bottom:14px">' +
        '<label class="erp-field"><span>Código</span><input type="text" value="' + UI.esc(p.code) + '"></label>' +
        '<label class="erp-field"><span>Nome</span><input type="text" value="' + UI.esc(p.name) + '"></label>' +
        '<label class="erp-field"><span>Centro de trabalho</span><select><option>' + UI.esc(p.workcenter) + '</option><option>Seccionadora</option><option>Coladeira</option><option>CNC Router</option><option>Bancada 1</option><option>Bancada QA</option><option>Expedição</option></select></label>' +
        '</div>' +
        '<div class="erp-inline-fields">' +
        '<label class="erp-field"><span>Setup (min)</span><input type="number" value="' + p.setup_min + '"></label>' +
        '<label class="erp-field"><span>Tempo por unidade (min)</span><input type="number" step="0.1" value="' + p.time_min + '"></label>' +
        '<label class="erp-field"><span>Unidade de apontamento</span><select><option>' + UI.esc(p.unit) + '</option><option>peça</option><option>módulo</option><option>chapa</option><option>volume</option></select></label>' +
        '<label class="erp-field"><span>Aponta por leitura</span><select><option>' + (p.scan ? 'Sim — bipa cada unidade' : 'Não — confirma a etapa') + '</option><option>' + (p.scan ? 'Não — confirma a etapa' : 'Sim — bipa cada unidade') + '</option></select></label>' +
        '</div>') +
      UI.panel('Checklist da etapa',
        '<div class="erp-note">Item marcado como <span class="erp-strong">Trava</span> impede o operador de fechar a etapa sem responder. É o que garante que o dado exista.</div>' +
        UI.table([
          { key: 'n', label: '#', width: '40px' },
          { key: 'text', label: 'Item' },
          { key: 'type', label: 'Tipo' },
          { key: 'req', label: 'Obrigatoriedade' },
          { key: 'act', label: '' }
        ], checkRows) +
        '<div style="margin-top:12px"><button class="erp-btn-secondary erp-btn-sm" onclick="UI.todo(\'Adicionar item de checklist\')">+ Adicionar item</button></div>') +
    '</div>' +
    '<div>' +
      UI.panel('Usado nos produtos', used.length
        ? '<ul style="margin:0;padding-left:18px" class="erp-small">' + used.map(function (m) {
            return '<li><a href="#/produtos/' + m.id + '">' + UI.esc(m.name) + '</a></li>';
          }).join('') + '</ul>'
        : '<span class="erp-muted erp-small">Nenhum produto usa este processo ainda.</span>') +
      UI.panel('Etiqueta padrão',
        '<div class="erp-muted erp-small" style="margin-bottom:10px">Layout impresso quando este processo emite etiqueta na Zebra.</div>' +
        '<select><option>Peça — chão de fábrica</option><option>Volume — expedição</option><option>Não imprime</option></select>' +
        '<div style="margin-top:10px"><a class="erp-btn erp-btn-secondary erp-btn-sm" href="#/etiquetas">Editar layouts</a></div>') +
    '</div></div>';
};

/* ScreensProducao.batches FOI REMOVIDA (2026-08-08).
   A tela de Lotes deixou de ser mockup: agora é LOTES_UI.list, em
   js/screens-lotes.js, lendo erp.batches de verdade (migration 081). A rota
   #/lotes em app.js aponta pra lá. */

/* ============================================================
   Ordens de produção — lista
   ============================================================ */
ScreensProducao.ops = function () {
  const rows = MOCK.ops.map(function (op) {
    const done = op.steps.filter(function (s) { return s.status === 'done'; }).length;
    const prog = done / op.steps.length;
    const cur = op.steps.find(function (s) { return s.status === 'doing'; });
    const d = UI.daysUntil(op.due);
    return {
      _href: '#/producao/' + op.code,
      code: '<span class="erp-mono erp-strong">' + UI.esc(op.code) + '</span>',
      order: '<a href="#/pedidos/' + op.order + '" class="erp-small">' + UI.esc(op.order) + '</a>',
      item: '<span class="erp-strong">' + UI.esc(op.name) + '</span><div class="erp-xs erp-muted">' + op.qty + ' un · ' + op.pieces + ' peças</div>',
      color: UI.swatch(op.hex, op.color),
      batch: '<span class="erp-mono erp-xs">' + UI.esc(op.batch) + '</span>',
      step: cur ? '<span class="erp-strong erp-small">' + UI.esc(MOCK.processById(cur.process).name) + '</span>' +
        '<div class="erp-xs erp-muted">' + cur.done + '/' + cur.qty + ' · ' + UI.esc(cur.operator || '') + '</div>'
        : '<span class="erp-muted erp-small">' + (op.status === 'concluida' ? 'finalizada' : 'não iniciada') + '</span>',
      prog: UI.bar(prog, prog === 1 ? 'ok' : '') + '<span class="erp-xs erp-muted">' + done + '/' + op.steps.length + ' etapas</span>',
      due: UI.date(op.due) + (d != null && d < 3 && op.status !== 'concluida' ? ' <span class="erp-pill erp-pill-danger">' + d + 'd</span>' : ''),
      status: UI.statusPill(MOCK.opStatus, op.status)
    };
  });

  return UI.head('Ordens de Produção' + UI.demoTag(),
    'Uma OP por item do pedido. Nasce do roteiro do produto: cada processo do roteiro vira uma etapa que precisa ser apontada.',
    '<button class="erp-btn-secondary" onclick="UI.todo(\'Programar semana\')">Programar semana</button>' +
    '<button onclick="UI.openScan()">Ler código</button>') +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:18px">' +
    UI.kpi('OPs abertas', MOCK.ops.filter(function (o) { return o.status !== 'concluida'; }).length, '3 em produção') +
    UI.kpi('Peças em curso', MOCK.ops.reduce(function (s, o) { return s + (o.status === 'em_producao' ? o.pieces : 0); }, 0), 'nas máquinas agora') +
    UI.kpi('Refugo do mês', '1,4%', '<span class="erp-pill erp-pill-ok">meta 2%</span>') +
    UI.kpi('Entrega no prazo', '94%', 'últimas 30 OPs') +
    '</div>' +
    UI.panel(null, '<div class="erp-toolbar">' +
      '<input type="search" placeholder="OP, pedido ou SKU…">' +
      '<select><option>Todos os status</option><option>Aguardando</option><option>Em produção</option><option>Concluída</option></select>' +
      /* O filtro por lote saiu daqui: os lotes agora são reais (erp.batches) e
         as OPs desta tela ainda são fictícias — cruzar os dois só produziria
         filtro que nunca casa. Volta quando a OP tiver batch_id de verdade. */
      '<select><option>Todos os centros</option><option>Seccionadora</option><option>Coladeira</option><option>CNC Router</option><option>Bancada 1</option></select>' +
      '</div>' +
      UI.table([
        { key: 'code', label: 'OP' },
        { key: 'order', label: 'Pedido' },
        { key: 'item', label: 'Item' },
        { key: 'color', label: 'Cor' },
        { key: 'batch', label: 'Lote' },
        { key: 'step', label: 'Etapa atual' },
        { key: 'prog', label: 'Progresso', width: '130px' },
        { key: 'due', label: 'Prazo' },
        { key: 'status', label: 'Status' }
      ], rows), true);
};

/* ============================================================
   Detalhe da OP — roteiro + checklist + peças
   ============================================================ */
ScreensProducao.opDetail = function (params) {
  const op = MOCK.opByCode(params.id);
  if (!op) return '<div class="erp-empty">Ordem de produção não encontrada.</div>';

  const order = MOCK.orderByNum(op.order);
  const proj = order ? MOCK.projects.find(function (p) { return p.id === order.project_id; }) : null;

  /* Roteiro visual */
  const route = op.steps.map(function (s) {
    const p = MOCK.processById(s.process);
    const cls = s.status === 'done' ? 'done' : s.status === 'doing' ? 'doing' : '';
    return '<div class="erp-route-step ' + cls + '">' +
      '<div class="erp-route-name">' + UI.esc(p.name) + '</div>' +
      '<div class="erp-route-meta">' + s.done + ' / ' + s.qty + ' ' + UI.esc(p.unit) + '</div>' +
      '<div class="erp-route-meta">' + (s.operator ? UI.esc(s.operator) : '—') + '</div>' +
      (s.finished ? '<div class="erp-route-meta erp-xs">' + UI.esc(s.finished) + '</div>' : '') +
      '</div>';
  }).join('');

  /* Etapa atual com checklist */
  const cur = op.steps.find(function (s) { return s.status === 'doing'; });
  let curPanel = '';
  if (cur) {
    const p = MOCK.processById(cur.process);
    const checks = MOCK.processChecks[p.id] || [
      { id: 'g1', text: 'Confirmar programa/ferramenta da etapa', required: true, type: 'confirm' },
      { id: 'g2', text: 'Conferir primeira peça contra a medida da OP', required: true, type: 'confirm' }
    ];
    curPanel = UI.panel('Etapa atual — ' + p.name,
      '<div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:14px">' +
      '<div><span class="erp-strong" style="font-size:18px">' + cur.done + ' / ' + cur.qty + '</span> ' +
      '<span class="erp-muted erp-small">' + UI.esc(p.unit) + 's apontadas</span>' +
      '<div class="erp-muted erp-small">Operador: ' + UI.esc(cur.operator || '—') + ' · ' + UI.esc(p.workcenter) + '</div></div>' +
      '<div style="flex:1;max-width:260px">' + UI.bar(cur.done / cur.qty) + '</div>' +
      '<div><button onclick="UI.openScan()">Apontar por leitura</button></div>' +
      '</div>' +
      '<div class="erp-strong erp-small" style="margin-bottom:6px">Checklist para fechar a etapa</div>' +
      '<ul class="erp-check-list">' + checks.map(function (c, i) {
        const checked = i < 2;
        return '<li class="' + (checked ? 'checked' : '') + '" onclick="this.classList.toggle(\'checked\');this.querySelector(\'input\').checked=!this.querySelector(\'input\').checked">' +
          '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onclick="event.stopPropagation()">' +
          '<div class="erp-check-body"><div class="erp-check-title">' + UI.esc(c.text) + '</div>' +
          '<div class="erp-check-meta">' + (c.required ? 'Obrigatório — trava o fechamento' : 'Opcional') +
          (c.target ? ' · alvo ' + UI.esc(c.target) : '') + '</div></div>' +
          (c.type === 'medida' ? '<input type="text" placeholder="mm" style="width:80px" onclick="event.stopPropagation()">' : '') +
          (c.type === 'foto' ? '<button class="erp-btn-secondary erp-btn-sm" onclick="event.stopPropagation();UI.todo(\'Anexar foto\')">Foto</button>' : '') +
          '</li>';
      }).join('') + '</ul>' +
      '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">' +
      '<button onclick="UI.todo(\'Fechar etapa\')">Fechar etapa</button>' +
      '<button class="erp-btn-secondary" onclick="UI.todo(\'Registrar parada\')">Registrar parada</button>' +
      '<button class="erp-btn-secondary erp-btn-danger" onclick="UI.todo(\'Registrar refugo\')">Refugo</button>' +
      '</div>');
  }

  /* Peças da OP */
  const pieces = MOCK.pieces.filter(function (pc) { return pc.op === op.code; });
  const pieceRows = pieces.map(function (pc) {
    return {
      code: '<span class="erp-mono erp-strong">' + UI.esc(pc.code) + '</span>',
      name: UI.esc(pc.name),
      dims: pc.w + ' × ' + pc.h + ' × ' + pc.thick,
      edge: UI.esc(pc.edge),
      sheet: '<span class="erp-mono erp-xs">' + UI.esc(pc.sheet) + '</span>',
      step: UI.esc(MOCK.processById(pc.step).name),
      status: pc.status === 'refugo' ? UI.pill('Refugo', 'erp-pill-danger')
        : pc.status === 'ok' ? UI.pill('Concluída', 'erp-pill-ok') : UI.pill('Em processo', 'erp-pill-accent'),
      act: '<button class="erp-btn-ghost erp-btn-sm" onclick="UI.todo(\'Reimprimir etiqueta\')">Etiqueta</button>'
    };
  });

  const side =
    UI.panel('Dados da OP', UI.def([
      ['Pedido', '<a href="#/pedidos/' + op.order + '">' + UI.esc(op.order) + '</a>'],
      ['Cliente', order ? UI.esc(order.client) : '—'],
      /* Texto, não link: op.batch é código fictício desta tela de exemplo e
         não corresponde a nenhum lote real de erp.batches. Link que leva a
         lugar nenhum é pior que texto. */
      ['Lote', '<span class="erp-mono erp-small">' + UI.esc(op.batch) + '</span> <span class="erp-muted erp-xs">(exemplo)</span>'],
      ['SKU', '<span class="erp-mono">' + UI.esc(op.sku) + '</span>'],
      ['Quantidade', op.qty + ' un (' + op.pieces + ' peças)'],
      ['Cor', UI.swatch(op.hex, op.color)],
      ['Prazo', UI.date(op.due)],
      ['Status', UI.statusPill(MOCK.opStatus, op.status)]
    ])) +
    UI.panel('Projeto 3D', proj
      ? '<div class="erp-thumb" style="margin-bottom:10px">render do projeto</div>' +
        '<div class="erp-small">' + UI.esc(proj.name) + '</div>' +
        '<div class="erp-muted erp-xs" style="margin-bottom:10px">Consulte antes de montar: mostra onde este módulo encaixa no ambiente.</div>' +
        '<a class="erp-btn erp-btn-secondary erp-btn-sm" href="#/projetos/' + proj.id + '">Abrir viewer 3D</a>'
      : '<span class="erp-muted erp-small">Sem projeto vinculado.</span>') +
    UI.panel('Documentos',
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      '<button class="erp-btn-secondary erp-btn-sm" onclick="UI.todo(\'Plano de corte\')">Plano de corte (PDF)</button>' +
      '<button class="erp-btn-secondary erp-btn-sm" onclick="UI.todo(\'Arquivo de furação\')">Furação .ban</button>' +
      '<button class="erp-btn-secondary erp-btn-sm" onclick="UI.todo(\'Lista de ferragens\')">Lista de ferragens</button>' +
      '<button class="erp-btn-secondary erp-btn-sm" onclick="UI.todo(\'Etiquetas da OP\')">Imprimir etiquetas</button>' +
      '</div>');

  return UI.crumb([{ label: 'Produção', href: '#/producao' }, { label: op.code }]) +
    UI.head(op.code, UI.esc(op.name) + ' · ' + op.qty + ' un · ' + UI.esc(op.color),
      '<button class="erp-btn-secondary" onclick="UI.todo(\'Parar OP\')">Parar OP</button>' +
      '<button onclick="UI.openScan()">Apontar</button>') +
    UI.panel('Roteiro', '<div class="erp-route">' + route + '</div>') +
    '<div class="erp-grid erp-grid-side"><div>' + curPanel +
    UI.panel('Peças desta OP (' + pieces.length + ' de ' + op.pieces + ')',
      UI.sourceNote('Cada peça nasce do plano de corte do portal e ganha um código próprio ' +
        '(<span class="erp-mono">erp.piece</span>) para poder ser etiquetada e bipada.') +
      UI.table([
        { key: 'code', label: 'Código' },
        { key: 'name', label: 'Peça' },
        { key: 'dims', label: 'Dimensões (mm)' },
        { key: 'edge', label: 'Fita' },
        { key: 'sheet', label: 'Chapa' },
        { key: 'step', label: 'Etapa' },
        { key: 'status', label: 'Status' },
        { key: 'act', label: '' }
      ], pieceRows)) +
    '</div><div>' + side + '</div></div>';
};

/* ============================================================
   Apontamento — chão de fábrica
   ============================================================ */
ScreensProducao.apontamento = function () {
  const logRows = MOCK.logs.map(function (l) {
    return {
      at: '<span class="erp-mono erp-small">' + UI.esc(l.at) + '</span>',
      code: '<span class="erp-mono">' + UI.esc(l.code) + '</span>',
      op: '<a href="#/producao/' + l.op + '" class="erp-mono erp-xs">' + UI.esc(l.op) + '</a>',
      process: UI.esc(l.process),
      operator: UI.esc(l.operator),
      result: l.result === 'ok' ? UI.pill('OK', 'erp-pill-ok') : UI.pill('Refugo', 'erp-pill-danger')
    };
  });

  return UI.head('Apontamento' + UI.demoTag(),
    'Tela do chão de fábrica: o operador escolhe o posto, bipa a peça e o sistema já sabe qual etapa fechar. Alvos grandes de propósito — é usada em pé, às vezes de luva.',
    '<button class="erp-btn-secondary" onclick="UI.todo(\'Trocar operador\')">Trocar operador</button>') +
    '<div class="erp-shopfloor" style="margin-bottom:18px">' +
    '<div class="erp-grid erp-grid-2" style="gap:24px">' +
    '<div>' +
    '<h2 style="color:rgba(242,237,228,.6)">Posto de trabalho</h2>' +
    '<select style="background:#332d27;color:#f2ede4;border-color:#4a423a;font-size:16px;padding:12px">' +
    MOCK.processes.map(function (p) { return '<option>' + UI.esc(p.workcenter) + ' — ' + UI.esc(p.name) + '</option>'; }).join('') +
    '</select>' +
    '<div style="margin-top:18px"><span class="erp-muted erp-small" style="color:rgba(242,237,228,.55)">Operador</span>' +
    '<div class="erp-strong" style="font-size:20px">R. Nunes · matrícula 0417</div></div>' +
    '<div class="erp-sf-actions">' +
    '<button onclick="UI.openScan()">Bipar peça</button>' +
    '<button class="erp-btn-secondary" onclick="UI.todo(\'Registrar parada de máquina\')">Parada</button>' +
    '</div>' +
    '</div>' +
    '<div>' +
    '<h2 style="color:rgba(242,237,228,.6)">Última leitura</h2>' +
    '<div class="erp-sf-code">PC-014841</div>' +
    '<div style="color:rgba(242,237,228,.75);margin-top:6px">Lateral esquerda · 560 × 720 × 18 · Nogueira Natural</div>' +
    '<div style="margin-top:10px">' + UI.pill('OP-0148-001', 'erp-pill-accent') + ' ' + UI.pill('Furação CNC', 'erp-pill-info') + ' ' + UI.pill('OK 14:22', 'erp-pill-ok') + '</div>' +
    '<div style="margin-top:20px;color:rgba(242,237,228,.75)">Nesta etapa hoje: <span class="erp-strong" style="font-size:22px">41</span> de 66 peças</div>' +
    '<div style="margin-top:8px">' + UI.bar(41 / 66) + '</div>' +
    '</div></div></div>' +
    UI.panel('Apontamentos recentes', UI.table([
      { key: 'at', label: 'Quando' },
      { key: 'code', label: 'Código lido' },
      { key: 'op', label: 'OP' },
      { key: 'process', label: 'Processo' },
      { key: 'operator', label: 'Operador' },
      { key: 'result', label: 'Resultado' }
    ], logRows)) +
    UI.panel('Como o código sabe o que fazer',
      '<div class="erp-grid erp-grid-4">' +
      '<div><div class="erp-strong erp-small">1. Operador escolhe o posto</div><div class="erp-muted erp-small">Define qual processo está sendo apontado. Uma escolha por turno, não por peça.</div></div>' +
      '<div><div class="erp-strong erp-small">2. Bipa o código</div><div class="erp-muted erp-small">O leitor de mão se comporta como teclado: manda os dígitos e um Enter. Nenhum driver especial.</div></div>' +
      '<div><div class="erp-strong erp-small">3. Sistema resolve sozinho</div><div class="erp-muted erp-small">Pelo código chega na peça, na OP e na etapa pendente daquele posto. O operador não escolhe nada.</div></div>' +
      '<div><div class="erp-strong erp-small">4. Checklist quando trava</div><div class="erp-muted erp-small">Se a etapa tem item obrigatório e é a primeira peça do lote, o checklist aparece antes de liberar.</div></div>' +
      '</div>');
};
