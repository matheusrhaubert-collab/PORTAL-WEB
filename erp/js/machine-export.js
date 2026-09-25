/* Legno ERP — exportação do plano de corte pra pasta da máquina (Samach
 * SawBean), erp/js/screens-lotes.js chama MAQUINA_EXPORT.gerar(planId, btn).
 *
 * PEDIDO DO MATT (21/09-6): "preciso um botão pra gerar essa pasta [...]
 * pra enviar pra maquina de corte [...] preciso fazer o teste pra ver se a
 * maquina vai respeitar nosso plano." — ele mandou uma pasta de exemplo
 * (Lote_508) de outro software que ele usa, com etiqueta de peça em .emf
 * (3x2") e um XML por material descrevendo a sequência de corte
 * guilhotinado de cada chapa. Confirmado com ele (21/09-6): a máquina é a
 * Samach SawBean, e a etiqueta pode ficar no NOSSO desenho (código de
 * barras), só precisa estar salva em .emf.
 *
 * O QUE ESSE ARQUIVO FAZ
 *   1. Busca o plano salvo (LOTES.plan) — já tem sheet.placed com x/y/w/h
 *      reais e sheet.offcuts_json com as sobras aproveitáveis.
 *   2. Reconstrói a árvore de corte de cada chapa (faixas, ver seção 2
 *      abaixo) e serializa no XML da SawBean.
 *   3. Gera uma etiqueta .emf por peça (numeração 1..N, ordem de saída da
 *      máquina) e uma por retalho aproveitável (OC1, OC2...) — mesmo
 *      desenho da etiqueta que já imprimimos hoje (BARCODE + dados da
 *      peça), só que via EMF.build (erp/js/emf-writer.js) em vez de HTML.
 *   4. Escreve tudo achatado numa pasta nova (sem zip — File System Access
 *      API, window.showDirectoryPicker), do jeito que o Matt pediu. Em
 *      browser sem suporte a isso (não é Chrome/Edge), cai pra baixar um
 *      .zip com aviso — mesma lib (JSZip) que FURACAO_LOTE já usa.
 *
 * O QUE NÃO SEI 100% (documentado no código, não escondido)
 * O schema do XML foi decifrado só olhando os arquivos de exemplo (não tem
 * doc oficial da Samach aqui) — a parte que tenho certeza: cada retângulo
 * vira um nó <no.N>, um <part> dentro de um nó aponta pro nó-filho pelo
 * `id` (não pela posição no arquivo — testei e a ORDEM de emissão do
 * arquivo de exemplo não bate com a ordem dos ids, então o leitor da
 * máquina claramente resolve por id, não por posição), type=1 é peça
 * pronta, type=2 continua a árvore, type=3 é retalho guardado. A parte que
 * é aproximação: o atributo `trim` e o eixo exato de l/w — segui o padrão
 * observado, mas só o teste na máquina de verdade confirma. Por isso o
 * aviso pro Matt: primeiro teste, chapa de sobra, não chapa boa.
 */

const MAQUINA_EXPORT = {};

/* ============================================================
   Utilidades
   ============================================================ */
function fmt(n) {
  // Sem casa decimal desnecessária (876 em vez de 876.00), mas mantém
  // fração quando existe (2219.4) — mesmo estilo do arquivo de exemplo.
  const r = Math.round(n * 100) / 100;
  return (Math.abs(r - Math.round(r)) < 1e-9) ? String(Math.round(r)) : String(r);
}
function sanitizeFilePart(s) {
  return String(s || '').trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ');
}
function pad2(n) { return String(n).padStart(2, '0'); }
MAQUINA_EXPORT._dataBR = function (iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
};

/* ============================================================
   1) Coleta e agrupamento por material (cor + espessura)
   ============================================================ */
MAQUINA_EXPORT._agruparPorMaterial = function (plan) {
  const groups = {};
  const order = [];
  plan._sheets.forEach(function (sh) {
    const key = (sh.color_name || '—') + '|' + sh.espessura_mm;
    if (!groups[key]) {
      groups[key] = { colorName: sh.color_name || 'material', espessura: sh.espessura_mm, sheets: [] };
      order.push(key);
    }
    groups[key].sheets.push(sh);
  });
  return order.map(function (k) { return groups[k]; });
};

/* Numeração global (a mesma ordem da tela de etiquetas: chapa 1 ao fim,
   depois chapa 2 — LOTES_UI.labels usa a mesma regra) — assim o número da
   etiqueta .emf bate com a ordem física de saída das peças na máquina. */
MAQUINA_EXPORT._numerarPecas = function (plan) {
  // Ordem de saída da máquina, com pilha intercalada — LOTES.piecesInOutputOrder.
  // NOTA (21/09-13): chapas empilhadas ainda saem como painéis SEPARADOS no
  // XML (num="1" cada) — falta o exemplo da máquina pra saber como ela
  // numera etiqueta de painel num="2". Quando vier, é só agrupar aqui.
  const ordered = LOTES.piecesInOutputOrder(plan);
  const numberOf = {};
  ordered.forEach(function (p, i) { numberOf[p.id] = i + 1; });
  return numberOf;
};

