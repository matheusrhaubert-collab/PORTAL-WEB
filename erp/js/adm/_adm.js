/* Painel admin dentro do ERP — a costura.
 *
 * O QUE ESTE ARQUIVO RESOLVE
 * As 14 telas do antigo painel admin não são independentes: loadColors()
 * popula <select> que vive na tela de componentes, loadModuleFunctions()
 * popula um campo da tela de módulos, e assim por diante. Carregar uma tela
 * de cada vez, sob demanda, quebraria metade dos formulários — foi por isso
 * que o admin sempre carregou tudo de uma vez.
 *
 * Então o markup das 14 telas é injetado JUNTO, uma vez só, dentro de
 * #adm-root. O menu do ERP só decide qual delas fica visível. É exatamente
 * o que o admin.html fazia com a barra lateral dele; mudou quem manda.
 *
 * ORDEM DE CARREGAMENTO (erp/index.html)
 *   1. _adm.js            (este: cria ADM_TELAS e ADM)
 *   2. adm/telas/*.js     (preenchem ADM_TELAS com o HTML)
 *   3. ADM.montar()       (injeta o HTML no #adm-root)
 *   4. adm/00-base.js ... (o JS do admin, que registra listeners nos ids
 *                          recém-injetados — por isso vem DEPOIS do montar)
 */

/* Preenchido pelos arquivos de adm/telas/. */
const ADM_TELAS = {};

const ADM = {};

/* slug da rota do ERP  ->  [id da tela, título, subtítulo] */
ADM.TABS = {
  'produtos':          ['tab-module-config',     'Cadastro de produtos',      'Módulos do catálogo: dimensões, componentes, opções e preço.'],
  'componentes':       ['tab-components',        'Cadastro de componentes',   'Peças e módulos aninhados que montam cada produto.'],
  'tipos-componente':  ['tab-component-types',   'Tipos de componente',       'Os tipos que os componentes usam como base.'],
  'cores':             ['tab-colors',            'Cadastro de cores',         'Cores e materiais, com espessura, textura e tamanho de chapa.'],
  'taxonomia':         ['tab-taxonomy',          'Taxonomia',                 'Famílias, categorias e subcategorias — e a ordem das abas no portal.'],
  'ferragens':         ['tab-catalogs',          'Ferragens e mão de obra',   'Dobradiças, corrediças e custos de mão de obra.'],
  // ITENS COMPRADOS (migration 119). Nasce SEPARADA de 'ferragens' de
  // propósito: aquela tela é dobradiça/corrediça + mão de obra no mesmo
  // lugar, que é justamente a mistura que esta veio desfazer (o preço de
  // compra da ferragem estava gravado como labor_type). Dobradiça e
  // corrediça migram pra cá na fase 2.
  // LEMBRETE: registrar aqui NÃO faz a tela aparecer — o menu sai do
  // APP.menu em erp/js/app.js. As duas listas, sempre.
  'comprados':         ['tab-purchased-items',   'Itens comprados',           'O que a fábrica compra pronto — e a regra que liga cada ferragem ao furo que a pede.'],
  'furacao':           ['tab-drilling-settings', 'Furação',                   'Parâmetros de furação exportados no .ban da máquina.'],
  // APOSENTADO em 2026-08-15 (Matt: "pode eliminar essa tela antiga então").
  // Era o configurador da furação DE UM COMPONENTE — o modelo antigo, em que
  // cada peça especializada carregava os próprios furos. A linha "flatbord"
  // tem só dois componentes crus, então a furação virou catálogo reutilizável
  // ('programas-furacao', abaixo). Fica comentado em vez de apagado: o HTML e
  // o JS dele continuam no repositório, então basta descomentar esta linha
  // pra tela voltar enquanto os componentes antigos existirem.
  // 'furacao-peca':      ['tab-drilling-editor',   'Configurador de furação',   'Escolha a peça e posicione os furos, com o desenho na convenção da máquina.'],
  // Catálogo de PROGRAMAS (migration 105) — separado do configurador acima de
  // propósito: aquele edita a furação DE UM COMPONENTE (modelo antigo), este
  // é o catálogo reutilizável que a linha "flatbord" usa, escolhido por peça
  // na tela do produto.
  'programas-furacao': ['tab-drilling-patterns', 'Programas de furação',      'Catálogo de furações reutilizáveis, escolhidas por peça no cadastro do produto.'],
  'agregados':         ['tab-agregados',         'Agregados do construtor',   'O que um vão pode receber no construtor de armários, e quais módulos aceitam cada um.'],
  'referencias':       ['tab-references',        'Referências (SKU)',         'Fotos de referência dos módulos.'],
  'margem':            ['tab-pricing-settings',  'Margem de preço',           'Perfis de margem por família e por categoria.'],
  'crm':               ['tab-crm-clients',       'Clientes (CRM)',            'Cadastro comercial da fábrica: contato, empresa e histórico de reuniões.'],
  'controladoria':     ['tab-controladoria',     'Controladoria',             'Pedidos entrados, orçamentos e novos clientes por período.'],
  'galeria':           ['tab-gallery',           'Galeria',                   'Composições públicas exibidas no portal do cliente.'],
  'gerar-ban':         ['tab-orders',            'Gerar .ban',                'Escolha o pedido para tirar a lista de peças (CSV) e o ZIP de .ban da furação.'],
  'usuarios-antigo':   ['tab-profiles',          'Usuários do portal (antigo)', 'Tela antiga de logins. O lugar certo agora é Administrativo → Contatos.']
};

