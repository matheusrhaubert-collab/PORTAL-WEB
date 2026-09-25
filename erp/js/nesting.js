/* Legno ERP — motor de nesting do Plano de Corte.
 *
 * Sem dependência: roda em file:// igual ao resto do ERP.
 *
 * ==========================================================================
 * POR QUE NÃO É O MESMO MOTOR DO PORTAL
 * ==========================================================================
 * O portal usa MaxRects (packSheetsMaxRects, js/portal.js). MaxRects aproveita
 * mais a chapa, mas gera layout que uma SECCIONADORA NÃO CONSEGUE CORTAR: ele
 * encaixa peça em buraco no meio da chapa, e a seccionadora só faz corte
 * passante — todo corte atravessa o material inteiro, de ponta a ponta
 * (corte guilhotinado). É a diferença entre "estimativa de quantas chapas
 * comprar" (portal, pro Contractor) e "plano que o operador executa na
 * máquina" (aqui).
 *
 * Por isso o padrão daqui é GUILHOTINA. MaxRects continua disponível como
 * opção pra comparar aproveitamento teórico ou pra corte em router/CNC, mas o
 * parâmetro nasce em 'guilhotina' de propósito.
 *
 * ==========================================================================
 * O QUE ENTRA E O QUE SAI
 * ==========================================================================
 * NESTING.run({ pieces, offcutBins, newSheet, params }) devolve
 *   { sheets: [...], unplaced: [...], summary: {...} }
 *
 * pieces      — UMA entrada por unidade física (quantidade já explodida).
 *               { key, w, h, grain, label, meta }
 *               w é o COMPRIMENTO, h é a LARGURA. Peça com grain=true nunca
 *               gira — o comprimento fica sempre no sentido do veio.
 * offcutBins  — retalhos do estoque, já filtrados por cor+espessura e já na
 *               ordem de prioridade. { id, code, w, h, location }
 * newSheet    — molde da chapa nova. { sheet_size_id, name, w, h }
 * params      — kerf_mm, trim_*_mm, strategy, first_cut, allow_rotation,
 *               respect_grain, min_offcut_width_mm, min_offcut_height_mm
 *
 * Cada sheet de saída:
 *   { source:'retalho'|'chapa_nova', offcut, width, height, area,
 *     placed:[{x,y,w,h,rotated,piece}], offcuts:[{x,y,w,h}],
 *     usedArea, usedPct }
 * Coordenadas em mm a partir do canto superior esquerdo da CHAPA INTEIRA
 * (o refile já está somado) — é o que o desenho e a máquina precisam.
 */

const NESTING = {};

/* ============================================================
   Utilidades de retângulo
   ============================================================ */
NESTING._fits = function (piece, rect, kerf, allowRotation, respectGrain) {
  /* kerf entra como margem à direita e abaixo da peça: é o material que o
     disco come no corte que separa esta peça da vizinha. Aproximação padrão
     desse tipo de otimizador — o corte de refile já foi descontado antes. */
  const out = [];
  const locked = respectGrain && piece.grain;
  if (piece.w + kerf <= rect.w + 1e-6 && piece.h + kerf <= rect.h + 1e-6) {
    out.push({ w: piece.w, h: piece.h, rotated: false });
  }
  if (allowRotation && !locked && piece.w !== piece.h &&
      piece.h + kerf <= rect.w + 1e-6 && piece.w + kerf <= rect.h + 1e-6) {
    out.push({ w: piece.h, h: piece.w, rotated: true });
  }
  return out;
};

/* Cabe na chapa, em qualquer orientação permitida? Usado ANTES de rodar, pra
   avisar "esta peça é maior que a chapa" em vez de gerar plano quebrado. */
NESTING.pieceFitsSheet = function (piece, sheetW, sheetH, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const w = sheetW - (Number(params.trim_left_mm) || 0) - (Number(params.trim_right_mm) || 0);
  const h = sheetH - (Number(params.trim_top_mm) || 0) - (Number(params.trim_bottom_mm) || 0);
  // Peça de comprimento inteiro (ver _packBin): cabe se couber na chapa FÍSICA.
  if (piece.full_length_ok && piece.w <= sheetW + 1e-6 && piece.w >= sheetW - (Number(params.full_length_tolerance_mm) || 100) && piece.h <= h + 1e-6) return true;
  // +kerf: a serra da borda útil cai no refile (ver _packBin/packW).
  return NESTING._fits(piece, { w: w + kerf, h: h + kerf }, kerf, params.allow_rotation !== false, params.respect_grain !== false).length > 0;
};

/* ============================================================
   Packer GUILHOTINA
   ============================================================
   Lista de retângulos livres. Cada peça colocada parte o retângulo que a
   recebeu em DOIS por um corte que atravessa esse retângulo inteiro — é essa
   regra que garante que a seccionadora consegue executar. Nunca junta
   retângulos livres de volta (merge quebraria a garantia).

   Escolha do retângulo: Best Area Fit — o que sobra menos área. Escolha do
   corte: depende de first_cut. 'auto' corta pelo eixo mais curto do resto,
   que na prática é o que costuma sobrar retalho mais utilizável. */
NESTING._packGuillotine = function (pieces, binW, binH, params, splitMode) {
  const kerf = Number(params.kerf_mm) || 0;
  const allowRot = params.allow_rotation !== false;
  const grain = params.respect_grain !== false;
  const firstCut = splitMode || params.first_cut || 'auto';

  const free = [{ x: 0, y: 0, w: binW, h: binH }];
  const placed = [];
  const leftovers = [];

  pieces.forEach(function (piece) {
    if (piece._done) return;
    let best = null;
    for (let i = 0; i < free.length; i++) {
      const rect = free[i];
      const cands = NESTING._fits(piece, rect, kerf, allowRot, grain);
      for (let c = 0; c < cands.length; c++) {
        const cand = cands[c];
        const waste = rect.w * rect.h - (cand.w + kerf) * (cand.h + kerf);
        if (!best || waste < best.waste - 1e-6) best = { i: i, rect: rect, cand: cand, waste: waste };
      }
    }
    if (!best) return;

    const rect = best.rect;
    const cw = best.cand.w + kerf;   // largura consumida (peça + serra)
    const ch = best.cand.h + kerf;

    placed.push({
      x: rect.x, y: rect.y,
      w: best.cand.w, h: best.cand.h,
      rotated: best.cand.rotated,
      piece: piece
    });
    piece._done = true;

    /* O corte guilhotinado: o resto do retângulo vira DOIS retângulos.
       - horizontal: primeiro separa a faixa de baixo na largura toda
       - vertical:   primeiro separa a coluna da direita na altura toda */
    const restRight = rect.w - cw;
    const restBottom = rect.h - ch;
    let horizontal;
    if (firstCut === 'horizontal') horizontal = true;
    else if (firstCut === 'vertical') horizontal = false;
    else horizontal = restBottom <= restRight; // auto: corta o eixo que sobrou menos

    free.splice(best.i, 1);
    if (horizontal) {
      if (restRight > 0.5) free.push({ x: rect.x + cw, y: rect.y, w: restRight, h: ch });
      if (restBottom > 0.5) free.push({ x: rect.x, y: rect.y + ch, w: rect.w, h: restBottom });
    } else {
      if (restRight > 0.5) free.push({ x: rect.x + cw, y: rect.y, w: restRight, h: rect.h });
      if (restBottom > 0.5) free.push({ x: rect.x, y: rect.y + ch, w: cw, h: restBottom });
    }
    /* Maior primeiro: encaixar na sobra grande antes tende a deixar a sobra
       pequena inteira, e sobra inteira é retalho aproveitável. */
    free.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
  });

  free.forEach(function (r) { leftovers.push(r); });
  return { placed: placed, leftovers: leftovers };
};

/* ============================================================
   Packer GUILHOTINA — variante GLOBAL BEST-FIT
   ============================================================
   A _packGuillotine normal decide "qual retângulo pra ESSA peça" seguindo a
   ordem de entrada — por isso a ordem importa tanto (ver _perturbedOrder
   acima). Esta variante tira a ordem da equação: a cada passo, olha TODA
   peça que falta contra TODO retângulo livre e coloca o par (peça,
   retângulo) que sobra MENOS área — sem se prender a "qual peça vem
   primeiro na lista". Mais caro por chapa (o(peças restantes × retângulo
   livre) a cada peça colocada, contra o(1) da versão em ordem), mas pra
   centenas de peça ainda é rápido, e directly ataca o motivo real da
   diferença pro outro software do Matt (21/09-5): ele não depende de
   "escolher bem a ordem de entrada", escolhe o melhor encaixe possível a
   cada peça, sempre. */
NESTING._packGuillotineGlobalBF = function (pieces, binW, binH, params, splitMode) {
  const kerf = Number(params.kerf_mm) || 0;
  const allowRot = params.allow_rotation !== false;
  const grain = params.respect_grain !== false;
  const firstCut = splitMode || params.first_cut || 'auto';

  const free = [{ x: 0, y: 0, w: binW, h: binH }];
  const placed = [];

  for (;;) {
    let best = null;
    for (let pi = 0; pi < pieces.length; pi++) {
      const piece = pieces[pi];
      if (piece._done) continue;
      for (let ri = 0; ri < free.length; ri++) {
        const rect = free[ri];
        const cands = NESTING._fits(piece, rect, kerf, allowRot, grain);
        for (let c = 0; c < cands.length; c++) {
          const cand = cands[c];
          const waste = rect.w * rect.h - (cand.w + kerf) * (cand.h + kerf);
          if (!best || waste < best.waste - 1e-6) best = { ri: ri, rect: rect, cand: cand, waste: waste, piece: piece };
        }
      }
    }
    if (!best) break;

    const rect = best.rect;
    const cw = best.cand.w + kerf;
    const ch = best.cand.h + kerf;
    placed.push({ x: rect.x, y: rect.y, w: best.cand.w, h: best.cand.h, rotated: best.cand.rotated, piece: best.piece });
    best.piece._done = true;

    const restRight = rect.w - cw;
    const restBottom = rect.h - ch;
    let horizontal;
    if (firstCut === 'horizontal') horizontal = true;
    else if (firstCut === 'vertical') horizontal = false;
    else horizontal = restBottom <= restRight;

    free.splice(best.ri, 1);
    if (horizontal) {
      if (restRight > 0.5) free.push({ x: rect.x + cw, y: rect.y, w: restRight, h: ch });
      if (restBottom > 0.5) free.push({ x: rect.x, y: rect.y + ch, w: rect.w, h: restBottom });
    } else {
      if (restRight > 0.5) free.push({ x: rect.x + cw, y: rect.y, w: restRight, h: rect.h });
      if (restBottom > 0.5) free.push({ x: rect.x, y: rect.y + ch, w: cw, h: restBottom });
    }
    free.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
  }

  return { placed: placed, leftovers: free.slice() };
};

/* ============================================================
   Packer FAIXAS (níveis) — o jeito que otimizador de seccionadora faz
   ============================================================
   Pedido do Matt (21/09-19): "melhorar o aproveitamento com um cálculo mais
   demorado, mais combinações". Os motores acima (BAF guilhotina, global
   best-fit) encaixam peça a peça no melhor retângulo livre; software
   comercial de seccionadora costuma pensar em FAIXAS: escolhe uma altura de
   faixa, enche a faixa ao longo do comprimento com as peças que cabem nessa
   altura (é um problema de mochila 1D — dá pra resolver EXATO por
   programação dinâmica), e em cada coluna da faixa empilha em cima da peça o
   que couber (3º nível de corte). Isso gera menos "buraco" que o encaixe
   livre e é exatamente o que a seccionadora corta bem.

   Este motor entra como mais um candidato em _packBin/'auto' — quem vence a
   chapa é quem colocou mais peça/área, então nunca piora o resultado. Roda
   também transposto (_packStripsT: primeiro corte vertical). No modo
   "cálculo demorado" (params.deep_search) ele roda sobre 6x mais ordens de
   peça — foi isso que levou o lote real do Matt (LT-26-0014, birch) de 14
   pra 13 chapas, mesmo número do software da outra máquina (12,5). */
