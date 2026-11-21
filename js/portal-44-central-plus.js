// ============================================================
// CENTRAL DE PEDIDOS — etiqueta/ambiente/obra na linha, liberar na linha,
// preço tabela/desconto/líquido, PERDIDOS, MAPA das obras e REDE (coluna LOJA)
// (20/11/2026, Etapa 3; migrations 306–308)
// ============================================================
// Matt, 20/11: "quero que na central de pedidos o pedido entre já com o
// cadastro dele pra todos os pedidos, ele só digita o nome do PO que ele
// deseja, ambiente e endereço da obra. quero um mapa em uma aba separada
// mostrando todas as obras com pinos com legendas por status. Quero eu como
// administrador fábrica... ver um campo novo LOJA com cada loja cadastrada.
// quero que na central ele libere o pedido com botão na própria central...
// 'nome da etiqueta (que é o PO que vai aparecer na etiqueta...)'. quero que
// o preço mostre de fábrica tabela e valor com desconto e valor em % do
// desconto aplicado." + "acrescenta perdido (motivos)".
//
// O QUE ACRESCENTA NA CENTRAL (a de pastas, modo central do portal-09):
//   1. Embaixo de cada pedido da pasta aberta: Nome da etiqueta (PO) ·
//      Ambiente · Endereço da obra (com sugestão enquanto digita) — grava ao
//      sair do campo — e TABELA | DESCONTO % | COM DESCONTO. Pedido pendente
//      ganha o botão "Liberar pra fábrica" (aprova na hora; o cadastro vem da
//      empresa, só exige etiqueta e endereço).
//   2. Aba PERDIDOS + "Marcar como perdido" (com motivo) em cada projeto ou
//      pasta em construção; "Reabrir" na aba Perdidos.
//   3. Aba MAPA: um pino por obra, cor pela etapa, legenda clicável.
//   4. Aba LOJAS (quem tem algo abaixo: fábrica, distribuidor, dono com
//      equipe): todos os pedidos que eu enxergo, com a coluna LOJA, filtros e
//      os 3 preços. Admin libera produção/coleta na própria linha.
//
// NÃO EDITA o portal-09: embrulha cuAfterRender (desenho), cuRows (tira os
// perdidos das outras abas) e mpLoad (zera os caches daqui). po_name JÁ é o
// que sai na etiqueta (erp/js/machine-export.js e etiqueta-modulo.js).
// Endereço → coordenada e sugestões: Photon (OpenStreetMap, grátis, sem
// chave). Mapa: Leaflet (CDN, baixado só ao abrir a aba).
//
// EM TESTE: CX_SO_ADMIN = true (só administrador). Liberar: false — e a
// Central unificada do portal-09 também precisa estar liberada (CU_SO_ADMIN).
// Sem a migration 306 este arquivo não faz nada, sem barulho.
//
// Carregado depois do portal-43.

const CX_SO_ADMIN = true;
const CX_PHOTON = 'https://photon.komoot.io/api/';
const CX_LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet';
const CX_STAGES = ['wait', 'pay', 'prod', 'ready', 'done'];
const CX_NET_STAGES = ['build', 'wait', 'pay', 'prod', 'ready', 'done'];
const CX_COLORS = { build: '#a8a29a', wait: '#c58a2b', pay: '#7b6fd0', prod: '#2d7fc1', ready: '#12a37f', done: '#6b7280' };
const cxState = {
  off: false, view: '', extra: {}, extraFor: '', extraBusy: false, lost: {}, lostLoaded: false, lostBusy: false,
  acc: null, accLoaded: false, sug: {}, sugTimer: null, saving: {}, msg: {}, scope: null, scopeBusy: false,
  net: { fab: false, own: false, hoje: false, periodo: '', gstatus: '', loja: '', user: '', cliente: '', etapa: '', q: '' }, netInit: false, colScroll: {}, accNames: {}, totalsFor: -1, colQ: { loja: '', user: '', cliente: '' }, colOpen: '', draft: {}, hasNet: null, mapEl: null, map: null, mapLayer: null, mapHide: {}, geoBusy: false
};

function cxOn() {
  if (cxState.off) return false;
  if (!CX_SO_ADMIN) return true;
  return window.LEGNO_IS_ADMIN === true || (typeof mpAdminCache !== 'undefined' && mpAdminCache === true);
}
function cxAdmin() { return window.LEGNO_IS_ADMIN === true || (typeof mpAdminCache !== 'undefined' && mpAdminCache === true); }

const CX_TXT = {
  pt: {
    po: 'Nome da etiqueta (PO)', po_ph: 'como você quer achar na obra', room: 'Ambiente', room_ph: 'Cozinha, Master bath…', addr: 'Endereço da obra', addr_ph: 'rua, número, cidade, estado',
    list: 'Tabela', disc: 'Desconto', net: 'Com desconto', release: 'Liberar pra fábrica', releasing: 'Liberando…',
    need: 'Preencha o nome da etiqueta e o endereço da obra pra liberar.', confirm: 'Liberar o pedido "{po}" pra fábrica? Depois de liberado ele não pode mais ser alterado.',
    saved: 'salvo', released: 'Pedido liberado pra fábrica.', frozen: 'preço congelado na aprovação',
    t_lost: 'Perdidos', t_map: 'Mapa', t_net: 'Lojas',
    lost_mark: 'Marcar como perdido', lost_reopen: 'Reabrir projeto', lost_info: 'Perdido em {d} — {r}', lost_empty: 'Nenhum projeto perdido.',
    sv_title: 'Loja e PO do projeto', sv_hint: 'Projeto feito pela fábrica precisa ficar numa loja.', sv_store: 'Loja', sv_pick: '— escolha a loja —', sv_po: 'Nome da PO (sai na etiqueta)', sv_ok: 'Salvar', sv_cancel: 'Cancelar', sv_need: 'Escolha a loja e digite o nome da PO.', mv_change: 'trocar loja', mv_all: 'Passar os {n} pedidos desta lista pra…', mv_new: '+ Nova loja…', mv_new_q: 'Nome da nova loja (ex.: Legno Distribuição Orlando):', mv_confirm: 'Passar {n} pedido(s) pra "{loja}"?', s_build: 'Projeto em construção', tag_proj: 'projeto', est: 'est.', est_tip: 'Valor estimado do projeto (ainda não é pedido)', s_wait: 'Aguardando aprovação', s_pay: 'Aguardando liberação', s_prod: 'Em produção', s_ready: 'Liberado pra coleta', s_done: 'Entregue',
    map_none: 'Nenhuma obra com endereço localizado ainda.', map_locate: 'Localizar {n} endereço(s) no mapa', map_locating: 'Localizando… {i}/{n}', map_missing: '{n} pedido(s) sem endereço', loading: 'Carregando…',
    map_fail: 'Não deu pra carregar o mapa (sem internet pro mapa?).', open: 'Abrir pedido',
    c_no: 'Nº', c_store: 'Loja', c_po: 'Etiqueta (PO)', c_room: 'Ambiente', c_city: 'Obra', c_stage: 'Etapa', c_date: 'Data', c_who: 'Quem',
    col_factory: 'Fábrica', col_dealer: 'Dealer', col_seller: 'Vendedor', col_client: 'PO', no_po: '— sem PO —', col_all: 'Todos', col_find: 'buscar…', back_folders: '‹ Minhas pastas', today: 'Atualizados hoje', today_at: 'hoje', fl_all: 'Todos', fl_7: 'Últimos 7 dias', fl_30: 'Últimos 30 dias', fl_asc: 'Ordenar ↑', fl_desc: 'Ordenar ↓', fl_clear: 'Limpar filtros', lay_pastas: 'Ver por pastas', lay_lista: 'Ver lista numerada', c_item: 'Projeto / PO', col_pick: 'escolha à esquerda', matriz: 'Matriz', no_client: '— sem cliente —', f_all_stores: 'Todas as lojas', f_all_stages: 'Todas as etapas', f_search: 'Buscar PO, ambiente, endereço…', no_store: '— sem loja —', net_none: 'Nenhum pedido.',
    rel_prod: 'Liberar produção', rel_pick: 'Liberar coleta', rel_prod_q: 'Liberar o pedido {n} pra PRODUÇÃO?', rel_pick_q: 'Liberar o pedido {n} pra COLETA?', totals: '{n} pedido(s) · tabela {l} · com desconto {v}', fab_net: 'Fábrica c/ desc.', sale: 'Venda ao cliente', sum: 'Total ({n})'
  },
  en: {
    po: 'Label name (PO)', po_ph: 'how you will find it on site', room: 'Room', room_ph: 'Kitchen, Master bath…', addr: 'Job site address', addr_ph: 'street, number, city, state',
    list: 'List', disc: 'Discount', net: 'Net', release: 'Release to factory', releasing: 'Releasing…',
    need: 'Fill in the label name and the job site address to release.', confirm: 'Release order "{po}" to the factory? Once released it can no longer be changed.',
    saved: 'saved', released: 'Order released to the factory.', frozen: 'price frozen at approval',
    t_lost: 'Lost', t_map: 'Map', t_net: 'Stores',
    lost_mark: 'Mark as lost', lost_reopen: 'Reopen project', lost_info: 'Lost on {d} — {r}', lost_empty: 'No lost projects.',
    sv_title: 'Project store and PO', sv_hint: 'A project made by the factory must belong to a store.', sv_store: 'Store', sv_pick: '— choose the store —', sv_po: 'PO name (goes on the label)', sv_ok: 'Save', sv_cancel: 'Cancel', sv_need: 'Choose the store and type the PO name.', mv_change: 'change store', mv_all: 'Move the {n} orders in this list to…', mv_new: '+ New store…', mv_new_q: 'Name of the new store (e.g. Legno Distribution Orlando):', mv_confirm: 'Move {n} order(s) to "{loja}"?', s_build: 'Project in design', tag_proj: 'project', est: 'est.', est_tip: 'Estimated project value (not an order yet)', s_wait: 'Waiting approval', s_pay: 'Waiting release', s_prod: 'In production', s_ready: 'Ready for pickup', s_done: 'Delivered',
    map_none: 'No job site located yet.', map_locate: 'Locate {n} address(es) on the map', map_locating: 'Locating… {i}/{n}', map_missing: '{n} order(s) with no address', loading: 'Loading…',
    map_fail: 'Could not load the map.', open: 'Open order',
    c_no: 'No.', c_store: 'Store', c_po: 'Label (PO)', c_room: 'Room', c_city: 'Job site', c_stage: 'Stage', c_date: 'Date', c_who: 'Who',
    col_factory: 'Factory', col_dealer: 'Dealer', col_seller: 'Salesperson', col_client: 'PO', no_po: '— no PO —', col_all: 'All', col_find: 'search…', back_folders: '‹ My folders', today: 'Updated today', today_at: 'today', fl_all: 'All', fl_7: 'Last 7 days', fl_30: 'Last 30 days', fl_asc: 'Sort ↑', fl_desc: 'Sort ↓', fl_clear: 'Clear filters', lay_pastas: 'View as folders', lay_lista: 'View numbered list', c_item: 'Project / PO', col_pick: 'pick on the left', matriz: 'Headquarters', no_client: '— no client —', f_all_stores: 'All stores', f_all_stages: 'All stages', f_search: 'Search PO, room, address…', no_store: '— no store —', net_none: 'No orders.',
    rel_prod: 'Release production', rel_pick: 'Release pickup', rel_prod_q: 'Release order {n} to PRODUCTION?', rel_pick_q: 'Release order {n} for PICKUP?', totals: '{n} order(s) · list {l} · net {v}', fab_net: 'Factory net', sale: 'Client price', sum: 'Total ({n})'
  },
  es: {
    po: 'Nombre de etiqueta (PO)', po_ph: 'cómo lo encontrará en la obra', room: 'Ambiente', room_ph: 'Cocina, baño principal…', addr: 'Dirección de la obra', addr_ph: 'calle, número, ciudad, estado',
    list: 'Lista', disc: 'Descuento', net: 'Con descuento', release: 'Liberar a fábrica', releasing: 'Liberando…',
    need: 'Complete el nombre de etiqueta y la dirección de la obra para liberar.', confirm: '¿Liberar el pedido "{po}" a la fábrica? Después no se puede modificar.',
    saved: 'guardado', released: 'Pedido liberado a la fábrica.', frozen: 'precio congelado en la aprobación',
    t_lost: 'Perdidos', t_map: 'Mapa', t_net: 'Tiendas',
    lost_mark: 'Marcar como perdido', lost_reopen: 'Reabrir proyecto', lost_info: 'Perdido el {d} — {r}', lost_empty: 'Ningún proyecto perdido.',
    sv_title: 'Tienda y PO del proyecto', sv_hint: 'Un proyecto hecho por la fábrica debe pertenecer a una tienda.', sv_store: 'Tienda', sv_pick: '— elija la tienda —', sv_po: 'Nombre de la PO (va en la etiqueta)', sv_ok: 'Guardar', sv_cancel: 'Cancelar', sv_need: 'Elija la tienda y escriba el nombre de la PO.', mv_change: 'cambiar tienda', mv_all: 'Pasar los {n} pedidos de esta lista a…', mv_new: '+ Nueva tienda…', mv_new_q: 'Nombre de la nueva tienda:', mv_confirm: '¿Pasar {n} pedido(s) a "{loja}"?', s_build: 'Proyecto en desarrollo', tag_proj: 'proyecto', est: 'est.', est_tip: 'Valor estimado del proyecto (aún no es pedido)', s_wait: 'Esperando aprobación', s_pay: 'Esperando liberación', s_prod: 'En producción', s_ready: 'Listo para retiro', s_done: 'Entregado',
    map_none: 'Ninguna obra ubicada todavía.', map_locate: 'Ubicar {n} dirección(es) en el mapa', map_locating: 'Ubicando… {i}/{n}', map_missing: '{n} pedido(s) sin dirección', loading: 'Cargando…',
    map_fail: 'No se pudo cargar el mapa.', open: 'Abrir pedido',
    c_no: 'Nº', c_store: 'Tienda', c_po: 'Etiqueta (PO)', c_room: 'Ambiente', c_city: 'Obra', c_stage: 'Etapa', c_date: 'Fecha', c_who: 'Quién',
    col_factory: 'Fábrica', col_dealer: 'Dealer', col_seller: 'Vendedor', col_client: 'PO', no_po: '— sin PO —', col_all: 'Todos', col_find: 'buscar…', back_folders: '‹ Mis carpetas', today: 'Actualizados hoy', today_at: 'hoy', fl_all: 'Todos', fl_7: 'Últimos 7 días', fl_30: 'Últimos 30 días', fl_asc: 'Ordenar ↑', fl_desc: 'Ordenar ↓', fl_clear: 'Limpiar filtros', lay_pastas: 'Ver por carpetas', lay_lista: 'Ver lista numerada', c_item: 'Proyecto / PO', col_pick: 'elija a la izquierda', matriz: 'Matriz', no_client: '— sin cliente —', f_all_stores: 'Todas las tiendas', f_all_stages: 'Todas las etapas', f_search: 'Buscar PO, ambiente, dirección…', no_store: '— sin tienda —', net_none: 'Ningún pedido.',
    rel_prod: 'Liberar producción', rel_pick: 'Liberar retiro', rel_prod_q: '¿Liberar el pedido {n} a PRODUCCIÓN?', rel_pick_q: '¿Liberar el pedido {n} para RETIRO?', totals: '{n} pedido(s) · lista {l} · con descuento {v}', fab_net: 'Fábrica c/ desc.', sale: 'Venta al cliente', sum: 'Total ({n})'
  }
};
function cxLang() { try { const l = (typeof I18n !== 'undefined' && I18n.getLanguage) ? I18n.getLanguage() : 'en'; return CX_TXT[l] ? l : 'en'; } catch (e) { return 'en'; } }
function cT(k, vars) {
  let s = CX_TXT[cxLang()][k]; if (s == null) s = CX_TXT.en[k]; if (s == null) s = k;
  if (vars) Object.keys(vars).forEach((v) => { s = s.split('{' + v + '}').join(vars[v] == null ? '' : vars[v]); });
  return s;
}
function cEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function cMoney(v) { return '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function cDate(d) { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : x.toLocaleDateString(cxLang() === 'pt' ? 'pt-BR' : cxLang() === 'es' ? 'es' : 'en-US', { year: '2-digit', month: 'short', day: '2-digit' }); }
function cxMe() { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null; }
function cxSeller() { return typeof isSellerAccount === 'function' && isSellerAccount(); }
function cxStage(o) {
  if (o.status === 'delivered') return 'done';
  if (o.status === 'submitted') return 'wait';
  if (o.pickup_released_at) return 'ready';
  if (o.finance_released_at) return 'prod';
  return 'pay';
}

// ---------- dados extras dos MEUS pedidos (colunas da migration 306) ----------
async function cxLoadExtra() {
  const ids = Object.keys(mpState.ordersById || {});
  const chave = ids.length + ':' + ids.slice(0, 3).join(',') + ':' + mpState.loadSeq;
  if (cxState.extraBusy || cxState.extraFor === chave) return;
  cxState.extraBusy = true;
  const extra = {};
  try {
    if (!ids.length) { // sem pedido nenhum: só confere se as colunas da 306 existem
      const probe = await supabaseClient.from('orders').select('id, room_name').limit(1);
      if (probe.error) throw probe.error;
    }
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabaseClient.from('orders')
        .select('id, room_name, jobsite_lat, jobsite_lng, price_list_total, price_discount_pct, price_net_total, account_id').in('id', ids.slice(i, i + 150));
      if (error) throw error;
      (data || []).forEach((r) => { extra[r.id] = r; });
    }
    if (!cxState.accLoaded) {
      cxState.accLoaded = true;
      try {
        const { data: card } = await supabaseClient.rpc('my_account_card');
        if (card && ['owner', 'manager', 'finance'].includes(card.role)) {
          const { data: a } = await supabaseClient.from('accounts').select('id, trade_name, legal_name, phone, billing_email, factory_discount_pct, status').eq('id', card.id).maybeSingle();
          cxState.acc = a || null;
        } else cxState.acc = card ? { id: card.id, trade_name: card.trade_name, legal_name: card.legal_name, _semDesconto: true } : null;
      } catch (e) { cxState.acc = null; }
    }
    cxState.extra = extra; cxState.extraFor = chave;
  } catch (e) {
    cxState.off = true; // sem a migration 306: este arquivo se desliga
  }
  cxState.extraBusy = false;
  if (!cxState.off && typeof mpRender === 'function') mpRender();
}
async function cxLoadLost() {
  if (cxState.lostBusy || cxState.lostLoaded) return;
  cxState.lostBusy = true;
  const lost = {};
  try {
    const { data, error } = await supabaseClient.from('user_projects').select('id, lost_at, lost_reason, lost_note')
      .eq('client_user_id', cxMe()).not('lost_at', 'is', null);
    if (error) throw error;
    (data || []).forEach((r) => { lost[r.id] = r; });
  } catch (e) { /* sem a coluna: nenhum perdido */ }
  const mudou = Object.keys(lost).length !== Object.keys(cxState.lost).length;
  cxState.lost = lost; cxState.lostLoaded = true; cxState.lostBusy = false;
  if ((mudou || cxState.view === 'lost') && typeof mpRender === 'function') mpRender();
}

