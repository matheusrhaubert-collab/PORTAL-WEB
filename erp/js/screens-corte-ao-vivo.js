/* Legno ERP — Produção → Corte ao vivo (TESTE) (#/corte-ao-vivo)
 *
 * Matt (2026-11-18): "quero melhorar o processo de empilhamento das peças e
 * controle do processo. Com o monitor da máquina podemos criar uma solução
 * just in time mostrando numa nova tela em cima da máquina em qual posição a
 * peça que acabou de ser cortada deve ficar e onde e como a etiqueta deve
 * ser posicionada na peça. A ideia é levar as peças prontas pra laminação de
 * forma mais simples de serem abastecidas. Quero um ambiente de teste
 * primeiro, podemos usar o lote 26-016 que já foi produzido, só pra testar,
 * não interferir em nada. (...) peça sem laminação num lugar, peça flatbord
 * 2C deixar na posição pronta pra entrar na máquina, 4L de outra forma,
 * peças muito grandes num carrinho separado (sempre conduzida por duas
 * pessoas)."
 *
 * SÓ LEITURA: lê o plano de corte do lote (cut_plans/cut_plan_sheets/
 * cut_plan_pieces) e não grava nada em lugar nenhum. A ordem das peças é a
 * ordem REAL de saída da máquina (LOTES.piecesInOutputOrder = a mesma da
 * numeração das etiquetas impressas e do XML), e a etiqueta desenhada é a
 * mesma que a máquina imprime (MAQUINA_EXPORT._buildLabelOps).
 *
 * Fase 2 (ao vivo): em vez do relógio da simulação, a peça "atual" vem do
 * monitor da máquina (C:\LegnoMonitor registra cada etiqueta impressa —
 * evento 307, doc = N.emf = número da etiqueta).
 *
 * Regras (ajustáveis na engrenagem, ficam salvas neste navegador):
 *   GRANDE  comprimento ≥ grandeC ou largura ≥ grandeL → carrinho de grandes, 2 pessoas
 *   4L      edge_banding 4 → fita nos 4 lados
 *   2C      edge_banding 2 → fita nos 2 lados compridos
 *   0       sem fita → direto pra furação/montagem
 */

const CAV = {};
CAV._s = null;        // estado da simulação
CAV._timer = null;

CAV.CFG_PADRAO = { grandeC: 2000, grandeL: 900, segPorPeca: 6, margemEtq: 30 };
CAV.cfg = function () {
  let c = {};
  try { c = JSON.parse(localStorage.getItem('legno_cav_cfg') || '{}') || {}; } catch (e) { c = {}; }
  return Object.assign({}, CAV.CFG_PADRAO, c);
};
CAV.salvaCfg = function (c) { try { localStorage.setItem('legno_cav_cfg', JSON.stringify(c)); } catch (e) { /* ok */ } };

CAV.DEST = {
  '0':  { nome: 'SEM FITA', cart: 'Carrinho 1', cor: '#6b7280', ico: '▭',
          como: 'Empilhe DEITADA. Maior embaixo. Vai direto pra furação / montagem.' },
  '2C': { nome: 'FITA 2C', cart: 'Carrinho 2', cor: '#2563eb', ico: '⇆',
          como: 'Empilhe DEITADA com o LADO COMPRIDO virado pra frente do carrinho — já na posição de entrar na coladeira.' },
  '4L': { nome: 'FITA 4L', cart: 'Carrinho 3', cor: '#16a34a', ico: '⬚',
          como: 'Empilhe DEITADA, lado comprido pra frente. Fita nos 4 lados: passa na coladeira nos curtos e nos compridos.' },
  'G':  { nome: 'GRANDE', cart: 'Carrinho 4', cor: '#dc2626', ico: '⚠',
          como: 'PEÇA GRANDE: SEMPRE 2 PESSOAS. Carrinho separado, em pé, encostada.' }
};

CAV.destino = function (p, cfg) {
  const d = LOTES.dimsPeca(p);
  if (d.c >= cfg.grandeC || d.l >= cfg.grandeL) return 'G';
  const e = Number(p.edge_banding) || 0;
  return e >= 4 ? '4L' : e >= 2 ? '2C' : '0';
};

