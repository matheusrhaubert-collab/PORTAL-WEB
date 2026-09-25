/* Legno ERP — CONSTRUTOR DE MÓDULOS (Engenharia). Migration 085.
 *
 * Ler docs/criador-de-modulos-spec.md (seção 5.1) antes de mexer aqui.
 * Motor: js/layout-engine.js. Dados: erp/js/data-construtor.js.
 * Protótipo que validou a experiência: teste-construtor-modulo.html.
 *
 * ==========================================================================
 * O QUE ESTA TELA É
 * ==========================================================================
 * É a etapa 4 do spec: o protótipo offline virando tela de verdade, gravando
 * em module_layout_nodes. E é a BASE DA BIBLIOTECA DO PORTAL — o que se faz
 * aqui é o que o cliente vai encontrar montado quando escolher o módulo:
 *
 *   a ÁRVORE      o layout de fábrica (o que já vem montado)
 *   locked        o que o cliente NÃO pode mexer (estrutura x opção)
 *   a WHITELIST   o que ele pode acrescentar (module_accessory_options)
 *
 * Os três saem daqui. O construtor do portal (etapa 6) é ESTA MESMA tela com
 * a biblioteca filtrada, sem fórmula à vista e com preço no rodapé.
 *
 * ==========================================================================
 * O QUE ESTA TELA NÃO FAZ — e não é esquecimento
 * ==========================================================================
 * Não gera peça, não calcula preço e não posiciona nada. Isso é do motor
 * (LayoutEngine) e das funções que já existem (Pricing, resolvePiecesForViewer,
 * Drilling). Aqui só há desenho, clique e persistência. Se um dia for preciso
 * escrever geometria neste arquivo, é sinal de que ela está faltando no motor.
 *
 * O CASCO também não é da árvore: ele continua vindo de module_components,
 * carregado por loadRecursivePiecesForModule e posicionado por
 * Drilling._internals.buildBoxes — a MESMA conta que o 3D e a furação usam.
 * Desenhar o casco por conta própria aqui seria criar uma terceira versão da
 * verdade, que é exatamente como as vistas passam a divergir.
 */

const CST = {};

/* Estado da tela. Vive fora do render porque o desenho é redesenhado dezenas
   de vezes por segundo durante um arrasto e recarregar do banco a cada frame
   seria absurdo. */
CST.S = {
  moduleId: null, modulo: null,
  catRows: [], cat: {}, opcoes: {},
  root: null, sel: null, built: null, zona: null,
  W: 900, H: 2100, D: 600,
  cascoParts: [], cascoBoxes: [],
  passo: 10, showVeio: true, showPortas: true,
  chapa: { largura: 1200, comprimento: 2750 },
  maq: { largura: 1050, comprimento: 3000 },
  history: [], drag: null, dirty: false, open: 0, openTarget: 0
};

CST.MIN_VAO = 40;          // menor vão que o arrasto/digitação aceita criar
/* Folga na FRENTE de tudo que o construtor gera (2026-08-16, Matt: "quero 1mm
   menor ainda do que o vão livre"). Espelha RECUO_FRENTE_INTERNO_MM /
   FRENTE_MIN_FRACAO_D em js/portal.js — o portal e o ERP montam a mesma
   árvore, e vão interno diferente entre os dois já custou caro antes. */
CST.RECUO_FRENTE_INTERNO_MM = 1;
CST.FRENTE_MIN_FRACAO_D = 0.4;
// 19.5mm (2026-08-15, pedido do Matt): era 18 — combinado antes como 20mm,
// fixado agora em 19.5mm pros componentes principais (ver migration 101 +
// PROJECT_BUILDER_ESPESSURA espelhado em js/portal.js, mesmo número nos
// dois motores). Só entra quando o agregado não tem thickness_formula
// próprio.
CST.ESPESSURA = 19.5;      // espessura de referência de porta/frente, em mm
CST.FOLGA_DOBRADICA = 2;   // ar que a porta embutida precisa pra fechar

/* ============================================================
   Carga
   ============================================================ */
CST.load = async function (params) {
  const [modulos, catRows] = await Promise.all([
    CONSTR.loadModulos(),
    CONSTR.loadCatalogo()
  ]);

  // Agregados que são MÓDULO INTEIRO (child_module_id, migration 103) —
  // busca as peças reais do módulo filho aqui (async; CONSTR.catalogoDoBanco
  // que monta o catálogo do motor, em CST.render, é síncrona de propósito) e
  // pendura em cada linha (`a._moduleExtra`). Sem isso o construtor abre o
  // vão, mostra "ocupado", e nenhuma peça do módulo-agregado aparece — era
  // o "coloquei ela lá mas ela não entra com as peças" do Matt. Ver
  // CONSTR.carregarExtrasDeModuloFilho e o mesmo fix em js/portal.js
  // loadProjectBuilderCatalog.
  await CONSTR.carregarExtrasDeModuloFilho(catRows);

  const id = params.m || null;
  let modulo = null, opcoes = [], arvore = null, pecas = [];
  const cores = {};   // { [color_role_id]: registro de "colors" }
  if (id) {
    modulo = await CONSTR.loadModulo(id);
    const r = await Promise.all([
      CONSTR.loadOpcoes(id),
      CONSTR.loadArvore(id),
      // Do painel admin (erp/js/adm/11-modulo-3d.js) — é a mesma função que
      // o portal usa. O casco do módulo não é reinventado aqui.
      loadRecursivePiecesForModule(id),
      // Cores vinculadas ao módulo (migration 035). Sem elas o casco sairia
      // cinza e o miolo da borda (migration 088) não saberia o substrato —
      // e o ponto de olhar o 3D aqui é justamente conferir o acabamento.
      fetchModuleColorsForImageList(id).catch(function () { return []; })
    ]);
    opcoes = r[0]; arvore = r[1]; pecas = r[2];
    // A primeira cor de cada papel: é a mesma escolha padrão que o admin faz
    // ao gerar a imagem do módulo.
    (r[3] || []).forEach(function (g) { if (g.colors && g.colors[0]) cores[g.role_id] = g.colors[0]; });
  }
  return { modulos: modulos, catRows: catRows, modulo: modulo, opcoes: opcoes, arvore: arvore, pecas: pecas, cores: cores };
};

/* ============================================================
   Render (HTML) — o miolo vivo é montado depois, em CST.after
   ============================================================ */
CST.render = function (params, d) {
  const S = CST.S;
  S.catRows = d.catRows || [];
  S.cat = CONSTR.catalogoDoBanco(S.catRows);
  S.modulo = d.modulo || null;
  S.moduleId = d.modulo ? d.modulo.id : null;
  S.pecasModulo = d.pecas || [];
  S.cores = d.cores || {};
  S.opcoes = {};
  (d.opcoes || []).forEach(function (o) { S.opcoes[o.accessory_type_id] = o; });
  S.history = [];
  S.dirty = false;
  S.sel = null;

  const semCatalogo = !S.catRows.length;

  const seletor = '<select id="cst-modulo" style="min-width:280px">'
    + '<option value="">— escolha um módulo —</option>'
    + (d.modulos || []).filter(function (m) { return m.active !== false; }).map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === S.moduleId ? ' selected' : '') + '>'
        + UI.esc(m.name) + (m.is_invisible ? ' (peça-módulo)' : '') + '</option>';
    }).join('')
    + '</select>';

  // UI.head já embrulha isto em .erp-page-actions — não embrulhar de novo.
  const acoes = seletor
    + '<button class="erp-btn-secondary" id="cst-recarregar">Recarregar</button>'
    + '<button class="erp-btn" id="cst-salvar"' + (S.moduleId ? '' : ' disabled') + '>Salvar layout</button>';

  const cabeca = UI.head('Construtor de módulos',
    'O interior do módulo é uma <strong>árvore de vãos</strong>: clique num vão e escolha o que vai nele. '
    + 'O que você monta aqui é o que o cliente encontra montado no portal — e o que ele pode acrescentar '
    + 'sai da coluna da esquerda, no visto ao lado de cada agregado.', acoes);

  if (semCatalogo) {
    return cabeca + UI.errorBox('Nenhum agregado cadastrado',
      'O construtor monta o interior a partir do catálogo de agregados (accessory_types). '
      + 'Sem nenhum agregado ativo não há o que oferecer num vão.\n\n'
      + 'Rode database/migration_087_agregados_base.sql para criar os agregados base já vinculados '
      + 'aos componentes deste banco, ou cadastre à mão em Engenharia → Agregados do construtor.');
  }
  if (!S.moduleId) {
    return cabeca + '<div class="erp-empty"><div class="erp-strong">Escolha um módulo acima</div>'
      + '<div class="erp-muted erp-small" style="margin-top:8px">O casco continua vindo do cadastro de peças '
      + '(module_components). O construtor cuida só do <strong>interior</strong> — divisórias, prateleiras, '
      + 'gavetas, portas e acessórios.</div></div>';
  }

  return cabeca + CST.htmlEditor();
};

CST.htmlEditor = function () {
  return ''
    + '<div class="cst">'

    /* ---------- esquerda: biblioteca ---------- */
    + '<div class="cst-col">'
    + '  <div class="cst-sec"><h3>Agregados</h3>'
    + '    <div class="cst-sub">Clique para inserir no vão selecionado. O visto <b>✓</b> é o que o '
    + '    <b>cliente</b> pode acrescentar no portal.</div></div>'
    + '  <div class="cst-scroll" style="padding:9px 12px" id="cst-lib"></div>'
    + '</div>'

    /* ---------- centro: desenho 2D frontal ---------- */
    + '<div class="cst-col">'
    + '  <div class="cst-dimbar">'
    + '    <label>L <input type="range" id="cst-w"><b id="cst-vw">—</b></label>'
    + '    <label>A <input type="range" id="cst-h"><b id="cst-vh">—</b></label>'
    + '    <label>P <input type="range" id="cst-d"><b id="cst-vd">—</b></label>'
    + '    <div class="sp"></div>'
    + '    <label>Passo <select id="cst-passo">'
    + '      <option>1</option><option>5</option><option selected>10</option>'
    + '      <option>25</option><option>50</option></select> mm</label>'
    + '    <label>Chapa <input type="number" id="cst-chapa-l" value="1200" style="width:56px"> × '
    + '      <input type="number" id="cst-chapa-c" value="2750" style="width:56px"></label>'
    + '    <label>Furadeira <input type="number" id="cst-maq-l" value="1050" style="width:56px"> × '
    + '      <input type="number" id="cst-maq-c" value="3000" style="width:56px"></label>'
    + '    <label><input type="checkbox" id="cst-veio" checked> veio</label>'
    + '    <label><input type="checkbox" id="cst-portas" checked> portas</label>'
    + '    <button class="erp-btn-ghost erp-btn-sm" id="cst-undo">↶ Desfazer</button>'
    + '  </div>'
    + '  <div class="cst-err" id="cst-err" hidden></div>'
    + '  <div class="cst-stage" id="cst-stage">'
    + '    <svg id="cst-svg"></svg>'
    + '    <div class="cst-hint" id="cst-hint">Clique num <b>vão</b> para escolher o que vai nele</div>'
    + '    <div class="cst-ctx" id="cst-ctx" hidden>'
    + '      <div class="cst-ctx-h"><b id="cst-ctx-dim"></b>'
    + '        <button class="cst-ctx-x" id="cst-ctx-x">&times;</button></div>'
    + '      <div id="cst-ctx-b"></div>'
    + '    </div>'
    + '  </div>'
    + '</div>'

    /* ---------- direita: 3D + propriedades ---------- */
    + '<div class="cst-col cst-rail">'
    + '  <div class="cst-3d" id="cst-3d">'
    + '    <div class="cst-3d-tools">'
    + '      <button class="erp-btn-ghost erp-btn-sm" id="cst-abrir">Abrir</button>'
    + '      <button class="erp-btn-ghost erp-btn-sm" id="cst-fit">Enquadrar</button>'
    + '    </div>'
    + '  </div>'
    + '  <div class="cst-scroll" style="padding:9px 12px" id="cst-props"></div>'
    + '</div>'

    /* ---------- rodapé: árvore + zona interna + resumo ---------- */
    + '<div class="cst-foot">'
    + '  <div class="cst-treewrap">'
    + '    <button class="cst-treetoggle" id="cst-tree-toggle">▸ Árvore do módulo</button>'
    + '    <div class="cst-tree hide" id="cst-tree"></div>'
    + '  </div>'
    + '  <div class="cst-side" id="cst-resumo"></div>'
    + '</div>'

    + '</div>';
};

