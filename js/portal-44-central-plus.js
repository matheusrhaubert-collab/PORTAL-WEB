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

const CX_SO_ADMIN = false; // 23/11: LIBERADO pros dealers (Matt: "libera a central order e my company pros dealers")
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
    rel_prod: 'Liberar produção', rel_pick: 'Liberar coleta', rel_prod_q: 'Liberar o pedido {n} pra PRODUÇÃO?', rel_pick_q: 'Liberar o pedido {n} pra COLETA?', rel_done: 'Marcar entregue', rel_done_q: 'Marcar o pedido {n} como ENTREGUE (coletado)?\n\nEle sai de "Pronto pra coleta" e vai pra Entregue.', totals: '{n} pedido(s) · tabela {l} · com desconto {v}', fab_net: 'Fábrica c/ desc.', sale: 'Venda ao cliente', sum: 'Total ({n})'
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
    rel_prod: 'Release production', rel_pick: 'Release pickup', rel_prod_q: 'Release order {n} to PRODUCTION?', rel_pick_q: 'Release order {n} for PICKUP?', rel_done: 'Mark delivered', rel_done_q: 'Mark order {n} as DELIVERED (picked up)?\n\nIt leaves "Ready for pickup" and goes to Delivered.', totals: '{n} order(s) · list {l} · net {v}', fab_net: 'Factory net', sale: 'Client price', sum: 'Total ({n})'
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
    rel_prod: 'Liberar producción', rel_pick: 'Liberar retiro', rel_prod_q: '¿Liberar el pedido {n} a PRODUCCIÓN?', rel_pick_q: '¿Liberar el pedido {n} para RETIRO?', rel_done: 'Marcar entregado', rel_done_q: '¿Marcar el pedido {n} como ENTREGADO (retirado)?\n\nSale de "Listo para retiro" y pasa a Entregado.', totals: '{n} pedido(s) · lista {l} · con descuento {v}', fab_net: 'Fábrica c/ desc.', sale: 'Venta al cliente', sum: 'Total ({n})'
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
// VENDEDOR SÓ VÊ O PREÇO FINAL (21/11, Matt: "o vendedor não pode enxergar
// nenhuma margem, ele só vê o preço final"): pra cxSeller() nenhuma coluna de
// tabela, desconto, líquido de fábrica, tax ou total da invoice — só UMA
// coluna "Client price" (o._v = custo da loja × margem dele + extras). Nunca
// mostrar pra vendedor: o._l, o._d, o._n, o._tx, o._it, % de margem.
function cxSeller() { return typeof isSellerAccount === 'function' && isSellerAccount(); }
// STATUS COLORIDO do pedido (etiquetas .mp-chip do css/style.css, as do painel
// antigo): wait = Waiting approval · pay = Waiting release · prod = Scheduled
// (liberado, sem lote) → In Production (em lote) [+ barra Packing n%] → Packed ·
// release pickup (tudo embalado) · ready = Ready for pickup · done = Completed.
function cxProdInfo(o) {
  const s = cxState.scope || {};
  const t = (s.track || {})[o.id]; const pc = (s.pieces || {})[o.id];
  let pct = null; let tip = '';
  if (pc && Number(pc.total) > 0 && Number(pc.feitas) > 0) { pct = Math.min(1, Number(pc.feitas) / Number(pc.total)); tip = Math.min(Number(pc.feitas), Number(pc.total)) + '/' + Number(pc.total); }
  else if (t && Number(t.n_volumes) > 0 && Number(t.n_embalados) > 0) { pct = Math.min(1, Number(t.n_embalados) / Number(t.n_volumes)); tip = Number(t.n_embalados) + '/' + Number(t.n_volumes); }
  const embalado = (t && Number(t.n_volumes) > 0 && Number(t.n_embalados) === Number(t.n_volumes)) || (pc && Number(pc.total) > 0 && Number(pc.feitas) >= Number(pc.total));
  return { lote: !!(t && t.batch_code), pct, tip, embalado: !!embalado };
}
// Nº DO LOTE (22/11, Matt: "eu quero saber número do lote quando entrar em
// lote"): etiqueta LT-… ao lado do status e na ficha do ▾. Só pra fábrica.
function cxLoteDe(o) { const t = ((cxState.scope || {}).track || {})[o.id]; return (t && t.batch_code) || ''; }
// 22/11 (Matt: "deixa o lote só quando abrir a tela pra baixo"): o nº do lote
// NÃO vai mais ao lado do status — fica só na linha "Lote" do ▾.
function cxStatusHtml(o) { return cxStatusHtml0(o); }
function cxStatusHtml0(o) {
  const L = (k, alt) => { try { if (typeof mpT === 'function') { const v = mpT(k); if (v && v !== 'mp.' + k) return v; } } catch (e) { /* cai no texto local */ } return alt; };
  const chip = (cls, rot, tip) => '<span class="mp-chip ' + cls + '"' + (tip ? ' title="' + cEsc(tip) + '"' : '') + '>' + cEsc(rot) + '</span>';
  if (o._s === 'wait') return chip('st-proposal', cT('s_wait'));
  if (o._s === 'pay') return chip('pr-waiting cx-ch-pay', cT('s_pay'));
  if (o._s === 'done') return chip('pr-done', L('pr_done', cT('s_done')));
  if (o._s === 'ready') return chip('pr-ready', L('pr_ready', cT('s_ready')));
  const p = cxProdInfo(o);
  if (p.embalado) return chip('pr-packed', L('pr_packed', 'Packed · release pickup'));
  if (!p.lote && p.pct == null) return chip('pr-scheduled', L('pr_scheduled', 'Scheduled'));
  const n = p.pct == null ? 0 : Math.max(1, Math.min(100, Math.round(p.pct * 100)));
  return chip('pr-in_prod', L('pr_in_prod', cT('s_prod')))
    + (p.pct == null ? '' : '<span class="mp-chip pr-packing" title="' + cEsc(p.tip) + '">' + cEsc(L('pr_packing', 'Packing')) + ' <span class="mp-pack-bar"><i style="width:' + n + '%"></i></span> ' + n + '%</span>');
}
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
    const nLost = (cxLostNaRede() && cxState.scope && cxState.scope.lostRows) ? cxState.scope.lostRows.length : Object.keys(cxState.lost).length;
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

  // ▾ no fim de cada linha da aba PERDIDOS (23/11, Matt: "coloca a seta no
  // final da barra dos perdidos pra abrir pra baixo também como nas outras").
  // O clique sobe pra linha, que já abre/fecha (mesmo gesto de clicar nela).
  if (cxState.view === 'lost') {
    box.querySelectorAll('tr.mp-row').forEach((tr) => {
      const td = tr.querySelector('td.mp-c-menu') || tr.lastElementChild;
      if (!td || td.querySelector('.cx-more')) return;
      const ab = tr.classList.contains('is-open');
      td.insertAdjacentHTML('beforeend', '<button type="button" class="cx-more cx-more-lost' + (ab ? ' is-on' : '') + '" title="' + cEsc(odT(ab ? 'less' : 'more')) + '" aria-label="' + cEsc(odT('more')) + '">' + (ab ? '▴' : '▾') + '</button>');
    });
  }

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
      bar.insertAdjacentHTML('beforebegin', '<div id="cx-tree">' + (cxState.scope ? cxTreeCols() : '<p class="hint">' + cEsc(cT('loading')) + '</p>') + '</div>');
      ['loja', 'user', 'cliente'].forEach(cxColFilter);
      box.querySelectorAll('#cx-tree .cx-col-b').forEach((el) => { const k = el.getAttribute('data-cx-colb') || 'fab'; if (cxState.colScroll[k]) el.scrollTop = cxState.colScroll[k]; });
    }
    if (lista) {
      // abas normais acompanham a lista: marcada a que bate com o filtro e, pro admin, com a contagem de todo mundo
      const f = cxState.net; const marcada = { '': 'all', build: 'build', _orders: 'prod', done: 'done' }[f.etapa];
      const base = cxState.scope ? cxState.scope.orders.filter((o) => (!f.loja || (o.account_id || '_') === f.loja) && (!f.user || o.client_user_id === f.user) && (!f.cliente || cxClienteKey(o) === f.cliente)) : null;
      const conta = { all: (o) => true, build: (o) => o._s === 'build', prod: (o) => ['wait', 'pay', 'prod', 'ready'].includes(o._s), done: (o) => o._s === 'done' };
      box.querySelectorAll('[data-act="ctab"]').forEach((el) => {
        const t = el.dataset.tab;
        el.classList.toggle('is-on', marcada === t);
        const n = el.querySelector('.cu-n');
        if (n && conta[t]) n.textContent = base ? base.filter(conta[t]).length : '…'; // nunca a contagem só da conta de quem olha
      });
    }
  } else if (cxHasNetwork() && (cxNetSel() || cxAdmin())) {
    // Abas PERDIDOS / MAPA (23/11, Matt: "quando tô na pasta lost as outras
    // abas ficam com numeração de projetos errada"): sem a árvore na tela as
    // contagens caíam no número da lista filtrada (os perdidos). Mesma conta
    // de cima, só não marca nenhuma aba (a marcada é Perdidos/Mapa).
    if (!cxState.scope && !cxState.scopeBusy) cxLoadScope(false);
    const f = cxState.net;
    const base = cxState.scope ? cxState.scope.orders.filter((o) => (!f.loja || (o.account_id || '_') === f.loja) && (!f.user || o.client_user_id === f.user) && (!f.cliente || cxClienteKey(o) === f.cliente)) : null;
    const conta = { all: (o) => true, build: (o) => o._s === 'build', prod: (o) => ['wait', 'pay', 'prod', 'ready'].includes(o._s), done: (o) => o._s === 'done' };
    box.querySelectorAll('[data-act="ctab"]').forEach((el) => {
      const n = el.querySelector('.cu-n');
      if (n && conta[el.dataset.tab]) n.textContent = base ? base.filter(conta[el.dataset.tab]).length : '…';
    });
  }
  try { cxAddCols(box, folders); } catch (e) { console.warn('[central+] colunas', e); }

  // painel do mapa / lista da árvore no lugar da tabela
  const perdidosNaRede = cxState.view === 'lost' && cxLostNaRede();
  const painel = cxState.view === 'map' || lista || perdidosNaRede;
  box.querySelectorAll('.mp-table-wrap, .mp-empty').forEach((el) => { if (!el.closest('#cx-panel')) el.style.display = painel ? 'none' : ''; });
  if (cxState.view === 'lost' && !box.querySelector('.mp-table-wrap')) { const e = box.querySelector('.mp-empty'); if (e) e.textContent = cT('lost_empty'); }
  if (painel) {
    if (!cxState.scope && !cxState.scopeBusy) cxLoadScope(false);
    let p = box.querySelector('#cx-panel');
    if (!p) { p = document.createElement('div'); p.id = 'cx-panel'; box.appendChild(p); }
    if (cxState.view === 'map') cxRenderMap(p); else if (perdidosNaRede) cxRenderLost(p); else cxRenderNet(p);
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
      let pr = await sb.from('user_projects').select(PB + ', lost_at, lost_reason, lost_note, account_id, po_name, project_number').order('updated_at', { ascending: false }).limit(5000);
      if (pr.error) pr = await sb.from('user_projects').select(PB + ', lost_at, lost_reason, lost_note, account_id, po_name').order('updated_at', { ascending: false }).limit(5000);
      if (pr.error) pr = await sb.from('user_projects').select(PB + ', lost_at').order('updated_at', { ascending: false }).limit(5000);
      if (pr.error) pr = await sb.from('user_projects').select(PB).order('updated_at', { ascending: false }).limit(5000);
      const porId = {}, porPedido = {};
      (pr.data || []).forEach((p) => { porId[p.id] = p; if (p.frozen_order_id) porPedido[p.frozen_order_id] = p; });
      s.orders.forEach((o) => { const pj = porPedido[o.id] || porId[o.source_project_id]; o._folder = pj && pj.client_folder ? pj.client_folder : ''; o._pname = pj ? (pj.name || '') : ''; });
      (pr.data || []).forEach((p) => {
        // PERDIDOS (23/11, Matt: "quero uma coluna por motivo... e que mostre os
        // dados certinhos porque estão todos em branco — valores, cliente,
        // usuário, loja"): entram com a marca _lost, passam pelo mesmo preço e
        // nome dos outros e no fim saem pra s.lostRows (aba Perdidos).
        if (p.frozen_order_id || (p.archived_at && !p.lost_at)) return;
        const m = s.team[p.client_user_id];
        s.orders.push({
          _lost: p.lost_at ? { at: p.lost_at, reason: p.lost_reason || '', note: p.lost_note || '' } : null,
          _proj: true, _folder: p.client_folder || '', _pname: p.name || '', id: 'proj:' + p.id, client_user_id: p.client_user_id, account_id: p.account_id || (m ? m.account_id : null), _pid: p.id, _po: p.po_name || '', project_number: p.project_number || null, status: 'project',
          po_name: p.name, client_name: (p.client_info && p.client_info.name) || p.client_folder || '', room_name: '',
          delivery_address: (p.client_info && p.client_info.address) || '', jobsite_lat: null, jobsite_lng: null,
          submitted_at: p.updated_at, _l: Number(p.cached_value_usd) || 0, _d: null, _n: null, _s: 'build',
          _old: !!(p.updated_at && new Date(p.updated_at).getTime() < Date.now() - CX_INATIVO_DIAS * 86400000)
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
    // NOME DA EMPRESA no lugar do e-mail (22/11, Matt: "onde aparece o email
    // troque pelo nome da companhia. tanto no filtro quanto na tela de ordens
    // e projetos"). Ordem: empresa do cadastro da pessoa (person_records) →
    // loja, se ela é a dona → nome de loja do perfil → e-mail (cxUserLabel).
    // Duas pessoas com a mesma empresa: as que não são donas levam o começo
    // do e-mail junto, pra dar pra diferenciar. Ver cxUserName.
    s.nomes = {};
    try {
      const todos = Array.from(new Set(s.orders.map((o) => o.client_user_id).concat(Object.keys(s.team)))).filter(Boolean);
      const cad = {}, perfil = {};
      for (let i = 0; i < todos.length; i += 150) {
        const parte = todos.slice(i, i + 150);
        try { const r1 = await sb.from('person_records').select('user_id, company_name').in('user_id', parte); (r1.data || []).forEach((r) => { cad[r.user_id] = r; }); } catch (eA) { /* sem a 321 */ }
        try { const r2 = await sb.from('user_profiles').select('user_id, email, store_name').in('user_id', parte); (r2.data || []).forEach((r) => { perfil[r.user_id] = r; }); } catch (eB) { /* sem leitura */ }
      }
      const limpa = (v) => String(v || '').trim();
      const bruto = {}, dono = {};
      todos.forEach((u) => {
        const m = s.team[u];
        const acc = m && m.role === 'owner' ? (s.accounts || []).find((a) => a.id === m.account_id) : null;
        dono[u] = !!acc;
        bruto[u] = limpa(cad[u] && cad[u].company_name) || (acc ? limpa(acc.trade_name || acc.legal_name) : '') || limpa(perfil[u] && perfil[u].store_name);
      });
      const grupos = {};
      todos.forEach((u) => { if (bruto[u]) (grupos[bruto[u].toLowerCase()] = grupos[bruto[u].toLowerCase()] || []).push(u); });
      todos.forEach((u) => {
        if (!bruto[u]) return;
        const g = grupos[bruto[u].toLowerCase()];
        const temDono = g.some((x) => dono[x]);
        const email = limpa((s.team[u] && s.team[u].email) || (perfil[u] && perfil[u].email) || (s.emails[u] && s.emails[u].email));
        s.nomes[u] = (g.length > 1 && (!temDono || !dono[u]) && email) ? bruto[u] + ' · ' + email.split('@')[0] : bruto[u];
      });
    } catch (e5) { /* fica o e-mail */ }
    // PRODUÇÃO E EMBALAGEM por pedido (21/11, Matt: "antes mostrava bem melhor
    // os status, era mais colorido, mostrava como estava indo a embalagem"):
    // as mesmas RPCs do painel antigo (portal-09) — lote, volumes embalados e
    // peças apontadas. Sem resposta (RPC ausente ou pedido que não é meu) o
    // pedido liberado aparece como "Scheduled".
    s.track = {}; s.pieces = {};
    try {
      const lib = s.orders.filter((o) => !o._proj && ['approved', 'paid'].includes(o.status)).map((o) => o.id);
      for (let i = 0; i < lib.length; i += 200) {
        const parte = lib.slice(i, i + 200);
        const [tr, pc] = await Promise.all([
          sb.rpc('portal_order_tracking', { p_order_ids: parte }).then((r) => r, () => ({ error: true })),
          sb.rpc('portal_order_pieces_progress', { p_order_ids: parte }).then((r) => r, () => ({ error: true }))
        ]);
        if (tr && !tr.error) (tr.data || []).forEach((r) => { s.track[r.order_id] = r; });
        if (pc && !pc.error) (pc.data || []).forEach((r) => { s.pieces[r.order_id] = r; });
      }
    } catch (e4) { /* sem acompanhamento: fica Scheduled */ }
    s.orders.forEach((o) => { o._t = o._proj ? o.submitted_at : (o.delivered_at || o.pickup_released_at || o.finance_released_at || o.approved_at || o.submitted_at); });
    s.orders.sort((a, b) => String(b._t || '').localeCompare(String(a._t || '')));
    // ARQUIVADO POR INATIVIDADE (21/11, Matt: "30 dias sem mexer qualquer
    // usuário, coloca como arquivado"): projeto em construção sem salvar há
    // CX_INATIVO_DIAS sai da lista (e das contagens da árvore). Nada é gravado
    // no banco: salvar o projeto de novo traz ele de volta sozinho. O link
    // "Arquivados por inatividade (n)" no rodapé troca a lista pra eles.
    s.lostRows = s.orders.filter((o) => o._lost); s.orders = s.orders.filter((o) => !o._lost);
    s.live = s.orders.filter((o) => !o._old); s.old = s.orders.filter((o) => o._old);
    s.orders = cxState.verInativos && s.old.length ? s.old : s.live;
    if (!s.old.length) cxState.verInativos = false;
    s.users = new Set(s.orders.map((o) => o.client_user_id)).size;
    cxState.scope = s;
  } catch (e) { cxState.scope = { orders: [], accounts: [], team: {}, users: 0, err: (e && e.message) || String(e) }; }
  cxState.scopeBusy = false;
  if (typeof mpRender === 'function' && typeof mpState !== 'undefined' && mpState.central) mpRender();
}
// Toda linha que a tela pode ter aberta: a lista + os perdidos.
function cxAllRows() { const s = cxState.scope; return s ? (s.orders || []).concat(s.lostRows || []) : []; }
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
const CX_INATIVO_DIAS = 30;
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
    return [o.po_name, o.room_name, o.delivery_address, o.client_name, o._folder, o.invoice_number, cxStoreName(o), o.factory_number].some((v) => String(v || '').toLowerCase().includes(q));
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
// Nome que aparece na tela pra uma pessoa: a EMPRESA dela (scope.nomes, ver
// cxLoadScope) e, sem empresa cadastrada, o e-mail de sempre.
function cxUserName(uid, orders) {
  const n = ((cxState.scope && cxState.scope.nomes) || {})[uid];
  return n || cxUserLabel(uid, orders);
}
// E-mail só quando o nome mostrado é a empresa (pra linha de baixo/dica).
function cxUserMail(uid, orders) {
  const n = ((cxState.scope && cxState.scope.nomes) || {})[uid];
  return n ? cxUserLabel(uid, orders) : '';
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
  // 21/11 (Matt: "tá mostrando dealers que estão dentro dos dealers conforme a
  // árvore"): loja SUSPENSA (o dono virou vendedor de outra loja em My company ›
  // People) ou recusada só aparece se ainda tiver algum projeto/pedido nela.
  const lojaViva = (a) => !['suspended', 'rejected'].includes(a.status) || (porLoja[a.id] || []).length > 0;
  const dealers = s.accounts.filter((a) => a.kind !== 'factory' && a.status !== 'draft' && lojaViva(a))
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
    c3 = uids.map((uid) => item('user', uid, cxUserName(uid, daLoja), [papel(uid), cxUserMail(uid, daLoja)].filter(Boolean).join(' · '), porUser[uid], f.user === uid)).join('') || vazio;
    if (f.user) selUser = { nome: cxUserName(f.user, daLoja), q: qtd(porUser[f.user] || []) };
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
  const lojas = s.accounts.filter((a) => a.kind !== 'factory' && a.status !== 'draft' && a.status !== 'rejected' && (a.status !== 'suspended' || a.id === atual))
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
    } else if (!confirm(cT('mv_confirm', { n: ids.length, loja: nome }))) return mpRender();   // 21/11: confirma SEMPRE (antes só com 2+)
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
      const CAMPOS = 'user_id, role, parent_dealer_user_id, resale_margin_pct, factory_discount_pct';
      let { data, error } = await sb.from('user_profiles').select(CAMPOS + ', seller_margin_pct').in('user_id', ids.slice(i, i + 150));
      if (error) ({ data, error } = await sb.from('user_profiles').select(CAMPOS).in('user_id', ids.slice(i, i + 150)));   // sem a migration 320
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
  // MARGEM POR VENDEDOR (migration 320): vendedor com margem própria usa a dele
  const mgVend = (uid) => { const r = prof[uid]; return r && r.role === 'vendedor' && r.seller_margin_pct != null ? Number(r.seller_margin_pct) : null; };
  const aplica = (base, tab, lista) => (typeof applyPricingExtras === 'function') ? applyPricingExtras(base, tab, lista) : base;
  const r2 = (v) => Math.round(v * 100) / 100;
  s.orders.forEach((o) => {
    if (!o._proj) {
      // PEDIDO: líquido de fábrica já congelado; venda = líquido × (1+margem) + extras de margem da loja
      const tab = Number(o._l) || 0;
      const liq = o._n != null ? Number(o._n) : tab;
      if (o._n == null) { o._n = tab; o._d = 0; } // pedido sem loja/desconto: fábrica = tabela (era '—')
      const d = dono(o.client_user_id);
      const meu = meuId && (d === meuId || o.client_user_id === meuId);
      const mv = o.client_user_id === meuId ? null : mgVend(o.client_user_id);   // a minha já vem certa no getResaleMarginPct
      const mg = mv != null ? mv : meu && typeof getResaleMarginPct === 'function' ? (Number(getResaleMarginPct()) || 0) : (Number((prof[d] || {}).resale_margin_pct) || 0);
      const exM = meu && typeof resolveDealerPricingExtras === 'function' ? resolveDealerPricingExtras('margem') : (extras[d] || []).filter((x) => x.side === 'margem');
      o._v = r2(aplica(mg > 0 ? liq * (1 + mg / 100) : liq, tab, exM));
      return;
    }
    const tab = Number(o._l) || 0;
    const d = dono(o.client_user_id);
    const meu = meuId && (d === meuId || o.client_user_id === meuId);
    const mvP = o.client_user_id === meuId ? null : mgVend(o.client_user_id);
    if (meu && typeof computeCustoBase === 'function' && typeof getDisplayPrice === 'function') {
      o._n = r2(computeCustoBase(tab));
      o._v = mvP != null && typeof resolveDealerPricingExtras === 'function'
        ? r2(aplica(o._n * (1 + mvP / 100), tab, resolveDealerPricingExtras('margem')))
        : r2(getDisplayPrice(tab));
      o._d = tab > 0 ? Math.round((1 - o._n / tab) * 1000) / 10 : 0;
      return;
    }
    const pd = prof[d] || {};
    const pct = pd.factory_discount_pct != null ? Number(pd.factory_discount_pct) : (descConta[o.account_id] != null ? descConta[o.account_id] : 0);
    const ex = extras[d] || [];
    const custo = aplica(tab * (1 - pct / 100), tab, ex.filter((x) => x.side === 'custo'));
    const mg = mvP != null ? mvP : (Number(pd.resale_margin_pct) || 0);
    const venda = aplica(mg > 0 ? custo * (1 + mg / 100) : custo, tab, ex.filter((x) => x.side === 'margem'));
    o._d = pct; o._n = r2(custo); o._v = r2(venda);
  });
  // INVOICE/TAX/PAGAMENTO (migration 316) — sem ela, tax fica "—" e os botões não aparecem
  s.invOk = false;
  try { const r = await sb.rpc('factory_sales_tax_pct'); if (!r.error) { s.taxPct = r.data == null ? null : Number(r.data); s.invOk = true; } } catch (e) { /* 316 não rodou */ }
  if (s.invOk) {
    const ids = s.orders.filter((o) => !o._proj).map((o) => o.id);
    const porId = {}; s.orders.forEach((o) => { porId[o.id] = o; });
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await sb.from('orders').select('id, tax_pct, tax_amount, invoice_total, invoice_issued_at, invoice_number, invoice_path, payment_link, receipt_path, receipt_uploaded_at, paid_at').in('id', ids.slice(i, i + 150));
      if (error) { s.invOk = false; break; }
      (data || []).forEach((r) => { Object.assign(porId[r.id], r); });
    }
  }
  // PAGAMENTO (migration 330): condições da fábrica + escolha de cada pedido. Sem a 330, s.payOk = false.
  s.payOk = false; s.payTerms = null;
  if (s.invOk) {
    try {
      const rt = await sb.rpc('factory_payment_terms');
      if (!rt.error) {
        s.payTerms = rt.data || {}; s.payOk = true;
        const ids2 = s.orders.filter((o) => !o._proj).map((o) => o.id); const porId2 = {}; s.orders.forEach((o) => { porId2[o.id] = o; });
        for (let i = 0; i < ids2.length; i += 150) {
          const { data, error } = await sb.from('orders').select('id, pay_method, pay_discount_pct, pay_discount_amount, pay_early').in('id', ids2.slice(i, i + 150));
          if (error) { s.payOk = false; break; }
          (data || []).forEach((r) => { Object.assign(porId2[r.id], r); });
        }
        // plano (total × 50/50) e entrada paga — migration 333; sem ela tudo segue como 'total'
        s.planOk = false;
        if (s.payOk) for (let i = 0; i < ids2.length; i += 150) {
          const { data, error } = await sb.from('orders').select('id, pay_plan, pay_deposit_at').in('id', ids2.slice(i, i + 150));
          if (error) break;
          s.planOk = true; (data || []).forEach((r) => { Object.assign(porId2[r.id], r); });
        }
      }
    } catch (e) { /* 330 não rodou */ }
  }
  s.orders.forEach((o) => { if (!o._proj) cxCalcTax(o, s); });
  // QUICKBOOKS (migration 318): s.qbo = undefined (318 não rodou) | null (não é
  // admin) | { connected, environment, company_name, … }. As colunas qbo_* dos
  // pedidos vêm numa consulta separada pra não derrubar a de cima sem a 318.
  s.qbo = undefined;
  try { const r = await sb.rpc('qbo_status'); if (!r.error) s.qbo = r.data || null; } catch (e) { /* 318 não rodou */ }
  if (s.qbo !== undefined && s.invOk) {
    const ids = s.orders.filter((o) => !o._proj).map((o) => o.id);
    const porId = {}; s.orders.forEach((o) => { porId[o.id] = o; });
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await sb.from('orders').select('id, qbo_invoice_id, qbo_doc_number, qbo_balance, qbo_paid_at').in('id', ids.slice(i, i + 150));
      if (error) break;
      (data || []).forEach((r) => { Object.assign(porId[r.id], r); });
    }
  }
}
// tax do pedido: congelado na invoice; senão isento (tax exemption válido) = 0; senão alíquota da fábrica
function cxIsento(o, s) {
  const a = (s.accounts || []).find((x) => x.id === o.account_id);
  return !!(a && a.tax_exempt_status === 'valid' && a.tax_exempt_valid_until && String(a.tax_exempt_valid_until) >= new Date().toISOString().slice(0, 10));
}
function cxCalcTax(o, s) {
  const net = o._n != null ? Number(o._n) : (Number(o._l) || 0);
  o._ex = false;
  if (o.tax_amount != null) { o._tx = Number(o.tax_amount); o._it = o.invoice_total != null ? Number(o.invoice_total) : net + o._tx; o._ex = Number(o.tax_pct) === 0; return; }
  if (cxIsento(o, s)) { o._ex = true; o._tx = 0; o._it = net; return; }
  if (s.taxPct == null) { o._tx = null; o._it = net; return; }
  o._tx = Math.round(net * s.taxPct) / 100; o._it = Math.round((net + o._tx) * 100) / 100;
}
// colunas de preço: aba Projetos = fábrica c/ desconto + venda; resto = tabela/desconto/líquido
// 21/11 (2ª): Matt quer as DUAS colunas em todas as abas — fábrica com desconto à esquerda, venda ao cliente (markup do lojista) ao lado.
function cxSoProj() { return !(cxState.net && cxState.net.etapa === '_orders'); }
function cxSel() { return cxState.sel || (cxState.sel = new Set()); }
function cxPrecoThs(th, soProj) {
  return soProj ? th('net', cT('fab_net'), 1) + th('v', cT('sale'), 1)
    : th('l', cT('list'), 1) + '<th class="cx-r">' + cEsc(cT('disc')) + '</th>' + th('net', cT('net'), 1)
      + '<th class="cx-r' + (cxAdmin() ? ' cx-taxh" data-cx="taxrate" title="' + cEsc(ivT('set_rate')) : '') + '">' + cEsc(ivT('tax')) + (cxState.scope && cxState.scope.taxPct != null ? ' ' + cxState.scope.taxPct + '%' : '') + '</th>'
      + th('it', ivT('inv_total'), 1);
}
// linha de TOTAL embaixo, em negrito, nas mesmas colunas (21/11, Matt)
function cxSomaTds(itens, soProj) {
  const soma = (k) => itens.reduce((t, o) => t + (Number(o[k]) || 0), 0);
  return soProj
    ? '<td class="cx-r">' + cEsc(cMoney(itens.reduce((t, o) => t + (o._n != null ? o._n : (o._l || 0)), 0))) + '</td><td class="cx-r">' + cEsc(cMoney(soma('_v'))) + '</td>'
    : '<td class="cx-r">' + cEsc(cMoney(soma('_l'))) + '</td><td></td><td class="cx-r">' + cEsc(cMoney(itens.reduce((t, o) => t + (o._n != null ? o._n : (o._l || 0)), 0))) + '</td>'
      + '<td class="cx-r">' + cEsc(cMoney(soma('_tx'))) + '</td><td class="cx-r">' + cEsc(cMoney(soma('_it'))) + '</td>';
}
// PASTA NA LISTA (21/11, Matt: "antes eu tinha funções da pasta dos projetos...
// a pasta deveria existir com os projetos dentro, uma linha a mais, com
// somatório só da pasta, e lá embaixo somatório de tudo (cuidar pra não
// duplicar)"). Na lista corrida da tela, os itens da MESMA pasta do MESMO
// usuário ficam juntos embaixo de uma linha da pasta: nome, quantidade,
// somatório só dela e o menu ⋯ com as funções da pasta. A linha da pasta NÃO
// entra no total de baixo (ele soma só os itens). Clique na linha recolhe/abre.
// 22/11 (Matt: "quem não tem pasta cria um 'sem pasta' pra manter tudo igual,
// vale pra todas as abas"): item sem pasta entra na pasta "Sem pasta" do
// próprio login — chave "<user>|" (nome vazio). É só agrupamento de TELA: nada
// é gravado, e ela não tem o menu ⋯ (renomear/compartilhar não fazem sentido).
function cxFolderKey(o) { return o ? String(o.client_user_id) + '|' + (o._folder || '') : ''; }
function cxSemPasta(k) { return String(k || '').slice(-1) === '|'; }
function cxFolderClosed() { return cxState.foldClosed || (cxState.foldClosed = new Set()); }
// 21/11 (Matt: "não gostei da seleção... prefiro colocar esse botão na pasta e
// com a pasta ele funciona com tudo que tiver dentro"): as caixinhas saíram;
// na aba Orders a linha da pasta tem Invoice (n) e QB (n) = todos os pedidos
// da pasta que estão na lista (os ainda "submitted" ficam de fora).
function cxFolderOrders(k) { return cxNetRows().filter((o) => cxFolderKey(o) === k && !o._proj && o.status !== 'submitted'); }
function cxFolderRowHtml(k, itens, soProj, preco, enx) {
  const s0 = cxState.scope || {};
  const ped = soProj || !s0.invOk ? [] : itens.filter((o) => !o._proj && o.status !== 'submitted');
  const fb = (a, rot, ok) => '<button type="button" class="cx-mini' + (ok ? ' cx-mini-ok' : '') + '" data-cx="' + a + '" data-k="' + cEsc(k) + '" title="' + cEsc(ivT('folder_tip', { n: ped.length })) + '">' + cEsc(rot) + ' (' + ped.length + ')</button>';
  const fbtns = !ped.length ? '' : fb('finv', ivT('inv') + (ped.every((o) => o.invoice_number) ? ' ✓' : ''), ped.every((o) => o.invoice_number))
    + (cxAdmin() && s0.qbo && s0.qbo.connected ? fb('fqb', 'QB' + (ped.every((o) => o.qbo_invoice_id) ? ' ✓' : ''), ped.every((o) => o.qbo_invoice_id)) : '');
  const semPasta = cxSemPasta(k);
  const nome = semPasta ? (typeof I18n !== 'undefined' ? I18n.t('fav.folder_none') : 'No folder') : itens[0]._folder;
  const fechada = cxFolderClosed().has(k);
  const meus = itens[0].client_user_id === cxMe();
  const T = (key) => (typeof I18n !== 'undefined' ? I18n.t(key) : key);
  const it = (v, rot, cls) => '<button type="button" class="cx-fmi' + (cls ? ' ' + cls : '') + '" data-cx="fact" data-v="' + v + '" data-k="' + cEsc(k) + '">' + cEsc(rot) + '</button>';
  const podeProposta = meus && typeof generateClientProposalPDF === 'function' && (typeof canGenerateProposal !== 'function' || canGenerateProposal());
  const temProj = itens.some((o) => o._pid);
  // as opções de antes (menu da pasta do Meus Projetos) + Plano técnico da pasta toda
  const menu = cxState.fmenu !== k ? '' : '<div class="cx-fmenu">'
    + (podeProposta ? it('proposal', T('fav.folder_proposal_btn')) : '')
    + (temProj && typeof generateProjectTechPlan === 'function' ? it('techplan', fdT('techplan')) : '')
    + (meus ? it('share', T('fav.folder_share_btn')) : '')
    + it('rename', T('fav.folder_rename_btn'))
    + (cxAdmin() && temProj && typeof mpFolderBudget === 'function' ? it('budget', T('mp.budget_btn')) : '')
    + (meus && temProj && typeof mpArchive === 'function' ? it('archive', T('mp.archive')) : '')
    // PASTA PERDIDA (23/11, Matt: "coloca lost na pasta toda"): todos os projetos em construção da pasta, um motivo só
    + ((cxAdmin() || meus) && window.LegnoMinhaEmpresa && itens.some((o) => o._proj) ? it('lost', fdT('lost')) : '')
    + (meus ? it('delete', T('fav.folder_delete_btn'), 'is-danger') : '') + '</div>';
  return '<tr class="cx-frow' + (fechada ? ' is-closed' : '') + (semPasta ? ' cx-frow-0' : '') + '" data-cx="ftoggle" data-k="' + cEsc(k) + '">'
    + '<td colspan="' + (enx ? 6 : 4) + '" class="cx-fname"><span class="cx-fchev">' + (fechada ? '▸' : '▾') + '</span> 📁 <b>' + cEsc(nome) + '</b> <span class="cx-fn">' + itens.length + '</span>'
    // duas pastas com o mesmo nome (de logins diferentes) se distinguem pelo dono
    + ' <span class="cx-fquem">' + cEsc(String(cxUserName(itens[0].client_user_id, itens) || '').split('@')[0]) + '</span>'
    + (semPasta ? '' : '<button type="button" class="cx-fdots" data-cx="fmenu" data-k="' + cEsc(k) + '" aria-label="menu">⋯</button>') + '<span class="cx-fstatus hint" data-fst="' + cEsc(k) + '"></span>' + menu + '</td>'
    + (enx ? '<td class="cx-facts cx-facts-l">' + fbtns + '</td>' + (preco ? '<td class="cx-r">' + cEsc(cMoney(itens.reduce((t, o) => t + (Number(o._it) || 0), 0))) + '</td>' : cxSeller() ? '<td class="cx-r">' + cEsc(cMoney(itens.reduce((t, o) => t + (Number(o._v) || 0), 0))) + '</td>' : '') + '<td colspan="3"></td></tr>'
      : (preco ? cxSomaTds(itens, soProj) : cxSeller() ? '<td class="cx-r">' + cEsc(cMoney(itens.reduce((t, o) => t + (Number(o._v) || 0), 0))) + '</td>' : '') + '<td colspan="4" class="cx-facts">' + fbtns + '</td></tr>');
}
// textos só desta parte (pasta na lista)
const FD_TXT = {
  pt: { techplan: 'Plano técnico (todos os projetos)', tp_confirm: 'Gerar o plano técnico dos {n} projeto(s) da pasta "{pasta}"?\n\nCada projeto é aberto no editor e no fim sai UM PDF só, com índice na primeira página. Depois você volta pra cá.', tp_prog: 'Plano técnico {i}/{n} — {nome}', tp_done: 'Plano técnico: {ok} de {n} gerado(s).', tp_fail: 'Não saiu:', tp_none: 'Esta pasta não tem projeto pra gerar o plano técnico.', busy: 'Já tem uma geração em andamento.' },
  en: { techplan: 'Technical plan (all projects)', tp_confirm: 'Generate the technical plan for the {n} project(s) in folder "{pasta}"?\n\nEach project opens in the editor and at the end you get ONE PDF with an index on the first page. Then you come back here.', tp_prog: 'Technical plan {i}/{n} — {nome}', tp_done: 'Technical plan: {ok} of {n} generated.', tp_fail: 'Not generated:', tp_none: 'This folder has no project to generate the technical plan.', busy: 'A generation is already running.' },
  es: { techplan: 'Plano técnico (todos los proyectos)', tp_confirm: '¿Generar el plano técnico de los {n} proyecto(s) de la carpeta "{pasta}"?\n\nCada proyecto se abre en el editor y al final sale UN solo PDF, con índice en la primera página. Luego vuelves aquí.', tp_prog: 'Plano técnico {i}/{n} — {nome}', tp_done: 'Plano técnico: {ok} de {n} generado(s).', tp_fail: 'No salió:', tp_none: 'Esta carpeta no tiene proyecto para generar el plano técnico.', busy: 'Ya hay una generación en curso.' }
};
Object.assign(FD_TXT.pt, { lost: '✕ Pasta perdida — motivo' });
Object.assign(FD_TXT.en, { lost: '✕ Lost folder — reason' });
Object.assign(FD_TXT.es, { lost: '✕ Carpeta perdida — motivo' });
function fdT(k, vars) {
  let lang = 'en';
  try { lang = cxLang(); } catch (e) { /* en */ }
  let t = (FD_TXT[String(lang).slice(0, 2)] || FD_TXT.en)[k] || FD_TXT.en[k] || k;
  Object.keys(vars || {}).forEach((v) => { t = t.split('{' + v + '}').join(String(vars[v])); });
  return t;
}
// projetos COMPLETOS da pasta (linha inteira do banco) — serve pra pasta minha
// e pra de outro login que eu enxergo (admin / dealer vendo a equipe)
async function cxFolderProjects(itens) {
  const ids = Array.from(new Set(itens.map((o) => o._pid).filter(Boolean)));
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error } = await supabaseClient.from('user_projects').select('*').in('id', ids.slice(i, i + 50));
    if (error) throw error;
    (data || []).forEach((r) => { r._fullRow = true; out.push(r); });
  }
  return out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true }));
}
// PLANO TÉCNICO DA PASTA TODA (21/11, Matt: "proposta, plano técnico, aí pega
// todos os projetos"). O plano técnico precisa da cena 3D do projeto, então
// cada projeto é aberto no editor (mesmo caminho do Orçamento da pasta e do
// PDF de desenhos do pedido), gera o PDF de sempre (um por projeto) e no fim o
// editor volta como estava e a tela volta pra Central. Projeto enviado abre
// como rascunho sem vínculo (não grava nada nele).
let cxFolderTpRunning = false;
async function cxFolderTechPlans(nome, lista) {
  if (cxFolderTpRunning) { alert(fdT('busy')); return; }
  if (!lista.length) { alert(fdT('tp_none')); return; }
  if (!confirm(fdT('tp_confirm', { n: lista.length, pasta: nome }))) return;
  if (typeof projectSlots !== 'undefined' && projectSlots.length && typeof projectDirty !== 'undefined' && projectDirty
    && !confirm(typeof I18n !== 'undefined' ? I18n.t('proposal.client_confirm_unsaved') : 'Unsaved changes — continue?')) return;
  cxFolderTpRunning = true;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let aviso = document.getElementById('cx-ftoast');
  if (!aviso) { aviso = document.createElement('div'); aviso.id = 'cx-ftoast'; document.body.appendChild(aviso); }
  aviso.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:5000;background:#2f2a24;color:#fff;padding:10px 16px;border-radius:10px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.3)';
  const abertoAntes = (typeof loadedProjectFavorite !== 'undefined' && loadedProjectFavorite && loadedProjectFavorite.id) ? loadedProjectFavorite.id : null;
  const falhas = []; let ok = 0;
  // UM PDF só, com índice na 1ª página (22/11) — ver ptFinishCombined (portal-14)
  const comb = typeof ptFinishCombined === 'function' ? { sections: [] } : null;
  try {
    for (let i = 0; i < lista.length; i++) {
      const row = lista[i];
      aviso.textContent = fdT('tp_prog', { i: i + 1, n: lista.length, nome: row.name || '' });
      try {
        if (typeof projectDirty !== 'undefined') projectDirty = false;
        const r = await restoreFavoriteProject(row, !row.frozen_order_id);
        if (!r || !r.ok) throw (r && r.error) || new Error('load');
        if (typeof projectWaitInteriorsReady === 'function') await projectWaitInteriorsReady();
        if (typeof trkWaitProjectScene === 'function') await trkWaitProjectScene(); else await sleep(3500);
        const saiu = await generateProjectTechPlan(Object.assign({ projectName: row.name || nome, rethrow: true }, comb ? { combine: comb } : {}));
        if (saiu === false) throw new Error(fdT('busy'));
        ok++;
        if (!comb) await sleep(700);   // modo antigo (um PDF por projeto): deixa o download terminar
      } catch (err) {
        falhas.push((row.name || row.id) + ' — ' + ((err && err.message) || String(err)));
      }
    }
  } finally {
    try {
      if (typeof projectDirty !== 'undefined') projectDirty = false;
      if (abertoAntes) {
        const { data } = await supabaseClient.from('user_projects').select('*').eq('id', abertoAntes).single();
        if (data) await restoreFavoriteProject(data, true);
      } else if (typeof resetProject === 'function') { projectSlots = []; resetProject(); }
    } catch (e) { console.error('[plano técnico da pasta] reabrir:', e); }
    try { if (comb && comb.sections.length) ptFinishCombined(comb, { folder: nome }); } catch (e) { console.error('[plano técnico da pasta] índice:', e); falhas.push('PDF — ' + ((e && e.message) || String(e))); }
    try { const btn = document.querySelector('.portal-tab-btn[data-tab="po-tab-my-orders"]'); if (btn) btn.click(); } catch (e) { /* fica no editor */ }
    cxFolderTpRunning = false;
    aviso.remove();
  }
  alert(fdT('tp_done', { ok, n: lista.length }) + (falhas.length ? '\n\n' + fdT('tp_fail') + '\n' + falhas.join('\n') : ''));
}
async function cxFolderAction(v, k) {
  const itens = cxNetRows().filter((o) => cxFolderKey(o) === k);
  if (!itens.length || cxSemPasta(k)) return;
  const nome = itens[0]._folder;
  let stEl = null;
  document.querySelectorAll('.cx-fstatus').forEach((el) => { if (el.getAttribute('data-fst') === k) stEl = el; });
  if (v === 'share') return shareProjectFolder(nome);
  if (v === 'lost') {
    // só os projetos EM CONSTRUÇÃO da pasta (pedido enviado não é "perdido");
    // a janela de motivo é a mesma do projeto (portal-43), uma vez pra todos.
    const ids = itens.filter((o) => o._proj && o._pid).map((o) => o._pid);
    const api = window.LegnoMinhaEmpresa;
    if (!api || !ids.length) return;
    try {
      const ok = await api.marcarPerdido(ids, nome + ' (' + ids.length + ')');
      if (ok) { cxState.lostLoaded = false; cxState.scope = null; cxState.fmenu = ''; if (typeof mpLoad === 'function') mpLoad(); }
    } catch (e) { alert((e && e.message) || String(e)); }
    return;
  }
  let lista;
  try { lista = await cxFolderProjects(itens); } catch (e) { alert((e && e.message) || String(e)); return; }
  if (v === 'rename') return renameProjectFolder(nome, lista);
  if (v === 'delete') return deleteProjectFolder(nome, lista);
  if (v === 'proposal') return generateClientProposalPDF(nome, lista.filter((p) => !p.frozen_order_id), stEl);
  if (v === 'techplan') return cxFolderTechPlans(nome, lista);
  if (v === 'budget') return mpFolderBudget({ nome, lista }, stEl);
  if (v === 'archive') return mpArchive({ nome, lista, arquivada: lista.length > 0 && lista.every((p) => p.archived_at) });
}
function cxTotalRow(itens, antes, depois, soProj) {
  const precos = cxSomaTds(itens, soProj);
  return '<tfoot><tr class="cx-tot"><td colspan="' + antes + '">' + cEsc(cT('sum', { n: itens.length })) + '</td>' + precos + (depois ? '<td colspan="' + depois + '"></td>' : '') + '</tr></tfoot>';
}
// 21/11: clicar na linha do projeto abre o cartão dele EMBAIXO (como era nas
// pastas: abrir no editor, 3D, compartilhar, renomear, pasta…). O cartão vem
// da lista antiga (mpAttachCards, portal-09) — só existe pros MEUS projetos;
// projeto de outra conta (admin/dealer vendo a equipe) mostra só "Abrir no editor".
function cxProjOpen() { return cxState.projOpen || (cxState.projOpen = new Set()); }
// CARTÃO DO PROJETO na linha aberta (21/11, Matt: "antes tinha vários botões,
// além da telinha do projeto, pode colocar isso novamente"). Projeto MEU usa o
// cartão de sempre (mpAttachCards troca este pelo da lista antiga). Projeto de
// OUTRA conta (admin / dealer vendo a equipe) não tem cartão na lista antiga,
// então monta um aqui com a imagem e os mesmos botões: abrir, renomear,
// duplicar (a cópia nasce na MINHA conta, mesma loja), compartilhar, 3D, pasta.
// Excluir fica só com o dono. Gravar no projeto dos outros depende do RLS
// (admin: migration 315; dealer: vendedores dele, migration 265).
function cxProjCardHtml(o, doPedido) {
  const c = (cxState.projCard || (cxState.projCard = {}))[o._pid];
  const T = (k, v) => (typeof I18n !== 'undefined' ? I18n.t(k, v) : k);
  const src = c && (c.ai_preview_url || c.thumbnail_data_url);
  const bt = (a, rot, prim) => '<button type="button"' + (prim ? '' : ' class="secondary"') + ' data-cx="pj" data-a="' + a + '" data-id="' + cEsc(o.id) + '">' + cEsc(rot) + '</button>';
  return '<div class="cx-pcard">'
    + (src ? '<img class="cx-pimg" alt="" src="' + cEsc(src) + '" data-cx="pj" data-a="zoom" data-id="' + cEsc(o.id) + '">' : '<div class="cx-pimg cx-pimg-0">' + (c ? '' : '…') + '</div>')
    + '<div class="cx-pbody"><b>' + cEsc(o._pname || o.po_name || '') + '</b>'
    + '<div class="hint">' + cEsc([cxPnum(o.project_number), o._folder ? '📁 ' + o._folder : '', cxUserName(o.client_user_id, [o])].filter(Boolean).join(' · ')) + '</div>'
    + '<div class="cx-pacts">' + bt('open', T('project.load_btn'), 1) + (doPedido ? '' : bt('rename', T('fav.rename_btn'))) + bt('dup', T('fav.duplicate_btn')) + bt('share', T('project.share_btn')) + bt('v3d', T('fav.view3d_btn')) + (doPedido ? '' : bt('folder', T('fav.folder_btn')))
      // EXCLUIR PROJETO (22/11, Matt: "quero deletar uns projetos"): dono ou admin, só projeto que NÃO virou pedido.
      + (!doPedido && (cxAdmin() || o.client_user_id === cxMe()) ? '<button type="button" class="secondary" style="color:#9a2b1e;border-color:#d9b3ad" data-cx="pj" data-a="del" data-id="' + cEsc(o.id) + '">' + cEsc(odT('pdel_btn')) + '</button>' : '') + '</div>'
    + '</div></div>';
}
async function cxProjCardLoad(pid) {
  const cache = cxState.projCard || (cxState.projCard = {});
  if (cache[pid]) return;
  cache[pid] = { loading: true };
  try {
    const { data } = await supabaseClient.from('user_projects').select('id, name, thumbnail_data_url, ai_preview_url').eq('id', pid).maybeSingle();
    cache[pid] = data || { sumiu: true };
  } catch (e) { cache[pid] = { sumiu: true }; }
  const noPedido = cxState.scope && (cxState.scope.orders || []).some((o) => !o._proj && o.source_project_id === pid && cxOrdOpen().has(o.id));
  if (cxProjOpen().has(pid) || noPedido) { mpRender(); if (typeof mpAttachCards === 'function') mpAttachCards(); }
}
// PROJETO DE ORIGEM NA LINHA DO PEDIDO (22/11, Matt: "preciso dessa tela no
// orders, como eu abro o projeto pra visualização?"): o ▾ do pedido mostra o
// mesmo cartão do projeto (imagem + abrir / duplicar / compartilhar / 3D) do
// projeto que virou o pedido (orders.source_project_id). O projeto está
// congelado pelo pedido: abrir é pra VER; pra mexer, Duplicar. Renomear e Pasta
// ficam de fora. Pedido sem projeto de origem (New Quote) ou com o projeto
// apagado não mostra nada.
function cxOrdProj(o) {
  if (!o || o._proj || !o.source_project_id) return null;
  const c = (cxState.projCard || {})[o.source_project_id];
  if (c && c.sumiu) return null;
  const px = o._pproxy || (o._pproxy = { id: o.id, _pid: o.source_project_id, client_user_id: o.client_user_id });
  px._pname = (c && c.name) || o._pname || o.po_name || ''; px.po_name = o.po_name; px.project_number = o.project_number; px._folder = o._folder; px.account_id = o.account_id;
  return px;
}
async function cxProjAction(a, o) {
  const T = (k, v) => (typeof I18n !== 'undefined' ? I18n.t(k, v) : k);
  const proj = o._row || (o._row = { id: o._pid, name: o._pname, client_folder: o._folder || null, client_user_id: o.client_user_id });
  const full = async () => { if (!proj._fullRow) await fetchProjectFullRow(proj); return proj; };
  try {
    if (a === 'zoom') { const c = (cxState.projCard || {})[o._pid]; const src = c && (c.ai_preview_url || c.thumbnail_data_url); if (src && typeof openGalleryLightbox === 'function') openGalleryLightbox(src); return; }
    if (a === 'del') {
      // Só projeto NÃO enviado (frozen_order_id vazio — o delete repete o filtro).
      // Projeto de OUTRA conta: o admin precisa da migration 327; sem ela o banco
      // devolve 0 linhas e a tela avisa. Não tem volta: fotos realistas e
      // imagens de referência vão junto (cascade).
      const meu = o.client_user_id === cxMe();
      const dono = cxUserName(o.client_user_id, [o]) || '';
      if (!confirm(odT(meu ? 'pdel_q' : 'pdel_q_outro').replace('{nome}', o._pname || '').replace('{dono}', dono))) return;
      const { data, error } = await supabaseClient.from('user_projects').delete().eq('id', o._pid).is('frozen_order_id', null).select('id');
      if (error) throw error;
      if (!data || !data.length) return alert(odT(meu ? 'pdel_frozen' : 'pdel_327'));
      cxProjOpen().delete(o._pid);
      cxState.scope = null;
      if (typeof loadProjectFavoritesList === 'function') loadProjectFavoritesList();
      if (typeof mpLoad === 'function') mpLoad();
      return;
    }
    if (a === 'open') { await full(); return restoreFavoriteProject(proj); }
    if (a === 'share') { await full(); await shareProjectFavorite(proj); return; }
    if (a === 'v3d') { await full(); await view3DFavoriteProject(proj); return; }
    if (a === 'rename' || a === 'folder') {
      const atual = a === 'rename' ? (o._pname || '') : (o._folder || '');
      const resp = prompt(T(a === 'rename' ? 'project.name_prompt' : 'fav.folder_prompt'), atual);
      if (resp === null) return;
      const novo = resp.trim().slice(0, a === 'rename' ? 120 : 80);
      if (novo === atual || (a === 'rename' && !novo)) return;
      const upd = a === 'rename' ? { name: novo, updated_at: new Date().toISOString() } : { client_folder: novo || null };
      const { data, error } = await supabaseClient.from('user_projects').update(upd).eq('id', o._pid).select('id');
      if (error) throw error;
      if (!data || !data.length) throw new Error(T('project.update_blocked'));
      if (a === 'rename') { o._pname = novo; o.po_name = novo; proj.name = novo; } else { o._folder = novo; proj.client_folder = novo || null; }
      return mpRender();
    }
    if (a === 'dup') {
      const novoNome = (prompt(T('fav.duplicate_name_prompt'), (o._pname || '') + T('fav.duplicate_name_suffix')) || '').trim();
      if (!novoNome) return;
      await full();
      const p = proj; const dup = { client_user_id: cxMe(), name: novoNome, slots: p.slots, wall_width_mm: p.wall_width_mm, wall_shape: p.wall_shape, wall_widths_mm: p.wall_widths_mm };
      ['wall_segments', 'floor_texture', 'geometria', 'bancada', 'thumbnail_data_url', 'ai_preview_url', 'cached_value_usd', 'client_folder', 'client_info', 'account_id'].forEach((k) => { if (p[k] != null) dup[k] = p[k]; });
      let r = await supabaseClient.from('user_projects').insert(dup).select('id');
      if (r.error && /account_id|client_info|bancada|geometria|floor_texture/.test(r.error.message || '')) { ['account_id', 'client_info', 'bancada', 'geometria', 'floor_texture'].forEach((k) => delete dup[k]); r = await supabaseClient.from('user_projects').insert(dup).select('id'); }
      if (r.error) throw r.error;
      cxState.scope = null;
      if (typeof loadProjectFavoritesList === 'function') loadProjectFavoritesList();
      if (typeof mpLoad === 'function') mpLoad();
      return;
    }
  } catch (e) { alert((e && e.message) || String(e)); }
}
function cxPnum(n) { return n ? 'P' + String(Number(n)).padStart(7, '0') : ''; }
function cxNumVal(o) { return o._proj ? (Number(o.project_number) || 0) : (Number(o.factory_number) || 0); }
const OD_TXT = {
  pt: { back_qbo: 'ATENÇÃO: a invoice deste pedido no QuickBooks NÃO é apagada — cancele lá à mão.', back_inv: 'A invoice {n} deste pedido é CANCELADA junto (o número não é reaproveitado).', pay_col: 'Pagamento', next: 'Próxima etapa', more: 'Mais informações', less: 'Recolher', seller: 'Vendedor', client: 'Cliente', room: 'Ambiente', addr: 'Endereço da obra', prices: 'Valores', tools: 'Invoice e pagamento', open: 'Abrir pedido', paid: 'Pago ✓', rcpt_sent: 'Comprovante enviado', no_link: 'sem link', lost_btn: '✕ Projeto perdido — motivo', old_link: 'Arquivados por inatividade ({n})', old_back: '← Voltar aos ativos ({n} arquivados)', old_hint: 'Arquivado: {n} dias sem alteração. Abrir e salvar o projeto traz ele de volta.', del_btn: '✕ Excluir pedido', del_all: 'Excluir meus pedidos aguardando aprovação desta lista ({n})', del_q: 'Excluir o pedido {no}{po} de {v}?\n\nNão dá pra desfazer. O projeto de origem (se existir) volta a ficar editável.', del_all_q: 'Excluir {n} pedido(s) AGUARDANDO APROVAÇÃO desta lista, total {v}?\n\nNão dá pra desfazer. Os projetos de origem voltam a ficar editáveis.\n\nPra confirmar, digite {n}:', del_none: 'Nenhum pedido foi excluído — ele já foi aprovado ou não é seu.', del_done: '{n} pedido(s) excluído(s).', del_lote: 'Pra excluir: tire o pedido do lote {lote} no ERP (Lotes › {lote} › ✕ ao lado do pedido). Depois o botão Excluir aparece aqui.', del_inv: 'Este pedido tem invoice, link de pagamento ou comprovante — não pode ser excluído por aqui.', del_fim: 'Pedido com coleta liberada ou entregue não pode ser excluído por aqui.', del_aprov: 'ATENÇÃO: este pedido JÁ FOI APROVADO.', del_pago: 'Está marcado como PAGO.', pdel_btn: '✕ Excluir', pdel_q: 'Excluir o projeto "{nome}"?\n\nNão dá pra desfazer. As fotos realistas e imagens de referência dele vão junto.', pdel_q_outro: 'ATENÇÃO: este projeto é de OUTRA CONTA ({dono}).\n\nExcluir o projeto "{nome}" do cliente?\n\nNão dá pra desfazer. As fotos realistas e imagens de referência dele vão junto.', pdel_frozen: 'Nada foi excluído: este projeto já virou pedido (ou não existe mais).', pdel_327: 'O banco não deixou: o projeto é de outra conta (ou já virou pedido). Pra fábrica poder excluir projeto de outra conta, rode a migration 327 no Supabase.', rc_btn: 'Recibo de coleta (PDF)', rc_title: 'Recibo de coleta', rc_order: 'Pedido', rc_sum: '{n} peças conferidas e apontadas — de {de} até {ate}.', rc_piece: 'Peça', rc_dims: 'Medidas', rc_color: 'Cor', rc_code: 'Etiqueta', rc_when: 'Apontada em', rc_avulsas: 'Peças avulsas', rc_decl: 'Declaro que recebi as {n} peças listadas acima, conferidas no ato da coleta.', rc_name: 'Nome de quem retirou', rc_sign: 'Assinatura', rc_date: 'Data e hora da coleta', rc_plate: 'Documento / placa do veículo', rc_none: 'Este pedido não tem peças em lote.', rc_falta: 'Ainda faltam {n} peça(s) sem apontamento — o recibo só sai com tudo apontado.', rc_329: 'Pra gerar o recibo falta rodar a migration 329 no Supabase.', lote: 'Lote', back_326: 'O banco não deixou: o pedido é de outra conta (ou já foi aprovado). Pra fábrica poder voltar pedido de outra conta, rode a migration 326 no Supabase.' },
  en: { back_qbo: 'WARNING: this order\'s QuickBooks invoice is NOT deleted — void it there by hand.', back_inv: 'Invoice {n} of this order is CANCELED with it (the number is not reused).', pay_col: 'Payment', next: 'Next step', more: 'More information', less: 'Collapse', seller: 'Salesperson', client: 'Client', room: 'Room', addr: 'Job site address', prices: 'Amounts', tools: 'Invoice and payment', open: 'Open order', paid: 'Paid ✓', rcpt_sent: 'Receipt sent', no_link: 'no link', lost_btn: '✕ Lost project — reason', old_link: 'Archived for inactivity ({n})', old_back: '← Back to active ({n} archived)', old_hint: 'Archived: {n} days without changes. Opening and saving the project brings it back.', del_btn: '✕ Delete order', del_all: 'Delete my orders waiting approval in this list ({n})', del_q: 'Delete order {no}{po} of {v}?\n\nThis cannot be undone. The source project (if any) becomes editable again.', del_all_q: 'Delete {n} order(s) WAITING APPROVAL in this list, total {v}?\n\nThis cannot be undone. The source projects become editable again.\n\nTo confirm, type {n}:', del_none: 'No order was deleted — it was already approved or is not yours.', del_done: '{n} order(s) deleted.', del_lote: 'To delete: remove the order from batch {lote} in the ERP (Batches › {lote} › ✕ next to the order). Then the Delete button shows up here.', del_inv: 'This order has an invoice, payment link or receipt — it cannot be deleted here.', del_fim: 'An order released for pickup or delivered cannot be deleted here.', del_aprov: 'WARNING: this order WAS ALREADY APPROVED.', del_pago: 'It is marked as PAID.', pdel_btn: '✕ Delete', pdel_q: 'Delete the project "{nome}"?\n\nThis cannot be undone. Its photoreal pictures and reference images go with it.', pdel_q_outro: 'WARNING: this project belongs to ANOTHER ACCOUNT ({dono}).\n\nDelete the client\'s project "{nome}"?\n\nThis cannot be undone. Its photoreal pictures and reference images go with it.', pdel_frozen: 'Nothing was deleted: this project already became an order (or no longer exists).', pdel_327: 'The database refused: the project belongs to another account (or already became an order). For the factory to delete another account\'s project, run migration 327 in Supabase.', rc_btn: 'Pickup receipt (PDF)', rc_title: 'Pickup receipt', rc_order: 'Order', rc_sum: '{n} parts checked and scanned — from {de} to {ate}.', rc_piece: 'Part', rc_dims: 'Dimensions', rc_color: 'Color', rc_code: 'Label', rc_when: 'Scanned at', rc_avulsas: 'Loose parts', rc_decl: 'I confirm that I received the {n} parts listed above, checked at pickup.', rc_name: 'Name of the person picking up', rc_sign: 'Signature', rc_date: 'Pickup date and time', rc_plate: 'ID / vehicle plate', rc_none: 'This order has no parts in a batch.', rc_falta: '{n} part(s) still not scanned — the receipt only comes out with everything scanned.', rc_329: 'To generate the receipt, migration 329 must be run in Supabase.', lote: 'Batch', back_326: 'The database refused: the order belongs to another account (or was already approved). For the factory to return another account\'s order, run migration 326 in Supabase.' },
  es: { back_qbo: 'ATENCIÓN: la factura de este pedido en QuickBooks NO se borra — anúlela allí a mano.', back_inv: 'La factura {n} de este pedido se CANCELA junto (el número no se reutiliza).', pay_col: 'Pago', next: 'Próxima etapa', more: 'Más información', less: 'Contraer', seller: 'Vendedor', client: 'Cliente', room: 'Ambiente', addr: 'Dirección de la obra', prices: 'Valores', tools: 'Factura y pago', open: 'Abrir pedido', paid: 'Pagado ✓', rcpt_sent: 'Comprobante enviado', no_link: 'sin link', lost_btn: '✕ Proyecto perdido — motivo', old_link: 'Archivados por inactividad ({n})', old_back: '← Volver a los activos ({n} archivados)', old_hint: 'Archivado: {n} días sin cambios. Abrir y guardar el proyecto lo trae de vuelta.', del_btn: '✕ Eliminar pedido', del_all: 'Eliminar mis pedidos esperando aprobación de esta lista ({n})', del_q: '¿Eliminar el pedido {no}{po} de {v}?\n\nNo se puede deshacer. El proyecto de origen (si existe) vuelve a ser editable.', del_all_q: '¿Eliminar {n} pedido(s) ESPERANDO APROBACIÓN de esta lista, total {v}?\n\nNo se puede deshacer. Los proyectos de origen vuelven a ser editables.\n\nPara confirmar, escriba {n}:', del_none: 'No se eliminó ningún pedido — ya fue aprobado o no es suyo.', del_done: '{n} pedido(s) eliminado(s).', del_lote: 'Para eliminar: quite el pedido del lote {lote} en el ERP (Lotes › {lote} › ✕ junto al pedido). Luego el botón Eliminar aparece aquí.', del_inv: 'Este pedido tiene factura, link de pago o comprobante — no se puede eliminar aquí.', del_fim: 'Un pedido liberado para retiro o entregado no se puede eliminar aquí.', del_aprov: 'ATENCIÓN: este pedido YA FUE APROBADO.', del_pago: 'Está marcado como PAGADO.', pdel_btn: '✕ Eliminar', pdel_q: '¿Eliminar el proyecto "{nome}"?\n\nNo se puede deshacer. Sus fotos realistas e imágenes de referencia se van con él.', pdel_q_outro: 'ATENCIÓN: este proyecto es de OTRA CUENTA ({dono}).\n\n¿Eliminar el proyecto "{nome}" del cliente?\n\nNo se puede deshacer.', pdel_frozen: 'No se eliminó nada: este proyecto ya se convirtió en pedido (o ya no existe).', pdel_327: 'La base no lo permitió: el proyecto es de otra cuenta. Ejecute la migration 327 en Supabase.', rc_btn: 'Recibo de retiro (PDF)', rc_title: 'Recibo de retiro', rc_order: 'Pedido', rc_sum: '{n} piezas verificadas y registradas — de {de} a {ate}.', rc_piece: 'Pieza', rc_dims: 'Medidas', rc_color: 'Color', rc_code: 'Etiqueta', rc_when: 'Registrada', rc_avulsas: 'Piezas sueltas', rc_decl: 'Declaro que recibí las {n} piezas listadas arriba, verificadas en el retiro.', rc_name: 'Nombre de quien retira', rc_sign: 'Firma', rc_date: 'Fecha y hora del retiro', rc_plate: 'Documento / placa del vehículo', rc_none: 'Este pedido no tiene piezas en lote.', rc_falta: 'Faltan {n} pieza(s) sin registrar — el recibo solo sale con todo registrado.', rc_329: 'Para generar el recibo falta ejecutar la migration 329 en Supabase.', lote: 'Lote', back_326: 'La base no lo permitió: el pedido es de otra cuenta (o ya fue aprobado). Ejecute la migration 326 en Supabase.' }
};
function odT(k) { const L = OD_TXT[cxLang()] || OD_TXT.en; return L[k] != null ? L[k] : (OD_TXT.en[k] || k); }
// EXCLUIR PEDIDO (22/11, Matt: "muitos pedidos que criei de teste e quero deletar").
// Só pedido AGUARDANDO APROVAÇÃO (status 'submitted') e só do PRÓPRIO login —
// é o que o banco deixa (policy "client manage own orders"); o delete repete
// os dois filtros, então pedido aprovado no meio do caminho não é apagado.
// order_items some junto (cascade) e o projeto de origem descongela
// (frozen_order_id on delete set null), igual ao "Voltar ao projeto".
// 22/11, 2ª rodada (pedido 00041 substituído por um revisado): o ADMIN também
// exclui pedido JÁ APROVADO do próprio login, desde que ele esteja FORA de
// lote (tirar antes no ERP › Lotes › ✕ no pedido), sem invoice, sem link de
// pagamento/comprovante e sem pagamento. Apagar pedido dentro de lote deixaria
// as peças dele órfãs no plano de corte. `cxPodeExcluirAprovado` só vale com o
// andamento carregado (s.track) — sem ele não dá pra saber se está em lote.
function cxPodeExcluirAprovado(o) {
  const s = cxState.scope || {};
  if (!o || o._proj || !cxAdmin() || o.client_user_id !== cxMe() || o.status === 'submitted') return false;
  // paid_at SOZINHO não trava (22/11, 3ª rodada): é o "Marcar como pago" manual dos pedidos de
  // teste de antes do ERP (Matt: "são beeem antigos... quero deletá-los"). Trava o que é
  // documento de verdade: invoice emitida, QuickBooks, link de pagamento, comprovante.
  if (o.pickup_released_at || o.delivered_at || o.qbo_paid_at || o.invoice_number || o.qbo_invoice_id || o.payment_link || o.receipt_path) return false;
  const t = s.track && s.track[o.id];
  if (!t || t.batch_code) return false;
  const pc = s.pieces && s.pieces[o.id];
  return !(pc && Number(pc.total) > 0);
}
function cxPodeExcluir(o) { return !!(o && !o._proj && o.client_user_id === cxMe() && (o.status === 'submitted' || cxPodeExcluirAprovado(o))); }
function cxMotivoNaoExclui(o) {
  const s = cxState.scope || {};
  if (!o || o._proj || !cxAdmin() || o.client_user_id !== cxMe() || o.status === 'submitted' || cxPodeExcluir(o)) return '';
  const t = s.track && s.track[o.id];
  if (t && t.batch_code) return odT('del_lote').replace(/\{lote\}/g, t.batch_code);
  if (o.invoice_number || o.qbo_invoice_id || o.payment_link || o.receipt_path || o.qbo_paid_at) return odT('del_inv');
  if (o.pickup_released_at || o.delivered_at) return odT('del_fim');
  return '';
}
function cxExcluiveis() { return cxNetRows().filter((o) => cxPodeExcluir(o) && o.status === 'submitted'); }   // em massa: só os aguardando aprovação
async function cxDeleteOrders(ids) {
  const s = cxState.scope; const me = cxMe();
  if (!s || !me || !ids.length) return;
  const lista = s.orders.filter((o) => ids.includes(o.id) && cxPodeExcluir(o));
  if (!lista.length) return alert(odT('del_none'));
  const valor = (o) => Number(o._it != null ? o._it : o._n != null ? o._n : o._v != null ? o._v : 0) || 0;
  const total = cMoney(lista.reduce((t, o) => t + valor(o), 0));
  if (lista.length === 1) {
    const o = lista[0]; const no = cxNumVal(o);
    const noTxt = no ? String(no).padStart(5, '0') + ' ' : '';
    if (!confirm((o.status !== 'submitted' ? odT('del_aprov') + (o.paid_at ? ' ' + odT('del_pago') : '') + '\n\n' : '') + odT('del_q').replace('{no}', noTxt).replace('{po}', o.po_name ? '"' + o.po_name + '" ' : '').replace('{v}', total))) return;
  } else {
    const dig = prompt(odT('del_all_q').replace(/\{n\}/g, lista.length).replace('{v}', total));
    if (dig == null || String(dig).trim() !== String(lista.length)) return;
  }
  let feitos = 0; let erro = null;
  try {
    const todos = lista.filter((o) => o.status === 'submitted').map((o) => o.id);
    for (let i = 0; i < todos.length; i += 50) {
      const { data, error } = await supabaseClient.from('orders').delete()
        .in('id', todos.slice(i, i + 50)).eq('status', 'submitted').eq('client_user_id', me).select('id');
      if (error) throw error;
      feitos += (data || []).length;
    }
    // aprovado fora de lote: um por vez, conferindo o lote DE NOVO no banco na hora
    for (const o of lista.filter((x) => x.status !== 'submitted')) {
      const tr = await supabaseClient.rpc('portal_order_tracking', { p_order_ids: [o.id] });
      if (tr.error) throw tr.error;
      const linha = (tr.data || []).find((r) => r.order_id === o.id);
      if (!linha) throw new Error(odT('del_none'));
      if (linha.batch_code) throw new Error(odT('del_lote').replace(/\{lote\}/g, linha.batch_code));
      const { data, error } = await supabaseClient.from('orders').delete()
        .eq('id', o.id).eq('client_user_id', me).is('pickup_released_at', null).select('id');
      if (error) throw error;
      feitos += (data || []).length;
    }
  } catch (e) { erro = e; }
  cxState.scope = null;
  if (typeof myOrdersLoaded !== 'undefined') myOrdersLoaded = false;
  if (typeof mpLoad === 'function') mpLoad();
  if (erro) return alert((feitos ? odT('del_done').replace('{n}', feitos) + '\n\n' : '') + ((erro && erro.message) || String(erro)));
  if (!feitos) return alert(odT('del_none'));
  if (lista.length > 1 || feitos !== lista.length) alert(odT('del_done').replace('{n}', feitos));
}
// VOLTAR AO PROJETO (22/11, Matt: "como faço pra voltar essa ordem pra
// projetos? tinha um botão antes"): o botão da lista antiga (portal-02
// returnOrderToProject) dentro do ▾. Pedido PENDENTE que veio de um projeto:
// apaga o pedido e o projeto descongela (nada do projeto se perde). Dono
// sempre pode; admin em pedido de OUTRA conta precisa da migration 326 (sem
// ela o banco devolve 0 linhas e a tela avisa).
// 22/11 (2ª rodada, Matt: "coloquei um projeto como ordem, quero voltar pra projeto, não achei o botão"):
// o ENVIAR FÁBRICA já aprova na hora, então o pedido nunca fica 'submitted'. Volta também o APROVADO
// enquanto a fábrica não liberou a produção e não há invoice / pagamento / comprovante / lote.
function cxPodeVoltar(o) {
  if (!o || o._proj || !o.source_project_id || !(o.client_user_id === cxMe() || cxAdmin())) return false;
  if (o.status === 'submitted') return true;
  if (o.status !== 'approved' || o.pickup_released_at) return false;
  // invoice do PORTAL emitida não trava (22/11, 3ª rodada: Matt gerou a invoice e o botão sumiu) — ela é cancelada junto,
  // com aviso. Trava o que já é dinheiro/documento fora do portal: pago, entrada, comprovante, invoice no QuickBooks.
  // 22/11, 4ª rodada (Matt: "só trava depois de pagamento feito, aí não tem volta"): a ÚNICA trava de negócio é
  // pagamento confirmado (pago ou entrada paga). Invoice, comprovante, QuickBooks e produção liberada não travam.
  // Lote continua travando por motivo técnico (as peças do lote ficariam órfãs): tirar do lote no ERP antes.
  if (o.paid_at || o.qbo_paid_at || o.pay_deposit_at) return false;
  const t = ((cxState.scope || {}).track || {})[o.id];
  return !(t && t.batch_code);
}
async function cxBackToProject(id) {
  const s = cxState.scope; const o = s && s.orders.find((x) => x.id === id);
  if (!cxPodeVoltar(o)) return;
  const T = (k) => (typeof I18n !== 'undefined' ? I18n.t(k) : k);
  if (!confirm(T('my_orders.back_to_project_confirm') + (o.invoice_number ? '\n\n' + odT('back_inv').replace('{n}', o.invoice_number) : '') + (o.qbo_invoice_id ? '\n\n' + odT('back_qbo') : ''))) return;
  try {
    const { data, error } = await supabaseClient.from('orders').delete().eq('id', id).in('status', ['submitted', 'approved']).is('paid_at', null).select('id');
    if (error) throw error;
    if (!data || !data.length) return alert(o.client_user_id === cxMe() ? T('my_orders.back_to_project_not_pending') : odT('back_326'));
  } catch (e) { return alert((e && e.message) || String(e)); }
  cxState.scope = null;
  if (typeof myOrdersLoaded !== 'undefined') myOrdersLoaded = false;
  if (typeof mpLoad === 'function') mpLoad();
}
// RECIBO DE COLETA (22/11, Matt: "quero um pdf mostrando todas as peças com hora
// e data de apontamento, como recibo de coleta. não mostrar legno em nenhum
// lugar... isso só depois de tudo apontado"). Botão no ▾ do pedido, só quando
// TODAS as peças estão apontadas (s.pieces: feitas >= total > 0). Uma linha por
// peça física, agrupada por módulo, com data/hora do apontamento + quadro de
// assinatura. WHITE LABEL: sem logo, sem nome de loja, sem "Legno" no texto
// nem no nome do arquivo (trkPdfNew com brand null).
// Dados: RPC portal_order_pickup_receipt (migration 329; dono ou admin). Sem a
// 329 o admin lê o erp direto; pros outros a tela avisa.
function cxPodeRecibo(o) {
  const s = cxState.scope || {};
  if (!o || o._proj || cxSeller() || !(cxAdmin() || o.client_user_id === cxMe())) return false;
  const pc = s.pieces && s.pieces[o.id];
  return !!(pc && Number(pc.total) > 0 && Number(pc.feitas) >= Number(pc.total));
}
async function cxReciboLinhas(orderId) {
  const r = await supabaseClient.rpc('portal_order_pickup_receipt', { p_order: orderId });
  if (!r.error) return r.data || [];
  if (!cxAdmin()) throw new Error(odT('rc_329'));
  // admin sem a 329: lê o erp direto
  const erp = supabaseClient.schema('erp');
  const bp = await erp.from('batch_pieces').select('id, module_number, module_name, reference, comprimento_mm, largura_mm, espessura_mm, color_name, quantity, sort_order').eq('order_id', orderId).order('sort_order').limit(5000);
  if (bp.error) throw bp.error;
  const sc = await erp.from('piece_scans').select('batch_piece_id, unit_idx, piece_code, scanned_at').eq('order_id', orderId).limit(10000);
  if (sc.error) throw sc.error;
  const scan = {}; (sc.data || []).forEach((x) => { scan[x.batch_piece_id + '|' + x.unit_idx] = x; });
  const out = [];
  (bp.data || []).forEach((p) => { for (let u = 1; u <= (Number(p.quantity) || 1); u++) { const x = scan[p.id + '|' + u] || {}; out.push({ module_number: p.module_number, module_name: p.module_name, reference: p.reference, c_mm: p.comprimento_mm, l_mm: p.largura_mm, e_mm: p.espessura_mm, color_name: p.color_name, unit_idx: u, quantity: p.quantity, piece_code: x.piece_code || null, scanned_at: x.scanned_at || null }); } });
  return out.sort((a, b) => String(a.module_number || '~').localeCompare(String(b.module_number || '~'), undefined, { numeric: true }));
}
async function cxPickupReceipt(id, btn) {
  const o = cxState.scope && cxState.scope.orders.find((x) => x.id === id);
  if (!cxPodeRecibo(o)) return;
  if (typeof trkPdfNew !== 'function') return alert('PDF');
  const rot = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const linhas = await cxReciboLinhas(id);
    if (!linhas.length) throw new Error(odT('rc_none'));
    const falta = linhas.filter((l) => !l.scanned_at).length;
    if (falta) throw new Error(odT('rc_falta').replace('{n}', falta));
    const loc = (typeof currentLocale === 'function') ? currentLocale() : undefined;
    const dh = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(loc) + ' ' + d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
    const dim = (v) => (typeof trkDim === 'function' ? trkDim(v) : String(Math.round(Number(v) || 0)));
    const no = Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : '';
    const ctx = trkPdfNew(o, odT('rc_title') + (no ? ' — ' + odT('rc_order') + ' ' + no : ''), false, null);
    const tempos = linhas.map((l) => new Date(l.scanned_at).getTime()).filter((t) => !isNaN(t));
    trkPdfNote(ctx, odT('rc_sum').replace('{n}', linhas.length).replace('{de}', dh(Math.min.apply(null, tempos))).replace('{ate}', dh(Math.max.apply(null, tempos))));
    if (o.delivery_address) trkPdfNote(ctx, odT('addr') + ': ' + o.delivery_address);
    const grupos = []; const idx = {};
    linhas.forEach((l) => { const k = [l.module_number || '', l.module_name || ''].join('|'); if (!(k in idx)) { idx[k] = grupos.length; grupos.push({ num: l.module_number, nome: l.module_name, itens: [] }); } grupos[idx[k]].itens.push(l); });
    let seq = 0;
    grupos.forEach((g) => {
      trkPdfSection(ctx, [g.num, g.nome].filter(Boolean).join(' · ') || odT('rc_avulsas'));
      trkPdfTable(ctx, [
        { label: '#', w: 0.06 }, { label: odT('rc_piece'), w: 0.30 }, { label: odT('rc_dims'), w: 0.22 },
        { label: odT('rc_color'), w: 0.16 }, { label: odT('rc_code'), w: 0.10 }, { label: odT('rc_when'), w: 0.16 }
      ], g.itens.map((l) => [String(++seq), String(l.reference || '—') + (Number(l.quantity) > 1 ? ' (' + l.unit_idx + '/' + l.quantity + ')' : ''),
        dim(l.c_mm) + ' x ' + dim(l.l_mm) + ' x ' + dim(l.e_mm), l.color_name || '', l.piece_code || '', dh(l.scanned_at)]));
    });
    // quadro de assinatura (quem retirou)
    trkPdfEnsure(ctx, 46);
    const doc = ctx.doc; const M = 12; const y0 = ctx.y + 6; const meio = ctx.W / 2;
    doc.setFontSize(9.5); doc.setTextColor(40);
    doc.text(trkPdfTxt(odT('rc_decl').replace('{n}', linhas.length)), M, y0, { maxWidth: ctx.W - 2 * M });
    doc.setDrawColor(120); doc.setLineWidth(0.3);
    [[M, odT('rc_name')], [meio + 4, odT('rc_sign')]].forEach(([x, t]) => { doc.line(x, y0 + 22, x + meio - M - 8, y0 + 22); doc.setFontSize(8); doc.setTextColor(110); doc.text(trkPdfTxt(t), x, y0 + 26); });
    [[M, odT('rc_date')], [meio + 4, odT('rc_plate')]].forEach(([x, t]) => { doc.line(x, y0 + 38, x + meio - M - 8, y0 + 38); doc.setFontSize(8); doc.setTextColor(110); doc.text(trkPdfTxt(t), x, y0 + 42); });
    doc.setTextColor(0);
    trkPdfFooters(ctx);
    doc.save('pickup-receipt-' + (no || (typeof trkFileBase === 'function' ? trkFileBase(o) : 'order')) + '.pdf');
  } catch (e) { alert((e && e.message) || String(e)); }
  if (btn) { btn.disabled = false; btn.textContent = rot; }
}
function cxOrdOpen() { return cxState.ordOpen || (cxState.ordOpen = new Set()); }
// linha da aba Orders: só o que decide (etapa, invoice, total, pagamento)
function cxOrdRowHtml(o, lin, num, icoN, preco, envia) {
  const s = cxState.scope || {};
  const dentro = !!lin.dentro; const aberto = cxOrdOpen().has(o.id);
  const quemL = cxUserName(o.client_user_id, [o]);   // 21/11 (Matt: "preciso enxergar qual é o vendedor"); 22/11: nome da empresa
  const quemLMail = cxUserMail(o.client_user_id, [o]) || quemL;
  const id = cEsc(o.id);
  const mini = (cx, rot, extra, tip) => '<button type="button" class="cx-mini' + (extra || '') + '" data-cx="' + cx + '" data-id="' + id + '"' + (tip ? ' title="' + cEsc(tip) + '"' : '') + '>' + cEsc(rot) + '</button>';
  const temInv = s.invOk && !o._proj && o.status !== 'submitted' && !cxSeller();   // invoice = valores de fábrica: vendedor não abre
  const libera = !cxAdmin() ? '' : (o._s === 'pay' ? ' ' + mini('relprod', cT('rel_prod'), ' cx-mini-go') : o._s === 'prod' ? ' ' + mini('relpick', cT('rel_pick'), cxProdInfo(o).embalado ? ' cx-mini-go' : '') : o._s === 'ready' ? ' ' + mini('reldone', cT('rel_done'), ' cx-mini-go') : '');   // 21/11: marrom só quando já está tudo embalado; antes disso fica discreto
  const inv = !temInv ? '—' : mini('inv', o.invoice_number || ivT('inv'), o.invoice_number ? ' cx-mini-ok' : '') + (o.qbo_invoice_id ? '<small class="cx-est" title="QuickBooks">QB</small>' : '');
  const pago = !!(o.paid_at || o.qbo_paid_at);
  const parcial = !pago && o.qbo_invoice_id && o.qbo_balance != null && o._it != null && Number(o.qbo_balance) > 0 && Number(o.qbo_balance) < Number(o._it) - 0.005;
  const pag = !temInv ? '—'
    : pago ? '<span class="cx-paid">' + cEsc(odT('paid')) + '</span>'
      : (cxPodePagar(o) ? mini('payopen', pyT('btn') + (o.pay_method ? ' · ' + pyT(o.pay_method).split(' (')[0] : '') + (o.pay_plan === 'split' ? (o.pay_deposit_at ? ' · 50% ✓' : ' · 50/50') : ''), ' cx-mini-pay') : o.payment_link ? mini('paylink', ivT('pay'), ' cx-mini-pay') : '')
        + (parcial ? '<span class="cx-paid cx-paid-p">' + cEsc(qbT('partial', { v: cMoney(o.qbo_balance) })) + '</span>' : '')
        + (o.receipt_path ? mini('rcptview', ivT('rcpt_ok'), ' cx-mini-ok', odT('rcpt_sent')) : (!cxAdmin() && !cxSeller() ? mini('rcpt', ivT('rcpt')) : ''))
        + (!o.payment_link && !o.receipt_path && cxAdmin() && !cxPodePagar(o) ? '<small class="cx-est">' + cEsc(odT('no_link')) + '</small>' : '');
  const linha = '<tr class="' + (dentro ? 'cx-in' + (lin.ultimo ? ' cx-in-last' : '') : '') + (aberto ? ' cx-ord-on' : '') + '" data-cx="openorder" data-id="' + id + '">'
    + '<td class="cx-num' + (o._proj ? ' cx-num-p' : '') + '"><span class="cx-nwrap">' + icoN + '<span>' + num + '</span></span></td>'
    + '<td class="cx-store' + (cxAdmin() ? ' cx-storecell" data-cx="pickstore" data-id="' + id : '') + '" title="' + cEsc(cxStoreName(o) + (cxAdmin() ? ' — ' + cT('mv_change') : '')) + '"><b>' + cEsc(cxStoreName(o)) + '</b>' + (cxAdmin() ? ' <span class="cx-swap">⇄</span>' : '') + '</td>'
    + '<td class="cx-quem" title="' + cEsc(quemLMail || '') + '">' + cEsc(String(quemL || '—').split('@')[0]) + '</td>'
    + '<td class="cx-item" title="' + cEsc([o.po_name, o.client_name, o.room_name, o.delivery_address].filter(Boolean).join(' · ')) + '">' + (o._folder && !dentro ? '<span class="cx-fold" data-cx="folderq" data-v="' + cEsc(o._folder) + '">📁 ' + cEsc(o._folder) + '</span> ' : '') + cEsc(o.po_name || '—') + (o._proj ? ' <span class="cx-tagp">' + cEsc(cT('tag_proj')) + '</span>' : '') + (o.client_name && o.client_name !== o._folder ? ' <span class="hint">· ' + cEsc(o.client_name) + '</span>' : '') + '</td>'
    // 22/11 (Matt: "acho bagunçado esses desalinhamentos, vamos separar duas colunas com status e
    // botão da próxima etapa"): status numa coluna, botão (Release production / pickup, Send to factory) na outra.
    + '<td class="cx-stcell">' + cxStatusHtml(o) + '</td><td class="cx-next">' + (envia || '') + libera + '</td>'
    + '<td>' + inv + '</td>'
    + (preco ? '<td class="cx-r"><b>' + (o._proj || o._it == null ? '—' : cEsc(cMoney(o._it))) + '</b></td>' : cxSeller() ? '<td class="cx-r"><b>' + (o._v != null ? cEsc(cMoney(o._v)) : '—') + '</b></td>' : '')
    + '<td>' + pag + '</td><td>' + cxQuando(o._t) + '</td>'
    + '<td class="cx-r"><button type="button" class="cx-more' + (aberto ? ' is-on' : '') + '" data-cx="ordmore" data-id="' + id + '" title="' + cEsc(odT(aberto ? 'less' : 'more')) + '" aria-label="' + cEsc(odT('more')) + '">' + (aberto ? '▴' : '▾') + '</button></td></tr>';
  if (!aberto) return linha;
  const quem = [cxUserName(o.client_user_id, [o]), cxUserMail(o.client_user_id, [o])].filter(Boolean).join(' · ');
  const kv = (k, v) => (v == null || v === '' ? '' : '<div class="cx-okv"><span>' + cEsc(k) + '</span><b>' + v + '</b></div>');
  const info = kv(odT('seller'), cEsc(quem || '—')) + kv(odT('client'), cEsc(o.client_name || '')) + kv(odT('room'), cEsc(o.room_name || '')) + kv(odT('addr'), cEsc(o.delivery_address || ''))
    + (o._folder ? kv('📁', cEsc(o._folder)) : '')
    + (cxAdmin() && cxLoteDe(o) ? kv(odT('lote'), cEsc(cxLoteDe(o))) : '');
  const val = !preco || o._proj ? '' : kv(cT('list'), cEsc(cMoney(o._l))) + kv(cT('disc'), o._d != null ? o._d + '%' : '—') + kv(cT('net'), o._n != null ? cEsc(cMoney(o._n)) : '—')
    + kv(ivT('tax'), o._ex ? cEsc(ivT('exempt')) : o._tx != null ? cEsc(cMoney(o._tx)) : '—') + kv(ivT('inv_total'), o._it != null ? cEsc(cMoney(o._it)) : '—');
  const px = cxOrdProj(o);
  return linha + '<tr class="cx-ordexp' + (dentro ? ' cx-in' : '') + '"><td colspan="20">' + (px ? '<div class="cx-oproj">' + cxProjCardHtml(px, true) + '</div>' : '') + '<div class="cx-obox">'
    + '<div class="cx-ocol"><h5>' + cEsc(odT('more')) + '</h5>' + info + '</div>'
    + (val ? '<div class="cx-ocol"><h5>' + cEsc(odT('prices')) + '</h5>' + val + '</div>' : '')
    + '<div class="cx-ocol cx-otools"><h5>' + cEsc(odT('tools')) + '</h5><div>' + (cxInvBtns(o) || '—') + '</div>'
    + '<div><button type="button" class="cx-mini" data-cx="openorder" data-id="' + id + '">' + cEsc(odT('open')) + ' →</button>'
    + (window.LegnoOrderTerms && o.status !== 'submitted' && !cxSeller() ? ' <button type="button" class="cx-mini" data-cx="termsview" data-id="' + id + '">' + cEsc(LegnoOrderTerms.label()) + '</button>' : '')
    + (cxPodeRecibo(o) ? ' <button type="button" class="cx-mini cx-mini-ok" data-cx="rcpdf" data-id="' + id + '">' + cEsc(odT('rc_btn')) + '</button>' : '')
    + (cxPodeVoltar(o) ? ' <button type="button" class="cx-mini" data-cx="backproj" data-id="' + id + '">↩ ' + cEsc(typeof I18n !== 'undefined' ? I18n.t('my_orders.back_to_project') : 'Back to project') + '</button>' : '')
    + (cxPodeExcluir(o) ? ' <button type="button" class="cx-mini cx-mini-lost" data-cx="delorder" data-id="' + id + '">' + cEsc(odT('del_btn')) + '</button>' : '') + '</div>'
    + (cxMotivoNaoExclui(o) ? '<div class="hint" style="white-space:normal;max-width:340px;margin-top:6px;text-align:left">' + cEsc(cxMotivoNaoExclui(o)) + '</div>' : '') + '</div>'
    + '</div></td></tr>';
}
function cxFlatTable(rows, principal) {
  const s = cxState.scope; const f = cxState.net;
  const st = cxState.netSort || (cxState.netSort = { col: 'upd', dir: -1 });
  const preco = !cxSeller();
  const soProj = cxSoProj();
  // ABA ORDERS ENXUTA (21/11, Matt: "prioridade status, invoice, valor final,
  // link de pagamento... um botão e abrir mais informações"): na aba Orders a
  // linha fica com Nº · Loja · Projeto/PO · Etapa · Invoice · Total · Pagamento ·
  // Data · ▾. O resto (vendedor, tabela/desconto/líquido/tax, endereço e as
  // ferramentas de link/comprovante/QuickBooks) abre embaixo no ▾.
  const enx = principal && !soProj;
  if (principal) {
    const val = { num: cxNumVal, loja: (o) => cxStoreName(o).toLowerCase(), quem: (o) => cxUserName(o.client_user_id, [o]).toLowerCase(), nome: (o) => String(o.po_name || '').toLowerCase(),
      cliente: (o) => String(o.client_name || '').toLowerCase(), l: (o) => o._l || 0, net: (o) => (o._n == null ? -1 : o._n), v: (o) => (o._v == null ? -1 : o._v), it: (o) => (o._it == null ? -1 : o._it), etapa: (o) => CX_NET_STAGES.indexOf(o._s), upd: (o) => String(o._t || '') }[st.col] || ((o) => String(o._t || ''));
    rows = rows.slice().sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * st.dir || String(b._t || '').localeCompare(String(a._t || '')); });
  }
  const comFiltro = { quem: !!f.user, etapa: !!f.etapa && f.etapa !== '_orders' && f.etapa !== 'build', upd: !!f.periodo };
  const th = (col, rot, r, menu) => !principal ? '<th' + (r ? ' class="cx-r"' : '') + '>' + cEsc(rot) + '</th>'
    : '<th class="mp-th-sort' + (st.col === col ? ' is-sorted' : '') + (r ? ' cx-r' : '') + (comFiltro[col] ? ' cx-th-on' : '') + '" data-cx="' + (menu ? 'hmenu' : 'gsort') + '" data-col="' + col + '">'
      + (comFiltro[col] ? '<i class="cx-th-dot"></i>' : '') + cEsc(rot) + ' ' + (st.col === col ? (st.dir < 0 ? '↓' : '↑') : (menu ? '▾' : '↕')) + '</th>';
  const max = principal ? 400 : 200;
  return '<div class="cx-inner"><table class="mp-table cx-table' + (principal ? ' cx-main' : '') + '"><thead><tr>'
    + (enx
      ? th('num', cT('c_no')) + th('loja', cT('c_store')) + th('quem', cT('col_seller'), 0, 1) + th('nome', cT('c_item')) + th('etapa', cT('c_stage'), 0, 1) + '<th>' + cEsc(odT('next')) + '</th>'
        + '<th>' + cEsc(ivT('inv')) + '</th>' + (preco ? th('it', ivT('inv_total'), 1) : cxSeller() ? th('v', cT('sale'), 1) : '') + '<th>' + cEsc(odT('pay_col')) + '</th>' + th('upd', cT('c_date'), 0, 1) + '<th></th></tr></thead><tbody>'
      : th('num', cT('c_no')) + th('loja', cT('c_store')) + th('quem', cT('col_seller'), 0, 1) + th('nome', cT('c_item'))
        + (preco ? cxPrecoThs(th, soProj) : cxSeller() ? th('v', cT('sale'), 1) : '')
        + th('etapa', cT('c_stage'), 0, 1) + '<th>' + cEsc(odT('next')) + '</th>' + th('upd', cT('c_date'), 0, 1) + '<th></th></tr></thead><tbody>')
    + (() => {
      // sequência da tela: linha da pasta + os itens dela (na ordem escolhida);
      // quem não tem pasta fica como sempre. Só na lista principal.
      const seq = []; const visto = new Set();
      rows.forEach((o) => {
        const k = principal ? cxFolderKey(o) : '';
        if (!k) { seq.push({ o }); return; }
        if (visto.has(k)) return;
        visto.add(k);
        const itens = rows.filter((x) => cxFolderKey(x) === k);
        seq.push({ pasta: k, itens });
        if (!cxFolderClosed().has(k)) itens.forEach((x, i) => seq.push({ o: x, dentro: true, ultimo: i === itens.length - 1 }));
      });
      return seq;
    })().slice(0, max).map((lin) => {
      if (lin.pasta) return cxFolderRowHtml(lin.pasta, lin.itens, soProj, preco, enx);
      const o = lin.o; const dentro = !!lin.dentro;
      const quem = cxUserName(o.client_user_id, [o]);
      const quemMail = cxUserMail(o.client_user_id, [o]) || quem;
      // botão DENTRO da célula de etapa (21/11: "na própria barra de status"; a última coluna some em tela estreita)
      const envia = o._proj && (cxAdmin() || (o.client_user_id === cxMe() && !cxSeller()))
        ? ' <button type="button" class="cx-sendfab" data-cx="sendfab" data-id="' + cEsc(o.id) + '">' + cEsc(sfT('btn')) + '</button>' : '';
      const acao = (!soProj && !o._proj ? cxInvBtns(o) : '') + (!cxAdmin() ? '' : (o._s === 'pay' ? '<button type="button" class="secondary" data-cx="relprod" data-id="' + cEsc(o.id) + '">' + cEsc(cT('rel_prod')) + '</button>'
        : o._s === 'prod' ? '<button type="button" class="secondary" data-cx="relpick" data-id="' + cEsc(o.id) + '">' + cEsc(cT('rel_pick')) + '</button>'
          : o._s === 'ready' ? '<button type="button" class="secondary" data-cx="reldone" data-id="' + cEsc(o.id) + '">' + cEsc(cT('rel_done')) + '</button>' : ''));
      const num = o._proj ? (cxPnum(o.project_number) || '—')
        : ((Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : '—') + (o.project_number ? ' <span class="cx-pref">' + cxPnum(o.project_number) + '</span>' : ''));
      const ehFab = !o._proj && Number(o.factory_number) > 0;
      const icoN = (typeof MP_ICO !== 'undefined') ? '<span class="cx-nico' + (ehFab ? ' cx-nico-f' : '') + '" title="' + (ehFab ? 'Factory order' : 'Project') + '">' + (ehFab ? MP_ICO.factory : MP_ICO.layers) + '</span>' : '';
      const ck = ''; // 21/11: sem caixinha de seleção — invoice de vários = botão na linha da PASTA
      if (enx) return cxOrdRowHtml(o, lin, num, icoN, preco, envia);
      return '<tr' + (dentro ? ' class="cx-in' + (lin.ultimo ? ' cx-in-last' : '') + '"' : '') + ' data-cx="openorder" data-id="' + cEsc(o.id) + '">' + ck + '<td class="cx-num' + (o._proj ? ' cx-num-p' : '') + '"><span class="cx-nwrap">' + icoN + '<span>' + num + '</span></span></td>'
        + '<td class="cx-store' + (cxAdmin() ? ' cx-storecell" data-cx="pickstore" data-id="' + cEsc(o.id) : '') + '" title="' + cEsc(cxStoreName(o) + (cxAdmin() ? ' — ' + cT('mv_change') : '')) + '"><b>' + cEsc(cxStoreName(o)) + '</b>' + (cxAdmin() ? ' <span class="cx-swap">⇄</span>' : '') + '</td>'
        + '<td class="cx-quem" title="' + cEsc(quemMail || '') + '">' + cEsc(String(quem || '—').split('@')[0]) + '</td>'
        + '<td class="cx-item" title="' + cEsc([o.po_name, o.client_name, o.room_name, o.delivery_address].filter(Boolean).join(' · ')) + '">' + (o._folder && !dentro ? '<span class="cx-fold" data-cx="folderq" data-v="' + cEsc(o._folder) + '" title="' + cEsc(ivT('folder_tip')) + '">📁 ' + cEsc(o._folder) + '</span> ' : '') + cEsc(o.po_name || '—') + (o._proj ? ' <span class="cx-tagp">' + cEsc(cT('tag_proj')) + '</span>' : '') + (o.client_name && o.client_name !== o._folder ? ' <span class="hint">· ' + cEsc(o.client_name) + '</span>' : '') + '</td>'
        + (!preco ? (cxSeller() ? '<td class="cx-r"><b>' + (o._v != null ? cEsc(cMoney(o._v)) : '—') + '</b></td>' : '') : soProj
          ? '<td class="cx-r">' + (o._n != null ? (o._d ? '<small class="cx-est" title="' + cEsc(cT('list') + ' ' + cMoney(o._l)) + '">−' + o._d + '%</small> ' : '') + cEsc(cMoney(o._n)) : '—') + '</td><td class="cx-r"><b>' + (o._v != null ? cEsc(cMoney(o._v)) : '—') + '</b></td>'
          : '<td class="cx-r">' + (o._proj ? (o._l ? '<span class="cx-est" title="' + cEsc(cT('est_tip')) + '">' + cEsc(cMoney(o._l)) + ' <small>' + cEsc(cT('est')) + '</small></span>' : '—') : cEsc(cMoney(o._l))) + '</td>'
          + '<td class="cx-r">' + (o._d != null && !o._proj ? o._d + '%' : '—') + '</td><td class="cx-r">' + (o._n != null && !o._proj ? cEsc(cMoney(o._n)) : '—') + '</td>'
          + '<td class="cx-r">' + (o._proj ? '—' : o._ex ? '<small class="cx-est">' + cEsc(ivT('exempt')) + '</small>' : o._tx != null ? cEsc(cMoney(o._tx)) : '—') + '</td>'
          + '<td class="cx-r"><b>' + (o._proj || o._it == null ? '—' : cEsc(cMoney(o._it))) + '</b>' + (o.invoice_number ? ' <small class="cx-est">' + cEsc(o.invoice_number) + '</small>' : '') + '</td>')
        + '<td class="cx-stcell">' + (o._proj ? '<span class="mp-chip st-dev">' + cEsc(cT('s_' + o._s)) + '</span>' : cxStatusHtml(o)) + '</td><td class="cx-next">' + envia + '</td><td>' + cxQuando(o._t) + '</td><td class="cx-r">' + acao
          // ▾ no fim da linha do PROJETO (22/11, Matt: "uma seta lá no final da linha pra baixo... assim como
          // no orders, aí a pessoa intuitivamente vai sempre buscar mais lá"). Sem data-cx próprio: o clique
          // sobe pra linha (openorder), que já abre/fecha o cartão do projeto.
          + (o._proj ? '<button type="button" class="cx-more' + (cxProjOpen().has(o._pid) ? ' is-on' : '') + '" title="' + cEsc(odT(cxProjOpen().has(o._pid) ? 'less' : 'more')) + '" aria-label="' + cEsc(odT('more')) + '">' + (cxProjOpen().has(o._pid) ? '▴' : '▾') + '</button>' : '')
          + '</td></tr>'
        + (o._proj && cxProjOpen().has(o._pid) ? '<tr class="cx-projexp"><td colspan="20"><div class="mp-exp-box" data-proj="' + cEsc(o._pid) + '">'
          + cxProjCardHtml(o) + '</div>'
          + (window.LegnoMinhaEmpresa && (cxAdmin() || o.client_user_id === cxMe()) ? '<div class="cx-plost"><button type="button" class="cx-mini cx-mini-lost" data-cx="lost" data-ids="' + cEsc(o._pid) + '" data-nome="' + cEsc(o._pname || o.po_name || '') + '">' + cEsc(odT('lost_btn')) + '</button>'
            + (o._old ? ' <span class="hint">' + cEsc(odT('old_hint').replace('{n}', CX_INATIVO_DIAS)) + '</span>' : '') + '</div>' : '')
          + '</td></tr>' : '');
    }).join('') + (rows.length ? '' : '<tr class="cx-vazio"><td colspan="20">' + cEsc(cT('net_none')) + '</td></tr>') + '</tbody>' + (!preco && cxSeller() && rows.length ? '<tfoot><tr class="cx-tot"><td colspan="' + (enx ? 7 : 4) + '">' + cEsc(cT('sum', { n: rows.length })) + '</td>' + '<td class="cx-r">' + cEsc(cMoney(rows.reduce((t, o) => t + (Number(o._v) || 0), 0))) + '</td>' + '<td colspan="' + (enx ? 3 : 4) + '"></td></tr></tfoot>' : '') + (preco && rows.length ? (enx ? '<tfoot><tr class="cx-tot"><td colspan="7">' + cEsc(cT('sum', { n: rows.length })) + '</td><td class="cx-r">' + cEsc(cMoney(rows.reduce((t, o) => t + (Number(o._it) || 0), 0))) + '</td><td colspan="3"></td></tr></tfoot>' : cxTotalRow(rows, 4, 4, soProj)) : '') + '</table></div>' + (rows.length > max ? '<p class="hint">+' + (rows.length - max) + '…</p>' : '');
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
    g.loja = cxStoreName(a); g.quem = cxUserName(a.client_user_id, g.itens);
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
  if (!rows.length && (s.err || !(s.orders || []).length)) return '<p class="hint">' + cEsc(s.err || cT('net_none')) + '</p>';
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
    + (grupos.length ? '' : '<tr class="cx-vazio"><td colspan="20">' + cEsc(cT('net_none')) + '</td></tr>') + '</tbody>' + (preco && grupos.length ? cxTotalRow(grupos.reduce((a, g) => a.concat(g.itens), []), 7, 1, soProj) : '') + '</table></div>' + (grupos.length > max ? '<p class="hint">+' + (grupos.length - max) + '…</p>' : '');
}
// ABA PERDIDOS em tabela própria (23/11): Nº · Loja · Usuário · Projeto ·
// Cliente · MOTIVO · Perdido em · valores · ▾. Todos os perdidos que eu
// enxergo (não só os do meu login). O ▾ abre o cartão do projeto, a
// observação e o Reabrir. Quem não tem a rede (dealer hoje) segue na lista antiga.
function cxLostNaRede() { return cxHasNetwork() && (cxNetSel() || cxAdmin()); }
function cxLostOpen() { return cxState.lostOpen || (cxState.lostOpen = new Set()); }
const LT_TXT = {
  pt: { reason: 'Motivo', when: 'Perdido em', none: 'Nenhum projeto perdido.', note: 'Observação', sem: 'sem motivo', total: '{n} projeto(s) perdido(s)' },
  en: { reason: 'Reason', when: 'Lost on', none: 'No lost projects.', note: 'Note', sem: 'no reason', total: '{n} lost project(s)' },
  es: { reason: 'Motivo', when: 'Perdido el', none: 'Ningún proyecto perdido.', note: 'Observación', sem: 'sin motivo', total: '{n} proyecto(s) perdido(s)' }
};
function ltT(k) { const L = LT_TXT[String(cxLang()).slice(0, 2)] || LT_TXT.en; return L[k] != null ? L[k] : LT_TXT.en[k]; }
function cxLostMotivo(o) {
  const r = o._lost && o._lost.reason;
  if (!r) return ltT('sem');
  try { if (window.LegnoMinhaEmpresa && window.LegnoMinhaEmpresa.motivo) return window.LegnoMinhaEmpresa.motivo(r) || r; } catch (e) { /* cai no texto cru */ }
  return r;
}
function cxRenderLost(p) {
  const s = cxState.scope;
  if (!s) { p.innerHTML = '<p class="hint">' + cEsc(cT('loading')) + '</p>'; return; }
  const q = String((typeof mpState !== 'undefined' && mpState.q) || '').trim().toLowerCase();
  const rows = (s.lostRows || []).filter((o) => !q || [o._pname, o.client_name, o._folder, cxStoreName(o), cxUserName(o.client_user_id, [o]), cxLostMotivo(o), o._lost.note, cxPnum(o.project_number)].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => String(b._lost.at || '').localeCompare(String(a._lost.at || '')));
  if (!rows.length) { p.innerHTML = '<p class="mp-empty">' + cEsc(ltT('none')) + '</p>'; return; }
  const vend = cxSeller();
  const nCols = vend ? 9 : 11;
  const th = (t, r) => '<th' + (r ? ' class="cx-r"' : '') + '>' + cEsc(t) + '</th>';
  const soma = (k) => rows.reduce((t, o) => t + (Number(o[k]) || 0), 0);
  const ab = cxLostOpen();
  let h = '<div class="mp-table-wrap cx-wrap"><table class="mp-table cx-table cx-main cx-losttab"><thead><tr>'
    + th(cT('c_no')) + th(cT('c_store')) + th(cT('col_seller')) + th(cT('c_item')) + th(odT('client')) + th(ltT('reason')) + th(ltT('when'))
    + (vend ? th(cT('sale'), 1) : th(cT('list'), 1) + th(cT('fab_net'), 1) + th(cT('sale'), 1)) + '<th></th></tr></thead><tbody>';
  rows.forEach((o) => {
    const aberto = ab.has(o.id);
    const quem = cxUserName(o.client_user_id, [o]);
    const pode = window.LegnoMinhaEmpresa && (cxAdmin() || o.client_user_id === cxMe());
    h += '<tr class="mp-row cx-lrow' + (aberto ? ' is-open' : '') + '" data-cx="lostrow" data-id="' + cEsc(o.id) + '">'
      + '<td class="cx-num">' + cEsc(cxPnum(o.project_number) || '—') + '</td>'
      + '<td class="cx-loja2"><b>' + cEsc(cxStoreName(o)) + '</b></td>'
      + '<td class="cx-quem" title="' + cEsc(cxUserMail(o.client_user_id, [o]) || quem || '') + '">' + cEsc(String(quem || '—').split('@')[0]) + '</td>'
      + '<td class="cx-item">' + (o._folder ? '<span class="cx-fold">📁 ' + cEsc(o._folder) + '</span> ' : '') + '<b>' + cEsc(o._pname || '') + '</b></td>'
      + '<td>' + (o.client_name ? cEsc(o.client_name) : '—') + '</td>'
      + '<td' + (o._lost.note ? ' title="' + cEsc(o._lost.note) + '"' : '') + '><span class="cx-lmot">' + cEsc(cxLostMotivo(o)) + '</span></td>'
      + '<td>' + cEsc(cDate(o._lost.at)) + '</td>'
      + (vend ? '<td class="cx-r"><b>' + (o._v != null ? cEsc(cMoney(o._v)) : '—') + '</b></td>'
        : '<td class="cx-r">' + (o._l ? cEsc(cMoney(o._l)) : '—') + '</td>'
          + '<td class="cx-r">' + (o._n != null ? (o._d != null ? '<small class="cx-est">−' + o._d + '%</small> ' : '') + cEsc(cMoney(o._n)) : '—') + '</td>'
          + '<td class="cx-r"><b>' + (o._v != null ? cEsc(cMoney(o._v)) : '—') + '</b></td>')
      + '<td class="cx-r"><button type="button" class="cx-more' + (aberto ? ' is-on' : '') + '" title="' + cEsc(odT(aberto ? 'less' : 'more')) + '" aria-label="' + cEsc(odT('more')) + '">' + (aberto ? '▴' : '▾') + '</button></td></tr>';
    if (aberto) {
      h += '<tr class="mp-exp cx-lexp"><td colspan="' + nCols + '"><div class="cx-oproj">' + cxProjCardHtml(o) + '</div>'
        + '<div class="cx-lostbar">' + (o._lost.note ? '<span class="hint">' + cEsc(ltT('note')) + ': “' + cEsc(o._lost.note) + '”</span>' : '')
        + (pode ? '<button type="button" class="secondary" data-cx="reopen" data-ids="' + cEsc(o._pid) + '" data-nome="' + cEsc(o._pname || '') + '">' + cEsc(cT('lost_reopen')) + '</button>' : '') + '</div></td></tr>';
    }
  });
  h += '</tbody><tfoot><tr class="cx-tot"><td colspan="7">' + cEsc(ltT('total').replace('{n}', rows.length)) + '</td>'
    + (vend ? '<td class="cx-r">' + cEsc(cMoney(soma('_v'))) + '</td>' : '<td class="cx-r">' + cEsc(cMoney(soma('_l'))) + '</td><td class="cx-r">' + cEsc(cMoney(soma('_n'))) + '</td><td class="cx-r">' + cEsc(cMoney(soma('_v'))) + '</td>')
    + '<td></td></tr></tfoot></table></div>';
  p.innerHTML = h;
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
    + (!rows.length && (s.err || !(s.orders || []).length) ? '<p class="hint">' + cEsc(s.err || cT('net_none')) + '</p>'
      : (cxState.netLayout === 'pastas' && f.etapa !== '_orders' ? cxGroupTable(rows) : '<div class="mp-table-wrap cx-wrap">' + cxFlatTable(rows, true) + '</div>'))
    + cxSelBar()
    + '<div class="cx-foot"><span class="hint">' + cEsc(cT('totals', { n: rows.length, l: cMoney(totL), v: cMoney(totN) })) + '</span>'
    + (filtrando ? '<button type="button" class="cx-link" data-cx="fclear">' + cEsc(cT('fl_clear')) + '</button>' : '')
    + (f.etapa === '_orders' ? '' : '<button type="button" class="cx-link" data-cx="layout">' + cEsc(cT(cxState.netLayout === 'pastas' ? 'lay_lista' : 'lay_pastas')) + '</button>')
    + (cxAdmin() ? '' : '<button type="button" class="cx-link" data-cx="folders">' + cEsc(cT('back_folders')) + '</button>')
    + (s.old && s.old.length ? '<button type="button" class="cx-link" data-cx="inativos">' + cEsc(odT(cxState.verInativos ? 'old_back' : 'old_link').replace('{n}', s.old.length)) + '</button>' : '')
    + cxQbFoot()
    + (cxExcluiveis().length ? '<button type="button" class="cx-link cx-link-del" data-cx="delall">' + cEsc(odT('del_all').replace('{n}', cxExcluiveis().length)) + '</button>' : '')
    + (cxAdmin() && rows.length ? '<select id="cx-move-all" class="cx-moveall">' + cxStoreOptions(null, cT('mv_all', { n: rows.length })) + '</select>' : '') + '</div>';
  if (cxState.projOpen && cxState.projOpen.size && typeof mpAttachCards === 'function') setTimeout(mpAttachCards, 0);
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
    h += op('user', '', cT('fl_all'), !f.user) + uids.map((u) => op('user', u, cxUserName(u, cxState.scope.orders) + ' (' + por[u] + ')', f.user === u)).join('');
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
  // TERMOS E CONDIÇÕES (22/11, migration 332): aceite registrado ANTES de aprovar
  if (window.LegnoOrderTerms) {
    if (cxSeller()) { cxState.msg[id] = { err: true, t: ((window.LegnoOrderTerms && LegnoOrderTerms.onlyDealerMsg && LegnoOrderTerms.onlyDealerMsg()) || 'Only the dealer can send the order to production.') }; return mpRender(); }
    const ac = await LegnoOrderTerms.ask({ ref: po, owner: o.client_user_id || null });
    if (!ac) return;
    try { await LegnoOrderTerms.record([id], ac); } catch (e) { cxState.msg[id] = { err: true, t: (e && e.message) || String(e) }; return mpRender(); }
  }
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
  const perdeCedo = false; // 22/11: o desconto de pagamento total não cai mais ao liberar a produção
  // plano 50/50: a entrada deveria estar paga antes da produção (só avisa, quem decide é a fábrica)
  if (qual === 'prod' && o.pay_plan === 'split' && !o.pay_deposit_at && !o.paid_at && !o.qbo_paid_at && !confirm(pyT('rel_dep_q'))) return;
  if (perdeCedo && !confirm(pyT('rel_warn', { p: cxPayTerms().e }))) return;
  if (!confirm(cT(qual === 'prod' ? 'rel_prod_q' : qual === 'done' ? 'rel_done_q' : 'rel_pick_q', { n }))) return;
  const agora = new Date().toISOString();
  // 'done' (22/11, Matt: "como faço pra mudar status do pedido de pronto pra coleta para entregue"):
  // o botão "Marcar como entregue" da tela do pedido só aparecia com status 'paid', que não é mais
  // usado — então não havia caminho. Agora a fábrica marca aqui: status 'delivered' + delivered_at.
  const patch = qual === 'prod' ? { finance_released_at: agora, finance_released_by: cxMe() }
    : qual === 'done' ? { status: 'delivered', delivered_at: agora }
      : { pickup_released_at: agora, pickup_released_by: cxMe() };
  const { data, error } = await supabaseClient.from('orders').update(patch).eq('id', id).select('id');
  if (error || !data || !data.length) { alert((error && error.message) || 'RLS'); return; }
  Object.assign(o, patch); o._s = cxStage(o);
  // produção liberada sem pagamento: refaz a conta sem o desconto de antecipado (a RPC olha finance_released_at)
  if (perdeCedo) { try { const r = await supabaseClient.rpc('order_choose_payment', { p_orders: [id], p_method: o.pay_method }); /* 2 parâmetros = plano total; só quem está no total tem pay_early */ if (!r.error) (r.data || []).forEach((row) => { if (row.id === id) { Object.assign(o, row); cxCalcTax(o, cxState.scope); } }); } catch (e2) { console.warn('[pagamento] recalcular sem antecipado', e2); } }
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
  pt: { open: 'Abrir no editor', btn: 'ENVIAR FÁBRICA', title: 'Enviar pra fábrica', proj: 'Projeto', val: 'Valor de fábrica', po: 'PO (vai na etiqueta) *', room: 'Ambiente', addr: 'Endereço da obra *',
    t1: 'Ao enviar, este projeto fica CONGELADO: módulos, cores, peças, medidas e posições não podem mais ser alterados. É exatamente isto que vai ser produzido.',
    t2: 'Depois de enviado, NÃO é possível pedir alteração do pedido. Pra mudar alguma coisa, duplique o projeto e envie um pedido novo.',
    t3: 'Medidas, conferência no local, desenho e compatibilidade com o ambiente (eletrodomésticos, bancada, hidráulica, elétrica, instalação) são de responsabilidade de quem envia o pedido.',
    t4: 'O pedido cobre só os gabinetes de fábrica: não inclui eletrodomésticos, pedra/bancada nem obra.',
    ok: 'Li e aceito. Conferi o projeto e assumo a responsabilidade por ele.', next: 'No próximo passo você lê e aceita os Termos e Condições do Pedido.', room_other: 'Outro…', send: 'ENVIAR PRA FÁBRICA', send_next: 'CONTINUAR →', cancel: 'Cancelar', need: 'Preencha o PO e o endereço da obra e marque o aceite.',
    s_open: 'Abrindo o projeto…', s_send: 'Criando o pedido…', s_rel: 'Liberando pra fábrica…', done: 'Pedido {n} enviado pra fábrica.', unsaved: 'O projeto aberto no editor tem alterações não salvas, que serão perdidas. Continuar?', skipped: '{n} módulo(s) do projeto não carregaram. Abra o projeto, confira e salve antes de enviar.' },
  en: { open: 'Open in editor', btn: 'SEND TO FACTORY', title: 'Send to factory', proj: 'Project', val: 'Factory value', po: 'PO (goes on the label) *', room: 'Room', addr: 'Job site address *',
    t1: 'Once sent, this project is LOCKED: modules, colors, parts, sizes and positions can no longer be changed. This is exactly what will be produced.',
    t2: 'After sending, changes to the order CANNOT be requested. To change anything, duplicate the project and send a new order.',
    t3: 'Measurements, site verification, design and fit with the space (appliances, countertop, plumbing, electrical, installation) are the responsibility of whoever sends the order.',
    t4: 'The order covers factory cabinets only: no appliances, stone/countertop or construction work.',
    ok: 'I have read and accept. I checked the project and take responsibility for it.', next: 'On the next step you read and accept the Order Terms and Conditions.', room_other: 'Other…', send: 'SEND TO FACTORY', send_next: 'CONTINUE →', cancel: 'Cancel', need: 'Fill in the PO and job site address and check the acceptance box.',
    s_open: 'Opening the project…', s_send: 'Creating the order…', s_rel: 'Releasing to the factory…', done: 'Order {n} sent to the factory.', unsaved: 'The project open in the editor has unsaved changes that will be lost. Continue?', skipped: '{n} module(s) of the project did not load. Open the project, check it and save before sending.' },
  es: { open: 'Abrir en el editor', btn: 'ENVIAR FÁBRICA', title: 'Enviar a fábrica', proj: 'Proyecto', val: 'Valor de fábrica', po: 'PO (va en la etiqueta) *', room: 'Ambiente', addr: 'Dirección de la obra *',
    t1: 'Al enviar, este proyecto queda CONGELADO: módulos, colores, piezas, medidas y posiciones ya no se pueden cambiar. Es exactamente lo que se va a producir.',
    t2: 'Después de enviado, NO se pueden pedir cambios al pedido. Para cambiar algo, duplique el proyecto y envíe un pedido nuevo.',
    t3: 'Medidas, verificación en obra, diseño y compatibilidad con el ambiente (electrodomésticos, encimera, plomería, electricidad, instalación) son responsabilidad de quien envía el pedido.',
    t4: 'El pedido cubre solo los gabinetes de fábrica: no incluye electrodomésticos, piedra/encimera ni obra.',
    ok: 'Leí y acepto. Revisé el proyecto y asumo la responsabilidad.', next: 'En el siguiente paso usted lee y acepta los Términos y Condiciones del Pedido.', room_other: 'Otro…', send: 'ENVIAR A FÁBRICA', send_next: 'CONTINUAR →', cancel: 'Cancelar', need: 'Complete el PO y la dirección de la obra y marque la aceptación.',
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
    // AMBIENTE em lista (22/11, Matt: "coloca um dropdown com todos rooms possíveis, já tínhamos essa
    // informação em algum lugar") — a mesma lista de ambientes da leitura por IA (função
    // generate-project-from-photo: kitchen, bathroom, closet, bedroom, living, laundry, office, pantry,
    // garage, bar, other). Grava o nome em inglês em orders.room_name; "Other" abre o campo livre.
    + '<label>' + cEsc(sfT('room')) + '<select id="cx-sf-room-sel">' + cxRoomOptions(o._pname || '') + '</select>'
    + '<input id="cx-sf-room" maxlength="60" style="display:none;margin-top:6px" placeholder="' + cEsc(sfT('room_other')) + '"></label>'
    + '<label>' + cEsc(sfT('addr')) + '<input id="cx-sf-addr" maxlength="200" value="' + cEsc(o.delivery_address || '') + '"></label>'
    + '<div class="cx-sf-terms"><p>🔒 ' + cEsc(sfT('t1')) + '</p><p>⛔ ' + cEsc(sfT('t2')) + '</p><p>📐 ' + cEsc(sfT('t3')) + '</p><p>🧾 ' + cEsc(sfT('t4')) + '</p></div>'
    // 22/11: com os Termos e Condições completos (order-terms.js) o aceite de verdade é na PRÓXIMA janela
    // (texto inteiro + nome digitado). Aqui a caixinha some — ficava "um quadradinho no meio do nada" e
    // pedia o aceite duas vezes. Sem o order-terms.js carregado, a caixinha continua valendo.
    + (window.LegnoOrderTerms ? '<p class="cx-sf-next">' + cEsc(sfT('next')) + '</p>'
      : '<label class="cx-sf-ok"><input type="checkbox" id="cx-sf-chk"> <span>' + cEsc(sfT('ok')) + '</span></label>')
    + '<p class="cx-sf-msg" id="cx-sf-msg"></p>'
    + '<div class="cx-sf-acts"><button type="button" class="secondary" id="cx-sf-cancel">' + cEsc(sfT('cancel')) + '</button>'
    + '<button type="button" class="cx-sendfab" id="cx-sf-go" disabled>' + cEsc(sfT(window.LegnoOrderTerms ? 'send_next' : 'send')) + '</button></div></div>';
  document.body.appendChild(w);
  const $ = (q) => w.querySelector(q);
  const chkOk = () => { const c = $('#cx-sf-chk'); return !c || c.checked; };
  const pronto = () => { $('#cx-sf-go').disabled = !(chkOk() && $('#cx-sf-po').value.trim() && $('#cx-sf-addr').value.trim()); };
  ['#cx-sf-chk', '#cx-sf-po', '#cx-sf-addr'].forEach((q) => { const el = $(q); if (!el) return; el.addEventListener('input', pronto); el.addEventListener('change', pronto); });
  pronto();
  const fecha = () => { if (!w.dataset.busy) w.remove(); };
  $('#cx-sf-cancel').addEventListener('click', fecha);
  w.addEventListener('click', (e) => { if (e.target === w) fecha(); });
  const salaSel = $('#cx-sf-room-sel');
  const salaTroca = () => { const outro = salaSel.value === '_other'; $('#cx-sf-room').style.display = outro ? '' : 'none'; if (outro) $('#cx-sf-room').focus(); };
  salaSel.addEventListener('change', salaTroca); if (salaSel.value === '_other') $('#cx-sf-room').style.display = '';
  const sala = () => (salaSel.value === '_other' ? $('#cx-sf-room').value.trim() : salaSel.value);
  $('#cx-sf-go').addEventListener('click', () => cxSendFactoryRun(o, w, { po: $('#cx-sf-po').value.trim(), room: sala(), addr: $('#cx-sf-addr').value.trim() }));
  setTimeout(() => $('#cx-sf-po').focus(), 30);
}
// lista de ambientes (valor gravado = nome em inglês; rótulo = idioma da tela). `palpite` = nome do
// projeto: se bater com alguma palavra-chave, a opção já vem escolhida.
const CX_ROOMS = [
  ['Kitchen', 'Cozinha', 'Cocina', /kitchen|cozinha|cocina/i], ['Bathroom', 'Banheiro', 'Baño', /bath|banheiro|ba[nñ]o|vanit|lavabo/i],
  ['Closet', 'Closet', 'Clóset', /closet|wardrobe|guarda/i], ['Bedroom', 'Quarto', 'Dormitorio', /bed|quarto|dormitor|cuarto|suite|su[ií]te/i],
  ['Living room', 'Sala', 'Sala', /living|sala|family|tv/i], ['Laundry', 'Lavanderia', 'Lavandería', /laundry|lavand/i],
  ['Office', 'Escritório', 'Oficina', /office|escrit|oficina/i], ['Pantry', 'Despensa', 'Despensa', /pantry|despensa/i],
  ['Garage', 'Garagem', 'Garaje', /garage|garagem|garaje/i], ['Bar', 'Bar', 'Bar', /\bbar\b/i]
];
function cxRoomOptions(palpite) {
  const i = { pt: 1, es: 2 }[cxLang()] || 0;
  const achou = CX_ROOMS.find((r) => r[3].test(String(palpite || '')));
  return '<option value="">—</option>' + CX_ROOMS.map((r) => '<option value="' + cEsc(r[0]) + '"' + (achou === r ? ' selected' : '') + '>' + cEsc(r[i]) + '</option>').join('')
    + '<option value="_other">' + cEsc(sfT('room_other')) + '</option>';
}
async function cxSendFactoryRun(o, w, f) {
  const msg = w.querySelector('#cx-sf-msg');
  const setMsg = (t, err) => { msg.textContent = t; msg.classList.toggle('err', !!err); };
  const chk = w.querySelector('#cx-sf-chk');
  if (!f.po || !f.addr || (chk && !chk.checked)) return setMsg(sfT('need'), true);
  if (typeof projectDirty !== 'undefined' && projectDirty && typeof projectSlots !== 'undefined' && projectSlots.length && !confirm(sfT('unsaved'))) return;
  // TERMOS E CONDIÇÕES completos (22/11, migration 332): o resumo desta janela continua,
  // mas o que vale é o texto inteiro, aceito com o nome digitado. O registro é gravado
  // logo depois que o pedido existe, ANTES de aprovar.
  let termos = null;
  if (window.LegnoOrderTerms) { termos = await LegnoOrderTerms.ask({ ref: f.po, owner: (o && o.client_user_id) || null }); if (!termos) return; }
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
    const aceite = { terms_accepted_at: agora, terms_accepted_by: cxMe(), terms_version: (window.LegnoOrderTerms && LegnoOrderTerms.version) || SF_TERMS_VERSION };
    if (o.client_user_id && o.client_user_id !== cxMe()) {
      // ADMIN enviando projeto de outra conta: o pedido é do DONO do projeto (e da loja dele)
      const sc = cxState.scope || {};
      const tm = (sc.team || {})[o.client_user_id] || {}; const em = (sc.emails || {})[o.client_user_id] || {};
      upd.client_user_id = o.client_user_id;
      if (tm.email || em.email) upd.client_email = tm.email || em.email;
      if (o.account_id) upd.account_id = o.account_id;
      // passa o pedido pro dono ANTES do aceite, pra o registro sair como "aceite da fábrica em nome do cliente"
      if (termos) {
        const dono = { client_user_id: upd.client_user_id, po_name: f.po };
        if (upd.client_email) dono.client_email = upd.client_email; if (upd.account_id) dono.account_id = upd.account_id;
        const r0 = await supabaseClient.from('orders').update(dono).eq('id', orderId).eq('status', 'submitted').select('id');
        if (r0.error) throw r0.error;
      }
    }
    // registro completo do aceite (migration 332) — antes de aprovar; se falhar, o pedido fica pendente
    if (termos) await LegnoOrderTerms.record([orderId], termos);
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


// ---------- INVOICE, LINK DE PAGAMENTO e COMPROVANTE (aba Orders, 21/11) ----------
// Matt: "na tela orders eu quero um botão gerar invoice, link de pagamento,
// enviar comprovante" + "a invoice pode ser gerada com pedidos agrupados".
// Suposições (ele não respondeu): invoice sai pelo PRÓPRIO portal (página
// pronta pra imprimir/salvar PDF; se a fábrica subiu o PDF do QuickBooks no
// ERP, o botão abre esse); link de pagamento é COLADO pela fábrica (admin) no
// pedido; comprovante fica no pedido e a fábrica confere e libera produção.
const IV_TXT = {
  pt: { folder_tip: 'Todos os {n} pedido(s) desta pasta numa invoice só', tax: 'Tax', inv_total: 'Total invoice', exempt: 'isento', set_rate: 'Clique pra definir a alíquota de sales tax da fábrica', rate_q: 'Alíquota de sales tax da fábrica (%). Vazio = sem tax:', inv: 'Invoice', pay: 'Pagar', link: '+ Link', link_q: 'Link de pagamento deste pedido (vazio = tirar):', rcpt: 'Comprov.', rcpt_ok: '✓ Comprov.', rcpt_sent: 'Comprovante enviado. A fábrica vai conferir e liberar.', sel: '{n} pedido(s) selecionado(s) · total {v}', group: 'Gerar invoice agrupada', clear: 'Limpar seleção', folder_tip: 'Mostrar só os pedidos desta pasta', title: 'INVOICE', bill: 'Faturar para', date: 'Data', po: 'PO', order: 'Pedido', item: 'Item', qty: 'Qtd', amount: 'Valor', sub: 'Subtotal (tabela)', disc: 'Desconto', net: 'Líquido', taxl: 'Sales tax', total: 'TOTAL', pay_online: 'Pagar online', print: 'Imprimir / salvar PDF', need316: 'Rode a migration 316 no Supabase pra usar invoice, link e comprovante.', terms: 'Somente gabinetes de fábrica. Não inclui eletrodomésticos, pedra/bancada nem instalação.' },
  en: { folder_tip: 'All {n} order(s) in this folder on a single invoice', tax: 'Tax', inv_total: 'Invoice total', exempt: 'exempt', set_rate: "Click to set the factory's sales tax rate", rate_q: 'Factory sales tax rate (%). Empty = no tax:', inv: 'Invoice', pay: 'Pay', link: '+ Link', link_q: 'Payment link for this order (empty = remove):', rcpt: 'Receipt', rcpt_ok: '✓ Receipt', rcpt_sent: 'Receipt sent. The factory will check it and release the order.', sel: '{n} order(s) selected · total {v}', group: 'Create grouped invoice', clear: 'Clear selection', folder_tip: 'Show only orders in this folder', title: 'INVOICE', bill: 'Bill to', date: 'Date', po: 'PO', order: 'Order', item: 'Item', qty: 'Qty', amount: 'Amount', sub: 'Subtotal (list)', disc: 'Discount', net: 'Net', taxl: 'Sales tax', total: 'TOTAL', pay_online: 'Pay online', print: 'Print / save PDF', need316: 'Run migration 316 in Supabase to use invoice, link and receipt.', terms: 'Factory cabinets only. Appliances, stone/countertop and installation not included.' },
  es: { folder_tip: 'Los {n} pedido(s) de esta carpeta en una sola factura', tax: 'Tax', inv_total: 'Total factura', exempt: 'exento', set_rate: 'Clic para definir la tasa de sales tax de la fábrica', rate_q: 'Tasa de sales tax de la fábrica (%). Vacío = sin tax:', inv: 'Factura', pay: 'Pagar', link: '+ Link', link_q: 'Link de pago de este pedido (vacío = quitar):', rcpt: 'Comprob.', rcpt_ok: '✓ Comprob.', rcpt_sent: 'Comprobante enviado. La fábrica lo revisará y liberará.', sel: '{n} pedido(s) seleccionado(s) · total {v}', group: 'Generar factura agrupada', clear: 'Limpiar selección', folder_tip: 'Mostrar solo los pedidos de esta carpeta', title: 'INVOICE', bill: 'Facturar a', date: 'Fecha', po: 'PO', order: 'Pedido', item: 'Ítem', qty: 'Cant', amount: 'Valor', sub: 'Subtotal (lista)', disc: 'Descuento', net: 'Neto', taxl: 'Sales tax', total: 'TOTAL', pay_online: 'Pagar en línea', print: 'Imprimir / guardar PDF', need316: 'Ejecute la migration 316 en Supabase para usar factura, link y comprobante.', terms: 'Solo gabinetes de fábrica. No incluye electrodomésticos, piedra/encimera ni instalación.' }
};
function ivT(k, v) { const L = IV_TXT[cxLang()] || IV_TXT.en; let t = L[k] != null ? L[k] : (IV_TXT.en[k] || k); Object.keys(v || {}).forEach((x) => { t = t.split('{' + x + '}').join(v[x]); }); return t; }
function cxInvBtns(o) {
  const s = cxState.scope || {};
  if (!s.invOk || o.status === 'submitted') return '';
  const b = (cx, rot, extra) => '<button type="button" class="cx-mini' + (extra || '') + '" data-cx="' + cx + '" data-id="' + cEsc(o.id) + '">' + cEsc(rot) + '</button>';
  return '<span class="cx-ivb">' + b('inv', ivT('inv'))
    + (cxPodePagar(o) && !o.paid_at ? b('payopen', pyT('btn'), ' cx-mini-pay') : o.payment_link ? b('paylink', ivT('pay'), ' cx-mini-pay') : '') + (cxAdmin() ? b('setlink', o.payment_link ? '✎ Link' : ivT('link')) : '')
    + (o.receipt_path ? b('rcptview', ivT('rcpt_ok'), ' cx-mini-ok') : '') + (!o.paid_at && !cxSeller() ? b('rcpt', o.receipt_path ? '↻' : ivT('rcpt')) : '')
    // QuickBooks: admin cria a invoice lá e o link volta pro botão Pagar; pago = selo
    + (cxAdmin() && s.qbo && s.qbo.connected ? b('qbinv', o.qbo_invoice_id ? 'QB ✓' : 'QB', o.qbo_invoice_id ? ' cx-mini-ok' : '') : '')
    + (o.qbo_paid_at ? '<span class="cx-paid" title="QuickBooks">' + cEsc(qbT('paid')) + '</span>'
      : (o.qbo_invoice_id && o.qbo_balance != null && o._it != null && Number(o.qbo_balance) > 0 && Number(o.qbo_balance) < Number(o._it) - 0.005
        ? '<span class="cx-paid cx-paid-p" title="QuickBooks">' + cEsc(qbT('partial', { v: cMoney(o.qbo_balance) })) + '</span>' : ''))
    + '</span> ';
}
// ---------- QUICKBOOKS ONLINE (21/11, migration 318 + funções qbo-*) ----------
// Matt: "vamos fazer 1 e 2 então" — 1) invoice e link de pagamento do
// QuickBooks saindo daqui; 2) baixa automática quando o QuickBooks avisa que
// foi pago. Só admin aciona. Rodapé da aba Orders: "Connect QuickBooks" /
// situação; botão QB na linha (ou na barra de selecionados = invoice agrupada).
const QB_TXT = {
  pt: { connect: 'Conectar QuickBooks', conn_ok: 'QuickBooks: {c} ({e}) ✓', sync: '↻ Pagamentos do QuickBooks', group: 'Invoice no QuickBooks', paid: 'Pago ✓', partial: 'falta {v}',
    disc_q: 'O portal está conectado ao QuickBooks "{c}" ({e}).\n\nDesconectar? As invoices já criadas ficam lá; o portal só para de criar novas e de receber a baixa.', inv_q: 'Criar a invoice no QuickBooks para {n} pedido(s) de "{loja}", total {v}?\n\nO link de pagamento volta pro botão Pagar.', busy: 'Aguarde, o QuickBooks está respondendo…',
    done_new: 'Invoice {d} criada no QuickBooks. Total lá: {t}.', done_old: 'Esses pedidos já tinham a invoice {d} no QuickBooks. Total lá: {t}.', link_ok: 'Link de pagamento gravado no botão Pagar.', mismatch: 'ATENÇÃO: o total do QuickBooks ({t}) é diferente do total do portal ({p}). Normalmente é o tax calculado pelo QuickBooks — confira a invoice lá antes de mandar o link.',
    sync_done: '{n} invoice(s) conferida(s); {p} paga(s).', sync_none: 'Nenhum pedido com invoice do QuickBooks em aberto nesta lista.', back_ok: 'QuickBooks conectado.', back_err: 'Não conectou o QuickBooks: {m}', one_store: 'Os pedidos da pasta precisam ser da mesma loja (e nenhum sem loja). Troque a loja na coluna Store e tente de novo.' },
  en: { connect: 'Connect QuickBooks', conn_ok: 'QuickBooks: {c} ({e}) ✓', sync: '↻ QuickBooks payments', group: 'QuickBooks invoice', paid: 'Paid ✓', partial: '{v} due',
    disc_q: 'The portal is connected to QuickBooks "{c}" ({e}).\n\nDisconnect? Invoices already created stay there; the portal just stops creating new ones and receiving payments.', inv_q: 'Create the QuickBooks invoice for {n} order(s) of "{loja}", total {v}?\n\nThe payment link comes back to the Pay button.', busy: 'Please wait, QuickBooks is responding…',
    done_new: 'Invoice {d} created in QuickBooks. Total there: {t}.', done_old: 'These orders already had invoice {d} in QuickBooks. Total there: {t}.', link_ok: 'Payment link saved on the Pay button.', mismatch: 'WARNING: the QuickBooks total ({t}) differs from the portal total ({p}). Usually it is the tax computed by QuickBooks — check the invoice there before sending the link.',
    sync_done: '{n} invoice(s) checked; {p} paid.', sync_none: 'No order with an open QuickBooks invoice in this list.', back_ok: 'QuickBooks connected.', back_err: 'QuickBooks did not connect: {m}', one_store: 'The orders in the folder must belong to the same store (none without a store). Change the store in the Store column and try again.' },
  es: { connect: 'Conectar QuickBooks', conn_ok: 'QuickBooks: {c} ({e}) ✓', sync: '↻ Pagos de QuickBooks', group: 'Factura en QuickBooks', paid: 'Pagado ✓', partial: 'falta {v}',
    disc_q: 'El portal está conectado a QuickBooks "{c}" ({e}).\n\n¿Desconectar? Las facturas ya creadas quedan allí; el portal solo deja de crear nuevas y de recibir los pagos.', inv_q: '¿Crear la factura en QuickBooks para {n} pedido(s) de "{loja}", total {v}?\n\nEl link de pago vuelve al botón Pagar.', busy: 'Espere, QuickBooks está respondiendo…',
    done_new: 'Factura {d} creada en QuickBooks. Total allí: {t}.', done_old: 'Estos pedidos ya tenían la factura {d} en QuickBooks. Total allí: {t}.', link_ok: 'Link de pago guardado en el botón Pagar.', mismatch: 'ATENCIÓN: el total de QuickBooks ({t}) es distinto del total del portal ({p}). Normalmente es el tax calculado por QuickBooks — revise la factura allí antes de enviar el link.',
    sync_done: '{n} factura(s) revisada(s); {p} pagada(s).', sync_none: 'Ningún pedido con factura de QuickBooks abierta en esta lista.', back_ok: 'QuickBooks conectado.', back_err: 'No se conectó QuickBooks: {m}', one_store: 'Los pedidos de la carpeta deben ser de la misma tienda (ninguno sin tienda). Cambie la tienda en la columna Store e intente de nuevo.' }
};
function qbT(k, v) { const L = QB_TXT[cxLang()] || QB_TXT.en; let t = L[k] != null ? L[k] : (QB_TXT.en[k] || k); Object.keys(v || {}).forEach((x) => { t = t.split('{' + x + '}').join(v[x] == null ? '' : v[x]); }); return t; }
async function cxQbCall(fn, body) {
  const { data, error } = await supabaseClient.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message || 'QuickBooks';
    if (error.context && typeof error.context.json === 'function') { try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* genérica */ } }
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data || {};
}
function cxQbFoot() {
  const s = cxState.scope;
  if (!s || !cxAdmin() || s.qbo === undefined || !s.qbo) return ''; // em todas as abas (21/11: Matt não achou na aba All)
  return s.qbo.connected
    ? '<button type="button" class="cx-link" data-cx="qbconn">' + cEsc(qbT('conn_ok', { c: s.qbo.company_name || '—', e: s.qbo.environment || '' })) + '</button>'
      + '<button type="button" class="cx-link" data-cx="qbsync">' + cEsc(qbT('sync')) + '</button>'
    : '<button type="button" class="cx-link" data-cx="qbconn">' + cEsc(qbT('connect')) + '</button>';
}
async function cxQbAction(a, b) {
  const s = cxState.scope;
  if (!s || !cxAdmin()) return;
  if (cxState.qbBusy) return alert(qbT('busy'));
  cxState.qbBusy = true;
  try {
    if (a === 'qbconn') {
      if (s.qbo && s.qbo.connected) {
        if (!confirm(qbT('disc_q', { c: s.qbo.company_name || '—', e: s.qbo.environment || '' }))) return;
        await cxQbCall('qbo-auth', { action: 'disconnect' });
        s.qbo = Object.assign({}, s.qbo, { connected: false, company_name: null });
        return mpRender();
      }
      const r = await cxQbCall('qbo-auth', { action: 'start' });
      if (r.url) window.location.href = r.url;
      return;
    }
    if (a === 'qbsync') {
      const ids = s.orders.filter((o) => !o._proj && o.qbo_invoice_id && !o.qbo_paid_at).map((o) => o.id);
      if (!ids.length) return alert(qbT('sync_none'));
      let n = 0, pagos = 0;
      for (let i = 0; i < ids.length; i += 60) {
        const r = await cxQbCall('qbo-invoice', { action: 'sync', order_ids: ids.slice(i, i + 60) });
        (r.invoices || []).forEach((inv) => {
          n++; if (!(Number(inv.balance) > 0)) pagos++;
          s.orders.forEach((o) => {
            if (o.qbo_invoice_id !== inv.invoice_id) return;
            o.qbo_balance = inv.balance;
            if (!(Number(inv.balance) > 0)) { o.qbo_paid_at = o.qbo_paid_at || new Date().toISOString(); o.paid_at = o.paid_at || o.qbo_paid_at; }
          });
        });
      }
      alert(qbT('sync_done', { n, p: pagos }));
      return mpRender();
    }
    // qbinv (um pedido) / qbgroup (b = lista de ids: os pedidos da pasta)
    const ids = Array.isArray(b) ? b : [b.getAttribute('data-id')];
    const ped = ids.map((id) => s.orders.find((o) => o.id === id)).filter(Boolean);
    if (!ped.length) return;
    const lojas = Array.from(new Set(ped.map((o) => o.account_id || '')));
    if (lojas.length !== 1 || !lojas[0]) return alert(qbT('one_store'));
    // a invoice do portal primeiro (congela tax/total e dá o número INV-…)
    const st = await supabaseClient.rpc('order_stamp_invoice', { p_orders: ped.map((o) => o.id) });
    if (st.error) throw st.error;
    ((st.data && st.data.orders) || []).forEach((r) => { const o = s.orders.find((x) => x.id === r.id); if (o) { Object.assign(o, r, { invoice_number: st.data.invoice_number }); cxCalcTax(o, s); } });
    const total = ped.reduce((t, o) => t + (Number(o.invoice_total != null ? o.invoice_total : o._it) || 0), 0);
    if (!ped.every((o) => o.qbo_invoice_id) && !confirm(qbT('inv_q', { n: ped.length, loja: cxStoreName(ped[0]), v: cMoney(total) }))) return mpRender();
    const r = await cxQbCall('qbo-invoice', { order_ids: ped.map((o) => o.id) });
    ped.forEach((o) => { o.qbo_invoice_id = r.invoice_id; o.qbo_doc_number = r.doc_number; o.qbo_balance = r.balance; if (r.link) o.payment_link = r.link; if (!(Number(r.balance) > 0) && r.existing) { o.qbo_paid_at = o.qbo_paid_at || new Date().toISOString(); } });
    cxSel().clear();
    mpRender();
    const linhas = [qbT(r.existing ? 'done_old' : 'done_new', { d: r.doc_number || r.invoice_id, t: cMoney(r.total) })];
    if (r.link) linhas.push(qbT('link_ok')); else if (r.link_warning) linhas.push(r.link_warning);
    if (Math.abs((Number(r.total) || 0) - (Number(r.expected) || 0)) > 0.01) linhas.push('', qbT('mismatch', { t: cMoney(r.total), p: cMoney(r.expected) }));
    alert(linhas.join('\n'));
  } catch (e) {
    alert((e && e.message) || String(e));
  } finally {
    cxState.qbBusy = false;
  }
}
// volta da tela de autorização da Intuit: portal.html?qbo=connected | ?qbo=error&msg=…
(function cxQbVolta() {
  try {
    const u = new URL(location.href); const q = u.searchParams.get('qbo');
    if (!q) return;
    const msg = u.searchParams.get('msg') || '';
    u.searchParams.delete('qbo'); u.searchParams.delete('msg');
    history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash);
    setTimeout(() => alert(q === 'connected' ? qbT('back_ok') : qbT('back_err', { m: msg })), 1500);
  } catch (e) { /* sem aviso */ }
})();
function cxSelBar() { return ''; } // 21/11: seleção por caixinha saiu (botões na linha da pasta)
async function cxSignedOpen(bucket, path) {
  const w = window.open('', '_blank');
  const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(path, 600);
  if (error || !data) { if (w) w.close(); return alert((error && error.message) || 'link'); }
  if (w) w.location = data.signedUrl; else window.open(data.signedUrl, '_blank');
}
async function cxInvoice(ids) {
  const s = cxState.scope;
  if (!s || !ids.length) return;
  if (!s.invOk) return alert(ivT('need316'));
  const ped = ids.map((id) => s.orders.find((o) => o.id === id)).filter(Boolean);
  if (ped.length === 1 && ped[0].invoice_path) return cxSignedOpen('order-invoices', ped[0].invoice_path); // PDF do QuickBooks subido no ERP
  const w = window.open('', '_blank');
  try {
    const { data, error } = await supabaseClient.rpc('order_stamp_invoice', { p_orders: ped.map((o) => o.id) });
    if (error) throw error;
    (data && data.orders || []).forEach((r) => { const o = s.orders.find((x) => x.id === r.id); if (o) { Object.assign(o, r, { invoice_number: data.invoice_number }); cxCalcTax(o, s); } });
    const { data: itens } = await supabaseClient.from('order_items').select('order_id, module_name, quantity, total_price').in('order_id', ped.map((o) => o.id));
    const acc = (s.accounts || []).find((a) => a.id === ped[0].account_id) || {};
    const E = cEsc;
    const linhas = ped.map((o) => {
      const its = (itens || []).filter((it) => it.order_id === o.id);
      const num = Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : '—';
      return '<tr class="o"><td colspan="3"><b>' + E(ivT('order')) + ' ' + num + '</b> · ' + E(ivT('po')) + ' ' + E(o.po_name || '—') + (o.room_name ? ' · ' + E(o.room_name) : '') + '</td></tr>'
        + its.map((it) => '<tr><td>' + E(it.module_name || '') + '</td><td class="r">' + (it.quantity || 1) + '</td><td class="r">' + E(cMoney(it.total_price)) + '</td></tr>').join('');
    }).join('');
    const sum = (k) => ped.reduce((t, o) => t + (Number(o[k]) || 0), 0);
    const net = ped.reduce((t, o) => t + (o._n != null ? o._n : (o._l || 0)), 0);
    const links = Array.from(new Set(ped.map((o) => o.payment_link).filter(Boolean)));
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + E(data.invoice_number) + '</title><style>'
      + 'body{font-family:Inter,Arial,sans-serif;color:#222;max-width:820px;margin:32px auto;padding:0 24px}h1{letter-spacing:.08em;margin:0}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:13px}td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}.r{text-align:right}tr.o td{background:#f6f2ec;border-bottom:0;padding-top:10px}'
      + '.top{display:flex;justify-content:space-between;gap:24px}.muted{color:#777;font-size:12px}.tot td{border:0;padding:3px 8px}.tot .g td{font-size:16px;font-weight:700;border-top:2px solid #222;padding-top:8px}.pay{display:inline-block;margin-top:16px;background:#8a4b1c;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:700}@media print{.np{display:none}}</style></head><body>'
      + '<div class="np" style="text-align:right"><button onclick="print()">' + E(ivT('print')) + '</button></div>'
      + '<div class="top"><div><h1>' + E(ivT('title')) + '</h1><div class="muted">Legno Home · sales@legnocabinets.com · +1 (352) 988-8801</div></div>'
      + '<div class="r"><b>' + E(data.invoice_number) + '</b><br><span class="muted">' + E(ivT('date')) + ': ' + E(new Date().toLocaleDateString('en-US')) + '</span></div></div>'
      + '<p><span class="muted">' + E(ivT('bill')) + '</span><br><b>' + E(acc.legal_name || acc.trade_name || cxStoreName(ped[0])) + '</b>' + (acc.legal_name && acc.trade_name && acc.trade_name !== acc.legal_name ? ' (' + E(acc.trade_name) + ')' : '')
      + (acc.billing_city ? '<br>' + E(acc.billing_city + (acc.billing_state ? ', ' + acc.billing_state : '')) : '') + (acc.phone ? '<br>' + E(acc.phone) : '') + '</p>'
      + '<table><thead><tr><th>' + E(ivT('item')) + '</th><th class="r">' + E(ivT('qty')) + '</th><th class="r">' + E(ivT('amount')) + '</th></tr></thead><tbody>' + linhas + '</tbody></table>'
      + '<table class="tot" style="width:320px;margin-left:auto"><tr><td>' + E(ivT('sub')) + '</td><td class="r">' + E(cMoney(sum('_l'))) + '</td></tr>'
      + '<tr><td>' + E(ivT('disc')) + '</td><td class="r">−' + E(cMoney(sum('_l') - net)) + '</td></tr>'
      + '<tr><td>' + E(ivT('net')) + '</td><td class="r">' + E(cMoney(net)) + '</td></tr>'
      // desconto de pagamento (Zelle / antecipado — migration 330): linha própria, antes do tax
      + (sum('pay_discount_amount') > 0 ? '<tr><td>' + E(pyT('inv_line', { p: ped.every((o) => Number(o.pay_discount_pct) === Number(ped[0].pay_discount_pct)) ? Number(ped[0].pay_discount_pct) : '…' })) + '</td><td class="r">−' + E(cMoney(sum('pay_discount_amount'))) + '</td></tr>' : '')
      + '<tr><td>' + E(ivT('taxl')) + (ped.every((o) => Number(o.tax_pct) === 0) ? ' (' + E(ivT('exempt')) + ')' : ped[0].tax_pct != null ? ' (' + ped[0].tax_pct + '%)' : '') + '</td><td class="r">' + E(cMoney(sum('tax_amount'))) + '</td></tr>'
      + '<tr class="g"><td>' + E(ivT('total')) + '</td><td class="r">' + E(cMoney(sum('invoice_total'))) + '</td></tr></table>'
      + (ped.some((o) => o.pay_plan === 'split') ? '<p style="margin-top:14px"><b>' + E(pyT('inv_split', { a: cMoney(Math.round(sum('invoice_total') * 50) / 100), b: cMoney(Math.round((sum('invoice_total') - Math.round(sum('invoice_total') * 50) / 100) * 100) / 100) })) + '</b></p>' : '')
      + (ped.some((o) => o.pay_method === 'wire') && (cxState.scope.payTerms || {}).wire_info ? '<p style="margin-top:16px;white-space:pre-wrap"><b>Wire:</b>\n' + E(cxState.scope.payTerms.wire_info) + '\nmemo <b>' + E(data.invoice_number) + '</b></p>' : '')
      + (ped.some((o) => o.pay_method === 'zelle') && cxPayTerms().to ? '<p style="margin-top:16px"><b>Zelle:</b> ' + E(cxPayTerms().to) + (cxPayTerms().name ? ' (' + E(cxPayTerms().name) + ')' : '') + ' · memo <b>' + E(data.invoice_number) + '</b></p>' : '')
      + (ped.some((o) => o.pay_method === 'zelle' || o.pay_method === 'wire') ? '' : links.map((l) => '<a class="pay np" href="' + E(l) + '" target="_blank" rel="noopener">' + E(ivT('pay_online')) + '</a> ').join(''))
      + '<p class="muted" style="margin-top:28px">' + E(ivT('terms')) + '</p></body></html>';
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    cxSel().clear();
    mpRender();
  } catch (e) {
    if (w) w.close();
    alert((e && e.message) || String(e));
  }
}
async function cxUploadReceipt(id) {
  const s = cxState.scope; const o = s && s.orders.find((x) => x.id === id);
  if (!o) return;
  if (!s.invOk) return alert(ivT('need316'));
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*,application/pdf';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0]; if (!f) return;
    try {
      const path = id + '/' + Date.now() + '-' + f.name.replace(/[^\w.\-]+/g, '_');
      const up = await supabaseClient.storage.from('order-receipts').upload(path, f, { upsert: false, contentType: f.type || undefined });
      if (up.error) throw up.error;
      const r = await supabaseClient.rpc('order_attach_receipt', { p_order: id, p_path: path });
      if (r.error) throw r.error;
      o.receipt_path = path; o.receipt_uploaded_at = new Date().toISOString();
      mpRender(); alert(ivT('rcpt_sent'));
    } catch (e) { alert((e && e.message) || String(e)); }
  };
  inp.click();
}
// ============================================================
// PAGAMENTO DO PEDIDO — Zelle / link, com desconto na invoice (22/11/2026, migration 330)
// ============================================================
// Matt: "ativar botão fazer pagamento — zelle 3% desconto, pagamento antecipado
// mais 3%. aí dar desconto na invoice e seguir com pagamento... vou precisar um
// link de pagamento, hoje mais da metade paga dessa forma, deixa preparado, mas
// já tive problema com quickbooks em conta nova" (o QuickBooks segurou um
// pagamento por 6 meses). Por isso: o dinheiro NÃO passa por intermediário
// nenhum por padrão (Zelle direto na conta), e o link de pagamento é só um
// endereço que a fábrica cola no pedido (qualquer provedor) — nada aqui depende
// do QuickBooks nem de Stripe.
//
// Botão "Pay" (data-cx="payopen") na coluna Pagamento e no ▾ → janela #cx-pay:
//   * escolha Zelle (−z%) ou Link de pagamento (sem o desconto do Zelle);
//   * antecipado (+e%) entra sozinho enquanto a produção NÃO foi liberada;
//   * a tela mostra a prévia; a CONTA QUE VALE é a da RPC order_choose_payment
//     (desconto sobre o líquido, tax recalculado, total da invoice corrigido);
//   * Zelle: mostra pra onde mandar + "Anexar comprovante" (o de sempre); a
//     FÁBRICA confere e marca como pago (admin: "Marcar como pago" aqui).
// Invoice com vários pedidos: a escolha vale pra todos os pedidos da invoice.
// Vendedor não vê (valores de fábrica). Sem a 330: s.payOk = false e tudo fica
// como antes (botão Pay abre o link direto).
// Liberar produção de pedido NÃO pago que tinha o desconto de antecipado: o
// portal avisa e refaz a conta sem os e% (cxAdminRelease).
const PY_TXT = {
  pt: { btn: 'Pagar', title: 'Pagamento', order: 'Pedido', how: 'Como você vai pagar?', zelle: 'Zelle', zelle_sub: '{p}% de desconto · cai direto na conta, sem intermediário', link: 'Link de pagamento', link_sub: 'cartão ou banco, pelo link enviado pela fábrica · sem o desconto do Zelle', link_none: 'A fábrica ainda não colocou um link de pagamento neste pedido.',
    net: 'Líquido de fábrica', d_zelle: 'Desconto Zelle ({p}%)', d_early: 'Desconto pagamento antecipado ({p}%)', early_no: 'Pagamento antecipado: não vale mais — a produção já foi liberada.', early_yes: 'Vale enquanto a produção não for liberada: pague e envie o comprovante antes.', tax: 'Sales tax', exempt: 'isento', total: 'Total a pagar',
    confirm: 'Confirmar forma de pagamento', saving: 'Calculando…', chosen: 'Forma escolhida: {m}. Total da invoice: {t}.', close: 'Fechar', zto: 'Envie o Zelle para', zmemo: 'Na mensagem do Zelle escreva', zto_none: 'A fábrica ainda não cadastrou os dados do Zelle. Fale com a fábrica antes de enviar.', attach: 'Anexar comprovante', attached: 'Comprovante enviado ✓ — a fábrica confere e dá a baixa.', open_link: 'Abrir o link de pagamento ↗', see_inv: 'Ver invoice',
    paid: 'Este pedido já consta como PAGO.', mark_paid: 'Marcar como pago', unmark: 'Desfazer pago', mark_q: 'Marcar o pedido {n} como PAGO?\n\nConfira antes se o dinheiro entrou na conta.', unmark_q: 'Tirar a marca de PAGO do pedido {n}?', terms: '✎ Condições', t_z: 'Desconto do Zelle (%):', t_e: 'Desconto do pagamento antecipado (%):', t_to: 'Zelle da fábrica (e-mail ou telefone):', t_name: 'Nome que aparece no Zelle:', clear: 'Tirar forma de pagamento e desconto', clear_q: 'Tirar a forma de pagamento e o desconto deste pedido? A invoice volta ao valor cheio.',
    qbo_warn: 'Este pedido já tem invoice no QuickBooks: o desconto NÃO foi pra lá. Ajuste a invoice no QuickBooks à mão.', need330: 'Falta rodar a migration 330 no Supabase pra usar o pagamento com desconto.', rel_warn: 'ATENÇÃO: este pedido tem desconto de pagamento antecipado ({p}%) e ainda NÃO consta como pago. Liberando a produção agora, esse desconto sai da invoice.\n\nSe o pagamento já entrou, cancele e marque como pago primeiro (botão Pagar).', inv_line: 'Desconto de pagamento ({p}%)', several: '{n} pedidos nesta invoice' },
  en: { btn: 'Pay', title: 'Payment', order: 'Order', how: 'How will you pay?', zelle: 'Zelle', zelle_sub: '{p}% discount · goes straight to the bank account, no intermediary', link: 'Payment link', link_sub: 'card or bank, through the link sent by the factory · no Zelle discount', link_none: 'The factory has not added a payment link to this order yet.',
    net: 'Factory net', d_zelle: 'Zelle discount ({p}%)', d_early: 'Early payment discount ({p}%)', early_no: 'Early payment: no longer available — production was already released.', early_yes: 'Valid while production is not released: pay and send the receipt first.', tax: 'Sales tax', exempt: 'exempt', total: 'Total to pay',
    confirm: 'Confirm payment method', saving: 'Calculating…', chosen: 'Method chosen: {m}. Invoice total: {t}.', close: 'Close', zto: 'Send the Zelle to', zmemo: 'In the Zelle memo write', zto_none: 'The factory has not registered its Zelle details yet. Contact the factory before sending.', attach: 'Attach receipt', attached: 'Receipt sent ✓ — the factory checks it and marks the order as paid.', open_link: 'Open the payment link ↗', see_inv: 'View invoice',
    paid: 'This order is already marked as PAID.', mark_paid: 'Mark as paid', unmark: 'Undo paid', mark_q: 'Mark order {n} as PAID?\n\nCheck first that the money reached the account.', unmark_q: 'Remove the PAID mark from order {n}?', terms: '✎ Terms', t_z: 'Zelle discount (%):', t_e: 'Early payment discount (%):', t_to: 'Factory Zelle (e-mail or phone):', t_name: 'Name shown on Zelle:', clear: 'Remove payment method and discount', clear_q: 'Remove the payment method and discount from this order? The invoice goes back to the full amount.',
    qbo_warn: 'This order already has a QuickBooks invoice: the discount did NOT go there. Adjust the QuickBooks invoice by hand.', need330: 'Migration 330 must be run in Supabase to use payment with discount.', rel_warn: 'WARNING: this order has the early payment discount ({p}%) and is NOT marked as paid yet. Releasing production now removes that discount from the invoice.\n\nIf the payment already arrived, cancel and mark it as paid first (Pay button).', inv_line: 'Payment discount ({p}%)', several: '{n} orders on this invoice' },
  es: { btn: 'Pagar', title: 'Pago', order: 'Pedido', how: '¿Cómo va a pagar?', zelle: 'Zelle', zelle_sub: '{p}% de descuento · llega directo a la cuenta, sin intermediario', link: 'Link de pago', link_sub: 'tarjeta o banco, por el link enviado por la fábrica · sin el descuento de Zelle', link_none: 'La fábrica aún no puso un link de pago en este pedido.',
    net: 'Neto de fábrica', d_zelle: 'Descuento Zelle ({p}%)', d_early: 'Descuento pago anticipado ({p}%)', early_no: 'Pago anticipado: ya no aplica — la producción ya fue liberada.', early_yes: 'Vale mientras la producción no sea liberada: pague y envíe el comprobante antes.', tax: 'Sales tax', exempt: 'exento', total: 'Total a pagar',
    confirm: 'Confirmar forma de pago', saving: 'Calculando…', chosen: 'Forma elegida: {m}. Total de la factura: {t}.', close: 'Cerrar', zto: 'Envíe el Zelle a', zmemo: 'En el mensaje del Zelle escriba', zto_none: 'La fábrica aún no registró los datos de Zelle. Contacte a la fábrica antes de enviar.', attach: 'Adjuntar comprobante', attached: 'Comprobante enviado ✓ — la fábrica lo verifica y registra el pago.', open_link: 'Abrir el link de pago ↗', see_inv: 'Ver factura',
    paid: 'Este pedido ya figura como PAGADO.', mark_paid: 'Marcar como pagado', unmark: 'Deshacer pagado', mark_q: '¿Marcar el pedido {n} como PAGADO?\n\nVerifique antes que el dinero llegó a la cuenta.', unmark_q: '¿Quitar la marca de PAGADO del pedido {n}?', terms: '✎ Condiciones', t_z: 'Descuento de Zelle (%):', t_e: 'Descuento de pago anticipado (%):', t_to: 'Zelle de la fábrica (e-mail o teléfono):', t_name: 'Nombre que aparece en Zelle:', clear: 'Quitar forma de pago y descuento', clear_q: '¿Quitar la forma de pago y el descuento de este pedido? La factura vuelve al valor completo.',
    qbo_warn: 'Este pedido ya tiene factura en QuickBooks: el descuento NO fue allí. Ajuste la factura en QuickBooks a mano.', need330: 'Falta ejecutar la migration 330 en Supabase para usar el pago con descuento.', rel_warn: 'ATENCIÓN: este pedido tiene el descuento de pago anticipado ({p}%) y aún NO figura como pagado. Al liberar la producción ahora, ese descuento sale de la factura.\n\nSi el pago ya llegó, cancele y márquelo como pagado primero (botón Pagar).', inv_line: 'Descuento de pago ({p}%)', several: '{n} pedidos en esta factura' }
};
// 22/11 (migration 333): plano TOTAL × 50/50, wire, "link" passa a se chamar QuickBooks
Object.assign(PY_TXT.pt, {
  list: 'Valor de tabela', d_fab: 'Desconto de fábrica ({p}%)',
  plan_h: '1. Quanto você paga agora?', how: '2. Como você vai pagar?',
  frisa: 'ATENÇÃO: o desconto de {p}% é só pra quem paga o pedido INTEIRO, de uma vez, ANTES de receber. No plano 50% + 50% NÃO tem esse desconto.',
  frisa_tarde: 'A produção deste pedido já foi liberada: o desconto de {p}% de pagamento total antecipado não vale mais.',
  plan_full: 'Pagamento total antecipado', plan_full_sub: '100% agora, de uma vez', plan_full_late: '100% agora · sem o desconto (produção já liberada)',
  plan_split: '50% de entrada + 50% antes de carregar', plan_split_sub: 'sem o desconto de pagamento total',
  zelle_sub: 'direto na conta, sem intermediário · envie o comprovante',
  wire: 'Wire (transferência bancária)', wire_sub: 'envie o comprovante · pode levar alguns dias úteis pra entrar na conta da fábrica',
  link: 'QuickBooks', link_sub: 'cartão ou banco, pelo link enviado pela fábrica · sem desconto de forma de pagamento', link_none: 'A fábrica ainda não colocou o link do QuickBooks neste pedido.',
  d_zelle: 'Desconto Zelle / Wire ({p}%)', d_early: 'Desconto pagamento total antecipado ({p}%)',
  dep_now: 'Entrada (50%) — agora', dep_later: 'Saldo (50%) — antes de carregar',
  wto: 'Dados pra enviar o wire', wto_none: 'A fábrica ainda não cadastrou os dados do wire. Fale com a fábrica antes de enviar.',
  wire_slow: 'O wire pode demorar pra entrar na conta. A baixa (e o que depende dela) só acontece quando o dinheiro entrar — envie com antecedência.',
  dep: 'Marcar entrada paga', undep: 'Desfazer entrada', dep_q: 'Marcar a ENTRADA (50%) do pedido {n} como paga?\n\nConfira antes se o dinheiro entrou na conta.', undep_q: 'Tirar a marca de entrada paga do pedido {n}?',
  wire_edit: '✎ Dados do wire', wire_q: 'Dados bancários pro wire (banco, routing, conta, beneficiário). Separe as linhas com " | ":',
  need333: 'Falta rodar a migration 333 no Supabase pra usar o plano 50/50 e o wire.',
  rel_dep_q: 'Este pedido está no plano 50% + 50% e a ENTRADA ainda não está marcada como paga.\n\nLiberar a produção mesmo assim?',
  inv_split: 'Plano: 50% de entrada ({a}) + 50% antes de carregar ({b}).'
});
Object.assign(PY_TXT.en, {
  list: 'List price', d_fab: 'Factory discount ({p}%)',
  plan_h: '1. How much do you pay now?', how: '2. How will you pay?',
  frisa: 'IMPORTANT: the {p}% discount is only for paying the FULL order at once, IN ADVANCE. The 50% + 50% plan does NOT get this discount.',
  frisa_tarde: 'Production of this order has already been released: the {p}% full-payment discount no longer applies.',
  plan_full: 'Full payment in advance', plan_full_sub: '100% now, in a single payment', plan_full_late: '100% now · no discount (production already released)',
  plan_split: '50% deposit + 50% before loading', plan_split_sub: 'no full-payment discount',
  zelle_sub: 'straight to the account, no intermediary · send the receipt',
  wire: 'Wire transfer', wire_sub: 'send the receipt · may take a few business days to reach the factory account',
  link: 'QuickBooks', link_sub: 'card or bank, through the link sent by the factory · no payment-method discount', link_none: 'The factory has not added the QuickBooks link to this order yet.',
  d_zelle: 'Zelle / Wire discount ({p}%)', d_early: 'Full payment in advance discount ({p}%)',
  dep_now: 'Deposit (50%) — now', dep_later: 'Balance (50%) — before loading',
  wto: 'Wire instructions', wto_none: 'The factory has not registered the wire details yet. Contact the factory before sending.',
  wire_slow: 'A wire can take time to arrive. The payment is only confirmed when the money reaches the account — send it in advance.',
  dep: 'Mark deposit paid', undep: 'Undo deposit', dep_q: 'Mark the DEPOSIT (50%) of order {n} as paid?\n\nCheck first that the money reached the account.', undep_q: 'Remove the deposit-paid mark from order {n}?',
  wire_edit: '✎ Wire details', wire_q: 'Bank details for the wire (bank, routing, account, beneficiary). Separate lines with " | ":',
  need333: 'Migration 333 must be run in Supabase to use the 50/50 plan and wire.',
  rel_dep_q: 'This order is on the 50% + 50% plan and the DEPOSIT is not marked as paid yet.\n\nRelease production anyway?',
  inv_split: 'Plan: 50% deposit ({a}) + 50% before loading ({b}).'
});
Object.assign(PY_TXT.es, {
  list: 'Precio de lista', d_fab: 'Descuento de fábrica ({p}%)',
  plan_h: '1. ¿Cuánto paga ahora?', how: '2. ¿Cómo va a pagar?',
  frisa: 'ATENCIÓN: el descuento de {p}% es solo para quien paga el pedido COMPLETO, de una vez, POR ANTICIPADO. En el plan 50% + 50% NO hay ese descuento.',
  frisa_tarde: 'La producción de este pedido ya fue liberada: el descuento de {p}% por pago total anticipado ya no aplica.',
  plan_full: 'Pago total anticipado', plan_full_sub: '100% ahora, en un solo pago', plan_full_late: '100% ahora · sin descuento (producción ya liberada)',
  plan_split: '50% de anticipo + 50% antes de cargar', plan_split_sub: 'sin el descuento de pago total',
  zelle_sub: 'directo a la cuenta, sin intermediario · envíe el comprobante',
  wire: 'Wire (transferencia bancaria)', wire_sub: 'envíe el comprobante · puede tardar algunos días hábiles en llegar a la cuenta de la fábrica',
  link: 'QuickBooks', link_sub: 'tarjeta o banco, por el enlace enviado por la fábrica · sin descuento por forma de pago', link_none: 'La fábrica aún no puso el enlace de QuickBooks en este pedido.',
  d_zelle: 'Descuento Zelle / Wire ({p}%)', d_early: 'Descuento pago total anticipado ({p}%)',
  dep_now: 'Anticipo (50%) — ahora', dep_later: 'Saldo (50%) — antes de cargar',
  wto: 'Datos para enviar el wire', wto_none: 'La fábrica aún no registró los datos del wire. Hable con la fábrica antes de enviar.',
  wire_slow: 'El wire puede tardar en llegar. El pago solo se confirma cuando el dinero entra en la cuenta — envíelo con anticipación.',
  dep: 'Marcar anticipo pagado', undep: 'Deshacer anticipo', dep_q: '¿Marcar el ANTICIPO (50%) del pedido {n} como pagado?\n\nVerifique antes que el dinero entró en la cuenta.', undep_q: '¿Quitar la marca de anticipo pagado del pedido {n}?',
  wire_edit: '✎ Datos del wire', wire_q: 'Datos bancarios para el wire (banco, routing, cuenta, beneficiario). Separe las líneas con " | ":',
  need333: 'Falta ejecutar la migration 333 en Supabase para usar el plan 50/50 y el wire.',
  rel_dep_q: 'Este pedido está en el plan 50% + 50% y el ANTICIPO aún no está marcado como pagado.\n\n¿Liberar la producción igual?',
  inv_split: 'Plan: 50% de anticipo ({a}) + 50% antes de cargar ({b}).'
});
function pyT(k, v) { const L = PY_TXT[cxLang()] || PY_TXT.en; let t = L[k] != null ? L[k] : (PY_TXT.en[k] || k); Object.keys(v || {}).forEach((x) => { t = t.split('{' + x + '}').join(v[x] == null ? '' : String(v[x])); }); return t; }
function cxPayTerms() { const t = (cxState.scope || {}).payTerms || {}; return { z: t.zelle_pct != null ? Number(t.zelle_pct) : 3, e: t.early_pct != null ? Number(t.early_pct) : 3, to: t.zelle_to || '', name: t.zelle_name || '' }; }
function cxPodePagar(o) { const s = cxState.scope || {}; return !!(o && !o._proj && s.invOk && s.payOk && o.status !== 'submitted' && !cxSeller() && (cxAdmin() || o.client_user_id === cxMe() || (s.team && s.team[o.client_user_id]))); }
// todos os pedidos da mesma invoice (a escolha vale pra invoice inteira)
function cxPayGrupo(o) { const s = cxState.scope; return o.invoice_number ? s.orders.filter((x) => !x._proj && x.invoice_number === o.invoice_number) : [o]; }
// Líquido de fábrica pra prévia do pagamento. Com invoice já emitida, o número que VALE é o do banco
// (invoice_total − tax + desconto de pagamento = o líquido que a RPC usou). Sem isso a prévia usava o
// desconto do PERFIL de quem olha (22/11: perfil 57% × loja 60% → prévia $64,32, banco $59,83).
function cxPayNet(o) {
  if (o.invoice_issued_at && o.invoice_total != null) {
    const n = Math.round(((Number(o.invoice_total) || 0) - (Number(o.tax_amount) || 0) + (Number(o.pay_discount_amount) || 0)) * 100) / 100;
    if (n > 0) return n;
  }
  return o._n != null ? Number(o._n) : (Number(o._l) || 0);
}
// prévia na tela (mesma conta da RPC order_choose_payment, migrations 330/331/333)
// metodo: 'zelle' | 'wire' | 'link' (QuickBooks). plano: 'full' (tudo antes da produção) | 'split' (50% + 50%).
function cxPayPrevia(grupo, metodo, plano) {
  const s = cxState.scope; const T = cxPayTerms();
  let net = 0, dz = 0, de = 0, tax = 0, lista = 0, algumCedo = false, todosIsentos = true;
  grupo.forEach((o) => {
    const n = cxPayNet(o); const cedo = !o.finance_released_at;
    const pz = metodo === 'zelle' || metodo === 'wire' ? T.z : 0; const pe = plano === 'full' ? T.e : 0; // 22/11: vale sempre no plano total (antes: só com a produção não liberada)
    const desc = Math.round(n * (pz + pe)) / 100;
    const taxPct = o.tax_pct != null ? Number(o.tax_pct) : (cxIsento(o, s) ? 0 : Number(s.taxPct) || 0);
    if (taxPct > 0) todosIsentos = false;
    lista += Number(o._l) || 0; net += n; dz += Math.round(n * pz) / 100; de += Math.round(n * pe) / 100; if (cedo) algumCedo = true;
    tax += Math.round((n - desc) * taxPct) / 100;
  });
  const r2 = (v) => Math.round(v * 100) / 100;
  return { lista: r2(lista), net: r2(net), dz: r2(dz), de: r2(de), tax: r2(tax), total: r2(net - dz - de + tax), cedo: algumCedo, isento: todosIsentos };
}
function cxPayEl() {
  let ov = document.getElementById('cx-pay');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'cx-pay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10005;display:flex;align-items:flex-start;justify-content:center;padding:28px 12px;overflow:auto';
    // clicar fora NÃO fecha (regra de formulário)
    ov.addEventListener('click', (e) => { const b = e.target.closest('[data-py]'); if (b) { e.stopPropagation(); cxPayClick(b.getAttribute('data-py'), b); } });
    ov.addEventListener('change', (e) => {
      if (!e.target || !cxState.pay) return;
      if (e.target.name === 'cx-pay-m') { cxState.pay.metodo = e.target.value; cxPayRender(); }
      if (e.target.name === 'cx-pay-p') { cxState.pay.plano = e.target.value; cxPayRender(); }
    });
    document.body.appendChild(ov);
  }
  return ov;
}
function cxPayOpen(id) {
  const s = cxState.scope; const o = s && s.orders.find((x) => x.id === id);
  if (!o) return;
  if (!s.payOk) { if (o.payment_link) window.open(o.payment_link, '_blank', 'noopener'); else alert(pyT('need330')); return; }
  if (!cxPodePagar(o)) return;
  cxState.pay = { id, metodo: o.pay_method || 'zelle', plano: o.pay_plan || 'full', msg: '', err: '', busy: false };
  cxPayRender();
}
function cxPayRender() {
  const s = cxState.scope; const st = cxState.pay; if (!st) return;
  const o = s.orders.find((x) => x.id === st.id); if (!o) return;
  const ov = cxPayEl(); const T = cxPayTerms(); const E = cEsc;
  const grupo = cxPayGrupo(o); const pago = grupo.some((x) => x.paid_at || x.qbo_paid_at);
  const entradaPaga = grupo.every((x) => x.pay_deposit_at);
  const no = Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : (o.po_name || '');
  const link = (grupo.find((x) => x.payment_link) || {}).payment_link || '';
  const wire = ((s.payTerms || {}).wire_info) || '';
  const p = cxPayPrevia(grupo, st.metodo, st.plano);
  const planoGravado = o.pay_plan || 'full';
  const escolhido = !!o.pay_method && o.pay_method === st.metodo && planoGravado === st.plano && grupo.every((x) => x.pay_method === o.pay_method && (x.pay_plan || 'full') === planoGravado);
  const totalGravado = grupo.reduce((t, x) => t + (Number(x.invoice_total) || 0), 0);
  const total = pago || escolhido ? totalGravado : p.total;
  const r2 = (v) => Math.round(v * 100) / 100; const metade = r2(total / 2);
  const travado = pago || (entradaPaga && !cxAdmin());
  const lin = (rot, val, cls) => '<div class="py-l' + (cls ? ' ' + cls : '') + '"><span>' + E(rot) + '</span><b>' + val + '</b></div>';
  const op = (nome, v, atual, tit, sub, selo) => '<label class="py-op' + (atual === v ? ' on' : '') + '"><input type="radio" name="' + nome + '" value="' + v + '"' + (atual === v ? ' checked' : '') + (travado ? ' disabled' : '') + '><span><b>' + E(tit) + (selo ? ' <i class="py-tag">' + E(selo) + '</i>' : '') + '</b><small>' + E(sub) + '</small></span></label>';
  const comp = (o.receipt_path ? '<p class="py-ok">' + E(pyT('attached')) + '</p>' : '')
    + '<button type="button" class="py-go" data-py="attach">' + E(o.receipt_path ? '↻ ' + pyT('attach') : pyT('attach')) + '</button>';
  ov.innerHTML = '<div class="py-box" role="dialog" aria-modal="true">'
    + '<div class="py-head"><div><h3>' + E(pyT('title')) + ' — ' + E(pyT('order')) + ' ' + E(no) + '</h3><span class="hint">' + E([o.invoice_number, o.po_name, grupo.length > 1 ? pyT('several', { n: grupo.length }) : ''].filter(Boolean).join(' · ')) + '</span></div>'
    + '<button type="button" class="secondary py-x" data-py="close">×</button></div>'
    + (st.err ? '<p class="error">' + E(st.err) + '</p>' : '') + (st.msg ? '<p class="py-ok">' + E(st.msg) + '</p>' : '')
    + (pago ? '<p class="py-ok">' + E(pyT('paid')) + '</p>' : '')
    // 1) PLANO — o desconto é de quem paga TUDO ANTES da produção
    + '<h5>' + E(pyT('plan_h')) + '</h5>'
    + '<p class="py-frisa">' + E(pyT('frisa', { p: T.e })) + '</p>'
    + op('cx-pay-p', 'full', st.plano, pyT('plan_full'), pyT('plan_full_sub'), '−' + T.e + '%')
    + op('cx-pay-p', 'split', st.plano, pyT('plan_split'), pyT('plan_split_sub'))
    // 2) FORMA
    + '<h5>' + E(pyT('how')) + '</h5>'
    + op('cx-pay-m', 'zelle', st.metodo, pyT('zelle'), pyT('zelle_sub'), '−' + T.z + '%')
    + op('cx-pay-m', 'wire', st.metodo, pyT('wire'), pyT('wire_sub'), '−' + T.z + '%')
    + op('cx-pay-m', 'link', st.metodo, pyT('link'), link ? pyT('link_sub') : pyT('link_none'))
    // tabela → desconto de fábrica → líquido (22/11, Matt: "quero ver valor de tabela no pedido e valor do desconto")
    + '<div class="py-sum">' + (p.lista > p.net + 0.005 ? lin(pyT('list'), E(cMoney(p.lista))) + lin(pyT('d_fab', { p: Math.round((1 - p.net / p.lista) * 1000) / 10 }), '−' + E(cMoney(Math.round((p.lista - p.net) * 100) / 100))) : '')
    + lin(pyT('net'), E(cMoney(p.net)))
    + (p.dz ? lin(pyT('d_zelle', { p: T.z }), '−' + E(cMoney(p.dz)), 'd') : '')
    + (p.de ? lin(pyT('d_early', { p: T.e }), '−' + E(cMoney(p.de)), 'd') : '')
    + lin(pyT('tax') + (p.isento ? ' (' + pyT('exempt') + ')' : ''), E(cMoney(p.tax)))
    + lin(pyT('total'), E(cMoney(total)), 'g')
    + (st.plano === 'split' ? lin(pyT('dep_now') + (entradaPaga ? ' ✓' : ''), E(cMoney(metade)), 'h') + lin(pyT('dep_later'), E(cMoney(r2(total - metade))), 'h') : '')
    + '</div>'
    + (!travado && !escolhido ? '<button type="button" class="py-go" data-py="confirm"' + (st.busy ? ' disabled' : '') + '>' + E(st.busy ? pyT('saving') : pyT('confirm')) + '</button>' : '')
    // depois de escolhido: como pagar
    + (!pago && escolhido && st.metodo === 'zelle' ? '<div class="py-how">' + (T.to
        ? '<div>' + E(pyT('zto')) + ': <b>' + E(T.to) + '</b>' + (T.name ? ' (' + E(T.name) + ')' : '') + '</div><div>' + E(pyT('zmemo')) + ': <b>' + E(o.invoice_number || no) + '</b></div>'
        : '<div class="error">' + E(pyT('zto_none')) + '</div>') + comp + '</div>' : '')
    + (!pago && escolhido && st.metodo === 'wire' ? '<div class="py-how">' + (wire
        ? '<div>' + E(pyT('wto')) + ':</div><pre class="py-wire">' + E(wire) + '</pre><div>' + E(pyT('zmemo')) + ': <b>' + E(o.invoice_number || no) + '</b></div><div class="hint">' + E(pyT('wire_slow')) + '</div>'
        : '<div class="error">' + E(pyT('wto_none')) + '</div>') + comp + '</div>' : '')
    + (!pago && escolhido && st.metodo === 'link' ? '<div class="py-how">' + (link ? '<button type="button" class="py-go" data-py="openlink">' + E(pyT('open_link')) + '</button>' : '<div class="error">' + E(pyT('link_none')) + '</div>') + '</div>' : '')
    + (cxAdmin() && grupo.some((x) => x.qbo_invoice_id) && grupo.some((x) => Number(x.pay_discount_amount) > 0) ? '<p class="error">' + E(pyT('qbo_warn')) + '</p>' : '')
    + '<div class="py-foot"><button type="button" class="secondary" data-py="inv">' + E(pyT('see_inv')) + '</button>'
    + (cxAdmin() ? (planoGravado === 'split' && o.pay_method && !pago ? '<button type="button" class="secondary" data-py="' + (entradaPaga ? 'undep' : 'dep') + '">' + E(pyT(entradaPaga ? 'undep' : 'dep')) + '</button>' : '')
      + '<button type="button" class="secondary" data-py="' + (pago ? 'unmark' : 'markpaid') + '">' + E(pyT(pago ? 'unmark' : 'mark_paid')) + '</button>'
      + (!pago && o.pay_method ? '<button type="button" class="secondary" data-py="clear">' + E(pyT('clear')) + '</button>' : '')
      + '<button type="button" class="secondary" data-py="terms">' + E(pyT('terms')) + '</button>'
      + '<button type="button" class="secondary" data-py="wireinfo">' + E(pyT('wire_edit')) + '</button>' : '')
    + '<span style="flex:1"></span><button type="button" class="secondary" data-py="close">' + E(pyT('close')) + '</button></div></div>';
}
async function cxPayEscolher(grupo, metodo, plano) {
  const s = cxState.scope;
  // sem invoice ainda: emite (mesmo número pra todos os pedidos do grupo)
  if (grupo.some((x) => !x.invoice_issued_at)) {
    const r0 = await supabaseClient.rpc('order_stamp_invoice', { p_orders: grupo.map((x) => x.id) });
    if (r0.error) throw r0.error;
    (r0.data && r0.data.orders || []).forEach((r) => { const x = s.orders.find((y) => y.id === r.id); if (x) Object.assign(x, r, { invoice_number: r0.data.invoice_number }); });
  }
  let r = await supabaseClient.rpc('order_choose_payment', { p_orders: grupo.map((x) => x.id), p_method: metodo, p_plan: plano || 'full' });
  // sem a migration 333 só existe a função de 2 parâmetros (= plano total, sem wire)
  if (r.error && /order_choose_payment|schema cache|Could not find|PGRST202/i.test((r.error.message || '') + ' ' + (r.error.code || ''))) {
    if ((plano || 'full') !== 'full' || metodo === 'wire') throw new Error(pyT('need333'));
    r = await supabaseClient.rpc('order_choose_payment', { p_orders: grupo.map((x) => x.id), p_method: metodo });
  }
  if (r.error) throw r.error;
  (r.data || []).forEach((row) => { const x = s.orders.find((y) => y.id === row.id); if (x) { Object.assign(x, row); if (metodo === 'none') x.pay_plan = null; else if (!row.pay_plan) x.pay_plan = plano || 'full'; cxCalcTax(x, s); } });
}
async function cxPayClick(a, b) {
  const s = cxState.scope; const st = cxState.pay; if (!st || !s) return;
  const o = s.orders.find((x) => x.id === st.id); if (!o) return;
  const grupo = cxPayGrupo(o);
  const no = Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : (o.po_name || '');
  const fecha = () => { const ov = document.getElementById('cx-pay'); if (ov) ov.remove(); cxState.pay = null; mpRender(); };
  if (a === 'close') return fecha();
  if (a === 'inv') return cxInvoice(grupo.map((x) => x.id));
  if (a === 'openlink') { const l = (grupo.find((x) => x.payment_link) || {}).payment_link; if (l) window.open(l, '_blank', 'noopener'); return; }
  if (a === 'attach') { const t0 = o.receipt_path; cxUploadReceipt(o.id); const iv = setInterval(() => { if (!cxState.pay) return clearInterval(iv); if (o.receipt_path !== t0) { clearInterval(iv); cxPayRender(); } }, 700); setTimeout(() => clearInterval(iv), 180000); return; }
  if (st.busy) return;
  const roda = async (fn) => { st.busy = true; st.err = ''; st.msg = ''; cxPayRender(); try { await fn(); } catch (e) { st.err = (e && e.message) || String(e); } st.busy = false; if (cxState.pay) cxPayRender(); };
  if (a === 'confirm') return roda(async () => {
    await cxPayEscolher(grupo, st.metodo, st.plano);
    st.msg = pyT('chosen', { m: pyT(st.metodo) + ' · ' + pyT(st.plano === 'split' ? 'plan_split' : 'plan_full'), t: cMoney(grupo.reduce((t, x) => t + (Number(x.invoice_total) || 0), 0)) });
  });
  if (!cxAdmin()) return;
  if (a === 'clear') { if (!confirm(pyT('clear_q'))) return; return roda(async () => { await cxPayEscolher(grupo, 'none', 'full'); st.metodo = 'zelle'; st.plano = 'full'; }); }
  if (a === 'markpaid' || a === 'unmark' || a === 'dep' || a === 'undep') {
    const liga = a === 'markpaid' || a === 'dep'; const col = a === 'dep' || a === 'undep' ? 'pay_deposit_at' : 'paid_at';
    if (!confirm(pyT(a === 'markpaid' ? 'mark_q' : a === 'unmark' ? 'unmark_q' : a === 'dep' ? 'dep_q' : 'undep_q', { n: no }))) return;
    return roda(async () => {
      const agora = liga ? new Date().toISOString() : null; const upd = {}; upd[col] = agora;
      const r = await supabaseClient.from('orders').update(upd).in('id', grupo.map((x) => x.id)).select('id');
      if (r.error) throw r.error;
      grupo.forEach((x) => { x[col] = agora; });
    });
  }
  if (a === 'terms') {
    const T = cxPayTerms();
    const z = prompt(pyT('t_z'), String(T.z)); if (z === null) return;
    const e = prompt(pyT('t_e'), String(T.e)); if (e === null) return;
    const to = prompt(pyT('t_to'), T.to); if (to === null) return;
    const nm = prompt(pyT('t_name'), T.name); if (nm === null) return;
    const nz = Number(String(z).replace(',', '.')); const ne = Number(String(e).replace(',', '.'));
    if (!(nz >= 0 && nz <= 20) || !(ne >= 0 && ne <= 20)) return alert('0–20');
    return roda(async () => {
      const r = await supabaseClient.rpc('admin_set_payment_terms', { p_zelle_pct: nz, p_early_pct: ne, p_zelle_to: to, p_zelle_name: nm });
      if (r.error) throw r.error;
      s.payTerms = Object.assign({}, s.payTerms, r.data || {});
    });
  }
  if (a === 'wireinfo') {
    // dados bancários do wire: quem digita é a FÁBRICA, aqui, uma vez (várias linhas num campo só, separadas por " | ")
    const atual = String((s.payTerms || {}).wire_info || '').replace(/\n/g, ' | ');
    const v = prompt(pyT('wire_q'), atual); if (v === null) return;
    return roda(async () => {
      const r = await supabaseClient.rpc('admin_set_wire_info', { p_info: v.split('|').map((x) => x.trim()).filter(Boolean).join('\n') });
      if (r.error) throw new Error(/admin_set_wire_info|schema cache|Could not find/i.test(r.error.message || '') ? pyT('need333') : r.error.message);
      s.payTerms = Object.assign({}, s.payTerms, r.data || {});
    });
  }
}
function cxPayCss() {
  if (document.getElementById('cx-pay-css')) return;
  const st = document.createElement('style'); st.id = 'cx-pay-css';
  st.textContent = '.py-box{background:#fff;color:#2b2621;border-radius:14px;width:100%;max-width:520px;padding:20px 22px 16px;box-shadow:0 16px 50px rgba(0,0,0,.35);font-size:14px}'
    + '.py-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.py-head h3{margin:0;font-size:18px}.py-box h5{margin:16px 0 8px;font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;color:#8a8073}'
    + '.py-box button{margin:0;width:auto}.py-x{padding:2px 10px}'
    + '.py-op{display:flex;gap:10px;align-items:flex-start;border:1px solid #e0ddd6;border-radius:10px;padding:10px 12px;margin:0 0 8px;cursor:pointer;text-align:left;font-weight:400;color:#2b2621}.py-op.on{border-color:#2f6f4f;background:#f2f8f4}.py-op.off{opacity:.55;cursor:default}'
    + '.py-op input{width:16px;height:16px;min-width:16px;margin:2px 0 0;padding:0;flex:none}.py-op span{display:flex;flex-direction:column;gap:2px}.py-op small{color:#766f64;font-size:12px}'
    + '.py-sum{margin:14px 0 6px;border-top:1px solid #eee9e0;padding-top:10px}.py-l{display:flex;justify-content:space-between;gap:12px;padding:3px 0}.py-l b{font-weight:600;font-variant-numeric:tabular-nums}.py-l.d,.py-l.d b{color:#2f6f4f}'
    + '.py-l.g{border-top:2px solid #2b2621;margin-top:6px;padding-top:8px;font-size:17px}.py-l.g b{font-weight:800}'
    + '.py-go{background:#2f6f4f;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-weight:700;cursor:pointer;margin-top:10px!important}.py-go:disabled{opacity:.5}'
    + '.py-how{background:#f7f5f1;border-radius:10px;padding:12px 14px;margin-top:12px;line-height:1.7}.py-ok{color:#1f6b33;font-weight:600;margin:8px 0}'
    + '.py-foot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:16px;border-top:1px solid #eee9e0;padding-top:12px}.py-foot button{font-size:12.5px;padding:6px 10px}'
    + '.py-frisa{background:#fff4d6;border:1px solid #e6c15a;border-left:5px solid #c98a00;border-radius:8px;padding:9px 12px;margin:0 0 10px;font-weight:700;line-height:1.45;color:#5a4300}'
    + '.py-tag{font-style:normal;background:#2f6f4f;color:#fff;border-radius:20px;padding:1px 8px;font-size:11.5px;margin-left:4px}.py-l.h{color:#5b554c;font-size:13px}.py-l.h b{font-weight:700}'
    + '.py-wire{background:#fff;border:1px solid #e0ddd6;border-radius:8px;padding:8px 10px;margin:4px 0;font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap}';
  document.head.appendChild(st);
}
async function cxIvAction(a, b) {
  const s = cxState.scope; const id = b.getAttribute('data-id');
  const o = s && id ? s.orders.find((x) => x.id === id) : null;
  if (a === 'inv') return cxInvoice([id]);
  if (a === 'invgroup') return cxInvoice(Array.from(cxSel()));
  if (a === 'paylink') { if (o && o.payment_link) window.open(o.payment_link, '_blank', 'noopener'); return; }
  if (a === 'rcpt') return cxUploadReceipt(id);
  if (a === 'rcptview') return o && o.receipt_path ? cxSignedOpen('order-receipts', o.receipt_path) : null;
  if (a === 'setlink') {
    const v = prompt(ivT('link_q'), (o && o.payment_link) || ''); if (v === null || !o) return;
    const link = v.trim() || null;
    if (link && !/^https?:\/\//i.test(link)) return alert('https://…');
    const { error } = await supabaseClient.from('orders').update({ payment_link: link }).eq('id', id).select('id');
    if (error) return alert(error.message);
    o.payment_link = link; return mpRender();
  }
  if (a === 'taxrate') {
    const v = prompt(ivT('rate_q'), s && s.taxPct != null ? String(s.taxPct) : ''); if (v === null) return;
    const pct = v.trim() === '' ? null : Number(v.replace(',', '.'));
    if (pct != null && !(pct >= 0 && pct <= 30)) return alert('0–30');
    const { error } = await supabaseClient.rpc('admin_set_sales_tax', { p_pct: pct });
    if (error) return alert(error.message);
    s.taxPct = pct; s.orders.forEach((x) => { if (!x._proj) cxCalcTax(x, s); }); return mpRender();
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
  if (a === 'lostrow') {
    const id = b.getAttribute('data-id'); const ab = cxLostOpen();
    if (ab.has(id)) ab.delete(id); else { ab.add(id); const oo = cxAllRows().find((x) => x.id === id); if (oo && oo._pid) cxProjCardLoad(oo._pid).then(() => { if (typeof mpRender === 'function') mpRender(); }, () => {}); }
    if (typeof mpRender === 'function') mpRender();
    return;
  }
  if (a === 'release') return cxRelease(b.getAttribute('data-id'));
  if (a === 'lost' || a === 'reopen') {
    const ids = (b.getAttribute('data-ids') || '').split(',').filter(Boolean);
    const api = window.LegnoMinhaEmpresa;
    if (!api || !ids.length) return;
    b.disabled = true;
    (a === 'lost' ? api.marcarPerdido(ids, b.getAttribute('data-nome')) : api.reabrir(ids))
      // 23/11 (Matt: "coloquei perdido mas ainda ficou no mesmo status aqui
      // nos projetos"): a lista da Central fica em memória (scope) — sem
      // zerar, o projeto perdido continuava nela até o F5. O cartão aberto
      // dele fecha junto.
      .then((ok) => { if (ok) { cxState.lostLoaded = false; cxState.scope = null; try { ids.forEach((i) => cxProjOpen().delete(i)); } catch (e0) { /* sem cartão aberto */ } if (typeof mpLoad === 'function') mpLoad(); } else b.disabled = false; })
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
  if (a === 'sel' || a === 'selall') {
    e.stopPropagation();
    const sel = cxSel();
    if (a === 'sel') { const id = b.getAttribute('data-id'); if (sel.has(id)) sel.delete(id); else sel.add(id); }
    else { const vis = cxNetRows().filter((o) => !o._proj && o.status !== 'submitted'); const todos = vis.length && vis.every((o) => sel.has(o.id)); vis.forEach((o) => { if (todos) sel.delete(o.id); else sel.add(o.id); }); }
    return mpRender();
  }
  if (a === 'selclear') { cxSel().clear(); return mpRender(); }
  if (a === 'fmenu') { e.stopPropagation(); e.preventDefault(); const k = b.getAttribute('data-k'); cxState.fmenu = cxState.fmenu === k ? null : k; return mpRender(); }
  if (a === 'fact') {
    e.stopPropagation(); e.preventDefault();
    cxState.fmenu = null; mpRender();
    return cxFolderAction(b.getAttribute('data-v'), b.getAttribute('data-k'));
  }
  if (a === 'finv' || a === 'fqb') {
    e.stopPropagation(); e.preventDefault();
    const ids = cxFolderOrders(b.getAttribute('data-k')).map((o) => o.id);
    if (!ids.length) return;
    return a === 'finv' ? cxInvoice(ids) : cxQbAction('qbgroup', ids);
  }
  if (a === 'inativos') {
    const sc = cxState.scope; if (!sc || !sc.old) return;
    cxState.verInativos = !cxState.verInativos;
    sc.orders = cxState.verInativos ? sc.old : sc.live;
    sc.users = new Set(sc.orders.map((o) => o.client_user_id)).size;
    return mpRender();
  }
  if (a === 'ordmore') {
    e.stopPropagation(); e.preventDefault();
    const id = b.getAttribute('data-id'); const ab = cxOrdOpen();
    if (ab.has(id)) ab.delete(id); else { ab.add(id); const oo = cxState.scope && cxState.scope.orders.find((x) => x.id === id); if (oo && !oo._proj && oo.source_project_id) cxProjCardLoad(oo.source_project_id); }
    return mpRender();
  }
  if (a === 'ftoggle') {
    const k = b.getAttribute('data-k'); const fc = cxFolderClosed();
    if (fc.has(k)) fc.delete(k); else fc.add(k);
    cxState.fmenu = null;
    return mpRender();
  }
  if (a === 'folderq') {
    e.stopPropagation(); e.preventDefault();
    cxState.net.q = b.getAttribute('data-v') || ''; const inp = document.getElementById('cx-net-q'); if (inp) inp.value = cxState.net.q;
    return mpRender();
  }
  if (['inv', 'invgroup', 'paylink', 'setlink', 'rcpt', 'rcptview', 'taxrate'].includes(a)) { e.stopPropagation(); e.preventDefault(); return cxIvAction(a, b); }
  if (['qbinv', 'qbgroup', 'qbconn', 'qbsync'].includes(a)) { e.stopPropagation(); e.preventDefault(); return cxQbAction(a, b); }
  if (a === 'pj') {
    e.stopPropagation(); e.preventDefault();
    const o = cxState.scope && cxAllRows().find((x) => x.id === b.getAttribute('data-id'));
    if (o) cxProjAction(b.getAttribute('data-a'), o._proj ? o : (cxOrdProj(o) || o));
    return;
  }
  if (a === 'openproj') {
    e.stopPropagation();
    const o = cxState.scope && cxAllRows().find((x) => x.id === b.getAttribute('data-id'));
    if (!o) return;
    (async () => { try { const proj = { id: o._pid, name: o._pname }; await fetchProjectFullRow(proj); restoreFavoriteProject(proj); } catch (err) { alert((err && err.message) || String(err)); } })();
    return;
  }
  if (a === 'sendfab') { e.stopPropagation(); e.preventDefault(); return cxSendFactoryOpen(b.getAttribute('data-id')); }
  if (a === 'termsview') { e.stopPropagation(); e.preventDefault(); return LegnoOrderTerms.view(b.getAttribute('data-id')); }
  if (a === 'payopen') { e.stopPropagation(); e.preventDefault(); cxPayCss(); return cxPayOpen(b.getAttribute('data-id')); }
  if (a === 'rcpdf') { e.stopPropagation(); e.preventDefault(); return cxPickupReceipt(b.getAttribute('data-id'), b); }
  if (a === 'backproj') { e.stopPropagation(); e.preventDefault(); return cxBackToProject(b.getAttribute('data-id')); }
  if (a === 'delorder') { e.stopPropagation(); e.preventDefault(); return cxDeleteOrders([b.getAttribute('data-id')]); }
  if (a === 'delall') { e.stopPropagation(); e.preventDefault(); return cxDeleteOrders(cxExcluiveis().map((o) => o.id)); }
  if (a === 'relprod') return cxAdminRelease(b.getAttribute('data-id'), 'prod');
  if (a === 'relpick') return cxAdminRelease(b.getAttribute('data-id'), 'pick');
  if (a === 'reldone') return cxAdminRelease(b.getAttribute('data-id'), 'done');
  if (a === 'openorder') {
    const id = b.getAttribute('data-id');
    const o = cxState.scope && cxState.scope.orders.find((x) => x.id === id);
    if (o && o._proj) {
      if (e.target.closest && e.target.closest('.cx-projexp')) return;
      const set = cxProjOpen(); if (set.has(o._pid)) set.delete(o._pid); else { set.add(o._pid); cxProjCardLoad(o._pid); }
      mpRender(); if (typeof mpAttachCards === 'function') mpAttachCards();
      return;
    }
    if (!o) return;
    // "Open order →" do ▾ abre em OUTRA ABA do navegador (22/11, Matt: "deve abrir
    // uma tela nova, porque ele confunde indo pra mesma tela"): portal.html?order=<id>,
    // tratado no fim deste arquivo (cxAbrePedidoDoLink). Clique na LINHA continua
    // abrindo aqui mesmo.
    const doBotao = !!(e.target.closest && e.target.closest('.cx-ordexp'));
    if (o && o.client_user_id === cxMe() && doBotao) { e.stopPropagation(); e.preventDefault(); window.open(location.pathname + '?order=' + encodeURIComponent(id), '_blank'); return; }
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
    const f = cxState.net;
    if (cxHasNetwork() && !f.own && cxOn()) {
      // fábrica: as abas normais filtram a lista de TODO MUNDO (não as pastas dela)
      const t = e.target.closest('[data-act="ctab"]').dataset.tab;
      if (t !== 'archived') { f.fab = true; f.etapa = { all: '', build: 'build', prod: '_orders', done: 'done' }[t] || ''; cxState.netSort = (t === 'build' || t === 'prod') ? { col: 'num', dir: -1 } : { col: 'upd', dir: -1 }; e.stopPropagation(); e.preventDefault(); mpRender(); return; }
    }
    f.loja = ''; f.user = ''; f.cliente = '';
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
    '.cx-table .cx-mini{border:1px solid #cfc7ba;background:#fff;color:#3a332a;border-radius:5px;padding:2px 6px;font-size:10.5px;font-weight:600;cursor:pointer;margin:0 3px 0 0;white-space:nowrap;line-height:1.5}.cx-table .cx-mini:hover{background:#f3ece2}.cx-table .cx-mini-pay,.cx-table .cx-mini-pay:hover{background:#1f7a4d;color:#fff;border-color:#1f7a4d}.cx-table .cx-mini-ok{color:#1f7a4d;border-color:#9fd3b6}.cx-main td,.cx-main th{padding-left:7px;padding-right:7px}.cx-main th:first-child,.cx-main td:first-child{padding-left:12px}.cx-main td.cx-store{max-width:118px;overflow:hidden;text-overflow:ellipsis}.cx-main td:last-child{text-align:right}.cx-main td:last-child button.secondary{padding:2px 7px;font-size:10.5px;line-height:1.5}.cx-main td.cx-item{max-width:240px}.cx-main td.cx-quem{max-width:105px}.cx-wrap{overflow-x:auto}.cx-ck{width:26px;text-align:center}.cx-taxh{cursor:pointer;text-decoration:underline dotted}.cx-fold{display:inline-block;font-size:11px;background:#f3ece2;border-radius:4px;padding:1px 6px;margin-right:4px;cursor:pointer;color:#6b4a2a}.cx-selbar{display:flex;gap:12px;align-items:center;justify-content:flex-end;padding:10px 4px;font-weight:600}.cx-selbar .cx-sendfab{padding:7px 12px;font-size:12px}.cx-vazio td{text-align:center;color:var(--muted,#766f64);padding:22px 8px!important}.cx-pcard{display:flex;gap:16px;align-items:flex-start;padding:8px 0}.cx-pimg{width:210px;height:136px;border-radius:8px;background:#efe9df;object-fit:cover;flex:none;cursor:zoom-in;display:flex;align-items:center;justify-content:center;color:#a39a8c}.cx-pimg-0{cursor:default}.cx-pbody b{font-size:15px}.cx-pacts{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}.cx-projexp > td{background:#faf8f4;white-space:normal!important}.cx-projbox{display:flex;gap:12px;align-items:center;padding:6px 0}.mp-exp-box .po-myproj-card ~ .cx-projbox,.mp-exp-box .po-myproj-grid + .cx-projbox{display:none}.cx-main td,.cx-main th{white-space:nowrap}.cx-main td.cx-item{overflow:hidden;text-overflow:ellipsis}.cx-main td.cx-quem{overflow:hidden;text-overflow:ellipsis}.cx-stage + .cx-sendfab{margin-left:8px}.cx-sendfab{background:#2f6f4f;color:#fff;border:0;border-radius:5px;padding:3px 8px;font-size:10px;font-weight:700;letter-spacing:.02em;cursor:pointer;white-space:nowrap}.cx-sendfab:disabled{opacity:.45;cursor:default}',
    '#cx-sf{position:fixed;inset:0;background:rgba(20,16,10,.45);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px}',
    '.cx-sf-box{background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25)}.cx-sf-box h3{margin:0 0 8px}',
    '.cx-sf-sum{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px;margin:0 0 12px}.cx-sf-box label{display:block;font-size:12px;margin:8px 0;color:#5c554b}.cx-sf-box label input:not([type=checkbox]){display:block;width:100%;margin-top:4px;padding:8px;border:1px solid #d9d3c8;border-radius:6px;font-size:14px}.cx-sf-box label select{display:block;width:100%;margin:4px 0 0;padding:8px;border:1px solid #d9d3c8;border-radius:6px;font-size:14px;background:#fff;color:#2a251e;box-sizing:border-box}',
    '.cx-sf-terms{background:#fbf4ec;border:1px solid #e8cfb4;border-radius:8px;padding:10px 14px;margin:14px 0;font-size:13px;line-height:1.45}.cx-sf-terms p{margin:6px 0}',
    '.cx-sf-box label.cx-sf-ok{display:flex;gap:10px;align-items:flex-start;justify-content:flex-start;text-align:left;font-size:13px;font-weight:600;color:#2a251e;margin:0;cursor:pointer}.cx-sf-ok input[type=checkbox]{width:16px;height:16px;min-width:16px;margin:2px 0 0;padding:0;flex:none}.cx-sf-ok span{flex:1}.cx-sf-next{font-size:13px;color:#5c554b;margin:0 0 4px}.cx-sf-msg{min-height:18px;font-size:13px;margin:8px 0}.cx-sf-msg.err{color:#b42318}.cx-sf-acts{display:flex;justify-content:flex-end;gap:8px}.cx-sf-acts .cx-sendfab{padding:10px 16px;font-size:13px}',
    // PASTA BEM MARCADA (21/11, 2ª rodada — Matt: "esse último pedido parece que
    // faz parte da pasta, tem como deixar a pasta mais evidente"): faixa marrom
    // na esquerda da pasta E dos itens dela, itens recuados com fundo claro, e
    // uma linha grossa fechando a pasta. Item solto não tem faixa nem recuo.
    '.cx-table tr.cx-frow td{background:rgba(120,116,108,.09);border-top:1px solid #dddad4;font-weight:600;color:#6b665e;cursor:pointer;padding-top:6px;padding-bottom:6px}.cx-table tr.cx-frow td b{font-weight:600}.cx-table tr.cx-frow.cx-frow-0 td.cx-fname b{font-weight:500;font-style:italic}.cx-table tr.cx-frow td.cx-fname{position:relative;white-space:nowrap}'
    + '.cx-table tr.cx-frow td:first-child{box-shadow:inset 3px 0 0 #bdb9b1}'
    + '.cx-table tr.cx-in td{background:transparent}.cx-table tr.cx-in td:first-child{box-shadow:inset 3px 0 0 #dedbd5}'
    + '.cx-table tr.cx-in.cx-in-last td{border-bottom:1px solid #d3cfc8}.cx-table tr.cx-frow.is-closed td{border-bottom:1px solid #d3cfc8}'
    + '.cx-table tr.cx-in td.cx-num,.cx-table tr.cx-in td.cx-ck + td.cx-num{padding-left:38px}'
    + '.cx-fchev{display:inline-block;width:12px;color:#8a857c}.cx-fn{display:inline-block;min-width:18px;padding:0 6px;margin-left:4px;border-radius:9px;background:#e4e1db;color:#6b665e;font-size:11px;text-align:center}'
    + '.cx-fdots{border:1px solid #cfcbc4;background:#fff;color:#4a463f;font-size:20px;font-weight:700;line-height:1;padding:1px 12px 5px;margin:0 0 0 8px;cursor:pointer;border-radius:6px}.cx-fdots:hover{background:#e4e1db}'
    + '.cx-fmenu{position:absolute;left:180px;top:100%;z-index:30;background:#fff;border:1px solid #d9d3c8;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);padding:4px;display:flex;flex-direction:column;min-width:170px}'
    + '.cx-fmi{border:0;background:transparent;color:#2f2a24;text-align:left;padding:7px 10px;margin:0;font-size:12.5px;font-weight:500;border-radius:5px;cursor:pointer}.cx-fmi:hover{background:#f3ece0}.cx-fmi.is-danger{color:#a3352b}'
    + '.cx-paid{display:inline-block;margin-left:4px;padding:1px 7px;border-radius:9px;background:#dff1e2;color:#1f6b33;font-size:10.5px;font-weight:700;white-space:nowrap}.cx-paid.cx-paid-p{background:#fbeccc;color:#8a5a0a}'
    + '.cx-table .mp-chip{font-size:11.5px;padding:2px 9px}.cx-table .mp-chip.cx-ch-pay{background:#ece8fb;color:#5546b8}.cx-table td.cx-stcell .cx-mini{margin-left:6px}.cx-table td.cx-stcell>.mp-chip:first-child{display:inline-block;min-width:172px;box-sizing:border-box;text-align:center}.cx-table td.cx-next{white-space:nowrap}.cx-table td.cx-next .cx-mini,.cx-table td.cx-next .cx-sendfab{margin:0}'
    + '.cx-table td.cx-facts{text-align:right;white-space:nowrap}.cx-table td.cx-facts.cx-facts-l{text-align:left}'
    + '.cx-plost{padding:6px 2px 2px;white-space:normal}.cx-table .cx-mini.cx-mini-lost{border-color:#d9b3ad;color:#9a2b1e}.cx-table .cx-mini.cx-mini-lost:hover{background:#fbeeec}.cx-link.cx-link-del{color:#9a2b1e}.cx-oproj{padding:8px 4px 2px;white-space:normal}.cx-lote{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:5px;background:#2b2621;color:#fff;font-size:10.5px;font-weight:700;letter-spacing:.02em;vertical-align:middle}'
    + '.cx-table .cx-more{border:1px solid #cfc7ba;background:#fff;color:#3a332a;border-radius:6px;width:26px;height:24px;font-size:12px;line-height:1;cursor:pointer;padding:0}.cx-table .cx-more:hover,.cx-table .cx-more.is-on{background:#3a332a;color:#fff;border-color:#3a332a}'
    + '.cx-lmot{display:inline-block;padding:2px 9px;border-radius:999px;background:#f6e3df;color:#8a2f22;font-size:11.5px;font-weight:600}.cx-losttab .cx-lrow{cursor:pointer}.cx-more-lost{border:1px solid #cfc7ba;background:#fff;color:#3a332a;border-radius:6px;width:26px;height:24px;font-size:12px;line-height:1;cursor:pointer;padding:0;margin-left:6px;vertical-align:middle}.cx-more-lost:hover,.cx-more-lost.is-on{background:#3a332a;color:#fff;border-color:#3a332a}'
    + '.cx-table .cx-mini.cx-mini-go{background:#7a4a1e;border-color:#7a4a1e;color:#fff}.cx-table .cx-mini.cx-mini-go:hover{background:#5f3915}'
    + '.cx-table tr.cx-ord-on td{background:#faf6ee;border-bottom-color:transparent}'
    + '.cx-table tr.cx-ordexp td{background:#faf6ee;white-space:normal;padding:4px 14px 14px}'
    + '.cx-obox{display:flex;flex-wrap:wrap;gap:10px 40px}.cx-ocol{min-width:200px}.cx-ocol h5{margin:0 0 6px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#8a8073;font-weight:700}'
    + '.cx-okv{display:flex;gap:10px;font-size:12.5px;line-height:1.7}.cx-okv span{color:#8a8073;min-width:110px}.cx-okv b{font-weight:600;color:#2b251d}.cx-otools>div{margin-bottom:8px}'
    + '.cx-fstatus{margin-left:8px;font-weight:400}.cx-fquem{margin-left:8px;font-weight:400;font-size:11.5px;color:#7a6b55}',
    '.cx-table tfoot .cx-tot td{font-weight:700;border-top:2px solid var(--line,#d9d3c8);padding-top:10px;padding-bottom:10px;background:var(--panel-2,#faf8f4)}',
    '.cx-tagp{font-size:10px;text-transform:uppercase;letter-spacing:.05em;border:1px solid var(--border,#e0ddd6);border-radius:10px;padding:1px 6px;color:var(--muted,#766f64)}',
    '#cx-tree{margin:4px 0 12px}.cx-r{text-align:right;white-space:nowrap}.cx-loja{white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis}.cx-chip.cx-back{border-style:dashed}',
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

// portal.html?order=<id> (aberto pelo "Open order →" numa aba nova): espera o
// login, vai pra Central e abre a tela do pedido. Tira o parâmetro do endereço
// pra um F5 não reabrir à força.
(function cxAbrePedidoDoLink() {
  let id = null;
  try { id = new URLSearchParams(window.location.search).get('order'); } catch (e) { /* sem link */ }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
  let tent = 0;
  const tenta = () => {
    tent++;
    const pronto = typeof currentUser !== 'undefined' && currentUser && typeof openOrderDetail === 'function';
    if (!pronto) { if (tent < 60) setTimeout(tenta, 500); return; }
    try { const u = new URL(window.location.href); u.searchParams.delete('order'); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { /* fica */ }
    const tab = document.querySelector('.portal-tab-btn[data-tab="po-tab-my-orders"]'); if (tab) tab.click();
    setTimeout(() => { try { openOrderDetail(id); } catch (e) { console.error('[abrir pedido do link]', e); } }, 600);
  };
  setTimeout(tenta, 800);
})();

window.LegnoCentralPlus = { ligado: cxOn, recarregar: () => { cxState.scope = null; cxState.extraFor = ''; cxState.lostLoaded = false; if (typeof mpLoad === 'function') mpLoad(); } };

// BOTÃO "Enviar pro pedido" DO EDITOR ESCONDIDO (22/11, Matt, com print do
// aviãozinho da barra do Projetos: "ocultar esse pedido, vamos pela central
// só"). Some só pra quem TEM a Central nova (cxOn — hoje o admin, por causa do
// CX_SO_ADMIN): quem ainda não tem o ENVIAR FÁBRICA da Central continua com o
// botão, senão ficaria sem nenhum jeito de mandar pedido. Com CX_SO_ADMIN =
// false ele some pra todo mundo. Só esconde — sendProjectToOrder não mudou (é
// ele que o ENVIAR FÁBRICA usa). Voltar o botão: localStorage.legno_envio_editor = '1'.
(function cxEscondeEnvioDoEditor() {
  try {
    const st = document.createElement('style'); st.id = 'cx-envio-css';
    st.textContent = 'body.cx-envio-central #po-proj-send-to-order-btn{display:none !important}';
    document.head.appendChild(st);
  } catch (e) { return; }
  const aplica = () => {
    let liga = false;
    try { liga = cxOn() && localStorage.getItem('legno_envio_editor') !== '1'; } catch (e) { liga = false; }
    if (document.body) document.body.classList.toggle('cx-envio-central', !!liga);
  };
  aplica();
  setInterval(aplica, 2000);
})();
