/* App do celular da fábrica (erp/celular.html) — 27/11/2026.
 *
 * Matt: "app pra celular so pra apontamento das pecas, retalhos, processos do
 * ERP. uma peca que estragou: refazer peca estragada, leio a etiqueta e ele gera
 * um plano de corte automatico e manda pra maquina, uma ou mais pecas" +
 * "apontar qualquer peca da pilha, abre o lote e cor e botao confirmar
 * laminacao" + "pouquissimos botoes, muito simples".
 *
 * 4 botões: Apontar · Refazer peça · Laminação · Retalho. Cada tela já abre a
 * câmera (código de barras Code 39 da etiqueta, PC-000123 / RET-000123).
 * Leitor: BarcodeDetector (Android/Chrome) ou ZXing carregado da internet
 * (iPhone). Leitor bluetooth/USB também funciona: ele "digita" + Enter no campo.
 *
 * Refazer: cria lote novo "Refazer · …" com cópia das peças (sem order_id — o
 * Packing do portal não conta em dobro), roda o MESMO otimizador do ERP
 * (NESTING.run + LOTES.savePlan) com o perfil padrão de parâmetros, marca o
 * plano origem='celular' e ele cai na fila do PC da seccionadora (ERP › Plano
 * de corte › "Fila do celular" › Mandar pra máquina — erp/js/celular-fila.js).
 * Apontar a peça refeita aponta também a original.
 * Banco: migration 355.
 */
const CEL = { tela: 'home', scan: null, ultimo: null, refazer: [], motivo: '', ret: null, _apCont: 0 };

CEL.esc = function (s) { return UI.esc(s); };
CEL.$ = function (id) { return document.getElementById(id); };
CEL.erp = function () { return LOTES.erp(); };
CEL.mm = function (v) { const n = Number(v) || 0; return (Math.round(n * 10) / 10).toString().replace('.', ','); };
CEL.quem = function () { return DATA.user ? (DATA.user.email || '') : ''; };
CEL.hora = function (iso) { const d = new Date(iso); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
CEL.erro = function (e) { try { return LOTES.explainError(e); } catch (x) { return String((e && e.message) || e); } };

CEL.render = function (html) { CEL.pararCamera(); document.getElementById('app').innerHTML = html; window.scrollTo(0, 0); };

CEL.topo = function (titulo) {
  return '<div class="cel-top"><button class="cel-back" onclick="CEL.home()">‹</button><h1>' + titulo + '</h1></div>';
};

/* ---------------- Início / login ---------------- */
CEL.boot = async function () {
  if (!DATA.sb()) { CEL.render('<div class="cel-msg">' + CEL.esc(DATA.connectionProblem() || 'Sem conexão.') + '</div>'); return; }
  try { await DATA.loadSession(); } catch (e) { /* sem rede: cai no login */ }
  if (!DATA.user) return CEL.login();
  if (!DATA.isEquipe) {
    return CEL.render('<div class="cel-login"><h1>Sem acesso</h1><p>Este login não é da equipe da fábrica.</p>' +
      '<button class="cel-go gray" style="width:100%;margin:16px 0" onclick="CEL.sair()">Sair</button></div>');
  }
  CEL.home();
};

CEL.login = function (erro) {
  CEL.render('<div class="cel-login"><h1>Fábrica</h1>' +
    '<div class="cel-form" style="margin:0">' +
      '<label>E-mail<input id="lg-e" type="email" autocomplete="username"></label>' +
      '<label>Senha<input id="lg-s" type="password" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')CEL.entrar(CEL.$(\'lg-b\'))"></label>' +
    '</div>' + (erro ? '<div class="cel-card err" style="margin:12px 0">' + CEL.esc(erro) + '</div>' : '') +
    '<button class="cel-go" id="lg-b" style="width:100%;margin:16px 0" onclick="CEL.entrar(this)">Entrar</button></div>');
};
CEL.entrar = async function (btn) {
  if (btn) btn.disabled = true;
  try { await DATA.signIn(CEL.$('lg-e').value.trim(), CEL.$('lg-s').value); CEL.boot(); }
  catch (e) { CEL.login('Não entrou: ' + (e.message || e)); }
};
CEL.sair = async function () { await DATA.signOut(); CEL.login(); };

CEL.home = function () {
  CEL.tela = 'home'; CEL._religa = null;
  CEL.render('<div class="cel-top"><h1>Fábrica</h1><div class="cel-quem">' + CEL.esc(CEL.quem()) + '<br><button onclick="CEL.sair()">sair</button></div></div>' +
    '<div class="cel-home">' +
      '<button class="cel-big c-ap" onclick="CEL.telaApontar()"><span>✓</span>Apontar peça</button>' +
      '<button class="cel-big c-rf" onclick="CEL.telaRefazer()"><span>↻</span>Refazer peça</button>' +
      '<button class="cel-big c-lm" onclick="CEL.telaLaminacao()"><span>▤</span>Laminação</button>' +
      '<button class="cel-big c-rt" onclick="CEL.telaRetalho()"><span>▭</span>Retalho</button>' +
      '<button class="cel-big c-bp" onclick="CEL.telaBuscar()"><span>⌕</span>Buscar no projeto</button>' +
    '</div>');
};

/* ---------------- Câmera / leitor ---------------- */
CEL.leitorHtml = function () {
  return '<div class="cel-cam" onclick="CEL.alternaTrava()"><video id="cel-video" playsinline muted></video><div class="mira"></div><div class="dica" id="cel-dica"></div><div class="camerr" id="cel-camerr" style="display:none"></div></div>' +
    '<div class="cel-dig"><input id="cel-cod" placeholder="ou digite o código" autocapitalize="characters" autocomplete="off" ' +
      'onkeydown="if(event.key===\'Enter\'){CEL.digitado();}"><button onclick="CEL.digitado()">OK</button></div>';
};
CEL.digitado = function () {
  const el = CEL.$('cel-cod'); if (!el) return;
  const v = el.value; el.value = '';
  if (v.trim()) CEL.lido(v, true);
};
/* "pc-930", "PC000930", "*PC-000930*" → "PC-000930" */
CEL.normaliza = function (raw) {
  let s = String(raw || '').toUpperCase().replace(/\s+/g, '').replace(/^\*|\*$/g, '');
  const m = s.match(/^(PC|RET)-?(\d{1,9})$/);
  if (m) s = m[1] + '-' + m[2].padStart(6, '0');
  return s;
};
CEL.lido = function (raw, manual) {
  const code = CEL.normaliza(raw);
  if (!code) return;
  const agora = Date.now();
  // mesma etiqueta parada na frente da câmera não conta de novo
  if (!manual && CEL.ultimo && CEL.ultimo.code === code && agora - CEL.ultimo.t < 3000) { CEL.ultimo.t = agora; return; }
  CEL.ultimo = { code: code, t: agora };
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) {}
  CEL.bip();
  if (CEL.onCodigo) CEL.onCodigo(code);
};
CEL.bip = function () {
  try {
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    CEL._ac = CEL._ac || new C();
    const o = CEL._ac.createOscillator(), g = CEL._ac.createGain();
    o.frequency.value = 1500; g.gain.value = 0.08; o.connect(g); g.connect(CEL._ac.destination);
    o.start(); o.stop(CEL._ac.currentTime + 0.08);
  } catch (e) {}
};
CEL.carregaZxing = function () {
  if (window.ZXing) return Promise.resolve();
  if (CEL._zx) return CEL._zx;
  CEL._zx = new Promise(function (ok, ruim) {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
    s.onload = ok; s.onerror = function () { CEL._zx = null; ruim(new Error('não carregou o leitor de código de barras')); };
    document.head.appendChild(s);
  });
  return CEL._zx;
};
/* TRAVAR A IMAGEM (27/11, Matt: "melhor clicar pra travar a imagem, porque
   conforme mexe o celular ele vai se perdendo. aperta na tela e ele trava,
   depois aperta e libera"). Ao vivo continua lendo sozinho; tocar na imagem
   congela o quadro (video.pause) e procura o código NESSA foto parada, com mais
   tentativas (quadro inteiro, faixa do meio e girado 90°). Toque de novo solta. */
CEL.ligarCamera = async function (onCodigo) {
  CEL.onCodigo = onCodigo;
  const video = CEL.$('cel-video');
  const erro = function (t) { const e = CEL.$('cel-camerr'); if (e) { e.style.display = 'flex'; e.textContent = t; } };
  if (!video) return;
  CEL.dicaCam('Aponte pra etiqueta — toque pra travar a imagem');
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { erro('Câmera indisponível neste navegador. Digite o código abaixo.'); return; }
  const token = { video: video, frozen: false }; CEL.scan = token;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    if (CEL.scan !== token) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
    token.stream = stream;
    video.srcObject = stream;
    await video.play();
    token.det = await CEL.detectorNativo();
    if (!token.det) { await CEL.carregaZxing(); token.zx = CEL.leitorZxing(); }
    if (CEL.scan !== token) return;
    const loop = async function () {
      if (CEL.scan !== token) return;
      if (!token.frozen && !token.busy) {
        try {
          const raw = token.det ? await CEL.lerNativo(token.det, video) : CEL.lerZxing(token.zx, video, false);
          if (raw && !token.frozen) CEL.lido(raw);
        } catch (e) {}
      }
      setTimeout(loop, token.det ? 180 : 220);
    };
    loop();
  } catch (e) {
    erro(/Permission|NotAllowed/i.test(String(e && (e.name || e.message))) ? 'Libere a câmera pra esta página. Ou digite o código abaixo.' : 'Não abriu a câmera: ' + (e.message || e) + '. Digite o código abaixo.');
  }
};

