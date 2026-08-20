// Motor de cálculo de preço — LEGNO PORTAL WEB
//
// Regra: o preço do módulo PAI é a soma do cálculo de cada peça, conforme as
// medidas (W, H, D) e a cor escolhidas pelo cliente para o pai. Cada peça tem
// dimensões próprias (por fórmula), área de chapa (m2), metro linear de fita,
// e mão de obra (custo fixo por unidade).
//
// MÓDULO-COMO-COMPONENTE (migration 023): uma "peça" dentro da lista de
// pieces de um módulo pode ser OU um componente de catálogo normal (peça-
// componente) OU outro módulo inteiro usado como sub-montagem (peça-módulo,
// piece.is_module === true, com piece.child_pieces = as peças DESSE módulo
// filho, na mesma forma recursiva). calculateAssembly() resolve isso agora
// numa função SÓ, recursiva, em qualquer profundidade — antes disso existiam
// DUAS funções especiais e paralelas (calculateSubAssembly, chamada só pra
// "modelo de porta"/"modelo de gaveta" via uses_door_style/uses_drawer_type),
// que cobriam só esses dois casos fixos. Essa migration generaliza: uma porta
// Shaker, uma caixa de gaveta, ou qualquer outra sub-montagem agora é só um
// módulo comum (normalmente marcado invisível pro cliente) usado como peça —
// sem código especial nenhum aqui pra cada caso novo.
//
// A responsabilidade de MONTAR essa estrutura de pieces (buscar
// module_components, e para cada linha com child_module_id, buscar
// recursivamente as peças do módulo filho + seus module_fixed_depths, e
// "achatar" tudo isso no formato que calculateAssembly espera) fica na camada
// de carregamento de dados (client.js/portal.js/admin.js) — pricing.js só
// recebe a árvore já montada e calcula em cima dela.

