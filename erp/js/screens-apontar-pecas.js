/* Legno ERP — Produção → Apontar peças (#/apontar-pecas)
 *
 * Matt (2026-11-18): "preciso uma tela que eu possa apontar peça a peça, eu
 * escolho o lote, e aparece uma lista de peças do lote, eu vou apontando uma
 * a uma, o sistema vai dando como ok, grava data e hora do apontamento. Essa
 * informação deve aparecer lá no portal pro cliente ver o andamento, pode
 * colocar 1/100, 2/100 e a barra verde ficando completa."
 *
 * Peças = erp.batch_pieces do lote (as peças FÍSICAS congeladas no lote),
 * uma linha por UNIDADE (quantity 3 = 3 linhas). Apontar = insert em
 * erp.piece_scans (migration 305), com data e hora; clicar de novo numa
 * apontada pergunta e desfaz (delete). O gatilho da 305 avisa o portal
 * (order_tracking_pulse) e a barra do cliente anda sozinha.
 *
 * Leitor de código de barras: o campo de cima aceita o código da etiqueta da
 * peça (PC-000123, cut_plan_pieces do plano mais novo do lote) + Enter. Sem
 * código, o mesmo campo filtra a lista (peça, módulo, pedido).
 */

const APONTAR = {};
APONTAR._d = null;   // { lote, unidades: [], porKey: {}, porCodigo: {}, scans: {} }

APONTAR.load = async function (p) {
  const batches = (await LOTES.batches()).filter(function (b) { return b.status !== 'cancelado'; });
  return { batches: batches, batchId: p && p.id };
};

APONTAR.render = function (params, d) {
  const sel = d.batchId || '';
  const ops = '<option value="">— escolha o lote —</option>' + d.batches.map(function (b) {
    const n = (b.batch_pieces || []).reduce(function (s, x) { return s + (Number(x.quantity) || 0); }, 0);
    const st = (LOTES_UI.BATCH_STATUS && LOTES_UI.BATCH_STATUS[b.status] || {}).label || b.status || '';
    return '<option value="' + UI.esc(b.id) + '"' + (b.id === sel ? ' selected' : '') + '>' + UI.esc(b.code) +
      (b.name ? ' · ' + UI.esc(b.name) : '') + ' — ' + n + ' peças' + (st ? ' (' + UI.esc(st) + ')' : '') + '</option>';
  }).join('');
  return UI.head('Apontar peças',
    'Escolha o lote e vá apontando peça por peça (clique na linha ou bipe a etiqueta). Cada apontamento grava data e hora e aparece no portal do cliente como andamento do pedido.') +
    '<div class="ap-top">' +
      '<label class="ap-lbl">Lote<select id="ap-lote" class="erp-input">' + ops + '</select></label>' +
      '<label class="ap-lbl ap-grow">Bipar etiqueta ou buscar<input id="ap-busca" class="erp-input" type="search" autocomplete="off" placeholder="PC-000123 + Enter, ou nome da peça / módulo / pedido"></label>' +
      '<label class="ap-lbl">Pedido<select id="ap-pedido" class="erp-input"><option value="">Todos</option></select></label>' +
      '<label class="ap-chk"><input type="checkbox" id="ap-esconde"> Esconder apontadas</label>' +
    '</div>' +
    '<div id="ap-prog" class="ap-prog" style="display:none"></div>' +
    '<div id="ap-msg" class="ap-msg"></div>' +
    '<div id="ap-lista" class="ap-lista"><div class="erp-muted">Escolha um lote.</div></div>' +
    APONTAR._css();
};

