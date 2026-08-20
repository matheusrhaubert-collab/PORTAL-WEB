// layout-engine.js — CONSTRUTOR DE ARMÁRIOS: árvore de vãos -> peças
//
// Ler docs/criador-de-modulos-spec.md antes de mexer aqui.
// Protótipo navegável: teste-construtor-modulo.html (mesma lógica, com tela).
//
// ==========================================================================
// O QUE É
// ==========================================================================
// O interior de um módulo é uma ÁRVORE DE VÃOS. Um vão é um paralelepípedo
// vazio que pode:
//   dividir-se  — em X (divisória vertical) ou Y (prateleira). Gera N filhos,
//                 que também são vãos, e N-1 peças de separação.
//   preencher   — gaveta, cabide, cesto, ripado: ocupa o vão inteiro.
//   fechar      — porta: cobre a frente do vão (ou uma faixa de filhos).
// Recursivo. Três regras cobrem quase todo o catálogo.
//
// PRATELEIRA É UMA DIVISÃO, NÃO UM CONTEÚDO. Prateleira cria espaço novo:
// tratando como divisão em Y, a faixa entre duas prateleiras vira um vão de
// verdade e aceita porta, gaveta e cabide sem uma linha de código a mais.
//
// ==========================================================================
// A REGRA QUE SEGURA O PROJETO INTEIRO
// ==========================================================================
// Este módulo NÃO substitui o motor de peças. Ele GERA LINHAS no mesmo
// formato que loadRecursivePiecesForModule (portal.js/client.js/admin.js)
// devolve — as mesmas que Pricing.calculateAssembly e resolvePiecesForViewer
// já consomem hoje.
//
// Por isso: pricing.js, viewer3d.js, drilling.js, o plano de corte e o lote
// do ERP NÃO MUDAM. Um módulo antigo (lista plana em module_components) e um
// módulo montado por árvore convivem no mesmo projeto sem nenhum "if"
// espalhado — a diferença morre aqui dentro.
//
// Se algum dia precisar de um "if" no pricing.js pra entender uma peça vinda
// da árvore, o desenho está errado e é hora de parar.
//
// A peça gerada sai sempre com position_role='free' e offset ABSOLUTO em mm
// (o "zero absoluto" do viewer3d.placePieceInBox: canto chão-fundo-esquerda
// do módulo). É o papel mais simples e o único sem comportamento automático
// por cima — que é exatamente o que queremos, já que a posição foi calculada
// aqui com precisão.
//
// ==========================================================================
// MILÍMETRO INTEIRO, SEMPRE
// ==========================================================================
// A soma dos filhos SEMPRE fecha o vão do pai, ao milímetro. O resto do
// arredondamento vai todo pro último filho elástico. Isso não é preciosismo:
// o contra-furo por propagação (migrations 043/054) só encontra o par quando
// as peças ENCOSTAM de verdade — 0,5mm de folga e a furação sai errada.
(function (global) {
  'use strict';

  var uid = 0;
  function nid() { uid += 1; return 'v' + uid + '_' + Math.random().toString(36).slice(2, 7); }

  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

  // ------------------------------------------------------------------------
  // NÓ DA ÁRVORE
  // ------------------------------------------------------------------------
  // splitAxis/splitAcc  — como me divido (null = vão folha)
  // sizeMode/sizeValue  — meu tamanho dentro do pai ('fill' | 'fixed')
  // content             — {acc, params} que me preenche (só vão folha)
  // fronts              — [{acc, params, from, to}] que fecham minha frente.
  //                       LISTA, não um só: um mesmo nível pode ter uma porta
  //                       de duas colunas ao lado de outra de uma coluna.
  //                       from/to = índices dos filhos cobertos; null = tudo.
  // locked              — estrutural: o CLIENTE não mexe (a engenharia sim).
  //                       É esta flag que separa "o módulo" de "as opções do
  //                       módulo".
  function newVoid(extra) {
    var n = {
      id: nid(), children: [],
      splitAxis: null, splitAcc: null,
      sizeMode: 'fill', sizeValue: null,
      content: null, fronts: [],
      params: {}, locked: false
    };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) n[k] = extra[k];
    return n;
  }

  function serialize(n) {
    return {
      id: n.id, splitAxis: n.splitAxis, splitAcc: n.splitAcc,
      sizeMode: n.sizeMode, sizeValue: n.sizeValue,
      content: n.content, fronts: n.fronts || [], params: n.params || {},
      locked: !!n.locked,
      children: (n.children || []).map(serialize)
    };
  }
  function deserialize(o) {
    if (!o) return newVoid();
    var n = newVoid(o);
    n.id = o.id || nid();
    n.fronts = o.fronts || [];
    n.children = (o.children || []).map(deserialize);
    return n;
  }

  function findNode(root, id) {
    if (!root) return null;
    if (root.id === id) return root;
    for (var i = 0; i < root.children.length; i++) {
      var r = findNode(root.children[i], id);
      if (r) return r;
    }
    return null;
  }
  function findParent(root, id, par) {
    if (!root) return null;
    if (root.id === id) return par || null;
    for (var i = 0; i < root.children.length; i++) {
      var r = findParent(root.children[i], id, root);
      if (r) return r;
    }
    return null;
  }

  // ------------------------------------------------------------------------
  // OPERAÇÕES
  // ------------------------------------------------------------------------
  // Dividir. Prateleira e divisória são a MESMA operação — só muda o eixo,
  // que vem do agregado escolhido.
  function applySplit(node, accKey, qtd, cat) {
    var acc = cat[accKey];
    if (!acc) return;
    var n = Math.max(1, Math.round(qtd || 1)) + 1;   // N divisórias => N+1 vãos
    node.splitAxis = acc.axis;
    node.splitAcc = accKey;
    node.content = null;
    var antigos = node.children;
    node.children = [];
    for (var i = 0; i < n; i++) {
      var kid = antigos[i] || newVoid();
      kid.sizeMode = 'fill'; kid.sizeValue = null;
      node.children.push(kid);
    }
  }
  function applyContent(node, accKey, cat) {
    node.splitAxis = null; node.splitAcc = null; node.children = [];
    node.content = { acc: accKey, params: Object.assign({}, (cat[accKey] || {}).params) };
  }
  // from/to null = cobre o vão inteiro, e nesse caso SUBSTITUI uma frente de
  // vão inteiro já existente em vez de empilhar duas portas na mesma cara.
  function applyFront(node, accKey, from, to, cat) {
    node.fronts = node.fronts || [];
    if (from == null) node.fronts = node.fronts.filter(function (f) { return f.from != null; });
    node.fronts.push({
      acc: accKey,
      params: Object.assign({}, (cat[accKey] || {}).params),
      from: from == null ? null : from,
      to: to == null ? null : to
    });
  }
  function removeFront(node, i) { (node.fronts || []).splice(i, 1); }
  function clearNode(node, what) {
    if (what === 'split') { node.splitAxis = null; node.splitAcc = null; node.children = []; }
    if (what === 'content') node.content = null;
    if (what === 'front') node.fronts = [];
  }
  function clearAll(node) { clearNode(node, 'split'); clearNode(node, 'content'); clearNode(node, 'front'); }

  // ------------------------------------------------------------------------
  // ZONA INTERNA — a raiz da árvore
  // ------------------------------------------------------------------------
  // Depois da migration 085 isto vem pronto de modules.inner_*_formula. Sem
  // ela (todo módulo de hoje), DEDUZ do casco: desconta as peças que já estão
  // encostadas nas paredes do módulo. Deduzir é palpite razoável pra abrir um
  // módulo antigo no construtor; a fórmula explícita do cadastro é melhor e
  // ganha quando existir.
  function innerZoneFromParts(parts, W, H, D) {
    var x0 = 0, y0 = 0, z0 = 0, x1 = W, y1 = H, z1 = D;
    (parts || []).forEach(function (p) {
      var w = num(p.width_mm), h = num(p.height_mm), d = num(p.depth_mm);
      var x = num(p.offset_x_mm), y = num(p.offset_y_mm), z = num(p.offset_z_mm);
      var role = p.position_role;
      if (role === 'left') x0 = Math.max(x0, x + w);
      else if (role === 'right') x1 = Math.min(x1, x);
      else if (role === 'bottom') y0 = Math.max(y0, y + h);
      else if (role === 'top') y1 = Math.min(y1, y);
      else if (role === 'back') z0 = Math.max(z0, z + d);
    });
    // Casco não cadastrado com esses papéis: não inventa zona interna maior
    // que o módulo, mas também não devolve caixa vazia.
    return {
      x: x0, y: y0, z: z0,
      w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0), d: Math.max(1, z1 - z0)
    };
  }

  // ------------------------------------------------------------------------
  // DIVISÃO ENTRE IRMÃOS
  // ------------------------------------------------------------------------
  // 'fixed' come o valor cravado, 'fill' rateia o resto. Se NENHUM for
  // elástico (acontece depois de arrastar todas as divisórias à mão), o
  // ÚLTIMO absorve a diferença assim mesmo — senão aumentar o módulo deixaria
  // espaço sem dono, com as peças parando no meio e a lateral boiando.
  function splitSizes(total, kids, thickness) {
    var n = kids.length;
    var avail = total - thickness * (n - 1);
    var fixed = kids.map(function (k) {
      return k.sizeMode === 'fixed' ? Math.max(0, Math.round(num(k.sizeValue))) : null;
    });
    var somaFixed = fixed.reduce(function (a, b) { return a + (b || 0); }, 0);
    var fillIdx = [];
    fixed.forEach(function (v, i) { if (v === null) fillIdx.push(i); });
    var sizes = fixed.slice();
    if (fillIdx.length) {
      var each = Math.floor((avail - somaFixed) / fillIdx.length);
      fillIdx.forEach(function (i) { sizes[i] = Math.max(1, each); });
      var soma = sizes.reduce(function (a, b) { return a + b; }, 0);
      sizes[fillIdx[fillIdx.length - 1]] += avail - soma;
    } else {
      sizes[n - 1] = Math.max(1, sizes[n - 1] + (avail - somaFixed));
    }
    return sizes;
  }

  // ------------------------------------------------------------------------
  // PORTA EMBUTIDA COME PROFUNDIDADE
  // ------------------------------------------------------------------------
  // Sobreposta: 0 — fica NA FRENTE do módulo (z = D), não rouba nada de
  // dentro. Embutida: a própria espessura + folga da dobradiça. É por isso
  // que os internos recuam; sem isso a prateleira encosta na porta e ela não
  // fecha. Só o vão COBERTO recua — vizinho sem porta mantém a profundidade.
  function consumoFrente(node, childIdx, cat, esp, folgaDob) {
    var c = 0;
    (node.fronts || []).forEach(function (f) {
      var cobre = (f.from == null) || (childIdx != null && childIdx >= f.from && childIdx <= f.to);
      if (!cobre) return;
      var p = Object.assign({}, (cat[f.acc] || {}).params, f.params || {});
      if (!p.sobrepoe) c = Math.max(c, esp + folgaDob);
    });
    return c;
  }
  function consumoMax(node, cat, esp, folgaDob) {
    return consumoFrente(node, null, cat, esp, folgaDob) ||
      (node.fronts || []).reduce(function (acc, f) {
        var p = Object.assign({}, (cat[f.acc] || {}).params, f.params || {});
        return !p.sobrepoe ? Math.max(acc, esp + folgaDob) : acc;
      }, 0);
  }

  // ------------------------------------------------------------------------
  // RESOLVER
  // ------------------------------------------------------------------------
  // Devolve peças GEOMÉTRICAS (mm absolutos) + a lista de vãos clicáveis.
  // Quem transforma isso em linha de module_components é toPieceRows.
  // Folga TRASEIRA do caixote (gaveta/gaveteiro/cesto/Drawer agregado),
  // 2026-08-19 — Matt: "as gavetas estao invadindo o fundo... precisamos de
  // 20mm de afastamento além do fundo (quando tem)". REVISADO no mesmo dia
  // (2ª rodada), depois de reportar que a folga "não está valendo": "eu fui
  // muito esplicito quando pedi. 20mm de seguranca alem do fundo. ou seja,
  // se a gaveta tem 305mm o espaco minimo pra ela caber e de 325[mm], se
  // tiver fundo, 345mm" — ou seja DUAS folgas que SOMAM, não uma só:
  //   MECANISMO (20mm) — SEMPRE, existe mesmo sem fundo físico: é o espaço
  //   que a ferragem da corrediça (bracket/curso) precisa atrás da gaveta,
  //   qualquer que seja o vão.
  //   FUNDO (+20mm) — só quando `opts.temFundo` confirma que a zona achou
  //   um fundo de verdade (`dedu.d`/`zona.d`, o VÃO LIVRE, já descontam a
  //   ESPESSURA do fundo — ver computeProjectSlotInnerZone no portal e
  //   CST.zonaDoCasco no ERP — mas isso por si só não garante folga
  //   nenhuma de AR entre a gaveta e o fundo).
  // 305mm de gaveta -> 325mm de vão mínimo sem fundo, 345mm com fundo —
  // bate com os dois números do Matt. Conceito irmão de
  // DRAWER_DEPTH_CLEARANCE_MM em pricing.js (mesma soma, 40mm com fundo),
  // mas esse é do sistema de módulo com fixed_depths — este é do construtor
  // de vãos (aqui).
  var FOLGA_CAIXOTE_MECANISMO_MM = 20;
  var FOLGA_CAIXOTE_FUNDO_MM = 20;

  // Folga de ALTURA na divisão do vão entre N caixotes empilhados
  // (2026-08-19, Matt: "as gavetas precisams ter mais folga, considera uma
  // folga de 50mm alem do tamanho da gaveta pra dividir ela melhor no
  // construtor. quando e so uma gaveta ela pode ter a folga bem menor de
  // 20mm"). Antes o corte de cada célula (emitContent, ramo caixote) sempre
  // descontava 20mm fixos da altura de cada gaveta, mesmo com várias
  // empilhadas — ficavam com pouco espaço de mecanismo/folga entre elas.
  // Com mais de uma gaveta no mesmo vão (quantidade > 1) o desconto por
  // gaveta sobe pra 50mm; com uma só, continua nos 20mm de antes.
  var FOLGA_CAIXOTE_ALTURA_MULTIPLA_MM = 50;
  var FOLGA_CAIXOTE_ALTURA_UNICA_MM = 20;

  // Afastamento do CABIDE (acc.forma === 'barra') em relação ao FUNDO do vão
  // (2026-08-20, Matt, 1º pedido: "quero que o rod entre sempre a 270mm
  // afastado da parte de tras, essa medida serve perfeitamente para colocar
  // o cabide. mesmo que o vao tenha 300, ele deve ficar 270mm do fundo").
  // Antes emitContent centralizava o cabide no MEIO da profundidade do vão
  // (box.z + box.d/2) — um vão mais raso ou mais fundo mudava a posição do
  // cabide sozinho, sem controle.
  //
  // REGRA CORRIGIDA no mesmo dia (Matt: "desculpe, esqueci, a regra do rod e
  // a seguinte se a profundidade for menor do que 540, deixa 270mm afastado.
  // se for mais do que 540 pode dividir no meio."): 270mm fixo SÓ vale pra
  // vão raso; vão fundo (>=540mm) volta a CENTRALIZAR — nesse caso 270mm
  // deixaria sobrando muito espaço vazio atrás do cabide, então divide a
  // profundidade ao meio como antes do 1º pedido.
  var AFASTAMENTO_CABIDE_FUNDO_MM = 270;
  var LIMIAR_CABIDE_CENTRALIZA_MM = 540;

  function build(root, zona, opts) {
    opts = opts || {};
    var cat = opts.catalogo || {};
    var esp = num(opts.espessura) || 18;
    var folgaDob = num(opts.folgaDobradica) || 2;
    var folgaFundo = FOLGA_CAIXOTE_MECANISMO_MM + (opts.temFundo ? FOLGA_CAIXOTE_FUNDO_MM : 0);

    var out = [], voids = [];

    function push(node, p) {
      p.nodeId = node.id;
      p.position_role = p.position_role || 'free';
      out.push(p);
    }

    function emitDivider(node, acc, axis, pos, box, th, i, cons) {
      var recuo = num((node.params || {}).recuo_mm != null
        ? node.params.recuo_mm : (acc.params || {}).recuo_mm);
      if (axis === 'x') {
        // O RECUO VALE NOS DOIS EIXOS (2026-08-15, Matt: "divisórias fixas
        // (bases) 1mm menor e pra trás da lateral, horizontais E verticais").
        // Só o ramo horizontal aplicava recuo; a divisória VERTICAL nascia
        // rente à frente do vão, encostando na lateral — que é justamente o
        // que dá problema na montagem.
        // O RECUO SAI NA FRENTE, NÃO ATRÁS (2026-08-15). Antes era
        // `z: box.z + recuo`, que empurra a peça pra FRENTE e deixa a folga
        // ATRÁS — a divisória ficava rente à frente da lateral (o "ficou 1mm
        // pra fora e não pra dentro" do Matt). Mantendo z e só encurtando a
        // profundidade, o fundo fica alinhado e a folga aparece na FRENTE:
        // é isso que "1mm menor e pra trás da lateral" quer dizer.
        push(node, {
          kind: 'split', accKey: node.splitAcc, divIndex: i, label: acc.name,
          x: pos, y: box.y, z: box.z,
          w: th, h: box.h, d: Math.max(60, box.d - recuo - cons)
        });
      } else {
        push(node, {
          kind: 'split', accKey: node.splitAcc, divIndex: i, label: acc.name,
          x: box.x, y: pos, z: box.z,
          w: box.w, h: th, d: Math.max(60, box.d - recuo - cons),
          tilt_deg: num((node.params || {}).angulo_deg)
        });
      }
    }

    function emitContent(node, box) {
      var key = node.content.acc, acc = cat[key];
      if (!acc) return;
      var p = Object.assign({}, acc.params, node.content.params || {});
      var recuo = num(p.recuo_mm);
      // O vão ocupado continua sendo alvo de clique — sem isso não há como
      // selecionar (nem apagar) uma gaveta já inserida.
      voids.push({ nodeId: node.id, box: box, locked: !!node.locked, occupied: true });

      if (acc.forma === 'barra') {
        var off = num(p.altura_do_topo_mm) || 60;
        // Vão raso (< 540mm): fixo a 270mm do FUNDO — ver
        // AFASTAMENTO_CABIDE_FUNDO_MM/LIMIAR_CABIDE_CENTRALIZA_MM acima.
        // Vão fundo (>= 540mm): CENTRALIZA (box.d/2), senão sobra vão vazio
        // atrás do cabide. Clampa em box.d só pra não estourar a frente num
        // vão mais raso que o afastamento fixo (defensivo).
        var afastamentoFundo = box.d < LIMIAR_CABIDE_CENTRALIZA_MM
          ? Math.min(num(p.afastamento_fundo_mm) || AFASTAMENTO_CABIDE_FUNDO_MM, box.d)
          : box.d / 2;
        push(node, {
          kind: 'content', accKey: key, label: acc.name, shape_type: 'oval_rod',
          x: box.x + 12, y: box.y + box.h - off, z: box.z + afastamentoFundo - 15,
          w: box.w - 24, h: 30, d: 15
        });
        return;
      }
      if (acc.forma === 'ripas') {
        var passo = Math.max(30, num(p.passo_mm) || 60);
        var espR = num(p.espessura_mm) || 15;
        var n = Math.max(1, Math.floor(box.w / passo));
        var larg = Math.max(12, passo * 0.62);
        for (var i = 0; i < n; i++) {
          push(node, {
            kind: 'content', accKey: key, label: acc.name + ' ' + (i + 1),
            x: box.x + i * passo + (passo - larg) / 2, y: box.y, z: box.z,
            w: larg, h: box.h, d: espR
          });
        }
        return;
      }
      // caixote (gaveta, gaveteiro, cesto, Drawer agregado): N empilhados no
      // vão, SEMPRE alinhados pela FRENTE do vão (Matt, 2026-08-18: "as
      // gavetas ficam alinhadas por trás do módulo, preciso que elas
      // alinhem pela frente do módulo e recuem 2mm pra dentro").
      //
      // z nasce no canto de TRÁS (box.z + recuo — recuo é o parâmetro de
      // sempre, gap opcional em relação ao FUNDO, 0 se não cadastrado) e a
      // peça se estende pra FRENTE por `prof`. Antes `prof` deixava 20mm de
      // folga fixa na FRENTE (box.d - recuo - 20) — com recuo=0 (o caso
      // comum, nenhuma gaveta tem recuo_mm cadastrado) a peça saía ENCOSTADA
      // no fundo e a folga toda sobrava na frente, o oposto do que devia.
      // Trocando a folga fixa da frente pra 2mm, a face frontal da peça
      // sempre cai em `box.z + box.d - 2` — 2mm pra dentro da frente do vão
      // — INDEPENDENTE do valor de `recuo` (recuo só ainda controla a folga
      // do FUNDO, pra quem cadastrar recuo_mm por outro motivo).
      // recuoCaixote é o recuo EFETIVO em relação ao fundo: o maior entre o
      // `recuo_mm` cadastrado (motivo manual do acessório) e a folga de
      // fundo automática (folgaFundo, acima) — nunca os dois somados, senão
      // quem já cadastrasse recuo_mm=20 dobraria pra 40 à toa.
      var recuoCaixote = Math.max(recuo, folgaFundo);
      var qtd = Math.max(1, Math.round(num(p.quantidade) || 1));
      var folgaAltura = qtd > 1 ? FOLGA_CAIXOTE_ALTURA_MULTIPLA_MM : FOLGA_CAIXOTE_ALTURA_UNICA_MM;
      var gap = 3, hCada = (box.h - gap * (qtd - 1)) / qtd;
      for (var j = 0; j < qtd; j++) {
        var y = box.y + j * (hCada + gap);
        var prof = Math.max(120, box.d - recuoCaixote - 2);
        push(node, {
          kind: 'content', accKey: key, label: acc.name + (qtd > 1 ? ' ' + (j + 1) : ''),
          x: box.x + 12, y: y + 4, z: box.z + recuoCaixote,
          w: box.w - 24, h: Math.max(20, hCada - folgaAltura), d: prof,
          opening_type: 'slide_out'
        });
      }
    }

    // Frentes por ÚLTIMO: uma porta pode cobrir só uma faixa de filhos, e pra
    // saber onde ela começa e termina é preciso que as caixas dos filhos já
    // estejam calculadas.
    function emitFronts(node, box) {
      (node.fronts || []).forEach(function (f, fi) {
        var acc = cat[f.acc];
        if (!acc) return;
        var p = Object.assign({}, acc.params, f.params || {});
        var folga = num(p.folgas_mm) || 0;

        var a = box;
        if (f.from != null && node.children.length) {
          var ks = node.children.slice(f.from, f.to + 1)
            .map(function (k) { return k._boxFull; })
            .filter(Boolean);
          if (ks.length) {
            var x1 = Math.min.apply(null, ks.map(function (k) { return k.x; }));
            var x2 = Math.max.apply(null, ks.map(function (k) { return k.x + k.w; }));
            var y1 = Math.min.apply(null, ks.map(function (k) { return k.y; }));
            var y2 = Math.max.apply(null, ks.map(function (k) { return k.y + k.h; }));
            a = { x: x1, y: y1, z: box.z, w: x2 - x1, h: y2 - y1, d: box.d };
          }
        }
        // Sobreposta a z = fim do vão (protrui pra frente, mesmo que
        // viewer3d.placeFrontGroupInBox já faz). Embutida recua a espessura.
        var z = p.sobrepoe ? a.z + a.d : a.z + a.d - esp;

        if (acc.folhas === 2) {
          var wCada = (a.w - folga * 3) / 2;
          ['right', 'left'].forEach(function (lado, i) {
            push(node, {
              kind: 'front', accKey: f.acc, frontIndex: fi, embutida: !p.sobrepoe,
              label: acc.name + ' ' + (i + 1),
              x: a.x + folga + i * (wCada + folga), y: a.y + folga, z: z,
              w: wCada, h: a.h - folga * 2, d: esp,
              opening_type: lado === 'left' ? 'hinge_left' : 'hinge_right'
            });
          });
          return;
        }
        push(node, {
          kind: 'front', accKey: f.acc, frontIndex: fi, embutida: !p.sobrepoe,
          label: acc.name,
          x: a.x + folga, y: a.y + folga, z: z,
          w: a.w - folga * 2, h: a.h - folga * 2, d: esp,
          opening_type: p.lado === 'right' ? 'hinge_right' : 'hinge_left'
        });
      });
    }

    function resolve(node, box) {
      node._boxFull = box;

      if (node.splitAxis && node.children.length > 1) {
        var acc = cat[node.splitAcc];
        if (!acc) { node._box = box; voids.push({ nodeId: node.id, box: box, locked: !!node.locked }); return; }
        var th = num(acc.espessura) || esp;
        var axis = node.splitAxis;
        var sizes = splitSizes(axis === 'x' ? box.w : box.h, node.children, th);
        var consDiv = consumoMax(node, cat, esp, folgaDob);
        node._box = box;
        var cur = axis === 'x' ? box.x : box.y;
        node.children.forEach(function (kid, i) {
          var kb = axis === 'x'
            ? { x: cur, y: box.y, z: box.z, w: sizes[i], h: box.h, d: box.d }
            : { x: box.x, y: cur, z: box.z, w: box.w, h: sizes[i], d: box.d };
          var c = consumoFrente(node, i, cat, esp, folgaDob);
          resolve(kid, Object.assign({}, kb, { d: Math.max(60, kb.d - c) }));
          cur += sizes[i];
          if (i < node.children.length - 1) {
            emitDivider(node, acc, axis, cur, box, th, i, consDiv);
            cur += th;
          }
        });
        emitFronts(node, box);
        return;
      }

      var dentro = Object.assign({}, box, {
        d: Math.max(60, box.d - consumoFrente(node, null, cat, esp, folgaDob))
      });
      node._box = dentro;
      if (node.content) emitContent(node, dentro);
      else voids.push({ nodeId: node.id, box: dentro, locked: !!node.locked });
      emitFronts(node, box);
    }

    resolve(root, zona);
    // Milímetro inteiro — ver comentário no topo do arquivo.
    out.forEach(function (p) {
      ['x', 'y', 'z', 'w', 'h', 'd'].forEach(function (k) { p[k] = Math.round(p[k]); });
    });
    return { pieces: out, voids: voids, zona: zona };
  }

  // ------------------------------------------------------------------------
  // A PONTE — peça geométrica -> LINHA no formato de module_components
  // ------------------------------------------------------------------------
  // É aqui que a árvore some. A linha devolvida é indistinguível de uma linha
  // vinda de loadRecursivePiecesForModule, então Pricing.calculateAssembly e
  // resolvePiecesForViewer tratam ela como qualquer outra peça.
  //
  // catalogo[accKey].componente = o registro de "components" já carregado
  //   (com labor_types e component_types embutidos, igual a query do portal).
  //
  // catalogo[accKey].child_module_id (+ .module_meta/.child_pieces/
  //   .fixed_depths/.locked_presets/.own_hinge_slide) = ALTERNATIVA a
  //   .componente (migration 103 — MODELO DE PORTA/FRENTE). O agregado não é
  //   uma peça de catálogo, é um MÓDULO INVISÍVEL inteiro usado como peça
  //   aninhada — a "engenharia própria" do modelo (ex: Shaker = montantes +
  //   travessas + painel), resolvida recursivamente ANTES de chegar aqui,
  //   mesmíssimo shape que o branch child_module_id de
  //   loadRecursivePiecesForModule produz em portal.js (module_meta = a linha
  //   de `modules`; child_pieces = o resultado recursivo daquela função).
  //   toPieceRows só CONSOME esse resultado já resolvido — quem decide QUAL
  //   child_module_id vale pra um accKey com is_door_model_slot=true (o
  //   modelo escolhido pelo cliente, ou o is_default da whitelist
  //   module_door_models) é quem MONTA catalogo, não esta função. Ver
  //   docs/modelos-de-porta-frente-spec.md — hoje (2026-08-16) essa resolução
  //   ainda não está ligada: nenhum catalogo real popula child_module_id, o
  //   branch abaixo fica morto até o carregador do catálogo (portal.js)
  //   passar a fazer isso.
  //
  //   Sem .componente NEM .child_module_id o agregado não pode ser usado —
  //   sem peça real não há preço.
  //
  // As fórmulas saem como NÚMERO LITERAL em texto ('864'): o avaliador aceita,
  // e assim a geometria calculada aqui é a palavra final, sem depender de W/H/D
  // do módulo pai.
  // REASSINA id/piece_id em CADA peça de um `child_pieces` (recursivo), com
  // um prefixo ÚNICO POR NÓ DA ÁRVORE (2026-08-19, Matt: "nao tem variavel
  // tamanho no calculo... entao o calculo continua errado" — furação vindo
  // 3× maior numa gaveta via construtor, exatamente o número de vezes que o
  // MESMO agregado de gaveta aparecia no vão).
  //
  // POR QUÊ: um agregado child_module_id (migration 103 — gaveta/porta como
  // MÓDULO inteiro) busca as peças do módulo filho UMA VEZ só
  // (loadRecursivePiecesForModule em ensureAccessoryCatalog/loadProjectBuilderCatalog)
  // e guarda no catálogo (acc.child_pieces). Cada peça ali carrega o id da
  // LINHA de module_components do módulo filho — o MESMO sempre, porque é a
  // mesma consulta no banco. Se esse MESMO agregado aparece 2+ vezes na
  // árvore (2 gavetas do mesmo tipo empilhadas no vão — exatamente o caso
  // "Drawer 1"/"Drawer 2"), toPieceRows cria uma linha-wrapper NOVA e única
  // pra cada instância (id: 'lay:'+nodeId+':'+i, já era assim), mas até aqui
  // as DUAS instâncias apontavam pro MESMO array `acc.child_pieces` — as
  // peças de dentro (BACK/LEFT SIDE/RIGHT SIDE/Stretcher) continuavam com o
  // MESMO id do catálogo nas duas.
  //
  // Drilling.countHolesByPiece e Pricing.processLaborFor agregam furos POR
  // CHAVE (piece.id/piece_id) — dois wrappers diferentes, mas com peças
  // filhas de MESMO id, jogam os furos das duas instâncias na MESMA gaveta
  // do mapa (out[chave] += holes.length, chamado uma vez por instância). Com
  // 3 gavetas iguais no mesmo vão, cada peça acumulava 3×. O preço de chapa/
  // fita/corte não sofria (aqueles são resolvidos e somados por INSTÂNCIA,
  // não por um mapa global keyed por id) — só a furação, que é keyed.
  //
  // O fix: cada NÓ da árvore (cada instância de agregado) recebe sua PRÓPRIA
  // cópia de child_pieces com ids prefixados por row.id (já único por nó) —
  // assim duas gavetas iguais nunca mais colidem na chave, em nenhum dos
  // dois lados (pricing.js calculateAssembly e module-pieces.js
  // resolvePiecesForViewer/Drilling.countHolesByPiece leem os MESMOS objetos
  // desta árvore, então um fix só aqui vale pros dois).
  // 2026-08-19, MESMO DIA — o fix acima (comentário longo) tinha um furo: ele
  // reescreve `cp.id`, mas os itens de `acc.child_pieces` NUNCA TÊM `.id` —
  // vêm de `loadRecursivePiecesForModule` (module-pieces.js), que só grava
  // `piece_id` (a linha de module_components), nunca `id` puro (conferido: a
  // lista fechada de campos do `parts.push({...})` de lá não tem `id`). Então
  // `cp.id` é sempre `undefined`, e TODA peça da gaveta (BACK, LEFT SIDE,
  // RIGHT SIDE, Stretcher…) saía com o MESMO `id` sintético — literalmente
  // `prefix + ':undefined'`, igual pra todas.
  //
  // Consequência (achada 19/08, Matt: furação de LEFT SIDE/RIGHT SIDE saindo
  // menor que o certo e a de Stretcher saindo maior, só quando a gaveta é
  // inserida via Construtor — testado direto no módulo e bateu certo):
  // `Drilling.countHolesByPiece` indexa o mapa por `part.piece_id || part.id`
  // (piece_id primeiro — e piece_id AQUI continua sendo o id ORIGINAL, não
  // prefixado, porque só `id` era reescrito). `Pricing.processLaborFor` lê
  // por `piece.id || piece.piece_id` (id primeiro) — e `id` É o prefixado.
  // Ou seja: o mapa de furos reais é guardado com uma chave, e o preço
  // procura com OUTRA. Nunca bate: toda peça aninhada via Construtor cai no
  // fallback `furos_equivalentes` do cadastro (um número ESTÁTICO por
  // componente), não na contagem real — e como várias peças diferentes hoje
  // compartilham o mesmo componente genérico Flatbord (ver
  // [[peca_generica_e_labor_por_processo]]), várias saem com o MESMO valor
  // errado.
  //
  // Fix: reescrever OS DOIS campos (`id` e `piece_id`), cada um a partir do
  // valor que a peça realmente tinha (fallback pro outro campo quando um
  // estiver ausente) — assim os dois lados (drilling.js e pricing.js), não
  // importa qual campo cada um prefere, leem a MESMA chave prefixada, única
  // por instância de agregado.
  function reidChildPieces(list, prefix) {
    return (list || []).map(function (cp) {
      var baseId = cp.id != null ? cp.id : cp.piece_id;
      var basePieceId = cp.piece_id != null ? cp.piece_id : cp.id;
      var clone = Object.assign({}, cp, {
        id: baseId != null ? prefix + ':' + baseId : cp.id,
        piece_id: basePieceId != null ? prefix + ':' + basePieceId : cp.piece_id
      });
      if (clone.is_module && clone.child_pieces && clone.child_pieces.length) {
        clone.child_pieces = reidChildPieces(clone.child_pieces, prefix);
      }
      return clone;
    });
  }

  // VARIANTE POR PROFUNDIDADE (migration 126, 2026-08-19 — Matt: "quero ter
  // um modelo de gaveta, por que quando troco modelo troca corpo e
  // corredica. entao acho melhor ligarmos via componentes"). Vários
  // agregados podem ser a MESMA oferta pro cliente (um único "Gaveta" no
  // menu — ver o filtro em fillProjectBuilderLibGrid, portal-07-construtor.js,
  // que esconde quem tem depth_variant_of), cada um apontando pra um
  // módulo-corpo DIFERENTE — com a corrediça certa já embutida nele via
  // module_slide_models/own_slide_model (mecanismo que já existia, migration
  // 044/103; nada mudou ali). A escolha de QUAL módulo entra é automática:
  // bate a profundidade REAL do vão (p.d, mm) contra a faixa cadastrada
  // (depth_bracket_min_mm/max_mm) em cada agregado da família.
  //
  // Família = todo agregado cujo depth_variant_of aponta pro mesmo
  // "representante" (o que aparece no menu) + o próprio representante (ele
  // também pode ter faixa própria — ex: a faixa "padrão"). Sem faixa
  // cadastrada em ninguém da família (o caso de sempre, catálogo antigo
  // inteiro), devolve `acc` sem tocar em nada — zero efeito colateral em
  // quem não usa isto. Faixa existe mas nenhuma bate a profundidade deste
  // vão: cai no `acc` original (nunca some a peça por faixa mal cadastrada,
  // erra pro lado de aparecer errado, não de sumir).
  function resolveDepthVariant(acc, catalogo, depthMm) {
    if (!acc) return acc;
    var familyRoot = acc.depth_variant_of || acc.id;
    var sawBracket = false;
    var best = null;
    for (var k in catalogo) {
      var e = catalogo[k];
      if (!e || (e.id !== familyRoot && e.depth_variant_of !== familyRoot)) continue;
      if (e.depth_bracket_min_mm == null && e.depth_bracket_max_mm == null) continue;
      sawBracket = true;
      if (e.depth_bracket_min_mm != null && depthMm < e.depth_bracket_min_mm) continue;
      if (e.depth_bracket_max_mm != null && depthMm > e.depth_bracket_max_mm) continue;
      best = e;
      break;
    }
    if (!sawBracket) return acc;
    return best || acc;
  }

  function toPieceRows(geradas, catalogo) {
    var rows = [];
    (geradas || []).forEach(function (p, i) {
      var acc = catalogo[p.accKey];
      acc = resolveDepthVariant(acc, catalogo, p.d);
      var comp = acc && acc.componente;
      var childModuleId = acc && acc.child_module_id;
      if (!comp && !childModuleId) return;    // sem peça real cadastrada, não gera

      if (comp) {
        var ct = comp.component_types || {};
        var row = Object.assign({}, comp, {
          // id sintético e ESTÁVEL dentro do mesmo layout: shelfQuantities,
          // pieceColorOverrides e selectedOptionalIds são keyed por id.
          id: 'lay:' + p.nodeId + ':' + i,
          // FURAÇÃO DA PEÇA DO CONSTRUTOR (2026-08-16, Matt: "essa divisória
          // deve gerar contra furo inclusive").
          //
          // A linha acima destrói `comp.id` — `id` aqui é o id SINTÉTICO da
          // linha do layout, e precisa ser (shelfQuantities, cores e
          // opcionais são keyed por ele). Só que `component_id` é o ÚNICO
          // caminho que Drilling.furosDaPeca conhece além do programa:
          //   drilling_pattern_id -> holesByPattern
          //   component_id        -> component_drillings
          // Sem ele a divisória entrava na furação como peça MUDA: recebia
          // contra-furo das outras (a caixa dela existe, pieceBox conhece
          // 'free') e nunca propagava nenhum. Era o "programa de furação
          // sumiu aqui" que o comentário do `recortes` logo abaixo cita.
          component_id: comp.id || null,
          // O programa POR USO (migration 105) mora em module_components, e a
          // peça do construtor não passa por lá. Fica lendo do agregado: o
          // catálogo é carregado com select('*'), então no dia em que
          // accessory_types ganhar a coluna isto começa a valer sozinho.
          drilling_pattern_id: acc.drilling_pattern_id || null,
          reference: p.label || comp.reference,
          quantity: 1,
          labor_cost_per_unit: comp.labor_types ? comp.labor_types.price_per_unit : 0,
          color_role_id: acc.color_role_id || ct.color_role_id || null,
          positioning: ct.positioning || null,
          // geometria: literais em mm
          width_formula: String(p.w),
          height_formula: String(p.h),
          depth_formula: String(p.d),
          offset_x_formula: String(p.x),
          offset_y_formula: String(p.y),
          offset_z_formula: String(p.z),
          // 'free' vem DEPOIS do spread de comp — o componente do catálogo tem
          // position_role próprio e ele não vale aqui: a posição já foi
          // calculada pela árvore, em absoluto.
          position_role: 'free',
          opening_type: p.opening_type || 'none',
          slides_per_unit: p.opening_type === 'slide_out' ? 2 : 0,
          shape_type: p.shape_type || comp.shape_type || null,
          tilt_angle_deg: num(p.tilt_deg),
          rotation_y_deg: 0,
          quantity_configurable: false,
          client_optional: false,
          client_optional_default_on: false,
          visibility_dimension: null,
          visibility_min_mm: null,
          visibility_max_mm: null,
          client_color_configurable: false,
          client_dimension_configurable: false,
          is_module: false,
          // ENTALHE DERIVADO (2026-08-16). A peça do construtor que cruza uma
          // peça de casco marcada `abre_recorte` (gola, toe 4½) recebe o
          // recorte em `p.recortes`, calculado em portal.js. Sem esta linha o
          // campo morria aqui: a linha é montada com lista FECHADA de campos,
          // o mesmo lugar onde o programa de furação já sumiu uma vez.
          recortes: Array.isArray(p.recortes) ? p.recortes : null,
          // rastro pra interface (a árvore que gerou esta linha)
          _layoutNodeId: p.nodeId,
          _layoutKind: p.kind
        });
        rows.push(row);
        return;
      }

      // Peça-módulo (MODELO de porta/frente, migration 103) — mesmo shape do
      // branch child_module_id de loadRecursivePiecesForModule (portal.js),
      // só que a geometria vem da árvore de vãos (literal em mm) em vez de
      // width_formula_override/offset_*_mm de uma linha de module_components.
      var meta = acc.module_meta || {};
      var lp = acc.locked_presets || {};
      var hs = acc.own_hinge_slide || {};
      var rowId = 'lay:' + p.nodeId + ':' + i;
      rows.push(Object.assign({}, meta, {
        id: rowId,
        is_module: true,
        reference: p.label || meta.name || null,
        position_role: 'free',
        color_role_id: acc.color_role_id || null,
        opening_type: p.opening_type || 'none',
        slides_per_unit: p.opening_type === 'slide_out' ? 2 : 0,
        tilt_angle_deg: num(p.tilt_deg),
        rotation_y_deg: 0,
        width_formula: String(p.w),
        height_formula: String(p.h),
        depth_formula: String(p.d),
        offset_x_formula: String(p.x),
        offset_y_formula: String(p.y),
        offset_z_formula: String(p.z),
        quantity: 1,
        quantity_configurable: false,
        client_optional: false,
        client_optional_default_on: false,
        visibility_dimension: null,
        visibility_min_mm: null,
        visibility_max_mm: null,
        client_dimension_configurable: false,
        client_color_configurable: false,
        fixed_depths: acc.fixed_depths || [],
        locked_width_presets: lp.width || [],
        locked_height_presets: lp.height || [],
        locked_depth_presets: lp.depth || [],
        locked_width_preset_options: lp.widthLabeled || [],
        locked_height_preset_options: lp.heightLabeled || [],
        locked_depth_preset_options: lp.depthLabeled || [],
        is_decoration: !!lp.is_decoration,
        own_hinge_model: hs.hinge || null,
        own_slide_model: hs.slide || null,
        // Todos os modelos de corrediça vinculados (migration 127) — espelha
        // js/module-pieces.js loadRecursivePiecesForModule, mesmo campo.
        // Pricing.pickSlideModelByDepth escolhe o certo pela profundidade.
        own_slide_models: hs.slides || [],
        own_width_min_mm: lp.ownWidthMinMm != null ? lp.ownWidthMinMm : null,
        own_width_max_mm: lp.ownWidthMaxMm != null ? lp.ownWidthMaxMm : null,
        own_height_min_mm: lp.ownHeightMinMm != null ? lp.ownHeightMinMm : null,
        own_height_max_mm: lp.ownHeightMaxMm != null ? lp.ownHeightMaxMm : null,
        own_depth_min_mm: lp.ownDepthMinMm != null ? lp.ownDepthMinMm : null,
        own_depth_max_mm: lp.ownDepthMaxMm != null ? lp.ownDepthMaxMm : null,
        module_name: meta.name || null,
        // REASSINADO POR INSTÂNCIA (2026-08-19) — ver comentário de
        // reidChildPieces acima. Sem isso, 2+ gavetas iguais no mesmo vão
        // colidiam na chave de furação (Drilling.countHolesByPiece/
        // Pricing.processLaborFor) e a furação saía multiplicada pelo número
        // de instâncias.
        child_pieces: reidChildPieces(acc.child_pieces || [], rowId),
        // rastro pra interface (a árvore que gerou esta linha)
        _layoutNodeId: p.nodeId,
        _layoutKind: p.kind
      }));
    });
    return rows;
  }

  // ------------------------------------------------------------------------
  // VALIDAÇÃO — os limites são CADASTRO, não constante
  // ------------------------------------------------------------------------
  // limites = {
  //   chapa:  {largura, comprimento},         // por cor (migration 063)
  //   maquina:{largura, comprimento},         // mesa da furadeira
  //   porPeca:{ <chave>: {minW,maxW,minH,maxH,minD,maxD, fura, veio, obs} }
  // }
  // Duas famílias independentes e vence a mais apertada:
  //   (A) limite próprio da peça — manuseio, empeno, ferragem
  //   (B) caber no material E na máquina — e são coisas DIFERENTES: uma peça
  //       pode caber folgada na chapa e não entrar na mesa da furadeira.
  // veio: 'livre' segue o lado longo (é o caso do FUNDO — passou da largura
  // da chapa, o veio deita e o outro lado passa a ser o limitado);
  // 'vertical'/'horizontal' é exigência estética e não tem jeitinho.
  function validar(pecas, limites) {
    var probs = [];
    var chapa = (limites && limites.chapa) || null;
    var maq = (limites && limites.maquina) || null;
    var porPeca = (limites && limites.porPeca) || {};

    // TRADUÇÃO COM REDE DE SEGURANÇA (2026-08-18) — este arquivo roda no portal
    // (que carrega js/i18n.js) E no ERP (que não carrega, ver cabeçalho do
    // i18n.js). Sem I18n, cai no texto em português de sempre.
    var tr = function (chave, vars, padrao) {
      if (typeof I18n !== 'undefined' && I18n && I18n.t) {
        var v = I18n.t(chave, vars);
        if (v !== chave) return v;
      }
      return padrao;
    };
    (pecas || []).forEach(function (p) {
      if (p.shape_type === 'oval_rod') { p.veio = null; return; }
      var lim = porPeca[p.accKey] || porPeca[p.position_role] || {};
      var nome = p.label || p.accKey || p.position_role;

      [['largura', 'w', 'W', 'layout.dim_width'], ['altura', 'h', 'H', 'layout.dim_height'], ['profundidade', 'd', 'D', 'layout.dim_depth']].forEach(function (t) {
        var v = p[t[1]], mx = lim['max' + t[2]], mn = lim['min' + t[2]];
        var dim = tr(t[3], null, t[0]);
        if (mx && v > mx) probs.push({ peca: nome, nodeId: p.nodeId, grave: true,
          msg: tr('layout.err_above_max', { peca: nome, dim: dim, v: Math.round(v), mx: mx },
            nome + ': ' + t[0] + ' ' + Math.round(v) + ' passa do máximo ' + mx + 'mm')
            + (lim.obs ? ' (' + lim.obs + ')' : '') });
        if (mn && v < mn) probs.push({ peca: nome, nodeId: p.nodeId, grave: true,
          msg: tr('layout.err_below_min', { peca: nome, dim: dim, v: Math.round(v), mn: mn },
            nome + ': ' + t[0] + ' ' + Math.round(v) + ' está abaixo do mínimo ' + mn + 'mm') });
      });

      p.fura = lim.fura !== false;
      var cur = Math.min(p.w, p.h), lon = Math.max(p.w, p.h);

      if (maq && p.fura) {
        if (cur > maq.largura) probs.push({ peca: nome, nodeId: p.nodeId, grave: true,
          msg: tr('layout.err_drill_table_width', { peca: nome, w: Math.round(p.w), h: Math.round(p.h), c: Math.round(cur), l: maq.largura },
            nome + ': ' + Math.round(p.w) + '×' + Math.round(p.h)
            + ' leva furação e não entra na furadeira (lado curto ' + Math.round(cur)
            + ' > ' + maq.largura + 'mm de mesa)') });
        else if (lon > maq.comprimento) probs.push({ peca: nome, nodeId: p.nodeId, grave: true,
          msg: tr('layout.err_drill_table_length', { peca: nome, n: Math.round(lon), c: maq.comprimento },
            nome + ': ' + Math.round(lon) + 'mm leva furação e passa do comprimento da furadeira ('
            + maq.comprimento + 'mm)') });
      }

      if (!chapa) { p.veio = lim.veio || null; return; }
      var exig = lim.veio || 'livre';
      if (exig === 'livre') {
        p.veio = p.w >= p.h ? 'horizontal' : 'vertical';
        if (cur > chapa.largura) probs.push({ peca: nome, nodeId: p.nodeId, grave: true,
          msg: tr('layout.err_sheet_no_fit', { peca: nome, w: Math.round(p.w), h: Math.round(p.h), c: Math.round(cur), l: chapa.largura },
            nome + ': ' + Math.round(p.w) + '×' + Math.round(p.h)
            + ' não cabe na chapa em nenhum sentido (lado curto ' + Math.round(cur)
            + ' > ' + chapa.largura + 'mm)') });
        else if (lon > chapa.comprimento) probs.push({ peca: nome, nodeId: p.nodeId, grave: true,
          msg: tr('layout.err_sheet_too_long', { peca: nome, n: Math.round(lon), c: chapa.comprimento },
            nome + ': ' + Math.round(lon) + 'mm é mais comprido que a chapa ('
            + chapa.comprimento + 'mm)') });
      } else {
        p.veio = exig;
        var trans = exig === 'vertical' ? p.w : p.h;
        var along = exig === 'vertical' ? p.h : p.w;
        if (trans > chapa.largura) probs.push({ peca: nome, nodeId: p.nodeId, grave: true,
          msg: tr('layout.err_grain_no_fit', { peca: nome, n: Math.round(trans), v: exig, l: chapa.largura },
            nome + ': ' + Math.round(trans) + 'mm com veio ' + exig
            + ' obrigatório não cabe na chapa (' + chapa.largura + 'mm)') });
        else if (along > chapa.comprimento) probs.push({ peca: nome, nodeId: p.nodeId, grave: true,
          msg: tr('layout.err_grain_too_long', { peca: nome, n: Math.round(along), c: chapa.comprimento },
            nome + ': ' + Math.round(along) + 'mm passa do comprimento da chapa ('
            + chapa.comprimento + 'mm)') });
      }
    });
    return probs;
  }

  // Filtro de OFERTA (≠ limite de fabricação): só oferece o agregado se o vão
  // comporta. O mínimo efetivo é o MAIOR entre o do catálogo e o do módulo
  // (module_accessory_options) — um módulo pode ser mais exigente que o
  // catálogo, nunca menos.
  function cabeNoVao(acc, box, porModulo) {
    if (!acc || !box) return false;
    var pm = porModulo || {};
    var mw = Math.max(num(acc.minW), num(pm.min_void_w_mm));
    var mh = Math.max(num(acc.minH), num(pm.min_void_h_mm));
    var md = Math.max(num(acc.minD), num(pm.min_void_d_mm));
    return box.w >= mw && box.h >= mh && box.d >= md;
  }

  global.LayoutEngine = {
    newVoid: newVoid,
    serialize: serialize,
    deserialize: deserialize,
    findNode: findNode,
    findParent: findParent,
    applySplit: applySplit,
    applyContent: applyContent,
    applyFront: applyFront,
    removeFront: removeFront,
    clearNode: clearNode,
    clearAll: clearAll,
    innerZoneFromParts: innerZoneFromParts,
    splitSizes: splitSizes,
    build: build,
    toPieceRows: toPieceRows,
    validar: validar,
    cabeNoVao: cabeNoVao
  };
})(typeof window !== 'undefined' ? window : this);
