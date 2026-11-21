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
const CX_COLORS = { wait: '#c58a2b', pay: '#7b6fd0', prod: '#2d7fc1', ready: '#12a37f', done: '#6b7280' };
const cxState = {
  off: false, view: '', extra: {}, extraFor: '', extraBusy: false, lost: {}, lostLoaded: false, lostBusy: false,
  acc: null, accLoaded: false, sug: {}, sugTimer: null, saving: {}, msg: {}, scope: null, scopeBusy: false,
  net: { loja: '', user: '', cliente: '', etapa: '', q: '' }, draft: {}, hasNet: null, mapEl: null, map: null, mapLayer: null, mapHide: {}, geoBusy: false
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
    s_wait: 'Aguardando aprovação', s_pay: 'Aguardando liberação', s_prod: 'Em produção', s_ready: 'Liberado pra coleta', s_done: 'Entregue',
    map_none: 'Nenhuma obra com endereço localizado ainda.', map_locate: 'Localizar {n} endereço(s) no mapa', map_locating: 'Localizando… {i}/{n}', map_missing: '{n} pedido(s) sem endereço', loading: 'Carregando…',
    map_fail: 'Não deu pra carregar o mapa (sem internet pro mapa?).', open: 'Abrir pedido',
    c_no: 'Nº', c_store: 'Loja', c_po: 'Etiqueta (PO)', c_room: 'Ambiente', c_city: 'Obra', c_stage: 'Etapa', c_date: 'Data', c_who: 'Quem',
    col_factory: 'Fábrica', col_dealer: 'Dealer', col_seller: 'Vendedor', col_client: 'Cliente final', col_all: 'Todos', col_pick: 'escolha à esquerda', matriz: 'Matriz', no_client: '— sem cliente —', f_all_stores: 'Todas as lojas', f_all_stages: 'Todas as etapas', f_search: 'Buscar PO, ambiente, endereço…', no_store: '— sem loja —', net_none: 'Nenhum pedido.',
    rel_prod: 'Liberar produção', rel_pick: 'Liberar coleta', rel_prod_q: 'Liberar o pedido {n} pra PRODUÇÃO?', rel_pick_q: 'Liberar o pedido {n} pra COLETA?', totals: '{n} pedido(s) · tabela {l} · com desconto {v}'
  },
  en: {
    po: 'Label name (PO)', po_ph: 'how you will find it on site', room: 'Room', room_ph: 'Kitchen, Master bath…', addr: 'Job site address', addr_ph: 'street, number, city, state',
    list: 'List', disc: 'Discount', net: 'Net', release: 'Release to factory', releasing: 'Releasing…',
    need: 'Fill in the label name and the job site address to release.', confirm: 'Release order "{po}" to the factory? Once released it can no longer be changed.',
    saved: 'saved', released: 'Order released to the factory.', frozen: 'price frozen at approval',
    t_lost: 'Lost', t_map: 'Map', t_net: 'Stores',
    lost_mark: 'Mark as lost', lost_reopen: 'Reopen project', lost_info: 'Lost on {d} — {r}', lost_empty: 'No lost projects.',
    s_wait: 'Waiting approval', s_pay: 'Waiting release', s_prod: 'In production', s_ready: 'Ready for pickup', s_done: 'Delivered',
    map_none: 'No job site located yet.', map_locate: 'Locate {n} address(es) on the map', map_locating: 'Locating… {i}/{n}', map_missing: '{n} order(s) with no address', loading: 'Loading…',
    map_fail: 'Could not load the map.', open: 'Open order',
    c_no: 'No.', c_store: 'Store', c_po: 'Label (PO)', c_room: 'Room', c_city: 'Job site', c_stage: 'Stage', c_date: 'Date', c_who: 'Who',
    col_factory: 'Factory', col_dealer: 'Dealer', col_seller: 'Salesperson', col_client: 'End client', col_all: 'All', col_pick: 'pick on the left', matriz: 'Headquarters', no_client: '— no client —', f_all_stores: 'All stores', f_all_stages: 'All stages', f_search: 'Search PO, room, address…', no_store: '— no store —', net_none: 'No orders.',
    rel_prod: 'Release production', rel_pick: 'Release pickup', rel_prod_q: 'Release order {n} to PRODUCTION?', rel_pick_q: 'Release order {n} for PICKUP?', totals: '{n} order(s) · list {l} · net {v}'
  },
  es: {
    po: 'Nombre de etiqueta (PO)', po_ph: 'cómo lo encontrará en la obra', room: 'Ambiente', room_ph: 'Cocina, baño principal…', addr: 'Dirección de la obra', addr_ph: 'calle, número, ciudad, estado',
    list: 'Lista', disc: 'Descuento', net: 'Con descuento', release: 'Liberar a fábrica', releasing: 'Liberando…',
    need: 'Complete el nombre de etiqueta y la dirección de la obra para liberar.', confirm: '¿Liberar el pedido "{po}" a la fábrica? Después no se puede modificar.',
    saved: 'guardado', released: 'Pedido liberado a la fábrica.', frozen: 'precio congelado en la aprobación',
    t_lost: 'Perdidos', t_map: 'Mapa', t_net: 'Tiendas',
    lost_mark: 'Marcar como perdido', lost_reopen: 'Reabrir proyecto', lost_info: 'Perdido el {d} — {r}', lost_empty: 'Ningún proyecto perdido.',
    s_wait: 'Esperando aprobación', s_pay: 'Esperando liberación', s_prod: 'En producción', s_ready: 'Listo para retiro', s_done: 'Entregado',
    map_none: 'Ninguna obra ubicada todavía.', map_locate: 'Ubicar {n} dirección(es) en el mapa', map_locating: 'Ubicando… {i}/{n}', map_missing: '{n} pedido(s) sin dirección', loading: 'Cargando…',
    map_fail: 'No se pudo cargar el mapa.', open: 'Abrir pedido',
    c_no: 'Nº', c_store: 'Tienda', c_po: 'Etiqueta (PO)', c_room: 'Ambiente', c_city: 'Obra', c_stage: 'Etapa', c_date: 'Fecha', c_who: 'Quién',
    col_factory: 'Fábrica', col_dealer: 'Dealer', col_seller: 'Vendedor', col_client: 'Cliente final', col_all: 'Todos', col_pick: 'elija a la izquierda', matriz: 'Matriz', no_client: '— sin cliente —', f_all_stores: 'Todas las tiendas', f_all_stages: 'Todas las etapas', f_search: 'Buscar PO, ambiente, dirección…', no_store: '— sin tienda —', net_none: 'Ningún pedido.',
    rel_prod: 'Liberar producción', rel_pick: 'Liberar retiro', rel_prod_q: '¿Liberar el pedido {n} a PRODUCCIÓN?', rel_pick_q: '¿Liberar el pedido {n} para RETIRO?', totals: '{n} pedido(s) · lista {l} · con descuento {v}'
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
    const lojas = (tr.data || []).filter((a) => a.kind !== 'factory').length;
    cxState.hasNet = lojas > 1 || (tm.data || []).length > 1;
  } catch (e) { cxState.hasNet = false; }
  if (cxState.hasNet && typeof mpRender === 'function' && typeof mpState !== 'undefined' && mpState.central) mpRender();
}
function cxDecorate() {
  if (!cxOn() || typeof mpState === 'undefined' || !mpState.central) return;
  const box = (typeof mpBox === 'function') ? mpBox() : document.getElementById('po-mp-v2');
  if (!box) return;
  cxCss();
  if (cxState.extraFor === '' || Object.keys(mpState.ordersById || {}).some((id) => !(id in cxState.extra))) cxLoadExtra();
  if (!cxState.lostLoaded) cxLoadLost();
  if (cxState.hasNet === null && !cxAdmin()) cxLoadNetFlag();

  // abas
  const tabs = box.querySelector('.cu-tabs');
  if (tabs && !tabs.querySelector('[data-cx="view"]')) {
    const nLost = Object.keys(cxState.lost).length;
    const b = (v, rot) => '<button type="button" class="mp-tab cu-tab cx-tab' + (cxState.view === v ? ' is-on' : '') + '" data-cx="view" data-v="' + v + '">' + cEsc(rot) + '</button>';
    tabs.insertAdjacentHTML('beforeend', b('lost', cT('t_lost') + ' (' + nLost + ')') + b('map', cT('t_map')) + (cxHasNetwork() ? b('net', cT('t_net')) : ''));
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

  // painel do mapa / lojas no lugar da tabela
  const painel = cxState.view === 'map' || cxState.view === 'net';
  box.querySelectorAll('.mp-table-wrap, .mp-empty').forEach((el) => { el.style.display = painel ? 'none' : ''; });
  if (cxState.view === 'lost' && !box.querySelector('.mp-table-wrap')) { const e = box.querySelector('.mp-empty'); if (e) e.textContent = cT('lost_empty'); }
  if (painel) {
    if (!cxState.scope && !cxState.scopeBusy) cxLoadScope(false);
    let p = box.querySelector('#cx-panel');
    if (!p) { p = document.createElement('div'); p.id = 'cx-panel'; box.appendChild(p); }
    if (cxState.view === 'map') cxRenderMap(p); else cxRenderNet(p);
  }
}

// ---------- REDE / MAPA: todos os pedidos que eu enxergo ----------
async function cxLoadScope(force) {
  if (cxState.scopeBusy || (cxState.scope && !force)) return;
  cxState.scopeBusy = true;
  const s = { orders: [], accounts: [], team: {}, users: 0 };
  try {
    const sb = supabaseClient;
    const od = await sb.from('orders')
      .select('id, client_user_id, account_id, status, order_type, po_name, client_name, client_email, room_name, delivery_address, jobsite_lat, jobsite_lng, price_list_total, price_discount_pct, price_net_total, factory_number, submitted_at, approved_at, finance_released_at, pickup_released_at, delivered_at')
      .in('status', ['submitted', 'approved', 'paid', 'delivered']).order('submitted_at', { ascending: false }).limit(3000);
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
    cxState.scope = s;
  } catch (e) { cxState.scope = { orders: [], accounts: [], team: {}, users: 0, err: (e && e.message) || String(e) }; }
  cxState.scopeBusy = false;
  if (typeof mpRender === 'function' && typeof mpState !== 'undefined' && mpState.central) mpRender();
}
function cxStoreName(o) {
  const a = (cxState.scope.accounts || []).find((x) => x.id === o.account_id);
  return a ? (a.trade_name || a.legal_name || '—') : cT('no_store');
}
function cxNetRows() {
  const s = cxState.scope; const f = cxState.net; const q = f.q.trim().toLowerCase();
  return s.orders.filter((o) => {
    if (f.loja && (o.account_id || '_') !== f.loja) return false;
    if (f.user && o.client_user_id !== f.user) return false;
    if (f.cliente && cxClienteKey(o) !== f.cliente) return false;
    if (f.etapa && o._s !== f.etapa) return false;
    if (!q) return true;
    return [o.po_name, o.room_name, o.delivery_address, o.client_name, cxStoreName(o), o.factory_number].some((v) => String(v || '').toLowerCase().includes(q));
  });
}
function cxClienteKey(o) { return String(o.client_name || '').trim().toLowerCase() || '_'; }
function cxUserLabel(uid, orders) {
  const m = cxState.scope.team[uid];
  if (m && m.email) return m.email;
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
  const col = (tit, corpo, n) => '<div class="cx-col"><h5>' + cEsc(tit) + (n != null ? ' <span>' + n + '</span>' : '') + '</h5><div class="cx-col-b">' + corpo + '</div></div>';
  const vazio = '<p class="hint cx-col-e">← ' + cEsc(cT('col_pick')) + '</p>';

  // 1) fábrica (matriz; as centrais entram aqui quando existirem)
  const fabricas = s.accounts.filter((a) => a.kind === 'factory');
  const c1 = (fabricas.length ? fabricas : [{ id: 'f', trade_name: 'Legno' }]).map((a) => item('fab', a.id, a.trade_name || a.legal_name || 'Legno', cT('matriz'), s.orders, true)).join('');

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

  // 3) vendedores do dealer escolhido (quem fez pedido + a equipe cadastrada)
  let c3 = vazio, nV = null;
  if (lojaSel) {
    const daLoja = porLoja[lojaSel] || [];
    const porUser = {}; daLoja.forEach((o) => { (porUser[o.client_user_id] = porUser[o.client_user_id] || []).push(o); });
    if (lojaSel !== '_') Object.keys(s.team).forEach((uid) => { if (s.team[uid].account_id === lojaSel && s.team[uid].active && !porUser[uid]) porUser[uid] = []; });
    const uids = Object.keys(porUser).sort((a, b) => porUser[b].length - porUser[a].length);
    nV = uids.length;
    const papel = (uid) => { const m = s.team[uid]; return m && window.LegnoMinhaEmpresa ? ({ owner: 'owner', manager: 'manager', seller: 'seller', finance: 'finance' }[m.role] || '') : ''; };
    c3 = uids.map((uid) => item('user', uid, cxUserLabel(uid, daLoja), papel(uid), porUser[uid], f.user === uid)).join('') || vazio;
  }

  // 4) cliente final (nome do cliente no pedido) do dealer / vendedor escolhido
  let c4 = vazio, nC = null;
  if (lojaSel) {
    const base = s.orders.filter((o) => (o.account_id || '_') === lojaSel && (!f.user || o.client_user_id === f.user));
    const porCli = {}; const nomeCli = {};
    base.forEach((o) => { const k = cxClienteKey(o); (porCli[k] = porCli[k] || []).push(o); if (!nomeCli[k]) nomeCli[k] = String(o.client_name || '').trim() || cT('no_client'); });
    const ks = Object.keys(porCli).sort((a, b) => porCli[b].length - porCli[a].length || nomeCli[a].localeCompare(nomeCli[b]));
    nC = ks.length;
    c4 = ks.map((k) => item('cliente', k, nomeCli[k], '', porCli[k], f.cliente === k)).join('') || vazio;
  }
  return '<div class="cx-cols">' + col(cT('col_factory'), c1, null) + col(cT('col_dealer'), c2 || vazio, dealers.length + (porLoja._ ? 1 : 0)) + col(cT('col_seller'), c3, nV) + col(cT('col_client'), c4, nC) + '</div>';
}
function cxRenderNet(p) {
  const s = cxState.scope;
  if (!s) { p.innerHTML = '<p class="hint">' + cEsc(cT('loading')) + '</p>'; return; }
  const f = cxState.net;
  const rows = cxNetRows();
  const cont = {}; CX_STAGES.forEach((k) => { cont[k] = 0; });
  const semEtapa = Object.assign({}, f, { etapa: '' });
  cxState.net = semEtapa; cxNetRows().forEach((o) => { cont[o._s]++; }); cxState.net = f;
  const totL = rows.reduce((a, o) => a + (o._l || 0), 0), totN = rows.reduce((a, o) => a + (o._n != null ? o._n : (o._l || 0)), 0);
  const foco = document.activeElement && document.activeElement.id === 'cx-net-q';
  const rolagem = {}; p.querySelectorAll('.cx-col-b').forEach((el, i) => { rolagem[i] = el.scrollTop; });
  p.innerHTML = cxTreeCols()
    + '<div class="cx-chips">' + CX_STAGES.map((k) => '<button type="button" class="cx-chip' + (f.etapa === k ? ' on' : '') + '" data-cx="etapa" data-v="' + k + '"><i style="background:' + CX_COLORS[k] + '"></i>' + cEsc(cT('s_' + k)) + ' <b>' + cont[k] + '</b></button>').join('') + '</div>'
    + '<div class="cx-filters"><input type="search" id="cx-net-q" placeholder="' + cEsc(cT('f_search')) + '" value="' + cEsc(f.q) + '">'
    + '<span class="hint">' + cEsc(cT('totals', { n: rows.length, l: cMoney(totL), v: cMoney(totN) })) + '</span></div>'
    + (rows.length ? '<div class="mp-table-wrap cx-wrap"><table class="mp-table cx-table"><thead><tr><th>' + cEsc(cT('c_no')) + '</th><th>' + cEsc(cT('c_store')) + '</th><th>' + cEsc(cT('c_po')) + '</th><th>' + cEsc(cT('c_room'))
        + '</th><th>' + cEsc(cT('c_city')) + '</th><th class="r">' + cEsc(cT('list')) + '</th><th class="r">' + cEsc(cT('disc')) + '</th><th class="r">' + cEsc(cT('net')) + '</th><th>' + cEsc(cT('c_stage')) + '</th><th>' + cEsc(cT('c_date')) + '</th><th></th></tr></thead><tbody>'
        + rows.slice(0, 400).map((o) => {
          const quem = cxUserLabel(o.client_user_id, [o]);
          const acao = !cxAdmin() ? '' : (o._s === 'pay' ? '<button type="button" class="secondary" data-cx="relprod" data-id="' + cEsc(o.id) + '">' + cEsc(cT('rel_prod')) + '</button>'
            : o._s === 'prod' ? '<button type="button" class="secondary" data-cx="relpick" data-id="' + cEsc(o.id) + '">' + cEsc(cT('rel_pick')) + '</button>' : '');
          return '<tr data-cx="openorder" data-id="' + cEsc(o.id) + '"><td>' + (Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : '—') + '</td>'
            + '<td><b>' + cEsc(cxStoreName(o)) + '</b>' + (quem ? '<br><span class="hint">' + cEsc(quem) + '</span>' : '') + '</td>'
            + '<td>' + cEsc(o.po_name || '—') + (o.client_name ? '<br><span class="hint">' + cEsc(o.client_name) + '</span>' : '') + '</td><td>' + cEsc(o.room_name || '') + '</td><td class="cx-addr">' + cEsc(o.delivery_address || '') + '</td>'
            + '<td class="r">' + cEsc(cMoney(o._l)) + '</td><td class="r">' + (o._d != null ? o._d + '%' : '—') + '</td><td class="r"><b>' + (o._n != null ? cEsc(cMoney(o._n)) : '—') + '</b></td>'
            + '<td><span class="cx-stage"><i style="background:' + CX_COLORS[o._s] + '"></i>' + cEsc(cT('s_' + o._s)) + '</span></td><td>' + cEsc(cDate(o.approved_at || o.submitted_at)) + '</td><td>' + acao + '</td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="hint">' + cEsc(s.err || cT('net_none')) + '</p>');
  p.querySelectorAll('.cx-col-b').forEach((el, i) => { if (rolagem[i]) el.scrollTop = rolagem[i]; });
  if (foco) { const i = document.getElementById('cx-net-q'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* ok */ } } }
}

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
  const com = s.orders.filter((o) => o.jobsite_lat != null && o.jobsite_lng != null);
  const semCoord = s.orders.filter((o) => (o.jobsite_lat == null || o.jobsite_lng == null) && String(o.delivery_address || '').trim() && (cxAdmin() || o.client_user_id === cxMe()));
  const semEnd = s.orders.filter((o) => !String(o.delivery_address || '').trim()).length;
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
  const lista = cxState.scope.orders.filter((o) => (o.jobsite_lat == null || o.jobsite_lng == null) && String(o.delivery_address || '').trim() && (cxAdmin() || o.client_user_id === cxMe())).slice(0, 60);
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

// ---------- eventos (captura no documento: o portal-09 nem fica sabendo) ----------
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-cx]');
  if (!b || !cxOn()) return;
  const a = b.getAttribute('data-cx');
  e.stopPropagation(); e.preventDefault();
  if (a === 'view') {
    const v = b.getAttribute('data-v');
    cxState.view = cxState.view === v ? '' : v;
    if (cxState.view === 'lost') { mpState.ctab = 'all'; mpState.open = new Set(); }
    if (cxState.view === 'map' || cxState.view === 'net') cxLoadScope(!cxState.scope);
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
  if (a === 'col') {
    const c = b.getAttribute('data-c'), v = b.getAttribute('data-v'), f = cxState.net;
    if (c === 'fab') { f.loja = ''; f.user = ''; f.cliente = ''; }
    else if (c === 'loja') { f.loja = (f.loja === v && !f.user && !f.cliente) ? '' : v; f.user = ''; f.cliente = ''; }
    else if (c === 'user') { f.user = f.user === v ? '' : v; f.cliente = ''; }
    else if (c === 'cliente') { f.cliente = f.cliente === v ? '' : v; }
    return mpRender();
  }
  if (a === 'etapa') { const v = b.getAttribute('data-v'); cxState.net.etapa = cxState.net.etapa === v ? '' : v; return mpRender(); }
  if (a === 'maplegend') { const v = b.getAttribute('data-v'); cxState.mapHide[v] = !cxState.mapHide[v]; return mpRender(); }
  if (a === 'geocode') return cxGeocodeMissing();
  if (a === 'relprod') return cxAdminRelease(b.getAttribute('data-id'), 'prod');
  if (a === 'relpick') return cxAdminRelease(b.getAttribute('data-id'), 'pick');
  if (a === 'openorder') {
    const id = b.getAttribute('data-id');
    const o = cxState.scope && cxState.scope.orders.find((x) => x.id === id);
    if (o && o.client_user_id === cxMe() && typeof openOrderDetail === 'function') return openOrderDetail(id);
    if (cxAdmin()) window.open('erp/index.html#/pedidos/' + id, '_blank', 'noopener');
  }
}, true);
// aba normal clicada: sai do modo perdidos/mapa/lojas
document.addEventListener('click', (e) => {
  if (cxState.view && e.target.closest && e.target.closest('#po-mp-v2 [data-act="ctab"]')) cxState.view = '';
}, true);
document.addEventListener('change', (e) => {
  const t = e.target;
  if (!t || !t.getAttribute) return;
  if (t.getAttribute('data-cx-f')) { e.stopPropagation(); cxSaveField(t); return; }
}, true);
document.addEventListener('input', (e) => {
  const t = e.target;
  if (!t || !t.getAttribute) return;
  if (t.getAttribute('data-cx-f')) {
    const st = t.closest('[data-cx-order]');
    if (st) { const id = st.getAttribute('data-cx-order'); (cxState.draft[id] = cxState.draft[id] || {})[t.getAttribute('data-cx-f')] = t.value; }
  }
  if (t.getAttribute('data-cx-f') === 'delivery_address') cxSuggest(t);
  if (t.id === 'cx-net-q') { cxState.net.q = t.value; clearTimeout(cxState.qTimer); cxState.qTimer = setTimeout(() => mpRender(), 250); }
}, true);
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && t.getAttribute && t.getAttribute('data-cx-f')) { e.stopPropagation(); if (e.key === 'Enter') t.blur(); }
}, true);