/* ============================================================
   2) Árvore de corte -> XML (schema Samach SawBean)
   ============================================================
   MODELO DO ARQUIVO (validado programaticamente contra os 18 painéis do
   exemplo Lote_508 do Matt — 100% das ligações bateram, ver 21/09-7):

   - Cada <no.N> é uma FAIXA: um retângulo que vai ser fatiado em cortes
     passantes SUCESSIVOS ao longo de UM eixo. Cada <part> dentro dele é uma
     fatia, na ordem física de corte; a máquina calcula a posição sozinha:
       pos = (x ou y do nó) + trim;  a cada part: fatia em [pos, pos+cut],
       pos += cut + saw.
     O que sobra depois da última fatia é descarte (não aparece).
   - Eixo por camada: layer ÍMPAR fatia ao longo de Y (faixas de comprimento
     inteiro), layer PAR ao longo de X. Alterna sempre — por isso fatias no
     mesmo eixo são IRMÃS (parts do mesmo nó), nunca nó dentro de nó.
   - Invariantes de cada nó, medidas contra o pai:
       l = extensão disponível no eixo PRÓPRIO  (= w do pai; raiz: altura Y)
       w = extensão no eixo do PAI               (= cut da part que o gerou;
                                                    raiz: comprimento X)
       layer = layer do pai + 1
   - type=1 peça pronta (code = número da etiqueta), type=3 retalho guardado
     (code = OCn), type=2 fatia que vira outra faixa (nó filho, eixo
     perpendicular). Toda part aponta pro nó filho pelo `id` — a máquina
     resolve por id, não pela ordem no arquivo (no exemplo a ordem de emissão
     é uma pilha, os ids não são sequenciais no texto).
   - trim: só nas camadas 1 e 2 (refile de topo em Y e de esquerda em X);
     mais fundo é 0, porque as bordas cruas já foram refiladas. Nó de
     camada 1 fica em (0,0); de camada 2 em x=0 (o refile de X vem dentro
     dele) e y = onde a faixa começa.
   - Uma fatia com UMA peça só é folha direta se a peça preenche a largura
     da faixa (w do nó). Se a peça é mais estreita, precisa de mais um corte
     perpendicular: vira type=2 com um nó filho de uma part só (é o que o
     exemplo faz — panel2/no.2 do stone grey).
   - Retalho (offcuts_json) vem do packer com o kerf embutido no lado de
     dentro (ver NESTING._packGuillotine: restBottom tem w=cw, restRight tem
     h=ch — o "consumido" inclui a serra). Pra máquina a fatia é a medida
     limpa, então desconta o kerf de todo lado que NÃO é a borda útil da
     chapa. Sem isso a faixa fica 1 kerf mais alta e a chapa inteira
     "escorrega" — foi exatamente o que apareceu na tela da máquina no
     primeiro teste (21/09-7: "chegou beeem bagunçado").

   A reconstrução parte só da geometria final (sheet.placed + offcuts) —
   não da árvore viva do packer — porque a consolidação (NESTING._consolidate)
   muda peça de chapa depois do encaixe. Todo layout que sai daqui é
   guilhotinado por construção, então sempre existe a segmentação abaixo. */

/* Componentes conexos da projeção dos itens no eixo: entre dois componentes
   sempre existe uma linha de corte passante (nenhum item a atravessa). */
MAQUINA_EXPORT._segmentar = function (items, axis, eps) {
  const c = axis === 'y' ? 'y' : 'x';
  const s = axis === 'y' ? 'h' : 'w';
  const sorted = items.slice().sort(function (a, b) { return a[c] - b[c]; });
  const segs = [];
  let cur = null;
  sorted.forEach(function (it) {
    const start = it[c], end = it[c] + it[s];
    if (cur && start >= cur.end - eps) { segs.push(cur); cur = null; }
    if (!cur) cur = { start: start, end: end, items: [] };
    cur.items.push(it);
    if (end > cur.end) cur.end = end;
  });
  if (cur) segs.push(cur);
  return segs;
};

/* Monta um nó-faixa. extentL = disponível no eixo próprio (w do pai),
   extentW = cut que gerou este nó (raiz: X inteiro da chapa). nodeX/nodeY =
   posição do nó DO JEITO QUE A MÁQUINA CALCULA (pos corrente do pai), não o
   x/y do item: nos raros casos em que o packer deixou uma sobra pequena no
   MEIO de uma faixa (ex.: coluna vizinha cortada mais longa), a peça real
   começa uns mm depois de onde a máquina vai cortar. Como a região entre os
   dois é vazia (nenhum item — é o que define o segmento), o corte da máquina
   tira uma peça idêntica de material limpo, e a sobra vai pro fim da faixa.
   O arquivo fica 100% coerente consigo mesmo (x/y = o que a sequência de
   cortes produz), que é o que importa pro leitor — o desenho da máquina
   pode diferir do nosso em alguns mm nesses casos, a peça não. */
