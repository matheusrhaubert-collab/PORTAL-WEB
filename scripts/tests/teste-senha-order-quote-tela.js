// Bancada da porta de senha do $ Order quote (portal-06b, migration 338) — jsdom.
// node scripts/tests/teste-senha-order-quote-tela.js
const fs = require('fs'); const path = require('path'); const { JSDOM } = require('jsdom');
const p06 = fs.readFileSync(path.join(__dirname, '../../js/portal-06b-projetos-canvas-ia-custo.js'), 'utf8');
const bloco = p06.slice(p06.indexOf('let moneyPedidoLiberado = false;'), p06.indexOf('// ---- Aba FÁBRICA: custo puro'));
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const espera = () => new Promise((r) => setTimeout(r, 30));
ok(/if \(moneyAbaAtual !== 'pedido'\) moneyPedidoLiberado = false;\s+else if \(!moneyPedidoLiberado\) \{ renderMoneyPedidoSenha\(body\); return; \}/.test(p06), 'renderMoneyModal tem a trava antes de desenhar qualquer número');
ok(/classList\.remove\('open'\);\s+moneyPedidoLiberado = false;/.test(p06), 'fechar a janela tranca de novo');
function monta(comBanco) {
  const dom = new JSDOM('<body><div id="b"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window; const banco = { senha: null, login: 'login123' };
  w.crypto.subtle || Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto });
  w.TextEncoder = TextEncoder;
  w.fetch = async (u, o) => ({ ok: JSON.parse(o.body).password === banco.login });
  w.supabaseClient = { rpc: async (f, a) => {
    if (!comBanco) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + f + ' in the schema cache' } };
    if (f === 'order_quote_pass_status') return { data: banco.senha != null, error: null };
    if (f === 'order_quote_pass_check') return { data: banco.senha != null && a.p_pass === banco.senha, error: null };
    if (f === 'order_quote_pass_set') { if (banco.senha != null) return { data: null, error: { message: 'Senha atual incorreta.' } }; banco.senha = a.p_new; return { data: true, error: null }; }
    if (f === 'order_quote_pass_reset') { banco.senha = null; return { data: true, error: null }; }
  } };
  w.eval('var currentUser = { id: "u1", email: "d@x.com" }; var SUPABASE_URL = "https://s"; var SUPABASE_ANON_KEY = "k"; var supabaseClient = window.supabaseClient;'
    + 'var I18n = { t: function (k) { return k; } }; var moneyAbaAtual = "pedido"; var aberto = 0;'
    + 'function renderMoneyModal() { var body = document.getElementById("b"); if (moneyAbaAtual !== "pedido") moneyPedidoLiberado = false; else if (!moneyPedidoLiberado) { renderMoneyPedidoSenha(body); return; } aberto++; body.innerHTML = "NUMEROS"; }'
    + 'function tranca() { moneyPedidoLiberado = false; }'
    + bloco.replace('let moneyPedidoLiberado', 'var moneyPedidoLiberado').replace('const moneyOq', 'var moneyOq'));
  const d = w.document; const set = (id, v) => { d.getElementById(id).value = v; }; const clica = (id) => d.getElementById(id).click();
  return { w, d, banco, set, clica, txt: () => d.getElementById('b').textContent, erro: () => (d.getElementById('po-money-oq-erro') || {}).textContent };
}
async function roda(nome, comBanco) {
  console.log(nome);
  const t = monta(comBanco); t.w.renderMoneyModal(); await espera();
  ok(!!t.d.getElementById('po-money-oq-new') && t.txt().indexOf('NUMEROS') < 0, '1º clique sem senha = tela de criar, sem números');
  t.set('po-money-oq-new', 'abc'); t.set('po-money-oq-rep', 'abc'); t.clica('po-money-oq-btn'); await espera();
  ok(t.erro() === 'money.oq_short', 'senha curta recusada');
  t.set('po-money-oq-new', 'abcd1'); t.set('po-money-oq-rep', 'abcd2'); t.clica('po-money-oq-btn'); await espera();
  ok(t.erro() === 'money.oq_mismatch', 'senhas diferentes recusadas');
  t.set('po-money-oq-rep', 'abcd1'); t.clica('po-money-oq-btn'); await espera();
  ok(t.txt() === 'NUMEROS', 'criou e abriu');
  if (comBanco) ok(t.banco.senha === 'abcd1', 'gravada no banco'); else ok(/^[0-9a-f]{64}$/.test(t.w.localStorage.getItem('legno_oq_pass_u1')), 'sem a 338: só o hash, neste navegador');
  t.w.tranca(); t.w.renderMoneyModal(); await espera();
  ok(!!t.d.getElementById('po-money-oq-pass') && t.txt().indexOf('NUMEROS') < 0, 'abrir de novo pede a senha');
  t.set('po-money-oq-pass', 'errada'); t.clica('po-money-oq-btn'); await espera();
  ok(t.erro() === 'money.wrong_password' && t.txt().indexOf('NUMEROS') < 0, 'senha errada não abre');
  t.set('po-money-oq-pass', 'abcd1'); t.clica('po-money-oq-btn'); await espera();
  ok(t.txt() === 'NUMEROS', 'senha certa abre');
  t.w.eval('moneyAbaAtual = "orcamento"'); t.w.renderMoneyModal(); t.w.eval('moneyAbaAtual = "pedido"'); t.w.renderMoneyModal(); await espera();
  ok(!!t.d.getElementById('po-money-oq-pass'), 'sair da aba e voltar pede a senha de novo');
  t.clica('po-money-oq-esqueci'); await espera();
  t.set('po-money-oq-login', 'chute'); t.set('po-money-oq-new', 'nova99'); t.set('po-money-oq-rep', 'nova99'); t.clica('po-money-oq-btn'); await espera();
  ok(t.erro() === 'money.oq_login_wrong', 'esqueci: senha de login errada não deixa trocar');
  t.set('po-money-oq-login', 'login123'); t.clica('po-money-oq-btn'); await espera();
  ok(t.txt() === 'NUMEROS', 'esqueci: com a senha de login cria outra e abre');
  t.w.tranca(); t.w.renderMoneyModal(); await espera();
  t.set('po-money-oq-pass', 'abcd1'); t.clica('po-money-oq-btn'); await espera();
  ok(t.erro() === 'money.wrong_password', 'a senha antiga não vale mais');
}
(async () => {
  await roda('com a migration 338', true);
  await roda('sem a migration 338 (modo local)', false);
  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
})();