/* ---------------------------------------------------------------- rota */
CAV.load = async function (p) {
  const batches = (await LOTES.batches()).filter(function (b) { return (b.cut_plans || []).length; });
  let id = p && p.id;
  if (!id) { const b = batches.find(function (x) { return /26-0016$/.test(x.code); }) || batches[0]; id = b && b.id; }
  return { batches: batches, batchId: id };
};

CAV.render = function (params, d) {
  const ops = d.batches.map(function (b) {
    return '<option value="' + UI.esc(b.id) + '"' + (b.id === d.batchId ? ' selected' : '') + '>' + UI.esc(b.code) + (b.name ? ' · ' + UI.esc(b.name) : '') + '</option>';
  }).join('');
  return CAV._css() +
    '<div id="cav" class="cav">' +
      '<div class="cav-top">' +
        '<div class="cav-tag">TESTE · SIMULAÇÃO</div>' +
        '<select id="cav-lote" class="cav-sel" title="Lote">' + ops + '</select>' +
        '<div class="cav-info" id="cav-info"></div>' +
        '<div class="cav-ctl">' +
          '<button id="cav-prev" title="Peça anterior (←)">◀</button>' +
          '<button id="cav-play" title="Play / pausa (espaço)">▶</button>' +
          '<button id="cav-next" title="Próxima peça (→)">▶|</button>' +
          '<select id="cav-vel" title="Velocidade"><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option><option value="10">10×</option></select>' +
          '<button id="cav-cfg" title="Regras">⚙</button>' +
          '<button id="cav-full" title="Tela cheia (TV)">⛶</button>' +
        '</div>' +
      '</div>' +
      '<div id="cav-cfgbox" class="cav-cfgbox" style="display:none"></div>' +
      '<div class="cav-main">' +
        '<div class="cav-col cav-chapa"><div class="cav-h">Chapa na máquina</div><div id="cav-chapa"></div><div class="cav-h" style="margin-top:14px">Próximas</div><div id="cav-fila"></div></div>' +
        '<div class="cav-col cav-peca"><div id="cav-peca"></div></div>' +
        '<div class="cav-col cav-dest"><div id="cav-dest"></div></div>' +
      '</div>' +
      '<div class="cav-carts" id="cav-carts"></div>' +
    '</div>';
};

