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
const DESCONTO_SO_FABRICA = true;   // 21/11: ligado (Matt: "trava o desconto pro lojista, só adm pode dar") — par da migration 309
const ME_LOST_REASONS = ['price', 'lead_time', 'client_gave_up', 'competitor', 'not_european', 'test', 'other'];   // 22/11: + 'not_european' e 'test' (Matt). lost_reason é texto livre no banco, sem check.
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
    t_conta: 'Minha conta', conta_hint: 'Logo e dados da loja (saem na Proposta), sua equipe e a sua senha. Unidade de medida, peso e idioma continuam no ⚙ da barra de cima.', t_painel: 'Painel', t_arvore: 'Árvore', t_equipe: 'Equipe', t_margens: 'Margens', t_empresa: 'Empresa',
    close: 'Fechar', loading: 'Carregando…', none: 'Nada por aqui ainda.',
    k_build: 'Em construção', k_prod: 'Em produção', k_done: 'Entregues', k_lost: 'Perdidos', k_wait: 'Aguardando aprovação',
    projects: 'projeto(s)', orders: 'pedido(s)', est: 'valor estimado', fab: 'valor de fábrica',
    lost_reasons: 'Motivos dos projetos perdidos', lost_none: 'Nenhum projeto marcado como perdido.',
    r_price: 'Preço', r_lead_time: 'Prazo', r_client_gave_up: 'Cliente desistiu', r_competitor: 'Foi pra concorrente', r_not_european: 'Produto não era europeu', r_test: 'Foi só teste', r_other: 'Outro', r_null: 'Sem motivo',
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
    disc_readonly: 'Definido pela Legno. Pra alterar, use "Solicitar desconto" em Minha empresa.', disc_readonly_c: 'Definido pela Legno. Pra alterar, fale com sales@legnocabinets.com.',
    margin_title: 'Margem de revenda e extras', margin_now: 'Margem bruta atual: {m}%', margin_open: 'Abrir margens', margin_hint: 'Margem, frete, comissão, montagem e outros extras do seu preço de venda.',
    brand_title: 'Logo e dados da loja', brand_hint: 'A logo e o nome aparecem no cabeçalho e nas propostas.', brand_open: 'Abrir configurações da loja',
    comp_hint: 'Cadastro pra invoice, contrato e tax exemption.', comp_open: 'Abrir ficha da empresa',
    saved: 'Salvo.', lost_mark: 'Marcar como perdido', lost_title: 'Marcar como perdido', lost_why: 'Por que este projeto foi perdido?', lost_note: 'Observação (opcional)',
    lost_ok: 'Marcar', lost_reopen: 'Reabrir', cancel: 'Cancelar'
  },
  en: {
    btn: 'My company', title: 'My company', title_factory: 'Dealer network',
    t_conta: 'My account', conta_hint: 'Logo and store info (shown on the Proposal), your team and your password. Units, weight and language stay in the ⚙ on the top bar.', t_painel: 'Dashboard', t_arvore: 'Tree', t_equipe: 'Team', t_margens: 'Margins', t_empresa: 'Company',
    close: 'Close', loading: 'Loading…', none: 'Nothing here yet.',
    k_build: 'In progress', k_prod: 'In production', k_done: 'Delivered', k_lost: 'Lost', k_wait: 'Waiting approval',
    projects: 'project(s)', orders: 'order(s)', est: 'estimated value', fab: 'factory value',
    lost_reasons: 'Why projects were lost', lost_none: 'No project marked as lost.',
    r_price: 'Price', r_lead_time: 'Lead time', r_client_gave_up: 'Client gave up', r_competitor: 'Went to a competitor', r_not_european: 'Product was not European', r_test: 'It was just a test', r_other: 'Other', r_null: 'No reason',
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
    disc_readonly: 'Set by Legno. To change it, use "Request a discount" in My company.', disc_readonly_c: 'Set by Legno. To change it, contact sales@legnocabinets.com.',
    margin_title: 'Resale margin and extras', margin_now: 'Current gross margin: {m}%', margin_open: 'Open margins', margin_hint: 'Margin, freight, commission, installation and other extras of your selling price.',
    brand_title: 'Logo and store details', brand_hint: 'Your logo and name show in the header and on proposals.', brand_open: 'Open store settings',
    comp_hint: 'Invoice details, agreement and tax exemption.', comp_open: 'Open company file',
    saved: 'Saved.', lost_mark: 'Mark as lost', lost_title: 'Mark as lost', lost_why: 'Why was this project lost?', lost_note: 'Note (optional)',
    lost_ok: 'Mark', lost_reopen: 'Reopen', cancel: 'Cancel'
  },
  es: {
    btn: 'Mi empresa', title: 'Mi empresa', title_factory: 'Red de dealers',
    t_conta: 'Mi cuenta', conta_hint: 'Logo y datos de la tienda (salen en la Propuesta), su equipo y su contraseña. Unidades, peso e idioma siguen en el ⚙ de la barra superior.', t_painel: 'Panel', t_arvore: 'Árbol', t_equipe: 'Equipo', t_margens: 'Márgenes', t_empresa: 'Empresa',
    close: 'Cerrar', loading: 'Cargando…', none: 'Nada por aquí todavía.',
    k_build: 'En desarrollo', k_prod: 'En producción', k_done: 'Entregados', k_lost: 'Perdidos', k_wait: 'Esperando aprobación',
    projects: 'proyecto(s)', orders: 'pedido(s)', est: 'valor estimado', fab: 'valor de fábrica',
    lost_reasons: 'Motivos de los proyectos perdidos', lost_none: 'Ningún proyecto marcado como perdido.',
    r_price: 'Precio', r_lead_time: 'Plazo', r_client_gave_up: 'El cliente desistió', r_competitor: 'Se fue a la competencia', r_not_european: 'El producto no era europeo', r_test: 'Fue solo una prueba', r_other: 'Otro', r_null: 'Sin motivo',
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
    disc_readonly: 'Definido por Legno. Para cambiarlo, use "Solicitar descuento" en Mi empresa.', disc_readonly_c: 'Definido por Legno. Para cambiarlo, escriba a sales@legnocabinets.com.',
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
  if (!meState.mgOk) await meLoadMargins();
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
    ov.addEventListener('dragstart', mePpDragStart);
    ov.addEventListener('dragover', mePpDragOver);
    ov.addEventListener('dragleave', mePpDragLeave);
    ov.addEventListener('drop', mePpDrop);
    ov.addEventListener('dragend', mePpDragEnd);
    ov.addEventListener('input', mePpInput);
    document.body.appendChild(ov);
  }
  return ov;
}
// MARGENS DENTRO DESTA TELA (21/11, Matt: "coloca margens como nova aba no My
// company"). O conteúdo é o MESMO do modal Margens (#po-margins-body, desenhado
// por renderMarginsModal, portal-06b): na aba ele é trazido pra cá e os
// cliques/alterações são repassados pras mesmas funções (meClick/meChange).
// Antes de redesenhar ou fechar, volta pro modal de origem — que continua
// funcionando sozinho (tutorial, atalhos antigos).
function meTemMargens() {
  return typeof renderMarginsModal === 'function' && typeof hasDealerTools === 'function' && hasDealerTools();
}
function meMargensVoltar() {
  const body = document.getElementById('po-margins-body');
  const ov = document.getElementById('po-me');
  if (!body || !ov || !ov.contains(body)) return;
  const card = document.querySelector('#po-margins-modal .po-margins-card');
  if (card) card.appendChild(body);
}
// MINHA CONTA DENTRO DO MY COMPANY (22/11, Matt: "tira essa parte da barra
// superior e concentra no my company tudo... deixa só unidade de medida, língua
// e pounds ou kg"). Logo, dados da loja, Minha Equipe, o Salvar e Trocar senha
// saem do menu ⚙ e moram na aba "Minha conta". São os MESMOS elementos (mesmos
// ids e listeners do portal-01/05) — só mudam de lugar, como o corpo das Margens:
//   - My company fechado ou em outra aba → guardados num cofre invisível
//     (#me-conta-cofre), fora do menu ⚙;
//   - aba Minha conta → dentro de #me-conta-slot.
// Só pra quem TEM o botão My company (meContaAtiva, ligado no meRefreshButton).
// Quem não tem (hoje: todo mundo que não é admin, enquanto ME_SO_ADMIN) continua
// com tudo no ⚙ — senão o dealer ficaria sem logo/equipe e o vendedor sem senha.
const ME_CONTA_IDS = ['po-dealer-logo-settings-row', 'po-dealer-store-info-row', 'po-dealer-team-row', 'po-room-settings-save-btn', 'po-change-password-row'];
function meContaCofre() {
  let c = document.getElementById('me-conta-cofre');
  if (!c) { c = document.createElement('div'); c.id = 'me-conta-cofre'; c.style.display = 'none'; document.body.appendChild(c); }
  return c;
}
function meContaGuardar() {
  if (!meState.contaAtiva) return;
  const c = meContaCofre();
  ME_CONTA_IDS.forEach((id) => { const el = document.getElementById(id); if (el && el.parentNode !== c) c.appendChild(el); });
}
function meContaDevolver() {   // volta tudo pro menu ⚙ (quem perdeu o My company, ex.: saiu da conta)
  const menu = document.getElementById('po-topnav-settings-menu'); if (!menu) return;
  ME_CONTA_IDS.forEach((id) => { const el = document.getElementById(id); if (el && el.parentNode !== menu) menu.appendChild(el); });
}
function meContaTrazer() {
  const slot = document.getElementById('me-conta-slot'); if (!slot) return;
  ME_CONTA_IDS.forEach((id) => { const el = document.getElementById(id); if (el) slot.appendChild(el); });
}
function meViewConta() { return '<p class="hint">' + mEsc(mT('conta_hint')) + '</p><div id="me-conta-slot" class="me-conta"></div>'; }
function meMargensTrazer() {
  const slot = document.getElementById('me-margins-slot');
  const body = document.getElementById('po-margins-body');
  if (!slot || !body || !meTemMargens()) return;
  slot.appendChild(body);
  try { renderMarginsModal(); } catch (e) { /* fica o que tinha */ }
}
function meClose() { meMargensVoltar(); meContaGuardar(); const ov = document.getElementById('po-me'); if (ov) ov.style.display = 'none'; }
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
  // 22/11 (Matt: "essa tree não faz mais sentido, porque isso está melhor no people"):
  // o admin não tem mais a aba Árvore (ele tem a Pessoas, que mostra o mesmo e deixa
  // mexer). Quem não é admin continua com ela — é a única visão do que está abaixo.
  const t = meIsAdmin() ? ['painel'] : ['painel', 'arvore'];
  if (manda) t.push('equipe');
  // Margens: quem cuida da empresa, ou quem já tinha o botão Margens (admin sem empresa)
  if ((temEmpresa && ['owner', 'manager', 'finance'].includes(meState.card.role)) || meTemMargens()) t.push('margens');
  if (manda) t.push('empresa');
  if (meIsAdmin()) t.push('pessoas');
  t.push('conta');   // logo, dados da loja, equipe e senha — vieram do menu ⚙ (22/11)
  return t;
}
function meFrame(inner) {
  const tabs = meTabs();
  if (!tabs.includes(meState.tab)) meState.tab = 'painel';
  const nome = meState.card ? (meState.card.trade_name || meState.card.legal_name || mT('title')) : (meIsAdmin() ? mT('title_factory') : mT('title'));
  return '<div class="me-box' + (meState.tab === 'pessoas' ? ' me-wide' : '') + '" role="dialog" aria-modal="true"><div class="me-head"><div><h3>' + mEsc(nome) + '</h3>'
    + (meState.card ? '<span class="me-sub">' + mEsc(mT('kind_' + meState.card.kind)) + ' · ' + mEsc(mT('role_' + meState.card.role)) + '</span>' : '') + '</div>'
    + '<button type="button" class="me-x" data-a="close" aria-label="' + mEsc(mT('close')) + '">×</button></div>'
    + '<div class="me-tabs">' + tabs.map((t) => '<button type="button" class="me-tab' + (t === meState.tab ? ' on' : '') + '" data-a="tab" data-t="' + t + '">' + mEsc(t === 'pessoas' ? ppT('tab') : mT('t_' + t)) + '</button>').join('') + '</div>'
    + (meState.err ? '<p class="error me-msg">' + mEsc(meState.err) + '</p>' : '') + (meState.msg ? '<p class="me-msg ok">' + mEsc(meState.msg) + '</p>' : '')
    + '<div class="me-body">' + inner + '</div></div>';
}
function meRender() {
  const ov = meEl();
  const t = meState.tab;
  meMargensVoltar();   // o conteúdo das Margens não pode morrer junto com o innerHTML
  meContaGuardar();    // idem pros campos da conta (logo, loja, equipe, senha)
  ov.innerHTML = meFrame(t === 'conta' ? meViewConta() : t === 'arvore' ? meViewTree() : t === 'equipe' ? meViewTeam() : t === 'margens' ? meViewMargins() : t === 'empresa' ? meViewCompany() : t === 'pessoas' ? meViewPeople() : meViewPainel());
  if (meState.tab === 'margens') meMargensTrazer();
  if (meState.tab === 'conta') meContaTrazer();
  if (meState.tab === 'pessoas' && !meState.people && !meState.peopleBusy) mePeopleLoad();
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
      + (m.role !== 'owner' && m.user_id !== eu && (meuPapel === 'owner' || meIsAdmin()) && meState.mgOk
        ? '<span class="me-mg"><span>' + mEsc(ppT('mg_lbl')) + '</span>' + meMarginField(m.user_id, ((meState.mg || {})[(lista.find((x) => x.role === 'owner') || {}).user_id] || {}).r) + '</span>' : '')
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
  let h = '';
  // desconto de fábrica (só leitura + solicitar): só pra quem TEM empresa
  if (meState.card) h += '<div class="me-card"><h4>' + mEsc(mT('disc_title')) + '</h4>'
    + '<p class="me-big">' + Number(a ? a.factory_discount_pct : 0) + '% <span class="hint">' + mEsc(mT('disc_by')) + '</span></p>';
  if (pend) h += '<p class="me-warn">' + mEsc(mT('disc_pending', { p: Number(pend.requested_pct), d: mDate(pend.created_at) })) + '</p>';
  if (manda && a && a.status === 'active') {
    h += '<div class="me-form"><input type="number" id="me-disc-pct" min="0" max="100" step="0.5" placeholder="' + mEsc(mT('disc_want')) + '">'
      + '<input type="text" id="me-disc-why" class="grow" placeholder="' + mEsc(mT('disc_reason')) + '" autocomplete="off">'
      + '<button type="button" data-a="pedir"' + (meState.busy ? ' disabled' : '') + '>' + mEsc(mT(pend ? 'disc_send' : 'disc_ask')) + '</button></div>';
  }
  if (hist.length) h += '<p class="hint">' + mEsc(mT('disc_hist')) + ': ' + hist.map((r) => Number(r.requested_pct) + '% — ' + mEsc(mT('ds_' + r.status)) + (r.status === 'approved' && r.decided_pct != null ? ' (' + Number(r.decided_pct) + '%)' : '') + (r.decision_note ? ' “' + mEsc(r.decision_note) + '”' : '') + ' · ' + mEsc(mDate(r.created_at))).join('; ') + '</p>';
  if (meState.card) h += '</div>';
  const temMargens = meTemMargens();
  if (temMargens) {
    // o conteúdo do modal Margens entra aqui (meMargensTrazer, depois do render)
    h += '<div class="me-card"><h4>' + mEsc(mT('margin_title')) + '</h4><p class="hint">' + mEsc(mT('margin_hint')) + '</p>'
      + '<div id="me-margins-slot"></div></div>';
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
  if (t.matches && t.matches('select.pp-kind')) return meSetKind(t.getAttribute('data-u'), t.value, t);
  if (t.matches && t.matches('input.pp-mg')) return meSetSellerMargin(t.getAttribute('data-u'), t.value, t);
  if (t.matches && t.matches('select.pp-mv')) {
    const u = t.getAttribute('data-u'); const v = t.value; t.value = '';
    if (v) mePlace(u, v === '_dealer' ? null : v, ppModo(v));
    return;
  }
  // aba Margens: mesma regra do modal de origem (portal-06b ligaMarginsModal)
  const extra = t.closest && t.closest('#me-margins-slot .po-margins-extra-row');
  if (extra && t.dataset && t.dataset.field && typeof updateDealerPricingExtraField === 'function') {
    return updateDealerPricingExtraField(extra.dataset.extraId, t.dataset.field, t.value);
  }
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
  if (e.target.id === 'po-me') { if (meState.tab === 'pessoas') return; return meClose(); }
  // aba Margens: botões do conteúdo trazido do modal Margens
  if (e.target.closest('#me-margins-slot')) {
    const salvar = e.target.closest('#po-margins-save-btn');
    if (salvar && typeof saveMarginsTopFields === 'function') return saveMarginsTopFields();
    const add = e.target.closest('[data-add-extra-side]');
    if (add && typeof addDealerPricingExtra === 'function') return addDealerPricingExtra(add.dataset.addExtraSide);
    const rem = e.target.closest('[data-remove-extra]');
    if (rem && typeof deleteDealerPricingExtra === 'function') return deleteDealerPricingExtra(rem.dataset.removeExtra);
    return;
  }
  const chipP = e.target.closest('.pp-p');
  if (chipP && !e.target.closest('select, input, label.pp-mgl, button')) return mePersonOpen(chipP.getAttribute('data-u'));
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
  // BLOQUEAR / LIBERAR o acesso do vendedor direto na árvore (21/11, Matt:
  // "quero poder bloquear algum vendedor também, ou liberar acesso"). Mesma
  // função da aba Equipe (dealer-create-seller set_active): bloqueado não
  // entra no portal; projetos e pedidos dele continuam na loja.
  if (a === 'ppadd') { e.stopPropagation(); return mePpAddOpen(b.getAttribute('data-acc')); }
  if (a === 'pplock') {
    const u = b.getAttribute('data-u'); const liberar = b.getAttribute('data-v') === '1';
    const p = ppUser(u); if (!p || meState.busy) return;
    const nome = String(p.email || '').split('@')[0];
    if (!confirm(ppT(liberar ? 'q_unlock' : 'q_lock', { u: nome }))) return;
    meState.busy = true; meState.err = ''; meState.msg = '';
    (async () => {
      try {
        const { data, error } = await supabaseClient.functions.invoke('dealer-create-seller', { body: { action: 'set_active', user_id: u, active: liberar } });
        const msg = await meFnError(error, data);
        if (msg) throw new Error(msg);
        meState.msg = ppT(liberar ? 'done_unlock' : 'done_lock', { u: nome });
        p.active = liberar; p.blocked = !liberar;            // muda o cadeado na hora
        meState.bloq = meState.bloq || {}; if (liberar) delete meState.bloq[u]; else meState.bloq[u] = true;
        meState.ppTravados = meState.ppTravados || {}; meState.ppTravados[u] = !liberar;   // segura até a lista do banco confirmar
      } catch (er) { meState.err = (er && er.message) || String(er); }
      meState.busy = false; meState.loaded = false;
      await mePeopleLoad();
      meRender();
      // a mensagem fica no topo da janela, fora da vista de quem está no meio
      // da árvore (21/11: "tentei bloquear e não funcionou" — o erro estava lá em cima)
      if (meState.err) alert(ppT('lock_err') + '\n\n' + meState.err);
    })();
    return;
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
      if (!b) return;   // 22/11: clicar fora não fecha (regra de formulário) — só Cancelar / Marcar
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
  // Duas chamadas ao mesmo tempo (login + temporizador) esperavam o cartão e
  // cada uma criava o SEU botão = "My company" duas vezes na barra (21/11).
  // Depois da espera: olha de novo e apaga qualquer repetido.
  const todos = document.querySelectorAll('#po-company-btn');
  btn = todos[0] || null;
  for (let i = 1; i < todos.length; i++) todos[i].remove();
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
  // campos da conta: saem do ⚙ pra quem tem o My company; voltam pra quem não tem
  if (pode) { meState.contaAtiva = true; const ov = document.getElementById('po-me'); if (!(ov && ov.style.display !== 'none' && meState.tab === 'conta')) meContaGuardar(); }
  else if (meState.contaAtiva) { meState.contaAtiva = false; meContaDevolver(); }
  // Margens passou pra dentro desta tela (aba Margens): o botão solto da barra
  // some pra quem tem o Minha empresa (classe no body — o portal-05 religa o
  // display do botão a cada atualização do perfil).
  meCssMargens();
  document.body.classList.toggle('me-margens-dentro', !!pode);
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
        // enquanto o Minha empresa é só admin, o dealer não tem o "Solicitar desconto": manda falar com a Legno
        const aviso = mT(ME_SO_ADMIN ? 'disc_readonly_c' : 'disc_readonly');
        inp.readOnly = true; inp.style.background = '#f1efe9'; inp.title = aviso;
        const lab = inp.closest('label');
        if (lab) lab.insertAdjacentHTML('afterend', '<p class="po-money-sub">' + mEsc(aviso) + '</p>');
      }
      return r;
    };
  }
  // sessão já aberta quando este arquivo carregou
  setTimeout(() => { try { meRefreshButton(); } catch (e) { /* ok */ } }, 2500);
})();

