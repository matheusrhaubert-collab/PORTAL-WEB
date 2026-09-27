/* Legno ERP — Produção → Apontamento + Embalagem por VOLUME  (#/volumes[/:lote])
 *
 * Pedido do Matt (2026-09-27): "na embalagem e apontamento funcione como os
 * módulos, em pacote: aponta peça, coloca no nicho e quando o pacote estiver
 * pronto fica verde — agora pra 100% das peças. Peças grandes (> 900 mm)
 * empacotadas sozinhas, em local separado."
 *
 * Os volumes já vêm PRONTOS do banco (botão "Criar volumes" na tela do
 * lote → erp.packages / package_pieces / pallet_plans, migration 180).
 * Esta tela só aponta:
 *   - lê a etiqueta → acha o VOLUME da peça → o volume ganha um NICHO da
 *     estante (o menor livre onde cabe; volume de peça grande vai pra ÁREA
 *     DO CHÃO) → o nicho pisca VERMELHO mostrando onde pôr;
 *   - todas as peças do volume apontadas → volume COMPLETO, nicho VERDE,
 *     abre o passo a passo de como empilhar (camadas) e onde passar as
 *     fitas → "Embalado" libera o nicho e mostra a posição no pallet do
 *     pedido.
 * Estante (layout) continua no localStorage, mesma chave da tela de teste
 * (APEMB.K_ESTANTE); apontamento e status vão pro banco.
 *
 * Usa: PACOTES_DB (dados), APEMB_PLANO.nichosDaEstante/escolherNicho
 * (estante), CSS de css/apont-embalagem.css (classes apemb-*).
 */

const VOLUMES = {};
VOLUMES.S = null;
VOLUMES.$ = function (id) { return document.getElementById(id); };

VOLUMES.estanteCfg = function () {
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem('legno.apemb.estante.v1') || 'null'); } catch (e) { salvo = null; }
  return Object.assign({}, APEMB_PLANO.DEFAULTS.estante, salvo || {});
};

/* ---------------------------------------------------------------- rota */

VOLUMES.load = async function (p) { return { batches: await LOTES.batches(), batchId: p && p.id }; };

VOLUMES.render = function (params, d) {
  const sel = d.batchId || (d.batches[0] && d.batches[0].id);
  const ops = d.batches.map(function (b) {
    return '<option value="' + UI.esc(b.id) + '"' + (b.id === sel ? ' selected' : '') + '>' + UI.esc(b.code) + (b.name ? ' · ' + UI.esc(b.name) : '') + '</option>';
  }).join('');
  const est = VOLUMES.estanteCfg();
  const campo = function (id, label, val, extra) {
    return '<label class="erp-field"><span>' + label + '</span><input id="' + id + '" value="' + UI.esc(String(val)) + '"' + (extra || '') + '></label>';
  };
  return UI.crumb([{ label: 'Produção' }, { label: 'Apontamento + Embalagem' }]) +
    UI.head('Apontamento + Embalagem',
      'Leia a etiqueta: a tela mostra o <b>volume</b> da peça e o <b>nicho</b> onde ela vai (vermelho = onde pôr). ' +
      'Volume com todas as peças fica <b>verde</b> — arquear e clicar em "Embalado" pra ver o lugar no pallet do pedido. ' +
      'Volume de peça grande (&gt; 900 mm) fica na <b>área do chão</b>.', '') +
    '<div class="erp-panel apemb-topo">' +
      '<div class="erp-inline-fields">' +
        '<label class="erp-field"><span>Lote</span><select id="vol-lote"><option value="">— escolher —</option>' + ops + '</select></label>' +
        '<div class="emb-acao">' +
          '<button class="erp-btn-secondary" id="vol-desfazer" disabled title="Desfaz a última leitura">↶ Desfazer última</button> ' +
          '<button class="erp-btn-secondary" id="vol-recarregar" disabled>↻ Recarregar</button> ' +
          '<button class="erp-btn-secondary" id="vol-imprimir" disabled title="Lista dos volumes do lote, com conteúdo e pallet">🖨 Lista de volumes</button>' +
        '</div>' +
      '</div>' +
      '<details class="apemb-cfg"><summary>Estante</summary>' +
        '<div class="erp-inline-fields">' +
          campo('vol-cols', 'Colunas — largura de cada nicho, da esquerda pra direita (mm)', est.colunas.join(', ')) +
          campo('vol-linhas', 'Linhas — altura de cada nicho, de cima pra baixo (mm)', est.linhas.join(', ')) +
          campo('vol-prof', 'Profundidade (mm)', est.prof, ' type="number"') +
          '<div class="emb-acao"><button class="erp-btn" id="vol-cfg-ok">Salvar</button></div>' +
        '</div>' +
      '</details>' +
    '</div>' +
    '<div id="vol-status" class="erp-muted erp-small" style="margin:6px 0">Escolha o lote.</div>' +
    '<div id="vol-corpo" style="display:none">' +
      '<div id="vol-resumo"></div>' +
      '<div class="apemb-scan">' +
        '<input id="vol-input" autocomplete="off" placeholder="Ler etiqueta (PC-002247) ou digitar o número e Enter">' +
        '<div id="vol-msg" class="apemb-msg">Pronto pra apontar.</div>' +
      '</div>' +
      '<div class="apemb-grid">' +
        '<div class="erp-panel"><h2>Estante — vista de frente</h2><div id="vol-estante"></div></div>' +
        '<div class="erp-panel"><h2>Área do chão — volumes de peça grande</h2><div id="vol-chao"></div></div>' +
      '</div>' +
      '<div id="vol-embalar"></div>' +
      '<div class="erp-panel"><h2>Pallets por pedido</h2><div id="vol-pallets"></div></div>' +
      '<div class="erp-panel"><h2>Volumes do lote <input id="vol-filtro" class="apemb-filtro" placeholder="filtrar (código, peça, módulo, pedido)"></h2><div id="vol-lista"></div></div>' +
    '</div>';
};

