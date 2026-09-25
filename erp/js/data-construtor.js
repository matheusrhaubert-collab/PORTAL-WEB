/* Legno ERP — camada de dados do CONSTRUTOR DE MÓDULOS (migration 085).
 *
 * Ler docs/criador-de-modulos-spec.md. O motor é js/layout-engine.js e o
 * protótipo navegável (offline) é teste-construtor-modulo.html.
 *
 * ESTE ARQUIVO SÓ FALA COM O BANCO. Nada de DOM, nada de SVG, nada de
 * Three.js — isso é screens-construtor.js. A separação existe porque o motor
 * (LayoutEngine) é puro e a tela é grande: misturar os três num arquivo só
 * seria o mesmo erro que o cadastro peça-a-peça que estamos substituindo.
 *
 * TRÊS TABELAS, TRÊS ASSUNTOS (todas da migration 085):
 *   accessory_types          catálogo GLOBAL — o que existe no mundo
 *   module_accessory_options whitelist POR MÓDULO — o que ESTE módulo aceita
 *   module_layout_nodes      a árvore de FÁBRICA — como ESTE módulo nasce
 *
 * A whitelist é o que faz este ERP virar "base de biblioteca pro portal": o
 * módulo padrão é sempre o mesmo, o que muda de um produto pro outro é o que
 * ele pode receber e o que já vem montado.
 */

const CONSTR = {};

/* ============================================================
   Erros — dizer a coisa certa em vez de despejar o texto do Postgres
   ============================================================
   O erro mais provável na primeira abertura é a migration 085 não ter
   rodado. Mas CUIDADO com o palpite fácil: a lição do LOTES.explainError
   (que já marcou qualquer "does not exist" como "falta rodar a 081" e
   escondeu um erro que era outro) vale aqui igual. Cada ramo exige
   evidência do nome da tabela/coluna, e o texto cru do banco vai sempre no
   fim. */