function meCssMargens() {
  if (document.getElementById('me-css-margens')) return;
  const st = document.createElement('style');
  st.id = 'me-css-margens';
  st.textContent = 'body.me-margens-dentro #po-margins-btn{display:none !important}'
    + '#me-margins-slot .po-margins-body{padding:6px 0 0;overflow:visible}'
    + '.me-conta{display:flex;flex-direction:column;gap:18px;max-width:440px;padding-top:6px}.me-conta .po-topnav-settings-row{display:flex;flex-direction:column;align-items:stretch;gap:6px;margin:0;padding:0;border:0}.me-conta .po-topnav-settings-row>span:first-child{font-weight:700;font-size:12.5px;color:var(--text,#2b2621)}.me-conta input,.me-conta button{margin:0}.me-conta #po-room-settings-save-btn{align-self:flex-start;width:auto}';
  document.head.appendChild(st);
}
function meCss() {
  meCssMargens();
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
    '.me-lost-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10002;display:flex;align-items:center;justify-content:center;padding:16px}.me-lost-box{background:var(--panel,#fff);color:var(--text,#2b2621);border-radius:12px;padding:20px 22px;max-width:420px;width:100%;display:flex;flex-direction:column;gap:8px}.me-lost-box h3{margin:0}.me-lost-box p{margin:0}.me-lost-box label.me-chk{display:flex;align-items:center;justify-content:flex-start;gap:10px;margin:0;padding:8px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:14px;font-weight:500;color:var(--text,#2b2621);cursor:pointer;text-align:left;width:auto}.me-lost-box label.me-chk:hover{background:#faf7f2}.me-lost-box label.me-chk input[type=radio]{width:16px;height:16px;min-width:16px;margin:0;padding:0;flex:none}.me-lost-box .me-lost-note{width:100%;box-sizing:border-box;margin:4px 0 0}',
    '.me-lost-note{padding:8px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:14px;margin-top:4px}.me-lost-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}.me-lost-foot button{margin:0}',
    '.pp-top{display:flex;gap:10px;align-items:stretch;margin:6px 0 12px;flex-wrap:wrap}.pp-top input{flex:0 0 240px;padding:8px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:14px;margin:0}',
    '.pp-new{flex:1;min-width:260px;border:2px dashed #c9a36b;border-radius:10px;padding:10px 14px;font-size:13.5px;color:#7a4a1e;background:#fdf8ef;display:flex;align-items:center}',
    '.pp-kind{appearance:none;-webkit-appearance:none;border:0;border-radius:9px;padding:1px 16px 1px 7px;margin:0;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;height:18px;line-height:16px;cursor:pointer;width:auto;max-width:124px;background:#eee9df url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%278%27 height=%275%27%3E%3Cpath d=%27M0 0l4 5 4-5z%27 fill=%27%23665%27/%3E%3C/svg%3E") no-repeat right 5px center;color:#5c5346}',
    '.pp-kind.k-contractor{background-color:#dcebfb;color:#1f5fa8}.pp-kind.k-millworker{background-color:#fdecc8;color:#8a5a00}.pp-kind.k-designer{background-color:#efe4fb;color:#6b3fb0}.pp-kind.k-dealer{background-color:#ead9c4;color:#7a4a1e}.pp-kind.k-homeowner{background-color:#dff1e2;color:#1f6b33}.pp-kind option{text-transform:none;font-weight:400;color:#2b2621;background:#fff}',
    '.pp-last{font-size:10.5px;color:#23793c;font-weight:700;white-space:nowrap;min-width:34px;text-align:right}.pp-last.is-never{color:#b0a898;font-weight:400}',
    '.pp-lock{background:#fff;border:1px solid var(--border,#e0ddd6);border-radius:5px;width:24px;height:22px;padding:0;margin:0;font-size:11px;line-height:1;cursor:pointer;color:#3a332a}.pp-lock:hover{background:#f3ede2}.pp-lock.is-off{background:#f3d9d5;border-color:#d9a79f}.pp-p.is-off{opacity:1;background:#fbf3f1}.pp-p.is-off .pp-mail{opacity:.6;text-decoration:line-through}',
    '.pp-mgl{display:inline-flex;align-items:center;gap:1px;font-size:11.5px;color:#7a4a1e;font-weight:700;margin:0;white-space:nowrap}.pp-mg{width:44px;padding:2px 4px;margin:0;border:1px solid #d9c49c;border-radius:5px;font-size:12px;text-align:right;background:#fffaf0;color:#2b2621;height:22px;box-sizing:border-box}',
    '.pp-mg::placeholder{color:#b9ab93}.pp-mg.is-ok{border-color:#2e8b47;background:#e9f6ec}.pp-mg.is-err{border-color:#c0392b;background:#fbeeec}.pp-dm{font-size:10.5px;color:#7a4a1e;font-weight:700;white-space:nowrap}.me-mg{display:inline-flex;align-items:center;gap:6px;font-size:13px}',
    '.me-box.me-wide{max-width:1560px}.me-wide .pp-side .pp-acc-b{max-height:72vh}.pp-p{cursor:pointer}',
    '#pp-card{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10001;display:none;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto}',
    '.pc-box{background:var(--panel,#fff);color:var(--text,#2b2621);border-radius:14px;width:100%;max-width:860px;padding:20px 24px 18px;box-shadow:0 14px 50px rgba(0,0,0,.35)}',
    '.pc-head{display:flex;gap:14px;align-items:center;margin-bottom:6px}.pc-tit{flex:1;min-width:0}.pc-tit h3{margin:0;font-size:20px}.pc-tit span{font-size:13px;color:var(--muted,#766f64)}',
    '.pc-logo{width:84px;height:56px;border:1px solid var(--border,#e0ddd6);border-radius:8px;display:flex;align-items:center;justify-content:center;background:#fff;overflow:hidden;flex:none}.pc-logo img{max-width:100%;max-height:100%}.pc-logo span{font-size:10.5px;color:var(--muted,#766f64);text-align:center}',
    '.pc-box h4{margin:16px 0 8px;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:#8a8073}.pc-erp{float:right;text-transform:none;letter-spacing:0;font-size:12.5px;font-weight:400}',
    '.pc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px 12px}.pc-f{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted,#766f64);margin:0}.pc-f.w2{grid-column:span 2}',
    '.pc-f input,.pc-f select{padding:7px 9px;border:1px solid var(--border,#e0ddd6);border-radius:7px;font-size:14px;margin:0;width:100%;box-sizing:border-box;color:var(--text,#2b2621);background:#fff}',
    '.pc-ro{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--muted,#766f64)}.pc-ro b{font-size:14px;color:var(--text,#2b2621);font-weight:600;padding:7px 0;overflow:hidden;text-overflow:ellipsis}',
    '.pc-dest{margin-top:12px;padding:10px 12px;background:#fdf8ef;border:1px solid #ead9b8;border-radius:9px}.pc-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}',
    '@media (max-width:700px){.pc-grid{grid-template-columns:repeat(2,1fr)}}',
    '.pp-cols{display:grid;grid-template-columns:300px 1fr;gap:18px;align-items:start}.pp-side{border:1px dashed var(--border,#e0ddd6);border-radius:10px;background:var(--panel-2,#faf8f4);overflow:hidden;position:sticky;top:0}.pp-side .pp-acc-b{max-height:62vh}',
    '.pp-tree,.pp-tree ul{list-style:none;margin:0;padding:0}.pp-tree ul.pp-kids{margin-left:22px}.pp-tree>li.is-fab>ul.pp-kids{margin-left:14px}',
    '.pp-tree li{position:relative;padding:3px 0 3px 22px}.pp-tree>li{padding-left:0}',
    '.pp-tree ul.pp-kids>li::before{content:"";position:absolute;left:0;top:0;bottom:0;border-left:2px solid #d3c6ae}.pp-tree ul.pp-kids>li:last-child::before{bottom:auto;height:21px}',
    '.pp-tree ul.pp-kids>li::after{content:"";position:absolute;left:0;top:20px;width:18px;border-top:2px solid #d3c6ae}',
    '.pp-tree>li.pp-newli{margin:8px 0 0 14px;padding-left:22px}.pp-tree>li.pp-newli::before{content:"";position:absolute;left:0;top:-8px;height:29px;border-left:2px solid #d3c6ae}.pp-tree>li.pp-newli::after{content:"";position:absolute;left:0;top:20px;width:18px;border-top:2px solid #d3c6ae}',
    '.pp-node{display:flex;align-items:center;gap:8px;background:#efe8db;border:1px solid #e0d6c3;border-radius:9px;padding:5px 8px;font-size:13.5px;min-height:36px}.pp-node>strong{max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pp-node .pp-p{flex:1;min-width:0}.pp-node .pp-n{margin-left:auto}',
    '.pp-store.is-fab>.pp-node{background:#2b2621;color:#fff;border-color:#2b2621}.pp-store.is-fab>.pp-node .me-pill{background:#fff;color:#2b2621}.pp-p{color:#2b2621}.pp-store.is-fab>.pp-node .pp-p.is-fixo{opacity:1}.pp-store.is-fab>.pp-node .pp-n{color:#cfc7ba}.pp-ico{font-size:15px}',
    '.pp-addbtn{margin:0 0 0 6px;width:auto;padding:2px 9px;font-size:11.5px;font-weight:700;border-radius:6px;border:1px solid #b9a888;background:#fff;color:#5a4526;cursor:pointer;white-space:nowrap;box-shadow:none}.pp-addbtn:hover{background:#f6efe2}',
    '.pp-store.is-semdono>.pp-node{border-style:dashed;border-color:#c9a36b;background:#fdf8ef}.pp-need{flex:1;font-size:12.5px;color:#7a4a1e;font-style:italic}',
    '.pp-node.pp-new{border:2px dashed #c9a36b;background:#fdf8ef;color:#7a4a1e;font-size:13px;min-width:0;flex:none}',
    '.pp-tree ul.pp-kids>li>.pp-p{max-width:520px}',
    '#po-me .pp-store.pp-drop.is-over>.pp-node{outline:3px solid #7a4a1e;background:#fbf1de;color:#2b2621}#po-me .pp-store.pp-drop.is-over{outline:none;background:none}#po-me.pp-dragging .pp-store.pp-drop{outline:none}#po-me.pp-dragging .pp-store.pp-drop>.pp-node{outline:2px dashed #c9a36b;outline-offset:-2px}',
    '@media (max-width:820px){.pp-cols{grid-template-columns:1fr}.pp-side{position:static}}',
    '.pp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:12px;align-items:start}',
    '.pp-acc{border:1px solid var(--border,#e0ddd6);border-radius:10px;background:var(--panel-2,#faf8f4);overflow:hidden}.pp-acc.pp-sem{border-style:dashed}',
    '.pp-acc-h{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#efe8db;font-size:13.5px}.pp-acc-h strong{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pp-n{font-size:12px;color:var(--muted,#766f64);font-weight:700}',
    '.pp-acc-b{padding:6px;display:flex;flex-direction:column;gap:4px;max-height:340px;overflow:auto;min-height:44px}.pp-vazio{font-size:12.5px;color:var(--muted,#766f64);text-align:center;padding:10px}',
    '.pp-p{display:flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--border,#e0ddd6);border-radius:8px;padding:5px 6px;font-size:12.5px;cursor:grab}.pp-p.is-fixo{cursor:default;opacity:.75}.pp-p.is-owner{border-color:#c9a36b;background:#fffaf0}.pp-p.is-off{opacity:.6}.pp-p.is-drag{opacity:.4}',
    '.pp-grip{color:#b9b0a2;font-size:11px;letter-spacing:-2px;width:10px}.pp-mail{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pp-mail small{color:var(--muted,#766f64)}',
    '.pp-role{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-radius:9px;padding:1px 6px;background:#eee9df;color:#5c5346;white-space:nowrap}.pp-role.r-dealer{background:#7a4a1e;color:#fff}.pp-role.r-admin{background:#2b2621;color:#fff}.pp-role.r-off{background:#f3d9d5;color:#9a2b1e}',
    '.pp-cnt{font-size:10.5px;color:var(--muted,#766f64);white-space:nowrap}.pp-mv{width:22px;padding:0;margin:0;border:1px solid var(--border,#e0ddd6);border-radius:5px;height:22px;font-size:11px;background:#fff;color:#3a332a;cursor:pointer}',
    '#po-me.pp-dragging .pp-drop{outline:2px dashed #c9a36b;outline-offset:-2px}#po-me .pp-drop.is-over{outline:3px solid #7a4a1e;background:#fbf1de}',
    '@media (max-width:900px){.me-kpis{grid-template-columns:repeat(2,1fr)}.me-bar{grid-template-columns:110px 1fr 28px 70px}}'
  ].join('\n');
  document.head.appendChild(st);
}

