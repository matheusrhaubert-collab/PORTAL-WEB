/* Legno ERP — Produção → Embalagem (#/embalagem)
 *
 * Pedido do Matt (2026-09-22): "gostaria de colocar essa tela no erp. e
 * gostaria de poder usar ele só pra saber como agrupar da melhor forma
 * possível as peças de um módulo de algum pedido por exemplo. na aba
 * embalagem. escolho lote, pedido e módulo. aí ele gera a simulação como
 * está aqui com as peças por camadas."
 *
 * "Essa tela" é scratch/teste-pallet-3d.html. O motor (PALLET,
 * erp/js/pallet-engine.js) e o visor (PALLET3D, erp/js/pallet-view3d.js)
 * são os MESMOS arquivos que a página de teste carrega — aqui só muda a
 * origem das peças: em vez de colar texto, vêm de erp.batch_pieces do lote
 * escolhido (LOTES.batch), filtradas por pedido e módulo. batch_pieces já
 * traz pedido (order_id/po_name), módulo (module_name + module_number, o
 * mesmo "001" da etiqueta) e as medidas de corte (comprimento × largura ×
 * espessura) — é exatamente o que o empacotador precisa, e são as peças
 * FÍSICAS (pareamento já aplicado), não as vendidas.
 *
 * Regras que valem aqui são as do motor (ver cabeçalho de pallet-engine.js):
 * menor cubagem, 6 pontos/4 apoiados, tolerância zero, largura máx. 1100.
 *
 * O ERP roda em file:// e não vai pro git (decisão do Matt) — sem deploy.
 */

const EMBALAGEM = {};

EMBALAGEM._batch = null;     // lote carregado (LOTES.batch), com _pieces/_orders
EMBALAGEM._visor = null;     // PALLET3D.create(...)
EMBALAGEM._ultimo = null;    // { res, opt, lista, escolhida, tentativas }
EMBALAGEM._hashHook = false;

/* ---------------------------------------------------------------- rota */

EMBALAGEM.load = async function () {
  const batches = await LOTES.batches();
  return { batches: batches };
};

