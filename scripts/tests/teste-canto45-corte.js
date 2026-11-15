/* Bancada do CORTE DO CANTO 45° por módulo (2026-11-15, seta da porta).
 * `node scripts/tests/teste-canto45-corte.js`
 * dimOverrides.__canto45.corte_mm muda a perna do canto: as laterais
 * encurtam/alongam, a porta cresce/diminui, fundos e tamanho do módulo NÃO
 * mudam. Sem a chave (ou 304) sai idêntico a antes. Fórmulas = migration 291. */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const g = { console, supabaseClient: null };
g.window = g; vm.createContext(g);
const load = (f, extra) => vm.runInContext(fs.readFileSync(path.join(R, f), 'utf8') + (extra || ''), g, { filename: f });
load('js/pricing.js');
load('js/module-pieces.js', '\n;this.resolvePiecesForViewer=resolvePiecesForViewer;');
load('js/drilling.js');
const P = g.Pricing, I = g.Drilling._internals;
let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d !== undefined ? '  [' + d + ']' : '')); if (!c) falhas++; };
const perto = (a, b, t) => Math.abs(a - b) <= (t || 0.05);

const E = 19.5;
const f = (id, role, w, h, d, ox, oy, oz, extra) => Object.assign({ id, piece_id: id, reference: id, quantity: 1, is_module: false, origin: 'fabricacao',
  position_role: role, color_role_id: 'caixa', width_formula: w, height_formula: h, depth_formula: d,
  offset_x_formula: ox || '0', offset_y_formula: oy || '0', offset_z_formula: oz || '0',
  area_m2_formula: 'w*h/1000000', edge_band_linear_m_formula: '0', labor_cost_per_unit: 1 }, extra || {});
const row = (face, x, y, d, depth, cd, cdepth) => ({ face, x_formula: x, y_formula: y, diameter_mm: d, depth_formula: depth, repeat_count_formula: '1', counter_diameter_mm: cd || null, counter_depth_mm: cdepth || null });
const TB45 = [
  row('face', 'C-24', '(L-304+E)-50', 12, '13'), row('face', '(C-304+E)-50', 'L-(24)', 12, '13'),
  row('borda_dir', '0', '(L-304+E)-50', 8, '22', 5, 12), row('borda_dir', '0', '(L-304+E)-114', 8, '22', 8, 22),
  row('borda_inf', '(C-304+E)-50', 'L', 8, '22', 5, 12), row('borda_inf', '(C-304+E)-114', 'L', 8, '22', 8, 22)
];
const pecas = [
  f('fundo_tras', 'back', 'W-2*E', 'H', 'E', 'E'),
  f('fundo_esq', 'left', 'E', 'H', 'D-E'),
  f('lat_dir', 'right', 'E', 'H', 'D-304', 'W-E'),
  f('lat_fe', 'back', 'W-304', 'H', 'E', '0', '0', 'D-E'),
  f('base', 'bottom', 'W-2*E', 'E', 'D-2*E', 'E', '0', 'E', { shape_type: 'chanfro45', drilling_pattern_id: 'tb45' }),
  f('prat', 'shelf', 'W-2*E', 'E', 'D-2*E', '0', '0', '0', { shape_type: 'chanfro45_reg' }),
  f('porta', 'free', '(304-E)*1.41421-2', 'H-4', 'E',
    '(W-E+(W-304))/2+0.35355*E-0.7071*(304-E)+1', '2', '(D-E+(D-304))/2-0.14645*E', { rotation_y_deg: 45 }),
  f('pe', 'leg', '50', '114', '50', 'se(menor(N,5),0,-304)', '0', 'se(menor(N,4),0,se(menor(N,5),-304,0))', { quantity: 5 })
];
const cores = { caixa: { id: 'c', name: 'Branco', sheet_price_per_m2: 10, edge_price_per_linear_m: 1, espessura_mm: E } };
const W = 913, H = 762, D = 913;
const resolve = (ov, w, d) => g.resolvePiecesForViewer(pecas, { W: w || W, H, D: d || D }, cores, {}, ov || {}, {});
const por = (parts, id) => parts.filter((p) => p.piece_id === id || p.id === id);

console.log('\n— sem a chave / com 304: nada muda');
const a = resolve({}), b = resolve({ __canto45: { corte_mm: 304 } });
const medidas = (ps) => JSON.stringify(ps.map((p) => [p.piece_id, p.width_mm, p.height_mm, p.depth_mm, p.offset_x_mm, p.offset_z_mm]));
ok('304 explícito = igual ao padrão', medidas(a) === medidas(b));
ok('applyCanto45Corte devolve a MESMA lista sem a chave', P.applyCanto45Corte(pecas, {}) === pecas && P.applyCanto45Corte(pecas, null) === pecas);
ok('lista sem chapa chanfrada não é tocada', (function () { const l = [pecas[0], pecas[2]]; return P.applyCanto45Corte(l, { __canto45: { corte_mm: 400 } }) === l; })());
ok('lateral direita 609 e porta 400,3 no padrão', perto(por(a, 'lat_dir')[0].depth_mm, 609) && perto(por(a, 'porta')[0].width_mm, (304 - E) * 1.41421 - 2));