VOLUMES.after = function () {
  const $ = VOLUMES.$;
  VOLUMES.S = null;
  $('vol-lote').addEventListener('change', function () { location.hash = '#/volumes/' + this.value; });
  $('vol-desfazer').addEventListener('click', VOLUMES.desfazer);
  $('vol-recarregar').addEventListener('click', function () { VOLUMES.abrirLote($('vol-lote').value); });
  $('vol-imprimir').addEventListener('click', VOLUMES.imprimirLista);
  $('vol-cfg-ok').addEventListener('click', VOLUMES.salvarCfg);
  $('vol-input').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); const v = this.value; this.value = ''; VOLUMES.apontar(v); }
  });
  $('vol-filtro').addEventListener('input', VOLUMES.desenharLista);
  if ($('vol-lote').value) VOLUMES.abrirLote($('vol-lote').value);
};

/* ---------------------------------------------------------- carregar */

VOLUMES.abrirLote = async function (batchId) {
  const $ = VOLUMES.$;
  VOLUMES.S = null;
  $('vol-corpo').style.display = 'none';
  ['vol-desfazer', 'vol-recarregar', 'vol-imprimir'].forEach(function (id) { $(id).disabled = true; });
  if (!batchId) { $('vol-status').textContent = 'Escolha o lote.'; return; }
  $('vol-status').textContent = 'Buscando os volumes do lote…';
  let d;
  try { d = await PACOTES_DB.carregar(batchId); }
  catch (err) {
    console.error('[volumes]', err);
    $('vol-status').innerHTML = '<span class="erp-error-detail">' + UI.esc((LOTES.explainError && LOTES.explainError(err)) || err.message || String(err)) + '</span>';
    return;
  }
  if ($('vol-lote').value !== batchId) return;
  if (!d.pacotes.length) {
    $('vol-status').innerHTML = 'Este lote ainda não tem volumes. <a href="#/lotes/' + batchId + '">Abra o lote</a> e clique em <b>Criar volumes</b>.';
    return;
  }
  const S = { batchId: batchId, batch: d.batch, pacotes: d.pacotes, pallets: d.pallets, porCodigo: {}, porId: {}, hist: [], alvo: null };
  const selEl = $('vol-lote');
  S.batchCode = ((selEl.options[selEl.selectedIndex] || {}).text || '').split(' · ')[0];
  d.pacotes.forEach(function (pc) {
    S.porId[pc.id] = pc;
    pc.pecas.forEach(function (p) { S.porCodigo[p.piece_code] = { peca: p, pacote: pc }; });
  });
  VOLUMES.S = S;
  ['vol-recarregar', 'vol-imprimir'].forEach(function (id) { $(id).disabled = false; });
  $('vol-status').textContent = S.batchCode + ' · ' + d.pacotes.length + ' volumes · ' + Object.keys(S.porCodigo).length + ' peças' +
    (d.batch && d.batch.volumes_created_at ? ' · volumes criados em ' + UI.date(d.batch.volumes_created_at) : '');
  $('vol-corpo').style.display = '';
  VOLUMES.redesenhar();
  $('vol-input').focus();
};

/* ---------------------------------------------------------- estado */

VOLUMES.apontadas = function (pc) { return pc.pecas.filter(function (p) { return !!p.apontado_at; }).length; };
VOLUMES.completo = function (pc) { return pc.status === 'completo' || pc.status === 'embalado'; };
VOLUMES.embalado = function (pc) { return pc.status === 'embalado'; };

