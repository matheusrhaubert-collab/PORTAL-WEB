// ============================================================
// Pedido vindo do PROMOB — botão "Importar PROMOB" na aba Orders da Central
// ============================================================
// Matt, 27/11/2026: "quero subir projetos do PROMOB para central de pedidos...
// hoje 100% dos projetos vem do LEGNO STUDIO... o fluxo do promob só cria um
// projeto (não abre visualizador nenhum), puxa xml com preço e nome do projeto,
// linkado para cada cliente/dealer. Eu só quero controlar os pagamentos,
// produção e entrega... o cliente mesmo deverá importar o xml, em botão
// importar PROMOB (só na orders). Aí ele coloca um nome pro projeto (vai na
// etiqueta) e segue fluxo que já conhecemos hoje."
// + "preciso liberar só pra alguns dealers o promob... configurado lá em
// people, um botão ativando a função" → accounts.promob_enabled (migration 352),
// botão PROMOB na árvore de People (portal-43, só admin). Aqui o botão só
// aparece quando a RPC my_promob_enabled() diz sim (admin sempre).
//
// FLUXO: escolhe o XML → prévia (itens, total) → PO / ambiente / endereço →
// Termos do Pedido (order-terms.js, mesmo aceite do SEND TO FACTORY) → cria o
// pedido (orders.order_type = 'promob', status submitted), grava os itens em
// order_items, registra o aceite e aprova. Aprovado = número de fábrica
// (migration 287) e preço congelado (306/352). Daí pra frente é o fluxo de
// sempre: invoice, Pay, Release production, lote, embalagem, coleta.
//
// XML DO PROMOB (exemplo do Matt: "Liliane - Dining Room (Toledo).xml"):
//   <LISTING ID="pedido"> <PROJECTGUID GUID/> <TOTALPRICES TABLE="2662.1"/>
//   <AMBIENTS><AMBIENT DESCRIPTION="Projeto - ..."><CATEGORIES><CATEGORY DESCRIPTION="CABINETS">
//   <ITEMS><ITEM DESCRIPTION REFERENCE QUANTITY WIDTH HEIGHT DEPTH>
//     <PRICE TOTAL="0" TOTALCOMPONENTS="280.43"/>   ← preço da linha = TOTAL + TOTALCOMPONENTS
//     <ITEMS> peças do módulo (já somadas no TOTALCOMPONENTS — não entram)
//   Conferido no exemplo: soma das linhas = total de cada categoria = total do XML.
//   Os valores do XML são USD (tabela "PROMOB LEGNO ... (EUA)"), apesar do
//   CURRENCYSYMBOL="R$" que o Promob grava.
//
// PEÇAS: os itens NÃO viram peças de corte (breakdown vazio). A lista de peças
// do plano de corte é subida pela fábrica no ERP, ligada ao pedido.
// Precisa da migration 352. Backup: _backup_promob_pedido_2026-11-27/.