[380, 250, 445].forEach(function (K) {
  console.log('\n— corte ' + K);
  const r = resolve({ __canto45: { corte_mm: K } });
  ok('lateral direita = D − ' + K, perto(por(r, 'lat_dir')[0].depth_mm, D - K), por(r, 'lat_dir')[0].depth_mm);
  ok('lateral da frente = W − ' + K, perto(por(r, 'lat_fe')[0].width_mm, W - K), por(r, 'lat_fe')[0].width_mm);
  ok('porta = (K − E)·√2 − 2', perto(por(r, 'porta')[0].width_mm, P.canto45PortaDoCorte(K, E)), por(r, 'porta')[0].width_mm.toFixed(1));
  ok('fundos e base com a MESMA medida', ['fundo_tras', 'fundo_esq', 'base', 'prat'].every((id) =>
    ['width_mm', 'height_mm', 'depth_mm'].every((k) => perto(por(r, id)[0][k], por(a, id)[0][k]))));
  const base = por(r, 'base')[0];
  const ch = I.chanfroDaPeca(base);
  ok('chanfro da base = K − E nos dois eixos (45°)', ch && perto(ch.cu, K - E) && perto(ch.cv, K - E), ch && ch.cu);
  // porta centrada na diagonal: o centro fica no meio do vão entre as pontas das laterais
  const p = por(r, 'porta')[0];
  ok('porta acompanha a diagonal (X e Z mudaram junto com as laterais)', !perto(p.offset_x_mm, por(a, 'porta')[0].offset_x_mm) && !perto(p.offset_z_mm, por(a, 'porta')[0].offset_z_mm));
  const pes = por(r, 'pe');
  ok('5 pés; o da ponta da lateral acompanha (−' + K + ')', pes.length === 5 && pes.some((x) => perto(x.offset_x_mm, -K) || perto(x.offset_z_mm, -K)), pes.map((x) => x.offset_x_mm + '/' + x.offset_z_mm).join(' '));
  // furação: os furos do trecho reto ficam dentro do trecho reto
  const store = new Map();
  I.collectAssembly(store, r, W, H, D, { holesByPattern: { tb45: TB45 }, settings: { touch_tolerance_mm: 5, counter_face_depth_mm: 12, shelf_enabled: false, hinge_enabled: false, slide_enabled: false } });
  const furosBase = store.get(base) || [];
  const t = ch.t;
  const faces = furosBase.filter((h) => h.face === 'face' || !h.face || /cima|baixo|top|bottom/i.test(String(h.face)));
  ok('base tem furos', furosBase.length > 0, furosBase.length);
  const lat = store.get(por(r, 'lat_dir')[0]) || [];
  ok('contra-furos na lateral direita dentro dela (' + (D - K) + ')', lat.length > 0 && lat.every((h) => h.y <= (D - K) + 0.01 && h.y >= -0.01 && h.x >= -0.01), lat.map((h) => h.x.toFixed(0) + ',' + h.y.toFixed(0)).join(' '));
  const lfe = store.get(por(r, 'lat_fe')[0]) || [];
  ok('contra-furos na lateral da frente dentro dela (' + (W - K) + ')', lfe.length > 0 && lfe.every((h) => h.x <= (W - K) + 0.01 && h.y <= (W - K) + 0.01), lfe.map((h) => h.x.toFixed(0) + ',' + h.y.toFixed(0)).join(' '));
});

console.log('\n— preço e faixa');
const preco = (ov) => P.calculateModulePrice({ module: { id: 'm' }, colorsByRole: cores, width_mm: W, height_mm: H, depth_mm: D, markupMultiplier: 1, pieces: pecas, dimOverrides: ov || {} });
const p0 = preco({}), p1 = preco({ __canto45: { corte_mm: 440 } });
const acha = (r, id) => (r.breakdown || []).find((x) => x && x.piece_id === id);
ok('preço: porta maior no breakdown', acha(p1, 'porta') && acha(p0, 'porta') && acha(p1, 'porta').width_mm > acha(p0, 'porta').width_mm + 100, acha(p1, 'porta') && acha(p1, 'porta').width_mm);
ok('preço: lateral menor no breakdown', acha(p1, 'lat_dir') && perto(acha(p1, 'lat_dir').depth_mm, D - 440), acha(p1, 'lat_dir') && acha(p1, 'lat_dir').depth_mm);
const fx = P.canto45FaixaCorte(913, 913, E);
ok('faixa 913×913: porta de 300 a 600', perto(P.canto45PortaDoCorte(fx.min, E), 300, 0.1) && perto(P.canto45PortaDoCorte(fx.max, E), 600, 0.1), fx.min.toFixed(1) + '..' + fx.max.toFixed(1));
const fy = P.canto45FaixaCorte(560, 913, E);
ok('faixa 560×913: lateral nunca menor que 150', perto(fy.max, 560 - 150), fy.max);

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\ntudo passou');
process.exit(falhas ? 1 : 0);
