/* Legno ERP — camada de dados do Lote e do Plano de Corte (migration 081).
 *
 * Tudo aqui vive no schema `erp` do MESMO Supabase. O acesso é por
 * supabaseClient.schema('erp') — exige que `erp` esteja em Settings -> API ->
 * Exposed schemas (o cabeçalho da migration 081 explica). Se faltar, a API
 * responde 404 e DATA.explainError não ajuda, então LOTES.explainError trata
 * esse caso por nome.
 *
 * REGRA QUE NÃO SE QUEBRA: nada aqui cria ou altera cadastro do portal. Os
 * pedidos, as cores e os tamanhos de chapa são LEITURA de public. A única
 * escrita fora do schema erp é... nenhuma.
 */

const LOTES = {};

LOTES.erp = function () {
  const sb = DATA.sb();
  return sb ? sb.schema('erp') : null;
};

LOTES.explainError = function (err) {
  const msg = (err && err.message) || String(err);
  /* "Invalid schema: erp" é o texto que o Supabase devolve hoje; versões
     anteriores do PostgREST diziam "The schema must be one of the following".
     Os três padrões significam a mesma coisa e pedem a mesma correção. */
  if (/invalid schema/i.test(msg) || /schema must be one of|The schema must be/i.test(msg) || /PGRST106/.test(msg)) {
    return 'O schema "erp" existe no banco mas não está liberado na API — por isso a requisição nem chega nas tabelas.\n\n' +
      'Como resolver, no painel do Supabase:\n' +
      '1. Project Settings → API (ou Data API, dependendo da versão do painel)\n' +
      '2. Procure o campo "Exposed schemas" — hoje ele tem public e graphql_public\n' +
      '3. Acrescente erp à lista e salve\n' +
      '4. Volte aqui e clique em "Tentar de novo"\n\n' +
      'Isso é feito uma vez só. Se ainda não rodou o database/migration_081_erp_lotes_plano_de_corte.sql, ' +
      'rode antes — o passo acima libera o acesso, mas as tabelas precisam existir.';
  }
  /* CUIDADO ao mexer daqui pra baixo: a primeira versão marcava QUALQUER
     "does not exist" como "falta rodar a 081", e isso escondeu por um bom
     tempo um erro que era outra coisa (uma coluna de public que faltava).
     Palpite errado com cara de certeza é pior que erro cru. Agora cada ramo
     exige evidência específica, e o texto do banco sempre aparece no fim. */
  if (/relation "?erp\./i.test(msg) || /'erp\.\w+'/.test(msg)) {
    return 'A tabela do schema erp não existe neste banco — falta rodar ' +
      'database/migration_081_erp_lotes_plano_de_corte.sql. Detalhe: ' + msg;
  }
  const col = msg.match(/column ([\w.]+) does not exist/i);
  if (col) {
    return 'A coluna ' + col[1] + ' não existe neste banco. Isso é uma migration anterior pendente, ' +
      'não a 081 — o Postgres derruba a consulta inteira quando UMA coluna pedida falta. ' +
      'Rode as migrations que estão faltando (a pasta database/ está numerada em ordem). Detalhe: ' + msg;
  }
  if (/does not exist/i.test(msg)) {
    return 'Algo que a consulta pediu não existe neste banco — provavelmente uma migration pendente. ' +
      'Detalhe: ' + msg;
  }
  return DATA.explainError(err);
};

/* ============================================================
   Cores e tamanhos de chapa (leitura de public — fonte única)
   ============================================================ */
LOTES.colors = function () {
  return DATA._once('erp_colors', async function () {
    const { data, error } = await DATA.sb().from('colors').select('*').order('name');
    if (error) throw error;
    return data || [];
  });
};

LOTES.sheetSizes = function () {
  return DATA._once('erp_sheet_sizes', async function () {
    const { data, error } = await DATA.sb()
      .from('cutting_list_sheet_sizes').select('*').eq('active', true).order('sort_order');
    if (error) throw error;
    return data || [];
  });
};

/* ============================================================
   Parâmetros do plano
   ============================================================ */
LOTES.PARAM_DEFAULTS = {
  name: 'Novo perfil',
  kerf_mm: 4,
  trim_left_mm: 10, trim_right_mm: 10, trim_top_mm: 10, trim_bottom_mm: 10,
  trim_retalho_mm: 15, // refile menor, nos 4 lados, quando a chapa é um retalho do estoque
  strategy: 'guilhotina',
  first_cut: 'auto',
  allow_rotation: true,
  respect_grain: true,
  use_offcuts: true,
  offcut_priority: 'menor_primeiro',
  min_offcut_width_mm: 200,
  min_offcut_height_mm: 200,
  label_prefix: 'PC',
  label_show_client: true,
  label_show_module: true,
  label_show_edge: true,
  active: true
};

LOTES.params = async function () {
  const { data, error } = await LOTES.erp()
    .from('cut_plan_params').select('*').eq('active', true)
    .order('is_default', { ascending: false }).order('name');
  if (error) throw error;
  return data || [];
};

LOTES.paramById = async function (id) {
  const { data, error } = await LOTES.erp().from('cut_plan_params').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
};

LOTES.saveParams = async function (row) {
  const erp = LOTES.erp();
  /* Só um padrão por vez — o índice único no banco garante, mas ele ERRA em
     vez de trocar. Desmarcar antes deixa a tela funcionar como o usuário
     espera: marcar um novo padrão simplesmente troca o anterior. */
  if (row.is_default) {
    const q = erp.from('cut_plan_params').update({ is_default: false }).eq('is_default', true);
    if (row.id) q.neq('id', row.id);
    const { error: e0 } = await q;
    if (e0) throw e0;
  }
  const payload = Object.assign({}, row, { updated_at: new Date().toISOString() });
  /* trim_retalho_mm chegou na migration 159. Se o banco ainda não tem a
     coluna, salva o resto e avisa — o valor digitado ainda vale na geração
     (vai no params_snapshot do plano), só não fica gravado no perfil. */
  const semColuna = function (e) { return e && /trim_retalho_mm/.test(String(e.message || '')); };
  const grava = async function (pl) {
    if (pl.id) return erp.from('cut_plan_params').update(pl).eq('id', pl.id).select().maybeSingle();
    const ins = Object.assign({}, pl); delete ins.id;
    return erp.from('cut_plan_params').insert(ins).select().maybeSingle();
  };
  let r = await grava(payload);
  if (r.error && semColuna(r.error)) {
    const pl2 = Object.assign({}, payload); delete pl2.trim_retalho_mm;
    r = await grava(pl2);
    if (!r.error) LOTES.paramsMigrationPending = 'Refile do retalho não foi gravado no perfil: falta rodar a migration 159 (database/migration_159_refile_retalho.sql).';
  }
  if (r.error) throw r.error;
  return r.data;
};

LOTES.deleteParams = async function (id) {
  /* Soft delete: plano antigo aponta pra este perfil (params_id) e o histórico
     não pode perder a referência. active=false some da lista de escolha. */
  const { error } = await LOTES.erp().from('cut_plan_params').update({ active: false }).eq('id', id);
  if (error) throw error;
};

/* ============================================================
   Explosão de peças — de PEDIDO pra PEÇA de chapa
   ============================================================
   Duas origens, porque o portal grava pedido de dois jeitos:

   a) order_type 'modules' e 'project' → public.order_items.breakdown (jsonb).
      É a árvore calculada por Pricing.calculateAssembly. Peça-módulo
      (is_module) é sub-montagem, não peça física — precisa achatar até a
      folha. Peça com origin='comprado' (puxador, pé, ferragem) NÃO é cortada,
      fica de fora.

   b) order_type 'cutting_list' → public.cutting_list_items. A peça já vem
      pronta: comprimento, largura, espessura, cor, fita, veio.

   Isto é uma reimplementação deliberada de flattenOrderItemBreakdown +
   sortPieceCutDims (js/admin.js). Copiar 40 linhas é mais barato que fazer o
   ERP carregar admin.js inteiro — mas se a convenção de dimensão mudar lá,
   tem que mudar aqui junto.
*/

/* Espessura = menor das 3 dimensões, largura = a do meio, comprimento = maior.
   width/height/depth sozinhos não dizem qual é qual: depende de como a peça
   foi montada no módulo. Toda peça de chapa é fina num dos eixos. */
LOTES.sortCutDims = function (w, h, d) {
  const s = [Number(w) || 0, Number(h) || 0, Number(d) || 0].sort(function (a, b) { return a - b; });
  return { espessura_mm: s[0], largura_mm: s[1], comprimento_mm: s[2] };
};

