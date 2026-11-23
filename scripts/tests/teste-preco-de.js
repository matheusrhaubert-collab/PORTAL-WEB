// Bancada do "Preço de:" (js/portal-47-preco-de.js) — jsdom, banco de mentira,
// com os getters DE VERDADE do portal-05 (trecho de preço).
// node scripts/tests/teste-preco-de.js
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '../../js/portal-47-preco-de.js'), 'utf8');
const p05 = fs.readFileSync(path.join(__dirname, '../../js/portal-05-cutlist.js'), 'utf8');
const corta = (a, b) => p05.slice(p05.indexOf(a), p05.indexOf(b));
const preco = corta('function isSellerAccount()', '// Linha antiga de "Margem geral de revenda"')
  + corta('let dealerFactoryDiscountPct = 0;', '// ---------- PORTAL DEALER')
  + corta('function hasDealerTools()', '// Quem pode gerar Proposta');
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const perto = (a, b) => Math.abs(a - b) < 0.005;
const PERFIS = [
  { user_id: 'eu', email: 'matt@legno.com', role: 'administrador', resale_margin_pct: 100, factory_discount_pct: 57 },
  { user_id: 'd1', email: 'dono@loja.com', role: 'lojista', store_name: 'Loja Um', store_phone: '111', logo_url: 'http://x/l.png', resale_margin_pct: 50, factory_discount_pct: 60 },
  { user_id: 'v1', email: 'ana@loja.com', role: 'vendedor', parent_dealer_user_id: 'd1', seller_margin_pct: 150, resale_margin_pct: 0 },
  { user_id: 'v2', email: 'bob@loja.com', role: 'vendedor', parent_dealer_user_id: 'd1', seller_margin_pct: null },
  { user_id: 'c1', email: 'cli@x.com', role: 'cliente', resale_margin_pct: 20, factory_discount_pct: 99 }
];
const EXTRAS = [
  { dealer_user_id: 'd1', side: 'custo', kind: 'pct', sign: 'add', value: 5, sort_order: 0 },
  { dealer_user_id: 'd1', side: 'margem', kind: 'fixed', sign: 'add', value: 50, sort_order: 0 },
  { dealer_user_id: 'eu', side: 'margem', kind: 'fixed', sign: 'add', value: 7, sort_order: 0 }
];
function monta(admin) {
  const dom = new JSDOM('<body><div id="po-tab-projects"><div id="po-proj-canvas-tools"><div class="po-tb-group po-tb-direita"></div></div></div><div id="po-margins-body"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/', pretendToBeVisual: true });
  const w = dom.window; const log = { reprice: 0, dirty: 0 };
  w.LEGNO_IS_ADMIN = admin;
  const tab = (nome) => { const q = { _f: null, select() { return q; }, order() { return q.then ? q : q; }, eq(c, v) { q._f = v; return q; },
    range() { return Promise.resolve({ data: PERFIS, error: null }); },
    then(res) { return Promise.resolve({ data: EXTRAS.filter((x) => x.dealer_user_id === q._f), error: null }).then(res); } }; return q; };
  w.supabaseClient = { from: tab };
  w.__log = log;
  w.eval('var currentUser = { id: "eu" }; var currentUserProfile = ' + JSON.stringify(PERFIS[0]) + '; var supabaseClient = window.supabaseClient;'
    + preco
    + '; resolvedDisplayMarginPct = 100; dealerFactoryDiscountPct = 57; dealerPricingExtras = ' + JSON.stringify(EXTRAS.filter((x) => x.dealer_user_id === 'eu')) + ';'
    + 'var _ci = null; function getProjectClientInfo() { return _ci ? Object.assign({}, _ci) : null; } function setProjectClientInfo(r) { _ci = r && r.name ? { name: r.name } : null; }'
    + 'function repriceAllProjectSlots() { __log.reprice++; } function markProjectDirty() { __log.dirty++; }'
    + 'var _mm = null; function renderMarginsModal() { _mm = [getFactoryDiscountPct(), getResaleMarginPct(), resolveDealerPricingExtras("margem").length]; }');
  w.eval(src);
  return { w, log };
}
(async () => {
  console.log('não-admin');
  let t = monta(false); t.w.LegnoPrecoDe._monta();
  ok(!t.w.document.getElementById('po-proj-tb-precode'), 'nada é criado no DOM');
  await t.w.LegnoPrecoDe.escolher('d1');
  ok(t.w.getFactoryDiscountPct() === 57, 'escolher não muda o preço de quem não é admin');

  console.log('admin');
  t = monta(true); const w = t.w; w.LegnoPrecoDe._monta();
  const g = w.document.getElementById('po-proj-tb-precode');
  ok(!!g && g.previousElementSibling.classList.contains('po-tb-direita'), 'grupo criado depois do grupo Projeto (direita da barra)');
  const meu = w.getDisplayPrice(1000);
  ok(perto(meu, 1000 * 0.43 * 2 + 7), 'sem escolha = meu preço (' + meu + ')');

  await w.LegnoPrecoDe.escolher('d1');
  ok(w.getFactoryDiscountPct() === 60 && w.getResaleMarginPct() === 50, 'dealer: desconto 60 e margem 50');
  ok(perto(w.computeCustoBase(1000), 450), 'dealer: custo = 1000 −60% +5% de extra = 450');
  ok(perto(w.getDisplayPrice(1000), 450 * 1.5 + 50), 'dealer: venda = 450 × 1,5 + $50 = 725');
  ok(perto(w.getDisplayPriceRatioOnly(1000), 675), 'dealer: por item (sem o fixo) = 675');
  ok(w.LegnoPrecoDe.marca().store_name === 'Loja Um', 'proposta com a loja do dealer');
  ok(t.log.reprice === 1 && t.log.dirty === 1, 'repreça e marca o projeto como alterado');
  ok(w.document.getElementById('po-pd-btn').textContent.indexOf('Loja Um') >= 0, 'botão mostra a loja');

  w.renderMarginsModal();
  ok(w.eval('_mm').join() === '57,100,1', 'modal Margens continua com a MINHA config');

  w.document.getElementById('po-tab-projects').style.display = 'none';
  ok(perto(w.getDisplayPrice(1000), meu) && w.LegnoPrecoDe.marca() === null, 'fora da aba Projetos = meu preço');
  w.document.getElementById('po-tab-projects').style.display = '';

  await w.LegnoPrecoDe.escolher('v1');
  ok(perto(w.getDisplayPrice(1000), 450 * 2.5 + 50), 'vendedor com margem própria (150%) sobre o custo da loja');
  ok(w.LegnoPrecoDe.marca().store_name === 'Loja Um', 'vendedor: proposta com a loja do dealer pai');
  await w.LegnoPrecoDe.escolher('v2');
  ok(perto(w.getDisplayPrice(1000), 725), 'vendedor sem margem própria = igual ao dealer');
  await w.LegnoPrecoDe.escolher('c1');
  ok(w.getFactoryDiscountPct() === 0 && perto(w.getDisplayPrice(1000), 1200), 'cliente: sem desconto de fábrica, só a margem dele');

  console.log('vai junto com o projeto');
  const ci = w.getProjectClientInfo();
  ok(ci && ci.price_user_id === 'c1', 'salvar leva price_user_id no client_info');
  const antes = t.log.dirty;
  w.setProjectClientInfo(null); await new Promise((r) => setTimeout(r, 20));
  ok(w.LegnoPrecoDe.atual() === null && perto(w.getDisplayPrice(1000), meu), 'projeto novo volta pra "Eu"');
  ok(w.getProjectClientInfo() === null, 'sem escolha o client_info fica como era');
  w.setProjectClientInfo({ name: 'Fulano', price_user_id: 'd1' }); await new Promise((r) => setTimeout(r, 20));
  ok(w.LegnoPrecoDe.atual() === 'd1' && perto(w.getDisplayPrice(1000), 725), 'abrir projeto traz a escolha de volta');
  ok(w.getProjectClientInfo().name === 'Fulano', 'dados do cliente preservados');
  ok(t.log.dirty === antes, 'abrir/limpar projeto não marca como alterado');
  await w.LegnoPrecoDe.escolher('eu');
  ok(w.LegnoPrecoDe.atual() === null, 'escolher a mim mesmo = limpar');

  console.log('lista');
  w.document.getElementById('po-pd-btn').click(); await new Promise((r) => setTimeout(r, 20));
  const itens = Array.from(w.document.querySelectorAll('#po-pd-pop [data-pd]')).map((e) => e.getAttribute('data-pd'));
  ok(itens.join() === ',d1,v1,v2,c1', 'Eu, dealer com a equipe embaixo, depois os sem loja (' + itens.join() + ')');
  const inp = w.document.querySelector('#po-pd-pop input'); inp.value = 'ana'; inp.dispatchEvent(new w.Event('input'));
  const f = Array.from(w.document.querySelectorAll('#po-pd-pop [data-pd]')).map((e) => e.getAttribute('data-pd'));
  ok(f.join() === ',d1,v1', 'busca "ana" acha a vendedora (com a loja dela)');
  w.document.querySelector('#po-pd-pop [data-pd="v1"]').click(); await new Promise((r) => setTimeout(r, 20));
  ok(w.LegnoPrecoDe.atual() === 'v1' && !w.document.getElementById('po-pd-pop'), 'clicar escolhe e fecha');

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.');
  process.exit(falhas ? 1 : 0);
})();
