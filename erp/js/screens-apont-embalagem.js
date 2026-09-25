/* Legno ERP — Produção → Apontamento + Embalagem (TESTE)  (#/embalagem-teste)
 *
 * Pedido do Matt (2026-09-24), resumido:
 *   - apontar TODAS as peças do lote (leitor de código ou clique);
 *   - peça COM furação: a tela mostra o NICHO dela piscando VERMELHO. Cada
 *     nicho junta as peças de um módulo; o nicho é escolhido pelo tamanho
 *     das peças. A estante na tela é cópia da real, vista de frente;
 *   - módulo com todas as peças no nicho: nicho pisca VERDE e o módulo vira
 *     VOLUME ARQUEADO (máx. 25 kg; passou, divide da melhor forma) com o
 *     passo a passo de como embalar; o volume vai pro pallet;
 *   - painel, filler e peça sem furação: direto pro PALLET, mostrando onde
 *     e como colocar; faltou apoio, CALÇO 100×100×19 (máx. 2 empilhados);
 *   - ANTES de começar, o plano já diz quantos pallets.
 *
 * AMBIENTE DE TESTE: nada vai pro banco. Os apontamentos, o plano e o
 * layout da estante ficam no localStorage do navegador (chave por lote).
 * "Zerar teste" apaga. Quando o fluxo estiver aprovado, vira tabela no
 * schema erp.
 *
 * Lógica pura em erp/js/apont-embalagem-plano.js; motor do pallet em
 * erp/js/pallet-engine.js (opt.calco, ligado só aqui).
 */

const APEMB = {};

APEMB.K_ESTANTE = 'legno.apemb.estante.v1';
APEMB.K_PARAMS = 'legno.apemb.params.v1';
APEMB.K_LOTE = function (id) { return 'legno.apemb.lote.v1.' + id; };

APEMB._ls = function (k, v) {
  try {
    if (arguments.length === 1) { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; }
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
  } catch (e) { return null; }
};

APEMB.params = function () {
  const d = APEMB_PLANO.DEFAULTS;
  const p = APEMB._ls(APEMB.K_PARAMS) || {};
  return {
    dens: p.dens || d.dens, pesoMaxVolume: p.pesoMaxVolume || d.pesoMaxVolume, maxD: p.maxD != null ? p.maxD : d.maxD,
    calco: Object.assign({}, d.calco, p.calco || {}), orcamentoMs: d.orcamentoMs
  };
};
APEMB.estanteCfg = function () {
  return Object.assign({}, APEMB_PLANO.DEFAULTS.estante, APEMB._ls(APEMB.K_ESTANTE) || {});
};

/* ---------------------------------------------------------------- rota */

APEMB.load = async function () { return { batches: await LOTES.batches() }; };

APEMB.render = function (params, d) {
  const ops = d.batches.map(function (b, i) {
    return '<option value="' + UI.esc(b.id) + '"' + (i === 0 ? ' selected' : '') + '>' + UI.esc(b.code) +
      (b.name ? ' · ' + UI.esc(b.name) : '') + (i === 0 ? ' (último)' : '') + '</option>';
  }).join('');
  const est = APEMB.estanteCfg(), pr = APEMB.params();
  const campo = function (id, label, val, extra) {
    return '<label class="erp-field"><span>' + label + '</span><input id="' + id + '" value="' + UI.esc(String(val)) + '"' + (extra || '') + '></label>';
  };
  return UI.crumb([{ label: 'Produção' }, { label: 'Apontamento + Embalagem' }]) +
    UI.head('Apontamento + Embalagem',
      'Aponte as peças do lote: peça com furação vai pro <b>nicho</b> do módulo (vermelho = onde pôr, verde = módulo completo, pronto pra arquear); ' +
      'painel, filler e peça sem furação vão direto pro <b>pallet</b>, no lugar indicado. ' +
      '<span class="erp-demo-tag">ambiente de teste — salva só neste navegador</span>', '') +
    '<div class="erp-panel apemb-topo">' +
      '<div class="erp-inline-fields">' +
        '<label class="erp-field"><span>Lote</span><select id="apemb-lote"><option value="">— escolher —</option>' + ops + '</select></label>' +
        '<div class="emb-acao"><button class="erp-btn-secondary" id="apemb-recalc" disabled title="Refaz o plano de pallets (mantém os apontamentos)">↻ Recalcular plano</button> ' +
        '<button class="erp-btn-secondary" id="apemb-desfazer" disabled>↶ Desfazer último</button> ' +
        '<button class="erp-btn-secondary" id="apemb-zerar" disabled title="Apaga os apontamentos de teste deste lote">Zerar teste</button> ' +
        '<button class="erp-btn-secondary" id="apemb-folhas" disabled title="Uma folha Letter por pallet: cliente, projeto, conteúdo e peso" onclick="APEMB.imprimirFolhas(null, null)">🖨 Folhas de todos os pallets</button></div>' +
      '</div>' +
      '<details class="apemb-cfg"><summary>Estante, pallet e calço</summary>' +
        '<div class="erp-inline-fields">' +
          campo('apemb-cols', 'Colunas — largura de cada nicho, da esquerda pra direita (mm)', est.colunas.join(', ')) +
          campo('apemb-linhas', 'Linhas — altura de cada nicho, de cima pra baixo (mm)', est.linhas.join(', ')) +
          campo('apemb-prof', 'Profundidade (mm)', est.prof, ' type="number"') +
        '</div><div class="erp-inline-fields">' +
          campo('apemb-dens', 'Densidade (kg/m³)', pr.dens, ' type="number"') +
          campo('apemb-pmax', 'Peso máx. por volume (kg)', pr.pesoMaxVolume, ' type="number"') +
          campo('apemb-maxd', 'Largura máx. do pallet (mm)', pr.maxD, ' type="number"') +
          campo('apemb-calh', 'Calço — altura (mm)', pr.calco.h, ' type="number"') +
          campo('apemb-calmax', 'Calço — máx. empilhados', pr.calco.max, ' type="number"') +
          '<div class="emb-acao"><button class="erp-btn" id="apemb-cfg-ok">Salvar e recalcular</button></div>' +
        '</div>' +
        '<div class="erp-muted erp-xs">Peças entram DEITADAS no nicho, empilhadas. O nicho escolhido é o menor livre que comporta a maior peça do módulo e a pilha. ' +
        'Peça que passa mais de ' + APEMB_PLANO.DEFAULTS.sobraForaMax + ' mm de todos os nichos vai pra área do chão.</div>' +
      '</details>' +
    '</div>' +
    '<div id="apemb-status" class="erp-muted erp-small" style="margin:6px 0">Escolha o lote.</div>' +
    '<div id="apemb-corpo" style="display:none">' +
      '<div id="apemb-resumo"></div>' +
      '<div class="apemb-scan">' +
        '<input id="apemb-input" autocomplete="off" placeholder="Ler etiqueta (PC-002247) ou digitar o número e Enter">' +
        '<div id="apemb-msg" class="apemb-msg">Pronto pra apontar.</div>' +
      '</div>' +
      '<div class="apemb-grid">' +
        '<div class="erp-panel"><h2>Estante — vista de frente</h2><div id="apemb-estante"></div></div>' +
        '<div class="erp-panel"><h2>Pallets — peças soltas e volumes</h2><div id="apemb-pallets"></div></div>' +
      '</div>' +
      '<div class="apemb-grid">' +
        '<div class="erp-panel"><h2>Cavalete de big parts</h2><div id="apemb-cavalete"></div></div>' +
        '<div class="erp-panel"><h2>Pallet de módulos montados (1200 × 1200)</h2><div id="apemb-montados"></div></div>' +
      '</div>' +
      '<div id="apemb-embalar"></div>' +
      '<div class="erp-panel"><h2>Peças do lote <input id="apemb-filtro" class="apemb-filtro" placeholder="filtrar (código, peça, módulo)"></h2><div id="apemb-lista"></div></div>' +
    '</div>';
};

APEMB.after = function () {
  const $ = APEMB.$;
  APEMB.S = null;
  $('apemb-lote').addEventListener('change', function () { APEMB.abrirLote(this.value); });
  $('apemb-recalc').addEventListener('click', function () { APEMB.recalcular(this); });
  $('apemb-desfazer').addEventListener('click', APEMB.desfazer);
  $('apemb-zerar').addEventListener('click', APEMB.zerar);
  $('apemb-cfg-ok').addEventListener('click', APEMB.salvarCfg);
  $('apemb-input').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); const v = this.value; this.value = ''; APEMB.apontar(v); }
  });
  $('apemb-filtro').addEventListener('input', APEMB.desenharLista);
  if ($('apemb-lote').value) APEMB.abrirLote($('apemb-lote').value);
};

APEMB.$ = function (id) { return document.getElementById(id); };

/* ---------------------------------------------------------- carregar lote */

APEMB.abrirLote = async function (batchId) {
  const $ = APEMB.$;
  APEMB.S = null;
  $('apemb-corpo').style.display = 'none';
  ['apemb-recalc', 'apemb-desfazer', 'apemb-zerar', 'apemb-folhas'].forEach(function (id) { $(id).disabled = true; });
  if (!batchId) { $('apemb-status').textContent = 'Escolha o lote.'; return; }
  $('apemb-status').textContent = 'Buscando as peças do plano de corte…';
  let pecas, fonte;
  try {
    const r = await APEMB.carregarPecas(batchId, function (t) { $('apemb-status').textContent = t; });
    pecas = r.pecas; fonte = r.fonte;
  } catch (err) {
    console.error('[apemb]', err);
    $('apemb-status').innerHTML = '<span class="erp-error-detail">' + UI.esc((LOTES.explainError ? LOTES.explainError(err) : '') || err.message || String(err)) + '</span>';
    return;
  }
  if ($('apemb-lote').value !== batchId) return;
  if (!pecas.length) { $('apemb-status').textContent = 'Esse lote não tem peça nenhuma.'; return; }

  const sel = $('apemb-lote');
  const S = { batchId: batchId, pecas: pecas, fonte: fonte, porCodigo: {}, batchCode: ((sel.options[sel.selectedIndex] || {}).text || '').replace(/\s*\(último\)$/, '') };
  pecas.forEach(function (p) { S.porCodigo[p.codigo] = p; p.destino = APEMB_PLANO.classificar(p); p.id = 'P|' + p.codigo; });
  S.mods = APEMB_PLANO.agruparModulos(pecas);
  Object.keys(S.mods).forEach(function (k) {
    const m = S.mods[k];
    const d = m.pecasNicho.concat(m.pecasSoltas).map(function (p) { return p.dimsMod; }).find(Boolean);
    if (d) { m.W = d.W; m.H = d.H; m.D = d.D; }
    m.dims = APEMB_PLANO.dimsDoModulo(m);
    m.portas = m.pecasNicho.filter(function (p) { return /\b(porta|portas|door|doors|frente)\b/i.test(p.ref); }).length;
  });
  APEMB.S = S;
  APEMB.montarVolumes();

  const salvo = APEMB._ls(APEMB.K_LOTE(batchId)) || {};
  S.st = { apontadas: salvo.apontadas || {}, embalados: salvo.embalados || {}, nichoDe: salvo.nichoDe || {}, hist: salvo.hist || [],
           fora: salvo.fora || {}, pulmao: salvo.pulmao || [], pallets: null,
           montadoDe: salvo.montadoDe || {}, escolha: salvo.escolha || {}, montados: (salvo.montados && salvo.sig === S.sig) ? salvo.montados : APEMB_PLANO.plantaMontados(APEMB.params()) };
  S.sig = APEMB.assinatura();
  // pallet dinâmico: começa vazio e cresce a cada peça apontada (25/09)
  if (salvo.pallets && salvo.sig === S.sig) S.st.pallets = salvo.pallets;
  else S.st.pallets = APEMB.novaPlanta();
  if (salvo.plano && salvo.sig === S.sig) { S.plano = salvo.plano; APEMB.depoisDoPlano(); }
  else APEMB.recalcular($('apemb-recalc'));
};

/* Peças FÍSICAS: cut_plan_pieces do último plano (tem o PC-xxxx da
   etiqueta). Furação: FURACAO_LOTE.marcarPecasFuradas, o MESMO casamento
   do .ban (bolinha preta na etiqueta = vai pro nicho). Sem plano de corte,
   cai pro batch_pieces (sem código de etiqueta — aponta por clique). */
