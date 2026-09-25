/* Legno ERP — login, roteador por hash e painel inicial.
 *
 * O roteador é assíncrono: uma rota pode declarar `load`, que busca no
 * Supabase antes de renderizar. Assim as telas continuam sendo funções
 * simples que recebem dado pronto e devolvem HTML — sem framework.
 */

const APP = {};

/* ============================================================
   Menu em dois níveis — área em cima, módulos da área embaixo
   ============================================================
   Antes eram 15 links soltos numa linha só, que já estourava a largura e
   não dizia a quem cada tela pertence. Agora a faixa de cima tem as cinco
   áreas da fábrica e a de baixo mostra só os módulos da área aberta.

   As telas de ENGENHARIA (e algumas de administrativo/comercial) são o
   painel admin do portal rodando embutido — ver screens-admin.js. Do ponto
   de vista do menu não há diferença nenhuma: é só mais um endereço. */
APP.menu = [
  { id: 'painel', label: 'Painel', hash: '#/', items: [] },

  { id: 'administrativo', label: 'Administrativo', items: [
    { hash: '#/contatos',           label: 'Contatos' },
    { hash: '#/perfis',             label: 'Perfis de acesso' },
    { hash: '#/financeiro',         label: 'Financeiro' },
    { hash: '#/eng/controladoria',  label: 'Controladoria' }
  ] },

  { id: 'comercial', label: 'Comercial', items: [
    { hash: '#/eng/crm',            label: 'Clientes (CRM)' },
    { hash: '#/projetos',    label: 'Projetos' },
    { hash: '#/pedidos',     label: 'Pedidos' },
    { hash: '#/eng/galeria', label: 'Galeria' },
    { hash: '#/eng/margem',  label: 'Margem de preço' }
  ] },

  { id: 'producao', label: 'Produção', items: [
    { hash: '#/producao',    label: 'Controle de produção' },
    { hash: '#/apontamento', label: 'Apontamentos' },
    { hash: '#/processos',   label: 'Processos' },
    { hash: '#/embalagem',   label: 'Embalagem' },
    { hash: '#/embalagem-teste', label: 'Apontamento + Embalagem (teste)' },
    { hash: '#/expedicao',   label: 'Expedição' }
  ] },

  { id: 'engenharia', label: 'Engenharia', items: [
    { hash: '#/eng/produtos',         label: 'Cadastro de produtos' },
    { hash: '#/eng/componentes',      label: 'Cadastro de componentes' },
    { hash: '#/eng/tipos-componente', label: 'Tipos de componente' },
    /* CONSTRUTOR DE MÓDULOS — CONGELADO em 2026-08-22 (Matt: "o construto de
       modulo do ERP ta meio sem sentido e bem atrasado em comparacao ao do
       portal. quero desativar ele"). Editava a árvore de vãos
       (module_layout_nodes/module_accessory_options, migration 085), que
       define o que o CLIENTE pode customizar por dentro de um módulo já no
       projeto dele — mas na prática nenhum módulo do catálogo usa essa
       customização por vão (todo módulo é composição fixa). A ferramenta
       visual nova pra montar/ajustar as peças de um módulo mora em
       "Cadastro de produtos" → aba "Componentes" (13-modulo-pecas.js +
       26-modulo-pecas-3d.js), em cima de module_components.

       Congelado, não removido: some só do MENU. A rota #/construtor (linha
       ~267, mais abaixo) continua registrada, screens-construtor.js e
       data-construtor.js continuam carregados — quem tiver o link direto
       ainda abre e usa normalmente. Mesmo tratamento já dado a "Referências
       (SKU)" logo abaixo. Pra trazer de volta, descomente a linha abaixo.
       { hash: '#/construtor',           label: 'Construtor de módulos' }, */
    { hash: '#/eng/agregados',        label: 'Agregados do construtor' },
    { hash: '#/eng/cores',            label: 'Cadastro de cores' },
    { hash: '#/etiquetas',            label: 'Cadastro de etiquetas' },
    { hash: '#/eng/taxonomia',        label: 'Taxonomia' },
    { hash: '#/eng/ferragens',        label: 'Ferragens e mão de obra' },
    /* Itens comprados (migration 119) — o cadastro do que a fábrica compra
       pronto, com o preço de COMPRA (que antes morava disfarçado de mão de
       obra) e as regras que ligam cada ferragem ao furo que a pede. */
    { hash: '#/eng/comprados',        label: 'Itens comprados' },
    { hash: '#/eng/furacao',          label: 'Furação (parâmetros)' },
    /* Programas de furação (migration 105) — o catálogo reutilizável que cada
       peça do módulo escolhe. Substitui o "Configurador de furação" abaixo,
       que editava a furação DE UM COMPONENTE (modelo antigo, aposentado em
       2026-08-15 junto com a linha "flatbord" de dois componentes crus).
       ATENÇÃO: o menu do ERP sai DAQUI, não do ADM.TABS — registrar a tela
       lá sem acrescentar a linha aqui deixa a tela existindo mas inalcançável,
       que foi o que aconteceu na primeira tentativa. */
    { hash: '#/eng/programas-furacao', label: 'Programas de furação' }
    /* REFERÊNCIAS (SKU) — CONGELADA em 2026-08-18 (Matt: "pode ocultar essa
       parte do sistema, congelar ela, porque não estamos usando pra nada").
       Eram fotos reais de módulo mandadas junto no prompt da imagem de IA da
       Galeria; nunca entrou uma foto sequer.

       Congelada, não removida: some só do MENU. A tela continua registrada em
       ADM.TABS ('referencias' em _adm.js), o erp/js/adm/telas/references.js
       continua carregado e a tabela no banco continua lá — quem tiver o link
       #/eng/referencias ainda abre e usa normalmente. Pra trazer de volta,
       descomente a linha abaixo. Mesmo tratamento das abas congeladas do
       portal (display:none reversível), e o oposto do 'furacao-peca' em
       _adm.js, que foi aposentado de verdade.
    , { hash: '#/eng/referencias',      label: 'Referências (SKU)' } */
  ] },

  { id: 'pcp', label: 'PCP', items: [
    { hash: '#/lotes',      label: 'Lotes' },
    { hash: '#/planos',     label: 'Plano de corte' },
    /* "Gerar .ban" chegou a existir aqui como item de menu, apontando pra
       tela de pedidos do admin. Saiu: o .ban se tira de DENTRO do lote
       (botão "Furação (.ban)" na lista e na tela do lote), porque é o lote
       que vai pra máquina. A tela por pedido continua viva em
       #/eng/gerar-ban — serve pra conferir um pedido isolado — só não ocupa
       espaço no menu. */
    { hash: '#/materiais',  label: 'Materiais (estoque)' },
    { hash: '#/compras',    label: 'Compras' },
    { hash: '#/etiquetas-impressao', label: 'Etiquetas' }
  ] }
];

