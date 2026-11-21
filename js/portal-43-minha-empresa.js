// ============================================================
// MINHA EMPRESA — painel, árvore, equipe, margens e desconto
// (20/11/2026, Etapa 2; migrations 306–309)
// ============================================================
// Matt, 20/11: "quero que ele tenha tela dedicada à administração dos
// funcionários abaixo dele. quero ver uma estrutura em árvore com a fábrica
// no topo, representante/distribuidor no meio e depois o lojista... o que
// cada um pode ver, nessa tela gestão das margens de trabalho, configuração
// do markup dele, logo (tirar lá de cima da barra e deixar mais robusto),
// junto do dashboard básico dos projetos em execução e fechados" + "perdido
// (motivos)" + "ele não pode aplicar o desconto... deve solicitar".
//
// Botão "Minha empresa" na barra de cima (ao lado de Margens) → janela com 5
// abas:
//   PAINEL   em construção · em produção · entregues · PERDIDOS (com motivos)
//            e a mesma conta por loja (quem tem lojas abaixo) ou por pessoa.
//   ÁRVORE   fábrica › distribuidor › lojista (RPC account_tree) — cada um vê
//            a própria empresa pra baixo. Admin: clique abre a ficha no ERP.
//   EQUIPE   funcionários da loja: papel, caixinhas (ver pedidos dos colegas,
//            enviar pedido, aprovar pedido), ativar/desativar, criar vendedor
//            (mesma função dealer-create-seller de hoje).
//   MARGENS  desconto de fábrica (só leitura + "Solicitar desconto"), margem
//            de revenda e extras (abre o modal Margens de hoje), logo/dados.
//   EMPRESA  abre a ficha (portal-42): cadastro, contrato, tax exemption.
//
// EM TESTE: ME_SO_ADMIN = true → só administrador vê o botão. Com ?empresa=1
// no endereço um dealer de teste também vê (localStorage.legno_minha_empresa).
// LIBERAR: ME_SO_ADMIN = false. No mesmo dia, DESCONTO_SO_FABRICA = true +
// rodar a migration 309 (o campo de desconto do modal Margens vira só leitura
// e o botão Margens sai da barra — fica dentro desta tela).
//
// Não edita arquivo existente: embrulha refreshBecomeDealerUi (pra saber que
// o perfil carregou) e renderMarginsModal (campo de desconto só leitura).
// Textos pt/en/es aqui (ME_TXT). Sem as migrations o botão não aparece.
//
// Carregado depois do portal-42.

const ME_SO_ADMIN = true;
const DESCONTO_SO_FABRICA = false;
const ME_LOST_REASONS = ['price', 'lead_time', 'client_gave_up', 'competitor', 'other'];
const meState = { tab: 'painel', card: null, acc: null, tree: [], team: [], projects: [], orders: [], reqs: [], busy: false, msg: '', err: '', loaded: false, hasLost: true };

(function meUrlFlag() {
  try {
    const p = new URLSearchParams(location.search).get('empresa');
    if (p === '1') localStorage.setItem('legno_minha_empresa', '1');
    if (p === '0') localStorage.removeItem('legno_minha_empresa');
  } catch (e) { /* ok */ }
})();
function meOn() {
  if (!ME_SO_ADMIN) return true;
  if (window.LEGNO_IS_ADMIN === true) return true;
  try { return localStorage.getItem('legno_minha_empresa') === '1'; } catch (e) { return false; }
}
function meIsAdmin() { return window.LEGNO_IS_ADMIN === true; }