CONSTR.explainError = function (err) {
  const msg = (err && err.message) || String(err);

  if (/accessory_types|module_layout_nodes|module_accessory_options/.test(msg)
    && /does not exist|could not find|schema cache/i.test(msg)) {
    return 'As tabelas do construtor não existem neste banco — falta rodar '
      + 'database/migration_085_criador_de_modulos_arvore_de_vaos.sql no SQL Editor do Supabase.\n\n'
      + 'Ela é aditiva: cria 3 tabelas novas e 6 colunas em modules, e não muda o '
      + 'comportamento de nenhum módulo existente.\n\nDetalhe do banco: ' + msg;
  }
  if (/inner_[xyzwhd]_formula/.test(msg)) {
    return 'A coluna de zona interna não existe em modules — é a parte 4 da migration 085. '
      + 'Rode o arquivo inteiro de uma vez.\n\nDetalhe do banco: ' + msg;
  }
  const col = msg.match(/column ([\w."]+) does not exist/i);
  if (col) {
    return 'A coluna ' + col[1] + ' não existe neste banco. Isso é uma migration anterior pendente, '
      + 'não a 085 — o Postgres derruba a consulta inteira quando UMA coluna pedida falta. '
      + 'A pasta database/ está numerada em ordem.\n\nDetalhe do banco: ' + msg;
  }
  if (typeof DATA !== 'undefined' && DATA.explainError) return DATA.explainError(err);
  return msg;
};

/* ============================================================
   Catálogo de agregados
   ============================================================
   Vem com o COMPONENTE embutido (e o labor_types/component_types dele),
   porque é do componente que saem preço, fita, mão de obra, papel de cor e
   — depois da migration 086 — os limites de fabricação. Um agregado sem
   componente resolvido não pode ser usado; a tela mostra ele apagado em vez
   de esconder, senão vira mistério.

   A 086 pode não ter rodado ainda. Por isso o select é '*' e nunca lista
   veio/fura/*_min_mm nome a nome: pedir coluna que não existe derruba a
   consulta inteira, e aí o construtor não abriria por causa de uma
   migration que ele nem precisa. Coluna ausente = undefined = sem limite. */
CONSTR.loadCatalogo = async function () {
  const { data, error } = await DATA.sb()
    .from('accessory_types')
    .select('*, components(*, labor_types(*), component_types(*))')
    .order('group_name')
    .order('sort_order')
    .order('name');
  if (error) throw error;
  return data || [];
};

/* Módulos que podem ser abertos no construtor. is_invisible fica de fora do
   seletor principal (é peça-módulo: porta Shaker, gaveta pronta) mas
   continua carregável por id — um agregado pode apontar pra ele. */
CONSTR.loadModulos = async function () {
  const { data, error } = await DATA.sb()
    .from('modules')
    .select('id, name, width_default_mm, height_default_mm, depth_default_mm, '
      + 'width_min_mm, width_max_mm, height_min_mm, height_max_mm, depth_min_mm, depth_max_mm, '
      + 'is_invisible, active')
    .order('name');
  if (error) throw error;
  return data || [];
};

/* O módulo completo — inclui as 6 fórmulas de zona interna. select('*') pelo
   mesmo motivo do catálogo: modules ganhou coluna em quase toda migration e
   listar nome a nome aqui é garantir quebra futura. */
CONSTR.loadModulo = async function (moduleId) {
  const { data, error } = await DATA.sb()
    .from('modules').select('*').eq('id', moduleId).single();
  if (error) throw error;
  return data;
};

CONSTR.loadOpcoes = async function (moduleId) {
  const { data, error } = await DATA.sb()
    .from('module_accessory_options').select('*').eq('module_id', moduleId);
  if (error) throw error;
  return data || [];
};

/* ============================================================
   Árvore de vãos — banco <-> memória
   ============================================================
   O nó em memória é o do LayoutEngine (newVoid). A tradução é quase 1:1,
   com UMA diferença que precisa ficar explícita:

   FRENTES SÃO UMA LISTA, A COLUNA É UMA SÓ.
   module_layout_nodes tem front_accessory_id (singular), mas o motor
   suporta várias frentes no mesmo vão, cada uma cobrindo uma faixa de
   filhos (from..to) — é o que permite uma porta de duas colunas ao lado de
   outra de uma. Em vez de pedir uma tabela nova, a lista inteira vai em
   params.fronts (jsonb, campo livre por decisão da própria 085) e a frente
   que cobre o VÃO INTEIRO é espelhada em front_accessory_id.

   O espelho não é enfeite: é o que mantém a coluna útil pra quem olhar por
   SQL ou escrever o layout à mão. Na leitura, params.fronts ganha quando
   existe; quando não existe (linha escrita à mão), front_accessory_id vira
   uma frente de vão inteiro. Os dois caminhos funcionam. */
CONSTR.nodeFromRow = function (row) {
  const params = Object.assign({}, row.params || {});
  const fronts = params.fronts;
  const contentParams = params.content;
  delete params.fronts;
  delete params.content;

  return {
    id: row.id,
    children: [],
    splitAxis: row.split_axis || null,
    splitAcc: row.split_accessory_id || null,
    // 'ratio' existe no banco mas o motor só conhece fill/fixed. Ler como
    // 'fill' é o comportamento correto (rateia), não uma perda silenciosa:
    // ratio nunca chega a ser gravado por esta tela.
    sizeMode: row.size_mode === 'fixed' ? 'fixed' : 'fill',
    sizeValue: row.size_value == null ? null : Number(row.size_value),
    content: row.content_accessory_id
      ? { acc: row.content_accessory_id, params: contentParams || {} }
      : null,
    fronts: Array.isArray(fronts) && fronts.length
      ? fronts
      : (row.front_accessory_id
        ? [{ acc: row.front_accessory_id, params: {}, from: null, to: null }]
        : []),
    params: params,
    locked: !!row.locked
  };
};

CONSTR.rowFromNode = function (node, moduleId, parentId, ordem) {
  const params = Object.assign({}, node.params || {});
  if (node.fronts && node.fronts.length) params.fronts = node.fronts;
  if (node.content && node.content.params) params.content = node.content.params;

  // Espelho: só a frente que cobre o vão inteiro vai pra coluna. Frente de
  // faixa (from!=null) não tem como caber num campo singular — e forçar a
  // primeira ali daria a impressão errada de que o vão inteiro está fechado.
  const inteira = (node.fronts || []).find(function (f) { return f.from == null; });

  return {
    module_id: moduleId,
    parent_id: parentId,
    sort_order: ordem || 0,
    split_axis: node.splitAxis || null,
    split_accessory_id: node.splitAcc || null,
    size_mode: node.sizeMode === 'fixed' ? 'fixed' : 'fill',
    size_value: node.sizeMode === 'fixed' && node.sizeValue != null ? Math.round(node.sizeValue) : null,
    content_accessory_id: node.content ? node.content.acc : null,
    front_accessory_id: inteira ? inteira.acc : null,
    params: params,
    locked: !!node.locked
  };
};

/* Devolve a raiz já montada, ou null quando o módulo ainda não tem árvore
   (que é o estado de TODO módulo existente — e não é erro). */
CONSTR.loadArvore = async function (moduleId) {
  const { data, error } = await DATA.sb()
    .from('module_layout_nodes')
    .select('*')
    .eq('module_id', moduleId)
    .order('sort_order');
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return null;

  const porId = {};
  rows.forEach(function (r) { porId[r.id] = CONSTR.nodeFromRow(r); });

  let raiz = null;
  rows.forEach(function (r) {
    if (!r.parent_id) { raiz = porId[r.id]; return; }
    const pai = porId[r.parent_id];
    if (pai) pai.children.push(porId[r.id]);
  });
  // Órfão (pai apagado por fora): não some do banco calado — mas também não
  // trava a tela. Vira filho da raiz, onde dá pra ver e apagar.
  if (raiz) {
    rows.forEach(function (r) {
      if (r.parent_id && !porId[r.parent_id] && porId[r.id] !== raiz) raiz.children.push(porId[r.id]);
    });
  }
  return raiz;
};

/* Grava a árvore inteira: apaga e reescreve.
 *
 * "Apagar e reescrever" parece grosseiro, mas é o certo aqui: a árvore é um
 * DOCUMENTO (dezenas de linhas, editado inteiro numa tela só), não um
 * cadastro que várias pessoas mexem em paralelo. Um diff nó a nó custaria
 * muito mais código pra economizar meia dúzia de inserts, e abriria a porta
 * pro estado meio-salvo — que é justamente o que não pode acontecer com o
 * layout de um produto.
 *
 * Os inserts são um por nó (e não um insert em lote) porque parent_id
 * precisa do uuid que só existe DEPOIS de inserir o pai. Uma árvore de
 * fábrica tem ordem de dezenas de nós; é rápido o suficiente e o código
 * fica óbvio.
 */
CONSTR.salvarArvore = async function (moduleId, root) {
  const sb = DATA.sb();
  const del = await sb.from('module_layout_nodes').delete().eq('module_id', moduleId);
  if (del.error) throw del.error;
  if (!root) return 0;

  let contador = 0;
  async function inserir(node, parentId, ordem) {
    const { data, error } = await sb
      .from('module_layout_nodes')
      .insert(CONSTR.rowFromNode(node, moduleId, parentId, ordem))
      .select('id')
      .single();
    if (error) throw error;
    contador += 1;
    // O nó em memória passa a usar o id do banco. Sem isso, salvar duas
    // vezes seguidas deixaria a seleção da tela apontando pra um id que não
    // existe mais.
    node.id = data.id;
    const kids = node.children || [];
    for (let i = 0; i < kids.length; i++) await inserir(kids[i], data.id, i);
  }
  await inserir(root, null, 0);
  return contador;
};

CONSTR.apagarArvore = async function (moduleId) {
  const { error } = await DATA.sb()
    .from('module_layout_nodes').delete().eq('module_id', moduleId);
  if (error) throw error;
};

/* ============================================================
   Zona interna (as 6 fórmulas em modules)
   ============================================================
   Vazio = o resolvedor deduz do casco. Deduzir é palpite razoável pra abrir
   um módulo antigo; a fórmula explícita é o que a engenharia grava quando
   confere que ficou certo. Por isso a tela oferece "usar o calculado" em vez
   de gravar sozinha. */
CONSTR.salvarZona = async function (moduleId, f) {
  const patch = {
    inner_x_formula: f.x || null, inner_y_formula: f.y || null, inner_z_formula: f.z || null,
    inner_w_formula: f.w || null, inner_h_formula: f.h || null, inner_d_formula: f.d || null
  };
  const { error } = await DATA.sb().from('modules').update(patch).eq('id', moduleId);
  if (error) throw error;
};

/* ============================================================
   Whitelist por módulo
   ============================================================
   upsert por (module_id, accessory_type_id) — o unique da 085 é exatamente
   esse par, então religar um agregado desligado reaproveita a linha (e o
   ajuste fino de vão mínimo que estava guardado nela) em vez de criar outra. */
CONSTR.salvarOpcoes = async function (moduleId, linhas) {
  if (!linhas || !linhas.length) return;
  const rows = linhas.map(function (l) {
    return {
      module_id: moduleId,
      accessory_type_id: l.accessory_type_id,
      allowed: !!l.allowed,
      client_visible: l.client_visible !== false,
      max_count: l.max_count == null || l.max_count === '' ? null : Number(l.max_count),
      min_void_w_mm: l.min_void_w_mm == null || l.min_void_w_mm === '' ? null : Number(l.min_void_w_mm),
      min_void_h_mm: l.min_void_h_mm == null || l.min_void_h_mm === '' ? null : Number(l.min_void_h_mm),
      min_void_d_mm: l.min_void_d_mm == null || l.min_void_d_mm === '' ? null : Number(l.min_void_d_mm)
    };
  });
  const { error } = await DATA.sb()
    .from('module_accessory_options')
    .upsert(rows, { onConflict: 'module_id,accessory_type_id' });
  if (error) throw error;
};

/* ============================================================
   accessory_types (linha do banco) -> entrada do catálogo do motor
   ============================================================
   O LayoutEngine não conhece o banco: ele lê um mapa simples, keyed por
   chave de agregado. Aqui a chave é o PRÓPRIO uuid do accessory_type — o
   que é gravado no nó da árvore, então serializar/desserializar não precisa
   de tradução nenhuma no meio.

   Campos que o motor consome (ver build/toPieceRows/cabeNoVao em
   js/layout-engine.js): name, axis, espessura, params, forma, folhas,
   componente, color_role_id, minW/minH/minD. O resto é da interface. */
CONSTR.catalogoDoBanco = function (linhas) {
  const cat = {};
  (linhas || []).forEach(function (a) {
    const p = a.default_params || {};
    // 'forma' escolhe o desenho do conteúdo no resolvedor. Não é um campo do
    // banco de propósito: sai do que já está cadastrado. Cabide é o
    // shape_type (migration 062); painel ripado se identifica pelo passo das
    // ripas nos parâmetros — nenhum outro agregado tem passo_mm.
    let forma = null;
    if (a.shape_type === 'oval_rod') forma = 'barra';
    else if (p.passo_mm != null) forma = 'ripas';

    // MÓDULO INTEIRO como agregado (a.child_module_id, migration 103) — as
    // peças REAIS do módulo filho (module_meta/fixed_depths/locked_presets/
    // own_hinge_slide/child_pieces) são buscadas ANTES, em CST.load (precisa
    // de await; esta função é síncrona de propósito) e ficam penduradas na
    // própria linha como `a._moduleExtra` — ver CST.load e o mesmo fix
    // espelhado em js/portal.js loadProjectBuilderCatalog. Sem isso
    // LayoutEngine.toPieceRows monta uma linha is_module:true com
    // child_pieces=[] (nada dentro): o vão fica "ocupado" e nenhuma peça
    // aparece no 3D/preço/furação.
    const me = a._moduleExtra || null;

    cat[a.id] = {
      id: a.id,
      name: a.name,
      // slug (2026-08-20, mesmo achado do fix de group_name acima — "a
      // gaveta entra sem a frente", causa nº2): js/layout-engine.js
      // emitContent acha a frente sintetizada via findAccBySlug(cat,
      // 'frente_gaveta_externa'), que procura `.slug` em cada entrada do
      // catálogo — sem este campo aqui o ERP nunca encontra a frente,
      // mesmo com group_name certo (fix nº1) e com a linha cadastrada no
      // banco. Espelha `slug: a.slug || null` de
      // js/portal-07-construtor.js projectBuilderAccessoryEntry.
      slug: a.slug || null,
      sub: a.group_name || '',
      group: a.group_name || 'Outros',
      // group_name CRU (2026-08-20, espelha o mesmo fix em
      // js/portal-07-construtor.js projectBuilderAccessoryEntry — "a gaveta
      // entra sem a frente"): js/layout-engine.js/emitContent decide a
      // frente automática de gaveta olhando `acc.group_name`, não `group`
      // (que aqui já vem com fallback 'Outros' pra UI). Sem isto, TODA
      // gaveta cadastrada via ERP também entraria sem frente, igual o bug
      // relatado no portal.
      group_name: a.group_name || null,
      icon: a.icon || '▪',
      role: a.role,
      axis: a.split_axis || null,
      // 'E' (migration 161) = segue a espessura do casco -> null, o motor
      // usa opts.espessuraCasco (portal, pela cor) ou `esp` (aqui, 19.5).
      espessura: /^\s*E\s*$/i.test(String(a.thickness_formula || '')) ? null : CONSTR.numeroDaFormula(a.thickness_formula, 18),
      params: p,
      forma: forma,
      folhas: Number(p.folhas) === 2 ? 2 : 1,
      shape_type: a.shape_type || null,
      color_role_id: a.color_role_id || null,
      // Programa de furação POR USO (migration 125) — espelha
      // module_components.drilling_pattern_id (105). NULL = cai na furação
      // do componente vinculado, como sempre. js/layout-engine.js toPieceRows
      // já lê acc.drilling_pattern_id; só faltava chegar até aqui.
      drilling_pattern_id: a.drilling_pattern_id || null,
      // Suporte de prateleira por uso (migration 162) — null herda do componente.
      drill_shelf_support: a.drill_shelf_support != null ? !!a.drill_shelf_support : null,
      // Variante POR PROFUNDIDADE (migration 126) — espelha
      // js/portal-07-construtor.js projectBuilderAccessoryEntry, mesmos dois
      // campos. Consumido por LayoutEngine.resolveDepthVariant.
      depth_bracket_min_mm: a.depth_bracket_min_mm != null ? Number(a.depth_bracket_min_mm) : null,
      depth_bracket_max_mm: a.depth_bracket_max_mm != null ? Number(a.depth_bracket_max_mm) : null,
      depth_variant_of: a.depth_variant_of || null,
      componente: a.components || null,
      child_module_id: a.child_module_id || null,
      module_meta: (me && me.module_meta) || null,
      fixed_depths: (me && me.fixed_depths) || [],
      locked_presets: (me && me.locked_presets) || {},
      own_hinge_slide: (me && me.own_hinge_slide) || {},
      child_pieces: (me && me.child_pieces) || [],
      minW: Number(a.min_void_w_mm) || 0,
      minH: Number(a.min_void_h_mm) || 0,
      minD: Number(a.min_void_d_mm) || 0,
      active: a.active !== false
    };
  });
  return cat;
};

// Busca as peças REAIS de cada accessory_type com child_module_id (migration
// 103) e devolve um mapa { [child_module_id]: {module_meta, fixed_depths,
// locked_presets, own_hinge_slide, child_pieces} } — mesmo formato que
// CONSTR.catalogoDoBanco pendura em cada linha via `_moduleExtra` antes de
// montar o catálogo do motor. Fica separada (e ASYNC) porque
// catalogoDoBanco é síncrona de propósito (chamada de dentro de CST.render,
// que devolve HTML na hora — ver comentário lá). Espelha
// loadProjectBuilderCatalog em js/portal.js linha por linha; se um campo
// novo entrar lá, entra aqui também.
//
// Usa as MESMAS quatro funções de module-pieces.js (fetchModuleFixedDepths/
// loadRecursivePiecesForModule/fetchModuleLockedDimensionPresets/
// fetchModuleOwnHingeAndSlideModels) que o ERP já carrega globalmente antes
// deste arquivo (erp/index.html) — a cópia ÚNICA desde 15/08, ver
// [[quatro_copias_do_resolvedor_de_pecas]].
CONSTR.carregarExtrasDeModuloFilho = async function (linhas) {
  const moduleIds = Array.from(new Set(
    (linhas || []).filter(function (a) { return a.child_module_id; }).map(function (a) { return a.child_module_id; })
  ));
  const extras = {};
  await Promise.all(moduleIds.map(async function (mid) {
    const [fixedDepths, childPieces, lockedPresets, ownHingeSlide] = await Promise.all([
      fetchModuleFixedDepths(mid),
      loadRecursivePiecesForModule(mid),
      fetchModuleLockedDimensionPresets(mid),
      fetchModuleOwnHingeAndSlideModels(mid)
    ]);
    extras[mid] = {
      module_meta: { name: lockedPresets.name },
      fixed_depths: fixedDepths,
      locked_presets: lockedPresets,
      own_hinge_slide: ownHingeSlide,
      child_pieces: childPieces
    };
  }));
  (linhas || []).forEach(function (a) {
    if (a.child_module_id && extras[a.child_module_id]) a._moduleExtra = extras[a.child_module_id];
  });
};

/* thickness_formula é texto e ACEITA fórmula, mas o resolvedor precisa do
   número antes de saber o tamanho dos filhos (é ele que decide o rateio).
   Número puro é o caso real de 100% do cadastro ('18', '25'); qualquer outra
   coisa cai no padrão em vez de quebrar a divisão inteira. */
CONSTR.numeroDaFormula = function (txt, padrao) {
  const n = parseFloat(txt);
  return isFinite(n) && n > 0 ? n : padrao;
};

/* ============================================================
   Limites de fabricação (migration 086) — o motor só LÊ
   ============================================================
   Monta o porPeca que LayoutEngine.validar espera, keyed pela mesma chave
   de agregado do catálogo. Os números vêm do COMPONENTE, não do agregado:
   o fundo tem veio livre e não leva furo POR SER O FUNDO, não por estar
   sendo usado como agregado (é a decisão registrada no cabeçalho da 086).

   Se a 086 ainda não rodou, as colunas vêm undefined e o mapa nasce vazio —
   validação some, tela continua funcionando. É o que se quer: o construtor
   não depende dela pra existir, só valida melhor com ela. */
CONSTR.limitesDoCatalogo = function (cat) {
  const porPeca = {};
  let temAlgum = false;
  Object.keys(cat || {}).forEach(function (k) {
    const c = cat[k].componente;
    if (!c) return;
    const lim = {};
    [['width', 'W'], ['height', 'H'], ['depth', 'D']].forEach(function (t) {
      if (c[t[0] + '_min_mm'] != null) lim['min' + t[1]] = Number(c[t[0] + '_min_mm']);
      if (c[t[0] + '_max_mm'] != null) lim['max' + t[1]] = Number(c[t[0] + '_max_mm']);
    });
    if (c.veio) lim.veio = c.veio;
    if (c.fura === false) lim.fura = false;
    if (!Object.keys(lim).length) return;
    // notes é o campo "Descrição" do componente no admin — vira o motivo que
    // acompanha o aviso ("prateleira longa demais barriga no meio"). Só entra
    // quando já existe algum limite: sozinho ele não é limite nenhum.
    if (c.notes) lim.obs = c.notes;
    porPeca[k] = lim;
    temAlgum = true;
  });
  return { porPeca: porPeca, cadastrado: temAlgum };
};