// ---------- faixa embaixo de cada pedido ----------
function cxPrice(o) {
  const x = cxState.extra[o.id] || {};
  if (x.price_list_total != null) return { list: Number(x.price_list_total), disc: Number(x.price_discount_pct || 0), net: Number(x.price_net_total || 0), frozen: true };
  const t = mpState.totals[o.id];
  if (t == null) return null;
  const d = cxState.acc && !cxState.acc._semDesconto ? Number(cxState.acc.factory_discount_pct || 0) : 0;
  return { list: Number(t), disc: d, net: Math.round(Number(t) * (1 - d / 100) * 100) / 100, frozen: false };
}
function cxPriceHtml(o) {
  if (cxSeller() || o.order_type === 'cutting_list') return '';
  if (cxState.acc && cxState.acc._semDesconto && !(cxState.extra[o.id] || {}).price_list_total) return '';
  const p = cxPrice(o);
  if (!p) return '';
  return '<div class="cx-price"' + (p.frozen ? ' title="' + cEsc(cT('frozen')) + '"' : '') + '><span>' + cEsc(cT('list')) + ' <b>' + cEsc(cMoney(p.list)) + '</b></span>'
    + '<span>' + cEsc(cT('disc')) + ' <b>' + p.disc + '%</b></span><span class="cx-net">' + cEsc(cT('net')) + ' <b>' + cEsc(cMoney(p.net)) + '</b></span></div>';
}
function cxStripHtml(o) {
  const x = cxState.extra[o.id] || {};
  const meu = o.client_user_id ? o.client_user_id === cxMe() : true;
  const edita = meu && o.status === 'submitted' && o.order_type !== 'cutting_list' && !(typeof isRetailClientAccount === 'function' && isRetailClientAccount());
  const msg = cxState.msg[o.id] ? '<span class="cx-st ' + (cxState.msg[o.id].err ? 'err' : 'ok') + '">' + cEsc(cxState.msg[o.id].t) + '</span>' : '';
  if (!edita) {
    const partes = [o.po_name, x.room_name, o.delivery_address].filter((v) => String(v || '').trim());
    const pr = cxPriceHtml(o);
    if (!partes.length && !pr) return '';
    return '<div class="cx-strip ro" data-cx-order="' + cEsc(o.id) + '"><div class="cx-ro">' + partes.map((v, i) => '<span' + (i === 0 ? ' class="cx-po"' : '') + '>' + cEsc(v) + '</span>').join('<i>·</i>') + '</div>' + pr + '</div>';
  }
  const dr = cxState.draft[o.id] || {};
  const f = (k, v, rot, ph, extra) => '<label class="cx-f cx-' + k + '"><span>' + cEsc(rot) + '</span><input type="text" data-cx-f="' + k + '" value="' + cEsc(dr[k] != null ? dr[k] : (v || '')) + '" placeholder="' + cEsc(ph) + '" autocomplete="off"' + (extra || '') + '></label>';
  return '<div class="cx-strip" data-cx-order="' + cEsc(o.id) + '">'
    + f('po_name', o.po_name, cT('po'), cT('po_ph'), ' maxlength="60"') + f('room_name', x.room_name, cT('room'), cT('room_ph'), ' maxlength="60"')
    + f('delivery_address', o.delivery_address, cT('addr'), cT('addr_ph'), ' list="cx-dl-' + cEsc(o.id) + '"') + '<datalist id="cx-dl-' + cEsc(o.id) + '"></datalist>'
    + cxPriceHtml(o)
    + '<div class="cx-go"><button type="button" data-cx="release" data-id="' + cEsc(o.id) + '"' + (cxState.saving[o.id] ? ' disabled' : '') + '>' + cEsc(cxState.saving[o.id] === 'rel' ? cT('releasing') : cT('release')) + '</button>' + msg + '</div></div>';
}

// ---------- abas extras + decoração (roda depois de cada desenho da Central) ----------
function cxHasNetwork() { return cxAdmin() || cxState.hasNet === true; }
// barato (2 RPCs, uma vez): tem loja abaixo de mim ou colega na empresa?
async function cxLoadNetFlag() {
  if (cxState.hasNet !== null) return;
  cxState.hasNet = false;
  try {
    const tr = await supabaseClient.rpc('account_tree');
    const tm = await supabaseClient.rpc('account_team');
    (tr.data || []).forEach((a) => { cxState.accNames[a.id] = a.trade_name || a.legal_name || ''; });
    const lojas = (tr.data || []).filter((a) => a.kind !== 'factory').length;
    cxState.hasNet = lojas > 1 || (tm.data || []).length > 1;
  } catch (e) { cxState.hasNet = false; }
  if (typeof mpRender === 'function' && typeof mpState !== 'undefined' && mpState.central) mpRender();
}
function cxNetSel() { const f = cxState.net; return !!(f.fab || f.loja || f.user || f.cliente); }
function cxDecorate(folders) {
  if (!cxOn() || typeof mpState === 'undefined' || !mpState.central) return;
  const box = (typeof mpBox === 'function') ? mpBox() : document.getElementById('po-mp-v2');
  if (!box) return;
  cxCss();
  if (cxState.extraFor === '' || Object.keys(mpState.ordersById || {}).some((id) => !(id in cxState.extra))) cxLoadExtra();
  if (!cxState.lostLoaded) cxLoadLost();
  if (cxState.hasNet === null) cxLoadNetFlag();

  // abas (20/11, Matt: "esse do primeiro filtro pode tirar" = Delivered; a etapa Entregue fica nos filtros de baixo)
  box.querySelectorAll('.cu-tabs [data-act="ctab"][data-tab="done"]').forEach((el) => { el.style.display = 'none'; });
  const tabs = box.querySelector('.cu-tabs');
  if (tabs && !tabs.querySelector('[data-cx="view"]')) {
    const nLost = Object.keys(cxState.lost).length;
    const b = (v, rot) => '<button type="button" class="mp-tab cu-tab cx-tab' + (cxState.view === v ? ' is-on' : '') + '" data-cx="view" data-v="' + v + '">' + cEsc(rot) + '</button>';
    tabs.insertAdjacentHTML('beforeend', b('lost', cT('t_lost') + ' (' + nLost + ')') + b('map', cT('t_map')));
    if (cxState.view) tabs.querySelectorAll('[data-act="ctab"]').forEach((el) => el.classList.remove('is-on'));
  }

  // faixa por pedido (pasta aberta)
  box.querySelectorAll('.cu-order[data-order]').forEach((el) => {
    const o = mpState.ordersById[el.dataset.order];
    if (!o || (el.nextElementSibling && el.nextElementSibling.classList.contains('cx-strip'))) return;
    const html = cxStripHtml(o);
    if (html) el.insertAdjacentHTML('afterend', html);
  });

  // "Marcar como perdido" / "Reabrir" nos projetos em construção
  box.querySelectorAll('.mp-exp-box.cu-build').forEach((el) => {
    if (el.nextElementSibling && el.nextElementSibling.classList.contains('cx-lostbar')) return;
    const exp = el.closest('tr.mp-exp');
    const row = exp ? exp.previousElementSibling : null;
    const f = row && typeof mpFolderByKey === 'function' ? mpFolderByKey(row.dataset.k) : null;
    if (!f || !(f.lista || []).length) return;
    const ids = f.lista.map((p) => p.id);
    const perdido = cxState.view === 'lost';
    let info = '';
    if (perdido) {
      const l = cxState.lost[ids[0]] || {};
      const motivo = (window.LegnoMinhaEmpresa && window.LegnoMinhaEmpresa.motivo) ? window.LegnoMinhaEmpresa.motivo(l.lost_reason) : (l.lost_reason || '');
      info = '<span class="hint">' + cEsc(cT('lost_info', { d: cDate(l.lost_at), r: motivo })) + (l.lost_note ? ' — “' + cEsc(l.lost_note) + '”' : '') + '</span>';
    }
    el.insertAdjacentHTML('afterend', '<div class="cx-lostbar">' + info + '<button type="button" class="secondary" data-cx="' + (perdido ? 'reopen' : 'lost') + '" data-ids="' + cEsc(ids.join(',')) + '" data-nome="' + cEsc(f.titulo || '') + '">'
      + cEsc(cT(perdido ? 'lost_reopen' : 'lost_mark')) + '</button></div>');
  });

  // ÁRVORE NA PRÓPRIA CENTRAL (20/11, Matt: "quero colocar a aba store na
  // própria aba central. subir os 2 preços, desconto e nome da loja. a árvore
  // só enxerga do seu nível pra baixo"). Em cima da lista: Fábrica › Dealer ›
  // Vendedor › Cliente final. Nada escolhido = as MINHAS pastas (com as
  // colunas Loja/Tabela/Desconto/Com desconto); escolheu um nível = a lista de
  // pedidos daquele nível pra baixo, no lugar das pastas.
  // ADMIN = FÁBRICA: abre vendo TUDO de todas as lojas, o mais recente em cima
  // (20/11, Matt: "eu como administrador quero ver os projetos atualizados hoje
  // por todos os lojistas, porque como eu sou fábrica eu enxergo tudo"). As
  // pastas da conta dele ficam em "‹ Minhas pastas".
  // Vale pra QUALQUER nível que tenha algo abaixo (20/11, Matt: "essa regra serve
  // pra qualquer nível, desde que o nível só enxergue dele pra baixo"): o
  // distribuidor abre vendo as lojas dele, o dono da loja vê a equipe. O corte
  // é do banco (visible_user_ids / account_tree), não desta tela.
  if (cxHasNetwork() && !cxState.netInit) { cxState.netInit = true; cxState.net.fab = true; }
  const comArvore = cxHasNetwork() && cxState.view !== 'map' && cxState.view !== 'lost';
  // ADMIN nunca vê "as pastas dele": só o total de todos (20/11, Matt: "só com 144
  // projetos do matheus, eles precisam zerar e pro administrador só deve aparecer
  // o total de todos"). O que ainda está no login dele aparece em Dealer › sem loja.
  if (cxAdmin()) { cxState.net.own = false; cxState.net.fab = true; }
  const lista = comArvore && (cxNetSel() || cxAdmin());
  if (comArvore) {
    if (!cxState.scope && !cxState.scopeBusy) cxLoadScope(false);
    const bar = box.querySelector('.cu-bar');
    if (bar && !box.querySelector('#cx-tree')) {
      bar.insertAdjacentHTML('afterend', '<div id="cx-tree">' + (cxState.scope ? cxTreeCols() : '<p class="hint">' + cEsc(cT('loading')) + '</p>') + '</div>');
      ['loja', 'user', 'cliente'].forEach(cxColFilter);
      box.querySelectorAll('#cx-tree .cx-col-b').forEach((el) => { const k = el.getAttribute('data-cx-colb') || 'fab'; if (cxState.colScroll[k]) el.scrollTop = cxState.colScroll[k]; });
    }
    if (lista) {
      // abas normais acompanham a lista: marcada a que bate com o filtro e, pro admin, com a contagem de todo mundo
      const f = cxState.net; const marcada = { '': 'all', build: 'build', _orders: 'prod', done: 'done' }[f.etapa];
      const base = cxState.scope ? cxState.scope.orders : null;
      const conta = { all: (o) => true, build: (o) => o._s === 'build', prod: (o) => ['wait', 'pay', 'prod', 'ready'].includes(o._s), done: (o) => o._s === 'done' };
      box.querySelectorAll('[data-act="ctab"]').forEach((el) => {
        const t = el.dataset.tab;
        el.classList.toggle('is-on', !f.loja && !f.user && !f.cliente && marcada === t);
        const n = el.querySelector('.cu-n');
        if (n && conta[t]) n.textContent = base ? base.filter(conta[t]).length : '…'; // nunca a contagem só da conta de quem olha
      });
    }
  }
  try { cxAddCols(box, folders); } catch (e) { console.warn('[central+] colunas', e); }

  // painel do mapa / lista da árvore no lugar da tabela
  const painel = cxState.view === 'map' || lista;
  box.querySelectorAll('.mp-table-wrap, .mp-empty').forEach((el) => { if (!el.closest('#cx-panel')) el.style.display = painel ? 'none' : ''; });
  if (cxState.view === 'lost' && !box.querySelector('.mp-table-wrap')) { const e = box.querySelector('.mp-empty'); if (e) e.textContent = cT('lost_empty'); }
  if (painel) {
    if (!cxState.scope && !cxState.scopeBusy) cxLoadScope(false);
    let p = box.querySelector('#cx-panel');
    if (!p) { p = document.createElement('div'); p.id = 'cx-panel'; box.appendChild(p); }
    if (cxState.view === 'map') cxRenderMap(p); else cxRenderNet(p);
  }
}
// Colunas LOJA | TABELA | DESCONTO | COM DESCONTO na lista de pastas.
function cxAddCols(box, folders) {
  const tabela = box.querySelector('.mp-table-wrap > table.mp-table:not(.cx-table)');
  if (!tabela || tabela.dataset.cxCols) return;
  tabela.dataset.cxCols = '1';
  const preco = !cxSeller();
  // valores dos pedidos ainda sem a foto do preço (uma busca por carga)
  if (preco && cxState.totalsFor !== mpState.loadSeq && typeof cuEnsureTotals === 'function') {
    cxState.totalsFor = mpState.loadSeq;
    const falta = Object.values(mpState.ordersById || {}).filter((o) => o.order_type !== 'cutting_list' && mpState.totals[o.id] == null);
    if (falta.length) cuEnsureTotals(falta);
  }
  const hr = tabela.querySelector('thead tr');
  if (!hr || hr.children.length < 6) return;
  const th = (t, r) => '<th' + (r ? ' class="cx-r"' : '') + '>' + cEsc(t) + '</th>';
  hr.children[1].insertAdjacentHTML('afterend', th(cT('c_store')));
  if (preco) hr.children[5].insertAdjacentHTML('afterend', th(cT('list'), 1) + th(cT('disc'), 1) + th(cT('net'), 1));
  const porChave = {}; (folders || []).forEach((f) => { porChave[f.key] = f; });
  const minha = cxState.acc ? (cxState.acc.trade_name || cxState.acc.legal_name || '') : '';
  tabela.querySelectorAll('tbody > tr.mp-row').forEach((tr) => {
    const f = porChave[tr.dataset.k];
    let loja = minha, l = null, n = null, d = null;
    if (f && f.kind === 'orders') {
      let sl = 0, sn = 0, tem = false, falta = false;
      (f.orders || []).forEach((o) => {
        const x = cxState.extra[o.id] || {};
        if (x.account_id && cxState.accNames[x.account_id]) loja = cxState.accNames[x.account_id];
        if (o.order_type === 'cutting_list') return;
        const p = cxPrice(o);
        if (!p) { falta = true; return; }
        tem = true; sl += p.list; sn += p.net;
      });
      if (tem && !falta) { l = sl; n = sn; d = sl > 0 ? Math.round((1 - sn / sl) * 1000) / 10 : 0; }
    }
    if (tr.children[1]) tr.children[1].insertAdjacentHTML('afterend', '<td class="cx-loja">' + (loja ? cEsc(loja) : '—') + '</td>');
    if (preco && tr.children[5]) tr.children[5].insertAdjacentHTML('afterend',
      '<td class="cx-r">' + (l != null ? cEsc(cMoney(l)) : '—') + '</td><td class="cx-r">' + (d != null ? d + '%' : '—') + '</td><td class="cx-r"><b>' + (n != null ? cEsc(cMoney(n)) : '—') + '</b></td>');
  });
  const nCols = hr.children.length;
  tabela.querySelectorAll('tbody > tr.mp-exp > td[colspan]').forEach((td) => { td.setAttribute('colspan', nCols); });
}