NESTING._packStrips = function (pieces, binW, binH, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const allowRot = params.allow_rotation !== false;
  const grain = params.respect_grain !== false;
  const placed = [];
  const leftovers = [];
  let y = 0;

  function orientations(p, maxH) {
    // orientações em que a peça cabe numa faixa de altura maxH
    const out = [];
    const locked = grain && p.grain;
    if (p.h <= maxH + 1e-6) out.push({ w: p.w, h: p.h, rotated: false });
    if (allowRot && !locked && p.w !== p.h && p.w <= maxH + 1e-6) out.push({ w: p.h, h: p.w, rotated: true });
    return out;
  }

  function fillStrip(H, avail) {
    /* Escolhe as COLUNAS da faixa (1 peça por coluna, na orientação de
       altura mais próxima de H), maximizando área: DP exata no modo deep,
       guloso "mais alto, depois mais largo" no normal. */
    const cands = [];
    avail.forEach(function (p) {
      let bestO = null;
      orientations(p, H).forEach(function (o) { if (!bestO || o.h > bestO.h) bestO = o; });
      if (bestO) cands.push({ p: p, w: bestO.w, h: bestO.h, rotated: bestO.rotated, cost: Math.round(bestO.w + kerf) });
    });
    /* Guloso "mais alto, depois mais largo" ao longo do comprimento. (Uma
       mochila 0/1 exata por DP foi testada aqui — 21/09-19 — e NÃO melhorou
       nada no lote real do Matt, custando 10x o tempo; o ganho de verdade
       veio de rodar este motor sobre muitas ORDENS de peça diferentes, ver
       NESTING._solve/deep_search.) */
    let chosen = [];
    cands.sort(function (a, b) { return b.h - a.h || b.w - a.w; });
    let xg = 0;
    cands.forEach(function (cd) {
      if (xg + cd.w <= binW + 1e-6) { chosen.push(cd); xg += cd.w + kerf; }
    });
    // Empilha em cima de cada coluna o que couber (3º nível): peças com
    // largura <= largura da coluna e altura <= sobra da coluna.
    const used = new Set(chosen.map(function (cd) { return cd.p; }));
    const cols = [];
    let x = 0;
    let area = 0;
    chosen.forEach(function (cd) {
      if (x + cd.w > binW + 1e-6) return;
      const col = { x: x, w: cd.w, items: [{ p: cd.p, w: cd.w, h: cd.h, rotated: cd.rotated, dy: 0 }] };
      area += cd.w * cd.h;
      let top = cd.h + kerf;
      let progress = true;
      while (progress) {
        progress = false;
        let bestFit = null;
        avail.forEach(function (q) {
          if (used.has(q)) return;
          orientations(q, H - top).forEach(function (o) {
            if (o.w <= cd.w + 1e-6) {
              const score = o.w * o.h;
              if (!bestFit || score > bestFit.score) bestFit = { p: q, w: o.w, h: o.h, rotated: o.rotated, score: score };
            }
          });
        });
        if (bestFit) {
          used.add(bestFit.p);
          col.items.push({ p: bestFit.p, w: bestFit.w, h: bestFit.h, rotated: bestFit.rotated, dy: top });
          area += bestFit.w * bestFit.h;
          top += bestFit.h + kerf;
          progress = true;
        }
      }
      col.top = top - kerf; // altura ocupada na coluna (sem o kerf final)
      cols.push(col);
      x += cd.w + kerf;
    });
    return { cols: cols, area: area, xEnd: x > 0 ? x - kerf : 0 };
  }

  for (;;) {
    const remH = binH - y;
    const avail = pieces.filter(function (p) { return !p._done && orientations(p, remH).length; });
    if (!avail.length) break;
    // Alturas candidatas: as alturas (e larguras, se gira) das peças que
    // sobram, sem repetição, maiores primeiro; limita a 14 pra não explodir.
    const hs = {};
    avail.forEach(function (p) { orientations(p, remH).forEach(function (o) { hs[Math.round(o.h * 10)] = o.h; }); });
    const heights = Object.keys(hs).map(function (k) { return hs[k]; }).sort(function (a, b) { return b - a; }).slice(0, 14);
    let best = null;
    heights.forEach(function (H) {
      const f = fillStrip(H, avail);
      if (!f.cols.length) return;
      const util = f.area / (H * binW);
      if (!best || util > best.util + 1e-9 || (Math.abs(util - best.util) < 1e-9 && f.area > best.f.area)) best = { H: H, f: f, util: util };
    });
    if (!best) break;
    const H = best.H;
    best.f.cols.forEach(function (col) {
      col.items.forEach(function (it) {
        placed.push({ x: col.x, y: y + it.dy, w: it.w, h: it.h, rotated: it.rotated, piece: it.p });
        it.p._done = true;
      });
      // sobra em cima da coluna (inclui o kerf do lado de dentro, como os
      // outros packers: ver nota em machine-export._itensDaChapa)
      const gapH = H - col.top - kerf;
      if (gapH > 0.5) leftovers.push({ x: col.x, y: y + col.top + kerf, w: col.w + (col.x + col.w + kerf <= binW ? kerf : 0), h: gapH + (y + H + kerf <= binH ? kerf : 0) });
    });
    const tailW = binW - best.f.xEnd - kerf;
    if (tailW > 0.5) leftovers.push({ x: best.f.xEnd + kerf, y: y, w: tailW, h: H + (y + H + kerf <= binH ? kerf : 0) });
    y += H + kerf;
    if (y >= binH - 0.5) break;
  }
  if (binH - y > 0.5) leftovers.push({ x: 0, y: y, w: binW, h: binH - y });
  return { placed: placed, leftovers: leftovers };
};

/* Faixas TRANSPOSTAS: mesmas faixas, só que o primeiro corte é vertical
   (colunas ao longo do comprimento). Roda _packStrips no problema
   transposto (troca w<->h da chapa e das peças, mantendo a trava de veio
   coerente) e destranspõe o resultado. */
NESTING._packStripsT = function (pieces, binW, binH, params) {
  const proxies = pieces.map(function (p) {
    return { w: p.h, h: p.w, grain: p.grain, full_length_ok: false, _done: p._done, _orig: p };
  });
  const r = NESTING._packStrips(proxies, binH, binW, params);
  proxies.forEach(function (q) { q._orig._done = q._done; });
  return {
    placed: r.placed.map(function (pl) { return { x: pl.y, y: pl.x, w: pl.h, h: pl.w, rotated: pl.rotated, piece: pl.piece._orig }; }),
    leftovers: r.leftovers.map(function (o) { return { x: o.y, y: o.x, w: o.h, h: o.w }; })
  };
};

/* ============================================================
   Packer MAXRECTS (opção — NÃO guilhotinado)
   ============================================================
   Mesma matemática do portal (packSheetsMaxRects em js/portal.js), trazida
   pra cá pra não acoplar o ERP ao arquivo do portal. Aproveita mais a chapa e
   serve pra comparar, mas o layout pode exigir corte que a seccionadora não
   faz — a tela avisa isso. */
NESTING._packMaxRects = function (pieces, binW, binH, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const allowRot = params.allow_rotation !== false;
  const grain = params.respect_grain !== false;

  function contains(o, i) {
    return i.x >= o.x - 1e-6 && i.y >= o.y - 1e-6 &&
      i.x + i.w <= o.x + o.w + 1e-6 && i.y + i.h <= o.y + o.h + 1e-6;
  }
  function overlaps(a, b) {
    return a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 &&
      a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;
  }
  function prune(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      for (let j = 0; j < list.length; j++) {
        if (i !== j && contains(list[j], list[i])) { list.splice(i, 1); break; }
      }
    }
  }
  function split(fr, used, out) {
    if (!overlaps(fr, used)) { out.push(fr); return; }
    if (used.x > fr.x) out.push({ x: fr.x, y: fr.y, w: used.x - fr.x, h: fr.h });
    if (used.x + used.w < fr.x + fr.w) out.push({ x: used.x + used.w, y: fr.y, w: (fr.x + fr.w) - (used.x + used.w), h: fr.h });
    if (used.y > fr.y) out.push({ x: fr.x, y: fr.y, w: fr.w, h: used.y - fr.y });
    if (used.y + used.h < fr.y + fr.h) out.push({ x: fr.x, y: used.y + used.h, w: fr.w, h: (fr.y + fr.h) - (used.y + used.h) });
  }

  let free = [{ x: 0, y: 0, w: binW, h: binH }];
  const placed = [];

  pieces.forEach(function (piece) {
    if (piece._done) return;
    let best = null;
    free.forEach(function (rect) {
      NESTING._fits(piece, rect, kerf, allowRot, grain).forEach(function (cand) {
        const leftoverArea = rect.w * rect.h - (cand.w + kerf) * (cand.h + kerf);
        const leftoverSide = Math.min(rect.w - (cand.w + kerf), rect.h - (cand.h + kerf));
        if (!best || leftoverArea < best.leftoverArea - 1e-6 ||
            (Math.abs(leftoverArea - best.leftoverArea) < 1e-6 && leftoverSide < best.leftoverSide)) {
          best = { rect: rect, cand: cand, leftoverArea: leftoverArea, leftoverSide: leftoverSide };
        }
      });
    });
    if (!best) return;
    const footprint = { x: best.rect.x, y: best.rect.y, w: best.cand.w + kerf, h: best.cand.h + kerf };
    placed.push({ x: best.rect.x, y: best.rect.y, w: best.cand.w, h: best.cand.h, rotated: best.cand.rotated, piece: piece });
    piece._done = true;
    const next = [];
    free.forEach(function (fr) { split(fr, footprint, next); });
    prune(next);
    free = next.filter(function (r) { return r.w > 0.5 && r.h > 0.5; });
  });

  return { placed: placed, leftovers: free };
};

/* ============================================================
   Um bin (chapa nova ou retalho)
   ============================================================ */
