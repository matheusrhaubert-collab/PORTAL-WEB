// Bancada das telas de DEALERS (20/11/2026): carrega dealer-agreement.js e os
// portal-42/43/44 num navegador de mentira (jsdom), na mesma ordem do
// portal.html, com um Supabase de mentira, e confere:
//   · nenhum erro ao carregar; os embrulhos entraram (showBecomeDealerModal,
//     refreshBecomeDealerUi, cuAfterRender, cuRows, mpLoad);
//   · o cadastro de dealer anda pelos 4 passos e chama as RPCs certas;
//   · o painel de Minha empresa conta certo (em construção, produção,
//     entregues, perdidos por motivo) e todas as abas desenham;
//   · a Central ganha as abas, a faixa do pedido, o preço em 3 números, e os
//     perdidos somem das outras abas.
//
// Rodar:  node scripts/tests/teste-dealers-telas.js
// (precisa do jsdom, que já está no node_modules do projeto)

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const RAIZ = path.join(__dirname, '..', '..');
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="topo"><button id="po-margins-btn" class="po-help-link">Margens</button></div>'
  + '<div id="po-become-dealer"></div><div id="po-mp-v2"></div></body></html>', { url: 'http://localhost/portal.html', runScripts: 'outside-only', pretendToBeVisual: true });
const win = dom.window;
const ctx = dom.getInternalVMContext();

let falhas = 0;
function ok(c, m) { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; }
const espera = (ms) => new Promise((r) => setTimeout(r, ms || 0));

