/* Legno ERP — Apontamento + Embalagem (TESTE) — a LÓGICA, sem DOM.
 *
 * Pedido do Matt (2026-09-24): apontar TODAS as peças do lote; peça com
 * furação vai pra um NICHO da estante (um nicho por módulo, escolhido pelo
 * tamanho das peças); painel, filler e peça sem furação vão direto pro
 * PALLET, na posição que o motor calculou. Módulo com todas as peças no
 * nicho vira VOLUME ARQUEADO (máx. 25 kg; passou, divide) e o volume também
 * vai pro pallet. Calço de apoio 100×100×19, no máximo 2 empilhados.
 *
 * Este arquivo só calcula; a tela é erp/js/screens-apont-embalagem.js.
 * Roda no navegador (depois de pallet-engine.js) e em node (testes).
 *
 *   APEMB_PLANO.DEFAULTS
 *   APEMB_PLANO.classificar(peca)              'nicho' | 'solta'
 *   APEMB_PLANO.agruparModulos(pecas)          { key: modulo }
 *   APEMB_PLANO.volumesDoModulo(pecas, opt)    [volume] (≤ pesoMaxVolume cada)
 *   APEMB_PLANO.nichosDaEstante(cfg)           [nicho]
 *   APEMB_PLANO.escolherNicho(mod, nichos, ocupados)
 *   APEMB_PLANO.planejarPallets(volumes, soltas, opt)  plano serializável
 */