/* ============================================================
   Depois do HTML no DOM
   ============================================================ */
CST.after = function (params, d) {
  const sel = document.getElementById('cst-modulo');
  if (sel) {
    sel.onchange = function () {
      if (CST.S.dirty && !confirm('Há alterações não salvas neste layout. Trocar de módulo mesmo assim?')) {
        sel.value = CST.S.moduleId || '';
        return;
      }
      location.hash = sel.value ? '#/construtor?m=' + sel.value : '#/construtor';
    };
  }
  const rec = document.getElementById('cst-recarregar');
  if (rec) rec.onclick = function () { APP.reload(); };

  if (!CST.S.moduleId || !document.getElementById('cst-svg')) return;

  const S = CST.S;
  const m = S.modulo;
  S.W = Math.round(m.width_default_mm || 900);
  S.H = Math.round(m.height_default_mm || 2100);
  S.D = Math.round(m.depth_default_mm || 600);

  // Árvore: a do banco, ou uma raiz vazia (módulo que ainda não passou por
  // aqui). Raiz vazia NÃO é gravada sozinha — só quando o usuário salvar.
  S.root = d.arvore || LayoutEngine.newVoid();

  CST.montarSliders();
  CST.montarControles();
  CST.recalcularCasco();
  CST.initThree();
  CST.rebuild();
  CST.autoSelect();
};

CST.montarSliders = function () {
  const S = CST.S, m = S.modulo;
  const par = [
    ['cst-w', 'cst-vw', 'W', m.width_min_mm || 300, m.width_max_mm || 1800],
    ['cst-h', 'cst-vh', 'H', m.height_min_mm || 300, m.height_max_mm || 2700],
    ['cst-d', 'cst-vd', 'D', m.depth_min_mm || 200, m.depth_max_mm || 800]
  ];
  par.forEach(function (p) {
    const inp = document.getElementById(p[0]);
    if (!inp) return;
    inp.min = Math.round(p[3]); inp.max = Math.round(p[4]); inp.step = 10;
    inp.value = Math.min(Math.max(S[p[2]], p[3]), p[4]);
    S[p[2]] = Math.round(Number(inp.value));
    document.getElementById(p[1]).textContent = S[p[2]] + ' mm';
    // 'input' e não 'change': o teste do spec é justamente ver tudo reflowar
    // enquanto o slider anda. Se uma peça sai do lugar, o cadastro está
    // errado e você vê na hora — não três semanas depois num pedido.
    inp.oninput = function () {
      S[p[2]] = Math.round(Number(inp.value));
      document.getElementById(p[1]).textContent = S[p[2]] + ' mm';
      CST.marcarSujo();
      CST.recalcularCasco();
      CST.rebuild();
    };
  });
};

CST.montarControles = function () {
  const S = CST.S;
  const liga = function (id, fn) { const e = document.getElementById(id); if (e) fn(e); };

  liga('cst-passo', function (e) { e.onchange = function () { S.passo = Number(e.value) || 10; }; });
  liga('cst-veio', function (e) { e.onchange = function () { S.showVeio = e.checked; CST.render2D(); }; });
  liga('cst-portas', function (e) {
    e.onchange = function () { S.showPortas = e.checked; CST.render2D(); CST.render3D(); };
  });
  ['cst-chapa-l', 'cst-chapa-c', 'cst-maq-l', 'cst-maq-c'].forEach(function (id) {
    liga(id, function (e) {
      e.onchange = function () {
        S.chapa.largura = Number(document.getElementById('cst-chapa-l').value) || 1200;
        S.chapa.comprimento = Number(document.getElementById('cst-chapa-c').value) || 2750;
        S.maq.largura = Number(document.getElementById('cst-maq-l').value) || 1050;
        S.maq.comprimento = Number(document.getElementById('cst-maq-c').value) || 3000;
        CST.rebuild();
      };
    });
  });

  liga('cst-undo', function (e) { e.onclick = CST.undo; });
  liga('cst-ctx-x', function (e) { e.onclick = CST.closeCtx; });
  liga('cst-stage', function (e) {
    e.addEventListener('click', function (ev) { if (ev.target === e || ev.target.id === 'cst-svg') CST.closeCtx(); });
  });
  liga('cst-tree-toggle', function (e) {
    e.onclick = function () {
      const t = document.getElementById('cst-tree');
      t.classList.toggle('hide');
      e.textContent = (t.classList.contains('hide') ? '▸' : '▾') + ' Árvore do módulo';
    };
  });
  liga('cst-abrir', function (e) {
    e.onclick = function () { S.openTarget = S.openTarget > 0.5 ? 0 : 1; };
  });
  liga('cst-fit', function (e) { e.onclick = CST.fitCamera; });
  liga('cst-salvar', function (e) { e.onclick = CST.salvar; });

  // Delete/Backspace esvazia o vão selecionado — o mesmo que o botão do
  // painel. Só quando o foco não está num campo, senão apagaria texto.
  if (!CST._teclado) {
    CST._teclado = function (ev) {
      if (!document.getElementById('cst-svg')) return;
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); CST.esvaziarVao(); }
      if (ev.key === 'Escape') CST.closeCtx();
      if ((ev.ctrlKey || ev.metaKey) && ev.key === 'z') { ev.preventDefault(); CST.undo(); }
    };
    document.addEventListener('keydown', CST._teclado);
  }
};

/* ============================================================
   Casco e zona interna
   ============================================================
   O casco é recalculado só quando L/A/P mudam (não a cada clique no vão):
   é uma avaliação de fórmula por peça e não muda com a árvore. */
CST.recalcularCasco = function () {
  const S = CST.S;
  const dims = { W: S.W, H: S.H, D: S.D };
  // Configuração PADRÃO do módulo — mesmo critério do portal: medida padrão,
  // só opcionais marcados "vem marcado por padrão".
  const efetivas = (S.pecasModulo || []).filter(function (p) {
    return !p.client_optional || p.client_optional_default_on;
  });
  const shelfQuantities = {};
  (S.pecasModulo || []).filter(function (p) { return p.quantity_configurable; })
    .forEach(function (p) { shelfQuantities[p.id] = p.quantity_default; });

  // PÉS (migration 014/120, position_role='leg'): S.H já inclui a altura do
  // pé. resolvePiecesForViewer (js/module-pieces.js) já é ciente disso e usa
  // Pricing.resolveBodyDims por dentro — as peças do CORPO saem com
  // offset_y_mm relativo ao CORPO (0 = piso do corpo, logo em cima dos pés),
  // igual placePieceInBox no viewer3d.js e projectSlotElevationHtml no
  // portal.js. Esta tela era a ÚNICA das quatro que não sabia disso: o casco
  // e a zona interna deduzida (zonaDoCasco) nasciam ~altura do pé mais baixo
  // do que deviam (Matt, 2026-08-18: "o interno ta deslocado pra baixo").
  let legH_mm = 0;
  try { legH_mm = Pricing.resolveBodyDims(efetivas, dims).legH_mm || 0; } catch (e) { /* sem pé, 0 */ }
  S.legH_mm = legH_mm;
  const bodyH = S.H - legH_mm;

  try {
    S.cascoParts = resolvePiecesForViewer(efetivas, dims, S.cores || {}, shelfQuantities) || [];
  } catch (e) {
    console.error('[construtor] casco', e);
    S.cascoParts = [];
  }
  try {
    // buildBoxes recebe a altura do CORPO (bodyH), o mesmo referencial que
    // resolvePiecesForViewer usou pros offsets — senão bounds.innerTopY (usa
    // H pra distribuir prateleira, ver drilling.js buildBoxes) sairia com uma
    // altura maior que a real do corpo. As caixas nascem em coordenadas do
    // CORPO; o +legH_mm abaixo converte pra coordenadas ABSOLUTAS do módulo
    // (o mesmo referencial de S.H usado em zonaDoCasco/render2D/render3D).
    // Peça 'leg' nunca aparece em cascoBoxes (pieceBox devolve null pra ela,
    // ver drilling.js), então somar legH_mm em todas é seguro.
    const built = Drilling._internals.buildBoxes(S.cascoParts, S.W, bodyH, S.D);
    S.cascoBoxes = (built.boxes || []).map(function (b) {
      return legH_mm ? Object.assign({}, b, { y0: b.y0 + legH_mm }) : b;
    });
  } catch (e) {
    console.error('[construtor] buildBoxes', e);
    S.cascoBoxes = [];
  }
};

/* A raiz da árvore. Fórmula explícita (modules.inner_*) ganha; sem ela,
   deduz do casco. Deduzir é palpite razoável pra abrir um módulo antigo — e
   é por isso que a tela mostra os dois valores lado a lado no rodapé. */
CST.zonaAtual = function () {
  const S = CST.S, m = S.modulo || {};
  const vars = { W: S.W, H: S.H, D: S.D };
  const temFormula = m.inner_w_formula || m.inner_h_formula || m.inner_d_formula;
  if (temFormula) {
    try {
      const ev = function (f, padrao) {
        if (!f) return padrao;
        const n = Pricing.evalFormula(f, vars);
        return isFinite(n) ? n : padrao;
      };
      const dedu = CST.zonaDoCasco();
      const z = {
        x: ev(m.inner_x_formula, dedu.x), y: ev(m.inner_y_formula, dedu.y), z: ev(m.inner_z_formula, dedu.z),
        w: Math.max(1, ev(m.inner_w_formula, dedu.w)),
        h: Math.max(1, ev(m.inner_h_formula, dedu.h)),
        d: Math.max(1, ev(m.inner_d_formula, dedu.d)),
        explicita: true, avisos: [],
        temFundo: dedu.temFundo
      };
      // A fórmula é a palavra final — mas se ELA colapsar o vão, o aviso é
      // ainda mais importante: aqui não dá pra culpar o cadastro do casco.
      if (z.w < CST.MIN_VAO || z.h < CST.MIN_VAO || z.d < CST.MIN_VAO) {
        z.avisos.push('A fórmula da zona interna deste módulo resulta em '
          + Math.round(z.w) + '×' + Math.round(z.h) + '×' + Math.round(z.d) + 'mm em '
          + S.W + '×' + S.H + '×' + S.D + ' — pequeno demais pra caber qualquer coisa. '
          + 'Corrija ou limpe as fórmulas no rodapé.');
      }
      return z;
    } catch (e) {
      console.error('[construtor] zona interna por fórmula', e);
    }
  }
  return CST.zonaDoCasco();
};