// ---------- banco de mentira ----------
const ACC = 'aaaaaaaa-0000-0000-0000-000000000001';
const EU = 'uuuuuuuu-0000-0000-0000-000000000001';
const COLEGA = 'uuuuuuuu-0000-0000-0000-000000000002';
const banco = {
  account: { id: ACC, kind: 'dealer', status: 'draft', questionnaire: {}, shipping_same: true, factory_discount_pct: 10, tax_exempt_status: 'none', billing_email: 'eu@loja.com' },
  docs: [],
  projects: [
    { id: 'p1', client_user_id: EU, name: 'Cozinha Silva', client_folder: 'Silva', cached_value_usd: 9000, frozen_order_id: null, archived_at: null, lost_at: null, lost_reason: null },
    { id: 'p2', client_user_id: EU, name: 'Closet Souza', client_folder: null, cached_value_usd: 4000, frozen_order_id: null, archived_at: null, lost_at: '2026-11-10T10:00:00Z', lost_reason: 'price' },
    { id: 'p3', client_user_id: COLEGA, name: 'Banho', client_folder: null, cached_value_usd: 2500, frozen_order_id: null, archived_at: null, lost_at: '2026-11-12T10:00:00Z', lost_reason: 'price' },
    { id: 'p4', client_user_id: EU, name: 'Pedido já', client_folder: 'Silva', cached_value_usd: 7000, frozen_order_id: 'o1', archived_at: null, lost_at: null, lost_reason: null }
  ],
  orders: [
    { id: 'o1', client_user_id: EU, account_id: ACC, status: 'approved', order_type: 'project', po_name: 'SILVA-KIT', room_name: 'Kitchen', delivery_address: '1 Main St, Ocala, FL', jobsite_lat: 29.18, jobsite_lng: -82.14, price_list_total: 10000, price_discount_pct: 10, price_net_total: 9000, finance_released_at: null, pickup_released_at: null, delivered_at: null, submitted_at: '2026-11-01T10:00:00Z', approved_at: '2026-11-02T10:00:00Z', factory_number: 12 },
    { id: 'o2', client_user_id: EU, account_id: ACC, status: 'submitted', order_type: 'project', po_name: null, room_name: null, delivery_address: null, jobsite_lat: null, jobsite_lng: null, price_list_total: null, price_discount_pct: null, price_net_total: null, finance_released_at: null, pickup_released_at: null, delivered_at: null, submitted_at: '2026-11-15T10:00:00Z', approved_at: null, factory_number: null },
    { id: 'o3', client_user_id: COLEGA, account_id: ACC, status: 'delivered', order_type: 'project', po_name: 'OLD', room_name: 'Bath', delivery_address: '2 Oak Ave, Tampa, FL', jobsite_lat: 27.95, jobsite_lng: -82.45, price_list_total: 5000, price_discount_pct: 10, price_net_total: 4500, finance_released_at: '2026-10-02T10:00:00Z', pickup_released_at: '2026-10-20T10:00:00Z', delivered_at: '2026-10-22T10:00:00Z', submitted_at: '2026-10-01T10:00:00Z', approved_at: '2026-10-01T12:00:00Z', factory_number: 9 }
  ],
  items: [{ order_id: 'o2', total_price: 2000 }, { order_id: 'o2', total_price: 1000 }],
  chamadas: []
};
function filtra(linhas, st) {
  return linhas.filter((r) => st.filtros.every(([tipo, k, v]) => {
    if (tipo === 'eq') return r[k] === v;
    if (tipo === 'in') return v.includes(r[k]);
    if (tipo === 'notnull') return r[k] != null;
    return true;
  }));
}
function responde(st) {
  banco.chamadas.push(st);
  const um = (linhas) => (st.single ? { data: linhas[0] || null, error: null } : { data: linhas, error: null });
  if (st.tabela === 'accounts') {
    if (st.op === 'update') Object.assign(banco.account, st.payload);
    return um([banco.account]);
  }
  if (st.tabela === 'account_documents') {
    if (st.op === 'insert') { const d = Object.assign({ id: 'd' + (banco.docs.length + 1), status: 'pending', created_at: new Date().toISOString() }, st.payload); banco.docs.push(d); return um([d]); }
    return um(banco.docs);
  }
  if (st.tabela === 'account_discount_requests') return um([]);
  if (st.tabela === 'account_members') return um([{ id: 'm2' }]);
  if (st.tabela === 'user_projects') {
    if (st.op === 'update') { filtra(banco.projects, st).forEach((p) => Object.assign(p, st.payload)); return um(filtra(banco.projects, st)); }
    return um(filtra(banco.projects, st));
  }
  if (st.tabela === 'orders') {
    if (st.op === 'update') { const l = filtra(banco.orders, st); l.forEach((o) => Object.assign(o, st.payload)); return um(l); }
    return um(filtra(banco.orders, st));
  }
  if (st.tabela === 'order_items') return um(filtra(banco.items, st));
  return um([]);
}
function consulta(tabela) {
  const st = { tabela, op: 'select', filtros: [], payload: null, single: false };
  const b = {
    select() { return b; }, insert(p) { st.op = 'insert'; st.payload = p; return b; }, update(p) { st.op = 'update'; st.payload = p; return b; },
    delete() { st.op = 'delete'; return b; }, eq(k, v) { st.filtros.push(['eq', k, v]); return b; }, in(k, v) { st.filtros.push(['in', k, v]); return b; },
    not(k) { st.filtros.push(['notnull', k]); return b; }, order() { return b; }, limit() { return b; },
    single() { st.single = true; return b; }, maybeSingle() { st.single = true; return b; },
    then(res, rej) { return Promise.resolve(responde(st)).then(res, rej); }
  };
  return b;
}
const rpcs = [];
win.supabaseClient = {
  from: consulta,
  rpc(nome, args) {
    rpcs.push([nome, args]);
    const r = (data) => Promise.resolve({ data, error: null });
    if (nome === 'dealer_application_start') return r(ACC);
    if (nome === 'my_account_card') return r({ id: ACC, kind: 'dealer', status: banco.account.status, trade_name: 'Loja Teste', role: 'owner', permissions: {}, tax_exempt_status: 'none' });
    if (nome === 'dealer_agreement_accept') { banco.account.agreement_accepted_at = '2026-11-20T12:00:00Z'; banco.account.agreement_version = args.p_version; banco.account.agreement_signer_name = args.p_signer_name; return r('2026-11-20T12:00:00Z'); }
    if (nome === 'dealer_application_submit') { banco.account.status = 'pending'; return r({ ok: true, status: 'pending', missing: [] }); }
    if (nome === 'account_tree') return r([{ id: 'f', parent_account_id: null, kind: 'factory', status: 'active', trade_name: 'Legno', members: 0 }, { id: ACC, parent_account_id: 'f', kind: 'dealer', status: 'active', trade_name: 'Loja Teste', members: 2, factory_discount_pct: 10, tax_exempt_status: 'valid', tax_exempt_valid_until: '2026-12-31' }]);
    if (nome === 'account_team') return r([{ member_id: 'm1', account_id: ACC, user_id: EU, email: 'eu@loja.com', role: 'owner', permissions: {}, active: true }, { member_id: 'm2', account_id: ACC, user_id: COLEGA, email: 'colega@loja.com', role: 'seller', permissions: {}, active: true }]);
    if (nome === 'request_discount') return r('r1');
    return r(null);
  },
  storage: { from() { return { upload: () => Promise.resolve({ error: null }), createSignedUrl: () => Promise.resolve({ data: { signedUrl: 'http://x' }, error: null }) }; } },
  functions: { invoke: () => Promise.resolve({ data: { ok: true, reading: { ok: true, certificate_type: 'DR-13', state: 'FL', proposed_valid_until: '2026-12-31' } }, error: null }) }
};