/* COMPRIMENTO NO SENTIDO DO VEIO (2026-09-24). Matt, com o LT-26-0014 já
   cortado: "as portas do módulo 11 estão na horizontal e deveriam estar na
   vertical... painéis que mostram na vertical no projeto foram cortados na
   horizontal". O nesting põe o comprimento sempre no sentido do veio
   (NESTING, "peça com grain=true nunca gira"), e sortCutDims acima dizia que
   comprimento = maior medida — logo o veio seguia o LADO LONGO: porta mais
   larga que alta (377×328) saía deitada, painel "Vertical no Plano" largo,
   idem. O 3D nunca fez isso (lê positioning/veio/papel).

   Agora a peça de módulo traz `grain_axis` no breakdown ('w'|'h'|'d', a
   MESMA regra do desenho — Pricing.grainAxisForPiece): comprimento = medida
   nesse eixo, largura = a outra medida que não é a espessura. Pode ficar
   comprimento < largura (porta 328 × 377) — é o esperado: comprimento é
   "no sentido do veio", não "o maior". Sem grain_axis (pedido antigo) ou
   material SEM veio (aí a orientação não importa e o nesting gira à
   vontade), cai no sortCutDims de sempre. */
LOTES.cutDimsPeloVeio = function (leaf, hasGrain) {
  const base = LOTES.sortCutDims(leaf.width_mm, leaf.height_mm, leaf.depth_mm);
  const eixo = leaf && leaf.grain_axis;
  if (!hasGrain || (eixo !== 'w' && eixo !== 'h' && eixo !== 'd')) return base;
  const dims = { w: Number(leaf.width_mm) || 0, h: Number(leaf.height_mm) || 0, d: Number(leaf.depth_mm) || 0 };
  const fino = ['w', 'h', 'd'].reduce(function (a, k) { return dims[k] < dims[a] ? k : a; }, 'w');
  if (eixo === fino) return base; // dado ruim: veio no eixo da espessura
  const outro = ['w', 'h', 'd'].find(function (k) { return k !== fino && k !== eixo; });
  return { espessura_mm: dims[fino], largura_mm: dims[outro], comprimento_mm: dims[eixo] };
};

LOTES.flattenBreakdown = function (breakdown, multiplier, out) {
  out = out || [];
  (breakdown || []).forEach(function (p) {
    const qty = (p.quantity || 1) * multiplier;
    if (p.is_module) {
      LOTES.flattenBreakdown(p.child_breakdown, qty, out);
      return;
    }
    out.push({
      reference: p.reference || '—',
      description: p.description || '—',
      origin: p.origin || 'fabricacao',
      color_role_id: p.color_role_id,
      width_mm: p.width_mm, height_mm: p.height_mm, depth_mm: p.depth_mm,
      edge_band_m: Number(p.edge_band_m) || 0,
      quantity: qty,
      // Pareamento de produção (migration 145) — carrega até explodeOrders
      // poder trocar "N peças vendidas" por "ceil(N/pair_group_size) peças
      // físicas de pair_physical_width_mm" na hora de montar o lote. Ver
      // Pricing.calculateLeafPiece (js/pricing.js) — mesmo par de campos.
      pair_group_size: p.pair_group_size || null,
      pair_physical_width_mm: p.pair_physical_width_mm || null,
      // Fita do cadastro (0/1/2/4, ver js/pricing.js calculateLeafPiece) —
      // pedido do Matt (21/09): a etiqueta precisa mostrar isso "conforme
      // cadastro", não só o metro linear (edge_band_m acima).
      edge_banding: (typeof p.edge_banding === 'number') ? p.edge_banding : null,
      // Eixo do veio (2026-09-24, ver LOTES.cutDimsPeloVeio) — null em
      // pedido gravado antes.
      grain_axis: p.grain_axis || null,
      // Componente de origem (public.components.id) — pra buscar a fita no
      // cadastro quando o snapshot do pedido é anterior ao campo acima.
      piece_id: p.piece_id || null
    });
  });
  return out;
};

/* Peças de um conjunto de pedidos, já agrupadas (mesma peça = mesma linha com
   quantidade somada). Devolve o formato de erp.batch_pieces, sem batch_id. */