NESTING._packBin = function (pieces, binW, binH, params) {
  const tl = Number(params.trim_left_mm) || 0;
  const tt = Number(params.trim_top_mm) || 0;
  const tr = Number(params.trim_right_mm) || 0;
  const tb = Number(params.trim_bottom_mm) || 0;
  const usableW = binW - tl - tr;
  let usableH = binH - tt - tb;
  if (!(usableW > 0) || !(usableH > 0)) return { placed: [], leftovers: [], usedArea: 0 };

  /* PEÇA DE COMPRIMENTO INTEIRO (pedido do Matt, 21/09-12): o filler de
     2700 x 76 sai muito e não precisa ficar em 2700 — pode sair no
     comprimento da chapa inteira (2750), sem refilar os topos: o filler é
     acertado na obra, e cada refile a menos é corte a menos na máquina.
     Regra: peça marcada full_length_ok (LOTES.expandForNesting — hoje, nome
     com "filler") cujo comprimento chega a menos de full_length_tolerance_mm
     (padrão 100) da chapa vira uma FAIXA de largura inteira no topo da
     chapa: x=0, w=binW, só um corte de serra (o rip). O resto da chapa segue
     com refile normal abaixo dela. Não vale pra retalho (__allowFullLength
     false em NESTING._semRefile) — lá a peça encaixa como qualquer outra. */
  const kerfFL = Number(params.kerf_mm) || 0;
  const fullPlaced = [];
  let consumedTop = 0;
  if (params.__allowFullLength !== false && params.strategy !== 'maxrects') {
    const tol = Number(params.full_length_tolerance_mm) || 100;
    pieces
      .filter(function (p) { return !p._done && p.full_length_ok && p.w >= binW - tol && p.w <= binW + 1e-6; })
      .sort(function (a, b) { return b.h - a.h; })
      .forEach(function (p) {
        if (consumedTop + p.h > usableH + 1e-6) return; // não cabe mais faixa
        fullPlaced.push({ x: 0, y: tt + consumedTop, w: binW, h: p.h, rotated: false, piece: p, full_length: true });
        p._done = true;
        consumedTop += p.h + kerfFL;
      });
    usableH -= consumedTop;
    if (!(usableH > 0)) {
      const usedFL = fullPlaced.reduce(function (s, p) { return s + p.w * p.h; }, 0);
      return { placed: fullPlaced, leftovers: [], usedArea: usedFL };
    }
  }
  const yOff = tt + consumedTop; // onde começa a área de encaixe normal

  /* A serra na borda ÚTIL não gasta chapa: _fits cobra peça + kerf em todo
     encaixe, mas o corte que separa a peça do refile da direita/de baixo
     (ou da borda crua) cai NO refile, não na área útil. Sem isto, uma peça
     de 457 não entrava num retalho com 461 úteis e o plano abria OUTRO
     retalho pra ela (Matt, 22/09-14: "pegou 2 retalhos pra tirar 2 peças e
     gerou mais 2 retalhos"). Alargar a área de encaixe em 1 kerf à direita
     e embaixo é exatamente a conta certa: a peça encostada na borda útil
     consome w+kerf ≤ útil+kerf ⇔ w ≤ útil, e duas lado a lado consomem
     w1+kerf+w2+kerf ≤ útil+kerf ⇔ w1+kerf+w2 ≤ útil. As sobras que o
     motor devolve podem passar 1 kerf da borda — _recomputeOffcuts refaz
     tudo a partir da área útil real depois. */
  const packW = usableW + kerfFL, packH = usableH + kerfFL;

  let res;
  if (params.strategy === 'maxrects') {
    res = NESTING._packMaxRects(pieces, packW, packH, params);
  } else if ((params.first_cut || 'auto') === 'auto') {
    /* 'auto' faz o que promete: roda a chapa em vários modos de corte e
       motor de encaixe, fica com o que aproveitou mais.

       Os packers marcam piece._done. Como as tentativas dividem os MESMOS
       objetos, cada uma precisa começar do mesmo estado e o vencedor precisa
       ser reaplicado no fim — daí o snapshot.

       Motor: 'sequential' é a _packGuillotine de sempre (ordem-dependente —
       por isso NESTING.run testa várias ordens de entrada). 'globalbf' é a
       _packGuillotineGlobalBF (ignora ordem, olha toda peça x todo
       retângulo livre a cada passo — mais caro, mais forte). Rodar as DUAS
       pra CADA ordem testada em NESTING.run seria desperdício — globalbf dá
       o mesmo resultado não importa a ordem de entrada (só empate de waste
       muda, e isso é ruído, não ganho real). Por isso NESTING.run manda UMA
       vez só cada, via params.__engine; sem ele (chamada direta de fora,
       ex. pieceFitsSheet indiretamente) testa as duas, como sempre foi. */
    const engine = params.__engine || 'both';
    const snapshot = pieces.map(function (p) { return !!p._done; });
    let best = null;
    function tryMode(fn, mode) {
      pieces.forEach(function (p, i) { p._done = snapshot[i]; });
      const r = fn(pieces, packW, packH, params, mode);
      const area = r.placed.reduce(function (s, p) { return s + p.w * p.h; }, 0);
      /* Critério: mais peças na chapa vence; empatou em peças, mais área. */
      if (!best || r.placed.length > best.count ||
          (r.placed.length === best.count && area > best.area + 1e-6)) {
        best = { res: r, area: area, count: r.placed.length, done: pieces.map(function (p) { return !!p._done; }) };
      }
    }
    if (engine === 'sequential' || engine === 'both') {
      ['shorter', 'horizontal', 'vertical'].forEach(function (mode) { tryMode(NESTING._packGuillotine, mode); });
    }
    if (engine === 'globalbf' || engine === 'both') {
      ['shorter', 'horizontal', 'vertical'].forEach(function (mode) { tryMode(NESTING._packGuillotineGlobalBF, mode); });
    }
    if (engine === 'strips' || engine === 'both') {
      tryMode(NESTING._packStrips, null);
      tryMode(NESTING._packStripsT, null);
    }
    // Motores "isolados" — usados por _repackParcial pra testar UM desenho
    // por vez na chapa meio vazia.
    if (engine === 'stripsH') tryMode(NESTING._packStrips, null);
    if (engine === 'stripsT') tryMode(NESTING._packStripsT, null);
    if (engine === 'seqH') tryMode(NESTING._packGuillotine, 'horizontal');
    if (engine === 'seqV') tryMode(NESTING._packGuillotine, 'vertical');
    if (engine === 'bfH') tryMode(NESTING._packGuillotineGlobalBF, 'horizontal');
    if (engine === 'bfV') tryMode(NESTING._packGuillotineGlobalBF, 'vertical');
    if (!best) return { placed: [], leftovers: [], usedArea: 0 };
    pieces.forEach(function (p, i) { p._done = best.done[i]; });
    res = best.res;
  } else {
    res = NESTING._packGuillotine(pieces, packW, packH, params);
  }

  /* Volta as coordenadas pro sistema da chapa inteira: o desenho e a máquina
     falam em distância da borda física, não da borda depois do refile. */
  const placed = fullPlaced.concat(res.placed.map(function (p) {
    return { x: p.x + tl, y: p.y + yOff, w: p.w, h: p.h, rotated: p.rotated, piece: p.piece };
  }));
  const minW = Number(params.min_offcut_width_mm) || 0;
  const minH = Number(params.min_offcut_height_mm) || 0;
  const leftovers = res.leftovers
    // Recorta na área útil real (o motor encaixou em útil+kerf, ver packW).
    .map(function (r) { return { x: r.x, y: r.y, w: Math.min(r.w, usableW - r.x), h: Math.min(r.h, usableH - r.y) }; })
    .filter(function (r) { return r.w > 0.5 && r.h > 0.5; })
    .filter(function (r) {
      /* Sobra só vira retalho se der pra usar dos DOIS lados — o mínimo é
         medida de peça, não de área. Um filete de 3000x60 não é retalho. */
      return (Math.max(r.w, r.h) >= Math.max(minW, minH) && Math.min(r.w, r.h) >= Math.min(minW, minH));
    })
    .map(function (r) { return { x: r.x + tl, y: r.y + yOff, w: r.w, h: r.h }; })
    .sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });

  const usedArea = placed.reduce(function (s, p) { return s + p.w * p.h; }, 0);
  return { placed: placed, leftovers: leftovers, usedArea: usedArea };
};

/* ============================================================
   Retalhos — recalculados da geometria FINAL da chapa
   ============================================================
   Achado do Matt (21/09-21, chapa 8 do EGGER): no canto inferior direito
   sobrava espaço claramente aproveitável e nenhum retalho aparecia. Motivo:
   os packers devolvem como sobra os retângulos livres do JEITO que o
   encaixe os deixou — fragmentados pelos cortes internos (a cauda de uma
   faixa aqui, o vão de cima de uma coluna ali). Cada pedaço sozinho fica
   abaixo do mínimo (200x200), mas juntos formam um retalho de verdade.

   Aqui a sobra é recalculada do zero: espaço livre = área útil menos a
   pegada de cada peça (peça + kerf à direita/embaixo), como RETÂNGULOS
   MÁXIMOS (mesma divisão do MaxRects), e daí escolhe os maiores que passam
   no mínimo, sem se sobrepor, e — importante pra seccionadora — só os que
   continuam separáveis por corte passante junto com as peças
   (_separavelGuilhotina; sem isso o XML da máquina não fecharia). Roda
   depois do encaixe e da consolidação, pra toda chapa. */
NESTING._separavelGuilhotina = function (items, axis, stuck, eps) {
  eps = eps || 0.15;
  if (items.length <= 1) return true;
  const c = axis === 'y' ? 'y' : 'x', s = axis === 'y' ? 'h' : 'w';
  const perp = axis === 'y' ? 'x' : 'y';
  const sorted = items.slice().sort(function (a, b) { return a[c] - b[c]; });
  const segs = [];
  let cur = null;
  sorted.forEach(function (it) {
    const start = it[c], end = it[c] + it[s];
    if (cur && start >= cur.end - eps) { segs.push(cur); cur = null; }
    if (!cur) cur = { end: end, items: [] };
    cur.items.push(it);
    if (end > cur.end) cur.end = end;
  });
  if (cur) segs.push(cur);
  if (segs.length === 1) return stuck ? false : NESTING._separavelGuilhotina(items, perp, true, eps);
  return segs.every(function (sg) { return sg.items.length === 1 || NESTING._separavelGuilhotina(sg.items, perp, false, eps); });
};

NESTING._recomputeOffcuts = function (sheet, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const minW = Number(params.min_offcut_width_mm) || 0;
  const minH = Number(params.min_offcut_height_mm) || 0;
  const isRetalho = sheet.source === 'retalho';
  const _t = NESTING.trims(params, isRetalho);
  const tl = _t.tl, tt = _t.tt, tr = _t.tr, tb = _t.tb;
  const usable = { x: tl, y: tt, w: sheet.width - tl - tr, h: sheet.height - tt - tb };
  if (!(usable.w > 0) || !(usable.h > 0)) { sheet.offcuts = []; return; }

  function overlaps(a, b) {
    return a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;
  }
  function contains(o, i) {
    return i.x >= o.x - 1e-6 && i.y >= o.y - 1e-6 && i.x + i.w <= o.x + o.w + 1e-6 && i.y + i.h <= o.y + o.h + 1e-6;
  }
  let free = [usable];
  sheet.placed.forEach(function (p) {
    // pegada: a peça + o kerf do corte que a separa (direita/embaixo)
    const fp = { x: p.x, y: p.y, w: p.w + kerf, h: p.h + kerf };
    const next = [];
    free.forEach(function (fr) {
      if (!overlaps(fr, fp)) { next.push(fr); return; }
      if (fp.x > fr.x) next.push({ x: fr.x, y: fr.y, w: fp.x - fr.x, h: fr.h });
      if (fp.x + fp.w < fr.x + fr.w) next.push({ x: fp.x + fp.w, y: fr.y, w: (fr.x + fr.w) - (fp.x + fp.w), h: fr.h });
      if (fp.y > fr.y) next.push({ x: fr.x, y: fr.y, w: fr.w, h: fp.y - fr.y });
      if (fp.y + fp.h < fr.y + fr.h) next.push({ x: fr.x, y: fp.y + fp.h, w: fr.w, h: (fr.y + fr.h) - (fp.y + fp.h) });
    });
    // poda: só retângulos máximos
    for (let i = next.length - 1; i >= 0; i--) {
      for (let j = 0; j < next.length; j++) {
        if (i !== j && contains(next[j], next[i])) { next.splice(i, 1); break; }
      }
    }
    free = next.filter(function (r) { return r.w > 0.5 && r.h > 0.5; });
  });

  /* Convenção de sobra (a mesma dos packers e da exportação, ver
     machine-export._itensDaChapa): o retângulo guardado INCLUI o kerf do
     corte que o separa do vizinho, em todo lado que não é a borda útil da
     chapa. Pra testar mínimo e separabilidade usa a medida LIMPA. */
  const usableR = usable.x + usable.w, usableB = usable.y + usable.h;
  const clean = function (r) {
    return {
      x: r.x, y: r.y,
      w: (r.x + r.w < usableR - 0.15) ? r.w - kerf : r.w,
      h: (r.y + r.h < usableB - 0.15) ? r.h - kerf : r.h
    };
  };
  /* REGRA DO RETALHO (fechada com o Matt, 22/09-7):
     1. Retalho IMPORTANTE = pedaço que a serra solta sozinho (as sobras
        cinza do desenho, NESTING.scrapRects) com lado MAIOR >=
        min_offcut_width_mm e lado MENOR >= min_offcut_height_mm — sem
        olhar se está em pé ou deitado, e sem olhar virada, porque não custa
        nenhuma: ia cair de qualquer jeito. Só passa a ganhar etiqueta OC.
     2. Retalho GRANDE (>= offcut_big_m2, padrão 1 m²) vale cortar em volta:
        entra também como retângulo máximo do espaço livre, desde que
        continue cortável por corte passante junto com as peças. */
  const minLong = Math.max(minW, minH), minShort = Math.min(minW, minH);
  const passaMinimo = function (cl) { return Math.max(cl.w, cl.h) >= minLong && Math.min(cl.w, cl.h) >= minShort; };
  const bigMm2 = (Number(params.offcut_big_m2) > 0 ? Number(params.offcut_big_m2) : 1) * 1e6;
  const pieceItems = sheet.placed.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; });
  const chosen = [];

  // 2) grandes primeiro (maior área), com teste de separabilidade
  free
    .map(function (r) { return { raw: r, clean: clean(r) }; })
    .filter(function (cd) { return cd.clean.w * cd.clean.h >= bigMm2 && passaMinimo(cd.clean); })
    .sort(function (a, b) { return (b.clean.w * b.clean.h) - (a.clean.w * a.clean.h); })
    .forEach(function (cd) {
      if (chosen.some(function (ch) { return overlaps(ch.clean, cd.clean); })) return;
      const test = pieceItems.concat(chosen.map(function (ch) { return ch.clean; }), [cd.clean]);
      if (!NESTING._separavelGuilhotina(test, 'y', false)) return;
      chosen.push(cd);
    });

  // 1) sobras naturais da árvore (com os grandes já escolhidos como itens,
  //    pra sobra não passar por cima deles)
  const natural = NESTING.scrapRects({
    source: sheet.source, width: sheet.width, height: sheet.height,
    placed: sheet.placed, offcuts: chosen.map(function (ch) { return ch.raw; })
  }, params);
  natural
    .map(function (r) { return { raw: r, clean: clean(r) }; })
    .filter(function (cd) { return passaMinimo(cd.clean); })
    .sort(function (a, b) { return (b.clean.w * b.clean.h) - (a.clean.w * a.clean.h); })
    .forEach(function (cd) {
      if (chosen.some(function (ch) { return overlaps(ch.clean, cd.clean); })) return;
      chosen.push(cd);
    });
  /* Retalho encostado na borda DIREITA ou de BAIXO da chapa não precisa
     de refile ali (pedido do Matt, 22/09): a borda crua fica no retalho e
     é refilada só quando ele for usado. Então o retalho cresce até a borda
     física — e a máquina não recebe corte nenhum nessa parte (o XML só
     manda o que está na árvore; a faixa vai até o fim da chapa). Só nos
     lados de longe: o refile de cima/esquerda é o primeiro corte da chapa
     e vale pra todas as peças, não dá pra pular. */
  sheet.offcuts = chosen.map(function (cd) {
    const r = { x: cd.raw.x, y: cd.raw.y, w: cd.raw.w, h: cd.raw.h };
    if (Math.abs((r.x + r.w) - usableR) < 0.15) r.w = sheet.width - r.x;
    if (Math.abs((r.y + r.h) - usableB) < 0.15) r.h = sheet.height - r.y;
    return r;
  });
};