/* Desconta do volume do módulo as peças encostadas nas paredes. Usa as
   caixas do Drilling (e não width_mm cru) porque é splitThickness que sabe
   qual eixo de uma peça é a espessura — uma lateral cadastrada "deitada"
   quebraria a conta ingênua.
 *
 * DEDUZIR É PALPITE, E O PALPITE ERRA. O casco é cadastrado à mão, peça a
 * peça, e o "zero absoluto" (viewer3d.placePieceInBox) deixa left/right e
 * top/bottom com EXATAMENTE a mesma fórmula: quem diz que uma peça está na
 * direita é o offset_x_mm dela ("W-19"), não o papel. Então basta uma peça
 * de cima cadastrada como 'bottom', ou um fundo com a profundidade inteira
 * em vez da espessura, pra zona interna colapsar num fio de 1mm — e aí não
 * há vão pra clicar e nada cabe em lugar nenhum.
 *
 * Foi o que aconteceu no "Custom Wall Open" (Matt, 2026-08-10): a tela ficou
 * com todos os agregados "não cabe no vão" e sem vão clicável, sem dizer por
 * quê. Duas correções aqui:
 *   1. quando um eixo fica menor que um vão utilizável, ele volta pro módulo
 *      inteiro em vez de virar 1mm — a tela continua usável;
 *   2. o culpado de cada lado é registrado (`quem`) e vira um aviso na barra
 *      de cima, com o nome da peça. Palpite errado calado é pior que erro.
 * Nos dois casos a saída definitiva é a mesma: gravar a fórmula explícita da
 * zona interna (modules.inner_*), que é o que a 085 sempre quis. */
CST.zonaDoCasco = function () {
  const S = CST.S;
  let x0 = 0, y0 = 0, z0 = 0, x1 = S.W, y1 = S.H, z1 = S.D;
  const quem = {};
  const nomeDe = function (b) {
    return (b.part && (b.part.reference || b.part.module_name)) || b.role;
  };
  /* A FRENTE do vão é a frente da LATERAL, não a profundidade do módulo
     (2026-08-16). Sem isso, numa lateral recuada pra porta (prof. D-19.5,
     encostada em z=0) a divisória nascia com a mesma profundidade dela mas
     começando depois do fundo — mesmo número na listagem e sobrando na frente.
     Só left/right opinam: uma travessa de base rasa cadastrada como 'bottom'
     encolheria o vão inteiro sem motivo. */
  let frenteLateral = 0;
  (S.cascoBoxes || []).forEach(function (b) {
    if (b.role === 'left' && b.x0 + b.sx > x0) { x0 = b.x0 + b.sx; quem.esquerda = nomeDe(b); }
    else if (b.role === 'right' && b.x0 < x1) { x1 = b.x0; quem.direita = nomeDe(b); }
    else if (b.role === 'bottom' && b.y0 + b.sy > y0) { y0 = b.y0 + b.sy; quem.base = nomeDe(b); }
    else if (b.role === 'top' && b.y0 < y1) { y1 = b.y0; quem.topo = nomeDe(b); }
    else if (b.role === 'back' && b.z0 + b.sz > z0) { z0 = b.z0 + b.sz; quem.fundo = nomeDe(b); }
    if (b.role === 'left' || b.role === 'right') {
      const ez = b.z0 + b.sz;
      frenteLateral = (frenteLateral === 0) ? ez : Math.min(frenteLateral, ez);
      if (frenteLateral === ez) quem.frente = nomeDe(b);
    }
  });
  /* Piso de sanidade: lateral mal cadastrada não pode virar o vão num filete.
     Nesse caso a frente volta pra D, o comportamento anterior a esta regra. */
  if (frenteLateral > z0 + CST.MIN_VAO && frenteLateral >= S.D * CST.FRENTE_MIN_FRACAO_D) {
    z1 = frenteLateral;
  } else {
    delete quem.frente;
  }

  const avisos = [];
  // Um vão precisa de espaço pra existir. Abaixo de MIN_VAO a dedução não
  // produziu uma zona: produziu um defeito. Melhor abrir o módulo inteiro e
  // dizer o que houve do que entregar uma tela travada.
  const confere = function (ini, fim, total, eixo, ladoBaixo, ladoAlto) {
    if (fim - ini >= CST.MIN_VAO) return [ini, fim];
    const culpados = [quem[ladoBaixo], quem[ladoAlto]].filter(Boolean).join(' / ') || 'nenhuma peça';
    avisos.push('Zona interna sem ' + eixo + ' utilizável (' + Math.round(fim - ini) + 'mm) — '
      + 'as peças de casco (' + culpados + ') não delimitam um espaço interno neste eixo. '
      + 'Usando o módulo inteiro por enquanto: confira o deslocamento dessas peças no cadastro, '
      + 'ou grave a fórmula da zona interna aqui embaixo.');
    return [0, total];
  };

  const ex = confere(x0, x1, S.W, 'largura', 'esquerda', 'direita');
  const ey = confere(y0, y1, S.H, 'altura', 'base', 'topo');
  const ez = confere(z0, z1, S.D, 'profundidade', 'fundo', 'frente');

  return {
    x: Math.round(ex[0]), y: Math.round(ey[0]), z: Math.round(ez[0]),
    w: Math.max(1, Math.round(ex[1] - ex[0])),
    h: Math.max(1, Math.round(ey[1] - ey[0])),
    /* O -1mm sai NA FRENTE (o fundo fica alinhado), mesma escolha do
       emitDivider. Piso em 1 pra nunca devolver profundidade <= 0 num módulo
       raso. */
    d: Math.max(1, Math.round(ez[1] - ez[0]) - CST.RECUO_FRENTE_INTERNO_MM),
    avisos: avisos,
    quem: quem,
    // Espelha portal.js computeProjectSlotInnerZone (2026-08-19): sinaliza
    // pra LayoutEngine.build (opts.temFundo) que um fundo de verdade foi
    // achado e descontado do vão — o caixote (gaveta/gaveteiro/cesto) então
    // ganha a folga extra de FOLGA_FUNDO_CAIXOTE_MM em vez de sair encostado.
    // ez[0] (não quem.fundo direto) porque `confere` pode ter revertido o
    // eixo Z pra [0, S.D] quando a dedução deu profundidade menor que
    // MIN_VAO — nesse caso quem.fundo ainda estaria marcado, mas a zona
    // final NÃO excluiu fundo nenhum de verdade.
    temFundo: ez[0] > 0
  };
};

/* ============================================================
   Ciclo de vida da edição
   ============================================================ */
CST.selNode = function () {
  const S = CST.S;
  return S.sel ? LayoutEngine.findNode(S.root, S.sel) : null;
};

CST.snapshot = function () {
  const S = CST.S;
  S.history.push(JSON.stringify(LayoutEngine.serialize(S.root)));
  if (S.history.length > 60) S.history.shift();
};

CST.undo = function () {
  const S = CST.S;
  const j = S.history.pop();
  if (!j) { CST.hint('Nada para desfazer'); return; }
  S.root = LayoutEngine.deserialize(JSON.parse(j));
  if (!LayoutEngine.findNode(S.root, S.sel)) S.sel = null;
  CST.marcarSujo();
  CST.rebuild();
};

CST.marcarSujo = function () {
  const S = CST.S;
  if (S.dirty) return;
  S.dirty = true;
  const b = document.getElementById('cst-salvar');
  if (b) b.textContent = 'Salvar layout •';
};

CST.rebuild = function () {
  const S = CST.S;
  S.zona = CST.zonaAtual();
  S.built = LayoutEngine.build(S.root, S.zona, {
    catalogo: S.cat, espessura: CST.ESPESSURA, folgaDobradica: CST.FOLGA_DOBRADICA,
    temFundo: !!S.zona.temFundo
  });
  const lim = CONSTR.limitesDoCatalogo(S.cat);
  S.limitesCadastrados = lim.cadastrado;
  S.problemas = LayoutEngine.validar(S.built.pieces, {
    chapa: S.chapa, maquina: S.maq, porPeca: lim.porPeca
  });
  // O CASCO passa pela MESMA validação. Antes só as peças da árvore eram
  // conferidas, e o casco — que é onde mora o fundo — passava batido: dava
  // pra pedir 1860 × 2340 e nada reclamava, mesmo com o fundo não cabendo na
  // chapa em sentido nenhum.
  //
  // É a regra que o Matt descreveu ("passando de 1,2m trava o outro sentido")
  // e que já estava escrita no motor como veio 'livre'. Rodar a mesma função
  // nos dois é o que garante que casco e interior nunca divirjam.
  S.problemas = S.problemas.concat(CST.validarCasco());
  CST.render2D();
  CST.render3D();
  CST.renderLib();
  CST.renderProps();
  CST.renderTree();
  CST.renderResumo();
  CST.renderErros();
};

/* Valida as peças do CASCO contra a chapa e a furadeira, com a mesma função
 * que valida as peças da árvore (LayoutEngine.validar).
 *
 * O caso que motivou: um módulo 1860 × 2340 com fundo. O fundo é 1820 × 2300,
 * e a chapa é 1200 × 2750 — ele não cabe em sentido NENHUM (o lado curto,
 * 1820, já passa dos 1200 de largura da chapa). Era pra ser impossível de
 * vender, e o Construtor deixava passar calado.
 *
 * A regra não é um número cravado aqui: sai do veio 'livre' do componente
 * (migration 086) contra o tamanho de chapa da barra de cima — que um dia vem
 * da cor (migration 063). Trocou o material, a regra anda junto.
 *
 * Monta um `porPeca` na hora, uma entrada por peça de casco, porque cada uma
 * tem seu próprio veio e seu próprio "leva furo" — a lateral fura, o fundo
 * não. */
CST.validarCasco = function () {
  const S = CST.S;
  const pecas = [];
  const porPeca = {};
  (S.cascoBoxes || []).forEach(function (b, i) {
    const part = b.part || {};
    const chave = 'casco:' + i;
    // VEIO LIVRE VAI NO PLANO DA MÁQUINA; VEIO EXIGIDO VAI COMO ESTÁ.
    //
    // LayoutEngine.validar calcula o lado curto como min(w, h), assumindo que
    // a espessura é sempre `d`. Vale nas peças que a árvore gera, mas não no
    // casco: numa lateral 20 × H × D, min(w,h) daria 20 — o lado curto REAL é
    // a profundidade, e uma lateral grande demais passaria batido. Pra veio
    // livre a saída é entregar comprimento/largura/espessura já resolvidos.
    //
    // Só que isso QUEBRA o veio exigido, e o teste pegou: numa porta 700 ×
    // 2000 com veio vertical, o motor confere a LARGURA contra a largura da
    // chapa — e ele precisa saber qual eixo é a largura, não qual é o maior.
    // Trocando pelo plano da máquina, os 2000 viravam "largura" e a porta era
    // reprovada por engano.
    //
    // Daí a distinção: livre não liga pra orientação (quer o lado curto),
    // exigido liga (quer o eixo certo).
    const veio = part.veio || 'livre';
    const m = Pricing.pecaNaMaquina(b.sx, b.sy, b.sz, part.positioning);
    const usaMaquina = veio === 'livre';
    pecas.push({
      accKey: chave,
      label: part.reference || part.module_name || b.role,
      w: usaMaquina ? m.comprimento : b.sx,
      h: usaMaquina ? m.largura : b.sy,
      d: usaMaquina ? m.espessura : b.sz,
      nodeId: null
    });
    porPeca[chave] = {
      veio: veio,
      fura: part.fura !== false,
      // Limite do LADO (migration 090) — vale pro comprimento e pra largura,
      // nunca pra espessura. Como as medidas acima já vêm no plano da
      // máquina, mapear em maxW/maxH acerta os dois de uma vez.
      minW: part.lado_min_mm || undefined, maxW: part.lado_max_mm || undefined,
      minH: part.lado_min_mm || undefined, maxH: part.lado_max_mm || undefined
    };
  });
  if (!pecas.length) return [];
  return LayoutEngine.validar(pecas, {
    chapa: S.chapa, maquina: S.maq, porPeca: porPeca
  }).map(function (p) {
    // Marca a origem: sem isso o usuário lê "Fundo: 1820×2300 não cabe" e vai
    // procurar no desenho da árvore, onde o fundo não está.
    p.msg = 'Casco — ' + p.msg;
    return p;
  });
};