ADM.slugDaTela = function (tabId) {
  for (const slug in ADM.TABS) if (ADM.TABS[slug][0] === tabId) return slug;
  return null;
};

/* ---------- montagem ---------- */

ADM.montado = false;

ADM.montar = function () {
  if (ADM.montado) return;
  const raiz = document.getElementById('adm-root');
  if (!raiz) { console.error('[adm] #adm-root não existe — o markup não foi injetado.'); return; }

  const ordem = Object.keys(ADM_TELAS);
  raiz.innerHTML = ordem.map(function (id) {
    return '<div class="admin-tab-page" id="' + id + '" style="display:none">' + ADM_TELAS[id] + '</div>';
  }).join('');

  ADM.montado = true;

  const esperadas = Object.keys(ADM.TABS).length;
  if (ordem.length !== esperadas) {
    console.warn('[adm] ' + ordem.length + ' telas injetadas, ' + esperadas + ' esperadas pelo menu.');
  }
};

/* ---------- carga sob demanda ---------- */

/* Telas que só buscam dados quando abertas. No admin isso era um listener no
   botão da barra lateral; aqui o gatilho é a navegação do ERP. O `chamado`
   evita repetir a consulta a cada visita — o botão Recarregar existe pra
   quando se quer de propósito. */
ADM._aoAbrir = {};
ADM._jaChamado = {};

ADM.aoAbrir = function (tabId, fn) {
  if (!ADM._aoAbrir[tabId]) ADM._aoAbrir[tabId] = [];
  ADM._aoAbrir[tabId].push(fn);
};

/* aoAbrir roda UMA vez (é carga de dados). aoEntrar/aoSair rodam a CADA
   navegação — existem para tela que mexe no DOM de outra e precisa desfazer
   ao sair, como o Configurador de furação, que empresta o editor da tela de
   componentes e tem que devolver. */
ADM._aoEntrar = {};
ADM._aoSair = {};
ADM._telaAtual = null;

ADM.aoEntrar = function (tabId, fn) {
  if (!ADM._aoEntrar[tabId]) ADM._aoEntrar[tabId] = [];
  ADM._aoEntrar[tabId].push(fn);
};

ADM.aoSair = function (tabId, fn) {
  if (!ADM._aoSair[tabId]) ADM._aoSair[tabId] = [];
  ADM._aoSair[tabId].push(fn);
};

ADM._disparar = function (mapa, tabId) {
  const fns = mapa[tabId];
  if (!fns) return;
  fns.forEach(function (fn) {
    try { fn(); } catch (err) { console.error('[adm] gancho da tela ' + tabId, err); }
  });
};

/* Sair da tela atual, seja para outra tela do painel ou para fora dele. */
ADM._sairDaAtual = function (proxima) {
  if (ADM._telaAtual && ADM._telaAtual !== proxima) {
    ADM._disparar(ADM._aoSair, ADM._telaAtual);
  }
  ADM._telaAtual = proxima || null;
};