EMBALAGEM.render = function (params, d) {
  const opcoesLote = d.batches.map(function (b) {
    const st = (LOTES_UI.BATCH_STATUS[b.status] || {}).label || b.status || '';
    return '<option value="' + UI.esc(b.id) + '">' + UI.esc(b.code) +
      (b.name ? ' · ' + UI.esc(b.name) : '') + (st ? ' (' + UI.esc(st) + ')' : '') + '</option>';
  }).join('');

  const defs = PALLET.DEFAULTS;
  const campo = function (id, label, value, step, extra) {
    return '<label class="erp-field emb-campo"><span>' + UI.esc(label) + '</span>' +
      '<input type="number" id="' + id + '" value="' + value + '" step="' + (step || 1) + '"' + (extra || '') + '></label>';
  };

  return UI.crumb([{ label: 'Produção' }, { label: 'Embalagem' }]) +
    UI.head('Embalagem — pallet por módulo',
      'Escolha o lote, o pedido e o módulo: o simulador monta o pallet mais compacto possível ' +
      '(maior peso no menor volume) com as peças cortadas daquele módulo, camada por camada, ' +
      'sem deixar peça sem apoio.', '') +

    UI.panel('Peças',
      '<div class="erp-inline-fields emb-selecao">' +
        '<label class="erp-field"><span>Lote</span><select id="emb-lote">' +
          '<option value="">— escolher —</option>' + opcoesLote + '</select></label>' +
        '<label class="erp-field"><span>Pedido</span><select id="emb-pedido" disabled><option value="">— escolha o lote —</option></select></label>' +
        '<label class="erp-field"><span>Módulo</span><select id="emb-modulo" disabled><option value="">— escolha o pedido —</option></select></label>' +
        '<div class="emb-acao"><button class="erp-btn" id="emb-simular" disabled>Simular pallet</button></div>' +
      '</div>' +
      /* ETIQUETAS DE MÓDULO (24/09, protótipo aprovado pelo Matt no mesmo
         dia): ½ Letter, 2 por folha, colorida — ícone do portal, cores com
         textura, medidas pol/mm, peso/volume, ferragem e lista de peças.
         Ver erp/js/etiqueta-modulo.js. Lote inteiro ou só o pedido escolhido. */
      '<div class="erp-inline-fields" style="margin-top:8px">' +
        '<button class="erp-btn erp-btn-secondary" id="emb-etq-lote" disabled title="Uma etiqueta ½ Letter por módulo, todos os pedidos do lote">🏷️ Etiquetas de módulo — lote inteiro</button> ' +
        '<button class="erp-btn erp-btn-secondary" id="emb-etq-pedido" disabled title="Só os módulos do pedido escolhido">🏷️ Etiquetas de módulo — este pedido</button>' +
      '</div>' +
      '<div class="erp-muted erp-small" id="emb-info" style="margin-top:8px">Nenhum lote escolhido.</div>') +

    UI.panel('Parâmetros',
      '<div class="erp-inline-fields">' +
        campo('emb-maxD', 'Largura máx. do pallet (mm, 0 = livre)', defs.maxD, 50) +
        campo('emb-maxW', 'Comprimento máx. (mm, 0 = livre)', defs.maxW, 50) +
        campo('emb-hmax', 'Altura máx. (mm, 0 = livre)', defs.hMax, 50) +
        campo('emb-dens', 'Densidade do material (kg/m³)', defs.dens, 10) +
        campo('emb-margem', 'Sobra do estrado por lado (mm)', defs.margem, 5) +
        campo('emb-orc', 'Tempo máx. da busca (s)', Math.round(defs.orcamentoMs / 1000), 1, ' min="1"') +
      '</div>' +
      '<div class="erp-muted erp-xs" style="margin-top:6px">Regra de apoio: 6 pontos por peça (4 cantos + 2 no meio das bordas compridas), ' +
      'mínimo 4 apoiados, tolerância zero. Pés: ' + defs.peN + ' longarinas ' + defs.peW + '×' + defs.peH + ' mm + estrado de ' +
      defs.deckE + ' mm. Pra mexer em tudo isso, use scratch/teste-pallet-3d.html — é o mesmo motor.</div>') +

    '<div class="pc3-layout emb-layout" id="emb-resultado" style="display:none">' +
      '<div class="pc3-viewer-col">' +
        '<div class="pc3-viewer-head">' +
          '<span class="erp-strong erp-small">Camadas <b id="emb-lbl-cam">–</b></span>' +
          '<input id="emb-rng-cam" type="range" min="1" max="1" value="1">' +
          '<span class="erp-strong erp-small">Explodir</span>' +
          '<input id="emb-rng-exp" type="range" min="0" max="400" value="0">' +
        '</div>' +
        '<div id="emb-canvas" class="pc3-canvas"></div>' +
        '<div class="emb-vista erp-muted erp-small">' +
          '<label><input type="checkbox" id="emb-chk-pallet" checked> pallet</label> ' +
          '<label><input type="checkbox" id="emb-chk-edges" checked> arestas</label> ' +
          '<label><input type="checkbox" id="emb-chk-spin"> girar</label> ' +
          '<button class="erp-btn-secondary erp-btn-sm" id="emb-reenquadrar">Reenquadrar</button>' +
          '<span class="emb-legenda"><i style="background:#d8615c"></i> peça sem apoio pleno</span>' +
        '</div>' +
        '<div id="emb-resumo"></div>' +
      '</div>' +
      '<div class="pc3-table-col">' +
        '<div id="emb-camadas"></div>' +
        '<div id="emb-plantas"></div>' +
      '</div>' +
    '</div>';
};