/* Dado um hash de menu, devolve o grupo dono dele. Uma rota diz a que item
   pertence (campo `nav`); daí sai a área a destacar em cima. */
APP.groupOf = function (hash) {
  for (let i = 0; i < APP.menu.length; i++) {
    const g = APP.menu[i];
    if (g.hash === hash) return g;
    for (let j = 0; j < g.items.length; j++) {
      if (g.items[j].hash === hash) return g;
    }
  }
  return null;
};

/* ============================================================
   Painel inicial — mistura dado real (pedidos) e exemplo (produção)
   ============================================================ */
/* Cada consulta é embrulhada individualmente para que a falha de UMA não
   derrube o painel inteiro — mas o erro é GUARDADO, não engolido.
   (Antes eu fazia `.catch(() => [])` e o painel mostrava zeros sem dizer que
   a leitura tinha falhado. Zero indistinguível de erro é o pior dos mundos.) */
APP._try = async function (nome, fn) {
  try { return { nome: nome, dados: await fn() }; }
  catch (err) { console.error('[' + nome + ']', err); return { nome: nome, dados: [], erro: err }; }
};

APP.dashboardLoad = async function () {
  const [orders, projects, mods] = await Promise.all([
    APP._try('Pedidos', DATA.orders),
    APP._try('Projetos', DATA.projects),
    APP._try('Produtos', DATA.modules)
  ]);
  return {
    orders: orders.dados, projects: projects.dados, mods: mods.dados,
    erros: [orders, projects, mods].filter(function (r) { return r.erro; })
  };
};