APEMB.carregarPecas = async function (batchId, avisar) {
  const erp = LOTES.erp();
  const { data: planos, error: ep } = await erp.from('cut_plans').select('id, version, code')
    .eq('batch_id', batchId).order('version', { ascending: false }).limit(1);
  if (ep) throw ep;
  const plano = planos && planos[0];
  const out = [];
  const mkKey = function (r) {
    return r.module_name ? [r.po_name || '', r.module_number || '', r.module_name].join('|') : null;
  };
  if (plano) {
    let rows = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await erp.from('cut_plan_pieces').select('*').eq('plan_id', plano.id)
        .order('piece_code').range(de, de + 999);
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < 1000) break;
    }
    // medidas W/H/D do módulo montado: order_items do pedido (melhor esforço;
    // sem coluna/sem acesso, a tela estima pelas peças)
    const dimsOI = {};
    try {
      const ids = {};
      rows.forEach(function (r) { (r.order_item_ids || []).forEach(function (id) { ids[id] = 1; }); });
      const lista = Object.keys(ids);
      if (lista.length && typeof DATA !== 'undefined' && DATA.sb) {
        const { data } = await DATA.sb().from('order_items').select('id, width_mm, height_mm, depth_mm').in('id', lista);
        (data || []).forEach(function (o) { if (o.width_mm && o.height_mm && o.depth_mm) dimsOI[o.id] = { W: Number(o.width_mm), H: Number(o.height_mm), D: Number(o.depth_mm) }; });
      }
    } catch (e) { console.warn('[apemb] sem medidas de order_items; módulo montado será estimado pelas peças', e); }
    avisar('Conferindo quais peças têm furação (mesmo cálculo do .ban)…');
    let metodo = 'ban';
    try { await FURACAO_LOTE.marcarPecasFuradas(batchId, rows); }
    catch (e) { console.warn('[apemb] furação indisponível, usando regra por nome:', e); metodo = 'nome'; }
    rows.forEach(function (r) {
      const v = [Number(r.w_mm) || 0, Number(r.h_mm) || 0].sort(function (a, b) { return b - a; });
      out.push({ codigo: r.piece_code, ref: r.reference || r.label || '—', c: v[0], l: v[1], e: Number(r.espessura_mm) || 19.5,
        cor: r.color_name || '', modKey: mkKey(r), moduloNumero: r.module_number || '—', moduloNome: r.module_name || '',
        pedido: r.po_name || '', cliente: r.client_name || '',
        dimsMod: (r.order_item_ids || []).map(function (id) { return dimsOI[id]; }).find(Boolean) || null,
        furada: metodo === 'ban' ? !!r._furado : !!r.module_name });
    });
    return { pecas: out, fonte: 'Plano ' + (plano.code || ('v' + plano.version)) + (metodo === 'ban' ? ' · furação pelo .ban' : ' · furação estimada (sem .ban)') };
  }
  const b = await LOTES.batch(batchId);
  (b && b._pieces || []).forEach(function (r, i) {
    const q = Math.max(1, Math.round(Number(r.quantity) || 1));
    const v = [Number(r.comprimento_mm) || 0, Number(r.largura_mm) || 0].sort(function (a, c) { return c - a; });
    for (let k = 0; k < q; k++) {
      out.push({ codigo: 'BP-' + String(i + 1).padStart(4, '0') + (q > 1 ? '-' + (k + 1) : ''), ref: r.reference || '—', c: v[0], l: v[1],
        e: Number(r.espessura_mm) || 19.5, cor: r.color_name || '', modKey: mkKey(r), moduloNumero: r.module_number || '—',
        moduloNome: r.module_name || '', pedido: r.po_name || '', cliente: r.client_name || '', furada: !!r.module_name });
    }
  });
  return { pecas: out, fonte: 'Sem plano de corte — peças do lote sem código de etiqueta (apontar por clique)' };
};

APEMB.novaPlanta = function () {
  const S = APEMB.S;
  return APEMB_PLANO.plantaDinamica(S.volumes, S.pecas.filter(function (p) { return p.destino === 'solta'; }), APEMB.params());
};

APEMB.montarVolumes = function () {
  const S = APEMB.S, pr = APEMB.params();
  S.volumes = []; S.volPorId = {};
  Object.keys(S.mods).forEach(function (k) {
    const m = S.mods[k];
    m.volumes = m.pecasNicho.length ? APEMB_PLANO.volumesDoModulo(m.pecasNicho, pr) : [];
    m.volumes.forEach(function (v) {
      v.id = 'V|' + k + '|' + v.idx; v.modKey = k; v.tipo = 'volume'; v.rotulo = 'Vol. ' + m.numero + '-' + v.idx;
      S.volumes.push(v); S.volPorId[v.id] = v;
    });
  });
};

APEMB.assinatura = function () {
  const S = APEMB.S, pr = APEMB.params();
  const s = S.pecas.map(function (p) { return p.codigo + ':' + p.destino + ':' + p.c + 'x' + p.l + 'x' + p.e; }).sort().join(',') +
    '|' + JSON.stringify(pr);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
};

APEMB.salvar = function () {
  const S = APEMB.S;
  if (!S) return;
  APEMB._ls(APEMB.K_LOTE(S.batchId), { sig: S.sig, plano: S.plano, apontadas: S.st.apontadas, embalados: S.st.embalados,
    nichoDe: S.st.nichoDe, hist: S.st.hist.slice(-300), fora: S.st.fora, pulmao: S.st.pulmao, pallets: S.st.pallets,
    montadoDe: S.st.montadoDe, montados: S.st.montados, escolha: S.st.escolha });
};

APEMB.recalcular = function (btn) {
  const S = APEMB.S, $ = APEMB.$;
  if (!S) return;
  LOTES_UI.busy(btn, true, 'Calculando previsão…');
  $('apemb-status').textContent = 'Calculando a previsão de pallets (volumes + peças soltas, com calço)…';
  setTimeout(function () {
    try {
      // PREVISÃO: quantos pallets o lote inteiro deve dar, na MESMA planta
      // do pallet dinâmico. O pallet real é montado peça a peça (colocarNoPallet).
      const pr = APEMB.params();
      const lim = APEMB_PLANO.DEFAULTS.larguraPallet;
      const soltas = S.pecas.filter(function (p) { return p.destino === 'solta' && p.l <= lim; });
      const vols = S.volumes.filter(function (v) { return Math.min(v.C, v.L) <= lim; });
      const planta = APEMB.novaPlanta();
      S.plano = APEMB_PLANO.planejarPallets(vols, soltas, Object.assign({}, pr, { maxD: planta.planD, maxW: planta.planW, planW: planta.planW, planD: planta.planD }));
      S.plano.foraDoPallet = S.pecas.filter(function (p) { return p.destino === 'solta' && p.l > lim; }).length +
        S.volumes.filter(function (v) { return Math.min(v.C, v.L) > lim; }).length;
      S.sig = APEMB.assinatura();
      if (!S.st.pallets || S.st.pallets.planW !== planta.planW || S.st.pallets.planD !== planta.planD) {
        if (S.st.pallets && S.st.pallets.pallets.some(function (p) { return p.itens.length; })) {
          console.warn('[apemb] planta mudou — o pallet montado foi zerado');
        }
        S.st.pallets = planta;
      }
      APEMB.salvar();
      APEMB.depoisDoPlano();
    } catch (err) {
      console.error('[apemb]', err);
      $('apemb-status').innerHTML = '<span class="erp-error-detail">Erro no plano: ' + UI.esc(err.message || String(err)) + '</span>';
    } finally { LOTES_UI.busy(btn, false); }
  }, 30);
};

APEMB.depoisDoPlano = function () {
  const S = APEMB.S, $ = APEMB.$;
  APEMB.indexarPallets();
  S.nivelVisto = {};
  S.alvo = null;
  ['apemb-recalc', 'apemb-desfazer', 'apemb-zerar', 'apemb-folhas'].forEach(function (id) { $(id).disabled = false; });
  $('apemb-status').textContent = S.fonte + ' · ' + S.pecas.length + ' peças.';
  $('apemb-corpo').style.display = '';
  APEMB.redesenhar();
  $('apemb-input').focus();
};

/* ---------------------------------------------------------- estado */

APEMB.indexarPallets = function () {
  const S = APEMB.S;
  S.itemPorId = {};
  S.st.pallets.pallets.concat(S.st.montados.pallets).forEach(function (pal) {
    pal.niveis = APEMB_PLANO.niveisDoPallet(pal);
    pal.alturaCarga = APEMB_PLANO.alturaCarga(pal);
    pal.itens.forEach(function (it) { S.itemPorId[it.id] = it; });
  });
};

/* Põe uma peça solta ou um volume no pallet, agora — ou no PULMÃO (área
   de espera) se não encaixar bem. Devolve { it } (posicionado),
   { pulmao: motivo } ou { fora: motivo }. */
APEMB.itemDe = function (id) {
  const S = APEMB.S;
  if (id.indexOf('M|') === 0) { const m = S.mods[id.slice(2)]; return m && m.dims ? { id: id, tipo: 'modulo', rotulo: 'Mód. ' + m.numero, W: m.dims.W, D: m.dims.D, H: m.dims.H, e: m.dims.H, c: m.dims.W, l: m.dims.D } : null; }
  return id.indexOf('V|') === 0 ? S.volPorId[id] : S.porCodigo[id.slice(2)];
};
APEMB.porNoPallet = function (item, forcar, semRemanejo) {
  const S = APEMB.S;
  const o = Object.assign({}, APEMB.params(), { soSeEncaixaBem: !forcar, forcar: !!forcar });
  let r = APEMB_PLANO.colocarNoPallet(S.st.pallets, item, o);
  if (r.fora) { S.st.fora[item.id] = r.motivo; return { fora: r.motivo }; }
  let remanejo = null;
  if (r.pulmao && !semRemanejo) {
    // não encaixou bem: vale tirar 1–4 peças livres e reencaixar tudo junto?
    remanejo = APEMB_PLANO.remanejar(S.st.pallets, item, o);
    if (remanejo) {
      APEMB_PLANO.aplicarRemanejo(S.st.pallets, remanejo, false);
      remanejo.pallet = remanejo.pallet.n;
      r = remanejo.nova;
    }
  }
  if (r.pulmao) { if (S.st.pulmao.indexOf(item.id) < 0) S.st.pulmao.push(item.id); return { pulmao: r.motivo }; }
  const k = S.st.pulmao.indexOf(item.id);
  if (k >= 0) S.st.pulmao.splice(k, 1);
  APEMB.indexarPallets();
  return { it: S.itemPorId[item.id] || r, remanejo: remanejo };
};

/* Depois de cada peça colocada: alguma do pulmão passou a encaixar bem?
   Maior primeiro. Devolve as que entraram (pra avisar o operador). */
APEMB.tentarPulmao = function () {
  const S = APEMB.S;
  const entraram = [];
  let mudou = true;
  while (mudou) {
    mudou = false;
    const fila = S.st.pulmao.slice().map(APEMB.itemDe).filter(Boolean)
      .sort(function (a, b) { return (APEMB_PLANO.pesoKg(APEMB.cDe(b), APEMB.lDe(b), b.e || b.H, 1)) - (APEMB_PLANO.pesoKg(APEMB.cDe(a), APEMB.lDe(a), a.e || a.H, 1)); });
    for (let i = 0; i < fila.length; i++) {
      const r = APEMB.porNoPallet(fila[i], false, true);
      if (r.it) { entraram.push(r.it); mudou = true; break; }
    }
  }
  return entraram;
};
APEMB.cDe = function (x) { return x.C != null ? Math.max(x.C, x.L) : x.c; };
APEMB.lDe = function (x) { return x.C != null ? Math.min(x.C, x.L) : x.l; };

/* Esvazia o pulmão: maior (mais pesado) primeiro, cada um no melhor lugar
   que existe agora — pro fim do lote, quando não vai chegar mais base. */
APEMB.esvaziarPulmao = function () {
  const S = APEMB.S;
  if (!S.st.pulmao.length) return;
  const fila = S.st.pulmao.slice().map(APEMB.itemDe).filter(Boolean)
    .sort(function (a, b) { return (APEMB.cDe(b) * APEMB.lDe(b) * (b.e || b.H)) - (APEMB.cDe(a) * APEMB.lDe(a) * (a.e || a.H)); });
  const ids = [];
  fila.forEach(function (item) {
    const r = APEMB.porNoPallet(item, false);
    const r2 = r.it ? r : APEMB.porNoPallet(item, true);
    if (r2.it) ids.push(item.id);
  });
  S.st.hist.push({ tipo: 'pulmao-esvaziar', ids: ids });
  APEMB.salvar();
  S.alvo = null;
  APEMB.redesenhar();
  APEMB.msg('info', 'Pulmão esvaziado: ' + ids.map(function (id) {
    const x = S.itemPorId[id]; return '<b>' + UI.esc((APEMB.itemDe(id) || {}).rotulo || id.slice(2)) + '</b> → pallet ' + x.pallet + ' nível ' + x.nivel +
      (x.calcos && x.calcos.length ? ' (calço)' : '');
  }).join(' · '));
};

