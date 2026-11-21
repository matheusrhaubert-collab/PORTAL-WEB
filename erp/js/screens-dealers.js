/* Legno ERP — Administrativo → Dealers (#/dealers) — EM TESTE
 *
 * Matt (2026-11-20): "Dealer agora não é só troca administrativa, ele deve
 * ser solicitado pelo próprio portal... deixa tudo bem registrado no cadastro
 * do dealer. quero os documentos a um clique do meu controle... quero ver uma
 * estrutura em árvore com a fábrica no topo, representante/distribuidor no
 * meio e depois o lojista... só a fábrica tem o gerenciamento do desconto.
 * ele deve solicitar o desconto se quiser alterar."
 *
 * Lista (#/dealers):
 *   · FILA: solicitações de dealer, certificados de tax exemption pra
 *     conferir e pedidos de desconto;
 *   · ÁRVORE: fábrica › distribuidor › lojista, com situação, desconto, tax
 *     exempt e nº de pessoas. Clique abre a ficha.
 * Ficha (#/dealers/<id>):
 *   dados da invoice · questionário · contrato aceito · posição na árvore ·
 *   desconto · aprovar / recusar / suspender / reativar · documentos (1
 *   clique, link temporário do bucket privado) · conferência do tax
 *   exemption com a leitura da IA já preenchida · equipe · histórico.
 *
 * Banco: migrations 306 (accounts, account_members, account_documents,
 * account_events), 307 (admin_review_dealer, admin_set_tax_exempt,
 * accounts_tax_exempt_sweep) e 308 (account_discount_requests). Sem elas a
 * tela mostra o aviso e não quebra.
 *
 * A tela se redesenha sozinha (DEALERS._draw) dentro de #dl-root; o roteador
 * só entrega o esqueleto.
 */

const DEALERS = {};
DEALERS._d = null;
DEALERS._msg = '';
DEALERS._err = '';

DEALERS.KIND = { factory: 'Fábrica', distributor: 'Distribuidor', dealer: 'Lojista' };
DEALERS.STATUS = {
  draft: { label: 'Rascunho', pill: 'erp-pill-neutral' },
  pending: { label: 'Aguardando análise', pill: 'erp-pill-warn' },
  active: { label: 'Ativo', pill: 'erp-pill-ok' },
  suspended: { label: 'Suspenso', pill: 'erp-pill-danger' },
  rejected: { label: 'Recusado', pill: 'erp-pill-danger' }
};
DEALERS.TAX = {
  none: { label: 'Sem certificado', pill: 'erp-pill-neutral' },
  pending: { label: 'Pra conferir', pill: 'erp-pill-warn' },
  valid: { label: 'Isento', pill: 'erp-pill-ok' },
  expired: { label: 'Vencido', pill: 'erp-pill-danger' },
  rejected: { label: 'Recusado', pill: 'erp-pill-danger' }
};
DEALERS.DOC_KIND = { agreement: 'Contrato assinado', tax_exempt: 'Tax exemption', w9: 'W-9', other: 'Outro' };
DEALERS.DOC_STATUS = { pending: 'pra conferir', valid: 'válido', rejected: 'recusado', expired: 'vencido', superseded: 'substituído' };
DEALERS.ROLE = { owner: 'Dono', manager: 'Gerente', seller: 'Vendedor', finance: 'Financeiro' };
DEALERS.Q = {
  business_type: ['Tipo de negócio', { showroom: 'Showroom / loja', contractor: 'Construtora / contractor', designer: 'Designer / arquiteto', distributor: 'Distribuidor / representante', millwork: 'Marcenaria', other: 'Outro' }],
  years_in_business: ['Tempo de atuação', { lt1: 'Menos de 1 ano', '1_2': '1–2 anos', '3_5': '3–5 anos', '6_10': '6–10 anos', gt10: 'Mais de 10 anos' }],
  annual_revenue: ['Faturamento anual', { lt250k: 'Até $250k', '250k_500k': '$250k – $500k', '500k_1m': '$500k – $1M', '1m_3m': '$1M – $3M', '3m_10m': '$3M – $10M', gt10m: 'Acima de $10M' }],
  projects_per_month: ['Projetos por mês', { '1_2': '1–2', '3_5': '3–5', '6_10': '6–10', gt10: 'Mais de 10' }],
  states_served: ['Estados / regiões', null],
  european_brands: ['Já trabalha com europeus', { yes: 'Sim', no: 'Não' }],
  european_brands_which: ['Quais marcas', null],
  how_heard: ['Como conheceu a Legno', null],
  notes: ['Observações', null]
};
DEALERS.EVENT = { created: 'Cadastro criado', status: 'Situação', discount: 'Desconto', tax_exempt: 'Tax exempt', tree: 'Árvore', agreement: 'Contrato aceito', billing_data: 'Dados da invoice', document: 'Documento', discount_request: 'Pedido de desconto' };

DEALERS.load = async function (p) { return { id: p && p.id }; };

DEALERS.render = function (params, d) {
  return UI.head(d.id ? 'Dealer' : 'Dealers',
    d.id ? 'Ficha da empresa: cadastro, contrato, tax exemption, desconto, equipe e histórico.'
         : 'Solicitações, certificados e pedidos de desconto pra decidir — e a árvore de quem compra da fábrica. <b>Em teste.</b>',
    d.id ? '<a class="erp-btn erp-btn-secondary" href="#/dealers">‹ Todos os dealers</a>' : '') +
    '<div id="dl-root"><div class="erp-muted">Carregando…</div></div>' + DEALERS._css();
};

