/* Bancada do VEIO DAS FRENTES por módulo (2026-11-15).
 * `node scripts/tests/teste-veio-frentes.js`
 * dimOverrides.__veio_frentes = { dir: 'horizontal' } marca veio_forcado nas
 * frentes fabricadas (porta lisa, frente de gaveta, frente do Construtor). */
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = path.join(__dirname, '..', '..');
const g = { console }; g.window = g; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/pricing.js'), 'utf8'), g, { filename: 'pricing.js' });
const P = vm.runInContext('Pricing', g);
let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  FALHA') + '  ' + n + (d !== undefined ? '  [' + d + ']' : '')); if (!c) falhas++; };
const pcs = [
  { reference: 'Lateral', position_role: 'left' },
  { reference: 'Porta (1 folha)', position_role: 'front', is_module: true, child_pieces: [{ reference: 'Porta', position_role: 'other' }, { reference: 'Dobradiça', origin: 'comprado' }] },
  { reference: 'Gaveta', is_module: true, position_role: 'other', child_pieces: [{ reference: 'Frente', position_role: 'front' }, { reference: 'Lado', position_role: 'drawer_side' }] },
  { reference: 'Shaker', position_role: 'front', is_module: true, child_pieces: [{ reference: 'Montante' }, { reference: 'Travessa' }, { reference: 'Almofada' }] },
  { reference: 'Frente Construtor', position_role: 'free', _layoutKind: 'front', positioning: 'vertical_no_plano' }
];
const flat = (l, o = {}) => { l.forEach((p) => { if (p.child_pieces) flat(p.child_pieces, o); else o[p.reference] = p.veio_forcado || null; }); return o; };
const m = flat(P.applyVeioFrentes(pcs, { __veio_frentes: { dir: 'horizontal' } }));
ok('porta lisa (módulo de 1 chapa) deita', m['Porta'] === 'horizontal');
ok('frente de gaveta deita', m['Frente'] === 'horizontal');
ok('frente do Construtor deita', m['Frente Construtor'] === 'horizontal');
ok('lateral, lado da gaveta e ferragem não mudam', !m['Lateral'] && !m['Lado'] && !m['Dobradiça']);
ok('porta de moldura (Shaker) não muda', !m['Montante'] && !m['Travessa'] && !m['Almofada']);
ok('sem a chave = MESMA lista', P.applyVeioFrentes(pcs, {}) === pcs && P.applyVeioFrentes(pcs, null) === pcs);
const d = { width_mm: 400, height_mm: 700, depth_mm: 19 };
ok('porta 400×700: padrão = veio na altura', P.grainAxisForPiece({ position_role: 'front' }, d) === 'h', P.grainAxisForPiece({ position_role: 'front' }, d));
ok('porta 400×700: forçado = veio na largura', P.grainAxisForPiece({ position_role: 'front', veio_forcado: 'horizontal' }, d) === 'w');
ok('frente do Construtor forçada = largura (vence o positioning)', P.grainAxisForPiece({ position_role: 'free', positioning: 'vertical_no_plano', veio_forcado: 'horizontal' }, d) === 'w');
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo OK');
process.exit(falhas ? 1 : 0);