(function (global) {
  'use strict';

  // ---- Avaliador seguro de fórmulas (sem eval) ----
  // Suporta + - * / ( ) números e variáveis. Nunca executa código arbitrário.

  function tokenize(str) {
    const tokens = [];
    let i = 0;
    while (i < str.length) {
      const ch = str[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (/[0-9.]/.test(ch)) {
        let num = '';
        while (i < str.length && /[0-9.]/.test(str[i])) { num += str[i]; i++; }
        tokens.push({ type: 'num', value: parseFloat(num) });
        continue;
      }
      if (/[A-Za-z_]/.test(ch)) {
        let name = '';
        while (i < str.length && /[A-Za-z0-9_]/.test(str[i])) { name += str[i]; i++; }
        tokens.push({ type: 'var', value: name });
        continue;
      }
      if ('+-*/()'.includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }
      throw new Error(tr('pricing.formula_invalid_char', { ch }, 'Caractere inválido na fórmula: "' + ch + '"'));
    }
    return tokens;
  }

  function Parser(tokens, variables) {
    this.tokens = tokens;
    this.pos = 0;
    this.variables = variables || {};
  }
  Parser.prototype.peek = function () { return this.tokens[this.pos]; };
  // TRADUÇÃO COM REDE DE SEGURANÇA (2026-08-18)
  // Este arquivo roda em DOIS lugares: o portal (que carrega js/i18n.js) e o
  // ERP (que não carrega — ver o cabeçalho do i18n.js). Chamar I18n.t direto
  // aqui derrubaria o ERP com "I18n is not defined" na primeira fórmula
  // inválida. Sem I18n, cai no texto em português, que é o que o ERP sempre
  // mostrou.
  function tr(chave, vars, padrao) {
    if (typeof I18n !== 'undefined' && I18n && I18n.t) {
      const v = I18n.t(chave, vars);
      if (v !== chave) return v;
    }
    return padrao;
  }

  Parser.prototype.next = function () { return this.tokens[this.pos++]; };
  Parser.prototype.expectEnd = function () {
    if (this.pos < this.tokens.length) {
      throw new Error(tr('pricing.formula_unexpected_end', null, 'Fórmula inválida: caracteres inesperados no final.'));
    }
  };
  Parser.prototype.parseExpression = function () {
    let value = this.parseTerm();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value;
      const rhs = this.parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  };
  Parser.prototype.parseTerm = function () {
    let value = this.parseUnary();
    while (this.peek() && this.peek().type === 'op' && (this.peek().value === '*' || this.peek().value === '/')) {
      const op = this.next().value;
      const rhs = this.parseUnary();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  };
  Parser.prototype.parseUnary = function () {
    if (this.peek() && this.peek().type === 'op' && this.peek().value === '-') {
      this.next();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  };
  Parser.prototype.parsePrimary = function () {
    const tok = this.peek();
    if (!tok) throw new Error(tr('pricing.formula_abrupt_end', null, 'Fórmula inválida: fim inesperado.'));
    if (tok.type === 'num') { this.next(); return tok.value; }
    if (tok.type === 'var') {
      this.next();
      if (!(tok.value in this.variables)) {
        throw new Error(tr('pricing.formula_unknown_var', { name: tok.value }, 'Variável desconhecida na fórmula: "' + tok.value + '"'));
      }
      return this.variables[tok.value];
    }
    if (tok.type === 'op' && tok.value === '(') {
      this.next();
      const value = this.parseExpression();
      const close = this.next();
      if (!close || close.value !== ')') throw new Error(tr('pricing.formula_unclosed_paren', null, 'Fórmula inválida: parêntese não fechado.'));
      return value;
    }
    throw new Error(tr('pricing.formula_invalid', null, 'Fórmula inválida.'));
  };

  // ---- Variáveis GLOBAIS de fórmula ----
  // Valores do AMBIENTE do cliente (não da peça/módulo) disponíveis em
  // QUALQUER fórmula — hoje: RODAPE (alias RB) = altura do baseboard da casa
  // em mm (pedido do usuário: posicionar painel/peça a partir do topo do
  // rodapé, ex: Posição Y = "RODAPE"). O portal chama setFormulaGlobals com
  // o valor digitado pelo cliente (roomSettings); admin/client.js usam o
  // padrão 5 1/2" pra pré-visualizar. Merge: a variável local (W,H,D,w,h,d)
  // vence se tiver o mesmo nome.
  let formulaGlobals = { RODAPE: 5.5 * 25.4, RB: 5.5 * 25.4 };
  function setFormulaGlobals(vars) {
    formulaGlobals = Object.assign({}, formulaGlobals, vars || {});
  }

  function evalFormula(expression, variables) {
    if (expression === null || expression === undefined || String(expression).trim() === '') return 0;
    const tokens = tokenize(String(expression));
    const parser = new Parser(tokens, Object.assign({}, formulaGlobals, variables));
    const result = parser.parseExpression();
    parser.expectEnd();
    if (!isFinite(result)) throw new Error(tr('pricing.formula_invalid_result', null, 'Fórmula resultou em valor inválido (divisão por zero?).'));
    return result;
  }

  // ---- Cálculo de dimensões/quantidade por peça ----
  // dims = { W, H, D } dimensões do CONTAINER desta peça (módulo pai, ou
  // corpo do módulo pai já descontado o pé — ver resolveBodyDims; para uma
  // peça dentro de uma peça-módulo, é o W/H/D JÁ RESOLVIDO dessa peça-módulo,
  // não do módulo raiz — é isso que torna o cálculo recursivo).
  // quantityOverride, se informado, substitui piece.quantity (usado por
  // peças com quantidade configurável pelo cliente, ex: prateleiras).
  //
  // dimOverride (migration 036), se informado, substitui width_mm/height_mm/
  // depth_mm calculados pela fórmula — usado por peça-módulo aninhada com
  // "cliente pode configurar as medidas desta peça" ligado (ver
  // client_dimension_configurable em module_components/renderModuleNestedRow
  // no admin). Mesma regra de quantityOverride: quando informado, SEMPRE
  // vale (não é "só se preenchido tudo") — cada eixo (w/h/d) é substituído
  // individualmente, então um dimOverride parcial (ex: só width_mm) ainda
  // deixa os outros dois na fórmula. Aplicado ANTES do cálculo de área/fita
  // (ctx usa w/h/d minúsculo já resolvidos), pra área/fita nunca divergirem
  // do tamanho que o cliente efetivamente escolheu pra peça.
  // ==========================================================================
  // A PEÇA NO PLANO DA MÁQUINA (migration 088)
  // ==========================================================================
  // "Podemos usar a mesma base de peça e só rotacionar depois" (Matt).
  //
  // Pra fábrica, uma peça é sempre ESPESSURA × COMPRIMENTO × LARGURA. É nesse
  // plano que ela é cortada, furada (js/drilling.js machineDims) e fitada. No
  // ambiente ela aparece rotacionada — o comprimento pode ser a altura de uma
  // lateral, a largura de uma prateleira ou a profundidade de um fundo — mas
  // isso é assunto de quem DESENHA, não de quem cadastra.
  //
  // Esta função é a tradução, e mora aqui (e não no viewer3d) porque preço,
  // desenho e plano de corte precisam da MESMA resposta. Se cada um decidisse
  // por conta o que é "o comprimento", a fita cobrada e a fita desenhada
  // divergiriam — e ninguém descobriria até a peça chegar sem acabamento.
  //
  // Devolve também de que EIXO do módulo (w/h/d) cada medida veio, que é o
  // que permite ao 3D pintar a face certa:
  //   tKey  eixo da espessura   — as duas faces grandes, que levam a cor
  //   cKey  eixo do comprimento — atravessado pelos lados da LARGURA
  //   lKey  eixo da largura     — atravessado pelos lados do COMPRIMENTO
  //
  // A última linha é a que engana: os "2 comprimentos" são os lados que MEDEM
  // o comprimento, e pra ir de um ao outro você anda no eixo da largura. Numa
  // prateleira 800(w) × 18(h) × 500(d): comprimento 800 em w, largura 500 em
  // d, e os dois lados fitados são a frente e o fundo — as faces ±Z, que são
  // as perpendiculares a d. Daí lKey ser o eixo dos lados do comprimento.
  function pecaNaMaquina(w, h, d, positioning) {
    const dims = { w: w, h: h, d: d };
    let tKey;
    // Mesma escolha de eixo de splitThickness (viewer3d.js) e
    // splitThicknessAxes (drilling.js): positioning do tipo de componente
    // manda; sem ele, a menor das três é a espessura.
    if (positioning === 'horizontal') tKey = 'h';
    else if (positioning === 'vertical') tKey = 'w';
    else if (positioning === 'vertical_no_plano' || positioning === 'horizontal_no_plano') tKey = 'd';
    else {
      const arr = [w, h, d];
      tKey = ['w', 'h', 'd'][arr.indexOf(Math.min(w, h, d))];
    }
    const resto = ['w', 'h', 'd'].filter(function (k) { return k !== tKey; });
    // Comprimento é o maior dos dois que sobraram — a mesma convenção da
    // lista de corte (C = maior, L = média) e do .ban.
    const maior = dims[resto[0]] >= dims[resto[1]] ? resto[0] : resto[1];
    const menor = maior === resto[0] ? resto[1] : resto[0];
    return {
      espessura: dims[tKey], comprimento: dims[maior], largura: dims[menor],
      tKey: tKey, cKey: maior, lKey: menor
    };
  }

  // ==========================================================================
  // MÃO DE OBRA POR PROCESSO (migration 090)
  // ==========================================================================
  // "vamos agregar as labors por processo: um por cutting, um por 2C, outro
  // por 4L, outro por furação" (Matt, 2026-08-11).
  //
  // O ponto é que os quatro processos são DEDUTÍVEIS do que a peça já é —
  // ninguém escolhe mão de obra por componente:
  //   corte    origin != 'comprado'
  //   fita     edge_banding 2 ou 4     (migration 088)
  //   furação  fura != false           (migration 086)
  //
  // Furação por `fura` e não por "tem furo cadastrado" é o que faz as
  // LATERAIS entrarem: elas têm zero furo próprio e recebem tudo por
  // propagação (043/054). Era o pedido literal — "furação direto ou
  // contrafuro".
  //
  // Os preços entram por setProcessLabor, e não por parâmetro, porque são da
  // FÁBRICA e não da peça — mesma natureza do RODAPE em formulaGlobals.
  // Threading mais um argumento por dez chamadas posicionais de
  // calculateModulePrice seria dez chances de esquecer um.
  //
  // Nascem em zero. Peça em processo numa instalação que não configurou os
  // preços sai SEM mão de obra — visível no breakdown (labor_breakdown), que
  // é onde se confere, e melhor do que inventar um número numa tabela de
  // custo.
  let processLabor = {
    corte_peca: 0, corte_m2: 0,   // corte_m2: era corte_metro (perímetro) até 2026-08-15
    fita_passada: 0, fita_metro: 0,
    furacao_peca: 0, furacao_furo: 0,
    usinagem_peca: 0, usinagem_metro: 0
  };
  function setProcessLabor(v) {
    processLabor = {
      corte_peca: num(v && v.corte_peca),
      // Aceita corte_m2 (novo) e corte_metro (chamador antigo), pra a troca
      // não zerar o corte em nenhuma tela que ainda não foi atualizada.
      corte_m2: num((v && v.corte_m2) != null && v.corte_m2 !== undefined ? v.corte_m2 : (v && v.corte_metro)),
      fita_passada: num(v && v.fita_passada), fita_metro: num(v && v.fita_metro),
      furacao_peca: num(v && v.furacao_peca), furacao_furo: num(v && v.furacao_furo),
      usinagem_peca: num(v && v.usinagem_peca), usinagem_metro: num(v && v.usinagem_metro)
    };
  }
  function num(x) { const n = parseFloat(x); return isFinite(n) ? n : 0; }

  // Contagem REAL de furos por peça, publicada pelo chamador antes de pedir o
  // preço (ver Drilling.countHolesByPiece). Vazio = cai no furos_equivalentes
  // do cadastro, que era o único caminho até 2026-08-15.
  //
  // Fica em módulo, e não em parâmetro, pelo mesmo motivo de processLabor: são
  // ~8 pontos que chamam calculateModulePrice, e acrescentar argumento em
  // todos convidaria a esquecer um — e esquecer aqui significa peça cobrando
  // furação errada, em silêncio.
  let holeCounts = null;
  function setHoleCounts(map) { holeCounts = map || null; }

  // ======================================================================
  // ITENS COMPRADOS (migration 119) — bucket próprio, margem própria
  // ======================================================================
  // Matt, 2026-08-18: "quero que os itens comprados apareçam no orçamento
  // fábrica junto com os raw materials. e quero ter uma margem especifica
  // pra eles."
  //
  // Duas coisas mudam, e é bom separá-las porque só a segunda mexe no preço:
  //
  //  1. CLASSIFICAÇÃO. O comprado saía somado em `labor_cost` — porque o
  //     preço de compra dele era, literalmente, um labor_type. No relatório
  //     isso jogava ferragem na coluna de mão de obra, que é justamente a
  //     divisão que a fábrica usa pra decidir coisa diferente: matéria-prima
  //     se compra e se estoca, mão de obra é capacidade de máquina e de
  //     gente. Agora vai em `purchased_cost`. O NÚMERO É O MESMO — só troca
  //     de coluna.
  //
  //  2. MARGEM. O comprado passa a poder ter margem própria, vinda de um
  //     perfil de margin_profiles (o mesmo cadastro que família/categoria
  //     usam) apontado em pricing_settings.purchased_margin_profile_id, com
  //     override por item.
  //
  // purchasedMarkup = null é o estado logo depois da migration: o comprado
  // segue com a margem do MÓDULO, centavo por centavo como hoje. Nada muda
  // até alguém escolher o perfil na tela. Isso é de propósito — reclassificar
  // e reprecificar no mesmo deploy deixaria impossível saber qual dos dois
  // mexeu no número, num caminho de preço que já causou regressão em cascata.
  let purchasedMarkup = null;
  function setPurchasedMarkup(m) {
    const n = parseFloat(m);
    purchasedMarkup = (isFinite(n) && n > 0) ? n : null;
  }
  // Margem por ITEM (purchased_items.margin_profile_id -> multiplicador).
  // { [margin_profile_id]: multiplicador }
  let purchasedMarkupByProfile = {};
  function setPurchasedMarkupByProfile(map) { purchasedMarkupByProfile = map || {}; }

  // Ferragem consumida pelo módulo, publicada pelo chamador ANTES de pedir o
  // preço — mesma mecânica (e mesmo motivo) do setHoleCounts. Vem de
  // Hardware.consumoDoModulo, que conta a partir dos furos que o .ban
  // realmente gera. null = catálogo ainda não carregou; [] = carregou e não
  // há ferragem. Os dois são coisas diferentes e o relatório distingue.
  let moduleHardware = null;
  function setModuleHardware(list) { moduleHardware = list || null; }

  // Catálogo de itens comprados, { [purchased_items.id]: item }. Publicado
  // pelo chamador junto com o resto do catálogo.
  //
  // Por que um MAPA aqui em vez de embutir `purchased_items(*)` no select de
  // module_components: o embed é um join declarado no PostgREST e, num banco
  // onde a migration 119 ainda não rodou, ele não falha bonito — derruba a
  // consulta inteira e o módulo carrega SEM PEÇA NENHUMA. Já
  // `piece.purchased_item_id` vem de graça no `components(*)` que já existe,
  // e um id que não resolve neste mapa só cai no preço antigo.
  let purchasedItemsById = {};
  function setPurchasedItems(map) { purchasedItemsById = map || {}; }

  // Custo de mão de obra de UMA unidade da peça, aberto por processo. O
  // detalhe vai pro breakdown de propósito: é o que transforma "quanto custa
  // fitar" e "quantas peças passam na furadeira" em consulta, em vez de
  // estimativa — base do apontamento por máquina.
  // pieceDims = saída de calculatePiece (width_mm/height_mm/depth_mm e
  // edge_band_m já resolvidos). Precisa das medidas REAIS porque a parte
  // variável é toda em cima delas.
  function processLaborFor(piece, pieceDims) {
    const zero = { corte: 0, fita: 0, furacao: 0, usinagem: 0, total: 0 };
    // Peça COMPRADA não passa por processo nenhum: não é cortada, não é
    // fitada e não é furada — o drilling.js a pula pelo mesmo motivo
    // ("ferragem comprada não fura"). O custo dela é o preço de compra, que
    // continua vindo de labor_type_id. Sem esta saída um pé comprado pagava
    // furação; foi o que o teste pegou.
    if (piece.origin === 'comprado') return zero;

    const m = pecaNaMaquina(pieceDims.width_mm, pieceDims.height_mm, pieceDims.depth_mm, piece.positioning);

    // CORTE — por peça (montar, alinhar, tirar) + por M² da peça.
    //
    // MUDOU EM 2026-08-15 (pedido do Matt: "preciso um valor fixo por peça +
    // m² da peça"). Antes a parcela variável era o PERÍMETRO do plano da
    // máquina — o caminho da serra em volta da peça. Passou a ser a ÁREA.
    //
    // A diferença não é cosmética e muda o preço relativo entre peças: duas
    // peças de mesmo perímetro podem ter áreas bem diferentes (1000×100 e
    // 550×550 têm perímetro parecido, mas 0,1 m² contra 0,3 m²). Área é como
    // a chapa é consumida e faturada, e é o que o Matt usa na fábrica.
    //
    // area_m2 vem de calculatePiece, e já respeita `area_auto` (migration
    // 090): na chapa genérica ela é comprimento × largura do plano da
    // máquina, não `w*h` cru — que pegaria a espessura como face e daria
    // 0,04 m² numa peça de 1,12.
    const areaM2 = num(pieceDims.area_m2);
    const corte = processLabor.corte_peca + processLabor.corte_m2 * areaM2;

    // FITA — por passada + por metro. `edge_banding` já É a contagem de
    // passadas (0, 2 ou 4 bordas = 0, 2 ou 4 passadas na coladeira), então
    // não existe número novo pra cadastrar.
    // edge_banding nulo (componente ainda na fórmula antiga) = zero passadas:
    // sem a receita não dá pra saber quantas são, e chutar viraria custo
    // inventado. Esses componentes não estão em processo mesmo.
    const passadas = piece.edge_banding === 2 ? 2 : piece.edge_banding === 4 ? 4 : 0;
    const fita = passadas
      ? passadas * processLabor.fita_passada + num(pieceDims.edge_band_m) * processLabor.fita_metro
      : 0;

    // FURAÇÃO — por peça + por furo. furos_equivalentes conta os furos
    // próprios MAIS os que esta peça gera na vizinha por propagação (ver
    // migration 091): quem define a junta paga pelos dois lados, e aí o total
    // do módulo fecha exato sem precisar rodar a propagação aqui.
    // CONTAGEM REAL ganha do número digitado (2026-08-15). holeCounts vem de
    // Drilling.countHolesByPiece — os furos que a peça de fato recebe no .ban,
    // incluindo os PROPAGADOS. É o que faz a lateral, que não tem furação
    // própria, pagar pelos contra-furos que ela leva.
    //
    // Sem a contagem (chamador que não a forneceu), cai no
    // `furos_equivalentes` do cadastro — comportamento anterior, intacto.
    //
    // Os dois NUNCA se somam: seria cobrar o mesmo furo duas vezes, já que a
    // convenção antiga ("quem define a junta paga pelos dois lados") e a
    // contagem real descrevem o mesmo furo por ângulos diferentes.
    const chaveFuros = piece.id || piece.piece_id;
    const contados = (holeCounts && chaveFuros != null) ? holeCounts[chaveFuros] : undefined;
    const furos = contados !== undefined ? num(contados) : num(piece.furos_equivalentes);
    const furacao = piece.fura === false
      ? 0
      : processLabor.furacao_peca + furos * processLabor.furacao_furo;

    // USINAGEM (migration 092) — o entalhe do toe 4½, o canal da gola, o rasgo
    // do LED. Os metros vêm do USO (module_components.usinagem_m): a mesma
    // lateral é entalhada numa carcaça e lisa em outra.
    // Sem metros não há usinagem, e aí a parte fixa também não é cobrada —
    // peça sem entalhe não passa na fresadora.
    const usinagemM = num(piece.usinagem_m);
    const usinagem = usinagemM > 0
      ? processLabor.usinagem_peca + usinagemM * processLabor.usinagem_metro
      : 0;

    return {
      corte: corte, fita: fita, furacao: furacao, usinagem: usinagem,
      total: corte + fita + furacao + usinagem
    };
  }

  // Metragem linear de fita, em metros. edge_banding (0/2/4) vence quando
  // cadastrado; NULL cai na fórmula de sempre — ver o cabeçalho da migration
  // 088 pro motivo de NULL não ser 0.
  //
  // ctx é o MESMO escopo que a fórmula de área usa ({W,H,D} do container +
  // {w,h,d} da peça já resolvidos). Passar o ctx inteiro, em vez de só as
  // medidas da peça, é o que mantém o caminho antigo idêntico: existe fórmula
  // cadastrada em cima de W/H/D (a 071 corrigiu as erradas, mas não proibiu
  // as legítimas), e reconstruir um ctx reduzido aqui mudaria o resultado
  // delas sem ninguém pedir.
  function edgeBandMeters(piece, ctx) {
    const receita = piece ? piece.edge_banding : null;
    if (receita === 0) return 0;
    if (receita === 2 || receita === 4) {
      const m = pecaNaMaquina(ctx.w, ctx.h, ctx.d, piece.positioning);
      const mm = receita === 2
        ? 2 * m.comprimento
        : 2 * (m.comprimento + m.largura);
      return mm / 1000;
    }
    return evalFormula((piece && piece.edge_band_linear_m_formula) || '0', ctx);
  }

  function calculatePiece(piece, dims, quantityOverride, dimOverride) {
    const { W, H, D } = dims;
    let w = evalFormula(piece.width_formula, { W, H, D });
    let h = evalFormula(piece.height_formula, { W, H, D });
    let d = evalFormula(piece.depth_formula, { W, H, D });
    if (dimOverride) {
      if (dimOverride.width_mm !== undefined && dimOverride.width_mm !== null && isFinite(dimOverride.width_mm)) w = dimOverride.width_mm;
      if (dimOverride.height_mm !== undefined && dimOverride.height_mm !== null && isFinite(dimOverride.height_mm)) h = dimOverride.height_mm;
      if (dimOverride.depth_mm !== undefined && dimOverride.depth_mm !== null && isFinite(dimOverride.depth_mm)) d = dimOverride.depth_mm;
    }
    const ctx = { W, H, D, w, h, d };
    // Área: calculada quando a peça é genérica (migration 090). A fórmula
    // assume quais eixos são as faces — `w*h` numa peça 20×2000×560 devolve
    // 0,04 m² em vez de 1,12, porque pega a espessura como face. Numa peça
    // que roda conforme o uso não existe fórmula que acerte nas duas
    // orientações, e não dá pra escrever melhor: o avaliador não tem max/min.
    const areaM2 = piece.area_auto
      ? (function () {
        const m = pecaNaMaquina(w, h, d, piece.positioning);
        return m.comprimento * m.largura / 1000000;
      })()
      : evalFormula(piece.area_m2_formula || '0', ctx);
    // Fita: a receita da máquina (0/2/4, migration 088) ganha da fórmula
    // quando cadastrada. Ver edgeBandMeters — e repare que ela recebe as
    // medidas JÁ RESOLVIDAS, não as fórmulas: é o tamanho real da peça neste
    // módulo que decide qual lado é o comprimento.
    const edgeM = edgeBandMeters(piece, ctx);
    const quantity = quantityOverride !== undefined && quantityOverride !== null ? quantityOverride : piece.quantity;
    return { width_mm: w, height_mm: h, depth_mm: d, area_m2: areaM2, edge_band_m: edgeM, quantity };
  }

  // Se a lista de peças (do módulo pai OU de uma peça-módulo aninhada — a
  // regra é a mesma em qualquer nível) tem uma com position_role='leg' (pé
  // regulável), o CORPO (todas as peças, exceto o próprio pé) ocupa uma
  // altura menor que a H total do container — o pé preenche o vão de baixo.
  // Sem isso, uma fórmula de altura como "H" (comum em laterais/portas)
  // resolvia pra H TOTAL, maior que o espaço que sobra de verdade acima do
  // pé. Devolve dims sem alteração se não houver pé (comportamento de
  // sempre) — legH_mm resolvido com as dims ORIGINAIS (o pé normalmente usa
  // uma fórmula fixa, ex: "114", que não depende de H mesmo).
  function resolveBodyDims(pieces, dims) {
    const legPiece = (pieces || []).find(function (p) { return p.position_role === 'leg'; });
    if (!legPiece) return { bodyDims: dims, legH_mm: 0 };
    const legH_mm = calculatePiece(legPiece, dims).height_mm;
    return {
      bodyDims: { W: dims.W, H: dims.H - legH_mm, D: dims.D },
      legH_mm: legH_mm
    };
  }

  // Regra de negócio: quantas dobradiças uma PORTA precisa, pela altura da
  // PRÓPRIA PORTA (não do container). Fonte única usada tanto no cálculo de
  // custo quanto no desenho 3D (viewer3d.js), pra nunca divergir entre o que
  // é cobrado e o que é desenhado: 2 até 1m, 3 de 1 a 1.4m, 4 de 1.4 a 2m, 5
  // de 2 a 2.5m. Acima de 2.5m (fora da faixa combinada), mantém 5 como piso
  // em vez de deixar a porta sem dobradiça nenhuma.
  function hingeCountForDoorHeight(height_mm) {
    if (height_mm <= 1000) return 2;
    if (height_mm <= 1400) return 3;
    if (height_mm <= 2000) return 4;
    return 5;
  }

  // Folga fixa descontada da profundidade disponível antes de escolher qual
  // profundidade FIXA cabe no espaço (usado tanto por peça-módulo com
  // fixed_depths quanto, no futuro, por qualquer peça-componente que precise
  // da mesma regra) — espaço que o fundo do container + o curso da corrediça
  // precisam, senão a peça bateria atrás.
  const DRAWER_DEPTH_CLEARANCE_MM = 40;

  // Generaliza a antiga regra "gaveta não estica pra qualquer profundidade":
  // QUALQUER peça-módulo com module_fixed_depths cadastrado só existe num
  // punhado de profundidades FIXAS (ex: corrediças de 300/350/400/450mm).
  // Dado o espaço disponível (profundidade já resolvida pela fórmula desta
  // peça-módulo dentro do container pai), escolhe a MAIOR profundidade fixa
  // que caiba, descontando a folga de fundo/trilho. Se nenhuma couber
  // (container raso demais pra qualquer opção), cai pra menor disponível em
  // vez de travar o cálculo — melhor mostrar o preço "espremido" do que
  // quebrar a tela.
  function pickDrawerDepth(depths, availableDepthMm) {
    const validDepths = (depths || []).filter(function (d) { return d !== null && d !== undefined && isFinite(d); });
    if (validDepths.length === 0) return availableDepthMm;
    const sorted = validDepths.slice().sort(function (a, b) { return a - b; });
    const targetMax = availableDepthMm - DRAWER_DEPTH_CLEARANCE_MM;
    const fitting = sorted.filter(function (d) { return d <= targetMax; });
    return fitting.length > 0 ? fitting[fitting.length - 1] : sorted[0];
  }

  // Trava de EXISTÊNCIA pra profundidade fixa (2026-08-18, Matt: "profundidade
  // travada em algumas opções que sempre deve caber no módulo, se o módulo
  // ficar menor, a gaveta deve ser removida"). Mesma ideia de
  // isBelowMinLockedPreset, mas pro sistema de fixed_depths acima: se nem a
  // MENOR profundidade cadastrada cabe no espaço disponível (descontada a
  // MESMA folga de fundo/trilho que pickDrawerDepth usa pra escolher), a peça
  // não existe nessa configuração — ela deve SUMIR, não "espremer" pra um
  // tamanho que não corresponde a nenhuma gaveta real. Chamar ANTES de
  // pickDrawerDepth: o fallback "cai pra menor disponível" dele continua
  // existindo como rede de segurança pra quem não checar esta trava antes,
  // mas com ela em uso o caminho "nenhuma cabe" nunca chega lá.
  // Sem fixed_depths cadastrado, nunca bloqueia (devolve false) — mesmo
  // contrato de isBelowMinLockedPreset.
  function isBelowMinFixedDepth(depths, availableDepthMm) {
    const valid = (depths || []).filter(function (d) { return d !== null && d !== undefined && isFinite(d); });
    if (valid.length === 0) return false;
    const minDepth = Math.min.apply(null, valid);
    return (availableDepthMm - DRAWER_DEPTH_CLEARANCE_MM) < minDepth;
  }

  // Generaliza pra QUALQUER dimensão (não só profundidade de gaveta/
  // corrediça): dado um conjunto de valores PERMITIDOS (module_dimension_presets
  // de um módulo TRAVADO — migration 028 — na dimensão width/height/depth) e o
  // valor "bruto" que a fórmula da peça-módulo calculou a partir do container
  // pai, devolve o valor PERMITIDO mais próximo. Existe porque um módulo
  // travado (o cliente só escolhe entre N valores quando configura ele
  // DIRETO) perdia essa trava completamente quando usado como peça DENTRO de
  // outro módulo — a fórmula (ex: "D-20") sempre dava um valor contínuo,
  // ignorando que esse módulo na vida real só existe nesses N tamanhos. Ao
  // contrário de pickDrawerDepth, não desconta nenhuma folga (isso é
  // específico de profundidade de gaveta/corrediça) — aqui é só "qual desses
  // valores cadastrados está mais perto do que a fórmula pediu".
  function pickNearestPreset(values, targetMm) {
    const valid = (values || []).filter(function (v) { return v !== null && v !== undefined && isFinite(v); });
    if (valid.length === 0) return targetMm;
    return valid.reduce(function (best, v) {
      return Math.abs(v - targetMm) < Math.abs(best - targetMm) ? v : best;
    }, valid[0]);
  }

  // CORREDIÇA POR PROFUNDIDADE (migration 127, 2026-08-19 — Matt: "eu so
  // preciso puxar o preco certo conforme a profundidade"). Vários modelos de
  // corrediça (slide_models) podem estar vinculados ao MESMO módulo-gaveta
  // (module_slide_models — vínculo que já existia, ver
  // fetchModuleOwnHingeAndSlideModels em js/module-pieces.js), cada um com
  // seu próprio comprimento de trilho (rail_length_mm) e preço. Escolhe o de
  // MAIOR rail_length_mm que ainda caiba na profundidade REAL desta peça —
  // mesma lógica (arredonda pra baixo) que Drilling.parseSlideHoles já usa
  // pra escolher a tabela de posição de furo por comprimento, só que aqui é
  // o PREÇO, não a posição do furo.
  //
  // Sem NENHUM modelo com rail_length_mm cadastrado na lista, devolve null —
  // quem chama cai no comportamento de sempre (own_slide_model singular, "o
  // primeiro ativo", preço fixo). Zero efeito em módulo que não usa isto.
  function pickSlideModelByDepth(models, depthMm) {
    const candidatos = (models || []).filter(function (m) {
      return m && m.rail_length_mm !== null && m.rail_length_mm !== undefined && isFinite(m.rail_length_mm);
    });
    if (!candidatos.length) return null;
    const ordenados = candidatos.slice().sort(function (a, b) { return a.rail_length_mm - b.rail_length_mm; });
    let escolhido = null;
    ordenados.forEach(function (m) { if (m.rail_length_mm <= depthMm + 0.5) escolhido = m; });
    // Profundidade menor que a MENOR corrediça cadastrada: usa a menor mesmo
    // assim (nunca fica sem hardware nenhum por causa de um vão raso demais
    // — errar pro lado de cobrar a corrediça mais barata, não de sumir com
    // o custo inteiro).
    return escolhido || ordenados[0];
  }

  // Uma peça-módulo com dimensão TRAVADA (locked_*_presets) só existe nos
  // valores cadastrados — se o espaço disponível de verdade (valor BRUTO
  // calculado pela fórmula, antes de qualquer arredondamento) é MENOR que o
  // menor valor cadastrado, essa peça não cabe em NENHUM tamanho real dela,
  // não só no "ideal". Ex: gaveta com profundidades possíveis
  // [305,381,457,533] — se o vão que sobrou é 180mm, não existe gaveta de
  // verdade pra colocar ali; diferente de "espremer" ela pra 180mm (que não
  // corresponde a nenhuma gaveta configurada), o certo é essa peça NÃO
  // EXISTIR nessa configuração (ver calculateModulePiece, que devolve null
  // quando isto é true, e calculateAssembly, que filtra os nulls do
  // breakdown). Sem presets configurados, nunca bloqueia (devolve false).
  function isBelowMinLockedPreset(presets, rawValueMm) {
    const valid = (presets || []).filter(function (v) { return v !== null && v !== undefined && isFinite(v); });
    if (valid.length === 0) return false;
    return rawValueMm < Math.min.apply(null, valid);
  }

  // Clampa um valor contra um min/max PRÓPRIO (ex: modules.height_max_mm do
  // módulo filho) — usado pra uma peça-módulo aninhada nunca ultrapassar o
  // limite inerente DELA MESMA, independente do container pai. Antes disso
  // só existia a trava "nunca maior que o container pai" (ver calculateModulePiece/
  // resolvePiecesForViewer), então um módulo pai bem maior deixava uma
  // peça-módulo pequena (ex: uma gaveta com height_max_mm=200) esticar até
  // qualquer altura, respeitando só o espaço disponível, nunca o próprio
  // teto. min/max null/undefined = sem limite nesse lado (não trava).
  function clampToOwnRange(value, min, max) {
    let v = value;
    if (min !== null && min !== undefined && isFinite(min)) v = Math.max(v, min);
    if (max !== null && max !== undefined && isFinite(max)) v = Math.min(v, max);
    return v;
  }

  // Visibilidade condicional de peça (migration 031) — por VÍNCULO módulo x
  // peça (module_components.visibility_*), não pela peça/componente em si:
  // o mesmo componente pode ter uma condição diferente (ou nenhuma)
  // dependendo do módulo em que é usado. Sem piece.visibility_dimension
  // cadastrado, sempre visível — preserva 100% o comportamento de qualquer
  // peça que nunca configurou isso.
  //
  // containerDims é o mesmo container (W/H/D em mm) usado pras fórmulas de
  // L/A/P desta peça — ou seja, a condição é sobre o TAMANHO DO MÓDULO PAI
  // (ou, se esta peça estiver dentro de uma peça-módulo aninhada, o
  // container local dessa peça-módulo), nunca a dimensão já resolvida da
  // própria peça (minúsculo w/h/d) — mesma convenção de width_formula/
  // offset_x_mm, que também usam W/H/D maiúsculo pro container. Como tudo
  // aqui já está em mm (a conversão de unidade é só na camada de exibição
  // do portal), a condição funciona igual não importa a unidade escolhida
  // pelo cliente.
  function isPieceVisible(piece, containerDims) {
    const dimKey = piece.visibility_dimension;
    if (!dimKey) return true;
    const value = containerDims[dimKey];
    if (value === undefined || value === null || !isFinite(value)) return true;
    const min = piece.visibility_min_mm;
    const max = piece.visibility_max_mm;
    if (min !== null && min !== undefined && isFinite(min) && value < min) return false;
    if (max !== null && max !== undefined && isFinite(max) && value > max) return false;
    return true;
  }

  // ---- Peça-COMPONENTE (folha — vem do catálogo "components") ----
  // colorsByRole: mapa { [color_role_id]: registro de "colors" } — migration
  // 035 substitui o par fixo boxColor/doorColor por um mapa de tamanho
  // livre, um por papel de cor cadastrado (ver color_roles no admin).
  // pieceColorOverrides (migration 046): { [module_components.id]: { [color_role_id]: registro
  // de "colors" } } — override de cor por INSTÂNCIA de peça-módulo aninhada (ver
  // client_color_configurable/effectiveColorsForPiece abaixo). Uma peça-folha comum nunca
  // aparece como chave aqui hoje (só a UI do portal expõe isso pra peça-módulo, ver portal.js
  // collectColorConfigurablePieces), mas o merge funciona igual pra qualquer piece.id.
  function effectiveColorsForPiece(piece, colorsByRole, pieceColorOverrides) {
    const override = pieceColorOverrides && pieceColorOverrides[piece.id];
    return override ? Object.assign({}, colorsByRole, override) : colorsByRole;
  }

  function calculateLeafPiece(piece, dims, colorsByRole, hingeModel, slideModel, shelfQuantities, dimOverrides, pieceColorOverrides) {
    const quantityOverride = piece.quantity_configurable ? shelfQuantities[piece.id] : undefined;
    const dimOverride = piece.client_dimension_configurable && dimOverrides ? dimOverrides[piece.id] : undefined;
    const pieceDims = calculatePiece(piece, dims, quantityOverride, dimOverride);
    const qty = pieceDims.quantity;

    // Peça COMPRADA (migration 119/120) não exige cor cadastrada: ferragem
    // como o pé ("Plastic feet 4 1/2") não tem papel de cor nenhum — o 3D já
    // ignora a cor dela de propósito (viewer3d.js: "Pé sempre preto e
    // cilíndrico... a cor da peça no cadastro é ignorada aqui") e ela nasce
    // com area_m2_formula/edge_band_linear_m_formula = '0', então sheet_cost/
    // edge_cost dela são sempre zero mesmo — exigir uma cor só pra multiplicar
    // por zero travava o cálculo do módulo inteiro com "Nenhuma cor
    // selecionada" numa peça que o cliente nunca vê pintada de nada.
    const comprado = piece.origin === 'comprado';
    const effectiveColors = effectiveColorsForPiece(piece, colorsByRole, pieceColorOverrides);
    const color = effectiveColors && effectiveColors[piece.color_role_id];
    if (!color && !comprado) throw new Error(tr('pricing.no_color_for_piece', { ref: piece.reference }, 'Nenhuma cor selecionada para a peça "' + piece.reference + '".'));
    const corParaChapa = color || { sheet_price_per_m2: 0, edge_price_per_linear_m: 0 };

    const sheet_cost = pieceDims.area_m2 * corParaChapa.sheet_price_per_m2 * qty;
    const edge_cost = pieceDims.edge_band_m * corParaChapa.edge_price_per_linear_m * qty;
    // Mão de obra: por processo (migration 090) ou pela labor do componente,
    // NUNCA as duas. Os 62 componentes antigos apontam pra uma labor que já
    // embute cortar+fitar+furar; somar processos em cima cobraria duas vezes.
    // Por isso labor_por_processo é opt-in por peça, e não um interruptor
    // geral.
    // Peça comprada fica FORA do processo mesmo com o interruptor ligado: o
    // custo dela é o preço de compra, que mora em labor_type_id. Sem esta
    // ressalva, marcar "por processo" num pé zeraria o preço dele.
    const proc = (piece.labor_por_processo && piece.origin !== 'comprado')
      ? processLaborFor(piece, pieceDims) : null;
    const custoUnitario = proc
      ? proc.total * qty
      : (piece.labor_cost_per_unit || 0) * qty;

    // COMPRADO x FABRICADO (migration 119). A peça comprada (um pé, um
    // puxador — peça de verdade, com posição e desenho, mas que a fábrica
    // compra pronta) tem o custo dela reclassificado de mão de obra pra
    // comprado. Mesmo valor, outra natureza.
    //
    // purchase_price do cadastro novo ganha do labor_type_id quando existe:
    // é pra onde o preço de ferragem está mudando de casa. Enquanto o
    // componente não estiver ligado a um purchased_item, o número antigo
    // continua valendo — a migration 119 liga todos os que já existiam.
    // (comprado já foi calculado mais acima, junto da checagem de cor.)
    const itemComprado = piece.purchased_item
      || (piece.purchased_item_id ? purchasedItemsById[piece.purchased_item_id] : null)
      || null;
    // Migration 129: item comprado por METRO (unit === 'm', ex: "Cabide
    // (metro)") cobra pelo COMPRIMENTO real da peça (pieceDims.width_mm),
    // não pela quantidade de instâncias — todo item 'un'/'par'/'jogo'
    // existente (pé, puxador, corrediça...) continua exatamente como antes,
    // só entra neste ramo novo quando unit==='m'.
    const metrosComprado = pieceDims.width_mm / 1000;
    const precoComprado = (itemComprado && itemComprado.purchase_price != null)
      ? Number(itemComprado.purchase_price) * (itemComprado.unit === 'm' ? metrosComprado : qty)
      : custoUnitario;
    // Migration 129: kit de suporte — item comprado SECUNDÁRIO que "vai
    // junto" com a peça principal (ex: kit suporte de um cabide). Quantidade
    // fixa por peça (support_purchased_item_qty, default 1 — regra
    // confirmada pelo Matt: não escala com o comprimento), multiplicada por
    // qty igual a qualquer outro custo de peça comprada.
    const itemSuporte = piece.support_purchased_item_id
      ? purchasedItemsById[piece.support_purchased_item_id]
      : null;
    const support_cost = (comprado && itemSuporte && itemSuporte.purchase_price != null)
      ? Number(itemSuporte.purchase_price) * (piece.support_purchased_item_qty || 1) * qty
      : 0;
    const purchased_cost = comprado ? (precoComprado + support_cost) : 0;
    const labor_cost = comprado ? 0 : custoUnitario;

    // Dobradiça só se aplica a PORTAS: hinge_side definido, qualquer que
    // seja a Posição no módulo ('none' é frente fixa, não abre, não usa
    // dobradiça). Não exige mais position_role==='front' — a posição
    // "Frente/porta" tem bugs de posicionamento no 3D, então o admin passou
    // a usar "Peça livre" pras portas, confiando só no campo hinge_side pra
    // marcar que abre (ver mesma mudança em portal.js/client.js
    // setupOptionVisibility, senão o preço cobraria dobradiça em portas que
    // o 3D já mostra como abríveis, ou vice-versa). A quantidade vem da
    // regra de negócio por altura da PORTA (ver hingeCountForDoorHeight
    // acima), pra sempre bater com o desenho 3D.
    let hinge_cost = 0;
    let hinge_count = 0;
    if (piece.hinge_side && piece.hinge_side !== 'none') {
      hinge_count = hingeCountForDoorHeight(pieceDims.height_mm);
      if (!hingeModel) throw new Error(tr('pricing.no_hinge_for_piece', { ref: piece.reference }, 'Nenhum modelo de dobradiça selecionado para a peça "' + piece.reference + '".'));
      hinge_cost = hingeModel.price_per_unit * hinge_count * qty;
    }

    let slide_cost = 0;
    if (piece.slides_per_unit > 0) {
      if (!slideModel) throw new Error(tr('pricing.no_slide_for_piece', { ref: piece.reference }, 'Nenhum modelo de corrediça selecionado para a peça "' + piece.reference + '".'));
      slide_cost = slideModel.price_per_unit * piece.slides_per_unit * qty;
    }

    const piece_total = sheet_cost + edge_cost + labor_cost + purchased_cost + hinge_cost + slide_cost;

    return {
      piece_id: piece.id,
      reference: piece.reference,
      // Descrição do componente (campo "notes" do cadastro, ver admin.js) —
      // usada só pra listagem/lista de peças (corte), não afeta cálculo
      // nenhum. Ausente em pedidos gravados ANTES desta mudança (o
      // breakdown é um retrato congelado do momento do pedido).
      description: piece.notes || null,
      // Origem (migration 034) — 'fabricacao' (padrão) vira linha na lista
      // de corte; 'comprado' vira linha na lista de compra separada (ver
      // admin.js, aba Pedidos). Só uso na listagem, não afeta cálculo.
      origin: piece.origin || 'fabricacao',
      is_module: false,
      quantity: qty,
      color_role_id: piece.color_role_id,
      width_mm: pieceDims.width_mm,
      height_mm: pieceDims.height_mm,
      depth_mm: pieceDims.depth_mm,
      area_m2: pieceDims.area_m2,
      edge_band_m: pieceDims.edge_band_m,
      sheet_cost: sheet_cost,
      edge_cost: edge_cost,
      labor_cost: labor_cost,
      // Custo de COMPRA desta peça (migration 119). Zero em peça fabricada.
      // Sai separado de labor_cost pra o relatório de fábrica poder somar
      // ferragem junto com chapa e fita, e não junto com a coladeira.
      purchased_cost: purchased_cost,
      purchased_item_id: (itemComprado && itemComprado.id) || piece.purchased_item_id || null,
      purchased_margin_profile_id: (itemComprado && itemComprado.margin_profile_id) || null,
      // Custo do kit de suporte (migration 129) já somado dentro de
      // purchased_cost acima — exposto separado só pro relatório $ Fábrica
      // poder abrir numa linha própria, se quiser (mesmo padrão de
      // hinge_cost/slide_cost, que também são subtotais dentro do total).
      support_cost: support_cost,
      support_purchased_item_id: (itemSuporte && itemSuporte.id) || piece.support_purchased_item_id || null,
      // Aberto por processo quando a peça está em processo (migration 090);
      // null nas peças antigas, que têm uma labor só e nada a abrir.
      labor_breakdown: proc
        ? {
          corte: proc.corte * qty, fita: proc.fita * qty,
          furacao: proc.furacao * qty, usinagem: proc.usinagem * qty
        }
        : null,
      hinge_cost: hinge_cost,
      hinge_count: hinge_count, // uso interno/admin — quantas dobradiças foram cobradas nesta peça
      // Modelo REALMENTE usado (2026-08-19) — mesmo motivo do
      // calculateModulePiece logo abaixo: o relatório $ Fábrica precisa
      // saber QUAL corrediça/dobradiça pagou por este custo, não só o valor.
      hinge_model_id: hinge_cost > 0 && hingeModel ? hingeModel.id : null,
      hinge_model_name: hinge_cost > 0 && hingeModel ? hingeModel.name : null,
      slide_cost: slide_cost,
      slide_model_id: slide_cost > 0 && slideModel ? slideModel.id : null,
      slide_model_name: slide_cost > 0 && slideModel ? slideModel.name : null,
      slide_model_rail_length_mm: slide_cost > 0 && slideModel ? slideModel.rail_length_mm : null,
      piece_total: piece_total
    };
  }

  // ---- Peça-MÓDULO (piece.is_module === true — sub-montagem aninhada) ----
  // Não tem chapa/fita/mão de obra PRÓPRIA — quem tem isso são as peças
  // FOLHA lá dentro de child_pieces, calculadas recursivamente. Por isso
  // labor_cost desta peça-módulo em si é sempre 0: dar um custo de mão de
  // obra aqui, EM CIMA do custo de mão de obra de cada peça filha, contaria a
  // mão de obra da sub-montagem DUAS vezes (esse era um risco do desenho
  // antigo do sistema de door_style/drawer_type, corrigido aqui).
  function calculateModulePiece(piece, dims, colorsByRole, hingeModel, slideModel, shelfQuantities, dimOverrides, pieceColorOverrides) {
    const quantityOverride = piece.quantity_configurable ? shelfQuantities[piece.id] : undefined;
    const dimOverride = piece.client_dimension_configurable && dimOverrides ? dimOverrides[piece.id] : undefined;
    const pieceDims = calculatePiece(piece, dims, quantityOverride, dimOverride);
    const qty = pieceDims.quantity;

    // Peça-módulo com dimensão TRAVADA (locked_*_presets) que não cabe nem
    // no MENOR valor cadastrado nessa dimensão: essa peça NÃO EXISTE nessa
    // configuração (ver isBelowMinLockedPreset) — devolve null em vez de
    // "espremer" ela num tamanho que não corresponde a nenhuma peça real
    // (ex: cliente diminuiu a profundidade do módulo pai até sobrar menos
    // espaço do que a menor gaveta configurada cabe; a gaveta some do
    // preço/desenho em vez de aparecer menor do que deveria existir).
    // Comparado contra o valor BRUTO (antes de qualquer arredondamento),
    // porque é isso que representa o espaço realmente disponível.
    if (isBelowMinLockedPreset(piece.locked_width_presets, pieceDims.width_mm)
      || isBelowMinLockedPreset(piece.locked_height_presets, pieceDims.height_mm)
      || isBelowMinLockedPreset(piece.locked_depth_presets, pieceDims.depth_mm)) {
      return null;
    }

    // Mesma ideia, pro sistema de profundidade FIXA (fixed_depths): se nem a
    // menor opção cabe no vão disponível, a gaveta não existe nessa
    // configuração — ver isBelowMinFixedDepth. Checado contra o valor BRUTO
    // (antes de pickDrawerDepth escolher/espremer), igual ao bloco acima.
    if (isBelowMinFixedDepth(piece.fixed_depths, pieceDims.depth_mm)) {
      return null;
    }

    // Peça-módulo com profundidade FIXA (ex: um módulo de gaveta usado como
    // sub-montagem, com module_fixed_depths cadastrado) — sobrescreve a
    // profundidade "disponível" (resolvida pela fórmula) pela profundidade
    // FIXA real mais próxima que caiba, pra breakdown e desenho 3D baterem
    // com a peça de verdade, não com o espaço bruto disponível. Tem
    // prioridade sobre locked_depth_presets (sistema mais antigo,
    // específico de gaveta/corrediça, com folga própria — não muda
    // comportamento de módulos que já usam isso).
    if (piece.fixed_depths && piece.fixed_depths.length > 0) {
      pieceDims.depth_mm = pickDrawerDepth(piece.fixed_depths, pieceDims.depth_mm);
    } else if (piece.locked_depth_presets && piece.locked_depth_presets.length > 0) {
      pieceDims.depth_mm = pickNearestPreset(piece.locked_depth_presets, pieceDims.depth_mm);
    }
    // Largura/altura TRAVADAS (module_dimension_presets + width_locked/
    // height_locked no módulo filho — migration 028): mesma ideia acima,
    // generalizada — o módulo usado como peça só existe nesses valores.
    if (piece.locked_width_presets && piece.locked_width_presets.length > 0) {
      pieceDims.width_mm = pickNearestPreset(piece.locked_width_presets, pieceDims.width_mm);
    }
    if (piece.locked_height_presets && piece.locked_height_presets.length > 0) {
      pieceDims.height_mm = pickNearestPreset(piece.locked_height_presets, pieceDims.height_mm);
    }

    // LIMITE PRÓPRIO do módulo filho (modules.width_min_mm/max_mm etc,
    // sempre existem — ver fetchModuleLockedDimensionPresets em
    // admin.js/client.js/portal.js) — regra FUNDAMENTAL, sempre ativa, não
    // depende de client_dimension_configurable. Pedido do usuário: "quando
    // um modulo e inserido em outro, ele respeite os limites de tamanho do
    // modulo filho" — ex: uma gaveta com height_max_mm=200 não pode subir a
    // 500mm só porque o módulo pai ficou mais alto. Aplicada ANTES da trava
    // de segurança contra o container abaixo, que continua existindo pro
    // caso do container pai ser menor que o próprio módulo filho permite.
    pieceDims.width_mm = clampToOwnRange(pieceDims.width_mm, piece.own_width_min_mm, piece.own_width_max_mm);
    pieceDims.height_mm = clampToOwnRange(pieceDims.height_mm, piece.own_height_min_mm, piece.own_height_max_mm);
    pieceDims.depth_mm = clampToOwnRange(pieceDims.depth_mm, piece.own_depth_min_mm, piece.own_depth_max_mm);

    // TRAVA DE SEGURANÇA: uma peça-módulo NUNCA pode ficar maior que o
    // espaço disponível no container (dims) que a recebe — locked_*_presets
    // arredonda pro valor mais PRÓXIMO, não necessariamente o que CABE, e
    // isso faria a sub-montagem "vazar" pra fora do corpo do módulo pai (ex:
    // gaveta mais funda que o vão que a recebe). Clampa sempre, pros 3
    // eixos, pra breakdown/preço nunca divergir do que o 3D (client.js/
    // portal.js resolvePiecesForViewer, mesma trava) efetivamente desenha.
    pieceDims.width_mm = Math.min(pieceDims.width_mm, dims.W);
    pieceDims.height_mm = Math.min(pieceDims.height_mm, dims.H);
    pieceDims.depth_mm = Math.min(pieceDims.depth_mm, dims.D);

    // Modelo de dobradiça/corrediça PRÓPRIO do módulo filho (ver
    // fetchModuleOwnHingeAndSlideModels em client.js/portal.js) tem
    // prioridade sobre o modelo escolhido pelo cliente no módulo raiz —
    // hardware FIXO da peça (ex: "Drawer Soft Closet" só existe com
    // corrediça HAFELE undermount SOFT CLOSET) não deve depender do cliente
    // escolher um modelo lá em cima, nem exigir que o módulo pai também
    // tenha um vinculado só pra essa peça funcionar. Sem modelo próprio,
    // cai pro modelo global (hingeModel/slideModel), igual sempre foi. Passa
    // pra frente na recursão (childResult) pra peças-módulo aninhadas AINDA
    // MAIS fundo herdarem o modelo resolvido aqui, se elas mesmas não
    // tiverem um próprio (mais próximo na árvore vence).
    // own_slide_models (plural, migration 127) = todos os modelos de
    // corrediça vinculados a este módulo filho com rail_length_mm
    // cadastrado. pieceDims.depth_mm já está TOTALMENTE resolvido aqui
    // (fixed_depths/locked_depth_presets/clamps acima já rodaram) — é a
    // profundidade REAL desta gaveta, a mesma que o 3D desenha e a furação
    // usa. Sem candidato por profundidade, cai no de sempre.
    const slidePorProfundidade = pickSlideModelByDepth(piece.own_slide_models, pieceDims.depth_mm);
    const effectiveHingeModel = piece.own_hinge_model || hingeModel;
    const effectiveSlideModel = slidePorProfundidade || piece.own_slide_model || slideModel;

    // Cor própria desta instância (migration 046, client_color_configurable) — se o cliente
    // escolheu uma cor separada pra ESTA peça-módulo (ver pieceColorOverrides no topo do
    // arquivo/portal.js), o merge substitui só os papéis que ela tem override, mantendo os
    // demais herdados do pai — e o resultado desce pra TODA a sub-árvore (child_pieces), então
    // um módulo aninhado ainda mais fundo que também tenha override próprio (mais específico)
    // continua vencendo sobre este.
    const effectiveColorsByRole = effectiveColorsForPiece(piece, colorsByRole, pieceColorOverrides);

    const childDims = { W: pieceDims.width_mm, H: pieceDims.height_mm, D: pieceDims.depth_mm };
    const childResult = calculateAssembly(
      piece.child_pieces || [], childDims, effectiveColorsByRole, effectiveHingeModel, effectiveSlideModel, shelfQuantities, dimOverrides, pieceColorOverrides
    );
    const child_total = childResult.total * qty;

    // Abertura genérica (opening_type): hinge_left/hinge_right = gira em
    // torno de uma borda (mesma regra/custo de dobradiça de uma porta
    // comum); slide_out = desliza (mesma regra/custo de corrediça de uma
    // gaveta comum). 'none' = não abre, sem custo de ferragem de abertura.
    let hinge_cost = 0;
    let hinge_count = 0;
    if (piece.opening_type === 'hinge_left' || piece.opening_type === 'hinge_right') {
      hinge_count = hingeCountForDoorHeight(pieceDims.height_mm);
      if (!effectiveHingeModel) throw new Error(tr('pricing.no_hinge_for_piece', { ref: piece.reference || piece.module_name }, 'Nenhum modelo de dobradiça selecionado para a peça "' + (piece.reference || piece.module_name) + '".'));
      hinge_cost = effectiveHingeModel.price_per_unit * hinge_count * qty;
    }

    let slide_cost = 0;
    if (piece.opening_type === 'slide_out' && piece.slides_per_unit > 0) {
      if (!effectiveSlideModel) throw new Error(tr('pricing.no_slide_for_piece', { ref: piece.reference || piece.module_name }, 'Nenhum modelo de corrediça selecionado para a peça "' + (piece.reference || piece.module_name) + '".'));
      slide_cost = effectiveSlideModel.price_per_unit * piece.slides_per_unit * qty;
    }

    const piece_total = child_total + hinge_cost + slide_cost;

    return {
      piece_id: piece.id,
      reference: piece.reference || piece.module_name,
      is_module: true,
      quantity: qty,
      color_role_id: piece.color_role_id,
      width_mm: pieceDims.width_mm,
      height_mm: pieceDims.height_mm,
      depth_mm: pieceDims.depth_mm,
      child_breakdown: childResult.breakdown, // composição da sub-montagem, uso interno/admin
      child_total: childResult.total,         // preço da sub-montagem (1 unidade), uso interno/admin
      labor_cost: 0, // sempre 0 nesta peça — mão de obra já está nas peças filha (ver comentário acima)
      hinge_cost: hinge_cost,
      hinge_count: hinge_count,
      // Modelo REALMENTE usado (2026-08-19, Matt: "nao esta especificando
      // qual corredica nem tamanho" no $ Fábrica) — sem isto, o relatório só
      // via um número, nunca "qual corrediça"/"qual comprimento" pagou por
      // ele. effectiveHingeModel/effectiveSlideModel já carregam name (e
      // rail_length_mm, quando vem de own_slide_models/pickSlideModelByDepth
      // — migration 127/128) — só precisa sair no breakdown.
      hinge_model_id: hinge_cost > 0 && effectiveHingeModel ? effectiveHingeModel.id : null,
      hinge_model_name: hinge_cost > 0 && effectiveHingeModel ? effectiveHingeModel.name : null,
      slide_cost: slide_cost,
      slide_model_id: slide_cost > 0 && effectiveSlideModel ? effectiveSlideModel.id : null,
      slide_model_name: slide_cost > 0 && effectiveSlideModel ? effectiveSlideModel.name : null,
      slide_model_rail_length_mm: slide_cost > 0 && effectiveSlideModel ? effectiveSlideModel.rail_length_mm : null,
      piece_total: piece_total
    };
  }

  // ---- Motor recursivo — substitui o antigo par calculateModulePrice +
  // calculateSubAssembly (este último só cobria door_style/drawer_type). ----
  // pieces: lista de peças no formato já achatado pela camada de dados —
  // cada item é OU uma peça-componente (folha) OU uma peça-módulo
  // (piece.is_module=true, piece.child_pieces=[...] na mesma forma
  // recursiva). dims = { W, H, D } do container desta lista (módulo raiz, ou
  // já as dimensões locais de uma peça-módulo pai, se estivermos recursando).
  function calculateAssembly(pieces, dims, colorsByRole, hingeModel, slideModel, shelfQuantities, dimOverrides, pieceColorOverrides) {
    const { bodyDims } = resolveBodyDims(pieces, dims);
    const breakdown = (pieces || []).map(function (piece) {
      const pieceContainerDims = piece.position_role === 'leg' ? dims : bodyDims;
      // Visibilidade condicional (migration 031) — checada ANTES de calcular
      // qualquer coisa (evita erro de "nenhuma cor selecionada"/dobradiça
      // faltando numa peça que nem deveria existir nesta configuração).
      // Aplica-se igual a peça-componente e peça-módulo, por isso fica aqui,
      // no ponto comum às duas, em vez de duplicado nas duas funções abaixo.
      if (!isPieceVisible(piece, pieceContainerDims)) return null;
      return piece.is_module
        ? calculateModulePiece(piece, pieceContainerDims, colorsByRole, hingeModel, slideModel, shelfQuantities, dimOverrides, pieceColorOverrides)
        : calculateLeafPiece(piece, pieceContainerDims, colorsByRole, hingeModel, slideModel, shelfQuantities, dimOverrides, pieceColorOverrides);
    // calculateModulePiece devolve null quando a peça-módulo tem dimensão
    // travada que não cabe nem no menor valor configurado (ver
    // isBelowMinLockedPreset) — filtra fora do breakdown, ela simplesmente
    // não existe nessa configuração (não entra no preço nem no desenho).
    }).filter(function (p) { return p !== null; });
    const total = breakdown.reduce(function (sum, p) { return sum + p.piece_total; }, 0);
    return { breakdown: breakdown, total: total };
  }

  // ---- Custo COMPRADO dentro do breakdown, agrupado por perfil de margem ----
  // (migration 119) Mesma travessia recursiva do calculateVolumeM3: peça-módulo
  // não tem custo próprio, o dela está nas child_breakdown e precisa ser
  // multiplicado pela quantidade da peça-módulo que a contém.
  //
  // Agrupa por perfil porque a margem do comprado pode ser POR ITEM — somar
  // tudo num número só e aplicar uma margem média daria o total certo por
  // acidente hoje e errado no dia em que os perfis divergirem.
  // Chave '' = item sem perfil próprio (cai no padrão dos comprados).
  function collectPurchasedCost(breakdown) {
    const out = { total: 0, porPerfil: {} };
    const anda = function (lista, fator) {
      (lista || []).forEach(function (p) {
        if (!p) return;
        if (p.is_module) { anda(p.child_breakdown, fator * (p.quantity || 1)); return; }
        const v = (Number(p.purchased_cost) || 0) * fator;
        if (!v) return;
        const k = p.purchased_margin_profile_id || '';
        out.porPerfil[k] = (out.porPerfil[k] || 0) + v;
        out.total += v;
      });
    };
    anda(breakdown, 1);
    return out;
  }

  // ---- Cálculo do módulo PAI (topo da árvore) ----
  //
  // params:
  //   module                        — módulo raiz (só usado pra id/name no retorno)
  //   pieces                        — peças do módulo raiz, formato recursivo (ver calculateAssembly)
  //   colorsByRole                  — mapa { [color_role_id]: registro de "colors" } — migration 035,
  //                                    um por papel de cor que o módulo realmente usa (antes eram os
  //                                    2 parâmetros fixos boxColor/doorColor)
  //   hingeModel                    — { price_per_unit } modelo de dobradiça escolhido (opcional)
  //   slideModel                    — { price_per_unit } modelo de corrediça escolhido (opcional)
  //   shelfQuantities               — { [piece_id]: quantidade escolhida } para peças quantity_configurable
  //   dimOverrides                   — { [piece_id]: { width_mm, height_mm, depth_mm } } para peças-módulo
  //                                    com client_dimension_configurable (migration 036)
  //   pieceColorOverrides            — { [piece_id]: { [color_role_id]: registro de "colors" } } para
  //                                    peças-módulo com client_color_configurable (migration 046) — cor
  //                                    própria por INSTÂNCIA, cascateando pra toda a sub-árvore dela (ver
  //                                    effectiveColorsForPiece); default {} preserva o comportamento
  //                                    antigo (um só colorsByRole valendo pra tudo, sem overrides)
  //   width_mm, height_mm, depth_mm — medidas do módulo pai escolhidas pelo cliente
  //   markupMultiplier              — (migration 037) multiplicador de margem sobre o CUSTO total
  //                                    (ex: 1.35 = +35%), configurado no admin (pricing_settings).
  //                                    Aplicado UMA VEZ, só aqui no topo — nunca dentro de
  //                                    calculateAssembly/calculateModulePiece, senão uma peça-módulo
  //                                    aninhada "composta" margem dentro de margem (juros sobre
  //                                    juros) em vez de uma margem só sobre o custo real do conjunto.
  //                                    Default 1 (sem margem) — quem não passar este param (ex: o
  //                                    "Teste de cálculo" do admin, que quer ver o CUSTO puro) continua
  //                                    com o comportamento de sempre.
  //
  // Retorna breakdown completo (uso interno/admin, pode ter várias camadas de
  // child_breakdown se houver peças-módulo aninhadas, sempre em base de
  // CUSTO) + cost_total (custo puro, uso interno/admin) + total (custo x
  // margem — o único valor que o cliente deve ver).
  function calculateModulePrice(params) {
    const module = params.module;
    const pieces = params.pieces;
    const colorsByRole = params.colorsByRole || {};
    const hingeModel = params.hingeModel || null;
    const slideModel = params.slideModel || null;
    const shelfQuantities = params.shelfQuantities || {};
    const dimOverrides = params.dimOverrides || {};
    const pieceColorOverrides = params.pieceColorOverrides || {};
    const width_mm = params.width_mm;
    const height_mm = params.height_mm;
    const depth_mm = params.depth_mm;
    const markupMultiplier = params.markupMultiplier || 1;

    const moduleDims = { W: width_mm, H: height_mm, D: depth_mm };
    const result = calculateAssembly(pieces, moduleDims, colorsByRole, hingeModel, slideModel, shelfQuantities, dimOverrides, pieceColorOverrides);

    // ======================================================================
    // ITENS COMPRADOS (migration 119) — margem própria, aplicada aqui no topo
    // ======================================================================
    // Duas fontes de comprado, somadas no mesmo bucket:
    //   a) PEÇA comprada (um pé, um puxador — está no breakdown, tem posição
    //      e desenho): purchased_cost de cada folha;
    //   b) FERRAGEM DE MONTAGEM (tambor, pino, cavilha, suporte): não é peça
    //      de módulo nenhum, é consequência da FURAÇÃO. Vem de fora, por
    //      setModuleHardware, contada por Hardware.consumoDoModulo a partir
    //      dos furos que o .ban gera.
    //
    // A margem sai da mesma regra dos dois: perfil do ITEM > perfil padrão
    // dos comprados > margem do módulo. O último degrau é o que faz esta
    // mudança nascer neutra: sem perfil configurado, o comprado é
    // multiplicado exatamente pelo mesmo markup de antes.
    //
    // Aplicada AQUI e só aqui, pelo mesmo motivo do markupMultiplier: dentro
    // de calculateAssembly, uma peça-módulo aninhada componha margem sobre
    // margem.
    const markupComprado = function (perfilId) {
      if (perfilId && purchasedMarkupByProfile[perfilId] > 0) return purchasedMarkupByProfile[perfilId];
      if (purchasedMarkup > 0) return purchasedMarkup;
      return markupMultiplier;
    };

    const compradosPecas = collectPurchasedCost(result.breakdown);
    const ferragem = moduleHardware || [];
    const custoFerragem = ferragem.reduce(function (s, l) { return s + (Number(l.cost) || 0); }, 0);

    let vendaComprados = 0;
    Object.keys(compradosPecas.porPerfil).forEach(function (k) {
      vendaComprados += compradosPecas.porPerfil[k] * markupComprado(k);
    });
    ferragem.forEach(function (l) {
      vendaComprados += (Number(l.cost) || 0) * markupComprado(l.margin_profile_id);
    });

    // O que sobra depois de tirar o comprado leva a margem do MÓDULO.
    const custoFabricacao = result.total - compradosPecas.total;
    const custoTotal = result.total + custoFerragem;

    return {
      module_id: module.id,
      module_name: module.name,
      width_mm: width_mm,
      height_mm: height_mm,
      depth_mm: depth_mm,
      hinge_model_id: hingeModel ? hingeModel.id : null,
      slide_model_id: slideModel ? slideModel.id : null,
      shelf_quantities: shelfQuantities,
      dim_overrides: dimOverrides,
      breakdown: result.breakdown,       // uso interno/admin — NÃO mostrar ao cliente (custo puro)
      // Ferragem de montagem consumida por este módulo (migration 119) —
      // [{ item_id, name, unit, qty, unit_cost, cost }]. Uso interno/admin:
      // é o que alimenta a linha de comprados do $ Fábrica e a lista de
      // compra do pedido. null = catálogo de ferragem ainda não carregou
      // (que é diferente de "não leva ferragem", e o relatório precisa saber
      // a diferença pra não mostrar zero com cara de verdade).
      hardware: moduleHardware,
      purchased_cost: compradosPecas.total + custoFerragem,  // custo puro dos comprados
      cost_total: custoTotal,            // custo puro (sem margem) — uso interno/admin
      total: custoFabricacao * markupMultiplier + vendaComprados // único valor que o cliente deve ver
    };
  }

  // ---- Volume (m³) — pedido do usuário: mostrar metragem cúbica/peso junto
  // com o preço, pro módulo/projeto/pedido. Mesma origem que já existe pro
  // preço (width_mm/height_mm/depth_mm de cada PEÇA-COMPONENTE, folha do
  // breakdown), só que somando volume em vez de custo. Peça-módulo
  // (is_module:true) NUNCA soma volume próprio — ela é só um container (as
  // dimensões dela são do vão, não de uma chapa real) — só as peças FOLHA
  // dentro de child_breakdown contam, recursivamente, na mesma lógica que
  // child_total já usa pra preço (child_total = childResult.total * qty,
  // pricing.js:500): o volume da sub-montagem também precisa multiplicar
  // pela quantidade da peça-módulo que a contém.
  function calculateVolumeM3(breakdown) {
    return (breakdown || []).reduce(function (sum, p) {
      if (!p) return sum;
      if (p.is_module) {
        return sum + calculateVolumeM3(p.child_breakdown) * (p.quantity || 1);
      }
      const pieceVolumeMm3 = (p.width_mm || 0) * (p.height_mm || 0) * (p.depth_mm || 0) * (p.quantity || 1);
      return sum + pieceVolumeMm3 / 1e9; // mm³ -> m³
    }, 0);
  }

  const Pricing = {
    evalFormula,
    setFormulaGlobals,
    calculatePiece,
    // Migration 088 — a peça no plano da máquina (espessura/comprimento/
    // largura + de que eixo cada uma veio) e a metragem de fita derivada da
    // receita 0/2/4. Exportadas porque viewer3d.js precisa da MESMA resposta
    // pra pintar a face certa, e o cadastro precisa dela pra mostrar a
    // metragem antes de salvar.
    pecaNaMaquina,
    edgeBandMeters,
    // Migration 090 — preços dos quatro processos (corte, fita 2C, fita 4L,
    // furação). Chamado uma vez, logo depois de carregar pricing_settings.
    setProcessLabor,
    setHoleCounts,
    processLaborFor,
    // Migration 119 — itens comprados. Os três são publicadores (o chamador
    // avisa ANTES de pedir o preço), mesma mecânica de setProcessLabor/
    // setHoleCounts e pelo mesmo motivo: são ~8 pontos chamando
    // calculateModulePrice e acrescentar parâmetro em todos convida a
    // esquecer um. setModuleHardware é POR MÓDULO — quem calcula vários
    // módulos num laço publica antes de cada um.
    setPurchasedMarkup,
    setPurchasedMarkupByProfile,
    setPurchasedItems,
    setModuleHardware,
    collectPurchasedCost,
    resolveBodyDims,
    hingeCountForDoorHeight,
    pickDrawerDepth,
    isBelowMinFixedDepth,
    pickNearestPreset,
    isBelowMinLockedPreset,
    clampToOwnRange,
    isPieceVisible,
    calculateAssembly,
    calculateModulePrice,
    calculateVolumeM3
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Pricing;
  } else {
    global.Pricing = Pricing;
  }
})(typeof window !== 'undefined' ? window : globalThis);