APP.dashboard = function (params, d) {
  const live = d.orders.filter(function (o) {
    const s = DATA.statusMap[o.status];
    return s ? s.factory : true;
  });
  const waiting = live.filter(function (o) { return o.status === 'submitted'; });
  const total = live.reduce(function (s, o) { return s + DATA.orderTotal(o); }, 0);

  const recent = live.slice(0, 8).map(function (o) {
    return {
      num: '<a href="#/pedidos/' + o.id + '" class="erp-strong">' + UI.esc(o.po_name || ('#' + o.id.slice(0, 8))) + '</a>',
      client: UI.esc(DATA.clientLabel(o)),
      status: UI.statusPill(DATA.statusMap, o.status),
      items: DATA.orderQty(o) + ' módulo(s)',
      created: UI.date(o.created_at),
      value: UI.money(DATA.orderTotal(o))
    };
  });

  /* Falha de leitura aparece em primeiro plano. Sem isso, "0 pedidos" parecia
     banco vazio quando na verdade era consulta quebrada. */
  const alertaErro = (d.erros && d.erros.length)
    ? UI.errorBox(
        'Não consegui ler: ' + d.erros.map(function (e) { return e.nome; }).join(', '),
        d.erros.map(function (e) { return e.nome + ': ' + DATA.explainError(e.erro); }).join(' | ')
      ) +
      '<div style="margin-bottom:18px"><a class="erp-btn erp-btn-secondary" href="diagnostico.html" target="_blank">Abrir diagnóstico</a> ' +
      '<button class="erp-btn-secondary" onclick="APP.reload()">Tentar de novo</button></div>'
    : '';

  /* Zero legítimo também merece explicação — banco vazio e RLS bloqueando
     produzem o mesmo zero na tela. */
  const tudoZero = !d.orders.length && !d.mods.length && !d.projects.length && !(d.erros && d.erros.length);
  const alertaVazio = tudoZero
    ? UI.errorBox('As três consultas voltaram vazias',
        'Sem erro nenhum — o que aponta para RLS bloqueando em vez de banco vazio. ' +
        'Se o catálogo de módulos também veio zerado, é quase certo que a sessão não está sendo reconhecida como admin. ' +
        'A página de diagnóstico confirma isso em 5 segundos.') +
      '<div style="margin-bottom:18px"><a class="erp-btn" href="diagnostico.html" target="_blank">Abrir diagnóstico</a></div>'
    : '';

  return UI.head('Painel',
    'Pedidos, produtos e projetos já vêm do Supabase. As telas de produção seguem com dado de exemplo até o schema <span class="erp-mono">erp</span> existir.',
    '<a class="erp-btn erp-btn-secondary" href="diagnostico.html" target="_blank">Diagnóstico</a>') +
    alertaErro + alertaVazio +
    '<div class="erp-grid erp-grid-4" style="margin-bottom:18px">' +
    UI.kpi('Pedidos na fábrica', live.length, UI.money(total) + ' em carteira') +
    UI.kpi('Aguardando aprovação', waiting.length, waiting.length ? '<span class="erp-pill erp-pill-warn">não entra em produção</span>' : 'nada parado') +
    UI.kpi('Módulos no catálogo', d.mods.length, 'fonte: portal') +
    UI.kpi('Projetos salvos', d.projects.length, 'fonte: portal') +
    '</div>' +
    '<div class="erp-grid erp-grid-side"><div>' +
    UI.panel('Pedidos recentes', recent.length
      ? UI.table([
          { key: 'num', label: 'Pedido' },
          { key: 'client', label: 'Cliente' },
          { key: 'status', label: 'Status' },
          { key: 'items', label: 'Itens' },
          { key: 'created', label: 'Criado' },
          { key: 'value', label: 'Valor', align: 'right' }
        ], recent)
      : '<div class="erp-empty">Nenhum pedido enviado ainda. Envie um pelo portal e ele aparece aqui.</div>') +
    UI.panel('Como as telas se encadeiam',
      '<div class="erp-route">' +
      '<div class="erp-route-step done"><div class="erp-route-name">Pedido</div><div class="erp-route-meta">portal · real</div></div>' +
      '<div class="erp-route-step doing"><div class="erp-route-name">Liberação financeira</div><div class="erp-route-meta">trava</div></div>' +
      '<div class="erp-route-step"><div class="erp-route-name">Gera OP</div><div class="erp-route-meta">roteiro do produto</div></div>' +
      '<div class="erp-route-step"><div class="erp-route-name">Entra em lote</div><div class="erp-route-meta">nesting por cor</div></div>' +
      '<div class="erp-route-step"><div class="erp-route-name">Etiqueta + aponta</div><div class="erp-route-meta">Zebra + leitor</div></div>' +
      '<div class="erp-route-step"><div class="erp-route-name">Embala e expede</div><div class="erp-route-meta">confere por leitura</div></div>' +
      '</div>' +
      '<div class="erp-muted erp-small" style="margin-top:14px">Só a primeira caixa tem dado real hoje. As outras existem como mockup para validar o fluxo.</div>') +
    '</div><div>' +
    UI.panel('Fonte única dos dados',
      '<div class="erp-muted erp-small" style="margin-bottom:10px">O ERP não duplica cadastro. Onde cada coisa mora:</div>' +
      '<div class="erp-def erp-small">' +
      '<dt>Clientes</dt><dd>portal <span class="erp-mono erp-xs">user_profiles</span></dd>' +
      '<dt>Produtos</dt><dd>portal <span class="erp-mono erp-xs">modules</span></dd>' +
      '<dt>Projetos</dt><dd>portal <span class="erp-mono erp-xs">user_projects</span></dd>' +
      '<dt>Pedidos</dt><dd>compartilhado <span class="erp-mono erp-xs">orders</span></dd>' +
      '<dt>Produção</dt><dd>ERP <span class="erp-mono erp-xs">erp.*</span> (a criar)</dd>' +
      '</div>') +
    UI.panel('Estado da ligação',
      '<div class="erp-def erp-small">' +
      '<dt>Pedidos</dt><dd>' + UI.pill('real', 'erp-pill-ok') + '</dd>' +
      '<dt>Produtos</dt><dd>' + UI.pill('real', 'erp-pill-ok') + '</dd>' +
      '<dt>Projetos</dt><dd>' + UI.pill('real', 'erp-pill-ok') + '</dd>' +
      '<dt>Contatos</dt><dd>' + UI.pill('exemplo', 'erp-pill-neutral') + '</dd>' +
      '<dt>Produção</dt><dd>' + UI.pill('exemplo', 'erp-pill-neutral') + '</dd>' +
      '<dt>Compras</dt><dd>' + UI.pill('exemplo', 'erp-pill-neutral') + '</dd>' +
      '<dt>Expedição</dt><dd>' + UI.pill('exemplo', 'erp-pill-neutral') + '</dd>' +
      '</div>' +
      '<div class="erp-muted erp-xs" style="margin-top:10px">Nenhuma migration foi necessária para o que está marcado como real.</div>') +
    '</div></div>';
};