CEL.detectorNativo = async function () {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const fmts = await window.BarcodeDetector.getSupportedFormats();
    if (fmts.indexOf('code_39') < 0) return null;
    return new window.BarcodeDetector({ formats: ['code_39', 'code_128', 'qr_code'].filter(function (f) { return fmts.indexOf(f) >= 0; }) });
  } catch (e) { return null; }
};
CEL.lerNativo = async function (det, fonte) {
  const r = await det.detect(fonte);
  return r && r.length ? r[0].rawValue : null;
};
CEL.leitorZxing = function () {
  const Z = window.ZXing;
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.QR_CODE]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  const reader = new Z.MultiFormatReader(); reader.setHints(hints);
  return reader;
};
/* fonte = video ou canvas. faixaToda=false: só a faixa do meio (mira), mais
   rápido ao vivo. */
CEL.lerZxing = function (reader, fonte, faixaToda, girar) {
  const Z = window.ZXing;
  const vw = fonte.videoWidth || fonte.width, vh = fonte.videoHeight || fonte.height;
  if (!vw || !vh) return null;
  const y0 = faixaToda ? 0 : vh * 0.3, sh = faixaToda ? vh : vh * 0.4;
  const esc = Math.min(1, 1200 / vw);
  let cw = Math.round(vw * esc), ch = Math.round(sh * esc);
  const c = CEL._cv || (CEL._cv = document.createElement('canvas'));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (girar) { c.width = ch; c.height = cw; ctx.save(); ctx.translate(ch, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(fonte, 0, y0, vw, sh, 0, 0, cw, ch); ctx.restore(); }
  else { c.width = cw; c.height = ch; ctx.drawImage(fonte, 0, y0, vw, sh, 0, 0, cw, ch); }
  try {
    const res = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c))));
    return res ? res.getText() : null;
  } catch (e) { return null; }
};

/* Procura com calma num quadro parado: nativo no quadro inteiro; senão ZXing
   (quadro inteiro, faixa do meio, girado). */