APEMB.forcarDoPulmao = function (id) {
  const S = APEMB.S, item = APEMB.itemDe(id);
  if (!item) return;
  const r = APEMB.porNoPallet(item, true);
  if (!r.it) { APEMB.msg('erro', 'Não consegui pôr ' + UI.esc(item.rotulo || item.codigo) + ' no pallet.'); return; }
  S.st.hist.push({ tipo: 'pulmao-forcar', id: id });
  APEMB.salvar();
  S.alvo = { tipo: 'item', id: id };
  APEMB.redesenhar();
  APEMB.msg('info', '<b>' + UI.esc(item.rotulo || item.codigo) + '</b> (do pulmão) → ' + APEMB.textoPosicao(r.it));
};

APEMB.colocado = function (id) {
  const S = APEMB.S;
  if (id.indexOf('V|') === 0) return !!S.st.embalados[id];
  return !!S.st.apontadas[id.slice(2)];
};
APEMB.modCompleto = function (m) {
  return m.pecasNicho.length > 0 && m.pecasNicho.every(function (p) { return APEMB.S.st.apontadas[p.codigo]; });
};
APEMB.modEmbalado = function (m) {
  if (APEMB.S.st.montadoDe[m.key]) return true;   // foi montado: nicho liberado do mesmo jeito
  return m.volumes.length > 0 && m.volumes.every(function (v) { return APEMB.S.st.embalados[v.id]; });
};
APEMB.modMontado = function (m) { return !!APEMB.S.st.montadoDe[m.key]; };

/* ---------------------------------------------------------- apontar */

APEMB.normalizar = function (txt) {
  let s = String(txt || '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(s)) s = 'PC-' + s.padStart(6, '0');
  if (/^PC\d+$/.test(s)) s = 'PC-' + s.slice(2).padStart(6, '0');
  return s;
};

APEMB.apontar = function (txt) {
  const S = APEMB.S;
  if (!S || !S.plano) return;
  const cod = APEMB.normalizar(txt);
  if (!cod) return;
  const p = S.porCodigo[cod];
  if (!p) { APEMB.msg('erro', 'Código ' + UI.esc(cod) + ' não é deste lote.'); APEMB.bip(false); return; }

  if (S.st.apontadas[cod]) {
    APEMB.mostrarPeca(p, 'Já apontada — ');
    APEMB.bip(true);
    return;
  }
  const acao = { tipo: 'apontar', codigo: cod };
  if (p.destino === 'nicho') {
    const m = S.mods[p.modKey];
    if (!S.st.nichoDe[p.modKey]) {
      const ocup = {};
      Object.keys(S.st.nichoDe).forEach(function (k) {
        const n = S.st.nichoDe[k];
        if (n && n !== 'CHAO' && !APEMB.modEmbalado(S.mods[k] || { volumes: [] })) ocup[n] = k;
      });
      const r = APEMB_PLANO.escolherNicho(m, APEMB_PLANO.nichosDaEstante(APEMB.estanteCfg()), ocup);
      S.st.nichoDe[p.modKey] = r.nicho ? r.nicho.id : 'CHAO';
      m._avisoNicho = r.aviso;
      acao.nichoAtribuido = p.modKey;
    }
  }
  if (p.destino === 'solta') {
    acao.noPallet = p.id;
    const r = APEMB.porNoPallet(p, false);
    p._ultimo = r;
    if (r.remanejo) { acao.remanejo = r.remanejo; S.movidas = r.remanejo.movidas.map(function (m) { return m.id; }); } else S.movidas = null;
    if (r.it) acao.doPulmao = APEMB.tentarPulmao().map(function (it) { return it.id; });
  }
  S.st.apontadas[cod] = Date.now();
  S.st.hist.push(acao);
  APEMB.salvar();
  APEMB.mostrarPeca(p, '');
  APEMB.bip(true);
};

APEMB.mostrarPeca = function (p, prefixo) {
  const S = APEMB.S;
  const dims = Math.round(p.c) + ' × ' + Math.round(p.l) + ' × ' + p.e;
  if (p.destino === 'nicho') {
    const m = S.mods[p.modKey];
    const n = S.st.nichoDe[p.modKey] || '?';
    const feitas = m.pecasNicho.filter(function (q) { return S.st.apontadas[q.codigo]; }).length;
    S.alvo = { tipo: 'nicho', modKey: p.modKey };
    const onde = n === 'CHAO' ? 'ÁREA DO CHÃO' : 'NICHO ' + n;
    let t = prefixo + '<b>' + UI.esc(p.codigo) + '</b> ' + UI.esc(p.ref) + ' ' + dims + ' → <b class="apemb-big">' + onde + '</b> · mód. ' +
      UI.esc(m.numero) + ' ' + UI.esc(m.nome) + ' · ' + feitas + '/' + m.pecasNicho.length;
    if (m._avisoNicho) t += '<div class="erp-xs">' + UI.esc(m._avisoNicho) + '</div>';
    if (APEMB.modCompleto(m) && !APEMB.modEmbalado(m)) {
      t += '<div><b>Módulo completo!</b> Embalar em ' + m.volumes.length + ' volume(s) — veja abaixo.</div>';
      APEMB.redesenhar();
      APEMB.abrirEmbalar(p.modKey);
      APEMB.msg('ok', t);
      return;
    }
    APEMB.redesenhar();
    APEMB.msg('info', t);
  } else {
    const it = S.itemPorId[p.id];
    S.alvo = it ? { tipo: 'item', id: p.id } : null;
    APEMB.redesenhar();
    const noPulmao = S.st.pulmao.indexOf(p.id) >= 0;
    let t = prefixo + '<b>' + UI.esc(p.codigo) + '</b> ' + UI.esc(p.ref) + ' ' + dims + ' → ';
    if (it) t += APEMB.textoPosicao(it) + (p._ultimo && p._ultimo.remanejo && !prefixo ? APEMB.textoRemanejo(p._ultimo.remanejo) : '');
    else if (noPulmao) t += '<b class="apemb-big">PULMÃO</b> (área de espera) — ' + UI.esc((p._ultimo && p._ultimo.pulmao) || 'ainda não encaixa bem') +
      '. Entra sozinha quando o pallet tiver base pra ela.';
    else t += '<b class="apemb-big">CAVALETE BIG PARTS</b> — não vai no pallet: ' + UI.esc(S.st.fora[p.id] || 'não coube');
    const ultimaAcao = S.st.hist[S.st.hist.length - 1];
    if (ultimaAcao && ultimaAcao.codigo === p.codigo && ultimaAcao.doPulmao && ultimaAcao.doPulmao.length) {
      t += '<div class="apemb-pulmao-aviso">↩ Do pulmão, coloque também agora: ' + ultimaAcao.doPulmao.map(function (id) {
        const x = S.itemPorId[id]; return '<b>' + UI.esc((APEMB.itemDe(id) || {}).rotulo || id.slice(2)) + '</b> → pallet ' + x.pallet + ' nível ' + x.nivel;
      }).join(' · ') + '</div>';
    }
    APEMB.msg(it || noPulmao ? 'info' : 'erro', t);
  }
};

APEMB.textoPosicao = function (it) {
  const S = APEMB.S;
  const ao = Math.abs(it.w - it.c) < 1 ? 'comprimento ao longo do pallet' : 'atravessada no pallet';
  let t = '<b class="apemb-big">PALLET ' + it.pallet + ' · nível ' + it.nivel + '</b> · ' + it.seq + 'ª peça do pallet' +
    ' · ' + Math.round(it.x) + ' mm da esquerda, ' + Math.round(it.y) + ' mm do fundo · ' + ao +
    (it.z > 0.5 ? ' · em cima do que já está (z ' + Math.round(it.z) + ' mm)' : ' · direto no estrado');
  if (it.calcos && it.calcos.length) {
    const blocos = it.calcos.reduce(function (s, c) { return s + c.n; }, 0);
    t += '<div class="apemb-calco-aviso">⚠ Antes: ' + blocos + ' calço(s) 100×100×19 em ' + it.calcos.length + ' ponto(s) ' +
      it.calcos.map(function (c) { return '(' + (c.n === 2 ? '2 empilhados' : '1') + ')'; }).join(' ') + ' — marcados no desenho.</div>';
  }
  if (it.parcial) t += '<div class="apemb-espera">Sem apoio pleno mesmo com calço — conferir na hora.</div>';
  return t;
};

APEMB.textoRemanejo = function (rem) {
  const S = APEMB.S;
  const nome = function (id) { const x = APEMB.itemDe(id); return x ? (x.rotulo || x.codigo) : id; };
  const pos = function (q) { return Math.round(q.x) + ' mm da esq., ' + Math.round(q.y) + ' mm do fundo' + (q.z > 0.6 ? ', z ' + Math.round(q.z) : ', no estrado'); };
  return '<div class="apemb-remanejo"><b>⇄ REMANEJO</b> — pra ela ficar bem apoiada, tire primeiro ' + rem.movidas.length + ' peça(s) que estão soltas em cima ' +
    '(laranja no desenho), ponha a nova, e recoloque:<ul>' +
    rem.movidas.map(function (m) {
      const it = S.itemPorId[m.id] || {};
      return '<li><b>' + UI.esc(nome(m.id)) + '</b>: estava em ' + pos(m.antes) + ' → vai pra <b>' + pos(m.depois) + '</b>' +
        (it.nivel ? ' (nível ' + it.nivel + ')' : '') + (Math.abs(m.antes.w - m.depois.w) > 1 ? ' — girada' : '') + '</li>';
    }).join('') + '</ul></div>';
};

APEMB.msg = function (tipo, html) {
  const el = APEMB.$('apemb-msg');
  el.className = 'apemb-msg apemb-msg-' + tipo;
  el.innerHTML = html;
};

APEMB.bip = function (ok) {
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    APEMB._ac = APEMB._ac || new C();
    const o = APEMB._ac.createOscillator(), g = APEMB._ac.createGain();
    o.frequency.value = ok ? 1200 : 300; g.gain.value = 0.08;
    o.connect(g); g.connect(APEMB._ac.destination);
    o.start(); o.stop(APEMB._ac.currentTime + (ok ? 0.08 : 0.35));
  } catch (e) { /* sem som, tudo bem */ }
};

APEMB.desfazer = function () {
  const S = APEMB.S;
  if (!S || !S.st.hist.length) return;
  const a = S.st.hist.pop();
  if (a.tipo === 'apontar') {
    delete S.st.apontadas[a.codigo];
    if (a.nichoAtribuido) delete S.st.nichoDe[a.nichoAtribuido];
    if (a.noPallet) {
      (a.doPulmao || []).slice().reverse().forEach(function (id) { APEMB_PLANO.tirarDoPallet(S.st.pallets, id); S.st.pulmao.push(id); });
      if (a.remanejo) APEMB_PLANO.aplicarRemanejo(S.st.pallets, a.remanejo, true);
      else APEMB_PLANO.tirarDoPallet(S.st.pallets, a.noPallet);
      delete S.st.fora[a.noPallet];
      const k = S.st.pulmao.indexOf(a.noPallet); if (k >= 0) S.st.pulmao.splice(k, 1);
      APEMB.indexarPallets();
    }
    APEMB.msg('info', 'Desfeito: apontamento de ' + UI.esc(a.codigo) + '.');
  } else if (a.tipo === 'montar') {
    delete S.st.montadoDe[a.modKey]; delete S.st.escolha[a.modKey];
    APEMB_PLANO.tirarDoPallet(S.st.montados, a.id); delete S.st.fora[a.id];
    APEMB.indexarPallets();
    APEMB.msg('info', 'Desfeito: módulo ' + UI.esc((S.mods[a.modKey] || {}).numero || '') + ' volta a "completo no nicho".');
  } else if (a.tipo === 'pulmao-esvaziar') {
    a.ids.slice().reverse().forEach(function (id) { APEMB_PLANO.tirarDoPallet(S.st.pallets, id); S.st.pulmao.push(id); });
    APEMB.indexarPallets();
    APEMB.msg('info', 'Desfeito: itens voltaram pro pulmão.');
  } else if (a.tipo === 'pulmao-forcar') {
    APEMB_PLANO.tirarDoPallet(S.st.pallets, a.id); S.st.pulmao.push(a.id); APEMB.indexarPallets();
    APEMB.msg('info', 'Desfeito: item voltou pro pulmão.');
  } else if (a.tipo === 'embalar') {
    delete S.st.embalados[a.volId];
    (a.doPulmao || []).slice().reverse().forEach(function (id) { APEMB_PLANO.tirarDoPallet(S.st.pallets, id); S.st.pulmao.push(id); });
    if (a.remanejo) APEMB_PLANO.aplicarRemanejo(S.st.pallets, a.remanejo, true);
    else APEMB_PLANO.tirarDoPallet(S.st.pallets, a.volId);
    delete S.st.fora[a.volId];
    const k = S.st.pulmao.indexOf(a.volId); if (k >= 0) S.st.pulmao.splice(k, 1);
    APEMB.indexarPallets();
    APEMB.msg('info', 'Desfeito: ' + UI.esc((S.volPorId[a.volId] || {}).rotulo || a.volId) + ' volta a não embalado.');
  }
  S.alvo = null;
  APEMB.salvar();
  APEMB.redesenhar();
};