const APEMB_PLANO = (function () {

const DEFAULTS = {
  dens: 650,                 // kg/m³ — MDF/plywood média; editável na tela
  pesoMaxVolume: 25,         // kg por volume arqueado
  calco: { h: 19, max: 2, lado: 100, tol: 2, ganhoMin: 10 },
  estante: { colunas: [900, 900, 900, 900], linhas: [500, 500, 500], prof: 800 },
  larguraPallet: 1200,
  palletMontado: 1200,       // pallet dos módulos montados: 1200 × 1200
  alturaMaxMontados: 2300,   // mm, pallet + módulos empilhados
  remanejoMax: 4,            // quantas peças já no pallet podem sair pra reencaixar a nova       // pallet fixo de 1200 de largura; peça mais larga fica em outro espaço
  sobraForaMax: 150,         // mm que uma peça pode passar da boca do nicho
  maxD: 1100,                // largura máx. do pallet (mesma regra da tela Embalagem)
  orcamentoMs: 6000
};

// Painel/filler vão pro pallet mesmo se tiverem furo (regra do Matt).
const RX_SOLTA = /\b(pain[eé]is|painel|paineis|panels?|fillers?)\b/i;

function pesoKg(c, l, e, dens) { return (c / 1000) * (l / 1000) * (e / 1000) * dens; }

function classificar(p) {
  if (!p.modKey) return 'solta';                                  // plano de corte avulso, sem módulo
  if (RX_SOLTA.test(p.ref || '') || RX_SOLTA.test(p.moduloNome || '')) return 'solta';
  return p.furada ? 'nicho' : 'solta';
}

function agruparModulos(pecas) {
  const mods = {};
  pecas.forEach(function (p) {
    if (!p.modKey) return;
    if (!mods[p.modKey]) mods[p.modKey] = { key: p.modKey, numero: p.moduloNumero || '—', nome: p.moduloNome || '—',
      pedido: p.pedido || '', pecasNicho: [], pecasSoltas: [] };
    (p.destino === 'nicho' ? mods[p.modKey].pecasNicho : mods[p.modKey].pecasSoltas).push(p);
  });
  return mods;
}

/* ------------------------------------------------------------------ volumes
   Divide as peças (com furação) de um módulo em volumes de até 25 kg.
   "Melhor forma de dividir":
     1. o MENOR número de volumes possível;
     2. entre as divisões com esse número, a de MENOR cubagem somada —
        peças de tamanho parecido juntas, porque o volume tem o tamanho da
        maior peça dele (uma lateral de 2 m num volume de prateleiras
        transforma o volume inteiro num volume de 2 m);
     3. empate: o peso mais equilibrado entre os volumes.
   Como as peças vão ordenadas da maior pra menor, isso é uma partição em
   faixas contíguas — programação dinâmica exata, O(n²). Se o empacotamento
   só por peso (first-fit decreasing) conseguir MENOS volumes que as faixas,
   ele ganha (critério 1 manda) e cada volume é reordenado por tamanho. */
function volumesDoModulo(pecas, opt) {
  opt = Object.assign({}, DEFAULTS, opt || {});
  const lim = opt.pesoMaxVolume;
  const ps = pecas.slice().sort(function (a, b) { return (b.c - a.c) || (b.l - a.l) || (b.e - a.e); });
  ps.forEach(function (p) { p.peso = pesoKg(p.c, p.l, p.e, opt.dens); });
  const n = ps.length;
  if (!n) return [];

  const grupoInfo = function (arr) {
    let C = 0, L = 0, H = 0, kg = 0;
    arr.forEach(function (p) { C = Math.max(C, p.c); L = Math.max(L, p.l); H += p.e; kg += p.peso; });
    return { C: C, L: L, H: H, kg: kg, m3: C * L * H / 1e9 };
  };

  // DP: best[j] = melhor divisão das j primeiras peças
  const best = new Array(n + 1).fill(null);
  best[0] = { k: 0, m3: 0, maxKg: 0, corte: -1 };
  for (let j = 1; j <= n; j++) {
    for (let i = j - 1; i >= 0; i--) {
      const g = grupoInfo(ps.slice(i, j));
      if (g.kg > lim + 1e-9 && j - i > 1) break;        // grupo só cresce pra trás: pesado demais, para
      if (!best[i]) continue;
      const cand = { k: best[i].k + 1, m3: best[i].m3 + g.m3, maxKg: Math.max(best[i].maxKg, g.kg), corte: i };
      const b = best[j];
      if (!b || cand.k < b.k || (cand.k === b.k && (cand.m3 < b.m3 - 1e-9 ||
          (Math.abs(cand.m3 - b.m3) < 1e-9 && cand.maxKg < b.maxKg)))) best[j] = cand;
    }
  }
  let grupos = [];
  for (let j = n; j > 0; j = best[j].corte) grupos.unshift(ps.slice(best[j].corte, j));

  // FFD por peso — só entra se usar MENOS volumes
  const porPeso = ps.slice().sort(function (a, b) { return b.peso - a.peso; });
  const bins = [];
  porPeso.forEach(function (p) {
    const b = bins.find(function (x) { return x.kg + p.peso <= lim + 1e-9; });
    if (b) { b.itens.push(p); b.kg += p.peso; } else bins.push({ itens: [p], kg: p.peso });
  });
  if (bins.length < grupos.length) {
    grupos = bins.map(function (b) {
      return b.itens.sort(function (a, c) { return (c.c - a.c) || (c.l - a.l); });
    });
  }

  return grupos.map(function (g, idx) {
    const info = grupoInfo(g);
    // de baixo pra cima: maior área embaixo
    const pilha = g.slice().sort(function (a, b) { return (b.c * b.l - a.c * a.l) || (b.c - a.c); });
    return {
      idx: idx + 1, total: grupos.length,
      pecas: pilha, C: info.C, L: info.L, H: Math.round(info.H * 10) / 10,
      peso: info.kg, acimaDoLimite: info.kg > lim + 1e-9,
      arqueacao: fitasDoVolume(info.C, info.L)
    };
  });
}

/* Onde passar as fitas: atravessadas no comprimento, a ~150 mm de cada
   ponta e distribuídas no meio (≤ 900 mm: 2; ≤ 1800: 3; acima: 4). Volume
   largo (≥ 600) ganha 1 fita no sentido do comprimento, cruzando as outras. */
function fitasDoVolume(C, L) {
  const nT = C <= 900 ? 2 : (C <= 1800 ? 3 : 4);
  const m = Math.min(150, C / 6);
  const trans = [];
  for (let i = 0; i < nT; i++) trans.push(Math.round(nT === 1 ? C / 2 : m + (C - 2 * m) * i / (nT - 1)));
  return { transversais: trans, longitudinal: L >= 600 };
}

/* ------------------------------------------------------------------ estante
   Vista de frente: linhas de CIMA pra BAIXO (A = de cima), colunas da
   esquerda pra direita. Nome do nicho = letra da linha + número da coluna. */
function nichosDaEstante(cfg) {
  cfg = Object.assign({}, DEFAULTS.estante, cfg || {});
  const out = [];
  cfg.linhas.forEach(function (H, i) {
    cfg.colunas.forEach(function (W, j) {
      out.push({ id: String.fromCharCode(65 + i) + (j + 1), linha: i, coluna: j, W: W, H: H, D: cfg.prof });
    });
  });
  return out;
}

// medidas que o módulo exige do nicho (peças DEITADAS, empilhadas)
function exigenciaDoModulo(mod) {
  let c = 0, l = 0, h = 0;
  mod.pecasNicho.forEach(function (p) { c = Math.max(c, p.c); l = Math.max(l, p.l); h += p.e; });
  return { c: c, l: l, h: h };
}

function folgaNoNicho(ex, n) {
  const A = Math.max(n.W, n.D), B = Math.min(n.W, n.D);
  const sobraFora = Math.max(0, ex.c - A) + Math.max(0, ex.l - B);
  const alturaExcede = Math.max(0, ex.h - n.H);
  return { cabe: sobraFora === 0 && alturaExcede === 0, sobraFora: sobraFora, alturaExcede: alturaExcede };
}

/* Nicho que cabe, o MENOR que serve (deixa os grandes pros módulos
   grandes). Nenhum livre cabe: o livre que menos sobra pra fora, com
   aviso. Nenhum livre: null (fica no chão, ao lado). */
function escolherNicho(mod, nichos, ocupados) {
  const ex = exigenciaDoModulo(mod);
  const grande = nichos.length && nichos.every(function (n) { return folgaNoNicho(ex, n).sobraFora > DEFAULTS.sobraForaMax; });
  if (grande) return { nicho: null, grande: true, aviso: 'Peças grandes demais pra estante (' + Math.round(ex.c) + ' × ' +
    Math.round(ex.l) + ' mm) — separar na ÁREA DO CHÃO, ao lado da estante.' };
  const livres = nichos.filter(function (n) { return !ocupados[n.id]; });
  if (!livres.length) return { nicho: null, aviso: 'Nenhum nicho livre — deixe as peças no chão, ao lado da estante.' };
  const av = livres.map(function (n) { return { n: n, f: folgaNoNicho(ex, n) }; });
  const cabem = av.filter(function (a) { return a.f.cabe; })
    .sort(function (a, b) { return (a.n.W * a.n.D * a.n.H) - (b.n.W * b.n.D * b.n.H) || a.n.linha - b.n.linha || a.n.coluna - b.n.coluna; });
  if (cabem.length) return { nicho: cabem[0].n, aviso: null };
  av.sort(function (a, b) { return (a.f.sobraFora - b.f.sobraFora) || (a.f.alturaExcede - b.f.alturaExcede); });
  const f = av[0].f;
  // peça que sobra muito pra fora (torre de 2 m numa estante de 900) não vai
  // pra estante: fica na área do chão, e o nicho fica pra quem cabe.
  if (f.sobraFora > DEFAULTS.sobraForaMax) {
    return { nicho: null, grande: true, aviso: 'Peças grandes demais pra estante (' + Math.round(ex.c) + ' × ' + Math.round(ex.l) +
      ' mm) — separar na ÁREA DO CHÃO, ao lado da estante.' };
  }
  return { nicho: av[0].n, aviso: 'Nenhum nicho livre comporta o módulo inteiro' +
    (f.sobraFora ? ' — peça sobra ' + Math.round(f.sobraFora) + ' mm pra fora' : '') +
    (f.alturaExcede ? ' — pilha passa ' + Math.round(f.alturaExcede) + ' mm da altura' : '') + '.' };
}

/* ------------------------------------------------------------------ pallets
   Volumes (como blocos C × L × H) + peças soltas vão juntos pro motor do
   pallet (PALLET.empacotarAuto), com o CALÇO ligado. Devolve um plano
   serializável (vai pro localStorage pra posição não mudar entre recargas —
   a busca do motor tem teto de tempo, então rodar de novo pode dar outro
   arranjo). */
function planejarPallets(volumes, soltas, opt) {
  opt = Object.assign({}, DEFAULTS, opt || {});
  if (typeof PALLET === 'undefined') throw new Error('pallet-engine.js não carregou');
  const itens = [];
  volumes.forEach(function (v) {
    itens.push({ id: v.id, tipo: 'volume', nome: v.rotulo || v.id, cor: '', c: Math.max(v.C, v.L), l: Math.min(v.C, v.L), e: v.H });
  });
  soltas.forEach(function (p) {
    itens.push({ id: p.id, tipo: 'peca', nome: p.ref || p.codigo, cor: p.cor || '', c: p.c, l: p.l, e: p.e });
  });
  const vazio = { pallets: [], planW: 0, planD: 0, sobras: [], opt: resumoOpt(opt) };
  if (!itens.length) return vazio;

  const o = Object.assign({}, PALLET.DEFAULTS, {
    dens: opt.dens, maxD: opt.maxD, orcamentoMs: opt.orcamentoMs,
    calco: opt.calco
  });
  const r = PALLET.empacotarAuto(itens, o);
  const res = r.res;

  const plano = {
    planW: res.planW, planD: res.planD, opt: resumoOpt(o),
    sobras: res.sobras.map(function (p) { return p.id; }),
    pallets: res.pallets.map(function (pal, pi) {
      const its = pal.pecas.map(function (it) {
        return { id: it.peca.id, tipo: it.peca.tipo, x: it.x, y: it.y, w: it.w, d: it.d, z: it.z, e: it.peca.e,
                 parcial: !!it.parcial, calcos: (it.calcos || []).map(function (c) { return { x: c.x, y: c.y, z: c.z, n: c.n }; }) };
      });
      // sequência de montagem: de baixo pra cima, do fundo pra frente, da esquerda pra direita
      its.sort(function (a, b) { return (a.z - b.z) || (a.y - b.y) || (a.x - b.x); });
      its.forEach(function (it, k) { it.seq = k + 1; });
      const niveis = [];
      its.forEach(function (it) { const z = Math.round(it.z * 2) / 2; if (niveis.indexOf(z) < 0) niveis.push(z); });
      niveis.sort(function (a, b) { return a - b; });
      its.forEach(function (it) { it.nivel = niveis.indexOf(Math.round(it.z * 2) / 2) + 1; });
      // dependências: quem está EMBAIXO (encostando ou abaixo) e sobreposto
      its.forEach(function (b) {
        b.deps = its.filter(function (a) {
          return a !== b && a.z + a.e <= b.z + 0.6 && sobrepoe(a, b);
        }).map(function (a) { return a.id; });
      });
      return { n: pi + 1, itens: its, niveis: niveis, alturaCarga: pal.alturaCarga };
    })
  };
  return plano;
}

/* ------------------------------------------------------ pallet DINÂMICO
   (25/09) O pallet das peças soltas começa VAZIO e cresce conforme as peças
   são apontadas: cada peça lida é encaixada em cima do que já está lá
   (mapa de alturas do motor, com calço), na posição mais baixa e mais
   apoiada. O que já foi colocado nunca muda de lugar. A planta é fixa
   desde o começo (senão a peça de baixo poderia ficar fora da planta):
   comprimento = a peça/volume mais comprido do lote; largura = a mais larga,
   limitada a opt.larguraPallet (1200). Peça mais larga que isso não vai pro
   pallet — fica em "outro espaço" (área separada), como o Matt pediu.

   estado = { planW, planD, pallets: [{ n, itens: [...] }] } — serializável
   (vai pro localStorage com os apontamentos). */
function plantaDinamica(volumes, soltas, opt) {
  opt = Object.assign({}, DEFAULTS, opt || {});
  const lim = opt.larguraPallet || 1200;
  let planW = 0, planD = 0;
  const cabe = function (c, l) { return Math.min(c, l) <= lim; };
  volumes.forEach(function (v) { if (cabe(v.C, v.L)) { planW = Math.max(planW, Math.max(v.C, v.L)); planD = Math.max(planD, Math.min(v.C, v.L)); } });
  soltas.forEach(function (p) { if (cabe(p.c, p.l)) { planW = Math.max(planW, p.c); planD = Math.max(planD, p.l); } });
  // largura: a planta útil vai até o limite quando ajuda a deitar 2 peças lado a lado
  if (planD > 0) planD = Math.min(lim, Math.max(planD, Math.min(lim, Math.ceil(planD / 50) * 50)));
  return { planW: Math.ceil(planW), planD: Math.ceil(planD), larguraPallet: lim, pallets: [] };
}

/* Pallet dos MÓDULOS MONTADOS (25/09): 1200 × 1200 fixo, mesma regra de
   apoio, módulo em pé (W × D na planta, H de altura). Um módulo pode
   subir em cima de outro se apoiar nos 6 pontos. */
function plantaMontados(opt) {
  const lado = (opt && opt.palletMontado) || DEFAULTS.palletMontado;
  return { planW: lado, planD: lado, larguraPallet: lado, pallets: [], montados: true };
}

/* Medidas do módulo montado. Preferência: as do pedido (order_items
   W/H/D). Sem elas, estima pelas peças: H = peça mais comprida (lateral),
   D = a largura dessa peça, W = maior comprimento entre as peças que não
   são a lateral (base/prateleira) + 2 espessuras. Marca `estimado`. */
function dimsDoModulo(mod, E) {
  E = E || 19.5;
  if (mod.W && mod.H && mod.D) return { W: mod.W, H: mod.H, D: mod.D, estimado: false };
  // só peça estrutural (fundo fino de 6 mm e peça solta ficam de fora)
  const ps = mod.pecasNicho.filter(function (p) { return p.e >= 10; });
  if (!ps.length) return null;
  // lateral: pelo nome quando dá (base de 900 é mais comprida que a lateral de 720)
  const lats = ps.filter(function (p) { return /\b(lateral|laterais|side|sides)\b/i.test(p.ref || '') && !/gaveta|drawer/i.test(p.ref || ''); });
  let lat = (lats.length ? lats : ps)[0];
  (lats.length ? lats : ps).forEach(function (p) { if (p.c > lat.c) lat = p; });
  const H = lat.c, D = lat.l;
  // largura: peça que tem UM lado igual à profundidade (base/prateleira/travessa
  // no fundo) — o outro lado é o vão interno; + 2 espessuras
  let W = 0;
  ps.forEach(function (p) {
    if (Math.abs(p.c - H) <= 2 && Math.abs(p.l - D) <= 2) return;        // é lateral
    if (Math.abs(p.l - D) <= 2) W = Math.max(W, p.c);
    else if (Math.abs(p.c - D) <= 2) W = Math.max(W, p.l);
  });
  if (!W) ps.forEach(function (p) { if (p.c < H - 1 && p.c > W) W = p.c; });
  if (!W) W = lat.l;
  return { W: Math.round(W + 2 * E), H: Math.round(H), D: Math.round(D), estimado: true };
}

function itemDoMotor(item) {
  // módulo MONTADO: em pé, W × D de planta, H de altura — nunca deita
  if (item.tipo === 'modulo') return { id: item.id, tipo: 'modulo', nome: item.rotulo || item.id, cor: '', c: item.W, l: item.D, e: item.H };
  return (item.tipo === 'volume' || item.C != null)
    ? { id: item.id, tipo: 'volume', nome: item.rotulo || item.id, cor: '', c: Math.max(item.C, item.L), l: Math.min(item.C, item.L), e: item.H }
    : { id: item.id, tipo: 'peca', nome: item.ref || item.codigo, cor: item.cor || '', c: item.c, l: item.l, e: item.e };
}

/* Coloca UM item (peça solta ou volume) no pallet dinâmico. Tenta os
   pallets abertos na ordem; não coube em nenhum, abre outro. Devolve o item
   posicionado (já dentro de estado) ou { fora: true } quando é mais largo
   que o pallet. */
function colocarNoPallet(estado, item, opt) {
  opt = Object.assign({}, DEFAULTS, opt || {});
  if (typeof PALLET === 'undefined') throw new Error('pallet-engine.js não carregou');
  const pm = itemDoMotor(item);
  if (pm.l > estado.larguraPallet + 1e-6) return { fora: true, motivo: 'largura ' + Math.round(pm.l) + ' mm passa do pallet (' + estado.larguraPallet + ')' };
  if (pm.c > estado.planW + 1e-6 || pm.l > estado.planD + 1e-6) return { fora: true, motivo: 'maior que a planta do pallet (' + estado.planW + ' × ' + estado.planD + ')' };
  const o = Object.assign({}, PALLET.DEFAULTS, { dens: opt.dens, calco: opt.calco, planW: estado.planW, planD: estado.planD,
    motor: 'cantos', semNovoPallet: true, ordem: 'area', hMax: opt.hMax || 0 });
  const tentar = function (pal) {
    const fixas = pal.itens.map(function (it) {
      return { peca: { id: it.id, tipo: it.tipo, c: it.c, l: it.l, e: it.e }, x: it.x, y: it.y, w: it.w, d: it.d, z: it.z, parcial: it.parcial, calcos: it.calcos };
    });
    const res = PALLET.empacotar([pm], Object.assign({}, o, { fixas: fixas }));
    if (res.sobras.length || !res.pallets[0] || !res.pallets[0].novas || !res.pallets[0].novas.length) return null;
    const n = res.pallets[0].novas[0];
    if (n.parcial && opt.semParcial) return null;              // montados: sem apoio pleno = pallet novo
    return { id: pm.id, tipo: pm.tipo, c: pm.c, l: pm.l, e: pm.e, x: n.x, y: n.y, w: n.w, d: n.d, z: n.z, parcial: !!n.parcial,
             cov: n.cov == null ? 1 : n.cov,
             calcos: (n.calcos || []).map(function (c) { return { x: c.x, y: c.y, z: c.z, n: c.n }; }) };
  };
  /* PULMÃO (25/09, sugestão do Matt: "se não encaixar bem deixa ela em um
     pulmão até chegar o momento de colocar"). Com opt.soSeEncaixaBem, o
     item só entra se o encaixe for BOM: no estrado, ou com apoio pleno
     (cobertura >= apoioBom) sem calço e sem ficar "parcial". Senão devolve
     { pulmao: true } e a tela guarda a peça na área de espera; a cada
     peça colocada, a tela tenta de novo as do pulmão. */
  const bom = function (it) {
    if (!opt.soSeEncaixaBem) return true;
    if (it.parcial) return false;
    if (it.z <= 0.6) return true;
    return !(it.calcos && it.calcos.length) && it.cov >= (opt.apoioBom || 0.85);
  };
  let melhorRuim = null;
  for (let i = 0; i < estado.pallets.length; i++) {
    const pal = estado.pallets[i];
    const it = tentar(pal);
    if (it && bom(it)) { it.pallet = pal.n; it.seq = pal.itens.length + 1; pal.itens.push(it); return it; }
    if (it && !melhorRuim) { melhorRuim = it; melhorRuim._pal = pal; }
  }
  // forçado (botão "colocar assim mesmo"): entra no melhor lugar que achou
  if (opt.forcar && melhorRuim) {
    const pal = melhorRuim._pal; delete melhorRuim._pal;
    melhorRuim.pallet = pal.n; melhorRuim.seq = pal.itens.length + 1; melhorRuim.forcado = true; pal.itens.push(melhorRuim);
    return melhorRuim;
  }
  // Não encaixou bem em pallet aberto: vai pro pulmão em vez de abrir outro
  // pallet (a não ser que seja a 1ª peça de todas ou que opt.forcar).
  if (opt.soSeEncaixaBem && !opt.forcar && estado.pallets.length && melhorRuim) return { pulmao: true, motivo: motivoRuim(melhorRuim) };
  const pal = { n: estado.pallets.length + 1, itens: [] };
  const it = tentar(pal);
  if (!it) {
    const it2 = opt.semParcial ? null : null;
    return { fora: true, motivo: it2 ? '' : 'não coube nem em pallet vazio' };
  }
  it.pallet = pal.n; it.seq = 1; pal.itens.push(it); estado.pallets.push(pal);
  return it;
}

/* ------------------------------------------------------------ REMANEJO
   (25/09, Matt: "você pode realocar alguma peça que já está no pallet para
   encaixar melhor a nova peça, se isso ajudar a consolidar bem o pallet ou
   procurar mais pontos de apoio pra essa peça").
   Só peça LIVRE pode sair (nada em cima dela), e no máximo opt.remanejoMax
   por vez (o operador vai fazer isso na mão). Tenta tirar as 1, 2, ... N
   peças livres postas por último, e re-encaixa {tiradas + nova} em cima do
   resto com o motor, em várias ordens. Aceita se: tudo entrou, tudo com
   apoio pleno e sem calço, e o monte não ficou mais alto do que ficaria
   forçando a nova peça sem mexer em nada. Entre as opções boas: a mais
   baixa, depois a que mexe em menos peças.
   Devolve { pallet, movidas:[{id, antes, depois}], nova } ou null. */
function itensLivres(pal) {
  return pal.itens.filter(function (a) {
    return !pal.itens.some(function (b) { return b !== a && b.z >= a.z + a.e - 0.6 && sobrepoe(a, b); });
  });
}

function remanejar(estado, item, opt) {
  opt = Object.assign({}, DEFAULTS, opt || {});
  const pm = itemDoMotor(item);
  const max = opt.remanejoMax || 4;
  const o = Object.assign({}, PALLET.DEFAULTS, { dens: opt.dens, calco: null, planW: estado.planW, planD: estado.planD,
    motor: 'cantos', semNovoPallet: true });
  const bom = function (it) { return !it.parcial && (it.z <= 0.6 || (it.cov == null ? 1 : it.cov) >= (opt.apoioBom || 0.85)); };
  const alturaDe = function (itens) { return itens.reduce(function (m, it) { return Math.max(m, it.z + it.e); }, 0); };
  const toFixa = function (it) {
    return { peca: { id: it.id, tipo: it.tipo, c: it.c, l: it.l, e: it.e }, x: it.x, y: it.y, w: it.w, d: it.d, z: it.z, parcial: it.parcial, calcos: it.calcos };
  };
  let melhor = null;
  estado.pallets.forEach(function (pal) {
    if (!pal.itens.length) return;
    // teto: altura se a nova peça fosse forçada sem mexer em nada
    const forcada = PALLET.empacotar([pm], Object.assign({}, o, { calco: opt.calco, fixas: pal.itens.map(toFixa) }));
    const teto = forcada.sobras.length ? alturaDe(pal.itens) + pm.e : forcada.pallets[0].alturaCarga;
    const livres = itensLivres(pal).sort(function (a, b) { return (b.seq || 0) - (a.seq || 0); }).slice(0, max);
    for (let k = 1; k <= livres.length; k++) {
      const saem = livres.slice(0, k);
      const ficam = pal.itens.filter(function (it) { return saem.indexOf(it) < 0; });
      const pool = saem.map(function (it) { return { id: it.id, tipo: it.tipo, nome: it.id, cor: '', c: it.c, l: it.l, e: it.e }; }).concat([pm]);
      ['area', 'comp', 'espDesc', 'grupoMax'].forEach(function (ordem) {
        const res = PALLET.empacotar(pool, Object.assign({}, o, { fixas: ficam.map(toFixa), ordem: ordem, agrupar: ordem === 'grupoMax' }));
        if (res.sobras.length || !res.pallets[0]) return;
        const novas = res.pallets[0].novas || [];
        if (novas.length !== pool.length || !novas.every(bom)) return;
        const alt = res.pallets[0].alturaCarga;
        if (alt > teto + 0.6) return;
        // nem só "não ficou pior": precisa mexer pra ganhar alguma coisa —
        // a nova peça bem apoiada já é o ganho; entre as boas, menor altura, menos peças mexidas
        if (!melhor || alt < melhor.alt - 0.6 || (Math.abs(alt - melhor.alt) <= 0.6 && k < melhor.k)) {
          melhor = { alt: alt, k: k, pal: pal, saem: saem, novas: novas };
        }
      });
    }
  });
  if (!melhor) return null;
  const porId = {};
  melhor.novas.forEach(function (n) { porId[n.peca.id] = n; });
  const movidas = [];
  melhor.saem.forEach(function (it) {
    const n = porId[it.id];
    movidas.push({ id: it.id, antes: { x: it.x, y: it.y, w: it.w, d: it.d, z: it.z, cov: it.cov, parcial: it.parcial, calcos: it.calcos },
      depois: { x: n.x, y: n.y, w: n.w, d: n.d, z: n.z, cov: n.cov == null ? 1 : n.cov, parcial: false, calcos: [] } });
  });
  // peças iguais entre as movidas: cada uma pega o destino mais perto de
  // onde já estava (senão o motor troca duas iguais de lugar à toa)
  const grupos = {};
  movidas.forEach(function (m) {
    const it = melhor.saem.find(function (x) { return x.id === m.id; });
    const k = [it.c, it.l, it.e].join('x');
    (grupos[k] = grupos[k] || []).push(m);
  });
  Object.keys(grupos).forEach(function (k) {
    const g = grupos[k];
    if (g.length < 2) return;
    const destinos = g.map(function (m) { return m.depois; });
    const dist = function (a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z); };
    g.forEach(function (m) {
      let bi = 0;
      for (let i = 1; i < destinos.length; i++) if (dist(m.antes, destinos[i]) < dist(m.antes, destinos[bi])) bi = i;
      m.depois = destinos.splice(bi, 1)[0];
    });
  });
  const nn = porId[pm.id];
  const nova = { id: pm.id, tipo: pm.tipo, c: pm.c, l: pm.l, e: pm.e, x: nn.x, y: nn.y, w: nn.w, d: nn.d, z: nn.z, parcial: false,
    cov: nn.cov == null ? 1 : nn.cov, calcos: [], pallet: melhor.pal.n };
  return { pallet: melhor.pal, movidas: movidas, nova: nova, alt: melhor.alt };
}

/* Aplica (ou desfaz, com reverter=true) um remanejo no estado. */
function aplicarRemanejo(estado, rem, reverter) {
  const pal = estado.pallets.find(function (p) { return p.n === (rem.pallet.n || rem.pallet); });
  if (!pal) return;
  const porId = {};
  pal.itens.forEach(function (it) { porId[it.id] = it; });
  rem.movidas.forEach(function (m) {
    const it = porId[m.id];
    if (!it) return;
    Object.assign(it, reverter ? m.antes : m.depois);
    if (!it.calcos) it.calcos = [];
  });
  if (reverter) {
    const k = pal.itens.findIndex(function (it) { return it.id === rem.nova.id; });
    if (k >= 0) pal.itens.splice(k, 1);
  } else {
    rem.nova.seq = pal.itens.length + 1;
    pal.itens.push(rem.nova);
  }
}

function motivoRuim(it) {
  if (it.parcial) return 'ficaria sem apoio pleno';
  if (it.calcos && it.calcos.length) return 'precisaria de calço agora';
  return 'só ' + Math.round((it.cov || 0) * 100) + '% apoiada em cima do que já está';
}

/* Tira o ÚLTIMO item colocado (desfazer). Só o último é seguro: nada foi
   posto em cima dele. */
function tirarDoPallet(estado, id) {
  for (let i = estado.pallets.length - 1; i >= 0; i--) {
    const pal = estado.pallets[i];
    const k = pal.itens.findIndex(function (it) { return it.id === id; });
    if (k < 0) continue;
    if (k !== pal.itens.length - 1) return false;
    pal.itens.pop();
    if (!pal.itens.length && i === estado.pallets.length - 1) estado.pallets.pop();
    return true;
  }
  return false;
}

function niveisDoPallet(pal) {
  const niveis = [];
  pal.itens.forEach(function (it) { const z = Math.round(it.z * 2) / 2; if (niveis.indexOf(z) < 0) niveis.push(z); });
  niveis.sort(function (a, b) { return a - b; });
  pal.itens.forEach(function (it) { it.nivel = niveis.indexOf(Math.round(it.z * 2) / 2) + 1; });
  return niveis;
}

function alturaCarga(pal) {
  return pal.itens.reduce(function (m, it) { return Math.max(m, it.z + it.e); }, 0);
}

function sobrepoe(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y);
  return ox > 5 && oy > 5;
}