DEALERS.after = function (params, d) {
  const root = document.getElementById('dl-root');
  if (!root) return;
  root.addEventListener('click', DEALERS._click);
  DEALERS._msg = ''; DEALERS._err = '';
  DEALERS._id = d.id || null;
  DEALERS._reload();
};

DEALERS._sb = function () { return DATA.sb(); };
DEALERS._nome = function (a) { return a ? (a.trade_name || a.legal_name || a.billing_email || '(sem nome)') : '—'; };
DEALERS._dt = function (iso) {
  if (!iso) return '—';
  const x = new Date(iso);
  return isNaN(x) ? String(iso) : x.toLocaleDateString('pt-BR') + ' ' + x.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};
DEALERS._dias = function (d) {
  if (!d) return null;
  return Math.ceil((new Date(String(d).slice(0, 10) + 'T23:59:59').getTime() - Date.now()) / 86400000);
};
DEALERS._taxPill = function (a) {
  let st = a.tax_exempt_status || 'none';
  const dias = DEALERS._dias(a.tax_exempt_valid_until);
  if (st === 'valid' && dias != null && dias < 0) st = 'expired';
  let extra = '';
  if (st === 'valid') extra = ' até ' + UI.date(a.tax_exempt_valid_until) + (dias != null && dias <= 30 ? ' (' + dias + ' d)' : '');
  if (st === 'expired' && a.tax_exempt_valid_until) extra = ' em ' + UI.date(a.tax_exempt_valid_until);
  const m = DEALERS.TAX[st] || DEALERS.TAX.none;
  return '<span class="erp-pill ' + (st === 'valid' && dias != null && dias <= 30 ? 'erp-pill-warn' : m.pill) + '">' + UI.esc(m.label + extra) + '</span>';
};