/* ============================================================
   Cortes e VIRADAS de uma chapa
   ============================================================
   Pedido do Matt (22/09-3): "a quantidade de viradas é importante pro
   aproveitamento do tempo de máquina". Na seccionadora, cada sub-retângulo
   que precisa ser cortado no outro sentido é uma virada do material
   (= cada part type=2 do XML da máquina, mais a peça mais estreita que a
   faixa, que também precisa de um corte perpendicular). Aqui conta isso
   direto da geometria, com a MESMA segmentação que a exportação usa
   (componentes conexos por eixo, alternando) — sem gerar XML. */
NESTING.cutStats = function (sheet, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const isRetalho = sheet.source === 'retalho';
  const _t = NESTING.trims(params, isRetalho);
  const usableR = sheet.width - _t.tr;
  const usableB = sheet.height - _t.tb;
  const items = sheet.placed.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; })
    .concat((sheet.offcuts || []).map(function (o) {
      const endX = o.x + o.w, endY = o.y + o.h;
      return {
        x: o.x, y: o.y,
        w: (Math.abs(endX - usableR) > 0.15 && Math.abs(endX - sheet.width) > 0.15) ? o.w - kerf : o.w,
        h: (Math.abs(endY - usableB) > 0.15 && Math.abs(endY - sheet.height) > 0.15) ? o.h - kerf : o.h
      };
    }));
  return NESTING._cutStatsItems(items, sheet.width);
};

/* Mesma conta, sobre uma lista de itens já "limpos" (peça + retalho sem
   kerf), com a largura X da chapa. */
NESTING._cutStatsItems = function (items, sheetWidth) {
  function rec(list, axis, extentW, stuck) {
    if (!list.length) return { cuts: 0, turns: 0 };
    const c = axis === 'y' ? 'y' : 'x', s = axis === 'y' ? 'h' : 'w';
    const perp = axis === 'y' ? 'x' : 'y', ps = perp === 'y' ? 'h' : 'w';
    const sorted = list.slice().sort(function (a, b) { return a[c] - b[c]; });
    const segs = [];
    let cur = null;
    sorted.forEach(function (it) {
      const start = it[c], end = it[c] + it[s];
      if (cur && start >= cur.end - 0.15) { segs.push(cur); cur = null; }
      if (!cur) cur = { start: start, end: end, items: [] };
      cur.items.push(it);
      if (end > cur.end) cur.end = end;
    });
    if (cur) segs.push(cur);
    if (segs.length === 1 && list.length > 1) {
      if (stuck) return { cuts: list.length, turns: list.length };
      const r = rec(list, perp, extentW, true);
      return { cuts: r.cuts + 1, turns: r.turns + 1 };
    }
    let cuts = segs.length, turns = 0;
    segs.forEach(function (sg) {
      if (sg.items.length === 1) {
        if (sg.items[0][ps] < extentW - 0.2) { cuts += 1; turns += 1; }
      } else {
        const r = rec(sg.items, perp, sg.end - sg.start, false);
        cuts += r.cuts; turns += 1 + r.turns;
      }
    });
    return { cuts: cuts, turns: turns };
  }
  return rec(items, 'y', sheetWidth, false);
};

/* ============================================================
   Peças iguais em COLUNA — sobra maior e menos cortes
   ============================================================
   Pedido do Matt (22/09-2): três 607x75 tinham saído duas numa linha e uma
   embaixo, com o retalho espremido do lado; "é muito melhor deixar as 3
   uma abaixo da outra: o retalho sai maior e menos cortes". Passo local,
   por chapa, depois do encaixe: pra cada grupo de peças IGUAIS (mesma
   medida como colocada) espalhadas, tenta empilhá-las numa coluna só
   (ancorada em cada uma delas, por vez), desde que a coluna não invada
   outra peça, continue cortável por corte passante, e o retalho
   recalculado saia MAIOR (área total de sobra aproveitável; empate, maior
   retalho único). Se não melhora, não mexe. */
NESTING._columnizeIdentical = function (sheet, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const isRetalho = sheet.source === 'retalho';
  const _t = NESTING.trims(params, isRetalho);
  const tl = _t.tl, tt = _t.tt, tr = _t.tr, tb = _t.tb;
  const usableR = sheet.width - tr, usableB = sheet.height - tb;

  function overlaps(a, b) {
    return a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;
  }
  function offcutScore(sh) {
    let total = 0, max = 0;
    sh.offcuts.forEach(function (o) { const a = o.w * o.h; total += a; if (a > max) max = a; });
    return { total: total, max: max, turns: NESTING.cutStats(sh, params).turns };
  }
  // Mais sobra; empate, maior retalho único; empate, menos viradas.
  function better(a, b) {
    if (a.total > b.total + 1) return true;
    if (Math.abs(a.total - b.total) > 1) return false;
    if (a.max > b.max + 1) return true;
    if (Math.abs(a.max - b.max) > 1) return false;
    return a.turns < b.turns;
  }

  const groups = {};
  sheet.placed.forEach(function (pl) {
    if (pl.full_length) return;
    const k = Math.round(pl.w * 10) + 'x' + Math.round(pl.h * 10);
    (groups[k] = groups[k] || []).push(pl);
  });

  Object.keys(groups).forEach(function (k) {
    const members = groups[k];
    if (members.length < 2) return;
    const w = members[0].w, h = members[0].h;
    // já estão em coluna? (mesmo x, y consecutivos)
    const xs = new Set(members.map(function (m) { return Math.round(m.x * 10); }));
    if (xs.size === 1) return;

    NESTING._recomputeOffcuts(sheet, params);
    let bestScore = offcutScore(sheet);
    let bestMove = null;
    const others = sheet.placed.filter(function (pl) { return members.indexOf(pl) < 0; })
      .map(function (pl) { return { x: pl.x, y: pl.y, w: pl.w + kerf, h: pl.h + kerf }; });

    members.forEach(function (anchor) {
      const rects = [];
      for (let i = 0; i < members.length; i++) {
        rects.push({ x: anchor.x, y: anchor.y + i * (h + kerf), w: w, h: h });
      }
      const last = rects[rects.length - 1];
      if (last.y + last.h > usableB + 1e-6 || anchor.x + w > usableR + 1e-6) return;
      // coluna não pode invadir peça de fora do grupo (pegada com kerf)
      const colFoot = { x: anchor.x, y: anchor.y, w: w + kerf, h: (last.y + last.h) - anchor.y + kerf };
      if (others.some(function (o) { return overlaps(o, colFoot) && overlaps(o, { x: anchor.x, y: anchor.y, w: w, h: (last.y + last.h) - anchor.y }); })) return;
      // aplica provisoriamente
      const saved = members.map(function (m) { return { x: m.x, y: m.y }; });
      members.forEach(function (m, i) { m.x = rects[i].x; m.y = rects[i].y; });
      const items = sheet.placed.map(function (pl) { return { x: pl.x, y: pl.y, w: pl.w, h: pl.h }; });
      let ok = !items.some(function (a, i) { return items.some(function (b, j) { return i < j && overlaps(a, b); }); });
      if (ok) ok = NESTING._separavelGuilhotina(items, 'y', false);
      if (ok) {
        NESTING._recomputeOffcuts(sheet, params);
        const sc = offcutScore(sheet);
        if (better(sc, bestScore)) { bestScore = sc; bestMove = rects.map(function (r) { return { x: r.x, y: r.y }; }); }
      }
      members.forEach(function (m, i) { m.x = saved[i].x; m.y = saved[i].y; });
    });

    if (bestMove) members.forEach(function (m, i) { m.x = bestMove[i].x; m.y = bestMove[i].y; });
    NESTING._recomputeOffcuts(sheet, params);
  });
};

/* A máquina cabe? Mesma conta que a exportação faz (machine-export.js,
   _montarNo): cada faixa é fatiada em sequência, pos += corte + serra,
   ignorando folga real entre vizinhos. Então uma peça que "cabe" no
   desenho a 0,4 mm da vizinha pode NÃO caber quando a serra entra na
   conta. Confere, só com as peças (retalho a exportação já encolhe):
   refile + Σ cortes + serra×(n−1) ≤ extensão da faixa, em todo nível. */
NESTING._cabeNaMaquina = function (sheet, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const items = sheet.placed.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; });
  function rec(list, axis, extent, layer, stuck, parentCut) {
    if (list.length === 0) return true;
    const c = axis === 'y' ? 'y' : 'x', s = axis === 'y' ? 'h' : 'w';
    const perp = axis === 'y' ? 'x' : 'y';
    const sorted = list.slice().sort(function (a, b) { return a[c] - b[c]; });
    const segs = [];
    let cur = null;
    sorted.forEach(function (it) {
      const start = it[c], end = it[c] + it[s];
      if (cur && start >= cur.end - 0.15) { segs.push(cur); cur = null; }
      if (!cur) cur = { start: start, end: end, items: [] };
      cur.items.push(it);
      if (end > cur.end) cur.end = end;
    });
    if (cur) segs.push(cur);
    if (segs.length === 1 && list.length > 1) {
      if (stuck) return true; // não guilhotinável — outro teste cuida
      // Uma part só (type=2) que vira nó filho no eixo perpendicular — a
      // extensão do filho no eixo dele é a perpendicular deste nó, e o
      // corte deste nó (segs[0]) vira a extensão dos netos.
      const need1 = (layer <= 2 ? segs[0].start : 0) + (segs[0].end - segs[0].start);
      if (need1 > extent + 0.05) return false;
      return rec(list, perp, parentCut, layer + 1, true, segs[0].end - segs[0].start);
    }
    const trim = layer <= 2 ? segs[0].start : 0;
    let need = trim;
    segs.forEach(function (sg, i) { need += (sg.end - sg.start) + (i ? kerf : 0); });
    if (need > extent + 0.05) return false;
    const perpExtent = axis === 'y' ? sheet.width : sheet.height;
    return segs.every(function (sg) {
      if (sg.items.length === 1) return true;
      // Filho fatia no eixo perpendicular; a extensão dele nesse eixo é a
      // extensão perpendicular DESTE nó (raiz: largura da chapa; abaixo, o
      // corte do pai que gerou este nó).
      return rec(sg.items, perp, layer === 1 ? perpExtent : parentCut, layer + 1, false, sg.end - sg.start);
    });
  }
  return rec(items, 'y', sheet.height, 1, false, sheet.width);
};

/* ============================================================
   Compactação — peça pra cima e pra esquerda, sobra num bloco só
   ============================================================
   Pedido do Matt (22/09-10), olhando uma coluna com retalho 681×406 em
   CIMA de três portas e outro 681×245 embaixo: "pode jogar as peças pra
   cima e deixar um só retalho embaixo". Depois da consolidação e da
   colunização a peça pode ficar "flutuando" (a coluna foi ancorada onde
   uma das peças já estava, ou a peça caiu numa sobra no meio da chapa).
   Aqui é gravidade: cada peça sobe até encostar (com serra) na peça de
   cima ou no refile, depois o mesmo pra esquerda. Só comita se continuar
   guilhotinável (senão o XML da máquina não fecha) e se a sobra não
   piorar — normalmente melhora, porque junta dois retalhos num só. */
