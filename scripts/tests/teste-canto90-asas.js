/* Bancada da PROFUNDIDADE DE CADA ASA do Base Canto 90° (2026-11-15).
 * `node scripts/tests/teste-canto90-asas.js`
 * dimOverrides.__canto90 = { asa_a_mm, asa_b_mm } troca o 609 cravado nas
 * fórmulas da migration 182 (lidas do dump real teste-base-canto-90.dump.json).
 * Confere peça por peça onde cada uma vai parar com asa A = 450 e B = 520. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const g = { console }; g.window = g; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/pricing.js'), 'utf8'), g, { filename: 'pricing.js' });
const P = g.Pricing;
const dump = JSON.parse(fs.readFileSync(path.join(__dirname, 'teste-base-canto-90.dump.json'), 'utf8'));
let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d !== undefined ? '  [' + d + ']' : '')); if (!c) falhas++; };
const perto = (a, b) => Math.abs(a - b) <= 0.05;
const E = 19.5, W = 1000, D = 950, H = 876, A = 450, B = 520;

dump.modulos.forEach((mod) => {
  console.log('\n— ' + mod.slug);
  const toe = /toe45/.test(mod.slug);
  const pecas = mod.pecas.map((r) => ({ id: r.id, reference: r.reference_override, is_module: !!r.child_module_id,
    position_role: r.position_role || r.comp_role, quantity: r.quantity_override || 1,
    width_formula: r.width_formula_override || r.cw || 'W', height_formula: r.height_formula_override || r.ch || 'H', depth_formula: r.depth_formula_override || r.cd || 'D',
    offset_x_formula: String(r.offset_x_mm == null ? '0' : r.offset_x_mm), offset_y_formula: String(r.offset_y_mm == null ? '0' : r.offset_y_mm), offset_z_formula: String(r.offset_z_mm == null ? '0' : r.offset_z_mm) }));
  ok('é canto 90°', P.canto90TemAsas(pecas));
  ok('sem a chave = MESMA lista', P.applyCanto90Asas(pecas, {}) === pecas && P.applyCanto90Asas(pecas, null) === pecas);
  ok('609 / 609 = MESMA lista', P.applyCanto90Asas(pecas, { __canto90: { asa_a_mm: 609, asa_b_mm: 609 } }) === pecas);
  const med = (lista, ref, n) => {
    const p = lista.find((x) => x.reference === ref);
    if (!p) return null;
    const v = { W, H, D, E, N: n || 1, COUNT: p.quantity };
    const w = P.evalFormula(p.width_formula, v), d = P.evalFormula(p.depth_formula, v);
    const v2 = Object.assign({}, v, { w, d });
    return { w, d, x: P.evalFormula(p.offset_x_formula, v2), z: P.evalFormula(p.offset_z_formula, v2) };
  };
  const antes = pecas, depois = P.applyCanto90Asas(pecas, { __canto90: { asa_a_mm: A, asa_b_mm: B } });
  const m = (ref, n) => med(depois, ref, n), m0 = (ref, n) => med(antes, ref, n);
  ok('padrão: lateral A 609 de fundo, lateral B 609 de largura', perto(m0('Lateral A (asa em X)').d, 609) && perto(m0('Lateral B (asa em Z)').w, 609));
  ok('lateral A (direita) = 450 de fundo, no mesmo lugar', perto(m('Lateral A (asa em X)').d, A) && perto(m('Lateral A (asa em X)').x, W - E));
  ok('lateral B (frente) = 520 de largura, em z = D−E', perto(m('Lateral B (asa em Z)').w, B) && perto(m('Lateral B (asa em Z)').z, D - E));
  ok('fundos não mudam', perto(m('Fundo (trás)').w, m0('Fundo (trás)').w) && perto(m('Fundo (esquerda)').d, m0('Fundo (esquerda)').d));
  const pa = m('Porta A (asa em X)'), pb = m('Porta B (asa em Z)');
  ok('porta A: x = 520, z = 450, largura W−520−2,5', perto(pa.x, B) && perto(pa.z, A) && perto(pa.w, W - B - 2.5), JSON.stringify(pa));
  ok('porta B (girada): x = 520, z = 450+2+E, largura D−450−4,5−E', perto(pb.x, B) && perto(pb.z, A + 2 + E) && perto(pb.w, D - A - 4.5 - E), JSON.stringify(pb));
  const rec = toe ? 20 : 0;
  const ba = m('Base A (asa em X)'), bb = m('Base B (asa em Z)');
  ok('base B: largura 520' + (toe ? '−20' : '') + '−E', perto(bb.w, B - rec - E), bb.w);
  ok('base A: começa em x = 520' + (toe ? '−20' : '') + ', fundo 450' + (toe ? '−20' : '') + '−E, vai até a lateral A', perto(ba.x, B - rec) && perto(ba.d, A - rec - E) && perto(ba.x + ba.w, W - E), JSON.stringify(ba));
  const sa = m('Stretcher A (asa em X)'), sb = m('Stretcher B (asa em Z)');
  ok('travessa A: x = 520, z = 450−76; travessa B: x = 520−76', perto(sa.x, B) && perto(sa.z, A - 76) && perto(sb.x, B - 76) && perto(sa.x + sa.w, W - E));
  const pra = m('Prateleira A (asa em X)'), prb = m('Prateleira B (asa em Z)');
  ok('prateleira B 520−E de largura; A começa em 520 com 450−E de fundo', perto(prb.w, B - E) && perto(pra.x, B) && perto(pra.d, A - E));
  if (toe) {
    const ta = m('Toe 4 1/2 A (asa em X)'), tb = m('Toe 4 1/2 B (asa em Z)');
    ok('toe A: x = 520−76, z = 450−76, até o fim da largura', perto(ta.x, B - 76) && perto(ta.z, A - 76) && perto(ta.x + ta.w, W), JSON.stringify(ta));
    ok('toe B: x = 520−76, z = 450−76+E, até a lateral B', perto(tb.x, B - 76) && perto(tb.z, A - 76 + E) && perto(tb.z + tb.d, D), JSON.stringify(tb));
  } else {
    const p4 = m('Pé plástico 4 1/2', 4), p5 = m('Pé plástico 4 1/2', 5), p6 = m('Pé plástico 4 1/2', 6);
    ok('pés do canto interno acompanham as asas', perto(p4.x, 0) && perto(p4.z, A - D) && perto(p5.x, B - W) && perto(p5.z, 0) && perto(p6.x, B - W) && perto(p6.z, A - D), JSON.stringify([p4, p5, p6]));
  }
  ok('sobrou algum 609/589/533 nas fórmulas?', !depois.some((p) => ['width_formula', 'depth_formula', 'offset_x_formula', 'offset_z_formula'].some((k) => /(^|[^0-9.])(609|589|533|611|611\.5|613\.5)(?![0-9.])/.test(String(p[k])))));
});
const fx = P.canto90FaixaAsa(914);
ok('faixa com 914 de módulo: 314 a 700 (porta de 100 a 600)', fx.min === 314 && fx.max === 700, JSON.stringify(fx));
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo OK');
process.exit(falhas ? 1 : 0);