// ---------- embrulhos ----------
(function cxWrap() {
  if (typeof window.cuAfterRender === 'function') {
    const orig = window.cuAfterRender;
    window.cuAfterRender = function () {
      const r = orig.apply(this, arguments);
      try { cxDecorate(); } catch (e) { console.warn('[central+]', e); }
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
    '#cx-panel{margin-top:12px}.cx-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
    '.cx-chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--border,#e0ddd6);background:#fff;color:var(--text,#2b2621);border-radius:20px;padding:5px 12px;font-size:13px;margin:0;cursor:pointer}.cx-chip i{width:11px;height:11px;border-radius:50%;display:inline-block}.cx-chip.on{border-color:var(--accent,#8a5a34);box-shadow:0 0 0 1px var(--accent,#8a5a34)}.cx-chip.off{opacity:.45}',
    '#cx-panel .cx-chips .cx-chip:not(.on):not(.off){opacity:1}',
    '.cx-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.cx-filters input{padding:7px 10px;border:1px solid var(--border,#e0ddd6);border-radius:8px;font-size:13px;background:#fff;width:320px;max-width:100%;flex:0 1 320px;margin:0;display:inline-block}.cx-filters button{margin:0}',
    '.cx-cols{display:grid;grid-template-columns:.8fr 1.2fr 1.2fr 1.2fr;gap:10px;margin-bottom:12px}',
    '.cx-col{border:1px solid var(--border,#e0ddd6);border-radius:12px;background:#fff;display:flex;flex-direction:column;min-width:0;position:relative}',
    '.cx-col:not(:last-child)::after{content:"›";position:absolute;right:-9px;top:50%;transform:translateY(-50%);font-size:18px;color:var(--muted,#766f64);background:var(--panel,#fff);line-height:1;z-index:1}',
    '.cx-col h5{margin:0;padding:9px 12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#766f64);border-bottom:1px solid var(--border,#e0ddd6);display:flex;justify-content:space-between}.cx-col h5 span{font-weight:400}',
    '.cx-col-b{max-height:230px;overflow:auto;padding:4px}.cx-col-e{margin:10px 8px;font-size:12px}',
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
