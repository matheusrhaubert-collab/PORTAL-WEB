/* Legno ERP — dados fictícios do mockup.
 *
 * PRINCÍPIO DE FONTE ÚNICA (decisão do Matt, 2026-08-06):
 * o ERP NÃO tem cadastro próprio de cliente, produto nem projeto. Ele lê as
 * tabelas que o portal já mantém e só acrescenta o que é de produção.
 *
 *   FONTE (schema public, do portal)        ACRÉSCIMO (schema erp)
 *   user_profiles / crm_clients ..........  erp.operator_profile (role de fábrica, matrícula, turno)
 *   modules + module_components ..........  erp.product_manufacturing (roteiro, lote mín., embalagem)
 *   projects / user_compositions .........  (nada — leitura pura, viewer 3D do portal)
 *   orders / order_items .................  erp.production_order, erp.batch, erp.financial_release
 *   cutting_list_items ...................  erp.piece (peça física com código de barras)
 *   colors ...............................  (nada — leitura pura)
 *
 * Os objetos abaixo trazem `_source` justamente para a tela mostrar de onde
 * cada bloco vem, e o que é editável aqui e o que não é.
 */

const MOCK = {};

/* ============================================================
   Origem dos dados — usado nas telas para marcar leitura x escrita
   ============================================================ */
MOCK.sources = {
  portal:  { label: 'Portal (leitura)',      pill: 'erp-pill-info',   table: 'public.*' },
  erp:     { label: 'ERP (editável aqui)',   pill: 'erp-pill-accent', table: 'erp.*' },
  derived: { label: 'Calculado',             pill: 'erp-pill-neutral', table: '—' }
};

/* ============================================================
   Clientes — espelho de public.crm_clients / user_profiles
   ============================================================ */
MOCK.clients = [
  { id: 'c1', name: 'Marcelo Andrade',    company: 'MA Interiores',      city: 'Orlando, FL',   type: 'dealer',  since: '2025-11-02' },
  { id: 'c2', name: 'Priscila Tavares',   company: '—',                  city: 'Miami, FL',     type: 'cliente', since: '2026-03-14' },
  { id: 'c3', name: 'Hoffman Cabinetry',  company: 'Hoffman Cabinetry',  city: 'Tampa, FL',     type: 'dealer',  since: '2025-08-21' },
  { id: 'c4', name: 'Renata Coelho',      company: '—',                  city: 'Boca Raton, FL',type: 'cliente', since: '2026-06-30' }
];

/* ============================================================
   Processos produtivos — erp.process
   Cada processo é uma etapa que pode ser ligada a um item.
   ============================================================ */
MOCK.processes = [
  { id: 'p1', code: 'CORTE',    name: 'Corte de chapa',        workcenter: 'Seccionadora',   setup_min: 12, unit: 'chapa', time_min: 4.5,  scan: true,  checklist: 3, color: '#3b6ea5' },
  { id: 'p2', code: 'COLA',     name: 'Coladeira de bordas',   workcenter: 'Coladeira',      setup_min: 8,  unit: 'peça',  time_min: 0.8,  scan: true,  checklist: 4, color: '#8a5a34' },
  { id: 'p3', code: 'FURO',     name: 'Furação CNC',           workcenter: 'CNC Router',     setup_min: 10, unit: 'peça',  time_min: 1.2,  scan: true,  checklist: 5, color: '#6e4527' },
  { id: 'p4', code: 'USIN',     name: 'Usinagem especial',     workcenter: 'CNC Router',     setup_min: 18, unit: 'peça',  time_min: 3.4,  scan: false, checklist: 2, color: '#7a5c8a' },
  { id: 'p5', code: 'MONT',     name: 'Pré-montagem',          workcenter: 'Bancada 1',      setup_min: 5,  unit: 'módulo',time_min: 14.0, scan: true,  checklist: 6, color: '#3f7d51' },
  { id: 'p6', code: 'QUAL',     name: 'Inspeção de qualidade', workcenter: 'Bancada QA',     setup_min: 0,  unit: 'módulo',time_min: 5.0,  scan: true,  checklist: 7, color: '#b8862b' },
  { id: 'p7', code: 'EMBAL',    name: 'Embalagem',             workcenter: 'Expedição',      setup_min: 3,  unit: 'volume',time_min: 6.5,  scan: true,  checklist: 4, color: '#b3432f' }
];