// ---------- REDE / MAPA: todos os pedidos que eu enxergo ----------
async function cxLoadScope(force) {
  if (cxState.scopeBusy || (cxState.scope && !force)) return;
  cxState.scopeBusy = true;
  const s = { orders: [], accounts: [], team: {}, users: 0 };
  try {
    const sb = supabaseClient;
    let od = await sb.from('orders')
      .select('id, client_user_id, account_id, status, order_type, po_name, client_name, client_email, room_name, delivery_address, jobsite_lat, jobsite_lng, price_list_total, price_discount_pct, price_net_total, factory_number, project_number, source_project_id, submitted_at, approved_at, finance_released_at, pickup_released_at, delivered_at')
      .in('status', ['submitted', 'approved', 'paid', 'delivered']).order('submitted_at', { ascending: false }).limit(3000);
    if (od.error) { // sem a migration 313 (project_number): mesma consulta sem a coluna
      od = await sb.from('orders')
      .select('id, client_user_id, account_id, status, order_type, po_name, client_name, client_email, room_name, delivery_address, jobsite_lat, jobsite_lng, price_list_total, price_discount_pct, price_net_total, factory_number, source_project_id, submitted_at, approved_at, finance_released_at, pickup_released_at, delivered_at')
      .in('status', ['submitted', 'approved', 'paid', 'delivered']).order('submitted_at', { ascending: false }).limit(3000);
    }
    if (od.error) throw od.error;
    s.orders = (od.data || []).filter((o) => o.order_type !== 'cutting_list');
    const tr = await sb.rpc('account_tree'); s.accounts = tr.error ? [] : (tr.data || []);
    const tm = await sb.rpc('account_team'); (tm.error ? [] : (tm.data || [])).forEach((m) => { s.team[m.user_id] = m; });
    s.users = new Set(s.orders.map((o) => o.client_user_id)).size;
    // tabela dos pedidos ainda sem a foto do preço
    const falta = s.orders.filter((o) => o.price_list_total == null).map((o) => o.id);
    const soma = {};
    for (let i = 0; i < falta.length && i < 2000; i += 100) {
      const { data } = await sb.from('order_items').select('order_id, total_price').in('order_id', falta.slice(i, i + 100));
      (data || []).forEach((it) => { soma[it.order_id] = (soma[it.order_id] || 0) + Number(it.total_price || 0); });
    }
    const desc = {}; s.accounts.forEach((a) => { if (a.factory_discount_pct != null) desc[a.id] = Number(a.factory_discount_pct); });
    s.orders.forEach((o) => {
      if (o.price_list_total != null) { o._l = Number(o.price_list_total); o._d = Number(o.price_discount_pct || 0); o._n = Number(o.price_net_total || 0); }
      else { o._l = soma[o.id] || 0; o._d = desc[o.account_id] != null ? desc[o.account_id] : null; o._n = o._d != null ? Math.round(o._l * (1 - o._d / 100) * 100) / 100 : null; }
      o._s = cxStage(o);
    });
    // PROJETOS EM CONSTRUÇÃO de todo mundo que eu enxergo (20/11, Matt: "tenho
    // certeza que tem mais usuários fazendo projetos e não estou vendo") —
    // entram na árvore e na lista como etapa "Projeto em construção". Ficam
    // fora: projeto que já virou pedido, arquivado e perdido.
    try {
      const PB = 'id, client_user_id, name, client_folder, client_info, cached_value_usd, frozen_order_id, archived_at, updated_at';
      let pr = await sb.from('user_projects').select(PB + ', lost_at, account_id, po_name, project_number').order('updated_at', { ascending: false }).limit(5000);
      if (pr.error) pr = await sb.from('user_projects').select(PB + ', lost_at, account_id, po_name').order('updated_at', { ascending: false }).limit(5000);
      if (pr.error) pr = await sb.from('user_projects').select(PB + ', lost_at').order('updated_at', { ascending: false }).limit(5000);
      if (pr.error) pr = await sb.from('user_projects').select(PB).order('updated_at', { ascending: false }).limit(5000);
      const porId = {}, porPedido = {};
      (pr.data || []).forEach((p) => { porId[p.id] = p; if (p.frozen_order_id) porPedido[p.frozen_order_id] = p; });
      s.orders.forEach((o) => { const pj = porPedido[o.id] || porId[o.source_project_id]; o._folder = pj && pj.client_folder ? pj.client_folder : ''; o._pname = pj ? (pj.name || '') : ''; });
      (pr.data || []).forEach((p) => {
        if (p.frozen_order_id || p.archived_at || p.lost_at) return;
        const m = s.team[p.client_user_id];
        s.orders.push({
          _proj: true, _folder: p.client_folder || '', _pname: p.name || '', id: 'proj:' + p.id, client_user_id: p.client_user_id, account_id: p.account_id || (m ? m.account_id : null), _pid: p.id, _po: p.po_name || '', project_number: p.project_number || null, status: 'project',
          po_name: p.name, client_name: (p.client_info && p.client_info.name) || p.client_folder || '', room_name: '',
          delivery_address: (p.client_info && p.client_info.address) || '', jobsite_lat: null, jobsite_lng: null,
          submitted_at: p.updated_at, _l: Number(p.cached_value_usd) || 0, _d: null, _n: null, _s: 'build'
        });
      });
    } catch (e2) { /* sem projetos: só pedidos */ }
    try { await cxLoadPricing(s, desc); } catch (e4) { /* fica só a tabela */ }
    // e-mail de quem não está em nenhuma empresa (cliente, contractor)
    s.emails = {};
    try {
      const semNome = Array.from(new Set(s.orders.map((o) => o.client_user_id))).filter((u) => u && !(s.team[u] && s.team[u].email));
      for (let i = 0; i < semNome.length; i += 150) {
        const { data } = await sb.from('user_profiles').select('user_id, email, role').in('user_id', semNome.slice(i, i + 150));
        (data || []).forEach((r) => { s.emails[r.user_id] = r; });
      }
    } catch (e3) { /* fica o começo do id */ }
    s.orders.forEach((o) => { o._t = o._proj ? o.submitted_at : (o.delivered_at || o.pickup_released_at || o.finance_released_at || o.approved_at || o.submitted_at); });
    s.orders.sort((a, b) => String(b._t || '').localeCompare(String(a._t || '')));
    s.users = new Set(s.orders.map((o) => o.client_user_id)).size;
    cxState.scope = s;
  } catch (e) { cxState.scope = { orders: [], accounts: [], team: {}, users: 0, err: (e && e.message) || String(e) }; }
  cxState.scopeBusy = false;
  if (typeof mpRender === 'function' && typeof mpState !== 'undefined' && mpState.central) mpRender();
}
function cxStoreName(o) {
  const a = (cxState.scope.accounts || []).find((x) => x.id === o.account_id);
  return a ? (a.trade_name || a.legal_name || '—') : cT('no_store');
}
function cxHoje(d) { if (!d) return false; const x = new Date(d), h = new Date(); return x.getFullYear() === h.getFullYear() && x.getMonth() === h.getMonth() && x.getDate() === h.getDate(); }
function cxQuando(d) {
  if (!d) return '—';
  if (!cxHoje(d)) return cEsc(cDate(d));
  return '<b class="cx-hoje">' + cEsc(cT('today_at')) + ' ' + new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</b>';
}
function cxNetRows() {
  const s = cxState.scope; const f = cxState.net; const q = String((typeof mpState !== 'undefined' && mpState.q) || '').trim().toLowerCase();
  return s.orders.filter((o) => {
    if (f.loja && (o.account_id || '_') !== f.loja) return false;
    if (f.user && o.client_user_id !== f.user) return false;
    if (f.cliente && cxClienteKey(o) !== f.cliente) return false;
    if (f.etapa === '_orders') { if (!['wait', 'pay', 'prod', 'ready'].includes(o._s)) return false; }
    else if (f.etapa && o._s !== f.etapa) return false;
    if (f.periodo === 'hoje' && !cxHoje(o._t)) return false;
    if ((f.periodo === '7' || f.periodo === '30') && !(o._t && new Date(o._t).getTime() >= Date.now() - Number(f.periodo) * 86400000)) return false;
    if (!q) return true;
    return [o.po_name, o.room_name, o.delivery_address, o.client_name, cxStoreName(o), o.factory_number].some((v) => String(v || '').toLowerCase().includes(q));
  });
}
// 4ª coluna do filtro = PO (21/11, Matt: "trocar por PO, não client"). Projeto
// em construção: PO do projeto (_po); po_name dele é o nome do projeto.
function cxPoNome(o) { return String((o._proj ? o._po : o.po_name) || '').trim(); }
function cxClienteKey(o) { return cxPoNome(o).toLowerCase() || '_'; }
function cxUserLabel(uid, orders) {
  const m = cxState.scope.team[uid];
  if (m && m.email) return m.email;
  const pf = (cxState.scope.emails || {})[uid];
  if (pf && pf.email) return pf.email;
  const o = (orders || []).find((x) => x.client_user_id === uid && x.client_email);
  return o ? o.client_email : String(uid || '').slice(0, 8);
}
// ÁRVORE LADO A LADO (20/11, Matt: "mostrar a árvore lado a lado: FÁBRICA
// MATRIZ (depois pode haver centrais) — DEALER (mesma coisa que distribuidor)
// — VENDEDOR (contractor, arquiteto ou vendedor do dealer) — e cliente
// final"). Quatro colunas; clicar numa linha filtra as colunas à direita e a
// lista de pedidos de baixo. Clicar de novo solta o filtro.
function cxTreeCols() {
  const s = cxState.scope; const f = cxState.net;
  const val = (l) => l.reduce((a, o) => a + (o._n != null ? o._n : (o._l || 0)), 0);
  const item = (c, v, nome, sub, lista, on) => '<button type="button" class="cx-ci' + (on ? ' on' : '') + '" data-cx="col" data-c="' + c + '" data-v="' + cEsc(v) + '">'
    + '<span class="cx-ci-n">' + cEsc(nome) + (sub ? '<small>' + cEsc(sub) + '</small>' : '') + '</span><span class="cx-ci-q"><b>' + lista.length + '</b>' + (cxSeller() ? '' : '<small>' + cEsc(cMoney(val(lista))) + '</small>') + '</span></button>';
  // ÁRVORE COMPACTA (20/11, Matt: "troca toda essa altura só pela altura do
  // preto, e ao clicar no dealer aí abre a dropbox"): cada nível é UMA linha
  // com o que está escolhido; clicar abre a lista (com a lupa) por cima da tela.
  const col = (tit, corpo, n, busca, sel) => {
    const aberto = busca && cxState.colOpen === busca;
    const txt = sel ? sel.nome : (n ? cT('col_all') + ' (' + n + ')' : '—');
    return '<div class="cx-col cx-dd' + (aberto ? ' open' : '') + (sel ? ' has' : '') + '" data-cx-dd="' + (busca || '') + '">'
      + '<button type="button" class="cx-dd-btn" data-cx="ddopen" data-c="' + (busca || '') + '"' + (n ? '' : ' disabled') + '><span class="cx-dd-l">' + cEsc(tit) + '</span>'
      + '<span class="cx-dd-v">' + cEsc(txt) + '</span>' + (sel && sel.q ? '<span class="cx-dd-q">' + sel.q + '</span>' : '') + '<i class="cx-dd-a">▾</i></button>'
      + '<div class="cx-dd-pop"><label class="cx-col-s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
      + '<input type="search" data-cx-colq="' + busca + '" placeholder="' + cEsc(cT('col_find')) + '" value="' + cEsc(cxState.colQ[busca] || '') + '" autocomplete="off"></label>'
      + '<div class="cx-col-b" data-cx-colb="' + (busca || '') + '">' + corpo + '</div></div></div>';
  };
  const qtd = (lista) => '<b>' + lista.length + '</b>' + (cxSeller() ? '' : ' <small>' + cEsc(cMoney(val(lista))) + '</small>');
  let selLoja = null, selUser = null, selCli = null;
  const vazio = '<p class="hint cx-col-e">← ' + cEsc(cT('col_pick')) + '</p>';

  // 1) fábrica (matriz; as centrais entram aqui quando existirem)
  const fabricas = s.accounts.filter((a) => a.kind === 'factory');
  const fabNome = (fabricas[0] && (fabricas[0].trade_name || fabricas[0].legal_name)) || 'Legno';
  const c1 = (fabricas.length ? fabricas : [{ id: 'f', trade_name: 'Legno' }]).map((a) => item('fab', a.id, a.trade_name || a.legal_name || 'Legno', cT('matriz'), s.orders, cxState.net.fab && !f.loja)).join('');

  // 2) dealers (lojista e distribuidor são o mesmo nível)
  const porLoja = {}; s.orders.forEach((o) => { const k = o.account_id || '_'; (porLoja[k] = porLoja[k] || []).push(o); });
  const dealers = s.accounts.filter((a) => a.kind !== 'factory' && a.status !== 'draft')
    .sort((a, b) => (porLoja[b.id] || []).length - (porLoja[a.id] || []).length || String(a.trade_name || a.legal_name || '').localeCompare(String(b.trade_name || b.legal_name || '')));
  // quem só enxerga UM dealer (o próprio lojista): ele já vem aberto, mostrando
  // tudo; clicar num vendedor afunila, clicar no dealer de novo volta pra tudo
  const unico = dealers.length === 1 && !porLoja._ ? dealers[0].id : '';
  const lojaSel = f.loja || unico;
  let c2 = dealers.map((a) => item('loja', a.id, a.trade_name || a.legal_name || '—', [a.billing_city, a.billing_state].filter(Boolean).join(', '), porLoja[a.id] || [], lojaSel === a.id)).join('');
  if (porLoja._) c2 += item('loja', '_', cT('no_store'), '', porLoja._, f.loja === '_');
  if (lojaSel) { const a = dealers.find((x) => x.id === lojaSel); selLoja = { nome: a ? (a.trade_name || a.legal_name || '—') : cT('no_store'), q: qtd(porLoja[lojaSel] || []) }; }

  // 3) vendedores do dealer escolhido (quem fez pedido + a equipe cadastrada)
  let c3 = vazio, nV = null;
  if (lojaSel) {
    const daLoja = porLoja[lojaSel] || [];
    const porUser = {}; daLoja.forEach((o) => { (porUser[o.client_user_id] = porUser[o.client_user_id] || []).push(o); });
    if (lojaSel !== '_') Object.keys(s.team).forEach((uid) => { if (s.team[uid].account_id === lojaSel && s.team[uid].active && !porUser[uid]) porUser[uid] = []; });
    const uids = Object.keys(porUser).sort((a, b) => porUser[b].length - porUser[a].length);
    nV = uids.length;
    const PAPEL = { pt: { owner: 'dono', manager: 'gerente', seller: 'vendedor', finance: 'financeiro' }, en: { owner: 'owner', manager: 'manager', seller: 'salesperson', finance: 'finance' }, es: { owner: 'dueño', manager: 'gerente', seller: 'vendedor', finance: 'finanzas' } }[cxLang()];
    const papel = (uid) => { const m = s.team[uid]; if (m) return PAPEL[m.role] || ''; const pf = (s.emails || {})[uid]; return pf ? (pf.role || '') : ''; };
    c3 = uids.map((uid) => item('user', uid, cxUserLabel(uid, daLoja), papel(uid), porUser[uid], f.user === uid)).join('') || vazio;
    if (f.user) selUser = { nome: cxUserLabel(f.user, daLoja), q: qtd(porUser[f.user] || []) };
  }

  // 4) PO do pedido (projeto: PO do projeto) do dealer / vendedor escolhido
  let c4 = vazio, nC = null;
  if (lojaSel) {
    const base = s.orders.filter((o) => (o.account_id || '_') === lojaSel && (!f.user || o.client_user_id === f.user));
    const porCli = {}; const nomeCli = {};
    base.forEach((o) => { const k = cxClienteKey(o); (porCli[k] = porCli[k] || []).push(o); if (!nomeCli[k]) nomeCli[k] = cxPoNome(o) || cT('no_po'); });
    const ks = Object.keys(porCli).sort((a, b) => porCli[b].length - porCli[a].length || nomeCli[a].localeCompare(nomeCli[b]));
    nC = ks.length;
    c4 = ks.map((k) => item('cliente', k, nomeCli[k], '', porCli[k], f.cliente === k)).join('') || vazio;
    if (f.cliente && porCli[f.cliente]) selCli = { nome: nomeCli[f.cliente], q: qtd(porCli[f.cliente]) };
  }
  const fabOn = !f.own && !f.loja;
  return '<div class="cx-cols">'
    + '<div class="cx-col cx-dd cx-dd-fab' + (fabOn ? ' on' : '') + '"><button type="button" class="cx-dd-btn" data-cx="col" data-c="fab" data-v="f"><span class="cx-dd-l">' + cEsc(cT('col_factory')) + '</span>'
      + '<span class="cx-dd-v">' + cEsc(fabNome) + '</span><span class="cx-dd-q">' + qtd(s.orders) + '</span></button></div>'
    + col(cT('col_dealer'), c2 || vazio, dealers.length + (porLoja._ ? 1 : 0), 'loja', selLoja)
    + col(cT('col_seller'), c3, nV, 'user', selUser) + col(cT('col_client'), c4, nC, 'cliente', selCli) + '</div>';
}
// esconde as linhas da coluna que não batem com a lupa (sem redesenhar: o foco fica no campo)
function cxColFilter(chave) {
  const q = String(cxState.colQ[chave] || '').trim().toLowerCase();
  document.querySelectorAll('.cx-cols .cx-col-b[data-cx-colb="' + chave + '"] .cx-ci').forEach((el) => {
    el.style.display = (!q || el.classList.contains('on') || el.querySelector('.cx-ci-n').textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
}
// TROCAR A LOJA DO PEDIDO — só admin (20/11, Matt: "eu como administrador
// quero poder passar esses pedidos sem loja pra uma loja — nem que eu crie uma
// distribuição de fábrica. deveria trocar de forma bem simples"). Clicar na
// loja da linha abre a lista de lojas; "+ Nova loja…" cria uma na hora (ativa,
// embaixo da fábrica). Na barra da lista dá pra passar TODOS os pedidos
// filtrados de uma vez. Projeto em construção não tem loja própria: segue a
// do usuário. O preço já congelado de pedido aprovado não muda.
function cxStoreOptions(atual, titulo) {
  const s = cxState.scope;
  const lojas = s.accounts.filter((a) => a.kind !== 'factory' && a.status !== 'draft' && a.status !== 'rejected')
    .sort((a, b) => String(a.trade_name || a.legal_name || '').localeCompare(String(b.trade_name || b.legal_name || '')));
  return (titulo ? '<option value="">' + cEsc(titulo) + '</option>' : '')
    + lojas.map((a) => '<option value="' + cEsc(a.id) + '"' + (atual === a.id ? ' selected' : '') + '>' + cEsc(a.trade_name || a.legal_name || '—') + '</option>').join('')
    + '<option value="_"' + (!titulo && !atual ? ' selected' : '') + '>' + cEsc(cT('no_store')) + '</option><option value="__new">' + cEsc(cT('mv_new')) + '</option>';
}
async function cxMoveOrders(ids, destino) {
  const s = cxState.scope;
  if (!cxAdmin() || !s || !ids.length || !destino) return;
  let accId = destino === '_' ? null : destino;
  let nome = destino === '_' ? cT('no_store') : (cxState.accNames[destino] || '');
  try {
    if (destino === '__new') {
      nome = (prompt(cT('mv_new_q')) || '').trim();
      if (!nome) return mpRender();
      const fab = s.accounts.find((a) => a.kind === 'factory');
      const { data, error } = await supabaseClient.from('accounts')
        .insert({ kind: 'dealer', status: 'active', parent_account_id: fab ? fab.id : null, trade_name: nome }).select('id, kind, status, trade_name, parent_account_id').single();
      if (error) throw error;
      accId = data.id;
      s.accounts.push(Object.assign({ members: 0, factory_discount_pct: 0 }, data));
      cxState.accNames[accId] = nome;
    } else if (ids.length > 1 && !confirm(cT('mv_confirm', { n: ids.length, loja: nome }))) return mpRender();
    const pedidos = ids.filter((x) => !String(x).startsWith('proj:'));
    const projetos = ids.filter((x) => String(x).startsWith('proj:')).map((x) => String(x).slice(5));
    for (let i = 0; i < pedidos.length; i += 100) {
      const parte = pedidos.slice(i, i + 100);
      const { data, error } = await supabaseClient.from('orders').update({ account_id: accId }).in('id', parte).select('id');
      if (error) throw error;
      const ok = new Set((data || []).map((r) => r.id));
      s.orders.forEach((o) => { if (ok.has(o.id)) { o.account_id = accId; if (cxState.extra[o.id]) cxState.extra[o.id].account_id = accId; } });
    }
    // projeto (migration 310): a loja fica no próprio projeto e o pedido criado dele herda
    for (let i = 0; i < projetos.length; i += 100) {
      const parte = projetos.slice(i, i + 100);
      const { data, error } = await supabaseClient.from('user_projects').update({ account_id: accId }).in('id', parte).select('id');
      if (error) throw error;
      const ok = new Set((data || []).map((r) => 'proj:' + r.id));
      if (ok.size < parte.length && !ok.size) throw new Error(typeof I18n !== 'undefined' ? I18n.t('project.update_blocked') : 'blocked');
      s.orders.forEach((o) => { if (ok.has(o.id)) o.account_id = accId; });
    }
    const f = cxState.net; // a lista segue o pedido: fica na loja de destino
    if (f.loja) { f.loja = accId || '_'; f.user = ''; f.cliente = ''; }
  } catch (e) { alert((e && e.message) || String(e)); }
  mpRender();
}
// LISTA NUMERADA: um pedido/projeto por linha, o NÚMERO como primeira
// referência — projeto em construção = P0000123 (migration 313); pedido =
// número de fábrica, com o P de origem pequeno embaixo. 20/11, Matt: "por que
// não criar uma numeração com projetos de design, com P0000001... quando vira
// pedido aprovado ele ganha o número do pedido de fábrica" + "fica mais limpo
// e organizado". principal = true: é a lista da tela (títulos ordenam/filtram);
// false: itens de dentro de uma pasta.

// VALOR DE FÁBRICA COM DESCONTO + VENDA AO CLIENTE dos PROJETOS (21/11, Matt:
// "na aba projetos eu quero ver o valor fábrica já com desconto e valor de
// venda do cliente, pra ele ter mais controle dos pedidos dele e de seus
// vendedores"). Mesma conta do getDisplayPrice (portal-05), mas com a
// configuração do DEALER dono de cada linha (vendedor herda do dealer):
// custo = tabela − desconto + extras de custo; venda = custo × (1+margem) +
// extras de margem. Linha do próprio usuário usa getDisplayPrice direto.
// Extras de outro dealer só aparecem se o RLS deixar ler (migration 314 = admin).
async function cxLoadPricing(s, descConta) {
  const sb = supabaseClient;
  const meuId = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null;
  const prof = {};
  const busca = async (ids) => {
    ids = ids.filter((u) => u && !prof[u]);
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await sb.from('user_profiles').select('user_id, role, parent_dealer_user_id, resale_margin_pct, factory_discount_pct').in('user_id', ids.slice(i, i + 150));
      if (error) break;
      (data || []).forEach((r) => { prof[r.user_id] = r; });
    }
  };
  await busca(Array.from(new Set(s.orders.map((o) => o.client_user_id))));
  await busca(Array.from(new Set(Object.values(prof).map((r) => r.parent_dealer_user_id).filter(Boolean))));
  const dono = (uid) => { const r = prof[uid]; return r && r.role === 'vendedor' && r.parent_dealer_user_id ? r.parent_dealer_user_id : uid; };
  const donos = Array.from(new Set(s.orders.map((o) => dono(o.client_user_id)).filter(Boolean)));
  const extras = {};
  for (let i = 0; i < donos.length; i += 150) {
    const { data, error } = await sb.from('dealer_pricing_extras').select('*').in('dealer_user_id', donos.slice(i, i + 150));
    if (error) break;
    (data || []).forEach((x) => { (extras[x.dealer_user_id] = extras[x.dealer_user_id] || []).push(x); });
  }
  const aplica = (base, tab, lista) => (typeof applyPricingExtras === 'function') ? applyPricingExtras(base, tab, lista) : base;
  const r2 = (v) => Math.round(v * 100) / 100;
  s.orders.forEach((o) => {
    if (!o._proj) {
      // PEDIDO: líquido de fábrica já congelado; venda = líquido × (1+margem) + extras de margem da loja
      const tab = Number(o._l) || 0;
      const liq = o._n != null ? Number(o._n) : tab;
      const d = dono(o.client_user_id);
      const meu = meuId && (d === meuId || o.client_user_id === meuId);
      const mg = meu && typeof getResaleMarginPct === 'function' ? (Number(getResaleMarginPct()) || 0) : (Number((prof[d] || {}).resale_margin_pct) || 0);
      const exM = meu && typeof resolveDealerPricingExtras === 'function' ? resolveDealerPricingExtras('margem') : (extras[d] || []).filter((x) => x.side === 'margem');
      o._v = r2(aplica(mg > 0 ? liq * (1 + mg / 100) : liq, tab, exM));
      return;
    }
    const tab = Number(o._l) || 0;
    const d = dono(o.client_user_id);
    const meu = meuId && (d === meuId || o.client_user_id === meuId);
    if (meu && typeof computeCustoBase === 'function' && typeof getDisplayPrice === 'function') {
      o._n = r2(computeCustoBase(tab)); o._v = r2(getDisplayPrice(tab));
      o._d = tab > 0 ? Math.round((1 - o._n / tab) * 1000) / 10 : 0;
      return;
    }
    const pd = prof[d] || {};
    const pct = pd.factory_discount_pct != null ? Number(pd.factory_discount_pct) : (descConta[o.account_id] != null ? descConta[o.account_id] : 0);
    const ex = extras[d] || [];
    const custo = aplica(tab * (1 - pct / 100), tab, ex.filter((x) => x.side === 'custo'));
    const mg = Number(pd.resale_margin_pct) || 0;
    const venda = aplica(mg > 0 ? custo * (1 + mg / 100) : custo, tab, ex.filter((x) => x.side === 'margem'));
    o._d = pct; o._n = r2(custo); o._v = r2(venda);
  });
}
// colunas de preço: aba Projetos = fábrica c/ desconto + venda; resto = tabela/desconto/líquido
// 21/11 (2ª): Matt quer as DUAS colunas em todas as abas — fábrica com desconto à esquerda, venda ao cliente (markup do lojista) ao lado.
function cxSoProj() { return true; }
function cxPrecoThs(th, soProj) {
  return soProj ? th('net', cT('fab_net'), 1) + th('v', cT('sale'), 1)
    : th('l', cT('list'), 1) + '<th class="cx-r">' + cEsc(cT('disc')) + '</th>' + th('net', cT('net'), 1);
}
// linha de TOTAL embaixo, em negrito, nas mesmas colunas (21/11, Matt)
function cxTotalRow(itens, antes, depois, soProj) {
  const soma = (k) => itens.reduce((t, o) => t + (Number(o[k]) || 0), 0);
  const precos = soProj
    ? '<td class="cx-r">' + cEsc(cMoney(itens.reduce((t, o) => t + (o._n != null ? o._n : (o._l || 0)), 0))) + '</td><td class="cx-r">' + cEsc(cMoney(soma('_v'))) + '</td>'
    : '<td class="cx-r">' + cEsc(cMoney(soma('_l'))) + '</td><td></td><td class="cx-r">' + cEsc(cMoney(itens.reduce((t, o) => t + (o._n != null ? o._n : (o._l || 0)), 0))) + '</td>';
  return '<tfoot><tr class="cx-tot"><td colspan="' + antes + '">' + cEsc(cT('sum', { n: itens.length })) + '</td>' + precos + (depois ? '<td colspan="' + depois + '"></td>' : '') + '</tr></tfoot>';
}
function cxPnum(n) { return n ? 'P' + String(Number(n)).padStart(7, '0') : ''; }
function cxNumVal(o) { return o._proj ? (Number(o.project_number) || 0) : (Number(o.factory_number) || 0); }
function cxFlatTable(rows, principal) {
  const s = cxState.scope; const f = cxState.net;
  const st = cxState.netSort || (cxState.netSort = { col: 'upd', dir: -1 });
  const preco = !cxSeller();
  const soProj = cxSoProj();
  if (principal) {
    const val = { num: cxNumVal, loja: (o) => cxStoreName(o).toLowerCase(), quem: (o) => cxUserLabel(o.client_user_id, [o]).toLowerCase(), nome: (o) => String(o.po_name || '').toLowerCase(),
      cliente: (o) => String(o.client_name || '').toLowerCase(), l: (o) => o._l || 0, net: (o) => (o._n == null ? -1 : o._n), v: (o) => (o._v == null ? -1 : o._v), etapa: (o) => CX_NET_STAGES.indexOf(o._s), upd: (o) => String(o._t || '') }[st.col] || ((o) => String(o._t || ''));
    rows = rows.slice().sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir || String(b._t || '').localeCompare(String(a._t || '')); });
  }
  const comFiltro = { quem: !!f.user, etapa: !!f.etapa && f.etapa !== '_orders' && f.etapa !== 'build', upd: !!f.periodo };
  const th = (col, rot, r, menu) => !principal ? '<th' + (r ? ' class="cx-r"' : '') + '>' + cEsc(rot) + '</th>'
    : '<th class="mp-th-sort' + (st.col === col ? ' is-sorted' : '') + (r ? ' cx-r' : '') + (comFiltro[col] ? ' cx-th-on' : '') + '" data-cx="' + (menu ? 'hmenu' : 'gsort') + '" data-col="' + col + '">'
      + (comFiltro[col] ? '<i class="cx-th-dot"></i>' : '') + cEsc(rot) + ' ' + (st.col === col ? (st.dir < 0 ? '↓' : '↑') : (menu ? '▾' : '↕')) + '</th>';
  const max = principal ? 400 : 200;
  return '<div class="cx-inner"><table class="mp-table cx-table' + (principal ? ' cx-main' : '') + '"><thead><tr>'
    + th('num', cT('c_no')) + th('loja', cT('c_store')) + th('quem', cT('col_seller'), 0, 1) + th('nome', cT('c_item'))
    + (preco ? cxPrecoThs(th, soProj) : '')
    + th('etapa', cT('c_stage'), 0, 1) + th('upd', cT('c_date'), 0, 1) + '<th></th></tr></thead><tbody>'
    + rows.slice(0, max).map((o) => {
      const quem = cxUserLabel(o.client_user_id, [o]);
      // botão DENTRO da célula de etapa (21/11: "na própria barra de status"; a última coluna some em tela estreita)
      const envia = o._proj && (cxAdmin() || (o.client_user_id === cxMe() && !cxSeller()))
        ? ' <button type="button" class="cx-sendfab" data-cx="sendfab" data-id="' + cEsc(o.id) + '">' + cEsc(sfT('btn')) + '</button>' : '';
      const acao = (!cxAdmin() ? '' : (o._s === 'pay' ? '<button type="button" class="secondary" data-cx="relprod" data-id="' + cEsc(o.id) + '">' + cEsc(cT('rel_prod')) + '</button>'
        : o._s === 'prod' ? '<button type="button" class="secondary" data-cx="relpick" data-id="' + cEsc(o.id) + '">' + cEsc(cT('rel_pick')) + '</button>' : ''));
      const num = o._proj ? (cxPnum(o.project_number) || '—')
        : ((Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : '—') + (o.project_number ? ' <span class="cx-pref">' + cxPnum(o.project_number) + '</span>' : ''));
      const ehFab = !o._proj && Number(o.factory_number) > 0;
      const icoN = (typeof MP_ICO !== 'undefined') ? '<span class="cx-nico' + (ehFab ? ' cx-nico-f' : '') + '" title="' + (ehFab ? 'Factory order' : 'Project') + '">' + (ehFab ? MP_ICO.factory : MP_ICO.layers) + '</span>' : '';
      return '<tr data-cx="openorder" data-id="' + cEsc(o.id) + '"><td class="cx-num' + (o._proj ? ' cx-num-p' : '') + '"><span class="cx-nwrap">' + icoN + '<span>' + num + '</span></span></td>'
        + '<td' + (cxAdmin() ? ' class="cx-storecell" data-cx="pickstore" data-id="' + cEsc(o.id) + '" title="' + cEsc(cT('mv_change')) + '"' : '') + '><b>' + cEsc(cxStoreName(o)) + '</b>' + (cxAdmin() ? ' <span class="cx-swap">⇄</span>' : '') + '</td>'
        + '<td class="cx-quem" title="' + cEsc(quem || '') + '">' + cEsc(String(quem || '—').split('@')[0]) + '</td>'
        + '<td class="cx-item" title="' + cEsc([o.po_name, o.client_name, o.room_name, o.delivery_address].filter(Boolean).join(' · ')) + '">' + cEsc(o.po_name || '—') + (o.client_name ? ' <span class="hint">· ' + cEsc(o.client_name) + '</span>' : '') + '</td>'
        + (!preco ? '' : soProj
          ? '<td class="cx-r">' + (o._n != null ? (o._d ? '<small class="cx-est" title="' + cEsc(cT('list') + ' ' + cMoney(o._l)) + '">−' + o._d + '%</small> ' : '') + cEsc(cMoney(o._n)) : '—') + '</td><td class="cx-r"><b>' + (o._v != null ? cEsc(cMoney(o._v)) : '—') + '</b></td>'
          : '<td class="cx-r">' + (o._proj ? (o._l ? '<span class="cx-est" title="' + cEsc(cT('est_tip')) + '">' + cEsc(cMoney(o._l)) + ' <small>' + cEsc(cT('est')) + '</small></span>' : '—') : cEsc(cMoney(o._l))) + '</td>'
          + '<td class="cx-r">' + (o._d != null && !o._proj ? o._d + '%' : '—') + '</td><td class="cx-r"><b>' + (o._n != null && !o._proj ? cEsc(cMoney(o._n)) : '—') + '</b></td>')
        + '<td><span class="cx-stage"><i style="background:' + CX_COLORS[o._s] + '"></i>' + cEsc(cT('s_' + o._s)) + '</span>' + envia + '</td><td>' + cxQuando(o._t) + '</td><td>' + acao + '</td></tr>';
    }).join('') + '</tbody>' + (preco && rows.length ? cxTotalRow(rows, 4, 3, soProj) : '') + '</table></div>' + (rows.length > max ? '<p class="hint">+' + (rows.length - max) + '…</p>' : '');
}