APEMB.zerar = function () {
  const S = APEMB.S;
  if (!S || !window.confirm('Apagar todos os apontamentos de TESTE deste lote?')) return;
  S.st = { apontadas: {}, embalados: {}, nichoDe: {}, hist: [], fora: {}, pulmao: [], pallets: APEMB.novaPlanta(),
           montadoDe: {}, escolha: {}, montados: APEMB_PLANO.plantaMontados(APEMB.params()) };
  APEMB.indexarPallets();
  S.alvo = null;
  APEMB.salvar();
  APEMB.$('apemb-embalar').innerHTML = '';
  APEMB.msg('info', 'Teste zerado.');
  APEMB.redesenhar();
};

APEMB.salvarCfg = function () {
  const $ = APEMB.$;
  const lista = function (id) { return $(id).value.split(/[,;\s]+/).map(Number).filter(function (v) { return v > 0; }); };
  const cols = lista('apemb-cols'), lin = lista('apemb-linhas');
  if (!cols.length || !lin.length) { APEMB.msg('erro', 'Estante precisa de pelo menos 1 coluna e 1 linha.'); return; }
  APEMB._ls(APEMB.K_ESTANTE, { colunas: cols, linhas: lin, prof: Number($('apemb-prof').value) || 800 });
  APEMB._ls(APEMB.K_PARAMS, {
    dens: Number($('apemb-dens').value) || 650, pesoMaxVolume: Number($('apemb-pmax').value) || 25,
    maxD: Math.max(0, Number($('apemb-maxd').value) || 0),
    calco: { h: Number($('apemb-calh').value) || 19, max: Math.max(1, Math.min(4, Number($('apemb-calmax').value) || 2)) }
  });
  if (APEMB.S) { APEMB.montarVolumes(); APEMB.recalcular($('apemb-recalc')); }
};

/* ---------------------------------------------------------- desenho */

APEMB.redesenhar = function () {
  if (!APEMB.S || !APEMB.S.plano) return;
  APEMB.desenharResumo();
  APEMB.desenharEstante();
  APEMB.desenharPallets();
  APEMB.desenharMontados();
  APEMB.desenharCavalete();
  APEMB.desenharLista();
};

APEMB.desenharResumo = function () {
  const S = APEMB.S, pl = S.plano;
  const nicho = S.pecas.filter(function (p) { return p.destino === 'nicho'; });
  const solta = S.pecas.filter(function (p) { return p.destino === 'solta'; });
  const ap = function (arr) { return arr.filter(function (p) { return S.st.apontadas[p.codigo]; }).length; };
  const est = S.st.pallets;
  const cal = APEMB_PLANO.contarCalcos(est);
  const emb = S.volumes.filter(function (v) { return S.st.embalados[v.id]; }).length;
  const o = pl.opt;
  const dims = Math.round(est.planW + 2 * o.margem) + ' × ' + Math.round(est.planD + 2 * o.margem) + ' mm';
  const nFora = Object.keys(S.st.fora).length;
  APEMB.$('apemb-resumo').innerHTML = '<div class="erp-grid erp-grid-4 apemb-kpis">' +
    UI.kpi('Pallets', '<span class="apemb-kpi-grande">' + est.pallets.length + '</span> <span class="erp-muted" style="font-size:16px">montado(s) · previsão ' + pl.pallets.length + '</span>',
      dims + (est.pallets.length ? ' · alt. ' + est.pallets.map(function (p) { return Math.round(p.alturaCarga + o.peH + o.deckE); }).join(' / ') + ' mm' : '') +
      (pl.foraDoPallet ? ' · ' + pl.foraDoPallet + ' item(ns) mais largo(s) que ' + est.larguraPallet + ' → cavalete big parts' : '')) +
    UI.kpi('Peças → nicho', ap(nicho) + ' / ' + nicho.length, Object.keys(S.mods).filter(function (k) { return S.mods[k].pecasNicho.length; }).length + ' módulos') +
    UI.kpi('Volumes arqueados', emb + ' / ' + S.volumes.length, 'máx. ' + APEMB.params().pesoMaxVolume + ' kg cada · ' +
      Object.keys(S.st.montadoDe).length + ' módulo(s) montado(s) em ' + S.st.montados.pallets.length + ' pallet(s)') +
    UI.kpi('Peças soltas → pallet', ap(solta) + ' / ' + solta.length, cal.blocos ? cal.blocos + ' calço(s) em ' + cal.pontos + ' ponto(s)' : 'nenhum calço') +
    '</div>' + (nFora ? '<div class="erp-note">' + nFora + ' item(ns) no <b>cavalete de big parts</b> (não vão no pallet): ' +
      Object.keys(S.st.fora).map(function (id) { return UI.esc(id.indexOf('V|') === 0 ? (S.volPorId[id] || {}).rotulo || id : id.slice(2)); }).join(', ') + '</div>' : '');
};

/* Estante: cópia da real vista de frente, em escala (mm). */
APEMB.desenharEstante = function () {
  const S = APEMB.S, cfg = APEMB.estanteCfg();
  const nichos = APEMB_PLANO.nichosDaEstante(cfg);
  const E = 19;                               // espessura do montante/prateleira
  const W = cfg.colunas.reduce(function (s, v) { return s + v; }, 0) + E * (cfg.colunas.length + 1);
  const H = cfg.linhas.reduce(function (s, v) { return s + v; }, 0) + E * (cfg.linhas.length + 1);
  const quem = {};                             // nichoId -> [modKey]
  const chao = [];
  Object.keys(S.st.nichoDe).forEach(function (k) {
    const n = S.st.nichoDe[k], m = S.mods[k];
    if (!m || APEMB.modEmbalado(m)) return;
    if (n === 'CHAO') chao.push(k); else (quem[n] = quem[n] || []).push(k);
  });
  const alvoMod = S.alvo && S.alvo.tipo === 'nicho' ? S.alvo.modKey : null;

  let svg = '<svg class="apemb-svg" viewBox="-10 -10 ' + (W + 20) + ' ' + (H + 90) + '">' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#8a6a4a" rx="4"/>';
  const xCol = [], yLin = [];
  let acc = E; cfg.colunas.forEach(function (w) { xCol.push(acc); acc += w + E; });
  acc = E; cfg.linhas.forEach(function (h) { yLin.push(acc); acc += h + E; });

  nichos.forEach(function (n) {
    const x = xCol[n.coluna], y = yLin[n.linha];
    const fsN = Math.round(Math.min(n.W, n.H) * 0.16), fsM = Math.round(Math.min(n.W, n.H) * 0.3), fsS = Math.round(Math.min(n.W, n.H) * 0.14);
    const mods = quem[n.id] || [];
    let cls = 'apemb-nicho';
    const completo = mods.some(function (k) { return APEMB.modCompleto(S.mods[k]); });
    if (mods.indexOf(alvoMod) >= 0 && !APEMB.modCompleto(S.mods[alvoMod])) cls += ' apemb-pisca-verm';
    else if (completo) cls += ' apemb-pisca-verde';
    else if (mods.length) cls += ' apemb-nicho-ocupado';
    svg += '<g class="apemb-nicho-g" onclick="APEMB.cliqueNicho(\'' + n.id + '\')">' +
      '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + n.W + '" height="' + n.H + '"/>' +
      '<text x="' + (x + 14) + '" y="' + (y + fsN + 6) + '" class="apemb-t-nicho" style="font-size:' + fsN + 'px">' + n.id + '</text>';
    mods.forEach(function (k, mi) {
      const m = S.mods[k];
      const feitas = m.pecasNicho.filter(function (p) { return S.st.apontadas[p.codigo]; });
      // pilha de peças apontadas, deitadas, de baixo pra cima (escala real)
      let zy = y + n.H;
      feitas.slice().sort(function (a, b) { return (b.c * b.l) - (a.c * a.l); }).forEach(function (p) {
        const pw = Math.min(n.W - 20, Math.min(p.l, n.W));
        const eh = p.e * 1.5;                   // espessura exagerada 1,5× pra ler a pilha
        zy -= eh;
        if (zy < y + fsN + 10) return;
        svg += '<rect x="' + (x + (n.W - pw) / 2) + '" y="' + zy + '" width="' + pw + '" height="' + eh + '" class="apemb-peca-nicho"/>';
      });
      svg += '<text x="' + (x + n.W - 14) + '" y="' + (y + fsM + mi * (fsM + fsS)) + '" text-anchor="end" class="apemb-t-mod" style="font-size:' + fsM + 'px">' + UI.esc(m.numero) + '</text>' +
        '<text x="' + (x + n.W - 14) + '" y="' + (y + fsM + fsS + 4 + mi * (fsM + fsS)) + '" text-anchor="end" class="apemb-t-mod-s" style="font-size:' + fsS + 'px">' +
        feitas.length + '/' + m.pecasNicho.length + (APEMB.modCompleto(m) ? ' ✓' : '') + '</text>';
    });
    svg += '</g>';
  });
  svg += '<text x="0" y="' + (H + 60) + '" class="apemb-t-cota" style="font-size:60px">' + Math.round(W) + ' mm · ' + cfg.colunas.length + ' × ' + cfg.linhas.length +
    ' nichos · prof. ' + cfg.prof + ' mm</text></svg>';

  let htmlChao = '';
  if (chao.length) {
    htmlChao = '<div class="apemb-chao"><div class="erp-strong erp-small">Área do chão (peças grandes)</div>' +
      chao.map(function (k) {
        const m = S.mods[k];
        const feitas = m.pecasNicho.filter(function (p) { return S.st.apontadas[p.codigo]; }).length;
        let cls = 'apemb-chao-mod';
        if (k === alvoMod && !APEMB.modCompleto(m)) cls += ' apemb-pisca-verm-bg';
        else if (APEMB.modCompleto(m)) cls += ' apemb-pisca-verde-bg';
        return '<span class="' + cls + '" onclick="APEMB.abrirEmbalar(\'' + UI.esc(k).replace(/'/g, '\\\'') + '\')">' +
          UI.esc(m.numero) + ' · ' + UI.esc(m.nome) + ' — ' + feitas + '/' + m.pecasNicho.length + '</span>';
      }).join('') + '</div>';
  }
  APEMB.$('apemb-estante').innerHTML = svg + htmlChao +
    '<div class="erp-muted erp-xs apemb-legenda"><i class="lg-verm"></i> onde pôr a peça lida <i class="lg-verde"></i> módulo completo — arquear ' +
    '<i class="lg-ocup"></i> em andamento · clique num nicho verde pra ver como embalar</div>';
};

APEMB.cliqueNicho = function (id) {
  const S = APEMB.S;
  const k = Object.keys(S.st.nichoDe).find(function (mk) {
    return S.st.nichoDe[mk] === id && S.mods[mk] && !APEMB.modEmbalado(S.mods[mk]);
  });
  if (k) APEMB.abrirEmbalar(k);
};

/* Pallets: vista de cima do NÍVEL que interessa (o da peça lida, ou o mais
   baixo ainda incompleto) + vista de frente com todos os níveis. */