/* Checklist de um processo — erp.process_check */
MOCK.processChecks = {
  p3: [
    { id: 'k1', text: 'Programa .ban carregado corresponde ao SKU da OP', required: true,  type: 'confirm' },
    { id: 'k2', text: 'Broca Ø8 sem desgaste visível',                    required: true,  type: 'confirm' },
    { id: 'k3', text: 'Zerar origem da peça no canto inferior esquerdo',  required: true,  type: 'confirm' },
    { id: 'k4', text: 'Medir profundidade do furo de dobradiça (mm)',     required: true,  type: 'medida', target: '12,5 ± 0,3' },
    { id: 'k5', text: 'Foto da primeira peça do lote',                    required: false, type: 'foto' }
  ]
};

/* ============================================================
   Produtos — public.modules + erp.product_manufacturing
   ============================================================ */
MOCK.products = [
  {
    id: 'm1', sku: 'BASE-2P-600', name: 'Base 2 portas 600mm',
    family: 'Cozinha', category: 'Base',
    portal: { width_mm: 600, height_mm: 720, depth_mm: 560, colors: 14, components: 11, active: true },
    mfg:    { route: ['p1','p2','p3','p5','p6','p7'], min_batch: 4, lead_days: 6, volumes: 1, weight_kg: 28.4, packing: 'Caixa dupla + canto', has_route: true }
  },
  {
    id: 'm2', sku: 'AER-1P-400', name: 'Aéreo 1 porta 400mm',
    family: 'Cozinha', category: 'Aéreo',
    portal: { width_mm: 400, height_mm: 700, depth_mm: 330, colors: 14, components: 8, active: true },
    mfg:    { route: ['p1','p2','p3','p5','p7'], min_batch: 6, lead_days: 5, volumes: 1, weight_kg: 16.1, packing: 'Caixa simples', has_route: true }
  },
  {
    id: 'm3', sku: 'TORRE-FORNO', name: 'Torre forno + micro',
    family: 'Cozinha', category: 'Torre',
    portal: { width_mm: 600, height_mm: 2100, depth_mm: 600, colors: 14, components: 19, active: true },
    mfg:    { route: ['p1','p2','p3','p4','p5','p6','p7'], min_batch: 1, lead_days: 9, volumes: 2, weight_kg: 74.9, packing: 'Palete + cinta', has_route: true }
  },
  {
    id: 'm4', sku: 'CLOSET-MOD-900', name: 'Closet modular 900mm',
    family: 'Closet', category: 'Módulo',
    portal: { width_mm: 900, height_mm: 2400, depth_mm: 600, colors: 11, components: 16, active: true },
    mfg:    { route: [], min_batch: 1, lead_days: null, volumes: null, weight_kg: 61.2, packing: '—', has_route: false }
  },
  {
    id: 'm5', sku: 'GAV-4-800', name: 'Base 4 gavetas 800mm',
    family: 'Cozinha', category: 'Base',
    portal: { width_mm: 800, height_mm: 720, depth_mm: 560, colors: 14, components: 22, active: true },
    mfg:    { route: ['p1','p2','p3','p4','p5','p6','p7'], min_batch: 2, lead_days: 7, volumes: 1, weight_kg: 41.7, packing: 'Caixa dupla + canto', has_route: true }
  }
];

/* ============================================================
   Pedidos — public.orders + public.order_items
   ============================================================ */
