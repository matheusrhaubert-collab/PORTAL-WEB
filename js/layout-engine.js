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

  // --------------------------------------------------------------------
  // PORTA — regras de inclusão/posicionamento (2026-08-20, migration 132).
  // Ver docs/modelos-de-porta-frente-spec.md seção 8 pro pedido completo.
  //
  //   externa — porta MAIOR que o vão (sobrepõe): soma folga nos 2 lados da
  //     largura e, na altura, desce ABAIXO do vão e sobe ACIMA dele (valores
  //     diferentes pra cada lado).
  //   interna — porta MENOR que o vão (embute, com reveal): desconta folga
  //     nos 2 lados, largura e altura.
  //   Sem acc.door_position (agregados antigos porta_ext/porta_int/
  //     porta_dupla, ou qualquer front cadastrado antes desta migration) —
  //     cai no comportamento de sempre (folgas_mm simétrico via params),
  //     retrocompatível, zero mudança.
  var PORTA_EXTERNA_LARGURA_FOLGA_MM = 17;
  var PORTA_EXTERNA_ALTURA_BAIXO_MM = 17.5;
  var PORTA_EXTERNA_ALTURA_CIMA_MM = 15.5;
  var PORTA_INTERNA_LARGURA_FOLGA_MM = 4;
  var PORTA_INTERNA_ALTURA_FOLGA_MM = 3;

  // Frente de gaveta AGREGADA (2026-08-20, pedido do Matt: "preciso agora
  // colocar a frente de gaveta. ela nao e um item separado do construtor,
  // ela pode ate ficar oculta no construtor. ela vai agregada com a propria
  // gaveta. cubrindo o mesmo espaco da porta e ela tem abertura igual da
  // gaveta. modelo front tambem"). Reaproveita o agregado
  // `frente_gaveta_externa` já existente (migration 132 — component_id =
  // Flatbord 4L, color_role_id = Porta/Frente, role='front') só que NUNCA
  // como escolha manual do cliente: emitContent (ver abaixo) sintetiza uma
  // instância dele sozinho, pro MESMO vão, sempre que o acessório inserido
  // é uma gaveta (acc.group_name==='Gavetas' — gaveta/gaveta_afast/
  // gaveteiro, migration 087). Igual ao filler de lateral compartilhada
  // (LATERAL_COMPARTILHADA_FILLER_ACCKEY), a UI (portal-07-construtor.js
  // fillProjectBuilderLibGrid) filtra este slug da biblioteca — o cliente
  // nunca arrasta "Frente de Gaveta" pro vão, ela só aparece grudada na
  // gaveta. "modelo front também": kind:'front' + accKey de um agregado
  // role='front' de verdade, pra essa frente poder ganhar um MODELO de
  // porta/frente (Flat/Shaker..., migration 103, ainda pendente) no dia
  // que essa rodada chegar, do mesmo jeito que uma porta comum ganharia.
  var FRENTE_GAVETA_ACCKEY = 'frente_gaveta_externa';
  // Folga entre 2 frentes de gaveta empilhadas (gaveteiro, quantidade>1) —
  // mesmos 3mm que já separam os CAIXOTES entre si (var `gap` dentro do
  // loop) — reveal pequeno, igual um gaveteiro de verdade.
  var GAP_ENTRE_FRENTES_GAVETA_MM = 3;
  // BUG achado 2026-08-20 (Matt, "a gaveta entra sem a frente", 2ª causa —
  // a 1ª foi o group_name 'Drawers' x 'Gavetas' logo acima em emitContent):
  // `catalogo`/`cat` em TODO O RESTO deste arquivo é indexado por accKey =
  // accessory_types.id (UUID) — é como node.content.acc/f.acc/node.splitAcc
  // sempre chegam (a UI grava o id da linha escolhida, nunca o slug). Só
  // este ponto (frente de gaveta sintetizada) não tem um id conhecido de
  // antemão pra gravar num node — o slug 'frente_gaveta_externa' é fixo no
  // CÓDIGO, não escolhido pelo cliente — então `cat[FRENTE_GAVETA_ACCKEY]`
  // fazia um lookup por CHAVE=slug num objeto indexado por CHAVE=id: nunca
  // batia (cat['frente_gaveta_externa'] sempre undefined, mesmo com a linha
  // migration 132 cadastrada e com id de verdade), `frenteAcc` saía sempre
  // null e NENHUMA gaveta jamais ganhava frente, catálogo passado ou não.
  // Fix: busca por `.slug` (campo já selecionado em projectBuilderAccessoryEntry
  // e no espelho do ERP, catalogoDoBanco) em vez de indexação direta.
  function findAccBySlug(cat, slug) {
    for (var id in cat) {
      if (Object.prototype.hasOwnProperty.call(cat, id) && cat[id] && cat[id].slug === slug) {
        return cat[id];
      }
    }
    return null;
  }

  // Lateral compartilhada (2026-08-20, regra revista com o Matt depois de
  // testar migration 132 ao vivo no navegador dele): duas portas EXTERNAS
  // vizinhas, cada uma sobrepondo pra dentro do vão do lado (17mm na
  // divisória X, 17.5/15.5mm na prateleira Y), SE TOCAM/se entrelaçam numa
  // divisória/prateleira mais fina que a soma das duas sobreposições —
  // colisão física. A resolução NÃO é mais simétrica (as duas recuando):
  //
  //   Divisória vertical (X) — a porta da DIREITA sempre recua
  //   LATERAL_COMPARTILHADA_REDUCAO_MM (19.5mm) e ganha 1 peça de "vista"
  //   nova (altura CHEIA do vão × LATERAL_COMPARTILHADA_FILLER_MM de
  //   profundidade, largura = a redução) — "como se fosse outra lateral"
  //   (Matt), cobrindo o vão que a porta abriu mão. A porta da ESQUERDA
  //   fica normal, cobrindo a divisória como se fosse a lateral externa do
  //   módulo. Só 1 vista por par (antes eram 2, uma pra cada lado).
  //
  //   Prateleira (Y, empilhado) — REVISTO em 2026-08-20, mesmo dia, depois
  //   de testar a 1ª versão (só a de baixo recuava) ao vivo: "a regra da
  //   porta de baixo diminuir nao ficou boa por que a porta de baixo perde
  //   a base da divisoria como batente" (Matt) — jogar TODA a redução numa
  //   porta só podia fazer ela recuar até nem tocar mais a prateleira,
  //   perdendo a referência/apoio (o "batente") que a base da prateleira dá
  //   pra porta encostar. Regra nova: "entao a regra (so pra casos
  //   verticais) e deixar o vao de 4mm bem no meio da divisoria. dividir o
  //   espaco entre as duas portas" — a redução necessária pra sobrar
  //   GAP_ENTRE_PORTAS_EMPILHADAS_MM (4mm) é dividida IGUALMENTE entre as 2
  //   portas do par: a de cima recua a descida (sua sobreposição por baixo)
  //   pela metade da redução, a de baixo recua a subida (sua sobreposição
  //   por cima) pela outra metade — cada uma mantém pelo menos metade do
  //   contato normal com a prateleira, e o vão de 4mm sobra perto do meio
  //   da espessura dela, não encostado numa porta só. Sem vista aqui (só a
  //   divisória X ganha vista — a prateleira não fica com face grande
  //   exposta que precise ser coberta). Só vale pro eixo Y (pedido do Matt:
  //   "so pra casos verticais") — a divisória X continua com a regra
  //   assimétrica de cima (só a da direita recua, ganha vista). O tanto que
  //   cada porta recua depende da espessura REAL da prateleira entre os 2
  //   vãos (varia por acessório) — por isso é calculado a partir da
  //   posição de verdade dos vãos vizinhos (`_boxFull`), não de uma
  //   constante fixa (ver resolveLateralSharing). Generaliza sozinho pra
  //   pilha de 3+ portas: um vão do MEIO de uma pilha tem vizinho embaixo E
  //   em cima, e recebe as duas reduções independentes (uma por par).
  //
  // Confirmado ao vivo no navegador do Matt (Porta Giro Externa, X).
  var LATERAL_COMPARTILHADA_REDUCAO_MM = 19.5;
  var LATERAL_COMPARTILHADA_FILLER_MM = 76;
  var LATERAL_COMPARTILHADA_FILLER_ACCKEY = '_filler_lateral_porta';
  var GAP_ENTRE_PORTAS_EMPILHADAS_MM = 4;

  // Porta Giro — dobra automática 1x2 folhas por largura do vão (mm), 2026-
  // 08-20: "portas de ate 600mm colocar so uma porta, acima de 600 duas
  // portas... de 500 a 600 podera ter opcao de 2 OU 1 porta para o cliente
  // escolher". Só vale pra acc.door_mechanism === 'porta_giro' — basculante/
  // frente de gaveta não dobram por este mecanismo.
  var PORTA_GIRO_1_FOLHA_ATE_MM = 500;   // <=500: sempre 1 folha
  var PORTA_GIRO_2_FOLHAS_DE_MM = 600;   // >600: sempre 2 folhas, automático
  // 500 < largura <= 600: front.params.folhas_escolha ('1'|'2', gravado pelo
  // toggle do Construtor) decide; sem escolha ainda, default 1 folha.
  function folhasEfetivas(acc, boxW, p) {
    if (!acc || acc.door_mechanism !== 'porta_giro') return (acc && acc.folhas === 2) ? 2 : 1;
    if (boxW > PORTA_GIRO_2_FOLHAS_DE_MM) return 2;
    if (boxW <= PORTA_GIRO_1_FOLHA_ATE_MM) return 1;
    return (p.folhas_escolha === '2' || p.folhas_escolha === 2) ? 2 : 1;
  }

  // Mecanismo -> opening_type real da peça. O opening_type do CATÁLOGO
  // (accessory_types.opening_type) é só documentação/padrão — pra role=
  // 'front' o valor que sai na peça sempre vem recalculado aqui (era assim
  // antes desta mudança também, só que sempre hinge_left/right pra
  // qualquer front). Só porta_giro tem dobradiça de embutir de verdade;
  // frente de gaveta não abre sozinha ('none' — quem abre é a gaveta atrás
  // dela). Agregado sem door_mechanism (antigos porta_ext/porta_int/
  // porta_dupla) mantém o comportamento de sempre: sempre dobradiça.
  //
  // 2026-08-20 (pedido do Matt, com foto de referência): basculante/
  // basculante inverso GANHAM eixo de abertura — só que HORIZONTAL (na
  // LARGURA da porta, não no comprimento), diferente da dobradiça de
  // embutir de porta_giro (vertical, na altura). 'lado' (esquerda/direita)
  // não faz sentido pra estes 2 — ignorado de propósito.
  // Convenção confirmada com o Matt (a foto mostra a porta ABRINDO PRA
  // BAIXO): 'basculante' = dobradiça em CIMA, a porta desce/abre pra baixo
  // e pra fora (opening_type 'hinge_top'); 'basculante_inverso' = o
  // espelho, dobradiça EMBAIXO, a porta sobe/abre pra cima e pra fora
  // ('hinge_bottom'). viewer3d.js (resolveHingeSide/positionWithOpening)
  // gira em torno do eixo X pra estes 2 valores (Y pra hinge_left/right).
  // drilling.js/pricing.js seguem SÓ olhando hinge_side==='left'/'right'
  // pra dobradiça de embutir (copo 35mm) — basculante não usa esse
  // hardware, então propositalmente não fura/cobra dobradiça de embutir
  // (ver placeFlapHardware em viewer3d.js pro pistão a gás, que é a
  // ferragem de verdade destes 2 mecanismos; custo do pistão ainda não tem
  // catálogo — PENDENTE, ver docs/modelos-de-porta-frente-spec.md).
  function openingTypeParaMecanismo(acc, lado) {
    if (acc && acc.door_mechanism === 'basculante') return 'hinge_top';
    if (acc && acc.door_mechanism === 'basculante_inverso') return 'hinge_bottom';
    if (acc && acc.door_mechanism && acc.door_mechanism !== 'porta_giro') return 'none';
    return lado === 'right' ? 'hinge_right' : 'hinge_left';
  }

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
      // Frente agregada (ver FRENTE_GAVETA_ACCKEY acima) — só pro grupo
      // "Gavetas" do catálogo (gaveta/gaveta_afast/gaveteiro); cesto
      // aramado/cabide/ripado passam por este mesmo bloco de caixote mas
      // não têm frente (são vistos "abertos" de propósito).
      //
      // RETROCOMPATIBILIDADE: projeto salvo ANTES desta mudança pode já ter
      // uma frente_gaveta_externa/interna colocada À MÃO (node.fronts) no
      // MESMO vão da gaveta — o único jeito de ter frente antes de hoje.
      // Sem esta checagem, a frente sintetizada aqui SOMARIA com a manual
      // já salva (2 painéis sobrepostos, preço em dobro). A biblioteca não
      // oferece mais esses 2 slugs pra escolher (fillProjectBuilderLibGrid),
      // então isto só protege quem já tinha salvo — não é um caminho novo.
      var jaTemFrenteGavetaManual = (node.fronts || []).some(function (f) {
        return f.acc === 'frente_gaveta_externa' || f.acc === 'frente_gaveta_interna';
      });
      // Grupo do catálogo (2026-08-20, bug do Matt: "a gaveta entra sem a
      // frente"): o comentário logo acima já previa "gaveta, gaveteiro,
      // cesto, Drawer agregado" passando por este bloco de caixote — mas só
      // gaveta/gaveteiro deviam ganhar frente (cesto/cabide/ripado ficam
      // "abertos" de propósito). O cadastro real deste banco usa o grupo
      // 'Drawers' (inglês) pro agregado child_module_id "Drawer", não
      // 'Gavetas' — o check original só olhava 'Gavetas' e nunca batia com
      // 'Drawers', então TODA gaveta cadastrada assim entrava sem frente
      // nenhuma. 'Gavetas' continua aceito pra quem cadastrar gaveta/
      // gaveta_afast/gaveteiro simples nesse grupo em português.
      var grupoGanhaFrente = acc.group_name === 'Gavetas' || acc.group_name === 'Drawers';
      var frenteAcc = (grupoGanhaFrente && !jaTemFrenteGavetaManual) ? findAccBySlug(cat, FRENTE_GAVETA_ACCKEY) : null;
      var prof = Math.max(120, box.d - recuoCaixote - 2);
      for (var j = 0; j < qtd; j++) {
        var y = box.y + j * (hCada + gap);
        push(node, {
          kind: 'content', accKey: key, label: acc.name + (qtd > 1 ? ' ' + (j + 1) : ''),
          x: box.x + 12, y: y + 4, z: box.z + recuoCaixote,
          w: box.w - 24, h: Math.max(20, hCada - folgaAltura), d: prof,
          opening_type: 'slide_out'
        });
      }
      if (frenteAcc) {
        // NÃO emite a frente aqui mais (2026-08-21, Matt: "frente de gaveta
        // quando tem divisoria horizontal ou vertical deve reduzir pra dar
        // espaco entre elas... estao pegando uma na outra"). emitContent
        // roda DURANTE resolve(), vão por vão, em ordem — quando o vão A é
        // resolvido, o vão IRMÃO B (do outro lado da mesma divisória/
        // prateleira) pode ainda nem ter sido visitado, então não dá pra
        // saber aqui se ele TAMBÉM vai ganhar frente e, se sim, encolher os
        // dois pra não se sobrepor na divisória — exatamente o mesmo motivo
        // pelo qual a porta comum (migration 132) só emite sua frente numa
        // 2ª passada, depois que a árvore INTEIRA termina (ver comentário
        // grande logo acima de `pendingFronts`/`resolveLateralSharing`).
        // Fix: só GUARDA a receita da frente da gaveta no nó (mesmas contas
        // de sempre: folga PORTA_EXTERNA_* nos 2 lados, folga pequena entre
        // gavetas empilhadas do MESMO caixote) — quem emite de verdade é
        // `resolveGavetaLateralSharing`/`emitGavetaFrontResolvido`, na
        // mesma 2ª passada da porta, já sabendo se o vão irmão (porta OU
        // outra gaveta) também tem frente — ver `nodeGeraFrenteExterna`.
        node._gavetaFrontPending = {
          frenteAcc: frenteAcc, label: acc.name, qtd: qtd, hCada: hCada, gap: gap,
          boxY: box.y, boxZ: box.z, boxD: box.d, esp: esp,
          slideDistanceMm: Math.min(prof * 0.7, 400)
        };
      }
    }

    // Frentes por ÚLTIMO: uma porta pode cobrir só uma faixa de filhos, e pra
    // saber onde ela começa e termina é preciso que as caixas dos filhos já
    // estejam calculadas. Desde 2026-08-20 (migration 132) a EMISSÃO em si
    // (emitFrontsResolvidos) só roda DEPOIS que a árvore INTEIRA terminou de
    // resolver (resolveLateralSharing, chamada depois do resolve(root,...)
    // lá embaixo) — só assim dá pra saber se o vão IRMÃO também tem porta
    // externa na mesma divisória (lateral compartilhada, ver constantes
    // LATERAL_COMPARTILHADA_* acima). Por isso resolve() só EMPILHA aqui.
    var pendingFronts = []; // {node, box, parent, siblingIndex}
    function queueFronts(node, box, parent, siblingIndex) {
      if ((node.fronts || []).length) {
        pendingFronts.push({ node: node, box: box, parent: parent || null, siblingIndex: siblingIndex });
      }
    }

    // Fila IRMÃ de `pendingFronts`, só pra frente de gaveta agregada (ver
    // comentário grande em `emitContent`/`node._gavetaFrontPending` acima) —
    // mesmo motivo, mesma 2ª passada (`resolveGavetaLateralSharing`, chamada
    // logo depois de `resolveLateralSharing`).
    var pendingGavetaFronts = []; // {node, box, parent, siblingIndex}
    function queueGavetaFront(node, box, parent, siblingIndex) {
      if (node._gavetaFrontPending) {
        pendingGavetaFronts.push({ node: node, box: box, parent: parent || null, siblingIndex: siblingIndex });
      }
    }

    // sharing — preenchido por resolveLateralSharing quando um vão IRMÃO
    // também tem front próprio 'externa' (colisão física de sobreposição):
    // { recuaEsquerda: true } no eixo X (divisória vertical — só a porta da
    // direita recua, ganha vista); { empilhada: { vizinhoAcimaBoxY?,
    // vizinhoAbaixoBoxYH? } } no eixo Y (prateleira — a redução é dividida
    // entre as 2 portas do par, ver constantes LATERAL_COMPARTILHADA_*).
    function emitFrontsResolvidos(node, box, sharing) {
      (node.fronts || []).forEach(function (f, fi) {
        var acc = cat[f.acc];
        if (!acc) return;
        var p = Object.assign({}, acc.params, f.params || {});

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

        // ---- SEM door_position (agregados de antes da migration 132:
        // porta_ext/porta_int/porta_dupla, ou qualquer front cadastrado
        // antes) — POSIÇÃO/TAMANHO continuam byte a byte retrocompatíveis
        // (x/w/h/z abaixo não mudaram). O opening_type de cada folha, porém,
        // foi corrigido em 2026-08-20 (Matt: "as portas abriram mas olha
        // lá como elas estão abrindo e ajusta") — não é uma mudança de
        // comportamento visual PRÉ-EXISTENTE: hinge_side só passou a abrir
        // porta de verdade no 3D HOJE (bug #2, toPieceRows nunca propagava
        // hinge_side pra peça is_module:false), então nenhum projeto nunca
        // viu essa dobradiça abrir antes — não tem "comportamento antigo"
        // pra preservar aqui, só um bug pra corrigir. O array abaixo tinha
        // ['right','left'] com i=0 (folha da ESQUERDA, x menor) recebendo
        // lado='right' — dobradiça da folha esquerda saía encostada na
        // divisória CENTRAL (lado direito DELA) em vez da lateral externa
        // esquerda do vão, e vice-versa pra folha da direita: as duas folhas
        // giravam a dobradiça pro centro e se CRUZAVAM ao abrir em vez de
        // abrir uma pra cada lado. Fix: i=0 (esquerda) = hinge_left, i=1
        // (direita) = hinge_right — dobradiça na lateral EXTERNA de cada
        // folha, abrindo pra fora, uma de cada lado (confirmado no
        // navegador real via Porta Giro Externa 2 folhas, mesmo código do
        // ramo novo abaixo).
        if (!acc.door_position) {
          var folga = num(p.folgas_mm) || 0;
          if (acc.folhas === 2) {
            var wCadaOld = (a.w - folga * 3) / 2;
            ['left', 'right'].forEach(function (lado, i) {
              push(node, {
                kind: 'front', accKey: f.acc, frontIndex: fi, embutida: !p.sobrepoe,
                label: acc.name + ' ' + (i + 1),
                x: a.x + folga + i * (wCadaOld + folga), y: a.y + folga, z: z,
                w: wCadaOld, h: a.h - folga * 2, d: esp,
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
          return;
        }

        // ---- MODELO de porta (migration 132): door_position 'externa'/
        // 'interna' + lateral compartilhada + porta giro com folhas
        // automáticas. ----
        // recuaEsquerda (X) — só é true pra porta da DIREITA de um par que
        // se toca (ver comentário nas constantes LATERAL_COMPARTILHADA_*).
        var recuaEsquerda = !!(sharing && sharing.recuaEsquerda);
        var efetiva = a;
        if (recuaEsquerda) {
          efetiva = Object.assign({}, a);
          efetiva.x += LATERAL_COMPARTILHADA_REDUCAO_MM;
          efetiva.w -= LATERAL_COMPARTILHADA_REDUCAO_MM;
          push(node, {
            kind: 'front', accKey: LATERAL_COMPARTILHADA_FILLER_ACCKEY, frontIndex: fi,
            label: 'Vista de preenchimento',
            x: a.x, y: a.y, z: a.z + a.d - LATERAL_COMPARTILHADA_FILLER_MM,
            w: LATERAL_COMPARTILHADA_REDUCAO_MM, h: a.h, d: LATERAL_COMPARTILHADA_FILLER_MM,
            opening_type: 'none'
          });
        }

        var geo;
        if (acc.door_position === 'externa') {
          // empilhada (Y) — sharing.empilhada.vizinhoAcimaBoxY existe quando
          // o vizinho de CIMA também tem porta externa (reduz alturaCima,
          // a sobreposição por cima); .vizinhoAbaixoBoxYH existe quando o
          // vizinho de BAIXO também tem (reduz alturaBaixo). Um vão do meio
          // de uma pilha de 3+ portas tem os dois ao mesmo tempo — cada
          // redução é calculada em cima do PAR correspondente, independente
          // uma da outra. A redução de cada par é dividida ENTRE AS DUAS
          // portas do par (2026-08-20, Matt: "a porta de baixo perde a base
          // da divisoria como batente"/"dividir o espaco entre as duas
          // portas" — ver comentário nas constantes LATERAL_COMPARTILHADA_*
          // acima pro histórico da 1ª versão, assimétrica, que foi trocada
          // por esta). Posições vêm da posição REAL dos vãos vizinhos
          // (`_boxFull`), não de uma constante fixa, porque a espessura da
          // prateleira entre os 2 vãos pode variar por acessório.
          var alturaCima = PORTA_EXTERNA_ALTURA_CIMA_MM;
          var alturaBaixo = PORTA_EXTERNA_ALTURA_BAIXO_MM;
          var emp = sharing && sharing.empilhada;
          if (emp && emp.vizinhoAcimaBoxY != null) {
            // Espessura real da prateleira entre este vão e o de cima.
            var thCima = emp.vizinhoAcimaBoxY - (efetiva.y + efetiva.h);
            var reducaoCima = (PORTA_EXTERNA_ALTURA_CIMA_MM + PORTA_EXTERNA_ALTURA_BAIXO_MM)
              - (thCima - GAP_ENTRE_PORTAS_EMPILHADAS_MM);
            // Metade da redução fica com esta porta (a de baixo do par); a
            // outra metade é aplicada do lado da porta de cima (mesma conta,
            // rodando quando for a vez DELA resolver, com vizinhoAbaixoBoxYH
            // apontando pra este vão). Só ENCOLHE (nunca aumenta) — Math.min
            // trava no valor normal; sem chão em 0 de propósito: se a
            // prateleira for fina o bastante mesmo dividido ao meio, a porta
            // pode precisar recuar até nem alcançar o topo do próprio vão, e
            // é isso mesmo que garante os 4mm — travar em 0 quebraria a
            // garantia do gap.
            alturaCima = Math.min(PORTA_EXTERNA_ALTURA_CIMA_MM, PORTA_EXTERNA_ALTURA_CIMA_MM - reducaoCima / 2);
          }
          if (emp && emp.vizinhoAbaixoBoxYH != null) {
            // Espessura real da prateleira entre este vão e o de baixo.
            var thBaixo = efetiva.y - emp.vizinhoAbaixoBoxYH;
            var reducaoBaixo = (PORTA_EXTERNA_ALTURA_CIMA_MM + PORTA_EXTERNA_ALTURA_BAIXO_MM)
              - (thBaixo - GAP_ENTRE_PORTAS_EMPILHADAS_MM);
            alturaBaixo = Math.min(PORTA_EXTERNA_ALTURA_BAIXO_MM, PORTA_EXTERNA_ALTURA_BAIXO_MM - reducaoBaixo / 2);
          }
          geo = {
            x: efetiva.x - PORTA_EXTERNA_LARGURA_FOLGA_MM,
            w: efetiva.w + PORTA_EXTERNA_LARGURA_FOLGA_MM * 2,
            y: efetiva.y - alturaBaixo,
            h: efetiva.h + alturaBaixo + alturaCima
          };
        } else { // 'interna'
          geo = {
            x: efetiva.x + PORTA_INTERNA_LARGURA_FOLGA_MM,
            w: efetiva.w - PORTA_INTERNA_LARGURA_FOLGA_MM * 2,
            y: efetiva.y + PORTA_INTERNA_ALTURA_FOLGA_MM,
            h: efetiva.h - PORTA_INTERNA_ALTURA_FOLGA_MM * 2
          };
        }

        // Largura de REFERÊNCIA pra decidir 1×2 folhas é a do VÃO (após a
        // redução de lateral compartilhada, mas ANTES da folga externa/
        // interna) — "portas de até 600mm" é sobre o vão que a porta fecha,
        // não sobre o contorno já com sobreposição somada.
        var folhas = folhasEfetivas(acc, efetiva.w, p);
        if (folhas === 2) {
          // Folga ENTRE as 2 folhas (não é a folga externa/interna de cima,
          // que já foi aplicada no contorno geo inteiro) — cadastro
          // (params.folgas_mm) ou 3mm default.
          var folgaEntreFolhas = num(p.folgas_mm) || 3;
          var wCadaNovo = (geo.w - folgaEntreFolhas) / 2;
          // 2026-08-20 (Matt: "as portas abriram mas olha lá como elas
          // estão abrindo e ajusta") — mesmo bug do ramo antigo acima:
          // ['right','left'] fazia i=0 (folha esquerda, x menor) receber
          // lado='right', ou seja dobradiça na divisória central em vez da
          // lateral externa — as 2 folhas abriam se CRUZANDO no meio em vez
          // de abrir cada uma pro seu lado. Confirmado ao vivo no navegador
          // (Porta Giro Externa, vão >600mm, 2 folhas automáticas). Fix:
          // i=0 (esquerda) = 'left', i=1 (direita) = 'right'.
          ['left', 'right'].forEach(function (lado, i) {
            push(node, {
              kind: 'front', accKey: f.acc, frontIndex: fi, embutida: !p.sobrepoe,
              label: acc.name + ' ' + (i + 1),
              x: geo.x + i * (wCadaNovo + folgaEntreFolhas), y: geo.y, z: z,
              w: wCadaNovo, h: geo.h, d: esp,
              opening_type: openingTypeParaMecanismo(acc, lado)
            });
          });
          return;
        }
        push(node, {
          kind: 'front', accKey: f.acc, frontIndex: fi, embutida: !p.sobrepoe,
          label: acc.name,
          x: geo.x, y: geo.y, z: z,
          w: geo.w, h: geo.h, d: esp,
          opening_type: openingTypeParaMecanismo(acc, p.lado === 'right' ? 'right' : 'left')
        });
      });
    }

    // Um vão gera front "de verdade" (porta) OU front SINTETIZADA (frente de
    // gaveta agregada, ver `node._gavetaFrontPending` em `emitContent`) — as
    // duas colidem do MESMO jeito físico numa divisória/prateleira comum, e
    // por isso as duas precisam contar como "tenho porta externa" pro vão
    // IRMÃO decidir se recua (2026-08-21, Matt: "frente de gaveta quando tem
    // divisoria horizontal ou vertical deve reduzir pra dar espaco entre
    // elas... estao pegando uma na outra" — até aqui só porta-com-porta
    // considerava o vizinho; porta-com-gaveta e gaveta-com-gaveta nunca
    // recuavam, por isso se sobrepunham). `node._gavetaFrontPending` só
    // existe depois que `resolve()` visitou o nó (emitContent já rodou),
    // então esta função só pode ser chamada na 2ª passada, igual
    // `resolveLateralSharing`/`resolveGavetaLateralSharing` de baixo.
    function nodeGeraFrenteExterna(node) {
      if (!node) return false;
      if (node._gavetaFrontPending) return true;
      return (node.fronts || []).some(function (f) {
        var acc = cat[f.acc];
        return acc && acc.door_position === 'externa';
      });
    }

    // Olha os 2 vãos IRMÃOS de cada lado (mesma divisória X ou mesma
    // prateleira Y) e devolve o mesmo formato `sharing` que
    // `emitFrontsResolvidos`/`emitGavetaFrontResolvido` esperam — extraído
    // de dentro de `resolveLateralSharing` (que só olhava porta) pra
    // `resolveGavetaLateralSharing` (gaveta) poder reusar a MESMA regra
    // (ver constantes LATERAL_COMPARTILHADA_* pro histórico completo da
    // regra). Só o CALLER decide se `siblingIndex`/`parent` fazem sentido
    // pra este nó (vão-folha com front próprio 'externa' ou com gaveta).
    function calcSharing(parent, siblingIndex) {
      var sharing = null;
      var vizinhoTemExterna = function (i) {
        return nodeGeraFrenteExterna(parent.children[i]);
      };
      if (parent.splitAxis === 'x') {
        // "Sou a porta/gaveta da direita de algum par" = meu vizinho da
        // ESQUERDA (índice anterior) também tem front externo. Regra do
        // Matt: a da direita sempre recua, a da esquerda nunca.
        if (siblingIndex > 0 && vizinhoTemExterna(siblingIndex - 1)) {
          sharing = { recuaEsquerda: true };
        }
      } else if (parent.splitAxis === 'y') {
        // Empilhada: cada front pode ter um vizinho de CIMA (índice
        // seguinte — y cresce pra cima, ver cabeçalho do arquivo: "canto
        // chão-fundo-esquerda" é o zero) E/OU um vizinho de BAIXO (índice
        // anterior) com front externo próprio — um vão do MEIO de uma
        // pilha de 3+ tem os dois ao mesmo tempo. As DUAS do par dividem a
        // redução entre si (ver constantes LATERAL_COMPARTILHADA_* e
        // emitFrontsResolvidos/emitGavetaFrontResolvido). Aqui só detecta e
        // empacota as posições reais dos vizinhos (`_boxFull`, já setado
        // pra TODO nó antes desta passada); a conta da divisão em si mora
        // em quem EMITE.
        var empilhada = null;
        if (siblingIndex < parent.children.length - 1 && vizinhoTemExterna(siblingIndex + 1)) {
          var vizinhoAcima = parent.children[siblingIndex + 1];
          empilhada = empilhada || {};
          empilhada.vizinhoAcimaBoxY = vizinhoAcima._boxFull.y;
        }
        if (siblingIndex > 0 && vizinhoTemExterna(siblingIndex - 1)) {
          var vizinhoAbaixo = parent.children[siblingIndex - 1];
          empilhada = empilhada || {};
          empilhada.vizinhoAbaixoBoxYH = vizinhoAbaixo._boxFull.y + vizinhoAbaixo._boxFull.h;
        }
        if (empilhada) sharing = { empilhada: empilhada };
      }
      return sharing;
    }

    // Segunda passada, DEPOIS que resolve(root,...) terminou a árvore
    // inteira: só então dá pra olhar o vão IRMÃO (mesma divisória X ou
    // mesma prateleira Y) e saber se ele também tem porta 'externa' — decide
    // quem recua (ver comentário nas constantes LATERAL_COMPARTILHADA_*: só
    // 1 dos 2 vãos de cada par recua, nunca os 2). Só entra nessa conta
    // vão-FOLHA (sem split) cujo PAI divide em X OU em Y, e cujo próprio
    // front já é do sistema novo (door_position==='externa' — agregado de
    // antes da 132 nunca compara, e 'interna' não sobrepõe, não colide).
    function resolveLateralSharing() {
      pendingFronts.forEach(function (ctx) {
        var sharing = null;
        var node = ctx.node, parent = ctx.parent;
        var ehFolha = !(node.splitAxis && node.children.length > 1);
        if (ehFolha && parent && parent.children && parent.children.length > 1) {
          var meuAcc = null;
          (node.fronts || []).forEach(function (f) { if (!meuAcc) meuAcc = cat[f.acc]; });
          if (meuAcc && meuAcc.door_position === 'externa') {
            sharing = calcSharing(parent, ctx.siblingIndex);
          }
        }
        emitFrontsResolvidos(ctx.node, ctx.box, sharing);
      });
    }

    // Irmã de `resolveLateralSharing`, só que pra frente de gaveta agregada
    // (`node._gavetaFrontPending`, ver `emitContent`) — MESMA regra de
    // lateral compartilhada (`calcSharing`, generalizada acima pra também
    // enxergar gaveta como vizinho), só que quem desenha a peça é
    // `emitGavetaFrontResolvido` (precisa repetir o loop de gavetas
    // empilhadas dentro do MESMO caixote, que `emitFrontsResolvidos` não
    // tem). Frente de gaveta é SEMPRE 'externa' (sobrepõe) — não tem o
    // equivalente de door_position 'interna'/sem-modelo, então não precisa
    // do mesmo gate que `resolveLateralSharing` faz em cima de `meuAcc`.
    function resolveGavetaLateralSharing() {
      pendingGavetaFronts.forEach(function (ctx) {
        var parent = ctx.parent;
        var sharing = (parent && parent.children && parent.children.length > 1)
          ? calcSharing(parent, ctx.siblingIndex)
          : null;
        emitGavetaFrontResolvido(ctx.node, ctx.box, sharing);
      });
    }

    // Desenha a(s) frente(s) de UMA gaveta/gaveteiro a partir da receita
    // guardada em `node._gavetaFrontPending` (ver `emitContent`) + o
    // `sharing` calculado por `calcSharing` — mesmas 2 reduções que
    // `emitFrontsResolvidos` aplica pra porta 'externa' (recuo X com vista
    // de preenchimento; recuo Y dividido entre o par empilhado), só que
    // aplicadas nas PONTAS do empilhamento de gavetas do MESMO caixote (só a
    // 1ª instância usa `alturaBaixo`, só a ÚLTIMA usa `alturaCima` — as do
    // MEIO, se houver 3+, continuam com a folga pequena de sempre entre
    // gavetas do mesmo caixote, sem relação nenhuma com o vão vizinho).
    function emitGavetaFrontResolvido(node, box, sharing) {
      var rec = node._gavetaFrontPending;
      if (!rec) return;

      var efetivaX = box.x, efetivaW = box.w;
      if (sharing && sharing.recuaEsquerda) {
        efetivaX = box.x + LATERAL_COMPARTILHADA_REDUCAO_MM;
        efetivaW = box.w - LATERAL_COMPARTILHADA_REDUCAO_MM;
        push(node, {
          kind: 'front', accKey: LATERAL_COMPARTILHADA_FILLER_ACCKEY,
          label: 'Vista de preenchimento',
          x: box.x, y: box.y, z: box.z + box.d - LATERAL_COMPARTILHADA_FILLER_MM,
          w: LATERAL_COMPARTILHADA_REDUCAO_MM, h: box.h, d: LATERAL_COMPARTILHADA_FILLER_MM,
          opening_type: 'none'
        });
      }

      var alturaCima = PORTA_EXTERNA_ALTURA_CIMA_MM;
      var alturaBaixo = PORTA_EXTERNA_ALTURA_BAIXO_MM;
      var emp = sharing && sharing.empilhada;
      if (emp && emp.vizinhoAcimaBoxY != null) {
        var thCima = emp.vizinhoAcimaBoxY - (box.y + box.h);
        var reducaoCima = (PORTA_EXTERNA_ALTURA_CIMA_MM + PORTA_EXTERNA_ALTURA_BAIXO_MM)
          - (thCima - GAP_ENTRE_PORTAS_EMPILHADAS_MM);
        alturaCima = Math.min(PORTA_EXTERNA_ALTURA_CIMA_MM, PORTA_EXTERNA_ALTURA_CIMA_MM - reducaoCima / 2);
      }
      if (emp && emp.vizinhoAbaixoBoxYH != null) {
        var thBaixo = box.y - emp.vizinhoAbaixoBoxYH;
        var reducaoBaixo = (PORTA_EXTERNA_ALTURA_CIMA_MM + PORTA_EXTERNA_ALTURA_BAIXO_MM)
          - (thBaixo - GAP_ENTRE_PORTAS_EMPILHADAS_MM);
        alturaBaixo = Math.min(PORTA_EXTERNA_ALTURA_BAIXO_MM, PORTA_EXTERNA_ALTURA_BAIXO_MM - reducaoBaixo / 2);
      }

      for (var j = 0; j < rec.qtd; j++) {
        var y = rec.boxY + j * (rec.hCada + rec.gap);
        var frenteY0 = (j === 0)
          ? y - alturaBaixo
          : y + GAP_ENTRE_FRENTES_GAVETA_MM / 2;
        var frenteY1 = (j === rec.qtd - 1)
          ? y + rec.hCada + alturaCima
          : y + rec.hCada - GAP_ENTRE_FRENTES_GAVETA_MM / 2;
        push(node, {
          kind: 'front', accKey: rec.frenteAcc.id,
          label: 'Frente da ' + rec.label + (rec.qtd > 1 ? ' ' + (j + 1) : ''),
          x: efetivaX - PORTA_EXTERNA_LARGURA_FOLGA_MM,
          y: frenteY0, z: rec.boxZ + rec.boxD,
          w: efetivaW + PORTA_EXTERNA_LARGURA_FOLGA_MM * 2, h: frenteY1 - frenteY0, d: rec.esp,
          opening_type: 'slide_out',
          slide_distance_mm: rec.slideDistanceMm
        });
      }
    }

    function resolve(node, box, parent, siblingIndex) {
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
          resolve(kid, Object.assign({}, kb, { d: Math.max(60, kb.d - c) }), node, i);
          cur += sizes[i];
          if (i < node.children.length - 1) {
            emitDivider(node, acc, axis, cur, box, th, i, consDiv);
            cur += th;
          }
        });
        queueFronts(node, box, parent, siblingIndex);
        return;
      }

      var dentro = Object.assign({}, box, {
        d: Math.max(60, box.d - consumoFrente(node, null, cat, esp, folgaDob))
      });
      node._box = dentro;
      if (node.content) emitContent(node, dentro);
      else voids.push({ nodeId: node.id, box: dentro, locked: !!node.locked });
      queueFronts(node, box, parent, siblingIndex);
      queueGavetaFront(node, dentro, parent, siblingIndex);
    }

    resolve(root, zona, null, 0);
    resolveLateralSharing();
    resolveGavetaLateralSharing();
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
          // VEIO da frente/porta (2026-08-21, Matt: "as frentes estao com
          // veio horizontais, e sao verticais"). Porta e frente de gaveta
          // SEMPRE precisam de veio vertical, independente da proporção
          // W×H — é regra ESTÉTICA de fábrica ("porta e frente têm veio
          // 'vertical' cadastrado", premissa documentada em
          // viewer3d.js:resolveGrainRotate), não física, e não deveria
          // depender de proporção nenhuma. Sem esta linha, `row` (acima,
          // `Object.assign({}, comp, {...})`) herdava `comp.veio` cru do
          // componente vinculado ao acessório de porta/frente escolhido —
          // e a frente/porta SINTETIZADA pelo Construtor (`kind:'front'`,
          // ver emitFrontsResolvidos/emitGavetaFrontResolvido acima) usa
          // `position_role:'free'` (padrão de toda peça da árvore, ver
          // `push()`), que É um dos papéis que `PAPEIS_VEIO_PELO_FORMATO`
          // decide pelo FORMATO quando não há veio cadastrado/travado
          // ('livre'): deita no lado longo. Frente é sempre mais larga que
          // alta -> saía sempre 'horizontal', ao contrário do que a
          // fábrica exige. Trava aqui no código — não depende mais do
          // componente vinculado ter `veio` cadastrado certo no catálogo.
          veio: p.kind === 'front' ? 'vertical' : comp.veio,
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
          // BUG achado 2026-08-20 (Matt: "eu quero que ela abra no ambiente
          // 3d"): esta linha nasce de `Object.assign({}, comp, {...})` —
          // `comp` é a linha CRUA de `components` (Flatbord 4L etc.), que
          // sempre traz hinge_side='none' (default da coluna, migration
          // 013). Só sobrescrevíamos opening_type; hinge_side ficava
          // 'none' de propósito nenhum. Só que viewer3d.resolveHingeSide
          // só lê opening_type pra peça-módulo (is_module=true) — pra
          // peça-componente comum (is_module=false, é O CASO de toda porta
          // do Construtor) ele lê hinge_side, não opening_type. Mesma
          // coisa em drilling.js:collectHingeHoles e
          // pricing.js (custo de dobradiça) — os DOIS só olham
          // part.hinge_side, nunca opening_type. Resultado: toda porta
          // gerada pelo Construtor (não só as de hoje — porta_ext/
          // porta_dupla também, desde sempre) nunca abria no 3D, nunca
          // furava copo de dobradiça e nunca cobrava dobradiça no preço —
          // js/portal-07-construtor.js:2228 já tinha até uma trava
          // pronta pra "sem modelo de dobradiça no slot, zera hinge_side",
          // esperando um campo que nunca chegava preenchido. Corrigido
          // aqui, no ÚNICO lugar que monta a linha.
          // 2026-08-20: basculante/basculante inverso somam 'hinge_top'/
          // 'hinge_bottom' (eixo horizontal, ver openingTypeParaMecanismo
          // acima) — mesmo espírito do fix de hinge_left/right logo acima
          // (comentário grande), só que pros 2 mecanismos novos.
          hinge_side: p.opening_type === 'hinge_left' ? 'left'
            : p.opening_type === 'hinge_right' ? 'right'
            : p.opening_type === 'hinge_top' ? 'top'
            : p.opening_type === 'hinge_bottom' ? 'bottom' : 'none',
          // slide_distance_mm setado (só na frente de gaveta sintetizada por
          // emitContent, ver comentário dela abaixo) é o sinal de "isto é um
          // PAINEL decorativo, não a gaveta de verdade" — NÃO conta corrediça
          // própria (slides_per_unit teria dobrado o custo/furação de
          // corrediça: uma vez no caixote, de novo na frente que só cobre a
          // mesma gaveta por fora). pricing.js (slide_cost) e drilling.js
          // (collectSlideHoles) confiam neste campo pra não tratar a frente
          // como se fosse ela mesma uma gaveta com corrediça própria.
          slides_per_unit: (p.opening_type === 'slide_out' && p.slide_distance_mm == null) ? 2 : 0,
          // Frente de gaveta agregada (2026-08-20) — a frente precisa abrir
          // JUNTO com o caixote da gaveta que ela cobre, mas a distância de
          // abertura genérica de viewer3d.js (Math.min(d*0.7, 0.4)) usa a
          // PRÓPRIA profundidade da peça — certo pro caixote (~500mm de
          // gaveta), errado pra frente (só ~19.5mm de espessura, quase não
          // andaria). emitContent grava aqui a distância JÁ CALCULADA a
          // partir da profundidade do caixote irmão (mesmo vão), em mm —
          // null pra qualquer peça que não seja essa frente sintetizada
          // (cai no cálculo genérico de sempre).
          slide_distance_mm: p.slide_distance_mm != null ? num(p.slide_distance_mm) : null,
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
    cabeNoVao: cabeNoVao,
    // Exposta pra UI (js/portal-07-construtor.js) decidir se mostra o
    // toggle 1×2 folhas/lado sem duplicar a regra de largura da porta giro
    // (migration 132) — mesma função que o resolvedor usa internamente.
    folhasEfetivas: folhasEfetivas
  };
})(typeof window !== 'undefined' ? window : this);