// LISTA DA ÁRVORE NO FORMATO DE PASTAS (20/11, Matt: "quando clico aqui o
// layout muda e não quero isso... deixa no formato antigo porque os filtros
// das colunas estão funcionando e as pastas são mais visuais"). Mesma cara da
// lista de pastas da Central: uma linha por pasta/projeto/pedido solto, de
// cada usuário, colunas que ordenam, e abre pra ver os itens (cxFlatTable).
function cxGroups(rows) {
  const map = new Map();
  rows.forEach((o) => {
    const k = (o._proj ? 'b' : 'o') + '|' + o.client_user_id + '|' + (o._folder ? 'f:' + o._folder : 'i:' + o.id);
    if (!map.has(k)) map.set(k, { key: k, proj: !!o._proj, folder: o._folder || '', itens: [] });
    map.get(k).itens.push(o);
  });
  const ORD = ['build', 'wait', 'pay', 'prod', 'ready', 'done'];
  return Array.from(map.values()).map((g) => {
    const a = g.itens[0];
    const cli = {}; g.itens.forEach((o) => { const n = String(o.client_name || '').trim(); if (n) cli[n] = (cli[n] || 0) + 1; });
    g.titulo = g.folder || a._pname || a.po_name || a.client_name || '—';
    g.cliente = Object.keys(cli).sort((x, y) => cli[y] - cli[x])[0] || '';
    g.loja = cxStoreName(a); g.quem = cxUserLabel(a.client_user_id, g.itens);
    g.n = g.itens.length;
    g.l = g.itens.reduce((t, o) => t + (o._l || 0), 0);
    g.pn = g.itens.reduce((t, o) => t + (o._n != null ? o._n : (o._l || 0)), 0); g.v = g.itens.reduce((t, o) => t + (o._v || 0), 0);
    const comN = g.itens.filter((o) => o._n != null);
    g.net = !g.proj && comN.length === g.itens.length ? comN.reduce((t, o) => t + o._n, 0) : null;
    g.d = g.net != null && g.l > 0 ? Math.round((1 - g.net / g.l) * 1000) / 10 : (g.net != null ? 0 : null);
    g.etapa = g.itens.map((o) => o._s).sort((x, y) => ORD.indexOf(x) - ORD.indexOf(y))[0]; // a menos adiantada
    g.aprov = g.itens.filter((o) => !o._proj && o._s !== 'wait').length;
    g.status = g.proj ? 'dev' : (g.aprov > 0 ? 'approved' : 'proposal');
    g.upd = g.itens.reduce((m, o) => (o._t && (!m || o._t > m) ? o._t : m), null);
    return g;
  });
}
function cxGroupTable(rows) {
  const s = cxState.scope;
  if (!rows.length) return '<p class="hint">' + cEsc(s.err || cT('net_none')) + '</p>';
  const st = cxState.netSort || (cxState.netSort = { col: 'upd', dir: -1 });
  const val = { nome: (g) => g.titulo.toLowerCase(), cliente: (g) => g.cliente.toLowerCase(), loja: (g) => g.loja.toLowerCase(), quem: (g) => String(g.quem || '').toLowerCase(), n: (g) => g.n, status: (g) => g.status, etapa: (g) => CX_NET_STAGES.indexOf(g.etapa), l: (g) => g.l, net: (g) => (cxSoProj() ? g.pn : (g.net == null ? -1 : g.net)), v: (g) => g.v || 0, upd: (g) => String(g.upd || '') }[st.col];
  const grupos = cxGroups(rows).filter((g) => !cxState.net.gstatus || g.status === cxState.net.gstatus).sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir || String(b.upd || '').localeCompare(String(a.upd || '')); });
  const comFiltro = { quem: !!cxState.net.user, status: !!cxState.net.gstatus, etapa: !!cxState.net.etapa && cxState.net.etapa !== '_orders', upd: !!cxState.net.periodo };
  const th = (col, rot, r) => '<th class="mp-th-sort' + (st.col === col ? ' is-sorted' : '') + (r ? ' cx-r' : '') + (comFiltro[col] ? ' cx-th-on' : '') + '" data-cx="' + (col in comFiltro ? 'hmenu' : 'gsort') + '" data-col="' + col + '">' + (comFiltro[col] ? '<i class="cx-th-dot"></i>' : '') + cEsc(rot) + ' ' + (st.col === col ? (st.dir < 0 ? '↓' : '↑') : '↕') + '</th>';
  const T = (k, alt) => { try { const v = (typeof mpT === 'function') ? mpT(k) : ''; return v && v !== 'mp.' + k ? v : alt; } catch (e) { return alt; } };
  const ICO = (typeof MP_ICO !== 'undefined') ? MP_ICO : { chev: '›', folder: '', layers: '', factory: '' };
  const aberto = cxState.netOpen || (cxState.netOpen = new Set());
  const preco = !cxSeller();
  const soProj = cxSoProj();
  const nCols = preco ? (soProj ? 10 : 11) : 8;
  const max = 300;
  return '<div class="mp-table-wrap cx-wrap"><table class="mp-table cx-table cx-gtable"><thead><tr>'
    + th('nome', T('col_project', 'Project')) + th('cliente', T('col_client', 'Client')) + th('loja', cT('c_store')) + th('quem', cT('col_seller')) + th('n', T('col_count', 'Projects'))
    + th('status', T('col_status', 'Status')) + th('etapa', T('col_prod', cT('c_stage')))
    + (preco ? cxPrecoThs(th, soProj) : '') + th('upd', T('col_updated', cT('c_date')))
    + '</tr></thead><tbody>'
    + grupos.slice(0, max).map((g) => {
      const ab = aberto.has(g.key);
      const stRot = T('st_' + g.status, g.status) + (g.status === 'approved' && g.aprov < g.n ? ' ' + g.aprov + '/' + g.n : '');
      return '<tr class="mp-row cx-grow' + (ab ? ' is-open' : '') + '" data-cx="grow" data-k="' + cEsc(g.key) + '">'
        + '<td class="mp-c-name"><span class="mp-chev">' + (ICO.chev || '›') + '</span><span class="mp-fold' + (g.proj ? '' : ' cu-ico-orders') + '">' + (g.proj ? (g.folder ? ICO.folder : ICO.layers) : ICO.factory) + '</span>'
        + '<strong>' + cEsc(g.titulo) + '</strong> <span class="cu-kind">' + cEsc(typeof I18n !== 'undefined' ? I18n.t(g.proj ? 'cu.kind_project' : 'cu.kind_orders') : '') + '</span></td>'
        + '<td>' + (g.cliente ? cEsc(g.cliente) : '—') + '</td>'
        + '<td class="cx-loja2"><b>' + cEsc(g.loja) + '</b></td><td class="cx-loja2 cx-quem">' + (g.quem ? cEsc(g.quem) : '—') + '</td>'
        + '<td class="mp-c-n"><strong>' + g.n + '</strong></td>'
        + '<td><span class="mp-chip st-' + g.status + '">' + cEsc(stRot) + '</span></td>'
        + '<td><span class="cx-stage"><i style="background:' + CX_COLORS[g.etapa] + '"></i>' + cEsc(cT('s_' + g.etapa)) + '</span></td>'
        + (!preco ? '' : soProj
          ? '<td class="cx-r">' + cEsc(cMoney(g.pn)) + '</td><td class="cx-r"><b>' + cEsc(cMoney(g.v)) + '</b></td>'
          : '<td class="cx-r">' + (g.proj ? (g.l ? '<span class="cx-est">' + cEsc(cMoney(g.l)) + ' <small>' + cEsc(cT('est')) + '</small></span>' : '—') : cEsc(cMoney(g.l))) + '</td>'
          + '<td class="cx-r">' + (g.d != null ? g.d + '%' : '—') + '</td><td class="cx-r"><b>' + (g.net != null ? cEsc(cMoney(g.net)) : '—') + '</b></td>')
        + '<td class="mp-c-date">' + cxQuando(g.upd) + '</td></tr>'
        + (ab ? '<tr class="mp-exp cx-gexp"><td colspan="' + nCols + '">' + cxFlatTable(g.itens) + '</td></tr>' : '');
    }).join('')
    + '</tbody>' + (preco && grupos.length ? cxTotalRow(grupos.reduce((a, g) => a.concat(g.itens), []), 7, 1, soProj) : '') + '</table></div>' + (grupos.length > max ? '<p class="hint">+' + (grupos.length - max) + '…</p>' : '');
}
function cxRenderNet(p) {
  const s = cxState.scope;
  if (!s) { p.innerHTML = '<p class="hint">' + cEsc(cT('loading')) + '</p>'; return; }
  const f = cxState.net;
  const rows = cxNetRows();
  const totL = rows.reduce((a, o) => a + (o._l || 0), 0), totN = rows.reduce((a, o) => a + (o._n != null ? o._n : (o._l || 0)), 0);
  const filtrando = f.gstatus || f.periodo || f.user || (f.etapa && f.etapa !== '_orders' && f.etapa !== 'build');
  // VISUAL LIMPO (20/11, Matt: "tá muito poluído esse visual, quero algo bem mais
  // minimalista, prefiro deixar os filtros ao clicar na coluna"): sem faixa de
  // etapas nem segunda busca. Filtra-se clicando no título da coluna (Status,
  // Etapa, Última atualização) e pela busca de cima; embaixo, uma linha discreta
  // com o total e as ações.
  p.innerHTML = ''
    // aba Orders = lista corrida, o NÚMERO DO PEDIDO como primeira referência
    // (20/11, Matt: "aqui eu acho legal mostrar o número do pedido como primeira
    // referência, aí loja, preços, PO, data, status"); as outras abas = pastas.
    + (!rows.length ? '<p class="hint">' + cEsc(s.err || cT('net_none')) + '</p>'
      : (cxState.netLayout === 'pastas' && f.etapa !== '_orders' ? cxGroupTable(rows) : '<div class="mp-table-wrap cx-wrap">' + cxFlatTable(rows, true) + '</div>'))
    + '<div class="cx-foot"><span class="hint">' + cEsc(cT('totals', { n: rows.length, l: cMoney(totL), v: cMoney(totN) })) + '</span>'
    + (filtrando ? '<button type="button" class="cx-link" data-cx="fclear">' + cEsc(cT('fl_clear')) + '</button>' : '')
    + (f.etapa === '_orders' ? '' : '<button type="button" class="cx-link" data-cx="layout">' + cEsc(cT(cxState.netLayout === 'pastas' ? 'lay_lista' : 'lay_pastas')) + '</button>')
    + (cxAdmin() ? '' : '<button type="button" class="cx-link" data-cx="folders">' + cEsc(cT('back_folders')) + '</button>')
    + (cxAdmin() && rows.length ? '<select id="cx-move-all" class="cx-moveall">' + cxStoreOptions(null, cT('mv_all', { n: rows.length })) + '</select>' : '') + '</div>';
}
// MENU DO TÍTULO DA COLUNA: ordenar + filtrar (Status / Etapa / Última atualização).
function cxHeadMenu(col, th) {
  cxCloseHeadMenu();
  const f = cxState.net; const st = cxState.netSort || (cxState.netSort = { col: 'upd', dir: -1 });
  const T = (k, alt) => { try { const v = (typeof mpT === 'function') ? mpT(k) : ''; return v && v !== 'mp.' + k ? v : alt; } catch (e) { return alt; } };
  const op = (grupo, v, rot, on, cor) => '<button type="button" class="cx-hm-i' + (on ? ' on' : '') + '" data-cx="hpick" data-g="' + grupo + '" data-v="' + cEsc(v) + '">' + (cor ? '<i style="background:' + cor + '"></i>' : '') + cEsc(rot) + '</button>';
  let h = '';
  if (th.closest('.cx-gtable, .cx-main')) h += op('sort', col + ':1', cT('fl_asc'), st.col === col && st.dir > 0) + op('sort', col + ':-1', cT('fl_desc'), st.col === col && st.dir < 0) + '<hr>';
  if (col === 'etapa') {
    const base = Object.assign({}, f); cxState.net = Object.assign({}, f, { etapa: '' }); const cont = {}; cxNetRows().forEach((o) => { cont[o._s] = (cont[o._s] || 0) + 1; }); cxState.net = base;
    h += op('etapa', '', cT('fl_all'), !f.etapa) + CX_NET_STAGES.map((k) => op('etapa', k, cT('s_' + k) + ' (' + (cont[k] || 0) + ')', f.etapa === k, CX_COLORS[k])).join('');
  } else if (col === 'quem') {
    const base = Object.assign({}, f); cxState.net = Object.assign({}, f, { user: '' }); const por = {}; cxNetRows().forEach((o) => { por[o.client_user_id] = (por[o.client_user_id] || 0) + 1; }); cxState.net = base;
    const uids = Object.keys(por).sort((a, b) => por[b] - por[a]).slice(0, 40);
    h += op('user', '', cT('fl_all'), !f.user) + uids.map((u) => op('user', u, cxUserLabel(u, cxState.scope.orders) + ' (' + por[u] + ')', f.user === u)).join('');
  } else if (col === 'status') {
    h += op('gstatus', '', cT('fl_all'), !f.gstatus) + ['dev', 'proposal', 'approved'].map((k) => op('gstatus', k, T('st_' + k, k), f.gstatus === k)).join('');
  } else if (col === 'upd') {
    h += op('periodo', '', cT('fl_all'), !f.periodo) + op('periodo', 'hoje', cT('today'), f.periodo === 'hoje') + op('periodo', '7', cT('fl_7'), f.periodo === '7') + op('periodo', '30', cT('fl_30'), f.periodo === '30');
  }
  const r = th.getBoundingClientRect();
  const m = document.createElement('div');
  m.id = 'cx-hmenu'; m.className = 'cx-hmenu'; m.innerHTML = h;
  m.style.top = Math.round(r.bottom + 4) + 'px';
  m.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - 240))) + 'px';
  document.body.appendChild(m);
}
function cxCloseHeadMenu() { const m = document.getElementById('cx-hmenu'); if (m) m.remove(); }