MOCK.orders = [
  {
    id: 'o1', number: 'PED-2026-0148', client_id: 'c1', client: 'Marcelo Andrade / MA Interiores',
    created: '2026-07-28', due: '2026-08-19', status: 'em_producao',
    value: 18420.00, project_id: 'pj1', financial: 'liberado',
    made: [
      { id: 'i1', sku: 'BASE-2P-600',  name: 'Base 2 portas 600mm',   qty: 6, color: 'Nogueira Natural', hex: '#8a6540', op: 'OP-0148-001', progress: 0.83 },
      { id: 'i2', sku: 'AER-1P-400',   name: 'Aéreo 1 porta 400mm',   qty: 8, color: 'Branco Ártico',    hex: '#f2f0eb', op: 'OP-0148-002', progress: 0.55 },
      { id: 'i3', sku: 'TORRE-FORNO',  name: 'Torre forno + micro',   qty: 1, color: 'Nogueira Natural', hex: '#8a6540', op: 'OP-0148-003', progress: 0.20 },
      { id: 'i4', sku: 'GAV-4-800',    name: 'Base 4 gavetas 800mm',  qty: 2, color: 'Nogueira Natural', hex: '#8a6540', op: 'OP-0148-004', progress: 0.00 }
    ],
    bought: [
      { id: 'b1', ref: 'BLUM-CLIP-110', name: 'Dobradiça Blum Clip Top 110°', qty: 34, unit: 'un', supplier: 'Blum US',      status: 'estoque',   need_by: '2026-08-04' },
      { id: 'b2', ref: 'BLUM-TAND-500', name: 'Corrediça Tandem 500mm',       qty: 8,  unit: 'par',supplier: 'Blum US',      status: 'comprado',  need_by: '2026-08-06', po: 'OC-2026-0091' },
      { id: 'b3', ref: 'PUX-BAR-160',   name: 'Puxador barra 160mm inox',     qty: 16, unit: 'un', supplier: 'HardwareCo',   status: 'faltando',  need_by: '2026-08-08' },
      { id: 'b4', ref: 'PE-NIV-100',    name: 'Pé nivelador 100mm',           qty: 32, unit: 'un', supplier: 'HardwareCo',   status: 'estoque',   need_by: '2026-08-11' }
    ]
  },
  {
    id: 'o2', number: 'PED-2026-0151', client_id: 'c3', client: 'Hoffman Cabinetry',
    created: '2026-08-01', due: '2026-08-26', status: 'liberado',
    value: 32750.00, project_id: 'pj2', financial: 'liberado',
    made: [
      { id: 'i5', sku: 'CLOSET-MOD-900', name: 'Closet modular 900mm', qty: 5, color: 'Carvalho Cinza', hex: '#8f8c85', op: null, progress: 0 },
      { id: 'i6', sku: 'GAV-4-800',      name: 'Base 4 gavetas 800mm', qty: 3, color: 'Carvalho Cinza', hex: '#8f8c85', op: null, progress: 0 }
    ],
    bought: [
      { id: 'b5', ref: 'BLUM-TAND-500', name: 'Corrediça Tandem 500mm', qty: 12, unit: 'par', supplier: 'Blum US',    status: 'faltando', need_by: '2026-08-13' },
      { id: 'b6', ref: 'CAB-OVAL-900',  name: 'Cabide oval 900mm',      qty: 5,  unit: 'un',  supplier: 'HardwareCo', status: 'faltando', need_by: '2026-08-13' }
    ]
  },
  {
    id: 'o3', number: 'PED-2026-0153', client_id: 'c2', client: 'Priscila Tavares',
    created: '2026-08-03', due: '2026-09-02', status: 'aguardando_financeiro',
    value: 9880.00, project_id: 'pj3', financial: 'pendente',
    made: [
      { id: 'i7', sku: 'BASE-2P-600', name: 'Base 2 portas 600mm', qty: 4, color: 'Branco Ártico', hex: '#f2f0eb', op: null, progress: 0 },
      { id: 'i8', sku: 'AER-1P-400',  name: 'Aéreo 1 porta 400mm', qty: 4, color: 'Branco Ártico', hex: '#f2f0eb', op: null, progress: 0 }
    ],
    bought: [
      { id: 'b7', ref: 'BLUM-CLIP-110', name: 'Dobradiça Blum Clip Top 110°', qty: 16, unit: 'un', supplier: 'Blum US', status: 'estoque', need_by: '2026-08-20' }
    ]
  },
  {
    id: 'o4', number: 'PED-2026-0139', client_id: 'c4', client: 'Renata Coelho',
    created: '2026-07-12', due: '2026-08-07', status: 'expedicao',
    value: 14200.00, project_id: 'pj4', financial: 'liberado',
    made: [
      { id: 'i9',  sku: 'BASE-2P-600', name: 'Base 2 portas 600mm', qty: 3, color: 'Nogueira Natural', hex: '#8a6540', op: 'OP-0139-001', progress: 1 },
      { id: 'i10', sku: 'AER-1P-400',  name: 'Aéreo 1 porta 400mm', qty: 5, color: 'Nogueira Natural', hex: '#8a6540', op: 'OP-0139-002', progress: 1 }
    ],
    bought: [
      { id: 'b8', ref: 'PUX-BAR-160', name: 'Puxador barra 160mm inox', qty: 11, unit: 'un', supplier: 'HardwareCo', status: 'estoque', need_by: '2026-07-25' }
    ]
  }
];

