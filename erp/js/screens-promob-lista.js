/* Legno ERP — Produção › Lista PROMOB (27/11/2026, migration 353)
   ------------------------------------------------------------------
   Matt: "no erp vou subir uma listagem de peças pro plano de corte, linkada a
   cada projeto. e depois o sistema faz o apontamento conforme já existe hoje
   e o controle de produção na central como já conhecemos."

   O pedido PROMOB (portal-52, orders.order_type 'promob') chega só com os
   itens e o preço do XML — sem peças. Aqui a fábrica sobe o CSV do lote do
   PROMOB e cada projeto do arquivo vira a lista de corte (public.
   cutting_list_items) de um pedido PROMOB. O lote lê dali (data-lotes.js
   explodeOrders trata 'promob' como 'cutting_list').

   CSV DO PROMOB (exemplos Lote_537/538/539.csv) — ";" sem cabeçalho:
     0 nº · 1 qtd · 2 comprimento · 3 largura · 4 material ("STONE GREY19")
     5 descrição ("C3X001 - STRETCHER 461 X 76 X 19 (X16001 - OPEN CABINET ...)")
     6 fita/usinagem ("4L c/ furos", "2C", "Enc. para duplagem")
     7 id da peça · 8 id do módulo (igual pras peças do mesmo módulo)
     9 projeto ("1964-Liliane - Hall (Toledo) Liliane") — VÁRIOS por arquivo
     10 veio (0/1) · 11 nº do lote no PROMOB · 12 fita: B4 = 4 lados, ==== = 2 comprimentos, SB = sem
   Comprimento vem primeiro (regra da fábrica: comprimento = sentido do veio).
   Material → cor do cadastro: tira o número do fim ("STONE GREY19" → STONE GREY)
   e procura pelo nome; o que não achar a fábrica escolhe (fica lembrado neste
   navegador, igual ao importador .promob do portal). */

const PROMOBL = {};
PROMOBL.MAPA_KEY = 'legno_promob_csv_cor_v1';
PROMOBL._st = null;   // { pedidos, cores, grupos, porPedido }