// ---------- MAPA ----------
function cxLoadLeaflet() {
  if (window.L && window.L.map) return Promise.resolve();
  if (cxState.leafletP) return cxState.leafletP;
  cxState.leafletP = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = CX_LEAFLET + '.css'; document.head.appendChild(css);
    const js = document.createElement('script'); js.src = CX_LEAFLET + '.js'; js.onload = () => resolve(); js.onerror = () => { cxState.leafletP = null; reject(new Error('leaflet')); };
    document.head.appendChild(js);
  });
  return cxState.leafletP;
}
function cxRenderMap(p) {
  const s = cxState.scope;
  if (!s) { p.innerHTML = '<p class="hint">' + cEsc(cT('loading')) + '</p>'; return; }
  const com = s.orders.filter((o) => !o._proj && o.jobsite_lat != null && o.jobsite_lng != null);
  const semCoord = s.orders.filter((o) => !o._proj && (o.jobsite_lat == null || o.jobsite_lng == null) && String(o.delivery_address || '').trim() && (cxAdmin() || o.client_user_id === cxMe()));
  const semEnd = s.orders.filter((o) => !o._proj && !String(o.delivery_address || '').trim()).length;
  const cont = {}; CX_STAGES.forEach((k) => { cont[k] = 0; }); com.forEach((o) => { cont[o._s]++; });
  p.innerHTML = '<div class="cx-chips">' + CX_STAGES.map((k) => '<button type="button" class="cx-chip' + (cxState.mapHide[k] ? ' off' : ' on') + '" data-cx="maplegend" data-v="' + k + '"><i style="background:' + CX_COLORS[k] + '"></i>' + cEsc(cT('s_' + k)) + ' <b>' + cont[k] + '</b></button>').join('') + '</div>'
    + '<div class="cx-filters">' + (semCoord.length ? '<button type="button" class="secondary" data-cx="geocode"' + (cxState.geoBusy ? ' disabled' : '') + ' id="cx-geo-btn">' + cEsc(cT('map_locate', { n: semCoord.length })) + '</button>' : '')
    + (semEnd ? '<span class="hint">' + cEsc(cT('map_missing', { n: semEnd })) + '</span>' : '') + (!com.length ? '<span class="hint">' + cEsc(cT('map_none')) + '</span>' : '') + '</div><div id="cx-map-slot"></div>';
  const slot = p.querySelector('#cx-map-slot');
  if (!cxState.mapEl) { cxState.mapEl = document.createElement('div'); cxState.mapEl.className = 'cx-map'; }
  slot.appendChild(cxState.mapEl);
  cxLoadLeaflet().then(() => {
    const L = window.L;
    if (!cxState.map) {
      cxState.map = L.map(cxState.mapEl, { scrollWheelZoom: true }).setView([33.5, -88], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(cxState.map);
      cxState.mapLayer = L.layerGroup().addTo(cxState.map);
    }
    cxState.mapLayer.clearLayers();
    const pts = [];
    com.filter((o) => !cxState.mapHide[o._s]).forEach((o) => {
      const ll = [Number(o.jobsite_lat), Number(o.jobsite_lng)];
      pts.push(ll);
      L.circleMarker(ll, { radius: 9, color: '#fff', weight: 2, fillColor: CX_COLORS[o._s], fillOpacity: 0.95 }).addTo(cxState.mapLayer)
        .bindPopup('<b>' + cEsc(o.po_name || o.client_name || '—') + '</b>' + (o.room_name ? ' · ' + cEsc(o.room_name) : '') + '<br>' + cEsc(cxStoreName(o)) + '<br>' + cEsc(o.delivery_address || '')
          + '<br><span style="color:' + CX_COLORS[o._s] + '">●</span> ' + cEsc(cT('s_' + o._s)) + (o._n != null && !cxSeller() ? ' · ' + cEsc(cMoney(o._n)) : '')
          + (o.client_user_id === cxMe() ? '<br><a href="javascript:void(0)" onclick="if(typeof openOrderDetail===\'function\')openOrderDetail(\'' + cEsc(o.id) + '\')">' + cEsc(cT('open')) + ' ›</a>' : ''));
    });
    setTimeout(() => {
      cxState.map.invalidateSize();
      const sig = pts.length + ':' + Object.keys(cxState.mapHide).filter((k) => cxState.mapHide[k]).join(',');
      if (pts.length && cxState.mapSig !== sig) { cxState.mapSig = sig; cxState.map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 }); }
    }, 60);
  }).catch(() => { slot.innerHTML = '<p class="hint">' + cEsc(cT('map_fail')) + '</p>'; });
}
async function cxGeocode(texto) {
  const r = await fetch(CX_PHOTON + '?limit=1&lang=en&q=' + encodeURIComponent(texto));
  if (!r.ok) return null;
  const j = await r.json();
  const f = j && j.features && j.features[0];
  if (!f || !f.geometry || !Array.isArray(f.geometry.coordinates)) return null;
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
}
async function cxGeocodeMissing() {
  if (cxState.geoBusy || !cxState.scope) return;
  const lista = cxState.scope.orders.filter((o) => !o._proj && (o.jobsite_lat == null || o.jobsite_lng == null) && String(o.delivery_address || '').trim() && (cxAdmin() || o.client_user_id === cxMe())).slice(0, 60);
  cxState.geoBusy = true;
  for (let i = 0; i < lista.length; i++) {
    const b = document.getElementById('cx-geo-btn');
    if (b) { b.disabled = true; b.textContent = cT('map_locating', { i: i + 1, n: lista.length }); }
    const o = lista[i];
    try {
      const g = await cxGeocode(o.delivery_address);
      if (g) {
        const { error } = await supabaseClient.from('orders').update({ jobsite_lat: g.lat, jobsite_lng: g.lng, jobsite_geocoded_at: new Date().toISOString() }).eq('id', o.id);
        if (!error) { o.jobsite_lat = g.lat; o.jobsite_lng = g.lng; }
      }
    } catch (e) { /* segue pro próximo */ }
    await new Promise((res) => setTimeout(res, 700)); // serviço gratuito: sem pressa
  }
  cxState.geoBusy = false; cxState.mapSig = '';
  if (typeof mpRender === 'function') mpRender();
}