function resumoOpt(o) {
  return { peH: o.peH, deckE: o.deckE, margem: o.margem, dens: o.dens, calco: o.calco, maxD: o.maxD };
}

function contarCalcos(plano) {
  let pontos = 0, blocos = 0;
  (plano.pallets || []).forEach(function (p) { p.itens.forEach(function (it) {
    (it.calcos || []).forEach(function (c) { pontos++; blocos += c.n; });
  }); });
  return { pontos: pontos, blocos: blocos };
}

return {
  DEFAULTS: DEFAULTS, RX_SOLTA: RX_SOLTA, pesoKg: pesoKg,
  classificar: classificar, agruparModulos: agruparModulos,
  volumesDoModulo: volumesDoModulo, fitasDoVolume: fitasDoVolume,
  nichosDaEstante: nichosDaEstante, exigenciaDoModulo: exigenciaDoModulo,
  folgaNoNicho: folgaNoNicho, escolherNicho: escolherNicho,
  planejarPallets: planejarPallets, contarCalcos: contarCalcos,
  plantaDinamica: plantaDinamica, plantaMontados: plantaMontados, dimsDoModulo: dimsDoModulo, colocarNoPallet: colocarNoPallet, tirarDoPallet: tirarDoPallet,
  niveisDoPallet: niveisDoPallet, alturaCarga: alturaCarga,
  itensLivres: itensLivres, remanejar: remanejar, aplicarRemanejo: aplicarRemanejo
};
})();

if (typeof module !== 'undefined' && module.exports) module.exports = APEMB_PLANO;