MOCK.orderStatus = {
  aguardando_financeiro: { label: 'Aguardando financeiro', pill: 'erp-pill-warn' },
  liberado:              { label: 'Liberado p/ produção',  pill: 'erp-pill-info' },
  em_producao:           { label: 'Em produção',           pill: 'erp-pill-accent' },
  expedicao:             { label: 'Em expedição',          pill: 'erp-pill-ok' },
  entregue:              { label: 'Entregue',              pill: 'erp-pill-neutral' }
};

MOCK.buyStatus = {
  estoque:  { label: 'Em estoque',  pill: 'erp-pill-ok' },
  comprado: { label: 'Comprado',    pill: 'erp-pill-info' },
  faltando: { label: 'Falta',       pill: 'erp-pill-danger' }
};

/* ============================================================
   Lotes de produção
   ============================================================
   MOCK.batches FOI REMOVIDO (2026-08-08, a pedido do Matt: "quero tudo
   puxando do banco supabase, pode apagar os dados ficticios").

   O lote virou dado real: erp.batches + erp.batch_pieces + erp.cut_plans
   (migration 081), lidos por LOTES.* em js/data-lotes.js e desenhados por
   LOTES_UI.* em js/screens-lotes.js.

   Se você veio parar aqui procurando MOCK.batches por causa de algum código
   antigo: o código de lote de uma OP fictícia (MOCK.ops[].batch) continua
   sendo texto solto de exemplo — ele NÃO aponta pra um lote de verdade, e por
   isso deixou de ser link nas telas de OP. As telas de OP/apontamento ainda
   são mockup; quando virarem reais, a OP passa a ter batch_id de verdade. */

/* ============================================================
   Ordens de produção — erp.production_order
   ============================================================ */