MAQUINA_EXPORT._montarNo = function (items, axis, layer, extentL, extentW, ctx, stuck, nodeX, nodeY) {
  const perp = axis === 'y' ? 'x' : 'y';
  const c = axis === 'y' ? 'y' : 'x';
  const s = axis === 'y' ? 'h' : 'w';
  const ps = perp === 'y' ? 'h' : 'w';
  let minC = Infinity;
  items.forEach(function (it) { if (it[c] < minC) minC = it[c]; });

  const node = { layer: layer, axis: axis, l: extentL, w: extentW, parts: [], x: nodeX, y: nodeY, trim: 0 };
  // Refile só nas camadas 1 (topo, Y) e 2 (esquerda, X): as bordas cruas.
  node.trim = layer <= 2 ? Math.max(0, minC - node[c]) : 0;

  let segs = MAQUINA_EXPORT._segmentar(items, axis, ctx.eps);
  if (segs.length === 1 && items.length > 1 && stuck) {
    /* Nem este eixo nem o perpendicular separam — não acontece com layout
       guilhotinado (testado), mas não pode travar: separa o primeiro item
       dos demais e segue. */
    const sorted = items.slice().sort(function (a, b) { return a[c] - b[c]; });
    const first = sorted[0], rest = sorted.slice(1);
    segs = [
      { start: first[c], end: first[c] + first[s], items: [first] },
      { start: Math.min.apply(null, rest.map(function (r) { return r[c]; })),
        end: Math.max.apply(null, rest.map(function (r) { return r[c] + r[s]; })), items: rest }
    ];
  }
  const nextStuck = (segs.length === 1 && items.length > 1);

  let pos = node[c] + node.trim; // onde a máquina começa a fatiar
  const limit = node[c] + extentL;   // fim da faixa: nenhuma fatia pode passar daqui
  segs.forEach(function (seg) {
    let cut = seg.end - seg.start;
    /* Fatia que passa do fim da faixa: o packer deixa peça vizinha 1-2 mm
       "desencontrada" entre sub-árvores (kerf contado em ramos diferentes),
       e a posição corrente da máquina — que anda pelo MAIOR de cada
       segmento — pode chegar à última fatia uns mm depois do desenho. Se o
       que passa é só retalho (sobra), encolhe a fatia pra caber e ajusta a
       medida limpa do retalho; peça nunca é encolhida (aí a simulação
       acusa, e é bug pra investigar, não pra esconder). */
    if (pos + cut > limit + 0.05) {
      let pieceEnd = -Infinity;
      seg.items.forEach(function (it) { if (it.kind === 'piece') pieceEnd = Math.max(pieceEnd, it[c] + it[s]); });
      const needed = pieceEnd > -Infinity ? (pieceEnd - seg.start) : 0;
      if (pos + needed <= limit + 0.05) {
        const shrink = (pos + cut) - limit;
        cut = limit - pos;
        if (cut < 1) return;
        seg.items.forEach(function (it) {
          if (it.kind !== 'offcut') return;
          if (axis === 'y') { it.h = Math.max(1, it.h - shrink); it.cleanH = Math.max(1, it.cleanH - shrink); }
          else { it.w = Math.max(1, it.w - shrink); it.cleanW = Math.max(1, it.cleanW - shrink); }
        });
      }
    }
    const childPos = {};
    childPos[c] = pos;
    childPos[perp] = node[perp];
    if (seg.items.length === 1) {
      const it = seg.items[0];
      if (Math.abs(it[ps] - extentW) <= ctx.tightEps) {
        node.parts.push({
          cut: cut, type: it.kind === 'piece' ? 1 : 3,
          code: it.kind === 'piece' ? String(ctx.codeOf(it)) : ('OC' + it.ocNumber),
          leaf: { layer: layer + 1, l: extentW, w: cut, x: childPos.x, y: childPos.y, item: it }
        });
      } else {
        // Peça mais estreita que a faixa: um corte perpendicular a mais.
        node.parts.push({ cut: cut, type: 2, code: '', child: MAQUINA_EXPORT._montarNo([it], perp, layer + 1, extentW, cut, ctx, false, childPos.x, childPos.y) });
      }
    } else {
      node.parts.push({ cut: cut, type: 2, code: '', child: MAQUINA_EXPORT._montarNo(seg.items, perp, layer + 1, extentW, cut, ctx, nextStuck, childPos.x, childPos.y) });
    }
    pos += cut + ctx.kerf;
  });
  return node;
};

/* Ordem de emissão = ordem em que a MÁQUINA processa. Pedido do Matt
   (22/09-17, na frente da seccionadora): "abre as tiras, e a última tira
   cortada começa cortando" — depois dos cortes que abrem as faixas de um
   nó, a faixa que saiu por ÚLTIMO é a que está na mão do empurrador, então
   é ela que deve ser fatiada primeiro (menos movimentação de material).
   É exatamente o que o software da Samach faz (Lote_508, panel3 do beige
   textile: raiz com parts 1,2,3 → emite o filho da part 3, depois da 2,
   depois da 1; folha sai logo depois do nó dela, não no fim): percorre
   cada nó em profundidade, parts em ordem INVERSA; ids na ordem de
   emissão, todas as parts de um nó numeradas de uma vez quando o nó sai.
   A versão anterior emitia em pré-ordem direta com as folhas no fim — a
   máquina lia certo, mas cortava a primeira faixa primeiro. */