APEMB.desenharPallets = function () {
  const S = APEMB.S, pl = S.plano, est = S.st.pallets;
  const alvoId = S.alvo && S.alvo.tipo === 'item' ? S.alvo.id : null;
  const lista = est.pallets.length ? est.pallets : [{ n: 1, itens: [], niveis: [], alturaCarga: 0, vazio: true }];
  const html = lista.map(function (pal) {
    const alvoIt = alvoId && S.itemPorId[alvoId] && S.itemPorId[alvoId].pallet === pal.n ? S.itemPorId[alvoId] : null;
    let nivel = S.nivelVisto[pal.n];
    if (alvoIt) nivel = alvoIt.nivel;
    if (!nivel || nivel > pal.niveis.length) nivel = Math.max(1, pal.niveis.length);
    const feitos = pal.itens.length;
    const W = est.planW, D = est.planD;
    const movidas = alvoId && S.movidas ? S.movidas : [];
    const cls = function (it) {
      if (it.id === alvoId) return 'apemb-pisca-verm';
      if (movidas.indexOf(it.id) >= 0) return 'apemb-pisca-laranja';
      return it.tipo === 'volume' ? 'apemb-it-vol-ok' : 'apemb-it-ok';
    };
    // --- vista de cima
    let top = '<svg class="apemb-svg" viewBox="-40 -40 ' + (W + 80) + ' ' + (D + 110) + '">' +
      '<rect x="-30" y="-30" width="' + (W + 60) + '" height="' + (D + 60) + '" class="apemb-deck"/>';
    // alvo e peças a remanejar sempre aparecem (mesmo acima do nível visto), por cima de tudo
    const destaque = function (it) { return it.id === alvoId || movidas.indexOf(it.id) >= 0; };
    pal.itens.slice().sort(function (a, b) { return (destaque(a) ? 1 : 0) - (destaque(b) ? 1 : 0) || a.z - b.z; }).forEach(function (it) {
      if (it.nivel > nivel && !destaque(it)) return;
      const abaixo = it.nivel < nivel && !destaque(it);
      const c = abaixo ? 'apemb-it-abaixo' : cls(it);
      top += '<g onclick="APEMB.cliqueItem(\'' + it.id.replace(/'/g, '\\\'') + '\')" style="cursor:pointer">' +
        '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.d + '" class="' + c + '"/>';
      if (!abaixo) {
        if (it.tipo === 'volume') {
          const v = S.volPorId[it.id];
          (v ? v.arqueacao.transversais : []).forEach(function (pos) {
            const along = it.w >= it.d;
            const k = pos * (along ? it.w : it.d) / Math.max(v.C, 1);
            top += along ? '<line x1="' + (it.x + k) + '" y1="' + it.y + '" x2="' + (it.x + k) + '" y2="' + (it.y + it.d) + '" class="apemb-fita"/>'
                         : '<line x1="' + it.x + '" y1="' + (it.y + k) + '" x2="' + (it.x + it.w) + '" y2="' + (it.y + k) + '" class="apemb-fita"/>';
          });
        }
        const fs = Math.max(34, Math.min(70, Math.min(it.w, it.d) * 0.35));
        top += '<text x="' + (it.x + it.w / 2) + '" y="' + (it.y + it.d / 2 + fs * 0.35) + '" text-anchor="middle" class="apemb-t-seq" style="font-size:' + fs + 'px">' +
          (it.tipo === 'volume' ? UI.esc((S.volPorId[it.id] || {}).rotulo || 'Vol') : '#' + it.seq) + '</text>';
        (it.calcos || []).forEach(function (cc) {
          top += '<rect x="' + (cc.x - 50) + '" y="' + (cc.y - 50) + '" width="100" height="100" class="apemb-calco"/>' +
            '<text x="' + cc.x + '" y="' + (cc.y + 18) + '" text-anchor="middle" class="apemb-t-calco">' + cc.n + '</text>';
        });
      }
      top += '</g>';
    });
    top += '<text x="' + (W / 2) + '" y="' + (D + 70) + '" text-anchor="middle" class="apemb-t-cota">FRENTE · ' + Math.round(W) + ' × ' + Math.round(D) + ' mm</text></svg>';

    // --- vista de frente (todos os níveis)
    const Hc = Math.max(pal.alturaCarga, 50), base = pl.opt.peH + pl.opt.deckE;
    const esc = 3;                                 // exagera a altura pra ler os níveis
    let fr = '<svg class="apemb-svg apemb-svg-frente" viewBox="-40 -10 ' + (W + 80) + ' ' + ((Hc + base) * esc + 20) + '">';
    const yb = (Hc + base) * esc;
    fr += '<rect x="-30" y="' + (yb - base * esc) + '" width="' + (W + 60) + '" height="' + (pl.opt.deckE * esc) + '" class="apemb-deck"/>';
    [-30, W / 2 - 50, W - 70].forEach(function (px) { fr += '<rect x="' + px + '" y="' + (yb - pl.opt.peH * esc) + '" width="100" height="' + (pl.opt.peH * esc) + '" class="apemb-deck"/>'; });
    pal.itens.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (it) {
      const y = yb - base * esc - (it.z + it.e) * esc;
      fr += '<rect x="' + it.x + '" y="' + y + '" width="' + it.w + '" height="' + (it.e * esc) + '" class="' + cls(it) + (it.nivel === nivel ? ' apemb-fr-ativo' : '') + '"/>';
    });
    fr += '</svg>';

    const chips = pal.niveis.map(function (z, i) {
      const n = i + 1;
      const its = pal.itens.filter(function (it) { return it.nivel === n; });
      const ok = its.every(function (it) { return APEMB.colocado(it.id); });
      return '<button class="apemb-chip' + (n === nivel ? ' ativo' : '') + (ok ? ' ok' : '') + '" onclick="APEMB.verNivel(' + pal.n + ',' + n + ')">' + n + '</button>';
    }).join('');
    const o = pl.opt;
    const alt = Math.round(pal.alturaCarga + o.peH + o.deckE);
    return '<div class="apemb-pallet">' +
      '<div class="apemb-pallet-head"><span class="erp-strong">Pallet ' + pal.n + '</span> <span class="erp-muted erp-small">' +
        (pal.vazio ? 'vazio — começa com a 1ª peça solta apontada' : feitos + ' item(ns) · altura atual ' + alt + ' mm') + '</span>' +
        (pal.vazio ? '' : ' <button class="erp-btn-secondary erp-btn-sm" style="float:right" onclick="APEMB.imprimirFolhas(\'pecas\',' + pal.n + ')">🖨 Folha do pallet</button>') + '</div>' +
      '<div class="apemb-niveis"><span class="erp-muted erp-xs">nível (de baixo pra cima):</span> ' + chips + '</div>' +
      top + '<div class="erp-muted erp-xs">Vista de frente (altura ×3):</div>' + fr +
    '</div>';
  }).join('');
  const pulmao = S.st.pulmao.map(APEMB.itemDe).filter(Boolean);
  const htmlPulmao = '<div class="apemb-pulmao' + (pulmao.length ? '' : ' vazio') + '"><div class="erp-strong erp-small">Pulmão — área de espera ' +
    '<span class="erp-muted">(' + pulmao.length + ')</span>' +
    (pulmao.length ? ' <button class="erp-btn-secondary erp-btn-sm" style="float:right" onclick="APEMB.esvaziarPulmao()" title="Fim do lote: põe tudo, maior primeiro, no melhor lugar que existe">esvaziar pulmão (maior primeiro)</button>' : '') + '</div>' +
    (pulmao.length ? pulmao.map(function (x) {
      const id = x.id, rot = x.rotulo || x.codigo;
      return '<div class="apemb-pulmao-item"><b>' + UI.esc(rot) + '</b> <span class="erp-muted">' + UI.esc(x.ref || (x.pecas ? x.pecas.length + ' peças' : '')) + ' ' +
        Math.round(APEMB.cDe(x)) + '×' + Math.round(APEMB.lDe(x)) + '×' + (x.e || x.H) + '</span> ' +
        '<button class="erp-btn-secondary erp-btn-sm" onclick="APEMB.forcarDoPulmao(\'' + id.replace(/'/g, '\\\'') + '\')" title="Põe no melhor lugar que existe agora, mesmo sem encaixe bom">colocar assim mesmo</button></div>';
    }).join('') : '<div class="erp-muted erp-xs">Vazio. Peça que não encaixa bem no momento fica aqui e entra sozinha quando o pallet tiver base pra ela.</div>') + '</div>';
  APEMB.$('apemb-pallets').innerHTML = htmlPulmao + html +
    '<div class="erp-muted erp-xs apemb-legenda"><i class="lg-verm"></i> onde pôr agora ' +
    '<i class="lg-laranja"></i> remanejar (tirar e recolocar) <i class="lg-ok"></i> peça já no pallet <i class="lg-vol"></i> volume arqueado <i class="lg-calco"></i> calço (nº = empilhados) · ' +
    'o pallet cresce a cada peça apontada; nada do que já está muda de lugar</div>';
};

APEMB.verNivel = function (pal, n) {
  APEMB.S.nivelVisto[pal] = n;
  APEMB.S.movidas = null;
  if (APEMB.S.alvo && APEMB.S.alvo.tipo === 'item' && APEMB.S.itemPorId[APEMB.S.alvo.id].pallet === pal) APEMB.S.alvo = null;
  APEMB.desenharPallets();
};

APEMB.cliqueItem = function (id) {
  const S = APEMB.S;
  if (id.indexOf('V|') === 0) { APEMB.abrirEmbalar(S.volPorId[id].modKey); return; }
  const p = S.porCodigo[id.slice(2)];
  if (!p) return;
  if (S.st.apontadas[p.codigo]) APEMB.mostrarPeca(p, 'Já apontada — ');
  else APEMB.apontar(p.codigo);
};

/* ---------------------------------------------------------- embalar módulo */