MOCK.ops = [
  {
    id: 'op1', code: 'OP-0148-001', order: 'PED-2026-0148', batch: 'LOTE-2026-032',
    sku: 'BASE-2P-600', name: 'Base 2 portas 600mm', qty: 6,
    color: 'Nogueira Natural', hex: '#8a6540',
    due: '2026-08-11', status: 'em_producao', pieces: 66,
    steps: [
      { process: 'p1', status: 'done',  done: 66, qty: 66, operator: 'J. Silva',  finished: '2026-08-04 10:20' },
      { process: 'p2', status: 'done',  done: 66, qty: 66, operator: 'J. Silva',  finished: '2026-08-04 15:40' },
      { process: 'p3', status: 'doing', done: 41, qty: 66, operator: 'R. Nunes',  finished: null },
      { process: 'p5', status: 'todo',  done: 0,  qty: 6,  operator: null, finished: null },
      { process: 'p6', status: 'todo',  done: 0,  qty: 6,  operator: null, finished: null },
      { process: 'p7', status: 'todo',  done: 0,  qty: 6,  operator: null, finished: null }
    ]
  },
  {
    id: 'op2', code: 'OP-0148-002', order: 'PED-2026-0148', batch: 'LOTE-2026-033',
    sku: 'AER-1P-400', name: 'Aéreo 1 porta 400mm', qty: 8,
    color: 'Branco Ártico', hex: '#f2f0eb',
    due: '2026-08-12', status: 'em_producao', pieces: 64,
    steps: [
      { process: 'p1', status: 'done',  done: 64, qty: 64, operator: 'J. Silva', finished: '2026-08-05 09:10' },
      { process: 'p2', status: 'doing', done: 38, qty: 64, operator: 'M. Prado', finished: null },
      { process: 'p3', status: 'todo',  done: 0,  qty: 64, operator: null, finished: null },
      { process: 'p5', status: 'todo',  done: 0,  qty: 8,  operator: null, finished: null },
      { process: 'p7', status: 'todo',  done: 0,  qty: 8,  operator: null, finished: null }
    ]
  },
  {
    id: 'op3', code: 'OP-0148-003', order: 'PED-2026-0148', batch: 'LOTE-2026-032',
    sku: 'TORRE-FORNO', name: 'Torre forno + micro', qty: 1,
    color: 'Nogueira Natural', hex: '#8a6540',
    due: '2026-08-14', status: 'em_producao', pieces: 19,
    steps: [
      { process: 'p1', status: 'done',  done: 19, qty: 19, operator: 'J. Silva', finished: '2026-08-04 11:05' },
      { process: 'p2', status: 'doing', done: 7,  qty: 19, operator: 'M. Prado', finished: null },
      { process: 'p3', status: 'todo',  done: 0,  qty: 19, operator: null, finished: null },
      { process: 'p4', status: 'todo',  done: 0,  qty: 4,  operator: null, finished: null },
      { process: 'p5', status: 'todo',  done: 0,  qty: 1,  operator: null, finished: null },
      { process: 'p6', status: 'todo',  done: 0,  qty: 1,  operator: null, finished: null },
      { process: 'p7', status: 'todo',  done: 0,  qty: 2,  operator: null, finished: null }
    ]
  },
  {
    id: 'op4', code: 'OP-0148-004', order: 'PED-2026-0148', batch: 'LOTE-2026-032',
    sku: 'GAV-4-800', name: 'Base 4 gavetas 800mm', qty: 2,
    color: 'Nogueira Natural', hex: '#8a6540',
    due: '2026-08-15', status: 'aguardando', pieces: 44,
    steps: [
      { process: 'p1', status: 'todo', done: 0, qty: 44, operator: null, finished: null },
      { process: 'p2', status: 'todo', done: 0, qty: 44, operator: null, finished: null },
      { process: 'p3', status: 'todo', done: 0, qty: 44, operator: null, finished: null },
      { process: 'p4', status: 'todo', done: 0, qty: 8,  operator: null, finished: null },
      { process: 'p5', status: 'todo', done: 0, qty: 2,  operator: null, finished: null },
      { process: 'p6', status: 'todo', done: 0, qty: 2,  operator: null, finished: null },
      { process: 'p7', status: 'todo', done: 0, qty: 2,  operator: null, finished: null }
    ]
  },
  {
    id: 'op5', code: 'OP-0139-001', order: 'PED-2026-0139', batch: 'LOTE-2026-032',
    sku: 'BASE-2P-600', name: 'Base 2 portas 600mm', qty: 3,
    color: 'Nogueira Natural', hex: '#8a6540',
    due: '2026-08-06', status: 'concluida', pieces: 33,
    steps: [
      { process: 'p1', status: 'done', done: 33, qty: 33, operator: 'J. Silva', finished: '2026-08-01 09:00' },
      { process: 'p2', status: 'done', done: 33, qty: 33, operator: 'J. Silva', finished: '2026-08-01 14:20' },
      { process: 'p3', status: 'done', done: 33, qty: 33, operator: 'R. Nunes', finished: '2026-08-02 11:30' },
      { process: 'p5', status: 'done', done: 3,  qty: 3,  operator: 'M. Prado', finished: '2026-08-03 16:10' },
      { process: 'p6', status: 'done', done: 3,  qty: 3,  operator: 'A. Lopes', finished: '2026-08-04 08:45' },
      { process: 'p7', status: 'done', done: 3,  qty: 3,  operator: 'A. Lopes', finished: '2026-08-04 10:15' }
    ]
  }
];

MOCK.opStatus = {
  aguardando:  { label: 'Aguardando',  pill: 'erp-pill-neutral' },
  em_producao: { label: 'Em produção', pill: 'erp-pill-accent' },
  parada:      { label: 'Parada',      pill: 'erp-pill-danger' },
  concluida:   { label: 'Concluída',   pill: 'erp-pill-ok' }
};

/* ============================================================
   Peças físicas — erp.piece (uma linha por peça etiquetada)
   Origem: public.cutting_list_items do plano de corte.
   ============================================================ */
