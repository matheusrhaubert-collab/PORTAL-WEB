// Bancada da aba People pro dealer (portal-43, 23/11) — jsdom. node scripts/tests/teste-people-dealer-tela.js
const fs = require('fs'); const vm = require('vm'); const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><body><div id="topo"><button id="po-margins-btn"></button></div></body>', { url: 'http://localhost/portal.html', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window; const ctx = dom.getInternalVMContext(); const run = (c) => new vm.Script(c).runInContext(ctx); let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
run('var currentUser = { id: "dA" }; var currentUserProfile = { role: "lojista" }; var I18n = { t: (k) => k, getLanguage: () => "en" };'
  + 'var supabaseClient = { rpc: async () => ({ data: null, error: null }), from: () => { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null }), then: (r) => r({ data: [], error: null }) }; return q; }, functions: { invoke: async () => ({}) } };'
  + 'function escapeHtmlCutlist(s) { return String(s); }');
run(fs.readFileSync(require('path').join(__dirname, '../../js/portal-43-minha-empresa.js'), 'utf8'));
const set = (adm) => run(`window.LEGNO_IS_ADMIN = ${adm}; meState.card = { id: 'accA', role: 'owner', trade_name: 'Loja A' };
  meState.tree = [{ id: 'accA', kind: 'dealer', status: 'active', trade_name: 'Loja A', factory_discount_pct: 57 }];
  meState.people = [
    { user_id: 'dA', email: 'dA@x.com', account_id: 'accA', member_role: 'owner', active: true, is_admin: false },
    { user_id: 'sA1', email: 'sA1@x.com', account_id: 'accA', member_role: 'seller', active: true, is_admin: false }];
  meState.mg = { dA: { r: 0 }, sA1: { s: 30, r: 0 } }; meState.mgOk = true; meState.kind = { sA1: 'contractor' }; meState.kindOk = true; meState.peopleErr = '';`);
set(false);
const html = run('meViewPeople()');
const d = new w.DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
ok(!d.querySelector('.pp-side'), 'dealer: sem a coluna "Sem loja"');
ok(!d.querySelector('.pp-newli'), 'dealer: sem "Tornar dealer"');
ok(!d.querySelector('select.pp-mv') && !d.querySelector('[draggable="true"]'), 'dealer: sem mover/arrastar');
ok(!!d.querySelector('.pp-addbtn[data-acc="accA"]'), 'dealer: + Pessoa na loja dele');
const v = d.querySelector('.pp-p[data-u="sA1"]'), dono = d.querySelector('.pp-p[data-u="dA"]');
ok(!!v.querySelector('.pp-lock') && !!v.querySelector('input.pp-mg') && !!v.querySelector('select.pp-kind'), 'dealer: cadeado, margem e tipo no vendedor dele');
ok(!dono.querySelector('.pp-lock') && !!dono.querySelector('.pp-dm'), 'dealer: sem cadeado em si mesmo; vê o próprio −desconto/+margem');
ok(run('meTabs().includes("pessoas")'), 'dealer dono tem a aba People');
run('meState.card.role = "seller"');
ok(!run('meTabs().includes("pessoas")'), 'vendedor NÃO tem a aba People');
set(true);
const d2 = new w.DOMParser().parseFromString('<div>' + run('meViewPeople()') + '</div>', 'text/html');
ok(!!d2.querySelector('.pp-side') && !!d2.querySelector('.pp-newli') && !!d2.querySelector('select.pp-mv'), 'admin: tudo como antes (Sem loja, Tornar dealer, mover)');
console.log(falhas ? falhas + ' FALHA(S)' : 'Tudo certo.'); process.exit(falhas ? 1 : 0);
