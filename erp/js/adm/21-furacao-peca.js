/* Painel admin — Configurador de furação (tela própria em Engenharia)
 *
 * O editor de furação já existia, mas enterrado: Cadastro de componentes ->
 * achar a peça -> Editar -> rolar até o fim do formulário. Esta tela põe a
 * mesma coisa a dois cliques.
 *
 * COMO ELA NÃO DUPLICA NADA
 * O markup do editor (#component-drilling-section) e o das medidas de teste
 * (#component-preview, que alimenta o desenho) continuam sendo os ORIGINAIS.
 * Ao abrir esta tela eles são movidos pra cá; ao sair, voltam exatamente pro
 * lugar onde estavam. Não há cópia, então não há id repetido e nenhum
 * listener precisou ser registrado de novo — os que já existiam continuam
 * valendo, porque são os mesmos nós.
 *
 * Salvar é o submit do formulário de componente, de onde os furos sempre
 * foram salvos (saveComponentDrillings roda dentro dele). Chamar
 * requestSubmit() em vez de recriar a gravação evita ter duas gravações
 * diferentes pra mesma coisa, que é como as duas telas divergiriam.
 */

const FURACAO_PECA = {};

/* Onde cada bloco morava, pra devolver no lugar certo. Guarda o PAI e o
   irmão seguinte: só o pai não basta, o bloco voltaria pro fim. */
FURACAO_PECA._origem = {};

FURACAO_PECA.BLOCOS = [
  ['component-preview', 'furacao-peca-encaixe-medidas'],
  ['component-drilling-section', 'furacao-peca-encaixe-furos']
];

FURACAO_PECA.trazer = function () {
  FURACAO_PECA.BLOCOS.forEach(function (par) {
    const bloco = document.getElementById(par[0]);
    const encaixe = document.getElementById(par[1]);
    if (!bloco || !encaixe || bloco.parentNode === encaixe) return;
    FURACAO_PECA._origem[par[0]] = { pai: bloco.parentNode, depois: bloco.nextSibling };
    encaixe.appendChild(bloco);
    // Depois da reorganização do cadastro (migration 089) o bloco de furação
    // virou um <details> que nasce FECHADO — faz sentido lá, onde ele é uma
    // seção entre outras, mas aqui ele é o assunto da tela inteira. Abrir na
    // chegada é o mínimo pra esta tela não abrir vazia.
    if (bloco.tagName === 'DETAILS') bloco.open = true;
  });
};

FURACAO_PECA.devolver = function () {
  FURACAO_PECA.BLOCOS.forEach(function (par) {
    const bloco = document.getElementById(par[0]);
    const o = FURACAO_PECA._origem[par[0]];
    if (!bloco || !o || !o.pai) return;
    o.pai.insertBefore(bloco, o.depois || null);
    delete FURACAO_PECA._origem[par[0]];
  });
};

/* A lista sai do componentsCache, que o carregamento do painel já preencheu —
   sem consulta nova. */
FURACAO_PECA.preencherLista = function () {
  const sel = document.getElementById('furacao-peca-select');
  const busca = document.getElementById('furacao-peca-busca');
  if (!sel) return;

  const filtro = (busca && busca.value.trim().toLowerCase()) || '';
  const escolhido = sel.value;

  const lista = (typeof componentsCache !== 'undefined' ? componentsCache : [])
    .filter(function (c) {
      if (!filtro) return true;
      return String(c.reference || '').toLowerCase().includes(filtro);
    })
    .sort(function (a, b) { return String(a.reference).localeCompare(String(b.reference)); });

  sel.innerHTML = '<option value="">— escolha a peça —</option>' +
    lista.map(function (c) {
      const tipo = c.component_types ? c.component_types.name : '';
      return '<option value="' + c.id + '">' + UI.esc(c.reference) +
        (tipo ? ' · ' + UI.esc(tipo) : '') + '</option>';
    }).join('');

  /* Mantém a peça aberta selecionada mesmo depois de filtrar. */
  if (escolhido && lista.some(function (c) { return c.id === escolhido; })) sel.value = escolhido;

  const status = document.getElementById('furacao-peca-status');
  if (status && filtro) status.textContent = lista.length + ' peça(s) no filtro.';
};

FURACAO_PECA.abrirPeca = function (id) {
  const salvar = document.getElementById('furacao-peca-salvar');
  const status = document.getElementById('furacao-peca-status');

  if (!id) {
    if (salvar) salvar.disabled = true;
    if (status) status.textContent = '';
    return;
  }

  /* editComponent carrega a peça inteira no formulário (inclusive os furos
     já salvos) e redesenha a prévia. O scrollIntoView que ele faz no fim cai
     num elemento escondido — sem efeito, e sem problema. */
  window.editComponent(id);

  if (salvar) salvar.disabled = false;
  const c = (typeof componentsCache !== 'undefined' ? componentsCache : [])
    .find(function (x) { return x.id === id; });
  if (status) {
    status.textContent = c
      ? 'Editando a furação de "' + c.reference + '". As medidas de teste abaixo só afetam o desenho, não o cadastro.'
      : '';
  }
};

FURACAO_PECA.salvar = function () {
  const form = document.getElementById('component-form');
  const status = document.getElementById('furacao-peca-status');
  if (!form) return;
  if (status) status.textContent = 'Salvando...';
  /* requestSubmit dispara o submit COM validação, ao contrário de submit(),
     que a pularia — e o formulário tem campos obrigatórios. */
  form.requestSubmit();
  if (status) status.textContent = 'Furação salva junto com o cadastro da peça.';
};

/* Ligações da tela. Rodam uma vez, no carregamento: os elementos já estão no
   DOM porque ADM.montar() injetou todas as telas antes deste arquivo. */
(function () {
  const busca = document.getElementById('furacao-peca-busca');
  const sel = document.getElementById('furacao-peca-select');
  const salvar = document.getElementById('furacao-peca-salvar');

  if (busca) busca.addEventListener('input', FURACAO_PECA.preencherLista);
  if (sel) sel.addEventListener('change', function () { FURACAO_PECA.abrirPeca(sel.value); });
  if (salvar) salvar.addEventListener('click', FURACAO_PECA.salvar);
})();

/* aoEntrar e aoSair (não aoAbrir): o empréstimo do DOM tem que acontecer a
   CADA visita e ser desfeito a cada saída. Se fosse carga única, na segunda
   visita a tela apareceria vazia — os blocos teriam voltado pra tela de
   componentes e ninguém os traria de novo. */
ADM.aoEntrar('tab-drilling-editor', function () {
  FURACAO_PECA.trazer();
  FURACAO_PECA.preencherLista();
});

ADM.aoSair('tab-drilling-editor', FURACAO_PECA.devolver);

/* Na PRIMEIRA visita o aoEntrar acontece antes do catálogo chegar, então a
   lista nasce vazia. aoAbrir roda depois da carga e a preenche. Nas visitas
   seguintes o aoEntrar já encontra o cache pronto e isto não faz falta. */
ADM.aoAbrir('tab-drilling-editor', FURACAO_PECA.preencherLista);