NESTING._compactar = function (sheet, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const _t = NESTING.trims(params, sheet.source === 'retalho');
  const placed = sheet.placed;
  if (placed.length < 2) return;

  function overlaps(a, b) {
    return a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6;
  }
  function score(sh) {
    let total = 0, max = 0;
    (sh.offcuts || []).forEach(function (o) { const a = o.w * o.h; total += a; if (a > max) max = a; });
    return { total: total, max: max, n: (sh.offcuts || []).length };
  }
  function notWorse(a, b) { // a = depois, b = antes
    if (a.total < b.total - 1) return false;
    if (a.total > b.total + 1) return true;
    if (a.max < b.max - 1) return false;
    return a.n <= b.n;
  }
  function gravity(c, s, pc, ps, floor) {
    // c/s: eixo que move (y/h ou x/w); pc/ps: eixo perpendicular.
    let moved = false, guard = 0;
    for (;;) {
      let any = false;
      placed.slice().sort(function (a, b) { return a[c] - b[c]; }).forEach(function (p) {
        if (p.full_length && c === 'x') return; // comprimento inteiro já encosta na borda
        let lim = floor;
        placed.forEach(function (o) {
          if (o === p) return;
          // projeção perpendicular cruza? (com serra: o.ps + kerf)
          // Cruza na projeção? Sem inflar pela serra: o encaixe guilhotina
          // deixa vizinhos a 0,4 mm (coluna medida pela peça mais estreita) e
          // isso não é "em cima" — a exportação já trata (posições da máquina).
          if (o[pc] < p[pc] + p[ps] - 0.15 && o[pc] + o[ps] > p[pc] + 0.15 && o[c] + o[s] <= p[c] + 1e-6) {
            lim = Math.max(lim, o[c] + o[s] + kerf);
          }
        });
        if (lim < p[c] - 0.05) { p[c] = lim; any = true; moved = true; }
      });
      if (!any || ++guard > 50) break;
    }
    return moved;
  }

  NESTING._recomputeOffcuts(sheet, params);
  const before = score(sheet);
  const saved = placed.map(function (p) { return { x: p.x, y: p.y }; });
  const restore = function () { placed.forEach(function (p, i) { p.x = saved[i].x; p.y = saved[i].y; }); };

  const movedY = gravity('y', 'h', 'x', 'w', _t.tt);
  const movedX = gravity('x', 'w', 'y', 'h', _t.tl);
  if (!movedY && !movedX) return;

  const items = placed.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; });
  const overlap = items.some(function (a, i) { return items.some(function (b, j) { return i < j && overlaps(a, b); }); });
  if (overlap || !NESTING._separavelGuilhotina(items, 'y', false) || !NESTING._cabeNaMaquina(sheet, params)) {
    // Tenta só pra cima (o pedido principal) antes de desistir.
    restore();
    if (!gravity('y', 'h', 'x', 'w', _t.tt)) return;
    const items2 = placed.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; });
    const ov2 = items2.some(function (a, i) { return items2.some(function (b, j) { return i < j && overlaps(a, b); }); });
    if (ov2 || !NESTING._separavelGuilhotina(items2, 'y', false) || !NESTING._cabeNaMaquina(sheet, params)) { restore(); NESTING._recomputeOffcuts(sheet, params); return; }
  }
  NESTING._recomputeOffcuts(sheet, params);
  if (!notWorse(score(sheet), before)) { restore(); NESTING._recomputeOffcuts(sheet, params); }
};

/* ============================================================
   Chapa meio vazia — sobra COMPRIDA em vez de bloco quadrado
   ============================================================
   Pedido do Matt (22/09-11), olhando a última chapa de um plano (peças
   ocupando a metade esquerda, retalho 1216×1540 na direita): "nesse caso
   de meia chapa é sempre melhor um retalho maior no comprimento — melhor
   armazenagem e aproveitamento — do que um quadrado grande". Ou seja: as
   peças em faixas no TOPO, atravessando a chapa, e a sobra numa tira de
   comprimento inteiro embaixo.

   O motor da chapa é escolhido pro plano todo (ver _solve), e o que é
   melhor nas chapas cheias não é o melhor na última. Então, só nas chapas
   novas com pouco uso (até PARCIAL_MAX de área), refaz o encaixe das
   MESMAS peças com cada motor isolado. Entre os desenhos cujo maior
   retalho único tem pelo menos 90% da área do melhor possível (tamanho
   primeiro — uma meia chapa vale mais que uma tira fina), fica com o de
   maior COMPRIMENTO (lado no eixo X da chapa); empate, o maior retalho;
   empate, menos viradas; empate, mais sobra total. Nunca perde peça e
   nunca troca por um desenho que jogue fora mais material (3% da chapa
   de tolerância). Roda SÓ no plano vencedor (ver _solve) — mexer nos
   candidatos mudava quem ganhava e o plano inteiro vinha diferente
   ("tinha entendido que mudaria só a última chapa", Matt 22/09-13). */
NESTING.PARCIAL_MAX = 0.6;
NESTING.PARCIAL_AREA_MIN = 0.9; // retalho comprido só ganha se tiver ≥ 90% da área do maior retalho possível
NESTING._repackParcial = function (sheet, params) {
  if (sheet.source !== 'chapa_nova') return;
  if (!(sheet.usedArea / (sheet.width * sheet.height) <= NESTING.PARCIAL_MAX)) return;
  if (sheet.placed.length < 2) return;
  if (sheet.placed.some(function (pl) { return pl.full_length; })) return; // faixa inteira já manda no desenho
  const PERDA_TOL = 0.03 * sheet.width * sheet.height;

  function scoreOf(sh) {
    let len = 0, total = 0, max = 0;
    (sh.offcuts || []).forEach(function (o) { const a = o.w * o.h; total += a; if (a > max) max = a; if (o.w > len) len = o.w; });
    return { len: len, max: max, total: total, turns: NESTING.cutStats(sh, params).turns };
  }

  NESTING._recomputeOffcuts(sheet, params);
  const pieces = sheet.placed.map(function (pl) { return pl.piece; });
  if (pieces.some(function (p) { return !p; })) return;
  const base = scoreOf(sheet);
  const trials = [{ placed: sheet.placed, offcuts: sheet.offcuts, usedArea: sheet.usedArea, score: base, atual: true }];

  const orders = [
    pieces.slice().sort(NESTING._sortHeightThenWidthDesc),
    pieces.slice().sort(NESTING._sortLongestSideDesc),
    pieces.slice().sort(NESTING._sortAreaDesc)
  ];
  ['stripsH', 'stripsT', 'seqH', 'seqV', 'bfH', 'bfV'].forEach(function (engine) {
    orders.forEach(function (order) {
      order.forEach(function (p) { p._done = false; });
      const runParams = Object.assign({}, params, { __engine: engine, first_cut: 'auto' });
      const res = NESTING._packBin(order, sheet.width, sheet.height, runParams);
      if (res.placed.length !== pieces.length) return;
      const trial = { source: sheet.source, width: sheet.width, height: sheet.height, placed: res.placed, offcuts: res.leftovers, usedArea: res.usedArea };
      NESTING._recomputeOffcuts(trial, params);
      NESTING._compactar(trial, params);
      NESTING._recomputeOffcuts(trial, params);
      const sc = scoreOf(trial);
      if (sc.total < base.total - PERDA_TOL) return; // nunca joga fora mais material que o desenho atual
      trials.push({ placed: trial.placed, offcuts: trial.offcuts, usedArea: trial.usedArea, score: sc });
    });
  });
  pieces.forEach(function (p) { p._done = true; });

  /* Escolha (ajuste 22/09-13, depois do Matt achar que "ficou pior": a
     primeira versão mandava o comprimento na frente de tudo e trocou um
     retalho de meia chapa por uma tira comprida e fina). Agora: primeiro
     o TAMANHO — só disputa quem tem o maior retalho único com pelo menos
     PARCIAL_AREA_MIN da área do maior retalho possível; entre esses, o
     mais comprido; empate, maior retalho; empate, menos viradas; empate,
     mais sobra total. */
  const bestMax = trials.reduce(function (m, t) { return Math.max(m, t.score.max); }, 0);
  const elegiveis = trials.filter(function (t) { return t.score.max >= bestMax * NESTING.PARCIAL_AREA_MIN - 1; });
  elegiveis.sort(function (a, b) {
    if (Math.abs(a.score.len - b.score.len) > 1) return b.score.len - a.score.len;
    if (Math.abs(a.score.max - b.score.max) > 1) return b.score.max - a.score.max;
    if (a.score.turns !== b.score.turns) return a.score.turns - b.score.turns;
    if (Math.abs(a.score.total - b.score.total) > 1) return b.score.total - a.score.total;
    return (a.atual ? 0 : 1) - (b.atual ? 0 : 1); // empate total: fica como está
  });
  const best = elegiveis[0];
  if (best && !best.atual) {
    sheet.placed = best.placed; sheet.offcuts = best.offcuts; sheet.usedArea = best.usedArea;
    sheet.usedPct = best.usedArea / (sheet.width * sheet.height);
  }
};

/* ============================================================
   Consolidação — esvaziar a chapa nova mais fraca pras sobras das outras
   ============================================================
   Achado do Matt (21/09, comparando com outro software de nesting que ele
   usa): o plano daqui saiu com "15 chapas de birch, 14 e uma peça" — uma
   chapa nova inteira aberta por causa de UMA peça que não coube em lugar
   nenhum, enquanto sobrava retalho aproveitável nas chapas já cortadas. O
   pack guillotina normal (_packBin/_packGuillotine acima) nunca revisita uma
   chapa depois de fechada — segue reto pra próxima. Esta função é o passo
   que falta: depois do plano pronto, pega a chapa NOVA com menos peça (a
   mais "fraca" — normalmente é a última, quase vazia) e tenta encaixar TODA
   peça dela nas sobras (sh.offcuts) das OUTRAS chapas do mesmo plano. Só
   comita se 100% das peças acharem lugar — sem isso ela continua cabendo
   sozinha em lugar nenhum, e aí não mexe em nada (evita meio-termo confuso:
   peça espalhada por aí sem sumir a chapa que devia sumir). Repete até não
   conseguir mais — pode esvaziar mais de uma chapa em cascata. */
NESTING._consolidate = function (sheets, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const allowRot = params.allow_rotation !== false;
  const grain = params.respect_grain !== false;
  const minW = Number(params.min_offcut_width_mm) || 0;
  const minH = Number(params.min_offcut_height_mm) || 0;

  function tryRelocate(candidateIdx) {
    if (sheets.length < 2) return false;
    const candidate = sheets[candidateIdx];
    if (candidate.source !== 'chapa_nova') return false;

    /* Cópia de trabalho das sobras de TODA outra chapa — só vira definitivo
       se a candidata esvaziar 100%; senão é descartada e nada muda. */
    const targets = sheets
      .map(function (sh, i) { return { i: i, sh: sh }; })
      .filter(function (t) { return t.i !== candidateIdx; });
    const workingFree = targets.map(function (t) {
      return t.sh.offcuts.map(function (r) { return { x: r.x, y: r.y, w: r.w, h: r.h }; });
    });
    const newPlacedByTarget = targets.map(function () { return []; });

    /* Maior primeiro — mesma lógica do packer principal: a peça difícil
       falha logo, sem gastar tempo com as fáceis antes. */
    const toPlace = candidate.placed.slice().sort(function (a, b) {
      return Math.max(b.w, b.h) - Math.max(a.w, a.h) || (b.w * b.h) - (a.w * a.h);
    });

    for (let p = 0; p < toPlace.length; p++) {
      const piece = toPlace[p].piece;
      let best = null;
      for (let t = 0; t < targets.length; t++) {
        const free = workingFree[t];
        for (let r = 0; r < free.length; r++) {
          const rect = free[r];
          NESTING._fits(piece, rect, kerf, allowRot, grain).forEach(function (cand) {
            const waste = rect.w * rect.h - (cand.w + kerf) * (cand.h + kerf);
            if (!best || waste < best.waste - 1e-6) best = { t: t, r: r, rect: rect, cand: cand, waste: waste };
          });
        }
      }
      /* Uma peça só que não achou lugar já aborta a consolidação inteira —
         "quase toda a chapa some" não é a regra: ou some 100%, ou fica igual. */
      if (!best) return false;

      const rect = best.rect;
      const cw = best.cand.w + kerf, ch = best.cand.h + kerf;
      newPlacedByTarget[best.t].push({
        x: rect.x, y: rect.y, w: best.cand.w, h: best.cand.h, rotated: best.cand.rotated, piece: piece
      });
      const restRight = rect.w - cw, restBottom = rect.h - ch;
      const horizontal = restBottom <= restRight;
      const free = workingFree[best.t];
      free.splice(best.r, 1);
      if (horizontal) {
        if (restRight > 0.5) free.push({ x: rect.x + cw, y: rect.y, w: restRight, h: ch });
        if (restBottom > 0.5) free.push({ x: rect.x, y: rect.y + ch, w: rect.w, h: restBottom });
      } else {
        if (restRight > 0.5) free.push({ x: rect.x + cw, y: rect.y, w: restRight, h: rect.h });
        if (restBottom > 0.5) free.push({ x: rect.x, y: rect.y + ch, w: cw, h: restBottom });
      }
      free.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
    }

    /* Todas acharam lugar — comita nas chapas de destino e apaga a candidata. */
    targets.forEach(function (t, ti) {
      if (!newPlacedByTarget[ti].length) return;
      t.sh.placed = t.sh.placed.concat(newPlacedByTarget[ti]);
      t.sh.offcuts = workingFree[ti]
        .filter(function (r) { return r.w >= minW && r.h >= minH; })
        .sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });
      t.sh.usedArea = t.sh.placed.reduce(function (s, pp) { return s + pp.w * pp.h; }, 0);
      t.sh.usedPct = t.sh.usedArea / (t.sh.width * t.sh.height);
    });
    sheets.splice(candidateIdx, 1);
    return true;
  }

  /* Antes só tentava a chapa "mais fraca" (menos peça) e desistia de tudo
     se ELA não esvaziasse 100% — mas às vezes a mais fraca tem uma peça
     grande que não cabe em canto nenhum, enquanto a 2ª ou 3ª mais fraca
     esvaziaria numa boa. Pedido do Matt (21/09-5, depois de ver 13,5
     chapas em vez de 15 e perguntar se dava pra melhorar mais): agora
     tenta TODAS as chapas nova candidatas por rodada, da mais fácil (menos
     peça) pra mais difícil, e só desiste quando NENHUMA da rodada
     conseguiu esvaziar. */
  let guard = 0;
  let changed = true;
  while (changed && guard++ < 400) {
    changed = false;
    const candidates = [];
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].source === 'chapa_nova') candidates.push(i);
    }
    candidates.sort(function (a, b) {
      return sheets[a].placed.length - sheets[b].placed.length || sheets[a].usedArea - sheets[b].usedArea;
    });
    for (let c = 0; c < candidates.length; c++) {
      if (tryRelocate(candidates[c])) { changed = true; break; } // índices mudaram — recomeça a rodada
    }
  }
};