APONTAR._css = function () {
  return '<style>' +
    '.ap-top{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin:0 0 14px}' +
    '.ap-lbl{display:flex;flex-direction:column;gap:4px;font-size:12px;color:#666;font-weight:600;text-transform:uppercase;letter-spacing:.03em}' +
    '.ap-lbl .erp-input{min-width:220px;font-size:15px;padding:9px 10px}' +
    '.ap-grow{flex:1;min-width:260px}.ap-grow .erp-input{width:100%}' +
    '.ap-chk{display:flex;gap:6px;align-items:center;font-size:14px;padding-bottom:10px}' +
    '.ap-prog{background:#fff;border:1px solid #e6e1d8;border-radius:12px;padding:14px 16px;margin:0 0 12px}' +
    '.ap-prog-txt{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 8px;font-size:15px}' +
    '.ap-prog-txt strong{font-size:26px}' +
    '.ap-bar{height:14px;border-radius:7px;background:#ece8e1;overflow:hidden}' +
    '.ap-bar > div{height:100%;background:#22a447;transition:width .3s}' +
    '.ap-msg{min-height:22px;margin:0 0 8px;font-size:15px;font-weight:600}' +
    '.ap-msg.ok{color:#178a3a}.ap-msg.err{color:#b42318}.ap-msg.warn{color:#a15c07}' +
    '.ap-ped{margin:16px 0 4px;font-size:15px;font-weight:700}' +
    '.ap-mod{background:#fff;border:1px solid #e6e1d8;border-radius:10px;margin:0 0 10px;overflow:hidden}' +
    '.ap-mod-h{display:flex;justify-content:space-between;gap:10px;padding:8px 12px;background:#f6f3ee;font-size:14px;font-weight:600}' +
    '.ap-mod-h .ap-mini{flex:0 0 120px;height:8px;border-radius:4px;background:#e2ddd4;overflow:hidden;align-self:center}' +
    '.ap-mod-h .ap-mini > div{height:100%;background:#22a447}' +
    '.ap-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-top:1px solid #f0ece6;cursor:pointer;user-select:none;font-size:15px}' +
    '.ap-row:hover{background:#faf8f4}' +
    '.ap-ck{flex:0 0 30px;height:30px;border-radius:50%;border:2px solid #c9c2b6;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff}' +
    '.ap-row.on .ap-ck{background:#22a447;border-color:#22a447}' +
    '.ap-row.on{background:#f1faf3}' +
    '.ap-ref{flex:1;min-width:0}.ap-ref b{font-weight:600}.ap-ref small{display:block;color:#888;font-size:12px}' +
    '.ap-quando{flex:0 0 auto;font-size:12px;color:#178a3a;text-align:right;white-space:nowrap}' +
    '.ap-row.flash{animation:apflash .9s}' +
    '@keyframes apflash{0%{background:#b8ecc6}100%{background:#f1faf3}}' +
    '.ap-row.hide{display:none}' +
    '.ap-msg.alarm{color:#fff;background:#b42318;padding:10px 12px;border-radius:8px;font-size:18px;animation:apalarm .35s 6 alternate}' +
    '@keyframes apalarm{0%{background:#b42318}100%{background:#f04438}}' +
    '.ap-confirm{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999}' +
    '.ap-confirm-box{background:#fff;border-radius:12px;padding:20px 22px;max-width:440px;width:92%;box-shadow:0 10px 40px rgba(0,0,0,.3)}' +
    '.ap-confirm-box p{margin:0 0 6px;font-size:16px;font-weight:600}.ap-confirm-box small{color:#777}' +
    '.ap-confirm-bt{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}' +
    '.ap-confirm-bt button{font-size:15px;padding:9px 18px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer}' +
    '.ap-confirm-bt .ap-ok{background:#b42318;border-color:#b42318;color:#fff}' +
    '</style>';
};