CEL.lerQuadroParado = async function (token) {
  const v = token.video;
  const c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  if (token.det) { try { const r = await CEL.lerNativo(token.det, c); if (r) return r; } catch (e) {} }
  try { await CEL.carregaZxing(); } catch (e) { return null; }
  token.zx = token.zx || CEL.leitorZxing();
  return CEL.lerZxing(token.zx, c, true, false) || CEL.lerZxing(token.zx, c, false, false) ||
         CEL.lerZxing(token.zx, c, true, true);
};

CEL.dicaCam = function (t, cls) {
  const d = CEL.$('cel-dica'); if (!d) return;
  d.textContent = t; d.className = 'dica' + (cls ? ' ' + cls : '');
};

CEL.alternaTrava = async function () {
  const t = CEL.scan; if (!t || !t.stream) return;
  if (t.frozen) {
    t.frozen = false;
    try { await t.video.play(); } catch (e) {}
    CEL.dicaCam('Aponte pra etiqueta — toque pra travar a imagem');
    return;
  }
  t.frozen = true; t.busy = true;
  t.video.pause();
  CEL.dicaCam('Travada · lendo…', 'trava');
  let raw = null;
  try { raw = await CEL.lerQuadroParado(t); } catch (e) {}
  t.busy = false;
  if (CEL.scan !== t || !t.frozen) return;
  if (raw) { CEL.dicaCam('Travada · lido ✓ — toque pra soltar', 'trava ok'); CEL.lido(raw, true); }
  else { CEL.dicaCam('Não achei o código nessa imagem — toque pra soltar e tente de novo', 'trava ruim'); try { if (navigator.vibrate) navigator.vibrate([40, 60, 40]); } catch (e) {} }
};

CEL.pararCamera = function () {
  const t = CEL.scan; CEL.scan = null; CEL.onCodigo = null;
  if (t && t.stream) t.stream.getTracks().forEach(function (x) { x.stop(); });
};
document.addEventListener('visibilitychange', function () {
  if (document.hidden) { const r = CEL._religa; CEL.pararCamera(); CEL._religa = r; }
  else if (CEL._religa && CEL.$('cel-video')) CEL._religa();
});