/* Primeira carga do painel: pesada (catálogo inteiro), então só acontece
   quando o usuário realmente abre um cadastro. */
ADM._carregando = null;

ADM.garantirCarga = function () {
  if (!ADM._carregando) {
    ADM._carregando = (async function () {
      try {
        await showLoggedIn();
      } catch (err) {
        console.error('[adm] falha na carga inicial do painel', err);
        ADM._carregando = null; // deixa tentar de novo
        throw err;
      }
    })();
  }
  return ADM._carregando;
};

/* ---------- navegação ---------- */

ADM.irPara = function (tabId) {
  const slug = ADM.slugDaTela(tabId);
  if (slug) location.hash = '#/eng/' + slug;
};

ADM.mostrar = async function (slug) {
  const entrada = ADM.TABS[slug];
  const host = document.getElementById('erp-adm-host');
  const main = document.getElementById('erp-main');

  if (!entrada) {
    ADM._sairDaAtual(null);
    main.innerHTML = '<div class="erp-empty"><div class="erp-strong">Cadastro não encontrado</div>' +
      '<div class="erp-muted erp-small" style="margin-top:6px">O endereço <span class="erp-mono">#/eng/' +
      UI.esc(slug || '') + '</span> não corresponde a nenhuma tela.</div>' +
      '<div style="margin-top:10px"><a class="erp-btn erp-btn-secondary" href="#/">Voltar ao painel</a></div></div>';
    main.hidden = false;
    host.hidden = true;
    return;
  }

  const tabId = entrada[0];
  /* Antes de trocar o que está visível: quem sai precisa desfazer o que fez
     no DOM alheio, senão a tela de destino recebe o empréstimo pela metade. */
  ADM._sairDaAtual(tabId);
  main.hidden = true;
  host.hidden = false;
  document.getElementById('erp-adm-title').textContent = entrada[1];
  document.getElementById('erp-adm-sub').textContent = entrada[2];

  /* Uma tela visível por vez — as outras continuam no DOM, que é o que faz
     os selects cruzados entre telas continuarem funcionando. */
  document.querySelectorAll('#adm-root > .admin-tab-page').forEach(function (p) {
    p.style.display = (p.id === tabId) ? 'block' : 'none';
  });

  const aviso = document.getElementById('erp-adm-aviso');
  aviso.hidden = true;

  /* ANTES de esperar o catálogo: aoEntrar arruma o DOM da tela (o
     Configurador de furação, por exemplo, traz pra cá o editor emprestado da
     tela de componentes). Se isso ficasse depois do await, a tela apareceria
     vazia enquanto os dados viajam — e não apareceria NUNCA se a leitura
     falhasse, o que esconderia a estrutura em vez de mostrar o erro dentro
     dela. Quem depende de dado usa aoAbrir, que roda depois. */
  ADM._disparar(ADM._aoEntrar, tabId);

  try {
    await ADM.garantirCarga();
  } catch (err) {
    aviso.hidden = false;
    aviso.innerHTML = UI.errorBox('Não consegui carregar os cadastros',
      (err && err.message) ? err.message : 'Erro desconhecido na leitura do catálogo.');
    return;
  }

  const lazy = ADM._aoAbrir[tabId];
  if (lazy && !ADM._jaChamado[tabId]) {
    ADM._jaChamado[tabId] = true;
    lazy.forEach(function (fn) {
      try { fn(); } catch (err) { console.error('[adm] carga da tela ' + tabId, err); }
    });
  }
};

ADM.esconder = function () {
  /* Sair do painel inteiro conta como sair da tela — senão um empréstimo de
     DOM ficaria pendurado enquanto o usuário navega pelo resto do ERP. */
  ADM._sairDaAtual(null);
  const host = document.getElementById('erp-adm-host');
  if (host) host.hidden = true;
  const main = document.getElementById('erp-main');
  if (main) main.hidden = false;
};

/* Recarrega a tela aberta: refaz a carga geral e a carga sob demanda dela. */
ADM.recarregar = async function (slug) {
  ADM._carregando = null;
  const entrada = ADM.TABS[slug];
  if (entrada) delete ADM._jaChamado[entrada[0]];
  await ADM.mostrar(slug);
};
