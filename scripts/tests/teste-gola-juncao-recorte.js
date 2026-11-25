/* Bancada da gola do meio UNIDA com o vizinho (24/11): a vista do módulo da
 * direita sai da produção, mas o C das laterais dele fica.
 * `node scripts/tests/teste-gola-juncao-recorte.js` */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const g = { console, supabaseClient: null }; g.window = g; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/pricing.js'), 'utf8'), g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/module-pieces.js'), 'utf8') + '\n;this.ap=applyPieceAdjustmentsDeep;this.rv=resolvePiecesForViewer;this.fr=filterRemovedPiecesDeep;', g);
let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d ? '  [' + d + ']' : '')); if (!c) falhas++; };
const peca = (id, role, w, h, d, ox, oy, oz, extra) => Object.assign({ id, reference: id, color_role_id: 'cx', quantity: 1, is_module: false, position_role: role,
  width_formula: w, height_formula: h, depth_formula: d, offset_x_formula: ox, offset_y_formula: oy, offset_z_formula: oz,
  area_m2_formula: 'w*h/1000000', edge_band_linear_m_formula: '0' }, extra || {});
// casco simples 800 × 762 × 609 + gola do meio (vista com recorte_casco) + ripa
const pecas = [
  peca('lat-e', 'left', '19.5', 'H', 'D', '0', '0', '0'),
  peca('lat-d', 'right', '19.5', 'H', 'D', 'W-19.5', '0', '0'),
  peca('lay:g:1', 'free', '800', '76', '19', '0', '315', '570', { recorte_casco: { h: 76, d: 40 }, auto_join_adjacent: true }),
  peca('lay:g:2', 'free', '800', '19', '20', '0', '315', '589', { auto_join_adjacent: true })
];
const dims = { W: 800, H: 762, D: 609 };
const cor = { cx: { id: 'c', sheet_price_per_m2: 100, edge_price_per_linear_m: 0 } };
const C = (parts) => parts.filter((p) => p.position_role === 'left' || p.position_role === 'right')
  .map((p) => (p.recortes || []).filter((r) => r.canto === 'frente-meio').length);

const normal = g.rv(pecas, dims, cor, {}, {}, {});
ok('módulo sozinho: as 2 laterais com o C da gola', C(normal).join() === '1,1', C(normal).join());

// o que a junção fazia antes: tirava a vista → lateral sem C
const antes = g.rv(g.fr(pecas, ['lay:g:1', 'lay:g:2']), dims, cor, {}, {}, {});
ok('(antes) vista removida: lateral perdia o C', C(antes).join() === '0,0', C(antes).join());

// agora: vista "só o recorte" + ripa removida
const prod = g.ap(g.fr(pecas, ['lay:g:2']), { 'lay:g:1': { so_recorte: true } });
const partes = g.rv(prod, dims, cor, {}, {}, {});
ok('vista só-recorte: as 2 laterais continuam com o C', C(partes).join() === '1,1', C(partes).join());
ok('vista só-recorte não aparece nas peças (3D/.ban/corte)', !partes.some((p) => p.id === 'lay:g:1' || p.reference === 'lay:g:1'));
ok('ripa removida de verdade', !partes.some((p) => p.reference === 'lay:g:2'));
const preco = g.Pricing.calculateModulePrice({ module: { id: 'm' }, pieces: prod, colorsByRole: cor, width_mm: 800, height_mm: 762, depth_mm: 609, markupMultiplier: 1 });
ok('vista só-recorte fora do preço/breakdown', !preco.breakdown.some((b) => b.reference === 'lay:g:1'), preco.breakdown.map((b) => b.reference).join(','));
// so_recorte em peça sem recorte_casco não faz nada
const x = g.ap(pecas, { 'lay:g:2': { so_recorte: true } });
ok('so_recorte em peça sem recorte_casco: ignorado', !x[3]._soRecorte);

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