MAQUINA_EXPORT._serializarPainel = function (root) {
  let idCounter = 0;
  let tagNum = 0;
  const lines = [];

  function emitirNo(node, id) {
    node.parts.forEach(function (p) { p._id = idCounter++; });
    tagNum++;
    const partsXML = node.parts.map(function (p) {
      return '      <part cut="' + fmt(p.cut) + '" type="' + p.type + '" id="' + p._id + '" code="' + p.code + '" />';
    }).join('\n');
    lines.push('    <no.' + tagNum + ' l="' + fmt(node.l) + '" w="' + fmt(node.w) + '" trim="' + fmt(node.trim) +
      '" x="' + fmt(node.x) + '" y="' + fmt(node.y) + '" layer="' + node.layer + '" id="' + id + '">\n' +
      partsXML + '\n    </no.' + tagNum + '>');
    // Última part primeiro (pilha), cada uma com a subárvore inteira.
    for (let i = node.parts.length - 1; i >= 0; i--) {
      const p = node.parts[i];
      if (p.leaf) emitirFolha(p.leaf, p._id);
      else emitirNo(p.child, p._id);
    }
  }
  function emitirFolha(leaf, id) {
    tagNum++;
    lines.push('    <no.' + tagNum + ' l="' + fmt(leaf.l) + '" w="' + fmt(leaf.w) + '" trim="0" x="' + fmt(leaf.x) +
      '" y="' + fmt(leaf.y) + '" layer="' + leaf.layer + '" id="' + id + '" />');
  }
  emitirNo(root, idCounter++);
  return lines.join('\n');
};

MAQUINA_EXPORT._itensDaChapa = function (sh, ctx) {
  const items = [];
  (sh._pieces || []).forEach(function (p) {
    items.push({ x: Number(p.x_mm), y: Number(p.y_mm), w: Number(p.w_mm), h: Number(p.h_mm), kind: 'piece', ref: p });
  });
  // Retalho tem refile próprio, menor (trim_retalho_mm, NESTING.trims) —
  // a borda útil dele é a física menos esse refile.
  const isRetalho = sh.source === 'retalho';
  const usableRight = Number(sh.width_mm) - (isRetalho ? ctx.trimRetalho : ctx.trimRight);
  const usableBottom = Number(sh.height_mm) - (isRetalho ? ctx.trimRetalho : ctx.trimBottom);
  (sh.offcuts_json || []).forEach(function (o) {
    ctx.offcutCounterRef.n++;
    let w = Number(o.w), h = Number(o.h);
    // Kerf embutido no lado de dentro do retalho (ver nota do modelo acima).
    // Borda útil OU borda física (retalho que ficou com a borda crua, sem
    // refile — NESTING._recomputeOffcuts) = sem corte ali, sem kerf.
    const endX = Number(o.x) + w, endY = Number(o.y) + h;
    if (Math.abs(endX - usableRight) > ctx.eps && Math.abs(endX - Number(sh.width_mm)) > ctx.eps) w = Math.max(1, w - ctx.kerf);
    if (Math.abs(endY - usableBottom) > ctx.eps && Math.abs(endY - Number(sh.height_mm)) > ctx.eps) h = Math.max(1, h - ctx.kerf);
    // Código do estoque: linha de erp.offcuts desta chapa com a mesma medida
    // (limpa; plano antigo gravava a medida com a serra — tenta as duas).
    let code = null;
    const rows = (ctx.offcutRows || []).filter(function (r) { return r.origin_sheet_id === sh.id && !r._used; });
    const same = function (r, a, b) { return Math.abs(Number(r.width_mm) - a) < 0.15 && Math.abs(Number(r.height_mm) - b) < 0.15; };
    const row = rows.find(function (r) { return same(r, w, h); }) || rows.find(function (r) { return same(r, Number(o.w), Number(o.h)); });
    if (row) { row._used = true; code = row.code; }
    items.push({ x: Number(o.x), y: Number(o.y), w: w, h: h, kind: 'offcut', ocNumber: ctx.offcutCounterRef.n, cleanW: w, cleanH: h, stockCode: code });
  });
  return items;
};

MAQUINA_EXPORT._construirXML = function (group, ctx) {
  // group: { colorName, espessura, sheets:[cut_plan_sheets...] }
  const panels = group.sheets.map(function (sh, si) {
    const items = sh._exportItems || MAQUINA_EXPORT._itensDaChapa(sh, ctx);
    const panelNum = si + 1;
    let body = '';
    if (items.length > 0) {
      // Raiz: camada 1 fatia em Y — l = altura (Y) da chapa, w = comprimento (X).
      const root = MAQUINA_EXPORT._montarNo(items, 'y', 1, Number(sh.height_mm), Number(sh.width_mm), ctx, false, 0, 0);
      body = MAQUINA_EXPORT._serializarPainel(root);
    }
    const totalPanels = group.sheets.length;
    const suffixWidth = totalPanels > 9 ? 2 : 1;
    const mcode = ctx.mcodeBase + String(panelNum).padStart(suffixWidth, '0');
    // num="1" SEMPRE: é a QUANTIDADE de chapas iguais a cortar deste painel,
    // não o índice — no primeiro teste (21/09-7) estava indo o índice e a
    // máquina pediu 1, 2, 3... chapas do mesmo padrão.
    return '  <panel' + panelNum + ' l="' + fmt(sh.width_mm) + '" w="' + fmt(sh.height_mm) + '" num="1' +
      '" material="' + sanitizeFilePart(group.colorName) + '" thickness="' + fmt(group.espessura) +
      '" saw="' + fmt(ctx.kerf) + '" mcode="' + mcode + '">\n' + body + '\n  </panel' + panelNum + '>';
  }).join('\n');

  return '﻿<?xml version="1.0" encoding="UTF-8"?>\n<project>\n' + panels + '\n</project>\n';
};

