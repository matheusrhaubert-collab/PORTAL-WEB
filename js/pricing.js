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
      throw new Error('Caractere inválido na fórmula: "' + ch + '"');
    }
    return tokens;
  }

  function Parser(tokens, variables) {
    this.tokens = tokens;
    this.pos = 0;
    this.variables = variables || {};
  }
  Parser.prototype.peek = function () { return this.tokens[this.pos]; };
  Parser.prototype.next = function () { return this.tokens[this.pos++]; };
  Parser.prototype.expectEnd = function () {
    if (this.pos < this.tokens.length) {
      throw new Error('Fórmula inválida: caracteres inesperados no final.');
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
    if (!tok) throw new Error('Fórmula inválida: fim inesperado.');
    if (tok.type === 'num') { this.next(); return tok.value; }
    if (tok.type === 'var') {
      this.next();
      if (!(tok.value in this.variables)) {
        throw new Error('Variável desconhecida na fórmula: "' + tok.value + '"');
      }
      return this.variables[tok.value];
    }
    if (tok.type === 'op' && tok.value === '(') {
      this.next();
      const value = this.parseExpression();
      const close = this.next();
      if (!close || close.value !== ')') throw new Error('Fórmula inválida: parêntese não fechado.');
      return value;
    }
    throw new Error('Fórmula inválida.');
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
    if (!isFinite(result)) throw new Error('Fórmula resultou em valor inválido (divisão por zero?).');
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
    const areaM2 = evalFormula(piece.area_m2_formula || '0', ctx);
    const edgeM = evalFormula(piece.edge_band_linear_m_formula || '0', ctx);
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

    const effectiveColors = effectiveColorsForPiece(piece, colorsByRole, pieceColorOverrides);
    const color = effectiveColors && effectiveColors[piece.color_role_id];
    if (!color) throw new Error('Nenhuma cor selecionada para a peça "' + piece.reference + '".');

    const sheet_cost = pieceDims.area_m2 * color.sheet_price_per_m2 * qty;
    const edge_cost = pieceDims.edge_band_m * color.edge_price_per_linear_m * qty;
    const labor_cost = (piece.labor_cost_per_unit || 0) * qty;

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
      if (!hingeModel) throw new Error('Nenhum modelo de dobradiça selecionado para a peça "' + piece.reference + '".');
      hinge_cost = hingeModel.price_per_unit * hinge_count * qty;
    }

    let slide_cost = 0;
    if (piece.slides_per_unit > 0) {
      if (!slideModel) throw new Error('Nenhum modelo de corrediça selecionado para a peça "' + piece.reference + '".');
      slide_cost = slideModel.price_per_unit * piece.slides_per_unit * qty;
    }

    const piece_total = sheet_cost + edge_cost + labor_cost + hinge_cost + slide_cost;

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
      hinge_cost: hinge_cost,
      hinge_count: hinge_count, // uso interno/admin — quantas dobradiças foram cobradas nesta peça
      slide_cost: slide_cost,
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
    const effectiveHingeModel = piece.own_hinge_model || hingeModel;
    const effectiveSlideModel = piece.own_slide_model || slideModel;

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
      if (!effectiveHingeModel) throw new Error('Nenhum modelo de dobradiça selecionado para a peça "' + (piece.reference || piece.module_name) + '".');
      hinge_cost = effectiveHingeModel.price_per_unit * hinge_count * qty;
    }

    let slide_cost = 0;
    if (piece.opening_type === 'slide_out' && piece.slides_per_unit > 0) {
      if (!effectiveSlideModel) throw new Error('Nenhum modelo de corrediça selecionado para a peça "' + (piece.reference || piece.module_name) + '".');
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
      slide_cost: slide_cost,
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
      cost_total: result.total,          // custo puro (sem margem) — uso interno/admin
      total: result.total * markupMultiplier // único valor que o cliente deve ver (custo x margem)
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
    resolveBodyDims,
    hingeCountForDoorHeight,
    pickDrawerDepth,
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