CAV._css = function () {
  return '<style>' +
    '.cav{background:#111418;color:#f3f4f6;border-radius:14px;padding:14px 16px;min-height:calc(100vh - 150px);display:flex;flex-direction:column;gap:12px;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}' +
    '.cav:fullscreen{border-radius:0;min-height:100vh;padding:18px 22px}' +
    '.cav-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap}' +
    '.cav-tag{background:#f59e0b;color:#111;font-weight:800;font-size:12px;padding:4px 10px;border-radius:6px;letter-spacing:.05em}' +
    '.cav-sel,.cav-ctl select{background:#1f2937;color:#f3f4f6;border:1px solid #374151;border-radius:8px;padding:7px 10px;font-size:14px}' +
    '.cav-info{flex:1;font-size:18px;font-weight:600;color:#d1d5db}.cav-info b{color:#fff;font-size:22px}' +
    '.cav-ctl{display:flex;gap:6px}.cav-ctl button{background:#1f2937;color:#f3f4f6;border:1px solid #374151;border-radius:8px;padding:7px 12px;font-size:15px;cursor:pointer}' +
    '.cav-ctl button.on{background:#f59e0b;color:#111;border-color:#f59e0b}' +
    '.cav-cfgbox{background:#1f2937;border-radius:10px;padding:12px 14px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;font-size:13px}' +
    '.cav-cfgbox label{display:flex;flex-direction:column;gap:4px;color:#9ca3af}.cav-cfgbox input{width:110px;background:#111418;color:#fff;border:1px solid #374151;border-radius:6px;padding:6px}' +
    '.cav-cfgbox button{background:#f59e0b;border:0;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer}' +
    '.cav-main{display:grid;grid-template-columns:minmax(220px,24%) 1fr minmax(280px,30%);gap:14px;flex:1;min-height:0}' +
    '.cav-col{background:#1a1f26;border-radius:12px;padding:14px;min-height:0;overflow:hidden}' +
    '.cav-h{font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin:0 0 8px}' +
    '.cav-chapa svg{width:100%;height:auto;display:block}' +
    '.cav-fila-i{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #262c35;font-size:14px;color:#d1d5db}' +
    '.cav-fila-i i{flex:0 0 12px;height:12px;border-radius:3px}' +
    '.cav-fila-i span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.cav-peca{display:flex;flex-direction:column}' +
    '.cav-pnome{font-size:30px;font-weight:800;line-height:1.1}.cav-psub{font-size:17px;color:#9ca3af;margin:4px 0 10px}' +
    '.cav-pmed{font-size:26px;font-weight:700;color:#fbbf24}' +
    '.cav-desenho{flex:1;min-height:200px;display:flex;align-items:center;justify-content:center}.cav-desenho svg{width:100%;max-height:52vh}' +
    '.cav-etqtxt{font-size:17px;color:#e5e7eb;margin-top:8px;padding:10px 12px;background:#111418;border-radius:8px;border-left:5px solid #fbbf24}' +
    '.cav-dest{display:flex;flex-direction:column;gap:12px}' +
    '.cav-dcard{border-radius:14px;padding:18px;color:#fff;text-align:center}' +
    '.cav-dcart{font-size:22px;font-weight:700;opacity:.9}.cav-dnome{font-size:46px;font-weight:900;line-height:1.05;margin:6px 0}' +
    '.cav-dico{font-size:54px;line-height:1}.cav-dcomo{font-size:18px;line-height:1.35;text-align:left;background:#111418;border-radius:10px;padding:12px 14px;color:#e5e7eb}' +
    '.cav-2p{background:#dc2626;color:#fff;font-weight:900;font-size:26px;text-align:center;border-radius:10px;padding:10px;animation:cavpisca 1s infinite}' +
    '@keyframes cavpisca{50%{opacity:.55}}' +
    '.cav-etqprev{background:#fff;border-radius:6px;padding:4px}.cav-etqprev svg{width:100%;height:auto;display:block}' +
    '.cav-carts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}' +
    '.cav-cart{background:#1a1f26;border-radius:12px;padding:10px 14px;border-top:6px solid #555;transition:transform .2s}' +
    '.cav-cart.ativo{transform:translateY(-4px);box-shadow:0 0 0 3px #fbbf24}' +
    '.cav-cart b{font-size:16px}.cav-cart .n{font-size:28px;font-weight:800}.cav-cart small{color:#9ca3af;font-size:13px}' +
    '.cav-cbar{height:8px;border-radius:4px;background:#2b313b;overflow:hidden;margin-top:6px}.cav-cbar div{height:100%}' +
    '.cav-msg{padding:40px;text-align:center;color:#9ca3af;font-size:18px}' +
    '@media (max-width:1100px){.cav-main{grid-template-columns:1fr}.cav-carts{grid-template-columns:repeat(2,1fr)}}' +
    '</style>';
};