/* ---------------- Busca da peça pela etiqueta ---------------- */
/* Devolve { cpp, plan, bp, batch, unit } ou lança Error com texto pro operador. */
CEL.peca = async function (code) {
  if (!/^PC-/.test(code)) throw new Error(code + ' não é etiqueta de peça (PC-…).');
  const erp = CEL.erp();
  const { data: cpp, error } = await erp.from('cut_plan_pieces').select('*').eq('piece_code', code).maybeSingle();
  if (error) throw error;
  if (!cpp) throw new Error('Etiqueta ' + code + ' não existe em nenhum plano.');
  const [pl, irmas] = await Promise.all([
    erp.from('cut_plans').select('id, code, batch_id, status').eq('id', cpp.plan_id).maybeSingle(),
    cpp.batch_piece_id ? erp.from('cut_plan_pieces').select('piece_code').eq('plan_id', cpp.plan_id).eq('batch_piece_id', cpp.batch_piece_id) : Promise.resolve({ data: [] })
  ]);
  if (pl.error) throw pl.error;
  const plan = pl.data;
  const [bpR, btR] = await Promise.all([
    cpp.batch_piece_id ? erp.from('batch_pieces').select('*').eq('id', cpp.batch_piece_id).maybeSingle() : Promise.resolve({ data: null }),
    plan ? erp.from('batches').select('id, code, name').eq('id', plan.batch_id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  // N etiquetas da mesma linha = unidades 1..N em ordem de código (igual ao Apontar do ERP)
  const cods = (irmas.data || []).map(function (r) { return r.piece_code; }).sort();
  const unit = Math.max(1, cods.indexOf(code) + 1);
  return { cpp: cpp, plan: plan, bp: bpR.data || null, batch: btR.data || null, unit: unit };
};
CEL.descPeca = function (p) {
  const c = p.cpp;
  return '<div class="s"><b>' + CEL.esc(c.reference || c.label || 'Peça') + '</b>' +
    (c.module_name || c.client_name ? ' — ' + CEL.esc([c.module_name, c.client_name].filter(Boolean).join(' · ')) : '') + '</div>' +
    '<div class="k">' + CEL.esc(c.piece_code) + ' · ' + CEL.mm(p.bp ? p.bp.comprimento_mm : c.w_mm) + ' × ' + CEL.mm(p.bp ? p.bp.largura_mm : c.h_mm) +
      ' · ' + CEL.esc(c.color_name || '') + ' ' + CEL.mm(c.espessura_mm) + ' mm' + (p.batch ? ' · lote ' + CEL.esc(p.batch.code) : '') + '</div>';
};
CEL.card = function (id, tipo, html) { const el = CEL.$(id); if (el) { el.className = 'cel-card ' + (tipo || ''); el.innerHTML = html; el.style.display = ''; } };

/* ---------------- 1) Apontar ---------------- */
CEL.telaApontar = function () {
  CEL.tela = 'apontar';
  CEL.render(CEL.topo('Apontar peça') + CEL.leitorHtml() + '<div id="ap-res" class="cel-card" style="display:none"></div>' +
    '<div class="cel-msg" id="ap-cont">' + (CEL._apCont ? CEL._apCont + ' peça(s) apontada(s) agora.' : 'Leia a etiqueta da peça.') + '</div>');
  CEL._religa = function () { CEL.ligarCamera(CEL.aponta); };
  CEL._religa();
};
CEL.aponta = async function (code) {
  CEL.card('ap-res', '', '<div class="s">Procurando ' + CEL.esc(code) + '…</div>');
  try {
    const p = await CEL.peca(code);
    if (!p.bp) throw new Error('A peça ' + code + ' não está ligada a nenhuma linha do lote.');
    const erp = CEL.erp();
    const reg = { batch_id: p.bp.batch_id, batch_piece_id: p.bp.id, unit_idx: p.unit, order_id: p.bp.order_id || null, piece_code: code, scanned_by_name: CEL.quem() };
    const { data, error } = await erp.from('piece_scans').insert(reg).select('id, scanned_at').maybeSingle();
    let ja = null;
    if (error) {
      if (error.code !== '23505') throw error;
      const r = await erp.from('piece_scans').select('scanned_at, scanned_by_name').eq('batch_piece_id', p.bp.id).eq('unit_idx', p.unit).maybeSingle();
      ja = r.data || {};
    }
    // peça refeita: aponta também a original (é ela que o pedido espera)
    let orig = '';
    const rw = await erp.from('piece_rework').select('*').eq('new_batch_piece_id', p.bp.id).limit(50);
    if (!rw.error && rw.data && rw.data.length) {
      const r0 = rw.data[Math.min(rw.data.length, p.unit) - 1];
      if (r0 && r0.orig_batch_piece_id && r0.orig_batch_id) {
        const ro = await erp.from('piece_scans').insert({ batch_id: r0.orig_batch_id, batch_piece_id: r0.orig_batch_piece_id, unit_idx: r0.orig_unit_idx || 1,
          order_id: r0.order_id, piece_code: code, scanned_by_name: CEL.quem() });
        if (!ro.error || ro.error.code === '23505') orig = '<div class="k">Substitui a ' + CEL.esc(r0.orig_piece_code || '') + ' (peça estragada).</div>';
      }
    }
    if (ja) {
      CEL.card('ap-res', 'warn', '<div class="t">⚠ Já estava apontada</div>' + CEL.descPeca(p) +
        '<div class="k">' + (ja.scanned_at ? CEL.hora(ja.scanned_at) : '') + (ja.scanned_by_name ? ' · ' + CEL.esc(ja.scanned_by_name) : '') + '</div>' + orig);
      return;
    }
    CEL._apCont++;
    CEL.card('ap-res', 'ok', '<div class="t">✓ Apontada</div>' + CEL.descPeca(p) + orig +
      '<button class="cel-link" style="margin:8px 0 0" onclick="CEL.desfazApont(\'' + data.id + '\')">desfazer</button>');
    const c = CEL.$('ap-cont'); if (c) c.textContent = CEL._apCont + ' peça(s) apontada(s) agora.';
  } catch (e) {
    CEL.card('ap-res', 'err', '<div class="t">✕ ' + CEL.esc(code) + '</div><div class="s">' + CEL.esc(CEL.erro(e)) + '</div>');
  }
};
CEL.desfazApont = async function (id) {
  const { error } = await CEL.erp().from('piece_scans').delete().eq('id', id);
  if (error) { CEL.card('ap-res', 'err', '<div class="s">Não desfez: ' + CEL.esc(error.message) + '</div>'); return; }
  CEL._apCont = Math.max(0, CEL._apCont - 1);
  CEL.ultimo = null;
  CEL.card('ap-res', '', '<div class="s">Apontamento desfeito.</div>');
  const c = CEL.$('ap-cont'); if (c) c.textContent = CEL._apCont + ' peça(s) apontada(s) agora.';
};

/* ---------------- 2) Refazer peça ---------------- */
CEL.MOTIVOS = ['Quebrou', 'Lascou', 'Medida errada', 'Fita', 'Furação', 'Outro'];
CEL.telaRefazer = function () {
  CEL.tela = 'refazer'; CEL.refazer = []; CEL.motivo = '';
  CEL.render(CEL.topo('Refazer peça') + CEL.leitorHtml() + '<div id="rf-res" class="cel-card" style="display:none"></div>' +
    '<div id="rf-lista"></div>');
  CEL._religa = function () { CEL.ligarCamera(CEL.refazAdd); };
  CEL._religa();
  CEL.refazLista();
};
CEL.refazAdd = async function (code) {
  if (CEL.refazer.some(function (x) { return x.cpp.piece_code === code; })) { CEL.card('rf-res', 'warn', '<div class="s">' + CEL.esc(code) + ' já está na lista.</div>'); return; }
  CEL.card('rf-res', '', '<div class="s">Procurando ' + CEL.esc(code) + '…</div>');
  try {
    const p = await CEL.peca(code);
    if (!p.bp) throw new Error('Essa etiqueta não tem a peça do lote ligada — refaça pelo ERP.');
    CEL.refazer.push(p);
    CEL.$('rf-res').style.display = 'none';
    CEL.refazLista();
  } catch (e) {
    CEL.card('rf-res', 'err', '<div class="t">✕ ' + CEL.esc(code) + '</div><div class="s">' + CEL.esc(CEL.erro(e)) + '</div>');
  }
};
CEL.refazLista = function () {
  const el = CEL.$('rf-lista'); if (!el) return;
  const n = CEL.refazer.length;
  if (!n) { el.innerHTML = '<div class="cel-msg">Leia a etiqueta da peça estragada. Pode ler várias.</div>'; return; }
  el.innerHTML = '<div class="cel-lista">' + CEL.refazer.map(function (p, i) {
      const c = p.cpp;
      return '<div class="cel-item"><div><b>' + CEL.esc(c.reference || 'Peça') + '</b><small>' + CEL.esc(c.piece_code) + ' · ' +
        CEL.mm(p.bp.comprimento_mm) + '×' + CEL.mm(p.bp.largura_mm) + ' · ' + CEL.esc(c.color_name || '') + '</small></div>' +
        '<button onclick="CEL.refazTira(' + i + ')">×</button></div>';
    }).join('') + '</div>' +
    '<div class="cel-chips">' + CEL.MOTIVOS.map(function (m) {
      return '<button class="cel-chip' + (CEL.motivo === m ? ' on' : '') + '" onclick="CEL.motivo=\'' + m + '\';CEL.refazLista()">' + m + '</button>';
    }).join('') + '</div>' +
    '<button class="cel-go red" ' + (CEL.motivo ? '' : 'disabled') + ' onclick="CEL.refazGerar(this)">Gerar plano (' + n + ' peça' + (n > 1 ? 's' : '') + ')</button>' +
    (CEL.motivo ? '' : '<div class="cel-msg" style="text-align:center">Escolha o motivo.</div>');
};
CEL.refazTira = function (i) { CEL.refazer.splice(i, 1); CEL.refazLista(); };

/* Perfil padrão de parâmetros do plano (ERP › Parâmetros de corte), no mesmo
   formato do LOTES_UI.readParams da tela de gerar plano. */
CEL.paramsPadrao = async function () {
  const lista = await LOTES.params().catch(function () { return []; });
  const row = lista.find(function (p) { return p.is_default; }) || lista[0] || {};
  const num = function (v, d) { const n = Number(v); return (v == null || v === '' || isNaN(n)) ? d : n; };
  return {
    id: row.id || null, name: row.name || 'Padrão',
    kerf_mm: num(row.kerf_mm, 4),
    trim_left_mm: num(row.trim_left_mm, 10), trim_right_mm: num(row.trim_right_mm, 10),
    trim_top_mm: num(row.trim_top_mm, 10), trim_bottom_mm: num(row.trim_bottom_mm, 10),
    trim_retalho_mm: num(row.trim_retalho_mm, NESTING.RETALHO_TRIM_DEFAULT_MM),
    min_offcut_width_mm: num(row.min_offcut_width_mm, 300), min_offcut_height_mm: num(row.min_offcut_height_mm, 100),
    offcut_priority: row.offcut_priority || 'menor_primeiro',
    strategy: row.strategy || 'guilhotina', first_cut: row.first_cut || 'auto',
    stack_mode: row.stack_mode || 'material', deep_search: false, offcut_big_m2: num(row.offcut_big_m2, 1),
    allow_rotation: row.allow_rotation != null ? !!row.allow_rotation : false,
    respect_grain: row.respect_grain != null ? !!row.respect_grain : true,
    use_offcuts: row.use_offcuts != null ? !!row.use_offcuts : true,
    label_prefix: row.label_prefix || 'PC'
  };
};

CEL.refazGerar = async function (btn) {
  if (!CEL.refazer.length || !CEL.motivo) return;
  btn.disabled = true; btn.textContent = 'Gerando plano…';
  const religa = CEL._religa; CEL.pararCamera();
  const erp = CEL.erp();
  const itens = CEL.refazer.slice();
  let batch = null;
  try {
    const [colors, sizes, params] = await Promise.all([LOTES.colors(), LOTES.sheetSizes(), CEL.paramsPadrao()]);
    const origLotes = Array.from(new Set(itens.map(function (p) { return p.batch ? p.batch.code : ''; }).filter(Boolean)));
    const cods = itens.map(function (p) { return p.cpp.piece_code; });
    batch = await LOTES.createBatch({
      name: 'Refazer · ' + (origLotes.join(', ') || cods[0]),
      notes: 'Celular (' + CEL.quem() + ') — motivo: ' + CEL.motivo + '. Peças: ' + cods.join(', ')
    });
    // cópia das peças, 1 unidade cada, sem order_id (o Packing do portal não conta em dobro)
    const novos = [];
    for (let i = 0; i < itens.length; i++) {
      const p = itens[i];
      const copia = Object.assign({}, p.bp);
      ['id', 'created_at', 'updated_at'].forEach(function (k) { delete copia[k]; });
      copia.batch_id = batch.id; copia.source = 'manual'; copia.quantity = 1; copia.order_id = null;
      copia.description = 'Refazer ' + p.cpp.piece_code + (p.batch ? ' (' + p.batch.code + ')' : '') + ' — ' + CEL.motivo;
      const { data, error } = await erp.from('batch_pieces').insert(copia).select().maybeSingle();
      if (error) throw error;
      novos.push(data);
      const rw = await erp.from('piece_rework').insert({
        created_by_name: CEL.quem(), reason: CEL.motivo, orig_piece_code: p.cpp.piece_code,
        orig_batch_id: p.bp.batch_id, orig_batch_piece_id: p.bp.id, orig_unit_idx: p.unit, order_id: p.bp.order_id || null,
        new_batch_id: batch.id, new_batch_piece_id: data.id
      });
      if (rw.error && /piece_rework/.test(rw.error.message || '')) throw new Error('Falta rodar a migration 355 no Supabase.');
      if (rw.error) throw rw.error;
    }
    // mesmo otimizador do ERP, por material
    const groups = LOTES.groupPieces(novos, colors);
    const out = [], avisos = [];
    for (let g = 0; g < groups.length; g++) {
      const gr = groups[g];
      if (!gr.color_id) { avisos.push(gr.color_name + ': peça sem cor — gere o plano desse material pelo ERP.'); continue; }
      const def = gr.color && gr.color.default_sheet_size_id;
      const size = sizes.find(function (s) { return s.id === def; }) || sizes[0];
      if (!size) { avisos.push(gr.color_name + ': sem tamanho de chapa cadastrado.'); continue; }
      const pecas = LOTES.expandForNesting(gr.rows);
      const ok = pecas.filter(function (x) { return NESTING.pieceFitsSheet(x, size.width_mm, size.height_mm, params); });
      if (ok.length < pecas.length) avisos.push(gr.color_name + ': ' + (pecas.length - ok.length) + ' peça(s) não cabem na chapa.');
      if (!ok.length) continue;
      const offcuts = params.use_offcuts
        ? (await LOTES.availableOffcutsFor(gr.color_id, gr.espessura_mm, params.offcut_priority)).map(function (o) {
            return { id: o.id, code: o.code, w: Number(o.width_mm), h: Number(o.height_mm), location: o.location };
          })
        : [];
      const newSheet = { sheet_size_id: size.id, name: size.name, w: Number(size.width_mm), h: Number(size.height_mm) };
      out.push({ group: gr, result: NESTING.run({ pieces: ok, offcutBins: offcuts, newSheet: newSheet, params: params }), sheetSize: size });
    }
    if (!out.length) throw new Error('Nenhuma peça entrou no plano. ' + avisos.join(' ') + ' O lote ' + batch.code + ' ficou criado — gere o plano pelo ERP.');
    const res = await LOTES.savePlan({ batchId: batch.id, batchCode: batch.code, groups: out, params: params });
    const planId = res.plan.id;
    const up = await erp.from('cut_plans').update({ origem: 'celular' }).eq('id', planId);
    await erp.from('piece_rework').update({ new_plan_id: planId }).eq('new_batch_id', batch.id);
    let chapas = 0, retalhos = 0;
    out.forEach(function (o) { chapas += o.result.summary.sheets_new; retalhos += o.result.summary.offcuts_used; });
    const usa = [chapas ? chapas + ' chapa' + (chapas > 1 ? 's' : '') + ' nova' + (chapas > 1 ? 's' : '') : '',
      retalhos ? retalhos + ' retalho' + (retalhos > 1 ? 's' : '') : ''].filter(Boolean).join(' + ');
    CEL.refazer = []; CEL.motivo = ''; CEL._religa = null;
    CEL.render(CEL.topo('Refazer peça') +
      '<div class="cel-card ok"><div class="t">✓ Plano ' + CEL.esc(res.plan.code || '') + ' pronto</div>' +
      '<div class="s">Lote ' + CEL.esc(batch.code) + ' · ' + itens.length + ' peça(s) · ' + CEL.esc(usa || '—') + '</div>' +
      '<div class="k">' + (up.error ? '⚠ Rode a migration 355 pra ele aparecer na fila da máquina.' :
        'Na fila da máquina: no PC da seccionadora, ERP › Plano de corte › "Fila do celular" › Mandar pra máquina.') + '</div>' +
      (avisos.length ? '<div class="k">⚠ ' + CEL.esc(avisos.join(' ')) + '</div>' : '') + '</div>' +
      '<button class="cel-go red" onclick="CEL.telaRefazer()">Refazer outra</button>' +
      '<button class="cel-link" onclick="CEL.home()">Voltar ao início</button>');
  } catch (e) {
    console.error(e);
    btn.disabled = false; btn.textContent = 'Tentar de novo';
    CEL.card('rf-res', 'err', '<div class="t">Não gerou</div><div class="s">' + CEL.esc(CEL.erro(e)) +
      (batch && !/ficou criado/.test(String(e && e.message)) ? ' (o lote ' + CEL.esc(batch.code) + ' já foi criado — confira no ERP antes de tentar de novo)' : '') + '</div>');
    CEL._religa = religa; if (religa) religa();
  }
};

/* ---------------- 3) Laminação (por lote + cor) ---------------- */
CEL.telaLaminacao = function () {
  CEL.tela = 'laminacao';
  CEL.render(CEL.topo('Laminação') + CEL.leitorHtml() + '<div id="lm-res" class="cel-card" style="display:none"></div>' +
    '<div class="cel-msg" id="lm-msg">Leia qualquer peça da pilha.</div><div id="lm-acao"></div>');
  CEL._religa = function () { CEL.ligarCamera(CEL.laminaLe); };
  CEL._religa();
};
CEL.laminaLe = async function (code) {
  CEL.$('lm-acao').innerHTML = '';
  const msg = CEL.$('lm-msg'); if (msg) msg.style.display = 'none';
  CEL.card('lm-res', '', '<div class="s">Procurando ' + CEL.esc(code) + '…</div>');
  try {
    const p = await CEL.peca(code);
    if (!p.batch) throw new Error('Não achei o lote dessa peça.');
    const erp = CEL.erp();
    const cor = p.cpp.color_name || (p.bp && p.bp.color_name) || '';
    const esp = Number(p.cpp.espessura_mm || (p.bp && p.bp.espessura_mm) || 0);
    const [pc, ja, cores] = await Promise.all([
      erp.from('batch_pieces').select('quantity, edge_banding, edge_band_m, espessura_mm, color_name, color_id').eq('batch_id', p.batch.id).eq('color_name', cor),
      erp.from('lamination_done').select('*').eq('batch_id', p.batch.id).eq('color_name', cor).eq('espessura_mm', esp).maybeSingle(),
      LOTES.colors().catch(function () { return []; })
    ]);
    if (ja.error) throw (/lamination_done/.test(ja.error.message || '') ? new Error('Falta rodar a migration 355 no Supabase.') : ja.error);
    const linhas = (pc.data || []).filter(function (r) { return Math.abs(Number(r.espessura_mm) - esp) < 0.01; });
    let total = 0, fita = 0;
    linhas.forEach(function (r) { total += r.quantity; if ((r.edge_banding || 0) > 0 || Number(r.edge_band_m) > 0) fita += r.quantity; });
    const colorId = (linhas[0] && linhas[0].color_id) || (p.bp && p.bp.color_id) || null;
    const c = cores.find(function (x) { return x.id === colorId; });
    const sw = c ? '<span class="cel-sw" style="background-color:' + CEL.esc(c.swatch_hex || '#888') + (c.texture_url ? ';background-image:url(\'' + CEL.esc(c.texture_url) + '\')' : '') + '"></span>' : '';
    CEL._lam = { batch_id: p.batch.id, color_id: colorId, color_name: cor, espessura_mm: esp, pieces: fita || total };
    const corpo = '<div class="t">' + sw + CEL.esc(cor || 'Sem cor') + '</div>' +
      '<div class="s">Lote ' + CEL.esc(p.batch.code) + (p.batch.name ? ' · ' + CEL.esc(p.batch.name) : '') + ' · ' + CEL.mm(esp) + ' mm</div>' +
      '<div class="k">' + fita + ' peça(s) com fita nessa cor · ' + total + ' no total</div>';
    if (ja.data) {
      CEL.card('lm-res', 'ok', corpo + '<div class="k">✓ Laminação já confirmada · ' + CEL.hora(ja.data.done_at) + (ja.data.done_by_name ? ' · ' + CEL.esc(ja.data.done_by_name) : '') + '</div>');
      CEL.$('lm-acao').innerHTML = '<button class="cel-link" onclick="CEL.laminaDesfaz(\'' + ja.data.id + '\')">desfazer confirmação</button>';
      return;
    }
    CEL.card('lm-res', '', corpo);
    CEL.$('lm-acao').innerHTML = '<button class="cel-go blue" onclick="CEL.laminaOk(this)">Confirmar laminação</button>';
  } catch (e) {
    CEL.card('lm-res', 'err', '<div class="t">✕ ' + CEL.esc(code) + '</div><div class="s">' + CEL.esc(CEL.erro(e)) + '</div>');
  }
};
CEL.laminaOk = async function (btn) {
  const l = CEL._lam; if (!l) return;
  btn.disabled = true;
  const { error } = await CEL.erp().from('lamination_done').insert(Object.assign({ done_by_name: CEL.quem() }, l));
  if (error && error.code !== '23505') { btn.disabled = false; CEL.card('lm-res', 'err', '<div class="s">Não gravou: ' + CEL.esc(error.message) + '</div>'); return; }
  CEL.$('lm-acao').innerHTML = '';
  CEL.ultimo = null;
  CEL.card('lm-res', 'ok', '<div class="t">✓ Laminação confirmada</div><div class="s">' + CEL.esc(l.color_name) + ' · ' + CEL.mm(l.espessura_mm) + ' mm · ' + l.pieces + ' peça(s)</div>');
};
CEL.laminaDesfaz = async function (id) {
  if (!confirm('Desfazer a confirmação da laminação dessa cor?')) return;
  const { error } = await CEL.erp().from('lamination_done').delete().eq('id', id);
  CEL.$('lm-acao').innerHTML = '';
  CEL.ultimo = null;
  CEL.card('lm-res', error ? 'err' : '', '<div class="s">' + (error ? 'Não desfez: ' + CEL.esc(error.message) : 'Confirmação desfeita.') + '</div>');
};

/* ---------------- 4) Retalho ---------------- */
CEL.STATUS_RET = { disponivel: 'Em estoque', reservado: 'Reservado', consumido: 'Usado', descartado: 'Descartado' };
CEL.telaRetalho = function () {
  CEL.tela = 'retalho';
  CEL.render(CEL.topo('Retalho') + CEL.leitorHtml() + '<div id="rt-res" class="cel-card" style="display:none"></div><div id="rt-acao"></div>' +
    '<button class="cel-go gray" onclick="CEL.retNovo()">＋ Novo retalho</button>');
  CEL._religa = function () { CEL.ligarCamera(CEL.retLe); };
  CEL._religa();
};
CEL.retLe = async function (code) {
  CEL.$('rt-acao').innerHTML = '';
  if (!/^RET-/.test(code)) { CEL.card('rt-res', 'err', '<div class="s">' + CEL.esc(code) + ' não é etiqueta de retalho (RET-…).</div>'); return; }
  const { data: o, error } = await CEL.erp().from('offcuts').select('*').eq('code', code).maybeSingle();
  if (error || !o) { CEL.card('rt-res', 'err', '<div class="s">' + (error ? CEL.esc(error.message) : 'Retalho ' + CEL.esc(code) + ' não encontrado.') + '</div>'); return; }
  CEL.ret = o;
  CEL.card('rt-res', o.status === 'disponivel' ? '' : 'warn', '<div class="t">' + CEL.mm(o.width_mm) + ' × ' + CEL.mm(o.height_mm) + ' mm</div>' +
    '<div class="s">' + CEL.esc(o.color_name || '') + ' · ' + CEL.mm(o.espessura_mm) + ' mm' + (o.location ? ' · ' + CEL.esc(o.location) : '') + '</div>' +
    '<div class="k">' + CEL.esc(o.code) + ' · ' + (CEL.STATUS_RET[o.status] || o.status) + '</div>');
  CEL.$('rt-acao').innerHTML = (o.status === 'disponivel' || o.status === 'reservado')
    ? '<button class="cel-go" onclick="CEL.retStatus(\'consumido\')">Usei</button><button class="cel-go red" onclick="CEL.retStatus(\'descartado\')">Descartar</button>'
    : '<button class="cel-go gray" onclick="CEL.retStatus(\'disponivel\')">Voltar pro estoque</button>';
};
CEL.retStatus = async function (st) {
  const o = CEL.ret; if (!o) return;
  try {
    await LOTES.setOffcutStatus(o.id, st);
    CEL.$('rt-acao').innerHTML = '';
    CEL.ultimo = null;
    CEL.card('rt-res', 'ok', '<div class="t">✓ ' + CEL.esc(o.code) + '</div><div class="s">' + (CEL.STATUS_RET[st] || st) + '</div>');
  } catch (e) { CEL.card('rt-res', 'err', '<div class="s">' + CEL.esc(CEL.erro(e)) + '</div>'); }
};
CEL.retNovo = async function () {
  CEL.tela = 'retalho-novo'; CEL._religa = null;
  const cores = (await LOTES.colors().catch(function () { return []; })).filter(function (c) { return c.active !== false; });
  CEL._cores = cores;
  CEL.render(CEL.topo('Novo retalho') + '<div class="cel-form">' +
    '<label>Cor<select id="rn-cor"><option value="">— escolha —</option>' + cores.map(function (c) { return '<option value="' + c.id + '">' + CEL.esc(c.name) + '</option>'; }).join('') + '</select></label>' +
    '<div class="cel-row"><label>Comprimento (veio) mm<input id="rn-c" type="number" inputmode="numeric"></label>' +
    '<label>Largura mm<input id="rn-l" type="number" inputmode="numeric"></label></div>' +
    '<label>Onde está (opcional)<input id="rn-loc" placeholder="ex.: cavalete 2"></label>' +
    '</div><div id="rn-res" class="cel-card" style="display:none"></div>' +
    '<button class="cel-go" onclick="CEL.retSalvar(this)">Salvar retalho</button>' +
    '<button class="cel-link" onclick="CEL.telaRetalho()">Voltar</button>');
};
CEL.retSalvar = async function (btn) {
  const cor = (CEL._cores || []).find(function (c) { return c.id === CEL.$('rn-cor').value; });
  const c = Math.round(Number(CEL.$('rn-c').value)), l = Math.round(Number(CEL.$('rn-l').value));
  if (!cor || !(c > 0) || !(l > 0)) { CEL.card('rn-res', 'err', '<div class="s">Escolha a cor e preencha as duas medidas.</div>'); return; }
  btn.disabled = true;
  try {
    const { data, error } = await CEL.erp().from('offcuts').insert({
      color_id: cor.id, color_name: cor.name, espessura_mm: LOTES.espessuraDaCor(cor),
      width_mm: c, height_mm: l, location: CEL.$('rn-loc').value.trim() || null, status: 'disponivel',
      notes: 'Cadastrado no celular por ' + CEL.quem()
    }).select('code').maybeSingle();
    if (error) throw error;
    CEL.render(CEL.topo('Novo retalho') + '<div class="cel-card ok"><div class="t">✓ ' + CEL.esc(data.code) + '</div>' +
      '<div class="s">' + c + ' × ' + l + ' mm · ' + CEL.esc(cor.name) + '</div><div class="k">Escreva o código no retalho (ou imprima a etiqueta pelo ERP › Retalhos).</div></div>' +
      '<button class="cel-go gray" onclick="CEL.retNovo()">＋ Outro retalho</button><button class="cel-link" onclick="CEL.home()">Voltar ao início</button>');
  } catch (e) { btn.disabled = false; CEL.card('rn-res', 'err', '<div class="s">' + CEL.esc(CEL.erro(e)) + '</div>'); }
};

/* ---------------- 5) Buscar no projeto ---------------- */
/* 27/11, Matt: "botão novo, buscar no projeto: lê o código de barra da
   etiqueta e puxa o visualizador 3D com a peça piscando no projeto".
   Reaproveita o 3D público do portal (portal.html?view3d=CODE&peca=PC-…, o
   mesmo do QR do montador — locateView3DPiece em portal-09): ele já pisca o
   módulo no projeto e abre a peça no módulo explodido. O código do projeto
   vem de erp_view3d_codes_for_orders (migration 179/192; cria se faltar).
   Peça refeita (lote Refazer, sem order_id) usa a original do piece_rework. */
CEL.telaBuscar = function () {
  CEL.tela = 'buscar';
  CEL.render(CEL.topo('Buscar no projeto') + CEL.leitorHtml() + '<div id="bp-res" class="cel-card" style="display:none"></div>' +
    '<div class="cel-msg">Leia a etiqueta da peça: abre o projeto em 3D com ela piscando.</div>');
  CEL._religa = function () { CEL.ligarCamera(CEL.busca); };
  CEL._religa();
};
CEL.busca = async function (code) {
  CEL.card('bp-res', '', '<div class="s">Procurando ' + CEL.esc(code) + '…</div>');
  try {
    const p = await CEL.peca(code);
    const erp = CEL.erp();
    let orderId = p.bp && p.bp.order_id, codigo = code;
    if (!orderId && p.bp) {
      const rw = await erp.from('piece_rework').select('order_id, orig_piece_code').eq('new_batch_piece_id', p.bp.id).limit(1);
      const r0 = rw.data && rw.data[0];
      if (r0 && r0.order_id) { orderId = r0.order_id; codigo = r0.orig_piece_code || code; }
    }
    if (!orderId) throw new Error('Essa peça não é de pedido (lista de corte avulsa ou peça manual) — não tem projeto em 3D.');
    const { data, error } = await DATA.sb().rpc('erp_view3d_codes_for_orders', { p_order_ids: [orderId] });
    if (error) throw error;
    const v = (data || [])[0];
    if (!v || !v.view3d_code) throw new Error('O pedido dessa peça não veio de um projeto do portal (ex.: PROMOB ou pedido antigo) — não tem 3D do projeto.');
    CEL.card('bp-res', 'ok', '<div class="t">Abrindo o projeto…</div>' + CEL.descPeca(p));
    CEL.pararCamera();
    location.href = '../portal.html?view3d=' + encodeURIComponent(v.view3d_code) + '&peca=' + encodeURIComponent(codigo);
  } catch (e) {
    CEL.card('bp-res', 'err', '<div class="t">✕ ' + CEL.esc(code) + '</div><div class="s">' + CEL.esc(CEL.erro(e)) + '</div>');
  }
};

/* EM PÉ (27/11, Matt: "deixa ele em pé, só tá rodando deitado"): o manifest
   pede portrait, e aqui trava também pelo navegador (vale no app instalado
   no Android; no iPhone quem manda é a trava de rotação do aparelho). */
CEL.travaEmPe = function () {
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('portrait').catch(function () {}); } catch (e) {}
};
document.addEventListener('pointerdown', CEL.travaEmPe, { once: true });
CEL.travaEmPe();

CEL.boot();