APONTAR.after = function (params, d) {
  const sel = document.getElementById('ap-lote');
  const busca = document.getElementById('ap-busca');
  sel.addEventListener('change', function () {
    if (sel.value) location.hash = '#/apontar-pecas/' + sel.value;
  });
  document.getElementById('ap-pedido').addEventListener('change', APONTAR._filtra);
  document.getElementById('ap-esconde').addEventListener('change', APONTAR._filtra);
  busca.addEventListener('input', APONTAR._filtra);
  busca.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const lido = String(busca.value || '').trim();
    if (!lido || !APONTAR._d) return;
    const num = APONTAR._numCodigo(lido);
    if (num == null) return;   // texto de busca: Enter não faz nada, o filtro já está aplicado
    // leitor: limpa SEMPRE e o campo continua com o foco, pronto pro próximo bipe
    busca.value = '';
    APONTAR._filtra();
    const cod = 'PC-' + String(num).padStart(6, '0');
    const u = APONTAR._d.porCodigo[num];
    // OUTRO LOTE (18/11, Matt: "se apontar peça de outro lote quero que dê um
    // alarme"): sirene + faixa vermelha piscando; diz de qual lote é.
    if (!u) { APONTAR._outroLote(cod); return; }
    // REPETIDA (18/11, Matt: "se apontar 2x a mesma peça não faz nada, só dá
    // um som diferente mas mantém a peça apontada"). Desapontar só no mouse.
    if (APONTAR._d.scans[u.key]) { APONTAR._aviso('↺ ' + cod + ' já estava apontada (' + APONTAR._hora(APONTAR._d.scans[u.key].scanned_at) + ') — continua apontada.', 'warn', true); APONTAR._mostra(u.key); return; }
    APONTAR.aponta(u.key, cod);
    APONTAR._mostra(u.key);
  });
  document.getElementById('ap-lista').addEventListener('click', function (ev) {
    const row = ev.target.closest('.ap-row');
    if (!row || !APONTAR._d) return;
    const k = row.getAttribute('data-k');
    if (APONTAR._d.scans[k]) {
      const u = APONTAR._d.porKey[k];
      // DESAPONTAR SÓ COM MOUSE (18/11): janela própria no lugar do
      // confirm() — o Enter do leitor confirmava o confirm() sozinho.
      APONTAR._confirmaDesfazer(k, u);
      return;
    } else {
      APONTAR.aponta(k, null);
    }
    APONTAR._foco();
  });
  ['ap-pedido', 'ap-esconde'].forEach(function (id) { document.getElementById(id).addEventListener('change', APONTAR._foco); });
  // LEITOR SEM CLICAR EM NADA (18/11, Matt: "quero rodar só no leitor de
  // código de barras, então depois de lido deve ficar pronto pro próximo
  // bipe sem ter que clicar em nada"): qualquer tecla digitada fora de um
  // campo (o leitor "digita" o código + Enter) volta o foco pro campo do
  // bipe antes do caractere cair — nada se perde se alguém clicou na tela.
  if (!APONTAR._teclaLigada) {
    APONTAR._teclaLigada = true;
    document.addEventListener('keydown', function (ev) {
      if (!/^#\/apontar-pecas/.test(location.hash)) return;
      const b = document.getElementById('ap-busca');
      if (!b || document.activeElement === b) return;
      const t = document.activeElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && t.type !== 'checkbox') return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key.length === 1) b.focus();
    }, true);
  }
  if (d.batchId) APONTAR.carrega(d.batchId); else setTimeout(function () { sel.focus(); }, 50);
};

/* select paginado (o PostgREST corta em 1000 linhas) */
APONTAR._todas = async function (mk) {
  const out = [];
  for (let de = 0; de < 50000; de += 1000) {
    const r = await mk().range(de, de + 999);
    if (r.error) throw r.error;
    out.push.apply(out, r.data || []);
    if (!r.data || r.data.length < 1000) break;
  }
  return out;
};