CST.select = function (id) {
  CST.S.sel = id;
  CST.render2D();
  CST.render3D();
  CST.renderLib();
  CST.renderProps();
  CST.renderTree();
};

CST.autoSelect = function () {
  const livres = (CST.S.built.voids || []).filter(function (v) { return !v.occupied; });
  if (livres.length) CST.select(livres[0].nodeId);
};

CST.hint = function (html) {
  const e = document.getElementById('cst-hint');
  if (e) e.innerHTML = html;
};

/* ============================================================
   Inserir / remover
   ============================================================ */
CST.cabe = function (acc, box) {
  return LayoutEngine.cabeNoVao(acc, box, CST.S.opcoes[acc.id]);
};

CST.insert = function (accId) {
  const S = CST.S, n = CST.selNode(), acc = S.cat[accId];
  if (!n || !acc) return;
  CST.snapshot();
  if (acc.role === 'split') LayoutEngine.applySplit(n, accId, (acc.params || {}).quantidade || 1, S.cat);
  if (acc.role === 'content') LayoutEngine.applyContent(n, accId, S.cat);
  if (acc.role === 'front') LayoutEngine.applyFront(n, accId, null, null, S.cat);
  CST.marcarSujo();
  CST.rebuild();
  CST.hint('<b>' + UI.esc(acc.name) + '</b> inserido — ajuste os detalhes no painel da direita');
};

CST.esvaziarVao = function () {
  const n = CST.selNode();
  if (!n) return;
  CST.snapshot();
  LayoutEngine.clearAll(n);
  CST.marcarSujo();
  CST.rebuild();
  CST.hint('Vão esvaziado');
};

/* ============================================================
   Biblioteca (coluna da esquerda)
   ============================================================
   Dois cliques diferentes no mesmo item, de propósito:
     no NOME    insere no vão selecionado (uso de engenharia)
     no VISTO   liga/desliga o agregado na whitelist do módulo — ou seja,
                decide se o CLIENTE pode acrescentar isso no portal.
   Juntar as duas coisas na mesma linha é o que deixa óbvio que são a mesma
   biblioteca vista de dois lados. */
CST.renderLib = function () {
  const S = CST.S, n = CST.selNode(), box = n && n._box;
  const grupos = {};
  Object.keys(S.cat).forEach(function (k) {
    const a = S.cat[k];
    if (!a.active) return;
    (grupos[a.group] = grupos[a.group] || []).push(a);
  });

  let html = '';
  Object.keys(grupos).forEach(function (g) {
    html += '<div class="cst-group"><span>' + UI.esc(g) + '</span>';
    grupos[g].forEach(function (a) {
      const semComp = !a.componente && !a.child_module_id;
      const ok = !!box && !semComp && CST.cabe(a, box);
      const motivo = semComp ? 'sem componente vinculado'
        : !box ? 'selecione um vão'
          : !ok ? 'não cabe no vão' : (a.sub || 'inserir aqui');
      const o = S.opcoes[a.id];
      const perm = o && o.allowed;
      html += '<div class="cst-item' + (ok ? '' : ' off') + '" title="' + UI.esc(motivo) + '">'
        + '<span class="ic">' + UI.esc(a.icon) + '</span>'
        + '<span class="nm" data-acc="' + a.id + '" style="flex:1;cursor:pointer">'
        + UI.esc(a.name) + '<em>' + UI.esc(motivo) + '</em></span>'
        + '<button class="erp-btn-ghost erp-btn-sm" data-wl="' + a.id + '" style="pointer-events:auto"'
        + ' title="' + (perm ? 'O cliente pode acrescentar isto no portal' : 'Não é oferecido ao cliente')
        + '">' + (perm ? '✓' : '○') + '</button>'
        + '</div>';
    });
    html += '</div>';
  });

  const lib = document.getElementById('cst-lib');
  if (!lib) return;
  lib.innerHTML = html || '<div class="cst-empty">Nenhum agregado ativo no catálogo.</div>';
  lib.querySelectorAll('[data-acc]').forEach(function (e) {
    e.onclick = function () { CST.insert(e.dataset.acc); };
  });
  // O botão do visto fica DENTRO de um .cst-item que pode estar .off
  // (pointer-events:none). O style inline acima devolve o clique só a ele:
  // não poder inserir num vão de 200mm não tem nada a ver com poder liberar
  // o agregado pro portal.
  lib.querySelectorAll('[data-wl]').forEach(function (e) {
    e.onclick = function (ev) {
      ev.stopPropagation();
      const id = e.dataset.wl;
      const atual = S.opcoes[id] || { accessory_type_id: id, allowed: false, client_visible: true };
      atual.allowed = !atual.allowed;
      S.opcoes[id] = atual;
      CST.marcarSujo();
      CST.renderLib();
    };
  });
};

/* ============================================================
   Vista 2D frontal — é aqui que se edita
   ============================================================
   SVG com viewBox em MILÍMETROS: toda coordenada do motor entra direto, sem
   escala intermediária pra errar. O único ajuste é o eixo Y (no motor cresce
   pra cima, no SVG pra baixo) -> sy(). */