VOLUMES.normalizar = function (txt) {
  let s = String(txt || '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(s)) s = 'PC-' + s.padStart(6, '0');
  if (/^PC\d+$/.test(s)) s = 'PC-' + s.slice(2).padStart(6, '0');
  return s;
};

/* Nicho pro volume: o menor livre onde a planta C × L e a pilha H cabem
   (mesma regra da tela de teste: APEMB_PLANO.escolherNicho). Volume de peça
   grande vai direto pra área do chão. */
VOLUMES.escolherNicho = function (pc) {
  const S = VOLUMES.S;
  if (pc.tipo === 'grande') return { nicho: 'CHAO', aviso: null };
  const ocup = {};
  S.pacotes.forEach(function (o) { if (o.nicho && o.nicho !== 'CHAO' && !VOLUMES.embalado(o) && o.id !== pc.id) ocup[o.nicho] = o.id; });
  const mod = { pecasNicho: [{ c: Number(pc.c_mm), l: Number(pc.l_mm), e: Number(pc.h_mm) }] };
  const r = APEMB_PLANO.escolherNicho(mod, APEMB_PLANO.nichosDaEstante(VOLUMES.estanteCfg()), ocup);
  return { nicho: r.nicho ? r.nicho.id : 'CHAO', aviso: r.aviso };
};

/* ---------------------------------------------------------- apontar */

VOLUMES.apontar = async function (txt) {
  const S = VOLUMES.S;
  if (!S) return;
  const cod = VOLUMES.normalizar(txt);
  if (!cod) return;
  const hit = S.porCodigo[cod];
  if (!hit) { VOLUMES.msg('erro', 'Código ' + UI.esc(cod) + ' não é deste lote.'); VOLUMES.bip(false); return; }
  const p = hit.peca, pc = hit.pacote;
  S.alvo = pc.id;
  if (p.apontado_at) { VOLUMES.mostrar(p, pc, 'Já apontada — '); VOLUMES.bip(true); VOLUMES.redesenhar(); return; }
  try {
    let avisoNicho = null;
    if (!pc.nicho) {
      const r = VOLUMES.escolherNicho(pc);
      await PACOTES_DB.setNicho(pc.id, r.nicho);
      pc.nicho = r.nicho; avisoNicho = r.aviso;
    }
    const r = await PACOTES_DB.apontar(S.batchId, cod);
    p.apontado_at = r.peca.apontado_at;
    if (r.completou && pc.status === 'aberto') { pc.status = 'completo'; pc.completed_at = new Date().toISOString(); }
    S.hist.push(cod);
    VOLUMES.$('vol-desfazer').disabled = false;
    pc._avisoNicho = avisoNicho;
    VOLUMES.mostrar(p, pc, '');
    VOLUMES.bip(true);
  } catch (err) {
    console.error('[volumes]', err);
    VOLUMES.msg('erro', 'Não gravou: ' + UI.esc(err.message || String(err)));
    VOLUMES.bip(false);
  }
  VOLUMES.redesenhar();
};

VOLUMES.desfazer = async function () {
  const S = VOLUMES.S;
  if (!S || !S.hist.length) return;
  const cod = S.hist.pop();
  const hit = S.porCodigo[cod];
  if (!hit) return;
  try {
    await PACOTES_DB.desapontar(S.batchId, cod);
    hit.peca.apontado_at = null;
    hit.pacote.status = 'aberto'; hit.pacote.completed_at = null; hit.pacote.packed_at = null;
    S.alvo = hit.pacote.id;
    VOLUMES.msg('info', 'Desfeito: ' + UI.esc(cod) + ' voltou a ficar pendente no ' + UI.esc(hit.pacote.rotulo) + '.');
  } catch (err) { VOLUMES.msg('erro', 'Não desfez: ' + UI.esc(err.message || String(err))); }
  VOLUMES.$('vol-desfazer').disabled = !S.hist.length;
  VOLUMES.redesenhar();
};

VOLUMES.mostrar = function (p, pc, prefixo) {
  const feitas = VOLUMES.apontadas(pc), total = pc.pecas.length;
  const onde = pc.nicho === 'CHAO' ? 'ÁREA DO CHÃO' + (pc.tipo === 'grande' ? ' (peça grande)' : '') : 'nicho <b>' + UI.esc(pc.nicho || '?') + '</b>';
  let html = '<span class="apemb-big">' + prefixo + '<b>' + UI.esc(p.piece_code) + '</b> · ' + UI.esc(p.reference || '') + ' ' +
    Math.round(p.c_mm) + ' × ' + Math.round(p.l_mm) + ' × ' + Math.round(p.e_mm) + ' mm' + (p.color_name ? ' · ' + UI.esc(p.color_name) : '') + '</span><br>' +
    '→ <b>' + UI.esc(pc.rotulo) + '</b> (' + UI.esc(pc.module_number || '') + ' · ' + UI.esc(pc.module_name || 'avulsas') + ' · ' + UI.esc(pc.po_name || '') + ') → ' + onde +
    ' · camada ' + p.camada + ' de ' + pc.n_camadas + (p.camada === 1 ? ' — é a BASE do volume' : '') + ' · ' + feitas + '/' + total + ' peças';
  if (pc._avisoNicho) html += '<div class="apemb-calco-aviso">' + UI.esc(pc._avisoNicho) + '</div>';
  if (VOLUMES.completo(pc) && !VOLUMES.embalado(pc)) {
    html += '<div class="apemb-calco-aviso" style="color:#14532d">✓ VOLUME COMPLETO — arquear. Veja abaixo como empilhar e onde passar as fitas; depois clique em "Embalado".</div>';
    VOLUMES.msg('ok', html);
  } else VOLUMES.msg('info', html);
};

VOLUMES.msg = function (tipo, html) {
  const el = VOLUMES.$('vol-msg');
  el.className = 'apemb-msg apemb-msg-' + tipo;
  el.innerHTML = html;
};

VOLUMES.bip = function (ok) {
  try {
    const ctx = VOLUMES._ac || (VOLUMES._ac = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = ok ? 1200 : 220; o.type = 'square';
    g.gain.value = 0.06; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (ok ? 0.08 : 0.3));
  } catch (e) { /* sem áudio */ }
};

VOLUMES.embalar = async function (pkgId) {
  const S = VOLUMES.S, pc = S && S.porId[pkgId];
  if (!pc || !VOLUMES.completo(pc)) return;
  try {
    await PACOTES_DB.embalar(pkgId);
    pc.status = 'embalado'; pc.packed_at = new Date().toISOString();
    S.alvo = pkgId;
    const pos = pc.pallet_pos;
    VOLUMES.msg('ok', '<span class="apemb-big">✓ <b>' + UI.esc(pc.rotulo) + '</b> embalado' + (pc.nicho && pc.nicho !== 'CHAO' ? ' — nicho ' + UI.esc(pc.nicho) + ' liberado' : '') + '.</span><br>' +
      (pc.pallet_n ? 'Vai pro <b>pallet ' + pc.pallet_n + '</b> do pedido ' + UI.esc(pc.po_name || '') + (pos ? ' · nível ' + pos.nivel + ' · posição ' + pos.seq + ' (x ' + Math.round(pos.x) + ', y ' + Math.round(pos.y) + ' mm)' : '')
        : 'Volume mais largo que o pallet padrão — vai em separado.'));
    VOLUMES.bip(true);
  } catch (err) { VOLUMES.msg('erro', 'Não gravou: ' + UI.esc(err.message || String(err))); }
  VOLUMES.redesenhar();
};

VOLUMES.desembalar = async function (pkgId) {
  const S = VOLUMES.S, pc = S && S.porId[pkgId];
  if (!pc) return;
  try { await PACOTES_DB.desembalar(pkgId); pc.status = 'completo'; pc.packed_at = null; S.alvo = pkgId; }
  catch (err) { VOLUMES.msg('erro', 'Não gravou: ' + UI.esc(err.message || String(err))); }
  VOLUMES.redesenhar();
};

VOLUMES.abrir = function (pkgId) {
  const S = VOLUMES.S;
  if (!S || !S.porId[pkgId]) return;
  S.alvo = pkgId;
  VOLUMES.redesenhar();
  const el = VOLUMES.$('vol-embalar');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

VOLUMES.salvarCfg = function () {
  const $ = VOLUMES.$;
  const nums = function (s) { return String(s).split(/[,;\s]+/).map(Number).filter(function (v) { return v > 0; }); };
  const cfg = { colunas: nums($('vol-cols').value), linhas: nums($('vol-linhas').value), prof: Number($('vol-prof').value) || 800 };
  if (!cfg.colunas.length || !cfg.linhas.length) { alert('Informe as colunas e as linhas da estante.'); return; }
  try { localStorage.setItem('legno.apemb.estante.v1', JSON.stringify(cfg)); } catch (e) { /* ok */ }
  VOLUMES.redesenhar();
};

/* ---------------------------------------------------------- desenho */

VOLUMES.redesenhar = function () {
  if (!VOLUMES.S) return;
  VOLUMES.desenharResumo();
  VOLUMES.desenharEstante();
  VOLUMES.desenharChao();
  VOLUMES.desenharEmbalar();
  VOLUMES.desenharPallets();
  VOLUMES.desenharLista();
};

VOLUMES.desenharResumo = function () {
  const S = VOLUMES.S;
  const total = Object.keys(S.porCodigo).length;
  let feitas = 0;
  Object.keys(S.porCodigo).forEach(function (k) { if (S.porCodigo[k].peca.apontado_at) feitas++; });
  const completos = S.pacotes.filter(VOLUMES.completo).length, embalados = S.pacotes.filter(VOLUMES.embalado).length;
  const nPallets = S.pallets.reduce(function (s, r) { return s + (r.n_pallets || 0); }, 0);
  VOLUMES.$('vol-resumo').innerHTML = '<div class="erp-grid erp-grid-4" style="margin-bottom:10px">' +
    UI.kpi('Peças apontadas', '<span class="apemb-kpi-grande">' + feitas + '</span> / ' + total, total ? Math.round(100 * feitas / total) + '%' : '') +
    UI.kpi('Volumes completos', '<span class="apemb-kpi-grande">' + completos + '</span> / ' + S.pacotes.length, 'prontos pra arquear') +
    UI.kpi('Embalados', '<span class="apemb-kpi-grande">' + embalados + '</span> / ' + S.pacotes.length, 'no pallet') +
    UI.kpi('Pallets', '<span class="apemb-kpi-grande">' + nPallets + '</span>', S.pallets.length + ' pedido(s)') +
  '</div>';
};

VOLUMES.desenharEstante = function () {
  const S = VOLUMES.S, cfg = VOLUMES.estanteCfg();
  const nichos = APEMB_PLANO.nichosDaEstante(cfg);
  const E = 19;
  const W = cfg.colunas.reduce(function (s, v) { return s + v; }, 0) + E * (cfg.colunas.length + 1);
  const H = cfg.linhas.reduce(function (s, v) { return s + v; }, 0) + E * (cfg.linhas.length + 1);
  const quem = {};
  S.pacotes.forEach(function (pc) { if (pc.nicho && pc.nicho !== 'CHAO' && !VOLUMES.embalado(pc)) (quem[pc.nicho] = quem[pc.nicho] || []).push(pc); });
  let svg = '<svg class="apemb-svg" viewBox="-10 -10 ' + (W + 20) + ' ' + (H + 90) + '">' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#8a6a4a" rx="4"/>';
  const xCol = [], yLin = [];
  let acc = E; cfg.colunas.forEach(function (w) { xCol.push(acc); acc += w + E; });
  acc = E; cfg.linhas.forEach(function (h) { yLin.push(acc); acc += h + E; });
  nichos.forEach(function (n) {
    const x = xCol[n.coluna], y = yLin[n.linha];
    const fsN = Math.round(Math.min(n.W, n.H) * 0.16), fsM = Math.round(Math.min(n.W, n.H) * 0.28), fsS = Math.round(Math.min(n.W, n.H) * 0.13);
    const pcs = quem[n.id] || [];
    let cls = 'apemb-nicho';
    const alvo = pcs.find(function (pc) { return pc.id === S.alvo; });
    if (alvo && !VOLUMES.completo(alvo)) cls += ' apemb-pisca-verm';
    else if (pcs.some(VOLUMES.completo)) cls += ' apemb-pisca-verde';
    else if (pcs.length) cls += ' apemb-nicho-ocupado';
    svg += '<g class="apemb-nicho-g" onclick="VOLUMES.cliqueNicho(\'' + n.id + '\')">' +
      '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + n.W + '" height="' + n.H + '"/>' +
      '<text x="' + (x + 14) + '" y="' + (y + fsN + 6) + '" class="apemb-t-nicho" style="font-size:' + fsN + 'px">' + n.id + '</text>';
    pcs.forEach(function (pc, mi) {
      const feitas = pc.pecas.filter(function (p) { return p.apontado_at; });
      let zy = y + n.H;
      feitas.slice().sort(function (a, b) { return a.camada - b.camada; }).forEach(function (p) {
        const pw = Math.min(n.W - 20, Number(p.l_mm));
        const eh = Number(p.e_mm) * 1.5;
        zy -= eh;
        if (zy < y + fsN + 10) return;
        svg += '<rect x="' + (x + (n.W - pw) / 2) + '" y="' + zy + '" width="' + pw + '" height="' + eh + '" class="apemb-peca-nicho"/>';
      });
      svg += '<text x="' + (x + n.W - 14) + '" y="' + (y + fsM + mi * (fsM + fsS)) + '" text-anchor="end" class="apemb-t-mod" style="font-size:' + fsM + 'px">' + UI.esc(pc.rotulo.replace(/^Vol\. /, '')) + '</text>' +
        '<text x="' + (x + n.W - 14) + '" y="' + (y + fsM + fsS + 4 + mi * (fsM + fsS)) + '" text-anchor="end" class="apemb-t-mod-s" style="font-size:' + fsS + 'px">' +
        feitas.length + '/' + pc.pecas.length + (VOLUMES.completo(pc) ? ' ✓' : '') + '</text>';
    });
    svg += '</g>';
  });
  svg += '<text x="0" y="' + (H + 60) + '" class="apemb-t-cota" style="font-size:60px">' + Math.round(W) + ' mm · ' + cfg.colunas.length + ' × ' + cfg.linhas.length +
    ' nichos · prof. ' + cfg.prof + ' mm</text></svg>';
  VOLUMES.$('vol-estante').innerHTML = svg +
    '<div class="erp-muted erp-xs apemb-legenda"><i class="lg-verm"></i> onde pôr a peça lida <i class="lg-verde"></i> volume completo — arquear ' +
    '<i class="lg-ocup"></i> em andamento · clique num nicho pra ver o volume</div>';
};

VOLUMES.cliqueNicho = function (id) {
  const S = VOLUMES.S;
  const pc = S.pacotes.find(function (p) { return p.nicho === id && !VOLUMES.embalado(p); });
  if (pc) VOLUMES.abrir(pc.id);
};

VOLUMES.desenharChao = function () {
  const S = VOLUMES.S;
  const lista = S.pacotes.filter(function (pc) { return (pc.tipo === 'grande' || pc.nicho === 'CHAO') && !VOLUMES.embalado(pc); });
  if (!lista.length) { VOLUMES.$('vol-chao').innerHTML = '<span class="erp-muted erp-small">Nenhum volume no chão agora.</span>'; return; }
  VOLUMES.$('vol-chao').innerHTML = '<div class="apemb-chao">' + lista.map(function (pc) {
    const feitas = VOLUMES.apontadas(pc);
    let cls = 'apemb-chao-mod';
    if (pc.id === S.alvo && !VOLUMES.completo(pc)) cls += ' apemb-pisca-verm-bg';
    else if (VOLUMES.completo(pc)) cls += ' apemb-pisca-verde-bg';
    return '<span class="' + cls + '" onclick="VOLUMES.abrir(\'' + pc.id + '\')">' + UI.esc(pc.rotulo) + ' · ' + UI.esc(pc.module_name || 'avulsas') +
      ' · ' + Math.round(pc.c_mm) + ' × ' + Math.round(pc.l_mm) + ' — ' + feitas + '/' + pc.pecas.length + (pc.nicho ? '' : ' (ainda não começou)') + '</span>';
  }).join('') + '</div><div class="erp-muted erp-xs">Volumes de peça grande (&gt; ' + (S.batch && S.batch.volumes_opt && S.batch.volumes_opt.grandeMm || 900) +
    ' mm) nunca vão pra estante — ficam no chão, ao lado, e vão pro pallet especial do pedido.</div>';
};

/* Painel "como embalar" do volume alvo: camadas de baixo pra cima (vista de
   cima de cada camada), fitas, lista de peças com ✓, botão Embalado. */
VOLUMES.desenharEmbalar = function () {
  const S = VOLUMES.S, el = VOLUMES.$('vol-embalar');
  const pc = S.alvo && S.porId[S.alvo];
  if (!pc) { el.innerHTML = ''; return; }
  const pronto = VOLUMES.completo(pc), emb = VOLUMES.embalado(pc);
  const camadas = pc.camadas || [];
  const porCod = {}; pc.pecas.forEach(function (p) { porCod[p.piece_code] = p; });
  const esc = 200 / Math.max(Number(pc.c_mm), Number(pc.l_mm), 1);
  const svgCam = camadas.map(function (cam, i) {
    const w = Number(pc.c_mm) * esc, h = Number(pc.l_mm) * esc;
    let s = '<svg viewBox="-2 -2 ' + (w + 4) + ' ' + (h + 4) + '" style="width:' + Math.round(w) + 'px;height:' + Math.round(h) + 'px;display:block">' +
      '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#f3efe8" stroke="#b9a88f" stroke-dasharray="4 3"/>';
    cam.itens.forEach(function (it, k) {
      const p = porCod[it.codigo];
      const ok = p && p.apontado_at;
      s += '<rect x="' + (it.x * esc) + '" y="' + (it.y * esc) + '" width="' + (it.w * esc) + '" height="' + (it.d * esc) + '" class="apemb-vol-peca' + (k % 2 ? ' alt' : '') + '"' +
        (ok ? '' : ' fill="#fff" stroke-dasharray="3 2"') + '><title>' + UI.esc(it.codigo + ' · ' + (p ? p.reference : '') + ' ' + Math.round(it.w) + ' × ' + Math.round(it.d)) + '</title></rect>';
      const fs = Math.max(7, Math.min(11, it.d * esc * 0.5));
      s += '<text x="' + (it.x * esc + 3) + '" y="' + (it.y * esc + fs + 1) + '" style="font:600 ' + fs + 'px system-ui;fill:#3b2a18">' + UI.esc((p && p.reference || it.codigo).slice(0, 14)) + '</text>';
    });
    s += '</svg>';
    return '<div style="text-align:center"><div class="erp-xs erp-strong">Camada ' + (i + 1) + (i === 0 ? ' — BASE' : '') + ' · e ' + cam.e + '</div>' + s + '</div>';
  }).join('');
  const fitas = pc.fitas || {};
  const pecasHtml = pc.pecas.slice().sort(function (a, b) { return a.camada - b.camada; }).map(function (p) {
    return '<span class="apemb-pc' + (p.apontado_at ? ' ok' : '') + '" onclick="VOLUMES.apontar(\'' + p.piece_code + '\')" title="clique pra apontar">' +
      UI.esc(p.piece_code) + ' <i>' + UI.esc(p.reference || '') + ' ' + Math.round(p.c_mm) + '×' + Math.round(p.l_mm) + ' · cam ' + p.camada + '</i></span>';
  }).join('');
  const pos = pc.pallet_pos;
  el.innerHTML = '<div class="erp-panel apemb-embalar' + (pronto ? ' pronto' : '') + '">' +
    '<h2>' + UI.esc(pc.rotulo) + ' — ' + UI.esc(pc.module_number || '') + ' · ' + UI.esc(pc.module_name || 'peças avulsas') + ' · ' + UI.esc(pc.po_name || '') + (pc.client_name ? ' · ' + UI.esc(pc.client_name) : '') +
      (pc.tipo === 'grande' ? ' ' + UI.pill('peça grande', 'erp-pill-warn') : '') + ' ' +
      UI.pill(emb ? 'embalado' : (pronto ? 'completo — arquear' : 'em andamento ' + VOLUMES.apontadas(pc) + '/' + pc.pecas.length), emb ? 'erp-pill-neutral' : (pronto ? 'erp-pill-ok' : 'erp-pill-info')) + '</h2>' +
    '<div class="erp-muted erp-small">' + Math.round(pc.c_mm) + ' × ' + Math.round(pc.l_mm) + ' × ' + Math.round(pc.h_mm) + ' mm · ' + Number(pc.peso_kg).toFixed(1) + ' kg · ' + pc.n_camadas + ' camadas' +
      (pc.nicho ? ' · ' + (pc.nicho === 'CHAO' ? 'área do chão' : 'nicho ' + UI.esc(pc.nicho)) : '') +
      (pc.pallet_n ? ' · pallet ' + pc.pallet_n + (pos ? ', nível ' + pos.nivel + ', posição ' + pos.seq : '') : ' · não cabe no pallet padrão') +
      ((pc.avisos || []).length ? '<div class="apemb-calco-aviso">' + (pc.avisos || []).map(UI.esc).join(' ') + '</div>' : '') + '</div>' +
    '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin:10px 0">' + svgCam + '</div>' +
    '<ol class="apemb-passos">' +
      '<li>Base: <b>' + UI.esc(pc.base_piece_code || '') + '</b> (peça inteira, sólida), deitada.</li>' +
      '<li>Camadas 2 a ' + pc.n_camadas + ' por cima, como no desenho (peça iguais juntas; camada do meio pode ter mais de uma peça lado a lado).</li>' +
      '<li>Fitas: ' + (fitas.transversais || []).length + ' atravessada(s) a ' + (fitas.transversais || []).map(function (v) { return v + ' mm'; }).join(', ') + ' da ponta' +
        (fitas.longitudinal ? ' + 1 no sentido do comprimento' : '') + '.</li>' +
      '<li>' + (pc.pallet_n ? 'Depois: pallet <b>' + pc.pallet_n + '</b> do pedido, nível ' + (pos ? pos.nivel : '?') + '.' : 'Depois: vai em separado (mais largo que o pallet padrão).') + '</li>' +
    '</ol>' +
    '<div style="margin-top:8px">' + pecasHtml + '</div>' +
    '<div style="margin-top:10px;display:flex;gap:8px">' +
      (emb ? '<button class="erp-btn-secondary erp-btn-sm" onclick="VOLUMES.desembalar(\'' + pc.id + '\')">↶ Desfazer "embalado"</button>'
           : '<button class="erp-btn" ' + (pronto ? '' : 'disabled title="Ainda faltam peças"') + ' onclick="VOLUMES.embalar(\'' + pc.id + '\')">✓ Embalado — liberar nicho</button>') +
      '<button class="erp-btn-ghost erp-btn-sm" onclick="VOLUMES.S.alvo=null;VOLUMES.redesenhar()">fechar</button>' +
    '</div></div>';
};

/* Pallets de cada pedido: vista de cima por nível + vista de frente. */
VOLUMES.desenharPallets = function () {
  const S = VOLUMES.S, el = VOLUMES.$('vol-pallets');
  if (!S.pallets.length) { el.innerHTML = '<span class="erp-muted erp-small">Sem plano de pallets.</span>'; return; }
  S.nivelVisto = S.nivelVisto || {};
  el.innerHTML = S.pallets.map(function (row) {
    const plano = row.plano || {}, cfg = row.cfg || {};
    const pallets = plano.pallets || [];
    const cab = '<h3 style="margin:8px 0 4px">Pedido ' + UI.esc(row.po_name || '') + ' — ' + pallets.length + ' pallet(s) · padrão ' + UI.esc(cfg.nome || (cfg.planW + ' × ' + cfg.planD)) + '</h3>';
    const corpo = pallets.map(function (pal) {
      const key = row.id + '|' + pal.n;
      const itens = pal.itens || [];
      const cls = function (it) {
        const pc = S.porId[it.id];
        if (!pc) return 'apemb-it';
        if (pc.id === S.alvo) return 'apemb-it apemb-it-livre';
        if (VOLUMES.embalado(pc)) return 'apemb-it-vol-ok';
        if (VOLUMES.completo(pc)) return 'apemb-it-vol';
        return 'apemb-it';
      };
      const nivelAtivo = S.nivelVisto[key] || (function () {
        // o nível mais baixo que ainda tem volume não embalado
        const pend = itens.filter(function (it) { const pc = S.porId[it.id]; return pc && !VOLUMES.embalado(pc); });
        return pend.length ? Math.min.apply(null, pend.map(function (it) { return it.nivel; })) : (pal.niveis || [0]).length;
      })();
      const chips = (pal.niveis || []).map(function (z, i) {
        const n = i + 1;
        const doNivel = itens.filter(function (it) { return it.nivel === n; });
        const ok = doNivel.every(function (it) { const pc = S.porId[it.id]; return pc && VOLUMES.embalado(pc); });
        return '<button class="apemb-chip' + (n === nivelAtivo ? ' ativo' : '') + (ok ? ' ok' : '') + '" onclick="VOLUMES.verNivel(\'' + key + '\',' + n + ')">nível ' + n + ' · ' + Math.round(z) + ' mm</button>';
      }).join('');
      const W = pal.planW, D = pal.planD, m = 30;
      let top = '<svg class="apemb-svg" viewBox="' + (-m) + ' ' + (-m) + ' ' + (W + 2 * m) + ' ' + (D + 2 * m) + '">' +
        '<rect class="apemb-deck" x="0" y="0" width="' + W + '" height="' + D + '"/>';
      itens.filter(function (it) { return it.nivel < nivelAtivo; }).forEach(function (it) {
        top += '<rect class="apemb-it-abaixo" x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.d + '"/>';
      });
      itens.filter(function (it) { return it.nivel === nivelAtivo; }).forEach(function (it) {
        const pc = S.porId[it.id];
        top += '<g onclick="VOLUMES.abrir(\'' + it.id + '\')" style="cursor:pointer"><rect class="' + cls(it) + '" x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.d + '"/>' +
          '<text class="apemb-t-seq" x="' + (it.x + it.w / 2) + '" y="' + (it.y + it.d / 2 + 14) + '" text-anchor="middle" style="font-size:' + Math.max(30, Math.min(60, it.d * 0.35)) + 'px">' +
          (pc ? UI.esc(pc.rotulo.replace(/^Vol\. /, '')) : '?') + '</text></g>';
      });
      top += '</svg>';
      // frente (X × Z)
      const hMax = Math.max(pal.alturaCarga || 0, 200);
      let fr = '<svg class="apemb-svg apemb-svg-frente" viewBox="' + (-m) + ' ' + (-m) + ' ' + (W + 2 * m) + ' ' + (hMax + 2 * m + 40) + '">' +
        '<rect class="apemb-deck" x="0" y="' + hMax + '" width="' + W + '" height="40"/>';
      itens.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (it) {
        fr += '<rect class="' + cls(it) + (it.nivel === nivelAtivo ? ' apemb-fr-ativo' : '') + '" x="' + it.x + '" y="' + (hMax - it.z - it.e) + '" width="' + it.w + '" height="' + it.e + '"/>';
      });
      fr += '</svg>';
      const nEmb = itens.filter(function (it) { const pc = S.porId[it.id]; return pc && VOLUMES.embalado(pc); }).length;
      return '<div class="apemb-pallet"><div class="apemb-pallet-head erp-strong">Pallet ' + pal.n + (pal.tipo === 'especial' ? ' — ESPECIAL (peças grandes) ' + pal.planW + ' × ' + pal.planD : '') +
        ' <span class="erp-muted erp-small">' + itens.length + ' volumes · ' + nEmb + ' embalados · altura da carga ' + Math.round(pal.alturaCarga) + ' mm · ' + (pal.peso || 0) + ' kg</span></div>' +
        '<div class="apemb-niveis">' + chips + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;align-items:start">' + top + fr + '</div></div>';
    }).join('');
    const sem = (plano.semLugar || []).map(function (id) { return S.porId[id]; }).filter(Boolean);
    return cab + corpo + (sem.length ? '<div class="apemb-calco-aviso">Mais largos que o pallet — vão em separado: ' + sem.map(function (pc) { return UI.esc(pc.rotulo); }).join(', ') + '</div>' : '');
  }).join('') + '<div class="erp-muted erp-xs apemb-legenda"><i class="lg-livre"></i> volume selecionado <i class="lg-vol"></i> embalado (no pallet) <i class="lg-ok" style="background:#fff6ea;border-color:#8a5a26"></i> completo, ainda não embalado · clique no volume pra abrir</div>';
};

VOLUMES.verNivel = function (key, n) {
  VOLUMES.S.nivelVisto = VOLUMES.S.nivelVisto || {};
  VOLUMES.S.nivelVisto[key] = n;
  VOLUMES.desenharPallets();
};

/* Lista de todos os volumes, por pedido/módulo, com progresso. */
VOLUMES.desenharLista = function () {
  const S = VOLUMES.S;
  if (!S) return;
  const f = (VOLUMES.$('vol-filtro').value || '').trim().toLowerCase();
  const bate = function (pc) {
    if (!f) return true;
    const txt = [pc.rotulo, pc.module_number, pc.module_name, pc.po_name, pc.client_name, pc.nicho].concat(pc.pecas.map(function (p) { return p.piece_code + ' ' + (p.reference || ''); })).join(' ').toLowerCase();
    return txt.indexOf(f) >= 0;
  };
  const porPedido = {};
  S.pacotes.filter(bate).forEach(function (pc) { const k = pc.po_name || '(sem pedido)'; (porPedido[k] = porPedido[k] || []).push(pc); });
  VOLUMES.$('vol-lista').innerHTML = Object.keys(porPedido).map(function (k) {
    return '<div class="apemb-lista-sec"><div class="erp-strong">' + UI.esc(k) + ' <span class="erp-muted erp-small">' + porPedido[k].length + ' volumes</span></div>' +
      porPedido[k].map(function (pc) {
        const feitas = VOLUMES.apontadas(pc);
        const st = VOLUMES.embalado(pc) ? UI.pill('embalado', 'erp-pill-neutral') : (VOLUMES.completo(pc) ? UI.pill('completo', 'erp-pill-ok') : (feitas ? UI.pill(feitas + '/' + pc.pecas.length, 'erp-pill-info') : UI.pill('0/' + pc.pecas.length, 'erp-pill-neutral')));
        return '<div class="apemb-mod-linha"><a href="javascript:void(0)" onclick="VOLUMES.abrir(\'' + pc.id + '\')"><b>' + UI.esc(pc.rotulo) + '</b></a> · ' +
          UI.esc(pc.module_number || '') + ' ' + UI.esc(pc.module_name || 'avulsas') + ' · ' + Math.round(pc.c_mm) + ' × ' + Math.round(pc.l_mm) + ' × ' + Math.round(pc.h_mm) + ' · ' + Number(pc.peso_kg).toFixed(1) + ' kg · ' +
          pc.n_camadas + ' cam' + (pc.tipo === 'grande' ? ' · <b>GRANDE</b>' : '') + (pc.nicho ? ' · ' + (pc.nicho === 'CHAO' ? 'chão' : 'nicho ' + UI.esc(pc.nicho)) : '') +
          (pc.pallet_n ? ' · pallet ' + pc.pallet_n : '') + ' ' + st +
          '<div>' + pc.pecas.map(function (p) {
            return '<span class="apemb-pc' + (p.apontado_at ? ' ok' : '') + '" onclick="VOLUMES.apontar(\'' + p.piece_code + '\')">' + UI.esc(p.piece_code) + ' <i>' + UI.esc(p.reference || '') + '</i></span>';
          }).join('') + '</div></div>';
      }).join('') + '</div>';
  }).join('') || '<span class="erp-muted erp-small">Nada bate com o filtro.</span>';
};

/* Lista imprimível: um bloco por volume, com conteúdo e destino. */
VOLUMES.imprimirLista = function () {
  const S = VOLUMES.S;
  if (!S) return;
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Volumes ' + UI.esc(S.batchCode) + '</title><style>' +
    'body{font:12px system-ui,sans-serif;margin:16px}h1{font-size:18px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:3px 6px;vertical-align:top}th{background:#eee;text-align:left}' +
    '.g{background:#fff3d6}@media print{button{display:none}}</style></head><body>' +
    '<h1>Volumes — lote ' + UI.esc(S.batchCode) + '</h1><button onclick="print()">Imprimir</button>' +
    '<table><tr><th>#</th><th>Volume</th><th>Pedido / cliente</th><th>Módulo</th><th>Medidas (mm)</th><th>kg</th><th>Cam.</th><th>Pallet</th><th>Peças</th></tr>' +
    S.pacotes.map(function (pc) {
      return '<tr' + (pc.tipo === 'grande' ? ' class="g"' : '') + '><td>' + pc.seq + '</td><td><b>' + UI.esc(pc.rotulo) + '</b></td><td>' + UI.esc(pc.po_name || '') + '<br>' + UI.esc(pc.client_name || '') + '</td>' +
        '<td>' + UI.esc(pc.module_number || '') + ' ' + UI.esc(pc.module_name || '') + '</td><td>' + Math.round(pc.c_mm) + ' × ' + Math.round(pc.l_mm) + ' × ' + Math.round(pc.h_mm) + '</td>' +
        '<td>' + Number(pc.peso_kg).toFixed(1) + '</td><td>' + pc.n_camadas + '</td><td>' + (pc.pallet_n ? pc.pallet_n + (pc.pallet_pos ? ' / nív. ' + pc.pallet_pos.nivel : '') : 'separado') + '</td>' +
        '<td>' + pc.pecas.map(function (p) { return UI.esc(p.piece_code) + ' ' + UI.esc(p.reference || '') + ' (' + Math.round(p.c_mm) + '×' + Math.round(p.l_mm) + ')'; }).join('; ') + '</td></tr>';
    }).join('') + '</table></body></html>';
  const w = window.open('', '_blank');
  if (!w) { alert('O navegador bloqueou a janela. Libere pop-ups pra este site.'); return; }
  w.document.write(html); w.document.close();
};