APONTAR.carrega = async function (batchId) {
  const lista = document.getElementById('ap-lista');
  lista.innerHTML = '<div class="erp-muted">Carregando peças do lote…</div>';
  try {
    const erp = LOTES.erp();
    const lote = await LOTES.batch(batchId);
    if (!lote) { lista.innerHTML = '<div class="erp-muted">Lote não encontrado.</div>'; return; }
    const scans = await APONTAR._todas(function () { return erp.from('piece_scans').select('*').eq('batch_id', batchId); });
    let codigos = [];
    const planos = (lote._plans || []).map(function (p) { return p.id; });
    for (const planoId of planos) {
      const c = await APONTAR._todas(function () { return erp.from('cut_plan_pieces').select('piece_code, batch_piece_id').eq('plan_id', planoId); });
      c.forEach(function (x) { x._plano = planoId; });
      codigos = codigos.concat(c);
    }
    const pedNome = {};
    (lote._orders || []).forEach(function (o) {
      const n = Number(o.factory_number) > 0 ? String(Number(o.factory_number)).padStart(5, '0') + ' · ' : '';
      pedNome[o.id] = n + (o.po_name || o.client_name || 'Pedido');
    });
    const pecas = (lote._pieces || []).slice().sort(function (a, b) {
      const pa = pedNome[a.order_id] || a.po_name || '', pb = pedNome[b.order_id] || b.po_name || '';
      return pa.localeCompare(pb) || String(a.module_number || '').localeCompare(String(b.module_number || ''), undefined, { numeric: true }) ||
        (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
    });
    const d = { lote: lote, unidades: [], porKey: {}, porCodigo: {}, scans: {}, pedNome: pedNome };
    pecas.forEach(function (p) {
      const q = Math.max(1, Number(p.quantity) || 1);
      for (let i = 1; i <= q; i++) {
        const u = { key: p.id + '|' + i, p: p, idx: i, q: q };
        d.unidades.push(u); d.porKey[u.key] = u;
      }
    });
    // código da etiqueta → unidade (as N etiquetas da mesma linha, em ordem de código)
    // por plano: as N etiquetas da mesma linha viram as unidades 1..N (em ordem de código)
    const porPeca = {};
    codigos.forEach(function (c) { if (c.batch_piece_id) { const k = c._plano + '§' + c.batch_piece_id; (porPeca[k] = porPeca[k] || []).push(c.piece_code); } });
    Object.keys(porPeca).forEach(function (k) {
      const bp = k.split('§')[1];
      porPeca[k].sort().forEach(function (code, i) {
        const u = d.porKey[bp + '|' + (i + 1)];
        const n = APONTAR._numCodigo(code);
        if (u && n != null) { d.porCodigo[n] = u; if (!u.code || k.indexOf(planos[0] + '§') === 0) u.code = code; }
      });
    });
    scans.forEach(function (s) { d.scans[s.batch_piece_id + '|' + s.unit_idx] = s; });
    APONTAR._d = d;
    // filtro de pedido
    const ps = document.getElementById('ap-pedido');
    const ids = []; d.unidades.forEach(function (u) { if (u.p.order_id && ids.indexOf(u.p.order_id) === -1) ids.push(u.p.order_id); });
    ps.innerHTML = '<option value="">Todos (' + ids.length + ')</option>' + ids.map(function (id) { return '<option value="' + UI.esc(id) + '">' + UI.esc(pedNome[id] || id) + '</option>'; }).join('');
    APONTAR._desenha();
    setTimeout(function () { const b = document.getElementById('ap-busca'); if (b) b.focus(); }, 50);
  } catch (err) {
    console.error('[apontar]', err);
    const bruto = String((err && (err.message || err.details || err.hint)) || err) + (err && err.code ? ' [' + err.code + ']' : '');
    const msg = (err && /piece_scans/.test(bruto))
      ? 'O banco respondeu: ' + bruto + ' — se a migration 305 já rodou, rode no SQL Editor: notify pgrst, \'reload schema\'; e recarregue (F5).'
      : (LOTES.explainError ? LOTES.explainError(err) : bruto);
    lista.innerHTML = UI.errorBox ? UI.errorBox('Não consegui carregar o lote', UI.esc(msg)) : '<div class="erp-muted">' + UI.esc(msg) + '</div>';
  }
};

/* "PC-000123", "pc000123", "PC'000123" (teclado ABNT troca o hífen), "000123"
   → 123. Texto que não é código → null (vira busca). */
APONTAR._numCodigo = function (txt) {
  const t = String(txt || '').trim().toUpperCase();
  const m = t.match(/^(?:PC\W?)?(\d{3,})$/);
  return m ? parseInt(m[1], 10) : null;
};
APONTAR._foco = function () {
  setTimeout(function () { const b = document.getElementById('ap-busca'); if (b && !document.querySelector('.ap-confirm')) b.focus(); }, 0);
};

APONTAR._hora = function (iso) {
  if (!iso) return '';
  const t = new Date(iso);
  return t.toLocaleDateString('pt-BR') + ' ' + t.toLocaleTimeString('pt-BR');
};
APONTAR._med = function (p) {
  const r = function (v) { return Math.round(Number(v) || 0); };
  return r(p.comprimento_mm) + ' × ' + r(p.largura_mm) + ' × ' + (Number(p.espessura_mm) || 0);
};

APONTAR._rowHtml = function (u) {
  const s = APONTAR._d.scans[u.key];
  const p = u.p;
  return '<div class="ap-row' + (s ? ' on' : '') + '" data-k="' + UI.esc(u.key) + '" data-o="' + UI.esc(p.order_id || '') + '" data-t="' +
    UI.esc(((p.reference || '') + ' ' + (p.module_name || '') + ' ' + (p.module_number || '') + ' ' + (APONTAR._d.pedNome[p.order_id] || '') + ' ' + (u.code || '')).toLowerCase()) + '">' +
    '<div class="ap-ck">' + (s ? '✓' : '') + '</div>' +
    '<div class="ap-ref"><b>' + UI.esc(p.reference || p.description || 'Peça') + '</b>' + (u.q > 1 ? ' <span class="erp-muted">(' + u.idx + '/' + u.q + ')</span>' : '') +
      '<small>' + UI.esc(APONTAR._med(p)) + ' mm · ' + UI.esc(p.color_name || '') + (u.code ? ' · ' + UI.esc(u.code) : '') + '</small></div>' +
    '<div class="ap-quando">' + (s ? '✓ ' + UI.esc(APONTAR._hora(s.scanned_at)) : '') + '</div>' +
  '</div>';
};

APONTAR._desenha = function () {
  const d = APONTAR._d;
  const lista = document.getElementById('ap-lista');
  if (!d.unidades.length) { lista.innerHTML = '<div class="erp-muted">Este lote não tem peças.</div>'; APONTAR._progresso(); return; }
  let html = '', pedAtual = null, modAtual = null;
  d.unidades.forEach(function (u) {
    const ped = u.p.order_id || '';
    const mod = ped + '§' + (u.p.module_number || '') + '§' + (u.p.module_name || '');
    if (ped !== pedAtual) {
      if (modAtual !== null) html += '</div>';
      modAtual = null;
      html += '<div class="ap-ped" data-ped="' + UI.esc(ped) + '">' + UI.esc(d.pedNome[ped] || u.p.po_name || u.p.client_name || 'Sem pedido') + '</div>';
      pedAtual = ped;
    }
    if (mod !== modAtual) {
      if (modAtual !== null) html += '</div>';
      html += '<div class="ap-mod" data-mod="' + UI.esc(mod) + '" data-o="' + UI.esc(ped) + '"><div class="ap-mod-h"><span>' +
        UI.esc((u.p.module_number ? u.p.module_number + ' · ' : '') + (u.p.module_name || 'Peças avulsas')) +
        '</span><span class="ap-mod-n"></span><span class="ap-mini"><div></div></span></div>';
      modAtual = mod;
    }
    html += APONTAR._rowHtml(u);
  });
  html += '</div>';
  lista.innerHTML = html;
  APONTAR._filtra();
  APONTAR._progresso();
};

APONTAR._progresso = function () {
  const d = APONTAR._d;
  const total = d.unidades.length;
  const feitas = d.unidades.filter(function (u) { return d.scans[u.key]; }).length;
  const pct = total ? Math.round(100 * feitas / total) : 0;
  const el = document.getElementById('ap-prog');
  el.style.display = '';
  el.innerHTML = '<div class="ap-prog-txt"><span><strong>' + feitas + '/' + total + '</strong> peças apontadas · ' + UI.esc(d.lote.code || '') + '</span><span>' + pct + '%</span></div>' +
    '<div class="ap-bar"><div style="width:' + pct + '%"></div></div>';
  // contagem por módulo
  const porMod = {};
  d.unidades.forEach(function (u) {
    const mod = (u.p.order_id || '') + '§' + (u.p.module_number || '') + '§' + (u.p.module_name || '');
    const m = porMod[mod] = porMod[mod] || { t: 0, f: 0 };
    m.t++; if (d.scans[u.key]) m.f++;
  });
  document.querySelectorAll('#ap-lista .ap-mod').forEach(function (box) {
    const m = porMod[box.getAttribute('data-mod')];
    if (!m) return;
    box.querySelector('.ap-mod-n').textContent = m.f + '/' + m.t;
    box.querySelector('.ap-mini > div').style.width = Math.round(100 * m.f / m.t) + '%';
  });
};

APONTAR._filtra = function () {
  if (!APONTAR._d) return;
  const q = String((document.getElementById('ap-busca') || {}).value || '').trim().toLowerCase();
  const ped = (document.getElementById('ap-pedido') || {}).value || '';
  const esconde = !!(document.getElementById('ap-esconde') || {}).checked;
  document.querySelectorAll('#ap-lista .ap-row').forEach(function (r) {
    const k = r.getAttribute('data-k');
    const ok = (!ped || r.getAttribute('data-o') === ped) && (!q || r.getAttribute('data-t').indexOf(q) !== -1) && !(esconde && APONTAR._d.scans[k]);
    r.classList.toggle('hide', !ok);
  });
  document.querySelectorAll('#ap-lista .ap-mod').forEach(function (m) {
    m.style.display = m.querySelector('.ap-row:not(.hide)') ? '' : 'none';
  });
  document.querySelectorAll('#ap-lista .ap-ped').forEach(function (h) {
    const id = h.getAttribute('data-ped');
    let vis = false;
    document.querySelectorAll('#ap-lista .ap-mod').forEach(function (m) { if (m.getAttribute('data-o') === id && m.style.display !== 'none') vis = true; });
    h.style.display = vis ? '' : 'none';
  });
};

APONTAR._atualizaLinha = function (k, flash) {
  const u = APONTAR._d.porKey[k];
  let row = null;
  document.querySelectorAll('#ap-lista .ap-row').forEach(function (r) { if (r.getAttribute('data-k') === k) row = r; });
  if (!row || !u) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = APONTAR._rowHtml(u);
  const novo = tmp.firstChild;
  row.replaceWith(novo);
  if (flash) novo.classList.add('flash');
  APONTAR._progresso();
  APONTAR._filtra();
};
APONTAR._mostra = function (k) {
  document.querySelectorAll('#ap-lista .ap-row').forEach(function (r) {
    if (r.getAttribute('data-k') === k) { r.scrollIntoView({ block: 'center', behavior: 'smooth' }); r.classList.remove('flash'); void r.offsetWidth; r.classList.add('flash'); }
  });
};
APONTAR._aviso = function (txt, tipo, som) {
  const el = document.getElementById('ap-msg');
  if (el) { el.className = 'ap-msg ' + (tipo || ''); el.textContent = txt; }
  if (som) APONTAR._som(tipo);
};
// SONS (18/11, Matt): cada situação com um som que dá pra reconhecer sem
// olhar a tela, todos no volume máximo (onda quadrada, corta barulho de
// máquina).
//   ok     1 bip agudo curto
//   warn   2 bips médios (peça repetida — continua apontada)
//   err    1 bip grave longo (não gravou)
//   alarm  sirene grave/agudo ~1,6 s (peça de OUTRO lote)
APONTAR._tom = function (hz, ini, dur) {
  const ac = APONTAR._ac;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.value = hz;
  const t = ac.currentTime + ini;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(1, t + 0.005);
  g.gain.setValueAtTime(1, t + dur - 0.02);
  g.gain.linearRampToValueAtTime(0, t + dur); // sem estalo
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + dur);
};
APONTAR._som = function (tipo) {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    APONTAR._ac = APONTAR._ac || new C();
    if (APONTAR._ac.state === 'suspended' && APONTAR._ac.resume) APONTAR._ac.resume();
    const tom = APONTAR._tom;
    if (tipo === 'ok') tom(1000, 0, 0.25);
    else if (tipo === 'warn') { tom(620, 0, 0.12); tom(620, 0.2, 0.12); }
    else if (tipo === 'alarm') { for (let i = 0; i < 8; i++) tom(i % 2 ? 1400 : 700, i * 0.2, 0.2); }
    else tom(220, 0, 0.5);
  } catch (e) { /* sem som */ }
};
APONTAR._bip = function (hz) { APONTAR._som(hz >= 440 ? 'ok' : 'err'); }; // compatibilidade