MOCK.pieces = [
  { code: 'PC-014801', op: 'OP-0148-001', name: 'Lateral esquerda', w: 560, h: 720, thick: 18, color: 'Nogueira Natural', edge: 'L1+L2', sheet: 'CH-032-07', step: 'p3', status: 'em_processo' },
  { code: 'PC-014802', op: 'OP-0148-001', name: 'Lateral direita',  w: 560, h: 720, thick: 18, color: 'Nogueira Natural', edge: 'L1+L2', sheet: 'CH-032-07', step: 'p3', status: 'em_processo' },
  { code: 'PC-014803', op: 'OP-0148-001', name: 'Fundo',            w: 564, h: 684, thick: 18, color: 'Nogueira Natural', edge: '—',     sheet: 'CH-032-08', step: 'p2', status: 'ok' },
  { code: 'PC-014804', op: 'OP-0148-001', name: 'Prateleira',       w: 546, h: 520, thick: 18, color: 'Nogueira Natural', edge: 'L1',    sheet: 'CH-032-08', step: 'p2', status: 'ok' },
  { code: 'PC-014805', op: 'OP-0148-001', name: 'Porta esquerda',   w: 297, h: 715, thick: 18, color: 'Nogueira Natural', edge: '4 lados', sheet: 'CH-032-09', step: 'p2', status: 'refugo' }
];

/* ============================================================
   Compras — erp.purchase_order
   ============================================================ */
MOCK.purchaseOrders = [
  {
    id: 'oc1', code: 'OC-2026-0091', supplier: 'Blum US', created: '2026-08-02',
    status: 'enviada', total: 1284.50, eta: '2026-08-09',
    items: [
      { ref: 'BLUM-TAND-500', name: 'Corrediça Tandem 500mm', qty: 20, unit: 'par', price: 42.30, for: 'PED-2026-0148' },
      { ref: 'BLUM-CLIP-110', name: 'Dobradiça Clip Top 110°', qty: 60, unit: 'un', price: 7.15, for: 'estoque' }
    ]
  },
  {
    id: 'oc2', code: 'OC-2026-0092', supplier: 'HardwareCo', created: '2026-08-05',
    status: 'rascunho', total: 612.00, eta: null,
    items: [
      { ref: 'PUX-BAR-160', name: 'Puxador barra 160mm inox', qty: 40, unit: 'un', price: 11.90, for: 'PED-2026-0148' },
      { ref: 'CAB-OVAL-900', name: 'Cabide oval 900mm', qty: 10, unit: 'un', price: 13.60, for: 'PED-2026-0151' }
    ]
  }
];

MOCK.poStatus = {
  rascunho: { label: 'Rascunho', pill: 'erp-pill-neutral' },
  enviada:  { label: 'Enviada',  pill: 'erp-pill-info' },
  recebida: { label: 'Recebida', pill: 'erp-pill-ok' }
};

/* Sugestão de IA de compra — o que a tela mostraria após analisar demanda x estoque */
MOCK.aiPurchase = {
  generated: '2026-08-06 08:12',
  reasoning: 'Cruzei a lista de itens comprados dos pedidos liberados e em produção com o estoque atual e o lead time de cada fornecedor. Considerei também o consumo médio das últimas 8 semanas para os itens de giro.',
  lines: [
    { ref: 'PUX-BAR-160',   name: 'Puxador barra 160mm inox', need: 27, stock: 11, suggest: 40, supplier: 'HardwareCo', lead: '5 dias', why: 'Falta 16 un para o PED-2026-0148 (precisa em 08/08) — já está no limite do lead time. Arredondei para 40 un: consumo médio de 9/semana e não há mínimo de pedido.', urgency: 'alta' },
    { ref: 'BLUM-TAND-500', name: 'Corrediça Tandem 500mm',   need: 20, stock: 0,  suggest: 20, supplier: 'Blum US',    lead: '7 dias', why: 'PED-2026-0151 precisa de 12 pares em 13/08 e a OC-0091 já cobre 20. Nenhuma ação nova necessária — mantido só para conferência.', urgency: 'coberto' },
    { ref: 'CAB-OVAL-900',  name: 'Cabide oval 900mm',        need: 5,  stock: 0,  suggest: 10, supplier: 'HardwareCo', lead: '5 dias', why: 'Item exclusivo do closet, sem estoque. Sugeri 10 porque o frete é o mesmo e o Hoffman costuma repetir esse módulo.', urgency: 'media' },
    { ref: 'PE-NIV-100',    name: 'Pé nivelador 100mm',       need: 32, stock: 96, suggest: 0,  supplier: 'HardwareCo', lead: '5 dias', why: 'Estoque cobre 3 semanas de demanda projetada. Não comprar agora.', urgency: 'ok' }
  ]
};