const PB_TXT = {
  pt: { btn: '⇪ Importar PROMOB', title: 'Importar pedido do PROMOB', file: 'Arquivo XML do PROMOB *', items: '{n} itens', total: 'Total do XML', table: 'Tabela',
    po: 'Nome do projeto / PO (vai na etiqueta) *', client: 'Cliente', room: 'Ambiente', addr: 'Endereço da obra *', store: 'Loja (dealer) *', store_pick: '— escolha a loja —',
    cat: 'Categoria', item: 'Item', qty: 'Qtd', price: 'Valor', note: 'O pedido PROMOB não abre visualizador: entram só os itens e o valor do XML. A lista de peças pro corte é ligada pela fábrica.',
    disc: 'Os descontos de pagamento (Zelle/wire e pagamento total) entram na hora de pagar, como nos outros pedidos.',
    need: 'Escolha o XML e preencha o nome do projeto e o endereço da obra.', need_store: 'Escolha a loja do pedido.',
    bad: 'Este arquivo não parece um XML de pedido do PROMOB.', empty: 'O XML não tem itens com preço.',
    mismatch: 'A soma dos itens ({s}) não bate com o total do XML ({t}). Gere o XML de novo no PROMOB.',
    dup: 'Este projeto do PROMOB já foi importado antes (pedido {n}). Importar de novo cria um pedido DUPLICADO. Continuar mesmo assim?',
    store_off: 'Esta loja ainda não tem o PROMOB liberado (People › botão PROMOB). Libere antes de importar.',
    s_order: 'Criando o pedido…', s_items: 'Gravando os itens…', s_rel: 'Enviando pra fábrica…', done: 'Pedido {n} criado e enviado pra fábrica.',
    need352: 'O banco ainda não aceita pedido PROMOB — rode a migration 352 no Supabase.', denied: 'O PROMOB não está liberado para a sua loja. Fale com a fábrica.', cancel: 'Cancelar', go: 'CONTINUAR →', go0: 'CRIAR PEDIDO' },
  en: { btn: '⇪ Import PROMOB', title: 'Import PROMOB order', file: 'PROMOB XML file *', items: '{n} items', total: 'XML total', table: 'Price table',
    po: 'Project name / PO (goes on the label) *', client: 'Client', room: 'Room', addr: 'Job site address *', store: 'Store (dealer) *', store_pick: '— pick the store —',
    cat: 'Category', item: 'Item', qty: 'Qty', price: 'Amount', note: 'A PROMOB order has no viewer: only the XML items and amount come in. The factory links the cutting parts list.',
    disc: 'Payment discounts (Zelle/wire and full payment) apply at payment, like any other order.',
    need: 'Choose the XML and fill in the project name and job site address.', need_store: 'Pick the store for this order.',
    bad: 'This file does not look like a PROMOB order XML.', empty: 'The XML has no priced items.',
    mismatch: 'The items add up to {s}, but the XML total is {t}. Export the XML again from PROMOB.',
    dup: 'This PROMOB project was already imported (order {n}). Importing again creates a DUPLICATE order. Continue anyway?',
    store_off: 'This store does not have PROMOB enabled yet (People › PROMOB button). Enable it before importing.',
    s_order: 'Creating the order…', s_items: 'Saving the items…', s_rel: 'Sending to the factory…', done: 'Order {n} created and sent to the factory.',
    need352: 'The database does not accept PROMOB orders yet — run migration 352 in Supabase.', denied: 'PROMOB is not enabled for your store. Please contact the factory.', cancel: 'Cancel', go: 'CONTINUE →', go0: 'CREATE ORDER' },
  es: { btn: '⇪ Importar PROMOB', title: 'Importar pedido de PROMOB', file: 'Archivo XML de PROMOB *', items: '{n} ítems', total: 'Total del XML', table: 'Tabla',
    po: 'Nombre del proyecto / PO (va en la etiqueta) *', client: 'Cliente', room: 'Ambiente', addr: 'Dirección de la obra *', store: 'Tienda (dealer) *', store_pick: '— elija la tienda —',
    cat: 'Categoría', item: 'Ítem', qty: 'Cant', price: 'Valor', note: 'El pedido PROMOB no abre visor: entran solo los ítems y el valor del XML. La fábrica vincula la lista de piezas de corte.',
    disc: 'Los descuentos de pago (Zelle/wire y pago total) se aplican al pagar, como en los demás pedidos.',
    need: 'Elija el XML y complete el nombre del proyecto y la dirección de la obra.', need_store: 'Elija la tienda del pedido.',
    bad: 'Este archivo no parece un XML de pedido de PROMOB.', empty: 'El XML no tiene ítems con precio.',
    mismatch: 'La suma de los ítems ({s}) no coincide con el total del XML ({t}). Genere el XML de nuevo en PROMOB.',
    dup: 'Este proyecto de PROMOB ya fue importado (pedido {n}). Importar de nuevo crea un pedido DUPLICADO. ¿Continuar?',
    store_off: 'Esta tienda aún no tiene PROMOB habilitado (People › botón PROMOB). Habilítelo antes de importar.',
    s_order: 'Creando el pedido…', s_items: 'Guardando los ítems…', s_rel: 'Enviando a fábrica…', done: 'Pedido {n} creado y enviado a fábrica.',
    need352: 'La base aún no acepta pedidos PROMOB — ejecute la migration 352 en Supabase.', denied: 'PROMOB no está habilitado para su tienda. Contacte a la fábrica.', cancel: 'Cancelar', go: 'CONTINUAR →', go0: 'CREAR PEDIDO' }
};
function pbT(k, v) {
  const L = PB_TXT[(typeof cxLang === 'function' && cxLang()) || 'en'] || PB_TXT.en;
  let t = L[k] != null ? L[k] : (PB_TXT.en[k] || k);
  Object.keys(v || {}).forEach((x) => { t = t.split('{' + x + '}').join(v[x]); });
  return t;
}
function pbEsc(s) { return typeof cEsc === 'function' ? cEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function pbMoney(v) { return typeof cMoney === 'function' ? cMoney(v) : '$' + Number(v || 0).toFixed(2); }
function pbR2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

// ---------- quem pode importar ----------
// admin sempre; dealer só com a loja ligada (People › PROMOB); vendedor nunca
// (não envia pra produção). Resposta do banco guardada por login.
const pbState = { uid: null, ok: null, busy: false };
function pbPode() {
  if (typeof currentUser === 'undefined' || !currentUser) return false;
  if (typeof cxSeller === 'function' && cxSeller() && !(typeof cxAdmin === 'function' && cxAdmin())) return false;
  if (pbState.uid !== currentUser.id) { pbState.uid = currentUser.id; pbState.ok = null; }
  if (pbState.ok === null && !pbState.busy) {
    pbState.busy = true;
    supabaseClient.rpc('my_promob_enabled').then((r) => {
      pbState.busy = false;
      pbState.ok = !r.error && r.data === true;   // sem a 352: ninguém vê
      if (pbState.ok && typeof cxState !== 'undefined' && cxState.net && cxState.net.etapa === '_orders' && typeof mpRender === 'function') mpRender();
    }, () => { pbState.busy = false; pbState.ok = false; });
  }
  return pbState.ok === true;
}

// ---------- leitura do XML ----------
function pbKids(el, tag) { const out = []; if (!el) return out; for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (c.nodeName === tag) out.push(c); return out; }
function pbKid(el, tag) { return pbKids(el, tag)[0] || null; }
function pbNum(v) { const n = Number(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : 0; }
function pbParse(texto, nomeArquivo) {
  const doc = new DOMParser().parseFromString(texto, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'LISTING' || doc.getElementsByTagName('parsererror').length || !pbKid(root, 'ABOUTPROMOB')) throw new Error(pbT('bad'));
  const dados = {};
  pbKids(pbKid(root, 'CUSTOMERSDATA'), 'DATA').forEach((d) => { dados[d.getAttribute('ID')] = d.getAttribute('VALUE') || ''; });
  let tabela = '';
  pbKids(pbKid(root, 'METADATAS'), 'METADATA').forEach((m) => { if (m.getAttribute('ID') === 'ONLINETABLEPRICE') tabela = m.getAttribute('VALUE') || ''; });
  const tp = pbKid(root, 'TOTALPRICES');
  const totalXml = tp ? pbNum(tp.getAttribute('TABLE')) : 0;
  const itens = []; const ambientes = [];
  pbKids(pbKid(root, 'AMBIENTS'), 'AMBIENT').forEach((amb) => {
    const ambNome = String(amb.getAttribute('DESCRIPTION') || '').replace(/^\s*Projeto\s*-\s*/i, '').trim();
    if (ambNome) ambientes.push(ambNome);
    pbKids(pbKid(amb, 'CATEGORIES'), 'CATEGORY').forEach((cat) => {
      const catNome = cat.getAttribute('DESCRIPTION') || '';
      pbKids(pbKid(cat, 'ITEMS'), 'ITEM').forEach((it) => {
        const p = pbKid(it, 'PRICE');
        const total = pbR2(p ? pbNum(p.getAttribute('TOTAL')) + pbNum(p.getAttribute('TOTALCOMPONENTS')) : 0);
        const qtd = Math.max(1, Math.round(pbNum(it.getAttribute('QUANTITY')) || 1));
        itens.push({
          cat: catNome, amb: ambNome,
          desc: String(it.getAttribute('DESCRIPTION') || it.getAttribute('REFERENCE') || '—').replace(/\s+/g, ' ').trim(),
          ref: it.getAttribute('REFERENCE') || '',
          qtd, w: pbNum(it.getAttribute('WIDTH')), h: pbNum(it.getAttribute('HEIGHT')), d: pbNum(it.getAttribute('DEPTH')),
          total
        });
      });
    });
  });
  const guidEl = pbKid(root, 'PROJECTGUID');
  return {
    guid: guidEl ? guidEl.getAttribute('GUID') || '' : '',
    file: nomeArquivo || '', totalXml: pbR2(totalXml), soma: pbR2(itens.reduce((t, i) => t + i.total, 0)), tabela,
    data: [root.getAttribute('DATE'), root.getAttribute('HOUR')].filter(Boolean).join(' '),
    cliente: dados.nomecliente || dados.corporateName || '',
    nome: ambientes[0] || dados.nomecliente || String(nomeArquivo || '').replace(/\.xml$/i, ''),
    ambienteXml: dados.Environment || '',
    itens
  };
}

// ---------- janela ----------
function pbCss() {
  if (document.getElementById('pb-css')) return;
  const st = document.createElement('style'); st.id = 'pb-css';
  st.textContent = [
    '.cx-orig{display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:999px;white-space:nowrap}',
    '.cx-orig-studio{background:#efe9e1;color:#7a5a3a}', '.cx-orig-promob{background:#e3eefb;color:#1f5fa8}',
    '.pb-bar{display:flex;justify-content:flex-end;margin:0 0 8px}',
    '.pb-bar button{width:auto;background:#1f5fa8;color:#fff;border:0;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer;font-size:13px}',
    '#pb-imp{position:fixed;inset:0;background:rgba(20,16,12,.45);z-index:10050;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:40px 12px}',
    '#pb-imp .pb-box{background:#fff;color:#2b2520;border-radius:12px;max-width:760px;width:100%;padding:20px 22px;box-shadow:0 18px 50px rgba(0,0,0,.25)}',
    '#pb-imp h3{margin:0 0 12px}', '#pb-imp label{display:block;margin:8px 0;font-size:13px;font-weight:600}',
    '#pb-imp input:not([type=file]),#pb-imp select{width:100%;box-sizing:border-box;margin-top:4px}',
    '#pb-imp .pb-sum{display:flex;flex-wrap:wrap;gap:6px 18px;background:#f6f3ee;border-radius:8px;padding:8px 12px;margin:8px 0;font-size:13px}',
    '#pb-imp .pb-list{max-height:220px;overflow:auto;border:1px solid #e6e1d8;border-radius:8px;margin:6px 0 10px}',
    '#pb-imp .pb-list table{width:100%;border-collapse:collapse;font-size:12px}',
    '#pb-imp .pb-list th,#pb-imp .pb-list td{padding:4px 8px;border-bottom:1px solid #f0ece5;text-align:left;white-space:nowrap}',
    '#pb-imp .pb-list td.r,#pb-imp .pb-list th.r{text-align:right}', '#pb-imp .pb-list td.d{white-space:normal}',
    '#pb-imp .pb-hint{font-size:12px;color:#6b625a;margin:4px 0}', '#pb-imp .pb-msg{min-height:18px;font-size:13px;margin:8px 0 0}', '#pb-imp .pb-msg.err{color:#b42318}',
    '#pb-imp .pb-acts{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}', '#pb-imp .pb-acts button{width:auto}',
    '#pb-imp .pb-go{background:#2f6f4f;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}', '#pb-imp .pb-go:disabled{opacity:.45;cursor:default}'
  ].join('\n');
  document.head.appendChild(st);
}

// lojas com PROMOB ligado (só o admin lê direto) — pro seletor de loja do admin
async function pbLojasLigadas() {
  try { const r = await supabaseClient.from('accounts').select('id, trade_name, legal_name, promob_enabled').eq('promob_enabled', true); return r.error ? null : (r.data || []); } catch (e) { return null; }
}

async function pbOpen() {
  if (typeof isRetailClientAccount === 'function' && isRetailClientAccount()) { if (typeof showBecomeDealerModal === 'function') showBecomeDealerModal(); return; }
  pbCss();
  const old = document.getElementById('pb-imp'); if (old) old.remove();
  const adm = typeof cxAdmin === 'function' && cxAdmin();
  // admin: escolhe a loja (só as com PROMOB ligado)
  let lojasHtml = '';
  if (adm) {
    const lojas = (await pbLojasLigadas()) || [];
    lojas.sort((a, b) => String(a.trade_name || a.legal_name || '').localeCompare(String(b.trade_name || b.legal_name || '')));
    lojasHtml = '<label>' + pbEsc(pbT('store')) + '<select id="pb-store"><option value="">' + pbEsc(pbT('store_pick')) + '</option>'
      + lojas.map((a) => '<option value="' + pbEsc(a.id) + '">' + pbEsc(a.trade_name || a.legal_name || '—') + '</option>').join('') + '</select></label>'
      + (lojas.length ? '' : '<p class="pb-hint">' + pbEsc(pbT('store_off')) + '</p>');
  }
  const w = document.createElement('div'); w.id = 'pb-imp';
  w.innerHTML = '<div class="pb-box" role="dialog" aria-modal="true"><h3>' + pbEsc(pbT('title')) + '</h3>'
    + '<label>' + pbEsc(pbT('file')) + '<br><input type="file" id="pb-file" accept=".xml,text/xml,application/xml"></label>'
    + '<div id="pb-prev"></div>'
    + lojasHtml
    + '<label>' + pbEsc(pbT('po')) + '<input id="pb-po" maxlength="60"></label>'
    + '<label>' + pbEsc(pbT('client')) + '<input id="pb-cli" maxlength="120"></label>'
    + '<label>' + pbEsc(pbT('room')) + '<select id="pb-room-sel">' + (typeof cxRoomOptions === 'function' ? cxRoomOptions('') : '<option value="">—</option>') + '</select>'
    + '<input id="pb-room" maxlength="60" style="display:none;margin-top:6px"></label>'
    + '<label>' + pbEsc(pbT('addr')) + '<input id="pb-addr" maxlength="200"></label>'
    + (typeof sfT === 'function' ? '<div class="cx-sf-terms"><p>⛔ ' + pbEsc(sfT('t2')) + '</p><p>📐 ' + pbEsc(sfT('t3')) + '</p><p>🧾 ' + pbEsc(sfT('t4')) + '</p></div>' : '')
    + '<p class="pb-hint">' + pbEsc(pbT('note')) + ' ' + pbEsc(pbT('disc')) + '</p>'
    + '<p class="pb-msg" id="pb-msg"></p>'
    + '<div class="pb-acts"><button type="button" class="secondary" id="pb-cancel">' + pbEsc(pbT('cancel')) + '</button>'
    + '<button type="button" class="pb-go" id="pb-go" disabled>' + pbEsc(pbT(window.LegnoOrderTerms ? 'go' : 'go0')) + '</button></div></div>';
  document.body.appendChild(w);
  const $ = (q) => w.querySelector(q);
  const st = { dados: null };
  const setMsg = (t, err) => { $('#pb-msg').textContent = t || ''; $('#pb-msg').classList.toggle('err', !!err); };
  const pronto = () => { $('#pb-go').disabled = !(st.dados && $('#pb-po').value.trim() && $('#pb-addr').value.trim() && (!$('#pb-store') || $('#pb-store').value)); };
  ['#pb-po', '#pb-addr', '#pb-store'].forEach((q) => { const el = $(q); if (el) { el.addEventListener('input', pronto); el.addEventListener('change', pronto); } });
  const salaSel = $('#pb-room-sel');
  const salaTroca = () => { const outro = salaSel.value === '_other'; $('#pb-room').style.display = outro ? '' : 'none'; if (outro) $('#pb-room').focus(); };
  salaSel.addEventListener('change', salaTroca);
  const sala = () => (salaSel.value === '_other' ? $('#pb-room').value.trim() : salaSel.value);
  $('#pb-file').addEventListener('change', async () => {
    st.dados = null; $('#pb-prev').innerHTML = ''; setMsg(''); pronto();
    const f = $('#pb-file').files && $('#pb-file').files[0]; if (!f) return;
    try {
      const d = pbParse(await f.text(), f.name);
      if (!d.itens.length || d.soma <= 0) throw new Error(pbT('empty'));
      if (d.totalXml > 0 && Math.abs(d.soma - d.totalXml) > 0.05) throw new Error(pbT('mismatch', { s: pbMoney(d.soma), t: pbMoney(d.totalXml) }));
      st.dados = d;
      $('#pb-prev').innerHTML = '<div class="pb-sum"><span>' + pbEsc(pbT('items', { n: d.itens.length })) + '</span><span>' + pbEsc(pbT('total')) + ': <b>' + pbEsc(pbMoney(d.soma)) + '</b></span>'
        + (d.tabela ? '<span>' + pbEsc(pbT('table')) + ': ' + pbEsc(d.tabela) + '</span>' : '') + '</div>'
        + '<div class="pb-list"><table><thead><tr><th>' + pbEsc(pbT('cat')) + '</th><th>' + pbEsc(pbT('item')) + '</th><th class="r">' + pbEsc(pbT('qty')) + '</th><th class="r">' + pbEsc(pbT('price')) + '</th></tr></thead><tbody>'
        + d.itens.map((i) => '<tr><td>' + pbEsc(i.cat) + '</td><td class="d">' + pbEsc(i.desc) + '</td><td class="r">' + i.qtd + '</td><td class="r">' + pbEsc(pbMoney(i.total)) + '</td></tr>').join('') + '</tbody></table></div>';
      if (!$('#pb-po').value.trim()) $('#pb-po').value = d.nome.slice(0, 60);
      if (!$('#pb-cli').value.trim()) $('#pb-cli').value = d.cliente.slice(0, 120);
      if (!salaSel.value && typeof cxRoomOptions === 'function') { salaSel.innerHTML = cxRoomOptions(d.nome + ' ' + d.ambienteXml); salaTroca(); }
    } catch (e) { setMsg((e && e.message) || String(e), true); }
    pronto();
  });
  const fecha = () => { if (!w.dataset.busy) w.remove(); };
  $('#pb-cancel').addEventListener('click', fecha);   // clicar fora NÃO fecha (regra de 21/11 pra janela com formulário)
  $('#pb-go').addEventListener('click', () => pbRun(w, st.dados, {
    po: $('#pb-po').value.trim(), cliente: $('#pb-cli').value.trim(), room: sala(), addr: $('#pb-addr').value.trim(),
    store: $('#pb-store') ? $('#pb-store').value : ''
  }, setMsg));
}

async function pbRun(w, d, f, setMsg) {
  const adm = typeof cxAdmin === 'function' && cxAdmin();
  if (!d || !f.po || !f.addr) return setMsg(pbT('need'), true);
  if (adm && w.querySelector('#pb-store') && !f.store) return setMsg(pbT('need_store'), true);
  const sb = supabaseClient;
  // importado de novo? (mesmo projeto do Promob = mesmo GUID)
  if (d.guid) {
    try {
      const r = await sb.from('orders').select('id, factory_number, po_name').eq('order_type', 'promob').eq('promob_meta->>guid', d.guid).limit(1);
      if (!r.error && r.data && r.data.length) {
        const x = r.data[0];
        if (!confirm(pbT('dup', { n: Number(x.factory_number) > 0 ? String(Number(x.factory_number)).padStart(5, '0') : (x.po_name || '?') }))) return;
      }
    } catch (e) { /* sem a 352: o insert abaixo avisa */ }
  }
  let termos = null;
  if (window.LegnoOrderTerms) {
    termos = await LegnoOrderTerms.ask({ ref: f.po, owner: currentUser.id });
    if (!termos) return;
  }
  w.dataset.busy = '1';
  w.querySelectorAll('button, input, select').forEach((el) => { el.disabled = true; });
  let orderId = null;
  try {
    setMsg(pbT('s_order'));
    const agora = new Date().toISOString();
    const a = (typeof cxState !== 'undefined' && cxState.acc) || {};
    const pedido = {
      client_user_id: currentUser.id, client_email: currentUser.email,
      order_type: 'promob', status: 'submitted', submitted_at: agora,
      po_name: f.po.slice(0, 120), client_name: (f.cliente || a.trade_name || a.legal_name || f.po).slice(0, 120),
      room_name: f.room || null, delivery_address: f.addr,
      promob_meta: { guid: d.guid || null, file: d.file || null, xml_total: d.totalXml, price_table: d.tabela || null, xml_date: d.data || null, items: d.itens.length, imported_at: agora }
    };
    if (a.phone) pedido.client_phone = a.phone;
    if (adm && f.store) pedido.account_id = f.store;   // admin: o pedido vai pra loja escolhida (como o ⇄ da Central)
    const r1 = await sb.from('orders').insert(pedido).select('id').single();
    if (r1.error) {
      const m = r1.error.message || '';
      if (/row-level security|violates row/i.test(m)) throw new Error(pbT('denied'));
      if (/order_type|promob_meta|check constraint/i.test(m)) throw new Error(pbT('need352'));
      throw r1.error;
    }
    orderId = r1.data.id;
    setMsg(pbT('s_items'));
    const linhas = d.itens.map((i, n) => ({
      order_id: orderId,
      module_name: i.desc.slice(0, 200),
      module_description: [i.cat, i.ref, i.amb].filter(Boolean).join(' · ').slice(0, 300),
      width_mm: i.w, height_mm: i.h, depth_mm: i.d,
      quantity: i.qtd, unit_price: pbR2(i.total / i.qtd), total_price: i.total,
      breakdown: [],   // sem peças de módulo: o corte vem da lista que a fábrica sobe no ERP
      sort_order: n
    }));
    for (let i = 0; i < linhas.length; i += 200) {
      const r2 = await sb.from('order_items').insert(linhas.slice(i, i + 200));
      if (r2.error) throw r2.error;
    }
    if (termos) await LegnoOrderTerms.record([orderId], termos);
    setMsg(pbT('s_rel'));
    const upd = { status: 'approved', approved_at: agora };
    if (termos) Object.assign(upd, { terms_accepted_at: agora, terms_accepted_by: currentUser.id, terms_version: LegnoOrderTerms.version || null });
    try { if (typeof cxGeocode === 'function') { const g = await cxGeocode(f.addr); if (g) { upd.jobsite_lat = g.lat; upd.jobsite_lng = g.lng; upd.jobsite_geocoded_at = agora; } } } catch (e) { /* sem mapa */ }
    const r3 = await sb.from('orders').update(upd).eq('id', orderId).eq('status', 'submitted').select('id, factory_number');
    if (r3.error) throw r3.error;
    const fn = r3.data && r3.data[0] && Number(r3.data[0].factory_number) > 0 ? String(Number(r3.data[0].factory_number)).padStart(5, '0') : f.po;
    delete w.dataset.busy; w.remove();
    alert(pbT('done', { n: fn }));
  } catch (e) {
    // pedido criado mas sem itens = apaga (ainda está submitted, sem aceite)
    if (orderId) {
      try {
        const chk = await sb.from('order_items').select('id', { count: 'exact', head: true }).eq('order_id', orderId);
        if (!chk.error && !chk.count) await sb.from('orders').delete().eq('id', orderId).eq('status', 'submitted');
      } catch (e2) { /* fica pendente; dá pra excluir na Central */ }
    }
    delete w.dataset.busy;
    w.querySelectorAll('button, input, select').forEach((el) => { el.disabled = false; });
    setMsg((e && e.message) || String(e), true);
    return;
  } finally {
    if (typeof cxState !== 'undefined') cxState.scope = null;
    if (typeof myOrdersLoaded !== 'undefined') myOrdersLoaded = false;
    if (!document.getElementById('pb-imp') && typeof mpLoad === 'function') mpLoad();
  }
}

// ---------- botão na aba Orders ----------
(function () {
  if (typeof cxRenderNet !== 'function') { console.warn('[promob] portal-44 não carregado'); return; }
  pbCss();
  const orig = cxRenderNet;
  cxRenderNet = function (p) {
    orig.apply(this, arguments);
    try {
      if (!p || !cxState.scope || !cxState.net || cxState.net.etapa !== '_orders' || !pbPode()) return;
      const bar = document.createElement('div'); bar.className = 'pb-bar';
      bar.innerHTML = '<button type="button" id="pb-open-btn">' + pbEsc(pbT('btn')) + '</button>';
      p.insertBefore(bar, p.firstChild);
      bar.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); pbOpen(); });
    } catch (e) { console.warn('[promob] botão', e); }
  };
})();