/* ============================================================
   Ordens de entrada testadas pelo 'run' abaixo
   ============================================================ */
NESTING._sortLongestSideDesc = function (a, b) {
  /* Maior lado primeiro (desempate por área) — a ordem original daqui,
     regra clássica pra evitar peça grande sobrar pro fim. */
  return Math.max(b.w, b.h) - Math.max(a.w, a.h) || (b.w * b.h) - (a.w * a.h);
};
NESTING._sortAreaDesc = function (a, b) {
  return (b.w * b.h) - (a.w * a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h);
};
NESTING._sortHeightThenWidthDesc = function (a, b) {
  return b.h - a.h || b.w - a.w;
};

/* ============================================================
   Busca GRASP simplificada — muitas ordens "quase gulosas", fica com a
   melhor
   ============================================================
   Pedido do Matt (21/09-5): 3 ordens fixas tiraram de 15 pra 13,5 chapas,
   mas ele quer mais. Software de nesting de verdade ganha aproveitamento
   sobretudo testando MUITAS ordens de entrada, não só um punhado de regras
   fixas — o packer guilhotina BAF é bem sensível a QUEM entra primeiro. Em
   vez de mexer no packer (ele já está correto e é o que a seccionadora
   consegue cortar), a alavanca mais segura é testar mais combinações de
   ordem e ficar com a que sobrar menos chapa.

   Random puro (embaralhar tudo) sai pior que as 3 ordens fixas na prática —
   perde a tendência "maior primeiro" que evita peça grande sobrar pro
   final. Por isso aqui é GRASP: parte de uma das 3 ordens boas e embaralha
   só DENTRO de janelinhas pequenas (3 a 6 peças), mantendo a tendência
   decrescente geral mas variando o desempate entre peças de tamanho
   parecido — é nesse desempate que mora a diferença entre 14 e 15 chapas. */
