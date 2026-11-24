// Bancada da gola em cima (23/11): vão embaixo da gola e porta/frente até 30 mm do topo.
// node scripts/tests/teste-gola-porta.js   (só o layout-engine de verdade, sem jsdom)
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const R = path.join(__dirname, '..', '..');
const g = { console }; vm.createContext(g);
vm.runInContext(fs.readFileSync(path.join(R, 'js/layout-engine.js'), 'utf8') + '\n;this.LayoutEngine=LayoutEngine;', g);
const LE = g.LayoutEngine;
let falhas = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) falhas++; };
const cat = {
  porta: { id: 'porta', name: 'Porta Giro Externa', role: 'front', door_position: 'externa', door_mechanism: 'porta_giro', params: { lado: 'left', sobrepoe: true } },
  prat: { id: 'prat', name: 'Base Divisória', role: 'split', axis: 'y', espessura: null, params: {} }
};
// módulo 800 × 900: zona 19,5..780,5 em x; 133,5 até embaixo da gola (900 − 76 = 824)
const zona = { x: 19.5, y: 133.5, z: 19.5, w: 761, h: 824 - 133.5, d: 539.5, temFundo: true };
const opts = (gola) => ({ catalogo: cat, espessura: 19.5, espessuraCasco: 19.5, folgaDobradica: 2, temFundo: true, golaFrenteTopo: gola ? 870 : 0 });
const portaRaiz = () => LE.newVoid({ fronts: [{ acc: 'porta', params: {}, from: null, to: null }] });
const frente = (b) => b.pieces.filter((p) => p.kind === 'front');
let sem = frente(LE.build(portaRaiz(), zona, opts(false)));
let com = frente(LE.build(portaRaiz(), zona, opts(true)));
ok(sem.length >= 1 && com.length >= 1, 'porta gerada nos dois casos');
const topo = (l) => Math.max.apply(null, l.map((p) => p.y + p.h));
const base = (l) => Math.min.apply(null, l.map((p) => p.y));
ok(Math.abs(topo(com) - 870) < 0.01, 'com gola: topo da porta = 900 − 30 = 870 (' + topo(com).toFixed(1) + ')');
ok(topo(sem) < 870, 'sem o opt: porta para no vão (' + topo(sem).toFixed(1) + ') — nada muda pra quem não é gola');
ok(Math.abs(base(com) - base(sem)) < 0.01, 'a base da porta não muda');
// porta num vão de BAIXO (não encosta no topo): não mexe
const r2 = LE.newVoid(); r2.splitAxis = 'y'; r2.splitAcc = 'prat';
r2.children = [LE.newVoid({ fronts: [{ acc: 'porta', params: {}, from: null, to: null }] }), LE.newVoid()];
const baixo = frente(LE.build(r2, zona, opts(true)));
ok(baixo.length && topo(baixo) < 600, 'porta de um vão que não encosta no topo: não sobe (' + (baixo.length ? topo(baixo).toFixed(1) : '-') + ')');
// regra de fábrica ganha
const r3 = portaRaiz(); r3.params = { frente_topo_abaixo_casco_mm: 10 };
const fab = frente(LE.build(r3, zona, opts(true)));
ok(Math.abs(topo(fab) - 870) > 1, 'árvore com frente_topo_abaixo_casco_mm: vale a regra da fábrica, não a da gola (' + topo(fab).toFixed(1) + ')');
console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