// ---------- o que os arquivos de antes definem ----------
const base = `
  var I18n = { t: function (k) { return k; }, getLanguage: function () { return 'pt'; } };
  var currentUser = { id: '${EU}', email: 'eu@loja.com' };
  var chamouOriginal = { modal: 0, refresh: 0, after: 0, load: 0 };
  function showBecomeDealerModal() { chamouOriginal.modal++; var m = document.getElementById('po-become-dealer-modal'); if (!m) { m = document.createElement('div'); m.id = 'po-become-dealer-modal'; document.body.appendChild(m); } m.innerHTML = '<div class="po-become-dealer-box"><div class="po-become-dealer-links"></div></div>'; }
  function refreshBecomeDealerUi() { chamouOriginal.refresh++; }
  function renderMarginsModal() {}
  function openMarginsModal() {}
  function hasDealerTools() { return true; }
  function getResaleMarginPct() { return 35; }
  function isSellerAccount() { return false; }
  function isRetailClientAccount() { return false; }
  function openOrderDetail() {}
  let mpAdminCache = true;
  const mpState = { rows: [], ordersById: {}, totals: {}, central: true, ctab: 'all', open: new Set(), loadSeq: 1, loaded: true };
  function mpBox() { return document.getElementById('po-mp-v2'); }
  function cuRows() { return [
    { kind: 'build', key: 'b:Silva', nome: 'Silva', titulo: 'Silva', lista: mpState.rows.filter(function (p) { return p.client_folder === 'Silva' && !p.frozen_order_id; }), orders: [] },
    { kind: 'build', key: 'p:p2', single: mpState.rows[1], nome: '', titulo: 'Closet Souza', lista: [mpState.rows[1]], orders: [] },
    { kind: 'orders', key: 'o:Silva', titulo: 'Silva', lista: [], orders: Object.values(mpState.ordersById) } ]; }
  function mpFolderByKey(k) { return cuRows().find(function (f) { return f.key === k; }) || null; }
  function cuAfterRender() { chamouOriginal.after++; }
  function mpRender() {
    var box = mpBox(); var rows = cuRows();
    box.innerHTML = '<div class="cu-bar"><div class="mp-tabs cu-tabs"><button class="mp-tab cu-tab is-on" data-act="ctab" data-tab="all">Todos</button></div></div>'
      + '<div class="mp-table-wrap"><table class="mp-table"><thead><tr><th>Projeto</th><th>Cliente</th><th>N</th><th>Status</th><th>Prod</th><th>Data</th><th></th></tr></thead><tbody>' + rows.map(function (f) {
        return '<tr class="mp-row" data-k="' + f.key + '"><td>' + f.titulo + '</td><td>c</td><td>1</td><td>s</td><td>p</td><td>d</td><td></td></tr><tr class="mp-exp"><td colspan="7">'
          + (f.kind === 'orders' ? f.orders.map(function (o) { return '<div class="cu-order" data-act="order" data-order="' + o.id + '"></div>'; }).join('') : '<div class="mp-exp-box cu-build" data-folder="' + f.nome + '"></div>')
          + '</td></tr>'; }).join('') + '</tbody></table></div>';
    cuAfterRender(rows);
  }
  function mpLoad() { chamouOriginal.load++; mpRender(); }
`;