CST.SVGNS = 'http://www.w3.org/2000/svg';
CST.el = function (tag, attrs, parent) {
  const e = document.createElementNS(CST.SVGNS, tag);
  for (const k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

CST.render2D = function () {
  const S = CST.S, svg = document.getElementById('cst-svg');
  if (!svg || !S.built) return;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const W = S.W, H = S.H, b = S.built;
  // Margens PROPORCIONAIS ao módulo, não fixas em mm: 190mm de margem é
  // confortável num roupeiro de 2100 e engole um gaveteiro de 600.
  const K = Math.max(W, H);
  const fs = K / 46, sw = K / 620;
  const mL = K * 0.155, mR = K * 0.075, mT = K * 0.06, mB = K * 0.10;
  svg.setAttribute('viewBox', (-mL) + ' ' + (-mT) + ' ' + (W + mL + mR) + ' ' + (H + mT + mB));
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const sy = function (y, h) { return H - y - (h || 0); };

  const ruins = {};
  (S.problemas || []).forEach(function (p) { ruins[p.peca] = true; });

  // ---- casco (module_components), em cinza: contexto, não é editável aqui
  const gC = CST.el('g', {}, svg);
  // PÉ (position_role='leg', migration 014/120): a peça do pé em si nunca
  // aparece em S.cascoBoxes (Drilling.pieceBox devolve null pra ela de
  // propósito — ver drilling.js — ela não participa do contato borda-face).
  // Isso é o motivo do "interno deslocado pra baixo": no Toe 4½ (recorte em L
  // na lateral) o vão de baixo é DESENHADO — a lateral cobre 0..900 inteiro,
  // então o degrau do toe-kick aparece como cinza de verdade. No pé, as
  // peças não-leg são resolvidas contra o CORPO (0..900, ver
  // resolvePiecesForViewer/resolveBodyDims) e só DEPOIS deslocadas +legH_mm —
  // então a faixa 0..legH_mm nunca tem NADA desenhado, fica igual ao fundo da
  // página, e o vão parece colado no chão mesmo estando matematicamente no
  // lugar certo (Matt, 2026-08-18: "e exatamente igual a esse, que ta
  // funcionando", comparando com o Toe 4½). Sem isso o número bate mas o
  // olho não vê onde o pé está.
  if (S.legH_mm) {
    CST.el('rect', {
      x: 0, y: sy(0, S.legH_mm), width: Math.max(W, 1), height: Math.max(S.legH_mm, 1),
      fill: '#ded5c6', stroke: '#3d4650', 'stroke-width': sw * 1.5,
      'stroke-dasharray': (sw * 4) + ' ' + (sw * 3), 'pointer-events': 'none'
    }, gC);
  }
  (S.cascoBoxes || []).slice().sort(function (a, c) { return a.z0 - c.z0; }).forEach(function (bx) {
    const fundo = bx.role === 'back';
    CST.el('rect', {
      x: bx.x0, y: sy(bx.y0, bx.sy), width: Math.max(bx.sx, 1), height: Math.max(bx.sy, 1),
      fill: fundo ? '#efe9de' : '#ded5c6', stroke: fundo ? '#c9c0b0' : '#3d4650',
      'stroke-width': fundo ? sw : sw * 1.5, 'pointer-events': 'none'
    }, gC);
  });

  // ORDEM IMPORTA — em SVG quem é criado depois fica por cima, inclusive pro
  // clique. Os VÃOS vêm antes das peças: clicar numa gaveta/porta pega a
  // PEÇA (e seleciona o vão dono dela), e clicar no vazio pega o vão.
  const gV = CST.el('g', {}, svg);
  const gP = CST.el('g', {}, svg);

  // ---- peças geradas pela árvore
  b.pieces.slice().sort(function (a, c) { return a.z - c.z; }).forEach(function (p) {
    const porta = p.kind === 'front';
    if (porta && !S.showPortas) return;
    if (p.shape_type === 'oval_rod') {
      CST.el('line', {
        x1: p.x, y1: sy(p.y + p.h / 2), x2: p.x + p.w, y2: sy(p.y + p.h / 2),
        stroke: '#59636d', 'stroke-width': sw * 3.2, 'stroke-linecap': 'round', 'pointer-events': 'none'
      }, gP);
      return;
    }
    const erro = !!ruins[p.label];
    const r = CST.el('rect', {
      x: p.x, y: sy(p.y, p.h), width: p.w, height: p.h,
      fill: erro ? '#e8564f' : (porta ? (p.embutida ? '#7a56b8' : '#2f6fb8') : '#c49a63'),
      'fill-opacity': erro ? 0.55 : (porta ? 0.10 : 0.92),
      stroke: erro ? '#a8231d' : (porta ? (p.embutida ? '#7a56b8' : '#2f6fb8') : '#3d4650'),
      'stroke-width': erro ? sw * 2.6 : (porta ? sw * 1.6 : sw),
      'stroke-dasharray': (porta && !erro) ? (sw * 7) + ' ' + (sw * 5) : 'none'
    }, gP);
    if (S.showVeio && !porta) CST.desenhaVeio(gP, p, sy, sw, '#00000028');
    // TODA peça é clicável e seleciona o vão dono dela — porta, gaveta, ripa,
    // prateleira. Sem isso o conteúdo vira peça-fantasma: aparece no desenho
    // mas não dá pra selecionar nem apagar.
    r.style.cursor = 'pointer';
    r.addEventListener('click', function (ev) {
      ev.stopPropagation();
      CST.select(p.nodeId);
      CST.openCtx(ev.clientX, ev.clientY);
    });
  });

  // ---- vãos: alvo do clique
  b.voids.forEach(function (v) {
    const r = CST.el('rect', {
      x: v.box.x, y: sy(v.box.y, v.box.h), width: v.box.w, height: v.box.h, class: 'cst-hit'
    }, gV);
    r.dataset.node = v.nodeId;
    const n = LayoutEngine.findNode(S.root, v.nodeId);
    if (n && n.content && S.cat[n.content.acc] && v.box.h > fs * 2.4 && v.box.w > fs * 4) {
      CST.el('text', {
        x: v.box.x + v.box.w / 2, y: sy(v.box.y + v.box.h / 2) + fs * 0.36,
        'text-anchor': 'middle', 'font-size': fs * 0.8, fill: '#5b6672',
        'font-family': 'sans-serif', 'pointer-events': 'none'
      }, gV).textContent = S.cat[n.content.acc].name;
    }
  });

  // ---- seleção + cotas
  const nSel = CST.selNode();
  if (nSel && nSel._box) {
    const x = nSel._box;
    CST.el('rect', {
      x: x.x, y: sy(x.y, x.h), width: x.w, height: x.h,
      fill: '#e0921f', 'fill-opacity': 0.17, stroke: '#e0921f',
      'stroke-width': sw * 3.4, 'pointer-events': 'none'
    }, svg);
    CST.dimH(svg, x.x, x.x + x.w, sy(x.y) + fs * 1.5, Math.round(x.w), fs, sw, '#e0921f');
    CST.dimV(svg, sy(x.y + x.h), sy(x.y), x.x + x.w + fs * 1.3, Math.round(x.h), fs, sw, '#e0921f');
  }
  CST.dimH(svg, 0, W, H + mB * 0.55, W, fs, sw, '#5b6672');
  CST.dimV(svg, 0, H, -mL * 0.62, H, fs, sw, '#5b6672');

  // cadeia de cotas dos filhos do vão selecionado (como no Promob)
  if (nSel && nSel.splitAxis && nSel.children.length > 1) {
    nSel.children.forEach(function (k) {
      const kb = k._box;
      if (!kb) return;
      if (nSel.splitAxis === 'y') CST.dimV(svg, sy(kb.y + kb.h), sy(kb.y), -mL * 0.24, Math.round(kb.h), fs * 0.82, sw, '#2f6fb8');
      else CST.dimH(svg, kb.x, kb.x + kb.w, -mT * 0.42, Math.round(kb.w), fs * 0.82, sw, '#2f6fb8');
    });
  }

  gV.querySelectorAll('rect[data-node]').forEach(function (r) {
    r.addEventListener('click', function (ev) {
      ev.stopPropagation();
      CST.select(r.dataset.node);
      CST.openCtx(ev.clientX, ev.clientY);
    });
  });

  // ---- pegadores das divisórias (arrastar pra mover)
  // Por último, pra ficarem por cima. A área de pega é bem maior que a peça:
  // uma prateleira de 18mm é impossível de acertar no mouse.
  const gH = CST.el('g', {}, svg);
  b.pieces.filter(function (p) { return p.divIndex !== undefined; }).forEach(function (p) {
    const pai = LayoutEngine.findNode(S.root, p.nodeId);
    if (!pai) return;
    const vert = pai.splitAxis === 'x';
    const folga = Math.max(K / 150, 14);
    const g = CST.el('rect', {
      x: vert ? p.x - folga / 2 : p.x,
      y: vert ? sy(p.y, p.h) : sy(p.y, p.h) - folga / 2,
      width: vert ? p.w + folga : p.w,
      height: vert ? p.h : p.h + folga,
      fill: 'transparent'
    }, gH);
    g.style.cursor = vert ? 'ew-resize' : 'ns-resize';
    g.addEventListener('pointerdown', function (ev) { CST.startDragDiv(ev, pai, p.divIndex, vert ? 'x' : 'y'); });
  });
};

/* Mover a divisória = cravar o tamanho dos DOIS vãos vizinhos ('fixed'),
   PRESERVANDO A SOMA deles. Preservar a soma é o que mantém o arrasto local:
   os outros irmãos não se mexem, e os que estavam em 'fill' continuam
   rateando exatamente o mesmo espaço de antes. */
CST.clientToMm = function (ev) {
  const svg = document.getElementById('cst-svg');
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const p = pt.matrixTransform(svg.getScreenCTM().inverse());
  return { x: p.x, y: CST.S.H - p.y };
};

CST.startDragDiv = function (ev, node, idx, eixo) {
  const S = CST.S;
  ev.preventDefault(); ev.stopPropagation();
  CST.closeCtx();
  CST.select(node.id);
  CST.snapshot();
  S.drag = { nodeId: node.id, idx: idx };

  const kids = node.children;
  if (!kids[idx] || !kids[idx]._box || !kids[idx + 1] || !kids[idx + 1]._box) return;
  const ini = eixo === 'x' ? kids[idx]._box.x : kids[idx]._box.y;
  const soma = (eixo === 'x' ? kids[idx]._box.w : kids[idx]._box.h)
    + (eixo === 'x' ? kids[idx + 1]._box.w : kids[idx + 1]._box.h);

  const mover = function (e) {
    const m = CST.clientToMm(e);
    let novo = (eixo === 'x' ? m.x : m.y) - ini;
    novo = Math.round(novo / S.passo) * S.passo;
    novo = Math.max(CST.MIN_VAO, Math.min(soma - CST.MIN_VAO, novo));
    kids[idx].sizeMode = 'fixed'; kids[idx].sizeValue = novo;
    kids[idx + 1].sizeMode = 'fixed'; kids[idx + 1].sizeValue = soma - novo;
    // Só o 2D durante o arrasto — reconstruir a cena 3D a cada pixel trava.
    S.built = LayoutEngine.build(S.root, S.zona, {
      catalogo: S.cat, espessura: CST.ESPESSURA, folgaDobradica: CST.FOLGA_DOBRADICA,
      temFundo: !!S.zona.temFundo
    });
    CST.render2D();
    CST.hint('Arrastando: <b>' + novo + ' mm</b> / ' + (soma - novo) + ' mm — passo de ' + S.passo + ' mm');
  };
  const soltar = function () {
    removeEventListener('pointermove', mover);
    removeEventListener('pointerup', soltar);
    S.drag = null;
    CST.marcarSujo();
    CST.rebuild();   // agora sim 3D, árvore, avisos
  };
  addEventListener('pointermove', mover);
  addEventListener('pointerup', soltar);
};

/* Hachura do veio: linhas no sentido da fibra. É a leitura mais rápida de
   "esse fundo virou" quando o módulo cresce. p.veio é escrito por
   LayoutEngine.validar — sem limites cadastrados (migration 086) ele fica
   nulo e a hachura simplesmente não aparece. */
CST.desenhaVeio = function (g, p, sy, sw, cor) {
  if (!p.veio) return;
  const passo = Math.max(28, Math.min(p.w, p.h) / 9);
  const a = { stroke: cor, 'stroke-width': sw * 0.8, 'pointer-events': 'none' };
  if (p.veio === 'horizontal') {
    for (let y = p.y + passo; y < p.y + p.h; y += passo) {
      CST.el('line', Object.assign({ x1: p.x + 2, y1: sy(y), x2: p.x + p.w - 2, y2: sy(y) }, a), g);
    }
  } else {
    for (let x = p.x + passo; x < p.x + p.w; x += passo) {
      CST.el('line', Object.assign({ x1: x, y1: sy(p.y + p.h) + 2, x2: x, y2: sy(p.y) - 2 }, a), g);
    }
  }
};

CST.dimH = function (svg, x1, x2, y, label, fs, sw, cor) {
  const g = CST.el('g', { 'pointer-events': 'none' }, svg);
  const a = { stroke: cor, 'stroke-width': sw * 0.9 };
  CST.el('line', Object.assign({ x1: x1, y1: y, x2: x2, y2: y }, a), g);
  CST.el('line', Object.assign({ x1: x1, y1: y - fs * 0.42, x2: x1, y2: y + fs * 0.42 }, a), g);
  CST.el('line', Object.assign({ x1: x2, y1: y - fs * 0.42, x2: x2, y2: y + fs * 0.42 }, a), g);
  CST.el('text', {
    x: (x1 + x2) / 2, y: y - fs * 0.42, 'text-anchor': 'middle',
    'font-size': fs, fill: cor, 'font-family': 'sans-serif'
  }, g).textContent = label;
};

CST.dimV = function (svg, y1, y2, x, label, fs, sw, cor) {
  const g = CST.el('g', { 'pointer-events': 'none' }, svg);
  const a = { stroke: cor, 'stroke-width': sw * 0.9 };
  CST.el('line', Object.assign({ x1: x, y1: y1, x2: x, y2: y2 }, a), g);
  CST.el('line', Object.assign({ x1: x - fs * 0.42, y1: y1, x2: x + fs * 0.42, y2: y1 }, a), g);
  CST.el('line', Object.assign({ x1: x - fs * 0.42, y1: y2, x2: x + fs * 0.42, y2: y2 }, a), g);
  const t = CST.el('text', {
    x: x, y: (y1 + y2) / 2, 'text-anchor': 'middle', 'font-size': fs,
    fill: cor, 'font-family': 'sans-serif',
    transform: 'rotate(-90 ' + x + ' ' + ((y1 + y2) / 2) + ')'
  }, g);
  t.textContent = label;
};

/* ============================================================
   Menu que abre no vão — o fluxo principal: clicou, escolhe ali
   ============================================================ */
CST.openCtx = function (clientX, clientY) {
  const S = CST.S, n = CST.selNode(), ctx = document.getElementById('cst-ctx');
  if (!ctx) return;
  if (!n || !n._box) { CST.closeCtx(); return; }
  const b = n._box;
  document.getElementById('cst-ctx-dim').textContent =
    Math.round(b.w) + ' × ' + Math.round(b.h) + ' × ' + Math.round(b.d) + ' mm';

  let h = '';
  [['Dividir o vão', 'split'], ['Colocar dentro', 'content'], ['Fechar a frente', 'front']]
    .forEach(function (par) {
      const lista = Object.keys(S.cat).map(function (k) { return S.cat[k]; })
        .filter(function (a) {
          return a.active && a.role === par[1] && (a.componente || a.child_module_id) && CST.cabe(a, b);
        });
      if (!lista.length) return;
      h += '<div class="cst-ctx-g"><span>' + par[0] + '</span>';
      lista.forEach(function (a) {
        h += '<div class="cst-ctx-i" data-acc="' + a.id + '"><span class="ic">' + UI.esc(a.icon) + '</span>'
          + '<span class="nm">' + UI.esc(a.name) + '<em>' + UI.esc(a.sub) + '</em></span></div>';
      });
      h += '</div>';
    });

  const rms = [];
  if (n.splitAcc && S.cat[n.splitAcc]) rms.push(['split', 'Tirar ' + S.cat[n.splitAcc].name.toLowerCase()]);
  if (n.content && S.cat[n.content.acc]) rms.push(['content', 'Tirar ' + S.cat[n.content.acc].name.toLowerCase()]);
  if (n.fronts && n.fronts.length) {
    rms.push(['front', n.fronts.length > 1
      ? 'Tirar as ' + n.fronts.length + ' frentes'
      : 'Tirar ' + ((S.cat[n.fronts[0].acc] || {}).name || 'frente').toLowerCase()]);
  }
  if (rms.length) {
    h += '<div class="cst-ctx-g"><span>Remover</span>';
    rms.forEach(function (r) {
      h += '<div class="cst-ctx-i rm" data-clear="' + r[0] + '"><span class="ic">✕</span>'
        + '<span class="nm">' + UI.esc(r[1]) + '</span></div>';
    });
    h += '</div>';
  }
  if (!h) {
    h = '<div class="cst-ctx-none">Nada cabe num vão de ' + Math.round(b.w) + '×' + Math.round(b.h)
      + '×' + Math.round(b.d) + ' mm.<br>Aumente o módulo nos controles acima do desenho, ou reveja o '
      + 'vão mínimo do agregado em Engenharia → Agregados do construtor.</div>';
  }
  document.getElementById('cst-ctx-b').innerHTML = h;

  ctx.querySelectorAll('[data-acc]').forEach(function (e) {
    e.onclick = function () { CST.insert(e.dataset.acc); CST.closeCtx(); };
  });
  ctx.querySelectorAll('[data-clear]').forEach(function (e) {
    e.onclick = function () {
      CST.snapshot();
      LayoutEngine.clearNode(n, e.dataset.clear);
      CST.marcarSujo();
      CST.rebuild();
      CST.closeCtx();
    };
  });

  const r = document.getElementById('cst-stage').getBoundingClientRect();
  ctx.hidden = false;
  let x = clientX - r.left + 14, y = clientY - r.top + 6;
  if (x + ctx.offsetWidth > r.width - 8) x = clientX - r.left - ctx.offsetWidth - 14;
  if (y + ctx.offsetHeight > r.height - 8) y = Math.max(8, r.height - ctx.offsetHeight - 8);
  ctx.style.left = Math.max(8, x) + 'px';
  ctx.style.top = Math.max(8, y) + 'px';
};

CST.closeCtx = function () {
  const c = document.getElementById('cst-ctx');
  if (c) c.hidden = true;
};

/* ============================================================
   Propriedades (coluna da direita)
   ============================================================ */
CST.campoNum = function (label, val, key, min, max) {
  return '<div class="cst-field"><span>' + label + '</span>'
    + '<input type="number" data-num="' + key + '" value="' + val + '" min="' + min + '" max="' + max + '"></div>';
};

CST.renderProps = function () {
  const S = CST.S, alvo = document.getElementById('cst-props');
  if (!alvo) return;
  const n = CST.selNode();
  if (!n) {
    alvo.innerHTML = '<h3 style="margin:0 0 8px;font-size:10px;letter-spacing:.13em;'
      + 'text-transform:uppercase;color:#8a8378">Propriedades</h3>'
      + '<div class="cst-empty">Clique num vão no desenho.</div>';
    return;
  }
  const b = n._box || { w: 0, h: 0, d: 0, x: 0, y: 0, z: 0 };
  const tit = function (t) {
    return '<h3 style="margin:12px 0 7px;font-size:10px;letter-spacing:.13em;'
      + 'text-transform:uppercase;color:#a8792c">' + t + '</h3>';
  };

  let h = '<h3 style="margin:0 0 8px;font-size:10px;letter-spacing:.13em;'
    + 'text-transform:uppercase;color:#8a8378">Vão selecionado</h3>';
  h += '<div style="margin-bottom:9px">'
    + '<span class="cst-chip">L ' + Math.round(b.w) + '</span>'
    + '<span class="cst-chip">A ' + Math.round(b.h) + '</span>'
    + '<span class="cst-chip">P ' + Math.round(b.d) + '</span>'
    + '<span class="cst-chip">x' + Math.round(b.x) + ' y' + Math.round(b.y) + ' z' + Math.round(b.z) + '</span>'
    + (n.locked ? '<span class="cst-chip lock">travado</span>' : '') + '</div>';

  const temAlgo = n.splitAcc || n.content || (n.fronts && n.fronts.length);
  if (temAlgo) {
    h += '<button class="erp-btn-secondary erp-btn-sm" data-wipe="1" style="width:100%;margin-bottom:10px">'
      + '✕ Esvaziar este vão <span style="opacity:.6">(Del)</span></button>';
  }

  if (n.splitAcc && S.cat[n.splitAcc]) {
    const acc = S.cat[n.splitAcc];
    h += tit('Divisão · ' + UI.esc(acc.name));
    h += CST.campoNum('Quantidade', Math.max(0, n.children.length - 1), 'qtd', 1, 12);
    if ((acc.params || {}).angulo_deg != null) {
      h += CST.campoNum('Ângulo (°)', Number(n.params.angulo_deg != null ? n.params.angulo_deg : acc.params.angulo_deg), 'angulo', 0, 45);
    }
    if (acc.axis === 'y') {
      const rec = n.params.recuo_mm != null ? n.params.recuo_mm : ((acc.params || {}).recuo_mm || 0);
      h += CST.campoNum('Recuo do fundo (mm)', Number(rec), 'recuo', 0, 300);
    }
    h += '<div style="margin:9px 0 5px;font-size:11px;color:#8a8378">'
      + (acc.axis === 'y' ? 'Altura de cada faixa (mm)' : 'Largura de cada coluna (mm)') + '</div>';
    n.children.forEach(function (k, i) {
      const v = Math.round(k._box ? (acc.axis === 'y' ? k._box.h : k._box.w) : 0);
      h += '<div class="cst-field"><span>' + (i + 1) + 'º'
        + (k.sizeMode === 'fixed' ? ' · fixo' : ' · auto') + '</span>'
        + '<input type="number" data-kid="' + i + '" value="' + v + '" min="' + CST.MIN_VAO + '" max="4000"></div>';
    });
    if (n.children.some(function (k) { return k.sizeMode === 'fixed'; })) {
      h += '<button class="erp-btn-ghost erp-btn-sm" data-auto="1">Voltar ao automático</button> ';
    }
    h += '<button class="erp-btn-ghost erp-btn-sm" data-clear="split">Remover divisão</button>';
  }

  if (n.content && S.cat[n.content.acc]) {
    const acc = S.cat[n.content.acc];
    const p = acc.params || {};
    h += tit('Conteúdo · ' + UI.esc(acc.name));
    const cp = n.content.params || {};
    // Os campos saem das CHAVES de default_params — não existe lista fixa no
    // código de propósito (é o que a 085 combinou): agregado novo com
    // parâmetro novo ganha campo sozinho, sem migration e sem tocar aqui.
    if ('quantidade' in p) h += CST.campoNum('Quantidade', Number(cp.quantidade != null ? cp.quantidade : p.quantidade), 'cqtd', 1, 8);
    if ('recuo_mm' in p) h += CST.campoNum('Afastamento (mm)', Number(cp.recuo_mm != null ? cp.recuo_mm : p.recuo_mm), 'crecuo', 0, 400);
    if ('altura_do_topo_mm' in p) h += CST.campoNum('Abaixo do topo (mm)', Number(cp.altura_do_topo_mm != null ? cp.altura_do_topo_mm : p.altura_do_topo_mm), 'ctopo', 20, 400);
    if ('passo_mm' in p) h += CST.campoNum('Passo das ripas (mm)', Number(cp.passo_mm != null ? cp.passo_mm : p.passo_mm), 'cpasso', 30, 200);
    h += '<button class="erp-btn-ghost erp-btn-sm" data-clear="content">Remover conteúdo</button>';
  }

  (n.fronts || []).forEach(function (f, fi) {
    const acc = S.cat[f.acc];
    if (!acc) return;
    const abr = f.from == null ? 'vão inteiro'
      : (f.from === f.to ? 'vão ' + (f.from + 1) : 'vãos ' + (f.from + 1) + '–' + (f.to + 1));
    h += tit('Frente · ' + UI.esc(acc.name)
      + ' <span style="color:#8a8378;text-transform:none;letter-spacing:0">(' + abr + ')</span>');
    // Sobreposta x embutida: embutida recua os internos (espessura + folga da
    // dobradiça) — dá pra ver a diferença no desenho na hora.
    const sobre = f.params.sobrepoe !== undefined ? f.params.sobrepoe : (acc.params || {}).sobrepoe;
    h += '<div class="cst-field"><span>Montagem</span><select data-f="' + fi + '" data-fp="sobrepoe">'
      + '<option value="1"' + (sobre !== false ? ' selected' : '') + '>Sobreposta</option>'
      + '<option value="0"' + (sobre === false ? ' selected' : '') + '>Embutida</option></select></div>';
    if ('lado' in (acc.params || {})) {
      const lado = f.params.lado || acc.params.lado;
      h += '<div class="cst-field"><span>Dobradiça</span><select data-f="' + fi + '" data-fp="lado">'
        + '<option value="left"' + (lado === 'left' ? ' selected' : '') + '>Esquerda</option>'
        + '<option value="right"' + (lado === 'right' ? ' selected' : '') + '>Direita</option></select></div>';
    }
    const folga = f.params.folgas_mm != null ? f.params.folgas_mm : ((acc.params || {}).folgas_mm || 3);
    h += '<div class="cst-field"><span>Folga (mm)</span>'
      + '<input type="number" data-f="' + fi + '" data-fp="folgas_mm" value="' + Number(folga) + '" min="0" max="20"></div>';
    h += '<button class="erp-btn-ghost erp-btn-sm" data-rmfront="' + fi + '">Remover esta frente</button>';
  });

  // Fechar uma FAIXA de filhos com uma porta só. No protótipo isso era um
  // modo de varredura com o mouse; aqui virou dois campos, que é mais direto
  // de acertar e grava exatamente o mesmo dado (fronts[].from/to).
  if (n.splitAxis === 'x' && n.children.length > 1) {
    const frentes = Object.keys(S.cat).map(function (k) { return S.cat[k]; })
      .filter(function (a) { return a.active && a.role === 'front' && (a.componente || a.child_module_id); });
    if (frentes.length) {
      h += tit('Frente cobrindo várias colunas');
      h += '<div class="cst-field"><span>Porta</span><select data-mf="acc">'
        + frentes.map(function (a) { return '<option value="' + a.id + '">' + UI.esc(a.name) + '</option>'; }).join('')
        + '</select></div>';
      const ops = n.children.map(function (k, i) { return '<option value="' + i + '">' + (i + 1) + 'ª</option>'; }).join('');
      h += '<div class="cst-field"><span>Da coluna</span><select data-mf="from">' + ops + '</select></div>';
      h += '<div class="cst-field"><span>Até a coluna</span><select data-mf="to">' + ops + '</select></div>';
      h += '<button class="erp-btn-ghost erp-btn-sm" data-addfront="1">Aplicar porta na faixa</button>';
    }
  }

  if (!temAlgo) h += '<div class="cst-empty">Vão vazio.<br>Clique nele no desenho pra escolher.</div>';

  /* ---- engenharia: o que separa "o módulo" de "as opções do módulo" ---- */
  h += '<h3 style="margin:14px 0 7px;font-size:10px;letter-spacing:.13em;'
    + 'text-transform:uppercase;color:#8a8378">Engenharia</h3>';
  h += '<label style="display:flex;gap:7px;align-items:center;font-size:12px;color:#6b655c">'
    + '<input type="checkbox" data-p="locked"' + (n.locked ? ' checked' : '') + '> '
    + 'travar (o cliente não mexe neste vão)</label>';
  const par = LayoutEngine.findParent(S.root, n.id);
  if (par) {
    h += '<div style="margin-top:9px"><div class="cst-field"><span>Tamanho no pai</span>'
      + '<select data-p="sizeMode">'
      + '<option value="fill"' + (n.sizeMode === 'fill' ? ' selected' : '') + '>Automático</option>'
      + '<option value="fixed"' + (n.sizeMode === 'fixed' ? ' selected' : '') + '>Fixo (mm)</option>'
      + '</select></div>'
      + (n.sizeMode === 'fixed'
        ? CST.campoNum('Valor (mm)', Math.round(n.sizeValue != null ? n.sizeValue : (par.splitAxis === 'x' ? b.w : b.h)), 'sizev', 20, 3000)
        : '')
      + '</div>';
  }

  alvo.innerHTML = h;
  CST.ligarProps(alvo, n, b);
};

CST.ligarProps = function (alvo, n, b) {
  const S = CST.S;

  alvo.querySelectorAll('[data-num]').forEach(function (inp) {
    inp.onchange = function () {
      CST.snapshot();
      const v = Number(inp.value) || 0, k = inp.dataset.num;
      if (k === 'qtd') LayoutEngine.applySplit(n, n.splitAcc, v, S.cat);
      if (k === 'angulo') n.params.angulo_deg = v;
      if (k === 'recuo') n.params.recuo_mm = v;
      if (k === 'cqtd') n.content.params.quantidade = v;
      if (k === 'crecuo') n.content.params.recuo_mm = v;
      if (k === 'ctopo') n.content.params.altura_do_topo_mm = v;
      if (k === 'cpasso') n.content.params.passo_mm = v;
      if (k === 'sizev') n.sizeValue = v;
      CST.marcarSujo();
      CST.rebuild();
    };
  });

  alvo.querySelectorAll('[data-f]').forEach(function (inp) {
    inp.onchange = function () {
      CST.snapshot();
      const f = n.fronts[Number(inp.dataset.f)], k = inp.dataset.fp;
      if (k === 'sobrepoe') f.params.sobrepoe = inp.value === '1';
      else if (k === 'lado') f.params.lado = inp.value;
      else f.params[k] = Number(inp.value) || 0;
      CST.marcarSujo();
      CST.rebuild();
    };
  });

  alvo.querySelectorAll('[data-rmfront]').forEach(function (btn) {
    btn.onclick = function () {
      CST.snapshot();
      LayoutEngine.removeFront(n, Number(btn.dataset.rmfront));
      CST.marcarSujo();
      CST.rebuild();
    };
  });

  alvo.querySelectorAll('[data-addfront]').forEach(function (btn) {
    btn.onclick = function () {
      const g = function (k) { return alvo.querySelector('[data-mf="' + k + '"]'); };
      const accId = g('acc').value;
      let from = Number(g('from').value), to = Number(g('to').value);
      if (to < from) { const t = from; from = to; to = t; }
      CST.snapshot();
      LayoutEngine.applyFront(n, accId, from, to, S.cat);
      CST.marcarSujo();
      CST.rebuild();
    };
  });

  alvo.querySelectorAll('[data-p]').forEach(function (inp) {
    inp.onchange = function () {
      CST.snapshot();
      const k = inp.dataset.p;
      if (k === 'locked') n.locked = inp.checked;
      if (k === 'sizeMode') {
        n.sizeMode = inp.value;
        if (inp.value === 'fixed' && !n.sizeValue) n.sizeValue = Math.round(b.h || b.w);
      }
      CST.marcarSujo();
      CST.rebuild();
    };
  });

  alvo.querySelectorAll('[data-clear]').forEach(function (btn) {
    btn.onclick = function () {
      CST.snapshot();
      LayoutEngine.clearNode(n, btn.dataset.clear);
      CST.marcarSujo();
      CST.rebuild();
    };
  });

  alvo.querySelectorAll('[data-wipe]').forEach(function (btn) { btn.onclick = CST.esvaziarVao; });

  // Digitar a medida de um vão crava ele e o VIZINHO, preservando a soma —
  // exatamente a mesma regra do arrasto (ver startDragDiv). São dois
  // caminhos pro mesmo lugar; se um dia divergirem, o desenho está errado.
  alvo.querySelectorAll('[data-kid]').forEach(function (inp) {
    inp.onchange = function () {
      const i = Number(inp.dataset.kid);
      const acc = S.cat[n.splitAcc];
      if (!acc) return;
      const eixo = acc.axis, kids = n.children;
      const tam = function (j) { return Math.round(kids[j]._box ? (eixo === 'y' ? kids[j]._box.h : kids[j]._box.w) : 0); };
      const viz = i < kids.length - 1 ? i + 1 : i - 1;
      if (viz < 0) return;
      const soma = tam(i) + tam(viz);
      const v = Math.max(CST.MIN_VAO, Math.min(soma - CST.MIN_VAO, Math.round(Number(inp.value) || 0)));
      CST.snapshot();
      kids[i].sizeMode = 'fixed'; kids[i].sizeValue = v;
      kids[viz].sizeMode = 'fixed'; kids[viz].sizeValue = soma - v;
      CST.marcarSujo();
      CST.rebuild();
    };
  });

  alvo.querySelectorAll('[data-auto]').forEach(function (btn) {
    btn.onclick = function () {
      CST.snapshot();
      n.children.forEach(function (k) { k.sizeMode = 'fill'; k.sizeValue = null; });
      CST.marcarSujo();
      CST.rebuild();
    };
  });
};

/* ============================================================
   Árvore, resumo e avisos
   ============================================================ */
CST.renderTree = function () {
  const S = CST.S, e = document.getElementById('cst-tree');
  if (!e) return;
  const linhas = [];
  (function walk(n, prefixo, ultimo, raiz) {
    const b = n._box || { w: 0, h: 0, d: 0 };
    const galho = raiz ? '' : prefixo + (ultimo ? '└─ ' : '├─ ');
    const desc = [];
    if (n.splitAcc && S.cat[n.splitAcc]) desc.push(S.cat[n.splitAcc].name + ' ×' + Math.max(0, n.children.length - 1));
    if (n.content && S.cat[n.content.acc]) desc.push(S.cat[n.content.acc].name);
    (n.fronts || []).forEach(function (f) {
      const nome = (S.cat[f.acc] || {}).name || 'frente';
      desc.push('+' + nome + (f.from == null ? '' : ' (' + (f.from + 1) + (f.to > f.from ? '–' + (f.to + 1) : '') + ')'));
    });
    const rot = (raiz ? 'ZONA INTERNA' : 'vão') + (desc.length ? ' · ' + desc.join(' · ') : ' vazio');
    linhas.push(galho + '<span class="cst-tnode' + (S.sel === n.id ? ' sel' : '') + '" data-n="' + n.id + '">'
      + UI.esc(rot) + ' <span class="dim">' + Math.round(b.w) + '×' + Math.round(b.h) + '×' + Math.round(b.d) + '</span>'
      + (n.locked ? ' 🔒' : '') + '</span>');
    const pref = raiz ? '' : prefixo + (ultimo ? '   ' : '│  ');
    n.children.forEach(function (k, i) { walk(k, pref, i === n.children.length - 1, false); });
  })(S.root, '', true, true);

  e.innerHTML = linhas.join('\n');
  e.querySelectorAll('[data-n]').forEach(function (s) {
    s.onclick = function () { CST.select(s.dataset.n); };
  });
};

CST.renderResumo = function () {
  const S = CST.S, e = document.getElementById('cst-resumo');
  if (!e) return;
  const z = S.zona || { w: 0, h: 0, d: 0, x: 0, y: 0, z: 0 };
  const m = S.modulo || {};
  const explicita = !!(m.inner_w_formula || m.inner_h_formula || m.inner_d_formula);
  const cont = {};
  (S.built.pieces || []).forEach(function (p) {
    const a = S.cat[p.accKey];
    if (a) cont[a.name] = (cont[a.name] || 0) + 1;
  });
  const livres = (S.built.voids || []).filter(function (v) { return !v.occupied; }).length;
  const permitidos = Object.keys(S.opcoes).filter(function (k) { return S.opcoes[k].allowed; }).length;

  // Os 6 campos de fórmula (modules.inner_*, migration 085 item 4). Ficam
  // SEMPRE visíveis e editáveis, não escondidos atrás de um botão "gravar o
  // calculado": quando a dedução erra, é aqui que se conserta, e quem está
  // olhando pra um desenho vazio precisa achar isto sem procurar. Vazio =
  // volta a deduzir do casco.
  const dedu = CST.zonaDoCasco();
  const campo = function (k, rot) {
    const val = m['inner_' + k + '_formula'] || '';
    return '<div class="cst-field" style="grid-template-columns:26px 1fr 58px;margin-bottom:4px">'
      + '<span>' + rot + '</span>'
      + '<input type="text" data-zona="' + k + '" value="' + UI.esc(val) + '" placeholder="auto">'
      + '<span class="cst-sub" style="text-align:right">' + Math.round(z[k]) + '</span></div>';
  };

  e.innerHTML = ''
    + '<div style="font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:#8a8378;margin-bottom:6px">'
    + 'Zona interna ' + (explicita ? '— fórmula do cadastro' : '— deduzida do casco') + '</div>'
    + '<div class="cst-sub" style="margin-bottom:6px">É a raiz da árvore: o retângulo útil dentro do casco. '
    + 'Aceita <b>W</b>, <b>H</b> e <b>D</b>. Em branco, deduz do casco '
    + '(hoje daria ' + dedu.w + '×' + dedu.h + '×' + dedu.d + ' no canto '
    + dedu.x + '/' + dedu.y + '/' + dedu.z + ').</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">'
    + campo('w', 'L') + campo('x', 'x')
    + campo('h', 'A') + campo('y', 'y')
    + campo('d', 'P') + campo('z', 'z')
    + '</div>'
    + '<div style="margin:6px 0 10px">'
    + '<button class="erp-btn-secondary erp-btn-sm" id="cst-zona-salvar">Salvar zona</button> '
    + '<button class="erp-btn-ghost erp-btn-sm" id="cst-zona-auto">Usar o deduzido</button>'
    + (explicita ? ' <button class="erp-btn-ghost erp-btn-sm" id="cst-zona-limpar">Limpar</button>' : '')
    + '</div>'
    + '<div>'
    + Object.keys(cont).map(function (k) { return '<span class="cst-chip">' + UI.esc(k) + ' ×' + cont[k] + '</span>'; }).join('')
    + '</div>'
    + '<div class="cst-sub" style="margin-top:6px">'
    + (S.built.pieces || []).length + ' peças geradas · ' + livres + ' vãos livres · '
    + permitidos + ' agregado(s) liberado(s) pro cliente'
    + (S.limitesCadastrados ? '' : '<br><b>Sem limites de fabricação cadastrados</b> — rode a migration 086 '
      + 'e preencha min/máx, veio e "leva furo" nos componentes para a validação valer.')
    + '</div>';

  // Digitar já reflete no desenho (sem gravar): é o mesmo princípio dos
  // sliders de L/A/P — se a fórmula está errada, você vê na hora.
  e.querySelectorAll('[data-zona]').forEach(function (inp) {
    inp.onchange = function () {
      m['inner_' + inp.dataset.zona + '_formula'] = inp.value.trim() || null;
      CST.marcarSujo();
      CST.rebuild();
    };
  });
  const liga = function (id, fn) { const b = document.getElementById(id); if (b) b.onclick = fn; };
  liga('cst-zona-salvar', CST.gravarZona);
  liga('cst-zona-auto', function () {
    const dz = CST.zonaDoCasco();
    // Fórmula, não número: tem que continuar valendo quando o módulo mudar de
    // tamanho. Canto e profundidade são constantes (espessura do casco); a
    // largura e a altura andam com W/H.
    m.inner_x_formula = String(dz.x); m.inner_y_formula = String(dz.y); m.inner_z_formula = String(dz.z);
    m.inner_w_formula = 'W-' + (S.W - dz.w);
    m.inner_h_formula = 'H-' + (S.H - dz.h);
    m.inner_d_formula = 'D-' + (S.D - dz.d);
    CST.marcarSujo();
    CST.rebuild();
  });
  liga('cst-zona-limpar', function () {
    ['x', 'y', 'z', 'w', 'h', 'd'].forEach(function (k) { m['inner_' + k + '_formula'] = null; });
    CST.marcarSujo();
    CST.rebuild();
  });
};

/* Enquanto houver item aqui, o layout não deveria ser liberado — é o que
   impede peça impossível de chegar na fábrica. Clicar num aviso seleciona o
   vão culpado. */
CST.renderErros = function () {
  const S = CST.S, bar = document.getElementById('cst-err');
  if (!bar) return;
  const ps = S.problemas || [];
  const av = (S.zona && S.zona.avisos) || [];
  if (!ps.length && !av.length) { bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;

  // O aviso de ZONA vem primeiro e sem contagem: ele não é "uma peça fora do
  // limite", é a tela inteira sem espaço pra trabalhar. Quem lê isto está
  // olhando pra um desenho vazio e precisa saber por quê na primeira linha.
  let h = av.map(function (a) {
    return '<div class="eh" style="margin-bottom:5px">⚠ ' + UI.esc(a) + '</div>';
  }).join('');

  if (ps.length) {
    h += '<div class="eh">' + ps.length + ' peça(s) fora dos limites</div>'
      + ps.slice(0, 12).map(function (p) {
        return '<div class="ei" data-node="' + (p.nodeId || '') + '">• ' + UI.esc(p.msg) + '</div>';
      }).join('')
      + (ps.length > 12 ? '<div class="ei">… e mais ' + (ps.length - 12) + '</div>' : '');
  }
  bar.innerHTML = h;
  bar.querySelectorAll('[data-node]').forEach(function (e) {
    e.onclick = function () { if (e.dataset.node) CST.select(e.dataset.node); };
  });
};

/* ============================================================
   Vista 3D — só conferência
   ============================================================
   Cena PRÓPRIA, não o Viewer3D singleton: aquele é do configurador/admin e
   está amarrado a um container só. Aqui as peças já vêm com posição absoluta
   pronta (o motor calculou), então desenhar caixa é literalmente colocar no
   lugar — não é uma segunda implementação de posicionamento.

   Mesma convenção de viewer3d.placePieceInBox: origem no centro em X/Z, chão
   em Y=0, peça posicionada pelo canto chão-fundo-esquerda. */
CST.three = null;

CST.initThree = function () {
  const st = document.getElementById('cst-3d');
  if (!st || typeof THREE === 'undefined') return;
  // A tela é remontada a cada navegação: se a cena antiga aponta pra um
  // container que saiu do DOM, ela é descartada inteira.
  if (CST.three && CST.three.st === st) return;
  if (CST.three) CST.three.morto = true;

  const t = { st: st, morto: false };
  t.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  t.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  t.renderer.setSize(st.clientWidth || 300, st.clientHeight || 236);
  st.appendChild(t.renderer.domElement);

  t.scene = new THREE.Scene();
  t.camera = new THREE.PerspectiveCamera(38, (st.clientWidth || 300) / (st.clientHeight || 236), 0.05, 100);
  t.controls = new THREE.OrbitControls(t.camera, t.renderer.domElement);
  t.controls.enableDamping = true;
  t.controls.dampingFactor = 0.09;

  t.scene.add(new THREE.HemisphereLight(0xffffff, 0x36302a, 0.95));
  const k = new THREE.DirectionalLight(0xffffff, 0.85); k.position.set(3, 5, 4); t.scene.add(k);
  const f = new THREE.DirectionalLight(0xffffff, 0.28); f.position.set(-4, 2, -3); t.scene.add(f);

  t.gPieces = new THREE.Group(); t.scene.add(t.gPieces);
  t.gSel = new THREE.Group(); t.scene.add(t.gSel);
  CST.three = t;

  CST.fitCamera();
  // O canvas nasce com o tamanho que o container tinha no instante do init.
  // Sem reagir ao resize a cena fica esticada quando a janela muda (e o
  // primeiro layout do grid pode nem ter acontecido ainda). Conferir a cada
  // quadro é barato — são duas leituras — e dispensa ResizeObserver.
  let lw = 0, lh = 0;
  (function animate() {
    if (t.morto || !document.body.contains(st)) { t.renderer.dispose(); return; }
    requestAnimationFrame(animate);
    const w = st.clientWidth, h = st.clientHeight;
    if (w && h && (w !== lw || h !== lh)) {
      lw = w; lh = h;
      t.camera.aspect = w / h;
      t.camera.updateProjectionMatrix();
      t.renderer.setSize(w, h);
    }
    const S = CST.S;
    if (Math.abs(S.open - S.openTarget) > 0.002) { S.open += (S.openTarget - S.open) * 0.14; CST.applyOpening(); }
    t.controls.update();
    t.renderer.render(t.scene, t.camera);
  })();
};

CST.clearGroup = function (g) {
  while (g.children.length) {
    const o = g.children.pop();
    o.traverse(function (c) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
  }
};

CST.place = function (obj, p) {
  const S = CST.S;
  obj.position.set(-S.W / 2000 + (p.x + p.w / 2) / 1000, (p.y + p.h / 2) / 1000, -S.D / 2000 + (p.z + p.d / 2) / 1000);
};

CST.render3D = function () {
  const t = CST.three, S = CST.S;
  if (!t || t.morto || !S.built) return;
  CST.clearGroup(t.gPieces);
  CST.clearGroup(t.gSel);

  // O casco são peças de verdade (module_components), então ele usa o MESMO
  // material do 3D principal: cor na face, fita ou miolo da chapa na borda
  // (migration 088, Viewer3D.materialsForPart). Sem receita de fita
  // cadastrada, materialsForPart devolve null e cai no marrom liso de antes.
  // As peças da ÁRVORE continuam em cor chapada de propósito: elas são
  // esquemáticas aqui — o que se está conferindo é onde o vão cai, não o
  // acabamento. Elas ganham o material real assim que entram num pedido.
  (S.cascoBoxes || []).forEach(function (bx) {
    const geo = new THREE.BoxGeometry(
      Math.max(bx.sx, 1) / 1000, Math.max(bx.sy, 1) / 1000, Math.max(bx.sz, 1) / 1000);
    let mat = null;
    try {
      mat = Viewer3D.materialsForPart
        ? Viewer3D.materialsForPart(geo, bx.part, bx.part && bx.part.color, false)
        : null;
    } catch (e) { mat = null; }
    const m = new THREE.Mesh(geo, mat
      || new THREE.MeshStandardMaterial({ color: 0xA9855C, roughness: 0.72, metalness: 0.02 }));
    CST.place(m, { x: bx.x0, y: bx.y0, z: bx.z0, w: bx.sx, h: bx.sy, d: bx.sz });
    t.gPieces.add(m);
  });

  S.built.pieces.forEach(function (p) {
    if (p.kind === 'front' && !S.showPortas) return;
    let obj;
    if (p.shape_type === 'oval_rod') {
      const g = new THREE.CylinderGeometry(0.015, 0.015, p.w / 1000, 18);
      g.rotateZ(Math.PI / 2); g.scale(1, 1, 0.6);
      obj = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xAEB6BF, roughness: 0.32, metalness: 0.65 }));
      CST.place(obj, p);
    } else {
      const cor = p.kind === 'front' ? 0x7E8B96 : (p.kind === 'split' ? 0xC49A63 : 0x9E7B4F);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(p.w, 1) / 1000, Math.max(p.h, 1) / 1000, Math.max(p.d, 1) / 1000),
        new THREE.MeshStandardMaterial({ color: cor, roughness: 0.66, metalness: 0.03 }));
      if (p.tilt_deg) mesh.rotation.x = -p.tilt_deg * Math.PI / 180;
      if (p.opening_type === 'hinge_left' || p.opening_type === 'hinge_right') {
        // Pivô na BORDA da dobradiça, mesmo truque do viewer3d: o grupo fica
        // na aresta e a mesh nasce meia largura pra dentro.
        const esq = p.opening_type === 'hinge_left';
        const pivot = new THREE.Group();
        CST.place(pivot, { x: p.x + (esq ? 0 : p.w), y: p.y, z: p.z, w: 0, h: p.h, d: p.d });
        mesh.position.x = (esq ? 1 : -1) * (p.w / 2000);
        pivot.add(mesh);
        pivot.userData.hinge = p.opening_type;
        obj = pivot;
      } else if (p.opening_type === 'slide_out') {
        const g = new THREE.Group();
        CST.place(g, p); g.add(mesh);
        g.userData.slide = (p.d * 0.8) / 1000;
        obj = g;
      } else {
        CST.place(mesh, p);
        obj = mesh;
      }
    }
    t.gPieces.add(obj);
  });

  const n = CST.selNode();
  if (n && n._box) {
    const bx = n._box;
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(bx.w, 4) / 1000, Math.max(bx.h, 4) / 1000, Math.max(bx.d, 4) / 1000),
      new THREE.MeshBasicMaterial({ color: 0xffb43c, transparent: true, opacity: 0.24, depthWrite: false }));
    CST.place(m, bx);
    t.gSel.add(m);
  }
  CST.applyOpening();
};