const ME_TXT = {
  pt: {
    btn: 'Minha empresa', title: 'Minha empresa', title_factory: 'Rede de dealers',
    t_painel: 'Painel', t_arvore: 'Árvore', t_equipe: 'Equipe', t_margens: 'Margens e desconto', t_empresa: 'Empresa',
    close: 'Fechar', loading: 'Carregando…', none: 'Nada por aqui ainda.',
    k_build: 'Em construção', k_prod: 'Em produção', k_done: 'Entregues', k_lost: 'Perdidos', k_wait: 'Aguardando aprovação',
    projects: 'projeto(s)', orders: 'pedido(s)', est: 'valor estimado', fab: 'valor de fábrica',
    lost_reasons: 'Motivos dos projetos perdidos', lost_none: 'Nenhum projeto marcado como perdido.',
    r_price: 'Preço', r_lead_time: 'Prazo', r_client_gave_up: 'Cliente desistiu', r_competitor: 'Foi pra concorrente', r_other: 'Outro', r_null: 'Sem motivo',
    by_store: 'Por loja', by_person: 'Por pessoa', col_who: 'Quem', no_store: 'Sem loja',
    kind_factory: 'Fábrica', kind_distributor: 'Distribuidor', kind_dealer: 'Lojista',
    st_draft: 'rascunho', st_pending: 'em análise', st_active: 'ativo', st_suspended: 'suspenso', st_rejected: 'recusado',
    tax_none: 'sem tax exempt', tax_pending: 'tax exempt em conferência', tax_valid: 'isento até {d}', tax_expired: 'tax exempt vencido', tax_rejected: 'tax exempt recusado',
    people: 'pessoa(s)', tree_hint: 'Cada empresa enxerga a si mesma e o que está abaixo dela.', open_erp: 'Abrir ficha no ERP',
    team_hint: 'Quem trabalha na sua empresa e o que cada um pode fazer.', role: 'Papel', role_owner: 'Dono', role_manager: 'Gerente', role_seller: 'Vendedor', role_finance: 'Financeiro',
    p_see_team_orders: 'Ver pedidos e projetos dos colegas', p_send_orders: 'Enviar pedido', p_approve_orders: 'Aprovar pedido pra fábrica',
    active: 'ativo', inactive: 'inativo', activate: 'Ativar', deactivate: 'Desativar', last_seen: 'último acesso',
    roles_note: 'Dono e gerente veem tudo da loja. Financeiro vê pedidos e documentos. Vendedor vê só o que é dele, a não ser que a caixinha esteja marcada. Preço de fábrica e margem continuam só pro dono (como hoje).',
    new_seller: 'Novo funcionário', name: 'Nome', email: 'E-mail', password: 'Senha (mín. 6)', create: 'Criar', created: 'Criado: {email}',
    only_owner_creates: 'Só o dono da loja cria e ativa/desativa funcionários.', no_company: 'Esta conta ainda não tem empresa cadastrada.',
    disc_title: 'Desconto de fábrica', disc_by: 'definido pela Legno', disc_ask: 'Solicitar desconto', disc_want: 'Desconto desejado (%)', disc_reason: 'Motivo (volume, projeto, condição…)',
    disc_send: 'Enviar pedido', disc_sent: 'Pedido enviado. A Legno vai analisar.', disc_pending: 'Pedido em análise: {p}% (enviado em {d})',
    disc_hist: 'Pedidos anteriores', ds_approved: 'aprovado', ds_rejected: 'recusado', ds_cancelled: 'substituído', ds_pending: 'em análise',
    disc_readonly: 'Definido pela Legno. Pra alterar, use "Solicitar desconto" em Minha empresa.',
    margin_title: 'Margem de revenda e extras', margin_now: 'Margem bruta atual: {m}%', margin_open: 'Abrir margens', margin_hint: 'Margem, frete, comissão, montagem e outros extras do seu preço de venda.',
    brand_title: 'Logo e dados da loja', brand_hint: 'A logo e o nome aparecem no cabeçalho e nas propostas.', brand_open: 'Abrir configurações da loja',
    comp_hint: 'Cadastro pra invoice, contrato e tax exemption.', comp_open: 'Abrir ficha da empresa',
    saved: 'Salvo.', lost_mark: 'Marcar como perdido', lost_title: 'Marcar como perdido', lost_why: 'Por que este projeto foi perdido?', lost_note: 'Observação (opcional)',
    lost_ok: 'Marcar', lost_reopen: 'Reabrir', cancel: 'Cancelar'
  },
  en: {
    btn: 'My company', title: 'My company', title_factory: 'Dealer network',
    t_painel: 'Dashboard', t_arvore: 'Tree', t_equipe: 'Team', t_margens: 'Margins & discount', t_empresa: 'Company',
    close: 'Close', loading: 'Loading…', none: 'Nothing here yet.',
    k_build: 'In progress', k_prod: 'In production', k_done: 'Delivered', k_lost: 'Lost', k_wait: 'Waiting approval',
    projects: 'project(s)', orders: 'order(s)', est: 'estimated value', fab: 'factory value',
    lost_reasons: 'Why projects were lost', lost_none: 'No project marked as lost.',
    r_price: 'Price', r_lead_time: 'Lead time', r_client_gave_up: 'Client gave up', r_competitor: 'Went to a competitor', r_other: 'Other', r_null: 'No reason',
    by_store: 'By store', by_person: 'By person', col_who: 'Who', no_store: 'No store',
    kind_factory: 'Factory', kind_distributor: 'Distributor', kind_dealer: 'Dealer',
    st_draft: 'draft', st_pending: 'under review', st_active: 'active', st_suspended: 'suspended', st_rejected: 'not approved',
    tax_none: 'no tax exemption', tax_pending: 'tax exemption under review', tax_valid: 'exempt until {d}', tax_expired: 'tax exemption expired', tax_rejected: 'tax exemption rejected',
    people: 'people', tree_hint: 'Each company sees itself and what is below it.', open_erp: 'Open file in ERP',
    team_hint: 'Who works at your company and what each one can do.', role: 'Role', role_owner: 'Owner', role_manager: 'Manager', role_seller: 'Salesperson', role_finance: 'Finance',
    p_see_team_orders: 'See colleagues\' orders and projects', p_send_orders: 'Send orders', p_approve_orders: 'Approve orders to the factory',
    active: 'active', inactive: 'inactive', activate: 'Activate', deactivate: 'Deactivate', last_seen: 'last seen',
    roles_note: 'Owner and manager see everything in the store. Finance sees orders and documents. A salesperson sees only their own work unless the box is checked. Factory price and margin remain owner-only (as today).',
    new_seller: 'New employee', name: 'Name', email: 'E-mail', password: 'Password (min. 6)', create: 'Create', created: 'Created: {email}',
    only_owner_creates: 'Only the store owner creates and activates/deactivates employees.', no_company: 'This account has no company on file yet.',
    disc_title: 'Factory discount', disc_by: 'set by Legno', disc_ask: 'Request a discount', disc_want: 'Requested discount (%)', disc_reason: 'Reason (volume, project, terms…)',
    disc_send: 'Send request', disc_sent: 'Request sent. Legno will review it.', disc_pending: 'Request under review: {p}% (sent on {d})',
    disc_hist: 'Previous requests', ds_approved: 'approved', ds_rejected: 'declined', ds_cancelled: 'replaced', ds_pending: 'under review',
    disc_readonly: 'Set by Legno. To change it, use "Request a discount" in My company.',
    margin_title: 'Resale margin and extras', margin_now: 'Current gross margin: {m}%', margin_open: 'Open margins', margin_hint: 'Margin, freight, commission, installation and other extras of your selling price.',
    brand_title: 'Logo and store details', brand_hint: 'Your logo and name show in the header and on proposals.', brand_open: 'Open store settings',
    comp_hint: 'Invoice details, agreement and tax exemption.', comp_open: 'Open company file',
    saved: 'Saved.', lost_mark: 'Mark as lost', lost_title: 'Mark as lost', lost_why: 'Why was this project lost?', lost_note: 'Note (optional)',
    lost_ok: 'Mark', lost_reopen: 'Reopen', cancel: 'Cancel'
  },
  es: {
    btn: 'Mi empresa', title: 'Mi empresa', title_factory: 'Red de dealers',
    t_painel: 'Panel', t_arvore: 'Árbol', t_equipe: 'Equipo', t_margens: 'Márgenes y descuento', t_empresa: 'Empresa',
    close: 'Cerrar', loading: 'Cargando…', none: 'Nada por aquí todavía.',
    k_build: 'En desarrollo', k_prod: 'En producción', k_done: 'Entregados', k_lost: 'Perdidos', k_wait: 'Esperando aprobación',
    projects: 'proyecto(s)', orders: 'pedido(s)', est: 'valor estimado', fab: 'valor de fábrica',
    lost_reasons: 'Motivos de los proyectos perdidos', lost_none: 'Ningún proyecto marcado como perdido.',
    r_price: 'Precio', r_lead_time: 'Plazo', r_client_gave_up: 'El cliente desistió', r_competitor: 'Se fue a la competencia', r_other: 'Otro', r_null: 'Sin motivo',
    by_store: 'Por tienda', by_person: 'Por persona', col_who: 'Quién', no_store: 'Sin tienda',
    kind_factory: 'Fábrica', kind_distributor: 'Distribuidor', kind_dealer: 'Tienda',
    st_draft: 'borrador', st_pending: 'en revisión', st_active: 'activo', st_suspended: 'suspendido', st_rejected: 'no aprobado',
    tax_none: 'sin tax exemption', tax_pending: 'tax exemption en revisión', tax_valid: 'exento hasta {d}', tax_expired: 'tax exemption vencido', tax_rejected: 'tax exemption rechazado',
    people: 'persona(s)', tree_hint: 'Cada empresa se ve a sí misma y lo que está debajo.', open_erp: 'Abrir ficha en el ERP',
    team_hint: 'Quién trabaja en su empresa y qué puede hacer cada uno.', role: 'Rol', role_owner: 'Dueño', role_manager: 'Gerente', role_seller: 'Vendedor', role_finance: 'Finanzas',
    p_see_team_orders: 'Ver pedidos y proyectos de los colegas', p_send_orders: 'Enviar pedidos', p_approve_orders: 'Aprobar pedidos a la fábrica',
    active: 'activo', inactive: 'inactivo', activate: 'Activar', deactivate: 'Desactivar', last_seen: 'último acceso',
    roles_note: 'Dueño y gerente ven todo. Finanzas ve pedidos y documentos. El vendedor ve solo lo suyo, salvo que la casilla esté marcada. Precio de fábrica y margen siguen solo para el dueño (como hoy).',
    new_seller: 'Nuevo empleado', name: 'Nombre', email: 'E-mail', password: 'Contraseña (mín. 6)', create: 'Crear', created: 'Creado: {email}',
    only_owner_creates: 'Solo el dueño crea y activa/desactiva empleados.', no_company: 'Esta cuenta aún no tiene empresa registrada.',
    disc_title: 'Descuento de fábrica', disc_by: 'definido por Legno', disc_ask: 'Solicitar descuento', disc_want: 'Descuento deseado (%)', disc_reason: 'Motivo (volumen, proyecto, condición…)',
    disc_send: 'Enviar solicitud', disc_sent: 'Solicitud enviada. Legno la revisará.', disc_pending: 'Solicitud en revisión: {p}% (enviada el {d})',
    disc_hist: 'Solicitudes anteriores', ds_approved: 'aprobada', ds_rejected: 'rechazada', ds_cancelled: 'reemplazada', ds_pending: 'en revisión',
    disc_readonly: 'Definido por Legno. Para cambiarlo, use "Solicitar descuento" en Mi empresa.',
    margin_title: 'Margen de reventa y extras', margin_now: 'Margen bruto actual: {m}%', margin_open: 'Abrir márgenes', margin_hint: 'Margen, flete, comisión, instalación y otros extras de su precio de venta.',
    brand_title: 'Logo y datos de la tienda', brand_hint: 'El logo y el nombre aparecen en el encabezado y en las propuestas.', brand_open: 'Abrir configuración de la tienda',
    comp_hint: 'Datos de facturación, contrato y tax exemption.', comp_open: 'Abrir ficha de la empresa',
    saved: 'Guardado.', lost_mark: 'Marcar como perdido', lost_title: 'Marcar como perdido', lost_why: '¿Por qué se perdió este proyecto?', lost_note: 'Nota (opcional)',
    lost_ok: 'Marcar', lost_reopen: 'Reabrir', cancel: 'Cancelar'
  }
};
function meLang() {
  try { const l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; return ME_TXT[l] ? l : 'en'; } catch (e) { return 'en'; }
}
function mT(k, vars) {
  let s = ME_TXT[meLang()][k]; if (s == null) s = ME_TXT.en[k]; if (s == null) s = k;
  if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(vars[v] == null ? '' : vars[v]); });
  return s;
}
function mEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function mMoney(v) { return '$' + Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function mDate(d) {
  if (!d) return '—';
  const x = /^\d{4}-\d{2}-\d{2}$/.test(String(d)) ? new Date(d + 'T12:00:00') : new Date(d);
  return isNaN(x) ? String(d) : x.toLocaleDateString(meLang() === 'pt' ? 'pt-BR' : meLang() === 'es' ? 'es' : 'en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

// ---------- dados ----------
async function meLoadCard() {
  try {
    const { data, error } = await supabaseClient.rpc('my_account_card');
    if (error) throw error;
    meState.card = data || null;
    meState.cardOk = true;
  } catch (e) { meState.card = null; meState.cardOk = false; }
  return meState.card;
}
async function meLoad() {
  await meLoadCard();
  const sb = supabaseClient;
  const tree = await sb.rpc('account_tree');
  meState.tree = tree.error ? [] : (tree.data || []);
  const team = await sb.rpc('account_team');
  meState.team = team.error ? [] : (team.data || []);
  meState.acc = null; meState.reqs = [];
  if (meState.card && ['owner', 'manager', 'finance'].includes(meState.card.role)) {
    const a = await sb.from('accounts').select('*').eq('id', meState.card.id).maybeSingle();
    meState.acc = a.error ? null : a.data;
    const r = await sb.from('account_discount_requests').select('*').eq('account_id', meState.card.id).order('created_at', { ascending: false }).limit(6);
    meState.reqs = r.error ? [] : (r.data || []);
  }
  // projetos e pedidos que EU enxergo (o banco já corta pela árvore)
  const PB = 'id, client_user_id, name, client_folder, cached_value_usd, frozen_order_id, archived_at, updated_at';
  let pr = await sb.from('user_projects').select(PB + ', lost_at, lost_reason').limit(5000);
  meState.hasLost = !pr.error;
  if (pr.error) pr = await sb.from('user_projects').select(PB).limit(5000);
  meState.projects = pr.error ? [] : (pr.data || []);
  const OB = 'id, client_user_id, status, order_type, finance_released_at, delivered_at, submitted_at, approved_at';
  let od = await sb.from('orders').select(OB + ', account_id, price_list_total, price_net_total')
    .in('status', ['submitted', 'approved', 'paid', 'delivered']).limit(5000);
  if (od.error) od = await sb.from('orders').select(OB).in('status', ['submitted', 'approved', 'paid', 'delivered']).limit(5000);
  meState.orders = od.error ? [] : (od.data || []);
  // valor dos pedidos sem a foto do preço: soma dos itens (tabela)
  const semValor = meState.orders.filter((o) => o.price_net_total == null && o.order_type !== 'cutting_list').map((o) => o.id);
  const soma = {};
  for (let i = 0; i < semValor.length && i < 1500; i += 100) {
    try {
      const { data } = await sb.from('order_items').select('order_id, total_price').in('order_id', semValor.slice(i, i + 100));
      (data || []).forEach((it) => { soma[it.order_id] = (soma[it.order_id] || 0) + Number(it.total_price || 0); });
    } catch (e) { /* fica sem valor */ }
  }
  meState.orders.forEach((o) => { o._v = o.price_net_total != null ? Number(o.price_net_total) : (soma[o.id] || 0); });
  meState.loaded = true;
}

// conta por grupo: { build, buildV, wait, waitV, prod, prodV, done, doneV, lost, lostV }
function meCount(projs, orders) {
  const c = { build: 0, buildV: 0, wait: 0, waitV: 0, prod: 0, prodV: 0, done: 0, doneV: 0, lost: 0, lostV: 0, reasons: {} };
  projs.forEach((p) => {
    if (p.frozen_order_id) return;               // já virou pedido
    const v = Number(p.cached_value_usd) || 0;
    if (p.lost_at) { c.lost++; c.lostV += v; const r = p.lost_reason || 'null'; c.reasons[r] = c.reasons[r] || { n: 0, v: 0 }; c.reasons[r].n++; c.reasons[r].v += v; return; }
    if (p.archived_at) return;
    c.build++; c.buildV += v;
  });
  orders.forEach((o) => {
    if (o.status === 'delivered') { c.done++; c.doneV += o._v || 0; }
    else if (o.status === 'approved' || o.status === 'paid') { c.prod++; c.prodV += o._v || 0; }
    else if (o.status === 'submitted') { c.wait++; c.waitV += o._v || 0; }
  });
  return c;
}

// ---------- janela ----------
function meEl() {
  let ov = document.getElementById('po-me');
  if (!ov) {
    meCss();
    ov = document.createElement('div');
    ov.id = 'po-me';
    ov.addEventListener('click', meClick);
    ov.addEventListener('change', meChange);
    document.body.appendChild(ov);
  }
  return ov;
}
function meClose() { const ov = document.getElementById('po-me'); if (ov) ov.style.display = 'none'; }
async function openMyCompany(tab) {
  const ov = meEl();
  ov.style.display = 'flex';
  if (tab) meState.tab = tab;
  meState.msg = ''; meState.err = '';
  if (!meState.loaded) ov.innerHTML = meFrame('<p class="hint">' + mEsc(mT('loading')) + '</p>');
  try { await meLoad(); } catch (e) { meState.err = (e && e.message) || String(e); }
  meRender();
}
function meTabs() {
  const temEmpresa = !!meState.card;
  const manda = temEmpresa && ['owner', 'manager'].includes(meState.card.role);
  const t = ['painel', 'arvore'];
  if (manda) t.push('equipe');
  if (temEmpresa && ['owner', 'manager', 'finance'].includes(meState.card.role)) t.push('margens');
  if (manda) t.push('empresa');
  return t;
}
function meFrame(inner) {
  const tabs = meTabs();
  if (!tabs.includes(meState.tab)) meState.tab = 'painel';
  const nome = meState.card ? (meState.card.trade_name || meState.card.legal_name || mT('title')) : (meIsAdmin() ? mT('title_factory') : mT('title'));
  return '<div class="me-box" role="dialog" aria-modal="true"><div class="me-head"><div><h3>' + mEsc(nome) + '</h3>'
    + (meState.card ? '<span class="me-sub">' + mEsc(mT('kind_' + meState.card.kind)) + ' · ' + mEsc(mT('role_' + meState.card.role)) + '</span>' : '') + '</div>'
    + '<button type="button" class="me-x" data-a="close" aria-label="' + mEsc(mT('close')) + '">×</button></div>'
    + '<div class="me-tabs">' + tabs.map((t) => '<button type="button" class="me-tab' + (t === meState.tab ? ' on' : '') + '" data-a="tab" data-t="' + t + '">' + mEsc(mT('t_' + t)) + '</button>').join('') + '</div>'
    + (meState.err ? '<p class="error me-msg">' + mEsc(meState.err) + '</p>' : '') + (meState.msg ? '<p class="me-msg ok">' + mEsc(meState.msg) + '</p>' : '')
    + '<div class="me-body">' + inner + '</div></div>';
}
function meRender() {
  const ov = meEl();
  const t = meState.tab;
  ov.innerHTML = meFrame(t === 'arvore' ? meViewTree() : t === 'equipe' ? meViewTeam() : t === 'margens' ? meViewMargins() : t === 'empresa' ? meViewCompany() : meViewPainel());
}

// ---------- PAINEL ----------
function meKpi(cls, rot, n, unid, v, vrot) {
  return '<div class="me-kpi ' + cls + '"><span>' + mEsc(rot) + '</span><strong>' + n + '</strong><em>' + mEsc(unid) + '</em><small>' + mEsc(mMoney(v)) + ' · ' + mEsc(vrot) + '</small></div>';
}
function meViewPainel() {
  const c = meCount(meState.projects, meState.orders);
  let h = '<div class="me-kpis">'
    + meKpi('k-build', mT('k_build'), c.build, mT('projects'), c.buildV, mT('est'))
    + meKpi('k-wait', mT('k_wait'), c.wait, mT('orders'), c.waitV, mT('fab'))
    + meKpi('k-prod', mT('k_prod'), c.prod, mT('orders'), c.prodV, mT('fab'))
    + meKpi('k-done', mT('k_done'), c.done, mT('orders'), c.doneV, mT('fab'))
    + meKpi('k-lost', mT('k_lost'), c.lost, mT('projects'), c.lostV, mT('est')) + '</div>';

  // perdidos por motivo
  h += '<h4>' + mEsc(mT('lost_reasons')) + '</h4>';
  const rs = Object.keys(c.reasons).sort((a, b) => c.reasons[b].n - c.reasons[a].n);
  if (!rs.length) h += '<p class="hint">' + mEsc(mT('lost_none')) + '</p>';
  else {
    const max = Math.max.apply(null, rs.map((r) => c.reasons[r].n));
    h += '<div class="me-bars">' + rs.map((r) => '<div class="me-bar"><span>' + mEsc(mT('r_' + r)) + '</span><div><i style="width:' + Math.max(4, Math.round(100 * c.reasons[r].n / max)) + '%"></i></div><b>' + c.reasons[r].n + '</b><em>' + mEsc(mMoney(c.reasons[r].v)) + '</em></div>').join('') + '</div>';
  }

  // quebra: por loja (quem tem mais de uma empresa à vista) ou por pessoa
  const contaDe = {}; const emailDe = {};
  meState.team.forEach((m) => { contaDe[m.user_id] = m.account_id; emailDe[m.user_id] = m.email; });
  const lojas = meState.tree.filter((a) => a.kind !== 'factory');
  const porLoja = lojas.length > 1;
  const grupos = {};
  const chave = (uid, accId) => porLoja ? (accId || contaDe[uid] || '_') : uid;
  meState.projects.forEach((p) => { const k = chave(p.client_user_id, null); (grupos[k] = grupos[k] || { p: [], o: [] }).p.push(p); });
  meState.orders.forEach((o) => { const k = chave(o.client_user_id, o.account_id); (grupos[k] = grupos[k] || { p: [], o: [] }).o.push(o); });
  const nomeLoja = {}; lojas.forEach((a) => { nomeLoja[a.id] = a.trade_name || a.legal_name || '—'; });
  const linhas = Object.keys(grupos).map((k) => {
    const g = meCount(grupos[k].p, grupos[k].o);
    return { nome: porLoja ? (nomeLoja[k] || mT('no_store')) : (emailDe[k] || (typeof currentUser !== 'undefined' && currentUser && k === currentUser.id ? currentUser.email : k.slice(0, 8))), g };
  }).filter((x) => x.g.build + x.g.wait + x.g.prod + x.g.done + x.g.lost > 0)
    .sort((a, b) => (b.g.prodV + b.g.doneV) - (a.g.prodV + a.g.doneV) || a.nome.localeCompare(b.nome));
  if (linhas.length > 1 || porLoja) {
    const cel = (n, v) => '<td>' + (n ? '<b>' + n + '</b> <span>' + mEsc(mMoney(v)) + '</span>' : '<span>—</span>') + '</td>';
    h += '<h4>' + mEsc(mT(porLoja ? 'by_store' : 'by_person')) + '</h4><div class="me-tablewrap"><table class="me-table"><thead><tr><th>' + mEsc(mT(porLoja ? 'kind_dealer' : 'col_who')) + '</th><th>' + mEsc(mT('k_build')) + '</th><th>' + mEsc(mT('k_wait'))
      + '</th><th>' + mEsc(mT('k_prod')) + '</th><th>' + mEsc(mT('k_done')) + '</th><th>' + mEsc(mT('k_lost')) + '</th></tr></thead><tbody>'
      + linhas.map((x) => '<tr><td class="me-nome">' + mEsc(x.nome) + '</td>' + cel(x.g.build, x.g.buildV) + cel(x.g.wait, x.g.waitV) + cel(x.g.prod, x.g.prodV) + cel(x.g.done, x.g.doneV) + cel(x.g.lost, x.g.lostV) + '</tr>').join('')
      + '</tbody></table></div>';
  }
  return h;
}

// ---------- ÁRVORE ----------
function meTaxTxt(a) {
  let st = a.tax_exempt_status || 'none';
  if (st === 'valid' && a.tax_exempt_valid_until && new Date(a.tax_exempt_valid_until + 'T23:59:59') < new Date()) st = 'expired';
  return { st, txt: mT('tax_' + st, { d: mDate(a.tax_exempt_valid_until) }) };
}
function meViewTree() {
  const tree = meState.tree;
  if (!tree.length) return '<p class="hint">' + mEsc(mT('none')) + '</p>';
  const ids = new Set(tree.map((a) => a.id));
  const filhos = {};
  tree.forEach((a) => { const k = a.parent_account_id && ids.has(a.parent_account_id) ? a.parent_account_id : 'raiz'; (filhos[k] = filhos[k] || []).push(a); });
  const contaDe = {}; meState.team.forEach((m) => { contaDe[m.user_id] = m.account_id; });
  const porConta = {};
  meState.projects.forEach((p) => { const k = contaDe[p.client_user_id]; if (k) (porConta[k] = porConta[k] || { p: [], o: [] }).p.push(p); });
  meState.orders.forEach((o) => { const k = o.account_id || contaDe[o.client_user_id]; if (k) (porConta[k] = porConta[k] || { p: [], o: [] }).o.push(o); });
  const ord = (l) => l.slice().sort((x, y) => (x.kind === y.kind ? 0 : x.kind === 'factory' ? -1 : y.kind === 'factory' ? 1 : x.kind === 'distributor' ? -1 : 1) || String(x.trade_name || x.legal_name || '').localeCompare(String(y.trade_name || y.legal_name || '')));
  const no = (a) => {
    const g = porConta[a.id] ? meCount(porConta[a.id].p, porConta[a.id].o) : null;
    const tx = meTaxTxt(a);
    const meu = meState.card && meState.card.id === a.id;
    return '<li><div class="me-node k-' + mEsc(a.kind) + (meu ? ' meu' : '') + '">'
      + '<div class="me-node-top"><strong>' + mEsc(a.trade_name || a.legal_name || '—') + '</strong><span class="me-pill">' + mEsc(mT('kind_' + a.kind)) + '</span>'
      + (a.kind !== 'factory' ? '<span class="me-pill st-' + mEsc(a.status) + '">' + mEsc(mT('st_' + a.status)) + '</span><span class="me-pill tx-' + tx.st + '">' + mEsc(tx.txt) + '</span>' : '')
      + (a.factory_discount_pct != null && a.kind !== 'factory' ? '<span class="me-pill">' + Number(a.factory_discount_pct) + '%</span>' : '') + '</div>'
      + '<div class="me-node-sub">' + (a.members || 0) + ' ' + mEsc(mT('people'))
      + ([a.billing_city, a.billing_state].filter(Boolean).length ? ' · ' + mEsc([a.billing_city, a.billing_state].filter(Boolean).join(', ')) : '')
      + (g ? ' · ' + mEsc(mT('k_build')) + ' ' + g.build + ' · ' + mEsc(mT('k_prod')) + ' ' + g.prod + ' · ' + mEsc(mT('k_done')) + ' ' + g.done + (g.lost ? ' · ' + mEsc(mT('k_lost')) + ' ' + g.lost : '') : '')
      + (meIsAdmin() && a.kind !== 'factory' ? ' · <a href="erp/index.html#/dealers/' + mEsc(a.id) + '" target="_blank" rel="noopener">' + mEsc(mT('open_erp')) + ' ↗</a>' : '') + '</div></div>'
      + (filhos[a.id] ? '<ul>' + ord(filhos[a.id]).map(no).join('') + '</ul>' : '') + '</li>';
  };
  return '<p class="hint">' + mEsc(mT('tree_hint')) + '</p><ul class="me-tree">' + ord(filhos.raiz || []).map(no).join('') + '</ul>';
}

// ---------- EQUIPE ----------
function meViewTeam() {
  if (!meState.card) return '<p class="hint">' + mEsc(mT('no_company')) + '</p>';
  const eu = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  const meuPapel = meState.card.role;
  const lista = meState.team.filter((m) => m.account_id === meState.card.id);
  const PERMS = ['see_team_orders', 'send_orders', 'approve_orders'];
  const linhas = lista.map((m) => {
    const fixo = m.role === 'owner' || m.user_id === eu;           // dono e a própria linha não se editam aqui
    const perm = m.permissions || {};
    const marcado = (k) => k === 'see_team_orders' ? perm[k] === true : perm[k] !== false; // enviar/aprovar: vazio = pode (como hoje)
    return '<div class="me-member' + (m.active ? '' : ' off') + '" data-m="' + mEsc(m.member_id) + '">'
      + '<div class="me-m-top"><strong>' + mEsc(m.email || '—') + '</strong><span class="me-pill ' + (m.active ? 'st-active' : 'st-draft') + '">' + mEsc(mT(m.active ? 'active' : 'inactive')) + '</span>'
      + '<span class="hint">' + mEsc(mT('last_seen')) + ': ' + mEsc(mDate(m.last_active_at)) + '</span></div>'
      + '<div class="me-m-row"><label>' + mEsc(mT('role')) + ' <select data-a2="role"' + (fixo ? ' disabled' : '') + '>'
      + ['owner', 'manager', 'seller', 'finance'].filter((r) => r !== 'owner' || m.role === 'owner').map((r) => '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + mEsc(mT('role_' + r)) + '</option>').join('') + '</select></label>'
      + (m.role === 'seller' ? PERMS.map((k) => '<label class="me-chk"><input type="checkbox" data-a2="perm" data-k="' + k + '"' + (marcado(k) ? ' checked' : '') + (fixo ? ' disabled' : '') + '> ' + mEsc(mT('p_' + k)) + '</label>').join('') : '')
      + (m.role !== 'owner' && m.user_id !== eu && meuPapel === 'owner'
        ? '<button type="button" class="secondary" data-a="ativo" data-u="' + mEsc(m.user_id) + '" data-v="' + (m.active ? '0' : '1') + '">' + mEsc(mT(m.active ? 'deactivate' : 'activate')) + '</button>' : '')
      + '</div></div>';
  }).join('');
  const novo = meuPapel === 'owner'
    ? '<h4>' + mEsc(mT('new_seller')) + '</h4><div class="me-form"><input type="text" id="me-new-name" placeholder="' + mEsc(mT('name')) + '" autocomplete="off">'
      + '<input type="email" id="me-new-email" placeholder="' + mEsc(mT('email')) + '" autocomplete="off"><input type="password" id="me-new-pass" placeholder="' + mEsc(mT('password')) + '" autocomplete="new-password">'
      + '<button type="button" data-a="criar"' + (meState.busy ? ' disabled' : '') + '>' + mEsc(mT('create')) + '</button></div>'
    : '<p class="hint">' + mEsc(mT('only_owner_creates')) + '</p>';
  return '<p class="hint">' + mEsc(mT('team_hint')) + '</p>' + (linhas || '<p class="hint">' + mEsc(mT('none')) + '</p>') + novo + '<p class="hint me-note">' + mEsc(mT('roles_note')) + '</p>';
}

// ---------- MARGENS E DESCONTO ----------
function meViewMargins() {
  const a = meState.acc;
  const manda = meState.card && ['owner', 'manager'].includes(meState.card.role);
  const pend = meState.reqs.find((r) => r.status === 'pending');
  const hist = meState.reqs.filter((r) => r.status !== 'pending');
  let h = '<div class="me-card"><h4>' + mEsc(mT('disc_title')) + '</h4>'
    + '<p class="me-big">' + Number(a ? a.factory_discount_pct : 0) + '% <span class="hint">' + mEsc(mT('disc_by')) + '</span></p>';
  if (pend) h += '<p class="me-warn">' + mEsc(mT('disc_pending', { p: Number(pend.requested_pct), d: mDate(pend.created_at) })) + '</p>';
  if (manda && a && a.status === 'active') {
    h += '<div class="me-form"><input type="number" id="me-disc-pct" min="0" max="100" step="0.5" placeholder="' + mEsc(mT('disc_want')) + '">'
      + '<input type="text" id="me-disc-why" class="grow" placeholder="' + mEsc(mT('disc_reason')) + '" autocomplete="off">'
      + '<button type="button" data-a="pedir"' + (meState.busy ? ' disabled' : '') + '>' + mEsc(mT(pend ? 'disc_send' : 'disc_ask')) + '</button></div>';
  }
  if (hist.length) h += '<p class="hint">' + mEsc(mT('disc_hist')) + ': ' + hist.map((r) => Number(r.requested_pct) + '% — ' + mEsc(mT('ds_' + r.status)) + (r.status === 'approved' && r.decided_pct != null ? ' (' + Number(r.decided_pct) + '%)' : '') + (r.decision_note ? ' “' + mEsc(r.decision_note) + '”' : '') + ' · ' + mEsc(mDate(r.created_at))).join('; ') + '</p>';
  h += '</div>';
  const temMargens = typeof openMarginsModal === 'function' && typeof hasDealerTools === 'function' && hasDealerTools();
  if (temMargens) {
    const m = typeof getResaleMarginPct === 'function' ? Number(getResaleMarginPct() || 0) : 0;
    h += '<div class="me-card"><h4>' + mEsc(mT('margin_title')) + '</h4><p>' + mEsc(mT('margin_now', { m })) + '</p><p class="hint">' + mEsc(mT('margin_hint')) + '</p>'
      + '<button type="button" data-a="margens">' + mEsc(mT('margin_open')) + '</button></div>';
    h += '<div class="me-card"><h4>' + mEsc(mT('brand_title')) + '</h4>' + (a && a.logo_url ? '<img class="me-logo" src="' + mEsc(a.logo_url) + '" alt="">' : '')
      + '<p class="hint">' + mEsc(mT('brand_hint')) + '</p><button type="button" class="secondary" data-a="marca">' + mEsc(mT('brand_open')) + '</button></div>';
  }
  return h;
}
function meViewCompany() {
  const a = meState.acc || meState.card || {};
  const tx = meTaxTxt(a);
  return '<div class="me-card"><h4>' + mEsc(a.legal_name || a.trade_name || '') + '</h4>'
    + '<p><span class="me-pill st-' + mEsc(a.status) + '">' + mEsc(mT('st_' + a.status)) + '</span> <span class="me-pill tx-' + tx.st + '">' + mEsc(tx.txt) + '</span></p>'
    + '<p class="hint">' + mEsc(mT('comp_hint')) + '</p><button type="button" data-a="ficha">' + mEsc(mT('comp_open')) + '</button></div>';
}

// ---------- ações ----------
async function meRun(fn, okMsg) {
  if (meState.busy) return;
  meState.busy = true; meState.err = ''; meState.msg = '';
  try { await fn(); meState.msg = okMsg || mT('saved'); } catch (e) { meState.err = (e && e.message) || String(e); }
  meState.busy = false;
  try { await meLoad(); } catch (e) { /* mostra o que tem */ }
  meRender();
}
async function meFnError(error, data) {
  if (error) {
    let msg = error.message || 'Erro';
    if (error.context && typeof error.context.json === 'function') { try { const b = await error.context.json(); if (b && b.error) msg = b.error; } catch (e) { /* genérica */ } }
    return msg;
  }
  return data && data.error ? data.error : '';
}
function meChange(e) {
  const t = e.target;
  const linha = t.closest && t.closest('.me-member');
  if (!linha || !t.getAttribute('data-a2')) return;
  const id = linha.getAttribute('data-m');
  const m = meState.team.find((x) => x.member_id === id);
  if (!m) return;
  if (t.getAttribute('data-a2') === 'role') {
    return meRun(async () => {
      const { data, error } = await supabaseClient.from('account_members').update({ role: t.value }).eq('id', id).select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error('RLS');
    });
  }
  if (t.getAttribute('data-a2') === 'perm') {
    const perm = Object.assign({}, m.permissions || {});
    perm[t.getAttribute('data-k')] = t.checked;
    return meRun(async () => {
      const { data, error } = await supabaseClient.from('account_members').update({ permissions: perm }).eq('id', id).select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error('RLS');
    });
  }
}
function meClick(e) {
  if (e.target.id === 'po-me') return meClose();
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.getAttribute('data-a');
  if (a === 'close') return meClose();
  if (a === 'tab') { meState.tab = b.getAttribute('data-t'); meState.msg = ''; meState.err = ''; return meRender(); }
  if (a === 'margens') { meClose(); return openMarginsModal(); }
  if (a === 'marca') {
    meClose();
    // depois deste clique terminar (o menu de Configurações fecha com clique fora)
    setTimeout(() => { const g = document.getElementById('po-topnav-settings-toggle'); if (g) g.click(); }, 60);
    return;
  }
  if (a === 'ficha') { meClose(); if (typeof openDealerApplication === 'function') openDealerApplication(0); return; }
  if (a === 'pedir') {
    const pct = Number((document.getElementById('me-disc-pct') || {}).value);
    const why = ((document.getElementById('me-disc-why') || {}).value || '').trim();
    if (!(pct >= 0 && pct <= 100) || (document.getElementById('me-disc-pct') || {}).value === '') { meState.err = mT('disc_want'); return meRender(); }
    return meRun(async () => {
      const { error } = await supabaseClient.rpc('request_discount', { p_pct: pct, p_reason: why || null });
      if (error) throw error;
    }, mT('disc_sent'));
  }
  if (a === 'criar') {
    const full_name = ((document.getElementById('me-new-name') || {}).value || '').trim();
    const email = ((document.getElementById('me-new-email') || {}).value || '').trim();
    const password = (document.getElementById('me-new-pass') || {}).value || '';
    return meRun(async () => {
      const { data, error } = await supabaseClient.functions.invoke('dealer-create-seller', { body: { full_name, email, password } });
      const msg = await meFnError(error, data);
      if (msg) throw new Error(msg);
      if (typeof loadDealerTeamList === 'function') { try { loadDealerTeamList(); } catch (e2) { /* lista antiga */ } }
    }, mT('created', { email }));
  }
  if (a === 'ativo') {
    const active = b.getAttribute('data-v') === '1';
    return meRun(async () => {
      const { data, error } = await supabaseClient.functions.invoke('dealer-create-seller', { body: { action: 'set_active', user_id: b.getAttribute('data-u'), active } });
      const msg = await meFnError(error, data);
      if (msg) throw new Error(msg);
      if (typeof loadDealerTeamList === 'function') { try { loadDealerTeamList(); } catch (e2) { /* lista antiga */ } }
    });
  }
}

// ---------- PROJETO PERDIDO (usado pela Central — portal-44) ----------
// Abre a janelinha do motivo e grava lost_at/lost_reason/lost_note nos
// projetos (ids). Devolve true se marcou.
function meAskLost(nome) {
  return new Promise((resolve) => {
    meCss();
    const ov = document.createElement('div');
    ov.className = 'me-lost-ov';
    ov.innerHTML = '<div class="me-lost-box"><h3>' + mEsc(mT('lost_title')) + '</h3><p class="hint">' + mEsc(nome || '') + '</p><p>' + mEsc(mT('lost_why')) + '</p>'
      + ME_LOST_REASONS.map((r, i) => '<label class="me-chk"><input type="radio" name="me-lost-r" value="' + r + '"' + (i === 0 ? ' checked' : '') + '> ' + mEsc(mT('r_' + r)) + '</label>').join('')
      + '<input type="text" class="me-lost-note" placeholder="' + mEsc(mT('lost_note')) + '" autocomplete="off">'
      + '<div class="me-lost-foot"><button type="button" class="secondary" data-x="0">' + mEsc(mT('cancel')) + '</button><button type="button" data-x="1">' + mEsc(mT('lost_ok')) + '</button></div></div>';
    ov.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (!b && e.target !== ov) return;
      const ok = b && b.getAttribute('data-x') === '1';
      const r = ok ? { reason: (ov.querySelector('input[name="me-lost-r"]:checked') || {}).value || 'other', note: ov.querySelector('.me-lost-note').value.trim() } : null;
      ov.remove();
      resolve(r);
    });
    document.body.appendChild(ov);
  });
}
async function markProjectsLost(ids, nome) {
  const r = await meAskLost(nome);
  if (!r) return false;
  const { data, error } = await supabaseClient.from('user_projects')
    .update({ lost_at: new Date().toISOString(), lost_reason: r.reason, lost_note: r.note || null, lost_by: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null })
    .in('id', ids).select('id');
  if (error) throw error;
  meState.loaded = false;
  return !!(data && data.length);
}
async function reopenLostProjects(ids) {
  const { error } = await supabaseClient.from('user_projects').update({ lost_at: null, lost_reason: null, lost_note: null, lost_by: null }).in('id', ids);
  if (error) throw error;
  meState.loaded = false;
  return true;
}

// ---------- botão na barra + desconto só leitura no modal Margens ----------
async function meRefreshButton() {
  let btn = document.getElementById('po-company-btn');
  const logado = typeof currentUser !== 'undefined' && !!currentUser;
  if (!logado || !meOn()) { if (btn) btn.style.display = 'none'; return; }
  await meLoadCard();
  if (!meState.cardOk) { if (btn) btn.style.display = 'none'; return; } // sem a migration 306
  const pode = meIsAdmin() || (meState.card && ['owner', 'manager', 'finance'].includes(meState.card.role));
  if (!btn) {
    const ref = document.getElementById('po-margins-btn');
    if (!ref || !ref.parentNode) return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'po-company-btn'; btn.className = ref.className || 'po-help-link';
    btn.addEventListener('click', () => openMyCompany());
    ref.parentNode.insertBefore(btn, ref);
  }
  btn.textContent = mT('btn');
  btn.style.display = pode ? '' : 'none';
  // liberado: Margens sai da barra e passa a morar dentro desta tela
  if (!ME_SO_ADMIN && pode) { const ref = document.getElementById('po-margins-btn'); if (ref) ref.style.display = 'none'; }
}
(function meWrap() {
  if (typeof window.refreshBecomeDealerUi === 'function') {
    const orig = window.refreshBecomeDealerUi;
    window.refreshBecomeDealerUi = function () {
      const r = orig.apply(this, arguments);
      meState.loaded = false;
      try { meRefreshButton(); } catch (e) { /* botão é opcional */ }
      return r;
    };
  }
  if (typeof window.renderMarginsModal === 'function') {
    const orig2 = window.renderMarginsModal;
    window.renderMarginsModal = function () {
      const r = orig2.apply(this, arguments);
      if (!DESCONTO_SO_FABRICA || meIsAdmin()) return r;
      const inp = document.getElementById('po-margins-discount-input');
      if (inp && !inp.readOnly) {
        inp.readOnly = true; inp.style.background = '#f1efe9'; inp.title = mT('disc_readonly');
        const lab = inp.closest('label');
        if (lab) lab.insertAdjacentHTML('afterend', '<p class="po-money-sub">' + mEsc(mT('disc_readonly')) + '</p>');
      }
      return r;
    };
  }
  // sessão já aberta quando este arquivo carregou
  setTimeout(() => { try { meRefreshButton(); } catch (e) { /* ok */ } }, 2500);
})();

function meCss() {
  if (document.getElementById('me-css')) return;
  const st = document.createElement('style');
  st.id = 'me-css';
  st.textContent = [
    '#po-me{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:flex-start;justify-content:center;z-index:9990;padding:24px 12px;overflow:auto}',
    '.me-box{background:var(--panel,#fff);color:var(--text,#2b2621);border-radius:14px;width:100%;max-width:1040px;padding:20px 24px 22px;box-shadow:0 14px 50px rgba(0,0,0,.3)}',
    '.me-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.me-head h3{margin:0;font-size:21px}.me-sub{font-size:13px;color:var(--muted,#766f64)}',
    '.me-x{background:none;border:0;font-size:26px;line-height:1;cursor:pointer;color:var(--muted,#766f64);margin:0;padding:0 4px}',
    '.me-tabs{display:flex;gap:4px;border-bottom:1px solid var(--border,#e0ddd6);margin-bottom:14px;flex-wrap:wrap}',
    '.me-tab{background:none;border:0;border-bottom:3px solid transparent;border-radius:0;margin:0;padding:9px 14px;font-size:14px;color:var(--muted,#766f64);cursor:pointer}.me-tab.on{color:var(--accent-dark,#6e4527);border-bottom-color:var(--accent,#8a5a34);font-weight:600}',
    '.me-msg{margin:0 0 10px;font-size:14px}.me-msg.ok{color:#2e7d4f}.me-body h4{margin:20px 0 8px;font-size:15px}',
    '.me-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.me-kpi{border-radius:12px;padding:12px 14px;background:var(--bg,#f7f6f3);display:flex;flex-direction:column;border-left:4px solid #b8b0a2}',
    '.me-kpi span{font-size:12px;color:var(--muted,#766f64)}.me-kpi strong{font-size:28px;line-height:1.15}.me-kpi em{font-style:normal;font-size:12px;color:var(--muted,#766f64)}.me-kpi small{font-size:12px;margin-top:6px}',
    '.me-kpi.k-build{border-left-color:#c58a2b}.me-kpi.k-wait{border-left-color:#7b6fd0}.me-kpi.k-prod{border-left-color:#2d7fc1}.me-kpi.k-done{border-left-color:#2e7d4f}.me-kpi.k-lost{border-left-color:#b3432f}',
    '.me-bars{display:flex;flex-direction:column;gap:6px;max-width:640px}.me-bar{display:grid;grid-template-columns:170px 1fr 34px 90px;gap:10px;align-items:center;font-size:13px}.me-bar div{background:var(--bg,#f7f6f3);border-radius:6px;height:14px;overflow:hidden}.me-bar i{display:block;height:100%;background:#b3432f;border-radius:6px}.me-bar em{font-style:normal;color:var(--muted,#766f64);text-align:right}',
    '.me-tablewrap{overflow:auto}.me-table{width:100%;border-collapse:collapse;font-size:13px}.me-table th{text-align:left;font-weight:600;color:var(--muted,#766f64);padding:6px 10px;border-bottom:1px solid var(--border,#e0ddd6);white-space:nowrap}.me-table td{padding:7px 10px;border-bottom:1px solid var(--border,#e0ddd6);white-space:nowrap}.me-table td span{color:var(--muted,#766f64)}.me-table .me-nome{font-weight:600}',
    '.me-tree,.me-tree ul{list-style:none;margin:0;padding:0}.me-tree ul{margin-left:22px;border-left:2px solid var(--border,#e0ddd6);padding-left:14px}.me-tree li{margin:8px 0}',
    '.me-node{border:1px solid var(--border,#e0ddd6);border-radius:10px;padding:9px 13px;background:#fff}.me-node.k-factory{background:rgba(138,90,52,.08);border-color:var(--accent,#8a5a34)}.me-node.k-distributor{border-left:4px solid #2d7fc1}.me-node.meu{box-shadow:0 0 0 2px var(--accent,#8a5a34)}',
    '.me-node-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.me-node-sub{font-size:12px;color:var(--muted,#766f64);margin-top:3px}',
    '.me-pill{border-radius:20px;padding:2px 10px;font-size:12px;background:var(--bg,#f7f6f3);white-space:nowrap}.me-pill.st-active,.me-pill.tx-valid{background:#e6f4ea;color:#1e6b3c}.me-pill.st-pending,.me-pill.tx-pending{background:#fdf3d7;color:#7a5b00}.me-pill.st-suspended,.me-pill.st-rejected,.me-pill.tx-expired,.me-pill.tx-rejected{background:#fbe9e6;color:#9a2f1f}',
    '.me-member{border:1px solid var(--border,#e0ddd6);border-radius:10px;padding:10px 14px;margin-bottom:8px}.me-member.off{opacity:.6}.me-m-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.me-m-row{display:flex;gap:8px 18px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:13px}.me-m-row select{padding:5px 8px;border-radius:6px;border:1px solid var(--border,#e0ddd6)}.me-m-row button{margin:0 0 0 auto;padding:4px 12px}',
    '.me-chk{display:inline-flex;gap:6px;align-items:center;font-size:13px}',
    '.me-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0}.me-form input{padding:8px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:14px;min-width:150px}.me-form input.grow{flex:1}.me-form button{margin:0}',
    '.me-note{margin-top:14px}.me-card{border:1px solid var(--border,#e0ddd6);border-radius:12px;padding:14px 18px;margin-bottom:12px}.me-card h4{margin:0 0 6px}.me-card button{margin-top:6px}',
    '.me-big{font-size:30px;font-weight:700;margin:2px 0 8px}.me-big .hint{font-size:13px;font-weight:400}.me-warn{background:#fdf3d7;border:1px solid #ecd58b;border-radius:8px;padding:8px 12px;font-size:13px}.me-logo{max-height:56px;max-width:220px;display:block;margin:6px 0}',
    '.me-lost-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px}.me-lost-box{background:var(--panel,#fff);color:var(--text,#2b2621);border-radius:12px;padding:20px 22px;max-width:420px;width:100%;display:flex;flex-direction:column;gap:8px}.me-lost-box h3{margin:0}.me-lost-box p{margin:0}',
    '.me-lost-note{padding:8px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:14px;margin-top:4px}.me-lost-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}.me-lost-foot button{margin:0}',
    '@media (max-width:900px){.me-kpis{grid-template-columns:repeat(2,1fr)}.me-bar{grid-template-columns:110px 1fr 28px 70px}}'
  ].join('\n');
  document.head.appendChild(st);
}

window.LegnoMinhaEmpresa = { abrir: openMyCompany, ligado: meOn, marcarPerdido: markProjectsLost, reabrir: reopenLostProjects, motivo: (r) => mT('r_' + (r || 'null')) };