/* Liberação financeira
   MOCK.financial FOI REMOVIDO (2026-08-08). A aba Financeiro virou real:
   lê pedidos aprovados pelo cliente e grava orders.finance_released_at
   (migration 082) — ver ScreensComercial.financial e DATA.financeOrders.

   Condição de pagamento e valor de entrada, que existiam aqui como exemplo,
   NÃO foram implementados: o banco não tem esses campos. Se um dia forem
   necessários, viram colunas de verdade em orders — não voltam como mock. */

/* ============================================================
   Expedição — erp.shipment + erp.package
   ============================================================ */
MOCK.shipments = [
  {
    id: 's1', code: 'EXP-2026-0044', order: 'PED-2026-0139', client: 'Renata Coelho',
    address: '1420 NW 5th Ave, Boca Raton, FL 33432',
    status: 'conferindo', scheduled: '2026-08-07',
    packages: [
      { code: 'VOL-0139-01', desc: 'Base 2 portas 600mm (1/3)', weight: 28.4, dims: '620×740×580', scanned: true },
      { code: 'VOL-0139-02', desc: 'Base 2 portas 600mm (2/3)', weight: 28.4, dims: '620×740×580', scanned: true },
      { code: 'VOL-0139-03', desc: 'Base 2 portas 600mm (3/3)', weight: 28.4, dims: '620×740×580', scanned: false },
      { code: 'VOL-0139-04', desc: 'Aéreos 1 porta (1/2)',      weight: 32.2, dims: '820×720×350', scanned: true },
      { code: 'VOL-0139-05', desc: 'Aéreos 1 porta (2/2)',      weight: 16.1, dims: '420×720×350', scanned: false },
      { code: 'VOL-0139-06', desc: 'Ferragens e acessórios',    weight: 4.8,  dims: '400×300×200', scanned: true }
    ]
  },
  {
    id: 's2', code: 'EXP-2026-0045', order: 'PED-2026-0148', client: 'MA Interiores',
    address: '77 Lake Nona Blvd, Orlando, FL 32827',
    status: 'aguardando', scheduled: '2026-08-20',
    packages: []
  }
];

/* ============================================================
   Projetos 3D — public.projects (leitura pura, viewer do portal)
   ============================================================ */
MOCK.projects = [
  { id: 'pj1', name: 'Cozinha Andrade — L 3200×2800', order: 'PED-2026-0148', client: 'Marcelo Andrade', walls: 'L (2 paredes)', modules: 17, updated: '2026-07-27', value: 18420.00, has_photoreal: true },
  { id: 'pj2', name: 'Closet Hoffman — parede única',  order: 'PED-2026-0151', client: 'Hoffman Cabinetry', walls: 'Única', modules: 8, updated: '2026-08-01', value: 32750.00, has_photoreal: true },
  { id: 'pj3', name: 'Cozinha Tavares — compacta',     order: 'PED-2026-0153', client: 'Priscila Tavares', walls: 'Única', modules: 8, updated: '2026-08-03', value: 9880.00, has_photoreal: false },
  { id: 'pj4', name: 'Cozinha Coelho — U 3600',        order: 'PED-2026-0139', client: 'Renata Coelho', walls: 'C-U (3 paredes)', modules: 8, updated: '2026-07-10', value: 14200.00, has_photoreal: true }
];

/* ============================================================
   Etiquetas — erp.label_template
   Campos disponíveis vêm das tabelas do portal + ERP.
   ============================================================ */
MOCK.labelFields = [
  { key: 'PIECE_CODE',  label: 'Código da peça',  sample: 'PC-014801',      from: 'erp.piece' },
  { key: 'PIECE_NAME',  label: 'Nome da peça',    sample: 'Lateral esquerda', from: 'public.cutting_list_items' },
  { key: 'OP_CODE',     label: 'Ordem de produção', sample: 'OP-0148-001',  from: 'erp.production_order' },
  { key: 'ORDER_NO',    label: 'Pedido',          sample: 'PED-2026-0148',  from: 'public.orders' },
  { key: 'CLIENT',      label: 'Cliente',         sample: 'MA Interiores',  from: 'public.user_profiles' },
  { key: 'SKU',         label: 'SKU do módulo',   sample: 'BASE-2P-600',    from: 'public.modules' },
  { key: 'DIMS',        label: 'Dimensões',       sample: '560 × 720 × 18', from: 'public.cutting_list_items' },
  { key: 'COLOR',       label: 'Cor',             sample: 'Nogueira Natural', from: 'public.colors' },
  { key: 'EDGE',        label: 'Fita de borda',   sample: 'L1+L2',          from: 'public.cutting_list_items' },
  { key: 'SHEET',       label: 'Chapa',           sample: 'CH-032-07',      from: 'erp.batch' },
  { key: 'BATCH',       label: 'Lote',            sample: 'LOTE-2026-032',  from: 'erp.batch' },
  { key: 'VOL_CODE',    label: 'Código do volume', sample: 'VOL-0139-01',   from: 'erp.package' },
  { key: 'VOL_SEQ',     label: 'Volume x de y',   sample: '1 / 3',          from: 'erp.package' },
  { key: 'WEIGHT',      label: 'Peso',            sample: '28,4 kg',        from: 'public.order_items' },
  { key: 'DATE',        label: 'Data',            sample: '06/08/2026',     from: '—' }
];

