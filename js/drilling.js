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
//  2b. CONTRA-FURO REVERSO (migration 054) — furo de FACE cadastrado com
//     counter_diameter/counter_depth: quando a BORDA de outra peça encosta
//     NAQUELA face (peça em pé apoiada, ex: lateral sobre o topcover), a
//     peça apoiada recebe um furo entrando pela borda que encostou, no ponto
//     exato do contato (ex: cavilha Ø8 / canal do bolt minifix). Se a linha
//     também tiver counter_face_* (Ø/prof/offset), a peça apoiada ganha AINDA
//     o copo na FACE dela (tambor minifix Ø12), na mesma linha do furo de
//     borda, a offset mm da borda que encostou, entrando pela face voltada
//     pro interior do módulo. É o sistema base→lateral ao contrário.
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
    if (role === 'drawer_side') {
      // LATERAL DE GAVETA (migration 118) — mesma caixa de 'left'/'right'
      // (espessura no X, altura no Y, profundidade no Z), só que aqui a
      // ALTURA é a MENOR das duas medidas que sobram e a PROFUNDIDADE é a
      // MAIOR: é uma lateral deitada. Ver placePieceInBox no viewer3d.js.
      // Com o cadastro 19.5/H/D e H<D as duas contas coincidem; a diferença
      // só aparece se o cadastro escrever as medidas na outra ordem.
      //
      // ESTA BRANCH FALTAVA (2026-08-18) e o sintoma foi exatamente o da
      // armadilha do arquivo "4 cópias do resolvedor de peças": pieceBox
      // devolvia null pro papel novo, a lateral não entrava no contato
      // borda-face, o contra-furo da travessa nunca chegava nela e a peça
      // sumia da lista de furação — sem erro, sem aviso.
      //
      // t2 acompanha a troca: o plano local da furação é u = faceA (altura),
      // v = faceB (profundidade), igual à lateral do casco. Sem isso o padrão
      // de furos sairia transposto quando as medidas vêm na outra ordem.
      const t2 = {
        thickness: t.thickness,
        faceA: Math.min(t.faceA, t.faceB),
        faceB: Math.max(t.faceA, t.faceB)
      };
      return {
        part, role, t: t2,
        x0: offX, sx: t2.thickness,
        y0: offY, sy: t2.faceA,
        z0: offZ, sz: t2.faceB,
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
  // { face, x, y, diameter, depth, tipo } já em coordenadas da MÁQUINA (x/y
  // positivos; o formatador nega o y). face: 'face'|'verso'|'borda_esq'|
  // 'borda_dir'|'borda_sup'|'borda_inf'.
  //
  // ======================================================================
  // `tipo` — O CARIMBO DE ORIGEM DO FURO (2026-08-18, migration 119)
  // ======================================================================
  // Serve pra dizer QUE FERRAGEM entra neste furo. Não é enfeite: sem ele o
  // vínculo item comprado <-> módulo é impossível de fazer certo.
  //
  // O caso que obrigou: a migration 114 fixou "Ø8 = cavilha" e a 116 usa Ø8
  // como PINO DO MINIFIX. Mesmo diâmetro, mesma face, profundidades
  // parecidas. Contar "todo furo de Ø8 de face = 1 cavilha" contaria a
  // cavilha certa MAIS um fantasma em cada junta minifix do tipo da base.
  //
  // O dado que separa os dois EXISTE no cadastro (a coluna counter_face_*, o
  // tambor) e morria aqui: o furo emitido era só geometria. Agora cada ponto
  // de emissão carimba o que ele já sabe — informação que estava sendo
  // jogada fora, não informação nova.
  //
  //   proprio_face / proprio_borda   do cadastro da PRÓPRIA peça
  //   contrafuro_face                recebido na FACE por propagação de uma
  //                                  BORDA vizinha (= pino do minifix na
  //                                  lateral; NÃO é cavilha)
  //   contrafuro_borda               recebido na BORDA por propagação de uma
  //                                  FACE vizinha (canal da cavilha/do pino)
  //   copo_tambor                    o Ø12 do tambor minifix (counter_face_*)
  //   copo_dobradica / marcacao_dobradica / base_dobradica
  //   corredica / suporte_prateleira
  //
  // O .BAN NÃO MUDA UM BYTE: buildBanXml lê face/x/y/diameter/depth e ignora
  // qualquer campo a mais. Foi conferido antes de subir.
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
    addHole(store, box.part, { face, x: pos.x, y: pos.y, diameter: h.diameter, depth: h.depth, tipo: h.tipo || null });
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
  // DE ONDE SAEM OS FUROS DE UMA PEÇA (migration 105).
  //
  // Duas origens, nesta ordem:
  //   1. o PROGRAMA escolhido na linha do módulo (part.drilling_pattern_id) —
  //      a linha "flatbord", em que existem só duas chapas cruas e a função
  //      (e portanto a furação) vem do USO;
  //   2. a furação do COMPONENTE (component_drillings) — o modelo antigo, em
  //      que cada peça especializada carrega os próprios furos.
  //
  // O programa GANHA quando existe. Sem ele, nada muda: os 62 módulos antigos
  // seguem pelo caminho 2, byte a byte como antes. Era isto que faltava pro
  // módulo novo gerar furo nenhum — o select gravava a escolha e o gerador
  // continuava perguntando ao componente, que não tem furação.
  function furosDaPeca(part, drillingsByComponent, holesByPattern) {
    if (!part) return null;
    if (part.drilling_pattern_id && holesByPattern) {
      const doPrograma = holesByPattern[part.drilling_pattern_id];
      if (doPrograma && doPrograma.length) return doPrograma;
    }
    if (!part.component_id || !drillingsByComponent) return null;
    return drillingsByComponent[part.component_id] || null;
  }

  // Com box (peça posicionável): passa pelo plano local pra aplicar o
  // espelhamento da gêmea 'right'. Sem box (drawer/handle/etc): direto,
  // como sempre foi.
  function collectStandardHoles(store, part, box, drillingsByComponent, holesByPattern) {
    const rows = furosDaPeca(part, drillingsByComponent, holesByPattern);
    if (!rows || !rows.length) return;
    const t = splitThickness(part.width_mm, part.height_mm, part.depth_mm, part.positioning);
    const vars = { C: t.faceA, L: t.faceB, E: t.thickness, W: part.width_mm || 0, H: part.height_mm || 0 };
    eachDrillingInstance(rows, vars, function (row, x, y, depth) {
      const isEdge = /^borda_/.test(row.face || '');
      // Furo do cadastro da PRÓPRIA peça.
      //
      // A distinção que decide a lista de ferragem: uma linha de FACE que
      // também declara counter_face_* (o tambor) é MINIFIX — este furo é o
      // canal do pino, e o tambor dele vai sair na peça vizinha como
      // 'copo_tambor'. Uma linha de face SEM tambor é CAVILHA.
      //
      // As duas são Ø8 na mesma face (migrations 114 e 116). Sem esta
      // separação, o topcover pagaria uma cavilha E um minifix pela mesma
      // junta — a ferragem contada duas vezes, cada uma por um nome.
      // Quem consome o minifix é sempre o tambor, nunca este furo.
      const temTambor = Number(row.counter_face_diameter_mm) > 0
        && Number(row.counter_face_depth_mm) > 0
        && Number(row.counter_face_offset_mm) > 0;
      const tipo = isEdge ? 'proprio_borda' : (temTambor ? 'proprio_face_tambor' : 'proprio_face');
      if (!box) {
        const r = resolveDrillingHoleXY(t, row, x, y);
        if (r) addHole(store, part, { face: r.face, x: r.x, y: r.y, diameter: Number(row.diameter_mm), depth: depth, tipo: tipo });
        return;
      }
      if (isEdge) {
        const r = edgeRealUV(t, row, x, y);
        if (r) {
          emitLocalHole(store, box, {
            u: r.u, v: r.v, edge: r.edge,
            diameter: Number(row.diameter_mm), depth: depth, tipo: tipo
          });
        }
        return;
      }
      emitLocalHole(store, box, {
        u: x, v: y, edge: null, face: row.face || 'face',
        diameter: Number(row.diameter_mm), depth: depth, tipo: tipo
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
        depth: Number(settings.hinge_cup_depth_mm) || 13,
        tipo: 'copo_dobradica'
      });
      [-markOffset, markOffset].forEach(function (dm) {
        const mk = localToMachine(t, uMark, v + dm);
        addHole(store, part, {
          face: 'face', x: mk.x, y: mk.y,
          diameter: Number(settings.hinge_mark_diameter_mm) || 3,
          depth: Number(settings.hinge_mark_depth_mm) || 2,
          tipo: 'marcacao_dobradica'
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
  //
  // 2b. CONTRA-FURO REVERSO (migration 054) — pra cada furo de FACE
  // cadastrado com counter_diameter/counter_depth, acha a peça cuja BORDA
  // encosta NAQUELA face (peça em pé apoiada, ex: lateral sobre o topcover)
  // e fura na peça apoiada: (a) o furo entrando pela borda do contato
  // (counter_*, ex: cavilha Ø8 / canal do bolt minifix) e (b) opcionalmente
  // o copo na FACE dela (counter_face_*, tambor minifix), a
  // counter_face_offset_mm da borda que encostou, entrando pela face voltada
  // pro INTERIOR do módulo. W/H/D = container, pra achar o interior.
  function collectCounterHoles(store, boxes, drillingsByComponent, settings, W, H, D, holesByPattern) {
    if (!drillingsByComponent && !holesByPattern) return;
    const tol = (settings && Number(settings.touch_tolerance_mm)) || 5;
    const ORIG = { x: 'x0', y: 'y0', z: 'z0' };
    const SIZE = { x: 'sx', y: 'sy', z: 'sz' };
    const MODULE_CENTER = { x: (W || 0) / 2, y: (H || 0) / 2, z: (D || 0) / 2 };

    boxes.forEach(function (src) {
      // Mesma origem dupla dos furos padrão (programa ganha do componente) —
      // sem isto, a propagação de contra-furo só existiria pros módulos
      // antigos e a linha nova perderia as cavilhas/minifix.
      const rows = furosDaPeca(src.part, drillingsByComponent, holesByPattern);
      if (!rows || !rows.length) return;
      const counterRows = rows.filter(function (r) {
        return Number(r.counter_diameter_mm) > 0 && Number(r.counter_depth_mm) > 0;
      });
      if (!counterRows.length) return;
      const t = src.t;
      const vars = { C: t.faceA, L: t.faceB, E: t.thickness, W: src.part.width_mm || 0, H: src.part.height_mm || 0 };

      eachDrillingInstance(counterRows, vars, function (row, x, y) {
        if (!/^borda_/.test(row.face || '')) {
          collectFaceCounterHole(store, boxes, src, row, x, y, tol, ORIG, SIZE, MODULE_CENTER);
          return;
        }
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
            depth: Number(row.counter_depth_mm),
            // Junta do tipo BASE (migration 116): a BORDA da base encontra a
            // FACE da lateral, o tambor é furo próprio da base e é o PINO que
            // atravessa pra cá. Por isso este Ø8 na face NÃO é cavilha —
            // carimbá-lo é justamente o que impede a lista de compra de
            // inventar uma cavilha em cada minifix.
            tipo: 'contrafuro_face'
          });
        });
      });
    });
  }

  // Um furo de FACE do src (linha face/verso com counter_*) propagado pra
  // peça cuja borda encosta na face — ver comentário 2b acima. x/y da linha
  // já avaliados (coordenadas LOCAIS do plano de cadastro faceA×faceB).
  // OS DOIS LADOS, NÃO SÓ O DECLARADO (2026-08-16).
  //
  // Matt: "ele gera contra furo pra onde tocar" — e não era o que acontecia.
  // O topcover de CIMA e o de BAIXO usam o MESMO programa (é a mesma peça,
  // espelhada), com as linhas cadastradas em face='face'. Só que 'face' é o
  // lado POSITIVO do eixo da espessura: no topcover inferior isso é a
  // superfície de cima, onde a lateral realmente encosta, e funciona; no
  // topcover superior a lateral encosta EMBAIXO, o plano calculado passava
  // pela superfície de cima, nenhuma peça casava e nada propagava. Silêncio
  // total: o topcover saía furado e a lateral lisa.
  //
  // A saída não é cadastrar dois programas (o mesmo furo, duas vezes, pra
  // divergirem no primeiro ajuste): é procurar quem encosta. A face DECLARADA
  // continua tendo prioridade — se alguém encosta nela, é ela que vale. Só
  // quando não há ninguém do lado declarado é que o outro lado é tentado.
  // Assim nada muda em cadastro que já funcionava, e o caso simétrico passa a
  // funcionar sem cadastro novo.
  //
  // Por que não olhar os dois SEMPRE: uma peça pode encostar nos dois lados
  // (prateleira entre dois módulos), e a cavilha é UMA — furar os dois
  // vizinhos poria furo em peça que não leva nada.
  function collectFaceCounterHole(store, boxes, src, row, x, y, tol, ORIG, SIZE, MODULE_CENTER) {
    const declarada = ((row.face || 'face') === 'face') !== (src.role === 'right');
    if (propagarPelaFace(store, boxes, src, row, x, y, tol, ORIG, SIZE, MODULE_CENTER, declarada) > 0) return;
    propagarPelaFace(store, boxes, src, row, x, y, tol, ORIG, SIZE, MODULE_CENTER, !declarada);
  }

  // Devolve quantas peças receberam contra-furo por esta face.
  function propagarPelaFace(store, boxes, src, row, x, y, tol, ORIG, SIZE, MODULE_CENTER, physPositive) {
    const t = src.t;
    let emitidos = 0;
    const facePlane = src[ORIG[src.tAxis]] + (physPositive ? src[SIZE[src.tAxis]] : 0);

    // ponto do furo em coordenadas do módulo (sobre o plano da face furada)
    const p = {};
    p[src.uAxis] = src[ORIG[src.uAxis]] + x;
    p[src.vAxis] = src[ORIG[src.vAxis]] + y;
    p[src.tAxis] = facePlane;

    boxes.forEach(function (tgt) {
      if (tgt === src) return;
      // peça apoiada = peça cuja EXTENSÃO DE FACE corre no eixo da espessura
      // do src (a espessura dela é PERPENDICULAR — senão o contato seria
      // face-com-face, que não é este caso)
      if (tgt.tAxis === src.tAxis) return;
      const extAxis = src.tAxis;                       // eixo em que a borda do tgt encosta
      const edgeIsU = tgt.uAxis === extAxis;           // extAxis é o u ou o v local do tgt?
      const lo = tgt[ORIG[extAxis]];
      const size = tgt[SIZE[extAxis]];
      // do lado positivo da face, encosta a ponta DE BAIXO do tgt (lo);
      // do lado negativo, a ponta de cima (lo+size)
      const touchEnd = physPositive ? lo : lo + size;
      if (Math.abs(touchEnd - facePlane) > tol) return;
      // o ponto precisa cair DENTRO do retângulo da borda do tgt: dentro da
      // espessura dele e dentro do comprimento da borda
      const pt = p[tgt.tAxis] - tgt[ORIG[tgt.tAxis]];
      if (pt < -0.5 || pt > tgt[SIZE[tgt.tAxis]] + 0.5) return;
      const alongAxis = edgeIsU ? tgt.vAxis : tgt.uAxis;
      const pa = p[alongAxis] - tgt[ORIG[alongAxis]];
      if (pa < -0.5 || pa > tgt[SIZE[alongAxis]] + 0.5) return;

      // (a) furo entrando pela borda do contato (cavilha / canal do bolt)
      const edge = physPositive ? (edgeIsU ? 'u0' : 'v0') : (edgeIsU ? 'u1' : 'v1');
      emitidos += 1;
      emitLocalHole(store, tgt, {
        u: edgeIsU ? 0 : pa, v: edgeIsU ? pa : 0, edge: edge,
        diameter: Number(row.counter_diameter_mm),
        depth: Number(row.counter_depth_mm),
        // Contrapartida na peça apoiada. A ferragem em si é contada do lado
        // de quem DEFINE a junta (o furo próprio de face do src) ou pelo
        // tambor logo abaixo — nunca aqui, senão a mesma cavilha seria
        // contada duas vezes, uma por ponta.
        tipo: 'contrafuro_borda'
      });

      // (b) copo na FACE da peça apoiada (tambor minifix), na mesma linha,
      // a offset mm da borda que encostou
      const camDia = Number(row.counter_face_diameter_mm);
      const camDepth = Number(row.counter_face_depth_mm);
      const camOff = Number(row.counter_face_offset_mm);
      if (!(camDia > 0) || !(camDepth > 0) || !(camOff > 0)) return;
      const camExt = physPositive ? camOff : size - camOff; // coord. local no eixo da extensão
      // entra pela face voltada pro interior do módulo (tambor acessível)
      const tgtMid = tgt[ORIG[tgt.tAxis]] + tgt[SIZE[tgt.tAxis]] / 2;
      const entersPositive = tgtMid <= MODULE_CENTER[tgt.tAxis];
      emitLocalHole(store, tgt, {
        u: edgeIsU ? camExt : pa, v: edgeIsU ? pa : camExt, edge: null,
        entersPositive: entersPositive,
        diameter: camDia, depth: camDepth,
        // O TAMBOR. É por ele que o minifix é contado, e por nenhum outro
        // furo da junta: o tambor é ÚNICO por minifix, não importa em qual
        // das duas peças ele caiu nem qual das duas geometrias de junta é.
        tipo: 'copo_tambor'
      });
    });
    return emitidos;
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
            diameter: plateDia, depth: plateDepth,
            tipo: 'base_dobradica'
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
            diameter: dia, depth: depth,
            tipo: 'corredica'
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
            diameter: dia, depth: depth,
            // 1 furo = 1 suporte. A conta "4 por prateleira" que o Matt deu
            // sai daqui sozinha (2 furos por lateral x 2 laterais) — não há
            // nenhum "4" digitado em lugar nenhum pra ficar velho.
            tipo: 'suporte_prateleira'
          });
        });
      });
    });
  }

  // 3e. CONTRA-FURO DO SUPORTE DO CABIDE (2026-08-20, Matt: "o suporte do
  // cabide tem contra furo. furo de 3mm diametro e 2mm profundidade bem no
  // meio do suporte"). Mesma ideia de collectShelfSupportHoles logo acima
  // (peça 'free' que encosta numa lateral ganha um furo-piloto nela) — só
  // que aqui NÃO precisa de nenhum checkbox de opt-in: TODA peça
  // shape_type='oval_rod' (o cabide, migration 062) sempre tem suporte nas
  // duas pontas (ver js/viewer3d.js buildOvalRodContent, "2 suportes nas
  // pontas... desenhados COAXIAIS ao tubo"), então o furo é automático.
  //
  // TOLERÂNCIA PRÓPRIA (não usa settings.touch_tolerance_mm, que é ~5mm e é
  // pensado pra encaixe justo de painel-com-painel): o cabide nasce com uma
  // margem FIXA de 12mm de cada lado dentro do vão (js/layout-engine.js
  // emitContent, ramo acc.forma==='barra': "x: box.x + 12, w: box.w - 24") —
  // é ESSA a distância real entre a ponta do tubo e a lateral, não um
  // encaixe de 5mm. 15mm cobre a margem + folga de arredondamento.
  //
  // Furo SEMPRE no meio do suporte = centro vertical/de profundidade da
  // PRÓPRIA peça (y0+sy/2, z0+sz/2) — o suporte é coaxial ao tubo, então o
  // centro do tubo já é o centro do suporte.
  function collectCabideSupportHoles(store, boxes) {
    const CABIDE_SUPPORT_DIAMETER_MM = 3;
    const CABIDE_SUPPORT_DEPTH_MM = 2;
    const CABIDE_SUPPORT_TOUCH_TOLERANCE_MM = 15;

    const laterals = boxes.filter(function (b) { return b.tAxis === 'x'; });
    if (!laterals.length) return;

    boxes.forEach(function (rod) {
      if (!rod.part || rod.part.shape_type !== 'oval_rod') return;
      const yHole = rod.y0 + rod.sy / 2;
      const zHole = rod.z0 + rod.sz / 2;
      laterals.forEach(function (lb) {
        if (lb === rod) return;
        const dLeft = Math.abs(rod.x0 - (lb.x0 + lb.sx));   // lateral à esquerda do cabide
        const dRight = Math.abs((rod.x0 + rod.sx) - lb.x0); // lateral à direita
        if (Math.min(dLeft, dRight) > CABIDE_SUPPORT_TOUCH_TOLERANCE_MM) return;
        const entersPositive = (rod.x0 + rod.sx / 2) >= lb.x0 + lb.sx / 2;
        emitLocalHole(store, lb, {
          u: yHole - lb.y0,  // uAxis da lateral = Y (altura)
          v: zHole - lb.z0,  // vAxis = Z (profundidade)
          edge: null,
          entersPositive: entersPositive,
          diameter: CABIDE_SUPPORT_DIAMETER_MM, depth: CABIDE_SUPPORT_DEPTH_MM,
          tipo: 'suporte_cabide'
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
    collectCounterHoles(store, built.boxes, config.drillingsByComponent, config.settings, W, H, D, config.holesByPattern);
    collectHingePlates(store, parts, built.boxes, config.settings);
    collectSlideHoles(store, parts, built.boxes, W, H, D, config.settings);
    collectShelfSupportHoles(store, built.boxes, config.settings);
    collectCabideSupportHoles(store, built.boxes);
    (parts || []).forEach(function (part) {
      if (part.is_module && part.child_pieces && part.child_pieces.length) {
        collectAssembly(store, part.child_pieces, part.width_mm, part.height_mm, part.depth_mm, config);
        return;
      }
      if (part.is_module) return;
      collectStandardHoles(store, part, built.byPart.get(part) || null, config.drillingsByComponent, config.holesByPattern);
      collectHingeHoles(store, part, config.settings);
    });
  }


  // ---- usinagem: recortes em L -> <SlotL> --------------------------------
  //
  // O QUE É: a lateral do toe 4½ leva um entalhe em L de 114 × 76 no canto da
  // frente EMBAIXO, e a da gola um de 76 × 40 no canto da frente EM CIMA (a
  // carcaça com gola + toe 4½ leva os DOIS na mesma lateral). Isso já existe
  // em `module_components.recortes` (migration 094), já é desenhado no 3D
  // (viewer3d.buildPanelGeometry) e já é cobrado (usinagem_m, migration 092).
  // Faltava só sair no arquivo da máquina — é o que este bloco faz.
  //
  // NÃO É PROPAGAÇÃO POR TOQUE (Matt, 2026-08-16: "o toekick é uma regra que
  // não precisa encostar pra gerar, quero deixar ela standart, só pras
  // laterais de toe 4 1/2"). O recorte é regra FIXA do uso, lida direto da
  // coluna. Contato só decide contra-furo (migrations 043/054).
  //
  // COMO A MÁQUINA RECEBE (arquivo real do Matt, 2026-08-16):
  //
  //   <SlotL Name="" Face="B" Start="0 -475.5 -7" End="1000 -475.5 -7"
  //          Width="6.0" IsCuted="0"/>
  //
  // SlotL é um rasgo RETO: Start/End variam num eixo só, Width é a largura da
  // ferramenta e o Z é a profundidade. ÁREA SE FAZ POR PASSES PARALELOS — no
  // exemplo dele três rasgos de 6,0 em -475,5 / -481 / -487 varrem uma faixa
  // de ~17,5mm. É essa a receita reproduzida aqui.
  //
  // ==== DOIS VALORES QUE PRECISAM DE CONFIRMAÇÃO NA MÁQUINA ====
  // `face` e `is_cuted_passante` são a única parte que não saiu de arquivo
  // real: o exemplo do Matt é rasgo CEGO (IsCuted="0", Z=-7 numa peça mais
  // grossa) e o recorte do toe/gola é PASSANTE. A leitura natural é
  // IsCuted="1" = corta a peça toda, mas leitura natural não é confirmação.
  // Estão isolados aqui pra virar um valor só de trocar depois do primeiro
  // teste na máquina — e expostos em Drilling.USINAGEM pra quem quiser
  // sobrescrever sem editar o arquivo.
  const USINAGEM = {
    ferramenta_mm: 6,        // Width do SlotL — a fresa do exemplo dele
    sobreposicao_mm: 0.5,    // quanto cada passe invade o anterior (só no bolsão)
    // 'contorno' = corte passante de canto sai em DOIS passes e o retalho cai
    //              solto (2 rasgos em vez de 22 numa lateral de toe 4½ + gola)
    // 'bolsao'   = varre a área inteira em passes paralelos; o material sai em
    //              cavaco, nada se solta. Mais lento, mas sem peça solta na mesa.
    estrategia: 'contorno',
    // ALÍVIO DE CANTO (Matt, 2026-08-16: "cuida do raio de 3mm que pode
    // atrapalhar pra encostar as peças do gola ou toekick" / "pode avançar um
    // pouco um corte pra dentro").
    //
    // Fresa redonda não faz canto vivo: com Ø6 sobra uma unha de raio 3mm na
    // quina interna do L, e é justamente onde a ponta do painel do toe / da
    // gola assenta. A peça encostaria na unha e ficaria pra fora, com fresta.
    //
    // A cura é um dos cortes AVANÇAR além da quina: a ponta redonda dele
    // limpa a unha. Quem avança come 3mm (o raio) da peça que fica, e esses
    // 3mm ficam escondidos atrás da ponta do painel.
    //
    //   'um-corte'    (padrão) só o corte MAIS LONGO avança. A unha some e a
    //                 marca fica numa face só — é o que ele pediu.
    //   'dois-cortes' os dois avançam. Limpeza com folga, marca nas duas faces.
    //   'nenhum'      ninguém avança: nenhuma marca, mas a unha de 3mm fica e
    //                 o painel não assenta rente (só serve se a ponta do
    //                 painel for chanfrada na montagem).
    //
    // Qual dos dois avança no modo 'um-corte' é uma linha só, logo abaixo em
    // cornerCutSlots — se a marca ficar do lado errado pra montagem, inverte
    // ali.
    alivio_canto: 'um-corte',
    face: 'B',               // único Face visto num SlotL real
    is_cuted_passante: '1'   // PALPITE: 1 = passante. Confirmar na máquina.
  };

  // canto do recorte -> onde ele fica no plano local da peça.
  // u corre ao longo de faceA (na lateral: a ALTURA, u=0 embaixo);
  // v corre ao longo de faceB (na lateral: a PROFUNDIDADE, v=0 no FUNDO).
  // Mesma convenção do viewer3d (shape.x -> profundidade, shape.y -> altura).
  const CANTO_UV = {
    'frente-baixo': ['baixo', 'frente'],
    'frente-cima': ['cima', 'frente'],
    'fundo-baixo': ['baixo', 'fundo'],
    'fundo-cima': ['cima', 'fundo']
  };

  // Recortes da peça -> retângulos em coordenadas da MÁQUINA (x/y positivos,
  // o formatador nega o y), já com o espelhamento da gêmea direita aplicado
  // — o mesmo v' = faceB - v de emitLocalHole. Sem isso o entalhe da lateral
  // direita sairia no fundo em vez de na frente.
  function recorteRects(part) {
    const lista = (part && Array.isArray(part.recortes)) ? part.recortes : [];
    if (!lista.length) return [];
    const t = splitThickness(part.width_mm || 0, part.height_mm || 0, part.depth_mm || 0, part.positioning);
    const mirrored = (part.position_role === 'right');
    const out = [];
    lista.forEach(function (r) {
      if (!r) return;
      const h = Number(r.h) || 0, d = Number(r.d) || 0;
      const c = CANTO_UV[r.canto];
      // Recorte que comeria a peça inteira é cadastro errado, não usinagem:
      // mesma guarda do viewer3d, que devolve a caixa inteira nesse caso.
      if (!c || h <= 0 || d <= 0 || h >= t.faceA || d >= t.faceB) return;
      const u0 = (c[0] === 'baixo') ? 0 : t.faceA - h;
      const u1 = u0 + h;
      let v0 = (c[1] === 'fundo') ? 0 : t.faceB - d;
      let v1 = v0 + d;
      if (mirrored) { const a = t.faceB - v1; v1 = t.faceB - v0; v0 = a; }
      const p0 = localToMachine(t, u0, v0);
      const p1 = localToMachine(t, u1, v1);
      out.push({
        x0: Math.min(p0.x, p1.x), x1: Math.max(p0.x, p1.x),
        y0: Math.min(p0.y, p1.y), y1: Math.max(p0.y, p1.y),
        depth: t.thickness, passante: true, canto: r.canto
      });
    });
    return out;
  }

  // Retângulo -> passes paralelos de SlotL.
  //
  // Varre na direção MAIS LONGA (menos passes, menos tempo de máquina). Os
  // passes das pontas ficam a meia-ferramenta da borda, de modo que a aresta
  // da fresa encoste exatamente no limite do retângulo — nem sobra material,
  // nem come a peça além do recorte. Faixa mais estreita que a ferramenta
  // vira UM passe com Width reduzido, em vez de um passe largo demais.
  //
  // LIMITE FÍSICO, não do formato: o canto INTERNO do L sai com o raio da
  // fresa (3mm numa de 6). Quem precisar de canto vivo tem que quebrar na
  // mão — nenhuma ferramenta redonda faz canto reto.
  // Corte PASSANTE de canto: duas linhas e o retalho cai.
  //
  // O canto do L é um retângulo que toca DUAS bordas da peça. Se o corte
  // atravessa a chapa, não há por que varrer a área inteira: bastam os dois
  // rasgos que separam esse retângulo do resto, e ele se solta. Numa lateral
  // de toe 4½ + gola isso é 4 passes em vez de 22.
  //
  // A fresa anda DENTRO do retalho (centro a meia-ferramenta da linha de
  // corte), então a peça que fica preserva a medida exata do recorte — se
  // andasse em cima da linha, comeria meia-ferramenta do que deveria ficar.
  //
  // Os dois rasgos se cruzam na quina interna de propósito: sem esse
  // cruzamento sobra um filete inteiro segurando o retalho.
  //
  // Devolve null quando o retângulo NÃO é canto (não toca duas bordas
  // adjacentes) ou quando o corte é cego — nesses casos só o bolsão serve.
  function cornerCutSlots(rect, C, L) {
    if (!rect.passante) return null;
    const w = Math.max(USINAGEM.ferramenta_mm, 0.5);
    const tol = 0.05;
    const emX0 = rect.x0 <= tol, emX1 = rect.x1 >= C - tol;
    const emY0 = rect.y0 <= tol, emY1 = rect.y1 >= L - tol;
    if (emX0 === emX1 || emY0 === emY1) return null;   // não é canto
    // A fresa tem que caber dentro do retalho nos dois sentidos.
    if ((rect.x1 - rect.x0) < w || (rect.y1 - rect.y0) < w) return null;
    const cx = emX0 ? rect.x1 - w / 2 : rect.x0 + w / 2;
    const cy = emY0 ? rect.y1 - w / 2 : rect.y0 + w / 2;
    // Onde cada rasgo TERMINA, do lado da quina interna. Com alívio, o centro
    // da fresa vai até a quina (a ponta redonda limpa a unha); sem alívio,
    // para a meia-fresa antes. Do outro lado os dois vão até a borda da peça:
    // ali o centro para EM CIMA da borda e a ponta redonda sai fora da chapa,
    // que é o que garante saída limpa.
    // O rasgo VERTICAL (x constante) corre ao longo de Y, então o
    // comprimento dele é a altura do retângulo; o HORIZONTAL, a largura.
    // No modo 'um-corte' quem avança é o mais longo: é o passe principal, o
    // curto só arremata.
    const compVert = rect.y1 - rect.y0, compHoriz = rect.x1 - rect.x0;
    const modo = USINAGEM.alivio_canto;
    const avancaVert = (modo === 'dois-cortes') || (modo === 'um-corte' && compVert >= compHoriz);
    const avancaHoriz = (modo === 'dois-cortes') || (modo === 'um-corte' && compHoriz > compVert);
    const recuoVert = avancaVert ? 0 : w / 2;
    const recuoHoriz = avancaHoriz ? 0 : w / 2;
    const fimY = emY0 ? rect.y1 - recuoVert : rect.y0 + recuoVert;   // fim do rasgo vertical
    const fimX = emX0 ? rect.x1 - recuoHoriz : rect.x0 + recuoHoriz; // fim do rasgo horizontal
    return [
      { x0: cx, x1: cx, y0: emY0 ? rect.y0 : fimY, y1: emY0 ? fimY : rect.y1,
        width: w, depth: rect.depth, passante: true },
      { x0: emX0 ? rect.x0 : fimX, x1: emX0 ? fimX : rect.x1, y0: cy, y1: cy,
        width: w, depth: rect.depth, passante: true }
    ];
  }

  function rectToSlots(rect, C, L) {
    if (USINAGEM.estrategia === 'contorno') {
      const corte = cornerCutSlots(rect, C, L);
      if (corte) return corte;
    }
    const wMax = Math.max(USINAGEM.ferramenta_mm, 0.5);
    const passo = Math.max(wMax - USINAGEM.sobreposicao_mm, 0.5);
    const dx = rect.x1 - rect.x0, dy = rect.y1 - rect.y0;
    if (!(dx > 0) || !(dy > 0)) return [];
    const aoLongoDeX = dx >= dy;
    const faixa = aoLongoDeX ? dy : dx;
    const w = Math.min(wMax, faixa);
    const n = Math.max(1, Math.ceil((faixa - w) / passo) + 1);
    const c0 = (aoLongoDeX ? rect.y0 : rect.x0) + w / 2;
    const c1 = (aoLongoDeX ? rect.y1 : rect.x1) - w / 2;
    const slots = [];
    for (let i = 0; i < n; i++) {
      const c = (n === 1) ? (c0 + c1) / 2 : c0 + (c1 - c0) * (i / (n - 1));
      slots.push(aoLongoDeX
        ? { x0: rect.x0, x1: rect.x1, y0: c, y1: c, width: w, depth: rect.depth, passante: rect.passante }
        : { x0: c, x1: c, y0: rect.y0, y1: rect.y1, width: w, depth: rect.depth, passante: rect.passante });
    }
    return slots;
  }

  // Todos os passes de uma peça, prontos pro .ban.
  function slotsDaPeca(part) {
    const rects = recorteRects(part);
    if (!rects.length) return [];
    const m = machineDims(splitThickness(part.width_mm || 0, part.height_mm || 0, part.depth_mm || 0, part.positioning));
    const out = [];
    rects.forEach(function (r) {
      rectToSlots(r, m.C, m.L).forEach(function (s) { out.push(s); });
    });
    return out;
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

  function slotToXml(s) {
    return '<SlotL Name="" Face="' + USINAGEM.face + '" Start="' + fmt(s.x0) + ' -' + fmt(s.y0)
      + ' -' + fmt(s.depth) + '" End="' + fmt(s.x1) + ' -' + fmt(s.y1) + ' -' + fmt(s.depth)
      + '" Width="' + s.width.toFixed(1) + '" IsCuted="'
      + (s.passante ? USINAGEM.is_cuted_passante : '0') + '"/>';
  }

  function buildBanXml(name, C, L, E, holes, slots) {
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
    // usinagem depois dos furos, dentro do mesmo <Plane> — é onde os SlotL
    // aparecem no arquivo de exemplo da máquina.
    (slots || []).forEach(function (s) { lines.push(slotToXml(s)); });
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
          if (part.origin === 'comprado') return; // ferragem comprada não fura
          const slots = slotsDaPeca(part);
          // COR E SENTIDO DO VEIO — só pro DESENHO (visualizador de furação do
          // lote). O .ban não leva cor nenhuma; isto viaja no registro e o
          // formatador ignora.
          //
          // O eixo do veio no plano da máquina sai de graça da convenção do
          // formato: X é SEMPRE a maior das duas faces (machineDims escolhe
          // C = max(faceA, faceB)), e "comprimento" é justamente a maior. Logo
          // veio no comprimento = veio no X, largura = Y. Não precisa olhar o
          // flip — ele já foi resolvido ao escolher C.
          // swatch_hex pode estar VAZIO numa cor de textura (a foto da chapa
          // é o que representa ela; o hex é só o quadradinho da interface e
          // nem sempre foi preenchido). Sem ele a peça saía branca e parecia
          // que a cor não tinha chegado — mesmo com o nome certo na tela.
          // Aqui isso vira um bege de madeira neutro, e `cor_sem_swatch`
          // avisa a interface pra dizer POR QUE a cor não é a de verdade.
          // A COR DE VERDADE PODE ESTAR NA TEXTURA. Cor de madeira é
          // cadastrada com foto da chapa, e o swatch_hex fica no '#cccccc'
          // que o formulário preenche sozinho — foi o caso do Honey Carini:
          // a peça era pintada de cinza claro a 30% sobre branco, ou seja,
          // de nada. Quando existe textura, ela é o fundo; o hex vira só
          // reserva. '#cccccc' é tratado como "não escolhido" de propósito.
          const swatchBruto = (part.color && part.color.swatch_hex) || null;
          const swatch = (swatchBruto && swatchBruto.toLowerCase() !== '#cccccc') ? swatchBruto : null;
          const textura = (part.color && part.color.texture_url) || null;
          const corPeca = swatch || (part.color ? '#d7c4a3' : null);
          const semSwatch = !!(part.color && !swatch && !textura);
          // VEIO EFETIVO = veio da COR **ou** veio exigido pela peça.
          //
          // É a regra da migration 083, e errei ela na 1ª versão: lia só o
          // `veio` do componente e ignorava o `has_grain` da cor. Na linha
          // flatbord o componente é sempre 'livre' (a chapa crua não exige
          // orientação nenhuma), então marcar "tem veio" no Honey não mudava
          // nada na tela — foi o que o Matt viu. Quem sabe se o material TEM
          // veio é a cor; o componente só diz se aquela peça precisa de um
          // sentido ESPECÍFICO.
          //
          // Direção: a 083 trava "comprimento sempre no sentido do veio", e no
          // plano da máquina o X é sempre a maior face (machineDims escolhe
          // C = max). Logo veio da cor = veio no X. Só um componente pedindo
          // 'largura' explicitamente sai do X.
          const veioPeca = part.grain_dir || part.veio || 'livre';
          const corTemVeio = !!(part.color && part.color.has_grain);
          const veioEixo = veioPeca === 'largura' ? 'y'
            : ((veioPeca === 'comprimento' || corTemVeio) ? 'x' : null);
          // Peça sem furo NEM usinagem não gera arquivo (máquina não precisa
          // de .ban vazio). Com recorte e sem furo, GERA: o entalhe do toe 4½
          // é trabalho de máquina igual — antes desta linha a condição era só
          // `!holes.length` e a peça saía de fora.
          if (!holes.length && !slots.length) return;
          const t = splitThickness(part.width_mm, part.height_mm, part.depth_mm, part.positioning);
          const m = machineDims(t);
          // ordena furos (face primeiro, depois posição) pra assinatura ser
          // estável entre instâncias idênticas
          const sorted = holes.slice().sort(function (a, b) {
            return (a.face > b.face ? 1 : a.face < b.face ? -1 : 0) || (a.x - b.x) || (a.y - b.y) || (a.diameter - b.diameter);
          });
          const signature = [item.moduleName, part.reference, m.C.toFixed(1), m.L.toFixed(1), m.E.toFixed(1),
            JSON.stringify(sorted.map(function (h) { return [h.face, Math.round(h.x * 10), Math.round(h.y * 10), h.diameter, Math.round(h.depth * 10)]; })),
            // a usinagem entra na assinatura: duas peças com a MESMA furação e
            // recortes diferentes (lateral de toe 4½ x lateral lisa) não podem
            // colapsar no mesmo arquivo.
            JSON.stringify(slots.map(function (sl) { return [Math.round(sl.x0 * 10), Math.round(sl.y0 * 10), Math.round(sl.x1 * 10), Math.round(sl.y1 * 10), sl.width, Math.round(sl.depth * 10), sl.passante ? 1 : 0]; }))
          ].join('|');
          if (!fileMap.has(signature)) {
            fileMap.set(signature, {
              module_name: item.moduleName,
              reference: part.reference || 'peca',
              comprimento_mm: m.C, largura_mm: m.L, espessura_mm: m.E,
              holes: sorted, slots: slots, quantity: 0,
              // cor NÃO entra na assinatura de propósito: a furação de duas
              // peças iguais em cores diferentes é a MESMA, e separar os
              // arquivos por cor faria a máquina furar duas vezes o que é um
              // programa só. Quando isso acontece, cor_mista avisa o desenho
              // pra não mentir mostrando uma cor que vale só pra parte delas.
              cor: corPeca, cor_nome: (part.color && part.color.name) || null,
              cor_mista: false, cor_sem_swatch: semSwatch, textura: textura,
              veio: veioPeca, cor_tem_veio: corTemVeio, veio_eixo: veioEixo
            });
          }
          const reg = fileMap.get(signature);
          reg.quantity += (item.quantity || 1);
          if (corPeca && reg.cor && corPeca !== reg.cor) reg.cor_mista = true;
          if (!reg.cor && corPeca) reg.cor = corPeca;
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
        content: buildBanXml(base, rec.comprimento_mm, rec.largura_mm, rec.espessura_mm, rec.holes, rec.slots),
        quantity: rec.quantity,
        reference: rec.reference,
        module_name: rec.module_name,
        comprimento_mm: rec.comprimento_mm,
        largura_mm: rec.largura_mm,
        espessura_mm: rec.espessura_mm,
        holes_count: rec.holes.length,
        slots_count: (rec.slots || []).length
      };
    });
  }

  global.Drilling = {
    generateOrderFiles: generateOrderFiles,
    collectOrderPieces: collectOrderPieces,
    buildBanXml: buildBanXml,
    // expostos pra teste/diagnóstico (e pra prévia 2D do admin usar a MESMA
    // correção de sentido do gerador — resolveDrillingHoleXY)
    // ======================================================================
    // CONTAGEM REAL DE FUROS POR PEÇA (2026-08-15)
    // ======================================================================
    // Devolve { [piece_id]: nº de furos } — o número que a peça DE FATO
    // recebe, incluindo os propagados (contra-furo de cavilha/minifix) e os
    // de dobradiça/corrediça/suporte de prateleira.
    //
    // Por que existe: o custo de furação usava `furos_equivalentes`, um número
    // digitado à mão no cadastro, com a convenção "quem define a junta paga
    // pelos dois lados". Funciona, mas desatualiza sozinho: mudou o programa,
    // o número fica velho — e a LATERAL, que só recebe contra-furo, aparecia
    // pagando zero de variável (foi o que o Matt viu).
    //
    // Aqui o número sai do MESMO gerador que produz o .ban. Se o furo existe
    // no arquivo da máquina, ele é cobrado; se não existe, não é. Não há como
    // divergir, e não há nada pra manter.
    //
    // Reaproveita collectAssembly inteiro de propósito — inclusive
    // buildBoxes, que é a parte cara. Quem chama deve guardar o resultado
    // enquanto as medidas não mudarem (ver o cache em portal.js).
    countHolesByPiece: function (parts, W, H, D, config) {
      const out = {};
      // SEMEIA 0 PRA TODA PEÇA ANTES DE CONTAR (2026-08-19). `store` (abaixo)
      // só ganha uma entrada quando addHole/emitLocalHole roda pelo menos uma
      // vez — uma peça com furação REAL zero (ex: fundo sem furo, peça que só
      // recebe contra-furo em outro módulo) nunca aparecia em `store`, então
      // `out[chave]` nunca era criado. `processLaborFor` (pricing.js) lê
      // "chave ausente" como "sem contagem, cai no furos_equivalentes do
      // cadastro" — o MESMO sinal de "não roda contagem nenhuma". Resultado:
      // peça com zero furos reais cobrava o número digitado no cadastro em
      // vez de zero, quebrando bem a garantia do comentário logo abaixo
      // ("CONTAGEM REAL ganha do número digitado quando publicada"). Semear
      // aqui faz "contei e deu zero" virar 0 de verdade, disponível pro
      // lookup, e só a peça de fato NUNCA resolvida (fora de `parts`) continua
      // caindo no fallback.
      //
      // PRECISA DESCER EM child_pieces (2026-08-19, Matt: "quando eu coloco
      // direto a gaveta no ambiente ele calcula certo... ja quando eu insiro
      // ela com construtor de armario ela nao sai certo"). Uma gaveta inserida
      // via agregado `child_module_id` chega aqui como UM item de `parts` com
      // is_module=true e as peças de verdade (BACK, LEFT SIDE, RIGHT SIDE,
      // Stretcher…) dentro de `part.child_pieces` — collectAssembly (abaixo)
      // JÁ recursava nesses child_pieces pra desenhar o furo real, mas este
      // semeio parava no nível de cima e pulava is_module inteiro. Resultado:
      // as peças aninhadas nunca ganhavam `out[chave]=0`, e uma peça aninhada
      // com furação real zero caía no furos_equivalentes do cadastro — o
      // mesmíssimo bug do comentário acima, só que só pra peça vinda do
      // construtor. Peça inserida direto no ambiente nunca teve esse nível de
      // aninhamento (é ela mesma o topo de `parts`), por isso sempre calculou
      // certo.
      (function semear(lista) {
        (lista || []).forEach(function (part) {
          if (!part) return;
          if (part.is_module) {
            if (part.child_pieces && part.child_pieces.length) semear(part.child_pieces);
            return;
          }
          const chave = part.piece_id || part.id;
          if (chave) out[chave] = 0;
        });
      })(parts);
      const store = new Map();
      try {
        collectAssembly(store, parts, W, H, D, config || {});
      } catch (e) {
        return {};   // furação quebrada não pode derrubar o preço
      }
      store.forEach(function (holes, part) {
        // piece_id é o id da LINHA module_components (o mesmo que o preço usa
        // pra achar a peça). part.id existe como reserva pros caminhos que
        // não passam por resolvePiecesForViewer.
        const chave = part.piece_id || part.id;
        if (!chave) return;
        out[chave] = (out[chave] || 0) + holes.length;
      });
      return out;
    },

    // ======================================================================
    // FUROS DO MÓDULO AGRUPADOS POR ASSINATURA (2026-08-18, migration 119)
    // ======================================================================
    // Devolve [{ tipo, diameter_mm, face_kind, count }] — TODOS os furos do
    // módulo (recursão nos aninhados incluída), agrupados pelo que identifica
    // a ferragem que entra neles.
    //
    // É a matéria-prima do js/hardware.js: as regras de consumo casam contra
    // estas três chaves. Sai do MESMO collectAssembly que escreve o .ban, de
    // propósito — lista de compra e furadeira não podem divergir, porque são
    // a mesma passagem de código. Se o furo existe no arquivo da máquina, a
    // ferragem dele está na caixa; se não existe, não está.
    //
    // face_kind é 'borda' pra qualquer face 'borda_*' e 'face' pro resto
    // (face/verso). A distinção esquerda/direita não interessa a ferragem
    // nenhuma — o que interessa é se a broca entrou pelo topo ou pela face.
    //
    // Mesma advertência de custo do countHolesByPiece: buildBoxes é a parte
    // cara. Quem chama guarda o resultado enquanto as medidas não mudarem.
    holesBySignature: function (parts, W, H, D, config) {
      const store = new Map();
      try {
        collectAssembly(store, parts, W, H, D, config || {});
      } catch (e) {
        return [];   // furação quebrada não pode derrubar o preço
      }
      const acc = {};
      store.forEach(function (holes) {
        holes.forEach(function (h) {
          const tipo = h.tipo || 'desconhecido';
          const faceKind = /^borda_/.test(h.face || '') ? 'borda' : 'face';
          // Ø arredondado a 2 casas: o cadastro é numeric(6,2) e comparar
          // float cru com o que veio do banco erra por 0.0000001.
          const d = Math.round((Number(h.diameter) || 0) * 100) / 100;
          const k = tipo + '|' + d + '|' + faceKind;
          if (!acc[k]) acc[k] = { tipo: tipo, diameter_mm: d, face_kind: faceKind, count: 0 };
          acc[k].count += 1;
        });
      });
      return Object.keys(acc).map(function (k) { return acc[k]; });
    },

    // Agrupa as linhas de drilling_pattern_holes por programa, no formato que
    // collectAssembly espera em config.holesByPattern (migration 105).
    // Existe aqui, e não copiado em cada tela, porque são 5 chamadores (admin,
    // teste de cálculo, .ban do pedido, lote, portal) e um deles esquecer o
    // agrupamento significaria peça saindo sem furo na fábrica.
    groupPatternHoles: function (rows) {
      const map = {};
      (rows || []).forEach(function (r) {
        if (!map[r.pattern_id]) map[r.pattern_id] = [];
        map[r.pattern_id].push(r);
      });
      return map;
    },
    // Parâmetros da usinagem (SlotL). Expostos pra dar pra ajustar ferramenta,
    // sobreposição, Face e IsCuted sem editar o arquivo — os dois últimos
    // ainda esperam confirmação na máquina.
    USINAGEM: USINAGEM,
    _internals: { splitThickness, machineDims, localToMachine, machineToLocal, edgeFace, edgeRealUV, resolveDrillingHoleXY, pieceBox, buildBoxes, furosDaPeca, recorteRects, rectToSlots, cornerCutSlots, slotsDaPeca }
  };
})(typeof window !== 'undefined' ? window : globalThis);
// migration 043 — propagação por componente + espelhamento esq/dir
// migration 054 — contra-furo reverso: furo de FACE propaga borda+copo na peça apoiada