// ==========================================================================
// PESSOAS (21/11, migration 319) — SÓ ADMIN
// ==========================================================================
// Matt: "quero uma tela em que eu possa arrastar o usuário e colocar dentro de
// um dealer, ou trocar a função de vendedor pra dealer, bem intuitivo, só
// arrastar pra baixo do dealer. quero colocar vários usuários que hoje estão
// como dealer na função vendedor e deixar só poucos dealers".
// Um quadro por loja com as pessoas dentro. Arrastar a pessoa pra um quadro =
// vira VENDEDOR daquela loja; arrastar pra faixa de cima = vira DEALER (loja
// própria). Sem arrastar: o seletor "Mover…" de cada pessoa faz o mesmo.
// Quem grava é a RPC admin_place_user (regras e o que vem junto: ver a 319).
const PP_TXT = {
  pt: { noprof: 'sem perfil', noprof_tip: 'Este login nunca completou o perfil no portal. Ao arrastar pra uma loja o perfil é criado.', need323: 'Para usar o tipo Dealer falta rodar a migration 323 (database/migration_323_tipo_dealer.sql) no SQL Editor do Supabase.', k_salesperson: 'Salesperson', k_contractor: 'Contractor', k_millworker: 'Millworker', k_designer: 'Designer', k_dealer: 'Dealer', k_homeowner: 'Homeowner', kind_tip: 'Tipo desta pessoa', never: 'nunca', today: 'hoje', mo: ' m', yr: ' a', last_tip: 'Último acesso', lock_err: 'Não consegui mudar o acesso:', lock_tip: 'Bloquear o acesso desta pessoa', unlock_tip: 'Liberar o acesso desta pessoa', q_lock: 'Bloquear o acesso de {u}?\n\nEle não consegue mais entrar no portal. Os projetos e pedidos dele continuam na loja. Dá pra liberar de novo a qualquer momento.', q_unlock: 'Liberar o acesso de {u} de novo?', done_lock: 'Acesso de {u} bloqueado.', done_unlock: 'Acesso de {u} liberado.', mg_tip: 'Margem deste vendedor em cima do custo da loja. Vazio = segue a margem geral da loja (número apagado).', dm_tip: 'Desconto de fábrica da loja · margem geral da loja', mg_lbl: 'Margem dele', drop_owner: 'solte aqui o dealer desta loja', q_take: 'Tornar {u} o DEALER (dono) de "{loja}"?\n\nOs projetos e pedidos dele passam pra "{loja}" e quem já é vendedor dela passa a responder a ele.', q_take_owner: '{u} hoje é o DEALER de "{de}".\n\nAo virar o dealer de "{loja}":\n• a equipe de "{de}" ({n} pessoa(s)) vai junto;\n• os projetos e pedidos de "{de}" passam pra "{loja}";\n• a loja "{de}" fica suspensa (não é apagada).\n\nContinuar?', done_owner: '{u} agora é o dealer de "{loja}".', hint2: 'Arraste a pessoa pra baixo de uma loja: ela vira vendedor daquela loja. Loja sem dealer: quem cair nela vira o dealer. Solte em "Tornar dealer", no fim da árvore, pra ela ter a própria loja. Um dealer arrastado pra outra loja leva junto a equipe, os projetos e os pedidos.', tab: 'Pessoas', hint: 'Arraste a pessoa pra dentro de uma loja: ela vira vendedor daquela loja. Arraste pra faixa "Tornar dealer" pra ela ter a própria loja. Um dealer arrastado pra outra loja leva junto a equipe, os projetos e os pedidos dele.',
    need319: 'Falta rodar a migration 319 (database/migration_319_pessoas_arrastar.sql) no SQL Editor do Supabase.', loading: 'Carregando pessoas…', search: 'Buscar pessoa ou loja…',
    new_dealer: 'Tornar dealer — solte aqui pra pessoa ter a própria loja', no_store: 'Sem loja', dealer: 'Dealer', seller: 'Vendedor', manager: 'Gerente', finance: 'Financeiro', admin: 'Admin da fábrica', off: 'inativo', susp: 'suspensa', no_owner: 'sem dealer',
    cnt: '{p} proj · {o} ped', move: 'Mover…', mv_dealer: '★ Tornar dealer (loja própria)', empty: 'Solte uma pessoa aqui', people: '{n} pessoa(s)',
    q_seller: 'Colocar {u} como VENDEDOR de "{loja}"?', q_owner: '{u} hoje é o DEALER de "{de}".\n\nAo virar vendedor de "{loja}":\n• a equipe de "{de}" ({n} pessoa(s)) vai junto, como vendedores;\n• os projetos e pedidos de "{de}" passam pra "{loja}";\n• a loja "{de}" fica suspensa (não é apagada).\n\nO preço dele passa a seguir o desconto de "{loja}". Continuar?',
    q_dealer: 'Tornar {u} um DEALER, com a própria loja?\n\nOs projetos e pedidos dele vão pra loja dele. O desconto da loja nova começa em 0% (ajuste depois).', done_seller: '{u} agora é vendedor de "{loja}".', done_dealer: '{u} agora é dealer.', same: 'Essa pessoa já está nessa loja.' },
  en: { noprof: 'no profile', noprof_tip: 'This login never completed a portal profile. Dragging it into a store creates the profile.', need323: 'To use the Dealer type, migration 323 (database/migration_323_tipo_dealer.sql) still has to be run in the Supabase SQL Editor.', k_salesperson: 'Salesperson', k_contractor: 'Contractor', k_millworker: 'Millworker', k_designer: 'Designer', k_dealer: 'Dealer', k_homeowner: 'Homeowner', kind_tip: 'Type of this person', never: 'never', today: 'today', mo: ' mo', yr: ' y', last_tip: 'Last access', lock_err: 'Could not change the access:', lock_tip: 'Block this person\'s access', unlock_tip: 'Restore this person\'s access', q_lock: 'Block {u}\'s access?\n\nThey can no longer sign in to the portal. Their projects and orders stay in the store. You can restore access at any time.', q_unlock: 'Restore {u}\'s access?', done_lock: '{u}\'s access blocked.', done_unlock: '{u}\'s access restored.', mg_tip: 'This salesperson\'s margin on top of the store cost. Empty = follows the store\'s general margin (greyed number).', dm_tip: 'Store factory discount · store general margin', mg_lbl: 'Their margin', drop_owner: 'drop this store\'s dealer here', q_take: 'Make {u} the DEALER (owner) of "{loja}"?\n\nTheir projects and orders move to "{loja}" and its current salespeople will report to them.', q_take_owner: '{u} is currently the DEALER of "{de}".\n\nBecoming the dealer of "{loja}":\n• the team of "{de}" ({n} people) comes along;\n• projects and orders of "{de}" move to "{loja}";\n• the store "{de}" is suspended (not deleted).\n\nContinue?', done_owner: '{u} is now the dealer of "{loja}".', hint2: 'Drag a person under a store: they become a salesperson of that store. Store without a dealer: whoever lands on it becomes its dealer. Drop on "Make dealer", at the end of the tree, to give them their own store. A dealer dragged into another store brings the team, projects and orders along.', tab: 'People', hint: 'Drag a person into a store: they become a salesperson of that store. Drag to the "Make dealer" strip to give them their own store. A dealer dragged into another store brings their team, projects and orders along.',
    need319: 'Migration 319 (database/migration_319_pessoas_arrastar.sql) still has to be run in the Supabase SQL Editor.', loading: 'Loading people…', search: 'Search person or store…',
    new_dealer: 'Make dealer — drop here to give the person their own store', no_store: 'No store', dealer: 'Dealer', seller: 'Salesperson', manager: 'Manager', finance: 'Finance', admin: 'Factory admin', off: 'inactive', susp: 'suspended', no_owner: 'no dealer',
    cnt: '{p} proj · {o} ord', move: 'Move…', mv_dealer: '★ Make dealer (own store)', empty: 'Drop a person here', people: '{n} people',
    q_seller: 'Make {u} a SALESPERSON of "{loja}"?', q_owner: '{u} is currently the DEALER of "{de}".\n\nBecoming a salesperson of "{loja}":\n• the team of "{de}" ({n} people) comes along, as salespeople;\n• projects and orders of "{de}" move to "{loja}";\n• the store "{de}" is suspended (not deleted).\n\nTheir price will follow the discount of "{loja}". Continue?',
    q_dealer: 'Make {u} a DEALER with their own store?\n\nTheir projects and orders move to their store. The new store starts at 0% discount (adjust later).', done_seller: '{u} is now a salesperson of "{loja}".', done_dealer: '{u} is now a dealer.', same: 'This person is already in this store.' },
  es: { noprof: 'sin perfil', noprof_tip: 'Este login nunca completó el perfil en el portal. Al arrastrarlo a una tienda se crea el perfil.', need323: 'Para usar el tipo Dealer falta ejecutar la migration 323 (database/migration_323_tipo_dealer.sql) en el SQL Editor de Supabase.', k_salesperson: 'Salesperson', k_contractor: 'Contractor', k_millworker: 'Millworker', k_designer: 'Designer', k_dealer: 'Dealer', k_homeowner: 'Homeowner', kind_tip: 'Tipo de esta persona', never: 'nunca', today: 'hoy', mo: ' m', yr: ' a', last_tip: 'Último acceso', lock_err: 'No se pudo cambiar el acceso:', lock_tip: 'Bloquear el acceso de esta persona', unlock_tip: 'Liberar el acceso de esta persona', q_lock: '¿Bloquear el acceso de {u}?\n\nYa no podrá entrar al portal. Sus proyectos y pedidos siguen en la tienda. Puede liberarlo de nuevo en cualquier momento.', q_unlock: '¿Liberar de nuevo el acceso de {u}?', done_lock: 'Acceso de {u} bloqueado.', done_unlock: 'Acceso de {u} liberado.', mg_tip: 'Margen de este vendedor sobre el costo de la tienda. Vacío = sigue el margen general de la tienda (número apagado).', dm_tip: 'Descuento de fábrica de la tienda · margen general de la tienda', mg_lbl: 'Su margen', drop_owner: 'suelte aquí el dealer de esta tienda', q_take: '¿Hacer de {u} el DEALER (dueño) de "{loja}"?\n\nSus proyectos y pedidos pasan a "{loja}" y los vendedores actuales pasan a responderle.', q_take_owner: '{u} hoy es el DEALER de "{de}".\n\nAl pasar a dealer de "{loja}":\n• el equipo de "{de}" ({n} persona(s)) va con él;\n• los proyectos y pedidos de "{de}" pasan a "{loja}";\n• la tienda "{de}" queda suspendida (no se borra).\n\n¿Continuar?', done_owner: '{u} ahora es el dealer de "{loja}".', hint2: 'Arrastre la persona debajo de una tienda: pasa a ser vendedor de esa tienda. Tienda sin dealer: quien caiga en ella pasa a ser su dealer. Suelte en "Hacer dealer", al final del árbol, para que tenga tienda propia. Un dealer arrastrado a otra tienda lleva su equipo, proyectos y pedidos.', tab: 'Personas', hint: 'Arrastre la persona dentro de una tienda: pasa a ser vendedor de esa tienda. Arrástrela a la franja "Hacer dealer" para que tenga su propia tienda. Un dealer arrastrado a otra tienda lleva consigo su equipo, proyectos y pedidos.',
    need319: 'Falta ejecutar la migration 319 (database/migration_319_pessoas_arrastar.sql) en el SQL Editor de Supabase.', loading: 'Cargando personas…', search: 'Buscar persona o tienda…',
    new_dealer: 'Hacer dealer — suelte aquí para que la persona tenga su propia tienda', no_store: 'Sin tienda', dealer: 'Dealer', seller: 'Vendedor', manager: 'Gerente', finance: 'Finanzas', admin: 'Admin de fábrica', off: 'inactivo', susp: 'suspendida', no_owner: 'sin dealer',
    cnt: '{p} proy · {o} ped', move: 'Mover…', mv_dealer: '★ Hacer dealer (tienda propia)', empty: 'Suelte una persona aquí', people: '{n} persona(s)',
    q_seller: '¿Poner a {u} como VENDEDOR de "{loja}"?', q_owner: '{u} hoy es el DEALER de "{de}".\n\nAl pasar a vendedor de "{loja}":\n• el equipo de "{de}" ({n} persona(s)) va con él, como vendedores;\n• los proyectos y pedidos de "{de}" pasan a "{loja}";\n• la tienda "{de}" queda suspendida (no se borra).\n\nSu precio seguirá el descuento de "{loja}". ¿Continuar?',
    q_dealer: '¿Hacer de {u} un DEALER con tienda propia?\n\nSus proyectos y pedidos van a su tienda. La tienda nueva empieza con 0% de descuento (ajuste después).', done_seller: '{u} ahora es vendedor de "{loja}".', done_dealer: '{u} ahora es dealer.', same: 'Esa persona ya está en esa tienda.' }
};
function ppT(k, v) { const L = PP_TXT[String(meLang()).slice(0, 2)] || PP_TXT.en; let t = L[k] != null ? L[k] : (PP_TXT.en[k] || k); Object.keys(v || {}).forEach((x) => { t = t.split('{' + x + '}').join(v[x] == null ? '' : String(v[x])); }); return t; }
// MARGEM POR VENDEDOR (21/11, migration 320). meState.mg[user_id] =
// { s: margem própria do vendedor | null, r: margem geral (do dealer) }.
// meState.mgOk = false enquanto a 320 não rodou (campos somem).
async function meLoadMargins() {
  meState.mg = {}; meState.mgOk = false; meState.bloq = {};
  try {
    // seller_active = a verdade do bloqueio (é o que a função dealer-create-seller
    // grava). 21/11: o cadeado lia account_members.active, que nem sempre
    // acompanha — bloqueava e o cadeado não mudava.
    let r = await supabaseClient.from('user_profiles').select('user_id, seller_margin_pct, resale_margin_pct, seller_active').limit(5000);
    const tem320 = !r.error;
    if (r.error) r = await supabaseClient.from('user_profiles').select('user_id, resale_margin_pct, seller_active').limit(5000);
    if (r.error) return;
    (r.data || []).forEach((x) => {
      meState.mg[x.user_id] = { s: x.seller_margin_pct == null ? null : Number(x.seller_margin_pct), r: Number(x.resale_margin_pct) || 0 };
      if (x.seller_active === false) meState.bloq[x.user_id] = true;
    });
    meState.mgOk = tem320;
  } catch (e) { /* sem a 320 */ }
}
async function meSetSellerMargin(userId, txt, inputEl) {
  const limpo = String(txt == null ? '' : txt).trim().replace(',', '.');
  const pct = limpo === '' ? null : Number(limpo);
  if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 1000)) { if (inputEl) inputEl.classList.add('is-err'); return; }
  try {
    const r = await supabaseClient.rpc('set_seller_margin', { p_user: userId, p_pct: pct });
    if (r.error) throw r.error;
    (meState.mg[userId] = meState.mg[userId] || { r: 0 }).s = pct;
    if (inputEl) { inputEl.classList.remove('is-err'); inputEl.classList.add('is-ok'); setTimeout(() => inputEl.classList.remove('is-ok'), 1200); }
    try { if (window.LegnoCentralPlus && typeof window.LegnoCentralPlus.recarregar === 'function') window.LegnoCentralPlus.recarregar(); } catch (e2) { /* relê depois */ }
  } catch (e) {
    if (inputEl) inputEl.classList.add('is-err');
    meState.err = (e && e.message) || String(e); meState.msg = '';
    meRender();
  }
}
// TIPO DA PESSOA (21/11, migration 321). Matt: "quero 4 status aqui:
// salesperson, contractor, millworker, designer". É etiqueta: o papel no
// sistema continua vendedor. meState.kind[user_id]; kindOk = a 321 rodou.
const PP_KINDS = ['salesperson', 'contractor', 'millworker', 'designer', 'dealer', 'homeowner'];   // 'homeowner' = migration 324;   // 'dealer' = migration 323 (só etiqueta)
async function meLoadKinds() {
  meState.kind = {}; meState.kindOk = false;
  try {
    const r = await supabaseClient.from('user_profiles').select('user_id, member_kind').limit(5000);
    if (r.error) return;
    (r.data || []).forEach((x) => { meState.kind[x.user_id] = x.member_kind || 'salesperson'; });
    meState.kindOk = true;
  } catch (e) { /* sem a 321 */ }
}
function meKindSelect(userId, atual) {
  const k = PP_KINDS.includes(atual) ? atual : 'salesperson';
  return '<select class="pp-kind k-' + k + '" data-u="' + mEsc(userId) + '" title="' + mEsc(ppT('kind_tip')) + '">'
    + PP_KINDS.map((v) => '<option value="' + v + '"' + (v === k ? ' selected' : '') + '>' + mEsc(ppT('k_' + v)) + '</option>').join('') + '</select>';
}
async function meSetKind(userId, kind, sel) {
  try {
    const r = await supabaseClient.rpc('set_member_kind', { p_user: userId, p_kind: kind });
    if (r.error) throw r.error;
    (meState.kind = meState.kind || {})[userId] = kind;
    if (sel) sel.className = 'pp-kind k-' + kind;
  } catch (e) {
    const m = (e && e.message) || String(e);
    alert((kind === 'dealer' || kind === 'homeowner') && /inválido|member_kind_chk|check constraint/i.test(m) ? ppT('need323').replace('323', kind === 'homeowner' ? '324' : '323').replace('migration_323_tipo_dealer', kind === 'homeowner' ? 'migration_324_tipo_homeowner' : 'migration_323_tipo_dealer').replace('Dealer', kind === 'homeowner' ? 'Homeowner' : 'Dealer') : m);
    if (sel) sel.value = (meState.kind || {})[userId] || 'salesperson';
  }
}
// o seletor de tipo também aparece fora desta janela (lista da equipe do dealer, portal-05)
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t && t.matches && t.matches('select.pp-kind') && !t.closest('#po-me')) meSetKind(t.getAttribute('data-u'), t.value, t);
});
// "há quanto tempo entrou" curtinho pro chip
function meAgo(d) {
  if (!d) return ppT('never');
  const dias = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (!(dias >= 0)) return ppT('never');
  if (dias < 1) return ppT('today');
  if (dias < 30) return dias + 'd';
  if (dias < 365) return Math.floor(dias / 30) + ppT('mo');
  return Math.floor(dias / 365) + ppT('yr');
}
// campo "+__%" do vendedor. geral = margem da loja (aparece apagada quando o vendedor não tem a dele)
function meMarginField(userId, geral) {
  if (!meState.mgOk) return '';
  const m = (meState.mg || {})[userId] || {};
  return '<label class="pp-mgl" title="' + mEsc(ppT('mg_tip')) + '"><span>+</span><input type="text" inputmode="decimal" class="pp-mg" data-u="' + mEsc(userId) + '" value="' + (m.s == null ? '' : m.s) + '" placeholder="' + (Number(geral) || 0) + '"><span>%</span></label>';
}
async function mePeopleLoad() {
  meState.peopleBusy = true;
  try {
    await meLoadMargins();
    await meLoadKinds();
    const r = await supabaseClient.rpc('admin_people');
    if (r.error) { meState.people = []; meState.peopleErr = /admin_people|function|schema cache|PGRST202/i.test(r.error.message || '') ? ppT('need319') : (r.error.message || 'Erro'); }
    else {
      // blocked/registered_at = migration 325 (sem ela: undefined, vale o seller_active lido acima)
      meState.people = (r.data || []).map((x) => Object.assign({}, x, { active: x.active !== false && !(meState.bloq || {})[x.user_id] && x.blocked !== true, created_at: x.registered_at || null }));
      Object.keys(meState.ppTravados || {}).forEach((u) => { const x = meState.people.find((y) => y.user_id === u); if (x && x.blocked === undefined) x.active = !meState.ppTravados[u]; });
      meState.peopleErr = '';
    }
    const tree = await supabaseClient.rpc('account_tree');
    if (!tree.error) meState.tree = tree.data || [];
  } catch (e) { meState.people = []; meState.peopleErr = (e && e.message) || String(e); }
  meState.peopleBusy = false;
  if (meState.tab === 'pessoas') meRender();
}
function ppAccName(id) { const a = (meState.tree || []).find((x) => x.id === id); return a ? (a.trade_name || a.legal_name || '—') : '—'; }
function ppUser(id) { return (meState.people || []).find((x) => x.user_id === id); }
function meViewPeople() {
  if (meState.peopleErr) return '<p class="error">' + mEsc(meState.peopleErr) + '</p>';
  if (!meState.people) return '<p class="hint">' + mEsc(ppT('loading')) + '</p>';
  const q = String(meState.peopleQ || '').trim().toLowerCase();
  const pessoas = meState.people;
  const porLoja = {}; pessoas.forEach((p) => { (porLoja[p.account_id || '_'] = porLoja[p.account_id || '_'] || []).push(p); });
  const peso = { owner: 0, manager: 1, finance: 2, seller: 3 };
  const lojas = (meState.tree || []).filter((a) => (porLoja[a.id] || []).length || a.status === 'active' || a.kind === 'factory')
    .sort((x, y) => (x.kind === 'factory' ? -1 : y.kind === 'factory' ? 1 : 0) || String(x.trade_name || x.legal_name || '').localeCompare(String(y.trade_name || y.legal_name || '')));
  const opts = '<option value="">' + mEsc(ppT('move')) + '</option><option value="_dealer">' + mEsc(ppT('mv_dealer')) + '</option>'
    + lojas.filter((a) => a.kind !== 'factory').map((a) => '<option value="' + mEsc(a.id) + '">→ ' + mEsc(a.trade_name || a.legal_name || '—') + '</option>').join('');
  const contaDe = {}; (meState.tree || []).forEach((a) => { contaDe[a.id] = a; });
  const donoDe = {}; pessoas.forEach((p) => { if (p.member_role === 'owner') donoDe[p.account_id] = p.user_id; });
  const chip = (p) => {
    const mail = String(p.email || '—'); const i = mail.indexOf('@');
    const papel = p.is_admin ? 'admin' : p.member_role === 'owner' ? 'dealer' : p.member_role || '';
    return '<div class="pp-p' + (p.is_admin ? ' is-fixo' : '') + (p.member_role === 'owner' ? ' is-owner' : '') + (p.active === false ? ' is-off' : '') + '"' + (p.is_admin ? '' : ' draggable="true"') + ' data-u="' + mEsc(p.user_id) + '" title="' + mEsc(mail) + '">'
      + '<span class="pp-grip">' + (p.is_admin ? '' : '⋮⋮') + '</span>'
      + '<span class="pp-mail"><b>' + mEsc(i > 0 ? mail.slice(0, i) : mail) + '</b><small>' + mEsc(i > 0 ? mail.slice(i) : '') + '</small></span>'
      + (meState.kindOk && !p.is_admin && p.member_role !== 'owner' ? meKindSelect(p.user_id, (meState.kind || {})[p.user_id])
        : (papel ? '<span class="pp-role r-' + papel + '">' + mEsc(ppT(papel)) + '</span>' : ''))
      + (p.active === false ? '<span class="pp-role r-off">' + mEsc(ppT('off')) + '</span>' : '')
      + (p.profile_role == null && !p.is_admin ? '<span class="pp-role r-off" title="' + mEsc(ppT('noprof_tip')) + '">' + mEsc(ppT('noprof')) + '</span>' : '')
      + (p.member_role === 'owner' && !p.is_admin && meState.mgOk ? '<span class="pp-dm" title="' + mEsc(ppT('dm_tip')) + '">−' + (Number((contaDe[p.account_id] || {}).factory_discount_pct) || 0) + '% · +' + (((meState.mg || {})[p.user_id] || {}).r || 0) + '%</span>' : '')
      + (p.member_role && p.member_role !== 'owner' && !p.is_admin && p.account_id ? meMarginField(p.user_id, ((meState.mg || {})[donoDe[p.account_id]] || {}).r) : '')
      + '<span class="pp-last' + (p.last_active_at ? '' : ' is-never') + '" title="' + mEsc(ppT('last_tip') + ': ' + (p.last_active_at ? new Date(p.last_active_at).toLocaleString() : ppT('never'))) + '">' + mEsc(meAgo(p.last_active_at)) + '</span>'
      + '<span class="pp-cnt">' + mEsc(ppT('cnt', { p: Number(p.n_projects) || 0, o: Number(p.n_orders) || 0 })) + '</span>'
      + (!p.is_admin ? '<button type="button" class="pp-lock' + (p.active === false ? ' is-off' : '') + '" data-a="pplock" data-u="' + mEsc(p.user_id) + '" data-v="' + (p.active === false ? '1' : '0') + '" title="' + mEsc(ppT(p.active === false ? 'unlock_tip' : 'lock_tip')) + '">' + (p.active === false ? '🔒' : '🔓') + '</button>' : '')
      + (p.is_admin ? '' : '<select class="pp-mv" data-u="' + mEsc(p.user_id) + '" aria-label="' + mEsc(ppT('move')) + '">' + opts + '</select>')
      + '</div>';
  };
  const casa = (p, nomeLoja) => !q || String(p.email || '').toLowerCase().includes(q) || String(nomeLoja || '').toLowerCase().includes(q);
  // 21/11 (Matt: "último acesso, sempre do mais atualizado em cima pro que nunca mais entrou pra baixo")
  const quando = (p) => (p.last_active_at ? new Date(p.last_active_at).getTime() : 0);
  const ordP = (l) => l.slice().sort((x, y) => ((x.member_role === 'owner' ? 0 : 1) - (y.member_role === 'owner' ? 0 : 1)) || (quando(y) - quando(x)) || String(x.email || '').localeCompare(String(y.email || '')));
  // ÁRVORE (21/11, Matt: "gostaria de ver em forma de árvore mesmo, bem visual"):
  // fábrica em cima; cada loja é um galho (nome + o dealer na mesma linha) e os
  // vendedores pendurados embaixo. O galho inteiro é a área de soltar. Loja SEM
  // dealer também aceita: quem cair nela vira o dealer (dono) dela.
  const ids = new Set(lojas.map((a) => a.id));
  const filhas = {}; lojas.forEach((a) => { const k = a.parent_account_id && ids.has(a.parent_account_id) ? a.parent_account_id : '_raiz'; (filhas[k] = filhas[k] || []).push(a); });
  const galho = (a) => {
    const nome = a.trade_name || a.legal_name || '—';
    const l = porLoja[a.id] || [];
    const dono = l.filter((p) => p.member_role === 'owner');
    const resto = ordP(l.filter((p) => p.member_role !== 'owner'));
    const sub = (filhas[a.id] || []).map(galho).join('');
    const visD = dono.filter((p) => casa(p, nome)); const visR = resto.filter((p) => casa(p, nome));
    if (q && !visD.length && !visR.length && !sub) return '';
    const fab = a.kind === 'factory';
    const solta = !fab;                       // fábrica não recebe gente por aqui
    return '<li class="pp-store' + (fab ? ' is-fab' : '') + (solta ? ' pp-drop' : '') + (!dono.length && !fab ? ' is-semdono' : '') + '"' + (solta ? ' data-acc="' + mEsc(a.id) + '"' : '') + '>'
      + '<div class="pp-node"><span class="pp-ico">' + (fab ? '🏭' : '🏬') + '</span><strong title="' + mEsc(nome) + '">' + mEsc(nome) + '</strong>'
      + (fab ? '<span class="me-pill">' + mEsc(mT('kind_factory')) + '</span>' : '')
      + (a.status === 'suspended' ? '<span class="me-pill st-suspended">' + mEsc(ppT('susp')) + '</span>' : '')
      + (!dono.length && !fab ? '<span class="pp-need">' + mEsc(ppT('drop_owner')) + '</span>' : '')
      + (q ? visD : dono).map(chip).join('')
      // + PESSOA (22/11): cria o login e já põe nesta loja — ver mePpAddOpen
      + (fab ? '' : '<button type="button" class="pp-addbtn" data-a="ppadd" data-acc="' + mEsc(a.id) + '" title="' + mEsc(paT('tip', { loja: nome })) + '">+ ' + mEsc(paT('btn')) + '</button>')
      + '<span class="pp-n">' + l.length + '</span></div>'
      + ((q ? visR : resto).length || sub ? '<ul class="pp-kids">' + (q ? visR : resto).map((p) => '<li>' + chip(p) + '</li>').join('') + sub + '</ul>' : '')
      + '</li>';
  };
  const sem = ordP(porLoja._ || []).filter((p) => casa(p, ''));
  return '<p class="hint">' + mEsc(ppT('hint2')) + '</p>'
    + '<div class="pp-top"><input type="search" id="pp-q" placeholder="' + mEsc(ppT('search')) + '" value="' + mEsc(meState.peopleQ || '') + '"></div>'
    + '<div class="pp-cols">'
    + '<div class="pp-side"><div class="pp-acc-h"><strong>' + mEsc(ppT('no_store')) + '</strong><span class="pp-n">' + (porLoja._ || []).length + '</span></div>'
    + '<div class="pp-acc-b">' + (sem.length ? sem.map(chip).join('') : '<div class="pp-vazio">—</div>') + '</div></div>'
    + '<div class="pp-arv"><ul class="pp-tree">' + (filhas._raiz || []).map(galho).join('')
    + '<li class="pp-store pp-drop pp-newli" data-acc="_dealer"><div class="pp-node pp-new">★ ' + mEsc(ppT('new_dealer')) + '</div></li>'
    + '</ul></div></div>';
}
// ---------- CADASTRO DA PESSOA / LOJA (21/11) ----------
// Matt: "quero poder clicar no usuário e abrir o cadastro dele, com desconto,
// endereço, nome da empresa, tax exemption, validade, status, último acesso,
// número de projetos, telefone, e-mail, logotipo... tudo numa tela do próprio
// portal, mas que altera e está conectada com a do ERP".
// Lê e grava nas MESMAS tabelas do ERP › Dealers (accounts) e do perfil
// (user_profiles) — não tem cópia: o que salva aqui aparece lá e vice-versa.
// Os dados da empresa são da LOJA: valem pro dealer e pra equipe inteira.
const PC_TXT = {
  pt: { since: 'Cadastrou-se em', days_ago: 'há {n} dias', own: 'Cadastro desta pessoa', own_hint: 'Cadastro próprio desta pessoa. Ela está na loja "{loja}": o preço dela vem do desconto da loja + a margem que o dealer deu, por isso aqui não tem desconto de fábrica.', own_hint2: 'Cadastro próprio desta pessoa. O preço dela vem do desconto da loja + a margem que você deu, por isso aqui não tem desconto de fábrica.', tax_info: 'Informativo: a invoice da fábrica segue o tax exemption da LOJA.', notes: 'Observações', need321: 'Falta rodar a migration 321 (database/migration_321_tipo_e_cadastro_da_pessoa.sql) no SQL Editor do Supabase.', title: 'Cadastro', person: 'Pessoa', store: 'Empresa (loja)', email: 'E-mail', role: 'Função', last: 'Último acesso', never: 'nunca', projs: 'Projetos', orders: 'Pedidos', active: 'Acesso', on: 'ativo', offv: 'inativo',
    trade: 'Nome da empresa', legal: 'Razão social', contact: 'Contato', bemail: 'E-mail de cobrança', phone: 'Telefone', site: 'Site', l1: 'Endereço', l2: 'Complemento', city: 'Cidade', state: 'Estado', zip: 'ZIP',
    disc: 'Desconto de fábrica (%)', tax: 'Tax exemption', tstatus: 'Status', tuntil: 'Validade', tstate: 'Estado do certificado', tnum: 'Número', ts_none: 'Não tem', ts_pending: 'Em análise', ts_valid: 'Válido', ts_expired: 'Vencido', ts_rejected: 'Recusado',
    logo: 'Logotipo', nologo: 'sem logotipo', save: 'Salvar', close: 'Fechar', saved: 'Salvo.', q_discard: 'Tem alteração sem salvar. Fechar mesmo assim?', erp: 'Abrir no ERP ↗', shared: 'Estes dados são da loja "{loja}" — valem pro dealer e pra toda a equipe dela.', nostore: 'Esta pessoa não está em nenhuma loja. Arraste ela pra uma loja (ou pra "Tornar dealer") pra ter cadastro de empresa. Abaixo, os dados do perfil dela.',
    pstore: 'Nome da loja (perfil)', need_until: 'Tax exemption válido precisa da validade.', loading: 'Carregando…', store_st: 'Situação da loja' },
  en: { since: 'Registered on', days_ago: '{n} days ago', own: 'This person\'s record', own_hint: 'This person\'s own record. They are in the store "{loja}": their price comes from the store discount + the margin the dealer set, so there is no factory discount here.', own_hint2: 'This person\'s own record. Their price comes from the store discount + the margin you set, so there is no factory discount here.', tax_info: 'For reference: the factory invoice follows the STORE\'s tax exemption.', notes: 'Notes', need321: 'Migration 321 (database/migration_321_tipo_e_cadastro_da_pessoa.sql) still has to be run in the Supabase SQL Editor.', title: 'Record', person: 'Person', store: 'Company (store)', email: 'E-mail', role: 'Role', last: 'Last access', never: 'never', projs: 'Projects', orders: 'Orders', active: 'Access', on: 'active', offv: 'inactive',
    trade: 'Company name', legal: 'Legal name', contact: 'Contact', bemail: 'Billing e-mail', phone: 'Phone', site: 'Website', l1: 'Address', l2: 'Address line 2', city: 'City', state: 'State', zip: 'ZIP',
    disc: 'Factory discount (%)', tax: 'Tax exemption', tstatus: 'Status', tuntil: 'Valid until', tstate: 'Certificate state', tnum: 'Number', ts_none: 'None', ts_pending: 'Under review', ts_valid: 'Valid', ts_expired: 'Expired', ts_rejected: 'Rejected',
    logo: 'Logo', nologo: 'no logo', save: 'Save', close: 'Close', saved: 'Saved.', q_discard: 'There are unsaved changes. Close anyway?', erp: 'Open in ERP ↗', shared: 'This is the record of the store "{loja}" — it applies to the dealer and the whole team.', nostore: 'This person is not in any store. Drag them into a store (or to "Make dealer") to have a company record. Below, their profile data.',
    pstore: 'Store name (profile)', need_until: 'A valid tax exemption needs the expiry date.', loading: 'Loading…', store_st: 'Store status' },
  es: { since: 'Se registró el', days_ago: 'hace {n} días', own: 'Ficha de esta persona', own_hint: 'Ficha propia de esta persona. Está en la tienda "{loja}": su precio viene del descuento de la tienda + el margen que dio el dealer, por eso aquí no hay descuento de fábrica.', own_hint2: 'Ficha propia de esta persona. Su precio viene del descuento de la tienda + el margen que usted dio, por eso aquí no hay descuento de fábrica.', tax_info: 'Informativo: la factura de fábrica sigue el tax exemption de la TIENDA.', notes: 'Observaciones', need321: 'Falta ejecutar la migration 321 (database/migration_321_tipo_e_cadastro_da_pessoa.sql) en el SQL Editor de Supabase.', title: 'Ficha', person: 'Persona', store: 'Empresa (tienda)', email: 'E-mail', role: 'Función', last: 'Último acceso', never: 'nunca', projs: 'Proyectos', orders: 'Pedidos', active: 'Acceso', on: 'activo', offv: 'inactivo',
    trade: 'Nombre de la empresa', legal: 'Razón social', contact: 'Contacto', bemail: 'E-mail de cobro', phone: 'Teléfono', site: 'Sitio web', l1: 'Dirección', l2: 'Complemento', city: 'Ciudad', state: 'Estado', zip: 'ZIP',
    disc: 'Descuento de fábrica (%)', tax: 'Tax exemption', tstatus: 'Estado', tuntil: 'Validez', tstate: 'Estado del certificado', tnum: 'Número', ts_none: 'No tiene', ts_pending: 'En análisis', ts_valid: 'Válido', ts_expired: 'Vencido', ts_rejected: 'Rechazado',
    logo: 'Logotipo', nologo: 'sin logotipo', save: 'Guardar', close: 'Cerrar', saved: 'Guardado.', q_discard: 'Hay cambios sin guardar. ¿Cerrar de todos modos?', erp: 'Abrir en el ERP ↗', shared: 'Estos datos son de la tienda "{loja}" — valen para el dealer y todo su equipo.', nostore: 'Esta persona no está en ninguna tienda. Arrástrela a una tienda (o a "Hacer dealer") para tener ficha de empresa. Abajo, los datos de su perfil.',
    pstore: 'Nombre de la tienda (perfil)', need_until: 'Un tax exemption válido necesita la validez.', loading: 'Cargando…', store_st: 'Situación de la tienda' }
};
function pcT(k, v) { const L = PC_TXT[String(meLang()).slice(0, 2)] || PC_TXT.en; let t = L[k] != null ? L[k] : (PC_TXT.en[k] || k); Object.keys(v || {}).forEach((x) => { t = t.split('{' + x + '}').join(v[x] == null ? '' : String(v[x])); }); return t; }
const PC_ACC = ['trade_name', 'legal_name', 'contact_name', 'billing_email', 'phone', 'website', 'billing_line1', 'billing_line2', 'billing_city', 'billing_state', 'billing_zip', 'tax_exempt_state', 'tax_exempt_number'];
function pcEl() {
  let ov = document.getElementById('pp-card');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'pp-card';
    // 21/11 (Matt: "sem querer clica fora e a tela fecha, perdi tudo que já tinha
    // cadastrado"): clicar FORA não fecha mais. Só o × e o Fechar — e, com
    // alteração sem salvar, pergunta antes.
    ov.addEventListener('click', (e) => {
      if (e.target.closest('[data-pc="close"]')) {
        const c = meState.pc;
        if (c && c.dirty && !confirm(pcT('q_discard'))) return;
        ov.style.display = 'none'; return;
      }
      if (e.target.closest('[data-pc="save"]')) mePersonSave();
    });
    const suja = (e) => { if (meState.pc && e.target.closest('.pc-box')) meState.pc.dirty = true; };
    ov.addEventListener('input', suja); ov.addEventListener('change', suja);
    document.body.appendChild(ov);
  }
  return ov;
}
// arg = id (árvore do admin) OU o objeto da pessoa (lista da equipe do dealer,
// portal-05: { user_id, email, member_role:'seller', n_projects, last_active_at, active }).
// Quem está EMBAIXO de um dealer tem cadastro PRÓPRIO (person_records, migration
// 321) — sem desconto de fábrica (21/11, Matt: "porém sem margem de fábrica,
// porque já estará pronto do dealer"). O dono continua com a ficha da LOJA.
async function mePersonOpen(arg) {
  const p = arg && typeof arg === 'object' ? arg : ppUser(arg);
  const userId = p && p.user_id;
  if (!p) return;
  meCss();
  const ov = pcEl(); ov.style.display = 'flex';
  ov.innerHTML = '<div class="pc-box"><p class="hint">' + mEsc(pcT('loading')) + '</p></div>';
  const c = { p, prof: null, acc: null, msg: '', err: '' };
  meState.pc = c;
  try {
    const pr = await supabaseClient.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
    c.prof = pr.error ? null : pr.data;
    c.proprio = p.member_role !== 'owner' && !p.is_admin && (!!p.account_id || !!p.viaDealer);
    if (c.proprio) {
      const r = await supabaseClient.from('person_records').select('*').eq('user_id', userId).maybeSingle();
      if (r.error) { c.recOk = false; c.err = /person_records|schema cache|does not exist|PGRST205/i.test(r.error.message || '') ? pcT('need321') : r.error.message; }
      else { c.recOk = true; c.rec = r.data || {}; }
      c.loja = p.account_id ? ppAccName(p.account_id) : '';
    } else if (p.account_id) {
      const a = await supabaseClient.from('accounts').select('*').eq('id', p.account_id).maybeSingle();
      if (a.error) c.err = a.error.message; else c.acc = a.data;
    }
  } catch (e) { c.err = (e && e.message) || String(e); }
  if (meState.pc === c) mePersonRender();
}
function mePersonRender() {
  const c = meState.pc; if (!c) return;
  const p = c.p; const a = c.acc; const pf = c.prof || {};
  const inp = (id, rot, val, tipo, extra) => '<label class="pc-f' + (extra && extra.w ? ' ' + extra.w : '') + '"><span>' + mEsc(rot) + '</span><input id="pc-' + id + '" type="' + (tipo || 'text') + '" value="' + mEsc(val == null ? '' : val) + '"' + ((extra && extra.attr) || '') + '></label>';
  const ro = (rot, val) => '<div class="pc-ro"><span>' + mEsc(rot) + '</span><b>' + val + '</b></div>';
  const tipo = (meState.kind || {})[p.user_id] || pf.member_kind;
  const papel = p.is_admin ? ppT('admin') : p.member_role === 'owner' ? ppT('dealer') : c.proprio && tipo ? ppT('k_' + tipo) : p.member_role ? ppT(p.member_role) : (pf.role || '—');
  const ultimo = p.last_active_at ? new Date(p.last_active_at).toLocaleString() : pcT('never');
  // 21/11 (Matt: "quero saber quando o usuário se cadastrou") — data em que o perfil nasceu
  const nasc = pf.created_at || p.created_at;
  const dias = nasc ? Math.floor((Date.now() - new Date(nasc).getTime()) / 86400000) : null;
  const desde = nasc ? new Date(nasc).toLocaleDateString() + (dias != null && dias >= 0 ? ' · ' + pcT('days_ago', { n: dias }) : '') : '—';
  const logo = (a && a.logo_url) || pf.logo_url || '';
  let h = '<div class="pc-box" role="dialog" aria-modal="true"><div class="pc-head"><div class="pc-logo">' + (logo ? '<img src="' + mEsc(logo) + '" alt="">' : '<span>' + mEsc(pcT('nologo')) + '</span>') + '</div>'
    + '<div class="pc-tit"><h3>' + mEsc(a ? (a.trade_name || a.legal_name || '—') : (c.rec && c.rec.company_name) || String(p.email || '').split('@')[0]) + '</h3><span>' + mEsc(p.email || '') + '</span></div>'
    + '<button type="button" class="me-x" data-pc="close" aria-label="' + mEsc(pcT('close')) + '">×</button></div>'
    + (c.err ? '<p class="error">' + mEsc(c.err) + '</p>' : '') + (c.msg ? '<p class="me-msg ok">' + mEsc(c.msg) + '</p>' : '')
    + '<h4>' + mEsc(pcT('person')) + '</h4><div class="pc-grid">'
    + ro(pcT('email'), mEsc(p.email || '—')) + ro(pcT('role'), mEsc(papel)) + ro(pcT('since'), mEsc(desde)) + ro(pcT('last'), mEsc(ultimo))
    + ro(pcT('projs'), Number(p.n_projects) || 0) + ro(pcT('orders'), Number(p.n_orders) || 0) + ro(pcT('active'), mEsc(p.active === false ? pcT('offv') : pcT('on'))) + '</div>';
  if (c.proprio) {
    const r = c.rec || {}; const tx = r.tax_exempt_status || 'none';
    h += (c.loja ? '<p class="hint">' + mEsc(pcT('own_hint', { loja: c.loja })) + '</p>' : '<p class="hint">' + mEsc(pcT('own_hint2')) + '</p>');
    if (c.recOk) {
      h += '<h4>' + mEsc(pcT('own')) + '</h4><div class="pc-grid">'
        + inp('r_company_name', pcT('trade'), r.company_name, 'text', { w: 'w2' }) + inp('r_legal_name', pcT('legal'), r.legal_name, 'text', { w: 'w2' })
        + inp('r_contact_name', pcT('contact'), r.contact_name) + inp('r_phone', pcT('phone'), r.phone, 'tel') + inp('r_billing_email', pcT('bemail'), r.billing_email, 'email') + inp('r_website', pcT('site'), r.website)
        + inp('r_line1', pcT('l1'), r.line1, 'text', { w: 'w2' }) + inp('r_line2', pcT('l2'), r.line2, 'text', { w: 'w2' })
        + inp('r_city', pcT('city'), r.city, 'text', { w: 'w2' }) + inp('r_state', pcT('state'), r.state) + inp('r_zip', pcT('zip'), r.zip)
        + '</div><h4>' + mEsc(pcT('tax')) + '</h4><div class="pc-grid">'
        + '<label class="pc-f"><span>' + mEsc(pcT('tstatus')) + '</span><select id="pc-r_tax_exempt_status">' + ['none', 'pending', 'valid', 'expired', 'rejected'].map((v) => '<option value="' + v + '"' + (v === tx ? ' selected' : '') + '>' + mEsc(pcT('ts_' + v)) + '</option>').join('') + '</select></label>'
        + inp('r_tax_exempt_valid_until', pcT('tuntil'), r.tax_exempt_valid_until || '', 'date') + inp('r_tax_exempt_state', pcT('tstate'), r.tax_exempt_state) + inp('r_tax_exempt_number', pcT('tnum'), r.tax_exempt_number)
        + '</div><p class="hint">' + mEsc(pcT('tax_info')) + '</p>'
        + '<label class="pc-f" style="margin-top:8px"><span>' + mEsc(pcT('notes')) + '</span><input id="pc-r_notes" type="text" value="' + mEsc(r.notes || '') + '"></label>';
    }
  } else if (a) {
    const tx = a.tax_exempt_status || 'none';
    h += '<h4>' + mEsc(pcT('store')) + (a.kind !== 'factory' ? ' <a class="pc-erp" href="erp/index.html#/dealers/' + mEsc(a.id) + '" target="_blank" rel="noopener">' + mEsc(pcT('erp')) + '</a>' : '') + '</h4>'
      + (p.member_role !== 'owner' ? '<p class="hint">' + mEsc(pcT('shared', { loja: a.trade_name || a.legal_name || '—' })) + '</p>' : '')
      + '<div class="pc-grid">'
      + inp('trade_name', pcT('trade'), a.trade_name, 'text', { w: 'w2' }) + inp('legal_name', pcT('legal'), a.legal_name, 'text', { w: 'w2' })
      + inp('contact_name', pcT('contact'), a.contact_name) + inp('phone', pcT('phone'), a.phone, 'tel') + inp('billing_email', pcT('bemail'), a.billing_email, 'email') + inp('website', pcT('site'), a.website)
      + inp('billing_line1', pcT('l1'), a.billing_line1, 'text', { w: 'w2' }) + inp('billing_line2', pcT('l2'), a.billing_line2, 'text', { w: 'w2' })
      + inp('billing_city', pcT('city'), a.billing_city, 'text', { w: 'w2' }) + inp('billing_state', pcT('state'), a.billing_state) + inp('billing_zip', pcT('zip'), a.billing_zip)
      + '</div><div class="pc-grid pc-dest">'
      + inp('factory_discount_pct', pcT('disc'), Number(a.factory_discount_pct || 0), 'number', { attr: ' min="0" max="100" step="0.5"' })
      + ro(pcT('store_st'), mEsc(mT('st_' + a.status)))
      + '</div><h4>' + mEsc(pcT('tax')) + '</h4><div class="pc-grid">'
      + '<label class="pc-f"><span>' + mEsc(pcT('tstatus')) + '</span><select id="pc-tax_exempt_status">' + ['none', 'pending', 'valid', 'expired', 'rejected'].map((v) => '<option value="' + v + '"' + (v === tx ? ' selected' : '') + '>' + mEsc(pcT('ts_' + v)) + '</option>').join('') + '</select></label>'
      + inp('tax_exempt_valid_until', pcT('tuntil'), a.tax_exempt_valid_until || '', 'date') + inp('tax_exempt_state', pcT('tstate'), a.tax_exempt_state) + inp('tax_exempt_number', pcT('tnum'), a.tax_exempt_number)
      + '</div>';
  } else {
    h += '<p class="hint">' + mEsc(pcT('nostore')) + '</p><div class="pc-grid">'
      + inp('p_store_name', pcT('pstore'), pf.store_name, 'text', { w: 'w2' }) + inp('p_store_phone', pcT('phone'), pf.store_phone, 'tel')
      + inp('p_factory_discount_pct', pcT('disc'), Number(pf.factory_discount_pct || 0), 'number', { attr: ' min="0" max="100" step="0.5"' }) + '</div>';
  }
  h += '<div class="pc-foot"><button type="button" class="secondary" data-pc="close">' + mEsc(pcT('close')) + '</button><button type="button" data-pc="save">' + mEsc(pcT('save')) + '</button></div></div>';
  pcEl().innerHTML = h;
}
async function mePersonSave() {
  const c = meState.pc; if (!c || c.busy) return;
  const v = (id) => { const e = document.getElementById('pc-' + id); return e ? String(e.value).trim() : null; };
  const num = (id) => Math.max(0, Math.min(100, Number(v(id)) || 0));
  c.busy = true; c.err = ''; c.msg = '';
  try {
    if (c.proprio) {
      if (!c.recOk) throw new Error(pcT('need321'));
      const up = { user_id: c.p.user_id };
      ['company_name', 'legal_name', 'contact_name', 'phone', 'billing_email', 'website', 'line1', 'line2', 'city', 'state', 'zip', 'tax_exempt_state', 'tax_exempt_number', 'notes']
        .forEach((k) => { const x = v('r_' + k); if (x !== null) up[k] = x || null; });
      up.tax_exempt_status = v('r_tax_exempt_status') || 'none';
      up.tax_exempt_valid_until = v('r_tax_exempt_valid_until') || null;
      if (up.tax_exempt_status === 'valid' && !up.tax_exempt_valid_until) throw new Error(pcT('need_until'));
      const r = await supabaseClient.from('person_records').upsert(up, { onConflict: 'user_id' }).select('*').maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) throw new Error('RLS');
      c.rec = r.data;
    } else if (c.acc) {
      const up = {};
      PC_ACC.forEach((k) => { const x = v(k); if (x !== null) up[k] = x || null; });
      if (!up.trade_name) up.trade_name = c.acc.trade_name;        // nome da loja nunca fica vazio
      up.factory_discount_pct = num('factory_discount_pct');
      up.tax_exempt_status = v('tax_exempt_status') || 'none';
      up.tax_exempt_valid_until = v('tax_exempt_valid_until') || null;
      if (up.tax_exempt_status === 'valid' && !up.tax_exempt_valid_until) throw new Error(pcT('need_until'));
      const r = await supabaseClient.from('accounts').update(up).eq('id', c.acc.id).select('*').maybeSingle();
      if (r.error) throw r.error;
      if (r.data) c.acc = r.data;
      const t = (meState.tree || []).find((x) => x.id === c.acc.id);
      if (t) Object.assign(t, { trade_name: c.acc.trade_name, legal_name: c.acc.legal_name, factory_discount_pct: c.acc.factory_discount_pct });
    } else {
      const r = await supabaseClient.from('user_profiles').update({ store_name: v('p_store_name') || null, store_phone: v('p_store_phone') || null, factory_discount_pct: num('p_factory_discount_pct') }).eq('user_id', c.p.user_id).select('*').maybeSingle();
      if (r.error) throw r.error;
      if (r.data) c.prof = r.data;
    }
    c.msg = pcT('saved'); c.dirty = false;
    meState.loaded = false;
  } catch (e) { c.err = (e && e.message) || String(e); }
  c.busy = false;
  if (c.err) {
    // deu erro: NÃO redesenha (o que foi digitado continua nos campos)
    const box = document.querySelector('#pp-card .pc-box'); const velho = box && box.querySelector('.pc-err');
    if (velho) velho.remove();
    if (box) { const pe = document.createElement('p'); pe.className = 'error pc-err'; pe.textContent = c.err; box.insertBefore(pe, box.querySelector('h4')); box.scrollIntoView({ block: 'start' }); }
    return;
  }
  mePersonRender();
  if (meState.tab === 'pessoas') meRender();
}
function ppTemDono(accId) { return (meState.people || []).some((x) => x.account_id === accId && x.member_role === 'owner'); }
// loja com dealer = entra como vendedor; loja sem dealer = vira o dealer dela
function ppModo(acc) { return acc === '_dealer' ? 'dealer' : ppTemDono(acc) ? 'seller' : 'owner'; }
async function mePlace(userId, accountId, mode) {
  const p = ppUser(userId);
  if (!p || p.is_admin || meState.busy) return;
  const nome = String(p.email || '').split('@')[0];
  if (mode === 'seller') {
    if (p.account_id === accountId && p.member_role !== 'owner') { meState.msg = ppT('same'); meState.err = ''; return meRender(); }
    if (p.account_id === accountId) return;
    const loja = ppAccName(accountId);
    const equipe = p.member_role === 'owner' ? meState.people.filter((x) => x.account_id === p.account_id && x.user_id !== p.user_id).length : 0;
    const perg = p.member_role === 'owner' ? ppT('q_owner', { u: nome, de: ppAccName(p.account_id), loja, n: equipe }) : ppT('q_seller', { u: nome, loja });
    if (!confirm(perg)) return;
  } else if (mode === 'owner') {
    if (p.account_id === accountId && p.member_role === 'owner') return;
    const loja = ppAccName(accountId);
    const eraDono = p.member_role === 'owner';
    const equipe = eraDono ? meState.people.filter((x) => x.account_id === p.account_id && x.user_id !== p.user_id).length : 0;
    if (!confirm(ppT(eraDono ? 'q_take_owner' : 'q_take', { u: nome, de: eraDono ? ppAccName(p.account_id) : '', loja, n: equipe }))) return;
  } else {
    if (p.member_role === 'owner') return;
    if (!confirm(ppT('q_dealer', { u: nome }))) return;
  }
  meState.busy = true; meState.err = ''; meState.msg = '';
  try {
    // login sem perfil (migration 325): cria o perfil que falta antes de mover
    if (p.profile_role == null) {
      const pr = await supabaseClient.rpc('admin_ensure_profile', { p_user: userId });
      if (pr.error) throw pr.error;
    }
    const r = await supabaseClient.rpc('admin_place_user', { p_user: userId, p_account: mode === 'dealer' ? null : accountId, p_mode: mode, p_move_data: true });
    if (r.error) throw r.error;
    meState.msg = mode === 'seller' ? ppT('done_seller', { u: nome, loja: ppAccName(accountId) }) : mode === 'owner' ? ppT('done_owner', { u: nome, loja: ppAccName(accountId) }) : ppT('done_dealer', { u: nome });
  } catch (e) { meState.err = (e && e.message) || String(e); }
  meState.busy = false;
  meState.loaded = false;                       // Painel/Árvore releem na próxima abertura
  try { if (window.LegnoCentralPlus && typeof window.LegnoCentralPlus.recarregar === 'function') window.LegnoCentralPlus.recarregar(); } catch (e2) { /* a Central relê depois */ }
  await mePeopleLoad();
  meRender();
  if (meState.err) alert(meState.err);        // o aviso do topo pode estar fora da vista
}
// arrastar e soltar
function mePpDragStart(e) {
  const c = e.target.closest && e.target.closest('.pp-p[draggable="true"]');
  if (!c) return;
  if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('pp-mg') && c.contains(document.activeElement)) { e.preventDefault(); return; }
  meState.ppDrag = c.getAttribute('data-u');
  try { e.dataTransfer.setData('text/plain', meState.ppDrag); e.dataTransfer.effectAllowed = 'move'; } catch (er) { /* navegador antigo */ }
  c.classList.add('is-drag');
  const ov = document.getElementById('po-me'); if (ov) ov.classList.add('pp-dragging');
}
function mePpZona(e) { return meState.ppDrag && e.target.closest ? e.target.closest('.pp-drop') : null; }
function mePpDragOver(e) {
  const z = mePpZona(e);
  if (!z) return;
  e.preventDefault();
  try { e.dataTransfer.dropEffect = 'move'; } catch (er) { /* ok */ }
  if (!z.classList.contains('is-over')) { document.querySelectorAll('#po-me .pp-drop.is-over').forEach((x) => x.classList.remove('is-over')); z.classList.add('is-over'); }
}
function mePpDragLeave(e) {
  const z = e.target.closest && e.target.closest('.pp-drop');
  if (z && !z.contains(e.relatedTarget)) z.classList.remove('is-over');
}
function mePpDragEnd() {
  meState.ppDrag = null;
  const ov = document.getElementById('po-me'); if (ov) ov.classList.remove('pp-dragging');
  document.querySelectorAll('#po-me .pp-drop.is-over, #po-me .pp-p.is-drag').forEach((x) => x.classList.remove('is-over', 'is-drag'));
}
function mePpDrop(e) {
  const z = mePpZona(e);
  if (!z) return;
  e.preventDefault();
  const u = meState.ppDrag; const acc = z.getAttribute('data-acc');
  mePpDragEnd();
  if (!u || !acc) return;
  mePlace(u, acc === '_dealer' ? null : acc, ppModo(acc));
}
function mePpInput(e) {
  if (e.target.id !== 'pp-q') return;
  meState.peopleQ = e.target.value;
  const pos = e.target.selectionStart;
  meRender();
  const n = document.getElementById('pp-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* ok */ } }
}

// ============================================================
// + PESSOA NA LOJA (22/11/2026) — SÓ ADMIN (aba Pessoas)
// ============================================================
// Matt: "na árvore quero poder adicionar uma pessoa no meu time, deve preencher
// o cadastro dos dados básicos e criar um e-mail e senha pra essa pessoa...
// de cada loja". Botão "+ Pessoa" em cada loja da árvore → janela #pp-add.
// Passos do salvar (para no 1º erro e diz em qual ficou):
//   1. Edge Function dealer-create-seller { place_later:true } = cria o login
//      (e-mail + senha, já confirmado) com perfil 'cliente', sem loja;
//   2. RPC admin_place_user = põe na loja (vendedor; loja sem dealer = vira o
//      dealer dela — mesma regra de arrastar);
//   3. RPC set_member_kind = o tipo (salesperson, contractor…);
//   4. person_records = dados básicos (empresa, contato, telefone, cidade…).
// A senha aparece UMA vez no aviso final, pra você passar pra pessoa; o portal
// não guarda nem mostra de novo. Precisa da função publicada
// (publicar-funcao-vendedores.bat): a versão antiga ignora place_later e a
// pessoa nasceria como vendedor de quem criou — o passo 2 corrige do mesmo jeito.
// Regra de formulário: clicar fora NÃO fecha.
const PA_TXT = {
  pt: { btn: 'Pessoa', tip: 'Adicionar uma pessoa na loja {loja}', title: 'Nova pessoa em {loja}', sub_owner: 'Esta loja ainda não tem dealer: a pessoa criada vira o DEALER (dono) dela.', sub_seller: 'A pessoa entra na equipe desta loja e responde ao dealer dela.',
    h_login: 'Acesso ao portal', h_dados: 'Dados básicos', name: 'Nome completo *', email: 'E-mail (login) *', pass: 'Senha * (mín. 6)', gen: 'Gerar', kind: 'Tipo', phone: 'Telefone', company: 'Empresa', city: 'Cidade', state: 'Estado', notes: 'Observações',
    save: 'Criar pessoa', cancel: 'Cancelar', saving: 'Criando…', need: 'Preencha nome, e-mail e uma senha de pelo menos 6 caracteres.', q_discard: 'Fechar sem criar a pessoa?',
    done: 'Pessoa criada em {loja}.\n\nLogin: {email}\nSenha: {senha}\n\nAnote agora: a senha não aparece de novo. A pessoa pode trocar depois em "Esqueci a senha".',
    part: 'O login {email} FOI CRIADO, mas um passo seguinte falhou ({passo}):\n\n{erro}\n\nA pessoa aparece na árvore (em "Sem loja" se o passo foi o da loja) — complete por lá. Senha: {senha}', p2: 'pôr na loja', p3: 'tipo', p4: 'dados básicos' },
  en: { btn: 'Person', tip: 'Add a person to store {loja}', title: 'New person in {loja}', sub_owner: 'This store has no dealer yet: the person created becomes its DEALER (owner).', sub_seller: 'The person joins this store team and reports to its dealer.',
    h_login: 'Portal access', h_dados: 'Basic information', name: 'Full name *', email: 'E-mail (login) *', pass: 'Password * (min. 6)', gen: 'Generate', kind: 'Type', phone: 'Phone', company: 'Company', city: 'City', state: 'State', notes: 'Notes',
    save: 'Create person', cancel: 'Cancel', saving: 'Creating…', need: 'Fill in name, e-mail and a password with at least 6 characters.', q_discard: 'Close without creating the person?',
    done: 'Person created in {loja}.\n\nLogin: {email}\nPassword: {senha}\n\nWrite it down now: the password is not shown again. The person can change it later with "Forgot password".',
    part: 'The login {email} WAS CREATED, but a following step failed ({passo}):\n\n{erro}\n\nThe person shows in the tree (under "No store" if the store step failed) — finish it there. Password: {senha}', p2: 'place in store', p3: 'type', p4: 'basic information' },
  es: { btn: 'Persona', tip: 'Agregar una persona a la tienda {loja}', title: 'Nueva persona en {loja}', sub_owner: 'Esta tienda aún no tiene dealer: la persona creada será su DEALER (dueño).', sub_seller: 'La persona entra al equipo de esta tienda y responde a su dealer.',
    h_login: 'Acceso al portal', h_dados: 'Datos básicos', name: 'Nombre completo *', email: 'E-mail (login) *', pass: 'Contraseña * (mín. 6)', gen: 'Generar', kind: 'Tipo', phone: 'Teléfono', company: 'Empresa', city: 'Ciudad', state: 'Estado', notes: 'Observaciones',
    save: 'Crear persona', cancel: 'Cancelar', saving: 'Creando…', need: 'Complete nombre, e-mail y una contraseña de al menos 6 caracteres.', q_discard: '¿Cerrar sin crear la persona?',
    done: 'Persona creada en {loja}.\n\nLogin: {email}\nContraseña: {senha}\n\nAnótela ahora: la contraseña no se muestra de nuevo.',
    part: 'El login {email} FUE CREADO, pero un paso siguiente falló ({passo}):\n\n{erro}\n\nLa persona aparece en el árbol — complete allí. Contraseña: {senha}', p2: 'poner en la tienda', p3: 'tipo', p4: 'datos básicos' }
};
function paT(k, v) { const L = PA_TXT[String(meLang()).slice(0, 2)] || PA_TXT.en; let t = L[k] != null ? L[k] : (PA_TXT.en[k] || k); Object.keys(v || {}).forEach((x) => { t = t.split('{' + x + '}').join(v[x] == null ? '' : String(v[x])); }); return t; }
function paSenha() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; const buf = new Uint32Array(10);
  (window.crypto || window.msCrypto).getRandomValues(buf);
  return Array.from(buf).map((n) => abc[n % abc.length]).join('');
}
function mePpAddOpen(accId) {
  if (!meIsAdmin() || !accId) return;
  meCss();
  const loja = ppAccName(accId); const modo = ppModo(accId);
  let ov = document.getElementById('pp-add');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'pp-add';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10002;display:flex;align-items:flex-start;justify-content:center;padding:24px 12px;overflow:auto';
    ov.addEventListener('click', (e) => {
      if (e.target.closest('[data-pa="close"]')) { if (ov.dataset.sujo === '1' && !confirm(paT('q_discard'))) return; ov.remove(); return; }
      if (e.target.closest('[data-pa="gen"]')) { const i = ov.querySelector('#pa-pass'); if (i) { i.value = paSenha(); ov.dataset.sujo = '1'; } return; }
      if (e.target.closest('[data-pa="save"]')) return mePpAddSave(ov);
    });
    ov.addEventListener('input', () => { ov.dataset.sujo = '1'; });
    document.body.appendChild(ov);
  }
  ov.dataset.acc = accId; ov.dataset.sujo = '';
  const f = (id, rot, extra, cls) => '<label class="pc-f' + (cls ? ' ' + cls : '') + '">' + mEsc(rot) + '<input id="' + id + '" ' + (extra || 'type="text"') + ' autocomplete="off"></label>';
  ov.innerHTML = '<div class="pc-box" role="dialog" aria-modal="true" style="max-width:720px">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><h3 style="margin:0">' + mEsc(paT('title', { loja })) + '</h3>'
    + '<p class="hint" style="margin:4px 0 0">' + mEsc(paT(modo === 'owner' ? 'sub_owner' : 'sub_seller')) + '</p></div>'
    + '<button type="button" class="secondary" data-pa="close" style="margin:0;width:auto">×</button></div>'
    + '<p class="error pa-err" style="display:none"></p>'
    + '<h4>' + mEsc(paT('h_login')) + '</h4><div class="pc-grid">'
    + f('pa-name', paT('name'), '', 'w2') + f('pa-email', paT('email'), 'type="email"', 'w2')
    + '<label class="pc-f w2">' + mEsc(paT('pass')) + '<span style="display:flex;gap:6px"><input id="pa-pass" type="text" autocomplete="off" value="' + mEsc(paSenha()) + '"><button type="button" class="secondary" data-pa="gen" style="margin:0;width:auto;white-space:nowrap">' + mEsc(paT('gen')) + '</button></span></label>'
    + '<label class="pc-f w2">' + mEsc(paT('kind')) + '<select id="pa-kind">' + PP_KINDS.map((k) => '<option value="' + k + '">' + mEsc(ppT('k_' + k) !== 'k_' + k ? ppT('k_' + k) : k) + '</option>').join('') + '</select></label>'
    + '</div><h4>' + mEsc(paT('h_dados')) + '</h4><div class="pc-grid">'
    + f('pa-phone', paT('phone'), 'type="tel"', 'w2') + f('pa-company', paT('company'), '', 'w2')
    + f('pa-city', paT('city'), '', 'w2') + f('pa-state', paT('state')) + '<span></span>'
    + '<label class="pc-f" style="grid-column:1/-1">' + mEsc(paT('notes')) + '<input id="pa-notes" type="text" autocomplete="off"></label>'
    + '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">'
    + '<button type="button" class="secondary" data-pa="close" style="margin:0;width:auto">' + mEsc(paT('cancel')) + '</button>'
    + '<button type="button" data-pa="save" style="margin:0;width:auto">' + mEsc(paT('save')) + '</button></div></div>';
  const n = ov.querySelector('#pa-name'); if (n) n.focus();
}
async function mePpAddSave(ov) {
  if (ov.dataset.busy === '1') return;
  const v = (id) => ((ov.querySelector('#' + id) || {}).value || '').trim();
  const accId = ov.dataset.acc; const loja = ppAccName(accId);
  const full_name = v('pa-name'); const email = v('pa-email').toLowerCase(); const password = (ov.querySelector('#pa-pass') || {}).value || '';
  const errEl = ov.querySelector('.pa-err'); const btn = ov.querySelector('[data-pa="save"]');
  const erro = (m) => { if (errEl) { errEl.textContent = m; errEl.style.display = 'block'; } };   // NÃO redesenha: o digitado fica
  if (!full_name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) return erro(paT('need'));
  ov.dataset.busy = '1'; if (errEl) errEl.style.display = 'none'; if (btn) { btn.disabled = true; btn.textContent = paT('saving'); }
  let userId = null; let passo = '';
  try {
    const { data, error } = await supabaseClient.functions.invoke('dealer-create-seller', { body: { full_name, email, password, place_later: true } });
    const msg = await meFnError(error, data);
    if (msg) throw new Error(msg);
    userId = data && data.user_id;
    if (!userId) throw new Error('user_id');
    passo = 'p2';
    const r2 = await supabaseClient.rpc('admin_place_user', { p_user: userId, p_account: accId, p_mode: ppModo(accId), p_move_data: false });
    if (r2.error) throw r2.error;
    passo = 'p3';
    const kind = v('pa-kind');
    if (kind && kind !== 'salesperson') { const r3 = await supabaseClient.rpc('set_member_kind', { p_user: userId, p_kind: kind }); if (r3.error) throw r3.error; }
    passo = 'p4';
    const dados = { contact_name: full_name, phone: v('pa-phone') || null, company_name: v('pa-company') || null, city: v('pa-city') || null, state: v('pa-state') || null, notes: v('pa-notes') || null, billing_email: email };
    const r4 = await supabaseClient.from('person_records').upsert(Object.assign({ user_id: userId }, dados), { onConflict: 'user_id' });
    if (r4.error) throw r4.error;
    ov.remove();
    alert(paT('done', { loja, email, senha: password }));
  } catch (er) {
    const m = (er && er.message) || String(er);
    if (!userId) { erro(m); ov.dataset.busy = ''; if (btn) { btn.disabled = false; btn.textContent = paT('save'); } return; }
    ov.remove();
    alert(paT('part', { email, passo: paT(passo), erro: m, senha: password }));
  }
  meState.loaded = false;
  try { await mePeopleLoad(); } catch (e2) { /* a árvore recarrega no próximo abrir */ }
  meRender();
}

window.LegnoMinhaEmpresa = { cadastro: mePersonOpen, tipoHtml: (uid, k) => { meCss(); return meKindSelect(uid, k); }, abrir: openMyCompany, ligado: meOn, marcarPerdido: markProjectsLost, reabrir: reopenLostProjects, motivo: (r) => mT('r_' + (r || 'null')) };