// ---------- sugestão de endereço ----------
function cxSuggest(input) {
  const id = input.closest('[data-cx-order]').getAttribute('data-cx-order');
  const q = input.value.trim();
  clearTimeout(cxState.sugTimer);
  if (q.length < 6) return;
  cxState.sugTimer = setTimeout(async () => {
    try {
      const r = await fetch(CX_PHOTON + '?limit=5&lang=en&q=' + encodeURIComponent(q));
      if (!r.ok) return;
      const j = await r.json();
      const ops = ((j && j.features) || []).map((f) => {
        const p = f.properties || {};
        const rua = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
        const txt = [rua, p.city || p.town || p.village || p.county, [p.state, p.postcode].filter(Boolean).join(' '), p.countrycode && p.countrycode !== 'US' ? p.country : ''].filter(Boolean).join(', ');
        return { txt, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
      }).filter((o) => o.txt);
      cxState.sug[id] = ops;
      const dl = document.getElementById('cx-dl-' + id);
      if (dl) dl.innerHTML = ops.map((o) => '<option value="' + cEsc(o.txt) + '"></option>').join('');
    } catch (e) { /* sem sugestão: digita à mão */ }
  }, 350);
}

// ---------- gravação ----------
async function cxSaveField(input) {
  const strip = input.closest('[data-cx-order]');
  const id = strip.getAttribute('data-cx-order');
  const k = input.getAttribute('data-cx-f');
  const o = mpState.ordersById[id];
  if (!o) return;
  const v = input.value.trim();
  const antes = k === 'room_name' ? ((cxState.extra[id] || {}).room_name || '') : (o[k] || '');
  if (v === String(antes || '').trim()) return;
  const patch = {}; patch[k] = v || null;
  if (k === 'delivery_address') {
    let g = (cxState.sug[id] || []).find((s) => s.txt === v) || null;
    if (!g && v) { try { g = await cxGeocode(v); } catch (e) { g = null; } }
    patch.jobsite_lat = g ? g.lat : null; patch.jobsite_lng = g ? g.lng : null; patch.jobsite_geocoded_at = g ? new Date().toISOString() : null;
  }
  const { data, error } = await supabaseClient.from('orders').update(patch).eq('id', id).select('id');
  const st = strip.querySelector('.cx-go');
  if (error || !data || !data.length) {
    cxState.msg[id] = { err: true, t: (error && error.message) || (typeof I18n !== 'undefined' ? I18n.t('project.update_blocked') : 'blocked') };
  } else {
    if (k === 'room_name') (cxState.extra[id] = cxState.extra[id] || { id }).room_name = v || null; else o[k] = v || null;
    if (k === 'delivery_address') { const x = (cxState.extra[id] = cxState.extra[id] || { id }); x.jobsite_lat = patch.jobsite_lat; x.jobsite_lng = patch.jobsite_lng; }
    cxState.msg[id] = { t: '✓ ' + cT('saved') };
    cxState.scope = null; // mapa/lojas releem na próxima abertura
    if (cxState.draft[id]) delete cxState.draft[id][k];
  }
  if (st) { let s = st.querySelector('.cx-st'); if (!s) { s = document.createElement('span'); st.appendChild(s); } s.className = 'cx-st ' + (cxState.msg[id].err ? 'err' : 'ok'); s.textContent = cxState.msg[id].t; }
}
async function cxRelease(id) {
  const o = mpState.ordersById[id];
  if (!o || cxState.saving[id]) return;
  if (typeof isRetailClientAccount === 'function' && isRetailClientAccount()) { if (typeof showBecomeDealerModal === 'function') showBecomeDealerModal(); return; }
  const strip = document.querySelector('.cx-strip[data-cx-order="' + id + '"]');
  const val = (k) => { const el = strip && strip.querySelector('[data-cx-f="' + k + '"]'); return el ? el.value.trim() : ''; };
  const po = val('po_name'), room = val('room_name'), addr = val('delivery_address');
  cxState.draft[id] = { po_name: po, room_name: room, delivery_address: addr };
  if (!po || !addr) { cxState.msg[id] = { err: true, t: cT('need') }; return mpRender(); }
  if (!confirm(cT('confirm', { po }))) return;
  cxState.saving[id] = 'rel'; mpRender();
  try {
    const a = cxState.acc || {};
    const upd = { status: 'approved', approved_at: new Date().toISOString(), po_name: po, room_name: room || null, delivery_address: addr };
    // cadastro vem da empresa: só preenche o que o pedido ainda não tem
    if (!String(o.client_name || '').trim()) upd.client_name = a.trade_name || a.legal_name || po;
    if (!String(o.client_phone || '').trim() && a.phone) upd.client_phone = a.phone;
    if (!String(o.client_email || '').trim()) upd.client_email = a.billing_email || (typeof currentUser !== 'undefined' && currentUser ? currentUser.email : null);
    const x = cxState.extra[id] || {};
    if (addr !== String(o.delivery_address || '').trim() || x.jobsite_lat == null) {
      let g = (cxState.sug[id] || []).find((s) => s.txt === addr) || null;
      if (!g) { try { g = await cxGeocode(addr); } catch (e) { g = null; } }
      if (g) { upd.jobsite_lat = g.lat; upd.jobsite_lng = g.lng; upd.jobsite_geocoded_at = new Date().toISOString(); }
    }
    const { data, error } = await supabaseClient.from('orders').update(upd).eq('id', id).eq('status', 'submitted').select('id');
    if (error) throw error;
    if (!data || !data.length) throw new Error(typeof I18n !== 'undefined' ? I18n.t('project.update_blocked') : 'blocked');
    if (typeof currentDraftOrderId !== 'undefined' && currentDraftOrderId === id) {
      try { currentDraftOrderId = null; currentDraftOrderStatus = null; cartItems = []; renderCart(); } catch (e) { /* carrinho fechado */ }
    }
    cxState.msg[id] = { t: cT('released') };
    cxState.scope = null;
    delete cxState.saving[id];
    if (typeof mpLoad === 'function') mpLoad();
  } catch (e) {
    delete cxState.saving[id];
    cxState.msg[id] = { err: true, t: (e && e.message) || String(e) };
    mpRender();
  }
}
async function cxAdminRelease(id, qual) {
  const o = cxState.scope && cxState.scope.orders.find((x) => x.id === id);
  if (!o || !cxAdmin()) return;
  const n = Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : (o.po_name || '');
  if (!confirm(cT(qual === 'prod' ? 'rel_prod_q' : 'rel_pick_q', { n }))) return;
  const agora = new Date().toISOString();
  const patch = qual === 'prod' ? { finance_released_at: agora, finance_released_by: cxMe() } : { pickup_released_at: agora, pickup_released_by: cxMe() };
  const { data, error } = await supabaseClient.from('orders').update(patch).eq('id', id).select('id');
  if (error || !data || !data.length) { alert((error && error.message) || 'RLS'); return; }
  Object.assign(o, patch); o._s = cxStage(o);
  mpRender();
}


// ---------- ENVIAR PRA FÁBRICA direto da lista (21/11) ----------
// Matt: "depois que ele salvar o projeto ele já sobe na listagem de pedidos
// em projeto, com os preços certos, quero um botão na própria barra de status
// com ENVIAR FÁBRICA. Ao clicar, mensagem dizendo da trava como é hoje, dando
// aceite do que o cliente vai comprar e não pode pedir alteração,
// responsabilidade do projeto é dele". Um passo só: abre o projeto por baixo
// (mesmo motor do envio da pasta: restoreFavoriteProject + sendProjectToOrder
// em modo lote), cria o pedido e já libera pra fábrica (status approved, igual
// ao "Liberar pra fábrica") com PO, ambiente, endereço e o ACEITE gravado
// (migration 315: terms_accepted_at/_by/_version — sem ela o pedido sai sem
// o registro do aceite). Só o DONO do projeto envia (o pedido nasce na conta
// de quem envia); vendedor envia se o banco deixar (permissão send_orders).
const SF_TERMS_VERSION = '2026-11-21';
const SF_TXT = {
  pt: { btn: 'ENVIAR FÁBRICA', title: 'Enviar pra fábrica', proj: 'Projeto', val: 'Valor de fábrica', po: 'PO (vai na etiqueta) *', room: 'Ambiente', addr: 'Endereço da obra *',
    t1: 'Ao enviar, este projeto fica CONGELADO: módulos, cores, peças, medidas e posições não podem mais ser alterados. É exatamente isto que vai ser produzido.',
    t2: 'Depois de enviado, NÃO é possível pedir alteração do pedido. Pra mudar alguma coisa, duplique o projeto e envie um pedido novo.',
    t3: 'Medidas, conferência no local, desenho e compatibilidade com o ambiente (eletrodomésticos, bancada, hidráulica, elétrica, instalação) são de responsabilidade de quem envia o pedido.',
    t4: 'O pedido cobre só os gabinetes de fábrica: não inclui eletrodomésticos, pedra/bancada nem obra.',
    ok: 'Li e aceito. Conferi o projeto e assumo a responsabilidade por ele.', send: 'ENVIAR PRA FÁBRICA', cancel: 'Cancelar', need: 'Preencha o PO e o endereço da obra e marque o aceite.',
    s_open: 'Abrindo o projeto…', s_send: 'Criando o pedido…', s_rel: 'Liberando pra fábrica…', done: 'Pedido {n} enviado pra fábrica.', unsaved: 'O projeto aberto no editor tem alterações não salvas, que serão perdidas. Continuar?', skipped: '{n} módulo(s) do projeto não carregaram. Abra o projeto, confira e salve antes de enviar.' },
  en: { btn: 'SEND TO FACTORY', title: 'Send to factory', proj: 'Project', val: 'Factory value', po: 'PO (goes on the label) *', room: 'Room', addr: 'Job site address *',
    t1: 'Once sent, this project is LOCKED: modules, colors, parts, sizes and positions can no longer be changed. This is exactly what will be produced.',
    t2: 'After sending, changes to the order CANNOT be requested. To change anything, duplicate the project and send a new order.',
    t3: 'Measurements, site verification, design and fit with the space (appliances, countertop, plumbing, electrical, installation) are the responsibility of whoever sends the order.',
    t4: 'The order covers factory cabinets only: no appliances, stone/countertop or construction work.',
    ok: 'I have read and accept. I checked the project and take responsibility for it.', send: 'SEND TO FACTORY', cancel: 'Cancel', need: 'Fill in the PO and job site address and check the acceptance box.',
    s_open: 'Opening the project…', s_send: 'Creating the order…', s_rel: 'Releasing to the factory…', done: 'Order {n} sent to the factory.', unsaved: 'The project open in the editor has unsaved changes that will be lost. Continue?', skipped: '{n} module(s) of the project did not load. Open the project, check it and save before sending.' },
  es: { btn: 'ENVIAR FÁBRICA', title: 'Enviar a fábrica', proj: 'Proyecto', val: 'Valor de fábrica', po: 'PO (va en la etiqueta) *', room: 'Ambiente', addr: 'Dirección de la obra *',
    t1: 'Al enviar, este proyecto queda CONGELADO: módulos, colores, piezas, medidas y posiciones ya no se pueden cambiar. Es exactamente lo que se va a producir.',
    t2: 'Después de enviado, NO se pueden pedir cambios al pedido. Para cambiar algo, duplique el proyecto y envíe un pedido nuevo.',
    t3: 'Medidas, verificación en obra, diseño y compatibilidad con el ambiente (electrodomésticos, encimera, plomería, electricidad, instalación) son responsabilidad de quien envía el pedido.',
    t4: 'El pedido cubre solo los gabinetes de fábrica: no incluye electrodomésticos, piedra/encimera ni obra.',
    ok: 'Leí y acepto. Revisé el proyecto y asumo la responsabilidad.', send: 'ENVIAR A FÁBRICA', cancel: 'Cancelar', need: 'Complete el PO y la dirección de la obra y marque la aceptación.',
    s_open: 'Abriendo el proyecto…', s_send: 'Creando el pedido…', s_rel: 'Liberando a fábrica…', done: 'Pedido {n} enviado a fábrica.', unsaved: 'El proyecto abierto en el editor tiene cambios sin guardar que se perderán. ¿Continuar?', skipped: '{n} módulo(s) del proyecto no cargaron. Abra el proyecto, revíselo y guárdelo antes de enviar.' }
};
function sfT(k, v) { const L = SF_TXT[cxLang()] || SF_TXT.en; let t = L[k] != null ? L[k] : (SF_TXT.en[k] || k); Object.keys(v || {}).forEach((x) => { t = t.split('{' + x + '}').join(v[x]); }); return t; }
function cxSendFactoryOpen(id) {
  const o = cxState.scope && cxState.scope.orders.find((x) => x.id === id);
  if (!o || !o._proj) return;
  if (typeof isRetailClientAccount === 'function' && isRetailClientAccount()) { if (typeof showBecomeDealerModal === 'function') showBecomeDealerModal(); return; }
  document.getElementById('cx-sf') && document.getElementById('cx-sf').remove();
  const w = document.createElement('div');
  w.id = 'cx-sf';
  const valor = o._n != null ? o._n : o._l;
  w.innerHTML = '<div class="cx-sf-box" role="dialog" aria-modal="true"><h3>' + cEsc(sfT('title')) + '</h3>'
    + '<p class="cx-sf-sum"><span>' + cEsc(sfT('proj')) + ': <b>' + cEsc(o._pname || o.po_name || '—') + '</b>' + (o._folder ? ' · ' + cEsc(o._folder) : '') + '</span>'
    + (valor && !cxSeller() ? '<span>' + cEsc(sfT('val')) + ': <b>' + cEsc(cMoney(valor)) + '</b></span>' : '') + '</p>'
    + '<label>' + cEsc(sfT('po')) + '<input id="cx-sf-po" maxlength="60" value="' + cEsc(o._po || '') + '"></label>'
    + '<label>' + cEsc(sfT('room')) + '<input id="cx-sf-room" maxlength="60" value="' + cEsc(o._pname || '') + '"></label>'
    + '<label>' + cEsc(sfT('addr')) + '<input id="cx-sf-addr" maxlength="200" value="' + cEsc(o.delivery_address || '') + '"></label>'
    + '<div class="cx-sf-terms"><p>🔒 ' + cEsc(sfT('t1')) + '</p><p>⛔ ' + cEsc(sfT('t2')) + '</p><p>📐 ' + cEsc(sfT('t3')) + '</p><p>🧾 ' + cEsc(sfT('t4')) + '</p></div>'
    + '<label class="cx-sf-ok"><input type="checkbox" id="cx-sf-chk"> <span>' + cEsc(sfT('ok')) + '</span></label>'
    + '<p class="cx-sf-msg" id="cx-sf-msg"></p>'
    + '<div class="cx-sf-acts"><button type="button" class="secondary" id="cx-sf-cancel">' + cEsc(sfT('cancel')) + '</button>'
    + '<button type="button" class="cx-sendfab" id="cx-sf-go" disabled>' + cEsc(sfT('send')) + '</button></div></div>';
  document.body.appendChild(w);
  const $ = (q) => w.querySelector(q);
  const pronto = () => { $('#cx-sf-go').disabled = !($('#cx-sf-chk').checked && $('#cx-sf-po').value.trim() && $('#cx-sf-addr').value.trim()); };
  ['#cx-sf-chk', '#cx-sf-po', '#cx-sf-addr'].forEach((q) => { $(q).addEventListener('input', pronto); $(q).addEventListener('change', pronto); });
  const fecha = () => { if (!w.dataset.busy) w.remove(); };
  $('#cx-sf-cancel').addEventListener('click', fecha);
  w.addEventListener('click', (e) => { if (e.target === w) fecha(); });
  $('#cx-sf-go').addEventListener('click', () => cxSendFactoryRun(o, w, { po: $('#cx-sf-po').value.trim(), room: $('#cx-sf-room').value.trim(), addr: $('#cx-sf-addr').value.trim() }));
  setTimeout(() => $('#cx-sf-po').focus(), 30);
}
async function cxSendFactoryRun(o, w, f) {
  const msg = w.querySelector('#cx-sf-msg');
  const setMsg = (t, err) => { msg.textContent = t; msg.classList.toggle('err', !!err); };
  if (!f.po || !f.addr || !w.querySelector('#cx-sf-chk').checked) return setMsg(sfT('need'), true);
  if (typeof projectDirty !== 'undefined' && projectDirty && typeof projectSlots !== 'undefined' && projectSlots.length && !confirm(sfT('unsaved'))) return;
  w.dataset.busy = '1';
  w.querySelectorAll('button, input').forEach((el) => { el.disabled = true; });
  try {
    setMsg(sfT('s_open'));
    const proj = { id: o._pid, name: o._pname };
    await fetchProjectFullRow(proj);
    const r = await restoreFavoriteProject(proj);
    if (!r || !r.ok) throw (r && r.error) || new Error('load');
    if (r.skipped > 0) throw new Error(sfT('skipped', { n: r.skipped }));
    await projectWaitInteriorsReady();
    setMsg(sfT('s_send'));
    const orderId = await sendProjectToOrder({ bulk: true, poName: f.po, clientNameFallback: o._folder || f.po });
    if (!orderId) throw new Error('order');
    setMsg(sfT('s_rel'));
    const agora = new Date().toISOString();
    const upd = { status: 'approved', approved_at: agora, po_name: f.po, room_name: f.room || null, delivery_address: f.addr };
    const a = cxState.acc || {};
    if (a.phone) upd.client_phone = upd.client_phone || a.phone;
    try { const g = await cxGeocode(f.addr); if (g) { upd.jobsite_lat = g.lat; upd.jobsite_lng = g.lng; upd.jobsite_geocoded_at = agora; } } catch (e) { /* sem mapa */ }
    const aceite = { terms_accepted_at: agora, terms_accepted_by: cxMe(), terms_version: SF_TERMS_VERSION };
    if (o.client_user_id && o.client_user_id !== cxMe()) {
      // ADMIN enviando projeto de outra conta: o pedido é do DONO do projeto (e da loja dele)
      const sc = cxState.scope || {};
      const tm = (sc.team || {})[o.client_user_id] || {}; const em = (sc.emails || {})[o.client_user_id] || {};
      upd.client_user_id = o.client_user_id;
      if (tm.email || em.email) upd.client_email = tm.email || em.email;
      if (o.account_id) upd.account_id = o.account_id;
    }
    let res = await supabaseClient.from('orders').update(Object.assign({}, upd, aceite)).eq('id', orderId).eq('status', 'submitted').select('id, factory_number');
    if (res.error && /terms_accepted|terms_version|jobsite/.test(res.error.message || '')) {
      // migration 315 (ou 306) ainda não rodou: libera sem o registro do aceite
      ['jobsite_lat', 'jobsite_lng', 'jobsite_geocoded_at'].forEach((k) => { if (/jobsite/.test(res.error.message)) delete upd[k]; });
      res = await supabaseClient.from('orders').update(upd).eq('id', orderId).eq('status', 'submitted').select('id, factory_number');
    }
    if (res.error) throw res.error;
    const fn = res.data && res.data[0] && Number(res.data[0].factory_number) > 0 ? String(Number(res.data[0].factory_number)).padStart(5, '0') : f.po;
    delete w.dataset.busy; w.remove();
    alert(sfT('done', { n: fn }));
  } catch (e) {
    delete w.dataset.busy;
    w.querySelectorAll('button, input').forEach((el) => { el.disabled = false; });
    setMsg((e && e.message) || String(e), true);
    return;
  } finally {
    cxState.scope = null;
    if (typeof myOrdersLoaded !== 'undefined') myOrdersLoaded = false;
    if (!document.getElementById('cx-sf') && typeof mpLoad === 'function') mpLoad();
  }
}

// ---------- eventos (captura no documento: o portal-09 nem fica sabendo) ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-cx]');
  if (!b || !cxOn()) return;
  const a = b.getAttribute('data-cx');
  if (a === 'pickstore') {
    e.stopPropagation();
    if (b.querySelector('select')) return; // já aberto: deixa o select funcionar
    const o = cxState.scope && cxState.scope.orders.find((x) => x.id === b.getAttribute('data-id'));
    if (!o) return;
    b.innerHTML = '<select data-cx-store="' + cEsc(o.id) + '" class="cx-storesel">' + cxStoreOptions(o.account_id || null, null) + '</select>';
    const sel = b.querySelector('select'); if (sel) sel.focus();
    return;
  }
  e.stopPropagation(); e.preventDefault();
  if (a === 'view') {
    const v = b.getAttribute('data-v');
    cxState.view = cxState.view === v ? '' : v;
    if (cxState.view === 'lost') { mpState.ctab = 'all'; mpState.open = new Set(); }
    if (cxState.view === 'map') cxLoadScope(!cxState.scope);
    return mpRender();
  }
  if (a === 'release') return cxRelease(b.getAttribute('data-id'));
  if (a === 'lost' || a === 'reopen') {
    const ids = (b.getAttribute('data-ids') || '').split(',').filter(Boolean);
    const api = window.LegnoMinhaEmpresa;
    if (!api || !ids.length) return;
    b.disabled = true;
    (a === 'lost' ? api.marcarPerdido(ids, b.getAttribute('data-nome')) : api.reabrir(ids))
      .then((ok) => { if (ok) { cxState.lostLoaded = false; if (typeof mpLoad === 'function') mpLoad(); } else b.disabled = false; })
      .catch((err) => { b.disabled = false; alert((err && err.message) || String(err)); });
    return;
  }
  if (a === 'ddopen') {
    const c = b.getAttribute('data-c');
    cxState.colOpen = cxState.colOpen === c ? '' : c;
    document.querySelectorAll('.cx-dd').forEach((el) => el.classList.toggle('open', !!cxState.colOpen && el.getAttribute('data-cx-dd') === cxState.colOpen));
    const inp = document.querySelector('.cx-dd.open [data-cx-colq]'); if (inp) inp.focus();
    return;
  }
  if (a === 'col') {
    cxState.colOpen = '';
    const c = b.getAttribute('data-c'), v = b.getAttribute('data-v'), f = cxState.net;
    f.own = false;
    // Fábrica = SEMPRE tudo (20/11, Matt: "ainda mostra opção errada, sem tudo"): clicar
    // nela nunca desliga; só limpa dealer/vendedor/cliente. As pastas da própria
    // conta ficam só no botão "‹ Minhas pastas".
    if (c === 'fab') { f.fab = true; f.loja = ''; f.user = ''; f.cliente = ''; }
    else if (c === 'loja') { f.loja = (f.loja === v && !f.user && !f.cliente) ? '' : v; f.user = ''; f.cliente = ''; cxState.colQ.user = ''; cxState.colQ.cliente = ''; }
    else if (c === 'user') { f.user = f.user === v ? '' : v; f.cliente = ''; }
    else if (c === 'cliente') { f.cliente = f.cliente === v ? '' : v; }
    return mpRender();
  }
  if (a === 'folders') { const f = cxState.net; f.fab = false; f.own = true; f.hoje = false; f.loja = ''; f.user = ''; f.cliente = ''; f.etapa = ''; f.q = ''; return mpRender(); }
  if (a === 'grow') { const k = b.getAttribute('data-k'); const ab = cxState.netOpen || (cxState.netOpen = new Set()); if (ab.has(k)) ab.delete(k); else ab.add(k); return mpRender(); }
  if (a === 'gsort') { const c = b.getAttribute('data-col'); const st = cxState.netSort || (cxState.netSort = { col: 'upd', dir: -1 }); if (st.col === c) st.dir = -st.dir; else { st.col = c; st.dir = (c === 'nome' || c === 'cliente' || c === 'loja') ? 1 : -1; } return mpRender(); }
  if (a === 'hmenu') { const jaAberto = document.getElementById('cx-hmenu') && cxState.hmenuCol === b.getAttribute('data-col'); cxCloseHeadMenu(); if (jaAberto) { cxState.hmenuCol = ''; return; } cxState.hmenuCol = b.getAttribute('data-col'); return cxHeadMenu(cxState.hmenuCol, b); }
  if (a === 'hpick') {
    const g = b.getAttribute('data-g'), v = b.getAttribute('data-v'), f = cxState.net;
    if (g === 'sort') { const x = v.split(':'); cxState.netSort = { col: x[0], dir: Number(x[1]) }; }
    else if (g === 'etapa') f.etapa = v; else if (g === 'user') { f.user = v; f.cliente = ''; } else if (g === 'gstatus') f.gstatus = v; else if (g === 'periodo') f.periodo = v;
    cxCloseHeadMenu(); cxState.hmenuCol = '';
    return mpRender();
  }
  if (a === 'layout') { cxState.netLayout = cxState.netLayout === 'pastas' ? 'lista' : 'pastas'; if (cxState.netLayout === 'pastas' && cxState.netSort && ['num', 'quem'].indexOf(cxState.netSort.col) < 0) { /* mesma ordem */ } else if (cxState.netLayout === 'pastas') cxState.netSort = { col: 'upd', dir: -1 }; return mpRender(); }
  if (a === 'fclear') { const f = cxState.net; f.gstatus = ''; f.periodo = ''; f.user = ''; f.cliente = ''; if (f.etapa !== '_orders' && f.etapa !== 'build') f.etapa = ''; return mpRender(); }
  if (a === 'etapa') { const v = b.getAttribute('data-v'); cxState.net.etapa = cxState.net.etapa === v ? '' : v; return mpRender(); }
  if (a === 'maplegend') { const v = b.getAttribute('data-v'); cxState.mapHide[v] = !cxState.mapHide[v]; return mpRender(); }
  if (a === 'geocode') return cxGeocodeMissing();
  if (a === 'sendfab') { e.stopPropagation(); e.preventDefault(); return cxSendFactoryOpen(b.getAttribute('data-id')); }
  if (a === 'relprod') return cxAdminRelease(b.getAttribute('data-id'), 'prod');
  if (a === 'relpick') return cxAdminRelease(b.getAttribute('data-id'), 'pick');
  if (a === 'openorder') {
    const id = b.getAttribute('data-id');
    const o = cxState.scope && cxState.scope.orders.find((x) => x.id === id);
    if (!o || o._proj) return;
    if (o && o.client_user_id === cxMe() && typeof openOrderDetail === 'function') return openOrderDetail(id);
    if (cxAdmin()) window.open('erp/index.html#/pedidos/' + id, '_blank', 'noopener');
  }
}, true);
document.addEventListener('click', (e) => {
  if (!cxState.colOpen || (e.target.closest && e.target.closest('.cx-dd'))) return;
  cxState.colOpen = '';
  document.querySelectorAll('.cx-dd.open').forEach((el) => el.classList.remove('open'));
}, true);
document.addEventListener('click', (e) => {
  if (!document.getElementById('cx-hmenu')) return;
  if (e.target.closest && (e.target.closest('#cx-hmenu') || e.target.closest('[data-cx="hmenu"]'))) return;
  cxCloseHeadMenu(); cxState.hmenuCol = '';
}, true);
window.addEventListener('scroll', () => { if (document.getElementById('cx-hmenu')) { cxCloseHeadMenu(); cxState.hmenuCol = ''; } }, true);
// aba normal clicada: sai do modo perdidos/mapa/lojas
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('#po-mp-v2 [data-act="ctab"]')) {
    cxState.view = '';
    const f = cxState.net; f.loja = ''; f.user = ''; f.cliente = '';
    if (cxHasNetwork() && !f.own && cxOn()) {
      // fábrica: as abas normais filtram a lista de TODO MUNDO (não as pastas dela)
      const t = e.target.closest('[data-act="ctab"]').dataset.tab;
      if (t !== 'archived') { f.fab = true; f.etapa = { all: '', build: 'build', prod: '_orders', done: 'done' }[t] || ''; cxState.netSort = (t === 'build' || t === 'prod') ? { col: 'num', dir: -1 } : { col: 'upd', dir: -1 }; e.stopPropagation(); e.preventDefault(); mpRender(); return; }
    }
    f.fab = false; // aba normal = pastas
  }
}, true);
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || !t.getAttribute) return;
  if (t.getAttribute('data-cx-f')) { e.stopPropagation(); cxSaveField(t); return; }
  if (t.getAttribute('data-cx-store')) { e.stopPropagation(); cxMoveOrders([t.getAttribute('data-cx-store')], t.value); return; }
  if (t.id === 'cx-move-all') { e.stopPropagation(); if (t.value) cxMoveOrders(cxNetRows().map((o) => o.id), t.value); return; }
}, true);
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || !t.getAttribute) return;
  if (t.getAttribute('data-cx-f')) {
    const st = t.closest('[data-cx-order]');
    if (st) { const id = st.getAttribute('data-cx-order'); (cxState.draft[id] = cxState.draft[id] || {})[t.getAttribute('data-cx-f')] = t.value; }
  }
  if (t.getAttribute('data-cx-f') === 'delivery_address') cxSuggest(t);
  if (t.getAttribute('data-cx-colq')) { const k = t.getAttribute('data-cx-colq'); cxState.colQ[k] = t.value; cxColFilter(k); return; }
  if (t.id === 'cx-net-q') { cxState.net.q = t.value; clearTimeout(cxState.qTimer); cxState.qTimer = setTimeout(() => mpRender(), 250); }
}, true);
document.addEventListener('scroll', (e) => {
  const t = e.target;
  if (t && t.getAttribute && t.classList && t.classList.contains('cx-col-b')) cxState.colScroll[t.getAttribute('data-cx-colb') || 'fab'] = t.scrollTop;
}, true);
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && t.getAttribute && t.getAttribute('data-cx-f')) { e.stopPropagation(); if (e.key === 'Enter') t.blur(); }
}, true);

