// Bancada do sininho da fábrica (js/portal-46-sininho.js) — jsdom, banco de mentira.
// node scripts/tests/teste-sininho.js
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const src = fs.readFileSync(path.join(__dirname, '../../js/portal-46-sininho.js'), 'utf8');
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const agora = Date.now(); const iso = (min) => new Date(agora - min * 60000).toISOString();
function monta(admin) {
  const dom = new JSDOM('<body><div><button id="po-margins-btn" class="po-help-link"></button></div><button class="portal-tab-btn" data-tab="po-tab-my-orders"></button></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window; const banco = { pessoas: [], pedidos: [] }; const cliques = [];
  w.LEGNO_IS_ADMIN = admin;
  w.LegnoMinhaEmpresa = { abrir: (t) => cliques.push('me:' + t) };
  w.document.querySelector('.portal-tab-btn').addEventListener('click', () => cliques.push('central'));
  banco.projetos = [];
  const tabela = (lista) => { const q = { select() { return q; }, gte() { return q; }, neq(c, v) { q._me = v; return q; }, order() { return q; }, limit() { return Promise.resolve({ data: banco[lista].filter((o) => o.client_user_id !== q._me), error: null }); } }; return q; };
  w.eval('var currentUser = { id: "eu" }; var supabaseClient;');
  w.supabaseClient = { rpc: async () => ({ data: banco.pessoas, error: null }), from: (t) => tabela(t === 'user_projects' ? 'projetos' : 'pedidos') };
  w.eval('supabaseClient = window.supabaseClient;');
  w.eval(src);
  return { w, banco, cliques };
}
(async () => {
  console.log('não-admin');
  let t = monta(false); await t.w.LegnoSino.atualizar();
  ok(!t.w.document.getElementById('po-sino-btn'), 'nada é criado no DOM');

  console.log('admin');
  t = monta(true);
  t.banco.pessoas = [{ user_id: 'velho', email: 'velho@a.com', registered_at: iso(60), is_admin: false }];
  t.banco.pedidos = [{ id: 'o0', client_user_id: 'velho', status: 'approved', po_name: 'ANTIGO', created_at: iso(30) }, { id: 'meu', client_user_id: 'eu', status: 'submitted', po_name: 'MEU', created_at: iso(1) }];
  t.w.localStorage.setItem('legno_sino_visto_eu', iso(10));
  await t.w.LegnoSino.atualizar();
  const d = t.w.document; const n = () => d.getElementById('po-sino-n');
  ok(!!d.getElementById('po-sino-btn'), 'sino aparece na barra');
  ok(n().style.display === 'none' && t.w.LegnoSino.novos() === 0, 'o que é anterior ao "já vi" não conta');
  t.banco.pessoas.push({ user_id: 'novo', email: 'novo@b.com', registered_at: iso(2), is_admin: false });
  t.banco.pedidos.unshift({ id: 'o1', client_user_id: 'novo', status: 'submitted', po_name: 'KITCHEN', created_at: iso(1) });
  await t.w.LegnoSino.atualizar();
  ok(n().textContent === '2' && n().style.display !== 'none', 'cadastro novo + pedido novo = 2 no número');
  d.getElementById('po-sino-btn').click();
  const p = d.getElementById('po-sino-painel');
  ok(p && p.querySelectorAll('.sn-it').length === 4, 'painel lista os 4 avisos (meu próprio pedido fica fora)');
  ok(p.querySelectorAll('.sn-it.novo').length === 2, '2 marcados como novos');
  ok(/KITCHEN/.test(p.textContent) && /novo@b.com/.test(p.textContent) && !/MEU/.test(p.textContent), 'mostra PO e e-mail');
  ok(n().style.display === 'none', 'abrir zera o número');
  p.querySelector('.sn-it[data-tipo="user"]').click();
  ok(t.cliques[0] === 'me:pessoas' && !d.getElementById('po-sino-painel'), 'clique no cadastro abre Pessoas e fecha');
  await t.w.LegnoSino.atualizar();
  ok(t.w.LegnoSino.novos() === 0, 'depois de aberto, não volta a contar');
  d.getElementById('po-sino-btn').click(); d.querySelector('.sn-it[data-tipo="order"]').click();
  ok(t.cliques[1] === 'central', 'clique no pedido abre a Central');
  console.log('projeto novo');
  t = monta(true);
  t.banco.pessoas = [{ user_id: 'v1', email: 'ana@loja.com', registered_at: iso(60 * 24 * 30), is_admin: false }];
  t.banco.projetos = [
    { id: 'p1', client_user_id: 'v1', name: 'Cozinha Silva', client_folder: 'Silva', frozen_order_id: null, created_at: iso(3) },
    { id: 'p2', client_user_id: 'v1', name: 'Já virou pedido', frozen_order_id: 'o9', created_at: iso(4) },
    { id: 'p3', client_user_id: 'eu', name: 'Meu', frozen_order_id: null, created_at: iso(2) }
  ];
  t.w.localStorage.setItem('legno_sino_visto_eu', iso(10));
  await t.w.LegnoSino.atualizar();
  ok(t.w.document.getElementById('po-sino-n').textContent === '1', 'projeto novo de outra pessoa conta no sininho (o meu e o que já virou pedido não)');
  t.w.document.getElementById('po-sino-btn').click();
  const txt = t.w.document.getElementById('po-sino-painel').textContent;
  ok(/Cozinha Silva/.test(txt) && /ana · Silva/.test(txt) && !/Já virou pedido/.test(txt) && !/Meu/.test(txt), 'mostra nome, quem fez e a pasta');
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO'); process.exit(falhas ? 1 : 0);
})();