EMBALAGEM.after = function (params, d) {
  EMBALAGEM._descartarVisor();
  EMBALAGEM._batch = null;
  EMBALAGEM._ultimo = null;

  const $ = function (id) { return document.getElementById(id); };
  $('emb-lote').addEventListener('change', function () { EMBALAGEM.escolherLote(this.value); });
  $('emb-pedido').addEventListener('change', function () { EMBALAGEM.escolherPedido(this.value); });
  $('emb-modulo').addEventListener('change', function () { $('emb-simular').disabled = !this.value; });
  $('emb-simular').addEventListener('click', function () { EMBALAGEM.simular(this); });
  $('emb-etq-lote').addEventListener('click', function () { ETIQUETA_MODULO.gerar($('emb-lote').value, null, this); });
  $('emb-etq-pedido').addEventListener('click', function () { ETIQUETA_MODULO.gerar($('emb-lote').value, $('emb-pedido').value || null, this); });
  ['emb-rng-cam', 'emb-rng-exp'].forEach(function (id) { $(id).addEventListener('input', EMBALAGEM.redesenhar); });
  ['emb-chk-pallet', 'emb-chk-edges'].forEach(function (id) { $(id).addEventListener('change', EMBALAGEM.redesenhar); });
  $('emb-chk-spin').addEventListener('change', function () { if (EMBALAGEM._visor) EMBALAGEM._visor.spin = this.checked; });
  $('emb-reenquadrar').addEventListener('click', function () {
    const u = EMBALAGEM._ultimo;
    if (u && EMBALAGEM._visor) EMBALAGEM._visor.enquadrar(PALLET.medidasPallet(u.res.pallets[u.idx || 0], u.res, u.opt));
  });

  /* Sair da tela mata o visor (loop de animação + contexto WebGL). O
     roteador não tem hook de saída, então é por hashchange, uma vez só. */
  if (!EMBALAGEM._hashHook) {
    EMBALAGEM._hashHook = true;
    window.addEventListener('hashchange', function () {
      if (!/^#\/embalagem/.test(location.hash)) EMBALAGEM._descartarVisor();
    });
  }

  // ?lote=...&pedido=...&modulo=... (link direto de outra tela, se um dia houver)
  if (params && params.lote) {
    $('emb-lote').value = params.lote;
    EMBALAGEM.escolherLote(params.lote, params.pedido, params.modulo);
  }
};

EMBALAGEM._descartarVisor = function () {
  if (EMBALAGEM._visor) { try { EMBALAGEM._visor.dispose(); } catch (e) { /* já foi */ } }
  EMBALAGEM._visor = null;
};

/* ---------------------------------------------------------- seleção */

EMBALAGEM.escolherLote = async function (batchId, pedidoPre, moduloPre) {
  const $ = function (id) { return document.getElementById(id); };
  const selPed = $('emb-pedido'), selMod = $('emb-modulo'), info = $('emb-info');
  selPed.innerHTML = '<option value="">— escolha o lote —</option>'; selPed.disabled = true;
  selMod.innerHTML = '<option value="">— escolha o pedido —</option>'; selMod.disabled = true;
  $('emb-simular').disabled = true;
  $('emb-etq-lote').disabled = !batchId;
  $('emb-etq-pedido').disabled = true;
  EMBALAGEM._batch = null;
  if (!batchId) { info.textContent = 'Nenhum lote escolhido.'; return; }

  info.textContent = 'Buscando as peças do lote…';
  let batch;
  try { batch = await LOTES.batch(batchId); }
  catch (err) { info.innerHTML = '<span class="erp-error-detail">' + UI.esc(LOTES.explainError(err)) + '</span>'; return; }
  if (!batch) { info.textContent = 'Lote não encontrado.'; return; }
  if ($('emb-lote').value !== batchId) return; // o usuário já trocou
  EMBALAGEM._batch = batch;

  const pecas = batch._pieces || [];
  const porPedido = {};
  pecas.forEach(function (p) { porPedido[p.order_id] = (porPedido[p.order_id] || 0) + (Number(p.quantity) || 0); });
  const pedidos = (batch._orders || []).slice().sort(function (a, b) {
    return String(a.po_name || '').localeCompare(String(b.po_name || ''));
  });
  // pedidos que só existem em batch_pieces (pedido apagado do public depois) ainda aparecem, pelo id
  Object.keys(porPedido).forEach(function (oid) {
    if (!pedidos.some(function (o) { return o.id === oid; })) pedidos.push({ id: oid, po_name: null, client_name: null });
  });

  selPed.innerHTML = '<option value="">— escolher —</option>' + pedidos.map(function (o) {
    const rotulo = (o.po_name || ('#' + String(o.id).slice(0, 8))) +
      (o.client_name ? ' · ' + o.client_name : (typeof DATA !== 'undefined' && DATA.clientLabel ? ' · ' + DATA.clientLabel(o) : ''));
    return '<option value="' + UI.esc(o.id) + '">' + UI.esc(rotulo) + ' (' + (porPedido[o.id] || 0) + ' peças)</option>';
  }).join('');
  selPed.disabled = false;
  const total = pecas.reduce(function (s, p) { return s + (Number(p.quantity) || 0); }, 0);
  info.textContent = batch.code + (batch.name ? ' — ' + batch.name : '') + ': ' + pedidos.length + ' pedido(s), ' + total + ' peças.';

  if (pedidoPre) { selPed.value = pedidoPre; EMBALAGEM.escolherPedido(pedidoPre, moduloPre); }
  else if (pedidos.length === 1) { selPed.value = pedidos[0].id; EMBALAGEM.escolherPedido(pedidos[0].id); }
};

/* Módulos de um pedido dentro do lote: agrupa batch_pieces por
   module_number + module_name. module_number pode vir "001, 003" quando
   LOTES.explodeOrders fundiu peças idênticas de módulos idênticos (migration
   157) — nesse caso a linha vale pros DOIS módulos e a quantidade já está
   somada; tratamos o par como um grupo só (é um pallet dos dois). */
EMBALAGEM.modulosDoPedido = function (orderId) {
  const b = EMBALAGEM._batch;
  if (!b) return [];
  const grupos = {};
  (b._pieces || []).filter(function (p) { return p.order_id === orderId; }).forEach(function (p) {
    const key = (p.module_number || '—') + '|' + (p.module_name || '—');
    if (!grupos[key]) grupos[key] = { key: key, numero: p.module_number || '—', nome: p.module_name || '—', linhas: [], qtd: 0 };
    grupos[key].linhas.push(p);
    grupos[key].qtd += Number(p.quantity) || 0;
  });
  return Object.keys(grupos).map(function (k) { return grupos[k]; })
    .sort(function (a, c) { return String(a.numero).localeCompare(String(c.numero)) || a.nome.localeCompare(c.nome); });
};

EMBALAGEM.escolherPedido = function (orderId, moduloPre) {
  const $ = function (id) { return document.getElementById(id); };
  const selMod = $('emb-modulo');
  selMod.innerHTML = '<option value="">— escolha o pedido —</option>'; selMod.disabled = true;
  $('emb-simular').disabled = true;
  $('emb-etq-pedido').disabled = !orderId;
  if (!orderId) return;
  const mods = EMBALAGEM.modulosDoPedido(orderId);
  const totalPed = mods.reduce(function (s, m) { return s + m.qtd; }, 0);
  selMod.innerHTML = '<option value="">— escolher —</option>' +
    '<option value="*">Pedido inteiro — todos os ' + mods.length + ' módulos (' + totalPed + ' peças)</option>' +
    mods.map(function (m) {
      return '<option value="' + UI.esc(m.key) + '">' + UI.esc(m.numero) + ' · ' + UI.esc(m.nome) + ' (' + m.qtd + ' peças)</option>';
    }).join('');
  selMod.disabled = false;
  if (moduloPre && mods.some(function (m) { return m.key === moduloPre; })) { selMod.value = moduloPre; $('emb-simular').disabled = false; }
  else if (mods.length === 1) { selMod.value = mods[0].key; $('emb-simular').disabled = false; }
};

/* batch_pieces → peças do empacotador (quantidade explodida). */
EMBALAGEM.pecasSelecionadas = function () {
  const $ = function (id) { return document.getElementById(id); };
  const orderId = $('emb-pedido').value, modKey = $('emb-modulo').value;
  if (!orderId || !modKey) return [];
  const mods = EMBALAGEM.modulosDoPedido(orderId).filter(function (m) { return modKey === '*' || m.key === modKey; });
  const out = [];
  mods.forEach(function (m) {
    m.linhas.forEach(function (row) {
      const c = Number(row.comprimento_mm) || 0, l = Number(row.largura_mm) || 0, e = Number(row.espessura_mm) || 0;
      if (!(c > 0 && l > 0 && e > 0)) return;
      const qtd = Math.max(1, Math.round(Number(row.quantity) || 1));
      for (let i = 0; i < qtd; i++) {
        const v = [c, l, e].sort(function (a, b) { return b - a; });
        out.push({ id: out.length, nome: row.reference || '—', cor: row.color_name || '', c: v[0], l: v[1], e: v[2],
                   modulo: m.numero, moduloNome: m.nome, codigo: row.piece_code || null });
      }
    });
  });
  return out;
};

/* ---------------------------------------------------------- simular */

EMBALAGEM.opcoes = function () {
  const n = function (id, def) { const v = Number(document.getElementById(id).value); return isFinite(v) ? v : def; };
  const o = Object.assign({}, PALLET.DEFAULTS);
  o.maxD = Math.max(0, n('emb-maxD', o.maxD));
  o.maxW = Math.max(0, n('emb-maxW', o.maxW));
  o.hMax = Math.max(0, n('emb-hmax', o.hMax));
  o.dens = Math.max(1, n('emb-dens', o.dens));
  o.margem = Math.max(0, n('emb-margem', o.margem));
  o.orcamentoMs = Math.max(1, n('emb-orc', 8)) * 1000;
  return o;
};

EMBALAGEM.simular = function (btn) {
  const lista = EMBALAGEM.pecasSelecionadas();
  const info = document.getElementById('emb-info');
  if (!lista.length) { info.textContent = 'Nenhuma peça com medidas válidas nessa escolha.'; return; }
  const opt = EMBALAGEM.opcoes();
  LOTES_UI.busy(btn, true, 'Procurando a planta mais compacta…');
  // solta o thread pra o botão mudar antes da conta (a busca é síncrona)
  setTimeout(function () {
    try {
      const t0 = performance.now();
      const r = PALLET.empacotarAuto(lista, opt);
      const ms = Math.round(performance.now() - t0);
      EMBALAGEM._ultimo = { res: r.res, opt: opt, lista: lista, escolhida: r.escolhida, tentativas: r.tentativas, ms: ms, idx: 0 };
      document.getElementById('emb-resultado').style.display = '';
      if (!EMBALAGEM._visor) {
        if (typeof THREE === 'undefined' || typeof PALLET3D === 'undefined') throw new Error('three.js/PALLET3D não carregaram — recarregue a página.');
        EMBALAGEM._visor = PALLET3D.create(document.getElementById('emb-canvas'), { fundo: 0xf4f2ee, grid: [0xd6d1c7, 0xe6e2da] });
        EMBALAGEM._visor.spin = document.getElementById('emb-chk-spin').checked;
      }
      const rng = document.getElementById('emb-rng-cam');
      rng.max = String(r.res.pallets[0].camadas.length); rng.value = rng.max;
      EMBALAGEM.redesenhar(true);
      info.textContent = lista.length + ' peças · ' + r.res.pallets.length + ' pallet(s) · ' + r.tentativas.length + ' plantas testadas em ' + ms + ' ms.';
    } catch (err) {
      console.error('[embalagem]', err);
      info.innerHTML = '<span class="erp-error-detail">Erro ao simular: ' + UI.esc((err && err.message) || String(err)) + '</span>';
    } finally {
      LOTES_UI.busy(btn, false);
    }
  }, 20);
};

EMBALAGEM.redesenhar = function (enquadrar) {
  const u = EMBALAGEM._ultimo;
  if (!u || !EMBALAGEM._visor) return;
  const $ = function (id) { return document.getElementById(id); };
  const pal = u.res.pallets[u.idx || 0];
  const rng = $('emb-rng-cam');
  rng.max = String(pal.camadas.length);
  if (Number(rng.value) > pal.camadas.length) rng.value = String(pal.camadas.length);
  const camVis = Number(rng.value);
  $('emb-lbl-cam').textContent = camVis + ' / ' + pal.camadas.length;
  const m = EMBALAGEM._visor.desenhar(u.res, u.opt, u.idx || 0, {
    camVis: camVis,
    explode: Number($('emb-rng-exp').value),
    arestas: $('emb-chk-edges').checked,
    mostrarPallet: $('emb-chk-pallet').checked
  });
  if (enquadrar === true) EMBALAGEM._visor.enquadrar(m);
  EMBALAGEM.relatorio(m, camVis);
};

/* ---------------------------------------------------------- relatório */

EMBALAGEM.relatorio = function (m, camVis) {
  const u = EMBALAGEM._ultimo;
  const res = u.res, opt = u.opt, pal = res.pallets[u.idx || 0];
  const kg = function (v) { return v.toFixed(1).replace('.', ',') + ' kg'; };
  const dens = Math.round(m.pesoTotal / Math.max(0.001, m.m3));

  const seletorPallet = res.pallets.length > 1
    ? '<div class="erp-muted erp-small" style="margin:6px 0">' + res.pallets.map(function (p, i) {
        return '<a href="javascript:void(0)" onclick="EMBALAGEM.trocarPallet(' + i + ')" class="' + (i === (u.idx || 0) ? 'erp-strong' : '') + '">Pallet ' + (i + 1) + '</a>';
      }).join(' · ') + '</div>'
    : '';

  document.getElementById('emb-resumo').innerHTML =
    seletorPallet +
    '<div class="erp-grid erp-grid-4" style="margin-top:10px">' +
      UI.kpi('Pallet (C × L × A)', Math.round(m.deckW) + ' × ' + Math.round(m.deckD) + ' × ' + Math.round(m.alturaTotal),
        'mm · ' + PALLET.mmToFtIn(m.deckW) + ' × ' + PALLET.mmToFtIn(m.deckD) + ' × ' + PALLET.mmToFtIn(m.alturaTotal)) +
      UI.kpi('Peso total', kg(m.pesoTotal), 'peças ' + kg(m.pesoCarga) + ' + pallet ' + kg(m.pesoPallet)) +
      UI.kpi('Cubagem', m.m3.toFixed(2) + ' m³', (m.m3 * 35.3147).toFixed(1) + ' ft³') +
      UI.kpi('Densidade', dens + ' kg/m³', Math.round(m.ocupVolume * 100) + '% do monte é madeira') +
    '</div>' +
    '<div class="erp-muted erp-small" style="margin-top:8px">' + m.nPecas + ' peças em ' + pal.camadas.length + ' camadas · ' +
      'planta escolhida ' + res.planW + ' × ' + res.planD + ' mm' +
      (u.escolhida ? ' · encaixe ' + (u.escolhida.motor === 'nesting' ? 'nesting (Plano de Corte)' : 'canto') + ' / ' + u.escolhida.ordem : '') +
      ' · pés ' + opt.peN + '×' + opt.peW + '×' + opt.peH + ' mm + estrado ' + opt.deckE + ' mm.</div>' +
    (m.nParciais ? '<div class="erp-error" style="margin-top:8px"><div class="erp-error-title">' + m.nParciais + ' peça(s) sem apoio pleno (vermelhas)</div>' +
      '<div class="erp-error-detail">Não achei lugar com 4 dos 6 pontos apoiados pra elas — ficaram no melhor lugar possível. ' +
      'Na prática: calço embaixo, ou embalar à parte.</div></div>' : '') +
    (res.sobras.length ? '<div class="erp-error" style="margin-top:8px"><div class="erp-error-title">' + res.sobras.length + ' peça(s) não entraram</div>' +
      '<div class="erp-error-detail">Maiores que os limites do pallet.</div></div>' : '') +
    (opt.maxD > 0 && res.planD > opt.maxD + 0.5 ? '<div class="erp-error" style="margin-top:8px"><div class="erp-error-detail">A maior peça tem ' +
      Math.round(res.planD) + ' mm de largura — não cabe na largura máx. de ' + opt.maxD + ' mm; o pallet ficou com a largura dela.</div></div>' : '');

  EMBALAGEM.tabelaCamadas(pal, camVis);
  EMBALAGEM.tabelaPlantas();
};

/* A parte que o Matt pediu de fato: "as peças por camadas". Cada camada
   lista o que vai nela, agrupado por peça igual (nome + medidas + módulo),
   de baixo pra cima — é a ordem de montagem no chão da fábrica. */
EMBALAGEM.tabelaCamadas = function (pal, camVis) {
  const linhas = pal.camadas.map(function (c, i) {
    const grupos = {};
    c.itens.forEach(function (it) {
      const p = it.peca;
      // agrupa pela peça (c × l × e nominal), não pela orientação em que caiu
      const k = [p.nome, p.modulo, p.c, p.l, p.e, it.parcial ? 1 : 0].join('|');
      if (!grupos[k]) grupos[k] = { nome: p.nome, modulo: p.modulo, moduloNome: p.moduloNome, cor: p.cor, w: p.c, d: p.l, e: p.e, parcial: it.parcial, n: 0 };
      grupos[k].n++;
    });
    const itens = Object.keys(grupos).map(function (k) { return grupos[k]; })
      .sort(function (a, b) { return (b.w * b.d) - (a.w * a.d); })
      .map(function (g) {
        return '<div class="emb-item' + (g.parcial ? ' emb-item-parcial' : '') + '">' +
          '<span class="emb-item-n">' + g.n + '×</span> ' +
          '<span class="erp-strong">' + UI.esc(g.nome) + '</span> ' +
          '<span class="erp-muted">' + LOTES_UI.mm(g.w) + ' × ' + LOTES_UI.mm(g.d) + ' × ' + g.e + ' mm' +
          (g.modulo && g.modulo !== '—' ? ' · mód. ' + UI.esc(g.modulo) : '') +
          (g.cor ? ' · ' + UI.esc(g.cor) : '') + '</span>' +
          (g.parcial ? ' <span class="erp-pill erp-pill-warn">sem apoio pleno</span>' : '') +
        '</div>';
      }).join('');
    const cor = '#' + PALLET3D.PALETA[i % PALLET3D.PALETA.length].toString(16).padStart(6, '0');
    const ativa = (i + 1) === camVis;
    return '<div class="emb-camada' + (ativa ? ' emb-camada-ativa' : '') + '" onclick="EMBALAGEM.verCamada(' + (i + 1) + ')">' +
      '<div class="emb-camada-head"><span class="emb-swatch" style="background:' + cor + '"></span>' +
        '<span class="erp-strong">Camada ' + (i + 1) + '</span>' +
        '<span class="erp-muted erp-small">z ' + Math.round(c.z) + ' mm · esp. ' + c.esp + ' mm · ' + c.itens.length + ' peça(s) · ' +
        Math.round(c.ocupacao * 100) + '% da planta</span></div>' +
      itens + '</div>';
  });
  // de cima pra baixo na tela = como o pallet fica; a 1ª camada é a de baixo
  document.getElementById('emb-camadas').innerHTML =
    '<h2 class="emb-h2">Peças por camada <span class="erp-muted erp-small">(de cima pra baixo — camada 1 é a do estrado)</span></h2>' +
    linhas.slice().reverse().join('') +
    '<div class="erp-muted erp-xs" style="margin-top:6px">Clicar numa camada mostra o pallet montado até ela.</div>';
};

EMBALAGEM.verCamada = function (n) {
  const rng = document.getElementById('emb-rng-cam');
  rng.value = String(n);
  EMBALAGEM.redesenhar();
};

EMBALAGEM.trocarPallet = function (i) {
  const u = EMBALAGEM._ultimo;
  if (!u || !u.res.pallets[i]) return;
  u.idx = i;
  const rng = document.getElementById('emb-rng-cam');
  rng.max = String(u.res.pallets[i].camadas.length); rng.value = rng.max;
  EMBALAGEM.redesenhar(true);
};

EMBALAGEM.tabelaPlantas = function () {
  const u = EMBALAGEM._ultimo;
  const el = document.getElementById('emb-plantas');
  if (!u.tentativas || !u.tentativas.length) { el.innerHTML = ''; return; }
  const peso = PALLET.pesoCargaDe(u.res, u.opt);
  const vistas = {};
  u.tentativas.filter(function (t) { return !t.sobras; }).forEach(function (t) {
    const k = t.planW + 'x' + t.planD;
    if (!vistas[k] || vistas[k].m3 > t.m3) vistas[k] = t;
  });
  const linhas = Object.keys(vistas).map(function (k) { return vistas[k]; }).sort(function (a, b) { return a.m3 - b.m3; }).slice(0, 6);
  const atual = u.escolhida;
  el.innerHTML = '<h2 class="emb-h2" style="margin-top:16px">Plantas testadas <span class="erp-muted erp-small">(' + u.tentativas.length + ' em ' + u.ms + ' ms)</span></h2>' +
    '<table class="erp-table erp-table-compact"><thead><tr><th>Compr. × Larg.</th><th>Motor</th><th class="erp-num">Alt.</th><th class="erp-num">m³</th><th class="erp-num">kg/m³ (peças)</th></tr></thead><tbody>' +
    linhas.map(function (t) {
      const sel = atual && t.planW === atual.planW && t.planD === atual.planD;
      return '<tr class="' + (sel ? 'pc3-row-match' : '') + '" style="cursor:pointer" onclick="EMBALAGEM.aplicarPlanta(' + t.planW + ',' + t.planD + ',\'' + t.motor + '\',\'' + t.ordem + '\',' + (t.agrupar ? 'true' : 'false') + ')">' +
        '<td>' + t.planW + ' × ' + t.planD + (t.pallets > 1 ? ' <span class="erp-pill erp-pill-warn">×' + t.pallets + '</span>' : '') + '</td>' +
        '<td>' + (t.motor === 'nesting' ? 'nesting' : 'canto') + '</td>' +
        '<td class="erp-num">' + Math.round(t.alt) + '</td>' +
        '<td class="erp-num">' + t.m3.toFixed(2) + '</td>' +
        '<td class="erp-num">' + Math.round(peso / Math.max(0.001, t.m3)) + '</td></tr>';
    }).join('') + '</tbody></table>' +
    '<div class="erp-muted erp-xs" style="margin-top:4px">Clicar numa planta monta o pallet nela (pra comparar).</div>';
};

EMBALAGEM.aplicarPlanta = function (planW, planD, motor, ordem, agrupar) {
  const u = EMBALAGEM._ultimo;
  if (!u) return;
  const o = Object.assign({}, u.opt, { planW: planW, planD: planD, motor: motor, ordem: ordem, agrupar: agrupar });
  const res = PALLET.empacotar(u.lista, o);
  u.res = res; u.idx = 0;
  u.escolhida = { planW: res.planW, planD: res.planD, motor: motor, ordem: ordem, agrupar: agrupar, m3: PALLET.cubagemDe(res, o) };
  const rng = document.getElementById('emb-rng-cam');
  rng.max = String(res.pallets[0].camadas.length); rng.value = rng.max;
  EMBALAGEM.redesenhar(true);
};