CAV.after = function (params, d) {
  const $ = function (id) { return document.getElementById(id); };
  $('cav-lote').addEventListener('change', function () { location.hash = '#/corte-ao-vivo/' + this.value; });
  $('cav-prev').addEventListener('click', function () { CAV.vai(-1); });
  $('cav-next').addEventListener('click', function () { CAV.vai(1); });
  $('cav-play').addEventListener('click', CAV.alternaPlay);
  $('cav-vel').addEventListener('change', function () { if (CAV._s) CAV._s.vel = Number(this.value) || 1; });
  $('cav-full').addEventListener('click', function () {
    const el = $('cav');
    if (document.fullscreenElement) document.exitFullscreen(); else if (el.requestFullscreen) el.requestFullscreen();
  });
  $('cav-cfg').addEventListener('click', CAV.abreCfg);
  if (!CAV._teclas) {
    CAV._teclas = true;
    document.addEventListener('keydown', function (ev) {
      if (!/^#\/corte-ao-vivo/.test(location.hash) || !CAV._s) return;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName)) return;
      if (ev.key === ' ') { ev.preventDefault(); CAV.alternaPlay(); }
      else if (ev.key === 'ArrowRight') CAV.vai(1);
      else if (ev.key === 'ArrowLeft') CAV.vai(-1);
    });
  }
  if (d.batchId) CAV.carrega(d.batchId);
  else $('cav-peca').innerHTML = '<div class="cav-msg">Nenhum lote com plano de corte.</div>';
};

CAV.carrega = async function (batchId) {
  const alvo = document.getElementById('cav-peca');
  alvo.innerHTML = '<div class="cav-msg">Carregando o plano do lote…</div>';
  try {
    const lote = await LOTES.batch(batchId);
    if (!lote || !lote._plans.length) { alvo.innerHTML = '<div class="cav-msg">Lote sem plano de corte.</div>'; return; }
    const plan = await LOTES.plan(lote._plans[0].id);
    const ordem = LOTES.piecesInOutputOrder(plan);
    const numero = MAQUINA_EXPORT._numerarPecas(plan);
    const machineNo = LOTES.sheetMachineNo(plan);
    const sheetById = {};
    plan._sheets.forEach(function (s) { sheetById[s.id] = s; });
    const cfg = CAV.cfg();
    const pecas = ordem.map(function (p) { return { p: p, n: numero[p.id], dest: CAV.destino(p, cfg), sh: sheetById[p.sheet_id] }; });
    if (CAV._timer) clearInterval(CAV._timer);
    CAV._s = { lote: lote, plan: plan, pecas: pecas, i: 0, tocando: false, vel: Number(document.getElementById('cav-vel').value) || 1, t: 0, machineNo: machineNo };
    CAV.desenha();
    CAV._timer = setInterval(CAV._tick, 200);
  } catch (err) {
    console.error('[corte ao vivo]', err);
    alvo.innerHTML = '<div class="cav-msg">Não consegui carregar: ' + UI.esc(LOTES.explainError ? LOTES.explainError(err) : (err.message || err)) + '</div>';
  }
};

CAV._tick = function () {
  if (!/^#\/corte-ao-vivo/.test(location.hash) || !document.getElementById('cav')) { clearInterval(CAV._timer); CAV._timer = null; return; }
  const s = CAV._s;
  if (!s || !s.tocando) return;
  s.t += 0.2 * s.vel;
  if (s.t >= CAV.cfg().segPorPeca) {
    s.t = 0;
    if (s.i >= s.pecas.length - 1) { s.tocando = false; CAV._botaoPlay(); return; }
    s.i++; CAV.desenha();
  }
};
CAV.alternaPlay = function () { if (!CAV._s) return; CAV._s.tocando = !CAV._s.tocando; CAV._s.t = 0; CAV._botaoPlay(); };
CAV._botaoPlay = function () {
  const b = document.getElementById('cav-play');
  if (b) { b.textContent = CAV._s && CAV._s.tocando ? '❚❚' : '▶'; b.classList.toggle('on', !!(CAV._s && CAV._s.tocando)); }
};
CAV.vai = function (delta) {
  const s = CAV._s;
  if (!s) return;
  s.i = Math.max(0, Math.min(s.pecas.length - 1, s.i + delta)); s.t = 0;
  CAV.desenha();
};

CAV.abreCfg = function () {
  const box = document.getElementById('cav-cfgbox');
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }
  const c = CAV.cfg();
  const campo = function (k, rot) { return '<label>' + rot + '<input type="number" id="cav-c-' + k + '" value="' + c[k] + '"></label>'; };
  box.innerHTML = campo('grandeC', 'Grande: comprimento ≥ (mm)') + campo('grandeL', 'Grande: largura ≥ (mm)') +
    campo('margemEtq', 'Etiqueta: distância da borda (mm)') + campo('segPorPeca', 'Simulação: segundos por peça') +
    '<button id="cav-c-ok">Aplicar</button>';
  box.style.display = '';
  document.getElementById('cav-c-ok').addEventListener('click', function () {
    const n = {};
    Object.keys(CAV.CFG_PADRAO).forEach(function (k) { const v = Number(document.getElementById('cav-c-' + k).value); n[k] = v > 0 ? v : CAV.CFG_PADRAO[k]; });
    CAV.salvaCfg(n);
    box.style.display = 'none';
    if (CAV._s) { CAV._s.pecas.forEach(function (x) { x.dest = CAV.destino(x.p, n); }); CAV.desenha(); }
  });
};

/* ------------------------------------------------------------- desenho */
CAV.desenha = function () {
  const s = CAV._s;
  if (!s || !s.pecas.length) return;
  const atual = s.pecas[s.i];
  const cfg = CAV.cfg();
  const sh = atual.sh;
  const nChapa = s.machineNo[sh.id] || { n: sh.index_no, total: '?', material: sh.color_name };
  const naChapa = s.pecas.filter(function (x) { return x.sh.id === sh.id; });
  const posNaChapa = naChapa.indexOf(atual) + 1;
  document.getElementById('cav-info').innerHTML =
    UI.esc(s.lote.code) + ' · Peça <b>' + (s.i + 1) + '/' + s.pecas.length + '</b> · Chapa <b>' + nChapa.n + '/' + nChapa.total + '</b> ' +
    UI.esc(nChapa.material) + ' · ' + posNaChapa + 'ª de ' + naChapa.length + ' nesta chapa';
  document.getElementById('cav-chapa').innerHTML = CAV._svgChapa(sh, s, atual);
  document.getElementById('cav-fila').innerHTML = s.pecas.slice(s.i + 1, s.i + 7).map(function (x) {
    const D = CAV.DEST[x.dest];
    return '<div class="cav-fila-i"><i style="background:' + D.cor + '"></i><span>#' + x.n + ' ' + UI.esc(x.p.reference || '') + '</span><small>' + D.nome + '</small></div>';
  }).join('') || '<div class="cav-fila-i">Fim do lote</div>';
  // peça atual
  const p = atual.p;
  const dm = LOTES.dimsPeca(p);
  const D = CAV.DEST[atual.dest];
  document.getElementById('cav-peca').innerHTML =
    '<div class="cav-pnome">#' + atual.n + ' · ' + UI.esc(p.reference || 'Peça') + '</div>' +
    '<div class="cav-psub">' + UI.esc([p.po_name, p.module_number ? 'Mód ' + p.module_number : '', p.module_name].filter(Boolean).join(' · ')) + '</div>' +
    '<div class="cav-pmed">' + Math.round(dm.c) + ' × ' + Math.round(dm.l) + ' × ' + (Number(p.espessura_mm) || 0) + ' mm</div>' +
    '<div class="cav-desenho">' + CAV._svgPeca(p, dm, atual.dest, cfg) + '</div>' +
    '<div class="cav-etqtxt">🏷️ ' + CAV._textoEtiqueta(dm, atual.dest, cfg) + '</div>';
  // destino
  document.getElementById('cav-dest').innerHTML =
    '<div class="cav-dcard" style="background:' + D.cor + '"><div class="cav-dico">' + D.ico + '</div><div class="cav-dcart">' + D.cart + '</div><div class="cav-dnome">' + D.nome + '</div></div>' +
    (atual.dest === 'G' ? '<div class="cav-2p">👥 2 PESSOAS</div>' : '') +
    '<div class="cav-dcomo">' + D.como + '</div>' +
    '<div class="cav-h">Etiqueta que saiu agora</div><div class="cav-etqprev">' + CAV._svgEtiqueta(p, atual.n, nChapa.n) + '</div>';
  // carrinhos
  const tot = {}, feitas = {};
  s.pecas.forEach(function (x, k) { tot[x.dest] = (tot[x.dest] || 0) + 1; if (k <= s.i) feitas[x.dest] = (feitas[x.dest] || 0) + 1; });
  document.getElementById('cav-carts').innerHTML = ['0', '2C', '4L', 'G'].map(function (k) {
    const C = CAV.DEST[k], t = tot[k] || 0, f = feitas[k] || 0;
    return '<div class="cav-cart' + (k === atual.dest ? ' ativo' : '') + '" style="border-top-color:' + C.cor + '"><b>' + C.cart + ' · ' + C.nome + '</b>' +
      '<div><span class="n">' + f + '</span><small> / ' + t + ' peças</small></div>' +
      '<div class="cav-cbar"><div style="width:' + (t ? Math.round(100 * f / t) : 0) + '%;background:' + C.cor + '"></div></div></div>';
  }).join('');
};

// chapa com as peças: já saiu (apagada), agora (amarela), ainda vai sair (contorno na cor do destino)
CAV._svgChapa = function (sh, s, atual) {
  const W = Number(sh.width_mm) || 2750, H = Number(sh.height_mm) || 1830;
  const idx = {};
  s.pecas.forEach(function (x, k) { idx[x.p.id] = k; });
  const r = (sh._pieces || []).map(function (p) {
    const k = idx[p.id], x = s.pecas[k];
    const cor = x ? CAV.DEST[x.dest].cor : '#666';
    const ehAtual = p.id === atual.p.id, saiu = k < s.i;
    return '<rect x="' + p.x_mm + '" y="' + p.y_mm + '" width="' + p.w_mm + '" height="' + p.h_mm + '" fill="' +
      (ehAtual ? '#fbbf24' : saiu ? '#2b313b' : cor + '55') + '" stroke="' + (ehAtual ? '#fff' : cor) + '" stroke-width="' + (ehAtual ? 14 : 5) + '"/>' +
      (Math.min(p.w_mm, p.h_mm) > 160 ? '<text x="' + (p.x_mm + p.w_mm / 2) + '" y="' + (p.y_mm + p.h_mm / 2) + '" fill="' + (ehAtual ? '#111' : saiu ? '#555' : '#e5e7eb') + '" font-size="110" font-weight="700" text-anchor="middle" dominant-baseline="middle">' + (x ? x.n : '') + '</text>' : '');
  }).join('');
  return '<svg viewBox="-20 -20 ' + (W + 40) + ' ' + (H + 40) + '"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0d1014" stroke="#4b5563" stroke-width="8"/>' + r + '</svg>';
};

// peça vista de cima, lado comprido na horizontal, fitas em laranja, etiqueta em escala no lugar certo
CAV._svgPeca = function (p, dm, dest, cfg) {
  const C = dm.c, L = dm.l, m = Math.max(C, L) * 0.08;
  const e = Number(p.edge_banding) || 0;
  const fw = Math.max(C, L) * 0.012;
  const fita = '#f97316';
  let bordas = '';
  // fita desenhada POR FORA da peça (não cobre a etiqueta)
  if (e >= 2) bordas += '<rect x="0" y="' + (-fw * 1.6) + '" width="' + C + '" height="' + fw * 1.6 + '" fill="' + fita + '"/><rect x="0" y="' + L + '" width="' + C + '" height="' + fw * 1.6 + '" fill="' + fita + '"/>';
  if (e >= 4) bordas += '<rect x="' + (-fw * 1.6) + '" y="0" width="' + fw * 1.6 + '" height="' + L + '" fill="' + fita + '"/><rect x="' + C + '" y="0" width="' + fw * 1.6 + '" height="' + L + '" fill="' + fita + '"/>';
  const et = CAV._posEtiqueta(C, L, cfg);
  // anel amarelo piscando em volta da etiqueta: ela é pequena perto de peça grande
  const anel = Math.max(et.w, et.h) * 0.9 + Math.max(C, L) * 0.03;
  const etq = '<circle cx="' + (et.x + et.w / 2) + '" cy="' + (et.y + et.h / 2) + '" r="' + anel + '" fill="none" stroke="#fbbf24" stroke-width="' + fw * 0.8 + '"><animate attributeName="opacity" values="1;.25;1" dur="1s" repeatCount="indefinite"/></circle>' +
    '<g transform="translate(' + et.x + ',' + et.y + ')"><rect width="' + et.w + '" height="' + et.h + '" fill="#fff" stroke="#111" stroke-width="' + fw * 0.4 + '"/>' +
    '<rect x="' + et.w * 0.1 + '" y="' + et.h * 0.25 + '" width="' + et.w * 0.8 + '" height="' + et.h * 0.18 + '" fill="#111"/>' +
    '<rect x="' + et.w * 0.1 + '" y="' + et.h * 0.58 + '" width="' + et.w * 0.5 + '" height="' + et.h * 0.08 + '" fill="#555"/></g>';
  // seta do canto de referência (perto do operador)
  const fs = Math.max(C, L) * 0.045;
  const cotas = '<text x="' + C / 2 + '" y="' + (L + m * 0.75) + '" fill="#9ca3af" font-size="' + fs + '" text-anchor="middle">' + Math.round(C) + ' mm</text>' +
    '<text x="' + (-m * 0.35) + '" y="' + L / 2 + '" fill="#9ca3af" font-size="' + fs + '" text-anchor="middle" transform="rotate(-90 ' + (-m * 0.35) + ' ' + L / 2 + ')">' + Math.round(L) + ' mm</text>';
  const legenda = e ? '<text x="' + C + '" y="' + (-m * 0.35) + '" fill="' + fita + '" font-size="' + fs + '" text-anchor="end" font-weight="700">' + (e >= 4 ? 'FITA NOS 4 LADOS' : 'FITA NOS 2 LADOS COMPRIDOS') + '</text>'
    : '<text x="' + C + '" y="' + (-m * 0.35) + '" fill="#9ca3af" font-size="' + fs + '" text-anchor="end">SEM FITA</text>';
  return '<svg viewBox="' + (-m) + ' ' + (-m) + ' ' + (C + 2 * m) + ' ' + (L + 2 * m) + '">' +
    '<rect x="0" y="0" width="' + C + '" height="' + L + '" fill="#d6c3a5" stroke="#f3f4f6" stroke-width="' + fw * 0.5 + '"/>' +
    bordas + etq + cotas + legenda + '</svg>';
};

// etiqueta 76,2 × 50,8: no canto de baixo/esquerda (perto do operador), a `margemEtq` das bordas,
// texto no sentido do comprimento. Peça pequena demais pra margem: no centro.
CAV._posEtiqueta = function (C, L, cfg) {
  const w = 76.2, h = 50.8, mg = cfg.margemEtq;
  if (C >= w + 2 * mg && L >= h + 2 * mg) return { x: mg, y: L - mg - h, w: w, h: h, canto: true };
  return { x: Math.max(0, (C - w) / 2), y: Math.max(0, (L - h) / 2), w: Math.min(w, C), h: Math.min(h, L), canto: false };
};
CAV._textoEtiqueta = function (dm, dest, cfg) {
  const et = CAV._posEtiqueta(dm.c, dm.l, cfg);
  const base = et.canto
    ? 'Cole na <b>face de cima</b>, no <b>canto mais perto de você</b> (esquerda, embaixo), a <b>' + cfg.margemEtq / 10 + ' cm</b> das bordas, com o texto no sentido do comprimento.'
    : 'Peça pequena: cole <b>no centro</b> da face de cima, com o texto no sentido do comprimento.';
  return base + (dest === '2C' || dest === '4L' || dest === 'G' ? ' Nunca encostada na borda que leva fita.' : '');
};

// a etiqueta impressa de verdade (MAQUINA_EXPORT._buildLabelOps) em SVG
CAV._svgEtiqueta = function (p, n, nChapa) {
  try {
    const ops = MAQUINA_EXPORT._buildLabelOps(p, n, nChapa);
    const esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    const body = ops.map(function (o) {
      if (o.type === 'rect') return '<rect x="' + o.x + '" y="' + o.y + '" width="' + o.w + '" height="' + o.h + '" fill="#000"/>';
      if (o.type === 'text' && o.text) {
        const anc = o.align === 'right' ? 'end' : o.align === 'center' ? 'middle' : 'start';
        const c = o.color ? 'rgb(' + o.color.join(',') + ')' : '#000';
        return '<text x="' + o.x + '" y="' + o.y + '" font-size="' + (o.sizeMm || 3) + '" font-family="' + (o.face || 'Arial') + '" font-weight="' + (o.bold ? 700 : 400) +
          '" fill="' + c + '" text-anchor="' + anc + '" dominant-baseline="hanging" xml:space="preserve">' + esc(o.text) + '</text>';
      }
      return '';
    }).join('');
    return '<svg viewBox="0 0 76.2 50.8">' + body + '</svg>';
  } catch (e) { return '<div style="color:#111;padding:8px">#' + n + ' ' + UI.esc(p.piece_code || '') + '</div>'; }
};