/* ============================================================
   3) Etiquetas .emf — mesmo conteúdo da tela de etiquetas (LOTES_UI.labels)
   ============================================================ */
/* Mesmo layout da etiqueta impressa do ERP (erp/css/lotes.css .erp-etq-* +
   LOTES_UI.labels em screens-lotes.js), convertido pra coordenada fixa em
   mm na etiqueta física de 3" x 2" (76,2 x 50,8mm — o @page do lotes.css).
   Cada tamanho abaixo é o px do CSS vezes 0,2646 (96dpi -> mm): 11px =
   2,9mm, 13px = 3,4mm, 10px = 2,65mm, 20px = 5,3mm, 18px = 4,8mm, 8px =
   2,1mm; padding 7px/9px = 1,9/2,4mm; margens de 3-4px = 0,8-1,1mm.
   Pedido do Matt (21/09-8): "deixar igual do ERP" — a primeira versão tinha
   nome e código de barras grandes demais e o selo MÓD/EDGEBAND sem o
   número grande. Cor cinza dos textos "muted" (#7c766c) também replicada. */
MAQUINA_EXPORT._buildLabelOps = function (p, labelNumber, sheetIndexNo) {
  const ops = [];
  const W = 76.2, H = 50.8;
  const padX = 2.4, padTop = 1.9;
  const left = padX, right = W - padX, center = W / 2;
  const GRAY = [124, 118, 108];   // #7c766c (.erp-etq-sheet, -in, -badge-label)
  const DARK = [58, 55, 48];      // #3a3730 (.erp-etq-material, -line)
  const INK = [42, 40, 34];       // #2a2822 (.erp-etq-part, -client)
  const PO = [90, 85, 72];        // #5a5548 (.erp-etq-po)

  // Borda da etiqueta (1px #b9b3a7, 4 filetes de 0,25mm — EMF aqui só tem
  // retângulo cheio).
  const bw = 0.25;
  ops.push({ type: 'rect', x: 0, y: 0, w: W, h: bw });
  ops.push({ type: 'rect', x: 0, y: H - bw, w: W, h: bw });
  ops.push({ type: 'rect', x: 0, y: 0, w: bw, h: H });
  ops.push({ type: 'rect', x: W - bw, y: 0, w: bw, h: H });

  // .erp-etq-top: nome da peça (11px bold) à esquerda, material (10px) à direita
  let y = padTop;
  ops.push({ type: 'text', x: left, y: y, text: String(p.reference || '—'), sizeMm: 2.9, bold: true, color: INK });
  ops.push({ type: 'text', x: right, y: y + 0.25, text: String(p.color_name || ''), sizeMm: 2.65, align: 'right', color: DARK });
  y += 2.9 * 1.35 + 0.8; // line-height 1.35 + margin 3px

  // .erp-etq-bc: BARCODE.svg(height 30, narrow 1.4) = ~226px x (30+13)px,
  // centralizado. 226px = 59,8mm; barras 30px = 7,9mm; texto mono 10px.
  const barH = 7.9;
  const bc = BARCODE.rects(p.piece_code, { height: barH, narrow: 1.4 * 0.2646 });
  const bcScale = Math.min(1, (W - padX * 2) / bc.totalWidth);
  const bcX = center - (bc.totalWidth * bcScale) / 2;
  bc.rects.forEach(function (r) {
    ops.push({ type: 'rect', x: bcX + r.x * bcScale, y: y, w: Math.max(0.12, r.w * bcScale), h: r.h });
  });
  ops.push({ type: 'text', x: center, y: y + barH + 0.5, text: String(p.piece_code || ''), sizeMm: 2.65, align: 'center', face: 'Courier New', color: INK });
  // Bolinha preta = vai pra furadeira (mesma da tela, .erp-etq-furo). EMF
  // aqui só tem retângulo, então o círculo é feito de fatias horizontais.
  if (p._furado) {
    const dia = 2.6, cx = right - dia / 2, cy = y + barH + 0.5 + 2.65 / 2, fatias = 16;
    for (let i = 0; i < fatias; i++) {
      const yy = -dia / 2 + (i + 0.5) * dia / fatias;
      const half = Math.sqrt(Math.max(0, (dia / 2) * (dia / 2) - yy * yy));
      ops.push({ type: 'rect', x: cx - half, y: cy + yy - dia / fatias / 2, w: half * 2, h: dia / fatias + 0.02 });
    }
  }
  y += barH + 0.5 + 2.65 + 0.8;

  // .erp-etq-dim-row: medida mm (13px bold) + "chapa N" (10px cinza) à direita
  const dimTxt = LOTES_UI.mm(p.w_mm) + ' \u00d7 ' + LOTES_UI.mm(p.h_mm) + ' \u00d7 ' + LOTES_UI.mm(p.espessura_mm) + ' mm' + (p.rotated ? ' \u21bb' : '');
  ops.push({ type: 'text', x: left, y: y, text: dimTxt, sizeMm: 3.4, bold: true, color: INK });
  ops.push({ type: 'text', x: right, y: y + 0.7, text: 'chapa ' + (sheetIndexNo || '?'), sizeMm: 2.65, align: 'right', color: GRAY });
  y += 3.4 * 1.35;

  // .erp-etq-in: polegada fracionada (10px cinza)
  const inTxt = LOTES_UI.mmToFraction(p.w_mm, 16) + ' \u00d7 ' + LOTES_UI.mmToFraction(p.h_mm, 16) + ' \u00d7 ' + LOTES_UI.mmToFraction(p.espessura_mm, 4);
  ops.push({ type: 'text', x: left, y: y, text: inTxt, sizeMm: 2.65, color: GRAY });
  y += 2.65 * 1.35 + 0.8;

  // .erp-etq-badges: MÓD (rótulo 8px cinza + número 20px bold) à esquerda,
  // EDGEBAND (rótulo 8px + número 18px bold) à direita, alinhados pela base.
  // Zero à esquerda vira espaço, igual ao padStart "mudo" da tela
  // ("014" -> " 14"; "0" sozinho fica).
  const modNum = p.module_number
    ? p.module_number.split(', ').map(function (n) { return n.replace(/^0+(?=[0-9])/, function (z) { return ' '.repeat(z.length); }); }).join(', ')
    : '';
  const modBig = 5.3, edgeBig = 4.8, lbl = 2.1;
  if (modNum) {
    ops.push({ type: 'text', x: left, y: y + (modBig - lbl) - 0.3, text: 'M\u00d3D', sizeMm: lbl, bold: true, color: GRAY });
    const lblW = EMF.estimateTextWidthMm('M\u00d3D', lbl, true) + 0.8;
    ops.push({ type: 'text', x: left + lblW, y: y, text: modNum, sizeMm: modBig, bold: true, color: INK });
  }
  const edgeTxt = String(p.edge_banding || 0);
  ops.push({ type: 'text', x: right, y: y + (modBig - edgeBig), text: edgeTxt, sizeMm: edgeBig, bold: true, align: 'right', color: INK });
  const edgeW = EMF.estimateTextWidthMm(edgeTxt, edgeBig, true) + 0.8;
  ops.push({ type: 'text', x: right - edgeW, y: y + (modBig - lbl) - 0.3, text: 'EDGEBAND', sizeMm: lbl, bold: true, align: 'right', color: GRAY });
  y += modBig + 1.1;

  // .erp-etq-line: nome do módulo (11px)
  ops.push({ type: 'text', x: left, y: y, text: String(p.module_name || ''), sizeMm: 2.9, color: DARK });

  // Rodapé fixo (position:absolute no CSS): pedido a 24px do fundo (13px
  // semibold cinza), cliente a 6px do fundo (13px bold), os dois centralizados.
  if (p.po_name) ops.push({ type: 'text', x: center, y: H - 6.35 - 3.4, text: String(p.po_name), sizeMm: 3.4, bold: true, align: 'center', color: PO });
  ops.push({ type: 'text', x: center, y: H - 1.6 - 3.4, text: String(p.client_name || ''), sizeMm: 3.4, bold: true, align: 'center', color: INK });

  return ops;
};