// ---------- SALVAR PROJETO: loja + PO (admin) ----------
// Chamado pelo salvar do portal-09. Devolve null (não é admin / projeto já tem
// loja: nada a perguntar), { account_id, po_name } ou false (cancelou).
async function getProjectStoreForSave(opts) {
  if (!cxOn() || !cxAdmin()) return null;
  let poAtual = '';
  try {
    if (opts && opts.projectId) {
      const { data, error } = await supabaseClient.from('user_projects').select('account_id, po_name').eq('id', opts.projectId).maybeSingle();
      if (error) return null;                 // sem a migration 310: salva como sempre
      if (data && data.account_id) return null; // já tem loja
      poAtual = (data && data.po_name) || '';
    } else {
      const probe = await supabaseClient.from('user_projects').select('id, account_id').limit(1);
      if (probe.error) return null;
    }
    const tr = await supabaseClient.rpc('account_tree');
    if (tr.error) return null;
    const lojas = (tr.data || []).filter((a) => a.kind !== 'factory' && a.status !== 'draft' && a.status !== 'rejected')
      .sort((a, b) => String(a.trade_name || a.legal_name || '').localeCompare(String(b.trade_name || b.legal_name || '')));
    const fab = (tr.data || []).find((a) => a.kind === 'factory');
    cxCss();
    return await new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'cx-save-ov';
      ov.innerHTML = '<div class="cx-save-box"><h3>' + cEsc(cT('sv_title')) + '</h3><p class="hint">' + cEsc(cT('sv_hint')) + '</p>'
        + '<label><span>' + cEsc(cT('sv_store')) + '</span><select class="cx-save-store"><option value="">' + cEsc(cT('sv_pick')) + '</option>'
        + lojas.map((a) => '<option value="' + cEsc(a.id) + '">' + cEsc(a.trade_name || a.legal_name || '—') + '</option>').join('') + '<option value="__new">' + cEsc(cT('mv_new')) + '</option></select></label>'
        + '<label><span>' + cEsc(cT('sv_po')) + '</span><input type="text" class="cx-save-po" maxlength="60" autocomplete="off" value="' + cEsc(poAtual) + '"></label>'
        + '<p class="error cx-save-err" style="display:none"></p>'
        + '<div class="cx-save-foot"><button type="button" class="secondary" data-x="0">' + cEsc(cT('sv_cancel')) + '</button><button type="button" data-x="1">' + cEsc(cT('sv_ok')) + '</button></div></div>';
      const sel = ov.querySelector('.cx-save-store'), po = ov.querySelector('.cx-save-po'), err = ov.querySelector('.cx-save-err');
      sel.addEventListener('change', async () => {
        if (sel.value !== '__new') return;
        const nome = (prompt(cT('mv_new_q')) || '').trim();
        if (!nome) { sel.value = ''; return; }
        const { data, error } = await supabaseClient.from('accounts').insert({ kind: 'dealer', status: 'active', parent_account_id: fab ? fab.id : null, trade_name: nome }).select('id').single();
        if (error) { err.textContent = error.message; err.style.display = ''; sel.value = ''; return; }
        const o = document.createElement('option'); o.value = data.id; o.textContent = nome;
        sel.insertBefore(o, sel.querySelector('option[value="__new"]')); sel.value = data.id;
        cxState.accNames[data.id] = nome; cxState.scope = null;
      });
      ov.addEventListener('click', (e) => {
        const b = e.target.closest('[data-x]');
        if (!b) return;
        if (b.getAttribute('data-x') === '0') { ov.remove(); return resolve(false); }
        if (!sel.value || sel.value === '__new' || !po.value.trim()) { err.textContent = cT('sv_need'); err.style.display = ''; return; }
        const r = { account_id: sel.value, po_name: po.value.trim() };
        ov.remove(); cxState.scope = null; resolve(r);
      });
      document.body.appendChild(ov);
      sel.focus();
    });
  } catch (e) { return null; }
}

