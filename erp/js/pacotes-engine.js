/* Legno ERP — motor de PACOTES (volumes) do lote  (PACOTES)
 *
 * Pedido do Matt (2026-09-27): "ao fechar um lote, faça um cálculo e crie
 * pacotes de todas as peças". Regras, todas dele:
 *   - módulo empacotado JUNTO; só divide pra não passar de 25 kg;
 *   - peça igual ou parecida no mesmo pacote;
 *   - número PAR de camadas na altura (acomoda melhor no pallet);
 *   - a BASE do pacote é uma peça inteira, sólida (a maior); camadas do
 *     meio e do topo podem ter 1 ou mais peças lado a lado;
 *   - o MENOR número de volumes possível;
 *   - peça com qualquer lado acima de 900 mm vai em pacote SÓ de peças
 *     grandes (do mesmo módulo, mesmas regras) e fica em área separada;
 *   - pallet compactado por PEDIDO, com medida padrão de pallet
 *     (48 × 40 pol = 1219 × 1016 por padrão, configurável).
 *
 * Só calcula, sem DOM e sem banco. Roda no navegador (depois de
 * pallet-engine.js, que é quem monta o pallet) e em node (testes).
 *
 *   PACOTES.DEFAULTS
 *   PACOTES.gerar(pecas, opt)          → { pacotes, avisos }
 *   PACOTES.pallets(pacotes, cfg)      → plano de pallets de UM pedido
 *   PACOTES.fitas(C, L)                → onde passar as fitas de arquear
 *
 * PEÇA (entrada): { codigo, ref, c, l, e, cor, modKey, moduloNumero,
 *   moduloNome, pedido, orderId, cliente }   c >= l (mm), e = espessura.
 * PACOTE (saída): { id, modKey, moduloNumero, moduloNome, pedido, orderId,
 *   tipo: 'normal'|'grande', idx, total, C, L, H, peso, nCamadas,
 *   camadas: [{ z, e, itens: [{ codigo, x, y, w, d, rot }] }],
 *   pecas: [codigo...], avisos: [texto], impar: bool }
 */

const PACOTES = (function () {

const DEFAULTS = {
  pesoMax: 25,          // kg por pacote
  grandeMm: 900,        // acima disso em qualquer lado = peça grande
  dens: 650,            // kg/m³ quando a peça não traz peso
  parCamadas: true,     // preferir número par de camadas
  folga: 0,             // mm entre peças na mesma camada
  tolE: 0.6,            // peças na mesma camada: mesma espessura (± tolE)
  // pallet padrão (48 × 40 pol). hMax = altura máx. da carga (sem o estrado)
  pallet: { planW: 1219, planD: 1016, hMax: 1800, nome: '48 × 40 pol' }
};

function pesoKg(p, dens) {
  if (p.peso > 0) return p.peso;
  return (p.c / 1000) * (p.l / 1000) * (p.e / 1000) * dens;
}

function r1(v) { return Math.round(v * 10) / 10; }

/* ----------------------------------------------------------- camada
   Encaixa peças de `pool` (já ordenadas: maior primeiro) numa camada de
   planta W × D, em "prateleiras" (linhas ao longo de D). Só entra peça da
   MESMA espessura da primeira que entrou (camada plana). Respeita o peso
   que ainda cabe. Devolve { itens, e, peso, usadas:[índices do pool] }. */
function montarCamada(pool, W, D, pesoLivre, opt, eFixa) {
  const itens = [], usadas = [];
  let e = eFixa || 0, peso = 0;
  let y = 0, rowH = 0, x = 0;
  const g = opt.folga;
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i];
    if (p._peso > pesoLivre - peso + 1e-9) continue;
    if (e && Math.abs(p.e - e) > opt.tolE) continue;
    // orientações possíveis dentro da planta
    const ors = [[p.c, p.l, false]];
    if (p.c !== p.l) ors.push([p.l, p.c, true]);
    let posto = null;
    for (const [w, d, rot] of ors) {
      if (w > W + 1e-6 || d > D + 1e-6) continue;
      // cabe na linha atual?
      if (x + w <= W + 1e-6 && y + Math.max(rowH, d) <= D + 1e-6) { posto = { x: x, y: y, w: w, d: d, rot: rot, novaLinha: false }; break; }
    }
    if (!posto) {
      // linha nova
      for (const [w, d, rot] of ors) {
        if (w > W + 1e-6) continue;
        const ny = y + rowH + (rowH ? g : 0);
        if (ny + d <= D + 1e-6) { posto = { x: 0, y: ny, w: w, d: d, rot: rot, novaLinha: true }; break; }
      }
    }
    if (!posto) continue;
    if (posto.novaLinha) { y = posto.y; x = 0; rowH = 0; }
    itens.push({ codigo: p.codigo, x: posto.x, y: posto.y, w: posto.w, d: posto.d, rot: posto.rot });
    usadas.push(i);
    x = posto.x + posto.w + g;
    rowH = Math.max(rowH, posto.d);
    if (!e) e = p.e;
    peso += p._peso;
  }
  return { itens: itens, e: e, peso: peso, usadas: usadas };
}