PROMOBL.load = async function () {
  const sb = DATA.sb();
  const r = await sb.from('orders').select('id, factory_number, po_name, client_name, status, account_id, promob_meta, created_at')
    .eq('order_type', 'promob').order('created_at', { ascending: false }).limit(400);
  if (r.error) return { err: /order_type|promob_meta/.test(r.error.message || '') ? 'Rode a migration 352 no Supabase (pedido PROMOB).' : r.error.message };
  const pedidos = r.data || [];
  const ids = pedidos.map(function (o) { return o.id; });
  const contagem = {};
  for (let i = 0; i < ids.length; i += 150) {
    const c = await sb.from('cutting_list_items').select('order_id, quantity').in('order_id', ids.slice(i, i + 150));
    (c.data || []).forEach(function (x) { const k = contagem[x.order_id] || (contagem[x.order_id] = { linhas: 0, pecas: 0 }); k.linhas++; k.pecas += Number(x.quantity) || 0; });
  }
  const lote = {};
  try {
    const bo = await LOTES.erp().from('batch_orders').select('order_id, batches(code)').in('order_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    (bo.data || []).forEach(function (x) { lote[x.order_id] = (x.batches && x.batches.code) || '?'; });
  } catch (e) { /* sem lote */ }
  const lojas = {};
  const acc = pedidos.map(function (o) { return o.account_id; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
  if (acc.length) { try { const a = await sb.from('accounts').select('id, trade_name, legal_name').in('id', acc); (a.data || []).forEach(function (x) { lojas[x.id] = x.trade_name || x.legal_name || ''; }); } catch (e) { /* sem 306 */ } }
  const cores = await LOTES.colors();
  PROMOBL._st = { pedidos: pedidos, contagem: contagem, lote: lote, lojas: lojas, cores: cores, grupos: null, arquivo: '' };
  return PROMOBL._st;
};

PROMOBL.num = function (o) { return Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') : '—'; };

PROMOBL.render = function (params, d) {
  if (d.err) return UI.head('Lista PROMOB') + UI.errorBox('Não deu pra carregar', UI.esc(d.err));
  const linhas = d.pedidos.map(function (o) {
    const c = d.contagem[o.id];
    return '<tr><td><b>' + PROMOBL.num(o) + '</b></td><td>' + UI.esc(d.lojas[o.account_id] || '—') + '</td><td>' + UI.esc(o.po_name || '—') +
      (o.client_name && o.client_name !== o.po_name ? ' <span class="pl-hint">· ' + UI.esc(o.client_name) + '</span>' : '') + '</td>' +
      '<td class="pl-r">' + (o.promob_meta && o.promob_meta.xml_total != null ? UI.money(o.promob_meta.xml_total) : '—') + '</td>' +
      '<td>' + (c ? '<span class="pl-ok">' + c.pecas + ' peças</span>' : '<span class="pl-falta">sem lista</span>') + '</td>' +
      '<td>' + (d.lote[o.id] ? UI.esc(d.lote[o.id]) : '—') + '</td>' +
      '<td>' + (c ? '<button type="button" class="pl-mini" data-pl="limpa" data-id="' + UI.esc(o.id) + '">Apagar lista</button>' : '') + '</td></tr>';
  }).join('');
  return '<div id="pl-root">' + PROMOBL.css() + UI.head('Lista PROMOB',
    'Suba o CSV do lote do PROMOB. Cada projeto do arquivo vira a lista de peças de um pedido PROMOB (o pedido que o dealer importou na Central). Depois é o caminho de sempre: lote, plano de corte, etiqueta, apontamento.') +
    '<div class="pl-box"><label class="pl-file">CSV do PROMOB <input type="file" id="pl-csv" accept=".csv,text/csv,text/plain"></label><span class="pl-hint" id="pl-arq"></span></div>' +
    '<div id="pl-grupos"></div>' +
    '<h3 class="pl-h3">Pedidos PROMOB</h3>' +
    (d.pedidos.length ? '<div class="pl-tw"><table class="pl-t"><thead><tr><th>Nº</th><th>Loja</th><th>Projeto / PO</th><th class="pl-r">Valor XML</th><th>Lista de peças</th><th>Lote</th><th></th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
      : '<p class="pl-hint">Nenhum pedido PROMOB ainda. O dealer (com o PROMOB liberado em People) importa o XML na aba Orders da Central.</p>') + '</div>';
};

PROMOBL.css = function () {
  return '<style>' +
    '.pl-box{display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#f6f3ee;border-radius:10px;padding:12px 14px;margin:8px 0 14px}' +
    '.pl-file{font-weight:600}.pl-hint{color:#6b625a;font-size:12.5px}.pl-h3{margin:22px 0 8px}' +
    '.pl-tw{overflow:auto}.pl-t{width:100%;border-collapse:collapse;font-size:13px}.pl-t th,.pl-t td{padding:6px 8px;border-bottom:1px solid #ece7df;text-align:left;white-space:nowrap}.pl-r{text-align:right}' +
    '.pl-ok{color:#1f7a4d;font-weight:700}.pl-falta{color:#b45309;font-weight:700}.pl-err{color:#b42318;font-weight:600}' +
    '.pl-mini{font-size:12px;padding:3px 9px;border-radius:6px;border:1px solid #cfc6b8;background:#fff;cursor:pointer;color:#3d332a}' +
    '.pl-g{border:1px solid #e0d8cc;border-radius:10px;padding:12px 14px;margin:0 0 12px;background:#fff}' +
    '.pl-g h4{margin:0 0 6px;font-size:15px}.pl-g .pl-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0}' +
    '.pl-g select{min-width:260px}.pl-cores{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px 14px;margin:8px 0}' +
    '.pl-cores label{display:flex;gap:6px;align-items:center;font-size:12.5px}.pl-cores select{min-width:150px;flex:1}' +
    '.pl-go{background:#2f6f4f;color:#fff;border:0;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer}.pl-go2{background:#fff;color:#2f6f4f;border:1px solid #2f6f4f;border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer}' +
    '.pl-msg{font-size:13px;margin-top:6px}' +
    '</style>';
};

/* ---------- leitura do CSV ---------- */
PROMOBL.texto = async function (file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
};
PROMOBL.fita = function (cod, txt) {
  const c = String(cod || '').trim().toUpperCase();
  if (c === 'B4') return 4;
  if (c === '====') return 2;
  if (c === 'SB') return 0;
  const t = String(txt || '').trim().toUpperCase();
  if (/^4L/.test(t)) return 4;
  if (/^2C/.test(t)) return 2;
  return 0;
};
PROMOBL.parse = function (texto) {
  const grupos = {}; const erros = [];
  texto.split(/\r?\n/).forEach(function (l, i) {
    if (!l.trim()) return;
    const c = l.split(';');
    if (c.length < 11) { erros.push('Linha ' + (i + 1) + ': colunas a menos (' + c.length + ').'); return; }
    const projeto = String(c[9] || '').trim() || '(sem projeto)';
    const desc = String(c[5] || '').replace(/\s+/g, ' ').trim();
    const m = desc.match(/\(([^)]*)\)\s*$/);
    const modulo = m ? m[1].replace(/\s+/g, ' ').trim() : '';
    const mat = String(c[4] || '').trim();
    const p = {
      n: Number(c[0]) || i + 1, qtd: Math.max(1, Math.round(Number(c[1]) || 1)),
      comp: Math.round(Number(String(c[2]).replace(',', '.')) || 0), larg: Math.round(Number(String(c[3]).replace(',', '.')) || 0),
      mat: mat, matBase: mat.replace(/\d+(?:[.,]\d+)?\s*$/, '').trim(), esp: Number((mat.match(/(\d+(?:[.,]\d+)?)\s*$/) || [])[1] || 19) || 19,
      nome: (m ? desc.slice(0, m.index) : desc).trim() || desc || '—', modulo: modulo, usinagem: String(c[6] || '').trim(),
      idPeca: String(c[7] || '').trim(), idModulo: String(c[8] || '').trim(), veio: String(c[10] || '').trim() === '1',
      loteProm: String(c[11] || '').trim(), fita: PROMOBL.fita(c[12], c[6])
    };
    if (p.comp <= 0 || p.larg <= 0) { erros.push('Linha ' + (i + 1) + ': medida inválida (' + c[2] + ' × ' + c[3] + ').'); return; }
    (grupos[projeto] = grupos[projeto] || []).push(p);
  });
  return { grupos: grupos, erros: erros };
};

/* ---------- casar projeto do CSV × pedido PROMOB ---------- */
PROMOBL.tokens = function (s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/^\s*\d+\s*-\s*/, '')
    .split(/[^a-z0-9]+/).filter(function (t) { return t.length > 1 && ['projeto', 'the'].indexOf(t) < 0; });
};
PROMOBL.sugere = function (projeto, pedidos) {
  const a = PROMOBL.tokens(projeto);
  let melhor = null, nota = 0;
  pedidos.forEach(function (o) {
    const b = PROMOBL.tokens([o.po_name, o.client_name, o.promob_meta && o.promob_meta.file].join(' '));
    if (!a.length || !b.length) return;
    const sb = new Set(b); const comum = a.filter(function (t) { return sb.has(t); }).length;
    const n = comum / a.length;
    if (n > nota) { nota = n; melhor = o; }
  });
  return nota >= 0.6 ? melhor : null;
};

/* ---------- material → cor ---------- */
PROMOBL.mapa = function () { try { return JSON.parse(localStorage.getItem(PROMOBL.MAPA_KEY) || '{}'); } catch (e) { return {}; } };
PROMOBL.mapaGrava = function (m) { try { localStorage.setItem(PROMOBL.MAPA_KEY, JSON.stringify(m)); } catch (e) { /* sem storage */ } };
PROMOBL.corDe = function (mat, matBase) {
  const st = PROMOBL._st; const mp = PROMOBL.mapa();
  if (mp[mat] && st.cores.some(function (c) { return c.id === mp[mat]; })) return mp[mat];
  const alvo = String(matBase || '').toLowerCase().replace(/\s+/g, ' ');
  const ach = st.cores.find(function (c) { return String(c.name || '').toLowerCase().replace(/\s+/g, ' ') === alvo; })
    || st.cores.find(function (c) { const n = String(c.name || '').toLowerCase(); return alvo && (n.indexOf(alvo) === 0 || alvo.indexOf(n) === 0) && n.length > 2; });
  return ach ? ach.id : '';
};

PROMOBL.grupoHtml = function (nome, pecas, gi) {
  const st = PROMOBL._st;
  const sug = PROMOBL.sugere(nome, st.pedidos);
  const total = pecas.reduce(function (s, p) { return s + p.qtd; }, 0);
  const mats = []; pecas.forEach(function (p) { if (mats.indexOf(p.mat) < 0) mats.push(p.mat); });
  const fora = pecas.filter(function (p) { return p.comp < 20 || p.comp > 2700 || p.larg < 20 || p.larg > 1500; });
  const opsPed = '<option value="">— escolha o pedido PROMOB —</option>' + st.pedidos.map(function (o) {
    const c = st.contagem[o.id];
    return '<option value="' + UI.esc(o.id) + '"' + (sug && sug.id === o.id ? ' selected' : '') + '>' + PROMOBL.num(o) + ' · ' + UI.esc(o.po_name || '—') +
      (st.lojas[o.account_id] ? ' · ' + UI.esc(st.lojas[o.account_id]) : '') + (c ? ' (já tem ' + c.pecas + ' peças)' : '') + '</option>';
  }).join('');
  const opsCor = function (sel) { return '<option value="">— cor? —</option>' + st.cores.map(function (c) { return '<option value="' + UI.esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + UI.esc(c.name) + (c.thickness_mm ? ' · ' + c.thickness_mm + ' mm' : '') + '</option>'; }).join(''); };
  return '<div class="pl-g" data-g="' + gi + '"><h4>' + UI.esc(nome) + '</h4>' +
    '<div class="pl-hint">' + pecas.length + ' linhas · ' + total + ' peças · ' + mats.length + ' material(is)' + (pecas[0] && pecas[0].loteProm ? ' · lote PROMOB ' + UI.esc(pecas[0].loteProm) : '') + '</div>' +
    '<div class="pl-row"><label>Pedido <select class="pl-ped">' + opsPed + '</select></label>' + (sug ? '<span class="pl-hint">sugerido pelo nome</span>' : '<span class="pl-falta">escolha o pedido</span>') + '</div>' +
    '<div class="pl-cores">' + mats.map(function (m) {
      const base = (pecas.find(function (p) { return p.mat === m; }) || {}).matBase;
      return '<label><span style="min-width:120px">' + UI.esc(m) + '</span><select class="pl-cor" data-mat="' + UI.esc(m) + '">' + opsCor(PROMOBL.corDe(m, base)) + '</select></label>';
    }).join('') + '</div>' +
    (fora.length ? '<div class="pl-err">' + fora.length + ' peça(s) fora do limite da chapa (comprimento 20–2700, largura 20–1500): ' + fora.slice(0, 5).map(function (p) { return '#' + p.n + ' ' + p.comp + '×' + p.larg; }).join(', ') + (fora.length > 5 ? '…' : '') + '. O banco recusa — corrija no PROMOB.</div>' : '') +
    '<div class="pl-row"><button type="button" class="pl-go" data-pl="grava" data-g="' + gi + '">Gravar lista no pedido</button>' +
    '<button type="button" class="pl-go2" data-pl="soma" data-g="' + gi + '">Acrescentar à lista que já existe</button></div>' +
    '<div class="pl-msg" data-msg="' + gi + '"></div></div>';
};

PROMOBL.after = function (params, d) {
  if (d.err) return;
  const inp = document.getElementById('pl-csv');
  const box = document.getElementById('pl-grupos');
  inp.addEventListener('change', async function () {
    const f = inp.files && inp.files[0]; if (!f) return;
    const r = PROMOBL.parse(await PROMOBL.texto(f));
    const nomes = Object.keys(r.grupos);
    PROMOBL._st.grupos = nomes.map(function (n) { return { nome: n, pecas: r.grupos[n] }; });
    PROMOBL._st.arquivo = f.name;
    document.getElementById('pl-arq').textContent = f.name + ' — ' + nomes.length + ' projeto(s)';
    box.innerHTML = (r.erros.length ? '<div class="pl-err">' + r.erros.slice(0, 6).map(UI.esc).join('<br>') + (r.erros.length > 6 ? '<br>…' : '') + '</div>' : '') +
      PROMOBL._st.grupos.map(function (g, i) { return PROMOBL.grupoHtml(g.nome, g.pecas, i); }).join('');
  });
  document.getElementById('pl-root').addEventListener('click', function (e) {
    const b = e.target.closest('[data-pl]'); if (!b) return;
    const a = b.getAttribute('data-pl');
    if (a === 'grava' || a === 'soma') return PROMOBL.grava(Number(b.getAttribute('data-g')), a === 'soma');
    if (a === 'limpa') return PROMOBL.limpa(b.getAttribute('data-id'));
  });
};

PROMOBL.grava = async function (gi, acrescenta) {
  const st = PROMOBL._st; const g = st.grupos && st.grupos[gi]; if (!g) return;
  const card = document.querySelector('.pl-g[data-g="' + gi + '"]');
  const msg = card.querySelector('[data-msg]');
  const diz = function (t, err) { msg.innerHTML = '<span class="' + (err ? 'pl-err' : 'pl-ok') + '">' + UI.esc(t) + '</span>'; };
  const pedId = card.querySelector('.pl-ped').value;
  if (!pedId) return diz('Escolha o pedido PROMOB deste projeto.', true);
  const cor = {}; let falta = [];
  card.querySelectorAll('.pl-cor').forEach(function (s) { const m = s.getAttribute('data-mat'); if (s.value) cor[m] = s.value; else falta.push(m); });
  if (falta.length) return diz('Escolha a cor de: ' + falta.join(', ') + '.', true);
  const mp = PROMOBL.mapa(); Object.keys(cor).forEach(function (m) { mp[m] = cor[m]; }); PROMOBL.mapaGrava(mp);
  const o = st.pedidos.find(function (x) { return x.id === pedId; });
  const tem = st.contagem[pedId];
  if (tem && !acrescenta && !confirm('O pedido ' + PROMOBL.num(o) + ' já tem ' + tem.pecas + ' peças na lista. Substituir pela lista deste projeto?')) return;
  if (st.lote[pedId] && !confirm('O pedido ' + PROMOBL.num(o) + ' já está no lote ' + st.lote[pedId] + '. Depois de gravar, use "Recarregar peças" no lote (só funciona sem plano de corte salvo). Continuar?')) return;
  const nomeCor = {}; st.cores.forEach(function (c) { nomeCor[c.id] = c.name; });
  const base = acrescenta && tem ? tem.linhas : 0;
  const linhas = g.pecas.map(function (p, i) {
    return {
      order_id: pedId,
      op: p.modulo ? (p.modulo + (p.idModulo ? ' #' + p.idModulo : '')).slice(0, 200) : null,
      part_name: p.nome.slice(0, 200), quantity: p.qtd,
      comprimento_mm: p.comp, largura_mm: p.larg, espessura_mm: p.esp,
      color_id: cor[p.mat], color_name: nomeCor[cor[p.mat]] || null,
      edge_banding: p.fita, has_grain: p.veio,
      obs: [p.usinagem, p.idPeca ? 'PROMOB ' + p.idPeca : '', p.loteProm ? 'lote ' + p.loteProm : ''].filter(Boolean).join(' · ').slice(0, 300),
      unit_price: 0, total_price: 0, sort_order: base + i
    };
  });
  card.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
  diz('Gravando…');
  try {
    const sb = DATA.sb();
    if (!acrescenta) {
      const del = await sb.from('cutting_list_items').delete().eq('order_id', pedId);
      if (del.error) throw del.error;
    }
    for (let i = 0; i < linhas.length; i += 200) {
      const r = await sb.from('cutting_list_items').insert(linhas.slice(i, i + 200));
      if (r.error) throw r.error;
    }
    const total = linhas.reduce(function (s, l) { return s + l.quantity; }, 0);
    st.contagem[pedId] = { linhas: base + linhas.length, pecas: (acrescenta && tem ? tem.pecas : 0) + total };
    diz('Gravado: ' + total + ' peças no pedido ' + PROMOBL.num(o) + '.');
  } catch (e) {
    const m = (e && e.message) || String(e);
    diz(/row-level|permission/i.test(m) ? 'Sem permissão — rode a migration 353 no Supabase.' : /espessura|edge_4|check constraint/i.test(m) ? m + ' — rode a migration 353 no Supabase.' : m, true);
  }
  card.querySelectorAll('button').forEach(function (x) { x.disabled = false; });
};

PROMOBL.limpa = async function (id) {
  const st = PROMOBL._st; const o = st.pedidos.find(function (x) { return x.id === id; }); if (!o) return;
  if (st.lote[id]) return alert('O pedido ' + PROMOBL.num(o) + ' está no lote ' + st.lote[id] + '. Tire do lote antes de apagar a lista.');
  if (!confirm('Apagar a lista de peças do pedido ' + PROMOBL.num(o) + ' (' + (o.po_name || '') + ')?')) return;
  const r = await DATA.sb().from('cutting_list_items').delete().eq('order_id', id);
  if (r.error) return alert(r.error.message);
  location.reload();
};