APONTAR._outroLote = async function (cod) {
  APONTAR._aviso('⛔ ' + cod + ' NÃO É DESTE LOTE — separe a peça.', 'alarm', true);
  try { // de qual lote é (só pra informar; se falhar, fica o aviso acima)
    const erp = LOTES.erp();
    const { data: pc } = await erp.from('cut_plan_pieces').select('plan_id').eq('piece_code', cod).limit(1).maybeSingle();
    if (!pc || !pc.plan_id) return;
    const { data: pl } = await erp.from('cut_plans').select('batch_id').eq('id', pc.plan_id).maybeSingle();
    if (!pl || !pl.batch_id) return;
    const { data: b } = await erp.from('batches').select('code').eq('id', pl.batch_id).maybeSingle();
    const el = document.getElementById('ap-msg');
    if (b && b.code && el && el.textContent.indexOf(cod) !== -1) el.textContent = '⛔ ' + cod + ' NÃO É DESTE LOTE — é do ' + b.code + '. Separe a peça.';
  } catch (e) { /* ok */ }
};

// Janela de desfazer: só fecha/confirma com CLIQUE. Enquanto aberta, engole
// as teclas (o leitor manda código + Enter) e avisa com o som de erro — o
// bipe feito com ela aberta não conta; Esc cancela.
APONTAR._confirmaDesfazer = function (k, u) {
  if (document.querySelector('.ap-confirm')) return;
  const div = document.createElement('div');
  div.className = 'ap-confirm';
  div.innerHTML = '<div class="ap-confirm-box"><p>Desfazer o apontamento de "' + UI.esc(u.p.reference || 'peça') + '"?</p>'
    + '<small>' + UI.esc((u.code ? u.code + ' · ' : '') + 'apontada ' + APONTAR._hora(APONTAR._d.scans[k].scanned_at)) + '</small>'
    + '<div class="ap-confirm-bt"><button type="button" class="ap-cancel">Cancelar</button><button type="button" class="ap-ok">OK, desfazer</button></div></div>';
  let fechou = false;
  const tecla = function (ev) {
    ev.preventDefault(); ev.stopPropagation();
    if (ev.key === 'Escape') { fecha(); return; }
    if (ev.key === 'Enter') APONTAR._aviso('Feche a janela de desfazer antes de bipar (bipe não contou).', 'err', true);
  };
  const fecha = function () {
    if (fechou) return; fechou = true;
    document.removeEventListener('keydown', tecla, true);
    div.remove();
    APONTAR._foco();
  };
  // só clique de verdade (mouse/toque) — ev.detail 0 = "clique" gerado por teclado
  div.addEventListener('click', function (ev) {
    if (ev.detail === 0) return;
    if (ev.target.closest('.ap-ok')) { fecha(); APONTAR.desfaz(k); }
    else if (ev.target.closest('.ap-cancel') || ev.target === div) fecha();
  });
  document.addEventListener('keydown', tecla, true);
  document.body.appendChild(div);
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
};