// ---------- embrulhos ----------
(function cxWrap() {
  if (typeof window.cuAfterRender === 'function') {
    const orig = window.cuAfterRender;
    window.cuAfterRender = function () {
      const r = orig.apply(this, arguments);
      try { cxDecorate(arguments[0]); } catch (e) { console.warn('[central+]', e); }
      return r;
    };
  }
  // perdidos saem das outras abas; na aba Perdidos só eles aparecem
  if (typeof window.cuRows === 'function') {
    const orig = window.cuRows;
    window.cuRows = function () {
      const rows = orig.apply(this, arguments);
      if (!cxOn() || !Object.keys(cxState.lost).length && cxState.view !== 'lost') return rows;
      const perdido = (p) => !!cxState.lost[p.id];
      const out = [];
      rows.forEach((f) => {
        if (f.kind !== 'build') { if (cxState.view !== 'lost') out.push(f); return; }
        const lista = (f.lista || []).filter((p) => (cxState.view === 'lost') === perdido(p));
        if (!lista.length) return;
        if (lista.length === f.lista.length) { out.push(f); return; }
        out.push(Object.assign({}, f, { lista, n: lista.length }));
      });
      return out;
    };
  }
  if (typeof window.mpLoad === 'function') {
    const orig = window.mpLoad;
    window.mpLoad = function () {
      cxState.extraFor = ''; cxState.lostLoaded = false; cxState.msg = {}; cxState.draft = {};
      return orig.apply(this, arguments);
    };
  }
})();

function cxCss() {
  if (document.getElementById('cx-css')) return;
  const st = document.createElement('style');
  st.id = 'cx-css';
  st.textContent = [
    '.cx-strip{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-end;padding:8px 12px 12px 14px;margin:-2px 0 8px;border-left:3px solid var(--accent,#8a5a34);background:rgba(138,90,52,.05);border-radius:0 0 8px 8px}',
    '.cx-strip.ro{align-items:center;padding:6px 12px 8px 14px;border-left-color:var(--border,#e0ddd6);background:transparent}',
    '.cx-f{display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--muted,#766f64);flex:1;min-width:150px}.cx-f.cx-delivery_address{flex:2.2;min-width:240px}',
    '.cx-f input{padding:7px 9px;border:1px solid var(--border,#e0ddd6);border-radius:7px;font-size:13px;background:#fff;color:var(--text,#2b2621);width:100%}',
    '.cx-price{display:flex;gap:12px;font-size:12px;color:var(--muted,#766f64);white-space:nowrap;align-items:center;padding-bottom:6px}.cx-price b{color:var(--text,#2b2621);font-size:13px}.cx-price .cx-net b{color:var(--accent-dark,#6e4527)}',
    '.cx-strip.ro .cx-price{padding-bottom:0;margin-left:auto}',
    '.cx-ro{display:flex;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--muted,#766f64)}.cx-ro .cx-po{color:var(--text,#2b2621);font-weight:600}.cx-ro i{font-style:normal;opacity:.5}',
    '.cx-go{display:flex;gap:10px;align-items:center;flex-basis:100%}.cx-go button{margin:0;padding:7px 16px}.cx-st{font-size:12px}.cx-st.ok{color:#2e7d4f}.cx-st.err{color:var(--danger,#b3432f)}',
    '.cx-lostbar{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin:6px 0 2px}.cx-lostbar button{margin:0;padding:4px 12px;font-size:12px}',
    '.cx-save-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10003;display:flex;align-items:center;justify-content:center;padding:16px}.cx-save-box{background:var(--panel,#fff);color:var(--text,#2b2621);border-radius:12px;padding:20px 22px;max-width:440px;width:100%;display:flex;flex-direction:column;gap:10px}.cx-save-box h3,.cx-save-box p{margin:0}.cx-save-box label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted,#766f64)}.cx-save-box select,.cx-save-box input{padding:9px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:14px;background:#fff;color:var(--text,#2b2621);width:100%;margin:0}.cx-save-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}.cx-save-foot button{margin:0}',
    '.cx-storecell{cursor:pointer}.cx-storecell:hover b{text-decoration:underline}.cx-swap{color:var(--muted,#766f64);font-size:12px}.cx-storesel,.cx-moveall{padding:6px 8px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:13px;background:#fff;max-width:260px;width:auto;margin:0}.cx-moveall{margin-left:auto}',
    '.cx-gtable>thead th{cursor:pointer;white-space:nowrap}.cx-gtable>tbody>tr.cx-grow>td{white-space:normal}.cx-loja2{max-width:220px;overflow:hidden;text-overflow:ellipsis}.cx-loja2 .hint{font-size:11px}.cx-gexp>td{padding:0 0 10px 34px;background:rgba(0,0,0,.015)}.cx-inner{overflow:auto}.cx-inner .cx-table{margin:0}.cx-inner .cx-table thead th{font-size:11px}',
    '.cx-hmenu{max-height:70vh;overflow:auto}.cx-quem{font-size:12px;color:var(--muted,#766f64)}',
    '.cx-nwrap{display:inline-flex;align-items:center;gap:7px}.cx-nico{display:inline-flex;flex:none;color:var(--muted,#766f64)}.cx-nico svg{width:15px;height:15px}.cx-nico-f{color:inherit}',
    '.cx-num{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}.cx-num-p{color:var(--muted,#766f64)}.cx-pref{font-size:10px;font-weight:400;color:var(--muted,#766f64)}.cx-main>thead th{cursor:pointer}',
    '.cx-foot{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-top:10px;font-size:12px}.cx-foot .cx-moveall{margin-left:auto;font-size:12px;padding:4px 8px;color:var(--muted,#766f64)}.cx-link{background:none!important;border:0;padding:0;margin:0;color:var(--accent-dark,#6e4527);text-decoration:underline;cursor:pointer;font-size:12px;box-shadow:none!important}',
    '.cx-th-on{color:var(--accent-dark,#6e4527)}.cx-th-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent,#8a5a34);margin-right:5px;vertical-align:middle}',
    '.cx-hmenu{position:fixed;z-index:10004;background:#fff;border:1px solid var(--border,#e0ddd6);border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.18);padding:6px;min-width:210px;max-width:260px}.cx-hmenu hr{border:0;border-top:1px solid var(--border,#e0ddd6);margin:4px 0}',
    '.cx-hm-i{display:flex;align-items:center;gap:8px;width:100%;margin:0;padding:7px 10px;border:0;border-radius:7px;background:none!important;color:var(--text,#2b2621);font-size:13px;text-align:left;cursor:pointer;box-shadow:none!important}.cx-hm-i:hover{background:var(--bg,#f7f6f3)!important}.cx-hm-i.on{font-weight:700;color:var(--accent-dark,#6e4527)}.cx-hm-i i{width:9px;height:9px;border-radius:50%;flex:none}',
    '.cx-hoje{color:#1e6b3c}.cx-chip-hoje{border-color:#2e7d4f}',
    '.cx-est{color:var(--muted,#766f64)}.cx-est small{font-size:10px}',
    '.cx-main td,.cx-main th{white-space:nowrap}.cx-main td.cx-item{max-width:300px;overflow:hidden;text-overflow:ellipsis}.cx-main td.cx-quem{max-width:140px;overflow:hidden;text-overflow:ellipsis}.cx-stage + .cx-sendfab{margin-left:8px}.cx-sendfab{background:#8a4b1c;color:#fff;border:0;border-radius:5px;padding:3px 8px;font-size:10px;font-weight:700;letter-spacing:.02em;cursor:pointer;white-space:nowrap}.cx-sendfab:disabled{opacity:.45;cursor:default}',
    '#cx-sf{position:fixed;inset:0;background:rgba(20,16,10,.45);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px}',
    '.cx-sf-box{background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25)}.cx-sf-box h3{margin:0 0 8px}',
    '.cx-sf-sum{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;margin:0 0 12px}.cx-sf-box label{display:block;font-size:12px;margin:8px 0;color:#5c554b}.cx-sf-box label input:not([type=checkbox]){display:block;width:100%;margin-top:4px;padding:8px;border:1px solid #d9d3c8;border-radius:6px;font-size:14px}',
    '.cx-sf-terms{background:#fbf4ec;border:1px solid #e8cfb4;border-radius:8px;padding:10px 14px;margin:14px 0;font-size:13px;line-height:1.45}.cx-sf-terms p{margin:6px 0}',
    '.cx-sf-box label.cx-sf-ok{display:flex;gap:8px;align-items:flex-start;font-size:13px;font-weight:600;color:#2a251e}.cx-sf-msg{min-height:18px;font-size:13px;margin:8px 0}.cx-sf-msg.err{color:#b42318}.cx-sf-acts{display:flex;justify-content:flex-end;gap:8px}.cx-sf-acts .cx-sendfab{padding:10px 16px;font-size:13px}',
    '.cx-table tfoot .cx-tot td{font-weight:700;border-top:2px solid var(--line,#d9d3c8);padding-top:10px;padding-bottom:10px;background:var(--panel-2,#faf8f4)}',
    '.cx-tagp{font-size:10px;text-transform:uppercase;letter-spacing:.05em;border:1px solid var(--border,#e0ddd6);border-radius:10px;padding:1px 6px;color:var(--muted,#766f64)}',
    '#cx-tree{margin-top:12px}.cx-r{text-align:right;white-space:nowrap}.cx-loja{white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis}.cx-chip.cx-back{border-style:dashed}',
    '#cx-panel{margin-top:12px}.cx-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
    '.cx-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border,#e0ddd6);background:#fff;color:var(--text,#2b2621);border-radius:20px;padding:5px 12px;font-size:13px;margin:0;cursor:pointer}.cx-chip i{width:11px;height:11px;border-radius:50%;display:inline-block}.cx-chip.on{border-color:var(--accent,#8a5a34);box-shadow:0 0 0 1px var(--accent,#8a5a34)}.cx-chip.off{opacity:.45}',
    '#cx-panel .cx-chips .cx-chip:not(.on):not(.off){opacity:1}',
    '.cx-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.cx-filters input{padding:7px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:13px;background:#fff;width:320px;max-width:100%;flex:0 1 320px;margin:0;display:inline-block}.cx-filters button{margin:0}',
    '.cx-cols{display:grid;grid-template-columns:.9fr 1.2fr 1.2fr 1.2fr;gap:14px;margin-bottom:12px}',
    '.cx-col{border:1px solid var(--border,#e0ddd6);border-radius:12px;background:#fff;display:flex;flex-direction:column;min-width:0;position:relative}',
    '.cx-col:not(:last-child)::after{content:"›";position:absolute;right:-9px;top:50%;transform:translateY(-50%);font-size:18px;color:var(--muted,#766f64);background:var(--panel,#fff);line-height:1;z-index:1}',
    '.cx-col h5{margin:0;padding:9px 12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#766f64);border-bottom:1px solid var(--border,#e0ddd6);display:flex;justify-content:space-between}.cx-col h5 span{font-weight:400}',
    '.cx-dd-btn,.cx-dd-btn:hover,.cx-dd-btn:focus,.cx-dd-btn:active{background:none!important;box-shadow:none!important;transform:none!important}.cx-dd:not(.has):not(.on):hover{background:var(--bg,#f7f6f3)}',
    '.cx-dd{min-height:0}.cx-dd-btn{display:flex;align-items:center;gap:10px;width:100%;margin:0;padding:9px 12px;border:0;background:none;border-radius:12px;color:var(--text,#2b2621);cursor:pointer;text-align:left;font-size:13px;min-width:0}',
    '.cx-dd-btn:disabled{cursor:default;opacity:.55}.cx-dd-l{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#766f64);flex:none}',
    '.cx-dd-v{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}.cx-dd-q{flex:none;white-space:nowrap}.cx-dd-q small{font-size:11px;color:var(--muted,#766f64)}.cx-dd-a{font-style:normal;color:var(--muted,#766f64);flex:none}',
    '.cx-dd.has,.cx-dd-fab.on{background:var(--accent,#8a5a34);border-color:var(--accent,#8a5a34)}.cx-dd.has .cx-dd-btn,.cx-dd-fab.on .cx-dd-btn{color:#fff}.cx-dd.has .cx-dd-l,.cx-dd.has .cx-dd-a,.cx-dd.has .cx-dd-q small,.cx-dd-fab.on .cx-dd-l,.cx-dd-fab.on .cx-dd-q small{color:rgba(255,255,255,.8)}',
    '.cx-dd-pop{display:none;position:absolute;left:-1px;right:-1px;top:calc(100% + 4px);z-index:40;background:#fff;border:1px solid var(--border,#e0ddd6);border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.18);min-width:260px}.cx-dd.open .cx-dd-pop{display:block}',
    '.cx-col-b{max-height:300px;overflow:auto;padding:4px}.cx-col-e{margin:10px 8px;font-size:12px}',
    '.cx-col-s{display:flex;align-items:center;gap:6px;padding:5px 10px;border-bottom:1px solid var(--border,#e0ddd6);color:var(--muted,#766f64)}.cx-col-s svg{width:14px;height:14px;flex:none}',
    '.cx-col-s input{border:0;outline:0;background:none;font-size:13px;padding:2px 0;margin:0;width:100%;min-width:0;color:var(--text,#2b2621)}',
    '.cx-ci{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;margin:0;padding:7px 9px;border:0;border-radius:8px;background:none;color:var(--text,#2b2621);text-align:left;cursor:pointer;font-size:13px}.cx-ci:hover{background:var(--bg,#f7f6f3)}',
    '.cx-ci.on{background:var(--accent,#8a5a34);color:#fff}.cx-ci.on small{color:rgba(255,255,255,.8)}',
    '.cx-ci-n{min-width:0;display:flex;flex-direction:column;overflow:hidden}.cx-ci-n,.cx-ci-n small{white-space:nowrap;text-overflow:ellipsis}.cx-ci-n small,.cx-ci-q small{font-size:11px;color:var(--muted,#766f64);overflow:hidden}',
    '.cx-ci-q{display:flex;flex-direction:column;align-items:flex-end;flex:none}',
    '@media (max-width:900px){.cx-cols{grid-template-columns:1fr 1fr}.cx-col::after{display:none}}',
    '.cx-table td,.cx-table th{white-space:nowrap}.cx-table .r{text-align:right}.cx-table .cx-addr{white-space:normal;max-width:260px;font-size:12px;color:var(--muted,#766f64)}.cx-table tbody tr{cursor:pointer}.cx-table button{margin:0;padding:3px 10px;font-size:12px}',
    '.cx-stage{display:inline-flex;align-items:center;gap:6px}.cx-stage i{width:10px;height:10px;border-radius:50%;display:inline-block}',
    '.cx-map{height:560px;border-radius:12px;border:1px solid var(--border,#e0ddd6);overflow:hidden;z-index:0}',
    '@media (max-width:720px){.cx-map{height:420px}.cx-f{min-width:100%}}'
  ].join('\n');
  document.head.appendChild(st);
}

window.LegnoCentralPlus = { ligado: cxOn, recarregar: () => { cxState.scope = null; cxState.extraFor = ''; cxState.lostLoaded = false; if (typeof mpLoad === 'function') mpLoad(); } };