/* Etiqueta do retalho: material, medida limpa em destaque e — quando o
   plano já está salvo — o código do estoque (erp.offcuts.code, RET-000123)
   em Code 39, pra dar entrada e saída no inventário de retalhos com o
   leitor (pedido do Matt, 22/09-8). Mesmo tamanho físico da etiqueta de
   peça (3" x 2"). */
MAQUINA_EXPORT._buildOffcutLabelOps = function (colorName, w, h, stockCode, info) {
  info = info || {};
  const ops = [];
  const W = 76.2, H = 50.8, margin = 3.5, center = W / 2;
  const GRAY = [124, 118, 108];
  const bw = 0.25;
  ops.push({ type: 'rect', x: 0, y: 0, w: W, h: bw });
  ops.push({ type: 'rect', x: 0, y: H - bw, w: W, h: bw });
  ops.push({ type: 'rect', x: 0, y: 0, w: bw, h: H });
  ops.push({ type: 'rect', x: W - bw, y: 0, w: bw, h: H });

  ops.push({ type: 'text', x: margin, y: 2.2, text: 'RETALHO', sizeMm: 2.4, bold: true, color: GRAY });
  ops.push({ type: 'text', x: W - margin, y: 2.2, text: String(colorName || ''), sizeMm: 2.9, align: 'right' });

  // Medida limpa, grande e centralizada
  ops.push({ type: 'text', x: center, y: 7.5, text: fmt(w) + ' \u00d7 ' + fmt(h) + ' mm', sizeMm: 6, bold: true, align: 'center' });
  ops.push({ type: 'text', x: center, y: 15.5, text: LOTES_UI.mmToFraction(w, 16) + ' \u00d7 ' + LOTES_UI.mmToFraction(h, 16), sizeMm: 2.6, align: 'center', color: GRAY });

  if (stockCode) {
    const barH = 12;
    const bc = BARCODE.rects(stockCode, { height: barH, narrow: 1.6 * 0.2646 });
    const bcScale = Math.min(1, (W - margin * 2) / bc.totalWidth);
    const bcX = center - (bc.totalWidth * bcScale) / 2;
    const bcY = 22;
    bc.rects.forEach(function (r) {
      ops.push({ type: 'rect', x: bcX + r.x * bcScale, y: bcY, w: Math.max(0.12, r.w * bcScale), h: r.h });
    });
    ops.push({ type: 'text', x: center, y: bcY + barH + 1, text: String(stockCode), sizeMm: 3.4, align: 'center', face: 'Courier New', bold: true });
  } else {
    ops.push({ type: 'text', x: center, y: 28, text: 'sem c\u00f3digo de estoque (plano salvo antes do cadastro)', sizeMm: 2.4, align: 'center', color: GRAY });
  }
  // Rodapé: lote à esquerda, data do plano à direita (pedido do Matt, 22/09-9).
  if (info.loteCode) ops.push({ type: 'text', x: margin, y: H - 5.5, text: 'Lote ' + info.loteCode + (info.planCode ? ' \u00b7 ' + info.planCode : ''), sizeMm: 2.6, bold: true });
  if (info.dateText) ops.push({ type: 'text', x: W - margin, y: H - 5.5, text: info.dateText, sizeMm: 2.6, align: 'right', color: GRAY });
  return ops;
};