MOCK.labelTemplates = [
  {
    id: 'lt1', name: 'Peça — chão de fábrica', width_mm: 100, height_mm: 50, dpi: 203,
    elements: [
      { id: 'e1', type: 'text',    x: 3,  y: 3,  field: 'PIECE_NAME', size: 22, bold: true },
      { id: 'e2', type: 'text',    x: 3,  y: 11, field: 'DIMS',       size: 16, bold: false },
      { id: 'e3', type: 'barcode', x: 3,  y: 19, field: 'PIECE_CODE', w: 60, h: 16 },
      { id: 'e4', type: 'text',    x: 3,  y: 37, field: 'PIECE_CODE', size: 14, bold: false },
      { id: 'e5', type: 'text',    x: 3,  y: 43, field: 'OP_CODE',    size: 14, bold: true },
      { id: 'e6', type: 'qr',      x: 72, y: 19, field: 'PIECE_CODE', w: 25, h: 25 },
      { id: 'e7', type: 'text',    x: 66, y: 3,  field: 'COLOR',      size: 14, bold: false }
    ]
  },
  {
    id: 'lt2', name: 'Volume — expedição', width_mm: 100, height_mm: 75, dpi: 203,
    elements: [
      { id: 'e1', type: 'text',    x: 3, y: 3,  field: 'CLIENT',   size: 26, bold: true },
      { id: 'e2', type: 'text',    x: 3, y: 13, field: 'ORDER_NO', size: 18, bold: false },
      { id: 'e3', type: 'text',    x: 3, y: 21, field: 'VOL_SEQ',  size: 30, bold: true },
      { id: 'e4', type: 'barcode', x: 3, y: 34, field: 'VOL_CODE', w: 90, h: 20 },
      { id: 'e5', type: 'text',    x: 3, y: 57, field: 'VOL_CODE', size: 16, bold: false },
      { id: 'e6', type: 'text',    x: 3, y: 65, field: 'WEIGHT',   size: 16, bold: false }
    ]
  }
];

/* ============================================================
   Apontamentos recentes — erp.production_log
   ============================================================ */
MOCK.logs = [
  { at: '2026-08-06 14:22', code: 'PC-014841', op: 'OP-0148-001', process: 'Furação CNC',      operator: 'R. Nunes', result: 'ok' },
  { at: '2026-08-06 14:19', code: 'PC-014840', op: 'OP-0148-001', process: 'Furação CNC',      operator: 'R. Nunes', result: 'ok' },
  { at: '2026-08-06 14:11', code: 'PC-014805', op: 'OP-0148-001', process: 'Coladeira',        operator: 'M. Prado', result: 'refugo' },
  { at: '2026-08-06 13:58', code: 'PC-014839', op: 'OP-0148-002', process: 'Coladeira',        operator: 'M. Prado', result: 'ok' },
  { at: '2026-08-06 13:47', code: 'VOL-0139-04', op: 'OP-0139-002', process: 'Embalagem',      operator: 'A. Lopes', result: 'ok' },
  { at: '2026-08-06 13:30', code: 'PC-014838', op: 'OP-0148-002', process: 'Coladeira',        operator: 'M. Prado', result: 'ok' }
];

MOCK.processById = function (id) { return MOCK.processes.find(function (p) { return p.id === id; }); };
MOCK.opByCode    = function (c)  { return MOCK.ops.find(function (o) { return o.code === c; }); };
MOCK.orderByNum  = function (n)  { return MOCK.orders.find(function (o) { return o.number === n; }); };
