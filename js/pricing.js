// Motor de cálculo de preço — LEGNO PORTAL WEB
//
// Regra: o preço do módulo PAI é a soma do cálculo de cada peça (componente),
// conforme as medidas (W, H, D) e a cor escolhidas pelo cliente para o pai.
// Cada peça tem: dimensões próprias (por fórmula), área de chapa (m2),
// metro linear de fita, e mão de obra (custo fixo por unidade).

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

  function evalFormula(expression, variables) {
    if (expression === null || expression === undefined || String(expression).trim() === '') return 0;
    const tokens = tokenize(String(expression));
    const parser = new Parser(tokens, variables);
    const result = parser.parseExpression();
    parser.expectEnd();
    if (!isFinite(result)) throw new Error('Fórmula resultou em valor inválido (divisão por zero?).');
    return result;
  }

  // ---- Cálculo por peça ----
  // moduleDims = { W, H, D } dimensões do módulo PAI escolhidas pelo cliente.
  function calculatePiece(piece, moduleDims) {
    const { W, H, D } = moduleDims;
    const w = evalFormula(piece.width_formula, { W, H, D });
    const h = evalFormula(piece.height_formula, { W, H, D });
    const d = evalFormula(piece.depth_formula, { W, H, D });
    const ctx = { W, H, D, w, h, d };
    const areaM2 = evalFormula(piece.area_m2_formula, ctx);
    const edgeM = evalFormula(piece.edge_band_linear_m_formula || '0', ctx);
    return { width_mm: w, height_mm: h, depth_mm: d, area_m2: areaM2, edge_band_m: edgeM };
  }

  // ---- Cálculo do módulo PAI = soma dos componentes ----
  // Retorna breakdown completo (uso interno/admin) + total (o que o
  // cliente vê).
  function calculateModulePrice(params) {
    const module = params.module;
    const pieces = params.pieces;
    const color = params.color;
    const width_mm = params.width_mm;
    const height_mm = params.height_mm;
    const depth_mm = params.depth_mm;

    const moduleDims = { W: width_mm, H: height_mm, D: depth_mm };

    const breakdown = pieces.map(function (piece) {
      const dims = calculatePiece(piece, moduleDims);
      const sheet_cost = dims.area_m2 * color.sheet_price_per_m2 * piece.quantity;
      const edge_cost = dims.edge_band_m * color.edge_price_per_linear_m * piece.quantity;
      const labor_cost = piece.labor_cost_per_unit * piece.quantity;
      const piece_total = sheet_cost + edge_cost + labor_cost;
      return {
        reference: piece.reference,
        quantity: piece.quantity,
        width_mm: dims.width_mm,
        height_mm: dims.height_mm,
        depth_mm: dims.depth_mm,
        area_m2: dims.area_m2,
        edge_band_m: dims.edge_band_m,
        sheet_cost: sheet_cost,
        edge_cost: edge_cost,
        labor_cost: labor_cost,
        piece_total: piece_total
      };
    });

    const total = breakdown.reduce(function (sum, p) { return sum + p.piece_total; }, 0);

    return {
      module_id: module.id,
      module_name: module.name,
      width_mm: width_mm,
      height_mm: height_mm,
      depth_mm: depth_mm,
      color_id: color.id,
      color_name: color.name,
      breakdown: breakdown, // uso interno/admin — NÃO mostrar ao cliente
      total: total          // único valor que o cliente deve ver
    };
  }

  const Pricing = { evalFormula, calculatePiece, calculateModulePrice };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Pricing;
  } else {
    global.Pricing = Pricing;
  }
})(typeof window !== 'undefined' ? window : globalThis);