NESTING._mulberry32 = function (seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
NESTING._perturbedOrder = function (sortedPieces, seed) {
  const rng = NESTING._mulberry32(seed);
  const arr = sortedPieces.slice();
  const windowSize = 3 + Math.floor(rng() * 4); // 3..6
  for (let start = 0; start < arr.length; start += windowSize) {
    const end = Math.min(start + windowSize, arr.length);
    for (let i = end - 1; i > start; i--) {
      const j = start + Math.floor(rng() * (i - start + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
  }
  return arr;
};
/* Quantas tentativas extras (além das 3 ordens fixas) valem a pena pelo
   tamanho do lote — cada tentativa custa pouco (guilhotina BAF + auto-corte
   + consolidação), mas em lote de centenas de peça, dezenas de tentativas
   ainda saem rápido; em lote gigante (que a Legno nunca teve) reduz pra não
   travar a tela. */
NESTING._extraTries = function (n) {
  /* Reduzido depois de medir retorno decrescente: acima de ~15 tentativas
     extras o ganho por tentativa fica muito pequeno perto do custo (ver
     comentário grande em NESTING.run) — a virada de qualidade maior veio do
     motor globalbf (_packGuillotineGlobalBF), que roda só 1x (não depende
     de ordem), não de testar dezenas de ordens diferentes. */
  if (n <= 150) return 15;
  if (n <= 400) return 8;
  if (n <= 900) return 3;
  if (n <= 1500) return 1;
  return 0;
};

/* Um plano completo (retalhos + chapas novas até acabar a lista), pra uma
   ORDEM de peças já definida. Extraído do antigo NESTING.run pra poder ser
   chamado várias vezes com ordens diferentes (ver run() abaixo). */
/* Refile por tipo de chapa. Chapa nova usa os quatro trims dos parâmetros;
   RETALHO usa um refile próprio, menor (trim_retalho_mm, padrão 15 mm), nos
   quatro lados — pedido do Matt (22/09-9): "retalho não tá com trim, e é
   extremamente necessário; o trim do retalho deve ser diferente do trim da
   máquina, usamos normalmente 15 mm". (Antes, 21/09-11, retalho ia sem
   refile nenhum — revertido.) */
NESTING.RETALHO_TRIM_DEFAULT_MM = 15;
NESTING.retalhoTrim = function (params) {
  const v = Number(params && params.trim_retalho_mm);
  return (params && params.trim_retalho_mm !== undefined && params.trim_retalho_mm !== null && params.trim_retalho_mm !== '' && isFinite(v) && v >= 0) ? v : NESTING.RETALHO_TRIM_DEFAULT_MM;
};
NESTING.trims = function (params, isRetalho) {
  if (isRetalho) { const t = NESTING.retalhoTrim(params); return { tl: t, tt: t, tr: t, tb: t }; }
  return {
    tl: Number(params.trim_left_mm) || 0, tt: Number(params.trim_top_mm) || 0,
    tr: Number(params.trim_right_mm) || 0, tb: Number(params.trim_bottom_mm) || 0
  };
};
NESTING._paramsRetalho = function (params) {
  const t = NESTING.retalhoTrim(params);
  return Object.assign({}, params, { trim_left_mm: t, trim_right_mm: t, trim_top_mm: t, trim_bottom_mm: t, __allowFullLength: false });
};
NESTING._semRefile = NESTING._paramsRetalho; // nome antigo

NESTING._runOnce = function (pieces, offcutBins, newSheet, params) {
  const sheets = [];

  /* 1) RETALHOS PRIMEIRO. Um retalho que não recebeu nenhuma peça NÃO é
     consumido — ele nem vira chapa do plano, continua no estoque. */
  if (params.use_offcuts !== false) {
    /* Retalho leva o refile PRÓPRIO (trim_retalho_mm, ver NESTING.trims) —
       menor que o da chapa nova, mas obrigatório. Vale aqui, no desenho
       (sheetSVG) e na exportação pra máquina (machine-export.js). */
    const offcutParams = NESTING._paramsRetalho(params);
    (offcutBins || []).forEach(function (bin) {
      if (pieces.every(function (p) { return p._done; })) return;
      const res = NESTING._packBin(pieces, bin.w, bin.h, offcutParams);
      if (res.placed.length === 0) return;
      sheets.push({
        source: 'retalho',
        offcut: bin,
        sheet_size_id: null,
        sheet_size_name: bin.code || 'Retalho',
        width: bin.w, height: bin.h,
        placed: res.placed, offcuts: res.leftovers,
        usedArea: res.usedArea,
        usedPct: res.usedArea / (bin.w * bin.h)
      });
    });
  }

  /* 2) CHAPA NOVA até acabar. O guard de segurança evita laço infinito se por
     algum motivo uma peça não couber nem na chapa inteira (a tela já filtra
     isso antes com pieceFitsSheet, mas dado ruim acontece). */
  let guard = 0;
  while (!pieces.every(function (p) { return p._done; })) {
    if (++guard > 500) break;
    const res = NESTING._packBin(pieces, newSheet.w, newSheet.h, params);
    if (res.placed.length === 0) break;
    sheets.push({
      source: 'chapa_nova',
      offcut: null,
      sheet_size_id: newSheet.sheet_size_id || null,
      sheet_size_name: newSheet.name || 'Chapa',
      width: newSheet.w, height: newSheet.h,
      placed: res.placed, offcuts: res.leftovers,
      usedArea: res.usedArea,
      usedPct: res.usedArea / (newSheet.w * newSheet.h)
    });
  }

  return sheets;
};

/* ============================================================
   Entrada principal
   ============================================================ */
NESTING._solve = function (basePiecesIn, offcutBins, newSheet, params) {
  const basePieces = (basePiecesIn || []).slice();

  /* Testa MUITAS ordens de entrada e fica com a que sobrar menos chapa nova
     no final (já contando a consolidação acima) — mesma ideia do
     first_cut='auto' dentro de cada chapa (tenta 3 eixos de corte e fica com
     o melhor), só que um nível acima: aqui quem varia é a ORDEM das peças
     entrando no plano inteiro, não o corte dentro de uma chapa só. Pedido do
     Matt (21/09): o software que ele usa noutra máquina aproveita bem mais
     material (12,5 chapas contra 15, no mesmo lote de birch — as 3 ordens
     fixas da primeira versão já tinham fechado boa parte, pra 13,5, e ele
     pediu pra tentar "combinações" e melhorar mais). Rodar mais ordens e
     comparar o resultado final é o jeito mais seguro de fechar essa
     distância sem trocar o motor de corte guilhotina (que é obrigatório
     aqui — ver cabeçalho do arquivo). As ordens extras vêm de
     NESTING._perturbedOrder — ver comentário lá em cima do motivo de não
     ser embaralho puro. */
  const baseOrders = [
    basePieces.slice().sort(NESTING._sortLongestSideDesc),
    basePieces.slice().sort(NESTING._sortAreaDesc),
    basePieces.slice().sort(NESTING._sortHeightThenWidthDesc)
  ];
  const orders = baseOrders.slice();
  // Modo demorado (params.deep_search): 6x mais ordens perturbadas.
  const extraTries = NESTING._extraTries(basePieces.length) * (params.deep_search ? (Number(params.deep_factor) || 6) : 1);
  for (let t = 0; t < extraTries; t++) {
    /* Sempre parte de uma das 3 ordens BOAS (nunca de uma já perturbada —
       perturbar em cima de perturbação vai desandando a tendência
       decrescente aos poucos e piora, não ajuda). */
    const base = baseOrders[t % baseOrders.length];
    orders.push(NESTING._perturbedOrder(base, 1000 + t));
  }
  /* Cada item da lista de candidatos: uma ordem de peça + qual motor de
     encaixe usar dentro de cada chapa (ver comentário grande em
     _packBin/'auto' sobre por que globalbf roda só 1x, fora do laço de
     ordens — ele ignora a ordem de entrada, então testá-lo de novo pra
     cada ordem seria custo sem ganho). */
  const candidates = orders.map(function (pieces) { return { pieces: pieces, engine: 'sequential' }; });
  candidates.push({ pieces: baseOrders[0], engine: 'globalbf' });
  /* Motor de faixas (ver _packStrips): a ordem de entrada influencia só o
     desempate, então roda com as 3 ordens base (barato) — e, no modo
     demorado, também com as ordens perturbadas. */
  baseOrders.forEach(function (o) { candidates.push({ pieces: o, engine: 'strips' }); });
  if (params.deep_search) {
    orders.slice(baseOrders.length).forEach(function (o) { candidates.push({ pieces: o, engine: 'strips' }); });
  }

  let winner = null;
  candidates.forEach(function (c) {
    const pieces = c.pieces;
    const runParams = Object.assign({}, params, { __engine: c.engine });
    pieces.forEach(function (p) { p._done = false; });
    const sheets = NESTING._runOnce(pieces, offcutBins, newSheet, runParams);
    // Sobras máximas ANTES da consolidação (mais espaço pra realocar) e
    // DEPOIS (a realocação muda a geometria).
    sheets.forEach(function (sh) { NESTING._recomputeOffcuts(sh, runParams); });
    NESTING._consolidate(sheets, runParams);
    sheets.forEach(function (sh) { NESTING._columnizeIdentical(sh, runParams); });
    sheets.forEach(function (sh) { NESTING._recomputeOffcuts(sh, runParams); });
    const unplaced = pieces.filter(function (p) { return !p._done; });
    const sheetsNew = sheets.filter(function (s) { return s.source === 'chapa_nova'; }).length;
    const usedArea = sheets.reduce(function (s, sh) { return s + sh.usedArea; }, 0);
    const totalArea = sheets.reduce(function (s, sh) { return s + sh.width * sh.height; }, 0);
    // Desempate por perda REAL (desconta o que vira retalho): entre dois
    // planos com o mesmo número de chapas, ganha o que deixa sobra mais
    // aproveitável — pedido do Matt (21/09-21).
    const offcutArea = sheets.reduce(function (s, sh) { return s + sh.offcuts.reduce(function (a, o) { return a + o.w * o.h; }, 0); }, 0);
    const wastePct = totalArea > 0 ? ((totalArea - usedArea - offcutArea) / totalArea) : 0;
    const turns = sheets.reduce(function (s, sh) { return s + NESTING.cutStats(sh, runParams).turns; }, 0);
    const candidate = { pieces: pieces, sheets: sheets, unplaced: unplaced, sheetsNew: sheetsNew, wastePct: wastePct, turns: turns };
    /* Vencedor: primeiro NUNCA perder peça (menos unplaced sempre ganha),
       depois menos chapa nova, depois menos perda REAL de material. */
    if (!winner ||
        candidate.unplaced.length < winner.unplaced.length ||
        (candidate.unplaced.length === winner.unplaced.length && candidate.sheetsNew < winner.sheetsNew) ||
        (candidate.unplaced.length === winner.unplaced.length && candidate.sheetsNew === winner.sheetsNew &&
          candidate.wastePct < winner.wastePct - 1e-6) ||
        // Mesma chapa e mesma perda real (até 0,5 ponto): menos viradas
        // ganha — tempo de máquina (pedido do Matt, 22/09-3).
        (candidate.unplaced.length === winner.unplaced.length && candidate.sheetsNew === winner.sheetsNew &&
          Math.abs(candidate.wastePct - winner.wastePct) <= 0.005 && candidate.turns < winner.turns)) {
      winner = candidate;
    }
  });

  /* Limpa a flag de controle das peças da ordem vencedora — as OUTRAS ordens
     usam os MESMOS objetos de peça (mesma referência), então uma limpeza só
     já basta; ela também evita a flag vazar pro resto do app (mesma classe
     de cuidado do bug do order_item_id: nunca deixar campo de controle
     interno grudado num objeto que outro código pode ler/gravar depois). */
  /* Acabamento SÓ no vencedor — compactação (peça pra cima/esquerda) e
     redesenho da chapa meio vazia. Fora do laço de candidatos de propósito:
     dentro dele mudava a pontuação e outro candidato ganhava, e o plano
     inteiro vinha com peças diferentes em cada chapa. Aqui o plano é o
     mesmo de antes; só a forma da sobra muda. */
  winner.sheets.forEach(function (sh) { sh.placed.forEach(function (pl) { if (pl.piece) pl.piece._done = true; }); });
  winner.sheets.forEach(function (sh) { NESTING._compactar(sh, params); });
  winner.sheets.forEach(function (sh) { NESTING._repackParcial(sh, params); });
  winner.sheets.forEach(function (sh) { NESTING._recomputeOffcuts(sh, params); });
  winner.pieces.forEach(function (p) { delete p._done; });
  if (!winner.sheets.length && !basePieces.length) winner.sheets = [];
  return winner;
};

/* ============================================================
   Empilhamento — 2 chapas com o MESMO desenho, cortadas de uma vez
   ============================================================
   Pedido do Matt (21/09-13): a seccionadora corta até 2 chapas empilhadas
   quando o plano das duas é idêntico — metade dos ciclos de máquina pro
   mesmo material. Peça é "igual" pra isso se tem a mesma medida e veio (o
   material já é o mesmo, o plano roda por material) — módulo, cliente,
   etiqueta não importam: cada peça física continua com a sua etiqueta.

   Como: casa as peças em PARES de mesma medida; cada par vira UMA peça
   representante e o nesting roda só com os representantes (só em chapa
   nova — retalho é único, não empilha). Cada chapa desse resultado vira
   DUAS chapas físicas com o mesmo desenho (a de cima leva a peça A de cada
   par, a de baixo a peça B). As sobras (ímpares + pares que não valeram a
   pena) rodam num plano normal, solto.

   "Valer a pena": a chapa duplicada mais fraca (última, meio vazia)
   duplica também o desperdício. Então testa k = todas as chapas
   empilhadas, k-1, k-2... (as mais fracas voltam pro plano solto, com as
   duas cópias de cada par) e fica com o MENOR total de chapas físicas;
   empate, mais empilhamento. E no fim compara com o plano sem empilhar
   nenhum — nunca gasta chapa a mais pra ganhar tempo de máquina.

   Sem coluna nova no banco: uma pilha é só 2 chapas consecutivas do mesmo
   material com geometria idêntica (ver NESTING.detectStacks) — o desenho,
   a etiqueta e a exportação detectam isso pela geometria. */
NESTING.STACK_MAX = 2;

NESTING._pieceStackKey = function (p) {
  return [Math.round(p.w * 10), Math.round(p.h * 10), p.grain ? 1 : 0, p.full_length_ok ? 1 : 0].join('|');
};

NESTING._solveStacked = function (basePieces, offcutBins, newSheet, params) {
  const groups = {};
  basePieces.forEach(function (p) {
    const k = NESTING._pieceStackKey(p);
    (groups[k] = groups[k] || []).push(p);
  });
  const reps = [];
  const singles = [];
  Object.keys(groups).forEach(function (k) {
    const list = groups[k];
    let i = 0;
    for (; i + 1 < list.length; i += 2) {
      const a = list[i], b = list[i + 1];
      reps.push(Object.assign({}, a, { key: a.key + '+' + b.key, _stack: [a, b] }));
    }
    if (i < list.length) singles.push(list[i]);
  });
  if (!reps.length) return null;

  const repSol = NESTING._solve(reps, [], newSheet, params);
  // Só chapa nova entra no empilhamento; ordena da mais cheia pra mais vazia.
  const repSheets = repSol.sheets.slice().sort(function (a, b) { return b.usedPct - a.usedPct; });
  const repUnplacedPieces = [];
  repSol.unplaced.forEach(function (r) { repUnplacedPieces.push(r._stack[0], r._stack[1]); });

  let best = null;
  const cands = [];
  const kMax = repSheets.length;
  // Testa todos os k se forem poucos; senão, os 6 maiores e o zero.
  const ks = [];
  for (let k = kMax; k >= 0; k--) { if (kMax <= 8 || k > kMax - 6 || k === 0) ks.push(k); }
  ks.forEach(function (k) {
    const loose = singles.slice().concat(repUnplacedPieces);
    for (let i = k; i < repSheets.length; i++) {
      repSheets[i].placed.forEach(function (pl) { loose.push(pl.piece._stack[0], pl.piece._stack[1]); });
    }
    const looseSol = loose.length ? NESTING._solve(loose, offcutBins, newSheet, params) : { sheets: [], unplaced: [], sheetsNew: 0, wastePct: 0 };
    const total = 2 * k + looseSol.sheetsNew;
    const cand = { k: k, looseSol: looseSol, total: total, unplaced: looseSol.unplaced.length };
    if (!best || cand.unplaced < best.unplaced ||
        (cand.unplaced === best.unplaced && cand.total < best.total) ||
        (cand.unplaced === best.unplaced && cand.total === best.total && cand.k > best.k)) best = cand;
    cands.push(cand);
  });
  /* "Empilhar mais" (params.stack_mode === 'empilhar'): entre os candidatos
     que não perdem peça e gastam no máximo `extraSheets` chapa(s) a mais
     que o melhor, fica com o de MAIS pilhas. Padrão ('material'): só o
     melhor em chapa. */
  if (best && params.stack_mode === 'empilhar') {
    const extraSheets = 1;
    cands.forEach(function (cd) {
      if (cd.unplaced === best.unplaced && cd.total <= best.total + extraSheets && cd.k > best.k) best = cd;
    });
  }
  if (!best || best.k === 0) return null;

  // Monta as chapas físicas: cada chapa de representantes vira 2.
  const sheets = [];
  for (let i = 0; i < best.k; i++) {
    const rs = repSheets[i];
    for (let layer = 0; layer < 2; layer++) {
      sheets.push({
        source: 'chapa_nova', offcut: null,
        sheet_size_id: rs.sheet_size_id, sheet_size_name: rs.sheet_size_name,
        width: rs.width, height: rs.height,
        placed: rs.placed.map(function (pl) {
          return { x: pl.x, y: pl.y, w: pl.w, h: pl.h, rotated: pl.rotated, full_length: pl.full_length, piece: pl.piece._stack[layer] };
        }),
        offcuts: rs.offcuts.map(function (o) { return { x: o.x, y: o.y, w: o.w, h: o.h }; }),
        usedArea: rs.usedArea, usedPct: rs.usedPct,
        stack_of: 2,
        stack_dup: layer === 1 // a 2ª chapa da pilha: cortada junto, não conta corte/virada de novo
      });
    }
  }
  best.looseSol.sheets.forEach(function (s) { sheets.push(s); });
  basePieces.forEach(function (p) { delete p._done; });
  return {
    sheets: sheets,
    unplaced: best.looseSol.unplaced,
    sheetsNew: sheets.filter(function (s) { return s.source === 'chapa_nova'; }).length,
    stacks: best.k
  };
};

NESTING.run = function (opts) {
  const params = opts.params || {};
  const newSheet = opts.newSheet;
  const basePieces = (opts.pieces || []).slice();

  const plain = NESTING._solve(basePieces, opts.offcutBins, newSheet, params);
  let chosen = plain;
  let stacks = 0;
  const stackMode = params.stack_mode || 'material';
  if (NESTING.STACK_MAX >= 2 && stackMode !== 'nenhum' && basePieces.length >= 2) {
    const st = NESTING._solveStacked(basePieces, opts.offcutBins, newSheet, params);
    // Empilhado só ganha se não perder peça e não gastar chapa a mais —
    // ou, em "empilhar mais", até 1 chapa a mais (ver _solveStacked).
    const extra = stackMode === 'empilhar' ? 1 : 0;
    if (st && st.unplaced.length <= plain.unplaced.length && st.sheetsNew <= plain.sheetsNew + extra) {
      chosen = st;
      stacks = st.stacks;
    }
  }
  basePieces.forEach(function (p) { delete p._done; });

  const sheets = chosen.sheets;
  const unplaced = chosen.unplaced;
  const totalArea = sheets.reduce(function (s, sh) { return s + sh.width * sh.height; }, 0);
  const usedArea = sheets.reduce(function (s, sh) { return s + sh.usedArea; }, 0);
  const offcutArea = sheets.reduce(function (s, sh) { return s + sh.offcuts.reduce(function (a, o) { return a + o.w * o.h; }, 0); }, 0);

  return {
    sheets: sheets,
    unplaced: unplaced,
    summary: {
      sheets_new: sheets.filter(function (s) { return s.source === 'chapa_nova'; }).length,
      offcuts_used: sheets.filter(function (s) { return s.source === 'retalho'; }).length,
      offcuts_generated: sheets.reduce(function (s, sh) { return s + sh.offcuts.length; }, 0),
      pieces_placed: sheets.reduce(function (s, sh) { return s + sh.placed.length; }, 0),
      pieces_unplaced: unplaced.length,
      stacks: stacks,
      // Cortes e viradas de MÁQUINA: pilha de 2 corta junto, conta 1x.
      cuts: sheets.reduce(function (s, sh) { return s + (sh.stack_dup ? 0 : NESTING.cutStats(sh, params).cuts); }, 0),
      turns: sheets.reduce(function (s, sh) { return s + (sh.stack_dup ? 0 : NESTING.cutStats(sh, params).turns); }, 0),
      used_area_mm2: usedArea,
      total_area_mm2: totalArea,
      // Perda BRUTA: tudo que não é peça (inclui a sobra que vira retalho).
      waste_pct: totalArea > 0 ? (1 - usedArea / totalArea) : 0,
      // Perda REAL (pergunta do Matt, 21/09-17): desconta a sobra que fica
      // guardada como retalho — só o que vai pro lixo mesmo.
      offcut_area_mm2: offcutArea,
      waste_net_pct: totalArea > 0 ? Math.max(0, (totalArea - usedArea - offcutArea) / totalArea) : 0
    }
  };
};

/* Pilhas por geometria: chapas CONSECUTIVAS, mesmo tamanho, mesmas peças
   (x,y,w,h) e mesmas sobras => mesma pilha (até STACK_MAX). Serve tanto pro
   resultado do NESTING (placed/offcuts) quanto pra linha salva
   (cut_plan_sheets + _pieces) — por isso recebe uma função que extrai a
   assinatura. Devolve { byId: { id: { leaderId, members: [ids], pos } },
   groups: [[ids]] }. */
NESTING.detectStacks = function (items, sigOf, idOf) {
  const byId = {};
  const groups = [];
  let cur = null;
  items.forEach(function (it) {
    const sig = sigOf(it), id = idOf(it);
    if (cur && cur.sig === sig && cur.ids.length < NESTING.STACK_MAX) cur.ids.push(id);
    else { cur = { sig: sig, ids: [id] }; groups.push(cur); }
  });
  groups.forEach(function (g) {
    g.ids.forEach(function (id, pos) { byId[id] = { leaderId: g.ids[0], members: g.ids, pos: pos }; });
  });
  return { byId: byId, groups: groups.filter(function (g) { return g.ids.length > 1; }).map(function (g) { return g.ids; }) };
};

NESTING.sheetSignature = function (width, height, material, rects, offcuts) {
  const r = function (v) { return Math.round(Number(v) * 10); };
  const rs = rects.map(function (q) { return [r(q.x), r(q.y), r(q.w), r(q.h)].join(','); }).sort().join(';');
  const os = (offcuts || []).map(function (q) { return [r(q.x), r(q.y), r(q.w), r(q.h)].join(','); }).sort().join(';');
  return [r(width), r(height), material || '', rs, os].join('#');
};

/* Medida LIMPA (física) de um retalho guardado: o retângulo em sheet.offcuts
   inclui o kerf do corte que o separa do vizinho em todo lado de dentro
   (convenção dos packers e da exportação); a peça de verdade que sobra é
   isso menos a serra. Borda útil e borda física (retalho com a borda crua)
   não têm corte, então não perdem nada. É a medida que vai pro estoque
   (erp.offcuts) e pra etiqueta OC. */
NESTING.offcutCleanSize = function (sheet, r, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const isRetalho = sheet.source === 'retalho';
  const _t = NESTING.trims(params, isRetalho);
  const usableR = sheet.width - _t.tr;
  const usableB = sheet.height - _t.tb;
  const endX = r.x + r.w, endY = r.y + r.h;
  return {
    w: (Math.abs(endX - usableR) > 0.15 && Math.abs(endX - sheet.width) > 0.15) ? Math.max(1, r.w - kerf) : r.w,
    h: (Math.abs(endY - usableB) > 0.15 && Math.abs(endY - sheet.height) > 0.15) ? Math.max(1, r.h - kerf) : r.h
  };
};

/* ============================================================
   Sobras que NÃO viram retalho — cada pedaço que a serra solta
   ============================================================
   Pedido do Matt (22/09-6): "quando a serra passa ela vai gerando sobras
   que não são peças; deixa essas peças evidentes, em cinza riscado no
   plano". Percorre a mesma árvore de corte da exportação (componentes
   por eixo, alternando) sobre a geometria real e devolve todo pedaço que
   sobra: o resto no fim de cada faixa, o vão do lado da peça mais estreita
   que a faixa, e qualquer folga entre fatias maior que a serra. Peça e
   retalho guardado ficam de fora (já são desenhados). */
NESTING.scrapRects = function (sheet, params) {
  const kerf = Number(params.kerf_mm) || 0;
  const isRetalho = sheet.source === 'retalho';
  const _t = NESTING.trims(params, isRetalho);
  const tl = _t.tl, tt = _t.tt, tr = _t.tr, tb = _t.tb;
  const region0 = { x: tl, y: tt, w: sheet.width - tl - tr, h: sheet.height - tt - tb };
  const items = sheet.placed.map(function (p) { return { x: p.x, y: p.y, w: p.w, h: p.h }; })
    .concat((sheet.offcuts || []).map(function (o) { return { x: o.x, y: o.y, w: o.w, h: o.h, offcut: true }; }));
  const out = [];
  function push(r) { if (r.w > 1 && r.h > 1) out.push(r); }

  function rec(region, list, axis, stuck) {
    const c = axis === 'y' ? 'y' : 'x', s = axis === 'y' ? 'h' : 'w';
    const perp = axis === 'y' ? 'x' : 'y', pc = perp, ps = perp === 'y' ? 'h' : 'w';
    const sorted = list.slice().sort(function (a, b) { return a[c] - b[c]; });
    const segs = [];
    let cur = null;
    sorted.forEach(function (it) {
      const start = it[c], end = it[c] + it[s];
      if (cur && start >= cur.end - 0.15) { segs.push(cur); cur = null; }
      if (!cur) cur = { start: start, end: end, items: [] };
      cur.items.push(it);
      if (end > cur.end) cur.end = end;
    });
    if (cur) segs.push(cur);
    if (segs.length === 1 && list.length > 1) {
      if (stuck) return;
      rec(region, list, perp, true);
      return;
    }
    const regionStart = region[c], regionEnd = region[c] + region[s];
    let cursor = regionStart;
    segs.forEach(function (sg) {
      // folga antes do segmento (maior que a serra = sobra)
      const gapStart = cursor === regionStart ? cursor : cursor + kerf;
      if (sg.start - gapStart > 1) {
        const r = {}; r[c] = gapStart; r[s] = sg.start - gapStart; r[pc] = region[pc]; r[ps] = region[ps];
        push(r);
      }
      const sub = {}; sub[c] = sg.start; sub[s] = sg.end - sg.start; sub[pc] = region[pc]; sub[ps] = region[ps];
      if (sg.items.length === 1) {
        const it = sg.items[0];
        if (!it.offcut) {
          // sobra do lado da peça, no sentido perpendicular
          const itEnd = it[pc] + it[ps];
          const subEnd = region[pc] + region[ps];
          if (subEnd - (itEnd + kerf) > 1) {
            const r = {}; r[c] = sg.start; r[s] = sg.end - sg.start; r[pc] = itEnd + kerf; r[ps] = subEnd - (itEnd + kerf);
            push(r);
          }
          if (it[pc] - region[pc] > 1) {
            const r = {}; r[c] = sg.start; r[s] = sg.end - sg.start; r[pc] = region[pc]; r[ps] = it[pc] - region[pc];
            push(r);
          }
        }
      } else {
        rec(sub, sg.items, perp, false);
      }
      cursor = sg.end;
    });
    // resto no fim da faixa
    const tailStart = cursor + kerf;
    if (regionEnd - tailStart > 1) {
      const r = {}; r[c] = tailStart; r[s] = regionEnd - tailStart; r[pc] = region[pc]; r[ps] = region[ps];
      push(r);
    }
  }
  if (items.length) rec(region0, items, 'y', false);
  else push(region0);
  return out;
};

/* ============================================================
   Desenho da chapa (SVG)
   ============================================================
   Mesmo espírito do diagrama do portal, com o que o chão de fábrica precisa a
   mais: código da peça (o que está na etiqueta), retalho aproveitável em
   verde e o refile hachurado, pra ninguém achar que a máquina vai cortar até
   a borda. */
NESTING.sheetSVG = function (sheet, params, opts) {
  opts = opts || {};
  const maxW = opts.maxWidth || 560;
  const scale = maxW / sheet.width;
  const w = Math.round(sheet.width * scale);
  const h = Math.round(sheet.height * scale);
  const esc = function (s) { return UI.esc(s); };

  // Retalho tem refile próprio (trim_retalho_mm) — hachura igual à chapa nova.
  const isRetalho = sheet.source === 'retalho';
  const _t = NESTING.trims(params, isRetalho);
  const tl = _t.tl * scale, tt = _t.tt * scale, tr = _t.tr * scale, tb = _t.tb * scale;

  let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" ' +
    'style="background:#fbfbf9;border:2px solid #2b2b2b;max-width:100%;display:block">';

  /* Refile */
  if (tl || tt || tr || tb) {
    svg += '<rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#eae7e0"/>' +
      '<rect x="' + tl.toFixed(1) + '" y="' + tt.toFixed(1) + '" width="' + (w - tl - tr).toFixed(1) +
      '" height="' + (h - tt - tb).toFixed(1) + '" fill="#fbfbf9" stroke="#b9b3a7" stroke-dasharray="4 3"/>';
  }

  /* Sobras que a serra solta e NÃO viram retalho — cinza riscado (pedido
     do Matt, 22/09-6), pra ficar evidente o que vai pro lixo. */
  const scraps = NESTING.scrapRects(sheet, params);
  if (scraps.length) {
    svg += '<defs><pattern id="nest-scrap" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">' +
      '<rect width="8" height="8" fill="#e6e3dc"/><line x1="0" y1="0" x2="0" y2="8" stroke="#a8a297" stroke-width="2"/></pattern></defs>';
    scraps.forEach(function (r) {
      const x = r.x * scale, y = r.y * scale, rw = r.w * scale, rh = r.h * scale;
      svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + rw.toFixed(1) + '" height="' + rh.toFixed(1) +
        '" fill="url(#nest-scrap)" stroke="#a8a297" stroke-width="0.8"/>';
      if (rw > 40 && rh > 14) {
        svg += '<text x="' + (x + rw / 2).toFixed(1) + '" y="' + (y + rh / 2 + 3.5).toFixed(1) +
          '" font-size="9" text-anchor="middle" fill="#6f6a60">' + Math.round(r.w) + '×' + Math.round(r.h) + '</text>';
      }
    });
  }

  /* Retalhos aproveitáveis */
  sheet.offcuts.forEach(function (r) {
    const x = r.x * scale, y = r.y * scale, rw = r.w * scale, rh = r.h * scale;
    svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + rw.toFixed(1) + '" height="' + rh.toFixed(1) +
      '" fill="#dff2e1" stroke="#4c9a5e" stroke-width="1" stroke-dasharray="5 3"/>';
    if (rw > 46 && rh > 16) {
      svg += '<text x="' + (x + rw / 2).toFixed(1) + '" y="' + (y + rh / 2 + 4).toFixed(1) +
        '" font-size="10" text-anchor="middle" fill="#2f6b3d">retalho ' + Math.round(r.w) + '×' + Math.round(r.h) + '</text>';
    }
  });

  /* Peças */
  sheet.placed.forEach(function (p) {
    const x = p.x * scale, y = p.y * scale, pw = p.w * scale, ph = p.h * scale;
    const fs = Math.max(7, Math.min(11, Math.min(pw, ph) / 5));
    /* Peça com código (plano já salvo, ver LOTES_UI.planView) abre o visor
       3D dela ao clicar — pedido do Matt (21/09-4): "ao clicar em alguma
       peca ela abrir o modulo explodido com a peca piscando em vermelho".
       Sem código (rascunho do plano, ainda não salvo — ver renderDraft) o
       <g> não tem onclick/cursor: nada pra abrir ainda. */
    const clickable = !!p.piece.code;
    svg += '<g' + (clickable
      ? ' class="erp-nest-piece" style="cursor:pointer" onclick="LOTES_UI.abrirPeca3D(\'' + esc(p.piece.code) + '\')"'
      : '') + '>';
    svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + pw.toFixed(1) + '" height="' + ph.toFixed(1) +
      '" fill="#cfe0ef" stroke="#3c5f87" stroke-width="1"/>';

    /* Veio: risco paralelo ao comprimento, só quando a peça está travada */
    if (p.piece.grain && pw > 14 && ph > 14) {
      for (let ly = y + 4; ly < y + ph - 2; ly += 6) {
        svg += '<line x1="' + (x + 2).toFixed(1) + '" y1="' + ly.toFixed(1) + '" x2="' + (x + pw - 2).toFixed(1) +
          '" y2="' + ly.toFixed(1) + '" stroke="#8a6d3b" stroke-width="0.5" opacity="0.45"/>';
      }
    }
    if (pw > 40 && ph > 26) {
      svg += '<text x="' + (x + pw / 2).toFixed(1) + '" y="' + (y + ph / 2 - 3).toFixed(1) + '" font-size="' + fs.toFixed(1) +
        '" text-anchor="middle" fill="#1e2b3a">' + esc(p.piece.label || '') + '</text>' +
        '<text x="' + (x + pw / 2).toFixed(1) + '" y="' + (y + ph / 2 + 9).toFixed(1) + '" font-size="' + fs.toFixed(1) +
        '" text-anchor="middle" fill="#4a5a6a">' + Math.round(p.w) + ' × ' + Math.round(p.h) + (p.rotated ? ' ↻' : '') + '</text>';
    } else if (pw > 24 && ph > 12) {
      svg += '<text x="' + (x + pw / 2).toFixed(1) + '" y="' + (y + ph / 2 + 3).toFixed(1) + '" font-size="' + fs.toFixed(1) +
        '" text-anchor="middle" fill="#1e2b3a">' + Math.round(p.w) + '×' + Math.round(p.h) + '</text>';
    }
    svg += '</g>';
  });

  return svg + '</svg>';
};