CST.applyOpening = function () {
  const t = CST.three;
  if (!t) return;
  t.gPieces.traverse(function (o) {
    if (!o.userData) return;
    if (o.userData.hinge) {
      o.rotation.y = (o.userData.hinge === 'hinge_left' ? -1 : 1) * CST.S.open * (100 * Math.PI / 180);
    }
    if (o.userData.slide !== undefined) {
      if (o.userData._z0 === undefined) o.userData._z0 = o.position.z;
      o.position.z = o.userData._z0 + CST.S.open * o.userData.slide;
    }
  });
};

CST.fitCamera = function () {
  const t = CST.three, S = CST.S;
  if (!t) return;
  const h = S.H / 1000, w = S.W / 1000, d = S.D / 1000;
  const r = Math.sqrt(w * w + h * h + d * d) / 2;
  const dist = r / Math.sin((t.camera.fov * Math.PI / 180) / 2) * 1.02;
  t.camera.position.set(dist * 0.5, h * 0.62, dist * 0.85);
  t.controls.target.set(0, h / 2, 0);
  t.controls.update();
};

/* ============================================================
   Gravar
   ============================================================ */
/* Grava o que está NOS CAMPOS (não o que a dedução calculou): o "Usar o
   deduzido" só preenche os campos, e só depois é que se grava. Assim o que
   você lê na tela é exatamente o que vai pro banco. */