/* ============================================================
   4) Montagem dos arquivos + escrita em pasta (ou zip, sem suporte)
   ============================================================ */
/* Ordem REAL de saída das peças de uma chapa — a mesma da emissão do XML
   (_serializarPainel: última faixa primeiro, em todo nível). Usada por
   LOTES.piecesInOutputOrder pra numerar/imprimir etiqueta na ordem em que
   a peça cai da máquina (pedido do Matt, 22/09-17). Devolve os registros
   de cut_plan_pieces da chapa, na ordem; se der qualquer problema devolve
   null e quem chamou cai na ordenação simples (y, x). */
MAQUINA_EXPORT.ordemNaChapa = function (sh, snap) {
  try {
    snap = snap || {};
    const ctx = {
      kerf: Number(snap.kerf_mm) || 4,
      trimRight: Number(snap.trim_right_mm) || 0,
      trimBottom: Number(snap.trim_bottom_mm) || 0,
      trimRetalho: NESTING.retalhoTrim(snap),
      eps: 0.15, tightEps: 0.2,
      offcutCounterRef: { n: 0 }, offcutRows: [],
      codeOf: function () { return 0; }
    };
    const items = MAQUINA_EXPORT._itensDaChapa(sh, ctx);
    if (!items.length) return [];
    const root = MAQUINA_EXPORT._montarNo(items, 'y', 1, Number(sh.height_mm), Number(sh.width_mm), ctx, false);
    const out = [];
    (function walk(node) {
      for (let i = node.parts.length - 1; i >= 0; i--) {
        const p = node.parts[i];
        if (p.leaf) { if (p.leaf.item && p.leaf.item.kind === 'piece') out.push(p.leaf.item.ref); }
        else walk(p.child);
      }
    })(root);
    return out.length === (sh._pieces || []).length ? out : null;
  } catch (e) { return null; }
};

MAQUINA_EXPORT._montarArquivos = function (plan) {
  const files = []; // [{ name, data: string|Uint8Array }]
  const groups = MAQUINA_EXPORT._agruparPorMaterial(plan);
  const pieceNumberOf = MAQUINA_EXPORT._numerarPecas(plan);
  const kerf = Number((plan.params_snapshot || {}).kerf_mm) || 4;

  const now = new Date();
  const mcodeBase = 'T' + pad2(now.getMonth() + 1) + pad2(now.getDate()) + pad2(now.getHours()) + pad2(now.getMinutes());

  const sheetByPiece = {};
  plan._sheets.forEach(function (s) { (s._pieces || []).forEach(function (p) { sheetByPiece[p.id] = s; }); });
  const machineNo = LOTES.sheetMachineNo(plan); // "chapa N" da etiqueta = painel N do XML do material

  const snap = plan.params_snapshot || {};
  const ctx = {
    kerf: kerf,
    trimRight: Number(snap.trim_right_mm) || 0,
    trimBottom: Number(snap.trim_bottom_mm) || 0,
    trimRetalho: NESTING.retalhoTrim(snap),
    eps: 0.15,       // tolerância de posição: x/y/w/h gravados com 0,1mm — mais
                     // que isso é sobreposição REAL (ex.: retalho de uma coluna
                     // começando antes do fim da coluna vizinha), e aí os itens
                     // têm que ficar no MESMO segmento pra serem separados no
                     // eixo perpendicular. Com 0,6 a máquina recebia faixa
                     // deslocada (visto no teste simulado, 21/09-7).
    tightEps: 0.2,   // "peça preenche a faixa" só se a diferença for ~arredondamento
    mcodeBase: mcodeBase,
    offcutCounterRef: { n: 0 },
    offcutRows: plan._offcutRows || [],
    codeOf: function (item) { return pieceNumberOf[item.ref.id]; }
  };
  // Itens por chapa calculados UMA vez, na ordem dos grupos — a numeração
  // OCn dos retalhos nasce aqui e é a mesma no XML e no nome do .emf.
  groups.forEach(function (group) {
    group.sheets.forEach(function (sh) { sh._exportItems = MAQUINA_EXPORT._itensDaChapa(sh, ctx); });
  });
  groups.forEach(function (group) {
    const xml = MAQUINA_EXPORT._construirXML(group, ctx);
    const fname = sanitizeFilePart(group.colorName) + '_' + fmt(group.espessura) + '.xml';
    files.push({ name: fname, data: xml });
  });

  // Etiquetas de peça, numeração já calculada acima (mesma ordem da tela de
  // etiquetas) — reusa pra nomear N.emf.
  plan._pieces.forEach(function (p) {
    const n = pieceNumberOf[p.id];
    const sh = sheetByPiece[p.id];
    const ops = MAQUINA_EXPORT._buildLabelOps(p, n, sh ? (machineNo[sh.id] ? machineNo[sh.id].n : sh.index_no) : null);
    const bytes = EMF.build({ widthMm: 76.2, heightMm: 50.8, ops: ops });
    files.push({ name: n + '.emf', data: bytes });
  });

  // Etiquetas de retalho (OC1, OC2...) — mesmos itens (e mesma medida
  // limpa, sem kerf) que foram pro XML.
  groups.forEach(function (group) {
    group.sheets.forEach(function (sh) {
      (sh._exportItems || []).forEach(function (it) {
        if (it.kind !== 'offcut') return;
        const ops = MAQUINA_EXPORT._buildOffcutLabelOps(sh.color_name, it.cleanW, it.cleanH, it.stockCode, {
          loteCode: (plan._batch && plan._batch.code) || '',
          planCode: plan.code || ('v' + plan.version),
          dateText: MAQUINA_EXPORT._dataBR(plan.created_at)
        });
        const bytes = EMF.build({ widthMm: 76.2, heightMm: 50.8, ops: ops });
        files.push({ name: 'OC' + it.ocNumber + '.emf', data: bytes });
      });
    });
  });

  return files;
};

