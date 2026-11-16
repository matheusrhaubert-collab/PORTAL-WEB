/* Bancada do CLOSET CANTO 90° (migration 300, 2026-11-16).
 *   node scripts/tests/teste-closet-canto-90.js
 *
 * As peças abaixo são as MESMAS linhas que a migration 300 grava (fórmulas
 * copiadas dela); componentes/programas de furação vêm do dump real do Base
 * Canto 90° (teste-base-canto-90.dump.json), de onde a migration também lê.
 * Fórmulas avaliadas com o Pricing.evalFormula de verdade, asas/cabide
 * trocados com o Pricing.applyCanto90Asas de verdade, furos com o
 * Drilling._internals.collectAssembly de verdade.
 *
 * Confere, no padrão (1067 × 2400 × 1067), com asas 450/650 e cabide 1700,
 * e na altura mínima (2000):
 *   1. casco: laterais com a profundidade da asa, nada passa de W/D/H;
 *   2. bases em L: B cobre o canto, A encosta na BORDA de B (contra-furo
 *      borda com borda = minifix/cavilha do programa TOP BOTTOM · L);
 *   3. cabides: 270 do fundo, 4 mm da lateral, ponta de dentro no suporte;
 *      os dois na mesma altura, 45 abaixo da prateleira do cabide (centro);
 *   4. suporte em L encostado embaixo da prateleira do cabide, no encontro
 *      dos 2 cabides;
 *   5. furo Ø3 do suporte do cabide na lateral A (cabide A) e na lateral B
 *      (cabide B, girado), nenhum no fundo;
 *   6. prateleira do meio 1000 abaixo da do cabide; base de cima no topo.
 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const g = { console }; g.window = g; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/pricing.js'), 'utf8'), g, { filename: 'pricing.js' });
vm.runInContext(fs.readFileSync(path.join(R, 'js/drilling.js'), 'utf8'), g, { filename: 'drilling.js' });
const P = g.Pricing, I = g.Drilling._internals;
const dump = JSON.parse(fs.readFileSync(path.join(__dirname, 'teste-base-canto-90.dump.json'), 'utf8'));
const ref = dump.modulos.find((m) => m.slug === 'base.canto90.feet45').pecas;
const pat = (nome) => (ref.find((r) => r.reference_override === nome) || {}).drilling_pattern_id || null;

let falhas = 0;
const ok = (c, msg) => { console.log((c ? '  OK   ' : '  FALHA') + ' ' + msg); if (!c) falhas++; };
const perto = (a, b, t) => Math.abs(a - b) <= (t || 0.06);
const E = 19.5;

// ---- as linhas da migration 300 (copiadas) --------------------------------
const K = 'se(menor(533-E,540),270,(533-E)/2)';
const Y_CAB = 'min(1910+45,H-2*E-150)', Y_MEIO = 'max(min(1910+45,H-2*E-150)-1000-E,76+E+150)';
const L = (ref, role, w, h, d, x, y, z, prog, extra) => Object.assign({ reference: ref, position_role: role,
  width_formula: w, height_formula: h, depth_formula: d, offset_x_formula: x, offset_y_formula: y, offset_z_formula: z,
  drilling_pattern_id: prog, rotation_y_deg: 0, shape_type: 'box', origin: 'fabricacao' }, extra || {});
const TB_E = pat('Base B (asa em Z)'), TB_D = pat('Base A (asa em X)');
const linhas = [
  L('Fundo (trás)', 'back', 'W-2*E', 'H', 'E', 'E', '0', '0', pat('Fundo (trás)')),
  L('Fundo (esquerda)', 'left', 'E', 'H', 'D-E', '0', '0', '0', pat('Fundo (esquerda)')),
  L('Lateral A (asa em X)', 'right', 'E', 'H', '533', 'W-E', '0', '0', null),
  L('Lateral B (asa em Z)', 'back', '533', 'H', 'E', '0', '0', 'D-E', null),
  L('Base B (asa em Z)', 'bottom', '513-E', 'E', 'D-2*E', 'E', '76', 'E', TB_E),
  L('Base A (asa em X)', 'bottom', 'W-E-513', 'E', '513-E', '513', '76', 'E', TB_D),
  L('Prateleira do meio B (asa em Z)', 'free', '533-E', 'E', 'D-2*E', 'E', Y_MEIO, 'E', TB_E),
  L('Prateleira do meio A (asa em X)', 'free', 'W-E-533', 'E', '533-E', '533', Y_MEIO, 'E', TB_D),
  L('Prateleira do cabide B (asa em Z)', 'free', '533-E', 'E', 'D-2*E', 'E', Y_CAB, 'E', TB_E),
  L('Prateleira do cabide A (asa em X)', 'free', 'W-E-533', 'E', '533-E', '533', Y_CAB, 'E', TB_D),
  L('Base superior B (asa em Z)', 'top', '533-E', 'E', 'D-2*E', 'E', 'H-E', 'E', TB_E),
  L('Base superior A (asa em X)', 'top', 'W-E-533', 'E', '533-E', '533', 'H-E', 'E', TB_D),
  L('Toe 3 · frente A (asa em X)', 'baseboard', 'W-E-513', '76', 'E', '513', '0', '513-E', null),
  L('Toe 3 · frente B (asa em Z)', 'free', 'E', '76', 'D-3*E', '513-E', '0', '2*E', null),
  L('Toe 3 · fundo (asa em X)', 'baseboard', 'W-3*E', '76', 'E', '2*E', '0', 'E', null),
  L('Toe 3 · fundo (asa em Z)', 'free', 'E', '76', 'D-2*E', 'E', '0', 'E', null),
  L('Cabide A (asa em X)', 'free', 'W-2*E-19-' + K, '30', '15', 'E+' + K + '+15', Y_CAB + '-60', 'E+' + K + '-7.5', null, { shape_type: 'oval_rod', origin: 'comprado' }),
  L('Cabide B (asa em Z)', 'free', 'D-2*E-19-' + K, '30', '15', 'E+' + K + '-7.5', Y_CAB + '-60', 'E+' + K + '+15', null, { shape_type: 'oval_rod', origin: 'comprado', rotation_y_deg: 90 }),
  L('Suporte em L do cabide (asa em X)', 'free', '60', '75', '60', 'E+' + K + '-30', Y_CAB + '-75', 'E+' + K + '-30', null, { shape_type: 'suporte_cabide_canto', origin: 'comprado' })
];

function resolve(lista, W, H, D) {
  return lista.map((r) => {
    const v = { W, H, D, E, N: 1, COUNT: 1 };
    const w = P.evalFormula(r.width_formula, v), h = P.evalFormula(r.height_formula, v), d = P.evalFormula(r.depth_formula, v);
    const v2 = Object.assign({}, v, { w, h, d });
    return { id: r.reference, reference: r.reference, position_role: r.position_role, width_mm: w, height_mm: h, depth_mm: d,
      offset_x_mm: P.evalFormula(r.offset_x_formula, v2), offset_y_mm: P.evalFormula(r.offset_y_formula, v2), offset_z_mm: P.evalFormula(r.offset_z_formula, v2),
      rotation_y_deg: r.rotation_y_deg, recortes: [], drilling_pattern_id: r.drilling_pattern_id, shape_type: r.shape_type, origin: r.origin,
      is_module: false, positioning: null };
  });
}
const settings = { touch_tolerance_mm: 5, counter_face_depth_mm: 12, hinge_enabled: false, hinge_plate_enabled: false, shelf_enabled: true,
  shelf_diameter_mm: 3, shelf_depth_mm: 10, shelf_front_setback_mm: 37, shelf_back_setback_mm: 37, slide_enabled: false };
function furar(parts, W, H, D) {
  const store = new Map();
  I.collectAssembly(store, parts, W, H, D, { holesByPattern: dump.programas, settings });
  const o = {}; store.forEach((hs, p) => { o[p.id] = hs; }); return o;
}
const conta = (hs, tipo) => (hs || []).filter((h) => !tipo || h.tipo === tipo).length;

// ---- detecção pelo portal ----------------------------------------------------
console.log('\n== detecção ==');
ok(P.canto90TemAsas(linhas), 'é canto 90°');
ok(P.canto90PadraoDe(linhas) === 533, 'padrão da asa lido do módulo = 533 (deu ' + P.canto90PadraoDe(linhas) + ')');
ok(!P.canto90TemPorta(linhas), 'sem porta (faixa de closet)');
ok(P.canto90TemCabide(linhas), 'tem cabide (altura editável)');
ok(P.applyCanto90Asas(linhas, {}) === linhas && P.applyCanto90Asas(linhas, { __canto90: { asa_a_mm: 533, asa_b_mm: 533 } }) === linhas, 'sem ajuste = MESMA lista');
const fx = P.canto90FaixaAsa(1067, { semPorta: true });
ok(fx.min === 300 && fx.max === 767, 'faixa da asa com 1067: 300 a 767 (deu ' + JSON.stringify(fx) + ')');

[[1000, 2400, 1000, null, null, null], [1039, 2400, 1000, 450, 650, 1700], [1000, 2000, 1000, null, null, null], [1039, 2700, 900, 600, 700, null], [1039, 2700, 1019, null, null, null]]
  .forEach(([W, H, D, A, B, CAB]) => {
    const asaA = A || 533, asaB = B || 533;
    const ov = (A || CAB) ? { __canto90: Object.assign({}, A ? { asa_a_mm: A, asa_b_mm: B } : {}, CAB ? { cabide_mm: CAB } : {}) } : {};
    console.log('\n== ' + W + ' × ' + H + ' × ' + D + (A ? ' | asas A ' + A + ' / B ' + B : '') + (CAB ? ' | cabide ' + CAB : '') + ' ==');
    const lista = P.applyCanto90Asas(linhas, ov);
    const parts = resolve(lista, W, H, D);
    const p = (r) => parts.find((x) => x.reference === r);
    // 1. casco
    ok(perto(p('Lateral A (asa em X)').depth_mm, asaA) && perto(p('Lateral B (asa em Z)').width_mm, asaB), 'laterais: A ' + p('Lateral A (asa em X)').depth_mm + ', B ' + p('Lateral B (asa em Z)').width_mm);
    const fora = parts.filter((q) => {
      const sx = q.rotation_y_deg ? q.depth_mm : q.width_mm, sz = q.rotation_y_deg ? q.width_mm : q.depth_mm;
      return q.offset_x_mm < -0.01 || q.offset_z_mm < -0.01 || q.offset_y_mm < -0.01 || q.offset_x_mm + sx > W + 0.01 || q.offset_z_mm + sz > D + 0.01 || q.offset_y_mm + q.height_mm > H + 0.01;
    });
    ok(!fora.length, 'nada passa do módulo' + (fora.length ? ' (' + fora.map((q) => q.reference).join(', ') + ')' : ''));
    ok(p('Fundo (trás)').width_mm <= 1000 && p('Fundo (esquerda)').depth_mm <= 1000, 'fundos cabem na máquina (≤ 1000): ' + p('Fundo (trás)').width_mm + ' / ' + p('Fundo (esquerda)').depth_mm);
    // 2. bases
    ['Base', 'Prateleira do meio', 'Prateleira do cabide', 'Base superior'].forEach((n) => {
      const bb = p(n + ' B (asa em Z)'), ba = p(n + ' A (asa em X)');
      ok(perto(bb.offset_x_mm + bb.width_mm, ba.offset_x_mm) && perto(ba.offset_x_mm + ba.width_mm, W - E) && perto(bb.offset_z_mm + bb.depth_mm, D - E),
        n + ': B de x=' + E + ' a ' + (bb.offset_x_mm + bb.width_mm) + ', A até a lateral A (' + (ba.offset_x_mm + ba.width_mm) + ')');
    });
    // 3./4. cabides e suporte
    const pc = p('Prateleira do cabide A (asa em X)'), ca = p('Cabide A (asa em X)'), cb = p('Cabide B (asa em Z)'), su = p('Suporte em L do cabide (asa em X)');
    const kA = (asaA - E) < 540 ? 270 : (asaA - E) / 2, kB = (asaB - E) < 540 ? 270 : (asaB - E) / 2;
    ok(perto(ca.offset_z_mm + 7.5, E + kA) && perto(cb.offset_x_mm + 7.5, E + kB), 'cabides a ' + kA + ' / ' + kB + ' do fundo (centro)');
    ok(perto(ca.offset_x_mm + ca.width_mm, W - E - 4) && perto(cb.offset_z_mm + cb.width_mm, D - E - 4), 'cabides param 4 mm antes da lateral A e da lateral B');
    ok(perto(ca.offset_x_mm, E + kB + 15) && perto(cb.offset_z_mm, E + kA + 15), 'ponta de dentro de cada cabide entra no suporte (15 do centro)');
    ok(perto(ca.offset_y_mm, cb.offset_y_mm) && perto(ca.offset_y_mm + 60, pc.offset_y_mm), 'os 2 cabides na mesma altura, 60 abaixo da prateleira do cabide');
    const centro = ca.offset_y_mm + 15;
    if (CAB) ok(perto(centro, CAB), 'altura do cabide editada: centro a ' + centro);
    else if (H >= 2400) ok(perto(centro, 1910), 'cabide no padrão: centro a 1910 do chão (deu ' + centro + ')');
    else ok(centro <= H - 2 * E - 150 - 45 + 0.01, 'altura mínima: cabide desce pra caber (centro ' + centro + ', maleiro ' + (H - E - pc.offset_y_mm - E) + ')');
    ok(perto(su.offset_y_mm + su.height_mm, pc.offset_y_mm) && perto(su.offset_x_mm + 30, E + kB) && perto(su.offset_z_mm + 30, E + kA), 'suporte em L encostado embaixo da prateleira, no encontro dos cabides');
    const pm = p('Prateleira do meio A (asa em X)');
    ok(perto(pc.offset_y_mm - (pm.offset_y_mm + E), 1000) || pm.offset_y_mm === 76 + E + 150, 'prateleira do meio 1000 abaixo da do cabide (vão ' + (pc.offset_y_mm - pm.offset_y_mm - E) + ')');
    ok(perto(p('Base superior A (asa em X)').offset_y_mm, H - E), 'base de cima no topo');
    // 5. furação
    const f = furar(parts, W, H, D);
    ok(conta(f['Lateral A (asa em X)'], 'suporte_cabide') === 1, 'lateral A: 1 furo do suporte do cabide (deu ' + conta(f['Lateral A (asa em X)'], 'suporte_cabide') + ')');
    ok(conta(f['Lateral B (asa em Z)'], 'suporte_cabide') === 1, 'lateral B: 1 furo do suporte do cabide B (deu ' + conta(f['Lateral B (asa em Z)'], 'suporte_cabide') + ')');
    const sB = (f['Lateral B (asa em Z)'] || []).find((h) => h.tipo === 'suporte_cabide');
    const sA = (f['Lateral A (asa em X)'] || []).find((h) => h.tipo === 'suporte_cabide');
    if (sB && sA) ok(sB.face === sA.face && sB.diameter === 3, '  ...mesma face do furo da lateral A (' + sB.face + '), Ø' + sB.diameter + ', y ' + Math.round(sB.y) + ' x ' + Math.round(sB.x));
    ok(['Fundo (trás)', 'Fundo (esquerda)'].every((n) => conta(f[n], 'suporte_cabide') === 0), 'nenhum furo de cabide nos fundos');
    ['Base', 'Prateleira do meio', 'Prateleira do cabide', 'Base superior'].forEach((n) => {
      const jb = conta(f[n + ' B (asa em Z)'], 'contrafuro_borda');
      ok(jb >= 2, n + ' B recebe contra-furo na BORDA vindo da A (deu ' + jb + ')');
    });
    ok(conta(f['Lateral A (asa em X)'], 'contrafuro_face') >= 8, 'lateral A recebe os contra-furos das 4 bases A (deu ' + conta(f['Lateral A (asa em X)'], 'contrafuro_face') + ')');
    ok(conta(f['Lateral B (asa em Z)'], 'contrafuro_face') >= 8, 'lateral B recebe os contra-furos das 4 bases B (deu ' + conta(f['Lateral B (asa em Z)'], 'contrafuro_face') + ')');
    ok(!f['Suporte em L do cabide (asa em X)'] && !f['Cabide A (asa em X)'] && !f['Cabide B (asa em Z)'], 'item comprado (cabide/suporte) não recebe furo');
  });

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo OK');
process.exit(falhas ? 1 : 0);