DEALERS._reload = async function () {
  const sb = DEALERS._sb();
  const root = document.getElementById('dl-root');
  if (!sb || !root) return;
  try {
    try { await sb.rpc('accounts_tax_exempt_sweep'); } catch (e) { /* sem a 307: segue */ }
    /* 30 dias sem entrar (migration 312): bloqueia quem passou do prazo e lista os bloqueados */
    let bloqueados = [];
    try { await sb.rpc('access_inactivity_sweep'); const bl = await sb.rpc('admin_blocked_users'); bloqueados = bl.error ? [] : (bl.data || []); } catch (e) { bloqueados = []; }
    const { data: accounts, error } = await sb.from('accounts').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    const d = { accounts: accounts || [], members: [], docsPend: [], reqs: [], profiles: {}, bloqueados: bloqueados };
    const m = await sb.from('account_members').select('id, account_id, user_id, role, permissions, active, created_at');
    d.members = m.data || [];
    const dp = await sb.from('account_documents').select('id, account_id, kind, name, status, created_at')
      .eq('kind', 'tax_exempt').eq('status', 'pending').order('created_at', { ascending: true });
    d.docsPend = dp.data || [];
    try {
      const rq = await sb.from('account_discount_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true });
      d.reqs = rq.error ? [] : (rq.data || []);
    } catch (e) { d.reqs = []; }
    if (DEALERS._id) {
      const id = DEALERS._id;
      const docs = await sb.from('account_documents').select('*').eq('account_id', id).order('created_at', { ascending: false });
      d.docs = docs.data || [];
      const ev = await sb.from('account_events').select('*').eq('account_id', id).order('created_at', { ascending: false }).limit(80);
      d.events = ev.data || [];
      try {
        const allReq = await sb.from('account_discount_requests').select('*').eq('account_id', id).order('created_at', { ascending: false }).limit(20);
        d.reqsAll = allReq.error ? [] : (allReq.data || []);
      } catch (e) { d.reqsAll = []; }
      const uids = d.members.filter(function (x) { return x.account_id === id; }).map(function (x) { return x.user_id; });
      const evUids = d.events.map(function (x) { return x.actor_user_id; }).filter(Boolean);
      const todos = Array.from(new Set(uids.concat(evUids)));
      if (todos.length) {
        const pr = await sb.from('user_profiles').select('user_id, email, role, last_active_at').in('user_id', todos);
        (pr.data || []).forEach(function (p) { d.profiles[p.user_id] = p; });
      }
    }
    DEALERS._d = d;
    DEALERS._draw();
  } catch (e) {
    root.innerHTML = '<div class="erp-note">Não deu pra ler as empresas: ' + UI.esc(e.message || String(e)) +
      '<br>Confira se as migrations <b>306</b> e <b>307</b> já rodaram no SQL Editor do Supabase.</div>';
  }
};

DEALERS._draw = function () {
  const root = document.getElementById('dl-root');
  if (!root || !DEALERS._d) return;
  const avisos = (DEALERS._err ? '<div class="dl-msg dl-err">' + UI.esc(DEALERS._err) + '</div>' : '') +
    (DEALERS._msg ? '<div class="dl-msg dl-ok">' + UI.esc(DEALERS._msg) + '</div>' : '');
  root.innerHTML = avisos + (DEALERS._id ? DEALERS._ficha() : DEALERS._lista());
};

/* ---------- LISTA ---------- */
DEALERS._lista = function () {
  const d = DEALERS._d;
  const porId = {}; d.accounts.forEach(function (a) { porId[a.id] = a; });
  const pend = d.accounts.filter(function (a) { return a.status === 'pending'; });
  let h = '<div class="erp-grid erp-grid-3 dl-kpis">' +
    UI.kpi('Solicitações de dealer', String(pend.length), pend.length ? 'aguardando você' : 'nenhuma na fila') +
    UI.kpi('Tax exemption pra conferir', String(d.docsPend.length), d.docsPend.length ? 'certificados enviados' : 'nenhum') +
    UI.kpi('Pedidos de desconto', String(d.reqs.length), d.reqs.length ? 'aguardando você' : 'nenhum') + '</div>';

  if ((d.bloqueados || []).length) {
    const tentou = d.bloqueados.filter(function (b) { return b.tentativas > 0; }).length;
    h += '<h3 class="dl-h">Acesso bloqueado — mais de 30 dias sem entrar <span class="erp-muted erp-small">— ' + d.bloqueados.length + ' conta(s)' + (tentou ? ', ' + tentou + ' tentou entrar de novo' : '') + '</span></h3>' +
      '<table class="erp-table"><thead><tr><th>Usuário</th><th>Loja</th><th>Papel</th><th>Última entrada</th><th>Bloqueado em</th><th>Tentou entrar</th><th></th></tr></thead><tbody>' +
      d.bloqueados.map(function (b) {
        return '<tr' + (b.tentativas > 0 ? ' class="dl-tentou"' : '') + '><td class="erp-strong">' + UI.esc(b.email || b.user_id) + (b.novos > 0 ? ' ' + UI.pill('novo', 'erp-pill-warn') : '') + '</td><td>' + UI.esc(b.loja || '—') + '</td><td>' + UI.esc(b.role || '') + '</td>' +
          '<td>' + UI.esc(DEALERS._dt(b.last_active_at)) + '</td><td>' + UI.esc(DEALERS._dt(b.blocked_at)) + '</td>' +
          '<td>' + (b.tentativas > 0 ? '<b>' + b.tentativas + '×</b> — última ' + UI.esc(DEALERS._dt(b.ultima_tentativa)) : '<span class="erp-muted">não</span>') + '</td>' +
          '<td><button class="erp-btn" data-a="liberar-acesso" data-id="' + b.user_id + '" data-nome="' + UI.esc(b.email || '') + '">Liberar acesso</button></td></tr>';
      }).join('') + '</tbody></table>';
  }
  if (pend.length) {
    h += '<h3 class="dl-h">Solicitações de dealer</h3><table class="erp-table"><thead><tr><th>Empresa</th><th>Cidade</th><th>Tipo de negócio</th><th>Faturamento</th><th>Enviada em</th><th></th></tr></thead><tbody>' +
      pend.map(function (a) {
        const q = a.questionnaire || {};
        return '<tr><td class="erp-strong">' + UI.esc(DEALERS._nome(a)) + '</td><td>' + UI.esc([a.billing_city, a.billing_state].filter(Boolean).join(', ')) + '</td>' +
          '<td>' + UI.esc((DEALERS.Q.business_type[1][q.business_type]) || q.business_type || '—') + '</td>' +
          '<td>' + UI.esc((DEALERS.Q.annual_revenue[1][q.annual_revenue]) || q.annual_revenue || '—') + '</td>' +
          '<td>' + UI.esc(DEALERS._dt(a.submitted_at)) + '</td><td><a class="erp-btn" href="#/dealers/' + a.id + '">Analisar</a></td></tr>';
      }).join('') + '</tbody></table>';
  }
  if (d.docsPend.length) {
    h += '<h3 class="dl-h">Tax exemption pra conferir</h3><table class="erp-table"><thead><tr><th>Empresa</th><th>Arquivo</th><th>Enviado em</th><th></th></tr></thead><tbody>' +
      d.docsPend.map(function (x) {
        return '<tr><td class="erp-strong">' + UI.esc(DEALERS._nome(porId[x.account_id])) + '</td><td>' + UI.esc(x.name) + '</td><td>' + UI.esc(DEALERS._dt(x.created_at)) +
          '</td><td><a class="erp-btn" href="#/dealers/' + x.account_id + '">Conferir</a></td></tr>';
      }).join('') + '</tbody></table>';
  }
  if (d.reqs.length) {
    h += '<h3 class="dl-h">Pedidos de desconto</h3><table class="erp-table"><thead><tr><th>Empresa</th><th>Hoje</th><th>Pede</th><th>Motivo</th><th>Em</th><th></th></tr></thead><tbody>' +
      d.reqs.map(function (r) {
        return '<tr><td class="erp-strong">' + UI.esc(DEALERS._nome(porId[r.account_id])) + '</td><td>' + Number(r.current_pct || 0) + '%</td><td class="erp-strong">' + Number(r.requested_pct || 0) + '%</td>' +
          '<td>' + UI.esc(r.reason || '') + '</td><td>' + UI.esc(DEALERS._dt(r.created_at)) + '</td><td><a class="erp-btn" href="#/dealers/' + r.account_id + '">Decidir</a></td></tr>';
      }).join('') + '</tbody></table>';
  }

  /* árvore */
  const filhos = {};
  d.accounts.forEach(function (a) { const k = a.parent_account_id || 'raiz'; (filhos[k] = filhos[k] || []).push(a); });
  const nPessoas = {};
  d.members.forEach(function (m) { if (m.active) nPessoas[m.account_id] = (nPessoas[m.account_id] || 0) + 1; });
  const visto = {};
  const linha = function (a, nivel) {
    if (visto[a.id]) return '';
    visto[a.id] = true;
    if (a.status === 'draft' && !DEALERS._verRascunhos) return '';
    const st = DEALERS.STATUS[a.status] || DEALERS.STATUS.draft;
    let r = '<tr class="dl-row' + (a.kind === 'factory' ? ' dl-factory' : '') + '" data-a="abrir" data-id="' + a.id + '">' +
      '<td><span class="dl-indent" style="padding-left:' + (nivel * 26) + 'px">' + (nivel ? '└ ' : '') + '<b>' + UI.esc(DEALERS._nome(a)) + '</b></span></td>' +
      '<td>' + UI.esc(DEALERS.KIND[a.kind] || a.kind) + '</td>' +
      '<td>' + (a.kind === 'factory' ? '' : UI.pill(st.label, st.pill)) + '</td>' +
      '<td>' + (a.kind === 'factory' ? '' : Number(a.factory_discount_pct || 0) + '%') + '</td>' +
      '<td>' + (a.kind === 'factory' ? '' : DEALERS._taxPill(a)) + '</td>' +
      '<td>' + (nPessoas[a.id] || 0) + '</td>' +
      '<td>' + UI.esc([a.billing_city, a.billing_state].filter(Boolean).join(', ')) + '</td></tr>';
    (filhos[a.id] || []).sort(function (x, y) { return (x.kind === y.kind ? 0 : x.kind === 'distributor' ? -1 : 1) || DEALERS._nome(x).localeCompare(DEALERS._nome(y)); })
      .forEach(function (f) { r += linha(f, nivel + 1); });
    return r;
  };
  const raizes = (filhos.raiz || []).slice().sort(function (x, y) { return (x.kind === 'factory' ? -1 : 0) - (y.kind === 'factory' ? -1 : 0); });
  let corpo = raizes.map(function (a) { return linha(a, 0); }).join('');
  // empresa com pai que sumiu: aparece no fim, pra não ficar invisível
  d.accounts.forEach(function (a) { if (!visto[a.id]) corpo += linha(a, 0); });
  const nRasc = d.accounts.filter(function (a) { return a.status === 'draft'; }).length;
  h += '<h3 class="dl-h">Árvore <span class="erp-muted erp-small">— clique numa empresa pra abrir a ficha</span></h3>' +
    '<table class="erp-table dl-tree"><thead><tr><th>Empresa</th><th>Tipo</th><th>Situação</th><th>Desconto</th><th>Tax exempt</th><th>Pessoas</th><th>Cidade</th></tr></thead><tbody>' +
    (corpo || '<tr><td colspan="7" class="erp-muted">Nenhuma empresa ainda.</td></tr>') + '</tbody></table>' +
    (nRasc ? '<p class="erp-small erp-muted">' + nRasc + ' cadastro(s) em rascunho (formulário começado e não enviado). ' +
      '<a href="javascript:void(0)" data-a="rascunhos">' + (DEALERS._verRascunhos ? 'Esconder' : 'Mostrar') + '</a></p>' : '');
  return h;
};

/* ---------- FICHA ---------- */
DEALERS._campo = function (rotulo, valor) {
  return '<div class="dl-campo"><span>' + UI.esc(rotulo) + '</span><b>' + (valor ? UI.esc(valor) : '<i class="erp-muted">—</i>') + '</b></div>';
};
DEALERS._ficha = function () {
  const d = DEALERS._d;
  const a = d.accounts.find(function (x) { return x.id === DEALERS._id; });
  if (!a) return '<div class="erp-empty">Empresa não encontrada.</div>';
  const st = DEALERS.STATUS[a.status] || DEALERS.STATUS.draft;
  const q = a.questionnaire || {};
  const end = function (p) { return [a[p + '_line1'], a[p + '_line2'], a[p + '_city'], a[p + '_state'], a[p + '_zip']].filter(Boolean).join(', '); };
  const ehFabrica = a.kind === 'factory';

  let h = '<div class="dl-top"><h2>' + UI.esc(DEALERS._nome(a)) + '</h2>' + UI.pill(DEALERS.KIND[a.kind] || a.kind, 'erp-pill-neutral') +
    (ehFabrica ? '' : UI.pill(st.label, st.pill) + DEALERS._taxPill(a)) + '</div>';

  /* decisão */
  if (!ehFabrica) {
    const pais = d.accounts.filter(function (x) { return x.id !== a.id && (x.kind === 'factory' || (x.kind === 'distributor' && x.status === 'active')); });
    const ops = pais.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === a.parent_account_id ? ' selected' : '') + '>' + UI.esc((p.kind === 'factory' ? 'Direto na fábrica — ' : 'Distribuidor — ') + DEALERS._nome(p)) + '</option>';
    }).join('');
    const pendReq = (d.reqsAll || []).filter(function (r) { return r.status === 'pending'; });
    h += '<div class="dl-card dl-decide"><h3>Decisão da fábrica</h3><div class="dl-form">' +
      '<label>Tipo<select id="dl-kind" class="erp-input"><option value="dealer"' + (a.kind === 'dealer' ? ' selected' : '') + '>Lojista</option><option value="distributor"' + (a.kind === 'distributor' ? ' selected' : '') + '>Distribuidor / representante</option></select></label>' +
      '<label>Fica abaixo de<select id="dl-parent" class="erp-input">' + ops + '</select></label>' +
      '<label>Desconto de fábrica (%)<input id="dl-disc" class="erp-input" type="number" min="0" max="100" step="0.5" value="' + Number(a.factory_discount_pct || 0) + '"></label>' +
      '<label class="dl-grow">Recado (aparece pro dealer em recusa/suspensão)<input id="dl-note" class="erp-input" type="text" value="' + UI.esc(a.review_note || '') + '"></label></div>' +
      '<div class="dl-acoes">' +
      (a.status === 'pending' || a.status === 'draft' || a.status === 'rejected'
        ? '<button class="erp-btn" data-a="decidir" data-v="approve">Aprovar como dealer</button><button class="erp-btn erp-btn-secondary" data-a="decidir" data-v="reject">Recusar</button>'
        : '<button class="erp-btn" data-a="salvar">Salvar tipo, posição e desconto</button>' +
          (a.status === 'active' ? '<button class="erp-btn erp-btn-secondary" data-a="decidir" data-v="suspend">Suspender</button>'
                                 : '<button class="erp-btn erp-btn-secondary" data-a="decidir" data-v="reactivate">Reativar</button>')) +
      '</div>' +
      (a.status === 'draft' ? '<p class="erp-small erp-muted">Rascunho: o formulário ainda não foi enviado pelo cliente. Dá pra aprovar mesmo assim.</p>' : '') +
      (pendReq.length ? pendReq.map(function (r) {
        return '<div class="dl-req"><b>Pedido de desconto:</b> hoje ' + Number(r.current_pct || 0) + '% → pede <b>' + Number(r.requested_pct || 0) + '%</b>' +
          (r.reason ? ' — “' + UI.esc(r.reason) + '”' : '') + ' <span class="erp-muted erp-small">(' + UI.esc(DEALERS._dt(r.created_at)) + ')</span><div class="dl-acoes">' +
          '<label>Conceder (%)<input class="erp-input dl-req-pct" type="number" min="0" max="100" step="0.5" value="' + Number(r.requested_pct || 0) + '" data-id="' + r.id + '"></label>' +
          '<button class="erp-btn" data-a="req" data-id="' + r.id + '" data-v="1">Aprovar</button><button class="erp-btn erp-btn-secondary" data-a="req" data-id="' + r.id + '" data-v="0">Recusar</button></div></div>';
      }).join('') : '') + '</div>';
  }

  /* cadastro */
  /* nome da loja editável pela fábrica (20/11, Matt: "não quero ver por email mas por nome") */
  h += '<div class="erp-grid erp-grid-2"><div class="dl-card"><h3>Dados pra invoice</h3>' +
    '<div class="dl-form dl-nome"><label class="dl-grow">Nome da loja (aparece na Central, na árvore e nas propostas dela)<input id="dl-trade" class="erp-input" type="text" maxlength="80" value="' + UI.esc(a.trade_name || '') + '"></label>' +
    '<label class="dl-grow">Razão social<input id="dl-legal" class="erp-input" type="text" maxlength="120" value="' + UI.esc(a.legal_name || '') + '"></label>' +
    '<button class="erp-btn" data-a="nome">Salvar nome</button></div><div class="dl-campos">' +
    DEALERS._campo('Razão social', a.legal_name) + DEALERS._campo('Nome fantasia', a.trade_name) + DEALERS._campo('EIN', a.ein) +
    DEALERS._campo('Responsável', a.contact_name) + DEALERS._campo('E-mail de cobrança', a.billing_email) + DEALERS._campo('Telefone', a.phone) +
    DEALERS._campo('Site', a.website) + DEALERS._campo('Endereço de cobrança', end('billing')) +
    DEALERS._campo('Endereço de entrega', a.shipping_same === false ? end('shipping') : 'igual ao de cobrança') + '</div></div>';
  h += '<div class="dl-card"><h3>Questionário</h3><div class="dl-campos">' +
    Object.keys(DEALERS.Q).map(function (k) {
      const def = DEALERS.Q[k];
      const v = q[k];
      return DEALERS._campo(def[0], def[1] ? (def[1][v] || v) : v);
    }).join('') + '</div><h3>Contrato</h3><div class="dl-campos">' +
    (a.agreement_accepted_at
      ? DEALERS._campo('Aceito por', a.agreement_signer_name) + DEALERS._campo('Em', DEALERS._dt(a.agreement_accepted_at)) +
        DEALERS._campo('Versão', a.agreement_version) + DEALERS._campo('IP', a.agreement_ip)
      : '<p class="erp-muted">Ainda não aceitou o contrato.</p>') + '</div></div></div>';

  /* documentos */
  h += '<div class="dl-card"><h3>Documentos</h3>';
  if (!(d.docs || []).length) h += '<p class="erp-muted">Nenhum documento enviado.</p>';
  else h += d.docs.map(function (x) { return DEALERS._docHtml(x, a); }).join('');
  h += '</div>';

  /* equipe */
  const eq = d.members.filter(function (m) { return m.account_id === a.id; });
  h += '<div class="erp-grid erp-grid-2"><div class="dl-card"><h3>Equipe</h3>' +
    (eq.length ? '<table class="erp-table"><thead><tr><th>Usuário</th><th>Papel</th><th>Situação</th><th>Último acesso</th></tr></thead><tbody>' +
      eq.map(function (m) {
        const p = d.profiles[m.user_id] || {};
        return '<tr><td>' + UI.esc(p.email || m.user_id) + '</td><td>' + UI.esc(DEALERS.ROLE[m.role] || m.role) + '</td><td>' +
          (m.active ? UI.pill('ativo', 'erp-pill-ok') : UI.pill('inativo', 'erp-pill-neutral')) + '</td><td>' + UI.esc(DEALERS._dt(p.last_active_at)) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p class="erp-muted">Ninguém ainda.</p>') + '</div>';

  /* histórico */
  h += '<div class="dl-card"><h3>Histórico</h3>' +
    ((d.events || []).length ? '<ul class="dl-hist">' + d.events.map(function (e) {
      const quem = (d.profiles[e.actor_user_id] || {}).email || (e.actor_user_id ? 'usuário' : 'sistema');
      return '<li><span class="erp-muted erp-xs">' + UI.esc(DEALERS._dt(e.created_at)) + ' · ' + UI.esc(quem) + '</span><br><b>' +
        UI.esc(DEALERS.EVENT[e.kind] || e.kind) + '</b> ' + UI.esc(DEALERS._eventoTxt(e)) + '</li>';
    }).join('') + '</ul>' : '<p class="erp-muted">Sem registros.</p>') + '</div></div>';
  return h;
};
DEALERS._eventoTxt = function (e) {
  const x = e.data || {};
  if (e.kind === 'status') return (DEALERS.STATUS[x.from] || {}).label + ' → ' + (DEALERS.STATUS[x.to] || {}).label + (x.note ? ' (' + x.note + ')' : '');
  if (e.kind === 'discount') return Number(x.from || 0) + '% → ' + Number(x.to || 0) + '%';
  if (e.kind === 'tax_exempt') return ((DEALERS.TAX[x.from] || {}).label || '') + ' → ' + ((DEALERS.TAX[x.to] || {}).label || '') + (x.valid_until ? ' até ' + UI.date(x.valid_until) : '');
  if (e.kind === 'agreement') return 'versão ' + (x.version || '') + ', por ' + (x.signer || '');
  if (e.kind === 'document') return (DEALERS.DOC_KIND[x.kind] || x.kind || '') + ' “' + (x.name || '') + '” — ' + (DEALERS.DOC_STATUS[x.status] || x.status || '') + (x.note ? ' (' + x.note + ')' : '');
  if (e.kind === 'tree') return (DEALERS.KIND[x.kind] || '') + (x.parent_to !== x.parent_from ? ', mudou de posição' : '');
  if (e.kind === 'billing_data') return (x.legal_name || '') + (x.ein ? ' · EIN ' + x.ein : '');
  if (e.kind === 'discount_request') return (x.action === 'requested' ? 'pediu ' : x.action === 'approved' ? 'aprovado ' : 'recusado ') + (x.pct != null ? Number(x.pct) + '%' : '') + (x.note ? ' (' + x.note + ')' : '');
  return '';
};
DEALERS._docHtml = function (x, a) {
  const stCls = x.status === 'valid' ? 'erp-pill-ok' : x.status === 'pending' ? 'erp-pill-warn' : (x.status === 'superseded' ? 'erp-pill-neutral' : 'erp-pill-danger');
  let h = '<div class="dl-doc"><div class="dl-doc-top"><b>' + UI.esc(DEALERS.DOC_KIND[x.kind] || x.kind) + '</b><span class="erp-muted">' + UI.esc(x.name) + '</span>' +
    UI.pill(DEALERS.DOC_STATUS[x.status] || x.status, stCls) +
    (x.valid_until ? '<span class="erp-small">validade ' + UI.esc(UI.date(x.valid_until)) + '</span>' : '') +
    '<span class="erp-muted erp-xs">' + UI.esc(DEALERS._dt(x.created_at)) + '</span>' +
    '<button class="erp-btn erp-btn-secondary" data-a="doc" data-id="' + x.id + '">Abrir</button></div>';
  if (x.review_note) h += '<div class="erp-small erp-muted">Obs.: ' + UI.esc(x.review_note) + '</div>';
  if (x.kind === 'tax_exempt') {
    const r = x.ai_reading || null;
    if (r && r.ok) {
      const alerta = [];
      if (!r.is_tax_certificate) alerta.push('NÃO parece um certificado de tax exemption');
      if (!r.name_matches) alerta.push('nome no certificado diferente do cadastro (“' + (r.business_name || '?') + '” × “' + (r.name_on_file || '?') + '”)');
      if (r.already_expired) alerta.push('já está vencido');
      if (!r.is_signed) alerta.push('sem assinatura visível');
      if (!r.legible) alerta.push('imagem ruim');
      if (!r.expiration_printed && r.is_tax_certificate) alerta.push('sem validade impressa — proposto 31/12 do ano');
      h += '<div class="dl-ia"><b>Leitura da IA</b> <span class="erp-muted erp-xs">confiança ' + Math.round((r.confidence || 0) * 100) + '%</span><br>' +
        UI.esc([r.certificate_type, r.state, r.certificate_number ? 'nº ' + r.certificate_number : '', r.business_name].filter(Boolean).join(' · ')) +
        '<br>Emissão ' + UI.esc(UI.date(r.issue_date)) + ' · validade impressa ' + UI.esc(r.expiration_date ? UI.date(r.expiration_date) : 'não tem') +
        ' · <b>proposta: ' + UI.esc(UI.date(r.proposed_valid_until)) + '</b>' +
        (alerta.length ? '<div class="dl-alerta">Atenção: ' + UI.esc(alerta.join('; ')) + '.</div>' : '<div class="dl-okline">Nada de estranho na leitura.</div>') +
        (r.notes ? '<div class="erp-small erp-muted">' + UI.esc(r.notes) + '</div>' : '') + '</div>';
    } else if (r && r.ok === false) {
      h += '<div class="dl-ia erp-muted">A IA não conseguiu ler: ' + UI.esc(r.error || '') + '</div>';
    }
    if (x.status === 'pending' || x.status === 'valid') {
      const prop = (r && r.ok && r.proposed_valid_until) || x.valid_until || (new Date().getFullYear() + '-12-31');
      h += '<div class="dl-form dl-tax-form" data-doc="' + x.id + '">' +
        '<label>Válido até<input class="erp-input dl-tx-until" type="date" value="' + UI.esc(x.valid_until || prop) + '"></label>' +
        '<label>Estado<input class="erp-input dl-tx-state" type="text" maxlength="2" style="width:70px" value="' + UI.esc((r && r.state) || a.tax_exempt_state || '') + '"></label>' +
        '<label>Número<input class="erp-input dl-tx-num" type="text" value="' + UI.esc((r && r.certificate_number) || a.tax_exempt_number || '') + '"></label>' +
        '<label class="dl-grow">Observação<input class="erp-input dl-tx-note" type="text" value=""></label>' +
        '<div class="dl-acoes"><button class="erp-btn" data-a="tax" data-id="' + x.id + '" data-v="1">' + (x.status === 'valid' ? 'Corrigir validade' : 'Confirmar isenção') + '</button>' +
        '<button class="erp-btn erp-btn-secondary" data-a="tax" data-id="' + x.id + '" data-v="0">Recusar</button>' +
        '<button class="erp-btn erp-btn-ghost" data-a="ia" data-id="' + x.id + '">Ler de novo com IA</button></div></div>';
    }
  }
  return h + '</div>';
};

/* ---------- AÇÕES ---------- */
DEALERS._run = async function (fn, okMsg) {
  if (DEALERS._busy) return;
  DEALERS._busy = true; DEALERS._err = ''; DEALERS._msg = '';
  try { await fn(); DEALERS._msg = okMsg || 'Feito.'; }
  catch (e) { DEALERS._err = (e && e.message) || String(e); }
  DEALERS._busy = false;
  await DEALERS._reload();
};
DEALERS._val = function (id) { const el = document.getElementById(id); return el ? el.value : null; };

DEALERS._click = function (ev) {
  const b = ev.target.closest('[data-a]');
  if (!b) return;
  const sb = DEALERS._sb();
  const acao = b.getAttribute('data-a');
  const id = b.getAttribute('data-id');
  const d = DEALERS._d;
  if (acao === 'abrir') { location.hash = '#/dealers/' + id; return; }
  if (acao === 'liberar-acesso') {
    if (!window.confirm('Liberar o acesso de ' + (b.getAttribute('data-nome') || 'este usuário') + '? O prazo de 30 dias recomeça agora.')) return;
    return DEALERS._run(async function () {
      const r = await sb.rpc('admin_unblock_access', { p_user: id });
      if (r.error) throw r.error;
    }, 'Acesso liberado.');
  }
  if (acao === 'rascunhos') { DEALERS._verRascunhos = !DEALERS._verRascunhos; DEALERS._draw(); return; }

  if (acao === 'doc') {
    const x = (d.docs || []).find(function (k) { return k.id === id; });
    if (!x) return;
    const w = window.open('', '_blank');
    sb.storage.from('account-docs').createSignedUrl(x.storage_path, 600).then(function (r) {
      if (r.error) { if (w) w.close(); DEALERS._err = r.error.message; DEALERS._draw(); return; }
      if (w) w.location.href = r.data.signedUrl; else location.href = r.data.signedUrl;
    });
    return;
  }

  const a = d.accounts.find(function (x) { return x.id === DEALERS._id; });
  if (!a) return;
  const fabrica = d.accounts.find(function (x) { return x.kind === 'factory'; });

  if (acao === 'decidir') {
    const v = b.getAttribute('data-v');
    const nota = DEALERS._val('dl-note') || '';
    if ((v === 'reject' || v === 'suspend') && !nota.trim()) { DEALERS._err = 'Escreva o recado com o motivo antes de recusar ou suspender.'; DEALERS._draw(); return; }
    const txt = { approve: 'Aprovar ' + DEALERS._nome(a) + ' como dealer com ' + Number(DEALERS._val('dl-disc') || 0) + '% de desconto?',
      reject: 'Recusar a solicitação de ' + DEALERS._nome(a) + '?', suspend: 'Suspender ' + DEALERS._nome(a) + '?', reactivate: 'Reativar ' + DEALERS._nome(a) + '?' }[v];
    if (!window.confirm(txt)) return;
    const pai = DEALERS._val('dl-parent');
    return DEALERS._run(async function () {
      const r = await sb.rpc('admin_review_dealer', {
        p_account: a.id, p_decision: v,
        p_discount_pct: v === 'approve' ? Number(DEALERS._val('dl-disc') || 0) : null,
        p_parent: v === 'approve' ? (pai || (fabrica && fabrica.id) || null) : null,
        p_kind: v === 'approve' ? DEALERS._val('dl-kind') : null,
        p_note: nota
      });
      if (r.error) throw r.error;
    }, { approve: 'Dealer aprovado.', reject: 'Solicitação recusada.', suspend: 'Dealer suspenso.', reactivate: 'Dealer reativado.' }[v]);
  }

  if (acao === 'nome') {
    const nome = (DEALERS._val('dl-trade') || '').trim();
    if (!nome) { DEALERS._err = 'Digite o nome da loja.'; DEALERS._draw(); return; }
    return DEALERS._run(async function () {
      const r = await sb.from('accounts').update({ trade_name: nome, legal_name: (DEALERS._val('dl-legal') || '').trim() || null }).eq('id', a.id).select('id');
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw new Error('O banco não alterou nenhuma linha (RLS).');
    }, 'Nome salvo.');
  }

  if (acao === 'salvar') {
    return DEALERS._run(async function () {
      const r = await sb.from('accounts').update({
        kind: DEALERS._val('dl-kind'), parent_account_id: DEALERS._val('dl-parent') || (fabrica && fabrica.id) || null,
        factory_discount_pct: Math.max(0, Math.min(100, Number(DEALERS._val('dl-disc') || 0))),
        review_note: (DEALERS._val('dl-note') || '').trim() || null
      }).eq('id', a.id);
      if (r.error) throw r.error;
    }, 'Salvo.');
  }

  if (acao === 'tax') {
    const ok = b.getAttribute('data-v') === '1';
    const f = b.closest('.dl-tax-form');
    const g = function (c) { const el = f.querySelector(c); return el ? el.value.trim() : ''; };
    if (ok && !g('.dl-tx-until')) { DEALERS._err = 'Informe a validade.'; DEALERS._draw(); return; }
    if (!ok && !g('.dl-tx-note')) { DEALERS._err = 'Escreva na observação o motivo da recusa (o dealer vê).'; DEALERS._draw(); return; }
    return DEALERS._run(async function () {
      const r = await sb.rpc('admin_set_tax_exempt', {
        p_document: id, p_valid: ok, p_valid_until: ok ? g('.dl-tx-until') : null,
        p_state: g('.dl-tx-state').toUpperCase() || null, p_number: g('.dl-tx-num') || null, p_note: g('.dl-tx-note') || null
      });
      if (r.error) throw r.error;
    }, ok ? 'Isenção confirmada.' : 'Certificado recusado.');
  }

  if (acao === 'ia') {
    b.disabled = true; b.textContent = 'Lendo…';
    return DEALERS._run(async function () {
      const r = await sb.functions.invoke('account-tax-check', { body: { document_id: id } });
      if (r.error) throw new Error('A função account-tax-check não respondeu (' + (r.error.message || 'erro') + '). Ela já foi publicada? (publicar-funcao-tax-exempt.bat)');
    }, 'Leitura refeita.');
  }

  if (acao === 'req') {
    const aprovar = b.getAttribute('data-v') === '1';
    const inp = document.querySelector('.dl-req-pct[data-id="' + id + '"]');
    const pct = inp ? Number(inp.value) : null;
    const nota = aprovar ? '' : (window.prompt('Motivo da recusa (o dealer vê):') || '');
    if (!aprovar && !nota.trim()) return;
    return DEALERS._run(async function () {
      const r = await sb.rpc('admin_decide_discount_request', { p_request: id, p_approve: aprovar, p_pct: aprovar ? pct : null, p_note: nota || null });
      if (r.error) throw r.error;
    }, aprovar ? 'Desconto aplicado.' : 'Pedido recusado.');
  }
};

DEALERS._css = function () {
  return '<style>' +
    '.dl-kpis{margin-bottom:8px}.dl-h{margin:22px 0 8px;font-size:15px}' +
    '.dl-msg{padding:10px 14px;border-radius:8px;margin:0 0 12px;font-size:14px}.dl-ok{background:#e6f4ea;color:#1e6b3c}.dl-err{background:#fbe9e6;color:#9a2f1f}' +
    '.dl-tree .dl-row{cursor:pointer}.dl-tree .dl-row:hover td{background:rgba(0,0,0,.035)}.dl-tree .dl-factory td{background:rgba(138,90,52,.08)}' +
    '.dl-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}.dl-top h2{margin:0 6px 0 0;font-size:22px}' +
    '.dl-card{background:#fff;border:1px solid rgba(0,0,0,.1);border-radius:12px;padding:14px 18px;margin-bottom:16px}.dl-card h3{margin:0 0 10px;font-size:15px}.dl-card h3:not(:first-child){margin-top:18px}' +
    '.dl-tentou td{background:#fdf3d7}.dl-decide{border-color:#8a5a34}.dl-nome{margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid rgba(0,0,0,.08)}' +
    '.dl-form{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end}.dl-form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#766f64}.dl-form .dl-grow{flex:1;min-width:220px}' +
    '.dl-acoes{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:flex-end}.dl-acoes label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#766f64}' +
    '.dl-campos{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}.dl-campo{display:flex;flex-direction:column;font-size:13px}.dl-campo span{color:#766f64;font-size:12px}.dl-campo b{font-weight:600;word-break:break-word}' +
    '.dl-doc{border-top:1px solid rgba(0,0,0,.08);padding:10px 0}.dl-doc:first-of-type{border-top:0}.dl-doc-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.dl-doc-top .erp-btn{margin-left:auto}' +
    '.dl-ia{background:#f7f6f3;border-radius:8px;padding:8px 12px;margin:8px 0;font-size:13px;line-height:1.5}.dl-alerta{color:#9a2f1f;font-weight:600;margin-top:4px}.dl-okline{color:#1e6b3c;margin-top:4px}' +
    '.dl-tax-form{margin-top:8px}.dl-req{background:#fdf3d7;border-radius:8px;padding:10px 14px;margin-top:12px;font-size:14px}' +
    '.dl-hist{list-style:none;margin:0;padding:0;max-height:340px;overflow:auto}.dl-hist li{padding:6px 0;border-top:1px solid rgba(0,0,0,.07);font-size:13px}.dl-hist li:first-child{border-top:0}' +
    '.erp-pill-danger{background:#fbe9e6;color:#9a2f1f}' +
    '</style>';
};