(async function () {
  win.LEGNO_IS_ADMIN = true;
  win.jspdf = null;
  win.confirm = () => true;
  win.open = () => null;
  new vm.Script(base, { filename: 'base.js' }).runInContext(ctx);
  const origModal = win.showBecomeDealerModal;

  console.log('Carga dos arquivos');
  for (const f of ['js/dealer-agreement.js', 'js/portal-42-dealer-cadastro.js', 'js/portal-43-minha-empresa.js', 'js/portal-44-central-plus.js']) {
    try { new vm.Script(fs.readFileSync(path.join(RAIZ, f), 'utf8'), { filename: f }).runInContext(ctx); ok(true, f + ' carregou'); }
    catch (e) { ok(false, f + ' — ' + e.message); }
  }
  ok(win.showBecomeDealerModal !== origModal, 'showBecomeDealerModal embrulhado');
  ok(win.LEGNO_DEALER_AGREEMENT && win.LEGNO_DEALER_AGREEMENT.sections.length >= 10, 'contrato com ' + (win.LEGNO_DEALER_AGREEMENT || { sections: [] }).sections.length + ' seções');

  console.log('Become a dealer');
  win.showBecomeDealerModal();
  ok(!!win.document.querySelector('#po-become-dealer-modal [data-dapp-apply]'), 'botão "Solicitar online" entra no modal antigo');
  await win.LegnoDealerApp.abrir();
  const dapp = () => win.document.getElementById('po-dapp');
  ok(dapp() && dapp().querySelector('.dapp-steps') && dapp().querySelector('[data-k="legal_name"]'), 'passo 1 (Empresa) desenhado');
  const poe = (sel, v) => { const el = dapp().querySelector(sel); el.value = v; };
  poe('[data-k="legal_name"]', 'Loja Teste LLC'); poe('[data-k="ein"]', '12-3456789'); poe('[data-k="billing_state"]', 'fl');
  dapp().querySelector('[data-a="save1"]').click(); await espera(20);
  ok(banco.account.legal_name === 'Loja Teste LLC' && banco.account.billing_state === 'FL', 'passo 1 grava (estado em maiúscula)');
  ok(!!dapp().querySelector('[data-q="business_type"]'), 'passo 2 (Questionário) desenhado');
  dapp().querySelector('[data-q="business_type"]').value = 'showroom'; dapp().querySelector('[data-q="european_brands"]').value = 'yes';
  dapp().querySelector('[data-a="save2"]').click(); await espera(20);
  ok(banco.account.questionnaire.business_type === 'showroom' && banco.account.questionnaire.european_brands === 'yes', 'passo 2 grava o questionário');
  ok(dapp().querySelector('.dapp-agr') && /Governed|governed by the laws of the State of Florida/.test(dapp().querySelector('.dapp-agr').textContent), 'passo 3 mostra o contrato (lei da Flórida)');
  dapp().querySelector('[data-a="sign"]').click(); await espera(20);
  ok(/dapp-msg/.test(dapp().innerHTML) && !banco.account.agreement_accepted_at, 'assinar sem nome/caixa é recusado');
  dapp().querySelector('#dapp-signer').value = 'Fulano Dono'; dapp().querySelector('#dapp-agree').checked = true;
  dapp().querySelector('[data-a="sign"]').click(); await espera(30);
  ok(rpcs.some((r) => r[0] === 'dealer_agreement_accept' && r[1].p_signer_name === 'Fulano Dono' && r[1].p_version === win.LEGNO_DEALER_AGREEMENT.version), 'aceite chama a RPC com nome e versão');
  ok(!!dapp().querySelector('#dapp-tax-file') && !!dapp().querySelector('[data-a="submit"]'), 'passo 4 (Tax exemption) com upload e Enviar');
  dapp().querySelector('[data-a="submit"]').click(); await espera(30);
  ok(rpcs.some((r) => r[0] === 'dealer_application_submit') && /dapp-status/.test(dapp().innerHTML) && /st-pending/.test(dapp().innerHTML), 'enviar → ficha em "em análise"');

  console.log('Minha empresa');
  banco.account.status = 'active';
  await win.LegnoMinhaEmpresa.abrir('painel');
  const me = () => win.document.getElementById('po-me');
  const kpi = (c) => { const el = me().querySelector('.me-kpi.' + c + ' strong'); return el ? Number(el.textContent) : null; };
  ok(kpi('k-build') === 1 && kpi('k-wait') === 1 && kpi('k-prod') === 1 && kpi('k-done') === 1 && kpi('k-lost') === 2, 'painel: construção 1 · aguardando 1 · produção 1 · entregue 1 · perdidos 2');
  ok(/\$3,000/.test(me().querySelector('.me-kpi.k-wait').textContent), 'pedido sem foto do preço usa a soma dos itens ($3,000)');
  ok(me().querySelectorAll('.me-bar').length === 1 && /r_price|Preço/.test(me().querySelector('.me-bar').textContent) && /2/.test(me().querySelector('.me-bar b').textContent), 'perdidos por motivo: Preço = 2');
  ok(me().querySelectorAll('.me-table tbody tr').length === 2, 'quebra por pessoa: 2 linhas');
  for (const t of ['arvore', 'equipe', 'margens', 'empresa']) {
    const b = me().querySelector('[data-t="' + t + '"]');
    if (!b) { ok(false, 'aba ' + t + ' não existe'); continue; }
    b.click(); await espera(5);
    ok(me().querySelector('.me-body').textContent.trim().length > 20, 'aba ' + t + ' desenha');
  }
  me().querySelector('[data-t="arvore"]').click();
  ok(me().querySelectorAll('.me-node').length === 2 && !!me().querySelector('.me-node.k-factory'), 'árvore: fábrica + loja');
  me().querySelector('[data-t="equipe"]').click();
  ok(me().querySelectorAll('.me-member').length === 2 && me().querySelectorAll('.me-member input[type="checkbox"]').length === 3, 'equipe: 2 pessoas, 3 caixinhas no vendedor');
  me().querySelector('[data-t="margens"]').click();
  ok(/10%/.test(me().querySelector('.me-big').textContent) && !!me().querySelector('[data-a="pedir"]'), 'margens: desconto 10% só leitura + solicitar');
  ok(!!win.document.getElementById('po-company-btn') || (await (async () => { win.refreshBecomeDealerUi(); await espera(30); return !!win.document.getElementById('po-company-btn'); })()), 'botão "Minha empresa" na barra');

  console.log('Central');
  vm.runInContext(`mpState.rows = ${JSON.stringify(banco.projects.filter((p) => p.client_user_id === EU))};
    mpState.ordersById = ${JSON.stringify(Object.fromEntries(banco.orders.filter((o) => o.client_user_id === EU).map((o) => [o.id, o])))}; mpState.totals = { o1: 10000, o2: 3000 };`, ctx);
  win.mpLoad(); await espera(60);
  const box = () => win.document.getElementById('po-mp-v2');
  ok(box().querySelectorAll('.cx-tab').length >= 2 && /\(1\)/.test(box().querySelector('.cx-tab[data-v="lost"]').textContent), 'abas Perdidos (1) e Mapa entram');
  ok(!box().querySelector('.cx-tab[data-v="net"]') && box().querySelectorAll('#cx-tree .cx-col').length === 4, 'árvore em cima da lista principal (sem aba Lojas separada)');
  const cab = Array.from(box().querySelectorAll('.mp-table-wrap thead th')).map((x) => x.textContent);
  const s2 = box().querySelector('.cx-strip[data-cx-order="o2"]');
  ok(s2 && s2.querySelectorAll('input[data-cx-f]').length === 3 && !!s2.querySelector('[data-cx="release"]'), 'pedido pendente: 3 campos + Liberar');
  ok(s2 && /\$3,000\.00/.test(s2.textContent) && /10%/.test(s2.textContent) && /\$2,700\.00/.test(s2.textContent), 'preço: tabela 3.000 · 10% · 2.700');
  const s1 = box().querySelector('.cx-strip[data-cx-order="o1"]');
  ok(s1 && s1.classList.contains('ro') && /SILVA-KIT/.test(s1.textContent) && /\$9,000\.00/.test(s1.textContent), 'pedido aprovado: só leitura com o preço congelado');
  ok(box().querySelectorAll('.mp-row:not(.cx-grow)').length === 2, 'projeto perdido saiu da lista (2 linhas: pasta Silva + pedidos)');
  const linhaPed = box().querySelector('.mp-row[data-k="o:Silva"]');
  ok(linhaPed && /Loja Teste/.test(linhaPed.querySelector('.cx-loja').textContent) && /\$13,000\.00/.test(linhaPed.textContent) && /10%/.test(linhaPed.textContent) && /\$11,700\.00/.test(linhaPed.textContent), 'linha da pasta: loja + tabela 13.000 · 10% · 11.700');
  s2.querySelector('[data-cx="release"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(30);
  ok(banco.orders[1].status === 'submitted' && /cx-st err/.test(box().innerHTML), 'liberar sem etiqueta/endereço é recusado');
  const s2b = box().querySelector('.cx-strip[data-cx-order="o2"]');
  s2b.querySelector('[data-cx-f="po_name"]').value = 'SOUZA-01'; s2b.querySelector('[data-cx-f="delivery_address"]').value = '9 Pine Rd, Ocala, FL';
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ features: [{ geometry: { coordinates: [-82.1, 29.2] }, properties: {} }] }) });
  s2b.querySelector('[data-cx="release"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(60);
  const o2 = banco.orders[1];
  ok(o2.status === 'approved' && o2.po_name === 'SOUZA-01' && o2.delivery_address === '9 Pine Rd, Ocala, FL' && o2.client_name === 'Loja Teste LLC', 'liberar: aprova com etiqueta, endereço e cadastro da empresa');
  ok(o2.jobsite_lat === 29.2 && o2.jobsite_lng === -82.1, 'endereço virou coordenada');
  box().querySelector('.cx-tab[data-v="lost"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(30);
  ok(box().querySelectorAll('.mp-row:not(.cx-grow)').length === 1 && !!box().querySelector('[data-cx="reopen"]'), 'aba Perdidos: só o perdido, com Reabrir');
  box().querySelector('.cx-tab[data-v="lost"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(30);
  await espera(80);
  ok(!!box().querySelector('.cx-table') && !!box().querySelector('[data-cx="hoje"]'), 'admin (fábrica) já abre vendo a lista de todo mundo, com o filtro "Atualizados hoje"');
  const abreTudo = async () => { for (let i = 0; i < 12; i++) { const f = box().querySelector('.cx-grow:not(.is-open)'); if (!f) break; f.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(10); } };
  ok(box().querySelectorAll('.cx-gtable > tbody > tr.cx-grow').length === 4 && box().querySelectorAll('.cx-gtable > thead th[data-cx="gsort"]').length >= 8 && /Loja Teste/.test(box().querySelector('.cx-gtable').textContent),
    'lista no formato de pastas: 4 linhas (pasta de pedidos, 2 pedidos soltos, pasta de projeto), colunas que ordenam, com a LOJA');
  await abreTudo();
  ok(box().querySelectorAll('.cx-gexp .cx-table tbody tr').length === 4 && box().querySelectorAll('.cx-tagp').length === 1, 'abrir as pastas mostra os itens: 3 pedidos (com número) + 1 projeto');
  box().querySelector('th[data-col="nome"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(10);
  const nomes = Array.from(box().querySelectorAll('.cx-grow .mp-c-name strong')).map((x) => x.textContent.toLowerCase());
  ok(nomes.join('|') === nomes.slice().sort().join('|'), 'clicar no título da coluna ordena (' + nomes.join(', ') + ')');
  const cel = box().querySelector('.cx-storecell');
  cel.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(10);
  const selLoja = box().querySelector('select[data-cx-store]');
  ok(!!selLoja && !!box().querySelector('#cx-move-all'), 'admin: clicar na loja abre a troca; "passar todos" na barra');
  const idMov = selLoja.getAttribute('data-cx-store');
  selLoja.value = '_'; selLoja.dispatchEvent(new win.Event('change', { bubbles: true })); await espera(40);
  ok(banco.orders.find((o) => o.id === idMov).account_id === null, 'trocar a loja grava no pedido (sem loja)');
  banco.orders.find((o) => o.id === idMov).account_id = ACC; win.LegnoCentralPlus.recarregar(); await espera(80);
  await espera(80);
  await abreTudo();
  ok(!!box().querySelector('[data-cx="relprod"]'), 'admin vê "Liberar produção" na linha');
  ok(box().querySelectorAll('.cx-col').length === 4 && box().querySelectorAll('.cx-ci[data-c="loja"]').length === 1, 'árvore lado a lado: 4 colunas, 1 dealer');
  box().querySelector('.cx-ci[data-c="loja"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(20);
  ok(box().querySelectorAll('.cx-ci[data-c="user"]').length === 2 && box().querySelectorAll('.cx-ci[data-c="cliente"]').length >= 1, 'clicar no dealer abre vendedores (2) e clientes finais');
  box().querySelectorAll('.cx-ci[data-c="user"]')[1].dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(20);
  ok(box().querySelectorAll('.cx-gtable > tbody > tr.cx-grow').length === 1, 'clicar no vendedor filtra a lista (1 linha), no mesmo formato');
  box().querySelector('[data-act="ctab"]').dataset.tab = 'prod';
  box().querySelector('[data-act="ctab"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(20);
  const corrida = box().querySelectorAll('#cx-panel .cx-wrap > .cx-inner .cx-table tbody tr');
  ok(!box().querySelector('.cx-gtable') && corrida.length === 2 && /00012/.test(corrida[0].textContent), 'aba Orders: lista corrida, número do pedido primeiro (00012 em cima)');
  box().querySelector('.cx-ci[data-c="loja"]').dispatchEvent(new win.MouseEvent('click', { bubbles: true })); await espera(20);
  const lupa = box().querySelector('[data-cx-colq="user"]');
  lupa.value = 'colega'; lupa.dispatchEvent(new win.Event('input', { bubbles: true }));
  const vis = Array.from(box().querySelectorAll('.cx-ci[data-c="user"]')).filter((el) => el.style.display !== 'none');
  ok(box().querySelectorAll('[data-cx-colq]').length === 3 && vis.length === 1 && /colega/.test(vis[0].textContent), 'lupa da coluna: 3 campos, "colega" deixa 1 vendedor');

  console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTUDO CERTO');
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error('ERRO NA BANCADA:', e); process.exit(1); });