LOTES.explodeOrders = async function (orderIds) {
  if (!orderIds || !orderIds.length) return [];
  const sb = DATA.sb();
  const colors = await LOTES.colors();
  const colorById = {};
  const colorByName = {};
  colors.forEach(function (c) { colorById[c.id] = c; colorByName[(c.name || '').toLowerCase()] = c; });

  const { data: orders, error: eo } = await sb.from('orders').select('*').in('id', orderIds);
  if (eo) throw eo;

  /* order_type só existe a partir da migration 051. Se o banco for anterior,
     o campo vem undefined — e undefined !== 'cutting_list' cai no ramo de
     módulo, que é justamente o comportamento correto pra um banco que ainda
     não tinha pedido de planilha. */
  const moduleOrderIds = (orders || []).filter(function (o) { return o.order_type !== 'cutting_list'; }).map(function (o) { return o.id; });
  const cutlistOrderIds = (orders || []).filter(function (o) { return o.order_type === 'cutting_list'; }).map(function (o) { return o.id; });

  const [itemsRes, cutRes] = await Promise.all([
    moduleOrderIds.length
      ? sb.from('order_items').select('id, order_id, module_name, quantity, selected_colors, breakdown, sort_order').in('order_id', moduleOrderIds).order('sort_order')
      : Promise.resolve({ data: [] }),
    cutlistOrderIds.length
      ? sb.from('cutting_list_items').select('*').in('order_id', cutlistOrderIds).order('sort_order')
      : Promise.resolve({ data: [] })
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (cutRes.error) throw cutRes.error;

  const orderById = {};
  (orders || []).forEach(function (o) { orderById[o.id] = o; });

  /* Fita "conforme cadastro" pra pedido ANTIGO. order_items.breakdown é um
     snapshot gravado na hora do orçamento; `edge_banding` só passou a
     entrar nele em 21/09 (js/pricing.js). Todo pedido orçado antes disso
     não tem a chave — e o lote saía com EDGEBAND 0 em TODAS as peças, mesmo
     com metro de fita > 0 (achado do Matt no LT-26-0014, 21/09-9). Pra
     essas, busca o valor atual em public.components pelo piece_id do leaf.
     Pedido novo continua usando o snapshot (é o que estava valendo no
     orçamento). */
  /* Mesma rede de segurança pro VEIO (2026-09-24, ver cutDimsPeloVeio):
     `grain_axis` só entra no breakdown a partir de hoje. Pedido antigo (o
     KITCHEN01 inteiro, e tudo que já estava orçado) não tem — e cairia no
     lado longo, que é exatamente o erro (porta larga deitada). Pra essas,
     recalcula o eixo com Pricing.grainAxisForPiece a partir do cadastro
     ATUAL da peça (papel, positioning do tipo, veio do componente), pelo
     piece_id. Peça do Construtor de pedido antigo (piece_id 'lay:...', não
     existe no catálogo) fica sem — só o pedido novo cobre essas. */
  const missingPieceIds = new Set();
  const missingGrainIds = new Set();
  (itemsRes.data || []).forEach(function (item) {
    LOTES.flattenBreakdown(item.breakdown, 1).forEach(function (leaf) {
      if (typeof leaf.edge_banding !== 'number' && leaf.piece_id) missingPieceIds.add(leaf.piece_id);
      if (!leaf.grain_axis && leaf.piece_id) missingGrainIds.add(leaf.piece_id);
    });
  });
  const compEdge = {}; // piece_id (module_components.id) -> components.edge_banding
  const compVeio = {}; // piece_id -> { position_role, positioning, veio } (pro grain_axis de pedido antigo)
  const todosIds = Array.from(new Set(Array.from(missingPieceIds).concat(Array.from(missingGrainIds))));
  if (todosIds.length) {
    // piece_id do breakdown é public.module_components.id (a posição da peça
    // no módulo); a fita/veio moram em public.components (component_id) e o
    // positioning no tipo do componente.
    const { data: mcs, error: eMc } = await sb.from('module_components')
      .select('id, component_id, position_role').in('id', todosIds);
    if (eMc) throw eMc;
    const compIds = Array.from(new Set((mcs || []).map(function (m) { return m.component_id; }).filter(Boolean)));
    const { data: comps, error: eComp } = compIds.length
      ? await sb.from('components').select('id, edge_banding, veio, position_role, component_types(positioning)').in('id', compIds)
      : { data: [], error: null };
    if (eComp) throw eComp;
    const ebByComp = {}, veioByComp = {};
    (comps || []).forEach(function (cp) {
      ebByComp[cp.id] = cp.edge_banding;
      veioByComp[cp.id] = {
        veio: cp.veio || 'livre',
        position_role: cp.position_role || null,
        positioning: cp.component_types ? cp.component_types.positioning : null
      };
    });
    (mcs || []).forEach(function (m) {
      compEdge[m.id] = ebByComp[m.component_id];
      const v = veioByComp[m.component_id];
      if (v) compVeio[m.id] = Object.assign({}, v, { position_role: m.position_role || v.position_role || 'other' });
    });
  }
  // Eixo do veio de um leaf: o do breakdown, senão recalculado do cadastro.
  function grainAxisDoLeaf(leaf) {
    if (leaf.grain_axis) return leaf.grain_axis;
    const cad = leaf.piece_id ? compVeio[leaf.piece_id] : null;
    if (!cad || typeof Pricing === 'undefined' || !Pricing.grainAxisForPiece) return null;
    return Pricing.grainAxisForPiece(cad, leaf);
  }

  const grouped = new Map();
  function add(row) {
    /* Chave de agrupamento: o que faz duas peças serem A MESMA peça pro corte.
       Módulo entra na chave de propósito — na bancada importa saber de qual
       móvel a peça é, mesmo que a medida bata com a de outro. */
    /* NÚMERO do módulo também entra na chave (pedido do Matt, 21/09-10):
       2 módulos idênticos do mesmo pedido geravam UMA linha com quantidade
       somada e a etiqueta saía "MÓD 47, 48, 51" em todas — ele quer cada
       peça física apontando pra UM módulo só ("fica mais fácil de separar
       e organizar"). Exceção: peça com pareamento de produção (migration
       145, pair_group_size > 1) continua fundindo entre módulos, senão o
       ceil(vendidos / pair) viraria 1 chapa por módulo em vez de 1 pra
       cada N — nessa a etiqueta segue listando os módulos. */
    const moduleKey = (row.pair_group_size > 1) ? '' : (row.module_number || '');
    const key = [row.order_id, row.module_name, moduleKey, row.reference, row.description,
      row.comprimento_mm.toFixed(1), row.largura_mm.toFixed(1), row.espessura_mm.toFixed(1),
      row.color_id || row.color_name, row.edge_banding, row.has_grain].join('|');
    if (!grouped.has(key)) grouped.set(key, Object.assign({}, row, { quantity: 0, edge_band_m: 0, _moduleNumbers: new Set(), _orderItemIds: new Set() }));
    const g = grouped.get(key);
    g.quantity += row.quantity;
    g.edge_band_m += row.edge_band_m || 0;
    // Normalmente 1 módulo só, mas se o MESMO módulo aparecer 2x no pedido
    // como itens separados (em vez de aumentar a quantidade), a peça funde
    // (module_name entra na chave) e os dois números precisam sobreviver.
    if (row.module_number) g._moduleNumbers.add(row.module_number);
    // order_item_id (migration 158) — mesma lógica: guarda TODOS os
    // order_items que caíram nesta linha fundida, pro visor 3D da peça
    // (#/peca/:codigo) saber qual(is) módulo(s) reabrir.
    if (row.order_item_id) g._orderItemIds.add(row.order_item_id);
  }

  // Número do módulo "conforme listagem" (pedido do Matt, 21/09) — mesma
  // convenção do portal (js/portal-02-pedidos.js renderOrderDetailItemCard:
  // `idx+1`, 2 dígitos) sobre o MESMO array já ordenado por sort_order, só
  // que contado por pedido em vez de por índice de array (itemsRes.data
  // mistura itens de vários pedidos numa única query .in(...)).
  const moduleSeq = {};
  (itemsRes.data || []).forEach(function (item) {
    const order = orderById[item.order_id] || {};
    moduleSeq[item.order_id] = (moduleSeq[item.order_id] || 0) + 1;
    // 3 algarismos (pedido do Matt, 21/09, especificamente pra etiqueta
    // impressa — "deixa 3 algarismos"). Diverge de propósito do Detalhe
    // do Pedido no Portal, que usa 2 (js/portal-02-pedidos.js
    // renderOrderDetailItemCard) — são 2 públicos diferentes, o Portal não
    // muda aqui.
    const moduleNumber = String(moduleSeq[item.order_id]).padStart(3, '0');
    LOTES.flattenBreakdown(item.breakdown, item.quantity || 1).forEach(function (leaf) {
      if (leaf.origin === 'comprado') return; // ferragem não se corta
      /* Cor por papel (migration 035): selected_colors é o jsonb do pedido,
         casado pelo role_id da peça. */
      const sc = (item.selected_colors || []).find(function (x) { return x.role_id === leaf.color_role_id; });
      const color = sc && sc.color_id ? colorById[sc.color_id] : null;
      // comprimento no sentido do VEIO quando o material tem veio (ver
      // LOTES.cutDimsPeloVeio) — antes era sempre o lado longo
      const dims = LOTES.cutDimsPeloVeio(Object.assign({}, leaf, { grain_axis: grainAxisDoLeaf(leaf) }), !!(color && color.has_grain));
      if (!(dims.comprimento_mm > 0) || !(dims.largura_mm > 0)) return;
      add({
        order_id: item.order_id,
        source: 'order_item',
        client_name: order.client_name || null,
        module_name: item.module_name || '—',
        reference: leaf.reference,
        description: leaf.description,
        comprimento_mm: dims.comprimento_mm,
        largura_mm: dims.largura_mm,
        espessura_mm: dims.espessura_mm,
        quantity: leaf.quantity,
        color_id: color ? color.id : (sc ? sc.color_id : null),
        color_name: sc ? sc.color_name : null,
        // Antes disto era sempre 0 (hardcoded) — bug real, achado 21/09: a
        // etiqueta nunca conseguia mostrar "2 lados"/"4 lados" pra peça de
        // módulo, só o metro linear. `leaf.edge_banding` já vem clampado a
        // 0/1/2/4 em Pricing.calculateLeafPiece; aqui só falta descartar o 1
        // (Flatbord 1C sem pareamento não deveria existir, mas o CHECK de
        // erp.batch_pieces só aceita 0/2/4 — mesma regra do comentário da
        // migration 145 logo abaixo, sobre o pareamento forçar 2).
        edge_banding: (function () {
          const eb = (typeof leaf.edge_banding === 'number') ? leaf.edge_banding
            : (leaf.piece_id && typeof compEdge[leaf.piece_id] === 'number' ? compEdge[leaf.piece_id] : null);
          return (eb === 2 || eb === 4) ? eb : 0;
        })(),
        edge_band_m: (leaf.edge_band_m || 0) * leaf.quantity,
        /* Veio vem do MATERIAL (migration 083), não da peça. Pedido de módulo
           nunca teve esse dado por peça mesmo — a cor é a única fonte. */
        has_grain: !!(color && color.has_grain),
        // Pareamento de produção (migration 145) — mesma referência/dims/cor
        // dentro do MESMO pedido soma quantidade normal em `add()`; o
        // pareamento em si (virar N vendidos em ceil(N/pair_group_size)
        // peças físicas mais largas) só acontece DEPOIS, com o total já
        // fechado — ver o passo logo antes de `const rows = ...` abaixo.
        pair_group_size: leaf.pair_group_size || null,
        pair_physical_width_mm: leaf.pair_physical_width_mm || null,
        // Módulo/pedido (pedido do Matt, 21/09) — ver moduleSeq acima e
        // migration 157.
        module_number: moduleNumber,
        po_name: order.po_name || null,
        // Vínculo com o order_item de origem (migration 158) — o visor 3D
        // da peça (#/peca/:codigo) usa isto pra reconstruir o módulo.
        order_item_id: item.id
      });
    });
  });

  (cutRes.data || []).forEach(function (r) {
    const order = orderById[r.order_id] || {};
    const color = r.color_id ? colorById[r.color_id] : null;
    add({
      order_id: r.order_id,
      source: 'cutting_list',
      client_name: order.client_name || null,
      module_name: r.op || order.po_name || 'Plano de corte',
      reference: r.part_name || '—',
      description: r.obs || '—',   // a coluna é 'obs' (migration 051), não 'notes'
      comprimento_mm: Number(r.comprimento_mm) || 0,
      largura_mm: Number(r.largura_mm) || 0,
      espessura_mm: Number(r.espessura_mm) || 0,
      quantity: Math.max(1, Math.round(Number(r.quantity)) || 1),
      color_id: r.color_id || null,
      color_name: color ? color.name : null,
      edge_banding: Number(r.edge_banding) || 0,
      edge_band_m: 0,
      /* OR, não substituição: a cor decide o padrão (migration 083) e a peça
         só sabe ACRESCENTAR veio — pra travar a orientação de uma peça
         específica por desenho, mesmo num material liso. Peça nunca remove o
         veio de um material que tem. */
      has_grain: !!(color && color.has_grain) || !!r.has_grain,
      // Plano de corte não tem "módulo" (é planilha avulsa, r.op já vira
      // module_name acima) — só o número do pedido mesmo.
      module_number: null,
      po_name: order.po_name || null,
      // Sem order_item (migration 158) — plano de corte avulso não tem
      // módulo nenhum pra reabrir no visor 3D.
      order_item_id: null
    });
  });

  /* ============================================================
     Pareamento de produção (migration 145) — "Flatbord 1C" / Ripa
     ============================================================
     Matt, 27/08: a Ripa é vendida em metade de uma chapa (Flatbord 1C,
     38mm de largura de face) — mas se corta em pares: 1 chapa de 76mm de
     largura, fitada nos 2 comprimentos, DEPOIS partida ao meio. "se eu
     cobrar 2 pra todos, fica caro. se eu nao juntar no plano de corte vai
     dar problema [...] pra cada 2 vendidos ele gere uma peça com
     comprimento dele e 76mm de largura. 2c."
     
     O PREÇO que o cliente paga (sheet_cost/edge_cost em pricing.js) já é
     por unidade — metade da chapa + 1 fita — e este passo NÃO mexe nisso,
     só troca o que vai pro PLANO DE CORTE: agora que `g.quantity` já é o
     total vendido desta referência+medida+cor NESTE pedido (grouped por
     `add()` acima), quantas peças físicas produzir é
     ceil(quantidade_vendida / pair_group_size) — e cada uma sai na largura
     cheia (pair_physical_width_mm), fitada nos 2 comprimentos (a peça
     física é fitada INTEIRA antes de ser partida — cada metade fica com
     fita só de 1 lado, que é o que o preço por unidade já cobra).
     Ímpar sempre arredonda pra CIMA: vender 1 produz 1 chapa (2 metades,
     1 sobra física — o Matt lida com isso na bancada, o sistema não
     rastreia sobra de peça já cortada, só de chapa inteira). Vender 2
     produz exatamente 1 chapa, sem sobra.
     
     Só afeta linhas cujo componente tem `pair_group_size` configurado
     (migration 145) — a imensa maioria das peças não passa por aqui. */
  grouped.forEach(function (g) {
    if (!(g.pair_group_size > 1) || !(g.pair_physical_width_mm > 0)) return;
    const vendidos = g.quantity;
    const chapas = Math.ceil(vendidos / g.pair_group_size);
    g.description = (g.description && g.description !== '—' ? g.description + ' — ' : '')
      + 'peça física pareada (' + g.pair_group_size + '×) — ' + vendidos + ' vendido' + (vendidos === 1 ? '' : 's');
    g.quantity = chapas;
    g.largura_mm = g.pair_physical_width_mm;
    g.edge_banding = 2; // fitada nos 2 comprimentos ANTES de partir ao meio
    g.edge_band_m = 2 * (g.comprimento_mm / 1000) * chapas;
  });

  /* pair_group_size/pair_physical_width_mm só existem pra este passo de
     pareamento (chegam via flattenBreakdown/add acima) — erp.batch_pieces
     NÃO tem essas colunas (migration 145 só as criou em public.components;
     de propósito, ver cabeçalho da 145: "Nao mexi nos CHECKs de
     erp.batch_pieces"). Se sobrar essa chave no objeto (mesmo como null),
     o insert de erp.batch_pieces quebra com "Could not find the
     'pair_group_size' column of 'batch_pieces' in the schema cache" —
     bug real, achado 21/09 com o Matt testando o primeiro pedido de
     verdade (nenhuma peça carregava, sem nenhum erro visível na tela até
     ele clicar em "Recarregar peças"). Apagar as duas chaves aqui, DEPOIS
     de consumidas pelo pareamento acima, é o que faz o comentário da
     função (linha ~200: "Devolve o formato de erp.batch_pieces, sem
     batch_id") ser verdade de fato. */
  grouped.forEach(function (g) {
    delete g.pair_group_size;
    delete g.pair_physical_width_mm;
    // _moduleNumbers era só um Set de trabalho (ver add() acima) — vira o
    // texto final da coluna module_number ("01" sozinho, ou "01, 03" quando
    // 2 módulos idênticos do mesmo pedido se fundiram na mesma linha).
    g.module_number = (g._moduleNumbers && g._moduleNumbers.size)
      ? Array.from(g._moduleNumbers).sort().join(', ') : null;
    delete g._moduleNumbers;
    // order_item_ids (migration 158) — mesmo padrão do module_number logo
    // acima, só que vira array (não texto): #/peca/:codigo lê isto pra
    // saber qual(is) order_item(s) reconstruir no visor 3D.
    g.order_item_ids = (g._orderItemIds && g._orderItemIds.size) ? Array.from(g._orderItemIds) : [];
    delete g._orderItemIds;
    // order_item_id (singular, SEM S) só existe pra add() poder alimentar o
    // Set acima (ver leaf/cutlist add({...}), abaixo) — Object.assign(g,
    // row, ...) na criação do grupo copia TODAS as chaves de `row`, essa
    // incluída. erp.batch_pieces só tem a coluna order_item_ids (plural);
    // sem apagar a singular aqui, o insert quebra com "Could not find the
    // 'order_item_id' column of 'batch_pieces' in the schema cache" —
    // MESMO bug de pair_group_size logo acima (achado pelo Matt, 21/09,
    // testando esta função pela 2ª vez: "deu isso no f12 e nao puxou
    // nenhuma peca").
    delete g.order_item_id;
  });

  const rows = Array.from(grouped.values()).filter(function (r) {
    return r.comprimento_mm > 0 && r.largura_mm > 0 && r.espessura_mm > 0;
  });
  rows.sort(function (a, b) {
    return String(a.color_name || '').localeCompare(String(b.color_name || '')) ||
      (a.espessura_mm - b.espessura_mm) ||
      String(a.module_name).localeCompare(String(b.module_name)) ||
      String(a.reference).localeCompare(String(b.reference));
  });
  rows.forEach(function (r, i) { r.sort_order = i; });
  return rows;
};

/* ============================================================
   Lotes
   ============================================================ */
LOTES.batches = async function () {
  const { data, error } = await LOTES.erp()
    .from('batches')
    .select('*, batch_orders(order_id), batch_pieces(id, quantity), cut_plans(id, version, total_sheets, created_at)')
    .order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return data || [];
};

LOTES.batch = async function (id) {
  const erp = LOTES.erp();
  const [b, pieces, plans, orders] = await Promise.all([
    erp.from('batches').select('*').eq('id', id).maybeSingle(),
    erp.from('batch_pieces').select('*').eq('batch_id', id).order('sort_order'),
    erp.from('cut_plans').select('*').eq('batch_id', id).order('version', { ascending: false }),
    erp.from('batch_orders').select('order_id').eq('batch_id', id)
  ]);
  if (b.error) throw b.error;
  if (!b.data) return null;
  if (pieces.error) throw pieces.error;
  if (plans.error) throw plans.error;
  if (orders.error) throw orders.error;

  const batch = b.data;
  batch._pieces = pieces.data || [];
  batch._plans = plans.data || [];
  batch._orderIds = (orders.data || []).map(function (r) { return r.order_id; });

  /* Os pedidos vêm de public — leitura, nunca cópia. */
  if (batch._orderIds.length) {
    const { data: ords } = await DATA.sb()
      .from('orders').select('*')   // mesmo motivo de availableOrders: coluna pendente derruba a consulta toda
      .in('id', batch._orderIds);
    batch._orders = ords || [];
  } else {
    batch._orders = [];
  }
  return batch;
};

/* Cria o lote E congela as peças dos pedidos escolhidos. É uma operação só do
   ponto de vista do usuário, mas são 3 inserts — se o de peças falhar, o lote
   fica vazio (dá pra recarregar as peças pela tela do lote). Sem transação
   porque PostgREST não expõe uma; o preço disso é esse. */
LOTES.createBatch = async function (opts) {
  const erp = LOTES.erp();
  const user = DATA.user;
  const { data: batch, error } = await erp.from('batches').insert({
    name: opts.name || null,
    target_date: opts.target_date || null,
    notes: opts.notes || null,
    params_id: opts.params_id || null,
    created_by: user ? user.id : null
  }).select().maybeSingle();
  if (error) throw error;

  if (opts.orderIds && opts.orderIds.length) {
    const { error: e1 } = await erp.from('batch_orders').insert(
      opts.orderIds.map(function (oid) { return { batch_id: batch.id, order_id: oid }; }));
    if (e1) throw e1;
    await LOTES.reloadPieces(batch.id, opts.orderIds);
  }
  return batch;
};

/* Refaz o snapshot de peças a partir dos pedidos do lote.
   Só é permitido enquanto o lote não tem plano SALVO — depois disso mexer nas
   peças faria o plano do chão de fábrica não bater com a lista. */
LOTES.reloadPieces = async function (batchId, orderIds) {
  const erp = LOTES.erp();
  if (!orderIds) {
    const { data } = await erp.from('batch_orders').select('order_id').eq('batch_id', batchId);
    orderIds = (data || []).map(function (r) { return r.order_id; });
  }
  const rows = await LOTES.explodeOrders(orderIds);
  const { error: eDel } = await erp.from('batch_pieces').delete().eq('batch_id', batchId).neq('source', 'manual');
  if (eDel) throw eDel;
  if (!rows.length) return [];
  const payload = rows.map(function (r) { return Object.assign({ batch_id: batchId }, r); });
  const { data, error } = await erp.from('batch_pieces').insert(payload).select();
  if (error) throw error;
  return data || [];
};

LOTES.updateBatch = async function (id, patch) {
  const { error } = await LOTES.erp().from('batches')
    .update(Object.assign({}, patch, { updated_at: new Date().toISOString() })).eq('id', id);
  if (error) throw error;
};

LOTES.deleteBatch = async function (id) {
  const { error } = await LOTES.erp().from('batches').delete().eq('id', id);
  if (error) throw error;
};

LOTES.addPiece = async function (batchId, row) {
  const { data, error } = await LOTES.erp().from('batch_pieces')
    .insert(Object.assign({ batch_id: batchId, source: 'manual' }, row)).select().maybeSingle();
  if (error) throw error;
  return data;
};

LOTES.deletePiece = async function (id) {
  const { error } = await LOTES.erp().from('batch_pieces').delete().eq('id', id);
  if (error) throw error;
};

/* Pedidos que a fábrica pode lotear: SÓ os liberados pelo financeiro
   (finance_released_at, migration 082). Regra do Matt — "aqui só pedido
   liberado pelo financeiro". Pedido implantado mas não liberado não aparece:
   se aparecesse, alguém cortaria chapa de um pedido que o financeiro ainda
   está segurando, e chapa cortada não volta atrás.

   Marca também quais já estão em outro lote, pra não cortar duas vezes. */
LOTES.availableOrders = async function () {
  /* select('*') de propósito, mesma razão de DATA.modules em data.js: pedir
     coluna por coluna quebra a consulta INTEIRA se UMA delas ainda não existe
     neste banco ("column orders.cached_value_usd does not exist" derrubou a
     tela por causa de um dado que nem era usado). Como as migrations são
     rodadas à mão e podem estar em pé diferente em cada ambiente, o ERP lê
     tudo e trata campo ausente como undefined. */
  const { data, error } = await DATA.sb()
    .from('orders')
    .select('*')
    .not('finance_released_at', 'is', null)
    .order('finance_released_at', { ascending: false }).limit(200);
  if (error) throw error;
  const { data: taken } = await LOTES.erp().from('batch_orders').select('order_id, batch_id');
  const takenBy = {};
  (taken || []).forEach(function (t) { takenBy[t.order_id] = t.batch_id; });
  (data || []).forEach(function (o) { o._batch_id = takenBy[o.id] || null; });
  return data || [];
};

/* ============================================================
   Agrupamento das peças pro nesting
   ============================================================
   Uma chapa é sempre de UM material: mesma cor E mesma espessura. Peça sem
   cor definida fica num grupo à parte, sinalizado — não some da tela, porque
   sumir calado é pior que aparecer com problema. */
LOTES.groupPieces = function (pieces, colors) {
  const colorById = {};
  (colors || []).forEach(function (c) { colorById[c.id] = c; });
  const map = new Map();
  (pieces || []).forEach(function (p) {
    const key = (p.color_id || 'sem-cor') + '|' + Number(p.espessura_mm);
    if (!map.has(key)) {
      map.set(key, {
        key: key,
        color_id: p.color_id || null,
        color: p.color_id ? (colorById[p.color_id] || null) : null,
        color_name: p.color_name || (colorById[p.color_id] && colorById[p.color_id].name) || 'Sem cor definida',
        espessura_mm: Number(p.espessura_mm),
        rows: [], qty: 0, area_m2: 0, edge_m: 0
      });
    }
    const g = map.get(key);
    g.rows.push(p);
    g.qty += p.quantity;
    g.area_m2 += (p.comprimento_mm / 1000) * (p.largura_mm / 1000) * p.quantity;
    /* Fita: quem veio da planilha fala em lados, quem veio de módulo já vem em
       metro calculado. Os dois somam no mesmo total. */
    if (p.edge_banding === 4) g.edge_m += 2 * ((p.comprimento_mm + p.largura_mm) / 1000) * p.quantity;
    // 2C = os dois lados LONGOS (comprimento pode ser o lado curto quando o
    // veio manda, ver cutDimsPeloVeio — a fita continua no lado longo)
    else if (p.edge_banding === 2) g.edge_m += 2 * (Math.max(p.comprimento_mm, p.largura_mm) / 1000) * p.quantity;
    g.edge_m += Number(p.edge_band_m) || 0;
  });
  return Array.from(map.values()).sort(function (a, b) {
    return String(a.color_name).localeCompare(String(b.color_name)) || a.espessura_mm - b.espessura_mm;
  });
};

/* Explode a linha (quantidade N) em N unidades físicas pro nesting. */
/* Regra EXATA, pedido do Matt (21/09-12): só filler de 2700 x 76 mm, em
   qualquer cor. 2699 de comprimento ou qualquer largura diferente de 76
   NÃO entra — refila normal. Tolerância de 0,05mm é só ruído de float
   (2700.0000001), não "quase 2700". */
LOTES.FULL_LENGTH_RULE = { reference: /filler/i, comprimento_mm: 2700, largura_mm: 76 };
LOTES.isFullLengthPiece = function (row) {
  const R = LOTES.FULL_LENGTH_RULE;
  return R.reference.test(String(row.reference || '')) &&
    Math.abs(Number(row.comprimento_mm) - R.comprimento_mm) < 0.05 &&
    Math.abs(Number(row.largura_mm) - R.largura_mm) < 0.05;
};

LOTES.expandForNesting = function (rows) {
  const out = [];
  (rows || []).forEach(function (r) {
    /* Linha de lote ANTIGA que fundiu módulos idênticos ("047, 048, 051",
       quantidade somada — antes de 21/09-10 explodeOrders fazia isso): cada
       peça física tem que pertencer a UM módulo só (pedido do Matt,
       22/09-10). Distribui as unidades entre os módulos da linha, na ordem,
       igualmente (módulos idênticos têm a mesma quantidade da peça); se não
       dividir exato, os primeiros levam a sobra. Lote novo já vem com uma
       linha por módulo e não passa por aqui. */
    const mods = String(r.module_number || '').split(', ').filter(Boolean);
    const itemIds = Array.isArray(r.order_item_ids) ? r.order_item_ids : [];
    const split = mods.length > 1;
    for (let i = 0; i < r.quantity; i++) {
      let meta = r;
      if (split) {
        const k = Math.floor(i * mods.length / r.quantity); // 0..mods.length-1, blocos iguais
        meta = Object.assign({}, r, {
          module_number: mods[k],
          order_item_ids: itemIds.length === mods.length ? [itemIds[k]] : itemIds
        });
      }
      out.push({
        key: r.id + '#' + i,
        batch_piece_id: r.id,
        w: Number(r.comprimento_mm),
        h: Number(r.largura_mm),
        grain: !!r.has_grain,
        label: r.reference || r.module_name || '—',
        // Pode sair no comprimento inteiro da chapa, sem refilar os topos
        // (pedido do Matt, 21/09-12, pro filler de 2700x76) — ver
        // NESTING._packBin. Hoje a regra é pelo nome; se precisar de mais
        // peça nesse regime, vira uma marcação no cadastro do componente.
        full_length_ok: LOTES.isFullLengthPiece(r),
        meta: meta
      });
    }
  });
  return out;
};

/* ============================================================
   Retalhos
   ============================================================ */
LOTES.offcuts = async function (filter) {
  filter = filter || {};
  let q = LOTES.erp().from('offcuts').select('*').order('created_at', { ascending: false }).limit(500);
  if (filter.status) q = q.eq('status', filter.status);
  if (filter.color_id) q = q.eq('color_id', filter.color_id);
  if (filter.espessura_mm) q = q.eq('espessura_mm', filter.espessura_mm);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
};

/* Retalhos que servem pra este grupo, já na ordem que o parâmetro pede.
   'menor_primeiro' é o default e o mais sensato: gasta a sobra pequena antes
   de picar uma grande, senão o estoque vira um monte de pedaço inútil. */
LOTES.availableOffcutsFor = async function (colorId, espessuraMm, priority) {
  if (!colorId) return [];
  const { data, error } = await LOTES.erp().from('offcuts')
    .select('*').eq('status', 'disponivel').eq('color_id', colorId).eq('espessura_mm', espessuraMm);
  if (error) throw error;
  const list = data || [];
  list.sort(function (a, b) {
    if (priority === 'maior_primeiro') return (b.width_mm * b.height_mm) - (a.width_mm * a.height_mm);
    if (priority === 'mais_antigo') return new Date(a.created_at) - new Date(b.created_at);
    return (a.width_mm * a.height_mm) - (b.width_mm * b.height_mm);
  });
  return list;
};

LOTES.saveOffcut = async function (row) {
  const erp = LOTES.erp();
  const payload = Object.assign({}, row, { updated_at: new Date().toISOString() });
  if (payload.id) {
    const { error } = await erp.from('offcuts').update(payload).eq('id', payload.id);
    if (error) throw error;
    return;
  }
  delete payload.id;
  const { error } = await erp.from('offcuts').insert(payload);
  if (error) throw error;
};

LOTES.setOffcutStatus = async function (id, status) {
  const { error } = await LOTES.erp().from('offcuts')
    .update({ status: status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
};

/* ============================================================
   Materiais: tamanho de chapa, estoque de chapa e fita (migration 083)
   ============================================================
   cutting_list_sheet_sizes vive em public (migration 063) porque o portal
   também usa. O ERP escreve nela — a policy "admin write sheet sizes" já
   existe desde a 063, não precisou de nada novo. */
LOTES.saveSheetSize = async function (row) {
  const sb = DATA.sb();
  const payload = {
    name: row.name, width_mm: row.width_mm, height_mm: row.height_mm,
    kerf_mm: row.kerf_mm, active: row.active !== false, sort_order: row.sort_order || 0
  };
  if (row.id) {
    const { error } = await sb.from('cutting_list_sheet_sizes').update(payload).eq('id', row.id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('cutting_list_sheet_sizes').insert(payload);
    if (error) throw error;
  }
  delete DATA._cache.erp_sheet_sizes;
};

/* A cor guarda o veio (083) e a chapa padrão (063) — as duas coisas que o
   nesting pergunta ao material. Escrita em colors: policy de admin já existe
   no schema.sql. */
LOTES.saveColorMaterial = async function (colorId, patch) {
  const { error } = await DATA.sb().from('colors').update(patch).eq('id', colorId);
  if (error) throw error;
  delete DATA._cache.erp_colors;
};

LOTES.sheetStock = async function () {
  const { data, error } = await LOTES.erp().from('sheet_stock').select('*');
  if (error) throw error;
  return data || [];
};

LOTES.saveSheetStock = async function (row) {
  const erp = LOTES.erp();
  /* upsert pela chave natural (cor + tamanho): a tela edita "quantas chapas
     brancas 5x9 eu tenho", não uma linha com id que o usuário conhece. */
  const { data, error } = await erp.from('sheet_stock').upsert({
    id: row.id || undefined,
    color_id: row.color_id,
    sheet_size_id: row.sheet_size_id,
    quantity: Math.round(Number(row.quantity) || 0),
    min_quantity: Math.round(Number(row.min_quantity) || 0),
    location: row.location || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'color_id,sheet_size_id' }).select().maybeSingle();
  if (error) throw error;
  return data;
};

LOTES.edgeTapes = async function () {
  const { data, error } = await LOTES.erp().from('edge_tapes').select('*').eq('active', true).order('width_mm');
  if (error) throw error;
  return data || [];
};

LOTES.saveEdgeTape = async function (row) {
  const erp = LOTES.erp();
  if (row.is_default && row.color_id) {
    /* Um padrão por cor. O índice único no banco erraria em vez de trocar;
       desmarcar antes faz a tela se comportar como o usuário espera. */
    const q = erp.from('edge_tapes').update({ is_default: false }).eq('color_id', row.color_id).eq('is_default', true);
    if (row.id) q.neq('id', row.id);
    const { error: e0 } = await q;
    if (e0) throw e0;
  }
  const payload = Object.assign({}, row, { updated_at: new Date().toISOString() });
  if (payload.id) {
    const { error } = await erp.from('edge_tapes').update(payload).eq('id', payload.id);
    if (error) throw error;
  } else {
    delete payload.id;
    const { error } = await erp.from('edge_tapes').insert(payload);
    if (error) throw error;
  }
};

LOTES.deleteEdgeTape = async function (id) {
  const { error } = await LOTES.erp().from('edge_tapes').update({ active: false }).eq('id', id);
  if (error) throw error;
};

/* Movimentação = extrato. Toda mudança de saldo passa por aqui, senão o
   estoque vira número que muda sozinho. */
LOTES.addStockMove = async function (move) {
  const { error } = await LOTES.erp().from('stock_moves').insert(
    Object.assign({ created_by: DATA.user ? DATA.user.id : null }, move));
  if (error) throw error;
};

LOTES.stockMoves = async function (limit) {
  const { data, error } = await LOTES.erp().from('stock_moves')
    .select('*').order('created_at', { ascending: false }).limit(limit || 60);
  if (error) throw error;
  return data || [];
};

/* Ajuste manual com extrato junto — usado pela entrada de chapa e de fita.
   delta positivo entra, negativo sai. */
LOTES.adjustSheetStock = async function (stockRow, delta, reason, note) {
  const novo = Math.round((Number(stockRow.quantity) || 0) + delta);
  const { error } = await LOTES.erp().from('sheet_stock')
    .update({ quantity: novo, updated_at: new Date().toISOString() }).eq('id', stockRow.id);
  if (error) throw error;
  await LOTES.addStockMove({
    kind: 'chapa', sheet_stock_id: stockRow.id, color_id: stockRow.color_id,
    quantity: delta, reason: reason || 'ajuste', note: note || null
  });
};

LOTES.adjustEdgeTape = async function (tape, deltaM, reason, note) {
  const novo = Math.round(((Number(tape.stock_m) || 0) + deltaM) * 100) / 100;
  const { error } = await LOTES.erp().from('edge_tapes')
    .update({ stock_m: novo, updated_at: new Date().toISOString() }).eq('id', tape.id);
  if (error) throw error;
  await LOTES.addStockMove({
    kind: 'fita', edge_tape_id: tape.id, color_id: tape.color_id,
    quantity: deltaM, reason: reason || 'ajuste', note: note || null
  });
};

/* ============================================================
   Salvar o plano
   ============================================================
   O que "salvar" faz, em ordem:
     1. cria a VERSÃO nova (nunca sobrescreve — é isso o histórico)
     2. grava as chapas e as peças posicionadas (cada peça ganha código, que é
        o que vai na etiqueta)
     3. DÁ BAIXA nos retalhos usados (status 'consumido')
     4. cadastra as sobras novas como retalho disponível
   Os passos 3 e 4 são o pedido "dar baixa nos retalhos" — e é aqui, no salvar,
   não na geração: gerar plano é rascunho, dá pra gerar dez e descartar nove
   sem mexer no estoque.
*/
LOTES.savePlan = async function (opts) {
  const erp = LOTES.erp();
  const batchId = opts.batchId;
  const groups = opts.groups;        // [{ group, result, sheetSize }]
  const params = opts.params;

  const { data: last } = await erp.from('cut_plans')
    .select('version').eq('batch_id', batchId).order('version', { ascending: false }).limit(1);
  const version = ((last && last[0] && last[0].version) || 0) + 1;

  let totalSheets = 0, totalOffcutsUsed = 0, totalPieces = 0, usedArea = 0, totalArea = 0, edgeM = 0;
  groups.forEach(function (g) {
    totalSheets += g.result.summary.sheets_new;
    totalOffcutsUsed += g.result.summary.offcuts_used;
    totalPieces += g.result.summary.pieces_placed;
    usedArea += g.result.summary.used_area_mm2;
    totalArea += g.result.summary.total_area_mm2;
    edgeM += g.group.edge_m || 0;
  });

  const { data: plan, error: ePlan } = await erp.from('cut_plans').insert({
    batch_id: batchId,
    version: version,
    code: (opts.batchCode || 'LT') + '-P' + version,
    params_id: params.id || null,
    params_snapshot: params,
    total_pieces: totalPieces,
    total_sheets: totalSheets,
    total_offcuts_used: totalOffcutsUsed,
    total_edge_m: Math.round(edgeM * 100) / 100,
    used_area_mm2: Math.round(usedArea),
    waste_pct: totalArea > 0 ? Math.round((1 - usedArea / totalArea) * 10000) / 100 : 0,
    notes: opts.notes || null,
    created_by: DATA.user ? DATA.user.id : null
  }).select().maybeSingle();
  if (ePlan) throw ePlan;

  let index = 0;
  const consumedOffcutIds = [];
  const newOffcuts = [];

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    for (let si = 0; si < g.result.sheets.length; si++) {
      const sh = g.result.sheets[si];
      index += 1;
      const { data: sheetRow, error: eSheet } = await erp.from('cut_plan_sheets').insert({
        plan_id: plan.id,
        index_no: index,
        source: sh.source,
        offcut_id: sh.offcut ? sh.offcut.id : null,
        sheet_size_id: sh.sheet_size_id,
        sheet_size_name: sh.sheet_size_name,
        color_id: g.group.color_id,
        color_name: g.group.color_name,
        espessura_mm: g.group.espessura_mm,
        width_mm: sh.width,
        height_mm: sh.height,
        used_pct: Math.round(sh.usedPct * 10000) / 100,
        offcuts_json: sh.offcuts
      }).select().maybeSingle();
      if (eSheet) throw eSheet;

      if (sh.offcut) consumedOffcutIds.push(sh.offcut.id);

      const piecesPayload = sh.placed.map(function (p) {
        const m = p.piece.meta || {};
        return {
          plan_id: plan.id,
          sheet_id: sheetRow.id,
          batch_piece_id: m.id || null,
          x_mm: Math.round(p.x * 10) / 10,
          y_mm: Math.round(p.y * 10) / 10,
          w_mm: Math.round(p.w * 10) / 10,
          h_mm: Math.round(p.h * 10) / 10,
          rotated: !!p.rotated,
          label: p.piece.label,
          client_name: m.client_name || null,
          module_name: m.module_name || null,
          reference: m.reference || null,
          color_name: g.group.color_name,
          espessura_mm: g.group.espessura_mm,
          edge_banding: m.edge_banding || 0,
          edge_band_m: m.quantity ? (Number(m.edge_band_m) || 0) / m.quantity : 0,
          has_grain: !!m.has_grain,
          // Módulo (01/02/...) e pedido (po_name) — pedido do Matt (21/09)
          // pra aparecer na etiqueta impressa. Cópia de erp.batch_pieces,
          // mesmo motivo do resto desta lista: "sem join nenhum" na hora de
          // imprimir (ver comentário da tabela na migration 081/157).
          module_number: m.module_number || null,
          po_name: m.po_name || null,
          // Vínculo com o(s) order_item(s) de origem (migration 158) — o
          // visor 3D da peça (#/peca/:codigo) lê isto pra reabrir o módulo.
          order_item_ids: m.order_item_ids || []
        };
      });
      if (piecesPayload.length) {
        const { error: ePieces } = await erp.from('cut_plan_pieces').insert(piecesPayload);
        if (ePieces) throw ePieces;
      }

      sh.offcuts.forEach(function (r) {
        // Medida física (sem a serra) — é o que o operador mede no retalho e
        // o que a etiqueta OC mostra (NESTING.offcutCleanSize).
        const clean = NESTING.offcutCleanSize(sh, r, params || {});
        newOffcuts.push({
          color_id: g.group.color_id,
          color_name: g.group.color_name,
          espessura_mm: g.group.espessura_mm,
          width_mm: Math.round(clean.w * 10) / 10,
          height_mm: Math.round(clean.h * 10) / 10,
          status: 'disponivel',
          origin_plan_id: plan.id,
          origin_sheet_id: sheetRow.id,
          notes: 'Sobra da chapa ' + index + ' do plano ' + plan.code
        });
      });
    }
  }

  /* Baixa dos retalhos usados */
  if (consumedOffcutIds.length) {
    const { error: eCons } = await erp.from('offcuts').update({
      status: 'consumido',
      consumed_by_plan_id: plan.id,
      consumed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).in('id', consumedOffcutIds);
    if (eCons) throw eCons;
  }

  /* Entrada das sobras novas */
  if (newOffcuts.length) {
    const { error: eNew } = await erp.from('offcuts').insert(newOffcuts);
    if (eNew) throw eNew;
  }

  /* ---- Baixa de chapa nova e de fita (migration 083) ----
     Depois de tudo o mais dar certo, de propósito: se o estoque não estiver
     cadastrado, o plano continua salvo e a tela avisa o que não deu pra
     baixar. Estoque incompleto não pode impedir de planejar o corte — seria
     inverter a prioridade entre o que é essencial (o plano) e o que é
     controle (o saldo). */
  const estoqueAvisos = [];
  const stockAll = await LOTES.sheetStock().catch(function () { return []; });
  const tapesAll = await LOTES.edgeTapes().catch(function () { return []; });

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const novas = g.result.summary.sheets_new;
    const sizeId = g.sheetSize ? g.sheetSize.id : null;

    if (novas > 0 && sizeId) {
      const linha = stockAll.find(function (s) { return s.color_id === g.group.color_id && s.sheet_size_id === sizeId; });
      if (!linha) {
        estoqueAvisos.push(novas + ' chapa(s) de ' + g.group.color_name + ' não foram baixadas: ' +
          'essa combinação de cor e tamanho não tem estoque cadastrado em Materiais.');
      } else {
        const restante = linha.quantity - novas;
        await erp.from('sheet_stock').update({ quantity: restante, updated_at: new Date().toISOString() }).eq('id', linha.id);
        await LOTES.addStockMove({
          kind: 'chapa', sheet_stock_id: linha.id, color_id: g.group.color_id,
          quantity: -novas, reason: 'plano', plan_id: plan.id,
          note: 'Plano ' + plan.code
        });
        linha.quantity = restante;
        if (restante < 0) {
          estoqueAvisos.push('Estoque de ' + g.group.color_name + ' ficou NEGATIVO (' + restante + '). ' +
            'O cadastro dizia menos chapa do que o plano consumiu — confira o inventário.');
        } else if (restante <= linha.min_quantity) {
          estoqueAvisos.push('Chapa ' + g.group.color_name + ': restam ' + restante + ' (mínimo ' + linha.min_quantity + ').');
        }
      }
    }

    const metros = Math.round((g.group.edge_m || 0) * 100) / 100;
    if (metros > 0) {
      const daCor = tapesAll.filter(function (t) { return t.color_id === g.group.color_id; });
      const fita = daCor.find(function (t) { return t.is_default; }) || daCor[0];
      if (!fita) {
        estoqueAvisos.push(metros.toFixed(1).replace('.', ',') + ' m de fita de ' + g.group.color_name +
          ' não foram baixados: essa cor não tem fita cadastrada em Materiais.');
      } else {
        const restante = Math.round((Number(fita.stock_m) - metros) * 100) / 100;
        await erp.from('edge_tapes').update({ stock_m: restante, updated_at: new Date().toISOString() }).eq('id', fita.id);
        await LOTES.addStockMove({
          kind: 'fita', edge_tape_id: fita.id, color_id: g.group.color_id,
          quantity: -metros, reason: 'plano', plan_id: plan.id,
          note: 'Plano ' + plan.code
        });
        fita.stock_m = restante;
        if (restante < 0) {
          estoqueAvisos.push('Fita de ' + g.group.color_name + ' ficou NEGATIVA (' +
            restante.toFixed(1).replace('.', ',') + ' m) — falta fita pra colar este lote.');
        } else if (restante <= Number(fita.min_stock_m)) {
          estoqueAvisos.push('Fita de ' + g.group.color_name + ': restam ' +
            restante.toFixed(1).replace('.', ',') + ' m (mínimo ' + Number(fita.min_stock_m).toFixed(1).replace('.', ',') + ' m).');
        }
      }
    }
  }

  return {
    plan: plan,
    consumed: consumedOffcutIds.length,
    generated: newOffcuts.length,
    estoqueAvisos: estoqueAvisos
  };
};

/* Uma peça de plano de corte já salva, pelo código de barras impresso na
   etiqueta (PC-000930...). Usado pelo visor 3D da peça (#/peca/:codigo,
   erp/js/screens-peca3d.js) — aberto ao clicar numa peça no nesting, ou
   digitando/escaneando o código direto (pensado pra ser reaproveitado na
   bancada de montagem: mesma tela, mesmo código de barras que já sai
   impresso, ver migration 158). */
LOTES.pieceByCode = async function (code) {
  const erp = LOTES.erp();
  const { data, error } = await erp.from('cut_plan_pieces').select('*').eq('piece_code', code).maybeSingle();
  if (error) throw error;
  return data || null;
};

LOTES.plan = async function (planId) {
  const erp = LOTES.erp();
  const [p, sheets, pieces] = await Promise.all([
    erp.from('cut_plans').select('*').eq('id', planId).maybeSingle(),
    erp.from('cut_plan_sheets').select('*').eq('plan_id', planId).order('index_no'),
    erp.from('cut_plan_pieces').select('*').eq('plan_id', planId)
  ]);
  if (p.error) throw p.error;
  if (!p.data) return null;
  if (sheets.error) throw sheets.error;
  if (pieces.error) throw pieces.error;

  const plan = p.data;
  plan._sheets = sheets.data || [];
  plan._pieces = pieces.data || [];
  const bySheet = {};
  plan._pieces.forEach(function (pc) { (bySheet[pc.sheet_id] = bySheet[pc.sheet_id] || []).push(pc); });
  plan._sheets.forEach(function (s) { s._pieces = bySheet[s.id] || []; });

  const { data: batch } = await erp.from('batches').select('*').eq('id', plan.batch_id).maybeSingle();
  plan._batch = batch || null;
  return plan;
};

/* Pilhas num plano SALVO (empilhamento, ver NESTING._solveStacked): chapas
   consecutivas do mesmo material com a mesma geometria. Devolve
   { byId: { sheetId: { leaderId, members, pos } }, groups: [[sheetIds]] }. */
LOTES.planStacks = function (plan) {
  const sheets = (plan._sheets || []).slice().sort(function (a, b) { return a.index_no - b.index_no; });
  return NESTING.detectStacks(sheets, function (s) {
    return NESTING.sheetSignature(s.width_mm, s.height_mm, (s.color_name || '') + '|' + s.espessura_mm + '|' + s.source,
      (s._pieces || []).map(function (p) { return { x: p.x_mm, y: p.y_mm, w: p.w_mm, h: p.h_mm }; }), s.offcuts_json || []);
  }, function (s) { return s.id; });
};

/* Ordem de SAÍDA das peças na máquina — a ordem da etiqueta impressa e da
   numeração da pasta pra máquina: chapa 1 do começo ao fim, depois chapa 2.
   Com pilha, as duas chapas saem juntas: posição 1 da de cima, posição 1 da
   de baixo, posição 2 da de cima... (pedido do Matt, 21/09-13: "a etiqueta
   sai uma de cada pra cada peça cortada empilhada"). */
/* Número da chapa COMO A MÁQUINA MOSTRA. O plano numera as chapas de 1 ao
   fim (index_no, todos os materiais juntos), mas a máquina recebe um XML
   por material e numera os painéis 1, 2, 3… dentro de cada arquivo — a
   chapa 27 do plano é o painel 03 do Vicenza. Pedido do Matt (22/09-18):
   "a numeração do ERP sobre as chapas está diferente da numeração de corte
   da máquina… tem como alinhar?". Aqui: ordinal dentro do material (mesmo
   agrupamento de MAQUINA_EXPORT._agruparPorMaterial: cor + espessura, na
   ordem de index_no). Vale pra tela do plano, etiqueta e PDFs; index_no
   continua sendo a ordem geral do plano (e a ordem das etiquetas). */
LOTES.sheetMachineNo = function (plan) {
  const out = {};
  const count = {};
  const sheets = (plan._sheets || []).slice().sort(function (a, b) { return a.index_no - b.index_no; });
  sheets.forEach(function (s) {
    const k = (s.color_name || '—') + '|' + s.espessura_mm;
    count[k] = (count[k] || 0) + 1;
    out[s.id] = { n: count[k], key: k, material: s.color_name || 'material' };
  });
  Object.keys(out).forEach(function (id) { out[id].total = count[out[id].key]; });
  return out;
};

LOTES.piecesInOutputOrder = function (plan) {
  const sheetById = {};
  (plan._sheets || []).forEach(function (s) { sheetById[s.id] = s; });
  const stacks = LOTES.planStacks(plan);
  const leaderIndex = function (s) {
    const st = stacks.byId[s.id];
    return st ? sheetById[st.leaderId].index_no : s.index_no;
  };
  /* Posição DENTRO da chapa: a ordem real em que a máquina solta as peças
     (última faixa primeiro — MAQUINA_EXPORT.ordemNaChapa, a mesma árvore do
     XML). Sem o exportador carregado, ou se a árvore não fechar, cai na
     ordem simples de cima pra baixo. */
  const posInSheet = {};
  (plan._sheets || []).forEach(function (s) {
    let ordem = null;
    if (typeof MAQUINA_EXPORT !== 'undefined' && MAQUINA_EXPORT.ordemNaChapa) ordem = MAQUINA_EXPORT.ordemNaChapa(s, plan.params_snapshot);
    if (!ordem) ordem = (s._pieces || []).slice().sort(function (a, b) { return (a.y_mm - b.y_mm) || (a.x_mm - b.x_mm); });
    ordem.forEach(function (p, i) { posInSheet[p.id] = i; });
  });
  return (plan._pieces || []).slice().sort(function (a, b) {
    const sa = sheetById[a.sheet_id], sb = sheetById[b.sheet_id];
    if (!sa || !sb) return 0;
    return (leaderIndex(sa) - leaderIndex(sb)) || ((posInSheet[a.id] || 0) - (posInSheet[b.id] || 0)) || (sa.index_no - sb.index_no);
  });
};

LOTES.setPlanStatus = async function (planId, status) {
  const { error } = await LOTES.erp().from('cut_plans').update({ status: status }).eq('id', planId);
  if (error) throw error;
};

/* Apagar um plano devolve o mundo ao que era: retalho consumido volta pra
   'disponivel', sobra que ele gerou some. Sem isso o estoque mentiria depois
   de um plano gerado por engano. */
LOTES.deletePlan = async function (planId) {
  const erp = LOTES.erp();

  /* Estorno de chapa e fita ANTES de apagar o plano: as linhas de movimento
     apontam pra ele (plan_id) e o delete as levaria junto. O extrato é a
     única fonte de "quanto este plano consumiu" — sem ele, o estorno viraria
     recálculo, e recálculo sobre dado que já mudou erra. */
  const { data: moves } = await erp.from('stock_moves').select('*').eq('plan_id', planId).eq('reason', 'plano');
  for (let i = 0; i < (moves || []).length; i++) {
    const m = moves[i];
    if (m.kind === 'chapa' && m.sheet_stock_id) {
      const { data: linha } = await erp.from('sheet_stock').select('*').eq('id', m.sheet_stock_id).maybeSingle();
      if (linha) {
        await erp.from('sheet_stock').update({
          quantity: linha.quantity - m.quantity,   // m.quantity é negativo: subtrair devolve
          updated_at: new Date().toISOString()
        }).eq('id', linha.id);
      }
    } else if (m.kind === 'fita' && m.edge_tape_id) {
      const { data: fita } = await erp.from('edge_tapes').select('*').eq('id', m.edge_tape_id).maybeSingle();
      if (fita) {
        await erp.from('edge_tapes').update({
          stock_m: Math.round((Number(fita.stock_m) - Number(m.quantity)) * 100) / 100,
          updated_at: new Date().toISOString()
        }).eq('id', fita.id);
      }
    }
    await LOTES.addStockMove({
      kind: m.kind, sheet_stock_id: m.sheet_stock_id, edge_tape_id: m.edge_tape_id,
      color_id: m.color_id, quantity: -m.quantity, reason: 'estorno_plano',
      note: 'Estorno do plano apagado'
    });
  }

  const { error: e1 } = await erp.from('offcuts').delete().eq('origin_plan_id', planId);
  if (e1) throw e1;
  const { error: e2 } = await erp.from('offcuts').update({
    status: 'disponivel', consumed_by_plan_id: null, consumed_at: null
  }).eq('consumed_by_plan_id', planId);
  if (e2) throw e2;
  const { error: e3 } = await erp.from('cut_plans').delete().eq('id', planId);
  if (e3) throw e3;
};

/* ============================================================
   Todos os planos, de todos os lotes (a aba "Plano de Corte")
   ============================================================ */
LOTES.allPlans = async function () {
  const erp = LOTES.erp();
  const { data, error } = await erp.from('cut_plans')
    .select('*, batches(id, code, name, status)')
    .order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return data || [];
};