function ordenar(arr) {
  return arr.sort(function (a, b) { return (b.c - a.c) || (b.l - a.l) || (b.e - a.e) || String(a.codigo).localeCompare(String(b.codigo)); });
}

/* ------------------------------------------------------ um grupo
   Peças de UM módulo (só normais, ou só grandes) → pacotes. Guloso:
   a maior peça que sobrou vira a BASE (camada 1, sozinha, planta do
   pacote); as camadas seguintes juntam o que cabe nessa planta, até o
   peso. Com parCamadas, pacote que fechou com número ímpar de camadas
   (> 1) devolve a camada de cima pro monte — as duas versões (com e sem
   paridade) são comparadas em gerar(), ganha a que dá MENOS pacotes. */
function empacotarGrupo(pecas, opt, par) {
  let pool = ordenar(pecas.slice());
  const out = [];
  let guarda = 0;
  while (pool.length) {
    if (++guarda > pecas.length + 5) break;                 // nunca travar
    const base = pool.shift();
    const W = base.c, D = base.l;
    const camadas = [{ e: base.e, itens: [{ codigo: base.codigo, x: 0, y: 0, w: base.c, d: base.l, rot: false }], peso: base._peso, pecas: [base] }];
    let peso = base._peso;
    // camadas seguintes
    while (pool.length) {
      const cam = montarCamada(pool, W, D, opt.pesoMax - peso, opt);
      if (!cam.itens.length) break;
      const pecasCam = cam.usadas.map(function (i) { return pool[i]; });
      pool = pool.filter(function (_, i) { return cam.usadas.indexOf(i) < 0; });
      camadas.push({ e: cam.e, itens: cam.itens, peso: cam.peso, pecas: pecasCam });
      peso += cam.peso;
    }
    if (par && camadas.length > 1 && camadas.length % 2 === 1) {
      const topo = camadas.pop();
      peso -= topo.peso;
      pool = ordenar(pool.concat(topo.pecas));
    }
    out.push({ camadas: camadas, W: W, D: D, peso: peso, base: base });
  }
  ajustarParidade(out, opt);
  return out.map(function (p) { return fecharPacote(p.camadas, p.W, p.D, p.peso, p.base); });
}

/* Dois pacotes ÍMPARES do mesmo grupo: a camada de cima de um vira camada
   nova do outro (se couber na planta e no peso) — os dois ficam pares sem
   criar volume. Repete enquanto conseguir. */
function ajustarParidade(pacs, opt) {
  let mudou = true, guarda = 0;
  while (mudou && ++guarda < 50) {
    mudou = false;
    const impares = pacs.filter(function (p) { return p.camadas.length % 2 === 1 && p.camadas.length > 1; });
    for (let i = 0; i < impares.length && !mudou; i++) {
      const a = impares[i];
      const topo = a.camadas[a.camadas.length - 1];
      for (let j = 0; j < pacs.length && !mudou; j++) {
        const b = pacs[j];
        if (b === a || b.camadas.length % 2 === 0) continue;
        const cam = montarCamada(ordenar(topo.pecas.slice()), b.W, b.D, opt.pesoMax - b.peso, opt);
        if (cam.itens.length !== topo.pecas.length) continue;
        a.camadas.pop(); a.peso -= topo.peso;
        b.camadas.push({ e: cam.e, itens: cam.itens, peso: cam.peso, pecas: topo.pecas });
        b.peso += cam.peso;
        mudou = true;
      }
    }
  }
}

function fecharPacote(camadas, W, D, peso, base) {
  let z = 0;
  const cams = camadas.map(function (c) {
    const o = { z: r1(z), e: c.e, itens: c.itens };
    z += c.e;
    return o;
  });
  return {
    C: W, L: D, H: r1(z), peso: Math.round(peso * 100) / 100, nCamadas: cams.length,
    camadas: cams, pecas: camadas.reduce(function (a, c) { return a.concat(c.itens.map(function (i) { return i.codigo; })); }, []),
    base: base.codigo, impar: cams.length % 2 === 1
  };
}

