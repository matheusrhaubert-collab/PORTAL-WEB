// drilling.js — FURAÇÃO (migrations 038 + 043): gera os arquivos .ban
// (MicroDrawBan_XML v3.0) pras máquinas de furação, um por peça única do
// pedido, a partir das peças já RESOLVIDAS pelo admin
// (resolvePiecesForViewer em admin.js — mesmo formato de "parts" que o
// viewer3d.js recebe: position_role, medidas finais em mm, offsets
// avaliados, positioning, hinge_side, child_pieces recursivo).
//
// TRÊS ORIGENS DE FURO (modelo de PROPAGAÇÃO, migration 043):
//  1. FURAÇÃO PADRÃO — cadastrada por componente (component_drillings),
//     fórmulas em C/L/E do plano de CADASTRO da peça (C = faceA na
//     horizontal, L = faceB — se a peça girar pro corte, o padrão gira
//     junto em localToMachine). As peças "padrão" (base, fundo, travessa,
//     porta...) carregam TODA a própria furação aqui — ela nunca muda, só
//     escala com as fórmulas.
//  2. CONTRA-FURO PROPAGADO — furo de BORDA cadastrado com counter_diameter/
//     counter_depth: quando aquela borda ENCOSTA na face de outra peça do
//     módulo (tolerância touch_tolerance_mm), a peça tocada recebe um furo
//     de face naquele exato ponto. Campos nulos = não propaga (exceções).
//     Substitui o antigo padrão global de toque (drilling_touch_holes,
//     DEPRECIADO — config.touchHoles é aceito e ignorado).
//  3. DOBRADIÇA AUTOMÁTICA — peça com hinge_side != 'none' ganha copo 35mm +
//     2 marcações por dobradiça na PORTA (mesmas posições do 3D/preço), e a
//     LATERAL do lado da dobradiça ganha os furos da BASE (2 por dobradiça,
//     na altura do copo, recuados da borda frontal — hinge_plate_* em
//     drilling_settings).
//
// ESPELHAMENTO ESQ/DIR (migration 043): peça com position_role='right' tem
// o programa INTEIRO espelhado no plano local (v' = faceB - v, bordas v0/v1
// trocadas, face<->verso invertidos nos furos propagados) — a lateral
// direita é a gêmea espelhada da esquerda e gera um .ban PRÓPRIO. O cadastro
// (component_drillings) é interpretado como coordenadas do MÓDULO (mesmo
// ponto físico nas duas gêmeas); o espelho acontece só na hora de escrever
// o desenho/arquivo.
//
// GEOMETRIA: reconstrução "zero-absoluto" do viewer3d.js (placePieceInBox),
// refeita aqui em MILÍMETROS e em COORDENADAS DE CANTO (origem no canto
// chão-fundo-esquerda do container, x=0..W / y=0..H / z=0..D) em vez do
// frame centrado do THREE — mais simples pra medir distância entre faces.
// legH é ignorado de propósito: ele desloca o corpo INTEIRO igualmente, não
// muda nenhuma posição relativa entre peças (e furação só depende disso).
// (Exceção teórica: baseboard não sobe com legH no viewer — se um dia
// rodapé precisar de contra-furo em módulo com pés, revisar aqui.)
//
// COORDENADAS DA MÁQUINA (.ban): plano da peça deitada, X = 0..Width
// (Width = a MAIOR das duas dimensões de face), Y = 0..-Hight (NEGATIVO,
// convenção do formato), Z negativo entrando na chapa. Furo vertical
// (HoleV) entra pela face de cima (Face="A"); furo horizontal (HoleH)
// entra pelas bordas (Face="L"/"R" nas extremidades do X — únicos códigos
// confirmados nos .ban de exemplo da máquina; "B" pro verso e "T"/"B" pras
// bordas do Y são PALPITE, marcado abaixo, até termos um exemplo real).
(function (global) {
  'use strict';

  // ---- utilidades ----------------------------------------------------

  // Mesmo splitThickness do viewer3d.js, em mm — decide qual dimensão é a
  // espessura da chapa (explícito via positioning, senão a menor das três).
  function splitThickness(w, h, d, positioning) {
    if (positioning === 'horizontal') return { thickness: h, faceA: w, faceB: d };
    if (positioning === 'vertical') return { thickness: w, faceA: h, faceB: d };
    if (positioning === 'vertical_no_plano' || positioning === 'horizontal_no_plano') {
      return { thickness: d, faceA: w, faceB: h };
    }
    const dims = [w, h, d];
    const minIdx = dims.indexOf(Math.min(w, h, d));
    const thickness = dims[minIdx];
    const rest = dims.filter(function (_, i) { return i !== minIdx; });
    return { thickness, faceA: rest[0], faceB: rest[1] };
  }

  // Versão com EIXOS: além das medidas, diz a qual dimensão cadastrada
  // (w/h/d) cada papel do plano corresponde — usada pela peça 'free', cujas
  // medidas mapeiam DIRETO pros eixos do módulo (largura->X, altura->Y,
  // profundidade->Z, ver placePieceInBox 'free' no viewer3d).
  function splitThicknessAxes(w, h, d, positioning) {
    const dims = { w: w, h: h, d: d };
    let tKey;
    if (positioning === 'horizontal') tKey = 'h';
    else if (positioning === 'vertical') tKey = 'w';
    else if (positioning === 'vertical_no_plano' || positioning === 'horizontal_no_plano') tKey = 'd';
    else {
      const arr = [w, h, d];
      tKey = ['w', 'h', 'd'][arr.indexOf(Math.min(w, h, d))];
    }
    const rest = ['w', 'h', 'd'].filter(function (k) { return k !== tKey; });
    return {
      t: { thickness: dims[tKey], faceA: dims[rest[0]], faceB: dims[rest[1]] },
      tKey, aKey: rest[0], bKey: rest[1]
    };
  }

  function resolveThicknessMm(part) {
    if (!part) return 0;
    return splitThickness(part.width_mm || 0, part.height_mm || 0, part.depth_mm || 0, part.positioning).thickness;
  }

  // Formata número pro .ban: até 2 casas, sem zeros à direita (exemplos da
  // máquina misturam "969.0" no Plane e "484.5"/"24" nos furos).
  function fmt(n) {
    return String(parseFloat((Math.round(n * 100) / 100).toFixed(2)));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  // ---- caixa da peça no frame de canto do container -------------------
  // Devolve null pra papéis sem posição 3D reconstituível pra propagação
  // (drawer/handle/leg/front/other) — essas peças ainda recebem furação
  // padrão e de dobradiça, só não participam do contato borda-face.
  // uAxis/vAxis/tAxis: a qual eixo do MÓDULO correspondem faceA, faceB e a
  // espessura desta peça.
  function pieceBox(part, W, H, D, index, count, bounds) {
    const role = part.position_role || 'other';
    const t = splitThickness(part.width_mm || 0, part.height_mm || 0, part.depth_mm || 0, part.positioning);
    const offX = part.offset_x_mm || 0;
    const offY = part.offset_y_mm || 0;
    const offZ = part.offset_z_mm || 0;

    if (role === 'left' || role === 'right') {
      // espessura no X; faceA no Y (altura), faceB no Z (profundidade)
      return {
        part, role, t,
        x0: offX, sx: t.thickness,
        y0: offY, sy: t.faceA,
        z0: offZ, sz: t.faceB,
        uAxis: 'y', vAxis: 'z', tAxis: 'x'
      };
    }
    if (role === 'top' || role === 'bottom' || role === 'countertop') {
      return {
        part, role, t,
        x0: offX, sx: t.faceA,
        y0: offY, sy: t.thickness,
        z0: offZ, sz: t.faceB,
        uAxis: 'x', vAxis: 'z', tAxis: 'y'
      };
    }
    if (role === 'back' || role === 'baseboard') {
      // fundo: faceA no X (largura), faceB no Y (altura), espessura no Z —
      // mesma ancoragem zero-absoluto do viewer3d (placePieceInBox 'back').
      return {
        part, role, t,
        x0: offX, sx: t.faceA,
        y0: offY, sy: t.faceB,
        z0: offZ, sz: t.thickness,
        uAxis: 'x', vAxis: 'y', tAxis: 'z'
      };
    }
    if (role === 'shelf') {
      // Distribuição automática no vão interno — mesma conta do viewer3d
      // (placePieceInBox 'shelf'), em mm e frame de canto.
      const innerLow = (bounds && bounds.innerBottomY) || 0;
      const innerHigh = (bounds && bounds.innerTopY) || H;
      const span = Math.max(innerHigh - innerLow, 10);
      const yCenter = innerLow + span * ((index + 1) / (count + 1));
      return {
        part, role, t,
        x0: W / 2 - t.faceA / 2 + offX, sx: t.faceA,
        y0: yCenter - t.thickness / 2 + offY, sy: t.thickness,
        z0: D / 2 - t.faceB / 2 + offZ, sz: t.faceB,
        uAxis: 'x', vAxis: 'z', tAxis: 'y'
      };
    }
    if (role === 'free') {
      // Posição livre (migration 027): medidas mapeadas DIRETO pros eixos
      // (w->X, h->Y, d->Z) e posição 100% pelos offsets — é assim que
      // travessas/divisórias custom são cadastradas, e elas AGORA participam
      // da propagação (decisão do usuário, 2026-07-11).
      const ax = splitThicknessAxes(part.width_mm || 0, part.height_mm || 0, part.depth_mm || 0, part.positioning);
      const axisOf = { w: 'x', h: 'y', d: 'z' };
      return {
        part, role, t: ax.t,
        x0: offX, sx: part.width_mm || 0,
        y0: offY, sy: part.height_mm || 0,
        z0: offZ, sz: part.depth_mm || 0,
        uAxis: axisOf[ax.aKey], vAxis: axisOf[ax.bKey], tAxis: axisOf[ax.tKey]
      };
    }
    return null;
  }

  // ---- conversão plano local <-> plano da máquina ----------------------
  // Plano local da peça: u = 0..faceA, v = 0..faceB — a orientação em que a
  // furação é CADASTRADA (faceA na horizontal). Plano da máquina: X ao longo
  // da MAIOR face (convenção Width>=Hight dos .ban de exemplo, igual à
  // lista de corte C=maior/L=média).
  function machineDims(t) {
    const flip = t.faceB > t.faceA; // X da máquina segue faceB em vez de faceA
    return {
      flip,
      C: flip ? t.faceB : t.faceA, // Width do Plane
      L: flip ? t.faceA : t.faceB, // Hight do Plane
      E: t.thickness
    };
  }

  // Quando faceB > faceA a peça precisa GIRAR 90° pra deitar com o lado
  // maior na horizontal — e o padrão de furos gira JUNTO, como rotação
  // rígida com a mesma face pra cima: (u,v) -> (faceB - v, u). Antes
  // (corrigido 2026-07-14) era só troca de eixos {x:v, y:u}, que é uma
  // TRANSPOSIÇÃO (espelho na diagonal), não rotação — o padrão saía
  // espelhado e os furos não respeitavam as distâncias dos cantos do
  // cadastro original.
  function localToMachine(t, u, v) {
    const m = machineDims(t);
    return m.flip ? { x: t.faceB - v, y: u } : { x: u, y: v };
  }

  function machineToLocal(t, x, y) {
    const m = machineDims(t);
    return m.flip ? { u: y, v: t.faceB - x } : { u: x, v: y };
  }

  // Borda do plano local ('u0'|'u1'|'v0'|'v1') -> face da máquina.
  // 'borda_esq' = x=0, 'borda_dir' = x=Width, 'borda_sup' = y=0,
  // 'borda_inf' = y=Hight. Com flip, segue a MESMA rotação de 90° do
  // localToMachine: u0 (x local 0) vira a borda de cima, e v0 (y local 0)
  // vira a borda DIREITA (x = faceB - 0 = Width).
  function edgeFace(t, edge) {
    const m = machineDims(t);
    const map = m.flip
      ? { u0: 'borda_sup', u1: 'borda_inf', v0: 'borda_dir', v1: 'borda_esq' }
      : { u0: 'borda_esq', u1: 'borda_dir', v0: 'borda_sup', v1: 'borda_inf' };
    return map[edge];
  }

  // Sentido cadastrado (component_drillings.face) -> aresta REAL da peça
  // ('u0'/'u1'/'v0'/'v1' no plano faceA×faceB). FIXO — não depende de qual
  // dimensão virou comprimento/largura no corte desta instância: a peça
  // sempre "nasce" cadastrada com faceA na horizontal (borda_esq/dir = as
  // duas pontas de faceA), então quem decide a FACE DE MÁQUINA final é
  // sempre o edgeFace acima, avaliado com o flip REAL desta peça. Antes
  // dessa correção (2026-07-12), esse passo usava o mesmo flip do edgeFace
  // e cancelava a correção pra peças não-espelhadas: uma furação "Borda
  // esquerda" sempre saía na borda esquerda LITERAL do plano de corte,
  // mesmo quando a peça precisou girar pra caber (altura real > largura
  // real) — aí ela saía fisicamente em cima/embaixo em vez de na lateral.
  const REAL_EDGE_OF_FACE = { borda_esq: 'u0', borda_dir: 'u1', borda_sup: 'v0', borda_inf: 'v1' };

  // Furo de borda cadastrado (row.face + x/y já avaliados pela fórmula) ->
  // {u,v,edge} no plano REAL da peça (faceA×faceB). borda_esq/dir correm ao
  // longo de faceB (usa o Y cadastrado como posição na aresta); borda_sup/
  // inf correm ao longo de faceA (usa o X cadastrado). Não faz mirror da
  // gêmea direita — isso é responsabilidade de emitLocalHole.
  function edgeRealUV(t, row, x, y) {
    const edge = REAL_EDGE_OF_FACE[row.face];
    if (!edge) return null;
    const along = (edge === 'u0' || edge === 'u1') ? y : x;
    if (edge === 'u0') return { u: 0, v: along, edge };
    if (edge === 'u1') return { u: t.faceA, v: along, edge };
    if (edge === 'v0') return { u: along, v: 0, edge };
    return { u: along, v: t.faceB, edge };
  }

  // Resolve um furo cadastrado (face + x/y já avaliados) pras coordenadas
  // FINAIS da máquina desta peça (t), já com a correção de sentido dos
  // furos de borda aplicada. Furo de face não tem ambiguidade de aresta —
  // sai como cadastrado. Usado tanto pelo gerador (peça sem box, ex:
  // gaveta/puxador/pé) quanto pela prévia 2D do admin, pra nunca divergir
  // do .ban real.
  function resolveDrillingHoleXY(t, row, x, y) {
    if (!/^borda_/.test(row.face || '')) {
      // furo de face: x/y cadastrados são coordenadas LOCAIS (faceA×faceB);
      // gira junto com a peça se ela precisou deitar pro corte
      const posF = localToMachine(t, x, y);
      return { face: row.face || 'face', x: posF.x, y: posF.y };
    }
    const r = edgeRealUV(t, row, x, y);
    if (!r) return null;
    const pos = localToMachine(t, r.u, r.v);
    return { face: edgeFace(t, r.edge), x: pos.x, y: pos.y };
  }

  // ---- emissão de furos --------------------------------------------------
  // Cada furo vai pro array `holes` do part como
  // { face, x, y, diameter, depth } já em coordenadas da MÁQUINA (x/y
  // positivos; o formatador nega o y). face: 'face'|'verso'|'borda_esq'|
  // 'borda_dir'|'borda_sup'|'borda_inf'.
  function addHole(store, part, hole) {
    if (!store.has(part)) store.set(part, []);
    // descarta furo fora da chapa (fórmula ruim/peça pequena demais) — mais
    // seguro ignorar do que mandar a broca pra fora da peça
    const m = machineDims(splitThickness(part.width_mm, part.height_mm, part.depth_mm, part.positioning));
    if (hole.x < -0.01 || hole.x > m.C + 0.01 || hole.y < -0.01 || hole.y > m.L + 0.01) return;
    if (!(hole.diameter > 0) || !(hole.depth > 0)) return;
    store.get(part).push(hole);
  }

  // Emite um furo dado em coordenadas LOCAIS da peça (u/v/edge/face de
  // entrada), aplicando o ESPELHAMENTO da gêmea direita num lugar só:
  //  - edge: 'u0'|'u1'|'v0'|'v1' pra furo de borda, null pra furo de face
  //  - entersPositive: (furo de face) true se a broca entra pela face do
  //    lado POSITIVO do eixo da espessura no módulo (ex: face interna da
  //    lateral esquerda = +X), false pro lado negativo.
  // Na peça espelhada (role 'right'): v espelha, bordas v0/v1 trocam, e a
  // face "de cima" do desenho passa a ser a NEGATIVA (a peça é virada em
  // torno do eixo u — topo continua topo, frente/fundo trocam no desenho).
  function emitLocalHole(store, box, h) {
    const t = box.t;
    const mirrored = box.role === 'right';
    let u = h.u, v = h.v, edge = h.edge || null;
    if (mirrored) {
      v = t.faceB - v;
      if (edge === 'v0') edge = 'v1';
      else if (edge === 'v1') edge = 'v0';
    }
    let face;
    if (edge) {
      if (edge === 'u0') u = 0;
      else if (edge === 'u1') u = t.faceA;
      else if (edge === 'v0') v = 0;
      else if (edge === 'v1') v = t.faceB;
      face = edgeFace(t, edge);
    } else if (h.face === 'face' || h.face === 'verso') {
      // furo de face vindo do CADASTRO da própria peça: 'face' = lado
      // positivo do desenho canônico; na gêmea espelhada face<->verso.
      face = mirrored ? (h.face === 'face' ? 'verso' : 'face') : h.face;
    } else {
      face = (h.entersPositive !== mirrored) ? 'face' : 'verso';
    }
    const pos = localToMachine(t, u, v);
    addHole(store, box.part, { face, x: pos.x, y: pos.y, diameter: h.diameter, depth: h.depth });
  }

  // Avalia as linhas de furação padrão de um componente, chamando
  // fn(row, x, y, depth) por INSTÂNCIA (repetições já expandidas), em
  // coordenadas LOCAIS da peça (plano faceA×faceB do cadastro — se a peça
  // girar pro corte, o padrão gira junto depois, em localToMachine).
  // Fórmula inválida pula a linha.
  // vars: C/L/E são as dimensões do plano de CADASTRO (C = faceA na
  // horizontal, L = faceB, E = espessura) — estáveis, NÃO trocam de
  // identidade quando a peça gira pro corte (correção 2026-07-14; antes
  // C/L eram as dimensões pós-giro da máquina e as fórmulas quebravam em
  // peça girada). W/H seguem expostas: largura/altura REAIS da peça
  // (part.width_mm/height_mm), pra fórmula poder medir a partir da
  // dimensão cadastrada (ex: "H-50").
  function eachDrillingInstance(rows, vars, fn) {
    if (!rows || !rows.length) return;
    rows.forEach(function (row) {
      let x, y, depth, count;
      try {
        x = Pricing.evalFormula(row.x_formula || '0', vars);
        y = Pricing.evalFormula(row.y_formula || '0', vars);
        depth = Pricing.evalFormula(row.depth_formula || '0', vars);
        count = Math.max(Math.floor(Pricing.evalFormula(row.repeat_count_formula || '1', vars)), 0);
      } catch (e) { return; } // fórmula inválida: pula o furo, não o export
      for (let i = 0; i < count; i++) {
        fn(row, x + i * (Number(row.repeat_dx_mm) || 0), y + i * (Number(row.repeat_dy_mm) || 0), depth);
      }
    });
  }

  // 1. FURAÇÃO PADRÃO (component_drillings) — fórmulas em C/L/E.
  // Com box (peça posicionável): passa pelo plano local pra aplicar o
  // espelhamento da gêmea 'right'. Sem box (drawer/handle/etc): direto,
  // como sempre foi.
  function collectStandardHoles(store, part, box, drillingsByComponent) {
    if (!part.component_id || !drillingsByComponent) return;
    const rows = drillingsByComponent[part.component_id];
    if (!rows || !rows.length) return;
    const t = splitThickness(part.width_mm, part.height_mm, part.depth_mm, part.positioning);
    const vars = { C: t.faceA, L: t.faceB, E: t.thickness, W: part.width_mm || 0, H: part.height_mm || 0 };
    eachDrillingInstance(rows, vars, function (row, x, y, depth) {
      const isEdge = /^borda_/.test(row.face || '');
      if (!box) {
        const r = resolveDrillingHoleXY(t, row, x, y);
        if (r) addHole(store, part, { face: r.face, x: r.x, y: r.y, diameter: Number(row.diameter_mm), depth: depth });
        return;
      }
      if (isEdge) {
        const r = edgeRealUV(t, row, x, y);
        if (r) {
          emitLocalHole(store, box, {
            u: r.u, v: r.v, edge: r.edge,
            diameter: Number(row.diameter_mm), depth: depth
          });
        }
        return;
      }
      emitLocalHole(store, box, {
        u: x, v: y, edge: null, face: row.face || 'face',
        diameter: Number(row.diameter_mm), depth: depth
      });
    });
  }

  // 3. DOBRADIÇA AUTOMÁTICA (porta) — copo + marcações, peça com hinge_side.
  // Mesma regra do 3D/preço: quantidade por altura (hingeCountForDoorHeight),
  // margem fixa das extremidades, distribuição uniforme. A porta é drilhada
  // no plano local dela: copos correm ao longo da ALTURA (height_mm), o
  // recuo da borda fica no eixo da LARGURA, encostado no lado da dobradiça.
  function collectHingeHoles(store, part, settings) {
    if (!settings || !settings.hinge_enabled) return;
    if (!part.hinge_side || part.hinge_side === 'none') return;
    const t = splitThickness(part.width_mm, part.height_mm, part.depth_mm, part.positioning);
    const doorW = t.faceA;
    const doorH = t.faceB;
    const count = hingeCount(part.height_mm || 0);
    const margin = Number(settings.hinge_edge_margin_mm) || 100;
    const cupFromEdge = Number(settings.hinge_cup_center_from_edge_mm) || 22;
    const markFromEdge = Number(settings.hinge_mark_center_from_edge_mm) || 28;
    const markOffset = Number(settings.hinge_mark_offset_mm) || 24;
    const lowV = margin;
    const highV = Math.max(doorH - margin, margin);
    const u = part.hinge_side === 'left' ? cupFromEdge : doorW - cupFromEdge;
    const uMark = part.hinge_side === 'left' ? markFromEdge : doorW - markFromEdge;
    for (let i = 0; i < count; i++) {
      const v = count > 1 ? lowV + (highV - lowV) * (i / (count - 1)) : doorH / 2;
      const cup = localToMachine(t, u, v);
      addHole(store, part, {
        face: 'face', x: cup.x, y: cup.y,
        diameter: Number(settings.hinge_cup_diameter_mm) || 35,
        depth: Number(settings.hinge_cup_depth_mm) || 13
      });
      [-markOffset, markOffset].forEach(function (dm) {
        const mk = localToMachine(t, uMark, v + dm);
        addHole(store, part, {
          face: 'face', x: mk.x, y: mk.y,
          diameter: Number(settings.hinge_mark_diameter_mm) || 3,
          depth: Number(settings.hinge_mark_depth_mm) || 2
        });
      });
    }
  }

  function hingeCount(doorHeightMm) {
    return (typeof Pricing !== 'undefined' && Pricing.hingeCountForDoorHeight)
      ? Pricing.hingeCountForDoorHeight(doorHeightMm)
      : 2;
  }

  // ---- caixas de um nível de montagem ------------------------------------
  function buildBoxes(parts, W, H, D) {
    const groups = {};
    (parts || []).forEach(function (p) {
      if (p.is_module) return; // módulo aninhado: as peças DELE entram na recursão
      const role = p.position_role || 'other';
      if (!groups[role]) groups[role] = [];
      groups[role].push(p);
    });
    const bounds = {
      innerBottomY: resolveThicknessMm((groups['bottom'] || [])[0]),
      innerTopY: H - resolveThicknessMm((groups['top'] || [])[0])
    };
    const boxes = [];
    const byPart = new Map();
    Object.keys(groups).forEach(function (role) {
      groups[role].forEach(function (part, index) {
        const box = pieceBox(part, W, H, D, index, groups[role].length, bounds);
        if (box) { boxes.push(box); byPart.set(part, box); }
      });
    });
    return { boxes, byPart };
  }

  // 2. CONTRA-FURO PROPAGADO (migration 043) — pra cada furo de BORDA
  // cadastrado com counter_diameter/counter_depth, acha a peça cuja FACE
  // coincide com aquela borda (tolerância) e fura o contra-furo no ponto
  // exato do contato. O cadastro é lido como coordenadas de MÓDULO (ponto
  // físico igual nas gêmeas esq/dir); o espelho é só do desenho/arquivo.
  function collectCounterHoles(store, boxes, drillingsByComponent, settings) {
    if (!drillingsByComponent) return;
    const tol = (settings && Number(settings.touch_tolerance_mm)) || 5;
    const ORIG = { x: 'x0', y: 'y0', z: 'z0' };
    const SIZE = { x: 'sx', y: 'sy', z: 'sz' };

    boxes.forEach(function (src) {
      const rows = (src.part.component_id && drillingsByComponent[src.part.component_id]) || null;
      if (!rows || !rows.length) return;
      const counterRows = rows.filter(function (r) {
        return /^borda_/.test(r.face || '') && Number(r.counter_diameter_mm) > 0 && Number(r.counter_depth_mm) > 0;
      });
      if (!counterRows.length) return;
      const t = src.t;
      const vars = { C: t.faceA, L: t.faceB, E: t.thickness, W: src.part.width_mm || 0, H: src.part.height_mm || 0 };

      eachDrillingInstance(counterRows, vars, function (row, x, y) {
        const r = edgeRealUV(t, row, x, y);
        if (!r) return;
        const u = r.u, v = r.v;

        // ponto do furo em coordenadas do módulo: na borda, centro da espessura
        const p = {};
        p[src.uAxis] = src[ORIG[src.uAxis]] + u;
        p[src.vAxis] = src[ORIG[src.vAxis]] + v;
        p[src.tAxis] = src[ORIG[src.tAxis]] + t.thickness / 2;

        boxes.forEach(function (tgt) {
          if (tgt === src) return;
          // a borda precisa coincidir com uma das duas FACES do alvo (plano
          // perpendicular ao eixo da espessura dele)...
          const c = p[tgt.tAxis];
          const negFace = tgt[ORIG[tgt.tAxis]];
          const posFace = negFace + tgt[SIZE[tgt.tAxis]];
          let entersPositive = null;
          if (Math.abs(c - posFace) <= tol) entersPositive = true;
          else if (Math.abs(c - negFace) <= tol) entersPositive = false;
          if (entersPositive === null) return;
          // ...e o ponto precisa cair DENTRO do retângulo da face do alvo
          const pu = p[tgt.uAxis] - tgt[ORIG[tgt.uAxis]];
          const pv = p[tgt.vAxis] - tgt[ORIG[tgt.vAxis]];
          if (pu < -0.5 || pu > tgt[SIZE[tgt.uAxis]] + 0.5) return;
          if (pv < -0.5 || pv > tgt[SIZE[tgt.vAxis]] + 0.5) return;

          emitLocalHole(store, tgt, {
            u: pu, v: pv, edge: null,
            entersPositive: entersPositive,
            diameter: Number(row.counter_diameter_mm),
            depth: Number(row.counter_depth_mm)
          });
        });
      });
    });
  }

  // 3b. BASE DA DOBRADIÇA NA LATERAL (migration 043) — pra cada porta com
  // hinge_side, a lateral mais próxima da borda da dobradiça recebe 2 furos
  // por dobradiça (espaçamento vertical hinge_plate_screw_spacing_mm,
  // centro na altura do copo, recuo hinge_plate_from_front_mm da borda
  // FRONTAL da lateral). Portas 'front' seguem a fila do viewer3d
  // (placeFrontGroupInBox: cursor da esquerda, gap 2mm); porta 'free' usa a
  // própria posição.
  function collectHingePlates(store, parts, boxes, settings) {
    if (!settings || !settings.hinge_enabled) return;
    if (settings.hinge_plate_enabled === false) return;
    const plateDia = Number(settings.hinge_plate_diameter_mm) || 5;
    const plateDepth = Number(settings.hinge_plate_depth_mm) || 12;
    const fromFront = Number(settings.hinge_plate_from_front_mm) || 37;
    const spacing = Number(settings.hinge_plate_screw_spacing_mm) || 32;
    const margin = Number(settings.hinge_edge_margin_mm) || 100;

    const doors = [];
    let cursorX = 2; // mesmo gap de 2mm do placeFrontGroupInBox
    (parts || []).forEach(function (part) {
      const role = part.position_role || 'other';
      if (role === 'front') {
        const t = splitThickness(part.width_mm || 0, part.height_mm || 0, part.depth_mm || 0, part.positioning);
        const x0 = cursorX + (part.offset_x_mm || 0);
        if (part.hinge_side && part.hinge_side !== 'none') {
          doors.push({ part, x0, y0: part.offset_y_mm || 0, doorW: t.faceA, doorH: t.faceB });
        }
        cursorX += t.faceA + 2;
      } else if (role === 'free' && part.hinge_side && part.hinge_side !== 'none') {
        doors.push({
          part,
          x0: part.offset_x_mm || 0, y0: part.offset_y_mm || 0,
          doorW: part.width_mm || 0, doorH: part.height_mm || 0
        });
      }
    });
    if (!doors.length) return;

    // candidatas a receber a base: peças com espessura no eixo X (laterais,
    // divisórias em pé)
    const laterals = boxes.filter(function (b) { return b.tAxis === 'x'; });
    if (!laterals.length) return;

    doors.forEach(function (door) {
      const hingeX = door.part.hinge_side === 'left' ? door.x0 : door.x0 + door.doorW;
      let best = null;
      laterals.forEach(function (lb) {
        const d = Math.min(Math.abs(hingeX - lb.x0), Math.abs(hingeX - (lb.x0 + lb.sx)));
        // porta sobreposta cobre a lateral: a borda fica no máx. a uma
        // espessura (+ folga) de uma das faces
        if (d <= lb.sx + 25 && (!best || d < best.d)) best = { lb, d };
      });
      if (!best) return;
      const lb = best.lb;
      const doorCenter = door.x0 + door.doorW / 2;
      const entersPositive = doorCenter >= lb.x0 + lb.sx / 2;

      const count = hingeCount(door.part.height_mm || 0);
      const lowV = margin;
      const highV = Math.max(door.doorH - margin, margin);
      for (let i = 0; i < count; i++) {
        const cupY = door.y0 + (count > 1 ? lowV + (highV - lowV) * (i / (count - 1)) : door.doorH / 2);
        [-spacing / 2, spacing / 2].forEach(function (dm) {
          emitLocalHole(store, lb, {
            u: (cupY + dm) - lb.y0,        // uAxis da lateral = Y (altura)
            v: lb.sz - fromFront,          // vAxis = Z; frente do módulo = z0+sz
            edge: null,
            entersPositive: entersPositive,
            diameter: plateDia, depth: plateDepth
          });
        });
      }
    });
  }

  // 3c. CORREDIÇA UNDERMOUNT (migration 044) — a gaveta (peça/módulo aninhado
  // com opening_type='slide_out' ou papel 'drawer') assenta no vão interno e
  // a corrediça parafusa na LATERAL do módulo: fileira de pilotos a
  // slide_height_mm (37 no manual Häfele) acima do PISO onde a corrediça
  // assenta — ela fica ABAIXO do corpo da gaveta, que precisa desse espaço
  // livre pra funcionar. Referência no código = y0 da peça-gaveta (o cadastro
  // posiciona a gaveta no piso do vão). Furos nas distâncias da borda frontal
  // definidas por comprimento de trilho (slide_holes_json) — trilho =
  // profundidade EXATA da gaveta (senão o maior que caiba). Só a lateral que
  // a corrediça toca (folga máx. 30mm por lado, padrão undermount ~21mm).
  function parseSlideHoles(settings) {
    const def = { 305: [37, 165, 261], 381: [37, 165, 357], 457: [37, 165, 357], 533: [37, 165, 453] };
    const raw = settings && settings.slide_holes_json;
    if (!raw) return def;
    try {
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (o && Object.keys(o).length) ? o : def;
    } catch (e) { return def; }
  }

  function collectSlideHoles(store, parts, boxes, W, H, D, settings) {
    if (!settings || settings.slide_enabled === false) return;
    const dia = Number(settings.slide_diameter_mm) || 5;
    const depth = Number(settings.slide_depth_mm) || 12;
    const height = Number(settings.slide_height_mm) || 37;
    const table = parseSlideHoles(settings);

    const drawerRole = (parts || []).filter(function (p) { return (p.position_role || 'other') === 'drawer'; });
    const drawers = [];
    (parts || []).forEach(function (part) {
      const role = part.position_role || 'other';
      if (part.opening_type !== 'slide_out' && role !== 'drawer') return;
      if (role === 'drawer') {
        // mesma pilha de slots do viewer3d (placePieceInBox 'drawer')
        const count = drawerRole.length;
        const index = drawerRole.indexOf(part);
        const slotH = H / count;
        const drawerH = Math.min(part.height_mm || 0, slotH * 0.9);
        const drawerW = Math.min(part.width_mm || 0, W * 0.97);
        const drawerD = Math.min(part.depth_mm || 0, D * 0.9);
        const centerY = slotH * (count - index - 0.5) + (part.offset_y_mm || 0);
        drawers.push({ part, x0: W / 2 - drawerW / 2 + (part.offset_x_mm || 0), w: drawerW, bottomY: centerY - drawerH / 2, d: drawerD });
      } else {
        // posição própria (free/other com slide_out) — zero-absoluto
        drawers.push({
          part,
          x0: part.offset_x_mm || 0, w: part.width_mm || 0,
          bottomY: part.offset_y_mm || 0, d: part.depth_mm || 0
        });
      }
    });
    if (!drawers.length) return;

    const laterals = boxes.filter(function (b) { return b.tAxis === 'x'; });
    if (!laterals.length) return;

    drawers.forEach(function (dr) {
      const lens = Object.keys(table).map(Number).filter(function (n) { return n > 0; }).sort(function (a, b) { return a - b; });
      let len = null;
      lens.forEach(function (L2) { if (L2 <= dr.d + 0.5) len = L2; });
      if (!len) return;
      const dists = table[len] || table[String(len)] || [];
      const drCenter = dr.x0 + dr.w / 2;
      laterals.forEach(function (lb) {
        const gapLeft = Math.abs(dr.x0 - (lb.x0 + lb.sx));  // lateral à esquerda da gaveta
        const gapRight = Math.abs((dr.x0 + dr.w) - lb.x0);  // lateral à direita
        if (Math.min(gapLeft, gapRight) > 30) return;
        const entersPositive = drCenter >= lb.x0 + lb.sx / 2;
        dists.forEach(function (dist) {
          emitLocalHole(store, lb, {
            u: (dr.bottomY + height) - lb.y0,  // uAxis da lateral = Y (altura)
            v: lb.sz - dist,                   // vAxis = Z; frente = z0+sz
            edge: null,
            entersPositive: entersPositive,
            diameter: dia, depth: depth
          });
        });
      });
    });
  }

  // 3d. SUPORTE DE PRATELEIRA NA LATERAL (migration 045) — peça marcada com
  // drill_shelf_support (checkbox no componente) gera na(s) lateral(is) em
  // que suas pontas encostam (tolerância touch_tolerance_mm) 2 furos-piloto
  // por lado: um recuado shelf_front_setback_mm da borda FRONTAL da
  // prateleira e outro shelf_back_setback_mm da borda de TRÁS, na altura do
  // centro da espessura dela + shelf_vertical_offset_mm (ajuste fino pro
  // padrão do suporte, ex: Häfele ixconnect Tab 15 Ø3). Os recuos são
  // ancorados na PRATELEIRA (não na lateral) de propósito: prateleira
  // recuada do fundo/frente continua com o furo exatamente sob ela.
  function collectShelfSupportHoles(store, boxes, settings) {
    if (!settings || settings.shelf_enabled === false) return;
    const dia = Number(settings.shelf_diameter_mm) || 3;
    const depth = Number(settings.shelf_depth_mm) || 10;
    const front = Number(settings.shelf_front_setback_mm) || 37;
    const back = Number(settings.shelf_back_setback_mm) || 37;
    const vOff = Number(settings.shelf_vertical_offset_mm) || 0;
    const tol = Number(settings.touch_tolerance_mm) || 5;

    const laterals = boxes.filter(function (b) { return b.tAxis === 'x'; });
    if (!laterals.length) return;

    boxes.forEach(function (sb) {
      if (!sb.part.drill_shelf_support) return;
      if (sb.tAxis !== 'y') return; // prateleira = chapa deitada (espessura no Y)
      const yHole = sb.y0 + sb.sy / 2 + vOff;
      const zHoles = [sb.z0 + sb.sz - front, sb.z0 + back];
      laterals.forEach(function (lb) {
        if (lb === sb) return;
        // a ponta da prateleira precisa encostar numa das faces da lateral
        const dLeft = Math.abs(sb.x0 - (lb.x0 + lb.sx));  // lateral à esquerda
        const dRight = Math.abs((sb.x0 + sb.sx) - lb.x0); // lateral à direita
        if (Math.min(dLeft, dRight) > tol) return;
        const entersPositive = (sb.x0 + sb.sx / 2) >= lb.x0 + lb.sx / 2;
        zHoles.forEach(function (z) {
          emitLocalHole(store, lb, {
            u: yHole - lb.y0,  // uAxis da lateral = Y (altura)
            v: z - lb.z0,      // vAxis = Z (profundidade)
            edge: null,
            entersPositive: entersPositive,
            diameter: dia, depth: depth
          });
        });
      });
    });
  }

  // ---- percurso recursivo do módulo ------------------------------------
  // parts = saída de resolvePiecesForViewer (admin.js); container = {W,H,D}
  // em mm. Coleta furos de TODAS as peças-folha (recursão em child_pieces
  // com o volume local da peça-módulo, igual buildModuleAssembly no 3D).
  function collectAssembly(store, parts, W, H, D, config) {
    const built = buildBoxes(parts, W, H, D);
    collectCounterHoles(store, built.boxes, config.drillingsByComponent, config.settings);
    collectHingePlates(store, parts, built.boxes, config.settings);
    collectSlideHoles(store, parts, built.boxes, W, H, D, config.settings);
    collectShelfSupportHoles(store, built.boxes, config.settings);
    (parts || []).forEach(function (part) {
      if (part.is_module && part.child_pieces && part.child_pieces.length) {
        collectAssembly(store, part.child_pieces, part.width_mm, part.height_mm, part.depth_mm, config);
        return;
      }
      if (part.is_module) return;
      collectStandardHoles(store, part, built.byPart.get(part) || null, config.drillingsByComponent);
      collectHingeHoles(store, part, config.settings);
    });
  }

  // ---- formatador .ban (MicroDrawBan_XML v3.0) --------------------------
  // Estrutura copiada dos .ban de exemplo da máquina do usuário. Y é
  // NEGATIVO no arquivo (cadastro/geração usam y positivo, negado aqui).
  function holeToXml(hole, C, L, E) {
    const dia = fmt(hole.diameter);
    const depth = Math.min(hole.depth, hole.face === 'face' || hole.face === 'verso' ? E : Math.max(C, L));
    switch (hole.face) {
      case 'face': // HoleV entrando pela face de cima
        return '<HoleV Name="" Face="A" Start="' + fmt(hole.x) + ' -' + fmt(hole.y) + ' -0" End="'
          + fmt(hole.x) + ' -' + fmt(hole.y) + ' -' + fmt(depth) + '" Diameter="' + dia + '" IsCuted="0"/>';
      case 'verso': // PALPITE (sem exemplo real com Face B) — entra por baixo
        return '<HoleV Name="" Face="B" Start="' + fmt(hole.x) + ' -' + fmt(hole.y) + ' -' + fmt(E) + '" End="'
          + fmt(hole.x) + ' -' + fmt(hole.y) + ' -' + fmt(E - depth) + '" Diameter="' + dia + '" IsCuted="0"/>';
      case 'borda_esq': // HoleH na borda x=0 (Face L confirmado nos exemplos)
        return '<HoleH Name="" Face="L" Start="0 -' + fmt(hole.y) + ' -' + fmt(E / 2) + '" End="'
          + fmt(depth) + ' -' + fmt(hole.y) + ' -' + fmt(E / 2) + '" Diameter="' + dia + '" IsCuted="0"/>';
      case 'borda_dir': // HoleH na borda x=Width (Face R confirmado)
        return '<HoleH Name="" Face="R" Start="' + fmt(C) + ' -' + fmt(hole.y) + ' -' + fmt(E / 2) + '" End="'
          + fmt(C - depth) + ' -' + fmt(hole.y) + ' -' + fmt(E / 2) + '" Diameter="' + dia + '" IsCuted="0"/>';
      case 'borda_sup': // PALPITE de código de face (borda y=0)
        return '<HoleH Name="" Face="T" Start="' + fmt(hole.x) + ' 0 -' + fmt(E / 2) + '" End="'
          + fmt(hole.x) + ' -' + fmt(depth) + ' -' + fmt(E / 2) + '" Diameter="' + dia + '" IsCuted="0"/>';
      case 'borda_inf': // PALPITE de código de face (borda y=Hight)
        return '<HoleH Name="" Face="B" Start="' + fmt(hole.x) + ' -' + fmt(L) + ' -' + fmt(E / 2) + '" End="'
          + fmt(hole.x) + ' -' + fmt(L - depth) + ' -' + fmt(E / 2) + '" Diameter="' + dia + '" IsCuted="0"/>';
      default:
        return '';
    }
  }

  function buildBanXml(name, C, L, E, holes) {
    const now = new Date();
    const pad = function (n) { return String(n).padStart(2, '0'); };
    const time = now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate())
      + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());
    const lines = [];
    lines.push('<MicroDrawBan_XML Version="3.0" Time="' + time + '" Source="" SourceType="BAN">');
    lines.push('<Plane Name="' + esc(name) + '" Code="' + esc(name) + '" Material="" PlaneNo=" " Width="'
      + C.toFixed(1) + '" Hight="' + L.toFixed(1) + '" Thickness="' + fmt(E)
      + '" Grain="DIR_NONE" EdgeFBLR="0 ,0 ,0 ,0" PlaneSize="1" MachineBase="-1">');
    lines.push('<Outline>');
    lines.push('<Point Value="0 -' + L.toFixed(1) + ' 0"/>');
    lines.push('<Point Value="' + C.toFixed(1) + ' -' + L.toFixed(1) + ' 0"/>');
    lines.push('<Point Value="' + C.toFixed(1) + ' 0 0"/>');
    lines.push('<Point Value="0 0 0"/>');
    lines.push('<Point Value="0 -' + L.toFixed(1) + ' 0"/>');
    lines.push('</Outline>');
    holes.forEach(function (h) {
      const xml = holeToXml(h, C, L, E);
      if (xml) lines.push(xml);
    });
    lines.push('</Plane>');
    lines.push('</MicroDrawBan_XML>');
    return lines.join('\r\n') + '\r\n'; // CRLF, igual aos arquivos da máquina
  }

  // ---- entrada principal -------------------------------------------------
  // items: [{ moduleName, parts, W, H, D, quantity }] — um por order_item,
  //        parts já resolvidos (resolvePiecesForViewer) e quantity = qty do
  //        item no carrinho (multiplica todas as peças de dentro).
  // config: { drillingsByComponent: {component_id: [rows]},
  //           settings: {row de drilling_settings} }
  //        (config.touchHoles, do padrão global antigo, é IGNORADO —
  //        migration 043 trocou o toque global pela propagação por
  //        componente.)
  // Coleta e DEDUPLICA as peças furadas (sem formatar em XML) — usada pelo
  // generateOrderFiles (export .ban) e pela visualização de furação do admin
  // (Teste de cálculo do módulo), pra desenho e arquivo nunca divergirem.
  // A lateral direita (espelhada) gera assinatura própria — nunca agrupa com
  // a esquerda.
  // Devolve [{ module_name, reference, comprimento_mm, largura_mm,
  //            espessura_mm, holes: [{face,x,y,diameter,depth}], quantity }].
  function collectOrderPieces(items, config) {
    const fileMap = new Map(); // assinatura -> registro agregado

    (items || []).forEach(function (item) {
      const store = new Map(); // part -> [holes]
      collectAssembly(store, item.parts, item.W, item.H, item.D, config);

      // TODAS as peças-folha de fabricação entram (peça sem furo nenhum
      // NÃO gera arquivo — máquina não precisa de .ban vazio)
      const walk = function (parts) {
        (parts || []).forEach(function (part) {
          if (part.is_module) { walk(part.child_pieces); return; }
          const holes = store.get(part) || [];
          if (!holes.length) return;
          if (part.origin === 'comprado') return; // ferragem comprada não fura
          const t = splitThickness(part.width_mm, part.height_mm, part.depth_mm, part.positioning);
          const m = machineDims(t);
          // ordena furos (face primeiro, depois posição) pra assinatura ser
          // estável entre instâncias idênticas
          const sorted = holes.slice().sort(function (a, b) {
            return (a.face > b.face ? 1 : a.face < b.face ? -1 : 0) || (a.x - b.x) || (a.y - b.y) || (a.diameter - b.diameter);
          });
          const signature = [item.moduleName, part.reference, m.C.toFixed(1), m.L.toFixed(1), m.E.toFixed(1),
            JSON.stringify(sorted.map(function (h) { return [h.face, Math.round(h.x * 10), Math.round(h.y * 10), h.diameter, Math.round(h.depth * 10)]; }))
          ].join('|');
          if (!fileMap.has(signature)) {
            fileMap.set(signature, {
              module_name: item.moduleName,
              reference: part.reference || 'peca',
              comprimento_mm: m.C, largura_mm: m.L, espessura_mm: m.E,
              holes: sorted, quantity: 0
            });
          }
          fileMap.get(signature).quantity += (item.quantity || 1);
        });
      };
      walk(item.parts);
    });

    return Array.from(fileMap.values());
  }

  function generateOrderFiles(items, config) {
    const sanitize = function (s) {
      return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'peca';
    };

    let seq = 0;
    return collectOrderPieces(items, config).map(function (rec) {
      seq += 1;
      const base = String(seq).padStart(3, '0') + '_' + sanitize(rec.reference) + '_'
        + Math.round(rec.comprimento_mm) + 'x' + Math.round(rec.largura_mm) + 'x' + Math.round(rec.espessura_mm);
      return {
        filename: base + '.ban',
        content: buildBanXml(base, rec.comprimento_mm, rec.largura_mm, rec.espessura_mm, rec.holes),
        quantity: rec.quantity,
        reference: rec.reference,
        module_name: rec.module_name,
        comprimento_mm: rec.comprimento_mm,
        largura_mm: rec.largura_mm,
        espessura_mm: rec.espessura_mm,
        holes_count: rec.holes.length
      };
    });
  }

  global.Drilling = {
    generateOrderFiles: generateOrderFiles,
    collectOrderPieces: collectOrderPieces,
    buildBanXml: buildBanXml,
    // expostos pra teste/diagnóstico (e pra prévia 2D do admin usar a MESMA
    // correção de sentido do gerador — resolveDrillingHoleXY)
    _internals: { splitThickness, machineDims, localToMachine, machineToLocal, edgeFace, edgeRealUV, resolveDrillingHoleXY, pieceBox, buildBoxes }
  };
})(typeof window !== 'undefined' ? window : globalThis);
// migration 043 — propagação por componente + espelhamento esq/dir