APONTAR.aponta = async function (k, codigo) {
  const d = APONTAR._d;
  const u = d.porKey[k];
  if (!u || d.scans[k]) return;
  const agora = new Date().toISOString();
  // otimista: marca na hora, desfaz se o banco recusar
  d.scans[k] = { batch_piece_id: u.p.id, unit_idx: u.idx, scanned_at: agora, _pend: true };
  APONTAR._atualizaLinha(k, true);
  APONTAR._aviso('✓ ' + (codigo ? codigo + ' · ' : '') + (u.p.reference || 'Peça') + (u.p.module_name ? ' — ' + u.p.module_name : '') + ' · ' + APONTAR._hora(agora), 'ok', true);
  const user = (typeof DATA !== 'undefined' && DATA.user) || null;
  const { data, error } = await LOTES.erp().from('piece_scans').insert({
    batch_id: d.lote.id, batch_piece_id: u.p.id, unit_idx: u.idx, order_id: u.p.order_id || null,
    piece_code: codigo || u.code || null, scanned_at: agora, scanned_by_name: user ? (user.email || null) : null
  }).select().maybeSingle();
  if (error) {
    delete d.scans[k];
    APONTAR._atualizaLinha(k, false);
    if (error.code === '23505') { APONTAR._aviso('⚠ Essa peça já tinha sido apontada por outra pessoa — recarregando.', 'warn', true); APONTAR.carrega(d.lote.id); return; }
    APONTAR._aviso('Não gravou: ' + (error.message || error), 'err', true);
    return;
  }
  d.scans[k] = data;
  APONTAR._atualizaLinha(k, false);
};

APONTAR.desfaz = async function (k) {
  const d = APONTAR._d;
  const s = d.scans[k];
  if (!s || !s.id) return;
  const { error } = await LOTES.erp().from('piece_scans').delete().eq('id', s.id);
  if (error) { APONTAR._aviso('Não desfez: ' + (error.message || error), 'err', true); return; }
  delete d.scans[k];
  APONTAR._atualizaLinha(k, false);
  APONTAR._aviso('Apontamento desfeito.', 'warn', false);
  APONTAR._foco();
};