/* ------------------------------------------------------------- gerar */
function gerar(pecas, opt) {
  opt = Object.assign({}, DEFAULTS, opt || {});
  const avisos = [];
  const ps = pecas.map(function (p) {
    const c = Math.max(p.c, p.l), l = Math.min(p.c, p.l);
    const q = Object.assign({}, p, { c: c, l: l, e: Number(p.e) || 19.5 });
    q._peso = pesoKg(q, opt.dens);
    return q;
  });
  ps.forEach(function (p) {
    if (p._peso > opt.pesoMax) avisos.push('Peça ' + p.codigo + ' pesa ' + r1(p._peso) + ' kg sozinha — passa do limite de ' + opt.pesoMax + ' kg.');
  });

  // grupos: por módulo; peça sem módulo agrupa por pedido
  const grupos = {}, ordemGrupos = [];
  ps.forEach(function (p) {
    const k = p.modKey || ('AVULSO|' + (p.orderId || p.pedido || ''));
    if (!grupos[k]) { grupos[k] = { key: k, pecas: [], p: p }; ordemGrupos.push(k); }
    grupos[k].pecas.push(p);
  });

  const pacotes = [];
  ordemGrupos.forEach(function (k) {
    const g = grupos[k];
    const grandes = g.pecas.filter(function (p) { return p.c > opt.grandeMm; });
    const normais = g.pecas.filter(function (p) { return p.c <= opt.grandeMm; });
    const lista = [];
    [['normal', normais], ['grande', grandes]].forEach(function (par) {
      const tipo = par[0], lst = par[1];
      if (!lst.length) return;
      let res;
      if (opt.parCamadas) {
        const a = empacotarGrupo(lst, opt, true), b = empacotarGrupo(lst, opt, false);
        res = a.length <= b.length ? a : b;
      } else res = empacotarGrupo(lst, opt, false);
      res.forEach(function (pc) { pc.tipo = tipo; lista.push(pc); });
    });
    const mod = g.p;
    lista.forEach(function (pc, i) {
      pc.idx = i + 1; pc.total = lista.length;
      pc.modKey = mod.modKey || null; pc.moduloNumero = mod.moduloNumero || '—'; pc.moduloNome = mod.moduloNome || (mod.modKey ? '' : 'Peças avulsas');
      pc.pedido = mod.pedido || ''; pc.orderId = mod.orderId || null; pc.cliente = mod.cliente || '';
      pc.id = 'V|' + k + '|' + pc.idx;
      pc.rotulo = 'Vol. ' + pc.moduloNumero + '-' + pc.idx + (pc.tipo === 'grande' ? ' G' : '');
      pc.avisos = [];
      if (pc.peso > opt.pesoMax + 1e-9) pc.avisos.push('Passa de ' + opt.pesoMax + ' kg (' + pc.peso + ' kg) — peça única pesada.');
      if (pc.impar && pc.nCamadas > 1) pc.avisos.push('Ficou com ' + pc.nCamadas + ' camadas (ímpar) — juntar em par aumentaria o número de volumes.');
      pc.fitas = fitas(pc.C, pc.L);
      pacotes.push(pc);
    });
  });
  // numeração sequencial no lote: por pedido, módulo, idx
  pacotes.forEach(function (pc, i) { pc.seq = i + 1; });
  return { pacotes: pacotes, avisos: avisos, opt: { pesoMax: opt.pesoMax, grandeMm: opt.grandeMm, dens: opt.dens, parCamadas: opt.parCamadas } };
}

/* Fitas de arquear: atravessadas no comprimento, ~150 mm de cada ponta e
   distribuídas (≤ 900: 2; ≤ 1800: 3; acima: 4); volume largo (≥ 600) ganha
   1 no sentido do comprimento. (Mesma regra de apont-embalagem-plano.js.) */
function fitas(C, L) {
  const nT = C <= 900 ? 2 : (C <= 1800 ? 3 : 4);
  const m = Math.min(150, C / 6);
  const trans = [];
  for (let i = 0; i < nT; i++) trans.push(Math.round(nT === 1 ? C / 2 : m + (C - 2 * m) * i / (nT - 1)));
  return { transversais: trans, longitudinal: L >= 600 };
}

/* ------------------------------------------------------------ pallets
   Pacotes de UM pedido → pallets na medida padrão (cfg.planW × planD, hMax).
   Pacote que não cabe na planta padrão (os de peça grande, tipicamente)
   vai pro "pallet especial", cuja planta segue o pacote mais comprido
   (largura ainda limitada a planD). Motor: PALLET.empacotar (pallet-
   engine.js) — apoio 6 pontos/4 apoiados, sem calço — testando as 4
   ordens e ficando com menos pallets, depois menor altura. */