MAQUINA_EXPORT._nomePasta = function (plan) {
  const codeBatch = (plan._batch && plan._batch.code) || plan.batch_id;
  return sanitizeFilePart('Lote_' + codeBatch + '_v' + plan.version);
};

MAQUINA_EXPORT._escreverComFileSystemAPI = async function (files, folderName) {
  const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
  const dir = await parent.getDirectoryHandle(folderName, { create: true });
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const handle = await dir.getFileHandle(f.name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(f.data instanceof Uint8Array ? f.data : new Blob([f.data], { type: 'text/xml' }));
    await writable.close();
  }
  return folderName;
};

MAQUINA_EXPORT._escreverComoZip = async function (files, folderName) {
  if (typeof JSZip === 'undefined') throw new Error('Biblioteca de ZIP não carregou — recarregue a página.');
  const zip = new JSZip();
  files.forEach(function (f) { zip.file(f.name, f.data); });
  const blob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = folderName + '.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
};

/* ============================================================
   Entrada pública — chamada pelo botão na tela do plano de corte
   ============================================================ */
MAQUINA_EXPORT.gerar = async function (planId, btn) {
  const texto = btn ? btn.textContent : '';
  const avisar = function (msg, erro) {
    if (!btn) { if (erro) console.error(msg); return; }
    let el = btn.parentNode.querySelector('.erp-maquina-status');
    if (!el) {
      el = document.createElement('span');
      el.className = 'erp-maquina-status erp-xs';
      btn.parentNode.appendChild(el);
    }
    el.style.color = erro ? 'var(--danger)' : 'var(--muted)';
    el.textContent = msg;
  };

  if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  avisar('lendo o plano…');
  try {
    const plan = await LOTES.plan(planId);
    if (plan) {
      /* Retalhos cadastrados por este plano (erp.offcuts, com o código
         RET-000123): a etiqueta OC leva esse código em barras pra dar
         entrada/saída no estoque com leitor (pedido do Matt, 22/09-8). */
      const { data: ocRows } = await LOTES.erp().from('offcuts')
        .select('id, code, origin_sheet_id, width_mm, height_mm').eq('origin_plan_id', planId);
      plan._offcutRows = ocRows || [];
    }
    if (!plan) { avisar('Plano não encontrado.', true); return; }
    if (!plan._pieces.length) { avisar('Este plano não tem peça nenhuma.', true); return; }

    avisar('vendo quais peças vão pra furadeira…');
    try { await FURACAO_LOTE.marcarPecasFuradas(plan.batch_id, plan._pieces); }
    catch (err) {
      console.error('[maquina-export] não consegui ver quais peças furam — etiquetas sem bolinha:', err);
    }

    avisar('montando XML e etiquetas (' + plan._pieces.length + ' peça(s))…');
    const files = MAQUINA_EXPORT._montarArquivos(plan);
    const folderName = MAQUINA_EXPORT._nomePasta(plan);

    if (window.showDirectoryPicker) {
      avisar('escolha onde criar a pasta…');
      try {
        await MAQUINA_EXPORT._escreverComFileSystemAPI(files, folderName);
      } catch (err) {
        if (err && err.name === 'AbortError') { avisar('cancelado.'); return; }
        throw err;
      }
      avisar(files.length + ' arquivo(s) gravados na pasta "' + folderName + '".');
    } else {
      avisar('este navegador não deixa escrever pasta direto — baixando .zip (é só extrair)…');
      await MAQUINA_EXPORT._escreverComoZip(files, folderName);
      avisar(files.length + ' arquivo(s) no ' + folderName + '.zip baixado — extraia antes de levar pra máquina.');
    }
  } catch (err) {
    console.error('[maquina-export]', err);
    avisar(LOTES.explainError ? LOTES.explainError(err) : (err.message || String(err)), true);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = texto; }
  }
};