/* ============================================================
   Rotas — `load` opcional roda antes do render
   ============================================================ */
APP.routes = [
  { re: /^#?\/?$/,              load: APP.dashboardLoad,                   render: APP.dashboard,                 nav: '#/' },
  { re: /^#\/pedidos$/,         load: ScreensComercial.ordersLoad,         render: ScreensComercial.orders,       nav: '#/pedidos' },
  { re: /^#\/pedidos\/(.+)$/,   load: ScreensComercial.orderDetailLoad,    render: ScreensComercial.orderDetail,  nav: '#/pedidos' },
  { re: /^#\/financeiro$/,      load: ScreensComercial.financialLoad,      render: ScreensComercial.financial,    nav: '#/financeiro' },
  { re: /^#\/processos$/,                                                  render: ScreensProducao.processes,     nav: '#/processos' },
  { re: /^#\/processos\/(.+)$/,                                            render: ScreensProducao.processDetail, nav: '#/processos' },
  /* Lotes e Plano de Corte — migration 081, schema erp. As telas vivem em
     screens-lotes.js e são as PRIMEIRAS do módulo de produção com dado real:
     tudo aqui lê e escreve no Supabase, sem mock. */
  { re: /^#\/lotes$/,           load: LOTES_UI.listLoad,                   render: LOTES_UI.list,                 nav: '#/lotes' },
  { re: /^#\/lotes\/novo$/,     load: LOTES_UI.novoLoad,                   render: LOTES_UI.novo,                 nav: '#/lotes' },
  { re: /^#\/lotes\/([^/]+)\/plano$/, load: LOTES_UI.planNewLoad,          render: LOTES_UI.planNew,              nav: '#/lotes', after: LOTES_UI.afterPlanNew },
  /* Visualizador de furação do lote (2026-08-16, pedido do Matt: "como eu vejo
     as furações de um lote antes de mandar pra máquina... quero igual ao plano
     de corte, visualizar peça por peça em um único lugar"). Rota PRÓPRIA, como
     o plano — dá pra mandar o link pra fábrica. Precisa vir ANTES da rota
     genérica #/lotes/:id, senão o :id come o "/furacao". */
  { re: /^#\/lotes\/([^/]+)\/furacao$/, load: FURACAO_VISUAL.load,        render: FURACAO_VISUAL.render,         nav: '#/lotes' },
  { re: /^#\/lotes\/([^/]+)$/,  load: LOTES_UI.detailLoad,                 render: LOTES_UI.detail,               nav: '#/lotes' },
  { re: /^#\/planos$/,          load: LOTES_UI.plansLoad,                  render: LOTES_UI.plansList,            nav: '#/planos' },
  { re: /^#\/planos\/([^/]+)\/etiquetas$/, load: LOTES_UI.labelsLoad,      render: LOTES_UI.labels,               nav: '#/planos' },
  { re: /^#\/planos\/([^/]+)$/, load: LOTES_UI.planLoad,                   render: LOTES_UI.planView,             nav: '#/planos' },
  /* Visor 3D de uma peça já cortada, pelo código de barras impresso na
     etiqueta (PC-000930...) — migration 158, pedido do Matt (21/09): "ao
     clicar em alguma peca ela abrir o modulo explodido com a peca piscando
     em vermelho... talvez vou usar ela em outros momentos da fabricacao ou
     montagem". Rota por CÓDIGO, não por lote/plano, de propósito — pensada
     pra ser reaberta a partir de qualquer bancada que escaneie o código. */
  { re: /^#\/peca\/([^/]+)$/,  load: PECA3D.load,                         render: PECA3D.render,                 nav: '#/lotes', after: PECA3D.after },
  { re: /^#\/materiais$/,       load: MAT.load,                            render: MAT.render,                    nav: '#/materiais' },
  /* Construtor de módulos (migration 085) — o módulo aberto vai na query
     (?m=<uuid>) e não no caminho, porque a tela também existe sem módulo
     nenhum (a lista de escolha) e o `after` precisa do mesmo payload nos
     dois casos. `after` é obrigatório aqui: SVG, sliders e a cena 3D só
     podem ser montados com o HTML já no DOM. */
  { re: /^#\/construtor$/,      load: CST.load,                            render: CST.render,                    nav: '#/construtor', after: CST.after, explain: CONSTR.explainError },
  /* Parâmetros fica FORA do menu de propósito (pedido do Matt: "parametros
     pode deixar escondido, so vou usar as vezes"). A rota continua viva e é
     alcançada pelos botões da tela de gerar plano e da lista de planos. */
  { re: /^#\/parametros-corte$/, load: LOTES_UI.paramsScreenLoad,          render: LOTES_UI.paramsScreen,         nav: '#/planos' },
  { re: /^#\/producao$/,                                                   render: ScreensProducao.ops,           nav: '#/producao' },
  { re: /^#\/producao\/(.+)$/,                                             render: ScreensProducao.opDetail,      nav: '#/producao' },
  { re: /^#\/apontamento$/,                                                render: ScreensProducao.apontamento,   nav: '#/apontamento' },
  /* Catálogo de produtos em modo leitura (visão da fábrica). Fica fora do
     menu porque ENGENHARIA → Cadastro de produtos abre o admin, que é onde
     de fato se edita; esta tela continua alcançável pelos links internos. */
  { re: /^#\/produtos$/,        load: ScreensApoio.productsLoad,           render: ScreensApoio.products,         nav: '#/eng/produtos' },
  { re: /^#\/produtos\/(.+)$/,  load: ScreensApoio.productDetailLoad,      render: ScreensApoio.productDetail,    nav: '#/eng/produtos' },
  { re: /^#\/compras$/,                                                    render: ScreensApoio.purchases,        nav: '#/compras' },
  { re: /^#\/expedicao$/,                                                  render: ScreensApoio.shipping,         nav: '#/expedicao' },
  /* Embalagem (22/09) — pallet mais compacto por lote/pedido/módulo, com o
     motor de scratch/teste-pallet-3d.html (erp/js/pallet-engine.js). */
  /* Apontamento + Embalagem (TESTE, 25/09) — erp/js/screens-apont-embalagem.js */
  { re: /^#\/embalagem-teste$/, load: APEMB.load, render: APEMB.render, nav: '#/embalagem-teste', after: APEMB.after },
  { re: /^#\/embalagem$/,       load: EMBALAGEM.load,                      render: EMBALAGEM.render,              nav: '#/embalagem', after: EMBALAGEM.after },
  { re: /^#\/etiquetas$/,                                                  render: ScreensApoio.labels,           nav: '#/etiquetas' },
  /* PCP → Etiquetas: escolher o plano e imprimir. Endereço separado do
     desenho do layout (#/etiquetas, em Engenharia) de propósito — são dois
     trabalhos diferentes, feitos por pessoas diferentes. */
  { re: /^#\/etiquetas-impressao$/, load: ADMINX.printLabelsLoad,          render: ADMINX.printLabels,            nav: '#/etiquetas-impressao' },
  { re: /^#\/projetos$/,        load: ScreensApoio.projectsLoad,           render: ScreensApoio.projects,         nav: '#/projetos' },
  { re: /^#\/projetos\/(.+)$/,  load: ScreensApoio.projectDetailLoad,      render: ScreensApoio.projectDetail,    nav: '#/projetos' },
  /* Central de Contatos — dado real desde a migration 084 (era mockup). As
     quatro rotas usam o MESMO load de propósito: a ficha precisa dos perfis
     pra montar a matriz, e a tela de perfis precisa dos contatos pra dizer
     quem usa cada um. Buscar tudo de uma vez é mais simples e mais barato do
     que quatro consultas parciais. `explain` aponta pro erro certo (falta
     rodar a 084) em vez do explicador genérico de lotes. */
  { re: /^#\/contatos$/,        load: ScreensContatos.load,                render: ScreensContatos.lista,         nav: '#/contatos', explain: CT.explainError },
  { re: /^#\/contatos\/(.+)$/,  load: ScreensContatos.load,                render: ScreensContatos.ficha,         nav: '#/contatos', explain: CT.explainError },
  { re: /^#\/perfis$/,          load: ScreensContatos.load,                render: ScreensContatos.perfis,        nav: '#/perfis', explain: CT.explainError },
  { re: /^#\/perfis\/(.+)$/,    load: ScreensContatos.load,                render: ScreensContatos.perfilDetalhe, nav: '#/perfis', explain: CT.explainError }
];

/* #/eng/<slug> -> slug. Devolve null quando não é rota de cadastro (e não
   string vazia: '' é um slug inválido que precisa cair na tela de "não
   encontrado", não passar batido pelo roteador). */
APP.slugAdm = function (path) {
  const m = String(path || '').match(/^#\/eng\/([a-z-]*)$/);
  return m ? m[1] : null;
};

APP.parse = function (raw) {
  const qi = raw.indexOf('?');
  const path = qi >= 0 ? raw.slice(0, qi) : raw;
  const params = {};
  if (qi >= 0) {
    raw.slice(qi + 1).split('&').forEach(function (kv) {
      const p = kv.split('=');
      params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
    });
  }
  return { path: path, params: params };
};

/* Contador de renderizações: se o usuário troca de tela enquanto uma consulta
   está no ar, a resposta antiga não pode sobrescrever a tela nova. */
APP._seq = 0;

/* Endereços antigos que mudaram de casa. #/retalhos virou uma aba dentro de
   Materiais — duas telas mexendo no mesmo estoque era pedir divergência. O
   redirecionamento existe porque o link antigo pode estar num favorito ou
   num texto meu de outra tela. */
APP.ALIASES = {
  '#/retalhos': '#/materiais?tab=retalhos'
};

APP.render = async function () {
  const alias = APP.ALIASES[(location.hash || '').split('?')[0]];
  if (alias) { location.replace(location.pathname + location.search + alias); return; }

  const parsed = APP.parse(location.hash || '#/');
  const main = document.getElementById('erp-main');
  const seq = ++APP._seq;

  /* Cadastros do painel admin (#/eng/...) saem antes do roteador normal:
     eles não desenham nada em #erp-main, só revelam a tela já montada em
     #adm-root. Passar pelo caminho normal seria destrutivo — main.innerHTML
     apagaria formulários no meio do preenchimento. */
  const slugAdm = APP.slugAdm(parsed.path);
  if (slugAdm !== null) {
    APP.renderNav(parsed.path);
    APP._last = location.hash;
    ADM.mostrar(slugAdm);
    window.scrollTo(0, 0);
    return;
  }
  ADM.esconder();

  let matched = null, id = null;
  for (let i = 0; i < APP.routes.length; i++) {
    const m = parsed.path.match(APP.routes[i].re);
    if (m) { matched = APP.routes[i]; id = m[1] ? decodeURIComponent(m[1]) : null; break; }
  }

  if (!matched) {
    main.innerHTML = '<div class="erp-empty"><div class="erp-strong">Tela não encontrada</div>' +
      '<div style="margin-top:10px"><a class="erp-btn erp-btn-secondary" href="#/">Voltar ao painel</a></div></div>';
    APP.renderNav(null);
    return;
  }

  if (id) parsed.params.id = id;
  APP.renderNav(matched.nav);
  APP._last = location.hash;

  let payload = null;
  if (matched.load) {
    main.innerHTML = '<div class="erp-loading">Buscando no Supabase…</div>';
    try {
      payload = await matched.load(parsed.params);
    } catch (err) {
      if (seq !== APP._seq) return;
      /* LOTES.explainError sabe explicar o erro específico do schema erp
         ("não está exposto na API"), que DATA.explainError não reconheceria —
         e é justamente o erro mais provável na primeira vez que alguém abre
         a tela de lotes num banco novo. */
      const explain = matched.explain
        || ((typeof LOTES !== 'undefined' && LOTES.explainError) ? LOTES.explainError : DATA.explainError);
      main.innerHTML = UI.errorBox('Não consegui carregar os dados', explain(err)) +
        '<div><button class="erp-btn-secondary" onclick="APP.reload()">Tentar de novo</button></div>';
      console.error(err);
      return;
    }
  }

  if (seq !== APP._seq) return;

  try {
    main.innerHTML = matched.render(parsed.params, payload);
  } catch (err) {
    main.innerHTML = UI.errorBox('Erro ao montar a tela', err.message);
    console.error(err);
  }

  window.scrollTo(0, 0);
  if (parsed.path === '#/etiquetas') APP.initLabelDrag();
  /* Passo pós-render: coisa que só dá pra fazer com o HTML já no DOM (fechar
     <select> no valor certo, por exemplo — innerHTML não executa <script>). */
  if (matched.after) {
    try { matched.after(parsed.params, payload); }
    catch (err) { console.error('[after]', err); }
  }
};

APP.reload = function () {
  DATA.clearCache();
  APP.render();
};

APP.renderNav = function (active) {
  const group = APP.groupOf(active);

  document.getElementById('erp-nav').innerHTML = APP.menu.map(function (g) {
    /* Área sem tela própria abre no primeiro módulo dela. */
    const href = g.hash || (g.items[0] ? g.items[0].hash : '#/');
    const on = group && group.id === g.id;
    return '<a href="' + href + '" class="' + (on ? 'active' : '') + '">' + UI.esc(g.label) + '</a>';
  }).join('');

  const sub = document.getElementById('erp-subnav');
  if (!sub) return;
  if (!group || !group.items.length) {
    sub.innerHTML = '';
    sub.hidden = true;
    return;
  }
  sub.hidden = false;
  sub.innerHTML = '<div class="erp-subnav-inner">' + group.items.map(function (it) {
    return '<a href="' + it.hash + '" class="' + (it.hash === active ? 'active' : '') + '">' + UI.esc(it.label) + '</a>';
  }).join('') + '</div>';
};

/* Arrastar elementos no criador de etiqueta — só para sentir o posicionamento */
APP.initLabelDrag = function () {
  const canvas = document.getElementById('erp-label-canvas');
  if (!canvas) return;
  let drag = null;

  canvas.addEventListener('mousedown', function (e) {
    const el = e.target.closest('.erp-label-el');
    if (!el) return;
    canvas.querySelectorAll('.erp-label-el').forEach(function (x) { x.classList.remove('selected'); });
    el.classList.add('selected');
    drag = { el: el, sx: e.clientX, sy: e.clientY, ox: parseFloat(el.style.left), oy: parseFloat(el.style.top) };
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!drag) return;
    drag.el.style.left = Math.max(0, drag.ox + (e.clientX - drag.sx)) + 'px';
    drag.el.style.top = Math.max(0, drag.oy + (e.clientY - drag.sy)) + 'px';
  });

  document.addEventListener('mouseup', function () { drag = null; });
};

/* ============================================================
   Login
   ============================================================ */
APP.showLogin = function (msg, isError) {
  document.getElementById('erp-login').hidden = false;
  document.getElementById('erp-app').hidden = true;
  const el = document.getElementById('erp-login-msg');
  el.textContent = msg || '';
  el.className = 'erp-login-msg' + (isError ? ' err' : '');
};

APP.showApp = function () {
  document.getElementById('erp-login').hidden = true;
  document.getElementById('erp-app').hidden = false;
  document.getElementById('erp-user-name').textContent = DATA.user ? DATA.user.email : '';
  if (!location.hash) location.hash = '#/';
  APP.render();
};

APP.boot = async function () {
  const problema = DATA.connectionProblem();
  if (problema) {
    APP.showLogin(problema, true);
    document.getElementById('erp-login-btn').disabled = true;
    return;
  }

  try {
    await DATA.loadSession();
  } catch (err) {
    APP.showLogin(DATA.explainError(err), true);
    return;
  }

  if (!DATA.user) { APP.showLogin(); return; }

  if (!DATA.isAdmin) {
    await DATA.signOut();
    APP.showLogin('Esta conta não está na allow-list de admin — sem isso o RLS devolve tudo vazio. ' +
      'Abra o diagnóstico: ele mostra o comando SQL exato para se incluir.', true);
    return;
  }

  APP.showApp();
};

document.addEventListener('DOMContentLoaded', function () {
  const form = document.getElementById('erp-login-form');
  const btn = document.getElementById('erp-login-btn');

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await DATA.signIn(
        document.getElementById('erp-login-email').value.trim(),
        document.getElementById('erp-login-pass').value
      );
      if (!DATA.isAdmin) {
        await DATA.signOut();
        APP.showLogin('Esta conta não está na allow-list de admin — sem isso o RLS devolve tudo vazio. ' +
      'Abra o diagnóstico: ele mostra o comando SQL exato para se incluir.', true);
      } else {
        APP.showApp();
      }
    } catch (err) {
      APP.showLogin(DATA.explainError(err), true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });

  document.getElementById('erp-logout').addEventListener('click', async function () {
    await DATA.signOut();
    DATA.clearCache();
    APP.showLogin('Você saiu.');
  });

  /* Recarregar de um cadastro: refaz a leitura do catálogo inteiro, não só
     da tela aberta — é o catálogo que alimenta os selects cruzados entre
     elas. */
  const recarregarAdm = document.getElementById('erp-adm-reload');
  if (recarregarAdm) {
    recarregarAdm.addEventListener('click', function () {
      const slug = APP.slugAdm(APP.parse(location.hash || '').path);
      if (slug !== null) ADM.recarregar(slug);
    });
  }

  window.addEventListener('hashchange', APP.render);
  APP.boot();
});