APEMB.abrirEmbalar = function (modKey) {
  const S = APEMB.S, m = S.mods[modKey];
  if (!m) return;
  S.embalarAberto = modKey;
  APEMB.desenharEmbalar();
  const el = APEMB.$('apemb-embalar');
  if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

APEMB.desenharEmbalar = function () {
  const S = APEMB.S, el = APEMB.$('apemb-embalar');
  const m = S.embalarAberto && S.mods[S.embalarAberto];
  if (!m) { el.innerHTML = ''; return; }
  const completo = APEMB.modCompleto(m);
  const nicho = S.st.nichoDe[m.key];
  const kg = function (v) { return v.toFixed(1).replace('.', ',') + ' kg'; };
  const faltam = m.pecasNicho.filter(function (p) { return !S.st.apontadas[p.codigo]; });
  const cards = m.volumes.map(function (v) {
    const it = S.itemPorId[v.id];
    const feito = !!S.st.embalados[v.id];
    return '<div class="apemb-vol' + (feito ? ' feito' : '') + '">' +
      '<div class="apemb-vol-head"><span class="erp-strong">' + UI.esc(v.rotulo) + ' (' + v.idx + ' de ' + v.total + ')</span> ' +
        '<span class="erp-muted erp-small">' + Math.round(v.C) + ' × ' + Math.round(v.L) + ' × ' + Math.round(v.H) + ' mm · ' + kg(v.peso) +
        (v.acimaDoLimite ? ' <span class="erp-pill erp-pill-warn">peça sozinha passa do limite</span>' : '') + '</span></div>' +
      '<div class="apemb-vol-corpo">' + APEMB.svgVolume(v) +
        '<ol class="apemb-passos">' +
          '<li>Empilhar de baixo pra cima, <b>centralizado</b> na peça de baixo:<ul>' +
            v.pecas.map(function (p, i) {
              return '<li><span class="erp-mono">' + UI.esc(p.codigo) + '</span> ' + UI.esc(p.ref) + ' <span class="erp-muted">' +
                Math.round(p.c) + '×' + Math.round(p.l) + '×' + p.e + '</span>' + (i === 0 ? ' <i>(embaixo)</i>' : '') + '</li>';
            }).join('') + '</ul></li>' +
          '<li>Cantoneira nos 4 cantos de cima e de baixo onde a fita passa.</li>' +
          '<li>Arquear com <b>' + v.arqueacao.transversais.length + ' fitas atravessadas</b> a ' +
            v.arqueacao.transversais.map(function (x) { return x + ' mm'; }).join(', ') + ' da ponta' +
            (v.arqueacao.longitudinal ? ' + <b>1 fita no comprido</b>, cruzando as outras' : '') + '.</li>' +
          '<li>Etiqueta do módulo por cima. ' + (it ? 'Está no <b>pallet ' + it.pallet + ', nível ' + it.nivel + '</b>.' : (feito ? (S.st.pulmao.indexOf(v.id) >= 0 ? 'Está no <b>pulmão</b>, esperando base no pallet.' : 'Fica no <b>cavalete de big parts</b> (' + UI.esc(S.st.fora[v.id] || '') + ').') : 'Ao marcar como arqueado, o sistema mostra onde vai no pallet.')) + '</li>' +
        '</ol></div>' +
      '<div style="margin-top:6px">' + (feito
        ? '<span class="erp-pill erp-pill-ok">embalado</span>'
        : '<button class="erp-btn" ' + (completo ? '' : 'disabled title="Faltam peças do módulo"') + ' onclick="APEMB.embalar(\'' + v.id.replace(/'/g, '\\\'') + '\')">✓ Volume arqueado — mostrar lugar no pallet</button>') +
      '</div></div>';
  }).join('');
  const montado = APEMB.modMontado(m);
  const temVolFeito = m.volumes.some(function (v) { return S.st.embalados[v.id]; });
  const itMont = S.itemPorId['M|' + m.key];
  const escolha = montado ? 'montado' : (temVolFeito ? 'desmontado' : S.st.escolha[m.key] || null);
  const kgMod = APEMB.pesoModulo(m).toFixed(1).replace('.', ',');
  // 1º PASSO: escolher como vai — uma decisão só, bem grande, por módulo
  if (completo && !escolha) {
    const k = m.key.replace(/'/g, '\\\'');
    el.innerHTML = '<div class="erp-panel apemb-embalar pronto">' +
      '<h2>Módulo ' + UI.esc(m.numero) + ' · ' + UI.esc(m.nome) + ' está completo <span class="erp-muted erp-small">' + UI.esc(m.pedido) +
        (nicho ? ' · ' + (nicho === 'CHAO' ? 'área do chão' : 'nicho ' + nicho) : '') + '</span>' +
        ' <button class="erp-btn-secondary erp-btn-sm" style="float:right" onclick="APEMB.S.embalarAberto=null;APEMB.desenharEmbalar()">fechar</button></h2>' +
      '<div class="erp-strong" style="margin:4px 0 10px">Como esse módulo vai?</div>' +
      '<div class="apemb-escolha">' +
        '<button class="apemb-opcao" onclick="APEMB.escolher(\'' + k + '\',\'desmontado\')">' +
          '<div class="apemb-opcao-ico">📦</div><div class="apemb-opcao-t">DESMONTADO</div>' +
          '<div class="erp-muted erp-small">' + m.volumes.length + ' volume(s) arqueado(s), ' + kgMod + ' kg no total<br>vai no pallet das peças</div></button>' +
        '<button class="apemb-opcao" onclick="APEMB.montar(\'' + k + '\')"' + (m.dims ? '' : ' disabled') + '>' +
          '<div class="apemb-opcao-ico">🚪</div><div class="apemb-opcao-t">MONTADO</div>' +
          '<div class="erp-muted erp-small">' + (m.dims ? m.dims.W + ' × ' + m.dims.H + ' × ' + m.dims.D + ' mm · ' + m.portas + ' porta(s)' : 'sem medidas') + '<br>vai no pallet 1200 × 1200 dos montados</div></button>' +
      '</div>' +
      (m.pecasSoltas.length ? '<div class="erp-muted erp-xs" style="margin-top:8px">+ ' + m.pecasSoltas.length + ' peça(s) sem furação deste módulo (' +
        m.pecasSoltas.map(function (p) { return UI.esc(p.ref); }).join(', ') + ') — se desmontado vão soltas no pallet; se montado, já vão dentro do módulo.</div>' : '') +
    '</div>';
    return;
  }
  const blocoMontado = m.dims ? '<div class="apemb-montar' + (montado ? ' feito' : '') + '">' +
    '<div class="apemb-vol-corpo" style="grid-template-columns:140px 1fr">' + APEMB.svgModulo(m, 180) +
    '<div><div class="erp-strong">Módulo montado — com porta</div>' +
      '<div class="erp-muted erp-small">' + m.dims.W + ' × ' + m.dims.H + ' × ' + m.dims.D + ' mm' + (m.dims.estimado ? ' (estimado pelas peças)' : ' (medidas do pedido)') +
      ' · ' + m.portas + ' porta(s) · ' + APEMB.pesoModulo(m).toFixed(1).replace('.', ',') + ' kg</div>' +
      (montado ? '<div style="margin-top:6px"><span class="erp-pill erp-pill-ok">montado</span> ' + (itMont ? 'pallet montados ' + itMont.pallet + ' · ' + Math.round(itMont.x) + ' mm da esq., ' + Math.round(itMont.y) + ' mm do fundo' + (itMont.z > 0.6 ? ' · em cima (z ' + Math.round(itMont.z) + ')' : '') : 'não coube no pallet 1200 × 1200') + '</div>'
        : '<div style="margin-top:6px"><button class="erp-btn erp-btn-secondary" ' + (completo && !temVolFeito ? '' : 'disabled title="' + (temVolFeito ? 'Já tem volume arqueado' : 'Faltam peças') + '"') +
          ' onclick="APEMB.montar(\'' + m.key.replace(/'/g, '\\\'') + '\')">🚪 Módulo montado — mostrar lugar no pallet 1200 × 1200</button></div>') +
    '</div></div></div>' : '';
  el.innerHTML = '<div class="erp-panel apemb-embalar' + (completo && !APEMB.modEmbalado(m) ? ' pronto' : '') + '">' +
    '<h2>' + (montado ? 'Módulo montado ' : 'Embalar módulo ') + UI.esc(m.numero) + ' · ' + UI.esc(m.nome) + ' <span class="erp-muted erp-small">' + UI.esc(m.pedido) +
      (nicho ? ' · ' + (nicho === 'CHAO' ? 'área do chão' : 'nicho ' + nicho) : '') + '</span>' +
      ' <button class="erp-btn-secondary erp-btn-sm" style="float:right" onclick="APEMB.S.embalarAberto=null;APEMB.desenharEmbalar()">fechar</button></h2>' +
    (completo ? '' : '<div class="erp-note">Faltam ' + faltam.length + ' peça(s) com furação: ' +
      faltam.map(function (p) { return '<span class="erp-mono">' + UI.esc(p.codigo) + '</span> ' + UI.esc(p.ref); }).join(', ') + '</div>') +
    (m.pecasSoltas.length ? '<div class="erp-muted erp-xs">+ ' + m.pecasSoltas.length + ' peça(s) sem furação deste módulo vão soltas no pallet (' +
      m.pecasSoltas.map(function (p) { return UI.esc(p.ref); }).join(', ') + ').</div>' : '') +
    '<div class="erp-muted erp-small" style="margin:4px 0 8px">' + m.volumes.length + ' volume(s), total ' +
      kg(m.volumes.reduce(function (s, v) { return s + v.peso; }, 0)) + ' — dividido pra nenhum passar de ' + APEMB.params().pesoMaxVolume +
      ' kg, com o menor número de volumes e peças de tamanho parecido juntas.</div>' +
    (escolha ? '<div class="apemb-escolhido">' + (montado ? '🚪 <b>MONTADO</b>' : '📦 <b>DESMONTADO</b> — ' + m.volumes.length + ' volume(s)') +
      (!temVolFeito && !montado ? ' <a href="javascript:void(0)" onclick="APEMB.escolher(\'' + m.key.replace(/'/g, '\\\'') + '\',null)">trocar</a>' : '') + '</div>' : '') +
    (montado ? blocoMontado : '<div class="apemb-vols">' + cards + '</div>') + '</div>';
};

/* Desenho do volume: vista de lado (pilha) + vista de cima com as fitas. */
APEMB.svgVolume = function (v) {
  const esc = 3, W = v.C, Hh = v.H * esc;
  let s = '<svg class="apemb-svg apemb-svg-vol" viewBox="-20 -20 ' + (W + 40) + ' ' + (Hh + v.L + 120) + '">';
  let y = Hh;
  v.pecas.forEach(function (p, i) {
    const pw = p.c, x = (W - pw) / 2;
    y -= p.e * esc;
    s += '<rect x="' + x + '" y="' + y + '" width="' + pw + '" height="' + (p.e * esc) + '" class="apemb-vol-peca' + (i % 2 ? ' alt' : '') + '"/>';
    if (p.e * esc >= 40) s += '<text x="' + (W / 2) + '" y="' + (y + p.e * esc / 2 + 12) + '" text-anchor="middle" class="apemb-t-vol">' + UI.esc(p.ref) + '</text>';
  });
  v.arqueacao.transversais.forEach(function (x) {
    s += '<line x1="' + x + '" y1="' + (y - 8) + '" x2="' + x + '" y2="' + (Hh + 8) + '" class="apemb-fita"/>';
  });
  const y0 = Hh + 60;
  s += '<rect x="0" y="' + y0 + '" width="' + W + '" height="' + v.L + '" class="apemb-vol-topo"/>';
  v.arqueacao.transversais.forEach(function (x) {
    s += '<line x1="' + x + '" y1="' + (y0 - 10) + '" x2="' + x + '" y2="' + (y0 + v.L + 10) + '" class="apemb-fita"/>';
  });
  if (v.arqueacao.longitudinal) s += '<line x1="-10" y1="' + (y0 + v.L / 2) + '" x2="' + (W + 10) + '" y2="' + (y0 + v.L / 2) + '" class="apemb-fita"/>';
  s += '<text x="' + (W / 2) + '" y="' + (y0 + v.L / 2 + 20) + '" text-anchor="middle" class="apemb-t-vol">vista de cima · ' + Math.round(W) + ' × ' + Math.round(v.L) + '</text>';
  return s + '</svg>';
};

APEMB.embalar = function (volId) {
  const S = APEMB.S, v = S.volPorId[volId];
  if (!v || S.st.embalados[volId]) return;
  S.st.embalados[volId] = Date.now();
  const acao = { tipo: 'embalar', volId: volId };
  const r = APEMB.porNoPallet(v, false);
  if (r.remanejo) { acao.remanejo = r.remanejo; S.movidas = r.remanejo.movidas.map(function (m) { return m.id; }); } else S.movidas = null;
  if (r.it) acao.doPulmao = APEMB.tentarPulmao().map(function (x) { return x.id; });
  S.st.hist.push(acao);
  APEMB.salvar();
  const it = S.itemPorId[volId];
  S.alvo = it ? { tipo: 'item', id: volId } : null;
  const m = S.mods[v.modKey];
  let t = '<b>' + UI.esc(v.rotulo) + '</b> arqueado → ' + (it ? APEMB.textoPosicao(it) + (r.remanejo ? APEMB.textoRemanejo(r.remanejo) : '')
    : r.pulmao ? '<b class="apemb-big">PULMÃO</b> (área de espera) — ' + UI.esc(r.pulmao) + '. Entra quando o pallet tiver base pra ele.'
    : '<b class="apemb-big">CAVALETE BIG PARTS</b> — ' + UI.esc(S.st.fora[volId] || 'não coube no pallet'));
  if (acao.doPulmao && acao.doPulmao.length) t += '<div class="apemb-pulmao-aviso">↩ Do pulmão, coloque também agora: ' + acao.doPulmao.map(function (id) {
    const x = S.itemPorId[id]; return '<b>' + UI.esc((APEMB.itemDe(id) || {}).rotulo || id.slice(2)) + '</b> → pallet ' + x.pallet + ' nível ' + x.nivel; }).join(' · ') + '</div>';
  if (APEMB.modEmbalado(m)) t += '<div>Módulo ' + UI.esc(m.numero) + ' todo embalado — ' +
    (S.st.nichoDe[m.key] && S.st.nichoDe[m.key] !== 'CHAO' ? 'nicho ' + S.st.nichoDe[m.key] + ' liberado.' : 'área do chão liberada.') + '</div>';
  APEMB.msg('ok', t);
  APEMB.bip(true);
  APEMB.redesenhar();
  APEMB.desenharEmbalar();
  const pal = APEMB.$('apemb-pallets');
  if (pal && pal.scrollIntoView) pal.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

/* ---------------------------------------------------------- módulo montado
   (25/09, Matt: nicho verde pode ser embalado OU virar módulo montado, com
   porta; pallet próprio de 1200 × 1200 com a mesma regra de encaixe;
   módulos do mesmo projeto podem ir uns montados, outros desmontados.) */
APEMB.montar = function (modKey) {
  const S = APEMB.S, m = S.mods[modKey];
  if (!m || !APEMB.modCompleto(m) || APEMB.modEmbalado(m)) return;
  if (m.volumes.some(function (v) { return S.st.embalados[v.id]; })) { APEMB.msg('erro', 'Esse módulo já tem volume arqueado — desfaça antes de montar.'); return; }
  const d = m.dims;
  if (!d) { APEMB.msg('erro', 'Não sei as medidas desse módulo.'); return; }
  const item = { id: 'M|' + modKey, tipo: 'modulo', W: d.W, D: d.D, H: d.H, rotulo: 'Mód. ' + m.numero };
  const o = Object.assign({}, APEMB.params(), { calco: null, soSeEncaixaBem: false, forcar: false, semParcial: true,
    hMax: APEMB_PLANO.DEFAULTS.alturaMaxMontados });
  const r = APEMB_PLANO.colocarNoPallet(S.st.montados, item, o);
  S.st.montadoDe[modKey] = Date.now();
  S.st.escolha[modKey] = 'montado';
  if (r.fora) S.st.fora[item.id] = r.motivo;
  APEMB.indexarPallets();
  S.st.hist.push({ tipo: 'montar', modKey: modKey, id: item.id });
  APEMB.salvar();
  S.alvo = r.fora ? null : { tipo: 'item', id: item.id };
  S.movidas = null;
  const it = S.itemPorId[item.id];
  APEMB.msg('ok', '<b>Módulo ' + UI.esc(m.numero) + ' · ' + UI.esc(m.nome) + '</b> montado (' + d.W + ' × ' + d.H + ' × ' + d.D + ' mm' +
    (d.estimado ? ', estimado pelas peças' : '') + ', ' + m.portas + ' porta(s)) → ' +
    (it ? '<b class="apemb-big">PALLET MONTADOS ' + it.pallet + '</b> · ' + Math.round(it.x) + ' mm da esquerda, ' + Math.round(it.y) + ' mm do fundo' +
      (it.z > 0.6 ? ' · <b>em cima</b> de outro módulo (z ' + Math.round(it.z) + ')' : ' · no estrado') +
      (Math.abs(it.w - d.W) > 1 ? ' · girado 90°' : '') + (it.parcial ? ' · <span class="erp-pill erp-pill-warn">sem apoio pleno</span>' : '')
      : '<b class="apemb-big">não cabe</b> no pallet de 1200 × 1200 (' + UI.esc(r.motivo || '') + ')') +
    '<div>' + (S.st.nichoDe[modKey] && S.st.nichoDe[modKey] !== 'CHAO' ? 'Nicho ' + S.st.nichoDe[modKey] + ' liberado.' : 'Área do chão liberada.') + '</div>');
  APEMB.bip(true);
  APEMB.redesenhar();
  APEMB.desenharEmbalar();
};

APEMB.escolher = function (modKey, como) {
  const S = APEMB.S;
  if (como) S.st.escolha[modKey] = como; else delete S.st.escolha[modKey];
  APEMB.salvar();
  APEMB.desenharEmbalar();
};

/* Desenho do módulo montado, de frente, com portas. */
APEMB.svgModulo = function (m, escalaMax) {
  const d = m.dims; if (!d) return '';
  const E = 19.5, W = d.W, H = d.H;
  let s = '<svg class="apemb-svg apemb-svg-mod" viewBox="-10 -10 ' + (W + 20) + ' ' + (H + 20) + '"' + (escalaMax ? ' style="max-height:' + escalaMax + 'px"' : '') + '>' +
    '<rect x="0" y="0" width="' + W + '" height="' + H + '" class="apemb-mod-caixa"/>';
  if (m.portas > 0) {
    const n = m.portas, pw = (W - 3 * 2 - (n - 1) * 3) / n;
    for (let i = 0; i < n; i++) {
      const x = 3 + i * (pw + 3);
      s += '<rect x="' + x + '" y="3" width="' + pw + '" height="' + (H - 6) + '" class="apemb-mod-porta"/>';
      const hx = i < n / 2 ? x + pw - 30 : x + 22;      // puxador no lado da abertura
      s += '<rect x="' + hx + '" y="' + (H / 2 - 40) + '" width="8" height="80" rx="4" class="apemb-mod-puxador"/>';
    }
  } else {
    // sem porta: mostra o interior com prateleiras
    const nPrat = m.pecasNicho.filter(function (p) { return /prateleira|shelf/i.test(p.ref); }).length;
    s += '<rect x="' + E + '" y="' + E + '" width="' + (W - 2 * E) + '" height="' + (H - 2 * E) + '" class="apemb-mod-interior"/>';
    for (let i = 1; i <= nPrat; i++) {
      const y = E + (H - 2 * E) * i / (nPrat + 1);
      s += '<rect x="' + E + '" y="' + y + '" width="' + (W - 2 * E) + '" height="' + E + '" class="apemb-mod-prat"/>';
    }
  }
  s += '<text x="' + (W / 2) + '" y="' + (H + 4) + '" text-anchor="middle" class="apemb-t-cota" style="font-size:' + Math.max(28, W * 0.06) + 'px">' + W + ' × ' + H + ' × ' + d.D + '</text></svg>';
  return s;
};

/* Pallet(s) dos módulos montados: vista de cima + vista de frente com os
   módulos desenhados montados (com porta). */
APEMB.desenharMontados = function () {
  const S = APEMB.S, est = S.st.montados;
  const el = APEMB.$('apemb-montados');
  if (!el) return;
  const alvoId = S.alvo && S.alvo.tipo === 'item' ? S.alvo.id : null;
  const o = S.plano.opt;
  if (!est.pallets.length) {
    el.innerHTML = '<div class="erp-muted erp-small">Nenhum módulo montado ainda. No nicho verde, escolha "Módulo montado" em vez de arquear — o pallet de ' +
      est.planW + ' × ' + est.planD + ' começa vazio e cresce com a mesma regra de encaixe.</div>';
    return;
  }
  el.innerHTML = est.pallets.map(function (pal) {
    const W = est.planW, D = est.planD;
    let top = '<svg class="apemb-svg" viewBox="-40 -40 ' + (W + 80) + ' ' + (D + 110) + '">' +
      '<rect x="-30" y="-30" width="' + (W + 60) + '" height="' + (D + 60) + '" class="apemb-deck"/>';
    pal.itens.slice().sort(function (a, b) { return a.z - b.z; }).forEach(function (it) {
      const m = S.mods[it.id.slice(2)] || {};
      top += '<g onclick="APEMB.abrirEmbalar(\'' + it.id.slice(2).replace(/'/g, '\\\'') + '\')" style="cursor:pointer">' +
        '<rect x="' + it.x + '" y="' + it.y + '" width="' + it.w + '" height="' + it.d + '" class="' + (it.id === alvoId ? 'apemb-pisca-verm' : 'apemb-it-mod') + '"/>' +
        // frente do módulo = lado de baixo do desenho (y + d), marcado com um traço
        '<line x1="' + (it.x + 10) + '" y1="' + (it.y + it.d - 6) + '" x2="' + (it.x + it.w - 10) + '" y2="' + (it.y + it.d - 6) + '" class="apemb-mod-frente"/>' +
        '<text x="' + (it.x + it.w / 2) + '" y="' + (it.y + it.d / 2 + 20) + '" text-anchor="middle" class="apemb-t-seq" style="font-size:' + Math.max(40, Math.min(90, it.w * 0.18)) + 'px">' +
          UI.esc(m.numero || '') + (it.z > 0.6 ? ' ▲' : '') + '</text></g>';
    });
    top += '<text x="' + (W / 2) + '" y="' + (D + 70) + '" text-anchor="middle" class="apemb-t-cota">FRENTE · ' + W + ' × ' + D + ' mm' + '</text></svg>';
    // vista de frente, escala real
    const base = o.peH + o.deckE, Hc = Math.max(pal.alturaCarga, 100);
    let fr = '<svg class="apemb-svg apemb-svg-frente-mod" viewBox="-40 -10 ' + (W + 80) + ' ' + (Hc + base + 20) + '">';
    const yb = Hc + base;
    fr += '<rect x="-30" y="' + (yb - base) + '" width="' + (W + 60) + '" height="' + o.deckE + '" class="apemb-deck"/>';
    [-30, W / 2 - 50, W - 70].forEach(function (px) { fr += '<rect x="' + px + '" y="' + (yb - o.peH) + '" width="100" height="' + o.peH + '" class="apemb-deck"/>'; });
    pal.itens.slice().sort(function (a, b) { return b.y - a.y; }).forEach(function (it) {
      const m = S.mods[it.id.slice(2)];
      const y = yb - base - (it.z + it.e);
      fr += '<g transform="translate(' + it.x + ',' + y + ')">' + (m ? APEMB.svgModuloEm(m, it.w, it.e, it.id === alvoId) : '') + '</g>';
    });
    fr += '</svg>';
    const kgTot = pal.itens.reduce(function (s2, it) { const m = S.mods[it.id.slice(2)]; return s2 + (m ? APEMB.pesoModulo(m) : 0); }, 0);
    return '<div class="apemb-pallet"><div class="apemb-pallet-head"><span class="erp-strong">Pallet montados ' + pal.n + '</span> <span class="erp-muted erp-small">' +
      pal.itens.length + ' módulo(s) · altura ' + Math.round(pal.alturaCarga + base) + ' mm · ' + kgTot.toFixed(0) + ' kg</span>' +
      ' <button class="erp-btn-secondary erp-btn-sm" style="float:right" onclick="APEMB.imprimirFolhas(\'montados\',' + pal.n + ')">🖨 Folha do pallet</button></div>' +
      '<div class="apemb-mont-grid">' + top + '<div><div class="erp-muted erp-xs">Vista de frente (escala real):</div>' + fr + '</div></div></div>';
  }).join('');
};

// módulo montado desenhado dentro da vista de frente do pallet (largura w como está no pallet, pode estar girado)
APEMB.svgModuloEm = function (m, w, h, alvo) {
  const n = m.portas;
  let s = '<rect x="0" y="0" width="' + w + '" height="' + h + '" class="' + (alvo ? 'apemb-pisca-verm' : 'apemb-mod-caixa') + '"/>';
  if (n > 0 && Math.abs(w - m.dims.W) < 1) {
    const pw = (w - 6 - (n - 1) * 3) / n;
    for (let i = 0; i < n; i++) s += '<rect x="' + (3 + i * (pw + 3)) + '" y="3" width="' + pw + '" height="' + (h - 6) + '" class="apemb-mod-porta"/>';
  } else if (Math.abs(w - m.dims.W) >= 1) {
    s += '<text x="' + (w / 2) + '" y="' + (h / 2) + '" text-anchor="middle" class="apemb-t-vol" style="font-size:' + Math.max(30, w * 0.08) + 'px">lateral</text>';
  }
  s += '<text x="' + (w / 2) + '" y="' + (h - 30) + '" text-anchor="middle" class="apemb-t-seq" style="font-size:' + Math.max(40, w * 0.12) + 'px">' + UI.esc(m.numero) + '</text>';
  return s;
};

APEMB.pesoModulo = function (m) {
  const dens = APEMB.params().dens;
  return m.pecasNicho.concat(m.pecasSoltas).reduce(function (s2, p) { return s2 + APEMB_PLANO.pesoKg(p.c, p.l, p.e, dens); }, 0);
};

/* Cavalete de big parts: peças mais largas que o pallet, em pé, encostadas
   uma na outra. Vista de frente: da maior (atrás) pra menor (na frente). */
APEMB.desenharCavalete = function () {
  const S = APEMB.S, el = APEMB.$('apemb-cavalete');
  if (!el) return;
  const ids = Object.keys(S.st.fora).filter(function (id) { return id.indexOf('M|') !== 0; });
  const itens = ids.map(function (id) { const x = APEMB.itemDe(id); return x ? { id: id, x: x, c: APEMB.cDe(x), l: APEMB.lDe(x), e: x.e || x.H } : null; }).filter(Boolean)
    .sort(function (a, b) { return (b.c * b.l) - (a.c * a.l); });
  if (!itens.length) { el.innerHTML = '<div class="erp-muted erp-small">Vazio. Peça mais larga que ' + S.st.pallets.larguraPallet + ' mm nos dois sentidos vem pra cá, em pé.</div>'; return; }
  const alvoId = S.alvo && S.alvo.tipo === 'item' ? S.alvo.id : null;
  const maxC = Math.max.apply(null, itens.map(function (i) { return i.c; })), maxL = Math.max.apply(null, itens.map(function (i) { return i.l; }));
  const passo = 60;
  const W = maxC + passo * itens.length + 200, H = maxL + 160;
  let svg = '<svg class="apemb-svg" viewBox="-20 -20 ' + (W + 40) + ' ' + (H + 40) + '">' +
    '<polygon points="60,' + H + ' 260,0 300,0 100,' + H + '" class="apemb-cav-perna"/>' +
    '<rect x="0" y="' + (H - 30) + '" width="' + W + '" height="30" class="apemb-cav-base"/>';
  itens.forEach(function (it, i) {
    const x = 120 + i * passo, y = H - 30 - it.l;
    svg += '<g onclick="APEMB.cliqueItem(\'' + it.id.replace(/'/g, '\\\'') + '\')" style="cursor:pointer">' +
      '<rect x="' + x + '" y="' + y + '" width="' + it.c + '" height="' + it.l + '" class="' + (it.id === alvoId ? 'apemb-pisca-verm' : 'apemb-cav-peca') + '"/>' +
      '<text x="' + (x + it.c - 20) + '" y="' + (y + 60) + '" text-anchor="end" class="apemb-t-seq" style="font-size:50px">' + (i + 1) + '</text></g>';
  });
  svg += '</svg>';
  el.innerHTML = svg + '<ol class="apemb-cav-lista">' + itens.map(function (it) {
    return '<li><b>' + UI.esc(it.x.rotulo || it.x.codigo) + '</b> ' + UI.esc(it.x.ref || '') + ' <span class="erp-muted">' + Math.round(it.c) + ' × ' + Math.round(it.l) + ' × ' + it.e + '</span>' +
      (S.st.apontadas[(it.x.codigo || '')] || it.id.indexOf('V|') === 0 ? '' : ' <span class="erp-pill erp-pill-warn">não apontada</span>') + '</li>';
  }).join('') + '</ol><div class="erp-muted erp-xs">Ordem: a maior encostada no cavalete, as menores na frente. Em pé, lado comprido no chão.</div>';
};

/* ---------------------------------------------------------- folha do pallet
   (25/09) Uma folha Letter por pallet, pra colar por fora: CLIENTE,
   PROJETO, o que tem dentro e o peso. Sem marca (white label). */
APEMB.conteudoPallet = function (tipo, n) {
  const S = APEMB.S, est = tipo === 'montados' ? S.st.montados : S.st.pallets;
  const pal = est.pallets.find(function (p) { return p.n === n; });
  if (!pal) return null;
  const dens = APEMB.params().dens, o = S.plano.opt;
  const linhas = [], clientes = {}, pedidos = {};
  let kg = 0;
  const addCP = function (p) { if (p.cliente) clientes[p.cliente] = 1; if (p.pedido) pedidos[p.pedido] = 1; };
  pal.itens.slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); }).forEach(function (it) {
    if (it.tipo === 'modulo') {
      const m = S.mods[it.id.slice(2)]; if (!m) return;
      const peso = APEMB.pesoModulo(m); kg += peso;
      m.pecasNicho.concat(m.pecasSoltas).forEach(addCP);
      linhas.push({ tipo: 'Módulo montado', nome: m.numero + ' · ' + m.nome, pedido: m.pedido, det: m.dims ? m.dims.W + ' × ' + m.dims.H + ' × ' + m.dims.D + ' mm · ' + m.portas + ' porta(s)' : '',
        pecas: m.pecasNicho.length + m.pecasSoltas.length, kg: peso });
    } else if (it.tipo === 'volume') {
      const v = S.volPorId[it.id]; if (!v) return;
      const m = S.mods[v.modKey]; kg += v.peso;
      v.pecas.forEach(addCP);
      linhas.push({ tipo: 'Volume', nome: v.rotulo + ' — mód. ' + m.numero + ' · ' + m.nome + ' (' + v.idx + '/' + v.total + ')', pedido: m.pedido,
        det: Math.round(v.C) + ' × ' + Math.round(v.L) + ' × ' + Math.round(v.H) + ' mm · ' + v.pecas.map(function (p) { return p.codigo.replace(/^PC-0*/, ''); }).join(', '),
        pecas: v.pecas.length, kg: v.peso });
    } else {
      const p = S.porCodigo[it.id.slice(2)]; if (!p) return;
      const peso = APEMB_PLANO.pesoKg(p.c, p.l, p.e, dens); kg += peso; addCP(p);
      linhas.push({ tipo: 'Peça solta', nome: p.codigo + ' · ' + p.ref + (p.moduloNome ? ' (mód. ' + p.moduloNumero + ')' : ''), pedido: p.pedido,
        det: Math.round(p.c) + ' × ' + Math.round(p.l) + ' × ' + p.e + ' mm' + (p.cor ? ' · ' + p.cor : ''), pecas: 1, kg: peso });
    }
  });
  const deckW = est.planW + 2 * o.margem, deckD = est.planD + 2 * o.margem;
  const nTabuas = Math.max(2, Math.round(deckW / (120 * 1.55)));
  const pesoPallet = (3 * (deckD / 1000) * 0.1 * (o.peH / 1000) + nTabuas * (deckD / 1000) * 0.12 * (o.deckE / 1000)) * 500;
  return { pal: pal, tipo: tipo, linhas: linhas, kg: kg, pesoPallet: pesoPallet, clientes: Object.keys(clientes), pedidos: Object.keys(pedidos),
    dims: Math.round(deckW) + ' × ' + Math.round(deckD) + ' × ' + Math.round(pal.alturaCarga + o.peH + o.deckE) + ' mm',
    nPecas: linhas.reduce(function (a, l) { return a + l.pecas; }, 0) };
};