function pallets(pacotes, cfg) {
  cfg = Object.assign({}, DEFAULTS.pallet, cfg || {});
  if (typeof PALLET === 'undefined') throw new Error('pallet-engine.js não carregou');
  const item = function (pc) { return { id: pc.id, tipo: 'volume', nome: pc.rotulo || pc.id, cor: '', c: Math.max(pc.C, pc.L), l: Math.min(pc.C, pc.L), e: pc.H, peso: pc.peso }; };
  const cabe = function (pc) { return Math.max(pc.C, pc.L) <= cfg.planW + 1e-6 && Math.min(pc.C, pc.L) <= cfg.planD + 1e-6; };
  const normais = pacotes.filter(cabe).map(item);
  const longos = pacotes.filter(function (pc) { return !cabe(pc); });
  const semLugar = longos.filter(function (pc) { return Math.min(pc.C, pc.L) > cfg.planD + 1e-6; });
  const especiais = longos.filter(function (pc) { return Math.min(pc.C, pc.L) <= cfg.planD + 1e-6; }).map(item);

  const rodar = function (itens, planW, planD) {
    if (!itens.length) return [];
    const base = Object.assign({}, PALLET.DEFAULTS, { planW: planW, planD: planD, maxD: planD, maxW: planW, hMax: cfg.hMax || 0,
      calco: null, rotacionar: true });
    let melhor = null;
    ['grupoMax', 'area', 'comp', 'espDesc'].forEach(function (ordem) {
      const res = PALLET.empacotar(itens, Object.assign({}, base, { ordem: ordem, agrupar: ordem === 'grupoMax' }));
      if (res.sobras.length) return;
      const alt = Math.max.apply(null, res.pallets.map(function (p) { return p.alturaCarga; }).concat([0]));
      const parciais = res.pallets.reduce(function (s, p) { return s + p.pecas.filter(function (i) { return i.parcial; }).length; }, 0);
      const nota = [res.pallets.length, parciais, alt];
      if (!melhor || nota[0] < melhor.nota[0] || (nota[0] === melhor.nota[0] && (nota[1] < melhor.nota[1] ||
          (nota[1] === melhor.nota[1] && nota[2] < melhor.nota[2] - 0.5)))) melhor = { res: res, nota: nota, ordem: ordem };
    });
    if (!melhor) return null;
    return melhor.res.pallets.map(function (pal) {
      const its = pal.pecas.map(function (it) {
        return { id: it.peca.id, x: it.x, y: it.y, w: it.w, d: it.d, z: it.z, e: it.peca.e, peso: it.peca.peso || 0, parcial: !!it.parcial };
      });
      // CENTRALIZADO no pallet (Matt, 27/09: "não encostados num dos cantos").
      // O conjunto inteiro desloca junto — o apoio entre níveis não muda.
      if (its.length) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        its.forEach(function (it) { x0 = Math.min(x0, it.x); x1 = Math.max(x1, it.x + it.w); y0 = Math.min(y0, it.y); y1 = Math.max(y1, it.y + it.d); });
        const dx = Math.round((planW - (x1 - x0)) / 2 - x0), dy = Math.round((planD - (y1 - y0)) / 2 - y0);
        its.forEach(function (it) { it.x += dx; it.y += dy; });
      }
      its.sort(function (a, b) { return (a.z - b.z) || (a.y - b.y) || (a.x - b.x); });
      const niveis = [];
      its.forEach(function (it, k) {
        it.seq = k + 1;
        const z = Math.round(it.z * 2) / 2;
        if (niveis.indexOf(z) < 0) niveis.push(z);
      });
      niveis.sort(function (a, b) { return a - b; });
      its.forEach(function (it) { it.nivel = niveis.indexOf(Math.round(it.z * 2) / 2) + 1; });
      return { itens: its, niveis: niveis, alturaCarga: r1(pal.alturaCarga), planW: planW, planD: planD,
        peso: Math.round(its.reduce(function (s, it) { return s + it.peso; }, 0) * 10) / 10 };
    });
  };

  const out = { cfg: cfg, pallets: [], semLugar: semLugar.map(function (pc) { return pc.id; }) };
  (rodar(normais, cfg.planW, cfg.planD) || []).forEach(function (p) { p.tipo = 'padrao'; out.pallets.push(p); });
  if (especiais.length) {
    const planW = Math.ceil(Math.max.apply(null, especiais.map(function (i) { return i.c; })));
    (rodar(especiais, planW, cfg.planD) || []).forEach(function (p) { p.tipo = 'especial'; out.pallets.push(p); });
  }
  out.pallets.forEach(function (p, i) { p.n = i + 1; });
  return out;
}

return { DEFAULTS: DEFAULTS, pesoKg: pesoKg, gerar: gerar, pallets: pallets, fitas: fitas, _montarCamada: montarCamada };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PACOTES;