CST.gravarZona = async function () {
  const S = CST.S, m = S.modulo;
  if (!S.moduleId) return;
  const f = {
    x: m.inner_x_formula || null, y: m.inner_y_formula || null, z: m.inner_z_formula || null,
    w: m.inner_w_formula || null, h: m.inner_h_formula || null, d: m.inner_d_formula || null
  };
  try {
    await CONSTR.salvarZona(S.moduleId, f);
    CST.rebuild();
    CST.hint(f.w || f.h || f.d ? 'Zona interna gravada' : 'Zona interna limpa — volta a deduzir do casco');
  } catch (e) {
    alert(CONSTR.explainError(e));
  }
};

CST.salvar = async function () {
  const S = CST.S;
  if (!S.moduleId) return;
  const btn = document.getElementById('cst-salvar');
  const antes = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando…'; }
  try {
    const n = await CONSTR.salvarArvore(S.moduleId, S.root);
    const linhas = Object.keys(S.opcoes).map(function (k) { return S.opcoes[k]; });
    await CONSTR.salvarOpcoes(S.moduleId, linhas);
    // A zona interna entra no MESMO salvar. Ela é editada no rodapé e tem
    // botão próprio, mas deixar ela de fora daqui seria a pior das duas
    // opções: o campo mexido, o desenho já respondendo a ele, e o valor se
    // perdendo no recarregar sem ninguém avisar.
    const m = S.modulo;
    await CONSTR.salvarZona(S.moduleId, {
      x: m.inner_x_formula || null, y: m.inner_y_formula || null, z: m.inner_z_formula || null,
      w: m.inner_w_formula || null, h: m.inner_h_formula || null, d: m.inner_d_formula || null
    });
    S.dirty = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar layout'; }
    // A árvore foi reescrita: os ids em memória agora são os do banco (ver
    // CONSTR.salvarArvore). A seleção pode ter ficado apontando pro id
    // antigo, então revalida em vez de deixar a tela "sem vão selecionado"
    // sem explicação.
    if (!LayoutEngine.findNode(S.root, S.sel)) S.sel = null;
    CST.rebuild();
    if (!S.sel) CST.autoSelect();
    CST.hint('Layout salvo — <b>' + n + '</b> vão(s) gravado(s)');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = antes; }
    console.error(e);
    alert(CONSTR.explainError(e));
  }
};