APEMB.htmlFolha = function (c, idx, total) {
  const S = APEMB.S;
  const kg = function (v) { return v.toFixed(1).replace('.', ',') + ' kg'; };
  const lb = function (v) { return (v * 2.20462).toFixed(0) + ' lb'; };
  const lote = (S.batchCode || '') ;
  const titulo = (c.tipo === 'montados' ? 'PALLET MONTADOS ' : 'PALLET ') + c.pal.n;
  const porTipo = {};
  c.linhas.forEach(function (l) { porTipo[l.tipo] = (porTipo[l.tipo] || 0) + 1; });
  return '<section class="folha">' +
    '<div class="topo"><div class="t1">' + UI.esc(titulo) + '</div><div class="t2">' + (idx + 1) + ' de ' + total + ' · lote ' + UI.esc(lote) + '</div></div>' +
    '<div class="campo"><span>CLIENTE</span><b>' + UI.esc(c.clientes.join(' / ') || '—') + '</b></div>' +
    '<div class="campo"><span>PROJETO</span><b>' + UI.esc(c.pedidos.join(' / ') || '—') + '</b></div>' +
    '<div class="kpis"><div><span>PESO</span><b>' + kg(c.kg + c.pesoPallet) + '</b><i>' + lb(c.kg + c.pesoPallet) + ' · conteúdo ' + kg(c.kg) + ' + pallet ' + kg(c.pesoPallet) + '</i></div>' +
      '<div><span>MEDIDAS</span><b>' + c.dims + '</b><i>C × L × A</i></div>' +
      '<div><span>CONTEÚDO</span><b>' + c.linhas.length + ' item(ns)</b><i>' + c.nPecas + ' peças · ' + Object.keys(porTipo).map(function (k) { return porTipo[k] + ' ' + k.toLowerCase() + (porTipo[k] > 1 ? 's' : ''); }).join(' · ') + '</i></div></div>' +
    '<table><thead><tr><th>#</th><th>Item</th><th>Projeto</th><th>Detalhe</th><th class="n">Peças</th><th class="n">kg</th></tr></thead><tbody>' +
    c.linhas.map(function (l, i) {
      return '<tr><td>' + (i + 1) + '</td><td><b>' + UI.esc(l.nome) + '</b><div class="tipo">' + l.tipo + '</div></td><td>' + UI.esc(l.pedido || '') + '</td><td class="det">' + UI.esc(l.det) + '</td><td class="n">' + l.pecas + '</td><td class="n">' + l.kg.toFixed(1).replace('.', ',') + '</td></tr>';
    }).join('') + '</tbody></table>' +
    '<div class="rodape">Conferido por: ____________________ &nbsp;&nbsp; Data: ____/____/______ &nbsp;&nbsp; Frágil — não empilhar outro pallet em cima</div>' +
  '</section>';
};

APEMB.imprimirFolhas = function (tipo, n) {
  const S = APEMB.S;
  const lista = [];
  const add = function (t) { S.st[t === 'montados' ? 'montados' : 'pallets'].pallets.forEach(function (p) { if (n == null || (t === tipo && p.n === n)) lista.push(APEMB.conteudoPallet(t, p.n)); }); };
  if (n == null) { add('pecas'); add('montados'); } else add(tipo);
  const cs = lista.filter(Boolean);
  if (!cs.length) { APEMB.msg('erro', 'Nenhum pallet montado ainda.'); return; }
  const html = '<!doctype html><html><head><meta charset="utf-8"><title>Folhas de pallet</title><style>' +
    '@page { size: letter; margin: 12mm; } body { font-family: system-ui, Arial, sans-serif; color: #111; margin: 0; }' +
    '.folha { page-break-after: always; min-height: 250mm; }' +
    '.topo { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 4px solid #111; padding-bottom: 4px; }' +
    '.t1 { font-size: 34pt; font-weight: 900; letter-spacing: 1px; } .t2 { font-size: 11pt; color: #444; }' +
    '.campo { display: flex; align-items: baseline; gap: 10px; margin: 8px 0; border-bottom: 1px solid #bbb; padding-bottom: 4px; }' +
    '.campo span { font-size: 9pt; color: #555; width: 70px; letter-spacing: 1px; } .campo b { font-size: 22pt; }' +
    '.kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 10px 0; }' +
    '.kpis > div { border: 2px solid #111; border-radius: 6px; padding: 6px 8px; } .kpis span { font-size: 8pt; letter-spacing: 1px; color: #555; display: block; }' +
    '.kpis b { font-size: 18pt; display: block; } .kpis i { font-style: normal; font-size: 8pt; color: #555; }' +
    'table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 6px; } th { text-align: left; border-bottom: 2px solid #111; padding: 3px 4px; font-size: 8pt; }' +
    'td { border-bottom: 1px solid #ccc; padding: 3px 4px; vertical-align: top; } td.det { color: #444; font-size: 8.5pt; } .n { text-align: right; } .tipo { font-size: 7.5pt; color: #777; }' +
    '.rodape { margin-top: 14px; font-size: 9pt; color: #333; border-top: 1px solid #bbb; padding-top: 6px; }' +
    '@media screen { body { background: #888; } .folha { background: #fff; width: 216mm; margin: 10mm auto; padding: 12mm; box-sizing: border-box; } }' +
    '</style></head><body>' + cs.map(function (c, i) { return APEMB.htmlFolha(c, i, cs.length); }).join('') +
    '<script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>';
  const w = window.open('', '_blank');
  if (!w) { APEMB.msg('erro', 'O navegador bloqueou a janela de impressão — libere pop-ups pra esta página.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
};

/* ---------------------------------------------------------- lista */

APEMB.desenharLista = function () {
  const S = APEMB.S;
  if (!S || !S.plano) return;
  const f = (APEMB.$('apemb-filtro').value || '').trim().toLowerCase();
  const casa = function (p) {
    return !f || (p.codigo + ' ' + p.ref + ' ' + p.moduloNumero + ' ' + p.moduloNome + ' ' + p.pedido).toLowerCase().indexOf(f) >= 0;
  };
  const chip = function (p) {
    const ok = !!S.st.apontadas[p.codigo];
    const fora = !!S.st.fora[p.id], pulm = S.st.pulmao.indexOf(p.id) >= 0;
    return '<span class="apemb-pc' + (ok ? ' ok' : '') + (fora ? ' fora' : '') + (pulm ? ' pulmao' : '') + '" onclick="APEMB.cliquePeca(\'' + UI.esc(p.codigo) + '\')" title="' +
      UI.esc(p.ref + ' ' + Math.round(p.c) + '×' + Math.round(p.l) + '×' + p.e + (p.cor ? ' · ' + p.cor : '')) + '">' +
      '<b>' + UI.esc(p.codigo.replace(/^PC-0*/, '')) + '</b> ' + UI.esc(p.ref) + ' <i>' + Math.round(p.c) + '×' + Math.round(p.l) + '</i></span>';
  };
  const mods = Object.keys(S.mods).map(function (k) { return S.mods[k]; })
    .filter(function (m) { return m.pecasNicho.length; })
    .sort(function (a, b) { return (a.pedido + a.numero).localeCompare(b.pedido + b.numero); });
  let h = '<div class="apemb-lista-sec"><div class="erp-strong erp-small">Com furação → nicho (por módulo)</div>';
  mods.forEach(function (m) {
    const ps = m.pecasNicho.filter(casa);
    if (!ps.length) return;
    const n = S.st.nichoDe[m.key];
    const est = APEMB.modMontado(m) ? '<span class="erp-pill erp-pill-ok">montado</span>' : APEMB.modEmbalado(m) ? '<span class="erp-pill erp-pill-ok">embalado</span>'
      : APEMB.modCompleto(m) ? '<span class="erp-pill erp-pill-ok">completo — arquear</span>' : '';
    h += '<div class="apemb-mod-linha"><a href="javascript:void(0)" onclick="APEMB.abrirEmbalar(\'' + UI.esc(m.key).replace(/'/g, '\\\'') + '\')" class="erp-strong">' +
      UI.esc(m.numero) + ' · ' + UI.esc(m.nome) + '</a> <span class="erp-muted erp-xs">' + UI.esc(m.pedido) +
      (n ? ' · ' + (n === 'CHAO' ? 'chão' : 'nicho ' + n) : '') + ' · ' + m.volumes.length + ' vol.</span> ' + est +
      '<div>' + ps.map(chip).join('') + '</div></div>';
  });
  h += '</div>';
  const soltas = S.pecas.filter(function (p) { return p.destino === 'solta' && casa(p); });
  h += '<div class="apemb-lista-sec"><div class="erp-strong erp-small">Painéis, fillers e sem furação → pallet</div><div>' + soltas.map(chip).join('') + '</div></div>';
  APEMB.$('apemb-lista').innerHTML = h;
};

APEMB.cliquePeca = function (codigo) {
  const S = APEMB.S, p = S.porCodigo[codigo];
  if (!p) return;
  if (S.st.apontadas[codigo]) APEMB.mostrarPeca(p, 'Já apontada — ');
  else APEMB.apontar(codigo);
  const m = APEMB.$('apemb-msg');
  if (m && m.scrollIntoView) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
